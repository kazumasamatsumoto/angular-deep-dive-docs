[目次](../README.md) › [animations の説明文の読み残し](README.md) › 第 2 回 / 全 9 回

# transition・group・sequence・keyframes・query・stagger の説明文

> animation\_metadata.ts の後半の未読の行：transition の式（:enter・:leave・:increment・関数）、group と sequence、keyframes の offset、query の limit と optional、stagger、animateChild と useAnimation と animation の params。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/anm-transition-query)

---

この章で分かること：`animation_metadata.ts` の後半にある `transition`・`group`・`sequence`・`keyframes`・`animation`・`useAnimation`・`animateChild`・`query`・`stagger` の説明文と例が、何を約束しているか。それを本物の 22.2.6 の記録（headless Chrome）と、例を strict の ngc に通した結果で確かめます。食い違いは 5 つありました。「`true`・`false` は式の値 1・0 にも当たる」は逆向きで、数の 1 → 0 には当たりません。stagger の例は、そのまま書くと最初の表示で NG03014 になります。`:self` を先頭以外に書くと、querySelectorAll の SyntaxError で止まります。stagger の 1 文目の「動いたあとに間をあける」は、実際は「開始をずらす」です。keyframes の例はカンマが抜けていて構文エラーです。

読む対象は `packages/animations/src/animation_metadata.ts` の L723〜805 と L893〜1425、それと前半の型のうち `AnimationTransitionMetadata`・`AnimationQueryMetadata`・`AnimationQueryOptions`・`AnimationStaggerMetadata`・`AnimateChildOptions` です（../angular、8576f161ae4）。`transition()` の本体（L1092〜1105）と、式を関数にする `parseTransitionExpr` は[旧 DSL とキーフレームの章](../animations/15-animations-legacy-dsl.md)の 1・3 節、query の要素を探す `invokeQuery` も同じ章の 6 節、時間の積み方（group・stagger の遅れ）は[第 5 回](05-anm-timeline.md)が読みます。DEMO の作り方は[第 1 回](01-anm-trigger-state.md)の冒頭の囲みと同じです。

1. [1. trigger・state・style・animate](01-anm-trigger-state.md)
2. **2. transition・query・stagger**（この章）
3. [3. AnimationBuilder とプレイヤー](03-anm-builder-players.md)
4. [4. DSL を AST に](04-anm-ast.md)
5. [5. タイムライン](05-anm-timeline.md)
6. [6. 遷移のエンジン](06-anm-engine.md)
7. [7. Web Animations のドライバー](07-anm-driver.md)
8. [8. provideAnimations](08-anm-module.md)
9. [9. spec と issue](09-anm-tests-issues.md)

## 1. transition の式：どの値の変化に当たるか

📄 `angular/packages/animations/src/animation_metadata.ts` L249–279 （▶ の行: 261–268, 272, 278）

```ts
249 │ /**
250 │  * Encapsulates an animation transition. Instantiated and returned by the
251 │  * `transition()` function.
252 │  *
253 │  * @publicApi
254 │  *
255 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
256 │  */
257 │ export interface AnimationTransitionMetadata extends AnimationMetadata {
258 │   /**
259 │    * An expression that describes a state change.
260 │    */
261 ▶   expr:
262 ▶     | string
263 ▶     | ((
264 ▶         fromState: string,
265 ▶         toState: string,
266 ▶         element?: any,
267 ▶         params?: {[key: string]: any},
268 ▶       ) => boolean);
269 │   /**
270 │    * One or more animation objects to which this transition applies.
271 │    */
272 ▶   animation: AnimationMetadata | AnimationMetadata[];
273 │   /**
274 │    * An options object containing a delay and
275 │    * developer-defined parameters that provide styling defaults and
276 │    * can be overridden on invocation. Default delay is 0.
277 │    */
278 ▶   options: AnimationOptions | null;
279 │ }
```

📄 `angular/packages/animations/src/animation_metadata.ts` L944–975 （▶ の行: 947–948, 950, 952, 961, 963–965, 968–969, 973）

