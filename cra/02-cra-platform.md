[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 2 回 / 全 10 回

# platform と bootstrap の説明文

> platform/platform.ts・platform\_ref.ts・bootstrap.ts・application/platform\_tokens.ts・application\_ngmodule\_factory\_compiler.ts の未読の行：createPlatform・destroyPlatform・PlatformRef.bootstrapModule の options（v21 から読まれない ngZone）、PLATFORM\_INITIALIZER と SSR の 3 つのトークンの説明と、何度 platform を作れて何度 bootstrap できるか。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-platform)

---

この章で分かること：`PlatformRef`・`createPlatform`・`createPlatformFactory`・`getPlatform`・`destroyPlatform`・`providePlatformInitializer`・`PlatformRef.bootstrapModule` の options（`BootstrapOptions`）と、SSR の 3 つのトークンの説明文が約束していることと、それが本物でそのとおりに動くか。何度 platform を作れて、何度 bootstrap できるか。結果として、`bootstrapModule` の `ngZone`・`ngZoneEventCoalescing`・`ngZoneRunCoalescing` は今は何も読まれないこと、`createPlatform` に PlatformRef を作れない注入器を渡すと以後ずっと platform を作れなくなることが、説明文と合いませんでした。

読む対象は `packages/core/src/platform/` の `platform.ts`・`platform_ref.ts`・`bootstrap.ts`・`platform_core_providers.ts`・`platform_destroy_listeners.ts` と、`application/` の `platform_tokens.ts`・`application_ngmodule_factory_compiler.ts`、`application_ref.ts` の `BootstrapOptions`、`application_tokens.ts` の `PLATFORM_INITIALIZER` です（../angular、8576f161ae4）。`bootstrapModule` の全手順は[bootstrapModule の章](../ngmodule/11-ngmodule-bootstrap-module.md)、platform の注入器と環境の注入器の 2 段は[2 段の DI 木の章](../boot/08-boot-injectors.md)、`bootstrap()` の中身は[bootstrapApplication の中身の章](../boot/07-boot-bootstrap-application.md)にあるので、ここでは繰り返さずに行だけ指します。

