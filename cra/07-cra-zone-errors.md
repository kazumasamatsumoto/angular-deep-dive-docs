[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 7 回 / 全 10 回

# NgZone・ErrorHandler・EventEmitter・PendingTasks の説明文

> zone/ng\_zone.ts・error\_handler.ts・event\_emitter.ts・pending\_tasks.ts・testability/testability.ts・transfer\_state.ts の未読の行：run・runTask・runGuarded と onStable・isStable の約束、v22 で動かなくなった NgZone の例、ErrorHandler が届く injector、EventEmitter の async と error、PendingTasks.run、TransferState の鍵、Testability.whenStable。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-zone-errors)

---

この章で分かること：`NgZone`・`ErrorHandler`・`EventEmitter`・`PendingTasks`・`TransferState`・`Testability` の説明文が約束することを、zone.js の無いこのページの本物と、zone.js を読み込んだ Node の記録で 1 つずつ確かめます。食い違いは 5 つ見つかりました。`NgZone` の例は v22 の既定（OnPush）では画面が進まないこと、`runTask` は説明と逆にエラーを投げ直さず `onError` に出すこと、`isStable` は macrotask が残っていても `true` になること、`Testability.whenStable` のコールバックは何も受けないこと、`Testability` の例が構文の誤りであることです。

読む対象は `packages/core/src/zone/ng_zone.ts`・`error_handler.ts`・`event_emitter.ts`・`pending_tasks.ts`・`transfer_state.ts`・`testability/testability.ts` の、まだ引いていない説明文（../angular、8576f161ae4）です。NgZone の仕組み（zone の fork・onInvokeTask・checkStable）は[NgZone の fork の章](../zone/09-zone-ngzone-fork.md)と[安定の章](../zone/10-zone-ngzone-stability.md)、ErrorHandler の本体は[ErrorHandler の章](../err/01-err-handler-core.md)、PendingTasks の中身は[PendingTasks の章](../zoneless/09-zoneless-pending-tasks.md)、TransferState の使われ方は[HTTP の転送キャッシュの章](../http/11-http-transfer-cache.md)が読んでいます。

1. [1. ApplicationRef](01-cra-app-ref.md)
2. [2. platform と bootstrap](02-cra-platform.md)
3. [3. ViewContainerRef](03-cra-view-container.md)
4. [4. QueryList・DestroyRef](04-cra-linker-misc.md)
5. [5. input・model・output](05-cra-signal-io.md)
6. [6. signal のクエリ](06-cra-signal-queries.md)
7. **7. NgZone・ErrorHandler**（この章）
8. [8. DebugElement](08-cra-debug.md)
9. [9. サニタイズ](09-cra-sanitize.md)
10. [10. spec と issue](10-cra-tests-issues.md)

## 1. NgZone の説明と例：v22 の既定では画面が進まない

📄 `angular/packages/core/src/zone/ng_zone.ts` L29–47 （▶ の行: 30, 32–35, 37, 40）

````ts
29 │ /**
30 ▶  * An injectable service for executing work inside or outside of the Angular zone.
31 │  *
32 ▶  * The most common use of this service is to optimize performance when starting a work consisting of
33 ▶  * one or more asynchronous tasks that don't require UI updates or error handling to be handled by
34 ▶  * Angular. Such tasks can be kicked off via {@link #runOutsideAngular} and if needed, these tasks
35 ▶  * can reenter the Angular zone via {@link #run}.
36 │  *
37 ▶  * <!-- TODO: add/fix links to:
38 │  *   - docs explaining zones and the use of zones in Angular and change-detection
39 │  *   - link to runOutsideAngular/run (throughout this file!)
40 ▶  *   -->
41 │  *
42 │  * @usageNotes
43 │  * ### Example
44 │  *
45 │  * ```ts
46 │  * import {Component, NgZone} from '@angular/core';
47 │  *
````

📄 `angular/packages/core/src/zone/ng_zone.ts` L48–75 （▶ の行: 48, 53–54, 62–64, 66, 68–70, 75）

```ts
48 ▶  * @Component({
49 │  *   selector: 'ng-zone-demo',
50 │  *   template: `
51 │  *     <h2>Demo: NgZone</h2>
52 │  *
53 ▶  *     <p>Progress: {{progress}}%</p>
54 ▶  *     @if(progress >= 100) {
55 │  *        <p>Done processing {{label}} of Angular zone!</p>
56 │  *     }
57 │  *
58 │  *     <button (click)="processWithinAngularZone()">Process within Angular zone</button>
59 │  *     <button (click)="processOutsideOfAngularZone()">Process outside of Angular zone</button>
60 │  *   `,
61 │  * })
62 ▶  * export class NgZoneDemo {
63 ▶  *   progress: number = 0;
64 ▶  *   label: string;
65 │  *
66 ▶  *   constructor(private _ngZone: NgZone) {}
67 │  *
68 ▶  *   // Loop inside the Angular zone
69 ▶  *   // so the UI DOES refresh after each setTimeout cycle
70 ▶  *   processWithinAngularZone() {
71 │  *     this.label = 'inside';
72 │  *     this.progress = 0;
73 │  *     this._increaseProgress(() => console.log('Inside Done!'));
74 │  *   }
75 ▶  *
```

📄 `angular/packages/core/src/zone/ng_zone.ts` L76–105 （▶ の行: 76–77, 81, 84, 94, 102, 105）

````ts
 76 ▶  *   // Loop outside of the Angular zone
 77 ▶  *   // so the UI DOES NOT refresh after each setTimeout cycle
 78 │  *   processOutsideOfAngularZone() {
 79 │  *     this.label = 'outside';
 80 │  *     this.progress = 0;
 81 ▶  *     this._ngZone.runOutsideAngular(() => {
 82 │  *       this._increaseProgress(() => {
 83 │  *         // reenter the Angular zone and display done
 84 ▶  *         this._ngZone.run(() => { console.log('Outside Done!'); });
 85 │  *       });
 86 │  *     });
 87 │  *   }
 88 │  *
 89 │  *   _increaseProgress(doneCallback: () => void) {
 90 │  *     this.progress += 1;
 91 │  *     console.log(`Current progress: ${this.progress}%`);
 92 │  *
 93 │  *     if (this.progress < 100) {
 94 ▶  *       window.setTimeout(() => this._increaseProgress(doneCallback), 10);
 95 │  *     } else {
 96 │  *       doneCallback();
 97 │  *     }
 98 │  *   }
 99 │  * }
100 │  * ```
101 │  *
102 ▶  * @see [Resolving zone pollution](best-practices/zone-pollution#run-tasks-outside-ngzone)
103 │  *
104 │  * @publicApi
105 ▶  */
````

