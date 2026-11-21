[目次](../README.md) › [common の説明文の読み残し](README.md) › 第 7 回 / 全 9 回

# AsyncPipe と小さな pipe の説明文

> pipes/async\_pipe.ts・slice\_pipe.ts・keyvalue\_pipe.ts・case\_conversion\_pipes.ts・json\_pipe.ts・pipes/index.ts の未読の行：購読と解除の約束、負の index、並べ方の比較関数、titlecase の区切り、例の出力。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-pipes)

---

この章で分かること：`AsyncPipe`・`SlicePipe`・`KeyValuePipe`・`LowerCasePipe`・`UpperCasePipe`・`TitleCasePipe`・`JsonPipe` の説明文が約束すること（購読と解除、負の index、並べ方と `compareFn`、単語の区切り、JSON の文字列）と、説明文が指す例のファイルに書かれた「期待される出力」を、本物の pipe で 1 行ずつ確かめます。例の出力は全部そのとおりでした。合わなかったのは、説明の言い切り（「blank は blank のまま」「Unicode の値で並べる」「空白で区切る」「どの値も JSON の文字列に」）と、例が `@for` に変わったのに残っている「ngFor の例」の 2 か所です。

読む対象は `packages/common/src/pipes/` の `async_pipe.ts`・`slice_pipe.ts`・`keyvalue_pipe.ts`・`case_conversion_pipes.ts`・`json_pipe.ts`・`index.ts` と、`packages/examples/common/pipes/ts/` の例（../angular、8576f161ae4）です。pipe がテンプレートからどう呼ばれるか（pure と impure、`ɵɵpipeBind`）は[pipe の仕組みの章](../cmn/06-cmn-pipe-mechanism.md)、`AsyncPipe` の購読と `markForCheck` の流れは[AsyncPipe の章](../template/08-async-pipe.md)、`SlicePipe`・大文字小文字・`JsonPipe` の実装の行は[小さな pipe の章](../cmn/07-cmn-simple-pipes.md)、`KeyValuePipe` の differ と比べ方は[KeyValuePipe の章](../cmn/08-cmn-keyvalue-pipe.md)にあります。

1. [1. NgOptimizedImage](01-cmd-image.md)
2. [2. 画像のローダー](02-cmd-image-loaders.md)
3. [3. 日付の書式](03-cmd-date.md)
4. [4. 数と i18n の pipe](04-cmd-number.md)
5. [5. 構造ディレクティブ](05-cmd-structural.md)
6. [6. NgClass・NgStyle と outlet](06-cmd-attr-outlets.md)
7. **7. AsyncPipe と小さな pipe**（この章）
8. [8. Location](08-cmd-location.md)
9. [9. spec と issue](09-cmd-tests-issues.md)

## 1. AsyncPipe の説明文：最後の値、解除、切り替え

📄 `angular/packages/common/src/pipes/async_pipe.ts` L107–139 （▶ の行: 116–120, 126–127, 129, 131–132, 134）

```ts
107 │ const _promiseStrategy = new PromiseStrategy();
108 │ const _subscribableStrategy = new SubscribableStrategy();
109 │ 
110 │ /**
111 │  * @ngModule CommonModule
112 │  * @description
113 │  *
114 │  * Unwraps a value from an asynchronous primitive.
115 │  *
116 ▶  * The `async` pipe subscribes to an `Observable` or `Promise` and returns the latest value it has
117 ▶  * emitted. When a new value is emitted, the `async` pipe marks the component to be checked for
118 ▶  * changes. When the component gets destroyed, the `async` pipe unsubscribes automatically to avoid
119 ▶  * potential memory leaks. When the reference of the expression changes, the `async` pipe
120 ▶  * automatically unsubscribes from the old `Observable` or `Promise` and subscribes to the new one.
121 │  *
122 │  * @usageNotes
123 │  *
124 │  * ### Examples
125 │  *
126 ▶  * This example binds a `Promise` to the view. Clicking the `Resolve` button resolves the
127 ▶  * promise.
128 │  *
129 ▶  * {@example common/pipes/ts/async_pipe.ts region='AsyncPipePromise'}
130 │  *
131 ▶  * It's also possible to use `async` with Observables. The example below binds the `time` Observable
132 ▶  * to the view. The Observable continuously updates the view with the current time.
133 │  *
134 ▶  * {@example common/pipes/ts/async_pipe.ts region='AsyncPipeObservable'}
135 │  *
136 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
137 │  *
138 │  * @publicApi
139 │  */
```

