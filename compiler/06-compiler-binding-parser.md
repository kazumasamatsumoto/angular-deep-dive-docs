[目次](../README.md) › [テンプレートコンパイラの内側](README.md) › 第 6 回 / 全 18 回

# バインディングのパーサ：\[prop\]・(event)・\[attr.x\]・\[class.x\]・\[(x)\] と \*ngFor の微小構文

> r3\_template\_transform が属性名の接頭辞（bind- / on- / bindon- / \[ \] / ( ) / \[( )\] / \* / # / ref- / let- / @）を見分け、template\_parser/binding\_parser.ts の BindingParser が parsePropertyBinding / parseEvent / parseInterpolation で ParsedProperty と ParsedEvent を作る行。\[attr.\] \[class.\] \[style.\] の BindingType、セキュリティコンテキストの決め方、\*ngFor="let x of xs; trackBy: f" を parseTemplateBindings が key と value の組に分ける手順。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-binding-parser)

---

`[attr.aria-label]="x"`・`(keydown.enter)="f()"`・`*ngFor="let x of xs"` は、HTML のパーサから見ると「名前と値の組」の属性にすぎません。この章では、**属性名の書き方から「これは何のバインディングか」を決める手順**を、`r3_template_transform.ts` の振り分け → `BindingParser` の `ParsedProperty` / `ParsedEvent` → `BoundElementProperty`（`BindingType` とセキュリティコンテキスト）の順に追います。最後に `*ngFor` の右辺（微小構文）が key と value の組に分かれる行を読みます。

読む対象は `compiler/src/render3/r3_template_transform.ts`、`compiler/src/template_parser/binding_parser.ts`、`compiler/src/expression_parser/parser.ts`・`ast.ts`、`compiler/src/schema/dom_element_schema_registry.ts`・`dom_security_schema.ts`、比較のために `platform-browser/src/dom/events/key_events.ts` です。

1. [1. 全体図](01-compiler.md)
2. [2. コンパイラの入口](02-compiler-entry.md)
3. [3. HTML の字句解析](03-compiler-html-lexer.md)
4. [4. HTML の構文解析](04-compiler-html-parser.md)
5. [5. 式のパーサ](05-compiler-expression-parser.md)
6. **6. バインディングのパーサ**（この章）
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
18. [18. スタイルのカプセル化](18-compiler-shadow-css.md)

属性は 2 段階で形を変えます。まず属性名の接頭辞・括弧を見て **`ParsedProperty`（名前はまだ `attr.aria-label` のまま）**や `ParsedEvent` を作り、要素を組み立てるときに `ParsedProperty` を **`BoundElementProperty`（名前は `aria-label`、種類は `BindingType.Attribute`）**に変えます。その間に、右辺の文字列は[前章の式のパーサ](05-compiler-expression-parser.md)で AST になります。

## 1. 属性名の判定：BIND\_NAME\_REGEXP と括弧

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L40–63 （▶ の行: 40, 43, 45, 47, 49, 51, 53, 55, 57–60, 63）

```ts
40 ▶ const BIND_NAME_REGEXP = /^(?:(bind-)|(let-)|(ref-|#)|(on-)|(bindon-)|(@))(.*)$/;
41 │ 
42 │ // Group 1 = "bind-"
43 ▶ const KW_BIND_IDX = 1;
44 │ // Group 2 = "let-"
45 ▶ const KW_LET_IDX = 2;
46 │ // Group 3 = "ref-/#"
47 ▶ const KW_REF_IDX = 3;
48 │ // Group 4 = "on-"
49 ▶ const KW_ON_IDX = 4;
50 │ // Group 5 = "bindon-"
51 ▶ const KW_BINDON_IDX = 5;
52 │ // Group 6 = "@"
53 ▶ const KW_AT_IDX = 6;
54 │ // Group 7 = the identifier after "bind-", "let-", "ref-/#", "on-", "bindon-" or "@"
55 ▶ const IDENT_KW_IDX = 7;
56 │ 
57 ▶ const BINDING_DELIMS = {
58 ▶   BANANA_BOX: {start: '[(', end: ')]'},
59 ▶   PROPERTY: {start: '[', end: ']'},
60 ▶   EVENT: {start: '(', end: ')'},
61 │ };
62 │ 
63 ▶ const TEMPLATE_ATTR_PREFIX = '*';
```

40 行目の正規表現が、`bind-`・`let-`・`ref-` または `#`・`on-`・`bindon-`・`@` のどれかで始まる名前を拾います。どのグループに当たったかを 43〜53 行目の番号で調べ、55 行目の 7 番目のグループが接頭辞を外した残りの名前です。括弧の形は 57〜61 行目の 3 種類、`*` は 63 行目の定数で別に扱います。

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L743–777 （▶ の行: 743–744, 746–747, 750, 755, 758, 760–761, 763, 765, 768–769）

```ts
743 ▶     const name = attribute.name;
744 ▶     const value = attribute.value;
745 │     const srcSpan = attribute.sourceSpan;
746 ▶     const absoluteOffset = attribute.valueSpan
747 ▶       ? attribute.valueSpan.fullStart.offset
748 │       : srcSpan.fullStart.offset;
749 │ 
750 ▶     function createKeySpan(srcSpan: ParseSourceSpan, prefix: string, identifier: string) {
751 │       // We need to adjust the start location for the keySpan to account for the removed 'data-'
752 │       // prefix from `normalizeAttributeName`.
753 │       const keySpanStart = srcSpan.start.moveBy(prefix.length);
754 │       const keySpanEnd = keySpanStart.moveBy(identifier.length);
755 ▶       return new ParseSourceSpan(keySpanStart, keySpanEnd, keySpanStart, identifier);
756 │     }
757 │ 
758 ▶     const bindParts = name.match(BIND_NAME_REGEXP);
759 │ 
760 ▶     if (bindParts) {
761 ▶       if (bindParts[KW_BIND_IDX] != null) {
762 │         // 3p-only-start
763 ▶         const identifier = bindParts[IDENT_KW_IDX];
764 │         const keySpan = createKeySpan(srcSpan, bindParts[KW_BIND_IDX], identifier);
765 ▶         this.bindingParser.parsePropertyBinding(
766 │           identifier,
767 │           value,
768 ▶           false,
769 ▶           false,
770 │           srcSpan,
771 │           absoluteOffset,
772 │           attribute.valueSpan,
773 │           matchableAttributes,
774 │           parsedProperties,
775 │           keySpan,
776 │         );
777 │         // 3p-only-end
```

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L778–806 （▶ の行: 778–779, 782, 784, 786, 789–790, 795, 798, 805）

```ts
778 ▶       } else if (bindParts[KW_LET_IDX]) {
779 ▶         if (isTemplateElement) {
780 │           const identifier = bindParts[IDENT_KW_IDX];
781 │           const keySpan = createKeySpan(srcSpan, bindParts[KW_LET_IDX], identifier);
782 ▶           this.parseVariable(identifier, value, srcSpan, keySpan, attribute.valueSpan, variables);
783 │         } else {
784 ▶           this.reportError(`"let-" is only supported on ng-template elements.`, srcSpan);
785 │         }
786 ▶       } else if (bindParts[KW_REF_IDX]) {
787 │         const identifier = bindParts[IDENT_KW_IDX];
788 │         const keySpan = createKeySpan(srcSpan, bindParts[KW_REF_IDX], identifier);
789 ▶         this.parseReference(identifier, value, srcSpan, keySpan, attribute.valueSpan, references);
790 ▶       } else if (bindParts[KW_ON_IDX]) {
791 │         // 3p-only-start
792 │         const events: ParsedEvent[] = [];
793 │         const identifier = bindParts[IDENT_KW_IDX];
794 │         const keySpan = createKeySpan(srcSpan, bindParts[KW_ON_IDX], identifier);
795 ▶         this.bindingParser.parseEvent(
796 │           identifier,
797 │           value,
798 ▶           /* isAssignmentEvent */ false,
799 │           srcSpan,
800 │           attribute.valueSpan || srcSpan,
801 │           matchableAttributes,
802 │           events,
803 │           keySpan,
804 │         );
805 ▶         addEvents(events, boundEvents);
806 │         // 3p-only-end
```

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L807–848 （▶ の行: 807, 811, 815, 823, 834, 836, 847）

```ts
807 ▶       } else if (bindParts[KW_BINDON_IDX]) {
808 │         // 3p-only-start
809 │         const identifier = bindParts[IDENT_KW_IDX];
810 │         const keySpan = createKeySpan(srcSpan, bindParts[KW_BINDON_IDX], identifier);
811 ▶         this.bindingParser.parsePropertyBinding(
812 │           identifier,
813 │           value,
814 │           false,
815 ▶           true,
816 │           srcSpan,
817 │           absoluteOffset,
818 │           attribute.valueSpan,
819 │           matchableAttributes,
820 │           parsedProperties,
821 │           keySpan,
822 │         );
823 ▶         this.parseAssignmentEvent(
824 │           identifier,
825 │           value,
826 │           srcSpan,
827 │           attribute.valueSpan,
828 │           matchableAttributes,
829 │           boundEvents,
830 │           keySpan,
831 │           absoluteOffset,
832 │         );
833 │         // 3p-only-end
834 ▶       } else if (bindParts[KW_AT_IDX]) {
835 │         const keySpan = createKeySpan(srcSpan, '', name);
836 ▶         this.bindingParser.parseLiteralAttr(
837 │           name,
838 │           value,
839 │           srcSpan,
840 │           absoluteOffset,
841 │           attribute.valueSpan,
842 │           matchableAttributes,
843 │           parsedProperties,
844 │           keySpan,
845 │         );
846 │       }
847 ▶       return true;
848 │     }
```

