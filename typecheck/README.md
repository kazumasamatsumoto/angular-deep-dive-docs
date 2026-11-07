[目次](../README.md)

# テンプレート型チェックの内側

> ngtsc の型チェックブロック・型コンストラクタ・診断の対応付け・拡張診断

テンプレートに {{ user.nmae }} と書き間違えると、ng build が TS2339 のエラーを出し、テンプレートの行を指します。TypeScript はテンプレートを読めないのに、なぜそうなるのか。Angular のコンパイラ（ngtsc）は、テンプレートを「型チェックブロック」（TCB）という、実行されない TypeScript の関数に書き直し、それを足した ts.Program を TypeScript に型チェックさせ、出てきたエラーをテンプレートの位置に戻しています。このシリーズは、その流れを設定・TCB を置く場所・式・要素・ディレクティブ・入力・出力・制御フロー・参照と pipe の順に 1 つずつ読み、診断の対応付け、TypeScript では見つけられない「帯域外の診断」、拡張診断、言語サービスが使う TemplateTypeChecker まで進みます。ページの上のデモは、このサイトに入っている本物の @angular/compiler の generateTypeCheckBlock で、入力したテンプレートの TCB をその場で生成します。各章の最後に、その仕組みを確かめている spec と、手元での走らせ方を置きます。最終回は、開いている issue と、それに付いた PR を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/typecheck)

1. [テンプレート型チェックの全体像：TCB を作って TypeScript に任せる](01-typecheck-overview.md)  
   typecheck の README が書く 5 つの手順（解析 → TCB の生成 → 派生 ts.Program → 診断 → テンプレートへの対応付け）と、compiler パッケージ（TCB の生成）と compiler-cli（置き場所・プログラム・診断）の分担。ページの上で本物の generateTypeCheckBlock を動かし、テンプレートから TCB を作る。spec の置き場と、type\_check\_block\_spec が使う tcb() という助け。
2. [strictTemplates が TypeCheckingConfig になるまで](02-typecheck-config.md)  
   tsconfig の angularCompilerOptions（strictTemplates と、strictInputTypes などの個別の strict フラグ）が、NgCompiler の getTypeCheckingConfig で TypeCheckingConfig の 26 項目に展開される行と、個別のフラグが表に勝つ優先順位。strictTemplates が既定で真になった変更（PR #67802）と fullTemplateTypeCheck の削除（#67792）、どの項目が TCB のどこを変えるか。
3. [TypeCheckContext：TCB をどこに置くか](03-typecheck-context.md)  
   TypeCheckContextImpl.addTemplate がコンポーネントごとに TCB を作り、型チェック用の shim ファイル（.ngtypecheck.ts）に置くか、元のファイルの中に inline で置くかを決める行。inline が要る場合（ジェネリックで型引数を外に出せない、export されていないクラス）、型コンストラクタの置き場所、pendingShimForComponent。
4. [派生した ts.Program と、作り直しの節約](04-typecheck-program-driver.md)  
   ProgramDriver（TsCreateProgramDriver）が、元のプログラムに TCB の入った shim を足した ts.Program を作る行。前回のプログラムを oldProgram に渡して TypeScript に差分だけを見させる仕組み、shim の再利用、言語サービスでのファイルの差し替え。incremental\_typecheck\_spec が確かめていること。
5. [Environment と TCB アダプタ：参照を TypeScript の式にする](05-typecheck-environment.md)  
   TCB の中でコンポーネント・ディレクティブ・pipe・外部の型をどう書くかを決める Environment / ReferenceEmitEnvironment と、ts の宣言を AST を持たないメタデータ（TcbDirectiveMetadata など）に移す tcb\_adapter.ts。ネイティブのプリプロセッサにつなぐための設計。
