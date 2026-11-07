[目次](../README.md) › [DI の内側](README.md) › 第 2 回 / 全 16 回

# inject() の実装：ɵɵinject と 2 つのスイッチ（\_currentInjector と \_injectImplementation）

> inject() は convertToBitFlags でオプションをビットにして ɵɵinject を呼ぶだけ。ɵɵinject は getInjectImplementation() があれば NodeInjector 用の ɵɵdirectiveInject、無ければ injectInjectorOnly で primitives の \_currentInjector に retrieve させる。誰がいつ 2 つのスイッチを切り替えるか（R3Injector.get、getNodeInjectable、pipe、runInInjectionContext）を行で追い、RetrievingInjector と NotFound の役割を示す。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/di-inject-function)

---

コンポーネントの中でもサービスの中でも、書くのは同じ `inject(Foo)` です。でも探し方は違います。コンポーネントでは要素の `NodeInjector` から、サービスでは `R3Injector` から探します。この章では、その切り替えが `inject()` の引数ではなく、**2 つのグローバル変数（モジュールの中の `let`）**で行われていることを行で確かめます。1 つは `_injectImplementation`、もう 1 つは `_currentInjector`。誰がいつ、どの値を入れて、どこで戻すかを全部追います。

読む対象は `packages/core/src/di/injector_compatibility.ts`、`inject_switch.ts`、`interface/injector.ts`、`packages/core/primitives/di/src/injector.ts`、`di/r3_injector.ts`、`packages/core/src/render3/di.ts`、`render3/interfaces/injector.ts`、`render3/pipe.ts` です。

1. [1. 概観](01-di-overview.md)
2. **2. inject() の実装**（この章）
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
16. [16. DevTools と injector profiler](16-di-debug.md)

## 1. inject() の本体は 1 行

`inject` には overload（同じ名前で引数の型が違う宣言）が 6 つあり、長い doc コメントが付いています。実装はその下のこれだけです。

📄 `angular/packages/core/src/di/injector_compatibility.ts` L293–297 （▶ の行: 293, 296）

```ts
293 ▶ export function inject<T>(token: ProviderToken<T> | HostAttributeToken, options?: InjectOptions) {
294 │   // The `as any` here _shouldn't_ be necessary, but without it JSCompiler
295 │   // throws a disambiguation  error due to the multiple signatures.
296 ▶   return ɵɵinject(token as any, convertToBitFlags(options));
297 │ }
```

296 行目、`options`（`{ optional: true }` のようなオブジェクト）を `convertToBitFlags` で数値にして、`ɵɵinject` に渡すだけです。`inject` 自身は注入器を 1 つも知りません。

## 2. オプションのオブジェクトをビットにする

📄 `angular/packages/core/src/di/injector_compatibility.ts` L299–315 （▶ の行: 303–304, 307–314）

```ts
299 │ // Converts object-based DI flags (`InjectOptions`) to bit flags (`InjectFlags`).
300 │ export function convertToBitFlags(
301 │   flags: InjectOptions | InternalInjectFlags | undefined,
302 │ ): InternalInjectFlags | undefined {
303 ▶   if (typeof flags === 'undefined' || typeof flags === 'number') {
304 ▶     return flags;
305 │   }
306 │ 
307 ▶   // While TypeScript doesn't accept it without a cast, bitwise OR with false-y values in
308 ▶   // JavaScript is a no-op. We can use that for a very codesize-efficient conversion from
309 ▶   // `InjectOptions` to `InjectFlags`.
310 ▶   return (InternalInjectFlags.Default | // comment to force a line break in the formatter
311 ▶     ((flags.optional && InternalInjectFlags.Optional) as number) |
312 ▶     ((flags.host && InternalInjectFlags.Host) as number) |
313 ▶     ((flags.self && InternalInjectFlags.Self) as number) |
314 ▶     ((flags.skipSelf && InternalInjectFlags.SkipSelf) as number)) as InternalInjectFlags;
315 │ }
```

303〜304 行目、`undefined`（オプション無し）か既に数値なら、そのまま返します。310〜314 行目、`flags.optional && Optional` は `optional` が真ならビットの値、偽なら `false` や `undefined` になります。307〜309 行目のコメントのとおり、JavaScript では `0 | false` も `0 | undefined` も `0` なので、if を書かずに OR だけで足し合わせられます。ビットの値はこう決まっています。

📄 `angular/packages/core/src/di/interface/injector.ts` L26–52 （▶ の行: 26, 28, 34, 37, 40, 43, 51）

