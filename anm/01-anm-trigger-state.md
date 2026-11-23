[目次](../README.md) › [animations の説明文の読み残し](README.md) › 第 1 回 / 全 9 回

# trigger・state・style・animate の説明文

> animations/src/animation\_metadata.ts の前半の未読の行：AnimationMetadataType、trigger と state と style と animate の説明と例、timings の文字列の形、AUTO\_STYLE と「\*」。説明に書かれた約束を本物で確かめる。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/anm-trigger-state)

---

この章で分かること：`@angular/animations` の `animation_metadata.ts` の前半にある、`trigger`・`state`・`style`・`animate` と、その型（`AnimationMetadataType`・`AnimateTimings`・`AnimationOptions`・`AUTO_STYLE` ほか）の説明文が、何を約束しているか。その約束を、npm から取った本物の 22.2.6 を headless の Chrome で動かした記録で 1 つずつ確かめます。食い違いは 4 つありました。timings の文字列は「単位を省ける」と書かれていますが、文字列では省けません（`'500'` は NG03000）。easing の例の `ease-in-and-out` は CSS に無い値で、アニメーションは何も動かずにすぐ終わります。trigger の値は「文字列にしてから比べる」とありますが、文字列にはなりません。inline の関数の例は strict の型検査に通りません。

読む対象は `packages/animations/src/animation_metadata.ts` の L1〜891 のうち、`group` と `sequence`（L723〜805）を除いた部分です（../angular、8576f161ae4）。後半は[次の回](02-anm-transition-query.md)が読みます。DSL の関数が「type の番号つきのオブジェクトを返すだけ」であること、それを `buildAnimationAst` が AST にすることは[旧 DSL とキーフレームの章](../animations/15-animations-legacy-dsl.md)の 1〜2 節、`provideAnimations` とレンダラーの差し替えは[旧パッケージの入口の章](../animations/14-animations-legacy-setup.md)、`element.animate()` を呼ぶプレイヤーは[TransitionAnimationEngine の章](../animations/16-animations-legacy-engine.md)が読んでいます。ここでは繰り返さずに行だけ指します。このパッケージの公開 API には、どれも ``@deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23`` が付いています（v20.2 から非推奨）。

