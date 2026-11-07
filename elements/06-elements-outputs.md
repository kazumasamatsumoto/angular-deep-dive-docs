[目次](../README.md) › [Angular Elements の内側](README.md) › 第 6 回 / 全 8 回

# 出力とイベント：CustomEvent になるまで

> initializeOutputs がコンポーネントの出力（output と EventEmitter）を events の Observable（ReplaySubject と switchMap）にまとめ、NgElementImpl が connect より前に購読して dispatchEvent(new CustomEvent(name, {detail})) にする行。イベントの名前（別名）・detail・bubbles（書いていないので false）、constructor と ngOnInit の emit のどちらが届くか。外して待って戻すと output() の要素でイベントの購読が NG0953 で落ちる記録。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/elements-outputs)

---

コンポーネントの出力（`output()` や `@Output()` の `EventEmitter`）は、カスタム要素の外からは DOM のイベントとして見えます。この章では、`initializeOutputs` が出力を 1 本の `events` にまとめる行と、`NgElementImpl` がそれを購読して `new CustomEvent(…)` を `dispatchEvent` する行を追い、イベントの名前・`detail`・`bubbles` がどう決まるか、つながる前に購読しておく理由を確かめます。最後に、外してしばらくしてから戻した要素で、出力が二度と届かなくなる組み合わせを本番ビルドで再現した記録を見せます。

読む対象は `packages/elements/src/component-factory-strategy.ts`（`events`・`initializeOutputs`）と `packages/elements/src/create-custom-element.ts`（`connectedCallback` の購読の部分・`subscribeToEvents`）、core の `render3/component_ref.ts`（`outputs`）と `authoring/output/output_emitter_ref.ts` です。

1. [1. 全体像](01-elements-overview.md)
2. [2. createCustomElement](02-elements-create.md)
3. [3. 属性と入力](03-elements-attributes-inputs.md)
4. [4. つながるとき](04-elements-connect.md)
5. [5. 入力と変更検知](05-elements-inputs-cd.md)
6. **6. 出力とイベント**（この章）
7. [7. 切り離しと破棄](07-elements-disconnect.md)
8. [8. spec と issue](08-elements-tests-issues.md)

## 1. events：出力を 1 本にまとめた Observable

📄 `angular/packages/elements/src/component-factory-strategy.ts` L70–74 （▶ の行: 71, 74）

```ts
70 │   // Subject of `NgElementStrategyEvent` observables corresponding to the component's outputs.
71 ▶   private eventEmitters = new ReplaySubject<Observable<NgElementStrategyEvent>[]>(1);
72 │ 
73 │   /** Merged stream of the component's output events. */
74 ▶   readonly events = this.eventEmitters.pipe(switchMap((emitters) => merge(...emitters)));
```

`NgElementStrategy` の約束（[第 1 回](01-elements-overview.md)）の `events` の実体です。71 行目の `eventEmitters` は「出力ごとの Observable の配列」を 1 つだけ覚えておく `ReplaySubject(1)` で、74 行目の `events` は、その配列が来るたびに `switchMap` で中身を `merge` し直した 1 本の流れです。

- **まだ配列が来ていない**（コンポーネントを作る前）：`events` を購読しても何も流れません。でも購読そのものはできます。
- **配列が来た**：購読している人に、すべての出力の値が 1 本で流れます。
- **あとから購読した**：`ReplaySubject(1)` なので、最後に来た配列がすぐ渡され、それを `merge` したものを購読します。この「最後の配列を覚えている」が、7 節の不具合の原因になります。

## 2. initializeOutputs：出力 1 つにつき Observable を 1 つ

📄 `angular/packages/elements/src/component-factory-strategy.ts` L213–217 （▶ の行: 213–214, 216–217）

```ts
213 ▶     this.initializeInputs();
214 ▶     this.initializeOutputs(this.componentRef);
215 │ 
216 ▶     this.appRef.attachView(this.componentRef.hostView);
217 ▶     this.componentRef.hostView.detectChanges();
```

コンポーネントを作る `initializeComponent` の後半です（前半と 213 行目の入力は [第 4 回](04-elements-connect.md)）。214 行目の `initializeOutputs` は、`createComponent` のあと（constructor のあと）、217 行目の最初の `detectChanges` の前（`ngOnInit` の前）に呼ばれます。この順番が 4 節のデモの結果を決めます。

