[目次](../README.md) › [アニメーションの内側](README.md) › 第 6 回 / 全 20 回

# いちばん長いアニメーション：getAnimations と getComputedStyle

> determineLongestAnimation が element.getAnimations() から、それが空なら getComputedStyle の animation-duration・transition-duration・delay から長さを計算する行（繰り返しの回数は掛けない）、longestAnimations の WeakMap、isLongestAnimation が終わったイベントの Animation の長さを 1 ms の誤差で比べ、無ければ名前で照らし合わせる仕組み、無限に繰り返すアニメーションの扱い（#67350）。core/test/animation/longest\_animation\_spec.ts。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-longest)

---

1 つの要素に animation が 2 つ、transition が 1 つ、のように複数の動きが付いているとき、enter のクラスを外すのも leave で要素を消すのも、**いちばん長いもの**が終わったときです。この章では、その「いちばん長い」を決める `determineLongestAnimation` が `element.getAnimations()` から、無ければ `getComputedStyle` から長さを計算する行と、終わったイベントが本当にその「いちばん長いもの」かを 1 ms の誤差つきで確かめる `isLongestAnimation`、そして無限に繰り返すアニメーションの扱いを読みます。

読む対象は `packages/core/src/animation/longest_animation.ts` と `packages/core/src/animation/utils.ts`（`isLongestAnimation`）、確かめる spec は `packages/core/test/animation/longest_animation_spec.ts` です。

1. [1. 全体像](01-animations-overview.md)
2. [2. テンプレートから命令へ](02-animations-compile.md)
3. [3. 命令がすること](03-animations-instructions.md)
4. [4. 待ち行列](04-animations-queue.md)
5. [5. enter のクラス](05-animations-enter-classes.md)
6. **6. いちばん長いアニメーション**（この章）
7. [7. 関数で動かす](07-animations-functions.md)
8. [8. 動かないとき](08-animations-disabled.md)
9. [9. 消すのを遅らせる](09-animations-leave-removal.md)
10. [10. leave のクラス](10-animations-leave-classes.md)
11. [11. 入れ子の leave](11-animations-leave-nested.md)
12. [12. 並べ替えと出し直し](12-animations-leave-reorder.md)
13. [13. スタイルの後片付け](13-animations-styles-teardown.md)
14. [14. 旧パッケージの入口](14-animations-legacy-setup.md)
15. [15. 旧 DSL とキーフレーム](15-animations-legacy-dsl.md)
16. [16. TransitionAnimationEngine](16-animations-legacy-engine.md)
17. [17. 2 つが同居するとき](17-animations-legacy-compat.md)
18. [18. 移行](18-animations-migration.md)
19. [19. テスト](19-animations-testing.md)
20. [20. issue と変更を読む](20-animations-issues.md)

呼ぶ側は 2 か所です。enter では `runEnterAnimation` の requestAnimationFrame の中（[第 5 回](05-animations-enter-classes.md)）、leave では `animateLeaveClassRunner` の requestAnimationFrame の中（[第 10 回](10-animations-leave-classes.md)）。どちらも「クラスを付けた次のフレーム」に `determineLongestAnimation(el, longestAnimations, areAnimationSupported)` を呼び、結果を `longestAnimations`（キーが要素の WeakMap）に入れてもらいます。そして animationend / transitionend が来るたびに `isLongestAnimation(event, el)` で照らし合わせます。

## 1. 入口：determineLongestAnimation

📄 `angular/packages/core/src/animation/longest_animation.ts` L112–131 （▶ の行: 124–126, 129–130）

```ts
112 │ /**
113 │  * Multiple animations can be set on an element. This grabs an element and
114 │  * determines which of those will be the longest duration. If we didn't do
115 │  * this, elements would be removed whenever the first animation completes.
116 │  * This ensures we get the longest running animation and only remove when
117 │  * that animation completes.
118 │  */
119 │ export function determineLongestAnimation(
120 │   el: HTMLElement,
121 │   animationsMap: WeakMap<HTMLElement, LongestAnimation>,
122 │   areAnimationSupported: boolean,
123 │ ): void {
124 ▶   if (!areAnimationSupported) return;
125 ▶   const animations = el.getAnimations();
126 ▶   return animations.length === 0
127 │     ? // fallback to computed styles if getAnimations is empty. This would happen if styles are
128 │       // currently recalculating due to a reflow happening elsewhere.
129 ▶       determineLongestAnimationFromComputedStyles(el, animationsMap)
130 ▶     : determineLongestAnimationFromElementAnimations(el, animationsMap, animations);
131 │ }
```

1. **124 行目 動かない環境では何もしない**

   3 つ目の引数 `areAnimationSupported` が false なら、すぐ戻ります。この値はサーバーかどうかと `document.documentElement.getAnimations` の有無で決まります（[第 8 回](08-animations-disabled.md)）。
2. **125 行目 その要素のアニメーションを全部取る**

   `el.getAnimations()` は Web Animations API のメソッドで、その要素で動いている（これから動く）`CSSAnimation`・`CSSTransition`・`element.animate()` の `Animation` を配列で返します。引数を渡していないので、**子の要素の分は含みません**。
