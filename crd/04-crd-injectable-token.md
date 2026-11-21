[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 4 回 / 全 10 回

# @Injectable・InjectionToken・forwardRef の説明文

> di/injectable.ts・injection\_token.ts・forward\_ref.ts・service.ts・jit/injectable.ts・jit/service.ts の未読の行：providedIn の各値、factory つきの InjectionToken、forwardRef と resolveForwardRef の例、v22 の @Service、JIT のときの作られ方。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-injectable-token)

---

この章で分かること：`@Injectable` の型と `providedIn` の各値、`InjectionToken` の `factory` と `providedIn`、`forwardRef` と `resolveForwardRef`、v22 の `@Service` の説明文が約束することを、本物の `Injector.create` と `createEnvironmentInjector` で確かめます。あわせて、JIT でこれらのデコレーターが `ɵprov` と `ɵfac` を作る `jit/injectable.ts`・`jit/service.ts` を読みます。説明と合わなかったのは、`forwardRef` の standalone の例が TypeScript で止まること（`forwardRef` を付ける側が逆）、`InjectionToken` の `providedIn: null` が `'root'` になること、例の 2 つ（forwardRef と `@Injectable`）が説明しているものを実際には使っていないことです。

読む対象は `packages/core/src/di/` の `injectable.ts`・`injection_token.ts`・`forward_ref.ts`・`service.ts`・`interface/service.ts`・`jit/`（../angular、8576f161ae4）です。`providedIn` の値がどの injector で解決されるか（`injectableDefInScope`）は[providedIn の章](../ngmodule/10-ngmodule-provided-in.md)、AOT が `ɵprov` を作る所と `@Service` の AOT の形は[@Injectable と @Service のコンパイルの章](../di/05-di-injectable-compile.md)、`InjectionToken` の中身と特殊なトークンは[InjectionToken の章](../di/06-di-injection-token.md)、standalone の imports の `forwardRef` は[forwardRef と自己参照の章](../standalone/05-standalone-forward-ref.md)にあります。

1. [1. @Directive](01-crd-directive.md)
2. [2. @Component](02-crd-component.md)
3. [3. クエリと @NgModule](03-crd-query-module.md)
4. **4. @Injectable・InjectionToken**（この章）
5. [5. Provider の形](05-crd-provider.md)
6. [6. inject と Injector](06-crd-inject.md)
7. [7. ライフサイクル](07-crd-lifecycle.md)
8. [8. differ](08-crd-differs.md)
9. [9. スケジューラー](09-crd-scheduling.md)
10. [10. spec と issue](10-crd-tests-issues.md)

> [!NOTE]
> **ポイント**
>
> DEMO はこのページの root の injector に実例を残さないように、`'platform'` と `'root'` の役をする injector を自分で作ります。`createEnvironmentInjector([{provide: ɵINJECTOR_SCOPE, useValue: 'root'}], 親)` のように、`INJECTOR_SCOPE`（di/scope.ts）を provide した injector は、自分を root の階層として扱います（R3Injector の constructor がこのトークンの値を `scopes` に足す、r3\_injector.ts L238〜。[providedIn の章](../ngmodule/10-ngmodule-provided-in.md)の 4 節）。`bootstrapApplication` が作る root の injector も同じ印を持っています。

## 1. @Injectable の型：6 つの InjectableProvider

📄 `angular/packages/core/src/di/injectable.ts` L24–41 （▶ の行: 29–35）

```ts
24 │ /**
25 │  * Injectable providers used in `@Injectable` decorator.
26 │  *
27 │  * @publicApi
28 │  */
29 ▶ export type InjectableProvider =
30 ▶   | ValueSansProvider
31 ▶   | ExistingSansProvider
32 ▶   | StaticClassSansProvider
33 ▶   | ConstructorSansProvider
34 ▶   | FactorySansProvider
35 ▶   | ClassSansProvider;
36 │ 
37 │ /**
38 │  * Type of the Injectable decorator / constructor function.
39 │  *
40 │  * @publicApi
41 │  */
```

📄 `angular/packages/core/src/di/injectable.ts` L42–81 （▶ の行: 53, 55, 60, 63, 66, 68–69, 72）

```ts
42 │ export interface InjectableDecorator {
43 │   /**
44 │    * Decorator that marks a class as available to be
45 │    * provided and injected as a dependency.
46 │    *
47 │    * @see [Introduction to Services and DI](guide/di)
48 │    * @see [Creating and using services](guide/di/creating-and-using-services)
49 │    * @see [Defining dependency providers](guide/di/defining-dependency-providers)
50 │    *
51 │    * @usageNotes
52 │    *
53 ▶    * Marking a class with `@Injectable` ensures that the compiler
54 │    * will generate the necessary metadata to create the class's
55 ▶    * dependencies when the class is injected.
56 │    *
57 │    * The following example shows how a service class is properly
58 │    *  marked so that a supporting service can be injected upon creation.
59 │    *
60 ▶    * {@example core/di/ts/metadata_spec.ts region='Injectable'}
61 │    *
62 │    */
63 ▶   (): TypeDecorator;
64 │ 
65 │   /**
66 ▶    * @deprecated The `providedIn: NgModule` or `providedIn:'any'` options are deprecated. Please use the other signatures.
67 │    */
68 ▶   (options?: {providedIn: Type<any> | 'any'} & InjectableProvider): TypeDecorator;
69 ▶   (options?: {providedIn: 'root' | 'platform' | null} & InjectableProvider): TypeDecorator;
70 │   new (): Injectable;
71 │   new (
72 ▶     options?: {providedIn: Type<any> | 'root' | 'platform' | 'any' | null} & InjectableProvider,
73 │   ): Injectable;
74 │ }
75 │ 
76 │ /**
77 │  * Type of the Injectable metadata.
78 │  *
79 │  *
80 │  * @publicApi
81 │  */
```

