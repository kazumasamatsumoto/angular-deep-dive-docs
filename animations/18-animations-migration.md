[目次](../README.md) › [アニメーションの内側](README.md) › 第 18 回 / 全 20 回

# 移行：@angular/animations から animate.enter / animate.leave へ

> 旧 DSL の書き方ごとに、CSS と animate.enter / leave でどう書き直せるか（:enter / :leave、state、params、query と stagger、group）と、書き直せないもの。移行の自動化（schematic）が今あるかをソースで確かめる。v23 での削除を延ばしてほしいという issue が挙げる「足りないもの」を、ここまでの章の行に当てはめて読む。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-migration)

---

`@angular/animations` の公開 API には「@deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23」と書かれています。この章では、公式の移行ガイド（`migration.md`）が旧 DSL の書き方ごとに何を勧めているかを行で読み、`:enter` / `:leave`・`state`・時間・`query` と `stagger`・`group`・`animateChild`・`AnimationPlayer` を CSS と `animate.enter` / `animate.leave` に置き換えた形を、このページの上で本物に動かします。そのうえで、移行の自動化（schematic）が今あるかをソースで確かめ、「v23 で消さないでほしい」という issue #71703 が挙げる「足りないもの」を、このシリーズのどの章の行の話かに当てはめます。

読む対象は `adev/src/content/guide/animations/migration.md` と、その例 `adev/src/content/examples/animations/src/app/` の `animations-package/`（旧）・`native-css/`（新）、`packages/core/schematics/` です。

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
14. [14. 旧パッケージの入口](14-animations-legacy-setup.md)
15. [15. 旧 DSL とキーフレーム](15-animations-legacy-dsl.md)
16. [16. TransitionAnimationEngine](16-animations-legacy-engine.md)
17. [17. 2 つが同居するとき](17-animations-legacy-compat.md)
18. **18. 移行**（この章）
19. [19. テスト](19-animations-testing.md)
20. [20. issue と変更を読む](20-animations-issues.md)

## 1. 移行の考え方：trigger と state は CSS のクラスになる

📄 `angular/adev/src/content/guide/animations/migration.md` L33–67 （▶ の行: 37, 43, 49, 55, 57, 61, 67）

```md
33 │ ## Animating a Transition
34 │ 
35 │ ### Animating State and Styles
36 │ 
37 ▶ The animations package allowed you to define various states using the [`state()`](api/animations/state) function within a component. Examples might be an `open` or `closed` state containing the styles for each respective state within the definition. For example:
38 │ 
39 │ #### With Animations Package {#animating-state-and-styles-with-animations-package}
40 │ 
41 │ <docs-code header="open-close.ts" path="adev/src/content/examples/animations/src/app/open-close.ts" region="state1"/>
42 │ 
43 ▶ This same behavior can be accomplished natively by using CSS classes, either with a keyframe animation or transition styling.
44 │ 
45 │ #### With Native CSS {#animating-state-and-styles-with-native-css}
46 │ 
47 │ <docs-code header="animations.css" path="adev/src/content/examples/animations/src/app/animations.css" region="animation-states"/>
48 │ 
49 ▶ Triggering the `open` or `closed` state is done by toggling classes on the element in your component. You can find examples of how to do this in our [template guide](guide/templates/binding#css-class-and-style-property-bindings).
50 │ 
51 │ You can see similar examples in the template guide for [animating styles directly](guide/templates/binding#css-style-properties).
52 │ 
53 │ ### Transitions, Timing, and Easing
54 │ 
55 ▶ The animations package `animate()` function allows for providing timing, like duration, delays and easing. This can be done natively with CSS using several css properties or shorthand properties.
56 │ 
57 ▶ Specify `animation-duration`, `animation-delay`, and `animation-timing-function` for a keyframe animation in CSS, or alternatively use the `animation` shorthand property.
58 │ 
59 │ <docs-code header="animations.css" path="adev/src/content/examples/animations/src/app/animations.css" region="animation-timing"/>
60 │ 
61 ▶ Similarly, you can use `transition-duration`, `transition-delay`, and `transition-timing-function` and the `transition` shorthand for animations that are not using `@keyframes`.
62 │ 
63 │ <docs-code header="animations.css" path="adev/src/content/examples/animations/src/app/animations.css" region="transition-timing"/>
64 │ 
65 │ ### Triggering an Animation
66 │ 
67 ▶ The animations package required specifying triggers using the `trigger()` function and nesting all of your states within it. With native CSS, this is unnecessary. Animations can be triggered by toggling CSS styles or classes. Once a class is present on an element, the animation will occur. Removing the class will revert the element back to whatever CSS is defined for that element. This results in significantly less code to do the same animation. Here's an example:
```

