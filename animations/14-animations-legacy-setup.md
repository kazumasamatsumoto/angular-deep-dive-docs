[目次](../README.md) › [アニメーションの内側](README.md) › 第 14 回 / 全 20 回

# 旧 @angular/animations の入口：provideAnimations と AnimationRenderer

> provideAnimations・provideAnimationsAsync・provideNoopAnimations が入れるもの、AnimationRendererFactory が DomRendererFactory2 を包み、\[@trigger\] の setProperty と (@trigger.done) の listen を横取りする行、begin / end で変更検知の終わりにエンジンを flush する仕組み、provideAnimationsAsync がエンジンを別のチャンクで後から読む流れ。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-legacy-setup)

---

`@angular/animations`（この章では「旧パッケージ」と呼びます）は、`[@open]="isOpen"` と書いたトリガーを、DOM に書く前に横取りして自分のエンジンに渡します。横取りしているのは `RendererFactory2` の差し替えです。この章では、`provideAnimations()` などが何を provide するか、`AnimationRendererFactory` がどのコンポーネントにどのレンダラーを渡すか、`setProperty('@open', v)` がエンジンに積まれ、変更検知の終わりの `end()` で 1 回だけ `flush` されるまでを 1 ステップずつ追います。

読む対象は `packages/platform-browser/animations/src/providers.ts`・`module.ts`、`async/src/providers.ts`・`async_animation_renderer.ts`、`packages/animations/browser/src/render/animation_renderer.ts`・`renderer.ts`・`animation_engine_next.ts`、`create_engine.ts` です。どの公開関数にも ``@deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23`` が付いています（v23 でも残してほしいという issue #71703 が 2026-10-28 に開かれています。[第 20 回](20-animations-issues.md)）。

1. [1. 全体像](01-animations-overview.md)
2. [2. テンプレートから命令へ](02-animations-compile.md)
3. [3. 命令がすること](03-animations-instructions.md)
4. [4. 待ち行列](04-animations-queue.md)
5. [5. enter のクラス](05-animations-enter-classes.md)
6. [6. いちばん長いアニメーション](06-animations-longest.md)
7. [7. 関数で動かす](07-animations-functions.md)
8. [8. 動かないとき](08-animations-disabled.md)
9. [9. 消すのを遅らせる](09-animations-leave-removal.md)
10. [10. leave のクラス](10-animations-leave-classes.md)
11. [11. 入れ子の leave](11-animations-leave-nested.md)
12. [12. 並べ替えと出し直し](12-animations-leave-reorder.md)
13. [13. スタイルの後片付け](13-animations-styles-teardown.md)
14. **14. 旧パッケージの入口**（この章）
15. [15. 旧 DSL とキーフレーム](15-animations-legacy-dsl.md)
16. [16. TransitionAnimationEngine](16-animations-legacy-engine.md)
17. [17. 2 つが同居するとき](17-animations-legacy-compat.md)
18. [18. 移行](18-animations-migration.md)
19. [19. テスト](19-animations-testing.md)
20. [20. issue と変更を読む](20-animations-issues.md)

## 1. provideAnimations が入れる 5 つのトークン

📄 `angular/packages/platform-browser/animations/src/providers.ts` L70–99 （▶ の行: 74–77, 84, 86, 91, 94, 96, 98）

```ts
70 │ /**
71 │  * Separate providers from the actual module so that we can do a local modification in Google3 to
72 │  * include them in the BrowserTestingModule.
73 │  */
74 ▶ export const BROWSER_NOOP_ANIMATIONS_PROVIDERS: Provider[] = [
75 ▶   {provide: AnimationDriver, useClass: NoopAnimationDriver},
76 ▶   {provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations'},
77 ▶   ...SHARED_ANIMATION_PROVIDERS,
78 │ ];
79 │ 
80 │ /**
81 │  * Separate providers from the actual module so that we can do a local modification in Google3 to
82 │  * include them in the BrowserModule.
83 │  */
84 ▶ export const BROWSER_ANIMATIONS_PROVIDERS: Provider[] = [
85 │   // Note: the `ngServerMode` happen inside factories to give the variable time to initialize.
86 ▶   {
87 │     provide: AnimationDriver,
88 │     useFactory: () =>
89 │       typeof ngServerMode !== 'undefined' && ngServerMode
90 │         ? new NoopAnimationDriver()
91 ▶         : new WebAnimationsDriver(),
92 │   },
93 │   {
94 ▶     provide: ANIMATION_MODULE_TYPE,
95 │     useFactory: () =>
96 ▶       typeof ngServerMode !== 'undefined' && ngServerMode ? 'NoopAnimations' : 'BrowserAnimations',
97 │   },
98 ▶   ...SHARED_ANIMATION_PROVIDERS,
99 │ ];
```

📄 `angular/packages/platform-browser/animations/src/providers.ts` L49–68 （▶ の行: 53–56, 62–66）

```ts
49 │ export function instantiateDefaultStyleNormalizer() {
50 │   return new WebAnimationsStyleNormalizer();
51 │ }
52 │ 
53 ▶ export function instantiateRendererFactory() {
54 ▶   return new AnimationRendererFactory(
55 ▶     inject(DomRendererFactory2),
56 ▶     inject(AnimationEngine),
57 │     inject(NgZone),
58 │   );
59 │ }
60 │ 
61 │ const SHARED_ANIMATION_PROVIDERS: Provider[] = [
62 ▶   {provide: AnimationStyleNormalizer, useFactory: instantiateDefaultStyleNormalizer},
63 ▶   {provide: AnimationEngine, useClass: InjectableAnimationEngine},
64 ▶   {
65 ▶     provide: RendererFactory2,
66 ▶     useFactory: instantiateRendererFactory,
67 │   },
68 │ ];
```

| トークン | BROWSER\_ANIMATIONS\_PROVIDERS（84 行目） | BROWSER\_NOOP\_ANIMATIONS\_PROVIDERS（74 行目） |
| --- | --- | --- |
| `AnimationDriver` | `WebAnimationsDriver`（サーバーでは `NoopAnimationDriver`。86〜92 行目） | `NoopAnimationDriver`（75 行目） |
| `ANIMATION_MODULE_TYPE` | `'BrowserAnimations'`（サーバーでは `'NoopAnimations'`。93〜97 行目） | `'NoopAnimations'`（76 行目） |
| `AnimationStyleNormalizer` | `WebAnimationsStyleNormalizer`（62 行目。共通） |   |
| `AnimationEngine` | `InjectableAnimationEngine`（63 行目。共通） |   |
| `RendererFactory2` | `instantiateRendererFactory`（64〜67 行目。共通） |   |

77 行目と 98 行目のとおり、どちらも同じ 3 つ（`SHARED_ANIMATION_PROVIDERS`）を後ろに足します。違うのは **ドライバー（アニメーションを実際に動かす部品）と、`ANIMATION_MODULE_TYPE` の文字列だけ**です。53〜59 行目の `instantiateRendererFactory` が肝心で、55 行目の `DomRendererFactory2`（普通の DOM レンダラーの工場）と 56 行目のエンジンを `AnimationRendererFactory` に渡して、**それを `RendererFactory2` として provide し直します**。core はレンダラーを作るとき `RendererFactory2` を inject するので、以後すべてのコンポーネントがこの工場を通ります。後勝ちの上書き（`records.set`）の仕組みは [zoneless-default](../zoneless/01-zoneless-default.md) で読みました。

