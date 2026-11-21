[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 6 回 / 全 10 回

# viewChild()・contentChild() ほか signal のクエリの説明文

> authoring/queries.ts の未読の行：viewChild・viewChildren・contentChild・contentChildren の required・read・descendants、値が入る時と required の例外、例のコード。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-signal-queries)

---

この章で分かること：`authoring/queries.ts` の `viewChild`・`viewChildren`・`contentChild`・`contentChildren` の説明文（型の多重定義・例・注意書き）が約束する `required`・`read`・`descendants` を、本物で 1 つずつ確かめます。値がいつ入るか（constructor・effect・afterNextRender）と、required で値が無いときの `NG0951` も並べます。約束はほぼ書いてあるとおりに動きました。食い違いは 3 つで、`contentChild.required` の注入コンテキストの検査が別の関数の名前で出ること、`contentChildren` にだけ検査が無いこと、`contentChild` の `@See` が大文字で angular.dev に出ていないことです。

読む対象は `packages/core/src/authoring/queries.ts` の L34〜331（../angular、8576f161ae4）です。入口の 2 つの関数（L18〜32）と、クエリが「カウンタを読む computed」である仕組みは[input と viewChild の章](../signals/11-authoring.md)、コンパイラが `viewChild()` を見つけて `descendants` の既定を決めるところは[クエリのコンパイルの章](../qry/02-qry-compile.md)、デコレーターの `@ViewChild` ほかの説明文は[core の説明文（1）の第 3 回](../crd/03-crd-query-module.md)が読んでいます。

1. [1. ApplicationRef](01-cra-app-ref.md)
2. [2. platform と bootstrap](02-cra-platform.md)
3. [3. ViewContainerRef](03-cra-view-container.md)
4. [4. QueryList・DestroyRef](04-cra-linker-misc.md)
5. [5. input・model・output](05-cra-signal-io.md)
6. **6. signal のクエリ**（この章）
7. [7. NgZone・ErrorHandler](07-cra-zone-errors.md)
8. [8. DebugElement](08-cra-debug.md)
9. [9. サニタイズ](09-cra-sanitize.md)
10. [10. spec と issue](10-cra-tests-issues.md)

## 1. viewChild の型：read があるかで 2 つ、required でさらに 2 つ

📄 `angular/packages/core/src/authoring/queries.ts` L34–65 （▶ の行: 35, 37–38, 41, 45–46, 48, 51, 54, 57, 59, 61–64）

```ts
34 │ /**
35 ▶  * Type of the `viewChild` function. The viewChild function creates a singular view query.
36 │  *
37 ▶  * It is a special function that also provides access to required query results via the `.required`
38 ▶  * property.
39 │  *
40 │  * @publicApi
41 ▶  * @docsPrivate Ignored because `viewChild` is the canonical API entry.
42 │  */
43 │ export interface ViewChildFunction {
44 │   /**
45 ▶    * Initializes a view child query. Consider using `viewChild.required` for queries that should
46 ▶    * always match.
47 │    *
48 ▶    * @publicAPI
49 │    */
50 │ 
51 ▶   <LocatorT, ReadT>(
52 │     locator: ProviderToken<LocatorT> | string,
53 │     opts: {
54 ▶       read: ProviderToken<ReadT>;
55 │       debugName?: string;
56 │     },
57 ▶   ): Signal<ReadT | undefined>;
58 │ 
59 ▶   <LocatorT>(
60 │     locator: ProviderToken<LocatorT> | string,
61 ▶     opts?: {
62 ▶       debugName?: string;
63 ▶     },
64 ▶   ): Signal<LocatorT | undefined>;
65 │ 
```

📄 `angular/packages/core/src/authoring/queries.ts` L66–87 （▶ の行: 67, 69, 71–72, 77, 79, 82, 85–86）

```ts
66 │   /**
67 ▶    * Initializes a view child query that is expected to always match an element.
68 │    *
69 ▶    * @publicAPI
70 │    */
71 ▶   required: {
72 ▶     <LocatorT>(
73 │       locator: ProviderToken<LocatorT> | string,
74 │       opts?: {
75 │         debugName?: string;
76 │       },
77 ▶     ): Signal<LocatorT>;
78 │ 
79 ▶     <LocatorT, ReadT>(
80 │       locator: ProviderToken<LocatorT> | string,
81 │       opts: {
82 ▶         read: ProviderToken<ReadT>;
83 │         debugName?: string;
84 │       },
85 ▶     ): Signal<ReadT>;
86 ▶   };
87 │ }
```