1. **37〜49 行目 state と style → クラス**

   `state('open', style(…))` のような状態は、43 行目のとおり CSS のクラス（キーフレームか transition）で書き、49 行目のとおり「コンポーネントでクラスを付け外しする」ことで切り替えます。ここで使うのは `[class.open]` のような普通のクラスのバインディングで、`animate.enter` / `animate.leave` ではありません。要素が DOM に入る・出る瞬間ではないからです。
2. **55〜61 行目 animate() の時間 → CSS のプロパティ**

   `animate('250ms 469ms ease-in')` の長さ・遅れ・イージングは、57 行目の `animation-duration` / `animation-delay` / `animation-timing-function`、または 61 行目の `transition-*` になります。
3. **67 行目 trigger() は要らない**

   「クラスが付けば動き、外せば元に戻る。同じことがずっと少ないコードで書ける」。旧エンジンが `trigger` の値の変化を見て遷移を選んでいた仕組み（[第 15 回](15-animations-legacy-dsl.md)・[第 16 回](16-animations-legacy-engine.md)）は、ブラウザの CSS が受け持ちます。

| 旧 DSL | ガイドが勧める書き方（migration.md の行） | このシリーズで仕組みを読んだ章 |
| --- | --- | --- |
| `state()` / `style()` | クラスを付け外しする（43・49 行目） | —（Angular のアニメーションの仕組みは使わない） |
| `animate('時間 遅れ イージング')` | `animation-*` / `transition-*`（57・61 行目） | 長さの読み方は[第 6 回](06-animations-longest.md) |
| `transition(':enter')` / `':leave'` | `animate.enter` / `animate.leave`（2 節） | [第 5 回](05-animations-enter-classes.md)・[第 10 回](10-animations-leave-classes.md) |
| `query()` + `animateChild()` | 同じテンプレートの中だけ（171 行目） | [第 11 回](11-animations-leave-nested.md) |
| `stagger()` | `animation-delay` / `transition-delay`（222 行目） | 4 節のデモ |
| `group()` | 複数のアニメーションを 1 つの `animation` に並べる（242〜250 行目） | いちばん長いものを待つのは[第 6 回](06-animations-longest.md) |
| `AnimationPlayer` | `Element.getAnimations()`（278 行目） | — |
| `[@.disabled]` | クラスで `none`、`prefers-reduced-motion` など（177〜190 行目） | [第 8 回](08-animations-disabled.md) |
| `params`・`AnimationBuilder` | ガイドに節が無い（下の注） | — |

> [!NOTE]
> **ポイント**
>
> `adev/src/content/guide/animations/` の 7 つの .md を `grep -n "params\|AnimationBuilder"` すると 0 件です。`AnimationBuilder` は `packages/animations/src/animation_builder.ts` で他の API と同じ「@deprecated 20.2 … Intent to remove in v23」が付いていますが、移行先はガイドに書かれていません。近いのは 274〜282 行目の `AnimationPlayer` の節（`Element.getAnimations()` と Web Animations API）で、`params` の代わりになるのは 4 節で使う CSS のカスタムプロパティ（`--index`）です。

## 2. :enter / :leave → animate.enter / animate.leave

📄 `angular/adev/src/content/examples/animations/src/app/animations-package/insert-remove.ts` L1–22 （▶ の行: 3, 8–11）

```ts
 1 │ // #docplaster
 2 │ import {Component} from '@angular/core';
 3 ▶ import {trigger, transition, animate, style} from '@angular/animations';
 4 │ 
 5 │ @Component({
 6 │   selector: 'app-insert-remove',
 7 │   animations: [
 8 ▶     trigger('myInsertRemoveTrigger', [
 9 ▶       transition(':enter', [style({opacity: 0}), animate('200ms', style({opacity: 1}))]),
10 ▶       transition(':leave', [animate('200ms', style({opacity: 0}))]),
11 ▶     ]),
12 │   ],
13 │   templateUrl: 'insert-remove.html',
14 │   styleUrls: ['insert-remove.css'],
15 │ })
16 │ export class InsertRemove {
17 │   isShown = false;
18 │ 
19 │   toggle() {
20 │     this.isShown = !this.isShown;
21 │   }
22 │ }
```

旧の例です。3 行目で `@angular/animations` から関数を読み、8〜11 行目の `trigger` に、9 行目の `:enter`（`opacity: 0` から 200ms で 1 へ）と 10 行目の `:leave`（200ms で 0 へ）を書きます。`:enter` は `void => *`、`:leave` は `* => void` の別名です（[第 15 回](15-animations-legacy-dsl.md)）。

