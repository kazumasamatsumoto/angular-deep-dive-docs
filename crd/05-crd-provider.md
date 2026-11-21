[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 5 回 / 全 10 回

# Provider の形の説明文：useClass・useValue・useFactory・useExisting・multi

> di/interface/provider.ts・interface/defs.ts・provider\_collection.ts の未読の行：各 Provider の型の説明と provider\_spec.ts の例、deps の書き方、multi、importProvidersFrom、makeEnvironmentProviders、provideEnvironmentInitializer、ɵprov の形と、開発モードだけで確かめている誤り。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-provider)

---

この章で分かること：`di/interface/provider.ts` の 7 つの Provider の型（`ValueProvider`・`StaticClassProvider`・`ConstructorProvider`・`ExistingProvider`・`FactoryProvider`・`TypeProvider`・`ClassProvider`）の説明文と、それぞれが指す `packages/examples/core/di/ts/provider_spec.ts` の例を、そのまま `Injector.create` と `createEnvironmentInjector` に通して表にします。`deps` に付ける印、`multi`、`makeEnvironmentProviders`・`importProvidersFrom`・`provideEnvironmentInitializer` と、`interface/defs.ts` の `ɵprov` の形も読みます。食い違いは 3 つの種類です。例が見出しと違う形を使っていること（TypeProvider の例が ClassProvider、ClassProvider の例が ValueProvider）、`@Injectable(SomeModule, {deps: []})` の例が書けないこと、そして開発モードでだけ確かめている 3 つの誤り（multi の混ぜ方、コンポーネントの providers の EnvironmentProviders、standalone のコンポーネントの importProvidersFrom）が、本番では別の例外か成功になることです。

読む対象は `packages/core/src/di/interface/provider.ts`・`interface/defs.ts`・`provider_collection.ts`・`initializer_token.ts`（../angular、8576f161ae4）です。provider が関数になる所（`providerToFactory`）は[provider の 4 つの形の章](../di/07-di-provider-to-factory.md)、`multi` の配列は[multi の章](../di/09-di-multi-providers.md)、`importProvidersFrom` の中の `walkProviderTree` は[importProvidersFrom の章](../ngmodule/14-ngmodule-import-providers-from.md)と[walkProviderTree の章](../ngmodule/08-ngmodule-walk-provider-tree.md)にあります。`deps` の印の意味は[第 6 回](06-crd-inject.md)で読みます。

1. [1. @Directive](01-crd-directive.md)
2. [2. @Component](02-crd-component.md)
3. [3. クエリと @NgModule](03-crd-query-module.md)
4. [4. @Injectable・InjectionToken](04-crd-injectable-token.md)
5. **5. Provider の形**（この章）
6. [6. inject と Injector](06-crd-inject.md)
7. [7. ライフサイクル](07-crd-lifecycle.md)
8. [8. differ](08-crd-differs.md)
9. [9. スケジューラー](09-crd-scheduling.md)
10. [10. spec と issue](10-crd-tests-issues.md)

## 1. …SansProvider と …Provider：2 段の型

📄 `angular/packages/core/src/di/interface/provider.ts` L11–22 （▶ の行: 12–13, 17, 21）

```ts
11 │ /**
12 ▶  * Configures the `Injector` to return a value for a token.
13 ▶  * Base for `ValueProvider` decorator.
14 │  *
15 │  * @publicApi
16 │  */
17 ▶ export interface ValueSansProvider {
18 │   /**
19 │    * The value to inject.
20 │    */
21 ▶   useValue: any;
22 │ }
```

📄 `angular/packages/core/src/di/interface/provider.ts` L24–51 （▶ の行: 32, 36, 40, 42, 44, 47–48, 50）

```ts
24 │ /**
25 │  * Configures the `Injector` to return a value for a token.
26 │  * @see [Dependency Injection Guide](guide/di)
27 │  *
28 │  * @usageNotes
29 │  *
30 │  * ### Example
31 │  *
32 ▶  * {@example core/di/ts/provider_spec.ts region='ValueProvider'}
33 │  *
34 │  * ### Multi-value example
35 │  *
36 ▶  * {@example core/di/ts/provider_spec.ts region='MultiProviderAspect'}
37 │  *
38 │  * @publicApi
39 │  */
40 ▶ export interface ValueProvider extends ValueSansProvider {
41 │   /**
42 ▶    * An injection token. Typically an instance of `Type` or `InjectionToken`, but can be `any`.
43 │    */
44 ▶   provide: any;
45 │ 
46 │   /**
47 ▶    * When true, injector returns an array of instances. This is useful to allow multiple
48 ▶    * providers spread across many files to provide configuration information to a common token.
49 │    */
50 ▶   multi?: boolean;
51 │ }
```

どの形も、`provide` の無い「Sans（なし）」の型（13 行目「`ValueProvider` の土台」）と、`provide` と `multi` を足した型の 2 段です。Sans の型は `@Injectable` の引数（[第 4 回](04-crd-injectable-token.md)の `InjectableProvider`）のためにあります。13・55 行目の「decorator」は型の土台の意味で、デコレーターではありません。42 行目の `provide` は `any` で、文字列もトークンにできます（[InjectionToken の章](../di/06-di-injection-token.md)の 7 節）。

📄 `angular/packages/core/src/di/interface/provider.ts` L53–71 （▶ の行: 55, 61–62, 64, 67–68, 70）

```ts
53 │ /**
54 │  * Configures the `Injector` to return an instance of `useClass` for a token.
55 ▶  * Base for `StaticClassProvider` decorator.
56 │  *
57 │  * @publicApi
58 │  */
59 │ export interface StaticClassSansProvider {
60 │   /**
61 ▶    * An optional class to instantiate for the `token`. By default, the `provide`
62 ▶    * class is instantiated.
63 │    */
64 ▶   useClass: Type<any>;
65 │ 
66 │   /**
67 ▶    * A list of `token`s to be resolved by the injector. The list of values is then
68 ▶    * used as arguments to the `useClass` constructor.
69 │    */
70 ▶   deps: any[];
71 │ }
```