3. **126〜130 行目 空なら getComputedStyle に落ちる**

   127〜128 行目のコメントのとおり、ほかの場所でスタイルの再計算が起きている最中は `getAnimations()` が空になることがあります。そのときは 129 行目で計算済みスタイルから求めます（4 節）。空でなければ 130 行目（2 節）です。

## 2. getAnimations() から求める

📄 `angular/packages/core/src/animation/longest_animation.ts` L133–168 （▶ の行: 138, 144–146, 148, 153–154, 157, 160–161, 164–166）

```ts
133 │ function determineLongestAnimationFromElementAnimations(
134 │   el: HTMLElement,
135 │   animationsMap: WeakMap<HTMLElement, LongestAnimation>,
136 │   animations: Animation[],
137 │ ): void {
138 ▶   let longest: LongestAnimation = {
139 │     animationName: undefined,
140 │     propertyName: undefined,
141 │     duration: 0,
142 │   };
143 │   for (const animation of animations) {
144 ▶     const timing = animation.effect?.getTiming();
145 ▶     if (timing?.iterations === Infinity) {
146 ▶       continue;
147 │     }
148 ▶     const duration = getAnimationDuration(animation) ?? 0;
149 │ 
150 │     let propertyName: string | undefined;
151 │     let animationName: string | undefined;
152 │ 
153 ▶     if ((animation as CSSAnimation).animationName) {
154 ▶       animationName = (animation as CSSAnimation).animationName;
155 │     } else {
156 │       // Check for CSSTransition specific property
157 ▶       propertyName = (animation as CSSTransition).transitionProperty;
158 │     }
159 │ 
160 ▶     if (duration >= longest.duration) {
161 ▶       longest = {animationName, propertyName, duration};
162 │     }
163 │   }
164 ▶   if (isShorterThanExistingAnimation(animationsMap.get(el), longest)) return;
165 ▶   if (longestExists(longest)) {
166 ▶     animationsMap.set(el, longest);
167 │   }
168 │ }
```

1. **138〜142 行目 初期値は「名前も長さも無し」**

   `animationName` と `propertyName` がどちらも `undefined`、`duration` が 0 から始めます。
2. **144〜147 行目 無限に繰り返すものは飛ばす**

   `effect.getTiming().iterations` が `Infinity`（CSS の `animation-iteration-count: infinite`）なら数えません。終わらないものを待つと永遠に終わらないからです（5 節）。
3. **148 行目 長さを測る**

   `getAnimationDuration`（3 節）で delay と duration を足し、再生速度で割った値です。
4. **153〜158 行目 animation か transition か**

   `CSSAnimation` なら `animationName`（`@keyframes` の名前）、そうでなければ `CSSTransition` の `transitionProperty`（`opacity` など）を覚えます。あとで end のイベントの `animationName` / `propertyName` と照らし合わせるためです（6 節）。
5. **160〜162 行目 長ければ入れ替える**

   比べ方は `>=` です。同じ長さなら、配列の後ろにあるものが残ります。
6. **164〜167 行目 既にもっと長い記録があれば上書きしない／あれば入れる**

   164 行目の `isShorterThanExistingAnimation` と 165 行目の `longestExists` は 4 節で読みます。「既に記録がある」のは、同じ要素に enter が 2 回呼ばれたとき（host バインディングとテンプレートの両方）などです。

## 3. 1 つのアニメーションの長さ：getAnimationDuration

📄 `angular/packages/core/src/animation/longest_animation.ts` L72–88 （▶ の行: 74–75, 78–79, 82–84）

```ts
72 │ /** Gets an animation's total duration, including its delay and playback rate. */
73 │ export function getAnimationDuration(animation: Animation): number | undefined {
74 ▶   const timing = animation.effect?.getTiming();
75 ▶   if (timing === undefined) return undefined;
76 │ 
77 │   // duration can be a string 'auto' or a number.
78 ▶   const animationDuration = typeof timing.duration === 'number' ? timing.duration : 0;
79 ▶   let duration = (timing.delay ?? 0) + animationDuration;
80 │ 
81 │   // Account for playback rate if it is set.
82 ▶   const playbackRate = animation.playbackRate;
83 ▶   if (playbackRate !== undefined && playbackRate !== 0 && playbackRate !== 1) {
84 ▶     duration /= Math.abs(playbackRate);
85 │   }
86 │ 
87 │   return duration;
88 │ }
```

1. **74〜75 行目 タイミングを取る**

   `animation.effect?.getTiming()` が無ければ `undefined` を返します（呼ぶ側の 148 行目で `?? 0` になる）。
2. **78〜79 行目 delay + duration**

   `duration` は数か文字列 `'auto'` です。`'auto'` なら 0 として、`delay` を足します。**繰り返しの回数（`iterations`）は掛けていません。** Web Animations API の `duration` は 1 回分の長さなので、`animation-iteration-count: 2` でも 1 回分として数えます。7 節のデモで「2 回」を選ぶと、その影響が見えます。
