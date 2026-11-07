[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 11 回 / 全 20 回

# 実行時（3）：ICU の切り替え

> ICU が実行時に TIcu（cases・create・remove・update）になる解析（i18n\_parse.ts の icuStart と parseIcuCase）、値が変わったときに getPluralCase で case を選び、前の case の DOM を消して新しい case を作る流れ（i18n\_apply.ts）、i18n\_icu\_container\_visitor.ts。ロケールの plural の規則がどこから来るか。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-runtime-icu)

---

`{count, plural, =0 {none} one {one <b>item</b>} other {…}}` のような ICU は、実行時には **case ごとの「作る・消す・更新する」命令の束**（`TIcu`）になります。この章では、`i18n_parse.ts` が ICU の文字列を `TIcu` にする順番、値が変わったときに `getCaseIndex` が case を選び、前の case の DOM を消して新しい case を作る順番、そして plural の規則がロケールのデータのどこから来るかを、1 行ずつ追います。

読む対象は `packages/core/src/render3/i18n/i18n_parse.ts`（ICU の部分）、`i18n_apply.ts`（ICU の部分）、`i18n_util.ts`、`i18n_icu_container_visitor.ts`、`i18n_tree_shaking.ts`、`core/src/i18n/localization.ts` です。

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
11. **11. 実行時（3）ICU**（この章）
12. [12. ロケールのデータ](12-loc-locale-data.md)
13. [13. $localize](13-loc-localize-tag.md)
14. [14. 実行時の翻訳](14-loc-runtime-translations.md)
15. [15. 抽出](15-loc-extract-tool.md)
16. [16. 翻訳ファイルを書く](16-loc-serializers.md)
17. [17. 翻訳ファイルを読む](17-loc-translation-parsers.md)
18. [18. 差し込み](18-loc-translate-tool.md)
19. [19. テスト](19-loc-testing.md)
20. [20. issue と PR を読む](20-loc-issues.md)

## 1. 出発点：ɵɵi18nStart が受け取る ICU

`<p i18n>{count, plural, =0 {none} one {one <b>item</b>} other {{{count}} items}} for {{ name }}</p>` をこのページのコンパイラに通すと、`$localize` と `ɵɵi18nPostprocess`（[第 9 回](09-loc-runtime-start.md) 8 節）を通ったあとの文字列はこうなります（第 9 回のデモで確かめられます）。

📄 `ɵɵi18n(1, 0) が受け取る文字列`

```
{�0�, plural, =0 {none} one {one <b>item</b>} other {�1� items}} for �2�
```

`<b>` は印ではなく **HTML の文字のまま**で、`VAR_PLURAL` は `�0�`、ICU の中の `{INTERPOLATION}` は `�1�` に置き換わっています。第 9 回 5 節の `i18nParseTextIntoPartsAndICU` が深さ 0 の `{…}` を見つけ、それが ICU の形なら次の分岐に入ります。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L186–212 （▶ の行: 186, 192–193, 195, 202, 208–209）

```ts
186 ▶           const icuContainerTNode = createTNodeAndAddOpCode(
187 │             tView,
188 │             rootTNode,
189 │             existingTNodeStack[0],
190 │             lView,
191 │             createOpCodes,
192 ▶             ngDevMode ? `ICU ${index}:${icuExpression.mainBinding}` : '',
193 ▶             true,
194 │           );
195 ▶           const icuNodeIndex = icuContainerTNode.index;
196 │           ngDevMode &&
197 │             assertGreaterThanOrEqual(
198 │               icuNodeIndex,
199 │               HEADER_OFFSET,
200 │               'Index must be in absolute LView offset',
201 │             );
202 ▶           icuStart(
203 │             astStack[0],
204 │             tView,
205 │             lView,
206 │             updateOpCodes,
207 │             parentTNodeIndex,
208 ▶             icuExpression,
209 ▶             icuNodeIndex,
210 │           );
211 │         }
212 │       }
```

186〜194 行目、まずテキストと同じ `createTNodeAndAddOpCode` で、**コメントノード**（193 行目の `true`）を作る命令を足します。192 行目の `ICU 1:0` のような文字は開発モードだけで、このコメントが ICU の**アンカー**（case の DOM をこの前に入れる目印）になります。195 行目のその位置を、202〜210 行目の `icuStart` に渡します。

## 2. parseICUBlock：種類・式の番号・case の名前と中身

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L643–681 （▶ の行: 648, 651–652, 656, 661, 664, 667, 670, 673, 675, 680）

```ts
643 │ function parseICUBlock(pattern: string): IcuExpression {
644 │   const cases = [];
645 │   const values: (string | IcuExpression)[][] = [];
646 │   let icuType = IcuType.plural;
647 │   let mainBinding = 0;
648 ▶   pattern = pattern.replace(
649 │     ICU_BLOCK_REGEXP,
650 │     function (str: string, binding: string, type: string) {
651 ▶       if (type === 'select') {
652 ▶         icuType = IcuType.select;
653 │       } else {
654 │         icuType = IcuType.plural;
655 │       }
656 ▶       mainBinding = parseInt(binding.slice(1), 10);
657 │       return '';
658 │     },
659 │   );
660 │ 
661 ▶   const parts = i18nParseTextIntoPartsAndICU(pattern) as string[];
662 │   // Looking for (key block)+ sequence. One of the keys has to be "other".
663 │   for (let pos = 0; pos < parts.length;) {
664 ▶     let key = parts[pos++].trim();
665 │     if (icuType === IcuType.plural) {
666 │       // Key can be "=x", we just want "x"
667 ▶       key = key.replace(/\s*(?:=)?(\w+)\s*/, '$1');
668 │     }
669 │     if (key.length) {
670 ▶       cases.push(key);
671 │     }
672 │ 
673 ▶     const blocks = i18nParseTextIntoPartsAndICU(parts[pos++]) as string[];
674 │     if (cases.length > values.length) {
675 ▶       values.push(blocks);
676 │     }
677 │   }
678 │ 
679 │   // TODO(ocombe): support ICU expressions in attributes, see #21615
680 ▶   return {type: icuType, mainBinding: mainBinding, cases, values};
681 │ }
```

1. **648〜659 行目：先頭の `�0�, plural,` を読んで消す**

   651 行目で `select` か `plural` か、656 行目で `�0�` の 0（`mainBinding`、case を決める式の番号）を取ります。
2. **661 行目：残りを「名前、{中身}、名前、{中身}…」に割る**

   `' =0 '`・`'none'`・`' one '`・`'one <b>item</b>'`・`' other '`・`'�1� items'` の順です（割り方は下の 698〜735 行目）。
3. **667 行目：plural なら `=` を外す**

   `=0` は `0` になります。`one` は `one` のまま。**「値がちょうど 0」と「plural の規則で one」が、どちらも同じ `cases` の配列に文字列で並びます**（5 節で効きます）。
4. **673 行目：中身をさらに割る**

   中身の中に深さ 0 の ICU があれば、ここで `IcuExpression` になります（入れ子の ICU）。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L698–735 （▶ の行: 701, 706, 708, 711, 714–715, 717, 723, 728）

```ts
698 │   let prevPos = 0;
699 │   const braceStack = [];
700 │   const results: (string | IcuExpression)[] = [];
701 ▶   const braces = /[{}]/g;
702 │   // lastIndex doesn't get set to 0 so we have to.
703 │   braces.lastIndex = 0;
704 │ 
705 │   let match;
706 ▶   while ((match = braces.exec(pattern))) {
707 │     const pos = match.index;
708 ▶     if (match[0] == '}') {
709 │       braceStack.pop();
710 │ 
711 ▶       if (braceStack.length == 0) {
712 │         // End of the block.
713 │         const block = pattern.substring(prevPos, pos);
714 ▶         if (ICU_BLOCK_REGEXP.test(block)) {
715 ▶           results.push(parseICUBlock(block));
716 │         } else {
717 ▶           results.push(block);
718 │         }
719 │ 
720 │         prevPos = pos + 1;
721 │       }
722 │     } else {
723 ▶       if (braceStack.length == 0) {
724 │         const substring = pattern.substring(prevPos, pos);
725 │         results.push(substring);
726 │         prevPos = pos + 1;
727 │       }
728 ▶       braceStack.push('{');
729 │     }
730 │   }
731 │ 
732 │   const substring = pattern.substring(prevPos);
733 │   results.push(substring);
734 │   return results;
735 │ }
```

