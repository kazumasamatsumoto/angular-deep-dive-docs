[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 3 回 / 全 10 回

# クエリのデコレーターと @NgModule の説明文

> metadata/di.ts（Attribute・ContentChildren・ContentChild・ViewChildren・ViewChild）と metadata/ng\_module.ts・do\_bootstrap.ts の未読の行：selector と descendants と read と static と emitDistinctChangesOnly の約束と例、NgModule の providers の例、ModuleWithProviders の forRoot を importProvidersFrom で、ngDoBootstrap。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-query-module)

---

この章で分かること：`metadata/di.ts` の `Attribute`・`ContentChildren`・`ContentChild`・`ViewChildren`・`ViewChild` の説明文が約束する selector の形・`descendants`・`read`・`static`・`emitDistinctChangesOnly` と、`metadata/ng_module.ts` の `providers` の説明と例、`ModuleWithProviders` の `forRoot` の形、`DoBootstrap` を、本物で 1 つずつ確かめます。クエリの説明文は、ほぼ書いてあるとおりに動きました。食い違いは、`ContentChild` の静的と動的の表が markdown として崩れていること、例の 2 つ（`@ContentChildren(TemplateRef) template;` と `declarations: [NgFor]`）が今はコンパイルできないことです。

読む対象は `packages/core/src/metadata/di.ts` の L12〜493、`ng_module.ts` の L15〜75、`ng_module_def.ts`・`schema.ts`・`do_bootstrap.ts` の説明文（../angular、8576f161ae4）です。クエリの作られ方と更新の時機は[クエリの全体像](../qry/01-qry-what-declared.md)・[更新の時機](../qry/05-qry-refresh-timing.md)・[コンテンツのクエリ](../qry/06-qry-content-projection.md)の章、NgModule の残りの説明（imports・exports・bootstrap）は[NgModule の概観](../ngmodule/01-ngmodule.md)が引いています。

1. [1. @Directive](01-crd-directive.md)
2. [2. @Component](02-crd-component.md)
3. **3. クエリと @NgModule**（この章）
4. [4. @Injectable・InjectionToken](04-crd-injectable-token.md)
5. [5. Provider の形](05-crd-provider.md)
6. [6. inject と Injector](06-crd-inject.md)
7. [7. ライフサイクル](07-crd-lifecycle.md)
8. [8. differ](08-crd-differs.md)
9. [9. スケジューラー](09-crd-scheduling.md)
10. [10. spec と issue](10-crd-tests-issues.md)

## 1. Attribute：定数の属性だけ

📄 `angular/packages/core/src/metadata/di.ts` L12–51 （▶ の行: 19, 21, 28, 31, 33, 37, 50）

````ts
12 │ /**
13 │  * Type of the `Attribute` decorator / constructor function.
14 │  *
15 │  * @publicApi
16 │  */
17 │ export interface AttributeDecorator {
18 │   /**
19 ▶    * Specifies that a constant attribute value should be injected.
20 │    *
21 ▶    * The directive can inject constant string literals of host element attributes.
22 │    *
23 │    * @usageNotes
24 │    *
25 │    * Suppose we have an `<input>` element and want to know its `type`.
26 │    *
27 │    * ```html
28 ▶    * <input type="text">
29 │    * ```
30 │    *
31 ▶    * A decorator can inject string literal `text` as in the following example.
32 │    *
33 ▶    * {@example core/ts/metadata/metadata.ts region='attributeMetadata'}
34 │    *
35 │    * @publicApi
36 │    */
37 ▶   (name: string): any;
38 │   new (name: string): Attribute;
39 │ }
40 │ 
41 │ /**
42 │  * Type of the Attribute metadata.
43 │  *
44 │  * @publicApi
45 │  */
46 │ export interface Attribute {
47 │   /**
48 │    * The name of the attribute to be injected into the constructor.
49 │    */
50 ▶   attributeName?: string;
51 │ }
````

19〜21 行目「定数の属性の値を注入する」の実装は、ホストの `TNode` の静的な属性の並び（`tNode.attrs`）を名前で探す `injectAttributeImpl` です（render3/di.ts L343〜）。`class` と `style` だけは `tNode.classes`・`tNode.styles` から返し、バインディングの印に当たったところで探すのをやめます。DEMO 1 の「@Attribute」で確かめると、`<input type="text" class="a b" [class.c]="true">` の `type` は `'text'`、`class` は静的な `'a b'` だけで、無い属性は `null` でした。`[attr.type]` と補間の `title="t-{{ n }}"` は「定数」ではないので `null` です（spec の ``should inject `null` for attributes with data bindings``）。33 行目が指す例（packages/examples/core/ts/metadata/metadata.ts L24〜33）は ngc にそのまま通ります。デコレーターの本体と `HostAttributeToken` は[第 6 回](06-crd-inject.md)と[InjectionToken の章](../di/06-di-injection-token.md)です。

## 2. Query の形と ContentChildren

📄 `angular/packages/core/src/metadata/di.ts` L53–81 （▶ の行: 59–60, 62–65, 79）

```ts
53 │ /**
54 │  * Type of the Query metadata.
55 │  *
56 │  * @publicApi
57 │  */
58 │ export interface Query {
59 ▶   descendants: boolean;
60 ▶   emitDistinctChangesOnly: boolean;
61 │   first: boolean;
62 ▶   read: any;
63 ▶   isViewQuery: boolean;
64 ▶   selector: any;
65 ▶   static?: boolean;
66 │ 
67 │   /**
68 │    * @internal
69 │    *
70 │    * Whether the query is a signal query.
71 │    *
72 │    * This option exists for JIT compatibility. Users are not expected to use this.
73 │    * Angular needs a way to capture queries from classes so that the internal query
74 │    * functions can be generated. This needs to happen before the component is instantiated.
75 │    * Due to this, for JIT compilation, signal queries need an additional decorator
76 │    * declaring the query. Angular provides a TS transformer to automatically handle this
77 │    * for JIT usage (e.g. in tests).
78 │    */
79 ▶   isSignal?: boolean;
80 │ }
81 │ 
```