32〜35 行目の「画面の更新が要らない非同期の仕事は `runOutsideAngular` で始め、要るときだけ `run` で戻る」が NgZone の使いどころの約束で、例はそれを 68〜69 行目「zone の中なら setTimeout のたびに画面が更新される」と 76〜77 行目「外なら更新されない」で見せます。37〜40 行目は書きかけの TODO が公開の説明文に残ったものです。

この例を、名前も中身も変えずに（`console.log` だけ記録に替え、待ちを 10 ms から 1 ms に）、zone.js ありの Node で `provideZoneChangeDetection()` のアプリに bootstrap し、2 つのボタンを押しました（DEMO 2 の「説明文の NgZoneDemo」）。

- 例のまま：どちらのボタンでも変更検知は 1 回で、表示は `Progress: 1%` から動きませんでした。`Done processing …` も出ません。中の数は 100 まで進んでいて、`Inside Done!` と `Outside Done!` は記録に残りました。
- `changeDetection: ChangeDetectionStrategy.Eager` を足す：zone の中は変更検知 100 回・100 種類の値が見え、外は 2 回（押したときと、84 行目の `run` で戻ったとき）で、68〜69・76〜77 行目のとおりになりました。

差の理由は、v22 で `@Component` の既定の `changeDetection` が OnPush になったことです（eae8f7e30b9、2026-03-16、`feat(core): Set default Component changeDetection strategy to OnPush`、[OnPush の章](../cd/04-cd-onpush-markforcheck.md)）。OnPush のコンポーネントは、ただのフィールドを書き換えても検査されないので、zone が何回 tick を起こしても 63 行目の `progress` は画面に出ません。例は 2017 年からの形のままで、main でも同じです。strict の tsc には 64 行目の `label: string;` が `TS2564` で引っかかります。

## 2. run・runTask・runGuarded：エラーの扱いが説明と違う 1 つ

📄 `angular/packages/core/src/zone/ng_zone.ts` L238–249 （▶ の行: 239–240, 242–243, 245–246, 248–249）

```ts
238 │   /**
239 ▶    * Executes the `fn` function synchronously within the Angular zone as a task and returns value
240 ▶    * returned by the function.
241 │    *
242 ▶    * Running functions via `runTask` allows you to reenter Angular zone from a task that was executed
243 ▶    * outside of the Angular zone (typically started via {@link #runOutsideAngular}).
244 │    *
245 ▶    * Any future tasks or microtasks scheduled from within this function will continue executing from
246 ▶    * within the Angular zone.
247 │    *
248 ▶    * If a synchronous error happens it will be rethrown and not reported via `onError`.
249 ▶    */
```

📄 `angular/packages/core/src/zone/ng_zone.ts` L259–267 （▶ の行: 261–262, 264–265）

```ts
259 │ 
260 │   /**
261 ▶    * Same as `run`, except that synchronous errors are caught and forwarded via `onError` and not
262 ▶    * rethrown.
263 │    */
264 ▶   runGuarded<T>(fn: (...args: any[]) => T, applyThis?: any, applyArgs?: any[]): T {
265 ▶     return (this as any as NgZonePrivate)._inner.runGuarded(fn, applyThis, applyArgs);
266 │   }
267 │ 
```

`run` の説明（L222〜233、[NgZone の fork の章](../zone/09-zone-ngzone-fork.md)が引いている）の L232「同期のエラーは投げ直し、`onError` には出さない」と、248 行目の `runTask` の同じ文、261〜262 行目の `runGuarded`「捕まえて `onError` へ送り、投げ直さない」を、zone.js ありの記録で確かめました。

| 呼んだもの | 説明文 | 記録（開発モード・本番とも） |
| --- | --- | --- |
| `run(() => { throw e })` | 投げ直す・onError なし（L232） | 投げ直した。`onError` は出ない |
| `runTask(() => { throw e })` | 投げ直す・onError なし（248 行目） | **投げ直さない**。`onError(e)` が出る |
| `runGuarded(() => { throw e })` | 投げ直さない・onError へ（261〜262 行目） | 戻り値 `undefined`・`onError(e)` |
| `run` で積んだ setTimeout の中で throw | 書いていない | `onError(e)`。外へは投げない |

`runTask` の本体（L250〜258）は、`zone.scheduleEventTask` で作った task を `zone.runTask(task, …)` で走らせます（L252・L254）。zone.js の `Zone.runTask` は task の中のエラーを `handleError` に渡して飲み込むので、Angular の zone の `onHandleError`（L518〜522）が `onError` に出し、呼んだ側には何も届きません。説明文は `run` の段落（L222〜233）を写したもので、239〜248 行目は 6279e50d785（2017-07-13、`perf(core): use native addEventListener for faster rendering. (#18107)`）で `runTask` が足されたときからこの文です。main でも同じです。

戻り値は `run(() => 42)` が 42、`runTask(() => 7)` が 7 で、239〜240 行目のとおりです。L229〜230 と L276〜277「その中で積んだ先の task は同じ側の zone で走る」も、setTimeout と Promise.then の 4 つの組で確かめました（`run` の中は `isInAngularZone() === true`、`runOutsideAngular` の中は `false`）。

## 3. isStable と onStable・onMicrotaskEmpty

クラスの頭のフィールドの説明（L110〜132、[安定の章](../zone/10-zone-ngzone-stability.md)が引いている）のうち、L116「onUnstable が最初に出る」・L121〜123「onMicrotaskEmpty は 1 ターンに何度も出ることがある」・L128〜130「onStable は 1 回だけ」は、記録のとおりでした。`run` の 1 回で `onUnstable → onMicrotaskEmpty → onStable`、onMicrotaskEmpty の購読の中で microtask を 1 つ積むと `onUnstable → onMicrotaskEmpty → onMicrotaskEmpty → onStable` です。

L111「`isStable`：microtask も macrotask も残っていないか」は違いました。`run(() => setTimeout(…, 30))` の直後は `isStable=true・hasPendingMacrotasks=true` です。`isStable` を `true` に戻すのは `checkStable`（L354〜385）で、見ているのは `hasPendingMicrotasks` だけだからです。macrotask まで待つのは `Testability.isStable()`（9 節の 175 行目）の方です。

