[目次](../README.md) › [@schematics/angular の道具と移行](README.md) › 第 9 回 / 全 11 回

# Jasmine から Vitest へ（3）：matcher とその他

> refactor/jasmine-vitest/transformers/jasmine-matcher.ts・jasmine-misc.ts：toBeTrue・toHaveBeenCalledOnceWith・jasmine.any・objectContaining などの対応、clock・pending・fail ほかの扱い。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sca-jv-matcher)

---

この章で分かること：`refactor-jasmine-vitest` が Jasmine の matcher（`toBeTrue`・`toHaveSize`・`toHaveBeenCalledOnceWith`・`jasmine.any`・`jasmine.objectContaining`・`withContext`・`expectAsync` など）と、`jasmine.clock()`・`fail()`・`jasmine.DEFAULT_TIMEOUT_INTERVAL` をどう書き換え、何を TODO にし、何を**黙って残す**かです。30 個の it を Jasmine で走らせ、変換して Vitest で走らせ、意味が変わるものを確かめます。

読む対象は `packages/schematics/angular/refactor/jasmine-vitest/transformers/` の `jasmine-matcher.ts`・`jasmine-misc.ts` です（../angular-cli、44129f66a3）。変換器を当てる順は[第 7 回](07-sca-jv-overview.md)、spy の作り方は[前の回](08-sca-jv-spy.md)です。