29〜35 行目の `InjectableProvider` は、`@Injectable` の引数に `useValue`・`useExisting`・`useClass`（と `deps`）・`useFactory` を混ぜられることを型で言っています（それぞれの `…SansProvider` は[第 5 回](05-crd-provider.md)）。説明文にはこの形の説明がありません。DEMO 1 の「@Injectable の useClass ほか」で 4 つを `providedIn: 'root'` と組み合わせると、どれも書いたとおりの値が root の役の injector から返りました。66〜69 行目は、`providedIn` に NgModule の型か `'any'` を渡す呼び方だけを `@deprecated` の重ね書き（overload）に分けています。型の上で別の重ね書きにしてあるので、エディターはその呼び方にだけ取り消し線を出します。

53〜55 行目「コンパイラが依存を作るためのメタデータを生成する」の例（60 行目が指す packages/examples/core/di/ts/metadata\_spec.ts L64〜）は、`@Injectable()` を付けた `NeedsService` を、`Injector.create({providers: [{provide: NeedsService, deps: [UsefulService]}, …]})` で作ります。provider に `deps` を書いているので、`@Injectable` が生成する `ɵfac` は使われません（`deps` を持つ provider は `injectArgs(deps)` で作る、[provider が関数になるまでの章](../di/07-di-provider-to-factory.md)）。例が言いたいことは、6 節の forwardRef の例と同じ理由で、例のコードでは確かめられていません。

## 2. providedIn の 5 つの値

`Injectable` インターフェースの `providedIn` の説明（injectable.ts L84〜100）は[providedIn の章](../ngmodule/10-ngmodule-provided-in.md)が引いているので、ここでは結果だけを DEMO 1 の「providedIn の各値」で確かめます。

- `'root'`：root の下の 2 つの子から get すると同じ実例でした（L93）。`Injector.create({providers: []})` からは ``NG0201: No provider found for `CrditRootSvc`.`` です。`Injector.create` が作る injector は `INJECTOR_SCOPE` を持たず、親も `NullInjector` なので、`'root'` の印を持つ injector がどこにもありません。
- `'platform'`：root の役の injector の上の platform の役の injector で 1 つ作られ、子と root から同じ実例でした（L94〜95）。
- `'any'`：子 A・子 B・root・`Injector.create` のどれから get しても、それぞれ別の実例が作られました。injectable.ts L96〜97「遅延モジュールごとに 1 つ、先に読んだモジュールは 1 つを共有」は NgModule で言い直した説明で、実装は「聞かれた injector ごとに 1 つ」です（`injectableDefInScope` が `providedIn === 'any'` なら どの injector でも `true` を返す、r3\_injector.ts L557）。spec の `should support tree shakable injectors scopes` も、`Injector.create` の子の injector で作られることを確かめています。
- `null` と引数なしの `@Injectable()`：どこにも入らず `NG0201`、providers に入れると作られました（L88〜89）。JIT では jit/injectable.ts L110 の `srcMeta || {providedIn: null}`（[providedIn の章](../ngmodule/10-ngmodule-provided-in.md)が引いている）が、引数なしを `null` と同じにします。
- NgModule の型：root からは `NG0201`、`importProvidersFrom(CrditOwnerModule)` を入れた injector からは作られました（L86〜87、非推奨）。

## 3. JIT の compileInjectable：初めて読まれたときにコンパイルする

📄 `angular/packages/core/src/di/injectable.ts` L102–115 （▶ の行: 109, 111, 114）

```ts
102 │ 
103 │ /**
104 │  * Injectable decorator and metadata.
105 │  *
106 │  * @Annotation
107 │  * @publicApi
108 │  */
109 ▶ export const Injectable: InjectableDecorator = makeDecorator(
110 │   'Injectable',
111 ▶   undefined,
112 │   undefined,
113 │   undefined,
114 ▶   (type: Type<any>, meta: Injectable) => compileInjectable(type as any, meta),
115 │ );
```

📄 `angular/packages/core/src/di/jit/injectable.ts` L30–57 （▶ の行: 39, 42, 48, 51–52, 56）