59〜65 行目の 7 つが、4 つのデコレーターが作る metadata の形です。違うのは既定の値だけで、下の各 `makePropDecorator` の props（197〜208・301〜311 行目ほか）が決めます。`emitDistinctChangesOnlyDefaultValue` は L84 の `true` です。

📄 `angular/packages/core/src/metadata/di.ts` L86–117 （▶ の行: 109–111, 113, 115–116）

```ts
 86 │ /**
 87 │  * Base class for query metadata.
 88 │  *
 89 │  * @see {@link ContentChildren}
 90 │  * @see {@link ContentChild}
 91 │  * @see {@link ViewChildren}
 92 │  * @see {@link ViewChild}
 93 │  *
 94 │  * @publicApi
 95 │  */
 96 │ export abstract class Query {}
 97 │ 
 98 │ /**
 99 │  * Type of the ContentChildren decorator / constructor function.
100 │  *
101 │  * @see {@link ContentChildren}
102 │  * @publicApi
103 │  */
104 │ export interface ContentChildrenDecorator {
105 │   /**
106 │    * @description
107 │    * Property decorator that configures a content query.
108 │    *
109 ▶    * Use to get the `QueryList` of elements or directives from the content DOM.
110 ▶    * Any time a child element is added, removed, or moved, the query list will be
111 ▶    * updated, and the changes observable of the query list will emit a new value.
112 │    *
113 ▶    * Content queries are set before the `ngAfterContentInit` callback is called.
114 │    *
115 ▶    * Does not retrieve elements or directives that are in other components' templates,
116 ▶    * since a component's template is always a black box to its ancestors.
117 │    *
```

📄 `angular/packages/core/src/metadata/di.ts` L118–150 （▶ の行: 121–123, 126–127, 130, 132, 134–139, 141–142, 145–149）

```ts
118 │    * **Metadata Properties**:
119 │    *
120 │    * * **selector** - The directive type or the name used for querying.
121 ▶    * * **descendants** - If `true` include all descendants of the element. If `false` then only
122 ▶    * query direct children of the element.
123 ▶    * * **emitDistinctChangesOnly** - The ` QueryList#changes` observable will emit new values only
124 │    *   if the QueryList result has changed. When `false` the `changes` observable might emit even
125 │    *   if the QueryList has not changed.
126 ▶    *   ** Note: *** This config option is **deprecated**, it will be permanently set to `true` and
127 ▶    *   removed in future versions of Angular.
128 │    * * **read** - Used to read a different token from the queried elements.
129 │    *
130 ▶    * The following selectors are supported.
131 │    *   * Any class with the `@Component` or `@Directive` decorator
132 ▶    *   * A template reference variable as a string (e.g. query `<my-component #cmp></my-component>`
133 │    * with `@ContentChildren('cmp')`)
134 ▶    *   * Any provider defined in the child component tree of the current component (e.g.
135 ▶    * `@ContentChildren(SomeService) someService: SomeService`)
136 ▶    *   * Any provider defined through a string token (e.g. `@ContentChildren('someToken')
137 ▶    * someTokenVal: any`)
138 ▶    *   * A `TemplateRef` (e.g. query `<ng-template></ng-template>` with
139 ▶    * `@ContentChildren(TemplateRef) template;`)
140 │    *
141 ▶    * In addition, multiple string selectors can be separated with a comma (e.g.
142 ▶    * `@ContentChildren('cmp1,cmp2')`)
143 │    *
144 │    * The following values are supported by `read`:
145 ▶    *   * Any class with the `@Component` or `@Directive` decorator
146 ▶    *   * Any provider defined on the injector of the component that is matched by the `selector` of
147 ▶    * this query
148 ▶    *   * Any provider defined through a string token (e.g. `{provide: 'token', useValue: 'val'}`)
149 ▶    *   * `TemplateRef`, `ElementRef`, `ViewContainerRef`, and `Injector`
150 │    *
```

📄 `angular/packages/core/src/metadata/di.ts` L151–179 （▶ の行: 155, 162, 168, 170–172）

```ts
151 │    * @usageNotes
152 │    *
153 │    * Here is a simple demonstration of how the `ContentChildren` decorator can be used.
154 │    *
155 ▶    * {@example core/di/ts/contentChildren/content_children_howto.ts region='HowTo'}
156 │    *
157 │    * ### Tab-pane example
158 │    *
159 │    * Here is a slightly more realistic example that shows how `ContentChildren` decorators
160 │    * can be used to implement a tab pane component.
161 │    *
162 ▶    * {@example core/di/ts/contentChildren/content_children_example.ts region='Component'}
163 │    *
164 │    * @Annotation
165 │    * @see [Content queries](guide/components/queries#decorator-content-queries)
166 │    */
167 │   (
168 ▶     selector: ProviderToken<unknown> | Function | string,
169 │     opts?: {
170 ▶       descendants?: boolean;
171 ▶       emitDistinctChangesOnly?: boolean;
172 ▶       read?: any;
173 │     },
174 │   ): any;
175 │   new (
176 │     selector: ProviderToken<unknown> | Function | string,
177 │     opts?: {descendants?: boolean; emitDistinctChangesOnly?: boolean; read?: any},
178 │   ): Query;
179 │ }
```

📄 `angular/packages/core/src/metadata/di.ts` L181–208 （▶ の行: 197, 201–205, 208）

```ts
181 │ /**
182 │  * Type of the ContentChildren metadata.
183 │  *
184 │  *
185 │  * @Annotation
186 │  * @publicApi
187 │  */
188 │ export type ContentChildren = Query;
189 │ 
190 │ /**
191 │  * ContentChildren decorator and metadata.
192 │  *
193 │  *
194 │  * @Annotation
195 │  * @publicApi
196 │  */
197 ▶ export const ContentChildren: ContentChildrenDecorator = makePropDecorator(
198 │   'ContentChildren',
199 │   (selector?: any, opts: any = {}) => ({
200 │     selector,
201 ▶     first: false,
202 ▶     isViewQuery: false,
203 ▶     descendants: false,
204 ▶     emitDistinctChangesOnly: emitDistinctChangesOnlyDefaultValue,
205 ▶     ...opts,
206 │   }),
207 │   Query,
208 ▶ );
```

121〜122 行目「descendants が false なら直接の子だけ」と 203 行目の既定 `false` を、DEMO 1 の「descendants」で確かめました（使ったテンプレートは下の欄）。

- `@ContentChildren(CrdqItem)` は `[a, c]` で、`div` の中の b と、c の中の d を拾いません。`descendants: true` は `[b, a, c, d]` と文書の順でした。
- 「直接の子」は、親の `TNode` がクエリを宣言した要素（`crdq-parent`）であるものです。`<div>` の下の b と、c の下の d は親が違うので外れます。`<ng-container>` だけは透けて見て、その上の親を見ます（render3/queries/query.ts L227〜254 の `isApplyingToNode`、[TQuery の照合の章](../qry/03-qry-tquery-match.md)）。
- 115〜116 行目のとおり、ほかのコンポーネントのテンプレートの中は見ません。親の `@ViewChildren(CrdqItem)` は自分のテンプレートに書いた 6 つ（a〜d と v1・v2）を拾い、`crdq-parent` が中で描くものは拾いません。

📄 `DEMO 1「descendants」のテンプレート`

```
<crdq-parent>
  <div><crdq-item name="b（div の中）" /></div>
  <crdq-item name="a（直接の子）" />
  <crdq-item name="c（直接の子）"><crdq-item name="d（c の中）" /></crdq-item>