6. [Scope と TcbOp：遅れて実行される操作の表](06-typecheck-scope.md)  
   Scope.forNodes がテンプレートの各ノードを TcbOp の列にし、render が頭から、resolve が必要になったものを先に実行する仕組み。optional な op（要素・参照）は求められたときだけ書かれる。循環したときの circularFallback（null! と、型コンストラクタをもう 1 回呼ぶ op）、op の種類の一覧、ネストした Scope と、名前ではなくノードで引いて親へたどる探し方。
7. [テンプレートの式を TypeScript の式に書き直す](07-typecheck-expressions.md)  
   ops/expression.ts の tcbExpression と resolve（Scope を知る側）と、expression.ts の TcbExprTranslator（知らない側）の分担。演算子・関数呼び出し・$any()・代入・安全な参照（?.）・non-null（!）・テンプレートリテラル・typeof / void を TypeScript の式にする行と、括弧と位置のコメント /\*start,end\*/ の付け方。strictSafeNavigationTypes で ?. が変わる理由（View Engine の推論の再現を含む）、2026-08 の optional chaining の修正（e9ba39d671a）。
8. [要素・DOM のスキーマ・ホストバインディング](08-typecheck-elements-dom.md)  
   TcbElementOp が document.createElement で要素の型を作る行、DomSchemaChecker が知らない要素や属性を見つける仕組み（CUSTOM\_ELEMENTS\_SCHEMA と NO\_ERRORS\_SCHEMA）、checkTypeOfDomBindings。ホストバインディングを型チェックする host\_bindings.ts と、TCB の中の if (true) と別のブロック。
9. [型コンストラクタ：ジェネリックなディレクティブの型を推論させる](09-typecheck-type-constructor.md)  
   ジェネリックなディレクティブ（NgForOf&lt;T&gt; など）の T を、入力の値から TypeScript に推論させる「型コンストラクタ」の形と、TcbDirectiveCtorOp・TcbDirectiveTypeOp の使い分け。型引数を TCB に書き出せるかを決める TypeParameterEmitter、書き出せないときに inline に回るか any にする仕組み。
10. [入力の型チェック：代入・coercion・transform・input()](10-typecheck-inputs.md)  
   TcbDirectiveInputsOp が入力のバインディングを「ディレクティブのプロパティへの代入」として書く行。ngAcceptInputType と input の transform の型、input() の InputSignal が ɵINPUT\_SIGNAL\_BRAND\_WRITE\_TYPE で書き込みの型を表す仕組み、required の入力の欠落、readonly・private の入力（honorAccessModifiersForInputBindings）。
11. [出力とイベント：$event の型](11-typecheck-outputs-events.md)  
   TcbDirectiveOutputsOp と TcbUnclaimedOutputsOp が (event) を subscribe や addEventListener の呼び出しとして書き、$event に型を付ける行。output() と EventEmitter、DOM イベントの型（checkTypeOfDomEvents）、keyup.enter のような修飾付きのイベントの型、アニメーションのイベント。
12. [双方向バインディングと model()・\[formField\]](12-typecheck-two-way.md)  
   \[(x)\] が入力と出力の 2 つとして TCB に書かれる行、signal を直接渡す双方向バインディング（allowSignalsInTwoWayBindings）と model() の型、signal forms の \[formField\] を特別に扱う signal\_forms.ts。双方向バインディングで出力の型が見られない開いている issue。
13. [@if・@for・@switch・@let の型の絞り込み](13-typecheck-control-flow.md)  
   @if の as の別名を if の前の var にする行、@for の $index などの暗黙の変数（null! as number）と track の式、@switch の case と、リスナーの中に再掲するガード（=== と、default なら他の全部の !==）、@default never を never への代入にする行、@let を TCB の const にする行。checkControlFlowBodies を見るブロックと見ないブロック（@defer の中身は常に検査）、@defer の trigger、22.2 の keyed defer と @boundary。
