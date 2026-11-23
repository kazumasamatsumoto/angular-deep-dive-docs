[目次](../README.md) › [animations の説明文の読み残し](README.md) › 第 4 回 / 全 9 回

# DSL を AST にする：animation\_ast\_builder と transition\_factory

> animations/browser/src/dsl の animation\_ast\_builder.ts・animation\_ast.ts・animation.ts・animation\_transition\_factory.ts・animation\_transition\_instruction.ts・animation\_trigger.ts・animation\_transition\_expr.ts の未読の行：誤った DSL の検査とエラー（開発モードと本番）、働かない検査、:self の正規表現、遷移の式の照合、state のスタイルと params の既定。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/anm-ast)

---

この章で分かること：`buildAnimationAst` が DSL を確かめるとき、どの誤りをどの行で見つけ、どの誤りを見逃して遷移のときまで持ち越すか。わざと誤った DSL を 22 通り、本物の 22.2.6 の `buildAnimationAst` と 3 つの入口（`ɵAnimation`・`AnimationBuilder`・コンポーネントの登録）に通し、開発モードと本番のエラーの文を表にします。あわせて、遷移の式の照合と state のスタイル・params の既定を、本物の `buildTrigger` と `AnimationTransitionFactory` で確かめます。冒頭のコメントと違うところが 2 つありました。「並行の animate が少しでも重なればエラー」は、新しい区間が古い区間に収まるときだけです。style の `{{ }}` を params で確かめる行は、params を入れる行が無いので一度も働きません。`:self` を末尾に書くと止まる不具合は、正規表現の `\s` を直すだけでは直らないことも、写しを束ねて確かめました。

読む対象は `packages/animations/browser/src/dsl/` の `animation_ast_builder.ts`・`animation_ast.ts`・`animation.ts`・`animation_transition_factory.ts`・`animation_transition_instruction.ts`・`animation_trigger.ts`・`animation_transition_expr.ts` の、まだ引かれていない行です（../angular、8576f161ae4）。`buildAnimationAst` の入口、`visitTrigger`・`visitTransition`・`visitAnimate`・`visitQuery`、式の読み方、`AnimationTrigger` の組み立てと `build` の前半は[旧 DSL とキーフレームの章](../animations/15-animations-legacy-dsl.md)の 2〜5 節で読みました。ここではその間の行（state・style・keyframes・reference・stagger・selector・timing）を読みます。DEMO の作り方は[第 1 回](01-anm-trigger-state.md)の冒頭の囲みと同じで、AST の関数は束ねるときに export を 1 行足して呼んでいます（中身は変えていない）。

1. [1. trigger・state・style・animate](01-anm-trigger-state.md)
2. [2. transition・query・stagger](02-anm-transition-query.md)
3. [3. AnimationBuilder とプレイヤー](03-anm-builder-players.md)
4. **4. DSL を AST に**（この章）
5. [5. タイムライン](05-anm-timeline.md)
6. [6. 遷移のエンジン](06-anm-engine.md)
7. [7. Web Animations のドライバー](07-anm-driver.md)
8. [8. provideAnimations](08-anm-module.md)
9. [9. spec と issue](09-anm-tests-issues.md)

## 1. AST の形

📄 `angular/packages/animations/browser/src/dsl/animation_ast.ts` L31–58 （▶ の行: 31–33, 36, 39–42, 45, 48, 52–53, 55）

```ts
31 ▶ export interface Ast<T extends AnimationMetadataType> {
32 ▶   type: T;
33 ▶   options: AnimationOptions | null;
34 │ }
35 │ 
36 ▶ export interface TriggerAst extends Ast<AnimationMetadataType.Trigger> {
37 │   type: AnimationMetadataType.Trigger;
38 │   name: string;
39 ▶   states: StateAst[];
40 ▶   transitions: TransitionAst[];
41 ▶   queryCount: number;
42 ▶   depCount: number;
43 │ }
44 │ 
45 ▶ export interface StateAst extends Ast<AnimationMetadataType.State> {
46 │   type: AnimationMetadataType.State;
47 │   name: string;
48 ▶   style: StyleAst;
49 │ }
50 │ 
51 │ export interface TransitionAst extends Ast<AnimationMetadataType.Transition> {
52 ▶   matchers: Array<
53 ▶     (fromState: string, toState: string, element: any, params: {[key: string]: any}) => boolean
54 │   >;
55 ▶   animation: Ast<AnimationMetadataType>;
56 │   queryCount: number;
57 │   depCount: number;
58 │ }
```

📄 `angular/packages/animations/browser/src/dsl/animation_ast.ts` L95–119 （▶ の行: 96–99, 101, 105, 109, 113, 116–118）

```ts
 95 │ export interface QueryAst extends Ast<AnimationMetadataType.Query> {
 96 ▶   selector: string;
 97 ▶   limit: number;
 98 ▶   optional: boolean;
 99 ▶   includeSelf: boolean;
100 │   animation: Ast<AnimationMetadataType>;
101 ▶   originalSelector: string;
102 │ }
103 │ 
104 │ export interface StaggerAst extends Ast<AnimationMetadataType.Stagger> {
105 ▶   timings: AnimateTimings;
106 │   animation: Ast<AnimationMetadataType>;
107 │ }
108 │ 
109 ▶ export interface TimingAst {
110 │   duration: number;
111 │   delay: number;
112 │   easing: string | null;
113 ▶   dynamic?: boolean;
114 │ }
115 │ 
116 ▶ export interface DynamicTimingAst extends TimingAst {
117 ▶   strValue: string;
118 ▶   dynamic: true;
119 │ }
```

AST（構文木）は、メタデータと同じ `type` の番号（[第 1 回](01-anm-trigger-state.md)の 1 節）を持つオブジェクトで、31〜33 行目のとおりどの節も `options` を持ちます。41〜42 行目の `queryCount`・`depCount` は、エンジンが「この trigger は query や animateChild を使うか」を知るための数です。52〜53 行目のとおり、transition の式はここで関数の配列（`matchers`）になっています。96〜101 行目の QueryAst は、正規化した selector と、書いたままの `originalSelector`（NG03014 の文に使う）を両方持ちます。113 行目と 116〜118 行目は、`'{{ time }}'` のような timings を「あとで読む」印です（7 節）。

## 2. 3 つの入口と、包みのエラー

📄 `angular/packages/animations/browser/src/dsl/animation.ts` L26–45 （▶ の行: 32–36, 38–40）

```ts
26 │ export class Animation {
27 │   private _animationAst: Ast<AnimationMetadataType>;
28 │   constructor(
29 │     private _driver: AnimationDriver,
30 │     input: AnimationMetadata | AnimationMetadata[],
31 │   ) {
32 ▶     const errors: Error[] = [];
33 ▶     const warnings: string[] = [];
34 ▶     const ast = buildAnimationAst(_driver, input, errors, warnings);
35 ▶     if (errors.length) {
36 ▶       throw validationFailed(errors);
37 │     }
38 ▶     if (typeof ngDevMode === 'undefined' || ngDevMode) {
39 ▶       if (warnings.length) {
40 ▶         warnValidation(warnings);
41 │       }
42 │     }
43 │     this._animationAst = ast;
44 │   }
45 │ 
```

📄 `angular/packages/animations/browser/src/dsl/animation.ts` L46–78 （▶ の行: 53–54, 61, 64–66, 73–74）