3. **82〜85 行目 再生速度で割る**

   `playbackRate` が 0・1 以外なら絶対値で割ります。DevTools の Animations パネルで再生速度を変えて確かめるときにも長さが合うようにする変更です（17d8a88ddcc、2026-03）。

## 4. getComputedStyle から求める

📄 `angular/packages/core/src/animation/longest_animation.ts` L90–110 （▶ の行: 91–93, 99, 101–102, 104–108）

```ts
 90 │ /**
 91 ▶  * Determines the longest animation, but with `getComputedStyles` instead of `getAnimations`. This
 92 ▶  * is ultimately safer than getAnimations because it can be used when recalculations are in
 93 ▶  * progress. `getAnimations()` will be empty in that case.
 94 │  */
 95 │ function determineLongestAnimationFromComputedStyles(
 96 │   el: HTMLElement,
 97 │   animationsMap: WeakMap<HTMLElement, LongestAnimation>,
 98 │ ): void {
 99 ▶   const computedStyle = getComputedStyle(el);
100 │ 
101 ▶   const longestAnimation = getLongestComputedAnimation(computedStyle);
102 ▶   const longestTransition = getLongestComputedTransition(computedStyle);
103 │ 
104 ▶   const longest =
105 ▶     longestAnimation.duration > longestTransition.duration ? longestAnimation : longestTransition;
106 ▶   if (isShorterThanExistingAnimation(animationsMap.get(el), longest)) return;
107 ▶   if (longestExists(longest)) {
108 ▶     animationsMap.set(el, longest);
109 │   }
110 │ }
```

91〜93 行目のコメントは、こちらの方が「再計算の最中でも使えるので安全」と書いています。99 行目で `getComputedStyle(el)` を取り、101〜102 行目で animation と transition の最長をそれぞれ求め、104〜105 行目で長い方を選びます（同じ長さなら transition）。106〜108 行目は 2 節の終わりと同じです。

📄 `angular/packages/core/src/animation/longest_animation.ts` L11–39 （▶ の行: 13, 15–16, 21–22, 27–30, 32–33）

```ts
11 │ /** Parses a CSS time value to milliseconds. */
12 │ function parseCssTimeUnitsToMs(value: string | undefined): number {
13 ▶   if (!value) return 0;
14 │   // Some browsers will return it in seconds, whereas others will return milliseconds.
15 ▶   const multiplier = value.toLowerCase().indexOf('ms') > -1 ? 1 : 1000;
16 ▶   return parseFloat(value) * multiplier;
17 │ }
18 │ 
19 │ /** Parses out multiple values from a computed style into an array. */
20 │ function parseCssPropertyValue(computedStyle: CSSStyleDeclaration, name: string): string[] {
21 ▶   const value = computedStyle.getPropertyValue(name);
22 ▶   return value.split(',').map((part) => part.trim());
23 │ }
24 │ 
25 │ /** Gets the transform transition duration, including the delay, of an element in milliseconds. */
26 │ function getLongestComputedTransition(computedStyle: CSSStyleDeclaration): LongestAnimation {
27 ▶   const transitionedProperties = parseCssPropertyValue(computedStyle, 'transition-property');
28 ▶   const rawDurations = parseCssPropertyValue(computedStyle, 'transition-duration');
29 ▶   const rawDelays = parseCssPropertyValue(computedStyle, 'transition-delay');
30 ▶   const longest = {propertyName: '', duration: 0, animationName: undefined};
31 │   for (let i = 0; i < transitionedProperties.length; i++) {
32 ▶     const duration = parseCssTimeUnitsToMs(rawDelays[i]) + parseCssTimeUnitsToMs(rawDurations[i]);
33 ▶     if (duration > longest.duration) {
34 │       longest.propertyName = transitionedProperties[i];
35 │       longest.duration = duration;
36 │     }
37 │   }
38 │   return longest;
39 │ }
```

1. **12〜17 行目 時間の文字列を ms に**

   空なら 0（13 行目）。`ms` を含めば 1 倍、含まなければ秒とみなして 1000 倍します（15 行目）。`parseFloat('0.5s')` は 0.5 なので 500 になります。
2. **20〜23 行目 カンマで区切る**

   `transition-duration: 0.3s, 1s` のような複数の値を配列にします。
3. **26〜39 行目 transition の最長**

   27〜29 行目で property・duration・delay の 3 つの配列を取り、32 行目で i 番目の delay + duration を足し、33 行目で `>`（厳密に長いとき）だけ入れ替えます。30 行目の初期値の `propertyName` は `''`（空文字）です。

📄 `angular/packages/core/src/animation/longest_animation.ts` L41–70 （▶ の行: 45, 48–50, 62, 67–68）

