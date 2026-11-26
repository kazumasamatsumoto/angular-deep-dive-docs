[目次](../README.md) › [@schematics/angular の道具と移行](README.md) › 第 10 回 / 全 11 回

# Jasmine から Vitest へ（4）：lifecycle と fakeAsync

> refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts・fake-async-\*.ts：fdescribe・xit・done コールバック・beforeAll の書き換え、fakeAsync・tick・flush を Vitest の偽のタイマーに直す規則。

angular/angular-cli · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sca-jv-lifecycle)

---

この章で分かること：`refactor-jasmine-vitest` が、test の枠（`fdescribe`・`fit`・`xdescribe`・`xit`・`pending()`）、`done` コールバック（`done.fail` を含む）、Angular の `fakeAsync`・`tick`・`flush`・`flushMicrotasks` を、Vitest の `.only`・`.skip`・`async` の関数・偽のタイマー（`vi.useFakeTimers`）にどう書き換えるかです。Jasmine（fakeAsync は zone.js つき）で通る 26 個の it を変換して Vitest で走らせ、**待たなくなる it**・**走らなくなる it**・構文ごと壊れるファイルを確かめます。

読む対象は `packages/schematics/angular/refactor/jasmine-vitest/transformers/` の `jasmine-lifecycle.ts`・`fake-async-test.ts`・`fake-async-tick.ts`・`fake-async-flush.ts`・`fake-async-flush-microtasks.ts` と、`utils/ast-helpers.ts` の import の後始末です（../angular-cli、44129f66a3）。Angular の `fakeAsync` の中身（zone.js の `FakeAsyncTestZoneSpec`）は[fakeAsync の章](../testing/13-testing-fake-async.md)、Vitest に移った unit-test builder が偽のタイマーの設定をどう渡すかは[Vitest の executor の章](../vit/04-vit-executor.md)です。

