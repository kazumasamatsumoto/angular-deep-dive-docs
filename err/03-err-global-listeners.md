[目次](../README.md) › [ErrorHandler とエラーの行き先](README.md) › 第 3 回 / 全 6 回

# ブラウザの全体のエラー：provideBrowserGlobalErrorListeners

> window の error と unhandledrejection を入口に渡す provideBrowserGlobalErrorListeners（65adb3024d6）の全部の行、Zone.root で付けて変更検知を起こさない修正（0ac949c2666）、error を持たない ErrorEvent を包む修正（572c32a0387、#62078）、zone.js の既定で zone の外の Promise の reject が unhandledrejection にならない道（#51357）、ng new の雛形と TestBed。spec の 2 本が b84859073bf から中身を走らせていないこと。本物のリスナーを偽の window の上で動かす。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/err-global-listeners)

---

[第 2 回](02-err-where-caught.md)の地図のどこにも来ないエラー（`setTimeout` の中、Promise を返すリスナー、自分で付けた `addEventListener`）は、zoneless では window の `error` と `unhandledrejection` に届きます。この章では、それを ErrorHandler に戻す `provideBrowserGlobalErrorListeners()`（65adb3024d6）の行を全部読み、変更検知を起こさない修正（0ac949c2666）、`error` を持たない `ErrorEvent` を包む修正（572c32a0387、#62078）、zone.js があるときの違い（#51357）、新しいアプリの雛形と TestBed での扱いまでを追います。デモは本物のリスナーを**偽の window** の上で動かします。

読む対象は `packages/core/src/error_handler.ts` の 186〜253 行目、zone.js の `lib/common/promise.ts`・`lib/browser/browser.ts`、angular-cli の `packages/schematics/angular/application/files/`、spec は `packages/core/test/error_handler_spec.ts` です。リスナーが呼ぶ入口 `INTERNAL_APPLICATION_ERROR_HANDLER` は[第 1 回](01-err-handler-core.md)で読みました。

1. [1. ErrorHandler と内部の入口](01-err-handler-core.md)
2. [2. エラーを捕まえる場所の地図](02-err-where-caught.md)
3. **3. ブラウザの全体のエラー**（この章）
4. [4. @boundary の実行時](04-err-boundary-runtime.md)
5. [5. @boundary のコンパイル](05-err-boundary-compile.md)
6. [6. spec と issue](06-err-tests-issues.md)

## 1. 入れる関数は「トークンを 1 回 inject する初期化」だけ

📄 `angular/packages/core/src/error_handler.ts` L240–253 （▶ の行: 241, 243, 247, 249–251）

```ts
240 │ /**
241 ▶  * Provides an environment initializer which forwards unhandled errors to the ErrorHandler.
242 │  *
243 ▶  * The listeners added are for the window's 'unhandledrejection' and 'error' events.
244 │  *
245 │  * @see [Global error listeners](best-practices/error-handling#global-error-listeners)
246 │  *
247 ▶  * @publicApi
248 │  */
249 ▶ export function provideBrowserGlobalErrorListeners(): EnvironmentProviders {
250 ▶   return makeEnvironmentProviders([
251 ▶     provideEnvironmentInitializer(() => void inject(globalErrorListeners)),
252 │   ]);
253 │ }
```

1. **251 行目**

   `provideEnvironmentInitializer` で、環境の注入器の初期化のときに `inject(globalErrorListeners)` を呼ぶだけです。`void` は戻り値を捨てる印で、このトークンの値は `void`（186 行目の型）です。リスナーを付ける仕事は、トークンの `factory` が**作られるとき**に 1 回だけします。
2. **2 回 provide しても 1 回**

   トークンは factory を持つので root の注入器に 1 つです（[di-injection-token](../di/06-di-injection-token.md)）。初期化が 2 回 `inject` しても、2 回目は作ってある値（`undefined`）を返すだけで、リスナーは増えません。7 節のデモで「2 回入れる」にしても、起動後のリスナーは `error` 1 個・`unhandledrejection` 1 個のままです。

## 2. factory の前半：付けない 2 つの場合と、unhandledrejection

📄 `angular/packages/core/src/error_handler.ts` L186–202 （▶ の行: 186, 189–191, 193–195, 198–201）

