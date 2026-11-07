[目次](../README.md)

# standalone コンポーネントの内側

> imports がテンプレートの依存になり、注入器になるまで

v19 以降、@Component は何も書かなければ standalone です。NgModule の declarations に並べる代わりに、コンポーネント自身の imports にテンプレートで使う部品を書きます。この imports は、コンパイル時に「本当に使った依存」へ絞られて ɵcmp の dependencies になり、実行時には TView の directiveRegistry / pipeRegistry と、imports 由来の providers を持つ環境インジェクタになります。forwardRef・@defer・hostDirectives・TestBed の差し替え・ローカルコンパイルといった周辺の仕組みも、この dependencies を軸に読むと 1 本につながります。各章で ngtsc（compiler-cli）、compiler、core の実際の行を追います。

全 14 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/standalone)

1. [standalone コンポーネントの概観：imports が ɵcmp の dependencies になり、依存解決と注入器を自分で持つ](01-standalone.md)  
   @Component({ standalone }) が既定で true になる行、ComponentDef の standalone / dependencies / getStandaloneInjector / schemas の 4 フィールド、コンパイル時（imports → dependencies）と実行時（directiveRegistry と StandaloneService）の 2 つの仕事。ng generate component の既定値と bootstrapApplication の入口。シリーズ全体の地図。
2. [@Component が実行された瞬間（JIT）：compileComponent が ɵcmp を遅延定義し、imports を後から貼る](02-standalone-decorator.md)  
   compileComponent が Object.defineProperty で ɵcmp を getter にする行、directiveMetadata で standalone が既定 true になる行、JIT では declarations: \[\] で compile してから getStandaloneDefFunctions で directiveDefs / pipeDefs を貼る理由、hasDirectiveDependencies、schemas の扱い、compilationDepth と flushModuleScopingQueueAsMuchAsPossible の関係。
3. [imports の検証（AOT）：validateAndFlattenComponentImports・validateStandaloneImports・StandaloneComponentScopeReader](03-standalone-imports-check.md)  
   ngtsc の ComponentDecoratorHandler.analyze が imports を評価して平坦化する手順、standalone でないコンポーネントに imports を書いたとき（NG2010）、standalone でないものを import したとき（NG2011）、コンポーネントでも directive でも pipe でも NgModule でもないものを import したときのエラー。StandaloneComponentScopeReader が「自分自身」をスコープに最初に入れる行と isPoisoned。
4. [使った依存だけが dependencies に残る：eagerlyUsed と NG8113 unusedStandaloneImports](04-standalone-used-only.md)  
   imports に 10 個書いても、テンプレートで使った分しか ɵcmp の dependencies に出ない。resolveComponentDependencies が R3TargetBinder でテンプレートを束縛して使用集合を作る手順、componentDependenciesToDeclarations、NgModule だけは使用に関係なく残る行。未使用 import を警告する UnusedStandaloneImportsRule（NG8113）が何を見て、unusedStandaloneImports オプションでどう変わるか。このサイトのビルドで実際に出た警告の正体。
5. [forwardRef と自己参照：dependencies が配列ではなく関数になる条件、再帰コンポーネント](05-standalone-forward-ref.md)  
   ファイル内で後ろに宣言されたコンポーネントや forwardRef(() =&gt; X) を import すると、dependencies: () =&gt; \[X\] というクロージャになる。ngtsc が synthetic な Reference で forwardRef を推定する行、DeclarationListEmitMode の Direct / Closure / ClosureResolved、JIT の getStandaloneDefFunctions が resolveForwardRef を遅延して呼ぶ理由。imports を書かずに自分自身をテンプレートに置ける再帰コンポーネント。
6. [ローカルコンパイル：ɵɵgetComponentDepsFactory が依存解決を実行時へ送る](06-standalone-local-compilation.md)  
   compilationMode: "experimental-local" ではファイル単位でコンパイルするため imports の中身を見られない。ngtsc が DeclarationListEmitMode.RuntimeResolved を選ぶ行、compiler が dependencies: ɵɵgetComponentDepsFactory(Cmp, \[raw imports\]) を出す行、実行時に DepsTracker.getComponentDependencies が rawImports から scope を計算する手順。local\_compilation\_spec の期待出力。CLI が partial を full に書き換える行。
7. [実行時の依存解決：tView.directiveRegistry と findDirectiveDefMatches、pipeRegistry と getPipeDef](07-standalone-directive-registry.md)  
   ɵcmp の dependencies から作られた directiveDefs / pipeDefs が createTView で directiveRegistry / pipeRegistry に入る。ɵɵelementStart の firstCreatePass で findDirectiveDefMatches が全 def の selectors を isNodeMatchingSelectorList で照合し、コンポーネントを先頭に並べる手順。ɵɵpipe が pipeRegistry を後ろから探す行。マッチしなかった &lt;app-x&gt; が NG0304「not a known element」になる場所と schemas。
