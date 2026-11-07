[目次](../README.md) › [アニメーションの内側](README.md) › 第 15 回 / 全 20 回

# 旧 DSL がキーフレームになるまで：trigger から timeline へ

> trigger・state・transition・style・animate・query・stagger・group・sequence が返すメタデータのオブジェクト、AnimationAstBuilder が検証して AST にする行、"void =&gt; \*" や ":enter" を関数にする transition の式、AnimationTransitionFactory と AnimationTimelineBuilder が時間とスタイルを積んでキーフレームの命令を作る手順。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-legacy-dsl)

---

旧パッケージでは、アニメーションを `trigger('open', [state(...), transition('void => *', [style(...), animate(300, style(...))])])` のような関数の組み合わせ（DSL）で書きます。この章では、その関数が返すただのオブジェクトから始めて、`AnimationAstBuilderVisitor` が検証して AST（構文木）にし、`'void => *'` のような文字列を「一致するかを返す関数」にし、`AnimationTimelineBuilder` が時間とスタイルを積んで Web Animations API に渡す keyframes を作るまでを、1 ステップずつ追います。

読む対象は `packages/animations/src/animation_metadata.ts` と `packages/animations/browser/src/dsl/` の `animation_ast_builder.ts`・`animation_transition_expr.ts`・`animation_trigger.ts`・`animation_transition_factory.ts`・`animation_timeline_builder.ts` です。いつ組み立てられるかは [第 14 回](14-animations-legacy-setup.md)の `registerTrigger`、組み立てたものを誰が使うかは [第 16 回](16-animations-legacy-engine.md)です。

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
15. **15. 旧 DSL とキーフレーム**（この章）
16. [16. TransitionAnimationEngine](16-animations-legacy-engine.md)
17. [17. 2 つが同居するとき](17-animations-legacy-compat.md)
18. [18. 移行](18-animations-migration.md)
19. [19. テスト](19-animations-testing.md)
20. [20. issue と変更を読む](20-animations-issues.md)

## 1. DSL の関数は「type の番号つきのオブジェクト」を返すだけ

📄 `angular/packages/animations/src/animation_metadata.ts` L648–654 （▶ の行: 650, 652–653）

```ts
648 │  * @publicApi
649 │  *
650 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
651 │  */
652 ▶ export function trigger(name: string, definitions: AnimationMetadata[]): AnimationTriggerMetadata {
653 ▶   return {type: AnimationMetadataType.Trigger, name, definitions, options: {}};
654 │ }
```

📄 `angular/packages/animations/src/animation_metadata.ts` L1088–1105 （▶ の行: 1093–1095, 1101, 1104）

```ts
1088 │  * @publicApi
1089 │  *
1090 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
1091 │  **/
1092 │ export function transition(
1093 ▶   stateChangeExpr:
1094 ▶     | string
1095 ▶     | ((
1096 │         fromState: string,
1097 │         toState: string,
1098 │         element?: any,
1099 │         params?: {[key: string]: any},
1100 │       ) => boolean),
1101 ▶   steps: AnimationMetadata | AnimationMetadata[],
1102 │   options: AnimationOptions | null = null,
1103 │ ): AnimationTransitionMetadata {
1104 ▶   return {type: AnimationMetadataType.Transition, expr: stateChangeExpr, animation: steps, options};
1105 │ }
```

653 行目、`trigger()` は検証も変換もせず、`{type: AnimationMetadataType.Trigger, name, definitions, options: {}}` を返すだけです。1104 行目の `transition()` も同じで、1093〜1100 行目のとおり `expr` は文字列でも関数でもよく、そのまま入れます。どの関数にも 650 行目の `@deprecated 20.2 ... Intent to remove in v23` が付いています。13 個の関数がどの番号を返すかは、enum の行と `return` の行を grep すると 1 画面に並びます。

📄 `ターミナル（../angular の packages/animations）`

```
$ grep -n "^  [A-Za-z]* = [0-9]*,$" packages/animations/src/animation_metadata.ts
116:  State = 0,
121:  Transition = 1,
126:  Sequence = 2,
131:  Group = 3,
136:  Animate = 4,
141:  Keyframes = 5,
146:  Style = 6,
151:  Trigger = 7,
156:  Reference = 8,
161:  AnimateChild = 9,
166:  AnimateRef = 10,
171:  Query = 11,
176:  Stagger = 12,

$ grep -n "return {type: AnimationMetadataType" packages/animations/src/animation_metadata.ts
653:  return {type: AnimationMetadataType.Trigger, name, definitions, options: {}};
720:  return {type: AnimationMetadataType.Animate, styles, timings};
762:  return {type: AnimationMetadataType.Group, steps, options};
804:  return {type: AnimationMetadataType.Sequence, steps, options};
851:  return {type: AnimationMetadataType.Style, styles: tokens, offset: null};
890:  return {type: AnimationMetadataType.State, name, styles, options};
941:  return {type: AnimationMetadataType.Keyframes, steps};
1104:  return {type: AnimationMetadataType.Transition, expr: stateChangeExpr, animation: steps, options};
1158:  return {type: AnimationMetadataType.Reference, animation: steps, options};
1185:  return {type: AnimationMetadataType.AnimateChild, options};
1204:  return {type: AnimationMetadataType.AnimateRef, animation, options};
1334:  return {type: AnimationMetadataType.Query, selector, animation, options};
1423:  return {type: AnimationMetadataType.Stagger, timings, animation};
```

| 関数 | type | 返すオブジェクトの中身（return の行） |
| --- | --- | --- |
| `state(name, styles, options?)` | 0 | `name, styles, options`（890 行目） |
| `transition(expr, steps, options?)` | 1 | `expr, animation: steps, options`（1104 行目） |
| `sequence(steps, options?)` | 2 | `steps, options`（804 行目） |
| `group(steps, options?)` | 3 | `steps, options`（762 行目） |
| `animate(timings, styles?)` | 4 | `styles, timings`（720 行目）。timings は `300` や `'300ms 100ms ease-out'` |
| `style(tokens)` | 6 | `styles: tokens, offset: null`（851 行目） |
| `trigger(name, definitions)` | 7 | `name, definitions, options: {}`（653 行目） |
| `query(selector, animation, options?)` | 11 | `selector, animation, options`（1334 行目） |
| `stagger(timings, animation)` | 12 | `timings, animation`（1423 行目） |

`keyframes()`（5）、`animation()`（8）、`animateChild()`（9）、`useAnimation()`（10）も同じ形です。**この時点では何も検証されていません**。`transition('somethingThatIsWrong', ...)` と書いても、`@Component` の `animations` 配列に入るまではただのオブジェクトです。

## 2. buildAnimationAst：type の番号で visit\* に振り分ける

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L119–153 （▶ の行: 119, 125, 138–139, 141, 145–146）

