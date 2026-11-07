[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 11 回 / 全 20 回

# 出力とイベント：$event の型

> TcbDirectiveOutputsOp と TcbUnclaimedOutputsOp が (event) を subscribe や addEventListener の呼び出しとして書き、$event に型を付ける行。output() と EventEmitter、DOM イベントの型（checkTypeOfDomEvents）、keyup.enter のような修飾付きのイベントの型、アニメーションのイベント。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-outputs-events)

---

`(removed)="onRemove($event)"` の `$event` に型が付くのは、TCB がこのバインディングを `_t1["removed"].subscribe(($event) => ...)` と書き、TypeScript にコールバックの引数の型を推論させているからです。この章では、ディレクティブの出力を書く `TcbDirectiveOutputsOp` と、どのディレクティブにも当たらなかったイベントを書く `TcbUnclaimedOutputsOp` を 1 行ずつ読み、`$event` の型がどこから来るかを、出力・DOM イベント・`window:`・`keyup.enter`・アニメーションの順に確かめます。

読む対象は compiler の `typecheck/ops/events.ts`、core の `event_emitter.ts`（`EventEmitter` の `subscribe` の型）、テストは `type_check_block_spec.ts` です。

1. [1. 全体像](01-typecheck-overview.md)
2. [2. 設定](02-typecheck-config.md)
3. [3. TCB の置き場所](03-typecheck-context.md)
4. [4. 派生プログラム](04-typecheck-program-driver.md)
5. [5. Environment](05-typecheck-environment.md)
6. [6. Scope と TcbOp](06-typecheck-scope.md)
7. [7. 式](07-typecheck-expressions.md)
8. [8. 要素と DOM](08-typecheck-elements-dom.md)
9. [9. 型コンストラクタ](09-typecheck-type-constructor.md)
10. [10. 入力](10-typecheck-inputs.md)
11. **11. 出力とイベント**（この章）
12. [12. 双方向](12-typecheck-two-way.md)
13. [13. 制御フロー](13-typecheck-control-flow.md)
14. [14. ng-template のガード](14-typecheck-template-guards.md)
15. [15. 参照と pipe](15-typecheck-refs-pipes.md)
16. [16. 診断の対応付け](16-typecheck-diagnostics-mapping.md)
17. [17. 帯域外の診断](17-typecheck-oob.md)
18. [18. 拡張診断](18-typecheck-extended.md)
19. [19. TemplateTypeChecker](19-typecheck-template-type-checker.md)
20. [20. issue と PR を読む](20-typecheck-issues.md)

> [!NOTE]
> **ポイント**
>
> ハンドラのアロー関数を作る events.ts の `tcbCreateEventHandler` と、`input` 要素に足す `ɵassertType` と `addEventListener` の呼び出しを作る行は[テンプレートコンパイラ第 17 回](../compiler/17-compiler-typecheck.md)で引用しました。要素ごとにどの op を積むか（`appendOutputsOfElementLikeNode`）は[第 8 回](08-typecheck-elements-dom.md)です。ここでは 2 つの op の本体を読みます。

## 1. $event の型の決め方は 3 通り

📄 `angular/packages/compiler/src/typecheck/ops/events.ts` L22–40 （▶ の行: 22, 26, 29, 37–38）

```ts
22 ▶ const EVENT_PARAMETER = '$event';
23 │ 
24 │ const enum EventParamType {
25 │   /* Generates code to infer the type of `$event` based on how the listener is registered. */
26 ▶   Infer,
27 │ 
28 │   /* Declares the type of the `$event` parameter as `any`. */
29 ▶   Any,
30 │ }
31 │ 
32 │ /**
33 │  * Similar to `tcbExpression`, this function converts the provided `AST` expression into a
34 │  * `ts.Expression`, with special handling of the `$event` variable that can be used within event
35 │  * bindings.
36 │  */
37 ▶ function tcbEventHandlerExpression(ast: AST, tcb: Context, scope: Scope): TcbExpr {
38 ▶   const translator = new TcbEventHandlerTranslator(tcb, scope);
39 │   return translator.translate(ast);
40 │ }
```