```ts
186 ▶ const globalErrorListeners = new InjectionToken<void>(
187 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'GlobalErrorListeners' : '',
188 │   {
189 ▶     factory: () => {
190 ▶       if (typeof ngServerMode !== 'undefined' && ngServerMode) {
191 ▶         return;
192 │       }
193 ▶       const window = inject(DOCUMENT).defaultView;
194 ▶       if (!window) {
195 ▶         return;
196 │       }
197 │ 
198 ▶       const errorHandler = inject(INTERNAL_APPLICATION_ERROR_HANDLER);
199 ▶       const rejectionListener = (e: PromiseRejectionEvent) => {
200 ▶         errorHandler(e.reason);
201 ▶         e.preventDefault();
202 │       };
```

1. **190〜192 行目 サーバーでは付けない**

   `ngServerMode` が真（SSR やプリレンダー）なら何もしません。このサイトのようにプリレンダーするアプリでも、サーバーの上ではリスナーは付きません。
2. **193〜196 行目 window は DOCUMENT から**

   グローバルの `window` ではなく、`inject(DOCUMENT).defaultView` を使います。`defaultView` が無ければ何もしません。デモはここを使い、`DOCUMENT` を「`defaultView` が `EventTarget` の偽物」に差し替えて、本物の window に触らずに本物のリスナーを動かしています。
3. **198 行目 渡す先は入口**

   ErrorHandler ではなく `INTERNAL_APPLICATION_ERROR_HANDLER` の関数を取ります（[第 1 回](01-err-handler-core.md)）。だから TestBed の中では、この関数は TestBed の投げ直す関数になります（6 節）。
4. **199〜202 行目 unhandledrejection**

   `e.reason`（reject された値そのもの）を渡し、`preventDefault()` します。`unhandledrejection` の `preventDefault()` は、ブラウザが自分でコンソールに「Uncaught (in promise)」と出すのを止めます。reason は包まないので、文字列で reject すれば文字列が届きます（デモの最後の行）。

## 3. error のリスナー：error の無い ErrorEvent を包む（572c32a0387、#62078）

📄 `angular/packages/core/src/error_handler.ts` L203–217 （▶ の行: 203–212, 216）

```ts
203 ▶       const errorListener = (e: ErrorEvent) => {
204 ▶         if (e.error) {
205 ▶           errorHandler(e.error);
206 ▶         } else {
207 ▶           errorHandler(
208 ▶             new Error(
209 ▶               ngDevMode
210 ▶                 ? `An ErrorEvent with no error occurred. See Error.cause for details: ${e.message}`
211 ▶                 : e.message,
212 ▶               {cause: e},
213 │             ),
214 │           );
215 │         }
216 ▶         e.preventDefault();
217 │       };
```

最初の形（65adb3024d6）は `e.error` をそのまま渡していました。

📄 `git show 65adb3024d6（抜粋）`

```
$ git show 65adb3024d6 --format='%h %ad %s' --date=short -- packages/core/src/error_handler.ts（抜粋）
65adb3024d6 2025-04-01 feat(core): Add provider which reports unhandled errors on window to ErrorHandler (#60704)
…
+    const errorHandler = inject(INTERNAL_APPLICATION_ERROR_HANDLER);
+    const rejectionListener = (e: PromiseRejectionEvent) => {
+      errorHandler(e.reason);
+      e.preventDefault();
+    };
+    const errorListener = (e: ErrorEvent) => {
+      errorHandler(e.error);
+      e.preventDefault();
+    };
+
+    window.addEventListener('unhandledrejection', rejectionListener);
+    window.addEventListener('error', errorListener);
…
```

ところが `ErrorEvent` には `error` を持たないものがあります。#62078（2025-06-16）は、ブラウザの「ResizeObserver loop completed with undelivered notifications.」が `handleError(null)` になり、何のエラーか分からないという報告でした。2 日後に直したのが次の差分です。

📄 `git show 572c32a0387`

```
$ git show 572c32a0387 --format='%h %ad %s' --date=short -- packages/core/src/error_handler.ts
572c32a0387 2025-06-16 fix(core): Wrap ErrorEvent with no error property (#62081)
@@ -100,7 +100,18 @@ const globalErrorListeners = new InjectionToken<void>(ngDevMode ? 'GlobalErrorLi
       e.preventDefault();
     };
     const errorListener = (e: ErrorEvent) => {
-      errorHandler(e.error);
+      if (e.error) {
+        errorHandler(e.error);
+      } else {
+        errorHandler(
+          new Error(
+            ngDevMode
+              ? `An ErrorEvent with no error occurred. See Error.cause for details: ${e.message}`
+              : e.message,
+            {cause: e},
+          ),
+        );
+      }
       e.preventDefault();
     };
```

