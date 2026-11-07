[目次](../README.md) › [テンプレートコンパイラの内側](README.md) › 第 18 回 / 全 18 回

# スタイルのカプセル化：shadow\_css.ts が CSS セレクタを書き換える

> ViewEncapsulation.Emulated のとき、shadow\_css.ts の ShadowCss.shimCssText がコンポーネントの CSS を読み、各セレクタに \[\_ngcontent-%COMP%\] を付け、:host を \[\_nghost-%COMP%\] に、:host-context と ::ng-deep を書き換える行。コメントと文字列の退避、@media / @supports の中身の扱い、%COMP% が実行時に platform-browser の EmulatedEncapsulationDomRenderer2 で APP\_ID と ɵcmp.id に置き換わる場所。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-shadow-css)

---

コンポーネントの `styles` に書いた `p { color: red }` が、他のコンポーネントの `<p>` を赤くしないのはなぜか。`ViewEncapsulation.Emulated`（既定）では、コンパイラの `ShadowCss.shimCssText` が CSS の**文字列を書き換え**、各セレクタに `[_ngcontent-%COMP%]` を付け、`:host` を `[_nghost-%COMP%]` に、`:host-context` と `::ng-deep` を別の形に直します。そして実行時に platform-browser のレンダラが `%COMP%` を「App ID とコンポーネント ID」に置き換え、同じ属性を DOM の要素に付けます。この章では両側の行を順に読みます。

読む対象は `compiler/src/shadow_css.ts`、`compiler/src/render3/view/compiler.ts` の styles の部分、テスト `compiler/test/shadow_css/`、実行時側の `platform-browser/src/dom/dom_renderer.ts`・`core/src/render3/definition.ts`・`core/src/application/application_tokens.ts` です。

1. [1. 全体図](01-compiler.md)
2. [2. コンパイラの入口](02-compiler-entry.md)
3. [3. HTML の字句解析](03-compiler-html-lexer.md)
4. [4. HTML の構文解析](04-compiler-html-parser.md)
5. [5. 式のパーサ](05-compiler-expression-parser.md)
6. [6. バインディングのパーサ](06-compiler-binding-parser.md)
7. [7. R3 AST](07-compiler-r3-ast.md)
8. [8. ブロック構文の解析](08-compiler-control-flow-blocks.md)
9. [9. ディレクティブの照合](09-compiler-binder.md)
10. [10. IR への写像](10-compiler-ingest.md)
11. [11. IR の構造](11-compiler-ir.md)
12. [12. decls・vars・advance](12-compiler-slots-vars.md)
13. [13. 変数とコンテキスト](13-compiler-variables.md)
14. [14. 定数配列と pure function](14-compiler-consts-pure.md)
15. [15. 制御フローのフェーズ](15-compiler-control-flow-phases.md)
16. [16. reify と出力](16-compiler-reify-emit.md)
17. [17. 型検査（TCB）](17-compiler-typecheck.md)
18. **18. スタイルのカプセル化**（この章）

## 1. どこで shim がかかるか：compileComponentFromMetadata の styles

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L35–37 （▶ の行: 35–37）

```ts
35 ▶ const COMPONENT_VARIABLE = '%COMP%';
36 ▶ const HOST_ATTR = `_nghost-${COMPONENT_VARIABLE}`;
37 ▶ const CONTENT_ATTR = `_ngcontent-${COMPONENT_VARIABLE}`;
```

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L265–298 （▶ の行: 265–266, 272, 274–275, 279, 286, 290, 292, 296–297）

```ts
265 ▶   if (meta.encapsulation === null) {
266 ▶     meta.encapsulation = core.ViewEncapsulation.Emulated;
267 │   }
268 │ 
269 │   let hasStyles = !!meta.externalStyles?.length;
270 │   // e.g. `styles: [str1, str2]`
271 │   if (meta.styles && meta.styles.length) {
272 ▶     const namespacedStyles = meta.styles.map((s) => namespaceCssVariables(s));
273 │     const styleValues =
274 ▶       meta.encapsulation == core.ViewEncapsulation.Emulated
275 ▶         ? compileStyles(namespacedStyles, CONTENT_ATTR, HOST_ATTR)
276 │         : namespacedStyles;
277 │     const styleNodes = styleValues.reduce((result, style) => {
278 │       if (style.trim().length > 0) {
279 ▶         result.push(constantPool.getConstLiteral(o.literal(style)));
280 │       }
281 │       return result;
282 │     }, [] as o.Expression[]);
283 │ 
284 │     if (styleNodes.length > 0) {
285 │       hasStyles = true;
286 ▶       definitionMap.set('styles', o.literalArr(styleNodes));
287 │     }
288 │   }
289 │ 
290 ▶   if (!hasStyles && meta.encapsulation === core.ViewEncapsulation.Emulated) {
291 │     // If there is no style, don't generate css selectors on elements
292 ▶     meta.encapsulation = core.ViewEncapsulation.None;
293 │   }
294 │ 
295 │   // Only set view encapsulation if it's not the default value
296 ▶   if (meta.encapsulation !== core.ViewEncapsulation.Emulated) {
297 ▶     definitionMap.set('encapsulation', o.literal(meta.encapsulation));
298 │   }
```

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L628–653 （▶ の行: 629, 631, 644, 647, 650）

```ts
628 │ function compileStyles(styles: string[], selector: string, hostSelector: string): string[] {
629 ▶   const shadowCss = new ShadowCss();
630 │   return styles.map((style) => {
631 ▶     return shadowCss!.shimCssText(style, selector, hostSelector);
632 │   });
633 │ }
634 │ 
635 │ /**
636 │  * Encapsulates a CSS stylesheet with emulated view encapsulation.
637 │  * This allows a stylesheet to be used with an Angular component that
638 │  * is using the `ViewEncapsulation.Emulated` mode.
639 │  *
640 │  * @param style The content of a CSS stylesheet.
641 │  * @param componentIdentifier The identifier to use within the CSS rules.
642 │  * @returns The encapsulated content for the style.
643 │  */
644 ▶ export function encapsulateStyle(style: string, componentIdentifier?: string): string {
645 │   const shadowCss = new ShadowCss();
646 │   const selector = componentIdentifier
647 ▶     ? CONTENT_ATTR.replace(COMPONENT_VARIABLE, componentIdentifier)
648 │     : CONTENT_ATTR;
649 │   const hostSelector = componentIdentifier
650 ▶     ? HOST_ATTR.replace(COMPONENT_VARIABLE, componentIdentifier)
651 │     : HOST_ATTR;
652 │   return shadowCss.shimCssText(style, selector, hostSelector);
653 │ }
```