116〜120 行目の約束は 4 つです。購読して最後の値を返す、新しい値で検査の印を付ける、コンポーネントが壊れたら解除する、式の参照が変わったら古いものを外して新しいものを購読する。119〜120 行目の最後の文は e3511e26326（2021-07-15、#42863）で足されました。DEMO 1 の AsyncPipe の表は、`<span>{{ src | async }}</span>` を持つコンポーネントで、126〜129 行目の Promise の例と同じ操作（待つ → Resolve → Reset）をし、Observable の代わりに subscribe と unsubscribe の回数を数える小さな Subscribable を 2 つ渡して切り替えました。

- Promise の例：待っている間は空、resolve のあとは `'hi there!'`、新しい Promise に替えると空に戻りました。
- A（`'a1'` を出した）から B に替えると、B が値を出すまで空です。A がそのあと `'a2'` を出しても表示は変わらず、B の `'b1'` で `'b1'`。コンポーネントを壊すと B も解除され、A・B とも subscribe 1 回・unsubscribe 1 回でした。
- 116〜117 行目の「最後の値」は、今購読しているものの最後の値です。替えた直後は、前のものの値ではなく `null` を返します（理由は 3 節の 230 行目）。

📄 `angular/packages/common/src/pipes/async_pipe.ts` L140–159 （▶ の行: 142, 146–147, 152）

```ts
140 │ @Pipe({
141 │   name: 'async',
142 ▶   pure: false,
143 │ })
144 │ export class AsyncPipe implements OnDestroy, PipeTransform {
145 │   private _ref: ChangeDetectorRef | null;
146 ▶   private _latestValue: any = null;
147 ▶   private markForCheckOnValueUpdate = true;
148 │ 
149 │   private _subscription: Unsubscribable | PromiseLike<any> | null = null;
150 │   private _obj: Subscribable<any> | PromiseLike<any> | EventEmitter<any> | null = null;
151 │   private _strategy: SubscriptionStrategy | null = null;
152 ▶   private readonly applicationErrorHandler = inject(INTERNAL_APPLICATION_ERROR_HANDLER);
153 │ 
154 │   constructor(ref: ChangeDetectorRef) {
155 │     // Assign `ref` into `this._ref` manually instead of declaring `_ref` in the constructor
156 │     // parameter list, as the type of `this._ref` includes `null` unlike the type of `ref`.
157 │     this._ref = ref;
158 │   }
159 │ 
```

146 行目の `_latestValue` の初めの値は `null` なので、まだ値の無いものを渡したときの答えは `null` です（spec `should return null when subscribing to an observable`、async\_pipe\_spec.ts 64）。`undefined` にしたいという提案は #16982（閉）、`null` が型の上で困るという話は #43727（開）にあります。142 行目の `pure: false` と、147 行目の「同期で来た値には印を付けない」の旗の使い方は[AsyncPipe の章](../template/08-async-pipe.md)です。購読した瞬間に値を出すもの（`BehaviorSubject` のような物）は、最初の `detectChanges` でもう値が出ました。

## 2. Promise は「解除」できない

📄 `angular/packages/common/src/pipes/async_pipe.ts` L61–85 （▶ の行: 67–73, 82–85）

```ts
61 │ class PromiseStrategy implements SubscriptionStrategy {
62 │   createSubscription(
63 │     async: PromiseLike<any>,
64 │     updateLatestValue: ((v: any) => any) | null,
65 │     onError: ((e: unknown) => void) | null,
66 │   ): Unsubscribable {
67 ▶     // According to the promise specification, promises are not cancellable by default.
68 ▶     // Once a promise is created, it will either resolve or reject, and it doesn't
69 ▶     // provide a built-in mechanism to cancel it.
70 ▶     // There may be situations where a promise is provided, and it either resolves after
71 ▶     // the pipe has been destroyed or never resolves at all. If the promise never
72 ▶     // resolves — potentially due to factors beyond our control, such as third-party
73 ▶     // libraries — this can lead to a memory leak.
74 │     // When we use `async.then(updateLatestValue)`, the engine captures a reference to the
75 │     // `updateLatestValue` function. This allows the promise to invoke that function when it
76 │     // resolves. In this case, the promise directly captures a reference to the
77 │     // `updateLatestValue` function. If the promise resolves later, it retains a reference
78 │     // to the original `updateLatestValue`, meaning that even if the context where
79 │     // `updateLatestValue` was defined has been destroyed, the function reference remains in memory.
80 │     // This can lead to memory leaks if `updateLatestValue` is no longer needed or if it holds
81 │     // onto resources that should be released.
82 ▶     // When we do `async.then(v => ...)` the promise captures a reference to the lambda
83 ▶     // function (the arrow function).
84 ▶     // When we assign `updateLatestValue = null` within the context of an `unsubscribe` function,
85 ▶     // we're changing the reference of `updateLatestValue` in the current scope to `null`.
```