📄 `angular/packages/elements/src/component-factory-strategy.ts` L229–242 （▶ の行: 231, 233–237, 241）

```ts
229 │   /** Sets up listeners for the component's outputs so that the events stream emits the events. */
230 │   protected initializeOutputs(componentRef: ComponentRef<any>): void {
231 ▶     const eventEmitters: Observable<NgElementStrategyEvent>[] = reflectComponentType(
232 │       this.component,
233 ▶     )!.outputs.map(({propName, templateName}) => {
234 ▶       const emitter: EventEmitter<any> | OutputRef<any> = componentRef.instance[propName];
235 ▶       return new Observable((observer) => {
236 ▶         const sub = emitter.subscribe((value) => observer.next({name: templateName, value}));
237 ▶         return () => sub.unsubscribe();
238 │       });
239 │     });
240 │ 
241 ▶     this.eventEmitters.next(eventEmitters);
242 │   }
```

1. **231〜233 行目：出力の一覧を `{ propName, templateName }` で受け取る**

   `reflectComponentType(this.component).outputs` です。一覧の作り方は下の core の行で見ます。
2. **234 行目：インスタンスのフィールドを取る**

   `componentRef.instance[propName]`。型は `EventEmitter<any> | OutputRef<any>` で、どちらも `subscribe(fn)` を持っているので、ここから先は区別しません。