📄 `angular/packages/core/src/di/interface/provider.ts` L73–102 （▶ の行: 79, 81, 83）

```ts
 73 │ /**
 74 │  * Configures the `Injector` to return an instance of `useClass` for a token.
 75 │  * @see [Dependency Injection Guide](guide/di)
 76 │  *
 77 │  * @usageNotes
 78 │  *
 79 ▶  * {@example core/di/ts/provider_spec.ts region='StaticClassProvider'}
 80 │  *
 81 ▶  * Note that following two providers are not equal:
 82 │  *
 83 ▶  * {@example core/di/ts/provider_spec.ts region='StaticClassProviderDifference'}
 84 │  *
 85 │  * ### Multi-value example
 86 │  *
 87 │  * {@example core/di/ts/provider_spec.ts region='MultiProviderAspect'}
 88 │  *
 89 │  * @publicApi
 90 │  */
 91 │ export interface StaticClassProvider extends StaticClassSansProvider {
 92 │   /**
 93 │    * An injection token. Typically an instance of `Type` or `InjectionToken`, but can be `any`.
 94 │    */
 95 │   provide: any;
 96 │ 
 97 │   /**
 98 │    * When true, injector returns an array of instances. This is useful to allow multiple
 99 │    * providers spread across many files to provide configuration information to a common token.
100 │    */
101 │   multi?: boolean;
102 │ }
```

📄 `angular/packages/core/src/di/interface/provider.ts` L104–123 （▶ の行: 105, 111–114, 118, 122–123）

````ts
104 │ /**
105 ▶  * Configures the `Injector` to return an instance of a token.
106 │  *
107 │  * @see [Dependency Injection Guide](guide/di)
108 │  *
109 │  * @usageNotes
110 │  *
111 ▶  * ```ts
112 ▶  * @Injectable(SomeModule, {deps: []})
113 ▶  * class MyService {}
114 ▶  * ```
115 │  *
116 │  * @publicApi
117 │  */
118 ▶ export interface ConstructorSansProvider {
119 │   /**
120 │    * A list of `token`s to be resolved by the injector.
121 │    */
122 ▶   deps?: any[];
123 ▶ }
````

📄 `angular/packages/core/src/di/interface/provider.ts` L125–151 （▶ の行: 132, 142, 144）

```ts
125 │ /**
126 │  * Configures the `Injector` to return an instance of a token.
127 │  *
128 │  * @see [Dependency Injection Guide](guide/di)
129 │  *
130 │  * @usageNotes
131 │  *
132 ▶  * {@example core/di/ts/provider_spec.ts region='ConstructorProvider'}
133 │  *
134 │  * ### Multi-value example
135 │  *
136 │  * {@example core/di/ts/provider_spec.ts region='MultiProviderAspect'}
137 │  *
138 │  * @publicApi
139 │  */
140 │ export interface ConstructorProvider extends ConstructorSansProvider {
141 │   /**
142 ▶    * An injection token. Typically an instance of `Type` or `InjectionToken`, but can be `any`.
143 │    */
144 ▶   provide: Type<any>;
145 │ 
146 │   /**
147 │    * When true, injector returns an array of instances. This is useful to allow multiple
148 │    * providers spread across many files to provide configuration information to a common token.
149 │    */
150 │   multi?: boolean;
151 │ }
```

61〜62 行目「`useClass` は省ける。既定は `provide` のクラス」は、64 行目の型（`useClass: Type<any>`、`?` が無い）と合いません。省いた形は 118〜123 行目の `ConstructorSansProvider` の方で、実装も `useClass || provider.provide` と書きます（r3\_injector.ts L668、[provider の 4 つの形の章](../di/07-di-provider-to-factory.md)）。111〜114 行目の例 `@Injectable(SomeModule, {deps: []})` は、`@Injectable` が引数を 1 つしか取らないので `TS2554: Expected 0-1 arguments, but got 2.` です。142 行目の説明「たいてい Type か InjectionToken だが any でもよい」も、144 行目の型 `provide: Type<any>` と合いません（コピーした説明が残った形）。

📄 `angular/packages/core/src/di/interface/provider.ts` L167–194 （▶ の行: 175, 179, 187）

```ts
167 │ 
168 │ /**
169 │  * Configures the `Injector` to return a value of another `useExisting` token.
170 │  *
171 │  * @see [Dependency Injection Guide](guide/di)
172 │  *
173 │  * @usageNotes
174 │  *
175 ▶  * {@example core/di/ts/provider_spec.ts region='ExistingProvider'}
176 │  *
177 │  * ### Multi-value example
178 │  *
179 ▶  * {@example core/di/ts/provider_spec.ts region='MultiProviderAspect'}
180 │  *
181 │  * @publicApi
182 │  */
183 │ export interface ExistingProvider extends ExistingSansProvider {
184 │   /**
185 │    * An injection token. Typically an instance of `Type` or `InjectionToken`, but can be `any`.
186 │    */
187 ▶   provide: any;
188 │ 
189 │   /**
190 │    * When true, injector returns an array of instances. This is useful to allow multiple
191 │    * providers spread across many files to provide configuration information to a common token.
192 │    */
193 │   multi?: boolean;
194 │ }
```

📄 `angular/packages/core/src/di/interface/provider.ts` L196–203 （▶ の行: 197, 199）

```ts
196 │ /**
197 ▶  * Configures the `Injector` to return a value by invoking a `useFactory` function.
198 │  *
199 ▶  * @see {@link FactoryProvider}
200 │  * @see [Dependency Injection Guide](guide/di)
201 │  *
202 │  * @publicApi
203 │  */
```

📄 `angular/packages/core/src/di/interface/provider.ts` L217–247 （▶ の行: 224, 226, 228, 232）

