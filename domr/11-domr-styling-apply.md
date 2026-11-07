[目次](../README.md) › [DOM レンダラーとイベントの内側](README.md) › 第 11 回 / 全 20 回

# 値を決めて DOM に書く：checkStylingProperty から applyStyling まで

> styling.ts の checkStylingProperty が bindingUpdated で値の変化を確かめ、normalizeSuffix で単位（.px）を付け、updateStyling が重複の印を見て findStylingValue で上の値・下の値を探し、node\_manipulation.ts の applyStyling が renderer の addClass・removeClass・setStyle・removeStyle（RendererStyleFlags2 の DashCase と Important）を呼ぶまで。「値なし」は undefined だけで、null と false は下の値があっても消すこと。スタイルの値のサニタイズは無く、開発モードの NG0318 の警告だけがあること。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/domr-styling-apply)

---

`[style.width.px]="w()"` の値が変わったとき、Angular はすぐに `setStyle` を呼ぶわけではありません。同じ要素にもっと強いバインディングがあればそちらが勝ち、自分が `undefined` になれば弱いほうの値を探して書き直します。この章では、`ɵɵstyleProp` と `ɵɵclassProp` の本体 `checkStylingProperty` から、値の変化の確認、単位の付け方、優先順位の高い値・低い値を探す `findStylingValue`、renderer の `addClass`・`removeClass`・`setStyle`・`removeStyle` を呼び分ける `applyStyling`、そして `DomRendererFactory2` の renderer がそれを DOM に書くところまでを、1 行ずつたどります。

読む対象は `packages/core/src/render3/instructions/styling.ts`・`render3/node_manipulation.ts` の `applyStyling`・`packages/platform-browser/src/dom/dom_renderer.ts` です（../angular、22.2.0-next.7、8576f161ae4）。リストの作り方は[第 10 回](10-domr-style-binding-list.md)、`[class]` と `[style]` の中身は[第 12 回](12-domr-styling-maps.md)です。

1. [1. 全体像](01-domr-overview.md)
2. [2. Renderer2 の約束](02-domr-renderer-api.md)
3. [3. DomRendererFactory2](03-domr-renderer-factory.md)
4. [4. 要素とテキスト](04-domr-default-renderer.md)
5. [5. 属性とプロパティ](05-domr-attributes-properties.md)
6. [6. カプセル化](06-domr-encapsulation.md)
7. [7. SharedStylesHost](07-domr-shared-styles.md)
8. [8. CSS 変数の名前空間](08-domr-css-var-namespacing.md)
9. [9. クラスとスタイル](09-domr-styling-overview.md)
10. [10. 優先順位のリスト](10-domr-style-binding-list.md)
11. **11. 値を決めて書く**（この章）
12. [12. \[class\] と \[style\]](12-domr-styling-maps.md)
13. [13. EventManager](13-domr-event-manager.md)
14. [14. listen](14-domr-listen.md)
15. [15. キーのイベント](15-domr-key-events.md)
16. [16. 自分のプラグイン](16-domr-custom-plugin.md)
17. [17. サニタイズ](17-domr-sanitization.md)
18. [18. 信頼の印](18-domr-trusted-types.md)
19. [19. Title と Meta](19-domr-title-meta.md)
20. [20. issue と PR を読む](20-domr-issues.md)

## 1. 入口：checkStylingProperty

📄 `angular/packages/core/src/render3/instructions/styling.ts` L206–237 （▶ の行: 214–219, 221–223, 225–226, 232）

```ts
206 │ export function checkStylingProperty(
207 │   prop: string,
208 │   value: any | NO_CHANGE,
209 │   suffix: string | undefined | null,
210 │   isClassBased: boolean,
211 │ ): void {
212 │   const lView = getLView();
213 │   const tView = getTView();
214 ▶   // Styling instructions use 2 slots per binding.
215 ▶   // 1. one for the value / TStylingKey
216 ▶   // 2. one for the intermittent-value / TStylingRange
217 ▶   const bindingIndex = incrementBindingIndex(2);
218 ▶   if (tView.firstUpdatePass) {
219 ▶     stylingFirstUpdatePass(tView, prop, bindingIndex, isClassBased);
220 │   }
221 ▶   if (value !== NO_CHANGE && bindingUpdated(lView, bindingIndex, value)) {
222 ▶     if (ngDevMode && !isClassBased) {
223 ▶       warnInvalidStylePropValue(prop, value);
224 │     }
225 ▶     const tNode = tView.data[getSelectedIndex()] as TNode;
226 ▶     updateStyling(
227 │       tView,
228 │       tNode,
229 │       lView,
230 │       lView[RENDERER],
231 │       prop,
232 ▶       (lView[bindingIndex + 1] = normalizeSuffix(value, suffix)),
233 │       isClassBased,
234 │       bindingIndex,
235 │     );
236 │   }
237 │ }
```