1. **758 行目：名前を正規表現にかける**

   当たれば 760〜848 行目の枝のどれかに入り、847 行目で必ず `true`（＝バインディングだった）を返します。
2. **761〜776 行目：`bind-x` は `[x]` と同じ**

   765 行目の `parsePropertyBinding` に、768 行目 `isHost = false`、769 行目 `isPartOfAssignmentBinding = false` で渡します。
3. **778〜785 行目：`let-x` は `<ng-template>` の上だけ**

   779 行目で `<ng-template>` なら 782 行目で変数に、それ以外の要素では 784 行目のエラーです。
4. **786〜789 行目：`#x` / `ref-x` は参照**

   式のパーサは呼びません。値（`#f="ngForm"` の `ngForm`）は文字列のまま `Reference` に入ります。
5. **790〜805 行目：`on-x` は `(x)` と同じ**

   795 行目の `parseEvent` に、798 行目 `isAssignmentEvent = false` で渡します。
6. **807〜833 行目：`bindon-x` は `[(x)]` と同じ**

   811 行目で `isPartOfAssignmentBinding = true`（815 行目）の property と、823 行目の `parseAssignmentEvent` の 2 つに分けます。
7. **834〜846 行目：`@trigger` は旧アニメーションのトリガー**

   836 行目の `parseLiteralAttr` が、名前の `@` を見て旧アニメーション用の property にします。

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L850–870 （▶ の行: 853–855, 857, 866–867, 869）

```ts
850 │     // We didn't see a kw-prefixed property binding, but we have not yet checked
851 │     // for the []/()/[()] syntax.
852 │     let delims: {start: string; end: string} | null = null;
853 ▶     if (name.startsWith(BINDING_DELIMS.BANANA_BOX.start)) {
854 ▶       delims = BINDING_DELIMS.BANANA_BOX;
855 ▶     } else if (name.startsWith(BINDING_DELIMS.PROPERTY.start)) {
856 │       delims = BINDING_DELIMS.PROPERTY;
857 ▶     } else if (name.startsWith(BINDING_DELIMS.EVENT.start)) {
858 │       delims = BINDING_DELIMS.EVENT;
859 │     }
860 │     if (
861 │       delims !== null &&
862 │       // NOTE: older versions of the parser would match a start/end delimited
863 │       // binding iff the property name was terminated by the ending delimiter
864 │       // and the identifier in the binding was non-empty.
865 │       // TODO(ayazhafiz): update this to handle malformed bindings.
866 ▶       name.endsWith(delims.end) &&
867 ▶       name.length > delims.start.length + delims.end.length
868 │     ) {
869 ▶       const identifier = name.substring(delims.start.length, name.length - delims.end.length);
870 │       const keySpan = createKeySpan(srcSpan, delims.start, identifier);
```

接頭辞が無ければ括弧を見ます。853 行目で **`[(` を先に**調べるのは、`[(x)]` が `[` でも始まっているからです。866〜867 行目、閉じ括弧で終わり、中身が空でないときだけバインディングとみなし、869 行目で括弧の内側を名前として取り出します。`[(x)]` の枝（871〜893 行目）は [model() と output() の章](../signals/13-signals-model-output.md)で読んだので、ここでは残りの 2 つを読みます。

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L894–923 （▶ の行: 894–895, 898–899, 907, 909, 912, 919, 922）

```ts
894 ▶       } else if (delims.start === BINDING_DELIMS.PROPERTY.start) {
895 ▶         this.bindingParser.parsePropertyBinding(
896 │           identifier,
897 │           value,
898 ▶           false,
899 ▶           false,
900 │           srcSpan,
901 │           absoluteOffset,
902 │           attribute.valueSpan,
903 │           matchableAttributes,
904 │           parsedProperties,
905 │           keySpan,
906 │         );
907 ▶       } else {
908 │         const events: ParsedEvent[] = [];
909 ▶         this.bindingParser.parseEvent(
910 │           identifier,
911 │           value,
912 ▶           /* isAssignmentEvent */ false,
913 │           srcSpan,
914 │           attribute.valueSpan || srcSpan,
915 │           matchableAttributes,
916 │           events,
917 │           keySpan,
918 │         );
919 ▶         addEvents(events, boundEvents);
920 │       }
921 │ 
922 ▶       return true;
923 │     }
```

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L925–938 （▶ の行: 925, 927, 935, 937）

```ts
925 ▶     // No explicit binding found.
926 │     const keySpan = createKeySpan(srcSpan, '' /* prefix */, name);
927 ▶     const hasBinding = this.bindingParser.parsePropertyInterpolation(
928 │       name,
929 │       value,
930 │       srcSpan,
931 │       attribute.valueSpan,
932 │       matchableAttributes,
933 │       parsedProperties,
934 │       keySpan,
935 ▶       attribute.valueTokens ?? null,
936 │     );
937 ▶     return hasBinding;
938 │   }
```

`[x]` は 895 行目の `parsePropertyBinding`、`(x)` は 909 行目の `parseEvent` です。`[attr.aria-label]` も `[class.on]` も、この時点では**ただの `[x]`**で、`x` が `attr.aria-label` という名前なだけです。どの括弧も無ければ 927 行目の `parsePropertyInterpolation` で値に `{{ }}` があるかを調べ、あればバインディング、無ければ 937 行目で `false`（静的な属性）になります。

| 書き方 | 通る行（r3\_template\_transform.ts） | 呼ぶ BindingParser のメソッド |
| --- | --- | --- |
| `[x]="e"` / `bind-x="e"` | 894〜906 / 761〜776 | `parsePropertyBinding` |
| `(x)="s"` / `on-x="s"` | 907〜920 / 790〜805 | `parseEvent` |
| `[(x)]="v"` / `bindon-x="v"` | 871〜893 / 807〜833 | `parsePropertyBinding`（two-way）+ `parseEvent`（`xChange`） |
| `x="a{{e}}"` | 925〜937 | `parsePropertyInterpolation` |
| `x="a"` | 925〜937（`false` が返る） | —（`TextAttribute` になる） |
| `#r` / `ref-r` | 786〜789 | —（`parseReference`） |
| `let-v="k"` | 778〜785 | —（`parseVariable`） |
| `*dir="…"` | 5 節（prepareAttributes 666〜701） | `parseInlineTemplateBinding` |

## 2. parsePropertyBinding：右辺を式にして ParsedProperty を作る

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L348–363 （▶ の行: 348, 351–352, 360–361）

```ts
348 ▶   parsePropertyBinding(
349 │     name: string,
350 │     expression: string,
351 ▶     isHost: boolean,
352 ▶     isPartOfAssignmentBinding: boolean,
353 │     sourceSpan: ParseSourceSpan,
354 │     absoluteOffset: number,
355 │     valueSpan: ParseSourceSpan | undefined,
356 │     targetMatchableAttrs: string[][],
357 │     targetProps: ParsedProperty[],
358 │     keySpan: ParseSourceSpan,
359 │   ) {
360 ▶     if (name.length === 0) {
361 ▶       this._reportError(`Property name is missing in binding`, sourceSpan);
362 │     }
363 │ 
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L388–421 （▶ の行: 388–389, 399–400, 402, 409–410, 412–413）

```ts
388 ▶     if (isLegacyAnimationProp) {
389 ▶       this._parseLegacyAnimation(
390 │         name,
391 │         expression,
392 │         sourceSpan,
393 │         absoluteOffset,
394 │         keySpan,
395 │         valueSpan,
396 │         targetMatchableAttrs,
397 │         targetProps,
398 │       );
399 ▶     } else if (name.startsWith(`${ANIMATE_PREFIX}${PROPERTY_PARTS_SEPARATOR}`)) {
400 ▶       this._parseAnimation(
401 │         name,
402 ▶         this.parseBinding(expression, isHost, valueSpan || sourceSpan, absoluteOffset),
403 │         sourceSpan,
404 │         keySpan,
405 │         valueSpan,
406 │         targetMatchableAttrs,
407 │         targetProps,
408 │       );
409 ▶     } else {
410 ▶       this._parsePropertyAst(
411 │         name,
412 ▶         this.parseBinding(expression, isHost, valueSpan || sourceSpan, absoluteOffset),
413 ▶         isPartOfAssignmentBinding,
414 │         sourceSpan,
415 │         keySpan,
416 │         valueSpan,
417 │         targetMatchableAttrs,
418 │         targetProps,
419 │       );
420 │     }
421 │   }
```

360〜361 行目で名前が空なら（`[]="x"`）エラー。引用を省いた間の行は旧アニメーション（`animate-` / `@`）の接頭辞を外す処理で、388 行目でそちらに分かれます。399 行目、`animate.` で始まる名前（`[animate.enter]`）は新しいアニメーション用の `_parseAnimation`。それ以外は 410 行目の `_parsePropertyAst` に、**412 行目の `parseBinding` で右辺を式にしてから**渡します。

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L524–542 （▶ の行: 531–533, 535, 538–540）

```ts
524 │   parseBinding(
525 │     value: string,
526 │     isHostBinding: boolean,
527 │     sourceSpan: ParseSourceSpan,
528 │     absoluteOffset: number,
529 │   ): ASTWithSource {
530 │     try {
531 ▶       const ast = isHostBinding
532 ▶         ? this._exprParser.parseSimpleBinding(value, sourceSpan, absoluteOffset)
533 ▶         : this._exprParser.parseBinding(value, sourceSpan, absoluteOffset);
534 │       if (ast) {
535 ▶         this.errors.push(...ast.errors);
536 │       }
537 │       return ast;
538 ▶     } catch (e) {
539 ▶       this._reportError(`${e}`, sourceSpan);
540 ▶       return this._exprParser.wrapLiteralPrimitive('ERROR', sourceSpan, absoluteOffset);
541 │     }
542 │   }
```

531〜533 行目、host バインディングなら `parseSimpleBinding`、テンプレートなら `parseBinding`（どちらも[前章](05-compiler-expression-parser.md)の `ParseFlags.None` の入口）。535 行目で式のエラーを `BindingParser.errors` に移します。この配列が、テンプレート全体のエラーにまとめられる配列です。

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L423–448 （▶ の行: 433–435, 438, 445, 447）

```ts
423 │   parsePropertyInterpolation(
424 │     name: string,
425 │     value: string,
426 │     sourceSpan: ParseSourceSpan,
427 │     valueSpan: ParseSourceSpan | undefined,
428 │     targetMatchableAttrs: string[][],
429 │     targetProps: ParsedProperty[],
430 │     keySpan: ParseSourceSpan,
431 │     interpolatedTokens: InterpolatedAttributeToken[] | InterpolatedTextToken[] | null,
432 │   ): boolean {
433 ▶     const expr = this.parseInterpolation(value, valueSpan || sourceSpan, interpolatedTokens);
434 ▶     if (expr) {
435 ▶       this._parsePropertyAst(
436 │         name,
437 │         expr,
438 ▶         false,
439 │         sourceSpan,
440 │         keySpan,
441 │         valueSpan,
442 │         targetMatchableAttrs,
443 │         targetProps,
444 │       );
445 ▶       return true;
446 │     }
447 ▶     return false;
448 │   }
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L450–471 （▶ の行: 460–465）