1. [1. 変更の単位とファイルの道具](01-sca-change.md)
2. [2. AST の道具](02-sca-ast-utils.md)
3. [3. 依存を足す](03-sca-dependency.md)
4. [4. standalone のアプリを書き換える](04-sca-standalone.md)
5. [5. builder の移行](05-sca-build-migrations.md)
6. [6. Karma から Vitest へ](06-sca-karma-vitest.md)
7. [7. Jasmine から Vitest へ（1）骨組み](07-sca-jv-overview.md)
8. [8. Jasmine から Vitest へ（2）spy と型](08-sca-jv-spy.md)
9. **9. Jasmine から Vitest へ（3）matcher**（この章）
10. [10. Jasmine から Vitest へ（4）lifecycle と fakeAsync](10-sca-jv-lifecycle.md)
11. [11. spec と issue](11-sca-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 記録の取り方は[前の回](08-sca-jv-spy.md)と同じです（Jasmine 5.13.0、変換器は 44129f66a3・npm の 22.2.7・main（0a61cbc4bf）の 3 つ、Vitest 5.1.2、型の検査は 22.3.0 の `ng test`）。`jasmine-matcher.ts` は 44129f66a3 のあと、22.2.7 までに 2 つ、main と 22.3.0 までにもう 1 つの修正が入りました。`jasmine-misc.ts` は 3 つの版で同じです。`toHaveClass` は DOM が要るので、この記録では走らせていません。本文の commit の hash は main のものです（22.2.x の枝には同じ PR が別の hash で入っています）。

## 1. 名前を替えるだけの matcher

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L27–44 （▶ の行: 28–30, 32, 36, 43）

```ts
27 │ const SUGAR_MATCHER_CHANGES = new Map<string, { newName: string; newArgs?: ts.Expression[] }>([
28 ▶   ['toBeTrue', { newName: 'toBe', newArgs: [ts.factory.createTrue()] }],
29 ▶   ['toBeFalse', { newName: 'toBe', newArgs: [ts.factory.createFalse()] }],
30 ▶   ['toBePositiveInfinity', { newName: 'toBe', newArgs: [ts.factory.createIdentifier('Infinity')] }],
31 │   [
32 ▶     'toBeNegativeInfinity',
33 │     {
34 │       newName: 'toBe',
35 │       newArgs: [
36 ▶         ts.factory.createPrefixUnaryExpression(
37 │           ts.SyntaxKind.MinusToken,
38 │           ts.factory.createIdentifier('Infinity'),
39 │         ),
40 │       ],
41 │     },
42 │   ],
43 ▶   ['toHaveSize', { newName: 'toHaveLength' }],
44 │ ]);
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L46–71 （▶ の行: 50, 54–55, 57–58, 60, 65–66, 68）

```ts
46 │ export function transformSyntacticSugarMatchers(
47 │   node: ts.Node,
48 │   { sourceFile, reporter }: RefactorContext,
49 │ ): ts.Node {
50 ▶   if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
51 │     return node;
52 │   }
53 │ 
54 ▶   const pae = node.expression;
55 ▶   const matcherName = pae.name.text;
56 │ 
57 ▶   if (matcherName === 'toHaveSpyInteractions') {
58 ▶     const category = 'toHaveSpyInteractions';
59 │     reporter.recordTodo(category, sourceFile, node);
60 ▶     addTodoComment(node, category);
61 │ 
62 │     return node;
63 │   }
64 │ 
65 ▶   if (matcherName === 'toThrowMatching') {
66 ▶     const category = 'toThrowMatching';
67 │     reporter.recordTodo(category, sourceFile, node);
68 ▶     addTodoComment(node, category, { name: matcherName });
69 │ 
70 │     return node;
71 │   }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L73–88 （▶ の行: 73, 75, 81–82, 84）

```ts
73 ▶   const mapping = SUGAR_MATCHER_CHANGES.get(matcherName);
74 │ 
75 ▶   if (mapping) {
76 │     reporter.reportTransformation(
77 │       sourceFile,
78 │       node,
79 │       `Transformed matcher ".${matcherName}()" to ".${mapping.newName}()".`,
80 │     );
81 ▶     const newExpression = createPropertyAccess(pae.expression, mapping.newName);
82 ▶     const newArgs = mapping.newArgs ?? [...node.arguments];
83 │ 
84 ▶     return ts.factory.updateCallExpression(node, newExpression, node.typeArguments, newArgs);
85 │   }
86 │ 
87 │   return node;
88 │ }
```

`expect(x).名前(…)` の名前を 27〜44 行目の表で引き、81 行目で左（`expect(x)` や `expect(x).not`）はそのまま、名前と引数だけを替えます。54 行目は `expect` かどうかを見ないので、`obj.toBeTrue()` のような自分のメソッドも書き換わります。

`toHaveSize` は 43 行目で `toHaveLength` です。jasmine-core 5.13 の `toHaveSize` は、`Set`・`Map` なら `size`、`length` があればそれ、どちらも無ければ `Object.keys(actual).length` を数えます。記録の「04」の `expect({ a: 1, b: 2 }).toHaveSize(2)` は Vitest で「expected { a: 1, b: 2 } to have property 'length'」で落ち、3 つの版とも同じでした（「03」の `Set` は Vitest でも通る）。型の検査では止まりません。

57〜71 行目の 2 つは TODO だけです。表にも TODO にも無い matcher は何もされません。記録の「24」の `toHaveNoOtherSpyInteractions`（jasmine-core 5.13 にある）は残り、Vitest で「Invalid Chai property: toHaveNoOtherSpyInteractions」、`ng test` で TS2339 でした。「20」の `not.toThrowError(TypeError, 'b')` も変換の対象外で、Vitest の `toThrowError` は引数を 1 つしか取らないので、型の検査は「TS2554: Expected 0-1 arguments, but got 2.」、Vitest の実行は 2 つ目の文字列を見ずに「型が TypeError だから」落ちました。Jasmine では「型は合うが文が違う」ので通る it です。

## 2. 非対称の matcher と jasmine.truthy() の仲間

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L90–122 （▶ の行: 90–96, 104, 106, 109–110, 117）

```ts
 90 ▶ const ASYMMETRIC_MATCHER_NAMES: ReadonlyArray<string> = [
 91 ▶   'anything',
 92 ▶   'any',
 93 ▶   'stringMatching',
 94 ▶   'objectContaining',
 95 ▶   'arrayContaining',
 96 ▶   'stringContaining',
 97 │ ];
 98 │ 
 99 │ export function transformAsymmetricMatchers(
100 │   node: ts.Node,
101 │   { sourceFile, reporter, pendingVitestValueImports }: RefactorContext,
102 │ ): ts.Node {
103 │   if (
104 ▶     ts.isPropertyAccessExpression(node) &&
105 │     ts.isIdentifier(node.expression) &&
106 ▶     node.expression.text === 'jasmine'
107 │   ) {
108 │     const matcherName = node.name.text;
109 ▶     if (ASYMMETRIC_MATCHER_NAMES.includes(matcherName)) {
110 ▶       addVitestValueImport(pendingVitestValueImports, 'expect');
111 │       reporter.reportTransformation(
112 │         sourceFile,
113 │         node,
114 │         `Transformed asymmetric matcher \`jasmine.${matcherName}\` to \`expect.${matcherName}\`.`,
115 │       );
116 │ 
117 ▶       return createPropertyAccess('expect', node.name);
118 │     }
119 │   }
120 │ 
121 │   return node;
122 │ }
```

非対称の matcher（`toEqual` の中に置いて「この型なら何でもよい」などを表すもの）の 6 つは、`jasmine.any` の参照を `expect.any` の参照に替えるだけです。参照の式で見つけるので、`toEqual({ id: jasmine.any(Number) })` のような入れ子でも、引数の中でも書き換わります（記録の「08」「09」は通る）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L315–340 （▶ の行: 319–320, 322–323, 328–329, 335）

```ts
315 │ export function transformComplexMatchers(
316 │   node: ts.Node,
317 │   { sourceFile, reporter }: RefactorContext,
318 │ ): ts.Node {
319 ▶   if (
320 ▶     !ts.isCallExpression(node) ||
321 │     !ts.isPropertyAccessExpression(node.expression) ||
322 ▶     node.expression.name.text !== 'toEqual' ||
323 ▶     node.arguments.length !== 1
324 │   ) {
325 │     return node;
326 │   }
327 │ 
328 ▶   const argument = node.arguments[0];
329 ▶   const jasmineMatcherName = getJasmineMethodName(argument);
330 │ 
331 │   if (!jasmineMatcherName) {
332 │     return node;
333 │   }
334 │ 
335 ▶   const expectCall = node.expression.expression;
336 │ 
337 │   let newMatcherName: string | undefined;
338 │   let newArgs: ts.Expression[] | undefined;
339 │   let negate = false;
340 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L341–363 （▶ の行: 342, 345, 348–350, 352, 355, 357–358, 360）

```ts
341 │   switch (jasmineMatcherName) {
342 ▶     case 'truthy':
343 │       newMatcherName = 'toBeTruthy';
344 │       break;
345 ▶     case 'falsy':
346 │       newMatcherName = 'toBeFalsy';
347 │       break;
348 ▶     case 'empty':
349 ▶       newMatcherName = 'toHaveLength';
350 ▶       newArgs = [ts.factory.createNumericLiteral(0)];
351 │       break;
352 ▶     case 'notEmpty':
353 │       newMatcherName = 'toHaveLength';
354 │       newArgs = [ts.factory.createNumericLiteral(0)];
355 ▶       negate = true;
356 │       break;
357 ▶     case 'is':
358 ▶       newMatcherName = 'toBe';
359 │       if (ts.isCallExpression(argument)) {
360 ▶         newArgs = [...argument.arguments];
361 │       }
362 │       break;
363 │   }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L365–391 （▶ の行: 365, 374, 376, 378, 381–382, 385, 387）

```ts
365 ▶   if (newMatcherName) {
366 │     reporter.reportTransformation(
367 │       sourceFile,
368 │       node,
369 │       `Transformed \`.toEqual(jasmine.${jasmineMatcherName}())\` to \`.${newMatcherName}()\`.`,
370 │     );
371 │     let expectExpression = expectCall;
372 │ 
373 │     // Handle cases like `expect(...).not.toEqual(jasmine.notEmpty())`
374 ▶     if (ts.isPropertyAccessExpression(expectCall) && expectCall.name.text === 'not') {
375 │       // The original expression was negated, so flip the negate flag
376 ▶       negate = !negate;
377 │       // Use the expression before the `.not`
378 ▶       expectExpression = expectCall.expression;
379 │     }
380 │ 
381 ▶     if (negate) {
382 ▶       expectExpression = createPropertyAccess(expectExpression, 'not');
383 │     }
384 │ 
385 ▶     const newExpression = createPropertyAccess(expectExpression, newMatcherName);
386 │ 
387 ▶     return ts.factory.createCallExpression(newExpression, undefined, newArgs ?? []);
388 │   }
389 │ 
390 │   return node;
391 │ }
```

`jasmine.truthy()`・`falsy()`・`empty()`・`notEmpty()`・`is(x)` は、322〜323 行目のとおり `toEqual` の**引数そのもの**のときだけ、matcher に置き換えます。`empty()` は 349〜350 行目で `toHaveLength(0)` です。jasmine-core 5.13 の `jasmine.empty()` は文字列・配列なら `length`、`Map`・`Set` なら `size`、オブジェクトなら `Object.keys` を見るので、記録の「12」の `expect({}).toEqual(jasmine.empty())` は Vitest で「expected {} to have property 'length'」でした。

入れ子の `toEqual({ a: jasmine.truthy() })`（記録の「11」）は 323 行目の条件に合わず、そのまま残ります。しかも 6 節の「知らない `jasmine.*` に TODO を付ける」表に `truthy` が「扱い済み」として入っているので、TODO も付きません。Vitest で「jasmine is not defined」、`ng test` で TS2304 でした。3 つの版とも同じです。

## 3. 1 つの文を 2 つに割る：toHaveBeenCalledOnceWith と arrayWithExactContents

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L460–485 （▶ の行: 460, 464, 468, 472, 483–484）

```ts
460 ▶ export function transformCalledOnceWith(
461 │   node: ts.Node,
462 │   { sourceFile, reporter }: RefactorContext,
463 │ ): ts.Node | readonly ts.Node[] {
464 ▶   if (!ts.isExpressionStatement(node)) {
465 │     return node;
466 │   }
467 │ 
468 ▶   const call = node.expression;
469 │   if (
470 │     !ts.isCallExpression(call) ||
471 │     !ts.isPropertyAccessExpression(call.expression) ||
472 ▶     call.expression.name.text !== 'toHaveBeenCalledOnceWith'
473 │   ) {
474 │     return node;
475 │   }
476 │ 
477 │   reporter.reportTransformation(
478 │     sourceFile,
479 │     node,
480 │     'Transformed `.toHaveBeenCalledOnceWith()` to `.toHaveBeenCalledTimes(1)` and `.toHaveBeenCalledWith()`.',
481 │   );
482 │ 
483 ▶   const expectCall = call.expression.expression;
484 ▶   const args = call.arguments;
485 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L486–502 （▶ の行: 486–487, 489, 492–493, 498–500）

```ts
486 ▶   const timesCall = ts.factory.createCallExpression(
487 ▶     createPropertyAccess(expectCall, 'toHaveBeenCalledTimes'),
488 │     undefined,
489 ▶     [ts.factory.createNumericLiteral(1)],
490 │   );
491 │ 
492 ▶   const withCall = ts.factory.createCallExpression(
493 ▶     createPropertyAccess(expectCall, 'toHaveBeenCalledWith'),
494 │     undefined,
495 │     args,
496 │   );
497 │ 
498 ▶   return [
499 ▶     ts.factory.createExpressionStatement(timesCall),
500 ▶     ts.factory.createExpressionStatement(withCall),
501 │   ];
502 │ }
```

`expect(spy).toHaveBeenCalledOnceWith(a)` を `toHaveBeenCalledTimes(1)` と `toHaveBeenCalledWith(a)` の 2 つの文にします。文を割るので、[第 7 回](07-sca-jv-overview.md)の 4 節の「式の文の変換器」で、配列を返します。

483 行目の `expectCall` は `expect(spy).not` でもそのまま使うので、44129f66a3 では `not.toHaveBeenCalledOnceWith(1)` が「1 回ではない、**かつ** 1 で呼ばれていない」の 2 つになり、「1 で 2 回呼んだ」spy（記録の「07」）は Jasmine で通り、変換後に「expected "fn" to not be called with arguments: \[ 1 \]」で落ちました。22.2.7 と main は 3436f92a26（PR #34616）で、否定のときだけ Vitest の `toHaveBeenCalledExactlyOnceWith` を使い、通ります。

もう 1 つ、文の前のコメントが割った 2 つの文の両方に付きます。記録の「30」で `// the spy was called correctly` が 2 回出ました。`test-file-transformer_spec.ts` の `Comment Preservation` の「should preserve comments around a multi-statement transformation」は、この形を期待しないので `skipped: true` で飛ばしてあります（[第 7 回](07-sca-jv-overview.md)の 8 節）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L393–430 （▶ の行: 397, 401, 407, 409, 415–416, 418, 426, 429）

```ts
393 │ export function transformArrayWithExactContents(
394 │   node: ts.Node,
395 │   { sourceFile, reporter }: RefactorContext,
396 │ ): ts.Node | readonly ts.Node[] {
397 ▶   if (
398 │     !ts.isExpressionStatement(node) ||
399 │     !ts.isCallExpression(node.expression) ||
400 │     !ts.isPropertyAccessExpression(node.expression.expression) ||
401 ▶     node.expression.expression.name.text !== 'toEqual' ||
402 │     node.expression.arguments.length !== 1
403 │   ) {
404 │     return node;
405 │   }
406 │ 
407 ▶   const argument = node.expression.arguments[0];
408 │   if (
409 ▶     !isJasmineCallExpression(argument, 'arrayWithExactContents') ||
410 │     argument.arguments.length !== 1
411 │   ) {
412 │     return node;
413 │   }
414 │ 
415 ▶   if (!ts.isArrayLiteralExpression(argument.arguments[0])) {
416 ▶     const category = 'arrayWithExactContents-dynamic-variable';
417 │     reporter.recordTodo(category, sourceFile, node);
418 ▶     addTodoComment(node, category);
419 │ 
420 │     return node;
421 │   }
422 │ 
423 │   reporter.reportTransformation(
424 │     sourceFile,
425 │     node,
426 ▶     'Transformed `jasmine.arrayWithExactContents()` to `.toHaveLength()` and `.toEqual(expect.arrayContaining())`.',
427 │   );
428 │ 
429 ▶   const expectCall = node.expression.expression.expression;
430 │   const arrayLiteral = argument.arguments[0];
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L431–458 （▶ の行: 432–433, 435, 438, 443, 453–455, 457）

```ts
431 │ 
432 ▶   const lengthCall = ts.factory.createCallExpression(
433 ▶     createPropertyAccess(expectCall, 'toHaveLength'),
434 │     undefined,
435 ▶     [ts.factory.createNumericLiteral(arrayLiteral.elements.length)],
436 │   );
437 │ 
438 ▶   const containingCall = ts.factory.createCallExpression(
439 │     createPropertyAccess(expectCall, 'toEqual'),
440 │     undefined,
441 │     [
442 │       ts.factory.createCallExpression(
443 ▶         createPropertyAccess('expect', 'arrayContaining'),
444 │         undefined,
445 │         [arrayLiteral],
446 │       ),
447 │     ],
448 │   );
449 │ 
450 │   const lengthStmt = ts.factory.createExpressionStatement(lengthCall);
451 │   const containingStmt = ts.factory.createExpressionStatement(containingCall);
452 │ 
453 ▶   const category = 'arrayWithExactContents-check';
454 ▶   reporter.recordTodo(category, sourceFile, node);
455 ▶   addTodoComment(lengthStmt, category);
456 │ 
457 ▶   return [lengthStmt, containingStmt];
458 │ }
```

`toEqual(jasmine.arrayWithExactContents([…]))`（順を問わず、同じ要素を同じ数だけ）は、`toHaveLength(要素の数)` と `toEqual(expect.arrayContaining([…]))` に割り、453〜455 行目で TODO を付けます。`arrayContaining` は「含むか」しか見ないので、長さが同じでも `[1, 1, 2]` と `[1, 2, 2]` を区別できない、というのが TODO の文です（7c6a643f94、2025-11）。記録の「14」は通ります。

否定（記録の「29」の `expect([1, 2]).not.toEqual(jasmine.arrayWithExactContents([1, 3]))`）は、44129f66a3 と 22.2.7 では `not.toHaveLength(2)` と `not.toEqual(…)` の 2 つになり、「長さが 2 ではない」が成り立たず落ちました。main と 22.3.0 は 4cb7bb50d5（PR #34691）で TODO にして元の文を残します。

## 4. withContext と expectAsync

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L504–541 （▶ の行: 508, 513, 516, 521, 525, 527, 531, 536–539）

```ts
504 │ export function transformWithContext(
505 │   node: ts.Node,
506 │   { sourceFile, reporter }: RefactorContext,
507 │ ): ts.Node {
508 ▶   if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
509 │     return node;
510 │   }
511 │ 
512 │   // Traverse the chain of property access expressions to find the .withContext() call
513 ▶   let currentExpression: ts.Expression = node.expression;
514 │   const propertyChain: ts.Identifier[] = [];
515 │ 
516 ▶   while (ts.isPropertyAccessExpression(currentExpression)) {
517 │     if (!ts.isIdentifier(currentExpression.name)) {
518 │       // Break if we encounter a private identifier or something else unexpected
519 │       return node;
520 │     }
521 ▶     propertyChain.push(currentExpression.name);
522 │     currentExpression = currentExpression.expression;
523 │   }
524 │ 
525 ▶   const withContextCall = currentExpression;
526 │   // Check if we found a .withContext() call
527 ▶   if (
528 │     !ts.isCallExpression(withContextCall) ||
529 │     !ts.isPropertyAccessExpression(withContextCall.expression) ||
530 │     !ts.isIdentifier(withContextCall.expression.name) ||
531 ▶     withContextCall.expression.name.text !== 'withContext'
532 │   ) {
533 │     return node;
534 │   }
535 │ 
536 ▶   reporter.reportTransformation(
537 ▶     sourceFile,
538 ▶     withContextCall,
539 ▶     'Transformed `.withContext()` to the `expect(..., message)` syntax.',
540 │   );
541 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L542–578 （▶ の行: 542, 544, 547, 549, 552–553, 563–564, 572–573, 577）