```ts
46 │   buildTimelines(
47 │     element: any,
48 │     startingStyles: ɵStyleDataMap | Array<ɵStyleDataMap>,
49 │     destinationStyles: ɵStyleDataMap | Array<ɵStyleDataMap>,
50 │     options: AnimationOptions,
51 │     subInstructions?: ElementInstructionMap,
52 │   ): AnimationTimelineInstruction[] {
53 ▶     const start = Array.isArray(startingStyles)
54 ▶       ? normalizeStyles(startingStyles)
55 │       : <ɵStyleDataMap>startingStyles;
56 │     const dest = Array.isArray(destinationStyles)
57 │       ? normalizeStyles(destinationStyles)
58 │       : <ɵStyleDataMap>destinationStyles;
59 │     const errors: any = [];
60 │     subInstructions = subInstructions || new ElementInstructionMap();
61 ▶     const result = buildAnimationTimelines(
62 │       this._driver,
63 │       element,
64 ▶       this._animationAst,
65 ▶       ENTER_CLASSNAME,
66 ▶       LEAVE_CLASSNAME,
67 │       start,
68 │       dest,
69 │       options,
70 │       subInstructions,
71 │       errors,
72 │     );
73 ▶     if (errors.length) {
74 ▶       throw buildingFailed(errors);
75 │     }
76 │     return result;
77 │   }
78 │ }
```

📄 `angular/packages/animations/browser/src/dsl/animation_trigger.ts` L14–21 （▶ の行: 14, 19）

```ts
14 ▶ export function buildTrigger(
15 │   name: string,
16 │   ast: TriggerAst,
17 │   normalizer: AnimationStyleNormalizer,
18 │ ): AnimationTrigger {
19 ▶   return new AnimationTrigger(name, ast, normalizer);
20 │ }
21 │ 
```

`buildAnimationAst` は誤りを投げずに `errors` 配列に溜めるので（[旧 DSL の章](../animations/15-animations-legacy-dsl.md)の 2 節）、投げるのは呼んだ側です。呼ぶ所は 3 つあり、包みの番号が違います。DEMO の「入口」で、同じ `[style('red'), animate('-1s')]` を通しました。

| 入口 | 開発モード（記録） | 本番 |
| --- | --- | --- |
| `new ɵAnimation(driver, …)`（34〜36 行目） | NG03500: animation validation failed: ／ NG03002 ／ NG03000 ／ NG03100 | `NG03500` |
| `AnimationBuilder.build(…)`（timeline\_animation\_engine.ts L57〜59） | NG03503: Unable to build the animation due to the following errors: …（同じ 3 つ） | `NG03503` |
| コンポーネントの `animations`（`registerTrigger`） | NG03404: The animation trigger "t" has failed to build due to the following errors: … | `NG03404` |

`ɵAnimation`（26 行目）は、エンジンからは使われていません。`new Animation(` を grep すると、packages の中で呼ぶのは animations/browser/test/dsl/animation\_spec.ts の L1458（spec の補助関数 `invokeAnimationSequence`）だけでした。53〜58 行目で配列の開始・終わりのスタイルを 1 つにまとめ、61〜72 行目でタイムラインを作り、73〜74 行目で NG03501 を投げます。38〜42 行目の警告（知らない CSS プロパティ）は開発モードだけです。コンポーネントの登録の側は、19 行目の `buildTrigger` が `new AnimationTrigger` を返すだけで、ここでは何も確かめません。

## 3. 冒頭のコメントの約束と、重なりの検査

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L80–118 （▶ の行: 80–81, 89–93, 95–99, 102–103, 105–106, 110, 112–115）

```ts
 80 ▶ const SELF_TOKEN = ':self';
 81 ▶ const SELF_TOKEN_REGEX = /* @__PURE__ */ new RegExp(`s*${SELF_TOKEN}s*,?`, 'g');
 82 │ 
 83 │ /*
 84 │  * [Validation]
 85 │  * The visitor code below will traverse the animation AST generated by the animation verb functions
 86 │  * (the output is a tree of objects) and attempt to perform a series of validations on the data. The
 87 │  * following corner-cases will be validated:
 88 │  *
 89 ▶  * 1. Overlap of animations
 90 ▶  * Given that a CSS property cannot be animated in more than one place at the same time, it's
 91 ▶  * important that this behavior is detected and validated. The way in which this occurs is that
 92 ▶  * each time a style property is examined, a string-map containing the property will be updated with
 93 ▶  * the start and end times for when the property is used within an animation step.
 94 │  *
 95 ▶  * If there are two or more parallel animations that are currently running (these are invoked by the
 96 ▶  * group()) on the same element then the validator will throw an error. Since the start/end timing
 97 ▶  * values are collected for each property then if the current animation step is animating the same
 98 ▶  * property and its timing values fall anywhere into the window of time that the property is
 99 ▶  * currently being animated within then this is what causes an error.
100 │  *
101 │  * 2. Timing values
102 ▶  * The validator will validate to see if a timing value of `duration delay easing` or
103 ▶  * `durationNumber` is valid or not.
104 │  *
105 ▶  * (note that upon validation the code below will replace the timing data with an object containing
106 ▶  * {duration,delay,easing}.
107 │  *
108 │  * 3. Offset Validation
109 │  * Each of the style() calls are allowed to have an offset value when placed inside of keyframes().
110 ▶  * Offsets within keyframes() are considered valid when:
111 │  *
112 ▶  *   - No offsets are used at all
113 ▶  *   - Each style() entry contains an offset value
114 ▶  *   - Each offset is between 0 and 1
115 ▶  *   - Each offset is greater to or equal than the previous one
116 │  *
117 │  * Otherwise an error will be thrown.
118 │  */
```

89〜99 行目は「同じプロパティを同じ時間に 2 か所で動かしてはいけない。各プロパティの開始と終わりの時刻を覚え、並行の animate の時間帯が、そのプロパティが動いている時間帯の**どこかに入れば**エラー」です。実装は次の 2 つの引用です。

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L378–403 （▶ の行: 379–383, 390–393, 400–401）

```ts
378 │   private _validateStyleAst(ast: StyleAst, context: AnimationAstBuilderContext): void {
379 ▶     const timings = context.currentAnimateTimings;
380 ▶     let endTime = context.currentTime;
381 ▶     let startTime = context.currentTime;
382 ▶     if (timings && startTime > 0) {
383 ▶       startTime -= timings.duration + timings.delay;
384 │     }
385 │ 
386 │     ast.styles.forEach((tuple) => {
387 │       if (typeof tuple === 'string') return;
388 │ 
389 │       tuple.forEach((value, prop) => {
390 ▶         if (typeof ngDevMode === 'undefined' || ngDevMode) {
391 ▶           if (!this._driver.validateStyleProperty(prop)) {
392 ▶             tuple.delete(prop);
393 ▶             context.unsupportedCSSPropertiesFound.add(prop);
394 │             return;
395 │           }
396 │         }
397 │ 
398 │         // This is guaranteed to have a defined Map at this querySelector location making it
399 │         // safe to add the assertion here. It is set as a default empty map in prior methods.
400 ▶         const collectedStyles = context.collectedStyles.get(context.currentQuerySelector!)!;
401 ▶         const collectedEntry = collectedStyles.get(prop);
402 │         let updateCollectedStyle = true;
403 │         if (collectedEntry) {
```

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L404–436 （▶ の行: 404–407, 409, 418, 424, 427–428, 431–433）

