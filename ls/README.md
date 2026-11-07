[目次](../README.md)

# 言語サービスの内側

> VS Code 拡張・LSP サーバー・tsserver プラグイン・ホバーと補完と定義へのジャンプ

VS Code でテンプレートの {{ user.name }} にカーソルを置くと型が出て、F12 で定義へ飛べ、. を打てば候補が並びます。これをしているのが Angular の言語サービスです。VS Code 拡張（クライアント）が LSP サーバーを起動し、サーバーは TypeScript の tsserver の ProjectService を自分の中で動かし、そこに Angular のプラグインを差し込みます。プラグインの LanguageService は、ng build と同じ NgCompiler と、前のシリーズで読んだ TemplateTypeChecker に尋ねて答えを作ります。このシリーズは、その 4 つの層を上から順に読み、カーソルの位置からテンプレートのノードを探す仕組み、診断・ホバー・定義へのジャンプ・参照と名前変更・補完・シグネチャヘルプ・インレイヒント・色分け・文書のシンボル・コード修正・リファクタリングを 1 つずつ読みます。拡張もサーバーも angular/angular の中（vscode-ng-language-service/）にあり、ページの上のデモは、このサイトに入っている本物の @angular/compiler で動きます。各章の最後に、その機能を確かめている spec と、手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/ls)

1. [言語サービスの全体像：拡張・サーバー・プラグイン・LanguageService](01-ls-overview.md)  
   VS Code 拡張（client）→ LSP サーバー（server）→ tsserver の ProjectService → Angular のプラグイン（ts\_plugin.ts）→ LanguageService → NgCompiler と TemplateTypeChecker という 4 つの層と、1 回のホバーがそれを通る順番。packages/language-service と vscode-ng-language-service の分担、spec の置き場と走らせ方。
2. [VS Code クライアント：サーバーを起動してコマンドを送る](02-ls-client.md)  
   extension.ts の activate から client.ts の AngularLanguageClient がサーバーのプロセスを起動するまで（使う TypeScript の場所、ログの設定）。commands.ts のコマンド（サーバーの再起動・TCB を見る・テンプレートとコンポーネントの行き来）が、独自の LSP リクエストとしてサーバーに届く流れ。インラインテンプレートの中だけを Angular に回す embedded\_support.ts。
3. [LSP サーバーと Session：tsserver をライブラリとして動かす](03-ls-server-session.md)  
   server.ts が引数を読み、banner の require の差し替えで決まった 1 つの TypeScript を読み込んで Session を作る順番。Session が ts.server.ProjectService を globalPlugins に Angular のプラグインを入れて作る行と ServerHost。LSP の要求（hover・completion など）を handlers/ の関数に振り分ける表、ファイルの開閉と変更（差分ごとの ScriptInfo.editContent）の伝え方、プロジェクトを読み終えたときに @angular/core を探して言語サービスを有効・無効にする流れ。version\_provider が拡張に同梱の @angular/language-service と、許可された tsdk か同梱の typescript を探す仕組み。
4. [tsserver プラグイン：TypeScript の言語サービスに Angular を重ねる](04-ls-ts-plugin.md)  
   TypeScript がプラグインの factory を自分自身を渡して呼び、create の戻り値で言語サービスを置き換えるまで。ts\_plugin.ts の create が TypeScript の LanguageService と Angular の LanguageService を並べ、メソッドごとに組み合わせる仕組み（withFallback、TS の結果と Angular の結果を足すもの・どちらかを選ぶもの）。NgLanguageService の型（api.ts）、TypeScript を外から受け取る AMD の束、angularOnly などのプラグインの設定と使われていない項目、配られていない override\_rename\_ts\_plugin と今の名前変更の扱い。
5. [CompilerFactory：NgCompiler を作り直さずに使い回す](05-ls-compiler-factory.md)  
   CompilerFactory.getOrCreate が、プログラムが同じならそのまま、テンプレートなどのリソースだけが変わったら resourceChangeTicket、TS が変わったら incrementalFromCompilerTicket で NgCompiler を作る行。LanguageServiceAdapter が tsserver のプロジェクトを NgCompilerAdapter に見せる仕組み、言語サービス用の ProgramDriver、ensureProjectAnalyzed。