```ts
542 ▶   const expectCall = withContextCall.expression.expression;
543 │ 
544 ▶   if (
545 │     !ts.isCallExpression(expectCall) ||
546 │     !ts.isIdentifier(expectCall.expression) ||
547 ▶     expectCall.expression.text !== 'expect'
548 │   ) {
549 ▶     return node;
550 │   }
551 │ 
552 ▶   const contextMessage = withContextCall.arguments[0];
553 ▶   if (!contextMessage) {
554 │     // No message provided, so unwrap the .withContext() call.
555 │     let newChain: ts.Expression = expectCall;
556 │     for (let i = propertyChain.length - 1; i >= 0; i--) {
557 │       newChain = ts.factory.createPropertyAccessExpression(newChain, propertyChain[i]);
558 │     }
559 │ 
560 │     return ts.factory.updateCallExpression(node, newChain, node.typeArguments, node.arguments);
561 │   }
562 │ 
563 ▶   const newExpectArgs = [...expectCall.arguments, contextMessage];
564 ▶   const newExpectCall = ts.factory.updateCallExpression(
565 │     expectCall,
566 │     expectCall.expression,
567 │     expectCall.typeArguments,
568 │     newExpectArgs,
569 │   );
570 │ 
571 │   // Rebuild the property access chain
572 ▶   let newExpression: ts.Expression = newExpectCall;
573 ▶   for (let i = propertyChain.length - 1; i >= 0; i--) {
574 │     newExpression = ts.factory.createPropertyAccessExpression(newExpression, propertyChain[i]);
575 │   }
576 │ 
577 ▶   return ts.factory.updateCallExpression(node, newExpression, node.typeArguments, node.arguments);
578 │ }
```