8. [@Component の providers と imports の providers は別の注入器へ：ɵɵProvidersFeature と StandaloneService](08-standalone-providers-two-injectors.md)  
   providers / viewProviders は ɵɵProvidersFeature → providersResolver で TView の data と blueprint に積まれ、NodeInjector から見える。imports に入れた NgModule の providers はコンポーネントではなく getStandaloneInjector が作る環境インジェクタに入る。2 つの行き先を定義ファイルの行で分け、同じトークンを両方に置いたとき実際にどちらが取れるかをデモで確かめる。
9. [standalone でないコンポーネントを渡すと何が起きるか：assertStandaloneComponentType と orphan component](09-standalone-entry-checks.md)  
   bootstrapApplication の入口で assertStandaloneComponentType が NG0907 を投げる行、ApplicationRef.bootstrap のメッセージが standalone かどうかで変わる行、createComponent / ViewContainerRef で NgModule 未ロードのコンポーネントを描くと orphan として NG0981 になる verifyNotAnOrphanComponent、それを有効にする forbidOrphanComponents オプションと ɵsetClassDebugInfo、createComponent の directives オプションが standalone を要求する行。
10. [hostDirectives が standalone 限定である理由：ɵɵHostDirectivesFeature と resolveHostDirectives](10-standalone-host-directives.md)  
   hostDirectives は ɵɵHostDirectivesFeature で def に貼られ、セレクタ照合の後に resolveHostDirectives がマッチ結果へ割り込んで並び順（ホストのディレクティブ → ホスト本体）を決める。findHostDirectiveDefs の再帰、inputs / outputs の別名マップ、ngtsc の validateHostDirectives（NG2014）と実行時 validateHostDirective（NG0308）が standalone を要求する行。NgModule のスコープを経由しないから standalone でなければならない、を実物で示す。
11. [@defer と imports：@defer の中でだけ使う依存が eager な dependencies から外れ import() になるまで](11-standalone-defer-deps.md)  
   imports に書いた CmpA を @defer の中だけで使うと、ɵcmp の dependencies から消え、Cmp\_Defer\_DepsFn の import("./cmp-a").then(m =&gt; m.CmpA) になる。resolveDeferBlocks が各ブロックの依存を集め、DeferredSymbolTracker が「その import 文を他で eager に使っていないか」を markAsDeferrableCandidate / canDefer で判定し、compile で import 文ごと削る手順。同じファイルの依存が import() にならない理由、HMR 有効時に全部 eager に戻る行、deferredImports が内部向けである注記。
12. [TestBed.overrideComponent で standalone の imports を差し替えると何が再コンパイルされるか](12-standalone-testbed-override.md)  
   overrideComponent が OverrideResolver に差分を積み pendingComponents に入れる行、standalone フラグ自体は上書きできないと投げる行、compileTypesSync が resolve した metadata を MetadataOverrider で合成し maybeStoreNgDef で元の ɵcmp を退避してから ɵcompileComponent を呼び直す手順、AOT 済みコンポーネント（デコレータ無し）の特別経路、overrideTemplateUsingTestingModule、@defer を持つコンポーネントの非同期メタデータ、resetTestingModule で ɵcmp が戻る行。
13. [selectorless（実験的）：imports を書かずに &lt;MyCmp /&gt; と書けるようにする仕組み](13-standalone-selectorless.md)  
   \_enableSelectorless オプションで有効になる実験的機能。テンプレートの &lt;MyCmp&gt; と @MyDir を analyzeTemplateForSelectorless が集め、SelectorlessComponentScopeReader がファイルの import 文から同名の識別子を解決してスコープにする手順。standalone でないと使えない行、imports / deferredImports と併用できない行。セレクタ照合（第 7 章）が不要になる理由。
14. [foreignImports（内部向け）：他フレームワークのコンポーネントを standalone の依存に並べる](14-standalone-foreign-imports.md)  
   @Component.foreignImports は @internal（3p-only）だが v22 のソースに実在する。ForeignComponent インターフェースの 4 つのシンボル（render / onDestroy / contentAdapter / getContext）、ngtsc が extractForeignImportsFromAst で読み analyzeForeignComponentFeatures がテンプレートの使い方を検証する手順、実行時に ɵɵforeignComponent 系の命令が描く位置、JIT では例外になる行。imports との違いを表で整理する。