```ts
119 ▶ export function buildAnimationAst(
120 │   driver: AnimationDriver,
121 │   metadata: AnimationMetadata | AnimationMetadata[],
122 │   errors: Error[],
123 │   warnings: string[],
124 │ ): Ast<AnimationMetadataType> {
125 ▶   return new AnimationAstBuilderVisitor(driver).build(metadata, errors, warnings);
126 │ }
127 │ 
128 │ const ROOT_SELECTOR = '';
129 │ 
130 │ export class AnimationAstBuilderVisitor implements AnimationDslVisitor {
131 │   constructor(private _driver: AnimationDriver) {}
132 │ 
133 │   build(
134 │     metadata: AnimationMetadata | AnimationMetadata[],
135 │     errors: Error[],
136 │     warnings: string[],
137 │   ): Ast<AnimationMetadataType> {
138 ▶     const context = new AnimationAstBuilderContext(errors);
139 ▶     this._resetContextStyleTimingState(context);
140 │     const ast = <Ast<AnimationMetadataType>>(
141 ▶       visitDslNode(this, normalizeAnimationEntry(metadata), context)
142 │     );
143 │ 
144 │     if (typeof ngDevMode === 'undefined' || ngDevMode) {
145 ▶       if (context.unsupportedCSSPropertiesFound.size) {
146 ▶         pushUnrecognizedPropertiesWarning(warnings, [
147 │           ...context.unsupportedCSSPropertiesFound.keys(),
148 │         ]);
149 │       }
150 │     }
151 │ 
152 │     return ast;
153 │   }
```

📄 `angular/packages/animations/browser/src/util.ts` L262–293 （▶ の行: 263–265, 268–269, 274–275, 291）

```ts
262 │ export function visitDslNode(visitor: any, node: any, context: any): any {
263 ▶   switch (node.type) {
264 ▶     case AnimationMetadataType.Trigger:
265 ▶       return visitor.visitTrigger(node, context);
266 │     case AnimationMetadataType.State:
267 │       return visitor.visitState(node, context);
268 ▶     case AnimationMetadataType.Transition:
269 ▶       return visitor.visitTransition(node, context);
270 │     case AnimationMetadataType.Sequence:
271 │       return visitor.visitSequence(node, context);
272 │     case AnimationMetadataType.Group:
273 │       return visitor.visitGroup(node, context);
274 ▶     case AnimationMetadataType.Animate:
275 ▶       return visitor.visitAnimate(node, context);
276 │     case AnimationMetadataType.Keyframes:
277 │       return visitor.visitKeyframes(node, context);
278 │     case AnimationMetadataType.Style:
279 │       return visitor.visitStyle(node, context);
280 │     case AnimationMetadataType.Reference:
281 │       return visitor.visitReference(node, context);
282 │     case AnimationMetadataType.AnimateChild:
283 │       return visitor.visitAnimateChild(node, context);
284 │     case AnimationMetadataType.AnimateRef:
285 │       return visitor.visitAnimateRef(node, context);
286 │     case AnimationMetadataType.Query:
287 │       return visitor.visitQuery(node, context);
288 │     case AnimationMetadataType.Stagger:
289 │       return visitor.visitStagger(node, context);
290 │     default:
291 ▶       throw invalidNodeType(node.type);
292 │   }
293 │ }
```

125 行目で `AnimationAstBuilderVisitor` を作り、141 行目で `visitDslNode` に渡します。`visitDslNode` は 263 行目の `switch (node.type)` で、1 節の番号ごとに `visitTrigger`・`visitTransition`・`visitAnimate`… を呼ぶだけです（番号が知らないものなら 291 行目で投げる）。エラーは投げずに 138 行目の `context.errors` 配列に溜め、145〜146 行目、知らない CSS プロパティは警告として別に溜めます。呼んだ側（第 14 回の `registerTrigger`）が、エラーが 1 つでもあればまとめて投げます。同じ `visitDslNode` は、AST を keyframes にする 6 節でももう一度使われます（AST も同じ type の番号を持つため）。

### visitTrigger と visitTransition

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L162–195 （▶ の行: 170–171, 176, 181, 184, 187–188, 193）

```ts
162 │   visitTrigger(
163 │     metadata: AnimationTriggerMetadata,
164 │     context: AnimationAstBuilderContext,
165 │   ): TriggerAst {
166 │     let queryCount = (context.queryCount = 0);
167 │     let depCount = (context.depCount = 0);
168 │     const states: StateAst[] = [];
169 │     const transitions: TransitionAst[] = [];
170 ▶     if (metadata.name.charAt(0) == '@') {
171 ▶       context.errors.push(invalidTrigger());
172 │     }
173 │ 
174 │     metadata.definitions.forEach((def) => {
175 │       this._resetContextStyleTimingState(context);
176 ▶       if (def.type == AnimationMetadataType.State) {
177 │         const stateDef = def as AnimationStateMetadata;
178 │         const name = stateDef.name;
179 │         name
180 │           .toString()
181 ▶           .split(/\s*,\s*/)
182 │           .forEach((n) => {
183 │             stateDef.name = n;
184 ▶             states.push(this.visitState(stateDef, context));
185 │           });
186 │         stateDef.name = name;
187 ▶       } else if (def.type == AnimationMetadataType.Transition) {
188 ▶         const transition = this.visitTransition(def as AnimationTransitionMetadata, context);
189 │         queryCount += transition.queryCount;
190 │         depCount += transition.depCount;
191 │         transitions.push(transition);
192 │       } else {
193 ▶         context.errors.push(invalidDefinition());
194 │       }
195 │     });
```

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L238–255 （▶ の行: 244–245, 249–250）

```ts
238 │   visitTransition(
239 │     metadata: AnimationTransitionMetadata,
240 │     context: AnimationAstBuilderContext,
241 │   ): TransitionAst {
242 │     context.queryCount = 0;
243 │     context.depCount = 0;
244 ▶     const animation = visitDslNode(this, normalizeAnimationEntry(metadata.animation), context);
245 ▶     const matchers = parseTransitionExpr(metadata.expr, context.errors);
246 │ 
247 │     return {
248 │       type: AnimationMetadataType.Transition,
249 ▶       matchers,
250 ▶       animation,
251 │       queryCount: context.queryCount,
252 │       depCount: context.depCount,
253 │       options: normalizeAnimationOptions(metadata.options),
254 │     };
255 │   }
```

1. **170〜171 行目：名前が @ で始まるとエラー**

   `trigger('@foo', ...)` は NG03006 です。`@` はテンプレート側の印で、名前には含めません。
2. **176〜186 行目：`state` は名前をカンマで分けて 1 つずつ**

   181 行目、`state('open, expanded', ...)` は 2 つの `StateAst` になります。
3. **187〜191 行目：`transition` は visitTransition へ**

   244 行目で中のアニメーション（2 つ以上の配列なら `sequence` に包まれる）を先に AST にし、245 行目で式を `parseTransitionExpr` で関数の配列（`matchers`）にします（3 節）。
4. **193 行目：`trigger` の直下にそれ以外があるとエラー**

   直下に置けるのは `state` と `transition` だけです（NG03007）。

### visitAnimate と visitQuery / visitStagger：検証しながら時間を数える

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L286–322 （▶ の行: 290–291, 296–297, 309–310）