3. **235〜238 行目：購読されたときに初めて出力を購読する Observable を作る**

   236 行目で、出力の値を `{ name: templateName, value }`（`NgElementStrategyEvent`）に包んで流します。この形は 2024 年 8 月の `fe5c4e086ad`（fix(elements): support \`output()\`-shaped outputs）からで、それまでは `emitter.pipe(map(…))` と書いていたので、`pipe` を持たない `output()` の出力では動きませんでした。**名前はプロパティの名前ではなく、テンプレートでの名前（別名）**です。237 行目で、購読をやめたら出力の購読もやめます。
4. **241 行目：配列を `eventEmitters` に流す**

   1 節の 74 行目の `switchMap` がこの配列を `merge` して、すでに `events` を購読している人につなぎます。

📄 `angular/packages/core/src/render3/component_ref.ts` L247–250 （▶ の行: 248）

```ts
247 │   get outputs(): {propName: string; templateName: string}[] {
248 ▶     this.cachedOutputs ??= toOutputRefArray(this.componentDef.outputs);
249 │     return this.cachedOutputs;
250 │   }
```

📄 `angular/packages/core/src/render3/component_ref.ts` L105–107 （▶ の行: 106）

```ts
105 │ function toOutputRefArray<T>(map: DirectiveDef<T>['outputs']): ComponentFactory<T>['outputs'] {
106 ▶   return Object.keys(map).map((name) => ({propName: map[name], templateName: name}));
107 │ }
```

`outputs` は 248 行目でコンポーネントの定義の `outputs` を `toOutputRefArray` に通したものです。定義の `outputs` は「公開の名前（別名）→ フィールドの名前」の表なので、106 行目でキーを `templateName`、値を `propName` にしています。`output({ alias: 'renamed-out' })` を `renamed` というフィールドに置くと、`{ propName: 'renamed', templateName: 'renamed-out' }` になり、イベントの名前は `renamed-out` です。

## 3. NgElementImpl：購読して CustomEvent にする

📄 `angular/packages/elements/src/create-custom-element.ts` L230–236 （▶ の行: 232–234）

```ts
230 │     private subscribeToEvents(): void {
231 │       // Listen for events from the strategy and dispatch them as custom events.
232 ▶       this.ngElementEventsSubscription = this.ngElementStrategy.events.subscribe((e) => {
233 ▶         const customEvent = new CustomEvent(e.name, {detail: e.value});
234 ▶         this.dispatchEvent(customEvent);
235 │       });
236 │     }
```

232 行目で strategy の `events` を購読し、購読を `ngElementEventsSubscription` に置きます（外したときにやめるため。[第 7 回](07-elements-disconnect.md)）。値が来るたびに 233 行目で `new CustomEvent(e.name, { detail: e.value })` を作り、234 行目で要素自身に `dispatchEvent` します。

- **type**：2 節の `templateName`。
- **detail**：出力が `emit` した値そのもの。`CustomEvent` の外側で包むので、受け手は必ず `event.detail` で値を取ります。
- **bubbles・composed・cancelable**：233 行目の第 2 引数には `detail` しか書いていないので、DOM の `CustomEventInit` の既定値のまま、**どれも false** です。泡立ちしないので、親の要素に付けたリスナーには届きません。`composed` も false なので、Shadow DOM の外にも出ません。
- **いつ**：`dispatchEvent` は同期なので、`emit` を呼んだその場で、要素のリスナーが呼ばれ終わります。

## 4. つながる前に購読しておく

📄 `angular/packages/elements/src/create-custom-element.ts` L202–208 （▶ の行: 202, 204–205, 208）

```ts
202 ▶       if (this.ngElementStrategy.events) {
203 │         // `events` are already available: Subscribe to it asap.
204 ▶         this.subscribeToEvents();
205 ▶         subscribedToEvents = true;
206 │       }
207 │ 
208 ▶       this.ngElementStrategy.connect(this);
```

📄 `angular/packages/elements/src/create-custom-element.ts` L210–215 （▶ の行: 210, 214）

```ts
210 ▶       if (!subscribedToEvents) {
211 │         // `events` were not initialized before running `connect()`: Subscribe to them now.
212 │         // The events emitted during the component initialization have been missed, but at least
213 │         // future events will be captured.
214 ▶         this.subscribeToEvents();
215 │       }
```

`connectedCallback` の中です（ほかの部分は [第 2 回](02-elements-create.md)）。202 行目、strategy に `events` がもうあれば、204 行目で **208 行目の `connect` より前に**購読します。既定の strategy は 1 節の 74 行目で `events` をフィールドの初期化で作るので、いつもこちらです。210〜215 行目は、`connect` の中で初めて `events` を作る自作の strategy のための逃げ道で、その場合はつながる途中の出力を取りこぼします。

先に購読しておくと、2 節の順番と合わせて次のようになります。

1. **204 行目：`events` を購読**

   配列はまだ無いので、何も流れません。
2. **208 行目 → `initializeComponent` → `createComponent`**

   コンポーネントの constructor が走ります。**ここで `emit` しても、まだ誰も出力を購読していないので、値はどこにも届きません。**
3. **214 行目：`initializeOutputs`**

   241 行目の配列で、204 行目の購読が出力につながります。
4. **217 行目：最初の `detectChanges`**

   `ngOnInit` が走ります。**ここで `emit` した値は CustomEvent になって届きます。**要素のリスナーをこれより前（`append` の前）に付けておけば受け取れます。

## 5. DEMO：type・detail・bubbles を表に

> **🧪 DEMO — 出力が CustomEvent になって届くところ（ライブ。@angular/elements 22.1.6 の createCustomElement）**
>
> 「要素を作ってつなぐ」を押すと、`createCustomElement(ElOutEmitter, { injector })` を `<el-outputs-emitter>` の名前で登録し、`document.createElement` で作った要素を枠に入れます。要素と、その親の枠の両方に、`picked`・`legacy`・`renamed-out`・`renamed`・`ready`・`born` の 6 つの名前で `addEventListener` します。要素の中の 3 つのボタンはコンポーネントのテンプレートのボタンで、押すとそれぞれの出力が `emit` します。表の 1 行は、どちらかのリスナーが呼ばれた 1 回です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/elements-outputs)

試すと分かることです（本番ビルドで確かめた結果は「テストと直し方」の最後にあります）。

1. **つなぐ：`ready` の 1 行だけが出る。`born` は出ない**

   `ready` は `ngOnInit` で、`born` は constructor で `emit` しています。4 節のとおり、constructor の `emit` は `initializeOutputs` より前なので届きません。
2. **中のボタンを押す：type は `picked`・`legacy`・`renamed-out`**

   `output()` も `EventEmitter` も同じ形の行になります（2 節の 234 行目で区別しない）。3 つ目は別名の `renamed-out` で届き、プロパティの名前の `renamed` のリスナーは一度も呼ばれません。`detail` は `emit` した値そのもの（`1`・`{"n":2}`・`"x"`）です。
3. **どの行も bubbles・composed・cancelable は false、eventPhase は 2**

   3 節の 233 行目のとおりです。`eventPhase` 2 は「対象の要素そのもの（AT\_TARGET）」です。親の枠のリスナーが呼ばれた回数はずっと 0 です。
4. **「`addEventListener` を `append` のあとにする」にしてつなぐ：何も出ない**

   `append` の中で `connectedCallback` が同期に走り、`ngOnInit` の `ready` もその中で `dispatchEvent` され終わっています。要素の側の購読（204 行目）は間に合っていても、DOM のリスナーが間に合っていなければ受け取れません。

## ここまでの呼び出し

- 👤 `parent.append(el)` — あなたのコード
  - `NgElementImpl.connectedCallback` — create-custom-element.ts 202〜208
    - `subscribeToEvents()` → `events.subscribe(…)` — create-custom-element.ts 204・232 — *まだ何も流れない*
    - `ComponentNgElementStrategy.connect` → `initializeComponent` — create-custom-element.ts 208 → component-factory-strategy.ts — *第 4 回*
      - `createComponent` — component-factory-strategy.ts（第 4 回） — *constructor（ここでの emit は届かない）*
      - `initializeOutputs(componentRef)` — component-factory-strategy.ts 214・230 — *eventEmitters.next(\[...\])*
      - `hostView.detectChanges()` — component-factory-strategy.ts 217 — *ngOnInit（ここでの emit は届く）*
- 👤 `this.picked.emit(1)` — コンポーネント
  - `observer.next({ name: templateName, value })` — component-factory-strategy.ts 236
    - `new CustomEvent(e.name, { detail: e.value })` → `dispatchEvent` — create-custom-element.ts 233・234 — *bubbles: false*
      - 👤 `el.addEventListener('picked', …)` — あなたのリスナー

## テストと直し方

### spec と describe

| spec | describe / it | この章のどこ |
| --- | --- | --- |
| test/create-custom-element\_spec.ts | describe `createCustomElement`（40 行目）の it `should listen to output events after connected`（119）・`should listen to output events during initialization`（143）・`` should not break if `NgElementStrategy#events` is not available before calling `NgElementStrategy#connect()` ``（153） | 3・4 節 |
| 同上 | it `should not listen to output events after disconnected`（130） | [第 7 回](07-elements-disconnect.md) |
| test/component-factory-strategy\_spec.ts | describe `before connected`（60 行目）の it `should allow subscribing to output events`（61） | 1・2 節（[第 4 回](04-elements-connect.md)の範囲） |