```ts
41 │ function getLongestComputedAnimation(computedStyle: CSSStyleDeclaration): LongestAnimation {
42 │   const rawNames = parseCssPropertyValue(computedStyle, 'animation-name');
43 │   const rawDelays = parseCssPropertyValue(computedStyle, 'animation-delay');
44 │   const rawDurations = parseCssPropertyValue(computedStyle, 'animation-duration');
45 ▶   const rawIterationCounts = parseCssPropertyValue(computedStyle, 'animation-iteration-count');
46 │   const longest: LongestAnimation = {animationName: '', propertyName: undefined, duration: 0};
47 │   for (let i = 0; i < rawNames.length; i++) {
48 ▶     const duration = parseCssTimeUnitsToMs(rawDelays[i]) + parseCssTimeUnitsToMs(rawDurations[i]);
49 ▶     const iterationCount = rawIterationCounts[i];
50 ▶     if (duration > longest.duration && iterationCount !== 'infinite') {
51 │       longest.animationName = rawNames[i];
52 │       longest.duration = duration;
53 │     }
54 │   }
55 │   return longest;
56 │ }
57 │ 
58 │ function isShorterThanExistingAnimation(
59 │   existing: LongestAnimation | undefined,
60 │   longest: LongestAnimation,
61 │ ): boolean {
62 ▶   return existing !== undefined && existing.duration > longest.duration;
63 │ }
64 │ 
65 │ function longestExists(longest: LongestAnimation): boolean {
66 │   return (
67 ▶     (longest.animationName != undefined || longest.propertyName != undefined) &&
68 ▶     longest.duration > 0
69 │   );
70 │ }
```

1. **41〜56 行目 animation の最長**

   transition と同じ形ですが、45 行目で `animation-iteration-count` も取り、50 行目で `'infinite'` のものを外します（2 節の 145 行目と同じ考え）。ここでも回数は掛けていません（48 行目は delay + duration だけ）。
2. **58〜63 行目 既存の記録より短いか**

   62 行目。既に記録があり、それが今回より長ければ true（＝上書きしない）。
3. **65〜70 行目 「ある」とみなす条件**

   67 行目で名前かプロパティ名が `undefined` でなく、68 行目で長さが 0 より大きいこと。初期値の `''` は `undefined` ではないので、実際には **68 行目の「長さ &gt; 0」**で決まります。アニメーションの無いクラスは長さ 0 になり、記録されません（[第 5 回](05-animations-enter-classes.md)の「次のフレームですぐ外す」）。

## 5. 無限に繰り返すアニメーションと #67350

145 行目と 50 行目の「infinite を飛ばす」は、2026-03-02 のコミット 9758ea9ee95（`refactor(core): ignore infinite animations in animate api`、本文に `fixes: #67350`）で入りました。#67350 は「21.2 の新しい animate.leave の振る舞いで、内側に無限のアニメーションがあるコンポーネントが消えない」という報告で、2026-02-27 に開かれ同じ日に閉じられています（scratchpad の issues JSON の createdAt / closedAt）。同じ変更は 21.2 系にも f5e9a862c20 として入り、v21.2.1 から含まれます（`git tag --contains` で確かめた）。

無限のアニメーションしか無い要素は、長さ 0 の扱いになり（2 節で飛ばされ、何も残らない）、enter ならクラスをすぐ外し、leave なら要素をすぐ消します。acceptance の `describe('infinite animations')`（animation\_spec.ts:2760）の 2 本がそれを確かめています。

📄 `angular/packages/core/test/acceptance/animation_spec.ts` L2806–2839 （▶ の行: 2812, 2820, 2831, 2834, 2838）

```ts
2806 │     it('should ignore infinite animations during animate.enter and remove classes immediately', fakeAsync(() => {
2807 │       @Component({
2808 │         changeDetection: ChangeDetectionStrategy.Eager,
2809 │         selector: 'test-cmp',
2810 │         styles: styles,
2811 │         template:
2812 ▶           '<div>@if (show()) {<p animate.enter="infinite-anim" #el>I should enter</p>}</div>',
2813 │         encapsulation: ViewEncapsulation.None,
2814 │       })
2815 │       class TestComponent {
2816 │         show = signal(false);
2817 │         @ViewChild('el', {read: ElementRef}) el!: ElementRef<HTMLParagraphElement>;
2818 │       }
2819 │ 
2820 ▶       TestBed.configureTestingModule({animationsEnabled: true});
2821 │ 
2822 │       const fixture = TestBed.createComponent(TestComponent);
2823 │       const cmp = fixture.componentInstance;
2824 │       fixture.detectChanges();
2825 │ 
2826 │       cmp.show.set(true);
2827 │       fixture.detectChanges();
2828 │ 
2829 │       // Check that class is added initially (maybe?)
2830 │       let paragraph = fixture.debugElement.query(By.css('p'));
2831 ▶       expect(paragraph.nativeElement.classList.contains('infinite-anim')).toBe(true);
2832 │ 
2833 │       // Simulate a frame. If ignored, class should be removed immediately.
2834 ▶       tickAnimationFrames(1);
2835 │       fixture.detectChanges();
2836 │ 
2837 │       paragraph = fixture.debugElement.query(By.css('p'));
2838 ▶       expect(paragraph.nativeElement.classList.contains('infinite-anim')).toBe(false);
2839 │     }));
```