```ts
404 ▶           if (
405 ▶             startTime != endTime &&
406 ▶             startTime >= collectedEntry.startTime &&
407 ▶             endTime <= collectedEntry.endTime
408 │           ) {
409 ▶             context.errors.push(
410 │               invalidParallelAnimation(
411 │                 prop,
412 │                 collectedEntry.startTime,
413 │                 collectedEntry.endTime,
414 │                 startTime,
415 │                 endTime,
416 │               ),
417 │             );
418 ▶             updateCollectedStyle = false;
419 │           }
420 │ 
421 │           // we always choose the smaller start time value since we
422 │           // want to have a record of the entire animation window where
423 │           // the style property is being animated in between
424 ▶           startTime = collectedEntry.startTime;
425 │         }
426 │ 
427 ▶         if (updateCollectedStyle) {
428 ▶           collectedStyles.set(prop, {startTime, endTime});
429 │         }
430 │ 
431 ▶         if (context.options) {
432 ▶           validateStyleParams(value, context.options, context.errors);
433 ▶         }
434 │       });
435 │     });
436 │   }
```

405〜407 行目の条件は「新しい区間の開始が前の開始以上で、**終わりが前の終わり以下**」、つまり新しい区間が前の区間に**収まる**ときだけです。DEMO の「誤った DSL」の記録は次のとおりでした。

| group の中身（どれも opacity） | 記録 |
| --- | --- |
| `animate('2s', …)`、`animate('1s', …)` | NG03010「… between the times of "0ms" and "2000ms" is also being animated in a parallel animation between the times of "0ms" and "1000ms"」 |
| `animate('1s', …)`、`animate('2s', …)`（順を逆に） | エラーなし。2 つの Web Animation（1000ms と 2000ms）が同じ opacity を同時に動かす（[第 2 回](02-anm-transition-query.md)の 4 節） |
| `animate('1s', …)`、`animate('500ms 600ms', …)` | エラーなし。検査は 382〜383 行目で delay を含めて 0〜1100ms と数え、0〜1000ms に収まらないため。実際には 600〜1000ms で 2 つが同じ opacity を動かす |

3 つ目のように実際に重なる区間があっても、検査に掛かりません。424 行目で開始の小さいほうを残し、418 行目でエラーのときは覚え直さない、という更新の仕方なので、短いものを後に書いたときだけ見つかります。この形は 16c8167886d（2017-04-26）からで、spec（animation\_spec.ts L105 の it）も「前の区間に収まる」形の 1 本だけです。390〜396 行目は開発モードだけの「ドライバーが知らないプロパティは消して警告」で、本番ではこの `if` ごと消えます。DEMO で `style({colour: 'red'})` は、開発モードでは警告「The following provided properties are not recognized: colour」が出て keyframes に何も残らない 100ms の Web Animation、本番では消されずに残り、Web Animation は作られませんでした。

## 4. state と params：働かない検査

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L197–236 （▶ の行: 209–213, 217–219, 225–226, 234）

```ts
197 │     return {
198 │       type: AnimationMetadataType.Trigger,
199 │       name: metadata.name,
200 │       states,
201 │       transitions,
202 │       queryCount,
203 │       depCount,
204 │       options: null,
205 │     };
206 │   }
207 │ 
208 │   visitState(metadata: AnimationStateMetadata, context: AnimationAstBuilderContext): StateAst {
209 ▶     const styleAst = this.visitStyle(metadata.styles, context);
210 ▶     const astParams = (metadata.options && metadata.options.params) || null;
211 ▶     if (styleAst.containsDynamicStyles) {
212 ▶       const missingSubs = new Set<string>();
213 ▶       const params = astParams || {};
214 │       styleAst.styles.forEach((style) => {
215 │         if (style instanceof Map) {
216 │           style.forEach((value) => {
217 ▶             extractStyleParams(value).forEach((sub) => {
218 ▶               if (!Object.hasOwn(params, sub)) {
219 ▶                 missingSubs.add(sub);
220 │               }
221 │             });
222 │           });
223 │         }
224 │       });
225 ▶       if (missingSubs.size) {
226 ▶         context.errors.push(invalidState(metadata.name, [...missingSubs.values()]));
227 │       }
228 │     }
229 │ 
230 │     return {
231 │       type: AnimationMetadataType.State,
232 │       name: metadata.name,
233 │       style: styleAst,
234 ▶       options: astParams ? {params: astParams} : null,
235 │     };
236 │   }
```

state の style に `{{ w }}` のような置き換えがあると、211〜228 行目で「state の options の params に既定があるか」を確かめ、無ければ 226 行目で NG03008 です。DEMO で `state('open', style({width: '{{ w }}px'}))` は「NG03008: state("open", ...) must define default values for all the following style substitutions: w」、`{params: {w: 10}}` を足すと通りました。

state の外の style には、同じ確かめが 3 節の 431〜433 行目にあります（`context.options` の params で `validateStyleParams`）。ところが `context.options` は次の引用の 624 行目で `null` のまま、どこでも代入されません（`grep -n "context.options"` は 431・432 行目の 2 件だけ）。そのため `validateStyleParams` は呼ばれず、それが出す NG03001（INVALID\_STYLE\_PARAMS）は、パッケージのどこからも出ません。

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L615–650 （▶ の行: 616–626, 640, 646–647）

```ts
615 │ export class AnimationAstBuilderContext {
616 ▶   public queryCount: number = 0;
617 ▶   public depCount: number = 0;
618 ▶   public currentTransition: AnimationTransitionMetadata | null = null;
619 ▶   public currentQuery: AnimationQueryMetadata | null = null;
620 ▶   public currentQuerySelector: string | null = null;
621 ▶   public currentAnimateTimings: TimingAst | null = null;
622 ▶   public currentTime: number = 0;
623 ▶   public collectedStyles = new Map<string, Map<string, StyleTimeTuple>>();
624 ▶   public options: AnimationOptions | null = null;
625 ▶   public unsupportedCSSPropertiesFound: Set<string> = new Set<string>();
626 ▶   constructor(public errors: Error[]) {}
627 │ }
628 │ 
629 │ type OffsetStyles = string | ɵStyleDataMap;
630 │ 
631 │ function consumeOffset(styles: OffsetStyles | Array<OffsetStyles>): number | null {
632 │   if (typeof styles == 'string') return null;
633 │ 
634 │   let offset: number | null = null;
635 │ 
636 │   if (Array.isArray(styles)) {
637 │     styles.forEach((styleTuple) => {
638 │       if (styleTuple instanceof Map && styleTuple.has('offset')) {
639 │         const obj = styleTuple as ɵStyleDataMap;
640 ▶         offset = parseFloat(obj.get('offset') as string);
641 │         obj.delete('offset');
642 │       }
643 │     });
644 │   } else if (styles instanceof Map && styles.has('offset')) {
645 │     const obj = styles;
646 ▶     offset = parseFloat(obj.get('offset') as string);
647 ▶     obj.delete('offset');
648 │   }
649 │   return offset;
650 │ }
```

builder が入った 16c8167886d（2017）の時点で、すでに代入はありませんでした（`git show 16c8167886d:…/animation_ast_builder.ts` の `context.options` は判定の 2 行だけ）。618 行目の `currentTransition` も代入されない欄です。結果として、params の既定が無い置き換えは AST を通り、遷移のときに `interpolateParams`（util.ts L194〜212）で NG03003 になります。DEMO の「遷移のとき」で、`animate(100, style({width: '{{ x }}px'}))` は AST でエラーなし、値を変えた遷移で NG03402 ／ NG03505 ／ NG03003「Please provide a value for the animation param x」でした。`[@t]="{value: 'go', params: {x: 50}}"` なら 50px へ動きました。631〜650 行目の `consumeOffset` は、keyframes の style に書いた `offset` を取り出して消します（5 節）。

