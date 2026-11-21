[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 1 回 / 全 10 回

# @Directive の説明文：selector・inputs・host・providers・exportAs

> metadata/directives.ts の Directive の未読の行：selector の書ける形、inputs と outputs の文字列の形、host の書き方、providers、exportAs、queries、standalone、hostDirectives の説明と例。説明の約束を本物で確かめる。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-directive)

---

この章で分かること：`@Directive` の説明文（angular.dev の API リファレンスになる JSDoc）が約束する selector の書ける形、`inputs` と `outputs` の文字列の形、`providers`・`exportAs`・`queries`・`host`・`jit`・`standalone`・`hostDirectives` を、本物の小さなディレクティブで 1 つずつ確かめます。説明と合わなかったのは 4 つです。`queries` の例が TypeScript として書けないこと（そして JIT では `queries` が丸ごと読まれないこと）、「要素の境をまたがない」と書かれた `'form input'` が黙って `input` になること、`host` の静的な属性の説明（312〜313 行目）、`exportAs` にカンマで複数の名前を書けることが書いていないことです。

読む対象は `packages/core/src/metadata/directives.ts` の L20〜378（../angular、8576f161ae4）です。デコレーターが実行されたときの流れ（`makeDecorator`・`compileDirective`）は[@NgModule デコレータの章](../ngmodule/02-ngmodule-decorator.md)と[standalone のデコレーターの章](../standalone/02-standalone-decorator.md)、ngtsc がこのメタデータを読む所は[DirectiveDecoratorHandler の章](../ngtsc/09-ngtsc-directive-handler.md)にあります。

1. **1. @Directive**（この章）
2. [2. @Component](02-crd-component.md)
3. [3. クエリと @NgModule](03-crd-query-module.md)
4. [4. @Injectable・InjectionToken](04-crd-injectable-token.md)
5. [5. Provider の形](05-crd-provider.md)
6. [6. inject と Injector](06-crd-inject.md)
7. [7. ライフサイクル](07-crd-lifecycle.md)
8. [8. differ](08-crd-differs.md)
9. [9. スケジューラー](09-crd-scheduling.md)
10. [10. spec と issue](10-crd-tests-issues.md)

## 1. 入口：standalone が既定、NgModule に入れるなら false

📄 `angular/packages/core/src/metadata/directives.ts` L20–49 （▶ の行: 26–27, 33–34, 43–44, 46, 48）

````ts
20 │ /**
21 │  * Type of the Directive decorator / constructor function.
22 │  * @publicApi
23 │  */
24 │ export interface DirectiveDecorator {
25 │   /**
26 ▶    * Decorator that marks a class as an Angular directive.
27 ▶    * You can define your own directives to attach custom behavior to elements in the DOM.
28 │    *
29 │    * The options provide configuration metadata that determines
30 │    * how the directive should be processed, instantiated and used at
31 │    * runtime.
32 │    *
33 ▶    * Directive classes, like component classes, can implement
34 ▶    * [life-cycle hooks](guide/components/lifecycle) to influence their configuration and behavior.
35 │    *
36 │    *
37 │    * @usageNotes
38 │    * To define a directive, mark the class with the decorator and provide metadata.
39 │    *
40 │    * ```ts
41 │    * import {Directive} from '@angular/core';
42 │    *
43 ▶    * @Directive({
44 ▶    *   selector: 'my-directive',
45 │    * })
46 ▶    * export class MyDirective {
47 │    * ...
48 ▶    * }
49 │    * ```
````

26〜27 行目「DOM の要素に振る舞いを足す」がディレクティブの定義で、33〜34 行目のライフサイクルのフックは[第 7 回](07-crd-lifecycle.md)で読みます。43〜48 行目の最小の例（`...` を消したもの）は、strict の tsc と strictTemplates の ngc にそのまま通りました（下の「説明文の例を ngc にかける」）。

📄 `angular/packages/core/src/metadata/directives.ts` L51–68 （▶ の行: 53–54, 62, 65–67）

````ts
51 │    * ### Declaring directives
52 │    *
53 ▶    * By default, directives are marked as standalone, which makes
54 ▶    * them available to other components in your application.
55 │    *
56 │    * ```ts
57 │    * @Directive({
58 │    *   selector: 'my-directive',
59 │    * })
60 │    * ```
61 │    *
62 ▶    * Please make sure that directives marked as standalone are not already declared in an NgModule.
63 │    *
64 │    * ** Declaring a directive in an NgModule **
65 ▶    * If you want to declare a directive in an ngModule, add the `standalone: false` flag to the
66 ▶    * Directive decorator metadata and add the directive to the `declarations` and `exports`
67 ▶    * fields of your ngModule.
68 │    *
````

📄 `angular/packages/core/src/metadata/directives.ts` L69–99 （▶ の行: 70–71, 77–78, 80, 84–87, 93, 98）

````ts
69 │    * ```ts
70 ▶    * @Directive({
71 ▶    *   standalone: false,
72 │    *   selector: 'my-directive',
73 │    * })
74 │    * class MyDirective {}
75 │    *
76 │    * @NgModule({
77 ▶    *   declarations: [MyDirective, SomeComponent],
78 ▶    *   exports: [MyDirective], // making it available outside of this module
79 │    * })
80 ▶    * class SomeNgModule {}
81 │    * ```
82 │    *
83 │    * When declaring a directive in an NgModule, please make sure that:
84 ▶    *  - the directive is declared in exactly one NgModule.
85 ▶    *  - the directive is not standalone.
86 ▶    *  - you do not re-declare a directive imported from another module.
87 ▶    *  - the directive is included into the `exports` field as well if you want this directive to be
88 │    *    accessible for components outside of the NgModule.
89 │    *
90 │    *
91 │    * @Annotation
92 │    */
93 ▶   (obj?: Directive): TypeDecorator;
94 │ 
95 │   /**
96 │    * See the `Directive` decorator.
97 │    */
98 ▶   new (obj?: Directive): Directive;
99 │ }
````