1. [1. ApplicationRef](01-cra-app-ref.md)
2. **2. platform と bootstrap**（この章）
3. [3. ViewContainerRef](03-cra-view-container.md)
4. [4. QueryList・DestroyRef](04-cra-linker-misc.md)
5. [5. input・model・output](05-cra-signal-io.md)
6. [6. signal のクエリ](06-cra-signal-queries.md)
7. [7. NgZone・ErrorHandler](07-cra-zone-errors.md)
8. [8. DebugElement](08-cra-debug.md)
9. [9. サニタイズ](09-cra-sanitize.md)
10. [10. spec と issue](10-cra-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> platform は「ページに 1 つの土台」です。`PlatformRef` と、ページのすべてのアプリの親になる注入器（platform の注入器）を持ちます。`bootstrapApplication` を呼ぶと、無ければ作り、あれば使い回します。platform を作り直したり壊したりすると、このページのアプリが壊れるので、この章のデモは platform を読むだけにし、作る・壊すは Node で動かした記録で見せます。

## 1. PlatformRef の説明文：「1 ページに 1 つ」

📄 `angular/packages/core/src/platform/platform_ref.ts` L23–46 （▶ の行: 24–28, 32, 34, 44–45）

```ts
23 │ /**
24 ▶  * The Angular platform is the entry point for Angular on a web page.
25 ▶  * Each page has exactly one platform. Services (such as reflection) which are common
26 ▶  * to every Angular application running on the page are bound in its scope.
27 ▶  * A page's platform is initialized implicitly when a platform is created using a platform
28 ▶  * factory such as `PlatformBrowser`, or explicitly by calling the `createPlatform()` function.
29 │  *
30 │  * @publicApi
31 │  */
32 ▶ @Injectable({providedIn: 'platform'})
33 │ export class PlatformRef {
34 ▶   private _modules: NgModuleRef<any>[] = [];
35 │   private _destroyListeners: Array<() => void> = [];
36 │   private _destroyed: boolean = false;
37 │ 
38 │   /** @internal */
39 │   constructor(private _injector: Injector) {}
40 │ 
41 │   /**
42 │    * Creates an instance of an `@NgModule` for the given platform.
43 │    *
44 ▶    * @deprecated Passing NgModule factories as the `PlatformRef.bootstrapModuleFactory` function
45 ▶    *     argument is deprecated. Use the `PlatformRef.bootstrapModule` API instead.
46 │    */
```

25 行目「各ページに platform はちょうど 1 つ」は、ブラウザーでは合っていました。DEMO の 1 つ目の表で `platformBrowser()` を 2 回呼ぶと同じ `PlatformRef` が返りました。32 行目の `providedIn: 'platform'` で、`PlatformRef` は platform の注入器にだけ作られます。サーバーの上（`ngServerMode` が `true`）では違い、同じ factory を 2 回呼ぶと別の platform が 2 つできました（5 つ目の表）。リクエストごとに platform を分けるためで、4 節で読みます。

📄 `angular/packages/core/src/platform/platform_ref.ts` L103–122 （▶ の行: 104, 107–108, 112–113, 115, 120–121）

```ts
103 │ 
104 ▶   /**
105 │    * Registers a listener to be called when the platform is destroyed.
106 │    */
107 ▶   onDestroy(callback: () => void): void {
108 ▶     this._destroyListeners.push(callback);
109 │   }
110 │ 
111 │   /**
112 ▶    * Retrieves the platform {@link Injector}, which is the parent injector for
113 ▶    * every Angular application on the page and provides singleton providers.
114 │    */
115 ▶   get injector(): Injector {
116 │     return this._injector;
117 │   }
118 │ 
119 │   /**
120 ▶    * Destroys the current Angular platform and all Angular applications on the page.
121 ▶    * Destroys all modules and listeners registered with the platform.
122 │    */
```

📄 `angular/packages/core/src/platform/platform_ref.ts` L141–149 （▶ の行: 143, 145–146）

```ts
141 │ 
142 │   /**
143 ▶    * Indicates whether this instance was destroyed.
144 │    */
145 ▶   get destroyed() {
146 ▶     return this._destroyed;
147 │   }
148 │ }
149 │ 
```

112〜113 行目のとおり、platform の注入器はページのアプリの注入器の親で、このページの章から `inject(PLATFORM_ID)` すると、platform の注入器にある `'browser'` が返りました（DEMO のページの表）。107 行目の `onDestroy` は戻り値が `void` で、`ApplicationRef.onDestroy`（登録を外す関数を返す、[第 1 回](01-cra-app-ref.md)の 6 節）と違い、一度入れたら外せません。120〜121 行目の「ページのすべてのアプリを壊す」は、`_modules` に入ったモジュール（`bootstrapModule` で作ったもの）と、次の `PLATFORM_DESTROY_LISTENERS` に登録されたアプリ（`bootstrapApplication`・`createApplication` で作ったもの）を壊します。

📄 `angular/packages/core/src/platform/platform_destroy_listeners.ts` L9–19 （▶ の行: 12–15, 17）

```ts
 9 │ import {InjectionToken} from '../di';
10 │ 
11 │ /**
12 ▶  * Internal token that allows to register extra callbacks that should be invoked during the
13 ▶  * `PlatformRef.destroy` operation. This token is needed to avoid a direct reference to the
14 ▶  * `PlatformRef` class (i.e. register the callback via `PlatformRef.onDestroy`), thus making the
15 ▶  * entire class tree-shakeable.
16 │  */
17 ▶ export const PLATFORM_DESTROY_LISTENERS = new InjectionToken<Set<VoidFunction>>(
18 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'PlatformDestroyListeners' : '',
19 │ );
```

12〜15 行目のとおり、このトークンは `PlatformRef` を名前で参照せずに destroy の処理を足すためのものです。`bootstrap()` がアプリの環境の注入器の destroy を Set に足し（bootstrap.ts L117〜119、[bootstrapApplication の中身の章](../boot/07-boot-bootstrap-application.md)）、`PlatformRef.destroy` が Set を順に呼びます（platform\_ref.ts L133〜137）。DEMO の 1 つ目の表で `destroyPlatform()` のあと、`bootstrapApplication` で作ったアプリの `destroyed` は `true` でした。

## 2. createPlatform：2 つ目は NG0400、作れない注入器を渡すと戻れない

📄 `angular/packages/core/src/platform/platform.ts` L29–41 （▶ の行: 29, 33–34, 38–41）

```ts
29 ▶ let _platformInjector: Injector | null = null;
30 │ let _unregisterAiTools: (() => void) | null = null;
31 │ 
32 │ /**
33 ▶  * Creates a platform.
34 ▶  * Platforms must be created on launch using this function.
35 │  *
36 │  * @publicApi
37 │  */
38 ▶ export function createPlatform(injector: Injector): PlatformRef {
39 ▶   if (getPlatform()) {
40 ▶     throw new RuntimeError(
41 ▶       RuntimeErrorCode.MULTIPLE_PLATFORMS,
```

📄 `angular/packages/core/src/platform/platform.ts` L51–59 （▶ の行: 54, 56–58）

```ts
51 │ 
52 │   // During SSR, using this setting and using an injector from the global can cause the
53 │   // injector to be used for a different requjest due to concurrency.
54 ▶   _platformInjector = typeof ngServerMode === 'undefined' || !ngServerMode ? injector : null;
55 │ 
56 ▶   const platform = injector.get(PlatformRef);
57 ▶   runPlatformInitializers(injector);
58 ▶   return platform;
59 │ }
```

33〜34 行目は「platform は起動のときにこの関数で作る」とだけ書きます。普段は自分では呼ばず、`platformBrowser()` などの factory（3 節）が呼びます。platform がすでにあるときに呼ぶと、39〜44 行目のとおり NG0400「There can be only one platform. Destroy the previous one to create a new one.」でした（本番は `NG0400` だけ）。

説明文は、どんな注入器を渡すかを書いていません。`PlatformRef` は `providedIn: 'platform'` なので、platform の scope（`INJECTOR_SCOPE` が `'platform'`、factory が作る注入器だけが持つ、L101〜110）の無い注入器を渡すと、56 行目の `injector.get(PlatformRef)` が NG0201 を投げます。ところが、その前の 54 行目で、渡した注入器をもう `_platformInjector` に入れています。そのあと `getPlatform()` は `_platformInjector.get(PlatformRef)`（L147）で毎回 NG0201 を投げ、`platformBrowser()` も `destroyPlatform()` も最初に `getPlatform()` を呼ぶので、同じ例外になりました（DEMO の 1 つ目の表の最後の行）。そのプロセス（ブラウザーならそのページ）では、二度と platform を作れません。この順は 51ed3b510d4（2023-12-07）でこのファイルに移ったときからで、新しい本家（origin/main の d201dd76ef2、2026-11-20）でも同じです。

## 3. createPlatformFactory と platformCore

📄 `angular/packages/core/src/platform/platform.ts` L61–78 （▶ の行: 62–65, 67–68, 77–78）

```ts
61 │ /**
62 ▶  * Creates a factory for a platform. Can be used to provide or override `Providers` specific to
63 ▶  * your application's runtime needs, such as `PLATFORM_INITIALIZER` and `PLATFORM_ID`.
64 ▶  * @param parentPlatformFactory Another platform factory to modify. Allows you to compose factories
65 ▶  * to build up configurations that might be required by different libraries or parts of the
66 │  * application.
67 ▶  * @param name Identifies the new platform factory.
68 ▶  * @param providers A set of dependency providers for platforms created with the new factory.
69 │  *
70 │  * @publicApi
71 │  */
72 │ export function createPlatformFactory(
73 │   parentPlatformFactory: ((extraProviders?: StaticProvider[]) => PlatformRef) | null,
74 │   name: string,
75 │   providers: StaticProvider[] = [],
76 │ ): (extraProviders?: StaticProvider[]) => PlatformRef {
77 ▶   const desc = `Platform: ${name}`;
78 ▶   const marker = new InjectionToken(desc);
```

📄 `angular/packages/core/src/platform/platform_core_providers.ts` L9–20 （▶ の行: 15, 19–20）

```ts
 9 │ import {StaticProvider} from '../di';
10 │ 
11 │ import {createPlatformFactory} from './platform';
12 │ import {PlatformRef} from './platform_ref';
13 │ 
14 │ /**
15 ▶  * This platform has to be included in any other platform
16 │  *
17 │  * @publicApi
18 │  */
19 ▶ export const platformCore: (extraProviders?: StaticProvider[] | undefined) => PlatformRef =
20 ▶   createPlatformFactory(null, 'core', []);
```

factory の中身（L79〜94）は[bootstrapModule の章](../ngmodule/11-ngmodule-bootstrap-module.md)が読んでいます。platform が無ければ作り、あれば `assertPlatform(marker)` で「その factory の印を持つ platform か」を確かめて返します。15 行目「この platform はほかのどの platform にも含めなければならない」のとおり、`platformBrowser` は `createPlatformFactory(platformCore, 'browser', ...)` です（platform-browser の browser.ts L237）。

説明文に無い振る舞いが 1 つあります。`platformBrowser()` の platform があるときに `platformCore()` を呼ぶと、開発モードでも本番でも今の platform がそのまま返りました。`platformBrowser` の platform は `platformCore` の印も持つからです（親の factory に自分の印を足した provider を渡す、L82〜89）。印を持たないトークンで `assertPlatform` を呼ぶと、開発モードは NG0400「A platform with a different configuration has been created. Please destroy it first.」、本番は確かめずに今の platform を返しました。次の 123〜131 行目の確かめが `ngDevMode` の中だけにあるからです。

## 4. assertPlatform・getPlatform・destroyPlatform

📄 `angular/packages/core/src/platform/platform.ts` L111–141 （▶ の行: 113, 119–120, 123–125, 127–129, 137–138）

```ts
111 │ 
112 │ /**
113 ▶  * Checks that there is currently a platform that contains the given token as a provider.
114 │  *
115 │  * @publicApi
116 │  */
117 │ export function assertPlatform(requiredToken: any): PlatformRef {
118 │   const platform = getPlatform();
119 ▶   if (!platform) {
120 ▶     throw new RuntimeError(RuntimeErrorCode.PLATFORM_NOT_FOUND, ngDevMode && 'No platform exists!');
121 │   }
122 │ 
123 ▶   if (
124 ▶     (typeof ngDevMode === 'undefined' || ngDevMode) &&
125 ▶     !platform.injector.get(requiredToken, null)
126 │   ) {
127 ▶     throw new RuntimeError(
128 ▶       RuntimeErrorCode.MULTIPLE_PLATFORMS,
129 ▶       'A platform with a different configuration has been created. Please destroy it first.',
130 │     );
131 │   }
132 │ 
133 │   return platform;
134 │ }
135 │ 
136 │ /**
137 ▶  * Returns the current platform in the browser environment. In the server environment,
138 ▶  * returns `null`. If you need access to the platform information, inject `PlatformRef` in your application.
139 │  *
140 │  * @publicApi
141 │  */
```

📄 `angular/packages/core/src/platform/platform.ts` L149–166 （▶ の行: 151–152, 154, 159, 164）

```ts
149 │ 
150 │ /**
151 ▶  * Destroys the current Angular platform and all Angular applications on the page.
152 ▶  * Destroys all modules and listeners registered with the platform.
153 │  *
154 ▶  * This function should not be used in a server environment, as it will be a no-op.
155 │  *
156 │  * @publicApi
157 │  */
158 │ export function destroyPlatform(): void {
159 ▶   if (typeof ngDevMode !== 'undefined' && ngDevMode) {
160 │     _unregisterAiTools?.();
161 │     _unregisterAiTools = null;
162 │   }
163 │ 
164 ▶   getPlatform()?.destroy();
165 │ }
166 │ 
```

137〜138 行目「サーバーでは `null`」は、`ngServerMode` を `true` にした Node の記録で `null` でした。サーバーでは platform の注入器をモジュールの変数に入れず（L54・L187〜189）、リクエストごとの platform を `BootstrapContext`（`bootstrapApplication` の 3 つ目の引数）で渡します。これは 28926ba92cf（2025-09-08、``feat(core): introduce `BootstrapContext` for improved server bootstrapping (#63562)``、v21）からです。154 行目「サーバーでは何もしない」も、`destroyPlatform()` のあと platform の `destroyed` は `false` のままでした。

ブラウザーでは 151〜152 行目のとおりでした。`destroyPlatform()` で platform の `onDestroy` が呼ばれ、アプリも platform も `destroyed` になり、`getPlatform()` は `null` に戻りました。もう一度 `destroyPlatform()` を呼んでも 164 行目の `?.` で何もしません。一方、壊れた `PlatformRef` の `destroy()` をもう一度呼ぶと NG0404「The platform has already been destroyed!」です（platform\_ref.ts L124〜129）。壊したあとは新しい platform を作れました。

## 5. PLATFORM\_INITIALIZER と providePlatformInitializer

📄 `angular/packages/core/src/application/application_tokens.ts` L72–84 （▶ の行: 73, 75, 77, 81）

```ts
72 │ /**
73 ▶  * A function that is executed when a platform is initialized.
74 │  *
75 ▶  * @deprecated from v19.0.0, use providePlatformInitializer instead
76 │  *
77 ▶  * @see {@link providePlatformInitializer}
78 │  *
79 │  * @publicApi
80 │  */
81 ▶ export const PLATFORM_INITIALIZER = new InjectionToken<ReadonlyArray<() => void>>(
82 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'Platform Initializer' : '',
83 │ );
84 │ 
```

📄 `angular/packages/core/src/platform/platform.ts` L195–221 （▶ の行: 198–199, 201, 204, 207, 209, 214, 216–218）

````ts
195 │ 
196 │ /**
197 │  * @description
198 ▶  * This function is used to provide initialization functions that will be executed upon
199 ▶  * initialization of the platform injector.
200 │  *
201 ▶  * Note that the provided initializer is run in the injection context.
202 │  *
203 │  * @usageNotes
204 ▶  * The platform initializer should be provided during platform creation:
205 │  *
206 │  * ```ts
207 ▶  * const platformRef = platformBrowser([ providePlatformInitializer(() =>  ...) ]);
208 │  *
209 ▶  * bootstrapApplication(App, appConfig, { platformRef })
210 │  * ```
211 │  *
212 │  * @publicApi
213 │  */
214 ▶ export function providePlatformInitializer(initializerFn: () => void): StaticProvider {
215 │   return {
216 ▶     provide: PLATFORM_INITIALIZER,
217 ▶     useValue: initializerFn,
218 ▶     multi: true,
219 │   };
220 │ }
221 │ 
````

198〜201 行目「platform の注入器ができたときに、注入の文脈で呼ぶ」のとおり、DEMO の 2 つ目の表で 3 つの初期化関数は provider の順に、`platformBrowser(...)` から戻る前に呼ばれ、中で `inject(PLATFORM_ID)` ができました（`runPlatformInitializers`、L222〜227）。`PLATFORM_INITIALIZER` の provider と `providePlatformInitializer`（216〜218 行目、`multi: true` の provider を作るだけ）は混ぜても同じ並びです。75 行目のとおりトークンは v19 から deprecated です。

204 行目の「platform を作るときに渡す」は大事な条件で、platform があるときに `platformBrowser([providePlatformInitializer(f)])` と渡すと、`f` は呼ばれず、例外も警告もありませんでした。factory は platform があれば渡された provider を見ずに返すからです（L80〜81）。207 行目の例の `() => ...` は省略の印で、そのまま tsc にかけると「TS1109: Expression expected.」です。`...` を `{}` にすると strict の tsc に通り、Node でも 209 行目の形で `bootstrapApplication` が同じ platform の上に作れました。`multi` を付けずに `PLATFORM_INITIALIZER` を渡すと、開発モードは「Cannot mix multi providers and regular providers」（platform-browser が自分の初期化関数を multi で置いているため）、本番は「inits?.forEach is not a function」でした。

## 6. bootstrapModule の options：ngZone も coalescing も読まれない

📄 `angular/packages/core/src/platform/platform_ref.ts` L70–86 （▶ の行: 72, 78–79, 83）

````ts
70 │ 
71 │   /**
72 ▶    * Creates an instance of an `@NgModule` for a given platform.
73 │    *
74 │    * @usageNotes
75 │    * ### Simple Example
76 │    *
77 │    * ```ts
78 ▶    * @NgModule({
79 ▶    *   imports: [BrowserModule]
80 │    * })
81 │    * class MyModule {}
82 │    *
83 ▶    * let moduleRef = platformBrowser().bootstrapModule(MyModule);
84 │    * ```
85 │    *
86 │    */
````

📄 `angular/packages/core/src/application/application_ref.ts` L87–104 （▶ の行: 88, 91, 95, 97–99, 101, 103）

```ts
 87 │ /**
 88 ▶  * Provides additional options to the bootstrapping process.
 89 │  *
 90 │  * @publicApi
 91 ▶  * @deprecated 20.2 Configure `NgZone` in the `providers` array of the application module instead.
 92 │  */
 93 │ export interface BootstrapOptions {
 94 │   /**
 95 ▶    * Optionally specify which `NgZone` should be used when not configured in the providers.
 96 │    *
 97 ▶    * - Provide your own `NgZone` instance.
 98 ▶    * - `zone.js` - Use default `NgZone` which requires `Zone.js`.
 99 ▶    * - `noop` - Use `NoopNgZone` which does nothing.
100 │    *
101 ▶    * @deprecated BootstrapOptions is deprecated. Provide `NgZone` in the `providers` array of the module instead.
102 │    */
103 ▶   ngZone?: NgZone | 'zone.js' | 'noop';
104 │ 
```

📄 `angular/packages/core/src/application/application_ref.ts` L105–128 （▶ の行: 106, 115–118, 120, 122–123, 126, 128）

````ts
105 │   /**
106 ▶    * Optionally specify coalescing event change detections or not.
107 │    * Consider the following case.
108 │    *
109 │    * ```html
110 │    * <div (click)="doSomething()">
111 │    *   <button (click)="doSomethingElse()"></button>
112 │    * </div>
113 │    * ```
114 │    *
115 ▶    * When button is clicked, because of the event bubbling, both
116 ▶    * event handlers will be called and 2 change detections will be
117 ▶    * triggered. We can coalesce such kind of events to only trigger
118 ▶    * change detection only once.
119 │    *
120 ▶    * By default, this option will be false. So the events will not be
121 │    * coalesced and the change detection will be triggered multiple times.
122 ▶    * And if this option be set to true, the change detection will be
123 ▶    * triggered async by scheduling a animation frame. So in the case above,
124 │    * the change detection will only be triggered once.
125 │    *
126 ▶    * @deprecated BootstrapOptions is deprecated. Use `provideZoneChangeDetection` instead to configure coalescing.
127 │    */
128 ▶   ngZoneEventCoalescing?: boolean;
````

📄 `angular/packages/core/src/application/application_ref.ts` L129–160 （▶ の行: 131–132, 143–145, 147, 149, 155–157, 159）

````ts
129 │ 
130 │   /**
131 ▶    * Optionally specify if `NgZone#run()` method invocations should be coalesced
132 ▶    * into a single change detection.
133 │    *
134 │    * Consider the following case.
135 │    * ```ts
136 │    * for (let i = 0; i < 10; i ++) {
137 │    *   ngZone.run(() => {
138 │    *     // do something
139 │    *   });
140 │    * }
141 │    * ```
142 │    *
143 ▶    * This case triggers the change detection multiple times.
144 ▶    * With ngZoneRunCoalescing options, all change detections in an event loop trigger only once.
145 ▶    * In addition, the change detection executes in requestAnimation.
146 │    *
147 ▶    * @deprecated BootstrapOptions is deprecated. Use `provideZoneChangeDetection` instead to configure coalescing.
148 │    */
149 ▶   ngZoneRunCoalescing?: boolean;
150 │ }
151 │ 
152 │ /** Maximum number of times ApplicationRef will refresh all attached views in a single tick. */
153 │ const MAXIMUM_REFRESH_RERUNS = 10;
154 │ 
155 ▶ export function optionsReducer<T extends Object>(dst: T, objs: T | T[]): T {
156 ▶   if (Array.isArray(objs)) {
157 ▶     return objs.reduce(optionsReducer, dst);
158 │   }
159 ▶   return {...dst, ...objs};
160 │ }
````

95〜99 行目は「providers で設定していなければ、どの `NgZone` を使うかをこれで選ぶ」、120〜124 行目と 144〜145 行目は「`true` なら変更検知をまとめる」と書きます。今の実装はこの 3 つを読みません。`bootstrapModuleFactory`（L47〜69）が作る provider は `provideZonelessChangeDetectionInternal()` と `applicationProviders` だけで、`options.ngZone` を見る行がありません。DEMO の 3 つ目の表は zone.js を読んだ Node の記録です。`ngZone: 'zone.js'` も、自分で作った `NgZone` も、`ngZoneEventCoalescing: true` も、結果は `NoopNgZone` でした。`ngZone: 'noop'` も `NoopNgZone` ですが、それは既定が zoneless だからで、option を読んだからではありません。

読まれなくなったのは d5e00f9591e（2025-09-16、`refactor(core): Make the zoneless-by-default change a flag flip (#63382)`、v21.0.0）で、`ZONELESS_BY_DEFAULT = true` の旗を立てて、options から `NgZone` を作る枝（`getNgZone(options?.ngZone, ...)`）を通らなくしました。その枝は 51ebe9a4fcc（2025-11-21、`refactor(core): Remove toggles used for zoneless by default migration`）で消え、今は `getNgZone`（ng\_zone.ts L611）を呼ぶ行がどこにもありません。91 行目の `@deprecated 20.2` は 01fec335568（2025-07-16、`docs: Deprecate BootstrapOptions on bootstrapModule (#62690)`）で、そのときは option はまだ効いていました。3 つの option を渡す形は strict の tsc に通り（deprecated は型のエラーにならない）、実行しても警告は出ません。新しい本家でも同じです。

効くのは 91・101 行目が勧めるとおり providers の方で、`applicationProviders: [provideZoneChangeDetection({eventCoalescing: true})]` か、`@NgModule` の `providers` に同じものを置くと、`NgZone`（`shouldCoalesceEventChangeDetection` が `true`）でした。155〜160 行目の `optionsReducer` は、配列で渡した options を後ろが勝つ形で 1 つにまとめます（L97）。

何度 bootstrap できるかは説明文に書いていません。同じ platform に `bootstrapModule` を 7 回呼ぶと 7 つとも作れ、`ApplicationRef` は 7 つ別々で、`platform.destroy()` で 8 つ（下の JIT の 1 つを含む）とも `destroyed` になりました。`bootstrap` も `ngDoBootstrap` も無いモジュールは NG0403 です（bootstrap.ts L205〜212）。78〜83 行目の例は strict の tsc に通りました。

## 7. JIT のときだけ動く行

📄 `angular/packages/core/src/application/application_ngmodule_factory_compiler.ts` L49–81 （▶ の行: 50, 56–57, 60, 65–66, 69, 74, 76）

```ts
49 │ 
50 ▶   const compilerProviders = compilerOptions.flatMap((option) => option.providers ?? []);
51 │ 
52 │   // In case there are no compiler providers, we just return the module factory as
53 │   // there won't be any resource loader. This can happen with Ivy, because AOT compiled
54 │   // modules can be still passed through "bootstrapModule". In that case we shouldn't
55 │   // unnecessarily require the JIT compiler.
56 ▶   if (compilerProviders.length === 0) {
57 ▶     return Promise.resolve(moduleFactory);
58 │   }
59 │ 
60 ▶   const compiler = getCompilerFacade({
61 │     usage: JitCompilerUsage.Decorator,
62 │     kind: 'NgModule',
63 │     type: moduleType,
64 │   });
65 ▶   const compilerInjector = Injector.create({providers: compilerProviders});
66 ▶   const resourceLoader = compilerInjector.get(compiler.ResourceLoader);
67 │   // The resource loader can also return a string while the "resolveComponentResources"
68 │   // always expects a promise. Therefore we need to wrap the returned value in a promise.
69 ▶   return resolveComponentResources((url) => Promise.resolve(resourceLoader.get(url))).then(
70 │     () => moduleFactory,
71 │   );
72 │ }
73 │ 
74 ▶ function _lastDefined<T>(args: T[]): T | undefined {
75 │   for (let i = args.length - 1; i >= 0; i--) {
76 ▶     if (args[i] !== undefined) {
77 │       return args[i];
78 │     }
79 │   }
80 │   return undefined;
81 │ }
```

`compileNgModuleFactory` の前半（L22〜48）は[bootstrapModule の章](../ngmodule/11-ngmodule-bootstrap-module.md)が読んでいます。AOT のビルドでは `ngJitMode` が `false` なので L32〜34 で返り、ここから下は動きません。JIT のときだけ、compiler の options の `providers` から `ResourceLoader` を取り（60〜66 行目）、`templateUrl` の中身を読み込んでから返ります（69 行目）。

L38〜40 のコメントは「違う options で複数のモジュールを bootstrap すると、この呼び出しが失敗しうる」と書きます。Node の JIT で、`preserveWhitespaces` を渡さずに 6 回 bootstrap したあと `preserveWhitespaces: true` で bootstrap すると、作れたうえで開発モードは console.error「Provided value for \`preserveWhitespaces\` can not be changed once it has been set.」を出し、本番は何も出しませんでした。`setJitOptions` は投げずに、最初の値を残して戻るだけです（render3/jit/jit\_options.ts L17〜35）。新しい本家では 4854f68e391（2026-11-10、`perf(core): tree-shake JIT dependencies from AOT module bootstrap`）で、この JIT の部分を `else` の中に移して、AOT のビルドから外せるようにしました。

## 8. ENABLE\_ROOT\_COMPONENT\_BOOTSTRAP と SSR の 3 つのトークン

📄 `angular/packages/core/src/platform/bootstrap.ts` L31–58 （▶ の行: 34–35, 39–40, 45–46, 51）

```ts
31 │ /**
32 │  * InjectionToken to control root component bootstrap behavior.
33 │  *
34 ▶  * This token is primarily used in Angular's server-side rendering (SSR) scenarios,
35 ▶  * particularly by the `@angular/ssr` package, to manage whether the root component
36 │  * should be bootstrapped during the application initialization process.
37 │  *
38 │  * ## Purpose:
39 ▶  * During SSR route extraction, setting this token to `false` prevents Angular from
40 ▶  * bootstrapping the root component. This avoids unnecessary component rendering,
41 │  * enabling route extraction without requiring additional APIs or triggering
42 │  * component logic.
43 │  *
44 │  * ## Behavior:
45 ▶  * - **`false`**: Prevents the root component from being bootstrapped.
46 ▶  * - **`true`** (default): Proceeds with the normal root component bootstrap process.
47 │  *
48 │  * This mechanism ensures SSR can efficiently separate route extraction logic
49 │  * from component rendering.
50 │  */
51 ▶ export const ENABLE_ROOT_COMPONENT_BOOTSTRAP = new InjectionToken<boolean>(
52 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'ENABLE_ROOT_COMPONENT_BOOTSTRAP' : '',
53 │ );
54 │ 
55 │ export interface BootstrapConfig {
56 │   platformInjector: Injector;
57 │ }
58 │ 
```

公開 API ではない内部のトークンです（`ɵENABLE_ROOT_COMPONENT_BOOTSTRAP`）。39〜40 行目のとおり `@angular/ssr` がルートの抽出のときに `false` にします。`bootstrap()` はこれが `false` だとルートのコンポーネントを作らずに `ApplicationRef` を返します（bootstrap.ts L149〜156）。DEMO の 4 つ目の表で、`false` を渡すと `components` は 0、渡さなければ 1 でした。

📄 `angular/packages/core/src/application/platform_tokens.ts` L11–37 （▶ の行: 12, 15, 18, 21, 31, 34–35）

```ts
11 │ /**
12 ▶  * Injection token representing the current HTTP request object.
13 │  *
14 │  * Use this token to access the current request when handling server-side
15 ▶  * rendering (SSR).
16 │  *
17 │  * @remarks
18 ▶  * This token may be `null` in the following scenarios:
19 │  *
20 │  * * During the build processes.
21 ▶  * * When the application is rendered in the browser (client-side rendering).
22 │  * * When performing static site generation (SSG).
23 │  * * During route extraction in development (at the time of the request).
24 │  *
25 │  * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Request `Request` on MDN}
26 │  *
27 │  * @see [Accessing Request and Response via DI](guide/ssr#accessing-request-and-response-via-di)
28 │  *
29 │  * @publicApi
30 │  */
31 ▶ export const REQUEST = new InjectionToken<Request | null>(
32 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'REQUEST' : '',
33 │   {
34 ▶     providedIn: 'platform',
35 ▶     factory: () => null,
36 │   },
37 │ );
```

📄 `angular/packages/core/src/application/platform_tokens.ts` L39–74 （▶ の行: 44, 46, 50, 53, 56, 59, 68, 71–72）

```ts
39 │ /**
40 │  * Type that represents the initialization options for a response.
41 │  *
42 │  * @publicApi
43 │  */
44 ▶ export type ResponseInit = {
45 │   // This is needed as `@types/node` and Undici marks all these properties as readonly. This is not the case in lib.dom.d.ts
46 ▶   -readonly [P in keyof globalThis.ResponseInit]: globalThis.ResponseInit[P];
47 │ };
48 │ 
49 │ /**
50 ▶  * Injection token for response initialization options.
51 │  *
52 │  * Use this token to provide response options for configuring or initializing
53 ▶  * HTTP responses in server-side rendering or API endpoints.
54 │  *
55 │  * @remarks
56 ▶  * This token may be `null` in the following scenarios:
57 │  *
58 │  * * During the build processes.
59 ▶  * * When the application is rendered in the browser (client-side rendering).
60 │  * * When performing static site generation (SSG).
61 │  * * During route extraction in development (at the time of the request).
62 │  *
63 │  * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Response/Response `ResponseInit` on MDN}
64 │  *
65 │  * @publicApi
66 │  * @see [Accessing Request and Response via DI](guide/ssr#accessing-request-and-response-via-di)
67 │  */
68 ▶ export const RESPONSE_INIT = new InjectionToken<ResponseInit | null>(
69 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'RESPONSE_INIT' : '',
70 │   {
71 ▶     providedIn: 'platform',
72 ▶     factory: () => null,
73 │   },
74 │ );
```

📄 `angular/packages/core/src/application/platform_tokens.ts` L76–93 （▶ の行: 79, 82, 87, 90–91）

```ts
76 │ /**
77 │  * Injection token for additional request context.
78 │  *
79 ▶  * Use this token to pass custom metadata or context related to the current request in server-side rendering.
80 │  *
81 │  * @remarks
82 ▶  * This token is only available during server-side rendering and will be `null` in other contexts.
83 │  *
84 │  * @publicApi
85 │  * @see [Accessing Request and Response via DI](guide/ssr#accessing-request-and-response-via-di)
86 │  */
87 ▶ export const REQUEST_CONTEXT = new InjectionToken<unknown>(
88 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'REQUEST_CONTEXT' : '',
89 │   {
90 ▶     providedIn: 'platform',
91 ▶     factory: () => null,
92 │   },
93 │ );
```

3 つとも `providedIn: 'platform'` と `factory: () => null` で、誰も provide しなければ `null` です。ブラウザーで描くアプリ（Node の記録で `createApplication` で作ったもの）では、DEMO の 6 つ目の表のとおり 3 つとも `null` でした（21 行目・59 行目・82 行目の約束のとおり）。このページで読む形も試しましたが、3 つのトークンを使うだけで最初に読む JS が 0.1 kB ほど増えたので、記録にしました。サーバーでは `@angular/ssr` がリクエストごとに provide します（[AngularAppEngine の章](../platform/04-ssr-app-engine.md)）。45〜46 行目の `ResponseInit` は、DOM の型の readonly を外した写しです。

> **🧪 DEMO — このページの platform を読み、作る・壊すは記録で見る**
>
> 1 つ目のボタンは、このページの platform の注入器にある `PLATFORM_ID` を読むだけです。ページでは `PlatformRef` を使いません。サイトの platform の注入器は `PlatformRef` を参照しない `createOrReusePlatformInjector`（L167〜194）で作られていて、章で `PlatformRef` を使うと `bootstrapModule` ほかが最初に読む JS に入り、本番ビルドの Initial total が 1.35 kB 増えたためです。  
>  ほかのボタンは、cra-platform.demo-pf.ts の関数を、platform の無い Node（domino の上の JIT）で関数ごとに起動し直して、開発モードと本番（`ngDevMode = false`）で動かした記録を再生します。3 つ目は zone.js（0.16.2）を読んだ Node、5 つ目は `ngServerMode = true` の Node です。「説明と違う」の行は左に印を付けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-platform)

## ここまでの呼び出し（作れない注入器で createPlatform を呼んだとき）

- 👤 `createPlatform(Injector.create({providers: []}))`
  - `getPlatform() → null` — platform.ts L39 — *まだ無いので進む*
  - `_platformInjector = injector` — L54 — *先に入れる*
  - `injector.get(PlatformRef) → NG0201` — L56 — *scope が 'platform' でない*
- 👤 `platformBrowser()`
  - `getPlatform() → _platformInjector.get(PlatformRef) → NG0201` — L80、L147 — *ここから先はずっと同じ*
- 👤 `destroyPlatform()`
  - `getPlatform()?.destroy() → NG0201` — L164 — *壊して戻すこともできない*

## テストと直し方

| ファイル（packages/core/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `application_ref_spec.ts` | `bootstrapModule`（461）› `should bootstrap with NoopNgZone`（577）・`should add bootstrapped module into platform modules list`（571）・``should error if neither `ngDoBootstrap` nor @NgModule.bootstrap was specified``（556） | 6 節。577 は `ngZone: 'noop'` を渡して `NoopNgZone` を待つが、既定も `NoopNgZone` なので option を読まなくても通る |
| `acceptance/bootstrap_spec.ts` | `options`（82）› `can configure zone with provideZoneChangeDetection`（333）・`` can configure zoneless correctly without `ngZone: "noop"` ``（356） | 6 節の providers の方 |
| `acceptance/bootstrap_spec.ts` | `PlatformRef cleanup`（412）› ``should unsubscribe from `onError` when Injector is destroyed``（414）、`changing bootstrap options`（430）› `should log an error when changing preserveWhitespaces bootstrap options`（462） | 1・7 節 |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（結果は表の下）
```

結果は手元の bazel で、名前ごとに shard の「Ran N of M specs」の N を足した数が、`//packages/core/test/acceptance:acceptance`（shard は 1 つ）の `bootstrap options` で 22、`PlatformRef cleanup` で 1、`changing bootstrap options` で 5、`//packages/core/test:test`（4 つの shard）の `bootstrap bootstrapModule` で 15、`bootstrapModuleFactory` で 3、どれも 0 failures でした（2026-11-22）。`createPlatform` と `destroyPlatform` を直接試す it は、core の spec にはありません（`createPlatform` を呼ぶのは error\_handler\_spec.ts などの準備の行だけ）。

直すとしたら、platform.ts の `createPlatform`（L38〜59）で `injector.get(PlatformRef)` を先に呼び、成功してから `_platformInjector` に入れます（54 行目と 56 行目の入れ替え。サーバーでの `null` の扱いはそのまま）。spec は acceptance/bootstrap\_spec.ts か application\_ref\_spec.ts に「`Injector.create({providers: []})` で `createPlatform` が NG0201 を投げたあとも `getPlatform()` が `null`」を足します。説明文は、application\_ref.ts の `BootstrapOptions` の 3 つに「今は使われない」と書くか、型から外します（外すのは公開 API の変更）。application\_ref\_spec.ts の 577 行目の it は、option が効いていたころの形のまま意味を失っているので、option を渡さない形か `ngZone: 'zone.js'` でも `NoopNgZone` になる形に書き換えます。

## 聞かれそうな質問

**Q. `platformBrowser().bootstrapModule(AppModule, {ngZone: 'zone.js'})` で zone.js のアプリになりますか？**

なりません。v21 からこの option は読まれず、`NgZone` は `NoopNgZone` です（DEMO の 3 つ目の表）。zone.js のアプリにしたければ `applicationProviders` か `@NgModule` の `providers` に `provideZoneChangeDetection()` を置きます。

**Q. 1 つのページで `bootstrapApplication` を 2 回呼べますか？**

呼べます。platform は 1 つを使い回し、アプリ（環境の注入器と `ApplicationRef`）が 2 つできます。`bootstrapModule` も 7 回呼んで 7 つできました。違う `APP_ID` にするのは[第 1 回](01-cra-app-ref.md)の 7 節の例のとおりです。

**Q. platform を作ったあとで `providePlatformInitializer` を渡したら？**

呼ばれません。factory は platform があれば渡された provider を見ずに返します（L80〜81）。警告も出ないので、`platformBrowser([...])` は一番最初に呼びます（204 行目）。

**Q. サーバーで `getPlatform()` が `null` なのはなぜですか？**

リクエストごとに別の platform を作るためです。サーバーでは platform の注入器をモジュールの変数に入れず（L54・L187〜189）、`BootstrapContext` の `platformRef` で渡します。`destroyPlatform()` も何もしません（154 行目）。

**Q. `createPlatform` に自分の注入器を渡してよいですか？**

platform の scope を持つ注入器でなければいけません。持たない注入器を渡すと NG0201 のうえ、54 行目で入れた注入器が残り、以後 `getPlatform()` も `platformBrowser()` も NG0201 になります。普段は factory を使います。

## 読み終えて

- ブラウザーでは platform は 1 ページに 1 つで、factory は使い回す。サーバーでは factory を呼ぶたびに新しく、`getPlatform()` は `null`。
- `createPlatform` は 2 つ目を NG0400 で止める。作れない注入器を渡すと、先に入れた注入器が残って以後ずっと NG0201。
- `BootstrapOptions` の `ngZone`・`ngZoneEventCoalescing`・`ngZoneRunCoalescing` は v21 から読まれない。説明文は効いていたころのまま。
- platform の初期化関数は platform を作るときだけ呼ばれ、あとから渡すと黙って無視される。
- JIT の options の食い違いは例外ではなく、開発モードの console.error だけ。

---

← 前: [ApplicationRef とアプリのトークンの説明文](01-cra-app-ref.md)  
次: [ViewContainerRef・TemplateRef・ViewRef・ElementRef の説明文](03-cra-view-container.md) →