ハンドラは `($event): any => { ... }` というアロー関数になり、`$event` の引数の型の書き方が 3 通りあります。26 行目の `Infer` は型を書かない（関数を渡す先の型から TypeScript に推論させる）、29 行目の `Any` は `$event: any`、そして文字列を渡すとその型をそのまま書きます（`$event: i0.AnimationEvent`）。この章の op は、バインディングごとにこの 3 つのどれかを選びます。37〜38 行目の `tcbEventHandlerExpression` は、ハンドラの式を 6 節の翻訳器で TCB の式にします。

## 2. TcbDirectiveOutputsOp：出力は subscribe の呼び出し

📄 `angular/packages/compiler/src/typecheck/ops/events.ts` L60–75 （▶ の行: 60–61, 66, 68, 70–71, 73）

```ts
60 ▶   override get optional() {
61 ▶     return false;
62 │   }
63 │ 
64 │   override execute(): null {
65 │     let dirId: TcbExpr | null = null;
66 ▶     const outputs = this.dir.outputs;
67 │ 
68 ▶     for (const output of this.outputs) {
69 │       if (
70 ▶         output.type === ParsedEventType.LegacyAnimation ||
71 ▶         !outputs.hasBindingPropertyName(output.name)
72 │       ) {
73 ▶         continue;
74 │       }
75 │ 
```

60〜62 行目、optional ではありません（必ず実行される）。68 行目で要素のイベントのバインディングを全部回し、70〜71 行目で `@trigger` の旧アニメーションと、このディレクティブの出力でないものを飛ばします（それは 4 節の op が拾う）。この引用と次の引用のあいだの行は双方向の `xxxChange` の検査で、[第 12 回](12-typecheck-two-way.md)で読みます。

📄 `angular/packages/compiler/src/typecheck/ops/events.ts` L84–115 （▶ の行: 84–85, 88, 90–91, 93, 97–99, 104–106, 108–110）

```ts
 84 ▶       // TODO(alxhub): consider supporting multiple fields with the same property name for outputs.
 85 ▶       const field = outputs.getByBindingPropertyName(output.name)![0].classPropertyName;
 86 │ 
 87 │       if (dirId === null) {
 88 ▶         dirId = this.scope.resolve(this.node, this.dir);
 89 │       }
 90 ▶       const outputField = new TcbExpr(`${dirId.print()}[${TcbExpr.quoteAndEscape(field)}]`);
 91 ▶       outputField.addParseSpanInfo(output.keySpan);
 92 │ 
 93 ▶       if (this.tcb.env.config.checkTypeOfOutputEvents) {
 94 │         // For strict checking of directive events, generate a call to the `subscribe` method
 95 │         // on the directive's output field to let type information flow into the handler function's
 96 │         // `$event` parameter.
 97 ▶         const handler = tcbCreateEventHandler(output, this.tcb, this.scope, EventParamType.Infer);
 98 ▶         const call = new TcbExpr(`${outputField.print()}.subscribe(${handler.print()})`);
 99 ▶         call.addParseSpanInfo(output.sourceSpan);
100 │         this.scope.addStatement(call);
101 │       } else {
102 │         // If strict checking of directive events is disabled:
103 │         //
104 ▶         // * We still generate the access to the output field as a statement in the TCB so consumers
105 ▶         //   of the `TemplateTypeChecker` can still find the node for the class member for the
106 ▶         //   output.
107 │         // * Emit a handler function where the `$event` parameter has an explicit `any` type.
108 ▶         this.scope.addStatement(outputField);
109 ▶         const handler = tcbCreateEventHandler(output, this.tcb, this.scope, EventParamType.Any);
110 ▶         this.scope.addStatement(handler);
111 │       }
112 │     }
113 │ 
114 │     return null;
115 │   }
```

1. **85 行目 テンプレートの名前からクラスのフィールドへ**

   `@Output('removed') onRemove = ...` のような alias なら、`removed` から `onRemove` を引きます。84 行目の TODO のとおり、同じ名前に複数のフィールドがあっても最初の 1 つだけを使います。
2. **88・90 行目 ディレクティブの変数のフィールド**

   `scope.resolve` がディレクティブの型の op（[第 9 回](09-typecheck-type-constructor.md)）を実行し、`_t1["onRemove"]` を作ります。91 行目でフィールド名の位置（keySpan）を付けます。
