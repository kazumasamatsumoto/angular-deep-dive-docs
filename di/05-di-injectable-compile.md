[目次](../README.md) › [DI の内側](README.md) › 第 5 回 / 全 16 回

# @Injectable と @Service が ɵprov になるまで：providedIn・useFactory・autoProvided

> ngtsc の InjectableDecoratorHandler と ServiceDecoratorHandler が何を読み（@Service はコンストラクタ注入を禁止する）、compiler の compileInjectable / compileService が ɵɵdefineInjectable({token, factory, providedIn}) をどう組み立てるか。useClass / useFactory / useValue / useExisting をデコレータに書いたときの factory の違い、ɵɵdefineService が providedIn を root にする行、ɵprov が無いクラスを provider に書いたときの getUndecoratedInjectableFactory。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/di-injectable-compile)

---

`@Injectable({ providedIn: 'root' })` を付けたクラスには、コンパイル後に `static ɵfac` と `static ɵprov` の 2 つが付きます。ɵfac は[第 4 回](04-di-factory.md)で読んだ「new する関数」、ɵprov は「どの注入器に、どの factory で入るか」を書いた定義です。この章では ngtsc の `InjectableDecoratorHandler` と `ServiceDecoratorHandler` がデコレータの何を読み、compiler の `compileInjectable` / `compileService` が ɵprov の `factory` をどう組み立てるかを、`useClass` / `useFactory` / `useValue` / `useExisting` の 4 通りと `@Service` の `autoProvided` で比べます。最後に、ɵprov も ɵfac も無いクラスを providers に書いたとき実行時に何が起きるかを読みます。

読む対象は `packages/compiler-cli/src/ngtsc/annotations/src/injectable.ts`、`service.ts`、`packages/compiler/src/injectable_compiler_2.ts`、`service_compiler.ts`、`packages/core/src/di/r3_injector.ts`、出力例として `compliance/test_cases/r3_view_compiler_di/di/` と `service_decorator/` の fixture です。

1. [1. 概観](01-di-overview.md)
2. [2. inject() の実装](02-di-inject-function.md)
3. [3. 注入コンテキスト](03-di-injection-context.md)
4. [4. ɵfac の生成](04-di-factory.md)
5. **5. @Injectable と @Service**（この章）
6. [6. InjectionToken と特殊トークン](06-di-injection-token.md)
7. [7. provider の 4 つの形](07-di-provider-to-factory.md)
8. [8. R3Injector.get の全手順](08-di-r3-injector-get.md)
9. [9. multi: true](09-di-multi-providers.md)
10. [10. ブルームフィルタ](10-di.md)
11. [11. NodeInjector の探索](11-di-node-injector-lookup.md)
12. [12. self・skipSelf・host・optional](12-di-resolution-flags.md)
13. [13. provider 無しで取れるトークン](13-di-special-tokens.md)
14. [14. DestroyRef と破棄](14-di-destroy.md)
15. [15. injectAsync と onIdle](15-di-inject-async.md)
16. [16. DevTools と injector profiler](16-di-debug.md)

## 1. 一番普通の形：factory は自分の ɵfac

`@Injectable() class MyService { constructor(dep: MyDependency) {} }` の出力の ɵprov 部分です（ɵfac 部分は第 4 回の形）。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_di/di/injectable_factory_prov.js` L1–7 （▶ の行: 3–5）

```js
1 │ export class MyService {
2 │   // ...
3 ▶   static ɵprov = /*@__PURE__*/ $r3$.ɵɵdefineInjectable({
4 ▶     token: MyService,
5 ▶     factory: MyService.ɵfac
6 │   });
7 │ }
```

3 行目、`ɵɵdefineInjectable({...})` の呼び出しで、`/*@__PURE__*/` は「使われなければ消してよい」というバンドラへの印です。4 行目の `token` はクラス自身、5 行目の `factory` は**同じクラスの ɵfac そのもの**です。`providedIn` を書いていないので、このキーは出力に無く、実行時の `ɵɵdefineInjectable` が `null` にします （`providedIn || null`。[NgModule シリーズ第 10 回](../ngmodule/10-ngmodule-provided-in.md)で引用済み）。なぜ ɵfac をそのまま使えるのか、ほかの形では何が入るのかを、ngtsc → compiler の順に見ます。

## 2. ngtsc：InjectableDecoratorHandler.analyze が読むもの

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/injectable.ts` L115–145 （▶ の行: 121, 127–128, 133, 140–142）

```ts
115 │   analyze(
116 │     node: ClassDeclaration,
117 │     decorator: Readonly<Decorator>,
118 │   ): AnalysisOutput<InjectableHandlerData> {
119 │     this.perf.eventCount(PerfEvent.AnalyzeInjectable);
120 │ 
121 ▶     const meta = extractInjectableMetadata(node, decorator, this.reflector);
122 │     const decorators = this.reflector.getDecoratorsOfDeclaration(node);
123 │ 
124 │     return {
125 │       analysis: {
126 │         meta,
127 ▶         ctorDeps: extractInjectableCtorDeps(
128 ▶           node,
129 │           meta,
130 │           decorator,
131 │           this.reflector,
132 │           this.isCore,
133 ▶           this.strictCtorDeps,
134 │         ),
135 │         classMetadata: this.includeClassMetadata
136 │           ? extractClassMetadata(node, this.reflector, this.isCore)
137 │           : null,
138 │         // Avoid generating multiple factories if a class has
139 │         // more Angular decorators, apart from Injectable.
140 ▶         needsFactory:
141 ▶           !decorators ||
142 ▶           decorators.every((current) => !isAngularCore(current) || current.name === 'Injectable'),
143 │       },
144 │     };
145 │   }
```