1. **265〜267 行目：encapsulation の既定は Emulated**

   デコレータで何も書かなければ `Emulated` として扱います。
2. **272 行目：CSS 変数に名前空間の印を入れる**

   `--brand` を `--%NS%brand` にします（`namespaceCssVariables`）。`%NS%` も実行時に置き換わる印です（5 節の 671 行目）。
3. **274〜276 行目：Emulated なら 1 つずつ `shimCssText`**

   渡すのは 37 行目の `_ngcontent-%COMP%` と 36 行目の `_nghost-%COMP%`。**この時点ではコンポーネントの ID が分からない**ので、`%COMP%` という仮の印のまま埋め込みます（631 行目）。`None` や `ShadowDom` なら書き換えません。
4. **279・286 行目：結果の文字列を ɵcmp の `styles` 配列に**

   279 行目の `getConstLiteral` で定数プールに置き、出力の `styles: [_c0]` になります。
5. **290〜298 行目：スタイルが無ければ None に落とす**

   Emulated でもスタイルが 1 つも無ければ 292 行目で `None` にし、要素に属性を付ける手間を省きます。296〜297 行目、既定値（Emulated）でなければ `encapsulation` を出力します。

644〜653 行目の `encapsulateStyle` は同じ処理の公開版で、ID が分かっていれば 647・650 行目で `%COMP%` を先に置き換えます（angular-cli の開発サーバーが、外部スタイルシートをコンポーネント ID 付きで配信するときに `setup-middlewares-plugin.ts` から呼んでいる）。6 節のデモはこの関数を呼びます。

## 2. shimCssText：コメントを退避して \_scopeCssText へ

📄 `angular/packages/compiler/src/shadow_css.ts` L176–200 （▶ の行: 177–178, 182–185, 188–190, 193, 196, 199）

```ts
176 │   shimCssText(cssText: string, selector: string, hostSelector: string = ''): string {
177 ▶     // **NOTE**: Do not strip comments as this will cause component sourcemaps to break
178 ▶     // due to shift in lines.
179 │ 
180 │     // Collect comments and replace them with a placeholder, this is done to avoid complicating
181 │     // the rule parsing RegExp and keep it safer.
182 ▶     const comments: string[] = [];
183 ▶     cssText = cssText.replace(_commentRe, (m) => {
184 ▶       if (m.match(_commentWithHashRe)) {
185 ▶         comments.push(m);
186 │       } else {
187 │         // Replace non hash comments with empty lines.
188 ▶         // This is done so that we do not leak any sensitive data in comments.
189 ▶         const newLinesMatches = m.match(_newLinesRe);
190 ▶         comments.push(newLinesMatches?.join('') ?? '');
191 │       }
192 │ 
193 ▶       return COMMENT_PLACEHOLDER;
194 │     });
195 │ 
196 ▶     const scopedCssText = this._scopeCssText(cssText, selector, hostSelector);
197 │     // Add back comments at the original position.
198 │     let commentIdx = 0;
199 ▶     return scopedCssText.replace(_commentWithHashPlaceHolderRe, () => comments[commentIdx++]);
200 │   }
```

1. **183〜194 行目：コメントを `%COMMENT%` に置き換える**

   後の正規表現が `/* a { b } */` の中の `{` を規則の始まりと誤解しないよう、先にどけておきます。`/*# sourceMappingURL=… */` だけは 184〜185 行目で元のまま取っておき、それ以外は 189〜190 行目で**改行だけ**を残します。コメントの中身を出力に漏らさないため（188 行目のコメント）と、行数を変えてソースマップをずらさないため（177〜178 行目）です。
2. **196 行目：本体**
3. **199 行目：`%COMMENT%` を元の位置に戻す**

📄 `angular/packages/compiler/src/shadow_css.ts` L416–426 （▶ の行: 418–420, 422–423）

```ts
416 │   private _scopeCssText(cssText: string, scopeSelector: string, hostSelector: string): string {
417 │     // replace :host and :host-context with -shadowcsshost and -shadowcsshostcontext respectively
418 ▶     cssText = this._insertPolyfillHostInCssText(cssText);
419 ▶     cssText = this._convertColonHost(cssText);
420 ▶     cssText = this._convertColonHostContext(cssText);
421 │     if (scopeSelector) {
422 ▶       cssText = this._scopeKeyframesRelatedCss(cssText, scopeSelector);
423 ▶       cssText = this._scopeSelectors(cssText, scopeSelector, hostSelector);
424 │     }
425 │     return cssText.trim();
426 │   }
```

📄 `angular/packages/compiler/src/shadow_css.ts` L922–926 （▶ の行: 924–925）

```ts
922 │   private _insertPolyfillHostInCssText(selector: string): string {
923 │     return selector
924 ▶       .replace(_colonHostContextRe, _polyfillHostContext)
925 ▶       .replace(_colonHostRe, _polyfillHost);
926 │   }
```

📄 `angular/packages/compiler/src/shadow_css.ts` L1012–1031 （▶ の行: 1015, 1023–1025, 1028）

```ts
1012 │ // The deep combinator is deprecated in the CSS spec
1013 │ // Support for `>>>`, `deep`, `::ng-deep` is then also deprecated and will be removed in the future.
1014 │ // see https://github.com/angular/angular/pull/17677
1015 ▶ const _shadowDeepSelectors = /(?:>>>)|(?:\/deep\/)|(?:::ng-deep)/g;
1016 │ 
1017 │ // Splits the selector into independent parts by `,` (comma) unless comma is within parenthesis,
1018 │ // for example `:is(.one, two)`. Negative lookup after comma allows not splitting inside nested
1019 │ // parenthesis, up to three levels (((,))).
1020 │ const _selectorSplitRe =
1021 │   / ?,(?!(?:[^)(]*(?:\([^)(]*(?:\([^)(]*(?:\([^)(]*\)[^)(]*)*\)[^)(]*)*\)[^)(]*)*\))) ?/;
1022 │ const _selectorReSuffix = '([>\\s~+[.,{:][\\s\\S]*)?$';
1023 ▶ const _polyfillHostRe = /-shadowcsshost/gim;
1024 ▶ const _colonHostRe = /:host(?!\-context)/gim;
1025 ▶ const _colonHostContextRe = /:host-context(?=\(\s*[^)\s])/gim;
1026 │ 
1027 │ const _newLinesRe = /\r?\n/g;
1028 ▶ const _commentRe = /\/\*[\s\S]*?\*\//g;
1029 │ const _commentWithHashRe = /\/\*\s*#\s*source(Mapping)?URL=/g;
1030 │ const COMMENT_PLACEHOLDER = '%COMMENT%';
1031 │ const _commentWithHashPlaceHolderRe = new RegExp(COMMENT_PLACEHOLDER, 'g');
```

