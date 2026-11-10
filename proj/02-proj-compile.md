[目次](../README.md) › [ng-content と投影の内側](README.md) › 第 2 回 / 全 6 回

# コンパイラの側：select の解析、ngProjectAs、既定の内容

> テンプレートパイプラインの ingestContent・removeContentSelectors・generateProjectionDefs と、セレクタを配列にする parseSelectorToR3Selector。枠の番号はビューごとに数えるので @if の中の ng-content は後ろに回り、.d.ts の並びと違うこと。ngProjectAs が最初の 1 つだけ解析されて AttributeMarker.ProjectAs の後ろに入る行（空なら undefined）、既定の内容（fallback）が別のテンプレート関数になる行。@if のルートの要素が 1 つのときだけタグ名と属性が写ることと、写らないときの拡張診断 NG8011。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/proj-compile)

---

この章では、[第 1 回](01-proj-what-declared.md)の出力に出た `ngContentSelectors`・`ɵɵprojectionDef(_c0)`・`ɵɵprojection(…)` を、**コンパイラのどの関数が、どの順で作っているか**を読みます。既定の内容（fallback）が別のテンプレート関数になる行、枠の番号の付け方、セレクタを解析済みの形にする関数、`ngProjectAs` が定数（`AttributeMarker.ProjectAs`）になる行、そして制御フロー（`@if` など）の中の要素が枠に届かないときの拡張診断 NG8011 です。

読む対象は、テンプレートパイプライン（R3 AST を IR にして命令に直すコンパイラの後半。全体は [compiler](../compiler/01-compiler.md)）の `packages/compiler/src/template/pipeline/src/ingest.ts`・`phases/phase_remove_content_selectors.ts`・`phases/generate_projection_def.ts`・`phases/const_collection.ts`・`instruction.ts`、セレクタの変換 `packages/compiler/src/core.ts`、型検査の `packages/compiler/src/typecheck/ops/content_projection.ts` です。

1. [1. 1 行の ng-content が生むもの](01-proj-what-declared.md)
2. **2. コンパイラの側**（この章）
3. [3. 振り分け](03-proj-distribute.md)
4. [4. 描画と再投影](04-proj-render.md)
5. [5. 動的な投影とよくある誤解](05-proj-dynamic.md)
6. [6. spec と issue](06-proj-tests-issues.md)

## 1. 入口：R3 AST の Content

HTML の木を Angular の木（R3 AST）にする `htmlAstToRender3Ast` は、`<ng-content>` を `t.Content` という専用のノードにし、`select` の値（無ければ `'*'`）を `selector` に入れ、子をそのまま `children` に持たせます。`<ng-content>` の属性は全部、静的な `TextAttribute` になります。この行は [compiler-r3-ast](../compiler/07-compiler-r3-ast.md) の 3 節が読んでいます。ここから先は、この `t.Content` を受け取るテンプレートパイプラインの側です。R3 AST を IR（命令のリスト）にする `ingest` の全体は [compiler-ingest](../compiler/10-compiler-ingest.md) にあります。

## 2. ingestContent：既定の内容を先に、別のビューにする

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L509–532 （▶ の行: 512, 517, 519–523, 525–526, 529–530）

```ts
509 │ /**
510 │  * Ingest a content node from the AST into the given `ViewCompilation`.
511 │  */
512 ▶ function ingestContent(unit: ViewCompilationUnit, content: t.Content): void {
513 │   if (content.i18n !== undefined && !(content.i18n instanceof i18n.TagPlaceholder)) {
514 │     throw Error(`Unhandled i18n metadata type for element: ${content.i18n.constructor.name}`);
515 │   }
516 │ 
517 ▶   let fallbackView: ViewCompilationUnit | null = null;
518 │ 
519 ▶   // Don't capture default content that's only made up of empty text nodes and comments.
520 ▶   // Note that we process the default content before the projection in order to match the
521 ▶   // insertion order at runtime.
522 ▶   if (
523 ▶     content.children.some(
524 │       (child) =>
525 ▶         !(child instanceof t.Comment) &&
526 ▶         (!(child instanceof t.Text) || child.value.trim().length > 0),
527 │     )
528 │   ) {
529 ▶     fallbackView = unit.job.allocateView(unit.xref);
530 ▶     ingestNodes(fallbackView, content.children);
531 │   }
532 │ 
```

1. **522〜528 行目：中身が「空白だけのテキストとコメント」なら、既定の内容とみなさない**

   `children.some(…)` は「コメントでなく、かつ（テキストでないか、空白を除いて 1 文字以上あるテキスト）」の子が 1 つでもあるかを見ます。`<ng-content></ng-content>` を改行と字下げつきで書いても、既定の内容は作られません。
2. **529〜530 行目：既定の内容は、新しいビュー（`allocateView`）に取り込む**

   `unit.job.allocateView(unit.xref)` は、いまのビューを親とする埋め込みビューを 1 つ用意し、530 行目で子をそのビューの命令として取り込みます。これが第 1 回の `Card_ProjectionFallback_4_Template` になります。`@if` の中身が `Card_Conditional_…` になるのと同じ作り方です（[compiler-control-flow-phases](../compiler/15-compiler-control-flow-phases.md)）。
3. **520〜521 行目：既定の内容を、投影の命令より**先に**取り込む**

   コメントの理由は「実行時に挿す順と合わせるため」です。2024-04 の「fix(core): resolve error for multiple component instances that use fallback content」（97eea8d50ea、#55478）で、`allocateXrefId`（次の引用の 533 行目）をこの後ろへ動かしました。同じコミットで実行時の側も「既定の内容のテンプレートは、描くかどうかに関係なく必ず宣言する」形に変わっています（[第 4 回](04-proj-render.md)）。

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L533–560 （▶ の行: 533–534, 536, 538, 541, 544, 546–548, 559）

```ts
533 ▶   const id = unit.job.allocateXrefId();
534 ▶   const op = ir.createProjectionOp(
535 │     id,
536 ▶     content.selector,
537 │     content.i18n,
538 ▶     fallbackView?.xref ?? null,
539 │     content.sourceSpan,
540 │   );
541 ▶   for (const attr of content.attributes) {
542 │     const securityContext = domSchema.securityContext(content.name, attr.name, true);
543 │     unit.update.push(
544 ▶       ir.createBindingOp(
545 │         op.xref,
546 ▶         ir.BindingKind.Attribute,
547 ▶         attr.name,
548 ▶         o.literal(attr.value),
549 │         null,
550 │         securityContext,
551 │         true,
552 │         false,
553 │         null,
554 │         asMessage(attr.i18n),
555 │         attr.sourceSpan,
556 │       ),
557 │     );
558 │   }
559 ▶   unit.create.push(op);
560 │ }
```

534〜540 行目の `createProjectionOp` が、1 つの `<ng-content>` を表す IR の命令（`Projection` の op）です。536 行目に `select` の文字列、538 行目に既定の内容のビューの xref（ビューを指す番号）が入ります。541〜558 行目は、`<ng-content>` の属性を 1 つずつ `BindingKind.Attribute` の binding op（更新の段のリストに置く命令）にします。ここで `select` も**ほかの属性と同じように** op になります。消すのは次の節のフェーズです。559 行目で、作成の段のリスト（`unit.create`）に足します。