```ts
450 │   private _parsePropertyAst(
451 │     name: string,
452 │     ast: ASTWithSource,
453 │     isPartOfAssignmentBinding: boolean,
454 │     sourceSpan: ParseSourceSpan,
455 │     keySpan: ParseSourceSpan,
456 │     valueSpan: ParseSourceSpan | undefined,
457 │     targetMatchableAttrs: string[][],
458 │     targetProps: ParsedProperty[],
459 │   ) {
460 ▶     targetMatchableAttrs.push([name, ast.source!]);
461 ▶     targetProps.push(
462 ▶       new ParsedProperty(
463 ▶         name,
464 ▶         ast,
465 ▶         isPartOfAssignmentBinding ? ParsedPropertyType.TWO_WAY : ParsedPropertyType.DEFAULT,
466 │         sourceSpan,
467 │         keySpan,
468 │         valueSpan,
469 │       ),
470 │     );
471 │   }
```

`title="a{{b}}"` は 433 行目で補間として読み、式が取れたら 435 行目で `[title]` と同じ `_parsePropertyAst` へ。取れなければ 447 行目で `false` です。`_parsePropertyAst` は 460 行目で「名前と式の文字列」の組をディレクティブ照合用に覚え、461〜470 行目で `ParsedProperty` を作ります。465 行目、`[(x)]` 由来なら `TWO_WAY`、それ以外は `DEFAULT`。**463 行目の `name` はまだ `attr.aria-label` のまま**です。

📄 `angular/packages/compiler/src/expression_parser/ast.ts` L839–875 （▶ の行: 839, 845–847, 852–854, 858–863, 866, 868, 870, 872, 874）

```ts
839 ▶ export class ParsedProperty {
840 │   public readonly isLiteral: boolean;
841 │   public readonly isLegacyAnimation: boolean;
842 │   public readonly isAnimation: boolean;
843 │ 
844 │   constructor(
845 ▶     public name: string,
846 ▶     public expression: ASTWithSource,
847 ▶     public type: ParsedPropertyType,
848 │     public sourceSpan: ParseSourceSpan,
849 │     readonly keySpan: ParseSourceSpan,
850 │     public valueSpan: ParseSourceSpan | undefined,
851 │   ) {
852 ▶     this.isLiteral = this.type === ParsedPropertyType.LITERAL_ATTR;
853 ▶     this.isLegacyAnimation = this.type === ParsedPropertyType.LEGACY_ANIMATION;
854 ▶     this.isAnimation = this.type === ParsedPropertyType.ANIMATION;
855 │   }
856 │ }
857 │ 
858 ▶ export enum ParsedPropertyType {
859 ▶   DEFAULT,
860 ▶   LITERAL_ATTR,
861 ▶   LEGACY_ANIMATION,
862 ▶   TWO_WAY,
863 ▶   ANIMATION,
864 │ }
865 │ 
866 ▶ export enum ParsedEventType {
867 │   // DOM or Directive event
868 ▶   Regular,
869 │   // Legacy animation specific event
870 ▶   LegacyAnimation,
871 │   // Event side of a two-way binding (e.g. `[(property)]="expression"`).
872 ▶   TwoWay,
873 │   // Animation specific event
874 ▶   Animation,
875 │ }
```

`ParsedProperty` の `type` は 858〜864 行目の 5 種類、`ParsedEvent` の `type` は 866〜875 行目の 4 種類です。852 行目の `isLiteral` は `LITERAL_ATTR`（`*ngFor` の `ngFor` のように値の無いもの。5 節）のときだけ真になります。

## 3. createBoundElementProperty：名前の先頭で BindingType を決める

`ParsedProperty` を R3 AST の `BoundAttribute` に変えるのは、要素を組み立てるときに呼ばれる `categorizePropertyAttributes` です（呼ばれる位置は[次章](07-compiler-r3-ast.md)）。

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L604–641 （▶ の行: 614–615, 626–630, 633–634, 636）

```ts
604 │   private categorizePropertyAttributes(
605 │     elementName: string | null,
606 │     properties: ParsedProperty[],
607 │     i18nPropsMeta: {[key: string]: i18n.I18nMeta},
608 │   ): {bound: t.BoundAttribute[]; literal: t.TextAttribute[]} {
609 │     const bound: t.BoundAttribute[] = [];
610 │     const literal: t.TextAttribute[] = [];
611 │ 
612 │     properties.forEach((prop) => {
613 │       const i18n = i18nPropsMeta[prop.name];
614 ▶       if (prop.isLiteral) {
615 ▶         literal.push(
616 │           new t.TextAttribute(
617 │             prop.name,
618 │             prop.expression.source || '',
619 │             prop.sourceSpan,
620 │             prop.keySpan,
621 │             prop.valueSpan,
622 │             i18n,
623 │           ),
624 │         );
625 │       } else {
626 ▶         // Note that validation is skipped and property mapping is disabled
627 ▶         // due to the fact that we need to make sure a given prop is not an
628 ▶         // input of a directive and directive matching happens at runtime.
629 ▶         const isAttrOn = prop.name.toLowerCase().startsWith('attr.on');
630 ▶         const bep = this.bindingParser.createBoundElementProperty(
631 │           elementName,
632 │           prop,
633 ▶           /* skipValidation */ !isAttrOn,
634 ▶           /* mapPropertyName */ false,
635 │         );
636 ▶         bound.push(t.BoundAttribute.fromBoundElementProperty(bep, i18n));
637 │       }
638 │     });
639 │ 
640 │     return {bound, literal};
641 │   }
```

614 行目、`isLiteral` なら `TextAttribute`。それ以外は 630 行目で `createBoundElementProperty` を呼びます。633 行目の `skipValidation` は `attr.on…` 以外すべて `true`、634 行目の `mapPropertyName` は `false` です。626〜628 行目のコメントのとおり、**その名前がディレクティブの input かもしれないので、ここでは DOM のプロパティとしての検査をしません**。`[foo]="x"` が知らないプロパティでもこの段階でエラーにならないのはこのためで、検査は[型検査](17-compiler-typecheck.md)側で行われます。

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L563–590 （▶ の行: 566, 570–572, 576, 580, 583, 587, 590）

```ts
563 │     let unit: string | null = null;
564 │     let bindingType: BindingType = undefined!;
565 │     let boundPropertyName: string | null = null;
566 ▶     const parts = boundProp.name.split(PROPERTY_PARTS_SEPARATOR);
567 │     let securityContexts: SecurityContext[] = undefined!;
568 │ 
569 │     // Check for special cases (prefix style, attr, class)
570 ▶     if (parts.length > 1) {
571 ▶       if (parts[0] == ATTRIBUTE_PREFIX) {
572 ▶         boundPropertyName = parts.slice(1).join(PROPERTY_PARTS_SEPARATOR);
573 │         if (!skipValidation) {
574 │           this._validatePropertyOrAttributeName(boundPropertyName, boundProp.sourceSpan, true);
575 │         }
576 ▶         securityContexts = calcPossibleSecurityContexts(
577 │           this._schemaRegistry,
578 │           elementSelector,
579 │           boundPropertyName,
580 ▶           true,
581 │         );
582 │ 
583 ▶         const nsSeparatorIdx = boundPropertyName.indexOf(':');
584 │         if (nsSeparatorIdx > -1) {
585 │           const ns = boundPropertyName.substring(0, nsSeparatorIdx);
586 │           const name = boundPropertyName.substring(nsSeparatorIdx + 1);
587 ▶           boundPropertyName = mergeNsAndName(ns, name);
588 │         }
589 │ 
590 ▶         bindingType = BindingType.Attribute;
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L591–614 （▶ の行: 591–598, 602, 607–612）

```ts
591 ▶       } else if (parts[0] == CLASS_PREFIX) {
592 ▶         boundPropertyName = parts[1];
593 ▶         bindingType = BindingType.Class;
594 ▶         securityContexts = [SecurityContext.NONE];
595 ▶       } else if (parts[0] == STYLE_PREFIX) {
596 ▶         unit = parts.length > 2 ? parts[2] : null;
597 ▶         const boundName = parts[1];
598 ▶         if (!boundName.startsWith('--')) {
599 │           boundPropertyName = boundName;
600 │         } else {
601 │           try {
602 ▶             boundPropertyName = namespaceCssVariable(boundName);
603 │           } catch (e) {
604 │             this._reportError((e as Error).message, boundProp.sourceSpan);
605 │           }
606 │         }
607 ▶         bindingType = BindingType.Style;
608 ▶         securityContexts = [SecurityContext.STYLE];
609 ▶       } else if (parts[0] == ANIMATE_PREFIX) {
610 ▶         boundPropertyName = boundProp.name;
611 ▶         bindingType = BindingType.Animation;
612 ▶         securityContexts = [SecurityContext.NONE];
613 │       }
614 │     }
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L616–643 （▶ の行: 617–620, 623, 626–627, 633, 636）

