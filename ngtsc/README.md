[目次](../README.md)

# ngtsc の内側

> NgtscProgram・NgCompiler・TraitCompiler・リフレクション・静的な評価・参照と import・.d.ts・差分ビルド・循環・HMR・診断

ng build や ngc を走らせると、TypeScript のプログラムの横で Angular のコンパイラ本体 ngtsc が動きます。ngtsc はクラスに付いたデコレーターを見つけ、@Component や @Directive の引数を TypeScript を動かさずに読み（静的な評価）、クラスごとに「解析・解決・出力」の段を進めて、ɵcmp や ɵfac のような静的なフィールドを JS と .d.ts に書き足します。2 回目からのビルドでは、前のビルドの結果のうち変わっていないクラスを使い回し、公開の形が変わったクラスに頼るものだけを作り直します。テンプレートのコンパイラ（compiler シリーズ）とテンプレートの型チェック（typecheck シリーズ）がこの流れの一部分だとすると、このシリーズはそれを囲む外側の枠を読みます。NgtscProgram と NgCompiler の作られ方、TypeScript の AST からクラスとデコレーターを読むリフレクション、静的な評価、参照を import の文に直す仕組み、TraitCompiler の状態の移り方、ディレクティブと pipe の handler、.d.ts から他のライブラリのメタデータを読む仕組み、JS と .d.ts の書き換え、差分ビルドと意味のグラフ、import の循環、HMR、診断と性能の記録、そして ngtsc のテストの書き方を 1 つずつ読みます。ページの上のデモは、本物の @angular/compiler をブラウザで動かすか、このサイトに入っている本物の @angular/compiler-cli を手元の Node で動かして記録した結果を見せます。各章の最後に、その仕組みの spec と手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/ngtsc)

1. [ngtsc の全体像：tsc の横で動くもう 1 つのコンパイラ](01-ngtsc-overview.md)  
   packages/compiler-cli/src/ngtsc のディレクトリの分担（core・transform・annotations・reflection・partial\_evaluator・imports・metadata・scope・incremental・cycles・typecheck・hmr・perf・diagnostics）と、ngc の入口 main.ts から NgtscProgram・NgCompiler・TraitCompiler・DecoratorHandler までの層。テンプレートのコンパイラ（@angular/compiler）との分担。各章へのリンク。
2. [NgtscProgram と NgCompilerHost：TypeScript のプログラムを包む](02-ngtsc-program.md)  
   NgtscProgram のコンストラクタが CompilerHost を NgCompilerHost で包み、shim（型チェック用の .ngtypecheck.ts など）を足した ts.Program を作るまで、前のプログラムを再利用する oldProgram の扱い、emit() が NgCompiler の prepareEmit から変換を受け取り TypeScript の emit に渡す流れ。tsc\_plugin.ts（tsc のプラグインとして動く形）との違い。
3. [NgCompiler とチケット：新しく作るか、前の結果から作るか](03-ngtsc-compiler-ticket.md)  
   CompilationTicket の 3 つの種類（Fresh・IncrementalTypeScript・IncrementalResource）と、それを作る 4 つの関数（freshCompilationTicket・incrementalFromCompilerTicket・incrementalFromStateTicket・resourceChangeTicket）、NgCompiler.fromTicket が new するか前のインスタンスを返すかを分ける行、遅れて作られる LazyCompilationState（ensureAnalyzed・analyzeSync・analyzeAsync）、makeCompilation が reflector・参照の書き手・評価器・メタデータの読み手・スコープ・6 つの handler・TraitCompiler を組み立てる順番と prepareEmit の変換の並び。resource-only の道が出力のテンプレートを新しくしないこと。
4. [リフレクション：TypeScript の AST からクラスとデコレーターを読む](04-ngtsc-reflection.md)  
   ReflectionHost の約束（getDecoratorsOfDeclaration・getMembersOfClass・getConstructorParameters・getImportOfIdentifier・getDeclarationOfIdentifier）と TypeScriptReflectionHost の実装、コンストラクタの引数の型を値に戻す typeToValue（import type だと注入できない理由）、ClassMember の種類。
5. [静的な評価：デコレーターの引数を、動かさずに読む](05-ngtsc-partial-evaluator.md)  
   PartialEvaluator と StaticInterpreter が式をたどって ResolvedValue（数・文字列・Map・配列・Reference・EnumValue・DynamicValue）にする行、別のファイルの const や関数をたどる仕組み、評価できないときの DynamicValue と、その理由を診断に書く traceDynamicValue、組み込みの関数（配列の slice・concat など）と foreign function resolver。