1. **1. trigger・state・style・animate**（この章）
2. [2. transition・query・stagger](02-anm-transition-query.md)
3. [3. AnimationBuilder とプレイヤー](03-anm-builder-players.md)
4. [4. DSL を AST に](04-anm-ast.md)
5. [5. タイムライン](05-anm-timeline.md)
6. [6. 遷移のエンジン](06-anm-engine.md)
7. [7. Web Animations のドライバー](07-anm-driver.md)
8. [8. provideAnimations](08-anm-module.md)
9. [9. spec と issue](09-anm-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> このシリーズの DEMO は、記録の再生です。`@angular/animations` はこのサイトの依存に無いので、`npm pack` で取った 22.2.6（と同じ版の `@angular/core`・`common`・`platform-browser`・`compiler`）を手元の作業用の場所に置き、esbuild で束ねた小さなページ（JIT のコンポーネントを毎回新しく起動する）を headless の Chrome 157 で開いて記録しました。開発モードと、`ngDevMode = false` で束ねた本番相当の 2 回を取っています。要素のスタイルの「時刻表」は、Angular が作った Web Animation を止めて `currentTime` を動かし、そのたびに `getComputedStyle` を読んだ値です。

## 1. 種類の番号と「\*」：AnimationMetadataType と AUTO\_STYLE

📄 `angular/packages/animations/src/animation_metadata.ts` L101–136 （▶ の行: 102, 104–105, 111, 116, 121, 136）

```ts
101 │ /**
102 ▶  * @description Constants for the categories of parameters that can be defined for animations.
103 │  *
104 ▶  * A corresponding function defines a set of parameters for each category, and
105 ▶  * collects them into a corresponding `AnimationMetadata` object.
106 │  *
107 │  * @publicApi
108 │  *
109 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
110 │  */
111 ▶ export enum AnimationMetadataType {
112 │   /**
113 │    * Associates a named animation state with a set of CSS styles.
114 │    * See [`state()`](api/animations/state)
115 │    */
116 ▶   State = 0,
117 │   /**
118 │    * Data for a transition from one animation state to another.
119 │    * See `transition()`
120 │    */
121 ▶   Transition = 1,
122 │   /**
123 │    * Contains a set of animation steps.
124 │    * See `sequence()`
125 │    */
126 │   Sequence = 2,
127 │   /**
128 │    * Contains a set of animation steps.
129 │    * See `group()`
130 │    */
131 │   Group = 3,
132 │   /**
133 │    * Contains an animation step.
134 │    * See `animate()`
135 │    */
136 ▶   Animate = 4,
```

102〜105 行目のとおり、この enum は「関数ごとに 1 つの番号」で、関数はその番号を `type` に入れたオブジェクトを作ります。116 行目の `State = 0` から始まり、引用の外の L176 の `Stagger = 12` まで 13 個です。DEMO の「メタデータ」で、実物の enum を並べると `State=0 Transition=1 Sequence=2 Group=3 Animate=4 Keyframes=5 Style=6 Trigger=7 Reference=8 AnimateChild=9 AnimateRef=10 Query=11 Stagger=12` でした。この番号で `visitDslNode` が `visit*` に振り分けることは[旧 DSL の章](../animations/15-animations-legacy-dsl.md)の 2 節です。

📄 `angular/packages/animations/src/animation_metadata.ts` L179–197 （▶ の行: 180, 186, 195–196）

```ts
179 │ /**
180 ▶  * Specifies automatic styling.
181 │  *
182 │  * @publicApi
183 │  *
184 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
185 │  */
186 ▶ export const AUTO_STYLE = '*';
187 │ 
188 │ /**
189 │  * Base for animation data structures.
190 │  *
191 │  * @publicApi
192 │  *
193 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
194 │  */
195 ▶ export interface AnimationMetadata {
196 ▶   type: AnimationMetadataType;
197 │ }
```

186 行目の `AUTO_STYLE` はただの文字列 `'*'` です。`style({height: '*'})` と `style({height: AUTO_STYLE})` は同じオブジェクトになります。195〜196 行目の `AnimationMetadata` は `type` だけを持つ土台で、下の各メタデータの型がこれを広げます。

## 2. メタデータの入れ物：trigger・state・style・animate の型

📄 `angular/packages/animations/src/animation_metadata.ts` L199–222 （▶ の行: 209, 211, 215, 217–219, 221）

```ts
199 │ /**
200 │  * Contains an animation trigger. Instantiated and returned by the
201 │  * `trigger()` function.
202 │  *
203 │  * @publicApi
204 │  *
205 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
206 │  */
207 │ export interface AnimationTriggerMetadata extends AnimationMetadata {
208 │   /**
209 ▶    * The trigger name, used to associate it with an element. Unique within the component.
210 │    */
211 ▶   name: string;
212 │   /**
213 │    * An animation definition object, containing an array of state and transition declarations.
214 │    */
215 ▶   definitions: AnimationMetadata[];
216 │   /**
217 ▶    * An options object containing a delay and
218 ▶    * developer-defined parameters that provide styling defaults and
219 ▶    * can be overridden on invocation. Default delay is 0.
220 │    */
221 ▶   options: {params?: {[name: string]: any}} | null;
222 │ }
```

📄 `angular/packages/animations/src/animation_metadata.ts` L224–247 （▶ の行: 234, 236, 240, 246）

```ts
224 │ /**
225 │  * Encapsulates an animation state by associating a state name with a set of CSS styles.
226 │  * Instantiated and returned by the [`state()`](api/animations/state) function.
227 │  *
228 │  * @publicApi
229 │  *
230 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
231 │  */
232 │ export interface AnimationStateMetadata extends AnimationMetadata {
233 │   /**
234 ▶    * The state name, unique within the component.
235 │    */
236 ▶   name: string;
237 │   /**
238 │    *  The CSS styles associated with this state.
239 │    */
240 ▶   styles: AnimationStyleMetadata;
241 │   /**
242 │    * An options object containing
243 │    * developer-defined parameters that provide styling defaults and
244 │    * can be overridden on invocation.
245 │    */
246 ▶   options?: {params: {[name: string]: any}};
247 │ }
```

221 行目の `options` は `{params?} | null` で、217〜219 行目の説明は「delay と params を持つ」です。ただし型に `delay` はなく、`trigger()` は[旧 DSL の章](../animations/15-animations-legacy-dsl.md)で見た L653 のとおり、いつも `options: {}` を入れます（DEMO の記録でも `"options":{}`）。trigger の options を受け取る引数はありません。234 行目の state の名前の「一意」は確かめられず、同じ名前の state を 2 つ書くと、`AnimationTrigger` の states の Map（animation\_trigger.ts L32〜35、[旧 DSL の章](../animations/15-animations-legacy-dsl.md)の 4 節）で後に書いたほうが残ります。

📄 `angular/packages/animations/src/animation_metadata.ts` L341–377 （▶ の行: 353, 355, 357, 372, 376）

```ts
341 │ /**
342 │  * Encapsulates an animation style. Instantiated and returned by
343 │  * the `style()` function.
344 │  *
345 │  * @publicApi
346 │  *
347 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
348 │  */
349 │ export interface AnimationStyleMetadata extends AnimationMetadata {
350 │   /**
351 │    * A set of CSS style properties.
352 │    */
353 ▶   styles: '*' | {[key: string]: string | number} | Array<{[key: string]: string | number} | '*'>;
354 │   /**
355 ▶    * A percentage of the total animate time at which the style is to be applied.
356 │    */
357 ▶   offset: number | null;
358 │ }
359 │ 
360 │ /**
361 │  * Encapsulates an animation step. Instantiated and returned by
362 │  * the `animate()` function.
363 │  *
364 │  * @publicApi
365 │  *
366 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
367 │  */
368 │ export interface AnimationAnimateMetadata extends AnimationMetadata {
369 │   /**
370 │    * The timing data for the step.
371 │    */
372 ▶   timings: string | number | AnimateTimings;
373 │   /**
374 │    * A set of styles used in the step.
375 │    */
376 ▶   styles: AnimationStyleMetadata | AnimationKeyframesSequenceMetadata | null;
377 │ }
```

353 行目のとおり、`style` の中身は「`'*'`」「プロパティのオブジェクト」「その 2 つを混ぜた配列」のどれかです。355 行目の `offset` は「全体の時間の割合」で、`keyframes()` の中でだけ意味を持ちます（[次の回](02-anm-transition-query.md)）。372 行目の `timings` は型の上では `AnimateTimings`（次の引用）も入りますが、公開の関数 `animate()` の引数は `string | number` だけです（下の 716〜719 行目）。

📄 `angular/packages/animations/src/animation_metadata.ts` L30–50 （▶ の行: 31–33, 37–38, 42, 44–47）

```ts
30 │   /**
31 ▶    * The full duration of an animation step. A number and optional time unit,
32 ▶    * such as "1s" or "10ms" for one second and 10 milliseconds, respectively.
33 ▶    * The default unit is milliseconds.
34 │    */
35 │   duration: number;
36 │   /**
37 ▶    * The delay in applying an animation step. A number and optional time unit.
38 ▶    * The default unit is milliseconds.
39 │    */
40 │   delay: number;
41 │   /**
42 ▶    * An easing style that controls how an animations step accelerates
43 │    * and decelerates during its run time. An easing function such as `cubic-bezier()`,
44 ▶    * or one of the following constants:
45 ▶    * - `ease-in`
46 ▶    * - `ease-out`
47 ▶    * - `ease-in-and-out`
48 │    */
49 │   easing: string | null;
50 │ };
```

📄 `angular/packages/animations/src/animation_metadata.ts` L52–86 （▶ の行: 55, 65–66, 74–77, 81–83, 85）

```ts
52 │ /**
53 │  * @description Options that control animation styling and timing.
54 │  *
55 ▶  * The following animation functions accept `AnimationOptions` data:
56 │  *
57 │  * - `transition()`
58 │  * - `sequence()`
59 │  * - `group()`
60 │  * - `query()`
61 │  * - `animation()`
62 │  * - `useAnimation()`
63 │  * - `animateChild()`
64 │  *
65 ▶  * Programmatic animations built using the `AnimationBuilder` service also
66 ▶  * make use of `AnimationOptions`.
67 │  *
68 │  * @publicApi
69 │  *
70 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
71 │  */
72 │ export declare interface AnimationOptions {
73 │   /**
74 ▶    * Sets a time-delay for initiating an animation action.
75 ▶    * A number and optional time unit, such as "1s" or "10ms" for one second
76 ▶    * and 10 milliseconds, respectively.The default unit is milliseconds.
77 ▶    * Default value is 0, meaning no delay.
78 │    */
79 │   delay?: number | string;
80 │   /**
81 ▶    * A set of developer-defined parameters that modify styling and timing
82 ▶    * when an animation action starts. An array of key-value pairs, where the provided value
83 ▶    * is used as a default.
84 │    */
85 ▶   params?: {[name: string]: any};
86 │ }
```

31〜33 行目と 37〜38 行目は「数と、省略できる時間の単位。既定の単位は ms」です。47 行目の easing の定数の例には `ease-in-and-out` があります。どちらも 6 節で本物と比べます。82 行目の params は「キーと値の組の配列」と書かれていますが、85 行目の型はオブジェクト（`{[name: string]: any}`）です。74〜77 行目の delay は「数と省略できる単位、既定は 0」で、こちらは `number | string` を受けます。

## 3. trigger の説明文：値は文字列になるか

📄 `angular/packages/animations/src/animation_metadata.ts` L502–530 （▶ の行: 503–505, 514, 518, 520–522）

```ts
502 │ /**
503 ▶  * Creates a named animation trigger, containing a  list of [`state()`](api/animations/state)
504 ▶  * and `transition()` entries to be evaluated when the expression
505 ▶  * bound to the trigger changes.
506 │  *
507 │  * @param name An identifying string.
508 │  * @param definitions  An animation definition object, containing an array of
509 │  * [`state()`](api/animations/state) and `transition()` declarations.
510 │  *
511 │  * @return An object that encapsulates the trigger data.
512 │  *
513 │  * @usageNotes
514 ▶  * Define an animation trigger in the `animations` section of `@Component` metadata.
515 │  * In the template, reference the trigger by name and bind it to a trigger expression that
516 │  * evaluates to a defined animation state, using the following format:
517 │  *
518 ▶  * `[@triggerName]="expression"`
519 │  *
520 ▶  * Animation trigger bindings convert all values to strings, and then match the
521 ▶  * previous and current values against any linked transitions.
522 ▶  * Booleans can be specified as `1` or `true` and `0` or `false`.
523 │  *
524 │  * ### Usage Example
525 │  *
526 │  * The following example creates an animation trigger reference based on the provided
527 │  * name value.
528 │  * The provided animation value is expected to be an array consisting of state and
529 │  * transition declarations.
530 │  *
```

520〜521 行目は「trigger のバインディングはすべての値を文字列に変え、前の値と今の値を transition に照らす」、522 行目は「boolean は `1` か `true`、`0` か `false` で書ける」です。DEMO の「値は文字列か」は、`state('true', …)`・`state('0', …)`・`transition('false => true', animate(100))`・`transition('* => *', animate(50))` を持つ trigger に、値を順に入れて `(@flag.start)` の event を見た記録です。

| 入れた値 | event の fromState → toState（記録） | 選ばれた transition | 終わりの width（state のスタイル） |
| --- | --- | --- | --- |
| `true`（boolean） | `false`（boolean）→ `true`（boolean） | `'false => true'`（100ms） | 200px（`state('true')`） |
| `0`（number） | `true` → `0`（number） | `'* => *'`（50ms） | 10px（`state('0')`） |
| `1`（number） | `0` → `1`（number） | `'* => *'` | 200px（`state('true')`） |
| `'true'`（string） | `1` → `"true"` | `'* => *'` | 200px |
| `false`（boolean） | `"true"` → `false`（boolean） | `'* => *'` | 10px（`state('0')`） |

event の値は文字列になっていません。エンジンは値を `StateValue` に包むとき、`value != null ? value : null` にするだけで型を変えないからです（transition\_animation\_engine.ts L115〜117 と L1773〜1778。エンジンは[第 6 回](06-anm-engine.md)）。state のスタイルを探すときだけ `toString()` します（[旧 DSL の章](../animations/15-animations-legacy-dsl.md)の factory の L45）。そのため数の `1` も boolean の `true` も `state('true')` に当たり（`'1'` と `'true'` は `balanceProperties` で同じスタイルを共有する。[第 4 回](04-anm-ast.md)）、見た目は「文字列にした」ように振る舞います。一方、transition の式は `==` と boolean の特別扱いで比べます（同じ章の 3 節の L94〜101）。数の `0 → 1` は `'false => true'` に当たりませんでした（[次の回](02-anm-transition-query.md)の 1 節で、式ごとの表にします）。`AnimationEvent` の `fromState`・`toState` の型は `string`（animation\_event.ts L46・L50、[第 3 回](03-anm-builder-players.md)）なので、`event.toState === 'true'` と書いた比較は boolean の値では成り立ちません。520 行目の文は a577c9e1f48（2018-05-03、`docs: edit api doc comments for new template and style (#23682)`）からです。

## 4. inline の関数の例は strict の型検査に通らない

📄 `angular/packages/animations/src/animation_metadata.ts` L557–583 （▶ の行: 558–559, 563–564, 566, 574）

````ts
557 │  * ### Using an inline function
558 ▶  * The `transition` animation method also supports reading an inline function which can decide
559 ▶  * if its associated animation should be run.
560 │  *
561 │  * ```ts
562 │  * // this method is run each time the `myAnimationTrigger` trigger value changes.
563 ▶  * function myInlineMatcherFn(fromState: string, toState: string, element: any, params: {[key:
564 ▶  string]: any}): boolean {
565 │  *   // notice that `element` and `params` are also available here
566 ▶  *   return toState == 'yes-please-animate';
567 │  * }
568 │  *
569 │  * @Component({
570 │  *   selector: 'my-component',
571 │  *   templateUrl: 'my-component-tpl.html',
572 │  *   animations: [
573 │  *     trigger('myAnimationTrigger', [
574 ▶  *       transition(myInlineMatcherFn, [
575 │  *         // the animation sequence code
576 │  *       ]),
577 │  *     ])
578 │  *   ]
579 │  * })
580 │  * class MyComponent {
581 │  *   myStatusExp = "yes-please-animate";
582 │  * }
583 │  * ```
````

563〜564 行目の関数は 4 つの引数をすべて必須にしています（564 行目は JSDoc の行頭の `*` が抜けていますが、型の中の改行なのでコードとしては同じです）。これを 574 行目のように `transition()` に渡すと、strict の ngc（`strictTemplates`、TypeScript 6.0.3）で次のエラーになりました。`transition()` の引数の型（[旧 DSL の章](../animations/15-animations-legacy-dsl.md)で引いた L1095〜1100）は `element?`・`params?` の省略できる引数で、strictFunctionTypes では「必須の引数を取る関数」をそこに入れられないからです。

📄 `型の確かめ（手元の記録、2026-11-23）`

```
// animation_metadata.ts L561〜583 の例を strict の ngc（TypeScript 6.0.3、@angular/* 22.2.6）に通した結果
ex-trigger.ts:16:18 - error TS2345: Argument of type '(fromState: string, toState: string, element: any, params: { [key: string]: any; }) => boolean'
  is not assignable to parameter of type 'string | ((fromState: string, toState: string, element?: any, params?: { [key: string]: any; } | undefined) => boolean)'.
    Types of parameters 'params' and 'params' are incompatible.
      Type '{ [key: string]: any; } | undefined' is not assignable to type '{ [key: string]: any; }'.
```

実行では、関数にはいつも 4 つとも渡ります。[第 4 回](04-anm-ast.md)の記録で、`matchTransition('a', 'b', div, {target: 'b'})` は関数に `('a', 'b', div, {"target":"b"})` を渡し、エンジンは trigger の値の `params` を、無ければ `{}` を渡します（transition\_animation\_engine.ts L125〜127）。型の宣言のほうが実際より緩いので、例を通すには `params?` と書きます。

## 5. @.disabled：止めてもコールバックは来る

📄 `angular/packages/animations/src/animation_metadata.ts` L585–616 （▶ の行: 586–590, 598–599, 614–615）

````ts
585 │  * ### Disabling Animations
586 ▶  * When true, the special animation control binding `@.disabled` binding prevents
587 ▶  * all animations from rendering.
588 ▶  * Place the  `@.disabled` binding on an element to disable
589 ▶  * animations on the element itself, as well as any inner animation triggers
590 ▶  * within the element.
591 │  *
592 │  * The following example shows how to use this feature:
593 │  *
594 │  * ```angular-ts
595 │  * @Component({
596 │  *   selector: 'my-component',
597 │  *   template: `
598 ▶  *     <div [@.disabled]="isDisabled">
599 ▶  *       <div [@childAnimation]="exp"></div>
600 │  *     </div>
601 │  *   `,
602 │  *   animations: [
603 │  *     trigger("childAnimation", [
604 │  *       // ...
605 │  *     ])
606 │  *   ]
607 │  * })
608 │  * class MyComponent {
609 │  *   isDisabled = true;
610 │  *   exp = '...';
611 │  * }
612 │  * ```
613 │  *
614 ▶  * When `@.disabled` is true, it prevents the `@childAnimation` trigger from animating,
615 ▶  * along with any inner animations.
616 │  *
````

📄 `angular/packages/animations/src/animation_metadata.ts` L617–647 （▶ の行: 619, 621, 631, 637–640, 643–646）

````ts
617 │  * ### Disable animations application-wide
618 │  * When an area of the template is set to have animations disabled,
619 ▶  * **all** inner components have their animations disabled as well.
620 │  * This means that you can disable all animations for an app
621 ▶  * by placing a host binding set on `@.disabled` on the topmost Angular component.
622 │  *
623 │  * ```ts
624 │  * import {Component, HostBinding} from '@angular/core';
625 │  *
626 │  * @Component({
627 │  *   selector: 'app-component',
628 │  *   templateUrl: 'app.component.html',
629 │  * })
630 │  * class AppComponent {
631 ▶  *   @HostBinding('@.disabled')
632 │  *   public animationsDisabled = true;
633 │  * }
634 │  * ```
635 │  *
636 │  * ### Overriding disablement of inner animations
637 ▶  * Despite inner animations being disabled, a parent animation can `query()`
638 ▶  * for inner elements located in disabled areas of the template and still animate
639 ▶  * them if needed. This is also the case for when a sub animation is
640 ▶  * queried by a parent and then later animated using `animateChild()`.
641 │  *
642 │  * ### Detecting when an animation is disabled
643 ▶  * If a region of the DOM (or the entire application) has its animations disabled, the animation
644 ▶  * trigger callbacks still fire, but for zero seconds. When the callback fires, it provides
645 ▶  * an instance of an `AnimationEvent`. If animations are disabled,
646 ▶  * the `.disabled` flag on the event is true.
647 │  *
````

DEMO の「@.disabled」で、説明文のそれぞれを確かめました。`[@.disabled]` の印をエンジンがどう扱うか（`AnimationRenderer.setProperty` の L178〜180）は[旧パッケージの入口の章](../animations/14-animations-legacy-setup.md)の 4 節です。

1. **586〜590 行目：要素と中の trigger を止める**

   `[@.disabled]="true"` の中の `[@childAnimation]` の値を変えた直後、子の Web Animation は 0 個でした。false にして変えると 1 個（1000ms）です。
2. **619〜621・631 行目：ルートに置くとアプリ全体**

   `@HostBinding('@.disabled')` と同じ `host: {'[@.disabled]': 'animationsDisabled'}` をルートに書くと、子のコンポーネントの `* => *` も 0 個でした。
3. **637〜640 行目：親の query は無効の中の要素も動かす**

   親の `query('.inner', [style({opacity: 0}), animate('800ms', …)])` は、`[@.disabled]="true"` の中の `.inner` に 800ms の Web Animation を作りました。
4. **643〜646 行目：コールバックは 0 秒で来る**

   `(@childAnimation.done)` は値を変えてから 33ms 以内に呼ばれ、event の `disabled` は true でした。ただし `totalTime` は 0 ではなく、本来の長さの 1000 です。これは e1bf067090c（2018-02-14、`fix(animations): report correct totalTime value even during noOp animations (#22225)`）で意図して入った振る舞いで、説明文は触れていません。

645〜646 行目は event の `.disabled` を読むように書いていますが、`AnimationEvent` の型の説明では `disabled` は「Internal.」です（[第 3 回](03-anm-builder-players.md)の 7 節）。

## 6. animate の timings：説明文の形と、本物が受け付ける形

📄 `angular/packages/animations/src/animation_metadata.ts` L656–679 （▶ の行: 660–663, 665–667, 669–670, 675, 677）

```ts
656 │ /**
657 │  * Defines an animation step that combines styling information with timing information.
658 │  *
659 │  * @param timings Sets `AnimateTimings` for the parent animation.
660 ▶  * A string in the format "duration [delay] [easing]".
661 ▶  *  - Duration and delay are expressed as a number and optional time unit,
662 ▶  * such as "1s" or "10ms" for one second and 10 milliseconds, respectively.
663 ▶  * The default unit is milliseconds.
664 │  *  - The easing value controls how the animation accelerates and decelerates
665 ▶  * during its runtime. Value is one of  `ease`, `ease-in`, `ease-out`,
666 ▶  * `ease-in-out`, or a `cubic-bezier()` function call.
667 ▶  * If not supplied, no easing is applied.
668 │  *
669 ▶  * For example, the string "1s 100ms ease-out" specifies a duration of
670 ▶  * 1000 milliseconds, and delay of 100 ms, and the "ease-out" easing style,
671 │  * which decelerates near the end of the duration.
672 │  * @param styles Sets AnimationStyles for the parent animation.
673 │  * A function call to either `style()` or `keyframes()`
674 │  * that returns a collection of CSS style entries to be applied to the parent animation.
675 ▶  * When null, uses the styles from the destination state.
676 │  * This is useful when describing an animation step that will complete an animation;
677 ▶  * see "Animating to the final state" in `transitions()`.
678 │  * @returns An object that encapsulates the animation step.
679 │  *
```

📄 `angular/packages/animations/src/animation_metadata.ts` L680–711 （▶ の行: 689–693, 700, 705）

````ts
680 │  * @usageNotes
681 │  * Call within an animation `sequence()`, {@link /api/animations/group group()}, or
682 │  * `transition()` call to specify an animation step
683 │  * that applies given style data to the parent animation for a given amount of time.
684 │  *
685 │  * ### Syntax Examples
686 │  * **Timing examples**
687 │  *
688 │  * The following examples show various `timings` specifications.
689 ▶  * - `animate(500)` : Duration is 500 milliseconds.
690 ▶  * - `animate("1s")` : Duration is 1000 milliseconds.
691 ▶  * - `animate("100ms 0.5s")` : Duration is 100 milliseconds, delay is 500 milliseconds.
692 ▶  * - `animate("5s ease-in")` : Duration is 5000 milliseconds, easing in.
693 ▶  * - `animate("5s 10ms cubic-bezier(.17,.67,.88,.1)")` : Duration is 5000 milliseconds, delay is 10
694 │  * milliseconds, easing according to a bezier curve.
695 │  *
696 │  * **Style examples**
697 │  *
698 │  * The following example calls `style()` to set a single CSS style.
699 │  * ```ts
700 ▶  * animate(500, style({ background: "red" }))
701 │  * ```
702 │  * The following example calls `keyframes()` to set a CSS style
703 │  * to different values for successive keyframes.
704 │  * ```ts
705 ▶  * animate(500, keyframes(
706 │  *  [
707 │  *   style({ background: "blue" }),
708 │  *   style({ background: "red" })
709 │  *  ])
710 │  * ```
711 │  *
````

📄 `angular/packages/animations/src/animation_metadata.ts` L712–721 （▶ の行: 717–718, 720）

```ts
712 │  * @publicApi
713 │  *
714 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
715 │  */
716 │ export function animate(
717 ▶   timings: string | number,
718 ▶   styles: AnimationStyleMetadata | AnimationKeyframesSequenceMetadata | null = null,
719 │ ): AnimationAnimateMetadata {
720 ▶   return {type: AnimationMetadataType.Animate, styles, timings};
721 │ }
```

660 行目の形は `"duration [delay] [easing]"`、661〜663 行目は 31〜33 行目と同じく「単位は省ける、既定は ms」です。720 行目の `animate()` は timings をそのまま入れるだけなので、文字列を読むのは AST を作るとき（`constructTimingAst`、[第 4 回](04-anm-ast.md)）で、中身は util.ts の `parseTimeExpression`（L70〜116、[第 7 回](07-anm-driver.md)のファイル）です。DEMO の「timings」は、各文字列を本物の `buildAnimationAst` に通した結果と、同じものを `AnimationBuilder` で要素に流したときに `element.animate()` に渡った値です。

| timings | 説明文 | AST で読んだ値（記録） | Web Animation（記録） |
| --- | --- | --- | --- |
| `500`・`"1s"`・`"10ms"` | 689〜690 行目 | 500・1000・10ms | duration がそのまま |
| `"100ms 0.5s"` | 691 行目：100ms、delay 500ms | duration=100 delay=500 | duration=600・delay=0。keyframes の offset が 0, 0.8333, 1 |
| `"5s ease-in"` | 692 行目 | easing="ease-in" | 全体の easing は linear、最初の keyframe に ease-in |
| `"5s 10ms cubic-bezier(.17,.67,.88,.1)"` | 693〜694 行目 | そのまま | duration=5010、offset 0.002 の keyframe に cubic-bezier |
| `"500"`・`"1s 100"` | 661〜663 行目：単位は省ける | NG03000「The provided timing value "500" is invalid.」 | build で NG03503 |
| `"1s ease-in-and-out"` | 47 行目の easing の例 | easing="ease-in-and-out"（エラーなし） | Web Animation は 0 個、onDone はすぐ 1 回 |
| `"1s ease-in-out"`・`"1s steps(4, end)"` | 666 行目（steps は説明に無い） | そのまま | keyframe に ease-in-out・steps(4) |
| `"1S"` | （説明に無い） | duration=1 | duration=1（1 秒ではなく 1ms） |
| `".5s"` | （説明に無い） | duration=500 | 500 |
| `"1 s"`・`"ease-in 1s"` | （説明に無い） | NG03000 | NG03503 |
| `"-1s"`・`-100`・`"1s -100ms"` | （説明に無い） | NG03000 と NG03100（delay なら NG03101） | NG03503 |

1. **単位は省けない**

   util.ts L68〜69 の `PARSE_TIME_EXPRESSION_REGEX` は `^(-?[\.\d]+)(m?s)…` で、単位の `(m?s)` が必須です。単位を省けるのは number を渡したとき（L96〜97 の `duration = exp`）だけです。31〜33 行目・37〜38 行目・661〜663 行目の「optional time unit」は number と string を区別していません。これらの文は a577c9e1f48（2018）で今の形になりました。
2. **大文字の S は ms になる**

   同じ正規表現は末尾の `i` で大文字も受けますが、L49〜56 の `_convertTimeValueToMS` は `case 's'`（小文字）だけを秒にし、ほかは ms のまま返します。`'1S'` は 1ms でした。
3. **ease-in-and-out は何も動かさない**

   AST は easing の文字列を確かめずに通します（正規表現の `[-a-z]+` に合う）。Chrome は `element.animate()` の keyframe の easing が正しくないと TypeError を投げ（同じ keyframe を直接渡すと「Failed to execute 'animate' on 'Element': 'ease-in-and-out' is not a valid value for easing」）、`WebAnimationsPlayer` はそれを握りつぶして「すぐ終わったプレイヤー」にします（web\_animations\_player.ts L113〜118、[TransitionAnimationEngine の章](../animations/16-animations-legacy-engine.md)の 6 節）。結果として、コンソールに何も出ずにアニメーションが飛ばされます。47 行目も a577c9e1f48 から変わっていません。
4. **delay と easing は keyframes に入る**

   Web Animation の `delay` と全体の `easing` は使われず、delay は「最初のスタイルのまま止まる区間」、easing は区間の始めの keyframe に入りました。この組み立てはタイムライン（[第 5 回](05-anm-timeline.md)）の仕事です。

675〜677 行目の「styles を省くと行き先の state のスタイルを使う」は、7 節の時刻表で確かめます。677 行目が指す先は「`transitions()` の "Animating to the final state"」ですが、関数は `transition()`、見出しは `Animating to a Final State`（L1037）です。

## 7. style：数は px に、「\*」は要素から

📄 `angular/packages/animations/src/animation_metadata.ts` L807–835 （▶ の行: 808, 810, 812, 814–817, 819, 830, 833）

````ts
807 │ /**
808 ▶  * Declares a key/value object containing CSS properties/styles that
809 │  * can then be used for an animation [`state`](api/animations/state), within an animation
810 ▶  *`sequence`, or as styling data for calls to `animate()` and `keyframes()`.
811 │  *
812 ▶  * @param tokens A set of CSS styles or HTML styles associated with an animation state.
813 │  * The value can be any of the following:
814 ▶  * - A key-value style pair associating a CSS property with a value.
815 ▶  * - An array of key-value style pairs.
816 ▶  * - An asterisk (*), to use auto-styling, where styles are derived from the element
817 ▶  * being animated and applied to the animation when it starts.
818 │  *
819 ▶  * Auto-styling can be used to define a state that depends on layout or other
820 │  * environmental factors.
821 │  *
822 │  * @return An object that encapsulates the style data.
823 │  *
824 │  * @usageNotes
825 │  * The following examples create animation styles that collect a set of
826 │  * CSS property values:
827 │  *
828 │  * ```ts
829 │  * // string values for CSS properties
830 ▶  * style({ background: "red", color: "blue" })
831 │  *
832 │  * // numerical pixel values
833 ▶  * style({ width: 100, height: 0 })
834 │  * ```
835 │  *
````

📄 `angular/packages/animations/src/animation_metadata.ts` L836–852 （▶ の行: 837, 840–841, 849, 851）

````ts
836 │  * The following example uses auto-styling to allow an element to animate from
837 ▶  * a height of 0 up to its full height:
838 │  *
839 │  * ```ts
840 ▶  * style({ height: 0 }),
841 ▶  * animate("1s", style({ height: "*" }))
842 │  * ```
843 │  *
844 │  * @publicApi
845 │  *
846 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
847 │  **/
848 │ export function style(
849 ▶   tokens: '*' | {[key: string]: string | number} | Array<'*' | {[key: string]: string | number}>,
850 │ ): AnimationStyleMetadata {
851 ▶   return {type: AnimationMetadataType.Style, styles: tokens, offset: null};
852 │ }
````

851 行目のとおり、`style()` は渡したものを `styles` に入れ、`offset: null` を足すだけです。833 行目の「数は px」は、style を keyframes にするときの `WebAnimationsStyleNormalizer` の仕事です（[第 7 回](07-anm-driver.md)）。[第 4 回](04-anm-ast.md)の記録で、`style({width: 100})` の keyframe は `"100px"`、単位の無い文字列 `'100'` は NG03005 でした。

816〜817 行目と 837〜841 行目の auto-styling を、`:enter` に `[style({height: 0}), animate('1s', style({height: '*'}))]` を書いた要素（中身の高さが 80px）で記録しました。Web Animation の keyframes は `0px → 80px` で、`'*'` は「動き出す前に測った値」に置き換わっています。時刻表は 0ms で 0px、250ms で 20px、500ms で 40px、1000ms で 80px です。終わったあと、要素の `style` 属性に height は残りませんでした（もとの `overflow: hidden; background: #eee;` だけ）。

## 8. state：状態のスタイルは残る

📄 `angular/packages/animations/src/animation_metadata.ts` L854–891 （▶ の行: 857, 861–866, 870–872, 878–879, 890）

```ts
854 │ /**
855 │  * Declares an animation state within a trigger attached to an element.
856 │  *
857 ▶  * @param name One or more names for the defined state in a comma-separated string.
858 │  * The following reserved state names can be supplied to define a style for specific use
859 │  * cases:
860 │  *
861 ▶  * - `void` You can associate styles with this name to be used when
862 ▶  * the element is detached from the application. For example, when an `ngIf` evaluates
863 ▶  * to false, the state of the associated element is void.
864 ▶  *  - `*` (asterisk) Indicates the default state. You can associate styles with this name
865 ▶  * to be used as the fallback when the state that is being animated is not declared
866 ▶  * within the trigger.
867 │  *
868 │  * @param styles A set of CSS styles associated with this state, created using the
869 │  * `style()` function.
870 ▶  * This set of styles persists on the element once the state has been reached.
871 ▶  * @param options Parameters that can be passed to the state when it is invoked.
872 ▶  * 0 or more key-value pairs.
873 │  * @return An object that encapsulates the new state data.
874 │  *
875 │  * @usageNotes
876 │  * Use the `trigger()` function to register states to an animation trigger.
877 │  * Use the `transition()` function to animate between states.
878 ▶  * When a state is active within a component, its associated styles persist on the element,
879 ▶  * even when the animation ends.
880 │  *
881 │  * @publicApi
882 │  *
883 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
884 │  **/
885 │ export function state(
886 │   name: string,
887 │   styles: AnimationStyleMetadata,
888 │   options?: {params: {[name: string]: any}},
889 │ ): AnimationStateMetadata {
890 ▶   return {type: AnimationMetadataType.State, name, styles, options};
891 │ }
```

857 行目の「カンマで区切って複数の名前」は、[旧 DSL の章](../animations/15-animations-legacy-dsl.md)の 2 節（visitTrigger の L181）で 1 つずつの StateAst に分かれます。DEMO の「メタデータ」では、`state('open, expanded', …)` の返り値の name は `"open, expanded"` のままでした。分けるのは AST のときです。861〜866 行目の `void` と `*` は名前の上では特別扱いされず、`*` は「名前で見つからないときの既定」として使われます（同じ章の factory の L43〜45）。871〜872 行目の `options` の params は[第 4 回](04-anm-ast.md)で、既定の無い `{{` 〜 `}}` が NG03008 になることと合わせて読みます。

870 行目と 878〜879 行目の「状態に着いたらスタイルが要素に残る」を、open（height 200px・opacity 1・黄）と closed（100px・0.8・青）の 2 つの state と、`transition('open => closed', [animate('1s')])`・`transition('closed => open', [animate('0.5s 100ms ease-out')])` で記録しました。

| 時刻（ms） | open → closed の height / opacity / 背景 | 時刻（ms） | closed → open の height / opacity |
| --- | --- | --- | --- |
| 0 | 200px / 1 / rgb(255, 255, 0) | 0 | 100px / 0.8 |
| 250 | 175px / 0.95 / rgb(191, 191, 64) | 100 | 100px / 0.8（delay の区間） |
| 500 | 150px / 0.9 / rgb(128, 128, 128) | 225 | 137.812px / 0.875628 |
| 750 | 125px / 0.85 / rgb(64, 64, 191) | 350 | 168.453px / 0.936929 |
| 1000 | 100px / 0.8 / 青 | 600 | 200px / 1 |

前の表で、`animate('1s')` には style が無いのに 3 つのプロパティが動きました。675 行目のとおり、行き先の state のスタイルが最後の keyframe になったからです（state のスタイルをタイムラインの両端に置くのは、[旧 DSL の章](../animations/15-animations-legacy-dsl.md)の 5 節の L88〜89）。終わったあと、要素の `style` 属性は `height: 100px; opacity: 0.8; background-color: blue;` で、state のスタイルが書き込まれたまま残りました（878〜879 行目のとおり）。最初の描画（遷移なし）でも、open のスタイルが属性に入っていました。

> **🧪 DEMO — npm の @angular/animations 22.2.6 を headless Chrome で動かした記録**
>
> ボタンは、記録のスクリプトがシナリオごとにページを読み直して取った結果を再生します（開発モードと本番相当の 2 回）。「説明と違う」の行は左に印を付けます。2 つのモードで結果が違う行は、本番の欄に値を出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/anm-trigger-state)

