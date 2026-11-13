[目次](../README.md) › [resource の細部と新しい部品](README.md) › 第 3 回 / 全 6 回

# エラーの包み方：value() が投げるとき、ResourceValueError と rethrowFatalErrors

> loader が投げた値が Error でないときに包む encapsulateResourceError と isErrorLike（22.1.6 では null を投げると TypeError になる）、error の状態で value() を読むと ResourceValueError が投げられる行と hasValue() の型、rethrowFatalErrors が投げ直すのは NG0992 だけであること。rxResource の Observable が値を出さずに終わったときの NG0991（-991 にした 8975b4346d5）、stream が Observable を返す前に投げたときの後片付けの修正（9ae98753849）。テンプレートで value() を読むときに何が起きるかをページの上で確かめる。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/resx-errors)

---

resource の `error()` の型は `Error | undefined` です。でも loader が投げるのは `Error` とは限りません。文字列も、`{code: 42}` も、`null` も投げられます。この章では、投げられたものを `Error` にそろえる `encapsulateResourceError`、エラーの状態で `value()` を読むと投げられる `ResourceValueError`、エラーにしてはいけないものを見分ける `rethrowFatalErrors`、rxResource の NG0991 を、コミットの差分と今の行と spec で読みます。最後に、テンプレートで `value()` をそのまま読むと何が起きるかを、このページの上で確かめます。

読む対象は `packages/core/src/resource/resource.ts` の後半と `api.ts`、`core/src/error_handler.ts`、`core/rxjs-interop/src/rx_resource.ts`、spec は `core/test/resource/resource_spec.ts` と `core/rxjs-interop/test/rx_resource_spec.ts` の一部です。エラーの状態が「resolved + エラーの stream」の投影であることは [resource の章](../signals/15-resource.md)の 3 節で読みました。

1. [1. params から状態を返す](01-resx-params-status.md)
2. [2. debounced()](02-resx-debounced.md)
3. **3. エラーの包み方**（この章）
4. [4. SSR と resource](04-resx-ssr-cache.md)
5. [5. 後片付けと漏れ](05-resx-cleanup-leaks.md)
6. [6. spec と issue](06-resx-tests-issues.md)

## 1. エラーが入ってくる入口

resource の状態にエラーが入る場所を、`grep -n encapsulateResourceError` で全部挙げると次のとおりです。どこも、しまう前に同じ関数を通します。

- `getLoader` の `catch`：loader が reject した — resource.ts 557–559 — *[resource の章](../signals/15-resource.md) 2 節*
- `loadEffect` の `catch`：stream の関数そのものが投げた — resource.ts 497–508 — *下の引用*
- `state` の計算：params が投げた — resource.ts 282 — *[第 1 回](01-resx-params-status.md) 4 節*
- `rxResource` の `error` の通知 — rx\_resource.ts 117–118 — *[httpResource と rxResource](../signals/16-signals-http-resource.md)*
- `httpResource` の `error` の通知 — common/http/src/resource.ts 407 — *[httpx-resource-types](../httpx/04-httpx-resource-types.md)*

📄 `angular/packages/core/src/resource/resource.ts` L497–501 （▶ の行: 497–499）

```ts
497 ▶     } catch (err) {
498 ▶       rethrowFatalErrors(err);
499 ▶       if (abortSignal.aborted || untracked(this.extRequest) !== extRequest) {
500 │         return;
501 │       }
```

loadEffect の `catch` の入口です。498 行目で 4 節の `rethrowFatalErrors` を先に通し、499〜501 行目で「もう古い読み込みなら捨てる」。その後でエラーを包んでしまいます（続きの行は [resource の章](../signals/15-resource.md)の 5 節）。この表に無いのが `debounced()` で、source が投げたものを包まずにそのまま入れます（[第 2 回](02-resx-debounced.md)の 6 節）。

## 2. encapsulateResourceError と 2 つのクラス

📄 `angular/packages/core/src/resource/resource.ts` L602–630 （▶ の行: 602–604, 607, 610–611, 613–616, 621, 624–627）

```ts
602 ▶ export function encapsulateResourceError(error: unknown): Error {
603 ▶   if (isErrorLike(error)) {
604 ▶     return error;
605 │   }
606 │ 
607 ▶   return new ResourceWrappedError(error);
608 │ }
609 │ 
610 ▶ export class ResourceValueError extends Error {
611 ▶   constructor(error: Error) {
612 │     super(
613 ▶       ngDevMode
614 ▶         ? `Resource is currently in an error state (see Error.cause for details): ${error.message}`
615 ▶         : error.message,
616 ▶       {cause: error},
617 │     );
618 │   }
619 │ }
620 │ 
621 ▶ class ResourceWrappedError extends Error {
622 │   constructor(error: unknown) {
623 │     super(
624 ▶       ngDevMode
625 ▶         ? `Resource returned an error that's not an Error instance: ${String(error)}. Check this error's .cause for the actual error.`
626 ▶         : String(error),
627 ▶       {cause: error},
628 │     );
629 │   }
630 │ }
```

1. **603〜604 行目：`Error` らしければそのまま**

   「らしい」の中身は次の引用の `isErrorLike` です。そのまま返すので、`error()` は loader が投げたものと `===` で同じです。