120 行目の「古い Promise から unsubscribe」は、言葉どおりにはできません。67〜69 行目のとおり Promise には取り消しが無く、`PromiseStrategy` は `then` に渡した矢印関数が見る変数を `null` にするだけです（82〜85 行目、実装は L88〜99）。DEMO では、待っている Promise から B に替えて B が `'b1'` を出したあと、古い Promise が `'old'` で resolve しても表示は `'b1'` のままでした。外すのは「値を受け取ること」で、Promise 自体はそのまま最後まで走ります。

## 3. 何を受け取るか：rxjs の型だけ

📄 `angular/packages/common/src/pipes/async_pipe.ts` L21–33 （▶ の行: 21, 25–27, 30–31）

```ts
21 ▶ import type {Observable, Subscribable, Unsubscribable} from 'rxjs';
22 │ 
23 │ import {invalidPipeArgumentError} from './utils';
24 │ 
25 ▶ interface SubscriptionStrategy {
26 ▶   createSubscription(
27 ▶     async: Subscribable<any> | PromiseLike<any>,
28 │     updateLatestValue: any,
29 │     onError: (e: unknown) => void,
30 ▶   ): Unsubscribable | PromiseLike<any>;
31 ▶   dispose(subscription: Unsubscribable | PromiseLike<any>): void;
32 │ }
33 │ 
```

📄 `angular/packages/common/src/pipes/async_pipe.ts` L170–177 （▶ の行: 175–177）

```ts
170 │ 
171 │   // NOTE(@benlesh): Because Observable has deprecated a few call patterns for `subscribe`,
172 │   // TypeScript has a hard time matching Observable to Subscribable, for more information
173 │   // see https://github.com/microsoft/TypeScript/issues/43643
174 │ 
175 ▶   transform<T>(obj: Observable<T> | Subscribable<T> | PromiseLike<T>): T | null;
176 ▶   transform<T>(obj: null | undefined): null;
177 ▶   transform<T>(obj: Observable<T> | Subscribable<T> | PromiseLike<T> | null | undefined): T | null;
```

📄 `angular/packages/common/src/pipes/async_pipe.ts` L211–234 （▶ の行: 215, 219, 223, 229–232）

```ts
211 │ 
212 │   private _selectStrategy(
213 │     obj: Subscribable<any> | PromiseLike<any> | EventEmitter<any>,
214 │   ): SubscriptionStrategy {
215 ▶     if (ɵisPromise(obj)) {
216 │       return _promiseStrategy;
217 │     }
218 │ 
219 ▶     if (ɵisSubscribable(obj)) {
220 │       return _subscribableStrategy;
221 │     }
222 │ 
223 ▶     throw invalidPipeArgumentError(AsyncPipe, obj);
224 │   }
225 │ 
226 │   private _dispose(): void {
227 │     // Note: `dispose` is only called if a subscription has been initialized before, indicating
228 │     // that `this._strategy` is also available.
229 ▶     this._strategy!.dispose(this._subscription!);
230 ▶     this._latestValue = null;
231 ▶     this._subscription = null;
232 ▶     this._obj = null;
233 │   }
234 │ 
```

21 行目は `import type` で、`AsyncPipe` は rxjs の型だけを使い、実行時には rxjs を読みません。215 行目の `ɵisPromise` と 219 行目の `ɵisSubscribable` は「`then`（`subscribe`）という関数を持つか」を見るだけなので、DEMO の自作の Subscribable もそのまま購読されました。どちらでもなければ 223 行目で `invalidPipeArgumentError` です（`5 | async` は本番で `NG02100`、開発モードで `NG02100: InvalidPipeArgument: '5' for pipe 'AsyncPipe'`、DEMO 2）。230 行目の `_dispose` が `_latestValue = null` にするので、切り替えた直後と、`null`・`undefined` を渡した直後は空です（DEMO で A の unsubscribe も 1 回）。176 行目の overload のとおり、`null` と `undefined` の答えの型は `null` です。

## 4. SlicePipe：例の 7 つと blank

📄 `angular/packages/common/src/pipes/slice_pipe.ts` L13–49 （▶ の行: 21–22, 24–25, 27, 31, 33, 37–40, 44）

