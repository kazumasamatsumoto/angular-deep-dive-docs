[目次](../README.md) › [Signal の内側](README.md) › 第 11 回 / 全 18 回

# input と viewChild は何でできているか

> input() は signal にプロパティを 2 つ足しただけ。viewChild() はカウンタを読む computed。どちらも Signal の仕組みを組み替えて作られている。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/authoring)

---

`input()` と `viewChild()` は、v22 で毎日書く API です。この章では、`input()` が **普通の signal のノードに 2 つのプロパティを足しただけ**であること、`viewChild()` が **カウンタ signal を読むだけの computed** であることを、作る関数・値を書き込む関数・結果を返す関数の順に行で確かめます。`input.required()` を早く読んだときの NG0950 と、それをコンパイラが先回りして止める NG8118 も見ます。

読む対象は `packages/core/src/authoring/input/` の `input.ts`・`input_signal.ts`・`input_signal_node.ts`、`authoring/queries.ts`、`render3/queries/query_reactive.ts`・`query.ts`、`render3/instructions/queries_signals.ts`、`linker/query_list.ts` です。コンパイラが `input()` をどう見つけるかは[第 12 回](12-signals-input-compile.md)に任せます。

1. [1. 概観](01-signals.md)
2. [2. ReactiveNode の構造](02-signals-reactive-node.md)
3. [3. 依存の追跡](03-signals-tracking.md)
4. [4. set と update](04-signals-set.md)
5. [5. push と pull](05-signals-push-pull.md)
6. [6. computed](06-signals-computed.md)
7. [7. live と non-live](07-signals-live.md)
8. [8. linkedSignal](08-signals-linked-signal.md)
9. [9. effect のノードと寿命](09-signals-effect-node.md)
10. [10. afterRenderEffect](10-signals-after-render-effect.md)
11. **11. input と viewChild**（この章）
12. [12. input() とコンパイラ](12-signals-input-compile.md)
13. [13. model() と output()](13-signals-model-output.md)
14. [14. toSignal と toObservable](14-signals-rxjs-interop.md)
15. [15. resource](15-resource.md)
16. [16. httpResource と rxResource](16-signals-http-resource.md)
17. [17. Signal Forms](17-signal-forms.md)
18. [18. DevTools と signal グラフ](18-signals-debug.md)

## 1. input() と input.required() の入口

📄 `angular/packages/core/src/authoring/input/input.ts` L21–34 （▶ の行: 25–26, 32–33）

```ts
21 │ export function inputFunction<ReadT, WriteT>(
22 │   initialValue?: ReadT,
23 │   opts?: InputOptions<ReadT, WriteT>,
24 │ ): InputSignalWithTransform<ReadT | undefined, WriteT> {
25 ▶   ngDevMode && assertInInjectionContext(input);
26 ▶   return createInputSignal(initialValue, opts);
27 │ }
28 │ 
29 │ export function inputRequiredFunction<ReadT, WriteT = ReadT>(
30 │   opts?: InputOptions<ReadT, WriteT>,
31 │ ): InputSignalWithTransform<ReadT, WriteT> {
32 ▶   ngDevMode && assertInInjectionContext(input);
33 ▶   return createInputSignal(REQUIRED_UNSET_VALUE as never, opts);
34 │ }
```

入口の関数は 2 つあり、どちらも中身は 2 行です。25 行目と 32 行目は開発モードだけの検査で、注入コンテキストの外で呼ぶと NG0203 になります （中身は [DI シリーズ第 3 回](../di/03-di-injection-context.md)）。26 行目、`input(初期値)` は初期値をそのまま `createInputSignal` に渡します。33 行目、`input.required()` は初期値の代わりに `REQUIRED_UNSET_VALUE` という番兵（「まだ値が無い」を表す特別な値）を渡します。**required と optional の違いは、最初に入る値が番兵かどうかだけ**です。

📄 `angular/packages/core/src/authoring/input/input.ts` L171–177 （▶ の行: 175–176）

```ts
171 │ export const input: InputFunction = (() => {
172 │   // Note: This may be considered a side-effect, but nothing will depend on
173 │   // this assignment, unless this `input` constant export is accessed. It's a
174 │   // self-contained side effect that is local to the user facing`input` export.
175 ▶   (inputFunction as any).required = inputRequiredFunction;
176 ▶   return inputFunction as typeof inputFunction & {required: typeof inputRequiredFunction};
177 │ })();
```

