[目次](../README.md) › [common の説明文の読み残し](README.md) › 第 6 回 / 全 9 回

# NgClass・NgStyle と outlet の説明文

> directives/ng\_class.ts・ng\_style.ts・ng\_template\_outlet.ts・ng\_component\_outlet.ts の未読の行：受け取れる値の形、単位つきのキー、context と injector と inputs の約束、例。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-attr-outlets)

---

この章で分かること：`NgClass` と `NgStyle` の説明文が「受け取る」と書く値の形（文字列・配列・`Set`・オブジェクト、`'width.px'` の単位）と、`NgTemplateOutlet`・`NgComponentOutlet` の説明文が約束する context・inputs・injector・content を、本物に渡して確かめます。説明と合わなかったのは 3 つです。`NgClass` の使い方の例がそのままではコンパイルできないこと、`NgStyle` の単位の例 `'font-style.em'` がブラウザーに捨てられること、`NgComponentOutlet` の既定の injector が「今の view container の injector」ではなく、その親であることです。

読む対象は `packages/common/src/directives/` の `ng_class.ts`・`ng_style.ts`・`ng_template_outlet.ts`・`ng_component_outlet.ts` の説明文と、`packages/examples/common/ngComponentOutlet/ts/module.ts`（../angular、8576f161ae4）です。差分の取り方（`_updateState`・`KeyValueDiffer`）は[NgClass と NgStyle の章](../cmn/02-cmn-ng-class-style.md)、ビューを作り直す条件と context の Proxy、入力の流し込みは[outlet の章](../cmn/05-cmn-outlets.md)にあります。

1. [1. NgOptimizedImage](01-cmd-image.md)
2. [2. 画像のローダー](02-cmd-image-loaders.md)
3. [3. 日付の書式](03-cmd-date.md)
4. [4. 数と i18n の pipe](04-cmd-number.md)
5. [5. 構造ディレクティブ](05-cmd-structural.md)
6. **6. NgClass・NgStyle と outlet**（この章）
7. [7. AsyncPipe と小さな pipe](07-cmd-pipes.md)
8. [8. Location](08-cmd-location.md)
9. [9. spec と issue](09-cmd-tests-issues.md)

## 1. NgClass の使い方の例：| は「または」のつもり

📄 `angular/packages/common/src/directives/ng_class.ts` L39–60 （▶ の行: 44, 46, 49–50, 53, 55, 57, 59）