35 行目「単数の view のクエリを作る」、37〜38 行目「`.required` というプロパティで必ずある結果にも届く」が、この型 `ViewChildFunction` の約束です。41 行目の `@docsPrivate` は「API の頁は `viewChild` の方に出す」という印で、型そのものは頁になりません。48・69 行目（と contentChild の型の 204 行目）の札は `@publicAPI` と大文字で、adev が安定版の札を付けるのは名前が `publicApi` のときだけですが（[第 5 回](05-cra-signal-io.md)が input・model・output の 11 か所で確かめた）、この 3 か所は `@docsPrivate` の型の中なので頁には出ません。

- 51〜57 行目：`read` を渡すと結果の型は `ReadT | undefined`（54 行目の `read` が型を決める）。59〜64 行目：渡さなければ `LocatorT | undefined`。
- 71〜86 行目の `required` は、同じ 2 つの形から `| undefined` を外したものです。並びは逆で、72〜77 行目に read なし、79〜85 行目に read ありが来ます（型の選ばれ方は変わらない。下の ngc の欄の `read-types.ts`）。
- 45〜46・67 行目「必ず一致するクエリには `viewChild.required`」の「必ず」を破ると何が起きるかは、型には書いてありません。5 節で `NG0951` を見ます。

## 2. viewChild の例と、関数にプロパティを生やす作り

📄 `angular/packages/core/src/authoring/queries.ts` L89–119 （▶ の行: 92, 98–99, 101–105, 108, 110–111, 113–119）

````ts
 89 │ /**
 90 │  * Initializes a view child query.
 91 │  *
 92 ▶  * Consider using `viewChild.required` for queries that should always match.
 93 │  *
 94 │  * @usageNotes
 95 │  * Create a child query in your component by declaring a
 96 │  * class field and initializing it with the `viewChild()` function.
 97 │  *
 98 ▶  * ```angular-ts
 99 ▶  * @Component({template: '<div #el></div><my-component #cmp />'})
100 │  * export class Card {
101 ▶  *   divEl = viewChild<ElementRef>('el');                   // Signal<ElementRef|undefined>
102 ▶  *   divElRequired = viewChild.required<ElementRef>('el');  // Signal<ElementRef>
103 ▶  *   cmp = viewChild(MyComponent);                          // Signal<MyComponent|undefined>
104 ▶  *   cmpRequired = viewChild.required(MyComponent);         // Signal<MyComponent>
105 ▶  * }
106 │  * ```
107 │  *
108 ▶  * @publicApi 19.0
109 │  * @initializerApiFunction
110 ▶  * @see [Referencing component children with queries](guide/components/queries)
111 ▶  * @see [Required queries](guide/components/queries#required-queries)
112 │  */
113 ▶ export const viewChild: ViewChildFunction = (() => {
114 ▶   // Note: This may be considered a side-effect, but nothing will depend on
115 ▶   // this assignment, unless this `viewChild` constant export is accessed. It's a
116 ▶   // self-contained side effect that is local to the user facing `viewChild` export.
117 ▶   (viewChildFn as any).required = viewChildRequiredFn;
118 ▶   return viewChildFn as typeof viewChildFn & {required: typeof viewChildRequiredFn};
119 ▶ })();
````

98〜105 行目の例を、DEMO 1 の「viewChild・viewChildren と read」で、名前だけ変えて本物にしました（`<div #el>` と `<crasq-child #cmp />`）。101〜104 行目の 4 つはどれも書いたとおりの値を返し、行末のコメントの型も strictTemplates の ngc で型の等しさとして一致しました（下の「説明文の例を ngc にかける」）。ただし 99 行目の `@Component` には `imports` が無く、そのまま ngc にかけると `NG8001: 'my-component' is not a known element` です。standalone が既定なので、`imports: [MyComponent]` を足して初めて 103 行目が実例を返します（足さなければ `<my-component>` はただの未知の要素で、`viewChild(MyComponent)` は `undefined`）。

113〜119 行目の作りは、[input と viewChild の章](../signals/11-authoring.md)が `input.required` で読んだのと同じ「関数オブジェクトにプロパティを足す」です。117 行目で `viewChildFn` に `required` を足し、118 行目でその `viewChildFn` 自身を返します。だから `viewChild.name` は `'viewChildFn'`、`viewChild.required.name` は `'viewChildRequiredFn'` です（Node で確かめた）。この名前が 5 節のエラーの文に出ます。

