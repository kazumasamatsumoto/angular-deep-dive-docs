[目次](../README.md) › [Signal Forms の型を読む：FieldTree から SchemaPath まで、api/types.ts の 1000 行](README.md) › 第 5 回 / 全 6 回

# validateHttp と debounce：型の外にある、時間と通信の約束

> debounce のルール（Debouncer：入力欄の値 → モデル）と validateHttp の debounce（core の DebounceTimer：モデル → 問い合わせ）の違い、debounce.ts の数と 'blur' の実装、待ちを取り消す 4 つの道（touched・submit で書く。cf37344a4d6）、HttpValidatorOptions の request・onSuccess・onError・options と validateAsync への下り方。偽物の XhrFactory で外部に通信しないデモ。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfty-http-debounce)

---

`debounce(p.name, 300)` と `validateHttp(p.name, { debounce: 300, … })` は、名前も数も同じですが、遅らせているものが違います。前者は入力欄の値がモデルに書かれるまでを、後者はモデルの値がサーバーへの問い合わせになるまでを遅らせます。この章では、2 つの「時間の約束」と 1 つの「通信の約束」が、型（`Debouncer`・`DebounceTimer`・`HttpValidatorOptions`）と実装のどの行に書かれているかを読み、外部に通信しないデモで時刻つきに確かめます。

読む対象は `packages/forms/signals/src/` の `api/rules/debounce.ts` の後半、`api/types.ts` の `Debouncer`、`api/rules/validation/validate_http.ts` の `HttpValidatorOptions`、`validate_async.ts` の型の部分です（../angular、8576f161ae4）。debounce が metadata の 1 つであることと 3 種類の設定の振り分け（debounce.ts の前半）は[forms-sf-rules-metadata](../forms/18-forms-sf-rules-metadata.md)の 7 節、controlValue の書き込みが `debounceSync` を始める流れは[signal-forms](../signals/17-signal-forms.md)の 7 節、`validateAsync` の resource の作り方と `validateHttp` の本体は[forms-sf-validation](../forms/17-forms-sf-validation.md)の 4 節で読みました。ここでは繰り返さず、その残りと型を読みます。

1. [1. FieldTree と Field](01-sfty-tree.md)
2. [2. FieldState の読み口](02-sfty-state.md)
3. [3. 検証の結果と binding の型](03-sfty-results.md)
4. [4. PathKind と SchemaPath](04-sfty-path.md)
5. **5. validateHttp と debounce**（この章）
6. [6. spec と issue](06-sfty-tests-issues.md)

## 0. 2 つの debounce を並べる

|   | `debounce(path, config)`（ルール） | `validateHttp(path, {debounce})`（オプション） |
| --- | --- | --- |
| 遅らせるもの | 入力欄の値（`controlValue`）→ モデル（`value`）の書き込み | モデルの値 → 問い合わせの引数（params）→ `httpResource` |
| 関数の型 | `Debouncer<TValue, TPathKind>`：`(context, abortSignal) => Promise<void> \| void`（types.ts 1037〜1040 行目） | `DebounceTimer<T>`：`number \| (value, lastValue) => Promise<void> \| void`（@angular/core。[resx-debounced](../resx/02-resx-debounced.md)） |
| 数を渡すと | debounce.ts の `debounceForDuration`（1 節） | core の `debounced()` が数のタイマーで待つ |
| 取り消されるとき | 次の入力、`value` を直接書く、touched にする（blur・`markAsTouched`・`submit`）、`reset` | params が変わるたびに前の待ちを捨てる。問い合わせ中なら `httpResource` が前の要求を中断 |
| 待っている間の状態 | `controlValue()` だけが新しく、`value()` は古い | `pending()`（ただし #71636。3 節のデモ） |

## 1. Debouncer の型と、数のときの実装

📄 `angular/packages/forms/signals/src/api/types.ts` L1024–1040 （▶ の行: 1027–1029, 1037–1040）

```ts
1024 │ /**
1025 │  * A function that defines custom debounce logic for a field.
1026 │  *
1027 ▶  * @param context The field context.
1028 ▶  * @param abortSignal An `AbortSignal` used to communicate that the debounced operation was aborted.
1029 ▶  * @returns A `Promise<void>` to debounce an update, or `void` to apply an update immediately.
1030 │  * @template TValue The type of value stored in the field.
1031 │  * @template TPathKind The kind of path the debouncer is applied to (root field, child field, or item of an array).
1032 │  *
1033 │  * @see [Debouncing form updates](guide/forms/signals/form-logic#delay-input-operations-with-debounce)
1034 │  *
1035 │  * @publicApi 22.0
1036 │  */
1037 ▶ export type Debouncer<TValue, TPathKind extends PathKind = PathKind.Root> = (
1038 ▶   context: FieldContext<TValue, TPathKind>,
1039 ▶   abortSignal: AbortSignal,
1040 ▶ ) => Promise<void> | void;
```

1038 行目の第 1 引数は[第 4 回](04-sfty-path.md)の `FieldContext<TValue, TPathKind>` です。`applyEach` の要素に付けた `debounce` なら、自作の Debouncer の中で `context.index()` が読めます。1039 行目の `AbortSignal` は「この待ちは取り消された」を知らせる標準の仕組みです（98ce9a7b17c、2025-11-13 で足されました）。1040 行目と 1029 行目のとおり、`Promise` を返せば「解決したら書く」、何も返さなければ「すぐ書く」です。Debouncer が呼ばれた時点では、`context.value()` はまだモデルの古い値です。`context.value` はモデルにつながった `value` の signal で、打った値は `controlValue` の側にあります（`context.state.controlValue()` で読めます）。

