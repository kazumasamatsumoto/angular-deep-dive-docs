[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 1 回 / 全 10 回

# ApplicationRef とアプリのトークンの説明文

> application/application\_ref.ts・application\_tokens.ts・application\_init.ts・stability\_debug\_impl.ts・tracing.ts の未読の行：isStable・tick・attachView・bootstrap・whenStable の約束、APP\_ID・APP\_INITIALIZER・provideAppInitializer・provideStabilityDebugging の説明と例。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-app-ref)

---

この章で分かること：`ApplicationRef` の `isStable`・`bootstrap`・`tick`・`attachView`・`destroy`、`APP_ID`、`APP_INITIALIZER` と `provideAppInitializer`、`provideStabilityDebugging` の説明文（angular.dev の API リファレンスになる JSDoc）が約束していることと、それが本物でそのとおりに動くか。結果として、`isStable` の例の構文の誤り（括弧が 1 つ足りない）と、zone.js を前提にした 2 つの注意書き、`APP_INITIALIZER` の「Observable を返す例」が Promise を返していること、`attachView` が例外を投げたあとも数に残ることの 4 つが、説明か実装と合いませんでした。

読む対象は `packages/core/src/application/` の `application_ref.ts`・`application_tokens.ts`・`application_init.ts`・`stability_debug_impl.ts`・`tracing.ts` の説明文（../angular、8576f161ae4）です。動く行の多くは既存の章が読んでいます。`bootstrap` の中身は[ApplicationRef.bootstrap の章](../boot/10-boot-application-ref.md)、`tick` の中身は[tick → synchronize の章](../zoneless/05-zoneless-tick.md)、`isStable` が数える保留のタスクは[PendingTasks と isStable の章](../zoneless/09-zoneless-pending-tasks.md)、初期化関数を待つ仕組みは[APP\_INITIALIZER の章](../boot/09-boot-app-initializer.md)にあるので、ここでは繰り返さずに行だけ指します。

1. **1. ApplicationRef**（この章）
2. [2. platform と bootstrap](02-cra-platform.md)
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
> `ApplicationRef` は「1 つのアプリ」を表すサービスです。アプリの環境の注入器（`EnvironmentInjector`）に 1 つあり、そのアプリのルートのビュー（画面の部品の木の根）を配列に持ち、`tick()` でまとめて変更検知します。このサイトは zone.js を読まない zoneless のアプリなので、zone.js が要る約束は Node で動かした記録で見せます。

## 1. 読み取り用の 4 つ：destroyed・componentTypes・components・viewCount

📄 `angular/packages/core/src/application/application_ref.ts` L302–318 （▶ の行: 303, 305, 310–311, 313, 316, 318）

```ts
302 │   /**
303 ▶    * Indicates whether this instance was destroyed.
304 │    */
305 ▶   get destroyed() {
306 │     return this._destroyed;
307 │   }
308 │ 
309 │   /**
310 ▶    * Get a list of component types registered to this application.
311 ▶    * This list is populated even before the component is created.
312 │    */
313 ▶   public readonly componentTypes: Type<any>[] = [];
314 │ 
315 │   /**
316 ▶    * Get a list of components registered to this application.
317 │    */
318 ▶   public readonly components: ComponentRef<any>[] = [];
```

📄 `angular/packages/core/src/application/application_ref.ts` L814–847 （▶ の行: 816, 818–819, 838–841, 843, 846）

```ts
814 │ 
815 │   /**
816 ▶    * Returns the number of attached views.
817 │    */
818 ▶   get viewCount() {
819 ▶     return this._views.length;
820 │   }
821 │ }
822 │ 
823 │ function normalizeBootstrapOptions(
824 │   hostElementOrOptions:
825 │     | Element
826 │     | string
827 │     | undefined
828 │     | {
829 │         hostElement?: Element | string | undefined;
830 │         directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[];
831 │         bindings?: Binding[];
832 │       },
833 │ ): {
834 │   hostElement?: Element | string | undefined;
835 │   directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[];
836 │   bindings?: Binding[];
837 │ } {
838 ▶   if (
839 ▶     hostElementOrOptions === undefined ||
840 ▶     typeof hostElementOrOptions === 'string' ||
841 ▶     hostElementOrOptions instanceof Element
842 │   ) {
843 ▶     return {hostElement: hostElementOrOptions};
844 │   }
845 │ 
846 ▶   return hostElementOrOptions;
847 │ }
```

310〜311 行目は「`componentTypes` はコンポーネントを作る前から入る」と書きます。`bootstrapImpl` は型を `componentTypes` に push してから（L488）コンポーネントを作り（L493）、作り終えたあとの `_loadComponent` で `components` に push します（L745。[ApplicationRef.bootstrap の章](../boot/10-boot-application-ref.md)の 7 節）。DEMO の 3 つ目の表で constructor が投げるコンポーネントを `bootstrap` すると、`componentTypes` は 2 から 3 に増え、`components` は 2 のままでした。約束のとおりで、失敗した型も残ります。

816〜819 行目の `viewCount` は「付いているビューの数」で、中身は `_views` の長さです。テスト用のビュー（`allViews` が足すもの、L295〜299）は数えません。このページのアプリでは DEMO の 1 つ目の表のとおり 1 で、`components` も `<app-root>` の 1 つでした（`componentTypes` の型の `name` は、本番ビルドでクラス名が縮められて `'e'` です）。838〜846 行目の `normalizeBootstrapOptions` は 3 節で使います。

## 2. isStable の説明文：例が 1 つ構文の誤り、2 つの注意は zone.js の話

📄 `angular/packages/core/src/application/application_ref.ts` L162–189 （▶ の行: 168–173, 181–184, 187）