1. **204〜205 行目 error があればそのまま**

   ふつうの `throw new Error()` が window まで届いたときは、`e.error` がその Error です。
2. **206〜214 行目 無ければ Error を作って包む**

   `e.message` を文に入れた新しい `Error` を作り、`{cause: e}` で元のイベントを付けます。開発モードでは「An ErrorEvent with no error occurred. See Error.cause for details: …」、本番（209 行目の `ngDevMode` が偽）では `e.message` だけが文になります。
3. **204 行目は「真か偽か」で見ている**

   `if (e.error)` なので、`throw 0` や `throw ''` のように**偽になる値**を投げたときも包む側に入ります。デモの「ErrorEvent（error: 0）」の行は、0 ではなく `Error('… Uncaught 0')` が届き、0 は `cause.error` にだけ残ります。`ErrorEvent` でないただの `Event('error')` を window に `dispatchEvent` したときは `message` も無いので、開発モードの文は「…: undefined」、本番の文は空になります。
4. **216 行目**

   どちらでも `preventDefault()` して、ブラウザ自身のコンソールの出力を止めます。取り消せる（`cancelable`）イベントのときだけ効きます（7 節のデモの「取り消せない Event('error')」の行）。

## 4. 付け方と外し方：Zone.root の中で付ける（0ac949c2666）

📄 `angular/packages/core/src/error_handler.ts` L219–238 （▶ の行: 219–221, 224, 226–227, 229, 232–234）

```ts
219 ▶       const setupEventListeners = () => {
220 ▶         window.addEventListener('unhandledrejection', rejectionListener);
221 ▶         window.addEventListener('error', errorListener);
222 │       };
223 │ 
224 ▶       // Angular doesn't have to run change detection whenever any asynchronous tasks are invoked in
225 │       // the scope of this functionality.
226 ▶       if (typeof Zone !== 'undefined') {
227 ▶         Zone.root.run(setupEventListeners);
228 │       } else {
229 ▶         setupEventListeners();
230 │       }
231 │ 
232 ▶       inject(DestroyRef).onDestroy(() => {
233 ▶         window.removeEventListener('error', errorListener);
234 ▶         window.removeEventListener('unhandledrejection', rejectionListener);
235 │       });
236 │     },
237 │   },
238 │ );
```

📄 `git show 0ac949c2666`

```
$ git show 0ac949c2666 --format='%h %ad %s' --date=short -- packages/core/src/error_handler.ts
0ac949c2666 2025-04-21 fix(core): do not run change detection on global error events (#60944)
@@ -104,8 +104,19 @@ const globalErrorListeners = new InjectionToken<void>(ngDevMode ? 'GlobalErrorLi
       e.preventDefault();
     };
 
-    window.addEventListener('unhandledrejection', rejectionListener);
-    window.addEventListener('error', errorListener);
+    const setupEventListeners = () => {
+      window.addEventListener('unhandledrejection', rejectionListener);
+      window.addEventListener('error', errorListener);
+    };
+
+    // Angular doesn't have to run change detection whenever any asynchronous tasks are invoked in
+    // the scope of this functionality.
+    if (typeof Zone !== 'undefined') {
+      Zone.root.run(setupEventListeners);
+    } else {
+      setupEventListeners();
+    }
+
     inject(DestroyRef).onDestroy(() => {
       window.removeEventListener('error', errorListener);
       window.removeEventListener('unhandledrejection', rejectionListener);
```

1. **226〜227 行目 zone.js があれば root の zone で付ける**

   zone.js は `addEventListener` を書き換え、付けたときの zone でリスナーを呼びます。アプリの初期化は Angular の zone の中で走るので、そのまま付けると window の `error` のたびに Angular の zone のタスクになり、変更検知が走ります。`Zone.root.run` の中で付ければ、リスナーは zone の外で呼ばれます（zone の書き換えは [zone-events](../zone/07-zone-events.md)）。zoneless の 229 行目はそのまま付けるだけです。デモのページは `typeof Zone` が `"undefined"` なので、こちらの枝です。
2. **232〜235 行目 destroy で外す**

   root の注入器の `DestroyRef` に、2 つの `removeEventListener` を登録します。`appRef.destroy()` で注入器が壊れるとリスナーも外れ、デモの「destroy 後のリスナー」は 0 個になります。[第 1 回](01-err-handler-core.md)の c4dd258658f の `setTimeout` で投げ直したエラーが、もう ErrorHandler に戻らないのはこのためです。

## 5. zone.js があるときの違い（#51357）