53〜54 行目「既定で standalone」は、AOT では ngtsc の `extractDirectiveMetadata` が `isStandalone = implicitStandaloneValue` から始め、`standalone` があるときだけ上書きすること（annotations/directive/src/shared.ts L380〜388）、JIT では `isStandalone: metadata.standalone === undefined ? true : !!metadata.standalone`（render3/jit/directive.ts L405）です。85 行目「standalone でないこと」を破って standalone のディレクティブを `declarations` に入れると、ngc は `NG6008: Directive MySaDirective is standalone, and cannot be declared in an NgModule.` で止めました。70〜80 行目の例は、例に出てこない `SomeComponent` を `standalone: false` で置けばエラー 0 です。93 行目と 98 行目は、同じ `Directive` が「デコレーターとして呼べる」ことと「`new` で metadata の物を作れる」ことの 2 つの型です（実体は 9 節の `makeDecorator`）。NgModule の側の説明は[第 3 回](03-crd-query-module.md)で読みます。

## 2. selector：6 つの形と、書いていない形

📄 `angular/packages/core/src/metadata/directives.ts` L113–141 （▶ の行: 118, 120–125, 127–128, 130–131, 137）

````ts
113 │ export interface Directive {
114 │   /**
115 │    * The CSS selector that identifies this directive in a template
116 │    * and triggers instantiation of the directive.
117 │    *
118 ▶    * Declare as one of the following:
119 │    *
120 ▶    * - `element-name`: Select by element name.
121 ▶    * - `.class`: Select by class name.
122 ▶    * - `[attribute]`: Select by attribute name.
123 ▶    * - `[attribute=value]`: Select by attribute name and value.
124 ▶    * - `:not(sub_selector)`: Select only if the element does not match the `sub_selector`.
125 ▶    * - `selector1, selector2`: Select if either `selector1` or `selector2` matches.
126 │    *
127 ▶    * Angular only allows directives to apply on CSS selectors that do not cross
128 ▶    * element boundaries.
129 │    *
130 ▶    * For the following template HTML, a directive with an `input[type=text]` selector,
131 ▶    * would be instantiated only on the `<input type="text">` element.
132 │    *
133 │    * ```html
134 │    * <form>
135 │    *   <input type="text">
136 │    *   <input type="radio">
137 ▶    * <form>
138 │    * ```
139 │    *
140 │    */
141 │   selector?: string;
````

selector の文字列は、AOT でも JIT でもコンパイラの `CssSelector.parse`（compiler/src/directive\_matching.ts L58〜120）が 1 つの正規表現 `_SELECTOR_REGEXP`（L9〜20）で切ります。正規表現が拾うのは `:not(`・タグか `.` か `#` の付いた名前・`[name=value]`・`)`・`,` の 5 つだけで、空白や `>` はどの組にも入らず読み飛ばされます。切り方と実行時の照合は[バインダーの章](../compiler/09-compiler-binder.md)にあります。DEMO 1 の「selector の形」で、16 の要素に 9 つのディレクティブを当てました。

- 120〜125 行目の 6 つの形は、どれも書いたとおりに当たりました。`[crddNot]:not(.off)` は `class="off"` の要素で外れます。
- 123 行目の `[attribute=value]` の値は大文字小文字を区別しません。`[crddKind=primary]` が `crddKind="Primary"` にも当たりました（`addAttribute` が値を `toLowerCase()` する、directive\_matching.ts L193〜195。spec の `should match attributes to directive selectors without case sensitivity` が固めている）。
- 一覧に無い `#crddId` も書けて、`id="crddId"` の要素に当たりました（正規表現の `#` の組が `addAttribute('id', …)` になる、L88〜90）。
- バインディングで付く class と属性（`[class.crdd-cls]`・`[attr.crddAttr]`）では当たりません。照合はテンプレートに静的に書いた名前でだけ行われます。

> [!WARNING]
> **ハマりどころ**
>
> 127〜128 行目は「要素の境をまたぐ selector には当てられない」と書きます。けれども `'form input'` を書いてもコンパイルは通り（ngc のエラー 0）、空白が読み飛ばされて `input` だけの selector になります。DEMO 1 では form の中の `type="radio"` にも、form の外の `<input>` にも当たりました。`'div > span'` も `span`、`'x:hover'` は要素名 `hover` です（Node で `CssSelector.parse` を直接呼んだ結果）。逆に、書けない形のうち `:not(.a, .b)` と `a:not(:not(b))` は、ngc が診断ではなく `error TS500: Error: Multiple selectors in :not are not supported`・`Nesting :not in a selector is not allowed` という内部の例外で止まりました（`CssSelector.parse` の `throw new Error`、L79・L113）。この 2 行は 115ac5f2902（2015-03-14、`docs: directive docs`）からあり、130〜131 行目の例の 137 行目は閉じタグのつもりの `<form>` です。

## 3. inputs：'name: alias' と {name, alias, required, transform}

📄 `angular/packages/core/src/metadata/directives.ts` L143–160 （▶ の行: 146, 150–154, 156–159）

```ts
143 │   /**
144 │    * Enumerates the set of data-bound input properties for a directive
145 │    *
146 ▶    * Angular automatically updates input properties during change detection.
147 │    * The `inputs` property accepts either strings or object literals that configure the directive
148 │    * properties that should be exposed as inputs.
149 │    *
150 ▶    * When an object literal is passed in, the `name` property indicates which property on the
151 ▶    * class the input should write to, while the `alias` determines the name under
152 ▶    * which the input will be available in template bindings. The `required` property indicates that
153 ▶    * the input is required which will trigger a compile-time error if it isn't passed in when the
154 ▶    * directive is used.
155 │    *
156 ▶    * When a string is passed into the `inputs` array, it can have a format of `'name'` or
157 ▶    * `'name: alias'` where `name` is the property on the class that the directive should write
158 ▶    * to, while the `alias` determines the name under which the input will be available in
159 ▶    * template bindings. String-based input definitions are assumed to be optional.
160 │    *
```

📄 `angular/packages/core/src/metadata/directives.ts` L161–189 （▶ の行: 166, 168, 175–177, 182–186, 188）

````ts
161 │    * @usageNotes
162 │    *
163 │    * The following example creates a component with two data-bound properties.
164 │    *
165 │    * ```ts
166 ▶    * @Component({
167 │    *   selector: 'bank-account',
168 ▶    *   inputs: ['bankName', {name: 'id', alias: 'account-id'}],
169 │    *   template: `
170 │    *     Bank Name: {{bankName}}
171 │    *     Account Id: {{id}}
172 │    *   `
173 │    * })
174 │    * class BankAccount {
175 ▶    *   bankName: string;
176 ▶    *   id: string;
177 ▶    * }
178 │    * ```
179 │    *
180 │    */
181 │   inputs?: (
182 ▶     | {
183 ▶         name: string;
184 ▶         alias?: string;
185 ▶         required?: boolean;
186 ▶         transform?: (value: any) => any;
187 │       }
188 ▶     | string
189 │   )[];
````

156〜158 行目の `'name: alias'` は、ngtsc では `parseMappingString` が `value.split(':', 2)` で 2 つに切って空白を落とします（annotations/directive/src/shared.ts L1191〜1196）。左がクラスのフィールド、右がテンプレートで使う名前で、166〜177 行目の例のオブジェクトの形 `{name: 'id', alias: 'account-id'}` と同じ向きです。DEMO 1 の「inputs」で確かめたことは次の 5 つです。

- 168 行目の例は、`<crdd-bank bankName="RBC" account-id="4747" />` で `Bank Name: RBC / Account Id: 4747` になりました。静的な属性の値も input に入ります。ただし 175〜176 行目の初期値の無いフィールドは、strict の tsc で `TS2564` が 2 つ出ます（初期値 `''` を足すとエラー 0）。
- alias を付けた input は、クラスの名前 `id` ではテンプレートに出ません。`[id]="'dom-id'"` は input ではなく要素の `id` 属性に入りました。`ComponentRef.setInput('id', …)` も効かず、開発モードでは `NG0303: Can't set value of the 'id' input on the 'CrddBankAccount' component.` が `console.error` に出ます（Node の記録。このページの本番ビルドでは何も出ない。component\_ref.ts L632〜637 が `ngDevMode` の中）。
- 152〜154 行目の `required` を付けて渡さないと、ngc が `NG8008: Required input 'need' from component ReqChild must be specified.` で止めました。159 行目のとおり文字列の形 `'opt'` は渡さなくてもエラーになりません（ngtsc は文字列の形に `required: false` を入れる、shared.ts L1231〜1238）。この `required` は 8f539c11f40（2023-03-17、#49468）で入りました。
- 186 行目の `transform` は型だけで、説明がありません。`numberAttribute` は `"42"` を `42` に、`'7px'` を `NaN` にし、`booleanAttribute` は値の無い `flag` を `true`、`"false"` を `false` にしました（2 つの関数の中身は[第 2 回](02-crd-component.md)）。
- JIT（Node の記録）と AOT（このページ）で、この表の結果は 1 文字も違いませんでした。文字列の alias は JIT でも同じに読まれます。

## 4. outputs：alias は「DOM の property」ではなくイベントの名前

📄 `angular/packages/core/src/metadata/directives.ts` L191–202 （▶ の行: 197–198, 200–201）

```ts
191 │   /**
192 │    * Enumerates the set of event-bound output properties.
193 │    *
194 │    * When an output property emits an event, an event handler attached to that event
195 │    * in the template is invoked.
196 │    *
197 ▶    * The `outputs` property defines a set of `directiveProperty` to `alias`
198 ▶    * configuration:
199 │    *
200 ▶    * - `directiveProperty` specifies the component property that emits events.
201 ▶    * - `alias` specifies the DOM property the event handler is attached to.
202 │    *
```

📄 `angular/packages/core/src/metadata/directives.ts` L203–231 （▶ の行: 205, 208–209, 218, 222, 228）

````ts
203 │    * @usageNotes
204 │    *
205 ▶    * ```ts
206 │    * @Component({
207 │    *   selector: 'child-dir',
208 ▶    *   outputs: [ 'bankNameChange' ],
209 ▶    *   template: `<input (input)="bankNameChange.emit($event.target.value)" />`
210 │    * })
211 │    * class ChildDir {
212 │    *  bankNameChange: EventEmitter<string> = new EventEmitter<string>();
213 │    * }
214 │    *
215 │    * @Component({
216 │    *   selector: 'main',
217 │    *   template: `
218 ▶    *     {{ bankName }} <child-dir (bankNameChange)="onBankNameChange($event)"></child-dir>
219 │    *   `
220 │    * })
221 │    * class MainComponent {
222 ▶    *  bankName: string;
223 │    *
224 │    *   onBankNameChange(bankName: string) {
225 │    *     this.bankName = bankName;
226 │    *   }
227 │    * }
228 ▶    * ```
229 │    *
230 │    */
231 │   outputs?: string[];
````

197〜201 行目は `directiveProperty` と `alias` の組を書けると言いますが、例（208 行目）は名前 1 つの形だけです。DEMO 1 の「outputs」で `outputs: ['bankNameChange', 'pinged: crddPing']` を置くと、`(crddPing)` は聞こえ、クラスの名前の `(pinged)` は何も受けませんでした。201 行目の「alias は handler が付く DOM の property」は、実際にはテンプレートの `(…)` に書くイベントの名前です。205〜228 行目の例は、そのままでは ngc に通りません。222 行目の初期値の無い `bankName` で `TS2564`、初期値を足すと 218 行目の `<child-dir>` が `NG8001: 'child-dir' is not a known element` です。standalone が既定になった今は、`MainComponent` に `imports: [ChildDir]` が要ります（足すとエラー 0。209 行目の `$event.target.value` は strictTemplates でも通った）。

## 5. providers と exportAs：名前はカンマで複数にできる

📄 `angular/packages/core/src/metadata/directives.ts` L233–262 （▶ の行: 234–236, 241, 245, 248, 255, 259, 262）

````ts
233 │   /**
234 ▶    * Configures the injector of this
235 ▶    * directive or component with a token
236 ▶    * that maps to a provider of a dependency.
237 │    */
238 │   providers?: Provider[];
239 │ 
240 │   /**
241 ▶    * Defines the name that can be used in the template to assign this directive to a variable.
242 │    *
243 │    * @usageNotes
244 │    *
245 ▶    * ```ts
246 │    * @Directive({
247 │    *   selector: 'child-dir',
248 ▶    *   exportAs: 'child'
249 │    * })
250 │    * class ChildDir {
251 │    * }
252 │    *
253 │    * @Component({
254 │    *   selector: 'main',
255 ▶    *   template: `<child-dir #c="child"></child-dir>`
256 │    * })
257 │    * class MainComponent {
258 │    * }
259 ▶    * ```
260 │    *
261 │    */
262 ▶   exportAs?: string;
````

234〜236 行目の `providers` は、このディレクティブが当たった要素の injector に provider を足します。DEMO 1 の表では、`crddProv` と同じ要素と子の要素からは見え、外の要素からは見えませんでした（要素の injector の探し方は[DI の概観](../di/01-di-overview.md)、`viewProviders` との違いは[第 2 回](02-crd-component.md)）。

262 行目の `exportAs` の型は `string` 1 つで、241 行目も「名前」と単数で書きます。実装は AOT が `resolved.split(',').map((part) => part.trim())`（annotations/directive/src/shared.ts L356）、JIT が `splitByComma(exportAs)`（render3/jit/directive.ts L488〜490）で、どちらもカンマで複数の名前にします。DEMO 1 では `exportAs: 'crddA, crddB'` に `#a="crddA" #b="crddB"` を付けて、`a === b` が `true` でした。この形は spec の `should assign a directive to a ref when it has multiple exportAs names` が固めていて、説明文にだけ無い形です。245〜259 行目の例は、255 行目の `<child-dir #c="child">` が `NG8001` と `NG8003: No directive found with exportAs 'child'.` になります。outputs の例と同じく `imports: [ChildDir]` を足すとエラー 0 です。

## 6. queries：例は TypeScript として書けず、JIT は読まない

📄 `angular/packages/core/src/metadata/directives.ts` L264–300 （▶ の行: 267–268, 278–280, 282, 285–286）

````ts
264 │   /**
265 │    * Configures the queries that will be injected into the directive.
266 │    *
267 ▶    * Content queries are set before the `ngAfterContentInit` callback is called.
268 ▶    * View queries are set before the `ngAfterViewInit` callback is called.
269 │    *
270 │    * @usageNotes
271 │    *
272 │    * The following example shows how queries are defined
273 │    * and when their results are available in lifecycle hooks:
274 │    *
275 │    * ```ts
276 │    * @Component({
277 │    *   selector: 'someDir',
278 ▶    *   queries: {
279 ▶    *     contentChildren: new ContentChildren(ChildDirective),
280 ▶    *     viewChildren: new ViewChildren(ChildDirective)
281 │    *   },
282 ▶    *   template: '<child-directive></child-directive>'
283 │    * })
284 │    * class SomeDir {
285 ▶    *   contentChildren: QueryList<ChildDirective>,
286 ▶    *   viewChildren: QueryList<ChildDirective>
287 │    *
288 │    *   ngAfterContentInit() {
289 │    *     // contentChildren is set
290 │    *   }
291 │    *
292 │    *   ngAfterViewInit() {
293 │    *     // viewChildren is set
294 │    *   }
295 │    * }
296 │    * ```
297 │    *
298 │    * @Annotation
299 │    */
300 │   queries?: {[key: string]: any};
````

285〜286 行目はクラスのフィールドをカンマで区切っていて、tsc は `TS1442: Expected '=' for property initializer.` で止めます（5dbe2926154、2015-09-17 の `ContentChildren` の追加から）。`;` にしても 282 行目の `<child-directive>` を `imports` に入れないと `NG8001` で、両方直すとエラー 0 です。267〜268 行目のとき（content は `ngAfterContentInit` の前、view は `ngAfterViewInit` の前）は、DEMO 1 の「queries と hostDirectives」の表で AOT のこのページなら `ngAfterContentInit: content=1 view=undefined → ngAfterViewInit: content=1 view=2` と、書いたとおりでした（view のフィールドは `ngAfterContentInit` の時点ではまだ代入もされていない）（クエリの更新の時機は[クエリの更新の章](../qry/05-qry-refresh-timing.md)）。

> [!WARNING]
> **ハマりどころ**
>
> 同じ表の JIT の列（Node の記録）は `content=undefined view=undefined` のままです。JIT の `directiveMetadata` は `queries: extractQueriesMetadata(type, propMetadata, isContentQuery)`（render3/jit/directive.ts L394）で、プロパティのデコレーター（`@ContentChildren` など）からしかクエリを集めず、`metadata.queries` をどこからも読みません。AOT の ngtsc は `extractQueriesFromDecorator` で `queries` を読みます（shared.ts L251〜272）。つまり `queries` を使ったディレクティブは、AOT では動き、JIT（Karma の既定の `ng test` や `jit: true`）では黙ってクエリが無いものになります。ngtsc には `should throw error if @Directive.queries object has incorrect values`（ngtsc\_spec.ts 3295）があり、JIT の側で `queries` を確かめる spec はありません。main（d201dd76ef2）の L392 も同じ式です。

## 7. host：静的な属性・バインディング・イベント

📄 `angular/packages/core/src/metadata/directives.ts` L302–325 （▶ の行: 306–307, 309–310, 312–313, 316–318, 320–322）

```ts
302 │   /**
303 │    * Maps class properties to host element bindings for properties,
304 │    * attributes, and events, using a set of key-value pairs.
305 │    *
306 ▶    * Angular automatically checks host property bindings during change detection.
307 ▶    * If a binding changes, Angular updates the directive's host element.
308 │    *
309 ▶    * When the key is a property of the host element, the property value is
310 ▶    * propagated to the specified DOM property.
311 │    *
312 ▶    * When the key is a static attribute in the DOM, the attribute value
313 ▶    * is propagated to the specified property in the host element.
314 │    *
315 │    * For event handling:
316 ▶    * - The key is the DOM event that the directive listens to.
317 ▶    *  The global target names that can be used to prefix an event name are
318 ▶    * `document:`, `window:` and `body:`.
319 │    *
320 ▶    * - The value is the statement to execute when the event occurs. If the
321 ▶    * statement evaluates to `false`, then `preventDefault` is applied on the DOM
322 ▶    * event. A handler method can refer to the `$event` local variable.
323 │    *
324 │    */
325 │   host?: {[key: string]: string};
```

`host` のキーの書き方（`[prop]`・`[attr.x]`・`(event)`・何も付けない静的な属性）は、コンパイラがテンプレートと同じバインディングのパーサーで読みます（[バインディングのパーサーの章](../compiler/06-compiler-binding-parser.md)）。DEMO 1 の「providers・exportAs・host」で確かめました。

- 312〜313 行目「キーが DOM の静的な属性なら、属性の値が host の要素の指定した property に伝わる」は、実際の振る舞いと噛み合いません。`role: 'button'` は、キーの名前の属性にその文字列を書くだけです（`role="button"`）。同じ名前をテンプレートでも書くと、テンプレートの値が勝ちました（`title="from template"`）。`class` は足し合わされ、`crdd-static tpl on` でした（spec の `should merge attributes on host and template`）。この 2 行は 7d318743c13（2018-05-14、#23902 の説明文の書き直し）のものです。
- 320〜322 行目「文が `false` に評価されたら `preventDefault`」は、`'(keydown)': 'false'` と、`false` を返す handler で `defaultPrevented=true`、`undefined` を返す handler で `false` でした。実装は `listenerFn(e) !== false` の結果で、handler が例外を投げたときも `false` 扱いになり `preventDefault` されます（render3/view/listeners.ts L92〜95。説明文には無い）。
- 316〜318 行目の `document:` は、ホストの要素が文書に付いていなくても `document` のイベントを聞き、destroy の後は聞きませんでした。`window:` は[第 2 回](02-crd-component.md)の `@HostListener('window:resize')` で試します。

> **🧪 DEMO 1 — 説明文の約束を本物のディレクティブで試す（AOT のこのページと、JIT の記録）**
>
> 押すと、本物の `@angular/core`（22.2.6）で小さなコンポーネントを行ごとに `createComponent` で作り（文書に付けない div の上）、`detectChanges` して DOM と記録を読み、すぐ destroy します。このページは AOT でコンパイルされています。「JIT（記録）」の列は、同じ関数を Node（domino の上の JIT、開発モード）で走らせた手元の記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-directive)