```ts
616 │     // If not a special case, use the full property name
617 ▶     if (boundPropertyName === null) {
618 ▶       const mappedPropName = this._schemaRegistry.getMappedPropName(boundProp.name);
619 ▶       boundPropertyName = mapPropertyName ? mappedPropName : boundProp.name;
620 ▶       securityContexts = calcPossibleSecurityContexts(
621 │         this._schemaRegistry,
622 │         elementSelector,
623 ▶         mappedPropName,
624 │         false,
625 │       );
626 ▶       bindingType =
627 ▶         boundProp.type === ParsedPropertyType.TWO_WAY ? BindingType.TwoWay : BindingType.Property;
628 │       if (!skipValidation) {
629 │         this._validatePropertyOrAttributeName(mappedPropName, boundProp.sourceSpan, false);
630 │       }
631 │     }
632 │ 
633 ▶     return new BoundElementProperty(
634 │       boundPropertyName,
635 │       bindingType,
636 ▶       securityContexts[0],
637 │       boundProp.expression,
638 │       unit,
639 │       boundProp.sourceSpan,
640 │       boundProp.keySpan,
641 │       boundProp.valueSpan,
642 │     );
643 │   }
```

1. **566 行目：名前を `.` で切る**

   `attr.aria-label` → `['attr', 'aria-label']`、`style.width.px` → `['style', 'width', 'px']`。
2. **571〜590 行目：`attr.` なら Attribute**

   572 行目で残りを名前にし（`aria-label`）、580 行目の `true`（属性として）でセキュリティを調べます。583〜588 行目は `attr.xlink:href` のような名前空間付きの名前を `:xlink:href` の形に直します。
3. **591〜594 行目：`class.` なら Class、セキュリティは NONE**

   名前は 592 行目の `parts[1]` だけです。クラス名の付け外しは安全なので 594 行目で `NONE` に決め打ちです。
4. **595〜608 行目：`style.` なら Style、3 つ目は単位**

   596 行目、`style.width.px` の `px` が `unit` になります。598〜606 行目は `--` で始まる CSS 変数の扱い、608 行目でセキュリティは `STYLE`。
5. **609〜612 行目：`animate.` なら Animation**

   名前は 610 行目でそのまま残します。
6. **617〜631 行目：それ以外は Property（two-way なら TwoWay）**

   618 行目で `tabindex` → `tabIndex` のような属性名 → プロパティ名の対応表を引き、620〜625 行目のセキュリティ判定には対応後の名前を使います。ただし 619 行目、テンプレートから来たときは 634 行目の `false` により、`BoundAttribute.name` は書いたままの名前です。626〜627 行目、`[ngClass]` も `[innerHTML]` もここに来るので `BindingType.Property` です。
7. **633〜642 行目：`BoundElementProperty` を作る**

   636 行目、セキュリティコンテキストは候補の配列の先頭 1 つだけを使います（4 節）。

📄 `angular/packages/compiler/src/expression_parser/ast.ts` L924–952 （▶ の行: 924, 926, 928, 930, 932, 934, 936, 938, 943–945, 947）

```ts
924 ▶ export enum BindingType {
925 │   // A regular binding to a property (e.g. `[property]="expression"`).
926 ▶   Property,
927 │   // A binding to an element attribute (e.g. `[attr.name]="expression"`).
928 ▶   Attribute,
929 │   // A binding to a CSS class (e.g. `[class.name]="condition"`).
930 ▶   Class,
931 │   // A binding to a style rule (e.g. `[style.rule]="expression"`).
932 ▶   Style,
933 │   // A binding to a legacy animation reference (e.g. `[animate.key]="expression"`).
934 ▶   LegacyAnimation,
935 │   // Property side of a two-way binding (e.g. `[(property)]="expression"`).
936 ▶   TwoWay,
937 │   // A binding to an animation CSS class or function (e.g. `[animate.leave]="expression"`).
938 ▶   Animation,
939 │ }
940 │ 
941 │ export class BoundElementProperty {
942 │   constructor(
943 ▶     public name: string,
944 ▶     public type: BindingType,
945 ▶     public securityContext: SecurityContext,
946 │     public value: ASTWithSource,
947 ▶     public unit: string | null,
948 │     public sourceSpan: ParseSourceSpan,
949 │     readonly keySpan: ParseSourceSpan | undefined,
950 │     public valueSpan: ParseSourceSpan | undefined,
951 │   ) {}
952 │ }
```

`BindingType` は 924〜939 行目の 7 種類で、`BoundElementProperty`（941〜952 行目）の `type` に入ります。この値は後段でそのまま命令の選び分けに使われます。

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L1489–1498 （▶ の行: 1490–1491, 1493–1495）

```ts
1489 │ // TODO: Can we populate Template binding kinds in ingest?
1490 ▶ const BINDING_KINDS = new Map<e.BindingType, ir.BindingKind>([
1491 ▶   [e.BindingType.Property, ir.BindingKind.Property],
1492 │   [e.BindingType.TwoWay, ir.BindingKind.TwoWayProperty],
1493 ▶   [e.BindingType.Attribute, ir.BindingKind.Attribute],
1494 ▶   [e.BindingType.Class, ir.BindingKind.ClassName],
1495 ▶   [e.BindingType.Style, ir.BindingKind.StyleProperty],
1496 │   [e.BindingType.LegacyAnimation, ir.BindingKind.LegacyAnimation],
1497 │   [e.BindingType.Animation, ir.BindingKind.Animation],
1498 │ ]);
```

[IR への写像](10-compiler-ingest.md)の `ingest.ts` は、1490〜1498 行目の表で `BindingType` を IR の `BindingKind` に置き換えます。`Attribute` → `ɵɵattribute`、`Class` → `ɵɵclassProp`、`Style` → `ɵɵstyleProp` のような命令の違いは、ここで決まった種類から生まれます。

| 書き方 | ParsedProperty（name / type） | BoundAttribute（name / type / securityContext） |
| --- | --- | --- |
| `[title]="t"` | `title` / DEFAULT | `title` / Property / NONE |
| `[attr.aria-label]="x"` | `attr.aria-label` / DEFAULT | `aria-label` / Attribute / NONE |
| `[class.on]="b"` | `class.on` / DEFAULT | `on` / Class / NONE |
| `[style.width.px]="w"` | `style.width.px` / DEFAULT | `width`（unit `px`）/ Style / STYLE |
| `[ngClass]="k"` | `ngClass` / DEFAULT | `ngClass` / Property / NONE |
| `[(value)]="v"` | `value` / TWO\_WAY | `value` / TwoWay / NONE |
| `[animate.enter]="a"` | `animate.enter` / ANIMATION | `animate.enter` / Animation / NONE |
| `[innerHTML]="h"` | `innerHTML` / DEFAULT | `innerHTML` / Property / HTML |
| `<a [href]="u">` | `href` / DEFAULT | `href` / Property / URL |
| `title="a{{b}}"` | `title` / DEFAULT（式は Interpolation） | `title` / Property / NONE |

## 4. セキュリティコンテキストの決め方

セキュリティコンテキストとは「この値をこの場所に入れるとき、実行時にどの種類の無害化（サニタイズ）を通すか」の印です。実行時のサニタイズそのものは[サニタイズの章](../template/07-sanitize.md)で読みます。ここでは**コンパイラが印を決める行**を読みます。

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L884–914 （▶ の行: 884, 891–892, 896, 899–901, 904–906, 909–910）