## 3. removeContentSelectors：select 属性だけを消す

📄 `angular/packages/compiler/src/template/pipeline/src/phases/phase_remove_content_selectors.ts` L13–35 （▶ の行: 14–15, 22–25, 34）

```ts
13 │ /**
14 ▶  * Attributes of `ng-content` named 'select' are specifically removed, because they control which
15 ▶  * content matches as a property of the `projection`, and are not a plain attribute.
16 │  */
17 │ export function removeContentSelectors(job: CompilationJob): void {
18 │   for (const unit of job.units) {
19 │     const elements = createOpXrefMap(unit);
20 │     for (const op of unit.ops()) {
21 │       switch (op.kind) {
22 ▶         case ir.OpKind.Binding:
23 ▶           const target = lookupInXrefMap(elements, op.target);
24 ▶           if (isSelectAttribute(op.name) && target.kind === ir.OpKind.Projection) {
25 ▶             ir.OpList.remove<ir.UpdateOp>(op);
26 │           }
27 │           break;
28 │       }
29 │     }
30 │   }
31 │ }
32 │ 
33 │ function isSelectAttribute(name: string) {
34 ▶   return name.toLowerCase() === 'select';
35 │ }
```

14〜15 行目の説明のとおり、`select` は「どの中身を受けるか」を決める `Projection` の性質で、ふつうの属性ではありません。22〜25 行目で、binding op のうち、名前が `select`（34 行目で小文字にして比べる）で、しかも付け先が `Projection` のものだけを消します。このフェーズは 74 あるフェーズの 2 番目（`phases[1]`）で（[compiler](../compiler/01-compiler.md) のフェーズの一覧）、属性を定数に集めるフェーズ（13 番目の `extractAttributes`）より前です。だから `select` は ng-content の静的な属性の定数（`ɵɵprojection` の 3 つ目の引数）に残りません。`select` 以外の属性は残ります。第 1 回の DEMO の欄で `<ng-content select="[a]" class="x" />` とすると、`ɵɵprojection(0,0,_c2)` と `_c2 = [1, 'x']`（1 はクラスの印）が出ます。

## 4. generateProjectionDefs：枠の番号と、2 つの定数

📄 `angular/packages/compiler/src/template/pipeline/src/phases/generate_projection_def.ts` L15–53 （▶ の行: 28–32, 37, 41–43, 47, 51）

```ts
15 │ /**
16 │  * Locate projection slots, populate the each component's `ngContentSelectors` literal field,
17 │  * populate `project` arguments, and generate the required `projectionDef` instruction for the job's
18 │  * root view.
19 │  */
20 │ export function generateProjectionDefs(job: ComponentCompilationJob): void {
21 │   // TODO: Why does TemplateDefinitionBuilder force a shared constant?
22 │   const share = true;
23 │ 
24 │   // Collect all selectors from this component, and its nested views. Also, assign each projection a
25 │   // unique ascending projection slot index.
26 │   const selectors = [];
27 │   let projectionSlotIndex = 0;
28 ▶   for (const unit of job.units) {
29 ▶     for (const op of unit.create) {
30 ▶       if (op.kind === ir.OpKind.Projection) {
31 ▶         selectors.push(op.selector);
32 ▶         op.projectionSlotIndex = projectionSlotIndex++;
33 │       }
34 │     }
35 │   }
36 │ 
37 ▶   if (selectors.length > 0) {
38 │     // Create the projectionDef array. If we only found a single wildcard selector, then we use the
39 │     // default behavior with no arguments instead.
40 │     let defExpr: o.Expression | null = null;
41 ▶     if (selectors.length > 1 || selectors[0] !== '*') {
42 ▶       const def = selectors.map((s) => (s === '*' ? s : parseSelectorToR3Selector(s)));
43 ▶       defExpr = job.pool.getConstLiteral(literalOrArrayLiteral(def), share);
44 │     }
45 │ 
46 │     // Create the ngContentSelectors constant.
47 ▶     job.contentSelectors = job.pool.getConstLiteral(literalOrArrayLiteral(selectors), share);
48 │ 
49 │     // The projection def instruction goes at the beginning of the root view, before any
50 │     // `projection` instructions.
51 ▶     job.root.create.prepend([ir.createProjectionDefOp(defExpr)]);
52 │   }
53 │ }
```

1. **28〜35 行目：全部のビュー（unit）の、全部の `Projection` に、0 から番号を振る**

   `job.units` はルートのビューと、`@if` や既定の内容などの埋め込みビューの全部です。32 行目の `projectionSlotIndex++` が枠の番号で、第 1 回の `ɵɵprojection(2, 1)` の `1` です。`'*'` も同じように番号をもらいます。**ワイルドカードの枠の位置は、ただの並び順**です。
2. **41〜43 行目：`'*'` が 1 つだけなら、`ɵɵprojectionDef` の引数を作らない**

   41 行目の条件が偽（枠が 1 つで、しかも `'*'`）なら `defExpr` は `null` のままで、引数なしの `ɵɵprojectionDef()` になります。それ以外は 42 行目で `'*'` を文字列のまま残し、ほかを `parseSelectorToR3Selector`（5 節）で解析済みの形にします。43 行目の `getConstLiteral(…, share)` が、ファイルの先頭の `_c0` です。
3. **47 行目：`ngContentSelectors` は、書いたままの文字列の配列**

   同じ `selectors` を解析せずに定数にします。`'*'` が 1 つだけでも作られます（第 1 回の DEMO の「ng-content 1 つだけ」で `['*']`）。
4. **51 行目：`ɵɵprojectionDef` を、ルートのビューの作成の段の**先頭**に入れる**

   `prepend` なので、テンプレートのどこに ng-content があっても（`@if` の中でも）、命令はルートのテンプレート関数の 1 行目です。

28 行目の「ビューごとに数える」のせいで、`@if` の中の ng-content は番号が後ろに回ります。記録です（第 1 回と同じスクリプト、@angular/compiler-cli 22.1.6 / TypeScript 6.0.3）。

📄 `demo.ts（コンパイルしたもの）` L1–15 （▶ の行: 6–7, 9）

```
 1 │ import {Component} from '@angular/core';
 2 │ 
 3 │ @Component({
 4 │   selector: 'app-order',
 5 │   template: `
 6 ▶     @if (wide) {
 7 ▶       <ng-content select="[side]" />
 8 │     }
 9 ▶     <ng-content />
10 │   `,
11 │ })
12 │ export class Order {
13 │   wide = true;
14 │ }
15 │ 
```

📄 `out/demo.js（記録。抜粋）` L1–16 （▶ の行: 1–2, 4, 10, 12）