zone.js を読み込んだアプリでは、Angular の zone の中のタスクで投げられたエラーは zone が拾い、`NgZone` の `onHandleError` から `onError` に流れて入口へ渡ります（[zone-ngzone-fork](../zone/09-zone-ngzone-fork.md)。購読は `bootstrap` の中。[ngmodule-bootstrap-module](../ngmodule/11-ngmodule-bootstrap-module.md)）。`onHandleError` は `false` を返すので zone.js はそのエラーを投げ直さず、window には届きません。だから zone のアプリで全体のリスナーに来るのは、`runOutsideAngular` の中など**Angular の zone の外**のエラーです。65adb3024d6 のメッセージも、zone のアプリでは「zone の外で起きたエラー」、zoneless では「フレームワークが明示的に捕まえないエラー全部」が window に届く、と書いています。

もう 1 つ、zone の外の Promise の reject には落とし穴があります。#51357（2023-08 から開いたまま）が報告している道を、zone.js のソースで追います。

📄 `angular/packages/zone.js/lib/common/promise.ts` L26–33 （▶ の行: 28–29）

```ts
26 │     const __symbol__ = api.symbol;
27 │     const _uncaughtPromiseErrors: UncaughtPromiseError[] = [];
28 ▶     const isDisableWrappingUncaughtPromiseRejection =
29 ▶       global[__symbol__('DISABLE_WRAPPING_UNCAUGHT_PROMISE_REJECTION')] !== false;
30 │     const symbolPromise = __symbol__('Promise');
31 │     const symbolThen = __symbol__('then');
32 │     const creationTrace = '__creationTrace__';
33 │ 
```

📄 `angular/packages/zone.js/lib/common/promise.ts` L230–242 （▶ の行: 233, 236, 238–239）

```ts
230 │             } catch (err) {
231 │               uncaughtPromiseError = err;
232 │             }
233 ▶             if (isDisableWrappingUncaughtPromiseRejection) {
234 │               // If disable wrapping uncaught promise reject
235 │               // use the value instead of wrapping it.
236 ▶               uncaughtPromiseError.throwOriginal = true;
237 │             }
238 ▶             uncaughtPromiseError.rejection = value;
239 ▶             uncaughtPromiseError.promise = promise;
240 │             uncaughtPromiseError.zone = Zone.current;
241 │             uncaughtPromiseError.task = Zone.currentTask!;
242 │             _uncaughtPromiseErrors.push(uncaughtPromiseError);
```

📄 `angular/packages/zone.js/lib/common/promise.ts` L75–83 （▶ の行: 75, 77, 80, 82）

```ts
75 ▶     function handleUnhandledRejection(this: unknown, e: any) {
76 │       api.onUnhandledError(e);
77 ▶       try {
78 │         const handler = (Zone as any)[UNHANDLED_PROMISE_REJECTION_HANDLER_SYMBOL];
79 │         if (typeof handler === 'function') {
80 ▶           handler.call(this, e);
81 │         }
82 ▶       } catch (err) {}
83 │     }
```

📄 `angular/packages/zone.js/lib/browser/browser.ts` L301–316 （▶ の行: 307, 309–311, 313）

```ts
301 │     function findPromiseRejectionHandler(evtName: string) {
302 │       return function (e: any) {
303 │         const eventTasks = findEventTasks(global, evtName);
304 │         eventTasks.forEach((eventTask) => {
305 │           // windows has added unhandledrejection event listener
306 │           // trigger the event listener
307 ▶           const PromiseRejectionEvent = global['PromiseRejectionEvent'];
308 │           if (PromiseRejectionEvent) {
309 ▶             const evt = new PromiseRejectionEvent(evtName, {
310 ▶               promise: e.promise,
311 ▶               reason: e.rejection,
312 │             });
313 ▶             eventTask.invoke(evt);
314 │           }
315 │         });
316 │       };
```

1. **28〜29 行目 既定は「包まない」**

   `__zone_symbol__DISABLE_WRAPPING_UNCAUGHT_PROMISE_REJECTION` を `false` にしていなければ真です。
2. **233〜239 行目**

   zone.js が置き換えた Promise（ZoneAwarePromise）の未処理の reject を、`promise` や `rejection` を持つ包み（`uncaughtPromiseError`）にしまい、既定では `throwOriginal = true` を付けます。あとでこれを投げ直すとき（`microtaskDrainDone`。[zone-microtask](../zone/06-zone-microtask.md)）、`throwOriginal` なら包みではなく**元の値**を投げます。root の zone は `onHandleError` を持たないので、`runGuarded` はそれを投げ直し、catch で 75 行目の関数に渡ります。