````ts
162 │ /**
163 │  * A reference to an Angular application running on a page.
164 │  *
165 │  * @usageNotes
166 │  * ### isStable examples and caveats
167 │  *
168 ▶  * Note two important points about `isStable`, demonstrated in the examples below:
169 ▶  * - the application will never be stable if you start any kind
170 ▶  * of recurrent asynchronous task when the application starts
171 ▶  * (for example for a polling process, started with a `setInterval`, a `setTimeout`
172 ▶  * or using RxJS operators like `interval`);
173 ▶  * - the `isStable` Observable runs outside of the Angular zone.
174 │  *
175 │  * Let's imagine that you start a recurrent task
176 │  * (here incrementing a counter, using RxJS `interval`),
177 │  * and at the same time subscribe to `isStable`.
178 │  *
179 │  * ```ts
180 │  * constructor(appRef: ApplicationRef) {
181 ▶  *   appRef.isStable.pipe(
182 ▶  *      filter(stable => stable)
183 ▶  *   ).subscribe(() => console.log('App is stable now');
184 ▶  *   interval(1000).subscribe(counter => console.log(counter));
185 │  * }
186 │  * ```
187 ▶  * In this example, `isStable` will never emit `true`,
188 │  * and the trace "App is stable now" will never get logged.
189 │  *
````

183 行目は `.subscribe(() => console.log('App is stable now');` で、`subscribe(` を閉じる括弧がありません。例を strict の tsc にかけると（サイトの `@angular/compiler-cli` 22.2.6、`strict`・`strictTemplates`、クラスに入れただけ）「TS1005: ')' expected.」でした。この例は 353362f5a4c（2019-01-13、`docs(core): document isStable traps (#28102)`）で書かれたときからこの形で、新しい本家（origin/main の d201dd76ef2、2026-11-20。以下「新しい本家」）でも同じです。下の 194〜249 行目の 4 つの例は、そのまま通りました。

169〜172 行目「`setInterval` などの繰り返すタスクを始めると、アプリはいつまでも安定しない」は zone.js のアプリの話です。`isStable` は `PendingTasksInternal` の「保留があるか」を反転しただけで（L325〜327、[PendingTasks と isStable の章](../zoneless/09-zoneless-pending-tasks.md)の 2 節）、zone.js があるときだけ、zone に未完了のタスクがあるあいだ保留を 1 つ足す `ZoneStablePendingTask` が入ります（[安定の判定の章](../zone/10-zone-ngzone-stability.md)の 6 節）。DEMO の 4 つ目の表のとおり、zoneless のこのページでは `setInterval` を動かしたままでも `isStable` は何も流しません（`true` のまま）。zone.js ありの記録では `false` が流れ、`clearInterval` のあと zone にもう一度入るまで `true` に戻りませんでした。v21 からは zoneless が既定です（[zoneless が既定になった章](../zoneless/01-zoneless-default.md)）。

📄 `angular/packages/core/src/application/application_ref.ts` L203–226 （▶ の行: 206–208, 210–212, 219, 222–224）

````ts
203 │  * In this example, the trace "App is stable now" will be logged
204 │  * and then the counter starts incrementing every second.
205 │  *
206 ▶  * Note also that this Observable runs outside of the Angular zone,
207 ▶  * which means that the code in the subscription
208 ▶  * to this Observable will not trigger the change detection.
209 │  *
210 ▶  * Let's imagine that instead of logging the counter value,
211 ▶  * you update a field of your component
212 ▶  * and display it in its template.
213 │  *
214 │  * ```ts
215 │  * constructor(appRef: ApplicationRef) {
216 │  *   appRef.isStable.pipe(
217 │  *     first(stable => stable),
218 │  *     switchMap(() => interval(1000))
219 ▶  *   ).subscribe(counter => this.value = counter);
220 │  * }
221 │  * ```
222 ▶  * As the `isStable` Observable runs outside the zone,
223 ▶  * the `value` field will be updated properly,
224 ▶  * but the template will not be refreshed!
225 │  *
226 │  * You'll have to manually trigger the change detection to update the template.
````

📄 `angular/packages/core/src/application/application_ref.ts` L227–252 （▶ の行: 229, 235, 240, 243, 247）

````ts
227 │  *
228 │  * ```ts
229 ▶  * constructor(appRef: ApplicationRef, cd: ChangeDetectorRef) {
230 │  *   appRef.isStable.pipe(
231 │  *     first(stable => stable),
232 │  *     switchMap(() => interval(1000))
233 │  *   ).subscribe(counter => {
234 │  *     this.value = counter;
235 ▶  *     cd.detectChanges();
236 │  *   });
237 │  * }
238 │  * ```
239 │  *
240 ▶  * Or make the subscription callback run inside the zone.
241 │  *
242 │  * ```ts
243 ▶  * constructor(appRef: ApplicationRef, zone: NgZone) {
244 │  *   appRef.isStable.pipe(
245 │  *     first(stable => stable),
246 │  *     switchMap(() => interval(1000))
247 ▶  *   ).subscribe(counter => zone.run(() => this.value = counter));
248 │  * }
249 │  * ```
250 │  *
251 │  * @publicApi
252 │  */
````

173・206〜208 行目「`isStable` は Angular の zone の外で流れる」は、zone.js ありの記録で半分だけ合いました。`runOutsideAngular` の中で購読しても、`false` は zone の中で流れ（`NgZone.isInAngularZone()` が `true`）、`true` は外で流れます。`false` は `onUnstable`（zone に入ったとき）の中で保留を足すと流れ、`true` は `onStable` の購読（`runOutsideAngular` の中）で保留を外すと流れるためです（ng\_zone\_scheduling.ts L249〜275、[安定の判定の章](../zone/10-zone-ngzone-stability.md)）。

222〜224 行目「テンプレートは更新されない」と、240〜247 行目の直し方「`zone.run` の中で値を変える」も zone.js のアプリの話です。zoneless のアプリの `NgZone` は `NoopNgZone` で、`run` は関数を呼ぶだけです（ng\_zone.ts L564〜565）。v22 の既定は `OnPush`（change\_detection/constants.ts の「OnPush is enabled by default.」）で、`OnPush` のビューは印が無ければ検査されないので（[OnPush と markForCheck の章](../cd/04-cd-onpush-markforcheck.md)）、フィールドに代入するだけでは zone があってもなくても描き直されません。235 行目の `cd.detectChanges()` の直し方は zoneless でも効きます。今の書き方なら、値を signal にします。

## 3. bootstrap の説明文：同じ文が 2 回、options の形は書いていない

📄 `angular/packages/core/src/application/application_ref.ts` L363–399 （▶ の行: 370–372, 374–376, 380, 384–385, 387, 394, 398）

```ts
363 │   /**
364 │    * Bootstrap a component onto the element identified by its selector or, optionally, to a
365 │    * specified element.
366 │    *
367 │    * @usageNotes
368 │    * ### Bootstrap process
369 │    *
370 ▶    * When bootstrapping a component, Angular mounts it onto a target DOM element
371 ▶    * and kicks off automatic change detection. The target DOM element can be
372 ▶    * provided using the `hostElement` argument.
373 │    *
374 ▶    * If the target DOM element is not provided, Angular tries to find one on a page
375 ▶    * using the `selector` of the component that is being bootstrapped
376 ▶    * (first matched element is used).
377 │    *
378 │    * ### Example
379 │    *
380 ▶    * Generally, we define the component to bootstrap in the `bootstrap` array of `NgModule`,
381 │    * but it requires us to know the component while writing the application code.
382 │    *
383 │    * Imagine a situation where we have to wait for an API call to decide about the component to
384 ▶    * bootstrap. We can use the `ngDoBootstrap` hook of the `NgModule` and call this method to
385 ▶    * dynamically bootstrap a component.
386 │    *
387 ▶    * {@example core/ts/platform/platform.ts region='componentSelector'}
388 │    *
389 │    * Optionally, a component can be mounted onto a DOM element that does not match the
390 │    * selector of the bootstrapped component.
391 │    *
392 │    * In the following example, we are providing a CSS selector to match the target element.
393 │    *
394 ▶    * {@example core/ts/platform/platform.ts region='cssSelector'}
395 │    *
396 │    * While in this example, we are providing reference to a DOM node.
397 │    *
398 ▶    * {@example core/ts/platform/platform.ts region='domNode'}
399 │    */
```