701 行目の正規表現で波かっこだけを順に拾い、728 行目で `{` を積み、708〜709 行目で `}` を下ろします。711 行目で深さが 0 に戻ったら、その間が 1 つの塊です。714 行目で ICU の形（`�0�, plural,` で始まる）なら 715 行目で解析し、そうでなければ 717 行目で文字列のまま入れます。

## 3. TIcu：case ごとに 3 つの命令の束

📄 `angular/packages/core/src/render3/interfaces/i18n.ts` L362–401 （▶ の行: 374, 379, 387–389, 391, 393, 400）

```ts
362 │ /**
363 │  * Defines the ICU type of `select` or `plural`
364 │  */
365 │ export const enum IcuType {
366 │   select = 0,
367 │   plural = 1,
368 │ }
369 │ 
370 │ export interface TIcu {
371 │   /**
372 │    * Defines the ICU type of `select` or `plural`
373 │    */
374 ▶   type: IcuType;
375 │ 
376 │   /**
377 │    * Index in `LView` where the anchor node is stored. `<!-- ICU 0:0 -->`
378 │    */
379 ▶   anchorIdx: number;
380 │ 
381 │   /**
382 │    * Currently selected ICU case pointer.
383 │    *
384 │    * `lView[currentCaseLViewIndex]` stores the currently selected case. This is needed to know how
385 │    * to clean up the current case when transitioning no the new case.
386 │    *
387 ▶    * If the value stored is:
388 ▶    * `null`: No current case selected.
389 ▶    *   `<0`: A flag which means that the ICU just switched and that `icuUpdate` must be executed
390 │    *         regardless of the `mask`. (After the execution the flag is cleared)
391 ▶    *   `>=0` A currently selected case index.
392 │    */
393 ▶   currentCaseLViewIndex: number;
394 │ 
395 │   /**
396 │    * A list of case values which the current ICU will try to match.
397 │    *
398 │    * The last value is `other`
399 │    */
400 ▶   cases: any[];
401 │ 
```

📄 `angular/packages/core/src/render3/interfaces/i18n.ts` L402–426 （▶ の行: 405, 410, 415, 421–425）

```ts
402 │   /**
403 │    * A set of OpCodes to apply in order to build up the DOM render tree for the ICU
404 │    */
405 ▶   create: IcuCreateOpCodes[];
406 │ 
407 │   /**
408 │    * A set of OpCodes to apply in order to destroy the DOM render tree for the ICU.
409 │    */
410 ▶   remove: I18nRemoveOpCodes[];
411 │ 
412 │   /**
413 │    * A set of OpCodes to apply in order to update the DOM render tree for the ICU bindings.
414 │    */
415 ▶   update: I18nUpdateOpCodes[];
416 │ }
417 │ 
418 │ /**
419 │  * Parsed ICU expression
420 │  */
421 ▶ export interface IcuExpression {
422 ▶   type: IcuType;
423 ▶   mainBinding: number;
424 ▶   cases: string[];
425 ▶   values: (string | IcuExpression)[][];
426 │ }
```

- 379 行目 `anchorIdx`：1 節のコメントノードの位置。
- 393 行目 `currentCaseLViewIndex`：**いまどの case か**は TView ではなく `LView` に置きます（同じコンポーネントでも、インスタンスごとに選んでいる case が違うから）。387〜391 行目のとおり、`null` は未選択、負の数は「いま切り替わったばかり」、0 以上が選んでいる case です。
- 400 行目 `cases`：2 節の名前の一覧。405・410・415 行目の `create`・`remove`・`update` は、**同じ番号の case ごとに 1 つずつ**の配列です。
- 421〜425 行目の `IcuExpression` は 2 節の戻り値で、解析の途中だけ使います。

📄 `angular/packages/core/src/render3/interfaces/i18n.ts` L11–20 （▶ の行: 14–16）

```ts
11 │ /**
12 │  * Stores a list of nodes which need to be removed.
13 │  *
14 ▶  * Numbers are indexes into the `LView`
15 ▶  * - index > 0: `removeRNode(lView[0])`
16 ▶  * - index < 0: `removeICU(~lView[0])`
17 │  */
18 │ export interface I18nRemoveOpCodes extends Array<number> {
19 │   __brand__: 'I18nRemoveOpCodes';
20 │ }
```

消す命令は数だけの配列で、正なら「そのノードを消す」、負（`~index`）なら「その位置の入れ子の ICU を消す」です。

## 4. icuStart と parseIcuCase：case ごとに命令を作る

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L565–595 （▶ の行: 584, 586–587, 593–594）

```ts
565 │ /**
566 │  * Generate the OpCodes for ICU expressions.
567 │  *
568 │  * @param icuExpression
569 │  * @param index Index where the anchor is stored and an optional `TIcuContainerNode`
570 │  *   - `lView[anchorIdx]` points to a `Comment` node representing the anchor for the ICU.
571 │  *   - `tView.data[anchorIdx]` points to the `TIcuContainerNode` if ICU is root (`null` otherwise)
572 │  */
573 │ function icuStart(
574 │   ast: I18nNode[],
575 │   tView: TView,
576 │   lView: LView,
577 │   updateOpCodes: I18nUpdateOpCodes,
578 │   parentIdx: number,
579 │   icuExpression: IcuExpression,
580 │   anchorIdx: number,
581 │ ) {
582 │   ngDevMode && assertDefined(icuExpression, 'ICU expression must be defined');
583 │   let bindingMask = 0;
584 ▶   const tIcu: TIcu = {
585 │     type: icuExpression.type,
586 ▶     currentCaseLViewIndex: allocExpando(tView, lView, 1, null),
587 ▶     anchorIdx,
588 │     cases: [],
589 │     create: [],
590 │     remove: [],
591 │     update: [],
592 │   };
593 ▶   addUpdateIcuSwitch(updateOpCodes, icuExpression, anchorIdx);
594 ▶   setTIcu(tView, anchorIdx, tIcu);
595 │   const values = icuExpression.values;
```

1. **586 行目：いまの case を入れる枠を `LView` に 1 つ足す**

   `allocExpando`（第 9 回 6 節）で、3 節の `currentCaseLViewIndex` の位置を作ります。
2. **593 行目：親の更新の命令に「case を切り替える」1 かたまりを足す**

   中身は下の 948〜953 行目です。
3. **594 行目：`TIcu` を置く**

   いちばん外の ICU は、1 節で作った ICU のコンテナの TNode の `value` に、入れ子の ICU は TNode が無いので `tView.data` にそのまま置きます（`setTIcu`。読み出す側の `getTIcu` は 6 節）。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L596–634 （▶ の行: 597, 603, 605, 607, 612–613, 620–621, 625–626）

```ts
596 │   const cases: I18nNode[][] = [];
597 ▶   for (let i = 0; i < values.length; i++) {
598 │     // Each value is an array of strings & other ICU expressions
599 │     const valueArr = values[i];
600 │     const nestedIcus: IcuExpression[] = [];
601 │     for (let j = 0; j < valueArr.length; j++) {
602 │       const value = valueArr[j];
603 ▶       if (typeof value !== 'string') {
604 │         // It is an nested ICU expression
605 ▶         const icuIndex = nestedIcus.push(value as IcuExpression) - 1;
606 │         // Replace nested ICU expression by a comment node
607 ▶         valueArr[j] = `<!--�${icuIndex}�-->`;
608 │       }
609 │     }
610 │     const caseAst: I18nNode[] = [];
611 │     cases.push(caseAst);
612 ▶     bindingMask =
613 ▶       parseIcuCase(
614 │         caseAst,
615 │         tView,
616 │         tIcu,
617 │         lView,
618 │         updateOpCodes,
619 │         parentIdx,
620 ▶         icuExpression.cases[i],
621 ▶         valueArr.join(''),
622 │         nestedIcus,
623 │       ) | bindingMask;
624 │   }
625 ▶   if (bindingMask) {
626 ▶     addUpdateIcuUpdate(updateOpCodes, bindingMask, anchorIdx);
627 │   }
628 │   ast.push({
629 │     kind: I18nNodeKind.ICU,
630 │     index: anchorIdx,
631 │     cases,
632 │     currentCaseLViewIndex: tIcu.currentCaseLViewIndex,
633 │   });
634 │ }
```

1. **597〜609 行目：入れ子の ICU を `<!--�0�-->` に替える**

   case の中身はこのあと HTML として読むので、入れ子の ICU はいったん HTML のコメントにしておき、その番号で 905〜922 行目が見つけ直します。