14. [ng-template と構造ディレクティブ：ngTemplateContextGuard と ngTemplateGuard\_](14-typecheck-template-guards.md)  
   &lt;ng-template&gt; の let- 変数の型を、ディレクティブの静的メソッド ngTemplateContextGuard で決める行と、\*ngIf の型の絞り込みを ngTemplateGuard\_ で表す仕組み（invocation と binding）。applyTemplateContextGuards が偽のとき、ng-template に型引数を付けたいという長く開いている issue。
15. [テンプレート参照（#ref）と pipe の型](15-typecheck-refs-pipes.md)  
   #ref が要素・ディレクティブ・TemplateRef のどれを指すかを TcbReferenceOp が決める行、checkTypeOfDomReferences と checkTypeOfNonDomReferences、exportAs。pipe の呼び出しを pipeInst の transform として書く仕組み、checkTypeOfPipes が偽のとき、pipe の宣言が見つからないときの診断。
16. [TCB の診断をテンプレートの位置に戻す](16-typecheck-diagnostics-mapping.md)  
   TypeScript が TCB に出した診断を、TCB に付けた位置のコメント（/\*start,end\*/、/\*D:ignore\*/、/\*T:...\*/、/\*tcb1\*/）から元のテンプレートの位置に戻す仕組み。先祖の D:ignore で捨てる 2 段の親たどり（findSourceLocation と getTypeCheckId）、番号で捨てる診断（shouldReportDiagnostic）、DirectiveSourceManager と外部テンプレートの行と列、direct・external・indirect の makeTemplateDiagnostic、TS2339 と NG 番号の出どころ、span\_comments\_spec。
17. [帯域外の診断：TypeScript では見つけられないエラー](17-typecheck-oob.md)  
   OutOfBandDiagnosticRecorder が TCB を作りながら記録する 22 種類のエラー（存在しない #ref の exportAs、知らない pipe、必須の入力の欠落、@for の track で読めない変数、ng-content に届かない制御フロー、@let への代入など）を、呼んでいる op と一緒に一覧にし、実装が NG8xxx の ts.Diagnostic を作る行、TCB の後で TemplateSemanticsChecker がテンプレート変数への代入を見つける行を読む。エラー番号（負の値はエラーガイドの印、99 を付けて TypeScript の診断に載せる）の決まりと、呼ぶ場所の無くなった suboptimalTypeInference。
18. [拡張診断：16 の検査と、それを足す方法](18-typecheck-extended.md)  
   ExtendedTemplateCheckerImpl が TemplateCheck の一覧を TCB とテンプレートの AST の両方を見て走らせる仕組みと、16 の検査（invalid\_banana\_in\_box・nullish\_coalescing\_not\_nullable・interpolated\_signal\_not\_invoked など）のうち数個を 1 行ずつ。extendedDiagnostics の設定で警告・エラー・抑止を選ぶ行、新しい検査を足すときに触るファイルの一覧。
19. [TemplateTypeChecker：言語サービスが型を尋ねる窓口](19-typecheck-template-type-checker.md)  
   TemplateTypeCheckerImpl.getSymbolOfNode が shim の中の TCB を探し、SymbolBuilder が位置コメント（findFirstMatchingNode）でテンプレートの節点に当たる TCB の位置（TcbLocation）を決め、getTypeOfSymbol がその位置で ts.TypeChecker に型を尋ねる仕組み。enableTemplateTypeChecker で TCB に足される補完点（this.）と getGlobalCompletions、言語サービスのホバーが getSymbolOfNode の位置で TypeScript の言語サービスに尋ねる流れ。
20. [issue と PR を読む：テンプレート型チェックの今](20-typecheck-issues.md)  
   compiler: template type-checking と compiler: extended diagnostics のラベルで開いている 25 件と、この 1 年に閉じた 10 件の表。PR が付いたのに閉じないもの（双方向バインディングの出力の型、ジェネリックの推論）、長く開いている設計の問題（ng-template の型、属性セレクタの import 忘れ、型チェックをビルドの外へ）、?. の一連の修正、新しい private アクセスの要望。どの issue がこのシリーズのどの章に関係するか。