175 行目。`input.required` は、関数 `inputFunction` に `required` というプロパティを後から生やしたものです。関数オブジェクトにプロパティを足すのは JavaScript では普通のことで、`viewChild.required` や `model.required` も同じ作りです（4 節の queries.ts）。

## 2. createInputSignal：ノードを 1 つ作り、getter に付ける

📄 `angular/packages/core/src/authoring/input/input_signal.ts` L115–151 （▶ の行: 119, 121, 125, 129, 131, 133–134, 137, 140, 143, 146–147）

```ts
115 │ export function createInputSignal<T, TransformT>(
116 │   initialValue: T,
117 │   options?: InputOptions<T, TransformT>,
118 │ ): InputSignalWithTransform<T, TransformT> {
119 ▶   const node: InputSignalNode<T, TransformT> = Object.create(INPUT_SIGNAL_NODE);
120 │ 
121 ▶   node.value = initialValue;
122 │ 
123 │   // Perf note: Always set `transformFn` here to ensure that `node` always
124 │   // has the same v8 class shape, allowing monomorphic reads on input signals.
125 ▶   node.transformFn = options?.transform;
126 │ 
127 │   function inputValueFn() {
128 │     // Record that someone looked at this signal.
129 ▶     producerAccessed(node);
130 │ 
131 ▶     if (node.value === REQUIRED_UNSET_VALUE) {
132 │       let message: string | null = null;
133 ▶       if (ngDevMode) {
134 ▶         const name = options?.debugName ?? options?.alias;
135 │         message = `Input${name ? ` "${name}"` : ''} is required but no value is available yet.`;
136 │       }
137 ▶       throw new RuntimeError(RuntimeErrorCode.REQUIRED_INPUT_NO_VALUE, message);
138 │     }
139 │ 
140 ▶     return node.value;
141 │   }
142 │ 
143 ▶   (inputValueFn as any)[SIGNAL] = node;
144 │ 
145 │   if (ngDevMode) {
146 ▶     inputValueFn.toString = () => `[Input Signal: ${inputValueFn()}]`;
147 ▶     node.debugName = options?.debugName;
148 │   }
149 │ 
150 │   return inputValueFn as InputSignalWithTransform<T, TransformT>;
151 │ }
```

1. **119 行目：`Object.create(INPUT_SIGNAL_NODE)`**

   ノードの「型紙」`INPUT_SIGNAL_NODE` をプロトタイプにした空オブジェクトを作ります。普通の `signal()` が `Object.create(SIGNAL_NODE)` で作るのと同じ手順です（[第 2 回](02-signals-reactive-node.md)）。
2. **121・125 行目：値と transformFn を入れる**

   121 行目で初期値（required なら番兵）を入れます。125 行目で `transform` を、**指定が無くても `undefined` として必ず代入**します。123〜124 行目のコメントのとおり、すべての input ノードが同じプロパティを同じ順で持つようにして、V8（Chrome の JavaScript エンジン）が読み取りを 1 種類の形として最適化できるようにするためです。
3. **127〜141 行目：読むときの関数 `inputValueFn`**

   129 行目の `producerAccessed(node)` で「誰がこの input を読んだか」を記録します（[第 3 回](03-signals-tracking.md)）。131 行目で値が番兵なら、137 行目で `RuntimeError(REQUIRED_INPUT_NO_VALUE)` を投げます。134 行目、開発モードのメッセージに出る名前は `debugName`、無ければ `alias` です。番兵でなければ 140 行目で値を返すだけです。
4. **143 行目：getter に `[SIGNAL]` を付ける**

   この 1 行で、`inputValueFn` は Angular から見て「signal」になります。`isSignal()` や、ランタイムが input にノード経由で書き込む処理（3 節）は、このシンボルでノードを取り出します。
5. **145〜148 行目：開発モードだけの飾り**

   146 行目で `String(input)` が `[Input Signal: 値]` になり、147 行目で `debugName` がノードに入ります。本番ビルドではこの if ごと消えます（[第 18 回](18-signals-debug.md)）。

注意してほしいのは、**`set` も `update` も付けていない**ことです。利用者から見ると `InputSignal` は読み取り専用で、書けるのは Angular のランタイムだけです。では、ランタイムはどうやって書くのでしょうか。

## 3. INPUT\_SIGNAL\_NODE：SIGNAL\_NODE + 2 つ

📄 `angular/packages/core/src/authoring/input/input_signal_node.ts` L9–22 （▶ の行: 11, 17, 22）