</crdq-parent>
<section><crdq-item name="v1" /><div><crdq-item name="v2" /></div></section>
```

126 行目の `** Note: ***` は太字にならない書き方で、main では 95e8dec4e22（2026-09-23、`docs(core): fix three JSDoc rendering bugs on the API pages`）が `**Note:**` に直しました（338 行目も同じ）。

## 3. selector と read の形

130〜149 行目の selector の 5 つの形と read の 4 つの形を、DEMO 1 の「selector と read」で 1 つの要素 `<span #ref crdqProv crdqMark>` に当てました（`crdqProv` は `CrdqService`・`CRDQ_TOKEN`・`'someToken'` を providers に持つ）。

- read の 4 つの組み込み（149 行目）・同じ要素のディレクティブ（145 行目）・その要素の injector の provider（146〜147 行目、クラス・`InjectionToken`・文字列のトークン）は、どれも書いたとおりのものが返りました。read を書かない `@ViewChild('ref')` は `ElementRef` です。
- 134〜137 行目の「provider を selector にできる」も、クラス・`InjectionToken`・文字列のどれでも当たりました。文字列の selector は、まずテンプレート参照の名前として探し、続けて同じ名前の文字列のトークンの provider としても探します（render3/queries/query.ts L261〜266 の `// Also try matching the name to a provider since strings can be used as DI tokens too.`）。これは 5dc8d287aac（2020-08-01、`fix(core): queries not matching string injection tokens (#38321)`）で入りました。
- 141〜142 行目のカンマ区切りは、`'cmp1,cmp2'` でも `'cmp2,cmp1'` でも結果は `1,2,3` の文書の順で、名前を並べた順ではありません（説明文に書いていない。spec の `query order` の 2 つが固めている）。

## 4. ContentChild の static と、崩れた表

📄 `angular/packages/core/src/metadata/di.ts` L210–235 （▶ の行: 220–222, 230–231, 233–234）

```ts
210 │ /**
211 │  * Type of the ContentChild decorator / constructor function.
212 │  *
213 │  * @publicApi
214 │  */
215 │ export interface ContentChildDecorator {
216 │   /**
217 │    * @description
218 │    * Property decorator that configures a content query.
219 │    *
220 ▶    * Use to get the first element or the directive matching the selector from the content DOM.
221 ▶    * If the content DOM changes, and a new child matches the selector,
222 ▶    * the property will be updated.
223 │    *
224 │    * Does not retrieve elements or directives that are in other components' templates,
225 │    * since a component's template is always a black box to its ancestors.
226 │    *
227 │    * **Metadata Properties**:
228 │    *
229 │    * * **selector** - The directive type or the name used for querying.
230 ▶    * * **descendants** - If `true` (default) include all descendants of the element. If `false` then
231 ▶    * only query direct children of the element.
232 │    * * **read** - Used to read a different token from the queried element.
233 ▶    * * **static** - True to resolve query results before change detection runs,
234 ▶    * false to resolve after change detection. Defaults to false.
235 │    *
```

📄 `angular/packages/core/src/metadata/di.ts` L236–264 （▶ の行: 241, 245, 256–260, 263）