📄 `angular/packages/core/src/application/application_ref.ts` L400–410 （▶ の行: 402–405, 409）

```ts
400 │   bootstrap<C>(
401 │     component: Type<C>,
402 ▶     options?: {
403 ▶       hostElement?: Element | string;
404 ▶       directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[];
405 ▶       bindings?: Binding[];
406 │     },
407 │   ): ComponentRef<C>;
408 │ 
409 ▶   bootstrap<C>(component: Type<C>, hostElement?: Element | string): ComponentRef<C>;
410 │ 
```

363〜399 行目の説明文は、411〜447 行目にもう一度、1 字も違わずに書かれています（ここでは引きません）。前は 400〜407 行目の `options` の形の overload に、後ろは実装（L448）に付いています。どちらも `options` の形（`hostElement`・`directives`・`bindings`）を説明しません。中では 838〜843 行目が要素か文字列か `undefined` を `{hostElement}` に直すので、2 つの形は同じ処理に入ります。DEMO の 3 つ目の表で `{hostElement: section}` を渡しても、要素を渡したときと同じに描かれました。

370〜372 行目「載せて、自動の変更検知を始める」は、`_loadComponent` が `attachView` と `tick` を呼ぶこと（L738〜745、[最初の描画の章](../boot/11-boot-first-render.md)）で、`bootstrap` から戻った時点で中身は描かれていました（`text='sig=0'`）。374〜376 行目の「要素を渡さなければ selector で文書から探す」は、selector に当たる要素が文書に無いと platform-browser の `selectRootElement` が NG05104「The selector "cra-ar-eager" did not match any elements」を投げます（dom\_renderer.ts L385）。380〜385 行目の例は `NgModule` の `ngDoBootstrap` で書かれていますが、これは古いだけです。standalone のアプリでも、`createApplication`（ルートのコンポーネントを作らずにアプリだけを作る）で作ったアプリの `ApplicationRef` に `bootstrap(Cmp, 要素)` を呼べば、398 行目の例と同じに動きました。

📄 `angular/packages/core/src/application/application_ref.ts` L52–64 （▶ の行: 53–54, 56, 58, 62–63）

```ts
52 │ /**
53 ▶  * A DI token that provides a set of callbacks to
54 ▶  * be called for every component that is bootstrapped.
55 │  *
56 ▶  * Each callback must take a `ComponentRef` instance and return nothing.
57 │  *
58 ▶  * `(componentRef: ComponentRef) => void`
59 │  *
60 │  * @publicApi
61 │  */
62 ▶ export const APP_BOOTSTRAP_LISTENER = new InjectionToken<
63 ▶   ReadonlyArray<(compRef: ComponentRef<any>) => void>
64 │ >(ngDevMode ? 'appBootstrapListener' : '');
```

53〜56 行目のとおり、`APP_BOOTSTRAP_LISTENER` は `bootstrap` したコンポーネントごとに 1 回呼ばれました。63 行目の型は配列なので `multi: true` で並べます。`multi` を付け忘れると、開発モードだけ NG0209 の例外です（L748〜756）。開発モードの記録では、`bootstrap` のたびに「Angular is running in development mode.」が 1 回ずつ console.log に出ました（L512〜515）。本番では出ません。

## 4. tick の説明文：zoneless では「明示的に」でも印の付いたビューだけ

📄 `angular/packages/core/src/application/application_ref.ts` L523–538 （▶ の行: 524, 526–528, 530, 534–535, 537）

```ts
523 │   /**
524 ▶    * Invoke this method to explicitly process change detection and its side-effects.
525 │    *
526 ▶    * In development mode, `tick()` also performs a second change detection cycle to ensure that no
527 ▶    * further changes are detected. If additional changes are picked up during this second cycle,
528 ▶    * bindings in the app have side-effects that cannot be resolved in a single change detection
529 │    * pass.
530 ▶    * In this case, Angular throws an error, since an Angular application can only have one change
531 │    * detection pass during which all change detection must complete.
532 │    */
533 │   tick(): void {
534 ▶     if (!this.zonelessEnabled) {
535 ▶       this.dirtyFlags |= ApplicationRefDirtyFlags.ViewTreeGlobal;
536 │     }
537 ▶     this._tick();
538 │   }
```

524 行目は「変更検知とその副作用を明示的に処理する」と書きます。zoneless のアプリでは、534〜535 行目の `ViewTreeGlobal` の印を付けないので、`tick()` は印（signal の変更や `markForCheck` でスケジューラーが付けたもの）のあるビューしか検査しません（[tick → synchronize の章](../zoneless/05-zoneless-tick.md)）。DEMO の 2 つ目の表で、`ChangeDetectionStrategy.Eager`（毎回検査する、旧 `Default`）のコンポーネントのフィールドだけを変えて `tick()` すると、このページ（本番）では描き直されず（`field=0` のまま）、zone.js ありの記録では描き直されました（`field=1`）。

526〜530 行目の「開発モードは 2 回目の検査をして、変わっていれば例外」も確かめられました。zoneless の開発モードの記録では、同じ `tick()` が NG0100（ExpressionChangedAfterItHasBeenChecked）を投げました。1 回目の検査は印の付いたビューだけ、2 回目の `checkNoChanges` は付いたビューを全部見るので（L568〜571、[checkNoChanges の章](../cd/07-cd-check-no-changes.md)）、1 回目が飛ばしたフィールドを 2 回目が見つけます。開発モードでは例外、本番では何も起きず古い表示のまま、という差になります。

## 5. attachView：例外を投げても数に残る

📄 `angular/packages/core/src/application/application_ref.ts` L715–726 （▶ の行: 717–719, 723–725）

```ts
715 │ 
716 │   /**
717 ▶    * Attaches a view so that it will be dirty checked.
718 ▶    * The view will be automatically detached when it is destroyed.
719 ▶    * This will throw if the view is already attached to a ViewContainer.
720 │    */
721 │   attachView(viewRef: ViewRef): void {
722 │     (typeof ngDevMode === 'undefined' || ngDevMode) && warnIfDestroyed(this._destroyed);
723 ▶     const view = viewRef as InternalViewRef<unknown>;
724 ▶     this._views.push(view);
725 ▶     view.attachToAppRef(this);
726 │   }
```

717〜718 行目「付けたビューは検査され、destroy されると自動で外れる」は合っていました（DEMO の 2 つ目の表の 2・6 行目）。外れるのは、`ViewRef.destroy` が `_appRef` を持っていれば `detachView` を呼ぶからです（render3/view\_ref.ts L105〜106、[ビューの破棄の章](../ivy/17-ivy-destroy.md)）。719 行目「ViewContainer に付いていれば例外」も、NG0902「This view is already attached to a ViewContainer!」が出ました。投げるのは 725 行目の `attachToAppRef` です（render3/view\_ref.ts L363〜368、[ViewRef は配列への窓の章](../ivy/16-ivy-refs.md)）。