````ts
944 │ /**
945 │  * Declares an animation transition which is played when a certain specified condition is met.
946 │  *
947 ▶  * @param stateChangeExpr A string with a specific format or a function that specifies when the
948 ▶  * animation transition should occur (see [State Change Expression](#state-change-expression)).
949 │  *
950 ▶  * @param steps One or more animation objects that represent the animation's instructions.
951 │  *
952 ▶  * @param options An options object that can be used to specify a delay for the animation or provide
953 │  * custom parameters for it.
954 │  *
955 │  * @returns An object that encapsulates the transition data.
956 │  *
957 │  * @usageNotes
958 │  *
959 │  * ### State Change Expression
960 │  *
961 ▶  * The State Change Expression instructs Angular when to run the transition's animations, it can
962 │  *either be
963 ▶  *  - a string with a specific syntax
964 ▶  *  - or a function that compares the previous and current state (value of the expression bound to
965 ▶  *    the element's trigger) and returns `true` if the transition should occur or `false` otherwise
966 │  *
967 │  * The string format can be:
968 ▶  *  - `fromState => toState`, which indicates that the transition's animations should occur then the
969 ▶  *    expression bound to the trigger's element goes from `fromState` to `toState`
970 │  *
971 │  *    _Example:_
972 │  *      ```ts
973 ▶  *        transition('open => closed', animate('.5s ease-out', style({ height: 0 }) ))
974 │  *      ```
975 │  *
````

📄 `angular/packages/animations/src/animation_metadata.ts` L976–1013 （▶ の行: 976–977, 984–985, 995–997, 1003–1004, 1008）

````ts
 976 ▶  *  - `fromState <=> toState`, which indicates that the transition's animations should occur then
 977 ▶  *    the expression bound to the trigger's element goes from `fromState` to `toState` or vice versa
 978 │  *
 979 │  *    _Example:_
 980 │  *      ```ts
 981 │  *        transition('enabled <=> disabled', animate('1s cubic-bezier(0.8,0.3,0,1)'))
 982 │  *      ```
 983 │  *
 984 ▶  *  - `:enter`/`:leave`, which indicates that the transition's animations should occur when the
 985 ▶  *    element enters or exists the DOM
 986 │  *
 987 │  *    _Example:_
 988 │  *      ```ts
 989 │  *        transition(':enter', [
 990 │  *          style({ opacity: 0 }),
 991 │  *          animate('500ms', style({ opacity: 1 }))
 992 │  *        ])
 993 │  *      ```
 994 │  *
 995 ▶  *  - `:increment`/`:decrement`, which indicates that the transition's animations should occur when
 996 ▶  *    the numerical expression bound to the trigger's element has increased in value or decreased
 997 ▶  *
 998 │  *    _Example:_
 999 │  *      ```ts
1000 │  *        transition(':increment', query('@counter', animateChild()))
1001 │  *      ```
1002 │  *
1003 ▶  *  - a sequence of any of the above divided by commas, which indicates that transition's animations
1004 ▶  *    should occur whenever one of the state change expressions matches
1005 │  *
1006 │  *    _Example:_
1007 │  *      ```ts
1008 ▶  *        transition(':increment, * => enabled, :enter', animate('1s ease', keyframes([
1009 │  *          style({ transform: 'scale(1)', offset: 0}),
1010 │  *          style({ transform: 'scale(1.1)', offset: 0.7}),
1011 │  *          style({ transform: 'scale(1)', offset: 1})
1012 │  *        ]))),
1013 │  *      ```
````

📄 `angular/packages/animations/src/animation_metadata.ts` L1014–1044 （▶ の行: 1016–1021）

```ts
1014 │  *
1015 │  * Also note that in such context:
1016 ▶  *  - `void` can be used to indicate the absence of the element
1017 ▶  *  - asterisks can be used as wildcards that match any state
1018 ▶  *  - (as a consequence of the above, `void => *` is equivalent to `:enter` and `* => void` is
1019 ▶  *    equivalent to `:leave`)
1020 ▶  *  - `true` and `false` also match expression values of `1` and `0` respectively (but do not match
1021 ▶  *    _truthy_ and _falsy_ values)
1022 │  *
1023 │  * <div class="docs-alert docs-alert-helpful">
1024 │  *
1025 │  *  Be careful about entering end leaving elements as their transitions present a common
1026 │  *  pitfall for developers.
1027 │  *
1028 │  *  Note that when an element with a trigger enters the DOM its `:enter` transition always
1029 │  *  gets executed, but its `:leave` transition will not be executed if the element is removed
1030 │  *  alongside its parent (as it will be removed "without warning" before its transition has
1031 │  *  a chance to be executed, the only way that such transition can occur is if the element
1032 │  *  is exiting the DOM on its own).
1033 │  *
1034 │  *
1035 │  * </div>
1036 │  *
1037 │  * ### Animating to a Final State
1038 │  *
1039 │  * If the final step in a transition is a call to `animate()` that uses a timing value
1040 │  * with no `style` data, that step is automatically considered the final animation arc,
1041 │  * for the element to reach the final state, in such case Angular automatically adds or removes
1042 │  * CSS styles to ensure that the element is in the correct final state.
1043 │  *
1044 │  *
```

式は文字列か関数です（261〜268 行目）。文字列は 968〜969 行目の `from => to`、976〜977 行目の `<=>`（両向き）、984〜985 行目の `:enter`・`:leave`、995〜997 行目の `:increment`・`:decrement`、1003〜1004 行目のカンマ区切りです。985 行目の「enters or exists the DOM」は exits の書き間違いです。DEMO の「式」は、式を 1 つだけ持つ trigger（`transition(式, animate(777, …))`）を `@if` の中の要素に付け、値を 17 回変えて、duration 777ms の Web Animation が動き出した変化だけを並べた記録です。値は `[@t]="{value: v, params: {target: 'b'}}"` で渡しました。

| 式 | 当たった変化（記録、開発モードも本番も同じ） |
| --- | --- |
| `'* => *'` | 17 回すべて（void → a、a → void も） |
| `':enter'` / `':leave'` | void → a・void → 1 ／ c → void |
| `':increment'` | 1 → 2、1 → '3'、'3' → '10'、0 → 1（parseFloat で比べる） |
| `':decrement'` | 2 → 1、1 → 0 |
| `'a <=> b'` | a → b、b → a |
| `'a => b, b => c, :leave'` | a → b、c → void（b → c は値の並びに無い） |
| `'true => false'` | true → false（boolean）だけ。数の 1 → 0 には当たらない |
| `'false => true'` | false → true（boolean）だけ。数の 0 → 1 には当たらない |
| `'1 => 0'` | true → false、true → 0、1 → 0（boolean にも当たる） |
| 関数 `(from, to, el, params) => to === params?.['target']` | a → b、0 → b |

1020〜1021 行目は「`true` と `false` は式の値の `1` と `0` にも当たる（truthy・falsy には当たらない）」ですが、記録は逆でした。[旧 DSL の章](../animations/15-animations-legacy-dsl.md)の 3 節で引いた animation\_transition\_expr.ts の L90〜101 のとおり、比べ方は「`lhs == fromState`、だめで値が boolean のときだけ `'true'`/`'1'` か `'false'`/`'0'` の組で比べる」です。式の側の `'1'` は `'1' == 1` で数の 1 にも、boolean の特別扱いで `true` にも当たります。式の側の `'true'` は `'true' == 1` が偽なので、数の 1 には当たりません。正しく書くなら「`1`・`0`（と `true`・`false`）は boolean の値に当たる。`true`・`false` は数の 1・0 には当たらない」です。1020〜1021 行目は 92495060d2b（2021-12-07、`docs(animations): improve animation transition api docs (#44396)`）で入りました。spec の it の名前は「`` `1` and `0` given boolean values ``」（animation\_trigger\_spec.ts L211）で、実装の側の向きです。

## 2. :leave が走らないときと、最後の状態へ

📄 `angular/packages/animations/src/animation_metadata.ts` L1014–1044 （▶ の行: 1025, 1028–1032, 1039–1042）

```ts
1014 │  *
1015 │  * Also note that in such context:
1016 │  *  - `void` can be used to indicate the absence of the element
1017 │  *  - asterisks can be used as wildcards that match any state
1018 │  *  - (as a consequence of the above, `void => *` is equivalent to `:enter` and `* => void` is
1019 │  *    equivalent to `:leave`)
1020 │  *  - `true` and `false` also match expression values of `1` and `0` respectively (but do not match
1021 │  *    _truthy_ and _falsy_ values)
1022 │  *
1023 │  * <div class="docs-alert docs-alert-helpful">
1024 │  *
1025 ▶  *  Be careful about entering end leaving elements as their transitions present a common
1026 │  *  pitfall for developers.
1027 │  *
1028 ▶  *  Note that when an element with a trigger enters the DOM its `:enter` transition always
1029 ▶  *  gets executed, but its `:leave` transition will not be executed if the element is removed
1030 ▶  *  alongside its parent (as it will be removed "without warning" before its transition has
1031 ▶  *  a chance to be executed, the only way that such transition can occur is if the element
1032 ▶  *  is exiting the DOM on its own).
1033 │  *
1034 │  *
1035 │  * </div>
1036 │  *
1037 │  * ### Animating to a Final State
1038 │  *
1039 ▶  * If the final step in a transition is a call to `animate()` that uses a timing value
1040 ▶  * with no `style` data, that step is automatically considered the final animation arc,
1041 ▶  * for the element to reach the final state, in such case Angular automatically adds or removes
1042 ▶  * CSS styles to ensure that the element is in the correct final state.
1043 │  *
1044 │  *
```

1028〜1032 行目は「trigger を持つ要素が入るときは `:enter` が必ず走るが、親と一緒に消えるときは `:leave` が走らない」です。1025 行目の「entering end leaving」は and の書き間違いです。DEMO の「:enter・:leave」で、`@if` の中の `p` に `[@leaf]` の付いた子 `b` を置いて確かめました。`@if` で p を入れると b の `:enter`（800ms）が走り、p ごと外すと b の `:leave`（900ms）は走らず、p はその場で DOM から消えました。説明文のとおりです（消す判断は[TransitionAnimationEngine の章](../animations/16-animations-legacy-engine.md)の 3 節）。

1039〜1042 行目の「最後の animate に style が無ければ、最後の状態に着くようにスタイルを足し引きする」は、[第 1 回](01-anm-trigger-state.md)の 8 節の時刻表（`animate('1s')` で height・opacity・背景が state の値へ動いた）が実物です。

## 3. 例と関数の式

📄 `angular/packages/animations/src/animation_metadata.ts` L1047–1086 （▶ の行: 1059–1060, 1064–1065, 1068–1070, 1079–1082）

````ts
1047 │  *  - Transition animations applied based on
1048 │  *    the trigger's expression value
1049 │  *
1050 │  *   ```html
1051 │  *   <div [@myAnimationTrigger]="myStatusExp">
1052 │  *    ...
1053 │  *   </div>
1054 │  *   ```
1055 │  *
1056 │  *   ```ts
1057 │  *   trigger("myAnimationTrigger", [
1058 │  *     ..., // states
1059 ▶  *     transition("on => off, open => closed", animate(500)),
1060 ▶  *     transition("* <=> error", query('.indicator', animateChild()))
1061 │  *   ])
1062 │  *   ```
1063 │  *
1064 ▶  *  - Transition animations applied based on custom logic dependent
1065 ▶  *    on the trigger's expression value and provided parameters
1066 │  *
1067 │  *    ```html
1068 ▶  *    <div [@myAnimationTrigger]="{
1069 ▶  *     value: stepName,
1070 ▶  *     params: { target: currentTarget }
1071 │  *    }">
1072 │  *     ...
1073 │  *    </div>
1074 │  *    ```
1075 │  *
1076 │  *    ```ts
1077 │  *    trigger("myAnimationTrigger", [
1078 │  *      ..., // states
1079 ▶  *      transition(
1080 ▶  *        (fromState, toState, _element, params) =>
1081 ▶  *          ['firststep', 'laststep'].includes(fromState.toLowerCase())
1082 ▶  *          && toState === params?.['target'],
1083 │  *        animate('1s')
1084 │  *      )
1085 │  *    ])
1086 │  *    ```
````

1068〜1071 行目のように値を `{value, params}` で渡すと、関数の 4 つ目の引数に `params` が来ます（1 節の表の最後の行）。1077〜1085 行目の例は、strict の ngc に 0 件で通りました（引数の型を書かない形なので、[第 1 回](01-anm-trigger-state.md)の 4 節の inline の関数の例とは違って型が合う）。1082 行目の `params?.['target']` の `?.` は、型の上で `params` が省略できる引数だからで、実行のときは `{}` か渡した params が必ず来ます（[第 4 回](04-anm-ast.md)）。

## 4. group と sequence：同時に始めるか、順に続けるか

📄 `angular/packages/animations/src/animation_metadata.ts` L724–763 （▶ の行: 724, 727–730, 734–736, 747–748, 750–752, 762）

````ts
724 ▶  * @description Defines a list of animation steps to be run in parallel.
725 │  *
726 │  * @param steps An array of animation step objects.
727 ▶  * - When steps are defined by `style()` or `animate()`
728 ▶  * function calls, each call within the group is executed instantly.
729 ▶  * - To specify offset styles to be applied at a later time, define steps with
730 ▶  * `keyframes()`, or use `animate()` calls with a delay value.
731 │  * For example:
732 │  *
733 │  * ```ts
734 ▶  * group([
735 ▶  *   animate("1s", style({ background: "black" })),
736 ▶  *   animate("2s", style({ color: "white" }))
737 │  * ])
738 │  * ```
739 │  *
740 │  * @param options An options object containing a delay and
741 │  * developer-defined parameters that provide styling defaults and
742 │  * can be overridden on invocation.
743 │  *
744 │  * @return An object that encapsulates the group data.
745 │  *
746 │  * @usageNotes
747 ▶  * Grouped animations are useful when a series of styles must be
748 ▶  * animated at different starting times and closed off at different ending times.
749 │  *
750 ▶  * When called within a `sequence()` or a
751 ▶  * `transition()` call, does not continue to the next
752 ▶  * instruction until all of the inner animation steps have completed.
753 │  *
754 │  * @publicApi
755 │  *
756 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
757 │  */
758 │ export function group(
759 │   steps: AnimationMetadata[],
760 │   options: AnimationOptions | null = null,
761 │ ): AnimationGroupMetadata {
762 ▶   return {type: AnimationMetadataType.Group, steps, options};
763 │ }
````