📄 `angular/adev/src/content/examples/animations/src/app/native-css/remove.css` L5–29 （▶ の行: 12, 14–16, 23–28）

```css
 5 │ .insert-container {
 6 │   border: 1px solid #dddddd;
 7 │   margin-top: 1em;
 8 │   padding: 20px;
 9 │   font-weight: bold;
10 │   font-size: 20px;
11 │   opacity: 1;
12 ▶   transition: opacity 200ms ease-in;
13 │ 
14 ▶   @starting-style {
15 ▶     opacity: 0;
16 ▶   }
17 │ }
18 │ 
19 │ .insert-container p {
20 │   margin: 0;
21 │ }
22 │ 
23 ▶ .deleting {
24 ▶   opacity: 0;
25 ▶   transform: translateY(20px);
26 ▶   transition:
27 ▶     opacity 500ms ease-out,
28 ▶     transform 500ms ease-out;
29 │ }
```

1. **12〜16 行目 入るとき：@starting-style**

   新の例（`native-css/remove.css`）は、入るほうを `animate.enter` を使わずに書いています。12 行目の `transition: opacity 200ms` と、14〜16 行目の `@starting-style { opacity: 0 }`（要素が DOM に入った最初の描画で使う値）で、0 から 1 へ動きます。
2. **23〜28 行目 出るとき：animate.leave のクラス**

   テンプレート（`remove.html`）は `<div class="insert-container" animate.leave="deleting">` です。消すときに core が 23 行目の `.deleting` を付け、26〜28 行目の 500ms の transition が終わるまで要素を残します（[第 10 回](10-animations-leave-classes.md)）。`animate.enter` を使う例（`insert.html`）は `animate.enter="enter-animation"` で、`.enter-animation { animation: slide-fade 1s; }` のキーフレームを付けます（[第 5 回](05-animations-enter-classes.md)）。

## 3. デモ：フェード + スライドを両方の書き方で

📄 `旧 DSL（文字列で見せるだけ）`

```
// 旧: @angular/animations（このサイトには入っていない。動かさない）
@Component({
  selector: 'app-card',
  animations: [
    trigger('card', [
      transition(':enter', [
        style({opacity: 0, transform: 'translateY(16px)'}),
        animate('400ms ease-out', style({opacity: 1, transform: 'none'})),
      ]),
      transition(':leave', [
        animate('400ms ease-in', style({opacity: 0, transform: 'translateY(16px)'})),
      ]),
    ]),
  ],
  template: `@if (show()) { <div @card class="card">…</div> }`,
})
```

📄 `CSS + animate.enter / animate.leave（このページで動いている）`

```
// 新: CSS + animate.enter / animate.leave（下のデモで本物が動いている）
@if (show()) {
  <div class="am-card" animate.enter="am-in" animate.leave="am-out">…</div>
}

.am-in  { animation: am-fade-slide-in 400ms ease-out; }
.am-out { animation: am-fade-slide-out 400ms ease-in forwards; }
@keyframes am-fade-slide-in  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes am-fade-slide-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(16px); } }
```

> **🧪 DEMO — 本物の animate.enter / animate.leave（このページの Angular 22.1.6）**
>
> 最初は何も表示していません。ボタンを押したときだけ、毎フレーム DOM を読んで記録します（3 秒で止める）。OS の設定で動きを減らしていても、このデモは動きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-migration)

「カードを消す」を押すと、`.am-out` が付いている間は要素が残り、400ms ほどあとに「DOM から外れた」が記録されます。旧 DSL では `:leave` の遷移が終わるまで旧エンジンが要素を残していました（[第 16 回](16-animations-legacy-engine.md)）。新しいほうでは、core が `.am-out` のいちばん長いアニメーションの終わりを待ってから消します（[第 9 回](09-animations-leave-removal.md)）。

## 4. query と stagger と group

📄 `angular/adev/src/content/guide/animations/migration.md` L214–252 （▶ の行: 216, 218, 222, 242, 246–248, 252）