📄 `angular/packages/forms/signals/src/api/rules/debounce.ts` L61–82 （▶ の行: 64, 66, 69–71, 74–76, 79）

```ts
61 │ /**
62 │  * Creates a debouncer that will wait for the given duration before resolving.
63 │  */
64 ▶ function debounceForDuration(durationInMilliseconds: number): Debouncer<unknown> {
65 │   return (_context, abortSignal) => {
66 ▶     return new Promise((resolve) => {
67 │       let timeoutId: ReturnType<typeof setTimeout> | undefined;
68 │ 
69 ▶       const onAbort = () => {
70 ▶         clearTimeout(timeoutId);
71 ▶         resolve();
72 │       };
73 │ 
74 ▶       timeoutId = setTimeout(() => {
75 ▶         abortSignal.removeEventListener('abort', onAbort);
76 ▶         resolve();
77 │       }, durationInMilliseconds);
78 │ 
79 ▶       abortSignal.addEventListener('abort', onAbort, {once: true});
80 │     });
81 │   };
82 │ }
```

1. **74〜77 行目：時間が来たら解決する**

   75 行目で、もう要らなくなった abort の購読を外します（e7d99f02cba、2026-01-07、「clean up abort listener after timeout」）。
2. **69〜72・79 行目：取り消されたらタイマーを止めて解決する**

   79 行目の `{once: true}` で 1 回だけ。71 行目の `resolve()` は b1bf535f8e5（2026-01-30、Fixes #66646）が足した行で、取り消された Promise を待ち続ける側が止まったままにならないようにしています。
3. **解決しても、書くかどうかは呼び出し側が決める**

   取り消しで解決したときも Promise は「解決」なので、書くかどうかは `FieldNode.debounceSync` が `controller.signal.aborted` を見て決めます（[signal-forms](../signals/17-signal-forms.md) の 7 節の引用）。

📄 `angular/packages/forms/signals/src/api/rules/debounce.ts` L84–96 （▶ の行: 85–86, 88, 90–91, 96）

```ts
84 │ /**
85 ▶  * Creates a debouncer that will wait indefinitely, relying on the node to synchronize pending
86 ▶  * updates when blurred.
87 │  */
88 ▶ function debounceUntilBlur(): Debouncer<unknown> {
89 │   return (_context, abortSignal) => {
90 ▶     return new Promise((resolve) => {
91 ▶       abortSignal.addEventListener('abort', () => resolve(), {once: true});
92 │     });
93 │   };
94 │ }
95 │ 
96 ▶ function immediate(): void {}
```

`'blur'` の Debouncer は、91 行目のとおり取り消されるまで解決しない Promise です。85〜86 行目のコメントのとおり、書き込みは「blur で touched にしたときにフィールドが待ちを取り消して、その場で書く」側（`flushSync`）に任せています（c767d678cff、2026-03-05、「add 'blur' option」）。96 行目の `immediate` は 0 以下の数のときの何もしない関数で、戻り値が `undefined` なので `debounceSync` はすぐ書きます。

## 2. 待ちを取り消す 4 つの道

`FieldNode` は待ちの `AbortController` を `pendingSync` という signal に 1 つ持ちます（node.ts。[第 2 回](02-sfty-state.md)で引用しています）。`pendingSync` は `value` を source にした `linkedSignal` で、計算し直すときに前の controller を `abort()` します。linkedSignal は読まれたときに計算し直すので、`value` が変わってから次に `pendingSync` が読まれる（次の入力・`flushSync`・`reset`）までは abort されません。取り消しの道は 4 つです。

| 道 | どこで | モデルに書くか | 固めている spec（debounce.spec.ts） |
| --- | --- | --- | --- |
| 同じフィールドにもう一度入力 | `debounceSync` の先頭で前の controller を abort | 前の値は書かない。新しい待ちが始まる | 129 行目・191 行目の it |
| `value` を直接書く（モデルを外から set する場合も） | `controlValue` も `value` を source にした linkedSignal なので新しい値に戻る。`pendingSync` の abort は次に読まれたとき | 打った値は書かない。先に待ちが解決しても、`sync()` が書くのは戻った `controlValue`（= 直接書いた値） | 161 行目・292 行目の it |
| touched にする（blur・`markAsTouched`・`submit`） | `markAsTouched` → `flushSync` | **その場で書く** | 51・88・219・273 行目の it |
| `reset()` | `_reset` の先頭で abort | 書かない | field\_node.spec.ts の reset の 2 本（作業木の D2） |

3 つ目の `markAsTouched` は、8576f161ae4 では「呼んだフィールド自身」の待ちしか書きませんでした。子の待ちは残り、`submit(f)`（根を touched にしてから action を呼ぶ）が、Enter で送ったときに子の古い値で action を走らせていました（#71149）。origin/main の cf37344a4d6（2026-10-24、PR #71150、2026-11-11 に入った）が、touched にするたびにそのフィールドの待ちを書くように直しました。サイトの依存の 22.2.6 にはもう入っているので、下のデモの `f().markAsTouched()` と `submit` は子の待ちも書きます。

