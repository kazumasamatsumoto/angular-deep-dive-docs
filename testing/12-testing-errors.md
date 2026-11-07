[目次](../README.md) › [テストの内側](README.md) › 第 12 回 / 全 20 回

# エラーがテストの失敗になるまで：TestBedApplicationErrorHandler

> TestBed がテストモジュールに入れる TestBedApplicationErrorHandler と INTERNAL\_APPLICATION\_ERROR\_HANDLER の差し替えが、イベントのリスナーやスケジューラの tick、PendingTasks.run で捕まえたエラーを利用者の ErrorHandler に渡したあと、whenStable を待つ Promise があれば reject、なければ投げ直す流れ。TestBed.tick() を直接呼んだときは ErrorHandler を通らずにそのまま投げること、rethrowApplicationErrors: false で元の振る舞いに戻す行。fixture の constructor が ngZone.onError を購読して投げ直す理由と、zone.js が無いときと fakeAsync の中では投げない例外。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-errors)

---

アプリでは、クリックのハンドラで投げたエラーは `ErrorHandler` がコンソールに出すだけで、アプリは動き続けます。ところがテストでは、同じエラーで**テストが失敗します**。この章では、TestBed がテストモジュールに入れる `TestBedApplicationErrorHandler` と `INTERNAL_APPLICATION_ERROR_HANDLER` の差し替えが、エラーを利用者の `ErrorHandler` に渡したあと**投げ直す**流れを 1 行ずつ追い、`rethrowApplicationErrors: false` で元に戻す行と、fixture が `NgZone.onError` を投げ直す理由（と fakeAsync の例外）を読みます。

読む対象は `packages/core/testing/src/application_error_handler.ts`・`test_bed_compiler.ts`・`fixture.ts`、`packages/core/src/error_handler.ts`・`render3/instructions/shared.ts`・`render3/view/listeners.ts`、確かめる spec は `packages/core/test/component_fixture_spec.ts` です。

1. [1. 全体像](01-testing-overview.md)
2. [2. initTestEnvironment](02-testing-init-environment.md)
3. [3. 後片付け](03-testing-reset-teardown.md)
4. [4. TestBed.inject](04-testing-inject.md)
5. [5. createComponent](05-testing-create-component.md)
6. [6. 入力の渡し方](06-testing-component-bindings.md)
7. [7. createDirective](07-testing-directive-fixture.md)
8. [8. DebugElement と By](08-testing-debug-element.md)
9. [9. detectChanges](09-testing-detect-changes.md)
10. [10. 自動の変更検知](10-testing-auto-detect.md)
11. [11. whenStable](11-testing-when-stable.md)
12. **12. エラーの伝わり方**（この章）
13. [13. fakeAsync](13-testing-fake-async.md)
14. [14. 偽の時計](14-testing-fake-async-scheduler.md)
15. [15. waitForAsync と ProxyZone](15-testing-wait-for-async.md)
16. [16. zone なしの時間](16-testing-zoneless-time.md)
17. [17. effect と signal](17-testing-effects.md)
18. [18. @defer](18-testing-defer.md)
19. [19. RouterTestingHarness](19-testing-router-harness.md)
20. [20. issue と変更を読む](20-testing-issues.md)

## 1. 本番の既定：INTERNAL\_APPLICATION\_ERROR\_HANDLER

Angular の内側でエラーを捕まえる場所は、`ErrorHandler` を直接ではなく、このトークンの関数を呼びます。

📄 `angular/packages/core/src/error_handler.ts` L146–169 （▶ の行: 146, 149–153, 155–159, 162–163）

```ts
146 ▶ export const INTERNAL_APPLICATION_ERROR_HANDLER = new InjectionToken<(e: any) => void>(
147 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'internal error handler' : '',
148 │   {
149 ▶     factory: () => {
150 ▶       // The user's error handler may depend on things that create a circular dependency
151 ▶       // so we inject it lazily.
152 ▶       const zone = inject(NgZone);
153 ▶       const injector = inject(EnvironmentInjector);
154 │       let userErrorHandler: ErrorHandler;
155 ▶       return (e: unknown) => {
156 ▶         zone.runOutsideAngular(() => {
157 ▶           if (injector.destroyed && !userErrorHandler) {
158 ▶             setTimeout(() => {
159 ▶               throw e;
160 │             });
161 │           } else {
162 ▶             userErrorHandler ??= injector.get(ErrorHandler);
163 ▶             userErrorHandler.handleError(e);
164 │           }
165 │         });
166 │       };
167 │     },
168 │   },
169 │ );
```

