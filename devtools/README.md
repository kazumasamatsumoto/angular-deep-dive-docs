[目次](../README.md)

# Angular DevTools の内側

> ページの検出・メッセージの道・コンポーネントの木・プロパティの直列化・プロファイラー・変更検知の解析・注入器の木・signal のグラフ・ルーター

Angular DevTools は、angular/angular の devtools/ にある、Angular で書かれたブラウザの拡張です。拡張は 4 つの場所に分かれて動きます。調べるページの中で動くバックエンド（ng-devtools-backend）、ページと拡張をつなぐ content script、タブごとの接続をまとめる background、そして DevTools のパネルに出る画面（ng-devtools）です。バックエンドは、開発モードの Angular がページに置く window.ng の関数（getComponent・getDirectiveMetadata・ɵgetInjectorProviders・ɵgetSignalGraph・ɵsetProfiler など）を呼んで、コンポーネントの木、プロパティ、注入器、signal のグラフ、変更検知の記録を集め、送れる形に直してメッセージで画面に送ります。これまでの章で読んだ core の窓口（di-debug・signals-debug）の、受け手の側です。このシリーズでは、Angular のページを見つける仕組み、メッセージの道とプロトコル、コンポーネントの木の集め方と同じノードの見分け方、プロパティの直列化と書き換え、要素の選択と強調、プロファイラーと変更検知の解析、注入器の木、signal のグラフ、ルーターと TransferState、そしてテストとビルドを 1 つずつ読みます。ページの上のデモは、本物の devtools のソースを本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かし、記録した結果を見せます。各章の最後に、その仕組みの spec と手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/devtools)

1. [DevTools の全体像：ページ・content script・background・パネル](01-devtools-overview.md)  
   devtools/projects の分担（shell-browser・protocol・ng-devtools-backend・ng-devtools・shared-utils・demo のアプリ）と、拡張が動く 4 つの場所（ページ・content script・background・DevTools のパネル）。バックエンドが頼る core の窓口 window.ng と、開発モードでだけそれが置かれる理由。各章へのリンク。
2. [Angular を見つける：detect-angular と ngAvailability](02-devtools-detect.md)  
   ページに Angular があるか、開発モードか、どの版かを DOM の ng-version 属性と window.ng だけで調べる detect-angular.ts と shared-utils の angular-check、バックエンドを差し込む content script と handshake で起動する backend.ts、queryNgAvailability への返事 ngAvailability と、window.ng にある関数から使える機能を決める supportedApis（ng-debug-api.ts）。
3. [メッセージの道：ページから DevTools のパネルまで](03-devtools-messaging.md)  
   ページの中の SamePageMessageBus（window.postMessage）、content script、background の TabManager、パネルの ChromeMessageBus（chrome.runtime の Port）がメッセージを中継する順番。iframe ごとの接続（frame の id）と、パネルを閉じたときの後始末。
4. [プロトコル：Events の型と PriorityAwareMessageBus](04-devtools-protocol.md)  
   protocol/src/lib/messages.ts の Events（getLatestComponentExplorerView・latestComponentExplorerView・startProfiling・profilerResults など）とそのデータの形、MessageBus の約束、パネルの側の PriorityAwareMessageBus が getNestedProperties の返事を待つあいだ getLatestComponentExplorerView を落とし、100ms に 1 回に間引く仕組み。
5. [コンポーネントの木を集める：getDirectiveForest](05-devtools-component-tree.md)  
   バックエンドの component-tree.ts がルートの要素（get-roots.ts）から LView をたどる戦略（ltree.ts）と DOM をたどる戦略（render-tree.ts）、ng.getComponentForest があるときの道、ComponentTreeNode から送れる形の DevToolsNode を作る行、注入器の道筋（resolutionPath）を付ける行。
6. [@for・@defer を木に出す：制御フローの塊と静的なノード](06-devtools-control-flow.md)  
   ng.ɵgetControlFlowBlocks（core の control\_flow.ts）が LView から @for と @defer の塊だけを返し（@if は塊の種類に無いので木に出ない）、directive-forest/utils/control-flow.ts と render-tree.ts が DOM をたどる途中でその中身を合成したノードに束ねる行、HTML だけの中身を静的なノード（&lt;html\_content&gt;）として足す行、ハイドレーションの状態（hydration）を付ける行。
7. [同じノードを見分ける：IdentityTracker と id](07-devtools-identity.md)  
   identity-tracker.ts が、描画し直しのたびに集め直した木のノードに同じ id を付け、新しいノードと消えたノードを見分ける行。消えたディレクティブの記録を片付ける修正（33b001d478e）と preservation のモード、WeakRef で注入器を持つ idToInjector（84d757446bf）。
8. [パネルの木：平らな木への展開・差分・絞り込み](08-devtools-forest-ui.md)  
   ng-devtools の directive-forest が、届いた DevToolsNode の木を平らな行の列にする ComponentDataSource、前の木との差分を取る diffing、検索の絞り込み（directive-forest-filter-fn-generator.ts）、パンくず（breadcrumbs）。
9. [プロパティを送れる形にする：state-serializer](09-devtools-state-serializer.md)  
   serializeDirectiveState と serialized-descriptor-factory.ts が、インスタンスのプロパティを型（prop-type.ts）ごとに Descriptor に直す行、深さの上限、signal・getter・関数・null-prototype のオブジェクトの扱い。