1. **214〜217 行目：1 つのバインディングに枠を 2 つ**

   `incrementBindingIndex(2)` で番号を 2 つ進めます。`lView[i]` にはアプリから来た生の値（変化の確認に使う）、`lView[i + 1]` には単位を付けたあとの値を入れます。同じ番号の `tData[i]`・`tData[i + 1]` が第 10 回の名前と `TStylingRange` です。[第 9 回](09-domr-styling-overview.md)の `vars: 16` が 2 倍になっているのはこのためです。
2. **218〜220 行目：初回だけリストを作る**

   firstUpdatePass なら `stylingFirstUpdatePass`（第 10 回）でリストに入れます。値の書き込みはそのあと、同じ呼び出しの中で続けて行います。
3. **221 行目：変わったときだけ**

   `NO_CHANGE` でなく、`bindingUpdated`（`Object.is` で前の値と比べて、違えば書き換えて true。[値を更新する命令の章](../ivy/10-ivy-update-instructions.md)）が true のときだけ先へ進みます。値が同じなら、優先順位の計算も renderer の呼び出しもしません。
4. **222〜224 行目：開発モードの警告（スタイルだけ）**

   2 節で読みます。
5. **225・226・232 行目：単位を付けて `updateStyling` へ**

   選ばれている要素の TNode を取り、232 行目で `normalizeSuffix(value, suffix)` の結果を `lView[bindingIndex + 1]` に書きながら、その値を `updateStyling` に渡します。

## 2. 単位と、サニタイズが無いこと

📄 `angular/packages/core/src/render3/instructions/styling.ts` L1024–1039 （▶ の行: 1028, 1031, 1033–1036）

```ts
1024 │ function normalizeSuffix(
1025 │   value: any,
1026 │   suffix: string | undefined | null,
1027 │ ): string | null | undefined | boolean {
1028 ▶   if (value == null || value === '') {
1029 │     // do nothing
1030 │     // Do not add the suffix if the value is going to be empty.
1031 ▶     // As it produce invalid CSS, which the browsers will automatically omit but Domino will not.
1032 │     // Example: `"left": "px;"` instead of `"left": ""`.
1033 ▶   } else if (typeof suffix === 'string') {
1034 ▶     value = unwrapSafeValue(value) + suffix;
1035 ▶   } else if (typeof value === 'object') {
1036 ▶     value = stringify(unwrapSafeValue(value));
1037 │   }
1038 │   return value;
1039 │ }
```

1033〜1034 行目、`[style.width.px]` の `px`（[第 9 回](09-domr-styling-overview.md)の出力の 3 つ目の引数）は、ここで値の後ろに文字列としてつなぐだけです。1028 行目、`null`・`undefined`・空文字には付けません。1031 行目のコメントのとおり、`"px"` だけの不正な値を作らないためです。1035〜1036 行目、単位の無いオブジェクトは文字列にします。どちらも `unwrapSafeValue` を通すので、`DomSanitizer.bypassSecurityTrustStyle` で包んだ値（[第 18 回](18-domr-trusted-types.md)）は中身の文字列に戻ります。

ここにも、このあとの行にも、**スタイルの値をサニタイズする処理はありません**。`[style]` / `[style.prop]` のサニタイズは 2020 年の commit 45f4a472863（#36965、refactor(core): remove style sanitization code）で取り除かれました。acceptance の spec にも「should not sanitize style values before writing them」という it があります（テストの節）。`[style]` と `[style.x]` のバインディングでは、`bypassSecurityTrustStyle` の包みは外されるだけです（`[attr.style]` のようなほかの場所の扱いとサニタイズそのものは[第 17 回](17-domr-sanitization.md)）。

📄 `angular/packages/core/src/render3/instructions/styling.ts` L239–257 （▶ の行: 241–244, 249, 251）