2. **612〜623 行目：case ごとに `parseIcuCase`**

   620 行目が case の名前、621 行目が中身の HTML の文字列です。戻り値は、その case の中で使う式のマスクです。
3. **625〜627 行目：どこかの case に式があれば「case の中を更新する」1 かたまりを足す**

   中身は 957 行目です。式が無い ICU（`=0 {none}` だけなど）なら足しません。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L752–787 （▶ の行: 760–763, 765–766, 768, 770）

```ts
752 │   const create: IcuCreateOpCodes = [] as any;
753 │   const remove: I18nRemoveOpCodes = [] as any;
754 │   const update: I18nUpdateOpCodes = [] as any;
755 │   if (ngDevMode) {
756 │     attachDebugGetter(create, icuCreateOpCodesToString);
757 │     attachDebugGetter(remove, i18nRemoveOpCodesToString);
758 │     attachDebugGetter(update, i18nUpdateOpCodesToString);
759 │   }
760 ▶   tIcu.cases.push(caseName);
761 ▶   tIcu.create.push(create);
762 ▶   tIcu.remove.push(remove);
763 ▶   tIcu.update.push(update);
764 │ 
765 ▶   const inertBodyHelper = getInertBodyHelper(getDocument());
766 ▶   const inertBodyElement = inertBodyHelper.getInertBodyElement(unsafeCaseHtml);
767 │   ngDevMode && assertDefined(inertBodyElement, 'Unable to generate inert body element');
768 ▶   const inertRootNode = (getTemplateContent(inertBodyElement!) as Element) || inertBodyElement;
769 │   if (inertRootNode) {
770 ▶     return walkIcuTree(
771 │       ast,
772 │       tView,
773 │       tIcu,
774 │       lView,
775 │       updateOpCodes,
776 │       create,
777 │       remove,
778 │       update,
779 │       inertRootNode,
780 │       parentIdx,
781 │       nestedIcus,
782 │       0,
783 │     );
784 │   } else {
785 │     return 0;
786 │   }
787 │ }
```

760〜763 行目で `TIcu` の 4 つの配列に、この case の分を 1 つずつ足します。765〜768 行目が要で、**case の中身の HTML は、サニタイザが使う「中身を実行しない DOM」（`getInertBodyHelper`）に読ませて木にします**（[sanitize](../template/07-sanitize.md)）。翻訳の文に書かれた HTML をブラウザの HTML パーサに任せ、770 行目の `walkIcuTree` でその木をたどって命令にするのです。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L803–830 （▶ の行: 806, 811–813, 818, 823–825）

```ts
803 │   let bindingMask = 0;
804 │   let currentNode = parentNode.firstChild;
805 │   while (currentNode) {
806 ▶     const newIndex = allocExpando(tView, lView, 1, null);
807 │     switch (currentNode.nodeType) {
808 │       case Node.ELEMENT_NODE:
809 │         const element = currentNode as Element;
810 │         const tagName = element.tagName.toLowerCase();
811 ▶         if (Object.hasOwn(VALID_ELEMENTS, tagName)) {
812 ▶           addCreateNodeAndAppend(create, ELEMENT_MARKER, tagName, parentIdx, newIndex);
813 ▶           tView.data[newIndex] = tagName;
814 │           const elAttrs = element.attributes;
815 │           for (let i = 0; i < elAttrs.length; i++) {
816 │             const attr = elAttrs.item(i)!;
817 │             const lowerAttrName = attr.name.toLowerCase();
818 ▶             const hasBinding = !!attr.value.match(BINDING_REGEXP);
819 │             const namespaceUri = element.namespaceURI;
820 │             const namespace = namespaceUri && NAMESPACE_URIS[namespaceUri];
821 │             const tagNameWithNamespace = namespace ? `:${namespace}:${tagName}` : tagName;
822 │ 
823 ▶             if (hasBinding) {
824 ▶               if (Object.hasOwn(VALID_ATTRS, lowerAttrName)) {
825 ▶                 generateBindingUpdateOpCodes(
826 │                   update,
827 │                   attr.value,
828 │                   newIndex,
829 │                   attr.name,
830 │                   0,
```

- 806 行目：木のノードを 1 つ見るたびに、`LView` に 1 枠を足します。ICU の中のノードは TNode を持ちません。
- 811 行目：`VALID_ELEMENTS`（サニタイザの許可した要素）だけを作ります。`<script>` などは無視されます。
- 813 行目：`tView.data` には TNode の代わりに**タグ名の文字列**を置きます。[第 10 回](10-loc-runtime-dom.md) 8 節の `Attr` の更新が「文字列なら `setElementAttribute`」と分けていたのは、このためです。
- 818〜825 行目：式のある属性は、その case の `update` に更新の命令を足します（`VALID_ATTRS` のものだけ）。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L892–928 （▶ の行: 895–897, 899, 908, 913, 920–921）

```ts
892 │       case Node.TEXT_NODE:
893 │         const value = currentNode.textContent || '';
894 │         const hasBinding = value.match(BINDING_REGEXP);
895 ▶         addCreateNodeAndAppend(create, null, hasBinding ? '' : value, parentIdx, newIndex);
896 ▶         addRemoveNode(remove, newIndex, depth);
897 ▶         if (hasBinding) {
898 │           bindingMask =
899 ▶             generateBindingUpdateOpCodes(update, value, newIndex, null, 0, null) | bindingMask;
900 │         }
901 │         ast.push({
902 │           kind: I18nNodeKind.TEXT,
903 │           index: newIndex,
904 │         });
905 │         break;
906 │       case Node.COMMENT_NODE:
907 │         // Check if the comment node is a placeholder for a nested ICU
908 ▶         const isNestedIcu = NESTED_ICU.exec(currentNode.textContent || '');
909 │         if (isNestedIcu) {
910 │           const nestedIcuIndex = parseInt(isNestedIcu[1], 10);
911 │           const icuExpression: IcuExpression = nestedIcus[nestedIcuIndex];
912 │           // Create the comment node that will anchor the ICU expression
913 ▶           addCreateNodeAndAppend(
914 │             create,
915 │             ICU_MARKER,
916 │             ngDevMode ? `nested ICU ${nestedIcuIndex}` : '',
917 │             parentIdx,
918 │             newIndex,
919 │           );
920 ▶           icuStart(ast, tView, lView, sharedUpdateOpCodes, parentIdx, icuExpression, newIndex);
921 ▶           addRemoveNestedIcu(remove, newIndex, depth);
922 │         }
923 │         break;
924 │     }
925 │     currentNode = currentNode.nextSibling;
926 │   }
927 │   return bindingMask;
928 │ }
```

895 行目、テキストは作って親に足す命令にし、896 行目で消す命令にも入れます。式があれば 899 行目で case の `update` へ。908 行目で 597〜609 行目のコメントを見つけたら、913 行目でアンカーのコメントを作る命令を足し、920 行目で **`icuStart` を再帰で呼びます**。入れ子の ICU の切り替えの命令は、外の ICU の case の `update` に入ります（920 行目の `sharedUpdateOpCodes`）。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L930–958 （▶ の行: 931–932, 938–939, 949–952, 957）

```ts
930 │ function addRemoveNode(remove: I18nRemoveOpCodes, index: number, depth: number) {
931 ▶   if (depth === 0) {
932 ▶     remove.push(index);
933 │   }
934 │ }
935 │ 
936 │ function addRemoveNestedIcu(remove: I18nRemoveOpCodes, index: number, depth: number) {
937 │   if (depth === 0) {
938 ▶     remove.push(~index); // remove ICU at `index`
939 ▶     remove.push(index); // remove ICU comment at `index`
940 │   }
941 │ }
942 │ 
943 │ function addUpdateIcuSwitch(
944 │   update: I18nUpdateOpCodes,
945 │   icuExpression: IcuExpression,
946 │   index: number,
947 │ ) {
948 │   update.push(
949 ▶     toMaskBit(icuExpression.mainBinding),
950 ▶     2,
951 ▶     -1 - icuExpression.mainBinding,
952 ▶     (index << I18nUpdateOpCode.SHIFT_REF) | I18nUpdateOpCode.IcuSwitch,
953 │   );
954 │ }
955 │ 
956 │ function addUpdateIcuUpdate(update: I18nUpdateOpCodes, bindingMask: number, index: number) {
957 ▶   update.push(bindingMask, 1, (index << I18nUpdateOpCode.SHIFT_REF) | I18nUpdateOpCode.IcuUpdate);
958 │ }
```