📄 `angular/packages/elements/test/create-custom-element_spec.ts` L119–128 （▶ の行: 121, 124–125, 127）

```ts
119 │   it('should listen to output events after connected', () => {
120 │     const element = new NgElementCtor(injector);
121 ▶     element.connectedCallback();
122 │ 
123 │     let eventValue: any = null;
124 ▶     element.addEventListener('some-event', (e: Event) => (eventValue = (e as CustomEvent).detail));
125 ▶     strategy.events.next({name: 'some-event', value: 'event-value'});
126 │ 
127 ▶     expect(eventValue).toEqual('event-value');
128 │   });
```

この spec の strategy は本物ではなく、`events` が素の `Subject` の `TestStrategy` です（[第 1 回](01-elements-overview.md)）。125 行目で `events.next` に直接流し、124 行目のリスナーが `detail` を受け取ることだけを見ます。**`bubbles` や `composed` を確かめる it はありません**。

📄 `angular/packages/elements/test/create-custom-element_spec.ts` L143–151 （▶ の行: 147–148, 150）

```ts
143 │   it('should listen to output events during initialization', () => {
144 │     const events: string[] = [];
145 │ 
146 │     const element = new NgElementCtor(injector);
147 ▶     element.addEventListener('strategy-event', (evt) => events.push((evt as CustomEvent).detail));
148 ▶     element.connectedCallback();
149 │ 
150 ▶     expect(events).toEqual(['connect']);
151 │   });
```

4 節の「つながる前に購読」の it です。`TestStrategy` の `connect` は `events` に `strategy-event` を流すので、147 行目で先にリスナーを付けておけば、150 行目で `['connect']` が取れます。