2812 行目の `infinite-anim` は :2763 で `animation: infinite-anim 1s infinite` と定義されています。2831 行目で一度クラスが付いたことを確かめ、2834 行目で 1 フレーム進めると、2838 行目でクラスが外れています。[第 5 回](05-animations-enter-classes.md)の requestAnimationFrame の中で長さが見つからなかったからです。

## 6. 終わったイベントを照らし合わせる：isLongestAnimation

📄 `angular/packages/core/src/animation/utils.ts` L24–27 （▶ の行: 24, 27）

```ts
24 ▶ import {getAnimationDuration} from './longest_animation';
25 │ 
26 │ const DEFAULT_ANIMATIONS_DISABLED = false;
27 ▶ const ANIMATION_DURATION_TOLERANCE_MS = 1;
```

📄 `angular/packages/core/src/animation/utils.ts` L321–358 （▶ の行: 333, 336, 338, 342–344, 348–349, 353–354, 356）

```ts
321 │ /**
322 │  * Determines if the animation or transition event is currently the expected longest animation
323 │  * based on earlier determined data in `longestAnimations`
324 │  *
325 │  * @param event
326 │  * @param nativeElement
327 │  * @returns
328 │  */
329 │ export function isLongestAnimation(
330 │   event: AnimationEvent | TransitionEvent,
331 │   nativeElement: HTMLElement,
332 │ ): boolean {
333 ▶   const longestAnimation = longestAnimations.get(nativeElement);
334 │   // If we don't have any record of a longest animation, then we shouldn't
335 │   // block the animationend/transitionend event from doing its work.
336 ▶   if (longestAnimation === undefined) return true;
337 │ 
338 ▶   if (nativeElement !== getEventTarget(event)) return false;
339 │ 
340 │   // Distinct CSS animations can share a name. Chrome 151 stable exposes their instance:
341 │   // https://developer.chrome.com/release-notes/151#animation_accessor_on_animation_and_transition_events
342 ▶   const eventAnimation = (
343 ▶     event as (AnimationEvent | TransitionEvent) & {readonly animation?: Animation | null}
344 ▶   ).animation;
345 │ 
346 │   // Compare the event animation's duration instead of retaining the Animation object. This also
347 │   // disambiguates records obtained from computed styles when getAnimations() was empty.
348 ▶   if (eventAnimation) {
349 ▶     const eventAnimationDuration = getAnimationDuration(eventAnimation);
350 │     // CSSOM can round serialized times while Web Animations retains more precision. Only reject an
351 │     // event when it is shorter by more than the tolerance so the longest event is not ignored.
352 │     if (
353 ▶       eventAnimationDuration !== undefined &&
354 ▶       eventAnimationDuration + ANIMATION_DURATION_TOLERANCE_MS < longestAnimation.duration
355 │     ) {
356 ▶       return false;
357 │     }
358 │   }
```

1. **333〜336 行目 記録が無ければ true**

   335 行目のコメントのとおり、記録が無いのに end を止めてしまうと何も終わらなくなるので、通します。
2. **338 行目 発生元が違えば false**

   子の要素から泡立ってきた end はここで落ちます（`getEventTarget` は[第 5 回](05-animations-enter-classes.md)）。
3. **340〜344 行目 イベントが持つ Animation**

   同じ `@keyframes` の名前を持つ別々のアニメーションは、名前だけでは区別できません。340〜341 行目のコメントにあるとおり、Chrome 151 から `AnimationEvent` / `TransitionEvent` に `animation`（その Animation オブジェクト）が付くので、それを読みます。
4. **348〜357 行目 長さで比べる（1 ms の誤差つき）**

   349 行目でイベントの Animation の長さを 3 節の関数で測り、353〜354 行目で「それに 1 ms（27 行目の `ANIMATION_DURATION_TOLERANCE_MS`）を足しても記録より短い」ときだけ false にします。350〜351 行目のコメントのとおり、`getComputedStyle` が返す文字列（CSSOM）は時間を丸めることがあり、Web Animations API の値はもっと細かいので、ちょうど同じ長さなのに「短い」と判定して最長の end を捨てないための余裕です。この比べ方は a26fbfa641b（2026-08、`refactor(core): distinguish animations that share a name`）で入りました。

📄 `angular/packages/core/src/animation/utils.ts` L360–373 （▶ の行: 361–362, 365, 367–368, 372）

```ts
360 │   // Fall back to strings for older browsers.
361 ▶   if (longestAnimation.animationName !== undefined) {
362 ▶     return (event as AnimationEvent).animationName === longestAnimation.animationName;
363 │   }
364 │ 
365 ▶   if (longestAnimation.propertyName !== undefined) {
366 │     return (
367 ▶       longestAnimation.propertyName === 'all' ||
368 ▶       (event as TransitionEvent).propertyName === longestAnimation.propertyName
369 │     );
370 │   }
371 │ 
372 ▶   return false;
373 │ }
```

360 行目のコメントのとおり、ここからは `event.animation` の無い古いブラウザ向けの、文字列での照らし合わせです。記録が animation なら 362 行目で `animationName` の一致、transition なら 367〜368 行目で `propertyName` の一致を見ます。記録の `propertyName` が `'all'`（`transition: all 1s` を `getComputedStyle` から読んだとき）なら、どの transitionend でも true です。