```ts
239 │ function warnInvalidStylePropValue(prop: string, value: unknown): void {
240 │   if (
241 ▶     value == null ||
242 ▶     typeof value === 'string' ||
243 ▶     typeof value === 'number' ||
244 ▶     getSanitizationBypassType(value) === BypassType.Style
245 │   ) {
246 │     return;
247 │   }
248 │ 
249 ▶   console.warn(
250 │     formatRuntimeError(
251 ▶       RuntimeErrorCode.INVALID_STYLE_PROP_VALUE,
252 │       `\`[style.${prop}]\` was bound to an invalid value. ` +
253 │         `Expected a string, number, SafeValue, null, or undefined, but received ` +
254 │         `\`${typeof value}\` (\`${stringifyInvalidStylePropValue(value)}\`).`,
255 │     ),
256 │   );
257 │ }
```

代わりにあるのは開発モードの警告です。241〜244 行目、`null`・`undefined`・文字列・数・スタイルの `SafeValue` 以外（たとえばオブジェクトや真偽値）を `[style.x]` に渡すと、249〜251 行目で `NG0318`（`INVALID_STYLE_PROP_VALUE`）を `console.warn` に出します。2026-07 の commit e43eb96341b（fix(core): warn when style property bindings receive invalid values）で入りました。値はそのまま書かれ、動きは変わりません。

> [!NOTE]
> **ポイント**
>
> 逆に「`[style.width]="500"` のように単位の要る名前に数を渡した」ことを見つけるのはコンパイラの仕事になりました。issue #61381 を閉じた commit 1f1d4d1b8b5（feat(compiler-cli): add check for numeric CSS properties requiring units、NG8119 の extended diagnostic）は main に入っていますが、ここで読んでいる 8576f161ae4 にはまだありません（`git merge-base --is-ancestor` で確かめました）。

## 3. 書くかどうかを決める：updateStyling

📄 `angular/packages/core/src/render3/instructions/styling.ts` L881–913 （▶ の行: 891, 894, 897–901, 903, 905, 907, 910–911）

```ts
881 │ function updateStyling(
882 │   tView: TView,
883 │   tNode: TNode,
884 │   lView: LView,
885 │   renderer: Renderer,
886 │   prop: string,
887 │   value: string | undefined | null | boolean,
888 │   isClassBased: boolean,
889 │   bindingIndex: number,
890 │ ) {
891 ▶   if (!(tNode.type & TNodeType.AnyRNode)) {
892 │     // It is possible to have styling on non-elements (such as ng-container).
893 │     // This is rare, but it does happen. In such a case, just ignore the binding.
894 ▶     return;
895 │   }
896 │   const tData = tView.data;
897 ▶   const tRange = tData[bindingIndex + 1] as TStylingRange;
898 ▶   const higherPriorityValue = getTStylingRangeNextDuplicate(tRange)
899 ▶     ? findStylingValue(tData, tNode, lView, prop, getTStylingRangeNext(tRange), isClassBased)
900 ▶     : undefined;
901 ▶   if (!isStylingValuePresent(higherPriorityValue)) {
902 │     // We don't have a next duplicate, or we did not find a duplicate value.
903 ▶     if (!isStylingValuePresent(value)) {
904 │       // We should delete current value or restore to lower priority value.
905 ▶       if (getTStylingRangePrevDuplicate(tRange)) {
906 │         // We have a possible prev duplicate, let's retrieve it.
907 ▶         value = findStylingValue(tData, null, lView, prop, bindingIndex, isClassBased);
908 │       }
909 │     }
910 ▶     const rNode = getNativeByIndex(getSelectedIndex(), lView) as RElement;
911 ▶     applyStyling(renderer, isClassBased, rNode, prop, value);
912 │   }
913 │ }
```

1. **891〜895 行目：要素でなければ何もしない**

   `<ng-container [class.x]>` のように DOM の要素が無いノードのバインディングは黙って捨てます。
2. **897〜900 行目：上（高い側）に勝つ値があるか**

   自分の `TStylingRange` に next 側の重複の印（第 10 回）があるときだけ、`findStylingValue` を next の向きに呼びます（4 節）。印が無ければ探さずに `undefined` です。名前の違うバインディングしか無い要素では、ここで何も探しません。
3. **901 行目：上に値があれば、ここで終わり**

   上のバインディングが値を持っていれば、DOM は上の値のままでよいので何も書きません。デモで、ディレクティブの `[style.width.px]` を変えても呼び出しが 0 件になるのはこの行です。
4. **903〜908 行目：自分が「値なし」なら下を探す**

   自分の値が `undefined` で、prev 側の印があれば、`findStylingValue` を prev の向き（第 2 引数が `null`）に呼んで、下の値に置き換えます。**ここで「値なし」と見なされるのは `undefined` だけ**です（4 節の `isStylingValuePresent`）。
5. **910〜911 行目：要素を取り出して書く**

   LView から DOM の要素を取り、`applyStyling`（5 節）に、決まった値を渡します。

## 4. 値を探す：findStylingValue

📄 `angular/packages/core/src/render3/instructions/styling.ts` L956–991 （▶ の行: 956, 958–959, 962–965, 973, 975, 977, 980–981, 983, 985–986, 990）

```ts
956 ▶   const isPrevDirection = tNode === null;
957 │   let value: any = undefined;
958 ▶   while (index > 0) {
959 ▶     const rawKey = tData[index] as TStylingKey;
960 │     const containsStatics = Array.isArray(rawKey);
961 │     // Unwrap the key if we contain static values.
962 ▶     const key = containsStatics ? (rawKey as string[])[1] : rawKey;
963 ▶     const isStylingMap = key === null;
964 ▶     let valueAtLViewIndex = lView[index + 1];
965 ▶     if (valueAtLViewIndex === NO_CHANGE) {
966 │       // In firstUpdatePass the styling instructions create a linked list of styling.
967 │       // On subsequent passes it is possible for a styling instruction to try to read a binding
968 │       // which
969 │       // has not yet executed. In that case we will find `NO_CHANGE` and we should assume that
970 │       // we have `undefined` (or empty array in case of styling-map instruction) instead. This
971 │       // allows the resolution to apply the value (which may later be overwritten when the
972 │       // binding actually executes.)
973 ▶       valueAtLViewIndex = isStylingMap ? EMPTY_ARRAY : undefined;
974 │     }
975 ▶     let currentValue = isStylingMap
976 │       ? keyValueArrayGet(valueAtLViewIndex, prop)
977 ▶       : key === prop
978 │         ? valueAtLViewIndex
979 │         : undefined;
980 ▶     if (containsStatics && !isStylingValuePresent(currentValue)) {
981 ▶       currentValue = keyValueArrayGet(rawKey as KeyValueArray<any>, prop);
982 │     }
983 ▶     if (isStylingValuePresent(currentValue)) {
984 │       value = currentValue;
985 ▶       if (isPrevDirection) {
986 ▶         return value;
987 │       }
988 │     }
989 │     const tRange = tData[index + 1] as TStylingRange;
990 ▶     index = isPrevDirection ? getTStylingRangePrev(tRange) : getTStylingRangeNext(tRange);
991 │   }
```

1. **956 行目：向きは引数で決まる**

   `tNode` を渡されたら next の向き（上に勝つ値があるか）、`null` なら prev の向き（下に戻る値は何か）です。
2. **959〜964 行目：その場所の名前と値**

   `tData[index]` が配列なら静的な値で包まれているので、962 行目で `[1]` の名前を取り出します。963 行目、名前が `null` なら map です。964 行目、値は `lView[index + 1]`（単位を付けたあとの値）です。
3. **965〜974 行目：まだ実行していないバインディング**

   初回は、自分より後ろのバインディングがまだ実行されていないので、その枠は `NO_CHANGE` です（966〜972 行目のコメント）。それを `undefined`（map なら空の配列）と見なして先へ進みます。デモで描いた直後に `setStyle(…, "50px")` → `setStyle(…, "30px")` と 2 回書かれるのはこのためです。先に実行した `[style]` は、まだ `NO_CHANGE` の `[style.width.px]` を「値なし」と見て 50px を書き、続いて `[style.width.px]` が 30px で上書きします。
4. **975〜982 行目：その場所が持っている値**

   map なら KeyValueArray の中から `prop` を（第 12 回）、名前のバインディングなら名前が同じときだけその値を取ります。値が無く、静的な値で包まれていれば、981 行目で静的な値の中から探します。
5. **983〜987 行目：見つけたら**

   prev の向きなら、最初に見つけたもの（自分にいちばん近い下）をすぐ返します。next の向きなら覚えておいて、端まで進みます。最後に見つけたもの、つまりいちばん上の値が残ります。
6. **990 行目：次の場所へ**

   向きに応じて prev か next の番号に移ります。0 で終わりです。

📄 `angular/packages/core/src/render3/instructions/styling.ts` L992–1015 （▶ の行: 992, 995–997, 1014）

```ts
 992 ▶   if (tNode !== null) {
 993 │     // in case where we are going in next direction AND we did not find anything, we need to
 994 │     // consult residual styling
 995 ▶     let residual = isClassBased ? tNode.residualClasses : tNode.residualStyles;
 996 ▶     if (residual != null /** OR residual !=== undefined */) {
 997 ▶       value = keyValueArrayGet(residual!, prop);
 998 │     }
 999 │   }
