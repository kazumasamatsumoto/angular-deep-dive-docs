[目次](../README.md) › [DI の内側](README.md) › 第 16 回 / 全 16 回

# DevTools が注入器の木を描ける理由：injector profiler と injector\_discovery\_utils

> ngDevMode のときだけ inject のたびに emitInjectEvent / emitProviderConfiguredEvent / emitInstanceCreatedByInjectorEvent が呼ばれ、setInjectorProfiler に登録した関数へ届く。getInjectorProviders / getInjectorResolutionPath / getDependenciesFromInjectable が NodeInjector と R3Injector からどう情報を集めるか。本番ビルドでこれらが消える理由。デモで ng.getInjector 系の関数が使えるかどうかを確かめる。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/di-debug)

---

Angular DevTools の「Injector Tree」は、要素ごとのインジェクタ、そこに書かれた providers、各サービスが何をどこから inject したかを描きます。これは DevTools が実行中の DI を外から覗いているのではなく、**Angular 自身が開発モードのときだけ、inject のたびにイベントを出して記録している**からです。この章では、イベントの種類と `setInjectorProfiler`、記録係の `framework_injector_profiler.ts`、記録を読み出す `getInjectorProviders` / `getInjectorResolutionPath` / `getDependenciesFromInjectable`、それを `window.ng` に載せる行を読み、本番ビルドで全部消える理由を確かめます。

読む対象は `packages/core/src/render3/debug/injector_profiler.ts`、`render3/debug/framework_injector_profiler.ts`、`render3/util/injector_discovery_utils.ts`、`render3/util/global_utils.ts`、`render3/debug/special_providers.ts`、イベントを出す側の `di/injector_compatibility.ts`・`di/r3_injector.ts`・`render3/di.ts` です。

1. [1. 概観](01-di-overview.md)
2. [2. inject() の実装](02-di-inject-function.md)
3. [3. 注入コンテキスト](03-di-injection-context.md)
4. [4. ɵfac の生成](04-di-factory.md)
5. [5. @Injectable と @Service](05-di-injectable-compile.md)
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
16. **16. DevTools と injector profiler**（この章）

## 1. イベントは 6 種類、文脈は「どのインジェクタで、誰のために」

📄 `angular/packages/core/src/render3/debug/injector_profiler.ts` L22–55 （▶ の行: 25, 29, 34, 39, 44, 49, 54）

```ts
22 │ /**
23 │  * An enum describing the types of events that can be emitted from the injector profiler
24 │  */
25 ▶ export const enum InjectorProfilerEventType {
26 │   /**
27 │    * Emits when a service is injected.
28 │    */
29 ▶   Inject,
30 │ 
31 │   /**
32 │    * Emits when an Angular class instance is created by an injector.
33 │    */
34 ▶   InstanceCreatedByInjector,
35 │ 
36 │   /**
37 │    * Emits when an injector configures a provider.
38 │    */
39 ▶   ProviderConfigured,
40 │ 
41 │   /**
42 │    * Emits when an effect is created.
43 │    */
44 ▶   EffectCreated,
45 │ 
46 │   /**
47 │    * Emits when an after render effect phase is created.
48 │    */
49 ▶   AfterRenderEffectPhaseCreated,
50 │ 
51 │   /**
52 │    * Emits when an Angular DI system is about to create an instance corresponding to a given token.
53 │    */
54 ▶   InjectorToCreateInstanceEvent,
55 │ }
```

25 行目の `InjectorProfilerEventType` が全種類です。DI の木を描くのに使うのは主に 3 つで、29 行目 `Inject`（inject された）、39 行目 `ProviderConfigured`（インジェクタに provider が登録された）、34 行目 `InstanceCreatedByInjector`（インジェクタがインスタンスを作った）です。54 行目 `InjectorToCreateInstanceEvent` は作る直前、44・49 行目は effect の生成で、どのインジェクタの下で effect が作られたかを記録します。

📄 `angular/packages/core/src/render3/debug/injector_profiler.ts` L57–74 （▶ の行: 60, 66, 73）

```ts
57 │ /**
58 │  * An object that defines an injection context for the injector profiler.
59 │  */
60 ▶ export interface InjectorProfilerContext {
61 │   /**
62 │    *  The Injector that service is being injected into.
63 │    *      - Example: if ModuleA --provides--> ServiceA --injects--> ServiceB
64 │    *                 then inject(ServiceB) in ServiceA has ModuleA as an injector context
65 │    */
66 ▶   injector: Injector;
67 │ 
68 │   /**
69 │    *  The class where the constructor that is calling `inject` is located
70 │    *      - Example: if ModuleA --provides--> ServiceA --injects--> ServiceB
71 │    *                 then inject(ServiceB) in ServiceA has ServiceA as a construction context
72 │    */
73 ▶   token: Type<unknown> | AbstractType<unknown> | null;
74 │ }
```

どのイベントにも 60 行目の `InjectorProfilerContext` が付きます。66 行目 `injector` は「どのインジェクタの中で」、73 行目 `token` は「どのクラスのコンストラクタが inject を呼んでいるか」です。62〜65 行目と 69〜72 行目のコメントの例のとおり、`ServiceA` のコンストラクタで `inject(ServiceB)` したら、文脈は「`ModuleA` のインジェクタで、`ServiceA` のために」になります。

## 2. setInjectorProfiler：コールバックの配列に足すだけ

📄 `angular/packages/core/src/render3/debug/injector_profiler.ts` L210–246 （▶ の行: 210, 234–235, 238–239, 241, 243）