```ts
286 │   visitAnimate(
287 │     metadata: AnimationAnimateMetadata,
288 │     context: AnimationAstBuilderContext,
289 │   ): AnimateAst {
290 ▶     const timingAst = constructTimingAst(metadata.timings, context.errors);
291 ▶     context.currentAnimateTimings = timingAst;
292 │     let styleAst: StyleAst | KeyframesAst;
293 │     let styleMetadata: AnimationStyleMetadata | AnimationKeyframesSequenceMetadata = metadata.styles
294 │       ? metadata.styles
295 │       : style({});
296 ▶     if (styleMetadata.type == AnimationMetadataType.Keyframes) {
297 ▶       styleAst = this.visitKeyframes(styleMetadata as AnimationKeyframesSequenceMetadata, context);
298 │     } else {
299 │       let styleMetadata = metadata.styles as AnimationStyleMetadata;
300 │       let isEmpty = false;
301 │       if (!styleMetadata) {
302 │         isEmpty = true;
303 │         const newStyleData: {[prop: string]: string | number} = {};
304 │         if (timingAst.easing) {
305 │           newStyleData['easing'] = timingAst.easing;
306 │         }
307 │         styleMetadata = style(newStyleData);
308 │       }
309 ▶       context.currentTime += timingAst.duration + timingAst.delay;
310 ▶       const _styleAst = this.visitStyle(styleMetadata, context);
311 │       _styleAst.isEmptyStep = isEmpty;
312 │       styleAst = _styleAst;
313 │     }
314 │ 
315 │     context.currentAnimateTimings = null;
316 │     return {
317 │       type: AnimationMetadataType.Animate,
318 │       timings: timingAst,
319 │       style: styleAst,
320 │       options: null,
321 │     };
322 │   }
```

📄 `angular/packages/animations/browser/src/dsl/animation_ast_builder.ts` L539–573 （▶ の行: 543, 545–547, 558–559, 571–572）

```ts
539 │   visitQuery(metadata: AnimationQueryMetadata, context: AnimationAstBuilderContext): QueryAst {
540 │     const parentSelector = context.currentQuerySelector!;
541 │     const options = (metadata.options || {}) as AnimationQueryOptions;
542 │ 
543 ▶     context.queryCount++;
544 │     context.currentQuery = metadata;
545 ▶     const [selector, includeSelf] = normalizeSelector(metadata.selector);
546 ▶     context.currentQuerySelector = parentSelector.length
547 ▶       ? parentSelector + ' ' + selector
548 │       : selector;
549 │     getOrSetDefaultValue(context.collectedStyles, context.currentQuerySelector, new Map());
550 │ 
551 │     const animation = visitDslNode(this, normalizeAnimationEntry(metadata.animation), context);
552 │     context.currentQuery = null;
553 │     context.currentQuerySelector = parentSelector;
554 │ 
555 │     return {
556 │       type: AnimationMetadataType.Query,
557 │       selector,
558 ▶       limit: options.limit || 0,
559 ▶       optional: !!options.optional,
560 │       includeSelf,
561 │       animation,
562 │       originalSelector: metadata.selector,
563 │       options: normalizeAnimationOptions(metadata.options),
564 │     };
565 │   }
566 │ 
567 │   visitStagger(
568 │     metadata: AnimationStaggerMetadata,
569 │     context: AnimationAstBuilderContext,
570 │   ): StaggerAst {
571 ▶     if (!context.currentQuery) {
572 ▶       context.errors.push(invalidStagger());
573 │     }
```

290 行目で `'300ms 100ms ease-out'` のような timings を数に分け（読めなければ NG03000）、309 行目でこの段階でも時間（`currentTime`）を足していきます。これは「同じプロパティを同じ時間帯に 2 回動かしていないか」（NG03010）を確かめるためのもので、本当の keyframes は 6 節で作り直します。`query` は 545〜548 行目でセレクタを正規化して親の query のセレクタとつなぎ、558〜559 行目で `limit` と `optional` を AST に残します。**ここではまだ要素を探しません**（要素は 6 節で探す）。571〜572 行目、`stagger` が `query` の外にあると NG03013 です。

## 3. 'void =&gt; \*' を関数にする：parseTransitionExpr

📄 `angular/packages/animations/browser/src/dsl/animation_transition_expr.ts` L19–32 （▶ の行: 24, 26–27, 29）

```ts
19 │ export function parseTransitionExpr(
20 │   transitionValue: string | TransitionMatcherFn,
21 │   errors: Error[],
22 │ ): TransitionMatcherFn[] {
23 │   const expressions: TransitionMatcherFn[] = [];
24 ▶   if (typeof transitionValue == 'string') {
25 │     transitionValue
26 ▶       .split(/\s*,\s*/)
27 ▶       .forEach((str) => parseInnerTransitionStr(str, expressions, errors));
28 │   } else {
29 ▶     expressions.push(<TransitionMatcherFn>transitionValue);
30 │   }
31 │   return expressions;
32 │ }
```

📄 `angular/packages/animations/browser/src/dsl/animation_transition_expr.ts` L34–64 （▶ の行: 39–40, 45, 48, 50, 57, 59–61）

```ts
34 │ function parseInnerTransitionStr(
35 │   eventStr: string,
36 │   expressions: TransitionMatcherFn[],
37 │   errors: Error[],
38 │ ) {
39 ▶   if (eventStr[0] == ':') {
40 ▶     const result = parseAnimationAlias(eventStr, errors);
41 │     if (typeof result == 'function') {
42 │       expressions.push(result);
43 │       return;
44 │     }
45 ▶     eventStr = result;
46 │   }
47 │ 
48 ▶   const match = eventStr.match(/^(\*|[-\w]+)\s*(<?[=-]>)\s*(\*|[-\w]+)$/);
49 │   if (match == null || match.length < 4) {
50 ▶     errors.push(invalidExpression(eventStr));
51 │     return expressions;
52 │   }
53 │ 
54 │   const fromState = match[1];
55 │   const separator = match[2];
56 │   const toState = match[3];
57 ▶   expressions.push(makeLambdaFromStates(fromState, toState));
58 │ 
59 ▶   const isFullAnyStateExpr = fromState == ANY_STATE && toState == ANY_STATE;
60 ▶   if (separator[0] == '<' && !isFullAnyStateExpr) {
61 ▶     expressions.push(makeLambdaFromStates(toState, fromState));
62 │   }
63 │   return;
64 │ }
```

📄 `angular/packages/animations/browser/src/dsl/animation_transition_expr.ts` L66–80 （▶ の行: 68–71, 73, 75, 77–78）

```ts
66 │ function parseAnimationAlias(alias: string, errors: Error[]): string | TransitionMatcherFn {
67 │   switch (alias) {
68 ▶     case ':enter':
69 ▶       return 'void => *';
70 ▶     case ':leave':
71 ▶       return '* => void';
72 │     case ':increment':
73 ▶       return (fromState: any, toState: any): boolean => parseFloat(toState) > parseFloat(fromState);
74 │     case ':decrement':
75 ▶       return (fromState: any, toState: any): boolean => parseFloat(toState) < parseFloat(fromState);
76 │     default:
77 ▶       errors.push(invalidTransitionAlias(alias));
78 ▶       return '* => *';
79 │   }
80 │ }
```

📄 `angular/packages/animations/browser/src/dsl/animation_transition_expr.ts` L86–106 （▶ の行: 90–91, 94–95, 97–98, 100–101）

