[目次](../README.md) › [パイプを書くと何を宣言したことになるか](README.md) › 第 4 回 / 全 6 回

# 書ける場所と書けない場所：イベント・ホスト・@let・track と優先順位

> 式のパーサーが pipe を受け付ける場所と、エラーにする場所を行で確かめる。イベント・双方向のイベント側・ホストのイベント・矢印関数の本体は ParseFlags.Action で（「Cannot have a pipe in an action expression」）、ホストのプロパティは SimpleExpressionChecker で、@for の track は PipeVisitor で止まる。@let・@if・@switch・@for の of・@defer の when・i18n の ICU では書ける。| の優先順位が三項演算子より低いこと、括弧が要る書き方、矢印関数の後ろの pipe が関数そのものに掛かること。このページの上の @angular/compiler と、ngtsc にかけた記録で、エラーの文と番号（NG5001・NG5002）を見る。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pipe-where-allowed)

---

この章では、`| date` と書いたことが「この式は、変更検知のたびに**値を読む**式だ」と宣言している、という部分を読みます。pipe は、式のパーサーが「値を読む式（binding）」として読む場所でだけ書けます。「何かをする式（action）」として読む場所――イベントのバインディング、双方向バインディングのイベント側、矢印関数の本体――と、ホストのバインディング、`@for` の `track` では、それぞれ別の行がエラーにします。どの場所がどの入口を通るのかを行で確かめ、最後にこのページの上で本物の `@angular/compiler` にかけて確かめます。

読む対象は `packages/compiler/src/expression_parser/parser.ts`、`template_parser/binding_parser.ts`、`render3/r3_control_flow.ts`・`r3_template_transform.ts`・`render3/view/compiler.ts`、`template/pipeline/src/phases/store_let_optimization.ts` と、その spec です。式のパーサーの組み立て（`parseChain` → `parsePipe` → `parseConditional` …の階段）は [式のパーサーの章](../compiler/05-compiler-expression-parser.md)、属性からバインディングへの振り分けは[バインディングのパーサーの章](../compiler/06-compiler-binding-parser.md)で読みました。ここではその上に「pipe はどこで止まるか」だけを積みます。

1. [1. 1 行の | が生むもの](01-pipe-what-declared.md)
2. [2. @Pipe が作るもの](02-pipe-class-def.md)
3. [3. 名前の解決](03-pipe-name-resolution.md)
4. **4. 書ける場所と書けない場所**（この章）
5. [5. インスタンスの数と寿命](05-pipe-instances-lifecycle.md)
6. [6. spec と issue](06-pipe-tests-issues.md)

## 1. 先に結論：書いた場所ごとの入口

テンプレートの式は、置かれた場所によって、パーサーの 4 つの入口のどれかを通ります。`parseBinding`（値を読む）、`parseAction`（何かをする）、`parseSimpleBinding`（ホストのプロパティ）、`parseInterpolation` / `parseInterpolationExpression`（補間と ICU）です。表の「pipe」の欄は 8 節の DEMO と記録で確かめたものです。

| 書いた場所 | 通る入口 | pipe | 止める行（この章の節） |
| --- | --- | --- | --- |
| 補間 `{{ x \| p }}`、i18n の属性 | parseInterpolation | 書ける | — |
| `[prop]`・`[class.x]`・`[style.x]`・`[attr.x]` | parseBinding | 書ける | — |
| `(event)` | parseAction | エラー（NG5002） | parser.ts 825 行目（2 節） |
| `[(x)]` | parseBinding ＋ parseAction | エラー（イベント側） | 同じ 825 行目（3 節） |
| host の `'[x]'` | parseSimpleBinding | エラー（NG5001） | SimpleExpressionChecker（4 節） |
| host の `'(x)'` | parseAction | エラー（NG5001） | 825 行目（4 節） |
| `@let`、`@if`・`@switch`・`@case`・`@for` の of・`@defer` の when | parseBinding | 書ける | —（5 節） |
| `@for` の track | parseBinding のあと PipeVisitor | エラー（NG5002） | r3\_control\_flow.ts（5 節） |
| ICU の `{n \| p, plural, …}` | parseInterpolationExpression | 書ける | —（6 節） |
| 矢印関数の本体 `i => (i \| p)` | 本体だけ Action に切り替え | エラー（NG5002） | parser.ts 1730 行目（7 節） |

「書ける」場所に共通するのは、式が**更新の回に値を求められる**ことです。[pipe の仕組みの章](../cmn/06-cmn-pipe-mechanism.md)で読んだとおり、`| p` は作成の回の `ɵɵpipe` と更新の回の `ɵɵpipeBindN` の組になります。イベントの式は更新の回には動かず、リスナーの中で一度だけ動くので、この組を置く場所がありません。

## 2. 入口を分けるのは 1 つのフラグ

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L590–598 （▶ の行: 594）

```ts
590 │     private input: string,
591 │     private parseSourceSpan: ParseSourceSpan,
592 │     private absoluteOffset: number,
593 │     private tokens: Token[],
594 ▶     private parseFlags: ParseFlags,
595 │     private errors: ParseError[],
596 │     private offset: number,
597 │     private supportsDirectPipeReferences: boolean,
598 │   ) {}
```

式を読む `_ParseAST` は、594 行目の `parseFlags` を 1 つの式の読み始めから終わりまで持ち続けます。`parseAction` はここに `ParseFlags.Action` を、`parseBinding` は `ParseFlags.None` を入れます（入口の行は[式のパーサーの章](../compiler/05-compiler-expression-parser.md)の 108〜139 行目）。`parsePipe` は `|` を見つけるとこのフラグを見て、`Action` なら「Cannot have a pipe in an action expression」を出します（同じ章の 820〜835 行目）。

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L1338–1349 （▶ の行: 1346）

