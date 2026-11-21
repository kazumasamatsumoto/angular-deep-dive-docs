[目次](../README.md) › [common の説明文の読み残し](README.md) › 第 5 回 / 全 9 回

# 構造ディレクティブの説明文：NgIf・NgForOf・NgSwitch・NgPlural

> directives/ng\_if.ts・ng\_for\_of.ts・ng\_switch.ts・ng\_plural.ts の未読の行：else と then、as と let の局所変数、trackBy の約束、NgSwitch の既定、例のテンプレートが今のコンパイラーで通るか。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-structural)

---

この章で分かること：`NgIf`・`NgForOf`・`NgSwitch`・`NgPlural` の説明文（angular.dev の API リファレンスになる JSDoc）が約束していることと、それが本物でそのとおりに動くかどうか。説明文の中の例のテンプレートが、今のコンパイラーの strictTemplates の型検査に通るかどうかも確かめます。結果として、`NgForOf` の「置いた要素が複製の親になる」と、`NgPlural` の例（en-US で 2 を渡すと例外）の 2 つが実物と合いませんでした。

読む対象は `packages/common/src/directives/` の `ng_if.ts`・`ng_for_of.ts`・`ng_switch.ts`・`ng_plural.ts` の説明文と、説明文の `{@example}` が指す `packages/examples/common/ngIf/ts/module.ts`（../angular、8576f161ae4）です。実装の行（ビューの出し入れ、`_matchCase`、differ の作り方）は[NgIf・NgSwitch・NgPlural の章](../cmn/04-cmn-ng-if-switch.md)と[NgForOf と IterableDiffer の章](../cmn/03-cmn-ng-for-of.md)が読んでいるので、ここでは繰り返さずに行だけ指します。省略形の `*` が `<ng-template>` になる仕組みと型の絞り込みは[テンプレートのガードの章](../typecheck/14-typecheck-template-guards.md)にあります。