```ts
 86 │ const TRUE_BOOLEAN_VALUES = new Set<string>(['true', '1']);
 87 │ const FALSE_BOOLEAN_VALUES = new Set<string>(['false', '0']);
 88 │ 
 89 │ function makeLambdaFromStates(lhs: string, rhs: string): TransitionMatcherFn {
 90 ▶   const LHS_MATCH_BOOLEAN = TRUE_BOOLEAN_VALUES.has(lhs) || FALSE_BOOLEAN_VALUES.has(lhs);
 91 ▶   const RHS_MATCH_BOOLEAN = TRUE_BOOLEAN_VALUES.has(rhs) || FALSE_BOOLEAN_VALUES.has(rhs);
 92 │ 
 93 │   return (fromState: any, toState: any): boolean => {
 94 ▶     let lhsMatch = lhs == ANY_STATE || lhs == fromState;
 95 ▶     let rhsMatch = rhs == ANY_STATE || rhs == toState;
 96 │ 
 97 ▶     if (!lhsMatch && LHS_MATCH_BOOLEAN && typeof fromState === 'boolean') {
 98 ▶       lhsMatch = fromState ? TRUE_BOOLEAN_VALUES.has(lhs) : FALSE_BOOLEAN_VALUES.has(lhs);
 99 │     }
100 ▶     if (!rhsMatch && RHS_MATCH_BOOLEAN && typeof toState === 'boolean') {
101 ▶       rhsMatch = toState ? TRUE_BOOLEAN_VALUES.has(rhs) : FALSE_BOOLEAN_VALUES.has(rhs);
102 │     }
103 │ 
104 │     return lhsMatch && rhsMatch;
105 │   };
106 │ }
```

1. **26 行目：カンマで分ける**

   `'a => b, b => a'` は 2 つの式です。29 行目、関数を渡したときは、それがそのまま 1 つ目の matcher になります。
2. **39〜45 行目：`:` で始まれば別名**

   69 行目 `:enter` は `'void => *'`、71 行目 `:leave` は `'* => void'` の文字列に置き換えて先へ進みます。`:increment` / `:decrement` は 73・75 行目で数として比べる関数をそのまま返します。知らない別名は 77 行目でエラー（NG03016）を溜め、78 行目で `'* => *'` として続けます。
3. **48 行目：`状態 => 状態` の正規表現**

   状態の名前は `*` か `[-\w]+`、矢印は `=>`・`<=>`（と `->`）です。合わなければ 50 行目で NG03015。
4. **57・59〜61 行目：関数を作る。`<=>` なら逆向きも**

   59 行目、`* <=> *` のときだけは逆向きを足しません（同じ関数になるため）。
5. **94〜95 行目：`*` は何にでも一致、それ以外は `==`**

   `void` も特別扱いはなく、ただの名前です（エンジンが「まだ値が無い」「消える」を `'void'` という値にする。第 16 回）。だから `'* => *'` は `void => open` にも一致します。90〜91・97〜101 行目、式の側が `true` / `1` / `false` / `0` で値が boolean なら、真偽で比べます。

> **🧪 DEMO（再現）— 遷移の式がどの値の変化に一致するか**
>
> この章のコンポーネントの `miniParseTransitionExpr` は、`animation_transition_expr.ts` 19〜106 行目の規則を写した再現です（`@angular/animations` はこのサイトに入っていません）。式・前の値・次の値を変えると、作られた関数ごとに一致するかを表示します。エラーは原文と同じ文言を文字列で出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-legacy-dsl)

## 4. AnimationTrigger：最初に一致した transition を選ぶ

📄 `angular/packages/animations/browser/src/dsl/animation_trigger.ts` L22–44 （▶ の行: 32, 34, 37–38, 40–41, 43）

```ts
22 │ export class AnimationTrigger {
23 │   public transitionFactories: AnimationTransitionFactory[] = [];
24 │   public fallbackTransition: AnimationTransitionFactory;
25 │   public states = new Map<string, AnimationStateStyles>();
26 │ 
27 │   constructor(
28 │     public name: string,
29 │     public ast: TriggerAst,
30 │     private _normalizer: AnimationStyleNormalizer,
31 │   ) {
32 ▶     ast.states.forEach((ast) => {
33 │       const defaultParams = (ast.options && ast.options.params) || {};
34 ▶       this.states.set(ast.name, new AnimationStateStyles(ast.style, defaultParams, _normalizer));
35 │     });
36 │ 
37 ▶     balanceProperties(this.states, 'true', '1');
38 ▶     balanceProperties(this.states, 'false', '0');
39 │ 
40 ▶     ast.transitions.forEach((ast) => {
41 ▶       this.transitionFactories.push(new AnimationTransitionFactory(name, ast, this.states));
42 │     });
43 ▶     this.fallbackTransition = createFallbackTransition(name, this.states, this._normalizer);
44 │   }
```

📄 `angular/packages/animations/browser/src/dsl/animation_trigger.ts` L50–83 （▶ の行: 56–57, 59, 72–73）

```ts
50 │   matchTransition(
51 │     currentState: any,
52 │     nextState: any,
53 │     element: any,
54 │     params: {[key: string]: any},
55 │   ): AnimationTransitionFactory | null {
56 ▶     const entry = this.transitionFactories.find((f) =>
57 ▶       f.match(currentState, nextState, element, params),
58 │     );
59 ▶     return entry || null;
60 │   }
61 │ 
62 │   matchStyles(currentState: any, params: {[key: string]: any}, errors: Error[]): ɵStyleDataMap {
63 │     return this.fallbackTransition.buildStyles(currentState, params, errors);
64 │   }
65 │ }
66 │ 
67 │ function createFallbackTransition(
68 │   triggerName: string,
69 │   states: Map<string, AnimationStateStyles>,
70 │   normalizer: AnimationStyleNormalizer,
71 │ ): AnimationTransitionFactory {
72 ▶   const matchers = [(fromState: any, toState: any) => true];
73 ▶   const animation: SequenceAst = {type: AnimationMetadataType.Sequence, steps: [], options: null};
74 │   const transition: TransitionAst = {
75 │     type: AnimationMetadataType.Transition,
76 │     animation,
77 │     matchers,
78 │     options: null,
79 │     queryCount: 0,
80 │     depCount: 0,
81 │   };
82 │   return new AnimationTransitionFactory(triggerName, transition, states);
83 │ }
```

📄 `angular/packages/animations/browser/src/dsl/animation_transition_factory.ts` L34–48 （▶ の行: 35, 43, 45）

```ts
34 │   match(currentState: any, nextState: any, element: any, params: {[key: string]: any}): boolean {
35 ▶     return oneOrMoreTransitionsMatch(this.ast.matchers, currentState, nextState, element, params);
36 │   }
37 │ 
38 │   buildStyles(
39 │     stateName: string | boolean | undefined,
40 │     params: {[key: string]: any},
41 │     errors: Error[],
42 │   ): ɵStyleDataMap {
43 ▶     let styler = this._stateStyles.get('*');
44 │     if (stateName !== undefined) {
45 ▶       styler = this._stateStyles.get(stateName?.toString()) || styler;
46 │     }
47 │     return styler ? styler.buildStyles(params, errors) : new Map();
48 │   }
```

第 14 回の `registerTrigger` が呼ぶ `buildTrigger` は、この `AnimationTrigger` を new するだけです。32〜35 行目で `state` を名前 → スタイルの Map にし、37〜38 行目で `'true'` と `'1'`、`'false'` と `'0'` の片方しか無ければもう片方にも同じスタイルを入れます。40〜41 行目で `transition` ごとに `AnimationTransitionFactory` を作ります。56〜57 行目、値が変わったときは **書いた順に**探して最初に一致したものを返し（35 行目、matcher のどれか 1 つが true なら一致）、無ければ 59 行目で `null` です。43 行目と 72〜73 行目の `fallbackTransition` は「いつでも一致して、何も動かさない」遷移で、エンジンは一致が無いとき、状態のスタイルを置くためにこれを使います（第 16 回）。factory の 43〜45 行目、状態のスタイルは名前で探し、無ければ `state('*', ...)` を使います。