📄 `git show cf37344a4d6 -- packages/forms/signals/src/field/node.ts`

```ts
# fix(forms): flush debounced descendant values when a field is touched
# （2026-10-24、PR #71150、Fixes #71149。origin/main とサイトの 22.2.6 に入っている）
@@ -275,7 +275,6 @@ export class FieldNode implements FieldState<unknown> {
     }
     untracked(() => {
       this.markAsTouchedInternal(options);
-      this.flushSync();
     });
   }

@@ -283,14 +282,21 @@ export class FieldNode implements FieldState<unknown> {
     if (this.structure.isOrphaned()) {
       return;
     }
-    if (this.validationState.shouldSkipValidation()) {
-      return;
+    const skipValidation = this.validationState.shouldSkipValidation();
+    if (!skipValidation) {
+      this.nodeState.markAsTouched();
     }
-    this.nodeState.markAsTouched();
+    // Flush even when validation is skipped: the debounce writes the value anyway, and flushing
+    // makes it land before a submit action reads the model.
+    this.flushSync();
     if (options?.skipDescendants) {
       return;
     }
-    for (const child of this.structure.children()) {
+    // Inactive subtrees stay lazy: only fields that already exist can have a pending value.
+    const children = skipValidation
+      ? this.structure.materializedChildren()
+      : this.structure.children();
+    for (const child of children) {
       child.markAsTouchedInternal();
     }
   }
```

## 3. DEMO：時刻つきで見る

> **🧪 DEMO 1 — debounce：打った値がモデルに書かれる時刻**
>
> サイトの依存の `@angular/forms/signals`（22.2.6）です。DEMO 1 は `form(signal({ms: '', blur: '', fn: ''}), …)` の 3 つの入力欄に `[formField]` を付け、それぞれ `debounce(p.ms, 800)`・`debounce(p.blur, 'blur')`・自作の Debouncer を付けています。ログの右の列は、入力のたびに読んだ `controlValue()/value()` を ms・blur・fn の順に並べたもの、「モデルに書かれた」はモデルの signal を読む effect が見た時刻です。DEMO 2 は `validateHttp` で、このデモのコンポーネントの `providers` だけで `HttpClient` と `HttpHandler` を差し替え、`HttpHandler` を「偽物の `XMLHttpRequest` を作る `XhrFactory`」を持った `HttpXhrBackend` にしています。偽物は 500 ms 後にこの場で答え、外へは通信しません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sfty-http-debounce)

押した結果のうち、行で説明できるものです。

| 操作 | ログに出るもの | 理由 |
| --- | --- | --- |
| ms に続けて打つ | 入力のたびに ms の左（controlValue）だけが変わり、最後の入力から約 800 ms 後に「モデルに書かれた」が 1 行 | 1 節の 74〜77 行目。前の待ちは次の入力で取り消され、書かない |
| blur に打って、ほかの所を押す（フォーカスを外す） | 外したときに「モデルに書かれた」 | 91 行目の Promise は解決せず、blur の touched の `flushSync` が書く |
| fn に打つ → もう 1 文字打つ | 「Debouncer が呼ばれた」の `ctx.value()` は打つ前の値。2 文字目で「abortSignal が abort を通知」 | 1038・1039 行目。1 回目の待ちは 2 回目の入力で取り消される |
| fn に打つ →「fn の Promise を解決する」 | 解決した直後に「モデルに書かれた」 | Debouncer の Promise の解決を `debounceSync` が await している |
| ms と blur に打ってすぐ「f().markAsTouched()」 | 直後の行で両方の右（value）が新しい値 | 22.2.6 では子の待ちも書く（2 節の差分） |
| blur に打ってすぐ「submit(f, action)」 | 「submit の action が見たモデル」に新しい値 | submit が根を touched にしてから action を呼ぶ。8576f161ae4 では古い値（作業木の W1） |
| ms に打ってすぐ「f.ms().value.set('直接')」 | ms の左右とも `"直接"`、800 ms 後にも打った値は書かれない | 2 節の表の 2 行目。`controlValue` は `value` を source にした linkedSignal なので一緒に戻る |

DEMO 1 で、fn の Promise を解決したあとに ms や blur に打って「f().markAsTouched()」を押すと、もう解決した fn の待ちに対しても「abortSignal が abort を通知」が出ます。fn の値が書かれても `pendingSync` は読まれるまで計算し直されないので、解決ずみの controller が残り、`flushSync` が `pendingSync` を読んだときに計算し直されて `abort()` されるためです。開いている #71631 の 3 つ目の点（「終わった debounce が次の blur で abort される」）で、その通知は linkedSignal の計算の中で届きます。

DEMO 2 で 'admin' を押すと、「value.set → effect が 2 回（1 回目は `pending=false` と前の errors、2 回目は `pending=true`）→ 約 400 ms 後に #1 送った → 約 500 ms 後に #1 答えた → effect が `errors=taken` を読む」の順に並びます。'ad' の問い合わせが送られた後で 'angular' を押すと、'ad' の要求は 'angular' を押した瞬間ではなく、約 400 ms 後に 'angular' の要求を出す直前に「中断された」になります。params が変わるのは debounce の後だからです。'boom' は 500 で答え、`onError` の `server（HTTP 500）` が errors に入ります。'a' では 1 つも送りませんが、debounce の約 400 ms の間は `pending=true` で、その後 `pending=false`・エラーなしになります。`undefined` の params も、ほかの値と同じく debounce を待ってから resource に届くためです。