`expect(x).withContext('m').toBe(1)` は 563 行目で `expect(x, 'm').toBe(1)` にします（Vitest の `expect` の 2 つ目の引数はメッセージ）。516〜523 行目で `.not` などの鎖を覚え、573〜575 行目で付け直します。

536〜540 行目の「変換した」のログは、544〜550 行目で左が `expect` かを確かめる**前**に書かれます。`expectAsync(p).withContext('ctx').toBeResolved()`（記録の「18」）では、`--verbose` は「Transformed \`.withContext()\`…」と出し、実際は何も変えずに 549 行目で戻ります。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L242–257 （▶ の行: 251–255）

```ts
242 │ const ASYNC_MATCHER_CHANGES = new Map<
243 │   string,
244 │   {
245 │     base: 'resolves' | 'rejects';
246 │     matcher: string;
247 │     not?: boolean;
248 │     keepArgs?: boolean;
249 │   }
250 │ >([
251 ▶   ['toBeResolved', { base: 'resolves', matcher: 'toThrow', not: true, keepArgs: false }],
252 ▶   ['toBeResolvedTo', { base: 'resolves', matcher: 'toEqual', keepArgs: true }],
253 ▶   ['toBeRejected', { base: 'rejects', matcher: 'toThrow', keepArgs: false }],
254 ▶   ['toBeRejectedWith', { base: 'rejects', matcher: 'toEqual', keepArgs: true }],
255 ▶   ['toBeRejectedWithError', { base: 'rejects', matcher: 'toThrowError', keepArgs: true }],
256 │ ]);
257 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L258–297 （▶ の行: 262–265, 272, 274, 279, 287–288, 290, 293, 295）

```ts
258 │ export function transformExpectAsync(
259 │   node: ts.Node,
260 │   { sourceFile, reporter }: RefactorContext,
261 │ ): ts.Node {
262 ▶   if (
263 ▶     !ts.isCallExpression(node) ||
264 ▶     !ts.isPropertyAccessExpression(node.expression) ||
265 ▶     !ts.isCallExpression(node.expression.expression)
266 │   ) {
267 │     return node;
268 │   }
269 │ 
270 │   const matcherCall = node;
271 │   const matcherPae = node.expression;
272 ▶   const expectCall = node.expression.expression;
273 │ 
274 ▶   if (!ts.isIdentifier(expectCall.expression) || expectCall.expression.text !== 'expectAsync') {
275 │     return node;
276 │   }
277 │ 
278 │   const matcherName = ts.isIdentifier(matcherPae.name) ? matcherPae.name.text : undefined;
279 ▶   const mapping = matcherName ? ASYNC_MATCHER_CHANGES.get(matcherName) : undefined;
280 │ 
281 │   if (mapping) {
282 │     reporter.reportTransformation(
283 │       sourceFile,
284 │       node,
285 │       `Transformed \`expectAsync(...).${matcherName}\` to \`expect(...).${mapping.base}.${mapping.matcher}\`.`,
286 │     );
287 ▶     const newExpectCall = createExpectCallExpression([expectCall.arguments[0]]);
288 ▶     let newMatcherChain: ts.Expression = createPropertyAccess(newExpectCall, mapping.base);
289 │ 
290 ▶     if (mapping.not) {
291 │       newMatcherChain = createPropertyAccess(newMatcherChain, 'not');
292 │     }
293 ▶     newMatcherChain = createPropertyAccess(newMatcherChain, mapping.matcher);
294 │ 
295 ▶     const newMatcherArgs = mapping.keepArgs ? [...matcherCall.arguments] : [];
296 │ 
297 │     return ts.factory.createCallExpression(newMatcherChain, undefined, newMatcherArgs);
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L298–313 （▶ の行: 300–301, 305–306, 308）

```ts
298 │   }
299 │ 
300 ▶   if (matcherName) {
301 ▶     if (matcherName === 'toBePending') {
302 │       const category = 'toBePending';
303 │       reporter.recordTodo(category, sourceFile, node);
304 │       addTodoComment(node, category);
305 ▶     } else {
306 ▶       const category = 'unsupported-expect-async-matcher';
307 │       reporter.recordTodo(category, sourceFile, node);
308 ▶       addTodoComment(node, category, { name: matcherName });
309 │     }
310 │   }
311 │ 
312 │   return node;
313 │ }
```

`expectAsync(p).名前(…)` は 251〜255 行目の表で `expect(p).resolves.…`・`expect(p).rejects.…` にします。264〜265 行目は「`名前` の左がすぐ `expectAsync(…)` の呼び出し」の形しか見ません。

- 記録の「18」の `expectAsync(p).withContext('ctx').toBeResolved()` は、外側の `toBeResolved` の左が `withContext(…)` なので 274 行目で外れ、内側の `withContext` の呼び出しのほうが 300〜309 行目で「Unsupported expectAsync matcher ".withContext()" found.」の TODO になりました。matcher ではないものを matcher と呼ぶ文です。
- 記録の「19」の `expectAsync(p).not.toBeRejectedWithError(TypeError, 'b')` は、左が `.not` なので 265 行目で外れ、内側の `.not` は参照で呼び出しではないので 300 行目にも来ません。TODO の無いまま残り、Vitest で「expectAsync is not defined」でした。3 つの版とも同じで、TODO を付ける PR #34619 が 2026-11-27 の時点で開いています。
- 否定でない `toBeRejectedWithError(TypeError, 'b')` は 255 行目で `rejects.toThrowError(TypeError, 'b')` になります。1 節の「20」と同じく、Vitest は 2 つ目の引数を見ません。

## 5. spy の順・DOM・nullish・nothing

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L124–158 （▶ の行: 131, 137, 141–143, 146, 156–157）