## 5. AnimationTransitionFactory.build：状態のスタイルを両端に置いて timeline へ

📄 `angular/packages/animations/browser/src/dsl/animation_transition_factory.ts` L62–98 （▶ の行: 66, 68, 73, 82, 85, 88–89, 96–97）

```ts
62 │     const errors: Error[] = [];
63 │ 
64 │     const transitionAnimationParams = (this.ast.options && this.ast.options.params) || EMPTY_OBJECT;
65 │     const currentAnimationParams = (currentOptions && currentOptions.params) || EMPTY_OBJECT;
66 ▶     const currentStateStyles = this.buildStyles(currentState, currentAnimationParams, errors);
67 │     const nextAnimationParams = (nextOptions && nextOptions.params) || EMPTY_OBJECT;
68 ▶     const nextStateStyles = this.buildStyles(nextState, nextAnimationParams, errors);
69 │ 
70 │     const queriedElements = new Set<any>();
71 │     const preStyleMap = new Map<any, Set<string>>();
72 │     const postStyleMap = new Map<any, Set<string>>();
73 ▶     const isRemoval = nextState === 'void';
74 │ 
75 │     const animationOptions: AnimationOptions = {
76 │       params: applyParamDefaults(nextAnimationParams, transitionAnimationParams),
77 │       delay: this.ast.options?.delay,
78 │     };
79 │ 
80 │     const timelines = skipAstBuild
81 │       ? []
82 ▶       : buildAnimationTimelines(
83 │           driver,
84 │           element,
85 ▶           this.ast.animation,
86 │           enterClassName,
87 │           leaveClassName,
88 ▶           currentStateStyles,
89 ▶           nextStateStyles,
90 │           animationOptions,
91 │           subInstructions,
92 │           errors,
93 │         );
94 │ 
95 │     let totalTime = 0;
96 ▶     timelines.forEach((tl) => {
97 ▶       totalTime = Math.max(tl.duration + tl.delay, totalTime);
98 │     });
```

66・68 行目で前の状態と次の状態のスタイル（`state(...)` に書いたもの）を作り、82〜93 行目の `buildAnimationTimelines` に**開始のスタイル（88 行目）と終わりのスタイル（89 行目）**として渡します。73 行目、次の値が `'void'` なら「消える遷移」の印を付けます。96〜97 行目、できた timeline のうち一番遅く終わるものの時間が、この遷移の長さです。85 行目の `this.ast.animation` が 2 節で作った transition の中身の AST で、ここから先が keyframes 作りです。

## 6. AnimationTimelineBuilder：時間を積んで keyframes を作る

📄 `angular/packages/animations/browser/src/dsl/animation_timeline_builder.ts` L170–189 （▶ の行: 172, 184, 186, 189）

```ts
170 │   ): AnimationTimelineInstruction[] {
171 │     subInstructions = subInstructions || new ElementInstructionMap();
172 ▶     const context = new AnimationTimelineContext(
173 │       driver,
174 │       rootElement,
175 │       subInstructions,
176 │       enterClassName,
177 │       leaveClassName,
178 │       errors,
179 │       [],
180 │     );
181 │     context.options = options;
182 │     const delay = options.delay ? resolveTimingValue(options.delay) : 0;
183 │     context.currentTimeline.delayNextStep(delay);
184 ▶     context.currentTimeline.setStyles([startingStyles], null, context.errors, options);
185 │ 
186 ▶     visitDslNode(this, ast, context);
187 │ 
188 │     // this checks to see if an actual animation happened
189 ▶     const timelines = context.timelines.filter((timeline) => timeline.containsAnimation());
```

172 行目で文脈を作り（要素ごとの `TimelineBuilder` を持つ）、184 行目で開始のスタイルを置き、186 行目で 2 節と同じ `visitDslNode` で AST をたどります。189 行目、実際に何かが動く timeline だけを残します。

📄 `angular/packages/animations/browser/src/dsl/animation_timeline_builder.ts` L386–425 （▶ の行: 389–391, 398–400, 413–414, 421）

```ts
386 │   visitAnimate(ast: AnimateAst, context: AnimationTimelineContext) {
387 │     const timings = (context.currentAnimateTimings = this._visitTiming(ast.timings, context));
388 │     const timeline = context.currentTimeline;
389 ▶     if (timings.delay) {
390 ▶       context.incrementTime(timings.delay);
391 ▶       timeline.snapshotCurrentStyles();
392 │     }
393 │ 
394 │     const style = ast.style;
395 │     if (style.type == AnimationMetadataType.Keyframes) {
396 │       this.visitKeyframes(style, context);
397 │     } else {
398 ▶       context.incrementTime(timings.duration);
399 ▶       this.visitStyle(style as StyleAst, context);
400 ▶       timeline.applyStylesToKeyframe();
401 │     }
402 │ 
403 │     context.currentAnimateTimings = null;
404 │     context.previousNode = ast;
405 │   }
406 │ 
407 │   visitStyle(ast: StyleAst, context: AnimationTimelineContext) {
408 │     const timeline = context.currentTimeline;
409 │     const timings = context.currentAnimateTimings!;
410 │ 
411 │     // this is a special case for when a style() call
412 │     // directly follows  an animate() call (but not inside of an animate() call)
413 ▶     if (!timings && timeline.hasCurrentStyleProperties()) {
414 ▶       timeline.forwardFrame();
415 │     }
416 │ 
417 │     const easing = (timings && timings.easing) || ast.easing;
418 │     if (ast.isEmptyStep) {
419 │       timeline.applyEmptyStep(easing);
420 │     } else {
421 ▶       timeline.setStyles(ast.styles, easing, context.errors, context.options);
422 │     }
423 │ 
424 │     context.previousNode = ast;
425 │   }
```

📄 `angular/packages/animations/browser/src/dsl/animation_timeline_builder.ts` L810–830 （▶ の行: 814–815, 817, 822, 827–829）

```ts
810 │   private _loadKeyframe() {
811 │     if (this._currentKeyframe) {
812 │       this._previousKeyframe = this._currentKeyframe;
813 │     }
814 ▶     this._currentKeyframe = this._keyframes.get(this.duration)!;
815 ▶     if (!this._currentKeyframe) {
816 │       this._currentKeyframe = new Map();
817 ▶       this._keyframes.set(this.duration, this._currentKeyframe);
818 │     }
819 │   }
820 │ 
821 │   forwardFrame() {
822 ▶     this.duration += ONE_FRAME_IN_MILLISECONDS;
823 │     this._loadKeyframe();
824 │   }
825 │ 
826 │   forwardTime(time: number) {
827 ▶     this.applyStylesToKeyframe();
828 ▶     this.duration = time;
829 ▶     this._loadKeyframe();
830 │   }
```

📄 `angular/packages/animations/browser/src/dsl/animation_timeline_builder.ts` L860–894 （▶ の行: 870, 873–875, 882, 885, 889, 891）

