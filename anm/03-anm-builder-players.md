[目次](../README.md) › [animations の説明文の読み残し](README.md) › 第 3 回 / 全 9 回

# AnimationBuilder とプレイヤーの説明文

> animations/src の animation\_builder.ts・players/animation\_player.ts・players/animation\_group\_player.ts・animation\_event.ts・errors.ts の未読の行：build と create が setProperty の命令になる道、AnimationPlayer の各メソッドの約束と 3 種のプレイヤーで記録した onStart・onDone・onDestroy の順、AnimationGroupPlayer の totalTime、AnimationEvent の各値、3000 番台のエラーの番号。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/anm-builder-players)

---

この章で分かること：`AnimationBuilder` で作ったアニメーションが、`build` と `create` と各メソッドの呼び出しをどうやってエンジンに届けるか。`AnimationPlayer` の各メソッドの説明文の約束を、本物の 3 種のプレイヤー（`NoopAnimationPlayer`・`AnimationGroupPlayer`・builder の player）で記録した呼び出しの順と比べます。`AnimationEvent` の各値と、エラーの番号の一覧も読みます。食い違いと不具合は 6 つありました。builder の player の `getPosition()` は別の player の値を返すことがあり、`totalTime` はいつも 0 です。同じ factory から 2 回 `create` すると、1 つ目の player が 2 つ目の要素を動かします。`reset()` のあとに足した `onStart` は 2 回呼ばれます。`AnimationGroupPlayer` は `reset()` のあとにコールバックを呼びません。`destroy()` の説明の「`beforeDestroy()` を呼んでから」はどのプレイヤーにも無く、play せずに壊したときの順は 3 種で違います。

読む対象は `packages/animations/src/` の `animation_builder.ts`・`players/animation_player.ts`・`players/animation_group_player.ts`・`animation_event.ts`・`errors.ts` です（../angular、8576f161ae4）。このシリーズより前に引かれているのは animation\_player.ts の L161〜172（`NoopAnimationPlayer.play` と microtask。[TransitionAnimationEngine の章](../animations/16-animations-legacy-engine.md)の 6 節）だけです。builder の命令を受け取るエンジンの側（`TimelineAnimationEngine`）は[第 6 回](06-anm-engine.md)、`WebAnimationsPlayer` は[第 7 回](07-anm-driver.md)、`@@` の名前を横取りする `AnimationRenderer` は[旧パッケージの入口の章](../animations/14-animations-legacy-setup.md)の 4〜6 節です。DEMO の作り方は[第 1 回](01-anm-trigger-state.md)の冒頭の囲みと同じです。

1. [1. trigger・state・style・animate](01-anm-trigger-state.md)
2. [2. transition・query・stagger](02-anm-transition-query.md)
3. **3. AnimationBuilder とプレイヤー**（この章）
4. [4. DSL を AST に](04-anm-ast.md)
5. [5. タイムライン](05-anm-timeline.md)
6. [6. 遷移のエンジン](06-anm-engine.md)
7. [7. Web Animations のドライバー](07-anm-driver.md)
8. [8. provideAnimations](08-anm-module.md)
9. [9. spec と issue](09-anm-tests-issues.md)

## 1. AnimationBuilder の説明文と例

📄 `angular/packages/animations/src/animation_builder.ts` L27–66 （▶ の行: 28–30, 34–35, 37, 40–41, 43, 45, 50–51, 54, 58–60, 64, 66）