📄 `DEMO 1「selector の形」のテンプレート（data-k は表の行の番号）`

```
<crdd-el data-k="1"></crdd-el>
<span data-k="2" class="other crdd-cls"></span>
<span data-k="3" crddAttr></span>
<span data-k="4" crddKind="primary"></span>
<span data-k="5" crddKind="Primary"></span>
<span data-k="6" crddKind="secondary"></span>
<span data-k="7" crddNot></span>
<span data-k="8" crddNot class="off"></span>
<crdd-a data-k="9"></crdd-a>
<span data-k="10" crddB></span>
<form><input data-k="11" type="text"><input data-k="12" type="radio"></form>
<input data-k="13">
<span data-k="14" id="crddId"></span>
<span data-k="15" [class.crdd-cls]="true"></span>
<span data-k="16" [attr.crddAttr]="'x'"></span>
```

## 8. jit・standalone・signals と、デコレーターの実体

📄 `angular/packages/core/src/metadata/directives.ts` L327–346 （▶ の行: 328–331, 336, 341, 343, 345）

```ts
327 │   /**
328 ▶    * When present, this directive/component is ignored by the AOT compiler.
329 ▶    * It remains in distributed code, and the JIT compiler attempts to compile it
330 ▶    * at run time, in the browser.
331 ▶    * To ensure the correct behavior, the app must import `@angular/compiler`.
332 │    */
333 │   jit?: true;
334 │ 
335 │   /**
336 ▶    * Set `standalone` to `false` if you want to import the directive into an NgModule.
337 │    */
338 │   standalone?: boolean;
339 │ 
340 │   /**
341 ▶    * // TODO(signals): Remove internal and add public documentation
342 │    *
343 ▶    * @internal
344 │    */
345 ▶   signals?: boolean;
346 │ 
```