2. **607 行目：それ以外は `ResourceWrappedError` に包む**

   621〜630 行目、627 行目で `cause` に投げられたものをそのまま入れます。メッセージは 624〜626 行目、開発ビルドなら「Resource returned an error that's not an Error instance: …」、本番ビルドなら `String(error)` だけです。このクラスは `export` されていないので、利用者が `instanceof` で見分けることはできません。`cause` を見ます。
3. **610〜619 行目：`value()` が投げる `ResourceValueError`**

   611 行目で受け取るのは、すでに包まれた `Error` です。616 行目で `cause` にそれを入れ、613〜615 行目、開発ビルドなら「Resource is currently in an error state (see Error.cause for details): 」の後に、本番ビルドなら何も付けずに、元のメッセージを使います。

📄 `angular/packages/core/src/error_handler.ts` L109–124 （▶ の行: 109–110, 113, 116, 118–122）

```ts
109 ▶ export function encapsulateBoundaryError(error: unknown): Error {
110 ▶   if (isErrorLike(error)) {
111 │     return error;
112 │   }
113 ▶   return new ErrorBoundaryWrappedError(error);
114 │ }
115 │ 
116 ▶ export function isErrorLike(error: unknown): error is Error {
117 │   return (
118 ▶     error instanceof Error ||
119 ▶     (typeof error === 'object' &&
120 ▶       error !== null &&
121 ▶       typeof (error as Error).name === 'string' &&
122 ▶       typeof (error as Error).message === 'string')
123 │   );
124 │ }
```

116〜124 行目の `isErrorLike` は、`instanceof Error`（118 行目）か、「`null` でないオブジェクトで、`name` と `message` が文字列」（119〜122 行目）です。きっかけは #61861 で、`HttpClient` が投げる `HttpErrorResponse`（`Error` を継承していない）が「not an Error instance: \[object Object\]」に包まれてしまっていました。`name` と `message` を持つので、今はそのまま通ります。109〜114 行目の `encapsulateBoundaryError` は、ErrorBoundary（`@boundary`）のために同じ形で作られた兄弟で、この 2 つが `isErrorLike` を共有しています。

### 3 つのコミット

📄 `git show 05eb028c7ae -- packages/core/src/resource/resource.ts（足された部分）`

```
@@ -409,3 +410,22 @@ function projectStatusOfState(state: ResourceState<unknown>): ResourceStatus {
 function isResolved<T>(state: ResourceStreamItem<T>): state is {value: T} {
   return (state as {error: unknown}).error === undefined;
 }
+
+export function encapsulateResourceError(error: unknown): Error {
+  if (error instanceof Error) {
+    return error;
+  }
+
+  return new ResourceWrappedError(error);
+}
+
+class ResourceWrappedError extends Error {
+  constructor(error: unknown) {
+    super(
+      ngDevMode
+        ? `Resource returned an error that's not an Error instance: ${String(error)}. Check this error's .cause for the actual error.`
+        : String(error),
+      {cause: error},
+    );
+  }
+}
```

📄 `git show 54ed62d2405 -- packages/core/src/resource/resource.ts`

```ts
@@ -29,6 +29,7 @@ import {
 import {assertInInjectionContext} from '../di/contextual';
 import {Injector} from '../di/injector';
 import {inject} from '../di/injector_compatibility';
+import {isErrorLike} from '../error_handler';
 import {RuntimeError, RuntimeErrorCode} from '../errors';
 import {CACHE_ACTIVE} from '../hydration/cache';
 import {DestroyRef} from '../linker/destroy_ref';
@@ -606,15 +607,6 @@ export function encapsulateResourceError(error: unknown): Error {
   return new ResourceWrappedError(error);
 }
 
-export function isErrorLike(error: unknown): error is Error {
-  return (
-    error instanceof Error ||
-    (typeof error === 'object' &&
-      typeof (error as Error).name === 'string' &&
-      typeof (error as Error).message === 'string')
-  );
-}
-
 export class ResourceValueError extends Error {
   constructor(error: Error) {
     super(
```

- **05eb028c7ae（2025-03、#61441）**：`Resource.error` の型を `unknown` から `Error | undefined` にし、そのために包む関数を足しました。このときは `instanceof Error` だけで判定していました。
- **835a6431619（2025-06、#61861 に関連）**：判定を `isErrorLike` にして、`name` と `message` を持つオブジェクト（`HttpErrorResponse` など）も通すようにしました。このときの `isErrorLike` には `error !== null` がありませんでした。
- **54ed62d2405（ErrorBoundary の実装、v22.2.0-next.6 から）**：`isErrorLike` を error\_handler.ts に移しました。移った先の 120 行目には `error !== null` があります（同じ PR の f6afb807c1e が書いたもの）。

そのため、**このサイトの 22.1.6 では、loader が `null` を投げると包む関数の中で `TypeError` が起きます**。`typeof null` が `'object'` なので、`null.name` を読みに行くからです。下の記録では、`error()` が `TypeError「Cannot read properties of null (reading 'name')」` になっています。`getLoader` の `catch` の中で起きたこの例外を、loadEffect の `catch`（497 行目）がもう一度受け、今度は `TypeError` なので包まずにしまったものです。22.2 系では 120 行目で `null` が弾かれ、`ResourceWrappedError`（`cause` は `null`）になります。

📄 `resx-demo/a/record-errors.mjs dev と prod の出力（@angular/core 22.1.6、Node）`

