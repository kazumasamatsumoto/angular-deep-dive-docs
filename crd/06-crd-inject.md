[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 6 回 / 全 10 回

# inject と Injector の説明文：フラグ・注入の文脈・Injector.create

> di/injector\_compatibility.ts・metadata.ts・metadata\_attr.ts・injector.ts・r3\_injector.ts の未読の行：inject の options（optional・self・skipSelf・host）、注入の文脈の外で呼んだとき、@Optional ほかのデコレーター、Injector.create と destroy。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-inject)

---

この章で分かること：`inject`・`@Inject`・`@Optional`・`@Self`・`@SkipSelf`・`@Host`・`Injector` の説明文（angular.dev の API リファレンスになる JSDoc）が約束していることと、それが本物でそのとおりに動くかどうか。結果として、`inject` の「見つからなければ `null`」、`@Self` の「階層を上へたどる」、`@SkipSelf` の例が `SkipSelf` を使っていないこと、`Injector.get` の「`notFoundValue` が `undefined` なら例外」の 4 つが実物と合いませんでした。

読む対象は `packages/core/src/di/` の `injector_compatibility.ts`・`metadata.ts`・`injector.ts`・`r3_injector.ts`・`injector_token.ts` の説明文と、説明文の `{@example}` が指す `packages/examples/core/di/ts/metadata_spec.ts`（../angular、8576f161ae4）です。実装の行は既存の章が読んでいます。`ɵɵinject` と 2 つのスイッチは[inject() の実装の章](../di/02-di-inject-function.md)、注入の文脈と NG0203 は[注入コンテキストの章](../di/03-di-injection-context.md)、4 つのビットが探索のどこで効くかは[self・skipSelf・host・optional の章](../di/12-di-resolution-flags.md)、`R3Injector.get` は[R3Injector.get の章](../di/08-di-r3-injector-get.md)、`destroy` は[DestroyRef と破棄の章](../di/14-di-destroy.md)にあるので、ここでは繰り返さずに行だけ指します。