## 5. style・keyframes の AST

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L324–348 （▶ の行: 325–326, 334–335, 338–340, 342, 345）

```ts
324 │   visitStyle(metadata: AnimationStyleMetadata, context: AnimationAstBuilderContext): StyleAst {
325 ▶     const ast = this._makeStyleAst(metadata, context);
326 ▶     this._validateStyleAst(ast, context);
327 │     return ast;
328 │   }
329 │ 
330 │   private _makeStyleAst(
331 │     metadata: AnimationStyleMetadata,
332 │     context: AnimationAstBuilderContext,
333 │   ): StyleAst {
334 ▶     const styles: Array<ɵStyleDataMap | string> = [];
335 ▶     const metadataStyles = Array.isArray(metadata.styles) ? metadata.styles : [metadata.styles];
336 │ 
337 │     for (let styleTuple of metadataStyles) {
338 ▶       if (typeof styleTuple === 'string') {
339 ▶         if (styleTuple === AUTO_STYLE) {
340 ▶           styles.push(styleTuple);
341 │         } else {
342 ▶           context.errors.push(invalidStyleValue(styleTuple));
343 │         }
344 │       } else {
345 ▶         styles.push(new Map(Object.entries(styleTuple)));
346 │       }
347 │     }
348 │ 
```

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L349–376 （▶ の行: 353–355, 357, 359–360, 371, 373）

```ts
349 │     let containsDynamicStyles = false;
350 │     let collectedEasing: string | null = null;
351 │     styles.forEach((styleData) => {
352 │       if (styleData instanceof Map) {
353 ▶         if (styleData.has('easing')) {
354 ▶           collectedEasing = styleData.get('easing') as string;
355 ▶           styleData.delete('easing');
356 │         }
357 ▶         if (!containsDynamicStyles) {
358 │           for (let value of styleData.values()) {
359 ▶             if (value!.toString().indexOf(SUBSTITUTION_EXPR_START) >= 0) {
360 ▶               containsDynamicStyles = true;
361 │               break;
362 │             }
363 │           }
364 │         }
365 │       }
366 │     });
367 │ 
368 │     return {
369 │       type: AnimationMetadataType.Style,
370 │       styles,
371 ▶       easing: collectedEasing,
372 │       offset: metadata.offset,
373 ▶       containsDynamicStyles,
374 │       options: null,
375 │     };
376 │   }
```

338〜343 行目のとおり、style に書ける文字列は `'*'` だけで、ほかは NG03002（DEMO で `style('red')` は「The provided style string value red is not allowed.」）。オブジェクトは 345 行目で Map になります。353〜355 行目で、style の中の `easing` は CSS のプロパティではなく AST の `easing` に移されます（[第 1 回](01-anm-trigger-state.md)の 6 節で、easing が keyframe に入っていたのはこの値）。359 行目は値に `{{` があるかで「あとで置き換える」の印を付けます。

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L438–470 （▶ の行: 443–444, 459, 462–463, 465–467）

```ts
438 │   visitKeyframes(
439 │     metadata: AnimationKeyframesSequenceMetadata,
440 │     context: AnimationAstBuilderContext,
441 │   ): KeyframesAst {
442 │     const ast: KeyframesAst = {type: AnimationMetadataType.Keyframes, styles: [], options: null};
443 ▶     if (!context.currentAnimateTimings) {
444 ▶       context.errors.push(invalidKeyframes());
445 │       return ast;
446 │     }
447 │ 
448 │     const MAX_KEYFRAME_OFFSET = 1;
449 │ 
450 │     let totalKeyframesWithOffsets = 0;
451 │     const offsets: number[] = [];
452 │     let offsetsOutOfOrder = false;
453 │     let keyframesOutOfRange = false;
454 │     let previousOffset: number = 0;
455 │ 
456 │     const keyframes: StyleAst[] = metadata.steps.map((styles) => {
457 │       const style = this._makeStyleAst(styles, context);
458 │       let offsetVal: number | null =
459 ▶         style.offset != null ? style.offset : consumeOffset(style.styles);
460 │       let offset: number = 0;
461 │       if (offsetVal != null) {
462 ▶         totalKeyframesWithOffsets++;
463 ▶         offset = style.offset = offsetVal;
464 │       }
465 ▶       keyframesOutOfRange = keyframesOutOfRange || offset < 0 || offset > 1;
466 ▶       offsetsOutOfOrder = offsetsOutOfOrder || offset < previousOffset;
467 ▶       previousOffset = offset;
468 │       offsets.push(offset);
469 │       return style;
470 │     });
```

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L471–504 （▶ の行: 472–473, 476–477, 482–485, 493–497）

```ts
471 │ 
472 ▶     if (keyframesOutOfRange) {
473 ▶       context.errors.push(invalidOffset());
474 │     }
475 │ 
476 ▶     if (offsetsOutOfOrder) {
477 ▶       context.errors.push(keyframeOffsetsOutOfOrder());
478 │     }
479 │ 
480 │     const length = metadata.steps.length;
481 │     let generatedOffset = 0;
482 ▶     if (totalKeyframesWithOffsets > 0 && totalKeyframesWithOffsets < length) {
483 ▶       context.errors.push(keyframesMissingOffsets());
484 ▶     } else if (totalKeyframesWithOffsets == 0) {
485 ▶       generatedOffset = MAX_KEYFRAME_OFFSET / (length - 1);
486 │     }
487 │ 
488 │     const limit = length - 1;
489 │     const currentTime = context.currentTime;
490 │     const currentAnimateTimings = context.currentAnimateTimings!;
491 │     const animateDuration = currentAnimateTimings.duration;
492 │     keyframes.forEach((kf, i) => {
493 ▶       const offset = generatedOffset > 0 ? (i == limit ? 1 : generatedOffset * i) : offsets[i];
494 ▶       const durationUpToThisFrame = offset * animateDuration;
495 ▶       context.currentTime = currentTime + currentAnimateTimings.delay + durationUpToThisFrame;
496 ▶       currentAnimateTimings.duration = durationUpToThisFrame;
497 ▶       this._validateStyleAst(kf, context);
498 │       kf.offset = offset;
499 │ 
500 │       ast.styles.push(kf);
501 │     });
502 │ 
503 │     return ast;
504 │   }
```

1. **443〜446 行目：animate の外なら NG03011**

   `transition(…, keyframes([…]))` は「keyframes() must be placed inside of a call to animate()」。
2. **465〜466 行目：範囲と順**

   offset が 0〜1 の外なら 473 行目の NG03012、前より小さければ 477 行目の NG03200。
3. **482〜485 行目：全部か、どれも無しか**

   一部だけなら NG03202。どれも無ければ 485 行目で `1 / (個数 - 1)` ずつ（[第 2 回](02-anm-transition-query.md)の 5 節の 0.3333・0.6667）。
4. **494〜497 行目：各 keyframe の時刻で重なりを確かめる**

   offset から時刻を出し、3 節の `_validateStyleAst` を keyframe ごとに呼びます。offset が逆順だと時刻が戻るので、DEMO の `[offset 0.6, offset 0.3]` は NG03200 に加えて、説明に無い NG03010（「between the times of "0ms" and "60ms" … between the times of "0ms" and "30ms"」）も出ました。