````ts
13 │ /**
14 │  * @ngModule CommonModule
15 │  * @description
16 │  *
17 │  * Creates a new `Array` or `String` containing a subset (slice) of the elements.
18 │  *
19 │  * @usageNotes
20 │  *
21 ▶  * All behavior is based on the expected behavior of the JavaScript API `Array.prototype.slice()`
22 ▶  * and `String.prototype.slice()`.
23 │  *
24 ▶  * When operating on an `Array`, the returned `Array` is always a copy even when all
25 ▶  * the elements are being returned.
26 │  *
27 ▶  * When operating on a blank value, the pipe returns the blank value.
28 │  *
29 │  * ### List Example
30 │  *
31 ▶  * This `ngFor` example:
32 │  *
33 ▶  * {@example common/pipes/ts/slice_pipe.ts region='SlicePipe_list'}
34 │  *
35 │  * produces the following:
36 │  *
37 ▶  * ```html
38 ▶  * <li>b</li>
39 ▶  * <li>c</li>
40 ▶  * ```
41 │  *
42 │  * ### String Examples
43 │  *
44 ▶  * {@example common/pipes/ts/slice_pipe.ts region='SlicePipe_string'}
45 │  *
46 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
47 │  *
48 │  * @publicApi
49 │  */
````

44 行目が指す例（packages/examples/common/pipes/ts/slice\_pipe.ts）は、`'abcdefghij'` に 6 つの slice をかけ、それぞれ「output is expected to be」と答えを書いています。本物の `SlicePipe` の `transform` に同じ引数を渡すと、6 つとも書いてあるとおりでした（`slice: -4 : -2` で `'gh'`、`slice: 100` で `''` など）。37〜40 行目の配列の答え `b`・`c` も同じです。24〜25 行目「全部返すときも写し」も、`slice: 0` の答えは元と別の配列でした。

- 27 行目「blank な値なら blank な値を返す」は、`null` と `''` では合いますが、`undefined` は `null` になります（L84 の `if (value == null) return null`）。spec の `should return null if the value is undefined`（slice\_pipe\_spec.ts 48）は、説明文ではなく実装のほうを固めています。この 1 文は 2c42a50fc3b（2016-09-08）からです。
- 31 行目「この `ngFor` の例は」は、33 行目が指す例が e7608e503f1（2025-05-26、`docs: update API examples to modern angular (#61688)`）で `@for (i of collection | slice: 1 : 3; track $index)` に変わったので、今は `@for` の例です。

📄 `angular/packages/common/src/pipes/slice_pipe.ts` L55–78 （▶ の行: 58, 60, 62, 64, 66–68）

```ts
55 │   /**
56 │    * @param value a list or a string to be sliced.
57 │    * @param start the starting index of the subset to return:
58 ▶    *   - **a positive integer**: return the item at `start` index and all items after
59 │    *     in the list or string expression.
60 ▶    *   - **a negative integer**: return the item at `start` index from the end and all items after
61 │    *     in the list or string expression.
62 ▶    *   - **if positive and greater than the size of the expression**: return an empty list or
63 │    * string.
64 ▶    *   - **if negative and greater than the size of the expression**: return entire list or string.
65 │    * @param end the ending index of the subset to return:
66 ▶    *   - **omitted**: return all items until the end.
67 ▶    *   - **if positive**: return all items before `end` index of the list or string.
68 ▶    *   - **if negative**: return all items before `end` index from the end of the list or string.
69 │    */
70 │   transform<T>(value: ReadonlyArray<T>, start: number, end?: number): Array<T>;
71 │   transform(value: null | undefined, start: number, end?: number): null;
72 │   transform<T>(
73 │     value: ReadonlyArray<T> | null | undefined,
74 │     start: number,
75 │     end?: number,
76 │   ): Array<T> | null;
77 │   transform(value: string, start: number, end?: number): string;
78 │   transform(value: string | null | undefined, start: number, end?: number): string | null;
```

58〜68 行目の 7 つの場合は、例の 6 つの入力で全部出てきて、どれも `String.prototype.slice` のとおりです（21〜22 行目「JavaScript の slice に基づく」）。配列でも文字列でもない値（`new Set(['a'])`）は `NG02100` です。

## 5. KeyValuePipe：Unicode の値で並べる、とは限らない

📄 `angular/packages/common/src/pipes/keyvalue_pipe.ts` L34–56 （▶ の行: 38, 40–43, 48–49, 51）

```ts
34 │ /**
35 │  * @ngModule CommonModule
36 │  * @description
37 │  *
38 ▶  * Transforms Object or Map into an array of key value pairs.
39 │  *
40 ▶  * The output array will be ordered by keys.
41 ▶  * By default the comparator will be by Unicode point value.
42 ▶  * You can optionally pass a compareFn if your keys are complex types.
43 ▶  * Passing `null` as the compareFn will use natural ordering of the input.
44 │  *
45 │  * @usageNotes
46 │  * ### Examples
47 │  *
48 ▶  * This examples show how an Object or a Map can be iterated by ngFor with the use of this
49 ▶  * keyvalue pipe.
50 │  *
51 ▶  * {@example common/pipes/ts/keyvalue_pipe.ts region='KeyValuePipe'}
52 │  *
53 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
54 │  *
55 │  * @publicApi
56 │  */
```