1. [1. NgOptimizedImage](01-cmd-image.md)
2. [2. 画像のローダー](02-cmd-image-loaders.md)
3. [3. 日付の書式](03-cmd-date.md)
4. [4. 数と i18n の pipe](04-cmd-number.md)
5. **5. 構造ディレクティブ**（この章）
6. [6. NgClass・NgStyle と outlet](06-cmd-attr-outlets.md)
7. [7. AsyncPipe と小さな pipe](07-cmd-pipes.md)
8. [8. Location](08-cmd-location.md)
9. [9. spec と issue](09-cmd-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 「構造ディレクティブ」は、テンプレート（`<ng-template>`）を受け取り、`ViewContainerRef` でその複製（埋め込みビュー）を出し入れするディレクティブです。この章の 4 つはどれも v20 で deprecated になり、`@if`・`@for`・`@switch` が後継です。それでも説明文は angular.dev に載り続けているので、書いてあることが正しいかは今も意味があります。

## 1. NgIf：条件は Boolean に直して読む

📄 `angular/packages/common/src/directives/ng_if.ts` L21–46 （▶ の行: 22–27）

````ts
21 │ /**
22 ▶  * A structural directive that conditionally includes a template based on the value of
23 ▶  * an expression coerced to Boolean.
24 ▶  * When the expression evaluates to true, Angular renders the template
25 ▶  * provided in a `then` clause, and when  false or null,
26 ▶  * Angular renders the template provided in an optional `else` clause. The default
27 ▶  * template for the `else` clause is blank.
28 │  *
29 │  * A [shorthand form](guide/directives/structural-directives#structural-directive-shorthand) of the directive,
30 │  * `*ngIf="condition"`, is generally used, provided
31 │  * as an attribute of the anchor element for the inserted template.
32 │  * Angular expands this into a more explicit version, in which the anchor element
33 │  * is contained in an `<ng-template>` element.
34 │  *
35 │  * Simple form with shorthand syntax:
36 │  *
37 │  * ```html
38 │  * <div *ngIf="condition">Content to render when condition is true.</div>
39 │  * ```
40 │  *
41 │  * Simple form with expanded syntax:
42 │  *
43 │  * ```html
44 │  * <ng-template [ngIf]="condition"><div>Content to render when condition is
45 │  * true.</div></ng-template>
46 │  * ```
````

22〜23 行目は「Boolean に直した式の値で出し分ける」と言い、24〜26 行目は「true なら then、false か null なら else」と例を 2 つだけ挙げます。実装は `_updateView` の `if (this._context.$implicit)` で JavaScript の真偽の判定をそのまま使うので（[NgIf の章](../cmn/04-cmn-ng-if-switch.md)の 2 節）、`undefined`・`0`・`''`・`NaN` も else、`'x'` や空の配列 `[]` は then です。デモの 1 つ目のボタンで 9 つの値を通しました。26〜27 行目「else の既定は空」のとおり、else を書かなければ何も出ません。

📄 `angular/packages/common/src/directives/ng_if.ts` L47–69 （▶ の行: 58, 67）

````ts
47 │  *
48 │  * Form with an "else" block:
49 │  *
50 │  * ```html
51 │  * <div *ngIf="condition; else elseBlock">Content to render when condition is true.</div>
52 │  * <ng-template #elseBlock>Content to render when condition is false.</ng-template>
53 │  * ```
54 │  *
55 │  * Shorthand form with "then" and "else" blocks:
56 │  *
57 │  * ```html
58 ▶  * <div *ngIf="condition; then thenBlock else elseBlock"></div>
59 │  * <ng-template #thenBlock>Content to render when condition is true.</ng-template>
60 │  * <ng-template #elseBlock>Content to render when condition is false.</ng-template>
61 │  * ```
62 │  *
63 │  * Form with storing the value locally:
64 │  *
65 │  * ```html
66 │  * <div *ngIf="condition as value; else elseBlock">{{value}}</div>
67 ▶  * <ng-template #elseBlock>Content to render when value is null.</ng-template>
68 │  * ```
69 │  *
````

5 つの形はどれも、型の付いたフィールドを置けば strictTemplates の ngc に通りました（テストの節）。58 行目は `then thenBlock else elseBlock` の間に `;` がありませんが、マイクロ構文（`*` の後ろの小さな文法）は区切りの `;` を省いてよいので、そのまま通ります。67 行目は「value が null のときに描く」と書きますが、1 つ目の表のとおり、else は `null` に限らず偽の値すべてで描かれます。

## 2. 外の then テンプレートを実行中に替える

📄 `angular/packages/common/src/directives/ng_if.ts` L70–96 （▶ の行: 90–93, 95）

```ts
70 │  * @usageNotes
71 │  *
72 │  * The `*ngIf` directive is most commonly used to conditionally show an inline template,
73 │  * as seen in the following  example.
74 │  * The default `else` template is blank.
75 │  *
76 │  * {@example common/ngIf/ts/module.ts region='NgIfSimple'}
77 │  *
78 │  * ### Showing an alternative template using `else`
79 │  *
80 │  * To display a template when `expression` evaluates to false, use an `else` template
81 │  * binding as shown in the following example.
82 │  * The `else` binding points to an `<ng-template>`  element labeled `#elseBlock`.
83 │  * The template can be defined anywhere in the component view, but is typically placed right after
84 │  * `ngIf` for readability.
85 │  *
86 │  * {@example common/ngIf/ts/module.ts region='NgIfElse'}
87 │  *
88 │  * ### Using an external `then` template
89 │  *
90 ▶  * In the previous example, the then-clause template is specified inline, as the content of the
91 ▶  * tag that contains the `ngIf` directive. You can also specify a template that is defined
92 ▶  * externally, by referencing a labeled `<ng-template>` element. When you do this, you can
93 ▶  * change which template to use at runtime, as shown in the following example.
94 │  *
95 ▶  * {@example common/ngIf/ts/module.ts region='NgIfThenElse'}
96 │  *
```

95 行目が指す例（`NgIfThenElse`）は、`<div *ngIf="show; then thenBlock; else elseBlock">this is ignored</div>` の `thenBlock` をボタンで primary と secondary の `<ng-template>` に替えるものです。デモで同じ操作をすると「Primary text to show → Secondary text to show → Alternate text while primary text is hidden」と移り、`this is ignored` は一度も出ませんでした。then を外から渡すと、`*ngIf` を置いた要素の中身（暗黙のテンプレート）は `ngIfThen` の入力に上書きされて使われません。`ngIfThen` の setter が `_thenViewRef = null` にしてから描き直すので（[NgIf の章](../cmn/04-cmn-ng-if-switch.md)の 1 節）、then を替えると今のビューは捨てて作り直しです。

## 3. as と、購読が 1 つで済むこと

📄 `angular/packages/common/src/directives/ng_if.ts` L97–115 （▶ の行: 104, 106–108, 110–113）

```ts
 97 │  * ### Storing a conditional result in a variable
 98 │  *
 99 │  * You might want to show a set of properties from the same object. If you are waiting
100 │  * for asynchronous data, the object can be undefined.
101 │  * In this case, you can use `ngIf` and store the result of the condition in a local
102 │  * variable as shown in the following example.
103 │  *
104 ▶  * {@example common/ngIf/ts/module.ts region='NgIfAs'}
105 │  *
106 ▶  * This code uses only one `AsyncPipe`, so only one subscription is created.
107 ▶  * The conditional statement stores the result of `userStream|async` in the local variable `user`.
108 ▶  * You can then bind the local `user` repeatedly.
109 │  *
110 ▶  * The conditional displays the data only if `userStream` returns a value,
111 ▶  * so you don't need to use the
112 ▶  * safe-navigation-operator (`?.`)
113 ▶  * to guard against null values when accessing properties.
114 │  * You can display an alternative template while waiting for the data.
115 │  *
```

📄 `angular/packages/examples/common/ngIf/ts/module.ts` L78–106 （▶ の行: 85–86, 88）

```ts
 78 │ // #docregion NgIfAs
 79 │ @Component({
 80 │   selector: 'ng-if-as',
 81 │   imports: [NgIf, JsonPipe, AsyncPipe],
 82 │   template: `
 83 │     <button (click)="nextUser()">Next User</button>
 84 │     <br />
 85 ▶     <div *ngIf="userObservable | async as user; else loading">
 86 ▶       Hello {{ user.last }}, {{ user.first }}!
 87 │     </div>
 88 ▶     <ng-template #loading let-user>Waiting... (user is {{ user | json }})</ng-template>
 89 │   `,
 90 │ })
 91 │ export class NgIfAs {
 92 │   userObservable = new Subject<{first: string; last: string}>();
 93 │   first = ['John', 'Mike', 'Mary', 'Bob'];
 94 │   firstIndex = 0;
 95 │   last = ['Smith', 'Novotny', 'Angular'];
 96 │   lastIndex = 0;
 97 │ 
 98 │   nextUser() {
 99 │     let first = this.first[this.firstIndex++];
100 │     if (this.firstIndex >= this.first.length) this.firstIndex = 0;
101 │     let last = this.last[this.lastIndex++];
102 │     if (this.lastIndex >= this.last.length) this.lastIndex = 0;
103 │     this.userObservable.next({first, last});
104 │   }
105 │ }
106 │ // #enddocregion
```
*104 行目が指す例（packages/examples/common/ngIf/ts/module.ts）*

106〜108 行目「`AsyncPipe` は 1 つで、購読も 1 つ」は、デモで `user` を 3 回使っても `subscribe` が 1 回でした（rxjs を使わず、`subscribe` の回数を数えるだけの Subscribable を渡しています）。例の 88 行目は else のテンプレートに `let-user` を付けています。else のビューも同じ `NgIfContext`（`$implicit` は条件の値）で作られるので、`user` には `null` が入り、「Waiting... (user is null)」になります。`''` を渡すと「(user is "")」で、else の中から偽の値そのものが読めます。110〜113 行目「`?.` が要らない」は型の側の話で、`ngTemplateContextGuard` が then のビューの `user` から `null` などを外すからです（[テンプレートのガードの章](../typecheck/14-typecheck-template-guards.md)）。

## 4. 省略形の展開

📄 `angular/packages/common/src/directives/ng_if.ts` L116–135 （▶ の行: 118–119, 123）

````ts
116 │  * ### Shorthand syntax
117 │  *
118 ▶  * The shorthand syntax `*ngIf` expands into two separate template specifications
119 ▶  * for the "then" and "else" clauses. For example, consider the following shorthand statement,
120 │  * that is meant to show a loading page while waiting for data to be loaded.
121 │  *
122 │  * ```html
123 ▶  * <div class="hero-list" *ngIf="heroes else loading">
124 │  *  ...
125 │  * </div>
126 │  *
127 │  * <ng-template #loading>
128 │  *  <div>Loading...</div>
129 │  * </ng-template>
130 │  * ```
131 │  *
132 │  * You can see that the "else" clause references the `<ng-template>`
133 │  * with the `#loading` label, and the template for the "then" clause
134 │  * is provided as the content of the anchor element.
135 │  *
````

📄 `angular/packages/common/src/directives/ng_if.ts` L136–162 （▶ の行: 136–139, 142, 160–161）

````ts
136 ▶  * However, when Angular expands the shorthand syntax, it creates
137 ▶  * another `<ng-template>` tag, with `ngIf` and `ngIfElse` directives.
138 ▶  * The anchor element containing the template for the "then" clause becomes
139 ▶  * the content of this unlabeled `<ng-template>` tag.
140 │  *
141 │  * ```html
142 ▶  * <ng-template [ngIf]="heroes" [ngIfElse]="loading">
143 │  *  <div class="hero-list">
144 │  *   ...
145 │  *  </div>
146 │  * </ng-template>
147 │  *
148 │  * <ng-template #loading>
149 │  *  <div>Loading...</div>
150 │  * </ng-template>
151 │  * ```
152 │  *
153 │  * The presence of the implicit template object has implications for the nesting of
154 │  * structural directives. For more on this subject, see
155 │  * [Structural Directives](guide/directives/structural-directives#one-structural-directive-per-element).
156 │  *
157 │  * @ngModule CommonModule
158 │  * @publicApi
159 │  *
160 ▶  * @deprecated 20.0
161 ▶  * Use the `@if` block instead. Intent to remove in a future major release
162 │  */
````

123 行目の `*ngIf="heroes else loading"` も `;` の無い形で、142 行目の展開した形と並べて ngc に通りました。136〜139 行目の「名前の無い `<ng-template>` をもう 1 つ作り、`ngIf` と `ngIfElse` を付ける」は、コンパイラーが `*` を見て行う変換の説明として合っています。118〜119 行目「then と else の 2 つのテンプレートの指定に分かれる」は、then がこの名前の無いテンプレート（`TemplateRef` として `NgIf` のコンストラクターに注入される物）、else が `ngIfElse` の入力という意味です。160〜161 行目で v20 から deprecated です。

## 5. NgForOf：置いた要素は「親」にならない

📄 `angular/packages/common/src/directives/ng_for_of.ts` L73–90 （▶ の行: 76–77, 81–82, 88）

````ts
73 │ /**
74 │  * A [structural directive](guide/directives/structural-directives) that renders
75 │  * a template for each item in a collection.
76 ▶  * The directive is placed on an element, which becomes the parent
77 ▶  * of the cloned templates.
78 │  *
79 │  * The `ngForOf` directive is generally used in the
80 │  * [shorthand form](guide/directives/structural-directives#structural-directive-shorthand) `*ngFor`.
81 ▶  * In this form, the template to be rendered for each iteration is the content
82 ▶  * of an anchor element containing the directive.
83 │  *
84 │  * The following example shows the shorthand syntax with some options,
85 │  * contained in an `<li>` element.
86 │  *
87 │  * ```html
88 ▶  * <li *ngFor="let item of items; index as i; trackBy: trackByFn">...</li>
89 │  * ```
90 │  *
````

76〜77 行目は「ディレクティブを置いた要素が、複製されたテンプレートの親になる」と書きます。実物は逆で、置いた要素そのものが複製されます。デモ（Node の記録。ページの Chrome でも同じ形でした）で `<ul><li *ngFor="let x of xs">` に 3 つ渡すと、`ul` の中は `<li>a</li><li>b</li><li>c</li><!---->` でした。`li` は 3 つ兄弟に並び、親は `ul` のままです（末尾のコメントは `ViewContainerRef` の目印）。すぐ後の 81〜82 行目「繰り返すテンプレートは、ディレクティブを含む要素（anchor element）の中身」とも合いません。`*` の展開で `<li>` ごと `<ng-template>` の中に入るので、繰り返すのは要素の中身ではなく要素を含めた全体です（91〜94 行目の展開の説明は正しく書いています）。この 2 文は 6c3b57a9682（2018-11-30、`docs: add api doc for ngfor (#27377)`）から変わっていません。

📄 `angular/packages/common/src/directives/ng_for_of.ts` L91–114 （▶ の行: 91–94, 99–101, 108–111）

````ts
 91 ▶  * The shorthand form expands into a long form that uses the `ngForOf` selector
 92 ▶  * on an `<ng-template>` element.
 93 ▶  * The content of the `<ng-template>` element is the `<li>` element that held the
 94 ▶  * short-form directive.
 95 │  *
 96 │  * Here is the expanded version of the short-form example.
 97 │  *
 98 │  * ```html
 99 ▶  * <ng-template ngFor let-item [ngForOf]="items" let-i="index" [ngForTrackBy]="trackByFn">
100 ▶  *   <li>...</li>
101 ▶  * </ng-template>
102 │  * ```
103 │  *
104 │  * Angular automatically expands the shorthand syntax as it compiles the template.
105 │  * The context for each embedded view is logically merged to the current component
106 │  * context according to its lexical position.
107 │  *
108 ▶  * When using the shorthand syntax, Angular allows only [one structural directive
109 ▶  * on an element](guide/directives/structural-directives#one-structural-directive-per-element).
110 ▶  * If you want to iterate conditionally, for example,
111 ▶  * put the `*ngIf` on a container element that wraps the `*ngFor` element.
112 │  * For further discussion, see
113 │  * [Structural Directives](guide/directives/structural-directives#one-structural-directive-per-element).
114 │  *
````

99〜101 行目の展開形は 88 行目と同じ意味で、どちらも ngc に通りました（`trackByFn` を `(index: number, item: string) => string` にした場合）。108〜111 行目の「1 つの要素に構造ディレクティブは 1 つ」は、2 つ書くとコンパイルが NG5002 で止まる決まりです。

## 6. 局所変数

📄 `angular/packages/common/src/directives/ng_for_of.ts` L115–140 （▶ の行: 123–125, 130, 132, 134–139）

````ts
115 │  * @usageNotes
116 │  *
117 │  * ### Local variables
118 │  *
119 │  * `NgForOf` provides exported values that can be aliased to local variables.
120 │  * For example:
121 │  *
122 │  *  ```html
123 ▶  * <li *ngFor="let user of users; index as i; first as isFirst">
124 ▶  *    {{i}}/{{users.length}}. {{user}} <span *ngIf="isFirst">default</span>
125 ▶  * </li>
126 │  * ```
127 │  *
128 │  * The following exported values can be aliased to local variables:
129 │  *
130 ▶  * - `$implicit: T`: The value of the individual items in the iterable (`ngForOf`).
131 │  * - `ngForOf: NgIterable<T>`: The value of the iterable expression. Useful when the expression is
132 ▶  * more complex then a property access, for example when using the async pipe (`userStreams |
133 │  * async`).
134 ▶  * - `index: number`: The index of the current item in the iterable.
135 ▶  * - `count: number`: The length of the iterable.
136 ▶  * - `first: boolean`: True when the item is the first item in the iterable.
137 ▶  * - `last: boolean`: True when the item is the last item in the iterable.
138 ▶  * - `even: boolean`: True when the item has an even index in the iterable.
139 ▶  * - `odd: boolean`: True when the item has an odd index in the iterable.
140 │  *
````

123〜125 行目の例に `count`・`last`・`even`・`odd` を足して 3 人で描くと、`0/3. Ann default [count=3 last=false even=true odd=false]` から `2/3. Cy [count=3 last=true even=true odd=false]` まで、130〜139 行目のとおりでした。`first`・`last`・`even`・`odd` は `NgForOfContext` の getter で、`index` と `count` から毎回計算します（[NgForOf の章](../cmn/03-cmn-ng-for-of.md)の 7 節）。132 行目の「more complex **then** a property access」は than の誤りです（同じ文が `NgForOfContext` の `ngForOf` の説明、L40 にもあります）。

## 7. 変化の伝え方と trackBy

📄 `angular/packages/common/src/directives/ng_for_of.ts` L141–173 （▶ の行: 156–160, 163–165）

```ts
141 │  * ### Change propagation
142 │  *
143 │  * When the contents of the iterator changes, `NgForOf` makes the corresponding changes to the DOM:
144 │  *
145 │  * * When an item is added, a new instance of the template is added to the DOM.
146 │  * * When an item is removed, its template instance is removed from the DOM.
147 │  * * When items are reordered, their respective templates are reordered in the DOM.
148 │  *
149 │  * Angular uses object identity to track insertions and deletions within the iterator and reproduce
150 │  * those changes in the DOM. This has important implications for animations and any stateful
151 │  * controls that are present, such as `<input>` elements that accept user input. Inserted rows can
152 │  * be animated in, deleted rows can be animated out, and unchanged rows retain any unsaved state
153 │  * such as user input.
154 │  * For more on animations, see [Transitions and Triggers](guide/legacy-animations/transition-and-triggers).
155 │  *
156 ▶  * The identities of elements in the iterator can change while the data does not.
157 ▶  * This can happen, for example, if the iterator is produced from an RPC to the server, and that
158 ▶  * RPC is re-run. Even if the data hasn't changed, the second response produces objects with
159 ▶  * different identities, and Angular must tear down the entire DOM and rebuild it (as if all old
160 ▶  * elements were deleted and all new elements inserted).
161 │  *
162 │  * To avoid this expensive operation, you can customize the default tracking algorithm.
163 ▶  * by supplying the `trackBy` option to `NgForOf`.
164 ▶  * `trackBy` takes a function that has two arguments: `index` and `item`.
165 ▶  * If `trackBy` is given, Angular tracks changes by the return value of the function.
166 │  *
167 │  * @see [Structural Directives](guide/directives/structural-directives)
168 │  * @ngModule CommonModule
169 │  * @publicApi
170 │  *
171 │  * @deprecated 20.0
172 │  * Use the `@for` block instead. Intent to remove in a future major release
173 │  */
```

📄 `angular/packages/common/src/directives/ng_for_of.ts` L188–206 （▶ の行: 189, 191–193）

```ts
188 │   /**
189 ▶    * Specifies a custom `TrackByFunction` to compute the identity of items in an iterable.
190 │    *
191 ▶    * If a custom `TrackByFunction` is not provided, `NgForOf` will use the item's [object
192 ▶    * identity](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is)
193 ▶    * as the key.
194 │    *
195 │    * `NgForOf` uses the computed key to associate items in an iterable with DOM elements
196 │    * it produces for these items.
197 │    *
198 │    * A custom `TrackByFunction` is useful to provide good user experience in cases when items in an
199 │    * iterable rendered using `NgForOf` have a natural identifier (for example, custom ID or a
200 │    * primary key), and this iterable could be updated with new object instances that still
201 │    * represent the same underlying entity (for example, when data is re-fetched from the server,
202 │    * and the iterable is recreated and re-rendered, but most of the data is still the same).
203 │    *
204 │    * @see {@link TrackByFunction}
205 │    * @deprecated The `ngFor` directive is deprecated. Use the `@for` block instead.
206 │    */
```

156〜160 行目「中身が同じでも新しいオブジェクトなら DOM を全部作り直す」と、163〜165 行目「trackBy の戻り値で追う」を、ビューを作るたびに数える小さなディレクティブで数えました。id が同じ 3 件を作り直して渡すと、trackBy なしは 3 個作り直し、`(i, item) => item.id` は 0 個です。どちらも、同じ配列を逆に並べたときは 0 個（動かすだけ）でした。191〜193 行目の「既定は `Object.is` の同一性」も合っています。既定の `trackByIdentity` は要素そのものを鍵にし、differ は鍵を `Object.is` で比べます（core の default\_iterable\_differ.ts L33・L196。`NaN` どうしも同じと見なす）。

> [!WARNING]
> **ハマりどころ**
>
> 説明文に書かれていないことが 1 つあります。trackBy の関数は、最初に differ を作るときに 1 回だけ渡され、あとから `ngForTrackBy` を替えても効きません（ng\_for\_of.ts L263、[NgForOf の章](../cmn/03-cmn-ng-for-of.md)の 2 節）。189 行目「computes the identity」の関数は、最初の 1 つです。

## 8. ngForTemplate

📄 `angular/packages/common/src/directives/ng_for_of.ts` L234–252 （▶ の行: 242–244）

```ts
234 │ 
235 │   /**
236 │    * A reference to the template that is stamped out for each item in the iterable.
237 │    * @see [template reference variable](guide/templates/variables#template-reference-variables)
238 │    * @deprecated The `ngFor` directive is deprecated. Use the `@for` block instead.
239 │    */
240 │   @Input()
241 │   set ngForTemplate(value: TemplateRef<NgForOfContext<T, U>>) {
242 ▶     // The current type is too restrictive; a template that just uses index, for example,
243 ▶     // should be acceptable.
244 ▶     if (value) {
245 │       this._template = value;
246 │     }
247 │   }
248 │ 
249 │   /**
250 │    * Applies the changes when needed.
251 │    * @docs-private
252 │    */
```

244 行目の `if (value)` のため、`[ngForTemplate]="null"` は無視されて元のテンプレートのままです。242〜243 行目のコメントは型の話で、`index` だけを使うテンプレートも受け入れたい、という意味です。spec の `should use a default template if a custom one is null`（ng\_for\_spec.ts 291）がこの振る舞いを固めています。

## 9. NgSwitch：一致したものは全部、default はどこでも

📄 `angular/packages/common/src/directives/ng_switch.ts` L49–78 （▶ の行: 55–58, 69）

````ts
49 │ /**
50 │  * @ngModule CommonModule
51 │  *
52 │  * @description
53 │  * The `[ngSwitch]` directive on a container specifies an expression to match against.
54 │  * The expressions to match are provided by `ngSwitchCase` directives on views within the container.
55 ▶  * - Every view that matches is rendered.
56 ▶  * - If there are no matches, a view with the `ngSwitchDefault` directive is rendered.
57 ▶  * - Elements within the `[NgSwitch]` statement but outside of any `NgSwitchCase`
58 ▶  * or `ngSwitchDefault` directive are preserved at the location.
59 │  *
60 │  * @usageNotes
61 │  * Define a container element for the directive, and specify the switch expression
62 │  * to match against as an attribute:
63 │  *
64 │  * ```html
65 │  * <container-element [ngSwitch]="switch_expression">
66 │  * ```
67 │  *
68 │  * Within the container, `*ngSwitchCase` statements specify the match expressions
69 ▶  * as attributes. Include `*ngSwitchDefault` as the final case.
70 │  *
71 │  * ```html
72 │  * <container-element [ngSwitch]="switch_expression">
73 │  *    <some-element *ngSwitchCase="match_expression_1">...</some-element>
74 │  * ...
75 │  *    <some-element *ngSwitchDefault>...</some-element>
76 │  * </container-element>
77 │  * ```
78 │  *
````

📄 `angular/packages/common/src/directives/ng_switch.ts` L79–116 （▶ の行: 94, 100–101）

````ts
 79 │  * ### Usage Examples
 80 │  *
 81 │  * The following example shows how to use more than one case to display the same view:
 82 │  *
 83 │  * ```html
 84 │  * <container-element [ngSwitch]="switch_expression">
 85 │  *   <!-- the same view can be shown in more than one case -->
 86 │  *   <some-element *ngSwitchCase="match_expression_1">...</some-element>
 87 │  *   <some-element *ngSwitchCase="match_expression_2">...</some-element>
 88 │  *   <some-other-element *ngSwitchCase="match_expression_3">...</some-other-element>
 89 │  *   <!--default case when there are no matches -->
 90 │  *   <some-element *ngSwitchDefault>...</some-element>
 91 │  * </container-element>
 92 │  * ```
 93 │  *
 94 ▶  * The following example shows how cases can be nested:
 95 │  * ```html
 96 │  * <container-element [ngSwitch]="switch_expression">
 97 │  *       <some-element *ngSwitchCase="match_expression_1">...</some-element>
 98 │  *       <some-element *ngSwitchCase="match_expression_2">...</some-element>
 99 │  *       <some-other-element *ngSwitchCase="match_expression_3">...</some-other-element>
100 ▶  *       <ng-container *ngSwitchCase="match_expression_3">
101 ▶  *         <!-- use a ng-container to group multiple root nodes -->
102 │  *         <inner-element></inner-element>
103 │  *         <inner-other-element></inner-other-element>
104 │  *       </ng-container>
105 │  *       <some-element *ngSwitchDefault>...</some-element>
106 │  *     </container-element>
107 │  * ```
108 │  *
109 │  * @publicApi
110 │  * @see {@link NgSwitchCase}
111 │  * @see {@link NgSwitchDefault}
112 │  * @see [Structural Directives](guide/directives/structural-directives)
113 │  *
114 │  * @deprecated 20.0
115 │  * Use the `@switch` block instead. Intent to remove in a future major release
116 │  */
````

55 行目「一致したビューは全部描く」、56 行目「一致が無ければ default」、57〜58 行目「ケースの外の要素はその場に残る」は、デモの 1 つ目のテンプレートで 3 つとも確かめました（`'c'` で `[c] [c again] [always]`）。94 行目は「ケースを入れ子にできる例」と書きますが、96〜106 行目の例に入れ子はありません。100 行目の `<ng-container *ngSwitchCase>` は複数の要素を 1 つのケースにまとめる形で、ケースの中にケースを置く形ではありません。ケースを `*ngIf` などの中に入れると既定のケースがずれる issue #47578 は、[NgSwitch の章](../cmn/04-cmn-ng-if-switch.md)のデモで再現しています。94 行目の見出しは 850b86749c2（2018-11-30）で、2016 年の例（9cee8bcc83c）の前に足されました。

📄 `angular/packages/common/src/directives/ng_switch.ts` L169–204 （▶ の行: 176, 181, 195–196）

````ts
169 │ 
170 │ /**
171 │  * @ngModule CommonModule
172 │  *
173 │  * @description
174 │  * Provides a switch case expression to match against an enclosing `ngSwitch` expression.
175 │  * When the expressions match, the given `NgSwitchCase` template is rendered.
176 ▶  * If multiple match expressions match the switch expression value, all of them are displayed.
177 │  *
178 │  * @usageNotes
179 │  *
180 │  * Within a switch container, `*ngSwitchCase` statements specify the match expressions
181 ▶  * as attributes. Include `*ngSwitchDefault` as the final case.
182 │  *
183 │  * ```html
184 │  * <container-element [ngSwitch]="switch_expression">
185 │  *   <some-element *ngSwitchCase="match_expression_1">...</some-element>
186 │  *   ...
187 │  *   <some-element *ngSwitchDefault>...</some-element>
188 │  * </container-element>
189 │  * ```
190 │  *
191 │  * Each switch-case statement contains an in-line HTML template or template reference
192 │  * that defines the subtree to be selected if the value of the match expression
193 │  * matches the value of the switch expression.
194 │  *
195 ▶  * As of Angular v17 the NgSwitch directive uses strict equality comparison (`===`) instead of
196 ▶  * loose equality (`==`) to match different cases.
197 │  *
198 │  * @publicApi
199 │  * @see {@link NgSwitch}
200 │  * @see {@link NgSwitchDefault}
201 │  *
202 │  * @deprecated 20.0
203 │  * Use the `@case` block within a `@switch` block instead. Intent to remove in a future major release
204 │  */
````

📄 `angular/packages/common/src/directives/ng_switch.ts` L237–253 （▶ の行: 243–245）

```ts
237 │ 
238 │ /**
239 │  * @ngModule CommonModule
240 │  *
241 │  * @description
242 │  *
243 ▶  * Creates a view that is rendered when no `NgSwitchCase` expressions
244 ▶  * match the `NgSwitch` expression.
245 ▶  * This statement should be the final case in an `NgSwitch`.
246 │  *
247 │  * @publicApi
248 │  * @see {@link NgSwitch}
249 │  * @see {@link NgSwitchCase}
250 │  *
251 │  * @deprecated 20.0
252 │  * Use the `@default` block within a `@switch` block instead. Intent to remove in a future major release
253 │  */
```

69・181・245 行目の「default は最後に置く」は守らなくても動きます。default を先頭と末尾に 2 つ置いたテンプレートで、`1` なら `[case 1]`、一致しない `2` なら default が 2 つとも出ました。既定を決めるのは最後の `NgSwitchCase` の `ngDoCheck` で（`_lastCaseCheckIndex === _caseCount`）、default の位置は関係しません。spec の `should allow defaults before cases`（ng\_switch\_spec.ts 216）も先頭の default を固めています。195〜196 行目の `===` は 4a44f732889（2024-01-30、#54158。開いていた issue #54156「ngSwitchCase の説明を直す」への対応）で書き足され、`'1'` は `1` のケースに一致しませんでした。

## 10. NgPlural：説明文の例は en-US で例外になる

📄 `angular/packages/common/src/directives/ng_plural.ts` L15–45 （▶ の行: 19–25, 37–40）

````ts
15 │ /**
16 │  * @ngModule CommonModule
17 │  *
18 │  * @usageNotes
19 ▶  * ```html
20 ▶  * <some-element [ngPlural]="value">
21 ▶  *   <ng-template ngPluralCase="=0">there is nothing</ng-template>
22 ▶  *   <ng-template ngPluralCase="=1">there is one</ng-template>
23 ▶  *   <ng-template ngPluralCase="few">there are a few</ng-template>
24 ▶  * </some-element>
25 ▶  * ```
26 │  *
27 │  * @description
28 │  *
29 │  * Adds / removes DOM sub-trees based on a numeric value. Tailored for pluralization.
30 │  *
31 │  * Displays DOM sub-trees that match the switch expression value, or failing that, DOM sub-trees
32 │  * that match the switch expression's pluralization category.
33 │  *
34 │  * To use this directive you must provide a container element that sets the `[ngPlural]` attribute
35 │  * to a switch expression. Inner elements with a `[ngPluralCase]` will display based on their
36 │  * expression:
37 ▶  * - if `[ngPluralCase]` is set to a value starting with `=`, it will only display if the value
38 ▶  *   matches the switch expression exactly,
39 ▶  * - otherwise, the view will be treated as a "category match", and will only display if exact
40 ▶  *   value matches aren't found and the value maps to its category for the defined locale.
41 │  *
42 │  * See http://cldr.unicode.org/index/cldr-spec/plural-rules
43 │  *
44 │  * @publicApi
45 │  */
````

19〜25 行目の例には `other` がありません。カテゴリを選ぶ `getPluralCategory` は「`=値` → ロケールのカテゴリ → `other`」の順に探し、どれも無ければ例外です（[NgPlural の章](../cmn/04-cmn-ng-if-switch.md)の 6 節）。en-US では 2 以上は `other` で `few` は使われないので、この例に 2 を渡すと、本番は `NG02308`、開発モードは `NG02308: No plural message found for value "2"` で変更検知が止まりました。37〜38 行目「`=` で始まる値は値と完全に一致したときだけ」は合っていますが、書いていないことが 1 つあります。`NgPluralCase` のコンストラクターは数に読める値に `=` を足すので（L114〜115、NgPlural の章）、`ngPluralCase="0"` も `=0` と同じです。デモの 2 つ目のテンプレートで `0` が `[0 と書いた]` を出しました。spec の `should display the template according to the exact numeric value`（ng\_plural\_spec.ts 48）はこの形を固めています。

📄 `angular/packages/common/src/directives/ng_plural.ts` L83–103 （▶ の行: 89–90, 94–97）

````ts
 83 │ 
 84 │ /**
 85 │  * @ngModule CommonModule
 86 │  *
 87 │  * @description
 88 │  *
 89 ▶  * Creates a view that will be added/removed from the parent {@link NgPlural} when the
 90 ▶  * given expression matches the plural expression according to CLDR rules.
 91 │  *
 92 │  * @usageNotes
 93 │  * ```html
 94 ▶  * <some-element [ngPlural]="value">
 95 ▶  *   <ng-template ngPluralCase="=0">...</ng-template>
 96 ▶  *   <ng-template ngPluralCase="other">...</ng-template>
 97 ▶  * </some-element>
 98 │  *```
 99 │  *
100 │  * See {@link NgPlural} for more details and example.
101 │  *
102 │  * @publicApi
103 │  */
````

94〜97 行目の例は `other` を持つので、どの数でも例外になりません。89〜90 行目「一致したときに足す・外す」の通り、値が変わるたびにビューを外して作ります。同じ `other` のまま 3 から 4 に変えても、ビューは壊されて 1 つ作り直されました（`_updateView` が毎回 `_clearViews` を呼ぶ。`NgSwitch` は一致が変わらなければ残します）。

> **🧪 DEMO 1 — 説明文の例を本物で描く**
>
> 押すと、本物の `@angular/common`（22.2.6）のディレクティブを使う小さなコンポーネントを行ごとに `createComponent` で作り（文書に付けない div の上）、`detectChanges` して文字と DOM の形を読みます。「説明と違う」の行は左に印を付けます。使ったテンプレートは下の 4 つの欄にあります。  
> NgForOf の表だけは、同じ関数（cmd-structural.demo-for.ts）を Node（domino の上の JIT、本番の設定）で実行した記録の再生です。NgForOf をこのページで読み込むと、本番ビルドの最初に読む JS（Initial total）が約 2.1 kB 増えたためです（動的 import にしても増えました）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-structural)

📄 `NgIf の表のテンプレート`

```
<span *ngIf="v; else elseBlock">then</span>
<ng-template #elseBlock>else</ng-template>

<div *ngIf="show; then thenBlock; else elseBlock">this is ignored</div>
<ng-template #primaryBlock>Primary text to show</ng-template>
<ng-template #secondaryBlock>Secondary text to show</ng-template>
<ng-template #elseBlock>Alternate text while primary text is hidden</ng-template>

<div *ngIf="u as user; else loading">Hello {{ user.last }}, {{ user.first }}!</div>
<ng-template #loading let-user>Waiting... (user is {{ user | json }})</ng-template>

<div *ngIf="userStream | async as user">{{ user.first }} / {{ user.last }} / {{ user.first }}</div>
```

📄 `NgForOf の表のテンプレート`

```
<li *ngFor="let user of users; index as i; first as isFirst; last as isLast;
            even as isEven; odd as isOdd; count as n">
  {{ i }}/{{ users.length }}. {{ user }} <span *ngIf="isFirst">default</span>
  [count={{ n }} last={{ isLast }} even={{ isEven }} odd={{ isOdd }}]
</li>

<ul><li *ngFor="let x of xs">{{ x }}</li></ul>

<li *ngFor="let item of items; trackBy: trackFn" cmdStMark>{{ item.name }}</li>
```

📄 `NgSwitch の表のテンプレート`

```
<div [ngSwitch]="v">
  <b *ngSwitchCase="'a'">[a]</b>
  <b *ngSwitchCase="'b'">[b]</b>
  <i *ngSwitchCase="'c'">[c]</i>
  <i *ngSwitchCase="'c'">[c again]</i>
  <p>[always]</p>
  <u *ngSwitchDefault>[default]</u>
</div>

<div [ngSwitch]="v">
  <u *ngSwitchDefault>[default 1]</u>
  <b *ngSwitchCase="1">[case 1]</b>
  <u *ngSwitchDefault>[default 2]</u>
</div>
```

📄 `NgPlural の表のテンプレート`

```
<p [ngPlural]="value">
  <ng-template ngPluralCase="=0">there is nothing</ng-template>
  <ng-template ngPluralCase="=1">there is one</ng-template>
  <ng-template ngPluralCase="few">there are a few</ng-template>
</p>

<p [ngPlural]="value">
  <ng-template ngPluralCase="0">[0 と書いた]</ng-template>
  <ng-template ngPluralCase="one">[one]</ng-template>
  <ng-template ngPluralCase="other"><i cmdStMark>[other]</i></ng-template>
</p>
```

> **🧪 DEMO 2 — 誤った使い方：開発モードと本番の文**
>
> 押すと、このページ（本番ビルド）で 3 つの誤った使い方を描き、出た例外を右の列に書きます（NgForOf の 2 行はページでは描きません）。左の 2 列は、同じ関数を Node（domino の上の JIT）で開発モードと本番で実行した記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-structural)

開発モードと本番で文が違うのは、どの例外も文を `ngDevMode && …` で作るからです。`ngSwitch` の外の `*ngSwitchCase` は、開発モードでは NG02000 で止まり、本番では確かめを飛ばして `null` の `_addCase` を呼ぶ `TypeError` になります（ng\_switch.ts L221〜225、[NgSwitch の章](../cmn/04-cmn-ng-if-switch.md)）。オブジェクトを `ngForOf` に渡したときは、開発モードは `NgForOf` が包んだ NG02200（keyvalue pipe を勧める文つき）、本番は core の differ が投げる NG0901 で、番号まで変わります。

## ここまでの呼び出し

- 👤 `<p [ngPlural]="2">`（=0・=1・few だけ）
  - `NgPluralCase の constructor → ngPlural.addCase('=0' | '=1' | 'few')` — ng\_plural.ts L114〜115 — *数に読める値は = を足す*
  - `set ngPlural(2) → _updateView(2)` — ng\_plural.ts L56〜69
    - `getPluralCategory(2, ['=0', '=1', 'few'], NgLocaleLocalization)` — i18n/localization.ts L34〜60 — *'=2' も 'other'（en-US）も 'other' も無い*
      - `throw new RuntimeError(NO_PLURAL_MESSAGE_FOUND, ngDevMode && …)` — localization.ts L56〜59 — *本番は NG02308 だけ*

## テストと直し方

| ファイル（packages/common/test/directives/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `ng_if_spec.ts` | `ngIf directive`（16）› `then/else templates`（155）› `should support then and else`（172）・`should support binding to variable using as`（262） | 1〜3 節。条件は真偽の値と配列の長さで、`0`・`''` を渡す it は無い |
| `ng_if_spec.ts` | `Type guarding`（297）› `should throw when then block is not template`（298） | NG02020（DEMO 2 の表の 2 つ目） |
| `ng_for_spec.ts` | `ngFor`（18）› `should display indices correctly`（212）〜 `odd`（270）、`track by`（310）› `should not replace tracked items`（341） | 6・7 節。`should use a default template if a custom one is null`（291）が 8 節 |
| `ng_switch_spec.ts` | `should support multiple whens with the same value`（78）・`should use === to match cases`（99）・`should allow defaults before cases`（216） | 9 節の 3 つ |
| `ng_plural_spec.ts` | `should display the template according to the exact numeric value`（48）・`should default to other when no matches are found`（114） | 10 節。例外は ../i18n/localization\_spec.ts の `should report an error when the "other" category is not present`（182） |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（絞らない）          667 specs, 0 failures
--filter=^ngIf directive   Ran 15 of 667 specs、0 failures
--filter=^ngFor            Ran 34 of 667 specs、0 failures
--filter=^NgSwitch         Ran 12 of 667 specs、0 failures
--filter=^ngPlural         Ran 8 of 667 specs、0 failures

# 説明文の例と packages/examples/common/ngIf の例を、strictTemplates の ngc にかける
# （サイトの @angular/compiler-cli 22.2.6、--strict、strictTemplates）
$ ngc -p tsconfig.json
doc/structural.ts:141:4 - error NG8001: 'some-element' is not a known element
doc/structural.ts:142:4 - error NG8001: 'some-element' is not a known element
#   ↑ CUSTOM_ELEMENTS_SCHEMA を付けなかった 1 つだけ。付けた 5 つと ex/ngif.ts はエラー 0
```

直すとしたら説明文です。ng\_for\_of.ts の 76〜77 行目は「置いた要素が、項目ごとに複製される」、81〜82 行目は「置いた要素を含めた全体」に、132 行目の then は than に。ng\_plural.ts の 19〜25 行目の例には `<ng-template ngPluralCase="other">` を足すと、どのロケールでも例外になりません。37〜40 行目には「数だけの値は `=` を付けたのと同じ」を足せます。ng\_switch.ts の 94 行目は「1 つのケースに複数の要素をまとめる例」が中身に合います。どれも説明文だけの変更で、spec は今の振る舞いをすでに固めています（`ngPluralCase="0"` は 48、例外は localization\_spec.ts の 182）。`NgPlural` が同じカテゴリでもビューを作り直す振る舞いを固める it は無いので、変えるなら ng\_plural\_spec.ts に「同じケースのままならビューを残す」の it を足し、`_updateView` で前と同じ `SwitchView` なら何もしないようにします。

## 聞かれそうな質問

**Q. `*ngIf="count"` で count が 0 のとき、then は出ますか？**

出ません。条件は JavaScript の真偽で読むので（22〜23 行目「coerced to Boolean」）、0 は else です。説明文の 24〜26 行目は true と false・null しか書いていませんが、`''`・`NaN`・`undefined` も else でした。

**Q. `<li *ngFor>` の li は、複製の親ですか？**

いいえ。li そのものが項目の数だけ兄弟として並び、親は外側の要素のままです（DEMO 1 の NgForOf の表）。説明文の 76〜77 行目はこの点で実物と逆です。

**Q. 説明文の NgPlural の例をそのまま使っても大丈夫ですか？**

en-US では 0 と 1 以外で NG02308 になります。`few` は en-US では使われず、`other` も無いからです。`ngPluralCase="other"` を足せば例外になりません。

**Q. `*ngSwitchDefault` は最後に書かないといけませんか？**

動きは変わりません。既定を決めるのは最後の `NgSwitchCase` の `ngDoCheck` で、default の位置は使われません（spec 216 も先頭の default を固めています）。説明文の「最後に置く」は読みやすさの勧めです。

**Q. 説明文の中のテンプレートの例は、strictTemplates に通りますか？**

この章の 4 つのファイルの例は、`<some-element>` のような置き物の要素名を `CUSTOM_ELEMENTS_SCHEMA` で許せば、全部通りました。schemas を付けなければ NG8001 です。`packages/examples/common/ngIf` の例も通ります。

## 読み終えて

- `NgIf` の条件は真偽で読み、else は偽の値すべてで出る。else のテンプレートにも `$implicit`（条件の値）が入る。
- `NgForOf` の説明文の「置いた要素が複製の親になる」は逆で、置いた要素が複製される。局所変数と trackBy の約束はそのとおり。
- `NgSwitch` は一致したケースを全部描き、default の位置は自由。「入れ子の例」の見出しは中身と合わない。
- `NgPlural` の説明文の例は `other` が無く、en-US の 2 以上で例外になる。数だけの `ngPluralCase` は `=` 付きと同じ。
- 誤った使い方の例外は、開発モードと本番で文も番号も変わることがある（NG02200 と NG0901）。

---

← 前: [数と i18n の pipe の説明文：DecimalPipe・PercentPipe・CurrencyPipe・I18nPluralPipe・I18nSelectPipe](04-cmd-number.md)  
次: [NgClass・NgStyle と outlet の説明文](06-cmd-attr-outlets.md) →