3. **93〜100 行目 strictOutputEventTypes が真なら subscribe**

   97 行目で `Infer` のハンドラを作り、98 行目で `_t1["onRemove"].subscribe(ハンドラ)`。`$event` の型は、そのフィールドの `subscribe` の引数の型から推論されます（3 節）。
4. **101〜110 行目 偽なら、フィールドを読む文と any のハンドラ**

   108 行目でフィールドを読むだけの文を残し（104〜106 行目のコメントのとおり、TemplateTypeChecker が出力のメンバーを見つけられるように。[第 19 回](19-typecheck-template-type-checker.md)）、109〜110 行目で `($event: any) => ...` を別の文として置きます。`$event` は any ですが、ハンドラの中の式（メソッド名の打ち間違いなど）は検査されます。

## 3. subscribe の型：EventEmitter と OutputRef

📄 `angular/packages/core/src/event_emitter.ts` L98–111 （▶ の行: 98–99, 102, 111）

```ts
 98 ▶   subscribe(
 99 ▶     next?: (value: T) => void,
100 │     error?: (error: any) => void,
101 │     complete?: () => void,
102 ▶   ): Subscription;
103 │   /**
104 │    * Registers handlers for events emitted by this instance.
105 │    * @param observerOrNext When supplied, a custom handler for emitted events, or an observer
106 │    *     object.
107 │    * @param error When supplied, a custom handler for an error notification from this emitter.
108 │    * @param complete When supplied, a custom handler for a completion notification from this
109 │    *     emitter.
110 │    */
111 ▶   subscribe(observerOrNext?: any, error?: any, complete?: any): Subscription;
```

`@Output() removed = new EventEmitter<Item>()` なら、98〜102 行目の 1 つ目の `subscribe(next?: (value: T) => void, ...)` にアロー関数が当てはまり、`$event` は `Item` になります。111 行目の 2 つ目は `observerOrNext?: any` ですが、TypeScript は上から順に当てはまる多重定義を選び、1 つ目に当てはまるので `any` にはなりません。`output()` の `OutputEmitterRef<T>` と `model()` は `OutputRef<T>` の `subscribe(callback: (value: T) => void)` を持ちます（[signals シリーズの model と output の章](../signals/13-signals-model-output.md)で引用）。TCB は出力の種類を区別していません。どれも 2 節の 98 行目の同じ `.subscribe(...)` で、型の違いは TypeScript がフィールドの型から決めます。

## 4. TcbUnclaimedOutputsOp：どのディレクティブにも当たらなかったイベント

📄 `angular/packages/compiler/src/typecheck/ops/events.ts` L141–150 （▶ の行: 145–146, 148）

```ts
141 │   override execute(): null {
142 │     let elId: TcbExpr | null = null;
143 │ 
144 │     // TODO(alxhub): this could be more efficient.
145 ▶     for (const output of this.outputs) {
146 ▶       if (this.claimedOutputs?.has(output.name)) {
147 │         // Skip this event handler as it was claimed by a directive.
148 ▶         continue;
149 │       }
150 │ 
```

145〜149 行目、要素に付いたディレクティブのどれかが出力として持っている名前（`claimedOutputs`）は飛ばします。残りは要素そのもののイベントとして扱います。どの出力でもない名前もここに来るので、`<app-chip (removd)="...">` のような打ち間違いは「app-chip 要素の removd という DOM イベント」になります（テストと直し方の #43603）。

📄 `angular/packages/compiler/src/typecheck/ops/events.ts` L162–196 （▶ の行: 163, 165–167, 171–172, 174, 179, 188–192）