ところが、724 行目の push は 725 行目より先なので、例外を投げたあとも `_views` にビューが残ります。DEMO の 2 つ目の表では `viewCount` が 0 から 1 に増え、そのビューを入れ物ごと destroy しても 1 のままでした（ビューの `destroyed` は `true`）。`attachToAppRef` が投げたので `_appRef` が入らず、destroy が `detachView` を呼ばないためです。残ったビューは `tick` のたびに `allViews` に並び、アプリを destroy するまで外れません。この順は、追える一番古い b6431c60e66（2017-09-12、`refactor: core, http & platform-webworker to remove public private class separation`）のときからで、新しい本家でも同じです。`this._views.push(view)` を `view.attachToAppRef(this)` の後ろに移すと、Node で同じ手順を動かして `viewCount` は 0 のままでした。

同じビューを 2 回 `attachView` すると `viewCount` は 2 増えます（説明文は何も言いません）。`attachToAppRef` は 2 回目を止めず、724 行目は重複を見ないからです。1 回の destroy で外れるのは 1 つだけで（860〜864 行目の `remove` は最初の 1 つだけを消す）、残りの 1 つは destroy 済みのまま残りました。

## 6. onDestroy と destroy のあと

📄 `angular/packages/core/src/application/application_ref.ts` L779–796 （▶ の行: 781, 784, 786–787, 789, 793–795）

```ts
779 │ 
780 │   /**
781 ▶    * Registers a listener to be called when an instance is destroyed.
782 │    *
783 │    * @param callback A callback function to add as a listener.
784 ▶    * @returns A function which unregisters a listener.
785 │    */
786 ▶   onDestroy(callback: () => void): VoidFunction {
787 ▶     (typeof ngDevMode === 'undefined' || ngDevMode) && warnIfDestroyed(this._destroyed);
788 │     this._destroyListeners.push(callback);
789 ▶     return () => remove(this._destroyListeners, callback);
790 │   }
791 │ 
792 │   /**
793 ▶    * Destroys an Angular application represented by this `ApplicationRef`. Calling this function
794 ▶    * will destroy the associated environment injectors as well as all the bootstrapped components
795 ▶    * with their views.
796 │    */
```

📄 `angular/packages/core/src/application/application_ref.ts` L849–865 （▶ の行: 849–851, 853–854, 860–861, 863）

```ts
849 ▶ function warnIfDestroyed(destroyed: boolean): void {
850 ▶   if (destroyed) {
851 ▶     console.warn(
852 │       formatRuntimeError(
853 ▶         RuntimeErrorCode.APPLICATION_REF_ALREADY_DESTROYED,
854 ▶         'This instance of the `ApplicationRef` has already been destroyed.',
855 │       ),
856 │     );
857 │   }
858 │ }
859 │ 
860 ▶ export function remove<T>(list: T[], el: T): void {
861 ▶   const index = list.indexOf(el);
862 │   if (index > -1) {
863 ▶     list.splice(index, 1);
864 │   }
865 │ }
```

784 行目のとおり、`onDestroy` の戻り値を呼ぶと登録が外れ、destroy で呼ばれたのは残した方だけでした。793〜795 行目の「環境の注入器も、bootstrap したコンポーネントもビューも壊す」も、DEMO の 2 つ目の表の最後の行で `viewCount` が 0 になりました（destroy の中身は[DestroyRef と破棄の章](../di/14-di-destroy.md)）。

説明文が書いていないことが 3 つあります。2 回目の `destroy` は NG0406 の例外（L798〜803）。destroy のあとの `tick`・`attachView`・`onDestroy` は例外にならず、787 行目などが開発モードで 849〜854 行目の警告「NG0406: This instance of the \`ApplicationRef\` has already been destroyed.」を console.warn に出すだけです（本番は何も出ません）。destroy のあとの `isStable` は `true` を 1 回流して complete します（pending\_tasks\_internal.ts L36〜43）。

## 7. APP\_ID と、ほかのアプリのトークン

📄 `angular/packages/core/src/application/application_tokens.ts` L14–43 （▶ の行: 15–17, 19–21, 26, 33, 39–40）

````ts
14 │ /**
15 ▶  * A DI token representing a string ID, used
16 ▶  * primarily for prefixing application attributes and CSS styles when
17 ▶  * {@link ViewEncapsulation#Emulated} is being used.
18 │  *
19 ▶  * The token is needed in cases when multiple applications are bootstrapped on a page
20 ▶  * (for example, using `bootstrapApplication` calls). In this case, ensure that those applications
21 ▶  * have different `APP_ID` value setup. For example:
22 │  *
23 │  * ```ts
24 │  * bootstrapApplication(ComponentA, {
25 │  *   providers: [
26 ▶  *     { provide: APP_ID, useValue: 'app-a' },
27 │  *     // ... other providers ...
28 │  *   ]
29 │  * });
30 │  *
31 │  * bootstrapApplication(ComponentB, {
32 │  *   providers: [
33 ▶  *     { provide: APP_ID, useValue: 'app-b' },
34 │  *     // ... other providers ...
35 │  *   ]
36 │  * });
37 │  * ```
38 │  *
39 ▶  * By default, when there is only one application bootstrapped, you don't need to provide the
40 ▶  * `APP_ID` token (the `ng` will be used as an app ID).
41 │  *
42 │  * @publicApi
43 │  */
````

📄 `angular/packages/core/src/application/application_tokens.ts` L51–70 （▶ の行: 52, 55, 59–60, 62, 64–66）

```ts
51 │ /** Default value of the `APP_ID` token. */
52 ▶ const DEFAULT_APP_ID = 'ng';
53 │ 
54 │ /** Initializer check for the validity of the APP_ID */
55 ▶ export const validAppIdInitializer: StaticProvider = {
56 │   provide: ENVIRONMENT_INITIALIZER,
57 │   multi: true,
58 │   useValue: () => {
59 ▶     const appId = inject(APP_ID);
60 ▶     const isAlphanumeric = /^[a-zA-Z0-9\-_]+$/.test(appId);
61 │ 
62 ▶     if (!isAlphanumeric) {
63 │       throw new RuntimeError(
64 ▶         RuntimeErrorCode.INVALID_APP_ID,
65 ▶         `APP_ID value "${appId}" is not alphanumeric. ` +
66 ▶           `The APP_ID must be a string of alphanumeric characters. (a-zA-Z0-9), hyphens (-) and underscores (_) are allowed.`,
67 │       );
68 │     }
69 │   },
70 │ };
```

39〜40 行目のとおり、このページの `APP_ID` は `'ng'` でした。15〜17 行目の「エミュレートのカプセル化の属性とスタイルの前に付ける」は[スタイルのカプセル化の章](../compiler/18-compiler-shadow-css.md)です。23〜36 行目の例は strict の tsc にそのまま通りました。

説明文は、`APP_ID` に使える文字を書いていません。60 行目の決まり（英数字と `-`・`_`）を確かめる `validAppIdInitializer` は、開発モードでだけ足されます（create\_application.ts L69 の `ngDevMode ? [validAppIdInitializer] : []`）。DEMO の 3 つ目の表の最後の行で `'my app'` を渡すと、開発モードの記録は NG0211 の例外、このページ（本番）はそのまま作れました。新しい本家では 9fcdf0b80b9（`refactor(core): validate the APP_ID value on the server`）ほかで、サーバーの上（`ngServerMode`）でも確かめるようになっています。

📄 `angular/packages/core/src/application/application_tokens.ts` L96–119 （▶ の行: 102–103, 106, 112–114）

```ts
 96 │ 
 97 │ // We keep this token here, rather than the animations package, so that modules that only care
 98 │ // about which animations module is loaded (e.g. the CDK) can retrieve it without having to
 99 │ // include extra dependencies. See #44970 for more context.