```
@angular/core 22.1.6、ngDevMode=object（開発）

[loader が 文字列 "oops" を投げる] status=error hasValue()=返す false
  error(): ResourceWrappedError「Resource returned an error that's not an Error instance: oops. Check this error's .cause for the actual error.」 cause=string "oops"
  value(): 投げる ResourceValueError「Resource is currently in an error state (see Error.cause for details): Resource returned an error that's not an Error instance: oops. Check this error's .cause for the actual error.」 cause=ResourceWrappedError
  snapshot().status: error

[loader が new Error("E") を投げる] status=error hasValue()=返す false
  error(): Error「E」 cause=undefined
  value(): 投げる ResourceValueError「Resource is currently in an error state (see Error.cause for details): E」 cause=Error
  snapshot().status: error

[loader が {name, message} の形 を投げる] status=error hasValue()=返す false
  error(): Object「m」 cause=undefined
  value(): 投げる ResourceValueError「Resource is currently in an error state (see Error.cause for details): m」 cause=Object
  snapshot().status: error

[loader が {code: 42} を投げる] status=error hasValue()=返す false
  error(): ResourceWrappedError「Resource returned an error that's not an Error instance: [object Object]. Check this error's .cause for the actual error.」 cause=Object {"code":42}
  value(): 投げる ResourceValueError「Resource is currently in an error state (see Error.cause for details): Resource returned an error that's not an Error instance: [object Object]. Check this error's .cause for the actual error.」 cause=ResourceWrappedError
  snapshot().status: error

[loader が null を投げる] status=error hasValue()=返す false
  error(): TypeError「Cannot read properties of null (reading 'name')」 cause=undefined
  value(): 投げる ResourceValueError「Resource is currently in an error state (see Error.cause for details): Cannot read properties of null (reading 'name')」 cause=TypeError
  snapshot().status: error

[loader が undefined を投げる] status=error hasValue()=返す false
  error(): ResourceWrappedError「Resource returned an error that's not an Error instance: undefined. Check this error's .cause for the actual error.」 cause=undefined
  value(): 投げる ResourceValueError「Resource is currently in an error state (see Error.cause for details): Resource returned an error that's not an Error instance: undefined. Check this error's .cause for the actual error.」 cause=ResourceWrappedError
  snapshot().status: error

[rxResource の stream が値を出さずに完了（EMPTY）] status=error
  error(): RuntimeError「NG0991: Resource completed before producing a value. Find more at https://v22.angular.dev/errors/NG0991」 code=-991
  value(): 投げる ResourceValueError「Resource is currently in an error state (see Error.cause for details): NG0991: Resource completed before producing a value. Find more at https://v22.angular.dev/errors/NG0991」 cause=RuntimeError
@angular/core 22.1.6、ngDevMode=false

[loader が 文字列 "oops" を投げる] status=error hasValue()=返す false
  error(): ResourceWrappedError「oops」 cause=string "oops"
  value(): 投げる ResourceValueError「oops」 cause=ResourceWrappedError
  snapshot().status: error

[loader が new Error("E") を投げる] status=error hasValue()=返す false
  error(): Error「E」 cause=undefined
  value(): 投げる ResourceValueError「E」 cause=Error
  snapshot().status: error

[loader が {name, message} の形 を投げる] status=error hasValue()=返す false
  error(): Object「m」 cause=undefined
  value(): 投げる ResourceValueError「m」 cause=Object
  snapshot().status: error

[loader が {code: 42} を投げる] status=error hasValue()=返す false
  error(): ResourceWrappedError「[object Object]」 cause=Object {"code":42}
  value(): 投げる ResourceValueError「[object Object]」 cause=ResourceWrappedError
  snapshot().status: error

[loader が null を投げる] status=error hasValue()=返す false
  error(): TypeError「Cannot read properties of null (reading 'name')」 cause=undefined
  value(): 投げる ResourceValueError「Cannot read properties of null (reading 'name')」 cause=TypeError
  snapshot().status: error

[loader が undefined を投げる] status=error hasValue()=返す false
  error(): ResourceWrappedError「undefined」 cause=undefined
  value(): 投げる ResourceValueError「undefined」 cause=ResourceWrappedError
  snapshot().status: error

[rxResource の stream が値を出さずに完了（EMPTY）] status=error
  error(): RuntimeError「NG0991」 code=-991
  value(): 投げる ResourceValueError「NG0991」 cause=RuntimeError
```

上半分が開発モード、下半分が `ngDevMode = false`（本番ビルドと同じ）です。本番では、包んだエラーのメッセージは投げた値を文字列にしただけ（`'oops'`・`'[object Object]'`・`'undefined'`）、`value()` のメッセージは元のエラーと同じです。ログで「ResourceValueError か、元のエラーか」をメッセージで見分けることはできないので、`cause` をたどります。`undefined` を投げた行も見てください。loader の側では `error` 状態になり、params の側（[第 1 回](01-resx-params-status.md)の 4 節の表）では `idle` になります。loader の側は `{error: 包んだもの}` を作ってからしまうので、偽の値の判定にかからないからです。

## 3. value() が投げるとき、投げないとき

📄 `angular/packages/core/src/resource/resource.ts` L230–236 （▶ の行: 230–231, 234–235）

```ts
230 ▶           if (this.state().status === 'loading' && this.error()) {
231 ▶             return defaultValue;
232 │           }
233 │ 
234 ▶           if (!isResolved(streamValue)) {
235 ▶             throw new ResourceValueError(this.error()!);
236 │           }
```