````ts
39 │ /**
40 │  * @ngModule CommonModule
41 │  *
42 │  * @usageNotes
43 │  * ```html
44 ▶  * <some-element [ngClass]="stringExp|arrayExp|objExp|Set">...</some-element>
45 │  *
46 ▶  * <some-element [ngClass]="{'class1 class2 class3' : true}">...</some-element>
47 │  * ```
48 │  *
49 ▶  * For more simple use cases you can use the [class bindings](/guide/templates/binding#css-class-and-style-property-bindings) directly.
50 ▶  * It doesn't require importing a directive.
51 │  *
52 │  * ```html
53 ▶  * <some-element [class]="'first second'">...</some-element>
54 │  *
55 ▶  * <some-element [class.expanded]="isExpanded">...</some-element>
56 │  *
57 ▶  * <some-element [class]="['first', 'second']">...</some-element>
58 │  *
59 ▶  * <some-element [class]="{'first': true, 'second': true, 'third': false}">...</some-element>
60 │  * ```
````

44 行目の `[ngClass]="stringExp|arrayExp|objExp|Set"` は「文字列か配列かオブジェクトか Set の式」という書き方の記号で、テンプレートに貼ると `|` が pipe として読まれます。strictTemplates の ngc にかけると `NG8004: No pipe found with name 'arrayExp'` など 3 つのエラーでした（テストの節）。この行は d797c5cb94e（2024-12-19、#59240「class と style のバインディングの勧めを更新」）で、それまでの `[ngClass]="'first second'"` などの具体的な 4 つの例と置き換わりました。46 行目と、49〜50 行目が勧める `[class]` の 4 つの形（53・55・57・59 行目）は、どれもそのまま ngc に通ります（置き物の `<some-element>` は `CUSTOM_ELEMENTS_SCHEMA` で許した場合）。

## 2. NgClass が受け取る値

📄 `angular/packages/common/src/directives/ng_class.ts` L61–75 （▶ の行: 65–69）

```ts
61 │  * @description
62 │  *
63 │  * Adds and removes CSS classes on an HTML element.
64 │  *
65 ▶  * The CSS classes are updated as follows, depending on the type of the expression evaluation:
66 ▶  * - `string` - the CSS classes listed in the string (space delimited) are added,
67 ▶  * - `Array` - the CSS classes declared as Array elements are added,
68 ▶  * - `Object` - keys are CSS classes that get added when the expression given in the value
69 ▶  *              evaluates to a truthy value, otherwise they are removed.
70 │  *
71 │  *
72 │  * @see [Class bindings](/guide/templates/binding#css-class-and-style-property-bindings)
73 │  *
74 │  * @publicApi
75 │  */
```

65〜69 行目の一覧は string・Array・Object の 3 つで、`Set` は 44 行目の例にしか出てきません。実装は `Array.isArray(rawClass) || rawClass instanceof Set` で配列と同じに扱います（ng\_class.ts L133、[NgClass の章](../cmn/02-cmn-ng-class-style.md)の 2 節）。DEMO 1 の NgClass の表で、9 つの形を `class="base"` を持つ div に渡しました。

- 66 行目「space delimited」の空白は、`/\s+/` で切るのでタブ・改行・続く空白も 1 つの区切りです（`' first \t second\nthird '` → `first second third`）。
- 配列の要素の中の空白も切られ、`['first second']` で 2 つ足されます（実際に足すときの `_toggleClass` がもう一度 `split` する、ng\_class.ts L188〜190）。
- 68〜69 行目「値が truthy なら足し、そうでなければ外す」は、`1` が足され、`''`・`false`・`null` は足されませんでした。
- `null` と `''` は何も足さず、静的な `class="base"` はそのままです。値を `{a: true, b: true}` → `{a: false, b: true}` → `['b']` → `null` と替えると、`base a b` → `base b` → `base b` → `base` と、消えた名前も外れました。

📄 `angular/packages/common/src/directives/ng_class.ts` L99–124 （▶ の行: 108–111, 113–114）

```ts
 99 │ 