```ts
217 │ 
218 │ /**
219 │  * Configures the `Injector` to return a value by invoking a `useFactory` function.
220 │  * @see [Dependency Injection Guide](guide/di)
221 │  *
222 │  * @usageNotes
223 │  *
224 ▶  * {@example core/di/ts/provider_spec.ts region='FactoryProvider'}
225 │  *
226 ▶  * Dependencies can also be marked as optional:
227 │  *
228 ▶  * {@example core/di/ts/provider_spec.ts region='FactoryProviderOptionalDeps'}
229 │  *
230 │  * ### Multi-value example
231 │  *
232 ▶  * {@example core/di/ts/provider_spec.ts region='MultiProviderAspect'}
233 │  *
234 │  * @publicApi
235 │  */
236 │ export interface FactoryProvider extends FactorySansProvider {
237 │   /**
238 │    * An injection token. (Typically an instance of `Type` or `InjectionToken`, but can be `any`).
239 │    */
240 │   provide: any;
241 │ 
242 │   /**
243 │    * When true, injector returns an array of instances. This is useful to allow multiple
244 │    * providers spread across many files to provide configuration information to a common token.
245 │    */
246 │   multi?: boolean;
247 │ }
```

📄 `angular/packages/core/src/di/interface/provider.ts` L249–264 （▶ の行: 250–251, 253, 258–259, 263–264）

```ts
249 │ /**
250 ▶  * Describes how an `Injector` should be configured as static (that is, without reflection).
251 ▶  * A static provider provides tokens to an injector for various types of dependencies.
252 │  *
253 ▶  * @see {@link Injector.create()}
254 │  * @see [Dependency Injection Guide](guide/di/defining-dependency-providers).
255 │  *
256 │  * @publicApi
257 │  */
258 ▶ export type StaticProvider =
259 ▶   | ValueProvider
260 │   | ExistingProvider
261 │   | StaticClassProvider
262 │   | ConstructorProvider
263 ▶   | FactoryProvider
264 ▶   | any[];
```

📄 `angular/packages/core/src/di/interface/provider.ts` L266–280 （▶ の行: 267, 269–270, 276, 280）

```ts
266 │ /**
267 ▶  * Configures the `Injector` to return an instance of `Type` when `Type' is used as the token.
268 │  *
269 ▶  * Create an instance by invoking the `new` operator and supplying additional arguments.
270 ▶  * This form is a short form of `TypeProvider`;
271 │  *
272 │  * For more details, see the ["Dependency Injection Guide"](guide/di).
273 │  *
274 │  * @usageNotes
275 │  *
276 ▶  * {@example core/di/ts/provider_spec.ts region='TypeProvider'}
277 │  *
278 │  * @publicApi
279 │  */
280 ▶ export interface TypeProvider extends Type<any> {}
```

📄 `angular/packages/core/src/di/interface/provider.ts` L282–295 （▶ の行: 283–284, 294）

```ts
282 │ /**
283 ▶  * Configures the `Injector` to return a value by invoking a `useClass` function.
284 ▶  * Base for `ClassProvider` decorator.
285 │  *
286 │  * @see [Dependency Injection Guide](guide/di)
287 │  *
288 │  * @publicApi
289 │  */
290 │ export interface ClassSansProvider {
291 │   /**
292 │    * Class to instantiate for the `token`.
293 │    */
294 ▶   useClass: Type<any>;
295 │ }
```

📄 `angular/packages/core/src/di/interface/provider.ts` L297–326 （▶ の行: 303, 305, 307, 311, 319）

```ts
297 │ /**
298 │  * Configures the `Injector` to return an instance of `useClass` for a token.
299 │  * @see [Dependency Injection Guide](guide/di)
300 │  *
301 │  * @usageNotes
302 │  *
303 ▶  * {@example core/di/ts/provider_spec.ts region='ClassProvider'}
304 │  *
305 ▶  * Note that following two providers are not equal:
306 │  *
307 ▶  * {@example core/di/ts/provider_spec.ts region='ClassProviderDifference'}
308 │  *
309 │  * ### Multi-value example
310 │  *
311 ▶  * {@example core/di/ts/provider_spec.ts region='MultiProviderAspect'}
312 │  *
313 │  * @publicApi
314 │  */
315 │ export interface ClassProvider extends ClassSansProvider {
316 │   /**
317 │    * An injection token. (Typically an instance of `Type` or `InjectionToken`, but can be `any`).
318 │    */
319 ▶   provide: any;
320 │ 
321 │   /**
322 │    * When true, injector returns an array of instances. This is useful to allow multiple
323 │    * providers spread across many files to provide configuration information to a common token.
324 │    */
325 │   multi?: boolean;
326 │ }
```

258〜264 行目の `StaticProvider` は「反射なしで」作れる形（250 行目）、つまり `deps` を自分で書くものだけで、`TypeProvider` と `ClassProvider`（クラスの `ɵfac` を使う形）を含みません。それでも `Injector.create` の options の形は `Array<Provider | StaticProvider>` を受けるので（injector.ts L101〜105、[第 6 回](06-crd-inject.md)）、ngc は `Injector.create({providers: [Greeting]})` をエラーにしません。267 行目の `` `Type' `` は閉じ記号の誤りで、main では 95e8dec4e22（2026-09-23）が直しました。270 行目「この形は `TypeProvider` の短い形」は自分自身を指していて、意味は「`{provide: Type, useClass: Type}` の短い形」です。

## 2. provider\_spec.ts の例を、そのまま 2 つの injector に通す

32・79・132・175・224・228・276・303 行目の `{@example}` が指す 11 の例（provider\_spec.ts L15〜223）を、DEMO 1 の「provider\_spec.ts の例をそのまま」で `Injector.create` と `createEnvironmentInjector` の両方に通しました。結果はどの例も 2 つの injector で同じで、例の `expect` のとおりでした（例の spec も `//packages/examples/core:test` で 11 件とも通る）。ただし 2 つは、見出しと例の形が違います。