`value` の computed の中の 2 つの分岐です（computed の全体は [resource の章](../signals/15-resource.md)の 4 節 (c)）。234〜235 行目、stream の中身がエラーなら `ResourceValueError` を投げます。230〜231 行目は例外で、内部の状態が `loading`（つまり reload 中）で `error()` があるときは、投げずに defaultValue を返します。

- **b35396345cb（2025-03、#61441）**で、エラーのとき `value()` は `undefined` を返すのをやめて投げるようになりました。コミットの本文は、`computed(() => res.value()?.inner)` のような書き方でエラーが黙って消えてしまうことを理由に挙げています。投げれば、その computed を読んだ人にエラーが伝わります。
- **905194fa57b（2025-04）**が 230〜231 行目を足しました。エラーの状態から `reload()` すると stream は引き継がれる（エラーのまま）ので、そのままでは reload 中の `value()` や `hasValue()` が投げてしまうからです。

📄 `angular/packages/core/src/resource/resource.ts` L137–143 （▶ の行: 139）

```ts
137 │   abstract set(value: T): void;
138 │ 
139 ▶   private readonly isError = computed(() => this.status() === 'error');
140 │ 
141 │   update(updateFn: (value: T) => T): void {
142 │     this.set(updateFn(untracked(this.value)));
143 │   }
```

📄 `angular/packages/core/src/resource/resource.ts` L167–170 （▶ の行: 168–169）

```ts
167 │ 
168 ▶   hasValue(): this is ResourceRef<Exclude<T, undefined>> {
169 ▶     return this.isValueDefined();
170 │   }
```

`hasValue()` は 169 行目で `isValueDefined` を読むだけで、`isValueDefined` は 139 行目の `isError` を先に見てから `value()` を読みます（中身は [resource の章](../signals/15-resource.md)の 8 節）。`status()` ではなく `isError` という `computed` を挟んでいるのは、`loading` → `resolved` のような「エラーかどうかが変わらない」移り変わりで、`hasValue()` を読む側に知らせを出さないためです（b35396345cb が `isError` を足したときのコメントのとおり）。この「先に `status` を見る」作りのため、`status()` が `error` 以外なのに stream がエラーのまま、という状態では `hasValue()` も投げます（[第 1 回](01-resx-params-status.md)の 7 節）。

📄 `angular/packages/core/src/resource/api.ts` L134–141 （▶ の行: 136–138, 140）

```ts
134 │ export interface WritableResource<T> extends Resource<T> {
135 │   readonly value: WritableSignal<T>;
136 ▶   hasValue(
137 ▶     this: T extends undefined ? this : never,
138 ▶   ): this is WritableResource<Exclude<T, undefined>>;
139 │ 
140 ▶   hasValue(): boolean;
141 │ 
```

型の側です。50d9d55f498（2025-09、#60766・#63545・#63982）が、`hasValue()` を 2 つの重ね書きにしました。136〜138 行目、`this: T extends undefined ? this : never` により、型ガード（`this is …`）として使えるのは `T` に `undefined` が含まれるときだけです。それ以外は 140 行目の、ただ `boolean` を返す形が選ばれます。前は defaultValue を渡した `ResourceRef<number>` でも型ガードになっていて、`else` の側で `value()` の型が `never` になっていました。

## 4. rethrowFatalErrors：エラーにしてはいけないもの

📄 `angular/packages/core/src/resource/resource.ts` L671–678 （▶ の行: 671, 673–674, 676）

```ts
671 ▶ export function rethrowFatalErrors(error: unknown) {
672 │   if (
673 ▶     error instanceof RuntimeError &&
674 ▶     error.code === RuntimeErrorCode.INVALID_RESOURCE_CREATION_IN_PARAMS
675 │   ) {
676 ▶     throw error;
677 │   }
678 │ }
```

「致命的」は 1 種類だけです。673〜674 行目、`RuntimeError` でコードが `INVALID_RESOURCE_CREATION_IN_PARAMS`（992、NG0992）のときだけ、676 行目で投げ直します。呼ぶのは 4 か所で、params の `catch`（[第 1 回](01-resx-params-status.md)の 3 節）、1 節の 498 行目、debounced の 2 つの `catch`（[第 2 回](02-resx-debounced.md)）です。どれも「投げられたものを状態にしまう」場所で、ここで投げ直さないと、params の中で resource を作るという使い方の誤りが `error()` の中に黙って入ってしまいます。逆に言えば、それ以外の例外は、`RuntimeError` であっても（NG0991 も、NG0602 も）しまわれます。b918beda323（debounced を足したコミット）が NG0992 と一緒に足しました。

## 5. rxResource の NG0991

📄 `angular/packages/core/rxjs-interop/src/rx_resource.ts` L30–41 （▶ の行: 34–38, 40）

```ts
30 │ export interface RxResourceOptions<T, R> extends BaseResourceOptions<T, R> {
31 │   /**
32 │    * A function that returns the `Observable` to load the resource's value from.
33 │    *
34 ▶    * This Observable must eventually emit a value or an error before it completes — a resource
35 ▶    * needs one of those two things to know what to show. If the Observable completes without ever
36 ▶    * emitting anything (for example because of `catchError(() => EMPTY)`), Angular throws
37 ▶    * `RESOURCE_COMPLETED_BEFORE_PRODUCING_VALUE` (`NG0991`), since it has nothing to give the
38 ▶    * resource.
39 │    */
40 ▶   stream: (params: ResourceLoaderParams<R>) => Observable<T>;
41 │ }
```