📄 `angular/packages/elements/test/create-custom-element_spec.ts` L153–183 （▶ の行: 155, 157, 159–160, 178, 181–182）

```ts
153 │   it('should not break if `NgElementStrategy#events` is not available before calling `NgElementStrategy#connect()`', () => {
154 │     class TestStrategyWithLateEvents extends TestStrategy {
155 ▶       override events: Subject<NgElementStrategyEvent> = undefined!;
156 │ 
157 ▶       override connect(element: HTMLElement): void {
158 │         this.connectedElement = element;
159 ▶         this.events = new Subject<NgElementStrategyEvent>();
160 ▶         this.events.next({name: 'strategy-event', value: 'connect'});
161 │       }
162 │     }
163 │ 
164 │     const strategyWithLateEvents = new TestStrategyWithLateEvents();
165 │     const capturedEvents: string[] = [];
166 │ 
167 │     const NgElementCtorWithLateEventsStrategy = createAndRegisterTestCustomElement({
168 │       create: () => strategyWithLateEvents,
169 │     });
170 │ 
171 │     const element = new NgElementCtorWithLateEventsStrategy(injector);
172 │     element.addEventListener('strategy-event', (evt) =>
173 │       capturedEvents.push((evt as CustomEvent).detail),
174 │     );
175 │     element.connectedCallback();
176 │ 
177 │     // The "connect" event (emitted during initialization) was missed, but things didn't break.
178 ▶     expect(capturedEvents).toEqual([]);
179 │ 
180 │     // Subsequent events are still captured.
181 ▶     strategyWithLateEvents.events.next({name: 'strategy-event', value: 'after-connect'});
182 ▶     expect(capturedEvents).toEqual(['after-connect']);
183 │   });
```

4 節の 210〜215 行目の逃げ道の it です。155 行目で `events` を `undefined` にし、159 行目の `connect` の中で作ります。160 行目のイベントは取りこぼし（178 行目で空）、181〜182 行目でそのあとのイベントは取れることを確かめます。

### 手元で走らせた結果

`pnpm bazel test //packages/elements/... --nocache_test_results --test_output=all` で、Chromium と Firefox のどちらも「59 passed, 0 failed, 5 skipped」、全体で 13 秒ほどでした（2026-11-06。コマンドと出力の抜粋は [第 5 回](05-elements-inputs-cd.md)の「テストと直し方」）。名前の絞り込みは効きません。

### この章の行で見つけたもの：外して、待って、戻すと、出力が届かなくなる

1 節の「`ReplaySubject(1)` は最後の配列を覚えている」と、`OutputEmitterRef` の次の行を合わせると、次のことが起きます。

📄 `angular/packages/core/src/authoring/output/output_emitter_ref.ts` L52–58 （▶ の行: 52–54）

```ts
52 ▶     if (this.destroyed) {
53 ▶       throw new RuntimeError(
54 ▶         RuntimeErrorCode.OUTPUT_REF_DESTROYED,
55 │         ngDevMode &&
56 │           'Unexpected subscription to destroyed `OutputRef`. ' +
57 │             'The owning directive/component is destroyed.',
58 │       );
```

1. **要素を外して 10 ms 以上たつ**

   コンポーネントが壊されます（[第 7 回](07-elements-disconnect.md)）。`output()` の `OutputEmitterRef` は `destroyed` になります。`eventEmitters` は、壊れたコンポーネントの出力の配列を覚えたままです。
2. **同じ要素を戻す**

   `connectedCallback` の 204 行目の購読で、`ReplaySubject(1)` が**壊れたコンポーネントの配列**をすぐ渡します。`merge` が 236 行目の `emitter.subscribe` を呼び、52〜58 行目で `RuntimeError`（NG0953）が投げられます。
3. **購読が error で終わる**

   投げられた例外は Observable の中で error として流れ、`subscribeToEvents` の購読（error の受け手を書いていない）が閉じます。コンソールには NG0953 が出ます。
4. **新しいコンポーネントができても、出力は届かない**

   あとでコンポーネントが作り直されて 241 行目で新しい配列が流れても、もう誰も購読していません。**`output()` だけでなく、同じコンポーネントの `EventEmitter` の出力も届きません**。もう一度外して戻しても、204 行目の購読はまた古い配列で落ちます。