effect の 1 回目が前の結果を読んでいるのは、開いている #71636 の「debounce 付きの非同期の検証は、値を変えた直後には前の結果を返す」です（原因は core の `debounced()` の側と issue が書いています）。最後のボタンは、'admin' か 'root' の結果（taken）が出たあとに押すと、同じ処理の中で読んだ値が `pending=false errors=taken` で、'angular' は使用中ではないのに前の結果のままです。

## 4. HttpValidatorOptions：request・onSuccess・onError の型

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_http.ts` L35–58 （▶ の行: 35, 38, 43–45, 58）

```ts
35 ▶ export interface HttpValidatorOptions<TValue, TResult, TPathKind extends PathKind = PathKind.Root> {
36 │   /**
37 │    * A function that receives the field context and returns the url or request for the httpResource.
38 ▶    * If given a URL, the underlying httpResource will perform an HTTP GET on it.
39 │    *
40 │    * @param ctx The field context for the field being validated.
41 │    * @returns The URL or request for creating the httpResource.
42 │    */
43 ▶   readonly request:
44 ▶     | ((ctx: FieldContext<TValue, TPathKind>) => string | undefined)
45 ▶     | ((ctx: FieldContext<TValue, TPathKind>) => HttpResourceRequest | undefined);
46 │ 
47 │   /**
48 │    * A function that takes the httpResource result, and the current field context and maps it to a
49 │    * list of validation errors.
50 │    *
51 │    * @param result The httpResource result.
52 │    * @param ctx The context for the field the validator is attached to.
53 │    * @return A validation error, or list of validation errors to report based on the httpResource result.
54 │    *   The returned errors can optionally specify a field that the error should be targeted to.
55 │    *   A targeted error will show up as an error on its target field rather than the field being validated.
56 │    *   If a field is not given, the error is assumed to apply to the field being validated.
57 │    */
58 ▶   readonly onSuccess: MapToErrorsFn<TValue, TResult, TPathKind>;
```

43〜45 行目の `request` は 2 つの関数の型の和で、URL の文字列か `HttpResourceRequest`（`{url, params, headers, …}` のオブジェクト）を返します。38 行目のとおり文字列なら GET です。どちらの形も `undefined` を返してよく、それが「問い合わせない」の印です。デモは 2 文字未満のとき `undefined` を返しているので、'a' ではリクエストが 1 つも作られません。`undefined` はそのまま `validateAsync` の params になり、`httpResource` の `normalizeRequest` も `undefined` を返すので、resource は `idle` になり、非同期のルールはエラーも `'pending'` も返しません。ただし debounce を付けていると、`undefined` が resource に届くまでの間は pending です（3 節の 'a'）（[signals-http-resource](../signals/16-signals-http-resource.md) と [forms-sf-validation](../forms/17-forms-sf-validation.md) の 4 節の表）。

58 行目の `onSuccess` の型は `validate_async.ts` の `MapToErrorsFn` です。

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_async.ts` L24–43 （▶ の行: 31–33, 40–43）

```ts
24 │ /**
25 │  * A function that takes the result of an async operation and the current field context, and maps it
26 │  * to a list of validation errors.
27 │  *
28 │  * @param result The result of the async operation.
29 │  * @param ctx The context for the field the validator is attached to.
30 │  * @return A validation error, or list of validation errors to report based on the result of the async operation.
31 ▶  *   The returned errors can optionally specify a field that the error should be targeted to.
32 ▶  *   A targeted error will show up as an error on its target field rather than the field being validated.
33 ▶  *   If a field is not given, the error is assumed to apply to the field being validated.
34 │  * @template TValue The type of value stored in the field being validated.
35 │  * @template TResult The type of result returned by the async operation
36 │  * @template TPathKind The kind of path being validated (a root path, child path, or item of an array)
37 │  *
38 │  * @publicApi 22.0
39 │  */
40 ▶ export type MapToErrorsFn<TValue, TResult, TPathKind extends PathKind = PathKind.Root> = (
41 ▶   result: TResult,
42 ▶   ctx: FieldContext<TValue, TPathKind>,
43 ▶ ) => TreeValidationResult;
```

41 行目の `result` が `httpResource` の値（JSON を解析したもの）で、43 行目の戻り値は `TreeValidationResult` です。31〜33 行目のとおり、エラーに `fieldTree` を書けばほかのフィールドに付けられ、書かなければ検証したフィールドに付きます（付け先を埋める `addDefaultField` は forms-sf-validation）。`TResult` はどこからも検査されません。デモの `(res: {taken: boolean})` は、引数に書いた型から `TResult` が推論されるだけで、サーバーが違う形を返しても型の上では分かりません。

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_http.ts` L59–79 （▶ の行: 61–62, 64, 68, 74, 78）

```ts
59 │ 
60 │   /**
61 ▶    * A function to handle errors thrown by httpResource (HTTP errors, network errors, etc.).
62 ▶    * Receives the error and the field context, returns a list of validation errors.
63 │    */
64 ▶   readonly onError: (error: unknown, ctx: FieldContext<TValue, TPathKind>) => TreeValidationResult;
65 │   /**
66 │    * The options to use when creating the httpResource.
67 │    */
68 ▶   readonly options?: HttpResourceOptions<TResult, unknown>;
69 │ 
70 │   /**
71 │    * Duration in milliseconds to wait before triggering the async operation, or a function that
72 │    * returns a promise that resolves when the update should proceed.
73 │    */
74 ▶   readonly debounce?: DebounceTimer<string | HttpResourceRequest | undefined>;
75 │   /**
76 │    * A function that receives the field context and returns true if the async validation should be run.
77 │    */
78 ▶   readonly when?: NoInfer<LogicFn<TValue, boolean, TPathKind>>;
79 │ }
```

1. **64 行目：onError は必須**

   省略できません。`error` は `unknown` で、HTTP の失敗なら `HttpErrorResponse` です（デモは `instanceof` で `status` を読んでいます）。onError を足したのは a5678f6f2b5（2025-10-27、「add onError callback to validateHttp」）です。
2. **68 行目：options は httpResource にそのまま**

   `HttpResourceOptions<TResult, unknown>`。`parse`・`defaultValue`・`injector` などを渡せます。`injector` を渡さなければ、`httpResource` はフィールドの注入器の中で `inject(Injector)` を読み、そこから `HttpClient` を探します。デモがコンポーネントの `providers` だけで `HttpClient` を差し替えられるのはこのためです（フィールドの注入器の親が、`form()` を呼んだコンポーネントの注入器）。
3. **74 行目：debounce の型は DebounceTimer**

   型引数は `string | HttpResourceRequest | undefined`、つまり 43〜45 行目の request の戻り値です。`Debouncer`（1 節）とは別の型で、関数の形も `(value, lastValue)` です。24e52d450d2（2026-03-25、「add debounce option to validateAsync and validateHttp」）が core の `DebounceTimer` と一緒に足しました。
4. **78 行目：when**

   `LogicFn<TValue, boolean, TPathKind>`。偽を返すと params が `undefined` になり、request を返したときと同じ idle です（forms-sf-validation の 4 節）。

## 5. validateAsync への下り方

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_async.ts` L60–79 （▶ の行: 60, 62–63, 72, 78）