## 3. viewChildren：読み取り専用の集まり

📄 `angular/packages/core/src/authoring/queries.ts` L121–131 （▶ の行: 124, 128, 131）

```ts
121 │ export function viewChildren<LocatorT>(
122 │   locator: ProviderToken<LocatorT> | string,
123 │   opts?: {debugName?: string},
124 ▶ ): Signal<ReadonlyArray<LocatorT>>;
125 │ export function viewChildren<LocatorT, ReadT>(
126 │   locator: ProviderToken<LocatorT> | string,
127 │   opts: {
128 ▶     read: ProviderToken<ReadT>;
129 │     debugName?: string;
130 │   },
131 ▶ ): Signal<ReadonlyArray<ReadT>>;
```

📄 `angular/packages/core/src/authoring/queries.ts` L133–164 （▶ の行: 136–137, 143–144, 146, 152–153, 161–163）

````ts
133 │ /**
134 │  * Initializes a view children query.
135 │  *
136 ▶  * Query results are represented as a signal of a read-only collection containing all matched
137 ▶  * elements.
138 │  *
139 │  * @usageNotes
140 │  * Create a children query in your component by declaring a
141 │  * class field and initializing it with the `viewChildren()` function.
142 │  *
143 ▶  * ```ts
144 ▶  * @Component({...})
145 │  * export class TestComponent {
146 ▶  *   divEls = viewChildren<ElementRef>('el');   // Signal<ReadonlyArray<ElementRef>>
147 │  * }
148 │  * ```
149 │  *
150 │  * @initializerApiFunction
151 │  * @publicApi 19.0
152 ▶  * @see [Referencing component children with queries](guide/components/queries)
153 ▶  * @see [Required queries](guide/components/queries#required-queries)
154 │  */
155 │ export function viewChildren<LocatorT, ReadT>(
156 │   locator: ProviderToken<LocatorT> | string,
157 │   opts?: {
158 │     read?: ProviderToken<ReadT>;
159 │     debugName?: string;
160 │   },
161 ▶ ): Signal<ReadonlyArray<ReadT>> {
162 ▶   ngDevMode && assertInInjectionContext(viewChildren);
163 ▶   return createMultiResultQuerySignalFn<ReadT>(opts);
164 │ }
````

136〜137 行目「一致したすべての要素の、読み取り専用の集まりの signal」。DEMO 1 では `viewChildren<ElementRef>('el')` が `[ElementRef(<div #el>)]`、`@if` を true にして `detectChanges` すると `@if` の中の `<p #el>` も足されて 2 つになりました。単数の `viewChild('el')` は、そのときも文書で最初の `div` です。

- 「読み取り専用」は 161 行目の `ReadonlyArray` という型の約束で、実行時の配列は凍っていません（`Object.isFrozen` は `false`）。変化が無ければ 2 回読んでも同じ配列（`===`）、結果が変われば新しい配列でした。同じ配列を返す仕組みは[input と viewChild の章](../signals/11-authoring.md)の 7 節（`_flatValue`）です。同じ配列を返すので、受け取った配列を書き換えると次に読んだ人にも見えます。型が止めているのはこのためです。
- 144 行目の `@Component({...})` は省略の印で、そのまま tsc にかけると `TS1109: Expression expected.` です。`{...}` を template に替えれば、146 行目のコメントの型 `Signal<ReadonlyArray<ElementRef>>` と一致しました。257・309 行目の例も同じ書き方です。

## 4. contentChild と contentChildren：descendants の既定が逆

📄 `angular/packages/core/src/authoring/queries.ts` L166–188 （▶ の行: 166, 169, 174, 178, 186, 188）

```ts
166 ▶ export function contentChildFn<LocatorT, ReadT>(
167 │   locator: ProviderToken<LocatorT> | string,
168 │   opts?: {
169 ▶     descendants?: boolean;
170 │     read?: ProviderToken<ReadT>;
171 │     debugName?: string;
172 │   },
173 │ ): Signal<ReadT | undefined> {
174 ▶   ngDevMode && assertInInjectionContext(contentChild);
175 │   return createSingleResultOptionalQuerySignalFn<ReadT>(opts);
176 │ }
177 │ 
178 ▶ function contentChildRequiredFn<LocatorT, ReadT>(
179 │   locator: ProviderToken<LocatorT> | string,
180 │   opts?: {
181 │     descendants?: boolean;
182 │     read?: ProviderToken<ReadT>;
183 │     debugName?: string;
184 │   },
185 │ ): Signal<ReadT> {
186 ▶   ngDevMode && assertInInjectionContext(contentChildren);
187 │   return createSingleResultRequiredQuerySignalFn<ReadT>(opts);
188 ▶ }
```