100 │   /*
101 │   The NgClass directive uses the custom change detection algorithm for its inputs. The custom
102 │   algorithm is necessary since inputs are represented as complex object or arrays that need to be
103 │   deeply-compared.
104 │ 
105 │   This algorithm is perf-sensitive since NgClass is used very frequently and its poor performance
106 │   might negatively impact runtime performance of the entire change detection cycle. The design of
107 │   this algorithm is making sure that:
108 ▶   - there is no unnecessary DOM manipulation (CSS classes are added / removed from the DOM only when
109 ▶   needed), even if references to bound objects change;
110 ▶   - there is no memory allocation if nothing changes (even relatively modest memory allocation
111 ▶   during the change detection cycle can result in GC pauses for some of the CD cycles).
112 │ 
113 ▶   The algorithm works by iterating over the set of bound classes, staring with [class] binding and
114 ▶   then going over [ngClass] binding. For each CSS class name:
115 │   - check if it was seen before (this information is tracked in the state map) and if its value
116 │   changed;
117 │   - mark it as "touched" - names that are not marked are not present in the latest set of binding
118 │   and we can remove such class name from the internal data structures;
119 │ 
120 │   After iteration over all the CSS class names we've got data structure with all the information
121 │   necessary to synchronize changes to the DOM - it is enough to iterate over the state map, flush
122 │   changes to the DOM and reset internal data structures so those are ready for the next change
123 │   detection cycle.
124 │    */
```

これは JSDoc ではなく、実装の前に置かれたコメントです（angular.dev には出ません）。108〜109 行目「参照が変わっても、必要なときだけ DOM を触る」は、spec の `should not write to the native node when values are the same (obj reference change)`（ng\_class\_spec.ts 401）と `(array reference change)`（416）が固めています。113〜114 行目の「`[class]` から先に、次に `[ngClass]`」の順は `ngDoCheck` の 2 つのループの順です（NgClass の章の 2 節）。要素が文字列でない配列（`['ok', 1]`）は、DEMO 2 のとおり開発モードでは `NgClass can only toggle CSS classes expressed as strings, got 1`、本番では確かめを飛ばして `TypeError: klass.trim is not a function` です（このページの本番ビルドでは変数名が縮められて `e.trim`）。

## 3. NgStyle：単位の例 'font-style.em'

📄 `angular/packages/common/src/directives/ng_style.ts` L20–45 （▶ の行: 25, 28, 31, 34, 37–38, 43）

````ts
20 │ /**
21 │  * @ngModule CommonModule
22 │  *
23 │  * @usageNotes
24 │  *
25 ▶  * Set the width of the containing element to a pixel value returned by an expression.
26 │  *
27 │  * ```html
28 ▶  * <some-element [ngStyle]="{'max-width.px': widthExp}">...</some-element>
29 │  * ```
30 │  *
31 ▶  * Set a collection of style values using an expression that returns key-value pairs.
32 │  *
33 │  * ```html
34 ▶  * <some-element [ngStyle]="objExp">...</some-element>
35 │  * ```
36 │  *
37 ▶  * For more simple use cases you can use the [style bindings](/guide/templates/binding#css-class-and-style-property-bindings) directly.
38 ▶  * It doesn't require importing a directive.
39 │  *
40 │  * Set the font of the containing element to the result of an expression.
41 │  *
42 │  * ```html
43 ▶  * <some-element [style]="{'font-style': styleExp}">...</some-element>
44 │  * ```
45 │  *
````

📄 `angular/packages/common/src/directives/ng_style.ts` L46–60 （▶ の行: 49–51, 53–55）

```ts
46 │  * @description
47 │  *
48 │  * An attribute directive that updates styles for the containing HTML element.
49 ▶  * Sets one or more style properties, specified as colon-separated key-value pairs.
50 ▶  * The key is a style name, with an optional `.<unit>` suffix
51 ▶  * (such as 'top.px', 'font-style.em').
52 │  * The value is an expression to be evaluated.
53 ▶  * The resulting non-null value, expressed in the given unit,
54 ▶  * is assigned to the given style property.
55 ▶  * If the result of evaluation is null, the corresponding style is removed.
56 │  *
57 │  * @see [Style bindings](/guide/templates/binding#css-class-and-style-property-bindings)
58 │  *
59 │  * @publicApi
60 │  */
```

50〜51 行目は「キーは style の名前で、後ろに `.<unit>` を付けられる（たとえば `'top.px'`・`'font-style.em'`）」と書きます。`font-style` は `italic` などのキーワードしか取らない性質で、長さを受けません。`{'font-style.em': 2}` を渡すと `NgStyle` は `setStyle('font-style', '2em')` を呼び、このページの Chrome はその値を捨てて style 属性に何も残しませんでした（DEMO 1 の NgStyle の表）。`'font-size.em'` なら `font-size: 2em` です。この例は a84a9ba705e（2019-01-21、`docs: add input doc (#27379)`）で入りました。

53〜54 行目「null でない値を、その単位で書く」は、実装が `` `${value}${unit}` `` と文字列をつなぐだけ、ということです（ng\_style.ts L99、NgClass と NgStyle の章の 4 節）。だから単位は何でもよく（`'width.%'` で `50%`）、値のほうにも単位があると `'10pxpx'` になってブラウザーに捨てられます。55 行目「null なら外す」は `undefined` でも同じで（実装は `value != null`）、`[ngStyle]` にオブジェクトごと `null` を渡すと、differ が空と比べて全部外しました（`style=""`）。カスタムプロパティ `'--accent'` は名前に `-` を含むので `DashCase` の印が付いて書かれます（spec `should handle CSS variables`、ng\_style\_spec.ts 232）。

## 4. NgTemplateOutlet：context は object

📄 `angular/packages/common/src/directives/ng_template_outlet.ts` L21–46 （▶ の行: 28–30, 34, 37, 41）

````ts
21 │ /**
22 │  * @ngModule CommonModule
23 │  *
24 │  * @description
25 │  *
26 │  * Inserts an embedded view from a prepared `TemplateRef`.
27 │  *
28 ▶  * You can attach a context object to the `EmbeddedViewRef` by setting `[ngTemplateOutletContext]`.
29 ▶  * `[ngTemplateOutletContext]` should be an object, the object's keys will be available for binding
30 ▶  * by the local template `let` declarations.
31 │  *
32 │  * @usageNotes
33 │  * ```html
34 ▶  * <ng-container *ngTemplateOutlet="templateRefExp; context: contextExp"></ng-container>
35 │  * ```
36 │  *
37 ▶  * Using the key `$implicit` in the context object will set its value as default.
38 │  *
39 │  * ### Example
40 │  *
41 ▶  * {@example common/ngTemplateOutlet/ts/module.ts region='NgTemplateOutlet'}
42 │  *
43 │  * @publicApi
44 │  *
45 │  * @see [Using NgTemplateOutlet](guide/templates/ng-template#using-ngtemplateoutlet)
46 │  */
````

41 行目の例は、`greet`・`eng`（`let-name` が `$implicit`）・`svk`（`let-person="localSk"`）の 3 つを描くもので、本物で `Hello | Hello World! | Ahoj Svet!` になりました（37 行目の `$implicit` が既定、のとおり）。29 行目「context は object であるべき」の「べき」は、守らないと例外になる「べき」です。context の Proxy は `Reflect.get(this.ngTemplateOutletContext, …)` で読むので（ng\_template\_outlet.ts L137、[outlet の章](../cmn/05-cmn-outlets.md)の 3 節）、文字列 `'abc'` を渡すと開発モードでも本番でも `TypeError: Reflect.get called on non-object` で変更検知が止まりました。`null` は Proxy が `undefined` を返すので、例外にならず `Hello !` と描かれます（spec `` should display template if context is `null` ``、ng\_template\_outlet\_spec.ts 128）。

## 5. NgComponentOutlet の 5 つの選択肢

📄 `angular/packages/common/src/directives/ng_component_outlet.ts` L25–53 （▶ の行: 29–30, 38–39, 41–42, 44–45, 47–48, 50–51）

```ts
25 │ /**
26 │  * Instantiates a {@link /api/core/Component Component} type and inserts its Host View into the current View.
27 │  * `NgComponentOutlet` provides a declarative approach for dynamic component creation.
28 │  *
29 ▶  * `NgComponentOutlet` requires a component type, if a falsy value is set the view will clear and
30 ▶  * any existing component will be destroyed.
31 │  *
32 │  * @usageNotes
33 │  *
34 │  * ### Fine tune control
35 │  *
36 │  * You can control the component creation process by using the following optional attributes:
37 │  *
38 ▶  * * `ngComponentOutletInputs`: Optional component inputs object, which will be bind to the
39 ▶  * component.
40 │  *
41 ▶  * * `ngComponentOutletInjector`: Optional custom {@link Injector} that will be used as parent for
42 ▶  * the Component. Defaults to the injector of the current view container.
43 │  *
44 ▶  * * `ngComponentOutletEnvironmentInjector`: Optional custom {@link EnvironmentInjector} which will
45 ▶  * provide the component's environment.
46 │  *
47 ▶  * * `ngComponentOutletContent`: Optional list of projectable nodes to insert into the content
48 ▶  * section of the component, if it exists.
49 │  *
50 ▶  * * `ngComponentOutletNgModule`: Optional NgModule class reference to allow loading another
51 ▶  * module dynamically, then loading a component from that module.
52 │  *
53 │  *
```

29〜30 行目「falsy ならビューを空にして壊す」は、`HelloWorld` から `null` に替えて `Hello World! → （空）` でした。38〜39 行目の「will be bind」は bound の誤りです（29d358170b0、2023-04-07 の inputs の追加から）。47〜48 行目の content は「content の場所に入れる」とだけ書きます。実際は配列の i 番目がテンプレートの i 番目の `<ng-content>` に入り、`select` では振り分けません。DEMO では `[<ng-content select="b">|<ng-content>]` のコンポーネントに `[[text], [<b>B</b>, text]]` を渡すと、`<b>` は 2 つ目（select の無い方）に入りました（`projectableNodes` の意味は[view-container の章](../template/04-view-container.md)）。

> [!WARNING]
> **ハマりどころ**
>
> 41〜42 行目は「`ngComponentOutletInjector` の既定は、今の view container の injector」と書きますが、実装は `this._viewContainerRef.parentInjector` です（ng\_component\_outlet.ts L159、[outlet の章](../cmn/05-cmn-outlets.md)の 5 節）。違いは、outlet と同じ要素に置いたディレクティブの providers です。DEMO で `<ng-container cmdAoSameNode [ngComponentOutlet]="Reader">`（`cmdAoSameNode` は同じ要素でトークンを provide する）と書くと、作られたコンポーネントはそのトークンを見つけず、外側のコンポーネントの値を読みました。同じ要素の `[ngTemplateOutletInjector]="'outlet'"` は `inject(Injector)`（その要素のノードの injector）を使うので、同じ要素の値を読みます。この説明は 3ef73c2b194（2017-01-25、NgModule 対応）で書かれ、実装は最初の 8578682dcfc（2016-09-01）から `parentInjector` でした。

## 6. 構文の 4 つと、例

📄 `angular/packages/common/src/directives/ng_component_outlet.ts` L54–82 （▶ の行: 58, 63–64, 70–72, 78–79）

````ts
54 │  * ### Syntax
55 │  *
56 │  * Simple
57 │  * ```html
58 ▶  * <ng-container *ngComponentOutlet="componentTypeExpression"></ng-container>
59 │  * ```
60 │  *
61 │  * With inputs
62 │  * ```html
63 ▶  * <ng-container *ngComponentOutlet="componentTypeExpression;
64 ▶  *                                   inputs: inputsExpression;">
65 │  * </ng-container>
66 │  * ```
67 │  *
68 │  * Customized injector/content
69 │  * ```html
70 ▶  * <ng-container *ngComponentOutlet="componentTypeExpression;
71 ▶  *                                   injector: injectorExpression;
72 ▶  *                                   content: contentNodesExpression;">
73 │  * </ng-container>
74 │  * ```
75 │  *
76 │  * Customized NgModule reference
77 │  * ```html
78 ▶  * <ng-container *ngComponentOutlet="componentTypeExpression;
79 ▶  *                                   ngModule: ngModuleClass;">
80 │  * </ng-container>
81 │  * ```
82 │  *
````

📄 `angular/packages/common/src/directives/ng_component_outlet.ts` L83–95 （▶ の行: 85, 89）

```ts
83 │  * ### A simple example
84 │  *
85 ▶  * {@example common/ngComponentOutlet/ts/module.ts region='SimpleExample'}
86 │  *
87 │  * A more complete example with additional options:
88 │  *
89 ▶  * {@example common/ngComponentOutlet/ts/module.ts region='CompleteExample'}
90 │  *
91 │  * @publicApi
92 │  * @ngModule CommonModule
93 │  *
94 │  * @see [Using NgComponentOutlet](guide/components/programmatic-rendering#using-ngcomponentoutlet)
95 │  */
```

4 つの構文は、型を付けたフィールドを置けばどれも strictTemplates に通りました。64・72・79 行目の最後の `;` もマイクロ構文では許されます。89 行目が指す例は次のものです。

📄 `angular/packages/examples/common/ngComponentOutlet/ts/module.ts` L45–69 （▶ の行: 47–48, 53, 62–66）

```ts
45 │ @Component({
46 │   selector: 'complete-component',
47 ▶   template: `{{ label() }}: <ng-content></ng-content> <ng-content></ng-content
48 ▶     >{{ greeter.suffix }}`,
49 │ })
50 │ export class CompleteComponent {
51 │   label = input.required<string>();
52 │ 
53 ▶   constructor(public greeter: Greeter) {}
54 │ }
55 │ 
56 │ @Component({
57 │   selector: 'ng-component-outlet-complete-example',
58 │   imports: [NgComponentOutlet],
59 │   template: ` <ng-template #ahoj>Ahoj</ng-template>
60 │     <ng-template #svet>Svet</ng-template>
61 │     <ng-container
62 ▶       *ngComponentOutlet="
63 ▶         CompleteComponent;
64 ▶         inputs: myInputs;
65 ▶         injector: myInjector;
66 ▶         content: myContent
67 │       "
68 │     ></ng-container>`,
69 │ })
```

📄 `angular/packages/examples/common/ngComponentOutlet/ts/module.ts` L70–97 （▶ の行: 85–87, 90–93）

```ts
70 │ export class NgComponentOutletCompleteExample {
71 │   // This field is necessary to expose CompleteComponent to the template.
72 │   CompleteComponent = CompleteComponent;
73 │ 
74 │   myInputs = {'label': 'Complete'};
75 │ 
76 │   myInjector: Injector;
77 │   ahojTemplateRef = viewChild.required<TemplateRef<any>>('ahoj');
78 │   svetTemplateRef = viewChild.required<TemplateRef<any>>('svet');
79 │   myContent?: any[][];
80 │ 
81 │   constructor(
82 │     injector: Injector,
83 │     private vcr: ViewContainerRef,
84 │   ) {
85 ▶     this.myInjector = Injector.create({
86 ▶       providers: [{provide: Greeter, deps: []}],
87 ▶       parent: injector,
88 │     });
89 │ 
90 ▶     effect(() => {
91 ▶       this.myContent = [
92 ▶         this.vcr.createEmbeddedView(this.ahojTemplateRef()).rootNodes,
93 ▶         this.vcr.createEmbeddedView(this.svetTemplateRef()).rootNodes,
94 │       ];
95 │     });
96 │   }
97 │ }
```

47 行目の `CompleteComponent` は `select` の無い `<ng-content>` を 2 つ持ち、90〜93 行目の `effect` が 2 つのテンプレートから content を作ります。章の中にこの 2 つのクラスを名前だけ変えて写し、そのまま描くと、最初の `detectChanges` のあとで `Complete: Ahoj Svet !` でした（2 つの `<ng-content>` に、content の 1 つ目と 2 つ目が入る）。53 行目のコンストラクターが受ける `Greeter` は、85〜87 行目の `Injector.create` だけが持つ provider です。

> **🧪 DEMO 1 — 説明文が受け取ると書く値を本物に渡す**
>
> 押すと、本物の `@angular/common`（22.2.6）のディレクティブを使う小さなコンポーネントを行ごとに `createComponent` で作り（文書に付けない div の上）、`detectChanges` して class・style の属性と文字を読みます。style の値を捨てるかどうかはブラウザーが決めるので、このページの結果が本物です。使ったテンプレートは下の欄にあります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-attr-outlets)

📄 `DEMO 1 のテンプレート（上から NgClass・NgStyle・NgTemplateOutlet・NgComponentOutlet の 4 つ）`

```
<div class="base" [ngClass]="v"></div>

<div [ngStyle]="v"></div>

<ng-container *ngTemplateOutlet="greet"></ng-container> |
<ng-container *ngTemplateOutlet="eng; context: myContext"></ng-container> |
<ng-container *ngTemplateOutlet="svk; context: myContext"></ng-container>

<ng-template #greet><span>Hello</span></ng-template>
<ng-template #eng let-name><span>Hello {{ name }}!</span></ng-template>
<ng-template #svk let-person="localSk"><span>Ahoj {{ person }}!</span></ng-template>

<ng-container *ngComponentOutlet="cmp"></ng-container>

<ng-template #ahoj>Ahoj</ng-template>
<ng-template #svet>Svet</ng-template>
<ng-container
  *ngComponentOutlet="
    CompleteComponent;
    inputs: myInputs;
    injector: myInjector;
    content: myContent
  "
></ng-container>

<ng-container *ngComponentOutlet="cmp; content: nodes"></ng-container>

<ng-container cmdAoSameNode [ngComponentOutlet]="Reader"></ng-container> |
<ng-container cmdAoSameNode [ngTemplateOutlet]="t" [ngTemplateOutletInjector]="'outlet'"></ng-container> |
<ng-container cmdAoSameNode [ngTemplateOutlet]="t"></ng-container>
<ng-template #t><cmd-ao-reader /></ng-template>
```

> **🧪 DEMO 2 — 誤った値：開発モードと本番**
>
> 押すと、このページ（本番ビルド）で 2 つの誤った値を描きます。左の 2 列は Node（domino の上の JIT）の記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-attr-outlets)