- 931 行目：消す命令は**深さ 0 のノードだけ**。親を消せば子も一緒に消えるからです。
- 938〜939 行目：入れ子の ICU は「中身を消す」`~index` と「アンカーのコメントを消す」`index` の 2 つ。
- 949〜952 行目：切り替えの 1 かたまりは「`mainBinding` のマスク、長さ 2、その式の値、`(アンカー << 2) | IcuSwitch`」。第 9 回 6 節のテキストの塊と同じ形で、宛先の種類だけが違います。
- 957 行目：case の中の更新の 1 かたまりは「case のどこかで使う式のマスク、長さ 1、`(アンカー << 2) | IcuUpdate`」。

📄 `angular/packages/core/src/render3/i18n/i18n_parse.ts` L960–975 （▶ の行: 967–968, 970–973）

```ts
960 │ function addCreateNodeAndAppend(
961 │   create: IcuCreateOpCodes,
962 │   marker: null | ICU_MARKER | ELEMENT_MARKER,
963 │   text: string,
964 │   appendToParentIdx: number,
965 │   createAtIdx: number,
966 │ ) {
967 ▶   if (marker !== null) {
968 ▶     create.push(marker);
969 │   }
970 ▶   create.push(
971 ▶     text,
972 ▶     createAtIdx,
973 ▶     icuCreateOpCode(IcuCreateOpCode.AppendChild, appendToParentIdx, createAtIdx),
974 │   );
975 │ }
```

case の作る命令（`IcuCreateOpCodes`）は、要素なら `ELEMENT_MARKER`、入れ子の ICU なら `ICU_MARKER` の印を先に置き、続けて「文字（タグ名）、位置、`AppendChild` と親と自分の位置を詰めた数」を並べます（数の詰め方は [i18n の章](../template/06-i18n.md)の 1 節の図）。

## 5. 値が変わったとき：getCaseIndex と getPluralCase

更新のたびに `ɵɵi18nApply` が更新の命令を読み（[i18n の章](../template/06-i18n.md) 5 節）、宛先の種類で分かれます。

📄 `angular/packages/core/src/render3/i18n/i18n_apply.ts` L467–494 （▶ の行: 467–468, 470–471, 478–479, 486–488）

```ts
467 ▶               case I18nUpdateOpCode.IcuSwitch:
468 ▶                 applyIcuSwitchCase(tView, getTIcu(tView, nodeIndex)!, lView, value);
469 │                 break;
470 ▶               case I18nUpdateOpCode.IcuUpdate:
471 ▶                 applyIcuUpdateCase(tView, getTIcu(tView, nodeIndex)!, bindingsStartIndex, lView);
472 │                 break;
473 │             }
474 │           }
475 │         }
476 │       }
477 │     } else {
478 ▶       const opCode = updateOpCodes[i + 1] as number;
479 ▶       if (opCode > 0 && (opCode & I18nUpdateOpCode.MASK_OPCODE) === I18nUpdateOpCode.IcuUpdate) {
480 │         // Special case for the `icuUpdateCase`. It could be that the mask did not match, but
481 │         // we still need to execute `icuUpdateCase` because the case has changed recently due to
482 │         // previous `icuSwitchCase` instruction. (`icuSwitchCase` and `icuUpdateCase` always come in
483 │         // pairs.)
484 │         const nodeIndex = opCode >>> I18nUpdateOpCode.SHIFT_REF;
485 │         const tIcu = getTIcu(tView, nodeIndex)!;
486 ▶         const currentIndex = lView[tIcu.currentCaseLViewIndex];
487 ▶         if (currentIndex < 0) {
488 ▶           applyIcuUpdateCase(tView, tIcu, bindingsStartIndex, lView);
489 │         }
490 │       }
491 │     }
492 │     i += skipCodes;
493 │   }
494 │ }
```

467〜469 行目、`IcuSwitch` なら、組み立てた値（`mainBinding` の式の値を `renderStringify` で文字列にしたもの）で `applyIcuSwitchCase` を呼びます。`applyIcuSwitchCase` の本体は [hydration-i18n](../platform/13-hydration-i18n.md) で引用しました。順番は、`getCaseIndex` で case を選ぶ → いまの case と違えば `applyIcuSwitchCaseRemove` で消す → `lView[currentCaseLViewIndex]` に **`~caseIndex`（負の数）**を入れる → 新しい case の `create` を `applyMutableOpCodes` で当てる、です。

📄 `angular/packages/core/src/render3/i18n/i18n_apply.ts` L576–601 （▶ の行: 583, 586–590, 595, 600）

```ts
576 │ /**
577 │  * Returns the index of the current case of an ICU expression depending on the main binding value
578 │  *
579 │  * @param icuExpression
580 │  * @param bindingValue The value of the main binding used by this ICU expression
581 │  */
582 │ function getCaseIndex(icuExpression: TIcu, bindingValue: string): number | null {
583 ▶   let index = icuExpression.cases.indexOf(bindingValue);
584 │   if (index === -1) {
585 │     switch (icuExpression.type) {
586 ▶       case IcuType.plural: {
587 ▶         const resolvedCase = getPluralCase(bindingValue, getLocaleId());
588 ▶         index = icuExpression.cases.indexOf(resolvedCase);
589 ▶         if (index === -1 && resolvedCase !== 'other') {
590 ▶           index = icuExpression.cases.indexOf('other');
591 │         }
592 │         break;
593 │       }
594 │       case IcuType.select: {
595 ▶         index = icuExpression.cases.indexOf('other');
596 │         break;
597 │       }
598 │     }
599 │   }
600 ▶   return index === -1 ? null : index;
601 │ }
```

1. **583 行目：まず文字列で完全一致**

   値が `0` なら `'0'` が `cases` にあるので、`=0` の case がそのまま選ばれます。select の `male` なども、ここで決まります。
2. **587 行目：plural なら `getPluralCase(値, getLocaleId())`**

   ロケールは引数ではなく、`i18n_locale_id.ts` のモジュール変数です（起動のときに `LOCALE_ID` から入る。[第 12 回](12-loc-locale-data.md)）。
3. **589〜590 行目：その名前の case が無ければ `other`**
4. **595 行目：select は完全一致しなければ `other`。600 行目：それも無ければ `null`**

   `null` なら何も作りません（`other` の無い ICU で、合わない値が来たとき）。

📄 `angular/packages/core/src/i18n/localization.ts` L9–20 （▶ の行: 11, 16–19）

```ts
 9 │ import {getLocalePluralCase} from './locale_data_api';
10 │ 
11 ▶ const pluralMapping = ['zero', 'one', 'two', 'few', 'many'];
12 │ 
13 │ /**
14 │  * Returns the plural case based on the locale
15 │  */
16 ▶ export function getPluralCase(value: string, locale: string): string {
17 ▶   const plural = getLocalePluralCase(locale)(parseInt(value, 10));
18 ▶   const result = pluralMapping[plural];
19 ▶   return result !== undefined ? result : 'other';
20 │ }
```

📄 `angular/packages/core/src/i18n/locale_en.ts` L9–18 （▶ の行: 12–13, 15–17）

```ts
 9 │ // THIS CODE IS GENERATED - DO NOT MODIFY.
10 │ const u = undefined;
11 │ 
12 ▶ function plural(val: number): number {
13 ▶ const n = val, i = Math.floor(Math.abs(val)), v = val.toString().replace(/^[^.]*\.?/, '').length;
14 │ 
15 ▶ if (i === 1 && v === 0)
16 ▶     return 1;
17 ▶ return 5;
18 │ }
```

1. **17 行目：ロケールのデータの plural 関数に、`parseInt` した値を渡す**

   `getLocalePluralCase(locale)` は `findLocaleData(locale)` の `PluralCase` の欄（関数）です（[第 12 回](12-loc-locale-data.md)）。en の関数（locale\_en.ts 12〜18 行目）は、整数部が 1 で小数の桁が無ければ `1`、それ以外は `5` を返します。
2. **18〜19 行目：数を名前にする**

   11 行目の配列は 0〜4 の 5 つだけです。`5`（other）は配列に無いので `undefined` になり、19 行目で `'other'` になります。

> [!WARNING]
> **ハマりどころ**
>
> 17 行目の `parseInt(value, 10)` は小数を切り捨てます。`'1.5'` は `1` になり、en の plural 関数は `1`（one）を返します。同じ値を `I18nPluralPipe` に渡すと、common の `NgLocaleLocalization` は数のまま plural 関数に渡すので、en の関数は小数の桁 `v` が 1 になり `5`（other）を返します。つまり **ICU と `i18nPlural` パイプで、1.5 の case が変わります**。下のデモで確かめられます。この `parseInt` は「文字列のまま渡すと動かないロケールがある」ために #36901（2020 年）で入ったものです。