328〜331 行目の `jit: true` は、ngtsc の `DirectiveDecoratorHandler.analyze` が `jitForced` のとき解析を空にして `jitDeclarationRegistry` に入れるだけ、という形で実装されています（annotations/directive/src/handler.ts L236〜242）。デコレーターがそのまま出力に残り、実行時に 9 節の `compileDirective` が動くので、331 行目のとおり `@angular/compiler` が要ります。341〜345 行目の `signals` は `@internal` で、公開の型（.d.ts）からは消えます。main ではこのフィールドが 98b0f3b7207（2026-11-10、`refactor(core): remove signal components prototype`）で消えました。

📄 `angular/packages/core/src/metadata/directives.ts` L367–378 （▶ の行: 374, 377）

```ts
367 │ /**
368 │  * Type of the Directive metadata.
369 │  *
370 │  * @publicApi
371 │  */
372 │ export const Directive: DirectiveDecorator = makeDecorator(
373 │   'Directive',
374 ▶   (dir: Directive = {}) => dir,
375 │   undefined,
376 │   undefined,
377 ▶   (type: Type<any>, meta: Directive) => compileDirective(type, meta),
378 │ );
```

374 行目の props の関数は受け取った metadata をそのまま返し、377 行目が JIT のコンパイルを呼びます。`makeDecorator` の中で 377 行目の関数に渡るのは props を通す前の引数そのもの（util/decorators.ts L68 の `typeFn(cls, ...args)`）で、この違いは `@Component` の既定の `changeDetection` で効いてきます（[第 2 回](02-crd-component.md)）。