1000 │   return value;
1001 │ }
1002 │ 
1003 │ /**
1004 │  * Determines if the binding value should be used (or if the value is 'undefined' and hence priority
1005 │  * resolution should be used.)
1006 │  *
1007 │  * @param value Binding style value.
1008 │  */
1009 │ function isStylingValuePresent(value: any): boolean {
1010 │   // Currently only `undefined` value is considered non-binding. That is `undefined` says I don't
1011 │   // have an opinion as to what this binding should be and you should consult other bindings by
1012 │   // priority to determine the valid value.
1013 │   // This is extracted into a single function so that we have a single place to control this.
1014 ▶   return value !== undefined;
1015 │ }
```

992〜998 行目、next の向きで何も見つからなければ、最後に TNode の residual（ホストよりも強い静的な値の残り。第 12 回）を見ます。1014 行目が「値がある」の定義です。**`undefined` だけが「意見なし」で、`null` と `false` と空文字は「値がある」**扱いです。だから `null` を渡したバインディングは、下の値を探しに行かず（903 行目に入らない）、上の値としても勝ちます（901 行目で止まる）。

| 自分の値 | 903 行目 | applyStyling に渡る値 | DOM |
| --- | --- | --- | --- |
| `'30px'`・`true` | 入らない | 自分の値 | 書く・付ける |
| `null`・`false` | 入らない | `null`・`false` | 消す（下に値があっても） |
| `undefined` | 入る | 下で最初に見つかった値（無ければ `undefined`） | 下の値を書く。無ければ消す |

## 5. renderer を呼び分ける：applyStyling

📄 `angular/packages/core/src/render3/node_manipulation.ts` L1134–1166 （▶ の行: 1141, 1143–1144, 1146, 1149–1151, 1155, 1159–1160, 1163）

```ts
1134 │ export function applyStyling(
1135 │   renderer: Renderer,
1136 │   isClassBased: boolean,
1137 │   rNode: RElement,
1138 │   prop: string,
1139 │   value: any,
1140 │ ) {
1141 ▶   if (isClassBased) {
1142 │     // We actually want JS true/false here because any truthy value should add the class
1143 ▶     if (!value) {
1144 ▶       renderer.removeClass(rNode, prop);
1145 │     } else {
1146 ▶       renderer.addClass(rNode, prop);
1147 │     }
1148 │   } else {
1149 ▶     let flags = prop.indexOf('-') === -1 ? undefined : (RendererStyleFlags2.DashCase as number);
1150 ▶     if (value == null /** || value === undefined */) {
1151 ▶       renderer.removeStyle(rNode, prop, flags);
1152 │     } else {
1153 │       // A value is important if it ends with `!important`. The style
1154 │       // parser strips any semicolons at the end of the value.
1155 ▶       const isImportant = typeof value === 'string' ? value.endsWith('!important') : false;
1156 │ 
1157 │       if (isImportant) {
1158 │         // !important has to be stripped from the value for it to be valid.
1159 ▶         value = value.slice(0, -10);
1160 ▶         flags! |= RendererStyleFlags2.Important;
1161 │       }
1162 │ 
1163 ▶       renderer.setStyle(rNode, prop, value, flags);
1164 │     }
1165 │   }
1166 │ }
```

1. **1141〜1147 行目：クラスは真偽で 2 つに**

   `!value` なら `removeClass`、そうでなければ `addClass`。1142 行目のコメントのとおり、`'truthy'` のような値でもクラスは付きます。
2. **1149 行目：名前に `-` があれば DashCase**

   `background-color` や `--x` は `RendererStyleFlags2.DashCase`（値は 2。定義は[第 2 回](02-domr-renderer-api.md)）、`fontSize` のような名前は `undefined` です。
3. **1150〜1151 行目：`null` と `undefined` は `removeStyle`**

   スタイルは `==` で比べるので、`false` や空文字はここに入らず `setStyle` に進みます。
4. **1155〜1160 行目：`!important` を外して印に**

   値の文字列が `!important` で終われば、1159 行目で最後の 10 文字を切り、1160 行目で `Important`（値は 1）を足します。`'gold !important'` は `'gold '`（後ろに空白が残る）、`'red!important'` は `'red'` になります。
5. **1163 行目：`setStyle`**

   名前と値と flags を renderer に渡します。ここから先は platform-browser です。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L429–460 （▶ の行: 430, 434, 438–440, 442–443, 445, 450, 454, 456, 458）

```ts
429 │   addClass(el: any, name: string): void {
430 ▶     el.classList.add(name);
431 │   }
432 │ 
433 │   removeClass(el: any, name: string): void {
434 ▶     el.classList.remove(name);
435 │   }
436 │ 
437 │   setStyle(el: any, style: string, value: any, flags: RendererStyleFlags2): void {
438 ▶     const isVariable = style.startsWith('--');
439 ▶     if (isVariable) {
440 ▶       style = style.replace('%NS%', this.cssVarNamespace);
441 │     }
442 ▶     if (isVariable || flags & (RendererStyleFlags2.DashCase | RendererStyleFlags2.Important)) {
443 ▶       el.style.setProperty(style, value, flags & RendererStyleFlags2.Important ? 'important' : '');
444 │     } else {
445 ▶       el.style[style] = value;
446 │     }
447 │   }
448 │ 
449 │   removeStyle(el: any, style: string, flags: RendererStyleFlags2): void {
450 ▶     const isVariable = style.startsWith('--');
451 │     if (isVariable) {
452 │       style = style.replace('%NS%', this.cssVarNamespace);
453 │     }
454 ▶     if (isVariable || flags & RendererStyleFlags2.DashCase) {
455 │       // removeProperty has no effect when used on camelCased properties.
456 ▶       el.style.removeProperty(style);
457 │     } else {
458 ▶       el.style[style] = '';
459 │     }
460 │   }
```

430・434 行目、クラスは `classList.add` / `remove` だけです。438〜441 行目、`--` で始まる CSS 変数は名前の `%NS%` を置き換えます（[第 8 回](08-domr-css-var-namespacing.md)）。442〜443 行目、CSS 変数か DashCase か Important のときは `el.style.setProperty(name, value, 'important' か '')`、445 行目、それ以外は `el.style[style] = value` です。`setProperty` は `font-size` の形しか受け付けず、`el.style[…]` は `fontSize` の形を受け付けるので、1149 行目の印で分けています。454〜458 行目の `removeStyle` も同じで、456 行目のコメントのとおり `removeProperty` は camelCase の名前には効かないので、458 行目で空文字を入れて消します。

> **🧪 DEMO — 高いほうを null にするか undefined にするか**
>
> この章で定義した本物のコンポーネント `DomrSaTarget` の `<p>` に、低い順に 静的な `style="width: 8px"`・ディレクティブ `DomrSaDir` の host の `[style.width.px]`・テンプレートの `[style]`・テンプレートの `[style.width.px]` を重ねています。`mountWithLog`（`domr-probe.ts`）が、このサイトの本物の `DomRendererFactory2` に届いた呼び出しを記録します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-styling-apply)

デモで確かめられることです（2026-11-04 に headless Chrome の開発ビルドで記録したものと同じになります）。

1. **描いた直後：`setStyle(…, "50px")` → `setStyle(…, "30px")`**

   4 節の 965〜974 行目。初回は、まだ実行していない上のバインディングを「値なし」と見るので、下の `[style]` がいったん書きます。ディレクティブの 20 はホストなので最後に実行され、901 行目で止まります。
2. **`[style.width.px]` を undefined：`setStyle(…, "50px")`**

   903〜908 行目で下を探し、すぐ下の `[style]` の 50px を見つけて 986 行目で返します。
3. **`[style]` を `{}`：`setStyle(…, "8px")`**

   map から width が消えたので、その下を探して静的な 8px を見つけます（981 行目。静的な値はテンプレートの最初のバインディング＝この `[style]` に包まれている）。ディレクティブの 20px より静的な 8px が先に見つかります。
4. **`[style.width.px]` を null：`removeStyle(…, "width")`**

   null は「値がある」ので下を探さず、1150〜1151 行目で消します。静的な 8px もディレクティブの 20px も戻りません。
5. **&lt;i&gt; の `[style]` に `background-color` / `gold !important`：`setStyle(<i>, "background-color", "gold ", 3)`**

   3 は DashCase（2）と Important（1）。同じ値でもう一度渡すと、新しいオブジェクトでも呼び出しは 0 件です（map の中を名前ごとに比べるため。第 12 回）。
6. **名前を `fontSize` → `font-size` の順に変える**

   `fontSize` は flags が `undefined` で `el.style.fontSize = "20px"`。続けて `font-size` にすると、`setStyle(…, "font-size", "18px", 2)` の**あとに**`removeStyle(…, "fontSize", undefined)` が来て、458 行目の `el.style.fontSize = ''` が今書いた値も消し、style 属性は空になります。map の名前を辞書順に比べる第 12 回の `updateStylingMap` の順番（`'font-size'` が `'fontSize'` より前）と、DOM の上では同じプロパティであることが重なって起きます。issue #37224（shorthand と longhand）と同じ形です（第 12 回）。

## ここまでの呼び出し

- 👤 `ɵɵstyleProp("width", ctx.w(), "px")` — 生成コード（更新）
  - `checkStylingProperty("width", 30, "px", false)` — instructions/styling.ts L206 — *incrementBindingIndex(2)*
    - `bindingUpdated(lView, bindingIndex, 30)` — render3/bindings.ts — *Object.is。同じなら終わり*
    - `normalizeSuffix(30, "px") → "30px"` — styling.ts L1024 — *lView\[bindingIndex + 1\] に保存*
    - `updateStyling(tView, tNode, lView, renderer, "width", "30px", false, bindingIndex)` — styling.ts L881
      - `findStylingValue(…, tNode, …, next)` — styling.ts L943 — *next の印があるときだけ。値があれば書かない*
      - `findStylingValue(…, null, …, prev)` — styling.ts L943 — *自分が undefined のときだけ*
      - `applyStyling(renderer, false, el, "width", "30px")` — render3/node\_manipulation.ts L1134 — *DashCase / Important の flags*
        - `renderer.setStyle(el, "width", "30px", undefined)` — platform-browser dom\_renderer.ts L437 — *el.style.width = "30px"*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| core/test/render3/instructions/styling\_spec.ts | describe `styling`（45）の it `should search across multiple instructions backwards`（57）・`…forwards`（72）・`should set style based on priority`（85）・`should set class based on priority`（110）、describe `styleMap` の describe `suffix`（197、it 2） | `//packages/core/test/render3:render3` |