```ts
860 │   setStyles(
861 │     input: Array<ɵStyleDataMap | string>,
862 │     easing: string | null,
863 │     errors: Error[],
864 │     options?: AnimationOptions,
865 │   ) {
866 │     if (easing) {
867 │       this._previousKeyframe.set('easing', easing);
868 │     }
869 │     const params = (options && options.params) || {};
870 ▶     const styles = flattenStyles(input, this._globalTimelineStyles);
871 │     for (let [prop, value] of styles) {
872 │       const val = interpolateParams(value, params, errors);
873 ▶       this._pendingStyles.set(prop, val);
874 ▶       if (!this._localTimelineStyles.has(prop)) {
875 ▶         this._backFill.set(prop, this._globalTimelineStyles.get(prop) ?? AUTO_STYLE);
876 │       }
877 │       this._updateStyle(prop, val);
878 │     }
879 │   }
880 │ 
881 │   applyStylesToKeyframe() {
882 ▶     if (this._pendingStyles.size == 0) return;
883 │ 
884 │     this._pendingStyles.forEach((val, prop) => {
885 ▶       this._currentKeyframe.set(prop, val);
886 │     });
887 │     this._pendingStyles.clear();
888 │ 
889 ▶     this._localTimelineStyles.forEach((val, prop) => {
890 │       if (!this._currentKeyframe.has(prop)) {
891 ▶         this._currentKeyframe.set(prop, val);
892 │       }
893 │     });
894 │   }
```

1. **`style(...)`（animate の外）**

   421 行目の `setStyles` は 873 行目で `_pendingStyles`（まだ keyframe に入れていない値）に置くだけです。874〜875 行目、この timeline で初めて出てきたプロパティは `_backFill` に `'*'`（いまの計算済みスタイル）を入れます。413〜414 行目、直前の keyframe にもう値があるときだけ、先に 1ms 進めます（822 行目の `forwardFrame`）。
2. **`animate(duration, style(...))`**

   389〜391 行目、delay があれば先にその分進めて今のスタイルを写します。398 行目で duration 分進め（827 行目で溜めていた値を今の keyframe に入れてから、828 行目で時刻を進め、814〜817 行目でその時刻の keyframe を用意）、399〜400 行目でその時刻に終わりのスタイルを入れます。
3. **keyframe に入れるとき**

   885 行目で溜めた値を入れ、889〜891 行目、この timeline で前に出てきたプロパティで今の keyframe に無いものは、前の値で埋めます。どの keyframe にもすべてのプロパティがそろうのはこのためです。

📄 `angular/packages/animations/browser/src/dsl/animation_timeline_builder.ts` L924–947 （▶ の行: 925, 928, 932, 941）

```ts
924 │   buildKeyframes(): AnimationTimelineInstruction {
925 ▶     this.applyStylesToKeyframe();
926 │     const preStyleProps = new Set<string>();
927 │     const postStyleProps = new Set<string>();
928 ▶     const isEmpty = this._keyframes.size === 1 && this.duration === 0;
929 │ 
930 │     let finalKeyframes: Array<ɵStyleDataMap> = [];
931 │     this._keyframes.forEach((keyframe, time) => {
932 ▶       const finalKeyframe = new Map([...this._backFill, ...keyframe]);
933 │       finalKeyframe.forEach((value, prop) => {
934 │         if (value === PRE_STYLE) {
935 │           preStyleProps.add(prop);
936 │         } else if (value === AUTO_STYLE) {
937 │           postStyleProps.add(prop);
938 │         }
939 │       });
940 │       if (!isEmpty) {
941 ▶         finalKeyframe.set('offset', time / this.duration);
942 │       }
943 │       finalKeyframes.push(finalKeyframe);
944 │     });
945 │ 
946 │     const preProps: string[] = [...preStyleProps.values()];
947 │     const postProps: string[] = [...postStyleProps.values()];
```

📄 `angular/packages/animations/browser/src/dsl/animation_timeline_builder.ts` L949–968 （▶ の行: 950–951, 953–954, 958）

```ts
949 │     // special case for a 0-second animation (which is designed just to place styles onscreen)
950 ▶     if (isEmpty) {
951 ▶       const kf0 = finalKeyframes[0];
952 │       const kf1 = new Map(kf0);
953 ▶       kf0.set('offset', 0);
954 ▶       kf1.set('offset', 1);
955 │       finalKeyframes = [kf0, kf1];
956 │     }
957 │ 
958 ▶     return createTimelineInstruction(
959 │       this.element,
960 │       finalKeyframes,
961 │       preProps,
962 │       postProps,
963 │       this.duration,
964 │       this.startTime,
965 │       this.easing,
966 │       false,
967 │     );
968 │   }
```

932 行目で各 keyframe の前に `_backFill` を敷き（後ろの値が勝つ）、941 行目で `offset = 時刻 / 全体の長さ` にします。950〜955 行目、長さ 0 の timeline（スタイルを置くだけ）は同じ keyframe を offset 0 と 1 に 2 つ並べます。958 行目の `createTimelineInstruction` が、第 16 回のエンジンが `driver.animate()` に渡す命令です。

> **🧪 DEMO（再現）— style / animate の並びから keyframes を作る**
>
> この章のコンポーネントの `miniBuildTimeline` は、上の `TimelineBuilder`（810〜968 行目）と `visitAnimate` / `visitStyle`（386〜425 行目）を、1 つの要素・`group` と `query` なしに絞って写した再現です。最初の 2 つは `animations/browser/test/dsl/animation_spec.ts` の it と同じ並びで、結果が spec の期待値と同じになることを ng test で確かめました（テストの節）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-legacy-dsl)

2 つ目の並び（spec 381 行目）では、animate のあとの `style({opacity: 0.6})` で 413〜414 行目の 1ms が入り、全体が 2001ms、offset が 0.4998 と 0.5002 になります。「1 フレーム後に値を飛ばす」ことを、時刻を 1ms ずらした 2 つの keyframe で表しているわけです。

### query で要素を探すのはここ

📄 `angular/packages/animations/browser/src/dsl/animation_timeline_builder.ts` L699–730 （▶ の行: 708–709, 713–714, 716–717, 726–727）

```ts
699 │   invokeQuery(
700 │     selector: string,
701 │     originalSelector: string,
702 │     limit: number,
703 │     includeSelf: boolean,
704 │     optional: boolean,
705 │     errors: Error[],
706 │   ): any[] {
707 │     let results: any[] = [];
708 ▶     if (includeSelf) {
709 ▶       results.push(this.element);
710 │     }
711 │     if (selector.length > 0) {
712 │       // only if :self is used then the selector can be empty
713 ▶       selector = selector.replace(ENTER_TOKEN_REGEX, '.' + this._enterClassName);
714 ▶       selector = selector.replace(LEAVE_TOKEN_REGEX, '.' + this._leaveClassName);
715 │       const multi = limit != 1;
716 ▶       let elements = this._driver.query(this.element, selector, multi);
717 ▶       if (limit !== 0) {
718 │         elements =
719 │           limit < 0
720 │             ? elements.slice(elements.length + limit, elements.length)
721 │             : elements.slice(0, limit);
722 │       }
723 │       results.push(...elements);
724 │     }
725 │ 
726 ▶     if (!optional && results.length == 0) {
727 ▶       errors.push(invalidQuery(originalSelector));
728 │     }
729 │     return results;
730 │   }
```

2 節では探さなかった `query` の要素は、timeline を作るこのときに 716 行目のドライバーの `query`（`querySelectorAll`）で探します。713〜714 行目、セレクタの `:enter` / `:leave` は、エンジンがこの flush で入った・出る要素に付けたクラス名に置き換わります（第 16 回の `_flushAnimations`）。726〜727 行目、1 つも見つからず `optional: true` でもなければ NG03014 を溜めます。溜まったエラーは 5 節の `build` から命令に入り、第 16 回の flush がまとめて投げます。