51 行目の例の 3 つ（Object、Map、`keyvalue: null`）は、`1:bar, 2:foo`、`1:bar, 2:foo`、`2:foo, 1:bar` で、40〜43 行目のとおりです。41 行目「既定の比べ方は Unicode の値」は、キーの型で変わります。

- Object のキーは `Object.keys` で文字列になるので、`{9: 'a', 10: 'b'}` は Unicode の順の `'10'`・`'9'` でした。
- Map の数のキーは数として比べ、`new Map([[9, 'a'], [10, 'b']])` は `9`・`10` でした。`defaultComparator` が「両方とも数なら `a - b`」を持つからです（L166〜167、[KeyValuePipe の章](../cmn/08-cmn-keyvalue-pipe.md)の 3 節）。spec の Map の `should order by numerical`（keyvalue\_pipe\_spec.ts 212）がこの順を固めています。真偽は `false` が先、型が混ざれば `String()` で比べ、`null`・`undefined` は最後です。
- 48 行目「ngFor で回す例」は、51 行目の例が e7d0113dad0（2025-01-28、#59760）で `@for` に変わったままです。

43 行目の `null` は 13c13067bc3（2024-08-22、#57487）で入りました。同じ pipe に「既定 → `null`」の順で渡したとき、このサイトの 22.2.6 では入力の順に戻りました（fb705aad90 が入っている。../angular の 8576f161ae4 では戻らず、main は 622a7c7f29d で直した。KeyValuePipe の章の 4 節）。開いている issue #72114 の形、つまり `null` のまま、同じキーと値で挿入の順だけが違う新しい Map を渡すと、22.2.6 でも前の順 `1:'a', 2:'b'` のままでした。differ が「キーも値も変わっていない」と見て配列を作り直さないからで、43 行目の「入力の自然な順」とは合いません。

📄 `angular/packages/common/src/pipes/keyvalue_pipe.ts` L95–117 （▶ の行: 95–96, 98, 108–111, 113–116）

```ts
 95 ▶   transform(
 96 ▶     input: null | undefined,
 97 │     compareFn?: ((a: KeyValue<unknown, unknown>, b: KeyValue<unknown, unknown>) => number) | null,
 98 ▶   ): null;
 99 │   transform<K, V>(
100 │     input: ReadonlyMap<K, V> | null | undefined,
101 │     compareFn?: ((a: KeyValue<K, V>, b: KeyValue<K, V>) => number) | null,
102 │   ): Array<KeyValue<K, V>> | null;
103 │   transform<K extends string, V>(
104 │     input: Record<K, V> | ReadonlyMap<K, V> | null | undefined,
105 │     compareFn?: ((a: KeyValue<K, V>, b: KeyValue<K, V>) => number) | null,
106 │   ): Array<KeyValue<K, V>> | null;
107 │ 
108 ▶   transform<K extends number, V>(
109 ▶     input: Record<K, V> | null | undefined,
110 ▶     compareFn?: ((a: KeyValue<string, V>, b: KeyValue<string, V>) => number) | null,
111 ▶   ): Array<KeyValue<string, V>> | null;
112 │ 
113 ▶   transform<T>(
114 ▶     input: T,
115 ▶     compareFn?: T extends object ? (a: T[keyof T], b: T[keyof T]) => number : never,
116 ▶   ): T extends object ? Array<KeyValue<keyof T, T[keyof T]>> : null;
117 │ 
```

95〜98 行目のとおり `null`・`undefined` の答えは `null`、108〜111 行目は数のキーの Object の `key` を `string` にする overload です（Object.keys の事実を型に写したもの）。113〜116 行目の最後の overload は、`compareFn` の引数が `KeyValue` ではなく値（`T[keyof T]`）になっていて、上の overload と形が違います。overload の順番の修正（46d2cb7ff04）は KeyValuePipe の章の 5 節です。

## 6. 大文字小文字：空白で区切る、とは

📄 `angular/packages/common/src/pipes/case_conversion_pipes.ts` L13–29 （▶ の行: 14, 20–21, 23）

```ts
13 │ /**
14 ▶  * Transforms text to all lower case.
15 │  *
16 │  * @see {@link UpperCasePipe}
17 │  * @see {@link TitleCasePipe}
18 │  * @usageNotes
19 │  *
20 ▶  * The following example defines a view that allows the user to enter
21 ▶  * text, and then uses the pipe to convert the input text to all lower case.
22 │  *
23 ▶  * {@example common/pipes/ts/lowerupper_pipe.ts region='LowerUpperPipe'}
24 │  *
25 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
26 │  *
27 │  * @ngModule CommonModule
28 │  * @publicApi
29 │  */
```