10. [入れ子を開く：getNestedProperties とプロパティの木](10-devtools-property-resolver.md)  
   パネルの property-resolver（DirectivePropertyResolver・PropertyDataSource）が、開いた行の道筋を getNestedProperties でバックエンドへ送り、バックエンドがその道筋の値だけを 1 段直列化して返す流れと、変更検知のあとに開いた行を覚えたまま頼み直す propertyQuery: Specified（deeplySerializeSelectedProperties）。object-tree-explorer の表示。
11. [値を書き換える：updateState と property-mutation](11-devtools-property-mutation.md)  
   パネルで値を編集したときの updateState が、バックエンドの property-mutation.ts で道筋をたどってプロパティ（signal なら set）を書き換え、ng.applyChanges で変更検知を走らせる行。書き換えられない値の扱い。
12. [要素を選ぶ・光らせる：component-inspector と highlighter](12-devtools-inspector-highlight.md)  
   ページの上でマウスで要素を選ぶ ComponentInspector、選んだ要素やホバーした要素を枠で囲む highlighter、コンソールに $ng0 として置く set-console-reference と logValue。
13. [プロファイラーの記録：ɵsetProfiler からフレームまで](13-devtools-profiler-capture.md)  
   core の profiler（ProfilerEvent と setProfiler）にバックエンドが差し込むフック（profiling/profiler の native.ts・polyfill.ts・shared.ts）、変更検知のたびの記録を ProfilerFrame にまとめる capture.ts、startProfiling から profilerResults までの流れ。
14. [記録を描く：フレームのグラフとフレームグラフ・ツリーマップ](14-devtools-profiler-formatters.md)  
   パネルが sendProfilerChunk を貯めて入力欄で絞り、frame-selector で選んだフレームを mergeFrames で足し合わせてから、棒グラフ（bargraph-formatter.ts）・フレームグラフ（flamegraph-formatter.ts）・ツリーマップ（tree-map-formatter.ts）の形に直す行と、記録の書き出しと読み込み。足し合わせで listener の時間とあとから出たフックが落ちることも記録で確かめる。
15. [変更検知を見張る：CD analyzer と Performance パネル](15-devtools-cd-analyzer.md)  
   cd-analyzer（analyzer.ts・highlighting.ts・data-stream.ts）が、テンプレートが実行されたコンポーネントを数えて光らせ、パネルの木に回数を流す仕組み（07605ba793b）と、performance-track.ts が performance.measure で Chrome の Performance パネルに段を出す仕組み、core の enableProfiling（console.timeStamp）と Performance パネルからのリンク（95f56d33fe6）。
16. [注入器の木：resolutionPath と provider の一覧](16-devtools-injector-tree.md)  
   バックエンドが ɵgetInjectorResolutionPath・ɵgetInjectorProviders で集める注入器の道筋と provider（logProvider の #55570 も再現）、パネルの injector-tree-fns.ts が道筋を逆にして要素の注入器と環境の注入器の 2 つの木に分けて重ねる行と、ɵgetDependenciesFromInjectable の依存が要素の注入器の分だけ落ちる理由。core の側（di-debug）はリンク。
17. [signal のグラフ：ɵgetSignalGraph から絵まで](17-devtools-signal-graph.md)  
   パネルの SignalGraphManager が要素の位置で getSignalGraph を頼み、バックエンドの getSignalGraphCallback が ng.ɵgetSignalGraph の値を preview に直して返す行、値を後から開く getSignalNestedProperties と SignalGraphRef の控え、パネルの convertToDevtoolsSignalGraph が resource の塊（cluster）と塊どうしの辺を足す行、signals-visualizer が dagre-d3-es で並べる行、computed・effect にブレークポイントを置く BreakpointManager（CDP）。core の側（signals-debug）はリンク。
18. [ルーターの木・TransferState・ハイドレーションの重ね表示](18-devtools-router-transfer.md)  
   バックエンドの router-tree.ts が router.config を名前と印（active・lazy・aux）の木に直す行と、routerState による active の判定、sanitizeObject で data を削る行、パネルの router-tree。ɵgetTransferState がページの &lt;script id="…-state"&gt; を読む Transfer State のタブ、hydration-overlays.ts がハイドレーションの状態を要素の上に重ねて見せる仕組み。
19. [DevTools のテストとビルド：zoneless\_web\_test\_suite と demo のアプリ](19-devtools-test-build.md)  
   devtools の spec を Chromium と Firefox で走らせる zoneless\_web\_test\_suite（wtr\_test が 1 つの :test を 2 つにする）、バックエンドの spec がアプリを作らずに window.ng の偽物と DOM で木を作る書き方、パネルの spec の TestBed と MessageBus の偽物、開発用のサーバー（devtools:devserver）と拡張のビルド（prodapp・flag\_browser）、CI の cypress の e2e、DevTools の不具合を spec の形で再現するときの手順とどの spec に足すかの表。
20. [issue と PR を読む：DevTools の今](20-devtools-issues.md)  
   area: devtools のラベルで開いている issue と、2025-11-01 以降に閉じた issue の表。どの issue がこのシリーズのどの章の行に関係するか、2025 年 11 月〜2026 年に入った修正の commit 20 個の読み方と、その修正に付いた spec。手元の木と main の差。