> **🧪 DEMO — 数を入れて、ICU と i18nPlural パイプと Intl.PluralRules の case を比べる**
>
> 「比べる」を押すと、`@angular/common/locales` の fr・ru・ar・ja を動的 import して本物の `registerLocaleData` で登録し（en は core に入っています）、5 つのロケールで比べます。ICU の列は、本物の `ɵgetLocalePluralCase`（ロケールのデータの plural 関数）を使った `getPluralCase` と `getCaseIndex` の**写し**で、ICU は `{count, plural, =0 {…} one {…} few {…} many {…} other {…}}` とします。パイプの列は本物の `I18nPluralPipe` を `new NgLocaleLocalization(ロケール)` で作って `transform` した結果、Intl の列はブラウザの `Intl.PluralRules` です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-runtime-icu)

## 6. case を消す・作る：applyIcuSwitchCaseRemove と applyMutableOpCodes

📄 `angular/packages/core/src/render3/i18n/i18n_util.ts` L132–143 （▶ の行: 136–137, 141–142）

```ts
132 │ /**
133 │  * Returns current ICU case.
134 │  *
135 │  * ICU cases are stored as index into the `TIcu.cases`.
136 ▶  * At times it is necessary to communicate that the ICU case just switched and that next ICU update
137 ▶  * should update all bindings regardless of the mask. In such a case the we store negative numbers
138 │  * for cases which have just been switched. This function removes the negative flag.
139 │  */
140 │ export function getCurrentICUCaseIndex(tIcu: TIcu, lView: LView) {
141 ▶   const currentCase: number | null = lView[tIcu.currentCaseLViewIndex];
142 ▶   return currentCase === null ? currentCase : currentCase < 0 ? ~currentCase : currentCase;
143 │ }
```

📄 `angular/packages/core/src/render3/i18n/i18n_apply.ts` L549–574 （▶ の行: 559, 561, 564, 566–567, 570）

```ts
549 │ /**
550 │  * Apply OpCodes associated with tearing ICU case.
551 │  *
552 │  * This involves tearing down existing case and than building up a new case.
553 │  *
554 │  * @param tView Current `TView`
555 │  * @param tIcu Current `TIcu`
556 │  * @param lView Current `LView`
557 │  */
558 │ function applyIcuSwitchCaseRemove(tView: TView, tIcu: TIcu, lView: LView) {
559 ▶   let activeCaseIndex = getCurrentICUCaseIndex(tIcu, lView);
560 │   if (activeCaseIndex !== null) {
561 ▶     const removeCodes = tIcu.remove[activeCaseIndex];
562 │     for (let i = 0; i < removeCodes.length; i++) {
563 │       const nodeOrIcuIndex = removeCodes[i] as number;
564 ▶       if (nodeOrIcuIndex > 0) {
565 │         // Positive numbers are `RNode`s.
566 ▶         const rNode = getNativeByIndex(nodeOrIcuIndex, lView);
567 ▶         rNode !== null && nativeRemoveNode(lView[RENDERER], rNode);
568 │       } else {
569 │         // Negative numbers are ICUs
570 ▶         applyIcuSwitchCaseRemove(tView, getTIcu(tView, ~nodeOrIcuIndex)!, lView);
571 │       }
572 │     }
573 │   }
574 │ }
```

559 行目でいまの case を取り（142 行目で負の数は `~` で戻す）、561 行目でその case の消す命令を読みます。564〜567 行目、正の数はそのノードを DOM から外し、570 行目、負の数は入れ子の ICU なので**同じ関数を再帰で呼んで**、その ICU がいま選んでいる case のノードを外します。外すだけで `lView` の枠は残すので、同じ case に戻ったときは作り直しません（[第 10 回](10-loc-runtime-dom.md) 5 節の `applyCreateOpCodes` の「まだ無ければ作る」と同じ考えです）。

📄 `angular/packages/core/src/render3/i18n/i18n_apply.ts` L261–290 （▶ の行: 263–265, 267, 271–273, 277–278, 282–284, 287）

```ts
261 │   for (let i = 0; i < mutableOpCodes.length; i++) {
262 │     const opCode = mutableOpCodes[i];
263 ▶     if (typeof opCode == 'string') {
264 ▶       const textNodeIndex = mutableOpCodes[++i] as number;
265 ▶       if (lView[textNodeIndex] === null) {
266 │         ngDevMode && assertIndexInRange(lView, textNodeIndex);
267 ▶         lView[textNodeIndex] = _locateOrCreateNode(lView, textNodeIndex, opCode, Node.TEXT_NODE);
268 │       }
269 │     } else if (typeof opCode == 'number') {
270 │       switch (opCode & IcuCreateOpCode.MASK_INSTRUCTION) {
271 ▶         case IcuCreateOpCode.AppendChild:
272 ▶           const parentIdx = getParentFromIcuCreateOpCode(opCode);
273 ▶           if (rootIdx === null) {
274 │             // The first operation should save the `rootIdx` because the first operation
275 │             // must insert into the root. (Only subsequent operations can insert into a dynamic
276 │             // parent)
277 ▶             rootIdx = parentIdx;
278 ▶             rootRNode = renderer.parentNode(anchorRNode);
279 │           }
280 │           let insertInFrontOf: RNode | null;
281 │           let parentRNode: RElement | null;
282 ▶           if (parentIdx === rootIdx) {
283 ▶             insertInFrontOf = anchorRNode;
284 ▶             parentRNode = rootRNode;
285 │           } else {
286 │             insertInFrontOf = null;
287 ▶             parentRNode = unwrapRNode(lView[parentIdx]) as RElement;
288 │           }
289 │           // FIXME(misko): Refactor with `processI18nText`
290 │           if (parentRNode !== null) {
```

📄 `angular/packages/core/src/render3/i18n/i18n_apply.ts` L291–314 （▶ の行: 302–304, 308, 310）

```ts
291 │             // This can happen if the `LView` we are adding to is not attached to a parent `LView`.
292 │             // In such a case there is no "root" we can attach to. This is fine, as we still need to
293 │             // create the elements. When the `LView` gets later added to a parent these "root" nodes
294 │             // get picked up and added.
295 │             ngDevMode && assertDomNode(parentRNode);
296 │             const refIdx = getRefFromIcuCreateOpCode(opCode);
297 │             ngDevMode && assertGreaterThan(refIdx, HEADER_OFFSET, 'Missing ref');
298 │             // `unwrapRNode` is not needed here as all of these point to RNodes as part of the i18n
299 │             // which can't have components.
300 │             const child = lView[refIdx] as RElement;
301 │             ngDevMode && assertDomNode(child);
302 ▶             nativeInsertBefore(renderer, parentRNode, child, insertInFrontOf, false);
303 ▶             const tIcu = getTIcu(tView, refIdx);
304 ▶             if (tIcu !== null && typeof tIcu === 'object') {
305 │               // If we just added a comment node which has ICU then that ICU may have already been
306 │               // rendered and therefore we need to re-add it here.
307 │               ngDevMode && assertTIcu(tIcu);
308 ▶               const caseIndex = getCurrentICUCaseIndex(tIcu, lView);
309 │               if (caseIndex !== null) {
310 ▶                 applyMutableOpCodes(tView, tIcu.create[caseIndex], lView, lView[tIcu.anchorIdx]);
311 │               }
312 │             }
313 │           }
314 │           break;
```

1. **263〜268 行目：文字列ならテキストノード（まだ無ければ作る）**
2. **271〜288 行目：`AppendChild` は「どこへ入れるか」を決める**

   最初の `AppendChild` の親が「根」です（277〜278 行目）。根に入れるものは、282〜284 行目で**アンカーのコメントの前**に入れます。根でなければ 287 行目、case の中で先に作った要素（`<b>` など）の中に入れます。
3. **302〜312 行目：入れたのが入れ子の ICU のアンカーなら、その中身も入れ直す**

   入れ子の ICU がすでに case を選んでいれば（308 行目）、310 行目でその case の作る命令を再帰で当てます。

📄 `angular/packages/core/src/render3/i18n/i18n_apply.ts` L340–361 （▶ の行: 341, 344, 352, 359）