```ts
210 ▶ const injectorProfilerCallbacks: InjectorProfiler[] = [];
211 │ 
212 │ const NOOP_PROFILER_REMOVAL = () => {};
213 │ 
214 │ function removeProfiler(profiler: InjectorProfiler) {
215 │   const profilerIdx = injectorProfilerCallbacks.indexOf(profiler);
216 │   if (profilerIdx !== -1) {
217 │     injectorProfilerCallbacks.splice(profilerIdx, 1);
218 │   }
219 │ }
220 │ 
221 │ /**
222 │  * Adds a callback function which will be invoked during certain DI events within the
223 │  * runtime (for example: injecting services, creating injectable instances, configuring providers).
224 │  * Multiple profiler callbacks can be set: in this case profiling events are
225 │  * reported to every registered callback.
226 │  *
227 │  * Warning: this function is *INTERNAL* and should not be relied upon in application's code.
228 │  * The contract of the function might be changed in any release and/or the function can be removed
229 │  * completely.
230 │  *
231 │  * @param profiler function provided by the caller or null value to disable profiling.
232 │  * @returns a cleanup function that, when invoked, removes a given profiler callback.
233 │  */
234 ▶ export function setInjectorProfiler(injectorProfiler: InjectorProfiler | null): () => void {
235 ▶   !ngDevMode && throwError('setInjectorProfiler should never be called in production mode');
236 │ 
237 │   if (injectorProfiler !== null) {
238 ▶     if (!injectorProfilerCallbacks.includes(injectorProfiler)) {
239 ▶       injectorProfilerCallbacks.push(injectorProfiler);
240 │     }
241 ▶     return () => removeProfiler(injectorProfiler);
242 │   } else {
243 ▶     injectorProfilerCallbacks.length = 0;
244 │     return NOOP_PROFILER_REMOVAL;
245 │   }
246 │ }
```

📄 `angular/packages/core/src/render3/debug/injector_profiler.ts` L248–260 （▶ の行: 253–254, 256, 258）

```ts
248 │ /**
249 │  * Injector profiler function which emits on DI events executed by the runtime.
250 │  *
251 │  * @param event InjectorProfilerEvent corresponding to the DI event being emitted
252 │  */
253 ▶ export function injectorProfiler(event: InjectorProfilerEvent): void {
254 ▶   !ngDevMode && throwError('Injector profiler should never be called in production mode');
255 │ 
256 ▶   for (let i = 0; i < injectorProfilerCallbacks.length; i++) {
257 │     const injectorProfilerCallback = injectorProfilerCallbacks[i];
258 ▶     injectorProfilerCallback(event);
259 │   }
260 │ }
```

1. **210 行目：モジュールの中の配列 1 つ**

   登録先はインジェクタごとではなく、ページ全体で 1 つの配列 `injectorProfilerCallbacks` です。
2. **238〜241 行目：重複しなければ push、解除関数を返す**

   243 行目、`null` を渡すと全部消します。227〜229 行目のコメントのとおり**内部 API**で、アプリから呼ぶものではありません。
3. **256〜258 行目：`injectorProfiler(event)` は全員に配る**

   イベントを出す側は必ずこの関数を通ります。登録が 0 件ならループが空回りするだけです。
4. **235・254 行目：`!ngDevMode && throwError(...)`**

   ガードの向きに注意してください。`if (ngDevMode)` で中身を守っているのでは**なく**、本番モードで呼ばれたら投げます。これらの関数は「本番では呼ばれないこと」を前提にしていて、呼ばない責任は呼ぶ側（3 節）にあります。

## 3. イベントを出す側：いつも ngDevMode の中

📄 `angular/packages/core/src/render3/debug/injector_profiler.ts` L336–353 （▶ の行: 341, 346, 348, 350–351）

```ts
336 │ /**
337 │  * @param token DI token associated with injected service
338 │  * @param value the instance of the injected service (i.e the result of `inject(token)`)
339 │  * @param flags the flags that the token was injected with
340 │  */
341 ▶ export function emitInjectEvent(
342 │   token: Type<unknown>,
343 │   value: unknown,
344 │   flags: InternalInjectFlags,
345 │ ): void {
346 ▶   !ngDevMode && throwError('Injector profiler should never be called in production mode');
347 │ 
348 ▶   injectorProfiler({
349 │     type: InjectorProfilerEventType.Inject,
350 ▶     context: getInjectorProfilerContext(),
351 ▶     service: {token, value, flags},
352 │   });
353 │ }
```

341 行目の `emitInjectEvent` も 346 行目で同じガードを持ち、348〜351 行目で「今の文脈（`getInjectorProfilerContext()`）」と `{token, value, flags}` を詰めて配ります。他の `emit*` 関数も同じ形です。これを呼んでいる場所を 3 つ見ます。

📄 `angular/packages/core/src/di/injector_compatibility.ts` L104–112 （▶ の行: 110–111）

```ts
104 │   } else if (currentInjector === null) {
105 │     return injectRootLimpMode(token, undefined, flags);
106 │   } else {
107 │     const options = convertToInjectOptions(flags);
108 │     // TODO: improve the typings here.
109 │     // `token` can be a multi: true provider definition, which is considered as a Token but not represented in the typings
110 ▶     const value = currentInjector.retrieve(token as PrimitivesInjectionToken<T>, options) as T;
111 ▶     ngDevMode && emitInjectEvent(token as Type<unknown>, value, flags);
112 │     if (isNotFound(value)) {
```

