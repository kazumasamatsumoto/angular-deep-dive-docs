[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 8 回 / 全 20 回

# 要素・DOM のスキーマ・ホストバインディング

> TcbElementOp が document.createElement で要素の型を作る行、DomSchemaChecker が知らない要素や属性を見つける仕組み（CUSTOM\_ELEMENTS\_SCHEMA と NO\_ERRORS\_SCHEMA）、checkTypeOfDomBindings。ホストバインディングを型チェックする host\_bindings.ts と、TCB の中の if (true) と別のブロック。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-elements-dom)

---

テンプレートの `<div>` や `<input>` は、TCB の中で `document.createElement("input")` になります。一方で「`unknown-el` is not a known element」や「Can't bind to 'foo'」のエラーは TCB からではなく、**DomSchemaChecker という別の窓口**から出ます。この章では、要素の op・スキーマの op・どのディレクティブも受けない \[prop\] の扱い（checkTypeOfDomBindings）、そしてコンポーネントの `host: {…}` と `@HostBinding` / `@HostListener` を TCB の 2 つ目の if ブロックで型チェックする仕組みを、行を指して読みます。

読む対象は `packages/compiler/src/typecheck/` の `schema.ts`・`host_bindings.ts`・`ops/schema.ts`・`ops/host.ts`・`ops/selectorless.ts`・`ops/scope.ts` の一部、compiler-cli の `typecheck/src/dom.ts` の残り・`annotations/component/src/handler.ts` の 1 か所・`scope/src/typecheck.ts` です。