````md
214 │ ### Targeting specific elements
215 │ 
216 ▶ In the animations package, you could target specific elements by using the `query()` function to find specific elements by a CSS class name, similar to [`document.querySelector()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/querySelector). This is unnecessary in a native CSS animation world. Instead, you can use your CSS selectors to target sub-classes and apply any desired `transform` or `animation`.
217 │ 
218 ▶ To toggle classes for child nodes within a template, you can use class and style bindings to add the animations at the right points.
219 │ 
220 │ ### Stagger()
221 │ 
222 ▶ The `stagger()` function allowed you to delay the animation of each item in a list of items by a specified time to create a cascade effect. You can replicate this behavior in native CSS by utilizing `animation-delay` or `transition-delay`. Here is an example of what that CSS might look like.
223 │ 
224 │ #### With Animations Package {#stagger-with-animations-package}
225 │ 
226 │ <docs-code-multifile>
227 │     <docs-code header="stagger.ts" path="adev/src/content/examples/animations/src/app/animations-package/stagger.ts" />
228 │     <docs-code header="stagger.html" path="adev/src/content/examples/animations/src/app/animations-package/stagger.html" />
229 │     <docs-code header="stagger.css" path="adev/src/content/examples/animations/src/app/animations-package/stagger.css" />
230 │ </docs-code-multifile>
231 │ 
232 │ #### With Native CSS {#stagger-with-native-css}
233 │ 
234 │ <docs-code-multifile preview path="adev/src/content/examples/animations/src/app/native-css/stagger.ts">
235 │     <docs-code header="stagger.ts" path="adev/src/content/examples/animations/src/app/native-css/stagger.ts" />
236 │     <docs-code header="stagger.html" path="adev/src/content/examples/animations/src/app/native-css/stagger.html" />
237 │     <docs-code header="stagger.css" path="adev/src/content/examples/animations/src/app/native-css/stagger.css" />
238 │ </docs-code-multifile>
239 │ 
240 │ ### Parallel Animations
241 │ 
242 ▶ The animations package has a `group()` function to play multiple animations at the same time. In CSS, you have full control over animation timing. If you have multiple animations defined, you can apply all of them at once.
243 │ 
244 │ ```css
245 │ .target-element {
246 ▶   animation:
247 ▶     rotate 3s,
248 ▶     fade-in 2s;
249 │ }
250 │ ```
251 │ 
252 ▶ In this example, the `rotate` and `fade-in` animations fire at the same time.
````

1. **216〜218 行目 query() は CSS の選択子**

   `query('.item', …)` で子を探して動かしていたことは、CSS の選択子（`.parent .item`）と、子のクラスやスタイルのバインディングで書きます。
2. **222 行目 stagger() は遅れ**

   「1 つずつずらす」は `animation-delay` か `transition-delay` で書きます。
3. **242〜252 行目 group() は並べるだけ**

   246〜248 行目のように 1 つの `animation` に 2 つを並べると同時に始まります。`animate.leave` は、その要素のアニメーションのうち**いちばん長いもの**の終わりを待ちます（[第 6 回](06-animations-longest.md)）。

📄 `angular/adev/src/content/examples/animations/src/app/animations-package/stagger.ts` L1–24 （▶ の行: 12–15, 22）

```ts
 1 │ // #docplaster
 2 │ // #docregion
 3 │ import {Component, HostBinding, signal} from '@angular/core';
 4 │ import {trigger, transition, animate, style, query, stagger} from '@angular/animations';
 5 │ 
 6 │ @Component({
 7 │   selector: 'app-stagger',
 8 │   templateUrl: 'stagger.html',
 9 │   styleUrls: ['stagger.css'],
10 │   animations: [
11 │     trigger('pageAnimations', [
12 ▶       transition(':enter', [
13 ▶         query('.item', [
14 ▶           style({opacity: 0, transform: 'translateY(-10px)'}),
15 ▶           stagger(200, [animate('500ms ease-in', style({opacity: 1, transform: 'none'}))]),
16 │         ]),
17 │       ]),
18 │     ]),
19 │   ],
20 │ })
21 │ export class Stagger {
22 ▶   @HostBinding('@pageAnimations')
23 │   items = [1, 2, 3];
24 │ }
```

📄 `angular/adev/src/content/examples/animations/src/app/native-css/stagger.html` L1–12 （▶ の行: 5, 7–8）

```html
 1 │ <!-- #docplaster -->
 2 │ <h1>Stagger Example</h1>
 3 │ <button type="button" class="toggle-btn" (click)="refresh()">Refresh</button>
 4 │ <div class="items-container">
 5 ▶   @if (show()) {
 6 │     <ul class="items">
 7 ▶       @for (item of items; track $index) {
 8 ▶         <li class="item" style="--index: {{ $index }}">{{ item }}</li>
 9 │       }
10 │     </ul>
11 │   }
12 │ </div>
```

📄 `angular/adev/src/content/examples/animations/src/app/native-css/stagger.css` L5–20 （▶ の行: 14, 16–19）

```css
 5 │ .items {
 6 │   list-style: none;
 7 │   padding: 0;
 8 │   margin: 0;
 9 │ }
10 │ 
11 │ .items .item {
12 │   transition-property: opacity, transform;
13 │   transition-duration: 500ms;
14 ▶   transition-delay: calc(200ms * var(--index));
15 │ 
16 ▶   @starting-style {
17 ▶     opacity: 0;
18 ▶     transform: translateX(-10px);
19 ▶   }
20 │ }
```

1. **旧（stagger.ts 12〜15・22 行目）**

   ホスト要素の `@pageAnimations`（22 行目の `@HostBinding`）が `:enter` したとき、13 行目の `query('.item')` で子を集め、15 行目の `stagger(200, …)` で 200ms ずつずらして `opacity` と `transform` を動かします。
2. **新（stagger.html 8 行目・stagger.css 14 行目）**

   8 行目で `@for` の `$index` を CSS のカスタムプロパティ `--index` に入れ、css の 14 行目の `transition-delay: calc(200ms * var(--index))` で 1 つずつずらします。16〜19 行目の `@starting-style` が入る前の見た目です。`@starting-style` は要素が DOM に入るときにしか効かないので、例のコンポーネントの `refresh()` は一度 `show` を `false` にして 10ms 後に `true` に戻しています（native-css/stagger.ts）。

### デモ：前から入り、後ろから出る

#71703 の報告者の `fadeItemsParent` は、`:enter` で `stagger(100, …)`、`:leave` で `stagger(-100, …)`（後ろから）です。同じ形を、`animate.enter` / `animate.leave` と `$index` で書くとこうなります。

📄 `旧 DSL（文字列で見せるだけ）`

```
// 旧: 入るときは前から、出るときは後ろから（#71703 の fadeItemsParent と同じ形）
trigger('list', [
  transition(':enter', [
    query('.item', [
      style({opacity: 0, transform: 'translateX(-12px)'}),
      stagger(120, animate('400ms ease-out', style({opacity: 1, transform: 'none'}))),
    ], {optional: true}),
  ]),
  transition(':leave', [
    query('.item', [
      stagger(-120, animate('300ms ease-in', style({opacity: 0, transform: 'translateX(12px)'}))),
    ], {optional: true}),
  ]),
])
```

📄 `CSS + animate.enter / animate.leave（このページで動いている）`

```
// 新: 1 つずつに animate.enter / animate.leave と、$index から作る遅れ
@if (listShown()) {
  <ul id="am-list" class="am-list">
    @for (item of items; track item) {
      <li class="am-item" [style.--i]="$index" [style.--n]="items.length"
          animate.enter="am-item-in" animate.leave="am-item-out">{{ item }}</li>
    }
  </ul>
}

.am-item-in  { animation: am-item-in 400ms ease-out both;  animation-delay: calc(var(--i) * 120ms); }
.am-item-out { animation: am-item-out 300ms ease-in both; animation-delay: calc((var(--n) - 1 - var(--i)) * 120ms); }
```

> **🧪 DEMO — @for と $index で stagger（本物）**
>
> 各 `<li>` に `animate.enter` と `animate.leave` を書き、遅れは `[style.--i]="$index"` と `[style.--n]="items.length"` から CSS で計算しています。記録は上のデモと同じログに出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-migration)

- 「リストを出す」では、`.am-item-in` が付いている `<li>` が 5 → 4 → … → 0 と、およそ 120ms おきに減っていきます（2026-11-01 に Chrome で、436・553・670・786・901ms でした）。core は各 `<li>` のいちばん長いアニメーション（遅れを含む）の終わりで、その要素の enter のクラスを外します（[第 5 回](05-animations-enter-classes.md)）。
- 「リストを消す」では、`<ul>` には `animate.leave` が無いのに、5 つの `<li>` の leave が全部終わるまで「DOM に残っている要素: 5」のままで、最後にまとめて外れます（同じ日に Chrome で約 800ms。300ms + 4 × 120ms の遅れと合う）。`@if` のビューを外すとき、core は同じコンポーネントのテンプレートの中の `@for` のビューの leave も集めて待つからです（[第 11 回](11-animations-leave-nested.md)の `collectNestedViewAnimations`）。

> [!WARNING]
> **ハマりどころ**
>
> 旧 DSL の `(@trigger.done)` の代わりに、親の要素で `(animationend)` を聞いても、`animate.enter` / `animate.leave` の要素のいちばん長いアニメーションの `animationend` は届きません。core がその要素の上で `event.stopPropagation()` するからです（[第 5 回](05-animations-enter-classes.md)・[第 10 回](10-animations-leave-classes.md)）。ガイドの「Animation Callbacks」の節の NOTE は「子から親へ泡立つ」ことを注意していますが、Angular が止める側の話は書かれていません。終わりを知りたいときは、その要素の上で聞くか、`(animate.leave)` の関数で `animationComplete()` を呼ぶ形（[第 7 回](07-animations-functions.md)）にします。

## 5. 親と子：animateChild は無い

📄 `angular/adev/src/content/guide/animations/migration.md` L167–190 （▶ の行: 169, 171, 186, 188, 190）

````md
167 │ ### Parent / Child Animations
168 │ 
169 ▶ Unlike the animations package, when multiple animations are specified within a given component, no animation has priority over another and nothing blocks any animation from firing. Any sequencing of animations would have to be handled by your definition of your CSS animation, using animation / transition delay, and / or using `animationend` or `transitionend` to handle adding the next css to be animated.
170 │ 
171 ▶ Child animations fire only within the same component template. In the `@angular/animations` package, parent animations could query and trigger animations in nested child components using `query()` and `animateChild()`. With `animate.leave` and native CSS animations, animations defined inside nested child component templates will not fire when a parent component removes an element or view. Only nested animations within the same Angular component template will execute. See the [Enter and Leave Animations guide](guide/animations#element-removal-order) for more information on this.
172 │ 
173 │ ### Disabling an animation or all animations
174 │ 
175 │ With native CSS animations, if you'd like to disable the animations that you've specified, you have multiple options.
176 │ 
177 │ 1. Create a custom class that forces animation and transition to `none`.
178 │ 
179 │ ```css
180 │ .no-animation {
181 │   animation: none !important;
182 │   transition: none !important;
183 │ }
184 │ ```
185 │ 
186 ▶ Applying this class to an element prevents any animation from firing on that element. You could alternatively scope this to your entire DOM or section of your DOM to enforce this behavior. However, this prevents animation events from firing. If you are awaiting animation events for element removal, this solution won't work. A workaround is to set durations to 1 millisecond instead.
187 │ 
188 ▶ 2. Use the [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) media query to ensure no animations play for users that prefer less animation.
189 │ 
190 ▶ 3. Prevent adding animation classes programatically
````

1. **169 行目 優先も止め合いも無い**

   旧エンジンでは親の遷移が子の遷移を止め、`animateChild()` で明示的に走らせる必要がありました（[第 16 回](16-animations-legacy-engine.md)）。新しい仕組みでは「どのアニメーションも他より優先されず、何も止めない」。順番は遅れか `animationend` / `transitionend` で自分で作ります。
2. **171 行目 子のコンポーネントの中は走らない**

   `animate.leave` で親が要素やビューを消すとき、走るのは**同じコンポーネントのテンプレートの中**の入れ子の leave だけで、子のコンポーネントのテンプレートの中の leave は走りません。この境界が df659b8d0cf（2026-03-12、「コンポーネントの境界で区切った入れ子の leave を入れ直す」）で決まった形で、行は[第 11 回](11-animations-leave-nested.md)で読みます。
3. **186〜190 行目 止め方**

   クラスで `animation: none` にすると leave の終わりのイベントも来なくなるので、要素の削除を待っているなら 1ms にする、と 186 行目が注意しています。止め方の仕組みは[第 8 回](08-animations-disabled.md)です。

## 6. AnimationPlayer → Element.getAnimations()

📄 `angular/adev/src/content/guide/animations/migration.md` L274–282 （▶ の行: 276, 278, 282）

```md
274 │ ## Migrating usages of AnimationPlayer
275 │ 
276 ▶ The `AnimationPlayer` class allows access to an animation to do more advanced things like pause, play, restart, and finish an animation through code. All of these things can be handled natively as well.
277 │ 
278 ▶ You can retrieve animations off an element directly using [`Element.getAnimations()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations). This returns an array of every [`Animation`](https://developer.mozilla.org/en-US/docs/Web/API/Animation) on that element. You can use the `Animation` API to do much more than you could with what the `AnimationPlayer` from the animations package offered. From here you can `cancel()`, `play()`, `pause()`, `reverse()` and much more. This native API should provide everything you need to control your animations.
279 │ 
280 │ ## Route Transitions
281 │ 
282 ▶ You can use view transitions to animate between routes. See the [Route Transition Animations Guide](guide/routing/route-transition-animations) to get started.
```

276〜278 行目。`AnimationPlayer` で一時停止・再生・巻き戻しをしていたことは、`Element.getAnimations()` が返すブラウザの `Animation` で `cancel()` / `play()` / `pause()` / `reverse()` する、と書かれています。core 自身もこの `getAnimations()` で「いちばん長いアニメーション」を探しています（[第 6 回](06-animations-longest.md)）。282 行目のルートの遷移は View Transitions のガイドに送っています。

## 7. 移行の schematic はあるか

📄 `ターミナル（読むだけ）`

```
cd ~/angular-research/angular
ls packages/core/schematics/migrations/
# can-match-snapshot-required  change-detection-eager  http-xhr-backend  incremental-hydration
# model-output  output-migration  safe-optional-chaining  self-closing-tags-migration
# signal-migration  signal-queries-migration  strict-safe-navigation-narrow  strict-templates-default
ls packages/core/schematics/ng-generate/
# cleanup-unused-imports  common-to-standalone-migration  control-flow-migration  inject-migration
# ngclass-to-class-migration  ngstyle-to-style-migration  output-migration  route-lazy-loading
# router-testing-module-migration  self-closing-tags-migration  service-migration
# signal-input-migration  signal-queries-migration  signals  standalone-migration
grep -rln "animate\.enter\|animate\.leave" packages/core/schematics   # 0 件
# ../angular-main（74961c66242）の同じ 2 つのディレクトリにも animation の名前は無い
```

../angular（v22.2.0-next.7）にも ../angular-main（74961c66242）にも、`@angular/animations` から `animate.enter` / `animate.leave` へ書き換える schematic は**ありません**。schematics の中で animations に触れているのは standalone への移行（`ng-generate/standalone-migration`）だけで、`BrowserAnimationsModule` を `provideAnimations` に置き換える（standalone-bootstrap.ts）、`NoopAnimationsModule` などを重ねて import しないように除く（to-standalone.ts）、という旧パッケージの中での書き換えです。

## 8. #71703 が挙げる「足りないもの」を章に当てはめる

#71703（2026-10-28、EthanSK、ラベル `area: animations`・`needs: clarification`）は、「親子で連携する enter / leave に、振る舞いが同じ移行先ができるまで v23 で消さないでほしい」という要望です。報告者は zoneless のアプリ（Angular 22.1.8 で試している）で、親の `[@fadeItems]="step()"` が `query('@fadeItemsParent', animateChild())` で、`@switch` の各分岐の `@fadeItemsParent` を走らせる形を使っています。2025-12-07 に CSS / Web Animations で書き直そうとして、「出ていくほうのフェードが起きずに即座に消える」を何度も踏んだ記録を挙げています。

| #71703 が挙げる点 | 新しい仕組みのどこの話か | 章 |
| --- | --- | --- |
| 入れ子のコントロール（子のコンポーネント `<app-first-control>` を含む）を親から動かす | 入れ子の leave はコンポーネントの境界で止まる。子のホスト要素に直接クラスを付ければ動く（ガイド 171 行目） | [第 11 回](11-animations-leave-nested.md) |
| 前から・後ろからの stagger と、入るときの 469ms の遅れ | CSS の遅れと `$index`（4 節のデモ） | [第 6 回](06-animations-longest.md)（遅れを含む長さ） |
| 出ていくほうが「即座に消える」 | core が待つのは `animate.leave` を書いた要素（と同じテンプレートの入れ子）のアニメーションだけ。CSS だけで子を動かしても、外す要素に leave のアニメーションが無ければすぐ消える | [第 9 回](09-animations-leave-removal.md) |
| 古いビューと新しいビューの文脈を分ける・素早く切り返す | leave 中の要素の扱い、出し直し、並べ替え | [第 12 回](12-animations-leave-reorder.md) |
| 壊さずに `HIDDEN` / `VISIBLE` を切り替えるフォーム | DOM から出入りしないので enter / leave ではない。クラスのバインディングと transition（ガイド 49 行目） | — |

コメントでは JeanMeche（MEMBER）が 2 つ返しています。1 つ目は「v23 で旧アニメーションを消すことはなさそう。ドキュメントの非推奨の文言を直す」。2 つ目は、報告者の例を `animate.leave` と CSS で書き直したコンポーネントで、各分岐の `<section>` に `animate.leave="panel-leave"` を付け、`.panel-leave { animation: hold 350ms; }`（見た目は変えない 350ms のキーフレーム）と、`.panel-leave .fade-item` の 250ms のフェードを `(--n - 1 - --i) * 100ms` だけ遅らせる CSS です。

`hold` が要る理由は行で説明できます。core が終わりを待つのは `animate.leave` を書いた `<section>` 自身の `getAnimations()` と、その要素を target とする `animationend` だけで（[第 6 回](06-animations-longest.md)・[第 10 回](10-animations-leave-classes.md)）、子の `.fade-item` の CSS のアニメーションは数えません。だから子のフェードが終わるまでの長さ（250ms + 100ms）の、見た目の変わらないアニメーションを `<section>` 自身に付けて、外すのを遅らせています。2026-11-01 の時点で、最新の main の @deprecated の文言は「Intent to remove in v23」のままです。

## テストと直し方

1. **ガイドの例は誰が確かめているか**

   `adev/src/content/examples/animations/` の例は、ガイドの中で `<docs-code-multifile preview>` として動く見本で、framework の spec ではありません。書き直したあとの振る舞い（クラスが付く・外れる・要素が残る）を確かめる spec は、core の `packages/core/test/acceptance/animation_spec.ts` の `describe('animate.enter')`（995 行目、27 本）と `describe('animate.leave')`（76 行目、17 本）にあります。数えたコマンドは[第 19 回](19-animations-testing.md)です。
2. **手元で確かめるなら**

   この章のデモは、このサイト（@angular/core 22.1.6）の上の本物です。ブラウザで動きを見て、仕組みを確かめたいときは `acceptance_web_chromium`（2743 本、6.8s。第 19 回）に、自分の作業コピーで同じ形の it を足します（私たちは ../angular を変えないので試していない）。jsdom の ng test では `animate.enter` / `animate.leave` が何もしないので、移行後の見た目は確かめられません（第 19 回の表）。
3. **直すとしたら**

   「ガイドに params / AnimationBuilder の節が無い」はドキュメントの話で、ファイルは `adev/src/content/guide/animations/migration.md` です。#71703 は JeanMeche が「非推奨の文言を直す」と書いた段階で、`needs: clarification` が付いています。読むときは、上の表のように「どの章の、どの行の振る舞いの話か」を分けておくと、ドキュメントで足りる話と、仕組みの足りない話を区別できます（[第 20 回](20-animations-issues.md)）。

## 聞かれそうな質問

**Q. state() は何に置き換えるのですか？**

CSS のクラスです（migration.md 43・49 行目）。`[class.open]="isOpen()"` のようにクラスを付け外しし、`.open` と元の状態の間を `transition` で動かします。要素は DOM に残ったままなので、`animate.enter` / `animate.leave` は使いません。`animate.*` が受け持つのは「DOM に入る瞬間」と「DOM から出る瞬間」だけです。

**Q. AnimationBuilder の代わりは何ですか？**

ガイドには節がありません（`grep` で 0 件）。いちばん近いのは 274〜282 行目の `AnimationPlayer` の節で、`element.animate(...)` で作る Web Animations API の `Animation` と `Element.getAnimations()` を直接使います。要素を消す前にそれを待ちたいなら、`(animate.leave)` の関数で動かして、終わったら `animationComplete()` を呼びます（[第 7 回](07-animations-functions.md)）。

**Q. v23 までに何をすればよいですか？**

../angular と最新の main の @deprecated には「Intent to remove in v23」とありますが、#71703 で JeanMeche が「v23 で消すことはなさそう」と返し、文言を直すと書いています（2026-10-28）。移行の schematic はありません（7 節）。急いで全部を書き直すより、(1) 同じコンポーネントに両方を書かない（`NG2027`。[第 17 回](17-animations-legacy-compat.md)）、(2) `:enter` / `:leave` と `state` だけのものから 2 節・1 節の形に移す、(3) `query` + `animateChild` で子のコンポーネントを動かしているものは、子のホスト要素に直接 `animate.leave` を付けられるかを先に確かめる、の順が、行から言えることです。

**Q. stagger の遅れは animate.leave のときも待ってくれますか？**

待ちます。各 `<li>` の `animation-delay` は、その要素のアニメーションの長さに含めて「いちばん長いもの」を決めるので（[第 6 回](06-animations-longest.md)）、4 節のデモでは後ろの要素から順に出ていき、全部の leave が終わってから `<ul>` ごと外れました。

## 読み終えて

- ガイドの方針は「trigger と state は CSS のクラス、時間は CSS のプロパティ、`:enter` / `:leave` は `animate.enter` / `animate.leave`」。
- `stagger` は `$index` とカスタムプロパティと遅れで書ける。後ろからは `(n - 1 - i)`。このページのデモが本物。
- `animateChild` の代わりは無く、入れ子の leave は同じコンポーネントのテンプレートの中だけ（第 11 回）。core が待つのは `animate.leave` を書いた要素のアニメーション。
- `params` と `AnimationBuilder` の節はガイドに無い。移行の schematic も無い。
- #71703 で「v23 で消すことはなさそう」と返事があったが、2026-11-01 の main の @deprecated はまだ「Intent to remove in v23」。

---

← 前: [2 つが同居するとき：旧エンジンのレンダラーと animate.leave](17-animations-legacy-compat.md)  
次: [アニメーションのテスト：ブラウザでしか確かめられないもの](19-animations-testing.md) →