## 6. sequence・group・reference・animateChild と、stagger・selector

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L257–284 （▶ の行: 263, 269–270, 272–274, 278）

```ts
257 │   visitSequence(
258 │     metadata: AnimationSequenceMetadata,
259 │     context: AnimationAstBuilderContext,
260 │   ): SequenceAst {
261 │     return {
262 │       type: AnimationMetadataType.Sequence,
263 ▶       steps: metadata.steps.map((s) => visitDslNode(this, s, context)),
264 │       options: normalizeAnimationOptions(metadata.options),
265 │     };
266 │   }
267 │ 
268 │   visitGroup(metadata: AnimationGroupMetadata, context: AnimationAstBuilderContext): GroupAst {
269 ▶     const currentTime = context.currentTime;
270 ▶     let furthestTime = 0;
271 │     const steps = metadata.steps.map((step) => {
272 ▶       context.currentTime = currentTime;
273 ▶       const innerAst = visitDslNode(this, step, context);
274 ▶       furthestTime = Math.max(furthestTime, context.currentTime);
275 │       return innerAst;
276 │     });
277 │ 
278 ▶     context.currentTime = furthestTime;
279 │     return {
280 │       type: AnimationMetadataType.Group,
281 │       steps,
282 │       options: normalizeAnimationOptions(metadata.options),
283 │     };
284 │   }
```

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L506–537 （▶ の行: 512–513, 521–524, 534）

```ts
506 │   visitReference(
507 │     metadata: AnimationReferenceMetadata,
508 │     context: AnimationAstBuilderContext,
509 │   ): ReferenceAst {
510 │     return {
511 │       type: AnimationMetadataType.Reference,
512 ▶       animation: visitDslNode(this, normalizeAnimationEntry(metadata.animation), context),
513 ▶       options: normalizeAnimationOptions(metadata.options),
514 │     };
515 │   }
516 │ 
517 │   visitAnimateChild(
518 │     metadata: AnimationAnimateChildMetadata,
519 │     context: AnimationAstBuilderContext,
520 │   ): AnimateChildAst {
521 ▶     context.depCount++;
522 ▶     return {
523 ▶       type: AnimationMetadataType.AnimateChild,
524 ▶       options: normalizeAnimationOptions(metadata.options),
525 │     };
526 │   }
527 │ 
528 │   visitAnimateRef(
529 │     metadata: AnimationAnimateRefMetadata,
530 │     context: AnimationAstBuilderContext,
531 │   ): AnimateRefAst {
532 │     return {
533 │       type: AnimationMetadataType.AnimateRef,
534 ▶       animation: this.visitReference(metadata.animation, context),
535 │       options: normalizeAnimationOptions(metadata.options),
536 │     };
537 │   }
```

group は 272 行目で子ごとに時刻を開始に戻し、274・278 行目で一番遅い子の時刻にそろえます。3 節の重なりの検査が「同じ時刻に始まる」ことを知るのはこのためです（本当の時間の積み方は[第 5 回](05-anm-timeline.md)）。521 行目の `animateChild` は数を足すだけで、query の中かどうかを確かめません。DEMO で `transition('* => go', animateChild())` はエラーにならず、遷移でも何も動きませんでした。

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L574–604 （▶ の行: 575–577, 589–590, 592–593, 596–597, 599–601）

```ts
574 │     const timings =
575 ▶       metadata.timings === 'full'
576 ▶         ? {duration: 0, delay: 0, easing: 'full'}
577 ▶         : resolveTiming(metadata.timings, context.errors, true);
578 │ 
579 │     return {
580 │       type: AnimationMetadataType.Stagger,
581 │       animation: visitDslNode(this, normalizeAnimationEntry(metadata.animation), context),
582 │       timings,
583 │       options: null,
584 │     };
585 │   }
586 │ }
587 │ 
588 │ function normalizeSelector(selector: string): [string, boolean] {
589 ▶   const hasAmpersand = selector.split(/\s*,\s*/).find((token) => token == SELF_TOKEN)
590 ▶     ? true
591 │     : false;
592 ▶   if (hasAmpersand) {
593 ▶     selector = selector.replace(SELF_TOKEN_REGEX, '');
594 │   }
595 │ 
596 ▶   // Note: the :enter and :leave aren't normalized here since those
597 ▶   // selectors are filled in at runtime during timeline building
598 │   selector = selector
599 ▶     .replace(/@\*/g, NG_TRIGGER_SELECTOR)
600 ▶     .replace(/@\w+/g, (match) => NG_TRIGGER_SELECTOR + '-' + match.slice(1))
601 ▶     .replace(/:animating/g, NG_ANIMATING_SELECTOR);
602 │ 
603 │   return [selector, hasAmpersand];
604 │ }
```

575〜577 行目のとおり、stagger の timings だけは負の値を許し（577 行目の第 3 引数）、`'full'` を特別に読みます。負の値で順が逆になることは[第 2 回](02-anm-transition-query.md)の 8 節の記録です。588〜594 行目の `normalizeSelector` が `:self` を消します。589 行目は selector を `/\s*,\s*/` で分けて `':self'` と等しい項目を探し、593 行目で 3 節の 81 行目の `SELF_TOKEN_REGEX` で消します。81 行目は `` `s*${SELF_TOKEN}s*,?` `` で、テンプレート文字列の中の `s` はただの文字です。

1. **はじめから \\s は効いていなかった**

   16c8167886d（2017）の行は `` `\s*${SELF_TOKEN}\s*,?` `` でしたが、テンプレート文字列の `\s` は `s` と同じです。18be804c038（2023-08-29、`fix(animations): remove unnecessary escaping in regex expressions (#51554)`）は「意味の無いエスケープ」を消して見た目を今の形にしただけで、動きは変わっていません。
2. **22.2.6 のまま**

   `':self, .item'` は AST の selector が `" .item"` で動き、`'.item, :self'` は `".item, "`、`'.item ,:self'` は `".item ,"` が残って、遷移のときに querySelectorAll が SyntaxError を投げました。`' :self , .item'` は 589 行目の分け方で先頭の空白が残るので `:self` と見なされず（includeSelf=false）、`:self` のまま querySelectorAll に渡って SyntaxError です。
3. **81 行目を \\\\s にした写し**

   npm の browser.mjs を束ねるときに 81 行目だけを `\\s` に置き換えると、`'.item, :self'` は `".item,"` になり、まだ SyntaxError でした（`:self` の前のカンマが残る）。2017 年の意図どおりにしても直りません。
4. **カンマで分けた項目で外す写し**

   589〜594 行目を「`split(',')` して `trim()` し、`':self'` を除いて `', '` でつなぐ」に置き換えると、6 つの書き方がすべて動きました（自分と `.item`）。ただしこの形は `:is(.a, :self)` のような括弧の中のカンマまで分けるので、本当に直すならそこも考えます。

📄 `試した写し（手元の記録、2026-11-23）`

```
// 記録で試した 2 つの写し（npm の browser.mjs を束ねるときに置き換えた。../angular は変えていない）
// (1) L81 の正規表現を \s にする
const SELF_TOKEN_REGEX = new RegExp(`\\s*${SELF_TOKEN}\\s*,?`, 'g');
// (2) normalizeSelector（L588〜594）をカンマで分けた項目で外す
const tokens = selector.split(',').map((token) => token.trim());
const hasAmpersand = tokens.includes(SELF_TOKEN);
if (hasAmpersand) {
  selector = tokens.filter((token) => token !== SELF_TOKEN).join(', ');
}
```

