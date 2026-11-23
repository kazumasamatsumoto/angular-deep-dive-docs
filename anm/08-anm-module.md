[目次](../README.md) › [animations の説明文の読み残し](README.md) › 第 8 回 / 全 9 回

# provideAnimations と BrowserAnimationsModule の説明文

> platform-browser/animations の module.ts・providers.ts・animations.ts と async の providers.ts、core/src/animation と render3/instructions/animation.ts の未読の行：provideAnimations・provideAnimationsAsync・provideNoopAnimations・withConfig の説明と、設定ごとに本物で起動した記録、新しい animate.enter との関係。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/anm-module)

---

この章で分かること：`@angular/platform-browser/animations` の公開の名前（`BrowserAnimationsModule`・`withConfig`・`provideAnimations`・`NoopAnimationsModule`・`provideNoopAnimations`・`provideAnimationsAsync`）の説明文が約束することを読み、同じアプリを設定ごとに起動して、注入器に何が入り、`[@open]` の state のスタイルと `:enter` と新しい `animate.enter` がいつどうなるかを、本物の 22.2.6 の記録で確かめます。「`withConfig({disableAnimations: true})` は `NoopAnimationsModule` と同じ」は記録でもそのとおりでした。`provideNoopAnimations()` は新しい `animate.enter` を止めません。

読む対象は `packages/platform-browser/animations/src/` の `module.ts`・`providers.ts`・`animations.ts` と `async/src/providers.ts`・`async-animations.ts`、core の `render3/instructions/animation.ts`・`animation/queue.ts`・`animation/interfaces.ts` の残りの行です（../angular、8576f161ae4）。各関数が返す provider の中身と、`AnimationRendererFactory`・`provideAnimationsAsync` の読み込みの仕組みは[旧パッケージの入口の章](../animations/14-animations-legacy-setup.md)で読んだので、ここでは説明文の約束と記録に絞ります。新しい `animate.enter`・`animate.leave` の大筋は[animations の第 1 回](../animations/01-animations-overview.md)から、2 つが同じアプリにあるときは[同居の章](../animations/17-animations-legacy-compat.md)です。