📄 `angular/packages/platform-browser/animations/src/providers.ts` L31–47 （▶ の行: 32, 36, 41, 44–45）

```ts
31 │ @Injectable()
32 ▶ export class InjectableAnimationEngine extends AnimationEngine implements OnDestroy {
33 │   // The `ApplicationRef` is injected here explicitly to force the dependency ordering.
34 │   // Since the `ApplicationRef` should be created earlier before the `AnimationEngine`, they
35 │   // both have `ngOnDestroy` hooks and `flush()` must be called after all views are destroyed.
36 ▶   constructor(
37 │     @Inject(DOCUMENT) doc: Document,
38 │     driver: AnimationDriver,
39 │     normalizer: AnimationStyleNormalizer,
40 │   ) {
41 ▶     super(doc, driver, normalizer);
42 │   }
43 │ 
44 ▶   ngOnDestroy(): void {
45 ▶     this.flush();
46 │   }
47 │ }
```

`InjectableAnimationEngine` は `AnimationEngine` を DI で作れるようにした薄い子クラスです。44〜45 行目、インジェクタが壊されるときに `flush()` を 1 回呼び、エンジンが「消す」と覚えている要素を最後に片付けます。

### NgModule と provide 関数は同じ配列を返すだけ

📄 `angular/packages/platform-browser/animations/src/module.ts` L40–71 （▶ の行: 41–42, 61, 66–68）

````ts
40 │ @NgModule({
41 ▶   exports: [BrowserModule],
42 ▶   providers: BROWSER_ANIMATIONS_PROVIDERS,
43 │ })
44 │ export class BrowserAnimationsModule {
45 │   /**
46 │    * Configures the module based on the specified object.
47 │    *
48 │    * @param config Object used to configure the behavior of the `BrowserAnimationsModule`.
49 │    * @see {@link BrowserAnimationsModuleConfig}
50 │    *
51 │    * @usageNotes
52 │    * When registering the `BrowserAnimationsModule`, you can use the `withConfig`
53 │    * function as follows:
54 │    * ```ts
55 │    * @NgModule({
56 │    *   imports: [BrowserAnimationsModule.withConfig(config)]
57 │    * })
58 │    * class MyNgModule {}
59 │    * ```
60 │    */
61 ▶   static withConfig(
62 │     config: BrowserAnimationsModuleConfig,
63 │   ): ModuleWithProviders<BrowserAnimationsModule> {
64 │     return {
65 │       ngModule: BrowserAnimationsModule,
66 ▶       providers: config.disableAnimations
67 ▶         ? BROWSER_NOOP_ANIMATIONS_PROVIDERS
68 ▶         : BROWSER_ANIMATIONS_PROVIDERS,
69 │     };
70 │   }
71 │ }
````

📄 `angular/packages/platform-browser/animations/src/module.ts` L98–115 （▶ の行: 98, 102, 111, 113）

```ts
 98 ▶ export function provideAnimations(): Provider[] {
 99 │   performanceMarkFeature('NgEagerAnimations');
100 │   // Return a copy to prevent changes to the original array in case any in-place
101 │   // alterations are performed to the `provideAnimations` call results in app code.
102 ▶   return [...BROWSER_ANIMATIONS_PROVIDERS];
103 │ }
104 │ 
105 │ /**
106 │  * A null player that must be imported to allow disabling of animations.
107 │  * @publicApi
108 │  *
109 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
110 │  */
111 ▶ @NgModule({
112 │   exports: [BrowserModule],
113 ▶   providers: BROWSER_NOOP_ANIMATIONS_PROVIDERS,
114 │ })
115 │ export class NoopAnimationsModule {}
```

📄 `angular/packages/platform-browser/animations/src/module.ts` L140–144 （▶ の行: 140, 143）

```ts
140 ▶ export function provideNoopAnimations(): Provider[] {
141 │   // Return a copy to prevent changes to the original array in case any in-place
142 │   // alterations are performed to the `provideNoopAnimations` call results in app code.
143 ▶   return [...BROWSER_NOOP_ANIMATIONS_PROVIDERS];
144 │ }
```

42 行目の `BrowserAnimationsModule`、102 行目の `provideAnimations()` は 1 節の `BROWSER_ANIMATIONS_PROVIDERS` を、113 行目の `NoopAnimationsModule`、143 行目の `provideNoopAnimations()` は `BROWSER_NOOP_ANIMATIONS_PROVIDERS` を、そのまま（関数は写しを）返します。66〜68 行目、`BrowserAnimationsModule.withConfig({disableAnimations: true})` は Noop のほうに切り替えるだけです。41 行目の `exports: [BrowserModule]` は [ngmodule-browser-module](../ngmodule/12-ngmodule-browser-module.md) の BrowserModule です。

## 2. provideAnimationsAsync：エンジンを後から読む

📄 `angular/packages/platform-browser/animations/async/src/providers.ts` L52–79 （▶ の行: 53, 58–59, 64, 66, 70, 75–76）

```ts
52 │ export function provideAnimationsAsync(
53 ▶   type: 'animations' | 'noop' = 'animations',
54 │ ): EnvironmentProviders {
55 │   performanceMarkFeature('NgAsyncAnimations');
56 │ 
57 │   // Animations don't work on the server so we switch them over to no-op automatically.
58 ▶   if (typeof ngServerMode !== 'undefined' && ngServerMode) {
59 ▶     type = 'noop';
60 │   }
61 │ 
62 │   return makeEnvironmentProviders([
63 │     {
64 ▶       provide: RendererFactory2,
65 │       useFactory: () => {
66 ▶         return new AsyncAnimationRendererFactory(
67 │           inject(DOCUMENT),
68 │           inject(DomRendererFactory2),
69 │           inject(NgZone),
70 ▶           type,
71 │         );
72 │       },
73 │     },
74 │     {
75 ▶       provide: ANIMATION_MODULE_TYPE,
76 ▶       useValue: type === 'noop' ? 'NoopAnimations' : 'BrowserAnimations',
77 │     },
78 │   ]);
79 │ }
```

引数は `'animations'`（既定。53 行目）か `'noop'` で、サーバーでは 58〜59 行目で必ず `'noop'` になります。provide するのは `RendererFactory2`（64〜72 行目）と `ANIMATION_MODULE_TYPE` の 2 つだけです。**エンジンもドライバーも provide しません**。`@angular/animations/browser` を import していないので、最初のバンドルに旧エンジンが入りません。

📄 `angular/packages/platform-browser/animations/async/src/async_animation_renderer.ts` L119–140 （▶ の行: 120, 122, 128–129, 133, 137–138）

```ts
119 │   createRenderer(hostElement: any, rendererType: RendererType2): Renderer2 {
120 ▶     const renderer = this.delegate.createRenderer(hostElement, rendererType);
121 │ 
122 ▶     if ((renderer as AnimationRenderer).ɵtype === AnimationRendererType.Regular) {
123 │       // The factory is already loaded, this is an animation renderer
124 │       return renderer;
125 │     }
126 │ 
127 │     // We need to prevent the DomRenderer to throw an error because of synthetic properties
128 ▶     if (typeof (renderer as any).throwOnSyntheticProps === 'boolean') {
129 ▶       (renderer as any).throwOnSyntheticProps = false;
130 │     }
131 │ 
132 │     // Using a dynamic renderer to switch the renderer implementation once the module is loaded.
133 ▶     const dynamicRenderer = new DynamicDelegationRenderer(renderer);
134 │ 
135 │     // Kick off the module loading if the component uses animations but the module hasn't been
136 │     // loaded yet.
137 ▶     if (rendererType?.data?.['animation'] && !this._rendererFactoryPromise) {
138 ▶       this._rendererFactoryPromise = this.loadImpl();
139 │     }
140 │ 
```