```ts
162 │ 
163 ▶       if (output.type === ParsedEventType.LegacyAnimation) {
164 │         // Animation output bindings always have an `$event` parameter of type `AnimationEvent`.
165 ▶         const eventType = this.tcb.env.config.checkTypeOfAnimationEvents
166 ▶           ? this.tcb.env.referenceExternalSymbol('@angular/animations', 'AnimationEvent').print()
167 ▶           : EventParamType.Any;
168 │ 
169 │         const handler = tcbCreateEventHandler(output, this.tcb, this.scope, eventType);
170 │         this.scope.addStatement(handler);
171 ▶       } else if (output.type === ParsedEventType.Animation) {
172 ▶         const eventType = this.tcb.env.referenceExternalSymbol(
173 │           '@angular/core',
174 ▶           'AnimationCallbackEvent',
175 │         );
176 │ 
177 │         const handler = tcbCreateEventHandler(output, this.tcb, this.scope, eventType.print());
178 │         this.scope.addStatement(handler);
179 ▶       } else if (this.tcb.env.config.checkTypeOfDomEvents) {
180 │         // If strict checking of DOM events is enabled, generate a call to `addEventListener` on
181 │         // the element instance so that TypeScript's type inference for
182 │         // `HTMLElement.addEventListener` using `HTMLElementEventMap` to infer an accurate type for
183 │         // `$event` depending on the event name. For unknown event names, TypeScript resorts to the
184 │         // base `Event` type.
185 │         let target: TcbExpr;
186 │         let domEventAssertion: TcbExpr | undefined;
187 │ 
188 ▶         // Only check for `window` and `document` since in theory any target can be passed.
189 ▶         if (output.target === 'window' || output.target === 'document') {
190 ▶           target = new TcbExpr(output.target);
191 ▶         } else if (elId === null) {
192 ▶           target = elId = this.scope.resolve(this.target);
193 │         } else {
194 │           target = elId;
195 │         }
196 │ 
```

1. **163〜170 行目 旧アニメーション `(@fade.done)`**

   `checkTypeOfAnimationEvents` が真なら `$event: i0.AnimationEvent`（166 行目、`@angular/animations` の型）、偽なら `any`。要素へのリスナーではなく、ハンドラの関数だけが文になります。
2. **171〜178 行目 `(animate.leave)`**

   core のアニメーションのイベントは、設定に関係なく `$event: i0.AnimationCallbackEvent`（174 行目）です。
3. **179 行目 checkTypeOfDomEvents（strictDomEventTypes）が真なら addEventListener**

   189〜190 行目、`(window:resize)` と `(document:click)` は `window` と `document` そのものが対象です。188 行目のコメントのとおり、他の `body:` のような対象は見ず、要素の変数（191〜192 行目、`document.createElement(...)`。第 8 回）を使います。この先（第 17 回で引用した範囲）で `_t1.addEventListener("click", ハンドラ)` を書き、TypeScript は lib.dom.d.ts の `HTMLElementEventMap["click"]` から `$event` の型を決めます。

📄 `angular/packages/compiler/src/typecheck/ops/events.ts` L239–249 （▶ の行: 239, 242–243）

```ts
239 ▶       } else {
240 │         // If strict checking of DOM inputs is disabled, emit a handler function where the `$event`
241 │         // parameter has an explicit `any` type.
242 ▶         const handler = tcbCreateEventHandler(output, this.tcb, this.scope, EventParamType.Any);
243 ▶         this.scope.addStatement(handler);
244 │       }
245 │     }
246 │ 
247 │     return null;
248 │   }
249 │ }
```

checkTypeOfDomEvents が偽なら、242〜243 行目で `($event: any) => ...` だけを置きます。strictTemplates が真なら真、偽なら偽で、`strictDomEventTypes` で個別に変えられます（[第 2 回](02-typecheck-config.md)）。

## 5. イベント名はそのまま渡る：keyup.enter

`(keyup.enter)` の名前は、バインディングのパーサで `:` の前後（対象とイベント名）に分けられるだけで、`.enter` は名前に残ります（[テンプレートコンパイラの binding parser の章](../compiler/06-compiler-binding-parser.md)）。4 節の op はその名前を `addEventListener("keyup.enter", ...)` にそのまま書くので、`HTMLElementEventMap` に無い名前として、TypeScript は `$event` を `Event` にします。実行時に `keyup.enter` を `keyup` と Enter の判定に分けるのは platform-browser の `KeyEventsPlugin` で、型検査はそれを知りません。手で確かめた結果は「テストと直し方」にあります。

## 6. $event という名前を引数に変える翻訳器

📄 `angular/packages/compiler/src/typecheck/ops/events.ts` L251–273 （▶ の行: 257–260, 262, 265, 268, 271）