次は、このページ（本番ビルド）を開いて、5 節のデモの要素をページの外から操作した記録です。**これは記録です**（デモのボタンではこの操作をしません。コンソールにエラーが出るからです）。

📄 `scratchpad/el-b/verify/verify.mjs（抜粋。playwright-core で操作）`

```
// /chapter/elements-outputs/ を開き、5 節のデモの「要素を作ってつなぐ」を押したあと
await page.locator('el-outputs-emitter button:has-text("legacy.emit")').last().click();
const cycle = async () => {
  await page.evaluate(async () => {
    const el = document.querySelector('el-outputs-emitter')!;
    const parent = el.parentElement!;
    el.remove();
    await new Promise((res) => setTimeout(res, 50)); // DESTROY_DELAY（10 ms）より長く待つ
    parent.append(el);
  });
  await page.waitForTimeout(200);
  // いちばん新しいボタン（最後のもの）を押して、表に行が増えるかを見る
  await page.locator('el-outputs-emitter button:has-text("picked.emit(n)")').last().click();
  await page.locator('el-outputs-emitter button:has-text("legacy.emit")').last().click();
};
await cycle(); // 1 回目に戻す
await cycle(); // 2 回目に戻す
await cycle(); // 3 回目に戻す
```

📄 `結果（HeadlessChrome/155.0.8043.0、2026-11-06）`

```
本番ビルド（このページ）
つないだ直後に legacy を押す → 表に 1 行（legacy {"n":1}）
1 回目に戻す → 中のボタン 3 つ（壊れたコンポーネントのもの）。押しても 0 行
              console.error: ERROR …: NG0953（at OutputEmitterRef.subscribe ← @angular/elements の chunk の _subscribe）
2 回目に戻す → 中のボタン 6 つ（コンポーネントが作り直された）。新しいボタンを押しても 0 行
              console.error: NG0953 がもう 1 回
3 回目に戻す → 中のボタン 6 つ（作り直されない）。押しても 0 行
              console.error: NG0953 がもう 1 回

開発ビルドでは同じところで
  ERROR RuntimeError: NG0953: Unexpected subscription to destroyed `OutputRef`.
  The owning directive/component is destroyed.
が出る
```