```ts
60 ▶ export interface AsyncValidatorOptions<
61 │   TValue,
62 ▶   TParams,
63 ▶   TResult,
64 │   TPathKind extends PathKind = PathKind.Root,
65 │ > {
66 │   /**
67 │    * A function that receives the field context and returns the params for the resource.
68 │    *
69 │    * @param ctx The field context for the field being validated.
70 │    * @returns The params for the resource.
71 │    */
72 ▶   readonly params: (ctx: FieldContext<TValue, TPathKind>) => TParams;
73 │ 
74 │   /**
75 │    * Duration in milliseconds to wait before triggering the async operation, or a function that
76 │    * returns a promise that resolves when the update should proceed.
77 │    */
78 ▶   readonly debounce?: DebounceTimer<TParams | undefined>;
79 │ 
```

📄 `angular/packages/forms/signals/src/api/rules/validation/validate_async.ts` L112–134 （▶ の行: 114, 128–130, 132–133）

```ts
112 │ /**
113 │  * Adds async validation to the field corresponding to the given path based on a resource.
114 ▶  * Async validation for a field only runs once all synchronous validation is passing.
115 │  *
116 │  * @param path A path indicating the field to bind the async validation logic to.
117 │  * @param opts The async validation options.
118 │  * @template TValue The type of value stored in the field being validated.
119 │  * @template TParams The type of parameters to the resource.
120 │  * @template TResult The type of result returned by the resource
121 │  * @template TPathKind The kind of path being validated (a root path, child path, or item of an array)
122 │  *
123 │  * @see [Signal Form Async Validation](guide/forms/signals/validation#async-validation)
124 │  * @see [Custom async validation](guide/forms/signals/async-operations#custom-async-validation-with-validateasync)
125 │  * @category validation
126 │  * @publicApi 22.0
127 │  */
128 ▶ export function validateAsync<TValue, TParams, TResult, TPathKind extends PathKind = PathKind.Root>(
129 ▶   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
130 ▶   opts: AsyncValidatorOptions<TValue, TParams, TResult, TPathKind>,
131 │ ): void {
132 ▶   assertPathIsCurrent(path);
133 ▶   const pathNode = FieldPathNode.unwrapFieldPath(path);
134 │ 
```

`validateHttp` は自分ではルールを登録せず、`validateAsync` に「`TParams` = request の戻り値、`factory` = `httpResource`」を渡すだけです（validate\_http.ts の本体。forms-sf-validation で引用）。72 行目の `params` に、4 節の 43〜45 行目の 2 つの関数の和はそのままでは入らないので、validate\_http.ts の本体は `as` で 1 つの関数の型に読み替えています。78 行目の `debounce` も `DebounceTimer<TParams | undefined>` で、4 節の 74 行目の型と一致します。129 行目の path は `SchemaPathRules.Supported` で、`FormControl` の path には付けられません（[第 4 回](04-sfty-path.md)の P10 と同じ）。114 行目のコメントのとおり、非同期の検証は同期の検証が通っているときだけ走ります。デモの user に `required` などを足すと、同期のエラーがある間は request も呼ばれません。