```ts
124 │ export function transformToHaveBeenCalledBefore(
125 │   node: ts.Node,
126 │   { sourceFile, reporter }: RefactorContext,
127 │ ): ts.Node {
128 │   if (
129 │     !ts.isCallExpression(node) ||
130 │     !ts.isPropertyAccessExpression(node.expression) ||
131 ▶     node.arguments.length !== 1
132 │   ) {
133 │     return node;
134 │   }
135 │ 
136 │   const pae = node.expression;
137 ▶   const matcherName = pae.name.text;
138 │   let isNegated = false;
139 │ 
140 │   let expectExpression = pae.expression;
141 ▶   if (ts.isPropertyAccessExpression(expectExpression) && expectExpression.name.text === 'not') {
142 ▶     isNegated = true;
143 ▶     expectExpression = expectExpression.expression;
144 │   }
145 │ 
146 ▶   if (!ts.isCallExpression(expectExpression) || matcherName !== 'toHaveBeenCalledBefore') {
147 │     return node;
148 │   }
149 │ 
150 │   reporter.reportTransformation(
151 │     sourceFile,
152 │     node,
153 │     'Transformed `toHaveBeenCalledBefore` to a Vitest-compatible spy invocation order comparison.',
154 │   );
155 │ 
156 ▶   const [spyB] = node.arguments;
157 ▶   const [spyA] = expectExpression.arguments;
158 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L159–184 （▶ の行: 159–161, 167, 170–172, 176–177, 179, 182）

```ts
159 ▶   const createInvocationOrderAccess = (spyIdentifier: ts.Expression) => {
160 ▶     const mockedSpy = ts.factory.createCallExpression(
161 ▶       createPropertyAccess('vi', 'mocked'),
162 │       undefined,
163 │       [spyIdentifier],
164 │     );
165 │     const mockProperty = createPropertyAccess(mockedSpy, 'mock');
166 │ 
167 ▶     return createPropertyAccess(mockProperty, 'invocationCallOrder');
168 │   };
169 │ 
170 ▶   const createMinCall = (spyIdentifier: ts.Expression) => {
171 ▶     return ts.factory.createCallExpression(createPropertyAccess('Math', 'min'), undefined, [
172 ▶       ts.factory.createSpreadElement(createInvocationOrderAccess(spyIdentifier)),
173 │     ]);
174 │   };
175 │ 
176 ▶   const newExpect = createExpectCallExpression([createMinCall(spyA)]);
177 ▶   const newMatcherName = isNegated ? 'toBeGreaterThanOrEqual' : 'toBeLessThan';
178 │ 
179 ▶   return ts.factory.createCallExpression(
180 │     createPropertyAccess(newExpect, newMatcherName),
181 │     undefined,
182 ▶     [createMinCall(spyB)],
183 │   );
184 │ }
```

`expect(a).toHaveBeenCalledBefore(b)` は、`vi.mocked(a).mock.invocationCallOrder`（呼ばれた通し番号の配列）の最小を比べる `expect(Math.min(...)).toBeLessThan(Math.min(...))` にします（記録の「21」は通る）。161 行目で `vi` を使いますが、44129f66a3 は `vi` を値の import の候補に足さないので、`--add-imports` のときに import が抜けます。22.2.7 と main は d088411806（PR #34670）で足します。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L186–217 （▶ の行: 193, 203–204, 208, 212）

```ts
186 │ export function transformToHaveClass(
187 │   node: ts.Node,
188 │   { sourceFile, reporter }: RefactorContext,
189 │ ): ts.Node {
190 │   if (
191 │     !ts.isCallExpression(node) ||
192 │     !ts.isPropertyAccessExpression(node.expression) ||
193 ▶     node.arguments.length !== 1
194 │   ) {
195 │     return node;
196 │   }
197 │ 
198 │   const pae = node.expression;
199 │   const matcherName = pae.name.text;
200 │   let isNegated = false;
201 │ 
202 │   let expectExpression = pae.expression;
203 ▶   if (ts.isPropertyAccessExpression(expectExpression) && expectExpression.name.text === 'not') {
204 ▶     isNegated = true;
205 │     expectExpression = expectExpression.expression;
206 │   }
207 │ 
208 ▶   if (matcherName !== 'toHaveClass' || !ts.isCallExpression(expectExpression)) {
209 │     return node;
210 │   }
211 │ 
212 ▶   reporter.reportTransformation(
213 │     sourceFile,
214 │     node,
215 │     'Transformed `.toHaveClass()` to a `classList.contains()` check.',
216 │   );
217 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L218–240 （▶ の行: 218, 221–223, 230–231, 235, 237）

```ts
218 ▶   const [className] = node.arguments;
219 │   const newExpectArgs: ts.Expression[] = [];
220 │ 
221 ▶   const [element] = expectExpression.arguments;
222 ▶   const classListContains = ts.factory.createCallExpression(
223 ▶     createPropertyAccess(createPropertyAccess(element, 'classList'), 'contains'),
224 │     undefined,
225 │     [className],
226 │   );
227 │   newExpectArgs.push(classListContains);
228 │ 
229 │   // Pass the context message from withContext to the new expect call
230 ▶   if (expectExpression.arguments.length > 1) {
231 ▶     newExpectArgs.push(expectExpression.arguments[1]);
232 │   }
233 │ 
234 │   const newExpect = createExpectCallExpression(newExpectArgs);
235 ▶   const newMatcher = isNegated ? ts.factory.createFalse() : ts.factory.createTrue();
236 │ 
237 ▶   return ts.factory.createCallExpression(createPropertyAccess(newExpect, 'toBe'), undefined, [
238 │     newMatcher,
239 │   ]);
240 │ }
```

`toHaveClass('x')` は `expect(el.classList.contains('x')).toBe(true)` です。230〜232 行目は、先に 4 節の `withContext` が足した 2 つ目の引数（メッセージ）を引き継ぎます。`--browser-mode` のときは[第 7 回](07-sca-jv-overview.md)の 4 節の 231 行目でこの変換器ごと飛ばし、Vitest の browser mode の `toHaveClass` に任せます（36cf3afb48。option の名前の綴りの誤りで効いていなかったのを 21cb6284df が 2026-06 に直した）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L620–645 （▶ の行: 627, 637, 642）

```ts
620 │ export function transformToBeNullish(
621 │   node: ts.Node,
622 │   { sourceFile, reporter }: RefactorContext,
623 │ ): ts.Node {
624 │   if (
625 │     !ts.isCallExpression(node) ||
626 │     !ts.isPropertyAccessExpression(node.expression) ||
627 ▶     node.arguments.length !== 0
628 │   ) {
629 │     return node;
630 │   }
631 │ 
632 │   const pae = node.expression;
633 │   const matcherName = pae.name.text;
634 │   let isNegated = false;
635 │ 
636 │   let expectExpression = pae.expression;
637 ▶   if (ts.isPropertyAccessExpression(expectExpression) && expectExpression.name.text === 'not') {
638 │     isNegated = true;
639 │     expectExpression = expectExpression.expression;
640 │   }
641 │ 
642 ▶   if (matcherName !== 'toBeNullish' || !ts.isCallExpression(expectExpression)) {
643 │     return node;
644 │   }
645 │ 
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L646–666 （▶ の行: 652, 654–656, 660–661, 663）

```ts
646 │   reporter.reportTransformation(
647 │     sourceFile,
648 │     node,
649 │     'Transformed `.toBeNullish()` to a `element == null` check.',
650 │   );
651 │ 
652 ▶   const element = expectExpression.arguments[0];
653 │ 
654 ▶   const nullCheckExpression = ts.factory.createBinaryExpression(
655 ▶     element,
656 ▶     ts.SyntaxKind.EqualsEqualsToken,
657 │     ts.factory.createNull(),
658 │   );
659 │ 
660 ▶   const newExpect = createExpectCallExpression([nullCheckExpression]);
661 ▶   const newMatcher = isNegated ? ts.factory.createFalse() : ts.factory.createTrue();
662 │ 
663 ▶   return ts.factory.createCallExpression(createPropertyAccess(newExpect, 'toBe'), undefined, [
664 │     newMatcher,
665 │   ]);
666 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher.ts` L580–618 （▶ の行: 593, 603, 609, 613–615, 617）

```ts
580 │ export function transformExpectNothing(
581 │   node: ts.Node,
582 │   { sourceFile, reporter }: RefactorContext,
583 │ ): ts.Node {
584 │   if (!ts.isExpressionStatement(node)) {
585 │     return node;
586 │   }
587 │ 
588 │   const call = node.expression;
589 │   if (
590 │     !ts.isCallExpression(call) ||
591 │     !ts.isPropertyAccessExpression(call.expression) ||
592 │     !ts.isIdentifier(call.expression.name) ||
593 ▶     call.expression.name.text !== 'nothing'
594 │   ) {
595 │     return node;
596 │   }
597 │ 
598 │   const expectCall = call.expression.expression;
599 │   if (
600 │     !ts.isCallExpression(expectCall) ||
601 │     !ts.isIdentifier(expectCall.expression) ||
602 │     expectCall.expression.text !== 'expect' ||
603 ▶     expectCall.arguments.length > 0
604 │   ) {
605 │     return node;
606 │   }
607 │ 
608 │   // The statement is `expect().nothing()`, which can be removed.
609 ▶   const replacement = ts.factory.createEmptyStatement();
610 │ 
611 │   reporter.reportTransformation(sourceFile, node, 'Removed `expect().nothing()` statement.');
612 │   const category = 'expect-nothing';
613 ▶   reporter.recordTodo(category, sourceFile, node);
614 ▶   addTodoComment(replacement, category);
615 ▶   addCommentedNodeText(replacement, node);
616 │ 
617 ▶   return replacement;
618 │ }
```

`toBeNullish()` は `expect(x == null).toBe(true)`、`expect().nothing()` は空の文に TODO と元の字面のコメントを付けます（記録の「22」「23」は通る）。

## 6. jasmine.clock・fail・設定・知らない jasmine.\*

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L24–53 （▶ の行: 36, 41–43, 45–46, 48–49, 51–52）

```ts
24 │ export function transformTimerMocks(node: ts.Node, ctx: RefactorContext): ts.Node {
25 │   const { sourceFile, reporter, pendingVitestValueImports } = ctx;
26 │   if (
27 │     !ts.isCallExpression(node) ||
28 │     !ts.isPropertyAccessExpression(node.expression) ||
29 │     !ts.isIdentifier(node.expression.name)
30 │   ) {
31 │     return node;
32 │   }
33 │ 
34 │   const pae = node.expression;
35 │   const clockCall = pae.expression;
36 ▶   if (!isJasmineCallExpression(clockCall, 'clock')) {
37 │     return node;
38 │   }
39 │ 
40 │   let newMethodName: string | undefined;
41 ▶   switch (pae.name.text) {
42 ▶     case 'install':
43 ▶       newMethodName = 'useFakeTimers';
44 │       break;
45 ▶     case 'tick':
46 ▶       newMethodName = 'advanceTimersByTime';
47 │       break;
48 ▶     case 'uninstall':
49 ▶       newMethodName = 'useRealTimers';
50 │       break;
51 ▶     case 'mockDate':
52 ▶       newMethodName = 'setSystemTime';
53 │       break;
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L54–91 （▶ の行: 54, 61, 70–71, 78–79, 81–82, 87）

```ts
54 ▶     case 'autoTick': {
55 │       const category = 'clockAutoTick';
56 │       reporter.recordTodo(category, sourceFile, node);
57 │       addTodoComment(node, category);
58 │ 
59 │       return node;
60 │     }
61 ▶     case 'withMock': {
62 │       const category = 'clockWithMock';
63 │       reporter.recordTodo(category, sourceFile, node);
64 │       addTodoComment(node, category);
65 │ 
66 │       return node;
67 │     }
68 │   }
69 │ 
70 ▶   if (newMethodName) {
71 ▶     addVitestValueImport(pendingVitestValueImports, 'vi');
72 │     reporter.reportTransformation(
73 │       sourceFile,
74 │       node,
75 │       `Transformed \`jasmine.clock().${pae.name.text}\` to \`vi.${newMethodName}\`.`,
76 │     );
77 │     let newArgs: readonly ts.Expression[] = node.arguments;
78 ▶     if (newMethodName === 'useFakeTimers') {
79 ▶       newArgs = [];
80 │     }
81 ▶     if (newMethodName === 'setSystemTime' && node.arguments.length === 0) {
82 ▶       newArgs = [
83 │         ts.factory.createNewExpression(ts.factory.createIdentifier('Date'), undefined, []),
84 │       ];
85 │     }
86 │ 
87 ▶     return createViCallExpression(ctx, newMethodName, newArgs);
88 │   }
89 │ 
90 │   return node;
91 │ }
```

`jasmine.clock().install()`・`tick(n)`・`uninstall()`・`mockDate(d)` は `vi.useFakeTimers()`・`vi.advanceTimersByTime(n)`・`vi.useRealTimers()`・`vi.setSystemTime(d)` です（記録の「25」は通る）。81〜85 行目は引数の無い `mockDate()` に `new Date()` を入れます（32da5a86f5、issue #31940）。36 行目は `jasmine.clock()` の呼び出しが直前にある形だけを見るので、`const clock = jasmine.clock(); clock.tick(10)` は変換されません。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L93–124 （▶ の行: 100, 102, 105, 110–111, 113, 117–118, 122）

```ts
 93 │ export function transformFail(
 94 │   node: ts.Node,
 95 │   { sourceFile, reporter, pendingVitestValueImports }: RefactorContext,
 96 │ ): ts.Node {
 97 │   if (
 98 │     ts.isCallExpression(node) &&
 99 │     ts.isIdentifier(node.expression) &&
100 ▶     node.expression.text === 'fail'
101 │   ) {
102 ▶     addVitestValueImport(pendingVitestValueImports, 'expect');
103 │     reporter.reportTransformation(sourceFile, node, 'Transformed `fail()` to `expect.fail()`.');
104 │ 
105 ▶     const arg = node.arguments[0];
106 │     let replacementArg: ts.Expression | undefined = arg;
107 │     let hasNonStringArg = false;
108 │ 
109 │     if (arg) {
110 ▶       if (ts.isNewExpression(arg)) {
111 ▶         replacementArg = arg.arguments && arg.arguments.length > 0 ? arg.arguments[0] : undefined;
112 │       } else if (
113 ▶         !ts.isStringLiteral(arg) &&
114 │         !ts.isNoSubstitutionTemplateLiteral(arg) &&
115 │         !ts.isTemplateExpression(arg)
116 │       ) {
117 ▶         replacementArg = ts.factory.createCallExpression(
118 ▶           ts.factory.createIdentifier('String'),
119 │           undefined,
120 │           [arg],
121 │         );
122 ▶         hasNonStringArg = true;
123 │       }
124 │     }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L125–145 （▶ の行: 126–128, 135–136, 141）

```ts
125 │ 
126 ▶     const replacement = ts.factory.createCallExpression(
127 ▶       ts.factory.createPropertyAccessExpression(
128 ▶         ts.factory.createIdentifier('expect'),
129 │         ts.factory.createIdentifier('fail'),
130 │       ),
131 │       undefined,
132 │       replacementArg ? [replacementArg] : [],
133 │     );
134 │ 
135 ▶     if (hasNonStringArg) {
136 ▶       const category = 'fail-non-string-argument';
137 │       reporter.recordTodo(category, sourceFile, node);
138 │       addTodoComment(replacement, category);
139 │     }
140 │ 
141 ▶     return ts.setOriginalNode(ts.setTextRange(replacement, node), node);
142 │   }
143 │ 
144 │   return node;
145 │ }
```

`fail(x)` は `expect.fail(x)` です。`new Error('m')` なら 111 行目で中の `'m'` を、文字列でなければ 117 行目で `String(x)` に包んで TODO です。前は `throw new Error(…)` にしていたのを、ce1b60f896（2026-08、issue #33864「refactors fail() call incorrectly」）が替えました。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L147–166 （▶ の行: 151, 153, 157, 159, 161, 164–165）

```ts
147 │ export function transformJasmineMembers(node: ts.Node, refactorCtx: RefactorContext): ts.Node {
148 │   const { sourceFile, reporter } = refactorCtx;
149 │ 
150 │   if (
151 ▶     ts.isExpressionStatement(node) &&
152 │     ts.isBinaryExpression(node.expression) &&
153 ▶     node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
154 │   ) {
155 │     const assignment = node.expression;
156 │     if (
157 ▶       ts.isPropertyAccessExpression(assignment.left) &&
158 │       ts.isIdentifier(assignment.left.expression) &&
159 ▶       assignment.left.expression.text === 'jasmine'
160 │     ) {
161 ▶       const memberName = assignment.left.name.text;
162 │ 
163 │       switch (memberName) {
164 ▶         case 'DEFAULT_TIMEOUT_INTERVAL':
165 ▶           return transformJasmineDefaultTimeoutInterval(node, assignment.right, refactorCtx);
166 │         case 'MAX_PRETTY_PRINT_ARRAY_LENGTH':
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L167–188 （▶ の行: 167–169, 176, 178–179）

```ts
167 ▶         case 'MAX_PRETTY_PRINT_DEPTH':
168 ▶         case 'MAX_PRETTY_PRINT_CHARS': {
169 ▶           const replacement = ts.factory.createEmptyStatement();
170 │ 
171 │           reporter.reportTransformation(
172 │             sourceFile,
173 │             node,
174 │             `Removed \`${memberName}\` member assignment.`,
175 │           );
176 ▶           const category = 'unsupported-jasmine-member';
177 │           reporter.recordTodo(category, sourceFile, node);
178 ▶           addTodoComment(replacement, category, { name: memberName });
179 ▶           addCommentedNodeText(replacement, node);
180 │ 
181 │           return replacement;
182 │         }
183 │       }
184 │     }
185 │   }
186 │ 
187 │   return node;
188 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L190–210 （▶ の行: 196, 202, 204, 209）