```ts
251 │ class TcbEventHandlerTranslator extends TcbExpressionTranslator {
252 │   protected override resolve(ast: AST): TcbExpr | null {
253 │     // Recognize a property read on the implicit receiver corresponding with the event parameter
254 │     // that is available in event bindings. Since this variable is a parameter of the handler
255 │     // function that the converted expression becomes a child of, just create a reference to the
256 │     // parameter by its name.
257 ▶     if (
258 ▶       ast instanceof PropertyRead &&
259 ▶       ast.receiver instanceof ImplicitReceiver &&
260 ▶       ast.name === EVENT_PARAMETER
261 │     ) {
262 ▶       return new TcbExpr(EVENT_PARAMETER).addParseSpanInfo(ast.nameSpan);
263 │     }
264 │ 
265 ▶     return super.resolve(ast);
266 │   }
267 │ 
268 ▶   protected override isValidLetDeclarationAccess(): boolean {
269 │     // Event listeners are allowed to read `@let` declarations before
270 │     // they're declared since the callback won't be executed immediately.
271 ▶     return true;
272 │   }
273 │ }
```

ハンドラの式は普通の式と同じ翻訳器（[第 7 回](07-typecheck-expressions.md)）で訳しますが、257〜262 行目で、レシーバの無い `$event` だけはコンポーネントの `this.$event` ではなくアロー関数の引数 `$event` にします。`this.$event` と書けばコンポーネントのプロパティのままです（spec の ``it('should ignore accesses to $event through `this`')``）。268〜271 行目、リスナーはすぐには実行されないので、後ろで宣言した `@let` を読んでもよいことにしています。

## 7. spec で見る 3 つの形

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1088–1117 （▶ の行: 1095, 1098, 1101, 1106, 1108, 1112, 1115）

```ts
1088 │   describe('outputs', () => {
1089 │     it('should emit subscribe calls for directive outputs', () => {
1090 │       const DIRECTIVES: TestDeclaration[] = [
1091 │         {
1092 │           type: 'directive',
1093 │           name: 'Dir',
1094 │           selector: '[dir]',
1095 ▶           outputs: {'outputField': 'dirOutput'},
1096 │         },
1097 │       ];
1098 ▶       const TEMPLATE = `<div dir (dirOutput)="foo($event)"></div>`;
1099 │       const block = tcb(TEMPLATE, DIRECTIVES);
1100 │       expect(block).toContain(
1101 ▶         '_t1["outputField"].subscribe(($event): any => { (this).foo($event); });',
1102 │       );
1103 │     });
1104 │ 
1105 │     it('should emit a listener function with AnimationEvent for animation events', () => {
1106 ▶       const TEMPLATE = `<div (@animation.done)="foo($event)"></div>`;
1107 │       const block = tcb(TEMPLATE);
1108 ▶       expect(block).toContain('($event: i1.AnimationEvent): any => { (this).foo($event); }');
1109 │     });
1110 │ 
1111 │     it('should emit addEventListener calls for unclaimed outputs', () => {
1112 ▶       const TEMPLATE = `<div (event)="foo($event)"></div>`;
1113 │       const block = tcb(TEMPLATE);
1114 │       expect(block).toContain(
1115 ▶         '_t1.addEventListener("event", ($event): any => { (this).foo($event); });',
1116 │       );
1117 │     });
```
*type\_check\_block\_spec.ts*

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L457–469 （▶ の行: 458, 460, 465, 467）

```ts
457 │   it('should generate code for event targeting `window`', () => {
458 ▶     const block = tcb(`<button (window:scroll)="handle()"></button>`);
459 │     expect(block).toContain(
460 ▶       'window.addEventListener("scroll", ($event): any => { (this).handle(); });',
461 │     );
462 │   });
463 │ 
464 │   it('should generate code for event targeting `document`', () => {
465 ▶     const block = tcb(`<button (document:click)="handle()"></button>`);
466 │     expect(block).toContain(
467 ▶       'document.addEventListener("click", ($event): any => { (this).handle(); });',
468 │     );
469 │   });
```
*type\_check\_block\_spec.ts*

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1291–1315 （▶ の行: 1292, 1297, 1300, 1306, 1309, 1311–1312）

