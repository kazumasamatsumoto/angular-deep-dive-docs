[目次](../README.md) › [@schematics/angular の道具と移行](README.md) › 第 8 回 / 全 11 回

# Jasmine から Vitest へ（2）：spy と型

> refactor/jasmine-vitest/transformers/jasmine-spy.ts・jasmine-type.ts：spyOn・createSpy・createSpyObj・and.returnValue ほかを vi.fn・vi.spyOn に直す規則、jasmine.Spy などの型の書き換え、直せないものの印。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sca-jv-spy)

---

この章で分かること：`refactor-jasmine-vitest` が Jasmine の spy（`spyOn`・`jasmine.createSpy`・`jasmine.createSpyObj`、`.and.*` の振る舞い、`.calls.*` の記録）と `jasmine.Spy` などの型を、Vitest の `vi.spyOn`・`vi.fn`・`vi.mocked(spy).mock` にどう書き換えるかです。30 個の it を Jasmine で走らせ、変換したものを Vitest で走らせて、**意味が変わるもの**・**型の検査で止まるもの**・TODO になるものを分けます。

読む対象は `packages/schematics/angular/refactor/jasmine-vitest/transformers/` の `jasmine-spy.ts`・`jasmine-type.ts` と、`utils/ast-helpers.ts` の `getPromiseResolveRejectMethod` です（../angular-cli、44129f66a3）。変換器を当てる順と TODO の付け方は[前の回](07-sca-jv-overview.md)、変換した spec を走らせる unit-test builder の側は[Vitest の executor の章](../vit/04-vit-executor.md)です。

1. [1. 変更の単位とファイルの道具](01-sca-change.md)
2. [2. AST の道具](02-sca-ast-utils.md)
3. [3. 依存を足す](03-sca-dependency.md)
4. [4. standalone のアプリを書き換える](04-sca-standalone.md)
5. [5. builder の移行](05-sca-build-migrations.md)
6. [6. Karma から Vitest へ](06-sca-karma-vitest.md)
7. [7. Jasmine から Vitest へ（1）骨組み](07-sca-jv-overview.md)
8. **8. Jasmine から Vitest へ（2）spy と型**（この章）
9. [9. Jasmine から Vitest へ（3）matcher](09-sca-jv-matcher.md)
10. [10. Jasmine から Vitest へ（4）lifecycle と fakeAsync](10-sca-jv-lifecycle.md)
11. [11. spec と issue](11-sca-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> この章のファイルは版で違います。`jasmine-spy.ts` は 44129f66a3 のあと、22.2.x の枝と main の両方に 6 つの修正が入りました（下の各節）。そこで DEMO の記録は 3 つの変換器で取りました。**44129f66a3** と **main（0a61cbc4bf）**は、手元でそのソースを TypeScript から JS に直しただけのもの、**22.2.7** は npm の公開物です（22.2.7 は手元で直したものと出力が同じことも確かめました）。Jasmine は jasmine 5.13.0、Vitest は 5.1.2 です。型の検査は、`ng new` して `npm install` したワークスペースで `ng g … refactor-jasmine-vitest` → `ng test` を走らせて取りました。そこに入った `@angular/cli` 22.3.0 は自分の `@schematics/angular` 22.3.0 を使い、その refactor の中身は main と同じです。引用は 44129f66a3 です。本文の commit の hash は main のもので、22.2.x の枝には同じ PR が別の hash で入っています。

## 1. spyOn：Jasmine の「既定は何もしない」を残す

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L57–96 （▶ の行: 60–61, 63, 65, 67, 72, 79, 82, 89–90, 92）

```ts
57 │ function transformPrimarySpy(node: ts.CallExpression, refactorCtx: RefactorContext): ts.Node {
58 │   const { sourceFile, reporter, pendingVitestValueImports } = refactorCtx;
59 │   if (
60 ▶     ts.isIdentifier(node.expression) &&
61 ▶     (node.expression.text === 'spyOn' || node.expression.text === 'spyOnProperty')
62 │   ) {
63 ▶     addVitestValueImport(pendingVitestValueImports, 'vi');
64 │ 
65 ▶     const viSpyOnCall = ts.factory.updateCallExpression(
66 │       node,
67 ▶       createPropertyAccess('vi', 'spyOn'),
68 │       node.typeArguments,
69 │       node.arguments,
70 │     );
71 │ 
72 ▶     if (isChainedWithAnd(node)) {
73 │       reporter.reportTransformation(
74 │         sourceFile,
75 │         node,
76 │         `Transformed \`${node.expression.text}\` to \`vi.spyOn\`.`,
77 │       );
78 │ 
79 ▶       return viSpyOnCall;
80 │     }
81 │ 
82 ▶     reporter.reportTransformation(
83 │       sourceFile,
84 │       node,
85 │       `Transformed \`${node.expression.text}\` to \`vi.spyOn\`, ` +
86 │         `appending \`.mockReturnValue(undefined)\` to preserve stub-by-default semantics.`,
87 │     );
88 │ 
89 ▶     return ts.factory.createCallExpression(
90 ▶       createPropertyAccess(viSpyOnCall, 'mockReturnValue'),
91 │       undefined,
92 ▶       [ts.factory.createIdentifier('undefined')],
93 │     );
94 │   }
95 │ 
96 │   return node;
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L27–55 （▶ の行: 28, 30–31, 34, 37, 41–42, 46, 48）

```ts
27 │ function isChainedWithAnd(node: ts.Node): boolean {
28 ▶   let parent = node.parent;
29 │   while (parent) {
30 ▶     if (ts.isPropertyAccessExpression(parent)) {
31 ▶       if (ts.isIdentifier(parent.name) && parent.name.text === 'and') {
32 │         return true;
33 │       }
34 ▶     } else if (ts.isElementAccessExpression(parent)) {
35 │       if (
36 │         ts.isStringLiteralLike(parent.argumentExpression) &&
37 ▶         parent.argumentExpression.text === 'and'
38 │       ) {
39 │         return true;
40 │       }
41 ▶     } else if (
42 ▶       ts.isParenthesizedExpression(parent) ||
43 │       ts.isAsExpression(parent) ||
44 │       ts.isNonNullExpression(parent) ||
45 │       ts.isTypeAssertionExpression(parent) ||
46 ▶       ts.isSatisfiesExpression(parent)
47 │     ) {
48 ▶       parent = parent.parent;
49 │       continue;
50 │     }
51 │     break;
52 │   }
53 │ 
54 │   return false;
55 │ }
```

Jasmine の `spyOn(obj, 'm')` は、元の関数を呼ばずに `undefined` を返す spy に置き換えます。Vitest の `vi.spyOn` は既定で元の関数を呼びます。そこで 89〜93 行目で `.mockReturnValue(undefined)` を後ろに付けます。ただし 72 行目、親をたどって `.and` が付いていれば（`isChainedWithAnd`）付けません。`.and.returnValue(…)` などで振る舞いを決め直すからです。41〜49 行目は括弧・`as`・`!`・`satisfies` を飛ばして親へ進みます。