111 行目、`injectInjectorOnly`（環境インジェクタ側の `inject()`。[第 2 回](02-di-inject-function.md)）が 110 行目で値を取った**直後**に `ngDevMode && emitInjectEvent(...)`。要素側の `ɵɵdirectiveInject` も最後の行で同じ形の 1 行を持っています。

📄 `angular/packages/core/src/di/r3_injector.ts` L483–494 （▶ の行: 483–484, 488–490, 493）

```ts
483 ▶     if (ngDevMode) {
484 ▶       runInInjectorProfilerContext(this, token, () => {
485 │         // Emit InjectorProfilerEventType.Create if provider is a value provider because
486 │         // these are the only providers that do not go through the value hydration logic
487 │         // where this event would normally be emitted from.
488 ▶         if (isValueProvider(provider)) {
489 ▶           emitInjectorToCreateInstanceEvent(token);
490 ▶           emitInstanceCreatedByInjectorEvent(provider.useValue);
491 │         }
492 │ 
493 ▶         emitProviderConfiguredEvent(provider);
494 │       });
```

`R3Injector.processProvider`（provider を records に入れる関数。[第 7 回](07-di-provider-to-factory.md)）の途中です。483 行目の `if (ngDevMode)` の中で、484 行目で文脈を「このインジェクタ・このトークン」にして、493 行目で `ProviderConfigured` を出します。488〜491 行目、`useValue` は factory を通らない（値が最初からある）ので、作成のイベントもここで出しておきます。要素側では `resolveProvider` が同じように `new NodeInjector(tNode, lView)` を文脈にして出します（`di_setup.ts`、引用は省略）。

📄 `angular/packages/core/src/render3/di.ts` L766–775 （▶ の行: 767–769）

```ts
766 │     let prevInjectContext: InjectorProfilerContext | undefined;
767 ▶     if (ngDevMode) {
768 ▶       const injector = new NodeInjector(tNode, lView);
769 ▶       prevInjectContext = setInjectorProfilerContext({injector, token});
770 │     }
771 │ 
772 │     const previousInjectImplementation = factory.injectImpl
773 │       ? setInjectImplementation(factory.injectImpl)
774 │       : null;
775 │     const success = enterDI(lView, tNode, InternalInjectFlags.Default);
```

`getNodeInjectable`（NodeInjector がディレクティブや provider のインスタンスを作る関数。[第 11 回](11-di-node-injector-lookup.md)）は、767〜769 行目で factory を呼ぶ前に文脈を「`new NodeInjector(tNode, lView)` で、`token`（作ろうとしているクラス）のために」にします。この間に factory の中で呼ばれた `inject()` は、すべて「そのクラスの依存」として記録されます。`NodeInjector` はここで**文脈のためだけに new されている**ことにも注意してください。DI の本体は NodeInjector オブジェクトを使いません。

## 4. 記録係：framework\_injector\_profiler.ts

📄 `angular/packages/core/src/render3/debug/framework_injector_profiler.ts` L107–126 （▶ の行: 108–109, 115–116, 119–120）

```ts
107 │ export function setupFrameworkInjectorProfiler(): void {
108 ▶   frameworkDIDebugData.reset();
109 ▶   setInjectorProfiler(injectorProfilerEventHandler);
110 │ }
111 │ 
112 │ function injectorProfilerEventHandler(injectorProfilerEvent: InjectorProfilerEvent): void {
113 │   const {context, type} = injectorProfilerEvent;
114 │ 
115 ▶   if (type === InjectorProfilerEventType.Inject) {
116 ▶     handleInjectEvent(context, injectorProfilerEvent.service);
117 │   } else if (type === InjectorProfilerEventType.InstanceCreatedByInjector) {
118 │     handleInstanceCreatedByInjectorEvent(context, injectorProfilerEvent.instance);
119 ▶   } else if (type === InjectorProfilerEventType.ProviderConfigured) {
120 ▶     handleProviderConfiguredEvent(context, injectorProfilerEvent.providerRecord);
121 │   } else if (type === InjectorProfilerEventType.EffectCreated) {
122 │     handleEffectCreatedEvent(context, injectorProfilerEvent.effect);
123 │   } else if (type === InjectorProfilerEventType.AfterRenderEffectPhaseCreated) {
124 │     handleEffectCreatedEvent(context, injectorProfilerEvent.effectPhase);
125 │   }
126 │ }
```

109 行目、Angular 自身が `setInjectorProfiler` に `injectorProfilerEventHandler` を登録します。誰がこれを呼ぶかは 6 節です。115〜120 行目でイベントの種類ごとに振り分けます。記録先は次の構造です。

📄 `angular/packages/core/src/render3/debug/framework_injector_profiler.ts` L67–77 （▶ の行: 68, 72–73, 77）

```ts
67 │ class DIDebugData {
68 ▶   resolverToTokenToDependencies = new WeakMap<
69 │     Injector | LView,
70 │     WeakMap<Type<unknown> | AbstractType<unknown>, InjectedService[]>
71 │   >();
72 ▶   resolverToProviders = new WeakMap<Injector | TNode, ProviderRecord[]>();
73 ▶   resolverToEffects = new WeakMap<
74 │     Injector | LView,
75 │     (EffectRefImpl | AfterRenderPhaseEffectNode)[]
76 │   >();
77 ▶   standaloneInjectorToComponent = new WeakMap<Injector, Type<unknown>>();
```