## ここまでの呼び出し

- 👤 `<ng-container cmdAoSameNode [ngComponentOutlet]="Reader">`
  - `NgComponentOutlet.ngOnChanges` — ng\_component\_outlet.ts L152〜182
    - `injector = this.ngComponentOutletInjector || this._viewContainerRef.parentInjector` — L159 — *同じ要素の providers を飛ばす*
    - `this._viewContainerRef.createComponent(Reader, {injector, …})` — L174〜179
      - `inject(CMD_AO_TOKEN)` — Reader のフィールド — *外側のコンポーネントの値*

## テストと直し方

| ファイル（packages/common/test/directives/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `ng_class_spec.ts` | `should split by one or more spaces between classes`（129）・`should allow multiple classes per item in arrays`（188）・`expressions evaluating to sets`（206） | 2 節の空白と Set。`should throw with descriptive error message when CSS class is not a string`（198）は開発モードの文だけ |
| `ng_style_spec.ts` | `should remove styles with a null expression`（57）・`an undefined expression`（71）・`style.unit notation`（85）・`should handle CSS variables`（232） | 3 節。単位を取らないプロパティの it は無い |
| `ng_template_outlet_spec.ts` | `` should display template if context is `null` ``（128）・`should be able to inherit outlet injector`（364） | 4 節。object でない context の it は無い |
| `ng_component_outlet_spec.ts` | `should clear view if component becomes null`（73）・`should render projectable nodes, if supplied`（164）・`should override providers from parent component using custom injector`（232） | 5 節。既定の injector で同じ要素の providers を読む it は無い |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=^binding to CSS class list   Ran 40 of 667 specs、0 failures
--filter=^NgStyle                     Ran 15 of 667 specs、0 failures
--filter=^NgTemplateOutlet            Ran 28 of 667 specs、0 failures
--filter=^insert/remove               Ran 15 of 667 specs、0 failures   # ng_component_outlet_spec.ts の 1 つ目
--filter=^inputs                      Ran 3 of 667 specs、0 failures    # 同じファイルの 2 つ目

