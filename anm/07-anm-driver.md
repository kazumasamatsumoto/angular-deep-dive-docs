[目次](../README.md) › [animations の説明文の読み残し](README.md) › 第 7 回 / 全 9 回

# Web Animations のドライバーとスタイルの小道具

> render/web\_animations/\*・animation\_driver.ts・special\_cased\_styles.ts・shared.ts・util.ts・style\_normalization・error\_helpers.ts の未読の行：AnimationDriver の約束、Web Animations で動かせるプロパティ、単位の補い、display と position の扱い、WebAnimationsPlayer の reset、エラーの文。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/anm-driver)

---

この章で分かること：旧エンジンが Web Animations API に渡す直前の部品です。公開の `AnimationDriver` と `NoopAnimationDriver` の説明文、`WebAnimationsDriver` の確かめ（開発モードだけ）、keyframes の値に `px` を補う `WebAnimationsStyleNormalizer`、Web Animations で動かせない `display`・`position` を別に扱う `SpecialCasedStyles`、`WebAnimationsPlayer` の残りのメソッド、`util.ts` の小道具、エラーの文を読み、本物の 22.2.6 を headless Chrome で呼んだ結果と並べます。数で書いた `padding: 10` は `px` が付かずに動かないこと、`SpecialCasedStyles` の 2 回目の `finish()` と `destroy()` が説明と違うこと、`normalizeStyles` が 2 つ目以降の Map を捨てることも記録で見ます。

読む対象は `packages/animations/browser/src/` の `render/animation_driver.ts`・`render/shared.ts`・`render/special_cased_styles.ts`・`render/web_animations/`（`web_animations_driver.ts`・`web_animations_player.ts`・`animatable_props_set.ts`）・`dsl/style_normalization/`・`util.ts`・`error_helpers.ts` です（../angular、8576f161ae4）。`WebAnimationsDriver.animate` と `WebAnimationsPlayer` の init・play・finish・destroy は[旧エンジンの章](../animations/16-animations-legacy-engine.md)の 5・6 節、`beforeDestroy` は[前回](06-anm-engine.md)の 5 節、プレイヤーの約束そのもの（`AnimationPlayer`）は[第 3 回](03-anm-builder-players.md)です。