## 全体の流れ

- 👤 `animations: [trigger('open', [...])]` — あなたのコンポーネント — *ただのオブジェクト（1 節）*
  - `AnimationEngine.registerTrigger()` — animation\_engine\_next.ts — *型ごとに 1 回（第 14 回）*
    - `buildAnimationAst()` — animation\_ast\_builder.ts 119 — *visitTrigger → visitTransition → visitAnimate …、エラーを溜める*
      - `parseTransitionExpr()` — animation\_transition\_expr.ts 19 — *'void =&gt; \*' → matcher の配列*
    - `new AnimationTrigger()` — animation\_trigger.ts 22 — *states の Map と transitionFactories*
- `[@open] の値が変わる → flush` — 第 16 回
  - `AnimationTrigger.matchTransition()` — animation\_trigger.ts 50 — *書いた順で最初に一致したもの*
  - `AnimationTransitionFactory.build()` — animation\_transition\_factory.ts — *前後の state のスタイル*
    - `buildAnimationTimelines()` — animation\_timeline\_builder.ts — *時間を積み、query の要素を探す*
      - `TimelineBuilder.buildKeyframes()` — animation\_timeline\_builder.ts 924 — *offset を付けた keyframes → driver.animate()（第 16 回）*

## テストと直し方

DSL の spec は `packages/animations/browser/test/dsl/` にあり、どれも `//packages/animations/browser/test:test_web_chromium` に入っています。

📄 `angular/packages/animations/browser/test/dsl/animation_trigger_spec.ts` L37–57 （▶ の行: 38, 41, 44, 48, 52, 55）

```ts
37 │   describe('trigger validation', () => {
38 ▶     it('should group errors together for an animation trigger', () => {
39 │       expect(() => {
40 │         makeTrigger('myTrigger', [transition('12345', animate(3333))]);
41 ▶       }).toThrowError(/NG03403: Animation parsing for the myTrigger trigger have failed/);
42 │     });
43 │ 
44 ▶     it('should throw an error when a transition within a trigger contains an invalid expression', () => {
45 │       expect(() => {
46 │         makeTrigger('name', [transition('somethingThatIsWrong', animate(3333))]);
47 │       }).toThrowError(
48 ▶         /- NG03015: The provided transition expression "somethingThatIsWrong" is not supported/,
49 │       );
50 │     });
51 │ 
52 ▶     it('should throw an error if an animation alias is used that is not yet supported', () => {
53 │       expect(() => {
54 │         makeTrigger('name', [transition(':angular', animate(3333))]);
55 ▶       }).toThrowError(/- NG03016: The transition alias value ":angular" is not supported/);
56 │     });
57 │   });
```

📄 `angular/packages/animations/browser/test/dsl/animation_trigger_spec.ts` L274–288 （▶ の行: 275–276, 278, 282, 285）

```ts
274 │     describe('aliases', () => {
275 ▶       it('should alias the :enter transition as void => *', () => {
276 ▶         const result = makeTrigger('name', [transition(':enter', animate(3333))]);
277 │ 
278 ▶         const trans = buildTransition(result, element, 'void', 'something')!;
279 │         expect(trans.timelines[0].duration).toEqual(3333);
280 │       });
281 │ 
282 ▶       it('should alias the :leave transition as * => void', () => {
283 │         const result = makeTrigger('name', [transition(':leave', animate(3333))]);
284 │ 
285 ▶         const trans = buildTransition(result, element, 'something', 'void')!;
286 │         expect(trans.timelines[0].duration).toEqual(3333);
287 │       });
288 │     });
```

44〜49 行目は 3 節の 50 行目（NG03015）、52〜55 行目は 77 行目（NG03016）を確かめています。41 行目の NG03403（`TRIGGER_PARSING_FAILED`）は、spec の補助関数 `makeTrigger`（`test/shared.ts`）が溜まったエラーをまとめて投げるときのコードで、本物の `registerTrigger` は NG03404（`TRIGGER_BUILD_FAILED`）で投げます。275〜287 行目は 69・71 行目の別名です。**`:increment` / `:decrement` はこのファイルには無く**、`core/test/legacy_animation/legacy_animation_integration_spec.ts` の `describe(':increment')` と `describe(':decrement')` がテンプレートを通して確かめています。

📄 `angular/packages/animations/browser/test/dsl/animation_spec.ts` L300–337 （▶ の行: 300, 302–303, 312–313, 319, 334）

```ts
300 ▶       it('should produce a balanced series of keyframes given a sequence of animate steps', () => {
301 │         const steps = [
302 ▶           style({width: 0}),
303 ▶           animate(1000, style({height: 50})),
304 │           animate(1000, style({width: 100})),
305 │           animate(1000, style({height: 150})),
306 │           animate(1000, style({width: 200})),
307 │         ];
308 │ 
309 │         const players = invokeAnimationSequence(rootElement, steps);
310 │         expect(players[0].keyframes).toEqual([
311 │           new Map<string, string | number>([
312 ▶             ['height', AUTO_STYLE],
313 ▶             ['width', 0],
314 │             ['offset', 0],
315 │           ]),
316 │           new Map<string, string | number>([
317 │             ['height', 50],
318 │             ['width', 0],
319 ▶             ['offset', 0.25],
320 │           ]),
321 │           new Map<string, string | number>([
322 │             ['height', 50],
323 │             ['width', 100],
324 │             ['offset', 0.5],
325 │           ]),
326 │           new Map<string, string | number>([
327 │             ['height', 150],
328 │             ['width', 100],
329 │             ['offset', 0.75],
330 │           ]),
331 │           new Map<string, string | number>([
332 │             ['height', 150],
333 │             ['width', 200],
334 ▶             ['offset', 1],
335 │           ]),
336 │         ]);
337 │       });
```

📄 `angular/packages/animations/browser/test/dsl/animation_spec.ts` L381–410 （▶ の行: 381, 385, 390, 399, 403）

```ts
381 ▶       it('should not merge in successive style() calls to the previous animate() keyframe', () => {
382 │         const steps = [
383 │           style({opacity: 0}),
384 │           animate(1000, style({opacity: 0.5})),
385 ▶           style({opacity: 0.6}),
386 │           animate(1000, style({opacity: 1})),
387 │         ];
388 │ 
389 │         const players = invokeAnimationSequence(rootElement, steps);
390 ▶         const keyframes = humanizeOffsets(players[0].keyframes, 4);
391 │ 
392 │         expect(keyframes).toEqual([
393 │           new Map<string, string | number>([
394 │             ['opacity', 0],
395 │             ['offset', 0],
396 │           ]),
397 │           new Map<string, string | number>([
398 │             ['opacity', 0.5],
399 ▶             ['offset', 0.4998],
400 │           ]),
401 │           new Map<string, string | number>([
402 │             ['opacity', 0.6],
403 ▶             ['offset', 0.5002],
404 │           ]),
405 │           new Map<string, string | number>([
406 │             ['opacity', 1],
407 │             ['offset', 1],
408 │           ]),
409 │         ]);
410 │       });
```

312 行目の `height: AUTO_STYLE`（`'*'`）が 6 節の `_backFill`、399・403 行目の 0.4998 / 0.5002 が 413〜414 行目の 1ms です。

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/animations/browser/test:test_web_chromium \
  --test_output=all --nocache_test_results