121 行目でデコレータ引数を `R3InjectableMetadata` に、127〜134 行目でコンストラクタ引数を deps にします。140〜142 行目の `needsFactory` は「`@Injectable` 以外の Angular デコレータが無いか」。`@Component` と `@Injectable` を両方付けたクラスで ɵfac が 2 個できないよう、ここで片方に任せます。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/injectable.ts` L280–312 （▶ の行: 280, 284, 287, 292, 299, 303, 308, 310–312）

```ts
280 ▶   if (decorator.args === null) {
281 │     throw new FatalDiagnosticError(
282 │       ErrorCode.DECORATOR_NOT_CALLED,
283 │       decorator.node,
284 ▶       '@Injectable must be called',
285 │     );
286 │   }
287 ▶   if (decorator.args.length === 0) {
288 │     return {
289 │       name,
290 │       type,
291 │       typeArgumentCount,
292 ▶       providedIn: createMayBeForwardRefExpression(new LiteralExpr(null), ForwardRefHandling.None),
293 │     };
294 │   } else if (decorator.args.length === 1) {
295 │     const metaNode = decorator.args[0];
296 │     // Firstly make sure the decorator argument is an inline literal - if not, it's illegal to
297 │     // transport references from one location to another. This is the problem that lowering
298 │     // used to solve - if this restriction proves too undesirable we can re-implement lowering.
299 ▶     if (!ts.isObjectLiteralExpression(metaNode)) {
300 │       throw new FatalDiagnosticError(
301 │         ErrorCode.DECORATOR_ARG_NOT_LITERAL,
302 │         metaNode,
303 ▶         `@Injectable argument must be an object literal`,
304 │       );
305 │     }
306 │ 
307 │     // Resolve the fields of the literal into a map of field name to expression.
308 ▶     const meta = reflectObjectLiteral(metaNode);
309 │ 
310 ▶     const providedIn = meta.has('providedIn')
311 ▶       ? getProviderExpression(meta.get('providedIn')!, reflector)
312 ▶       : createMayBeForwardRefExpression(new LiteralExpr(null), ForwardRefHandling.None);
```

280〜285 行目、`@Injectable`（括弧なし）はエラー「must be called」。287〜293 行目、`@Injectable()`（引数なし）なら `providedIn` は `null` のリテラル。299〜305 行目、引数は**その場に書いたオブジェクトリテラル**でなければいけません。変数に入れた設定を渡すとここで止まります。308 行目でリテラルをキー → 式の Map にし、310〜312 行目で `providedIn` を取ります（`forwardRef(() => Mod)` もここで扱えます）。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/injectable.ts` L314–339 （▶ の行: 315, 317, 324, 328, 330, 332, 334–337）

```ts
314 │     let deps: R3DependencyMetadata[] | undefined = undefined;
315 ▶     if ((meta.has('useClass') || meta.has('useFactory')) && meta.has('deps')) {
316 │       const depsExpr = meta.get('deps')!;
317 ▶       if (!ts.isArrayLiteralExpression(depsExpr)) {
318 │         throw new FatalDiagnosticError(
319 │           ErrorCode.VALUE_NOT_LITERAL,
320 │           depsExpr,
321 │           `@Injectable deps metadata must be an inline array`,
322 │         );
323 │       }
324 ▶       deps = depsExpr.elements.map((dep) => getDep(dep, reflector));
325 │     }
326 │ 
327 │     const result: R3InjectableMetadata = {name, type, typeArgumentCount, providedIn};
328 ▶     if (meta.has('useValue')) {
329 │       result.useValue = getProviderExpression(meta.get('useValue')!, reflector);
330 ▶     } else if (meta.has('useExisting')) {
331 │       result.useExisting = getProviderExpression(meta.get('useExisting')!, reflector);
332 ▶     } else if (meta.has('useClass')) {
333 │       result.useClass = getProviderExpression(meta.get('useClass')!, reflector);
334 ▶       result.deps = deps;
335 ▶     } else if (meta.has('useFactory')) {
336 ▶       result.useFactory = new WrappedNodeExpr(meta.get('useFactory')!);
337 ▶       result.deps = deps;
338 │     }
339 │     return result;
```

1. **315〜325 行目：`deps` は useClass か useFactory のときだけ読む**

   317 行目、deps も**その場の配列リテラル**でなければエラー。324 行目、要素ごとに下の `getDep` で `R3DependencyMetadata` に変えます。
2. **328〜338 行目：use\* は 1 つだけ採用、優先順は useValue → useExisting → useClass → useFactory**

   `if / else if` なので、2 つ書いても前のものだけが残ります。336 行目、`useFactory` は関数の式をそのまま `WrappedNodeExpr`（TypeScript の式を出力にそのまま埋め込む包み）にします。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/injectable.ts` L446–479 （▶ の行: 446–447, 452, 455, 458, 461, 467, 470, 472, 476–477）

```ts
446 ▶     switch (source.name) {
447 ▶       case 'Inject':
448 │         if (token !== undefined) {
449 │           meta.token = new WrappedNodeExpr(token);
450 │         }
451 │         break;
452 ▶       case 'Optional':
453 │         meta.optional = true;
454 │         break;
455 ▶       case 'SkipSelf':
456 │         meta.skipSelf = true;
457 │         break;
458 ▶       case 'Self':
459 │         meta.self = true;
460 │         break;
461 ▶       default:
462 │         return false;
463 │     }
464 │     return true;
465 │   }
466 │ 
467 ▶   if (ts.isArrayLiteralExpression(dep)) {
468 │     dep.elements.forEach((el) => {
469 │       let isDecorator = false;
470 ▶       if (ts.isIdentifier(el)) {
471 │         isDecorator = maybeUpdateDecorator(el, reflector);
472 ▶       } else if (ts.isNewExpression(el) && ts.isIdentifier(el.expression)) {
473 │         const token = (el.arguments && el.arguments.length > 0 && el.arguments[0]) || undefined;
474 │         isDecorator = maybeUpdateDecorator(el.expression, reflector, token);
475 │       }
476 ▶       if (!isDecorator) {
477 ▶         meta.token = new WrappedNodeExpr(el);
478 │       }
479 │     });
```

deps 配列の 1 要素の読み方です。467 行目、要素が配列（`[new Optional(), SomeDep]`）なら中身を 1 つずつ見て、470 行目の識別子（`Optional`）か 472 行目の `new Optional()` を 446〜463 行目の switch に通します。switch にあるのは `Inject` / `Optional` / `SkipSelf` / `Self` だけで、**`Host` の case はありません**（461 行目の default で false）。デコレータでないものは 476〜477 行目でトークンになります。読んだ結果は第 4 回と同じ `R3DependencyMetadata` なので、ビットにするのも第 4 回の `compileInjectDependency` です。

### コンストラクタ引数の厳しさ：@Injectable() は甘い

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/injectable.ts` L383–416 （▶ の行: 385, 394–395, 397, 403, 406, 409, 411）

```ts
383 │   let ctorDeps: R3DependencyMetadata[] | 'invalid' | null = null;
384 │ 
385 ▶   if (decorator.args.length === 0) {
386 │     // Ideally, using @Injectable() would have the same effect as using @Injectable({...}), and be
387 │     // subject to the same validation. However, existing Angular code abuses @Injectable, applying
388 │     // it to things like abstract classes with constructors that were never meant for use with
389 │     // Angular's DI.
390 │     //
391 │     // To deal with this, @Injectable() without an argument is more lenient, and if the
392 │     // constructor signature does not work for DI then a factory definition (ɵfac) that throws is
393 │     // generated.
394 ▶     if (strictCtorDeps && !isAbstractClassDeclaration(clazz)) {
395 ▶       ctorDeps = getValidConstructorDependencies(clazz, reflector, isCore);
396 │     } else {
397 ▶       ctorDeps = unwrapConstructorDependencies(
398 │         getConstructorDependencies(clazz, reflector, isCore),
399 │       );
400 │     }
401 │ 
402 │     return ctorDeps;
403 ▶   } else if (decorator.args.length === 1) {
404 │     const rawCtorDeps = getConstructorDependencies(clazz, reflector, isCore);
405 │ 
406 ▶     if (strictCtorDeps && !isAbstractClassDeclaration(clazz) && requiresValidCtor(meta)) {
407 │       // Since use* was not provided for a concrete class, validate the deps according to
408 │       // strictCtorDeps.
409 ▶       ctorDeps = validateConstructorDependencies(clazz, rawCtorDeps);
410 │     } else {
411 ▶       ctorDeps = unwrapConstructorDependencies(rawCtorDeps);
412 │     }
413 │   }
414 │ 
415 │   return ctorDeps;
416 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/injectable.ts` L418–425 （▶ の行: 420–423）

```ts
418 │ function requiresValidCtor(meta: R3InjectableMetadata): boolean {
419 │   return (
420 ▶     meta.useValue === undefined &&
421 ▶     meta.useExisting === undefined &&
422 ▶     meta.useClass === undefined &&
423 ▶     meta.useFactory === undefined
424 │   );
425 │ }
```

385〜402 行目、引数なしの `@Injectable()` は、`strictInjectionParameters`（`strictCtorDeps`）が true で抽象クラスでないときだけ 395 行目の `getValidConstructorDependencies`（注入できない引数があればコンパイルエラー）、それ以外は 397 行目の `unwrap`（`'invalid'` にして実行時エラーへ先送り）です。386〜393 行目のコメントのとおり、既存コードが抽象クラスなどに `@Injectable()` を付けているための緩和です。403〜412 行目、引数ありの場合はさらに 406 行目の `requiresValidCtor`、つまり**use\* を 1 つも書いていないとき**（420〜423 行目）だけ厳しく見ます。`useFactory` を書いたクラスは自分のコンストラクタで作られないので、引数が注入できなくても困らないからです。

### compile：ɵfac と ɵprov を並べて返す

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/injectable.ts` L228–263 （▶ の行: 230, 232–233, 241–243, 250, 252, 254）

```ts
228 │     const results: CompileResult[] = [];
229 │ 
230 ▶     if (analysis.needsFactory) {
231 │       const meta = analysis.meta;
232 ▶       const factoryRes = compileFactoryFn(
233 ▶         toFactoryMetadata({...meta, deps: analysis.ctorDeps}, FactoryTarget.Injectable),
234 │       );
235 │       if (analysis.classMetadata !== null) {
236 │         factoryRes.statements.push(compileClassMetadataFn(analysis.classMetadata).toStmt());
237 │       }
238 │       results.push(factoryRes);
239 │     }
240 │ 
241 ▶     const ɵprov = this.reflector.getMembersOfClass(node).find((member) => member.name === 'ɵprov');
242 ▶     if (ɵprov !== undefined && this.errorOnDuplicateProv) {
243 ▶       throw new FatalDiagnosticError(
244 │         ErrorCode.INJECTABLE_DUPLICATE_PROV,
245 │         ɵprov.nameNode || ɵprov.node || node,
246 │         'Injectables cannot contain a static ɵprov property, because the compiler is going to generate one.',
247 │       );
248 │     }
249 │ 
250 ▶     if (ɵprov === undefined) {
251 │       // Only add a new ɵprov if there is not one already
252 ▶       const res = compileInjectableFn(analysis.meta);
253 │       results.push({
254 ▶         name: 'ɵprov',
255 │         initializer: res.expression,
256 │         statements: res.statements,
257 │         type: res.type,
258 │         deferrableImports: null,
259 │       });
260 │     }
261 │ 
262 │     return results;
263 │   }
```

230〜239 行目、`needsFactory` なら `FactoryTarget.Injectable` で ɵfac を作ります（use\* を書いていても ɵfac は作られる）。241〜248 行目、クラスに自分で `static ɵprov` を書いていたらエラー。250〜260 行目、`compileInjectableFn`（＝ compiler の `compileInjectable`）で ɵprov を作ります。

## 3. compiler：compileInjectable が factory を選ぶ

📄 `angular/packages/compiler/src/injectable_compiler_2.ts` L38–51 （▶ の行: 44, 48–49）

```ts
38 │ export function compileInjectable(
39 │   meta: R3InjectableMetadata,
40 │   resolveForwardRefs: boolean,
41 │ ): R3CompiledExpression {
42 │   let result: {expression: o.Expression; statements: o.Statement[]} | null = null;
43 │ 
44 ▶   const factoryMeta: R3FactoryMetadata = {
45 │     name: meta.name,
46 │     type: meta.type,
47 │     typeArgumentCount: meta.typeArgumentCount,
48 ▶     deps: [],
49 ▶     target: FactoryTarget.Injectable,
50 │   };
51 │ 
```

44〜50 行目、ɵprov の factory を作るための土台です。48 行目で **deps は空配列**、つまり「自分のコンストラクタを引数なしで呼ぶ」前提です。以下の分岐で、この土台に `delegate` や `expression` を足して第 4 回の `compileFactoryFunction` に渡すか、別の式を作ります。

📄 `angular/packages/compiler/src/injectable_compiler_2.ts` L52–85 （▶ の行: 60, 66, 68, 70–72, 74–75, 77, 79）

```ts
52 │   if (meta.useClass !== undefined) {
53 │     // meta.useClass has two modes of operation. Either deps are specified, in which case `new` is
54 │     // used to instantiate the class with dependencies injected, or deps are not specified and
55 │     // the factory of the class is used to instantiate it.
56 │     //
57 │     // A special case exists for useClass: Type where Type is the injectable type itself and no
58 │     // deps are specified, in which case 'useClass' is effectively ignored.
59 │ 
60 ▶     const useClassOnSelf = meta.useClass.expression.isEquivalent(meta.type.value);
61 │     let deps: R3DependencyMetadata[] | undefined = undefined;
62 │     if (meta.deps !== undefined) {
63 │       deps = meta.deps;
64 │     }
65 │ 
66 ▶     if (deps !== undefined) {
67 │       // factory: () => new meta.useClass(...deps)
68 ▶       result = compileFactoryFunction({
69 │         ...factoryMeta,
70 ▶         delegate: meta.useClass.expression,
71 ▶         delegateDeps: deps,
72 ▶         delegateType: R3FactoryDelegateType.Class,
73 │       });
74 ▶     } else if (useClassOnSelf) {
75 ▶       result = compileFactoryFunction(factoryMeta);
76 │     } else {
77 ▶       result = {
78 │         statements: [],
79 ▶         expression: delegateToFactory(
80 │           meta.type.value as o.WrappedNodeExpr<any>,
81 │           meta.useClass.expression as o.WrappedNodeExpr<any>,
82 │           resolveForwardRefs,
83 │         ),
84 │       };
85 │     }
```

📄 `angular/packages/compiler/src/injectable_compiler_2.ts` L86–120 （▶ の行: 87–88, 90, 92, 95, 101, 103, 107, 109, 112, 114–116）

```ts
 86 │   } else if (meta.useFactory !== undefined) {
 87 ▶     if (meta.deps !== undefined) {
 88 ▶       result = compileFactoryFunction({
 89 │         ...factoryMeta,
 90 ▶         delegate: meta.useFactory,
 91 │         delegateDeps: meta.deps || [],
 92 ▶         delegateType: R3FactoryDelegateType.Function,
 93 │       });
 94 │     } else {
 95 ▶       result = {statements: [], expression: o.arrowFn([], meta.useFactory.callFn([]))};
 96 │     }
 97 │   } else if (meta.useValue !== undefined) {
 98 │     // Note: it's safe to use `meta.useValue` instead of the `USE_VALUE in meta` check used for
 99 │     // client code because meta.useValue is an Expression which will be defined even if the actual
100 │     // value is undefined.
101 ▶     result = compileFactoryFunction({
102 │       ...factoryMeta,
103 ▶       expression: meta.useValue.expression,
104 │     });
105 │   } else if (meta.useExisting !== undefined) {
106 │     // useExisting is an `inject` call on the existing token.
107 ▶     result = compileFactoryFunction({
108 │       ...factoryMeta,
109 ▶       expression: o.importExpr(Identifiers.inject).callFn([meta.useExisting.expression]),
110 │     });
111 │   } else {
112 ▶     result = {
113 │       statements: [],
114 ▶       expression: delegateToFactory(
115 ▶         meta.type.value as o.WrappedNodeExpr<any>,
116 ▶         meta.type.value as o.WrappedNodeExpr<any>,
117 │         resolveForwardRefs,
118 │       ),
119 │     };
120 │   }
```

📄 `angular/packages/compiler/src/injectable_compiler_2.ts` L122–129 （▶ の行: 122, 129）

```ts
122 ▶   const token = meta.type.value;
123 │ 
124 │   const injectableProps = new DefinitionMap<{
125 │     token: o.Expression;
126 │     factory: o.Expression;
127 │     providedIn: o.Expression;
128 │   }>();
129 ▶   injectableProps.set('token', token);
```

122〜129 行目、どの分岐でも `token` はクラス自身、`factory` は分岐で作った式です（この直後で `providedIn` を足し `ɵɵdefineInjectable` を呼ぶ部分は[NgModule 第 10 回](../ngmodule/10-ngmodule-provided-in.md)で引用済み）。分岐が作る式は 3 種類しかありません。

📄 `angular/packages/compiler/src/injectable_compiler_2.ts` L151–185 （▶ の行: 156, 161, 164, 170, 178–179, 184）

````ts
151 │ export function delegateToFactory(
152 │   type: o.WrappedNodeExpr<any>,
153 │   useType: o.WrappedNodeExpr<any>,
154 │   unwrapForwardRefs: boolean,
155 │ ): o.Expression {
156 ▶   if (type.node === useType.node) {
157 │     // The types are the same, so we can simply delegate directly to the type's factory.
158 │     // ```
159 │     // factory: type.ɵfac
160 │     // ```
161 ▶     return useType.prop('ɵfac');
162 │   }
163 │ 
164 ▶   if (!unwrapForwardRefs) {
165 │     // The type is not wrapped in a `forwardRef()`, so we create a simple factory function that
166 │     // accepts a sub-type as an argument.
167 │     // ```
168 │     // factory: function(t) { return useType.ɵfac(t); }
169 │     // ```
170 ▶     return createFactoryFunction(useType);
171 │   }
172 │ 
173 │   // The useType is actually wrapped in a `forwardRef()` so we need to resolve that before
174 │   // calling its factory.
175 │   // ```
176 │   // factory: function(t) { return core.resolveForwardRef(type).ɵfac(t); }
177 │   // ```
178 ▶   const unwrappedType = o.importExpr(Identifiers.resolveForwardRef).callFn([useType]);
179 ▶   return createFactoryFunction(unwrappedType);
180 │ }
181 │ 
182 │ function createFactoryFunction(type: o.Expression): o.ArrowFunctionExpr {
183 │   const t = new o.FnParam('__ngFactoryType__', o.DYNAMIC_TYPE);
184 ▶   return o.arrowFn([t], type.prop('ɵfac').callFn([o.variable(t.name)]));
185 │ }
````