```ts
26 ▶ export const enum InternalInjectFlags {
27 │   /** Check self and check parent injector if needed */
28 ▶   Default = 0b0000,
29 │ 
30 │   /**
31 │    * Specifies that an injector should retrieve a dependency from any injector until reaching the
32 │    * host element of the current component. (Only used with Element Injector)
33 │    */
34 ▶   Host = 0b0001,
35 │ 
36 │   /** Don't ascend to ancestors of the node requesting injection. */
37 ▶   Self = 0b0010,
38 │ 
39 │   /** Skip the node that is requesting injection. */
40 ▶   SkipSelf = 0b0100,
41 │ 
42 │   /** Inject `defaultValue` instead if token not found. */
43 ▶   Optional = 0b1000,
44 │ 
45 │   /**
46 │    * This token is being injected into a pipe.
47 │    *
48 │    * This flag is intentionally not in the public facing `InjectFlags` because it is only added by
49 │    * the compiler and is not a developer applicable flag.
50 │    */
51 ▶   ForPipe = 0b10000,
52 │ }
```

26 行目の `const enum` は、コンパイル時に数値へ置き換わる列挙です。`Default` 0（28 行目）、`Host` 1（34 行目）、`Self` 2（37 行目）、`SkipSelf` 4（40 行目）、`Optional` 8（43 行目）。51 行目の `ForPipe` 16 はコンパイラだけが付けるビットで、`inject()` の options からは作れません。それぞれのビットが探索のどこで効くかは [第 12 回](12-di-resolution-flags.md)で読みます。

## 3. ɵɵinject：2 つのスイッチの 1 つ目を見る

📄 `angular/packages/core/src/di/injector_compatibility.ts` L140–148 （▶ の行: 142, 144–145）

```ts
140 │ export function ɵɵinject<T>(
141 │   token: ProviderToken<T> | HostAttributeToken,
142 ▶   flags = InternalInjectFlags.Default,
143 │ ): T | null {
144 ▶   return (getInjectImplementation() || injectInjectorOnly)(
145 ▶     resolveForwardRef(token as Type<T>),
146 │     flags,
147 │   );
148 │ }
```

144 行目がこの章の中心です。`getInjectImplementation()` が何か返せばそれを、`undefined` なら `injectInjectorOnly` を呼びます。145 行目の `resolveForwardRef` は `forwardRef(() => Foo)` を `Foo` に戻す処理です（[standalone-forward-ref](../standalone/05-standalone-forward-ref.md)）。`ɵɵinject` はコンパイラがサービスの factory（`ɵfac`）の中に書き出す命令でもあります（[第 4 回](04-di-factory.md)）。つまり**コンストラクタ引数の注入も `inject()` の呼び出しも、ここで合流**します。

📄 `angular/packages/core/src/di/inject_switch.ts` L16–41 （▶ の行: 17, 19–20, 22–23, 25–29, 35, 38–40）

```ts
16 │ /**
17 ▶  * Current implementation of inject.
18 │  *
19 ▶  * By default, it is `injectInjectorOnly`, which makes it `Injector`-only aware. It can be changed
20 ▶  * to `directiveInject`, which brings in the `NodeInjector` system of ivy. It is designed this
21 │  * way for two reasons:
22 ▶  *  1. `Injector` should not depend on ivy logic.
23 ▶  *  2. To maintain tree shake-ability we don't want to bring in unnecessary code.
24 │  */
25 ▶ let _injectImplementation:
26 ▶   | (<T>(token: ProviderToken<T>, flags?: InternalInjectFlags) => T | null)
27 ▶   | undefined;
28 ▶ export function getInjectImplementation() {
29 ▶   return _injectImplementation;
30 │ }
31 │ 
32 │ /**
33 │  * Sets the current inject implementation.
34 │  */
35 ▶ export function setInjectImplementation(
36 │   impl: (<T>(token: ProviderToken<T>, flags?: InternalInjectFlags) => T | null) | undefined,
37 │ ): (<T>(token: ProviderToken<T>, flags?: InternalInjectFlags) => T | null) | undefined {
38 ▶   const previous = _injectImplementation;
39 ▶   _injectImplementation = impl;
40 ▶   return previous;
41 │ }
```

これが 1 つ目のスイッチ `_injectImplementation` です。25〜27 行目、初期値を書いていない `let` なので最初は `undefined`。19 行目のコメントの「既定は `injectInjectorOnly`」は、144 行目の `|| injectInjectorOnly` で実現されています。20 行目、ここに `directiveInject`（`ɵɵdirectiveInject`）が入ると、`NodeInjector` の仕組みが使われます。22〜23 行目が、この形にした 2 つの理由です。

1. **`Injector` を ivy に依存させないため**（22 行目）。`di/` のコードは `ɵɵdirectiveInject` を import しません。render3 側が外から差し込みます。
2. **tree shaking を保つため**（23 行目）。サービスしか使わないコードに、`NodeInjector` の探索コードを引き込まないためです。