📄 `angular/packages/animations/src/animation_metadata.ts` L766–805 （▶ の行: 766, 769–771, 787–788, 792–794, 804）

````ts
766 ▶  * Defines a list of animation steps to be run sequentially, one by one.
767 │  *
768 │  * @param steps An array of animation step objects.
769 ▶  * - Steps defined by `style()` calls apply the styling data immediately.
770 ▶  * - Steps defined by `animate()` calls apply the styling data over time
771 ▶  *   as specified by the timing data.
772 │  *
773 │  * ```ts
774 │  * sequence([
775 │  *   style({ opacity: 0 }),
776 │  *   animate("1s", style({ opacity: 1 }))
777 │  * ])
778 │  * ```
779 │  *
780 │  * @param options An options object containing a delay and
781 │  * developer-defined parameters that provide styling defaults and
782 │  * can be overridden on invocation.
783 │  *
784 │  * @return An object that encapsulates the sequence data.
785 │  *
786 │  * @usageNotes
787 ▶  * When you pass an array of steps to a
788 ▶  * `transition()` call, the steps run sequentially by default.
789 │  * Compare this to the  {@link /api/animations/group group()} call, which runs animation steps in
790 │  *parallel.
791 │  *
792 ▶  * When a sequence is used within a  {@link /api/animations/group group()} or a `transition()` call,
793 ▶  * execution continues to the next instruction only after each of the inner animation
794 ▶  * steps have completed.
795 │  *
796 │  * @publicApi
797 │  *
798 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
799 │  **/
800 │ export function sequence(
801 │   steps: AnimationMetadata[],
802 │   options: AnimationOptions | null = null,
803 │ ): AnimationSequenceMetadata {
804 ▶   return {type: AnimationMetadataType.Sequence, steps, options};
805 │ }
````

727〜728 行目の「group の中の各呼び出しはすぐに実行される」は「同時に始まる」の意味です。DEMO の「group と sequence」の記録は次のとおりです。

| DSL | Web Animation（記録） |
| --- | --- |
| 734〜737 行目の group | 2 つ。delay=0 duration=1000（background）と delay=0 duration=2000（color） |
| その group のあとに `animate("500ms", style({opacity: 0}))` | 3 つ目が delay=2000 duration=500。750〜752 行目の「全部終わるまで次へ進まない」のとおり |
| 774〜777 行目の sequence | 1 つ。duration=1000、keyframes は opacity 0 → 1 |
| `group([…], {delay: '300ms'})` | delay=300 duration=1000（740〜742 行目の options の delay） |
| `group([animate("1s", opacity 0), animate("2s", opacity 1)])` | エラーなしで 2 つ（1000ms と 2000ms）。同じプロパティを並べても検査に掛からない形（[第 4 回](04-anm-ast.md)の 3 節） |

group の中の要素ごとに別の Web Animation になるのは、タイムラインが group の子ごとに別の timeline を作るからです（[第 5 回](05-anm-timeline.md)）。787〜788 行目の「transition に配列を渡すと順に」は、`normalizeAnimationEntry` が配列を sequence に包むことです（[第 4 回](04-anm-ast.md)）。790 行目は行頭の `*` の後の空白が抜けていますが、表示には影響しません。

## 5. keyframes：offset と、カンマの抜けた例

📄 `angular/packages/animations/src/animation_metadata.ts` L893–922 （▶ の行: 896–898, 902, 904–906, 911–912, 916–918）