## 7. デモ：本物の getAnimations() と、判定の再現を並べる

> **🧪 DEMO — animation 2 つ + transition 1 つ。どれが「いちばん長い」か**
>
> 要素は本物の `animate.enter="alg-in"` です。`.alg-in` には `alg-fade`（長さと回数を選べる）、`alg-slide`（500ms、delay を選べる）、`outline-color` の transition（`@starting-style` で始まる。長さを選べる）が付いています。クラスが付いたのを MutationObserver で見つけた時刻を 0ms とし、次のフレームで本物の `el.getAnimations()` と `getComputedStyle(el)` を読みます。「判定」の 2 行は、このコンポーネントの中に書いた **longest\_animation.ts の再現**（L133-168 と L11-56・L95-110 を写した関数）に、読んだ本物の値を入れた結果です。OS の設定で動きを減らしていても、このデモは動きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-longest)

試すと分かること（2026-11-01 にヘッドレスの Chrome でこのページを開き、下の 5 通りを選んで記録したログで確かめました。時刻は環境で数 ms〜十数 ms ずれます）：

- **既定（800ms・1 回・delay 0・transition 無し）**：判定は `alg-fade` の 800ms。`alg-slide` の animationend（約 500ms）ではクラスは外れず、`alg-fade` の animationend（約 800ms）で外れます。transition が 0ms のときは getAnimations() に CSSTransition が出ません。
- **delay 700ms**：`alg-slide` は 700 + 500 = 1200ms になり、`alg-fade`（800ms）より長くなります。2 節の 148 行目が delay を足しているからです。
- **transition 1500ms**：判定が `propertyName=outline-color` に変わり、transitionend で外れます。
- **回数 infinite**：表の `alg-fade` の行が「飛ばす（L145）」になり、判定は残りの中の最長です。クラスが外れると `alg-fade` の繰り返しも止まり、`animationcancel` が記録されます。
- **回数 2 ＋ transition 900ms**：`alg-fade` は実際には 1600ms 動きますが、数える長さは 800ms（3 節の 79 行目）です。判定は transition の 900ms になり、約 900ms でクラスが外れて `alg-fade` の 2 回目が途中で止まります（手元では 889ms に `alg-in が外れた` と `animationcancel` が並んだ）。

`getComputedStyle` 由来の判定は、ふつうは getAnimations 由来と同じ答えになります。違いが出るのは、CSSOM の文字列が丸められたときや、`transition-property: all` のときです。`animationName` に出る名前は、コンポーネントのスタイルのカプセル化で付け替えられた名前です（[compiler-shadow-css](../compiler/18-compiler-shadow-css.md)）。

## 8. 呼び出しの連なり

- `runEnterAnimation / animateLeaveClassRunner の requestAnimationFrame` — animation.ts — *第 5 回・第 10 回*
  - `determineLongestAnimation(el, longestAnimations, areAnimationSupported)` — longest\_animation.ts L119
    - `el.getAnimations()` — L125
    - `determineLongestAnimationFromElementAnimations` — L133 — *infinite を飛ばし、getAnimationDuration（L73）で最長*
    - `determineLongestAnimationFromComputedStyles` — L95 — *getAnimations() が空のとき*
      - `getLongestComputedAnimation / getLongestComputedTransition` — L41 / L26
    - `longestAnimations.set(el, longest)` — L166 / L108
- `（animationend / transitionend）` — ブラウザ
  - `isLongestAnimation(event, el)` — utils.ts L329 — *event.animation の長さ ± 1ms → 名前 / プロパティ名*

## テストと直し方

📄 `angular/packages/core/test/animation/longest_animation_spec.ts` L12–30 （▶ の行: 12, 15–17, 23, 25, 28）

```ts
12 ▶ import {isNode} from '@angular/private/testing';
13 │ 
14 │ describe('determineLongestAnimation', () => {
15 ▶   if (isNode) {
16 ▶     it('should pass', () => expect(true).toBe(true));
17 ▶     return;
18 │   }
19 │ 
20 │   it('should immediately return if animations are not supported', () => {
21 │     const el = document.createElement('div');
22 │     const animationsMap = new WeakMap<HTMLElement, LongestAnimation>();
23 ▶     spyOn(el, 'getAnimations').and.returnValue([{}] as unknown as Animation[]);
24 │ 
25 ▶     determineLongestAnimation(el, animationsMap, false);
26 │ 
27 │     expect(animationsMap.has(el)).toBeFalse();
28 ▶     expect(el.getAnimations).not.toHaveBeenCalled();
29 │   });
30 │ 
```

`describe('determineLongestAnimation')` は 15〜17 行目で、Node なら `it('should pass')` を 1 本置いて戻ります。`getAnimations` も `AnimationEvent` も Node には無いからです。20〜29 行目の最初の it は、23 行目で `getAnimations` を偽物にし、25 行目で 3 つ目の引数を `false` にして、28 行目で `getAnimations` が呼ばれないこと（1 節の 124 行目）を見ています。