📄 `angular/packages/compiler/src/render3/r3_factory.ts` L145–171 （▶ の行: 145–147, 149–151, 153, 157, 160, 162–163, 165–166, 168）

```ts
145 ▶   function makeConditionalFactory(nonCtorExpr: o.Expression): o.ReadVarExpr {
146 ▶     const r = o.variable('__ngConditionalFactory__');
147 ▶     body.push(new o.DeclareVarStmt(r.name, o.NULL_EXPR, o.DYNAMIC_TYPE));
148 │     const ctorStmt =
149 ▶       ctorExpr !== null
150 ▶         ? r.set(ctorExpr).toStmt(factoryComments)
151 ▶         : o.importExpr(R3.invalidFactory).callFn([]).toStmt();
152 │     // Always add a `ts-ignore` on the alternate factory.
153 ▶     body.push(o.ifStmt(t, [ctorStmt], [r.set(nonCtorExpr).toStmt([tsIgnoreComment()])]));
154 │     return r;
155 │   }
156 │ 
157 ▶   if (isDelegatedFactoryMetadata(meta)) {
158 │     // This type is created with a delegated factory. If a type parameter is not specified, call
159 │     // the factory instead.
160 ▶     const delegateArgs = injectDependencies(meta.delegateDeps, meta.target);
161 │     // Either call `new delegate(...)` or `delegate(...)` depending on meta.delegateType.
162 ▶     const factoryExpr = new (
163 ▶       meta.delegateType === R3FactoryDelegateType.Class ? o.InstantiateExpr : o.InvokeFunctionExpr
164 │     )(meta.delegate, delegateArgs);
165 ▶     retExpr = makeConditionalFactory(factoryExpr);
166 ▶   } else if (isExpressionFactoryMetadata(meta)) {
167 │     // TODO(alxhub): decide whether to lower the value here or in the caller
168 ▶     retExpr = makeConditionalFactory(meta.expression);
169 │   } else {
170 │     retExpr = ctorExpr;
171 │   }
```