````ts
27 │ /**
28 ▶  * An injectable service that produces an animation sequence programmatically within an
29 ▶  * Angular component or directive.
30 ▶  * Provided by the `BrowserAnimationsModule` or `NoopAnimationsModule`.
31 │  *
32 │  * @usageNotes
33 │  *
34 ▶  * To use this service, add it to your component or directive as a dependency.
35 ▶  * The service is instantiated along with your component.
36 │  *
37 ▶  * Apps do not typically need to create their own animation players, but if you
38 │  * do need to, follow these steps:
39 │  *
40 ▶  * 1. Use the <code>[AnimationBuilder.build](api/animations/AnimationBuilder#build)()</code> method
41 ▶  * to create a programmatic animation. The method returns an `AnimationFactory` instance.
42 │  *
43 ▶  * 2. Use the factory object to create an `AnimationPlayer` and attach it to a DOM element.
44 │  *
45 ▶  * 3. Use the player object to control the animation programmatically.
46 │  *
47 │  * For example:
48 │  *
49 │  * ```ts
50 ▶  * // import the service from BrowserAnimationsModule
51 ▶  * import {AnimationBuilder} from '@angular/animations';
52 │  * // require the service as a dependency
53 │  * class MyCmp {
54 ▶  *   constructor(private _builder: AnimationBuilder) {}
55 │  *
56 │  *   makeAnimation(element: any) {
57 │  *     // first define a reusable animation
58 ▶  *     const myAnimation = this._builder.build([
59 ▶  *       style({ width: 0 }),
60 ▶  *       animate(1000, style({ width: '100px' }))
61 │  *     ]);
62 │  *
63 │  *     // use the returned factory object to create a player
64 ▶  *     const player = myAnimation.create(element);
65 │  *
66 ▶  *     player.play();
````

📄 `angular/packages/animations/src/animation_builder.ts` L70–84 （▶ の行: 73, 75–76, 79–80, 83）

```ts
70 │  *
71 │  * @publicApi
72 │  *
73 ▶  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
74 │  */
75 ▶ @Service({factory: () => inject(BrowserAnimationBuilder)})
76 ▶ export abstract class AnimationBuilder {
77 │   /**
78 │    * Builds a factory for producing a defined animation.
79 ▶    * @param animation A reusable animation definition.
80 ▶    * @returns A factory object that can create a player for the defined animation.
81 │    * @see {@link animate}
82 │    */
83 ▶   abstract build(animation: AnimationMetadata | AnimationMetadata[]): AnimationFactory;
84 │ }
```

40〜45 行目の 3 つの手順のとおり、`build` が `AnimationFactory` を返し、`create` が player を作り、player を手で操作します。DEMO の「説明文の例」で 58〜66 行目をそのまま動かすと、`build` の返り値は `BrowserAnimationFactory`、`create` の返り値は `RendererAnimationPlayer`、`play()` のあと要素に 1000ms の Web Animation（width 0px → 100px）ができ、時刻表は 0・250・500・750・1000ms で 0・25・50・75・100px でした。

1. **30 行目「BrowserAnimationsModule か NoopAnimationsModule が provide する」**

   75 行目は `@Service({factory: () => inject(BrowserAnimationBuilder)})` で、どのモジュールも provide していません（root で作られる）。provider を置かずに inject すると、作るところで 2 節の NG03600 になります。75 行目の形は a7dab601faf（2026-05-01、``refactor(core): use the `@Service` decorator where possible.``）、その前の root での provide は 1c4a3677eb4（2023-10-07、``refactor(animations): make `AnimationBuilder` tree-shakable (#52097)``）からです。
2. **50〜51 行目「BrowserAnimationsModule から import する」**

   実際の import の先は `@angular/animations` です。また例は `style` と `animate` を import しておらず、54 行目のコンストラクターの引数で DI するには `MyCmp` にデコレーターが要ります。strict の ngc で TS2304 が 3 つでした（下の記録）。
3. **35 行目「サービスはコンポーネントと一緒に作られる」**

   75 行目のとおり root に 1 つで、コンポーネントごとには作られません。

📄 `型の確かめ（手元の記録、2026-11-23）`

```
// strict の ngc（TypeScript 6.0.3、@angular/* 22.2.6）に説明文の例を通した結果
ex-builder.ts:11:7 - error TS2304: Cannot find name 'style'.      // animation_builder.ts L49〜69
ex-builder.ts:12:7 - error TS2304: Cannot find name 'animate'.
ex-builder.ts:12:21 - error TS2304: Cannot find name 'style'.
（ex-event.ts の animation_event.ts L14〜35 は 0 件。import が無いので AnimationEvent は DOM の型になっている）
```

## 2. BrowserAnimationBuilder：レンダラーを 1 つ作り、無ければ NG03600

📄 `angular/packages/animations/src/animation_builder.ts` L108–143 （▶ の行: 110–111, 116–118, 120, 122, 124, 127–128, 131, 137–141）

```ts
108 │ @Injectable({providedIn: 'root'})
109 │ export class BrowserAnimationBuilder extends AnimationBuilder {
110 ▶   private animationModuleType = inject(ANIMATION_MODULE_TYPE, {optional: true});
111 ▶   private _nextAnimationId = 0;
112 │   private _renderer: Renderer2;
113 │ 
114 │   constructor(rootRenderer: RendererFactory2, @Inject(DOCUMENT) doc: Document) {
115 │     super();
116 ▶     const typeData: RendererType2 = {
117 ▶       id: '0',
118 ▶       encapsulation: ViewEncapsulation.None,
119 │       styles: [],
120 ▶       data: {animation: []},
121 │     };
122 ▶     this._renderer = rootRenderer.createRenderer(doc.body, typeData);
123 │ 
124 ▶     if (this.animationModuleType === null && !isAnimationRenderer(this._renderer)) {
125 │       // We only support AnimationRenderer & DynamicDelegationRenderer for this AnimationBuilder
126 │ 
127 ▶       throw new RuntimeError(
128 ▶         RuntimeErrorCode.BROWSER_ANIMATION_BUILDER_INJECTED_WITHOUT_ANIMATIONS,
129 │         (typeof ngDevMode === 'undefined' || ngDevMode) &&
130 │           'Angular detected that the `AnimationBuilder` was injected, but animation support was not enabled. ' +
131 ▶             'Please make sure that you enable animations in your application by calling `provideAnimations()` or `provideAnimationsAsync()` function.',
132 │       );
133 │     }
134 │   }
135 │ 
136 │   override build(animation: AnimationMetadata | AnimationMetadata[]): AnimationFactory {
137 ▶     const id = this._nextAnimationId;
138 ▶     this._nextAnimationId++;
139 ▶     const entry = Array.isArray(animation) ? sequence(animation) : animation;
140 ▶     issueAnimationCommand(this._renderer, null, id, 'register', [entry]);
141 ▶     return new BrowserAnimationFactory(id, this._renderer);
142 │   }
143 │ }
```

1. **116〜122 行目：body にレンダラーを 1 つ作る**

   `data: {animation: []}` を持つ型なので、`provideAnimations()` があれば `AnimationRenderer` が返ります（[旧パッケージの入口の章](../animations/14-animations-legacy-setup.md)の 3 節の L43）。以後のすべての命令は、このレンダラーの `setProperty` と `listen` を通ります。
2. **124〜133 行目：ANIMATION\_MODULE\_TYPE が無く、AnimationRenderer でもなければ NG03600**

   DEMO の「provider の有無」で、provider なしの `inject(AnimationBuilder)` は「NG03600: Angular detected that the \`AnimationBuilder\` was injected, but animation support was not enabled. …」、本番は `NG03600` だけでした。`provideNoopAnimations()` では作れ、play すると Web Animation は 0 個のまま onStart と onDone が来ました。
3. **137〜141 行目：build は番号を振って register を送る**

   137〜138 行目で builder ごとの通し番号を id にし、139 行目で配列を `sequence` に包み、140 行目で `'register'` の命令を送ります。DSL の誤りはこのときエンジンの `buildAnimationAst` で見つかり、`build()` が NG03503 を投げます（[第 4 回](04-anm-ast.md)の 2 節）。

## 3. 命令は setProperty の「@@番号:命令」で送られる

📄 `angular/packages/animations/src/animation_builder.ts` L86–106 （▶ の行: 96–99, 101–102, 105）

```ts
 86 │ /**
 87 │  * A factory object returned from the
 88 │  * <code>[AnimationBuilder.build](api/animations/AnimationBuilder#build)()</code>
 89 │  * method.
 90 │  *
 91 │  * @publicApi
 92 │  *
 93 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
 94 │  */
 95 │ export abstract class AnimationFactory {
 96 ▶   /**
 97 ▶    * Creates an `AnimationPlayer` instance for the reusable animation defined by
 98 ▶    * the <code>[AnimationBuilder.build](api/animations/AnimationBuilder#build)()</code>
 99 ▶    * method that created this factory and attaches the new player a DOM element.
100 │    *
101 ▶    * @param element The DOM element to which to attach the player.
102 ▶    * @param options A set of options that can include a time delay and
103 │    * additional developer-defined parameters.
104 │    */
105 ▶   abstract create(element: any, options?: AnimationOptions): AnimationPlayer;
106 │ }
```

📄 `angular/packages/animations/src/animation_builder.ts` L145–169 （▶ の行: 147, 153–154, 163, 168）

```ts
145 │ class BrowserAnimationFactory extends AnimationFactory {
146 │   constructor(
147 ▶     private _id: number,
148 │     private _renderer: Renderer2,
149 │   ) {
150 │     super();
151 │   }
152 │ 
153 ▶   override create(element: any, options?: AnimationOptions): AnimationPlayer {
154 ▶     return new RendererAnimationPlayer(this._id, element, options || {}, this._renderer);
155 │   }
156 │ }
157 │ 
158 │ class RendererAnimationPlayer implements AnimationPlayer {
159 │   public parentPlayer: AnimationPlayer | null = null;
160 │   private _started = false;
161 │ 
162 │   constructor(
163 ▶     public id: number,
164 │     public element: any,
165 │     options: AnimationOptions,
166 │     private _renderer: Renderer2,
167 │   ) {
168 ▶     this._command('create', options);
169 │   }
```

📄 `angular/packages/animations/src/animation_builder.ts` L236–267 （▶ の行: 243, 247–248, 254–255, 257–258, 264–266）

```ts
236 │ function issueAnimationCommand(
237 │   renderer: Renderer2,
238 │   element: any,
239 │   id: number,
240 │   command: string,
241 │   args: any[],
242 │ ): void {
243 ▶   renderer.setProperty(element, `@@${id}:${command}`, args);
244 │ }
245 │ 
246 │ /**
247 ▶  * The following 2 methods cannot reference their correct types (AnimationRenderer &
248 ▶  * DynamicDelegationRenderer) since this would introduce a import cycle.
249 │  */
250 │ 
251 │ function unwrapAnimationRenderer(
252 │   renderer: Renderer2,
253 │ ): {engine: {players: AnimationPlayer[]}} | null {
254 ▶   const type = (renderer as unknown as {ɵtype: AnimationRendererType}).ɵtype;
255 ▶   if (type === AnimationRendererType.Regular) {
256 │     return renderer as any;
257 ▶   } else if (type === AnimationRendererType.Delegated) {
258 ▶     return (renderer as any).animationRenderer;
259 │   }
260 │ 
261 │   return null;
262 │ }
263 │ 
264 ▶ function isAnimationRenderer(renderer: Renderer2): boolean {
265 ▶   const type = (renderer as unknown as {ɵtype: AnimationRendererType}).ɵtype;
266 ▶   return type === AnimationRendererType.Regular || type === AnimationRendererType.Delegated;
267 │ }
```

243 行目のとおり、どの命令も `renderer.setProperty(element, '@@0:play', args)` のような 1 行です。`AnimationRenderer` は `@` で始まる名前を横取りし、エンジンはさらに `@` で始まるもの（元が `@@`）を `TimelineAnimationEngine` への命令にします（[旧パッケージの入口の章](../animations/14-animations-legacy-setup.md)の 4 節）。命令を受け取る `command` の switch は[第 6 回](06-anm-engine.md)が読みます。

96〜99 行目は「この factory を作った build のアニメーションの player を作って要素に付ける」です。ところが 147 行目の id は factory に 1 つで、154 行目の `create` は同じ id の player を何個でも作ります。168 行目の `'create'` を受けたエンジンは、id をキーにした Map に player を入れる（timeline\_animation\_engine.ts L128 の `this._playersById.set(id, player)`）ので、2 回目の create は 1 回目の player を上書きします。DEMO の「2 回 create」の記録は次のとおりです。

| 操作 | 記録 |
| --- | --- |
| `p1 = f.create(a); p2 = f.create(b)` | `p1 === p2` は false、`p1.id` も `p2.id` も 0 |
| `p1.play()` | a の Web Animation は 0 個、b に 1 個（running） |
| `p1.destroy()` | a も b も 0 個（b の player が壊された） |
| `p2.play()` | NG03301「Unable to find the timeline player referenced by 0」 |

この形は、builder が入った 16c8167886d（2017-04-26、`feat(animations): introduce a wave of new animation features`）からです。1 つの要素ごとに `build` から呼び直せば、id は分かれます。247〜248 行目のコメントのとおり、251〜267 行目の 2 つの関数は、型を import すると循環になるので `ɵtype` の番号で `AnimationRenderer`（Regular）か非同期の `DynamicDelegationRenderer`（Delegated）かを見分けます。Delegated なら中の `animationRenderer` を使います（258 行目）。

## 4. RendererAnimationPlayer：コールバックは後で来る、位置と長さは正しくない

📄 `angular/packages/animations/src/animation_builder.ts` L171–202 （▶ の行: 172, 176, 179–180, 183–184, 187–188, 195–196, 199–201）

```ts
171 │   private _listen(eventName: string, callback: (event: any) => any): () => void {
172 ▶     return this._renderer.listen(this.element, `@@${this.id}:${eventName}`, callback);
173 │   }
174 │ 
175 │   private _command(command: string, ...args: any[]): void {
176 ▶     issueAnimationCommand(this._renderer, this.element, this.id, command, args);
177 │   }
178 │ 
179 ▶   onDone(fn: () => void): void {
180 ▶     this._listen('done', fn);
181 │   }
182 │ 
183 ▶   onStart(fn: () => void): void {
184 ▶     this._listen('start', fn);
185 │   }
186 │ 
187 ▶   onDestroy(fn: () => void): void {
188 ▶     this._listen('destroy', fn);
189 │   }
190 │ 
191 │   init(): void {
192 │     this._command('init');
193 │   }
194 │ 
195 ▶   hasStarted(): boolean {
196 ▶     return this._started;
197 │   }
198 │ 
199 ▶   play(): void {
200 ▶     this._command('play');
201 ▶     this._started = true;
202 │   }
```

📄 `angular/packages/animations/src/animation_builder.ts` L203–234 （▶ の行: 220–222, 225–226, 229–230, 233）

```ts
203 │ 
204 │   pause(): void {
205 │     this._command('pause');
206 │   }
207 │ 
208 │   restart(): void {
209 │     this._command('restart');
210 │   }
211 │ 
212 │   finish(): void {
213 │     this._command('finish');
214 │   }
215 │ 
216 │   destroy(): void {
217 │     this._command('destroy');
218 │   }
219 │ 
220 ▶   reset(): void {
221 ▶     this._command('reset');
222 ▶     this._started = false;
223 │   }
224 │ 
225 ▶   setPosition(p: number): void {
226 ▶     this._command('setPosition', p);
227 │   }
228 │ 
229 ▶   getPosition(): number {
230 ▶     return unwrapAnimationRenderer(this._renderer)?.engine?.players[this.id]?.getPosition() ?? 0;
231 │   }
232 │ 
233 ▶   public totalTime = 0;
234 │ }
```

1. **172 行目：onDone などは renderer の listen**

   `'@@0:done'` の名前で listen します。`AnimationRenderer.listen` はエンジンからの呼び出しを `scheduleListenerCallback` に回し（renderer.ts L204〜206）、builder の event には flush の番号が無いので -1 になり、microtask にまとめて呼ばれます（animation\_renderer.ts L95〜112、[旧パッケージの入口の章](../animations/14-animations-legacy-setup.md)の 6 節）。DEMO の「呼ばれる順」で、builder の player だけ `play() | onStart µ`（play から戻ったあとの microtask で onStart）でした。
2. **195〜201 行目：hasStarted は自分の印**

   本物の player の状態ではなく、play で true、reset（222 行目）で false にするだけです。
3. **229〜230 行目：getPosition は engine.players\[this.id\]**

   `engine.players` は `[...transitionEngine.players, ...timelineEngine.players]`（animation\_engine\_next.ts L128〜130）で、並びは「いま動いている player の順」です。添字の id とは合いません。
4. **233 行目：totalTime = 0**

   本物の player の長さを読まず、いつも 0 です。

| 操作 | getPosition() と Web Animation の currentTime（記録） |
| --- | --- |
| 1 つだけ build・create して `setPosition(0.5)` | 0.5、currentTime=500（id 0 と players\[0\] が同じ） |
| 2 つ build（id 0・1）、2 つ目だけ create して `setPosition(0.5)` | 0（players\[1\] が無い）、currentTime=500 |
| あとから 1 つ目も create して `setPosition(0.25)` | `pa.getPosition()` が 0.5、`pb.getPosition()` が 0.25（入れ替わる） |
| pb を destroy | `pa.getPosition()` が 0.25（players が \[pa\] になり、たまたま合う） |
| `[@t]` の 5000ms の遷移が動いている間に、1 つだけ build・create して `setPosition(0.5)` | 0（players\[0\] は `[@t]` の player）、currentTime=500 |
| `build([query('div', animate(400…)), animate(700…)])` の player | totalTime=0（Web Animation は 400・400・700ms） |

`players[+this.id]` の形は ca08625227d（2020-12-02、`fix(animations): implement getPosition in browser animation builder (#39983)`）で入り、1c4a3677eb4（2023）で `unwrapAnimationRenderer(…)?.engine?.players[this.id]` に書き換わりました。`[@trigger]` の遷移が動いていると、その player が配列の前に入るので、id 0 でもずれます。記録では、5000ms の `[@t]` が動いている間に作った id 0 の player は、`setPosition(0.5)`（要素の currentTime=500）のあと `getPosition()` が 0 で、読んだのは currentTime=0 の `[@t]` の player でした。`totalTime = 0` は 16c8167886d（2017）からです。

## 5. AnimationPlayer の約束と NoopAnimationPlayer

📄 `angular/packages/animations/src/players/animation_player.ts` L9–47 （▶ の行: 10–14, 26, 30, 32, 36, 38, 43, 45, 47）

```ts
 9 │ /**
10 ▶  * Provides programmatic control of a reusable animation sequence,
11 ▶  * built using the <code>[AnimationBuilder.build](api/animations/AnimationBuilder#build)()</code>
12 ▶  * method which returns an `AnimationFactory`, whose
13 ▶  * <code>[create](api/animations/AnimationFactory#create)()</code> method instantiates and
14 ▶  * initializes this interface.
15 │  *
16 │  * @see {@link AnimationBuilder}
17 │  * @see {@link AnimationFactory}
18 │  * @see {@link animate}
19 │  *
20 │  * @publicApi
21 │  *
22 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
23 │  */
24 │ export interface AnimationPlayer {
25 │   /**
26 ▶    * Provides a callback to invoke when the animation finishes.
27 │    * @param fn The callback function.
28 │    * @see {@link #finish}
29 │    */
30 ▶   onDone(fn: () => void): void;
31 │   /**
32 ▶    * Provides a callback to invoke when the animation starts.
33 │    * @param fn The callback function.
34 │    * @see {@link #play}
35 │    */
36 ▶   onStart(fn: () => void): void;
37 │   /**
38 ▶    * Provides a callback to invoke after the animation is destroyed.
39 │    * @param fn The callback function.
40 │    * @see {@link #destroy}
41 │    * @see {@link #beforeDestroy}
42 │    */
43 ▶   onDestroy(fn: () => void): void;
44 │   /**
45 ▶    * Initializes the animation.
46 │    */
47 ▶   init(): void;
```

📄 `angular/packages/animations/src/players/animation_player.ts` L48–87 （▶ の行: 49–50, 54, 56, 62, 64, 66, 68, 70–71, 73, 75, 77, 80, 85）

```ts
48 │   /**
49 ▶    * Reports whether the animation has started.
50 ▶    * @returns True if the animation has started, false otherwise.
51 │    */
52 │   hasStarted(): boolean;
53 │   /**
54 ▶    * Runs the animation, invoking the `onStart()` callback.
55 │    */
56 ▶   play(): void;
57 │   /**
58 │    * Pauses the animation.
59 │    */
60 │   pause(): void;
61 │   /**
62 ▶    * Restarts the paused animation.
63 │    */
64 ▶   restart(): void;
65 │   /**
66 ▶    * Ends the animation, invoking the `onDone()` callback.
67 │    */
68 ▶   finish(): void;
69 │   /**
70 ▶    * Destroys the animation, after invoking the `beforeDestroy()` callback.
71 ▶    * Calls the `onDestroy()` callback when destruction is completed.
72 │    */
73 ▶   destroy(): void;
74 │   /**
75 ▶    * Resets the animation to its initial state.
76 │    */
77 ▶   reset(): void;
78 │   /**
79 │    * Sets the position of the animation.
80 ▶    * @param position A fractional value, representing the progress through the animation.
81 │    */
82 │   setPosition(position: number): void;
83 │   /**
84 │    * Reports the current position of the animation.
85 ▶    * @returns A fractional value, representing the progress through the animation.
86 │    */
87 │   getPosition(): number;
```

📄 `angular/packages/animations/src/players/animation_player.ts` L88–110 （▶ の行: 93, 95, 97, 99, 101, 104, 109）

```ts
 88 │   /**
 89 │    * The parent of this player, if any.
 90 │    */
 91 │   parentPlayer: AnimationPlayer | null;
 92 │   /**
 93 ▶    * The total run time of the animation, in milliseconds.
 94 │    */
 95 ▶   readonly totalTime: number;
 96 │   /**
 97 ▶    * Provides a callback to invoke before the animation is destroyed.
 98 │    */
 99 ▶   beforeDestroy?: () => any;
100 │   /**
101 ▶    * @internal
102 │    * Internal
103 │    */
104 ▶   triggerCallback?: (phaseName: string) => void;
105 │   /**
106 │    * @internal
107 │    * Internal
108 │    */
109 ▶   disabled?: boolean;
110 │ }
```

10〜14 行目は「`AnimationBuilder.build` → `AnimationFactory.create` で作られる」としていますが、同じ interface をエンジンの `TransitionAnimationPlayer` や `WebAnimationsPlayer` も実装します。各メソッドの説明は 1 行ずつで、呼ばれる時期（同期か microtask か）は書かれていません。70〜71 行目の destroy は「`beforeDestroy()` を呼んでから壊し、終わったら `onDestroy()`」です。

📄 `angular/packages/animations/src/players/animation_player.ts` L112–145 （▶ の行: 113–115, 128–129, 136–137, 140–143）

```ts
112 │ /**
113 ▶  * An empty programmatic controller for reusable animations.
114 ▶  * Used internally when animations are disabled, to avoid
115 ▶  * checking for the null case when an animation player is expected.
116 │  *
117 │  * @see {@link animate}
118 │  * @see {@link AnimationPlayer}
119 │  *
120 │  * @publicApi
121 │  *
122 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
123 │  */
124 │ export class NoopAnimationPlayer implements AnimationPlayer {
125 │   private _onDoneFns: Function[] = [];
126 │   private _onStartFns: Function[] = [];
127 │   private _onDestroyFns: Function[] = [];
128 ▶   private _originalOnDoneFns: Function[] = [];
129 ▶   private _originalOnStartFns: Function[] = [];
130 │   private _started = false;
131 │   private _destroyed = false;
132 │   private _finished = false;
133 │   private _position = 0;
134 │   public parentPlayer: AnimationPlayer | null = null;
135 │   public readonly totalTime: number;
136 ▶   constructor(duration: number = 0, delay: number = 0) {
137 ▶     this.totalTime = duration + delay;
138 │   }
139 │   private _onFinish() {
140 ▶     if (!this._finished) {
141 ▶       this._finished = true;
142 ▶       this._onDoneFns.forEach((fn) => fn());
143 ▶       this._onDoneFns = [];
144 │     }
145 │   }
```

📄 `angular/packages/animations/src/players/animation_player.ts` L146–160 （▶ の行: 147–148, 151–152）

```ts
146 │   onStart(fn: () => void): void {
147 ▶     this._originalOnStartFns.push(fn);
148 ▶     this._onStartFns.push(fn);
149 │   }
150 │   onDone(fn: () => void): void {
151 ▶     this._originalOnDoneFns.push(fn);
152 ▶     this._onDoneFns.push(fn);
153 │   }
154 │   onDestroy(fn: () => void): void {
155 │     this._onDestroyFns.push(fn);
156 │   }
157 │   hasStarted(): boolean {
158 │     return this._started;
159 │   }
160 │   init(): void {}
```

📄 `angular/packages/animations/src/players/animation_player.ts` L173–212 （▶ の行: 181–182, 184–185, 187–188, 190–191, 195–199, 202, 205, 210, 212）

```ts
173 │ 
174 │   private _onStart() {
175 │     this._onStartFns.forEach((fn) => fn());
176 │     this._onStartFns = [];
177 │   }
178 │ 
179 │   pause(): void {}
180 │   restart(): void {}
181 ▶   finish(): void {
182 ▶     this._onFinish();
183 │   }
184 ▶   destroy(): void {
185 ▶     if (!this._destroyed) {
186 │       this._destroyed = true;
187 ▶       if (!this.hasStarted()) {
188 ▶         this._onStart();
189 │       }
190 ▶       this.finish();
191 ▶       this._onDestroyFns.forEach((fn) => fn());
192 │       this._onDestroyFns = [];
193 │     }
194 │   }
195 ▶   reset(): void {
196 ▶     this._started = false;
197 ▶     this._finished = false;
198 ▶     this._onStartFns = this._originalOnStartFns;
199 ▶     this._onDoneFns = this._originalOnDoneFns;
200 │   }
201 │   setPosition(position: number): void {
202 ▶     this._position = this.totalTime ? position * this.totalTime : 1;
203 │   }
204 │   getPosition(): number {
205 ▶     return this.totalTime ? this._position / this.totalTime : 1;
206 │   }
207 │ 
208 │   /** @internal */
209 │   triggerCallback(phaseName: string): void {
210 ▶     const methods = phaseName == 'start' ? this._onStartFns : this._onDoneFns;
211 │     methods.forEach((fn) => fn());
212 ▶     methods.length = 0;
```

DEMO の「呼ばれる順」は、3 種のプレイヤーに `onStart`・`onDone`・`onDestroy` を登録し、メソッドを 1 つずつ同期に呼んで、戻った所に `|`、microtask を待った所に `µ` を書いた記録です（Noop は 1000ms、Group は Noop の 500ms と 1000ms、builder の player の中身は `WebAnimationsPlayer`）。

| 呼び方 | NoopAnimationPlayer | AnimationGroupPlayer | builder の player |
| --- | --- | --- | --- |
| play | `onStart \| onDone µ` | `onStart \| onDone µ` | `\| onStart µ` |
| play → finish → destroy | `onStart \| onDone µ``\| µ``onDestroy \|` | 同じ | `\| onStart µ``\| onDone µ``\| onDestroy µ` |
| play せずに destroy | `onStart onDone onDestroy \|`（hasStarted=false） | `onDone onStart onDestroy \|`（hasStarted=true） | `\| onDone onDestroy µ`（onStart なし） |
| finish → play | `onDone \|``onStart \|` | 同じ | `\| onDone µ``\| onStart µ` |
| play → finish → reset → play → finish | reset のあとの play で onStart と onDone がもう一度 | reset のあとは何も呼ばれない | reset のあとの play で onStart、finish で onDone |
| reset → onStart(2) を登録 → play | `onStart onStart(2) onStart(2) \|` | `onStart onStart(2) \|` | `\| onStart onStart(2) onStart(2) µ` |

1. **reset のあとに足した onStart が 2 回（198〜199 行目）**

   198 行目で `_onStartFns` に `_originalOnStartFns` の配列**そのもの**を入れるので、以後の 147〜148 行目は同じ配列に 2 回 push します。`WebAnimationsPlayer.reset`（web\_animations\_player.ts L167〜174）も同じ形で、builder の player でも 2 回でした。さらに 212 行目の `methods.length = 0` は、その共有された配列（= 最初の登録の一覧）を空にします。この形は 342effeb7d4（2022-06-11、`fix(animations): reset the start and done fns on player reset (#46364)`、#26630 を直した変更）で入りました。
2. **destroy は beforeDestroy を呼ばない（184〜193 行目）**

   Noop は play していなければ 188 行目で onStart を呼び、190 行目の finish で onDone、191 行目で onDestroy です。Group と builder の player は順が違い、どれも `beforeDestroy` を呼びません（Noop には `beforeDestroy` 自体が無い）。`beforeDestroy` を呼ぶのはエンジンで、前の player の途中のスタイルを写すためです（[TransitionAnimationEngine の章](../animations/16-animations-legacy-engine.md)の質問の最後）。
3. **setPosition と getPosition（202・205 行目）**

   長さ 0 のときは位置をいつも 1 として扱います。Noop の 1000ms で `setPosition(0.5)` は getPosition 0.5 でした。

## 6. AnimationGroupPlayer：子が全部そろったら

📄 `angular/packages/animations/src/players/animation_group_player.ts` L11–40 （▶ の行: 12–13, 16, 31, 36, 38–39）

```ts
11 │ /**
12 ▶  * A programmatic controller for a group of reusable animations.
13 ▶  * Used internally to control animations.
14 │  *
15 │  * @see {@link AnimationPlayer}
16 ▶  * @see {@link animations/group group}
17 │  *
18 │  */
19 │ export class AnimationGroupPlayer implements AnimationPlayer {
20 │   private _onDoneFns: Function[] = [];
21 │   private _onStartFns: Function[] = [];
22 │   private _finished = false;
23 │   private _started = false;
24 │   private _destroyed = false;
25 │   private _onDestroyFns: Function[] = [];
26 │ 
27 │   public parentPlayer: AnimationPlayer | null = null;
28 │   public totalTime: number = 0;
29 │   public readonly players: AnimationPlayer[];
30 │ 
31 ▶   constructor(_players: AnimationPlayer[]) {
32 │     this.players = _players;
33 │     let doneCount = 0;
34 │     let destroyCount = 0;
35 │     let startCount = 0;
36 ▶     const total = this.players.length;
37 │ 
38 ▶     if (total == 0) {
39 ▶       queueMicrotask(() => this._onFinish());
40 │     } else {
```

📄 `angular/packages/animations/src/players/animation_group_player.ts` L41–61 （▶ の行: 42–44, 47–49, 52–54, 60）

```ts
41 │       this.players.forEach((player) => {
42 ▶         player.onDone(() => {
43 ▶           if (++doneCount == total) {
44 ▶             this._onFinish();
45 │           }
46 │         });
47 ▶         player.onDestroy(() => {
48 ▶           if (++destroyCount == total) {
49 ▶             this._onDestroy();
50 │           }
51 │         });
52 ▶         player.onStart(() => {
53 ▶           if (++startCount == total) {
54 ▶             this._onStart();
55 │           }
56 │         });
57 │       });
58 │     }
59 │ 
60 ▶     this.totalTime = this.players.reduce((time, player) => Math.max(time, player.totalTime), 0);
61 │   }
```

📄 `angular/packages/animations/src/players/animation_group_player.ts` L63–98 （▶ の行: 64–67, 80–83）

```ts
63 │   private _onFinish() {
64 ▶     if (!this._finished) {
65 ▶       this._finished = true;
66 ▶       this._onDoneFns.forEach((fn) => fn());
67 ▶       this._onDoneFns = [];
68 │     }
69 │   }
70 │ 
71 │   init(): void {
72 │     this.players.forEach((player) => player.init());
73 │   }
74 │ 
75 │   onStart(fn: () => void): void {
76 │     this._onStartFns.push(fn);
77 │   }
78 │ 
79 │   private _onStart() {
80 ▶     if (!this.hasStarted()) {
81 ▶       this._started = true;
82 ▶       this._onStartFns.forEach((fn) => fn());
83 ▶       this._onStartFns = [];
84 │     }
85 │   }
86 │ 
87 │   onDone(fn: () => void): void {
88 │     this._onDoneFns.push(fn);
89 │   }
90 │ 
91 │   onDestroy(fn: () => void): void {
92 │     this._onDestroyFns.push(fn);
93 │   }
94 │ 
95 │   hasStarted() {
96 │     return this._started;
97 │   }
98 │ 
```

📄 `angular/packages/animations/src/players/animation_group_player.ts` L99–139 （▶ の行: 100–101, 103–104, 116–117, 121, 125–129, 135–138）

```ts
 99 │   play() {
100 ▶     if (!this.parentPlayer) {
101 ▶       this.init();
102 │     }
103 ▶     this._onStart();
104 ▶     this.players.forEach((player) => player.play());
105 │   }
106 │ 
107 │   pause(): void {
108 │     this.players.forEach((player) => player.pause());
109 │   }
110 │ 
111 │   restart(): void {
112 │     this.players.forEach((player) => player.restart());
113 │   }
114 │ 
115 │   finish(): void {
116 ▶     this._onFinish();
117 ▶     this.players.forEach((player) => player.finish());
118 │   }
119 │ 
120 │   destroy(): void {
121 ▶     this._onDestroy();
122 │   }
123 │ 
124 │   private _onDestroy() {
125 ▶     if (!this._destroyed) {
126 ▶       this._destroyed = true;
127 ▶       this._onFinish();
128 ▶       this.players.forEach((player) => player.destroy());
129 ▶       this._onDestroyFns.forEach((fn) => fn());
130 │       this._onDestroyFns = [];
131 │     }
132 │   }
133 │ 
134 │   reset(): void {
135 ▶     this.players.forEach((player) => player.reset());
136 ▶     this._destroyed = false;
137 ▶     this._finished = false;
138 ▶     this._started = false;
139 │   }
```

📄 `angular/packages/animations/src/players/animation_group_player.ts` L141–175 （▶ の行: 142, 144–145, 150, 153, 158, 161, 163–164, 172–173）

```ts
141 │   setPosition(p: number): void {
142 ▶     const timeAtPosition = p * this.totalTime;
143 │     this.players.forEach((player) => {
144 ▶       const position = player.totalTime ? Math.min(1, timeAtPosition / player.totalTime) : 1;
145 ▶       player.setPosition(position);
146 │     });
147 │   }
148 │ 
149 │   getPosition(): number {
150 ▶     const longestPlayer = this.players.reduce(
151 │       (longestSoFar: AnimationPlayer | null, player: AnimationPlayer) => {
152 │         const newPlayerIsLongest =
153 ▶           longestSoFar === null || player.totalTime > longestSoFar.totalTime;
154 │         return newPlayerIsLongest ? player : longestSoFar;
155 │       },
156 │       null,
157 │     );
158 ▶     return longestPlayer != null ? longestPlayer.getPosition() : 0;
159 │   }
160 │ 
161 ▶   beforeDestroy(): void {
162 │     this.players.forEach((player) => {
163 ▶       if (player.beforeDestroy) {
164 ▶         player.beforeDestroy();
165 │       }
166 │     });
167 │   }
168 │ 
169 │   /** @internal */
170 │   triggerCallback(phaseName: string): void {
171 │     const methods = phaseName == 'start' ? this._onStartFns : this._onDoneFns;
172 ▶     methods.forEach((fn) => fn());
173 ▶     methods.length = 0;
174 │   }
175 │ }
```

12〜13 行目のとおり、これは「内部で使う」もので（16 行目の `@see` の先は `group()`）、公開の名前は `ɵAnimationGroupPlayer` です。エンジンが 1 つの遷移で複数の要素を動かすとき、player をこれにまとめます。DEMO の「group」の記録は次のとおりです。

1. **60 行目：totalTime は子の最大**

   `[Noop(500, 100), Noop(1000)]` の totalTime は 1000（子は 600 と 1000）。
2. **38〜39 行目：子が 0 なら microtask で終わる**

   作った直後の onDone は 0 回、microtask のあと 1 回でした。
3. **142〜145 行目：位置を子ごとの割合に**

   `setPosition(0.3)` で全体の 300ms を、600ms の子は 0.5、1000ms の子は 0.3 にしました。長さ 0 の子は 144 行目で 1 です。150〜158 行目の getPosition は一番長い子の位置です。
4. **125〜127 行目：destroy はまず onDone**

   127 行目の `_onFinish` が先、そのあと 128 行目の子の destroy の中で子の onStart がそろって 80〜83 行目の onStart が呼ばれます。5 節の表の「play せずに destroy」で Group だけ `onDone onStart onDestroy` の順になり、hasStarted が true になるのはこのためです。
5. **135〜138 行目：reset は自分のコールバックを戻さない**

   子は reset しますが、67 行目と 83 行目で空にした自分の `_onDoneFns`・`_onStartFns` は戻しません。reset のあとの play で、Group の onStart と onDone は呼ばれませんでした（Noop と `WebAnimationsPlayer` は 342effeb7d4 で戻すようになったが、Group は変わっていない）。

## 7. AnimationEvent：値の型と、import の無い例

📄 `angular/packages/animations/src/animation_event.ts` L9–41 （▶ の行: 10–11, 16–18, 27–29）

````ts
 9 │ /**
10 ▶  * An instance of this class is returned as an event parameter when an animation
11 ▶  * callback is captured for an animation either during the start or done phase.
12 │  *
13 │  * ```ts
14 │  * @Component({
15 │  *   host: {
16 ▶  *     '[@myAnimationTrigger]': 'someExpression',
17 ▶  *     '(@myAnimationTrigger.start)': 'captureStartEvent($event)',
18 ▶  *     '(@myAnimationTrigger.done)': 'captureDoneEvent($event)',
19 │  *   },
20 │  *   animations: [
21 │  *     trigger("myAnimationTrigger", [
22 │  *        // ...
23 │  *     ])
24 │  *   ]
25 │  * })
26 │  * class MyComponent {
27 ▶  *   someExpression: any = false;
28 ▶  *   captureStartEvent(event: AnimationEvent) {
29 ▶  *     // the toState, fromState and totalTime data is accessible from the event variable
30 │  *   }
31 │  *
32 │  *   captureDoneEvent(event: AnimationEvent) {
33 │  *     // the toState, fromState and totalTime data is accessible from the event variable
34 │  *   }
35 │  * }
36 │  * ```
37 │  *
38 │  * @publicApi
39 │  *
40 │  * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
41 │  */
````

📄 `angular/packages/animations/src/animation_event.ts` L42–72 （▶ の行: 46, 50, 54, 59, 63, 65, 67, 69, 71）

```ts
42 │ export interface AnimationEvent {
43 │   /**
44 │    * The name of the state from which the animation is triggered.
45 │    */
46 ▶   fromState: string;
47 │   /**
48 │    * The name of the state in which the animation completes.
49 │    */
50 ▶   toState: string;
51 │   /**
52 │    * The time it takes the animation to complete, in milliseconds.
53 │    */
54 ▶   totalTime: number;
55 │   /**
56 │    * The animation phase in which the callback was invoked, one of
57 │    * "start" or "done".
58 │    */
59 ▶   phaseName: string;
60 │   /**
61 │    * The element to which the animation is attached.
62 │    */
63 ▶   element: any;
64 │   /**
65 ▶    * Internal.
66 │    */
67 ▶   triggerName: string;
68 │   /**
69 ▶    * Internal.
70 │    */
71 ▶   disabled: boolean;
72 │ }
```

16〜18 行目の host のバインディングの例を、`trigger('myAnimationTrigger', [transition('* => *', animate(300, …))])` にして動かしました。最初の描画の start の event は `phaseName=start triggerName=myAnimationTrigger fromState="void" toState=false totalTime=300 disabled=false element=anm-a-ev`、300ms のあとに同じ値の done が来ました。`someExpression = true` にすると `fromState=false toState=true` です。46・50 行目の型は `string` ですが、値は boolean のままでした（[第 1 回](01-anm-trigger-state.md)の 3 節）。event のキーは `element,triggerName,fromState,toState,phaseName,totalTime,disabled,_data` で、`_data`（flush の番号）は型にありません。

65〜71 行目は `triggerName` と `disabled` を「Internal.」としていますが、どちらも毎回入っていて、trigger の説明文（animation\_metadata.ts L645〜646）は `.disabled` を読むように書いています。もう 1 つ、例は `AnimationEvent` を import していません。そのまま写すと TypeScript は DOM の `AnimationEvent`（CSS アニメーションの event）を使い、strict の ngc でもエラーになりません（host のリスナーの `$event` は型検査されない）。`event.toState` と書いた所で初めて「Property 'toState' does not exist」になります。

## 8. errors.ts：3000 番台のエラーの番号

📄 `angular/packages/animations/src/errors.ts` L9–40 （▶ の行: 10–11, 13, 15, 18, 29, 33, 36–37, 39–40）

```ts
 9 │ /**
10 ▶  * The list of error codes used in runtime code of the `animations` package.
11 ▶  * Reserved error code range: 3000-3999.
12 │  */
13 ▶ export const enum RuntimeErrorCode {
14 │   // Invalid values
15 ▶   INVALID_TIMING_VALUE = 3000,
16 │   INVALID_STYLE_PARAMS = 3001,
17 │   INVALID_STYLE_VALUE = 3002,
18 ▶   INVALID_PARAM_VALUE = 3003,
19 │   INVALID_NODE_TYPE = 3004,
20 │   INVALID_CSS_UNIT_VALUE = 3005,
21 │   INVALID_TRIGGER = 3006,
22 │   INVALID_DEFINITION = 3007,
23 │   INVALID_STATE = 3008,
24 │   INVALID_PROPERTY = 3009,
25 │   INVALID_PARALLEL_ANIMATION = 3010,
26 │   INVALID_KEYFRAMES = 3011,
27 │   INVALID_OFFSET = 3012,
28 │   INVALID_STAGGER = 3013,
29 ▶   INVALID_QUERY = 3014,
30 │   INVALID_EXPRESSION = 3015,
31 │   INVALID_TRANSITION_ALIAS = 3016,
32 │   // Negative values
33 ▶   NEGATIVE_STEP_VALUE = 3100,
34 │   NEGATIVE_DELAY_VALUE = 3101,
35 │   // Keyframe offsets
36 ▶   KEYFRAME_OFFSETS_OUT_OF_ORDER = 3200,
37 ▶   KEYFRAMES_MISSING_OFFSETS = 3202,
38 │   // Missing item
39 ▶   MISSING_OR_DESTROYED_ANIMATION = 3300,
40 ▶   MISSING_PLAYER = 3301,
```

📄 `angular/packages/animations/src/errors.ts` L41–59 （▶ の行: 46–48, 50–51, 53–55, 58）

```ts
41 │   MISSING_TRIGGER = 3302,
42 │   MISSING_EVENT = 3303,
43 │   // Triggers
44 │   UNSUPPORTED_TRIGGER_EVENT = 3400,
45 │   UNREGISTERED_TRIGGER = 3401,
46 ▶   TRIGGER_TRANSITIONS_FAILED = 3402,
47 ▶   TRIGGER_PARSING_FAILED = 3403,
48 ▶   TRIGGER_BUILD_FAILED = 3404,
49 │   // Failed processes
50 ▶   VALIDATION_FAILED = 3500,
51 ▶   BUILDING_FAILED = 3501,
52 │   ANIMATION_FAILED = 3502,
53 ▶   REGISTRATION_FAILED = 3503,
54 ▶   CREATE_ANIMATION_FAILED = 3504,
55 ▶   TRANSITION_FAILED = 3505,
56 │ 
57 │   // Animations
58 ▶   BROWSER_ANIMATION_BUILDER_INJECTED_WITHOUT_ANIMATIONS = 3600,
59 │ }
```

11 行目のとおり 3000〜3999 を使い、表示は `NG` + 番号です（36〜37 行目のとおり 3201 は欠番）。この 37 個は、それぞれ browser/src・platform-browser/animations/src のどこか 1 か所でだけ使われています（`grep -rn "RuntimeErrorCode.名前"` で、どれも 1 件）。文を組み立てるのは browser/src/error\_helpers.ts（[第 7 回](07-anm-driver.md)）です。本番では文が消えて番号だけになります。[第 4 回](04-anm-ast.md)の表のとおり、開発モードの「NG03404: The animation trigger "t" has failed to build due to the following errors: …」は、本番では `NG03404` だけでした。50〜55 行目の 3500 番台は、40 番台までの個々のエラーをまとめて包む番号で、どの入口から来たかで変わります（[第 4 回](04-anm-ast.md)の 2 節）。

> **🧪 DEMO — npm の @angular/animations 22.2.6 を headless Chrome で動かした記録**
>
> ボタンは、記録のスクリプトがシナリオごとにページを読み直して取った結果を再生します（開発モードと本番相当の 2 回）。「説明と違う」の行は左に印を付けます。本番の欄は、開発モードと違うときだけ値を出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/anm-builder-players)