> [!WARNING]
> **ハマりどころ**
>
> 276 行目が指す region `TypeProvider`（provider\_spec.ts L15〜24）の中身は `Injector.create({providers: [{provide: Greeting, useClass: Greeting}]})` で、`TypeProvider`（クラスをそのまま並べる `[Greeting]`）ではなく `ClassProvider` の形です。303 行目が指す region `ClassProvider`（L57〜71）の中身は `{provide: Shape, useValue: new Square()}` で、`useClass` ではなく `ValueProvider` の形です。DEMO 1 では、それぞれのすぐ下に本当の `[Greeting]` と `{provide: Shape, useClass: Square}` を並べました（結果は同じ）。

## 3. deps の印と multi

228 行目の `FactoryProviderOptionalDeps` の例は、`deps: [[new Optional(), Location]]` と入れ子の配列で印を付けます。DEMO 1 の「deps の印と multi の混ぜ方」では、自分にも親にもあるトークンは自分の値、`[[new Optional(), T]]` で自分に無く親にあるときは親の値でした。この配列を読むのは `injectArgs`（[provider の 4 つの形の章](../di/07-di-provider-to-factory.md)）で、`[[new Self(), T]]`・`[[new SkipSelf(), T]]`・`[[new Inject(T)]]` も同じ形です。この 3 つは[第 6 回](06-crd-inject.md)の DEMO が試しています（このページで `Self`・`Inject` の値を使うと、最初に読む JS の export が 2 つ増えたので、ここでは試していません）。印の意味は[self・skipSelf・host・optional の章](../di/12-di-resolution-flags.md)です。

47〜48 行目ほかの `multi` は、同じトークンに `multi` のものとそうでないものを混ぜた場合を書いていません。R3Injector の `processProvider`（r3\_injector.ts L497〜521、[multi の章](../di/09-di-multi-providers.md)）は、混ぜたことを `ngDevMode` の中でだけ `Cannot mix multi providers and regular providers` にします。そのため本番のこのページでは、

- multi の後に multi でないもの：エラーにならず、後の `'b'` が前の配列を黙って置き換えました（L521 の `records.set`）。
- multi でないものの後に multi：`Cannot read properties of undefined (reading 'push')` という TypeError でした。前の記録には `multi` の配列が無いのに、L512 の `multiRecord.multi!.push(provider)` を呼ぶからです。

開発モード（Node の記録）では、どちらも `Cannot mix multi providers and regular providers` です。

## 4. EnvironmentProviders：コンポーネントに入れたとき

📄 `angular/packages/core/src/di/provider_collection.ts` L53–80 （▶ の行: 56–57, 59, 69, 72, 75）

````ts
53 │ 
54 │ /**
55 │  * @description
56 ▶  * This function is used to provide initialization functions that will be executed upon construction
57 ▶  * of an environment injector.
58 │  *
59 ▶  * Note that the provided initializer is run in the injection context.
60 │  *
61 │  * Previously, this was achieved using the `ENVIRONMENT_INITIALIZER` token which is now deprecated.
62 │  *
63 │  * @see {@link ENVIRONMENT_INITIALIZER}
64 │  *
65 │  * @usageNotes
66 │  * The following example illustrates how to configure an initialization function using
67 │  * `provideEnvironmentInitializer()`
68 │  * ```ts
69 ▶  * createEnvironmentInjector(
70 │  *   [
71 │  *     provideEnvironmentInitializer(() => {
72 ▶  *       console.log('environment initialized');
73 │  *     }),
74 │  *   ],
75 ▶  *   parentInjector
76 │  * );
77 │  * ```
78 │  *
79 │  * @publicApi
80 │  */
````

📄 `angular/packages/core/src/di/initializer_token.ts` L9–26 （▶ の行: 12–13, 15, 19–20, 24）

```ts
 9 │ import {InjectionToken} from './injection_token';
10 │ 
11 │ /**
12 ▶  * A multi-provider token for initialization functions that will run upon construction of an
13 ▶  * environment injector.
14 │  *
15 ▶  * @deprecated from v19.0.0, use provideEnvironmentInitializer instead
16 │  *
17 │  * @see {@link provideEnvironmentInitializer}
18 │  *
19 ▶  * Note: As opposed to the `APP_INITIALIZER` token, the `ENVIRONMENT_INITIALIZER` functions are not awaited,
20 ▶  * hence they should not be `async`.
21 │  *
22 │  * @publicApi
23 │  */
24 ▶ export const ENVIRONMENT_INITIALIZER = new InjectionToken<ReadonlyArray<() => void>>(
25 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'ENVIRONMENT_INITIALIZER' : '',
26 │ );
```

📄 `angular/packages/core/src/di/provider_collection.ts` L90–105 （▶ の行: 96–99）

```ts
 90 │ 
 91 │ /**
 92 │  * A source of providers for the `importProvidersFrom` function.
 93 │  *
 94 │  * @publicApi
 95 │  */
 96 ▶ export type ImportProvidersSource =
 97 ▶   | Type<unknown>
 98 ▶   | ModuleWithProviders<unknown>
 99 ▶   | Array<ImportProvidersSource>;
100 │ 
101 │ type WalkProviderTreeVisitor = (
102 │   provider: SingleProvider,
103 │   container: Type<unknown> | AbstractType<unknown> | InjectorType<unknown>,
104 │ ) => void;
105 │ 
```

📄 `angular/packages/core/src/di/provider_collection.ts` L106–143 （▶ の行: 107, 110–112, 116, 121, 126, 134）