3. **80 行目 → 309〜311 行目**

   75 行目の関数は 80 行目で、browser.ts が登録した関数を呼びます。その関数は 309〜311 行目で `new PromiseRejectionEvent(evtName, {promise: e.promise, reason: e.rejection})` を作りますが、`e` は元の値（たとえば Error）なので `e.promise` は `undefined` です。`promise` は必須なので constructor が TypeError を投げ（下の記録）、82 行目の `catch (err) {}` で捨てられます。313 行目まで届かず、`unhandledrejection` のリスナー（2 節の 199 行目）は呼ばれません。

📄 `headless Chrome で確かめた DOM の決まり（2026-11-15）`

```
// headless Chrome で評価した 2 つの式の結果
new PromiseRejectionEvent('unhandledrejection', { promise: undefined, reason: 1 })
  → TypeError: Failed to construct 'PromiseRejectionEvent': Failed to read the 'promise' property from 'PromiseRejectionEventInit': Required member is undefined.
new Event('error') を、preventDefault() するリスナーのある EventTarget に dispatchEvent
  → cancelable=false dispatch=true defaultPrevented=false
```

つまり zone.js の既定の設定では、Angular の zone の外で reject された ZoneAwarePromise は、全体のリスナーがあっても ErrorHandler に戻りません（zone.js 自身は `api.onUnhandledError` で `console.error` に出します）。この章では zone.js を読み込んだアプリでの実行は確かめていません。上の行の読みと、#51357 の報告（同じ TypeError の文）が一致することまでです。

## 6. 雛形と TestBed、そして spec

📄 `angular-cli/packages/schematics/angular/application/files/standalone-files/src/app/app.config.ts.template` L1–11 （▶ の行: 1, 7–8）

```
 1 ▶ import { ApplicationConfig, provideBrowserGlobalErrorListeners<% if (!zoneless) { %>, provideZoneChangeDetection<% } %> } from '@angular/core';<% if (routing) { %>
 2 │ import { provideRouter } from '@angular/router';
 3 │ import { routes } from './app.routes';<% } %>
 4 │ 
 5 │ export const appConfig: ApplicationConfig = {
 6 │   providers: [
 7 ▶     provideBrowserGlobalErrorListeners(),<% if (!zoneless) { %>
 8 ▶     provideZoneChangeDetection({ eventCoalescing: true }),<% } %>
 9 │     <% if (routing) { %>provideRouter(routes)<% } %>
10 │   ]
11 │ };
```

`ng new` の standalone の雛形は、7 行目で必ず `provideBrowserGlobalErrorListeners()` を入れます（zone を選んだときは 8 行目の `provideZoneChangeDetection` も）。angular-cli の e03f2b8999（2025-04-07。65adb3024d6 の 6 日後）で足され、NgModule の雛形（`app-module.ts.template`）の providers にも同じ 1 行があります。このサイトの `app.config.ts` も入れているので、デモは本物の window に投げられません。

TestBed は自分ではこのリスナーを入れません（`packages/core/testing` に `globalErrorListeners` への参照は無い）。テストの providers に入れると、198 行目の入口は TestBed の投げ直す関数（[testing-errors](../testing/12-testing-errors.md)）なので、window のイベントのリスナーの中から投げることになります。下の spec が `rethrowApplicationErrors: false` を付けているのはそのためです。

📄 `angular/packages/core/test/error_handler_spec.ts` L46–69 （▶ の行: 46–49, 54–55, 59–61, 65–67）

```ts
46 ▶   it('installs global error handler once', () => () => {
47 ▶     if (isNode) {
48 ▶       return;
49 ▶     }
50 │     // override global.onerror to prevent jasmine report error
51 │     let originalWindowOnError = window.onerror;
52 │     window.onerror = function () {};
53 │     TestBed.configureTestingModule({
54 ▶       rethrowApplicationErrors: false,
55 ▶       providers: [provideBrowserGlobalErrorListeners(), provideBrowserGlobalErrorListeners()],
56 │     });
57 │ 
58 │     const spy = spyOn(TestBed.inject(ErrorHandler), 'handleError');
59 ▶     new Promise((resolve) => {
60 ▶       setTimeout(() => {
61 ▶         throw new Error('abc');
62 │       });
63 │       setTimeout(resolve, 1);
64 │     });
65 ▶ 
66 ▶     expect(spy).toHaveBeenCalledWith(jasmine.objectContaining({message: 'abc'}));
67 ▶     expect(spy.calls.count()).toBe(1);
68 │     window.onerror = originalWindowOnError;
69 │   });
```

