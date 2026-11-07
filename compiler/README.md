[目次](../README.md)

# テンプレートコンパイラの内側

> template: の文字列が、どの段を通って ɵɵelementStart の列になるか

コンポーネントの template は、ビルド時に 5 つの段を通って JavaScript の関数になります。HTML の字句解析と構文解析で要素の木を作り、式のパーサとバインディングのパーサで \[prop\] や (event) や {{ }} を式の木にし、R3 AST という Angular 専用の木に組み替えます。そこからディレクティブを照合し、テンプレートパイプラインの IR（create と update の 2 本の命令リスト）に写して、74 個のフェーズで slot の番号、変数、定数配列、advance() を決め、最後に出力用の AST から JS を書き出します。同じ R3 AST から型検査用の TypeScript（Type Check Block）も作られます。compiler と compiler-cli の実際の行で、1 ステップずつ追います。

全 18 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/compiler)

1. [テンプレートが JS になるまで：パーサ・R3 AST・IR・74 個のフェーズの全体図](01-compiler.md)  
   実際の ngc 出力を見ながら、テンプレート文字列 → トークン → HTML AST → R3 AST → IR → 74 個のフェーズ → 出力という全体図と、AOT・JIT・リンカが同じ compileComponentFromMetadata に合流することを押さえる。
2. [コンパイラの入口：ngtsc の ComponentDecoratorHandler から compileComponentFromMetadata まで](02-compiler-entry.md)  
   ngtsc がデコレータを analyze → resolve → compileFull の順で処理し、resources.ts が template / templateUrl を読んで parseTemplate を呼ぶ行、parseTemplate の主なオプション（preserveWhitespaces、enableBlockSyntax、enableLetSyntax など。interpolation は形を検査されるだけで使われない）、compileComponentFromMetadata が ingestComponent → transform → emitTemplateFn の 3 手で template 関数を作り、ɵɵdefineComponent の引数を組み立てる流れ。シリーズ全体の入口と出口をつなぐ。
3. [HTML の字句解析：テンプレートの文字列がトークンの列になるまで](03-compiler-html-lexer.md)  
   ml\_parser/lexer.ts の tokenize が \_Tokenizer で 1 文字ずつ読み、TAG\_OPEN\_START / ATTR\_NAME / TEXT / INTERPOLATION / BLOCK\_OPEN\_START / LET\_START などのトークンを作る手順。カーソル（PlainCharacterCursor / EscapedCharacterCursor）、{{ }} を TEXT の中で切り出す行、@if などのブロック構文と @let を見分ける行、&lt;script&gt; や &lt;textarea&gt; の中身を生のテキストとして読む理由。
4. [HTML の構文解析：トークンから要素の木へ、暗黙の閉じタグと空白の除去](04-compiler-html-parser.md)  
   ml\_parser/parser.ts の \_TreeBuilder がトークンを読みながら要素のスタックを積み、閉じタグの無い要素（&lt;p&gt; の中の &lt;div&gt; など）を html\_tags.ts の定義で暗黙に閉じる行、void 要素、ブロック（@if { }）とその閉じ括弧、エラーの集め方（TreeError）。html\_whitespaces.ts の WhitespaceVisitor が preserveWhitespaces: false のとき何を消し、&ngsp; と ngPreserveWhitespaces で何を残すか。
5. [式のパーサ：{{ a?.b | pipe }} が AST になるまで](05-compiler-expression-parser.md)  
   expression\_parser/lexer.ts が式を Token（識別子・キーワード・演算子・文字列・数値）に分け、parser.ts の \_ParseAST が優先順位ごとの関数（parsePipe → parseExpression → parseConditional → … → parsePrimary）で再帰下降する手順。パイプが一番弱い演算子である理由、?. の SafePropertyRead / SafeKeyedRead / SafeCall、テンプレートで使えない構文（代入の制限、new など）をどこで弾くか、エラーからの回復。