````ts
893 │ /**
894 │  * Defines a set of animation styles, associating each style with an optional `offset` value.
895 │  *
896 ▶  * @param steps A set of animation styles with optional offset data.
897 ▶  * The optional `offset` value for a style specifies a percentage of the total animation
898 ▶  * time at which that style is applied.
899 │  * @returns An object that encapsulates the keyframes data.
900 │  *
901 │  * @usageNotes
902 ▶  * Use with the `animate()` call. Instead of applying animations
903 │  * from the current state
904 ▶  * to the destination state, keyframes describe how each style entry is applied and at what point
905 ▶  * within the animation arc.
906 ▶  * Compare [CSS Keyframe Animations](https://www.w3schools.com/css/css3_animations.asp).
907 │  *
908 │  * ### Usage
909 │  *
910 │  * In the following example, the offset values describe
911 ▶  * when each `backgroundColor` value is applied. The color is red at the start, and changes to
912 ▶  * blue when 20% of the total time has elapsed.
913 │  *
914 │  * ```ts
915 │  * // the provided offset values
916 ▶  * animate("5s", keyframes([
917 ▶  *   style({ backgroundColor: "red", offset: 0 }),
918 ▶  *   style({ backgroundColor: "blue", offset: 0.2 }),
919 │  *   style({ backgroundColor: "orange", offset: 0.3 }),
920 │  *   style({ backgroundColor: "black", offset: 1 })
921 │  * ]))
922 │  * ```
````

📄 `angular/packages/animations/src/animation_metadata.ts` L923–942 （▶ の行: 924–925, 928–933, 941）

````ts
923 │  *
924 ▶  * If there are no `offset` values specified in the style entries, the offsets
925 ▶  * are calculated automatically.
926 │  *
927 │  * ```ts
928 ▶  * animate("5s", keyframes([
929 ▶  *   style({ backgroundColor: "red" }) // offset = 0
930 ▶  *   style({ backgroundColor: "blue" }) // offset = 0.33
931 ▶  *   style({ backgroundColor: "orange" }) // offset = 0.66
932 ▶  *   style({ backgroundColor: "black" }) // offset = 1
933 ▶  * ]))
934 │  *```
935 │ 
936 │  * @publicApi
937 │  *
938 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
939 │  */
940 │ export function keyframes(steps: AnimationStyleMetadata[]): AnimationKeyframesSequenceMetadata {
941 ▶   return {type: AnimationMetadataType.Keyframes, steps};
942 │ }
````

記録では、916〜921 行目の例の keyframes は `0:red 0.2:blue 0.3:orange 1:black` で、そのまま Web Animation に入りました。924〜925 行目の「offset が無ければ自動で計算」は `0:red 0.3333:blue 0.6667:orange 1:black` で、930〜931 行目のコメントの 0.33・0.66 は丸めた値です（計算は `1 / (個数 - 1)`、[第 4 回](04-anm-ast.md)の `visitKeyframes`）。ただし 928〜933 行目の例は、`style(…)` の間にカンマが無いので、そのままでは TypeScript の構文エラー（TS1005 が 3 つ）です。この例は a577c9e1f48（2018-05-03）から変わっていません。offset を一部だけ書く・逆順・1 を超えるの 3 つは、説明文に書かれていないエラーになりました（NG03202・NG03200・NG03012。[第 4 回](04-anm-ast.md)の表）。906 行目の参照先は w3schools の CSS アニメーションのページです。

## 6. animation・useAnimation・animateChild：params と子のアニメーション

📄 `angular/packages/animations/src/animation_metadata.ts` L1106–1131 （▶ の行: 1111–1113, 1116–1117, 1125–1127, 1130）

````ts
1106 │ 
1107 │ /**
1108 │  * Produces a reusable animation that can be invoked in another animation or sequence,
1109 │  * by calling the `useAnimation()` function.
1110 │  *
1111 ▶  * @param steps One or more animation objects, as returned by the `animate()`
1112 ▶  * or `sequence()` function, that form a transformation from one state to another.
1113 ▶  * A sequence is used by default when you pass an array.
1114 │  * @param options An options object that can contain a delay value for the start of the
1115 │  * animation, and additional developer-defined parameters.
1116 ▶  * Provided values for additional parameters are used as defaults,
1117 ▶  * and override values can be passed to the caller on invocation.
1118 │  * @returns An object that encapsulates the animation data.
1119 │  *
1120 │  * @usageNotes
1121 │  * The following example defines a reusable animation, providing some default parameter
1122 │  * values.
1123 │  *
1124 │  * ```ts
1125 ▶  * var fadeAnimation = animation([
1126 ▶  *   style({ opacity: '{{ start }}' }),
1127 ▶  *   animate('{{ time }}',
1128 │  *   style({ opacity: '{{ end }}'}))
1129 │  *   ],
1130 ▶  *   { params: { time: '1000ms', start: 0, end: 1 }});
1131 │  * ```
````

📄 `angular/packages/animations/src/animation_metadata.ts` L1132–1159 （▶ の行: 1137, 1139, 1146–1148, 1158）

````ts
1132 │  *
1133 │  * The following invokes the defined animation with a call to `useAnimation()`,
1134 │  * passing in override parameter values.
1135 │  *
1136 │  * ```js
1137 ▶  * useAnimation(fadeAnimation, {
1138 │  *   params: {
1139 ▶  *     time: '2s',
1140 │  *     start: 1,
1141 │  *     end: 0
1142 │  *   }
1143 │  * })
1144 │  * ```
1145 │  *
1146 ▶  * If any of the passed-in parameter values are missing from this call,
1147 ▶  * the default values are used. If one or more parameter values are missing before a step is
1148 ▶  * animated, `useAnimation()` throws an error.
1149 │  *
1150 │  * @publicApi
1151 │  *
1152 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
1153 │  */
1154 │ export function animation(
1155 │   steps: AnimationMetadata | AnimationMetadata[],
1156 │   options: AnimationOptions | null = null,
1157 │ ): AnimationReferenceMetadata {
1158 ▶   return {type: AnimationMetadataType.Reference, animation: steps, options};
1159 │ }
````

📄 `angular/packages/animations/src/animation_metadata.ts` L1188–1205 （▶ の行: 1191–1193, 1204）

```ts
1188 │ /**
1189 │  * Starts a reusable animation that is created using the `animation()` function.
1190 │  *
1191 ▶  * @param animation The reusable animation to start.
1192 ▶  * @param options An options object that can contain a delay value for the start of
1193 ▶  * the animation, and additional override values for developer-defined parameters.
1194 │  * @return An object that contains the animation parameters.
1195 │  *
1196 │  * @publicApi
1197 │  *
1198 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
1199 │  */
1200 │ export function useAnimation(
1201 │   animation: AnimationReferenceMetadata,
1202 │   options: AnimationOptions | null = null,
1203 │ ): AnimationAnimateRefMetadata {
1204 ▶   return {type: AnimationMetadataType.AnimateRef, animation, options};
1205 │ }
```

1158 行目と 1204 行目のとおり、`animation()` も `useAnimation()` も、受け取ったものを入れたオブジェクトを返すだけです。`{{ start }}` の置き換えは、遷移のときのタイムラインで行われます。DEMO の「params」の記録は次のとおりです。