1. **種類 A：`Type.ɵfac` をそのまま（delegateToFactory 156〜161 行目）**

   use\* を何も書かない（ciOthers 112〜119 行目）と `delegateToFactory(type, type)`、同じノードなので 161 行目で `MyService.ɵfac`。1 節の fixture 5 行目がこれです。`@Injectable({useClass: MyService})` のように自分自身を指したときも 74〜75 行目で同じ結果になります。
2. **種類 B：別クラスの ɵfac を呼ぶ矢印関数（164〜170 行目、184 行目）**

   deps 無しの `useClass: Other` は 79 行目で `delegateToFactory(MyService, Other)`、184 行目で `__ngFactoryType__ => Other.ɵfac(__ngFactoryType__)`。**Other の引数の注入は Other の ɵfac に任せます**。`forwardRef` で包んでいれば 178〜179 行目で `resolveForwardRef(Other).ɵfac(t)` にします。
3. **種類 C：`makeConditionalFactory` の if 文（r3\_factory.ts 145〜155 行目）**

   `useClass + deps`（66〜73 行目）、`useFactory + deps`（87〜93 行目）、`useValue`（101〜104 行目）、`useExisting`（107〜110 行目）は `compileFactoryFunction` に `delegate` か `expression` を付けて渡し、157〜168 行目からここへ来ます。153 行目、`if (__ngFactoryType__)` なら 149〜150 行目の「土台の new」（deps が空なので `new __ngFactoryType__()`）、そうでなければ use\* の式です。サブクラスから呼ばれたときだけ自分のコンストラクタ、普段は use\* の値、という 2 択を毎回分岐します。useExisting の式は 109 行目の `ɵɵinject(Existing)` です。
4. **例外：`useFactory` で deps 無し（95 行目）**

   `() => factory()` という引数なしの矢印関数。factory の中で `inject()` すれば依存を取れます。