| core/test/acceptance/styling\_spec.ts | it `should set !important on a single property`（893）ほか `should set !important…` 5 つ、`should apply a unit to a style before writing it`（2344）、`should not sanitize style values before writing them`（2282）・`…with styleMap`（2312）、`should convert camelCased style property names to snake-case`（3443）、`should combine all styling across the template, directive and component host bindings`（1909） | `//packages/core/test/acceptance:acceptance` |

📄 `angular/packages/core/test/render3/instructions/styling_spec.ts` L85–108 （▶ の行: 86–87, 93, 97–98, 102–103, 106–107）

```ts
 85 │   it('should set style based on priority', () => {
 86 ▶     ɵɵstyleProp('color', 'red');
 87 ▶     ɵɵstyleProp('color', 'blue'); // Higher priority, should win.
 88 │     expectStyle(div).toEqual({color: 'blue'});
 89 │ 
 90 │     clearFirstUpdatePass();
 91 │     rewindBindingIndex();
 92 │     ɵɵstyleProp('color', 'red'); // no change
 93 ▶     ɵɵstyleProp('color', 'green'); // change to green
 94 │     expectStyle(div).toEqual({color: 'green'});
 95 │ 
 96 │     rewindBindingIndex();
 97 ▶     ɵɵstyleProp('color', 'black'); // First binding update
 98 ▶     expectStyle(div).toEqual({color: 'green'}); // Green still has priority.
 99 │ 
100 │     rewindBindingIndex();
101 │     ɵɵstyleProp('color', 'black'); // no change
102 ▶     ɵɵstyleProp('color', undefined); // Clear second binding
103 ▶     expectStyle(div).toEqual({color: 'black'}); // default to first binding
104 │ 
105 │     rewindBindingIndex();
106 ▶     ɵɵstyleProp('color', null);
107 ▶     expectStyle(div).toEqual({}); // default to first binding
108 │   });
```