## ここまでの呼び出し（builder.build(…).create(el).play()）

- 👤 `inject(AnimationBuilder)` — animation\_builder.ts L75 — *root の BrowserAnimationBuilder*
  - `rootRenderer.createRenderer(doc.body, typeData)` — L122 — *AnimationRenderer。無ければ NG03600*
- 👤 `builder.build([…])` — L136
  - `renderer.setProperty(null, '@@0:register', [entry])` — L243
    - `AnimationEngine.process()` → `TimelineAnimationEngine.command()` — animation\_engine\_next.ts、timeline\_animation\_engine.ts — *第 6 回*
      - `register()` → `buildAnimationAst()` — timeline\_animation\_engine.ts L54 — *誤りなら NG03503*
- 👤 `factory.create(el)` — L153 — *id は factory に 1 つ（3 節）*
  - `'@@0:create'` → `TimelineAnimationEngine.create()` — timeline\_animation\_engine.ts L80 — *timeline を組み、driver.animate で player を作る*
- 👤 `player.onDone(fn)` — L179
  - `renderer.listen(el, '@@0:done', …)` — L172 — *呼ぶときは scheduleListenerCallback の microtask（4 節）*
- 👤 `player.play()` — L199
  - `'@@0:play'` → `WebAnimationsPlayer.play()` — web\_animations\_player.ts — *ここで element.animate()（第 7 回）*