fixture で 3 種類を確かめます。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_di/di/useclass_without_deps.js` L1–8 （▶ の行: 5）

```js
1 │ export class MyService {
2 │   // ...
3 │   static ɵprov = /*@__PURE__*/ $r3$.ɵɵdefineInjectable({
4 │     token: MyService,
5 ▶     factory: __ngFactoryType__ => MyAlternateService.ɵfac(__ngFactoryType__),
6 │     providedIn: 'root'
7 │   });
8 │ }
```
*@Injectable({providedIn: 'root', useClass: MyAlternateService}) → 種類 B*

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_di/di/useclass_with_deps.js` L1–17 （▶ の行: 6–8, 11, 13, 15）

```js
 1 │ export class MyService {
 2 │   // ...
 3 │   static ɵprov = /*@__PURE__*/ $r3$.ɵɵdefineInjectable({
 4 │     token: MyService,
 5 │     factory: function MyService_Factory(__ngFactoryType__) {
 6 ▶       let __ngConditionalFactory__ = null;
 7 ▶       if (__ngFactoryType__) {
 8 ▶         __ngConditionalFactory__ = new __ngFactoryType__();
 9 │       } else {
10 │         /* @ts-ignore */
11 ▶         __ngConditionalFactory__ = new MyAlternateService($r3$.ɵɵinject(SomeDep));
12 │       }
13 ▶       return __ngConditionalFactory__;
14 │     },
15 ▶     providedIn: 'root'
16 │   });
17 │ }
```
*@Injectable({providedIn: 'root', useClass: MyAlternateService, deps: \[SomeDep\]}) → 種類 C*

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_di/di/usefactory_without_deps.js` L1–8 （▶ の行: 5）

```js
1 │ export class MyService {
2 │   // ...
3 │   static ɵprov = /*@__PURE__*/ $r3$.ɵɵdefineInjectable({
4 │     token: MyService,
5 ▶     factory: () => alternateFactory(),
6 │     providedIn: 'root'
7 │   });
8 │ }
```
*@Injectable({providedIn: 'root', useFactory: alternateFactory}) → deps 無しの useFactory*

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_di/di/usefactory_with_deps.ts` L8–12 （▶ の行: 10–11）

```ts
 8 │ @Injectable({
 9 │   providedIn: 'root',
10 ▶   useFactory: (dep: SomeDep, optional: SomeDep|null) => new MyAlternateService(dep, optional),
11 ▶   deps: [SomeDep, [new Optional(), SomeDep]]
12 │ })
```
*useFactory + deps の入力。出力は useClass + deps と同じ if 文で、else 側が ((dep, optional) =&gt; new MyAlternateService(dep, optional))(ɵɵinject(SomeDep), ɵɵinject(SomeDep, 8))*

useClass + deps の出力 8 行目は `new __ngFactoryType__()`、11 行目は `new MyAlternateService(ɵɵinject(SomeDep))`。deps に書いた `SomeDep` が、第 4 回の `compileInjectDependency` を通って `ɵɵinject(SomeDep)` になっています。useFactory + deps の入力 11 行目の `[new Optional(), SomeDep]` は、2 節の `getDep` 472 行目で optional = true になり、出力ではフラグ 8 になります。

## 4. 早見表：デコレータに書いたもの × ɵprov.factory

| デコレータ | ɵprov.factory の形 | 根拠 |
| --- | --- | --- |
| `@Injectable()` / `{providedIn}` だけ | `MyService.ɵfac` | injectable\_compiler\_2.ts 112〜119 → 161 行目 |
| `useClass: MyService`（自分） | 自分の ɵfac 相当（`compileFactoryFunction(factoryMeta)`） | 74〜75 行目 |
| `useClass: Other` | `t => Other.ɵfac(t)` | 77〜84 → 184 行目 |
| `useClass: Other, deps: [...]` | `if (t) new t() else new Other(ɵɵinject(...))` | 66〜73 行目、r3\_factory.ts 153 行目 |
| `useFactory: fn` | `() => fn()` | 95 行目 |
| `useFactory: fn, deps: [...]` | `if (t) new t() else fn(ɵɵinject(...))` | 87〜93 行目 |
| `useValue: v` | `if (t) new t() else v` | 101〜104 行目 |
| `useExisting: X` | `if (t) new t() else ɵɵinject(X)` | 107〜110 行目 |
| `@Service()` | `MyService.ɵfac`（ɵfac の deps は常に空） | service\_compiler.ts 36〜40 行目 |
| `@Service({factory: fn})` | `() => fn()` | service\_compiler.ts 41 行目 |

## 5. @Service：コンストラクタ注入を禁止した @Injectable({providedIn: 'root'})

v22 には `@Service` デコレータがあります（`ApplicationRef` もこれで定義されています）。ngtsc の別ハンドラ `ServiceDecoratorHandler` が扱います。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/service.ts` L98–116 （▶ の行: 101–103, 112）

```ts
 98 │     const decorators = this.reflector.getDecoratorsOfDeclaration(node);
 99 │     let diagnostics: ts.Diagnostic[] | undefined;
100 │ 
101 ▶     if (decorators !== null && decorators.length > 1) {
102 ▶       const nonServiceDecorator = decorators.find(
103 ▶         (decorator) => decorator.import?.from === '@angular/core' && decorator.name !== 'Service',
104 │       );
105 │ 
106 │       if (nonServiceDecorator) {
107 │         diagnostics ??= [];
108 │         diagnostics.push(
109 │           makeDiagnostic(
110 │             ErrorCode.DECORATOR_COLLISION,
111 │             nonServiceDecorator.node,
112 ▶             'Cannot apply more than one Angular decorator on an @Service class.',
113 │           ),
114 │         );
115 │       }
116 │     }
```

101〜115 行目、`@Service` と他の Angular デコレータ（`@Injectable` を含む）は同じクラスに付けられません。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/service.ts` L244–268 （▶ の行: 248, 251, 255, 259, 264–265）

```ts
244 │       // Resolve the fields of the literal into a map of field name to expression.
245 │       const meta = reflectObjectLiteral(metaNode);
246 │       let autoProvided: boolean | undefined;
247 │ 
248 ▶       if (meta.has('autoProvided')) {
249 │         const value = meta.get('autoProvided')!;
250 │ 
251 ▶         if (value.kind !== ts.SyntaxKind.TrueKeyword && value.kind !== ts.SyntaxKind.FalseKeyword) {
252 │           throw new FatalDiagnosticError(
253 │             ErrorCode.VALUE_HAS_WRONG_TYPE,
254 │             metaNode,
255 ▶             '`autoProvided` property must be a boolean literal',
256 │           );
257 │         }
258 │ 
259 ▶         autoProvided = value.kind === ts.SyntaxKind.TrueKeyword;
260 │       }
261 │ 
262 │       const result: R3ServiceMetadata = {name, type, typeArgumentCount, autoProvided};
263 │ 
264 ▶       if (meta.has('factory')) {
265 ▶         result.factory = new WrappedNodeExpr(meta.get('factory')!);
266 │       }
267 │ 
268 │       return result;
```