68 行目「インジェクタ（か LView）→ クラス → そのクラスが inject したものの一覧」、72 行目「インジェクタ（か TNode）→ そこに登録された provider の一覧」、77 行目「standalone コンポーネントの環境インジェクタ → そのコンポーネント」。全部 `WeakMap` なので、コンポーネントが破棄されれば記録も一緒に GC されます（このクラスの上のコメントにそう書かれています）。

📄 `angular/packages/core/src/render3/debug/framework_injector_profiler.ts` L166–201 （▶ の行: 167, 172, 180, 185, 189, 196–197, 199）

```ts
166 │ function handleInjectEvent(context: InjectorProfilerContext, data: InjectedService) {
167 ▶   const diResolver = getDIResolver(context.injector);
168 │   if (diResolver === null) {
169 │     throwError('An Inject event must be run within an injection context.');
170 │   }
171 │ 
172 ▶   const diResolverToInstantiatedToken = frameworkDIDebugData.resolverToTokenToDependencies;
173 │ 
174 │   if (!diResolverToInstantiatedToken.has(diResolver)) {
175 │     diResolverToInstantiatedToken.set(diResolver, new WeakMap<Type<unknown>, InjectedService[]>());
176 │   }
177 │ 
178 │   // if token is a primitive type, ignore this event. We do this because we cannot keep track of
179 │   // non-primitive tokens in WeakMaps since they are not garbage collectable.
180 ▶   if (!canBeHeldWeakly(context.token)) {
181 │     return;
182 │   }
183 │ 
184 │   const instantiatedTokenToDependencies = diResolverToInstantiatedToken.get(diResolver)!;
185 ▶   if (!instantiatedTokenToDependencies.has(context.token!)) {
186 │     instantiatedTokenToDependencies.set(context.token!, []);
187 │   }
188 │ 
189 ▶   const {token, value, flags} = data;
190 │ 
191 │   assertDefined(context.token, 'Injector profiler context token is undefined.');
192 │ 
193 │   const dependencies = instantiatedTokenToDependencies.get(context.token);
194 │   assertDefined(dependencies, 'Could not resolve dependencies for token.');
195 │ 
196 ▶   if (context.injector instanceof NodeInjector) {
197 ▶     dependencies.push({token, value, flags, injectedIn: getNodeInjectorContext(context.injector)});
198 │   } else {
199 ▶     dependencies.push({token, value, flags});
200 │   }
201 │ }
```

📄 `angular/packages/core/src/render3/debug/framework_injector_profiler.ts` L327–349 （▶ の行: 339–340, 344–345）

```ts
327 │ function getDIResolver(injector: Injector | undefined): Injector | LView | null {
328 │   let diResolver: Injector | LView | null = null;
329 │ 
330 │   if (injector === undefined) {
331 │     return diResolver;
332 │   }
333 │ 
334 │   // We use the LView as the diResolver for NodeInjectors because they
335 │   // do not persist anywhere in the framework. They are simply wrappers around an LView and a TNode
336 │   // that do persist. Because of this, we rely on the LView of the NodeInjector in order to use
337 │   // as a concrete key to represent this injector. If we get the same LView back later, we know
338 │   // we're looking at the same injector.
339 ▶   if (injector instanceof NodeInjector) {
340 ▶     diResolver = getNodeInjectorLView(injector);
341 │   }
342 │   // Other injectors can be used a keys for a map because their instances
343 │   // persist
344 ▶   else {
345 ▶     diResolver = injector;
346 │   }
347 │ 
348 │   return diResolver;
349 │ }
```

1. **167 行目 → 339〜340 行目：NodeInjector なら鍵は LView**

   3 節で見たとおり `NodeInjector` は毎回 new される使い捨てなので、WeakMap の鍵にできません。334〜338 行目のコメントどおり、残り続ける `LView` を鍵にします。`R3Injector` は 344〜345 行目でそれ自身が鍵です。
2. **180 行目：文脈の token がオブジェクトでなければ捨てる**

   WeakMap の鍵にできない値（文字列など）は記録しません。
3. **185・189 行目：「文脈の token（inject した側）」の配列に「inject されたもの」を足す**

   189 行目でイベントの `{token, value, flags}` を取り出します。
4. **196〜199 行目：NodeInjector なら `injectedIn` に lView と tNode**

   同じ LView の別の要素の記録が混ざるので、どの TNode での inject かを持たせます。読み出し側（5 節）がこれで絞り込みます。

📄 `angular/packages/core/src/render3/debug/framework_injector_profiler.ts` L303–325 （▶ の行: 310–311, 313, 324）

```ts
303 │ function handleProviderConfiguredEvent(
304 │   context: InjectorProfilerContext,
305 │   data: ProviderRecord,
306 │ ): void {
307 │   const {resolverToProviders} = frameworkDIDebugData;
308 │ 
309 │   let diResolver: Injector | TNode;
310 ▶   if (context?.injector instanceof NodeInjector) {
311 ▶     diResolver = getNodeInjectorTNode(context.injector) as TNode;
312 │   } else {
313 ▶     diResolver = context.injector;
314 │   }
315 │ 
316 │   if (diResolver === null) {
317 │     throwError('A ProviderConfigured event must be run within an injection context.');
318 │   }
319 │ 
320 │   if (!resolverToProviders.has(diResolver)) {
321 │     resolverToProviders.set(diResolver, []);
322 │   }
323 │ 
324 ▶   resolverToProviders.get(diResolver)!.push(data);
325 │ }
```