1. **146〜149 行目**

   トークン自体が `factory` を持っているので、誰も provide しなければこの関数が使われます。
2. **155〜156 行目**

   返すのは `(e) => ...` という関数で、中身を NgZone の外で走らせます（zoneless では `NoopNgZone` なのでそのまま呼ぶだけ）。
3. **162〜163 行目**

   初めて呼ばれたときに `ErrorHandler` を取り（150〜151 行目のコメントのとおり、循環を避けるため遅らせて）、`handleError(e)` に渡します。**投げ直しはしません**。
4. **157〜160 行目**

   インジェクタがもう壊れていて ErrorHandler を取れないときだけ、`setTimeout` の中で投げて、エラーが消えないようにします。

## 2. エラーを捕まえて、このトークンへ渡す場所

テンプレートのイベントのリスナーを例にします。

📄 `angular/packages/core/src/render3/view/listeners.ts` L82–100 （▶ の行: 92–95）

```ts
 82 │ function executeListenerWithErrorHandling(
 83 │   lView: LView,
 84 │   context: unknown,
 85 │   listenerFn: EventCallback,
 86 │   e: any,
 87 │ ): boolean {
 88 │   const prevConsumer = setActiveConsumer(null);
 89 │   try {
 90 │     profiler(ProfilerEvent.OutputStart, context as {} | null, listenerFn);
 91 │     // Only explicitly returning false from a listener should preventDefault
 92 ▶     return listenerFn(e) !== false;
 93 ▶   } catch (error) {
 94 ▶     handleUncaughtError(lView, error);
 95 ▶     return false;
 96 │   } finally {
 97 │     profiler(ProfilerEvent.OutputEnd, context, listenerFn);
 98 │     setActiveConsumer(prevConsumer);
 99 │   }
100 │ }
```

📄 `angular/packages/core/src/render3/instructions/shared.ts` L706–719 （▶ の行: 707, 714, 718）

```ts
706 │ /** Handles an error thrown in an LView. */
707 ▶ export function handleUncaughtError(lView: LView, error: any): void {
708 │   const injector = lView[INJECTOR];
709 │   if (!injector) {
710 │     return;
711 │   }
712 │   let errorHandler: ((e: any) => void) | null;
713 │   try {
714 ▶     errorHandler = injector.get(INTERNAL_APPLICATION_ERROR_HANDLER, null);
715 │   } catch {
716 │     errorHandler = null;
717 │   }
718 ▶   errorHandler?.(error);
719 │ }
```

listeners.ts の 92 行目で利用者のハンドラを呼び、投げたら 93〜94 行目で `handleUncaughtError` に渡します。shared.ts の 714 行目でビューのインジェクタから `INTERNAL_APPLICATION_ERROR_HANDLER` を取り、718 行目で呼びます。**718 行目は try で包まれていない**ので、この関数が投げれば、そのエラーはリスナーを呼んだ側まで出ていきます。

同じトークンを呼ぶ場所はほかにもあります。zoneless のスケジューラ（`ChangeDetectionSchedulerImpl.tick`）は `appRef._tick()` を try で包み、catch でこのトークンを呼びます（[zoneless-pending-tasks](../zoneless/09-zoneless-pending-tasks.md)）。公開 API の `PendingTasks.run` も、渡した関数の失敗をこのトークンに渡します（同じ章）。zone のときは `NgZoneChangeDetectionScheduler` の tick が同じ形です。逆に、`TestBed.tick()` や `fixture.detectChanges()` は `ApplicationRef.tick()` を直接呼ぶので（[第 9 回](09-testing-detect-changes.md)）、間に catch がなく、エラーはそのままテストに出てきます。

## 3. TestBed がトークンを差し替える

📄 `angular/packages/core/testing/src/test_bed_compiler.ts` L1002–1023 （▶ の行: 1010, 1012–1015, 1017–1018, 1020）