📄 `angular/packages/core/test/animation/longest_animation_spec.ts` L31–56 （▶ の行: 37, 45, 48, 53–54）

```ts
31 │   it('should tolerate duration rounding when checking the longest animation event', () => {
32 │     const el = document.createElement('div');
33 │     longestAnimations.set(el, {
34 │       animationName: 'duplicate-name',
35 │       propertyName: undefined,
36 │       // Equivalent to calc(20s / 3) + calc(1s / 7) after CSSOM serialization.
37 ▶       duration: 6809.527,
38 │     });
39 │ 
40 │     const createAnimationEndEvent = (duration: number) => {
41 │       const event = new AnimationEvent('animationend', {animationName: 'duplicate-name'});
42 │       const animation = {
43 │         playbackRate: 1,
44 │         effect: {
45 ▶           getTiming: () => ({duration, delay: 1000 / 7}),
46 │         },
47 │       } as unknown as Animation;
48 ▶       Object.defineProperty(event, 'animation', {value: animation});
49 │       spyOn(event, 'composedPath').and.returnValue([el]);
50 │       return event;
51 │     };
52 │ 
53 ▶     expect(isLongestAnimation(createAnimationEndEvent(20_000 / 3), el)).toBeTrue();
54 ▶     expect(isLongestAnimation(createAnimationEndEvent(10_000 / 3), el)).toBeFalse();
55 │     longestAnimations.delete(el);
56 │   });
```

6 節の 1 ms の誤差の spec です。37 行目の記録 6809.527ms は「`calc(20s / 3) + calc(1s / 7)` を CSSOM が丸めた値」（36 行目のコメント）。48 行目でイベントに `animation` を生やし、53 行目の `20_000 / 3` + `1000 / 7`（45 行目の delay）＝ 6809.5238…ms は記録より 0.003ms 短いが誤差の内なので true、54 行目の半分の長さは false です。

📄 `angular/packages/core/test/animation/longest_animation_spec.ts` L134–162 （▶ の行: 143, 150, 155, 157–158, 160）

```ts
134 │     it('should skip animations with infinite iterations', () => {
135 │       const el = document.createElement('div');
136 │       const animationsMap = new WeakMap<HTMLElement, LongestAnimation>();
137 │ 
138 │       spyOn(el, 'getAnimations').and.returnValue([
139 │         {
140 │           animationName: 'infinite-anim',
141 │           playbackRate: 1,
142 │           effect: {
143 ▶             getTiming: () => ({duration: 1000, delay: 0, iterations: Infinity}),
144 │           },
145 │         } as unknown as Animation,
146 │         {
147 │           animationName: 'finite-anim',
148 │           playbackRate: 1,
149 │           effect: {
150 ▶             getTiming: () => ({duration: 500, delay: 0, iterations: 1}),
151 │           },
152 │         } as unknown as Animation,
153 │       ]);
154 │ 
155 ▶       determineLongestAnimation(el, animationsMap, true);
156 │       const longest = animationsMap.get(el);
157 ▶       expect(longest).toEqual({
158 ▶         animationName: 'finite-anim',
159 │         propertyName: undefined,
160 ▶         duration: 500,
161 │       });
162 │     });
```

143 行目の `iterations: Infinity` の 1000ms を飛ばして、150 行目の 500ms の `finite-anim` が選ばれる（157〜161 行目）ことを見ています。2 節の 145 行目です。

📄 `ターミナル`

```
cd ~/angular-research/angular
# Node 版（isNode なので 'should pass' の 1 本だけ）
pnpm bazel test //packages/core/test:test --test_arg=--filter="determineLongestAnimation" --test_output=all
# ブラウザ版（longest_animation_spec.ts を含む core/test の全 spec）
pnpm bazel test //packages/core/test:test_web_chromium --nocache_test_results --test_output=all

# it の数を数える
grep -c "^\s*it(" packages/core/test/animation/longest_animation_spec.ts
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
# Node 版
Ran 0 of 1400 specs
Ran 0 of 1400 specs
Ran 0 of 1400 specs
Ran 1 of 1401 specs
1 spec, 0 failures
//packages/core/test:test                                                PASSED in 1.4s

# ブラウザ版
Chromium: |██████████████████████████████| 1/1 test files | 1591 passed, 0 failed, 4 skipped
Finished running tests in 3.3s, all tests passed!
INFO: Elapsed time: 4.741s, Critical Path: 3.92s
//packages/core/test:test_web_chromium                                   PASSED in 3.8s

# grep -c
18
```

1. **Node 版は「1 本 PASSED」で中身は 0 本**

   `--filter="determineLongestAnimation"` で 4 つの shard のうち 1 つが `Ran 1 of 1401 specs` になりました。その 1 本は 16 行目の `should pass` です。PASSED と出ても 18 本の本物の it は 1 本も走っていません（[testing-overview](../testing/01-testing-overview.md) の「0 本でも PASSED」と同じ落とし穴）。