````ts
106 │ /**
107 ▶  * Collects providers from all NgModules and standalone components, including transitively imported
108 │  * ones.
109 │  *
110 ▶  * Providers extracted via `importProvidersFrom` are only usable in an application injector or
111 ▶  * another environment injector (such as a route injector). They should not be used in component
112 ▶  * providers.
113 │  *
114 │  *
115 │  * @usageNotes
116 ▶  * The results of the `importProvidersFrom` call can be used in the `bootstrapApplication` call:
117 │  *
118 │  * ```ts
119 │  * await bootstrapApplication(RootComponent, {
120 │  *   providers: [
121 ▶  *     importProvidersFrom(NgModuleOne, NgModuleTwo)
122 │  *   ]
123 │  * });
124 │  * ```
125 │  *
126 ▶  * You can also use the `importProvidersFrom` results in the `providers` field of a route, when a
127 │  * standalone component is used:
128 │  *
129 │  * ```ts
130 │  * export const ROUTES: Route[] = [
131 │  *   {
132 │  *     path: 'foo',
133 │  *     providers: [
134 ▶  *       importProvidersFrom(NgModuleOne, NgModuleTwo)
135 │  *     ],
136 │  *     component: YourStandaloneComponent
137 │  *   }
138 │  * ];
139 │  * ```
140 │  *
141 │  * @returns Collected providers from the specified list of types.
142 │  * @publicApi
143 │  */
````

`EnvironmentProviders` の説明（provider.ts L345〜362「`@Component.providers` に入って component の injector に紛れ込むのを防ぐ」）と `makeEnvironmentProviders`（provider\_collection.ts L40〜52）は[importProvidersFrom の章](../ngmodule/14-ngmodule-import-providers-from.md)が引いています。「防ぐ」は 2 段です。

1. **型**

   `EnvironmentProviders` は `{ɵbrand: 'EnvironmentProviders'}` という型で、`Provider` に入りません。`@Component({providers: [makeEnvironmentProviders([...])]})` と `importProvidersFrom(M)` は、ngc で `TS2322: Type 'EnvironmentProviders' is not assignable to type 'Provider'.` でした。実体は `{ɵproviders: [...]}`（DEMO の Object.keys の行）です。
2. **実行時（開発モードだけ）**

   `as never` で型を外して作ると、開発モード（記録）では `NG0207: Invalid providers present in a non-environment injector. 'EnvironmentProviders' can't be used for component providers.` と、`importProvidersFrom` のときは `NG0207: Invalid providers from 'importProvidersFrom' present …` でした（`providerToFactory` の先頭の `if (ngDevMode && isEnvironmentProviders(provider))`、r3\_injector.ts L645〜647 と render3/errors\_di.ts L50〜62。spec の `should be rejected by @Component.providers`）。
3. **本番**

   このページでは、どちらも `Cannot convert undefined or null to object` という TypeError でした。確かめを飛ばした `providerToFactory` が、`{ɵproviders}` を `provide` の無いクラスの provider として扱い先へ進むからです。

107 行目「NgModule と standalone のコンポーネントから集める」と 96〜99 行目の型（`Type<unknown>`）に対して、`importProvidersFrom(standalone のコンポーネント)` は、開発モードでは `NG0800: Importing providers supports NgModule or ModuleWithProviders but got a standalone component "CrdpvStandalone"` で止まります（provider\_collection.ts L164〜174 の確かめが `ngDevMode` の中）。本番のこのページでは止まらず、そのコンポーネントが imports した NgModule の providers を集めて `'NgModule の providers'` を返しました。107 行目の「standalone のコンポーネント」は、木の途中で出会うもの（`walkProviderTree` がたどる imports）を指していて、入口に渡すのは開発モードでは誤りです。同じコードが開発と本番で違う結果になります。

56〜59 行目の `provideEnvironmentInitializer` は、DEMO で `inject(CRDPV_ENV)` が同じ injector の値を読み（注入の文脈）、`createEnvironmentInjector` が返る前に呼ばれました。initializer\_token.ts の 19〜20 行目「await しない」のとおり、async の initializer は始まったところで `createEnvironmentInjector` が返りました。

> **🧪 DEMO 1 — Provider の形を Injector.create と createEnvironmentInjector に通す（このページは本番、記録は開発モード）**
>
> 押すと、同じ providers で `Injector.create` と `createEnvironmentInjector`（親はこのページの EnvironmentInjector）を作って get し、すぐ destroy します。EnvironmentProviders の表は `createComponent` も使います（作れたら destroy）。「開発モード（記録）」は同じ関数を Node（domino の上の JIT、開発モード）で走らせた手元の記録の `createEnvironmentInjector` の列です。判定の「本番と開発で違う」は、エラーの番号までをそろえても結果が違う行です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-provider)

## 5. defs.ts：ɵprov と ɵinj の形

📄 `angular/packages/core/src/di/interface/defs.ts` L22–36 （▶ の行: 25–26, 28–30, 33–34）

```ts
22 │ /**
23 │  * Information about how a type or `InjectionToken` interfaces with the DI system.
24 │  *
25 ▶  * At a minimum, this includes a `factory` which defines how to create the given type `T`, possibly
26 ▶  * requesting injection of other types if necessary.
27 │  *
28 ▶  * Optionally, a `providedIn` parameter specifies that the given type belongs to a particular
29 ▶  * `Injector`, `NgModule`, or a special scope (e.g. `'root'`). A value of `null` indicates
30 ▶  * that the injectable does not belong to any scope.
31 │  *
32 │  * @codeGenApi
33 ▶  * @publicApi The ViewEngine compiler emits code with this type for injectables. This code is
34 ▶  *   deployed to npm, and should be treated as public api.
35 │ 
36 │  */
```

📄 `angular/packages/core/src/di/interface/defs.ts` L59–77 （▶ の行: 61, 63, 70–72, 74）