1. [1. 変更の単位とファイルの道具](01-sca-change.md)
2. [2. AST の道具](02-sca-ast-utils.md)
3. [3. 依存を足す](03-sca-dependency.md)
4. [4. standalone のアプリを書き換える](04-sca-standalone.md)
5. [5. builder の移行](05-sca-build-migrations.md)
6. [6. Karma から Vitest へ](06-sca-karma-vitest.md)
7. [7. Jasmine から Vitest へ（1）骨組み](07-sca-jv-overview.md)
8. [8. Jasmine から Vitest へ（2）spy と型](08-sca-jv-spy.md)
9. [9. Jasmine から Vitest へ（3）matcher](09-sca-jv-matcher.md)
10. **10. Jasmine から Vitest へ（4）lifecycle と fakeAsync**（この章）
11. [11. spec と issue](11-sca-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 記録の取り方は[第 8 回](08-sca-jv-spy.md)と同じで、fakeAsync の spec だけは Jasmine の側で zone.js 0.16.3 の `zone.js/testing` と `@angular/core` 22.2.7 の `@angular/core/testing` を読み込みました。変換は `fakeAsync: true` です（`ng g` の既定は `false` で、そのままでは fakeAsync の spec は 1 行も変わりません。[第 7 回](07-sca-jv-overview.md)の 1 節）。fake-async の 4 つのファイルは 3 つの版で同じで、`jasmine-lifecycle.ts` は main と 22.3.0 にだけ 2 つの修正が入っています（commit の hash は main のもの）。

## 1. fdescribe・fit・xdescribe・xit

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L21–51 （▶ の行: 21–25, 32, 36–38, 45, 47）

```ts
21 ▶ const FOCUSED_SKIPPED_RENAMES = new Map<string, { newBase: string; newName: string }>([
22 ▶   ['fdescribe', { newBase: 'describe', newName: 'only' }],
23 ▶   ['fit', { newBase: 'it', newName: 'only' }],
24 ▶   ['xdescribe', { newBase: 'describe', newName: 'skip' }],
25 ▶   ['xit', { newBase: 'it', newName: 'skip' }],
26 │ ]);
27 │ 
28 │ export function transformFocusedAndSkippedTests(
29 │   node: ts.Node,
30 │   { sourceFile, reporter }: RefactorContext,
31 │ ): ts.Node {
32 ▶   if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
33 │     return node;
34 │   }
35 │ 
36 ▶   const oldName = node.expression.text;
37 ▶   const rename = FOCUSED_SKIPPED_RENAMES.get(oldName);
38 ▶   if (rename) {
39 │     reporter.reportTransformation(
40 │       sourceFile,
41 │       node,
42 │       `Transformed \`${oldName}\` to \`${rename.newBase}.${rename.newName}\`.`,
43 │     );
44 │ 
45 ▶     const newPropAccess = createPropertyAccess(rename.newBase, rename.newName);
46 │ 
47 ▶     return ts.factory.updateCallExpression(node, newPropAccess, node.typeArguments, node.arguments);
48 │   }
49 │ 
50 │   return node;
51 │ }
```

呼び出しの名前が 21〜26 行目の 4 つのどれかなら、`describe.only`・`it.only`・`describe.skip`・`it.skip` にします。引数はそのままです。

記録の `focus.spec.ts`（`fit` と `fdescribe` を含む）は、Jasmine で「Ran 2 of 4 specs」「Incomplete: fit() or fdescribe() was found」、終了コード 2 でした。変換後を Vitest でふつうに走らせると、`.only` の 2 つが通り、残りの 2 つは飛ばされました。`ng test`（記録は環境変数 `CI=1`）では、2 つの `.only` が「\[Vitest\] Unexpected .only modifier. Remove it or pass --allowOnly argument to bypass this error」で落ちました。Vitest は CI では既定で `.only` を失敗にします。どちらの道具も「focus を残したまま」は通さない、という点は同じです。

## 2. pending()：中に 1 つでもあれば it.skip

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L53–70 （▶ の行: 57–60, 65–66）

```ts
53 │ export function transformPending(
54 │   node: ts.Node,
55 │   { sourceFile, reporter, tsContext }: RefactorContext,
56 │ ): ts.Node {
57 ▶   if (
58 ▶     !ts.isCallExpression(node) ||
59 ▶     !ts.isIdentifier(node.expression) ||
60 ▶     node.expression.text !== 'it'
61 │   ) {
62 │     return node;
63 │   }
64 │ 
65 ▶   const testFn = node.arguments[1];
66 ▶   if (!testFn || (!ts.isArrowFunction(testFn) && !ts.isFunctionExpression(testFn))) {
67 │     return node;
68 │   }
69 │ 
70 │   let hasPending = false;
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L71–101 （▶ の行: 72–76, 78–79, 87–89, 94, 97, 99）

```ts
 71 │   const bodyTransformVisitor = (bodyNode: ts.Node): ts.Node | undefined => {
 72 ▶     if (
 73 ▶       ts.isExpressionStatement(bodyNode) &&
 74 ▶       ts.isCallExpression(bodyNode.expression) &&
 75 ▶       ts.isIdentifier(bodyNode.expression.expression) &&
 76 ▶       bodyNode.expression.expression.text === 'pending'
 77 │     ) {
 78 ▶       hasPending = true;
 79 ▶       const replacement = ts.factory.createEmptyStatement();
 80 │ 
 81 │       reporter.reportTransformation(
 82 │         sourceFile,
 83 │         bodyNode,
 84 │         'Converted `pending()` to a skipped test (`it.skip`).',
 85 │       );
 86 │       const category = 'pending';
 87 ▶       reporter.recordTodo(category, sourceFile, bodyNode);
 88 ▶       addTodoComment(replacement, category);
 89 ▶       addCommentedNodeText(replacement, bodyNode);
 90 │ 
 91 │       return replacement;
 92 │     }
 93 │ 
 94 ▶     return ts.visitEachChild(bodyNode, bodyTransformVisitor, tsContext);
 95 │   };
 96 │ 
 97 ▶   const newBody = ts.visitNode(testFn.body, bodyTransformVisitor) as ts.ConciseBody | undefined;
 98 │ 
 99 ▶   if (!hasPending) {
100 │     return node;
101 │   }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L102–128 （▶ の行: 103, 125, 127）

```ts
102 │ 
103 ▶   const newExpression = createPropertyAccess(node.expression, 'skip');
104 │   const newTestFn = ts.isArrowFunction(testFn)
105 │     ? ts.factory.updateArrowFunction(
106 │         testFn,
107 │         testFn.modifiers,
108 │         testFn.typeParameters,
109 │         testFn.parameters,
110 │         testFn.type,
111 │         testFn.equalsGreaterThanToken,
112 │         newBody ?? ts.factory.createBlock([]),
113 │       )
114 │     : ts.factory.updateFunctionExpression(
115 │         testFn,
116 │         testFn.modifiers,
117 │         testFn.asteriskToken,
118 │         testFn.name,
119 │         testFn.typeParameters,
120 │         testFn.parameters,
121 │         testFn.type,
122 │         (newBody as ts.Block) ?? ts.factory.createBlock([]),
123 │       );
124 │ 
125 ▶   const newArgs = [node.arguments[0], newTestFn, ...node.arguments.slice(2)];
126 │ 
127 ▶   return ts.factory.updateCallExpression(node, newExpression, node.typeArguments, newArgs);
128 │ }
```

`it(…)` の関数の本体を 94 行目で**入れ子の奥まで**たどり、`pending(…)` の文を空の文と TODO に替え、1 つでもあれば 103 行目で `it.skip` にします。Jasmine の `pending()` は「その行に来たら保留にする」ので、条件の中にあれば条件しだいです。記録の「03」の `if (!supported) { pending('unsupported'); }` は、Jasmine では条件が偽なので最後まで走って通り、変換後は `it.skip` で一度も走りませんでした。TODO の文（[第 7 回](07-sca-jv-overview.md)の 7 節の `TODO_NOTES` の `pending`）は「converted to a skipped test」で、条件の中だったことは言いません。

もう 1 つ、60 行目は呼び出しの名前が `it` の識別子のときだけです。[第 7 回](07-sca-jv-overview.md)の 4 節のとおり 1 節の変換器が先に走るので、`xit('…', () => { pending(); })` は先に `it.skip` になり、ここでは `pending()` が残ります（記録の「focus 03」は 44129f66a3 と 22.2.7 で `pending('later')` が残った）。main は e1bed394e8（PR #34689）でこの形も扱い、TODO になりました。

## 3. done コールバックを async に

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L292–324 （▶ の行: 294–297, 302–303, 310, 314–315, 318, 321–323）

```ts
292 │ export function transformDoneCallback(node: ts.Node, refactorCtx: RefactorContext): ts.Node {
293 │   const { sourceFile, reporter, tsContext } = refactorCtx;
294 ▶   if (
295 ▶     !ts.isCallExpression(node) ||
296 ▶     !ts.isIdentifier(node.expression) ||
297 ▶     !['it', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'].includes(node.expression.text)
298 │   ) {
299 │     return node;
300 │   }
301 │ 
302 ▶   const functionArg = node.arguments.find(
303 ▶     (arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg),
304 │   );
305 │ 
306 │   if (!functionArg || (!ts.isArrowFunction(functionArg) && !ts.isFunctionExpression(functionArg))) {
307 │     return node;
308 │   }
309 │ 
310 ▶   if (functionArg.parameters.length !== 1) {
311 │     return node;
312 │   }
313 │ 
314 ▶   const doneParam = functionArg.parameters[0];
315 ▶   if (!ts.isIdentifier(doneParam.name)) {
316 │     return node;
317 │   }
318 ▶   const doneIdentifier = doneParam.name;
319 │ 
320 │   // Count total usages of 'done' in the body
321 ▶   const totalUsages = countDoneUsages(functionArg.body, doneIdentifier);
322 ▶   let handledUsages = 0;
323 ▶   let doneWasUsed = false;
324 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L279–290 （▶ の行: 279, 281–283, 285, 287）

```ts
279 ▶ function countDoneUsages(node: ts.Node, doneIdentifier: ts.Identifier): number {
280 │   let count = 0;
281 ▶   const visitor = (n: ts.Node) => {
282 ▶     if (ts.isIdentifier(n) && n.text === doneIdentifier.text) {
283 ▶       count++;
284 │     }
285 ▶     ts.forEachChild(n, visitor);
286 │   };
287 ▶   ts.forEachChild(node, visitor);
288 │ 
289 │   return count;
290 │ }
```

1. **297 行目：`it` と 4 つの hook**

   `describe` は対象外です。60 行目と同じく識別子だけなので、44129f66a3 と 22.2.7 では `fit('…', (done) => …)` の `done` は扱われません（main は 600c5d3b35、PR #34732）。
2. **310〜318 行目：引数が 1 つの関数**

   その引数の名前（`done` でなくてもよい）を done とみなします。
3. **321 行目：本体の中の、その名前の識別子をすべて数える**

   279〜290 行目の `countDoneUsages`。あとで「扱えた数」と比べます（2b99ce515d、2025-11「improve safety of done callback transformation」）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L325–360 （▶ の行: 325–327, 329, 334, 338, 341–342, 344–345, 351, 353–355）

```ts
325 ▶   const bodyVisitor = (bodyNode: ts.Node): ts.Node | ts.Node[] | undefined => {
326 ▶     const complexTransformed = transformComplexDoneCallback(bodyNode, doneIdentifier, refactorCtx);
327 ▶     if (complexTransformed !== bodyNode) {
328 │       doneWasUsed = true;
329 ▶       handledUsages++; // complex transform handles one usage
330 │ 
331 │       return complexTransformed;
332 │     }
333 │ 
334 ▶     if (ts.isExpressionStatement(bodyNode) && ts.isCallExpression(bodyNode.expression)) {
335 │       const callExpr = bodyNode.expression;
336 │ 
337 │       // Transform `done.fail('message')` to `throw new Error('message')`
338 ▶       if (
339 │         ts.isPropertyAccessExpression(callExpr.expression) &&
340 │         ts.isIdentifier(callExpr.expression.expression) &&
341 ▶         callExpr.expression.expression.text === doneIdentifier.text &&
342 ▶         callExpr.expression.name.text === 'fail'
343 │       ) {
344 ▶         doneWasUsed = true;
345 ▶         handledUsages++;
346 │         reporter.reportTransformation(
347 │           sourceFile,
348 │           bodyNode,
349 │           'Transformed `done.fail()` to `throw new Error()`.',
350 │         );
351 ▶         const errorArgs = callExpr.arguments.length > 0 ? [callExpr.arguments[0]] : [];
352 │ 
353 ▶         return ts.factory.createThrowStatement(
354 ▶           ts.factory.createNewExpression(
355 ▶             ts.factory.createIdentifier('Error'),
356 │             undefined,
357 │             errorArgs,
358 │           ),
359 │         );
360 │       }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L361–399 （▶ の行: 363, 365–366, 372–374, 376–377, 379, 383, 386–389, 392, 398）

```ts
361 │ 
362 │       // Transform `promise.then(done)` or `promise.catch(done.fail)` to `await promise`
363 ▶       const promiseTransformed = transformPromiseBasedDone(callExpr, doneIdentifier, refactorCtx);
364 │       if (promiseTransformed) {
365 ▶         doneWasUsed = true;
366 ▶         handledUsages++;
367 │ 
368 │         return promiseTransformed;
369 │       }
370 │ 
371 │       // Remove `done()`
372 ▶       if (
373 ▶         ts.isIdentifier(callExpr.expression) &&
374 ▶         callExpr.expression.text === doneIdentifier.text
375 │       ) {
376 ▶         doneWasUsed = true;
377 ▶         handledUsages++;
378 │ 
379 ▶         return ts.setTextRange(ts.factory.createEmptyStatement(), callExpr.expression);
380 │       }
381 │     }
382 │ 
383 ▶     return ts.visitEachChild(bodyNode, bodyVisitor, tsContext);
384 │   };
385 │ 
386 ▶   const newBody = ts.visitNode(functionArg.body, (node: ts.Node) => {
387 ▶     if (ts.isBlock(node)) {
388 ▶       const newStatements = node.statements.flatMap(
389 ▶         (stmt) => bodyVisitor(stmt) as ts.Statement | ts.Statement[] | undefined,
390 │       );
391 │ 
392 ▶       return ts.factory.updateBlock(
393 │         node,
394 │         newStatements.filter((s) => !!s),
395 │       );
396 │     }
397 │ 
398 ▶     return bodyVisitor(node);
399 │   });
```

1. **326 行目：`p.then(v => { …; done(); })`**

   下の `transformComplexDoneCallback` で `await p.then(v => { … })` にします。
2. **338〜360 行目：`done.fail('m')`**

   `throw new Error('m')` の文にします。
3. **363〜369 行目：`p.then(done)`・`p.catch(done.fail)`**

   `await p` にします。
4. **372〜380 行目：`done()` の文**

   空の文にします。
5. **383 行目：どれでもなければ子へ**

   ここで**入れ子の関数の中まで**たどります。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L401–431 （▶ の行: 402–403, 408, 410, 415, 425–428）

```ts
401 │   // Safety check: if we found usages but didn't handle all of them, abort.
402 ▶   if (handledUsages < totalUsages) {
403 ▶     reporter.reportTransformation(
404 │       sourceFile,
405 │       node,
406 │       `Found unhandled usage of \`${doneIdentifier.text}\` callback. Skipping transformation.`,
407 │     );
408 ▶     const category = 'unhandled-done-usage';
409 │     reporter.recordTodo(category, sourceFile, node);
410 ▶     addTodoComment(node, category);
411 │ 
412 │     return node;
413 │   }
414 │ 
415 ▶   if (!doneWasUsed) {
416 │     return node;
417 │   }
418 │ 
419 │   reporter.reportTransformation(
420 │     sourceFile,
421 │     node,
422 │     `Converted test with \`done\` callback to an \`async\` test.`,
423 │   );
424 │ 
425 ▶   const newModifiers = [
426 ▶     ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword),
427 ▶     ...(ts.getModifiers(functionArg) ?? []).filter(
428 ▶       (mod) => mod.kind !== ts.SyntaxKind.AsyncKeyword,
429 │     ),
430 │   ];
431 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L432–460 （▶ の行: 433–434, 438, 441, 457, 459）