1. [1. trigger・state・style・animate](01-anm-trigger-state.md)
2. [2. transition・query・stagger](02-anm-transition-query.md)
3. [3. AnimationBuilder とプレイヤー](03-anm-builder-players.md)
4. [4. DSL を AST に](04-anm-ast.md)
5. [5. タイムライン](05-anm-timeline.md)
6. [6. 遷移のエンジン](06-anm-engine.md)
7. [7. Web Animations のドライバー](07-anm-driver.md)
8. **8. provideAnimations**（この章）
9. [9. spec と issue](09-anm-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> ここに出てくる名前は、どれも ``@deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23`` が付いた非推奨の API です（v23 で消すかについては #71703、[animations の issue の章](../animations/20-animations-issues.md)）。DEMO は、npm から取った本物の `@angular/animations`・`core`・`common`・`platform-browser`・`compiler` 22.2.6 で同じ JIT のアプリを設定ごとに別のページで起動し、手元の headless Chrome で取った記録の再生です。

## 1. 入口：3 つの「Entry point」

📄 `angular/packages/platform-browser/animations/src/animations.ts` L9–23 （▶ の行: 10–12, 14–16, 18–20, 23）

```ts
 9 │ /**
10 ▶  * @module
11 ▶  * @description
12 ▶  * Entry point for all animation APIs of the animation browser package.
13 │  */
14 ▶ export {ANIMATION_MODULE_TYPE} from '@angular/core';
15 ▶ export {
16 ▶   BrowserAnimationsModule,
17 │   BrowserAnimationsModuleConfig,
18 ▶   NoopAnimationsModule,
19 ▶   provideAnimations,
20 ▶   provideNoopAnimations,
21 │ } from './module';
22 │ 
23 ▶ export * from './private_export';
```

📄 `angular/packages/platform-browser/animations/async/src/async-animations.ts` L8–15 （▶ の行: 12, 14–15）

```ts
 8 │ 
 9 │ /**
10 │  * @module
11 │  * @description
12 ▶  * Entry point for all animation APIs of the animation browser package.
13 │  */
14 ▶ export {provideAnimationsAsync} from './providers';
15 ▶ export * from './private_export';
```

14 行目の `ANIMATION_MODULE_TYPE` は core のトークンを渡し直しているだけです（core の application\_tokens.ts L106、旧パッケージの入口の章の質問）。23 行目の private\_export.ts は `ɵInjectableAnimationEngine` の 1 行です。12 行目の `@module` の説明「Entry point for all animation APIs of the animation browser package.」は、async-animations.ts の 12 行目と、`@angular/animations/browser` の browser.ts L12 にも、同じ文で書かれています。3 つの別々の入口に「animation browser package」という同じ説明が付いています。

📄 `angular/packages/platform-browser/animations/src/providers.ts` L9–29 （▶ の行: 9–13, 15–17, 29）

```ts
 9 ▶ import {
10 ▶   AnimationDriver,
11 ▶   NoopAnimationDriver,
12 ▶   ɵAnimationEngine as AnimationEngine,
13 ▶   ɵAnimationRendererFactory as AnimationRendererFactory,
14 │   ɵAnimationStyleNormalizer as AnimationStyleNormalizer,
15 ▶   ɵWebAnimationsDriver as WebAnimationsDriver,
16 ▶   ɵWebAnimationsStyleNormalizer as WebAnimationsStyleNormalizer,
17 ▶ } from '@angular/animations/browser';
18 │ import {DOCUMENT} from '@angular/common';
19 │ import {
20 │   ANIMATION_MODULE_TYPE,
21 │   inject,
22 │   Inject,
23 │   Injectable,
24 │   NgZone,
25 │   OnDestroy,
26 │   Provider,
27 │   RendererFactory2,
28 │ } from '@angular/core';
29 ▶ import {ɵDomRendererFactory2 as DomRendererFactory2} from '../../index';
```

providers.ts は 9〜17 行目で `@angular/animations/browser` から直接 import します。`provideAnimations` を import するだけで旧エンジンが最初のバンドルに入るのはこの行のためで、`provideAnimationsAsync`（async/src）はここを import しません（旧パッケージの入口の章の 2 節）。29 行目の `ɵDomRendererFactory2` は platform-browser 自身の DOM レンダラーです。

## 2. BrowserAnimationsModule と withConfig

📄 `angular/packages/platform-browser/animations/src/module.ts` L8–39 （▶ の行: 12, 14–15, 20, 23, 25–28, 30, 33–35, 38）

```ts
 8 │ import {
 9 │   ModuleWithProviders,
10 │   NgModule,
11 │   Provider,
12 ▶   ɵperformanceMarkFeature as performanceMarkFeature,
13 │ } from '@angular/core';
14 ▶ // g3-only import {BrowserModule} from '@angular/platform-browser';
15 ▶ import {BrowserModule} from '../../index'; // 3p-only
16 │ 
17 │ import {BROWSER_ANIMATIONS_PROVIDERS, BROWSER_NOOP_ANIMATIONS_PROVIDERS} from './providers';
18 │ 
19 │ /**
20 ▶  * Object used to configure the behavior of {@link BrowserAnimationsModule}
21 │  * @publicApi
22 │  *
23 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
24 │  */
25 ▶ export interface BrowserAnimationsModuleConfig {
26 ▶   /**
27 ▶    *  Whether animations should be disabled. Passing this is identical to providing the
28 ▶    * `NoopAnimationsModule`, but it can be controlled based on a runtime value.
29 │    */
30 ▶   disableAnimations?: boolean;
31 │ }
32 │ 
33 ▶ /**
34 ▶  * Exports `BrowserModule` with additional dependency-injection providers
35 ▶  * for use with animations. See [Animations](guide/animations).
36 │  * @publicApi
37 │  *
38 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
39 │  */
```

26〜28 行目は「`disableAnimations` を渡すのは `NoopAnimationsModule` を入れるのと同じ。ただし実行のときの値で切り替えられる」。`withConfig` は `ngModule: BrowserAnimationsModule` と、真なら Noop の provider を返します（旧パッケージの入口の章の 66〜68 行目）。モジュール自身の `providers`（Browser のもの）と `withConfig` の providers の両方が入り、記録では Noop のほうが使われていました。DEMO の「設定ごとの比べ」で、`importProvidersFrom(BrowserAnimationsModule.withConfig({disableAnimations: true}))` と `importProvidersFrom(NoopAnimationsModule)` は、`ANIMATION_MODULE_TYPE`（`"NoopAnimations"`）・`AnimationDriver`（`NoopAnimationDriver`）・`RendererFactory2`・`AnimationEngine` も、時刻ごとの要素の様子も、開発モードと本番の両方で同じでした。

14〜15 行目の 2 つのコメントは、Google の中のリポジトリ（g3）と公開のビルド（3p）で import の書き方を切り替える印です。34〜35 行目の「`BrowserModule` を export し、アニメーションの provider を足す」のとおり、standalone のアプリで `importProvidersFrom(BrowserAnimationsModule)` と書いても、`BrowserModule` が二重になるエラーは出ませんでした（DEMO、console の errors は「なし」）。

## 3. provideAnimations：同じ provider と、1 つの印

📄 `angular/packages/platform-browser/animations/src/module.ts` L72–97 （▶ の行: 74–75, 80–83, 85–90, 95）

````ts
72 │ 
73 │ /**
74 ▶  * Returns the set of dependency-injection providers
75 ▶  * to enable animations in an application. See [animations guide](guide/animations)
76 │  * to learn more about animations in Angular.
77 │  *
78 │  * @usageNotes
79 │  *
80 ▶  * The function is useful when you want to enable animations in an application
81 ▶  * bootstrapped using the `bootstrapApplication` function. In this scenario there
82 ▶  * is no need to import the `BrowserAnimationsModule` NgModule at all, just add
83 ▶  * providers returned by this function to the `providers` list as show below.
84 │  *
85 ▶  * ```ts
86 ▶  * bootstrapApplication(RootComponent, {
87 ▶  *   providers: [
88 ▶  *     provideAnimations()
89 ▶  *   ]
90 ▶  * });
91 │  * ```
92 │  *
93 │  * @publicApi
94 │  *
95 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
96 │  *
97 │  */
````

80〜83 行目は「`bootstrapApplication` で起動するアプリなら `BrowserAnimationsModule` を import しなくてよい。返る provider を `providers` に足す」（83 行目の「as show below」は shown の誤り）。中身は 2 節のモジュールと同じ配列の写しです（旧パッケージの入口の章の 98〜103 行目）。違いは 1 つだけで、`provideAnimations()` は呼ばれたときに `performanceMarkFeature('NgEagerAnimations')`（旧パッケージの入口の章の同じ引用の 99 行目）で、使った機能の印（`performance.mark('mark_feature_usage', {detail: {feature}})`）を付けます。DEMO で、名前が Animations で終わる印は、`provideAnimations()` が `NgEagerAnimations`、`provideAnimationsAsync()` と `('noop')` が `NgAsyncAnimations` で、`BrowserAnimationsModule`・`withConfig`・`NoopAnimationsModule`・`provideNoopAnimations()` は印がありませんでした。85〜90 行目の例は、置き場所の名前（`RootComponent`）と import を足して strict の tsc 6.0.3 に通すと 0 件でした（4・5 節の例と、旧パッケージの入口の章の 54〜59 行目の `withConfig` の例も同じ）。

## 4. NoopAnimationsModule と provideNoopAnimations：止まるのは旧エンジンだけ

📄 `angular/packages/platform-browser/animations/src/module.ts` L116–139 （▶ の行: 118–120, 124–126, 128–133, 138）

````ts
116 │ 
117 │ /**
118 ▶  * Returns the set of dependency-injection providers
119 ▶  * to disable animations in an application. See [animations guide](guide/animations)
120 ▶  * to learn more about animations in Angular.
121 │  *
122 │  * @usageNotes
123 │  *
124 ▶  * The function is useful when you want to bootstrap an application using
125 ▶  * the `bootstrapApplication` function, but you need to disable animations
126 ▶  * (for example, when running tests).
127 │  *
128 ▶  * ```ts
129 ▶  * bootstrapApplication(RootComponent, {
130 ▶  *   providers: [
131 ▶  *     provideNoopAnimations()
132 ▶  *   ]
133 ▶  * });
134 │  * ```
135 │  *
136 │  * @publicApi
137 │  *
138 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
139 │  */
````

124〜126 行目は「`bootstrapApplication` で起動して、アニメーションを止めたいとき（たとえばテスト）」。`NoopAnimationsModule` の説明（旧パッケージの入口の章の 105〜106 行目）は「アニメーションを止めるために import しなければならない null のプレイヤー」で、モジュールをプレイヤーと呼んでいます。中身は `NoopAnimationDriver` を入れる provider で、プレイヤー（`NoopAnimationPlayer`）を作るのはそのドライバーです（[前回](07-anm-driver.md)の 1 節）。

DEMO の `provideNoopAnimations()` では、`bootstrapApplication` の Promise が解決した時点（16ms）で `[@open]` の要素は state の `height: 40px` を inline に持ち、`getAnimations()` は 0 個、`:enter` の要素の opacity は 1 でした（動かずにすぐ終わる）。ところが同じページの `animate.enter="anm-mod-in"` の要素には、クラスが付いて CSS のアニメーションが 1 つ動いていました。`animate.enter` を止めるのは core の `ANIMATIONS_DISABLED` というトークンで、それを provide するのは TestBed（`animationsEnabled`、test\_bed\_compiler.ts L1006）だけです（[止める仕組みの章](../animations/08-animations-disabled.md)）。`provideNoopAnimations()` は旧エンジンのドライバーを替えるだけなので、新しい API には効きません。

## 5. provideAnimationsAsync：読み込むまで描かない

📄 `angular/packages/platform-browser/animations/async/src/providers.ts` L19–51 （▶ の行: 21, 28–29, 33–36, 39–43, 46, 50）

````ts
19 │ import {ɵDomRendererFactory2 as DomRendererFactory2} from '../../../index';
20 │ 
21 ▶ import {AsyncAnimationRendererFactory} from './async_animation_renderer';
22 │ 
23 │ /**
24 │  * Returns the set of dependency-injection providers
25 │  * to enable animations in an application. See [animations guide](guide/animations)
26 │  * to learn more about animations in Angular.
27 │  *
28 ▶  * When you use this function instead of the eager `provideAnimations()`, animations won't be
29 ▶  * rendered until the renderer is loaded.
30 │  *
31 │  * @usageNotes
32 │  *
33 ▶  * The function is useful when you want to enable animations in an application
34 ▶  * bootstrapped using the `bootstrapApplication` function. In this scenario there
35 ▶  * is no need to import the `BrowserAnimationsModule` NgModule at all, just add
36 ▶  * providers returned by this function to the `providers` list as show below.
37 │  *
38 │  * ```ts
39 ▶  * bootstrapApplication(RootComponent, {
40 ▶  *   providers: [
41 ▶  *     provideAnimationsAsync()
42 ▶  *   ]
43 ▶  * });
44 │  * ```
45 │  *
46 ▶  * @param type pass `'noop'` as argument to disable animations.
47 │  *
48 │  * @publicApi
49 │  *
50 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
51 │  */
````

28〜29 行目は「先に読み込む `provideAnimations()` の代わりにこれを使うと、レンダラーが読み込まれるまでアニメーションは描かれない」、46 行目は「`'noop'` を渡すとアニメーションを止める」です。DEMO の `provideAnimationsAsync()` では、Promise が解決した時点（15ms）で `[@open]` の要素は高さ 0px・inline の style なし・`getAnimations()` 0 個で、次の `setTimeout(0)`（21ms）には読み込みが終わって、state へのアニメーションと `:enter` が動いていました（300ms で `height: 40px`）。`'noop'` では 21ms の時点で動かずに `height: 40px` でした。この記録は 1 つのファイルに束ねたので、読み込みは Promise 1 つ分で終わります。CLI のアプリでは別のチャンクを取りに行くので、その間が長くなります。注入器から取ると、`ANIMATION_MODULE_TYPE` はどちらも入っていて、`AnimationDriver` と `AnimationEngine` は無し（`null`）でした。旧エンジンはファクトリーの中で作られ、DI には置かれないからです（旧パッケージの入口の章の 2 節）。

## 6. 何も入れないと

DEMO の「何も入れない」では、`RendererFactory2` は `DomRendererFactory2` のままで、開発モードは `NG05105: Unexpected synthetic property @open found.` が `ErrorHandler` から console に出て、その回の描画が止まりました（同じページの `animate.enter` の要素にもクラスが付かなかった）。本番ではエラーは出ず、`animate.enter` は動き、`[@open]` の要素は state のスタイルもアニメーションも持ちませんでした（旧パッケージの入口の章の 4 節の `throwOnSyntheticProps` が開発モードだけ）。

## 7. core の側の残り：新しい API の命令の説明文

📄 `angular/packages/core/src/render3/instructions/animation.ts` L188–200 （▶ の行: 190–191, 193–194, 196, 198, 200）

```ts
188 │ 
189 │ /**
190 ▶  * Instruction to handle the `(animate.enter)` behavior for event bindings, aka when
191 ▶  * a user wants to use a custom animation function rather than a class.
192 │  *
193 ▶  * @param value The value bound to `(animate.enter)`, an AnimationFunction.
194 ▶  * @returns This function returns itself so that it may be chained.
195 │  *
196 ▶  * @codeGenApi
197 │  */
198 ▶ export function ɵɵanimateEnterListener(value: AnimationFunction): typeof ɵɵanimateEnterListener {
199 │   performanceMarkFeature('NgAnimateEnter');
200 ▶ 
```

📄 `angular/packages/core/src/render3/instructions/animation.ts` L399–414 （▶ の行: 401–404, 406–407, 409, 411, 414）

```ts
399 │ 
400 │ /**
401 ▶  * Instruction to handle the `(animate.leave)` behavior for event bindings, aka when
402 ▶  * a user wants to use a custom animation function rather than a class. It registers
403 ▶  * a leave animation function in the LView to be run at right before removal from the
404 ▶  * DOM.
405 │  *
406 ▶  * @param value The value bound to `(animate.leave)`, an AnimationFunction.
407 ▶  * @returns This function returns itself so that it may be chained.
408 │  *
409 ▶  * @codeGenApi
410 │  */
411 ▶ export function ɵɵanimateLeaveListener(value: AnimationFunction): typeof ɵɵanimateLeaveListener {
412 │   performanceMarkFeature('NgAnimateLeave');
413 │ 
414 ▶   if ((typeof ngServerMode !== 'undefined' && ngServerMode) || !areAnimationSupported) {
```

`(animate.enter)="fn($event)"` と `(animate.leave)` の命令です。中身は[関数で動かす章](../animations/07-animations-functions.md)が読んでいます。194・407 行目の「この関数は自分自身を返すので、つなげて呼べる」のとおり、198 行目の戻り値の型は `typeof ɵɵanimateEnterListener` で、早く帰る行も含めて自分を返します（`@codeGenApi` は「コンパイラーが出すコードだけが呼ぶ」の印）。402〜404 行目の「DOM から外す直前に走る leave の関数を LView に登録する」は、[消すのを遅らせる章](../animations/09-animations-leave-removal.md)の流れです。

📄 `angular/packages/core/src/render3/instructions/animation.ts` L9–48 （▶ の行: 13, 18, 20–21, 25, 48）

```ts
 9 │ import {
10 │   AnimationClassBindingFn,
11 │   AnimationCallbackEvent,
12 │   AnimationFunction,
13 ▶   MAX_ANIMATION_TIMEOUT,
14 │ } from '../../animation/interfaces';
15 │ import {getLView, getCurrentTNode} from '../state';
16 │ import {RENDERER, INJECTOR, CONTEXT, LView, ID} from '../interfaces/view';
17 │ import {getNativeByTNode} from '../util/view_utils';
18 ▶ import {performanceMarkFeature} from '../../util/performance';
19 │ import {Renderer} from '../interfaces/renderer';
20 ▶ import {NgZone} from '../../zone';
21 ▶ import {determineLongestAnimation, allLeavingAnimations} from '../../animation/longest_animation';
22 │ import {TNode} from '../interfaces/node';
23 │ import {promiseWithResolvers} from '../../util/promise_with_resolvers';
24 │ 
25 ▶ import {
26 │   addAnimationToLView,
27 │   areAnimationsDisabled,
28 │   areAnimationSupported,
29 │   assertAnimationTypes,
30 │   assertElementNodes,
31 │   cancelAnimationsIfRunning,
32 │   cleanupAfterLeaveAnimations,
33 │   cleanupEnterClassData,
34 │   clearLeavingNodes,
35 │   clearLViewNodeAnimationResolvers,
36 │   enterClassMap,
37 │   getClassListFromValue,
38 │   getEventTarget,
39 │   getLViewEnterAnimations,
40 │   getLViewLeaveAnimations,
41 │   isLongestAnimation,
42 │   leaveAnimationFunctionCleanup,
43 │   longestAnimations,
44 │   noOpAnimationComplete,
45 │   trackEnterClasses,
46 │   trackLeavingNodes,
47 │ } from '../../animation/utils';
48 ▶ import {initializeAnimationQueueScheduler, queueEnterAnimations} from '../../animation/queue';
```

この命令のファイルが読み込むものです。13 行目の `MAX_ANIMATION_TIMEOUT`、18 行目の `performanceMarkFeature`（`NgAnimateEnter`・`NgAnimateLeave` の印。DEMO の印の一覧にも出ている）、21 行目のいちばん長いアニメーション（[その章](../animations/06-animations-longest.md)）、48 行目の待ち行列（[その章](../animations/04-animations-queue.md)）。最新の main では 259d1b0de08（2026-09-27、`refactor(core): make the animate.enter and animate.leave runtime tree-shakable`）が、ここに `enableAnimationRuntimeSupport` の import を足し、命令が呼ばれたときだけアニメーションの仕組みを組み込む形に変えています（コミットの本文では、`ng new` のアプリで 2.2 KB 減る）。

📄 `angular/packages/core/src/animation/queue.ts` L63–87 （▶ の行: 64, 68–69, 71, 74, 78, 80, 82, 84）

```ts
63 │ 
64 ▶ export function removeAnimationsFromQueue(
65 │   injector: Injector,
66 │   animationFns: VoidFunction | VoidFunction[],
67 │ ) {
68 ▶   const animationQueue = injector.get(ANIMATION_QUEUE);
69 ▶   if (Array.isArray(animationFns)) {
70 │     for (const animateFn of animationFns) {
71 ▶       animationQueue.queue.delete(animateFn);
72 │     }
73 │   } else {
74 ▶     animationQueue.queue.delete(animationFns);
75 │   }
76 │ }
77 │ 
78 ▶ export function removeFromAnimationQueue(injector: Injector, animationData: AnimationLViewData) {
79 │   const animationQueue = injector.get(ANIMATION_QUEUE);
80 ▶   if (animationData.detachedLeaveAnimationFns) {
81 │     for (const animationFn of animationData.detachedLeaveAnimationFns) {
82 ▶       animationQueue.queue.delete(animationFn);
83 │     }
84 ▶     animationData.detachedLeaveAnimationFns = undefined;
85 │   }
86 │ }
87 │ 
```

📄 `angular/packages/core/src/animation/interfaces.ts` L56–66 （▶ の行: 56, 58–59, 61–64）

```ts
56 ▶ export type AnimationFunction = (event: AnimationCallbackEvent) => void;
57 │ 
58 ▶ export type RunEnterAnimationFn = VoidFunction;
59 ▶ export type RunLeaveAnimationFn = () => {promise: Promise<void>; resolve: VoidFunction};
60 │ 
61 ▶ export interface LongestAnimation {
62 ▶   animationName: string | undefined;
63 ▶   propertyName: string | undefined;
64 ▶   duration: number;
65 │ }
66 │ 
```

待ち行列から外す 2 つの関数です。64 行目は、leave を走らせる要素にまだ enter が積まれていれば、その enter を外します（node\_animations.ts L58〜59 の `runLeaveAnimationsWithCallback` から）。78 行目は、外されるビューに積まれた leave の関数をまとめて外し、84 行目で印を消します（`@for` が外したビューを付け直すとき、control\_flow.ts L451 の `attach` → L603 の `clearDetachAnimationList` → L618 から。[並べ替えの章](../animations/12-animations-leave-reorder.md)）。61〜65 行目の `LongestAnimation` は、いちばん長いアニメーションを覚える形で、utils.ts L113 の `WeakMap<HTMLElement, LongestAnimation>` に入ります。58・59 行目の 2 つの型は、enter と leave の関数の形です。

> **🧪 DEMO — 設定ごとに起動した、本物の 22.2.6 のアプリの記録（記録の再生）**
>
> どの設定も同じアプリです。`[@open]="true"`（state true は `height: 40px`、`transition('* => *', animate(200))`）の要素、`:enter` で 200ms フェードインする `@fadeIn` の要素、`animate.enter="anm-mod-in"`（200ms の CSS アニメーション）の要素を置き、設定ごとに別のページで `bootstrapApplication(Root, {providers})` して、手元の headless Chrome 157 で記録しました。時刻は `bootstrapApplication` を呼んでからの ms です。
>
> 時刻ごとの要素の様子を見る設定を選びます。
>
> ボタンを押すと、その設定の時刻ごとの表が出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/anm-module)