```ts
190 │ function transformJasmineDefaultTimeoutInterval(
191 │   expression: ts.ExpressionStatement,
192 │   timeoutValue: ts.Expression,
193 │   ctx: RefactorContext,
194 │ ): ts.Node {
195 │   const { sourceFile, reporter, pendingVitestValueImports } = ctx;
196 ▶   addVitestValueImport(pendingVitestValueImports, 'vi');
197 │   reporter.reportTransformation(
198 │     sourceFile,
199 │     expression,
200 │     'Transformed `jasmine.DEFAULT_TIMEOUT_INTERVAL` to `vi.setConfig()`.',
201 │   );
202 ▶   const setConfigCall = createViCallExpression(ctx, 'setConfig', [
203 │     ts.factory.createObjectLiteralExpression(
204 ▶       [ts.factory.createPropertyAssignment('testTimeout', timeoutValue)],
205 │       false,
206 │     ),
207 │   ]);
208 │ 
209 ▶   return ts.factory.updateExpressionStatement(expression, setConfigCall);
210 │ }
```

`jasmine.DEFAULT_TIMEOUT_INTERVAL = n` の代入の文は、`vi.setConfig({ testTimeout: n })` の文にします。記録はファイルの先頭で `4000` にし、Vitest の設定の `testTimeout` を 2000 にしたうえで 2.5 秒待つ it（「27」）を置きました。変換後も通ったので、ファイルの先頭の `vi.setConfig` はそのファイルの it に効いています。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L212–248 （▶ の行: 212–217, 233–235, 243–244）