コンポーネントを作らずに、`ɵɵstyleProp` を同じ要素に 2 回呼んで 2 つのバインディングにしています（`rewindBindingIndex` で番号を戻して 2 回目の変更検知のふりをする）。97〜98 行目、低いほうを black にしても高いほうの green が残る（901 行目）。102〜103 行目、高いほうを `undefined` にすると低いほうの black に戻る（903〜908 行目）。106〜107 行目、低いほうを `null` にすると消える、です。

📄 `angular/packages/core/test/acceptance/styling_spec.ts` L1971–1991 （▶ の行: 1971–1972, 1978, 1987–1988, 1991）

```ts
1971 ▶     fixture.componentInstance.width = undefined;
1972 ▶     fixture.componentInstance.opacity = undefined;
1973 │     fixture.componentInstance.tplClass = false;
1974 │     fixture.detectChanges();
1975 │ 
1976 │     expectStyle(element).toEqual({
1977 │       'color': 'red',
1978 ▶       'width': '900px',
1979 │       'height': '900px',
1980 │       'font-size': '100px',
1981 │     });
1982 │     expectClass(element).toEqual({
1983 │       'dir': true,
1984 │       'comp': true,
1985 │     });
1986 │ 
1987 ▶     fixture.componentInstance.width = null;
1988 ▶     fixture.componentInstance.opacity = null;
1989 │     fixture.detectChanges();
1990 │ 
1991 ▶     expectStyle(element).toEqual({'color': 'red', 'height': '900px', 'font-size': '100px'});
```