## 7. timings の AST

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L652–689 （▶ の行: 653–654, 657–659, 663–664, 666–667, 671–672, 676, 678–679, 682）

```ts
652 │ function constructTimingAst(value: string | number | AnimateTimings, errors: Error[]) {
653 ▶   if (typeof value === 'object' && value !== null && Object.hasOwn(value, 'duration')) {
654 ▶     return value as AnimateTimings;
655 │   }
656 │ 
657 ▶   if (typeof value == 'number') {
658 ▶     const duration = resolveTiming(value, errors).duration;
659 ▶     return makeTimingAst(duration, 0, '');
660 │   }
661 │ 
662 │   const strValue = value as string;
663 ▶   const isDynamic = strValue.split(/\s+/).some((v) => v.charAt(0) == '{' && v.charAt(1) == '{');
664 ▶   if (isDynamic) {
665 │     const ast = makeTimingAst(0, 0, '') as any;
666 ▶     ast.dynamic = true;
667 ▶     ast.strValue = strValue;
668 │     return ast as DynamicTimingAst;
669 │   }
670 │ 
671 ▶   const timings = resolveTiming(strValue, errors);
672 ▶   return makeTimingAst(timings.duration, timings.delay, timings.easing);
673 │ }
674 │ 
675 │ function normalizeAnimationOptions(options: AnimationOptions | null): AnimationOptions {
676 ▶   if (options) {
677 │     options = {...options};
678 ▶     if (options['params']) {
679 ▶       options['params'] = normalizeParams(options['params'])!;
680 │     }
681 │   } else {
682 ▶     options = {};
683 │   }
684 │   return options;
685 │ }
686 │ 
687 │ function makeTimingAst(duration: number, delay: number, easing: string | null): TimingAst {
688 │   return {duration, delay, easing};
689 │ }
```

653〜654 行目は `{duration, delay, easing}` のオブジェクトをそのまま使い、657〜659 行目は数を duration にします。663 行目で空白で分けた項目のどれかが `{{` で始まれば、666〜667 行目で文字列ごと残して遷移のときに読みます。DEMO で `animate('{{ time }}')` は AST でエラーなし、params なしで遷移すると NG03003 と NG03000「The provided timing value "" is invalid.」の 2 つでした（置き換えが空文字になり、それを読もうとする）。671 行目が[第 1 回](01-anm-trigger-state.md)の 6 節の表の中身（util.ts の `resolveTiming`）です。676〜684 行目は options を写し、params も写します（第 2 回の 4 節の `delay: '300ms'` はここを通る）。

## 8. 遷移の式の照合と state のスタイル：本物の factory で

📄 `angular/packages/animations/browser/src/dsl/animation_transition_expr.ts` L9–18 （▶ の行: 11–17）

```ts
 9 │ import {invalidExpression, invalidTransitionAlias} from '../error_helpers';
10 │ 
11 ▶ export const ANY_STATE = '*';
12 ▶ export declare type TransitionMatcherFn = (
13 ▶   fromState: any,
14 ▶   toState: any,
15 ▶   element: any,
16 ▶   params: {[key: string]: any},
17 ▶ ) => boolean;
18 │ 
```

📄 `angular/packages/animations/browser/src/dsl/animation_trigger.ts` L85–97 （▶ の行: 90–92, 94–95）

```ts
85 │ function balanceProperties(
86 │   stateMap: Map<string, AnimationStateStyles>,
87 │   key1: string,
88 │   key2: string,
89 │ ) {
90 ▶   if (stateMap.has(key1)) {
91 ▶     if (!stateMap.has(key2)) {
92 ▶       stateMap.set(key2, stateMap.get(key1)!);
93 │     }
94 ▶   } else if (stateMap.has(key2)) {
95 ▶     stateMap.set(key1, stateMap.get(key2)!);
96 │   }
97 │ }
```

DEMO の「照合」は、12 個の式を 1 つの trigger にして本物の `buildAnimationAst` → `buildTrigger` に通し、各 `AnimationTransitionFactory.match` と `matchTransition` に値の組を渡した記録です。AST の matchers の数は `'a <=> b'` と `'a => b, b => a'` が 2 つ、ほかは 1 つでした（`'* <=> *'` は逆向きを足さない）。

| 値の組 | 当たる式（記録。どれも '\* =&gt; \*' と '\* &lt;=&gt; \*' にも当たる） |
| --- | --- |
| `"void" → "a"` | `:enter`、`void => *` |
| `false → true`（boolean） | `false => true`、`0 => 1` |
| `0 → 1`（number） | `:increment`、`0 => 1`（`false => true` には当たらない） |
| `"0" → "1"` | `:increment`、`0 => 1` |
| `"false" → "true"` | `false => true`（文字列どうしの `==`） |
| `"2" → "10"` | `:increment`（parseFloat で 2 &lt; 10） |

`matchTransition` はどの組でも最初に書いた `'* => *'` を返しました（書いた順の最初。[旧 DSL の章](../animations/15-animations-legacy-dsl.md)の 4 節）。12〜17 行目の型のとおり、関数の式には要素と params も渡り、`matchTransition('a', 'b', div, {target: 'b'})` で関数が受け取ったのは `("a", "b", DIV, {"target":"b"})` でした。90〜96 行目の `balanceProperties` は、`state('true')` だけなら `'1'` にも同じスタイルを入れます（記録で states の Map のキーは `open, true, *, 1`）。

📄 `angular/packages/animations/browser/src/dsl/animation_transition_factory.ts` L217–235 （▶ の行: 224, 227–231）

```ts
217 │ function oneOrMoreTransitionsMatch(
218 │   matchFns: TransitionMatcherFn[],
219 │   currentState: any,
220 │   nextState: any,
221 │   element: any,
222 │   params: {[key: string]: any},
223 │ ): boolean {
224 ▶   return matchFns.some((fn) => fn(currentState, nextState, element, params));
225 │ }
226 │ 
227 ▶ function applyParamDefaults(userParams: Record<string, any>, defaults: Record<string, any>) {
228 ▶   const result: Record<string, any> = {...defaults};
229 ▶   Object.entries(userParams).forEach(([key, value]) => {
230 ▶     if (value != null) {
231 ▶       result[key] = value;
232 │     }
233 │   });
234 │   return result;
235 │ }
```

📄 `angular/packages/animations/browser/src/dsl/animation_transition_factory.ts` L237–261 （▶ の行: 244, 246, 248, 250–251, 253–255）

```ts
237 │ export class AnimationStateStyles {
238 │   constructor(
239 │     private styles: StyleAst,
240 │     private defaultParams: {[key: string]: any},
241 │     private normalizer: AnimationStyleNormalizer,
242 │   ) {}
243 │ 
244 ▶   buildStyles(params: {[key: string]: any}, errors: Error[]): ɵStyleDataMap {
245 │     const finalStyles: ɵStyleDataMap = new Map();
246 ▶     const combinedParams = applyParamDefaults(params, this.defaultParams);
247 │     this.styles.styles.forEach((value) => {
248 ▶       if (typeof value !== 'string') {
249 │         value.forEach((val, prop) => {
250 ▶           if (val) {
251 ▶             val = interpolateParams(val, combinedParams, errors);
252 │           }
253 ▶           const normalizedProp = this.normalizer.normalizePropertyName(prop, errors);
254 ▶           val = this.normalizer.normalizeStyleValue(prop, normalizedProp, val, errors);
255 ▶           finalStyles.set(prop, val);
256 │         });
257 │       }
258 │     });
259 │     return finalStyles;
260 │   }
261 │ }
```