```ts
 9 │ import {SIGNAL_NODE, SignalNode, signalSetFn} from '../../../primitives/signals';
10 │ 
11 ▶ export const REQUIRED_UNSET_VALUE: unique symbol = /* @__PURE__ */ Symbol('InputSignalNode#UNSET');
12 │ 
13 │ /**
14 │  * Reactive node type for an input signal. An input signal extends a signal.
15 │  * There are special properties to enable transforms and required inputs.
16 │  */
17 ▶ export interface InputSignalNode<T, TransformT> extends SignalNode<T> {
18 │   /**
19 │    * User-configured transform that will run whenever a new value is applied
20 │    * to the input signal node.
21 │    */
22 ▶   transformFn: ((value: TransformT) => T) | undefined;
```

11 行目が番兵です。`Symbol(...)` はほかのどの値とも `===` にならないので、「親が `undefined` を渡した」と「まだ何も渡されていない」を区別できます。17 行目、`InputSignalNode` は `SignalNode` を継承した型で、22 行目の `transformFn` が足されています。

📄 `angular/packages/core/src/authoring/input/input_signal_node.ts` L40–51 （▶ の行: 44–45, 47–48）

```ts
40 │ // Note: Using an IIFE here to ensure that the spread assignment is not considered
41 │ // a side-effect, ending up preserving `COMPUTED_NODE` and `REACTIVE_NODE`.
42 │ export const INPUT_SIGNAL_NODE: InputSignalNode<unknown, unknown> = /* @__PURE__ */ (() => {
43 │   return {
44 ▶     ...SIGNAL_NODE,
45 ▶     transformFn: undefined,
46 │ 
47 ▶     applyValueToInputSignal<T, TransformT>(node: InputSignalNode<T, TransformT>, value: T) {
48 ▶       signalSetFn(node, value);
49 │     },
50 │   };
51 │ })();
```

44 行目、`...SIGNAL_NODE` で普通の signal の型紙を**そのまま展開**し、45 行目の `transformFn` と 47 行目の `applyValueToInputSignal` の 2 つを足しています。48 行目、値の適用は `signalSetFn(node, value)` を呼ぶだけ。**親からの入力は、普通の signal に `set()` するのと同じ関数を通ります**。同じ値なら何もしない、違えば version を上げて consumer に dirty を伝える、という手順は [第 4 回](04-signals-set.md)で読んだとおりです。だから `computed` も `effect` もテンプレートも、input の変化にそのまま反応します。

> [!NOTE]
> **ポイント**
>
> テンプレートの `[flag]="..."` から `applyValueToInputSignal` までの道（`ɵɵproperty` → `writeToDirectiveInput`）と、`transformFn` がどこで呼ばれるかは [第 12 回](12-signals-input-compile.md)で行を追います。ここでは「書き込む直前に `transformFn` を通し、通した値を `signalSetFn` に渡す」とだけ覚えてください。

> **🧪 DEMO 1 — transform: booleanAttribute の input に文字列を渡す**
>
> 子は `flag = input(false, { transform: booleanAttribute })`。親は文字列を `[flag]` に渡します。`booleanAttribute` は `'false'` と `null`/`undefined` 以外を `true` にする関数です（core/src/util/coercion.ts）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/authoring)

## 4. required を早く読むと NG0950、コンパイラは NG8118

📄 `angular/packages/core/src/errors.ts` L140–147 （▶ の行: 142–144）

```ts
140 │   VIEW_DESTROYED_MOVE_ERROR = 923,
141 │   // Signal integration errors
142 ▶   REQUIRED_INPUT_NO_VALUE = -950,
143 ▶   REQUIRED_QUERY_NO_VALUE = -951,
144 ▶   REQUIRED_MODEL_NO_VALUE = 952,
145 │ 
146 │   // Output()
147 │   OUTPUT_REF_DESTROYED = 953,
```

142 行目、2 節 137 行目のコードは `-950` です。画面に出る文字列は「`NG0` + 絶対値」の `NG0950` で、マイナスは「エラー詳細ページへのリンクを付ける」印です （整形関数 `formatRuntimeError` は [DI シリーズ第 8 回](../di/08-di-r3-injector-get.md)で読んでいます）。143 行目の `-951` は `viewChild.required`、144 行目の `952` は `model.required` 用です。

いつ「早すぎる」のかを考えます。ディレクティブのインスタンスは作成パスで作られ、親のバインディングが input に書き込まれるのは更新パスです （[Ivy シリーズのディレクティブの章](../ivy/14-ivy-directives.md)）。つまり**コンストラクタとフィールド初期化子の中では、required input はまだ番兵のまま**です。これは書けば必ず NG0950 になるので、コンパイラが先に止めます。