```ts
236 │    * The following selectors are supported.
237 │    *   * Any class with the `@Component` or `@Directive` decorator
238 │    *   * A template reference variable as a string (e.g. query `<my-component #cmp></my-component>`
239 │    * with `@ContentChild('cmp')`)
240 │    *   * Any provider defined in the child component tree of the current component (e.g.
241 ▶    * `@ContentChild(SomeService) someService: SomeService`)
242 │    *   * Any provider defined through a string token (e.g. `@ContentChild('someToken') someTokenVal:
243 │    * any`)
244 │    *   * A `TemplateRef` (e.g. query `<ng-template></ng-template>` with `@ContentChild(TemplateRef)
245 ▶    * template;`)
246 │    *
247 │    * The following values are supported by `read`:
248 │    *   * Any class with the `@Component` or `@Directive` decorator
249 │    *   * Any provider defined on the injector of the component that is matched by the `selector` of
250 │    * this query
251 │    *   * Any provider defined through a string token (e.g. `{provide: 'token', useValue: 'val'}`)
252 │    *   * `TemplateRef`, `ElementRef`, `ViewContainerRef`, and `Injector`
253 │    *
254 │    * Difference between dynamic and static queries:
255 │    *
256 ▶    * | Queries                             | Details |
257 ▶    * |:---                                 |:---     |
258 ▶    * | Dynamic queries \(`static: false`\) | The query resolves before the `ngAfterContentInit()`
259 ▶    * callback is called. The result will be updated for changes to your view, such as changes to
260 ▶    * `ngIf` and `ngFor` blocks. | | Static queries \(`static: true`\)   | The query resolves once
261 │    * the view has been created, but before change detection runs (before the `ngOnInit()` callback
262 │    * is called). The result, though, will never be updated to reflect changes to your view, such as
263 ▶    * changes to `ngIf` and `ngFor` blocks.  |
264 │    *
```

📄 `angular/packages/core/src/metadata/di.ts` L265–284 （▶ の行: 267, 271, 278）

```ts
265 │    * @usageNotes
266 │    *
267 ▶    * {@example core/di/ts/contentChild/content_child_howto.ts region='HowTo'}
268 │    *
269 │    * ### Example
270 │    *
271 ▶    * {@example core/di/ts/contentChild/content_child_example.ts region='Component'}
272 │    *
273 │    * @Annotation
274 │    * @see [Content queries](guide/components/queries#decorator-content-queries)
275 │    */
276 │   (
277 │     selector: ProviderToken<unknown> | Function | string,
278 ▶     opts?: {descendants?: boolean; read?: any; static?: boolean},
279 │   ): any;
280 │   new (
281 │     selector: ProviderToken<unknown> | Function | string,
282 │     opts?: {descendants?: boolean; read?: any; static?: boolean},
283 │   ): ContentChild;
284 │ }
```

📄 `angular/packages/core/src/metadata/di.ts` L286–311 （▶ の行: 301, 305–308, 311）

```ts
286 │ /**
287 │  * Type of the ContentChild metadata.
288 │  *
289 │  * @publicApi
290 │  */
291 │ export type ContentChild = Query;
292 │ 
293 │ /**
294 │  * ContentChild decorator and metadata.
295 │  *
296 │  *
297 │  * @Annotation
298 │  *
299 │  * @publicApi
300 │  */
301 ▶ export const ContentChild: ContentChildDecorator = makePropDecorator(
302 │   'ContentChild',
303 │   (selector?: any, opts: any = {}) => ({
304 │     selector,
305 ▶     first: true,
306 ▶     isViewQuery: false,
307 ▶     descendants: true,
308 ▶     ...opts,
309 │   }),
310 │   Query,
311 ▶ );
```

230 行目「descendants は true が既定」は 307 行目と合っていて、DEMO 1 の `@ContentChild(CrdqItem)` は文書で最初の b（div の中）を、`descendants: false` は a を返しました。256〜263 行目は markdown の表のつもりですが、表の 1 つ目の行（258〜260 行目）の途中で折り返し、260 行目の中に表の 2 つ目の行の始まり `| | Static queries` が入っています。markdown の表は 1 つの行を 1 行に書くので、ここは表としては組めません。同じ内容を `ViewChild` の方（449〜456 行目）は箇条書きで書いています。この表は 3348f8820b0（2023-07-23、#51146）で足されたものです。

## 5. ViewChildren と ViewChild

📄 `angular/packages/core/src/metadata/di.ts` L313–340 （▶ の行: 325–327, 329, 335–336, 338–339）

```ts
313 │ /**
314 │  * Type of the ViewChildren decorator / constructor function.
315 │  *
316 │  * @see {@link ViewChildren}
317 │  *
318 │  * @publicApi
319 │  */
320 │ export interface ViewChildrenDecorator {
321 │   /**
322 │    * @description
323 │    * Property decorator that configures a view query.
324 │    *
325 ▶    * Use to get the `QueryList` of elements or directives from the view DOM.
326 ▶    * Any time a child element is added, removed, or moved, the query list will be updated,
327 ▶    * and the changes observable of the query list will emit a new value.
328 │    *
329 ▶    * View queries are set before the `ngAfterViewInit` callback is called.
330 │    *
331 │    * **Metadata Properties**:
332 │    *
333 │    * * **selector** - The directive type or the name used for querying.
334 │    * * **read** - Used to read a different token from the queried elements.
335 ▶    * * **emitDistinctChangesOnly** - The ` QueryList#changes` observable will emit new values only
336 ▶    *   if the QueryList result has changed. When `false` the `changes` observable might emit even
337 │    *   if the QueryList has not changed.
338 ▶    *   ** Note: *** This config option is **deprecated**, it will be permanently set to `true` and
339 ▶    * removed in future versions of Angular.
340 │    *
```

📄 `angular/packages/core/src/metadata/di.ts` L341–372 （▶ の行: 346, 348–350, 352–353）

```ts
341 │    * The following selectors are supported.
342 │    *   * Any class with the `@Component` or `@Directive` decorator
343 │    *   * A template reference variable as a string (e.g. query `<my-component #cmp></my-component>`
344 │    * with `@ViewChildren('cmp')`)
345 │    *   * Any provider defined in the child component tree of the current component (e.g.
346 ▶    * `@ViewChildren(SomeService) someService!: SomeService`)
347 │    *   * Any provider defined through a string token (e.g. `@ViewChildren('someToken')
348 ▶    * someTokenVal!: any`)
349 ▶    *   * A `TemplateRef` (e.g. query `<ng-template></ng-template>` with `@ViewChildren(TemplateRef)
350 ▶    * template;`)
351 │    *
352 ▶    * In addition, multiple string selectors can be separated with a comma (e.g.
353 ▶    * `@ViewChildren('cmp1,cmp2')`)
354 │    *
355 │    * The following values are supported by `read`:
356 │    *   * Any class with the `@Component` or `@Directive` decorator
357 │    *   * Any provider defined on the injector of the component that is matched by the `selector` of
358 │    * this query
359 │    *   * Any provider defined through a string token (e.g. `{provide: 'token', useValue: 'val'}`)
360 │    *   * `TemplateRef`, `ElementRef`, `ViewContainerRef`, and `Injector`
361 │    *
362 │    * @usageNotes
363 │    *
364 │    * {@example core/di/ts/viewChildren/view_children_howto.ts region='HowTo'}
365 │    *
366 │    * ### Another example
367 │    *
368 │    * {@example core/di/ts/viewChildren/view_children_example.ts region='Component'}
369 │    *
370 │    * @Annotation
371 │    * @see [View queries](guide/components/queries#decorator-view-queries)
372 │    */
```

📄 `angular/packages/core/src/metadata/di.ts` L373–395 （▶ の行: 375, 379, 388）

```ts
373 │   (
374 │     selector: ProviderToken<unknown> | Function | string,
375 ▶     opts?: {read?: any; emitDistinctChangesOnly?: boolean},
376 │   ): any;
377 │   new (
378 │     selector: ProviderToken<unknown> | Function | string,
379 ▶     opts?: {read?: any; emitDistinctChangesOnly?: boolean},
380 │   ): ViewChildren;
381 │ }
382 │ 
383 │ /**
384 │  * Type of the ViewChildren metadata.
385 │  *
386 │  * @publicApi
387 │  */
388 ▶ export type ViewChildren = Query;
389 │ 
390 │ /**
391 │  * ViewChildren decorator and metadata.
392 │  *
393 │  * @Annotation
394 │  * @publicApi
395 │  */
```

📄 `angular/packages/core/src/metadata/di.ts` L408–430 （▶ の行: 419–421, 427–428）

```ts
408 │ 
409 │ /**
410 │  * Type of the ViewChild decorator / constructor function.
411 │  *
412 │  * @see {@link ViewChild}
413 │  * @publicApi
414 │  */
415 │ export interface ViewChildDecorator {
416 │   /**
417 │    * @description
418 │    * Property decorator that configures a view query.
419 ▶    * The change detector looks for the first element or the directive matching the selector
420 ▶    * in the view DOM. If the view DOM changes, and a new child matches the selector,
421 ▶    * the property is updated.
422 │    *
423 │    * **Metadata Properties**:
424 │    *
425 │    * * **selector** - The directive type or the name used for querying.
426 │    * * **read** - Used to read a different token from the queried elements.
427 ▶    * * **static** - `true` to resolve query results before change detection runs,
428 ▶    * `false` to resolve after change detection. Defaults to `false`.
429 │    *
430 │    *
```

📄 `angular/packages/core/src/metadata/di.ts` L431–457 （▶ の行: 436, 440, 449–456）

```ts
431 │    * The following selectors are supported.
432 │    *   * Any class with the `@Component` or `@Directive` decorator
433 │    *   * A template reference variable as a string (e.g. query `<my-component #cmp></my-component>`
434 │    * with `@ViewChild('cmp')`)
435 │    *   * Any provider defined in the child component tree of the current component (e.g.
436 ▶    * `@ViewChild(SomeService) someService: SomeService`)
437 │    *   * Any provider defined through a string token (e.g. `@ViewChild('someToken') someTokenVal:
438 │    * any`)
439 │    *   * A `TemplateRef` (e.g. query `<ng-template></ng-template>` with `@ViewChild(TemplateRef)
440 ▶    * template;`)
441 │    *
442 │    * The following values are supported by `read`:
443 │    *   * Any class with the `@Component` or `@Directive` decorator
444 │    *   * Any provider defined on the injector of the component that is matched by the `selector` of
445 │    * this query
446 │    *   * Any provider defined through a string token (e.g. `{provide: 'token', useValue: 'val'}`)
447 │    *   * `TemplateRef`, `ElementRef`, `ViewContainerRef`, and `Injector`
448 │    *
449 ▶    * Difference between dynamic and static queries:
450 ▶    *   * Dynamic queries \(`static: false`\) - The query resolves before the `ngAfterViewInit()`
451 ▶    * callback is called. The result will be updated for changes to your view, such as changes to
452 ▶    * `ngIf` and `ngFor` blocks.
453 ▶    *   * Static queries \(`static: true`\) - The query resolves once
454 ▶    * the view has been created, but before change detection runs (before the `ngOnInit()` callback
455 ▶    * is called). The result, though, will never be updated to reflect changes to your view, such as
456 ▶    * changes to `ngIf` and `ngFor` blocks.
457 │    *
```

📄 `angular/packages/core/src/metadata/di.ts` L458–493 （▶ の行: 462, 466, 473）

```ts
458 │    * @usageNotes
459 │    *
460 │    * ### Example 1
461 │    *
462 ▶    * {@example core/di/ts/viewChild/view_child_example.ts region='Component'}
463 │    *
464 │    * ### Example 2
465 │    *
466 ▶    * {@example core/di/ts/viewChild/view_child_howto.ts region='HowTo'}
467 │    *
468 │    * @Annotation
469 │    * @see [View queries](guide/components/queries#decorator-view-queries)
470 │    */
471 │   (
472 │     selector: ProviderToken<unknown> | Function | string,
473 ▶     opts?: {read?: any; static?: boolean},
474 │   ): any;
475 │   new (
476 │     selector: ProviderToken<unknown> | Function | string,
477 │     opts?: {read?: any; static?: boolean},
478 │   ): ViewChild;
479 │ }
480 │ 
481 │ /**
482 │  * Type of the ViewChild metadata.
483 │  *
484 │  * @publicApi
485 │  */
486 │ export type ViewChild = Query;
487 │ 
488 │ /**
489 │  * ViewChild decorator and metadata.
490 │  *
491 │  * @Annotation
492 │  * @publicApi
493 │  */
```

346・348 行目の例は `someService!: SomeService` と `!` が付いていますが、ContentChildren の 135 行目と ContentChild（241 行目）・ViewChild（436 行目）の例には付いておらず、strict の tsc で `TS2564: Property 'someService' has no initializer …` です。`@ContentChildren(TemplateRef) template;`（139 行目）をそのまま strict の tsc にかけると `TS7008: Member 'template' implicitly has an 'any' type.` です（型を付けないので）。

450〜456 行目の static の約束を、DEMO 1 の「static」で、いつも描く `<p #always>` と `@if` の中の `<p #inIf>` に static の true と false を 1 つずつ当てて確かめました。