6. [参照と import：クラスへの参照を出力の式にする](06-ngtsc-references-imports.md)  
   Reference が「どこから見えるか」（bestGuessOwningModule・identifiers）を覚える仕組み、ReferenceEmitter が makeCompilation の並べた strategy（ふつうは LocalIdentifierStrategy → AbsoluteModuleStrategy → RelativePathStrategy、rootDirs があれば 3 つ目が LogicalProjectStrategy、UnifiedModulesHost なら LocalIdentifierStrategy → AliasStrategy → UnifiedModulesStrategy）を前から試して式を作る行、ImportFlags、エクスポートされていないクラスを参照したときのエラー、AliasingHost。
7. [TraitCompiler（1）：デコレーターを見つけて解析する](07-ngtsc-trait-analyze.md)  
   DecoratorHandler の約束（detect・preanalyze・analyze・symbol・register）と HandlerPrecedence（PRIMARY・SHARED・WEAK。WEAK の handler は今は無い）、TraitCompiler.analyze がファイルのクラスを回して detectTraits で trait を作り、analyzeTrait で Pending から Analyzed に移す行（失敗は analysis が null の Analyzed。Skipped は adopt でしか作られない）、trait.ts の状態の移り方、非同期の preanalyze（外部のテンプレートやスタイルを読む）。
8. [TraitCompiler（2）：解決して、静的なフィールドを作る](08-ngtsc-trait-resolve-compile.md)  
   TraitCompiler.resolve が Analyzed の trait を Resolved に移し、handler の resolve の診断と data を集める行、compile が CompilationMode（FULL・PARTIAL・LOCAL）で compileFull・compilePartial・compileLocal を選んで CompileResult（ɵcmp・ɵfac などの名前・初期値・型・文）を返すまで、decoratorsFor が消すデコレーター、ConstantPool。
9. [DirectiveDecoratorHandler：@Directive を解析する](09-ngtsc-directive-handler.md)  
   DirectiveDecoratorHandler の detect・analyze（extractDirectiveMetadata で selector・inputs・outputs・host・queries・exportAs・hostDirectives を読む）・symbol（DirectiveSymbol）・register・resolve・compileFull の流れ、継承したメタデータ、抽象クラスの扱い、R3DirectiveMetadata を @angular/compiler の compileDirectiveFromMetadata に渡すところ。コンポーネントの handler（既存の章）との違い。
10. [メタデータの登録と読み出し：pipe の handler と LocalMetadataRegistry](10-ngtsc-metadata-registry.md)  
   PipeDecoratorHandler の analyze・register（registerPipeMetadata）を例に、handler が解析の結果を CompoundMetadataRegistry（LocalMetadataRegistry と LocalModuleScopeRegistry に配る）に書き、CompoundMetadataReader（ローカル → .d.ts の順）でほかの部品が読む仕組み、DirectiveMeta・PipeMeta・NgModuleMeta の形（metadata/src/api.ts）、継承をたどって inputs・outputs を子が勝つ形で 1 つにまとめる flattenInheritedDirectiveMetadata（queries は合わせない・途中に登録されないクラスがあると 'dynamic' で止まる）と HostDirectivesResolver。
11. [.d.ts からメタデータを読む：DtsMetadataReader](11-ngtsc-dts-metadata.md)  
   node\_modules のライブラリはソースではなく .d.ts で来る。DtsMetadataReader が static ɵdir / ɵcmp: i0.ɵɵDirectiveDeclaration&lt;…&gt; の型引数を番号で読み、selector・inputs（v16 より前と後の 2 つの形）・outputs・exportAs・queries・ngContentSelectors・standalone・hostDirectives・signal を読み直す行、ɵɵPipeDeclaration（pure は分からない）と ɵɵNgModuleDeclaration（型の配列を PartialEvaluator.evaluateType で Reference にする）、型の読み方の補助（readMapType・readStringArrayType）と、親クラス・host directives の typeof のたどり方。
12. [JS の書き換え：ivyTransformFactory が静的なフィールドを足す](12-ngtsc-ivy-transform.md)  
   ivyTransformFactory が TypeScript の before の変換として 2 回の訪問（IvyCompilationVisitor で TraitCompiler.compile を呼んで結果を集め、IvyTransformationVisitor でクラスに静的なフィールドを足しデコレーターを消す）を行う行、Visitor の after でクラスの直後に文を置く仕組み、ImportManager で足す import と ConstantPool の文、aliasTransformFactory。ngDevMode の条件は変換ではなく compiler が作る式の側にあること。テンプレートの出力の章（compiler-reify-emit）で読んだ範囲はリンク。