```ts
1002 │     const providers = [
1003 │       {provide: Compiler, useFactory: () => new R3TestCompiler(this)},
1004 │       {provide: DEFER_BLOCK_CONFIG, useValue: {behavior: this.deferBlockBehavior}},
1005 │       {
1006 │         provide: ANIMATIONS_DISABLED,
1007 │         useValue: !this.animationsEnabled,
1008 │       },
1009 │       {
1010 ▶         provide: INTERNAL_APPLICATION_ERROR_HANDLER,
1011 │         useFactory: () => {
1012 ▶           if (this.rethrowApplicationTickErrors) {
1013 ▶             const handler = inject(TestBedApplicationErrorHandler);
1014 ▶             return (e: unknown) => {
1015 ▶               handler.handleError(e);
1016 │             };
1017 ▶           } else {
1018 ▶             const userErrorHandler = inject(ErrorHandler);
1019 │             const ngZone = inject(NgZone);
1020 ▶             return (e: unknown) => ngZone.runOutsideAngular(() => userErrorHandler.handleError(e));
1021 │           }
1022 │         },
1023 │       },
```

テストモジュールの組み立て（`compileTestModule`。全体は [ngmodule-testbed](../ngmodule/17-ngmodule-testbed.md)）の providers に、1010 行目で `INTERNAL_APPLICATION_ERROR_HANDLER` が入ります。トークンの `factory`（1 節の 149 行目）より、provide されたものが勝ちます。

1. **1012〜1016 行目 既定（rethrow する）**

   `TestBedApplicationErrorHandler` を取り、エラーをその `handleError` に渡す関数を返します。
2. **1017〜1021 行目 rethrowApplicationErrors: false**

   1 節の本番の既定とほぼ同じ「ErrorHandler に渡すだけ」の関数を返します（インジェクタが壊れているときの `setTimeout` は無い）。

📄 `angular/packages/core/testing/src/test_bed_compiler.ts` L236–242 （▶ の行: 240–241）

```ts
236 │     }
237 │ 
238 │     this.deferBlockBehavior = moduleDef.deferBlockBehavior ?? DEFER_BLOCK_DEFAULT_BEHAVIOR;
239 │     this.animationsEnabled = moduleDef.animationsEnabled ?? ANIMATIONS_ENABLED_DEFAULT;
240 ▶     this.rethrowApplicationTickErrors =
241 ▶       moduleDef.rethrowApplicationErrors ?? RETHROW_APPLICATION_ERRORS_DEFAULT;
242 │   }
```

1012 行目の `rethrowApplicationTickErrors` は、`configureTestingModule` の最後の 240〜241 行目で `rethrowApplicationErrors ?? RETHROW_APPLICATION_ERRORS_DEFAULT` に決まります。既定値は 4 節で見る application\_error\_handler.ts の 11 行目の `true` です。オプションの説明はこうです。

📄 `angular/packages/core/testing/src/test_bed_common.ts` L74–86 （▶ の行: 77–79, 81–82, 84）

```ts
74 │   /**
75 │    * Whether errors that happen during application change detection should be rethrown.
76 │    *
77 ▶    * When `true`, errors that are caught during application change detection will
78 ▶    * be reported to the `ErrorHandler` and rethrown to prevent them from going
79 ▶    * unnoticed in tests.
80 │    *
81 ▶    * When `false`, errors are only forwarded to the `ErrorHandler`, which by default
82 ▶    * simply logs them to the console.
83 │    *
84 ▶    * Defaults to `true`.
85 │    */
86 │   rethrowApplicationErrors?: boolean;
```

## 4. TestBedApplicationErrorHandler.handleError

📄 `angular/packages/core/testing/src/application_error_handler.ts` L9–42 （▶ の行: 11, 18, 20, 22–24, 26–27, 30, 33–35, 37–39）