`_scopeCssText` の 4 段です。418 行目で `:host-context` → `-shadowcsscontext`、`:host` → `-shadowcsshost` という**普通のセレクタとして扱える文字**に置き換え（924〜925 行目、1024〜1025 行目の正規表現）、419・420 行目でそれを「ホストに付く印」に組み直し（3 節）、422 行目で `@keyframes` の名前をコンポーネントごとに分け、423 行目で全セレクタに属性を付けます（4 節）。

## 3. :host と :host-context の書き換え

📄 `angular/packages/compiler/src/shadow_css.ts` L986–1010 （▶ の行: 986, 988, 997, 1005, 1010）

```ts
 986 ▶ const _polyfillHost = '-shadowcsshost';
 987 │ // note: :host-context pre-processed to -shadowcsshostcontext.
 988 ▶ const _polyfillHostContext = '-shadowcsscontext';
 989 │ // Matches text content with no parentheses, e.g., "foo"
 990 │ const _noParens = '[^)(]*';
 991 │ // Matches content with at most ONE level of nesting, e.g., "a(b)c"
 992 │ const _level1Parens = String.raw`(?:\(${_noParens}\)|${_noParens})+?`;
 993 │ // Matches content with at most TWO levels of nesting, e.g., "a(b(c)d)e"
 994 │ const _level2Parens = String.raw`(?:\(${_level1Parens}\)|${_noParens})+?`;
 995 │ const _parenSuffix = String.raw`(?:\((${_level2Parens})\))`;
 996 │ const nthRegex = new RegExp(String.raw`(:nth-[-\w]+)` + _parenSuffix, 'g');
 997 ▶ const _cssColonHostRe = new RegExp(_polyfillHost + _parenSuffix + '?([^,{]*)', 'gim');
 998 │ // note: :host-context patterns are terminated with `{`, as opposed to :host which
 999 │ // is both `{` and `,` because :host-context handles top-level commas differently.
1000 │ const _hostContextPattern = _polyfillHostContext + _parenSuffix + '([^{]*)';
1001 │ const _cssColonHostContextReGlobal = new RegExp(
1002 │   `${_cssScopedPseudoFunctionPrefix}(${_hostContextPattern})`,
1003 │   'gim',
1004 │ );
1005 ▶ const _polyfillHostNoCombinator = _polyfillHost + '-no-combinator';
1006 │ const _polyfillHostNoCombinatorOutsidePseudoFunction = new RegExp(
1007 │   `${_polyfillHostNoCombinator}(?![^(]*\\))`,
1008 │   'g',
1009 │ );
1010 ▶ const _polyfillHostNoCombinatorRe = /-shadowcsshost-no-combinator([^\s,]*)/;
```

📄 `angular/packages/compiler/src/shadow_css.ts` L435–453 （▶ の行: 436–437, 439–440, 444–447, 451）

```ts
435 │   private _convertColonHost(cssText: string): string {
436 ▶     return cssText.replace(_cssColonHostRe, (_, hostSelectors: string, otherSelectors: string) => {
437 ▶       if (hostSelectors) {
438 │         const parts = [...this._splitOnTopLevelCommas(hostSelectors, true)];
439 ▶         if (parts.length > 1) {
440 ▶           return ':host(' + hostSelectors + ')' + otherSelectors;
441 │         }
442 │         const trimmedHostSelector = parts[0].trim();
443 │         if (trimmedHostSelector) {
444 ▶           return (
445 ▶             _polyfillHostNoCombinator +
446 ▶             trimmedHostSelector.replace(_polyfillHost, '') +
447 ▶             otherSelectors
448 │           );
449 │         }
450 │       }
451 ▶       return _polyfillHostNoCombinator + otherSelectors;
452 │     });
453 │   }
```

997 行目の正規表現で `-shadowcsshost(括弧の中)残り` を拾い、`:host(.active) .title` なら 444〜448 行目で `-shadowcsshost-no-combinator.active .title` にします。1005 行目の `-shadowcsshost-no-combinator` は、名前のとおり「結合子（空白など）を挟まずにホストを表す」印で、4 節の `_applySimpleSelectorScope` がこの位置に `[_nghost-%COMP%]` を入れます（`.active[_nghost-%COMP%]` になる）。439〜440 行目、`:host(.a, .b)` のように括弧の中にカンマがあるものは書き換えずに残します。

📄 `angular/packages/compiler/src/shadow_css.ts` L505–514 （▶ の行: 510–511, 513）

```ts
505 │   private _convertColonHostContext(cssText: string): string {
506 │     // Splits up the selectors on their top-level commas, processes the :host-context in them
507 │     // individually and stitches them back together. This ensures that individual selectors don't
508 │     // affect each other.
509 │     const results: string[] = [];
510 ▶     for (const part of this._splitOnTopLevelCommas(cssText, false)) {
511 ▶       results.push(this._convertColonHostContextInSelectorPart(part));
512 │     }
513 ▶     return results.join(',');
514 │   }
```

📄 `angular/packages/compiler/src/shadow_css.ts` L1317–1339 （▶ の行: 1317, 1324, 1326, 1328, 1335–1337）

```ts
1317 ▶   const combined: string[] = [contextSelectors.pop() || ''];
1318 │   while (contextSelectors.length > 0) {
1319 │     const length = combined.length;
1320 │     const contextSelector = contextSelectors.pop();
1321 │     for (let i = 0; i < length; i++) {
1322 │       const previousSelectors = combined[i];
1323 │       // Add the new selector as a descendant of the previous selectors
1324 ▶       combined[length * 2 + i] = previousSelectors + ' ' + contextSelector;
1325 │       // Add the new selector as an ancestor of the previous selectors
1326 ▶       combined[length + i] = contextSelector + ' ' + previousSelectors;
1327 │       // Add the new selector to act on the same element as the previous selectors
1328 ▶       combined[i] = contextSelector + previousSelectors;
1329 │     }
1330 │   }
1331 │   // Finally connect the selector to the `hostMarker`s: either acting directly on the host
1332 │   // (A<hostMarker>) or as an ancestor (A <hostMarker>).
1333 │   return combined
1334 │     .map((s) =>
1335 ▶       otherSelectorsHasHost
1336 ▶         ? `${pseudoPrefix}${s}${otherSelectors}`
1337 ▶         : `${pseudoPrefix}${s}${hostMarker}${otherSelectors}, ${pseudoPrefix}${s} ${hostMarker}${otherSelectors}`,
1338 │     )
1339 │     .join(',');
```

`:host-context(.dark) h2` の意味は「`.dark` がホスト自身か、ホストの祖先にある」です。CSS 1 つでは書けないので、1337 行目で**2 つのセレクタに展開**します。`.dark-shadowcsshost-no-combinator h2`（ホスト自身が `.dark`）と `.dark -shadowcsshost-no-combinator h2`（空白を挟んで祖先が `.dark`）。`:host-context(.a):host-context(.b)` のように複数あると、1318〜1330 行目で「同じ要素」「祖先」「子孫」の組み合わせをすべて作ります。

📄 `angular/packages/compiler/test/shadow_css/host_and_host_context_spec.ts` L13–28 （▶ の行: 14, 18, 22）

```ts
13 │     it('should handle no context', () => {
14 ▶       expect(shim(':host {}', 'contenta', 'a-host')).toEqualCss('[a-host] {}');
15 │     });
16 │ 
17 │     it('should handle tag selector', () => {
18 ▶       expect(shim(':host(ul) {}', 'contenta', 'a-host')).toEqualCss('ul[a-host] {}');
19 │     });
20 │ 
21 │     it('should handle class selector', () => {
22 ▶       expect(shim(':host(.x) {}', 'contenta', 'a-host')).toEqualCss('.x[a-host] {}');
23 │     });
24 │ 
25 │     it('should handle attribute selector', () => {
26 │       expect(shim(':host([a="b"]) {}', 'contenta', 'a-host')).toEqualCss('[a="b"][a-host] {}');
27 │       expect(shim(':host([a=b]) {}', 'contenta', 'a-host')).toEqualCss('[a=b][a-host] {}');
28 │     });
```
*shim(css, 内側の属性, ホストの属性)。テストでは %COMP% の代わりに contenta / a-host を渡している*

📄 `angular/packages/compiler/test/shadow_css/host_and_host_context_spec.ts` L190–207 （▶ の行: 191–192, 195, 201, 205）

```ts
190 │     it('should handle tag selector', () => {
191 ▶       expect(shim(':host-context(div) {}', 'contenta', 'a-host')).toEqualCss(
192 ▶         'div[a-host], div [a-host] {}',
193 │       );
194 │       expect(shim(':host-context(ul) > .y {}', 'contenta', 'a-host')).toEqualCss(
195 ▶         'ul[a-host] > .y[contenta], ul [a-host] > .y[contenta] {}',
196 │       );
197 │     });
198 │ 
199 │     it('should handle class selector', () => {
200 │       expect(shim(':host-context(.x) {}', 'contenta', 'a-host')).toEqualCss(
201 ▶         '.x[a-host], .x [a-host] {}',
202 │       );
203 │ 
204 │       expect(shim(':host-context(.x) > .y {}', 'contenta', 'a-host')).toEqualCss(
205 ▶         '.x[a-host] > .y[contenta], .x [a-host] > .y[contenta] {}',
206 │       );
207 │     });
```

14 行目、`:host` は `[a-host]`（実物では `[_nghost-ng-c…]`）。22 行目、`:host(.x)` は `.x[a-host]`。201 行目、`:host-context(.x)` は `.x[a-host], .x [a-host]` の 2 つ。205 行目、後ろの `.y` にはふつうに内側の属性 `[contenta]` が付きます。

## 4. \_scopeSelectors：規則ごとに属性を付ける

📄 `angular/packages/compiler/src/shadow_css.ts` L1092–1112 （▶ の行: 1093–1094, 1096, 1102–1103, 1108–1109, 1111）

```ts
1092 │ export function processRules(input: string, ruleCallback: (rule: CssRule) => CssRule): string {
1093 ▶   const escaped = escapeInStrings(input);
1094 ▶   const inputWithEscapedBlocks = escapeBlocks(escaped, CONTENT_PAIRS, BLOCK_PLACEHOLDER);
1095 │   let nextBlockIndex = 0;
1096 ▶   const escapedResult = inputWithEscapedBlocks.escapedString.replace(_ruleRe, (...m: string[]) => {
1097 │     const selector = m[2];
1098 │     let content = '';
1099 │     let suffix = m[4];
1100 │     let contentPrefix = '';
1101 │     let hasBlock = false;
1102 ▶     if (suffix && suffix.startsWith('{' + BLOCK_PLACEHOLDER)) {
1103 ▶       content = inputWithEscapedBlocks.blocks[nextBlockIndex++];
1104 │       suffix = suffix.substring(BLOCK_PLACEHOLDER.length + 1);
1105 │       contentPrefix = '{';
1106 │       hasBlock = true;
1107 │     }
1108 ▶     const rule = ruleCallback(new CssRule(selector, content, hasBlock));
1109 ▶     return `${m[1]}${rule.selector}${m[3]}${contentPrefix}${rule.content}${suffix}`;
1110 │   });
1111 ▶   return unescapeInStrings(escapedResult);
1112 │ }
```

📄 `angular/packages/compiler/src/shadow_css.ts` L1201–1226 （▶ の行: 1209, 1214, 1216, 1220–1221）

```ts
1201 │ function escapeInStrings(input: string): string {
1202 │   let result = input;
1203 │   let currentQuoteChar: string | null = null;
1204 │   for (let i = 0; i < result.length; i++) {
1205 │     const char = result[i];
1206 │     if (char === '\\') {
1207 │       i++;
1208 │     } else {
1209 ▶       if (currentQuoteChar !== null) {
1210 │         // index i is inside a quoted sub-string
1211 │         if (char === currentQuoteChar) {
1212 │           currentQuoteChar = null;
1213 │         } else {
1214 ▶           const placeholder: string | undefined = ESCAPE_IN_STRING_MAP[char];
1215 │           if (placeholder) {
1216 ▶             result = `${result.substr(0, i)}${placeholder}${result.substr(i + 1)}`;
1217 │             i += placeholder.length - 1;
1218 │           }
1219 │         }
1220 ▶       } else if (char === "'" || char === '"') {
1221 ▶         currentQuoteChar = char;
1222 │       }
1223 │     }
1224 │   }
1225 │   return result;
1226 │ }
```

CSS を「セレクタ { 中身 }」の規則に分けるのが `processRules` です。1093 行目、まず `content: "a{b};c"` のような**文字列の中**の `;``,``:``{``}` を `%SEMI_IN_PLACEHOLDER%` などに置き換え（1209〜1218 行目）、1094 行目で一番外側の `{…}` の中身を `%BLOCK%` にどけます。こうすると残りは「セレクタ `{%BLOCK%}`」の並びになり、1096 行目の正規表現で 1 規則ずつ取り出してコールバックに渡せます（1108 行目）。1111 行目で文字列の中身を元に戻します。

📄 `angular/packages/compiler/src/shadow_css.ts` L594–624 （▶ の行: 594, 598–599, 601, 603, 613–615, 617–620）

```ts
594 ▶   private _scopeSelectors(cssText: string, scopeSelector: string, hostSelector: string): string {
595 │     return processRules(cssText, (rule: CssRule) => {
596 │       let selector = rule.selector;
597 │       let content = rule.content;
598 ▶       if (rule.selector[0] !== '@') {
599 ▶         if (rule.isBlock) {
600 │           const selectorParts = selector.split(_selectorSplitRe);
601 ▶           const containsDeep = selectorParts.some((part) => _shadowDeepSelectors.test(part));
602 │ 
603 ▶           selector = this._scopeSelector({
604 │             selector,
605 │             scopeSelector,
606 │             hostSelector,
607 │             isParentSelector: true,
608 │           });
609 │ 
610 │           content =
611 │             // Only recurse into content if there might be any child blocks.
612 │             // TODO: support something like `.parent { ::ng-deep { .child {} } }`
613 ▶             !containsDeep && rule.content.includes('{')
614 ▶               ? this._scopeSelectors(rule.content, scopeSelector, hostSelector)
615 ▶               : this._stripScopingSelectors(rule.content);
616 │         }
617 ▶       } else if (scopedAtRuleIdentifiers.some((atRule) => rule.selector.startsWith(atRule))) {
618 ▶         content = this._scopeSelectors(rule.content, scopeSelector, hostSelector);
619 ▶       } else if (rule.selector.startsWith('@font-face') || rule.selector.startsWith('@page')) {
620 ▶         content = this._stripScopingSelectors(rule.content);
621 │       }
622 │       return new CssRule(selector, content, rule.isBlock);
623 │     });
624 │   }
```

📄 `angular/packages/compiler/src/shadow_css.ts` L55–63 （▶ の行: 55–57）

```ts
55 ▶ const scopedAtRuleIdentifiers = [
56 ▶   '@media',
57 ▶   '@supports',
58 │   '@document',
59 │   '@layer',
60 │   '@container',
61 │   '@scope',
62 │   '@starting-style',
63 │ ];
```

1. **598〜608 行目：ふつうの規則はセレクタに属性を付ける**

   本体は次の `_scopeSelector`。
2. **613〜615 行目：中に入れ子の規則があれば再帰**

   CSS Nesting（`.a { .b {…} }`）の内側も同じ処理を通ります。ただし `::ng-deep` を含む規則の中身は再帰しません（601 行目、613 行目）。
3. **617〜618 行目：`@media` などは中身だけ再帰**

   55〜63 行目の `@media`・`@supports`・`@layer`・`@container` などは、`@media (…)` の部分はそのままにして、`{…}` の中の規則を 594 行目からもう一度処理します。
4. **619〜620 行目：`@font-face` / `@page` は属性を付けない**

   中にセレクタを持てない規則なので、`_stripScopingSelectors` で `::ng-deep` や `:host` の印を取り除くだけです。

📄 `angular/packages/compiler/test/shadow_css/at_rules_spec.ts` L12–18 （▶ の行: 14, 16）

```ts
12 │   describe('@media', () => {
13 │     it('should handle media rules with simple rules', () => {
14 ▶       const css = '@media screen and (max-width: 800px) {div {font-size: 50px;}} div {}';
15 │       const expected =
16 ▶         '@media screen and (max-width:800px) {div[contenta] {font-size:50px;}} div[contenta] {}';
17 │       expect(shim(css, 'contenta')).toEqualCss(expected);
18 │     });
```

📄 `angular/packages/compiler/src/shadow_css.ts` L663–694 （▶ の行: 675–676, 678, 680–681, 691, 693）

```ts
663 │   private _scopeSelector({
664 │     selector,
665 │     scopeSelector,
666 │     hostSelector,
667 │     isParentSelector = false,
668 │   }: {
669 │     selector: string;
670 │     scopeSelector: string;
671 │     hostSelector: string;
672 │     isParentSelector?: boolean;
673 │   }): string {
674 │     return selector
675 ▶       .split(_selectorSplitRe)
676 ▶       .map((part) => part.split(_shadowDeepSelectors))
677 │       .map((deepParts) => {
678 ▶         const [shallowPart, ...otherParts] = deepParts;
679 │         const applyScope = (shallowPart: string) => {
680 ▶           if (this._selectorNeedsScoping(shallowPart, scopeSelector)) {
681 ▶             return this._applySelectorScope({
682 │               selector: shallowPart,
683 │               scopeSelector,
684 │               hostSelector,
685 │               isParentSelector,
686 │             });
687 │           } else {
688 │             return shallowPart;
689 │           }
690 │         };
691 ▶         return [applyScope(shallowPart), ...otherParts].join(' ');
692 │       })
693 ▶       .join(', ');
694 │   }
```

1 つのセレクタは 675 行目でカンマごとに分け、676 行目で `::ng-deep`（と古い `>>>` / `/deep/`、1015 行目の正規表現）で分けます。678 行目、**最初の部分（`::ng-deep` より左）だけ**に属性を付け（680〜689 行目）、残りは 691 行目で空白でつなぐだけです。`::ng-deep` という文字自体は分割で消えます。

📄 `angular/packages/compiler/test/shadow_css/ng_deep_spec.ts` L22–33 （▶ の行: 24, 26, 28）

```ts
22 │   it('should handle ::ng-deep', () => {
23 │     let css = '::ng-deep y {}';
24 ▶     expect(shim(css, 'contenta')).toEqualCss('y {}');
25 │     css = 'x ::ng-deep y {}';
26 ▶     expect(shim(css, 'contenta')).toEqualCss('x[contenta] y {}');
27 │     css = ':host > ::ng-deep .x {}';
28 ▶     expect(shim(css, 'contenta', 'h')).toEqualCss('[h] > .x {}');
29 │     css = ':host ::ng-deep > .x {}';
30 │     expect(shim(css, 'contenta', 'h')).toEqualCss('[h] > .x {}');
31 │     css = ':host > ::ng-deep > .x {}';
32 │     expect(shim(css, 'contenta', 'h')).toEqualCss('[h] > > .x {}');
33 │   });
```

26 行目、`x ::ng-deep y` は `x[contenta] y`。`y` に属性が付かないので、**このコンポーネントの `x` の中にある、どのコンポーネントの `y` にも当たります**。24 行目、先頭に `::ng-deep` を書くと左側が空なので、属性がどこにも付かず**グローバルなスタイル**になります。28 行目のように `:host` と組み合わせるのが、範囲をホストの中に留める書き方です。

📄 `angular/packages/compiler/src/shadow_css.ts` L748–778 （▶ の行: 751, 756, 760–761, 768, 770, 772）

```ts
748 │     const isRe = /\[is=([^\]]*)\]/g;
749 │     scopeSelector = scopeSelector.replace(isRe, (_: string, ...parts: string[]) => parts[0]);
750 │ 
751 ▶     const attrName = `[${scopeSelector}]`;
752 │ 
753 │     const _scopeSelectorPart = (p: string) => {
754 │       let scopedP = p.trim();
755 │ 
756 ▶       if (!scopedP || scopedP === '&') {
757 │         return p;
758 │       }
759 │ 
760 ▶       if (p.includes(_polyfillHostNoCombinator)) {
761 ▶         scopedP = this._applySimpleSelectorScope(p, scopeSelector, hostSelector);
762 │         if (!p.match(_polyfillHostNoCombinatorOutsidePseudoFunction)) {
763 │           const [_, before, colon, after] = scopedP.match(/([^:]*)(:*)([\s\S]*)/)!;
764 │           scopedP = before + attrName + colon + after;
765 │         }
766 │       } else {
767 │         // remove :host since it should be unnecessary
768 ▶         const t = p.replace(_polyfillHostRe, '');
769 │         if (t.length > 0) {
770 ▶           const matches = t.match(/([^:]*)(:*)([\s\S]*)/);
771 │           if (matches) {
772 ▶             scopedP = matches[1] + attrName + matches[2] + matches[3];
773 │           }
774 │         }
775 │       }
776 │ 
777 │       return scopedP;
778 │     };
```

📄 `angular/packages/compiler/src/shadow_css.ts` L709–733 （▶ の行: 716–717, 719, 724, 729）

```ts
709 │   private _applySimpleSelectorScope(
710 │     selector: string,
711 │     scopeSelector: string,
712 │     hostSelector: string,
713 │   ): string {
714 │     // In Android browser, the lastIndex is not reset when the regex is used in String.replace()
715 │     _polyfillHostRe.lastIndex = 0;
716 ▶     if (_polyfillHostRe.test(selector)) {
717 ▶       const replaceBy = `[${hostSelector}]`;
718 │       let result = selector;
719 ▶       while (result.match(_polyfillHostNoCombinatorRe)) {
720 │         result = result.replace(_polyfillHostNoCombinatorRe, (_hnc, selector) => {
721 │           return selector.replace(
722 │             /([^:\)]*)(:*)(.*)/,
723 │             (_: string, before: string, colon: string, after: string) => {
724 ▶               return before + replaceBy + colon + after;
725 │             },
726 │           );
727 │         });
728 │       }
729 ▶       return result.replace(_polyfillHostRe, replaceBy);
730 │     }
731 │ 
732 │     return scopeSelector + ' ' + selector;
733 │   }
```

属性の付け方の最小単位です。`_applySelectorScope` は結合子（空白・`>`・`+`・`~`）で区切った部分ごとに `_scopeSelectorPart` を当てます。770〜772 行目、`p:hover` は `([^:]*)(:*)(.*)` で「疑似クラスの手前」に挟んで `p[_ngcontent-%COMP%]:hover` に（751 行目の `attrName`）。3 節の印（`-shadowcsshost-no-combinator`）を含む部分は 760〜761 行目で `_applySimpleSelectorScope` に回り、717 行目で `[_nghost-%COMP%]` に置き換わります。

## 5. 実行時：%COMP% を誰がいつ置き換えるか

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L49–55 （▶ の行: 49, 54–55）

```ts
49 ▶ const COMPONENT_REGEX = /%COMP%/g;
50 │ const SOURCEMAP_URL_REGEXP = /\/\*#\s*sourceMappingURL=([^\s*]+)\s*\*\//;
51 │ const PROTOCOL_REGEXP = /^https?:/;
52 │ 
53 │ export const COMPONENT_VARIABLE = '%COMP%';
54 ▶ export const HOST_ATTR = `_nghost-${COMPONENT_VARIABLE}`;
55 ▶ export const CONTENT_ATTR = `_ngcontent-${COMPONENT_VARIABLE}`;
```

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L103–113 （▶ の行: 104, 108, 112）

```ts
103 │ export function shimContentAttribute(componentShortId: string): string {
104 ▶   return CONTENT_ATTR.replace(COMPONENT_REGEX, componentShortId);
105 │ }
106 │ 
107 │ export function shimHostAttribute(componentShortId: string): string {
108 ▶   return HOST_ATTR.replace(COMPONENT_REGEX, componentShortId);
109 │ }
110 │ 
111 │ export function shimStylesContent(compId: string, styles: string[]): string[] {
112 ▶   return styles.map((s) => s.replace(COMPONENT_REGEX, compId));
113 │ }
```

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L693–718 （▶ の行: 704, 714, 716–717）

```ts
693 │   constructor(
694 │     eventManager: EventManager,
695 │     sharedStylesHost: SharedStylesHost,
696 │     component: RendererType2,
697 │     appId: string,
698 │     removeStylesOnCompDestroy: boolean,
699 │     doc: Document,
700 │     ngZone: NgZone,
701 │     tracingService: TracingService<TracingSnapshot> | null,
702 │     cssVarNamespace: string,
703 │   ) {
704 ▶     const compId = appId + '-' + component.id;
705 │     super(
706 │       eventManager,
707 │       sharedStylesHost,
708 │       component,
709 │       removeStylesOnCompDestroy,
710 │       doc,
711 │       ngZone,
712 │       tracingService,
713 │       cssVarNamespace,
714 ▶       compId,
715 │     );
716 ▶     this.contentAttr = shimContentAttribute(compId);
717 ▶     this.hostAttr = shimHostAttribute(compId);
718 │   }
```

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L663–677 （▶ の行: 663, 670–671, 676）

```ts
663 ▶     let styles = component.styles;
664 │     if (ngDevMode) {
665 │       // We only do this in development, as for production users should not add CSS sourcemaps to components.
666 │       const baseHref = getDOM().getBaseHref(doc) ?? '';
667 │       styles = addBaseHrefToCssSourceMap(baseHref, styles);
668 │     }
669 │ 
670 ▶     const shimmed = compId ? shimStylesContent(compId, styles) : styles;
671 ▶     this.styles = shimmed.map((s) => s.replace(/%NS%/g, cssVarNamespace));
672 │     this.styleUrls = component.getExternalStyles?.(compId);
673 │   }
674 │ 
675 │   applyStyles(): void {
676 ▶     this.sharedStylesHost.addStyles(this.styles, this.styleUrls);
677 │   }
```

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L720–729 （▶ の行: 720–722, 725, 727）

```ts
720 ▶   applyToHost(element: any): void {
721 ▶     this.applyStyles();
722 ▶     this.setAttribute(element, this.hostAttr, '');
723 │   }
724 │ 
725 ▶   override createElement(parent: any, name: string): Element {
726 │     const el = super.createElement(parent, name);
727 ▶     super.setAttribute(el, this.contentAttr, '');
728 │     return el;
729 │   }
```

1. **704 行目：ID は `appId + '-' + component.id`**

   `EmulatedEncapsulationDomRenderer2` はコンポーネントの型ごとに 1 つ作られます。`component` は ɵcmp（`RendererType2` として渡される）で、`appId` は下の `APP_ID`、`component.id` は `ɵɵdefineComponent` が計算した ID です。
2. **670・112 行目：styles の `%COMP%` を置き換える**

   1 節でコンパイラが埋め込んだ `[_ngcontent-%COMP%]` が `[_ngcontent-ng-c1234567]` になります。671 行目で CSS 変数の `%NS%` も置き換えます。
3. **716〜717 行目と 104・108 行目：DOM に付ける属性名も同じ置き換え**
4. **720〜723 行目：ホスト要素に `_nghost-…`**

   721 行目で `<style>` を文書に足し（676 行目の `SharedStylesHost.addStyles`）、722 行目でホスト要素に属性を付けます。
5. **725〜728 行目：このレンダラで作る要素すべてに `_ngcontent-…`**

   テンプレートの `ɵɵelementStart` は要素を `renderer.createElement` で作る（[Ivy シリーズの作成命令の章](../ivy/09-ivy-create-instructions.md)）ので、テンプレートの要素には自動で属性が付きます。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L208–215 （▶ の行: 208, 211–212）

```ts
208 ▶     const renderer = this.getOrCreateRenderer(element, type);
209 │     // Renderers have different logic due to different encapsulation behaviours.
210 │     // Ex: for emulated, an attribute is added to the element.
211 ▶     if (renderer instanceof EmulatedEncapsulationDomRenderer2) {
212 ▶       renderer.applyToHost(element);
213 │     } else if (renderer instanceof NoneEncapsulationDomRenderer) {
214 │       renderer.applyStyles();
215 │     }
```

呼び出し元は `DomRendererFactory2.createRenderer` で、211〜212 行目、Emulated のときだけ `applyToHost` します。core 側でこれを呼ぶのは、コンポーネントのホスト要素でディレクティブを生成するとき（`instantiateAllDirectives`、instructions/shared.ts）に呼ばれる `createComponentLView` の `rendererFactory.createRenderer(native, def)` です（[Ivy シリーズの LView の章](../ivy/06-ivy-lview.md)で引用済み）。`native` がそのコンポーネントのホスト要素なので、722 行目の属性はそこに付きます。

📄 `angular/packages/core/src/render3/definition.ts` L739–747 （▶ の行: 739–740, 745, 747）

```ts
739 ▶   for (const char of hashSelectors.join('|')) {
740 ▶     hash = (Math.imul(31, hash) + char.charCodeAt(0)) << 0;
741 │   }
742 │ 
743 │   // Force positive number hash.
744 │   // 2147483647 = equivalent of Integer.MAX_VALUE.
745 ▶   hash += 2147483647 + 1;
746 │ 
747 ▶   const compId = 'c' + hash;
```

📄 `angular/packages/core/src/application/application_tokens.ts` L44–52 （▶ の行: 47, 52）

```ts
44 │ export const APP_ID = new InjectionToken<string>(
45 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'AppId' : '',
46 │   {
47 ▶     factory: () => DEFAULT_APP_ID,
48 │   },
49 │ );
50 │ 
51 │ /** Default value of the `APP_ID` token. */
52 ▶ const DEFAULT_APP_ID = 'ng';
```

`component.id` は、セレクタ・`decls`・`vars`・inputs などをつないだ文字列のハッシュ（739〜740 行目）に `c` を付けたもの（747 行目）。クラス名を使わないのは、サーバーとブラウザでビルドの minify が違っても同じ ID にするためです（`getComponentId` の中のコメント）。`APP_ID` の既定は 52 行目の `ng`。だから多くのアプリで属性は `_ngcontent-ng-c1234567890` の形になります。

## 6. DEMO：ShadowCss を動かす・このページの属性を見る

> **🧪 DEMO — encapsulateStyle（@angular/compiler の公開関数）で CSS を書き換える**
>
> ボタンを押したときだけ `@angular/compiler` を動的 import し、1 節 644 行目の `encapsulateStyle(css, id)` を呼びます。ID を空にすると `%COMP%` のまま（コンパイラが ɵcmp に入れる形）、入れると実行時に置き換えた後の形です。`ShadowCss` クラス自体は export されていないので、それを包むこの関数を使います（CSS 変数の `%NS%` 化は 1 節 272 行目の別の関数なので、ここでは起きません）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-shadow-css)

> **🧪 DEMO — この章の要素に付いている属性**
>
> このサイトの章コンポーネントも Emulated です。ボタンで、この章のホスト要素と、その中の最初の段落の属性名を読みます。`_nghost-` / `_ngcontent-` の後ろが `APP_ID` とコンポーネント ID です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-shadow-css)