provider の記録では、310〜311 行目で NodeInjector のとき **TNode** を鍵にします。provider の登録は最初の作成パス（TView ごとに 1 回）にしか起きないので、同じテンプレートから作られた LView 全部で共有される TNode が正しい鍵です（4 節の構造の上のコメントにも同じ説明があります）。

## 5. 読み出し：injector\_discovery\_utils.ts

📄 `angular/packages/core/src/render3/util/injector_discovery_utils.ts` L491–499 （▶ の行: 492–495）

```ts
491 │ export function getInjectorProviders(injector: Injector): ProviderRecord[] {
492 ▶   if (injector instanceof NodeInjector) {
493 ▶     return getNodeInjectorProviders(injector);
494 ▶   } else if (injector instanceof EnvironmentInjector) {
495 ▶     return getEnvironmentInjectorProviders(injector as EnvironmentInjector);
496 │   }
497 │ 
498 │   throwError('getInjectorProviders only supports NodeInjector and EnvironmentInjector');
499 │ }
```

📄 `angular/packages/core/src/render3/util/injector_discovery_utils.ts` L219–231 （▶ の行: 220, 222, 224, 230）

```ts
219 │ function getNodeInjectorProviders(injector: NodeInjector): ProviderRecord[] {
220 ▶   const diResolver = getNodeInjectorTNode(injector);
221 │   const {resolverToProviders} = getFrameworkDIDebugData();
222 ▶   const existingProviders = resolverToProviders.get(diResolver as TNode) ?? [];
223 │ 
224 ▶   const specialProviders: ProviderRecord[] = Array.from(getAllSpecialProviders()).map((token) => ({
225 │     token: token as any,
226 │     isViewProvider: false,
227 │     provider: token as any,
228 │   }));
229 │ 
230 ▶   return [...existingProviders, ...specialProviders];
231 │ }
```

📄 `angular/packages/core/src/render3/debug/special_providers.ts` L9–27 （▶ の行: 9, 17–18, 25）

```ts
 9 ▶ const specialProviders = new Set<any>();
10 │ 
11 │ /**
12 │  * Registers a class as a special provider for debug tooling.
13 │  *
14 │  * @param clazz The class to register
15 │  */
16 │ export function registerSpecialProvider(clazz: any): void {
17 ▶   if (typeof ngDevMode !== 'undefined' && ngDevMode) {
18 ▶     specialProviders.add(clazz);
19 │   }
20 │ }
21 │ 
22 │ /**
23 │  * Gets all special providers that have been registered.
24 │  */
25 ▶ export function getAllSpecialProviders(): ReadonlySet<any> {
26 │   return specialProviders;
27 │ }
```

`getInjectorProviders` は 492〜495 行目で NodeInjector と環境インジェクタに分かれます。NodeInjector 側は 222 行目で 4 節の `resolverToProviders` を TNode で引き、224〜230 行目で**特殊トークンの一覧を足して**返します。その一覧は special\_providers.ts 17〜18 行目で開発モードのときだけ集められたもので、[第 13 回](13-di-special-tokens.md)の `ElementRef`・`ChangeDetectorRef` などのファイル末尾の `registerSpecialProvider(...)` がここに入れています。provider が無くても取れる、という第 13 回の事実を、DevTools は「どの要素にもある provider」として表示しているわけです。

📄 `angular/packages/core/src/render3/util/injector_discovery_utils.ts` L516–540 （▶ の行: 523, 528, 531–532, 535–536）

```ts
516 │ export function getInjectorMetadata(
517 │   injector: Injector,
518 │ ):
519 │   | {type: 'element'; source: RElement}
520 │   | {type: 'environment'; source: string | null}
521 │   | {type: 'null'; source: null}
522 │   | null {
523 ▶   if (injector instanceof NodeInjector) {
524 │     const lView = getNodeInjectorLView(injector);
525 │     const tNode = getNodeInjectorTNode(injector)!;
526 │     assertTNodeForLView(tNode, lView);
527 │ 
528 ▶     return {type: 'element', source: getNativeByTNode(tNode, lView) as RElement};
529 │   }
530 │ 
531 ▶   if (injector instanceof R3Injector) {
532 ▶     return {type: 'environment', source: injector.source ?? null};
533 │   }
534 │ 
535 ▶   if (injector instanceof NullInjector) {
536 ▶     return {type: 'null', source: null};
537 │   }
538 │ 
539 │   return null;
540 │ }
```

木の 1 つの箱に書くラベルがこれです。NodeInjector なら 528 行目でその要素、`R3Injector` なら 532 行目で `source`（作るときに付けた名前。`bootstrapApplication` のルートなら開発モードで `Environment Injector`、standalone の環境インジェクタなら `Standalone[...]`。名前を付けずに作られたものは `null`）、`NullInjector` なら 536 行目。

📄 `angular/packages/core/src/render3/util/injector_discovery_utils.ts` L542–578 （▶ の行: 543, 552, 557–558, 561, 566, 573）