```ts
1291 │     describe('config.checkTypeOfOutputEvents', () => {
1292 ▶       const TEMPLATE = `<div dir (dirOutput)="foo($event)" (nonDirOutput)="foo($event)"></div>`;
1293 │ 
1294 │       it('should check types of directive outputs when enabled', () => {
1295 │         const block = tcb(TEMPLATE, DIRECTIVES);
1296 │         expect(block).toContain(
1297 ▶           '_t1["outputField"].subscribe(($event): any => { (this).foo($event); });',
1298 │         );
1299 │         expect(block).toContain(
1300 ▶           '_t2.addEventListener("nonDirOutput", ($event): any => { (this).foo($event); });',
1301 │         );
1302 │       });
1303 │       it('should not check types of directive outputs when disabled', () => {
1304 │         const DISABLED_CONFIG: TypeCheckingConfig = {
1305 │           ...BASE_CONFIG,
1306 ▶           checkTypeOfOutputEvents: false,
1307 │         };
1308 │         const block = tcb(TEMPLATE, DIRECTIVES, DISABLED_CONFIG);
1309 ▶         expect(block).toContain('($event: any): any => { (this).foo($event); }');
1310 │         // Note that DOM events are still checked, that is controlled by `checkTypeOfDomEvents`
1311 ▶         expect(block).toContain(
1312 ▶           'addEventListener("nonDirOutput", ($event): any => { (this).foo($event); });',
1313 │         );
1314 │       });
1315 │     });
```
*type\_check\_block\_spec.ts（describe('config') の中）*

1101 行目が出力（alias の `dirOutput` がフィールドの `outputField` になっている）、1108 行目が旧アニメーション、1115 行目が DOM イベントです。460・467 行目が `window` と `document`。1306〜1312 行目、`checkTypeOfOutputEvents` を切っても DOM イベントは `addEventListener` のままで、2 つの設定が別々に効くことが分かります。

## 8. デモ：同じ go($event) がどう書かれるか

> **🧪 DEMO — このページの @angular/compiler（22.1.6）の generateTypeCheckBlock**
>
> ボタンでテンプレートと設定を切り替えて TCB を作ります。強調した行が `$event` を受けるハンドラの始まりです。`/*T:EP*/` は「イベントの引数」の印（[第 16 回](16-typecheck-diagnostics-mapping.md)）です。events.ts は 22.1.6 と読んでいるソースで同じです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-outputs-events)

2026-11-02 に Node で同じ関数を呼んで確かめた出力の要点です（位置コメントと型の印は消してある）。

| ボタン | ハンドラを受ける文 |
| --- | --- |
| (click) | `_t1.addEventListener("click", ($event): any => { ... })` |
| (keyup.enter) | `_t1.addEventListener("keyup.enter", ($event): any => { i0.ɵassertType<typeof _t1>($event.target); ... })` |
| (window:resize) | `window.addEventListener("resize", ...)` |
| ディレクティブの出力 | `_t1["removed"].subscribe(($event): any => ...)` |
| 出力と DOM と打ち間違い | `_t1["removed"].subscribe(...)` と `_t2.addEventListener("click", ...)` と `_t2.addEventListener("removd", ...)` |
| strictOutputEventTypes: false | `_t1["removed"];` と `($event: any): any => ...;` |
| (@fade.done) | `($event: i0.AnimationEvent): any => ...;` |
| (animate.leave) | `($event: i0.AnimationCallbackEvent): any => ...;` |

「出力と DOM と打ち間違い」では、OutOfBandDiagnosticRecorder も DomSchemaChecker も何も呼ばれませんでした。打ち間違いを知らせる診断は、読んでいるソースには無いということです。

## 9. 呼び出しの連なり

- 👤 `<app-chip (removed)="go($event)" (click)="go($event)">` — 利用者のテンプレート
  - `Scope.appendOutputsOfElementLikeNode` — ops/scope.ts L676 — *第 8 回。ディレクティブごとに TcbDirectiveOutputsOp、最後に TcbUnclaimedOutputsOp*
    - `TcbDirectiveOutputsOp.execute` — ops/events.ts L64 — *removed は Chip の出力*
      - `tcbCreateEventHandler(..., Infer)` — ops/events.ts L286 — *($event): any =&gt; { ... }*
      - `_t1["removed"].subscribe(handler)` — ops/events.ts L98 — *$event は EventEmitter&lt;T&gt; / OutputRef&lt;T&gt; の T*
    - `TcbUnclaimedOutputsOp.execute` — ops/events.ts L141 — *click は誰の出力でもない*
      - `_t2.addEventListener("click", handler)` — ops/events.ts L224-238 — *$event は HTMLElementEventMap\["click"\]*