```ts
432 │   let newFunction: ts.ArrowFunction | ts.FunctionExpression;
433 ▶   if (ts.isArrowFunction(functionArg)) {
434 ▶     newFunction = ts.factory.updateArrowFunction(
435 │       functionArg,
436 │       newModifiers,
437 │       functionArg.typeParameters,
438 ▶       [], // remove parameters
439 │       functionArg.type,
440 │       functionArg.equalsGreaterThanToken,
441 ▶       (newBody as ts.ConciseBody) ?? ts.factory.createBlock([]),
442 │     );
443 │   } else {
444 │     // isFunctionExpression
445 │     newFunction = ts.factory.updateFunctionExpression(
446 │       functionArg,
447 │       newModifiers,
448 │       functionArg.asteriskToken,
449 │       functionArg.name,
450 │       functionArg.typeParameters,
451 │       [], // remove parameters
452 │       functionArg.type,
453 │       (newBody as ts.Block) ?? ts.factory.createBlock([]),
454 │     );
455 │   }
456 │ 
457 ▶   const newArgs = node.arguments.map((arg) => (arg === functionArg ? newFunction : arg));
458 │ 
459 ▶   return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, newArgs);
460 │ }
```

402 行目、数えた識別子のうち扱えなかったものがあれば、元の it をそのまま残して TODO を付けます。全部を扱えたら、425〜430 行目で `async` を付け、438 行目で引数を消します。TODO の文は todo-notes.ts の 184〜186 行目で、どこが扱えなかったかは言いません（5 節の `flush` の 2 つも同じ場所の 187〜193 行目）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/utils/todo-notes.ts` L182–194 （▶ の行: 184–185, 187, 189, 191–192）

```ts
182 │   },
183 │ 
184 ▶   'unhandled-done-usage': {
185 ▶     message: "The 'done' callback was used in an unhandled way. Please migrate manually.",
186 │   },
187 ▶   'flush-max-turns': {
188 │     message:
189 ▶       'flush(maxTurns) was called but maxTurns parameter is not migrated. Please migrate manually.',
190 │   },
191 ▶   'flush-return-value': {
192 ▶     message: 'flush() return value is not migrated. Please migrate manually.',
193 │   },
194 │ } as const;
```

この「全部を扱えたか」は、**入れ子の関数の中の `done()` も扱えた**と数えます。記録の「04」の `setTimeout(() => { timerDone = true; done(); }, 30)` は、383 行目で `setTimeout` のコールバックの中に入り、372〜380 行目で `done()` を消され、`async () => { setTimeout(…) }` になりました。Vitest は `setTimeout` を待たずにこの it を終えるので、「04」は通り、次の「05 sees what 04 did」が「expected false to be true」で落ちました。同じ形の `beforeAll((done) => setTimeout(…))`（「10」）も同じです。3 つの版とも同じで、issue #34730（2026-11-16、開いている）がこの形で、直す PR #34787 が 2026-11-27 の時点で開いています。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L213–238 （▶ の行: 219–221, 223, 227–228, 231–235）

```ts
213 │ function transformPromiseBasedDone(
214 │   callExpr: ts.CallExpression,
215 │   doneIdentifier: ts.Identifier,
216 │   refactorCtx: RefactorContext,
217 │ ): ts.Node | undefined {
218 │   const { sourceFile, reporter } = refactorCtx;
219 ▶   if (
220 ▶     ts.isPropertyAccessExpression(callExpr.expression) &&
221 ▶     (callExpr.expression.name.text === 'then' || callExpr.expression.name.text === 'catch')
222 │   ) {
223 ▶     const promiseHandler = callExpr.arguments[0];
224 │     if (promiseHandler) {
225 │       let isDoneHandler = false;
226 │       // promise.then(done)
227 ▶       if (ts.isIdentifier(promiseHandler) && promiseHandler.text === doneIdentifier.text) {
228 ▶         isDoneHandler = true;
229 │       }
230 │       // promise.catch(done.fail)
231 ▶       if (
232 ▶         ts.isPropertyAccessExpression(promiseHandler) &&
233 ▶         ts.isIdentifier(promiseHandler.expression) &&
234 ▶         promiseHandler.expression.text === doneIdentifier.text &&
235 ▶         promiseHandler.name.text === 'fail'
236 │       ) {
237 │         isDoneHandler = true;
238 │       }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L239–277 （▶ の行: 240, 242–244, 249, 262, 269–270）

```ts
239 │       // promise.then(() => done())
240 ▶       if (ts.isArrowFunction(promiseHandler) && !promiseHandler.parameters.length) {
241 │         const body = promiseHandler.body;
242 ▶         if (
243 ▶           ts.isCallExpression(body) &&
244 ▶           ts.isIdentifier(body.expression) &&
245 │           body.expression.text === doneIdentifier.text
246 │         ) {
247 │           isDoneHandler = true;
248 │         }
249 ▶         if (ts.isBlock(body) && body.statements.length === 1) {
250 │           const stmt = body.statements[0];
251 │           if (
252 │             ts.isExpressionStatement(stmt) &&
253 │             ts.isCallExpression(stmt.expression) &&
254 │             ts.isIdentifier(stmt.expression.expression) &&
255 │             stmt.expression.expression.text === doneIdentifier.text
256 │           ) {
257 │             isDoneHandler = true;
258 │           }
259 │         }
260 │       }
261 │ 
262 ▶       if (isDoneHandler) {
263 │         reporter.reportTransformation(
264 │           sourceFile,
265 │           callExpr,
266 │           'Transformed promise `.then(done)` to `await`.',
267 │         );
268 │ 
269 ▶         return ts.factory.createExpressionStatement(
270 ▶           ts.factory.createAwaitExpression(callExpr.expression.expression),
271 │         );
272 │       }
273 │     }
274 │   }
275 │ 
276 │   return undefined;
277 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L130–158 （▶ の行: 136–139, 151, 155–156）

```ts
130 │ function transformComplexDoneCallback(
131 │   node: ts.Node,
132 │   doneIdentifier: ts.Identifier,
133 │   refactorCtx: RefactorContext,
134 │ ): ts.Node | ts.Node[] | undefined {
135 │   const { sourceFile, reporter } = refactorCtx;
136 ▶   if (
137 ▶     !ts.isExpressionStatement(node) ||
138 ▶     !ts.isCallExpression(node.expression) ||
139 ▶     !ts.isPropertyAccessExpression(node.expression.expression)
140 │   ) {
141 │     return node;
142 │   }
143 │ 
144 │   const call = node.expression;
145 │   const pae = call.expression;
146 │ 
147 │   if (!ts.isPropertyAccessExpression(pae)) {
148 │     return node;
149 │   }
150 │ 
151 ▶   if (pae.name.text !== 'then' || call.arguments.length !== 1) {
152 │     return node;
153 │   }
154 │ 
155 ▶   const thenCallback = call.arguments[0];
156 ▶   if (!ts.isArrowFunction(thenCallback) && !ts.isFunctionExpression(thenCallback)) {
157 │     return node;
158 │   }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L159–183 （▶ の行: 161, 165–170, 174, 176）

```ts
159 │ 
160 │   // Re-create the .then() call but with a modified callback that has `done()` removed.
161 ▶   const thenCallbackBody = ts.isBlock(thenCallback.body)
162 │     ? thenCallback.body
163 │     : ts.factory.createBlock([ts.factory.createExpressionStatement(thenCallback.body)]);
164 │ 
165 ▶   const newStatements = thenCallbackBody.statements.filter((stmt) => {
166 ▶     return (
167 ▶       !ts.isExpressionStatement(stmt) ||
168 ▶       !ts.isCallExpression(stmt.expression) ||
169 ▶       !ts.isIdentifier(stmt.expression.expression) ||
170 ▶       stmt.expression.expression.text !== doneIdentifier.text
171 │     );
172 │   });
173 │ 
174 ▶   if (newStatements.length === thenCallbackBody.statements.length) {
175 │     // No "done()" call was removed, so don't transform.
176 ▶     return node;
177 │   }
178 │ 
179 │   reporter.reportTransformation(
180 │     sourceFile,
181 │     node,
182 │     'Transformed promise `.then()` with `done()` to `await`.',
183 │   );
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts` L185–211 （▶ の行: 206–207, 210）

```ts
185 │   const newThenCallback = ts.isArrowFunction(thenCallback)
186 │     ? ts.factory.updateArrowFunction(
187 │         thenCallback,
188 │         thenCallback.modifiers,
189 │         thenCallback.typeParameters,
190 │         thenCallback.parameters,
191 │         thenCallback.type,
192 │         thenCallback.equalsGreaterThanToken,
193 │         ts.factory.updateBlock(thenCallbackBody, newStatements),
194 │       )
195 │     : ts.factory.updateFunctionExpression(
196 │         thenCallback,
197 │         thenCallback.modifiers,
198 │         thenCallback.asteriskToken,
199 │         thenCallback.name,
200 │         thenCallback.typeParameters,
201 │         thenCallback.parameters,
202 │         thenCallback.type,
203 │         ts.factory.updateBlock(thenCallbackBody, newStatements),
204 │       );
205 │ 
206 ▶   const newCall = ts.factory.updateCallExpression(call, call.expression, call.typeArguments, [
207 ▶     newThenCallback,
208 │   ]);
209 │ 
210 ▶   return ts.factory.createExpressionStatement(ts.factory.createAwaitExpression(newCall));
211 │ }
```

`transformComplexDoneCallback` は 165〜172 行目で、`then` のコールバックの**いちばん上の段**の `done()` だけを取り除きます。記録の「08」の `then(v => { if (v !== 1) { done.fail('bad value'); } done(); })` は、上の段の `done()` はここで 1 つ扱えましたが、`if` の中の `done.fail` は扱えず、402 行目で元のまま TODO になりました。引数の `done` は残るので、Vitest はその引数に test の文脈のオブジェクトを渡し、`done()` を呼ぶと「done() callback is deprecated, use promise instead」の Unhandled Rejection です。it そのものは待たずに通りました。`ng test` では型の検査が「TS2339: Property 'fail' does not exist on type 'TestContext & object'.」で止めます。「09」の `onReady(done)`（done をそのまま渡す）も TODO で、同じく型で止まりました。

## 4. fakeAsync：外側の describe に偽のタイマーを足す

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-test.ts` L15–48 （▶ の行: 21–22, 27–33, 35, 39–40, 42）

```ts
15 │ export function transformFakeAsyncTest(
16 │   node: ts.Node,
17 │   ctx: RefactorContext,
18 │   currentOutermostDescribeContext?: CurrentOutermostDescribeContext,
19 │ ): ts.Node {
20 │   // Transform the outermost describe block and skip others.
21 ▶   if (currentOutermostDescribeContext == null && _is.describe(node)) {
22 ▶     return _transformDescribeCall(node, ctx);
23 │   }
24 │ 
25 │   // If we encounter a `fakeAsync` call while in a `describe` block, mark it in the context.
26 │   if (
27 ▶     ts.isCallExpression(node) &&
28 ▶     ts.isIdentifier(node.expression) &&
29 ▶     node.expression.text === 'fakeAsync' &&
30 ▶     currentOutermostDescribeContext != null &&
31 ▶     node.arguments.length >= 1 &&
32 ▶     _is.arrowOrFunction(node.arguments[0]) &&
33 ▶     isNamedImportFrom(ctx.sourceFile, 'fakeAsync', ANGULAR_CORE_TESTING)
34 │   ) {
35 ▶     return _transformFakeAsyncCall(node, ctx, currentOutermostDescribeContext);
36 │   }
37 │ 
38 │   // If we are in a `describe` block, visit the children recursively.
39 ▶   if (currentOutermostDescribeContext != null) {
40 ▶     return ts.visitEachChild(
41 │       node,
42 ▶       (child) => transformFakeAsyncTest(child, ctx, currentOutermostDescribeContext),
43 │       ctx.tsContext,
44 │     );
45 │   }
46 │ 
47 │   return node;
48 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-test.ts` L50–87 （▶ の行: 51–52, 57, 59, 63, 65–66, 70, 72–73, 80–82）

```ts
50 │ function _transformDescribeCall(node: ts.CallExpression, ctx: RefactorContext): ts.CallExpression {
51 ▶   const currentOutermostDescribeContext: CurrentOutermostDescribeContext = {
52 ▶     isUsingFakeAsync: false,
53 │   };
54 │ 
55 │   // Visit children recursively to collect transform `fakeAsync usages
56 │   // within the describe block and detect their presence through `isUsingFakeAsync`.
57 ▶   node = ts.visitEachChild(
58 │     node,
59 ▶     (child) => transformFakeAsyncTest(child, ctx, currentOutermostDescribeContext),
60 │     ctx.tsContext,
61 │   );
62 │ 
63 ▶   const { isUsingFakeAsync } = currentOutermostDescribeContext;
64 │ 
65 ▶   const describeBlock = _findDescribeBlock(node);
66 ▶   if (!isUsingFakeAsync || describeBlock === undefined) {
67 │     return node;
68 │   }
69 │ 
70 ▶   addImportSpecifierRemoval(ctx, 'fakeAsync', ANGULAR_CORE_TESTING);
71 │ 
72 ▶   return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
73 ▶     node.arguments[0],
74 │     ts.factory.createArrowFunction(
75 │       undefined,
76 │       undefined,
77 │       [],
78 │       undefined,
79 │       ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
80 ▶       ts.factory.createBlock([
81 ▶         ..._createFakeTimersHookStatements(ctx),
82 ▶         ...describeBlock.statements,
83 │       ]),
84 │     ),
85 │     ...node.arguments.slice(2),
86 │   ]);
87 │ }
```

1. **21〜23 行目：いちばん外の describe だけを入口にする**

   3 つ目の引数（今いる describe の記録）が無いときだけ `_transformDescribeCall` に入ります。中の describe は 39〜45 行目で子として素通りします。describe の外の `it(fakeAsync(…))` は変換されません。
2. **27〜33 行目：`fakeAsync(関数)` を見つける**

   33 行目で、`fakeAsync` が `@angular/core/testing` から名前つきで import されているかを確かめます（下の `isNamedImportFrom`）。
3. **63〜68 行目：1 つでもあれば**

   70 行目で `fakeAsync` を import から消す予約をし、72〜86 行目で describe の本体の先頭に `beforeEach`・`afterEach` の 2 つの文を足します。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-test.ts` L137–174 （▶ の行: 139–142, 146, 156, 159–160, 163–164）

```ts
137 │ function _createFakeTimersHookStatements(ctx: RefactorContext): ts.Statement[] {
138 │   return [
139 ▶     // > beforeEach(() => {
140 ▶     // >   vi.useFakeTimers({
141 ▶     // >     advanceTimeDelta: 1,
142 ▶     // >     shouldAdvanceTime: true
143 │     // >   });
144 │     // > });
145 │     ts.factory.createExpressionStatement(
146 ▶       ts.factory.createCallExpression(ts.factory.createIdentifier('beforeEach'), undefined, [
147 │         ts.factory.createArrowFunction(
148 │           undefined,
149 │           undefined,
150 │           [],
151 │           undefined,
152 │           ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
153 │           ts.factory.createBlock(
154 │             [
155 │               ts.factory.createExpressionStatement(
156 ▶                 createViCallExpression(ctx, 'useFakeTimers', [
157 │                   ts.factory.createObjectLiteralExpression([
158 │                     ts.factory.createPropertyAssignment(
159 ▶                       'advanceTimeDelta',
160 ▶                       ts.factory.createNumericLiteral(1),
161 │                     ),
162 │                     ts.factory.createPropertyAssignment(
163 ▶                       'shouldAdvanceTime',
164 ▶                       ts.factory.createTrue(),
165 │                     ),
166 │                   ]),
167 │                 ]),
168 │               ),
169 │             ],
170 │             true,
171 │           ),
172 │         ),
173 │       ]),
174 │     ),
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-test.ts` L175–195 （▶ の行: 176–177, 180, 188）

```ts
175 │ 
176 ▶     // > afterEach(() => {
177 ▶     // >   vi.useRealTimers();
178 │     // > });
179 │     ts.factory.createExpressionStatement(
180 ▶       ts.factory.createCallExpression(ts.factory.createIdentifier('afterEach'), undefined, [
181 │         ts.factory.createArrowFunction(
182 │           undefined,
183 │           undefined,
184 │           [],
185 │           undefined,
186 │           ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
187 │           ts.factory.createBlock(
188 ▶             [ts.factory.createExpressionStatement(createViCallExpression(ctx, 'useRealTimers'))],
189 │             true,
190 │           ),
191 │         ),
192 │       ]),
193 │     ),
194 │   ];
195 │ }
```

足すのは `beforeEach(() => { vi.useFakeTimers({ advanceTimeDelta: 1, shouldAdvanceTime: true }) })` と `afterEach(() => { vi.useRealTimers() })` です。`shouldAdvanceTime: true` は、偽の時計を本物の時間の流れに合わせても進める設定（`advanceTimeDelta` ミリ秒ごと）で、`fakeAsync` の「`tick` しない限り時間は止まる」とは違います。記録の「08」の `Date.now()` の差は、変換後も `tick(1000)` の分だけの `1000` でした（この it の中で本物の時間がほとんど進まないため）。偽のタイマーは describe のすべての it に入るので、`fakeAsync` を使わない it も偽のタイマーの下で走ります。2026-05 の c9f4081533 は、これを `beforeAll` から `beforeEach` に替えて it ごとに作り直すようにしました（その commit の説明は「`beforeAll`・`afterAll` の中で偽のタイマーの API を使うものは失敗する」）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-test.ts` L89–111 （▶ の行: 94, 96, 100–102, 104, 107）

```ts
 89 │ function _transformFakeAsyncCall(
 90 │   node: ts.CallExpression,
 91 │   ctx: RefactorContext,
 92 │   currentOutermostDescribeContext: CurrentOutermostDescribeContext,
 93 │ ): ts.CallExpression | ts.ArrowFunction {
 94 ▶   currentOutermostDescribeContext.isUsingFakeAsync = true;
 95 │ 
 96 ▶   const fakeAsyncCallback = node.arguments[0];
 97 │   if (!_is.arrowOrFunction(fakeAsyncCallback)) {
 98 │     return node;
 99 │   }
100 ▶   const callbackBody = ts.isBlock(fakeAsyncCallback.body)
101 ▶     ? fakeAsyncCallback.body
102 ▶     : ts.factory.createBlock([ts.factory.createExpressionStatement(fakeAsyncCallback.body)]);
103 │ 
104 ▶   ctx.reporter.reportTransformation(
105 │     ctx.sourceFile,
106 │     node,
107 ▶     `Transformed \`fakeAsync\` to \`vi.useFakeTimers\`.`,
108 │   );
109 │ 
110 │   let statements = callbackBody.statements;
111 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-test.ts` L112–135 （▶ の行: 113–117, 119, 122, 127–128, 133）

```ts
112 │   // Append `vi.runOnlyPendingTimersAsync()` as the last statement of `beforeEach` to mimic flush behavior.
113 ▶   if (
114 ▶     ts.isCallExpression(node.parent) &&
115 ▶     ts.isIdentifier(node.parent.expression) &&
116 ▶     node.parent.expression.text === 'beforeEach' &&
117 ▶     !_isFakeAsyncFlushDisabled(node)
118 │   ) {
119 ▶     statements = ts.factory.createNodeArray([
120 │       ...statements,
121 │       ts.factory.createExpressionStatement(
122 ▶         ts.factory.createAwaitExpression(createViCallExpression(ctx, 'runOnlyPendingTimersAsync')),
123 │       ),
124 │     ]);
125 │   }
126 │ 
127 ▶   return ts.factory.createArrowFunction(
128 ▶     [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
129 │     fakeAsyncCallback.typeParameters,
130 │     fakeAsyncCallback.parameters,
131 │     undefined,
132 │     ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
133 ▶     ts.factory.createBlock(statements),
134 │   );
135 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-test.ts` L197–218 （▶ の行: 201–202, 204–207, 210–211）

```ts
197 │ /**
198 │  * Detects if the `flush` option is set to false in the `fakeAsync` call expression.
199 │  * e.g. `fakeAsync(() => { ... }, { flush: false })`
200 │  */
201 ▶ function _isFakeAsyncFlushDisabled(fakeAsyncCallExpression: ts.CallExpression): boolean {
202 ▶   const options = fakeAsyncCallExpression.arguments[1];
203 │ 
204 ▶   return (
205 ▶     options &&
206 ▶     ts.isObjectLiteralExpression(options) &&
207 ▶     options.properties.some(
208 │       (property) =>
209 │         ts.isPropertyAssignment(property) &&
210 ▶         property.name.getText() === 'flush' &&
211 ▶         property.initializer.getText() === 'false',
212 │     )
213 │   );
214 │ }
215 │ 
216 │ interface CurrentOutermostDescribeContext {
217 │   isUsingFakeAsync: boolean;
218 │ }
```

`fakeAsync(関数)` そのものは、中身をそのまま持つ `async` のアロー関数に替えます。親が `beforeEach` のときだけ、113〜125 行目で最後に `await vi.runOnlyPendingTimersAsync()` を足します（d2aa9ede55、2026-05）。Angular の `fakeAsync` は既定（`flush: true`）で、関数の終わりに残ったタイマーを流します。`it(fakeAsync(…))` にはこの足し算が無いので、記録の「06」で `setTimeout(() => (flushedAtEnd = true), 100)` を残した it は、変換後はタイマーが流れないまま `afterEach` の `vi.useRealTimers()` で捨てられ、次の「07」が落ちました。`beforeEach` の「09」は通ります。spec の「should not append `vi.runOnlyPendingTimersAsync()` in `test` or `afterEach`」（fake-async-test\_spec.ts の 308 行目）は、`it` に足さないことを期待しています。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-test.ts` L220–247 （▶ の行: 222–224, 231, 239, 242, 244–246）

```ts
220 │ function _findDescribeBlock(node: ts.CallExpression): ts.Block | undefined {
221 │   const args = node.arguments;
222 ▶   const describeCallback = args.length >= 2 ? args[1] : undefined;
223 ▶   if (describeCallback !== undefined && _is.arrowOrFunction(describeCallback)) {
224 ▶     return _getFunctionBlock(describeCallback);
225 │   }
226 │ 
227 │   return undefined;
228 │ }
229 │ 
230 │ function _getFunctionBlock(node: ts.FunctionExpression | ts.ArrowFunction): ts.Block {
231 ▶   return ts.isBlock(node.body)
232 │     ? node.body
233 │     : ts.factory.createBlock([ts.factory.createExpressionStatement(node.body)]);
234 │ }
235 │ 
236 │ const _is = {
237 │   arrowOrFunction: (node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression =>
238 │     ts.isArrowFunction(node) || ts.isFunctionExpression(node),
239 ▶   describe: (node: ts.Node): node is ts.CallExpression =>
240 │     ts.isCallExpression(node) &&
241 │     // describe
242 ▶     ((ts.isIdentifier(node.expression) && node.expression.text === 'describe') ||
243 │       // describe.only or describe.skip
244 ▶       (ts.isPropertyAccessExpression(node.expression) &&
245 ▶         ts.isIdentifier(node.expression.expression) &&
246 ▶         node.expression.expression.text === 'describe')),
247 │ };
```

## 5. tick・flush・flushMicrotasks

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-tick.ts` L15–41 （▶ の行: 18–21, 33, 35–36, 38–39）

```ts
15 │ export function transformFakeAsyncTick(node: ts.Node, ctx: RefactorContext): ts.Node {
16 │   if (
17 │     !(
18 ▶       ts.isCallExpression(node) &&
19 ▶       ts.isIdentifier(node.expression) &&
20 ▶       node.expression.text === 'tick' &&
21 ▶       isNamedImportFrom(ctx.sourceFile, 'tick', ANGULAR_CORE_TESTING)
22 │     )
23 │   ) {
24 │     return node;
25 │   }
26 │ 
27 │   ctx.reporter.reportTransformation(
28 │     ctx.sourceFile,
29 │     node,
30 │     `Transformed \`tick\` to \`await vi.advanceTimersByTimeAsync()\`.`,
31 │   );
32 │ 
33 ▶   addImportSpecifierRemoval(ctx, 'tick', ANGULAR_CORE_TESTING);
34 │ 
35 ▶   const durationNumericLiteral =
36 ▶     node.arguments.length > 0 ? node.arguments[0] : ts.factory.createNumericLiteral(0);
37 │ 
38 ▶   return ts.factory.createAwaitExpression(
39 ▶     createViCallExpression(ctx, 'advanceTimersByTimeAsync', [durationNumericLiteral]),
40 │   );
41 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-flush-microtasks.ts` L15–38 （▶ の行: 20–21, 33, 35–36）

```ts
15 │ export function transformFakeAsyncFlushMicrotasks(node: ts.Node, ctx: RefactorContext): ts.Node {
16 │   if (
17 │     !(
18 │       ts.isCallExpression(node) &&
19 │       ts.isIdentifier(node.expression) &&
20 ▶       node.expression.text === 'flushMicrotasks' &&
21 ▶       isNamedImportFrom(ctx.sourceFile, 'flushMicrotasks', ANGULAR_CORE_TESTING)
22 │     )
23 │   ) {
24 │     return node;
25 │   }
26 │ 
27 │   ctx.reporter.reportTransformation(
28 │     ctx.sourceFile,
29 │     node,
30 │     `Transformed \`flushMicrotasks\` to \`await vi.advanceTimersByTimeAsync(0)\`.`,
31 │   );
32 │ 
33 ▶   addImportSpecifierRemoval(ctx, 'flushMicrotasks', ANGULAR_CORE_TESTING);
34 │ 
35 ▶   return ts.factory.createAwaitExpression(
36 ▶     createViCallExpression(ctx, 'advanceTimersByTimeAsync', [ts.factory.createNumericLiteral(0)]),
37 │   );
38 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-flush.ts` L16–40 （▶ の行: 21–22, 34, 36–38）

```ts
16 │ export function transformFakeAsyncFlush(node: ts.Node, ctx: RefactorContext): ts.Node {
17 │   if (
18 │     !(
19 │       ts.isCallExpression(node) &&
20 │       ts.isIdentifier(node.expression) &&
21 ▶       node.expression.text === 'flush' &&
22 ▶       isNamedImportFrom(ctx.sourceFile, 'flush', ANGULAR_CORE_TESTING)
23 │     )
24 │   ) {
25 │     return node;
26 │   }
27 │ 
28 │   ctx.reporter.reportTransformation(
29 │     ctx.sourceFile,
30 │     node,
31 │     `Transformed \`flush\` to \`await vi.runAllTimersAsync()\`.`,
32 │   );
33 │ 
34 ▶   addImportSpecifierRemoval(ctx, 'flush', ANGULAR_CORE_TESTING);
35 │ 
36 ▶   if (node.arguments.length > 0) {
37 ▶     ctx.reporter.recordTodo('flush-max-turns', ctx.sourceFile, node);
38 ▶     addTodoComment(node, 'flush-max-turns');
39 │   }
40 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-flush.ts` L41–60 （▶ の行: 41–42, 45–46, 48–52, 54–57）

```ts
41 ▶   const awaitRunAllTimersAsync = ts.factory.createAwaitExpression(
42 ▶     createViCallExpression(ctx, 'runAllTimersAsync'),
43 │   );
44 │ 
45 ▶   if (ts.isExpressionStatement(node.parent)) {
46 ▶     return awaitRunAllTimersAsync;
47 │   } else {
48 ▶     // If `flush` is not used as its own statement, then the return value is probably used.
49 ▶     // Therefore, we replace it with nullish coalescing that returns 0:
50 ▶     // > await vi.runAllTimersAsync() ?? 0;
51 ▶     ctx.reporter.recordTodo('flush-return-value', ctx.sourceFile, node);
52 ▶     addTodoComment(node, 'flush-return-value');
53 │ 
54 ▶     return ts.factory.createBinaryExpression(
55 ▶       awaitRunAllTimersAsync,
56 ▶       ts.SyntaxKind.QuestionQuestionToken,
57 ▶       ts.factory.createNumericLiteral(0),
58 │     );
59 │   }
60 │ }
```

| Angular | 変換 | 記録 |
| --- | --- | --- |
| `tick(n)` | `await vi.advanceTimersByTimeAsync(n)`（引数が無ければ 0） | 「01」は通る |
| `flushMicrotasks()` | `await vi.advanceTimersByTimeAsync(0)` | 「02」は通る |
| `flush()` | `await vi.runAllTimersAsync()`。引数があれば TODO | 「03」は通る |
| `const t = flush()` | `await vi.runAllTimersAsync() ?? 0` と TODO | 「04」は「expected { …(47) } to be 1000」 |
| `discardPeriodicTasks()` | どの変換器にも無い。import ごと残る | 「05」は「zone-testing.js is needed for the fakeAsync() test helper but could not be found.」。TODO も無い |

3 つとも、21 行目などで同じ名前が `@angular/core/testing` から import されているときだけ書き換え、import から消す予約をします。48〜50 行目のコメントは「戻り値が使われていそうなので、0 を返す `??` に替える」ですが、`vi.runAllTimersAsync()` の Promise の中身は `vi` そのもの（Vitest 5.1.2 の `runAllTimersAsync` は `return utils;`。記録の「{ …(47) }」は 47 個のメンバーを持つそのオブジェクト）で `null` にも `undefined` にもならないので、`?? 0` の右は使われません。TODO が付くので手で直す前提です。

`await` を入れるので、`tick` が `async` でない関数の中にあると構文の誤りになります。記録の `fakeasync-helper.spec.ts` の `function advance(ms: number): void { tick(ms); }` は `await vi.advanceTimersByTimeAsync(ms)` になり、Vitest は「\[PARSE\_ERROR\] \`await\` is only allowed within async functions and at the top levels of modules」でファイルごと読めず、`ng test` は「TS1308」でした。3 つの版とも同じで、TODO もありません。

## 6. import の後始末

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/utils/ast-helpers.ts` L110–138 （▶ の行: 116, 121–122, 126–128, 132–133）

```ts
110 │ /**
111 │  * Checks if a named binding is imported from the given module in the source file.
112 │  * @param sourceFile The source file to search for imports.
113 │  * @param name The import name (e.g. 'flush', 'tick').
114 │  * @param moduleSpecifier The module path (e.g. '@angular/core/testing').
115 │  */
116 ▶ export function isNamedImportFrom(
117 │   sourceFile: ts.SourceFile,
118 │   name: string,
119 │   moduleSpecifier: string,
120 │ ): boolean {
121 ▶   return sourceFile.statements.some((statement) => {
122 ▶     if (!_isImportDeclarationWithNamedBindings(statement)) {
123 │       return false;
124 │     }
125 │ 
126 ▶     const specifier = statement.moduleSpecifier;
127 ▶     const modulePath = ts.isStringLiteralLike(specifier) ? specifier.text : null;
128 ▶     if (modulePath !== moduleSpecifier) {
129 │       return false;
130 │     }
131 │     for (const element of statement.importClause.namedBindings.elements) {
132 ▶       const importedName = element.propertyName ? element.propertyName.text : element.name.text;
133 ▶       if (importedName === name) {
134 │         return true;
135 │       }
136 │     }
137 │   });
138 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/utils/refactor-helpers.ts` L12–27 （▶ の行: 19, 24–26）

```ts
12 │ /**
13 │  * Marks an identifier to be removed from an import specifier.
14 │  *
15 │  * @param ctx The refactor context object.
16 │  * @param name The name of the identifier to remove from the import specifier.
17 │  * @param moduleSpecifier The module specifier to remove the identifier from.
18 │  */
19 ▶ export function addImportSpecifierRemoval(
20 │   ctx: RefactorContext,
21 │   name: string,
22 │   moduleSpecifier: string,
23 │ ): void {
24 ▶   const removals = ctx.pendingImportSpecifierRemovals.get(moduleSpecifier) ?? new Set<string>();
25 ▶   removals.add(name);
26 ▶   ctx.pendingImportSpecifierRemovals.set(moduleSpecifier, removals);
27 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/utils/ast-helpers.ts` L140–177 （▶ の行: 144, 148, 150, 155, 160, 165–166, 168, 171–172, 175）

```ts
140 │ /**
141 │  * Removes specified import specifiers from ImportDeclarations.
142 │  * If all specifiers are removed from an import, the entire import is dropped.
143 │  */
144 ▶ export function removeImportSpecifiers(
145 │   sourceFile: ts.SourceFile,
146 │   removals: Map<string, Set<string>>,
147 │ ): ts.SourceFile {
148 ▶   const newStatements = sourceFile.statements
149 │     .map((statement) => {
150 ▶       if (!_isImportDeclarationWithNamedBindings(statement)) {
151 │         return statement;
152 │       }
153 │ 
154 │       const specifier = statement.moduleSpecifier;
155 ▶       const modulePath = ts.isStringLiteralLike(specifier) ? specifier.text : null;
156 │       if (modulePath === null) {
157 │         return statement;
158 │       }
159 │ 
160 ▶       const namesToRemove = removals.get(modulePath);
161 │       if (namesToRemove === undefined || namesToRemove.size === 0) {
162 │         return statement;
163 │       }
164 │ 
165 ▶       const remaining = statement.importClause.namedBindings.elements.filter((el) => {
166 ▶         const name = el.propertyName ? el.propertyName.text : el.name.text;
167 │ 
168 ▶         return !namesToRemove.has(name);
169 │       });
170 │ 
171 ▶       if (remaining.length === 0) {
172 ▶         return;
173 │       }
174 │ 
175 ▶       if (remaining.length === statement.importClause.namedBindings.elements.length) {
176 │         return statement;
177 │       }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/utils/ast-helpers.ts` L178–207 （▶ の行: 179, 182, 186, 192, 194）

```ts
178 │ 
179 ▶       return ts.factory.updateImportDeclaration(
180 │         statement,
181 │         statement.modifiers,
182 ▶         ts.factory.updateImportClause(
183 │           statement.importClause,
184 │           undefined,
185 │           statement.importClause.name,
186 ▶           ts.factory.createNamedImports(remaining),
187 │         ),
188 │         statement.moduleSpecifier,
189 │         statement.attributes,
190 │       );
191 │     })
192 ▶     .filter((statement) => statement !== undefined);
193 │ 
194 ▶   return ts.factory.updateSourceFile(sourceFile, newStatements);
195 │ }
196 │ 
197 │ function _isImportDeclarationWithNamedBindings(
198 │   statement: ts.Statement,
199 │ ): statement is ts.ImportDeclaration & {
200 │   importClause: ts.ImportClause & { namedBindings: ts.NamedImports };
201 │ } {
202 │   return (
203 │     ts.isImportDeclaration(statement) &&
204 │     statement.importClause?.namedBindings !== undefined &&
205 │     ts.isNamedImports(statement.importClause.namedBindings)
206 │   );
207 │ }
```

`isNamedImportFrom` は `import { tick } from '@angular/core/testing'` の形だけを見ます（別名の `{ tick as t }` は 132 行目で元の名前 `tick` を比べますが、本文の呼び出しは `t(…)` なので変換器の 20 行目の名前の比べで外れます）。消す予約は、[第 7 回](07-sca-jv-overview.md)の 5 節の後始末で、変換の後に 1 度だけ当たります。171〜173 行目、全部消えたら import の文ごと消し、残る名前があれば並びを作り直します。記録の変換後の先頭は `import { discardPeriodicTasks } from '@angular/core/testing';` で、`fakeAsync`・`flush`・`flushMicrotasks`・`tick` は消えていました。

> **🧪 DEMO — lifecycle と fakeAsync の spec を Jasmine で走らせ、変換して Vitest で走らせた記録**
>
> it を選ぶと、元の Jasmine の書き方と、選んだ版の変換器の出力、各版の Vitest の結果を見られます。下線の付いたボタンは Jasmine と結果が違った it です（Jasmine の「保留」「走らない」と Vitest の「飛ばす」は同じとみなしました）。ファイルの見出しの下は、そのファイル全体で Jasmine と Vitest が出したものです。
>
> lifecycle.spec.ts 全体：Jasmine は passed。44129f66a3 の Vitest は「Unhandled Errors: Error: done() callback is deprecated, use promise instead」。22.2.7（npm）の Vitest は「Unhandled Errors: Error: done() callback is deprecated, use promise instead」。main（0a61cbc4bf）の Vitest は「Unhandled Errors: Error: done() callback is deprecated, use promise instead」。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sca-jv-lifecycle)

## 7. テストと直し方

| spec | describe（行） | 固めている約束 |
| --- | --- | --- |
| `transformers/jasmine-lifecycle_spec.ts` | `transformDoneCallback`（11）・`transformPending`（183）・`transformFocusedAndSkippedTests`（222） | 1〜3 節。`done()` を入れ子の関数の中で呼ぶ例と、条件の中の `pending()` の例は無い |
| `transformers/fake-async-test_spec.ts` | `transformFakeAsyncTest`（11） | 4 節。describe の外は変換しない（270）、`it` と `afterEach` には流す文を足さない（308） |
| `fake-async-tick_spec.ts`・`fake-async-flush_spec.ts`・`fake-async-flush-microtasks_spec.ts` | 各 11 行目 | 5・6 節。`flush` の戻り値は TODO（35・47）。`async` でない関数の中の例は無い |

📄 `走らせたコマンド（2026-11-27）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/schematics/angular:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=^(Jasmine to Vitest Transformer - transformDoneCallback|transform(Pending|FocusedAndSkippedTests|FakeAsync))"
（結果は下の段落）
```

手元の bazel でこの 7 つの describe は 43 specs・0 failures でした。

直すとしたら、入れ子の `done()` は jasmine-lifecycle.ts の 383 行目で関数（アロー関数・関数式）の中に入るとき、中で見つけた `done` を「扱えた」に数えないようにすれば、402 行目の TODO に落ちます（PR #34787 の向き）。条件の中の `pending()` は 94 行目の `visitEachChild` を、本体のいちばん上の段の文だけに絞るのが小さい直し方です。`tick` などが `async` でない関数の中にあるときは、fake-async-tick.ts の 16〜25 行目で、いちばん近い関数が `async` か `fakeAsync` の引数かを親をたどって確かめ、違えば TODO にします。`it(fakeAsync(…))` の終わりの流しは、fake-async-test.ts の 113〜118 行目の条件に `it` を足すかどうかで、308 行目の spec の期待とぶつかります。`discardPeriodicTasks` は 4 つ目の変換器を足すか、少なくとも TODO にします。spec はそれぞれのファイルの表に 1 行ずつ足します。

## 聞かれそうな質問

**Q. `done` を使う it は全部 `async` になる？**

jasmine-lifecycle.ts の 402 行目で、数えた `done` を全部扱えたときだけです。扱えなければ TODO で元のまま残ります。ただし入れ子の関数の中の `done()` も「扱えた」に入るので、`setTimeout` の中の `done()` は消され、変換後の it は待たなくなります（記録の「04」「05」、issue #34730）。

**Q. `pending()` が条件の中にあるとどうなる？**

94 行目で入れ子の奥までたどるので、条件に関係なく it が `it.skip` になります。Jasmine で走っていた it が走らなくなります（記録の「03」）。

**Q. fakeAsync を変換すると偽のタイマーはどこに入る？**

fake-async-test.ts の 72〜86 行目で、いちばん外の describe の本体の先頭に `beforeEach(vi.useFakeTimers(…))` と `afterEach(vi.useRealTimers())` が入ります。fakeAsync を使わない it も偽のタイマーの下で走ります。

**Q. fakeAsync の「終わりに流す」は残る？**

`beforeEach(fakeAsync(…))` だけ、113〜125 行目で `await vi.runOnlyPendingTimersAsync()` を足します。`it(fakeAsync(…))` には足さないので、終わりに残ったタイマーは流れずに捨てられます（記録の「06」「07」）。

**Q. `tick` が変換されないのはどんなとき？**

fake-async-tick.ts の 21 行目で、`tick` が `@angular/core/testing` から名前つきで import されていないとき、それと `--fake-async` を付けていないときです（[第 7 回](07-sca-jv-overview.md)の 4 節のとおり、visitor が fakeAsync の 4 つの変換器を飛ばす）。

## 読み終えて

- `fit`・`xit` は名前の置き換えで、先に走るので、44129f66a3 と 22.2.7 では後の `pending`・`done` の変換が `fit`・`xit` に効かない（main で直った）。
- `pending()` も `done()` も、入れ子の奥まで探して消す。条件の中の `pending` は it を丸ごと飛ばし、コールバックの中の `done` は it を待たなくする。
- fakeAsync は外側の describe に `shouldAdvanceTime` の偽のタイマーを入れ、`tick`・`flush` を `await` の呼び出しにする。`it` の終わりの流しと `discardPeriodicTasks` は移らない。
- `await` を入れる変換は、`async` でない関数の中ではファイルごと壊す。

---

← 前: [Jasmine から Vitest へ（3）：matcher とその他](09-sca-jv-matcher.md)  
次: [spec と issue を読む：@schematics/angular の道具を固めているもの](11-sca-tests-issues.md) →