```ts
340 │       switch (opCode) {
341 ▶         case ICU_MARKER:
342 │           const commentValue = mutableOpCodes[++i] as string;
343 │           const commentNodeIndex = mutableOpCodes[++i] as number;
344 ▶           if (lView[commentNodeIndex] === null) {
345 │             ngDevMode &&
346 │               assertEqual(
347 │                 typeof commentValue,
348 │                 'string',
349 │                 `Expected "${commentValue}" to be a comment node value`,
350 │               );
351 │             ngDevMode && assertIndexInExpandoRange(lView, commentNodeIndex);
352 ▶             const commentRNode = (lView[commentNodeIndex] = _locateOrCreateNode(
353 │               lView,
354 │               commentNodeIndex,
355 │               commentValue,
356 │               Node.COMMENT_NODE,
357 │             ));
358 │             // FIXME(misko): Attaching patch data is only needed for the root (Also add tests)
359 ▶             attachPatchData(commentRNode, lView);
360 │           }
361 │           break;
```

`ICU_MARKER` は入れ子の ICU のアンカーのコメントを作ります（`ELEMENT_MARKER` の枝も同じ形で要素を作ります）。359 行目の `attachPatchData` は、DOM から `LView` をたどれるようにする印です。

📄 `angular/packages/core/src/render3/i18n/i18n_apply.ts` L496–518 （▶ の行: 506, 509, 512, 514, 516）

```ts
496 │ /**
497 │  * Apply OpCodes associated with updating an existing ICU.
498 │  *
499 │  * @param tView Current `TView`
500 │  * @param tIcu Current `TIcu`
501 │  * @param bindingsStartIndex Location of the first `ɵɵi18nApply`
502 │  * @param lView Current `LView`
503 │  */
504 │ function applyIcuUpdateCase(tView: TView, tIcu: TIcu, bindingsStartIndex: number, lView: LView) {
505 │   ngDevMode && assertIndexInRange(lView, tIcu.currentCaseLViewIndex);
506 ▶   let activeCaseIndex = lView[tIcu.currentCaseLViewIndex];
507 │   if (activeCaseIndex !== null) {
508 │     let mask = changeMask;
509 ▶     if (activeCaseIndex < 0) {
510 │       // Clear the flag.
511 │       // Negative number means that the ICU was freshly created and we need to force the update.
512 ▶       activeCaseIndex = lView[tIcu.currentCaseLViewIndex] = ~activeCaseIndex;
513 │       // -1 is same as all bits on, which simulates creation since it marks all bits dirty
514 ▶       mask = -1;
515 │     }
516 ▶     applyUpdateOpCodes(tView, lView, tIcu.update[activeCaseIndex], bindingsStartIndex, mask);
517 │   }
518 │ }
```

case を作っただけでは、その中の式（`�1� items` の `�1�`）はまだ空です。509〜515 行目、切り替えたばかり（負の数）なら `~` で戻して正の数を書き戻し、マスクを `-1`（全部の桁が立っている）にして、516 行目で case の `update` を全部当てます。5 節の 477〜490 行目の「マスクが合わなくても、切り替えたばかりなら当てる」特別扱いは、この負の数を見ています。

## 7. ICU のコンテナとほかのノード

📄 `angular/packages/core/src/render3/i18n/i18n_util.ts` L34–65 （▶ の行: 40–42, 49, 60–62）

```ts
34 │ /**
35 │  * Retrieve `TIcu` at a given `index`.
36 │  *
37 │  * The `TIcu` can be stored either directly (if it is nested ICU) OR
38 │  * it is stored inside tho `TIcuContainer` if it is top level ICU.
39 │  *
40 ▶  * The reason for this is that the top level ICU need a `TNode` so that they are part of the render
41 ▶  * tree, but nested ICU's have no TNode, because we don't know ahead of time if the nested ICU is
42 ▶  * expressed (parent ICU may have selected a case which does not contain it.)
43 │  *
44 │  * @param tView Current `TView`.
45 │  * @param index Index where the value should be read from.
46 │  */
47 │ export function getTIcu(tView: TView, index: number): TIcu | null {
48 │   const value = tView.data[index] as null | TIcu | TIcuContainerNode | string;
49 ▶   if (value === null || typeof value === 'string') return null;
50 │   if (
51 │     ngDevMode &&
52 │     !(Object.hasOwn(value, TVIEW) || Object.hasOwn(value, CURRENT_CASE_LVIEW_INDEX))
53 │   ) {
54 │     throwError("We expect to get 'null'|'TIcu'|'TIcuContainer', but got: " + value);
55 │   }
56 │   // Here the `Object.hasOwn(value, CURRENT_CASE_LVIEW_INDEX)` is a polymorphic read as it can be
57 │   // either TIcu or TIcuContainerNode. This is not ideal, but we still think it is OK because it
58 │   // will be just two cases which fits into the browser inline cache (inline cache can take up to
59 │   // 4)
60 ▶   const tIcu = Object.hasOwn(value, CURRENT_CASE_LVIEW_INDEX)
61 ▶     ? (value as TIcu)
62 ▶     : (value as TIcuContainerNode).value;
63 │   ngDevMode && assertTIcu(tIcu);
64 │   return tIcu;
65 │ }
```

40〜42 行目のコメントのとおり、いちばん外の ICU には描画の木に入るための TNode（`TIcuContainerNode`）があり、入れ子の ICU には無い（親の case によっては表に出ないので、先に作れない）。だから 60〜62 行目で 2 つの置き場を見分けます。

ICU のコンテナの TNode は、`@if` のビューを抜き差しするときなどに「この TNode に属する DOM はどれか」を聞かれます。ICU の DOM は case によって違うので、選んでいる case の消す命令を、そのまま「根のノードの一覧」として読みます。

📄 `angular/packages/core/src/render3/i18n/i18n_icu_container_visitor.ts` L27–66 （▶ の行: 29, 32, 39, 42–43, 47, 49, 52, 56–58, 61–62）

```ts
27 │ function enterIcu(state: IcuIteratorState, tIcu: TIcu, lView: LView) {
28 │   state.index = 0;
29 ▶   const currentCase = getCurrentICUCaseIndex(tIcu, lView);
30 │   if (currentCase !== null) {
31 │     ngDevMode && assertNumberInRange(currentCase, 0, tIcu.cases.length - 1);
32 ▶     state.removes = tIcu.remove[currentCase];
33 │   } else {
34 │     state.removes = EMPTY_ARRAY as any;
35 │   }
36 │ }
37 │ 
38 │ export function icuContainerIteratorNext(state: IcuIteratorState): RNode | null {
39 ▶   if (state.index < state.removes!.length) {
40 │     const removeOpCode = state.removes![state.index++] as number;
41 │     ngDevMode && assertNumber(removeOpCode, 'Expecting OpCode number');
42 ▶     if (removeOpCode > 0) {
43 ▶       const rNode = state.lView![removeOpCode];
44 │       ngDevMode && assertDomNode(rNode);
45 │       return rNode;
46 │     } else {
47 ▶       state.stack.push(state.index, state.removes);
48 │       // ICUs are represented by negative indices
49 ▶       const tIcuIndex = ~removeOpCode;
50 │       const tIcu = state.lView![TVIEW].data[tIcuIndex] as TIcu;
51 │       ngDevMode && assertTIcu(tIcu);
52 ▶       enterIcu(state, tIcu, state.lView!);
53 │       return icuContainerIteratorNext(state);
54 │     }
55 │   } else {
56 ▶     if (state.stack.length === 0) {
57 ▶       // Clear the lView reference when iteration completes to allow garbage collection
58 ▶       state.lView = undefined;
59 │       return null;
60 │     } else {
61 ▶       state.removes = state.stack.pop();
62 ▶       state.index = state.stack.pop();
63 │       return icuContainerIteratorNext(state);
64 │     }
65 │   }
66 │ }
```

📄 `angular/packages/core/src/render3/i18n/i18n_icu_container_visitor.ts` L88–102 （▶ の行: 94–95, 97–98）

```ts
 88 │    * @param lView `LView` where the `RNode`s should be looked up.
 89 │    */
 90 │   function icuContainerIteratorStart(
 91 │     tIcuContainerNode: TIcuContainerNode,
 92 │     lView: LView,
 93 │   ): IcuIterator {
 94 ▶     _state.lView = lView;
 95 ▶     while (_state.stack.length) _state.stack.pop();
 96 │     ngDevMode && assertTNodeForLView(tIcuContainerNode, lView);
 97 ▶     enterIcu(_state, tIcuContainerNode.value, lView);
 98 ▶     return icuContainerIteratorNext.bind(null, _state);
 99 │   }
100 │ 
101 │   return icuContainerIteratorStart;
102 │ }
```