```ts
 9 │ import {ErrorHandler, inject, NgZone, Injectable, EnvironmentInjector} from '../../src/core';
10 │ 
11 ▶ export const RETHROW_APPLICATION_ERRORS_DEFAULT = true;
12 │ 
13 │ @Injectable()
14 │ export class TestBedApplicationErrorHandler {
15 │   private readonly zone = inject(NgZone);
16 │   private readonly injector = inject(EnvironmentInjector);
17 │   private userErrorHandler?: ErrorHandler;
18 ▶   readonly whenStableRejectFunctions: Set<(e: unknown) => void> = new Set();
19 │ 
20 ▶   handleError(e: unknown) {
21 │     try {
22 ▶       this.zone.runOutsideAngular(() => {
23 ▶         this.userErrorHandler ??= this.injector.get(ErrorHandler);
24 ▶         this.userErrorHandler.handleError(e);
25 │       });
26 ▶     } catch (userError: unknown) {
27 ▶       e = userError;
28 │     }
29 │ 
30 ▶     // Instead of throwing the error when there are outstanding `fixture.whenStable` promises,
31 │     // reject those promises with the error. This allows developers to write
32 │     // expectAsync(fix.whenStable()).toBeRejected();
33 ▶     if (this.whenStableRejectFunctions.size > 0) {
34 ▶       for (const fn of this.whenStableRejectFunctions.values()) {
35 ▶         fn(e);
36 │       }
37 ▶       this.whenStableRejectFunctions.clear();
38 ▶     } else {
39 ▶       throw e;
40 │     }
41 │   }
42 │ }
```

1. **22〜24 行目 まず利用者の ErrorHandler**

   NgZone の外で、23 行目で `ErrorHandler` を（1 回目だけ）取り、24 行目で `handleError(e)` を呼びます。既定の `ErrorHandler` はコンソールに出すので、テストの出力にもエラーが 1 回出ます。
2. **26〜27 行目 利用者のハンドラが投げたら差し替える**

   利用者の `handleError` が投げたエラーを、以降は `e` として扱います。
3. **33〜37 行目 whenStable を待っている人がいれば reject**

   18 行目の `whenStableRejectFunctions` は、`fixture.whenStable()` が待つときに reject を入れておく `Set` です（[第 11 回](11-testing-when-stable.md)の whenStable）。1 つ以上あれば 34〜36 行目で**全部**を reject し、37 行目で空にします。このときは投げません。
4. **38〜40 行目 いなければ投げる**

   39 行目で `throw e`。これが 2 節の 718 行目から外へ出て、`triggerEventHandler` などを呼んだテストのコードで投げられます。30〜32 行目のコメントのとおり、`expectAsync(fix.whenStable()).toBeRejected()` と書けるようにするための分かれ道です。

## 5. このサイトの ng test で確かめる

このサイトの ng test（Vitest + jsdom、zone.js なし、`@angular/core` 22.1.6）で、`{ provide: ErrorHandler, useValue: { handleError: (e) => ログに足す } }` を入れて記録した順番です。

| やったこと | 記録された順番 | 行 |
| --- | --- | --- |
| `(click)` のハンドラが投げる。`debugElement.triggerEventHandler('click', {})` | ① 利用者の handleError ② テストの catch に `boom in click` | 24 → 39 → shared.ts 718 から外へ |
| 同じボタンで `button.click()`（DOM のイベント） | ① 利用者の handleError ② `window` の `error` イベントに `boom in click` ③ `click()` は普通に戻る | 39 行目で投げたものは DOM のイベントの配り手が受け取り、呼んだ側へは出ない |
| `rethrowApplicationErrors: false` で `triggerEventHandler` | ① 利用者の handleError ② `triggerEventHandler` は普通に戻る | 1017〜1021 行目 |
| `rethrowApplicationErrors: false` で `ngOnInit` が投げるものを作り `await whenStable()` | ① 利用者の handleError ② **resolve（true）** | whenStable の reject も無くなる |
| effect が投げる。`set` → `TestBed.tick()` | ① `TestBed.tick()` がそのまま投げる（利用者の handleError は**呼ばれない**） | tick を直接呼ぶ道には catch が無い（2 節） |
| effect が投げる。`set` → `await whenStable()` | ① 利用者の handleError ② whenStable が reject | スケジューラの catch → 24 → 34〜36 |
| 利用者の handleError が `new Error('wrapped by user')` を投げる | ① 利用者の handleError ② テストの catch に `wrapped by user` | 26〜27 行目で差し替え |

> [!WARNING]
> **ハマりどころ**
>
> 表の 2 段目の `button.click()` では、私は `window` の `error` イベントで `preventDefault()` して記録しました。それをしないときに Vitest がその実行を失敗にするかどうかは、この章では確かめていません。確実にテストの失敗にしたいなら、`triggerEventHandler`（[第 8 回](08-testing-debug-element.md)）で呼ぶか、そのあと `await fixture.whenStable()` を待つ形にします。