224 行目のとおり、関数の式の判定は matchers のどれか 1 つが true なら当たりです。228〜231 行目の `applyParamDefaults` は既定を写してから、渡された値のうち `!= null` のものだけで上書きします。`state('open', style({width: '{{ w }}px', opacity: 1}), {params: {w: 100}})` で記録すると、`buildStyles('open', {})` は `{"width":"100px","opacity":"1"}`、`{w: 40}` なら 40px、`{w: null}` は既定の 100px のままでした。名前が無い `'closed'` と `undefined` は `state('*')` のスタイルに、boolean の `true` と数の `1` は `state('true')` に当たりました（factory の L44〜45 の `toString()`）。

📄 `angular/packages/animations/browser/src/dsl/animation_transition_factory.ts` L25–33 （▶ の行: 25, 27, 29–31）

```ts
25 ▶ const EMPTY_OBJECT = {};
26 │ 
27 ▶ export class AnimationTransitionFactory {
28 │   constructor(
29 ▶     private _triggerName: string,
30 ▶     public ast: TransitionAst,
31 ▶     private _stateStyles: Map<string, AnimationStateStyles>,
32 │   ) {}
33 │ 
```

📄 `angular/packages/animations/browser/src/dsl/animation_transition_factory.ts` L49–61 （▶ の行: 50, 57–61）

```ts
49 │ 
50 ▶   build(
51 │     driver: AnimationDriver,
52 │     element: any,
53 │     currentState: any,
54 │     nextState: any,
55 │     enterClassName: string,
56 │     leaveClassName: string,
57 ▶     currentOptions?: AnimationOptions,
58 ▶     nextOptions?: AnimationOptions,
59 ▶     subInstructions?: ElementInstructionMap,
60 ▶     skipAstBuild?: boolean,
61 ▶   ): AnimationTransitionInstruction {
```

📄 `angular/packages/animations/browser/src/dsl/animation_transition_factory.ts` L99–117 （▶ の行: 100–101, 109–110, 113–114）

```ts
 99 │ 
100 ▶     if (errors.length) {
101 ▶       return createTransitionInstruction(
102 │         element,
103 │         this._triggerName,
104 │         currentState,
105 │         nextState,
106 │         isRemoval,
107 │         currentStateStyles,
108 │         nextStateStyles,
109 ▶         [],
110 ▶         [],
111 │         preStyleMap,
112 │         postStyleMap,
113 ▶         totalTime,
114 ▶         errors,
115 │       );
116 │     }
117 │ 
```

📄 `angular/packages/animations/browser/src/dsl/animation_transition_factory.ts` L118–150 （▶ の行: 118, 121, 124, 126–127, 131–132, 135, 144, 147）

```ts
118 ▶     timelines.forEach((tl) => {
119 │       const elm = tl.element;
120 │       const preProps = getOrSetDefaultValue(preStyleMap, elm, new Set<string>());
121 ▶       tl.preStyleProps.forEach((prop) => preProps.add(prop));
122 │ 
123 │       const postProps = getOrSetDefaultValue(postStyleMap, elm, new Set<string>());
124 ▶       tl.postStyleProps.forEach((prop) => postProps.add(prop));
125 │ 
126 ▶       if (elm !== element) {
127 ▶         queriedElements.add(elm);
128 │       }
129 │     });
130 │ 
131 ▶     if (typeof ngDevMode === 'undefined' || ngDevMode) {
132 ▶       checkNonAnimatableInTimelines(timelines, this._triggerName, driver);
133 │     }
134 │ 
135 ▶     return createTransitionInstruction(
136 │       element,
137 │       this._triggerName,
138 │       currentState,
139 │       nextState,
140 │       isRemoval,
141 │       currentStateStyles,
142 │       nextStateStyles,
143 │       timelines,
144 ▶       [...queriedElements.values()],
145 │       preStyleMap,
146 │       postStyleMap,
147 ▶       totalTime,
148 │     );
149 │   }
150 │ }
```

📄 `angular/packages/animations/browser/src/dsl/animation_transition_instruction.ts` L18–48 （▶ の行: 18, 21–22, 24, 26–31）

```ts
18 ▶ export interface AnimationTransitionInstruction extends AnimationEngineInstruction {
19 │   element: any;
20 │   triggerName: string;
21 ▶   isRemovalTransition: boolean;
22 ▶   fromState: string;
23 │   fromStyles: ɵStyleDataMap;
24 ▶   toState: string;
25 │   toStyles: ɵStyleDataMap;
26 ▶   timelines: AnimationTimelineInstruction[];
27 ▶   queriedElements: any[];
28 ▶   preStyleProps: Map<any, Set<string>>;
29 ▶   postStyleProps: Map<any, Set<string>>;
30 ▶   totalTime: number;
31 ▶   errors?: Error[];
32 │ }
33 │ 
34 │ export function createTransitionInstruction(
35 │   element: any,
36 │   triggerName: string,
37 │   fromState: string,
38 │   toState: string,
39 │   isRemovalTransition: boolean,
40 │   fromStyles: ɵStyleDataMap,
41 │   toStyles: ɵStyleDataMap,
42 │   timelines: AnimationTimelineInstruction[],
43 │   queriedElements: any[],
44 │   preStyleProps: Map<any, Set<string>>,
45 │   postStyleProps: Map<any, Set<string>>,
46 │   totalTime: number,
47 │   errors?: Error[],
48 │ ): AnimationTransitionInstruction {
```

1. **100〜116 行目：エラーがあれば timelines は空で返す**

   109〜110 行目で timelines と queriedElements を空にし、114 行目で errors を入れた命令を返します。投げるのはエンジンの flush で、NG03014 などが NG03505 に包まれて NG03402 になります（[TransitionAnimationEngine の章](../animations/16-animations-legacy-engine.md)の 4 節）。
2. **118〜129 行目：要素ごとの前後のプロパティ**

   タイムラインが覚えた「動く前に測るプロパティ」「動いたあとに測るプロパティ」（`'!'` と `'*'`、[第 5 回](05-anm-timeline.md)）を要素ごとに集め、126〜127 行目で trigger の要素以外（query した要素）を覚えます。
3. **131〜133 行目：開発モードだけ、動かせないプロパティの警告**

   DEMO で `[style({display: 'block'}), animate(100, style({display: 'none'}))]` は「Warning: The animation trigger "t" is attempting to animate the following not animatable properties: display」が出て、Web Animation は display の 2 つの keyframe のまま作られました。
4. **記録の build の結果**

   `build(driver, el, 'closed', 'open', …)` は totalTime=300（transition の params の既定 `time: '300ms'`）、fromStyles は `state('*')` の `{"color":"gray"}`、toStyles は open のスタイル。次の値の params に `{time: '1s', w: 7}` を渡すと totalTime=1000・width 7px、`{time: null}` は 300 のままでした。`'open' → 'void'` は `isRemovalTransition=true`（21 行目）です。

25 行目の `EMPTY_OBJECT` は params が無いときに共有される 1 つのオブジェクトですが、`applyParamDefaults` は 228 行目で写しを作るので、書き換わることはありません。