## 9. hostDirectives

`hostDirectives` の説明（L347〜364）と、standalone に限られる理由は[hostDirectives の章](../standalone/10-standalone-host-directives.md)が引いています。L354〜355 の `'menuDisabled: disabled'` の例は、DEMO 1 の最後の行のとおり `[disabled]="true"` が host directive の `menuDisabled` に入りました。`inputs` に挙げないで `[menuDisabled]` を書くと ngc は `NG8002: Can't bind to 'menuDisabled' since it isn't a known property of 'span'.` で、alias を付けたあとも元の名前 `[menuDisabled]` では書けません。

## 説明文の例を ngc にかける

📄 `例を 1 つずつ strict + strictTemplates の ngc にかけた結果（2026-11-21、手元の記録）`

```
# 説明文の例を 1 つずつ、strict の tsc と strictTemplates の ngc（@angular/compiler-cli 22.2.6）にかける
$ ngc -p tsconfig.json        # 例のファイルを 1 つだけ置いて、例ごとに
usage.ts（L41-48）            エラー 0
ngmodule.ts（L70-80）         エラー 0（例に無い SomeComponent は standalone: false で置いた）
ngmodule-standalone.ts        NG6008: Directive MySaDirective is standalone, and cannot be declared in an NgModule.
inputs.ts（L166-177）         TS2564: Property 'bankName' has no initializer ... ・ TS2564: Property 'id' ...
  └ 初期値を足すと            エラー 0
outputs.ts（L206-227）        TS2564: Property 'bankName' has no initializer ...
  └ 初期値を足すと            NG8001: 'child-dir' is not a known element ・ TS2345: Argument of type 'Event' is not assignable to parameter of type 'string'.
  └ imports: [ChildDir] も    エラー 0
exportas.ts（L246-258）       NG8001: 'child-dir' is not a known element ・ NG8003: No directive found with exportAs 'child'.
  └ imports: [ChildDir] で    エラー 0
queries.ts（L276-295）        TS1442: Expected '=' for property initializer.      # 285 行目の「,」
  └ ; と ! にすると           NG8001: 'child-directive' is not a known element
  └ imports も足すと          エラー 0
required.ts                   NG8008: Required input 'need' from component ReqChild must be specified.
hostdir.ts                    NG8002: Can't bind to 'menuDisabled' since it isn't a known property of 'span'.（2 か所）
selectors.ts                  エラー 0（'form input' と '#crdd-id'）
selectors-not.ts              error TS500: Error: Multiple selectors in :not are not supported
selectors-nest.ts             error TS500: Error: Nesting :not in a selector is not allowed
```