📄 `angular/packages/core/test/error_handler_spec.ts` L71–99 （▶ の行: 71–74, 79–80, 86, 91–94, 97）

```ts
71 ▶   it('handles error events without error', () => () => {
72 ▶     if (isNode) {
73 ▶       return;
74 ▶     }
75 │     // override global.onerror to prevent jasmine report error
76 │     let originalWindowOnError = window.onerror;
77 │     window.onerror = function () {};
78 │     TestBed.configureTestingModule({
79 ▶       rethrowApplicationErrors: false,
80 ▶       providers: [provideBrowserGlobalErrorListeners()],
81 │     });
82 │ 
83 │     const spy = spyOn(TestBed.inject(ErrorHandler), 'handleError');
84 │     new Promise((resolve) => {
85 │       setTimeout(() => {
86 ▶         window.dispatchEvent(new ErrorEvent('error', {message: 'error event without error'}));
87 │       });
88 │       setTimeout(resolve, 1);
89 │     });
90 │ 
91 ▶     expect(spy).toHaveBeenCalledWith(
92 ▶       jasmine.objectContaining({
93 ▶         message:
94 ▶           'An ErrorEvent with no error occurred. See Error.cause for details: error event without error',
95 │       }),
96 │     );
97 ▶     expect(spy.calls.count()).toBe(1);
98 │     window.onerror = originalWindowOnError;
99 │   });
```

1. **確かめたいこと**

   46 行目の it は、55 行目で 2 回 provide しても 66〜67 行目で 1 回だけ呼ばれること（1 節）、71 行目の it は、86 行目の `error` の無い `ErrorEvent` が 91〜96 行目の文で包まれること（3 節）を見るつもりの spec です。
2. **46 行目と 71 行目の形**

   どちらも `it('…', () => () => { … })` です。jasmine に渡しているのは「**関数を返す関数**」で、jasmine はそれを呼んで戻り値（中の関数）を捨てます。中の関数は誰にも呼ばれないので、47 行目からあとは一行も走らず、どちらの it も必ず通ります。また中身が走ったとしても、59〜65 行目の `new Promise` を待たずに 66 行目の `expect` に進みます。

📄 `git show b84859073bf（error_handler_spec.ts の部分）`

```
$ git show b84859073bf --format='%h %ad %s' --date=short -- packages/core/test/error_handler_spec.ts
b84859073bf 2025-06-26 build: migrate to use web test runner rules (#62292)
@@ -43,7 +43,7 @@ describe('ErrorHandler', () => {
     expect(errorToString(undefined)).toBe('ERROR#undefined');
   });
 
-  it('installs global error handler once', async () => {
+  it('installs global error handler once', () => () => {
     if (isNode) {
       return;
     }
@@ -56,7 +56,7 @@ describe('ErrorHandler', () => {
     });
 
     const spy = spyOn(TestBed.inject(ErrorHandler), 'handleError');
-    await new Promise((resolve) => {
+    new Promise((resolve) => {
       setTimeout(() => {
         throw new Error('abc');
       });
@@ -68,7 +68,7 @@ describe('ErrorHandler', () => {
     window.onerror = originalWindowOnError;
   });
 
-  it('handles error events without error', async () => {
+  it('handles error events without error', () => () => {
     if (isNode) {
       return;
     }
@@ -81,7 +81,7 @@ describe('ErrorHandler', () => {
     });
 
     const spy = spyOn(TestBed.inject(ErrorHandler), 'handleError');
-    await new Promise((resolve) => {
+    new Promise((resolve) => {
       setTimeout(() => {
         window.dispatchEvent(new ErrorEvent('error', {message: 'error event without error'}));
       });
```

この形になったのは、karma から web test runner へ移した b84859073bf（2025-06-26）です。それまでは `async () =>` と `await new Promise(...)` でした。同じ形が jasmine で「走らずに通る」ことは、小さな spec で確かめられます。

📄 `noop_spec.js`

```js
// noop_spec.js（angular の node_modules の jasmine 6.3.0 で走らせる）
// error_handler_spec.ts の 46 行目・71 行目と同じ形: it の関数が「関数を返す」だけ
describe('() => () => {...} の形', () => {
  it('中身は走らない', () => () => {
    throw new Error('ここに来たら失敗');
  });
  it('比べる: ふつうの形', () => {
    expect(1).toBe(1);
  });
});
```