📄 `angular/packages/common/src/pipes/case_conversion_pipes.ts` L59–77 （▶ の行: 60–63, 71）

```ts
59 │ /**
60 ▶  * Transforms text to title case.
61 ▶  * Capitalizes the first letter of each word and transforms the
62 ▶  * rest of the word to lower case.
63 ▶  * Words are delimited by any whitespace character, such as a space, tab, or line-feed character.
64 │  *
65 │  * @see {@link LowerCasePipe}
66 │  * @see {@link UpperCasePipe}
67 │  *
68 │  * @usageNotes
69 │  * The following example shows the result of transforming various strings into title case.
70 │  *
71 ▶  * {@example common/pipes/ts/titlecase_pipe.ts region='TitleCasePipe'}
72 │  *
73 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
74 │  *
75 │  * @ngModule CommonModule
76 │  * @publicApi
77 │  */
```

📄 `angular/packages/common/src/pipes/case_conversion_pipes.ts` L98–107 （▶ の行: 100）

```ts
 98 │ 
 99 │ /**
100 ▶  * Transforms text to all upper case.
101 │  * @see {@link LowerCasePipe}
102 │  * @see {@link TitleCasePipe}
103 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
104 │  *
105 │  * @ngModule CommonModule
106 │  * @publicApi
107 │  */
```

71 行目が指す例は 6 つの文字列に「output is expected to be」を書いていて、本物の `TitleCasePipe` は 6 つとも書いてあるとおりでした（`"it's non-trivial question"` は `"It's Non-trivial Question"`、`'one,two,three'` は `'One,two,three'`）。63 行目「単語は空白で区切られる」は、区切りの側としては合っていて、タブ・改行・NBSP・全角スペースでも区切りました。違うのは単語の始まりです。実装の正規表現は「数字か文字で始まり、空白でないものが続く」を探すので（[小さな pipe の章](../cmn/07-cmn-simple-pipes.md)の 4 節）、空白の後ろの記号は飛ばして最初の文字を大文字にします。`'(abc) [def]'` は `'(Abc) [Def]'`、`"'quoted' _under"` は `"'Quoted' _Under"`、`'😀smile'` は `'😀Smile'` でした。数字で始まる `'123abc'` は 1 文字目が数字なので、残りが小文字になるだけです（spec `should handle numbers at the beginning of words`、case\_conversion\_pipes\_spec.ts 111）。

14 行目と 100 行目の「全部小文字・大文字に」は `String.prototype.toLowerCase`・`toUpperCase` そのもので、`'straße'` は `'STRASSE'` と長さが変わります。3 つとも `null`・`undefined` は `null`、文字列でない値は `NG02100` ですが、説明文はどちらも書いていません（spec は `should map undefined to null`・`should not support numbers` で固めています）。

## 7. JsonPipe：JSON の文字列にならない値

📄 `angular/packages/common/src/pipes/json_pipe.ts` L12–28 （▶ の行: 16, 20–21, 23）

```ts
12 │ /**
13 │  * @ngModule CommonModule
14 │  * @description
15 │  *
16 ▶  * Converts a value into its JSON-format representation.  Useful for debugging.
17 │  *
18 │  * @usageNotes
19 │  *
20 ▶  * The following component uses a JSON pipe to convert an object
21 ▶  * to JSON format, and displays the string in both formats for comparison.
22 │  *
23 ▶  * {@example common/pipes/ts/json_pipe.ts region='JsonPipe'}
24 │  *
25 │  * @see [Built-in Pipes](guide/templates/pipes#built-in-pipes)
26 │  *
27 │  * @publicApi
28 │  */
```

23 行目が指す例は、同じ object を補間（`[object Object]`）と `| json` で並べるもので、`JSON.stringify(value, null, 2)` の 14 行の文字列になりました。16 行目「値を JSON の形の表し方にする」と、`transform` の `@param`「どの型の値も JSON の文字列に」（L35）、戻りの型 `string`（L37）は、`JSON.stringify` が文字列を返さない値で外れます。

- `undefined` と関数は `undefined`（`typeof` も `undefined`）で、補間は空になります。
- `BigInt` は `TypeError: Do not know how to serialize a BigInt`、自分を指すオブジェクトは `TypeError: Converting circular structure to JSON` で、変更検知が止まります。
- `Map` は `'{}'`、`Date` は ISO の文字列です。signal を渡すと関数なので `undefined` で、開発モードだけ `The JsonPipe does not unwrap signals` の警告が出ます（DEMO 2 の記録）。