## テストと直し方

- type\_check\_block\_spec.ts の `describe('outputs')`（:1088）。`it('should emit subscribe calls for directive outputs')`（:1089）、`it('should emit a listener function with AnimationEvent for animation events')`（:1105）、`it('should emit addEventListener calls for unclaimed outputs')`（:1111）、``it('should ignore accesses to $event through `this`')``（:1149）。
- 同じファイルの `describe('config')` の中の `describe('config.checkTypeOfOutputEvents')`（:1291）・`describe('config.checkTypeOfAnimationEvents')`（:1317）・`describe('config.checkTypeOfDomEvents')`（:1334）。
- トップレベルの ``it('should generate code for event targeting `window`')``（:457）と `` `document` ``（:464）、`it('should assert the type for DOM events bound on void elements')`（:67）。
- エラーが出るかは test/ngtsc/template\_typecheck\_spec.ts の `describe('strictOutputEventTypes')`（:1092）。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=outputs|checkTypeOfOutputEvents|checkTypeOfAnimationEvents|checkTypeOfDomEvents|targeting|DOM events'
```

📄 `出力（抜粋。2026-11-02 に実行。ログは scratchpad/tc-logs/c-outputs.log）`

```
==================== Test output for //packages/compiler-cli/src/ngtsc/typecheck/test:test:
Randomized with seed 63774
Started
Ran 61 of 1747 specs
61 specs, 0 failures
INFO: Elapsed time: 1.405s, Critical Path: 1.17s
//packages/compiler-cli/src/ngtsc/typecheck/test:test                    PASSED in 1.1s
```

1. **開いている issue：#40778 keyup.Enter の strictDomEventTypes**

   2021-02-10 に開かれ、P3。同じ日の JoostK のコメントは「`keyup.Enter` を特別に処理するのはイベントプラグインの仕組みで、コンパイラはそれを知らない」。その後、lib.dom の `GlobalEventHandlersEventMap` に `"keydown.enter": KeyboardEvent` を足す型の拡張（declaration merging）で回避できるというコメントがあり、2025-10 にそれで解決したという返事が付いています。修正の PR #70521（2026-09-02、「keydown.enter のようなバインディングで KeyboardEvent を推論する」）は、TCB の `addEventListener` に渡す名前だけを `keydown` / `keyup` にする案でしたが、2026-09-20 にマージされずに閉じられています。
2. **手元で確かめる**

   5 節の TCB の形を手で写した TypeScript を、../angular の TypeScript（6.0.3）で検査しました。

📄 `keyup.ts（TCB の形を手で写したもの）`

```
function _tcb1(this: { go(e: KeyboardEvent): void }) {
  var _t1 = document.createElement('input');
  _t1.addEventListener('keyup', ($event): any => {
    this.go($event);
  });
  _t1.addEventListener('keyup.enter', ($event): any => {
    this.go($event);
  });
}
```

📄 `出力（2026-11-02 に実行）`

```
$ node ~/angular-research/angular/node_modules/typescript/bin/tsc --noEmit --strict \
    --target es2022 --lib es2022,dom keyup.ts
keyup.ts(7,13): error TS2345: Argument of type 'Event' is not assignable to parameter of type 'KeyboardEvent'.
  Type 'Event' is missing the following properties from type 'KeyboardEvent': altKey, charCode, code, ctrlKey, and 17 more.