```ts
884 ▶ export function calcPossibleSecurityContexts(
885 │   registry: ElementSchemaRegistry,
886 │   selector: string | null,
887 │   propName: string,
888 │   isAttribute: boolean,
889 │ ): SecurityContext[] {
890 │   let ctxs: SecurityContext[];
891 ▶   const [namespaceKey, baseSelector] = selector ? splitNsName(selector, false) : [null, selector];
892 ▶   const nameToContext = (elName: string) => {
893 │     const [nsStr, name] = splitNsName(elName, false);
894 │     const ns = nsStr ?? namespaceKey;
895 │     const fullName = ns ? `:${ns}:${name}` : name;
896 ▶     return registry.securityContext(fullName, propName, isAttribute);
897 │   };
898 │ 
899 ▶   const allKnownElements = registry.allKnownElementNames();
900 ▶   if (baseSelector === null) {
901 ▶     ctxs = allKnownElements.map(nameToContext);
902 │   } else {
903 │     ctxs = [];
904 ▶     CssSelector.parse(baseSelector).forEach((selector) => {
905 ▶       let elementNames = selector.element ? [selector.element] : allKnownElements;
906 ▶       if (selector.element && !registry.hasElement(selector.element, [])) {
907 │         const svgElement = `:${SVG_NAMESPACE}:${selector.element}`;
908 │         const mathElement = `:${MATH_ML_NAMESPACE}:${selector.element}`;
909 ▶         if (registry.hasElement(svgElement, [])) {
910 ▶           elementNames = [svgElement];
911 │         } else if (registry.hasElement(mathElement, [])) {
912 │           elementNames = [mathElement];
913 │         }
914 │       }
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L915–932 （▶ の行: 915, 920, 928, 931）

```ts
915 ▶       const notElementNames = new Set(
916 │         selector.notSelectors
917 │           .filter((selector) => selector.isElementSelector())
918 │           .map((selector) => selector.element?.toLowerCase()),
919 │       );
920 ▶       const possibleElementNames = elementNames.filter((elName) => {
921 │         const elNameLowerCase = elName.toLowerCase();
922 │         return (
923 │           !notElementNames.has(elNameLowerCase) &&
924 │           !notElementNames.has(splitNsName(elNameLowerCase)[1])
925 │         );
926 │       });
927 │ 
928 ▶       ctxs.push(...possibleElementNames.map(nameToContext));
929 │     });
930 │   }
931 ▶   return ctxs.length === 0 ? [SecurityContext.NONE] : Array.from(new Set(ctxs)).sort();
932 │ }
```

1. **904〜905 行目：セレクタから要素名を取る**

   テンプレートでは `elementSelector` に要素名（`a` など）が入るので、候補は 1 つです。要素名の無いセレクタ（ホストバインディングの `[foo]` など）なら、899 行目の「知っている全要素」が候補になります。
2. **906〜913 行目：HTML に無い名前なら SVG・MathML の要素として探す**

   `<a>` は HTML にあるので HTML として、`<circle>` なら SVG として調べます。
3. **915〜926 行目：`:not(...)` で除かれた要素を外す**
4. **928 / 896 行目：要素ごとに `registry.securityContext` を引く**
5. **931 行目：重複を除いて並べる。1 つも無ければ `[NONE]`**

   テンプレートの要素では、3 節 636 行目がこの配列の先頭を使います。

📄 `angular/packages/compiler/src/schema/dom_element_schema_registry.ts` L446–462 （▶ の行: 446, 451, 453, 457, 461）

```ts
446 ▶   override securityContext(
447 │     tagName: string,
448 │     propName: string,
449 │     isAttribute: boolean,
450 │   ): SecurityContext {
451 ▶     if (isAttribute) {
452 │       // NB: For security purposes, use the mapped property name, not the attribute name.
453 ▶       propName = this.getMappedPropName(propName);
454 │     }
455 │ 
456 │     const [ns, name] = splitNsName(tagName, false);
457 ▶     return checkSecurityContext(name, propName, ns);
458 │   }
459 │ 
460 │   override getMappedPropName(propName: string): string {
461 ▶     return _ATTR_TO_PROP.get(propName) ?? propName;
462 │   }
```

📄 `angular/packages/compiler/src/schema/dom_security_schema.ts` L78–108 （▶ の行: 78–80, 82, 84, 86–88, 91, 101–102, 105, 107）

```ts
 78 ▶   registerContext(SecurityContext.HTML, /** Namespace */ undefined, [
 79 ▶     ['iframe', ['srcdoc']],
 80 ▶     ['*', ['innerHTML', 'outerHTML']],
 81 │   ]);
 82 ▶   registerContext(SecurityContext.STYLE, /** Namespace */ undefined, [['*', ['style']]]);
 83 │   // NB: no SCRIPT contexts here, they are never allowed due to the parser stripping them.
 84 ▶   registerContext(SecurityContext.URL, /** Namespace */ undefined, [
 85 │     ['*', ['formAction']],
 86 ▶     ['area', ['href']],
 87 ▶     ['a', ['href', 'xlink:href']],
 88 ▶     ['form', ['action']],
 89 │ 
 90 │     // The below two items are safe and should be removed but they require a G3 clean-up as a small number of tests fail.
 91 ▶     ['img', ['src']],
 92 │     ['video', ['src']],
 93 │   ]);
 94 │ 
 95 │   registerContext(SecurityContext.URL, MATH_ML_NAMESPACE, [
 96 │     // MathML namespace
 97 │     // https://crsrc.org/c/third_party/blink/renderer/core/sanitizer/sanitizer.cc;l=753-768;drc=b3eb16372dcd3317d65e9e0265015e322494edcd;bpv=1;bpt=1
 98 │     ['*', ['href', 'xlink:href']],
 99 │   ]);
100 │ 
101 ▶   registerContext(SecurityContext.RESOURCE_URL, /** Namespace */ undefined, [
102 ▶     ['base', ['href']],
103 │     ['embed', ['src']],
104 │     ['frame', ['src']],
105 ▶     ['iframe', ['src']],
106 │     ['link', ['href']],
107 ▶     ['object', ['codebase', 'data']],
108 │   ]);
```

📄 `angular/packages/compiler/src/schema/dom_security_schema.ts` L185–211 （▶ の行: 190–193, 196, 207, 209）

```ts
185 │ export function checkSecurityContext(
186 │   tagName: string,
187 │   propName: string,
188 │   namespace?: string | null,
189 │ ): SecurityContext {
190 ▶   const securitySchema = SECURITY_SCHEMA();
191 ▶   const attrSchema = securitySchema[propName.toLowerCase()];
192 ▶   if (!attrSchema) {
193 ▶     return SecurityContext.NONE;
194 │   }
195 │ 
196 ▶   const tagLower = tagName.toLowerCase();
197 │   let context: SecurityContext | undefined;
198 │ 
199 │   if (namespace) {
200 │     const nsSchema = attrSchema[namespace];
201 │     if (nsSchema) {
202 │       context = nsSchema[tagLower] ?? nsSchema[MATCH_ALL_ELEMENTS];
203 │     }
204 │   }
205 │ 
206 │   if (context === undefined) {
207 ▶     const defaultSchema = attrSchema[NO_NAMESPACE];
208 │     if (defaultSchema) {
209 ▶       context = defaultSchema[tagLower] ?? defaultSchema[MATCH_ALL_ELEMENTS];
210 │     }
211 │   }
```

表は「危ない組み合わせだけを列挙した許可表」です。78〜81 行目、`iframe` の `srcdoc` とすべての要素（`*`）の `innerHTML` / `outerHTML` が HTML。82 行目、すべての要素の `style` が STYLE。84〜93 行目の `a` の `href` などが URL、101〜108 行目の `iframe` の `src` などが RESOURCE\_URL です。検索は 191 行目で**プロパティ名から**引き、192〜193 行目で表に無ければ NONE。あれば 209 行目で要素名、無ければ `*` の順に探します。451〜453 行目、属性として調べるときも対応表でプロパティ名に直してから引くので、`[attr.innerHtml]` のような書き方でも同じ印になります（453 行目のコメント）。

## 5. parseEvent：(x)・(window:x)・(keydown.enter)

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L655–687 （▶ の行: 655–656, 659, 667, 676）

```ts
655 ▶     if (name.length === 0) {
656 ▶       this._reportError(`Event name is missing in binding`, sourceSpan);
657 │     }
658 │ 
659 ▶     if (isLegacyAnimationLabel(name)) {
660 │       name = name.slice(1);
661 │       if (keySpan !== undefined) {
662 │         keySpan = moveParseSourceSpan(
663 │           keySpan,
664 │           new AbsoluteSourceSpan(keySpan.start.offset + 1, keySpan.end.offset),
665 │         );
666 │       }
667 ▶       this._parseLegacyAnimationEvent(
668 │         name,
669 │         expression,
670 │         sourceSpan,
671 │         handlerSpan,
672 │         targetEvents,
673 │         keySpan,
674 │       );
675 │     } else {
676 ▶       this._parseRegularEvent(
677 │         name,
678 │         expression,
679 │         isAssignmentEvent,
680 │         sourceSpan,
681 │         handlerSpan,
682 │         targetMatchableAttrs,
683 │         targetEvents,
684 │         keySpan,
685 │       );
686 │     }
687 │   }
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L748–784 （▶ の行: 759, 761, 763, 767–768, 771–773, 775–776, 780）