```
 1 ▶ const _c0 = ["*", [["", "side", ""]]];
 2 ▶ const _c1 = ["*", "[side]"];
 3 │ function Order_Conditional_0_Template(rf, ctx) { if (rf & 1) {
 4 ▶     i0.ɵɵprojection(0, 1);
 5 │ } }
 6 │ export class Order {
 7 │     wide = true;
 8 │     static ɵfac = function Order_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || Order)(); };
 9 │     static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: Order, selectors: [["app-order"]], ngContentSelectors: _c1, decls: 2, vars: 1, template: function Order_Template(rf, ctx) { if (rf & 1) {
10 ▶             i0.ɵɵprojectionDef(_c0);
11 │             i0.ɵɵconditionalCreate(0, Order_Conditional_0_Template, 1, 0);
12 ▶             i0.ɵɵprojection(1);
13 │         } if (rf & 2) {
14 │             i0.ɵɵconditional(ctx.wide ? 0 : -1);
15 │         } }, encapsulation: 2 });
16 │ }
```

📄 `out/demo.d.ts（記録）` L1–7 （▶ の行: 5）

```
1 │ import * as i0 from "@angular/core";
2 │ export declare class Order {
3 │     wide: boolean;
4 │     static ɵfac: i0.ɵɵFactoryDeclaration<Order, never>;
5 ▶     static ɵcmp: i0.ɵɵComponentDeclaration<Order, "app-order", never, {}, {}, never, ["[side]", "*"], true, never>;
6 │ }
7 │ 
```

テンプレートでは `[side]` が先ですが、1・2 行目の定数は `'*'` が 0 番、`[side]` が 1 番です。ルートのビューの `Projection` を先に数え（12 行目の `ɵɵprojection(1)` の枠は 0）、そのあとで `@if` のビューの分（4 行目の `ɵɵprojection(0, 1)`）を数えるからです。一方 .d.ts の 5 行目は `["[side]", "*"]` で、書いた順です。.d.ts の一覧は R3 AST を作るとき（1 節）に出会った順に集めたもので、パイプラインとは別の配列だからです。振り分け（第 3 回）は番号の付け方に左右されませんが、`createComponent` の `projectableNodes` は ɵcmp の並び（`'*'` が 0 番）に合わせて渡す必要があります（[第 5 回](05-proj-dynamic.md)）。

## 5. parseSelectorToR3Selector：セレクタを配列にする

📄 `angular/packages/compiler/src/core.ts` L112–142 （▶ の行: 113–114, 118, 121, 124, 127, 135, 138, 140–141）

```ts
112 │ /**
113 ▶  * Flags used to generate R3-style CSS Selectors. They are pasted from
114 ▶  * core/src/render3/projection.ts because they cannot be referenced directly.
115 │  */
116 │ export const enum SelectorFlags {
117 │   /** Indicates this is the beginning of a new negative selector */
118 ▶   NOT = 0b0001,
119 │ 
120 │   /** Mode for matching attributes */
121 ▶   ATTRIBUTE = 0b0010,
122 │ 
123 │   /** Mode for matching tag names */
124 ▶   ELEMENT = 0b0100,
125 │ 
126 │   /** Mode for matching class names */
127 ▶   CLASS = 0b1000,
128 │ }
129 │ 
130 │ // These are a copy the CSS types from core/src/render3/interfaces/projection.ts
131 │ // They are duplicated here as they cannot be directly referenced from core.
132 │ export type R3CssSelector = (string | SelectorFlags)[];
133 │ export type R3CssSelectorList = R3CssSelector[];
134 │ 
135 ▶ function parserSelectorToSimpleSelector(selector: CssSelector): R3CssSelector {
136 │   const classes =
137 │     selector.classNames && selector.classNames.length
138 ▶       ? [SelectorFlags.CLASS, ...selector.classNames]
139 │       : [];
140 ▶   const elementName = selector.element && selector.element !== '*' ? selector.element : '';
141 ▶   return [elementName, ...selector.attrs, ...classes];
142 │ }
```

📄 `angular/packages/compiler/src/core.ts` L144–179 （▶ の行: 150, 152, 157–158, 161, 167, 171, 174, 178）

```ts
144 │ function parserSelectorToNegativeSelector(selector: CssSelector): R3CssSelector {
145 │   const classes =
146 │     selector.classNames && selector.classNames.length
147 │       ? [SelectorFlags.CLASS, ...selector.classNames]
148 │       : [];
149 │ 
150 ▶   if (selector.element) {
151 │     return [
152 ▶       SelectorFlags.NOT | SelectorFlags.ELEMENT,
153 │       selector.element,
154 │       ...selector.attrs,
155 │       ...classes,
156 │     ];
157 ▶   } else if (selector.attrs.length) {
158 ▶     return [SelectorFlags.NOT | SelectorFlags.ATTRIBUTE, ...selector.attrs, ...classes];
159 │   } else {
160 │     return selector.classNames && selector.classNames.length
161 ▶       ? [SelectorFlags.NOT | SelectorFlags.CLASS, ...selector.classNames]
162 │       : [];
163 │   }
164 │ }
165 │ 
166 │ function parserSelectorToR3Selector(selector: CssSelector): R3CssSelector {
167 ▶   const positive = parserSelectorToSimpleSelector(selector);
168 │ 
169 │   const negative: R3CssSelectorList =
170 │     selector.notSelectors && selector.notSelectors.length
171 ▶       ? selector.notSelectors.map((notSelector) => parserSelectorToNegativeSelector(notSelector))
172 │       : [];
173 │ 
174 ▶   return positive.concat(...negative);
175 │ }
176 │ 
177 │ export function parseSelectorToR3Selector(selector: string | null): R3CssSelectorList {
178 ▶   return selector ? CssSelector.parse(selector).map(parserSelectorToR3Selector) : [];
179 │ }
```

- **178 行目**：文字列を `CssSelector.parse`（コンパイラの CSS セレクタの構文解析。[compiler-binder](../compiler/09-compiler-binder.md) のディレクティブの照合と同じもの）にかけ、カンマで分かれた 1 つ 1 つを配列にします。だから `select="a, b"` は `[["a"], ["b"]]` です。
- **135〜142 行目**：肯定の部分は `[タグ名, 属性名, 値, 属性名, 値, …, CLASS, クラス, …]` の並びです。140 行目で、タグ名が無いか `*` なら `''`（問わない）にします。
- **116〜128 行目**：数はモードの切り替えの印です。`NOT` が 1、`ATTRIBUTE` が 2、`ELEMENT` が 4、`CLASS` が 8 で、113〜114 行目のとおり、実行時（core の `interfaces/projection.ts`）の同じ名前の enum を写したものです。
- **150〜163 行目**：`:not(…)` は `NOT | ELEMENT`（5）・`NOT | ATTRIBUTE`（3）・`NOT | CLASS`（9）で始まる部分になり、171・174 行目で肯定の部分の後ろにつながります。`div:not(.x)` は `["div", 9, "x"]` です。

この形を実行時に読むのが `isNodeMatchingSelector` です（[projection](../template/02-projection.md) と [standalone-directive-registry](../standalone/07-standalone-directive-registry.md) が引用しています）。`CssSelector.parse` は `>` や `:first-child` をエラーにしません。DEMO で確かめると、`div > p` は `[["p"]]`、`p:first-child` は `[["first-child"]]`（タグ名 first-child）になり、**何も言わずに別のセレクタになります**。