## ここまでの呼び出し

- 👤 `@Directive({selector, inputs, outputs, exportAs, queries, host})`
  - `DirectiveDecoratorHandler.analyze` — AOT、annotations/directive/src/handler.ts — *jit: true なら空（L236〜242）*
    - `extractDirectiveMetadata` — shared.ts — *queries（L251〜272）・selector（L276〜300）・exportAs の split（L356）・standalone（L380〜388）*
    - `parseInputsArray` → `parseMappingString` — shared.ts L1191〜1238 — *'name: alias' を split(':', 2)*
  - `Directive` = `makeDecorator('Directive', …, compileDirective)` — JIT、directives.ts L372〜378
    - `directiveMetadata(type, metadata)` — render3/jit/directive.ts L379〜 — *queries は propMetadata だけ（L394）*
  - `CssSelector.parse(selector)` — compiler/src/directive\_matching.ts L58 — *空白と &gt; を読み飛ばす*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `packages/core/test/acceptance/directive_spec.ts` | `directives › matching › should match attributes to directive selectors without case sensitivity`（320）・`should not match directives based on attribute bindings`（364） | 2 節の値の大文字小文字と、バインディングでは当たらないこと。空白を含む selector の it は無い |
| `packages/core/test/linker/integration_spec.ts` | `should assign a directive to a ref when it has multiple exportAs names`（465） | 5 節のカンマ区切りの exportAs |
| `packages/core/test/acceptance/listener_spec.ts` | `should call prevent default when a handler returns false`（278）・`should support global host listeners on directives`（826） | 7 節の preventDefault と document: |
| `packages/core/test/acceptance/host_binding_spec.ts` | `should merge attributes on host and template`（1374） | 7 節の静的な属性 |
| `packages/core/test/acceptance/host_directives_spec.ts` | `should set an input of a host directive that has been exposed under an alias`（1867） | 9 節 |
| `packages/compiler-cli/test/ngtsc/ngtsc_spec.ts` | `should throw error if @Directive.queries object has incorrect values`（3295） | 6 節の AOT の側だけ。JIT の `queries` の it は無い |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
should match attributes to directive selectors without case sensitivity       Ran 1 of 2693 specs、0 failures
should call prevent default when a handler returns false                      Ran 1 of 2693 specs、0 failures
should support global host listeners on directives                            Ran 1 of 2693 specs、0 failures
should merge attributes on host and template                                  Ran 1 of 2693 specs、0 failures
should set an input of a host directive that has been exposed under an alias  Ran 1 of 2693 specs、0 failures
$ pnpm bazel test //packages/core/test:test ... "--test_arg=--filter=should assign a directive to a ref when it has multiple exportAs names"
                                                                              Ran 1 of 1401 specs、0 failures（4 つに割った 1 つ）