## ここまでの呼び出し（trigger を書いてから要素が動くまで）

- 👤 `trigger('openClose', [state(…), transition(…, animate('1s'))])` — animation\_metadata.ts L652 — *type の番号つきのオブジェクトを返すだけ*
- `AnimationRendererFactory.createRenderer()` — animation\_renderer.ts — *旧パッケージの入口の章*
  - `AnimationEngine.registerTrigger()` — animation\_engine\_next.ts
    - `buildAnimationAst()` — animation\_ast\_builder.ts L119 — *timings の文字列はここで読む（6 節、第 4 回）*
    - `buildTrigger()` — animation\_trigger.ts L14 — *state を名前 → スタイルの Map に*
- 👤 `[@openClose]="isOpen ? 'open' : 'closed'"` — テンプレート — *値は文字列にしない（3 節）*
  - `TransitionAnimationEngine.trigger()` — transition\_animation\_engine.ts — *第 6 回*
  - `AnimationTransitionFactory.build()` — animation\_transition\_factory.ts L50 — *前後の state のスタイルを両端に（8 節）*
    - `buildAnimationTimelines()` — animation\_timeline\_builder.ts — *delay と easing を keyframes に（第 5 回）*
  - `WebAnimationsDriver.animate()` → `element.animate()` — web\_animations\_player.ts L116 — *正しくない easing はここで握りつぶされる（6 節）*