```ts
30 │ /**
31 │  * Compile an Angular injectable according to its `Injectable` metadata, and patch the resulting
32 │  * injectable def (`ɵprov`) onto the injectable type.
33 │  */
34 │ export function compileInjectable(type: Type<any>, meta?: Injectable): void {
35 │   let ngInjectableDef: any = null;
36 │   let ngFactoryDef: any = null;
37 │ 
38 │   // if NG_PROV_DEF is already defined on this class then don't overwrite it
39 ▶   if (!Object.hasOwn(type, NG_PROV_DEF)) {
40 │     Object.defineProperty(type, NG_PROV_DEF, {
41 │       get: () => {
42 ▶         if (ngInjectableDef === null) {
43 │           const compiler = getCompilerFacade({
44 │             usage: JitCompilerUsage.Decorator,
45 │             kind: 'injectable',
46 │             type,
47 │           });
48 ▶           ngInjectableDef = compiler.compileInjectable(
49 │             angularCoreDiEnv,
50 │             `ng:///${type.name}/ɵprov.js`,
51 ▶             getInjectableMetadata(type, meta),
52 ▶           );
53 │         }
54 │         return ngInjectableDef;
55 │       },
56 ▶     });
57 │   }
```

📄 `angular/packages/core/src/di/jit/injectable.ts` L58–83 （▶ の行: 60–61, 69, 73–74, 79–81）

```ts
58 │ 
59 │   // if NG_FACTORY_DEF is already defined on this class then don't overwrite it
60 ▶   if (!Object.hasOwn(type, NG_FACTORY_DEF)) {
61 ▶     Object.defineProperty(type, NG_FACTORY_DEF, {
62 │       get: () => {
63 │         if (ngFactoryDef === null) {
64 │           const compiler = getCompilerFacade({
65 │             usage: JitCompilerUsage.Decorator,
66 │             kind: 'injectable',
67 │             type,
68 │           });
69 ▶           ngFactoryDef = compiler.compileFactory(angularCoreDiEnv, `ng:///${type.name}/ɵfac.js`, {
70 │             name: type.name,
71 │             type,
72 │             typeArgumentCount: 0, // In JIT mode types are not available nor used.
73 ▶             deps: reflectDependencies(type),
74 ▶             target: compiler.FactoryTarget.Injectable,
75 │           });
76 │         }
77 │         return ngFactoryDef;
78 │       },
79 ▶       // Leave this configurable so that the factories from directives or pipes can take precedence.
80 ▶       configurable: true,
81 ▶     });
82 │   }
83 │ }
```

1. **デコレーターが getter を置く**

   114 行目の `compileInjectable` は、39〜56 行目で `ɵprov` を getter として定義するだけで、コンパイラはまだ呼びません。DEMO 1 の最後の行で、JIT（Node の記録）の `Object.getOwnPropertyDescriptor(CrditRootSvc, 'ɵprov')` は `get = function`、AOT のこのページでは `value = object`（静的なフィールド）でした。
2. **初めて読まれたとき**

   42〜52 行目：`getCompilerFacade` で `@angular/compiler` を取り、`getInjectableMetadata(type, meta)` を渡して `compileInjectable` し、結果を閉じ込めた変数に覚えます。2 回目からはその値を返します。
3. **ɵfac も同じ**

   60〜81 行目：`reflectDependencies(type)`（jit/util.ts L22〜24）で constructor の引数を読み、`compileFactory` に `FactoryTarget.Injectable` で渡します。79〜80 行目の `configurable: true` は、同じクラスにあとで `@Component` などが付いたとき、そちらの `ɵfac` で上書きできるようにするためです。

📄 `angular/packages/core/src/di/jit/injectable.ts` L85–107 （▶ の行: 87–90, 92–93, 96–97, 101, 105）

```ts
 85 │ type UseClassProvider = Injectable & ClassSansProvider & {deps?: any[]};
 86 │ 
 87 ▶ const USE_VALUE = getClosureSafeProperty<ValueProvider>({
 88 ▶   provide: String,
 89 ▶   useValue: getClosureSafeProperty,
 90 ▶ });
 91 │ 
 92 ▶ function isUseClassProvider(meta: Injectable): meta is UseClassProvider {
 93 ▶   return (meta as UseClassProvider).useClass !== undefined;
 94 │ }
 95 │ 
 96 ▶ function isUseValueProvider(meta: Injectable): meta is Injectable & ValueSansProvider {
 97 ▶   return USE_VALUE in meta;
 98 │ }
 99 │ 