```

直すとしたら、説明文は 4 か所です。285〜286 行目の `,` を `;` に（と `!`）、例のコンポーネントに `imports` を足す（outputs・exportAs・queries の 3 つ）、241・262 行目に「カンマで区切って複数の名前」を足す、312〜313 行目を「キーが属性の名前で、値はその属性に書く文字列」に書き直す、です。127〜128 行目は「空白・`>`・`+`・`~` は書けない（書いてもエラーにならず、最後の要素だけが残る）」と、実装に合わせて書けます。コードの側は 2 つです。JIT の `queries` は render3/jit/directive.ts の `directiveMetadata` で `metadata.queries` を `convertToR3QueryMetadata` に通して足すのが入口で、acceptance の `query_spec.ts` に `queries` を使うディレクティブの it を足すと、JIT で今は落ちることが記録されます。selector の組み合わせ子をエラーにするなら `CssSelector.parse` の正規表現に空白の組を足すことになり、今ある selector を壊す振る舞いの変更です。

## 聞かれそうな質問

**Q. selector に `'form input'` と書くと form の中の input にだけ当たりますか？**

当たりません。`CssSelector.parse` の正規表現は空白をどの組にも入れないので、`'form input'` は `input` になり、form の外の input にも当たります。127〜128 行目の「要素の境をまたがない」は、エラーで止めるという意味ではありません。

**Q. `inputs: ['label: crddLabel']` のどちらがテンプレートの名前ですか？**

右（`crddLabel`）です。左がクラスのフィールドで、オブジェクトの形の `{name, alias}` と同じ向きです（156〜158 行目、ngtsc の `parseMappingString`）。alias を付けると左の名前ではテンプレートにも `setInput` にも出ません。

**Q. `exportAs` に 2 つの名前を付けられますか？**

付けられます。`exportAs: 'a, b'` と書けば AOT（shared.ts L356）も JIT（L488〜490）もカンマで切り、`#x="a"` と `#y="b"` が同じ実例を指します。説明文（241・262 行目）には書いていません。