こちらは本物のコンポーネントで、テンプレートの `[style.width]`・`[style.opacity]` の上に、コンポーネントの host の `[style.width]`（900px）があります。1971 行目で `undefined` にすると 1978 行目でホストの 900px に戻り、1987 行目で `null` にすると 1991 行目のとおり width はホストに値があっても消えます。4 節の表のとおりです。

📄 `angular/packages/core/test/acceptance/styling_spec.ts` L893–910 （▶ の行: 903, 907–909）

```ts
893 │   it('should set !important on a single property', () => {
894 │     @Component({
895 │       template: '<div [style.width]="width"></div>',
896 │       changeDetection: ChangeDetectionStrategy.Eager,
897 │     })
898 │     class Cmp {
899 │       width!: string;
900 │     }
901 │ 
902 │     const fixture = TestBed.createComponent(Cmp);
903 ▶     fixture.componentInstance.width = '50px !important';
904 │     fixture.detectChanges();
905 │     const html = fixture.nativeElement.innerHTML;
906 │ 
907 ▶     // We have to check the `style` attribute, because `element.style.prop` doesn't include
908 ▶     // `!important`. Use a regex, because the different renderers produce different whitespace.
909 ▶     expect(html).toMatch(/style=["|']width:\s*50px\s*!important/);
910 │   });
```