```ts
212 ▶ const UNSUPPORTED_GLOBAL_FUNCTION_CATEGORIES = new Set<TodoCategory>([
213 ▶   'setSpecProperty',
214 ▶   'setSuiteProperty',
215 ▶   'throwUnless',
216 ▶   'throwUnlessAsync',
217 ▶   'getSpecProperty',
218 │ ]);
219 │ 
220 │ // A type guard to ensure that the methodName is one of the categories handled by this transformer.
221 │ function isUnsupportedGlobalFunction(
222 │   methodName: string,
223 │ ): methodName is
224 │   'setSpecProperty' | 'setSuiteProperty' | 'throwUnless' | 'throwUnlessAsync' | 'getSpecProperty' {
225 │   return UNSUPPORTED_GLOBAL_FUNCTION_CATEGORIES.has(methodName as TodoCategory);
226 │ }
227 │ 
228 │ export function transformUnsupportedGlobalFunctions(
229 │   node: ts.Node,
230 │   { sourceFile, reporter }: RefactorContext,
231 │ ): ts.Node {
232 │   if (
233 ▶     ts.isCallExpression(node) &&
234 ▶     ts.isIdentifier(node.expression) &&
235 ▶     isUnsupportedGlobalFunction(node.expression.text)
236 │   ) {
237 │     const functionName = node.expression.text;
238 │     reporter.reportTransformation(
239 │       sourceFile,
240 │       node,
241 │       `Found unsupported global function \`${functionName}\`.`,
242 │     );
243 ▶     reporter.recordTodo(functionName, sourceFile, node);
244 ▶     addTodoComment(node, functionName);
245 │   }
246 │ 
247 │   return node;
248 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L250–272 （▶ の行: 250–257）

```ts
250 ▶ const UNSUPPORTED_JASMINE_CALLS_CATEGORIES = new Set<TodoCategory>([
251 ▶   'addMatchers',
252 ▶   'addAsyncMatchers',
253 ▶   'addCustomEqualityTester',
254 ▶   'addCustomObjectFormatter',
255 ▶   'mapContaining',
256 ▶   'setContaining',
257 ▶   'addSpyStrategy',
258 │ ]);
259 │ 
260 │ // A type guard to ensure that the methodName is one of the categories handled by this transformer.
261 │ function isUnsupportedJasmineCall(
262 │   methodName: string,
263 │ ): methodName is
264 │   | 'addMatchers'
265 │   | 'addAsyncMatchers'
266 │   | 'addCustomEqualityTester'
267 │   | 'addCustomObjectFormatter'
268 │   | 'mapContaining'
269 │   | 'setContaining'
270 │   | 'addSpyStrategy' {
271 │   return UNSUPPORTED_JASMINE_CALLS_CATEGORIES.has(methodName as TodoCategory);
272 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L274–291 （▶ の行: 278, 280, 286–287）

```ts
274 │ export function transformUnsupportedJasmineCalls(
275 │   node: ts.Node,
276 │   { sourceFile, reporter }: RefactorContext,
277 │ ): ts.Node {
278 ▶   const methodName = getJasmineMethodName(node);
279 │ 
280 ▶   if (methodName && isUnsupportedJasmineCall(methodName)) {
281 │     reporter.reportTransformation(
282 │       sourceFile,
283 │       node,
284 │       `Found unsupported call \`jasmine.${methodName}\`.`,
285 │     );
286 ▶     reporter.recordTodo(methodName, sourceFile, node);
287 ▶     addTodoComment(node, methodName);
288 │   }
289 │ 
290 │   return node;
291 │ }
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L293–324 （▶ の行: 293–294, 309–312）