## テストと直し方

| ファイル（packages/animations/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `browser_animation_builder_spec.ts` | `BrowserAnimationBuilder`（37）› `should listen on start and done on the animation builder's player after it has been reset`（69）・`should listen on start and done on the animation builder's player`（140）・`` should update `hasStarted()` on `play()` and `reset()` ``（203） | 4 節。どれも flushMicrotasks のあとで数を見る（コールバックが microtask で来る形）。reset の「前」に登録した場合だけで、reset の後に足す it は無い。player は MockAnimationDriver のもの |
| 同じファイル | `without Animations enabled`（244）› `should throw an error when injecting AnimationBuilder without animation providers set`（252）、`with Animations async`（268）› `should be able to build`（290） | 2 節の NG03600 と非同期のレンダラー |
| `animation_player_spec.ts` | `NoopAnimationPlayer`（13）› `should finish after the next microtask once started`（14）・`should fire all callbacks when destroyed`（30）ほか 4 本 | 5 節の表の「play」と「play せずに destroy」の Noop の列 |
| `animation_group_player_spec.ts` | `AnimationGroupPlayer`（12）› `should getPosition of an empty group`（13）・`…of a single player in a group`（19）・`…based on the longest player in the group`（27） | 6 節の getPosition。reset と destroy の順の it は無い |