## 4. assert と、zone.js の無いページ

📄 `angular/packages/core/src/zone/ng_zone.ts` L198–221 （▶ の行: 199, 201, 205, 211, 213, 217）

```ts
198 │   /**
199 ▶     Assures that the method is called within the Angular Zone, otherwise throws an error.
200 │   */
201 ▶   static assertInAngularZone(): void {
202 │     if (!NgZone.isInAngularZone()) {
203 │       throw new RuntimeError(
204 │         RuntimeErrorCode.UNEXPECTED_ZONE_STATE,
205 ▶         ngDevMode && 'Expected to be in Angular Zone, but it is not!',
206 │       );
207 │     }
208 │   }
209 │ 
210 │   /**
211 ▶     Assures that the method is called outside of the Angular Zone, otherwise throws an error.
212 │   */
213 ▶   static assertNotInAngularZone(): void {
214 │     if (NgZone.isInAngularZone()) {
215 │       throw new RuntimeError(
216 │         RuntimeErrorCode.UNEXPECTED_ZONE_STATE,
217 ▶         ngDevMode && 'Expected to not be in Angular Zone, but it is!',
218 │       );
219 │     }
220 │   }
221 │ 
```

199・211 行目のとおり、記録では zone の外の `assertInAngularZone()` が `NG0909: Expected to be in Angular Zone, but it is not!`、中の `assertNotInAngularZone()` が `NG0909: Expected to not be in Angular Zone, but it is!` でした（本番は `NG0909` だけ）。

このページには zone.js がありません。DEMO 1 の「zone.js の無いページの NgZone」では、`new NgZone({})` が `NG0908`（L151〜156。開発モードの記録では `In this configuration Angular requires Zone.js` が付く）、`inject(NgZone)` は `NgZone` の実例ではない `NoopNgZone`（L555〜579、[zoneless が既定の章](../zoneless/01-zoneless-default.md)）でした。`NoopNgZone` の `runGuarded` は `fn.apply` を呼ぶだけ（L568〜570）なので、261〜262 行目と違って投げ直します。`onStable` ほかの 4 つは何も出しません。

## 5. ErrorHandler：ErrorDetails と、どの injector の ErrorHandler に届くか

📄 `angular/packages/core/src/error_handler.ts` L22–55 （▶ の行: 23, 25, 27, 31, 35, 39, 43, 48, 53）

```ts
22 │ /**
23 ▶  * Error details caught by the error boundary
24 │  *
25 ▶  * @developerPreview 22.2
26 │  */
27 ▶ export interface ErrorDetails {
28 │   /**
29 │    * The class of the component or directive where the error occurred.
30 │    */
31 ▶   readonly declarationType: Type<unknown>;
32 │   /**
33 │    * The instance of the component or directive where the error occurred.
34 │    */
35 ▶   readonly declarationInstance: unknown;
36 │   /**
37 │    * Information about the error boundary that caught the error.
38 │    */
39 ▶   readonly boundary?: {
40 │     /**
41 │      * The component where the error boundary that caught the rendering error was located
42 │      */
43 ▶     readonly type: Type<unknown>;
44 │ 
45 │     /**
46 │      * Call this method to retry rendering the error boundary.
47 │      */
48 ▶     readonly reset: () => void;
49 │   };
50 │   /**
51 │    * The function that intercepted the error, if any.
52 │    */
53 ▶   readonly caughtBy?: Function;
54 │ }
55 │ 
```

📄 `angular/packages/core/src/error_handler.ts` L99–108 （▶ の行: 100–101, 103–104, 106）

```ts
 99 │ 
100 ▶   /**
101 ▶    * Callback to handle errors happening during the rendering of a component/directive view.
102 │    *
103 ▶    * @param error The error that was thrown.
104 ▶    * @param details Additional information about the error.
105 │    */
106 ▶   onViewError?(error: Error, details: ErrorDetails): void;
107 │ }
108 │ 
```

22〜54 行目の `ErrorDetails` と 100〜106 行目の `onViewError` は、v22.2 の error boundary（25 行目の `@developerPreview 22.2`）のための形です。106 行目は `?` 付きの省略できるメソッドで、既定の `ErrorHandler` は持っていません（DEMO 1 で `typeof new ErrorHandler().onViewError` は `'undefined'`）。boundary が `declarationType`・`boundary.reset` を埋める道は[error boundary の章](../err/04-err-boundary-runtime.md)です。

クラスの説明（L56〜89、[ErrorHandler の章](../err/01-err-handler-core.md)が引いている）の L59〜61「既定を置き換える独自の ErrorHandler を書く」の「どこで置き換えるか」を、記録で確かめました。アプリの providers と、子の `EnvironmentInjector` に別々の ErrorHandler を置き、それぞれの injector で作ったコンポーネントの `(click)` で throw すると、**どちらもアプリの ErrorHandler に届きました**。子の injector は `child.get(ErrorHandler)` なら子のものを返します。テンプレートのリスナーのエラーは `INTERNAL_APPLICATION_ERROR_HANDLER`（L146〜169、root の factory）を通り、その factory が root の injector から ErrorHandler を取るからです。例の 74〜82 行目がアプリの providers に置いているのはこのためで、ルートの providers などに置いても効きません。L68 の `handleError(error)` は型が無く、strict の tsc では `TS7006` です。

## 6. EventEmitter：async と error

📄 `angular/packages/core/src/event_emitter.ts` L18–57 （▶ の行: 19–21, 25–27, 45–46, 51, 53）