1. [1. @Directive](01-crd-directive.md)
2. [2. @Component](02-crd-component.md)
3. [3. クエリと @NgModule](03-crd-query-module.md)
4. [4. @Injectable・InjectionToken](04-crd-injectable-token.md)
5. [5. Provider の形](05-crd-provider.md)
6. **6. inject と Injector**（この章）
7. [7. ライフサイクル](07-crd-lifecycle.md)
8. [8. differ](08-crd-differs.md)
9. [9. スケジューラー](09-crd-scheduling.md)
10. [10. spec と issue](10-crd-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 「注入器（injector）」は、token（クラスや `InjectionToken`）を渡すと値を返す入れ物です。親を持ち、自分に無ければ親に聞きます。要素ごとの注入器（NodeInjector）と、アプリやルートの注入器（環境の注入器、`R3Injector`）の 2 種類があり、この章のデモは主に後者を `Injector.create` で作って試します。

## 1. inject の 7 つの形と、戻り値の約束

📄 `angular/packages/core/src/di/injector_compatibility.ts` L170–201 （▶ の行: 172–173, 177, 183–184, 188, 194–197, 201）

```ts
170 │ /**
171 │  * @param token A token that represents a dependency that should be injected.
172 ▶  * @returns the injected value if operation is successful, `null` otherwise.
173 ▶  * @throws if called outside of a supported context.
174 │  *
175 │  * @publicApi
176 │  */
177 ▶ export function inject<T>(token: ProviderToken<T>): T;
178 │ /**
179 │  * @param token A token that represents a dependency that should be injected.
180 │  * @param options Control how injection is executed. Options correspond to injection strategies
181 │  *     that can be specified with parameter decorators `@Host`, `@Self`, `@SkipSelf`, and
182 │  *     `@Optional`.
183 ▶  * @returns the injected value if operation is successful.
184 ▶  * @throws if called outside of a supported context, or if the token is not found.
185 │  *
186 │  * @publicApi
187 │  */
188 ▶ export function inject<T>(token: ProviderToken<T>, options: InjectOptions & {optional?: false}): T;
189 │ /**
190 │  * @param token A token that represents a dependency that should be injected.
191 │  * @param options Control how injection is executed. Options correspond to injection strategies
192 │  *     that can be specified with parameter decorators `@Host`, `@Self`, `@SkipSelf`, and
193 │  *     `@Optional`.
194 ▶  * @returns the injected value if operation is successful,  `null` if the token is not
195 ▶  *     found and optional injection has been requested.
196 ▶  * @throws if called outside of a supported context, or if the token is not found and optional
197 ▶  *     injection was not requested.
198 │  *
199 │  * @publicApi
200 │  */
201 ▶ export function inject<T>(token: ProviderToken<T>, options: InjectOptions): T | null;
```

`inject` は型の上では 7 つの形（overload）を持ちます。ここに引いた 3 つが `ProviderToken` 用、続く 3 つ（L202〜225）が `HostAttributeToken` 用（[InjectionToken と特殊トークンの章](../di/06-di-injection-token.md)）、最後が実装です。188 行目の形（`optional` が無いか `false`）は 183〜184 行目「成功すれば値、見つからなければ例外」、201 行目の形は 194〜197 行目「optional なら `null`、そうでなければ例外」と書き、どちらも実物のとおりでした（DEMO の 1 つ目の表）。

合わないのは、options を渡さない 177 行目の形です。172 行目は「成功すれば値、そうでなければ `null`」と書き、173 行目の `@throws` は「文脈の外で呼んだとき」しか挙げていません。実際は、文脈の中でも token が見つからなければ NG0201 の例外で、`null` は返りません。型も 177 行目は `T` で、`null` を含めていません。型の方が正しく、説明文の方が違っています。同じ文は実装の説明（下の 241 行目）にもあります。どちらも 7f65089de86（2022-05-27、``docs(core): improve `inject` function docs (#46168)``）で書かれた文で、そのころは 2 つ目の引数に `InjectFlags` を渡す形（戻り値 `T|null`）があり、Optional のビットを渡せば `null` が返りました。その形が 3 節の `InjectFlags` の削除で消えたあとも、文だけが残っています。新しい本家（origin/main の d201dd76ef2、2026-11-19。以下「新しい本家」はこの版）でも 2 か所とも変わっていません（L166・L235）。

## 2. どこで呼べるか：説明文の 5 つの場所と 3 つの例

📄 `angular/packages/core/src/di/injector_compatibility.ts` L226–261 （▶ の行: 227–228, 230–235, 238, 240–241, 245, 250, 252–253, 255–257, 259）

````ts
226 │ /**
227 ▶  * Injects a token from the currently active injector.
228 ▶  * `inject` is only supported in an [injection context](guide/di/dependency-injection-context). It
229 │  * can be used during:
230 ▶  * - Construction (via the `constructor`) of a class being instantiated by the DI system, such
231 ▶  * as an `@Injectable` or `@Component`.
232 ▶  * - In the initializer for fields of such classes.
233 ▶  * - In the factory function specified for `useFactory` of a `Provider` or an `@Injectable`.
234 ▶  * - In the `factory` function specified for an `InjectionToken`.
235 ▶  * - In a stackframe of a function call in a DI context
236 │  *
237 │  * @param token A token that represents a dependency that should be injected.
238 ▶  * @param flags Optional flags that control how injection is executed.
239 │  * The flags correspond to injection strategies that can be specified with
240 ▶  * parameter decorators `@Host`, `@Self`, `@SkipSelf`, and `@Optional`.
241 ▶  * @returns the injected value if operation is successful, `null` otherwise.
242 │  * @throws if called outside of a supported context.
243 │  *
244 │  * @usageNotes
245 ▶  * In practice the `inject()` calls are allowed in a constructor, a constructor parameter and a
246 │  * field initializer:
247 │  *
248 │  * ```ts
249 │  * @Injectable({providedIn: 'root'})
250 ▶  * export class Car {
251 │  *   radio: Radio|undefined;
252 ▶  *   // OK: field initializer
253 ▶  *   spareTyre = inject(Tyre);
254 │  *
255 ▶  *   constructor() {
256 ▶  *     // OK: constructor body
257 ▶  *     this.radio = inject(Radio);
258 │  *   }
259 ▶  * }
260 │  * ```
261 │  *
````

📄 `angular/packages/core/src/di/injector_compatibility.ts` L262–292 （▶ の行: 262, 266, 268–269, 274–276, 279, 281–283）

````ts
262 ▶  * It is also legal to call `inject` from a provider's factory:
263 │  *
264 │  * ```ts
265 │  * providers: [
266 ▶  *   {provide: Car, useFactory: () => {
267 │  *     // OK: a class factory
268 ▶  *     const engine = inject(Engine);
269 ▶  *     return new Car(engine);
270 │  *   }}
271 │  * ]
272 │  * ```
273 │  *
274 ▶  * Calls to the `inject()` function outside of the class creation context will result in error. Most
275 ▶  * notably, calls to `inject()` are disallowed after a class instance was created, in methods
276 ▶  * (including lifecycle hooks):
277 │  *
278 │  * ```ts
279 ▶  * @Component({ ... })
280 │  * export class CarComponent {
281 ▶  *   ngOnInit() {
282 ▶  *     // ERROR: too late, the component instance was already created
283 ▶  *     const engine = inject(Engine);
284 │  *     engine.start();
285 │  *   }
286 │  * }
287 │  * ```
288 │  *
289 │  * @see [Injecting dependencies with inject()](guide/di#injecting-dependencies-with-inject)
290 │  *
291 │  * @publicApi
292 │  */
````

230〜235 行目の 5 つの場所（constructor、フィールドの初期化子、`useFactory`、`InjectionToken` の `factory`、そこから呼ぶ関数）と、245 行目の「constructor の引数」は、DEMO の 2 つ目の表で 6 つとも `inject` できました。どれも、注入器が値を作る関数を呼んでいる間（`_currentInjector` が立っている間）の中にあるからです（[注入コンテキストの章](../di/03-di-injection-context.md)の 2 節）。「constructor の引数」は、`@Injectable` のクラスの引数のことではありません。引数はコンパイラーが `ɵfac` の中で型から注入するので（[ɵfac の生成の章](../di/04-di-factory.md)）、既定値の式は使われません。デモでは、デコレーターの無いクラスを `useFactory` の中で `new` し、既定値の `inject` が評価されるのを確かめました。

274〜276 行目「作り終えたあと、メソッド（ライフサイクルのフックも）で呼ぶと例外」は、`ngOnInit` の中でも、ボタンのクリックの処理から直接呼んでも NG0203 でした。開発モードの文は「The \`CrdInjEngine\` token injection failed. \`inject()\` function must be called from an injection context such as a constructor, a factory function, a field initializer, or a function used with \`runInInjectionContext\`.」、本番は `NG0203` だけです（文を `ngDevMode &&` で作る。実装は L98〜103、[inject() の実装の章](../di/02-di-inject-function.md)）。`runInInjectionContext` の中でも `await` の後は NG0203 でした（contextual.ts の説明文 L26〜27 の「同期のあいだだけ」のとおり）。

3 つの例を strict の ngc（サイトの `@angular/compiler-cli` 22.2.6、`strict`・`strictTemplates`）にかけると、エラーは 1 つでした。269 行目 `new Car(engine)` はTS2554「Expected 0 arguments, but got 1.」です。1 つ目の例（250〜259 行目）の `Car` は引数の無い constructor なので、2 つ目の例は別の `Car` を前提にしています。279 行目の `@Component({ ... })` は書けない形なので、`template: ''` に置き換えて通しました。

## 3. 古い InjectFlags の名残

238〜240 行目は、実装の 2 つ目の引数を `flags`（「挙動を決めるフラグ」）と書きます。実装（L293）の引数は `options?: InjectOptions` です。公開の `InjectFlags`（`InjectFlags.Optional` などのビットの enum）は 611baaf0695（2025-03-11、`feat(core): remove InjectFlags from public API (#60318)`、v20）で公開 API から消え、今は `{optional: true}` などのオブジェクトだけを受け付けます。内側では同じビットの `InternalInjectFlags` に直して使います（`convertToBitFlags`、[4 つのビットの章](../di/12-di-resolution-flags.md)の 1 節）。この `@param flags` は、新しい本家では 6e024600e0b（2026-10-08、`docs: fix @param names that don't match their parameters`）で `@param options` に直りました。API リファレンスは名前が一致する `@param` しか引数に付けないので、それまで angular.dev の `inject` の `options` は説明が空でした（そのコミットの説明）。

同じ名残が di/interface/injector.ts にもあります（ここでは引きません）。L19〜24 は `InternalInjectFlags` を「上の `InjectFlags` の写し」、L48 は「公開の `InjectFlags` に入れていない」と書きますが、上にも公開 API にも `InjectFlags` はもうありません。

## 4. @Inject と @Optional：deps に入れる形

📄 `angular/packages/core/src/di/metadata.ts` L14–46 （▶ の行: 21, 23, 25, 29–30, 36–37, 39）

```ts
14 │ /**
15 │  * Type of the Inject decorator / constructor function.
16 │  *
17 │  * @publicApi
18 │  */
19 │ export interface InjectDecorator {
20 │   /**
21 ▶    * Warning: String tokens are not recommended.
22 │    *
23 ▶    * Use an InjectionToken or a class as a token instead.
24 │    */
25 ▶   (token: string): any;
26 │   new (token: string): Inject;
27 │ 
28 │   /**
29 ▶    * Parameter decorator on a dependency parameter of a class constructor
30 ▶    * that specifies a custom provider of the dependency.
31 │    *
32 │    * @usageNotes
33 │    * The following example shows a class constructor that specifies a
34 │    * custom provider of a dependency using the parameter decorator.
35 │    *
36 ▶    * When `@Inject()` is not present, the injector uses the type annotation of the
37 ▶    * parameter as the provider.
38 │    *
39 ▶    * {@example core/di/ts/metadata_spec.ts region='InjectWithoutDecorator'}
40 │    *
41 │    * @see [Dependency Injection Guide](guide/di)
42 │    *
43 │    */
44 │   (token: any): any;
45 │   new (token: any): Inject;
46 │ }
```

📄 `angular/packages/core/src/di/metadata.ts` L73–97 （▶ の行: 80–82, 84–85, 91）

```ts
73 │ /**
74 │  * Type of the Optional decorator / constructor function.
75 │  *
76 │  * @publicApi
77 │  */
78 │ export interface OptionalDecorator {
79 │   /**
80 ▶    * Parameter decorator to be used on constructor parameters,
81 ▶    * which marks the parameter as being an optional dependency.
82 ▶    * The DI framework provides `null` if the dependency is not found.
83 │    *
84 ▶    * Can be used together with other parameter decorators
85 ▶    * that modify how dependency injection operates.
86 │    *
87 │    * @usageNotes
88 │    *
89 │    * The following code allows the possibility of a `null` result:
90 │    *
91 ▶    * {@example core/di/ts/metadata_spec.ts region='Optional'}
92 │    *
93 │    * @see [Dependency Injection Guide](guide/di)
94 │    */
95 │   (): any;
96 │   new (): Optional;
97 │ }
```

パラメーターのデコレーターは 2 つの使い方があります。constructor の引数に付ける形（`constructor(@Optional() engine: Engine)`）はコンパイラーが `ɵfac` の中のフラグに直し、`Injector.create` の `deps` に入れる形（`[[new Optional(), Engine]]`）は実行時の `injectArgs` が配列の中を見てフラグに直します（L327〜362、[provider の 4 つの形の章](../di/07-di-provider-to-factory.md)）。39・91 行目の例はどちらも後者の形で、そのまま DEMO の 3 つ目の表に入れて、`true` と `null` が返りました。

36〜37 行目「`@Inject()` が無ければ引数の型の注釈が provider になる」は、例（metadata\_spec.ts L26〜39）では `deps: [Engine]` と明示しています。`deps` を書いた provider は `deps` だけから引数を作り（r3\_injector.ts L673〜674）、constructor の型の注釈もデコレーターも見ません。`deps` を書かずにクラスを渡したときだけ、コンパイラーが型の注釈とデコレーターから作った `ɵfac` が使われます（L676）。21〜25 行目は文字列の token を勧めない、と書きますが受け付けます。`deps: [[new Inject('apiUrl')]]` で `'/api'` が返りました。

> [!WARNING]
> **ハマりどころ**
>
> `deps: [new Inject('apiUrl')]` と配列で包まずに書くと、`Inject` のオブジェクトそのものが token になり、「No provider found for \`\[object Object\]\`」の NG0201 です（デモを作るときに一度この形で書いて出ました）。`injectArgs` は配列の要素のときだけデコレーターのフラグを読みます。

## 5. @Self：「上へたどる」は実物と逆

📄 `angular/packages/core/src/di/metadata.ts` L117–144 （▶ の行: 124–125, 127–128, 132–134, 136）

```ts
117 │ /**
118 │  * Type of the Self decorator / constructor function.
119 │  *
120 │  * @publicApi
121 │  */
122 │ export interface SelfDecorator {
123 │   /**
124 ▶    * Parameter decorator to be used on constructor parameters,
125 ▶    * which tells the DI framework to start dependency resolution from the local injector.
126 │    *
127 ▶    * Resolution works upward through the injector hierarchy, so the children
128 ▶    * of this class must configure their own providers or be prepared for a `null` result.
129 │    *
130 │    * @usageNotes
131 │    *
132 ▶    * In the following example, the dependency can be resolved
133 ▶    * by the local injector when instantiating the class itself, but not
134 ▶    * when instantiating a child.
135 │    *
136 ▶    * {@example core/di/ts/metadata_spec.ts region='Self'}
137 │    *
138 │    * @see {@link SkipSelf}
139 │    * @see {@link Optional}
140 │    *
141 │    */
142 │   (): any;
143 │   new (): Self;
144 │ }
```

125 行目「今の注入器から解決を始める」に続けて、127〜128 行目は「解決は注入器の階層を上へたどるので、子は自分で provider を置くか `null` に備えよ」と書きます。`@Self` は逆で、今の注入器だけを見て親へは行きません。`R3Injector.get` は Self のビットが立っていれば次の注入器を親ではなく `NullInjector` にします（L376、[R3Injector.get の章](../di/08-di-r3-injector-get.md)）。DEMO の 3 つ目の表の「@Self の例：子」は、親に `Dependency` があっても NG0201 でした。コンポーネントの constructor に `@Self() @Inject(URL)` を付け、URL を親にだけ置いても同じく NG0201 です（4 つ目の表）。132〜134 行目「自分では解決でき、子では解決できない」と例（metadata\_spec.ts L87〜108）は正しく、127〜128 行目だけが例と食い違います。

この 2 行は 0a2132ef104（2016-09-14、`docs(di): update docs on di`）から言い回しが変わっておらず、f4f7c33e1fe（2021-02-15）で `null` を `` `null` `` にしただけです。新しい本家でも同じ文です。`InjectOptions` の `self` の説明（「今の注入器だけを見て、親に戻らない」、interface/injector.ts L71〜72）は正しく書いています。

## 6. @SkipSelf：例は SkipSelf を使っていない

📄 `angular/packages/core/src/di/metadata.ts` L164–190 （▶ の行: 171–174, 178–179, 181）

```ts
164 │ /**
165 │  * Type of the `SkipSelf` decorator / constructor function.
166 │  *
167 │  * @publicApi
168 │  */
169 │ export interface SkipSelfDecorator {
170 │   /**
171 ▶    * Parameter decorator to be used on constructor parameters,
172 ▶    * which tells the DI framework to start dependency resolution from the parent injector.
173 ▶    * Resolution works upward through the injector hierarchy, so the local injector
174 ▶    * is not checked for a provider.
175 │    *
176 │    * @usageNotes
177 │    *
178 ▶    * In the following example, the dependency can be resolved when
179 ▶    * instantiating a child, but not when instantiating the class itself.
180 │    *
181 ▶    * {@example core/di/ts/metadata_spec.ts region='SkipSelf'}
182 │    *
183 │    * @see [Dependency Injection guide](guide/di/hierarchical-dependency-injection#skipself).
184 │    * @see {@link Self}
185 │    * @see {@link Optional}
186 │    *
187 │    */
188 │   (): any;
189 │   new (): SkipSelf;
190 │ }
```

📄 `angular/packages/examples/core/di/ts/metadata_spec.ts` L113–136 （▶ の行: 120, 125, 128, 130–131, 133）

```ts
113 │     describe('SkipSelf', () => {
114 │       it('works', () => {
115 │         // #docregion SkipSelf
116 │         class Dependency {}
117 │ 
118 │         @Injectable()
119 │         class NeedsDependency {
120 ▶           constructor(@SkipSelf() public dependency: Dependency) {}
121 │         }
122 │ 
123 │         const parent = Injector.create({providers: [{provide: Dependency, deps: []}]});
124 │         const child = Injector.create({
125 ▶           providers: [{provide: NeedsDependency, deps: [Dependency]}],
126 │           parent,
127 │         });
128 ▶         expect(child.get(NeedsDependency).dependency instanceof Dependency).toBe(true);
129 │ 
130 ▶         const inj = Injector.create({
131 ▶           providers: [{provide: NeedsDependency, deps: [[new Self(), Dependency]]}],
132 │         });
133 ▶         expect(() => inj.get(NeedsDependency)).toThrowError();
134 │         // #enddocregion
135 │       });
136 │     });
```
*181 行目が指す例（packages/examples/core/di/ts/metadata\_spec.ts）*

171〜174 行目の説明「親から解決を始め、今の注入器は見ない」は合っています。DEMO の 3 つ目の表で `deps: [[new SkipSelf(), Dependency]]` を自分と親の両方に `Dependency` がある注入器に置くと親の値、自分にだけある注入器では NG0201 でした。合わないのは 181 行目が指す例です。178〜179 行目は「子では解決でき、自分では解決できない」例だと言いますが、125 行目の `deps` は `[Dependency]` で `SkipSelf` が無く、131 行目は `new Self()` です。120 行目の constructor の `@SkipSelf()` は、`deps` を書いた provider では使われません（4 節）。`deps` を書かずにクラスだけを `providers` に入れれば、`ɵfac` が `@SkipSelf()` を含むので親の値になりました（DEMO の 3 つ目の表の「deps を書かずにクラスだけ」）。133 行目の例外は、`inj` にそもそも `Dependency` が無いから出ます。`SkipSelf` を外しても、`Self` を外しても同じ例外です。

この形になったのは 82c77ce2320（2019-04-05、`docs(core): update API doc examples to use static injector (#29729)`）です。それまでの例は `ReflectiveInjector` で、constructor の `@SkipSelf()` を読み、`Dependency` と `NeedsDependency` を同じ注入器に置いて例外を出していました。`Injector.create` に書き換えたときに、`deps` へ `SkipSelf` を移さず、2 つ目の注入器から `Dependency` を外しています。新しい本家でも同じです。

## 7. @Host：子の要素からたどって、ホストで止まる

📄 `angular/packages/core/src/di/metadata.ts` L210–232 （▶ の行: 217–219, 223, 225）

```ts
210 │ /**
211 │  * Type of the `Host` decorator / constructor function.
212 │  *
213 │  * @publicApi
214 │  */
215 │ export interface HostDecorator {
216 │   /**
217 ▶    * Parameter decorator on a view-provider parameter of a class constructor
218 ▶    * that tells the DI framework to resolve the view by checking injectors of child
219 ▶    * elements, and stop when reaching the host element of the current component.
220 │    *
221 │    * @usageNotes
222 │    *
223 ▶    * The following shows use with the `@Optional` decorator, and allows for a `null` result.
224 │    *
225 ▶    * {@example core/di/ts/metadata_spec.ts region='Host'}
226 │    *
227 │    * For an extended example, see ["Dependency Injection
228 │    * Guide"](guide/di/hierarchical-dependency-injection#optional).
229 │    */
230 │   (): any;
231 │   new (): Host;
232 │ }
```

📄 `angular/packages/examples/core/di/ts/metadata_spec.ts` L138–174 （▶ の行: 151–152, 154, 161–162, 169）

```ts
138 │     describe('Host', () => {
139 │       it('works', () => {
140 │         // #docregion Host
141 │         class OtherService {}
142 │         class HostService {}
143 │ 
144 │         @Directive({
145 │           selector: 'child-directive',
146 │           standalone: false,
147 │         })
148 │         class ChildDirective {
149 │           logs: string[] = [];
150 │ 
151 ▶           constructor(@Optional() @Host() os: OtherService, @Optional() @Host() hs: HostService) {
152 ▶             // os is null: true
153 │             this.logs.push(`os is null: ${os === null}`);
154 ▶             // hs is an instance of HostService: true
155 │             this.logs.push(`hs is an instance of HostService: ${hs instanceof HostService}`);
156 │           }
157 │         }
158 │ 
159 │         @Component({
160 │           selector: 'parent-cmp',
161 ▶           viewProviders: [HostService],
162 ▶           template: '<child-directive></child-directive>',
163 │           standalone: false,
164 │         })
165 │         class ParentCmp {}
166 │ 
167 │         @Component({
168 │           selector: 'app',
169 ▶           viewProviders: [OtherService],
170 │           template: '<parent-cmp></parent-cmp>',
171 │           standalone: false,
172 │         })
173 │         class App {}
174 │         // #enddocregion
```
*225 行目が指す例*

例をそのまま standalone のコンポーネントに直して（`standalone: false` と `declarations` を外し、`imports` に並べただけ）このページで描くと、152・154 行目のコメントのとおり `os is null: true` と `hs is an instance of HostService: true` でした（DEMO の 4 つ目の表）。`HostService` は 161 行目の `ParentCmp` の `viewProviders` にあり、`child-directive` は `ParentCmp` のテンプレートの中なので、ホスト（`ParentCmp` の要素）の手前で見つかります。`OtherService` は 169 行目の `App` にあり、ホストより外なので `null` です。217〜219 行目の「resolve the view by checking injectors of child elements」は読みにくい文ですが、「今の要素から上へ、今のコンポーネントのホストの要素まで」という意味で、実物と合います。`inject(X, {host: true, optional: true})` でも同じ 2 つでした。

環境の注入器（`Injector.create`）の `deps` に `new Host()` を入れても何もしません（3 つ目の表の最後から 2 行目）。`InjectOptions` の説明（interface/injector.ts L77〜79）はこのことを書いていますが、`@Host` の説明文は書いていません。R3Injector が Host のビットを読まないことは[4 つのビットの章](../di/12-di-resolution-flags.md)の 5 節です。

## 8. Injector.get の 3 つの形

📄 `angular/packages/core/src/di/injector.ts` L20–45 （▶ の行: 21–22, 32, 36, 38, 40）

```ts
20 │ /**
21 ▶  * Concrete injectors implement this interface. Injectors are configured
22 ▶  * with [providers](guide/di/defining-dependency-providers) that associate
23 │  * dependencies of various types with [injection tokens](guide/di/defining-dependency-providers).
24 │  *
25 │  * @see [DI Providers](guide/di/defining-dependency-providers).
26 │  * @see {@link StaticProvider}
27 │  *
28 │  * @usageNotes
29 │  *
30 │  *  The following example creates a service injector instance.
31 │  *
32 ▶  * {@example core/di/ts/provider_spec.ts region='ConstructorProvider'}
33 │  *
34 │  * ### Usage example
35 │  *
36 ▶  * {@example core/di/ts/injector_spec.ts region='Injector'}
37 │  *
38 ▶  * `Injector` returns itself when given `Injector` as a token:
39 │  *
40 ▶  * {@example core/di/ts/injector_spec.ts region='injectInjector'}
41 │  *
42 │  * @see [Types of injector hierarchies](guide/di/hierarchical-dependency-injection#types-of-injector-hierarchies)
43 │  *
44 │  * @publicApi
45 │  */
```

📄 `angular/packages/core/src/di/injector.ts` L62–83 （▶ の行: 64–65, 69–70, 75, 77, 79, 82）

```ts
62 │   /**
63 │    * Retrieves an instance from the injector based on the provided token.
64 ▶    * @returns The instance from the injector if defined, otherwise the `notFoundValue`.
65 ▶    * @throws When the `notFoundValue` is `undefined` or `Injector.THROW_IF_NOT_FOUND`.
66 │    */
67 │   abstract get<T>(
68 │     token: ProviderToken<T>,
69 ▶     notFoundValue: null | undefined,
70 ▶     options: InjectOptions,
71 │   ): T | null;
72 │   /**
73 │    * Retrieves an instance from the injector based on the provided token.
74 │    * @returns The instance from the injector if defined, otherwise the `notFoundValue`.
75 ▶    * @throws When the `notFoundValue` is `undefined` or `Injector.THROW_IF_NOT_FOUND`.
76 │    */
77 ▶   abstract get<T>(token: ProviderToken<T>, notFoundValue?: T, options?: InjectOptions): T;
78 │   /**
79 ▶    * @deprecated from v4.0.0 use ProviderToken<T>
80 │    * @suppress {duplicate}
81 │    */
82 ▶   abstract get<T>(token: string | ProviderToken<T>, notFoundValue?: any): any;
83 │ 
```

36・40 行目が指す例（injector\_spec.ts L38〜43・L49〜50）のとおり、見つからなければ例外、`notFoundValue` を渡せばその値、`get(Injector)` は自分でした。65 行目は、2 つ目の形（`options` を渡す形）にも「`notFoundValue` が `undefined` なら例外」と書きます。実際は `get(MISSING, undefined, {optional: true})` が `null` を返しました。`R3Injector.get` の `notFoundValue` は既定値つきの引数（`= THROW_IF_NOT_FOUND`）なので、`undefined` を渡すと既定値に置き換わり、そのあと optional のビットで `null` になります（L379〜382、[R3Injector.get の章](../di/08-di-r3-injector-get.md)）。69 行目の型（`T | null`）はこのことを表していて、spec の `should return null when not requested provider on self and optional`（static\_injector\_spec.ts 127）もこの振る舞いを固めています。説明文だけが 1 つ目と同じ文を写しています。79〜82 行目の、型の付かない文字列の token は v4 から deprecated です。

📄 `angular/packages/core/src/di/injector_token.ts` L13–26 （▶ の行: 14, 16–17）

```ts
13 │ /**
14 ▶  * An InjectionToken that gets the current `Injector` for `createInjector()`-style injectors.
15 │  *
16 ▶  * Requesting this token instead of `Injector` allows `StaticInjector` to be tree-shaken from a
17 ▶  * project.
18 │  *
19 │  * @publicApi
20 │  */
21 │ export const INJECTOR = new InjectionToken<Injector>(
22 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'INJECTOR' : '',
23 │   // Disable tslint because this is const enum which gets inlined not top level prop access.
24 │   // tslint:disable-next-line: no-toplevel-property-access
25 │   InjectorMarkers.Injector as any, // Special value used by Ivy to identify `Injector`.
26 │ );
```

`INJECTOR` の 16〜17 行目は「`Injector` の代わりにこの token を使うと `StaticInjector` を tree-shake できる」と書きます。`StaticInjector`（View Engine のころの `Injector.create` の実装）は 8c71b9fc42e（2021-11-09、`refactor: delete the View Engine runtime (#43884)`）で消え、今の `Injector.create` は `R3Injector` を作ります（9 節）。この 2 行は 6ef9f2278f6（2018-02-16、`feat(ivy): @NgModule -> ngInjectorDef compilation`）で書かれたまま残っています。新しい本家でも同じです。

## 9. Injector.create の parent と name

📄 `angular/packages/core/src/di/injector.ts` L84–106 （▶ の行: 85, 87, 94–96, 105）

```ts
 84 │   /**
 85 ▶    * @deprecated from v5 use the new signature Injector.create(options)
 86 │    */
 87 ▶   static create(providers: StaticProvider[], parent?: Injector): Injector;
 88 │ 
 89 │   /**
 90 │    * Creates a new injector instance that provides one or more dependencies,
 91 │    * according to a given type or types of `StaticProvider`.
 92 │    *
 93 │    * @param options An object with the following properties:
 94 ▶    * * `providers`: An array of providers of the [StaticProvider type](api/core/StaticProvider).
 95 ▶    * * `parent`: (optional) A parent injector.
 96 ▶    * * `name`: (optional) A developer-defined identifying name for the new injector.
 97 │    *
 98 │    * @returns The new injector instance.
 99 │    *
100 │    */
101 │   static create(options: {
102 │     providers: Array<Provider | StaticProvider>;
103 │     parent?: Injector;
104 │     name?: string;
105 ▶   }): DestroyableInjector;
106 │ 
```

95 行目の `parent` を省くと、親は `NullInjector` です（create\_injector.ts L55、[2 段の DI 木の章](../boot/08-boot-injectors.md)）。`Injector.create({providers: []}).get(EnvironmentInjector)` は NG0201 でした。アプリの注入器にぶら下げたいときは `parent` を渡します。96 行目の `name` は「開発者が決める識別の名前」としか書いていませんが、使われるのは開発モードの例外の文だけです。`createInjectorWithoutInjectorInstances` は `if (ngDevMode)` の中でだけ `name` を `R3Injector` の `source` にし（create\_injector.ts L51〜53）、`get` の例外の最後で「Source: MyNamedInjector.」を足します（DEMO の 5 つ目の表）。本番は `NG0201` だけです。

もう 1 つ、説明文に無い違いがあります。同じ注入器でも、`child.get(MISSING)` の例外には「Source: child.」が付き、`runInInjectionContext(child, () => inject(MISSING))` には付きませんでした（1 つ目の表）。`source` を足すのは `R3Injector.get` が一番外の呼び出しのとき（前の注入器が無いとき、L404〜409）だけで、`runInInjectionContext` の中では前の注入器として `child` 自身が立っているからです。87 行目の古い形 `Injector.create(providers, parent)` は v5 から deprecated ですが、今も動きます。105 行目の新しい形だけが戻り値の型を `DestroyableInjector`（`destroy` を持つ）にしていて、古い形は型が `Injector` でも中身は同じ `R3Injector` なので `destroy` があります。

## 10. destroy の後

📄 `angular/packages/core/src/di/r3_injector.ts` L262–272 （▶ の行: 265, 267–268, 271）

```ts
262 │   }
263 │ 
264 │   /**
265 ▶    * Destroy the injector and release references to every instance or provider associated with it.
266 │    *
267 ▶    * Also calls the `OnDestroy` lifecycle hooks of every instance that was created for which a
268 ▶    * hook was found.
269 │    */
270 │   override destroy(): void {
271 ▶     assertNotDestroyed(this);
272 │ 
```

265〜268 行目のとおり、`destroy` は作った物の `ngOnDestroy` を呼び、`destroyed` は `false` から `true` になりました。271 行目の `assertNotDestroyed` のため、2 回目の `destroy` は NG0205「Injector has already been destroyed.」です。`get` と `runInInjectionContext` も同じ確かめを最初にするので、destroy の後はどちらも NG0205 でした（[DestroyRef と破棄の章](../di/14-di-destroy.md)の 5 節）。`Injector` と `DestroyableInjector` の説明文（injector.ts L140〜147）は、destroy の後に触ると例外になることを書いていません。

> [!WARNING]
> **ハマりどころ**
>
> デモの `ngOnDestroy` を持つクラスは、最初はデコレーターを付けずに書きました。Node の JIT では動きましたが、サイトの AOT のビルドは「NG2007: Class is using Angular features but is not decorated.」で止まりました。ライフサイクルのフックの名前のメソッドを持つクラスには、`Injector.create` の `deps` で作るだけでも `@Injectable()` が要ります。開いている issue #50462（ngOnDestroy not allowed on non decorated classes used with useClass or useFactory）がこの決まりの話です。

📄 `angular/packages/core/src/di/r3_injector.ts` L164–176 （▶ の行: 168–170, 174）

```ts
164 │ 
165 │   /**
166 │    * Runs the given function in the context of this `EnvironmentInjector`.
167 │    *
168 ▶    * Within the function's stack frame, [`inject`](api/core/inject) can be used to inject
169 ▶    * dependencies from this injector. Note that `inject` is only usable synchronously, and cannot be
170 ▶    * used in any asynchronous callbacks or after any `await` points.
171 │    *
172 │    * @param fn the closure to be run in the context of this injector
173 │    * @returns the return value of the function, if any
174 ▶    * @deprecated use the standalone function `runInInjectionContext` instead
175 │    */
176 │   abstract runInContext<ReturnT>(fn: () => ReturnT): ReturnT;
```

`EnvironmentInjector.runInContext` は 174 行目で deprecated、後継は `runInInjectionContext` です。168〜170 行目の「同期のあいだだけ」は 2 節の `await` の行と同じ理由です。新しい本家では 1f247282b29（2026-10-02）で「3p-only」の印と「v23 で消す」の TODO が付きました。

> **🧪 DEMO — 説明文の約束を本物の inject と Injector で試す**
>
> 押すと、このページ（本番ビルド）で本物の `@angular/core`（22.2.6）の `Injector.create`・`inject`・`runInInjectionContext` を呼び、小さなコンポーネントを `createComponent` で作って（文書に付けない div の上）、結果を「このページ」の列に書きます。作った注入器とコンポーネントは表を作り終えたら destroy します。  
>  「開発モード」の列は、同じ関数（crd-inject.demo-inj.ts）を Node（domino の上の JIT）で開発モードで実行した記録です。例外の文は開発モードでしか出ないので、記録で見せます。「説明と違う」の行は左に印を付けます。  
>  3 つ目の表（`deps` に `new Self()` などを入れる説明文の例）だけは記録の再生です。このページで `Self`・`SkipSelf`・`Host`・`Inject` の値を使うと、本番ビルドの最初に読む JS（Initial total）が 0.04 kB 増えたためです（デコレーターの本体は最初の chunk にもともとあり、遅延 chunk に渡す export の名前が 4 つ増える分）。constructor に付けるデコレーター（4 つ目の表）はコンパイルでフラグの数に変わるので、ページで動かしています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-inject)

## ここまでの呼び出し

- 👤 `Injector.create({providers, parent, name: 'child'})`
  - `createInjector({name}, parent, providers, name)` — injector.ts L116〜117 — *name は開発モードでだけ source に*
- 👤 `runInInjectionContext(child, () => inject(T, {self: true}))`
  - `setCurrentInjector(child)` — contextual.ts L50
    - `inject → ɵɵinject(T, convertToBitFlags({self: true}))` — injector\_compatibility.ts L293〜297 — *Self = 0b0010*
      - `injectInjectorOnly → child.retrieve → child.get(T, THROW_IF_NOT_FOUND, Self)` — L93〜124、r3\_injector.ts L246〜262
        - `records に無い → nextInjector = getNullInjector()` — r3\_injector.ts L376 — *Self なので親へ行かない*
          - `NullInjector.get → throw NG0201` — null\_injector.ts L17〜26

## テストと直し方

| ファイル（packages/core/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `acceptance/di_spec.ts` | `inject()`（4169）› `should work in a useFactory definition for a service`（4254）・`should work for field injection`（4271） | 2 節の場所。文脈の外で `inject()` を呼ぶと NG0203 になる it は無い（`assertInInjectionContext`（4690）› `should throw if not in an injection context`（4693）だけ） |
| `acceptance/di_spec.ts` | `injection flags`（4421）› `should be able to use skipSelf injection in EnvironmentInjector`（4494）・`should be able to use self injection in EnvironmentInjector`（4523）・`should be able to use host injection`（4532） | 1 節の options。4532 は host が要素の注入器で止まること |
| `di/static_injector_spec.ts` | `dependency resolution`（85）› `@Self()`（86）› `should throw when not requested provider on self`（98）・`should return null when not requested provider on self and optional`（127）、`default`（141）› `should skip self`（142） | 5・6・8 節。98 は親にあっても Self なら例外（説明文 127〜128 行目と逆）、127 は 8 節の `undefined` と optional |
| `di/r3_injector_spec.ts` | `should throw without the module name when no module`（347）・`calls ngOnDestroy on services when destroyed`（447）・`does not allow injection after destroy`（461）・`does not allow double destroy`（468） | 9・10 節。Source が付く／付かない、NG0205 |
| `acceptance/di_spec.ts` | `runInInjectionContext`（4563）› `should not function on a destroyed injector`（4683） | 10 節 |
| `../examples/core/di/ts/metadata_spec.ts`（target は `//packages/examples/core:test`） | `di metadata examples`（22）› `SkipSelf`（113）› `works`（114）ほか 6 つ | 4〜7 節の例そのもの。6 つとも通るが、SkipSelf の it は SkipSelf を使わずに通る（6 節） |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（結果は「テストと直し方」の表の下）
```

結果（どれも 0 failures）：`//packages/core/test:test` は絞らずに 1401 specs（4 つの shard の合計、pending 8）、`dependency resolution` で 9、`InjectorDef-based createInjector` で 32、`Injector.NULL` で 3。`//packages/core/test/acceptance:acceptance` は絞らずに 2693 specs（pending 3）、`di inject\(\)` で 12、`di injection flags` で 7、`di runInInjectionContext` で 10、`di assertInInjectionContext` で 3、`//packages/examples/core:test` は絞らずに 32 specs、`di metadata examples` で 6、`injector metadata examples` で 4 でした（shard ごとの「Ran N of M specs」の N を足した数）。

直すとしたら説明文です。injector\_compatibility.ts の 172 行目と 241 行目は 183〜184 行目と同じ「成功すれば値。見つからなければ例外」に。metadata.ts の 127〜128 行目は「親へは上がらないので、自分の注入器に provider が無ければ例外か（@Optional なら）`null`」に。metadata\_spec.ts の 125 行目は `deps: [[new SkipSelf(), Dependency]]`、131 行目は `[[new SkipSelf(), Dependency]]` にして 130 行目の注入器に `{provide: Dependency, deps: []}` を足すと、178〜179 行目の説明どおりの例になります。injector.ts の 65 行目は「`notFoundValue` が `undefined` で optional でなければ例外」に。injector\_token.ts の 16〜17 行目は今の実装に合わせて書き直すか外します。spec は今の振る舞いをすでに固めていますが、文脈の外の `inject()` が NG0203 になる it は core に無いので、足すなら acceptance/di\_spec.ts の `inject()` の describe（4169）に、`RuntimeErrorCode.MISSING_INJECTION_CONTEXT` を待つ it を足します（4693 と同じ形）。

## 聞かれそうな質問

**Q. `inject(Foo)` で Foo の provider が無いと、`null` が返りますか？**

返りません。NG0201 の例外です。説明文の 172・241 行目は「`null` otherwise」と書きますが、型（177 行目の `T`）と実物は例外です。`null` が欲しければ `{optional: true}` を渡します（194〜195 行目）。

**Q. `@Self()` を付けると、自分に無いときに親を探しますか？**

探しません。Self のビットが立つと、`R3Injector.get` は次の注入器を `NullInjector` にします（L376）。説明文の 127〜128 行目「上へたどる」は逆で、132〜134 行目と例は正しく書いています。

**Q. `Injector.create` に渡したサービスの constructor の `@SkipSelf()` は効きますか？**

`deps` を書いた provider では効きません。引数は `deps` の配列だけから作られます（r3\_injector.ts L673〜674）。`deps: [[new SkipSelf(), Dep]]` と書くか、`deps` を書かずにクラスだけを渡せば（コンパイラーの `ɵfac` が使われる）効きます。説明文の例（metadata\_spec.ts L113〜136）は deps に `SkipSelf` を入れていないので、`SkipSelf` の例になっていません。

**Q. `Injector.create` の `name` は何に使われますか？**

開発モードの NG0201 の文の「Source: 名前.」だけです。`ngDevMode` の中でだけ `source` に入り（create\_injector.ts L51〜53）、本番では捨てられます。`runInInjectionContext` の中の `inject` の例外には付きません。

**Q. `ngOnInit` で `inject` したいときは？**

フィールドか constructor で `inject(Injector)` を取っておき、`ngOnInit` で `injector.get(X)` か `runInInjectionContext(injector, () => inject(X))` を呼びます。`ngOnInit` で直接 `inject` すると、説明文の 281〜283 行目のとおり NG0203 です。

## 読み終えて

- `inject` は options を渡さなければ、見つからないとき例外。説明文の「`null` otherwise」は 2 か所とも違う。
- 説明文の 5 つの場所と「constructor の引数」では `inject` でき、ライフサイクルのフックとクリックの処理と `await` の後は NG0203。
- `@Self` の説明文の「上へたどる」は逆。`@SkipSelf` の例は 2019 年の書き換えで `SkipSelf` を失った。
- `Injector.get(token, undefined, {optional: true})` は例外ではなく `null`。`name` は開発モードの例外の文にだけ出る。
- 公開の `InjectFlags` は v20 で消えたが、`@param flags` と `StaticInjector` の文が説明文に残っている（前者は新しい本家で直った）。

---

← 前: [Provider の形の説明文：useClass・useValue・useFactory・useExisting・multi](05-crd-provider.md)  
次: [ライフサイクルの説明文：OnChanges・DoCheck・AfterView・ChangeDetectorRef](07-crd-lifecycle.md) →