📄 `angular/packages/core/rxjs-interop/src/rx_resource.ts` L121–127 （▶ の行: 121–126）

```ts
121 ▶         complete: () => {
122 ▶           if (!hasResolved) {
123 ▶             send({
124 ▶               error: new ɵRuntimeError(
125 ▶                 ɵRuntimeErrorCode.RESOURCE_COMPLETED_BEFORE_PRODUCING_VALUE,
126 ▶                 ngDevMode && 'Resource completed before producing a value',
127 │               ),
```

📄 `angular/packages/core/src/errors.ts` L157–160 （▶ の行: 159）

```ts
157 │   // resource() API errors
158 │   MUST_PROVIDE_STREAM_OPTION = 990,
159 ▶   RESOURCE_COMPLETED_BEFORE_PRODUCING_VALUE = -991,
160 │   INVALID_RESOURCE_CREATION_IN_PARAMS = 992,
```

rxResource は Observable の最初の値か最初のエラーで resource を落ち着かせます（流れは [httpResource と rxResource](../signals/16-signals-http-resource.md) の章）。121〜122 行目、何も出さずに `complete` したら、123〜126 行目でエラーを送ります。`catchError(() => EMPTY)` のように「失敗したら何も出さずに終わる」Observable を返すと、こうなります。この `RuntimeError` は `Error` なので 2 節では包まれず、`error()` がそのまま返します。

2026 年 8 月の 8975b4346d5 は、34〜38 行目の doc コメントと NG0991 の説明ページを足し、errors.ts 159 行目のコードを `991` から `-991` にしました。コードが負だと、開発ビルドではメッセージの末尾に「Find more at …/errors/NG0991」が付きます（負のコードの扱いは [contrib-coding-standards](../contrib/13-contrib-coding-standards.md) の章）。記録の最後の行がそれです。このサイトの 22.1.6 にもすでに入っています。コミットの本文によると、httpResource でも同じエラーになることがあり、その場合はたいてい interceptor が `EMPTY` を返して応答を飲み込んでいます。

### テンプレートで value() を読むと

📄 `angular/packages/core/rxjs-interop/test/rx_resource_spec.ts` L198–203 （▶ の行: 198, 200, 203）

```ts
198 ▶     @Component({template: '{{res.value()}}'})
199 │     class TestComponent {
200 ▶       res = rxResource({stream: () => EMPTY});
201 │     }
202 │ 
203 ▶     const fixture = TestBed.createComponent(TestComponent);
```

📄 `angular/packages/core/rxjs-interop/test/rx_resource_spec.ts` L215–220 （▶ の行: 215, 217–219）

```ts
215 ▶     await expectAsync(fixture.whenStable()).toBeRejected();
216 │ 
217 ▶     expect(handledErrors.length).toBe(1);
218 ▶     expect((handledErrors[0] as Error).message).toContain(
219 ▶       'Resource completed before producing a value',
220 │     );
```

同じコミットが足した it です。198 行目のテンプレートは `res.value()` をそのまま読み、200 行目の resource はすぐ NG0991 になります。203 行目で部品を作るだけで、`detectChanges()` は呼びません。アプリの変更検知（スケジューラが呼ぶ `ApplicationRef.tick()`）の中でテンプレートが投げた例外は、呼んだ人のコードに戻らず `ErrorHandler` に渡されるからです（[zoneless-tick](../zoneless/05-zoneless-tick.md)・[testing-errors](../testing/12-testing-errors.md)）。217〜219 行目、差し替えた `ErrorHandler` が 1 回だけ、NG0991 のメッセージの例外を受け取っています。215 行目は、TestBed の `ErrorHandler` が同じ例外で `whenStable()` も失敗させることを確かめています。実際に投げられるのは `ResourceValueError` で、そのメッセージに NG0991 のメッセージが含まれます（2 節の 613〜615 行目）。

## 6. stream が Observable を返す前に投げたとき（9ae98753849）

📄 `git show 9ae98753849 -- packages/core/rxjs-interop/src/rx_resource.ts`

```ts
@@ -55,11 +55,11 @@ export function rxResource<T, R>(opts: RxResourceOptions<T, R>): ResourceRef<T |
     ...opts,
     loader: undefined,
     stream: (params) => {
-      let sub: Subscription;
+      let sub: Subscription | undefined;
 
       // Track the abort listener so it can be removed if the Observable completes (as a memory
       // optimization).
-      const onAbort = () => sub.unsubscribe();
+      const onAbort = () => sub?.unsubscribe();
       params.abortSignal.addEventListener('abort', onAbort);
 
       // Start off stream as undefined.
```

rxResource の `stream` の関数が、Observable を返す前に投げた場合です（#63341）。投げたもの自体は 1 節の loadEffect の `catch` が受けて `error` にするので問題ありません。問題は後片付けで、rxResource は購読する前に abort の listener を登録しています。後で abort が来る（params が変わる・resource が壊れる）と、listener が `sub.unsubscribe()` を呼び、`sub` がまだ `undefined` なので `TypeError` になっていました。issue の再現では、壊したときにコンソールに `ERROR TypeError` が出ています。2025 年 8 月の修正は `sub?.unsubscribe()` の 1 文字（と型）だけで、rx\_resource\_spec.ts の `should cleanup without error when the stream function threw an error`（111 行目）は、投げる stream で作って安定を待つだけの it です。この listener は、その後の e0e902a8fa9 などでさらに書き換えられています。今の形は[第 5 回](05-resx-cleanup-leaks.md)で読みます。