📄 `angular/packages/core/src/authoring/queries.ts` L190–222 （▶ の行: 193–194, 196, 204, 209–210, 218–219）

```ts
190 │ /**
191 │  * Type of the `contentChild` function.
192 │  *
193 ▶  * The contentChild function creates a singular content query. It is a special function that also
194 ▶  * provides access to required query results via the `.required` property.
195 │  *
196 ▶  * @publicApi 19.0
197 │  * @docsPrivate Ignored because `contentChild` is the canonical API entry.
198 │  */
199 │ export interface ContentChildFunction {
200 │   /**
201 │    * Initializes a content child query.
202 │    *
203 │    * Consider using `contentChild.required` for queries that should always match.
204 ▶    * @publicAPI
205 │    */
206 │   <LocatorT>(
207 │     locator: ProviderToken<LocatorT> | string,
208 │     opts?: {
209 ▶       descendants?: boolean;
210 ▶       read?: undefined;
211 │       debugName?: string;
212 │     },
213 │   ): Signal<LocatorT | undefined>;
214 │ 
215 │   <LocatorT, ReadT>(
216 │     locator: ProviderToken<LocatorT> | string,
217 │     opts: {
218 ▶       descendants?: boolean;
219 ▶       read: ProviderToken<ReadT>;
220 │       debugName?: string;
221 │     },
222 │   ): Signal<ReadT | undefined>;
```

📄 `angular/packages/core/src/authoring/queries.ts` L224–246 （▶ の行: 225, 227, 232, 241）

```ts
224 │   /**
225 ▶    * Initializes a content child query that is always expected to match.
226 │    */
227 ▶   required: {
228 │     <LocatorT>(
229 │       locator: ProviderToken<LocatorT> | string,
230 │       opts?: {
231 │         descendants?: boolean;
232 ▶         read?: undefined;
233 │         debugName?: string;
234 │       },
235 │     ): Signal<LocatorT>;
236 │ 
237 │     <LocatorT, ReadT>(
238 │       locator: ProviderToken<LocatorT> | string,
239 │       opts: {
240 │         descendants?: boolean;
241 ▶         read: ProviderToken<ReadT>;
242 │         debugName?: string;
243 │       },
244 │     ): Signal<ReadT>;
245 │   };
246 │ }
```

📄 `angular/packages/core/src/authoring/queries.ts` L248–279 （▶ の行: 256–257, 259–263, 266, 271, 275–277）

````ts
248 │ /**
249 │  * Initializes a content child query. Consider using `contentChild.required` for queries that should
250 │  * always match.
251 │  *
252 │  * @usageNotes
253 │  * Create a child query in your component by declaring a
254 │  * class field and initializing it with the `contentChild()` function.
255 │  *
256 ▶  * ```ts
257 ▶  * @Component({...})
258 │  * export class Card {
259 ▶  *   headerEl = contentChild<ElementRef>('h');                    // Signal<ElementRef|undefined>
260 ▶  *   headerElElRequired = contentChild.required<ElementRef>('h'); // Signal<ElementRef>
261 ▶  *   header = contentChild(MyHeader);                             // Signal<MyHeader|undefined>
262 ▶  *   headerRequired = contentChild.required(MyHeader);            // Signal<MyHeader>
263 ▶  * }
264 │  * ```
265 │  *
266 ▶  * NOTE: By default `descendants` is `true` which means the query will traverse all descendants in the same template.
267 │  *
268 │  * @initializerApiFunction
269 │  * @publicApi 19.0
270 │  *
271 ▶  * @See [Content queries](guide/components/queries#content-queries)
272 │  */
273 │ export const contentChild: ContentChildFunction = (() => {
274 │   // Note: This may be considered a side-effect, but nothing will depend on
275 ▶   // this assignment, unless this `viewChild` constant export is accessed. It's a
276 ▶   // self-contained side effect that is local to the user facing `viewChild` export.
277 ▶   (contentChildFn as any).required = contentChildRequiredFn;
278 │   return contentChildFn as typeof contentChildFn & {required: typeof contentChildRequiredFn};
279 │ })();
````

📄 `angular/packages/core/src/authoring/queries.ts` L281–296 （▶ の行: 284–285, 292–293）