**Q. `queries` と `@ContentChildren` のプロパティデコレーターは同じですか？**

AOT では同じに動きます。JIT では `queries` が読まれず、フィールドは `undefined` のままです（render3/jit/directive.ts L394）。テストを JIT で走らせるなら、プロパティデコレーターか `contentChildren()` を使います。

**Q. `host` の handler が例外を投げたら、イベントはどうなりますか？**

例外はアプリの ErrorHandler へ回り、その handler は `false` を返したのと同じに扱われて `preventDefault` されます（listeners.ts L92〜95）。320〜322 行目は `false` の場合だけを書いています。

## 読み終えて

- selector は 6 つの形に `#id` を足した 7 つが書けて、属性の値は大文字小文字を区別しない。空白や `>` は黙って捨てられる。
- `'name: alias'` は左がフィールド、右がテンプレートの名前。outputs の alias もテンプレートのイベントの名前。
- `exportAs` はカンマで複数にでき、`queries` は AOT だけで効く。
- outputs・exportAs・queries の例は、standalone が既定になった今は `imports` を足さないとコンパイルできない。queries の例は TypeScript としても書けない。

---

← 前: [spec と issue を読む：common の説明文を固めているもの](../cmd/09-cmd-tests-issues.md)  
次: [@Component の説明文：テンプレート・スタイル・変更検知・カプセル化](02-crd-component.md) →