この 89〜93 行目は 673dbaf89f（2026-05、issue #33253「Bare spyOn() migration silently changes test behavior」）が足しました。記録の「01 bare spyOn stubs」は 3 つの版とも Vitest で通ります。ところが `ng test` は型の検査で止まりました。`add(a: number, b: number): number` の spy に `mockReturnValue(undefined)` は「TS2345: Argument of type 'undefined' is not assignable to parameter of type 'number'.」です。記録の 2 つの spec（it 30 個）で、`ng test` の型のエラーは 17 個、そのうち 10 個がこの形でした。Vitest だけで走らせると型を見ないので通り、`ng test`（Angular のコンパイラが spec の型を検査する）では 1 つでもあればファイルごと走りません。新しい本家でも同じ行です。

61 行目は `spyOnProperty` も同じ道に入れます。44129f66a3 では引数をそのまま渡すので、`spyOnProperty(c, 'mode')` が `vi.spyOn(c, 'mode')` になり、Vitest は「vi.spyOn() can only spy on a function. Received string.」でした（記録の 13）。Jasmine の 3 つ目の引数の既定は `'get'` です。22.2.7 と main では 4ea7c673e0（PR #34543）が `'get'` を足し、通ります。

## 2. .and.\*：振る舞いの付け替え

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L99–128 （▶ の行: 101, 105, 108, 111, 113–114, 117, 119, 126–128）

```ts
 99 │ function transformSpyStrategy(node: ts.CallExpression, refactorCtx: RefactorContext): ts.Node {
100 │   const { sourceFile, reporter } = refactorCtx;
101 ▶   if (!ts.isPropertyAccessExpression(node.expression)) {
102 │     return node;
103 │   }
104 │ 
105 ▶   const pae = node.expression;
106 │   let spyCall: ts.Expression | undefined;
107 │ 
108 ▶   if (
109 │     ts.isPropertyAccessExpression(pae.expression) &&
110 │     ts.isIdentifier(pae.expression.name) &&
111 ▶     pae.expression.name.text === 'and'
112 │   ) {
113 ▶     spyCall = pae.expression.expression;
114 ▶   } else if (
115 │     ts.isElementAccessExpression(pae.expression) &&
116 │     ts.isStringLiteralLike(pae.expression.argumentExpression) &&
117 ▶     pae.expression.argumentExpression.text === 'and'
118 │   ) {
119 ▶     spyCall = pae.expression.expression;
120 │   }
121 │ 
122 │   if (spyCall) {
123 │     let newMethodName: string | undefined;
124 │     let args = node.arguments;
125 │ 
126 ▶     if (ts.isIdentifier(pae.name)) {
127 ▶       const strategyName = pae.name.text;
128 ▶       switch (strategyName) {
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L129–150 （▶ の行: 129, 132, 135–136, 138–139, 141, 145–146, 148–149）

```ts
129 ▶         case 'returnValue':
130 │           {
131 │             const firstArg = args[0];
132 ▶             const result = firstArg ? getPromiseResolveRejectMethod(firstArg) : null;
133 │             if (result) {
134 │               const methodMapping = {
135 ▶                 'resolve': 'mockResolvedValue',
136 ▶                 'reject': 'mockRejectedValue',
137 │               };
138 ▶               newMethodName = methodMapping[result.methodName];
139 ▶               args = result.arguments;
140 │             } else {
141 ▶               newMethodName = 'mockReturnValue';
142 │             }
143 │           }
144 │           break;
145 ▶         case 'resolveTo':
146 ▶           newMethodName = 'mockResolvedValue';
147 │           break;
148 ▶         case 'rejectWith':
149 ▶           newMethodName = 'mockRejectedValue';
150 │           break;
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/utils/ast-helpers.ts` L81–108 （▶ の行: 90–93, 98–99, 104–106）

```ts
 81 │ export function getPromiseResolveRejectMethod(node: ts.Node): {
 82 │   methodName: 'resolve' | 'reject';
 83 │   arguments: ts.NodeArray<ts.Expression>;
 84 │ } | null {
 85 │   if (!ts.isCallExpression(node)) {
 86 │     return null;
 87 │   }
 88 │ 
 89 │   const expr = node.expression;
 90 ▶   if (
 91 ▶     !ts.isPropertyAccessExpression(expr) ||
 92 ▶     !ts.isIdentifier(expr.expression) ||
 93 ▶     expr.expression.escapedText !== 'Promise'
 94 │   ) {
 95 │     return null;
 96 │   }
 97 │ 
 98 ▶   const methodName = expr.name.escapedText as string;
 99 ▶   const isResolveReject = methodName === 'resolve' || methodName === 'reject';
100 │   if (!isResolveReject) {
101 │     return null;
102 │   }
103 │ 
104 ▶   return {
105 ▶     methodName,
106 ▶     arguments: node.arguments,
107 │   };
108 │ }
```

`transformSpyStrategy` は `X.and.名前(…)` の形（108〜120 行目、`X['and']` も）を探し、113 行目で `.and` の左（`spyOn(...)` や spy の変数）を取り出します。`returnValue` は 132 行目で引数が `Promise.resolve(…)`・`Promise.reject(…)` かを ast-helpers.ts の 81〜108 行目で見て、`mockResolvedValue`・`mockRejectedValue` に分けます。93 行目は `Promise` という名前だけを見ます。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L151–174 （▶ の行: 151, 157–158, 160, 163–164, 166, 170, 173）

```ts
151 ▶         case 'returnValues': {
152 │           reporter.reportTransformation(
153 │             sourceFile,
154 │             node,
155 │             'Transformed `.and.returnValues()` to chained `.mockReturnValueOnce()` calls.',
156 │           );
157 ▶           const returnValues = node.arguments;
158 ▶           if (returnValues.length === 0) {
159 │             // No values, so it's a no-op. Just transform the spyOn call.
160 ▶             return transformSpies(spyCall, refactorCtx);
161 │           }
162 │           // spy.and.returnValues(a, b) -> spy.mockReturnValueOnce(a).mockReturnValueOnce(b)
163 ▶           let chainedCall: ts.Expression = spyCall;
164 ▶           for (const value of returnValues) {
165 │             const mockCall = ts.factory.createCallExpression(
166 ▶               createPropertyAccess(chainedCall, 'mockReturnValueOnce'),
167 │               undefined,
168 │               [value],
169 │             );
170 ▶             chainedCall = mockCall;
171 │           }
172 │ 
173 ▶           return chainedCall;
174 │         }
```

`returnValues(a, b)` は 164〜171 行目で `.mockReturnValueOnce(a).mockReturnValueOnce(b)` の鎖にします。Jasmine（jasmine-core 5.13 の `SpyStrategy.prototype.returnValues`）は値を `shift()` で 1 つずつ返し、尽きれば `undefined` です。Vitest の `…Once` は尽きると既定の振る舞いに戻ります。`spyOn(...)` の場合は 1 節の 72 行目で `mockReturnValue(undefined)` を付けないので、既定は**元の関数を呼ぶ**です。記録の「06 returnValues then undefined」は 3 回目の `c.add(5, 5)` が Jasmine で `undefined`、Vitest で `10` になり、3 つの版とも落ちました。spec の 37〜40 行目はこの出力をそのまま期待しています。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L175–203 （▶ の行: 178–179, 185–186, 192–193, 199, 202）

```ts
175 │         case 'callFake':
176 │           newMethodName = 'mockImplementation';
177 │           break;
178 ▶         case 'callThrough':
179 ▶           reporter.reportTransformation(
180 │             sourceFile,
181 │             node,
182 │             'Removed redundant `.and.callThrough()` call.',
183 │           );
184 │ 
185 ▶           return transformSpies(spyCall, refactorCtx); // .and.callThrough() is redundant, just transform spyOn.
186 ▶         case 'stub': {
187 │           reporter.reportTransformation(
188 │             sourceFile,
189 │             node,
190 │             'Transformed `.and.stub()` to `.mockImplementation()`.',
191 │           );
192 ▶           const newExpression = createPropertyAccess(spyCall, 'mockImplementation');
193 ▶           const arrowFn = ts.factory.createArrowFunction(
194 │             undefined,
195 │             undefined,
196 │             [],
197 │             undefined,
198 │             ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
199 ▶             ts.factory.createBlock([], /* multiline */ true),
200 │           );
201 │ 
202 ▶           return ts.factory.createCallExpression(newExpression, undefined, [arrowFn]);
203 │         }
```

`callThrough` は 185 行目で `.and` の左だけを返します。左が `spyOn(...)` なら `vi.spyOn(...)`（元を呼ぶ）で正しいのですが、左が spy の変数（`spy.and.callThrough()`）だと `spy;` という何もしない文が残ります。記録の「05」は 44129f66a3 でこの形になり、spy は `mockReturnValue(undefined)` のまま、黙って `undefined` を返しました。22.2.7 と main は 01abe08d86（PR #34555）で TODO を付けて元の文を残します（Vitest の実行は `spy.and` が無いので TypeError、型の検査も TS2339）。`stub` は 192〜202 行目で `mockImplementation(() => {})` にし、戻り値が `number` の spy では TS2345 でした（記録の 11）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L204–241 （▶ の行: 210–215, 217, 220, 226, 232, 236, 238, 240）

```ts
204 │         case 'throwError': {
205 │           reporter.reportTransformation(
206 │             sourceFile,
207 │             node,
208 │             'Transformed `.and.throwError()` to `.mockImplementation()`.',
209 │           );
210 ▶           const errorArg = node.arguments[0];
211 ▶           const throwStatement = ts.factory.createThrowStatement(
212 ▶             errorArg && ts.isNewExpression(errorArg)
213 ▶               ? errorArg
214 ▶               : ts.factory.createNewExpression(
215 ▶                   ts.factory.createIdentifier('Error'),
216 │                   undefined,
217 ▶                   errorArg ? [errorArg] : [],
218 │                 ),
219 │           );
220 ▶           const arrowFunction = ts.factory.createArrowFunction(
221 │             undefined,
222 │             undefined,
223 │             [],
224 │             undefined,
225 │             ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
226 ▶             ts.factory.createBlock([throwStatement], true),
227 │           );
228 │           const newExpression = createPropertyAccess(spyCall, 'mockImplementation');
229 │ 
230 │           return ts.factory.createCallExpression(newExpression, undefined, [arrowFunction]);
231 │         }
232 ▶         case 'identity': {
233 │           reporter.reportTransformation(
234 │             sourceFile,
235 │             node,
236 ▶             'Transformed `.and.identity()` to `.getMockName()`.',
237 │           );
238 ▶           const newExpression = createPropertyAccess(spyCall, 'getMockName');
239 │ 
240 ▶           return ts.factory.createCallExpression(newExpression, undefined, undefined);
241 │         }
```

`throwError` は 212〜218 行目で、引数が `new …` の式ならそのまま、ほかは何でも `new Error(引数)` に包みます。Jasmine は文字列のときだけ `new Error` に包み、それ以外（`Error` の変数など）はそのまま投げます。記録の「08」で `const err = new TypeError('typed'); …throwError(err)` は `throw new Error(err)` になり、`toThrowError(TypeError)` が落ち、型の検査も TS2769 でした。3 つの版とも同じです。

`identity` は 232〜241 行目で `.and.identity()` を `.getMockName()` にします。ところが jasmine-core 5.13 の `SpyStrategy#identity` は文字列のプロパティ（JSDoc は `@member`・`@type {String}`）で、関数ではありません。記録の「identity 02」の `fn.and.identity()` は Jasmine のほうで TypeError になり、Jasmine で動く「identity 01」の `fn.and.identity`（呼ばない形）は変換されず、TODO も付かず、Vitest で TypeError でした。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L242–269 （▶ の行: 242–245, 250, 254, 257–260, 263）