```ts
281 │ export function contentChildren<LocatorT>(
282 │   locator: ProviderToken<LocatorT> | string,
283 │   opts?: {
284 ▶     descendants?: boolean;
285 ▶     read?: undefined;
286 │     debugName?: string;
287 │   },
288 │ ): Signal<ReadonlyArray<LocatorT>>;
289 │ export function contentChildren<LocatorT, ReadT>(
290 │   locator: ProviderToken<LocatorT> | string,
291 │   opts: {
292 ▶     descendants?: boolean;
293 ▶     read: ProviderToken<ReadT>;
294 │     debugName?: string;
295 │   },
296 │ ): Signal<ReadonlyArray<ReadT>>;
```

📄 `angular/packages/core/src/authoring/queries.ts` L298–331 （▶ の行: 301–302, 309, 311, 315, 319–320, 322, 325, 329–331）

````ts
298 │ /**
299 │  * Initializes a content children query.
300 │  *
301 ▶  * Query results are represented as a signal of a read-only collection containing all matched
302 ▶  * elements.
303 │  *
304 │  * @usageNotes
305 │  * Create a children query in your component by declaring a
306 │  * class field and initializing it with the `contentChildren()` function.
307 │  *
308 │  * ```ts
309 ▶  * @Component({...})
310 │  * export class TestComponent {
311 ▶  *   headerEl = contentChildren<ElementRef>('h');   // Signal<ReadonlyArray<ElementRef>>
312 │  * }
313 │  * ```
314 │  *
315 ▶  * Note: By default `descendants` is `false` which means the query will not traverse all descendants in the same template.
316 │  *
317 │  * @initializerApiFunction
318 │  * @publicApi 19.0
319 ▶  * @see [Referencing component children with queries](guide/components/queries)
320 ▶  * @see [Content queries](guide/components/queries#content-queries)
321 │  */
322 ▶ export function contentChildren<LocatorT, ReadT>(
323 │   locator: ProviderToken<LocatorT> | string,
324 │   opts?: {
325 ▶     descendants?: boolean;
326 │     read?: ProviderToken<ReadT>;
327 │     debugName?: string;
328 │   },
329 ▶ ): Signal<ReadonlyArray<ReadT>> {
330 ▶   return createMultiResultQuerySignalFn<ReadT>(opts);
331 ▶ }
````

content の側は、`descendants`（169・209・284 行目ほか）が足されたほかは view の側と同じ形です。210・232・285 行目の `read?: undefined` は「read を書かない形」をはっきりさせる書き方で、view の側（61〜63 行目）には無い違いですが、ngc で read の有り無しの 5 つの形の型を比べて、どちらも同じに選ばれました。

266 行目「既定で `descendants` は true、同じテンプレートの中の子孫をすべてたどる」と 315 行目「`contentChildren` の既定は false」を、DEMO 1 の「contentChild・contentChildren と descendants」で確かめました（下のテンプレート）。

- `contentChild(CraSqItem)` は文書で最初の b（`div` の中）、`descendants: false` は直接の子の a でした。`contentChildren(CraSqItem)` は `[a]`、`descendants: true` は `[b, a]` です。
- 266 行目の「同じテンプレートの中」のとおり、投影した `<crasq-inner />` が自分のテンプレートに持つ `crasq-item` は、`descendants: true` でも入りません。
- 既定の値は実行時ではなくコンパイラが決めます（`query_functions.ts` の「content children 以外は descendants が既定で有効」、[クエリのコンパイルの章](../qry/02-qry-compile.md)）。266・315 行目の注意書きは 5a4ca620817（2025-05-20、#61534）で足され、266 行目は「traverse しない」と逆に書かれていたのを翌日の f68001d424f（#61580）が直しました。

📄 `DEMO 1「contentChild・contentChildren と descendants」のテンプレート`

```
<crasq-parent>
  <div><crasq-item name="b（div の中）" /></div>
  <crasq-item name="a（直接の子）" />
  <h3 #h>見出し</h3>
  <crasq-inner />   <!-- 自分のテンプレートに <crasq-item name="inner のテンプレートの中" /> を持つ -->
</crasq-parent>
```

256〜263 行目の例は、`{...}` を替え、`MyHeader` を足すと ngc を通り、4 つのコメントの型も一致しました。260 行目のフィールドの名前 `headerElElRequired` は `El` が 2 回重なっています（動きには関係しない）。