| 使い方 | 記録 |
| --- | --- |
| `useAnimation(fadeAnimation)`（1125〜1130 行目の既定） | duration=1000、opacity 0 → 1 |
| 1137〜1143 行目の上書き | duration=2000、opacity 1 → 0 |
| `params: {time: '2s'}` だけ | duration=2000、opacity 0 → 1（1146〜1147 行目「足りない値は既定」） |
| 既定の無い `animation([animate('{{ time }}', …)])` を params なしで | `useAnimation()` の呼び出しでも、コンポーネントの起動でも投げない。値を変えた遷移のときに NG03402 ／ NG03505 ／ NG03003「Please provide a value for the animation param time」と NG03000 |
| `[@r]="{value: 'go', params: {time: '300ms'}}"` | duration=300（trigger の値の params も使われる） |

1147〜1148 行目の「足りなければ `useAnimation()` がエラーを投げる」は、投げる時期が違います。`useAnimation()` はオブジェクトを返すだけ（1204 行目）で、AST の検査も `{{ }}` の既定を確かめません（[第 4 回](04-anm-ast.md)の 4 節）。分かるのは、その transition が初めて走ったときのタイムラインの `interpolateParams`（util.ts L194〜212）です。

📄 `angular/packages/animations/src/animation_metadata.ts` L1161–1186 （▶ の行: 1164–1165, 1169–1172, 1174–1176, 1185）

```ts
1161 │ /**
1162 │  * Executes a queried inner animation element within an animation sequence.
1163 │  *
1164 ▶  * @param options An options object that can contain a delay value for the start of the
1165 ▶  * animation, and additional override values for developer-defined parameters.
1166 │  * @return An object that encapsulates the child animation data.
1167 │  *
1168 │  * @usageNotes
1169 ▶  * Each time an animation is triggered in Angular, the parent animation
1170 ▶  * has priority and any child animations are blocked. In order
1171 ▶  * for a child animation to run, the parent animation must query each of the elements
1172 ▶  * containing child animations, and run them using this function.
1173 │  *
1174 ▶  * Note that this feature is designed to be used with `query()` and it will only work
1175 ▶  * with animations that are assigned using the Angular animation library. CSS keyframes
1176 ▶  * and transitions are not handled by this API.
1177 │  *
1178 │  * @publicApi
1179 │  *
1180 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
1181 │  */
1182 │ export function animateChild(
1183 │   options: AnimateChildOptions | null = null,
1184 │ ): AnimationAnimateChildMetadata {
1185 ▶   return {type: AnimationMetadataType.AnimateChild, options};
1186 │ }
```

📄 `angular/packages/animations/src/animation_metadata.ts` L88–99 （▶ の行: 97–98）

```ts
88 │ /**
89 │  * Adds duration options to control animation styling and timing for a child animation.
90 │  *
91 │  * @see {@link animateChild}
92 │  *
93 │  * @publicApi
94 │  *
95 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
96 │  */
97 ▶ export declare interface AnimateChildOptions extends AnimationOptions {
98 ▶   duration?: number | string;
99 │ }
```

1169〜1172 行目の「親のアニメーションが優先され、子は止められる。子を動かすには query して animateChild」を、親と子が同じ値で動く trigger で記録しました。親が `animate(300, …)` だけのとき、動いたのは親だけでした。`[query('@child', animateChild()), animate(300, …)]` では子（600ms）が先に走り、親は delay=600 で続きました。`group([query('@child', animateChild({delay: 200})), …])` では子が duration=800（200ms の遅れを含む）になりました。98 行目の `duration` は型にありますが、どう効くかは説明文に書かれていません。query の外の `animateChild()` は、エラーにならず何も動かしませんでした（[第 4 回](04-anm-ast.md)）。

## 7. query：limit・optional・:self、そして :enter と :leave

📄 `angular/packages/animations/src/animation_metadata.ts` L303–324 （▶ の行: 315, 319, 323）

```ts
303 │ /**
304 │  * Encapsulates an animation query. Instantiated and returned by
305 │  * the `query()` function.
306 │  *
307 │  * @publicApi
308 │  *
309 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
310 │  */
311 │ export interface AnimationQueryMetadata extends AnimationMetadata {
312 │   /**
313 │    *  The CSS selector for this query.
314 │    */
315 ▶   selector: string;
316 │   /**
317 │    * One or more animation step objects.
318 │    */
319 ▶   animation: AnimationMetadata | AnimationMetadata[];
320 │   /**
321 │    * A query options object.
322 │    */
323 ▶   options: AnimationQueryOptions | null;
324 │ }
```

📄 `angular/packages/animations/src/animation_metadata.ts` L459–481 （▶ の行: 469–471, 474, 476–478, 480）

```ts
459 │ /**
460 │  * Encapsulates animation query options.
461 │  * Passed to the `query()` function.
462 │  *
463 │  * @publicApi
464 │  *
465 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
466 │  */
467 │ export declare interface AnimationQueryOptions extends AnimationOptions {
468 │   /**
469 ▶    * True if this query is optional, false if it is required. Default is false.
470 ▶    * A required query throws an error if no elements are retrieved when
471 ▶    * the query is executed. An optional query does not.
472 │    *
473 │    */
474 ▶   optional?: boolean;
475 │   /**
476 ▶    * A maximum total number of results to return from the query.
477 ▶    * If negative, results are limited from the end of the query list towards the beginning.
478 ▶    * By default, results are not limited.
479 │    */
480 ▶   limit?: number;
481 │ }
```

📄 `angular/packages/animations/src/animation_metadata.ts` L1207–1236 （▶ の行: 1213, 1216–1219, 1223–1224, 1231, 1234）