```ts
293 ▶ // If any additional properties are added to transforms, they should also be added to this list.
294 ▶ const HANDLED_JASMINE_PROPERTIES = new Set([
295 │   // Spies
296 │   'createSpy',
297 │   'createSpyObj',
298 │   'spyOnAllFunctions',
299 │   'addSpyStrategy',
300 │   // Clock
301 │   'clock',
302 │   // Matchers
303 │   'any',
304 │   'anything',
305 │   'stringMatching',
306 │   'objectContaining',
307 │   'arrayContaining',
308 │   'arrayWithExactContents',
309 ▶   'truthy',
310 ▶   'falsy',
311 ▶   'empty',
312 ▶   'notEmpty',
313 │   'mapContaining',
314 │   'setContaining',
315 │   // Other
316 │   'DEFAULT_TIMEOUT_INTERVAL',
317 │   'MAX_PRETTY_PRINT_ARRAY_LENGTH',
318 │   'MAX_PRETTY_PRINT_DEPTH',
319 │   'MAX_PRETTY_PRINT_CHARS',
320 │   'addMatchers',
321 │   'addAsyncMatchers',
322 │   'addCustomEqualityTester',
323 │   'addCustomObjectFormatter',
324 │ ]);
```

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-misc.ts` L326–349 （▶ の行: 330–333, 336, 342–344）

```ts
326 │ export function transformUnknownJasmineProperties(
327 │   node: ts.Node,
328 │   { sourceFile, reporter }: RefactorContext,
329 │ ): ts.Node {
330 ▶   if (
331 ▶     ts.isPropertyAccessExpression(node) &&
332 ▶     ts.isIdentifier(node.expression) &&
333 ▶     node.expression.text === 'jasmine'
334 │   ) {
335 │     const propName = node.name.text;
336 ▶     if (!HANDLED_JASMINE_PROPERTIES.has(propName)) {
337 │       reporter.reportTransformation(
338 │         sourceFile,
339 │         node,
340 │         `Found unknown jasmine property \`jasmine.${propName}\`.`,
341 │       );
342 ▶       const category = 'unknown-jasmine-property';
343 ▶       reporter.recordTodo(category, sourceFile, node);
344 ▶       addTodoComment(node, category, { name: propName });
345 │     }
346 │   }
347 │ 
348 │   return node;
349 │ }
```

最後の網が `transformUnknownJasmineProperties` です。参照の式 `jasmine.名前` の名前が 294〜324 行目の「扱い済み」の表に無ければ TODO を付けます。293 行目のコメントは「変換を足したら、この表にも足すこと」です。ところが表の `truthy`・`falsy`・`empty`・`notEmpty`（309〜312 行目）は、2 節のとおり `toEqual` の引数そのもののときしか変換されません。入れ子のときは「扱い済み」として網を抜け、TODO の無い `jasmine.truthy()` が残ります（記録の「11」）。`clock`（301 行目）も同じで、上の `const clock = jasmine.clock()` は TODO が付きません。逆に表に無い `is` は、入れ子のときだけ TODO が付きます。

> **🧪 DEMO — matcher の spec を Jasmine で走らせ、変換して Vitest で走らせた記録**
>
> it を選ぶと、元の Jasmine の書き方と、選んだ版の変換器の出力、各版の Vitest の結果を見られます。下線の付いたボタンは Jasmine と結果が違った it です。「ng test の型のエラー」は 22.3.0（main と同じ中身）で変換して `ng test` したときに、その it の中で出たものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sca-jv-matcher)

## 7. テストと直し方

| spec | describe（行） | 固めている約束 |
| --- | --- | --- |
| `transformers/jasmine-matcher_spec.ts` | `transformAsymmetricMatchers`（11）・`transformExpectAsync`（52）・`transformCalledOnceWith`（106）・`transformSyntacticSugarMatchers`（125）・`transformComplexMatchers`（174）・`transformArrayWithExactContents`（220）・`transformExpectNothing`（263）・`transformWithContext`（290）・`transformtoHaveBeenCalledBefore`（316）・`transformToHaveClass`（339）・`transformToBeNullish`（360） | 1〜5 節。`toHaveSize` は配列の例（148〜151）、`jasmine.empty()` は `[]` の例（187〜189）だけ |
| `transformers/jasmine-misc_spec.ts` | `transformTimerMocks`（11）・`transformFail`（59）・`transformJasmineMembers`（97）・`transformUnsupportedJasmineCalls`（131）・`transformUnknownJasmineProperties`（236）・`transformUnsupportedGlobalFunctions`（258） | 6 節 |

📄 `走らせたコマンド（2026-11-27）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/schematics/angular:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=^(Jasmine to Vitest Transformer - (transformAsymmetricMatchers|transformTimerMocks)|transform(ExpectAsync|CalledOnceWith|SyntacticSugarMatchers|ComplexMatchers|ArrayWithExactContents|ExpectNothing|WithContext|toHaveBeenCalledBefore|ToHaveClass|ToBeNullish|Fail|JasmineMembers|UnsupportedJasmineCalls|UnknownJasmineProperties|UnsupportedGlobalFunctions))"
（結果は下の段落）
```

手元の bazel でこの 17 の describe は 71 specs・0 failures でした。spec の入力は配列（`[]`・`myArray`）の例だけなので、1・2 節のオブジェクトの食い違いは spec では出ません。

直すとしたら、`toHaveSize` と `jasmine.empty()` は値の種類が静的に分からないので、jasmine-matcher.ts の 43 行目・349 行目で TODO を足すか、`Object.keys` も数える書き方にします。入れ子の `jasmine.truthy()` などは、jasmine-misc.ts の 309〜312 行目の表から外せば 330〜345 行目の TODO が付きます（`toEqual` の引数そのもののときは、先に 2 節の変換器が置き換えるので影響しない）。否定の `expectAsync` は 265 行目で `.not` を 1 つ飛ばして見るか、PR #34619 の形で TODO にします。`toThrowError(型, 文)` は、`transformSyntacticSugarMatchers` の 73 行目の前に「引数が 2 つの `toThrowError`」の TODO を足すのが小さい直し方です。どれも各 describe の表に 1 行ずつ足します。

## 聞かれそうな質問

**Q. `toHaveSize` を `toHaveLength` にして困るのは？**

Jasmine はオブジェクトのキーの数も数えますが、Vitest の `toHaveLength` は `length` を見ます。jasmine-matcher.ts の 43 行目で名前だけを替えるので、オブジェクトに使った it は「to have property 'length'」で落ちます（記録の「04」）。

**Q. `jasmine.any(Number)` が入れ子でも直るのに、`jasmine.truthy()` が入れ子で直らないのはなぜ？**

`jasmine.any` は 104〜118 行目で参照の式ごとに `expect.any` に替えます。`jasmine.truthy()` は対応する非対称の matcher が Vitest に無いので、322〜323 行目で `toEqual` の引数そのもののときだけ matcher に替えます。入れ子は残り、jasmine-misc.ts の 309 行目で「扱い済み」なので TODO も付きません。

**Q. `not.toHaveBeenCalledOnceWith` はどうなる？**

44129f66a3 では 486〜501 行目で 2 つの否定に割り、意味が「どちらでもない」に変わります（記録の「07」）。22.2.7 からは `not.toHaveBeenCalledExactlyOnceWith` の 1 文です。

**Q. `expectAsync` のどれが残る？**

264〜265 行目は「matcher の左がすぐ `expectAsync(…)`」の形だけを見ます。間に `.not` か `.withContext(…)` があると変換されません。`withContext` は 300〜309 行目で TODO になり、`.not` は TODO も付きません（記録の「18」「19」）。

**Q. `fail()` は何になる？**

jasmine-misc.ts の 126〜133 行目で `expect.fail(…)` です。`new Error('m')` は `'m'` を取り出し、変数などは `String(…)` に包んで TODO です。

## 読み終えて

- matcher の多くは名前と引数の置き換えで、値の種類（配列かオブジェクトか）は見ない。`toHaveSize` と `jasmine.empty()` はオブジェクトで意味が変わる。
- 文を 2 つに割る変換は、否定と前のコメントで崩れる。否定は 22.2.7 以降で順に直った。
- 形の決まった所しか見ない変換器（`expectAsync` の直後、`toEqual` の引数そのもの、`jasmine.clock()` の直後）は、少し形が違うと TODO も無く残る。
- 最後の網の「扱い済み」の表が、部分的にしか扱っていない名前まで含むので、網を抜ける。

---

← 前: [Jasmine から Vitest へ（2）：spy と型](08-sca-jv-spy.md)  
次: [Jasmine から Vitest へ（4）：lifecycle と fakeAsync](10-sca-jv-lifecycle.md) →