100 │ 
101 │ /**
102 ▶  * A [DI token](api/core/InjectionToken) that indicates which animations
103 ▶  * module has been loaded.
104 │  * @publicApi
105 │  */
106 ▶ export const ANIMATION_MODULE_TYPE = new InjectionToken<'NoopAnimations' | 'BrowserAnimations'>(
107 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'AnimationModuleType' : '',
108 │ );
109 │ 
110 │ // TODO(crisbeto): link to CSP guide here.
111 │ /**
112 ▶  * Token used to configure the [Content Security Policy](https://web.dev/strict-csp/) nonce that
113 ▶  * Angular will apply when inserting inline styles. If not provided, Angular will look up its value
114 ▶  * from the `ngCspNonce` attribute of the application root node.
115 │  *
116 │  * @see [Content security policy](best-practices/security#content-security-policy)
117 │  *
118 │  * @publicApi
119 │  */
```

このページでは、`ANIMATION_MODULE_TYPE` は provider が無いので `null`（サイトはアニメーションのモジュールを読みません）、`CSP_NONCE` は 113〜114 行目のとおりルートの `ngCspNonce` 属性を探し、無いので `null` でした（探す行は[DomRendererFactory2 の章](../domr/03-domr-renderer-factory.md)）。

## 8. APP\_INITIALIZER と provideAppInitializer：Observable の例が Promise

📄 `angular/packages/core/src/application/application_init.ts` L23–46 （▶ の行: 27–29, 36, 38, 41）

```ts
23 │ /**
24 │  * A DI token that you can use to provide
25 │  * one or more initialization functions.
26 │  *
27 ▶  * The provided functions are injected at application startup and executed during
28 ▶  * app initialization. If any of these functions returns a Promise or an Observable, initialization
29 ▶  * does not complete until the Promise is resolved or the Observable is completed.
30 │  *
31 │  * You can, for example, create a factory function that loads language data
32 │  * or an external configuration, and provide that function to the `APP_INITIALIZER` token.
33 │  * The function is executed during the application bootstrap process,
34 │  * and the needed data is available on startup.
35 │  *
36 ▶  * Note that the provided initializer is run in the injection context.
37 │  *
38 ▶  * @deprecated from v19.0.0, use provideAppInitializer instead
39 │  *
40 │  * @see {@link ApplicationInitStatus}
41 ▶  * @see {@link provideAppInitializer}
42 │  *
43 │  * @usageNotes
44 │  *
45 │  * The following example illustrates how to configure a multi-provider using `APP_INITIALIZER` token
46 │  * and a function returning a promise.
```

📄 `angular/packages/core/src/application/application_init.ts` L96–123 （▶ の行: 96–97, 103, 105–109）

````ts
 96 ▶  * It's also possible to configure a multi-provider using `APP_INITIALIZER` token and a function
 97 ▶  * returning an observable, see an example below. Note: the `HttpClient` in this example is used for
 98 │  * demo purposes to illustrate how the factory function can work with other providers available
 99 │  * through DI.
100 │  *
101 │  * ### Example with NgModule-based application
102 │  * ```ts
103 ▶  * function initializeApp() {
104 │  *   const http = inject(HttpClient);
105 ▶  *   return firstValueFrom(
106 ▶  *     http
107 ▶  *       .get("https://someUrl.com/api/user")
108 ▶  *       .pipe(tap(user => { ... }))
109 ▶  *   );
110 │  * }
111 │  *
112 │  * @NgModule({
113 │  *   imports: [BrowserModule, HttpClientModule],
114 │  *   declarations: [AppComponent],
115 │  *   bootstrap: [AppComponent],
116 │  *   providers: [{
117 │  *     provide: APP_INITIALIZER,
118 │  *     useValue: initializeApp,
119 │  *     multi: true,
120 │  *   }]
121 │  * })
122 │  * export class AppModule {}
123 │  * ```
````

96〜97 行目は「Observable を返す関数でも multi の provider を作れる。下に例」と書きますが、その下の 103〜109 行目の例は `firstValueFrom(...)` を返していて、これは Promise です。続く standalone の例（L126〜145）も同じ形で、2 つの「Observable の例」は上の 2 つの Promise の例（L49〜91）と同じ関数になっています。最初の例（cf5f86386ff、2021-03-05、`docs(core): add usage examples for APP_INITIALIZER token (#41095)`）は `httpClient.get(...).pipe(...)` の Observable を返していました。19edf2c057f（2024-04-18、`feat(core): add syntactic sugar for initializers (#53152)`）で `inject` を使う形に書き換えたときに、4 つとも `firstValueFrom` になりました。新しい本家でも同じです。後ろの 2 つの例と 174〜187 行目の例は、strict の tsc に通りました（`{ ... }` だけを空の本体にした）。

📄 `angular/packages/core/src/application/application_init.ts` L154–191 （▶ の行: 156–158, 165, 167, 177, 179）

````ts
154 │ /**
155 │  * @description
156 ▶  * The provided function is injected at application startup and executed during
157 ▶  * app initialization. If the function returns a Promise or an Observable, initialization
158 ▶  * does not complete until the Promise is resolved or the Observable is completed.
159 │  *
160 │  * You can, for example, create a function that loads language data
161 │  * or an external configuration, and provide that function using `provideAppInitializer()`.
162 │  * The function is executed during the application bootstrap process,
163 │  * and the needed data is available on startup.
164 │  *
165 ▶  * Note that the provided initializer is run in the injection context.
166 │  *
167 ▶  * Previously, this was achieved using the `APP_INITIALIZER` token which is now deprecated.
168 │  *
169 │  * @see {@link APP_INITIALIZER}
170 │  *
171 │  * @usageNotes
172 │  * The following example illustrates how to configure an initialization function using
173 │  * `provideAppInitializer()`
174 │  * ```ts
175 │  * bootstrapApplication(App, {
176 │  *   providers: [
177 ▶  *     provideAppInitializer(() => {
178 │  *       const http = inject(HttpClient);
179 ▶  *       return firstValueFrom(
180 │  *         http
181 │  *           .get("https://someUrl.com/api/user")
182 │  *           .pipe(tap(user => { ... }))
183 │  *       );
184 │  *     }),
185 │  *     provideHttpClient(),
186 │  *   ],
187 │  * });
188 │  * ```
189 │  *
190 │  * @publicApi
191 │  */
````