1. **ngOnInit**

   `static: true` の `#always` だけが入っています。453〜455 行目「ビューができたあと、変更検知の前（`ngOnInit` の前）」のとおりです。
2. **ngAfterViewInit**

   `static: false` の 2 つが入りました（450〜451 行目）。`@if` の中の `static: true` は `undefined` のままです。作られた時点で `@if` の中身はまだ無いからです。
3. **show = false、そして true に戻す**

   `static: false` の `#inIf` は `undefined` になり、戻すとまた入りました（451〜452 行目「ビューの変化で更新される」）。`static: true` の方は一度も変わりません（455〜456 行目）。static のクエリが作成のときだけ更新される仕組みは[更新の時機の章](../qry/05-qry-refresh-timing.md)です。

123〜127 行目と 335〜339 行目の `emitDistinctChangesOnly` は、中に `#x` を持つが描かない `@if` を 3 回切り替えて、`changes` の回数を数えました。結果は毎回 1 件のままで、既定（`true`）は 0 回、`false` は 3 回でした。`QueryList.notifyOnChanges` が `this._changesDetected || !this._emitDistinctChangesOnly` のときだけ出すからです（linker/query\_list.ts L166）。

📄 `DEMO 1「emitDistinctChangesOnly」のテンプレート`

```
<p #x>x</p>@if (other) { @if (never) { <p #x>never</p> } }
```