271 行目だけ `@See` と S が大文字です。API の頁を作る道は、JSDoc の札の名前を `t.tagName.getText()` のまま取り出し（compiler-cli の docs/src/jsdoc\_extractor.ts L26）、`tag.name === 'see'` の札だけを関連の案内にします（adev/shared-docs/pipeline/api-gen/rendering/transforms/jsdoc-transforms.mts L42・L253）。そのため angular.dev の `contentChild` の頁には「Content queries」の案内が出ず、小文字の `@see` で書いた `contentChildren` の頁（319〜320 行目、0432e761713 で 2025-11-16 に足された）には 2 つ出ています（2026-11-22 に両方の頁で確かめた）。271 行目は 6073493c5bb（2026-03-09、``docs: Adds `@see` links and update defer reference``）で、266 行目の `NOTE:` と一緒に入り、main でもそのままです。ほかの `viewChild`・`viewChildren` の頁の案内（110〜111・152〜153 行目）も小文字です。275〜276 行目のコメントは view の側（114〜116 行目）を写したままで、`contentChild` なのに `viewChild` と書いています。

## 5. 値が入る時と、required の NG0951

説明文は値がいつ入るかを書いていません。DEMO 1 の「値が入る時」で、いつも描く `<p #always>` と、`@if` の中の `<p #inIf>` を、constructor・effect・ライフサイクル・afterNextRender の中で読みました。

1. **constructor**

   `always` は `undefined`、`viewChildren` は `[]`、`viewChild.required` は `NG0951` を投げました。ビューの作成パスの前で、クエリがまだ signal に結ばれていないからです（query\_reactive.ts L126〜127、[input と viewChild の章](../signals/11-authoring.md) 7 節）。
2. **createComponent の直後（detectChanges の前）**

   もう `always` が入っています。作成パスが終わった時点で結果がそろうので、`@ViewChild` の `static: true` のように、変更検知を待ちません（signal\_queries\_spec.ts L82〜84 のコメント「すべてのクエリが static のようにふるまう」）。
3. **ngOnInit → effect → ngAfterViewInit → afterNextRender**

   この順に呼ばれ、どこでも `always` が入っていました。effect はコンポーネントの effect で、最初の実行は ngOnInit と ngAfterViewInit のあいだでした。`@if` が false のあいだ `inIf` は `undefined` です。
4. **@if を true にして detectChanges**

   effect が `inIf` を読んでいたので、もう一度走り、そこで `ElementRef(<p #inIf>)` が見えました。クエリが signal なので、`QueryList.changes` を購読しなくても追えます。

required の「必ず一致する」を破ると、読んだときに `NG0951: Child query result is required but no value is available.` です（本番は `NG0951` だけ）。`@if` が false の中を指す `viewChild.required`・当たらない名前・何も投影しない `contentChild.required` のどれも同じでした。宣言したときではなく、読んだときに投げます（DEMO 1 の「required で値が無いとき」）。投げる行は query\_reactive.ts L60〜64 で、[input と viewChild の章](../signals/11-authoring.md)の 6 節です。

## 6. 注入コンテキストの検査：名前の違いと、無い 1 つ

174 行目と 186 行目、162 行目、そして L22・L30（入口の 2 つの関数は[input と viewChild の章](../signals/11-authoring.md)が引いている）は、開発モードだけ `assertInInjectionContext(fn)` を呼びます。この関数はエラーの文に `fn.name` を入れます（di/contextual.ts L77〜87、注入コンテキストそのものは[注入コンテキストの章](../di/03-di-injection-context.md)）。ただ、AOT のコンパイラは、フィールドの初期化子の外で `viewChild('a')` などを直接呼ぶと、その時点で `NG8110: Unsupported call to the viewChild function. This function can only be called in the initializer of a class member.` で止めます（compiler-cli の validation/src/rules/initializer\_api\_usage\_rule.ts L116。メソッドの中・constructor の中での代入・クラスの外の関数のどれも止まった）。止まらないのは、`const vc = viewChild;` のように別の名前に取り出してから呼ぶ形と、JIT です。DEMO 1 の「注入コンテキストの外で呼ぶ」は取り出す形で呼び、開発モードの記録では次のとおりでした。

| 呼んだもの | 検査に渡す関数（行） | 開発モードの文（記録） |
| --- | --- | --- |
| `viewChild('a')`・`viewChild.required('a')` | `viewChild`（L22・L30） | `NG0203: viewChildFn() can only be used within an injection context …` |
| `viewChildren('a')` | `viewChildren`（162） | `NG0203: viewChildren() …` |
| `contentChild('a')` | `contentChild`（174） | `NG0203: contentChildFn() …` |
| `contentChild.required('a')` | `contentChildren`（186） | `NG0203: contentChildren() …` |
| `contentChildren('a')` | 無い（322〜331） | 例外なし。signal を返し、読むと `[]` |