> **🧪 DEMO — npm の @angular/animations 22.2.6 の AST と factory を headless Chrome で動かした記録**
>
> ボタンは、記録のスクリプトがシナリオごとにページを読み直して取った結果を再生します（開発モードと本番相当の 2 回）。「誤った DSL」は `buildAnimationAst` の errors と warnings をそのまま並べ、本番では文が消えて番号だけになります。「:self」の 2 つ目と 3 つ目は、6 節の写しで束ねたものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/anm-ast)

## ここまでの呼び出し（コンポーネントの animations が AST になり、遷移の命令になるまで）

- `AnimationEngine.registerTrigger()` — animation\_engine\_next.ts — *旧パッケージの入口の章*
  - `buildAnimationAst()` → `AnimationAstBuilderVisitor.build()` — animation\_ast\_builder.ts L119・L133 — *errors に溜める（2 節）*
    - `visitTrigger()` → `visitState()` — L162・L208 — *state の {{ }} の既定（4 節、NG03008）*
    - `visitTransition()` → `visitAnimate()` → `visitStyle()` — L238・L286・L324
      - `_makeStyleAst()` / `_validateStyleAst()` — L330・L378 — *'\*' 以外の文字列、知らないプロパティ、重なり（3・5 節）*
      - `visitKeyframes()` — L438 — *offset の範囲・順・揃い（5 節）*
      - `visitQuery()` → `normalizeSelector()` — L539・L588 — *:self を消す（6 節）*
      - `constructTimingAst()` — L652 — *{{ }} は後で読む（7 節）*
  - `buildTrigger()` → `new AnimationTrigger()` — animation\_trigger.ts L14 — *balanceProperties（8 節）*
- `AnimationTrigger.matchTransition()` — animation\_trigger.ts L50
  - `AnimationTransitionFactory.build()` — animation\_transition\_factory.ts L50 — *params の既定、エラーは命令に入れて返す（8 節）*
    - `createTransitionInstruction()` — animation\_transition\_instruction.ts L34 — *エンジンの flush へ（第 6 回）*

## テストと直し方

| ファイル（packages/animations/browser/test/dsl/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `animation_ast_builder_spec.ts` | `buildAnimationAst`（13）› `should build the AST without any errors and warnings`（14） | 1 節の QueryAst の形（limit 0、optional false、includeSelf false）。この 1 本だけで、Node でも走る |
| `animation_spec.ts` | `validation`（65）› `should throw an error if one or more but not all keyframes() styles contain offsets`（66）・`…not all offsets are between 0 and 1`（74）・`…a smaller offset shows up after a bigger one`（94） | 5 節の NG03202・NG03012・NG03200 |
| 同じ describe | `should throw an error if any styles overlap during parallel animations`（105）・`should not throw an error if animations overlap in different query levels within different transitions`（132） | 3 節。「後の区間が前の区間に収まる」形だけ |
| 同じ describe | `should throw if keyframes() is not used inside of animate()`（204）・`should throw if dynamic style substitutions are used without defaults within state() definitions`（218）・`should provide a warning if an invalid CSS property is used in the animation`（254） | 5 節の NG03011、4 節の NG03008、3 節の警告 |
| `animation_trigger_spec.ts` | `trigger usage`（59）› `should allow multiple state values to use the same styles`（77）・``should match `1` and `0` state styles on a `true <=> false` boolean transition given boolean values``（242） | 8 節の state の Map と balanceProperties |

📄 `走らせたコマンド（2026-11-23）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/animations/browser/test:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/animations/browser/test:test_web_chromium --nocache_test_results --test_output=all
（結果は下の段落）
```

結果は手元の bazel で、Node の `:test` は 17 specs・0 failures（`animation_ast_builder_spec.ts` の 1 本と、style normalizer の 6 本などが Node でも走る）、ブラウザーの `:test_web_chromium` は 124 passed・0 failed でした。NG03001 を期待する it はどこにもありません（`grep -rn "NG03001\|INVALID_STYLE_PARAMS" packages/animations` は errors.ts と error\_helpers.ts だけ）。`:self` を末尾に書く it、重なりの区間が後で広がる it もありません。

直すとしたら、重なりの検査は animation\_ast\_builder.ts の 405〜407 行目を「区間が交わる」（`startTime < collectedEntry.endTime && endTime > collectedEntry.startTime`）にしますが、今まで通っていた DSL が NG03010 になるので、変える前に spec（animation\_spec.ts の 105 行目の隣）と、エンジンの spec の流れを確かめます。冒頭のコメントに合わせるのか、実装に合わせてコメントを「収まるとき」に直すのかは、どちらもありえます。params の検査は、`visitTransition` などで `context.options = metadata.options` を入れれば 431〜433 行目が働きますが、params は遷移のときに値で渡せる（`[@t]="{value, params}"`）ので、既定が無いことを AST でエラーにすると正しい使い方まで止めます。使われない行として消すのが筋で、その場合は NG03001 の番号と `validateStyleParams` も一緒に消えます。`:self` は 6 節の 2 つ目の写しの形（項目に分けて外す）に、`describe('query()')` の it を 2 本（末尾の `:self`、空白の付いた `:self`）足します。

## 聞かれそうな質問

**Q. DSL の誤りはいつ分かりますか？**

AST で分かるもの（式・trigger の名前・state の既定・keyframes の offset・負の時間・query の外の stagger・重なりの一部）は登録のときで、コンポーネントなら NG03404、builder なら NG03503 にまとめて投げます。params の不足、query の 0 件、単位の無い文字列の値は、その遷移が初めて走ったときです（4 節、DEMO の「遷移のとき」）。

**Q. group で同じプロパティを 2 回動かすとエラーになりますか？**

短いものを後に書いたときだけ NG03010 です。`[animate('1s'), animate('2s')]` の順ならエラーにならず、2 つの Web Animation が同じプロパティを同時に動かします（3 節、405〜407 行目）。

**Q. `{{ x }}` の既定が無いのに、なぜ AST はエラーにしないのですか？**

state の中なら NG03008 にします（4 節の 226 行目）。state の外の検査（431〜433 行目）は `context.options` が null のままなので働かず、値は遷移のときに trigger の params から入るかどうかが決まります。

**Q. `query('.a, :self')` を直すには `\s` を足せばよいですか？**

足りません。写しで試すと `'.a,'` が残って同じ SyntaxError でした。カンマで分けた項目から `:self` を除いてつなぎ直すと、6 つの書き方がすべて動きました（6 節）。

**Q. 本番で DSL のエラーの文は読めますか？**

読めません。`NG03404` のように番号だけになります（2 節の表）。番号の意味は errors.ts の enum（[第 3 回](03-anm-builder-players.md)の 8 節）で引けます。

## 読み終えて

- `buildAnimationAst` はエラーを溜めるだけで、投げるのは 3 つの入口（NG03500・NG03503・NG03404）。`ɵAnimation` を使うのは spec だけ。
- 重なりの検査は「後の区間が前に収まる」ときだけ。冒頭のコメントの「どこか重なれば」より狭い。
- state の外の `{{ }}` の検査は働かない行で、NG03001 は出ない。不足は遷移のときの NG03003。
- keyframes は「animate の中・0〜1・順・全部か無し」を確かめ、逆順では NG03010 も付く。
- `:self` は 2017 年から `\s` が効いておらず、末尾や空白付きで SyntaxError。正規表現だけ直しても直らない。

---

← 前: [AnimationBuilder とプレイヤーの説明文](03-anm-builder-players.md)  
次: [タイムラインを組む：animation\_timeline\_builder](05-anm-timeline.md) →