## 7. DEMO：投げたものと、読んだときに起きること

> **🧪 DEMO — loader に投げさせ、error()・value()・テンプレートの結果を並べる**
>
> ボタンを押すと、新しい注入器の中に、その値を投げる loader の `resource()`（最後の 2 つは params が投げる resource と `rxResource({ stream: () => EMPTY })`）を作り、`ApplicationRef.whenStable()` で落ち着くのを待ってから読みます。このページは本番ビルドなので、メッセージは 2 節の本番の形です。Angular のクラス名も縮められるので、名前の代わりに `name`・`message`・`cause` の関係を出しています。右の 2 列は、アプリに付けない部品を `createComponent` で作り、`detectChanges()` を自分で `try` の中で呼んだ結果です。アプリに付けた部品なら、同じ例外は `ErrorHandler` に渡り、コンソールに「ERROR」と出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/resx-errors)

- **文字列・`{code: 42}`・`undefined`**：`error()` の `cause` が投げたもの（607 行目で包まれた）。`name` は `Error`（`ResourceWrappedError` は `name` を決めていない）。
- **`new Error`・`{name, message}`**：`error()` が投げたものそのもの（604 行目）。
- **`null`**：22.1.6 では `TypeError`（2 節）。
- **どの行も**：`value()` は投げ、その `cause` は `error()` と同じもの（616 行目）。`hasValue()` は `false` を返して投げない。テンプレートで `value()` をそのまま読むと `detectChanges()` が投げ、`@if (hasValue())` で守ると描ける。
- **rxResource で EMPTY**：`error()` は `code` が `-991` の `RuntimeError`、本番ではメッセージは「NG0991」だけ。

このページの本番ビルドを headless Chrome で開き、DEMO のボタンを全部押して、表示とコンソール（エラーと警告が 0 件）を確かめました（2026-11-13）。

## 全体の流れ

- 👤 `loader: async () => { throw 'oops' }` — *利用者のコード*
  - `getLoader` の `catch` → `encapsulateResourceError('oops')` — resource.ts 557–559 → 602
    - `isErrorLike('oops')` → false — error\_handler.ts 116–124
    - `new ResourceWrappedError('oops')`（`cause: 'oops'`） — 607 / 621–630
  - `signal({ error })` を stream として返す → loadEffect が `state.set(resolved)` — *resource の章 5 節*
- 👤 `res.error()` — *`ResourceWrappedError` を返す*
- 👤 `res.value()` — 234–235 — *`new ResourceValueError(error)` を投げる（611〜617 行目）*
- 👤 `res.hasValue()` — 169 → 139 — *`isError` を先に見て `false`*
- テンプレートの `{{``res.value()``}}` — *tick の中で投げ、ErrorHandler へ*

## テストと直し方

### spec と it

| ファイル | describe / it | 行 | この章のどこ |
| --- | --- | --- | --- |
| resource\_spec.ts | `resource` › `should expose errors thrown during resource loading` | 140 | 2・3 節 |
| resource\_spec.ts | `should throw an error when getting a value even when provided with a default value` | 382 | 3 節の 234〜235 行目 |
| resource\_spec.ts | `should return default value when getting a value after reloading in the error state` | 993 | 3 節の 230〜231 行目（905194fa57b） |
| resource\_spec.ts | `types` › `should narrow hasValue() when the value can be undefined`・`should not narrow … default value is provided`・`… type is unknown` | 1036・1061・1085 | 3 節の型（50d9d55f498） |
| rx\_resource\_spec.ts | `rxResource()` › `should stream when the loader returns multiple values` | 89 | 2 節の 607 行目（最後の 2 つの expect） |
| rx\_resource\_spec.ts | `rxResource()` › `should cleanup without error when the stream function threw an error` | 111 | 6 節（9ae98753849） |
| rx\_resource\_spec.ts | `should handle Error like objects` | 122 | 2 節の 119〜122 行目（835a6431619） |
| rx\_resource\_spec.ts | `should report error synchronously (after tick)` | 171 | 5 節 |
| rx\_resource\_spec.ts | `reports NG0991 to the ErrorHandler when a template reads value() …` | 183 | 5 節（8975b4346d5） |
| debounce\_spec.ts | `should throw if used in params of another resource` | 476 | 4 節（NG0992 が投げ直される） |

📄 `angular/packages/core/test/resource/resource_spec.ts` L152–161 （▶ の行: 152, 154, 156, 158–161）

```ts
152 ▶     expect(echoResource.status()).toBe('error');
153 │     expect(echoResource.isLoading()).toBeFalse();
154 ▶     expect(echoResource.hasValue()).toBeFalse();
155 │ 
156 ▶     const err = extractError(() => echoResource.value())!;
157 │     expect(err).not.toBeUndefined();
158 ▶     expect(err instanceof Error).toBeTrue();
159 ▶     expect(err!.message).toContain('Resource');
160 ▶     expect(err.cause).toEqual(new Error('Something went wrong....'));
161 ▶     expect(echoResource.error()).toEqual(new Error('Something went wrong....'));
```