📄 `angular/packages/platform-browser/animations/async/src/async_animation_renderer.ts` L74–109 （▶ の行: 78, 81–82, 89, 100–101, 106）

```ts
 74 │   private loadImpl(): Promise<AnimationRendererFactory> {
 75 │     // Note on the `.then(m => m)` part below: Closure compiler optimizations in g3 require
 76 │     // `.then` to be present for a dynamic import (or an import should be `await`ed) to detect
 77 │     // the set of imported symbols.
 78 ▶     const loadFn = () => this.moduleImpl ?? import('@angular/animations/browser').then((m) => m);
 79 │ 
 80 │     let moduleImplPromise: typeof this.moduleImpl;
 81 ▶     if (this.loadingSchedulerFn) {
 82 ▶       moduleImplPromise = this.loadingSchedulerFn(loadFn);
 83 │     } else {
 84 │       moduleImplPromise = loadFn();
 85 │     }
 86 │ 
 87 │     return moduleImplPromise
 88 │       .catch((e) => {
 89 ▶         throw new RuntimeError(
 90 │           RuntimeErrorCode.ANIMATION_RENDERER_ASYNC_LOADING_FAILURE,
 91 │           (typeof ngDevMode === 'undefined' || ngDevMode) &&
 92 │             'Async loading for animations package was ' +
 93 │               'enabled, but loading failed. Angular falls back to using regular rendering. ' +
 94 │               "No animations will be displayed and their styles won't be applied.",
 95 │         );
 96 │       })
 97 │       .then(({ɵcreateEngine, ɵAnimationRendererFactory}) => {
 98 │         // We can't create the renderer yet because we might need the hostElement and the type
 99 │         // Both are provided in createRenderer().
100 ▶         this._engine = ɵcreateEngine(this.animationType, this.doc);
101 ▶         const rendererFactory = new ɵAnimationRendererFactory(
102 │           this.delegate,
103 │           this._engine,
104 │           this.zone,
105 │         );
106 ▶         this.delegate = rendererFactory;
107 │         return rendererFactory;
108 │       });
109 │   }
```

1. **120 行目：まず普通の DOM レンダラーを作る**

   読み込みが終わるまで `this.delegate` は `DomRendererFactory2` です。122 行目、読み込み済みなら（106 行目で delegate が差し替わっていれば）旧エンジンのレンダラーがそのまま返ります。
2. **128〜129 行目：`@` の名前で投げないようにする**

   普通の DOM レンダラーは `@` で始まるプロパティを見ると開発モードで投げます（4 節）。読み込みが終わるまでの間それを止めます。最新の main（124f4214cf8）では、この 3 行は `disableThrowOnSyntheticProps(renderer)` という内部の関数の呼び出しに変わっています。
3. **133 行目：差し替えられる包み（`DynamicDelegationRenderer`）で返す**

   コンポーネントはこの包みを自分のレンダラーとして持ち続けます。中身は後で差し替わります（次の引用）。
4. **137〜138 行目：animations のメタデータを持つコンポーネントが初めて来たら読み込みを始める**

   78 行目の `import('@angular/animations/browser')` がそれで、ビルドでは別のチャンクになります。81〜82 行目、内部用のトークン `ɵASYNC_ANIMATION_LOADING_SCHEDULER_FN` があれば読み込みの時期をそれに任せます。失敗すると 89 行目の `RuntimeError`（コード 5300）で、包みは普通のレンダラーのままになります。
5. **100〜106 行目：エンジンと工場を作り、自分の delegate を差し替える**

   100 行目の `ɵcreateEngine`（下の `create_engine.ts`）でエンジンを作り、101〜105 行目で 1 節と同じ `AnimationRendererFactory` を作ります。読み込みが終わると、待っていた包みに旧エンジンのレンダラーを入れ、スケジューラに `NotificationSource.AsyncAnimationsLoaded` を通知します（上の引用の続き。[zoneless-notification-source](../zoneless/02-zoneless-notification-source.md) で読みました）。

📄 `angular/packages/animations/browser/src/create_engine.ts` L15–22 （▶ の行: 16–18, 21）

```ts
15 │ export function createEngine(type: 'animations' | 'noop', doc: Document): AnimationEngine {
16 ▶   // TODO: find a way to make this tree shakable.
17 ▶   if (type === 'noop') {
18 ▶     return new AnimationEngine(doc, new NoopAnimationDriver(), new NoopAnimationStyleNormalizer());
19 │   }
20 │ 
21 ▶   return new AnimationEngine(doc, new WebAnimationsDriver(), new WebAnimationsStyleNormalizer());
22 │ }
```

18 行目と 21 行目は、1 節の Noop / Browser の 2 つの組み合わせと同じ部品です。16 行目の TODO のとおり、`'noop'` を渡しても `WebAnimationsDriver` はチャンクに入ります。

### 読み込みの前に来たプロパティとリスナーは「あとで流し直す」

📄 `angular/packages/platform-browser/animations/async/src/async_animation_renderer.ts` L286–318 （▶ の行: 289–290, 292, 307–308, 312, 317）

```ts
286 │   setProperty(el: any, name: string, value: any): void {
287 │     // We need to keep track of animation properties set on default renderer
288 │     // So we can also set them also on the animation renderer
289 ▶     if (this.shouldReplay(name)) {
290 ▶       this.replay!.push((renderer: Renderer2) => renderer.setProperty(el, name, value));
291 │     }
292 ▶     this.delegate.setProperty(el, name, value);
293 │   }
294 │ 
295 │   setValue(node: any, value: string): void {
296 │     this.delegate.setValue(node, value);
297 │   }
298 │ 
299 │   listen(
300 │     target: any,
301 │     eventName: string,
302 │     callback: (event: any) => boolean | void,
303 │     options?: ListenerOptions,
304 │   ): () => void {
305 │     // We need to keep track of animation events registred by the default renderer
306 │     // So we can also register them against the animation renderer
307 ▶     if (this.shouldReplay(eventName)) {
308 ▶       this.replay!.push((renderer: Renderer2) =>
309 │         renderer.listen(target, eventName, callback, options),
310 │       );
311 │     }
312 ▶     return this.delegate.listen(target, eventName, callback, options);
313 │   }
314 │ 
315 │   private shouldReplay(propOrEventName: string): boolean {
316 │     //`null` indicates that we no longer need to collect events and properties
317 ▶     return this.replay !== null && propOrEventName.startsWith(ANIMATION_PREFIX);
318 │   }
```

📄 `angular/packages/platform-browser/animations/async/src/async_animation_renderer.ts` L186–206 （▶ の行: 188, 194, 196, 199–200, 204）

```ts
186 │ export class DynamicDelegationRenderer implements Renderer2 {
187 │   // List of callbacks that need to be replayed on the animation renderer once its loaded
188 ▶   private replay: ((renderer: Renderer2) => void)[] | null = [];
189 │   readonly ɵtype = AnimationRendererType.Delegated;
190 │ 
191 │   constructor(private delegate: Renderer2) {}
192 │ 
193 │   use(impl: Renderer2) {
194 ▶     this.delegate = impl;
195 │ 
196 ▶     if (this.replay !== null) {
197 │       // Replay queued actions using the animation renderer to apply
198 │       // all events and properties collected while loading was in progress.
199 ▶       for (const fn of this.replay) {
200 ▶         fn(impl);
201 │       }
202 │       // Set to `null` to indicate that the queue was processed
203 │       // and we no longer need to collect events and properties.
204 ▶       this.replay = null;
205 │     }
206 │   }
```