## ここまでの呼び出し

- 👤 `styles: ['p { color: red }']` / `styleUrl` — あなたのコンポーネント
  - `compileComponentFromMetadata()` — compiler/src/render3/view/compiler.ts L178
    - `namespaceCssVariables()` → `compileStyles(styles, CONTENT_ATTR, HOST_ATTR)` — compiler.ts L272 / L628
      - `ShadowCss.shimCssText()` — shadow\_css.ts L176 — *コメントを %COMMENT% に*
        - `_insertPolyfillHostInCssText` → `_convertColonHost` → `_convertColonHostContext` — shadow\_css.ts L922 / L435 / L505
        - `_scopeKeyframesRelatedCss` → `_scopeSelectors` — shadow\_css.ts L244 / L594
          - `processRules()` → `_scopeSelector()` → `_applySelectorScope()` — shadow\_css.ts L1092 / L663 / L737 — *p\[\_ngcontent-%COMP%\]*
    - `definitionMap.set('styles', …)` — compiler.ts L286
- 👤 `ɵɵdefineComponent({ styles })` — 実行時 — *def.id = getComponentId(def)*
  - `createComponentLView()` → `rendererFactory.createRenderer(native, def)` — core/src/render3/view/construction.ts L247
    - `new EmulatedEncapsulationDomRenderer2(…)` — platform-browser/src/dom/dom\_renderer.ts L693 — *compId = appId + '-' + id*
      - `shimStylesContent(compId, styles)` — dom\_renderer.ts L111 — *%COMP% → ng-c…*
    - `applyToHost(host)` / `createElement()` — dom\_renderer.ts L720 / L725 — *\_nghost / \_ngcontent 属性*