6. [外部テンプレート：.html を TypeScript の世界に載せる](06-ls-external-templates.md)  
   templateUrl の .html は TypeScript のプロジェクトのファイルではない。アダプタの readResource と getModifiedResourceFiles が tsserver の ScriptInfo からテンプレートを読む仕組み、.html を開いたときにどのプロジェクトに属するかを決める行、getComponentLocationsForTemplate と getTemplateLocationForComponent。solution-style の tsconfig で外部テンプレートを見失う問題の修正。
7. [カーソルの位置からテンプレートのノードを探す](07-ls-template-target.md)  
   template\_target.ts の getTargetAtPosition が、テンプレートの AST と式の AST を同時にたどって、カーソルの位置にある一番深いノードとその親を探す仕組み。TargetNodeKind（要素の名前・属性の名前・属性の値・式・2 つにまたがるバインディング）、\[(x)\] のように 1 つの属性が 2 つのノードになるとき。ページの上で、テンプレートの位置を選ぶとノードが分かるデモ。
8. [診断：エディタの赤い波線が出るまで](08-ls-diagnostics.md)  
   getSemanticDiagnostics がファイルの種類（TS か外部テンプレートか）でコンポーネントを探し、NgCompiler の診断（型チェック・帯域外・拡張診断）を集めて filterNgDiagnosticsForFile で絞る行と、番号で消す 2 つの仕組み（利用者の suppressAngularDiagnosticCodes と、google3 に写すときだけ有効になる固定の一覧）。getSuggestionDiagnostics と getCompilerOptionsDiagnostics（strictTemplates の提案）、サーバーが診断を計算して送る時機（300ms の予約、diagnostic.ts の変換、プロジェクトを読み終えたときの ensureProjectAnalyzed）。
9. [ホバー：型と説明を出す](09-ls-quick-info.md)  
   getQuickInfoAtPosition が、カーソルのノードから TemplateTypeChecker.getSymbolOfNode で記号を得て、その種類（入力・出力・要素・変数・@let・参照・DOM の束縛・pipe・ディレクティブ・selectorless・式）ごとに TCB の位置で TypeScript に尋ねるか型の文字列から組み立てる quick\_info.ts の行。display\_parts.ts の書式、@defer とトリガー・@empty・track の組み込みのホバー（quick\_info\_built\_ins.ts。@if・@switch・@boundary の言葉には出ない）、サーバーの hover.ts と text\_render.ts が Markdown に直す行。
10. [定義へのジャンプと型の定義](10-ls-definitions.md)  
   getDefinitionAndBoundSpan が、記号の種類ごとに TS の定義を探す行（入力はディレクティブのプロパティ、要素はコンポーネントのクラス、templateUrl や styleUrls はファイルそのもの）。getTypeDefinitionAtPosition との違い、サーバーの handlers/definitions.ts が LSP の Location に直す行。Angular で何も見つからないとき TS に回したいという issue。
11. [参照の検索と名前変更：TS とテンプレートをまたぐ](11-ls-references-rename.md)  
   references\_and\_rename.ts が、テンプレートの中の記号を TCB の中の位置に変えて TypeScript の getReferencesAtPosition / findRenameLocations を呼び、返ってきた TCB の位置をテンプレートの位置に戻す仕組み。全部の場所の文字が一致しなければ名前変更全体を止める判定と、それで弾かれるもの（入力の別名・要素名・selector・ディレクティブの付かない DOM 要素）、transform を経由する pipe の名前の変更、getRenameInfo と findRenameLocations、TS のファイルから名前変更したときにテンプレートも変わる理由。