317 行目、名前が `@` で始まり、まだ流し直す前なら、289〜290 行目で「同じ呼び出しを旧エンジンのレンダラーにもう一度する関数」を `replay` に積みます。そのうえで 292 行目、いまの（普通の）レンダラーにも書きます。普通のレンダラーは `el['@open'] = true` のように要素のプロパティにするだけで、見た目は何も変わりません。読み込みが終わると 194 行目で中身を差し替え、199〜200 行目で積んだ呼び出しを順に流し、204 行目で `replay = null` にして以後は積みません。

## 3. AnimationRendererFactory：どのコンポーネントにどのレンダラーを渡すか

📄 `angular/packages/animations/browser/src/render/animation_renderer.ts` L20–35 （▶ の行: 24–25, 28, 32–33）

```ts
20 │ export class AnimationRendererFactory implements RendererFactory2 {
21 │   private _currentId: number = 0;
22 │   private _microtaskId: number = 1;
23 │   private _animationCallbacksBuffer: [(e: any) => any, any][] = [];
24 ▶   private _rendererCache = new Map<Renderer2, BaseAnimationRenderer>();
25 ▶   private _cdRecurDepth = 0;
26 │ 
27 │   constructor(
28 ▶     private delegate: RendererFactory2,
29 │     private engine: AnimationEngine,
30 │     private _zone: NgZone,
31 │   ) {
32 ▶     engine.onRemovalComplete = (element: any, delegate: Renderer2 | null) => {
33 ▶       delegate?.removeChild(null, element);
34 │     };
35 │   }
```

28 行目の `delegate` が包まれる `DomRendererFactory2` です。32〜33 行目、エンジンが「この要素はもう消してよい」と決めたときの処理（`onRemovalComplete`）を、包んでいる DOM レンダラーの `removeChild` にしておきます。旧パッケージでは要素を DOM から外すのは**エンジンの判断のあと**です（[第 16 回](16-animations-legacy-engine.md)）。

📄 `angular/packages/animations/browser/src/render/animation_renderer.ts` L37–60 （▶ の行: 42–43, 45, 50–51, 57）

```ts
37 │   createRenderer(hostElement: any, type: RendererType2): BaseAnimationRenderer {
38 │     const EMPTY_NAMESPACE_ID = '';
39 │ 
40 │     // cache the delegates to find out which cached delegate can
41 │     // be used by which cached renderer
42 ▶     const delegate = this.delegate.createRenderer(hostElement, type);
43 ▶     if (!hostElement || !type?.data?.['animation']) {
44 │       const cache = this._rendererCache;
45 ▶       let renderer: BaseAnimationRenderer | undefined = cache.get(delegate);
46 │       if (!renderer) {
47 │         // Ensure that the renderer is removed from the cache on destroy
48 │         // since it may contain references to detached DOM nodes.
49 │         const onRendererDestroy = () => cache.delete(delegate);
50 ▶         renderer = new BaseAnimationRenderer(
51 ▶           EMPTY_NAMESPACE_ID,
52 │           delegate,
53 │           this.engine,
54 │           onRendererDestroy,
55 │         );
56 │         // only cache this result when the base renderer is used
57 ▶         cache.set(delegate, renderer);
58 │       }
59 │       return renderer;
60 │     }
```

📄 `angular/packages/animations/browser/src/render/animation_renderer.ts` L61–79 （▶ の行: 63–64, 66, 69–70, 72, 75–76, 78）

```ts
61 │ 
62 │     const componentId = type.id;
63 ▶     const namespaceId = type.id + '-' + this._currentId;
64 ▶     this._currentId++;
65 │ 
66 ▶     this.engine.register(namespaceId, hostElement);
67 │ 
68 │     const registerTrigger = (trigger: NestedAnimationTriggerMetadata) => {
69 ▶       if (Array.isArray(trigger)) {
70 ▶         trigger.forEach(registerTrigger);
71 │       } else {
72 ▶         this.engine.registerTrigger(componentId, namespaceId, hostElement, trigger.name, trigger);
73 │       }
74 │     };
75 ▶     const animationTriggers = type.data['animation'] as NestedAnimationTriggerMetadata[];
76 ▶     animationTriggers.forEach(registerTrigger);
77 │ 
78 ▶     return new AnimationRenderer(this, namespaceId, delegate, this.engine);
79 │   }
```

1. **42 行目：まず DOM のレンダラーを作る**

   中身は [第 13 回](13-animations-styles-teardown.md)の `DomRendererFactory2.createRenderer` です。スタイルを入れるのもここです。
2. **43 行目：`type.data['animation']` が無ければ `BaseAnimationRenderer`**

   コンポーネントのデコレーターに `animations: [...]` が無いとき（ホスト要素が無いときも）は、45〜57 行目で DOM レンダラーごとに 1 つの `BaseAnimationRenderer` を作って使い回します。51 行目の名前空間の ID は空文字です。
3. **63〜64 行目：メタデータがあれば、インスタンスごとに名前空間を作る**

   名前空間の ID は「型の ID - 通し番号」です。66 行目でエンジンにホスト要素ごと登録し、72 行目でトリガーを 1 つずつ登録します（中で DSL を AST にする。[第 15 回](15-animations-legacy-dsl.md)）。75〜76 行目、`animations` は入れ子の配列でもよく、69〜70 行目で平らにします。
4. **78 行目：`AnimationRenderer` を返す**

   工場自身（`this`）を渡すのは、あとで 5 節の `scheduleListenerCallback` を呼ぶためです。

📄 `angular/packages/animations/browser/src/render/animation_engine_next.ts` L26–45 （▶ の行: 40–41, 43–44）

```ts
26 │ export class AnimationEngine {
27 │   private _transitionEngine: TransitionAnimationEngine;
28 │   private _timelineEngine: TimelineAnimationEngine;
29 │ 
30 │   private _triggerCache: {[key: string]: AnimationTrigger} = {};
31 │ 
32 │   // this method is designed to be overridden by the code that uses this engine
33 │   public onRemovalComplete = (element: any, context: any) => {};
34 │ 
35 │   constructor(
36 │     doc: Document,
37 │     private _driver: AnimationDriver,
38 │     private _normalizer: AnimationStyleNormalizer,
39 │   ) {
40 ▶     this._transitionEngine = new TransitionAnimationEngine(doc.body, _driver, _normalizer);
41 ▶     this._timelineEngine = new TimelineAnimationEngine(doc.body, _driver, _normalizer);
42 │ 
43 ▶     this._transitionEngine.onRemovalComplete = (element: any, context: any) =>
44 ▶       this.onRemovalComplete(element, context);
45 │   }
```

📄 `angular/packages/animations/browser/src/render/animation_engine_next.ts` L47–77 （▶ の行: 54, 56, 59, 65–66, 73–74, 76）