📄 `出力（2026-11-15）`

```
$ cd ~/angular-research/angular && node node_modules/jasmine/bin/jasmine.js <noop_spec.js>
Randomized with seed 09897
Started
..

2 specs, 0 failures
Finished in 0.002 seconds
Randomized with seed 09897 (jasmine --random=true --seed=09897)
```

「ここに来たら失敗」と書いた it も通り、`2 specs, 0 failures` です。[第 1 回](01-err-handler-core.md)の bazel の実行で `describe('ErrorHandler')` の 5 本が通っていても、全体のリスナーの 2 本は何も確かめていません。

## 7. デモ：本物のリスナーを偽の window で動かす

window に投げる代わりに、`DOCUMENT` を差し替えて **ライブ**にしました。193 行目が `inject(DOCUMENT).defaultView` を読むので、`createApplication` の providers で `{provide: DOCUMENT, useValue: {defaultView: 偽の window}}` にすれば、本物の factory がその偽物に付けます。このアプリはコンポーネントを描かないので、`DOCUMENT` を使う描画の部品は作られません。Node の記録にしなかったのは、ページの上の 22.1.6 の本物（201・216 行目の `preventDefault` と、DOM の `cancelable` の決まり）をそのまま見せたかったからです。

> **🧪 DEMO — 本物のリスナーを偽の window で動かす**
>
> 押すたびに `createApplication` で別のアプリを作ります。providers は自分の ErrorHandler、`provideZonelessChangeDetection()`、`provideBrowserGlobalErrorListeners()`、そして `DOCUMENT` を「`defaultView` が `EventTarget` の偽物」に差し替えたものです。選んだイベントをその偽の window に `dispatchEvent` して、`handleError` に何が届いたかを見ます。本物の window には何も投げません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/err-global-listeners)

2026-11-15 に本番ビルドを headless Chrome で開き、全部のボタンを押した結果（@angular/core 22.1.6。本番なので包んだ Error の文は `e.message` だけ）です。コンソールの警告・エラーは 0 件でした。

| イベント | handleError に届いた | defaultPrevented / 戻り値 | 行 |
| --- | --- | --- | --- |
| ErrorEvent（error: new Error） | `Error('boom')` | true / false | 204〜205 |
| ErrorEvent（error なし） | `Error('ResizeObserver loop …')`、cause = ErrorEvent | true / false | 206〜214 |
| ErrorEvent（error: 0） | `Error('Uncaught 0')`、cause = ErrorEvent | true / false | 204 の真偽 |
| Event('error')（cancelable: true） | `Error('')`、cause = Event | true / false | message も無い（本番なので空の文） |
| **取り消せない** Event('error') | 同じく 1 回届く | **false / true** | 216 の preventDefault が効かない |
| PromiseRejectionEvent（reason: Error / 文字列） | reason そのまま | true / false | 200〜201 |
| どれでも「2 回入れる」 | 1 回 | — | 1 節。起動後のリスナーは各 1 個、destroy 後は 0 個 |

> [!NOTE]
> **ポイント**
>
> 「取り消せない Event('error')」の行が、[第 1 回](01-err-handler-core.md)の「テストと直し方」で読んだ error\_handler\_spec.ts の destroy の it の形です。ハンドラに届いても `dispatchEvent` は `true` を返すので、その it の「戻り値が true だからハンドラは呼ばれていない」という確かめ方は、呼ばれた場合と区別がつきません。

## 8. 呼び出しの連なり

- 👤 `setTimeout(() => { throw err; })` — あなたのコード（Angular が呼んでいない関数）
  - `window の error イベント（ErrorEvent）` — ブラウザ
    - `errorListener(e)` — error\_handler.ts L203 — *Zone.root で付けたので zone の外（L226-227）*
      - `e.error ? e.error : new Error(e.message, {cause: e})` — L204-214
      - `errorHandler(...)` — L198 で取った入口の関数 — *第 1 回*
        - 👤 `ErrorHandler.handleError(...)` — あなたの ErrorHandler
      - `e.preventDefault()` — L216 — *ブラウザ自身のコンソール出力を止める（cancelable のときだけ）*

## テストと直し方

1. **走らせるもの**

   この章の spec は `describe('ErrorHandler')` の 46・71 行目の 2 本で、`isNode` なら 47〜49・72〜74 行目で戻るのでブラウザ用です。web の suite（`//packages/core/test:test_web`）は `--filter` が効かないので、この章では走らせていません。そもそも 2 本は 6 節のとおり中身が走らないので、走らせても結果は「通る」です。Node の `//packages/core/test:test` での 5 本の結果は[第 1 回](01-err-handler-core.md)に載せました。jasmine で同じ形を確かめたのが 6 節の `noop_spec.js` です。