12. [式の補完：. を打ったときに並ぶ候補](12-ls-completions.md)  
   completions.ts の CompletionBuilder が、カーソルのノードの種類で補完の種類を選ぶ表と、式の補完（コンポーネントのメンバー・テンプレートの変数・プロパティ読みの後ろ）を TemplateTypeChecker.getGlobalCompletions と TCB の位置での TS の補完から作る行。getCompletionEntryDetails、pipe の補完、@ のブロックの補完。
13. [要素と属性の補完：DOM のスキーマとディレクティブの selector](13-ls-attribute-completions.md)  
   attribute\_completions.ts が、要素の名前・属性の名前の候補を DOM のスキーマ（DomElementSchemaRegistry）と、その場で使えるディレクティブ・コンポーネントの selector から集める仕組み。入力・出力・\[(x)\] の候補、構造ディレクティブの \*、まだ import していないコンポーネントを候補に出して import を足す仕組み。ページの上で本物の DomElementSchemaRegistry に要素の属性を尋ねるデモ。
14. [シグネチャヘルプとリンクした編集](14-ls-signature-help.md)  
   signature\_help.ts が、テンプレートの中の関数呼び出しの ( の後ろで、TCB の中の対応する位置で TS の getSignatureHelpItems を呼ぶ仕組み。linked\_editing\_range.ts が、開きタグの名前を書き換えると閉じタグも一緒に変わる範囲を返す行。
15. [インレイヒント：テンプレートに型を薄く書き足す](15-ls-inlay-hints.md)  
   inlay\_hints.ts（2000 行を超える）が、@for の変数・@let・@if の as・参照・イベントの $event・入力と DOM のプロパティ・pipe の戻り値・関数の引数名・@switch・@defer の when に型のヒントを付ける位置と、どのヒントを出すかの設定（InlayHintsConfig）。型は TCB の上で TypeScript に尋ねる。サーバーの handlers/inlay\_hints.ts が VS Code の設定を写す所と、何もせずに返す resolve。ページの上でヒントの位置を置くデモ。
16. [色分け：TextMate の文法と意味のトークン](16-ls-semantic-tokens.md)  
   VS Code のテンプレートの色は、拡張の syntaxes/ にある TextMate の文法（template.json・expression.json・template-blocks.json）で付く。文法を TypeScript で書いて JSON を作る仕組み、bazel の生成と食い違いの検査、スナップショットの spec。言語サービスの semantic\_tokens.ts がコンポーネントの要素名だけを class として返す行と、LSP サーバーにその受け口が無いこと（#60262）。
17. [文書のシンボルと折りたたみ](17-ls-document-symbols.md)  
   document\_symbols.ts が、テンプレートの要素・@ のブロック・@let・参照をアウトライン（文書のシンボル）として返す仕組みと、outlining\_spans.ts が @if や @for のブロックの折りたたみの範囲を返す行。サーバーの handlers/document\_symbols.ts と folding.ts が、TS のシンボルとどう合わせるか。
18. [コード修正：診断から直し方を出す](18-ls-code-fixes.md)  
   codefixes/ の 5 つの修正（存在しないメンバーを足す・\[(x)\] の書き間違い・import の足し忘れ・使っていない standalone の import・必須の入力の欠落）が、エラー番号から CodeActionMeta を選び、修正の編集を作る仕組み。getCodeFixesAtPosition と getCombinedCodeFix、サーバーの handlers/code\_actions.ts。
19. [リファクタリング：@Input を input() に変える](19-ls-refactorings.md)  
   refactorings/ が、@Input と @ViewChild などのクエリを signal の input() や viewChild() に変えるリファクタリングを、core のマイグレーション（signal-migration）を使って言語サービスの中で動かす仕組み。getPossibleRefactorings と applyRefactoring、1 つだけ変えるかクラス全体を変えるか、変えられないときの理由。
20. [issue と PR を読む：言語サービスの今](20-ls-issues.md)  
   area: language-service と area: vscode-extension のラベルで開いている issue と、この 1 年に閉じた issue の表。コンポーネントの自動 import の順番、TS に定義へのジャンプを回す、カスタム要素の型、モノレポの tsconfig など、長く開いているもの。どの issue がこのシリーズのどの章の行に関係するか。