```ts
1338 │   private parseCallArguments(): BindingPipe[] {
1339 │     if (this.next.isCharacter(chars.$RPAREN)) {
1340 │       return [];
1341 │     }
1342 │ 
1343 │     const positionals: AST[] = [];
1344 │ 
1345 │     do {
1346 ▶       positionals.push(this.next.isOperator('...') ? this.parseSpreadElement() : this.parsePipe());
1347 │     } while (this.consumeOptionalCharacter(chars.$COMMA));
1348 │ 
1349 │     return positionals as BindingPipe[];
```

関数の引数は 1346 行目でもう一度 `parsePipe()` から読みます。だから binding の中では `f(x | p)` と括弧なしで書けます。ところが、フラグは**同じ `_ParseAST` のフィールド**なので、引数の中に入っても `Action` のままです。イベントの `(click)="save(x | p)"` は、括弧の中でもエラーになります。

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L836–853 （▶ の行: 836–837, 847, 851）

```ts
836 ▶           // No valid identifier was found, so we'll assume an empty pipe name ('').
837 ▶           nameId = '';
838 │ 
839 │           // However, there may have been whitespace present between the pipe character and the next
840 │           // token in the sequence (or the end of input). We want to track this whitespace so that
841 │           // the `BindingPipe` we produce covers not just the pipe character, but any trailing
842 │           // whitespace beyond it. Another way of thinking about this is that the zero-length name
843 │           // is assumed to be at the end of any whitespace beyond the pipe character.
844 │           //
845 │           // Therefore, we push the end of the `ParseSpan` for this pipe all the way up to the
846 │           // beginning of the next token, or until the end of input if the next token is EOF.
847 ▶           fullSpanEnd = this.next.index !== -1 ? this.next.index : this.input.length + this.offset;
848 │ 
849 │           // The `nameSpan` for an empty pipe name is zero-length at the end of any whitespace
850 │           // beyond the pipe character.
851 ▶           nameSpan = new ParseSpan(fullSpanEnd, fullSpanEnd).toAbsolute(this.absoluteOffset);
852 │         }
853 │ 
```

エラーのあと、パーサーは読み飛ばして続きを読もうとします（読み飛ばしの行は[式のパーサーの章](../compiler/05-compiler-expression-parser.md)の 1859〜1890 行目）。`save(x | p)` では pipe の名前の `p` まで読み飛ばされ、名前を読む関数は `)` を見て 2 つ目のエラー「Unexpected token ), expected identifier or keyword」を出し、836〜837 行目で名前を `''`（空）にします。この「名前が空の pipe」は木に残るので、型チェックはもう 1 つ「No pipe found with name ''」（NG8004）を出します（8 節の記録の「19:36 NG8004」）。**1 つの書き間違いに 3 つのエラー**が出るのはこのためで、読むべきは最初の「Cannot have a pipe」です。

## 3. 双方向バインディング \[( )\]

`[(ngModel)]="x | p"` は、テンプレートの変換で、プロパティの `[ngModel]` とイベントの `(ngModelChange)` の 2 つに分かれ、**同じ文字 `x | p` を両方で読みます**。前者は `parseBinding` なので通り、後者は `parseEvent` に `isAssignmentEvent = true` で渡されて `parseAction` を通るので、2 節と同じ 825 行目で止まります（`$event` を代入する部分は、あとの段で足されます）（分かれる行は[バインディングのパーサーの章](../compiler/06-compiler-binding-parser.md)、`model()` との関係は[model() の章](../signals/13-signals-model-output.md)）。DEMO で試すと、`[ngModel]` の側には `Pipe(p)[x]` の木ができ、`(ngModelChange)` の側に名前が空の pipe とエラーが 2 つ付きます。双方向で pipe を通したいときは、`[ngModel]="x | p" (ngModelChange)="x = $event"` のように 2 つに分けて書けば、どちらも入口の規則に合います（DEMO の入力を書き換えて確かめられます）。

## 4. ホストのバインディング

`@Component` や `@Directive` の `host: {'[title]': 'name | up'}` は、テンプレートとは別の道を通ります。

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L584–597 （▶ の行: 589, 594–595, 597）

```ts
584 │ export function verifyHostBindings(
585 │   bindings: ParsedHostBindings,
586 │   sourceSpan: ParseSourceSpan,
587 │ ): ParseError[] {
588 │   // TODO: abstract out host bindings verification logic and use it instead of
589 ▶   // creating events and properties ASTs to detect errors (FW-996)
590 │   const bindingParser = makeBindingParser();
591 │   bindingParser.createDirectiveHostEventAsts(bindings.listeners, sourceSpan);
592 │   bindingParser.createBoundHostProperties(bindings.properties, sourceSpan);
593 │ 
594 ▶   validateNoEventBindings(bindings, bindingParser, sourceSpan);
595 ▶ 
596 │   return bindingParser.errors;
597 ▶ }
```

ngtsc はデコレーターを解析するときに `verifyHostBindings` を呼び（呼ぶ側の行は[ディレクティブのハンドラーの章](../ngtsc/09-ngtsc-directive-handler.md)）、エラーがあれば `HOST_BINDING_PARSE_ERROR`（NG5001）にします。594 行目でイベント、595 行目でプロパティを、本物のコンパイルと同じ関数で解析し、597 行目でたまったエラーを返します。DEMO の「host」の入口は、この 2 つの関数を同じ順に呼んでいます。

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L68–92 （▶ の行: 76, 79）