1. [1. 全体像](01-typecheck-overview.md)
2. [2. 設定](02-typecheck-config.md)
3. [3. TCB の置き場所](03-typecheck-context.md)
4. [4. 派生プログラム](04-typecheck-program-driver.md)
5. [5. Environment](05-typecheck-environment.md)
6. [6. Scope と TcbOp](06-typecheck-scope.md)
7. [7. 式](07-typecheck-expressions.md)
8. **8. 要素と DOM**（この章）
9. [9. 型コンストラクタ](09-typecheck-type-constructor.md)
10. [10. 入力](10-typecheck-inputs.md)
11. [11. 出力とイベント](11-typecheck-outputs-events.md)
12. [12. 双方向](12-typecheck-two-way.md)
13. [13. 制御フロー](13-typecheck-control-flow.md)
14. [14. ng-template のガード](14-typecheck-template-guards.md)
15. [15. 参照と pipe](15-typecheck-refs-pipes.md)
16. [16. 診断の対応付け](16-typecheck-diagnostics-mapping.md)
17. [17. 帯域外の診断](17-typecheck-oob.md)
18. [18. 拡張診断](18-typecheck-extended.md)
19. [19. TemplateTypeChecker](19-typecheck-template-type-checker.md)
20. [20. issue と PR を読む](20-typecheck-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `TcbElementOp` の本体（`var _t1 = document.createElement("input")` を書き、optional である）は [compiler-typecheck](../compiler/17-compiler-typecheck.md) の 5 節、compiler-cli の `RegistryDomSchemaChecker.checkElement` / `checkTemplateElementProperty` と schemas の届き方は [ngmodule-schemas](../ngmodule/16-ngmodule-schemas.md) の 3 節で引用しました。この章はその間をつなぎます。

## 1. 要素は「求められたときだけ」宣言される

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L445–455 （▶ の行: 447–448, 451, 453）

```ts
445 │   it('should only generate code for DOM elements that are actually referenced', () => {
446 │     const TEMPLATE = `
447 ▶       <div></div>
448 ▶       <button #me (click)="handle(me)"></button>
449 │     `;
450 │     const block = tcb(TEMPLATE);
451 ▶     expect(block).not.toContain('"div"');
452 │     expect(block).toContain(
453 ▶       'var _t1 = document.createElement("button"); ' + 'var _t2 = _t1; ' + '_t1.addEventListener',
454 │     );
455 │   });
```

447 行目の `<div>` は誰も参照しないので、451 行目のとおり TCB に `"div"` は出ません。448 行目の `<button #me (click)="handle(me)">` は、#me の op と (click) の op が要素を求めるので、453 行目の `var _t1 = document.createElement("button")` が書かれます。`TcbElementOp` が optional で、resolve から求められたときだけ実行される仕組みは[第 6 回](06-typecheck-scope.md)の 4 節です。

`document.createElement("button")` の型は、TypeScript の lib.dom.d.ts にある `createElement` の重載（タグ名の文字列リテラルから `HTMLElementTagNameMap` を引く）で `HTMLButtonElement` になります。知らないタグ名なら `HTMLElement` です。**要素の型を決めているのは Angular ではなく lib.dom.d.ts**です。

### selectorless のコンポーネントの要素

📄 `angular/packages/compiler/src/typecheck/ops/selectorless.ts` L15–47 （▶ の行: 18–19, 28, 41）

```ts
15 │ // TODO(crisbeto): the logic for determining the fallback tag name of a Component node is
16 │ // still being designed. For now fall back to `ng-component`, but this will have to be
17 │ // revisited once the design is finalized.
18 ▶ export function getComponentTagName(node: Component): string {
19 ▶   return node.tagName || 'ng-component';
20 │ }
21 │ 
22 │ /**
23 │  * A `TcbOp` which creates an expression for a native DOM element from a `Component`.
24 │  *
25 │  * Executing this operation returns a reference to the element variable.
26 │  */
27 │ export class TcbComponentNodeOp extends TcbOp {
28 ▶   override readonly optional = true;
29 │ 
30 │   constructor(
31 │     private tcb: Context,
32 │     private scope: Scope,
33 │     private component: Component,
34 │   ) {
35 │     super();
36 │   }
37 │ 
38 │   override execute(): TcbExpr {
39 │     const id = this.tcb.allocateId();
40 │     const initializer = new TcbExpr(
41 ▶       `document.createElement("${getComponentTagName(this.component)}")`,
42 │     );
43 │     initializer.addParseSpanInfo(this.component.startSourceSpan || this.component.sourceSpan);
44 │     this.scope.addStatement(new TcbExpr(`var ${id} = ${initializer.print()}`));
45 │     return new TcbExpr(id);
46 │   }
47 │ }
```

selectorless（セレクタを書かず、クラス名でコンポーネントを置く書き方。[standalone-selectorless](../standalone/13-standalone-selectorless.md)）のコンポーネントの要素も、28 行目で optional、41 行目で `document.createElement` です。タグ名は 19 行目、書かれていなければ `ng-component`（15〜17 行目のコメントのとおり、まだ設計中）です。

## 2. DomSchemaChecker：TCB ではなく窓口に記録する

📄 `angular/packages/compiler/src/typecheck/schema.ts` L14–47 （▶ の行: 18–20, 28, 40, 43–45）

```ts
14 │ /**
15 │  * Checks every non-Angular element/property processed in a template and potentially produces
16 │  * diagnostics related to improper usage.
17 │  *
18 ▶  * A `DomSchemaChecker`'s job is to check DOM nodes and their attributes written used in templates
19 ▶  * and produce diagnostics if the nodes don't conform to the DOM specification. It acts as a
20 ▶  * collector for these diagnostics, and can be queried later to retrieve the list of any that have
21 │  * been generated.
22 │  */
23 │ export interface DomSchemaChecker<T> {
24 │   /**
25 │    * Get the diagnostics that have been generated via `checkElement` and `checkProperty` calls
26 │    * thus far.
27 │    */
28 ▶   readonly diagnostics: ReadonlyArray<T>;
29 │ 
30 │   /**
31 │    * Check a non-Angular element and record any diagnostics about it.
32 │    *
33 │    * @param id Template ID, suitable for resolution with a `TcbSourceResolver`.
34 │    * @param tagName Tag name of the element in question
35 │    * @param sourceSpanForDiagnostics Span that should be used when reporting diagnostics.
36 │    * @param schemas any active schemas for the template, which might affect the validity of the
37 │    * element.
38 │    * @param hostIsStandalone Indicates whether the element's host is a standalone component.
39 │    */
40 ▶   checkElement(
41 │     id: TypeCheckId,
42 │     tagName: string,
43 ▶     sourceSpanForDiagnostics: ParseSourceSpan,
44 ▶     schemas: SchemaMetadata[],
45 ▶     hostIsStandalone: boolean,
46 │   ): void;
47 │ 
```
*compiler/src/typecheck/schema.ts。TcbEnvironment（第 5 回）と同じく、compiler パッケージが知っているのはインタフェースだけ*

18〜21 行目、`DomSchemaChecker` は「テンプレートの DOM のノードと属性を調べ、DOM の仕様に合わなければ診断を作る」係で、28 行目の `diagnostics` に溜めます。40〜46 行目の `checkElement` は要素名と schemas を、続く `checkTemplateElementProperty` はプロパティ名を受け取ります。ホストの要素用の `checkHostElementProperty` もあります（7 節）。ngtsc では compiler-cli の `RegistryDomSchemaChecker` がこれを実装し、`DomElementSchemaRegistry`（ブラウザの IDL から作った要素とプロパティの表）を引きます。

📄 `angular/packages/compiler/src/typecheck/ops/schema.ts` L18–41 （▶ の行: 21–23, 25–26, 32–33, 38–39）

```ts
18 │ /**
19 │  * A `TcbOp` which feeds elements and unclaimed properties to the `DomSchemaChecker`.
20 │  *
21 ▶  * The DOM schema is not checked via TCB code generation. Instead, the `DomSchemaChecker` ingests
22 ▶  * elements and property bindings and accumulates synthetic `ts.Diagnostic`s out-of-band. These are
23 ▶  * later merged with the diagnostics generated from the TCB.
24 │  *
25 ▶  * For convenience, the TCB iteration of the template is used to drive the `DomSchemaChecker` via
26 ▶  * the `TcbDomSchemaCheckerOp`.
27 │  */
28 │ export class TcbDomSchemaCheckerOp extends TcbOp {
29 │   constructor(
30 │     private tcb: Context,
31 │     private element: Element | Component | HostElement,
32 ▶     private checkElement: boolean,
33 ▶     private claimedInputs: Set<string> | null,
34 │   ) {
35 │     super();
36 │   }
37 │ 
38 ▶   override get optional() {
39 ▶     return false;
40 │   }
41 │ 
```

21〜23 行目がこの章のいちばん大事な点です。「DOM のスキーマは TCB のコードを作って調べるのではない。`DomSchemaChecker` が要素とプロパティを受け取って、帯域外で ts.Diagnostic を溜め、あとで TCB の診断と混ぜる」。25〜26 行目、それでも op にしているのは、テンプレートを TCB のために 1 回なめるついでに呼ぶためです。38〜40 行目で optional ではない（必ず実行する）ことに注意してください。32 行目の `checkElement` は「要素名を調べるか」、33 行目の `claimedInputs` は「ディレクティブが受け取った入力の名前」です。`execute` の本体は [ngmodule-schemas](../ngmodule/16-ngmodule-schemas.md) 3 節で引用しました。要素名を調べたあと、\[prop\] ごとに、ディレクティブが受けたものと `style`・`class` を除いて `checkTemplateElementProperty` を呼び、文は何も足さず `null` を返します。

### いつ要素名を調べるか

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L656–674 （▶ の行: 660–662, 666–672）

```ts
656 │     // After expanding the directives, we might need to queue an operation to check any unclaimed
657 │     // inputs.
658 │     if (node instanceof Element) {
659 │       // Go through the directives and remove any inputs that it claims from `elementInputs`.
660 ▶       for (const dir of directives) {
661 ▶         for (const propertyName of dir.inputs.propertyNames) {
662 ▶           claimedInputs.add(propertyName);
663 │         }
664 │       }
665 │ 
666 ▶       this.opQueue.push(new TcbUnclaimedInputsOp(this.tcb, this, node.inputs, node, claimedInputs));
667 ▶       // If there are no directives which match this element, then it's a "plain" DOM element (or a
668 ▶       // web component), and should be checked against the DOM schema. If any directives match,
669 ▶       // we must assume that the element could be custom (either a component, or a directive like
670 ▶       // <router-outlet>) and shouldn't validate the element name itself.
671 ▶       const checkElement = directives.length === 0;
672 ▶       this.opQueue.push(new TcbDomSchemaCheckerOp(this.tcb, node, checkElement, claimedInputs));
673 │     }
674 │   }
```

1. **660〜664 行目：ディレクティブが受ける入力を集める**

   要素に付いたディレクティブの入力の名前を `claimedInputs` に入れます。
2. **666 行目：受け手の無い \[prop\] の op**

   `TcbUnclaimedInputsOp`（3 節）を積みます。
3. **667〜672 行目：ディレクティブが 1 つでもあれば要素名は調べない**

   「ディレクティブが 1 つも合わなければ素の DOM の要素（か Web Component）なのでスキーマで調べる。何か合えば、コンポーネントや `<router-outlet>` のようなディレクティブかもしれないので、要素名は調べない」（667〜670 行目のコメント）。671 行目の `directives.length === 0` がその判定です。ディレクティブが 1 つも無い要素は、この関数の前半で同じ 2 つの op を `checkElement` を真にして積みます。

だから `<app-non-existing [ngClass]="{}">` のように、知らない要素に `NgClass` が付くと「not a known element」が出ません。閉じた #59920 はこの報告で、コメントで「今の動きは意図したもの」と、この判定の行（当時の type\_check\_block.ts）が示されています。プロパティの方は、ディレクティブが受けない `[foo]` なら引き続き調べます（デモの「コンポーネントが付いた要素」）。

### 中身を検査しないテンプレートでも、スキーマは調べる

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L878–912 （▶ の行: 880, 882, 891–893, 895, 902–903, 905, 910）

```ts
878 │       if (node instanceof Element) {
879 │         const claimedInputs = new Set<string>();
880 ▶         let directives = this.tcb.boundTarget.getDirectivesOfNode(node);
881 │ 
882 ▶         for (const dirNode of node.directives) {
883 │           const directiveResults = this.tcb.boundTarget.getDirectivesOfNode(dirNode);
884 │ 
885 │           if (directiveResults !== null && directiveResults.length > 0) {
886 │             directives ??= [];
887 │             directives.push(...directiveResults);
888 │           }
889 │         }
890 │ 
891 ▶         let hasDirectives: boolean;
892 ▶         if (directives === null || directives.length === 0) {
893 ▶           hasDirectives = false;
894 │         } else {
895 ▶           hasDirectives = true;
896 │           for (const dir of directives) {
897 │             for (const propertyName of dir.inputs.propertyNames) {
898 │               claimedInputs.add(propertyName);
899 │             }
900 │           }
901 │         }
902 ▶         const isForeign = this.tcb.boundTarget.getForeignComponent(node) !== null;
903 ▶         if (!isForeign) {
904 │           this.opQueue.push(
905 ▶             new TcbDomSchemaCheckerOp(this.tcb, node, !hasDirectives, claimedInputs),
906 │           );
907 │         }
908 │       }
909 │ 
910 ▶       this.appendDeepSchemaChecks(node.children);
911 │     }
912 │   }
```

checkTemplateBodies が偽で `<ng-template>` の中身の TCB を作らないときでも、alwaysCheckSchemaInTemplateBodies が真なら、appendNode の `<ng-template>` の分岐が子のノードを渡してこの `appendDeepSchemaChecks` を呼びます。中の要素を 910 行目で再帰的にたどり、要素ごとに 905 行目で `TcbDomSchemaCheckerOp` だけを積みます。882〜889 行目で selectorless のディレクティブも足し、891〜901 行目の考え方は上と同じ（ディレクティブがあれば要素名は調べない）です。902〜903 行目、外部の（Angular 以外の）コンポーネントとして合った要素は調べません。

## 3. 受け手の無い \[prop\]：checkTypeOfDomBindings

`<div [title]="name">` の `[title]` はどのディレクティブも受けません。この \[prop\] を TCB に書くのが `TcbUnclaimedInputsOp`（ops/inputs.ts。本体は[第 10 回](10-typecheck-inputs.md)）です。デモで確かめると、TCB には `((this).name);` と**式の文だけ**が残り、要素への代入は書かれません。checkTypeOfDomBindings が偽だからです。

ngtsc の `getTypeCheckingConfig` は、strictTemplates が真でも偽でも `checkTypeOfDomBindings: false` を入れ、その上に「full template type-checking でも、DOM のバインディングの検査はまだ十分ではない」というコメントがあります（[compiler-typecheck](../compiler/17-compiler-typecheck.md) 8 節で引用した範囲）。tsconfig から真にするオプションもありません（compiler-cli の src 以下を grep して、真にしている所は spec だけ）。だから `[title]="123"` のような型の違いは、今の ngtsc では TypeScript のエラーになりません。スキーマの検査（`title` というプロパティがあるか）だけが 2 節の op で行われます。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1016–1024 （▶ の行: 1016, 1018–1019, 1021）

```ts
1016 ▶   describe('experimental DOM checking via lib.dom.d.ts', () => {
1017 │     it('should translate unclaimed bindings to their property equivalent', () => {
1018 ▶       const TEMPLATE = `<label [for]="'test'"></label>`;
1019 ▶       const CONFIG = {...ALL_ENABLED_CONFIG, checkTypeOfDomBindings: true};
1020 │       expect(tcb(TEMPLATE, /* declarations */ undefined, CONFIG)).toContain(
1021 ▶         '_t1["htmlFor"] = ("test");',
1022 │       );
1023 │     });
1024 │   });
```

spec の describe の名前が「experimental DOM checking via lib.dom.d.ts」です。1019 行目で真にすると、1021 行目のように `_t1["htmlFor"] = ("test");` と**要素のプロパティへの代入**になり、lib.dom.d.ts の `HTMLLabelElement.htmlFor: string` と型が比べられます。`for` が `htmlFor` になるのは、属性名を DOM のプロパティ名に写す `getMappedPropName`（`class` → `className` など）を通すからです。要素を代入の左辺に使うので、このときは要素の op も実行されます。

## 4. ホストバインディング：host\_bindings.ts の createHostElement

ここからはテンプレートではなく、コンポーネント（とディレクティブ）の `host: {…}`・`@HostBinding`・`@HostListener` です。compiler パッケージの host\_bindings.ts が、これらを「ホストの要素」を表す 1 つの R3 AST のノード（`HostElement`）にまとめます。

📄 `angular/packages/compiler/src/typecheck/host_bindings.ts` L93–128 （▶ の行: 99–100, 102–104, 110–111, 113, 116–117, 120, 122, 126–127）

```ts
 93 │ /**
 94 │  * Creates an AST node that represents the host element of a directive.
 95 │  * Can return null if there are no valid bindings to be checked.
 96 │  * @param meta Metadata used to construct the host element.
 97 │  */
 98 │ export function createHostElement(
 99 ▶   type: 'component' | 'directive',
100 ▶   selector: string | null,
101 │   nameSpan: ParseSourceSpan,
102 ▶   hostObjectLiteralBindings: HostObjectLiteralBinding[],
103 ▶   hostBindingDecorators: HostBindingDecorator[],
104 ▶   hostListenerDecorators: HostListenerDecorator[],
105 │ ): HostElement | null {
106 │   const bindings: BoundAttribute[] = [];
107 │   const listeners: BoundEvent[] = [];
108 │   let parser: BindingParser | null = null;
109 │ 
110 ▶   for (const binding of hostObjectLiteralBindings) {
111 ▶     // We only support type checking of static bindings.
112 │     parser ??= makeBindingParser();
113 ▶     createNodeFromHostLiteralProperty(binding, parser, bindings, listeners);
114 │   }
115 │ 
116 ▶   for (const decorator of hostBindingDecorators) {
117 ▶     createNodeFromBindingDecorator(decorator, bindings);
118 │   }
119 │ 
120 ▶   for (const decorator of hostListenerDecorators) {
121 │     parser ??= makeBindingParser();
122 ▶     createNodeFromListenerDecorator(decorator, parser, listeners);
123 │   }
124 │ 
125 │   // The element will be a no-op if there are no bindings.
126 ▶   if (bindings.length === 0 && listeners.length === 0) {
127 ▶     return null;
128 │   }
```

📄 `angular/packages/compiler/src/typecheck/host_bindings.ts` L130–161 （▶ の行: 132–133, 136–137, 144–145, 148, 155, 160）

```ts
130 │   const tagNames: string[] = [];
131 │ 
132 ▶   if (selector !== null) {
133 ▶     const parts = CssSelector.parse(selector);
134 │ 
135 │     for (const part of parts) {
136 ▶       if (part.element !== null) {
137 ▶         tagNames.push(part.element);
138 │       }
139 │     }
140 │   }
141 │ 
142 │   // If none of the selectors have a tag name, fall back to `ng-component`/`ng-directive`.
143 │   // This is how the runtime handles components without tag names as well.
144 ▶   if (tagNames.length === 0) {
145 ▶     tagNames.push(`ng-${type}`);
146 │   }
147 │ 
148 ▶   return new HostElement(tagNames, bindings, listeners, nameSpan);
149 │ }
150 │ 
151 │ /**
152 │  * Creates an AST node that can be used as a guard in `if` statements to distinguish TypeScript
153 │  * nodes used for checking host bindings from ones used for checking templates.
154 │  */
155 ▶ export function createHostBindingsBlockGuard(): string {
156 │   // Note that the comment text is quite generic. This doesn't really matter, because it is
157 │   // used only inside a TCB and there's no way for users to produce a comment there.
158 │   // `true /*hostBindingsBlockGuard*/`.
159 │   // Wrap the expression in parentheses to ensure that the comment is attached to the correct node.
160 ▶   return `(true /*${HOST_BINDING_GUARD_COMMENT_TEXT}*/)`;
161 │ }
```

1. **102〜104 行目：3 つの入力**

   `host` のオブジェクトリテラルの各項目、`@HostBinding` の付いたメンバー、`@HostListener` の付いたメンバー。どれも ts のノードではなく、文字列と位置だけの形（ファイルの先頭の `HostObjectLiteralBinding` などの型）で渡されます。
2. **110〜114 行目：host のリテラル**

   111 行目のコメントのとおり**静的な（文字列で書かれた）バインディングだけ**を型チェックします（5 節）。
3. **116〜123 行目：デコレータ**

   それぞれ 5 節の関数で `BoundAttribute` / `BoundEvent` にします。
4. **126〜128 行目：何も無ければ null**

   バインディングもリスナーも無いコンポーネントには、ホストの if ブロックを作りません。
5. **132〜146 行目：タグ名はセレクタから**

   `CssSelector.parse` で要素名の部分を集めます。`selector: 'button[foo]'` なら `button`、セレクタに要素名が無ければ 145 行目で `ng-component` / `ng-directive`（実行時と同じ）。複数ありえるので配列です。
6. **155〜161 行目：if の条件の印**

   `(true /*hostBindingsBlockGuard*/)`。テンプレートの `if (true)` と同じ値ですが、コメントで見分けられます。診断をソースに戻すとき、この印のある if の中ならホストの側だと分かります（tcb\_util.ts の `isInHostBindingTcb`。[第 16 回](16-typecheck-diagnostics-mapping.md)）。

## 5. host のリテラルとデコレータを AST にする

📄 `angular/packages/compiler/src/typecheck/host_bindings.ts` L180–199 （▶ の行: 182–183, 186–188, 194–195, 198）

```ts
180 │   const {key, value, sourceSpan} = binding;
181 │ 
182 ▶   if (key.kind !== 'string' || value.kind !== 'string') {
183 ▶     return;
184 │   }
185 │ 
186 ▶   if (key.text.startsWith('[') && key.text.endsWith(']')) {
187 ▶     const {attrName, type} = inferBoundAttribute(key.text.slice(1, -1));
188 ▶     const ast = parser.parseBinding(
189 │       value.text,
190 │       true,
191 │       value.sourceSpan,
192 │       value.sourceSpan.start.offset,
193 │     );
194 ▶     if (ast.errors.length > 0) {
195 ▶       return; // See TODO above.
196 │     }
197 │ 
198 ▶     fixupSpans(ast, value);
199 │     bindings.push(
```

📄 `angular/packages/compiler/src/typecheck/host_bindings.ts` L212–233 （▶ の行: 212, 215–217, 226–227, 231）

```ts
212 ▶   } else if (key.text.startsWith('(') && key.text.endsWith(')')) {
213 │     const events: ParsedEvent[] = [];
214 │ 
215 ▶     parser.parseEvent(
216 ▶       key.text.slice(1, -1),
217 ▶       value.text,
218 │       false,
219 │       sourceSpan,
220 │       value.sourceSpan,
221 │       [],
222 │       events,
223 │       key.sourceSpan,
224 │     );
225 │ 
226 ▶     if (events.length === 0 || events[0].handler.errors.length > 0) {
227 ▶       return; // See TODO above.
228 │     }
229 │ 
230 │     fixupSpans(events[0].handler, value);
231 ▶     listeners.push(BoundEvent.fromParsedEvent(events[0]));
232 │   }
233 │ }
```

182〜184 行目、キーも値も文字列リテラルでなければ黙って飛ばします（`host: {'[title]': someConst}` のような値は型チェックされない）。186 行目、`[…]` ならバインディングのパーサ（[compiler-binding-parser](../compiler/06-compiler-binding-parser.md)）で式にし、187 行目で `attr.`・`class.`・`style.` などの前置きから種類を決めます。212 行目、`(…)` ならイベントとしてパースし、231 行目で `BoundEvent` にします。`(window:resize)` の `window:` はこのパースで target として分けられます。194〜196 行目と 226〜228 行目、パースエラーも黙って飛ばします（関数の先頭の TODO コメント：エラーはハンドラが別にパースするときに報告される）。

📄 `angular/packages/compiler/src/typecheck/host_bindings.ts` L374–409 （▶ の行: 374, 381, 383, 388–389, 393, 397–398, 401–402）

```ts
374 ▶   const callNode = new Call(dummySpan, nameSpan, receiver, argNodes, dummySpan);
375 │   const eventNameNode = decorator.eventName;
376 │   let type: ParsedEventType;
377 │   let eventName: string;
378 │   let phase: string | null;
379 │   let target: string | null;
380 │ 
381 ▶   if (eventNameNode.text.startsWith('@')) {
382 │     const parsedName = parser.parseLegacyAnimationEventName(eventNameNode.text);
383 ▶     type = ParsedEventType.LegacyAnimation;
384 │     eventName = parsedName.eventName;
385 │     phase = parsedName.phase;
386 │     target = null;
387 │   } else {
388 ▶     const parsedName = parser.parseEventListenerName(eventNameNode.text);
389 ▶     type = parsedName.eventName.startsWith('animate.')
390 │       ? ParsedEventType.Animation
391 │       : ParsedEventType.Regular;
392 │     eventName = parsedName.eventName;
393 ▶     target = parsedName.target;
394 │     phase = null;
395 │   }
396 │ 
397 ▶   listeners.push(
398 ▶     new BoundEvent(
399 │       eventName,
400 │       type,
401 ▶       callNode,
402 ▶       target,
403 │       phase,
404 │       decorator.decoratorSpan,
405 │       decorator.decoratorSpan,
406 │       eventNameNode.sourceSpan,
407 │     ),
408 │   );
409 │ }
```

`@HostListener('document:click', ['$event']) handle(e)` は、パーサに文字列を渡すのではなく AST を手で組み立てます（関数の中のコメント：パーサに通すと位置をソースに戻しにくいため）。374 行目の `callNode` は `this.handle($event)` に当たる呼び出しで、その手前で、引数の `'$event'` のような文字列は式としてパースし、文字列でない引数は `$any(0)` にしています。388 行目で `document:click` を名前と target に分け、397〜408 行目で `BoundEvent` を作ります。402 行目の `target` が `'document'` です。

## 6. ホストの Scope：TcbHostElementOp と、消える (event)

generateTypeCheckBlock は、テンプレートの Scope のあとで、`boundTarget.target.host` があればホスト用の Scope を `Scope.forNodes(tcb, null, host.node, null, null)` で作り、4 節の印の if で包みます（[compiler-typecheck](../compiler/17-compiler-typecheck.md) 3 節で引用）。forNodes は `HostElement` を受け取ると、それ自身を appendNode します（[第 6 回](06-typecheck-scope.md) 3 節）。

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L1019–1040 （▶ の行: 1020–1021, 1023, 1027–1028, 1035–1037, 1039）

```ts
1019 │   private appendHostElement(node: HostElement): void {
1020 ▶     const opIndex = this.opQueue.push(new TcbHostElementOp(this.tcb, this, node)) - 1;
1021 ▶     const directives = this.tcb.boundTarget.getDirectivesOfNode(node);
1022 │ 
1023 ▶     if (directives !== null && directives.length > 0) {
1024 │       const directiveOpMap = new Map<TcbDirectiveMetadata, number>();
1025 │ 
1026 │       for (const directive of directives) {
1027 ▶         const directiveOp = this.getDirectiveOp(directive, node, null);
1028 ▶         directiveOpMap.set(directive, this.opQueue.push(directiveOp) - 1);
1029 │       }
1030 │ 
1031 │       this.directiveOpMap.set(node, directiveOpMap);
1032 │     }
1033 │ 
1034 │     this.hostElementOpMap.set(node, opIndex);
1035 ▶     this.opQueue.push(
1036 ▶       new TcbUnclaimedInputsOp(this.tcb, this, node.bindings, node, null),
1037 ▶       new TcbDomSchemaCheckerOp(this.tcb, node, false, null),
1038 │     );
1039 ▶     this.appendOutputsOfElementLikeNode(node, null, node.listeners);
1040 │   }
```

1. **1020 行目：ホストの要素の op**

   下の `TcbHostElementOp`。optional です。
2. **1021〜1032 行目：ホストのディレクティブの型**

   ホストに付くディレクティブ（コンポーネント自身と hostDirectives。8 節）ごとに、型を作る op を積みます（[第 9 回](09-typecheck-type-constructor.md)）。
3. **1035〜1038 行目：\[prop\] とスキーマ**

   ホストの `[prop]` はすべて受け手の無い入力として `TcbUnclaimedInputsOp` に（3 節と同じく式の文になる）、スキーマの op は `checkElement` を **false** にして積みます（要素名は調べず、\[prop\] だけを 7 節の `checkHostElementProperty` で調べる）。
4. **1039 行目：(event)**

   リスナーは、テンプレートの要素と同じ `appendOutputsOfElementLikeNode` に渡します。次の引用です。

📄 `angular/packages/compiler/src/typecheck/ops/host.ts` L15–46 （▶ の行: 21, 35–38, 41）

```ts
15 │ /**
16 │  * A `TcbOp` which creates an expression for a the host element of a directive.
17 │  *
18 │  * Executing this operation returns a reference to the element variable.
19 │  */
20 │ export class TcbHostElementOp extends TcbOp {
21 ▶   override readonly optional = true;
22 │ 
23 │   constructor(
24 │     private tcb: Context,
25 │     private scope: Scope,
26 │     private element: HostElement,
27 │   ) {
28 │     super();
29 │   }
30 │ 
31 │   override execute(): TcbExpr {
32 │     const id = this.tcb.allocateId();
33 │     let tagNames: string;
34 │ 
35 ▶     if (this.element.tagNames.length === 1) {
36 ▶       tagNames = `"${this.element.tagNames[0]}"`;
37 ▶     } else {
38 ▶       tagNames = `null! as ${this.element.tagNames.map((t) => `"${t}"`).join(' | ')}`;
39 │     }
40 │ 
41 ▶     const initializer = new TcbExpr(`document.createElement(${tagNames})`);
42 │     initializer.addParseSpanInfo(this.element.sourceSpan);
43 │     this.scope.addStatement(new TcbExpr(`var ${id} = ${initializer.print()}`));
44 │     return new TcbExpr(id);
45 │   }
46 │ }
```

タグ名が 1 つなら 36 行目で `document.createElement("app-demo")`、複数（`selector: 'button, a'` など）なら 38 行目で `document.createElement(null! as "button" | "a")` にし、lib.dom.d.ts から両方の要素の型の合併を得ます。

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L676–698 （▶ の行: 677, 687, 689, 692–694, 697）

```ts
676 │   private appendOutputsOfElementLikeNode(
677 ▶     node: Element | Template | HostElement,
678 │     bindings: BoundAttribute[] | null,
679 │     events: BoundEvent[],
680 │   ): void {
681 │     // Collect all the outputs on the element.
682 │     const claimedOutputs = new Set<string>();
683 │ 
684 │     // Don't resolve directives when selectorless is enabled and treat all the outputs on the
685 │     // element as unclaimed. In selectorless the outputs are defined either in component or
686 │     // directive nodes.
687 ▶     const directives = this.tcb.boundTarget.getDirectivesOfNode(node);
688 │ 
689 ▶     if (directives === null || directives.length === 0) {
690 │       // If there are no directives, then all outputs are unclaimed outputs, so queue an operation
691 │       // to add them if needed.
692 ▶       if (node instanceof Element) {
693 ▶         this.opQueue.push(
694 ▶           new TcbUnclaimedOutputsOp(this.tcb, this, node, events, bindings, claimedOutputs),
695 │         );
696 │       }
697 ▶       return;
698 │     }
```

📄 `angular/packages/compiler/src/typecheck/ops/scope.ts` L700–719 （▶ の行: 701–702, 707, 709–711, 715–716）

```ts
700 │     // Queue operations for all directives to check the relevant outputs for a directive.
701 ▶     for (const dir of directives) {
702 ▶       this.opQueue.push(new TcbDirectiveOutputsOp(this.tcb, this, node, bindings, events, dir));
703 │     }
704 │ 
705 │     // After expanding the directives, we might need to queue an operation to check any unclaimed
706 │     // outputs.
707 ▶     if (node instanceof Element || node instanceof HostElement) {
708 │       // Go through the directives and register any outputs that it claims in `claimedOutputs`.
709 ▶       for (const dir of directives) {
710 ▶         for (const outputProperty of dir.outputs.propertyNames) {
711 ▶           claimedOutputs.add(outputProperty);
712 │         }
713 │       }
714 │ 
715 ▶       this.opQueue.push(
716 ▶         new TcbUnclaimedOutputsOp(this.tcb, this, node, events, bindings, claimedOutputs),
717 │       );
718 │     }
719 │   }
```

1. **689〜698 行目：ディレクティブが 1 つも無いとき**

   692 行目、`Element` のときだけ `TcbUnclaimedOutputsOp`（DOM の addEventListener を書く op。[第 11 回](11-typecheck-outputs-events.md)）を積み、697 行目で返ります。**`HostElement` は Element ではないので、何も積まずに返ります**。
2. **701〜703 行目：ディレクティブの出力**

   ディレクティブごとに `TcbDirectiveOutputsOp`。ホストの `(customEvent)` がコンポーネント自身の出力なら、ここで `.subscribe(…)` になります。
3. **707〜717 行目：残りのリスナー**

   ここは `Element || HostElement` です。ディレクティブの出力が受けなかった `(click)` などを `TcbUnclaimedOutputsOp` で addEventListener にします。

つまり **ホストのディレクティブが空だと、ホストの (event) は TCB から消えます**。typecheck-tcb.ts の写しで host の directives を `[]` にして Node で走らせると、次のとおり `(click)` の行がありませんでした（`[title]` は 1035〜1036 行目の op なので残る）。

📄 `手元で走らせた結果（2026-11-02、@angular/compiler 22.1.6）`

```
// typecheck-tcb.ts の写しで、host の directives を [] にして Node で実行
// host: { '[title]': 'name', '(click)': 'go($event)' }
if ((true /*hostBindingsBlockGuard*/)) {
((this).name /*19,23*/) /*19,23*/;

}
// dom: [ 'checkHostElementProperty' ]  ← (click) の addEventListener が無い
```

## 7. ホストの \[prop\] のスキーマ：checkHostElementProperty

📄 `angular/packages/compiler/src/typecheck/ops/schema.ts` L80–97 （▶ の行: 80–81, 83, 85–86）

```ts
80 ▶         } else {
81 ▶           this.tcb.domSchemaChecker.checkHostElementProperty(
82 │             this.tcb.id,
83 ▶             element,
84 │             propertyName,
85 ▶             binding.keySpan,
86 ▶             this.tcb.schemas,
87 │           );
88 │         }
89 │       }
90 │     }
91 │     return null;
92 │   }
93 │ 
94 │   private getTagName(node: Element | Component): string {
95 │     return node instanceof Element ? node.name : getComponentTagName(node);
96 │   }
97 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/dom.ts` L139–178 （▶ の行: 146–148, 161–162, 166, 177）

```ts
139 │   checkHostElementProperty(
140 │     id: TypeCheckId,
141 │     element: TmplAstHostElement,
142 │     name: string,
143 │     span: ParseSourceSpan,
144 │     schemas: SchemaMetadata[],
145 │   ): void {
146 ▶     const report = REGISTRY.validateProperty(name);
147 ▶     if (report.error) {
148 ▶       const mapping = this.resolver.getHostBindingsMapping(id);
149 │       const diag = makeTemplateDiagnostic(
150 │         id,
151 │         mapping,
152 │         span,
153 │         ts.DiagnosticCategory.Error,
154 │         ngErrorCode(ErrorCode.SCHEMA_INVALID_ATTRIBUTE),
155 │         report.msg!,
156 │       );
157 │       this._diagnostics.push(diag);
158 │       return;
159 │     }
160 │ 
161 ▶     for (const tagName of element.tagNames) {
162 ▶       if (REGISTRY.hasProperty(tagName, name, schemas)) {
163 │         continue;
164 │       }
165 │ 
166 ▶       const errorMessage = `Can't bind to '${name}' since it isn't a known property of '${tagName}'.`;
167 │       const mapping = this.resolver.getHostBindingsMapping(id);
168 │       const diag = makeTemplateDiagnostic(
169 │         id,
170 │         mapping,
171 │         span,
172 │         ts.DiagnosticCategory.Error,
173 │         ngErrorCode(ErrorCode.SCHEMA_INVALID_ATTRIBUTE),
174 │         errorMessage,
175 │       );
176 │       this._diagnostics.push(diag);
177 ▶       break;
178 │     }
```

ホストの要素なら ops/schema.ts 81 行目で `checkHostElementProperty` を呼びます。compiler-cli の実装は、146 行目で `on` で始まる名前（イベントのプロパティ。セキュリティのため禁止）でないかを調べ、161〜178 行目でタグ名のどれか 1 つでもそのプロパティを持たなければ `Can't bind to 'x' since it isn't a known property of 'tag'.` を記録します（177 行目の break で 1 つだけ）。148・167 行目の `getHostBindingsMapping` は、ホストの診断をテンプレートではなくデコレータの位置に戻すための対応表です（[第 16 回](16-typecheck-diagnostics-mapping.md)）。86 行目の `schemas` が渡るので、`CUSTOM_ELEMENTS_SCHEMA` や `NO_ERRORS_SCHEMA` はここでも効きます。

## 8. ngtsc ではホストのディレクティブにコンポーネント自身が入る

6 節の「消える (event)」が実際の ngtsc で起きるかを、ホストの情報を渡す側から確かめます。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1259–1277 （▶ の行: 1260–1261, 1265–1267, 1271–1272, 1274–1275）

```ts
1259 │ 
1260 ▶     const hostElement = this.typeCheckHostBindings
1261 ▶       ? createHostElement(
1262 │           'component',
1263 │           meta.meta.selector,
1264 │           createSourceSpan(node.name),
1265 ▶           meta.hostBindingNodes.hostObjectLiteralBindings,
1266 ▶           meta.hostBindingNodes.hostBindingDecorators,
1267 ▶           meta.hostBindingNodes.hostListenerDecorators,
1268 │         )
1269 │       : null;
1270 │     const hostBindingsContext: HostBindingsContext | null =
1271 ▶       hostElement === null || scope.directivesOnHost === null
1272 ▶         ? null
1273 │         : {
1274 ▶             node: hostElement,
1275 ▶             directives: scope.directivesOnHost,
1276 │             sourceMapping: {type: 'direct', node},
1277 │           };
```
*annotations/component/src/handler.ts の typeCheck。このあと ctx.addDirective に渡す*

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/typecheck.ts` L100–117 （▶ の行: 104–105, 115）

```ts
100 │   getTypeCheckScope(ref: Reference<ClassDeclaration>): TypeCheckScope {
101 │     const directives: DirectiveMeta[] = [];
102 │     const pipes = new Map<string, PipeMeta>();
103 │     const scope = this.scopeReader.getScopeForComponent(ref.node);
104 ▶     const hostMeta = this.getTypeCheckDirectiveMetadata(ref);
105 ▶     const directivesOnHost = hostMeta === null ? null : this.combineWithHostDirectives(hostMeta);
106 │ 
107 │     if (scope === null) {
108 │       return {
109 │         matcher: null,
110 │         foreignMatcher: null,
111 │         directives,
112 │         pipes,
113 │         schemas: [],
114 │         isPoisoned: false,
115 ▶         directivesOnHost,
116 │       };
117 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/scope/src/typecheck.ts` L248–253 （▶ の行: 250–251）

```ts
248 │   }
249 │ 
250 ▶   private combineWithHostDirectives(meta: DirectiveMeta): DirectiveMeta[] {
251 ▶     return [...this.hostDirectivesResolver.resolve(meta), meta];
252 │   }
253 │ }
```

1. **handler.ts 1260〜1269 行目：typeCheckHostBindings が真なら createHostElement**

   4 節の関数に、セレクタ・host のリテラル・2 種類のデコレータを渡します。typeCheckHostBindings は compiler.ts で `options.typeCheckHostBindings ?? true`、つまり既定で真です。
2. **1271〜1277 行目：directives は `scope.directivesOnHost`**

   `directivesOnHost` が `null` ならホストの文脈そのものを作りません（ホストの if ブロックが無い）。
3. **scope/src/typecheck.ts 104〜105 行目：directivesOnHost の作り方**

   コンポーネント自身のメタデータ（`hostMeta`）を引き、あれば `combineWithHostDirectives` に渡します。
4. **251 行目：hostDirectives + 自分**

   `[...hostDirectives, meta]`。**最後に必ずコンポーネント自身が入る**ので、配列は空になりません。

だから ngtsc では、ホストの文脈があるときは必ず directives が 1 つ以上あり、6 節の 707〜717 行目の分岐に入って `(click)` は addEventListener になります。「ホストのディレクティブが空で (event) が消える」は、ngtsc の経路では起きません（hostMeta が無いときは 1271 行目でホストの文脈ごと作られない）。このシリーズのデモ（typecheck-tcb.ts）が host のディレクティブにコンポーネント自身を入れているのは、この ngtsc の形に合わせるためです。

📄 `angular/packages/compiler-cli/test/ngtsc/host_bindings_type_check_spec.ts` L783–806 （▶ の行: 791, 794, 796, 802–804）

```ts
783 │     it('should check component listening to own output', () => {
784 │       env.write(
785 │         'test.ts',
786 │         `
787 │           import {Component, Output, EventEmitter} from '@angular/core';
788 │ 
789 │           @Component({
790 │             template: '',
791 ▶             host: {'(customEvent)': 'expectsNumber($event)'},
792 │           })
793 │           export class Comp {
794 ▶             @Output() customEvent = new EventEmitter<string>();
795 │ 
796 ▶             expectsNumber(value: number) {}
797 │           }
798 │       `,
799 │       );
800 │ 
801 │       const diags = env.driveDiagnostics();
802 ▶       expect(diags.length).toBe(1);
803 ▶       expect(diags[0].messageText).toBe(
804 ▶         `Argument of type 'string' is not assignable to parameter of type 'number'.`,
805 │       );
806 │     });
```

自分自身が directives に入っていることは、この spec でも確かめられます。791 行目のホストの `(customEvent)` は、794 行目のコンポーネント自身の出力として 6 節の 701〜703 行目で `.subscribe` になり、`$event` が `string` になるので 804 行目のエラーが出ます。

## 9. ページの上で

> **🧪 要素・スキーマ・ホストバインディングの TCB**
>
> 要素ごとに checkElement、\[prop\] ごとに checkTemplateElementProperty。TCB には式の文だけが残る
>
> ボタンを押すと、このサイトに入っている @angular/compiler 22.1.6 の generateTypeCheckBlock が動きます。位置のコメントは消して表示します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-elements-dom)

デモの DomSchemaChecker は呼ばれた名前を記録するだけなので、「知らない要素」でも診断は作りません。本物の `RegistryDomSchemaChecker` なら、`checkElement('unknown-el')` で NG8001、`checkTemplateElementProperty('div', 'foo')` で NG8002 を作ります（[ngmodule-schemas](../ngmodule/16-ngmodule-schemas.md)）。

- `ComponentDecoratorHandler.typeCheck()` — handler.ts:1260 — *createHostElement + directivesOnHost*
  - `createHostElement(…)` — host\_bindings.ts:98 — *host / @HostBinding / @HostListener → HostElement*
- `generateTypeCheckBlock()` — type\_check\_block.ts
  - `Scope.forNodes(…, template)` — scope.ts — *if (true) の中*
    - `appendNode(Element)` → `TcbElementOp`（optional）・`TcbUnclaimedInputsOp`・`TcbDomSchemaCheckerOp` — scope.ts:666・672
      - `domSchemaChecker.checkElement()` / `checkTemplateElementProperty()` — ops/schema.ts — *TCB には何も書かない*
  - `Scope.forNodes(…, host.node, …)` — scope.ts — *if ((true /\*hostBindingsBlockGuard\*/)) の中*
    - `appendHostElement()` — scope.ts:1019 — *TcbHostElementOp・UnclaimedInputs・Schema・Outputs*
      - `domSchemaChecker.checkHostElementProperty()` — dom.ts:139

## テストと直し方

- ホストバインディングの spec は 1 つのファイルにまとまっています：`test/ngtsc/host_bindings_type_check_spec.ts`（980 行）の `describe('type checking of host bindings')`（:21）、39 個の it。8 節で引用した `it('should check component listening to own output')`（:783）、`it('should check host event listeners with a target')`（:232）、`it('should check @HostListener with a target')`（:257、下の引用）、`it('should not check host bindings if the compiler flag is disabled')`（:763）、`it('should validate host bidings against the schema')`（:141）など。
- 要素とスキーマの TCB は `type_check_block_spec.ts` の `it('should only generate code for DOM elements that are actually referenced')`（:445）と `describe('experimental DOM checking via lib.dom.d.ts')`（:1016）。

📄 `angular/packages/compiler-cli/test/ngtsc/host_bindings_type_check_spec.ts` L257–279 （▶ の行: 265, 268, 274, 276, 278）

```ts
257 │     it('should check @HostListener with a target', () => {
258 │       env.write(
259 │         'test.ts',
260 │         `
261 │         import {Component, HostListener} from '@angular/core';
262 │ 
263 │         @Component({
264 │           template: '',
265 ▶           selector: 'button[foo]',
266 │         })
267 │         export class Comp {
268 ▶           @HostListener('document:click', ['$event']) handleEvent(event: KeyboardEvent) {}
269 │         }
270 │       `,
271 │       );
272 │ 
273 │       const diags = env.driveDiagnostics();
274 ▶       expect(diags.length).toBe(1);
275 │       expect((diags[0].messageText as ts.DiagnosticMessageChain).messageText).toBe(
276 ▶         `Argument of type 'PointerEvent' is not assignable to parameter of type 'KeyboardEvent'.`,
277 │       );
278 ▶       expect(getDiagnosticSourceCode(diags[0])).toBe('$event');
279 │     });
```

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=type checking of host bindings'

pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=DOM'
```

📄 `出力（抜粋。2026-11-02 に実行。ログは scratchpad/tc-logs/b-host.log・b-dom.log）`

```
（4 つの shard のそれぞれが次の 2 行）
Ran 39 of 6637 specs
39 specs, 0 failures
//packages/compiler-cli/test/ngtsc:ngtsc                   PASSED in 2.9s

Ran 7 of 1747 specs
7 specs, 0 failures
//packages/compiler-cli/src/ngtsc/typecheck/test:test      PASSED in 0.8s
```

1. **件数の読み方**

   ngtsc の 4 つの shard がそれぞれ `Ran 39 of 6637 specs` と出しました。host\_bindings\_type\_check\_spec.ts の it は 39 個なので、絞った describe の it が全部走っています。`DOM` で絞った typecheck/test:test は 7 件（describe や it の名前に DOM を含むもの）です。
2. **直すとしたら**

   ホストの AST を作るのは host\_bindings.ts の `createHostElement`（98 行目）と 5 節の関数、TCB に積む op は scope.ts の `appendHostElement`（1019 行目）、要素名を調べるかの判定は 671 行目です。診断の変化は host\_bindings\_type\_check\_spec.ts に `env.write` + `env.driveDiagnostics()` の it を、TCB の形なら type\_check\_block\_spec.ts に足します（type\_check\_block\_spec の `tcb()` にはホストを渡す引数が無いので、ホストは ngtsc の spec で確かめるのがこのファイルの書き方です）。
3. **issue を読むときの手がかり**

   ホストの型チェックの要望は閉じた #45847（2022-05 に起票、2025-04 に完了）で、コメントに「v20 で `typeCheckHostBindings` フラグの後ろに入り、v21 で既定で有効になる」とあります。近くに #62783（hostDirectives の出力をホストで聞くと型が合わない、2025-08 に完了）、#63170（特定の keydown のバインディングで typeCheckHostBindings を有効にできない、重複として閉じた）、#70718（NG8111 が host のリスナーを見ない、拡張診断）があります。「知らない要素なのにエラーにならない」報告は 2 節の 671 行目（ディレクティブが付いている）か、要素名が既知（開いている #46351 の `button[custom-button]` のように要素名が `button`）かを先に分けます。[第 20 回](20-typecheck-issues.md)。

## 聞かれそうな質問

**Q. CUSTOM\_ELEMENTS\_SCHEMA を付けると、型チェックの何が消えますか？**

DomSchemaChecker が作る 2 種類の診断（知らない要素、知らないプロパティ）のうち、`-` を含む要素名についてのものだけです。TCB の形は変わりません。compiler の typecheck/ を `.schemas` で grep すると、schemas を読むのは ops/schema.ts（2 節の op）だけで、TCB の文を作る op は読みません。だから `<my-el [foo]="user.nmae">` の `user.nmae` は CUSTOM\_ELEMENTS\_SCHEMA があっても TypeScript のエラーになります。NO\_ERRORS\_SCHEMA も同じで、消えるのはスキーマの診断だけです。

**Q. @HostListener や @HostBinding も型チェックされますか？**

されます（typeCheckHostBindings の既定は真）。handler.ts 1266〜1267 行目でデコレータが渡され、host\_bindings.ts 374〜409 行目で `this.handle($event)` に当たる AST が作られます。host\_bindings\_type\_check\_spec.ts 268 行目の `@HostListener('document:click', ['$event'])` で、引数の型が `KeyboardEvent` なら 276 行目のエラーになります。ただし文字列で書かれていないもの（host の値が定数、デコレータの引数が文字列でない）は、5 節の 182〜184 行目のように飛ばすか `$any(0)` にします。

**Q. host の (window:resize) はどうなりますか？**

5 節の 212〜231 行目でイベントとしてパースされ、`window:` が target になります。target が `window` か `document` なら、TcbUnclaimedOutputsOp は要素ではなく `window.addEventListener("resize", …)` を書きます（[第 11 回](11-typecheck-outputs-events.md)。デモのホストのプリセットで出る）。`$event` の型は lib.dom.d.ts の `WindowEventMap["resize"]` から決まります。

**Q. `[title]="123"` が型エラーにならないのはなぜですか？**

受け手の無い \[prop\] を要素のプロパティへの代入にするのは checkTypeOfDomBindings が真のときだけで（3 節、type\_check\_block\_spec.ts 1021 行目）、ngtsc はこれを常に偽にしているからです。TCB には式 `123` の文だけが残ります。`title` というプロパティが `div` にあるかは、スキーマの op が別に調べます。

## 読み終えて

- 要素は `document.createElement("tag")` で、型は lib.dom.d.ts が決める。誰も求めなければ書かれない。
- 知らない要素・知らないプロパティの診断は TCB ではなく DomSchemaChecker が帯域外で作る。schemas が効くのはここだけ。
- ディレクティブが 1 つでも付いた要素は、要素名を調べない（scope.ts 671 行目）。
- 受け手の無い \[prop\] は、ngtsc では型を比べない（checkTypeOfDomBindings は常に偽）。
- ホストバインディングは HostElement にまとめられ、2 つ目の if ブロックで型チェックされる。ngtsc ではホストのディレクティブにコンポーネント自身が必ず入るので、(event) は消えない。

---

← 前: [テンプレートの式を TypeScript の式に書き直す](07-typecheck-expressions.md)  
次: [型コンストラクタ：ジェネリックなディレクティブの型を推論させる](09-typecheck-type-constructor.md) →