```ts
47 │   registerTrigger(
48 │     componentId: string,
49 │     namespaceId: string,
50 │     hostElement: any,
51 │     name: string,
52 │     metadata: AnimationTriggerMetadata,
53 │   ): void {
54 ▶     const cacheKey = componentId + '-' + name;
55 │     let trigger = this._triggerCache[cacheKey];
56 ▶     if (!trigger) {
57 │       const errors: Error[] = [];
58 │       const warnings: string[] = [];
59 ▶       const ast = buildAnimationAst(
60 │         this._driver,
61 │         metadata as AnimationMetadata,
62 │         errors,
63 │         warnings,
64 │       ) as TriggerAst;
65 ▶       if (errors.length) {
66 ▶         throw triggerBuildFailed(name, errors);
67 │       }
68 │       if (typeof ngDevMode === 'undefined' || ngDevMode) {
69 │         if (warnings.length) {
70 │           warnTriggerBuild(name, warnings);
71 │         }
72 │       }
73 ▶       trigger = buildTrigger(name, ast, this._normalizer);
74 ▶       this._triggerCache[cacheKey] = trigger;
75 │     }
76 ▶     this._transitionEngine.registerTrigger(namespaceId, name, trigger);
77 │   }
```

`AnimationEngine` は 2 つのエンジンの窓口です。40 行目の `TransitionAnimationEngine` が `[@trigger]` の状態の遷移を、41 行目の `TimelineAnimationEngine` が `AnimationBuilder` で作る手動のアニメーションを受け持ちます。`registerTrigger` は 54 行目の「型の ID - トリガー名」で 1 回だけ DSL を組み立て（59 行目の `buildAnimationAst` と 73 行目の `buildTrigger`）、65〜66 行目で DSL の誤りをまとめて投げます。同じ型の 2 つ目のインスタンスからは 74 行目のキャッシュを使い、76 行目で名前空間にだけ登録します。

### メタデータの無いコンポーネントもエンジンを通る

📄 `angular/packages/animations/browser/src/render/renderer.ts` L60–74 （▶ の行: 68–70）

```ts
60 │   createComment(value: string) {
61 │     return this.delegate.createComment(value);
62 │   }
63 │ 
64 │   createText(value: string) {
65 │     return this.delegate.createText(value);
66 │   }
67 │ 
68 ▶   appendChild(parent: any, newChild: any): void {
69 ▶     this.delegate.appendChild(parent, newChild);
70 ▶     this.engine.onInsert(this.namespaceId, newChild, parent, false);
71 │   }
72 │ 
73 │   insertBefore(parent: any, newChild: any, refChild: any, isMove: boolean = true): void {
74 │     this.delegate.insertBefore(parent, newChild, refChild);
```

📄 `angular/packages/animations/browser/src/render/renderer.ts` L138–161 （▶ の行: 139–140, 142, 156, 160）

```ts
138 │   setProperty(el: any, name: string, value: any): void {
139 ▶     if (name.charAt(0) == ANIMATION_PREFIX && name == DISABLE_ANIMATIONS_FLAG) {
140 ▶       this.disableAnimations(el, !!value);
141 │     } else {
142 ▶       this.delegate.setProperty(el, name, value);
143 │     }
144 │   }
145 │ 
146 │   setValue(node: any, value: string): void {
147 │     this.delegate.setValue(node, value);
148 │   }
149 │ 
150 │   listen(
151 │     target: any,
152 │     eventName: string,
153 │     callback: (event: any) => boolean | void,
154 │     options?: ListenerOptions,
155 │   ): () => void {
156 ▶     return this.delegate.listen(target, eventName, callback, options);
157 │   }
158 │ 
159 │   protected disableAnimations(element: any, value: boolean) {
160 ▶     this.engine.disableAnimations(element, value);
161 │   }
```

`BaseAnimationRenderer` でも、69〜70 行目のとおり `appendChild` のたびにエンジンへ `onInsert` を伝えます（`insertBefore` も同じ形で、`removeChild` は [第 17 回](17-animations-legacy-compat.md)で読みます）。親のアニメーションの `query(':enter')` が子の要素を見つけられるのは、この通知があるからです。一方 `setProperty` は、139 行目の `'@.disabled'` だけを 160 行目でエンジンに渡し、それ以外は 142 行目で DOM レンダラーへそのまま流します。`listen` も 156 行目で素通りです。

## 4. AnimationRenderer.setProperty が @ の名前を横取りする

📄 `angular/packages/animations/browser/src/render/renderer.ts` L164–187 （▶ の行: 177–180, 182, 185）

```ts
164 │ export class AnimationRenderer extends BaseAnimationRenderer implements Renderer2 {
165 │   constructor(
166 │     public factory: AnimationFactoryWithListenerCallback,
167 │     namespaceId: string,
168 │     delegate: Renderer2,
169 │     engine: AnimationEngine,
170 │     onDestroy?: () => void,
171 │   ) {
172 │     super(namespaceId, delegate, engine, onDestroy);
173 │     this.namespaceId = namespaceId;
174 │   }
175 │ 
176 │   override setProperty(el: any, name: string, value: any): void {
177 ▶     if (name.charAt(0) == ANIMATION_PREFIX) {
178 ▶       if (name.charAt(1) == '.' && name == DISABLE_ANIMATIONS_FLAG) {
179 ▶         value = value === undefined ? true : !!value;
180 ▶         this.disableAnimations(el, value as boolean);
181 │       } else {
182 ▶         this.engine.process(this.namespaceId, el, name.slice(1), value);
183 │       }
184 │     } else {
185 ▶       this.delegate.setProperty(el, name, value);
186 │     }
187 │   }
```

📄 `angular/packages/animations/browser/src/render/animation_engine_next.ts` L99–126 （▶ の行: 100–101, 103, 105, 117, 121, 124–125）

```ts
 99 │   process(namespaceId: string, element: any, property: string, value: any) {
100 ▶     if (property.charAt(0) == '@') {
101 ▶       const [id, action] = parseTimelineCommand(property);
102 │       const args = value as any[];
103 ▶       this._timelineEngine.command(id, element, action, args);
104 │     } else {
105 ▶       this._transitionEngine.trigger(namespaceId, element, property, value);
106 │     }
107 │   }
108 │ 
109 │   listen(
110 │     namespaceId: string,
111 │     element: any,
112 │     eventName: string,
113 │     eventPhase: string,
114 │     callback: (event: any) => any,
115 │   ): () => any {
116 │     // @@listen
117 ▶     if (eventName.charAt(0) == '@') {
118 │       const [id, action] = parseTimelineCommand(eventName);
119 │       return this._timelineEngine.listen(id, element, action, callback);
120 │     }
121 ▶     return this._transitionEngine.listen(namespaceId, element, eventName, eventPhase, callback);
122 │   }
123 │ 
124 ▶   flush(microtaskId: number = -1): void {
125 ▶     this._transitionEngine.flush(microtaskId);
126 │   }
```

1. **テンプレートの `[@open]="isOpen"`**

   コンパイラは `ɵɵproperty("@open", …)`、つまり `@open` という名前のプロパティのバインディングにします（`compiler-cli/test/compliance/test_cases/r3_view_compiler/legacy_animations/` の期待値）。変更検知でこの値が変わると、core はレンダラーの `setProperty(el, '@open', true)` を呼びます。
2. **177 行目：`@` で始まる**

   178〜180 行目、`[@.disabled]` ならその要素以下のアニメーションを止める印にします（`undefined` は `true` 扱い）。
3. **182 行目：`@` を取って `engine.process`**

   DOM には何も書きません。エンジンの 100 行目、名前がさらに `@` で始まる（元が `@@`）なら 103 行目で `AnimationBuilder` のタイムラインへの命令、そうでなければ 105 行目で `TransitionAnimationEngine.trigger` です。