```ts
68 │   createBoundHostProperties(
69 │     properties: HostProperties,
70 │     sourceSpan: ParseSourceSpan,
71 │   ): ParsedProperty[] | null {
72 │     const boundProps: ParsedProperty[] = [];
73 │     for (const propName of Object.keys(properties)) {
74 │       const expression = properties[propName];
75 │       if (typeof expression === 'string') {
76 ▶         this.parsePropertyBinding(
77 │           propName,
78 │           expression,
79 ▶           true,
80 │           false,
81 │           sourceSpan,
82 │           sourceSpan.start.offset,
83 │           undefined,
84 │           [],
85 │           // Use the `sourceSpan` for  `keySpan`. This isn't really accurate, but neither is the
86 │           // sourceSpan, as it represents the sourceSpan of the host itself rather than the
87 │           // source of the host binding (which doesn't exist in the template). Regardless,
88 │           // neither of these values are used in Ivy but are only here to satisfy the function
89 │           // signature. This should likely be refactored in the future so that `sourceSpan`
90 │           // isn't being used inaccurately.
91 │           boundProps,
92 │           sourceSpan,
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L528–534 （▶ の行: 531–533）

```ts
528 │     absoluteOffset: number,
529 │   ): ASTWithSource {
530 │     try {
531 ▶       const ast = isHostBinding
532 ▶         ? this._exprParser.parseSimpleBinding(value, sourceSpan, absoluteOffset)
533 ▶         : this._exprParser.parseBinding(value, sourceSpan, absoluteOffset);
534 │       if (ast) {
```

ホストのプロパティは 76 行目で、テンプレートの `[prop]` と同じ `parsePropertyBinding` に渡されます。違うのは 79 行目の `true`（`isHost`）だけで、`parsePropertyBinding` はこれを `parseBinding` の第 2 引数に渡し、531〜532 行目で `parseSimpleBinding` の側に分かれます。

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L140–146 （▶ の行: 141–143）

```ts
140 │ 
141 ▶   private checkSimpleExpression(ast: AST): string[] {
142 ▶     const checker = new SimpleExpressionChecker();
143 ▶     ast.visit(checker);
144 │     return checker.errors;
145 │   }
146 │ 
```

`parseSimpleBinding` はふつうに木を組んでから、`checkSimpleExpression` で木を全部歩きます。141 行目の `SimpleExpressionChecker` は `visitPipe` で `'pipes'` を足すだけのクラスで（[式のパーサーの章](../compiler/05-compiler-expression-parser.md)の 1907〜1913 行目）、142 行目の `visit` は再帰で木の全部を回るので、**括弧の中・三項演算子の中・関数の引数の中**の pipe も見つかります（DEMO の「host のプロパティ（括弧の中）」）。

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L1893–1905 （▶ の行: 1899–1900, 1903）

```ts
1893 │ function getParseError(
1894 │   message: string,
1895 │   input: string,
1896 │   locationText: string,
1897 │   parseSourceSpan: ParseSourceSpan,
1898 │ ) {
1899 ▶   if (locationText.length > 0) {
1900 ▶     locationText = ` ${locationText} `;
1901 │   }
1902 │   const location = getLocation(parseSourceSpan);
1903 ▶   const error = `Parser Error: ${message}${locationText}[${input}] in ${location}`;
1904 │   return new ParseError(parseSourceSpan, error);
1905 │ }
```

このエラーの文は、場所の文（`locationText`）に `''` を渡して作られます。1899 行目の `if` を通らないので前後に空白が入らず、1903 行目で `…cannot contain pipes[name | up] in …` と、`pipes` と `[` がくっついた文になります（8 節の記録の 1 行目）。

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L104–127 （▶ の行: 118, 121）

```ts
104 │   createDirectiveHostEventAsts(
105 │     hostListeners: HostListeners,
106 │     sourceSpan: ParseSourceSpan,
107 │   ): ParsedEvent[] | null {
108 │     const targetEvents: ParsedEvent[] = [];
109 │     for (const propName of Object.keys(hostListeners)) {
110 │       const expression = hostListeners[propName];
111 │       if (typeof expression === 'string') {
112 │         // Use the `sourceSpan` for  `keySpan` and `handlerSpan`. This isn't really accurate, but
113 │         // neither is the `sourceSpan`, as it represents the `sourceSpan` of the host itself
114 │         // rather than the source of the host binding (which doesn't exist in the template).
115 │         // Regardless, neither of these values are used in Ivy but are only here to satisfy the
116 │         // function signature. This should likely be refactored in the future so that `sourceSpan`
117 │         // isn't being used inaccurately.
118 ▶         this.parseEvent(
119 │           propName,
120 │           expression,
121 ▶           /* isAssignmentEvent */ false,
122 │           sourceSpan,
123 │           sourceSpan,
124 │           [],
125 │           targetEvents,
126 │           sourceSpan,
127 │         );
```

ホストのイベントは 118 行目でテンプレートの `(event)` と同じ `parseEvent` に渡るので、止めるのは 2 節の 825 行目です。エラーの文も「Cannot have a pipe in an action expression」で、ngtsc がそれを NG5001 として出します。

## 5. 制御フローのブロックと @let

📄 `angular/packages/compiler/src/render3/r3_control_flow.ts` L605–628 （▶ の行: 616, 623, 625）

```ts
605 │   part?: string,
606 │ ): ASTWithSource {
607 │   let start: number;
608 │   let end: number;
609 │ 
610 │   if (typeof part === 'string') {
611 │     // Note: `lastIndexOf` here should be enough to know the start index of the expression,
612 │     // because we know that it'll be at the end of the param. Ideally we could use the `d`
613 │     // flag when matching via regex and get the index from `match.indices`, but it's unclear
614 │     // if we can use it yet since it's a relatively new feature. See:
615 │     // https://github.com/tc39/proposal-regexp-match-indices
616 ▶     start = Math.max(0, ast.expression.lastIndexOf(part));
617 │     end = start + part.length;
618 │   } else {
619 │     start = 0;
620 │     end = ast.expression.length;
621 │   }
622 │ 
623 ▶   return bindingParser.parseBinding(
624 │     ast.expression.slice(start, end),
625 ▶     false,
626 │     ast.sourceSpan,
627 │     ast.sourceSpan.start.offset + start,
628 │   );
```

`@if (…)`・`@switch (…)`・`@case (…)`・`@for` の `of` の右・`@defer (when …)` の式は、ブロックの引数の文字から式の部分を切り出し（616 行目）、623 行目で `parseBinding` に渡します。625 行目の `false` は「ホストではない」。つまりテンプレートの `[prop]` と同じ規則で、pipe は書けます（`@defer` の when の行は[制御フローのブロックの章](../compiler/08-compiler-control-flow-blocks.md)）。

📄 `angular/packages/compiler/src/render3/r3_control_flow.ts` L739–744 （▶ の行: 739, 741–742）

```ts
739 ▶ class PipeVisitor extends RecursiveAstVisitor {
740 │   hasPipe = false;
741 ▶   override visitPipe(): any {
742 ▶     this.hasPipe = true;
743 │   }
744 │ }
```

`track` だけは、`parseBinding` で読んだあとに、この `PipeVisitor` で木を歩き、pipe があれば「Cannot use pipes in track expressions」にします（呼ぶ行は[制御フローのブロックの章](../compiler/08-compiler-control-flow-blocks.md)の 492〜502 行目）。track の式は、行のビューを作り直すかどうかを決める関数になるので（[for と track の章](../template/01-for-track.md)）、pipe のインスタンスを置くビューの枠がありません。パーサーでは止めず、ブロックを組む段で止めている点が、イベントとの違いです。

この `PipeVisitor` と `validateTrackByExpression` は、2025-10 の 62cda789a8c（refactor(compiler): Improve pipe in track expression error、v21.0.0 から）で足されました。コミットの本文は「文脈が分かるように、構文のエラーとして投げる」で、issue #64316（track に pipe を書くとコンパイラが落ち、「Pipes are not allowed in this context」とだけ出て場所が分からない）を閉じています。それまでは、テンプレートのパイプラインの track\_fn\_optimization の段にある `Illegal State: Pipes are not allowed in this context` の throw まで進んでいました。同じコミットで、型チェックの spec（template\_typecheck\_spec.ts）の期待する文が、その Illegal State から「Cannot use pipes in track expressions」に書き換わっています。その throw の行は今も残っています（[制御フローの phase の章](../compiler/15-compiler-control-flow-phases.md)の track\_fn\_optimization）。

### @let は書ける。そして pipe があると TNode を消さない

`@let v = x | p;` は `parseBinding` で読まれ（[制御フローのブロックの章](../compiler/08-compiler-control-flow-blocks.md)の 364〜377 行目）、ふつうに書けます。その先のパイプラインに、pipe のための 1 行があります。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/store_let_optimization.ts` L36–57 （▶ の行: 43–44, 47–49, 51）

```ts
36 │ 
37 │   for (const unit of job.units) {
38 │     for (const op of unit.update) {
39 │       ir.transformExpressionsInOp(
40 │         op,
41 │         (expr) => {
42 │           // If a @let isn't used in other views, we don't have to store its value.
43 ▶           if (expr instanceof ir.StoreLetExpr && !letUsedExternally.has(expr.target)) {
44 ▶             // Furthermore, if the @let isn't using pipes, we can also drop its declareLet op.
45 │             // We need to keep the declareLet if there are pipes, because they can use DI which
46 │             // requires the TNode created by declareLet.
47 ▶             if (!hasPipe(expr)) {
48 ▶               ir.OpList.remove<ir.CreateOp>(declareLetOps.get(expr.target)!);
49 ▶             }
50 │             return expr.value;
51 ▶           }
52 │           return expr;
53 │         },
54 │         ir.VisitorContextFlag.None,
55 │       );
56 │     }
57 │   }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/store_let_optimization.ts` L59–75 （▶ の行: 66–67）

```ts
59 │ 
60 │ /** Determines if a `storeLet` expression contains a pipe. */
61 │ function hasPipe(root: ir.StoreLetExpr): boolean {
62 │   let result = false;
63 │ 
64 │   ir.transformExpressionsInExpression(
65 │     root,
66 ▶     (expr) => {
67 ▶       if (expr instanceof ir.PipeBindingExpr || expr instanceof ir.PipeBindingVariadicExpr) {
68 │         result = true;
69 │       }
70 │       return expr;
71 │     },
72 │     ir.VisitorContextFlag.None,
73 │   );
74 │ 
75 │   return result;
```

1. **43 行目：ほかのビューから読まれない @let は、値を LView に覚えておく必要がない**

   `storeLet`（値を箱に書く命令）を外し、51 行目で値の式だけを残します。
2. **47 行目：pipe を含まなければ、作成の回の declareLet も消す**

   `hasPipe`（59〜75 行目）は式を歩き、66 行目で `PipeBindingExpr` を見つけたら `true`。
3. **44〜46 行目のコメント：pipe があれば declareLet を残す**

   理由は「pipe は DI を使えて、DI には declareLet が作る TNode が要る」。pipe の中の `inject()` は、`ɵɵpipe` が動いた時点の TNode を起点に探すからです。この TNode が誰になるかは[第 5 回](05-pipe-instances-lifecycle.md)で読みます。

## 6. i18n の中

📄 `angular/packages/compiler/src/render3/r3_template_transform.ts` L320–343 （▶ の行: 328, 336, 338）

```ts
320 │     const message = expansion.i18n;
321 │     const vars: {[name: string]: t.BoundText} = {};
322 │     const placeholders: {[name: string]: t.Text | t.BoundText} = {};
323 │     // extract VARs from ICUs - we process them separately while
324 │     // assembling resulting message via goog.getMsg function, since
325 │     // we need to pass them to top-level goog.getMsg call
326 │     Object.keys(message.placeholders).forEach((key) => {
327 │       const value = message.placeholders[key];
328 ▶       if (key.startsWith(I18N_ICU_VAR_PREFIX)) {
329 │         // Currently when the `plural` or `select` keywords in an ICU contain trailing spaces (e.g.
330 │         // `{count, select , ...}`), these spaces are also included into the key names in ICU vars
331 │         // (e.g. "VAR_SELECT "). These trailing spaces are not desirable, since they will later be
332 │         // converted into `_` symbols while normalizing placeholder names, which might lead to
333 │         // mismatches at runtime (i.e. placeholder will not be replaced with the correct value).
334 │         const formattedKey = key.trim();
335 │ 
336 ▶         const ast = this.bindingParser.parseInterpolationExpression(value.text, value.sourceSpan);
337 │ 
338 ▶         vars[formattedKey] = new t.BoundText(ast, value.sourceSpan);
339 │       } else {
340 │         placeholders[key] = this._visitTextWithInterpolation(value.text, value.sourceSpan, null);
341 │       }
342 │     });
343 │     return new t.Icu(vars, placeholders, expansion.sourceSpan, message);
```

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L162–180 （▶ の行: 163–165, 171）

```ts
162 │   /**
163 ▶    * Similar to `parseInterpolation`, but treats the provided string as a single expression
164 ▶    * element that would normally appear within the interpolation prefix and suffix (`{{` and `}}`).
165 ▶    * This is used for parsing the switch expression in ICUs.
166 │    */
167 │   parseInterpolationExpression(expression: string, sourceSpan: ParseSourceSpan): ASTWithSource {
168 │     const absoluteOffset = sourceSpan.start.offset;
169 │ 
170 │     try {
171 ▶       const ast = this._exprParser.parseInterpolationExpression(
172 │         expression,
173 │         sourceSpan,
174 │         absoluteOffset,
175 │       );
176 │       if (ast) {
177 │         this.errors.push(...ast.errors);
178 │       }
179 │       return ast;
180 │     } catch (e) {
```

`<span i18n>{n | p, plural, =1 {one} other {many}}</span>` の `n | p` は ICU の「変数」です。328 行目で変数の印（`VAR_PLURAL` など）を持つものを選び、336 行目で `parseInterpolationExpression` に渡します。163〜165 行目のコメントのとおり、これは `{{ }}` の中身を 1 つの式として読む入口で、171 行目で式のパーサーの同じ名前の関数に渡し、フラグは `None` です。i18n の属性（`i18n-title title="{{ x | p }}"`）は、ふつうの補間と同じ入口です。どちらも pipe は書けます。翻訳の文の中で pipe の値がどう置き換わるかは[ICU のコンパイルの章](../loc/07-loc-icu-compile.md)です。

## 7. | の強さと括弧、矢印関数

`|` は式の階段のいちばん上で読まれるので、いちばん弱く結びつきます（[式のパーサーの章](../compiler/05-compiler-expression-parser.md)の 3 節）。DEMO で確かめられる形です。

| 書き方 | できる木 | 読み方 |
| --- | --- | --- |
| `a ? b : c \| p` | `Conditional(a, b, Pipe(p)[c])` | 三項の分岐は `parsePipe` で読むので、pipe は最後の分岐 `c` にだけ掛かる |
| `x \| p: a ? b : c` | `Pipe(p)[x, Conditional(a, b, c)]` | 引数は `parseExpression` なので三項は入る。裸の `\|` は入らない |
| `(x \| p)?.y` | `(Pipe(p)[x])?.y` | 括弧の中は `parsePipe` からやり直す |
| `x \| p?.y` | エラー「Unexpected token '?.'」 | pipe の名前は識別子 1 つだけ。`?.y` は続きとして読めない |
| `x \| a \| b:1:2` | `Pipe(b)[Pipe(a)[x], 1, 2]` | 左から順に包む。外側の `b` が根 |

📄 `angular/packages/compiler/src/expression_parser/parser.ts` L1727–1733 （▶ の行: 1729–1732）

```ts
1727 │       body = new EmptyExpr(this.span(start), this.sourceSpan(start));
1728 │     } else {
1729 ▶       const prevFlags = this.parseFlags;
1730 ▶       this.parseFlags = ParseFlags.Action; // Arrow function can contain assignments even in a binding context.
1731 ▶       body = this.parseExpression();
1732 ▶       this.parseFlags = prevFlags;
1733 │     }
```

テンプレートの矢印関数（2025-12 の f05d08f4323 で式のパーサーに入り、v21.2.0 から）は、1730 行目で本体を読む間だけ `parseFlags` を `Action` にします。コメントのとおり、本体で代入を書けるようにするためです。その副作用で、本体の中の pipe は 2 節と同じ行で止まります。さらに 1731 行目は本体を `parsePipe` ではなく `parseExpression` で読むので、本体は `|` の手前で終わります。

- `items.map(i => i | p)` は、エラーにならず `items.map(Pipe(p)[(i) => i])` になります。**pipe は矢印関数そのものに掛かります**。型チェックで「`string` を `(value: string, …) => unknown` に入れられない」（TS2345）として初めて分かります（8 節の記録の最後）。
- `items.map(i => (i | p))` は、括弧の中を `parsePipe` で読みますが、フラグが `Action` なのでエラーです。binding の中なのに、エラーの文は「action expression」と言います。

📄 `angular/packages/compiler/test/expression_parser/parser_spec.ts` L1059–1065 （▶ の行: 1063–1064）

```ts
1059 │       it('should parse an arrow function containing an assignment', () => {
1060 │         checkBinding('(a, b) => c = a + b');
1061 │       });
1062 │ 
1063 ▶       it('should be able to pass an arrow function through a pipe', () => {
1064 ▶         checkBinding('(a, b) => a + b | pipe', '((a, b) => a + b | pipe)');
1065 │       });
```

📄 `angular/packages/compiler/test/expression_parser/parser_spec.ts` L1106–1112 （▶ の行: 1107, 1109–1110）

```ts
1106 │       describe('arrow function validations', () => {
1107 ▶         it('should not allow pipe to be used inside an arrow function', () => {
1108 │           expectBindingError(
1109 ▶             '(a, b) => (a + b | pipe)',
1110 ▶             'Cannot have a pipe in an action expression',
1111 │           );
1112 │         });
```

どちらも意図した振る舞いで、spec が固めています。1064 行目は「`(a, b) => a + b | pipe` は `((a, b) => a + b | pipe)`」、つまり関数を pipe に通すこと。1109〜1110 行目は本体の中の pipe がエラーになること。

## 8. DEMO：本物のコンパイラにかける

> **🧪 DEMO — 書いた場所ごとに、受け付けるか・エラーの文・できた木**
>
> ボタンを押すと、このサイトの `@angular/compiler`（22.1.6）をその場で読み込み、テンプレートは `parseTemplate`、ホストは `parseHostBindings` → `makeBindingParser()` の `createDirectiveHostEventAsts`・`createBoundHostProperties`（4 節の 594〜595 行目と同じ順）にかけます。木は `Pipe(名前)[左辺, 引数…]` の形で 1 行にしました。入力を書き換えて試せます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pipe-where-allowed)

「全部を試す」で確かめられることです。

- 通るのは 21 通りのうち 13 通りです。補間・プロパティ・`@let`・`@if` と `@switch`・`@for` の of・`@defer` の when・ICU・i18n の属性と、7 節の優先順位の 5 通りのうちエラーの 1 つを除いた 4 通り、矢印関数の後ろ。
- イベント・双方向・host のイベント・矢印関数の本体の中は、どれも「Cannot have a pipe in an action expression」と、名前を読めなかった 2 つ目のエラー。`x | p?.y` は「Unexpected token '?.'」。
- host のプロパティは括弧の中でも「Host binding expression cannot contain pipes」。track は「Cannot use pipes in track expressions」。

### ngtsc にかけた記録：エラーの番号

ブラウザの `parseTemplate` はエラーの文までで、NG の番号は付きません。番号は ngtsc が付けるので、こちらは Node で本物の `@angular/compiler-cli` を動かした**記録**です（@angular/compiler-cli 22.1.6・TypeScript 6.0.3）。

📄 `src/where.ts（コンパイルしたもの）`

```
import {Component, Directive, Pipe, PipeTransform} from '@angular/core';

@Pipe({name: 'up'})
export class UpPipe implements PipeTransform {
  transform(v: string): string {
    return v.toUpperCase();
  }
}

@Directive({selector: '[hostPipe]', host: {'[title]': 'name | up'}})
export class HostPipeDir {
  name = 'a';
}

@Component({
  selector: 'app-where',
  imports: [UpPipe],
  template: `
    <button (click)="save(name | up)">a</button>
    @for (i of items; track i | up) {{{ i }}}
    {{ items.map(i => (i | up)) }}
    @let v = name | up;
    {{ v }}
  `,
})
export class WhereComponent {
  name = 'a';
  items = ['x'];
  save(_: string) {}
}

```

📄 `src/arrow.ts（コンパイルしたもの）`

```
import {Component, Pipe, PipeTransform} from '@angular/core';

@Pipe({name: 'up'})
export class UpPipe implements PipeTransform {
  transform(v: string): string {
    return v.toUpperCase();
  }
}

@Component({
  selector: 'app-arrow',
  imports: [UpPipe],
  template: `{{ items.map(i => i | up) }}`,
})
export class ArrowComponent {
  items = ['x'];
}

```

📄 `記録の出力（2026-11-09）`

```
== src/where.ts（診断 9 件）
10:55 NG5001 Parser Error: Host binding expression cannot contain pipes[name | up] in src/where.ts@10:43
    @Directive({selector: '[hostPipe]', host: {'[title]': 'name | up'}})
21:24 TS2339 Property 'i' does not exist on type 'WhereComponent'.
    {{ items.map(i => (i | up)) }}
19:36 NG8004 No pipe found with name ''.
    <button (click)="save(name | up)">a</button>
21:23 NG8004 No pipe found with name ''.
    {{ items.map(i => (i | up)) }}
19:22 NG5002 Parser Error: Cannot have a pipe in an action expression at column 13 in [save(name | up)] in src/where.ts@18:21
    <button (click)="save(name | up)">a</button>
19:22 NG5002 Parser Error: Unexpected token ), expected identifier or keyword at column 15 in [save(name | up)] in src/where.ts@18:21
    <button (click)="save(name | up)">a</button>
21:5 NG5002 Parser Error: Cannot have a pipe in an action expression at column 22 in [ items.map(i => (i | up)) ] in src/where.ts@20:4
    {{ items.map(i => (i | up)) }}
21:5 NG5002 Parser Error: Unexpected token ), expected identifier or keyword at column 24 in [ items.map(i => (i | up)) ] in src/where.ts@20:4
    {{ items.map(i => (i | up)) }}
20:23 NG5002 Cannot use pipes in track expressions
    @for (i of items; track i | up) {{{ i }}}
== src/arrow.ts（診断 1 件）
13:36 TS2345 Argument of type 'string' is not assignable to parameter of type '(value: string, index: number, array: string[]) => unknown'.
    template: `{{ items.map(i => i | up) }}`,

```

- テンプレートの式のエラーは NG5002（`TEMPLATE_PARSE_ERROR`）、ホストは NG5001（`HOST_BINDING_PARSE_ERROR`）。track のエラーもパーサーの段のものなので NG5002 です。
- `@let v = name | up;` の 22 行目には何も出ません。
- 矢印関数の本体の中の pipe（21 行目）は、NG5002 が 2 つ、名前が空の NG8004、そして本体の `i` がコンポーネントのプロパティとして読まれた TS2339 の、4 つになります。

📄 `pipe-demo/b/ngc/record.mjs（記録スクリプトの全文。tsconfig.json は strictTemplates）`

```
// 第 4 回 pipe-where-allowed の記録: 書けない場所に pipe を書いて、本物の ngc（@angular/compiler-cli 22.1.6）にかける。
// 使い方: このディレクトリ（src/where.ts・src/arrow.ts と tsconfig.json がある）で node record.mjs
import { readConfiguration, performCompilation } from '@angular/compiler-cli';
import ts from 'typescript';
import { resolve } from 'node:path';

for (const file of ['src/where.ts', 'src/arrow.ts']) {
  const config = readConfiguration('tsconfig.json', { noEmit: true });
  const { diagnostics } = performCompilation({ rootNames: [resolve(file)], options: config.options });
  console.log(`== ${file}（診断 ${diagnostics.length} 件）`);
  for (const d of diagnostics) {
    if (!d.file) {
      console.log('(ファイルの無い診断) ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
      continue;
    }
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    // Angular の診断は code が -99xxxx（NGxxxx）、TypeScript の診断はそのまま TSxxxx
    const code = String(d.code).startsWith('-99') ? 'NG' + String(d.code).slice(3) : 'TS' + d.code;
    const text = ts.flattenDiagnosticMessageText(d.messageText, ' ').replace(process.cwd() + '/', '');
    const src = d.file.text.split('\n')[line].trim();
    console.log(`${line + 1}:${character + 1} ${code} ${text}\n    ${src}`);
  }
}

```

## 9. ここまでを 1 本に

- 👤 `(click)="save(x | p)"` — あなたのテンプレート
  - `parseEvent` → `_parseAction` → `parseAction` — binding\_parser.ts — *ParseFlags.Action*
    - `parseChain` → `parsePipe` → … → `parseCallArguments` — parser.ts L1346
      - `parsePipe`：`|` と Action → `Cannot have a pipe in an action expression` — parser.ts L825
      - `名前を読めない → nameId = ''` — parser.ts L836-837 — *NG8004 '' の元*
- 👤 `host: {'[title]': 'name | up'}` — あなたのデコレーター
  - `verifyHostBindings` → `createBoundHostProperties` — compiler.ts L595 / binding\_parser.ts L76
    - `parseBinding(…, isHost = true)` → `parseSimpleBinding` — binding\_parser.ts L531-532
      - `checkSimpleExpression` → `SimpleExpressionChecker.visitPipe` — parser.ts L141-143 — *NG5001*
- 👤 `@for (i of items | p; track i | p)` — あなたのテンプレート
  - `of`：`parseBlockParameterToBinding` → `parseBinding` — r3\_control\_flow.ts L623 — *通る*
  - `track`：`PipeVisitor.visitPipe` — r3\_control\_flow.ts L741-742 — *NG5002*

## テストと直し方

### spec

| spec | describe / it（行） | この章の節 |
| --- | --- | --- |
| compiler/test/expression\_parser/parser\_spec.ts | describe `parseAction`（35）の it `should error when using pipes`（485） | 2 節 |
| describe `parseBinding`（884）→ `pipes`（885）→ `should parse incomplete pipes`（898）。名前が空の pipe（901・907・913） | 2 節の 836 行目 |   |
| describe `arrow functions`（1030）の it `should be able to pass an arrow function through a pipe`（1063） | 7 節 |   |
| describe `arrow function validations`（1106）の it `should not allow pipe to be used inside an arrow function`（1107） | 7 節 |   |
| describe `parseSimpleBinding`（1604）の it `should report when encountering pipes`（1611）と、括弧・三項・呼び出しの中の pipe の it（1636〜1702） | 4 節 |   |
| compiler/test/render3/r3\_template\_transform\_spec.ts | it `should report pipes in two-way bindings`（709） | 3 節 |
| it `should report a pipe in a track expression`（2465） | 5 節 |   |

📄 `angular/packages/compiler/test/render3/r3_template_transform_spec.ts` L709–713 （▶ の行: 709–711）

```ts
709 ▶     it('should report pipes in two-way bindings', () => {
710 ▶       expect(() => parse(`<div [(prop)]="v | pipe"></div>`)).toThrowError(
711 ▶         /Cannot have a pipe in an action expression/,
712 │       );
713 │     });
```

📄 `angular/packages/compiler/test/render3/r3_template_transform_spec.ts` L2465–2469 （▶ の行: 2465–2467）

```ts
2465 ▶       it('should report a pipe in a track expression', () => {
2466 ▶         expect(() => parse(`@for (item of items; track item.id | json) {}`)).toThrowError(
2467 ▶           /Cannot use pipes in track expressions/,
2468 │         );
2469 │       });
```

709〜711 行目は 3 節を、2465〜2467 行目は 5 節を、テンプレートを `parse` してエラーの文を正規表現で見る形で確かめています。`@let` の中の pipe が declareLet を残すこと（5 節の 47 行目）は、コンパイラの spec ではなく、出力の形を比べる compliance テストが決めています。TEST\_CASES.json の説明は「should not optimize away declareLet if expression is using a pipe」です。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_let/let_with_pipe_optimization.ts` L12–18 （▶ の行: 14–15）

```ts
12 │ @Component({
13 │   template: `
14 ▶     @let foo = (value | double) + 3;
15 ▶     {{foo}}
16 │   `,
17 │   imports: [DoublePipe],
18 │ })
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_let/let_with_pipe_optimization_template.js` L1–18 （▶ の行: 7–8, 12）

```js
 1 │ $r3$.ɵɵdefineComponent({
 2 │   …
 3 │   decls: 3,
 4 │   vars: 3,
 5 │   template: function MyApp_Template(rf, ctx) {
 6 │     if (rf & 1) {
 7 ▶       $r3$.ɵɵdeclareLet(0);
 8 ▶       $r3$.ɵɵpipe(1, "double");
 9 │       $r3$.ɵɵtext(2);
10 │     }
11 │     if (rf & 2) {
12 ▶       const $foo_r1$ = $r3$.ɵɵpipeBind1(1, 1, ctx.value) + 3;
13 │       $r3$.ɵɵadvance(2);
14 │       $r3$.ɵɵtextInterpolate1(" ", $foo_r1$, " ");
15 │     }
16 │   },
17 │   …
18 │ });
```

`foo` はほかのビューから読まれないので、12 行目のとおり値は `const` になり、`storeLet` は消えています（5 節の 43・51 行目）。それでも 7 行目の `ɵɵdeclareLet(0)` は残り、8 行目の `ɵɵpipe(1, "double")` がその直後に来ます。pipe の作成の命令は、pipe を使う命令の「対象」のすぐ後ろに差し込まれるので（[pipe の仕組みの章](../cmn/06-cmn-pipe-mechanism.md)の pipe\_creation）、`ɵɵpipe` が動くとき、今の TNode は 7 行目が作った @let の TNode です。

### 手元で走らせた結果

📄 `走らせたコマンド`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler/test/expression_parser:expression_parser --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler/test/render3:test --nocache_test_results --test_output=all --test_arg=--filter=pipe
pnpm bazel test //packages/compiler-cli/test/compliance/full:full --nocache_test_results --test_output=all --test_arg=--filter=pipe
```

- `//packages/compiler/test/expression_parser:expression_parser`：絞らずに 342 specs、0 failures（2026-11-09、pipe-logs/b-expr.log）。`--test_arg=--filter=pipe` を付けると「Ran 33 of 342 specs」（b-expr-pipe.log）。
- `//packages/compiler/test/render3:test`：`--filter=pipe` で「Ran 13 of 499 specs」、`--filter=track` で 6 件（b-r3-pipe.log・b-r3-track.log）。どれも PASSED。
- `//packages/compiler-cli/test/compliance/full:full`：`--filter=pipe` で、2 つの shard（`shard_count = 2`）が「Ran 7 of 605」「Ran 12 of 610」、合わせて 19 件が PASSED（b-compliance-pipe.log）。説明に pipe を含む test case が当たります。
- どちらも Node の jasmine なので、名前の絞り込みが効きます。filter は正規表現で、大文字・小文字を区別します（`Pipe` を含む名前は `pipe` では当たりません）。

### 直すとしたら

- action で止める行は parser.ts の `parsePipe`（825 行目）、矢印関数の本体のフラグは `parseArrowFunction`（1730 行目）。it は parser\_spec.ts の `expectActionError` / `expectBindingError` の形で足します。
- ホストは `parseSimpleBinding` と `SimpleExpressionChecker`、エラーの文は `getParseError`（1903 行目）。it は describe `parseSimpleBinding` の `expectError(validate(parseSimpleBinding(…)), …)` の形です。
- track は r3\_control\_flow.ts の `validateTrackByExpression` と `PipeVisitor`。it は r3\_template\_transform\_spec.ts の `expect(() => parse(…)).toThrowError(…)` の形です。
- 名前が空の pipe から NG8004 が出る流れは、型チェックの側（[型チェックの pipe の章](../typecheck/15-typecheck-refs-pipes.md)）とパーサーの両方にまたがります。

## 聞かれそうな質問

**Q. (click) の中で pipe を使えないのはなぜですか？**

イベントの式は `parseAction` で読まれ、`_ParseAST` の `parseFlags`（594 行目）が `Action` になります。`parsePipe` は `|` を見るとこのフラグを確かめてエラーにします（825 行目）。pipe は更新の回に `ɵɵpipeBindN` として呼ばれる仕組みで、イベントの式は更新の回に動かないので、置く場所がありません。値を変換したいなら、コンポーネントのメソッドで変換して渡します。

**Q. (click)="f(x | p)" のように括弧に入れても駄目ですか？**

駄目です。引数は 1346 行目で `parsePipe` から読み直しますが、フラグは同じ `_ParseAST` のフィールドなので `Action` のままです。エラーのあと名前が読み飛ばされ、836〜837 行目の「名前が空の pipe」が残るので、NG8004 も一緒に出ます。

**Q. host: {'\[title\]': 'x | p'} が駄目なのに、テンプレートの \[title\]="x | p" はよいのはなぜですか？**

ホストのプロパティは 79 行目の `isHost = true` で `parseSimpleBinding` に回り（531〜532 行目）、141〜143 行目で木の全部から pipe を探してエラーにするからです。ngtsc はそれを NG5001 にします。ホストのバインディングには、pipe のインスタンスを置くテンプレートのビューがありません。

**Q. @for の of と track で扱いが違うのはなぜですか？**

どちらも `parseBinding` で読みますが（623 行目）、track だけはそのあと `PipeVisitor`（739〜744 行目）で pipe を探してエラーにします。of は変更検知のたびに読む値で、track は行を作り直すかを決める関数になるからです。

**Q. items.map(i =&gt; i | p) がエラーにならないのに、思った結果になりません。**

矢印関数の本体は 1731 行目で `parseExpression` で読まれ、`|` の手前で終わります。だから pipe は矢印関数そのものに掛かり、`items.map(p(i => i))` の意味になります（spec 1064 行目）。本体の中で変換したいときに `(i | p)` と括弧で包むと、1730 行目のフラグでエラーです。

**Q. a ? b : c | p の pipe はどこに掛かりますか？**

`c` だけです。三項演算子の分岐は `parsePipe` で読まれるので、`Conditional(a, b, Pipe(p)[c])` になります。全体に掛けたいときは `(a ? b : c) | p` と書きます。

## 読み終えて

- pipe が書けるのは、式が binding（値を読む式）として読まれる場所。止めるのは `parseFlags` が `Action` の `parsePipe`（825 行目）、ホストの `SimpleExpressionChecker`、track の `PipeVisitor` の 3 か所。
- イベント・双方向のイベント側・host のイベント・矢印関数の本体は、どれも Action のフラグで止まる。括弧や引数の中でも同じ。
- `@let`・`@if`・`@switch`・`@for` の of・`@defer` の when・ICU・i18n の属性は書ける。`@let` に pipe があると declareLet の TNode が残る（DI のため）。
- エラーの番号はテンプレートが NG5002、ホストが NG5001。1 つの書き間違いに、名前が空の pipe から来る NG8004 などが続くので、最初のエラーを読む。
- `|` はいちばん弱い。三項の後ろ・矢印関数の後ろに書くと、思った範囲に掛からない。

---

← 前: [名前の解決：imports に入れた pipe が、テンプレートの名前と結ばれるまで](03-pipe-name-resolution.md)  
次: [インスタンスの数と寿命：@for の中の pipe、inject、ngOnDestroy](05-pipe-instances-lifecycle.md) →