156 行目で `value()` が投げたものを取り出し、159 行目でメッセージに「Resource」が入ること（開発ビルドの 614 行目）、160 行目で `cause` が元のエラーであること、161 行目で `error()` が元のエラーそのものであることを確かめています。loader が `Error` でないものを投げる it は resource\_spec.ts には無く、rx\_resource\_spec.ts の `should stream when the loader returns multiple values` の最後で、Observable が文字列 `'fail'` でエラーになったときに `cause` が `'fail'` になることを確かめているのが、包む側の it です。

📄 `angular/packages/core/rxjs-interop/test/rx_resource_spec.ts` L134–144 （▶ の行: 136, 142, 144）

```ts
134 │     const rxRes = rxResource({
135 │       params: sig,
136 ▶       stream: () => observable,
137 │       injector: injector,
138 │     });
139 │ 
140 │     await appRef.whenStable();
141 │ 
142 ▶     expect(rxRes.error()).toBeInstanceOf(FooError);
143 │ 
144 ▶     expect(() => rxRes.value()).toThrowError(/This is a FooError/);
```

142 行目、`Error` を継承しない `FooError` がそのまま `error()` になり、144 行目、`value()` のメッセージに元のメッセージが入ります。

📄 `angular/packages/core/rxjs-interop/test/rx_resource_spec.ts` L171–181 （▶ の行: 174, 177–178, 180）

```ts
171 │   it('should report error synchronously (after tick)', () => {
172 │     const injector = TestBed.inject(Injector);
173 │     const res = rxResource({
174 ▶       stream: () => EMPTY,
175 │       injector,
176 │     });
177 ▶     TestBed.tick();
178 ▶     expect(res.status()).toBe('error');
179 │     expect(res.error()).toBeInstanceOf(Error);
180 ▶     expect(() => res.value()).toThrowError(/Resource completed before producing a value/);
181 │   });
```

177 行目の `TestBed.tick()` の後、同期で `error` になっています。EMPTY は購読した瞬間に完了するからです。

📄 `angular/packages/core/test/resource/resource_spec.ts` L1061–1074 （▶ の行: 1062, 1066, 1069–1072）

```ts
1061 │     it('should not narrow hasValue() when a default value is provided', () => {
1062 ▶       const result: ResourceRef<number> = resource({
1063 │         params: () => 1,
1064 │         loader: async ({params}) => params,
1065 │         injector: TestBed.inject(Injector),
1066 ▶         defaultValue: 0,
1067 │       });
1068 │ 
1069 ▶       if (result.hasValue()) {
1070 ▶         const _value: number = result.value();
1071 ▶       } else if (result.isLoading()) {
1072 ▶         const _value: number = result.value();
1073 │       } else if (result.error()) {
1074 │       }
```

型の it は実行時には何も確かめず、コンパイルが通ること自体がテストです。1066 行目で defaultValue を渡し、1069〜1072 行目、どちらの分岐でも `value()` が `number` として扱えることを確かめています。

### 手元で走らせた結果

📄 `走らせたコマンド`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/resource:resource --nocache_test_results --test_output=all
pnpm bazel test //packages/core/rxjs-interop/test:test --nocache_test_results --test_output=all
pnpm bazel test //packages/core/rxjs-interop/test:test --nocache_test_results --test_output=all '--test_arg=--filter=rxResource'
```

../angular（22.2.0-next.7、8576f161ae4）で、`//packages/core/test/resource:resource` は「70 specs, 0 failures」、`//packages/core/rxjs-interop/test:test` は「77 specs, 0 failures」、そのうち `--filter=rxResource` は「17 specs, 0 failures」でした（Node の jasmine、2026-11-13）。

### 直すとしたら

- debounced の包まないエラー：[第 2 回](02-resx-debounced.md)の「直すとしたら」のとおり、debounce.ts の 2 つの `catch` で `encapsulateResourceError` を通す形です。今は文字列を投げると `ResourceValueError` の 611 行目に文字列が渡り、メッセージの末尾が `undefined` になります。
- params の偽の値：新しい本家の 5c4b6a48679 が `extRequest` の `catch` で包むようにしました（[第 1 回](01-resx-params-status.md)の 9 節）。
- loader の `null`：22.2 系の error\_handler.ts 120 行目ですでに直っています。spec は rx\_resource\_spec.ts の `should handle Error like objects` の隣に「`null` を投げる」を足すと、この行を固められます（今は `null` の it はありません）。

## 聞かれそうな質問

**Q. loader が文字列を投げたら、`error()` は何を返しますか？**

`ResourceWrappedError` です（607 行目）。`cause` に投げた文字列が入り（627 行目）、メッセージは開発ビルドなら説明つき、本番ビルドなら文字列そのものです（624〜626 行目）。クラスは export されていないので、元の値は `error().cause` で取り出します。

**Q. `error()` と、`value()` が投げるものは同じですか？**

違います。`value()` は 235 行目で毎回 `new ResourceValueError(this.error()!)` を作って投げ、その `cause` が `error()` です（616 行目）。`catch` で受けたものを `error()` と `===` で比べても一致しません。

**Q. エラーの状態でテンプレートに `res.value()` と書くとどうなりますか？**