📄 `angular/packages/compiler-cli/src/ngtsc/validation/src/rules/forbidden_required_initializer_invocation_rule.ts` L63–102 （▶ の行: 66, 70, 72–74, 76–77, 79, 88, 99, 101）

```ts
 63 │       const initiallizerExpr = decl.initializer;
 64 │       if (!initiallizerExpr) continue;
 65 │ 
 66 ▶       checkForbiddenInvocation(initiallizerExpr);
 67 │     }
 68 │ 
 69 │     function checkForbiddenInvocation(node: ts.Node): boolean | undefined {
 70 ▶       if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
 71 │ 
 72 ▶       if (
 73 ▶         ts.isPropertyAccessExpression(node) &&
 74 ▶         node.expression.kind === ts.SyntaxKind.ThisKeyword &&
 75 │         // With the following we make sure we only flag invoked required initializers
 76 ▶         ts.isCallExpression(node.parent) &&
 77 ▶         node.parent.expression === node
 78 │       ) {
 79 ▶         const requiredProp = requiredInitializerDeclarations.find(
 80 │           (prop) => prop.name.getText() === node.name.getText(),
 81 │         );
 82 │         if (requiredProp) {
 83 │           const initializerFn = (
 84 │             requiredProp.initializer.expression as ts.PropertyAccessExpression
 85 │           ).expression.getText();
 86 │           diagnostics.push(
 87 │             makeDiagnostic(
 88 ▶               ErrorCode.FORBIDDEN_REQUIRED_INITIALIZER_INVOCATION,
 89 │               node,
 90 │               `\`${node.name.getText()}\` is a required \`${initializerFn}\` and does not have a value in this context.`,
 91 │             ),
 92 │           );
 93 │         }
 94 │       }
 95 │ 
 96 │       return node.forEachChild(checkForbiddenInvocation);
 97 │     }
 98 │ 
 99 ▶     const ctor = getConstructorFromClass(node);
100 │     if (ctor) {
101 ▶       checkForbiddenInvocation(ctor);
102 │     }
```

ngtsc の検査 `ForbiddenRequiredInitializersInvocationRule` です。66 行目でフィールドの初期化子を、99〜101 行目でコンストラクタの本体を調べます。72〜77 行目の条件は「`this.○○` を、その場で関数として呼んでいる」。79 行目で ○○ が `input.required` / `model.required` / required のクエリで宣言されたフィールドなら、88 行目の `FORBIDDEN_REQUIRED_INITIALIZER_INVOCATION`（NG8118）を出します。

70 行目で、**アロー関数と関数式の中には入りません**。`computed(() => this.name())` のように「あとで呼ばれる関数」は正しい書き方だからです。逆に言えば、この検査は構文の形だけを見ています。`const read = this.label; read();` のように一度変数に取り出すと、72〜77 行目の形に当たらず、実行時の NG0950 まで届きます。下のデモはその書き方で、実際に投げられたエラーを捕まえて表示します。

> **🧪 DEMO 2 — input.required をコンストラクタで読む**
>
> 子は `label = input.required<string>()`。コンストラクタの中で `const read = this.label; read()` を try/catch し、結果をテンプレートに出します。親は `[label]="'hello'"` を渡しています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/authoring)

開発ビルドでは `code = -950` と `NG0950: Input "label" is required but no value is available yet. Find more at …` が出ます。名前の `"label"` は、利用者が `debugName` を書いていないのに出ています。コンパイラが開発ビルド用に `debugName: "label"` を足しているからで、その変換は[第 18 回](18-signals-debug.md)で読みます。本番ビルドでは 133 行目の `ngDevMode` が偽なのでメッセージは `NG0950` だけになります。同じ子のテンプレートでは、更新パスのあとに読むので `'hello'` が読めています。

## 5. viewChild()：locator を受け取るが使わない

📄 `angular/packages/core/src/authoring/queries.ts` L18–32 （▶ の行: 19, 23, 31）

```ts
18 │ function viewChildFn<LocatorT, ReadT>(
19 ▶   locator: ProviderToken<LocatorT> | string,
20 │   opts?: {read?: ProviderToken<ReadT>; debugName?: string},
21 │ ): Signal<ReadT | undefined> {
22 │   ngDevMode && assertInInjectionContext(viewChild);
23 ▶   return createSingleResultOptionalQuerySignalFn<ReadT>(opts);
24 │ }
25 │ 
26 │ function viewChildRequiredFn<LocatorT, ReadT>(
27 │   locator: ProviderToken<LocatorT> | string,
28 │   opts?: {read?: ProviderToken<ReadT>; debugName?: string},
29 │ ): Signal<ReadT> {
30 │   ngDevMode && assertInInjectionContext(viewChild);
31 ▶   return createSingleResultRequiredQuerySignalFn<ReadT>(opts);
32 │ }
```

19 行目で `locator`（`'box'` や `MyComponent` など、探す相手）を受け取りますが、23 行目・31 行目では **`opts` しか渡していません**。実行時の `viewChild()` は「空のクエリ用 signal を作る」だけで、何を探すかは知りません。探す相手は、コンパイラがクラスの静的な関数に書き出します。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/signal_queries/query_in_component.ts` L6–11 （▶ の行: 7）