読むキーは 2 つだけです。248〜260 行目の `autoProvided`（`true` / `false` のリテラル以外はエラー）と、264〜266 行目の `factory`。`providedIn` も `useClass` も `deps` もありません。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/service.ts` L175–193 （▶ の行: 177–178）

```ts
175 │     const results: CompileResult[] = [];
176 │     const meta = analysis.meta;
177 ▶     const factoryRes = compileFactoryFn(
178 ▶       toFactoryMetadata({...meta, deps: []}, FactoryTarget.Service),
179 │     );
180 │     if (analysis.classMetadata !== null) {
181 │       factoryRes.statements.push(compileClassMetadataFn(analysis.classMetadata).toStmt());
182 │     }
183 │     results.push(factoryRes);
184 │ 
185 │     const ɵprov = this.reflector.getMembersOfClass(node).find((member) => member.name === 'ɵprov');
186 │ 
187 │     if (ɵprov !== undefined) {
188 │       throw new FatalDiagnosticError(
189 │         ErrorCode.INJECTABLE_DUPLICATE_PROV,
190 │         ɵprov.nameNode || ɵprov.node || node,
191 │         'Services cannot contain a static ɵprov property, because the compiler is going to generate one.',
192 │       );
193 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/src/service.ts` L278–309 （▶ の行: 279, 281–282, 292, 297, 299–300, 305）

```ts
278 │   private getDependencyInjectionDiagnostics(node: ClassDeclaration): ts.Diagnostic[] | null {
279 ▶     const ownCtorParams = this.reflector.getConstructorParameters(node);
280 │ 
281 ▶     if (ownCtorParams !== null) {
282 ▶       return ownCtorParams.length > 0 ? [makeConstructorDependencyInjectionDiagnostic(node)] : null;
283 │     }
284 │ 
285 │     // Don't traverse parent classes in local mode.
286 │     if (this.compilationMode === CompilationMode.LOCAL) {
287 │       return null;
288 │     }
289 │ 
290 │     let baseClass = readBaseClass(node, this.reflector, this.evaluator);
291 │ 
292 ▶     while (baseClass !== null) {
293 │       if (baseClass === 'dynamic') {
294 │         return null;
295 │       }
296 │ 
297 ▶       const baseCtorParams = this.reflector.getConstructorParameters(baseClass.node);
298 │ 
299 ▶       if (baseCtorParams !== null) {
300 ▶         return baseCtorParams.length > 0
301 │           ? [makeConstructorDependencyInjectionDiagnostic(node)]
302 │           : null;
303 │       }
304 │ 
305 ▶       baseClass = readBaseClass(baseClass.node, this.reflector, this.evaluator);
306 │     }
307 │ 
308 │     return null;
309 │   }
```

178 行目、ɵfac は **`deps: []` 固定**、target は `FactoryTarget.Service`（第 4 回の `getInjectFn` では default 扱いで `ɵɵinject`。deps が空なので使われません）。その代わり `resolve` で 279〜283 行目、自分のコンストラクタに引数が 1 つでもあれば診断 `SERVICE_CONSTRUCTOR_DI` （「@Service class cannot use constructor dependency injection. Use the \`inject\` function instead.」）を出し、292〜306 行目、自分にコンストラクタが無ければ親クラスを順に登って、最初に見つかったコンストラクタで同じ判定をします。**依存は `inject()` で取る**ことが、コンパイラで強制されています。

📄 `angular/packages/compiler/src/service_compiler.ts` L23–58 （▶ の行: 32, 35–36, 41, 45–46, 50）

```ts
23 │ export function compileService(
24 │   meta: R3ServiceMetadata,
25 │   resolveForwardRefs: boolean,
26 │ ): R3CompiledExpression {
27 │   const def = new DefinitionMap<{
28 │     token: o.Expression;
29 │     factory: o.Expression;
30 │     autoProvided: o.Expression;
31 │   }>();
32 ▶   def.set('token', meta.type.value);
33 │   def.set(
34 │     'factory',
35 ▶     meta.factory === undefined
36 ▶       ? delegateToFactory(
37 │           meta.type.value as o.WrappedNodeExpr<any>,
38 │           meta.type.value as o.WrappedNodeExpr<any>,
39 │           resolveForwardRefs,
40 │         )
41 ▶       : o.arrowFn([], meta.factory.callFn([])),
42 │   );
43 │ 
44 │   // Only generate providedIn property if it's different from the default.
45 ▶   if (meta.autoProvided === false) {
46 ▶     def.set('autoProvided', o.literal(false));
47 │   }
48 │ 
49 │   const expression = o
50 ▶     .importExpr(Identifiers.defineService)
51 │     .callFn([def.toLiteralMap()], undefined, true);
52 │ 
53 │   return {
54 │     expression,
55 │     type: createInjectableType(meta.type.type, meta.typeArgumentCount),
56 │     statements: [],
57 │   };
58 │ }
```

32 行目、token はクラス自身。35〜40 行目、`factory` を書かなければ `delegateToFactory(type, type)`（＝ `MyService.ɵfac`）、書けば 41 行目で `() => factory()`。45〜47 行目、`autoProvided: false` のときだけキーを出力し、50 行目で `ɵɵdefineInjectable` ではなく `ɵɵdefineService` を呼びます。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/service_decorator/not_provided_service.js` L1–4 （▶ の行: 3）

```js
1 │ export class MyService {
2 │   static ɵfac = function MyService_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || MyService)(); };
3 ▶   static ɵprov = /*@__PURE__*/ $r3$.ɵɵdefineService({ token: MyService, factory: MyService.ɵfac, autoProvided: false });
4 │ }
```
*@Service({autoProvided: false}) の出力*

📄 `angular/packages/compiler-cli/test/compliance/test_cases/service_decorator/service_with_factory.js` L3–6 （▶ の行: 5）

```js
3 │ export class MyService {
4 │   static ɵfac = function MyService_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || MyService)(); };
5 ▶   static ɵprov = /*@__PURE__*/ $r3$.ɵɵdefineService({ token: MyService, factory: () => (() => new Alternate())() });
6 │ }
```
*@Service({factory: () =&gt; new Alternate()}) の出力*

📄 `angular/packages/core/src/di/interface/service.ts` L31–34 （▶ の行: 32）

```ts
31 │     token: opts.token,
32 ▶     providedIn: opts.autoProvided === false ? null : 'root',
33 │     factory: opts.factory,
34 │     value: undefined,
```
*実行時の ɵɵdefineService が返すもの（関数全体は router-provide-router 章で引用済み）*

32 行目が `@Service` と `@Injectable` の実行時の差のすべてです。`autoProvided === false` のときだけ `null`、それ以外（未指定・`true`）は `'root'`。返すオブジェクトの形は `ɵɵdefineInjectable` と同じ `{token, providedIn, factory, value}` なので、`R3Injector` 側は 2 つを区別しません（`providedIn: 'root'` の判定は[NgModule 第 10 回](../ngmodule/10-ngmodule-provided-in.md)）。

## 6. ɵprov も ɵfac も無いクラスを providers に書くと

`providers: [Plain]` のようにクラスを直接書いた provider は、`providerToFactory` のこの行で factory になります。

📄 `angular/packages/core/src/di/r3_injector.ts` L649–651 （▶ の行: 651）

```ts
649 │   if (isTypeProvider(provider)) {
650 │     const unwrappedProvider = resolveForwardRef(provider);
651 ▶     return getFactoryDef(unwrappedProvider) || injectableDefOrInjectorDefFactory(unwrappedProvider);
```

651 行目、まず `getFactoryDef`（自分の ɵfac）。デコレータが無いので `null`、次の `injectableDefOrInjectorDefFactory` へ進みます。その前半（ɵprov.factory か ɵfac を返す 571〜578 行目）は[NgModule 第 10 回](../ngmodule/10-ngmodule-provided-in.md)で引用済みで、どちらも無いのでここに来ます。

📄 `angular/packages/core/src/di/r3_injector.ts` L579–596 （▶ の行: 582–584, 590–591, 595）

```ts
579 │ 
580 │   // InjectionTokens should have an injectable def (ɵprov) and thus should be handled above.
581 │   // If it's missing that, it's an error.
582 ▶   if (token instanceof InjectionToken) {
583 ▶     throw new RuntimeError(
584 ▶       RuntimeErrorCode.INVALID_INJECTION_TOKEN,
585 │       ngDevMode && `Token ${stringify(token)} is missing a ɵprov definition.`,
586 │     );
587 │   }
588 │ 
589 │   // Undecorated types can sometimes be created if they have no constructor arguments.
590 ▶   if (token instanceof Function) {
591 ▶     return getUndecoratedInjectableFactory(token);
592 │   }
593 │ 
594 │   // There was no way to resolve a factory for this token.
595 ▶   throw new RuntimeError(RuntimeErrorCode.INVALID_INJECTION_TOKEN, ngDevMode && 'unreachable');
596 │ }
```

📄 `angular/packages/core/src/di/r3_injector.ts` L598–622 （▶ の行: 600–603, 605, 616–618, 620）

```ts
598 │ function getUndecoratedInjectableFactory(token: Function) {
599 │   // If the token has parameters then it has dependencies that we cannot resolve implicitly.
600 ▶   const paramLength = token.length;
601 ▶   if (paramLength > 0) {
602 ▶     throw new RuntimeError(
603 ▶       RuntimeErrorCode.INVALID_INJECTION_TOKEN,
604 │       ngDevMode &&
605 ▶         `Can't resolve all parameters for ${stringify(token)}: (${newArray(paramLength, '?').join(
606 │           ', ',
607 │         )}).`,
608 │     );
609 │   }
610 │ 
611 │   // The constructor function appears to have no parameters.
612 │   // This might be because it inherits from a super-class. In which case, use an injectable
613 │   // def from an ancestor if there is one.
614 │   // Otherwise this really is a simple class with no dependencies, so return a factory that
615 │   // just instantiates the zero-arg constructor.
616 ▶   const inheritedInjectableDef = getInheritedInjectableDef(token);
617 ▶   if (inheritedInjectableDef !== null) {
618 ▶     return () => inheritedInjectableDef.factory(token as Type<any>);
619 │   } else {
620 ▶     return () => new (token as Type<any>)();
621 │   }
622 │ }
```