````ts
18 │ /**
19 ▶  * Use in components with the `@Output` directive to emit custom events
20 ▶  * synchronously or asynchronously, and register handlers for those events
21 ▶  * by subscribing to an instance.
22 │  *
23 │  * @usageNotes
24 │  *
25 ▶  * Extends
26 ▶  * [RxJS `Subject`](https://rxjs.dev/api/index/class/Subject)
27 ▶  * for Angular by adding the `emit()` method.
28 │  *
29 │  * In the following example, a component defines two output properties
30 │  * that create event emitters. When the title is clicked, the emitter
31 │  * emits an open or close event to toggle the current visibility state.
32 │  *
33 │  * ```angular-ts
34 │  * @Component({
35 │  *   selector: 'zippy',
36 │  *   template: `
37 │  *   <div class="zippy">
38 │  *     <div (click)="toggle()">Toggle</div>
39 │  *     <div [hidden]="!visible">
40 │  *       <ng-content></ng-content>
41 │  *     </div>
42 │  *  </div>`})
43 │  * export class Zippy {
44 │  *   visible: boolean = true;
45 ▶  *   @Output() open: EventEmitter<any> = new EventEmitter();
46 ▶  *   @Output() close: EventEmitter<any> = new EventEmitter();
47 │  *
48 │  *   toggle() {
49 │  *     this.visible = !this.visible;
50 │  *     if (this.visible) {
51 ▶  *       this.open.emit(null);
52 │  *     } else {
53 ▶  *       this.close.emit(null);
54 │  *     }
55 │  *   }
56 │  * }
57 │  * ```
````

📄 `angular/packages/core/src/event_emitter.ts` L58–97 （▶ の行: 59–60, 63, 66, 77–78, 80, 83, 89, 94）

````ts
58 │  *
59 ▶  * Access the event object with the `$event` argument passed to the output event
60 ▶  * handler:
61 │  *
62 │  * ```html
63 ▶  * <zippy (open)="onOpen($event)" (close)="onClose($event)"></zippy>
64 │  * ```
65 │  *
66 ▶  * @see [Declaring outputs with the @Output decorator](guide/components/outputs#declaring-outputs-with-the-output-decorator)
67 │  *
68 │  * @publicApi
69 │  */
70 │ export interface EventEmitter<T> extends Subject<T>, OutputRef<T> {
71 │   /**
72 │    * @internal
73 │    */
74 │   __isAsync: boolean;
75 │ 
76 │   /**
77 ▶    * Creates an instance of this class that can
78 ▶    * deliver events synchronously or asynchronously.
79 │    *
80 ▶    * @param [isAsync=false] When true, deliver events asynchronously.
81 │    *
82 │    */
83 ▶   new (isAsync?: boolean): EventEmitter<T>;
84 │ 
85 │   /**
86 │    * Emits an event containing a given value.
87 │    * @param value The value to emit.
88 │    */
89 ▶   emit(value?: T): void;
90 │ 
91 │   /**
92 │    * Registers handlers for events emitted by this instance.
93 │    * @param next When supplied, a custom handler for emitted events.
94 ▶    * @param error When supplied, a custom handler for an error notification from this emitter.
95 │    * @param complete When supplied, a custom handler for a completion notification from this
96 │    *     emitter.
97 │    */
````

📄 `angular/packages/core/src/event_emitter.ts` L112–142 （▶ の行: 114, 116, 122, 126, 130–131, 136, 138, 140）

```ts
112 │ }
113 │ 
114 ▶ class EventEmitter_ extends Subject<any> implements OutputRef<any> {
115 │   // tslint:disable-next-line:require-internal-with-underscore
116 ▶   __isAsync: boolean;
117 │   destroyRef: DestroyRef | undefined = undefined;
118 │   private readonly pendingTasks: PendingTasksInternal | undefined = undefined;
119 │ 
120 │   constructor(isAsync: boolean = false) {
121 │     super();
122 ▶     this.__isAsync = isAsync;
123 │ 
124 │     // Attempt to retrieve a `DestroyRef` and `PendingTasks` optionally.
125 │     // For backwards compatibility reasons, this cannot be required.
126 ▶     if (isInInjectionContext()) {
127 │       // `DestroyRef` is optional because it is not available in all contexts.
128 │       // But it is useful to properly complete the `EventEmitter` if used with `outputToObservable`
129 │       // when the component/directive is destroyed. (See `outputToObservable` for more details.)
130 ▶       this.destroyRef = inject(DestroyRef, {optional: true}) ?? undefined;
131 ▶       this.pendingTasks = inject(PendingTasksInternal, {optional: true}) ?? undefined;
132 │     }
133 │   }
134 │ 
135 │   emit(value?: any) {
136 ▶     const prevConsumer = setActiveConsumer(null);
137 │     try {
138 ▶       super.next(value);
139 │     } finally {
140 ▶       setActiveConsumer(prevConsumer);
141 │     }
142 │   }
```

📄 `angular/packages/core/src/event_emitter.ts` L143–176 （▶ の行: 146, 149, 152, 156–157, 160, 166, 168, 170–171）

```ts
143 │ 
144 │   override subscribe(observerOrNext?: any, error?: any, complete?: any): Subscription {
145 │     let nextFn = observerOrNext;
146 ▶     let errorFn = error || (() => null);
147 │     let completeFn = complete;
148 │ 
149 ▶     if (observerOrNext && typeof observerOrNext === 'object') {
150 │       const observer = observerOrNext as PartialObserver<unknown>;
151 │       nextFn = observer.next?.bind(observer);
152 ▶       errorFn = observer.error?.bind(observer);
153 │       completeFn = observer.complete?.bind(observer);
154 │     }
155 │ 
156 ▶     if (this.__isAsync) {
157 ▶       errorFn = this.wrapInTimeout(errorFn);
158 │ 
159 │       if (nextFn) {
160 ▶         nextFn = this.wrapInTimeout(nextFn);
161 │       }
162 │ 
163 │       if (completeFn) {
164 │         completeFn = this.wrapInTimeout(completeFn);
165 │       }
166 ▶     }
167 │ 
168 ▶     const sink = super.subscribe({next: nextFn, error: errorFn, complete: completeFn});
169 │ 
170 ▶     if (observerOrNext instanceof Subscription) {
171 ▶       observerOrNext.add(sink);
172 │     }
173 │ 
174 │     return sink;
175 │   }
176 │ 
```

📄 `angular/packages/core/src/event_emitter.ts` L177–201 （▶ の行: 177, 179–180, 182, 185–186, 190, 196–198）

```ts
177 ▶   private wrapInTimeout(fn: (value: unknown) => any) {
178 │     return (value: unknown) => {
179 ▶       const taskId = this.pendingTasks?.add();
180 ▶       setTimeout(() => {
181 │         try {
182 ▶           fn(value);
183 │         } finally {
184 │           if (taskId !== undefined) {
185 ▶             this.pendingTasks?.remove(taskId);
186 ▶           }
187 │         }
188 │       });
189 │     };
190 ▶   }
191 │ }
192 │ 
193 │ /**
194 │  * @publicApi
195 │  */
196 ▶ export const EventEmitter: {
197 ▶   new (isAsync?: boolean): EventEmitter<any>;
198 ▶   new <T>(isAsync?: boolean): EventEmitter<T>;
199 │   readonly prototype: EventEmitter<any>;
200 │ } = EventEmitter_ as any;
201 │ 
```

80 行目「true なら非同期に届ける」は、156〜166 行目で next・error・complete をそれぞれ 177〜190 行目の `wrapInTimeout` に包むことです。DEMO 1 の「EventEmitter」では `sync 1 → emit の直後 → async 2` で、同期の方は emit の中で、非同期の方は setTimeout のあとで届きました。説明文に無い動きが 2 つあります。

- **error の関数を渡さないとき**：146 行目で関数の形の購読は `() => null` を既定にするので、`subscribe(next)` だけで `error()` を呼んでも何も起きません。ところが observer の形 `subscribe({next})` は 152 行目で `undefined` のままになり、RxJS の既定どおり「捕まえていないエラー」としてあとで投げられました（記録では uncaught）。94 行目は「渡せば受ける」としか書いていません。
- **非同期の EventEmitter とアプリの安定**：注入コンテキストの中で作ると 131 行目で `PendingTasksInternal` を取り、179〜186 行目で届くまでタスクを足します。DEMO 1 で、サイトの `ApplicationRef.isStable` を読むだけにして見ると `true → false → emit の直後 → 届いた → true` でした。spec の `contributes to app stability`（event\_emitter\_spec.ts L195）が固めています。

136〜140 行目の `setActiveConsumer(null)` は、computed や effect の中で emit しても、購読側で読んだ signal が依存にならないようにするためです（依存の記録の仕組みは[依存の追跡の章](../signals/03-signals-tracking.md)）。33〜57 行目の Zippy の例と 63 行目の使う側は、strictTemplates の ngc でエラー 0 でした。

## 7. PendingTasks：add と run

📄 `angular/packages/core/src/pending_tasks.ts` L18–41 （▶ の行: 19–22, 25, 27, 31–32, 34, 40）

````ts
18 │ /**
19 ▶  * Service that keeps track of pending tasks contributing to the stableness of Angular
20 ▶  * application. While several existing Angular services (ex.: `HttpClient`) will internally manage
21 ▶  * tasks influencing stability, this API gives control over stability to library and application
22 ▶  * developers for specific cases not covered by Angular internals.
23 │  *
24 │  * The concept of stability comes into play in several important scenarios:
25 ▶  * - SSR process needs to wait for the application stability before serializing and sending rendered
26 │  * HTML;
27 ▶  * - tests might want to delay assertions until the application becomes stable;
28 │  *
29 │  * @usageNotes
30 │  * ```ts
31 ▶  * const pendingTasks = inject(PendingTasks);
32 ▶  * const taskCleanup = pendingTasks.add();
33 │  * // do work that should block application's stability and then:
34 ▶  * taskCleanup();
35 │  * ```
36 │  *
37 │  *
38 │  * @see [PendingTasks for Server Side Rendering (SSR)](guide/zoneless#pendingtasks-for-server-side-rendering-ssr)
39 │  *
40 ▶  * @publicApi 20.0
41 │  */
````

📄 `angular/packages/core/src/pending_tasks.ts` L62–75 （▶ の行: 64, 67–69, 74）

````ts
62 │ 
63 │   /**
64 ▶    * Runs an asynchronous function and blocks the application's stability until the function completes.
65 │    *
66 │    * ```ts
67 ▶    * pendingTasks.run(async () => {
68 ▶    *   const userData = await fetch('/api/user');
69 ▶    *   this.userData.set(userData);
70 │    * });
71 │    * ```
72 │    *
73 │    * @param fn The asynchronous function to execute
74 ▶    * @developerPreview 19.0
75 │    */
````

DEMO 1 の「PendingTasks」は、サイトの `PendingTasks` に 1 つだけタスクを足して外し、サイトの `ApplicationRef.isStable` を読むだけで並べます。

1. **add() と cleanup()**

   31〜34 行目の例のとおり、`add()` で `false`、返った関数を呼ぶと `true` に戻りました。もう一度呼んでも何も起きません（L53〜55 の「もう外してある」）。
2. **run(async fn)**

   64 行目「終わるまで安定をふさぐ」のとおり、`false → fn の始め → run の直後 → fn の終わり → true` でした。`run` の戻り値は `undefined`（L76 の `void`）で、終わりを待つ手段は返しません。
3. **fn が throw・reject したとき**

   説明文は書いていませんが、L79〜81 でどちらもアプリの ErrorHandler に渡します。記録では既定の ErrorHandler が `ERROR …` を 2 回 console に出しました（このページでは試さない）。

40 行目のクラスは `@publicApi 20.0`、74 行目の `run` は `@developerPreview 19.0` のままで、安定版のクラスの中に開発者プレビューのメソッドが 1 つある形です。

## 8. TransferState：鍵と値

📄 `angular/packages/core/src/transfer_state.ts` L14–49 （▶ の行: 15, 20, 23, 28–30, 34, 39, 42, 47–48）

````ts
14 │ /**
15 ▶  * A type-safe key to use with `TransferState`.
16 │  *
17 │  * Example:
18 │  *
19 │  * ```ts
20 ▶  * const COUNTER_KEY = makeStateKey<number>('counter');
21 │  * let value = 10;
22 │  *
23 ▶  * transferState.set(COUNTER_KEY, value);
24 │  * ```
25 │  *
26 │  * @publicApi
27 │  */
28 ▶ export type StateKey<T> = string & {
29 ▶   __not_a_string: never;
30 ▶   __value_type?: T;
31 │ };
32 │ 
33 │ /**
34 ▶  * Create a `StateKey<T>` that can be used to store value of type T with `TransferState`.
35 │  *
36 │  * Example:
37 │  *
38 │  * ```ts
39 ▶  * const COUNTER_KEY = makeStateKey<number>('counter');
40 │  * let value = 10;
41 │  *
42 ▶  * transferState.set(COUNTER_KEY, value);
43 │  * ```
44 │  *
45 │  * @publicApi
46 │  */
47 ▶ export function makeStateKey<T = void>(key: string): StateKey<T> {
48 ▶   return key as StateKey<T>;
49 │ }
````

📄 `angular/packages/core/src/transfer_state.ts` L50–70 （▶ の行: 52–53, 57, 61–63, 65–67）

```ts
50 │ 
51 │ function createDictionary<T>(): Record<string, T> {
52 ▶   // StateKey can be any string, including names of special Object prototype properties.
53 ▶   return Object.create(null);
54 │ }
55 │ 
56 │ /**
57 ▶  * A key value store that is transferred from the application on the server side to the application
58 │  * on the client side.
59 │  *
60 │  * The `TransferState` is available as an injectable token.
61 ▶  * On the client, just inject this token using DI and use it, it will be lazily initialized.
62 ▶  * On the server it's already included if `renderApplication` function is used. Otherwise, import
63 ▶  * the `ServerTransferStateModule` module to make the `TransferState` available.
64 │  *
65 ▶  * The values in the store are serialized/deserialized using JSON.stringify/JSON.parse. So only
66 ▶  * boolean, number, string, null and non-class objects will be serialized and deserialized in a
67 ▶  * non-lossy manner.
68 │  *
69 │  * @publicApi
70 │  */
```

📄 `angular/packages/core/src/transfer_state.ts` L102–137 （▶ の行: 104, 106–107, 113–114, 121, 125, 128, 132, 134–135）

```ts
102 │ 
103 │   /**
104 ▶    * Set the value corresponding to a key.
105 │    */
106 ▶   set<T>(key: StateKey<T>, value: T): void {
107 ▶     this.store[key] = value;
108 │   }
109 │ 
110 │   /**
111 │    * Remove a key from the store.
112 │    */
113 ▶   remove<T>(key: StateKey<T>): void {
114 ▶     delete this.store[key];
115 │   }
116 │ 
117 │   /**
118 │    * Test whether a key exists in the store.
119 │    */
120 │   hasKey<T>(key: StateKey<T>): boolean {
121 ▶     return Object.hasOwn(this.store, key);
122 │   }
123 │ 
124 │   /**
125 ▶    * Indicates whether the state is empty.
126 │    */
127 │   get isEmpty(): boolean {
128 ▶     return Object.keys(this.store).length === 0;
129 │   }
130 │ 
131 │   /**
132 ▶    * Register a callback to provide the value for a key when `toJson` is called.
133 │    */
134 ▶   onSerialize<T>(key: StateKey<T>, callback: () => T): void {
135 ▶     this.onSerializeCallbacks[key] = callback;
136 │   }
137 │ 
```

DEMO 1 の「TransferState」は、サイトのものに触れず `new TransferState()` した別の実例で試します。`StateKey<T>` は 28〜31 行目のとおり型だけの印を付けた文字列で、`makeStateKey` は 48 行目で文字列をそのまま返します（`typeof` は `'string'`）。

- 20〜23 行目の例と `get`・`hasKey`・`remove`・`isEmpty` は書いたとおりでした。
- 65〜67 行目「JSON で直列化するので、class のものは失われる」は `toJson()` を通したときの話で、同じアプリの中の `set` → `get` は 107 行目で入れたものをそのまま返します（`Date` は `Date` のまま、`toJson` のあとは文字列）。
- `set(key, undefined)` のあとは `hasKey` が `true` なのに `get` は既定の値です（L100）。52〜53 行目の `Object.create(null)` のおかげで、`'toString'` の鍵も既定の値を返しました。
- `toJson()` は `<` と `/` を `<`・`/` にします（L153〜156）。HTML の `<script>` の中に埋めても閉じタグにならないためです。

62〜63 行目の「`ServerTransferStateModule` を import する」は、もう無いモジュールです。e8b588d8b7f（2024-03-15、``refactor(platform-server): remove deprecated `ServerTransferStateModule` API (#54874)``）で消え、説明文だけが残りました。main では 860832591d5（2026-09-29、`docs(core): remove reference to ServerTransferStateModule from TransferState`）がこの 2 行を消し、このサイトが使う 22.2.6 にも入っています。

## 9. Testability：whenStable のコールバックと、崩れた例

📄 `angular/packages/core/src/testability/testability.ts` L73–100 （▶ の行: 74, 77–78, 80–82, 88）

````ts
 73 │ /**
 74 ▶  * The Testability service provides testing hooks that can be accessed from
 75 │  * the browser.
 76 │  *
 77 ▶  * Angular applications bootstrapped using an NgModule (via `@NgModule.bootstrap` field) will also
 78 ▶  * instantiate Testability by default (in both development and production modes).
 79 │  *
 80 ▶  * For applications bootstrapped using the `bootstrapApplication` function, Testability is not
 81 ▶  * included by default. You can include it into your applications by getting the list of necessary
 82 ▶  * providers using the `provideProtractorTestingSupport()` function and adding them into the
 83 │  * `options.providers` array. Example:
 84 │  *
 85 │  * ```ts
 86 │  * import {provideProtractorTestingSupport} from '@angular/platform-browser';
 87 │  *
 88 ▶  * await bootstrapApplication(RootComponent, providers: [provideProtractorTestingSupport()]);
 89 │  * ```
 90 │  *
 91 │  * @publicApi
 92 │  */
 93 │ @Injectable()
 94 │ export class Testability implements PublicTestability {
 95 │   private _isZoneStable: boolean = true;
 96 │   private _callbacks: WaitCallback[] = [];
 97 │ 
 98 │   private _taskTrackingZone: {macroTasks: Task[]} | null = null;
 99 │ 
100 │   private _destroyRef?: DestroyRef;
````

📄 `angular/packages/core/src/testability/testability.ts` L169–202 （▶ の行: 170, 174–176, 182–183, 187）

```ts
169 │   /**
170 ▶    * Whether an associated application is stable
171 │    */
172 │   isStable(): boolean {
173 │     return (
174 ▶       this._isZoneStable &&
175 ▶       !this._ngZone.hasPendingMacrotasks &&
176 ▶       (!this._usePendingTasks || !this.pendingTasksInternal.hasPendingTasks)
177 │     );
178 │   }
179 │ 
180 │   private _runCallbacksIfReady(): void {
181 │     if (this.isStable()) {
182 ▶       // Schedules the call backs in a new frame so that it is always async.
183 ▶       queueMicrotask(() => {
184 │         while (this._callbacks.length !== 0) {
185 │           let cb = this._callbacks.pop()!;
186 │           clearTimeout(cb.timeoutId);
187 ▶           cb.doneCb();
188 │         }
189 │       });
190 │     } else {
191 │       // Still not stable, send updates.
192 │       let pending = this.getPendingTasks();
193 │       this._callbacks = this._callbacks.filter((cb) => {
194 │         if (cb.updateCb && cb.updateCb(pending)) {
195 │           clearTimeout(cb.timeoutId);
196 │           return false;
197 │         }
198 │ 
199 │         return true;
200 │       });
201 │     }
202 │   }
```

📄 `angular/packages/core/src/testability/testability.ts` L221–253 （▶ の行: 224, 226, 229, 233–234, 238–242, 245–246, 250）

```ts
221 │   private addCallback(cb: Function, timeout?: number, updateCb?: Function) {
222 │     let timeoutId: any = -1;
223 │     if (timeout && timeout > 0) {
224 ▶       timeoutId = setTimeout(() => {
225 │         this._callbacks = this._callbacks.filter((cb) => cb.timeoutId !== timeoutId);
226 ▶         cb();
227 │       }, timeout);
228 │     }
229 ▶     this._callbacks.push(<WaitCallback>{doneCb: cb, timeoutId: timeoutId, updateCb: updateCb});
230 │   }
231 │ 
232 │   /**
233 ▶    * Wait for the application to be stable with a timeout. If the timeout is reached before that
234 ▶    * happens, the callback receives a list of the macro tasks that were pending, otherwise null.
235 │    *
236 │    * @param doneCb The callback to invoke when Angular is stable or the timeout expires
237 │    *    whichever comes first.
238 ▶    * @param timeout Optional. The maximum time to wait for Angular to become stable. If not
239 ▶    *    specified, whenStable() will wait forever.
240 ▶    * @param updateCb Optional. If specified, this callback will be invoked whenever the set of
241 ▶    *    pending macrotasks changes. If this callback returns true doneCb will not be invoked
242 ▶    *    and no further updates will be issued.
243 │    */
244 │   whenStable(doneCb: Function, timeout?: number, updateCb?: Function): void {
245 ▶     if (updateCb && !this._taskTrackingZone) {
246 ▶       throw new Error(
247 │         'Task tracking zone is required when passing an update callback to ' +
248 │           'whenStable(). Is "zone.js/plugins/task-tracking" loaded?',
249 │       );
250 ▶     }
251 │     this.addCallback(doneCb, timeout, updateCb);
252 │     this._runCallbacksIfReady();
253 │   }
```

📄 `angular/packages/core/src/testability/testability.ts` L255–285 （▶ の行: 259, 269, 276–283）

```ts
255 │   /**
256 │    * Registers an application with a testability hook so that it can be tracked.
257 │    * @param token token of application, root element
258 │    *
259 ▶    * @internal
260 │    */
261 │   registerApplication(token: any) {
262 │     this.registry.registerApplication(token, this);
263 │   }
264 │ 
265 │   /**
266 │    * Unregisters an application.
267 │    * @param token token of application, root element
268 │    *
269 ▶    * @internal
270 │    */
271 │   unregisterApplication(token: any) {
272 │     this.registry.unregisterApplication(token);
273 │   }
274 │ 
275 │   /**
276 ▶    * Find providers by name
277 ▶    * @param using The root element to search from
278 ▶    * @param provider The name of binding variable
279 ▶    * @param exactMatch Whether using exactMatch
280 ▶    */
281 ▶   findProviders(using: any, provider: string, exactMatch: boolean): any[] {
282 ▶     // TODO(juliemr): implement.
283 ▶     return [];
284 │   }
285 │ }
```

88 行目の例は `bootstrapApplication(RootComponent, providers: […])` と、第 2 引数の `{ }` が抜けていて、tsc では `TS1005: ',' expected.` です。同じ説明を持つ platform-browser の browser.ts（L110）は `{providers: […]}` と正しく書いています。77〜78 行目「NgModule の bootstrap なら既定で入る」は、`BrowserModule` の providers に `TESTABILITY_PROVIDERS` が入っていることです（browser.ts L296）。

233〜234 行目「時間切れになれば、コールバックは残っていた macrotask の一覧を受け、そうでなければ null を受ける」を記録で確かめると、どちらの場合も **引数は 0 個**でした。226 行目の時間切れは `cb()`、187 行目の安定は `cb.doneCb()` で、何も渡しません。以前は `cb(this._didWork, this.getPendingTasks())` と `cb.doneCb(this._didWork)` でしたが、c2dd703d2ff（2024-01-02、`refactor(core): Remove internal-only testability features (#53767)`）が引数を外し、説明文は残りました。main でも同じです。spec の `should fire whenstable callback with didWork …`（testability\_spec.ts L270・L283）も名前だけが残り、引数は見ていません。

240〜242 行目の `updateCb` は、245〜250 行目で task-tracking の zone が無ければ例外です（記録では `Task tracking zone is required … Is "zone.js/plugins/task-tracking" loaded?`、読み込めば例外なし）。276〜280 行目の `findProviders` は 282〜283 行目の TODO のとおり、いつも `[]` を返します。

> **🧪 DEMO 1 — このページ（zone.js なし、AOT・本番）の本物で試す**
>
> 押すと本物の `@angular/core`（22.2.6）を呼んで表にします。PendingTasks と非同期の EventEmitter はサイトの ApplicationRef.isStable を読むだけで、足したタスクは外します。ErrorHandler はここで作った injector の中だけ、TransferState は new した別の実例です。「記録（開発モード）」は同じ関数を Node（domino の上の JIT、zone.js なし）で走らせた手元の記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-zone-errors)

> **🧪 DEMO 2 — zone.js ありの記録（Node、zone.js 0.16.2）**
>
> このページには zone.js が無いので、zone の約束は手元の記録スクリプトの結果を並べます。「task-tracking あり」は zone.js/plugins/task-tracking も読み込んだ開発モードの記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-zone-errors)

## 説明文の例を ngc にかける

📄 `例を 1 つずつ strict + strictTemplates の ngc にかけた結果（2026-11-22、手元の記録）`

```
# 説明文の例を 1 つずつ、strict の tsc と strictTemplates の ngc（@angular/compiler-cli 22.2.6）にかける
ngzone-demo.ts（ng_zone.ts L45-100 をそのまま）
  TS2564: Property 'label' has no initializer and is not definitely assigned in the constructor.（L64）
error-handler.ts（error_handler.ts L66-76、AppComponent だけ足す）
  TS7006: Parameter 'error' implicitly has an 'any' type.（L68）
zippy.ts（event_emitter.ts L33-57 と L63 の使う側）                 エラー 0
pending.ts（pending_tasks.ts L30-35・L66-71）                        エラー 0
transfer.ts（transfer_state.ts L19-24）                              エラー 0
testability.ts（testability.ts L86-88）
  TS1005: ',' expected.（L88 の providers: […] が { } で包まれていない）
```

## ここまでの呼び出し

- 👤 `ngZone.runTask(fn)`
  - `zone.scheduleEventTask('NgZoneEvent: …', fn)` — ng\_zone.ts L252
  - `zone.runTask(task)` — ng\_zone.ts L254 → zone.js — *task の中のエラーは handleError へ*
    - `onHandleError` → `onError.emit(e)` — ng\_zone.ts L518〜522 — *呼んだ側には投げない*
- 👤 `(click)="boom()"` が throw
  - `INTERNAL_APPLICATION_ERROR_HANDLER` — error\_handler.ts L146〜169 — *root の injector の ErrorHandler*
- 👤 `testability.whenStable(cb, 50)`
  - `addCallback` → `setTimeout(() => cb())` — testability.ts L221〜229 — *引数なし*

## テストと直し方

| ファイル（packages/core/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `zone/ng_zone_spec.ts` | `NgZone › run › should return the body return value from runTask`（299）・`should call onUnstable and onMicrotaskEmpty`（309） | 2・3 節 |
| 同 | `exceptions › should call the on error callback when it is invoked via zone.runGuarded`（814）・`should not call the on error callback but rethrow when it is invoked via zone.run`（828） | 2 節。runTask のエラーの it は無い |
| `event_emitter_spec.ts` | `EventEmitter › delivers events asynchronously when forced to async mode`（117）・`should work when no throw callback is provided`（41）・`contributes to app stability`（195） | 6 節 |
| `acceptance/pending_tasks_spec.ts` | `public PendingTasks`（70） | 7 節 |
| `transfer_state_spec.ts` | `TransferState`（36） | 8 節 |
| `testability/testability_spec.ts` | `Testability with PendingTasks › NgZone callback logic › whenStable with timeout`（148） | 9 節。引数は見ていない |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all "--test_arg=--filter=<下の名前>"
（結果は下の欄）
```

📄 `--filter ごとの結果（2026-11-22、手元の記録）`

```
# //packages/core/test:test は shard_count = 4。4 つの shard の「Ran N of M specs」を足した数
--filter=^NgZone           101 specs（25+25+26+25）、0 failures、2 pending
--filter=^NoopNgZone         3 specs、0 failures
--filter=^EventEmitter      17 specs、0 failures
--filter=^TransferState     19 specs、0 failures
--filter=^ErrorHandler       5 specs、0 failures
--filter=^Testability       16 specs、0 failures（TestabilityRegistry の 3 を含む）
# PendingTasks の spec は acceptance の方
//packages/core/test/acceptance:acceptance --filter=^PendingTasks          Ran 4 of 2693 specs、0 failures
//packages/core/test/acceptance:acceptance --filter=^public PendingTasks   Ran 4 of 2693 specs、0 failures
```

直すとしたら、説明文の 4 か所と例の 3 つです。ng\_zone.ts の 248 行目は「エラーは `onError` に出し、投げ直さない」に（振る舞いを説明に合わせるなら `runTask` の本体 L250〜258 を変えることになり、影響が大きい）、L111 は「microtask が残っていないか」に、testability.ts の 233〜234 行目は「引数なしで呼ぶ」に直します。ng\_zone.ts の例は `changeDetection: ChangeDetectionStrategy.Eager` を足すか `progress` を signal にし、`label` に初期値を、testability.ts の 88 行目は `{providers: […]}` にします。spec は ng\_zone\_spec.ts の `exceptions` に「runTask の中の同期のエラーは onError に出て投げ直されない」を、testability\_spec.ts に「doneCb は引数 0 個で呼ばれる」を足すと、説明文の約束が spec に移ります。

## 聞かれそうな質問

**Q. v22 でも NgZone の例のように `runOutsideAngular` で変更検知を減らせますか？**

zone を使うアプリで、しかも Eager のコンポーネントなら、例のとおり減ります（記録で 100 回が 2 回）。v22 の既定の OnPush では、ただのフィールドの書き換えはもともと画面に出ないので、例はどちらのボタンでも 1% のままでした。

**Q. `runTask` と `run` の違いは何ですか？**

`runTask` は event task を 1 つ作ってその中で走らせます（L252〜254）。戻り値は同じですが、同期のエラーは `runTask` だと `onError` に出て投げ直されません（248 行目の説明とは逆）。

**Q. ErrorHandler を lazy なルートの providers に置けば、そのルートのエラーだけ拾えますか？**

拾えません。テンプレートのリスナーのエラーは root の factory（L146〜169）が root の ErrorHandler に渡すので、子の injector の ErrorHandler には届きませんでした。`inject(ErrorHandler)` して自分で呼ぶ場合だけ、子のものが使われます。

**Q. `EventEmitter` の購読で error を渡し忘れるとどうなりますか？**

関数の形なら黙って捨てられ（146 行目）、`{next}` の observer の形ならあとで「捕まえていないエラー」として投げられます（152 行目）。形で違うので、error を受けたいなら必ず渡します。

**Q. `Testability.whenStable` のコールバックで、時間切れか安定かを見分けられますか？**

見分けられません。説明文（233〜234 行目）は一覧か null を渡すと書いていますが、どちらも引数なしで呼ばれます（187・226 行目）。

## 読み終えて

- NgZone の例は v22 の既定の OnPush では画面が進まず、Eager を足すと説明のとおりになる。
- `run` は投げ直し、`runGuarded` と `runTask` は `onError` へ。`runTask` の説明だけが逆。
- NgZone の `isStable` は microtask だけを見る。macrotask まで待つのは Testability。
- テンプレートのエラーはいつも root の ErrorHandler へ。非同期の EventEmitter と `PendingTasks.run` はアプリの安定をふさぐ。
- TransferState の説明は消えたモジュールの名前を残し（main と 22.2.6 で直った）、Testability の例と whenStable の説明は 2024 年の整理から取り残されている。

---

← 前: [viewChild()・contentChild() ほか signal のクエリの説明文](06-cra-signal-queries.md)  
次: [DebugElement と DebugNode の説明文](08-cra-debug.md) →