186 行目は `contentChild.required` の中なのに `contentChildren` を渡していて、エラーの文が呼んでいない関数の名前を言います。`contentChildren` だけは 329〜330 行目に検査が無く、注入コンテキストの外でも黙って結ばれない signal を返します（ずっと `[]`）。どちらも 018f8266b3c（2024-03-08、`fix(core): ensure all initializer functions run in an injection context (#54761)`）が 5 つの関数に検査を足したときからで、main でも同じです。名前が `viewChildFn` と出るのは 2 節の 118 行目のためで、`input()`・`model()` でも同じく `inputFunction()`・`modelFunction()` と出ます（[第 5 回](05-cra-signal-io.md)）。本番では 5 つとも検査が無く（`ngDevMode &&`）、このページの列はどれも「例外なし」です。

> **🧪 DEMO 1 — signal のクエリの約束を本物で試す（AOT のこのページと、開発モードの記録）**
>
> 押すと、本物の `@angular/core`（22.2.6）で小さなコンポーネントを `createComponent` で作り（文書に付けない div の上。ApplicationRef には付けない）、`detectChanges` してクエリの signal を読み、destroy します。「値が入る時」は afterNextRender を待つので一呼吸かかります。「記録（開発モード）」の列は、同じ関数を Node（domino の上の JIT、開発モード）で走らせた手元の記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-signal-queries)

## 説明文の例を ngc にかける

📄 `例を 1 つずつ strict + strictTemplates の ngc にかけた結果（2026-11-22、手元の記録）`

```
# 説明文の例を 1 つずつ、strict の tsc と strictTemplates の ngc（@angular/compiler-cli 22.2.6）にかける。
# 型は「行末のコメントの型」と型の等しさ（Eq<A, B>）で比べた。
vc-asis.ts（L98-105 をそのまま。MyComponent の定義だけ足す）
  NG8001: 'my-component' is not a known element（例の @Component に imports が無い）
vc-types.ts（L98-105 に imports: [MyComponent] を足す）            エラー 0、4 つのコメントの型はどれも一致
vcs-asis.ts（L143-147 をそのまま）                                  TS1109: Expression expected.（@Component({...}) の {...}）
vcs-types.ts（{...} を template に替える）                          エラー 0、Signal<ReadonlyArray<ElementRef>> と一致
cc-types.ts（L256-263、{...} を替え、MyHeader を足す）               エラー 0、4 つのコメントの型はどれも一致
ccs-types.ts（L308-312、{...} を替える）                            エラー 0、Signal<ReadonlyArray<ElementRef>> と一致
read-types.ts（read を付けた 5 つの形）                             エラー 0（read の型がそのまま値の型になる）
# 初期化子の外で呼ぶ
ctx-method.ts（メソッドの中で viewChild・contentChildren）           NG8110: Unsupported call to the viewChild function. …（2 つとも）
ctx-ctor.ts（constructor の中で this.x = viewChild('a')）            NG8110
ctx-plainfn.ts（クラスの外の関数で contentChildren('a')）             NG8110
ctx-alias.ts（const vc = viewChild; のあと関数の中で vc('a')）        エラー 0（コンパイラには見えない）
```

## ここまでの呼び出し

- 👤 `need = contentChild.required(CraSqItem)` — フィールドの初期化子
  - `contentChildRequiredFn(locator, opts)` — queries.ts L178〜188 — *開発モードだけ assertInInjectionContext(contentChildren)*
    - `createSingleResultRequiredQuerySignalFn(opts)` — render3/queries/query\_reactive.ts — *カウンタを読む computed（authoring の章）*
- `ɵɵcontentQuerySignal(…)` — コンパイラの出力（qry-compile の章） — *descendants の既定はここで true*
  - `bindQueryToSignal` — query\_reactive.ts L103 — *ここで初めて結果が見える*
- 👤 `this.need()` — テンプレート・effect・afterNextRender
  - `refreshSignalQuery` → `undefined` — query\_reactive.ts L111〜 — *required なら NG0951*

## テストと直し方