```ts
 6 │ export class TestComp {
 7 ▶   query1 = viewChild('locatorA');
 8 │   query2 = viewChildren('locatorB');
 9 │   query3 = contentChild('locatorC');
10 │   query4 = contentChildren('locatorD');
11 │ }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/signal_queries/query_in_component.js` L1–21 （▶ の行: 12, 14）

```js
 1 │ export class TestComp {
 2 │   …
 3 │   static ɵcmp = /*@__PURE__*/ $r3$.ɵɵdefineComponent({
 4 │     …
 5 │     contentQueries: function TestComp_ContentQueries(rf, ctx, dirIndex) {
 6 │         if (rf & 1) {
 7 │             $r3$.ɵɵcontentQuerySignal(dirIndex, ctx.query3, _c0, 5)(dirIndex, ctx.query4, _c1, 4);
 8 │         } if (rf & 2) {
 9 │             $r3$.ɵɵqueryAdvance(2);
10 │         }
11 │     },
12 ▶     viewQuery: function TestComp_Query(rf, ctx) {
13 │         if (rf & 1) {
14 ▶             $r3$.ɵɵviewQuerySignal(ctx.query1, _c2, 5)(ctx.query2, _c3, 5);
15 │         } if (rf & 2) {
16 │             $r3$.ɵɵqueryAdvance(2);
17 │         }
18 │     },
19 │     …
20 │   });
21 │ }
```
*compliance fixture の期待出力（部分一致で比較され、… は省略を表す）*

7 行目の `viewChild('locatorA')` は、14 行目の `ɵɵviewQuerySignal(ctx.query1, _c2, 5)` になります。`_c2` が locator（`['locatorA']` の定数）、`5` はフラグ、`ctx.query1` が 5 節冒頭で作られた signal です。この `viewQuery` 関数はビューの作成パスで呼ばれます。

📄 `angular/packages/core/src/render3/instructions/queries_signals.ts` L48–56 （▶ の行: 54）

```ts
48 │ export function ɵɵviewQuerySignal(
49 │   target: Signal<unknown>,
50 │   predicate: ProviderToken<unknown> | string[] | string,
51 │   flags: number,
52 │   read?: ProviderToken<unknown>,
53 │ ): typeof ɵɵviewQuerySignal {
54 ▶   bindQueryToSignal(target, createViewQuery(predicate, flags, read));
55 │   return ɵɵviewQuerySignal;
56 │ }
```

54 行目、`createViewQuery` でクエリの実体（`LQuery` と `QueryList`）を作り、その番号を signal に結びつけます。

## 6. クエリは computed そのもの

📄 `angular/packages/core/src/render3/queries/query_reactive.ts` L43–79 （▶ の行: 49–52, 56, 58, 60–62, 69–70）

```ts
43 │ function createQuerySignalFn<V>(
44 │   firstOnly: boolean,
45 │   required: boolean,
46 │   opts?: {debugName?: string},
47 │ ) {
48 │   let node: QuerySignalNode<V>;
49 ▶   const signalFn = createComputed(() => {
50 ▶     // A dedicated signal that increments its value every time a query changes its dirty status. By
51 ▶     // using this signal we can implement a query as computed and avoid creation of a specialized
52 ▶     // reactive node type. Please note that a query gets marked dirty under the following
53 │     // circumstances:
54 │     // - a view (where a query is active) finished its first creation pass;
55 │     // - a new view is inserted / deleted and it impacts query results.
56 ▶     node._dirtyCounter();
57 │ 
58 ▶     const value = refreshSignalQuery<V>(node, firstOnly);
59 │ 
60 ▶     if (required && value === undefined) {
61 ▶       throw new RuntimeError(
62 ▶         RuntimeErrorCode.REQUIRED_QUERY_NO_VALUE,
63 │         ngDevMode && 'Child query result is required but no value is available.',
64 │       );
65 │     }
66 │ 
67 │     return value;
68 │   });
69 ▶   node = signalFn[SIGNAL] as QuerySignalNode<V>;
70 ▶   node._dirtyCounter = signal(0);
71 │   node._flatValue = undefined;
72 │ 
73 │   if (ngDevMode) {
74 │     signalFn.toString = () => `[Query Signal]`;
75 │     node.debugName = opts?.debugName;
76 │   }
77 │ 
78 │   return signalFn;
79 │ }
```