# dsl/ の it を数える（Node 用の空の it を引く）
grep -cE "^\s*(it|fit)\(" packages/animations/browser/test/dsl/*.ts packages/animations/browser/test/dsl/style_normalizer/*.ts
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Chromium: |██████████████████████████████| 1/1 test files | 124 passed, 0 failed
Finished running tests in 0.3s, all tests passed!
INFO: Elapsed time: 1.509s, Critical Path: 0.88s
//packages/animations/browser/test:test_web_chromium                     PASSED in 0.8s

packages/animations/browser/test/dsl/animation_ast_builder_spec.ts:1
packages/animations/browser/test/dsl/animation_spec.ts:55
packages/animations/browser/test/dsl/animation_trigger_spec.ts:20
packages/animations/browser/test/dsl/style_normalizer/web_animations_style_normalizer_spec.ts:6
```

1. **124 件のうち dsl はいくつか**

   grep の数は 1 + 55 + 20 + 6 = 82 本です。`animation_spec.ts` と `animation_trigger_spec.ts` は `if (isNode)` の中に Node 用の空の `it('should pass')` を 1 本ずつ持つので、ブラウザで走るのは **80 本**です。残りの 44 本は `render/`（`transition_animation_engine_spec.ts` 31 本など。第 16 回）で、80 + 44 = 124 と合います。
2. **このサイトの ng test で、再現が spec と同じ結果になるか確かめた**

   `src/verify-d/dsl.spec.ts` から、この章の `miniBuildTimeline` と `miniParseTransitionExpr` を呼び、結果を `throw new Error('PROBE ' + JSON.stringify(r))` で取り出しました（`npx ng test --watch=false --include src/verify-d/dsl.spec.ts`、Vitest、確かめたあと消した）。

   | 呼び出し | 結果 |
   | --- | --- |
   | miniBuildTimeline(spec 300 行目の並び) | spec の 310〜336 行目の 5 つの keyframe と同じ（offset 0 / 0.25 / 0.5 / 0.75 / 1） |
   | miniBuildTimeline(spec 381 行目の並び) | duration 2001、offset 0 / 0.4998 / 0.5002 / 1（小数 4 桁で比べた。spec 392〜409 行目と同じ） |
   | miniParseTransitionExpr('a &lt;=&gt; b') | 関数 2 つ。a→b も b→a も一致（spec 128 行目の it と同じ） |
   | miniParseTransitionExpr('\* &lt;=&gt; \*') | 関数 1 つ（逆向きを足さない。60 行目） |
   | miniParseTransitionExpr('true =&gt; false') に true, false（boolean） | 一致。文字列の 'true' → 'false' も一致。数値の 1 → 0 は一致しない（97 行目は boolean のときだけ） |
   | miniParseTransitionExpr('1 =&gt; 0') に true, false（boolean） | 一致（90〜91 行目で 1 / 0 も真偽値の名前として扱う） |
   | miniParseTransitionExpr(':enter') | void → open は一致、closed → open は不一致。'\* =&gt; \*' は void → open にも一致 |
   | miniParseTransitionExpr(':increment') | 1 → 2、'2' → '10' は一致（parseFloat で数として比べる）。'a' → 'b' は不一致（NaN） |
   | miniParseTransitionExpr(':angular') | エラー NG03016 が 1 つ、関数は '\* =&gt; \*' の 1 つ（78 行目の戻り値で続ける） |
   | miniParseTransitionExpr('somethingThatIsWrong') | エラー NG03015 が 1 つ、関数は 0 |
3. **直すとしたら**

   式の読み方は `dsl/animation_transition_expr.ts`（spec は `dsl/animation_trigger_spec.ts`）、検証は `dsl/animation_ast_builder.ts`（`dsl/animation_spec.ts` の `describe('validation')`）、keyframes は `dsl/animation_timeline_builder.ts`（同じファイルの `describe('keyframe building')`）です。ターゲット全体が走るので、1 本だけ見たいときは作業コピーで `it` を `fit` にします（このシリーズでは ../angular を変えないので、試していません）。旧パッケージは v23 で消す予定なので、DSL の振る舞いを変える変更はまず入りません（[第 20 回](20-animations-issues.md)）。

## 聞かれそうな質問

**Q. :enter は何の別名ですか？**

`transition(':enter', ...)` の `:enter` は `'void => *'` の別名です（3 節の 69 行目）。`:leave` は `'* => void'`（71 行目）。エンジンは要素が入ってきた直後の値、消えるときの値を `'void'` にするので、この 2 つが「出る」「消える」になります。一方 `query(':enter')` の `:enter` は別物で、6 節の 713 行目でエンジンがその flush で入った要素に付けたクラス名に置き換わる、セレクタの中の印です。

**Q. state を書くとどうなりますか？**

4 節の 32〜35 行目で名前 → スタイルの Map になり、遷移のときは 5 節の 66・68 行目で前後の状態のスタイルとして timeline の両端に置かれます（88・89 行目）。遷移が 1 つも一致しないときも、エンジンは 72〜73 行目の「何も動かさない遷移」でその状態のスタイルを要素に置きます。`state('*', ...)` は、名前の無い状態のときに使われる既定です（factory の 43〜45 行目）。

**Q. query で見つからないとエラーになるのはどこですか？**

AST を作る 2 節（545 行目）ではなく、遷移が起きて keyframes を作る 6 節の 726〜727 行目です。そのため、テンプレートの書き間違いは `registerTrigger` のときではなく、最初にその遷移が走った flush で分かります。見つからなくてよいなら `query(sel, anim, {optional: true})` で、AST の 559 行目に残った `optional` が 726 行目の条件を外します。

**Q. transition は書いた順に意味がありますか？**

あります。4 節の 56〜57 行目は `find` なので、前に書いた `'* => *'` が後ろの `'open => closed'` より先に一致すれば、後ろは使われません。

**Q. DSL のエラーはいつ分かりますか？**

式やトリガー名の誤りは、そのコンポーネントの最初のインスタンスのレンダラーが作られるとき（第 14 回の `registerTrigger`）に、溜めたエラーがまとめて投げられます。`query` の 0 件は 1 つ前の質問のとおり遷移のときです。どちらも、DSL の関数を呼んだ時点（1 節）では分かりません。

## 読み終えて

- `trigger`・`transition`・`animate` などは `{type: 番号, ...}` を返すだけ。検証は `buildAnimationAst` がまとめて行い、エラーは配列に溜める。
- `'a => b, c <=> d'` はカンマで分けて matcher の配列になる。`:enter` は `'void => *'`、`:leave` は `'* => void'`、`void` も `*` 以外はただの名前。
- 値が変わると、書いた順で最初に一致した transition が選ばれ、前後の state のスタイルが timeline の両端に置かれる。
- `TimelineBuilder` は時刻ごとの keyframe に値を溜め、`_backFill` で最初の値を `'*'` にし、`offset = 時刻 / 長さ` を付ける。animate の直後の style は 1ms ずらした keyframe になる。
- `query` の要素はこのときに探し、0 件なら NG03014。DSL の spec は `animations/browser/test/dsl/` の 80 本で、ブラウザ版でだけ走る。

---

← 前: [旧 @angular/animations の入口：provideAnimations と AnimationRenderer](14-animations-legacy-setup.md)  
次: [TransitionAnimationEngine：トリガーの値が変わってからプレイヤーが動くまで](16-animations-legacy-engine.md) →
