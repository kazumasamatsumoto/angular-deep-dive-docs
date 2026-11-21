[目次](../README.md) › [platform の説明文の読み残し](README.md) › 第 4 回 / 全 7 回

# Meta・Title・enableDebugTools・Safe\* の説明文

> platform-browser/src/browser/meta.ts・title.ts・tools/\*・security/dom\_sanitization\_service.ts の未読の説明文：Meta の selector の形（updateTag・removeTag の形は例外になる）と addTag・updateTag・removeTag を本物の head で、Title、enableDebugTools と profiler.timeChangeDetection が zoneless で何を測るか、Safe\* の印の型。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-meta-tools)

---

この章で分かること：`Meta`・`MetaDefinition`・`Title`、`enableDebugTools` と `ng.profiler.timeChangeDetection`、`SafeHtml` ほかの印の型の説明文が約束していることを、このページの本物の `<head>` と、Node で動かした記録で確かめます。結果として、`updateTag` と `removeTag` の説明文が書く selector の形（バッククォートで囲む）はブラウザーで例外になること、`updateTag` は無ければ作ること、`addTag` は name も property も無い定義を探さずに 2 つ目を作ること、zoneless のアプリの `timeChangeDetection` は「今の画面の 1 回の変更検知」を測っていないことが、説明文と合いませんでした。

読む対象は `packages/platform-browser/src/browser/` の `meta.ts`・`title.ts`・`tools/tools.ts`・`tools/common_tools.ts` と、`security/dom_sanitization_service.ts` の頭の印の型、`errors.ts` の残りです（../angular、8576f161ae4）。`Meta` と `Title` の動く行は[Title と Meta の章](../domr/19-domr-title-meta.md)が別の Document の上で読み、`DomSanitizer` のメソッドの説明文は[サニタイズの説明文の章](../cra/09-cra-sanitize.md)が読んでいるので、ここでは繰り返さずに行だけ指します。

1. [1. bootstrapApplication](01-pbd-browser.md)
2. [2. provideClientHydration](02-pbd-hydration.md)
3. [3. レンダラーとイベント](03-pbd-dom.md)
4. **4. Meta・Title・tools**（この章）
5. [5. platform-server](05-pbd-server.md)
6. [6. platform-browser-dynamic](06-pbd-dynamic.md)
7. [7. spec と issue](07-pbd-tests-issues.md)

アプリは `<body>` の中の 1 つの要素に描かれるので、`<head>` の `<meta>` と `<title>` はテンプレートから書けません。代わりに書くのが `Meta` と `Title` の 2 つのサービスです。この章のデモは、このページの本物の `<head>` に書き、作った `<meta>` は最後に外し、題は元に戻します。

## 1. MetaDefinition と Meta の説明文：selector の形

📄 `angular/packages/platform-browser/src/browser/meta.ts` L14–23 （▶ の行: 15–17）

```ts
14 │ /**
15 ▶  * Represents the attributes of an HTML `<meta>` element. The element itself is
16 ▶  * represented by the internal `HTMLMetaElement`. Event handler attributes, which start with
17 ▶  * `on`, are not allowed.
18 │  *
19 │  * @see [HTML meta tag](https://developer.mozilla.org/docs/Web/HTML/Element/meta)
20 │  * @see {@link Meta}
21 │  *
22 │  * @publicApi
23 │  */
```

16〜17 行目「`on` で始まるイベントの属性は使えない」は、DEMO の「Meta」の表の `addTag({name: 'pbdm-on', onclick: 'x'})` で、本番のこのページは「NG05203」だけの例外、`<meta>` の数は変わりませんでした（開発モードの記録は「The Meta service does not allow setting event handler attribute 'onclick' for security reasons.」が付く）。確かめる行と、足した 6f9a6bea509（issue #70126）は[Title と Meta の章の 4 節](../domr/19-domr-title-meta.md)です。

📄 `angular/packages/platform-browser/src/browser/meta.ts` L38–60 （▶ の行: 42–43, 48–53）