49 行目、`createComputed(...)`。**クエリ用の新しいノード型は無く、computed をそのまま使います**。50〜52 行目のコメントが設計を説明しています。「dirty 状態が変わるたびに値を増やす専用の signal を使うことで、クエリを computed として実装でき、専用のリアクティブノード型を作らずに済む」。

1. **70 行目：カウンタ signal を作る**

   computed のノードに `_dirtyCounter = signal(0)` をぶら下げます。
2. **56 行目：読むだけで依存になる**

   computed の計算の最初にカウンタを読みます。値は使いません。読んだことで、カウンタが computed の producer として記録されます。カウンタが増えれば、この computed は「再計算が要る」状態になります（[第 6 回](06-signals-computed.md)）。
3. **58 行目：結果を集める**

   7 節の `refreshSignalQuery` が、その時点の `QueryList` から結果を取り出します。
4. **60〜64 行目：required で結果が無ければ NG0951**

   `viewChild.required()` は、結果が `undefined` のときにここで投げます。

では、誰がカウンタを増やすのでしょうか。

📄 `angular/packages/core/src/render3/queries/query_reactive.ts` L103–109 （▶ の行: 105–108）

```ts
103 │ export function bindQueryToSignal(target: Signal<unknown>, queryIndex: number): void {
104 │   const node = target[SIGNAL] as QuerySignalNode<unknown>;
105 ▶   node._lView = getLView();
106 ▶   node._queryIndex = queryIndex;
107 ▶   node._queryList = loadQueryInternal(node._lView, queryIndex);
108 ▶   node._queryList.onDirty(() => node._dirtyCounter.update((v) => v + 1));
109 │ }
```

105〜107 行目で、5 節の `ɵɵviewQuerySignal` から呼ばれたときの LView・クエリ番号・`QueryList` をノードに覚えます。108 行目、`QueryList` が dirty になったらカウンタを 1 増やす、というコールバックを登録します。

📄 `angular/packages/core/src/linker/query_list.ts` L170–179 （▶ の行: 176–178）

```ts
170 │   /** @internal */
171 │   onDirty(cb: () => void) {
172 │     this._onDirty = cb;
173 │   }
174 │ 
175 │   /** internal */
176 ▶   setDirty() {
177 ▶     (this as {dirty: boolean}).dirty = true;
178 ▶     this._onDirty?.();
179 │   }
```

📄 `angular/packages/core/src/render3/queries/query.ts` L74–92 （▶ の行: 74, 78, 82, 88–89）

```ts
74 ▶   insertView(tView: TView): void {
75 │     this.dirtyQueriesWithMatches(tView);
76 │   }
77 │ 
78 ▶   detachView(tView: TView): void {
79 │     this.dirtyQueriesWithMatches(tView);
80 │   }
81 │ 
82 ▶   finishViewCreation(tView: TView): void {
83 │     this.dirtyQueriesWithMatches(tView);
84 │   }
85 │ 
86 │   private dirtyQueriesWithMatches(tView: TView) {
87 │     for (let i = 0; i < this.queries.length; i++) {
88 ▶       if (getTQuery(tView, i).matches !== null) {
89 ▶         this.queries[i].setDirty();
90 │       }
91 │     }
92 │   }
```

`setDirty()` の 178 行目が、108 行目で登録したコールバックを呼びます。`setDirty()` を呼ぶのは `LQueries_` の 3 つのメソッドです。74 行目 `insertView`（埋め込みビューが LContainer に入った）、78 行目 `detachView`（出ていった）、82 行目 `finishViewCreation`（ビューの作成パスが終わった）。どれも 88〜89 行目で、そのビューの中に一致したノードがあるクエリだけを dirty にします。`@if` が中身を出したり消したりすると `insertView` / `detachView` が呼ばれるので、**viewChild の signal は `@if` の出入りに合わせて変わります**。