```

`"keyup"` のリスナーの中はエラーにならず（`$event` は `KeyboardEvent`）、`"keyup.enter"` のリスナーの中の `this.go($event)`（出力の `(7,13)`）だけが、`Event` を渡したとしてエラーになりました。

1. **開いている issue：#43603 存在しない出力をエラーにしてほしい**

   2021-09-26 に開かれた feature（`feature: under consideration`）。JoostK のコメントのとおり、打ち間違えた出力にも「描画される app-child 要素」という正しい対象があり、4 節の op は DOM イベントとして扱います。8 節のデモの「出力と DOM と打ち間違い」がその形です。PR #70527（2026-09-16 にマージ）が、opt-in の `strictUnclaimedEventNames` を足しました。読んでいるソース（2026-09-06）より後なので本文の引用には入っていません。main の events.ts を `gh api` で読むと、TcbUnclaimedOutputsOp の旧アニメーションの分岐の前に、`checkUnclaimedEventNames` が真で要素にディレクティブがあるときに `domSchemaChecker.checkTemplateElementEvent` を呼ぶ `if` が足されています。
2. **直すとしたら**

   出力は events.ts の `TcbDirectiveOutputsOp.execute`（64〜115 行目）、DOM イベントは `TcbUnclaimedOutputsOp.execute`（141 行目から）です。#40778 のように渡す名前を変えるなら、同じ op の中の `addEventListener` の呼び出しを作る所（第 17 回で引用した範囲）で、TCB の形は type\_check\_block\_spec.ts の `describe('outputs')` に、`$event` の型のエラーは test/ngtsc/template\_typecheck\_spec.ts に足すのが入口です。#70521 が閉じられた理由は PR に書かれていないので、issue と PR のコメントを読んでから考えます（[第 20 回](20-typecheck-issues.md)）。

## 聞かれそうな質問

**Q. (click) の $event は何型ですか？**

4 節のとおり `_t1.addEventListener("click", ...)` と書かれるので、TypeScript の lib.dom.d.ts の `"click"` の型です。../angular の TypeScript 6.0.3 では `PointerEvent` でした。`strictDomEventTypes`（`checkTypeOfDomEvents`）が偽なら 242 行目の `any` です。

**Q. EventEmitter と output() で、型検査に違いはありますか？**

TCB は同じ `_t1["x"].subscribe(...)` です（2 節の 98 行目）。違うのはフィールドの型だけで、`EventEmitter<T>` は 3 節の 98〜102 行目、`OutputEmitterRef<T>` は `OutputRef<T>` の `subscribe` から、どちらも `$event: T` になります。

**Q. コンポーネントに無い出力名を書いてもエラーにならないのはなぜですか？**

4 節の 145〜149 行目で出力に当たらなかった名前は、要素の DOM イベントとして `addEventListener` に渡されるからです。DOM のイベント名は自由（独自のイベントも投げられる）なので、TypeScript は知らない名前でも `Event` にするだけでエラーにしません。開いている #43603 で、main には opt-in の `strictUnclaimedEventNames` が入りました。

**Q. (keydown.enter) の $event が KeyboardEvent にならないのはなぜですか？**

名前が `"keydown.enter"` のまま `addEventListener` に渡り（5 節）、lib.dom.d.ts にその名前が無いからです。`$any($event)` で包むか、#40778 のコメントにある `GlobalEventHandlersEventMap` の拡張で回避できます。

**Q. strictOutputEventTypes を切ると、ハンドラの中は検査されなくなりますか？**

されます。2 節の 108〜110 行目で、ハンドラは `($event: any) => ...` の関数として TCB に残ります。`$event` の型が any になるだけで、存在しないメソッドを呼べばエラーです。

## 読み終えて

- イベントのバインディングは、`$event` を引数に持つアロー関数になる。型は「推論させる」「any」「型を書く」の 3 通り（events.ts L24-30）。
- ディレクティブの出力は `_t1["field"].subscribe(handler)`。`$event` は EventEmitter・OutputRef の `subscribe` の型から決まる（L90-98）。
- 出力に当たらない名前は要素の `addEventListener`。`$event` は lib.dom.d.ts から決まり、`window:` と `document:` だけは対象が変わる（L179-195）。
- アニメーションは関数だけを置き、`AnimationEvent` か `AnimationCallbackEvent` を書く（L163-178）。
- `keyup.enter` は名前のまま渡るので `Event`（#40778）、打ち間違えた出力は DOM イベントになる（#43603）。

---

← 前: [入力の型チェック：代入・coercion・transform・input()](10-typecheck-inputs.md)  
次: [双方向バインディングと model()・\[formField\]](12-typecheck-two-way.md) →