📄 `走らせたコマンド（2026-11-23）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/animations/test:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/animations/test:test_web_chromium --nocache_test_results --test_output=all
（結果は下の段落）
```

結果は手元の bazel で、Node の `:test` は 9 specs・0 failures（builder の spec は `if (isNode)` で空の 1 本だけ。3 + 4 + 1 + 1 = 9）、ブラウザーの `:test_web_chromium` は 14 passed・0 failed（3 + 4 + 1 + builder の 6）でした。getPosition の添字、2 回の create、totalTime を確かめる it はどこにもありません。新しい本家（origin/main、2026-11-20）では、このファイルたちのソースは 8576f161ae4 から変わっておらず、spec だけが ecbc89b465c（`refactor(core): modernize unit tests across all packages`）で書き換わっています。

直すとしたら、getPosition は animation\_builder.ts の 230 行目で、timeline のエンジンの `_playersById.get(String(this.id))` を読む形にします（今は private なので、`TimelineAnimationEngine` に id で引く関数を足す）。totalTime も同じ道で本物の player から読みます。2 回の create は、154 行目で create ごとに新しい id を振る（factory の id は register の印に残し、player には別の通し番号）か、timeline\_animation\_engine.ts の `create` で同じ id の 2 つ目を断るかです。reset は animation\_player.ts の 198〜199 行目を `[...this._originalOnStartFns]` の写しにし（WebAnimationsPlayer も同じ）、Group は 134〜139 行目で自分の配列も戻します。spec は animation\_player\_spec.ts に「reset のあとに足した onStart が 1 回」、animation\_group\_player\_spec.ts に「reset のあとに onStart と onDone がもう一度来る」、browser\_animation\_builder\_spec.ts に「2 つ build して 2 つ目の player の getPosition」の it を足します。