```ts
59 │ 
60 │   /**
61 ▶    * In a case of no explicit injector, a location where the instance of the injectable is stored.
62 │    */
63 ▶   value: any;
64 │ }
65 │ 
66 │ /**
67 │  * Information about the providers to be included in an `Injector` as well as how the given type
68 │  * which carries the information should be created by the DI system.
69 │  *
70 ▶  * An `InjectorDef` can import other types which have `InjectorDefs`, forming a deep nested
71 ▶  * structure of providers with a defined priority (identically to how `NgModule`s also have
72 ▶  * an import/dependency structure).
73 │  *
74 ▶  * NOTE: This is a private type and should not be exported
75 │  *
76 │  * @codeGenApi
77 │  */
```

33〜34 行目「ViewEngine のコンパイラがこの型のコードを出す」は、ViewEngine が消えた（8c71b9fc42e、2021-11-09）あとも残る説明です。`providedIn` の 6 つの値（L37〜58）は[providedIn の章](../ngmodule/10-ngmodule-provided-in.md)が引いています。61〜63 行目の `value` は「injector が無いときに実例を置く場所」で、injector が設定されていないときに `providedIn: 'root'` のものを作って置く `injectRootLimpMode`（inject\_switch.ts L50〜59 の `injectableDef.value = injectableDef.factory()`）が使います（[第 6 回](06-crd-inject.md)）。

📄 `angular/packages/core/src/di/interface/defs.ts` L95–120 （▶ の行: 99–100, 106, 108, 114, 116）

```ts
 95 │ 
 96 │ /**
 97 │  * A `Type` which has a `ɵprov: ɵɵInjectableDeclaration` static field.
 98 │  *
 99 ▶  * `InjectableType`s contain their own Dependency Injection metadata and are usable in an
100 ▶  * `InjectorDef`-based `StaticInjector`.
101 │  *
102 │  * @publicApi
103 │  */
104 │ export interface InjectableType<T> extends Type<T> {
105 │   /**
106 ▶    * Opaque type whose structure is highly version dependent. Do not rely on any properties.
107 │    */
108 ▶   ɵprov: unknown;
109 │ }
110 │ 
111 │ /**
112 │  * A type which has an `InjectorDef` static field.
113 │  *
114 ▶  * `InjectorTypes` can be used to configure a `StaticInjector`.
115 │  *
116 ▶  * This is an opaque type whose structure is highly version dependent. Do not rely on any
117 │  * properties.
118 │  *
119 │  * @publicApi
120 │  */
```

📄 `angular/packages/core/src/di/interface/defs.ts` L137–166 （▶ の行: 157–161, 165）

```ts
137 │     | Type<any>
138 │     | ValueProvider
139 │     | ExistingProvider
140 │     | FactoryProvider
141 │     | ConstructorProvider
142 │     | StaticClassProvider
143 │     | ClassProvider
144 │     | EnvironmentProviders
145 │     | any[]
146 │   )[];
147 │ }
148 │ 
149 │ /**
150 │  * Construct an injectable definition which defines how a token will be constructed by the DI
151 │  * system, and in which injectors (if any) it will be available.
152 │  *
153 │  * This should be assigned to a static `ɵprov` field on a type, which will then be an
154 │  * `InjectableType`.
155 │  *
156 │  * Options:
157 ▶  * * `providedIn` determines which injectors will include the injectable, by either associating it
158 ▶  *   with an `@NgModule` or other `InjectorType`, or by specifying that this injectable should be
159 ▶  *   provided in the `'root'` injector, which will be the application-level injector in most apps.
160 ▶  * * `factory` gives the zero argument function which will create an instance of the injectable.
161 ▶  *   The factory can call [`inject`](api/core/inject) to access the `Injector` and request injection
162 │  * of dependencies.
163 │  *
164 │  * @codeGenApi
165 ▶  * @publicApi This instruction has been emitted by ViewEngine for some time and is deployed to npm.
166 │  */
```

📄 `angular/packages/core/src/di/interface/defs.ts` L178–185 （▶ の行: 180, 183–184）

```ts
178 │ }
179 │ 
180 ▶ /**
181 │  * Construct an `InjectorDef` which configures an injector.
182 │  *
183 ▶  * This should be assigned to a static injector def (`ɵinj`) field on a type, which will then be an
184 ▶  * `InjectorType`.
185 │  *
```

100・114 行目の `StaticInjector` は今の `R3Injector` の前の名前で、165 行目も ViewEngine の話です（古いだけ）。`ɵɵdefineInjectable` の本体（L167〜178）は `providedIn: opts.providedIn || null` で、DEMO の最後の行のとおり `''` も `null` になり、`value` は `undefined` で始まります。`ɵɵdefineInjector`（L197〜199）は `providers` と `imports` を配列にそろえるだけで、AOT がこの章の `CrdpvModule` に書いた `ɵinj` は、このページでは `providers` にモジュールの provider が 1 つ、`imports` は空でした（JIT の記録では `imports` が `[[],[]]`。JIT は imports と exports の 2 つの配列を渡す）。

📄 `angular/packages/core/src/di/interface/defs.ts` L200–222 （▶ の行: 202–203, 207–208, 220–221）

```ts
200 │ 
201 │ /**
202 ▶  * Read the injectable def (`ɵprov`) for `type` in a way which is immune to accidentally reading
203 ▶  * inherited value.
204 │  *
205 │  * @param type A type which may have its own (non-inherited) `ɵprov`.
206 │  */
207 ▶ export function getInjectableDef<T>(type: any): ɵɵInjectableDeclaration<T> | null {
208 ▶   return getOwnDefinition(type, NG_PROV_DEF);
209 │ }
210 │ 
211 │ export function isInjectable(type: any): boolean {
212 │   return getInjectableDef(type) !== null;
213 │ }
214 │ 
215 │ /**
216 │  * Return definition only if it is defined directly on `type` and is not inherited from a base
217 │  * class of `type`.
218 │  */
219 │ function getOwnDefinition<T>(type: any, field: string): ɵɵInjectableDeclaration<T> | null {
220 ▶   // if the ɵprov prop exist but is undefined we still want to return null
221 ▶   return (Object.hasOwn(type, field) && type[field]) || null;
222 │ }
```