## ここまでの呼び出し（設定から、最初の描画まで）

- 👤 `bootstrapApplication(App, {providers: [provideAnimations()]})` — あなたの main.ts
  - `performanceMarkFeature('NgEagerAnimations')` — module.ts L99 — *provideAnimations だけ*
  - `[...BROWSER_ANIMATIONS_PROVIDERS]` — module.ts L102 — *モジュールも同じ配列（withConfig(true) は Noop の配列を後ろに）*
    - `RendererFactory2 → AnimationRendererFactory` — providers.ts — *旧パッケージの入口の章*
  - `provideAnimationsAsync()` なら `AsyncAnimationRendererFactory` — async/src/providers.ts L52 — *最初は DOM のレンダラー。読み込み後に差し替え*
  - `ɵɵanimateEnter` / `ɵɵanimateEnterListener` — core render3/instructions/animation.ts — *旧エンジンの設定に関係なく動く。止めるのは ANIMATIONS\_DISABLED*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `packages/platform-browser/animations/test/noop_animations_module_spec.ts` | `NoopAnimationsModule`（15）・`BrowserAnimationsModule with disableAnimations = true`（23）・`provideNoopAnimations()`（33）の 3 つから `noopAnimationTests()` を呼ぶ › `should flush and fire callbacks when the zone becomes stable`（42）・`should handle leave animation callbacks even if the element is destroyed in the process`（89） | 4 節と 2 節の「Noop でもコールバックは呼ばれる」。どの it も先頭の `if (isNode)` で、Node では何もせず終わる |