```ts
242 ▶         default: {
243 ▶           const category = 'unsupported-spy-strategy';
244 ▶           reporter.recordTodo(category, sourceFile, node);
245 ▶           addTodoComment(node, category, { name: strategyName });
246 │           break;
247 │         }
248 │       }
249 │ 
250 ▶       if (newMethodName) {
251 │         reporter.reportTransformation(
252 │           sourceFile,
253 │           node,
254 ▶           `Transformed spy strategy \`.and.${strategyName}()\` to \`.${newMethodName}()\`.`,
255 │         );
256 │ 
257 ▶         const newExpression = ts.factory.updatePropertyAccessExpression(
258 ▶           pae,
259 ▶           spyCall,
260 ▶           ts.factory.createIdentifier(newMethodName),
261 │         );
262 │ 
263 ▶         return ts.factory.updateCallExpression(node, newExpression, node.typeArguments, args);
264 │       }
265 │     }
266 │   }
267 │ 
268 │   return node;
269 │ }
```

知らない名前は 242〜247 行目で TODO です。`spy.withArgs(1, 1).and.returnValue(100)` は 113 行目の左が `spy.withArgs(1, 1)` なので、44129f66a3 では `spy.withArgs(1, 1).mockReturnValue(100)` と書き換え、Vitest で「spy.withArgs is not a function」でした。22.2.7 と main は 0ae507d273（PR #34620）が `withArgs` を見つけて TODO にします。

## 3. 入口の順：transformSpies

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L271–308 （▶ の行: 276, 282–284, 292, 297–298, 302–303, 307）

```ts
271 │ function transformSpyOnAllFunctions(
272 │   node: ts.CallExpression,
273 │   refactorCtx: RefactorContext,
274 │ ): ts.Node {
275 │   const { sourceFile, reporter } = refactorCtx;
276 ▶   if (getJasmineMethodName(node) === 'spyOnAllFunctions') {
277 │     reporter.reportTransformation(
278 │       sourceFile,
279 │       node,
280 │       'Found unsupported `jasmine.spyOnAllFunctions()`.',
281 │     );
282 ▶     const category = 'spyOnAllFunctions';
283 ▶     reporter.recordTodo(category, sourceFile, node);
284 ▶     addTodoComment(node, category);
285 │ 
286 │     return node;
287 │   }
288 │ 
289 │   return node;
290 │ }
291 │ 
292 ▶ export function transformSpies(node: ts.Node, refactorCtx: RefactorContext): ts.Node {
293 │   if (!ts.isCallExpression(node)) {
294 │     return node;
295 │   }
296 │ 
297 ▶   const primaryResult = transformPrimarySpy(node, refactorCtx);
298 ▶   if (primaryResult !== node) {
299 │     return primaryResult;
300 │   }
301 │ 
302 ▶   const strategyResult = transformSpyStrategy(node, refactorCtx);
303 ▶   if (strategyResult !== node) {
304 │     return strategyResult;
305 │   }
306 │ 
307 ▶   return transformSpyOnAllFunctions(node, refactorCtx);
308 │ }
```

`transformSpies` は 297 行目の `spyOn`、302 行目の `.and.*`、307 行目の `spyOnAllFunctions`（TODO だけ）の順に試し、最初に当たったものを返します。[前の回](07-sca-jv-overview.md)の 4 節のとおり外側の呼び出しが先に来るので、`spyOn(o, 'm').and.returnValue(1)` は、まず外側の `.and.returnValue(1)` が 302 行目で `spyOn(o, 'm').mockReturnValue(1)` になり、そのあと子の `spyOn(o, 'm')` が 297 行目で `vi.spyOn` になります。このときの子の `node.parent` は元の木の `.and` なので、72 行目の `isChainedWithAnd` が真になり、`mockReturnValue(undefined)` は付きません。0fdd724662（2026-05）がこの 3 つの関数に割りました。

## 4. jasmine.createSpy と jasmine.createSpyObj

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L310–339 （▶ の行: 312, 316, 323–324, 327, 330–332, 335）

```ts
310 │ export function transformCreateSpy(node: ts.Node, ctx: RefactorContext): ts.Node {
311 │   const { reporter, sourceFile, pendingVitestValueImports } = ctx;
312 ▶   if (!isJasmineCallExpression(node, 'createSpy')) {
313 │     return node;
314 │   }
315 │ 
316 ▶   addVitestValueImport(pendingVitestValueImports, 'vi');
317 │   reporter.reportTransformation(
318 │     sourceFile,
319 │     node,
320 │     'Transformed `jasmine.createSpy()` to `vi.fn()`.',
321 │   );
322 │ 
323 ▶   const spyName = node.arguments[0];
324 ▶   const viFnCallExpression = createViCallExpression(
325 │     ctx,
326 │     'fn',
327 ▶     node.arguments.length > 1 ? [node.arguments[1]] : [],
328 │   );
329 │ 
330 ▶   // jasmine.createSpy() -> vi.fn()
331 ▶   // jasmine.createSpy(name, originalFn) -> vi.fn(originalFn).mockName(name)
332 ▶   return !spyName
333 │     ? viFnCallExpression
334 │     : ts.factory.createCallExpression(
335 ▶         createPropertyAccess(viFnCallExpression, 'mockName'),
336 │         undefined,
337 │         [node.arguments[0]],
338 │       );
339 │ }
```

`createSpy(name, fn)` は 324〜328 行目で `vi.fn(fn).mockName(name)` です。Jasmine の `createSpy(name, fn)` も既定は何もしない spy で、`fn` は `and.callThrough()` で呼ぶ「元の関数」です。`vi.fn(fn)` は `fn` を実装として呼ぶので、記録の「15」は 44129f66a3 と 22.2.7 で `fn(2)` が `20` になり落ちました。main は d899c51e4f（PR #34687、2026-11）で `.mockReturnValue(undefined)` を付けて通りますが、1 節と同じ TS2345 が `ng test` で出ました。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L341–367 （▶ の行: 343, 354–358, 361–362, 366）

```ts
341 │ export function transformCreateSpyObj(node: ts.Node, ctx: RefactorContext): ts.Node {
342 │   const { reporter, sourceFile, pendingVitestValueImports } = ctx;
343 ▶   if (!isJasmineCallExpression(node, 'createSpyObj')) {
344 │     return node;
345 │   }
346 │ 
347 │   addVitestValueImport(pendingVitestValueImports, 'vi');
348 │   reporter.reportTransformation(
349 │     sourceFile,
350 │     node,
351 │     'Transformed `jasmine.createSpyObj()` to an object literal with `vi.fn()`.',
352 │   );
353 │ 
354 ▶   const firstArg = node.arguments[0];
355 ▶   const hasBaseName = ts.isStringLiteral(firstArg);
356 ▶   const baseName = hasBaseName ? firstArg.text : undefined;
357 ▶   const methods = hasBaseName ? node.arguments[1] : firstArg;
358 ▶   const propertiesArg = hasBaseName ? node.arguments[2] : node.arguments[1];
359 │   let properties: ts.PropertyAssignment[];
360 │ 
361 ▶   if (node.arguments.length < 2 && hasBaseName) {
362 ▶     const category = 'createSpyObj-single-argument';
363 │     reporter.recordTodo(category, sourceFile, node);
364 │     addTodoComment(node, category);
365 │ 
366 ▶     return node;
367 │   }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L369–392 （▶ の行: 369–372, 374, 376, 381, 383, 385, 391）

```ts
369 ▶   if (ts.isArrayLiteralExpression(methods)) {
370 ▶     properties = createSpyObjWithArray(ctx, methods, baseName);
371 ▶   } else if (ts.isObjectLiteralExpression(methods)) {
372 ▶     properties = createSpyObjWithObject(ctx, methods, baseName);
373 │   } else {
374 ▶     const category = 'createSpyObj-dynamic-variable';
375 │     reporter.recordTodo(category, sourceFile, node);
376 ▶     addTodoComment(node, category);
377 │ 
378 │     return node;
379 │   }
380 │ 
381 ▶   if (propertiesArg) {
382 │     if (ts.isObjectLiteralExpression(propertiesArg)) {
383 ▶       properties.push(...(propertiesArg.properties as unknown as ts.PropertyAssignment[]));
384 │     } else {
385 ▶       const category = 'createSpyObj-dynamic-property-map';
386 │       reporter.recordTodo(category, sourceFile, node);
387 │       addTodoComment(node, category);
388 │     }
389 │   }
390 │ 
391 ▶   return ts.factory.createObjectLiteralExpression(properties, true);
392 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L394–423 （▶ の行: 401–402, 406, 410, 414, 420）

```ts
394 │ function createSpyObjWithArray(
395 │   ctx: RefactorContext,
396 │   methods: ts.ArrayLiteralExpression,
397 │   baseName: string | undefined,
398 │ ): ts.PropertyAssignment[] {
399 │   return methods.elements
400 │     .map((element) => {
401 ▶       if (ts.isStringLiteral(element)) {
402 ▶         const mockFn = createViCallExpression(ctx, 'fn');
403 │         const methodName = element.text;
404 │         let finalExpression: ts.Expression = mockFn;
405 │ 
406 ▶         if (baseName) {
407 │           finalExpression = ts.factory.createCallExpression(
408 │             createPropertyAccess(finalExpression, 'mockName'),
409 │             undefined,
410 ▶             [ts.factory.createStringLiteral(`${baseName}.${methodName}`)],
411 │           );
412 │         }
413 │ 
414 ▶         return ts.factory.createPropertyAssignment(
415 │           ts.factory.createIdentifier(methodName),
416 │           finalExpression,
417 │         );
418 │       }
419 │ 
420 ▶       return undefined;
421 │     })
422 │     .filter((p): p is ts.PropertyAssignment => !!p);
423 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L425–456 （▶ の行: 432, 434–435, 437, 441, 445, 449）

```ts
425 │ function createSpyObjWithObject(
426 │   ctx: RefactorContext,
427 │   methods: ts.ObjectLiteralExpression,
428 │   baseName: string | undefined,
429 │ ): ts.PropertyAssignment[] {
430 │   return methods.properties
431 │     .map((prop) => {
432 ▶       if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
433 │         const methodName = prop.name.text;
434 ▶         const returnValue = prop.initializer;
435 ▶         let mockFn = createViCallExpression(ctx, 'fn');
436 │ 
437 ▶         if (baseName) {
438 │           mockFn = ts.factory.createCallExpression(
439 │             createPropertyAccess(mockFn, 'mockName'),
440 │             undefined,
441 ▶             [ts.factory.createStringLiteral(`${baseName}.${methodName}`)],
442 │           );
443 │         }
444 │ 
445 ▶         const mockReturnValue = createPropertyAccess(mockFn, 'mockReturnValue');
446 │ 
447 │         return ts.factory.createPropertyAssignment(
448 │           ts.factory.createIdentifier(methodName),
449 ▶           ts.factory.createCallExpression(mockReturnValue, undefined, [returnValue]),
450 │         );
451 │       }
452 │ 
453 │       return undefined;
454 │     })
455 │     .filter((p): p is ts.PropertyAssignment => !!p);
456 │ }
```

1. **355〜358 行目：1 つ目が文字列かで並びを決める**

   文字列なら基の名前、ちがえばメソッドの並び（5ef8b99750、2025-11、issue #31941）。
2. **361〜367 行目：基の名前だけ**

   `createSpyObj('Svc')` は TODO です。
3. **369〜379 行目：配列かオブジェクトの字面だけ**

   変数（`createSpyObj('Svc', methods)`）は TODO で、元の式が残ります。記録の「20」は Vitest で「jasmine is not defined」でした。
4. **401〜417 行目：配列の要素ごとに `vi.fn()`**

   基の名前があれば 410 行目で `mockName('Svc.get')`（f38fadeccd）。文字列でない要素は 420 行目で黙って捨てます。
5. **445〜449 行目：オブジェクトなら戻り値つき**

   `{ get: 'g' }` は `get: vi.fn().mockName('Svc.get').mockReturnValue('g')`。
6. **381〜383 行目：3 つ目（プロパティ）はそのまま混ぜる**

   `{ ready: true }` は字面の `ready: true` になります（記録の「18」は通る）。

返すのは 391 行目のオブジェクトの字面です。`const obj: jasmine.SpyObj<Calc> = jasmine.createSpyObj('Calc', ['add'])` は、型が 6 節で `MockedObject<Calc>` になり、値が `{ add: vi.fn().mockName("Calc.add") }` になります。`Calc` の `mode` の getter が足りないので、`ng test` は「TS2322: Type '{ add: Mock&lt;Procedure&gt;; }' is not assignable to type 'MockedObject&lt;Calc&gt;'.」でした（記録の「28」。Vitest の実行は通る）。`MockedObject` に変換する PR #34602 が 2026-11-27 の時点で開いています。

## 5. .calls.\*：記録の読み方

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L458–484 （▶ の行: 466, 469–470, 476–477, 479）

```ts
458 │ export function transformSpyReset(
459 │   node: ts.Node,
460 │   { sourceFile, reporter }: RefactorContext,
461 │ ): ts.Node {
462 │   if (
463 │     ts.isCallExpression(node) &&
464 │     ts.isPropertyAccessExpression(node.expression) &&
465 │     ts.isIdentifier(node.expression.name) &&
466 ▶     node.expression.name.text === 'reset' &&
467 │     ts.isPropertyAccessExpression(node.expression.expression)
468 │   ) {
469 ▶     const callsPae = node.expression.expression;
470 ▶     if (ts.isIdentifier(callsPae.name) && callsPae.name.text === 'calls') {
471 │       reporter.reportTransformation(
472 │         sourceFile,
473 │         node,
474 │         'Transformed `spy.calls.reset()` to `.mockClear()`.',
475 │       );
476 ▶       const spyIdentifier = callsPae.expression;
477 ▶       const newExpression = createPropertyAccess(spyIdentifier, 'mockClear');
478 │ 
479 ▶       return ts.factory.updateCallExpression(node, newExpression, node.typeArguments, []);
480 │     }
481 │   }
482 │ 
483 │   return node;
484 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L486–506 （▶ の行: 486–488, 498–500, 505）

```ts
486 ▶ function getSpyIdentifierFromCalls(node: ts.PropertyAccessExpression): ts.Expression | undefined {
487 ▶   if (ts.isIdentifier(node.name) && node.name.text === 'calls') {
488 ▶     return node.expression;
489 │   }
490 │ 
491 │   return undefined;
492 │ }
493 │ 
494 │ function createMockedSpyMockProperty(
495 │   spyIdentifier: ts.Expression,
496 │   pendingVitestValueImports: Set<string>,
497 │ ): ts.PropertyAccessExpression {
498 ▶   addVitestValueImport(pendingVitestValueImports, 'vi');
499 ▶   const mockedSpy = ts.factory.createCallExpression(
500 ▶     createPropertyAccess('vi', 'mocked'),
501 │     undefined,
502 │     [spyIdentifier],
503 │   );
504 │ 
505 ▶   return createPropertyAccess(mockedSpy, 'mock');
506 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L643–677 （▶ の行: 644, 649, 654, 659, 665–667, 670–672）

```ts
643 │ export function transformSpyCallInspection(node: ts.Node, refactorCtx: RefactorContext): ts.Node {
644 ▶   const mostRecentArgsTransformed = transformMostRecentArgs(node, refactorCtx);
645 │   if (mostRecentArgsTransformed !== node) {
646 │     return mostRecentArgsTransformed;
647 │   }
648 │ 
649 ▶   const thisForTransformed = transformThisFor(node, refactorCtx);
650 │   if (thisForTransformed !== node) {
651 │     return thisForTransformed;
652 │   }
653 │ 
654 ▶   const allCallsArgsTransformed = transformAllCallsArgs(node, refactorCtx);
655 │   if (allCallsArgsTransformed !== node) {
656 │     return allCallsArgsTransformed;
657 │   }
658 │ 
659 ▶   if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
660 │     return node;
661 │   }
662 │ 
663 │   const { sourceFile, reporter, pendingVitestValueImports } = refactorCtx;
664 │ 
665 ▶   const pae = node.expression; // e.g., mySpy.calls.count
666 ▶   const spyIdentifier = ts.isPropertyAccessExpression(pae.expression)
667 ▶     ? getSpyIdentifierFromCalls(pae.expression)
668 │     : undefined;
669 │ 
670 ▶   if (spyIdentifier) {
671 ▶     const mockProperty = createMockedSpyMockProperty(spyIdentifier, pendingVitestValueImports);
672 ▶     const callsProperty = createPropertyAccess(mockProperty, 'calls');
673 │ 
674 │     const callName = pae.name.text;
675 │     let newExpression: ts.Node | undefined;
676 │     let message: string | undefined;
677 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L678–710 （▶ の行: 679, 681, 687, 689, 691, 693, 695–696, 698, 700, 702, 704, 707–708）

```ts
678 │     switch (callName) {
679 ▶       case 'any':
680 │         message = 'Transformed `spy.calls.any()` to a check on `mock.calls.length`.';
681 ▶         newExpression = ts.factory.createBinaryExpression(
682 │           createPropertyAccess(callsProperty, 'length'),
683 │           ts.SyntaxKind.GreaterThanToken,
684 │           ts.factory.createNumericLiteral(0),
685 │         );
686 │         break;
687 ▶       case 'count':
688 │         message = 'Transformed `spy.calls.count()` to `mock.calls.length`.';
689 ▶         newExpression = createPropertyAccess(callsProperty, 'length');
690 │         break;
691 ▶       case 'first':
692 │         message = 'Transformed `spy.calls.first()` to `mock.calls[0]`.';
693 ▶         newExpression = ts.factory.createElementAccessExpression(callsProperty, 0);
694 │         break;
695 ▶       case 'all':
696 ▶       case 'allArgs':
697 │         message = `Transformed \`spy.calls.${callName}()\` to \`mock.calls\`.`;
698 ▶         newExpression = callsProperty;
699 │         break;
700 ▶       case 'argsFor':
701 │         message = 'Transformed `spy.calls.argsFor()` to `mock.calls[i]`.';
702 ▶         newExpression = ts.factory.createElementAccessExpression(callsProperty, node.arguments[0]);
703 │         break;
704 ▶       case 'saveArgumentsByValue':
705 │         {
706 │           const category = 'saveArgumentsByValue';
707 ▶           reporter.recordTodo(category, sourceFile, node);
708 ▶           addTodoComment(node, category);
709 │         }
710 │         break;
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L711–733 （▶ の行: 711–713, 715, 717, 719, 722, 725, 728）

```ts
711 ▶       case 'mostRecent':
712 ▶         if (
713 ▶           !ts.isPropertyAccessExpression(node.parent) ||
714 │           !ts.isIdentifier(node.parent.name) ||
715 ▶           node.parent.name.text !== 'args'
716 │         ) {
717 ▶           const category = 'mostRecent-without-args';
718 │           reporter.recordTodo(category, sourceFile, node);
719 ▶           addTodoComment(node, category);
720 │         }
721 │ 
722 ▶         return node;
723 │     }
724 │ 
725 ▶     if (newExpression && message) {
726 │       reporter.reportTransformation(sourceFile, node, message);
727 │ 
728 ▶       return newExpression;
729 │     }
730 │   }
731 │ 
732 │   return node;
733 │ }
```

`spy.calls.X()` は 666〜672 行目で `vi.mocked(spy).mock.calls` を作り、名前ごとに置き換えます。`vi.mocked` は型だけを付け替える関数で、実行時は引数をそのまま返します（Vitest 5.1.2 の実装は `return item;` だけ）。`reset` は別の関数で、476〜479 行目で `spy.mockClear()` です（記録の「26」は通る）。

| Jasmine | 変換（行） | 記録 |
| --- | --- | --- |
| `count()`・`argsFor(i)`・`allArgs()`・`any()` | `mock.calls.length`・`mock.calls[i]`・`mock.calls`・`mock.calls.length > 0`（679〜703） | 「21」は 3 つの版とも通る |
| `first()` | `mock.calls[0]`（691〜694）。中身は引数の配列 | 「23」の `first().args` は 44129f66a3 で `mock.calls[0].args`（`undefined`）になり落ちる。22.2.7・main は d3acc84bed（PR #34517）で通る |
| `all()` | `mock.calls`（695〜699）。Jasmine の `all()` は `{ object, args, returnValue }` の配列で、形が違う | 「24」の `all()[0].args` は 7 節の別の関数が先に `mock.calls[0]` にするので通る |
| `mostRecent()` | 後ろが `.args` でなければ TODO（711〜722）。`.args` なら別の関数で `mock.lastCall` | 「22」の `mostRecent().args` は通る。「25」の `mostRecent().returnValue` は 44129f66a3 で TODO と TypeError、22.2.7・main は 54f261817c（PR #34538）で通る |
| `saveArgumentsByValue()` | TODO（704〜709） | — |

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L508–530 （▶ の行: 513–516, 522, 524–525）

```ts
508 │ function transformMostRecentArgs(
509 │   node: ts.Node,
510 │   { sourceFile, reporter, pendingVitestValueImports }: RefactorContext,
511 │ ): ts.Node {
512 │   // Check 1: Is it a property access for `.args`?
513 ▶   if (
514 ▶     !ts.isPropertyAccessExpression(node) ||
515 ▶     !ts.isIdentifier(node.name) ||
516 ▶     node.name.text !== 'args'
517 │   ) {
518 │     return node;
519 │   }
520 │ 
521 │   // Check 2: Is the preceding expression a call expression?
522 ▶   const mostRecentCall = node.expression;
523 │   if (
524 ▶     !ts.isCallExpression(mostRecentCall) ||
525 ▶     !ts.isPropertyAccessExpression(mostRecentCall.expression)
526 │   ) {
527 │     return node;
528 │   }
529 │ 
530 │   // Check 3: Is it a call to `.mostRecent`?
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L531–555 （▶ の行: 531, 534–535, 541, 552, 554）

```ts
531 ▶   const mostRecentPae = mostRecentCall.expression;
532 │   if (
533 │     !ts.isIdentifier(mostRecentPae.name) ||
534 ▶     mostRecentPae.name.text !== 'mostRecent' ||
535 ▶     !ts.isPropertyAccessExpression(mostRecentPae.expression)
536 │   ) {
537 │     return node;
538 │   }
539 │ 
540 │   // Check 4: Can we get the spy identifier from `spy.calls`?
541 ▶   const spyIdentifier = getSpyIdentifierFromCalls(mostRecentPae.expression);
542 │   if (!spyIdentifier) {
543 │     return node;
544 │   }
545 │ 
546 │   // If all checks pass, perform the transformation.
547 │   reporter.reportTransformation(
548 │     sourceFile,
549 │     node,
550 │     'Transformed `spy.calls.mostRecent().args` to `vi.mocked(spy).mock.lastCall`.',
551 │   );
552 ▶   const mockProperty = createMockedSpyMockProperty(spyIdentifier, pendingVitestValueImports);
553 │ 
554 ▶   return createPropertyAccess(mockProperty, 'lastCall');
555 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L557–594 （▶ の行: 569–570, 577, 588, 590–592）

```ts
557 │ function transformThisFor(
558 │   node: ts.Node,
559 │   { sourceFile, reporter, pendingVitestValueImports }: RefactorContext,
560 │ ): ts.Node {
561 │   // Check 1: Is the node is a call expression?
562 │   if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
563 │     return node;
564 │   }
565 │ 
566 │   // Check 2: Is it a call to `.thisFor`?
567 │   const thisForPae = node.expression;
568 │   if (
569 ▶     !ts.isIdentifier(thisForPae.name) ||
570 ▶     thisForPae.name.text !== 'thisFor' ||
571 │     !ts.isPropertyAccessExpression(thisForPae.expression)
572 │   ) {
573 │     return node;
574 │   }
575 │ 
576 │   // Check 3: Can we get the spy identifier from `spy.calls`?
577 ▶   const spyIdentifier = getSpyIdentifierFromCalls(thisForPae.expression);
578 │   if (!spyIdentifier) {
579 │     return node;
580 │   }
581 │ 
582 │   // If all checks pass, perform the transformation.
583 │   reporter.reportTransformation(
584 │     sourceFile,
585 │     node,
586 │     'Transformed `spy.calls.thisFor(index)` to `vi.mocked(spy).mock.contexts[index]`.',
587 │   );
588 ▶   const mockProperty = createMockedSpyMockProperty(spyIdentifier, pendingVitestValueImports);
589 │ 
590 ▶   return ts.factory.createElementAccessExpression(
591 ▶     createPropertyAccess(mockProperty, 'contexts'),
592 ▶     node.arguments[0] ?? ts.factory.createNumericLiteral(0),
593 │   );
594 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L596–612 （▶ の行: 601–603, 608–609）

```ts
596 │ function transformAllCallsArgs(
597 │   node: ts.Node,
598 │   { sourceFile, reporter, pendingVitestValueImports }: RefactorContext,
599 │ ): ts.Node {
600 │   if (
601 ▶     !ts.isPropertyAccessExpression(node) ||
602 ▶     !ts.isIdentifier(node.name) ||
603 ▶     node.name.text !== 'args'
604 │   ) {
605 │     return node;
606 │   }
607 │ 
608 ▶   const elementAccess = node.expression;
609 ▶   if (!ts.isElementAccessExpression(elementAccess)) {
610 │     return node;
611 │   }
612 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy.ts` L613–641 （▶ の行: 613, 619, 627, 637–638, 640）

```ts
613 ▶   const allCall = elementAccess.expression;
614 │   if (!ts.isCallExpression(allCall) || !ts.isPropertyAccessExpression(allCall.expression)) {
615 │     return node;
616 │   }
617 │ 
618 │   const allPae = allCall.expression;
619 ▶   if (!ts.isIdentifier(allPae.name) || allPae.name.text !== 'all') {
620 │     return node;
621 │   }
622 │ 
623 │   if (!ts.isPropertyAccessExpression(allPae.expression)) {
624 │     return node;
625 │   }
626 │ 
627 ▶   const spyIdentifier = getSpyIdentifierFromCalls(allPae.expression);
628 │   if (!spyIdentifier) {
629 │     return node;
630 │   }
631 │ 
632 │   reporter.reportTransformation(
633 │     sourceFile,
634 │     node,
635 │     'Transformed `spy.calls.all()[i].args` to `vi.mocked(spy).mock.calls[i]`.',
636 │   );
637 ▶   const mockProperty = createMockedSpyMockProperty(spyIdentifier, pendingVitestValueImports);
638 ▶   const callsProperty = createPropertyAccess(mockProperty, 'calls');
639 │ 
640 ▶   return ts.factory.createElementAccessExpression(callsProperty, elementAccess.argumentExpression);
641 │ }
```

この 3 つは参照の式（`….args`）か呼び出しの式（`thisFor(i)`）を、外側から見つけて丸ごと置き換えます。`transformSpyCallInspection` が[前の回](07-sca-jv-overview.md)の 4 節の 2 つの並び（呼び出しと参照）の両方に入っているのは、このためです。644〜657 行目で先に試すので、`spy.calls.mostRecent().args` は外側の `.args` の段階で `vi.mocked(spy).mock.lastCall` になり、内側の `mostRecent()` は 711 行目の TODO まで届きません。

## 6. 型：jasmine.Spy と jasmine.SpyObj

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-type.ts` L9–46 （▶ の行: 24–28, 33, 36–37, 43, 45）

```ts
 9 │ /**
10 │  * @fileoverview This file contains a transformer that migrates Jasmine type definitions to
11 │  * their Vitest equivalents. It handles the conversion of types like `jasmine.Spy` and
12 │  * `jasmine.SpyObj` to Vitest's `Mock` and `MockedObject` types, and ensures that the
13 │  * necessary `vitest` imports are added to the file.
14 │  */
15 │ 
16 │ import ts from 'typescript';
17 │ import { addVitestTypeImport } from '../utils/ast-helpers';
18 │ import { RefactorContext } from '../utils/refactor-context';
19 │ 
20 │ export function transformJasmineTypes(
21 │   node: ts.Node,
22 │   { sourceFile, reporter, pendingVitestTypeImports }: RefactorContext,
23 │ ): ts.Node {
24 ▶   const typeNameNode = ts.isTypeReferenceNode(node) ? node.typeName : node;
25 ▶   if (
26 ▶     !ts.isQualifiedName(typeNameNode) ||
27 ▶     !ts.isIdentifier(typeNameNode.left) ||
28 ▶     typeNameNode.left.text !== 'jasmine'
29 │   ) {
30 │     return node;
31 │   }
32 │ 
33 ▶   const jasmineTypeName = typeNameNode.right.text;
34 │ 
35 │   switch (jasmineTypeName) {
36 ▶     case 'Spy': {
37 ▶       const vitestTypeName = 'Mock';
38 │       reporter.reportTransformation(
39 │         sourceFile,
40 │         node,
41 │         `Transformed type \`jasmine.Spy\` to \`${vitestTypeName}\`.`,
42 │       );
43 ▶       addVitestTypeImport(pendingVitestTypeImports, vitestTypeName);
44 │ 
45 ▶       return ts.factory.createIdentifier(vitestTypeName);
46 │     }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-type.ts` L47–73 （▶ の行: 47–48, 54, 56–60, 64, 66, 73）

```ts
47 ▶     case 'SpyObj': {
48 ▶       const vitestTypeName = 'MockedObject';
49 │       reporter.reportTransformation(
50 │         sourceFile,
51 │         node,
52 │         `Transformed type \`jasmine.SpyObj\` to \`${vitestTypeName}\`.`,
53 │       );
54 ▶       addVitestTypeImport(pendingVitestTypeImports, vitestTypeName);
55 │ 
56 ▶       if (ts.isTypeReferenceNode(node)) {
57 ▶         return ts.factory.updateTypeReferenceNode(
58 ▶           node,
59 ▶           ts.factory.createIdentifier(vitestTypeName),
60 ▶           node.typeArguments,
61 │         );
62 │       }
63 │ 
64 ▶       return ts.factory.createIdentifier(vitestTypeName);
65 │     }
66 ▶     case 'Any':
67 │       reporter.reportTransformation(
68 │         sourceFile,
69 │         node,
70 │         `Transformed type \`jasmine.Any\` to \`any\`.`,
71 │       );
72 │ 
73 ▶       return ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-type.ts` L74–109 （▶ の行: 74–76, 83, 92, 94, 101, 104）

```ts
 74 ▶     case 'ObjectContaining': {
 75 ▶       const typeArguments = ts.isTypeReferenceNode(node) ? node.typeArguments : undefined;
 76 ▶       if (typeArguments && typeArguments.length > 0) {
 77 │         reporter.reportTransformation(
 78 │           sourceFile,
 79 │           node,
 80 │           `Transformed type \`jasmine.ObjectContaining\` to \`Partial\`.`,
 81 │         );
 82 │ 
 83 ▶         return ts.factory.createTypeReferenceNode('Partial', typeArguments);
 84 │       }
 85 │ 
 86 │       reporter.reportTransformation(
 87 │         sourceFile,
 88 │         node,
 89 │         `Transformed type \`jasmine.ObjectContaining\` to \`object\`.`,
 90 │       );
 91 │ 
 92 ▶       return ts.factory.createKeywordTypeNode(ts.SyntaxKind.ObjectKeyword);
 93 │     }
 94 ▶     case 'DoneFn':
 95 │       reporter.reportTransformation(
 96 │         sourceFile,
 97 │         node,
 98 │         'Transformed type `jasmine.DoneFn` to `() => void`.',
 99 │       );
100 │ 
101 ▶       return ts.factory.createFunctionTypeNode(
102 │         undefined,
103 │         [],
104 ▶         ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
105 │       );
106 │   }
107 │ 
108 │   return node;
109 │ }
```

1. **24〜31 行目：`jasmine.名前` の型だけ**

   型の参照（`jasmine.SpyObj<T>`）でも修飾名（`jasmine.Spy`）でも、左が `jasmine` かを見ます。
2. **36〜46 行目：`Spy` → `Mock`**

   45 行目は型の参照のときも名前だけの `Mock` を返すので、`jasmine.Spy<(x: number) => string>` の型引数は消えます（手元で確かめると `const s: Mock = …`）。43 行目で `Mock` を型の import に足します。
3. **47〜65 行目：`SpyObj<T>` → `MockedObject<T>`**

   こちらは 57〜61 行目で型引数を残します。
4. **66〜106 行目：ほかの 3 つ**

   `Any` → `any`、`ObjectContaining<T>` → `Partial<T>`（型引数が無ければ `object`）、`DoneFn` → `() => void`。

型の書き換えは 54c4eae2aa（2025-10）が入れました。型の import は[前の回](07-sca-jv-overview.md)の 5 節のとおり `--add-imports` に関係なく足すので、記録の変換後のファイルの 1 行目はどの版も `import type { Mock, MockedObject } from "vitest";` でした。

> **🧪 DEMO — spy の spec を Jasmine で走らせ、変換して Vitest で走らせた記録**
>
> it を選ぶと、元の Jasmine の書き方と、選んだ版の変換器の出力、各版の Vitest の結果を見られます。下線の付いたボタンは、Jasmine と結果が違った it です。「ng test の型のエラー」は 22.3.0（main と同じ中身）で変換して `ng test` したときに、その it の中で出たものです。
>
> ng test の型のエラー（行は変換後のファイル）：
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sca-jv-spy)

## 7. テストと直し方

| spec | describe（行） | 固めている約束 |
| --- | --- | --- |
| `transformers/jasmine-spy_spec.ts` | `transformSpies`（11） | 1〜3 節。13〜18 行目が `mockReturnValue(undefined)`、37〜40 行目が `returnValues` の鎖、57〜60 行目が `createSpy(name, fn)`、61〜65 行目が `spyOnProperty`（44129f66a3 の形）、112〜115 行目が `.and.identity()` |
| 同じ | `transformCreateSpyObj`（161）・`transformSpyReset`（262）・`transformSpyCallInspection`（278） | 4・5 節 |
| `transformers/jasmine-type_spec.ts` | `transformJasmineTypes`（11） | 6 節。`jasmine.Spy` の型引数の例は無い |

📄 `走らせたコマンド（2026-11-27）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/schematics/angular:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=^(Jasmine to Vitest Transformer - (transformSpies|transformJasmineTypes)|transformCreateSpyObj|transformSpyReset|transformSpyCallInspection)"
（結果は下の段落）
```

手元の bazel でこの 5 つの describe は 57 specs・0 failures でした。spec は文字列の出力を比べるだけで、変換後を走らせたり型を検査したりはしないので、DEMO の「Vitest で落ちる」「型で止まる」は spec では見えません。

直すとしたら、`returnValues` は jasmine-spy.ts の 163 行目の鎖の出発点を、`spyOn` のときだけ `vi.spyOn(…).mockReturnValue(undefined)` にします（`…Once` が尽きたあとの既定が `undefined` になる）。`throwError` は 212〜218 行目で、文字列の字面とテンプレートの字面だけを `new Error` に包み、ほかは `throw 引数` のままにします。型のエラーは、89〜93 行目と 22.2.x の createSpy の修正の `mockReturnValue(undefined)` を、型に通る書き方（たとえば `mockImplementation(() => undefined as never)` のような形）にする必要があります。`identity` は 232 行目の呼び出しの形ではなく、参照の `spy.and.identity` を `spy.getMockName()` にします。どれも jasmine-spy\_spec.ts の `transformSpies` の表に 1 行ずつ足し、37〜40 行目・112〜115 行目の期待は直す側に変わります。

## 聞かれそうな質問

**Q. なぜ `spyOn` の後ろに `.mockReturnValue(undefined)` が付くの？**

Jasmine の spy は既定で元を呼ばず、`vi.spyOn` は既定で元を呼ぶからです。jasmine-spy.ts の 89〜93 行目が付け、72 行目の `isChainedWithAnd` で `.and.*` が続くときは付けません。戻り値の型が `undefined` を含まない関数では、この行が `ng test` の型の検査で TS2345 になります。

**Q. `and.returnValues(1, 2)` は同じ意味になる？**

値が残っている間は同じです。尽きたあと、Jasmine は `undefined`、変換後（`vi.spyOn(…).mockReturnValueOnce(1).mockReturnValueOnce(2)`）は元の関数を呼びます。記録の「06」で 3 回目が `10` でした。164〜171 行目に既定の付け足しがありません。

**Q. `spy.calls.mostRecent().args` と `spy.calls.mostRecent()` で扱いが違うのは？**

前者は 513〜554 行目が参照の `.args` から見つけて `vi.mocked(spy).mock.lastCall` にします。後者は 711〜722 行目で、後ろが `.args` でなければ TODO です。Vitest の `lastCall` は引数の配列だけで、Jasmine の `{ object, args, returnValue }` とは形が違うからです。

**Q. `jasmine.createSpyObj` の結果の型は？**

391 行目のとおりただのオブジェクトの字面です。変数に `jasmine.SpyObj<T>` と書いてあれば型は `MockedObject<T>` になりますが、字面は列べたメソッドしか持たないので、`T` のほかのメンバーが足りず TS2322 になります（記録の「28」）。

**Q. どの版で何が直った？**

44129f66a3 のあと、`spyOnProperty` の `'get'`（#34543）、既存の spy の `callThrough` の TODO（#34555）、`first().args`（#34517）、`returnValue`・`object`（#34538）、`withArgs` の TODO（#34620）が 22.2.7 までに入り、`createSpy(name, fn)`（#34687）が main と 22.3.0 に入りました。`returnValues`・`throwError`・`identity`・型のエラーは main でも同じです。

## 読み終えて

- spy の変換は「既定は何もしない」を `mockReturnValue(undefined)` で残すが、その 1 行が戻り値の型と合わず、`ng test` の型の検査で止まる。
- `.and.*` は名前ごとの置き換えで、`returnValues`（尽きたあと）と `throwError`（Error の変数）は意味が変わる。
- `.calls.*` は `vi.mocked(spy).mock` の配列に置き換え、Jasmine の CallInfo の形が要る所は外側の参照の段階で拾う。
- spec は出力の文字列だけを比べる。変換後を Vitest と型の検査に通すと、spec が期待どおりと認めている出力でも落ちるものがある。

---

← 前: [Jasmine から Vitest へ（1）：refactor の骨組み](07-sca-jv-overview.md)  
次: [Jasmine から Vitest へ（3）：matcher とその他](09-sca-jv-matcher.md) →