```ts
542 │ export function getInjectorResolutionPath(injector: Injector): Injector[] {
543 ▶   const resolutionPath: Injector[] = [injector];
544 │   getInjectorResolutionPathHelper(injector, resolutionPath);
545 │   return resolutionPath;
546 │ }
547 │ 
548 │ function getInjectorResolutionPathHelper(
549 │   injector: Injector,
550 │   resolutionPath: Injector[],
551 │ ): Injector[] {
552 ▶   const parent = getInjectorParent(injector);
553 │ 
554 │   // if getInjectorParent can't find a parent, then we've either reached the end
555 │   // of the path, or we need to move from the Element Injector tree to the
556 │   // module injector tree using the first injector in our path as the connection point.
557 ▶   if (parent === null) {
558 ▶     if (injector instanceof NodeInjector) {
559 │       const firstInjector = resolutionPath[0];
560 │       if (firstInjector instanceof NodeInjector) {
561 ▶         const moduleInjector = getModuleInjectorOfNodeInjector(firstInjector);
562 │         if (moduleInjector === null) {
563 │           throwError('NodeInjector must have some connection to the module injector tree');
564 │         }
565 │ 
566 ▶         resolutionPath.push(moduleInjector);
567 │         getInjectorResolutionPathHelper(moduleInjector, resolutionPath);
568 │       }
569 │ 
570 │       return resolutionPath;
571 │     }
572 │   } else {
573 ▶     resolutionPath.push(parent);
574 │     getInjectorResolutionPathHelper(parent, resolutionPath);
575 │   }
576 │ 
577 │   return resolutionPath;
578 │ }
```

1. **552 行目：`getInjectorParent` で 1 つ上へ**

   `R3Injector` なら `parent`、NodeInjector なら親要素の NodeInjector（ブルームフィルタと同じ親の位置情報を使う。[第 10 回](10-di.md)）です。
2. **557〜566 行目：要素の木の根まで来たら環境インジェクタの木へ飛ぶ**

   親が無い NodeInjector に来たら、561 行目で**最初の**NodeInjector の `lView[INJECTOR]` から環境インジェクタを求めて足し、そこから 573 行目と同じく親を辿ります。`inject()` が NodeInjector で見つからなかったら `lView[INJECTOR]` へ行く（第 11 回）のと同じ道を、関数で再現しています。

📄 `angular/packages/core/src/render3/util/injector_discovery_utils.ts` L53–69 （▶ の行: 61, 66–67）

```ts
53 │ export function getDependenciesFromInjectable<T>(
54 │   injector: Injector,
55 │   token: Type<T> | InjectionToken<T>,
56 │ ): {instance: T; dependencies: Omit<InjectedService, 'injectedIn'>[]} | undefined {
57 │   // First we check to see if the token given maps to an actual instance in the injector given.
58 │   // We use `self: true` because we only want to look at the injector we were given.
59 │   // We use `optional: true` because it's possible that the token we were given was never
60 │   // constructed by the injector we were given.
61 ▶   const instance = injector.get(token, null, {self: true, optional: true});
62 │   if (instance === null) {
63 │     throw new Error(`Unable to determine instance of ${token} in given injector`);
64 │   }
65 │ 
66 ▶   const unformattedDependencies = getDependenciesForTokenInInjector(token, injector);
67 ▶   const resolutionPath = getInjectorResolutionPath(injector);
68 │ 
69 │   const dependencies = unformattedDependencies.map((dep) => {
```

`getDependenciesFromInjectable(injector, token)` は 61 行目でまず `self: true` でインスタンスがあるか確かめ、66 行目で 4 節の記録（`resolverToTokenToDependencies`）から「`token` が inject したもの」を引き、67 行目の解決経路を上から順に `get(dep.token, null, {self: true})` して、最初に持っていたインジェクタを `providedIn` として付けます（この引用の続き）。つまり「どこから来たか」は記録ではなく、**後から経路を引き直して**求めています。

## 6. window.ng に載せるのは開発モードだけ

📄 `angular/packages/core/src/render3/util/global_utils.ts` L142–171 （▶ の行: 148–151, 164）

```ts
142 │ const externalCoreGlobalUtils: ExternalCoreGlobalUtils = {
143 │   /**
144 │    * Warning: functions that start with `ɵ` are considered *INTERNAL* and should not be relied upon
145 │    * in application's code. The contract of those functions might be changed in any release and/or a
146 │    * function can be removed completely.
147 │    */
148 ▶   'ɵgetDependenciesFromInjectable': getDependenciesFromInjectable,
149 ▶   'ɵgetInjectorProviders': getInjectorProviders,
150 ▶   'ɵgetInjectorResolutionPath': getInjectorResolutionPath,
151 ▶   'ɵgetInjectorMetadata': getInjectorMetadata,
152 │   'ɵsetProfiler': setProfiler,
153 │   'ɵgetSignalGraph': getSignalGraph,
154 │   'ɵgetControlFlowBlocks': getControlFlowBlocks,
155 │   'ɵgetTransferState': getTransferState,
156 │   'ɵgetComponentInstanceDeepLinkId': getComponentInstanceDeepLinkId,
157 │ 
158 │   getDirectiveMetadata,
159 │   getComponent,
160 │   getContext,
161 │   getListeners,
162 │   getOwningComponent,
163 │   getHostElement,
164 ▶   getInjector,
165 │   getRootComponents,
166 │   getDirectives,
167 │   applyChanges,
168 │   isSignal,
169 │ 
170 │   enableProfiling,
171 │ };
```

📄 `angular/packages/core/src/render3/util/global_utils.ts` L173–197 （▶ の行: 180–181, 184, 186, 189–190）