1. **582〜587 行目：InjectionToken なのに ɵprov が無い → NG0204**

   トークンは `providedIn` / `factory` を付けないと ɵprov を持たないので、この行は「provider を書かずに factory 無しトークンを provide しようとした」場合です（[第 6 回](06-di-injection-token.md)）。
2. **590〜591 行目：関数（クラス）なら `getUndecoratedInjectableFactory`**

   595 行目はそれ以外（文字列だけの `{provide: 'x'}` など）で、メッセージは `'unreachable'` の NG0204 です。
3. **600〜609 行目：`token.length` が 1 以上なら NG0204**

   `Function.length` は宣言された引数の個数です。コンストラクタに引数があるのに ɵfac が無ければ、何を渡すか分かりません。605 行目、メッセージは `Can't resolve all parameters for X: (?).` で、`?` が引数の個数ぶん並びます。
4. **616〜618 行目：引数 0 個で、親クラスに ɵprov があれば親の factory に自分を渡す**

   `getInheritedInjectableDef` は開発モードで「DEPRECATED: ... Please add @Injectable()」の警告を出します（defs.ts。将来はエラーになる予定と書かれています）。
5. **620 行目：それも無ければ `() => new Plain()`**

   引数 0 個で new するだけ。`Plain` の中で `inject()` を使っていても、この関数は R3Injector の注入コンテキストの中で呼ばれるので動きます。

### コンパイル時に先に止める検査