変更検知の中で `ResourceValueError` が投げられ、アプリでは `ErrorHandler` に渡ります（rx\_resource\_spec.ts の 217〜219 行目）。その部品の描画はそこで止まります。`@if (res.hasValue())` で守るか、`res.snapshot()` から読みます。`hasValue()` は 139 行目の `isError` を先に見るので、エラーでは投げずに `false` です。

**Q. NG0991 は何のエラーで、なぜ番号が負なのですか？**

rxResource の Observable が値もエラーも出さずに完了したときのエラーです（121〜126 行目）。負の番号（errors.ts 159 行目の `-991`）は「説明ページがある」の印で、開発ビルドのメッセージに説明ページへのリンクが付きます。8975b4346d5 が説明ページを足したときに負にしました。

**Q. どんなエラーでも `error()` にしまわれますか？**

NG0992（params の中で resource を作った）だけは例外で、`rethrowFatalErrors`（671〜678 行目）が投げ直します。それ以外は `RuntimeError` でもしまわれます。

## 読み終えて

- エラーをしまう場所は全部 `encapsulateResourceError`（602 行目）を通る。`Error` らしければそのまま、そうでなければ `cause` に入れて包む（debounced だけは通さない）
- `isErrorLike` の `null` の検査は 22.2 系から。22.1.6 では loader の `null` が `TypeError` になる
- `value()` はエラーで `ResourceValueError` を投げ、`cause` が `error()`。reload 中だけは defaultValue を返す（230〜231 行目）
- 本番ビルドではメッセージの説明が消える。見分けるのは `cause`
- NG0991 は Observable が何も出さずに完了したとき。テンプレートで `value()` を読めば `ErrorHandler` に届く

> [!NOTE]
> **さらに深く**
>
> 記録のスクリプトの全文です。`prod` を付けると、`@angular/core` を読み込む前に `globalThis.ngDevMode = false` にして、本番ビルドと同じメッセージを作らせます。

📄 `resx-demo/a/record-errors.mjs（記録スクリプトの全文）`

```
// 第 3 回 resx-errors の記録: loader が投げたものごとに error()・value()・hasValue()・snapshot() を読み、開発モードと本番モード（ngDevMode = false）のメッセージを比べる。
// 使い方: angular-deep-dive の node_modules が見える場所で node record-errors.mjs dev  /  node record-errors.mjs prod
if (process.argv[2] === 'prod') globalThis.ngDevMode = false; // 本番ビルドと同じく、開発用のメッセージを作らない
const { DOCUMENT, createEnvironmentInjector, ApplicationRef, resource, provideZonelessChangeDetection,
  ɵINJECTOR_SCOPE: INJECTOR_SCOPE, Injector, VERSION } = await import('@angular/core');
const { rxResource } = await import('@angular/core/rxjs-interop');
const { EMPTY } = await import('rxjs');

const root = createEnvironmentInjector([
  { provide: INJECTOR_SCOPE, useValue: 'root' },
  provideZonelessChangeDetection(),
  { provide: DOCUMENT, useValue: { getElementById: () => null, querySelector: () => null } },
], Injector.NULL);
const appRef = root.get(ApplicationRef);
const settle = async () => { for (let i = 0; i < 2; i++) { appRef.tick(); await new Promise((r) => setTimeout(r, 5)); } };
const kind = (e) => e === undefined ? 'undefined' : e === null ? 'null' : typeof e !== 'object' ? typeof e : (e.constructor?.name ?? 'Object');
const tryIt = (f) => { try { return `返す ${JSON.stringify(f())}`; } catch (e) { return `投げる ${kind(e)}「${e.message}」${e.cause !== undefined ? ' cause=' + kind(e.cause) : ''}`; } };
console.log(`@angular/core ${VERSION.full}、ngDevMode=${typeof ngDevMode === 'object' ? 'object（開発）' : String(ngDevMode)}`);

const cases = [
  ['文字列 "oops"', () => 'oops'],
  ['new Error("E")', () => new Error('E')],
  ['{name, message} の形', () => ({ name: 'HttpLike', message: 'm' })],
  ['{code: 42}', () => ({ code: 42 })],
  ['null', () => null],
  ['undefined', () => undefined],
];
for (const [label, make] of cases) {
  const r = resource({ params: () => 1, loader: async () => { throw make(); }, injector: root });
  await settle();
  const e = r.error();
  console.log(`\n[loader が ${label} を投げる] status=${r.status()} hasValue()=${tryIt(() => r.hasValue())}`);
  console.log(`  error(): ${kind(e)}「${e?.message}」 cause=${kind(e?.cause)}${e?.cause !== undefined ? ' ' + JSON.stringify(e.cause) : ''}`);
  console.log(`  value(): ${tryIt(() => r.value())}`);
  console.log(`  snapshot().status: ${r.snapshot().status}`);
}
{
  const r = rxResource({ stream: () => EMPTY, injector: root });
  await settle();
  console.log(`\n[rxResource の stream が値を出さずに完了（EMPTY）] status=${r.status()}`);
  console.log(`  error(): ${kind(r.error())}「${r.error()?.message}」 code=${r.error()?.code}`);
  console.log(`  value(): ${tryIt(() => r.value())}`);
}
process.exit(0);
```

---

← 前: [debounced()：signal を遅らせて resource の params にする](02-resx-debounced.md)  
次: [SSR と resource：id で TransferState に値を残す、待ってから描く](04-resx-ssr-cache.md) →