## 6. 呼び出しの連なり：fn に打ってから、モデルに書かれるまで

- 👤 `input イベント` — \[formField\]（directive/） — *controlValue.set(打った値)*
  - `controlValue.set` — field/node.ts の controlValueSignal — *rawSet → markAsDirty → debounceSync（signal-forms の 7 節）*
    - `debounceSync()` — field/node.ts — *前の pendingSync を abort、nodeState.debouncer() を読む*
      - `FieldNodeState.debouncer` — field/state.ts — *自分の DEBOUNCER か、親の debouncer（forms-sf-rules-metadata の 7 節）*
        - 👤 `Debouncer(context, abortSignal)` — types.ts 1037〜1040 — *context.value() はまだ古い値。Promise を返す*
    - `pendingSync.set(controller); await promise` — field/node.ts — *待つ間に入力・value.set・touched・reset が来れば abort*
    - `if (controller.signal.aborted) return` — field/node.ts — *取り消されていれば書かない*
    - `sync()` → `value.set(controlValue())` — field/node.ts — *モデルの signal に書く（ここでやっと「モデルに書かれた」）*
      - `pendingSync` の再計算 / validateHttp の params の再計算 — field/node.ts・validate\_async.ts — *value が変わったので、ここから先は DebounceTimer の待ち（0 節の表の右の列）*

## テストと直し方

📄 `angular/packages/forms/signals/test/node/api/debounce.spec.ts` L32–68 （▶ の行: 37, 43, 45, 47–48, 56, 62, 64, 66–67）

```ts
32 │     it('should synchronize value after duration', async () => {
33 │       const address = signal({street: ''});
34 │       const addressForm = form(
35 │         address,
36 │         (address) => {
37 ▶           debounce(address.street, 1);
38 │         },
39 │         options(),
40 │       );
41 │       const street = addressForm.street();
42 │ 
43 ▶       street.controlValue.set('1600 Amphitheatre Pkwy');
44 │       expect(street.controlValue()).toBe('1600 Amphitheatre Pkwy');
45 ▶       expect(street.value()).toBe('');
46 │ 
47 ▶       await timeout(0);
48 ▶       expect(street.value()).toBe('1600 Amphitheatre Pkwy');
49 │     });
50 │ 
51 │     it('should synchronize value immediately on touch', () => {
52 │       const address = signal({street: ''});
53 │       const addressForm = form(
54 │         address,
55 │         (address) => {
56 ▶           debounce(address.street, 1);
57 │         },
58 │         options(),
59 │       );
60 │       const street = addressForm.street();
61 │ 
62 ▶       street.controlValue.set('1600 Amphitheatre Pkwy');
63 │       expect(street.controlValue()).toBe('1600 Amphitheatre Pkwy');
64 ▶       expect(street.value()).toBe('');
65 │ 
66 ▶       street.markAsTouched();
67 ▶       expect(street.value()).toBe('1600 Amphitheatre Pkwy');
68 │     });
```

Node の spec は、入力欄の代わりに 43・62 行目で `controlValue.set` を呼びます。45 行目で `value()` がまだ古いこと、47〜48 行目でタイマーのあと書かれること、66〜67 行目で `markAsTouched` がその場で書くことを確かめます。

📄 `angular/packages/forms/signals/test/node/api/debounce.spec.ts` L161–188 （▶ の行: 176, 181, 183, 186–187）

```ts
161 │     it('should be ignored if value is directly set before it resolves', async () => {
162 │       const debounceResult = Promise.withResolvers<void>();
163 │       const debounceFn = jasmine.createSpy('debounceFn').and.returnValues(debounceResult.promise);
164 │ 
165 │       const address = signal({street: ''});
166 │       const addressForm = form(
167 │         address,
168 │         (address) => {
169 │           debounce(address.street, debounceFn);
170 │         },
171 │         options(),
172 │       );
173 │       const street = addressForm.street();
174 │ 
175 │       // Set `controlValue` which will trigger a debounce update.
176 ▶       street.controlValue.set('1600 Amphitheatre Pkwy');
177 │       expect(street.controlValue()).toBe('1600 Amphitheatre Pkwy');
178 │       expect(street.value()).toBe('');
179 │ 
180 │       // Directly set value during debounce duration.
181 ▶       street.value.set('2000 N Shoreline Blvd');
182 │       expect(street.value()).toBe('2000 N Shoreline Blvd');
183 ▶       expect(street.controlValue()).toBe('2000 N Shoreline Blvd');
184 │ 
185 │       // Wait for the debounced update, which should be ignored.
186 ▶       await debounceResult.resolve;
187 ▶       expect(street.value()).toBe('2000 N Shoreline Blvd');
188 │     });
```

181 行目で `value` を直接書き、183 行目で `controlValue` も一緒に戻ること、187 行目で待っていた値が書かれないことを確かめます。ただし 186 行目は `await debounceResult.resolve` で、`resolve` 関数を呼ばずに await しています（Promise ではない値の await は次のマイクロタスクまで待つだけ）。Debouncer の Promise はこの it の中で一度も解決されないので、187 行目は「解決したあとでも書かれない」ことまでは確かめていません。