## 6. fixture が NgZone.onError を投げ直す（zone のとき）

📄 `angular/packages/core/testing/src/fixture.ts` L105–127 （▶ の行: 107, 109, 111, 116, 119–120, 122）

```ts
105 │     // Create subscriptions outside the NgZone so that the callbacks run outside
106 │     // of NgZone.
107 ▶     this._ngZone.runOutsideAngular(() => {
108 │       this.subscriptions.add(
109 ▶         this._ngZone.onError.subscribe({
110 │           next: (error: any) => {
111 ▶             // The rethrow here is to ensure that errors don't go unreported. Since `NgZone.onHandleError` returns `false`,
112 │             // ZoneJS will not throw the error coming out of a task. Instead, the handling is defined by
113 │             // the chain of parent delegates and whether they indicate the error is handled in some way (by returning `false`).
114 │             // Unfortunately, 'onError' does not forward the information about whether the error was handled by a parent zone
115 │             // so cannot know here whether throwing is appropriate. As a half-solution, we can check to see if we're inside
116 ▶             // a fakeAsync context, which we know has its own error handling.
117 │             // https://github.com/angular/angular/blob/db2f2d99c82aae52d8a0ae46616c6411d070b35e/packages/zone.js/lib/zone-spec/fake-async-test.ts#L783-L784
118 │             // https://github.com/angular/angular/blob/db2f2d99c82aae52d8a0ae46616c6411d070b35e/packages/zone.js/lib/zone-spec/fake-async-test.ts#L473-L478
119 ▶             if (typeof Zone === 'undefined' || Zone.current.get('FakeAsyncTestZoneSpec')) {
120 ▶               return;
121 │             }
122 ▶             throw error;
123 │           },
124 │         }),
125 │       );
126 │     });
127 │   }
```

1. **107〜109 行目**

   constructor の後半で、zone の外から `NgZone.onError` を購読します。zone では、zone の中のタスクで投げられたエラーが `onHandleError` から `onError` に流れます（[zone-ngzone-fork](../zone/09-zone-ngzone-fork.md)）。
2. **111〜113 行目 なぜ投げ直すか**

   `NgZone` の `onHandleError` は `false` を返すので、zone.js はタスクから出たエラーを投げません。黙って消えないように、ここで投げます。
3. **119〜121 行目 投げない 2 つの場合**

   `Zone` が無い（zone.js を読み込んでいない）か、いまの zone に `FakeAsyncTestZoneSpec` があるときは何もしません。116 行目のコメントのとおり、fakeAsync には自前のエラーの扱いがあるからです。`FakeAsyncTestZoneSpec` の `onHandleError` はエラーをしまっておき、`tick` / `flush` の終わりに投げます（[第 13 回](13-testing-fake-async.md)）。ここでも投げると、同じエラーが 2 回出ます。
4. **zoneless では**

   `NgZone` は `NoopNgZone` で、その `onError` に流す人はいません（[zoneless-default](../zoneless/01-zoneless-default.md)）。このサイトの ng test では `typeof Zone` が `"undefined"` なので、119 行目で必ず戻ります。zoneless のテストでエラーを投げ直しているのは、4 節の `TestBedApplicationErrorHandler` だけです。

## 7. 呼び出しの連なり

- 👤 `fixture.debugElement.query(...).triggerEventHandler('click', {})` — あなたの spec
  - `executeListenerWithErrorHandling(lView, context, listenerFn, e)` — render3/view/listeners.ts L82
    - 👤 `boom()` が throw — あなたのコンポーネント — *L92*
    - `handleUncaughtError(lView, error)` — listeners.ts L94 → shared.ts L707
      - `injector.get(INTERNAL_APPLICATION_ERROR_HANDLER)` — shared.ts L714 — *TestBed が入れた関数（test\_bed\_compiler.ts L1010）*
      - `TestBedApplicationErrorHandler.handleError(e)` — testing/src/application\_error\_handler.ts L20
        - 👤 `ErrorHandler.handleError(e)` — あなたの ErrorHandler（既定はコンソール） — *L24*
        - `throw e` — application\_error\_handler.ts L39 — *whenStable を待つ人がいれば代わりに reject（L33-37）*
  - `（例外が triggerEventHandler から出る）` — shared.ts L718 は try で包まれていない