## 7. refreshSignalQuery：作成中は空を返す

📄 `angular/packages/core/src/render3/queries/query_reactive.ts` L111–146 （▶ の行: 115, 118, 122, 126–127, 133, 136, 140–142, 144）

```ts
111 │ function refreshSignalQuery<V>(node: QuerySignalNode<V>, firstOnly: boolean): V | ReadonlyArray<V> {
112 │   const lView = node._lView;
113 │   const queryIndex = node._queryIndex;
114 │ 
115 ▶   // There are 2 conditions under which we want to return "empty" results instead of the ones
116 │   // collected by a query:
117 │   //
118 ▶   // 1) a given query wasn't created yet (this is a period of time between the directive creation
119 │   // and execution of the query creation function) - in this case a query doesn't exist yet and we
120 │   // don't have any results to return.
121 │   //
122 ▶   // 2) we are in the process of constructing a view (the first
123 │   // creation pass didn't finish) and a query might have partial results, but we don't want to
124 │   // return those - instead we do delay results collection until all nodes had a chance of matching
125 │   // and we can present consistent, "atomic" (on a view level) results.
126 ▶   if (lView === undefined || queryIndex === undefined || lView[FLAGS] & LViewFlags.CreationMode) {
127 ▶     return (firstOnly ? undefined : EMPTY_ARRAY) as V;
128 │   }
129 │ 
130 │   const queryList = loadQueryInternal<V>(lView, queryIndex);
131 │   const results = getQueryResults<V>(lView, queryIndex);
132 │ 
133 ▶   queryList.reset(results, unwrapElementRef);
134 │ 
135 │   if (firstOnly) {
136 ▶     return queryList.first;
137 │   } else {
138 │     // TODO: remove access to the private _changesDetected field by abstracting / removing usage of
139 │     // QueryList in the signal-based queries (perf follow-up)
140 ▶     const resultChanged = (queryList as any as {_changesDetected: boolean})._changesDetected;
141 ▶     if (resultChanged || node._flatValue === undefined) {
142 ▶       return (node._flatValue = queryList.toArray());
143 │     }
144 ▶     return node._flatValue;
145 │   }
146 │ }
```

126 行目、次のどれかなら 127 行目で空（単数なら `undefined`、複数なら空配列）を返します。

- `lView` / `queryIndex` が未設定：118〜120 行目、ディレクティブは作られたが `ɵɵviewQuerySignal` がまだ呼ばれていない
- `LViewFlags.CreationMode` が立っている：122〜125 行目、ビューの作成パスの途中。途中までの結果は返さず、ビュー単位でそろった結果だけを見せる

それ以外なら 133 行目で `QueryList` を最新の結果に入れ替え、単数なら 136 行目で先頭を返します。複数（`viewChildren`）のときは 140〜144 行目、`QueryList` の中身が変わったときだけ新しい配列を作り、変わっていなければ前回の配列（`_flatValue`）を返します。同じ配列が返れば computed の等価判定で「変化なし」になり、下流の再計算を止められます。

> **🧪 DEMO 3 — viewChild('box') が @if の出入りを追う**
>
> 章コンポーネントに `box = viewChild<ElementRef>('box')` があり、下の `@if` の中に `<span #box>` があります。`effect` が `box()` を読み、値が変わるたびに 1 行足します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/authoring)

## 8. @ViewChild との違いは「代入される」か「読むと計算される」か

|   | @ViewChild（従来） | viewChild()（Signal） |
| --- | --- | --- |
| 値が入る仕組み | 変更検知の中で Angular がフィールドに代入する | 読んだときに computed が `refreshSignalQuery` を呼ぶ（6・7 節） |
| いつ読めるか | 代入のあと（`ngAfterViewInit` を待つ） | いつでも。まだ結果が無ければ `undefined`（7 節 127 行目） |
| 変化への追従 | `QueryList.changes` を購読する | `insertView` / `detachView` → カウンタ +1 → computed が dirty（6 節） |

## ここまでの呼び出し

- 👤 `label = input.required<string>()` — あなたのコンポーネント
  - `inputRequiredFunction()` — authoring/input/input.ts L29 — *番兵 REQUIRED\_UNSET\_VALUE を初期値に*
    - `createInputSignal(REQUIRED_UNSET_VALUE)` — input\_signal.ts L115 — *Object.create(INPUT\_SIGNAL\_NODE)、getter\[SIGNAL\] = node*
  - `ɵɵproperty('label', ...)` → `writeToDirectiveInput` — render3/instructions/write\_to\_directive\_input.ts L18 — *transformFn を通す（第 12 回）*
    - `node.applyValueToInputSignal(node, value)` — input\_signal\_node.ts L47
      - `signalSetFn(node, value)` — primitives/signals/src/signal.ts — *普通の set と同じ（第 4 回）*