## テストと直し方

| ファイル（packages/animations/browser/test/dsl/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `animation_spec.ts` | `validation`（65）› `should throw an error if an animation time is invalid`（162） | `'500xs'` と `'500ms 500ms 500ms ease-out'` が NG03000。単位の無い文字列の it は無い |
| `animation_spec.ts` | 同じ describe › `should throw if negative durations are used`（176）・`should throw if negative delays are used`（190） | 6 節の表の負の値 |
| `animation_spec.ts` | `timing values`（1262）› `should properly combine an easing value with a delay into a set of three keyframes`（1263）、`keyframe building` › `should support an easing value that uses cubic-bezier(...)`（412） | 6 節の「delay と easing は keyframes に入る」 |
| `animation_trigger_spec.ts` | `trigger usage`（59）› ``should match `true` and `false` given boolean values``（200）・``should match `1` and `0` given boolean values``（211）・`should treat numeric values (disguised as strings) as proper state values`（262） | 3 節の比べ方。「値を文字列にする」を確かめる it は無い |

📄 `走らせたコマンド（2026-11-23）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/animations/browser/test:test_web_chromium --nocache_test_results --test_output=all
$ pnpm bazel test //packages/animations/browser/test:test --nocache_test_results --test_output=all
（結果は下の段落）
```