100 │ function isUseFactoryProvider(meta: Injectable): meta is Injectable & FactorySansProvider {
101 ▶   return (meta as FactorySansProvider).useFactory !== undefined;
102 │ }
103 │ 
104 │ function isUseExistingProvider(meta: Injectable): meta is Injectable & ExistingSansProvider {
105 ▶   return (meta as ExistingSansProvider).useExisting !== undefined;
106 │ }
107 │ 
```

📄 `angular/packages/core/src/di/jit/injectable.ts` L117–131 （▶ の行: 117–119, 121, 123, 125）

```ts
117 ▶   if ((isUseClassProvider(meta) || isUseFactoryProvider(meta)) && meta.deps !== undefined) {
118 ▶     compilerMeta.deps = convertDependencies(meta.deps);
119 ▶   }
120 │   // Check to see if the user explicitly provided a `useXxxx` property.
121 ▶   if (isUseClassProvider(meta)) {
122 │     compilerMeta.useClass = meta.useClass;
123 ▶   } else if (isUseValueProvider(meta)) {
124 │     compilerMeta.useValue = meta.useValue;
125 ▶   } else if (isUseFactoryProvider(meta)) {
126 │     compilerMeta.useFactory = meta.useFactory;
127 │   } else if (isUseExistingProvider(meta)) {
128 │     compilerMeta.useExisting = meta.useExisting;
129 │   }
130 │   return compilerMeta;
131 │ }
```

`useValue` だけは `!== undefined` ではなく `USE_VALUE in meta`（97 行目）で見ます。`useValue: undefined` を書いた場合も「値を使う」に入れるためで、`USE_VALUE` は 87〜90 行目の `getClosureSafeProperty` で、Closure Compiler が名前を縮めても `'useValue'` の文字列を正しく得るための仕掛けです。117〜119 行目の `deps` は `useClass` か `useFactory` のときだけ読み、`convertDependencies` が各要素を `R3DependencyMetadataFacade` に直します（次の jit/util.ts）。

📄 `angular/packages/core/src/di/jit/util.ts` L16–39 （▶ の行: 18–19, 22–23, 26–27, 31, 33, 37）

```ts
16 │ let _reflect: ReflectionCapabilities | null = null;
17 │ 
18 ▶ export function getReflect(): ReflectionCapabilities {
19 ▶   return (_reflect = _reflect || new ReflectionCapabilities());
20 │ }
21 │ 
22 ▶ export function reflectDependencies(type: Type<any>): R3DependencyMetadataFacade[] {
23 ▶   return convertDependencies(getReflect().parameters(type));
24 │ }
25 │ 
26 ▶ export function convertDependencies(deps: any[]): R3DependencyMetadataFacade[] {
27 ▶   return deps.map((dep) => reflectDependency(dep));
28 │ }
29 │ 
30 │ function reflectDependency(dep: any | any[]): R3DependencyMetadataFacade {
31 ▶   const meta: R3DependencyMetadataFacade = {
32 │     token: null,
33 ▶     attribute: null,
34 │     host: false,
35 │     optional: false,
36 │     self: false,
37 ▶     skipSelf: false,
38 │   };
39 │ 
```

📄 `angular/packages/core/src/di/jit/environment.ts` L9–25 （▶ の行: 16, 18–19, 21）

```ts
 9 │ import {ɵɵinject, ɵɵinvalidFactoryDep} from '../injector_compatibility';
10 │ import {ɵɵdefineInjectable, ɵɵdefineInjector} from '../interface/defs';
11 │ import {ɵɵdefineService} from '../interface/service';
12 │ 
13 │ /**
14 │  * A mapping of the @angular/core API surface used in generated expressions to the actual symbols.
15 │  *
16 ▶  * This should be kept up to date with the public exports of @angular/core.
17 │  */
18 ▶ export const angularCoreDiEnv: {[name: string]: Function} = {
19 ▶   'ɵɵdefineInjectable': ɵɵdefineInjectable,
20 │   'ɵɵdefineInjector': ɵɵdefineInjector,
21 ▶   'ɵɵdefineService': ɵɵdefineService,
22 │   'ɵɵinject': ɵɵinject,
23 │   'ɵɵinvalidFactoryDep': ɵɵinvalidFactoryDep,
24 │   'resolveForwardRef': resolveForwardRef,
25 │ };
```

`reflectDependency` の残り（L40〜77、`@Optional` や `@Inject` を見分ける所）は[ɵfac の生成の章](../di/04-di-factory.md)が引いています。`angularCoreDiEnv` は、JIT のコンパイラが作る式の中の `ɵɵdefineInjectable` などの名前を、本物の関数に結ぶ表です。16 行目「公開の export と合わせておく」とあるとおり、ここに無い関数を JIT の出力は呼べません（`@Service` のために 21 行目の `ɵɵdefineService` が足されています）。

## 4. InjectionToken：factory と providedIn

📄 `angular/packages/core/src/di/injection_token.ts` L14–34 （▶ の行: 17–19, 26–29, 33）

```ts
14 │ /**
15 │  * Creates a token that can be used in a DI Provider.
16 │  *
17 ▶  * Use an `InjectionToken` whenever the type you are injecting is not reified (does not have a
18 ▶  * runtime representation) such as when injecting an interface, callable type, array or
19 ▶  * parameterized type.
20 │  *
21 │  * `InjectionToken` is parameterized on `T` which is the type of object which will be returned by
22 │  * the `Injector`. This provides an additional level of type safety.
23 │  *
24 │  * <div class="docs-alert docs-alert-helpful">
25 │  *
26 ▶  * **Important Note**: Ensure that you use the same instance of the `InjectionToken` in both the
27 ▶  * provider and the injection call. Creating a new instance of `InjectionToken` in different places,
28 ▶  * even with the same description, will be treated as different tokens by Angular's DI system,
29 ▶  * leading to a `NullInjectorError`.
30 │  *
31 │  * </div>
32 │  *
33 ▶  * {@example injection-token/src/main.ts region='InjectionToken'}
34 │  *
```

📄 `angular/packages/core/src/di/injection_token.ts` L35–64 （▶ の行: 36–38, 42–43, 45, 54, 58）

```ts
35 │  * When creating an `InjectionToken`, you can optionally specify a factory function which returns
36 ▶  * (possibly by creating) a default value of the parameterized type `T`. This sets up the
37 ▶  * `InjectionToken` using this factory as a provider as if it was defined explicitly in the
38 ▶  * application's root injector. If the factory function, which takes zero arguments, needs to inject
39 │  * dependencies, it can do so using the [`inject`](api/core/inject) function.
40 │  * As you can see in the Tree-shakable InjectionToken example below.
41 │  *
42 ▶  * Additionally, if a `factory` is specified you can also specify the `providedIn` option, which
43 ▶  * overrides the above behavior and marks the token as belonging to a particular `@NgModule` (note:
44 │  * this option is now deprecated). As mentioned above, `'root'` is the default value for
45 ▶  * `providedIn`.
46 │  *
47 │  * The `providedIn: NgModule` and `providedIn: 'any'` options are deprecated.
48 │  *
49 │  * @usageNotes
50 │  * ### Basic Examples
51 │  *
52 │  * ### Plain InjectionToken
53 │  *
54 ▶  * {@example core/di/ts/injector_spec.ts region='InjectionToken'}
55 │  *
56 │  * ### Tree-shakable InjectionToken
57 │  *
58 ▶  * {@example core/di/ts/injector_spec.ts region='ShakableInjectionToken'}
59 │  *
60 │  *
61 │  * @see [What is an InjectionToken?](guide/di/defining-dependency-providers#what-is-an-injectiontoken)
62 │  *
63 │  * @publicApi
64 │  */
```

📄 `angular/packages/core/src/di/injection_token.ts` L70–95 （▶ の行: 72, 77–78, 84–85, 91–92）

```ts
70 │ 
71 │   /**
72 ▶    * @deprecated The `providedIn: NgModule` or `providedIn:'any'` options are deprecated. Please use the other signature.
73 │    */
74 │   constructor(
75 │     _desc: string,
76 │     options: {
77 ▶       providedIn: Type<any> | 'any';
78 ▶       factory: () => T;
79 │     },
80 │   );
81 │ 
82 │   /**
83 │    * @param _desc   Description for the token,
84 ▶    *                used only for debugging purposes,
85 ▶    *                it should but does not need to be unique
86 │    * @param options Options for the token's usage, as described above
87 │    */
88 │   constructor(
89 │     _desc: string,
90 │     options?: {
91 ▶       providedIn?: Type<any> | 'root' | 'platform' | 'any' | null;
92 ▶       factory: () => T;
93 │     },
94 │   );
95 │ 
```

📄 `angular/packages/core/src/di/injection_token.ts` L126–133 （▶ の行: 127, 131–132）

```ts
126 │   toString(): string {
127 ▶     return `InjectionToken ${this._desc}`;
128 │   }
129 │ }
130 │ 
131 ▶ export interface InjectableDefToken<T> extends InjectionToken<T> {
132 ▶   ɵprov: unknown;
133 │ }
```

コンストラクターの本体（96〜117 行目）は[InjectionToken の章](../di/06-di-injection-token.md)が引いていて、`options` があれば `ɵɵdefineInjectable({token: this, providedIn: options.providedIn || 'root', factory: options.factory})`（L111〜115）を `ɵprov` に入れます。DEMO 1 の「InjectionToken」で確かめたことは次のとおりです。

- 54 行目の Plain の例（`Injector.create` に `useValue`）は `'http://localhost'`、26〜29 行目のとおり同じ説明 `'BaseUrl'` で作った 2 つ目のトークンでは ``NG0201: No provider found for `InjectionToken BaseUrl`.`` でした。エラーの文はどちらのトークンでも同じ `InjectionToken BaseUrl`（127 行目の `toString`）なので、文だけでは見分けられません。
- 36〜38 行目「root の injector に provider を書いたのと同じ」は、そのとおり factory の `inject` も root から探します。`CrditDep` を root の子にだけ provide して子から get すると、``NG0201: No provider found for `CrditDep`. Path: InjectionToken Manually constructed MyService -> CrditDep.`` でした。root の役の injector 自身に `CrditDep` を provide すると作れます。58 行目が指す例（injector\_spec.ts L73〜86）は、この root の印を、テストの中だけの `MockRootScopeInjector` で用意しています。
- そのあと同じ root からもう一度 get すると、今度は ``NG0200: Circular dependency detected for `InjectionToken Manually constructed MyService`.`` でした。1 回目に factory が例外を投げたとき、R3Injector の `hydrate` が記録の値を `CIRCULAR` の印にしたまま戻さないからです（r3\_injector.ts L527〜540。`NOT_YET` → `CIRCULAR` にしてから factory を呼び、例外のときに戻す処理が無い）。2 回目のエラーは本当の理由（`CrditDep` が無い）を言いません。
- 91 行目の型は `providedIn: null` を許し、L113 の `||` で `'root'` になります。DEMO の `ɵprov.providedIn` も `"root"` で、root から値が取れました。`@Injectable({providedIn: null})` は「どこにも入らない」（2 節）ので、同じ `null` が逆の意味になります。説明文の 42〜45 行目は「`'root'` が既定」とだけ書きます。
- `'platform'` と `'any'` のトークンは 2 節の `@Injectable` と同じ結果でした（`'any'` は `Injector.create` からでも作れる）。`options` の無いトークンは `ɵprov = undefined` で、どこかの providers に書かないと取れません。

## 5. forwardRef と resolveForwardRef

📄 `angular/packages/core/src/di/forward_ref.ts` L13–27 （▶ の行: 19, 26）

```ts
13 │ /**
14 │  * An interface that a function passed into `forwardRef` has to implement.
15 │  *
16 │  * @usageNotes
17 │  * ### Example
18 │  *
19 ▶  * {@example core/di/ts/forward_ref/forward_ref_spec.ts region='forward_ref_fn'}
20 │  * @publicApi
21 │  */
22 │ export interface ForwardRefFn {
23 │   (): any;
24 │ }
25 │ 
26 ▶ const __forward_ref__ = getClosureSafeProperty({__forward_ref__: getClosureSafeProperty});
27 │ 
```

📄 `angular/packages/core/src/di/forward_ref.ts` L28–40 （▶ の行: 31, 33, 39）

```ts
28 │ /**
29 │  * Allows to refer to references which are not yet defined.
30 │  *
31 ▶  * For instance, `forwardRef` is used when the `token` which we need to refer to for the purposes of
32 │  * DI is declared, but not yet defined. It is also used when the `token` which we use when creating
33 ▶  * a query is not yet defined.
34 │  *
35 │  * `forwardRef` is also used to break circularities in standalone components imports.
36 │  *
37 │  * @usageNotes
38 │  * ### Circular dependency example
39 ▶  * {@example core/di/ts/forward_ref/forward_ref_spec.ts region='forward_ref'}
40 │  *
```

📄 `angular/packages/core/src/di/forward_ref.ts` L79–92 （▶ の行: 81, 83, 88）

```ts
79 │ 
80 │ /**
81 ▶  * Lazily retrieves the reference value from a forwardRef.
82 │  *
83 ▶  * Acts as the identity function when given a non-forward-ref value.
84 │  *
85 │  * @usageNotes
86 │  * ### Example
87 │  *
88 ▶  * {@example core/di/ts/forward_ref/forward_ref_spec.ts region='resolve_forward_ref'}
89 │  *
90 │  * @see {@link forwardRef}
91 │  * @publicApi
92 │  */
```

`forwardRef` の本体（L69〜78、[forwardRef の章](../standalone/05-standalone-forward-ref.md)が引いている）は、渡された関数に `__forward_ref__` の印を付けて、その関数をそのまま返します。26 行目の `getClosureSafeProperty` は 3 節の `USE_VALUE` と同じ仕掛けです。`resolveForwardRef`（L93〜95）は印のある関数だけを呼びます。88 行目が指す例を下の記録で確かめると、`resolveForwardRef(forwardRef(() => 'refValue'))` は `"refValue"`、印の無いただの関数は呼ばずに同じ関数のまま返りました（83 行目「forward-ref でない値には恒等関数」のとおり）。`forwardRef(fn)` は `fn` そのものです。`String(forwardRef(() => Lock))` は、開発モードでは `Lock`、本番では関数のソース `() => Lock` です。L71〜75 で `toString` を差し替えるのは `ngDevMode` のときだけだからです（DEMO 1 の「forwardRef」の最後の行は、このページ（本番）の結果）。

| 式 | 開発モード | 本番 |
| --- | --- | --- |
| `resolveForwardRef(forwardRef(() => 'refValue'))` | `"refValue"` | `"refValue"` |
| `resolveForwardRef('regularValue')` | `"regularValue"` | `"regularValue"` |
| `resolveForwardRef(() => 'plain')（forwardRef で包まない関数）` | `typeof = function・同じ関数 = true` | `typeof = function・同じ関数 = true` |
| `forwardRef(fn) === fn` | `true` | `true` |
| `String(forwardRef(() => Lock))` | `Lock` | `() => Lock` |

> [!WARNING]
> **ハマりどころ**
>
> 39 行目が指す例（packages/examples/core/di/ts/forward\_ref/forward\_ref\_spec.ts L23〜47）は、`Door` の constructor に `@Inject(forwardRef(() => Lock))` を書き、「forwardRef がこれを可能にする」とコメントしています。ところが `Door` を作るのは `Injector.create` の `{provide: Door, deps: [Lock]}` で、`deps` を書いた provider は `ɵfac` を使わないので、`@Inject(forwardRef(…))` は読まれません（DEMO の最初の行。`deps` を書いた時点で `Lock` はもう定義されている）。`forwardRef` が働くのは、`Door` を `createEnvironmentInjector([Door, Lock])` のように型のまま provide して、`ɵfac` が `ɵɵinject(forwardRef(() => Lock))` を呼んだときです（DEMO の 2 つ目の行）。

📄 `angular/packages/core/src/di/forward_ref.ts` L41–68 （▶ の行: 41, 44, 46, 49, 54, 57–58, 63, 65）

````ts
41 ▶  * ### Circular standalone reference import example
42 │  * ```angular-ts
43 │  * @Component({
44 ▶  *   imports: [ChildComponent],
45 │  *   selector: 'app-parent',
46 ▶  *   template: `<app-child [hideParent]="hideParent()"/>`,
47 │  * })
48 │  * export class ParentComponent {
49 ▶  *    hideParent = input.required<boolean>();
50 │  * }
51 │  *
52 │  *
53 │  * @Component({
54 ▶  *   imports: [forwardRef(() => ParentComponent)],
55 │  *   selector: 'app-child',
56 │  *   template: `
57 ▶  *    @if(!hideParent()) {
58 ▶  *       <app-parent/>
59 │  *    }
60 │  *  `,
61 │  * })
62 │  * export class ChildComponent {
63 ▶  *    hideParent = input.required<boolean>();
64 │  * }
65 ▶  * ```
66 │  * @see [Resolve circular dependencies with a forward reference](guide/di/di-in-action#resolve-circular-dependencies-with-a-forward-reference)
67 │  * @publicApi
68 │  */
````

41〜65 行目の standalone の例は、そのままでは TypeScript で止まります。44 行目の `imports: [ChildComponent]` は、まだ定義していない `ChildComponent` をデコレーターの引数で読むので `TS2449: Class 'ChildComponent' used before its declaration.` です。`forwardRef` が要るのは先に書いた `ParentComponent` の側で、例は 54 行目の後に書いた側に付けています。2 つのクラスの順を入れ替えると、今度は 58 行目の `<app-parent/>` が 49 行目の `input.required` を渡さないので `NG8008: Required input 'hideParent' from component ParentComponent must be specified.` です。この例は 24d803b0a2e（2023-05-19、#50366）で入り、そのときから `forwardRef` は後ろの側でした。bff2dcb93ce（2025-12-09）が `@Input` を `input.required` に書き換えたときに、2 つ目のエラーが加わりました。

## 6. @Service（v22）

📄 `angular/packages/core/src/di/service.ts` L13–28 （▶ の行: 20, 27）

```ts
13 │ /**
14 │  * Type of the Service decorator / constructor function.
15 │  *
16 │  * @publicApi
17 │  */
18 │ export interface ServiceDecorator {
19 │   /**
20 ▶    * Decorator that marks a class as a service and makes it automatically available
21 │    * in the dependency injection system.
22 │    *
23 │    * @see [Introduction to Services and DI](guide/di)
24 │    * @see [Creating and using services](guide/di/creating-and-using-services)
25 │    * @see [Defining dependency providers](guide/di/defining-dependency-providers)
26 │    */
27 ▶   (): TypeDecorator;
28 │ 
```

📄 `angular/packages/core/src/di/service.ts` L51–82 （▶ の行: 60–62, 65, 67, 76, 81）

```ts
51 │ 
52 │ /**
53 │  * Type of the Service metadata.
54 │  *
55 │  * @publicApi
56 │  */
57 │ export interface Service {
58 │   /**
59 │    * Determines whether the service should be provided automatically or by the user.
60 ▶    * Defaults to `true`.
61 ▶    */
62 ▶   autoProvided?: boolean;
63 │ 
64 │   /**
65 ▶    * A function to invoke to create a value for this service.
66 │    */
67 ▶   factory?: () => unknown;
68 │ }
69 │ 
70 │ /**
71 │  * Service decorator and metadata.
72 │  *
73 │  * @Annotation
74 │  * @publicApi
75 │  */
76 ▶ export const Service: ServiceDecorator = makeDecorator(
77 │   'Service',
78 │   undefined,
79 │   undefined,
80 │   undefined,
81 ▶   (type: Type<unknown>, meta: Service | undefined) => compileService(type, meta),
82 │ );
```

📄 `angular/packages/core/src/di/interface/service.ts` L12–31 （▶ の行: 17–20, 22–23）

```ts
12 │ /**
13 │  * Construct a definition which defines how a service will be constructed by the DI system.
14 │  *
15 │  * This should be assigned to a static `ɵprov` field on a type.
16 │  *
17 ▶  * Options:
18 ▶  * * `autoProvided` determines whether the service should be provided automatically or whether
19 ▶  *   the user should be responsible for providing it.
20 ▶  * * `factory` gives the zero argument function which will create an instance of the injectable.
21 │  *
22 ▶  * @codeGenApi
23 ▶  * @publicApi
24 │  */
25 │ export function ɵɵdefineService<T>(opts: {
26 │   token: unknown;
27 │   autoProvided?: boolean;
28 │   factory: (parent?: Type<unknown>) => T;
29 │ }): ɵɵInjectableDeclaration<T> {
30 │   return {
31 │     token: opts.token,
```

`@Service` は 8f3d0b9d974（2026-04-14、`feat(core): introduce @Service decorator`）で入った新しいデコレーターで、`ɵɵdefineService` は `autoProvided === false` なら `providedIn: null`、それ以外は `'root'` の `ɵprov` を作ります（interface/service.ts L32）。選択肢の型（service.ts L29〜49）は[provideRouter の章](../router/05-router-provide-router.md)が引いていて、AOT の `ɵprov` の形は[@Service のコンパイルの章](../di/05-di-injectable-compile.md)の 5 節です。DEMO 1 の「@Service」では、`@Service()` が root で 1 つ作られ（`ɵprov.providedIn = "root"`）、`autoProvided: false` は root からは `NG0201` で providers に入れると作られ、`factory` は返した値そのものが返りました（`instanceof` はクラスと関係なく `false`）。

📄 `angular/packages/core/src/di/jit/service.ts` L21–48 （▶ の行: 23, 25, 30–31）

```ts
21 │ /**
22 │  * Compile an Angular service according to its `Service` metadata, and patch the resulting
23 ▶  * defition (`ɵprov`) onto the type.
24 │  */
25 ▶ export function compileService(type: Type<any>, meta?: Service): void {
26 │   let def: any = null;
27 │   let factoryDef: any = null;
28 │ 
29 │   // if NG_PROV_DEF is already defined on this class then don't overwrite it
30 ▶   if (!Object.hasOwn(type, NG_PROV_DEF)) {
31 ▶     Object.defineProperty(type, NG_PROV_DEF, {
32 │       get: () => {
33 │         if (def === null) {
34 │           const compiler = getCompilerFacade({
35 │             usage: JitCompilerUsage.Decorator,
36 │             kind: 'service',
37 │             type,
38 │           });
39 │           def = compiler.compileService(
40 │             angularCoreDiEnv,
41 │             `ng:///${type.name}/ɵprov.js`,
42 │             getServiceMetadata(type, meta),
43 │           );
44 │         }
45 │         return def;
46 │       },
47 │     });
48 │   }
```

📄 `angular/packages/core/src/di/jit/service.ts` L49–72 （▶ の行: 59, 63–64）

```ts
49 │ 
50 │   if (!Object.hasOwn(type, NG_FACTORY_DEF)) {
51 │     Object.defineProperty(type, NG_FACTORY_DEF, {
52 │       get: () => {
53 │         if (factoryDef === null) {
54 │           const compiler = getCompilerFacade({
55 │             usage: JitCompilerUsage.Decorator,
56 │             kind: 'service',
57 │             type,
58 │           });
59 ▶           factoryDef = compiler.compileFactory(angularCoreDiEnv, `ng:///${type.name}/ɵfac.js`, {
60 │             name: type.name,
61 │             type,
62 │             typeArgumentCount: 0,
63 ▶             deps: reflectDependencies(type),
64 ▶             target: compiler.FactoryTarget.Service,
65 │           });
66 │         }
67 │         return factoryDef;
68 │       },
69 │       configurable: true,
70 │     });
71 │   }
72 │ }
```

📄 `angular/packages/core/src/di/jit/service.ts` L74–84 （▶ の行: 79–80）

```ts
74 │ function getServiceMetadata(type: Type<any>, srcMeta?: Service): R3ServiceMetadataFacade {
75 │   const compilerMeta: R3ServiceMetadataFacade = {
76 │     name: type.name,
77 │     type: type,
78 │     typeArgumentCount: 0,
79 ▶     autoProvided: srcMeta?.autoProvided,
80 ▶     factory: srcMeta?.factory,
81 │   };
82 │ 
83 │   return compilerMeta;
84 │ }
```

JIT の `compileService` は 3 節の `compileInjectable` と同じ形の getter で、違いは 64 行目の `FactoryTarget.Service` と、79〜80 行目で `autoProvided` と `factory` だけを渡すことです（`useClass` などは無い）。23 行目のコメントの「defition」は definition の誤りです。

> **🧪 DEMO 1 — providedIn・InjectionToken・forwardRef・@Service を本物の injector で（AOT のこのページと、JIT の記録）**
>
> 押すと、本物の `@angular/core`（22.2.6）の `Injector.create` と `createEnvironmentInjector` で injector を作って get し、すぐ destroy します。`'platform'`・`'root'` の役は `ɵINJECTOR_SCOPE` を provide した自分の injector がします（このページの root には何も残さない）。「JIT（記録）」の列は同じ関数を Node（domino の上の JIT、開発モード）で走らせた手元の記録で、例外の文は開発モードの長い文です。#の後ろの番号は、その表の中で作った順です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-injectable-token)

## 説明文の例を ngc にかける

📄 `例を strict + strictTemplates の ngc にかけた結果（2026-11-21、手元の記録）`

```
# 説明文の例を、strict の tsc と strictTemplates の ngc（@angular/compiler-cli 22.2.6）にかける
forwardref-standalone.ts（forward_ref.ts L43-64 そのまま）
  TS2449: Class 'ChildComponent' used before its declaration.     # L44 の imports: [ChildComponent]
forwardref-swapped.ts（2 つのクラスの順だけ入れ替え）
  NG8008: Required input 'hideParent' from component ParentComponent must be specified.   # L58 の <app-parent/>
token-null.ts（new InjectionToken(…, {providedIn: null, factory}) と 'any'）   エラー 0
```

## ここまでの呼び出し

- 👤 `new InjectionToken('t', {providedIn: null, factory})`
  - `ɵɵdefineInjectable({token, providedIn: options.providedIn || 'root', factory})` — injection\_token.ts L111〜115 — *null が 'root' に*
- 👤 `child.get(token)`
  - `R3Injector.get` → `injectableDefInScope(def)` — r3\_injector.ts L551〜561 — *'root' は scopes に 'root' がある injector だけ。'any' はどこでも*
    - `hydrate(token, record)` — r3\_injector.ts L524〜549 — *NOT\_YET → CIRCULAR → factory()*
      - `factory()` の中の `inject(CrditDep)` — root の injector の文脈 — *例外のとき CIRCULAR のまま*
- 👤 `@Injectable({providedIn: 'root'})`（JIT）
  - `compileInjectable(type, meta)` — jit/injectable.ts L34〜83 — *ɵprov と ɵfac の getter だけ置く*
    - `getCompilerFacade().compileInjectable(angularCoreDiEnv, …, getInjectableMetadata(type, meta))` — L42〜52、L108〜131 — *初めて読まれたとき*

## テストと直し方

| ファイル（packages/core/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `acceptance/di_spec.ts` | `Tree shakable injectors › should support tree shakable injectors scopes`（3059） | 2 節の 'any'・'root'・'platform'。'any' が子の injector で作られることも |
| `di/r3_injector_spec.ts` | `allows injecting a scoped service`（427）・`does not create instances of a service not in scope`（438）・`throws an error on circular deps`（497） | 2 節と 4 節。factory が例外を投げたあとの 2 回目の get の it は無い |
| `acceptance/service_spec.ts` | `@Service decorator` の 9 の it（13〜184） | 6 節 |
| `di/forward_ref_spec.ts`・`forward_ref_integration_spec.ts` | `forwardRef › should wrap and unwrap the reference`（13）・`should instantiate components which are declared using forwardRef`（37） | 5 節 |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
^@Service decorator                     Ran 9 of 2693 specs、0 failures
Tree shakable injectors                 Ran 2 of 2693 specs、0 failures
$ pnpm bazel test //packages/core/test:test ... "--test_arg=--filter=<下の名前>"     # 4 つに割った 1 つで走る
allows injecting a scoped service                               Ran 1 of 1401 specs、0 failures
does not create instances of a service not in scope             Ran 1 of 1401 specs、0 failures
throws an error on circular deps                                Ran 1 of 1401 specs、0 failures
should wrap and unwrap the reference                            Ran 1 of 1401 specs、0 failures
should instantiate components which are declared using forwardRef  Ran 1 of 1401 specs、0 failures
```

直すとしたら、説明文は forward\_ref.ts の L41〜65（`forwardRef` を `ParentComponent` の imports に移し、`<app-parent [hideParent]="true"/>` のように required の入力を渡す）、packages/examples の forward\_ref\_spec.ts と metadata\_spec.ts の例（provider の `deps` を外して型のまま provide すれば、説明している `@Inject(forwardRef)` と `@Injectable` の `ɵfac` が使われる）、injection\_token.ts の L42〜45 に「`providedIn: null` も `'root'`」を足す、です。jit/service.ts の L23 の綴りも。コードの側では、R3Injector の `hydrate`（r3\_injector.ts L524〜549）で factory が例外を投げたら `record.value` を `NOT_YET` に戻すと、2 回目も本当の理由のエラーになります。di/r3\_injector\_spec.ts に「factory が投げたあとにもう一度 get すると同じエラー」の it を足すのが入口です。

## 聞かれそうな質問

**Q. `Injector.create` で作った injector から `providedIn: 'root'` のサービスを取れますか？**

取れません。`Injector.create` の injector は `INJECTOR_SCOPE` を持たないので `'root'` の範囲にならず、親（既定は `NullInjector`）にも無いので `NG0201` です。アプリの injector を親に渡せば、そこで解決されます。

**Q. `providedIn: 'any'` は「遅延モジュールごとに 1 つ」ですか？**

実際は「最初に聞かれた injector ごとに 1 つ」です。`createEnvironmentInjector` や `Injector.create` の子でも別の実例ができます。遅延モジュールは別の injector なので、説明文の言い方はその一部です。

**Q. `new InjectionToken('x', {providedIn: null, factory})` はどこにも入りませんか？**

入ります。`providedIn: options.providedIn || 'root'`（L113）なので `'root'` です。`@Injectable({providedIn: null})` とは逆の結果です。

**Q. `InjectionToken` の factory の中の `inject()` は、どの injector から探しますか？**

トークンが作られた injector（`'root'` なら root）からです。子で provide したものは見えません（injection\_token.ts L36〜38 のとおり）。そして 1 回目に例外になると、2 回目は `NG0200` の循環のエラーに変わります。

**Q. `forwardRef` はどちらのクラスに書けばよいですか？**

まだ定義されていないクラスを指す側、つまりファイルの中で先に書いたクラスのデコレーターや引数です。forward\_ref.ts の standalone の例は後に書いた側に付けていて、TypeScript で `TS2449` になります。

## 読み終えて

- `'root'` と `'platform'` は `INJECTOR_SCOPE` の印を持つ injector で作られ、`'any'` は聞かれた injector ごとに作られる。`Injector.create` は印を持たない。
- JIT の `@Injectable` と `@Service` は getter を置くだけで、初めて読まれたときにコンパイルする。
- `InjectionToken` の `providedIn: null` は `'root'`。factory の `inject` は root から探し、失敗のあとは循環のエラーに化ける。
- forwardRef の 2 つの例は、1 つは逆側に付いていてコンパイルできず、もう 1 つは `deps` のせいで forwardRef を使っていない。

---

← 前: [クエリのデコレーターと @NgModule の説明文](03-crd-query-module.md)  
次: [Provider の形の説明文：useClass・useValue・useFactory・useExisting・multi](05-crd-provider.md) →