## 6. projection の命令：省ける引数は省く

📄 `angular/packages/compiler/src/template/pipeline/src/instruction.ts` L416–443 （▶ の行: 417, 429–433, 435–437, 439）

```ts
416 │ export function projectionDef(def: o.Expression | null): ir.CreateOp {
417 ▶   return call(Identifiers.projectionDef, def ? [def] : [], null);
418 │ }
419 │ 
420 │ export function projection(
421 │   slot: number,
422 │   projectionSlotIndex: number,
423 │   attributes: o.Expression | null,
424 │   fallbackFnName: string | null,
425 │   fallbackDecls: number | null,
426 │   fallbackVars: number | null,
427 │   sourceSpan: ParseSourceSpan,
428 │ ): ir.CreateOp {
429 ▶   const args: o.Expression[] = [o.literal(slot)];
430 ▶   if (projectionSlotIndex !== 0 || attributes !== null || fallbackFnName !== null) {
431 ▶     args.push(o.literal(projectionSlotIndex));
432 ▶     if (attributes !== null) {
433 ▶       args.push(attributes);
434 │     }
435 ▶     if (fallbackFnName !== null) {
436 ▶       if (attributes === null) {
437 ▶         args.push(o.literal(null));
438 │       }
439 ▶       args.push(o.variable(fallbackFnName), o.literal(fallbackDecls), o.literal(fallbackVars));
440 │     }
441 │   }
442 │   return call(Identifiers.projection, args, sourceSpan);
443 │ }
```

reify（IR の op を ɵɵ 命令の呼び出しにするフェーズ。[compiler-reify-emit](../compiler/16-compiler-reify-emit.md)）は `Projection` の op を、この `projection` で命令にします。429 行目でノードの番号を入れ、430 行目の条件（枠が 0 でない・属性がある・既定の内容がある、のどれか）が偽なら、2 つ目以降を全部省きます。第 1 回の `ɵɵprojection(1)` がこれです。既定の内容があって属性が無いときは、436〜437 行目で 3 つ目に `null` を詰めてから、439 行目で関数の名前・decls・vars を足します（第 1 回の `ɵɵprojection(4, 2, null, Card_ProjectionFallback_4_Template, 1, 0)`）。417 行目の `projectionDef` も、引数が無ければ空の呼び出しです。

## 7. ngProjectAs は、解析済みのセレクタとして属性の定数に入る