907〜908 行目のコメントのとおり、`element.style.width` には `!important` が出ないので、HTML の style 属性を正規表現で見ています。1160 行目の `Important` の印が `setProperty(…, 'important')` になったことの確認です。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/render3:render3 \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=^styling (should search|should set style based|should set class based|styleMap suffix)'
pnpm bazel test //packages/core/test/acceptance:acceptance \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=^styling (should set !important|should apply a unit|should not sanitize|should convert camelCased|should combine all styling)'
```

📄 `出力（2026-11-04 に実行。抜粋。ログは scratchpad/domr-logs/c-sa-r3.log・c-sa-acc.log）`

```
# render3
Ran 6 of 574 specs
6 specs, 0 failures
//packages/core/test/render3:render3                                     PASSED in 0.8s
# acceptance
Ran 10 of 2693 specs
10 specs, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.4s
```

- render3 の 6 件 = `should search across` 2・`should set style based on priority` 1・`should set class based on priority` 1・`styleMap suffix` 2。
- acceptance の 10 件 = `should set !important` 5・`should apply a unit` 1・`should not sanitize` 2・`should convert camelCased` 1・`should combine all styling` 1。

### 直すとしたら

- 「どの値を書くか」は `updateStyling`（881〜913 行目）と `findStylingValue`（956〜1015 行目）で、it は render3 の instructions/styling\_spec.ts に、85 行目の形（命令を直接呼んで `rewindBindingIndex` で 2 回目にする）で足すのがいちばん小さく書けます。
- 「どう書くか」（flags・`!important`・単位）は `applyStyling`（node\_manipulation.ts 1134〜1166 行目）と `normalizeSuffix`（1024〜1039 行目）で、DOM の結果を見る acceptance の it（893 行目の形）が合います。renderer の側は dom\_renderer.ts の 437〜460 行目で、platform-browser の dom\_renderer\_spec.ts です。
- 2026 年のこの関数のまわりの修正は、開発モードの警告（e43eb96341b、2026-07。値を正しくするのではなく、知らせるだけ）と、`ɵɵclassProp` の引数の型を `any` に広げた 779f67777d1（2026-08。`[class.x]="items.length"` を型の検査で落とさないため）です。どちらも「動きを変えずに、知らせ方や型を直す」形でした。本家に PR を出すことは勧めません。手元で it を走らせ、issue を読むときに「それは 901 行目で止まっている」「903 行目に入らない `null` だ」と言い当てる手がかりにします（[第 20 回](20-domr-issues.md)）。

## 聞かれそうな質問

**Q. `[style.width.px]="cond ? 10 : null"` で、cond が false のときに静的な `style="width: 8px"` に戻らないのはなぜ？**

`null` は「値がある」扱いだからです（1014 行目は `undefined` だけを「値なし」とする）。903 行目に入らないので下の値を探さず、1150〜1151 行目で `removeStyle` されます。下に戻したいなら `undefined` を渡します。

**Q. 同じ値を何度渡しても DOM に書きますか？**

書きません。221 行目の `bindingUpdated` が `Object.is` で前の値と比べ、同じなら `updateStyling` まで進みません。

**Q. `[style.width.px]` の `px` は誰が付けますか？**

コンパイラは `ɵɵstyleProp("width", v, "px")` と 3 つ目の引数で渡すだけで、実行時に `normalizeSuffix` が文字列としてつなぎます（1033〜1034 行目）。`null` や空文字には付けません（1028 行目）。

**Q. `[style.background-image]` に `url(javascript:…)` を入れたら止められますか？**

止められません。スタイルのバインディングのサニタイズは 2020 年の 45f4a472863 で取り除かれ、styling.ts には `unwrapSafeValue`（包みを外すだけ）しかありません。acceptance の it「should not sanitize style values before writing them」はそのまま書かれることを確かめています。

**Q. `!important` はどう扱われますか？**

値が `!important` で終わる文字列なら、`applyStyling` が最後の 10 文字を切って `RendererStyleFlags2.Important` を立て（1155〜1160 行目）、renderer が `el.style.setProperty(name, value, 'important')` を呼びます（dom\_renderer.ts 442〜443 行目）。

**Q. ホストのバインディングを変えたのに DOM が変わらないのはなぜ？**

テンプレートかもっと後のディレクティブに、同じ名前の値があるからです。next の印があると 898〜899 行目で上を探し、値が見つかれば 901 行目で何も書きません。上の値が `undefined` になると、そのときに下の値が書かれます。

## 読み終えて

- 1 つのバインディングは LView に生の値と単位付きの値の 2 つを持ち、`bindingUpdated` で変わったときだけ先へ進む。
- `updateStyling` は「上に値があれば書かない」「自分が undefined なら下を探す」の 2 つだけを決める。
- `undefined` だけが「意見なし」。`null`・`false` は下があっても消す。
- `applyStyling` は名前の `-` で DashCase、値の `!important` で Important を立て、renderer は `setProperty` と `el.style[…]` を使い分ける。
- スタイルの値のサニタイズは無い。あるのは開発モードの NG0318 の警告だけ。

---

← 前: [優先順位の連結リスト：style\_binding\_list.ts](10-domr-style-binding-list.md)  
次: [\[class\] と \[style\] のマップ：文字列・配列・オブジェクト](12-domr-styling-maps.md) →