4. **`trigger` は待ち行列に積むだけ**

   前の値と新しい値から遷移を探して積み、プレイヤー（アニメーションを操作するオブジェクト）は「まだ本物が無い」状態で返します（[第 16 回](16-animations-legacy-engine.md)）。動き出すのは 124〜125 行目の `flush` のときです。

### 旧エンジンを入れずに \[@open\] を書くと

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L462–471 （▶ の行: 467–470）

```ts
462 │   setProperty(el: any, name: string, value: any): void {
463 │     if (el == null) {
464 │       return;
465 │     }
466 │ 
467 ▶     (typeof ngDevMode === 'undefined' || ngDevMode) &&
468 ▶       this.throwOnSyntheticProps &&
469 ▶       checkNoSyntheticProp(name, 'property');
470 ▶     el[name] = value;
471 │   }
```

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L541–552 （▶ の行: 544–547）

```ts
541 │ const AT_CHARCODE = (() => '@'.charCodeAt(0))();
542 │ 
543 │ function checkNoSyntheticProp(name: string, nameKind: string) {
544 ▶   if (name.charCodeAt(0) === AT_CHARCODE) {
545 ▶     throw new RuntimeError(
546 ▶       RuntimeErrorCode.UNEXPECTED_SYNTHETIC_PROPERTY,
547 ▶       `Unexpected synthetic ${nameKind} ${name} found. Please make sure that:
548 │   - Make sure \`provideAnimationsAsync()\`, \`provideAnimations()\` or \`provideNoopAnimations()\` call was added to a list of providers used to bootstrap an application.
549 │   - There is a corresponding animation configuration named \`${name}\` defined in the \`animations\` field of the \`@Component\` decorator (see https://angular.dev/api/core/Component#animations).`,
550 │     );
551 │   }
552 │ }
```

普通の `DefaultDomRenderer2.setProperty` は、開発モード（`ngDevMode`）で `throwOnSyntheticProps` が `true` のとき、469 行目で名前を調べます。544 行目、先頭が `@` なら 545〜547 行目で `UNEXPECTED_SYNTHETIC_PROPERTY`（5105、表示は **NG05105**）を投げます。`listen` にも同じ確認があり、`(@open.done)` だけ書いても同じエラーになります。本番ビルドでは 467 行目が false なので投げず、470 行目で `el['@open'] = true` になるだけです。3 節のとおり、`provideAnimations()` を入れていても、そのコンポーネントに `animations` のメタデータが無ければ `BaseAnimationRenderer` が 142 行目で素通しするので、同じエラーになります。

## 5. listen：(@open.done) はエンジンのプレイヤーにつながる

📄 `angular/packages/animations/browser/src/render/renderer.ts` L189–211 （▶ の行: 195, 197, 201–202, 204–206）

```ts
189 │   override listen(
190 │     target: 'window' | 'document' | 'body' | any,
191 │     eventName: string,
192 │     callback: (event: any) => any,
193 │     options?: ListenerOptions,
194 │   ): () => void {
195 ▶     if (eventName.charAt(0) == ANIMATION_PREFIX) {
196 │       const element = resolveElementFromTarget(target);
197 ▶       let name = eventName.slice(1);
198 │       let phase = '';
199 │       // @listener.phase is for trigger animation callbacks
200 │       // @@listener is for animation builder callbacks
201 ▶       if (name.charAt(0) != ANIMATION_PREFIX) {
202 ▶         [name, phase] = parseTriggerCallbackName(name);
203 │       }
204 ▶       return this.engine.listen(this.namespaceId, element, name, phase, (event) => {
205 ▶         const countId = (event as any)['_data'] || -1;
206 ▶         this.factory.scheduleListenerCallback(countId, callback, event);
207 │       });
208 │     }
209 │     return this.delegate.listen(target, eventName, callback, options);
210 │   }
211 │ }
```

📄 `angular/packages/animations/browser/src/render/renderer.ts` L213–231 （▶ の行: 227–229）

```ts
213 │ function resolveElementFromTarget(target: 'window' | 'document' | 'body' | any): any {
214 │   switch (target) {
215 │     case 'body':
216 │       return document.body;
217 │     case 'document':
218 │       return document;
219 │     case 'window':
220 │       return window;
221 │     default:
222 │       return target;
223 │   }
224 │ }
225 │ 
226 │ function parseTriggerCallbackName(triggerName: string) {
227 ▶   const dotIndex = triggerName.indexOf('.');
228 ▶   const trigger = triggerName.substring(0, dotIndex);
229 ▶   const phase = triggerName.slice(dotIndex + 1);
230 │   return [trigger, phase];
231 │ }
```

195 行目で `@` を見て、197 行目で取り、202 行目と 226〜231 行目で `'open.done'` を `['open', 'done']` に分けます（201 行目、`@@` は `AnimationBuilder` 用なので分けない）。204 行目で `engine.listen` に登録し、エンジンからの呼び出しは 205〜206 行目で **利用者のコールバックを直接呼ばず**、工場の `scheduleListenerCallback` に回します。205 行目の `event['_data']` には、エンジンがプレイヤーを組み立てた flush の番号が入っています（第 16 回の `drainQueuedTransitions`）。

## 6. begin / end：変更検知の終わりに 1 回だけ flush する

📄 `angular/packages/animations/browser/src/render/animation_renderer.ts` L81–114 （▶ の行: 82, 89–90, 96–97, 102–103, 113）

```ts
 81 │   begin() {
 82 ▶     this._cdRecurDepth++;
 83 │     if (this.delegate.begin) {
 84 │       this.delegate.begin();
 85 │     }
 86 │   }
 87 │ 
 88 │   private _scheduleCountTask() {
 89 ▶     queueMicrotask(() => {
 90 ▶       this._microtaskId++;
 91 │     });
 92 │   }
 93 │ 
 94 │   /** @internal */
 95 │   scheduleListenerCallback(count: number, fn: (e: any) => any, data: any) {
 96 ▶     if (count >= 0 && count < this._microtaskId) {
 97 ▶       this._zone.run(() => fn(data));
 98 │       return;
 99 │     }
100 │ 
101 │     const animationCallbacksBuffer = this._animationCallbacksBuffer;
102 ▶     if (animationCallbacksBuffer.length == 0) {
103 ▶       queueMicrotask(() => {
104 │         this._zone.run(() => {
105 │           animationCallbacksBuffer.forEach((tuple) => {
106 │             const [fn, data] = tuple;
107 │             fn(data);
108 │           });
109 │           this._animationCallbacksBuffer = [];
110 │         });
111 │       });
112 │     }
113 ▶     animationCallbacksBuffer.push([fn, data]);
114 │   }
```

📄 `angular/packages/animations/browser/src/render/animation_renderer.ts` L116–130 （▶ の行: 117, 119–124, 127）

```ts
116 │   end() {
117 ▶     this._cdRecurDepth--;
118 │ 
119 ▶     // this is to prevent animations from running twice when an inner
120 ▶     // component does CD when a parent component instead has inserted it
121 ▶     if (this._cdRecurDepth == 0) {
122 ▶       this._zone.runOutsideAngular(() => {
123 ▶         this._scheduleCountTask();
124 ▶         this.engine.flush(this._microtaskId);
125 │       });
126 │     }
127 ▶     if (this.delegate.end) {
128 │       this.delegate.end();
129 │     }
130 │   }
```

1. **core が begin と end を呼ぶ**

   ビューの変更検知（`detectChangesInternal`）は、始める前に `rendererFactory.begin?.()`、終わったら `rendererFactory.end?.()` を呼びます（[boot-first-render](../boot/11-boot-first-render.md)）。`ApplicationRef` は、汚れたビューが無くて変更検知を飛ばした回にも begin と end を 1 回ずつ呼んで、残っているアニメーションを flush させます（[zoneless-tick](../zoneless/05-zoneless-tick.md)）。
2. **82 行目・117 行目：深さを数える**

   変更検知の中で別のビューの変更検知が始まると、begin が 2 回呼ばれます。121 行目、**一番外側の end（深さ 0）だけ**が先へ進みます。119〜120 行目のコメントのとおり、親が挿し込んだ子のビューで 2 回アニメーションしないためです。
3. **122〜124 行目：zone の外で flush**

   122 行目の `runOutsideAngular` の中で、123 行目で番号（`_microtaskId`）を 1 つ進める microtask を予約し（88〜92 行目）、124 行目でその時点の番号を渡して `engine.flush` します。flush の中でプレイヤーが作られ `play()` されます。zoneless のアプリでは `NgZone` は何もしない `NoopNgZone` なので、ここは関数をそのまま呼ぶだけです（[zoneless-default](../zoneless/01-zoneless-default.md)）。
4. **96〜97 行目：コールバックの呼び方を番号で決める**

   `(@open.done)` などがエンジンから来たとき、イベントの番号（5 節の `_data`）が今の `_microtaskId` より小さければ、その flush はもう終わった前の回なので、97 行目で zone の中ですぐ呼びます。同じ回の flush の中から来たもの（`play()` の中で呼ばれる `start` など）は、101〜113 行目で配列にためて、102〜103 行目の microtask でまとめて zone の中で呼びます。

## 7. 順番を光らせる（再現）

> **🧪 DEMO（再現）— setProperty('@open') → engine.process → end で flush**
>
> このサイトには `@angular/animations` が入っていないので、これは**再現**です。この章のコンポーネントに、`AnimationRendererFactory` の `begin` / `end`（animation\_renderer.ts 81〜130 行目）、`AnimationRenderer.setProperty`（renderer.ts 176〜187 行目）、`AnimationEngine.process`（animation\_engine\_next.ts 99〜107 行目）の「呼ぶ順番と条件」だけを小さな関数で写しました。遷移を DSL から解く部分は省き、flush のときに Web Animations API（`element.animate`）で箱の高さを 0.5 秒動かします。OS の設定で動きを減らしていても、このデモは動きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-legacy-setup)

「変更検知 1 回」では、1 → 2 → 3 → 2（`title` は普通のプロパティ）→ 4 → 5 の順に光り、箱が動くのは 4 の end のあとです。0.5 秒後に 6 が光り、`_data` が今の番号より小さいので「すぐに呼ぶ」になります（6 節の 96〜97 行目）。「入れ子」では、子の end のときは深さが 1 なので flush せず、親の end でだけ flush します（121 行目）。3 つ目のボタンは 4 節の NG05105 を、エラーの文言を写した関数で投げて捕まえています。

## 全体の流れ

- 👤 `bootstrapApplication(App, { providers: [provideAnimations()] })` — あなたの main.ts — *RendererFactory2 が AnimationRendererFactory に置き換わる*
  - `AnimationRendererFactory.createRenderer(host, type)` — animation\_renderer.ts 37 — *data.animation があれば namespace を登録して AnimationRenderer*
    - `AnimationEngine.registerTrigger()` — animation\_engine\_next.ts 47 — *buildAnimationAst → buildTrigger（第 15 回）*
- `detectChangesInternal()` — core / change\_detection.ts — *rendererFactory.begin()*
  - 👤 `[@open]="isOpen"` — テンプレート — *値が変わった*
    - `AnimationRenderer.setProperty(el, '@open', true)` — renderer.ts 176
      - `AnimationEngine.process()` — animation\_engine\_next.ts 99
        - `TransitionAnimationEngine.trigger()` — transition\_animation\_engine.ts — *待ち行列に積む（第 16 回）*
  - `AnimationRendererFactory.end()` — animation\_renderer.ts 116 — *深さ 0 のときだけ*
    - `AnimationEngine.flush(microtaskId)` — animation\_engine\_next.ts 124 — *プレイヤーを作って play（第 16 回）*
      - `scheduleListenerCallback()` — animation\_renderer.ts 95 — *(@open.done) を呼ぶ*

## テストと直し方

この章の仕組みの spec は 2 か所です。`packages/platform-browser/animations/test/animation_renderer_spec.ts`（`describe('AnimationRenderer')` と `describe('AnimationRendererFactory')` ほか、it が 16 本）と、`packages/core/test/legacy_animation/legacy_animation_integration_spec.ts` の `describe('errors for not using the animation module')`（it が 4 本）です。どちらも先頭の `if (isNode) return;` などで Node では中身が走りません。

📄 `angular/packages/platform-browser/animations/test/animation_renderer_spec.ts` L341–368 （▶ の行: 341, 344–345, 362–363, 367）

```ts
341 ▶     it('should provide hooks at the start and end of change detection', () => {
342 │       @Component({
343 │         selector: 'my-cmp',
344 ▶         template: ` <div [@myAnimation]="exp"></div> `,
345 ▶         animations: [trigger('myAnimation', [])],
346 │         standalone: false,
347 │       })
348 │       class Cmp {
349 │         public exp: any;
350 │       }
351 │ 
352 │       TestBed.configureTestingModule({
353 │         providers: [{provide: AnimationEngine, useClass: InjectableAnimationEngine}],
354 │         declarations: [Cmp],
355 │       });
356 │ 
357 │       const renderer = TestBed.inject(RendererFactory2) as ExtendedAnimationRendererFactory;
358 │       const fixture = TestBed.createComponent(Cmp);
359 │       const cmp = fixture.componentInstance;
360 │ 
361 │       renderer.log = [];
362 ▶       fixture.changeDetectorRef.detectChanges();
363 ▶       expect(renderer.log).toEqual(['begin', 'end']);
364 │ 
365 │       renderer.log = [];
366 │       fixture.changeDetectorRef.detectChanges();
367 ▶       expect(renderer.log).toEqual(['begin', 'end']);
368 │     });
```

341 行目の it は、`[@myAnimation]` のあるコンポーネントで `detectChanges()` を 1 回呼ぶと、工場の `begin` と `end` がちょうど 1 回ずつ呼ばれること（363 行目・367 行目）を確かめます。6 節の入口です。

📄 `angular/packages/core/test/legacy_animation/legacy_animation_integration_spec.ts` L4589–4621 （▶ の行: 4590, 4593, 4600–4601, 4605, 4608, 4617–4618）

```ts
4589 │       describe('when modules are missing', () => {
4590 ▶         it('should throw when using an @prop binding without the animation module', () => {
4591 │           @Component({
4592 │             changeDetection: ChangeDetectionStrategy.Eager,
4593 ▶             template: `<div [@myAnimation]="true"></div>`,
4594 │             standalone: false,
4595 │           })
4596 │           class Cmp {}
4597 │ 
4598 │           TestBed.configureTestingModule({declarations: [Cmp]});
4599 │           const comp = TestBed.createComponent(Cmp);
4600 ▶           expect(() => comp.detectChanges()).toThrowError(
4601 ▶             syntheticPropError('@myAnimation', 'property'),
4602 │           );
4603 │         });
4604 │ 
4605 ▶         it('should throw when using an @prop listener without the animation module', () => {
4606 │           @Component({
4607 │             changeDetection: ChangeDetectionStrategy.Eager,
4608 ▶             template: `<div (@myAnimation.start)="a = true"></div>`,
4609 │             standalone: false,
4610 │           })
4611 │           class Cmp {
4612 │             a = false;
4613 │           }
4614 │ 
4615 │           TestBed.configureTestingModule({declarations: [Cmp]});
4616 │ 
4617 ▶           expect(() => TestBed.createComponent(Cmp)).toThrowError(
4618 ▶             syntheticPropError('@myAnimation.start', 'listener'),
4619 │           );
4620 │         });
4621 │       });
```

4600〜4601 行目は 4 節の `setProperty` の確認、4617〜4618 行目は `listen` の確認です。プロパティは `detectChanges()` のとき、リスナーは `createComponent` のとき（リスナーは作成時に登録される）に投げることも、この 2 本で分かります。同じファイルの次の `describe('when modules are present, but animations are missing')` の 2 本は、3 節の「メタデータが無いと `BaseAnimationRenderer` が素通しする」場合です。

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/platform-browser/animations/test:test_web_chromium \
  --test_output=all --nocache_test_results

# it の数を数える（noop_animations_module_spec.ts は関数の中の 2 本を 3 つの describe から呼ぶ）
grep -cE "^\s*(it|fit)\(" packages/platform-browser/animations/test/*.ts
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Chromium: |██████████████████████████████| 1/1 test files | 21 passed, 0 failed, 1 skipped
Finished running tests in 0.4s, all tests passed!
INFO: Elapsed time: 1.603s, Critical Path: 0.94s
//packages/platform-browser/animations/test:test_web_chromium            PASSED in 0.8s

packages/platform-browser/animations/test/animation_renderer_spec.ts:16
packages/platform-browser/animations/test/noop_animations_module_spec.ts:2
```