`ngProjectAs` は外の側の要素に書く属性で、「この要素を、別のセレクタに合うものとして振り分けてほしい」という指定です。コンパイラはこれを、要素の静的な属性を定数に集めるところで拾います。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/const_collection.ts` L168–182 （▶ の行: 169–174, 176, 178）

```ts
168 │     // TODO: Can this be its own phase
169 ▶     if (name === 'ngProjectAs') {
170 ▶       if (
171 ▶         value === null ||
172 ▶         !(value instanceof o.LiteralExpr) ||
173 ▶         value.value == null ||
174 ▶         typeof value.value?.toString() !== 'string'
175 │       ) {
176 ▶         throw Error('ngProjectAs must have a string literal value');
177 │       }
178 ▶       this.projectAs = value.value.toString();
179 │       // TODO: TemplateDefinitionBuilder allows `ngProjectAs` to also be assigned as a literal
180 │       // attribute. Is this sane?
181 │     }
182 │ 
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/const_collection.ts` L244–250 （▶ の行: 244, 246–247, 249–250）

```ts
244 ▶   if (projectAs !== null) {
245 │     // Parse the attribute value into a CssSelectorList. Note that we only take the
246 ▶     // first selector, because we don't support multiple selectors in ngProjectAs.
247 ▶     const parsedR3Selector = core.parseSelectorToR3Selector(projectAs)[0];
248 │     attrArray.push(
249 ▶       o.literal(core.AttributeMarker.ProjectAs),
250 ▶       literalOrArrayLiteral(parsedR3Selector),
```

- **169〜178 行目**：名前が `ngProjectAs` の属性は、値が文字列のリテラルでなければ 176 行目で `Error` を投げ、そうなら 178 行目で `projectAs` に覚えます。属性そのものも、ほかの属性と同じく名前と値の組で配列に入ります（下の記録の定数の先頭の `"ngProjectAs", ""`。だから DOM にも `ngprojectas="…"` が残ります）。
- **247 行目**：`parseSelectorToR3Selector(projectAs)[0]`。**最初の 1 つだけ**を取ります（246 行目のコメント）。`ngProjectAs="[x], [y]"` は `[x]` だけになります。
- **249〜250 行目**：`AttributeMarker.ProjectAs`（値は 5）の印の後ろに、解析済みのセレクタを 1 つ置きます。定数の並びの中での位置（静的な属性のすぐ後ろ）は [compiler-consts-pure](../compiler/14-compiler-consts-pure.md) が読んでいます。

この 2 つの行の、端の場合の記録です。まず `ngProjectAs=""`（空）です。

📄 `demo.ts（コンパイルしたもの）` L1–15 （▶ の行: 13）

```
 1 │ import {Component} from '@angular/core';
 2 │ 
 3 │ @Component({
 4 │   selector: 'app-slot',
 5 │   template: `<ng-content select="[header]" /><ng-content />`,
 6 │ })
 7 │ export class Slot {}
 8 │ 
 9 │ @Component({
10 │   selector: 'app-empty',
11 │   imports: [Slot],
12 │   template: `<app-slot><div ngProjectAs="">x</div></app-slot>`,
13 ▶ })
14 │ export class Empty {}
15 │ 
```

📄 `out/demo.js（記録。class Empty）` L1–8 （▶ の行: 3）

```
1 │ export class Empty {
2 │     static ɵfac = function Empty_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || Empty)(); };
3 ▶     static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: Empty, selectors: [["app-empty"]], decls: 3, vars: 0, consts: [["ngProjectAs", "", 5, undefined]], template: function Empty_Template(rf, ctx) { if (rf & 1) {
4 │             i0.ɵɵelementStart(0, "app-slot")(1, "div", 0);
5 │             i0.ɵɵtext(2, "x");
6 │             i0.ɵɵelementEnd()();
7 │         } }, dependencies: [Slot], encapsulation: 2 });
8 │ }
```

3 行目の定数が `["ngProjectAs", "", 5, undefined]` です。空の文字列は 247 行目で `parseSelectorToR3Selector('')` が空の配列を返し（178 行目の `selector ? … : []`）、その `[0]` の `undefined` が 250 行目でそのまま定数に入ります。診断は 0 件でした。実行時にこの `undefined` がどうなるかは [第 3 回](03-proj-distribute.md)で確かめます。

次に、`[ngProjectAs]="sel"` とバインディングで書いた場合です（記録のスクリプトの最後の場面 `projectAsBound`）。診断と、`program.emit()` の結果です。

📄 `記録（診断と emit）` L1–3

```
1 │ NG8002 Can't bind to 'ngProjectAs' since it isn't a known property of 'div'. Find more at https://next.angular.dev/errors/NG8002
2 │ 
3 │ emit に失敗: ngProjectAs must have a string literal value
```

型検査が NG8002（div にそんなプロパティは無い）を出し、さらに emit は 176 行目の `Error('ngProjectAs must have a string literal value')` で止まりました（記録のスクリプトが例外を受け取って文字列にしたもの）。`ngProjectAs` はコンパイル時に解析するので、実行時に変わる値は書けません。

## 8. 制御フローの中の要素と、拡張診断 NG8011

`@if` の中に書いた要素は、外の側のビューでは `@if` の入れ物（コンテナのノード）の**中**にあります。ホストの直接の子は入れ物のほうです。そのままでは入れ物にはタグ名も属性も無いので、`select` の付いた枠に入りません。コンパイラはこれを埋め合わせています。

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L2059–2081 （▶ の行: 2060–2066, 2068–2069, 2072–2078）

```ts
2059 │ /**
2060 ▶  * With the directive-based control flow users were able to conditionally project content using
2061 ▶  * the `*` syntax. E.g. `<div *ngIf="expr" projectMe></div>` will be projected into
2062 ▶  * `<ng-content select="[projectMe]"/>`, because the attributes and tag name from the `div` are
2063 ▶  * copied to the template via the template creation instruction. With `@if` and `@for` that is
2064 ▶  * not the case, because the conditional is placed *around* elements, rather than *on* them.
2065 ▶  * The result is that content projection won't work in the same way if a user converts from
2066 ▶  * `*ngIf` to `@if`.
2067 │  *
2068 ▶  * This function aims to cover the most common case by doing the same copying when a control flow
2069 ▶  * node has *one and only one* root element or template node.
2070 │  *
2071 │  * This approach comes with some caveats:
2072 ▶  * 1. As soon as any other node is added to the root, the copying behavior won't work anymore.
2073 ▶  *    A diagnostic will be added to flag cases like this and to explain how to work around it.
2074 ▶  * 2. If `preserveWhitespaces` is enabled, it's very likely that indentation will break this
2075 ▶  *    workaround, because it'll include an additional text node as the first child. We can work
2076 ▶  *    around it here, but in a discussion it was decided not to, because the user explicitly opted
2077 ▶  *    into preserving the whitespace and we would have to drop it from the generated code.
2078 ▶  *    The diagnostic mentioned point in #1 will flag such cases to users.
2079 │  *
2080 │  * @returns Tag name to be used for the control flow template.
2081 │  */
```

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L2093–2117 （▶ の行: 2098, 2103–2104, 2108–2110, 2112, 2114）

```ts
2093 │   let root: t.Element | t.Template | null = null;
2094 │ 
2095 │   for (const child of node.children) {
2096 │     // Skip over comment nodes and @let declarations since
2097 │     // it doesn't matter where they end up in the DOM.
2098 ▶     if (child instanceof t.Comment || child instanceof t.LetDeclaration) {
2099 │       continue;
2100 │     }
2101 │ 
2102 │     // We can only infer the tag name/attributes if there's a single root node.
2103 ▶     if (root !== null) {
2104 ▶       return null;
2105 │     }
2106 │ 
2107 │     // Root nodes can only elements or templates with a tag name (e.g. `<div *foo></div>`).
2108 ▶     if (
2109 ▶       (child instanceof t.Element && unit.job.getForeignComponent(child) === null) ||
2110 ▶       (child instanceof t.Template && child.tagName !== null)
2111 │     ) {
2112 ▶       root = child;
2113 │     } else {
2114 ▶       return null;
2115 │     }
2116 │   }
2117 │ 
```

- **2060〜2066 行目**：`*ngIf` の時代は、`<div *ngIf="…" projectMe>` のタグ名と属性が入れ物（`ng-template`）にも写っていたので、入れ物ごと `[projectMe]` の枠に入りました。`@if` は要素の**外側**に書くので、そのままでは写りません。
- **2068〜2069 行目**：だから「ルートの要素がちょうど 1 つ」のときだけ、同じ写しをします。
- **2098 行目**：コメントと `@let` は数えません。**2103〜2105 行目**：2 つ目のルートのノードが見つかった時点で `null`（写さない）です。空白だけのテキストは、`preserveWhitespaces` が既定の false なら構文解析の段階で消えているので数に入りません（2074〜2078 行目の注意書き）。
- **2108〜2114 行目**：ルートは「ほかのコンポーネントの外来の要素でない `Element`」か「タグ名のある `Template`」でなければならず、テキストや `@if` の入れ子なら `null` です。写したあとの実行時の照合は [第 3 回](03-proj-distribute.md)で読みます。

2072〜2073 行目の「診断で知らせる」が NG8011 です。本物の ngtsc にかけた記録です。

📄 `demo.ts（コンパイルしたもの）` L1–27 （▶ の行: 5, 14–16, 18–19）

```
 1 │ import {Component} from '@angular/core';
 2 │ 
 3 │ @Component({
 4 │   selector: 'app-tabs',
 5 ▶   template: `<ng-content select="[tab]" /><ng-content />`,
 6 │ })
 7 │ export class Tabs {}
 8 │ 
 9 │ @Component({
10 │   selector: 'app-uses',
11 │   imports: [Tabs],
12 │   template: `
13 │     <app-tabs>
14 ▶       @if (show) {
15 ▶         <div tab>one</div>
16 ▶         <div tab>two</div>
17 │       }
18 ▶       @if (show) {
19 ▶         <div tab>only</div>
20 │       }
21 │     </app-tabs>
22 │   `,
23 │ })
24 │ export class Uses {
25 │   show = true;
26 │ }
27 │ 
```

📄 `診断（記録。2 件）` L1–17

```
 1 │ NG8011（Warning）demo.ts 15 行目
 2 │ Node matches the "[tab]" slot of the "Tabs" component, but will not be projected into the specific slot because the surrounding @if has more than one node at its root. To project the node in the right slot, you can:
 3 │ 
 4 │ 1. Wrap the content of the @if block in an <ng-container/> that matches the "[tab]" selector.
 5 │ 2. Split the content of the @if block across multiple @if blocks such that each one only has a single projectable node at its root.
 6 │ 3. Remove all content from the @if block, except for the node being projected.
 7 │ 
 8 │ This check can be disabled using the `extendedDiagnostics.checks.controlFlowPreventingContentProjection = "suppress" compiler option.`
 9 │ 