| ファイル（packages/core/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `acceptance/authoring/signal_queries_spec.ts` | `queries as signals › view › should query for an optional element in a template`（34）・`should query for a required element in a template`（72）・`should query for multiple elements in a template`（91） | 1〜3 節の 4 つの形 |
| 同 | `should return undefined if optional query is read in the constructor`（54）・`should return an empty array when reading children query in the constructor`（128） | 5 節の constructor |
| 同 | `should return the same array instance when there were no changes in results`（146）・`` should read the node injector of the queried element with `read: Injector` ``（277） | 3 節の同じ配列、1 節の read |
| 同 | `content queries › should run content queries defined on components`（305）・`should not return partial results during the first-time view rendering`（403） | 4 節 |
| `acceptance/component_spec.ts` | `required initiliazers › should throw if required query is read in the constructor`（979） | 5 節の NG0951 |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance/authoring:test --nocache_test_results --test_output=all
62 specs, 0 failures                         PASSED
$ ... "--test_arg=--filter=queries as signals"                    Ran 23 of 62 specs、0 failures
$ ... "--test_arg=--filter=queries as signals view"               Ran 12 of 62 specs、0 failures
$ ... "--test_arg=--filter=queries as signals content queries"    Ran 5 of 62 specs、0 failures
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=required initiliazers"                   Ran 3 of 2693 specs、0 failures
```

`descendants` の既定（266・315 行目）と、注入コンテキストの外で呼んだときの `NG0203` を固める it は、どちらの spec にもありません（`grep -n "injection context\|descendants"` で 0 件）。直すとしたら queries.ts の 3 か所です。186 行目の `assertInInjectionContext(contentChildren)` を `contentChild` に、`contentChildren` の本体（329 行目の前）に `ngDevMode && assertInInjectionContext(contentChildren);` を足し、271 行目の `@See` を `@see` にします。spec は signal\_queries\_spec.ts に「注入コンテキストの外で 6 つを呼ぶと、呼んだ関数の名前で `NG0203`」の it を足します。名前を `viewChildFn` でなく `viewChild` と出したいなら、検査に渡す関数を名前で選べるようにするか、`viewChildFn` の名前を変える必要があります（`input` の側の作りは[第 5 回](05-cra-signal-io.md)）。

## 聞かれそうな質問

**Q. `viewChild()` は `ngAfterViewInit` まで待つ必要がありますか？**

ありません。作成パスが終われば入っていて、DEMO では createComponent の直後と ngOnInit でもう読めました。constructor の中だけはまだ `undefined`（required なら `NG0951`）です。`@if` の中のものは、その `@if` が描かれてからです。

**Q. `contentChild` と `contentChildren` で、同じ selector なのに数が合わないのはなぜですか？**

`descendants` の既定が逆だからです（266 行目は true、315 行目は false）。`contentChildren` で入れ子の中も拾うなら `{descendants: true}` を書きます。どちらでも、投影したコンポーネントの自分のテンプレートの中は見ません。

**Q. `viewChild.required` はいつ NG0951 を投げますか？**

読んだときに結果が無ければです。宣言のときには何も検査しません。`@if` の中を指していれば、`@if` が false のあいだに読むと投げます。

**Q. `viewChildren()` が返す配列を並べ替えてもいいですか？**

型は `ReadonlyArray`（161 行目）で、実行時には凍っていませんが、変化が無ければ同じ配列が返るので、書き換えると次に読む人にも見えます。並べ替えるなら `[...xs]` で写します。

**Q. 注入コンテキストの外で `contentChildren()` を呼ぶとどうなりますか？**

開発モードでも例外になりません。ほかの 5 つは `NG0203` ですが、`contentChildren` だけ 322〜331 行目に検査が無いからです。返る signal はクエリに結ばれず、ずっと `[]` です。

## 読み終えて

- 4 つの関数の型は「read があるか」と「required か」で決まり、説明文の型のコメントはどれも本物の型と一致した。
- `descendants` の既定は `contentChild` が true、`contentChildren` が false。どちらも同じテンプレートの中だけ。
- 値は作成パスのあとから見える。constructor の中だけ空で、required は読んだときに `NG0951`。
- 注入コンテキストの検査は、`contentChild.required` が `contentChildren` の名前で出し、`contentChildren` には無い。
- 例の 3 つは `{...}` の省略、1 つは `imports` が無く、`contentChild` の `@See` は頁に出ていない。

---

← 前: [input()・model()・output() の説明文](05-cra-signal-io.md)  
次: [NgZone・ErrorHandler・EventEmitter・PendingTasks の説明文](07-cra-zone-errors.md) →