結果は手元の bazel で、ブラウザーの `:test_web_chromium` が 1 ファイル（束ねたもの）で 124 passed・0 failed、Node の `:test` は 17 specs・0 failures でした（DSL の spec の多くは `if (isNode)` でブラウザーだけ。数の内訳は[旧 DSL の章](../animations/15-animations-legacy-dsl.md)のテストの節）。ease-in-and-out の例と大文字の `S` を確かめる it は、どの spec にもありません。

直すとしたら、説明文は animation\_metadata.ts の 31〜33・37〜38・661〜663 行目を「number なら ms、string なら単位が要る」に、47 行目を `ease-in-out` に、520〜521 行目を「値はそのまま、state のスタイルは文字列にした名前で探す」に、563〜564 行目を `element?: any, params?: …` にします。大文字の単位は util.ts の `_convertTimeValueToMS`（L49〜56）で `unit.toLowerCase()` にするか、正規表現の `i` を外すかで、spec は animation\_spec.ts の `describe('validation')` に「`'1S'` を 1000ms と読む（またはエラー）」の it を足します。easing の値を確かめるなら、AST の `constructTimingAst`（[第 4 回](04-anm-ast.md)）で `CSS.supports('animation-timing-function', easing)` のような確かめを足す形になりますが、Node（ドライバーの無いテスト）でも動く書き方が要ります。