1. [1. trigger・state・style・animate](01-anm-trigger-state.md)
2. [2. transition・query・stagger](02-anm-transition-query.md)
3. [3. AnimationBuilder とプレイヤー](03-anm-builder-players.md)
4. [4. DSL を AST に](04-anm-ast.md)
5. [5. タイムライン](05-anm-timeline.md)
6. [6. 遷移のエンジン](06-anm-engine.md)
7. **7. Web Animations のドライバー**（この章）
8. [8. provideAnimations](08-anm-module.md)
9. [9. spec と issue](09-anm-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> ドライバー（driver）は、エンジンと画面の間の差し替えられる部品です。「この要素は親に含まれるか」「この CSS の名前はあるか」「計算済みのスタイルは何か」「この keyframes で動かして」をエンジンに答えます。`provideAnimations()` では `WebAnimationsDriver`、`provideNoopAnimations()` では `NoopAnimationDriver` が入ります（[旧パッケージの入口の章](../animations/14-animations-legacy-setup.md)の 1 節）。DEMO は、npm から取った本物の 22.2.6 のこれらのクラスを手元の headless Chrome で直接呼んだ記録の再生です。

## 1. AnimationDriver と NoopAnimationDriver の説明文

📄 `angular/packages/animations/browser/src/render/animation_driver.ts` L75–110 （▶ の行: 78, 80, 82, 84, 86, 88, 92–93, 95, 99, 101, 108）

```ts
 75 │ /**
 76 │  * @publicApi
 77 │  *
 78 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
 79 │  */
 80 ▶ export abstract class AnimationDriver {
 81 │   /**
 82 ▶    * @deprecated Use the NoopAnimationDriver class.
 83 │    */
 84 ▶   static NOOP: AnimationDriver = /* @__PURE__ */ new NoopAnimationDriver();
 85 │ 
 86 ▶   abstract validateStyleProperty(prop: string): boolean;
 87 │ 
 88 ▶   abstract validateAnimatableStyleProperty?: (prop: string) => boolean;
 89 │ 
 90 │   abstract containsElement(elm1: any, elm2: any): boolean;
 91 │ 
 92 ▶   /**
 93 ▶    * Obtains the parent element, if any. `null` is returned if the element does not have a parent.
 94 │    */
 95 ▶   abstract getParentElement(element: unknown): unknown;
 96 │ 
 97 │   abstract query(element: any, selector: string, multi: boolean): any[];
 98 │ 
 99 ▶   abstract computeStyle(element: any, prop: string, defaultValue?: string): string;
100 │ 
101 ▶   abstract animate(
102 │     element: any,
103 │     keyframes: Array<Map<string, string | number>>,
104 │     duration: number,
105 │     delay: number,
106 │     easing?: string | null,
107 │     previousPlayers?: any[],
108 ▶     scrubberAccessRequested?: boolean,
109 │   ): any;
110 │ }
```

公開の抽象クラスで、80 行目の上に 78 行目の非推奨（v20.2）が付いています。説明があるのは 82 行目と 92〜93 行目だけです。82 行目の「`NOOP` は非推奨。`NoopAnimationDriver` を使う」は 0598613950c（2023-09-21、``refactor(animations): deprecation of `AnimationDriver.NOOP` (#51843)``）からです。88 行目の `validateAnimatableStyleProperty` は `?` の付いた省ける関数で、エンジンは「あれば使う」（transition\_factory の L171）。108 行目の `scrubberAccessRequested` は AnimationBuilder の側だけが `true` を渡す印です（[前回](06-anm-engine.md)の 11 節、timeline\_animation\_engine.ts L77）。

📄 `angular/packages/animations/browser/src/render/animation_driver.ts` L13–50 （▶ の行: 16, 18, 22–23, 25–26, 30–31, 37–38, 40–41, 44–46, 48–49）

```ts
13 │ /**
14 │  * @publicApi
15 │  *
16 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
17 │  *
18 ▶  * `AnimationDriver` implentation for Noop animations
19 │  */
20 │ @Injectable()
21 │ export class NoopAnimationDriver implements AnimationDriver {
22 ▶   /**
23 ▶    * @returns Whether `prop` is a valid CSS property
24 │    */
25 ▶   validateStyleProperty(prop: string): boolean {
26 ▶     return validateStyleProperty(prop);
27 │   }
28 │ 
29 │   /**
30 ▶    *
31 ▶    * @returns Whether elm1 contains elm2.
32 │    */
33 │   containsElement(elm1: any, elm2: any): boolean {
34 │     return containsElement(elm1, elm2);
35 │   }
36 │ 
37 ▶   /**
38 ▶    * @returns Rhe parent of the given element or `null` if the element is the `document`
39 │    */
40 ▶   getParentElement(element: unknown): unknown {
41 ▶     return getParentElement(element);
42 │   }
43 │ 
44 ▶   /**
45 ▶    * @returns The result of the query selector on the element. The array will contain up to 1 item
46 ▶    *     if `multi` is  `false`.
47 │    */
48 ▶   query(element: any, selector: string, multi: boolean): any[] {
49 ▶     return invokeQuery(element, selector, multi);
50 │   }
```

📄 `angular/packages/animations/browser/src/render/animation_driver.ts` L51–73 （▶ の行: 52–53, 55–56, 59–60, 69, 71）

```ts
51 │ 
52 ▶   /**
53 ▶    * @returns The `defaultValue` or empty string
54 │    */
55 ▶   computeStyle(element: any, prop: string, defaultValue?: string): string {
56 ▶     return defaultValue || '';
57 │   }
58 │ 
59 ▶   /**
60 ▶    * @returns An `NoopAnimationPlayer`
61 │    */
62 │   animate(
63 │     element: any,
64 │     keyframes: Array<Map<string, string | number>>,
65 │     duration: number,
66 │     delay: number,
67 │     easing: string,
68 │     previousPlayers: any[] = [],
69 ▶     scrubberAccessRequested?: boolean,
70 │   ): AnimationPlayer {
71 ▶     return new NoopAnimationPlayer(duration, delay);
72 │   }
73 │ }
```

`NoopAnimationDriver` は 71 行目で `NoopAnimationPlayer`（動かずにすぐ終わる。第 3 回）を返します。56 行目の `computeStyle` は 53 行目の説明どおり `defaultValue || ''` で、DEMO の「ドライバーの小道具」で `''` と `'*'` でした。18 行目の「implentation」と 38 行目の「Rhe」は字の誤りです。38 行目の「要素が `document` なら `null`」と、93 行目の「親が無ければ `null`」は、実物と少し違います。2 節の shared.ts の 159〜165 行目は「親が `<html>` なら `null`」なので、DEMO で `getParentElement(document.body)` は親（`<html>`）があるのに `null`、`getParentElement(<html>)` は `#document` でした。25〜27 行目の `validateStyleProperty` は、Noop のほうは本番でも確かめます（DEMO で本番の `'fooBar'` は Noop が `false`、WebAnimationsDriver が `true`）。

## 2. WebAnimationsDriver：確かめるのは開発モードだけ

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_driver.ts` L29–61 （▶ の行: 31–33, 35, 38, 40–42, 44, 51–52, 59–60）

```ts
29 │ export class WebAnimationsDriver implements AnimationDriver {
30 │   validateStyleProperty(prop: string): boolean {
31 ▶     // Perform actual validation in dev mode only, in prod mode this check is a noop.
32 ▶     if (typeof ngDevMode === 'undefined' || ngDevMode) {
33 ▶       return validateStyleProperty(prop);
34 │     }
35 ▶     return true;
36 │   }
37 │ 
38 ▶   validateAnimatableStyleProperty(prop: string): boolean {
39 │     // Perform actual validation in dev mode only, in prod mode this check is a noop.
40 ▶     if (typeof ngDevMode === 'undefined' || ngDevMode) {
41 ▶       const cssProp = camelCaseToDashCase(prop);
42 ▶       return validateWebAnimatableStyleProperty(cssProp);
43 │     }
44 ▶     return true;
45 │   }
46 │ 
47 │   containsElement(elm1: any, elm2: any): boolean {
48 │     return containsElement(elm1, elm2);
49 │   }
50 │ 
51 ▶   getParentElement(element: unknown): unknown {
52 ▶     return getParentElement(element);
53 │   }
54 │ 
55 │   query(element: any, selector: string, multi: boolean): any[] {
56 │     return invokeQuery(element, selector, multi);
57 │   }
58 │ 
59 ▶   computeStyle(element: any, prop: string, defaultValue?: string): string {
60 ▶     return computeStyle(element, prop);
61 │   }
```

📄 `angular/packages/animations/browser/src/render/shared.ts` L156–195 （▶ の行: 156–157, 160–162, 168–170, 176–178, 182–186, 194）

```ts
156 ▶ const documentElement: HTMLElement | null = /* @__PURE__ */ (() =>
157 ▶   typeof document === 'undefined' ? null : document.documentElement)();
158 │ 
159 │ export function getParentElement(element: any): unknown | null {
160 ▶   const parent = element.parentNode || element.host || null; // consider host to support shadow DOM
161 ▶   if (parent === documentElement) {
162 ▶     return null;
163 │   }
164 │   return parent;
165 │ }
166 │ 
167 │ function containsVendorPrefix(prop: string): boolean {
168 ▶   // Webkit is the only real popular vendor prefix nowadays
169 ▶   // cc: http://shouldiprefix.com/
170 ▶   return prop.substring(1, 6) == 'ebkit'; // webkit or Webkit
171 │ }
172 │ 
173 │ let _CACHED_BODY: {style: any} | null = null;
174 │ let _IS_WEBKIT = false;
175 │ export function validateStyleProperty(prop: string): boolean {
176 ▶   if (!_CACHED_BODY) {
177 ▶     _CACHED_BODY = getBodyNode() || {};
178 ▶     _IS_WEBKIT = _CACHED_BODY!.style ? 'WebkitAppearance' in _CACHED_BODY!.style : false;
179 │   }
180 │ 
181 │   let result = true;
182 ▶   if (_CACHED_BODY!.style && !containsVendorPrefix(prop)) {
183 ▶     result = prop in _CACHED_BODY!.style;
184 ▶     if (!result && _IS_WEBKIT) {
185 ▶       const camelProp = 'Webkit' + prop.charAt(0).toUpperCase() + prop.slice(1);
186 ▶       result = camelProp in _CACHED_BODY!.style;
187 │     }
188 │   }
189 │ 
190 │   return result;
191 │ }
192 │ 
193 │ export function validateWebAnimatableStyleProperty(prop: string): boolean {
194 ▶   return ANIMATABLE_PROP_SET.has(prop);
195 │ }
```

📄 `angular/packages/animations/browser/src/render/web_animations/animatable_props_set.ts` L9–24 （▶ の行: 10, 12, 14）

```ts
 9 │ /**
10 ▶  * Set of all animatable CSS properties
11 │  *
12 ▶  * @see https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animated_properties
13 │  */
14 ▶ export const ANIMATABLE_PROP_SET = new Set([
15 │   '-moz-outline-radius',
16 │   '-moz-outline-radius-bottomleft',
17 │   '-moz-outline-radius-bottomright',
18 │   '-moz-outline-radius-topleft',
19 │   '-moz-outline-radius-topright',
20 │   '-ms-grid-columns',
21 │   '-ms-grid-rows',
22 │   '-webkit-line-clamp',
23 │   '-webkit-text-fill-color',
24 │   '-webkit-text-stroke',
```

1. **31〜35 行目・39〜44 行目：本番では何でも true**

   31 行目と 39 行目のコメント「本当に確かめるのは開発モードだけ。本番では何もしない」。DEMO の本番では `'fooBar'` も `true` で、知らないプロパティの警告（[第 4 回](04-anm-ast.md)）も出ません。
2. **182〜187 行目：body の style に、その名前があるか**

   176〜178 行目で `document.body` を 1 回だけ覚え、182 行目、`ebkit` で始まる名前（168〜170 行目のコメント「今どき広く使われる接頭辞は Webkit だけ」）は確かめずに通します。無ければ 185 行目で `Webkit` を付けてもう 1 回見ます。
3. **41〜42 行目 → 194 行目：動かせるプロパティの表**

   名前を `camelCaseToDashCase` で `aspect-ratio` の形にしてから、animatable\_props\_set.ts の Set（12 行目の MDN の一覧。199 個）を引きます。この表は 79d334b1385（2022-02-27、`feat(animations): provide warnings for non-animatable CSS properties (#45212)`）から 1 つも変わっていません。

DEMO の「Web Animations で動かせるか」で、表に無い `aspect-ratio` は Chrome 157 では途中の値（25% で `1.31607 / 1`）を持って動き、`position`・`overflow`・`cursor` は 50% で切り替わる形で動きました。表に無いプロパティの値が keyframes の間で変わると、開発モードではエンジンが「動かせないプロパティを動かそうとしている」と警告します（animation\_transition\_factory.ts L166〜215）。`display` は Chrome でも動きませんでした（`none` → `block` の 25% で `block`）。DEMO の「エンジンを通すと」で、`aspectRatio`・`position`・`padding` を動かす trigger を本物のエンジンに通すと、開発モードでは「not animatable properties: aspectRatio, position」の警告が出て、それでも 500ms の時点で `aspect-ratio` は `1.73205 / 1`、`position` は `absolute` でした（inline は 4 節の `position: static` なのに、keyframes の値が勝つ）。`padding: 10` は、渡った最後の keyframe から消えていて（3 節）、`0px` のままでした。本番では警告は出ず、ほかは同じでした。

📄 `angular/packages/animations/browser/src/render/shared.ts` L197–229 （▶ の行: 204–206, 209, 214–216, 218–219, 222, 225）

```ts
197 │ export function getBodyNode(): any | null {
198 │   if (typeof document != 'undefined') {
199 │     return document.body;
200 │   }
201 │   return null;
202 │ }
203 │ 
204 ▶ export function containsElement(elm1: any, elm2: any): boolean {
205 ▶   while (elm2) {
206 ▶     if (elm2 === elm1) {
207 │       return true;
208 │     }
209 ▶     elm2 = getParentElement(elm2);
210 │   }
211 │   return false;
212 │ }
213 │ 
214 ▶ export function invokeQuery(element: any, selector: string, multi: boolean): any[] {
215 ▶   if (multi) {
216 ▶     return Array.from(element.querySelectorAll(selector));
217 │   }
218 ▶   const elem = element.querySelector(selector);
219 ▶   return elem ? [elem] : [];
220 │ }
221 │ 
222 ▶ export function hypenatePropsKeys(original: ɵStyleDataMap): ɵStyleDataMap {
223 │   const newMap: ɵStyleDataMap = new Map();
224 │   original.forEach((val, prop) => {
225 ▶     const newProp = prop.replace(/([a-z])([A-Z])/g, '$1-$2');
226 │     newMap.set(newProp, val);
227 │   });
228 │   return newMap;
229 │ }
```

204〜212 行目の `containsElement` は、1 つ目の要素に当たるまで 2 節の `getParentElement` で上にたどります。160 行目で shadow root の `host` もたどるので、DEMO で shadow DOM の中の span は body に含まれました（web\_animations\_driver\_spec.ts の L28〜29 の it と同じ）。ただし `<html>` まで来ると止まるので、`containsElement(<html>, body)` は `false` でした。222〜229 行目の `hypenatePropsKeys`（綴りは hyphenate の誤り）は、packages/animations の中で読む行がありません（grep で定義の 1 件だけ）。

## 3. keyframes をドライバーに渡す前：normalizeKeyframes と px の補い

📄 `angular/packages/animations/browser/src/render/shared.ts` L23–47 （▶ の行: 23, 25–28, 30, 34, 37–38, 42, 44–47）

```ts
23 ▶ export function optimizeGroupPlayer(players: AnimationPlayer[]): AnimationPlayer {
24 │   switch (players.length) {
25 ▶     case 0:
26 ▶       return new NoopAnimationPlayer();
27 ▶     case 1:
28 ▶       return players[0];
29 │     default:
30 ▶       return new ɵAnimationGroupPlayer(players);
31 │   }
32 │ }
33 │ 
34 ▶ export function normalizeKeyframes(
35 │   normalizer: AnimationStyleNormalizer,
36 │   keyframes: Array<ɵStyleDataMap>,
37 ▶   preStyles: ɵStyleDataMap = new Map(),
38 ▶   postStyles: ɵStyleDataMap = new Map(),
39 │ ): Array<ɵStyleDataMap> {
40 │   const errors: Error[] = [];
41 │   const normalizedKeyframes: Array<ɵStyleDataMap> = [];
42 ▶   let previousOffset = -1;
43 │   let previousKeyframe: ɵStyleDataMap | null = null;
44 ▶   keyframes.forEach((kf) => {
45 ▶     const offset = kf.get('offset') as number;
46 ▶     const isSameOffset = offset == previousOffset;
47 ▶     const normalizedKeyframe: ɵStyleDataMap = (isSameOffset && previousKeyframe) || new Map();
```

📄 `angular/packages/animations/browser/src/render/shared.ts` L48–85 （▶ の行: 51–52, 54–55, 58–59, 63, 74–75, 80–81）

```ts
48 │     kf.forEach((val, prop) => {
49 │       let normalizedProp = prop;
50 │       let normalizedValue = val;
51 ▶       if (prop !== 'offset') {
52 ▶         normalizedProp = normalizer.normalizePropertyName(normalizedProp, errors);
53 │         switch (normalizedValue) {
54 ▶           case PRE_STYLE:
55 ▶             normalizedValue = preStyles.get(prop)!;
56 │             break;
57 │ 
58 ▶           case AUTO_STYLE:
59 ▶             normalizedValue = postStyles.get(prop)!;
60 │             break;
61 │ 
62 │           default:
63 ▶             normalizedValue = normalizer.normalizeStyleValue(
64 │               prop,
65 │               normalizedProp,
66 │               normalizedValue,
67 │               errors,
68 │             );
69 │             break;
70 │         }
71 │       }
72 │       normalizedKeyframe.set(normalizedProp, normalizedValue);
73 │     });
74 ▶     if (!isSameOffset) {
75 ▶       normalizedKeyframes.push(normalizedKeyframe);
76 │     }
77 │     previousKeyframe = normalizedKeyframe;
78 │     previousOffset = offset;
79 │   });
80 ▶   if (errors.length) {
81 ▶     throw animationFailed(errors);
82 │   }
83 │ 
84 │   return normalizedKeyframes;
85 │ }
```

エンジンが timeline の命令からプレイヤーを作る直前（transition\_animation\_engine.ts の L1565〜1570）に、この関数で keyframes を整えます。46〜47 行目、同じ offset の keyframe は 1 つにまとめます（[旧 DSL の章](../animations/15-animations-legacy-dsl.md)の 1ms ずらしとは別で、まったく同じ offset のときだけ）。54〜60 行目で `!` と `*` を前回の 8 節で計算した値に替え、それ以外は 63 行目でノーマライザーに渡し、溜まったエラーは 81 行目で NG03502 にまとめて投げます。23〜32 行目の `optimizeGroupPlayer` は、0 個なら `NoopAnimationPlayer`、1 個ならそのもの、2 個以上なら `AnimationGroupPlayer` です。

📄 `angular/packages/animations/browser/src/dsl/style_normalization/animation_style_normalizer.ts` L9–32 （▶ の行: 9–11, 19–21, 30）

```ts
 9 ▶ export abstract class AnimationStyleNormalizer {
10 ▶   abstract normalizePropertyName(propertyName: string, errors: Error[]): string;
11 ▶   abstract normalizeStyleValue(
12 │     userProvidedProperty: string,
13 │     normalizedProperty: string,
14 │     value: string | number,
15 │     errors: Error[],
16 │   ): string;
17 │ }
18 │ 
19 ▶ export class NoopAnimationStyleNormalizer {
20 ▶   normalizePropertyName(propertyName: string, errors: Error[]): string {
21 ▶     return propertyName;
22 │   }
23 │ 
24 │   normalizeStyleValue(
25 │     userProvidedProperty: string,
26 │     normalizedProperty: string,
27 │     value: string | number,
28 │     errors: Error[],
29 │   ): string {
30 ▶     return <any>value;
31 │   }
32 │ }
```

📄 `angular/packages/animations/browser/src/dsl/style_normalization/web_animations_style_normalizer.ts` L13–43 （▶ の行: 13–14, 20, 24, 27, 31, 35, 41–42）

```ts
13 ▶ const DIMENSIONAL_PROP_SET = new Set([
14 ▶   'width',
15 │   'height',
16 │   'minWidth',
17 │   'minHeight',
18 │   'maxWidth',
19 │   'maxHeight',
20 ▶   'left',
21 │   'top',
22 │   'bottom',
23 │   'right',
24 ▶   'fontSize',
25 │   'outlineWidth',
26 │   'outlineOffset',
27 ▶   'paddingTop',
28 │   'paddingLeft',
29 │   'paddingBottom',
30 │   'paddingRight',
31 ▶   'marginTop',
32 │   'marginLeft',
33 │   'marginBottom',
34 │   'marginRight',
35 ▶   'borderRadius',
36 │   'borderWidth',
37 │   'borderTopWidth',
38 │   'borderLeftWidth',
39 │   'borderRightWidth',
40 │   'borderBottomWidth',
41 ▶   'textIndent',
42 ▶   'perspective',
43 │ ]);
```

📄 `angular/packages/animations/browser/src/dsl/style_normalization/web_animations_style_normalizer.ts` L45–71 （▶ の行: 46–47, 56–57, 59–61, 63–65, 69）

```ts
45 │ export class WebAnimationsStyleNormalizer extends AnimationStyleNormalizer {
46 ▶   override normalizePropertyName(propertyName: string, errors: Error[]): string {
47 ▶     return dashCaseToCamelCase(propertyName);
48 │   }
49 │ 
50 │   override normalizeStyleValue(
51 │     userProvidedProperty: string,
52 │     normalizedProperty: string,
53 │     value: string | number,
54 │     errors: Error[],
55 │   ): string {
56 ▶     let unit: string = '';
57 ▶     const strVal = value.toString().trim();
58 │ 
59 ▶     if (DIMENSIONAL_PROP_SET.has(normalizedProperty) && value !== 0 && value !== '0') {
60 ▶       if (typeof value === 'number') {
61 ▶         unit = 'px';
62 │       } else {
63 ▶         const valAndSuffixMatch = value.match(/^[+-]?[\d\.]+([a-z]*)$/);
64 ▶         if (valAndSuffixMatch && valAndSuffixMatch[1].length == 0) {
65 ▶           errors.push(invalidCssUnitValue(userProvidedProperty, value));
66 │         }
67 │       }
68 │     }
69 ▶     return strVal + unit;
70 │   }
71 │ }
```

1. **47 行目：名前はキャメルケースに**

   `'font-size'` も `fontSize` になります（DEMO）。
2. **59〜61 行目：寸法の名前で、数なら px**

   13〜43 行目の 29 個の名前だけです。`width: 100` は `"100px"`、`-5` は `"-5px"`、`1.5` は `"1.5px"`、`0` と `'0'` は 59 行目の条件で何も付けません。
3. **63〜66 行目：寸法の名前で、文字列に単位が無ければエラー**

   `'100'`・`'+5'`・`'.5'`・`borderWidth: '2'` は NG03005「Please provide a CSS unit value for width:100」でした（本番は `NG03005` だけ）。`'10%'` は通ります。
4. **69 行目：それ以外は文字列にするだけ**

   表に無い `padding`・`margin`（書き分けの `paddingTop` などは表にある）・`gap`・`inset`・`letterSpacing` は、数で書いても `"10"` のままで、エラーも警告もありません。

DEMO の「補った値・補わない値を element.animate に渡すと」で、`padding: 0 → 10`（単位なし）は Chrome が値を受け付けず、途中も `0px` のまま動きませんでした（`0px → 10px` なら `5px`）。`lineHeight: 1 → 2` は単位なしが正しい値で、途中は `24px`（1.5 倍）です。つまり `style({padding: 10})` は、開発モードでも何も知らせずに、その手順だけ動きません。

## 4. display と position：keyframes の外で付ける

📄 `angular/packages/animations/browser/src/render/special_cased_styles.ts` L12–39 （▶ の行: 13–14, 16–19, 29–32, 34–35, 38）

```ts
12 │ /**
13 ▶  * Returns an instance of `SpecialCasedStyles` if and when any special (non animateable) styles are
14 ▶  * detected.
15 │  *
16 ▶  * In CSS there exist properties that cannot be animated within a keyframe animation
17 ▶  * (whether it be via CSS keyframes or web-animations) and the animation implementation
18 ▶  * will ignore them. This function is designed to detect those special cased styles and
19 ▶  * return a container that will be executed at the start and end of the animation.
20 │  *
21 │  * @returns an instance of `SpecialCasedStyles` if any special styles are detected otherwise `null`
22 │  */
23 │ export function packageNonAnimatableStyles(
24 │   element: any,
25 │   styles: ɵStyleDataMap | Array<ɵStyleDataMap>,
26 │ ): SpecialCasedStyles | null {
27 │   let startStyles: ɵStyleDataMap | null = null;
28 │   let endStyles: ɵStyleDataMap | null = null;
29 ▶   if (Array.isArray(styles) && styles.length) {
30 ▶     startStyles = filterNonAnimatableStyles(styles[0]);
31 ▶     if (styles.length > 1) {
32 ▶       endStyles = filterNonAnimatableStyles(styles[styles.length - 1]);
33 │     }
34 ▶   } else if (styles instanceof Map) {
35 ▶     startStyles = filterNonAnimatableStyles(styles);
36 │   }
37 │ 
38 ▶   return startStyles || endStyles ? new SpecialCasedStyles(element, startStyles, endStyles) : null;
39 │ }
```

📄 `angular/packages/animations/browser/src/render/special_cased_styles.ts` L106–136 （▶ の行: 107, 110–114, 116, 119–120, 134–135）

```ts
106 │ /**
107 ▶  * An enum of states reflective of what the status of `SpecialCasedStyles` is.
108 │  *
109 │  * Depending on how `SpecialCasedStyles` is interacted with, the start and end
110 ▶  * styles may not be applied in the same way. This enum ensures that if and when
111 ▶  * the ending styles are applied then the starting styles are applied. It is
112 ▶  * also used to reflect what the current status of the special cased styles are
113 ▶  * which helps prevent the starting/ending styles not be applied twice. It is
114 ▶  * also used to cleanup the styles once `SpecialCasedStyles` is destroyed.
115 │  */
116 ▶ const enum SpecialCasedStylesState {
117 │   Pending = 0,
118 │   Started = 1,
119 ▶   Finished = 2,
120 ▶   Destroyed = 3,
121 │ }
122 │ 
123 │ function filterNonAnimatableStyles(styles: ɵStyleDataMap): ɵStyleDataMap | null {
124 │   let result: ɵStyleDataMap | null = null;
125 │   styles.forEach((val, prop) => {
126 │     if (isNonAnimatableStyle(prop)) {
127 │       result = result || new Map();
128 │       result.set(prop, val);
129 │     }
130 │   });
131 │   return result;
132 │ }
133 │ 
134 ▶ function isNonAnimatableStyle(prop: string) {
135 ▶   return prop === 'display' || prop === 'position';
136 │ }
```

16〜19 行目は「CSS には keyframe のアニメーションで動かせないプロパティがあり、実装はそれを無視する。それを見つけて、アニメーションの始めと終わりに付ける入れ物を返す」。見つけるのは 134〜135 行目の `display` と `position` の 2 つだけで、30〜32 行目で最初と最後の keyframe から拾います。2 節の DEMO のとおり、Chrome 157 は `display` を keyframes では動かしませんが、`position` は 50% で切り替えて動かしました。17〜18 行目の「CSS keyframes でも web-animations でも無視される」は、`position` については今の Chrome と合いません。このファイルは a6ae759b46c（2019-02-21、``fix(animations): ensure `position` and `display` styles are handled outside of keyframes/web-animations (#28911)``）からです。

📄 `angular/packages/animations/browser/src/render/special_cased_styles.ts` L41–74 （▶ の行: 42, 44–47, 50, 60, 62, 64, 68–70, 72）

```ts
41 │ /**
42 ▶  * Designed to be executed during a keyframe-based animation to apply any special-cased styles.
43 │  *
44 ▶  * When started (when the `start()` method is run) then the provided `startStyles`
45 ▶  * will be applied. When finished (when the `finish()` method is called) the
46 ▶  * `endStyles` will be applied as well any any starting styles. Finally when
47 ▶  * `destroy()` is called then all styles will be removed.
48 │  */
49 │ export class SpecialCasedStyles {
50 ▶   static initialStylesByElement = /* @__PURE__ */ new WeakMap<any, ɵStyleDataMap>();
51 │ 
52 │   private _state = SpecialCasedStylesState.Pending;
53 │   private _initialStyles!: ɵStyleDataMap;
54 │ 
55 │   constructor(
56 │     private _element: any,
57 │     private _startStyles: ɵStyleDataMap | null,
58 │     private _endStyles: ɵStyleDataMap | null,
59 │   ) {
60 ▶     let initialStyles = SpecialCasedStyles.initialStylesByElement.get(_element);
61 │     if (!initialStyles) {
62 ▶       SpecialCasedStyles.initialStylesByElement.set(_element, (initialStyles = new Map()));
63 │     }
64 ▶     this._initialStyles = initialStyles;
65 │   }
66 │ 
67 │   start() {
68 ▶     if (this._state < SpecialCasedStylesState.Started) {
69 ▶       if (this._startStyles) {
70 ▶         setStyles(this._element, this._startStyles, this._initialStyles);
71 │       }
72 ▶       this._state = SpecialCasedStylesState.Started;
73 │     }
74 │   }
```

📄 `angular/packages/animations/browser/src/render/special_cased_styles.ts` L75–104 （▶ の行: 77–82, 84, 89–94, 96–97, 100–101）

```ts
 75 │ 
 76 │   finish() {
 77 ▶     this.start();
 78 ▶     if (this._state < SpecialCasedStylesState.Finished) {
 79 ▶       setStyles(this._element, this._initialStyles);
 80 ▶       if (this._endStyles) {
 81 ▶         setStyles(this._element, this._endStyles);
 82 ▶         this._endStyles = null;
 83 │       }
 84 ▶       this._state = SpecialCasedStylesState.Started;
 85 │     }
 86 │   }
 87 │ 
 88 │   destroy() {
 89 ▶     this.finish();
 90 ▶     if (this._state < SpecialCasedStylesState.Destroyed) {
 91 ▶       SpecialCasedStyles.initialStylesByElement.delete(this._element);
 92 ▶       if (this._startStyles) {
 93 ▶         eraseStyles(this._element, this._startStyles);
 94 ▶         this._endStyles = null;
 95 │       }
 96 ▶       if (this._endStyles) {
 97 ▶         eraseStyles(this._element, this._endStyles);
 98 │         this._endStyles = null;
 99 │       }
100 ▶       setStyles(this._element, this._initialStyles);
101 ▶       this._state = SpecialCasedStylesState.Destroyed;
102 │     }
103 │   }
104 │ }
```

1. **67〜73 行目：start で最初の値を inline に**

   70 行目の 3 つ目の引数で、上書きする前の inline の値を 60〜64 行目の WeakMap（要素ごと）に覚えます。WebAnimationsPlayer.play の 146 行目（旧エンジンの章）が呼びます。
2. **76〜86 行目：finish で元の値に戻してから最後の値**

   79 行目で覚えた値を戻し、80〜83 行目で最後の値を付けます。ところが 84 行目は `Finished` ではなく `Started` を入れるので、78 行目の「まだ Finished でなければ」は次の呼び出しでも真です。
3. **88〜103 行目：destroy で全部外す**

   89 行目で finish を呼び、92〜95 行目で最初の値を消し、100 行目で覚えた値に戻します。94 行目は `_startStyles` ではなく `_endStyles` を `null` にしています。

DEMO の「display と position」の（1）で、`play()` のあと inline が `display: inline-block; position: relative;`、`finish()` で `display: flex; position: absolute;` になり、もう一度 `finish()` を呼ぶと、79 行目がまた走って inline は空に戻りました（82 行目で最後の値は `null` 済みなので付け直さない）。44〜47 行目の「finish で最後の値を付ける」は、2 回目で崩れます。（2）は最初の keyframe が `display` だけ、最後が `position` だけの場合で、`destroy()` のあと inline に `position: absolute` が残りました。覚える（70 行目）のは最初の値のプロパティだけなので、最後にだけあるプロパティは戻す値が無いからです。47 行目の「destroy で全部外す」と違います。DSL から作る keyframes は、前回の backFill でどの keyframe にも同じプロパティがそろうので、（2）の形にはなりません。公開の `AnimationDriver` を直接使うときに起きます。この 3 か所の行は a6ae759b46c のときから同じで、最新の main（8b15295e8c7）でも変わっていません。

## 5. WebAnimationsPlayer の残り：reset・setPosition

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_player.ts` L13–47 （▶ の行: 25–29, 31, 37, 41, 43–45）

```ts
13 │ export class WebAnimationsPlayer implements AnimationPlayer {
14 │   private _onDoneFns: Function[] = [];
15 │   private _onStartFns: Function[] = [];
16 │   private _onDestroyFns: Function[] = [];
17 │   private _duration: number;
18 │   private _delay: number;
19 │   private _initialized = false;
20 │   private _finished = false;
21 │   private _started = false;
22 │   private _destroyed = false;
23 │   private _finalKeyframe?: ɵStyleDataMap;
24 │ 
25 ▶   // the following original fns are persistent copies of the _onStartFns and _onDoneFns
26 ▶   // and are used to reset the fns to their original values upon reset()
27 ▶   // (since the _onStartFns and _onDoneFns get deleted after they are called)
28 ▶   private _originalOnDoneFns: Function[] = [];
29 ▶   private _originalOnStartFns: Function[] = [];
30 │ 
31 ▶   public domPlayer: Animation | null = null;
32 │   public time = 0;
33 │ 
34 │   public parentPlayer: AnimationPlayer | null = null;
35 │   public currentSnapshot: ɵStyleDataMap = new Map();
36 │ 
37 ▶   constructor(
38 │     public element: any,
39 │     public keyframes: Array<ɵStyleDataMap>,
40 │     public options: {[key: string]: string | number},
41 ▶     private _specialStyles?: SpecialCasedStyles | null,
42 │   ) {
43 ▶     this._duration = <number>options['duration'];
44 ▶     this._delay = <number>options['delay'] || 0;
45 ▶     this.time = this._duration + this._delay;
46 │   }
47 │ 
```

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_player.ts` L121–135 （▶ の行: 122–124, 127–129, 132–133）

```ts
121 │ 
122 ▶   onStart(fn: () => void): void {
123 ▶     this._originalOnStartFns.push(fn);
124 ▶     this._onStartFns.push(fn);
125 │   }
126 │ 
127 ▶   onDone(fn: () => void): void {
128 ▶     this._originalOnDoneFns.push(fn);
129 ▶     this._onDoneFns.push(fn);
130 │   }
131 │ 
132 ▶   onDestroy(fn: () => void): void {
133 ▶     this._onDestroyFns.push(fn);
134 │   }
135 │ 
```

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_player.ts` L166–188 （▶ の行: 167–173, 177, 180–182）

```ts
166 │ 
167 ▶   reset(): void {
168 ▶     this._resetDomPlayerState();
169 ▶     this._destroyed = false;
170 ▶     this._finished = false;
171 ▶     this._started = false;
172 ▶     this._onStartFns = this._originalOnStartFns;
173 ▶     this._onDoneFns = this._originalOnDoneFns;
174 │   }
175 │ 
176 │   private _resetDomPlayerState() {
177 ▶     this.domPlayer?.cancel();
178 │   }
179 │ 
180 ▶   restart(): void {
181 ▶     this.reset();
182 ▶     this.play();
183 │   }
184 │ 
185 │   hasStarted(): boolean {
186 │     return this._started;
187 │   }
188 │ 
```

25〜27 行目のコメントは「original の配列は、reset() のときに元に戻すための写し（呼んだあとに消されるので）」。ところが 172〜173 行目は写しを作らずに**同じ配列**を代入します。reset のあと、次に呼ばれるまでの間に onDone を足すと、128 行目と 129 行目が同じ配列に 2 回 push します。DEMO の「WebAnimationsPlayer の reset と onDone」で、`reset() → onDone(B) → play() → finish()` は `A, B, B`（B が 2 回）でした。`NoopAnimationPlayer` の同じ形は[第 3 回](03-anm-builder-players.md)で見ました。入ったのは 342effeb7d4（2022-06-11、`fix(animations): reset the start and done fns on player reset (#46364)`）です。呼ばれたあとなら新しい配列になる（onStart は play の 143 行目、onDone は \_onFinish の 52 行目。どちらも旧エンジンの章）ので、`play() → restart() → onStart(B) → restart()` では B は 1 回でした。

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_player.ts` L88–104 （▶ の行: 89–91, 93, 97, 100）

```ts
 88 │   private _preparePlayerBeforeStart() {
 89 ▶     // this is required so that the player doesn't start to animate right away
 90 ▶     if (this._delay) {
 91 ▶       this._resetDomPlayerState();
 92 │     } else {
 93 ▶       this.domPlayer?.pause();
 94 │     }
 95 │   }
 96 │ 
 97 ▶   private _convertKeyframesToObject(keyframes: Array<ɵStyleDataMap>): any[] {
 98 │     const kfs: any[] = [];
 99 │     keyframes.forEach((frame) => {
100 ▶       kfs.push(Object.fromEntries(frame));
101 │     });
102 │     return kfs;
103 │   }
104 │ 
```

📄 `angular/packages/animations/browser/src/render/web_animations/web_animations_player.ts` L201–221 （▶ の行: 203–204, 207, 212–213, 215–216, 220）

```ts
201 │ 
202 │   setPosition(p: number): void {
203 ▶     if (!this.domPlayer) {
204 ▶       this.init();
205 │     }
206 │     if (this.domPlayer) {
207 ▶       this.domPlayer.currentTime = p * this.time;
208 │     }
209 │   }
210 │ 
211 │   getPosition(): number {
212 ▶     if (!this.domPlayer) {
213 ▶       return this._initialized ? 1 : 0;
214 │     }
215 ▶     // tsc is complaining with TS2362 without the conversion to number
216 ▶     return +(this.domPlayer.currentTime ?? 0) / this.time;
217 │   }
218 │ 
219 │   get totalTime(): number {
220 ▶     return this._delay + this._duration;
221 │   }
```

init のあと、89 行目のコメント「すぐに動き出さないように」で、delay があれば 91 行目で `cancel()`、無ければ 93 行目で `pause()` します。207 行目の `setPosition(p)` は `p × (duration + delay)`（45 行目の `time`）を `currentTime` にし、212〜213 行目、まだ Animation が無ければ `getPosition()` は init 済みなら 1・そうでなければ 0 です。init 済みで Animation が無いのは、`element.animate` が null か例外だったとき（旧エンジンの章の 69〜72 行目で、すぐ終わったことにする）だけです。

## 6. util.ts の小道具

📄 `angular/packages/animations/browser/src/util.ts` L29–56 （▶ の行: 31–35, 37, 43–44, 50–54）

```ts
29 │ const ONE_SECOND = 1000;
30 │ 
31 ▶ export const SUBSTITUTION_EXPR_START = '{{';
32 ▶ export const SUBSTITUTION_EXPR_END = '}}';
33 ▶ export const ENTER_CLASSNAME = 'ng-enter';
34 ▶ export const LEAVE_CLASSNAME = 'ng-leave';
35 ▶ export const NG_TRIGGER_CLASSNAME = 'ng-trigger';
36 │ export const NG_TRIGGER_SELECTOR = '.ng-trigger';
37 ▶ export const NG_ANIMATING_CLASSNAME = 'ng-animating';
38 │ export const NG_ANIMATING_SELECTOR = '.ng-animating';
39 │ 
40 │ export function resolveTimingValue(value: string | number) {
41 │   if (typeof value == 'number') return value;
42 │ 
43 ▶   const matches = value.match(/^(-?[\.\d]+)(m?s)/);
44 ▶   if (!matches || matches.length < 2) return 0;
45 │ 
46 │   return _convertTimeValueToMS(parseFloat(matches[1]), matches[2]);
47 │ }
48 │ 
49 │ function _convertTimeValueToMS(value: number, unit: string): number {
50 ▶   switch (unit) {
51 ▶     case 's':
52 ▶       return value * ONE_SECOND;
53 ▶     default: // ms or something else
54 ▶       return value;
55 │   }
56 │ }
```

33〜38 行目が、エンジンが付ける `ng-enter`・`ng-leave`・`ng-trigger`・`ng-animating` の名前です。43 行目の `resolveTimingValue` は query・group の `delay` などの 1 つの値を ms にし、読めなければ 44 行目で 0 です。timings の文字列の約束と、`'1S'` が 1ms になる件は[第 1 回](01-anm-trigger-state.md)です。

📄 `angular/packages/animations/browser/src/util.ts` L119–150 （▶ の行: 125–126, 128, 131–132, 135, 138–139, 141, 148）

```ts
119 │ export function normalizeKeyframes(
120 │   keyframes: Array<ɵStyleData> | Array<ɵStyleDataMap>,
121 │ ): Array<ɵStyleDataMap> {
122 │   if (!keyframes.length) {
123 │     return [];
124 │   }
125 ▶   if (keyframes[0] instanceof Map) {
126 ▶     return keyframes as Array<ɵStyleDataMap>;
127 │   }
128 ▶   return keyframes.map((kf) => new Map(Object.entries(kf)));
129 │ }
130 │ 
131 ▶ export function normalizeStyles(styles: ɵStyleDataMap | Array<ɵStyleDataMap>): ɵStyleDataMap {
132 ▶   return Array.isArray(styles) ? new Map(...styles) : new Map(styles);
133 │ }
134 │ 
135 ▶ export function setStyles(element: any, styles: ɵStyleDataMap, formerStyles?: ɵStyleDataMap) {
136 │   styles.forEach((val, prop) => {
137 │     const camelProp = dashCaseToCamelCase(prop);
138 ▶     if (formerStyles && !formerStyles.has(prop)) {
139 ▶       formerStyles.set(prop, element.style[camelProp]);
140 │     }
141 ▶     element.style[camelProp] = val;
142 │   });
143 │ }
144 │ 
145 │ export function eraseStyles(element: any, styles: ɵStyleDataMap) {
146 │   styles.forEach((_, prop) => {
147 │     const camelProp = dashCaseToCamelCase(prop);
148 ▶     element.style[camelProp] = '';
149 │   });
150 │ }
```

132 行目の `normalizeStyles` は、配列なら `new Map(...styles)` です。`Map` の constructor は 1 つ目の引数しか読まないので、`[Map{width}, Map{height}]` は `width` だけになります。DEMO の「util.ts の normalizeStyles」で、`ɵAnimation.buildTimelines(el, [Map{width: 1px}, Map{height: 2px}], …)` の最初の keyframe は `{width: "1px", offset: 0}` で、`height` が消えていました。この行は d7e7409e811（#52441、``refactor(animations): drop `convertToMap` & `copyStyles` and use native functions.``、2023）の書き換えで、その前は配列の Map を 1 つずつ写して全部まとめていました。呼ぶのは `ɵAnimation`（dsl/animation.ts L53〜58）だけで、本家の中で配列を渡すのは spec の `invokeAnimationSequence`（既定は空の配列）です。main でも同じです。135〜143 行目の `setStyles` は 138〜139 行目で、3 つ目の引数に「まだ覚えていない、上書き前の値」を覚えます（4 節の 70 行目が使う）。

📄 `angular/packages/animations/browser/src/util.ts` L162–192 （▶ の行: 167–168, 171–172, 178–180, 186, 189）

```ts
162 │ export function validateStyleParams(
163 │   value: string | number | null | undefined,
164 │   options: AnimationOptions,
165 │   errors: Error[],
166 │ ) {
167 ▶   const params = options.params || {};
168 ▶   const matches = extractStyleParams(value);
169 │   if (matches.length) {
170 │     matches.forEach((varName) => {
171 ▶       if (!Object.hasOwn(params, varName)) {
172 ▶         errors.push(invalidStyleParams(varName));
173 │       }
174 │     });
175 │   }
176 │ }
177 │ 
178 ▶ const PARAM_REGEX = /* @__PURE__ */ new RegExp(
179 ▶   `${SUBSTITUTION_EXPR_START}\\s*(.+?)\\s*${SUBSTITUTION_EXPR_END}`,
180 ▶   'g',
181 │ );
182 │ export function extractStyleParams(value: string | number | null | undefined): string[] {
183 │   let params: string[] = [];
184 │   if (typeof value === 'string') {
185 │     let match: any;
186 ▶     while ((match = PARAM_REGEX.exec(value))) {
187 │       params.push(match[1] as string);
188 │     }
189 ▶     PARAM_REGEX.lastIndex = 0;
190 │   }
191 │   return params;
192 │ }
```

📄 `angular/packages/animations/browser/src/util.ts` L194–212 （▶ の行: 200–205, 207, 210–211）

```ts
194 │ export function interpolateParams(
195 │   value: string | number,
196 │   params: {[name: string]: any},
197 │   errors: Error[],
198 │ ): string | number {
199 │   const original = `${value}`;
200 ▶   const str = original.replace(PARAM_REGEX, (_, varName) => {
201 ▶     let localVal = params[varName];
202 ▶     // this means that the value was never overridden by the data passed in by the user
203 ▶     if (localVal == null) {
204 ▶       errors.push(invalidParamValue(varName));
205 ▶       localVal = '';
206 │     }
207 ▶     return localVal.toString();
208 │   });
209 │ 
210 ▶   // we do this to assert that numeric values stay as they are
211 ▶   return str == original ? value : str;
212 │ }
```

`{{ name }}` の置き換えです。203〜205 行目、値が無ければ NG03003 を溜めて空文字にし、211 行目、何も置き換えなければ元の型（数なら数）のまま返します（210 行目のコメント「数の値は数のままにする」）。162〜176 行目の `validateStyleParams` は、[第 4 回](04-anm-ast.md)で見たとおり、今の AST の検査からは呼ばれません。189 行目は、`g` の付いた正規表現を使い回すので、次に呼ぶ前に位置を 0 に戻す行です。

📄 `angular/packages/animations/browser/src/util.ts` L214–250 （▶ の行: 215–216, 219–220, 223–224, 232, 236–237, 239, 242, 245）

```ts
214 │ const DASH_CASE_REGEXP = /-+([a-z0-9])/g;
215 ▶ export function dashCaseToCamelCase(input: string): string {
216 ▶   return input.replace(DASH_CASE_REGEXP, (...m: any[]) => m[1].toUpperCase());
217 │ }
218 │ 
219 ▶ export function camelCaseToDashCase(input: string): string {
220 ▶   return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
221 │ }
222 │ 
223 ▶ export function allowPreviousPlayerStylesMerge(duration: number, delay: number) {
224 ▶   return duration === 0 || delay === 0;
225 │ }
226 │ 
227 │ export function balancePreviousStylesIntoKeyframes(
228 │   element: any,
229 │   keyframes: Array<ɵStyleDataMap>,
230 │   previousStyles: ɵStyleDataMap,
231 │ ) {
232 ▶   if (previousStyles.size && keyframes.length) {
233 │     let startingKeyframe = keyframes[0];
234 │     let missingStyleProps: string[] = [];
235 │     previousStyles.forEach((val, prop) => {
236 ▶       if (!startingKeyframe.has(prop)) {
237 ▶         missingStyleProps.push(prop);
238 │       }
239 ▶       startingKeyframe.set(prop, val);
240 │     });
241 │ 
242 ▶     if (missingStyleProps.length) {
243 │       for (let i = 1; i < keyframes.length; i++) {
244 │         let kf = keyframes[i];
245 ▶         missingStyleProps.forEach((prop) => kf.set(prop, computeStyle(element, prop)));
246 │       }
247 │     }
248 │   }
249 │   return keyframes;
250 │ }
```

223〜225 行目と 227〜250 行目は、前のプレイヤーの途中の値（前回の 5 節の `beforeDestroy`）を、次の keyframes に混ぜる道具です。WebAnimationsDriver.animate（旧エンジンの章の 83〜86 行目）が、次の duration か delay が 0 のときだけ混ぜます。239 行目で最初の keyframe を前の値で上書きし、最初の keyframe に無かったプロパティは、242〜246 行目で残りの keyframe を今の計算済みの値で埋めます。

## 7. イベントの写し：totalTime と disabled はプレイヤーから

📄 `angular/packages/animations/browser/src/render/shared.ts` L106–139 （▶ の行: 111–112, 118–120, 122–124, 138）

```ts
106 │ export function copyAnimationEvent(
107 │   e: AnimationEvent,
108 │   phaseName: string,
109 │   player: AnimationPlayer,
110 │ ): AnimationEvent {
111 ▶   const totalTime = player.totalTime;
112 ▶   const disabled = (player as any).disabled ? true : false;
113 │   const event = makeAnimationEvent(
114 │     e.element,
115 │     e.triggerName,
116 │     e.fromState,
117 │     e.toState,
118 ▶     phaseName || e.phaseName,
119 ▶     totalTime == undefined ? e.totalTime : totalTime,
120 ▶     disabled,
121 │   );
122 ▶   const data = (e as any)['_data'];
123 ▶   if (data != null) {
124 ▶     (event as any)['_data'] = data;
125 │   }
126 │   return event;
127 │ }
128 │ 
129 │ export function makeAnimationEvent(
130 │   element: any,
131 │   triggerName: string,
132 │   fromState: string,
133 │   toState: string,
134 │   phaseName: string = '',
135 │   totalTime: number = 0,
136 │   disabled?: boolean,
137 │ ): AnimationEvent {
138 ▶   return {element, triggerName, fromState, toState, phaseName, totalTime, disabled: !!disabled};
139 │ }
```

`(@x.start)`・`(@x.done)` の `AnimationEvent` は、エンジンが作った元のイベントを、呼ぶたびにこの関数で写します。111・119 行目で `totalTime` をプレイヤーの値にし、112 行目で `disabled` をプレイヤーの印にします。前回の 7 節で `[@.disabled]` の done の totalTime が 300 だったのは、このときのプレイヤーの totalTime が前回の 1302 行目で命令の長さにされていたからです（第 1 回の説明文「0 秒で呼ばれる」との関係は[第 1 回](01-anm-trigger-state.md)）。122〜125 行目の `_data` は flush の番号で、レンダラーの `scheduleListenerCallback` が読みます（旧パッケージの入口の章の 5・6 節）。

## 8. エラーの文

📄 `angular/packages/animations/browser/src/error_helpers.ts` L50–62 （▶ の行: 57–60）

```ts
50 │ export function invalidNodeType(nodeType: string): Error {
51 │   return new RuntimeError(
52 │     RuntimeErrorCode.INVALID_NODE_TYPE,
53 │     ngDevMode && `Unable to resolve animation metadata node #${nodeType}`,
54 │   );
55 │ }
56 │ 
57 ▶ export function invalidCssUnitValue(userProvidedProperty: string, value: string): Error {
58 ▶   return new RuntimeError(
59 ▶     RuntimeErrorCode.INVALID_CSS_UNIT_VALUE,
60 ▶     ngDevMode && `Please provide a CSS unit value for ${userProvidedProperty}:${value}`,
61 │   );
62 │ }
```

📄 `angular/packages/animations/browser/src/error_helpers.ts` L189–224 （▶ の行: 189, 193, 195, 199, 203, 205, 209, 213, 215, 219, 222）

```ts
189 ▶ export function triggerBuildFailed(name: string, errors: Error[]): Error {
190 │   return new RuntimeError(
191 │     RuntimeErrorCode.TRIGGER_BUILD_FAILED,
192 │     ngDevMode &&
193 ▶       `The animation trigger "${name}" has failed to build due to the following errors:\n - ${errors
194 │         .map((err) => err.message)
195 ▶         .join('\n - ')}`,
196 │   );
197 │ }
198 │ 
199 ▶ export function animationFailed(errors: Error[]): Error {
200 │   return new RuntimeError(
201 │     RuntimeErrorCode.ANIMATION_FAILED,
202 │     ngDevMode &&
203 ▶       `Unable to animate due to the following errors:${LINE_START}${errors
204 │         .map((err) => err.message)
205 ▶         .join(LINE_START)}`,
206 │   );
207 │ }
208 │ 
209 ▶ export function registerFailed(errors: Error[]): Error {
210 │   return new RuntimeError(
211 │     RuntimeErrorCode.REGISTRATION_FAILED,
212 │     ngDevMode &&
213 ▶       `Unable to build the animation due to the following errors: ${errors
214 │         .map((err) => err.message)
215 ▶         .join('\n')}`,
216 │   );
217 │ }
218 │ 
219 ▶ export function missingOrDestroyedAnimation(): Error {
220 │   return new RuntimeError(
221 │     RuntimeErrorCode.MISSING_OR_DESTROYED_ANIMATION,
222 ▶     ngDevMode && "The requested animation doesn't exist or has already been destroyed",
223 │   );
224 │ }
```

📄 `angular/packages/animations/browser/src/error_helpers.ts` L226–265 （▶ の行: 226, 230, 232, 236, 239, 243, 247, 251, 255, 259, 263）

```ts
226 ▶ export function createAnimationFailed(errors: Error[]): Error {
227 │   return new RuntimeError(
228 │     RuntimeErrorCode.CREATE_ANIMATION_FAILED,
229 │     ngDevMode &&
230 ▶       `Unable to create the animation due to the following errors:${errors
231 │         .map((err) => err.message)
232 ▶         .join('\n')}`,
233 │   );
234 │ }
235 │ 
236 ▶ export function missingPlayer(id: string): Error {
237 │   return new RuntimeError(
238 │     RuntimeErrorCode.MISSING_PLAYER,
239 ▶     ngDevMode && `Unable to find the timeline player referenced by ${id}`,
240 │   );
241 │ }
242 │ 
243 ▶ export function missingTrigger(phase: string, name: string): Error {
244 │   return new RuntimeError(
245 │     RuntimeErrorCode.MISSING_TRIGGER,
246 │     ngDevMode &&
247 ▶       `Unable to listen on the animation trigger event "${phase}" because the animation trigger "${name}" doesn\'t exist!`,
248 │   );
249 │ }
250 │ 
251 ▶ export function missingEvent(name: string): Error {
252 │   return new RuntimeError(
253 │     RuntimeErrorCode.MISSING_EVENT,
254 │     ngDevMode &&
255 ▶       `Unable to listen on the animation trigger "${name}" because the provided event is undefined!`,
256 │   );
257 │ }
258 │ 
259 ▶ export function unsupportedTriggerEvent(phase: string, name: string): Error {
260 │   return new RuntimeError(
261 │     RuntimeErrorCode.UNSUPPORTED_TRIGGER_EVENT,
262 │     ngDevMode &&
263 ▶       `The provided animation trigger event "${phase}" for the animation trigger "${name}" is not supported!`,
264 │   );
265 │ }
```

📄 `angular/packages/animations/browser/src/error_helpers.ts` L267–299 （▶ の行: 267, 270, 274, 278, 280, 284, 288, 294, 297）

```ts
267 ▶ export function unregisteredTrigger(name: string): Error {
268 │   return new RuntimeError(
269 │     RuntimeErrorCode.UNREGISTERED_TRIGGER,
270 ▶     ngDevMode && `The provided animation trigger "${name}" has not been registered!`,
271 │   );
272 │ }
273 │ 
274 ▶ export function triggerTransitionsFailed(errors: Error[]): Error {
275 │   return new RuntimeError(
276 │     RuntimeErrorCode.TRIGGER_TRANSITIONS_FAILED,
277 │     ngDevMode &&
278 ▶       `Unable to process animations due to the following failed trigger transitions\n ${errors
279 │         .map((err) => err.message)
280 ▶         .join('\n')}`,
281 │   );
282 │ }
283 │ 
284 ▶ export function triggerParsingFailed(name: string, errors: Error[]): Error {
285 │   return new RuntimeError(
286 │     RuntimeErrorCode.TRIGGER_PARSING_FAILED,
287 │     ngDevMode &&
288 ▶       `Animation parsing for the ${name} trigger have failed:${LINE_START}${errors
289 │         .map((err) => err.message)
290 │         .join(LINE_START)}`,
291 │   );
292 │ }
293 │ 
294 ▶ export function transitionFailed(name: string, errors: Error[]): Error {
295 │   return new RuntimeError(
296 │     RuntimeErrorCode.TRANSITION_FAILED,
297 ▶     ngDevMode && `@${name} has failed due to:\n ${errors.map((err) => err.message).join('\n- ')}`,
298 │   );
299 │ }
```

どれも `new RuntimeError(code, ngDevMode && '…')` で、本番では文が `false` になり、message は `NG0` と番号だけです（DEMO の本番の列）。いくつかを包む関数は、中のエラーの message をつなぎます。その区切りが関数ごとに違い、DEMO の開発モードの列で次のとおりでした。

- 193〜195 行目の NG03404 と 203〜205 行目の NG03502 は、改行と `" - "` で 1 つずつ並べます。
- 213〜215 行目の NG03503 は `": "` のあとに `"\n"` だけでつなぎ、230〜232 行目の NG03504 は `"errors:"` のすぐ後ろに空白なしで続きます（`…the following errors:NG03300: …`）。
- 278〜280 行目の NG03402 は `"\n "` のあと `"\n"` でつなぎ、297 行目の NG03505 は 1 つ目の前が `"\n "`、2 つ目からが `"\n- "` です。query の 0 件は NG03402 の中に NG03505、その中に NG03014 の 3 段でした。
- 288 行目の NG03403 の「have failed」は文法の誤りです（本物の registerTrigger は NG03404 を使い、NG03403 は spec の補助関数だけ。[旧 DSL の章](../animations/15-animations-legacy-dsl.md)のテストの節）。

リスナーの 3 つ（247・255・263 行目）は、前回の 3 節の 166〜176 行目から投げられ、文は `!` で終わります。DEMO で `(@fade.destroy)` にあたる `listen(…, 'fade', 'destroy', …)` は NG03400 で、`AnimationPlayer` の `onDestroy` はリスナーからは聞けません（listenOnPlayer の `'destroy'` の分岐は、AnimationBuilder のプレイヤーの `onDestroy` が `@@id:destroy` で聞くときに使う。animation\_builder.ts L188）。

> **🧪 DEMO — 本物のドライバー・ノーマライザー・プレイヤー・エンジンを直接呼んだ結果（記録の再生）**
>
> ボタンは、npm pack で取った @angular/animations 22.2.6 の browser の公開の名前（`NoopAnimationDriver` と、ɵ の付いた `WebAnimationsDriver`・`WebAnimationsStyleNormalizer`・`AnimationEngine`）を、手元の headless Chrome 157 で直接呼んだ記録を再生します。開発モードと本番（`ngDevMode = false`）の両方を取り、違う所は別の列にしました。console の出力はどちらも 0 行です。
>
> ボタンを押すと、その記録の表が出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/anm-driver)

## ここまでの呼び出し（エンジンがプレイヤーを 1 つ作って動かすまで）

- `TransitionAnimationEngine._buildAnimation` — transition\_animation\_engine.ts L1526 — *前回*
  - `normalizeKeyframes(normalizer, keyframes, preStyles, postStyles)` — shared.ts L34 — *! と \* を本物の値に、同じ offset をまとめる*
    - `WebAnimationsStyleNormalizer.normalizePropertyName / normalizeStyleValue` — web\_animations\_style\_normalizer.ts L46・L50 — *キャメルケース、寸法の数に px、単位なしの文字列は NG03005*
  - `WebAnimationsDriver.animate(…)` — web\_animations\_driver.ts L63 — *旧エンジンの章*
    - `balancePreviousStylesIntoKeyframes` — util.ts L227 — *duration か delay が 0 のとき前の値を混ぜる*
    - `packageNonAnimatableStyles(element, keyframes)` — special\_cased\_styles.ts L23 — *display・position を別に*
  - `WebAnimationsPlayer.play()` — web\_animations\_player.ts L136
    - `SpecialCasedStyles.start()` — special\_cased\_styles.ts L67 — *最初の値を inline に、元の値を覚える*
  - `WebAnimationsPlayer.destroy()` — L189
    - `SpecialCasedStyles.destroy()` — L88 — *覚えた値に戻す（最後にだけあるプロパティは残る）*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `packages/animations/browser/test/dsl/style_normalizer/web_animations_style_normalizer_spec.ts` | `normalizeStyleValue`（22）› ``should normalize number-based dimensional properties to use a `px` suffix if missing``（32）・`should report an error when a string-based dimensional value does not contain a suffix at all`（37）・``should allow `perspective` to be a numerical property``（57） | 3 節の 59〜66 行目。`padding` のような表に無い名前の it は無い |
| `packages/animations/browser/test/render/web_animations/web_animations_player_spec.ts` | `WebAnimationsPlayer tests`（10）› `should automatically pause the player when created and initialized`（20）・`should allow setting position before animation is started`（81）ほか 7 本 | 5 節の 88〜95 行目と 201〜209 行目。reset の it は無い |
| `packages/animations/browser/test/render/web_animations/web_animations_driver_spec.ts` | `when animation is inside a shadow DOM`（28）› `should consider an element inside the shadow DOM to be contained by the document body`（29） | 2 節の 160 行目と 204〜212 行目 |
| `packages/core/test/legacy_animation/legacy_animations_with_web_animations_integration_spec.ts` | ``should apply the `display` and `position` styles as regular inline styles for the duration of the animation``（560） | 4 節。finish と destroy を 1 回ずつ呼んで、元の `table`・`fixed` に戻ることだけ |
| `packages/core/test/legacy_animation/legacy_animation_integration_spec.ts` | `non-animatable css props`（4656）› `should show a warning if the animation tries to transition a non-animatable property`（4682）ほか | 2 節の animatable\_props\_set と警告（`display`・`fontStyle` で） |

📄 `走らせたコマンドと結果（2026-11-23）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/animations/browser/test:test //packages/animations/browser/test:test_web_chromium \
    --nocache_test_results --test_output=all
//packages/animations/browser/test:test               PASSED   17 specs, 0 failures
  （Node で中身が走るのは style_normalizer の 6 本・web_animations_player の 7 本・ast_builder の 1 本）
//packages/animations/browser/test:test_web_chromium  PASSED   124 passed, 0 failed
```

直すとしたら、4 節の special\_cased\_styles.ts の 84 行目を `Finished` にし、最後にだけあるプロパティも 70 行目と同じ 3 つ目の引数で元の値を覚えれば、2 回目の finish と destroy が説明のとおりになります（spec は legacy\_animations\_with\_web\_animations\_integration\_spec.ts の L560 の隣に、finish を 2 回呼ぶ it と、keyframes の最初と最後でプロパティの違う it を足す。プロパティの違う keyframes は DSL からは作れないので、`ɵWebAnimationsDriver` を直接使う browser/test/render/web\_animations/ の spec のほうが書きやすい）。5 節の reset は 172〜173 行目を写し（`[...this._originalOnStartFns]`）にします（web\_animations\_player\_spec.ts に「reset のあと足した onDone が 1 回だけ呼ばれる」の it）。6 節の `normalizeStyles` は 132 行目を `new Map(styles.flatMap((m) => [...m]))` の形にします。3 節の `padding` などは表に足すかどうかの話です。表は 2017 年の 28 個に、819514aeba6（2017-06-02）が `perspective` を足した形のままで、足したときは spec の L57 の it も足しています。

## 聞かれそうな質問

**Q. `style({width: 100})` と `style({padding: 10})` は同じに動きますか？**

動きません。`width` は 13〜43 行目の表にあるので、61 行目で `"100px"` になります。`padding` は表に無いので `"10"` のままで、Chrome はその値を受け付けず、その手順は動きません（DEMO で途中も 0px）。エラーも警告も出ないので、単位を書くか `paddingTop` などに分けます。

**Q. 開発モードと本番で、ドライバーの振る舞いは変わりますか？**

`WebAnimationsDriver` の `validateStyleProperty` と `validateAnimatableStyleProperty` は、本番では何でも `true` です（31〜35・39〜44 行目）。知らないプロパティの警告や動かせないプロパティの警告は開発モードだけです。単位の NG03005 は本番でも出ます（文は無く番号だけ）。

**Q. `display` を DSL で動かすとどうなりますか？**

Web Animations には渡りますが、`SpecialCasedStyles` が play のときに最初の値、finish のときに最後の値を inline で付け、destroy で元に戻します（4 節）。エンジンが終わったあとに state のスタイルを付けるので、終わった後の見た目は state で決まります。開発モードでは、値の変わる `display` に「動かせないプロパティ」の警告が出ます。

**Q. `getParentElement(document.body)` は何を返しますか？**

`null` です。親が `<html>` のときに `null` を返す（shared.ts の 161〜163 行目）からで、説明文の「document なら null」「親が無ければ null」とは少し違います。エンジンが `containsElement` を呼ぶのは body を 1 つ目にした形（前回の 640 行目など）で、body の中の要素は上にたどる途中で body に当たります。

**Q. 本番のエラーの message から、何が起きたか分かりますか？**

番号だけです（`NG03402` など）。中に包まれた NG03505・NG03014 も出ません。番号の意味は packages/animations/src/errors.ts の `RuntimeErrorCode` と、この章の 8 節の関数の名前で引けます。

## 読み終えて

- `WebAnimationsDriver` の CSS の確かめは開発モードだけ。動かせるかの表（199 個）は 2022 年の MDN の一覧のままで、`aspect-ratio` や `position` を Chrome は動かす。
- px を補うのは 29 個の寸法の名前に数を書いたときだけ。`padding: 10` は何も知らせずに動かない。
- `display`・`position` は keyframes の外で inline に付ける。2 回目の finish は inline を消し、最後にだけあるプロパティは destroy で残る（84 行目・94 行目）。
- `WebAnimationsPlayer.reset` は original の配列をそのまま代入するので、reset のあとに足したコールバックは 2 回呼ばれる。
- `normalizeStyles` は配列の 2 つ目以降の Map を捨てる（2023 年の書き換えから）。エラーの文は包み方が関数ごとに違い、本番は番号だけ。

---

← 前: [遷移のエンジン：TransitionAnimationEngine ほか](06-anm-engine.md)  
次: [provideAnimations と BrowserAnimationsModule の説明文](08-anm-module.md) →