📄 `angular/packages/core/src/di/interface/defs.ts` L224–252 （▶ の行: 225, 229–230, 234, 237–240, 242）

```ts
224 │ /**
225 ▶  * Read the injectable def (`ɵprov`) for `type` or read the `ɵprov` from one of its ancestors.
226 │  *
227 │  * @param type A type which may have `ɵprov`, via inheritance.
228 │  *
229 ▶  * @deprecated Will be removed in a future version of Angular, where an error will occur in the
230 ▶  *     scenario if we find the `ɵprov` on an ancestor only.
231 │  */
232 │ export function getInheritedInjectableDef<T>(type: any): ɵɵInjectableDeclaration<T> | null {
233 │   // if the ɵprov prop exist but is undefined we still want to return null
234 ▶   const def = type?.[NG_PROV_DEF] ?? null;
235 │ 
236 │   if (def) {
237 ▶     ngDevMode &&
238 ▶       console.warn(
239 ▶         `DEPRECATED: DI is instantiating a token "${type.name}" that inherits its @Injectable decorator but does not provide one itself.\n` +
240 ▶           `This will become an error in a future version of Angular. Please add @Injectable() to the "${type.name}" class.`,
241 │       );
242 ▶     return def;
243 │   } else {
244 │     return null;
245 │   }
246 │ }
247 │ 
248 │ /**
249 │  * Read the injector def type in a way which is immune to accidentally reading inherited value.
250 │  *
251 │  * @param type type which may have an injector def (`ɵinj`)
252 │  */
```

`getInjectableDef` は自分のフィールドだけを読み（221 行目の `Object.hasOwn`）、`getInheritedInjectableDef` は親から受け継いだ `ɵprov` も読みます。DEMO の「EnvironmentProviders と initializer」で、`@Injectable({providedIn: 'root'})` の親をデコレーターなしで extends した子を `[CrdpvChild]` と provide すると、子のクラスの実例が作られ（親の factory が子の型で呼ばれる）、開発モードでは 238〜240 行目の `DEPRECATED: DI is instantiating a token "CrdpvChild" that inherits its @Injectable decorator but does not provide one itself.` が `console.warn` に出ました（このページの本番では出ない）。229〜230 行目の「将来はエラー」はまだです。

📄 `angular/packages/core/src/di/provider_collection.ts` L210–231 （▶ の行: 214, 221, 227–230）

```ts
210 │ 
211 │ /**
212 │  * Internal type for a single provider in a deep provider array.
213 │  */
214 ▶ export type SingleProvider =
215 │   | TypeProvider
216 │   | ValueProvider
217 │   | ClassProvider
218 │   | ConstructorProvider
219 │   | ExistingProvider
220 │   | FactoryProvider
221 ▶   | StaticClassProvider;
222 │ 
223 │ /**
224 │  * The logic visits an `InjectorType`, an `InjectorTypeWithProviders`, or a standalone
225 │  * `ComponentType`, and all of its transitive providers and collects providers.
226 │  *
227 ▶  * If an `InjectorTypeWithProviders` that declares providers besides the type is specified,
228 ▶  * the function will return "true" to indicate that the providers of the type definition need
229 ▶  * to be processed. This allows us to process providers of injector types after all imports of
230 ▶  * an injector definition are processed. (following View Engine semantics: see FW-1349)
231 │  */
```

📄 `angular/packages/core/src/di/interface/provider.ts` L375–386 （▶ の行: 378, 385）

```ts
375 │ export function isEnvironmentProviders(
376 │   value: Provider | EnvironmentProviders | InternalEnvironmentProviders,
377 │ ): value is InternalEnvironmentProviders {
378 ▶   return value && !!(value as InternalEnvironmentProviders).ɵproviders;
379 │ }
380 │ 
381 │ /**
382 │  * Describes a function that is used to process provider lists (such as provider
383 │  * overrides).
384 │  */
385 ▶ export type ProcessProvidersFunction = (providers: Provider[]) => Provider[];
386 │ 
```

230 行目の「View Engine の意味論に合わせて（FW-1349）」は、`ModuleWithProviders` の providers を imports を全部たどったあとに足す順のことで、[第 3 回](03-crd-query-module.md)の DEMO の `forRoot` の行がこれです。`ModuleWithProviders` の L389「型引数なしは非推奨」は、今は非推奨ではなく型の誤り（`TS2314: Generic type 'ModuleWithProviders<T>' requires 1 type argument(s).`）です。`ProcessProvidersFunction`（385 行目）は TestBed の provider の上書きが使う型です。

## 説明文の例を ngc にかける

📄 `例を strict + strictTemplates の ngc にかけた結果（2026-11-21、手元の記録）`

```
# 説明文の例を、strict の tsc と strictTemplates の ngc（@angular/compiler-cli 22.2.6）にかける
injectable-two-args.ts（provider.ts L111-114 の @Injectable(SomeModule, {deps: []})）
  TS2554: Expected 0-1 arguments, but got 2.
create-typeprovider.ts（Injector.create({providers: [Greeting]}) と {provide, useClass}）   エラー 0
  # Injector.create の options の形は Array<Provider | StaticProvider> を受ける（injector.ts L101-105）
component-envproviders.ts（@Component.providers に makeEnvironmentProviders・importProvidersFrom）
  TS2322: Type 'EnvironmentProviders' is not assignable to type 'Provider'.（2 か所）
env-initializer.ts（provider_collection.ts L69-76）   エラー 0
mwp-nogeneric.ts（型引数なしの ModuleWithProviders）
  TS2314: Generic type 'ModuleWithProviders<T>' requires 1 type argument(s).
```

## ここまでの呼び出し