35〜40 行目の `setInjectImplementation` は、38 行目で前の値を取っておき、39 行目で入れ替え、40 行目で**前の値を返します**。呼ぶ側はこの戻り値を保存し、`finally` で戻します（7 節）。

## 4. injectInjectorOnly：2 つ目のスイッチを見る

📄 `angular/packages/core/primitives/di/src/injector.ts` L16–34 （▶ の行: 17–20, 22, 28, 31–33）

```ts
16 │ /**
17 ▶  * Current injector value used by `inject`.
18 ▶  * - `undefined`: it is an error to call `inject`
19 ▶  * - `null`: `inject` can be called but there is no injector (limp-mode).
20 ▶  * - Injector instance: Use the injector for resolution.
21 │  */
22 ▶ let _currentInjector: Injector | undefined | null = undefined;
23 │ 
24 │ export function getCurrentInjector(): Injector | undefined | null {
25 │   return _currentInjector;
26 │ }
27 │ 
28 ▶ export function setCurrentInjector(
29 │   injector: Injector | null | undefined,
30 │ ): Injector | undefined | null {
31 ▶   const former = _currentInjector;
32 ▶   _currentInjector = injector;
33 ▶   return former;
34 │ }
```

2 つ目のスイッチ `_currentInjector` は primitives にあります。17〜20 行目、値の意味は 3 通りです。`undefined` は「`inject` を呼ぶのは誤り」、`null` は「呼んでよいが注入器が無い（limp mode）」、注入器なら「それで解決する」。22 行目の初期値は `undefined`。28〜33 行目の setter も、1 つ目と同じく前の値を返します。

📄 `angular/packages/core/src/di/injector_compatibility.ts` L93–120 （▶ の行: 97–98, 104–105, 107, 110, 112–114, 116, 118）