13. [.d.ts の書き換え：ɵɵComponentDeclaration の型を足す](13-ngtsc-dts-transform.md)  
   DtsTransformRegistry と IvyDeclarationDtsTransform が、TraitCompiler の CompileResult の type から .d.ts のクラスに static ɵcmp・ɵfac の宣言を足す行、declarationTransformFactory、型の中の参照を import に直す仕組み。ライブラリを配るとき .d.ts の型が DtsMetadataReader に読まれる、往復の関係。
14. [差分ビルド：IncrementalCompilation と前の結果の使い回し](14-ngtsc-incremental.md)  
   IncrementalCompilation.incremental が前のビルドの状態（IncrementalState の Fresh・Analyzed・Delta）と変わったファイルから、作り直すファイルを決める行、FileDependencyGraph（ファイルの依存と、テンプレートやスタイルのような資源の依存）、TraitCompiler.adopt が前の ClassRecord を使い回す仕組み、IncrementalBuildStrategy。
15. [意味のグラフ：公開の形が変わったときだけ作り直す](15-ngtsc-semantic-graph.md)  
   SemanticSymbol の isPublicApiAffected・isTypeCheckApiAffected・isEmitAffected、DirectiveSymbol と PipeSymbol と NgModuleSymbol がそれぞれ何を比べるか、SemanticDepGraphUpdater が前のグラフと今のグラフを照らして「影響を受けるファイル」を広げる行。テンプレートだけを変えたら、使う側のファイルは作り直さない理由。
16. [import の循環：CycleAnalyzer と、スコープを外から設定する逃げ道](16-ngtsc-cycles.md)  
   ImportGraph がファイルの import をたどり（型だけの import は飛ばす）、CycleAnalyzer.wouldCreateCycle が「コンポーネントの依存を import すると循環になるか」を判定する行、循環になるときのコンポーネントの handler の 2 つの道（setComponentScope で外から設定する remote scoping、または NG3003 のエラー）。どちらになるかは利用者の設定ではなく compilationMode だけで決まり（partial なら Error）、standalone のコンポーネントは調べないこと。
17. [HMR の更新モジュール：コンポーネントだけを差し替える関数を作る](17-ngtsc-hmr.md)  
   NgCompiler.emitHmrUpdateModule が TraitCompiler.compileHmrUpdateCallback を呼び、extractHmrMetatadata・extractHmrDependencies がテンプレートの使う名前（ローカルの宣言と import）を集め、getHmrUpdateDeclaration が ɵɵreplaceMetadata を呼ぶ関数の宣言を作る行。CLI の側（cli-hmr）で読んだ範囲はリンク。
18. [診断と性能の記録：FatalDiagnosticError・ErrorCode・PerfRecorder](18-ngtsc-diagnostics-perf.md)  
   handler が投げる FatalDiagnosticError と、投げずに返す makeDiagnostic・makeRelatedInformation、ErrorCode の数が NG の番号（-99 を前に付けた TypeScript の診断の code）になる行と、ErrorCode の負の値を印にしてエラーの説明のページの URL を足す行（配布物 22.1.6 では URL が next を指していた）。PerfPhase・PerfEvent・PerfCheckpoint と ActivePerfRecorder、tracePerformance の設定で JSON に書き出す方法。
19. [ngtsc のテストを書く：NgtscTestEnvironment と runInEachFileSystem](19-ngtsc-test-env.md)  
   packages/compiler-cli/test/ngtsc の NgtscTestEnvironment（setup・write・driveMain・driveDiagnostics・getContents・enableMultipleCompilations）と、偽のファイルシステムで同じ spec を OS ごとに走らせる runInEachFileSystem、fake\_common（偽の @angular/common）、src/ngtsc の各ディレクトリの単体テストの makeProgram。ngtsc の不具合を spec の形で再現するときの手順。
20. [issue と PR を読む：ngtsc の今](20-ngtsc-issues.md)  
   area: compiler のラベルで開いている issue のうち、テンプレートの外側（プログラム・handler・静的な評価・import・差分ビルド・循環・HMR・診断）に関係するものと、この 1 年に閉じた issue の表。どの issue がこのシリーズのどの章の行に関係するか、2025 年 11 月〜2026 年に入った修正の読み方と、その修正に付いた spec。