📄 `angular/packages/forms/signals/test/node/resource.spec.ts` L409–442 （▶ の行: 415, 423–424, 428, 432, 435, 437）

```ts
409 │   it('should support debounce in validateHttp', async () => {
410 │     const usernameForm = form(
411 │       signal('unique-user'),
412 │       (p) => {
413 │         validateHttp(p, {
414 │           request: ({value}) => `/api/check?username=${value()}`,
415 ▶           debounce: 50, // Short debounce
416 │           onSuccess: (available: boolean) => (available ? undefined : {kind: 'username-taken'}),
417 │           onError: () => null,
418 │         });
419 │       },
420 │       {injector},
421 │     );
422 │ 
423 ▶     TestBed.tick();
424 ▶     const req1 = backend.expectOne('/api/check?username=unique-user');
425 │     req1.flush(true);
426 │     await appRef.whenStable();
427 │     expect(usernameForm().valid()).toBe(true);
428 ▶     usernameForm().value.set('taken-user');
429 │     TestBed.tick();
430 │ 
431 │     // Should not have triggered a new request yet
432 ▶     backend.expectNone('/api/check?username=taken-user');
433 │ 
434 │     // Wait for debounce
435 ▶     await timeout(80);
436 │     TestBed.tick();
437 ▶     const req2 = backend.expectOne('/api/check?username=taken-user');
438 │     req2.flush(false);
439 │     await appRef.whenStable();
440 │ 
441 │     expect(usernameForm().valid()).toBe(false);
442 │   });
```

424 行目のとおり、最初の値は debounce を待たずに送られます（core の `debounced()` は最初の値をすぐ出す。resx-debounced）。428 行目で値を変えると 432 行目ではまだ送られず、435 行目で 80 ms 待つと 437 行目で送られます。バックエンドは `HttpTestingController`（`provideHttpClientTesting`、61 行目の `beforeEach`）で、デモの偽物の `XhrFactory` と同じく外へは出ません。

📄 `angular/packages/forms/signals/test/node/resource.spec.ts` L316–346 （▶ の行: 323–324, 333, 337–339）

```ts
316 │   it('should call onError handler when http validation fails', async () => {
317 │     const addressModel = signal<Address>({street: '123 Main St', city: '', zip: ''});
318 │     const addressSchema = schema<Address>((address) => {
319 │       required(address.street);
320 │       validateHttp(address, {
321 │         request: ({value}) => ({url: '/checkaddress', params: {...value()}}),
322 │         onSuccess: () => undefined,
323 ▶         onError: () => [
324 ▶           {kind: 'address-api-failed', message: 'API is down', fieldTree: addressForm},
325 │         ],
326 │       });
327 │     });
328 │ 
329 │     const addressForm = form(addressModel, addressSchema, {injector});
330 │     TestBed.tick();
331 │ 
332 │     const req = backend.expectOne('/checkaddress?street=123%20Main%20St&city=&zip=');
333 ▶     req.flush(null, {status: 500, statusText: 'Server Error'});
334 │ 
335 │     await appRef.whenStable();
336 │ 
337 ▶     expect(addressForm().pending()).toBe(false);
338 ▶     expect(addressForm().invalid()).toBe(true);
339 ▶     expect(addressForm().errors()).toEqual([
340 │       {
341 │         kind: 'address-api-failed',
342 │         message: 'API is down',
343 │         fieldTree: addressForm,
344 │       },
345 │     ]);
346 │   });
```

手元で走らせたコマンドと結果、作業木（8576f161ae4）で 1 か所ずつ変えた結果です（2026-11-19）。

📄 `走らせたコマンドと結果`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=^debounce "
Ran 21 of 539 specs / 21 specs, 0 failures
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=^resources "
Ran 13 of 539 specs / 13 specs, 0 failures