```ts
173 │ let _published = false;
174 │ /**
175 │  * Publishes a collection of default debug tools onto`window.ng`.
176 │  *
177 │  * These functions are available globally when Angular is in development
178 │  * mode and are automatically stripped away from prod mode is on.
179 │  */
180 ▶ export function publishDefaultGlobalUtils() {
181 ▶   if (!_published) {
182 │     _published = true;
183 │ 
184 ▶     if (typeof window !== 'undefined') {
185 │       // Only configure the injector profiler when running in the browser.
186 ▶       setupFrameworkInjectorProfiler();
187 │     }
188 │ 
189 ▶     for (const [methodName, method] of Object.entries(externalCoreGlobalUtils)) {
190 ▶       publishGlobalUtil(methodName as keyof ExternalCoreGlobalUtils, method);
191 │     }
192 │ 
193 │     for (const [methodName, method] of Object.entries(internalCoreGlobalUtils)) {
194 │       publishGlobalUtil(methodName as keyof InternalCoreGlobalUtils, method);
195 │     }
196 │   }
197 │ }
```

📄 `angular/packages/core/src/render3/util/global_utils.ts` L230–242 （▶ の行: 231, 236, 239–240）

```ts
230 │ function publishUtil(name: string, fn: Function) {
231 ▶   if (typeof COMPILED === 'undefined' || !COMPILED) {
232 │     // Note: we can't export `ng` when using closure enhanced optimization as:
233 │     // - closure declares globals itself for minified names, which sometimes clobber our `ng` global
234 │     // - we can't declare a closure extern as the namespace `ng` is already used within Google
235 │     //   for typings for AngularJS (via `goog.provide('ng....')`).
236 ▶     const w = global;
237 │     ngDevMode && assertDefined(fn, 'function not defined');
238 │ 
239 ▶     w[GLOBAL_PUBLISH_EXPANDO_KEY] ??= {} as any;
240 ▶     w[GLOBAL_PUBLISH_EXPANDO_KEY][name] = fn;
241 │   }
242 │ }
```

1. **148〜151・164 行目：公開する関数の表**

   5 節の 4 関数は `ɵ` 付きの名前で、`getInjector`（要素から NodeInjector を作る）は付かない名前で並びます。144〜146 行目のコメントのとおり、`ɵ` 付きは内部用で、いつでも変わり得ます。DevTools はこれらを呼びます。
2. **184〜186 行目：ブラウザなら記録係を起動**

   4 節 109 行目の `setupFrameworkInjectorProfiler()` を呼ぶのはここです。サーバーでは起動しません。
3. **189〜190・239〜240 行目：`window.ng[name] = fn`**

   236 行目の `global` はブラウザでは `window`。231 行目は Closure Compiler で最適化する Google 内部のビルド向けの除外です。

📄 `angular/packages/core/src/application/application_ref.ts` L66–68 （▶ の行: 67）

```ts
66 │ export function publishDefaultGlobalUtils() {
67 ▶   ngDevMode && _publishDefaultGlobalUtils();
68 │ }
```

そして 180 行目の関数は、直接ではなく 67 行目の `ngDevMode && _publishDefaultGlobalUtils()` を経由して呼ばれます。呼ぶのは `createPlatform` と `createOrReusePlatformInjector` の冒頭（`bootstrapApplication` が最初に通る所。[boot-injectors](../boot/08-boot-injectors.md)）です。

## 7. 本番ビルドで消える理由

本番ビルド（`optimization` が有効）では、Angular CLI が esbuild の `define` で `ngDevMode` を `false` という定数に置き換えます （`application-code-bundle.ts` のその行は [boot-browser-load](../boot/06-boot-browser-load.md) で引用済み）。すると次のように連鎖して消えます。

1. **呼ぶ側の 1 行が死んだコードになる**

   `ngDevMode && emitInjectEvent(...)`（111 行目）は `false && ...`、`if (ngDevMode) { ... }`（483・767 行目）は `if (false)` になり、ミニファイアが削除します。
2. **呼ばれなくなった関数がバンドルから落ちる**

   `emitInjectEvent`・`setInjectorProfiler`・記録係・`injector_discovery_utils.ts` の関数は、どこからも参照されなくなるので tree-shaking で消えます。235 行目などの `!ngDevMode && throwError` は、関数そのものが残らないので実行されることもありません。
3. **`window.ng` が作られない**

   67 行目が `false && ...` なので `publishDefaultGlobalUtils` が呼ばれず、239 行目の `window.ng` は生まれません。

> [!NOTE]
> **ポイント**
>
> 第 13 回の `registerSpecialProvider` も、呼び出しが `if (typeof ngDevMode === 'undefined' || ngDevMode)` の中、関数の中身も 17 行目で `ngDevMode` を見るので、本番では空です。「DevTools のための仕組み」は、性能にも bundle サイズにも、本番では一切残りません。

## 8. DEMO：このページで window.ng を使う

> **🧪 DEMO — &lt;app-debug-probe&gt; の要素から ng.\* を呼ぶ**
>
> 子コンポーネントは `ElementRef`・`DEBUG_DEMO_TOKEN`（章コンポーネントの providers）・`ApplicationRef` を inject しています。描画後（`afterNextRender`）に `window.ng` があれば、5 節の関数でこの要素のインジェクタを調べます。`ng serve`（開発ビルド）で開くと関数が並び、公開サイト（本番ビルド）では `typeof window.ng` が `undefined` になり何も出ません。**本番ではそれが正しい挙動**です（7 節）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/di-debug)