## 8. デモ：handleError の分かれ道

> **🧪 DEMO — TestBedApplicationErrorHandler の再現**
>
> test\_bed\_compiler.ts 1012〜1021 行目と application\_error\_handler.ts 20〜41 行目を、小さな関数で再現しています。本物の TestBed は使いません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-errors)

## テストと直し方

📄 `angular/packages/core/test/component_fixture_spec.ts` L424–459 （▶ の行: 438–439, 441, 445–446, 449–450, 457）

```ts
424 │   describe('errors during ApplicationRef.tick', () => {
425 │     @Component({
426 │       template: '',
427 │     })
428 │     class ThrowingThing {
429 │       ngOnInit() {
430 │         throw new Error();
431 │       }
432 │     }
433 │     @Component({
434 │       template: '',
435 │     })
436 │     class Blank {}
437 │ 
438 ▶     it('rejects whenStable promise when errors happen during appRef.tick', async () => {
439 ▶       TestBed.configureTestingModule({providers: [provideZoneChangeDetection()]});
440 │       const fixture = TestBed.createComponent(Blank);
441 ▶       const throwingThing = createComponent(ThrowingThing, {
442 │         environmentInjector: TestBed.inject(EnvironmentInjector),
443 │       });
444 │ 
445 ▶       TestBed.inject(ApplicationRef).attachView(throwingThing.hostView);
446 ▶       await expectAsync(fixture.whenStable()).toBeRejected();
447 │     });
448 │ 
449 ▶     it('can opt-out of rethrowing application errors and rejecting whenStable promises', async () => {
450 ▶       TestBed.configureTestingModule({rethrowApplicationErrors: false});
451 │       const fixture = TestBed.createComponent(Blank);
452 │       const throwingThing = createComponent(ThrowingThing, {
453 │         environmentInjector: TestBed.inject(EnvironmentInjector),
454 │       });
455 │ 
456 │       TestBed.inject(ApplicationRef).attachView(throwingThing.hostView);
457 ▶       await expectAsync(fixture.whenStable()).toBeResolved();
458 │     });
459 │   });
```

`describe('ComponentFixture')` の中の `describe('errors during ApplicationRef.tick')`（component\_fixture\_spec.ts:424）です。441〜445 行目で fixture ではない別のビューを ApplicationRef に付け、その `ngOnInit` のエラーで 446 行目の `whenStable()` が reject されること（4 節の 33〜37 行目）、450 行目で `rethrowApplicationErrors: false` にすると 457 行目で resolve されること（3 節の 1017〜1021 行目）を見ています。外側の `describe('ComponentFixture')` の beforeEach（:173）が `provideZoneChangeDetection()` を入れているので、この 2 本は zone で走ります（439 行目はそれをもう一度入れています）。

📄 `angular/packages/core/test/component_fixture_spec.ts` L393–422 （▶ の行: 393, 404, 408, 416–418, 420）

```ts
393 ▶   it('should not duplicate errors when used with fake async', fakeAsync(() => {
394 │     @Component({
395 │       template: '<button (click)="doThrow()">a</button>',
396 │     })
397 │     class Throwing {
398 │       doThrow() {
399 │         throw new Error('thrown');
400 │       }
401 │     }
402 │     TestBed.configureTestingModule({
403 │       providers: [
404 ▶         {
405 │           provide: ErrorHandler,
406 │           useClass: class {
407 │             handleError(e: unknown) {
408 ▶               throw e;
409 │             }
410 │           },
411 │         },
412 │       ],
413 │     });
414 │     const fix = TestBed.createComponent(Throwing);
415 │     try {
416 ▶       fix.nativeElement.querySelector('button').click();
417 ▶       tick();
418 ▶       fail('should have thrown');
419 │     } catch (e) {
420 ▶       expect((e as Error).message).toMatch('thrown');
421 │     }
422 │   }));
```