6. [バインディングのパーサ：\[prop\]・(event)・\[attr.x\]・\[class.x\]・\[(x)\] と \*ngFor の微小構文](06-compiler-binding-parser.md)  
   r3\_template\_transform が属性名の接頭辞（bind- / on- / bindon- / \[ \] / ( ) / \[( )\] / \* / # / ref- / let- / @）を見分け、template\_parser/binding\_parser.ts の BindingParser が parsePropertyBinding / parseEvent / parseInterpolation で ParsedProperty と ParsedEvent を作る行。\[attr.\] \[class.\] \[style.\] の BindingType、セキュリティコンテキストの決め方、\*ngFor="let x of xs; trackBy: f" を parseTemplateBindings が key と value の組に分ける手順。
7. [R3 AST：HTML の木を Angular の木に組み替える htmlAstToRender3Ast](07-compiler-r3-ast.md)  
   r3\_template\_transform.ts の HtmlAstToIvyAst が HTML の Element を r3\_ast.ts の Element / Template / Content / Text / BoundText に変える手順。&lt;ng-template&gt; と \* 付き要素が Template になる行、inputs / outputs / attributes / references / variables の振り分け、&lt;ng-content select&gt; の扱い、ngNonBindable、i18n メタデータの付き方。R3 AST の各ノードの形を表にまとめる。
8. [@if・@for・@switch・@defer・@let がノードになるまで：ブロック構文の解析](08-compiler-control-flow-blocks.md)  
   r3\_control\_flow.ts が @if / @else if / @else を IfBlock と IfBlockBranch に、@for の「item of items; track item.id; let i = $index」を ForLoopBlock に分解する行（track が必須である理由、暗黙変数 $index など）、@switch、r3\_deferred\_blocks.ts と r3\_deferred\_triggers.ts が @defer のトリガーと @placeholder / @loading の minimum / after を読む行、@let が LetDeclaration になる行。
9. [ディレクティブの照合：R3TargetBinder と SelectorMatcher](09-compiler-binder.md)  
   t2\_binder.ts の R3TargetBinder.bind が、テンプレートの各要素について directive\_matching.ts の SelectorMatcher でセレクタを照合し、どのディレクティブ・コンポーネントが付くかを決める手順。CssSelector の分解、:not() の扱い、#ref がどこを指すか、テンプレート変数のスコープ（Scope）、パイプ名の収集（usedPipes）、BoundTarget が後段（依存の絞り込み・型検査）に渡す情報。
10. [IR への写像：ingestComponent が R3 AST を create と update の命令リストにする](10-compiler-ingest.md)  
   template/pipeline/src/ingest.ts の ingestComponent が ComponentCompilationJob を作り、ingestNodes が Element / Template / Text / BoundText / 各ブロックを ir の CreateOp と UpdateOp に写す行。ElementStartOp / ElementEndOp、BindingOp（後の specializeBindings で PropertyOp になる）、InterpolateTextOp、ListenerOp の作り方、子テンプレートが別の ViewCompilationUnit になる理由、xref（参照番号）の振り方。
11. [テンプレートパイプラインの IR：OpList・Xref・SlotHandle・式の木](11-compiler-ir.md)  
   template/pipeline/ir の OpList（双方向リスト）と、その上での挿入・置換・削除の操作、CreateOp と UpdateOp の種類（OpKind）、ConsumesSlotOpTrait / ConsumesVarsTrait などの trait、SlotHandle が後のフェーズで番号を受け取る仕組み、ir の式（ReadVariableExpr、LexicalReadExpr、PureFunctionExpr など）と transformExpressionsInOp。フェーズがこの IR をどう書き換えるかの共通の形。
12. [decls・vars・advance()：slot の割り当てとバインディングの数え方](12-compiler-slots-vars.md)  
   slot\_allocation.ts が create 命令に 0 から順に slot 番号を振り、その合計が decls になる行、var\_counting.ts が各 update 命令の消費する変数の数を数えて vars を決める行（interpolation の引数の数、pure function など）、generate\_advance.ts が update 命令の間に advance(n) を挟む行。実際の出力と数を突き合わせて確かめる。