2. **直すとしたら：spec**

   error\_handler\_spec.ts の 46 行目と 71 行目を、b84859073bf の前の `async () =>` と `await new Promise(...)` の形に戻すのが最初の候補です。web test runner でその形が通らなかったのかは、b84859073bf のメッセージには書かれていないので、戻したうえで `test_web` で走らせて確かめることになります。どちらの it も `window.onerror` を書き換えて本物の window に投げるので、`DOCUMENT` を偽物にするデモの形（`defaultView` が `EventTarget`）にすれば、Node でも走る spec にできます。
3. **直すとしたら：本体**

   包むかどうかは 204 行目の `if (e.error)`、付ける場所は 219〜230 行目、外すのは 232〜235 行目です。偽の値（`throw 0`）まで包むのを変えるなら、204 行目を `e.error !== undefined && e.error !== null` のような形にし、spec は 71 行目の it の隣に「error が 0 の ErrorEvent」を足します。zone の外の Promise の件（5 節）は zone.js の `browser.ts` の 309〜311 行目と `promise.ts` の 236 行目の組み合わせで、Angular の core ではなく zone.js の側（#51357）です。

## 聞かれそうな質問

**Q. zoneless にしたら、setTimeout の中のエラーが ErrorHandler に来なくなりました。なぜですか？**

zone.js が無いので、Angular が呼んでいない関数のエラーを拾う人がいないからです。window に届いたものを ErrorHandler に戻すのが `provideBrowserGlobalErrorListeners()` で、2 節と 3 節の 2 つのリスナーが入口に渡します。`ng new` の雛形は 6 節の 7 行目のとおり最初から入れています。

**Q. 2 回 provide したら、エラーが 2 回報告されますか？**

されません。251 行目の初期化はトークンを inject するだけで、リスナーを付けるのは root に 1 つのトークンの factory です。2 回目の inject は作ってある値を返します（1 節、デモの「2 回入れる」）。

**Q. handleError に null が来るのはなぜですか？**

572c32a0387 より前の版では、`error` を持たない `ErrorEvent`（ResizeObserver の警告など）の `e.error` をそのまま渡していたからです（#62078）。今は 206〜214 行目で `e.message` の Error に包み、元のイベントを `cause` に付けます。今でも `null` が来るなら、`Promise.reject(null)` のように reason が `null` の reject です（200 行目は包まない）。

**Q. このリスナーは変更検知を起こしますか？**

zone.js があっても起こしません。226〜227 行目で `Zone.root.run` の中で付けるので、リスナーは Angular の zone の外で呼ばれます（0ac949c2666）。入口の関数自体も `runOutsideAngular` の中で ErrorHandler を呼びます（第 1 回）。

**Q. zone.js のアプリでも入れる意味はありますか？**

あります。Angular の zone の外（`runOutsideAngular` の中やほかのライブラリ）で投げられた同期のエラーは window の `error` に届くので、ここで拾えます。ただし zone の外で reject された ZoneAwarePromise は、5 節の 309〜311 行目と 82 行目の組み合わせで `unhandledrejection` が出ないので、拾えません（#51357）。

## 読み終えて

- `provideBrowserGlobalErrorListeners()` は初期化でトークンを 1 回 inject するだけ。リスナーを付けるのは root に 1 つの factory なので、何回入れても 1 組（L249-252・L186-189）。
- window は `inject(DOCUMENT).defaultView`、渡す先は入口の関数。サーバーと `defaultView` が無いときは付けない（L190-198）。
- `error` が偽の `ErrorEvent` は `e.message` の Error に包んで `cause` に元のイベントを付ける（572c32a0387）。どちらも `preventDefault()` し、zone.js があれば `Zone.root` で付けて変更検知を起こさない（0ac949c2666）。
- zone.js の既定では zone の外の ZoneAwarePromise の reject は `unhandledrejection` にならない（#51357）。全体のリスナーの spec の 2 本は b84859073bf から中身が走っていない。

---

← 前: [エラーを捕まえる場所の地図：リスナー・effect・変更検知・PendingTasks](02-err-where-caught.md)  
次: [@boundary の実行時：ɵɵboundaryUpdate と ON\_ERROR](04-err-boundary-runtime.md) →