- 👤 `box = viewChild<ElementRef>('box')` — あなたのコンポーネント
  - `createQuerySignalFn(true, false)` — render3/queries/query\_reactive.ts L43 — *createComputed + \_dirtyCounter = signal(0)*
  - `viewQuery` → `ɵɵviewQuerySignal(ctx.box, _c0, 5)` — instructions/queries\_signals.ts L48
    - `bindQueryToSignal(target, index)` — query\_reactive.ts L103 — *queryList.onDirty(() =&gt; counter + 1)*
  - `@if` が true → `lQueries.insertView(tView)` — render3/view/container.ts L223
    - `QueryList.setDirty()` → `_dirtyCounter.update(v => v + 1)` — linker/query\_list.ts L176
- 👤 `box()` — あなたのコード
  - `refreshSignalQuery(node, true)` — query\_reactive.ts L111 — *CreationMode なら undefined、そうでなければ queryList.first*

## 聞かれそうな質問

**Q. input() は普通の signal と何が違うのですか？**

ノードは `...SIGNAL_NODE` を展開したもので（input\_signal\_node.ts 44 行目）、足されたのは `transformFn`（45 行目）と `applyValueToInputSignal`（47 行目）の 2 つだけです。書き込みは 48 行目で `signalSetFn` を呼ぶので、普通の `set()` と同じ手順です。違うのは getter に `set` / `update` を付けていないこと（input\_signal.ts 143 行目で `[SIGNAL]` だけ付ける）で、利用者からは書けません。

**Q. input.required をコンストラクタで読むとどうなりますか？**

`this.x()` と直接書くと、コンパイル時に NG8118 で止まります（forbidden\_required\_initializer\_invocation\_rule.ts 72〜91 行目）。変数に取り出してから呼ぶなどで検査をすり抜けると、実行時に input\_signal.ts 131 行目で番兵を見つけ、137 行目で NG0950 を投げます。親の値が入るのは更新パスなので、`ngOnInit` 以降、`computed` / `effect` の中、テンプレートで読みます。

**Q. transform はいつ実行されますか？読むたびですか？**

書き込むたびに 1 回です。ノードには `transformFn` が入るだけで（input\_signal.ts 125 行目）、読む関数 `inputValueFn`（127〜141 行目）は呼びません。呼ぶのは書き込み側の `writeToDirectiveInput` で、変換後の値が `signalSetFn` に渡ります（行は第 12 回）。

**Q. viewChild() を ngAfterViewInit より前に読んでもいいのですか？**

読めます。エラーにはならず、まだ結果が無ければ `undefined`（`viewChildren` なら空配列）が返ります。`ɵɵviewQuerySignal` 前やビュー作成中は query\_reactive.ts 126〜127 行目で空を返すからです。`viewChild.required()` だけは、その時点で `undefined` なら 60〜64 行目で NG0951 を投げます。

**Q. viewChild の signal はいつ変わりますか？**

クエリに一致するノードを持つビューが作成を終えたとき・LContainer に入ったとき・出たときです（query.ts 74〜91 行目）。そのとき `QueryList.setDirty()`（query\_list.ts 176〜178 行目）が `_dirtyCounter` を 1 増やし（query\_reactive.ts 108 行目）、カウンタを読んでいた computed（56 行目）が再計算待ちになります。

## 読み終えて

- `input()` と `input.required()` の違いは初期値が番兵 `REQUIRED_UNSET_VALUE` かどうかだけ
- input のノードは `SIGNAL_NODE` + `transformFn` + `applyValueToInputSignal`。書き込みは `signalSetFn`
- required を早く読むと実行時は NG0950。直接 `this.x()` と書けばコンパイラが NG8118 で先に止める
- `viewChild()` は locator を使わず、カウンタを読む computed を作るだけ。何を探すかはコンパイラが `ɵɵviewQuerySignal` に渡す
- ビューの出入りで `QueryList.setDirty()` → カウンタ +1 → computed が dirty。作成中は空を返す

---

← 前: [afterRenderEffect：4 つのフェーズを signal でつなぐ](10-signals-after-render-effect.md)  
次: [input() はコンパイラにどう見えるか：初期化子 API の検出から InputFlags.SignalBased まで](12-signals-input-compile.md) →