13. [ctx・nextContext・restoreView：テンプレート変数とコンテキストの解決](13-compiler-variables.md)  
   resolve\_names.ts が式の中の名前をコンポーネントのプロパティ（ctx.x）、テンプレート変数、#ref のどれかに決める行、generate\_variables.ts が子テンプレートで親の変数を読むための SemanticVariable を作る行、resolve\_contexts.ts と nextContext、リスナーの中で save\_restore\_view.ts が ɵɵrestoreView / ɵɵresetView を入れる理由、variable\_optimization.ts が使われない変数を消す行。
14. [定数配列と pure function：consts・AttributeMarker・ɵɵpureFunction](14-compiler-consts-pure.md)  
   const\_collection.ts が静的な属性・クラス・スタイル・テンプレート属性を AttributeMarker で区切った配列にまとめ、consts のインデックスで共有する行、pure\_literal\_structures.ts と pure\_function\_extraction.ts が \[x\]="\[a, b\]" の配列リテラルを ɵɵpureFunction2 に変えて毎回の生成を避ける理由、chaining.ts が同じ命令の連続を ɵɵproperty(...)(...) の連鎖にまとめる行。
15. [@if・@for・@defer の命令ができるまで：conditional・repeater・defer のフェーズ](15-compiler-control-flow-phases.md)  
   ingest がブロックを ConditionalOp / RepeaterCreateOp / DeferOp にした後、conditionals.ts が分岐を 1 つの条件式（どのテンプレートを出すかの番号）にまとめる行、track\_fn\_optimization.ts が track $index / $item / メソッド呼び出しを ɵɵrepeaterTrackByIndex などに置き換える行と、それ以外（track item.id）を reify が共有の矢印関数にする行、defer\_configs.ts が時間の consts を作り、resolve\_defer\_deps\_fns.ts が依存関数の名前を付け、compiler-cli の compileDeferResolverFunction が import() の関数を作る流れ。出力例で確かめる。
16. [reify と出力：IR を ɵɵ 命令の呼び出しにして JS を書き出す](16-compiler-reify-emit.md)  
   reify.ts が各 IR 命令を r3\_identifiers の ɵɵelementStart / ɵɵproperty / ɵɵtextInterpolate などの呼び出し式（output\_ast）に置き換える行、emitTemplateFn が create ブロック（rf & 1）と update ブロック（rf & 2）を組み立てる行、子テンプレートの関数名の付け方（naming.ts）、compiler-cli の translator が output\_ast を TypeScript の AST に変えて .js に書き出す流れ。
17. [型検査：Type Check Block（TCB）がテンプレートを TypeScript にする](17-compiler-typecheck.md)  
   compiler/src/typecheck/type\_check\_block.ts の generateTypeCheckBlock が R3 AST と BoundTarget から、テンプレートの各バインディングを TypeScript の式に書き直した関数を文字列で組み立てる手順。ops の要素・入力・イベント・@if の型の絞り込み・@for、strictTemplates（v22 では書かなければ真）で変わるもの、codegen.ts が書く /\*start,end\*/ の位置コメントを compiler-cli が読んで TS のエラー位置をテンプレートに戻す仕組み。TypeCheckContext と shim ファイル。
18. [スタイルのカプセル化：shadow\_css.ts が CSS セレクタを書き換える](18-compiler-shadow-css.md)  
   ViewEncapsulation.Emulated のとき、shadow\_css.ts の ShadowCss.shimCssText がコンポーネントの CSS を読み、各セレクタに \[\_ngcontent-%COMP%\] を付け、:host を \[\_nghost-%COMP%\] に、:host-context と ::ng-deep を書き換える行。コメントと文字列の退避、@media / @supports の中身の扱い、%COMP% が実行時に platform-browser の EmulatedEncapsulationDomRenderer2 で APP\_ID と ɵcmp.id に置き換わる場所。