- 壊れたあとに戻すたびに、NG0953 がコンソールに 1 回出ます。2 回目に戻したときにコンポーネントは作り直されます（ボタンが 6 つになる。古い 3 つが残る理由は [第 7 回](07-elements-disconnect.md)）が、新しいボタンを押しても表には何も出ません。
- `EventEmitter` だけのコンポーネントなら、壊れたあとも `subscribe` は例外を投げないので、この形では落ちません。`output()` を 1 つでも持つと起きます。
- 直すなら `component-factory-strategy.ts` の `disconnect` の中の、壊す予定の関数（[第 7 回](07-elements-disconnect.md)の 1 節）で、壊したあとに `eventEmitters` を空の配列にする（`this.eventEmitters.next([])`）形が考えられます。spec は `component-factory-strategy_spec.ts` の describe `disconnect` に、`output()` を持つコンポーネントで「壊したあとに `connect` し直して `events` を購読し、出力が流れる」it を足す形です（私はまだ書いても走らせてもいません）。
- 2026-11-06 に `gh` で「NG0953」「OutputRef destroyed」「elements reattach」などを探しましたが、elements でこれを書いた issue は見つかりませんでした。近いのは、戻したときにコンポーネントが作り直されない [#38778](https://github.com/angular/angular/issues/38778)（開いている。[第 7 回](07-elements-disconnect.md)）です。一覧は [第 8 回](08-elements-tests-issues.md)にあります。

### 関係する issue

- [#39489](https://github.com/angular/angular/issues/39489)（開いている、feature）：泡立つ CustomEvent を出せるようにしたい。3 節の 233 行目の第 2 引数に `bubbles` を書く場所がありません。
- [#53795](https://github.com/angular/angular/issues/53795)（開いている、feature）：出力のイベントの型を付けたい。入力には `WithProperties` がありますが、イベントの側にはありません。
- [#64951](https://github.com/angular/angular/issues/64951)（2025-11-06 に not planned で閉じた）：`model()` の `valueChange` が値ではなく CustomEvent で来る。3 節のとおり、値はいつも `detail` に入るので、仕様どおりです。

### 本番ビルドで確かめた結果

ヘッドレスの Chrome（HeadlessChrome/155.0.8043.0）で本番ビルドのこのページを開き、playwright-core で 5 節のデモを操作しました。「要素を作ってつなぐ」で ready（detail "ngOnInit で emit"）の 1 行だけが 0.9 ms に出て、born は出ませんでした。中のボタンを順に押すと picked（detail 1）・legacy（{"n":2}）・renamed-out（"x"）が出て、renamed は 1 回も出ませんでした。どの行も CustomEvent が true、bubbles・composed・cancelable が false、eventPhase が 2 で、親の枠のリスナーは 0 回でした。picked のボタンにフォーカスして Enter を押しても picked が出ました。「addEventListener を append のあとにする」でつなぐと、表は空のままでした。コンソールの警告とエラーは 0 件でした（scratchpad/el-b/verify/verify.mjs、2026-11-06）。

## 聞かれそうな質問

**Q. カスタム要素の出力を、親の要素や document で受けられますか？**

そのままでは受けられません。`create-custom-element.ts` の 233 行目は `new CustomEvent(e.name, { detail: e.value })` で、`bubbles` を書いていないので false です。要素そのものに `addEventListener` するか、受けたリスナーで泡立つイベントを出し直します（#39489 は開いたままです）。`composed` も false なので、Shadow DOM の内側の要素の出力は外の木に出ません。

**Q. 別名を付けた出力は、どの名前でイベントになりますか？**

別名です。`component_ref.ts` の 106 行目で定義の `outputs` のキー（公開の名前）が `templateName` になり、`component-factory-strategy.ts` の 236 行目でそれがイベントの名前になります。フィールドの名前ではリスナーは呼ばれません（デモの `renamed`）。

**Q. constructor で emit した値は届きますか？ngOnInit では？**

constructor は届かず、`ngOnInit` は届きます。`initializeComponent` は `createComponent`（constructor。[第 4 回](04-elements-connect.md)）のあと、214 行目の `initializeOutputs`（出力の購読）、217 行目の `detectChanges`（`ngOnInit`）の順で、要素の側は `connect` より前の 204 行目で `events` を購読済みだからです。ただし DOM のリスナーは `append` の前に付けておく必要があります。

**Q. output() と EventEmitter で、カスタム要素から見た違いはありますか？**

ふだんはありません。`initializeOutputs` の 234 行目で `EventEmitter | OutputRef` のどちらも `subscribe` で購読し、同じ CustomEvent になります。違いが出るのは壊れたあとで、`OutputEmitterRef.subscribe` は 52〜58 行目で例外を投げます。外して 10 ms 以上たってから戻すと、この例外で要素のイベントの購読が閉じ、そのあとはどの出力も届かなくなります（「テストと直し方」の記録）。

**Q. event.detail を使わずに値だけを受け取る方法はありますか？**

既定の strategy にはありません。233 行目は値をいつも `detail` に入れます。`model()` の `valueChange` でも同じで、#64951 は not planned で閉じました。変えたいなら `NgElementStrategyFactory` を自作して `createCustomElement` の `strategyFactory` に渡します（[第 1 回](01-elements-overview.md)）が、CustomEvent を作るのは要素の側（233 行目）なので、そこは変わりません。

## 読み終えて

- 出力は `initializeOutputs` で `{ name: templateName, value }` の流れになり、`events`（`ReplaySubject(1)` ＋ `switchMap`）の 1 本にまとまります。
- 要素は `connect` より前に `events` を購読し、値が来るたびに `new CustomEvent(name, { detail })` を自分に `dispatchEvent` します。泡立ちません。
- 名前は別名、値は `detail`、`ngOnInit` の emit は届き、constructor の emit は届きません。
- `ReplaySubject(1)` が壊れたコンポーネントの出力を覚えているので、`output()` を持つコンポーネントの要素を外して待って戻すと、イベントの購読が落ちます。

---

← 前: [入力と変更検知：setInputValue と ChangeDetectionScheduler](05-elements-inputs-cd.md)  
次: [切り離しと破棄：少し待ってから壊す](07-elements-disconnect.md) →