- 経路の先頭は `element <app-debug-probe>`、次に `<app-chapter-shell>`・章のホスト要素・`<router-outlet>`・`<app-root>` と要素を登り、その後に `environment: "Environment Injector"`（ルート）、`environment: null`（名前の無いプラットフォームのインジェクタ）、`null: null`（NullInjector）が続きます。開発ビルドで実際にこの 8 行になりました（要素から環境への飛び移りは 557〜566 行目）
- 依存一覧の `DEBUG_DEMO_TOKEN ← element <app-chapter-di-debug>` は、章コンポーネントの providers から来たことを経路の引き直し（5 節）で求めた結果
- providers の一覧に `ElementRef`・`ViewContainerRef`・`DestroyRef` などが出るのは 224〜230 行目の特殊トークンの追加。このノードには providers が無いので、一覧は特殊トークンだけです（クラス名の先頭の `_` はバンドラが付けたもの）

## ここまでの呼び出し

- 👤 `bootstrapApplication(App, appConfig)` — src/main.ts
  - `createOrReusePlatformInjector()` → `publishDefaultGlobalUtils()` — application/application\_ref.ts L67 — *ngDevMode && …（本番ではここで終わり）*
    - `setupFrameworkInjectorProfiler()` — render3/util/global\_utils.ts L186 — *ブラウザのときだけ*
      - `setInjectorProfiler(injectorProfilerEventHandler)` — framework\_injector\_profiler.ts L109 → injector\_profiler.ts L239
    - `window.ng[name] = fn` — global\_utils.ts L240
- 👤 `inject(ApplicationRef)` — あなたのコンポーネント
  - `getNodeInjectable` が文脈を設定 — render3/di.ts L769 — *{ injector: new NodeInjector, token: あなたのクラス }*
  - `ngDevMode && emitInjectEvent(token, value, flags)` — ɵɵdirectiveInject の最後 / injector\_compatibility.ts L111
    - `injectorProfiler(event)` — injector\_profiler.ts L256-258
      - `handleInjectEvent(context, service)` — framework\_injector\_profiler.ts L166 — *WeakMap\[LView or R3Injector\]\[あなたのクラス\].push(...)*
- 👤 `ng.ɵgetDependenciesFromInjectable(injector, Cls)` — DevTools / コンソール
  - `getDependenciesForTokenInInjector` + `getInjectorResolutionPath` — injector\_discovery\_utils.ts L66-67 — *記録を引き、経路を辿って providedIn を求める*

## 聞かれそうな質問

**Q. Angular DevTools の Injector Tree はどこから情報を取っていますか？**

`window.ng` に載った `ɵgetInjectorResolutionPath`・`ɵgetInjectorProviders`・`ɵgetInjectorMetadata`・`ɵgetDependenciesFromInjectable`（global\_utils.ts 148〜151 行目）です。その中身は、`framework_injector_profiler.ts` が inject や provider 登録のたびに WeakMap に貯めた記録（68・72 行目）と、インジェクタの親を辿る関数（552 行目）でできています。記録は `setupFrameworkInjectorProfiler`（global\_utils.ts 186 行目）が起動した後の出来事だけです。

**Q. 本番で ng.getInjector は使えますか？**

使えません。`window.ng` を作る `publishDefaultGlobalUtils` は application\_ref.ts 67 行目の `ngDevMode &&` の後ろにしかなく、本番ビルドでは `ngDevMode` が `false` の定数なので呼ばれません。このページの DEMO が本番では「無い」と表示するのがそれです。仮に記録係だけを動かそうとしても、`setInjectorProfiler` 自体が 235 行目で本番では投げます。

**Q. injector profiler は性能に影響しますか？**

開発モードでは影響します。inject のたびに 3 節の `new NodeInjector`（767〜769 行目）や文脈の付け替え、配列への push（4 節）が走ります。本番ではイベントを出す行がすべて `ngDevMode &&` か `if (ngDevMode)` の中なので、コードごと消えて影響はゼロです。開発ビルドの計測値を本番の性能の根拠にしてはいけない理由の 1 つです。

**Q. アプリのコードで setInjectorProfiler を使って依存を監視できますか？**

できませんし、すべきでもありません。227〜229 行目のコメントが「内部 API で、いつ変わっても消えてもよい」と書いており、本番では 235 行目で例外です。そもそも `setInjectorProfiler` は `@angular/core` の export に入っていません（インストール済みの `core.d.ts` の export 一覧にあるのは内部用の `ɵsetInjectorProfilerContext` だけです）。開発中に依存を見たいなら、DEMO のように `window.ng` の関数を使います。

## 読み終えて

- DI は開発モードのときだけ、inject・provider 登録・インスタンス作成のたびに `injectorProfiler(event)` を呼ぶ。呼ぶ行はすべて `ngDevMode` の中
- イベントには「どのインジェクタで、どのクラスのために」の文脈が付く。NodeInjector は文脈のためだけに new される
- `framework_injector_profiler.ts` が WeakMap に記録し、NodeInjector の記録は LView（inject）と TNode（provider）を鍵にする
- `getInjectorResolutionPath` は要素の木を登ってから `lView[INJECTOR]` で環境の木へ飛ぶ。providedIn は記録ではなく経路の引き直しで求める
- `window.ng` と記録係は `ngDevMode && publishDefaultGlobalUtils()` からしか起動せず、本番ビルドでは丸ごと消える

---

← 前: [injectAsync と onIdle：サービスを遅延読み込みする新しい API](15-di-inject-async.md)  
次: [Signal の概観：version と epoch、2 つのカウンタで無駄な再計算を止める](../signals/01-signals.md) →