```ts
38 │ 
39 │ /**
40 │  * A service for managing HTML `<meta>` tags.
41 │  *
42 ▶  * Properties of the `MetaDefinition` object match the attributes of the
43 ▶  * HTML `<meta>` tag. These tags define document metadata that is important for
44 │  * things like configuring a Content Security Policy, defining browser compatibility
45 │  * and security settings, setting HTTP Headers, defining rich content for social sharing,
46 │  * and Search Engine Optimization (SEO).
47 │  *
48 ▶  * To identify specific `<meta>` tags in a document, use an attribute selection
49 ▶  * string in the format `"tag_attribute='value string'"`.
50 ▶  * For example, an `attrSelector` value of `"name='description'"` matches a tag
51 ▶  * whose `name` attribute has the value `"description"`.
52 ▶  * Selectors are used with the `querySelector()` Document method,
53 ▶  * in the format `meta[{attrSelector}]`.
54 │  *
55 │  * @see [HTML meta tag](https://developer.mozilla.org/docs/Web/HTML/Element/meta)
56 │  * @see [Document.querySelector()](https://developer.mozilla.org/docs/Web/API/Document/querySelector)
57 │  *
58 │  *
59 │  * @publicApi
60 │  */
```

48〜53 行目は「`<meta>` を見分けるには `"tag_attribute='value string'"` の形の文字列を使い、それを `meta[{attrSelector}]` の形で `querySelector()` に渡す」と書きます。中身は `buildMetaSelector` が `[]` で包むだけで（L180〜182）、文字列はそのまま CSS のセレクタになります。DEMO の表で、このページの `<meta name="viewport">` を探すと、説明文の形 `name='viewport'` も、`name="viewport"`・`name=viewport`・属性だけの `name` も同じ要素を返しました。CSS のセレクタとして正しければ、形は何でもよいということです。

📄 `angular/packages/platform-browser/src/browser/meta.ts` L119–128 （▶ の行: 121, 123–127）

```ts
119 │ 
120 │   /**
121 ▶    * Modifies an existing `<meta>` tag element in the current HTML document.
122 │    * @param tag The tag description with which to replace the existing tag content.
123 ▶    * @param selector A tag attribute and value to match against, to identify
124 ▶    * an existing tag. A string in the format `"tag_attribute=`value string`"`.
125 ▶    * If not supplied, matches a tag with the same `name` or `property` attribute value as the
126 ▶    * replacement tag.
127 ▶    * @return The modified element.
128 │    */
```