````ts
1207 │ /**
1208 │  * Finds one or more inner elements within the current element that is
1209 │  * being animated within a sequence. Use with `animate()`.
1210 │  *
1211 │  * @param selector The element to query, or a set of elements that contain Angular-specific
1212 │  * characteristics, specified with one or more of the following tokens.
1213 ▶  *  - `query(":enter")` or `query(":leave")` : Query for newly inserted/removed elements (not
1214 │  *     all elements can be queried via these tokens, see
1215 │  *     [Entering and Leaving Elements](#entering-and-leaving-elements))
1216 ▶  *  - `query(":animating")` : Query all currently animating elements.
1217 ▶  *  - `query("@triggerName")` : Query elements that contain an animation trigger.
1218 ▶  *  - `query("@*")` : Query all elements that contain an animation triggers.
1219 ▶  *  - `query(":self")` : Include the current element into the animation sequence.
1220 │  *
1221 │  * @param animation One or more animation steps to apply to the queried element or elements.
1222 │  * An array is treated as an animation sequence.
1223 ▶  * @param options An options object. Use the 'limit' field to limit the total number of
1224 ▶  * items to collect.
1225 │  * @return An object that encapsulates the query data.
1226 │  *
1227 │  * @usageNotes
1228 │  *
1229 │  * ### Multiple Tokens
1230 │  *
1231 ▶  * Tokens can be merged into a combined query selector string. For example:
1232 │  *
1233 │  * ```ts
1234 ▶  *  query('@subTrigger, :self, .record:enter, .record:leave', [...])
1235 │  * ```
1236 │  *
````

📄 `angular/packages/animations/src/animation_metadata.ts` L1237–1257 （▶ の行: 1237–1239, 1245, 1248–1249, 1255）

````ts
1237 ▶  * The `query()` function collects multiple elements and works internally by using
1238 ▶  * `element.querySelectorAll`. Use the `limit` field of an options object to limit
1239 ▶  * the total number of items to be collected. For example:
1240 │  *
1241 │  * ```js
1242 │  * query('div', [
1243 │  *   animate(...),
1244 │  *   animate(...)
1245 ▶  * ], { limit: 1 })
1246 │  * ```
1247 │  *
1248 ▶  * By default, throws an error when zero items are found. Set the
1249 ▶  * `optional` flag to ignore this error. For example:
1250 │  *
1251 │  * ```js
1252 │  * query('.some-element-that-may-not-be-there', [
1253 │  *   animate(...),
1254 │  *   animate(...)
1255 ▶  * ], { optional: true })
1256 │  * ```
1257 │  *
````

DEMO の「query」は、5 つの `.item` を持つ要素の trigger に `transition('* => go', query(…))` を書いた記録です。

| query | 動いた要素（記録） |
| --- | --- |
| `query('.item', …)` | i0〜i4 の 5 つ（1237〜1238 行目の querySelectorAll） |
| `{limit: 2}` ／ `{limit: 1}` ／ `{limit: -2}` | i0・i1 ／ i0 ／ i3・i4（477 行目「負なら後ろから」） |
| `query('.nothing', …)` | NG03402 ／ NG03505 ／ NG03014「`query(".nothing")` returned zero elements.」（1248 行目） |
| `{optional: true}` | 何も動かず、エラーなし |
| `query(':self', …)` | trigger の要素だけ（1219 行目） |
| `query(':self, .item', …, {limit: 2})` | 自分・i0・i1 の 3 つ（limit は :self を数えない） |
| `query('.item, :self', …)` | 例外「Failed to execute 'querySelectorAll' on 'Element': '.item, ' is not a valid selector.」 |
| `query('.item ,:self', …)` | 同じく `'.item ,'` で例外 |

`:self` を消すのは `normalizeSelector` の `selector.replace(SELF_TOKEN_REGEX, '')` で、その正規表現は `` `s*${SELF_TOKEN}s*,?` `` です（animation\_ast\_builder.ts の L81 と L588〜594。[第 4 回](04-anm-ast.md)で引きます）。`\s` のつもりの `s` なので空白を食べず、後ろのカンマしか消しません。`:self` が先頭なら `':self, .item'` → `' .item'` で動きますが、末尾にあると `'.item, '` が残り、ドライバーの `querySelectorAll` が例外を投げます。この例外は NG のエラーに包まれず、そのまま変更検知から出てきました。1234 行目の例（`'@subTrigger, :self, .record:enter, .record:leave'`）は `:self,` の後ろにも項目があるので動く形で、spec（legacy\_animation\_query\_integration\_spec.ts）の `:self` もすべて先頭です。

📄 `angular/packages/animations/src/animation_metadata.ts` L1258–1285 （▶ の行: 1260–1263, 1267–1268, 1272–1274, 1280–1282）

```ts
1258 │  * ### Entering and Leaving Elements
1259 │  *
1260 ▶  * Not all elements can be queried via the `:enter` and `:leave` tokens, the only ones
1261 ▶  * that can are those that Angular assumes can enter/leave based on their own logic
1262 ▶  * (if their insertion/removal is simply a consequence of that of their parent they
1263 ▶  * should be queried via a different token in their parent's `:enter`/`:leave` transitions).
1264 │  *
1265 │  * The only elements Angular assumes can enter/leave based on their own logic (thus the only
1266 │  * ones that can be queried via the `:enter` and `:leave` tokens) are:
1267 ▶  *  - Those inserted dynamically (via `ViewContainerRef`)
1268 ▶  *  - Those that have a structural directive (which, under the hood, are a subset of the above ones)
1269 │  *
1270 │  * <div class="docs-alert docs-alert-helpful">
1271 │  *
1272 ▶  *  Note that elements will be successfully queried via `:enter`/`:leave` even if their
1273 ▶  *  insertion/removal is not done manually via `ViewContainerRef`or caused by their structural
1274 ▶  *  directive (e.g. they enter/exit alongside their parent).
1275 │  *
1276 │  * </div>
1277 │  *
1278 │  * <div class="docs-alert docs-alert-important">
1279 │  *
1280 ▶  *  There is an exception to what previously mentioned, besides elements entering/leaving based on
1281 ▶  *  their own logic, elements with an animation trigger can always be queried via `:leave` when
1282 ▶  * their parent is also leaving.
1283 │  *
1284 │  * </div>
1285 │  *
```

1260〜1268 行目は「`:enter`・`:leave` で探せるのは、自分の理屈で出入りする要素（ViewContainerRef で入れたもの、構造ディレクティブのもの）だけ」、1272〜1274 行目は「親と一緒に出入りしても、そういう要素なら探せる」、1280〜1282 行目は「例外として、trigger を持つ要素は親が消えるとき `:leave` で探せる」です。DEMO で、`@if` で入る `p` の中に、ただの `span.c`、`[@leaf]` の `b`、内側の `@if` の `i` を置きました。

| どこの query か | 当たった要素（記録） | 説明文 |
| --- | --- | --- |
| 外の box の trigger の `query(':enter')`（同じ回に p を入れる） | p だけ | 1260〜1268 行目 |
| 同じく `query(':leave')`（p を外す） | p だけ | 同上 |
| p 自身の `:enter` の中の `query(':enter')` | i（内側の @if）。span も b も当たらない | 1272〜1274 行目 |
| p 自身の `:leave` の中の `query(':leave')` | b（trigger を持つ）と i。span は当たらない | 1280〜1282 行目 |

3 つの段落のとおりでした。`:enter` では trigger を持つ b に当たらず、`:leave` では当たるという非対称は、issue #45058（2022-02-11、`:enter and :leaving animations of children with triggers are asymmetric/confusing/unclear`、2025-08-20 に「予定なし」で閉じた）が取り上げ、その日のうちに 1278〜1284 行目の注意書きが 36784342922（``docs(animations): clarify information about query with `:leave` (#45059)``）で足されました。外の box の query が i に当たらない（p 自身の query では当たる）のは、エンジンが入った要素に `ng-enter` のクラスを付ける `buildRootMap`（transition\_animation\_engine.ts L1840〜1880）が、親をたどって最初に trigger の要素に着けばその組に入れ（L1857〜1859）、先に「親も入った要素」に着けば印を付けない（L1860〜1862）からです。1 つ目の記録では i の親 p が入った要素なので外れ、p に trigger がある 2 つ目の記録では p の組に入りました（エンジンは[第 6 回](06-anm-engine.md)）。

📄 `angular/packages/animations/src/animation_metadata.ts` L1286–1323 （▶ の行: 1295, 1304, 1306–1307, 1310–1311）

````ts
1286 │  * ### Usage Example
1287 │  *
1288 │  * The following example queries for inner elements and animates them
1289 │  * individually using `animate()`.
1290 │  *
1291 │  * ```angular-ts
1292 │  * @Component({
1293 │  *   selector: 'inner',
1294 │  *   template: `
1295 ▶  *     <div [@queryAnimation]="exp">
1296 │  *       <h1>Title</h1>
1297 │  *       <div class="content">
1298 │  *         Blah blah blah
1299 │  *       </div>
1300 │  *     </div>
1301 │  *   `,
1302 │  *   animations: [
1303 │  *    trigger('queryAnimation', [
1304 ▶  *      transition('* => goAnimate', [
1305 │  *        // hide the inner elements
1306 ▶  *        query('h1', style({ opacity: 0 })),
1307 ▶  *        query('.content', style({ opacity: 0 })),
1308 │  *
1309 │  *        // animate the inner elements in, one by one
1310 ▶  *        query('h1', animate(1000, style({ opacity: 1 }))),
1311 ▶  *        query('.content', animate(1000, style({ opacity: 1 }))),
1312 │  *      ])
1313 │  *    ])
1314 │  *  ]
1315 │  * })
1316 │  * class Cmp {
1317 │  *   exp = '';
1318 │  *
1319 │  *   goAnimate() {
1320 │  *     this.exp = 'goAnimate';
1321 │  *   }
1322 │  * }
1323 │  * ```
````

1292〜1322 行目の例は strict の ngc（strictTemplates）に 0 件で通りました。

## 8. stagger：「動いたあと」ではなく「開始をずらす」

📄 `angular/packages/animations/src/animation_metadata.ts` L483–500 （▶ の行: 484, 495, 499）

```ts
483 │ /**
484 ▶  * Encapsulates parameters for staggering the start times of a set of animation steps.
485 │  * Instantiated and returned by the `stagger()` function.
486 │  *
487 │  * @publicApi
488 │  *
489 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
490 │  **/
491 │ export interface AnimationStaggerMetadata extends AnimationMetadata {
492 │   /**
493 │    * The timing data for the steps.
494 │    */
495 ▶   timings: string | number;
496 │   /**
497 │    * One or more animation steps.
498 │    */
499 ▶   animation: AnimationMetadata | AnimationMetadata[];
500 │ }
```

📄 `angular/packages/animations/src/animation_metadata.ts` L1337–1365 （▶ の行: 1338–1339, 1341–1342, 1350–1353, 1359–1360）

````ts
1337 │ /**
1338 ▶  * Use within an animation `query()` call to issue a timing gap after
1339 ▶  * each queried item is animated.
1340 │  *
1341 ▶  * @param timings A delay value.
1342 ▶  * @param animation One ore more animation steps.
1343 │  * @returns An object that encapsulates the stagger data.
1344 │  *
1345 │  * @usageNotes
1346 │  * In the following example, a container element wraps a list of items stamped out
1347 │  * by an `@for` block. The container element contains an animation trigger that will later be set
1348 │  * to query for each of the inner items.
1349 │  *
1350 ▶  * Each time items are added, the opacity fade-in animation runs,
1351 ▶  * and each removed item is faded out.
1352 ▶  * When either of these animations occur, the stagger effect is
1353 ▶  * applied after each item's animation is started.
1354 │  *
1355 │  * ```html
1356 │  * <!-- list.component.html -->
1357 │  * <button (click)="toggle()">Show / Hide Items</button>
1358 │  * <hr />
1359 ▶  * <div [@listAnimation]="items.length">
1360 ▶  *   @for(item of items; track $index) {
1361 │  *      <div>{{ item }}</div>
1362 │  *   }
1363 │  * </div>
1364 │  * ```
1365 │  *
````

1338〜1339 行目は「query の中で使い、query した各要素が動いた**あと**に時間の間をあける」、1352〜1353 行目は「各要素のアニメーションが**始まった**あとに stagger の効果がかかる」です。DEMO の「stagger」で、5 つの `.item` に `query('.item', stagger(100, animate(500, …)))` を流すと、Web Animation は i0〜i4 が delay 0・100・200・300・400、duration はどれも 500 でした。つまり開始を 100ms ずつずらすだけで、前の要素が終わるのは待ちません（i0 の終わりの 500ms の時点で i4 も動いている）。1352〜1353 行目が実際に合い、1338〜1339 行目は違います。1338〜1339 行目は b10029c18b1（2017-04-25）、1352〜1353 行目は a577c9e1f48（2018）からです。1342 行目の「One ore more」は or の書き間違いです。

説明文に無い形も記録しました。`stagger(-100, …)` と `stagger('100ms reverse', …)` は、どちらも delay が 400・300・200・100・0 の逆順になりました。`animate('500ms 50ms', …)` を中に置くと duration が 550 になり、50ms は keyframes の中の待ちとして入りました。stagger の timings を読むのは `visitStagger`（animation\_ast\_builder.ts の L574〜577、`'full'` の特別扱いもある。[第 4 回](04-anm-ast.md)）、逆順にするのはタイムラインの `visitStagger`（[第 5 回](05-anm-timeline.md)）です。query の外の stagger は登録のときに NG03404 ／ NG03013 でした。

📄 `angular/packages/animations/src/animation_metadata.ts` L1366–1394 （▶ の行: 1369, 1373, 1379, 1381–1382, 1385–1386, 1390）

````ts
1366 │  * Here is the component code:
1367 │  *
1368 │  * ```ts
1369 ▶  * import {trigger, transition, style, animate, query, stagger} from '@angular/animations';
1370 │  * @Component({
1371 │  *   templateUrl: 'list.component.html',
1372 │  *   animations: [
1373 ▶  *     trigger('listAnimation', [
1374 │  *     ...
1375 │  *     ])
1376 │  *   ]
1377 │  * })
1378 │  * class ListComponent {
1379 ▶  *   items = [];
1380 │  *
1381 ▶  *   showItems() {
1382 ▶  *     this.items = [0,1,2,3,4];
1383 │  *   }
1384 │  *
1385 ▶  *   hideItems() {
1386 ▶  *     this.items = [];
1387 │  *   }
1388 │  *
1389 │  *   toggle() {
1390 ▶  *     this.items.length ? this.hideItems() : this.showItems();
1391 │  *    }
1392 │  *  }
1393 │  * ```
1394 │  *
````

📄 `angular/packages/animations/src/animation_metadata.ts` L1395–1424 （▶ の行: 1398–1402, 1405–1408）

````ts
1395 │  * Here is the animation trigger code:
1396 │  *
1397 │  * ```ts
1398 ▶  * trigger('listAnimation', [
1399 ▶  *   transition('* => *', [ // each time the binding value changes
1400 ▶  *     query(':leave', [
1401 ▶  *       stagger(100, [
1402 ▶  *         animate('0.5s', style({ opacity: 0 }))
1403 │  *       ])
1404 │  *     ]),
1405 ▶  *     query(':enter', [
1406 ▶  *       style({ opacity: 0 }),
1407 ▶  *       stagger(100, [
1408 ▶  *         animate('0.5s', style({ opacity: 1 }))
1409 │  *       ])
1410 │  *     ])
1411 │  *   ])
1412 │  * ])
1413 │  * ```
1414 │  *
1415 │  * @publicApi
1416 │  *
1417 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
1418 │  */
1419 │ export function stagger(
1420 │   timings: string | number,
1421 │   animation: AnimationMetadata | AnimationMetadata[],
1422 │ ): AnimationStaggerMetadata {
1423 │   return {type: AnimationMetadataType.Stagger, timings, animation};
1424 │ }
````

1. **例のとおりの trigger では、最初の showItems() で止まる**

   1397〜1412 行目をそのまま使い、`items` を 0 個から 5 個にすると、NG03402 ／ NG03505 ／ NG03014「`query(":leave")` returned zero elements.」でした。`'* => *'` の遷移の中で `query(':leave')` が 0 件になるからで、7 節の表の `'.nothing'` と同じです。`{optional: true}` を 2 つの query に足すと動きました。
2. **optional を足したときの記録**

   5 個が入ると、`:enter` の 5 つの Web Animation は delay=0 のまま duration が 500・600・700・800・900 で、先頭に opacity 0 の待ちの keyframe が入りました（1406 行目の `style({opacity: 0})` を待ちの間も保つため）。0 個に戻すと `:leave` の 5 つが delay 0〜400・duration 500 で動き、その間 5 つの要素は DOM に残り、終わると消えました。
3. **例の TypeScript は strict で通らない**

   1379 行目の `items = []` は strict では `never[]` になり、1382 行目の `this.items = [0,1,2,3,4]` が TS2322（5 つ）でした。テンプレート（1359〜1361 行目）は strictTemplates に通りました。

📄 `型の確かめ（手元の記録、2026-11-23）`

```
// strict の ngc（TypeScript 6.0.3、@angular/* 22.2.6）に説明文の例を通した結果
ex-keyframes.ts:5:3 - error TS1005: ',' expected.        // L927〜933 の keyframes の例（style() の間のカンマが無い）
ex-keyframes.ts:6:3 - error TS1005: ',' expected.
ex-keyframes.ts:7:3 - error TS1005: ',' expected.
ex-stagger.ts:28:19 - error TS2322: Type 'number' is not assignable to type 'never'.   // L1379〜1383 の items = [] と this.items = [0,1,2,3,4]
（ex-query.ts の L1292〜1322、ex-reuse.ts の L1125〜1143・L1008〜1012・L1077〜1085 は 0 件）
```

> **🧪 DEMO — npm の @angular/animations 22.2.6 を headless Chrome で動かした記録**
>
> ボタンは、記録のスクリプトがシナリオごとにページを読み直して取った結果を再生します（開発モードと本番相当の 2 回）。「説明と違う」の行は左に印を付けます。本番の欄は、開発モードと違うときだけ値を出します（本番はエラーの文が番号だけになる）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/anm-transition-query)

## ここまでの呼び出し（query と stagger の遷移が動くまで）

- 👤 `transition('* => *', [query(':enter', [style(…), stagger(100, …)], {optional: true})])` — animation\_metadata.ts L1092・L1329・L1419 — *オブジェクトを返すだけ*
  - `visitTransition()` → `parseTransitionExpr()` — animation\_ast\_builder.ts L238、animation\_transition\_expr.ts L19 — *式を関数の配列に（1 節）*
  - `visitQuery()` → `normalizeSelector()` — animation\_ast\_builder.ts L539・L588 — *:self を消す（7 節、第 4 回）*
  - `visitStagger()` — L567 — *query の外なら NG03013*
- 👤 `[@listAnimation]="items.length"` が変わる — テンプレート
  - `AnimationTrigger.matchTransition()` — animation\_trigger.ts L50 — *書いた順で最初に当たったもの*
  - `AnimationTransitionFactory.build()` — animation\_transition\_factory.ts L50
    - `invokeQuery()` — animation\_timeline\_builder.ts L699 — *limit で切り、0 件で optional でなければ NG03014*
    - `visitStagger()` — animation\_timeline\_builder.ts L514 — *開始を 100ms ずつずらす（8 節、第 5 回）*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `animations/browser/test/dsl/animation_trigger_spec.ts` | `trigger usage`（59）› `should support bi-directional transition expressions`（128）・`should support multiple transition statements in one string`（138）・``should match `1` and `0` given boolean values``（211） | 1 節の `<=>`・カンマ・式の 1/0 と boolean。数の 1/0 と式の true/false の it は無い |
| 同じファイル | `params`（151）› `should substitute variable params provided directly within the transition match`（175） | 3 節の関数の式の params |
| `animations/browser/test/dsl/animation_spec.ts` | `substitutions`（568）› `should throw an error when an input variable is not provided when invoked and is not a default value`（699） | 6 節の NG03003（遷移のときに分かる） |
| 同じファイル | `query()`（1200）› `should throw an error when an animation query returns zero elements`（1213）・`should allow a query to be skipped if it is set as optional and returns zero elements`（1225） | 7 節の NG03014 と optional |
| 同じファイル | `group()`（996）› `should respect delays after group entries`（1110）、`keyframes()`（730）› `should respect offsets if provided directly within the style data`（935） | 4・5 節 |
| `core/test/legacy_animation/legacy_animation_query_integration_spec.ts` | `should retain style values when :self is used inside of a query`（538）ほか、`:self` の 4 か所（430・545・610・3183） | どれも `:self` が先頭。末尾の `:self` の it は無い |

📄 `走らせたコマンド（2026-11-23）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/animations/browser/test:test_web_chromium --nocache_test_results --test_output=all
（core/test/legacy_animation の query の spec は //packages/core/test:test_web_chromium。今回は走らせていない）
```

結果は手元の bazel で 124 passed・0 failed でした（ブラウザーの 1 ファイル）。直すとしたら、説明文は animation\_metadata.ts の 1020〜1021 行目を 1 節の最後の文に、1338〜1339 行目を「各要素の開始をずらす」に、928〜933 行目にカンマを、1397〜1412 行目の 2 つの query に `{optional: true}` を、1379 行目を `items: number[] = []` に、1147〜1148 行目を「遷移のときにエラー」にします。`:self` は animation\_ast\_builder.ts の L81 を `\\s*`（テンプレート文字列の中なので 2 本）にするのが直し方で、spec は animation\_spec.ts の `describe('query()')` か legacy\_animation\_query\_integration\_spec.ts に「`query('header, :self', …)` が自分と header を返す」の it を足します。[第 4 回](04-anm-ast.md)の 6 節で、正規表現だけを取り出して直した形を試しています。

## 聞かれそうな質問

**Q. `[@t]="count"`（数）で `transition('false => true', …)` は 0 → 1 に当たりますか？**

当たりません。`'false' == 0` が偽で、boolean の特別扱いは値が boolean のときだけだからです。数でも boolean でも当てたいなら `'0 => 1'` と書きます（1 節の表）。

**Q. stagger(100) は前の要素が終わってから次を始めますか？**

始めません。各要素の開始を 100ms ずつずらすだけで、要素は重なって動きます（8 節、delay 0〜400・duration 500）。負の値か `'100ms reverse'` で順が逆になります。

**Q. 説明文の stagger の例をそのまま使えますか？**

使えません。`query(':leave')` が 0 件のときに NG03014 になるので、最初の表示で止まります。2 つの query に `{optional: true}` を足します（8 節）。

**Q. `query(':self, .a')` と `query('.a, :self')` は同じですか？**

同じではありません。前者は動き、後者は `'.a, '` が残って querySelectorAll が SyntaxError を投げます（7 節）。`:self` は先頭に書きます。

**Q. useAnimation の params が足りないと、いつエラーになりますか？**

その transition が初めて走ったときです。`useAnimation()` の呼び出しでも、コンポーネントの登録でもありません（6 節）。開発モードの文は「Please provide a value for the animation param time」です。

## 読み終えて

- 式の `'1'`・`'0'` は boolean にも数にも当たるが、`'true'`・`'false'` は boolean にしか当たらない。説明文の 1020〜1021 行目は逆。
- group は同時に始め、全部終わるまで次へ進まない。keyframes の offset は省けば 1/(n-1) ずつ。
- params の不足は遷移のときに分かる。animateChild は query と組み、子を先に走らせる。
- query の limit は :self を数えず、:self を末尾に書くと SyntaxError。:enter と :leave で探せる要素は非対称。
- stagger は開始をずらすだけ。説明文の例は optional を足さないと動かない。

---

← 前: [trigger・state・style・animate の説明文](01-anm-trigger-state.md)  
次: [AnimationBuilder とプレイヤーの説明文](03-anm-builder-players.md) →