📄 `angular/packages/core/src/render3/node_manipulation.ts` L829–843 （▶ の行: 829–830, 832–833）

```ts
829 ▶       } else if (tNodeType & TNodeType.Icu) {
830 ▶         const nextRNode = icuContainerIterate(tNode as TIcuContainerNode, lView);
831 │         let rNode: RNode | null;
832 ▶         while ((rNode = nextRNode())) {
833 ▶           applyToElementOrContainer(
834 │             action,
835 │             renderer,
836 │             injector,
837 │             parentRElement,
838 │             rNode,
839 │             tNode,
840 │             beforeNode,
841 │             lView,
842 │           );
843 │         }
```

1. **node\_manipulation.ts 829〜843 行目：ICU のコンテナに出会ったら、反復子でノードを 1 つずつもらう**
2. **29〜35 行目：いまの case の消す命令を、ノードの一覧として持つ**
3. **42〜45 行目：正の数ならそのノードを返す。46〜53 行目：負の数（入れ子の ICU）なら、いまの位置をスタックに積んで中に入る**
4. **56〜64 行目：一覧が終わったら、スタックから戻る。空なら `null` で終わり**

   57〜58 行目は、終わったら `lView` への参照を外して、ガベージコレクションを妨げないようにする行です（i18n\_spec.ts の it `should clear lView reference when ICU iteration completes` が確かめています）。

📄 `angular/packages/core/src/render3/i18n/i18n_tree_shaking.ts` L20–49 （▶ の行: 20, 32, 41, 44, 47）

```ts
20 ▶ let _icuContainerIterate: (
21 │   tIcuContainerNode: TIcuContainerNode,
22 │   lView: LView,
23 │ ) => () => RNode | null;
24 │ 
25 │ /**
26 │  * Iterator which provides ability to visit all of the `TIcuContainerNode` root `RNode`s.
27 │  */
28 │ export function icuContainerIterate(
29 │   tIcuContainerNode: TIcuContainerNode,
30 │   lView: LView,
31 │ ): () => RNode | null {
32 ▶   return _icuContainerIterate(tIcuContainerNode, lView);
33 │ }
34 │ 
35 │ /**
36 │  * Ensures that `IcuContainerVisitor`'s implementation is present.
37 │  *
38 │  * This function is invoked when i18n instruction comes across an ICU. The purpose is to allow the
39 │  * bundler to tree shake ICU logic and only load it if ICU instruction is executed.
40 │  */
41 ▶ export function ensureIcuContainerVisitorLoaded(
42 │   loader: () => (tIcuContainerNode: TIcuContainerNode, lView: LView) => () => RNode | null,
43 │ ) {
44 ▶   if (_icuContainerIterate === undefined) {
45 │     // Do not inline this function. We want to keep `ensureIcuContainerVisitorLoaded` light, so it
46 │     // can be inlined into call-site.
47 ▶     _icuContainerIterate = loader();
48 │   }
49 │ }
```

反復子の本体（`loadIcuContainerVisitor`）は、1 節の `createTNodeAndAddOpCode` の中（第 9 回 6 節の `ensureIcuContainerVisitorLoaded`）で ICU に出会ったときに初めて 47 行目で入ります。ICU を使わないアプリでは `icuContainerIterate` は呼ばれず（ICU のコンテナの TNode が無い）、`loadIcuContainerVisitor` を呼ぶコードも走りません。

## 8. ここまでを 1 本に

- `i18nStartFirstCreatePass` — i18n\_parse.ts L131 — *初回だけ（第 9 回）*
  - `i18nParseTextIntoPartsAndICU → parseICUBlock` — i18n\_parse.ts L693・L643 — *種類・mainBinding・cases・values*
  - `createTNodeAndAddOpCode(…, true)` — i18n\_parse.ts L186 — *アンカーのコメント。ICU の反復子を読み込む*
  - `icuStart` — i18n\_parse.ts L573 — *TIcu、IcuSwitch の命令*
    - `parseIcuCase → walkIcuTree` — i18n\_parse.ts L741・L789 — *中身を inert な DOM で読み、create / remove / update*
      - `icuStart（入れ子）` — i18n\_parse.ts L920
- `ɵɵi18nExp(ctx.count) → ɵɵi18nApply` — instructions/i18n.ts — *更新のたび*
  - `applyUpdateOpCodes → IcuSwitch` — i18n\_apply.ts L467
    - `applyIcuSwitchCase` — i18n\_apply.ts L530 — *本体は hydration-i18n*
      - `getCaseIndex → getPluralCase(値, getLocaleId())` — i18n\_apply.ts L582・localization.ts L16 — *完全一致 → plural の規則 → other*
      - `applyIcuSwitchCaseRemove` — i18n\_apply.ts L558 — *前の case を外す（入れ子は再帰）*
      - `applyMutableOpCodes(tIcu.create[case])` — i18n\_apply.ts L245 — *アンカーの前に作る*
  - `applyUpdateOpCodes → IcuUpdate → applyIcuUpdateCase` — i18n\_apply.ts L470・L504 — *切り替えたばかりなら全部の式を当てる*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット | 件数 |
| --- | --- | --- | --- |
| core/test/render3/i18n/i18n\_parse\_spec.ts | `i18n_parse` &gt; `icu`（24 行目）：`should parse simple ICU`（41）・`HTML in ICU`（126）・`nested ICU`（159）・悪い URL のサニタイズ（301）・知らない属性（330）など 6 本 | `//packages/core/test/render3:render3` | 6 |
| core/test/render3/i18n/i18n\_spec.ts | `Runtime i18n` &gt; `i18nStart` の `for ICU expressions`（341）・`for nested ICU expressions`（469）・`should clear lView reference when ICU iteration completes`（592） | `//packages/core/test/render3:render3` | （第 9 回の 21 本に含む） |
| core/test/acceptance/i18n\_spec.ts | `runtime i18n` &gt; `should support ICU expressions`（939 行目の describe。`"ro" locale`（1253）・`"es" locale`（1320）・`without "other" cases`（1730）など） | `//packages/core/test/acceptance:acceptance` | 28 |

📄 `angular/packages/core/test/render3/i18n/i18n_parse_spec.ts` L55–74 （▶ の行: 56, 65, 71）