## 聞かれそうな質問

**Q. ::ng-deep は何に変換されるのですか？**

何にも変換されず、**消えます**。shadow\_css.ts 676 行目で `::ng-deep` を区切りとしてセレクタを分け、678〜691 行目で左側の部分だけに属性を付けて右側はそのまま空白でつなぎます。`x ::ng-deep y` は `x[_ngcontent-…] y`（ng\_deep\_spec.ts 26 行目）、先頭に書くと属性がどこにも付かずグローバルになります（24 行目）。

**Q. :host-context はどう書き換わるのですか？**

「ホスト自身に付く」と「祖先に付く」の 2 つのセレクタに展開されます。`:host-context(.x)` は `.x[_nghost-…], .x [_nghost-…]`（host\_and\_host\_context\_spec.ts 201 行目）。展開しているのは shadow\_css.ts 1337 行目で、複数の `:host-context` があれば 1318〜1330 行目で組み合わせを全部作ります。

**Q. %COMP% は、誰がいつ置き換えるのですか？**

core ではなく platform-browser の `EmulatedEncapsulationDomRenderer2` が、コンポーネントの型ごとにレンダラを作るときに置き換えます。dom\_renderer.ts 704 行目で `APP_ID + '-' + ɵcmp.id` を作り、670 行目（112 行目の `shimStylesContent`）で styles の中を、716〜717 行目で要素に付ける属性名を置き換えます。コンパイル時には ID が決まらない（ID は実行時に ɵcmp の中身のハッシュで作る。definition.ts 739〜747 行目）ので、コンパイラは compiler.ts 35〜37 行目の `%COMP%` を仮に埋め込んでいます。