📄 `angular/packages/core/src/application/application_init.ts` L203–215 （▶ の行: 205, 210）

```ts
203 │ 
204 │ /**
205 ▶  * A class that reflects the state of running {@link APP_INITIALIZER} functions.
206 │  *
207 │  * @publicApi
208 │  */
209 │ @Service()
210 ▶ export class ApplicationInitStatus {
211 │   // Using non null assertion, these fields are defined below
212 │   // within the `new Promise` callback (synchronously).
213 │   private resolve!: (...args: any[]) => void;
214 │   private reject!: (...args: any[]) => void;
215 │ 
```

28〜29 行目と 157〜158 行目「Promise なら解決するまで、Observable なら complete するまで待つ」は、DEMO の 5 つ目の表のとおりでした。4 つの初期化関数（同期・Promise・Observable・同期）は provider の順に 0 ms で全部呼ばれ、`APP_INITIALIZER` と `provideAppInitializer` の区別はありません（`provideAppInitializer` は `multi: true` の `APP_INITIALIZER` を作るだけ、[APP\_INITIALIZER の章](../boot/09-boot-app-initializer.md)の 2 節）。Observable が 20 ms で値を流しても待ち続け、80 ms の complete で `createApplication` の Promise が解決しました。待つのは `Promise.all` なので、1 つずつ順に待つのではなく、一番遅いものまで待ちます。この並びのことは説明文に書いていません。

Observable かどうかは `subscribe` という関数を持つかで決まります（util/lang.ts L23〜25）。DEMO の Observable は rxjs を使わず、`subscribe` だけを持つ小さなオブジェクトで作りました。説明文に無い振る舞いが 2 つあります。`multi` を付けずに `APP_INITIALIZER` を書くと、開発モードは NG0209、本番は「this.appInits is not iterable」の TypeError で、どちらも `createApplication` の Promise が reject されます（確かめは L226〜235 の開発モードだけ）。Observable が error を流すと、その error で reject され、`ErrorHandler` が console に「ERROR 初期化に失敗」と書きました。38 行目の `@deprecated` は v19 からです。

## 9. provideStabilityDebugging：「9 秒以内」は最初の安定まで

📄 `angular/packages/core/src/application/stability_debug_impl.ts` L30–54 （▶ の行: 31–32, 34, 37, 44, 46, 49–50, 53）

````ts
30 │ /**
31 ▶  * Provides an application initializer that will log information about what tasks are keeping
32 ▶  * the application from stabilizing if the application does not stabilize within 9 seconds.
33 │  *
34 ▶  * The logged information includes the stack of the tasks preventing stability. This stack can be traced
35 │  * back to the source in the application code.
36 │  *
37 ▶  * If you are using Zone.js, it is recommended that you also temporarily import "zone.js/plugins/task-tracking".
38 │  * This Zone.js plugin provides additional information about which macrotasks are scheduled in the Angular Zone
39 │  * and keeping the Zone from stabilizing.
40 │  *
41 │  * @usageNotes
42 │  *
43 │  * ```ts
44 ▶  * import 'zone.js/plugins/task-tracking';
45 │  *
46 ▶  * bootstrapApplication(AppComponent, {providers: [provideStabilityDebugging()]});
47 │  * ```
48 │  *
49 ▶  * IMPORTANT: Neither the zone.js task tracking plugin nor this utility are removed from production bundles.
50 ▶  * They are intended for temporary use while debugging stability issues during development, including for
51 │  * optimized production builds.
52 │  *
53 ▶  * @publicApi 21.1
54 │  */
````

📄 `angular/packages/core/src/application/stability_debug_impl.ts` L55–81 （▶ の行: 60, 63–66, 77, 79）

```ts
55 │ export function provideStabilityDebugging(): EnvironmentProviders {
56 │   const taskTracker = new DebugTaskTrackerImpl();
57 │   const {openTasks} = taskTracker;
58 │   return makeEnvironmentProviders([
59 │     {
60 ▶       provide: DEBUG_TASK_TRACKER,
61 │       useValue: taskTracker,
62 │     },
63 ▶     provideAppInitializer(() => {
64 ▶       if (typeof ngDevMode === 'undefined' || !ngDevMode) {
65 ▶         console.warn(
66 ▶           'Stability debugging utility was provided in production mode. ' +
67 │             'This will cause debug code to be included in production bundles. ' +
68 │             'If this is intentional because you are debugging stability issues in a production environment, you can ignore this warning.',
69 │         );
70 │       }
71 │       const ngZone = inject(NgZone);
72 │       const applicationRef = inject(ApplicationRef);
73 │ 
74 │       // From TaskTrackingZone:
75 │       // https://github.com/angular/angular/blob/ae0c59028a2f393ea5716bf222db2c38e7a3989f/packages/zone.js/lib/zone-spec/task-tracking.ts#L46
76 │       let _taskTrackingZone: {macroTasks: Array<{creationLocation: Error}>} | null = null;
77 ▶       if (typeof Zone !== 'undefined') {
78 │         ngZone.run(() => {
79 ▶           _taskTrackingZone = Zone.current.get('TaskTrackingZone');
80 │         });
81 │       }
```

📄 `angular/packages/core/src/application/stability_debug_impl.ts` L82–113 （▶ の行: 83, 85, 87–88, 100–102, 105, 107–108）

```ts
 82 │       ngZone.runOutsideAngular(() => {
 83 ▶         const timeoutId = setTimeout(() => {
 84 │           console.debug(
 85 ▶             `---- Application did not stabilize within ${STABILITY_WARNING_THRESHOLD / 1000} seconds ----`,
 86 │           );
 87 ▶           if (typeof Zone !== 'undefined' && !_taskTrackingZone) {
 88 ▶             console.info(
 89 │               'Zone.js is present but no TaskTrackingZone found. To enable better debugging of tasks in the Angular Zone, ' +
 90 │                 'import "zone.js/plugins/task-tracking" in your application.',
 91 │             );
 92 │           }
 93 │           if (_taskTrackingZone?.macroTasks?.length) {
 94 │             console.group('Macrotasks keeping Angular Zone unstable:');
 95 │             for (const t of _taskTrackingZone?.macroTasks ?? []) {
 96 │               console.debug(t.creationLocation.stack);
 97 │             }
 98 │             console.groupEnd();
 99 │           }
100 ▶           console.group('PendingTasks keeping application unstable:');
101 ▶           for (const error of openTasks.values()) {
102 ▶             console.debug(error.stack);
103 │           }
104 │           console.groupEnd();
105 ▶         }, STABILITY_WARNING_THRESHOLD);
106 │ 
107 ▶         applicationRef.whenStable().then(() => {
108 ▶           clearTimeout(timeoutId);
109 │         });
110 │       });
111 │     }),
112 │   ]);
113 │ }
```

