[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 9 回 / 全 20 回

# 実行時（1）：ɵɵi18nStart と翻訳文の解析

> ɵɵi18nStart が consts から翻訳された文を取り出し、初回だけ i18n\_parse.ts で �0� や �#2� の印を読み、作る命令（I18nCreateOpCodes）と更新の命令（I18nUpdateOpCodes）を TView に作る流れ。ng-template の中の部分を切り出す getTranslationForTemplate（�\*1:1� の印）、ɵɵi18nPostprocess。命令のビットの詰め方は template シリーズの i18n の章へ。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-runtime-start)

---

コンパイラは翻訳された文を `consts` の関数に入れ、テンプレート関数には `ɵɵi18nStart(1, 0)` のような命令を 1 つ置くだけです。この章では、実行時にその命令が文の中の `�0�`・`�#2�`・`�*3:1�` という印を**どの関数で、どの順に読み**、「作る命令」（`I18nCreateOpCodes`）と「更新の命令」（`I18nUpdateOpCodes`）を `TView` に置くかを 1 行ずつ追います。最後に、コンパイラが文に残した `[�#2�|�#3�]` のような形を実行時に直す `ɵɵi18nPostprocess` を読みます。

読む対象は `packages/core/src/render3/instructions/i18n.ts`、`render3/i18n/i18n_parse.ts`、`render3/i18n/i18n_postprocess.ts`、`render3/interfaces/i18n.ts` です。

1. [1. 全体像](01-loc-overview.md)
2. [2. 印とメッセージ](02-loc-markup.md)
3. [3. プレースホルダー](03-loc-placeholders.md)
4. [4. メッセージ ID](04-loc-message-id.md)
5. [5. コンパイラの段](05-loc-pipeline-phases.md)
6. [6. $localize の出力](06-loc-const-collection.md)
7. [7. ICU のコンパイル](07-loc-icu-compile.md)
8. [8. 設定と古い抽出](08-loc-compiler-options.md)
9. **9. 実行時（1）解析**（この章）
10. [10. 実行時（2）DOM](10-loc-runtime-dom.md)
11. [11. 実行時（3）ICU](11-loc-runtime-icu.md)
12. [12. ロケールのデータ](12-loc-locale-data.md)
13. [13. $localize](13-loc-localize-tag.md)
14. [14. 実行時の翻訳](14-loc-runtime-translations.md)
15. [15. 抽出](15-loc-extract-tool.md)
16. [16. 翻訳ファイルを書く](16-loc-serializers.md)
17. [17. 翻訳ファイルを読む](17-loc-translation-parsers.md)
18. [18. 差し込み](18-loc-translate-tool.md)
19. [19. テスト](19-loc-testing.md)
20. [20. issue と PR を読む](20-loc-issues.md)

## 1. コンパイラが置いていくもの

出発点は、コンパイラの出力です。`<div i18n="@@demo-sub">Hello <b>…</b>@if (show) {<span>…</span>}!</div>` を、このページに入っている本物の `@angular/compiler` 22.1.6 でコンパイルするとこうなります （consts の関数の作り方は [第 6 回](06-loc-const-collection.md)）。

📄 `コンパイラの出力（このページの @angular/compiler 22.1.6。goog.getMsg の枝と 2 つめの配列は省略）`

```
function Demo_Conditional_3_Template(rf, ctx) {
  if (rf & 1) {
    ɵɵi18nStart(0,0,1);
    ɵɵdomElement(1,'span');
    ɵɵi18nEnd();
  }
  if (rf & 2) {
    var ctx_r0 = ɵɵnextContext();
    ɵɵadvance();
    ɵɵi18nExp(ctx_r0.count);
    ɵɵi18nApply(0);
  }
}
var def = ɵɵdefineComponent({type: Demo, selectors: [['app-demo']], decls: 4, vars: 2, consts: () => {
  var i18n_0;
  if ((typeof ngI18nClosureMode !== 'undefined') && ngI18nClosureMode) {
    // （goog.getMsg の枝。Closure Compiler 用なので省略）
  } else {
    (i18n_0 = $localize(__makeTemplateObject([':@@demo-sub:Hello ', ':START_BOLD_TEXT:', ':INTERPOLATION:', ':CLOSE_BOLD_TEXT:', ':START_BLOCK_IF:', ':START_TAG_SPAN:', ':INTERPOLATION_1: new', ':CLOSE_TAG_SPAN:', ':CLOSE_BLOCK_IF:!'], [...]), '�#2�', '�0�', '�/#2�', '�*3:1�', '�#1:1�', '�0:1�', '�/#1:1�', '�/*3:1�'));
  }
  return [i18n_0];
}
, template: function Demo_Template(rf, ctx) {
  if (rf & 1) {
    ɵɵdomElementStart(0,'div');
    ɵɵi18nStart(1,0);
    ɵɵdomElement(2,'b');
    ɵɵconditionalCreate(3,Demo_Conditional_3_Template,2,1,'span');
    ɵɵi18nEnd();
    ɵɵdomElementEnd();
  }
  if (rf & 2) {
    ɵɵadvance(3);
    ɵɵconditional((ctx.show ? 3 : -1));
    ɵɵi18nExp(ctx.name);
    ɵɵi18nApply(1);
  }
}
, encapsulation: 2});
```

見てほしいのは 3 つです。

1. **consts の関数は 1 つの文字列を返す**

   `$localize` は、翻訳が読み込まれていなければ元の文に、読み込まれていれば翻訳に、`'�#2�'` などの値を差し込んだ **1 本の文字列**を返します（[第 13 回](13-loc-localize-tag.md)）。翻訳が無いときの値は `Hello �#2��0��/#2��*3:1��#1:1��0:1� new�/#1:1��/*3:1�!` です。`@if` の中身（`�#1:1�` から `�/#1:1�`）も同じ 1 本に入っています。
2. **`ɵɵi18nStart` は 2 か所にある**

   親のテンプレート関数の `ɵɵi18nStart(1,0)` と、`@if` のテンプレート関数の `ɵɵi18nStart(0,0,1)` です。どちらも 2 つめの引数は `0`、つまり**同じ文字列**を指します。3 つめの引数 `1` が「その文字列のどの部分か」を選びます（4 節）。
3. **要素の命令は `ɵɵi18nStart` と `ɵɵi18nEnd` の間に残る**

   `ɵɵdomElement(2,'b')` は、文の中の `�#2�` と同じ番号です。`<b>` を実際に作るのはこの命令で、`ɵɵi18nStart` はその「場所」だけを先に決めます（[第 10 回](10-loc-runtime-dom.md)）。

## 2. ɵɵi18nStart の引数と印の意味

📄 `angular/packages/core/src/render3/instructions/i18n.ts` L37–69 （▶ の行: 45, 48, 52, 63–65, 69）

```ts
37 │ /**
38 │  * Marks a block of text as translatable.
39 │  *
40 │  * The instructions `i18nStart` and `i18nEnd` mark the translation block in the template.
41 │  * The translation `message` is the value which is locale specific. The translation string may
42 │  * contain placeholders which associate inner elements and sub-templates within the translation.
43 │  *
44 │  * The translation `message` placeholders are:
45 ▶  * - `�{index}(:{block})�`: *Binding Placeholder*: Marks a location where an expression will be
46 │  *   interpolated into. The placeholder `index` points to the expression binding index. An optional
47 │  *   `block` that matches the sub-template in which it was declared.
48 ▶  * - `�#{index}(:{block})�`/`�/#{index}(:{block})�`: *Element Placeholder*:  Marks the beginning
49 │  *   and end of DOM element that were embedded in the original translation block. The placeholder
50 │  *   `index` points to the element index in the template instructions set. An optional `block` that
51 │  *   matches the sub-template in which it was declared.
52 ▶  * - `�*{index}:{block}�`/`�/*{index}:{block}�`: *Sub-template Placeholder*: Sub-templates must be
53 │  *   split up and translated separately in each angular template function. The `index` points to the
54 │  *   `template` instruction index. A `block` that matches the sub-template in which it was declared.
55 │  *
56 │  * @param index A unique index of the translation in the static block.
57 │  * @param messageIndex An index of the translation message from the `def.consts` array.
58 │  * @param subTemplateIndex Optional sub-template index in the `message`.
59 │  *
60 │  * @codeGenApi
61 │  */
62 │ export function ɵɵi18nStart(
63 ▶   index: number,
64 ▶   messageIndex: number,
65 ▶   subTemplateIndex: number = -1,
66 │ ): void {
67 │   const tView = getTView();
68 │   const lView = getLView();
69 ▶   const adjustedIndex = HEADER_OFFSET + index;
```

45〜55 行目が印の一覧です。45 行目の `�{index}(:{block})�` が式、48 行目の `�#{index}�` と `�/#{index}�` が要素の始まりと終わり、52 行目の `�*{index}:{block}�` がサブテンプレート（`@if` や `*ngIf` の中）の始まりです。`index` は式なら式の番号、要素とテンプレートならテンプレート命令の番号（`ɵɵdomElement(2, …)` の 2）です。

63〜65 行目の 3 つの引数は、`index`（この命令自身の番号）、`messageIndex`（`consts` の何番目か）、`subTemplateIndex`（既定は `-1`）です。69 行目で `HEADER_OFFSET` を足して `LView` の中の位置に直します（`HEADER_OFFSET` は [ivy-lview](../ivy/06-ivy-lview.md)）。

その先の本体は [hydration-i18n](../platform/13-hydration-i18n.md) で引用しました。流れだけを書くと、`getConstant(tView.consts, messageIndex)` で文字列を取り出し、**`tView.firstCreatePass` のときだけ**`i18nStartFirstCreatePass` で解析し、毎回 `applyCreateOpCodes` で作る命令を当てます。この章は 1 つめの `i18nStartFirstCreatePass` の中身、次の章が 2 つめです。

## 3. 印を読む正規表現

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L79–97 （▶ の行: 79, 82, 84–86, 94）

```ts
79 ▶ const BINDING_REGEXP = /�(\d+):?\d*�/gi;
80 │ const ICU_REGEXP = /({\s*�\d+:?\d*�\s*,\s*\S{6}\s*,[\s\S]*})/gi;
81 │ const NESTED_ICU = /�(\d+)�/;
82 ▶ const ICU_BLOCK_REGEXP = /^\s*(�\d+:?\d*�)\s*,\s*(select|plural)\s*,/;
83 │ 
84 ▶ const MARKER = `�`;
85 ▶ const SUBTEMPLATE_REGEXP = /�\/?\*(\d+:\d+)�/gi;
86 ▶ const PH_REGEXP = /�(\/?[#*]\d+):?\d*�/gi;
87 │ 
88 │ /**
89 │  * Angular uses the special entity &ngsp; as a placeholder for non-removable space.
90 │  * It's replaced by the 0xE500 PUA (Private Use Areas) unicode character and later on replaced by a
91 │  * space.
92 │  * We are re-implementing the same idea since translations might contain this special character.
93 │  */
94 ▶ const NGSP_UNICODE_REGEXP = /\uE500/g;
95 │ function replaceNgsp(value: string): string {
96 │   return value.replace(NGSP_UNICODE_REGEXP, ' ');
97 │ }
```

- 86 行目 `PH_REGEXP`：要素とテンプレートの印（`#` か `*`、閉じる側は `/`）。**かっこの中は `:ブロック` を含まない**ので、`split` すると `'#2'`・`'/*3'` だけが残ります。
- 79 行目 `BINDING_REGEXP`：式の印 `�0�`・`�0:1�`。かっこは数字だけです。
- 82 行目 `ICU_BLOCK_REGEXP`：`{` の中身が `�0�, plural,` で始まれば ICU。
- 85 行目 `SUBTEMPLATE_REGEXP`：サブテンプレートの印だけ。かっこは `3:1` のように番号とブロックの両方です。
- 84 行目の `MARKER` は U+FFFD（置換文字）。翻訳者が打つことのない文字なので、印に使えます。94 行目は `&ngsp;` の U+E500 を空白に戻す正規表現です。

## 4. getTranslationForTemplate：自分のテンプレートの部分だけを切り出す

1 節の文字列には、親の分と `@if` の分が両方入っていました。最初にそれを切り分けます。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L537–563 （▶ の行: 552–553, 555, 558–561）

````ts
537 │ /**
538 │  * Extracts a part of a message and removes the rest.
539 │  *
540 │  * This method is used for extracting a part of the message associated with a template. A
541 │  * translated message can span multiple templates.
542 │  *
543 │  * Example:
544 │  * ```html
545 │  * <div i18n>Translate <span *ngIf>me</span>!</div>
546 │  * ```
547 │  *
548 │  * @param message The message to crop
549 │  * @param subTemplateIndex Index of the sub-template to extract. If undefined it returns the
550 │  * external template and removes all sub-templates.
551 │  */
552 ▶ export function getTranslationForTemplate(message: string, subTemplateIndex: number) {
553 ▶   if (isRootTemplateMessage(subTemplateIndex)) {
554 │     // We want the root template message, ignore all sub-templates
555 ▶     return removeInnerTemplateTranslation(message);
556 │   } else {
557 │     // We want a specific sub-template
558 ▶     const start =
559 ▶       message.indexOf(`:${subTemplateIndex}${MARKER}`) + 2 + subTemplateIndex.toString().length;
560 ▶     const end = message.search(new RegExp(`${MARKER}\\/\\*\\d+:${subTemplateIndex}${MARKER}`));
561 ▶     return removeInnerTemplateTranslation(message.substring(start, end));
562 │   }
563 │ }
````

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L503–535 （▶ の行: 513–515, 517, 519–520, 526, 533）

```ts
503 │ /**
504 │  * Removes everything inside the sub-templates of a message.
505 │  */
506 │ function removeInnerTemplateTranslation(message: string): string {
507 │   let match;
508 │   let res = '';
509 │   let index = 0;
510 │   let inTemplate = false;
511 │   let tagMatched;
512 │ 
513 ▶   while ((match = SUBTEMPLATE_REGEXP.exec(message)) !== null) {
514 ▶     if (!inTemplate) {
515 ▶       res += message.substring(index, match.index + match[0].length);
516 │       tagMatched = match[1];
517 ▶       inTemplate = true;
518 │     } else {
519 ▶       if (match[0] === `${MARKER}/*${tagMatched}${MARKER}`) {
520 ▶         index = match.index;
521 │         inTemplate = false;
522 │       }
523 │     }
524 │   }
525 │ 
526 ▶   ngDevMode &&
527 │     assertEqual(
528 │       inTemplate,
529 │       false,
530 │       `Tag mismatch: unable to find the end of the sub-template in the translation "${message}"`,
531 │     );
532 │ 
533 ▶   res += message.slice(index);
534 │   return res;
535 │ }
```

1. **親（`subTemplateIndex` が `-1`）なら 555 行目**

   `removeInnerTemplateTranslation` は 513 行目で `�*3:1�` / `�/*3:1�` を順に探します。最初の開きでは 515 行目で「開きの印まで」を結果に足し、517 行目で中に入ったと覚えます。519 行目で**同じ `3:1` の閉じ**が来たら、520 行目でそこから先を残す位置に決めます（入れ子の別のテンプレートの閉じは無視されます）。533 行目で残りを足すと、`Hello �#2��0��/#2��*3:1��/*3:1�!` になります。**開きと閉じの印は残り**、中身だけが消えます。
2. **サブテンプレート（`1`）なら 558〜561 行目**

   559 行目で `:1�` の位置を探して印の後ろへ進み、560 行目で `�/*数字:1�` の位置を探し、その間を取り出します。取り出した `�#1:1��0:1� new�/#1:1�` の中にさらに入れ子のテンプレートがあれば、561 行目の `removeInnerTemplateTranslation` がそれを消します。

> [!WARNING]
> **ハマりどころ**
>
> 559 行目と 560 行目は、印が見つからなかったとき（`indexOf` と `search` が `-1`）を確かめていません。翻訳から `{$START_BLOCK_IF}` などのテンプレートの印が消えていると、`substring(2, -1)` つまり文の先頭 2 文字が「サブテンプレートの文」になります。確かめているのは 526〜531 行目の `ngDevMode` の assert だけで、それも「開きに対応する閉じが無い」ことの確認です。
>
> このページに入っている `@angular/core` 22.1.6 の同じ 2 つの関数を Node で取り出し、`'Bonjour �#2��0��/#2�!'` と `1` を渡すと `'Bo'` が返りました。`$localize` の translate は「翻訳にあって元の文に無い」プレースホルダーは投げますが、「元の文にあって翻訳に無い」ものは投げません（[第 14 回](14-loc-runtime-translations.md)）。

## 5. i18nStartFirstCreatePass：印で割って、偶数はテキスト、奇数は印

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L131–158 （▶ の行: 139–143, 145–146, 149–150, 153, 155）

```ts
131 │ export function i18nStartFirstCreatePass(
132 │   tView: TView,
133 │   parentTNodeIndex: number,
134 │   lView: LView,
135 │   index: number,
136 │   message: string,
137 │   subTemplateIndex: number,
138 │ ) {
139 ▶   const rootTNode = getCurrentParentTNode();
140 ▶   const createOpCodes: I18nCreateOpCodes = [] as any;
141 ▶   const updateOpCodes: I18nUpdateOpCodes = [] as any;
142 ▶   const existingTNodeStack: TNode[][] = [[]];
143 ▶   const astStack: Array<Array<I18nNode>> = [[]];
144 │   if (ngDevMode) {
145 ▶     attachDebugGetter(createOpCodes, i18nCreateOpCodesToString);
146 ▶     attachDebugGetter(updateOpCodes, i18nUpdateOpCodesToString);
147 │   }
148 │ 
149 ▶   message = getTranslationForTemplate(message, subTemplateIndex);
150 ▶   const msgParts = replaceNgsp(message).split(PH_REGEXP);
151 │   for (let i = 0; i < msgParts.length; i++) {
152 │     let value = msgParts[i];
153 ▶     if ((i & 1) === 0) {
154 │       // Even indexes are text (including bindings & ICU expressions)
155 ▶       const parts = i18nParseTextIntoPartsAndICU(value);
156 │       for (let j = 0; j < parts.length; j++) {
157 │         let part = parts[j];
158 │         if ((j & 1) === 0) {
```

1. **139〜143 行目：入れ物を用意する**

   `rootTNode` は `ɵɵi18nStart` の親（1 節なら `<div>` の TNode）。140〜141 行目が、この章で作る 2 つの配列です。142〜143 行目の 2 つのスタックは、要素の中に入るたびに 1 段積む「いまの親の子の一覧」です（6 節の奇数の枝）。
2. **149 行目：4 節で自分の部分だけにする**
3. **150 行目：`PH_REGEXP` で割る**

   `split` にかっこ付きの正規表現を渡すと、かっこの中身も配列に入ります。`'Hello �#2��0��/#2��*3:1��/*3:1�!'` は `['Hello ', '#2', '�0�', '/#2', '', '*3', '', '/*3', '!']` になり、**偶数番目がテキスト、奇数番目が要素とテンプレートの印**と決まります（153 行目）。
4. **155 行目：テキストをさらに「文字と ICU」に割る**

   `i18nParseTextIntoPartsAndICU` は波かっこの深さを数え、深さ 0 の `{…}` の塊を取り出します。塊が 82 行目の `ICU_BLOCK_REGEXP` に合えば ICU の式（`IcuExpression`）になります。ここでも偶数番目が文字、奇数番目が ICU です。中身は [第 11 回](11-loc-runtime-icu.md) で読みます。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L159–185 （▶ の行: 162–163, 176–177, 182–184）

```ts
159 │           // `j` is odd therefore `part` is string
160 │           const text = part as string;
161 │           ngDevMode && assertString(text, 'Parsed ICU part should be string');
162 ▶           if (text !== '') {
163 ▶             i18nStartFirstCreatePassProcessTextNode(
164 │               astStack[0],
165 │               tView,
166 │               rootTNode,
167 │               existingTNodeStack[0],
168 │               createOpCodes,
169 │               updateOpCodes,
170 │               lView,
171 │               text,
172 │             );
173 │           }
174 │         } else {
175 │           // `j` is Even therefor `part` is an `ICUExpression`
176 ▶           const icuExpression: IcuExpression = part as IcuExpression;
177 ▶           // Verify that ICU expression has the right shape. Translations might contain invalid
178 │           // constructions (while original messages were correct), so ICU parsing at runtime may
179 │           // not succeed (thus `icuExpression` remains a string).
180 │           // Note: we intentionally retain the error here by not using `ngDevMode`, because
181 │           // the value can change based on the locale and users aren't guaranteed to hit
182 ▶           // an invalid string while they're developing.
183 ▶           if (typeof icuExpression !== 'object') {
184 ▶             throw new Error(`Unable to parse ICU expression in "${message}" message.`);
185 │           }
```

162〜163 行目、空でない文字は `i18nStartFirstCreatePassProcessTextNode` へ。176 行目からが ICU で、183〜184 行目は「ICU のはずが解析できなかった」ときに投げます。コメント（177〜182 行目）にあるとおり、翻訳はロケールごとに違うので、**開発中は通っても本番の別の言語で壊れることがあり**、`ngDevMode` で囲まずに残してあります。

奇数番目（要素とテンプレートの印）の枝は [hydration-i18n](../platform/13-hydration-i18n.md) で引用しました。開きの印なら `createTNodePlaceholder` で「まだ中身のない TNode」を先に作ってスタックを 1 段積み、閉じの印なら 1 段戻します。最後に `tView.data[index]` に `{ create, update, ast, parentTNodeIndex }` を入れて終わりです（7 節）。Placeholder の TNode が DOM の順番をどう決めるかは [第 10 回](10-loc-runtime-dom.md) です。

## 6. テキスト 1 つから、作る命令と更新の命令を作る

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L332–357 （▶ の行: 342, 349, 353–354, 356）

```ts
332 │ function i18nStartFirstCreatePassProcessTextNode(
333 │   ast: I18nNode[],
334 │   tView: TView,
335 │   rootTNode: TNode | null,
336 │   existingTNodes: TNode[],
337 │   createOpCodes: I18nCreateOpCodes,
338 │   updateOpCodes: I18nUpdateOpCodes,
339 │   lView: LView,
340 │   text: string,
341 │ ): void {
342 ▶   const hasBinding = text.match(BINDING_REGEXP);
343 │   const tNode = createTNodeAndAddOpCode(
344 │     tView,
345 │     rootTNode,
346 │     existingTNodes,
347 │     lView,
348 │     createOpCodes,
349 ▶     hasBinding ? null : text,
350 │     false,
351 │   );
352 │   const index = tNode.index;
353 ▶   if (hasBinding) {
354 ▶     generateBindingUpdateOpCodes(updateOpCodes, text, index, null, 0, null);
355 │   }
356 ▶   ast.push({kind: I18nNodeKind.TEXT, index});
357 │ }
```

342 行目で式の印があるかを見ます。式があれば 349 行目でテキストを `null`（空のテキストノード）にし、354 行目で更新の命令を足します。式が無ければテキストはそのまま作る命令に入り、更新の命令は足されません。356 行目の `ast` はハイドレーション用の木です（[hydration-i18n](../platform/13-hydration-i18n.md)）。

### 作る命令の 1 組

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L262–292 （▶ の行: 271–272, 281, 286, 288–290, 292）

```ts
262 │ function createTNodeAndAddOpCode(
263 │   tView: TView,
264 │   rootTNode: TNode | null,
265 │   existingTNodes: TNode[],
266 │   lView: LView,
267 │   createOpCodes: I18nCreateOpCodes,
268 │   text: string | null,
269 │   isICU: boolean,
270 │ ): TNode {
271 ▶   const i18nNodeIdx = allocExpando(tView, lView, 1, null);
272 ▶   let opCode = i18nNodeIdx << I18nCreateOpCode.SHIFT;
273 │   let parentTNode = getCurrentParentTNode();
274 │ 
275 │   if (rootTNode === parentTNode) {
276 │     // FIXME(misko): A null `parentTNode` should represent when we fall of the `LView` boundary.
277 │     // (there is no parent), but in some circumstances (because we are inconsistent about how we set
278 │     // `previousOrParentTNode`) it could point to `rootTNode` So this is a work around.
279 │     parentTNode = null;
280 │   }
281 ▶   if (parentTNode === null) {
282 │     // If we don't have a parent that means that we can eagerly add nodes.
283 │     // If we have a parent than these nodes can't be added now (as the parent has not been created
284 │     // yet) and instead the `parentTNode` is responsible for adding it. See
285 │     // `TNode.insertBeforeIndex`
286 ▶     opCode |= I18nCreateOpCode.APPEND_EAGERLY;
287 │   }
288 ▶   if (isICU) {
289 ▶     opCode |= I18nCreateOpCode.COMMENT;
290 ▶     ensureIcuContainerVisitorLoaded(loadIcuContainerVisitor);
291 │   }
292 ▶   createOpCodes.push(opCode, text === null ? '' : text);
```

1. **271 行目：`LView` の後ろに 1 枠を足す**

   `allocExpando`（[ivy-blueprint](../ivy/07-ivy-blueprint.md)）は `LView`・blueprint・`tView.data` を 1 つずつ伸ばして、その位置を返します。翻訳でテキストがいくつになるかはコンパイル時に分からないので、`decls` の後ろに**実行時に**伸ばすのです。
2. **272 行目：位置を上にずらして数にする**

   ずらす量 `I18nCreateOpCode.SHIFT` と下の 2 桁の意味は [i18n の章](../template/06-i18n.md)の 2 節で引用した `I18nCreateOpCode` です。
3. **281〜287 行目：親がまだ無ければ `APPEND_EAGERLY`**

   親が `ɵɵi18nStart` の親そのもの（`<div>`）なら、もう DOM にあるのですぐ足せます。親が `<b>` のような Placeholder なら、まだ DOM が無いので印を付けません（その場合の足し方は [第 10 回](10-loc-runtime-dom.md)）。
4. **288〜291 行目：ICU ならコメントノード**

   290 行目の `ensureIcuContainerVisitorLoaded` は、ICU があるときだけ ICU 用のコードを読み込むための仕掛けです（[第 11 回](11-loc-runtime-icu.md)）。
5. **292 行目：「数、文字列」の 2 つを積む**

   作る命令は、この 2 つ組が並んだだけの配列です。

### 更新の命令の 1 かたまり

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L432–466 （▶ の行: 432–434, 439, 447–449, 452, 456–458, 463–464）

```ts
432 ▶   const maskIndex = updateOpCodes.length; // Location of mask
433 ▶   const sizeIndex = maskIndex + 1; // location of size for skipping
434 ▶   updateOpCodes.push(null, null); // Alloc space for mask and size
435 │   const startIndex = maskIndex + 2; // location of first allocation.
436 │   if (ngDevMode) {
437 │     attachDebugGetter(updateOpCodes, i18nUpdateOpCodesToString);
438 │   }
439 ▶   const textParts = str.split(BINDING_REGEXP);
440 │   let mask = 0;
441 │ 
442 │   for (let j = 0; j < textParts.length; j++) {
443 │     const textValue = textParts[j];
444 │ 
445 │     if (j & 1) {
446 │       // Odd indexes are bindings
447 ▶       const bindingIndex = bindingStart + parseInt(textValue, 10);
448 ▶       updateOpCodes.push(-1 - bindingIndex);
449 ▶       mask = mask | toMaskBit(bindingIndex);
450 │     } else if (textValue !== '') {
451 │       // Even indexes are text
452 ▶       updateOpCodes.push(textValue);
453 │     }
454 │   }
455 │ 
456 ▶   updateOpCodes.push(
457 ▶     (destinationNode << I18nUpdateOpCode.SHIFT_REF) |
458 ▶       (attrName ? I18nUpdateOpCode.Attr : I18nUpdateOpCode.Text),
459 │   );
460 │   if (attrName) {
461 │     updateOpCodes.push(attrName, sanitizeFn);
462 │   }
463 ▶   updateOpCodes[maskIndex] = mask;
464 ▶   updateOpCodes[sizeIndex] = updateOpCodes.length - startIndex;
465 │   return mask;
466 │ }
```

1. **432〜434 行目：先頭に 2 枠を空けておく**

   マスクと「この塊の長さ」の 2 つは、最後まで読まないと決まらないからです。
2. **439 行目：`BINDING_REGEXP` で割る**

   `'Hello �0�!'` は `['Hello ', '0', '!']`。奇数番目が式の番号です。
3. **447〜449 行目：式は負の数で積み、マスクの桁を立てる**

   式 0 は `-1`、式 1 は `-2`。正の数（あとで積む宛先）と区別するために負にしています。
4. **456〜458 行目：宛先を積む**

   テキストノードの位置を 2 桁ずらし、下の 2 桁に `Text`（属性なら `Attr`）を入れます。
5. **463〜464 行目：空けておいた 2 枠を埋める**

   `'Hello �0�!'` なら塊は `[0b1, 4, 'Hello ', -1, '!', (位置 << 2) | Text]` です。変更検知でこの塊がどう読まれるか（マスクで丸ごと飛ばす）は [i18n の章](../template/06-i18n.md)の 4〜5 節です。

## 7. TView に入るもの：TI18n

📄 `angular/packages/core/src/render3/interfaces/i18n.ts` L333–360 （▶ の行: 342, 348, 354, 359）

```ts
333 │ /**
334 │  * Store information for the i18n translation block.
335 │  */
336 │ export interface TI18n {
337 │   /**
338 │    * A set of OpCodes which will create the Text Nodes and ICU anchors for the translation blocks.
339 │    *
340 │    * NOTE: The ICU anchors are filled in with ICU Update OpCode.
341 │    */
342 ▶   create: I18nCreateOpCodes;
343 │ 
344 │   /**
345 │    * A set of OpCodes which will be executed on each change detection to determine if any changes to
346 │    * DOM are required.
347 │    */
348 ▶   update: I18nUpdateOpCodes;
349 │ 
350 │   /**
351 │    * An AST representing the translated message. This is used for hydration (and serialization),
352 │    * while the Update and Create OpCodes are used at runtime.
353 │    */
354 ▶   ast: Array<I18nNode>;
355 │ 
356 │   /**
357 │    * Index of a parent TNode, which represents a host node for this i18n block.
358 │    */
359 ▶   parentTNodeIndex: number;
360 │ }
```

5 節の最後で `tView.data[index]` に入るのがこの形です。`index` は `ɵɵi18nStart` 自身の位置なので、**その `TView` を使う 2 つめ以降の `LView` は、解析をせずにこの配列を読むだけ**です。逆に言えば、一度 `TView` ができたあとで翻訳を差し替えても、ここは作り直されません（[第 10 回](10-loc-runtime-dom.md)のデモ、[第 14 回](14-loc-runtime-translations.md)）。

> **🧪 DEMO — ɵɵi18nStart に渡る文字列を取り出し、印を読む**
>
> 「コンパイルして読む」を押すと、テンプレートをこのページの `@angular/compiler` 22.1.6 で JS にし（`compileI18nTemplate`）、その `consts` の関数を本物の `$localize`・`ɵmakeTemplateObject`・`ɵɵi18nPostprocess` で評価して、`ɵɵi18nStart` に渡る文字列を取り出します。そのあとの「切り出し」（4 節）は getTranslationForTemplate の写しで、「割り方」（5 節）は `PH_REGEXP` と波かっこの深さ 0 の切り方だけを写した**移植**です（TNode や命令の配列は作りません）。ICU を試すなら `<p i18n>{count, plural, =0 {none} other {{{count}} items}}</p>` のように書きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-runtime-start)

## 8. ɵɵi18nPostprocess：同じ名前の印を、出てくる順に 1 つに決める

コンパイラは、同じ名前のプレースホルダーに別々の要素が当たるとき、値を 1 つに決められません。`<div i18n><span>a</span> and <span>b</span>@if (x) {<span>c</span>}</div>` の 3 つの `<span>` はどれも `START_TAG_SPAN` なので、`$localize` の値は `'[�#2�|�#3�|�#1:1�]'` になり、続けて `ɵɵi18nPostprocess(i18n_0)` が呼ばれます（どちらもこのページのコンパイラで確かめた出力）。ICU があるときも `ɵɵi18nPostprocess(i18n_0, {'VAR_PLURAL': '�0�', …})` の形で呼ばれます（コンパイラの側は [第 7 回](07-loc-icu-compile.md)）。

📄 `angular/packages/core/src/render3/i18n/i18n_postprocess.ts` L9–21 （▶ の行: 11–15）

```ts
 9 │ // i18nPostprocess consts
10 │ const ROOT_TEMPLATE_ID = 0;
11 ▶ const PP_MULTI_VALUE_PLACEHOLDERS_REGEXP = /\[(�.+?�?)\]/;
12 ▶ const PP_PLACEHOLDERS_REGEXP = /\[(�.+?�?)\]|(�\/?\*\d+:\d+�)/g;
13 ▶ const PP_ICU_VARS_REGEXP = /({\s*)(VAR_(PLURAL|SELECT)(_\d+)?)(\s*,)/g;
14 ▶ const PP_ICU_PLACEHOLDERS_REGEXP = /{([A-Z0-9_]+)}/g;
15 ▶ const PP_ICUS_REGEXP = /�I18N_EXP_(ICU(_\d+)?)�/g;
16 │ const PP_CLOSE_TEMPLATE_REGEXP = /\/\*/;
17 │ const PP_TEMPLATE_ID_REGEXP = /\d+\:(\d+)/;
18 │ 
19 │ // Parsed placeholder structure used in postprocessing (within `i18nPostprocess` function)
20 │ // Contains the following fields: [templateId, isCloseTemplateTag, placeholder]
21 │ type PostprocessPlaceholder = [number, boolean, string];
```

📄 `angular/packages/core/src/render3/i18n/i18n_postprocess.ts` L58–97 （▶ の行: 58, 60–61, 65, 67, 78, 82, 89–92, 95–96）

```ts
58 ▶   if (PP_MULTI_VALUE_PLACEHOLDERS_REGEXP.test(message)) {
59 │     const matches: {[key: string]: PostprocessPlaceholder[]} = {};
60 ▶     const templateIdsStack: number[] = [ROOT_TEMPLATE_ID];
61 ▶     result = result.replace(PP_PLACEHOLDERS_REGEXP, (m: any, phs: string, tmpl: string): string => {
62 │       const content = phs || tmpl;
63 │       const placeholders: PostprocessPlaceholder[] = matches[content] || [];
64 │       if (!placeholders.length) {
65 ▶         content.split('|').forEach((placeholder: string) => {
66 │           const match = placeholder.match(PP_TEMPLATE_ID_REGEXP);
67 ▶           const templateId = match ? parseInt(match[1], 10) : ROOT_TEMPLATE_ID;
68 │           const isCloseTemplateTag = PP_CLOSE_TEMPLATE_REGEXP.test(placeholder);
69 │           placeholders.push([templateId, isCloseTemplateTag, placeholder]);
70 │         });
71 │         matches[content] = placeholders;
72 │       }
73 │ 
74 │       if (!placeholders.length) {
75 │         throw new Error(`i18n postprocess: unmatched placeholder - ${content}`);
76 │       }
77 │ 
78 ▶       const currentTemplateId = templateIdsStack[templateIdsStack.length - 1];
79 │       let idx = 0;
80 │       // find placeholder index that matches current template id
81 │       for (let i = 0; i < placeholders.length; i++) {
82 ▶         if (placeholders[i][0] === currentTemplateId) {
83 │           idx = i;
84 │           break;
85 │         }
86 │       }
87 │       // update template id stack based on the current tag extracted
88 │       const [templateId, isCloseTemplateTag, placeholder] = placeholders[idx];
89 ▶       if (isCloseTemplateTag) {
90 ▶         templateIdsStack.pop();
91 ▶       } else if (currentTemplateId !== templateId) {
92 ▶         templateIdsStack.push(templateId);
93 │       }
94 │       // remove processed tag from the list
95 ▶       placeholders.splice(idx, 1);
96 ▶       return placeholder;
97 │     });
```

1. **58 行目：`[…]` が無ければ何もしない**
2. **61 行目：`[…]` とテンプレートの印を、出てくる順に 1 つずつ置き換える**

   12 行目の正規表現は `[…]` と `�*4:1�` / `�/*4:1�` の両方に合います。初めて見た中身は 65〜70 行目で `|` で割り、67 行目で `:1` のようなブロック番号（無ければ 0）を付けて候補の一覧にします。
3. **78〜86 行目：いまのテンプレートの候補を選ぶ**

   60 行目のスタックの先頭が「いまどのテンプレートの中か」です。82 行目で同じ番号の候補を探します（無ければ先頭）。
4. **89〜93 行目：テンプレートの印ならスタックを動かす**

   `�*4:1�` が来ると 92 行目でスタックに 1 を積み、`�/*4:1�` で 90 行目で戻します。だから `@if` の中の 3 つめの `[…]` では `�#1:1�` が選ばれます。
5. **95〜96 行目：使った候補を消して返す**

   1 つめの `<span>` で `�#2�` を使うと、2 つめでは `�#3�` が残っています。こうして `�#2�a�/#2� and �#3�b�/#3��*4:1��#1:1�c�/#1:1��/*4:1�` になります（上のデモに貼ると確かめられます）。

📄 `angular/packages/core/src/render3/i18n/i18n_postprocess.ts` L100–135 （▶ の行: 101, 108–109, 115–116, 123, 129）

```ts
100 │   // return current result if no replacements specified
101 ▶   if (!Object.keys(replacements).length) {
102 │     return result;
103 │   }
104 │ 
105 │   /**
106 │    * Step 2: replace all ICU vars (like "VAR_PLURAL")
107 │    */
108 ▶   result = result.replace(PP_ICU_VARS_REGEXP, (match, start, key, _type, _idx, end): string => {
109 ▶     return Object.hasOwn(replacements, key) ? `${start}${replacements[key]}${end}` : match;
110 │   });
111 │ 
112 │   /**
113 │    * Step 3: replace all placeholders used inside ICUs in a form of {PLACEHOLDER}
114 │    */
115 ▶   result = result.replace(PP_ICU_PLACEHOLDERS_REGEXP, (match, key): string => {
116 ▶     return Object.hasOwn(replacements, key) ? (replacements[key] as string) : match;
117 │   });
118 │ 
119 │   /**
120 │    * Step 4: replace all ICU references with corresponding values (like �ICU_EXP_ICU_1�) in case
121 │    * multiple ICUs have the same placeholder name
122 │    */
123 ▶   result = result.replace(PP_ICUS_REGEXP, (match, key): string => {
124 │     if (Object.hasOwn(replacements, key)) {
125 │       const list = replacements[key] as string[];
126 │       if (!list.length) {
127 │         throw new Error(`i18n postprocess: unmatched ICU - ${match} with key: ${key}`);
128 │       }
129 ▶       return list.shift()!;
130 │     }
131 │     return match;
132 │   });
133 │ 
134 │   return result;
135 │ }
```

101 行目、置き換えの表が無ければここで返ります。108〜109 行目が `{VAR_PLURAL, plural,` の `VAR_PLURAL` を `�0�` に、115〜116 行目が ICU の中の `{INTERPOLATION}` や `{START_BOLD_TEXT}` を `�1�` や `<b>` に替えます。123〜129 行目は、同じ名前の ICU が複数あるときに `�I18N_EXP_ICU�` を配列から 1 つずつ取り出します。**ここまでは文字列の置き換えだけ**で、TNode も命令も作りません。できた文字列を 2 節の `ɵɵi18nStart` が読みます。

## 9. ここまでを 1 本に

- 👤 `<div i18n>Hello <b>…</b>…</div>` — テンプレート — *コンパイラが consts の関数と ɵɵi18nStart(1, 0) を出す*
  - `createTView → consts()` — render3/view/construction.ts — *TView を作るときに 1 回だけ。$localize がここで呼ばれる（[ivy-tview](../ivy/05-ivy-tview.md)）*
    - `$localize(…) → ɵɵi18nPostprocess(…)` — i18n\_postprocess.ts L43-135 — *\[…\] と VAR\_PLURAL などを直した 1 本の文字列*
  - `ɵɵi18nStart(1, 0)` — instructions/i18n.ts L62 — *getConstant で文字列を取り出す*
    - `i18nStartFirstCreatePass` — i18n\_parse.ts L131 — *firstCreatePass のときだけ*
      - `getTranslationForTemplate` — i18n\_parse.ts L552 — *自分のテンプレートの部分だけ*
      - `split(PH_REGEXP)` — i18n\_parse.ts L150 — *偶数 = テキスト、奇数 = 要素・テンプレートの印*
        - `i18nParseTextIntoPartsAndICU` — i18n\_parse.ts L693 — *文字と ICU に割る*
        - `i18nStartFirstCreatePassProcessTextNode` — i18n\_parse.ts L332 — *テキスト 1 つ*
          - `createTNodeAndAddOpCode` — i18n\_parse.ts L262 — *作る命令に 2 つ組*
          - `generateBindingUpdateOpCodes` — i18n\_parse.ts L418 — *式があれば更新の命令に 1 かたまり*
        - `createTNodePlaceholder` — i18n\_util.ts L122 — *要素・テンプレートの印（第 10 回）*
      - `tView.data[index] = { create, update, ast, parentTNodeIndex }` — i18n\_parse.ts L242
    - `applyCreateOpCodes` — i18n\_apply.ts L204 — *毎回。DOM を作る（第 10 回）*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット | 件数 |
| --- | --- | --- | --- |
| core/test/render3/i18n/i18n\_spec.ts | `Runtime i18n` &gt; `getTranslationForTemplate`（34 行目）・`i18nStart`（88 行目）・`i18nAttribute`（610 行目）・`i18nPostprocess`（689 行目）・`i18nStartFirstCreatePass`（835 行目） | `//packages/core/test/render3:render3` | 21 |

📄 `angular/packages/core/test/render3/i18n/i18n_spec.ts` L33–66 （▶ の行: 46–49, 63–64）

```ts
33 │ describe('Runtime i18n', () => {
34 │   describe('getTranslationForTemplate', () => {
35 │     it('should crop messages for the selected template', () => {
36 │       let message = `simple text`;
37 │       expect(getTranslationForTemplate(message, -1)).toEqual(message);
38 │ 
39 │       message = `Hello �0�!`;
40 │       expect(getTranslationForTemplate(message, -1)).toEqual(message);
41 │ 
42 │       message = `Hello �#2��0��/#2�!`;
43 │       expect(getTranslationForTemplate(message, -1)).toEqual(message);
44 │ 
45 │       // Embedded sub-templates
46 ▶       message = `�0� is rendered as: �*2:1�before�*1:2�middle�/*1:2�after�/*2:1�!`;
47 ▶       expect(getTranslationForTemplate(message, -1)).toEqual('�0� is rendered as: �*2:1��/*2:1�!');
48 ▶       expect(getTranslationForTemplate(message, 1)).toEqual('before�*1:2��/*1:2�after');
49 ▶       expect(getTranslationForTemplate(message, 2)).toEqual('middle');
50 │ 
51 │       // Embedded & sibling sub-templates
52 │       message = `�0� is rendered as: �*2:1�before�*1:2�middle�/*1:2�after�/*2:1� and also �*4:3�before�*1:4�middle�/*1:4�after�/*4:3�!`;
53 │       expect(getTranslationForTemplate(message, -1)).toEqual(
54 │         '�0� is rendered as: �*2:1��/*2:1� and also �*4:3��/*4:3�!',
55 │       );
56 │       expect(getTranslationForTemplate(message, 1)).toEqual('before�*1:2��/*1:2�after');
57 │       expect(getTranslationForTemplate(message, 2)).toEqual('middle');
58 │       expect(getTranslationForTemplate(message, 3)).toEqual('before�*1:4��/*1:4�after');
59 │       expect(getTranslationForTemplate(message, 4)).toEqual('middle');
60 │     });
61 │ 
62 │     it('should throw if the template is malformed', () => {
63 ▶       const message = `�*2:1�message!`;
64 ▶       expect(() => getTranslationForTemplate(message, -1)).toThrowError(/Tag mismatch/);
65 │     });
66 │   });
```

4 節の 2 つの関数を、文字列だけで確かめる it です。46〜49 行目は入れ子（ブロック 1 の中にブロック 2）で、47 行目の親では `�*2:1��/*2:1�` の印だけが残り、48 行目のブロック 1 では中の `�*1:2�…�/*1:2�` が空になります。63〜64 行目は閉じの無い文で、526〜531 行目の assert が投げることを確かめています。**4 節の注意（サブテンプレートの印が無い翻訳）を確かめる it はありません。**

📄 `angular/packages/core/test/render3/i18n/i18n_spec.ts` L165–199 （▶ の行: 166, 173, 180–181, 183, 188）

```ts
165 │     it('for simple bindings', () => {
166 ▶       const message = `Hello �0�!`;
167 │       const nbConsts = 2;
168 │       const index = 1;
169 │       const opCodes = getOpCodes(
170 │         message,
171 │         () => {
172 │           ɵɵelementStart(0, 'div');
173 ▶           ɵɵi18nStart(index, 0);
174 │           ɵɵelementEnd();
175 │         },
176 │         nbConsts,
177 │         HEADER_OFFSET + index,
178 │       );
179 │ 
180 ▶       expect((opCodes as any).update.debug).toEqual([
181 ▶         `if (mask & 0b1) { (lView[${
182 │           HEADER_OFFSET + 2
183 ▶         }] as Text).textContent = \`Hello \${lView[i-1]}!\`; }`,
184 │       ]);
185 │ 
186 │       expect(opCodes).toEqual({
187 │         create: matchDebug([
188 ▶           `lView[${HEADER_OFFSET + 2}] = document.createText("");`,
189 │           `parent.appendChild(lView[${HEADER_OFFSET + 2}]);`,
190 │         ]),
191 │         update: matchDebug([
192 │           `if (mask & 0b1) { (lView[${
193 │             HEADER_OFFSET + 2
194 │           }] as Text).textContent = \`Hello \${lView[i-1]}!\`; }`,
195 │         ]),
196 │         ast: [{kind: 0, index: HEADER_OFFSET + 2}],
197 │         parentTNodeIndex: HEADER_OFFSET,
198 │       });
199 │     });
```

`ViewFixture` で `ɵɵi18nStart` を直接呼び、`tView.data` の `TI18n` を比べます。180〜184 行目は `update.debug`（ngDevMode のときだけ付く読みやすい形。i18n\_parse.ts 145〜146 行目の `attachDebugGetter`）で、6 節の更新の命令を「``if (mask & 0b1) { … textContent = `Hello ${lView[i-1]}!` }``」と読めるようにしています。188 行目のテキストノードが `HEADER_OFFSET + 2` なのは、`decls` が 2 なので 6 節の `allocExpando` がその後ろに 1 枠を足したからです。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/render3:render3 --nocache_test_results --test_output=all '--test_arg=--filter=Runtime i18n'
```

📄 `出力（2026-11-03 に実行。抜粋。ログは scratchpad/i18n-logs/c-runtime-start.log）`

```
Randomized with seed 50429
Started
Ran 21 of 574 specs
21 specs, 0 failures
Finished in 0.027 seconds
INFO: Elapsed time: 2.583s, Critical Path: 1.48s
//packages/core/test/render3:render3                                     PASSED in 1.1s
Executed 1 out of 1 test: 1 test passes.
```

- `Runtime i18n` で絞って 21 of 574 specs、テストは 1.1 秒（ビルド込み 2.6 秒）。i18n\_spec.ts の it の数（21）と一致します。
- このターゲットは shard が無いので、「Ran」は 1 回だけ出ます。

### 直すとしたら

- サブテンプレートの印が無い翻訳：`i18n_parse.ts` の `getTranslationForTemplate`（559〜560 行目）で `-1` を確かめるのが入口です。it は i18n\_spec.ts の `describe('getTranslationForTemplate')` に、上の 62〜65 行目と同じ形で足せます。ただし、翻訳ファイルの側で印が欠けたものは `$localize` の translate（[第 14 回](14-loc-runtime-translations.md)）やビルド時の差し込み（[第 18 回](18-loc-translate-tool.md)）がどこまで弾くかを先に読みます。
- 印の読み方を変えるなら、3 節の正規表現と 5 節の `split` の偶数・奇数の決まりの両方が前提になっています。`describe('i18nStart')`（88 行目）の it が全部その形を見ています。
- 関係する issue：開いている #62694（ICU の `#`）・#60566（ICU の補間を含む翻訳の解析）は、どちらも 5 節の 155 行目より先（ICU の解析）の話です（[第 11 回](11-loc-runtime-icu.md)、[第 20 回](20-loc-issues.md)）。本家に PR を出すことは勧めません。手元で it を足して落ちることを確かめ、issue を読むときの手がかりにします。

## 聞かれそうな質問

**Q. 翻訳の文はいつ解析されますか？変更検知のたびですか？**

`TView` ごとに 1 回です。`ɵɵi18nStart` は `tView.firstCreatePass` のときだけ `i18nStartFirstCreatePass` を呼び（本体は [hydration-i18n](../platform/13-hydration-i18n.md) で引用）、結果を `tView.data` の `TI18n`（7 節）に置きます。同じコンポーネントを 2 つ目以降に作るときも、変更検知のときも、置いてある配列を読むだけです。

**Q. `�0�` と `�#2�` の数字は同じ種類の番号ですか？**

違います。`�0�` は式の番号で、`ɵɵi18nExp` を呼んだ順です（447 行目で `bindingStart + 番号`）。`�#2�` はテンプレート命令の番号で、`ɵɵdomElement(2, …)` の 2 です（奇数の枝で `HEADER_OFFSET` を足して TNode の位置にします。hydration-i18n で引用した範囲）。

**Q. `@if` の中の文はどうやって分けているのですか？**

文は 1 本のまま、`ɵɵi18nStart` の 3 つめの引数で切り出します。親は 555 行目で中身を消した文を、`@if` の中は 558〜561 行目で `�*3:1�` と `�/*3:1�` の間を使います。親に残った `�*3:1�` は、そこに `@if` のコンテナが来るという場所の印になります。

**Q. 式の入ったテキストは、作るときに何が入っていますか？**

空です。349 行目で `null` を渡すので、作る命令は空のテキストノードを作ります。中身は、初回の更新で `ɵɵi18nApply` が 6 節の更新の命令を当てたときに入ります（[第 10 回](10-loc-runtime-dom.md)）。

**Q. `ɵɵi18nPostprocess` は毎回呼ばれて重くないですか？**

呼ばれるのは consts の関数の中なので、`TView` を作るときに 1 回です。中身も 58 行目と 101 行目で、必要なければすぐ返ります。

## 読み終えて

- `ɵɵi18nStart` が受け取るのは、`$localize` と `ɵɵi18nPostprocess` を通った **1 本の文字列**と、その中のどの部分かを選ぶ `subTemplateIndex` です。
- 解析は `firstCreatePass` の 1 回だけ。`PH_REGEXP` で割って偶数がテキスト、奇数が要素とテンプレートの印、テキストはさらに文字と ICU に割ります。
- テキストは作る命令に「数、文字列」の 2 つ組を、式があれば更新の命令に「マスク、長さ、部品…、宛先」の 1 かたまりを足します。テキストノードの枠は `allocExpando` で `decls` の後ろに足されます。
- 結果は `tView.data` の `TI18n` に置かれ、次の章の `applyCreateOpCodes` と `ɵɵi18nApply` が読みます。

---

← 前: [コンパイラの i18n の設定と古い抽出](08-loc-compiler-options.md)  
次: [実行時（2）：翻訳の順に DOM を並べる](10-loc-runtime-dom.md) →