```ts
55 │       const tI18n = toT18n(`before|{
56 ▶           �0�, select,
57 │             A {caseA}
58 │             other {otherCase}
59 │         }|after`);
60 │       expect(tI18n).toEqual(
61 │         matchTI18n({
62 │           create: matchDebug([
63 │             `lView[${HEADER_OFFSET + 2}] = document.createText("before|");`,
64 │             `parent.appendChild(lView[${HEADER_OFFSET + 2}]);`,
65 ▶             `lView[${HEADER_OFFSET + 3}] = document.createComment("ICU ${HEADER_OFFSET + 0}:0");`,
66 │             `parent.appendChild(lView[${HEADER_OFFSET + 3}]);`,
67 │             `lView[${HEADER_OFFSET + 7}] = document.createText("|after");`,
68 │             `parent.appendChild(lView[${HEADER_OFFSET + 7}]);`,
69 │           ]),
70 │           update: matchDebug([
71 ▶             `if (mask & 0b1) { icuSwitchCase(${HEADER_OFFSET + 3}, \`\${lView[i-1]}\`); }`,
72 │           ]),
73 │         }),
74 │       );
```

📄 `angular/packages/core/test/render3/i18n/i18n_parse_spec.ts` L99–124 （▶ の行: 101, 104–105, 107, 111, 114, 118, 121）

```ts
 99 │       fixture.apply(() => {
100 │         applyCreateOpCodes(fixture.lView, tI18n.create, fixture.host, null);
101 ▶         expect(fixture.host.innerHTML).toEqual(`before|<!--ICU ${HEADER_OFFSET + 0}:0-->|after`);
102 │       });
103 │       fixture.apply(() => {
104 ▶         ɵɵi18nExp('A');
105 ▶         ɵɵi18nApply(0);
106 │         expect(fixture.host.innerHTML).toEqual(
107 ▶           `before|caseA<!--ICU ${HEADER_OFFSET + 0}:0-->|after`,
108 │         );
109 │       });
110 │       fixture.apply(() => {
111 ▶         ɵɵi18nExp('x');
112 │         ɵɵi18nApply(0);
113 │         expect(fixture.host.innerHTML).toEqual(
114 ▶           `before|otherCase<!--ICU ${HEADER_OFFSET + 0}:0-->|after`,
115 │         );
116 │       });
117 │       fixture.apply(() => {
118 ▶         ɵɵi18nExp('A');
119 │         ɵɵi18nApply(0);
120 │         expect(fixture.host.innerHTML).toEqual(
121 ▶           `before|caseA<!--ICU ${HEADER_OFFSET + 0}:0-->|after`,
122 │         );
123 │       });
124 │     });
```

65 行目、アンカーのコメントの文字は `ICU 位置:mainBinding`（1 節の 192 行目）。71 行目、case に式が無いので、更新の命令は `icuSwitchCase` の 1 かたまりだけです（4 節の 625 行目の `if` が偽）。101〜123 行目は `ɵɵi18nExp` と `ɵɵi18nApply` を直接呼んで、A → x（`other`）→ A と切り替え、107 行目のとおり case の DOM が**アンカーの前**に入ることを確かめています。

📄 `angular/packages/core/test/acceptance/i18n_spec.ts` L1267–1300 （▶ の行: 1273–1274, 1287, 1293, 1296）

```ts
1267 │       loadTranslations({
1268 │         [computeMsgId(
1269 │           '{VAR_PLURAL, plural, =0 {no email} =one {one email} =few {a few emails} =other {lots of emails}}',
1270 │         )]:
1271 │           '{VAR_PLURAL, plural, =0 {no email} =one {one email} =few {a few emails} =other {lots of emails}}',
1272 │       });
1273 ▶       registerLocaleData(localeRo);
1274 ▶       TestBed.configureTestingModule({providers: [{provide: LOCALE_ID, useValue: 'ro'}]});
1275 │       // We could also use `TestBed.overrideProvider(LOCALE_ID, {useValue: 'ro'});`
1276 │       const fixture = initWithTemplate(
1277 │         AppComp,
1278 │         `
1279 │           {count, plural,
1280 │             =0 {no email}
1281 │             =one {one email}
1282 │             =few {a few emails}
1283 │             =other {lots of emails}
1284 │           }`,
1285 │       );
1286 │ 
1287 ▶       expect(fixture.nativeElement.innerHTML).toEqual(`no email<!--ICU ${HEADER_OFFSET + 0}:0-->`);
1288 │ 
1289 │       // Change detection cycle, no model changes
1290 │       fixture.detectChanges();
1291 │       expect(fixture.nativeElement.innerHTML).toEqual(`no email<!--ICU ${HEADER_OFFSET + 0}:0-->`);
1292 │ 
1293 ▶       fixture.componentInstance.count = 3;
1294 │       fixture.detectChanges();
1295 │       expect(fixture.nativeElement.innerHTML).toEqual(
1296 ▶         `a few emails<!--ICU ${HEADER_OFFSET + 0}:0-->`,
1297 │       );
1298 │ 
1299 │       fixture.componentInstance.count = 1;
1300 │       fixture.detectChanges();
```

1273〜1274 行目で ro のロケールのデータを登録し、`LOCALE_ID` を `'ro'` にします（`TestBed` も起動と同じく `setLocaleId` を呼ぶ。[第 12 回](12-loc-locale-data.md)）。1293〜1296 行目、3 は ro の規則で `few` です。**小数の値を確かめる it はありません。**

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/render3:render3 --nocache_test_results --test_output=all '--test_arg=--filter=i18n_parse'
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all '--test_arg=--filter=runtime i18n should support ICU expressions'
```

📄 `出力（2026-11-03 に実行。抜粋。ログは scratchpad/i18n-logs/c-parse-icu.log・c-acc-icu.log）`

```
# render3（i18n_parse）
Ran 6 of 574 specs
6 specs, 0 failures
//packages/core/test/render3:render3                                     PASSED in 0.9s
# acceptance（runtime i18n should support ICU expressions）
Ran 28 of 2693 specs
28 specs, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.5s
```

- `i18n_parse` で 6 of 574（0.9 秒）。i18n\_parse\_spec.ts の it の数と一致します。
- acceptance の `runtime i18n should support ICU expressions` で 28 of 2693（1.5 秒）。

### 直すとしたら

- 小数の case（5 節の注意）：`packages/core/src/i18n/localization.ts` の `getPluralCase` の 17 行目です。`parseInt` の代わりに数にする（`Number(value)` など）なら、#36901 が守ろうとした「数を渡す」は保てますが、`'1.0'` のような文字列（小数の桁があるので en では other）と `1` の違いが生まれるので、CLDR の `v`（表示する小数の桁数）をどう扱うかを先に決めます。it は acceptance の `should support ICU expressions` に 1253 行目の形で、値を 1.5 にして足せます。
- ICU の中身の解析を変えるなら 2 節と 4 節（`parseICUBlock`・`walkIcuTree`）で、spec は i18n\_parse\_spec.ts の 55〜74 行目の形（命令の debug の文字列を比べる）です。開いている #62694（ICU の中の `#`）は、ICU の文字が `#` をどう扱うか（ICU の標準では plural の値）で、2 節の 667 行目にも 4 節にも `#` を見る行はありません。#60566（ICU の補間を含む翻訳の解析）・#21615（属性の ICU）と合わせて [第 20 回](20-loc-issues.md)で読みます。
- 本家に PR を出すことは勧めません。手元で it を足して落ちることを確かめ、issue を探すとき・読むときの手がかりにします。

## 聞かれそうな質問

**Q. ICU の case の DOM は、どこに入りますか？**

アンカーのコメントの前です。1 節の 186〜194 行目でコメントを作り、case の作る命令の根の分は 6 節の 282〜284 行目で `insertInFrontOf = anchorRNode` になります。i18n\_parse\_spec.ts の 107 行目の `before|caseA<!--ICU …-->|after` がその形です。

**Q. `=1 {…}` と `one {…}` はどちらが優先されますか？**

`=1` です。2 節の 667 行目で `=1` は `'1'` になり、5 節の 583 行目でまず値の文字列 `'1'` と完全一致を探すからです。合わなかったときだけ 587 行目で plural の規則（`one` など）を使います。

**Q. ICU の plural は、どのロケールで規則を選びますか？**

587 行目の `getLocaleId()`、つまり起動のときに `LOCALE_ID` から `setLocaleId` で入ったグローバルな値です。コンポーネントごとに `LOCALE_ID` を provide しても ICU には効きません（[第 12 回](12-loc-locale-data.md)）。`I18nPluralPipe` は inject した `LOCALE_ID` か引数のロケールを使うので、ここも違います。

**Q. case を切り替えるたびに DOM を作り直しますか？**

前の case のノードは DOM から外すだけで、`lView` の枠には残ります（6 節の 564〜567 行目）。同じ case に戻ったときは、作る命令の「まだ無ければ作る」（263〜268 行目など）で既存のノードを入れ直すだけです。

**Q. 翻訳の ICU の中に `<script>` や `onclick` が書かれていたら？**

作られません。4 節の 811 行目で `VALID_ELEMENTS` に無い要素は飛ばし、属性も `VALID_ATTRS` にあるものだけを入れます（818〜825 行目は式のある属性。式の無い属性も `walkIcuTree` の続きで同じ一覧を見ます）。i18n\_parse\_spec.ts の 301 行目と 330 行目の it がその確認です。

## 読み終えて

- ICU は初回に `TIcu` になり、case ごとに `create`・`remove`・`update` の 3 つの命令の束を持ちます。いまどの case かは `LView` の `currentCaseLViewIndex` にあります。
- case の中身の HTML は、サニタイザの inert な DOM に読ませて木にし、`walkIcuTree` が許可された要素と属性だけを命令にします。
- 値が変わると `getCaseIndex` が「完全一致 → plural の規則（`getPluralCase`）→ `other`」の順で case を選び、前の case を外して新しい case をアンカーの前に作り、切り替えたばかりなら全部の式を当てます。
- plural の規則は、ロケールのデータの plural 関数（CLDR から作ったもの。第 12 回）です。ICU は値を `parseInt` してから渡すので、小数では `i18nPlural` パイプや `Intl.PluralRules` と違う case になることがあります。

---

← 前: [実行時（2）：翻訳の順に DOM を並べる](10-loc-runtime-dom.md)  
次: [ロケールのデータ：LOCALE\_ID・registerLocaleData・CLDR](12-loc-locale-data.md) →