## 6. NgModule の providers と ModuleWithProviders

📄 `angular/packages/core/src/metadata/ng_module.ts` L15–32 （▶ の行: 22, 24–25）

```ts
15 │ /**
16 │  * Type of the NgModule decorator / constructor function.
17 │  *
18 │  * @publicApi
19 │  */
20 │ export interface NgModuleDecorator {
21 │   /**
22 ▶    * Decorator that marks a class as an NgModule and supplies configuration metadata.
23 │    */
24 ▶   (obj?: NgModule): TypeDecorator;
25 ▶   new (obj?: NgModule): NgModule;
26 │ }
27 │ 
28 │ /**
29 │  * Type of the NgModule metadata.
30 │  *
31 │  * @publicApi
32 │  */
```

📄 `angular/packages/core/src/metadata/ng_module.ts` L47–75 （▶ の行: 48–53, 59, 61, 67–69, 72, 75）

````ts
47 │    *
48 ▶    * A lazy-loaded module has its own injector, typically a child of the app root injector.
49 ▶    * Lazy-loaded services are scoped to the lazy-loaded module's injector.
50 ▶    * If a lazy-loaded module also provides the `UserService`, any component created
51 ▶    * within that module's context (such as by router navigation) gets the local instance
52 ▶    * of the service, not the instance in the root injector.
53 ▶    * Components in external modules continue to receive the instance provided by their injectors.
54 │    *
55 │    * ### Example
56 │    *
57 │    * The following example defines a class that is injected in
58 │    * the HelloWorld NgModule:
59 ▶    *
60 │    * ```ts
61 ▶    * class Greeter {
62 │    *    greet(name:string) {
63 │    *      return 'Hello ' + name + '!';
64 │    *    }
65 │    * }
66 │    *
67 ▶    * @NgModule({
68 ▶    *   providers: [
69 ▶    *     Greeter
70 │    *   ]
71 │    * })
72 ▶    * class HelloWorld {
73 │    *   greeter:Greeter;
74 │    *
75 ▶    *   constructor(greeter:Greeter) {
````

L35〜46（[NgModule の概観](../ngmodule/01-ngmodule.md)が引いている）の続きで、L61〜78 の例は NgModule のクラス自身が constructor で `Greeter` を受けます。DEMO 1 の「NgModule と importProvidersFrom」で、この例（名前だけ変えた）を `createEnvironmentInjector([importProvidersFrom(HelloWorld)], 親)` にかけると、injector を作った時点で `HelloWorld` の constructor が 1 回呼ばれ、`get(HelloWorld).greeter.greet('crd')` は `'Hello crd!'`、`get(Greeter)` と同じ実例でした。injector を作った時点で作られるのは、`walkProviderTree` がモジュールの型ごとに `{provide: ENVIRONMENT_INITIALIZER, useValue: () => inject(defType!), multi: true}` を足すからです（di/provider\_collection.ts L339〜343、[walkProviderTree の章](../ngmodule/08-ngmodule-walk-provider-tree.md)）。48〜53 行目の遅延モジュールの injector は[遅延モジュールの章](../ngmodule/15-ngmodule-lazy-module.md)です。

`ModuleWithProviders`（di/interface/provider.ts L393〜396、[第 5 回](05-crd-provider.md)）の `forRoot` の形も同じ表で試しました。`importProvidersFrom(CfgModule.forRoot('a'))` は `'a'`、`forRoot('a')` と `forRoot('b')` を並べると後の `'b'`、`forRoot('a')` と、同じトークンを providers に持つモジュールを imports する `OuterModule` を並べると、後に書いた `OuterModule` ではなく `'a'` でした。`ModuleWithProviders` の providers はモジュールの木を全部たどったあとに足されるからで、この順は[walkProviderTree の章](../ngmodule/08-ngmodule-walk-provider-tree.md)と[forRoot の章](../ngmodule/09-ngmodule-module-with-providers.md)にあります。

ng\_module.ts L84〜107 の `declarations` の説明（[NgModule の概観](../ngmodule/01-ngmodule.md)が引いている）の例 `@NgModule({declarations: [NgFor]}) class CommonModule` は、今の ngc では `NG6001: Cannot declare 'NgForOf' in an NgModule as it's not a part of the current compilation.` です。`NgFor` が standalone になり、ほかのパッケージの宣言でもあるからです。L92〜93「2 つのモジュールで宣言するとエラー」は `NG6007: The Component 'Twice' is declared by more than one NgModule.` でした。