**Q. @media の中のセレクタにも属性は付きますか？**

付きます。shadow\_css.ts 617〜618 行目で、55〜63 行目に並ぶ at-rule（`@media`・`@supports`・`@layer`・`@container` など）の中身を `_scopeSelectors` にもう一度通します（at\_rules\_spec.ts 16 行目）。`@font-face` と `@page` は 619〜620 行目で属性を付けません。

**Q. CSS の中のコメントや文字列で壊れないのはなぜですか？**

書き換えの前に退避しているからです。コメントは shimCssText の 183〜194 行目で `%COMMENT%` に、文字列の中の `;` や `{` は escapeInStrings（1209〜1218 行目）でプレースホルダに、属性セレクタ `[a="b c"]` の空白は `SafeSelector` がプレースホルダにしてから処理し、最後に戻します。sourceMappingURL 以外のコメントは中身を捨て、改行だけ残します（189〜190 行目）。

## 読み終えて

- Emulated のカプセル化は、コンパイル時の CSS 文字列の書き換え（shadow\_css.ts）と、実行時の属性付け（dom\_renderer.ts）の 2 つで成り立っている。
- コンパイラは ID を知らないので `%COMP%` の印を埋め込み、実行時に `APP_ID-ɵcmp.id` で置き換える。
- `:host` / `:host-context` は先に「ホストの印」に組み直してから、セレクタごとに属性を付ける。`:host-context` は 2 通りに展開される。
- `::ng-deep` は「ここから右には属性を付けない」という区切りで、文字としては消える。
- コメント・文字列・入れ子のブロックはプレースホルダに退避し、`@media` などの中身は再帰で同じ処理を受ける。

---

← 前: [型検査：Type Check Block（TCB）がテンプレートを TypeScript にする](17-compiler-typecheck.md)  
次: [track は何に使われているのか](../template/01-for-track.md) →