10 │ NG8011（Warning）demo.ts 16 行目
11 │ Node matches the "[tab]" slot of the "Tabs" component, but will not be projected into the specific slot because the surrounding @if has more than one node at its root. To project the node in the right slot, you can:
12 │ 
13 │ 1. Wrap the content of the @if block in an <ng-container/> that matches the "[tab]" selector.
14 │ 2. Split the content of the @if block across multiple @if blocks such that each one only has a single projectable node at its root.
15 │ 3. Remove all content from the @if block, except for the node being projected.
16 │ 
17 │ This check can be disabled using the `extendedDiagnostics.checks.controlFlowPreventingContentProjection = "suppress" compiler option.`
```

📄 `out/demo.js（記録。抜粋）` L1–30 （▶ の行: 1, 19, 21–22）

```
 1 ▶ const _c0 = [[["", "tab", ""]], "*"];
 2 │ const _c1 = ["[tab]", "*"];
 3 │ function Uses_Conditional_1_Template(rf, ctx) { if (rf & 1) {
 4 │     i0.ɵɵelementStart(0, "div", 0);
 5 │     i0.ɵɵtext(1, "one");
 6 │     i0.ɵɵelementEnd();
 7 │     i0.ɵɵelementStart(2, "div", 0);
 8 │     i0.ɵɵtext(3, "two");
 9 │     i0.ɵɵelementEnd();
10 │ } }
11 │ function Uses_Conditional_2_Template(rf, ctx) { if (rf & 1) {
12 │     i0.ɵɵelementStart(0, "div", 0);
13 │     i0.ɵɵtext(1, "only");
14 │     i0.ɵɵelementEnd();
15 │ } }
16 │ export class Uses {
17 │     show = true;
18 │     static ɵfac = function Uses_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || Uses)(); };
19 ▶     static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: Uses, selectors: [["app-uses"]], decls: 3, vars: 2, consts: [["tab", ""]], template: function Uses_Template(rf, ctx) { if (rf & 1) {
20 │             i0.ɵɵelementStart(0, "app-tabs");
21 ▶             i0.ɵɵconditionalCreate(1, Uses_Conditional_1_Template, 4, 0);
22 ▶             i0.ɵɵconditionalCreate(2, Uses_Conditional_2_Template, 2, 0, "div", 0);
23 │             i0.ɵɵelementEnd();
24 │         } if (rf & 2) {
25 │             i0.ɵɵadvance();
26 │             i0.ɵɵconditional(ctx.show ? 1 : -1);
27 │             i0.ɵɵadvance();
28 │             i0.ɵɵconditional(ctx.show ? 2 : -1);
29 │         } }, dependencies: [Tabs], encapsulation: 2 });
30 │ }
```

14〜17 行目の `@if` は `<div tab>` が 2 つあるので、出力の 21 行目の `ɵɵconditionalCreate(1, Uses_Conditional_1_Template, 4, 0)` にタグ名も属性も付かず、この入れ物は `*` の枠に入ります。15 行目と 16 行目の div のそれぞれに、警告（`Warning`）が 1 件ずつ出ました。文は「`[tab]` の枠に合うが、周りの `@if` のルートに 2 つ以上のノードがあるので、その枠には入らない」と 3 つの直し方です。18〜20 行目の `@if` は div が 1 つなので、22 行目に `"div", 0`（タグ名と、1 行目の `_c0` ではなく 19 行目の ɵcmp の `consts[0] = ["tab", ""]`）が付き、警告は出ません。

この診断を出すのは型検査の `TcbControlFlowContentProjectionOp` で、使われているコンポーネントの `ngContentSelectors`（第 1 回の 4 節の .d.ts の一覧）を `SelectorMatcher` にかけて、ルートの要素が「入れ物が無ければ入ったはずの枠」を探します。その本体（content\_projection.ts の 28〜94 行目）は [typecheck-oob](../typecheck/17-typecheck-oob.md) の 4 節が読んでいます。ここでは、どの入れ物を調べるかの条件だけを見ます。

📄 `angular/packages/compiler/src/typecheck/ops/content_projection.ts` L126–156 （▶ の行: 129–130, 142–145, 148–149, 151）

```ts
126 │   private shouldCheck(node: Node & {children: Node[]}): boolean {
127 │     // Skip nodes with less than two children since it's impossible
128 │     // for them to run into the issue that we're checking for.
129 ▶     if (node.children.length < 2) {
130 ▶       return false;
131 │     }
132 │ 
133 │     let hasSeenRootNode = false;
134 │ 
135 │     // Check the number of root nodes while skipping empty text where relevant.
136 │     for (const child of node.children) {
137 │       // Normally `preserveWhitspaces` would have been accounted for during parsing, however
138 │       // in `ngtsc/annotations/component/src/resources.ts#parseExtractedTemplate` we enable
139 │       // `preserveWhitespaces` to preserve the accuracy of source maps diagnostics. This means
140 │       // that we have to account for it here since the presence of text nodes affects the
141 │       // content projection behavior.
142 ▶       if (
143 ▶         !(child instanceof Text) ||
144 ▶         this.tcb.hostPreserveWhitespaces ||
145 ▶         child.value.trim().length > 0
146 │       ) {
147 │         // Content projection will be affected if there's more than one root node.
148 ▶         if (hasSeenRootNode) {
149 ▶           return true;
150 │         }
151 ▶         hasSeenRootNode = true;
152 │       }
153 │     }
154 │ 
155 │     return false;
156 │   }
```

129 行目で子が 2 つ未満なら調べません。136〜153 行目でルートのノードを数え、2 つ目が見つかったら 149 行目で「調べる」です。142〜146 行目は、テキストを空白だけなら数えない（ただしホストが `preserveWhitespaces` なら数える）という、2093〜2117 行目と揃えるための条件です。コンパイラの写し（2098 行目）は `@let` を数えないのに、この関数は `@let` を数えます。新しい本家ではここが直されています（9 節）。

## 9. 最近の変更

`git log --since=2024-01-01` を、この章のファイルで読みました。../angular（8576f161ae4）に入っているものと、新しい本家（angular-main、74961c66242）にだけあるものです。

| 日付・コミット | 題 | この章の行 |
| --- | --- | --- |
| 2024-03-11 8997837f3c5 | refactor(compiler): pass default content to projection instruction（#54854） | 6 節の 435〜439 行目、2 節の既定の内容のビュー |
| 2024-03-14 a600a39d0cf | feat(core): add support for fallback content in ng-content（#54854。v18 の機能） | 実行時の側（第 4 回） |
| 2024-04-24 97eea8d50ea | fix(core): resolve error for multiple component instances that use fallback content（#55478） | 2 節の 520〜521 行目 |
| 2026-10-03 0244a1cb312（angular-main だけ） | fix(compiler): match namespaced root nodes of control flow blocks against ng-content tag selectors（#71163、issue #71162） | `@if { <svg> }` のタグ名が `:svg:svg` のまま写り、`select="svg"` に合わなかった（第 3 回で確かめる） |
| 2026-10-04 439d495aaa5（angular-main だけ） | fix(compiler): ignore `@let` declarations in the control flow content projection diagnostic（issue #71172） | 8 節の 136〜153 行目 |
| 2026-10-04 d9bd68258dc（angular-main だけ） | fix(compiler): check `@boundary` blocks in the control flow content projection diagnostic | 8 節の型検査の対象 |

## 10. 呼び出しの連なり（フェーズの順）

- 👤 `<ng-content select="[footer]">(no footer)</ng-content>` — 中の側のテンプレート
- `htmlAstToRender3Ast` → `t.Content` — render3/r3\_template\_transform.ts — *[compiler-r3-ast](../compiler/07-compiler-r3-ast.md)*
- `ingestContent` — pipeline/src/ingest.ts L512-560 — *既定の内容のビュー → Projection の op → 属性の binding op*
  - `phases[1] removeContentSelectors` — phase\_remove\_content\_selectors.ts L17-31 — *select の binding op を消す*
  - `phases[12] extractAttributes` — phases/attribute\_extraction.ts — *残った属性を集める（compiler-consts-pure）*
  - `phases[26] generateProjectionDefs` — generate\_projection\_def.ts L20-53 — *枠の番号・\_c0・ngContentSelectors・ProjectionDef の op*
  - `phases[60] collectElementConsts` — phases/const\_collection.ts L168-182・L244-250 — *ngProjectAs を ProjectAs の印 + 解析済みに*
  - `phases[72] reify` → `projectionDef`・`projection` — instruction.ts L416-443 — *省ける引数を省く*
- 👤 `型検査（ngtsc）` — compiler-cli
  - `TcbControlFlowContentProjectionOp.shouldCheck` — typecheck/ops/content\_projection.ts L126-156 — *NG8011*

## 11. DEMO：select と ngProjectAs を変えて、出力を比べる

> **🧪 DEMO — このページの上の @angular/compiler で、セレクタの解析済みの形を見る**
>
> 左の欄の 1 行 1 行を `<ng-content select="…" />` にした中の側と、右の欄の 1 行 1 行を `<div ngProjectAs="…">` にした外の側を、それぞれ本物の `CompilerFacadeImpl.compileComponent`（このサイトの 22.1.6。押したときに読み込む）にかけ、評価する直前の JS を受け取ります。「解析済みの形」と「定数」は出力をそのまま読んだもので、「読み方」の列だけはこのページが 5 節のビットの意味で言葉にしたものです。空の行は飛ばし、`""` だけの行は空の文字列として渡します。
>
> 欄を書き換えて「コンパイルする」を押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/proj-compile)

最初の値で確かめられることです（このサイトの本番ビルドで確かめました）。

1. **`a, b`**

   1 つの枠に 2 つのセレクタ（`[["a"], ["b"]]`）。どちらかに合えば、その枠です。
2. **`div:not(.x)`**

   `["div", 9, "x"]`。9 は `NOT | CLASS` です（5 節の 161 行目）。
3. **`[type=Text]`**

   値は `"text"` と小文字になります（実行時も、ノードの属性の値を小文字にしてから比べます。[standalone-directive-registry](../standalone/07-standalone-directive-registry.md)）。`ngContentSelectors` は書いたままの `[type=Text]` です。
4. **`div > p` と `p:first-child`**

   エラーにならず、`[["p"]]` と `[["first-child"]]` になります。前者は p ならどれでも、後者は first-child という名前の要素だけを受ける枠です。
5. **ngProjectAs の `[x], [y]`**

   定数の 4 つ目は `["", "x", ""]` だけで、`[y]` は消えます（7 節の 247 行目）。
6. **ngProjectAs の `""`**

   定数の 4 つ目が `undefined` になります（7 節の記録と同じ）。

## テストと直し方

### 既定の内容の出力を固めているテスト

compliance テスト（入力の .ts をコンパイルし、出力を期待する .js と比べるテスト）の `content_projection/` の「should support fallback content in ng-content」の場面です。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/content_projection/ng_content_fallback.ts` L3–24 （▶ の行: 6, 9–11, 14–18, 20）