ところが 124 行目（と `removeTag` の L143）は形を ``"tag_attribute=`value string`"`` と、値をバッククォートで囲んで書いています。この形のまま ``meta.getTag('name=`viewport`')`` を呼ぶと、このページ（Chrome）では `querySelector` の SyntaxError（「is not a valid selector」）がそのまま投げられました。`Meta` は例外を捕まえません。API リファレンスの Markdown でも、外側の `` ` `` と中の `` ` `` がぶつかってコードの表示が途中で切れます。この 2 か所は 886e3ebcca9（2020-05-18、docs: update api ref doc for platform browser (#37186)）で、ほかの 3 か所（L49・L99・L111）を `'value string'` にしたのと同じコミットで書かれ、新しい本家（origin/main の d201dd76ef2、2026-11-19。以下「新しい本家」）でも同じです。

同じ表で、`property` の値に `:` を含む `og:pbdm-title` は、引用符ありで見つかり、引用符なし（`property=og:pbdm-title`）は同じ SyntaxError でした。`:` は CSS の識別子に使えないからです。説明文が引用符つきの形を勧めるのは、この意味では正しい書き方です。

## 2. addTag・addTags・updateTag・removeTag の約束

📄 `angular/packages/platform-browser/src/browser/meta.ts` L81–95 （▶ の行: 83–85, 87–88, 90, 92–93）

```ts
81 │ 
82 │   /**
83 ▶    * Retrieves or creates a set of `<meta>` tag elements in the current HTML document.
84 ▶    * In searching for an existing tag, Angular attempts to match the `name` or `property` attribute
85 ▶    * values in the provided tag definition, and verifies that all other attribute values are equal.
86 │    * @param tags An array of tag definitions to match or create.
87 ▶    * @param forceCreation True to create new elements without checking whether they already exist.
88 ▶    * @returns The matching elements if found, or the new elements.
89 │    */
90 ▶   addTags(tags: MetaDefinition[], forceCreation: boolean = false): HTMLMetaElement[] {
91 │     return tags
92 ▶       .filter((tag): tag is MetaDefinition => !!tag)
93 ▶       .map((tag) => this._getOrCreateElement(tag, forceCreation));
94 │   }
95 │ 
```

`addTag` の説明文（L67〜76）と 83〜85 行目の `addTags` は「`name` か `property` で探し、ほかの属性もすべて同じなら返す」と書きます。DEMO の表では、同じ定義の `addTag` を 2 回呼ぶと同じ要素が返り（変更もされない）、`content` だけ違う定義は 2 つ目を作り、`addTags` の 1 つ目は前の要素、87 行目の `forceCreation` を true にすると確かめずに 3 つ目を作りました。92 行目のとおり、配列の中の `null` や `undefined` は黙って飛ばします（型は許さない）。

説明文に合わないのは、`name` も `property` も無い定義です。このページには `<meta charset="utf-8">` があるのに、`addTag({charset: 'utf-8'})` は探さずに 2 つ目を作りました（`<meta charset>` の数 1 → 2。デモで作ったものはすぐ外します）。探すセレクタを作る `parseSelector` が「name が無ければ property」と決めていて（L201〜204）、`property="undefined"` を探すからです。同じことは `http-equiv` や `itemprop` だけの定義でも起き、別の Document で確かめた形は[Title と Meta の章の 4 節](../domr/19-domr-title-meta.md)にあります。

121 行目「既にある `<meta>` を書き換える」と 127 行目「書き換えた要素を返す」も、半分です。`updateTag({name: 'pbdm-none', content: 'x'})` は当たる要素が無いので、新しく作って返しました（`<meta>` の数が 1 増える）。L137 の `this._getOrCreateElement(tag, true)` で、spec の should create meta tag if it does not exist（meta\_spec.ts L140）もこの振る舞いを固めています。振る舞いは意図どおりで、説明文が書いていないだけです。selector を渡さない `updateTag` は、同じ name の要素が 3 つあれば最初の 1 つだけを書き換えました（L132 の `getTag` は `querySelector`）。`removeTag` も最初の 1 つだけを外し、当たる要素が無くても例外になりません（L146 の `!` のあと、L154 の `if (meta)`）。

## 3. Title：書く先は inject した Document

title.ts の説明文と 2 つのメソッドは、ライセンスと import の行（L1〜11）のほかは[Title と Meta の章の 1 節](../domr/19-domr-title-meta.md)が全部引いています。DEMO の「Title」の表で、このページの `Title` に `setTitle('pbdm 仮の題')` を呼ぶと `document.title` と `getTitle()` が同じ文になり、`''` と、型を外して渡した `null` はどちらも空の題でした（L37 の `newTitle || ''`）。最後に呼ぶ前の題に戻し、元と同じになったことを表の最後の行で確かめています。このサイトの題はルーターが `Title` で書いているので（`title` を持つルート）、ページを移ると上書きされます。

## 4. enableDebugTools と ng.profiler：zoneless では何を測るか

📄 `angular/packages/platform-browser/src/browser/tools/tools.ts` L15–42 （▶ の行: 15, 18–19, 24–25, 30–32, 36, 40–41）

```ts
15 ▶ const PROFILER_GLOBAL_NAME = 'profiler';
16 │ 
17 │ /**
18 ▶  * Enabled Angular debug tools that are accessible via your browser's
19 ▶  * developer console.
20 │  *
21 │  * Usage:
22 │  *
23 │  * 1. Open developer console (e.g. in Chrome Ctrl + Shift + j)
24 ▶  * 1. Type `ng.` (usually the console will show auto-complete suggestion)
25 ▶  * 1. Try the change detection profiler `ng.profiler.timeChangeDetection()`
26 │  *    then hit Enter.
27 │  *
28 │  * @publicApi
29 │  */
30 ▶ export function enableDebugTools<T>(ref: ComponentRef<T>): ComponentRef<T> {
31 ▶   exportNgVar(PROFILER_GLOBAL_NAME, new AngularProfiler(ref));
32 ▶   return ref;
33 │ }
34 │ 
35 │ /**
36 ▶  * Disables Angular tools.
37 │  *
38 │  * @publicApi
39 │  */
40 ▶ export function disableDebugTools(): void {
41 ▶   exportNgVar(PROFILER_GLOBAL_NAME, null);
42 │ }
```

18〜19 行目「ブラウザーの開発者のコンソールから使える道具を有効にする」の中身は、31 行目で `new AngularProfiler(ref)` を `exportNgVar('profiler', …)`（dom/util.ts、[前の章の 5 節](03-pbd-dom.md)）で `window.ng.profiler` に置くだけで、32 行目のとおり `ref` をそのまま返します。18 行目は Enables の綴りが Enabled になっています。記録では、開発モードの `window.ng` にはもう core の道具（`getComponent` ほか）が 23 個あり、`profiler` が足されて 24 個になりました。本番には core の道具が無いので（core の application\_ref.ts L66〜68 が `ngDevMode` のときだけ出す）、24 行目の「`ng.` と打つと候補が出る」の候補は `profiler` だけです。41 行目の `disableDebugTools()` は `ng.profiler` を null にするだけで、キーは残りました。

📄 `angular/packages/platform-browser/src/browser/tools/common_tools.ts` L11–28 （▶ の行: 19–20, 22, 26）

```ts
11 │ export class ChangeDetectionPerfRecord {
12 │   constructor(
13 │     public msPerTick: number,
14 │     public numTicks: number,
15 │   ) {}
16 │ }
17 │ 
18 │ /**
19 ▶  * Entry point for all Angular profiling-related debug tools. This object
20 ▶  * corresponds to the `ng.profiler` in the dev console.
21 │  */
22 ▶ export class AngularProfiler {
23 │   appRef: ApplicationRef;
24 │ 
25 │   constructor(ref: ComponentRef<any>) {
26 ▶     this.appRef = ref.injector.get(ApplicationRef);
27 │   }
28 │ 
```

📄 `angular/packages/platform-browser/src/browser/tools/common_tools.ts` L29–46 （▶ の行: 31–34, 36, 39–40, 43, 46）

````ts
29 │   // tslint:disable:no-console
30 │   /**
31 ▶    * Exercises change detection in a loop and then prints the average amount of
32 ▶    * time in milliseconds how long a single round of change detection takes for
33 ▶    * the current state of the UI. It runs a minimum of 5 rounds for a minimum
34 ▶    * of 500 milliseconds.
35 │    *
36 ▶    * Optionally, a user may pass a `config` parameter containing a map of
37 │    * options. Supported options are:
38 │    *
39 ▶    * `record` (boolean) - causes the profiler to record a CPU profile while
40 ▶    * it exercises the change detector. Example:
41 │    *
42 │    * ```ts
43 ▶    * ng.profiler.timeChangeDetection({record: true})
44 │    * ```
45 │    */
46 ▶   timeChangeDetection(config: any): ChangeDetectionPerfRecord {
````

📄 `angular/packages/platform-browser/src/browser/tools/common_tools.ts` L47–69 （▶ の行: 50–51, 55–57, 63–65, 67）

```ts
47 │     const record = config && config['record'];
48 │     const profileName = 'Change Detection';
49 │     // Profiler is not available in Android browsers without dev tools opened
50 ▶     if (record && 'profile' in console && typeof console.profile === 'function') {
51 ▶       console.profile(profileName);
52 │     }
53 │     const start = performance.now();
54 │     let numTicks = 0;
55 ▶     while (numTicks < 5 || performance.now() - start < 500) {
56 ▶       this.appRef.tick();
57 ▶       numTicks++;
58 │     }
59 │     const end = performance.now();
60 │     if (record && 'profileEnd' in console && typeof console.profileEnd === 'function') {
61 │       console.profileEnd(profileName);
62 │     }
63 ▶     const msPerTick = (end - start) / numTicks;
64 ▶     console.log(`ran ${numTicks} change detection cycles`);
65 ▶     console.log(`${msPerTick.toFixed(2)} ms per check`);
66 │ 
67 ▶     return new ChangeDetectionPerfRecord(msPerTick, numTicks);
68 │   }
69 │ }
```

31〜34 行目は「変更検知をループで回し、今の画面の状態で 1 回の変更検知にかかる時間の平均を出す。最低 5 回・500 ms」と書き、55〜58 行目のとおり `appRef.tick()` を 500 ms を超えるまで呼びます（26 行目の `ApplicationRef`）。DEMO の 4・5 つ目の表は、テンプレートで関数を呼ぶ `ChangeDetectionStrategy.Eager` の子を 200 個描いたアプリで、子のテンプレートが何回評価されたかを数えたものです。

| アプリ | numTicks | 1 回あたり | 子のテンプレートの評価（1 回あたり） |
| --- | --- | --- | --- |
| zoneless・本番 | 1,611,242 | 0.00 ms | 0（何も検査しない） |
| zoneless・開発モード | 11,878 | 0.04 ms | 200（2 回目の検査 `checkNoChanges` だけ） |
| zone.js・本番 | 18,355 | 0.03 ms | 200（全部のビューを検査） |
| zone.js・開発モード | 5,438 | 0.09 ms | 400（検査と `checkNoChanges`） |

zoneless の `tick()` は印（signal の変更や `markForCheck`）の付いたビューしか検査しないので（[tick → synchronize の章](../zoneless/05-zoneless-tick.md)、[ApplicationRef の説明文の章の 4 節](../cra/01-cra-app-ref.md)）、ループの 2 回目からは何も描き直しません。本番で測れたのは「何もしない tick」の速さで、開発モードで測れたのは、印に関係なく付いたビューを全部見る 2 回目の検査の時間でした。zoneless が既定の v21 からは、32〜33 行目の「今の画面の状態での 1 回の変更検知」を、本番でも開発モードでも測っていません。zone.js のアプリでは全部のビューを検査するので、本番の 0.03 ms が説明文どおりの数です。

36〜40 行目の `record` は、50 行目の `console.profile` があるときだけ CPU のプロファイルを録ります。46 行目の引数の型は `config: any` で省略できない書き方ですが、36 行目のとおりコンソールからは省けます（記録では引数なしで動いた）。64〜65 行目の 2 行（「ran N change detection cycles」「0.00 ms per check」）は `console.log` に出るので、このページでは動かさずに記録で見せます。この説明文と 55 行目のループは 8dd6c4680ba（2015-09-04、feat(perf): change detection profiler）からで、新しい本家でも同じです。

## 5. Safe\* の印の型と、errors.ts の残り

📄 `angular/packages/platform-browser/src/security/dom_sanitization_service.ts` L35–54 （▶ の行: 36, 40, 43, 47, 50, 54）

```ts
35 │ /**
36 ▶  * Marker interface for a value that's safe to use in a particular context.
37 │  *
38 │  * @publicApi
39 │  */
40 ▶ export interface SafeValue {}
41 │ 
42 │ /**
43 ▶  * Marker interface for a value that's safe to use as HTML.
44 │  *
45 │  * @publicApi
46 │  */
47 ▶ export interface SafeHtml extends SafeValue {}
48 │ 
49 │ /**
50 ▶  * Marker interface for a value that's safe to use as style (CSS).
51 │  *
52 │  * @publicApi
53 │  */
54 ▶ export interface SafeStyle extends SafeValue {}
```

📄 `angular/packages/platform-browser/src/security/dom_sanitization_service.ts` L56–75 （▶ の行: 57, 61, 64, 68, 71, 75）

```ts
56 │ /**
57 ▶  * Marker interface for a value that's safe to use as JavaScript.
58 │  *
59 │  * @publicApi
60 │  */
61 ▶ export interface SafeScript extends SafeValue {}
62 │ 
63 │ /**
64 ▶  * Marker interface for a value that's safe to use as a URL linking to a document.
65 │  *
66 │  * @publicApi
67 │  */
68 ▶ export interface SafeUrl extends SafeValue {}
69 │ 
70 │ /**
71 ▶  * Marker interface for a value that's safe to use as a URL to load executable code from.
72 │  *
73 │  * @publicApi
74 │  */
75 ▶ export interface SafeResourceUrl extends SafeValue {}
```

platform-browser も 6 つの「印の interface（marker interface）」を自分で宣言していて、中身は core のもの（[サニタイズの説明文の章の 4 節](../cra/09-cra-sanitize.md)）と同じく空です。TypeScript は形で型を比べるので、DEMO の「Safe\*」の表の `const plain: SafeHtml = '<img src=x onerror=alert(1)>'` のように、ただの文字列も型の検査を通ります。実行時の区別は `bypassSecurityTrust*` が包む class でつき、ただの文字列は `sanitize(SecurityContext.HTML, …)` で `<img src="x">` に削られ、`bypassSecurityTrustHtml` の印を `RESOURCE_URL` に渡すと「Required a safe ResourceURL, got a HTML」の例外でした。36 行目「特定の文脈で安全な値の印」の「文脈」は、型ではなく実行時の class のことです。

📄 `angular/packages/platform-browser/src/errors.ts` L25–35 （▶ の行: 26–30, 32–33）

```ts
25 │ 
26 ▶   // Sanitization-related errors (5200-5300 range)
27 ▶   SANITIZATION_UNSAFE_SCRIPT = 5200,
28 ▶   SANITIZATION_UNSAFE_RESOURCE_URL = -5201,
29 ▶   SANITIZATION_UNEXPECTED_CTX = 5202,
30 ▶   INVALID_EVENT_ATTRIBUTE = 5203,
31 │ 
32 ▶   // Animations related errors (5300-5400 range)
33 ▶   ANIMATION_RENDERER_ASYNC_LOADING_FAILURE = 5300,
34 │ }
35 │ 
```

26〜30 行目はサニタイズまわりの番号で、30 行目の `INVALID_EVENT_ATTRIBUTE = 5203` が 1 節の NG05203 です。正の数なので、開発モードの文に「Find more at …」の案内は付きません（案内は負の数のときだけ、core の errors.ts L209〜213。負の `-5201` には adev の NG05201 のページがある）。33 行目の 5300 は animations の番号で、この章の持ち場の外です。

> **🧪 DEMO — このページの &lt;head&gt; に本物の Meta と Title で書く**
>
> 1〜3 つ目のボタンは、このサイトの本物の `Meta`・`Title`・`DomSanitizer`（`inject` したもの）をこのページで呼びます。作る `<meta>` は `name` か `property` が pbdm- で始まるものと、すぐ外す 2 つ目の `<meta charset>` だけで、関数の終わりに全部外し、`<head>` の `<meta>` の数が元に戻ったことを最後の行に出します。題は最後に元へ戻します。  
>  「開発モード（記録）」の列は、同じ関数を Node（domino の上の JIT）で、このサイトの index.html と同じ `<title>` と 2 つの `<meta>` を置いた文書で動かした記録です。domino のセレクタはバッククォートや `:` を例外にしないので、1 節の 2 行はページと記録で違います。4・5 つ目は `enableDebugTools` の記録で、zoneless と zone.js（0.16.2）を読んだ Node です。  
>  本番ビルドの最初に読む JS（Initial total）は、この章を入れても 486.46 kB のままでした（`Meta`・`Title`・`DomSanitizer` はほかの章がもう読んでいる）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-meta-tools)

## ここまでの呼び出し（説明文の形の selector で getTag を呼んだとき）

- 👤 ``meta.getTag('name=`viewport`')``
  - ``buildMetaSelector(attrSelector) → 'meta[name=`viewport`]'`` — meta.ts L104・L180〜182 — *エスケープしない*
  - ``this._doc.querySelector('meta[name=`viewport`]')`` — meta.ts L104
    - `SyntaxError: … is not a valid selector` — ブラウザー — *Meta は捕まえない*

## テストと直し方

| ファイル（packages/platform-browser/test/browser/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `meta_spec.ts` | `Meta service`（15）› `should return meta tag matching selector`（32）・`should update meta tag matching the given selector`（84）・`should create meta tag if it does not exist`（140）ほか、全部で 23 の it | 1・2 節。selector はどれも `name="…"` か `property="…"` の二重引用符で、バッククォートの形も、name も property も無い定義の `addTag` も試していない |
| `meta_spec.ts` | `should not add meta tag if it is already present on the page and has the same attr`（288）・`should add meta tag if it is already present on the page and force true`（318） | 2 節の `addTag` と `forceCreation` |
| `title_spec.ts` | `title service`（15）› `should reset title to empty string if title not provided`（40）ほか 3 つ | 3 節 |
| `tools/tools_spec.ts` | `profiler`（16）› `should time change detection`（46）・`should time change detection with recording`（50） | 4 節。`tick` は `jasmine.createSpyObj` の偽物で（L23〜40 の beforeEach）、何を測るかは見ていない。ブラウザーの suite だけで動く |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-browser/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
$ pnpm bazel test //packages/platform-browser/test:test_web_chromium --nocache_test_results --test_output=all
（結果は表の下）
```

結果は手元の bazel で、`//packages/platform-browser/test:test`（Node）の絞り込みが `Meta service` で 23 specs、`title service` で 4 specs、`profiler` で 1 spec（Node では中身を飛ばす it）、`DOM Sanitization Service` で 1 spec、どれも 0 failures でした。ブラウザーの suite は全体で 253 passed・0 failed・5 skipped で、その記録には偽物の `tick` を回した「ran 2826033 change detection cycles」「0.00 ms per check」が出ていました（2026-11-22）。

直すとしたら、meta.ts の 124 行目と L143 の形を `"tag_attribute='value string'"` に揃え、121 行目と 127 行目に「当たる要素が無ければ作る」を、L67〜71 と 83〜85 行目に「name も property も無い定義は探さずに作る」を足します。振る舞いを説明に合わせるなら、`parseSelector`（L201〜204）に `charset`・`httpEquiv`・`itemprop` の枝を足します（spec は meta\_spec.ts に「`{charset}` を 2 回 `addTag` しても 1 つ」）。common\_tools.ts の 31〜34 行目には「zoneless のアプリでは印の付いたビューだけを検査する。開発モードでは 2 回目の検査（checkNoChanges）の時間も入る」と添え、tools.ts の 18 行目の Enabled を Enables にします。

## 聞かれそうな質問

**Q. `meta.getTag` の selector は、説明文のどの形で書けばよいですか？**

`"name='description'"` の形（L49〜50）です。中身はそのまま `meta[…]` になって `querySelector` に渡るので（L180〜182）、CSS として正しければ二重引用符でも通ります。`updateTag` の 124 行目のバッククォートの形は、ブラウザーでは SyntaxError です。

**Q. `meta.updateTag` は、当たる要素が無いと何もしませんか？**

新しく作って返します（L137）。121 行目は「既にある要素を書き換える」とだけ書きますが、spec の should create meta tag if it does not exist（meta\_spec.ts L140）がこの振る舞いを固めています。

**Q. `<meta charset>` や `http-equiv` を `addTag` で足すと、重なりますか？**

重なります。name も property も無い定義は `property="undefined"` で探すので、既にある要素は見つかりません（L201〜204）。このページでも `<meta charset>` が 1 → 2 になりました。

**Q. zoneless のアプリで `ng.profiler.timeChangeDetection()` の数を信じてよいですか？**

今の画面の変更検知の時間としては使えません。本番は何も検査しない `tick` の速さ（記録で 0.00 ms・160 万回）、開発モードは 2 回目の検査（`checkNoChanges`）の時間です。zone.js のアプリなら全部のビューを検査します（DEMO の 4・5 つ目の表）。

**Q. 本番のビルドでも `enableDebugTools` は効きますか？**

効きます。tools.ts の 30〜33 行目に `ngDevMode` の分かれは無く、`window.ng.profiler` が置かれます。本番の `window.ng` にはほかの道具が無いので、`profiler` だけです。

## 読み終えて

- `Meta` の selector は文字列のまま CSS になる。説明文の `'value string'` の形は正しく、`updateTag`・`removeTag` の `` `value string` `` の形はブラウザーで例外。
- `updateTag` は無ければ作り、`addTag` は name も property も無い定義を探さずに作る。どちらも説明文に無い。
- `Title` は inject した Document の `title` を読み書きするだけで、空や null は空の題になる。
- `enableDebugTools` は本番でも `ng.profiler` を置く。zoneless の `timeChangeDetection` は今の画面の変更検知を測っていない。
- platform-browser の `Safe*` も中身の無い interface で、ただの文字列も型を通る。区別は実行時の class。

---

← 前: [レンダラーとイベントの説明文：DomRenderer・SharedStylesHost・EventManager・key\_events](03-pbd-dom.md)  
次: [platform-server の説明文：renderApplication・provideServerRendering・INITIAL\_CONFIG](05-pbd-server.md) →