📄 `angular/packages/core/src/metadata/ng_module_def.ts` L31–41 （▶ の行: 35, 38–40）

```ts
31 │ 
32 │ /**
33 │  * Runtime link information for NgModules.
34 │  *
35 ▶  * This is the internal data structure used by the runtime to assemble components, directives,
36 │  * pipes, and injectors.
37 │  *
38 ▶  * NOTE: Always use `ɵɵdefineNgModule` function to create this object,
39 ▶  * never create the object directly since the shape of this object
40 ▶  * can change between versions.
41 │  */
```

📄 `angular/packages/core/src/metadata/schema.ts` L9–22 （▶ の行: 10, 12, 16, 20–21）

```ts
 9 │ /**
10 ▶  * A schema definition associated with a component or an NgModule.
11 │  *
12 ▶  * @see {@link NgModule}
13 │  * @see {@link CUSTOM_ELEMENTS_SCHEMA}
14 │  * @see {@link NO_ERRORS_SCHEMA}
15 │  *
16 ▶  * @param name The name of a defined schema.
17 │  *
18 │  * @publicApi
19 │  */
20 ▶ export interface SchemaMetadata {
21 ▶   name: string;
22 │ }
```

`NgModuleDef` の 38〜40 行目「直接作らず `ɵɵdefineNgModule` を使う」は、AOT の出力が `ɵɵdefineNgModule` を呼ぶ形（[AOT の出力の章](../ngmodule/03-ngmodule-aot-output.md)）を指します。`SchemaMetadata` は名前を 1 つ持つだけの形で、2 つの定数とそれが止める検査は[schemas の章](../ngmodule/16-ngmodule-schemas.md)です。

## 7. DoBootstrap：bootstrap が空のときだけ

📄 `angular/packages/core/src/metadata/do_bootstrap.ts` L9–36 （▶ の行: 13–14, 16, 25–27, 29）

````ts
 9 │ import {ApplicationRef} from '../application/application_ref';
10 │ 
11 │ /**
12 │  * @description
13 ▶  * Hook for manual bootstrapping of the application instead of using `bootstrap` array in @NgModule
14 ▶  * annotation. This hook is invoked only when the `bootstrap` array is empty or not provided.
15 │  *
16 ▶  * Reference to the current application is provided as a parameter.
17 │  *
18 │  * See ["Bootstrapping"](/guide/ngmodules/overview#bootstrapping-an-application).
19 │  *
20 │  * @usageNotes
21 │  * The example below uses `ApplicationRef.bootstrap()` to render the
22 │  * `AppComponent` on the page.
23 │  *
24 │  * ```ts
25 ▶  * class AppModule implements DoBootstrap {
26 ▶  *   ngDoBootstrap(appRef: ApplicationRef) {
27 ▶  *     appRef.bootstrap(AppComponent); // Or some other component
28 │  *   }
29 ▶  * }
30 │  * ```
31 │  *
32 │  * @publicApi
33 │  */
34 │ export interface DoBootstrap {
35 │   ngDoBootstrap(appRef: ApplicationRef): void;
36 │ }
````

14 行目「`bootstrap` の配列が空か無いときだけ呼ぶ」を、Node の記録で `platformBrowser().bootstrapModule` にかけて確かめました（DEMO 2）。`bootstrap` なしで `ngDoBootstrap` を持つモジュールは、引数に `ApplicationRef` を受け、25〜29 行目の例のとおり `appRef.bootstrap(…)` したコンポーネントが描かれます。`bootstrap: [App]` と `ngDoBootstrap` の両方を持つと `ngDoBootstrap` は呼ばれず、どちらも無いと `NG0403: The module M was bootstrapped, but it does not declare "@NgModule.bootstrap" components nor a "ngDoBootstrap" method.` でした（本番では `NG0403` だけ）。分かれ道の実装は[bootstrapModule の章](../ngmodule/11-ngmodule-bootstrap-module.md)が引く `_moduleDoBootstrap` です。25 行目の例は `@NgModule` を付けていないクラスで、`implements DoBootstrap` は型の約束だけです（ngc はエラー 0）。

> **🧪 DEMO 1 — クエリ・Attribute・NgModule の約束を本物で試す（AOT のこのページと、JIT の記録）**
>
> 押すと、本物の `@angular/core`（22.2.6）で小さなコンポーネントを `createComponent` で作り（文書に付けない div の上）、`detectChanges` してクエリの結果を読み、destroy します。NgModule の行は `createEnvironmentInjector` に `importProvidersFrom` を渡して作り、読んだら destroy します。「JIT（記録）」の列は同じ関数を Node（domino の上の JIT、開発モード）で走らせた手元の記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-query-module)

> **🧪 DEMO 2 — ngDoBootstrap の記録（Node、bootstrapModule）**
>
> アプリを丸ごと起動するので、このページの上では動かさず、手元の記録スクリプトの結果を並べます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-query-module)

## 説明文の例を ngc にかける

📄 `例を 1 つずつ strict + strictTemplates の ngc にかけた結果（2026-11-21、手元の記録）`