引数の型が `any` から `unknown` になったのは c5da47f63f8（2026-03-19）で、戻りの型 `string` はそのままです。

## 8. pipes/index.ts：公開するもの

📄 `angular/packages/common/src/pipes/index.ts` L9–43 （▶ の行: 10–12, 16–17, 21, 25, 28–29, 31, 36, 43）

```ts
 9 │ /**
10 ▶  * @module
11 ▶  * @description
12 ▶  * This module provides a set of common Pipes.
13 │  */
14 │ import {AsyncPipe} from './async_pipe';
15 │ import {LowerCasePipe, TitleCasePipe, UpperCasePipe} from './case_conversion_pipes';
16 ▶ import {DATE_PIPE_DEFAULT_OPTIONS, DATE_PIPE_DEFAULT_TIMEZONE, DatePipe} from './date_pipe';
17 ▶ import {DatePipeConfig} from './date_pipe_config';
18 │ import {I18nPluralPipe} from './i18n_plural_pipe';
19 │ import {I18nSelectPipe} from './i18n_select_pipe';
20 │ import {JsonPipe} from './json_pipe';
21 ▶ import {KeyValue, KeyValuePipe} from './keyvalue_pipe';
22 │ import {CurrencyPipe, DecimalPipe, PercentPipe} from './number_pipe';
23 │ import {SlicePipe} from './slice_pipe';
24 │ 
25 ▶ export {
26 │   AsyncPipe,
27 │   CurrencyPipe,
28 ▶   DATE_PIPE_DEFAULT_OPTIONS,
29 ▶   DATE_PIPE_DEFAULT_TIMEZONE,
30 │   DatePipe,
31 ▶   DatePipeConfig,
32 │   DecimalPipe,
33 │   I18nPluralPipe,
34 │   I18nSelectPipe,
35 │   JsonPipe,
36 ▶   KeyValue,
37 │   KeyValuePipe,
38 │   LowerCasePipe,
39 │   PercentPipe,
40 │   SlicePipe,
41 │   TitleCasePipe,
42 │   UpperCasePipe,
43 ▶ };
```

10〜12 行目の `@module` の説明は「共通の pipe の集まり」とだけ言います。25〜43 行目の `export` には、pipe のクラスのほかに、`DatePipe` の既定を差し替えるトークン（28〜29 行目）、`DatePipeConfig` の型（31 行目）、`KeyValuePipe` の答えの要素の型 `KeyValue`（36 行目）が入っています。`CommonModule` に入る pipe の並び `COMMON_PIPES`（L45〜62）は[NgModule の exports の章](../ngmodule/05-ngmodule-exports.md)が読んでいます。

> **🧪 DEMO 1 — 説明文と例の出力を本物の pipe で**
>
> SlicePipe・大文字小文字・JsonPipe はクラスを `new` して `transform` を呼びます。KeyValuePipe はこのページの `KeyValueDiffers` を渡して `new` します。AsyncPipe は下のテンプレートのコンポーネントを `createComponent` で作り（文書に付けない div の上）、値を替えて `detectChanges` します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-pipes)

📄 `AsyncPipe の表のテンプレート`

```
<span>{{ src | async }}</span>
```

> **🧪 DEMO 2 — 受け取れない値：開発モードと本番**
>
> 押すと、このページ（本番ビルド）で 3 つの誤った値を渡します。左の 2 列は Node（domino の上の JIT）の記録で、signal を渡す 2 行は開発モードで警告を出すので記録だけです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmd-pipes)

## ここまでの呼び出し

- 👤 `{{ src | async }}` の src を A から B に
  - `AsyncPipe.transform(B)` — async\_pipe.ts L178〜200 — *obj !== this.\_obj*
    - `_dispose() → SubscribableStrategy.dispose → unsubscribe()` — L226〜233・L55〜58 — *\_latestValue = null*
    - `transform(B) → _subscribe(B) → _selectStrategy(B)` — L202〜224 — *ɵisSubscribable で選ぶ*
      - `B.subscribe({next, error})` — L47〜52 — *B が値を出すまで null を返す*

## テストと直し方