# 説明文の例と packages/examples の 2 つの例を、strictTemplates の ngc にかける（compiler-cli 22.2.6）
$ ngc -p tsconfig.json
doc/attr.ts:10:49 - error NG8004: No pipe found with name 'arrayExp'.
doc/attr.ts:10:58 - error NG8004: No pipe found with name 'objExp'.
doc/attr.ts:10:65 - error NG8004: No pipe found with name 'Set'.
#   ↑ ng_class.ts L44 の例だけ。ほかの 13 の例と ex/ngtemplateoutlet.ts・ex/ngcomponentoutlet.ts はエラー 0
```

直すとしたら説明文です。ng\_class.ts の 44 行目は d797c5cb94e より前の具体的な例（`[ngClass]="'first second'"` など）に戻すか、`|` が記号であることを書きます。65〜69 行目の一覧には `Set` を足せます。ng\_style.ts の 51 行目は `'font-size.em'` にすれば例として成り立ちます。ng\_component\_outlet.ts の 42 行目は「今の view container の親の injector（outlet と同じ要素の providers は含まない）」が実装どおりで、実装を `this._viewContainerRef.injector` に替えるのは、同じ要素の providers が急に見えるようになる振る舞いの変更です。どちらにするにしても、ng\_component\_outlet\_spec.ts に同じ要素で provide するディレクティブを置いた it を足すと、今の振る舞いが記録されます。38 行目の「will be bind」は bound に。

## 聞かれそうな質問

**Q. `[ngClass]` に `Set` を渡せますか？**

渡せます。実装は配列と同じに扱います（L133）。説明文の一覧（65〜69 行目）には無く、44 行目の例の記号にだけ出てきます。

**Q. `[ngStyle]="{'width.px': '10px'}"` はどうなりますか？**

単位を足して `10pxpx` を書こうとし、ブラウザーに捨てられます。単位つきのキーには数（か単位の無い文字列）を渡します。

**Q. `[ngComponentOutlet]` と同じ要素のディレクティブが provide した値を、描くコンポーネントから inject できますか？**

既定ではできません。既定の親は `parentInjector` で、同じ要素の providers を含みません。`ngComponentOutletInjector` に `Injector.create({providers, parent})` を渡すか、外側の要素で provide します。

**Q. `ngComponentOutletContent` の配列はどの `<ng-content>` に入りますか？**

配列の順番がテンプレートの `<ng-content>` の順番に対応し、`select` の条件では振り分けません。`select` の無い `<ng-content>` が 2 つあれば、例のように 2 つの配列がそれぞれに入ります。

**Q. `ngTemplateOutletContext` に文字列を渡すとどうなりますか？**

`TypeError: Reflect.get called on non-object` で止まります。29 行目の「object であるべき」は必須の条件です。`null` は例外にならず、変数は全部 `undefined` です。

## 読み終えて

- `NgClass` は文字列・配列・`Set`・オブジェクトを受け、どの形でも空白（`/\s+/`）で名前を切る。使い方の例 44 行目は記号で、コンパイルできない。
- `NgStyle` の単位は値の後ろに文字をつなぐだけ。`'font-style.em'` の例はブラウザーに捨てられる。
- `NgTemplateOutlet` の context は本当に object でなければならず、`null` はよいが文字列は例外。
- `NgComponentOutlet` の既定の injector は view container の親で、同じ要素の providers は見えない。content は `<ng-content>` の順に入る。

---

← 前: [構造ディレクティブの説明文：NgIf・NgForOf・NgSwitch・NgPlural](05-cmd-structural.md)  
次: [AsyncPipe と小さな pipe の説明文](07-cmd-pipes.md) →