1. **数が合うか**

   grep で数えると it は 16 + 2 = 18 本ですが、`noop_animations_module_spec.ts` は 2 本の it を持つ関数 `noopAnimationTests()` を `NoopAnimationsModule`・`BrowserAnimationsModule.withConfig({disableAnimations: true})`・`provideNoopAnimations()` の 3 つの describe から呼ぶので 6 本になり、16 + 6 = 22 本です。結果の 21 passed + 1 skipped と合います。skipped の 1 本は、本体の無い `it('should only create a trigger definition once even if the registered multiple times')`（jasmine では「保留」になる）です。
2. **legacy\_animation の spec**

   `core/test/legacy_animation/` の 4 ファイル（it が 100 + 55 + 5 + 10 本）は `//packages/core/test:test_web_chromium` に入っていて、2026-11-01 にシリーズの準備で走らせた結果は 1591 passed・4 skipped でした。ターゲット全体が走るので、1 本だけ見たいときは作業コピーで `it` を `fit` に変えます（このシリーズでは ../angular を変えないので、試していません）。
3. **直すとしたら**

   プロバイダの組み合わせは `platform-browser/animations/src/providers.ts`、非同期の読み込みは `async/src/async_animation_renderer.ts`（spec は `async/test/animation_renderer_spec.ts`、ブラウザ版 15 passed・1 skipped）、横取りと flush の時期は `animations/browser/src/render/animation_renderer.ts` と `renderer.ts` です。振る舞いのテストは `platform-browser/animations/test/animation_renderer_spec.ts` に、テンプレートを通した結果は `core/test/legacy_animation/legacy_animation_integration_spec.ts` に足します。ただし旧パッケージは v23 で消す予定（`@deprecated ... Intent to remove in v23`）なので、変更の多くは「消す準備」です（[第 20 回](20-animations-issues.md)）。