`@Component` / `@NgModule` / `@Directive` の `providers` にその場で書いた配列は、ngtsc が静的に評価して同じ問題を先に見つけます。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/common/src/util.ts` L385–397 （▶ の行: 390, 394–395）

```ts
385 │     if (
386 │       tokenClass !== null &&
387 │       !tokenClass.node.getSourceFile().isDeclarationFile &&
388 │       reflector.isClass(tokenClass.node)
389 │     ) {
390 ▶       const constructorParameters = reflector.getConstructorParameters(tokenClass.node);
391 │ 
392 │       // Note that we only want to capture providers with a non-trivial constructor,
393 │       // because they're the ones that might be using DI and need to be decorated.
394 ▶       if (constructorParameters !== null && constructorParameters.length > 0) {
395 ▶         providers.add(tokenClass as Reference<ClassDeclaration>);
396 │       }
397 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/common/src/diagnostics.ts` L137–156 （▶ の行: 138–139, 142, 148, 150）

```ts
137 │   for (const provider of providerClasses) {
138 ▶     const injectableMeta = registry.getInjectableMeta(provider.node);
139 ▶     if (injectableMeta !== null) {
140 │       // The provided type is recognized as injectable, so we don't report a diagnostic for this
141 │       // provider.
142 ▶       continue;
143 │     }
144 │ 
145 │     const contextNode = provider.getOriginForDiagnostics(providersDeclaration);
146 │     diagnostics.push(
147 │       makeDiagnostic(
148 ▶         ErrorCode.UNDECORATED_PROVIDER,
149 │         contextNode,
150 ▶         `The class '${provider.node.name.text}' cannot be created via dependency injection, as it does not have an Angular decorator. This will result in an error at runtime.
151 │ 
152 │ Either add the @Injectable() decorator to '${provider.node.name.text}', or configure a different provider (such as a provider with 'useFactory').
153 │ `,
154 │         [makeRelatedInformation(provider.node, `'${provider.node.name.text}' is declared here.`)],
155 │       ),
156 │     );
```

394〜395 行目、拾うのは**コンストラクタ引数が 1 個以上のクラスだけ**です（引数 0 個なら上の 620 行目で作れるので見逃す）。138〜143 行目、そのクラスが Injectable として登録されていなければ、148 行目の `UNDECORATED_PROVIDER`（NG2005）を出します。実行時の 600〜609 行目と同じ条件を、コンパイル時に前倒しで調べているわけです。

## 7. DEMO：この章のクラスに付いた ɵprov を覗く

この章の `.ts` に、デコレータだけを変えた 8 クラスを置いています。表は、コンパイラが付けた `ɵprov` を学習用に覗いた値と、章コンポーネントの環境注入器で `get(クラス, null)` したときに返ったものです（返った値は各クラスに持たせた固定の文字列 `made` で表示するので、本番ビルドのクラス名短縮の影響を受けません）。

> **🧪 DEMO 1 — 実物の ɵprov**
>
> 「factory === ɵfac」が true なのは種類 A（3 節）。useClass / useFactory / useValue / useExisting は別の関数です。providedIn が null の 2 つは、どこにも provide していないので get が null を返します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/di-injectable-compile)

> **🧪 DEMO 2 — デコレータの無いクラスを providers に書く**
>
> `createEnvironmentInjector([UndecoratedNoArgs], env)` と `createEnvironmentInjector([UndecoratedWithArgs], env)` を作って `get` します。後者は `constructor(readonly name: string)` で `length` が 1。エラーは try/catch で捕まえて表示します。providers は `R3Injector` のコンストラクタで records に変換される（そこで 651 行目の `providerToFactory` が走る）ので、NG0204 は `get` より前、**注入器を作った時点**で投げられます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/di-injectable-compile)

## ここまでの呼び出し

- 👤 `@Injectable({ providedIn: 'root', useFactory, deps })` — あなたのクラス
  - `InjectableDecoratorHandler.analyze` — annotations/src/injectable.ts L115
    - `extractInjectableMetadata` — injectable.ts L272 — *providedIn（L310）、use\* は 1 つ（L328-338）、deps は getDep（L324）*
    - `extractInjectableCtorDeps` — injectable.ts L367 — *use\* があれば緩く（L406）*
  - `InjectableDecoratorHandler.compile` — injectable.ts L221 — *ɵfac（L232）と ɵprov（L252）*
    - `compileInjectable(meta)` — compiler/src/injectable\_compiler\_2.ts L38 — *種類 A/B は delegateToFactory、種類 C は compileFactoryFunction → makeConditionalFactory*
  - `ɵɵdefineInjectable({token, factory, providedIn})` / `ɵɵdefineService(...)` — 実行時、クラス定義の評価時
  - `R3Injector.get(MyService)` — 第 8 回 — *providedIn が scope に合えば ɵprov.factory で作る*
    - `injectableDefOrInjectorDefFactory` → `getUndecoratedInjectableFactory` — r3\_injector.ts L571 / L598 — *ɵprov も ɵfac も無いクラスだけ*

## 聞かれそうな質問

**Q. @Injectable() を付けないクラスを providers に書くとどうなりますか？**

コンストラクタ引数が 0 個なら動きます。r3\_injector.ts 651 行目で ɵfac が無く、590〜591 行目から `getUndecoratedInjectableFactory`、620 行目で `new Plain()` です。引数が 1 個以上なら 600〜609 行目で **NG0204「Can't resolve all parameters」**。factory を作る段階で投げるので、注入器を作った時点で失敗します（DEMO 2）。引数の型がクラスでも、ɵfac が無いので注入のしようがありません。ただし `@Component` / `@NgModule` の `providers` にその場で書いた、引数のあるクラスは、6 節の util.ts 394〜395 行目で拾われ、diagnostics.ts 148 行目の NG2005 で**先にコンパイルが止まります**。DEMO 2 は配列を実行時に渡しているので、この検査を通りません。

**Q. @Service と @Injectable({providedIn: 'root'}) の違いは何ですか？**

実物にある差は 4 つです。(1) コンストラクタ引数があるとコンパイルエラー（service.ts 279〜283 行目）。依存は `inject()` で取る。(2) 設定は `autoProvided` と `factory` だけで、`useClass` / `deps` / `providedIn: SomeModule` は書けない（248〜266 行目）。(3) 他の Angular デコレータと併用できない（101〜115 行目）。(4) 実行時は `ɵɵdefineService` が `autoProvided === false` 以外を `'root'` にする（interface/service.ts 32 行目）。できあがる ɵprov の形は同じなので、注入されるときの動きは変わりません（DEMO 1 の `@Service()` 行）。

**Q. providedIn: 'any' や 'platform' はこの章のどこで処理されますか？**

コンパイラは値を読んで（injectable.ts 310〜312 行目）そのまま ɵprov に書くだけで、意味は解釈しません。どの注入器がその ɵprov を受け取るかは実行時の `R3Injector.injectableDefInScope` が決めます（[NgModule 第 10 回](../ngmodule/10-ngmodule-provided-in.md)）。

**Q. useClass で別クラスを指定したとき、deps を書く・書かないで何が変わりますか？**

書かなければ `t => Other.ɵfac(t)`（injectable\_compiler\_2.ts 79 行目 → 184 行目）で、Other の**コンストラクタ引数の注入は Other の ɵfac** が行います。Other に `@Injectable()` が無いと ɵfac が無く、inject した瞬間に `TypeError: Other.ɵfac is not a function` になります（この章のデモも、最初 AltImpl にデコレータを付け忘れてこれで落ちました）。書けば 66〜73 行目で `new Other(ɵɵinject(deps...))` を自分の ɵprov に直接書くので、Other に ɵfac は要りません。ただし Other の実際のコンストラクタと deps の並びがずれても気付けません。

**Q. ɵprov.factory に渡る引数 \_\_ngFactoryType\_\_ は誰が渡すのですか？**

普段 `R3Injector` が ɵprov.factory を呼ぶときは引数なしで、`if (__ngFactoryType__)`（r3\_factory.ts 153 行目）は偽、use\* の値が返ります。引数が渡るのは、ɵprov を持つ親クラスを継承したサブクラスを作るとき（r3\_injector.ts 618 行目の `inheritedInjectableDef.factory(token)` や、第 4 回の `ɵɵgetInheritedFactory`）です。そのときは use\* ではなくサブクラス自身を new します。

## 読み終えて

- `@Injectable` は ngtsc で `R3InjectableMetadata` になり、use\* は優先順 useValue → useExisting → useClass → useFactory で 1 つだけ採用（injectable.ts 328〜338 行目）
- ɵprov.factory は 3 種類：自分の ɵfac（161 行目）、別クラスの ɵfac を呼ぶ矢印関数（184 行目）、`if (t) new t() else use* の値`（r3\_factory.ts 153 行目）
- use\* を書くとコンストラクタ引数の検査が緩む（requiresValidCtor 418〜425 行目）。引数なしの `@Injectable()` も `strictInjectionParameters` が無ければ緩い
- `@Service` は ɵfac の deps が空固定でコンストラクタ注入を禁止、実行時は `autoProvided === false` 以外 `providedIn: 'root'`（interface/service.ts 32 行目）
- ɵprov も ɵfac も無いクラスは、引数 0 個なら `new`、1 個以上なら NG0204（r3\_injector.ts 600〜620 行目）

---

← 前: [ɵfac の生成：コンストラクタ引数が ɵɵinject / ɵɵdirectiveInject の呼び出しになるまで](04-di-factory.md)  
次: [InjectionToken の中身と特殊トークン：factory 付きトークン、HostAttributeToken、HOST\_TAG\_NAME](06-di-injection-token.md) →