```ts
 93 │ export function injectInjectorOnly<T>(
 94 │   token: ProviderToken<T>,
 95 │   flags = InternalInjectFlags.Default,
 96 │ ): T | null {
 97 ▶   const currentInjector = getCurrentInjector();
 98 ▶   if (currentInjector === undefined) {
 99 │     throw new RuntimeError(
100 │       RuntimeErrorCode.MISSING_INJECTION_CONTEXT,
101 │       ngDevMode &&
102 │         `The \`${stringify(token)}\` token injection failed. \`inject()\` function must be called from an injection context such as a constructor, a factory function, a field initializer, or a function used with \`runInInjectionContext\`.`,
103 │     );
104 ▶   } else if (currentInjector === null) {
105 ▶     return injectRootLimpMode(token, undefined, flags);
106 │   } else {
107 ▶     const options = convertToInjectOptions(flags);
108 │     // TODO: improve the typings here.
109 │     // `token` can be a multi: true provider definition, which is considered as a Token but not represented in the typings
110 ▶     const value = currentInjector.retrieve(token as PrimitivesInjectionToken<T>, options) as T;
111 │     ngDevMode && emitInjectEvent(token as Type<unknown>, value, flags);
112 ▶     if (isNotFound(value)) {
113 ▶       if (options.optional) {
114 ▶         return null;
115 │       }
116 ▶       throw value;
117 │     }
118 ▶     return value;
119 │   }
120 │ }
```

1. **97 行目：`getCurrentInjector()` を読む**

   ここで初めて「どの注入器か」を知ります。
2. **98 行目：`undefined` なら NG0203**

   注入コンテキストの外で呼んだときのエラーです。いつ `undefined` になるかは [第 3 回](03-di-injection-context.md)。
3. **104〜105 行目：`null` なら `injectRootLimpMode`**

   注入器なしで `providedIn: 'root'` だけを作る特別な経路です。これも第 3 回で読みます。
4. **107 行目：ビットをオブジェクトに戻す**

   2 節で数値にしたものを、`convertToInjectOptions` で `{ optional, host, self, skipSelf }` に戻します。primitives の `retrieve` の引数がオブジェクトだからです。
5. **110 行目：`currentInjector.retrieve(token, options)`**

   注入器の種類を問わず、primitives の約束（[第 1 回](01-di-overview.md) 1 節）の `retrieve` を呼びます。
6. **112〜116 行目：`NotFound` が返ったら、optional なら `null`、そうでなければその値を throw**

   `retrieve` は見つからないことを値で返せるので、ここで例外に直します。118 行目、見つかればそのまま返します。

110 行目の `retrieve` を実装しているのは 2 つです。まず `R3Injector` 自身。

📄 `angular/packages/core/src/di/r3_injector.ts` L246–262 （▶ の行: 246–248, 250, 252–254, 257–258）

```ts
246 ▶   retrieve<T>(token: PrimitivesInjectionToken<T>, options?: unknown): T | NotFound {
247 ▶     const flags: InternalInjectFlags =
248 ▶       convertToBitFlags(options as InjectOptions | undefined) || InternalInjectFlags.Default;
249 │     try {
250 ▶       return (this as BackwardsCompatibleInjector).get(
251 │         token as unknown as InjectionToken<T>,
252 ▶         // When a dependency is requested with an optional flag, DI returns null as the default value.
253 ▶         THROW_IF_NOT_FOUND as T,
254 ▶         flags,
255 │       );
256 │     } catch (e: any) {
257 ▶       if (isNotFound(e)) {
258 ▶         return e;
259 │       }
260 │       throw e;
261 │     }
262 │   }
```

247〜248 行目でオブジェクトをまたビットにして、250〜254 行目で自分の `get` を呼びます。252 行目のコメントは「optional なら null」と書いていますが、253 行目で渡しているのは常に `THROW_IF_NOT_FOUND` です。optional のときに `null` へ置き換えるのは `get` の後半（親へ回す直前）の仕事です（[NgModule シリーズ第 10 回](../ngmodule/10-ngmodule-provided-in.md)で引用した範囲）。257〜258 行目、投げられたのが `NotFound`（名前が `'ɵNotFound'` のエラー）なら、throw せずに値として返します。

📄 `angular/packages/core/src/di/injector_compatibility.ts` L44–68 （▶ の行: 49–50, 52–53, 55, 57–58, 62–63）

```ts
44 │ /**
45 │  * A wrapper around an `Injector` that implements the `PrimitivesInjector` interface.
46 │  *
47 │  * This is used to allow the `inject` function to be used with the new primitives-based DI system.
48 │  */
49 ▶ export class RetrievingInjector implements PrimitivesInjector {
50 ▶   constructor(readonly injector: Injector) {}
51 │   retrieve<T>(token: PrimitivesInjectionToken<T>, options: unknown): T | NotFound {
52 ▶     const flags: InternalInjectFlags =
53 ▶       convertToBitFlags(options as InjectOptions | undefined) || InternalInjectFlags.Default;
54 │     try {
55 ▶       return (this.injector as BackwardsCompatibleInjector).get(
56 │         token as unknown as InjectionToken<T>,
57 ▶         // When a dependency is requested with an optional flag, DI returns null as the default value.
58 ▶         (flags & InternalInjectFlags.Optional ? null : THROW_IF_NOT_FOUND) as T,
59 │         flags,
60 │       ) as T;
61 │     } catch (e: any) {
62 ▶       if (isNotFound(e)) {
63 ▶         return e;
64 │       }
65 │       throw e;
66 │     }
67 │   }
68 │ }
```

もう 1 つが `RetrievingInjector`。49〜50 行目、`retrieve` を持たない普通の `Injector`（`NodeInjector` など）を包む入れ物です。52〜53 行目でビットにし、55 行目で包んだ注入器の `get` を呼びます。57〜58 行目、こちらは optional なら `notFoundValue` に `null` を渡し、包んだ注入器が見つけられなかったときの戻り値を `null` にします（57 行目のコメント）。62〜63 行目の扱いは `R3Injector.retrieve` と同じです。`RetrievingInjector` を作るのは `runInInjectionContext` です（[第 3 回](03-di-injection-context.md)）。

## 5. もう一方の行き先 ɵɵdirectiveInject

144 行目で `_injectImplementation` が入っていたとき、呼ばれるのは `ɵɵdirectiveInject` です （本体は [standalone 第 8 回](../standalone/08-standalone-providers-two-injectors.md) 4 節で引用済み）。やることは「今の `LView` と今の `TNode` を取り、`getOrCreateInjectable` に渡す」だけです。`getOrCreateInjectable` は要素の `NodeInjector` を親へ登り、無ければ `lView[INJECTOR]` の `get` を呼びます （[第 1 回](01-di-overview.md) 5 節の ①②）。この経路は `_currentInjector` を**読みません**。どの要素から探すかは、LView と TNode（render3 の状態）で決まります。

## 6. 誰がスイッチを入れて、どこで戻すか

### R3Injector.get

📄 `angular/packages/core/src/di/r3_injector.ts` L323–342 （▶ の行: 328, 330–331, 334, 341–342）

```ts
323 │   override get<T>(
324 │     token: ProviderToken<T>,
325 │     notFoundValue: any = THROW_IF_NOT_FOUND,
326 │     options?: InjectOptions,
327 │   ): T {
328 ▶     assertNotDestroyed(this);
329 │ 
330 ▶     if (Object.hasOwn(token, NG_ENV_ID)) {
331 ▶       return (token as any)[NG_ENV_ID](this);
332 │     }
333 │ 
334 ▶     const flags = convertToBitFlags(options) as InternalInjectFlags;
335 │ 
336 │     // Set the injection context.
337 │     let prevInjectContext: InjectorProfilerContext;
338 │     if (ngDevMode) {
339 │       prevInjectContext = setInjectorProfilerContext({injector: this, token: token as Type<T>});
340 │     }
341 ▶     const previousInjector = setCurrentInjector(this);
342 ▶     const previousInjectImplementation = setInjectImplementation(undefined);
```

328 行目で破棄済みでないかを確かめ、330〜331 行目で特殊なトークン（[第 13 回](13-di-special-tokens.md)）を先に処理し、334 行目でビットにします。そして 341〜342 行目、**2 つのスイッチを同時に切り替えます**。`_currentInjector` を自分（`this`）に、`_injectImplementation` を `undefined` に。この後の `try` の中で provider の factory が呼ばれ、サービスのコンストラクタとフィールド初期化子が走ります。そこで書いた `inject()` は、144 行目で `injectInjectorOnly` を選び、97 行目でこの `R3Injector` を見つけます。

📄 `angular/packages/core/src/di/r3_injector.ts` L414–423 （▶ の行: 417–420）

```ts
414 │       } else {
415 │         throw error;
416 │       }
417 ▶     } finally {
418 ▶       // Lastly, restore the previous injection context.
419 ▶       setInjectImplementation(previousInjectImplementation);
420 ▶       setCurrentInjector(previousInjector);
421 │       ngDevMode && setInjectorProfilerContext(prevInjectContext!);
422 │     }
423 │   }
```

417〜420 行目、`finally` で 341〜342 行目の戻り値を書き戻します。値が見つかっても、throw しても、必ず元に戻ります。

### NodeInjector の factory 実行（getNodeInjectable）

コンポーネントやディレクティブ、`@Component.providers` のサービスは、`NodeInjectorFactory` という箱に入って LView に置かれています。

📄 `angular/packages/core/src/render3/interfaces/injector.ts` L284–296 （▶ の行: 288, 295）

```ts
284 │     /**
285 │      * Set to `true` if the token is declared in `viewProviders` (or if it is component).
286 │      */
287 │     isViewProvider: boolean,
288 ▶     injectImplementation: null | (<T>(token: ProviderToken<T>, flags?: InternalInjectFlags) => T),
289 │     // Expect `null` in devmode
290 │     public name: string | null,
291 │   ) {
292 │     ngDevMode && assertDefined(factory, 'Factory not specified');
293 │     ngDevMode && assertEqual(typeof factory, 'function', 'Expected factory function.');
294 │     this.canSeeViewProviders = isViewProvider;
295 ▶     this.injectImpl = injectImplementation;
296 │   }
```

288 行目の第 3 引数 `injectImplementation` を、295 行目で `injectImpl` に保存します。ディレクティブ用の箱は `configureViewWithDirective`（[ivy-blueprint](../ivy/07-ivy-blueprint.md)）が、providers 用の箱は `resolveProvider`（[standalone 第 8 回](../standalone/08-standalone-providers-two-injectors.md) 3 節）が作り、どちらもここに `ɵɵdirectiveInject` を渡しています。この箱を開ける（インスタンスを作る）のが `getNodeInjectable` です。

📄 `angular/packages/core/src/render3/di.ts` L766–781 （▶ の行: 772–775）

```ts
766 │     let prevInjectContext: InjectorProfilerContext | undefined;
767 │     if (ngDevMode) {
768 │       const injector = new NodeInjector(tNode, lView);
769 │       prevInjectContext = setInjectorProfilerContext({injector, token});
770 │     }
771 │ 
772 ▶     const previousInjectImplementation = factory.injectImpl
773 ▶       ? setInjectImplementation(factory.injectImpl)
774 ▶       : null;
775 ▶     const success = enterDI(lView, tNode, InternalInjectFlags.Default);
776 │     ngDevMode &&
777 │       assertEqual(
778 │         success,
779 │         true,
780 │         "Because flags do not contain `SkipSelf' we expect this to always succeed.",
781 │       );
```

772〜774 行目、箱に `injectImpl` があれば `setInjectImplementation(factory.injectImpl)`。無ければ何もせず `null` を覚えます。775 行目の `enterDI(lView, tNode, ...)` は、render3 の「今の LView と TNode」をこの要素にします。`ɵɵdirectiveInject` はこれを読みます。この後（[ivy-directives](../ivy/14-ivy-directives.md) で引用した範囲）で `factory.factory(...)` が呼ばれ、コンストラクタとフィールド初期化子が走ります。**`_currentInjector` にはここで一切触れていない**ことに注意してください。

📄 `angular/packages/core/src/render3/di.ts` L799–811 （▶ の行: 799, 802–803, 806）

```ts
799 ▶     } finally {
800 │       ngDevMode && setInjectorProfilerContext(prevInjectContext!);
801 │ 
802 ▶       previousInjectImplementation !== null &&
803 ▶         setInjectImplementation(previousInjectImplementation);
804 │       setIncludeViewProviders(previousIncludeViewProviders);
805 │       factory.resolving = false;
806 ▶       leaveDI();
807 │       ngDevMode && (injectionPath = []);
808 │     }
809 │   }
810 │   return value;
811 │ }
```

799 行目の `finally`、802〜803 行目で `injectImpl` を入れたときだけ前の値に戻し、806 行目の `leaveDI` で LView と TNode も戻します。

### pipe のインスタンス化

📄 `angular/packages/core/src/render3/pipe.ts` L58–82 （▶ の行: 67, 71–72, 76–79）

```ts
58 │   const pipeFactory = pipeDef.factory || (pipeDef.factory = getFactoryDef(pipeDef.type, true));
59 │ 
60 │   let previousInjectorProfilerContext: InjectorProfilerContext;
61 │   if (ngDevMode) {
62 │     previousInjectorProfilerContext = setInjectorProfilerContext({
63 │       injector: new NodeInjector(getCurrentTNode() as TTextNode, getLView()),
64 │       token: pipeDef.type,
65 │     });
66 │   }
67 ▶   const previousInjectImplementation = setInjectImplementation(ɵɵdirectiveInject);
68 │   try {
69 │     // DI for pipes is supposed to behave like directives when placed on a component
70 │     // host node, which means that we have to disable access to `viewProviders`.
71 ▶     const previousIncludeViewProviders = setIncludeViewProviders(false);
72 ▶     const pipeInstance = pipeFactory();
73 │     setIncludeViewProviders(previousIncludeViewProviders);
74 │     store(tView, getLView(), adjustedIndex, pipeInstance);
75 │     return pipeInstance;
76 ▶   } finally {
77 ▶     // we have to restore the injector implementation in finally, just in case the creation of the
78 ▶     // pipe throws an error.
79 ▶     setInjectImplementation(previousInjectImplementation);
80 │     ngDevMode && setInjectorProfilerContext(previousInjectorProfilerContext!);
81 │   }
82 │ }
```

pipe は `NodeInjectorFactory` に入らないので、`ɵɵpipe` が自分でスイッチを入れます。67 行目で `ɵɵdirectiveInject` を入れ、71 行目で viewProviders を見えなくし、72 行目で pipe の factory を呼びます。76 行目の `finally`、79 行目で戻します。77〜78 行目のコメントのとおり、pipe の作成が throw しても戻すためです。

### 環境側へ降りるとき

`ɵɵdirectiveInject` が要素に見つけられず `lookupTokenUsingModuleInjector` で `lView[INJECTOR]` へ降りるときは、`setInjectImplementation(undefined)` にしてから `get` を呼び、`finally` で戻します （行は [standalone 第 8 回](../standalone/08-standalone-providers-two-injectors.md) 4 節の引用。コメントは「module injector にはコンポーネント・ディレクティブの DI スコープを見せない」）。環境側で作るサービスが要素の providers を覗けないのは、ここで 1 つ目のスイッチを切るからです。

| 場所 | `_currentInjector` | `_injectImplementation` | その中の `inject()` の行き先 | 戻す行 |
| --- | --- | --- | --- | --- |
| `R3Injector.get`（サービスの factory 実行中） | `this`（r3\_injector.ts 341 行目） | `undefined`（342 行目） | `injectInjectorOnly` → `this.retrieve` | 419〜420 行目 |
| `getNodeInjectable`（ディレクティブ・コンポーネント・要素の providers の factory 実行中） | 触らない | `ɵɵdirectiveInject`（di.ts 772〜773 行目） | `ɵɵdirectiveInject` → `getOrCreateInjectable` | 802〜803 行目 |
| `ɵɵpipe`（pipe の factory 実行中） | 触らない | `ɵɵdirectiveInject`（pipe.ts 67 行目） | 同上（viewProviders は見えない、71 行目） | 79 行目 |
| `lookupTokenUsingModuleInjector`（要素から環境へ降りる間） | 触らない | `undefined` | この後の `R3Injector.get` が 341〜342 行目で切り替える | 同じ関数の `finally` |
| `runInInjectionContext(injector, fn)` | 渡した注入器（R3Injector 以外は `RetrievingInjector` で包む） | `undefined` | `injectInjectorOnly` → `retrieve` | [第 3 回](03-di-injection-context.md) |
| 何もない場所（クリックハンドラ、`setTimeout` の中など） | `undefined`（初期値、primitives 22 行目） | `undefined`（初期値、inject\_switch.ts 25 行目） | `injectInjectorOnly` → 98 行目で NG0203 | — |

## 7. inject(token, opts) の 6 ステップ

1. **① `inject(token, opts)`（injector\_compatibility.ts 293 行目）**

   自分では何もせず、296 行目で `ɵɵinject` を呼ぶ。
2. **② ビット化（303〜314 行目）**

   `{ optional: true, self: true }` なら `8 | 2 = 10`。
3. **③ スイッチ 1：`_injectImplementation`（144 行目）**

   入っていれば（要素・pipe の factory 実行中）`ɵɵdirectiveInject` へ。入っていなければ `injectInjectorOnly` へ。
4. **④ スイッチ 2：`_currentInjector`（97〜105 行目）**

   `injectInjectorOnly` の側だけが読む。`undefined` なら NG0203、`null` なら limp mode、注入器なら次へ。
5. **⑤ `retrieve` または `getOrCreateInjectable`**

   注入器側は 110 行目の `retrieve`（`R3Injector` なら自分の `get`、それ以外は `RetrievingInjector` 経由の `get`）。要素側は `ɵɵdirectiveInject` → `getOrCreateInjectable`。
6. **⑥ 見つからなかったとき**

   注入器側は `NotFound` が値で戻り、112〜116 行目で optional なら `null`、さもなくば throw。要素側は `notFoundValue` を `null` にして環境へ降り、最後の `NullInjector` が返すか投げる（[第 1 回](01-di-overview.md)）。

## 8. 呼び出しの連なり 2 本

1 本目：コンポーネントのコンストラクタ（フィールド初期化子）で `inject(FooService)`。

- `instantiateAllDirectives(tView, lView, tNode)` — render3/instructions/shared.ts L386 — *要素のディレクティブを順に作る（ivy-directives）*
  - `getNodeInjectable(lView, tView, i, tNode)` — render3/di.ts L735 — *L773 で \_injectImplementation = ɵɵdirectiveInject、L775 enterDI*
    - `factory.factory(...)` → `new MyComponent()` — render3/di.ts L785
      - 👤 `readonly foo = inject(FooService)` — あなたのコンポーネント
        - `ɵɵinject(FooService, undefined)` — injector\_compatibility.ts L140 — *L144 で ɵɵdirectiveInject を選ぶ*
          - `ɵɵdirectiveInject(FooService)` — render3/instructions/di.ts L45
            - `getOrCreateInjectable(tNode, lView, FooService)` — render3/di.ts L457 — *要素に無ければ lookupTokenUsingModuleInjector（L407）で \_injectImplementation = undefined*
              - `lView[INJECTOR].get(FooService)` → `R3Injector.get` — di/r3\_injector.ts L323 — *L341–342 で 2 つのスイッチを (this, undefined) に*

2 本目：その `FooService`（`providedIn: 'root'`）のフィールド初期化子で `inject(BarService)`。

- `R3Injector.get(FooService)` — di/r3\_injector.ts L323 — *\_currentInjector = this、\_injectImplementation = undefined*
  - `hydrate(token, record)` → `record.factory()` → `new FooService()` — di/r3\_injector.ts — *第 8 回*
    - 👤 `readonly bar = inject(BarService)` — あなたのサービス
      - `ɵɵinject(BarService, undefined)` — injector\_compatibility.ts L140 — *L144：\_injectImplementation が undefined なので injectInjectorOnly*
        - `injectInjectorOnly(BarService, 0)` — injector\_compatibility.ts L93 — *L97 で R3Injector を得る*
          - `R3Injector.retrieve(BarService, options)` — di/r3\_injector.ts L246
            - `R3Injector.get(BarService, THROW_IF_NOT_FOUND, 0)` — di/r3\_injector.ts L250 — *records → parent。NodeInjector には戻らない*

## 9. DEMO：同じ inject() が場所によって違う答えを出す

> **🧪 DEMO — 章コンポーネントと 2 つのサービスで同じ inject() を呼ぶ**
>
> この章のコンポーネントは `providers: [{ provide: LOCAL_TOKEN, useValue: 'element' }, NodeSideService]` を持ちます。`LOCAL_TOKEN` は**要素の NodeInjector にしか無い**トークン、`MISSING` はどこにも無いトークンです。どの行もコンポーネントのフィールド初期化子で評価しました。`runInInjectionContext(env)` の行は、その中で 2 つのスイッチが (`R3Injector`, `undefined`) に切り替わります。throw の `name` は開発ビルドでは `ɵNotFound`（NullInjector が付けた名前のまま）、本番ビルドでは `R3Injector.get` が作り直した `RuntimeError` なので `Error` です（`code` はどちらも `-201` = NG0201）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/di-inject-function)

最後の 2 行が 6 節の表そのものです。`providedIn: 'root'` のサービスは `R3Injector.get` の中で作られるので、フィールド初期化子の `inject()` は 341〜342 行目の状態で走り、要素の `LOCAL_TOKEN` は見えません（`null`）。同じコードのサービスでも、`@Component.providers` に置くと `getNodeInjectable` の 772〜773 行目の状態で作られ、`'element'` が見えます。

## 聞かれそうな質問

**Q. コンポーネントの中の inject とサービスの中の inject は同じ関数ですか？**

同じ関数です（injector\_compatibility.ts 293 行目）。違うのは呼ばれた瞬間のグローバル状態です。コンポーネントのコンストラクタは `getNodeInjectable` の中で走り、そこでは di.ts 772〜773 行目で `_injectImplementation` が `ɵɵdirectiveInject` になっています。`providedIn: 'root'` のサービスのコンストラクタは `R3Injector.get` の中で走り、そこでは r3\_injector.ts 341〜342 行目で `_currentInjector` が自分、`_injectImplementation` が `undefined` です。144 行目の分岐がこの状態を読んで行き先を変えます。

**Q. ɵɵinject と inject は何が違いますか？**

`inject` は公開 API で、オプションをオブジェクトで受け取り、296 行目で `convertToBitFlags` してから `ɵɵinject` を呼びます。`ɵɵinject` はコンパイラが factory に書き出す命令で、最初からビットを受け取ります（142 行目）。探索の本体は 144〜147 行目で、両者は同じ道を通ります。ディレクティブの factory には `ɵɵinject` ではなく `ɵɵdirectiveInject` が書き出されます（[第 4 回](04-di-factory.md)）。

**Q. なぜ引数で注入器を渡さず、グローバル変数で実装されているのですか？**

inject\_switch.ts 17〜23 行目のコメントに 2 つの理由があります。1 つ目は「`Injector` を ivy のロジックに依存させない」（22 行目）。`di/` 側は `ɵɵdirectiveInject` を import せず、render3 側が setter で差し込みます。2 つ目は「tree shaking を保つ」（23 行目）。サービスだけのコードに `NodeInjector` の探索を引き込みません。加えて、利用者が `inject(Foo)` と注入器を渡さずに書けるのは、呼ばれた瞬間の注入器をこの 2 つの変数から読むからです。その代わり、変数が立っている区間でしか呼べません。それが[第 3 回](03-di-injection-context.md)の注入コンテキストです。

**Q. コンポーネントのコンストラクタで \_currentInjector は何になっていますか？**

`getNodeInjectable` は `_currentInjector` に触りません（di.ts 766〜781 行目にも 799〜811 行目にも `setCurrentInjector` が無い）。なので外側の値のままで、ふつうは `undefined` です。それでも `inject()` が動くのは、144 行目で `_injectImplementation` が先に見られ、`injectInjectorOnly`（`_currentInjector` を読む唯一の場所）に入らないからです。

**Q. @Component.providers のサービスが、同じ要素の別のトークンを inject できるのはなぜですか？**

そのサービスは `resolveProvider` が作る `NodeInjectorFactory` に入り、`injectImpl` に `ɵɵdirectiveInject` を持つ（interfaces/injector.ts 288・295 行目）からです。`getNodeInjectable` が 772〜775 行目でそれを立て、`enterDI` で今の要素をその要素にしてから factory を呼ぶので、フィールド初期化子の `inject()` も要素から探します（DEMO の最後の行）。

## 読み終えて

- `inject()` は `convertToBitFlags` して `ɵɵinject` を呼ぶだけ（injector\_compatibility.ts 296 行目）
- `ɵɵinject` は `_injectImplementation` があれば `ɵɵdirectiveInject`（要素から探す）、無ければ `injectInjectorOnly`（144 行目）
- `injectInjectorOnly` は `_currentInjector` を読み、`undefined` なら NG0203、`null` なら limp mode、注入器なら `retrieve`（97〜110 行目）。`NotFound` は 112〜116 行目で null か throw に直す
- スイッチを入れるのは `R3Injector.get`（両方）、`getNodeInjectable` と `ɵɵpipe`（1 つ目だけ）、`runInInjectionContext`（両方）。どれも setter の戻り値を `finally` で書き戻す
- 同じサービスでも、どこで作られるかでフィールド初期化子の `inject()` の見える範囲が変わる

---

← 前: [DI の概観：NodeInjector と環境インジェクタ、2 つの木と 1 本の探索順](01-di-overview.md)  
次: [注入コンテキスト：いつ inject() が呼べて、いつ NG0203 になるか](03-di-injection-context.md) →