## 聞かれそうな質問

**Q. provideAnimationsAsync だと、最初の数フレームはどうなりますか？**

旧エンジンのチャンクが届くまで、コンポーネントは普通の DOM レンダラーを包んだ `DynamicDelegationRenderer` で描かれます（2 節の 120〜133 行目）。`[@open]` は 128〜129 行目で例外を止めたうえで `el['@open']` に書かれるだけで、状態のスタイルもアニメーションも付きません。その呼び出しは 289〜290 行目で記録され、届いたあと 199〜200 行目で旧エンジンのレンダラーに流し直されます。読み込みが始まるのは、`animations` のメタデータを持つコンポーネントが最初に作られたとき（137 行目）です。

**Q. NoopAnimationsModule は何を止めるのですか？**

止めるのは **ドライバーだけ**です。1 節の 75 行目で `AnimationDriver` が `NoopAnimationDriver` になり、プレイヤーは画面を動かさずにすぐ終わるもの（`NoopAnimationPlayer`。[第 16 回](16-animations-legacy-engine.md)）になります。エンジン（63 行目）とレンダラーの差し替え（64〜67 行目）は同じなので、`setProperty` の横取り、待ち行列、flush、`(@open.start)` / `(@open.done)` のコールバック、leave の要素を消す判断はそのまま走ります。テストで「done が呼ばれる」ことを確かめられるのはこのためです。

**Q. animations のメタデータの無いコンポーネントもエンジンを通りますか？**

通ります。3 節の 43〜59 行目で `BaseAnimationRenderer` を渡され、要素の挿入（69〜70 行目）と削除はエンジンに伝わります。親のアニメーションが子の要素を `query` したり、消すのを待ったりできるのはこのためです。ただし `setProperty` と `listen` は横取りしないので、そこに `[@x]` を書くと DOM レンダラーが NG05105 を投げます（4 節）。

**Q. ANIMATION\_MODULE\_TYPE は何に使われますか？**

どちらの組み合わせが入っているかを、旧パッケージ以外のコードが知るための文字列です（`'BrowserAnimations'` か `'NoopAnimations'`。1 節の 76 行目と 94〜97 行目）。angular/components では `material/core/animation/animation.ts` と `cdk/overlay/overlay.ts` が inject しています。トークン自体は `@angular/core` のもので、`@angular/platform-browser/animations` は再 export しているだけです。

## 読み終えて

- `provideAnimations()` / `BrowserAnimationsModule` と `provideNoopAnimations()` / `NoopAnimationsModule` の違いは、`AnimationDriver` と `ANIMATION_MODULE_TYPE` の 2 つだけ。エンジンとレンダラーの差し替えは共通。
- `RendererFactory2` が `AnimationRendererFactory` に置き換わり、`animations` を持つコンポーネントには `AnimationRenderer`、持たないものには `BaseAnimationRenderer` が渡る。
- `setProperty(el, '@open', v)` は DOM に書かず `engine.process` → 待ち行列に積むだけ。動き出すのは一番外側の `end()` の `engine.flush`。
- `provideAnimationsAsync()` はエンジンを provide せず、最初に必要になったとき `import('@angular/animations/browser')` で読み、それまでの `@` の呼び出しを記録して流し直す。
- エンジンが無いのに `[@x]` を書くと、開発モードの DOM レンダラーが NG05105 を投げる。テストは `legacy_animation_integration_spec.ts` の 4590〜4620 行目。

---

← 前: [スタイルの後片付け：leave の間はコンポーネントの CSS を消さない](13-animations-styles-teardown.md)  
次: [旧 DSL がキーフレームになるまで：trigger から timeline へ](15-animations-legacy-dsl.md) →