## 聞かれそうな質問

**Q. builder の player の `onDone` は `finish()` の中で呼ばれますか？**

呼ばれません。`finish()` から戻ったあとの microtask です（4 節、`| onDone µ`）。`NoopAnimationPlayer` を直接使ったときは、`finish()` の中で呼ばれます。

**Q. 1 つの factory で複数の要素を動かせますか？**

同時には動かせません。`create` した player はどれも同じ id を持ち、エンジンは最後に create した player だけを覚えるので、前の player の play は最後の要素を動かします（3 節）。要素ごとに `build` から呼びます。

**Q. builder の player で進み具合を出すには？**

`getPosition()` は、build の id と動いている player の並びがたまたま合うときしか正しくありません（4 節）。`totalTime` も 0 です。要素の `getAnimations()[0].currentTime` を読むほうが確かです。

**Q. `reset()` して使い回すときの注意は？**

reset のあとに新しく `onStart`・`onDone` を足すと 2 回呼ばれます（5 節）。`AnimationGroupPlayer` は逆に、reset のあとはコールバックが呼ばれません（6 節）。登録は最初に 1 回だけにします。

**Q. `destroy()` で onDone は来ますか？**

3 種とも来ます。play していなければ、Noop は onStart → onDone → onDestroy、Group は onDone → onStart → onDestroy、builder の player は onDone → onDestroy（onStart は来ない）です（5 節の表）。

## 読み終えて

- `AnimationBuilder` は root の 1 つで、命令はすべて body のレンダラーの `setProperty('@@id:命令')` で送られる。provider が無いと NG03600。
- builder の player のコールバックは microtask で来る。getPosition は添字が合わず、totalTime は 0。
- id は factory に 1 つなので、同じ factory の 2 回目の create は 1 回目の player を乗っ取る。
- reset のあとに足したコールバックは 2 回（Noop と WebAnimationsPlayer）、Group は reset のあとに呼ばない。destroy の順も 3 種で違う。
- `AnimationEvent` の fromState・toState は型が string でも値はそのまま。例を写すときは `@angular/animations` から import する。

---

← 前: [transition・group・sequence・keyframes・query・stagger の説明文](02-anm-transition-query.md)  
次: [DSL を AST にする：animation\_ast\_builder と transition\_factory](04-anm-ast.md) →