```ts
 3 │ @Component({
 4 │   selector: 'test',
 5 │   template: `
 6 ▶     <ng-content select="basic">Basic fallback</ng-content>
 7 │ 
 8 │     <div>
 9 ▶       <ng-content>
10 ▶         <h1>This is {{type}} <strong>content</strong>!</h1>
11 ▶       </ng-content>
12 │     </div>
13 │ 
14 ▶     @if (hasFooter) {
15 ▶       <ng-content select="footer">
16 ▶         Inside control flow
17 ▶       </ng-content>
18 ▶     }
19 │ 
20 ▶     <ng-content select="structural" *ngIf="hasStructural">
21 │       <h2>With a structural directive</h2>
22 │     </ng-content>
23 │   `
24 │ })
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/content_projection/ng_content_fallback.js` L28–38 （▶ の行: 28, 34, 36）

```js
28 ▶ function TestComponent_Conditional_5_ProjectionFallback_0_Template(rf, ctx) {
29 │   if (rf & 1) {
30 │     $r3$.ɵɵtext(0, " Inside control flow ");
31 │   }
32 │ }
33 │ 
34 ▶ function TestComponent_Conditional_5_Template(rf, ctx) {
35 │   if (rf & 1) {
36 ▶     $r3$.ɵɵprojection(0, 2, null, TestComponent_Conditional_5_ProjectionFallback_0_Template, 1, 0);
37 │   }
38 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/content_projection/ng_content_fallback.js` L56–71 （▶ の行: 64–65, 67, 69–70）

```js
56 │ $r3$.ɵɵdefineComponent({
57 │   …
58 │   ngContentSelectors: $_c1$,
59 │   decls: 7,
60 │   vars: 2,
61 │   consts: [[4, "ngIf"]],
62 │   template: function TestComponent_Template(rf, ctx) {
63 │     if (rf & 1) {
64 ▶       $r3$.ɵɵprojectionDef($_c0$);
65 ▶       $r3$.ɵɵprojection(0, 0, null, TestComponent_ProjectionFallback_0_Template, 1, 0);
66 │       $r3$.ɵɵdomElementStart(2, "div");
67 ▶       $r3$.ɵɵprojection(3, 1, null, TestComponent_ProjectionFallback_3_Template, 5, 1);
68 │       $r3$.ɵɵdomElementEnd();
69 ▶       $r3$.ɵɵconditionalCreate(5, TestComponent_Conditional_5_Template, 2, 0);
70 ▶       $r3$.ɵɵdomTemplate(6, TestComponent_ng_content_6_Template, 2, 0, "ng-content", 0);
71 │     }
```

入力は 4 つの枠で、6 行目がテキストの既定の内容、9〜11 行目が要素とバインディングを含む既定の内容、14〜18 行目が `@if` の中の ng-content、20 行目が `*ngIf` を付けた ng-content です。期待する出力では、65・67 行目のルートの 2 つが枠 0・1、`@if` の中（36 行目）が枠 2 で、28 行目の関数名 `TestComponent_Conditional_5_ProjectionFallback_0_Template` のとおり、既定の内容のビューは `@if` のビューの子です。69〜70 行目の `ɵɵconditionalCreate` と `ɵɵdomTemplate` の入れ物の中に、ng-content が入ります。