2. **本物はブラウザ版**

   `//packages/core/test:test_web_chromium` が longest\_animation\_spec.ts を含む core/test の spec をまとめて Chromium で走らせます。1591 passed, 0 failed, 4 skipped、PASSED in 3.8s でした。web-test-runner に spec を絞る指定は無いので、longest\_animation\_spec.ts の it が何本かは grep で数えます（18 本）。1 本だけ見たいときは自分の作業コピーで `it` → `fit` にすれば jasmine がそれだけ走らせますが、私たちは ../angular を変えないので**試していません**。
3. **acceptance の側**

   要素を実際に作って確かめる it は animation\_spec.ts の `it('should await the longest animation when multiple transitions are present')`（:809）、`it('should wait for the longest duplicate-named animation when getAnimations is empty')`（:867）と、5 節の `describe('infinite animations')`（:2760）です。`//packages/core/test/acceptance:acceptance_web_chromium` で 2743 passed, 0 failed, 3 skipped（PASSED in 6.8s）でした。
4. **直すとしたら**

   長さの計算は longest\_animation.ts（`getAnimationDuration` L73、`determineLongestAnimationFromElementAnimations` L133、computed 側 L26・L41）、照らし合わせは utils.ts の `isLongestAnimation`（L329）です。長さの計算の振る舞いは、偽の `getAnimations` / `getComputedStyle` を spyOn で返す longest\_animation\_spec.ts の形で足すのが入口です。
5. **issue を読むときの手がかり**

   「早く消える／クラスが早く外れる」なら、数えた長さが本物より短い（3 節の回数、4 節の丸め）か、別のアニメーションの end を最長と取り違えた（6 節）かを疑います。「消えない／外れない」なら、最長の end が来ない（無限、取り消し）かを疑います。なお 3 節の「回数を掛けない」は ../angular（8576f161ae4）でも最新の main（74961c66242）でも同じでした。手元の issue 一覧（タイトルのみ）では、これに当たる報告は見つけていません。issue を探すときは [第 20 回](20-animations-issues.md)の方法で探してから判断してください。

## 聞かれそうな質問

**Q. getAnimations が無いブラウザではどうなりますか？**

animate.enter / animate.leave の仕組みそのものが動きません。`areAnimationSupported` は `document.documentElement.getAnimations` が関数であることを条件にしていて（[第 8 回](08-animations-disabled.md)）、false なら 124 行目でここも何もしません。4 節の `getComputedStyle` は「getAnimations はあるが、いま空」のときの落ち先で、getAnimations の無いブラウザの代わりではありません。

**Q. delay は数えますか？**

数えます。getAnimations 由来なら 79 行目の `(timing.delay ?? 0) + animationDuration`、computed 由来なら 32 行目と 48 行目の delay + duration です。デモで `alg-slide` の delay を 700ms にすると、500ms のアニメーションが 1200ms として最長になります。

**Q. 誤差 1 ms は何のためですか？**

記録した長さとイベントの Animation の長さを比べるとき（353〜354 行目）、`getComputedStyle`（CSSOM）の文字列は時間を丸め、Web Animations API の値は丸めないので、同じアニメーションでも小数点以下がずれます（350〜351 行目のコメント）。ずれだけで最長の end を「短い」と捨てないよう、1 ms までは同じとみなします（27 行目）。spec は longest\_animation\_spec.ts の 31〜56 行目です。

**Q. 無限に繰り返すアニメーションがあると、要素は消えませんか？**

消えます。145 行目（getAnimations 由来）と 50 行目（computed 由来）で数えないので、無限のものしか無ければ「長さ 0」で、leave ならすぐ消え、enter ならクラスをすぐ外します。有限のものが一緒にあれば、その中の最長を待ちます。これは #67350 を受けた 9758ea9ee95（v22.0.0、21.2 系は v21.2.1）からの振る舞いです。

**Q. 子の要素のアニメーションも待ちますか？**

待ちません。125 行目の `el.getAnimations()` は引数なしなので、その要素自身のアニメーションだけです。子の end は 338 行目で発生元が違うので false です。入れ子の要素の leave を待つ仕組みは別にあります（[第 11 回](11-animations-leave-nested.md)）。

## 読み終えて

- `determineLongestAnimation` は `el.getAnimations()` から、空なら `getComputedStyle` から最長を求め、`longestAnimations` に入れる（L119-131）。
- 長さは delay + duration を playbackRate で割ったもの。繰り返しの回数は掛けない（L73-88、L32、L48）。
- 無限に繰り返すものは数えない（L145、L50）。#67350 を受けた変更。
- 長さ 0 は「無い」扱い（L65-70）。だからアニメーションの無いクラスはすぐ外れ、すぐ消える。
- `isLongestAnimation` は、`event.animation` があれば長さを 1 ms の誤差で比べ、無ければ名前 / プロパティ名で照らし合わせる（utils.ts L329-373）。

---

← 前: [animate.enter のクラス：付けて、終わったら外す](05-animations-enter-classes.md)  
次: [関数で動かす：(animate.enter) と (animate.leave) と animationComplete](07-animations-functions.md) →