6 節の 119 行目の確かめは `it('should not duplicate errors when used with fake async')`（:393）です。404〜411 行目で ErrorHandler が投げ直すようにしておき、416 行目のクリックのエラーが 417 行目の `tick()` から 1 回だけ出ることを見ています。この spec は zone.js と fakeAsync が要るので、このサイトの ng test では走らせられません。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test:test --test_arg=--filter="errors during ApplicationRef.tick" --test_output=all
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Ran 0 of 1399 specs
0 specs, 0 failures
Ran 0 of 1399 specs
0 specs, 0 failures
Ran 1 of 1400 specs
1 spec, 0 failures
Ran 1 of 1400 specs
1 spec, 0 failures
INFO: Elapsed time: 2.386s, Critical Path: 1.69s
//packages/core/test:test                                                PASSED in 1.5s
```

1. **件数の読み方**

   0 + 0 + 1 + 1 = 2 本。438 行目と 449 行目の 2 本の it です。shard の 2 つが `Ran 0` でも、4 つの合計が 2 なら狙いどおりです。
2. **直すとしたら**

   投げ直しの順番は `TestBedApplicationErrorHandler.handleError`（application\_error\_handler.ts 20 行目）、オプションで切り替える場所は test\_bed\_compiler.ts の 1010 行目の factory、zone の投げ直しは fixture.ts の 109 行目の購読です。テストは `describe('errors during ApplicationRef.tick')` か `describe('ComponentFixture with zoneless')` に足すのが入口です。
3. **issue を読むときの手がかり**

   「ErrorHandler をモックしたのにテストが落ちる」「アップデートしたら今まで通っていたテストがエラーで落ちる」という報告は、4 節の 39 行目と 3 節の 1017 行目でたどれます。手元では 5 節の表のように、利用者の ErrorHandler に記録させて順番を並べると切り分けられます（[第 20 回](20-testing-issues.md)）。

## 聞かれそうな質問

**Q. テストで ErrorHandler をモックしても、テストが失敗するのはなぜですか？**

モックは呼ばれています（24 行目）。そのあと TestBed が 39 行目で投げ直すからです。モックは「呼ばれたこと」を確かめるのには使えますが、投げ直しを止めるものではありません。止めるのは 1017〜1021 行目に進ませる `rethrowApplicationErrors: false` です。モックが投げると、26〜27 行目でそのエラーに差し替わって投げられます（5 節の最後の行）。

**Q. rethrowApplicationErrors: false はいつ使いますか？**

エラーが起きることそのものが仕様で、その**報告のされ方**を確かめたいときです。たとえば自作の `ErrorHandler` が呼ばれることや、エラーのあともアプリが動き続けることを見るテストです（spec の 449〜458 行目）。81〜82 行目のとおり、false にするとエラーは ErrorHandler に渡るだけになり、気づかないまま通るテストを作りやすくなるので、テスト単位で付けます。

**Q. fakeAsync の中では fixture が onError を投げ直さないのはなぜですか？**

119 行目で `FakeAsyncTestZoneSpec` がいるときは戻るからです。fakeAsync の zone はエラーを自分でしまって `tick` / `flush` で投げるので、ここでも投げると 2 回になります。spec の 393〜422 行目がその「重ならない」ことを確かめています。

**Q. effect の中のエラーはどうなりますか？**

effect を回したのが誰かで変わります。`TestBed.tick()` で回すと、tick を直接呼ぶ道に catch が無いので、ErrorHandler を通らずに `TestBed.tick()` から投げられます。スケジューラに任せると、スケジューラの catch から `INTERNAL_APPLICATION_ERROR_HANDLER` に渡り、24 行目で ErrorHandler が呼ばれたあと、待っている `whenStable()` が reject されます（5 節の表）。effect の流れ自体は[第 17 回](17-testing-effects.md)で扱います。

## 読み終えて

- Angular の内側は、捕まえたエラーを `INTERNAL_APPLICATION_ERROR_HANDLER` に渡す。本番の既定は ErrorHandler に渡すだけ（error\_handler.ts L155-165）。
- TestBed はこのトークンを差し替え（L1010）、`TestBedApplicationErrorHandler` が ErrorHandler に渡したあと、whenStable を待つ人がいれば reject、いなければ投げる（L24・L33-39）。
- `rethrowApplicationErrors: false` で「渡すだけ」に戻る（L1017-1021）。
- zone のときは fixture が `NgZone.onError` も投げ直す。zone.js が無いときと fakeAsync の中では投げない（L119）。

---

← 前: [isStable と whenStable：何を「安定」と呼んで待つのか](11-testing-when-stable.md)  
次: [fakeAsync：@angular/core/testing から zone.js の FakeAsyncTestZoneSpec へ](13-testing-fake-async.md) →