- 👤 `createEnvironmentInjector([{provide: M, useValue: 'b'}, {provide: M, multi: true, useValue: 'a'}], env)`
  - `new R3Injector(…)` → `forEachSingleProvider` → `processProvider` — r3\_injector.ts L473〜
    - `providerToRecord(provider)` → `providerToFactory` — L640〜 — *ngDevMode なら EnvironmentProviders を NG0207*
    - `multi === true` → `records.get(token)` は前の普通の記録 — L497〜512 — *ngDevMode なら Cannot mix…、本番は multi.push で TypeError*
- 👤 `importProvidersFrom(StandaloneCmp)`
  - `internalImportProvidersFrom(true, sources)` — provider\_collection.ts L151〜 — *ngDevMode なら NG0800、本番は walkProviderTree へ*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `packages/examples/core/di/ts/provider_spec.ts` | `Provider examples` の 11 の it（14〜205） | 2 節の例そのもの |
| `packages/core/test/di/r3_injector_spec.ts` | `injects a service with optional dependencies`（371）・`injects a token with useExisting`（394）・`instantiates a class with useClass and deps`（409） | 2〜3 節 |
| `packages/core/test/di/static_injector_spec.ts` | `should throw when mixing multi providers with regular providers`（158） | 3 節の開発モードの文だけ。本番の振る舞いの it は無い |
| `packages/core/test/acceptance/di_spec.ts` | `importProvidersFrom › should throw when trying to import providers from standalone components`（311）・`EnvironmentProviders › should be rejected by @Component.providers`（415） | 4 節。どちらも開発モード（テストは開発モードで走る）の確かめ |
| `packages/core/test/acceptance/environment_injector_spec.ts` | `should support the ENVIRONMENT_INITIALIZER multi-token`（120） | 4 節の initializer |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/examples/core:test --nocache_test_results --test_output=all "--test_arg=--filter=^Provider examples"
                                                        Ran 11 of 32 specs、0 failures
$ pnpm bazel test //packages/core/test/acceptance:acceptance ... "--test_arg=--filter=<下の名前>"
^importProvidersFrom                                    Ran 9 of 2693 specs、0 failures
^EnvironmentProviders                                   Ran 8 of 2693 specs、0 failures
should support the ENVIRONMENT_INITIALIZER multi-token  Ran 1 of 2693 specs、0 failures
$ pnpm bazel test //packages/core/test:test ... "--test_arg=--filter=<下の名前>"     # 4 つに割った 1 つで走る
should throw when mixing multi providers with regular providers  Ran 1 of 1401 specs、0 failures
injects a service with optional dependencies                     Ran 1 of 1401 specs、0 failures
instantiates a class with useClass and deps                      Ran 1 of 1401 specs、0 failures
injects a token with useExisting                                 Ran 1 of 1401 specs、0 failures
```

直すとしたら、説明文は provider.ts の L61〜62（`useClass` は省けない）、L111〜114（`@Injectable({providedIn: SomeModule, deps: []})` などの 1 引数の形）、L142、L270、L389（非推奨ではなく必須）と、provider\_spec.ts の region `TypeProvider`・`ClassProvider` の中身を見出しの形に、です。コードの側は、開発モードの 3 つの確かめ（r3\_injector.ts L503・L514〜519 の multi の混ぜ方、L645〜647 の EnvironmentProviders、provider\_collection.ts L164〜174 の standalone）を本番でも短いエラーで止めるかどうかで、本番で黙って通る今の振る舞いを変えることになります。spec は今どれも開発モードの文しか見ていないので、`ngDevMode = false` にして走らせる it が無い、という所から始まります。

## 聞かれそうな質問

**Q. `{provide: A, useClass: B}` と `{provide: A, useClass: B, deps: [X]}` は何が違いますか？**

前者（`ClassProvider`）は B の `ɵfac`（`@Injectable` が作る）で B を作り、後者（`StaticClassProvider`）は `new B(...injectArgs([X]))` で作ります。`Injector.create` の古い配列の形が受けるのは後者だけです（StaticProvider、258〜264 行目）。

**Q. deps に `@Optional` を付けるにはどう書きますか？**

`deps: [[new Optional(), Token]]` と、1 つの依存を配列にして印とトークンを並べます（provider.ts L228 が指す例）。`Self`・`SkipSelf`・`Inject` も同じ形で書きます（第 6 回の DEMO）。

**Q. 同じトークンに multi と普通の provider を混ぜるとどうなりますか？**

開発モードでは `Cannot mix multi providers and regular providers` です。本番では、multi の後の普通のものは黙って配列を置き換え、普通のものの後の multi は `Cannot read properties of undefined (reading 'push')` の TypeError になりました。

**Q. `importProvidersFrom` をコンポーネントの providers に書くと？**

型で止まります（`TS2322`）。型を外すと開発モードでは `NG0207`、本番では `Cannot convert undefined or null to object` です。コンポーネントではなく、`bootstrapApplication` か Route の providers に書きます（provider\_collection.ts L116〜139 の例）。

**Q. `provideEnvironmentInitializer` に async の関数を渡すと、injector は待ちますか？**

待ちません。始まったところで `createEnvironmentInjector` が返ります（initializer\_token.ts L19〜20）。待たせたいならアプリの起動では `provideAppInitializer` の方です。

## 読み終えて

- Provider の型は Sans と Provider の 2 段。`StaticProvider` は `deps` を書く形だけで、`Injector.create` の options の形は `Provider` も受ける。
- provider\_spec.ts の 11 の例は 2 つの injector で同じに動くが、TypeProvider と ClassProvider の例は別の形を見せている。
- deps の印は入れ子の配列。multi を混ぜると、本番では黙って置き換わるか TypeError。
- EnvironmentProviders をコンポーネントに入れるのを止めるのは型と開発モードの確かめで、本番は TypeError。standalone のコンポーネントの `importProvidersFrom` は本番だけ通る。

---

← 前: [@Injectable・InjectionToken・forwardRef の説明文](04-crd-injectable-token.md)  
次: [inject と Injector の説明文：フラグ・注入の文脈・Injector.create](06-crd-inject.md) →