| `packages/core/test/legacy_animation/legacy_animation_integration_spec.ts` | `animation modules`（77）› `should hint at BrowserAnimationsModule being used`（78）・`should hint at NoopAnimationsModule being used`（89）・`should hint at NoopAnimationsModule being used when BrowserAnimationsModule is provided with disabled animations`（100） | 2 節の 26〜28 行目（`ANIMATION_MODULE_TYPE` だけを見る） |
| `packages/platform-browser/animations/async/test/animation_renderer_spec.ts` | `custom scheduling`（416）› `should be able to use a custom loading scheduler`（417）・`should handle scheduling error`（440）ほか | 5 節の読み込み（読み込みの前に描かれないことを時刻で見る it は無い） |

📄 `走らせたコマンドと結果（2026-11-23）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-browser/animations/test:test //packages/platform-browser/animations/test:test_web_chromium \
    //packages/platform-browser/animations/async/test:test //packages/platform-browser/animations/async/test:test_web_chromium \
    --nocache_test_results --test_output=all
//packages/platform-browser/animations/test:test                    PASSED   6 specs, 0 failures
//packages/platform-browser/animations/test:test_web_chromium       PASSED   21 passed, 0 failed, 1 skipped
//packages/platform-browser/animations/async/test:test              PASSED   1 spec, 0 failures
//packages/platform-browser/animations/async/test:test_web_chromium PASSED   15 passed, 0 failed, 1 skipped
```