| ファイル（packages/common/test/pipes/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `async_pipe_spec.ts` | `Observable`（40）› `should dispose of the existing subscription when subscribing to a new observable`（89）、`Promise`（174）› `should dispose of the existing subscription when subscribing to a new promise`（221）・`should ignore signals after the pipe has been destroyed`（257） | 1・2 節の切り替え。切り替えた直後に `null` を返すことを名指しする it は無い |
| `slice_pipe_spec.ts` | `should return null if the value is undefined`（48）、52〜82 の 7 つ | 4 節。48 は説明文の 27 行目と逆の向きを固める |
| `keyvalue_pipe_spec.ts` | Map の `should order by numerical`（212）・`should not order by alpha when compareFn is null`（258）・`should reorder when compareFn changes`（273） | 5 節。挿入の順だけが変わった Map（#72114）の it は無い |
| `case_conversion_pipes_spec.ts` | `TitleCasePipe`（61）› `should not capitalize letter after the quotes`（89）・`should not treat non-space character as a separator`（93）・`should support support all whitespace characters`（99） | 6 節。頭が記号の語の it は無い |
| `json_pipe_spec.ts` | `should return JSON-formatted string similar to Json.stringify`（50） | 7 節。文字列にならない値の it は無い |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/common/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=^AsyncPipe         Ran 24 of 667 specs、0 failures
--filter=^SlicePipe         Ran 16 of 667 specs、0 failures
--filter=^KeyValuePipe      Ran 31 of 667 specs、0 failures
--filter=^defaultComparator Ran 7 of 667 specs、0 failures
--filter=^TitleCasePipe     Ran 15 of 667 specs、0 failures
--filter=^LowerCasePipe     Ran 7 of 667 specs、0 failures
--filter=^UpperCasePipe     Ran 7 of 667 specs、0 failures
--filter=^JsonPipe          Ran 5 of 667 specs、0 failures

# 説明文が指す packages/examples/common/pipes/ts の 6 つの例を strictTemplates の ngc にかける
# （slice_pipe.ts・async_pipe.ts・keyvalue_pipe.ts・titlecase_pipe.ts・lowerupper_pipe.ts・json_pipe.ts）
$ ngc -p tsconfig.json
（この 6 つのファイルのエラーは 0）
```

直すとしたら説明文です。slice\_pipe.ts の 27 行目は「`null` と `undefined` は `null`、空文字は空文字」、31 行目と keyvalue\_pipe.ts の 48 行目は「`@for` の例」、keyvalue\_pipe.ts の 41 行目は「文字列のキーは Unicode の値、数のキーは数の大きさで比べる」、case\_conversion\_pipes.ts の 63 行目には「単語は最初の文字か数字から始まり、前の記号はそのまま」、json\_pipe.ts の L35 には「`JSON.stringify` が文字列を返さない値（`undefined`・関数）は `undefined`」を足せます。#72114 は実装の振る舞いで、直すなら `KeyValuePipe.transform` が `compareFn` が `null` のときに Map の並びも比べるようにし、keyvalue\_pipe\_spec.ts の Map の describe（189）に「挿入の順だけ違う Map で並びが変わる」の it を足します。

## 聞かれそうな質問

**Q. `| async` の式を別の Observable に替えた直後、画面には何が出ますか？**

新しい方が値を出すまで `null`（空）です。`_dispose` が `_latestValue` を `null` にするからです（230 行目）。前の Observable の最後の値は残りません。

**Q. Promise を `| async` から外すと、その Promise は止まりますか？**

止まりません。Promise に取り消しは無く、`AsyncPipe` は結果を受け取らないようにするだけです（67〜69・82〜85 行目）。DEMO でも、外したあとの resolve は表示に出ませんでした。

**Q. `{{ undefined | slice: 1 }}` は何を返しますか？**

`null` です。説明文の 27 行目は「blank は blank のまま」と書きますが、実装も spec（48）も `undefined` を `null` にします。

**Q. Map の数のキーを `keyvalue` で並べると、`10` と `9` はどちらが先ですか？**

`9` です。数のキーは数として比べます。Object の `{9: …, 10: …}` ならキーが文字列になるので `'10'` が先です。説明文の「Unicode の値」は文字列のキーにだけ当てはまります。

**Q. `titlecase` で `'(angular)'` はどうなりますか？**

`'(Angular)'` です。単語の始まりは空白の直後ではなく、最初の文字か数字です。

## 読み終えて

- `AsyncPipe` は今の購読の最後の値を返し、切り替えた直後は `null`。Promise は「解除」ではなく結果を無視するだけ。
- 説明文が指す例のファイルの「期待される出力」（slice の 6 つ、titlecase の 6 つ、keyvalue の 3 つ）は全部そのとおり。
- 言い切りの文が実物より広い：`undefined | slice` は `null`、Map の数のキーは数の順、titlecase は記号の後ろも大文字、`json` は文字列にならない値がある。
- 例が `@for` になったのに「ngFor の例」と書いた行が slice と keyvalue に残る。
- `keyvalue: null` は、挿入の順だけが変わった Map では前の順のまま（#72114、22.2.6 でも再現）。

---

← 前: [NgClass・NgStyle と outlet の説明文](06-cmd-attr-outlets.md)  
次: [Location と LocationStrategy の説明文](08-cmd-location.md) →