```ts
748 │   private _parseRegularEvent(
749 │     name: string,
750 │     expression: string,
751 │     isAssignmentEvent: boolean,
752 │     sourceSpan: ParseSourceSpan,
753 │     handlerSpan: ParseSourceSpan,
754 │     targetMatchableAttrs: string[][],
755 │     targetEvents: ParsedEvent[],
756 │     keySpan: ParseSourceSpan,
757 │   ): void {
758 │     // long format: 'target: eventName'
759 ▶     const {eventName, target} = this.parseEventListenerName(name);
760 │     const prevErrorCount = this.errors.length;
761 ▶     const ast = this._parseAction(expression, handlerSpan);
762 │     const isValid = this.errors.length === prevErrorCount;
763 ▶     targetMatchableAttrs.push([name!, ast.source!]);
764 │ 
765 │     // Don't try to validate assignment events if there were other
766 │     // parsing errors to avoid adding more noise to the error logs.
767 ▶     if (isAssignmentEvent && isValid && !this._isAllowedAssignmentEvent(ast)) {
768 ▶       this._reportError('Unsupported expression in a two-way binding', sourceSpan);
769 │     }
770 │ 
771 ▶     let eventType = ParsedEventType.Regular;
772 ▶     if (isAssignmentEvent) {
773 ▶       eventType = ParsedEventType.TwoWay;
774 │     }
775 ▶     if (name.startsWith(`${ANIMATE_PREFIX}${PROPERTY_PARTS_SEPARATOR}`)) {
776 ▶       eventType = ParsedEventType.Animation;
777 │     }
778 │ 
779 │     targetEvents.push(
780 ▶       new ParsedEvent(eventName, target, eventType, ast, sourceSpan, handlerSpan, keySpan),
781 │     );
782 │     // Don't detect directives for event names for now,
783 │     // so don't add the event name to the matchableAttrs
784 │   }
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L689–701 （▶ の行: 698–700）

```ts
689 │   calcPossibleSecurityContexts(
690 │     selector: string,
691 │     propName: string,
692 │     isAttribute: boolean,
693 │   ): SecurityContext[] {
694 │     const prop = this._schemaRegistry.getMappedPropName(propName);
695 │     return calcPossibleSecurityContexts(this._schemaRegistry, selector, prop, isAttribute);
696 │   }
697 │ 
698 ▶   parseEventListenerName(rawName: string): {eventName: string; target: string | null} {
699 ▶     const [target, eventName] = splitAtColon(rawName, [null, rawName]);
700 ▶     return {eventName: eventName!, target};
701 │   }
```

📄 `angular/packages/compiler/src/util.ts` L15–31 （▶ の行: 15–16, 28–30）

```ts
15 ▶ export function splitAtColon(input: string, defaultValues: (string | null)[]): (string | null)[] {
16 ▶   return _splitAt(input, ':', defaultValues);
17 │ }
18 │ 
19 │ export function splitAtPeriod(input: string, defaultValues: (string | null)[]): (string | null)[] {
20 │   return _splitAt(input, '.', defaultValues);
21 │ }
22 │ 
23 │ function _splitAt(
24 │   input: string,
25 │   character: string,
26 │   defaultValues: (string | null)[],
27 │ ): (string | null)[] {
28 ▶   const characterIndex = input.indexOf(character);
29 ▶   if (characterIndex == -1) return defaultValues;
30 ▶   return [input.slice(0, characterIndex).trim(), input.slice(characterIndex + 1).trim()];
31 │ }
```

1. **659 行目：`@` で始まれば旧アニメーションのイベント、それ以外は 676 行目の `_parseRegularEvent`**
2. **759 行目 → 698〜700 行目：最初の `:` で target と名前に分ける**

   util.ts 28〜30 行目、`:` が無ければ既定値 `[null, rawName]`（29 行目）。`(window:resize)` は target `window`・名前 `resize`、`(keydown.enter)` は `:` が無いので target `null`・名前 `keydown.enter` のままです。
3. **761 行目：右辺を `_parseAction` で読む**

   [前章](05-compiler-expression-parser.md)の `parseAction`（`ParseFlags.Action`）なので、代入と `;` が書けます。
4. **767〜768 行目：two-way のイベント側なら、右辺が「代入できる形」かを確かめる**
5. **771〜777 行目：`ParsedEventType` を決める**

   ふつうは Regular、two-way なら 773 行目で TwoWay、名前が `animate.` で始まれば 776 行目で Animation。
6. **780 行目：`ParsedEvent(eventName, target, ...)`**

   782〜783 行目のコメントのとおり、イベント名はディレクティブ照合用の属性には加えません。

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L786–803 （▶ の行: 790, 794–795）

```ts
786 │   private _parseAction(value: string, sourceSpan: ParseSourceSpan): ASTWithSource {
787 │     const absoluteOffset = sourceSpan && sourceSpan.start ? sourceSpan.start.offset : 0;
788 │ 
789 │     try {
790 ▶       const ast = this._exprParser.parseAction(value, sourceSpan, absoluteOffset);
791 │       if (ast) {
792 │         this.errors.push(...ast.errors);
793 │       }
794 ▶       if (!ast || ast.ast instanceof EmptyExpr) {
795 ▶         this._reportError(`Empty expressions are not allowed`, sourceSpan);
796 │         return this._exprParser.wrapLiteralPrimitive('ERROR', sourceSpan, absoluteOffset);
797 │       }
798 │       return ast;
799 │     } catch (e) {
800 │       this._reportError(`${e}`, sourceSpan);
801 │       return this._exprParser.wrapLiteralPrimitive('ERROR', sourceSpan, absoluteOffset);
802 │     }
803 │   }
```

`_parseAction` は 790 行目で式のパーサを呼び、794〜795 行目で中身が空（`(click)=""`）なら「Empty expressions are not allowed」にします。

📄 `angular/packages/platform-browser/src/dom/events/key_events.ts` L96–113 （▶ の行: 105–106, 108–110）

```ts
 96 │   /**
 97 │    * Parses the user provided full keyboard event definition and normalizes it for
 98 │    * later internal use. It ensures the string is all lowercase, converts special
 99 │    * characters to a standard spelling, and orders all the values consistently.
100 │    *
101 │    * @param eventName The name of the key event to listen for.
102 │    * @returns an object with the full, normalized string, and the dom event name
103 │    * or null in the case when the event doesn't match a keyboard event.
104 │    */
105 ▶   static parseEventName(eventName: string): {fullKey: string; domEventName: string} | null {
106 ▶     const parts: string[] = eventName.toLowerCase().split('.');
107 │ 
108 ▶     const domEventName = parts.shift();
109 ▶     if (parts.length === 0 || !(domEventName === 'keydown' || domEventName === 'keyup')) {
110 ▶       return null;
111 │     }
112 │ 
113 │     const key = KeyEventsPlugin._normalizeKey(parts.pop()!);
```

`keydown.enter` の `.enter` を読むのは**実行時**の `platform-browser` の `KeyEventsPlugin` です。106 行目で名前を `.` で切り、108〜109 行目で先頭が `keydown` か `keyup` のときだけ自分の担当にします。コンパイラは上で読んだ `parseEventListenerName`（699 行目）で `:` を見るだけで、`.` には触れません。

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L835–861 （▶ の行: 835, 840, 844, 848, 854–856, 860）

```ts
835 ▶   private _isAllowedAssignmentEvent(ast: AST): boolean {
836 │     if (ast instanceof ASTWithSource) {
837 │       return this._isAllowedAssignmentEvent(ast.ast);
838 │     }
839 │ 
840 ▶     if (ast instanceof NonNullAssert) {
841 │       return this._isAllowedAssignmentEvent(ast.expression);
842 │     }
843 │ 
844 ▶     if (
845 │       ast instanceof Call &&
846 │       ast.args.length === 1 &&
847 │       ast.receiver instanceof PropertyRead &&
848 ▶       ast.receiver.name === '$any' &&
849 │       ast.receiver.receiver instanceof ImplicitReceiver
850 │     ) {
851 │       return this._isAllowedAssignmentEvent(ast.args[0]);
852 │     }
853 │ 
854 ▶     if (ast instanceof PropertyRead || ast instanceof KeyedRead) {
855 ▶       if (!hasRecursiveSafeReceiver(ast)) {
856 ▶         return true;
857 │       }
858 │     }
859 │ 
860 ▶     return false;
861 │   }
```

767 行目が呼ぶ `_isAllowedAssignmentEvent` です。`[(x)]="v"` の右辺として通るのは、854〜857 行目のプロパティ読み・キー読み（途中に `?.` が無いこと）、840 行目の後置 `!`、844〜851 行目の `$any(…)` で包んだものだけで、それ以外は 860 行目で `false`（「Unsupported expression in a two-way binding」）です。

## 6. \*ngFor の微小構文：parseTemplateBindings

`*` 付きの属性は `parseAttribute` より前、`prepareAttributes` の中で拾われます。

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L666–701 （▶ の行: 666, 668, 670, 676–677, 687, 693–694, 697, 699）

```ts
666 ▶       if (attribute.name.startsWith(TEMPLATE_ATTR_PREFIX)) {
667 │         // *-attributes
668 ▶         if (elementHasInlineTemplate) {
669 │           this.reportError(
670 ▶             `Can't have multiple template bindings on one element. Use only one attribute prefixed with *`,
671 │             attribute.sourceSpan,
672 │           );
673 │         }
674 │         isTemplateBinding = true;
675 │         elementHasInlineTemplate = true;
676 ▶         const templateValue = attribute.value;
677 ▶         const templateKey = attribute.name.substring(TEMPLATE_ATTR_PREFIX.length);
678 │ 
679 │         const parsedVariables: ParsedVariable[] = [];
680 │         const absoluteValueOffset = attribute.valueSpan
681 │           ? attribute.valueSpan.fullStart.offset
682 │           : // If there is no value span the attribute does not have a value, like `attr` in
683 │             //`<div attr></div>`. In this case, point to one character beyond the last character of
684 │             // the attribute name.
685 │             attribute.sourceSpan.fullStart.offset + attribute.name.length;
686 │ 
687 ▶         this.bindingParser.parseInlineTemplateBinding(
688 │           templateKey,
689 │           templateValue,
690 │           attribute.sourceSpan,
691 │           absoluteValueOffset,
692 │           [],
693 ▶           templateParsedProperties,
694 ▶           parsedVariables,
695 │           true /* isIvyAst */,
696 │         );
697 ▶         templateVariables.push(
698 │           ...parsedVariables.map(
699 ▶             (v) => new t.Variable(v.name, v.value, v.sourceSpan, v.keySpan, v.valueSpan),
700 │           ),
701 │         );
```

666 行目で名前が `*` で始まれば、677 行目で `*` を外した名前（`ngFor`）を key、676 行目で属性値を value として 687 行目の `parseInlineTemplateBinding` へ。668〜673 行目、1 つの要素に `*` は 1 つだけです。結果は 693 行目の `templateParsedProperties` と 694 行目の `parsedVariables` に入り、697〜701 行目で `t.Variable` に変わります。これらを使って要素を `Template` で包む処理は[次章](07-compiler-r3-ast.md)です。

📄 `angular/packages/compiler/src/expression_parser/ast.ts` L624–643 （▶ の行: 631–636, 643）

```ts
624 │ /**
625 │  * TemplateBinding refers to a particular key-value pair in a microsyntax
626 │  * expression. A few examples are:
627 │  *
628 │  *   |---------------------|--------------|---------|--------------|
629 │  *   |     expression      |     key      |  value  | binding type |
630 │  *   |---------------------|--------------|---------|--------------|
631 ▶  *   | 1. let item         |    item      |  null   |   variable   |
632 ▶  *   | 2. of items         |   ngForOf    |  items  |  expression  |
633 ▶  *   | 3. let x = y        |      x       |    y    |   variable   |
634 ▶  *   | 4. index as i       |      i       |  index  |   variable   |
635 ▶  *   | 5. trackBy: func    | ngForTrackBy |   func  |  expression  |
636 ▶  *   | 6. *ngIf="cond"     |     ngIf     |   cond  |  expression  |
637 │  *   |---------------------|--------------|---------|--------------|
638 │  *
639 │  * (6) is a notable exception because it is a binding from the template key in
640 │  * the LHS of a HTML attribute to the expression in the RHS. All other bindings
641 │  * in the example above are derived solely from the RHS.
642 │  */
643 ▶ export type TemplateBinding = VariableBinding | ExpressionBinding;
```

微小構文の結果は `TemplateBinding` の列で、`VariableBinding`（変数の宣言）と `ExpressionBinding`（ディレクティブの input への式）の 2 種類です。631〜636 行目の表がそのまま答えです。

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L1407–1443 （▶ の行: 1413, 1415, 1417, 1425, 1428, 1434–1436, 1439）

```ts
1407 │   parseTemplateBindings(templateKey: TemplateBindingIdentifier): TemplateBindingParseResult {
1408 │     const bindings: TemplateBinding[] = [];
1409 │ 
1410 │     // The first binding is for the template key itself
1411 │     // In *ngFor="let item of items", key = "ngFor", value = null
1412 │     // In *ngIf="cond | pipe", key = "ngIf", value = "cond | pipe"
1413 ▶     bindings.push(...this.parseDirectiveKeywordBindings(templateKey));
1414 │ 
1415 ▶     while (this.index < this.tokens.length) {
1416 │       // If it starts with 'let', then this must be variable declaration
1417 ▶       const letBinding = this.parseLetBinding();
1418 │       if (letBinding) {
1419 │         bindings.push(letBinding);
1420 │       } else {
1421 │         // Two possible cases here, either `value "as" key` or
1422 │         // "directive-keyword expression". We don't know which case, but both
1423 │         // "value" and "directive-keyword" are template binding key, so consume
1424 │         // the key first.
1425 ▶         const key = this.expectTemplateBindingKey();
1426 │         // Peek at the next token, if it is "as" then this must be variable
1427 │         // declaration.
1428 ▶         const binding = this.parseAsBinding(key);
1429 │         if (binding) {
1430 │           bindings.push(binding);
1431 │         } else {
1432 │           // Otherwise the key must be a directive keyword, like "of". Transform
1433 │           // the key to actual key. Eg. of -> ngForOf, trackBy -> ngForTrackBy
1434 ▶           key.source =
1435 ▶             templateKey.source + key.source.charAt(0).toUpperCase() + key.source.substring(1);
1436 ▶           bindings.push(...this.parseDirectiveKeywordBindings(key));
1437 │         }
1438 │       }
1439 ▶       this.consumeStatementTerminator();
1440 │     }
1441 │ 
1442 │     return new TemplateBindingParseResult(bindings, [] /* warnings */, this.errors);
1443 │   }
```

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L1502–1522 （▶ の行: 1504–1505, 1511, 1517, 1519）

```ts
1502 │   private parseDirectiveKeywordBindings(key: TemplateBindingIdentifier): TemplateBinding[] {
1503 │     const bindings: TemplateBinding[] = [];
1504 ▶     this.consumeOptionalCharacter(chars.$COLON); // trackBy: trackByFunction
1505 ▶     const value = this.getDirectiveBoundTarget();
1506 │     let spanEnd = this.currentAbsoluteOffset;
1507 │     // The binding could optionally be followed by "as". For example,
1508 │     // *ngIf="cond | pipe as x". In this case, the key in the "as" binding
1509 │     // is "x" and the value is the template key itself ("ngIf"). Note that the
1510 │     // 'key' in the current context now becomes the "value" in the next binding.
1511 ▶     const asBinding = this.parseAsBinding(key);
1512 │     if (!asBinding) {
1513 │       this.consumeStatementTerminator();
1514 │       spanEnd = this.currentAbsoluteOffset;
1515 │     }
1516 │     const sourceSpan = new AbsoluteSourceSpan(key.span.start, spanEnd);
1517 ▶     bindings.push(new ExpressionBinding(sourceSpan, key, value));
1518 │     if (asBinding) {
1519 ▶       bindings.push(asBinding);
1520 │     }
1521 │     return bindings;
1522 │   }
```

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L1562–1596 （▶ の行: 1563, 1567, 1570, 1583, 1588, 1590–1591, 1595）

````ts
1562 │   private parseAsBinding(value: TemplateBindingIdentifier): TemplateBinding | null {
1563 ▶     if (!this.peekKeywordAs()) {
1564 │       return null;
1565 │     }
1566 │     this.advance(); // consume the 'as' keyword
1567 ▶     const key = this.expectTemplateBindingKey();
1568 │     this.consumeStatementTerminator();
1569 │     const sourceSpan = new AbsoluteSourceSpan(value.span.start, this.currentAbsoluteOffset);
1570 ▶     return new VariableBinding(sourceSpan, key, value);
1571 │   }
1572 │ 
1573 │   /**
1574 │    * Return the binding for a variable declared using `let`. For example,
1575 │    * ```
1576 │    *   *ngFor="let item of items; let i=index;"
1577 │    *           ^^^^^^^^           ^^^^^^^^^^^
1578 │    * ```
1579 │    * In the first binding, `item` is bound to `NgForOfContext.$implicit`.
1580 │    * In the second binding, `i` is bound to `NgForOfContext.index`.
1581 │    */
1582 │   private parseLetBinding(): TemplateBinding | null {
1583 ▶     if (!this.peekKeywordLet()) {
1584 │       return null;
1585 │     }
1586 │     const spanStart = this.currentAbsoluteOffset;
1587 │     this.advance(); // consume the 'let' keyword
1588 ▶     const key = this.expectTemplateBindingKey();
1589 │     let value: TemplateBindingIdentifier | null = null;
1590 ▶     if (this.consumeOptionalOperator('=')) {
1591 ▶       value = this.expectTemplateBindingKey();
1592 │     }
1593 │     this.consumeStatementTerminator();
1594 │     const sourceSpan = new AbsoluteSourceSpan(spanStart, this.currentAbsoluteOffset);
1595 ▶     return new VariableBinding(sourceSpan, key, value);
1596 │   }
````

`*ngFor="let x of xs; index as i; trackBy: f"` を 1 つずつ読みます。

1. **1413 行目：まず key（`ngFor`）自身の束縛を作る**

   `parseDirectiveKeywordBindings` の 1505 行目で値を読もうとしますが、次の Token が `let` なので値は `null` です（`getDirectiveBoundTarget` は `let` / `as` / 終端を見ると `null` を返す）。→ `ExpressionBinding(ngFor, null)`
2. **1417 行目 → 1583〜1595 行目：`let x`**

   1588 行目で `x` を読み、1590 行目の `=` が無いので値は `null`。→ `VariableBinding(x, null)`
3. **1425 行目 → 1434〜1436 行目：`of xs`**

   `of` を key として読み、1428 行目で後ろが `as` でないので、1434〜1435 行目で **key の先頭を大文字にして `ngFor` の後ろにつなげ**`ngForOf` にします。1436 行目 → 1505 行目で `xs` を式として読みます（中身は `parsePipe` なので `xs | slice:0:2` も書けます）。→ `ExpressionBinding(ngForOf, xs)`
4. **1439 行目：`;` か `,` を 1 つ読み捨てる**
5. **1425 行目 → 1428 行目 → 1563〜1570 行目：`index as i`**

   `index` を読んだあと次が `as` なので `parseAsBinding`。1567 行目で `i` を読み、1570 行目で **key と value を逆にして**`VariableBinding(i, index)`。
6. **1504 行目：`trackBy: f`**

   `trackBy` が 1434〜1435 行目で `ngForTrackBy` になり、1504 行目で `:` を読み捨てて `f` を式として読みます。→ `ExpressionBinding(ngForTrackBy, f)`

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L198–228 （▶ の行: 209, 217, 223–224, 228）

```ts
198 │   parseInlineTemplateBinding(
199 │     tplKey: string,
200 │     tplValue: string,
201 │     sourceSpan: ParseSourceSpan,
202 │     absoluteValueOffset: number,
203 │     targetMatchableAttrs: string[][],
204 │     targetProps: ParsedProperty[],
205 │     targetVars: ParsedVariable[],
206 │     isIvyAst: boolean,
207 │   ) {
208 │     const absoluteKeyOffset = sourceSpan.start.offset + TEMPLATE_ATTR_PREFIX.length;
209 ▶     const bindings = this._parseTemplateBindings(
210 │       tplKey,
211 │       tplValue,
212 │       sourceSpan,
213 │       absoluteKeyOffset,
214 │       absoluteValueOffset,
215 │     );
216 │ 
217 ▶     for (const binding of bindings) {
218 │       // sourceSpan is for the entire HTML attribute. bindingSpan is for a particular
219 │       // binding within the microsyntax expression so it's more narrow than sourceSpan.
220 │       const bindingSpan = moveParseSourceSpan(sourceSpan, binding.sourceSpan);
221 │       const key = binding.key.source;
222 │       const keySpan = moveParseSourceSpan(sourceSpan, binding.key.span);
223 ▶       if (binding instanceof VariableBinding) {
224 ▶         const value = binding.value ? binding.value.source : '$implicit';
225 │         const valueSpan = binding.value
226 │           ? moveParseSourceSpan(sourceSpan, binding.value.span)
227 │           : undefined;
228 ▶         targetVars.push(new ParsedVariable(key, value, bindingSpan, keySpan, valueSpan));
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L229–258 （▶ の行: 229, 232–234, 242, 246–247）

```ts
229 ▶       } else if (binding.value) {
230 │         const srcSpan = isIvyAst ? bindingSpan : sourceSpan;
231 │         const valueSpan = moveParseSourceSpan(sourceSpan, binding.value.ast.sourceSpan);
232 ▶         this._parsePropertyAst(
233 ▶           key,
234 ▶           binding.value,
235 │           false,
236 │           srcSpan,
237 │           keySpan,
238 │           valueSpan,
239 │           targetMatchableAttrs,
240 │           targetProps,
241 │         );
242 ▶       } else {
243 │         targetMatchableAttrs.push([key, '' /* value */]);
244 │         // Since this is a literal attribute with no RHS, source span should be
245 │         // just the key span.
246 ▶         this.parseLiteralAttr(
247 ▶           key,
248 │           null /* value */,
249 │           keySpan,
250 │           absoluteValueOffset,
251 │           undefined /* valueSpan */,
252 │           targetMatchableAttrs,
253 │           targetProps,
254 │           keySpan,
255 │         );
256 │       }
257 │     }
258 │   }
```

`BindingParser.parseInlineTemplateBinding` は、209 行目で上の列を受け取り、217 行目から 1 つずつ R3 AST 向けの形に変えます。223〜228 行目、`VariableBinding` は `ParsedVariable` に。**値が無い `let x` は 224 行目で `'$implicit'`** になります（コンテキストの `$implicit` を受け取る変数）。229〜241 行目、値のある `ExpressionBinding` は 2 節と同じ `_parsePropertyAst` で `ParsedProperty`（`ngForOf` / `ngForTrackBy`）に。242〜256 行目、値の無い `ngFor` は `parseLiteralAttr` で値なしの静的な属性になります。この `ngFor` 属性があるので、`NgForOf` のセレクタ `[ngFor][ngForOf]` に当たります。

| 微小構文の断片 | TemplateBinding | R3 AST での行き先 |
| --- | --- | --- |
| （key 自身）`ngFor` | `ExpressionBinding(ngFor, null)` | `Template.templateAttrs` の `TextAttribute(ngFor, '')` |
| `let x` | `VariableBinding(x, null)` | `Template.variables` の `Variable(x, '$implicit')` |
| `of xs` | `ExpressionBinding(ngForOf, xs)` | `Template.templateAttrs` の `BoundAttribute(ngForOf)` |
| `index as i` | `VariableBinding(i, index)` | `Template.variables` の `Variable(i, 'index')` |
| `trackBy: f` | `ExpressionBinding(ngForTrackBy, f)` | `Template.templateAttrs` の `BoundAttribute(ngForTrackBy)` |

## 7. 実物の parseTemplate で確かめる

> **🧪 DEMO — 属性を書いて parseTemplate に通す**
>
> 「解析」を押すと `@angular/compiler`（インストール版 22.1.6）を読み込み、`<タグ 属性></タグ>` を `parseTemplate` で解析して、R3 AST の `attributes` / `inputs` / `outputs` / `references`、`*` があれば外側の `Template` の `templateAttrs` / `variables` を並べます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/compiler-binding-parser)

`[attr.aria-label]` は name が `aria-label`・type が Attribute に、`(keydown.enter)` は name が `keydown.enter` のまま（target なし）、`(window:resize)` は target が `window` になります。`[(value)]` は inputs に TwoWay、outputs に `valueChange`（TwoWay）の 2 行です。`*ngFor` の行は、外側の `Template` に `templateAttrs` と `variables` が並び、`Element` の側には何も残りません。

## 呼び出しの流れ

- 👤 `<a [attr.aria-label]="x" (keydown.enter)="f()">` — あなたのテンプレート
  - `HtmlAstToIvyAst.visitElement()` → `prepareAttributes()` — render3/r3\_template\_transform.ts L138 / L643
    - `parseAttribute()` — r3\_template\_transform.ts L734 — *BIND\_NAME\_REGEXP → 括弧 → 補間*
      - `BindingParser.parsePropertyBinding('attr.aria-label', 'x')` — template\_parser/binding\_parser.ts L348
        - `parseBinding()` → `Parser.parseBinding()` — binding\_parser.ts L524 / expression\_parser/parser.ts L131
        - `_parsePropertyAst()` — binding\_parser.ts L450 — *ParsedProperty(attr.aria-label, DEFAULT)*
      - `BindingParser.parseEvent('keydown.enter', 'f()')` — binding\_parser.ts L645 → L748 — *ParsedEvent(keydown.enter, null, Regular)*
  - `categorizePropertyAttributes()` — r3\_template\_transform.ts L604
    - `createBoundElementProperty()` — binding\_parser.ts L544 — *aria-label / Attribute*
      - `calcPossibleSecurityContexts()` → `checkSecurityContext()` — binding\_parser.ts L884 / schema/dom\_security\_schema.ts L185 — *NONE*
    - `t.BoundAttribute.fromBoundElementProperty()` — render3/r3\_ast.ts — *次章*
- 👤 `KeyEventsPlugin.parseEventName('keydown.enter')` — 実行時 platform-browser/src/dom/events/key\_events.ts L105 — *.enter はここ*

## 聞かれそうな質問

**Q. \[class.x\] と \[ngClass\] は、コンパイラの中でどう違いますか？**

構文の段階では同じ `[x]` です（r3\_template\_transform.ts 894〜906 行目）。違いは `createBoundElementProperty` で生まれます。`class.x` は 566 行目で `['class', 'x']` に切れ、591〜594 行目で name `x`・`BindingType.Class`・NONE。`ngClass` は `.` が無いので 617〜627 行目の `BindingType.Property` です。Class は ingest.ts 1494 行目で `ClassName`（スタイリング命令）に、`ngClass` は Property のまま、[ディレクティブの照合](09-compiler-binder.md)で `NgClass` の input に当たります。

**Q. (keydown.enter) の .enter はどこで解釈されますか？**

コンパイラではありません。`_parseRegularEvent` の 759 行目は `parseEventListenerName`（699 行目）で `:` だけを見て、`.` を含む名前 `keydown.enter` をそのまま `ParsedEvent` にします（780 行目）。`.enter` を読むのは実行時の `KeyEventsPlugin.parseEventName`（key\_events.ts 105〜110 行目）で、`keydown` / `keyup` の後ろの部分をキー名として解釈します。

**Q. \[(x)\]="v" は何に分解されますか？**

2 つです。`parsePropertyBinding` に `isPartOfAssignmentBinding = true` で渡り、465 行目で `ParsedPropertyType.TWO_WAY`、627 行目で `BindingType.TwoWay` の input。もう 1 つは `parseAssignmentEvent` が作る `xChange` のイベントで、773 行目で `ParsedEventType.TwoWay` です。右辺は 835〜861 行目の形（プロパティ読み・キー読みなど）に限られます。`model()` との組み合わせは [model() と output() の章](../signals/13-signals-model-output.md)で読みます。

**Q. \[foo\]="x" と存在しないプロパティを書いたのに、ここではエラーになりません。なぜですか？**

R3 AST を作る段階では検査を飛ばしているからです。`categorizePropertyAttributes` は 633 行目で `skipValidation` を `attr.on…` 以外すべて `true` にし、626〜628 行目のコメントのとおり、その名前がディレクティブの input かもしれないので DOM の検査をしません。どのディレクティブが付くかが分かってから、[型検査](17-compiler-typecheck.md)の段階で未知のプロパティとして報告されます。

**Q. &lt;iframe \[src\]&gt; と &lt;img \[src\]&gt; でセキュリティの扱いが違うのはなぜですか？**

dom\_security\_schema.ts の表で、`iframe` の `src` は 105 行目で RESOURCE\_URL、`img` の `src` は 91 行目で URL に登録されているからです。`checkSecurityContext` は 191 行目でプロパティ名から引き、209 行目で要素名ごとの値を選びます。RESOURCE\_URL は実行時の `ɵɵsanitizeResourceUrl` が、`bypassSecurityTrustResourceUrl` で信頼済みにした値以外を例外にする、より厳しい印です（[サニタイズの章](../template/07-sanitize.md)）。

**Q. \*ngFor="let x of xs" の let x は何の値を受け取りますか？**

`let x` は `parseLetBinding`（parser.ts 1583〜1595 行目）で値の無い `VariableBinding` になり、binding\_parser.ts 224 行目で値が `'$implicit'` に置き換わります。つまり「テンプレートのコンテキストの `$implicit` を `x` と呼ぶ」という宣言で、`index as i` は 1570 行目で `i` ← `index` の宣言になります。

## 読み終えて

- 属性名は `BIND_NAME_REGEXP`（bind- / let- / # / on- / bindon- / @）→ 括弧（`[(` を先に）→ 補間の順に判定される
- `[attr.x]` も `[class.x]` も最初はただの property。`BindingType` は `createBoundElementProperty` が名前の先頭で決める
- セキュリティコンテキストはプロパティ名 × 要素名の許可表で決まり、テンプレートでは先頭の 1 つを使う
- イベント名は `:` で target を分けるだけ。`.enter` は実行時の `KeyEventsPlugin`
- `*ngFor` の右辺は `parseTemplateBindings` で `VariableBinding` と `ExpressionBinding` の列になり、`of` → `ngForOf` のように key がつながる

---

← 前: [式のパーサ：{{ a?.b | pipe }} が AST になるまで](05-compiler-expression-parser.md)  
次: [R3 AST：HTML の木を Angular の木に組み替える htmlAstToRender3Ast](07-compiler-r3-ast.md) →