31〜32 行目「9 秒以内に安定しなければ、安定を妨げているタスクを書く」の 9 秒は、16 行目の `APPLICATION_IS_STABLE_TIMEOUT - 1_000`（hydration/api.ts L85 の 10 秒から 1 秒引いたもの）です。書くのは 83〜105 行目の `setTimeout` で、107〜108 行目のとおり `whenStable()` が解決したら取り消します。つまり「9 秒以内」は、初期化関数が呼ばれてから**最初に**安定するまでです。下の記録で、初期化関数の中で `PendingTasks.add` したアプリは 9 秒で 85 行目の見出しと 100〜102 行目のスタックを書き、一度安定したあとで `add` したアプリは、9.5 秒たっても何も書きませんでした。説明文はこの区別を書いていません。

| 記録の組 | 9.5 秒のあいだに console に出た行（各行の 1 行目） |
| --- | --- |
| 初期化関数の中で add・開発モード・zone.js なし | `debug: ---- Application did not stabilize within 9 seconds ----`<br>`group: PendingTasks keeping application unstable:`<br>`debug: Error: Task stack tracking error`<br>`groupEnd: `<br> |
| boot のあとで add・開発モード・zone.js なし | （何も出ない） |
| 初期化関数の中で add・本番・zone.js なし | `warn: Stability debugging utility was provided in production mode. This will cause debug code to be included in production bundles. If this is intentional because you are debugging stability issues in a production environment, you can ignore this warning.`<br>`debug: ---- Application did not stabilize within 9 seconds ----`<br>`group: PendingTasks keeping application unstable:`<br>`debug: Error: Task stack tracking error`<br>`groupEnd: `<br> |
| 初期化関数の中で add・開発モード・zone.js あり | `debug: ---- Application did not stabilize within 9 seconds ----`<br>`info: Zone.js is present but no TaskTrackingZone found. To enable better debugging of tasks in the Angular Zone, import "zone.js/plugins/task-tracking" in your application.`<br>`group: PendingTasks keeping application unstable:`<br>`debug: Error: Task stack tracking error`<br>`groupEnd: `<br> |

スタックを集めるのは 60 行目の `DEBUG_TASK_TRACKER` で、`PendingTasksInternal` が `add` のたびに `new Error('Task stack tracking error')` を取ります（pending\_tasks\_internal.ts L25・L55、stability\_debug\_impl.ts L21〜22）。本番では 64〜66 行目の警告が出ました。zone.js があってタスク追跡のプラグインが無いと、87〜88 行目の案内が出ます。44 行目の例はプラグインを import しますが、zoneless のアプリでは要りません（サイトには zone.js が無いので、例を tsc にかけると「TS2882: Cannot find module or type declarations for side-effect import of 'zone.js/plugins/task-tracking'」でした）。

## 10. tracing.ts：外の道具のための差し込み口

📄 `angular/packages/core/src/application/tracing.ts` L11–38 （▶ の行: 12–14, 19, 21–22, 28, 36–37）

```ts
11 │ /** Actions that are supported by the tracing framework. */
12 ▶ export enum TracingAction {
13 ▶   CHANGE_DETECTION,
14 ▶   AFTER_NEXT_RENDER,
15 │ }
16 │ 
17 │ /** A single tracing snapshot. */
18 │ export interface TracingSnapshot {
19 ▶   run<T>(action: TracingAction, fn: () => T): T;
20 │ 
21 ▶   /** Disposes of the tracing snapshot. Must be run exactly once per TracingSnapshot. */
22 ▶   dispose(): void;
23 │ }
24 │ 
25 │ /**
26 │  * Injection token for a `TracingService`, optionally provided.
27 │  */
28 ▶ export const TracingService = new InjectionToken<TracingService<TracingSnapshot>>(
29 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'TracingService' : '',
30 │ );
31 │ 
32 │ /**
33 │  * Tracing mechanism which can associate causes (snapshots) with runs of
34 │  * subsequent operations.
35 │  *
36 ▶  * Not defined by Angular directly, but defined in contexts where tracing is
37 ▶  * desired.
38 │  */
```

📄 `angular/packages/core/src/application/tracing.ts` L39–74 （▶ の行: 42, 47, 50, 57, 66, 73）

```ts
39 │ export interface TracingService<T extends TracingSnapshot> {
40 │   /**
41 │    * Take a snapshot of the current context which will be stored by Angular and
42 ▶    * used when additional work is performed that was scheduled in this context.
43 │    *
44 │    * @param linkedSnapshot Optional snapshot to use link to the current context.
45 │    * The caller is no longer responsible for calling dispose on the linkedSnapshot.
46 │    *
47 ▶    * @return The tracing snapshot. The caller is responsible for diposing of the
48 │    * snapshot.
49 │    */
50 ▶   snapshot(linkedSnapshot: T | null): T;
51 │ 
52 │   /**
53 │    * Propagate the current tracing context to the provided function.
54 │    * @param fn A function.
55 │    * @return A function that will propagate the current tracing context.
56 │    */
57 ▶   propagate?<T extends Function>(fn: T): T;
58 │ 
59 │   /**
60 │    * Wrap an event listener bound by the framework for tracing.
61 │    * @param element Element on which the event is bound.
62 │    * @param eventName Name of the event.
63 │    * @param handler Event handler.
64 │    * @return A new event handler to be bound instead of the original one.
65 │    */
66 ▶   wrapEventListener?<T extends Function>(element: HTMLElement, eventName: string, handler: T): T;
67 │ 
68 │   /**
69 │    * Trace the creation of a component instance.
70 │    * @param className Name of the component. May be null if the class is anonymous.
71 │    * @param fn Function that creates the component instance.
72 │    */
73 ▶   componentCreate?<T>(className: string | null, fn: () => T): T;
74 │ }
```

`TracingService` は公開 API ではなく（`ɵTracingService`、core\_private\_export.ts L35〜37）、36〜37 行目のとおり Angular 自身は実装を持たず、外の道具が provide します。Angular の側の呼ぶ場所は 4 つで、`snapshot` はスケジューラーが tick を予約するとき（zoneless\_scheduling\_impl.ts L199）と `afterNextRender` の登録のとき（after\_render/hooks.ts L463）、`componentCreate` はコンポーネントを作るとき（component\_ref.ts L290〜291）、`wrapEventListener` は platform-browser のイベントの登録（dom\_renderer.ts L499〜500）、`propagate` は common/http の XHR（xhr.ts L116）です。tick は取っておいた snapshot の中で走ります（L544〜551、[tick の章](../zoneless/05-zoneless-tick.md)）。`ApplicationRef` の constructor は 1 行 `inject(TracingService, {optional: true})` を呼ぶだけです（L330〜333）。