```
# 説明文の例を 1 つずつ、strict の tsc と strictTemplates の ngc（@angular/compiler-cli 22.2.6）にかける
attribute-ex.ts（di.ts L33 が指す examples/core/ts/metadata/metadata.ts L24-33）   エラー 0
query-templateref.ts（di.ts L138-139 の @ContentChildren(TemplateRef) template;）  TS7008: Member 'template' implicitly has an 'any' type.
ngmodule-providers.ts（ng_module.ts L61-78）                                     エラー 0
ngmodule-ngfor.ts（ng_module.ts L102-107）     NG6001: Cannot declare 'NgForOf' in an NgModule as it's not a part of the current compilation.
ngmodule-twice.ts（L92-93 を破る）              NG6007: The Component 'Twice' is declared by more than one NgModule.
dobootstrap.ts（do_bootstrap.ts L25-29）       エラー 0
query-fields.ts（L135・L137・L346 のフィールド） TS2564: Property 'someService' has no initializer ...（L135 の形だけ。any の L137 と ! の L346 は通る）
```

## ここまでの呼び出し

- 👤 `@ContentChildren(CrdqItem) direct`
  - `makePropDecorator('ContentChildren', props, Query)` — di.ts L197〜208 — *descendants: false・emitDistinctChangesOnly: true を足す*
    - `ɵɵcontentQuery(…, flags)` — コンパイラの出力（qry-compile の章）
      - `TQuery_.matchTNode` — render3/queries/query.ts L255〜280 — *文字列なら参照の名前と provider の両方*
      - `QueryList.reset` → `notifyOnChanges` — linker/query\_list.ts L166 — *変わったときだけ changes*
- 👤 `importProvidersFrom(CfgModule.forRoot('a'), OuterModule)`
  - `walkProviderTree` — di/provider\_collection.ts — *ModuleWithProviders の providers は最後に足す*

## テストと直し方

| ファイル（packages/core/test/acceptance/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `query_spec.ts` | `query logic › descendants: false (default)`（1232、8 の it） | 2 節の既定の descendants |
| `query_spec.ts` | `read option`（1572、30 の it） | 3 節の read の形 |
| `query_spec.ts` | `querying for string token providers`（2896、10 の it）・`query order`（1150） | 3 節の文字列のトークンと順 |
| `query_spec.ts` | `should set static view child queries in creation mode (and just in creation mode)`（157）・`should only fire if the content of the query changes`（2274） | 5 節の static と emitDistinctChangesOnly |
| `di_spec.ts` | `should inject attributes`（5059 ほか 3 つ）・``should inject `null` for attributes with data bindings``（5259） | 1 節 |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
query logic descendants: false                         Ran 8 of 2693 specs、0 failures
query logic read option                                Ran 30 of 2693 specs、0 failures
query logic querying for string token providers        Ran 10 of 2693 specs、0 failures
query logic query order                                Ran 2 of 2693 specs、0 failures
should only fire if the content of the query changes   Ran 1 of 2693 specs、0 failures
should set static view child queries in creation mode  Ran 1 of 2693 specs、0 failures
should inject attributes                               Ran 3 of 2693 specs、0 failures
should inject .null. for attributes with data bindings Ran 1 of 2693 specs、0 failures
```

直すとしたら説明文の 3 か所です。di.ts の 256〜263 行目の表は 1 行を 1 つの行に書き直すか、449〜456 行目と同じ箇条書きにします。139・245・350・440 行目の `template;` には型を、135・241・436 行目の `someService: SomeService` には `!` を付けます（strict の tsc で `TS7008` と `TS2564`。346 行目はすでに `!` の形）。ng\_module.ts の L98〜107 の例は、ほかの宣言を例に取り替えます。どれも振る舞いは変わらないので、spec は要りません。

## 聞かれそうな質問

**Q. `@ContentChildren` と `@ContentChild` で既定の descendants が違うのはなぜですか？**

props の既定がそう決めているからです（203 行目の `false`、307 行目の `true`）。説明文（121〜122 行目と 230〜231 行目）もそのとおり書いています。`ViewChildren`・`ViewChild` はいつも `true` で、引数で変えられません。

**Q. `@ViewChild('someToken')` は参照の名前ですか、トークンですか？**

両方です。同じ要素に `#someToken` の参照と `'someToken'` の provider があれば、参照が優先されます（spec の `should give precedence to local reference …`）。参照が無ければ provider が返ります（query.ts L261〜266）。

**Q. `static: true` のクエリを `@if` の中の要素に向けるとどうなりますか？**

ずっと `undefined` です。static のクエリは作成のときに 1 回だけ決まり、そのとき `@if` の中身はまだありません（450〜456 行目）。

**Q. `@Attribute('class')` は `[class.x]` の分も返しますか？**

返しません。静的に書いた class だけ（`tNode.classes`）で、DEMO では `'a b'` でした。

**Q. `importProvidersFrom(X.forRoot(), Y)` で同じトークンがあれば、どちらが勝ちますか？**

Y が同じトークンを imports の先で provide していても、`forRoot` の providers が勝ちました。`ModuleWithProviders` の providers はモジュールの木を全部たどったあとに足されるからです（walkProviderTree の章）。

## 読み終えて

- クエリの metadata は 7 つのフィールドで、4 つのデコレーターは既定の値だけが違う。`ContentChildren` だけ descendants が false。
- 文字列の selector は参照の名前とトークンの provider の両方で探す。カンマで並べても結果は文書の順。
- `static: true` は作成のときだけ、`emitDistinctChangesOnly` は変わったときだけ。
- NgModule のクラスは injector を作った時点で作られ、`forRoot` の providers は木の最後に足される。
- `ContentChild` の static の表は崩れていて、`template;` と `declarations: [NgFor]` の例は今はコンパイルできない。

---

← 前: [@Component の説明文：テンプレート・スタイル・変更検知・カプセル化](02-crd-component.md)  
次: [@Injectable・InjectionToken・forwardRef の説明文](04-crd-injectable-token.md) →