# 作業木: git -C ~/angular-research/angular-fix worktree add <work>/sfty-wt-b 8576f161ae4
# （そこで ~/angular-research/angular/node_modules/.bin/bazel test … を直接走らせ、終えてから worktree remove --force で消した）
# W1: git -C ~/angular-research/angular show cf37344a4d6 -- packages/forms/signals/test | git apply
$ bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=^debounce "
Ran 29 of 547 specs / 29 specs, 6 failures
1) debounce by duration should synchronize the value before running the submit action
2) debounce until blurred should synchronize the values of sibling fields before running the submit action
3) debounce until blurred should synchronize descendant values when an ancestor is touched
4) debounce until blurred should not run the submit action when a synchronized descendant value is invalid
5) debounce until blurred should synchronize values below a hidden field when an ancestor is touched
6) debounce until blurred should synchronize descendant values before running the submit action
```

|   | 変えたところ | node:test（539 本） |
| --- | --- | --- |
| W1 | cf37344a4d6 の spec（debounce.spec.ts に 8 本）だけを入れ、直しは入れない | 29 本中 6 failures（submit の前に書く・子の待ちを書く・hidden の下の待ちを書く ほか） |
| D1 | node.ts 279 行目（`markAsTouched` の `flushSync()`）を消す | 5 failures（debounce.spec.ts の on touch 3 本と aborted on touch、field\_node.spec.ts の flush on touch） |
| D2 | node.ts 442〜444 行目（取り消されたら書かない）を消す | 3 failures（most recently returned promise、field\_node.spec.ts の reset の 2 本） |
| D3 | debounce.ts 79 行目（abort の購読）を消す | 1 failure（should remove abort listener when debounce completes） |
| D4 | debounce.ts 75 行目（タイマーで購読を外す）を消す | 1 failure（同じ it） |
| H1 | validate\_http.ts 104 行目（`debounce: opts.debounce`）を消す | 1 failure（should support debounce in validateHttp） |
| H2 | validate\_http.ts 107 行目の `onError` を `() => undefined` に | 1 failure（should call onError handler when http validation fails） |

D3 では、abort の購読が無いので取り消されてもタイマーが止まらず、71 行目の解決も起きません。それでも落ちるのは購読の回数を数える 242 行目の it だけで、「取り消したあとタイマーが来ても書かない」ことは `debounceSync` の `aborted` の確認（D2 の行）が守っています。request が `undefined` を返して問い合わせないことを確かめる it はありません。resource.spec.ts で request を書く 6 本（246・290・321・352・414・450 行目）と standard\_schema.spec.ts の 476 行目は、どれも必ず URL かリクエストを返します。

debounce の待ち方を直すなら `api/rules/debounce.ts` の 3 つの関数、取り消しと書き込みなら `field/node.ts` の `debounceSync`・`flushSync`・`markAsTouchedInternal`、足す先は `test/node/api/debounce.spec.ts` です（DOM の blur が要るものは `test/web/form_field.spec.ts` の `describe('debounce')`）。validateHttp なら `api/rules/validation/validate_http.ts` と `validate_async.ts`、足す先は `test/node/resource.spec.ts`（`HttpTestingController` で `expectOne`・`expectNone`）です。開いている #71631（自作の Debouncer の abort の通知が computed の中で遅れて来る。PR #71772 が開いている）は、2 節の表の 2 行目の `pendingSync` の linkedSignal の中で `abort()` を呼んでいることにつながります。デモの Debouncer がログへの書き込みを `queueMicrotask` で後回しにしているのは、この通知の中で signal に書くと NG0600 になるためです。

## 聞かれそうな質問

**Q. debounce(p.x, 300) と validateHttp の debounce: 300 は何が違いますか？**

前者は入力欄の値（controlValue）をモデル（value）に書くのを遅らせ、型は `Debouncer`（types.ts 1037〜1040 行目）です。後者はモデルの値が request になって `httpResource` に届くのを遅らせ、型は core の `DebounceTimer`（validate\_http.ts 74 行目）です。両方付けると、入力から問い合わせまで両方を足した時間がかかります。

**Q. debounce 中に送信ボタンを押すと、古い値が送られますか？**

22.2.6 と origin/main では送られません。`submit` が根を touched にするとき、各フィールドの待ちをその場で書きます（cf37344a4d6）。8576f161ae4 では、呼んだフィールド自身の待ちしか書かなかったので、Enter で送ると子の古い値で action が走りました（#71149、作業木の W1 で 6 本落ちる）。

**Q. 自作の Debouncer の中で、新しく打たれた値を読めますか？**

`context.value()` はまだモデルの古い値です（1038 行目の `FieldContext` の `value` はモデルにつながった signal）。打った値は `context.state.controlValue()` で読めます（`ReadonlyFieldState` の読み口。[第 2 回](02-sfty-state.md)）。

**Q. validateHttp の request が undefined を返すとどうなりますか？**

リクエストは作られず、resource は idle になり、フィールドはエラーにも pending にもなりません。43〜45 行目の型がどちらも `| undefined` を許していて、`httpResource` の `normalizeRequest` が `undefined` を返し、`validateAsync` の非同期のルールは idle のとき `undefined` を返すからです。ただし 74 行目の debounce を付けていると、`undefined` も debounce を待ってから届くので、その間だけ pending です（デモの 'a' で約 400 ms）。

**Q. validateHttp のテストで本物のサーバーを立てずに済むのはなぜですか？**

`httpResource` は注入器から `HttpClient` を取り（68 行目の options に injector が無ければ、フィールドの注入器から）、`HttpClient` は `HttpHandler` にリクエストを渡すだけだからです。spec は `provideHttpClientTesting` で、デモは `XhrFactory` の偽物で、その手前を差し替えています。

## 読み終えて

- debounce のルールは controlValue → value を、validateHttp の debounce は value → request を遅らせる。型も `Debouncer` と `DebounceTimer` で別。
- 数の Debouncer は取り消されても解決する（71 行目）。書くかどうかは `debounceSync` が `aborted` を見て決める。'blur' は touched の `flushSync` に任せる。
- 待ちを取り消すのは、次の入力・value の直接の書き込み・touched・reset の 4 つで、その場で書くのは touched だけ。子の待ちまで書くのは cf37344a4d6 から。
- validateHttp は `validateAsync` に httpResource を factory として渡すだけで、request が `undefined` なら問い合わせない。onError は必須。
- debounce 付きの非同期の検証は、値を変えた同じ処理の中ではまだ前の結果を返す（#71636）。

---

← 前: [PathKind と SchemaPath：ルールを付けられる場所を型で決める](04-sfty-path.md)  
次: [spec と issue を読む：型と時間の約束を固めているテスト](06-sfty-tests-issues.md) →