> **🧪 DEMO — 説明文の約束を本物の ApplicationRef で試す**
>
> 1 つ目のボタンは、このページのアプリの `ApplicationRef` を読むだけです。2〜4 つ目は、押すたびに platform-browser の `createApplication` で小さなアプリを 1 つ作り（このページの platform の上、zoneless）、そのアプリの `ApplicationRef` で `attachView`・`tick`・`bootstrap`・`destroy` を試して、最後にそのアプリを destroy します。コンポーネントは文書に付けない要素の上に作ります。このページのアプリには何も付けません。  
>  「開発モード」と「zone.js あり」の列は、同じ関数（cra-app-ref.demo-ar.ts）を Node（domino の上の JIT）で動かした記録です。5 つ目の表は失敗する初期化関数が console にエラーを書くので、ページでは動かさず本番の記録を再生します。  
>  本番ビルドの最初に読む JS（Initial total）は、このシリーズの 5 つの章を入れても 486.46 kB のままでした。初めは `const { createApplication } = await import('@angular/platform-browser')` と動的に読んでいて、そのときは 493.92 kB に増えました。動的 import の名前空間は分割代入でも tree-shake されず、platform-browser の公開の名前が全部残ったためです。章の .ts の静的 import にすると増えなくなりました。「説明と違う」の行は左に印を付けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-app-ref)

## ここまでの呼び出し

- 👤 `appRef.attachView(vc.createEmbeddedView(tpl))`
  - `this._views.push(view)` — application\_ref.ts L724 — *先に配列へ*
  - `view.attachToAppRef(this)` — application\_ref.ts L725
    - `_attachedToViewContainer → throw NG0902` — render3/view\_ref.ts L363〜368 — *\_appRef は入らない*
- 👤 `holder.destroy()`
  - `ViewRef.destroy：_appRef が null なので detachView を呼ばない` — render3/view\_ref.ts L105〜106 — *\_views に残る*
- 👤 `appRef.tick()`
  - `zonelessEnabled なので ViewTreeGlobal を付けない` — application\_ref.ts L534〜536
    - `synchronize → 印のあるビューだけ detectChangesInternal（Targeted）` — L588〜655
    - `開発モード：allViews を全部 checkNoChanges → NG0100` — L568〜571

## テストと直し方

| ファイル（packages/core/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `application_ref_spec.ts` | `attachView / detachView`（692）› `should dirty check attached views`（727）・`should not dirty check detached views`（741）・`should detach attached views if they are destroyed`（780）・`should not allow to attach a view to both, a view container and the ApplicationRef`（802） | 5 節。802 は NG0902 の文を待つが、そのあとの `viewCount` は見ない |
| `application_ref_spec.ts` | `APP_BOOTSTRAP_LISTENER`（161）› `should be called when a component is bootstrapped`（178）、`bootstrap`（188）› `supports passing bootstrap options object`（220） | 3 節。220 は options の形 |
| `application_ref_spec.ts` | `destroy`（282）の 6 つの it、`AppRef`（824）› `stability`（825）› `isStable should fire after a macrotask on init is completed`（967）ほか | 2・6 節。stability の it は zone.js の上 |
| `application_init_spec.ts` | `ApplicationInitStatus`（22）› `with app initializers represented using observables`（93）› `should update the status once all async observable initializers emitted and completed`（121）、`wrong initializers`（177）› `should throw`（184） | 8 節。121 は「流しても complete まで待つ」 |
| `debug/stability_debug_spec.ts` | `provideStabilityDebugging`（13）› `should log pending tasks if application does not stabilize`（34）・`should not log if application stabilizes within 9 seconds`（50） | 9 節。一度安定したあとの保留を書かないことの it は無い |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（結果は表の下）
```

結果は `//packages/core/test:test`（4 つの shard）で、絞り込みの名前ごとに「Ran N of M specs」の N を足した数が、`attachView / detachView` で 6、`ApplicationInitStatus` で 12、`provideStabilityDebugging` で 2、`AppRef stability` で 7、`bootstrap ApplicationRef` で 6、`bootstrap destroy` で 6、どれも 0 failures でした（手元の bazel、2026-11-22）。

直すとしたら、`attachView`（application\_ref.ts L721〜726）の 2 行を入れ替えて、`attachToAppRef` が投げたら push しないようにします。spec は 802 行目の it の `toThrowError` のあとに `expect(appRef.viewCount).toBe(0)` を足すと、今の実装で落ち、入れ替えると通ります（Node で同じ手順を動かして確かめた形）。説明文は、183 行目に `)` を足し、169〜173 行目と 206〜224 行目に「zone.js のアプリの話。zoneless のアプリでは保留のタスク（`PendingTasks`）だけで決まる」と添えます。`tick` の 524 行目には「zoneless では印の付いたビューだけ」、application\_init.ts の 96〜123 行目は Observable を返す例に戻し、stability\_debug\_impl.ts の 31〜32 行目は「最初に安定するまで」とします。

## 聞かれそうな質問

**Q. zoneless のアプリで `setInterval` を回すと、`whenStable` は永遠に待ちますか？**

待ちません。`isStable` は保留のタスクの数だけで決まり（L325〜327）、zoneless では `setInterval` は数に入りません。説明文の 169〜172 行目は zone.js のアプリの話で、そのときは zone に未完了のタスクがある限り `false` です。

**Q. `appRef.tick()` を呼べば、全部のコンポーネントが描き直されますか？**

zoneless では、印の付いたビューだけです。534〜536 行目が `ViewTreeGlobal` を付けないので、signal も `markForCheck` も無いフィールドの変更は描かれません。開発モードでは 2 回目の検査が NG0100 で知らせます。

**Q. `attachView` が NG0902 を投げたら、何も起きていないと考えてよいですか？**

よくありません。724 行目の push が先なので、`viewCount` が 1 増えたまま残り、ビューを destroy しても外れません。アプリを destroy するまで `tick` のたびに並びます。

**Q. `APP_INITIALIZER` と `provideAppInitializer` を混ぜたら、どちらが先ですか？**

provider に並べた順に、全部が同じ時に呼ばれます。`provideAppInitializer` は `multi` の `APP_INITIALIZER` を作るだけで、待つのは `Promise.all` なので一番遅いものまでです（DEMO の 5 つ目の表）。

**Q. `provideStabilityDebugging` は、途中で安定しなくなったときにも教えてくれますか？**

教えません。107〜108 行目が最初の `whenStable` でタイマーを取り消すので、見るのは起動から最初に安定するまでの 9 秒だけです。

## 読み終えて

- `isStable` の説明文の例は 1 つ構文が誤っており、「いつまでも安定しない」「zone の外で流れる」は zone.js のアプリの話（後者は `true` のときだけ）。
- `bootstrap` の説明文は同じ文が 2 回付き、`options` の形を書いていない。`componentTypes` は失敗した型も残す。
- zoneless の `tick()` は印のあるビューだけを検査し、開発モードの 2 回目の検査が NG0100 で差を知らせる。
- `attachView` は NG0902 を投げてもビューを数に残す（push が先）。同じビューの 2 回の attach も数える。
- `APP_INITIALIZER` の「Observable の例」は 2024 年の書き換えで Promise になった。`provideStabilityDebugging` の 9 秒は最初の安定まで。

---

← 前: [spec と issue を読む：core の説明文を固めているもの](../crd/10-crd-tests-issues.md)  
次: [platform と bootstrap の説明文](02-cra-platform.md) →