`provideAnimations()` と `provideNoopAnimations()` の `ANIMATION_MODULE_TYPE` を名前で確かめる it は、core の `animation modules` には無く（モジュールの 3 本だけ）、`provideNoopAnimations()` が `animate.enter` を止めないことを確かめる it もありません。足すなら core の同じ describe に、`providers: [provideNoopAnimations()]` の形を 1 本、acceptance の animation\_spec.ts に「Noop の旧エンジンの下でも animate.enter のクラスが付く」を 1 本です。説明文を直すなら、module.ts の L105〜106（`NoopAnimationsModule` を「null のプレイヤー」と呼んでいる）、L83 と async/src/providers.ts の 36 行目の「as show below」、3 つの入口の 12 行目の同じ説明です。

## 聞かれそうな質問

**Q. `BrowserAnimationsModule.withConfig({disableAnimations: true})` と `NoopAnimationsModule` に違いはありますか？**

記録の範囲ではありません。`ANIMATION_MODULE_TYPE`・ドライバー・レンダラーの工場・エンジンが同じで、要素の様子も同じでした。違いは 26〜28 行目のとおり、真偽を実行のときの値で決められることだけです。

**Q. `provideNoopAnimations()` を入れると、`animate.enter` も止まりますか？**

止まりません。DEMO では `animate.enter` のクラスが付いて CSS のアニメーションが動きました。止めるのは core の `ANIMATIONS_DISABLED` で、アプリでは誰も provide せず、TestBed が `animationsEnabled` から入れます。