### ngProjectAs の「最初の 1 つ」を固めているテスト

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/content_projection/ng_project_as_compound_selector.js` L1–25 （▶ の行: 14, 18）

```js
 1 │ // NOTE: the c0 and c1 constants aren't being used in this particular test,
 2 │ // NOTE: but they are used in some of the logic that is folded under the ellipsis.
 3 │ const $_c0$ = [[["", "title", ""]]];
 4 │ const $_c1$ = ["[title]"];
 5 │ // ...
 6 │ export class MyApp {
 7 │   // ...
 8 │   static ɵcmp = /*@__PURE__*/ $r3$.ɵɵdefineComponent({
 9 │     type: MyApp,
10 │     selectors: [["my-app"]],
11 │     standalone: false,
12 │     decls: 2,
13 │     vars: 0,
14 ▶     consts: [["ngProjectAs", "[title],[header]", 5, ["", "title", ""]]],
15 │     template: function MyApp_Template(rf, ctx) {
16 │       if (rf & 1) {
17 │         $r3$.ɵɵelementStart(0, "simple");
18 ▶         $r3$.ɵɵelement(1, "h1", 0);
19 │         $r3$.ɵɵelementEnd();
20 │       }
21 │     },
22 │     dependencies: [SimpleComponent],
23 │     encapsulation: 2
24 │   });
25 │ }
```

14 行目のとおり、`ngProjectAs="[title],[header]"` の定数の 4 つ目は `["", "title", ""]` だけです。18 行目の h1 がこの定数（`0`）を使います。

### NG8011 のテスト

`packages/compiler-cli/test/ngtsc/template_typecheck_spec.ts` の 7185 行目 `describe('control flow content projection diagnostics')` に 17 の `it` があります。7186 行目「should report when an @if block prevents an element from being projected」、7498 行目「should report when preserveWhitespaces may affect content projection」、7536 行目「should not report when there is only one root node」、7629 行目「should allow the content projection diagnostic to be disabled individually」などです。

### 手元で走らせた結果

📄 `ターミナル（~/angular-research/angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/test/compliance/full:full \
  --test_arg=--filter=content_projection --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc --nocache_test_results --test_output=all \
  '--test_arg=--filter=control flow content projection diagnostics'
```

📄 `出力（2026-11-11 に実行。抜粋）`

```
Ran 5 of 612 specs
5 specs, 0 failures
Ran 5 of 612 specs
5 specs, 0 failures
//packages/compiler-cli/test/compliance/full:full                        PASSED in 1.2s
Ran 16 of 6702 specs
16 specs, 0 failures
Ran 16 of 6702 specs
16 specs, 0 failures
Ran 16 of 6702 specs
16 specs, 0 failures
Ran 20 of 6706 specs
20 specs, 0 failures
//packages/compiler-cli/test/ngtsc:ngtsc                                 PASSED in 2.7s
```

compliance は 2 つの shard（分けて並べて走らせる単位）で 5 + 5 = 10 件（`content_projection/TEST_CASES.json` の 10 の場面）、ngtsc は 4 つの shard で 16 + 16 + 16 + 20 = 68 件です。68 は 17 の `it` が 4 つのファイルシステムの真似（`runInEachFileSystem`。Native・OS X・Unix・Windows）で 1 回ずつ走った数です。

### 直すとしたら

- 枠の番号と `ngContentSelectors` の並び（4 節）は `generate_projection_def.ts` の `generateProjectionDefs`。期待する .js は `content_projection/TEST_CASES.json` に場面を足します。並びは projectableNodes の番号（第 5 回）に直結するので、変えると利用者のコードの意味が変わります。
- `ngProjectAs` の定数（7 節）は `const_collection.ts` の `ElementAttributes.add` と `serializeAttributes`。空の値は 247 行目の `[0]` が `undefined` になるところです。テストは `content_projection/` の `ng_project_as_*.ts` の並びに場面を足し、実行時の振る舞いは `packages/core/test/acceptance/content_spec.ts` に足します（第 3 回）。
- 制御フローの写し（8 節）は `ingest.ts` の `ingestControlFlowInsertionPoint`、診断は `typecheck/ops/content_projection.ts` の `shouldCheck`。2 つの数え方を揃えておく必要があります（angular-main の 439d495aaa5 がその例）。診断のテストは `template_typecheck_spec.ts` の 7185 行目の describe に足します。

## 聞かれそうな質問

**Q. select の値は、いつ解析されますか？**

コンパイル時です。`generateProjectionDefs` が 42 行目で `parseSelectorToR3Selector` を呼び、解析済みの配列を定数にします（4 節・5 節）。実行時はその配列を読むだけで、セレクタの文字列を解析しません。

**Q. &lt;ng-content select="…"&gt; の select は、DOM の属性として残りますか？**

残りません。ingestContent が 541〜558 行目でいったん binding op にしたあと、フェーズの 2 番目の `removeContentSelectors` が 22〜25 行目で消します（3 節）。ほかの属性は `ɵɵprojection` の 3 つ目の引数に残ります。

**Q. \* の枠は何番になりますか？**

並び順のとおりです。`generateProjectionDefs` の 32 行目は `'*'` も区別せずに番号を振ります。ただし数えるのはビュー（unit）ごとなので、`@if` の中の ng-content はルートの ng-content より後ろの番号になります（4 節の記録）。

**Q. ngProjectAs="\[a\], \[b\]" と書くと、どちらでも振り分けられますか？**

いいえ。const\_collection.ts の 247 行目が最初の 1 つ（`[a]`）だけを定数にします。compliance の `ng_project_as_compound_selector.js` の 14 行目がそれを固めています。

**Q. @if の中の要素が、select の枠に入らないのはなぜですか？**

ホストの直接の子は `@if` の入れ物で、要素はその中にあるからです。コンパイラはルートの要素が 1 つだけのときにタグ名と属性を入れ物に写します（ingest.ts の 2068〜2069 行目・2103〜2105 行目）が、2 つ以上なら写さず、入れ物ごと `*` の枠に入ります。型検査が NG8011 の警告でそれを知らせます（8 節の記録）。

**Q. 既定の内容は、どうやってテンプレート関数になりますか？**

ingestContent が 529〜530 行目で新しい埋め込みビューに取り込み、そのビューが `…_ProjectionFallback_N_Template` という関数になります。名前・decls・vars は `projection` の命令の 439 行目で引数に足されます（2 節・6 節）。

## 読み終えて

- `<ng-content>` は `ingestContent` で `Projection` の op になる。既定の内容は先に別のビューにし、`select` の属性は 2 番目のフェーズで消す。
- 枠の番号は `generateProjectionDefs` がビューごとに 0 から振る。`*` も同じ扱い。`@if` の中の ng-content は後ろに回り、.d.ts の並びと違うことがある。
- セレクタは `parseSelectorToR3Selector` で `[タグ名, 属性, 値, …, CLASS, …, NOT|…]` の配列になる。`>` や疑似クラスはエラーにならず、別のセレクタになる。
- `ngProjectAs` は最初の 1 つだけを解析して、属性の定数の `ProjectAs`（5）の後ろに置く。空なら `undefined`、バインディングなら emit が止まる。
- `@if` などのルートの要素が 1 つだけなら、タグ名と属性が入れ物に写る。2 つ以上なら写らず、NG8011 の警告になる。

---

← 前: [1 行の ng-content が生むもの：投影の全体像](01-proj-what-declared.md)  
次: [振り分け：ɵɵprojectionDef がホストの子を枠に分けるまで](03-proj-distribute.md) →