## 聞かれそうな質問

**Q. `animate('300')` と `animate(300)` は同じですか？**

違います。`300`（number）は 300ms ですが、`'300'`（string）は NG03000 で、コンポーネントの登録のときに NG03404、`AnimationBuilder.build` なら NG03503 になります。文字列は `'300ms'` と単位を付けます（6 節、util.ts L68〜69）。

**Q. `easing` に間違った値を書くとどうなりますか？**

AST は通り、Chrome の `element.animate()` が投げた TypeError を `WebAnimationsPlayer` が握りつぶすので、アニメーションは飛ばされて onDone がすぐ来ます。コンソールには何も出ません（6 節の `ease-in-and-out`）。

**Q. `[@flag]="isOpen"` の boolean は `state('true')` に当たりますか？**

当たります。state のスタイルは名前を `toString()` して探すからです。ただし `(@flag.done)` の `event.toState` は boolean の `true` のままで、文字列にはなりません（3 節）。

**Q. アニメーションのあと state のスタイルは要素に残りますか？**

残ります。closed に着いたあと、`style` 属性に `height: 100px; opacity: 0.8; background-color: blue;` が書かれていました（8 節）。`style({height: '*'})` のように state でない auto のスタイルは、終わると消えました（7 節）。

**Q. `@.disabled` のとき `done` の `totalTime` は 0 ですか？**

0 ではありません。コールバックはすぐ呼ばれ `disabled` は true ですが、`totalTime` は本来の長さ（記録で 1000）です（5 節、e1bf067090c）。

## 読み終えて

- `AnimationMetadataType` は 0〜12 の 13 個。`AUTO_STYLE` は文字列の `'*'`。`trigger()` の options はいつも `{}`。
- timings の単位を省けるのは number だけ。文字列の `'500'` は NG03000、`'1S'` は 1ms。
- easing の例の `ease-in-and-out` は CSS に無く、Chrome では黙って何も動かない。
- trigger の値は文字列にならない。state は文字列にした名前で探し、transition の式は `==` と boolean の特別扱いで比べる。
- state のスタイルは終わったあとも要素に残り、`'*'` は動き出す前に測った値になる。

---

← 前: [spec と issue を読む：core の説明文（3）を固めているもの](../crh/08-crh-tests-issues.md)  
次: [transition・group・sequence・keyframes・query・stagger の説明文](02-anm-transition-query.md) →