**Q. `provideAnimationsAsync()` にすると、最初の描画はどうなりますか？**

旧エンジンを読み込むまで、`[@x]` の state のスタイルもアニメーションもありません（28〜29 行目。DEMO の 15ms は高さ 0px）。読み込んだあとに記録しておいた呼び出しを流し直すので、state へのアニメーションが動きます。`animate.enter` は待たずに動きます。

**Q. アプリが `provideAnimations()` を使っているかは、外から分かりますか？**

Chrome の Performance パネルなどで `mark_feature_usage` の印を見ると、`NgEagerAnimations`（`provideAnimations()`）か `NgAsyncAnimations`（`provideAnimationsAsync()`）が付きます。`BrowserAnimationsModule` と Noop の 2 つは印を付けません。コードの中では `ANIMATION_MODULE_TYPE` を inject します（angular/components の cdk/overlay がそうしている）。

## 読み終えて

- 6 つの公開の名前は、どれも旧エンジンの provider の組み合わせを返すだけ。`provideAnimations()` だけが `NgEagerAnimations` の印を付ける。
- `withConfig({disableAnimations: true})` は `NoopAnimationsModule` と注入器の中身も振る舞いも同じだった。
- Noop の設定が止めるのは旧エンジンのドライバーだけで、新しい `animate.enter` は動く。止めるのは `ANIMATIONS_DISABLED`（TestBed）。
- `provideAnimationsAsync()` は読み込むまで state のスタイルも付けず、ドライバーとエンジンを DI に置かない。
- 説明文の小さな食い違いは、`NoopAnimationsModule` を「null のプレイヤー」と呼ぶ文、「as show below」、3 つの入口の同じ説明。

---

← 前: [Web Animations のドライバーとスタイルの小道具](07-anm-driver.md)  
次: [spec と issue を読む：animations の説明文を固めているもの](09-anm-tests-issues.md) →
