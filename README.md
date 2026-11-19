# Angular Deep Dive

Angular の内側（angular/angular と angular/angular-cli のソース）を、1 ステップずつ読む日本語の連載です。全 62 シリーズ・726 章。

各章の Markdown は、[サイト](https://angular-deep-dive-cyan.vercel.app) の本番ビルドから `npm run build` で作っています。コードの引用は行番号つきで、▶ の付いた行が本文で読む行です。デモはボタンで動くので、各章の「サイトで読む」から開いてください。

連載の途中で見つけた本家の不具合と、手元で作った直しは [FINDINGS.md](FINDINGS.md) に集めています（本家には issue も PR も出していません）。

## シリーズ

1. [起動の全手順](boot/README.md)（13 章）— ng serve と打ってから最初の画面が出るまで
2. [Ivy ランタイム](ivy/README.md)（17 章）— TNode・TView・LView を 1 つずつ
3. [zone.js の内側](zone/README.md)（13 章）— モンキーパッチから NgZone まで
4. [zoneless の内側](zoneless/README.md)（11 章）— 通知からスケジューリングまで
5. [変更検知の各ステップ](cd/README.md)（9 章）— tick の中で起きていること
6. [Router の内側](router/README.md)（21 章）— URL の解析からコンポーネントの表示まで
7. [NgModule の内側](ngmodule/README.md)（18 章）— declarations・imports・exports・providers が実際に何をするか
8. [standalone コンポーネントの内側](standalone/README.md)（14 章）— imports がテンプレートの依存になり、注入器になるまで
9. [DI の内側](di/README.md)（16 章）— inject() の 1 行が、どの注入器を、どの順で探すか
10. [Signal の内側](signals/README.md)（18 章）— signal.set() の 1 行が、どのノードを、どの順で汚すか
11. [テンプレートコンパイラの内側](compiler/README.md)（18 章）— template: の文字列が、どの段を通って ɵɵelementStart の列になるか
12. [テンプレートと DOM](template/README.md)（8 章）— 制御フロー・投影・i18n から DOM 操作まで
13. [HttpClient の内側](http/README.md)（12 章）— http.get() の 1 行が、どの関数を、どの順で通ってネットワークに出るか
14. [SSR とハイドレーション](platform/README.md)（15 章）— サーバーで作った HTML を、ブラウザで捨てずに使い回す
15. [CLI とビルド](cli/README.md)（16 章）— ng build と ng generate の中身を、angular-cli の実際の行で
16. [CDK の内側](cdk/README.md)（21 章）— 見た目を持たない部品を、angular/components の実際の行で
17. [コントリビュートの道](contrib/README.md)（15 章）— angular/angular に変更を出して、マージされるまで
18. [フォームの内側](forms/README.md)（20 章）— AbstractControl の木から Signal Forms まで、テストの場所と一緒に
19. [テストの内側](testing/README.md)（20 章）— TestBed・ComponentFixture・fakeAsync を、Angular 自身のテストと一緒に
20. [アニメーションの内側](animations/README.md)（20 章）— animate.enter / animate.leave と、旧 @angular/animations
21. [Angular Aria の内側](aria/README.md)（20 章）— @angular/aria の Listbox・Tabs・Tree・Grid・Combobox・Menu
22. [テンプレート型チェックの内側](typecheck/README.md)（20 章）— ngtsc の型チェックブロック・型コンストラクタ・診断の対応付け・拡張診断
23. [言語サービスの内側](ls/README.md)（20 章）— VS Code 拡張・LSP サーバー・tsserver プラグイン・ホバーと補完と定義へのジャンプ
24. [マイグレーションの内側](mig/README.md)（20 章）— ng update と ng generate の自動書き換え・Tsurge・signal への移行・テンプレートの書き換え
25. [i18n と $localize の内側](loc/README.md)（20 章）— i18n 属性・メッセージ ID・$localize・翻訳ファイル・実行時の翻訳・ロケールのデータ
26. [Service Worker の内側](sw/README.md)（20 章）— ngsw.json・ngsw-worker.js の Driver・アセットとデータのキャッシュ・更新の確認・SwUpdate・SwPush
27. [DOM レンダラーとイベントの内側](domr/README.md)（20 章）— Renderer2・DomRendererFactory2・カプセル化とスタイル・クラスとスタイルのバインディング・EventManager・サニタイズ
28. [common の内側](cmn/README.md)（20 章）— 組み込みディレクティブ・pipe・formatDate と formatNumber・NgOptimizedImage・Location・ViewportScroller
29. [ngtsc の内側](ngtsc/README.md)（20 章）— NgtscProgram・NgCompiler・TraitCompiler・リフレクション・静的な評価・参照と import・.d.ts・差分ビルド・循環・HMR・診断
30. [Angular DevTools の内側](devtools/README.md)（20 章）— ページの検出・メッセージの道・コンポーネントの木・プロパティの直列化・プロファイラー・変更検知の解析・注入器の木・signal のグラフ・ルーター
31. [@defer とインクリメンタルハイドレーションの内側](defer/README.md)（20 章）— ɵɵdefer 命令・ブロックの記録・状態の切り替え・minimum と after・依存の読み込み・トリガー（when・idle・immediate・timer・interaction・hover・viewport）・prefetch・後片付け・サーバーでの @defer・hydrate トリガー・ハイドレーションの順番
32. [イベント配送（event-dispatch）と jsaction の内側](jsaction/README.md)（12 章）— jsaction 属性・EventInfo・イベントの種類・早期の契約・EventContract・ActionResolver・a11y の click・mouseenter とタッチ・Dispatcher と EventDispatcher・Angular とのつながり
33. [Angular Elements の内側](elements/README.md)（8 章）— createCustomElement・属性と入力・ComponentNgElementStrategy・投影するノード・入力と変更検知・出力とイベント・切り離しと破棄
34. [見つけた不具合を手元で直す](fix/README.md)（10 章）— 手元の複製・失敗する spec・最小の直し・周りのテスト・コミットの書き方・閉じた PR を読む・出す前の点検
35. [HttpClient の細部と issue](httpx/README.md)（6 章）— HttpRequest の options・headers と params の更新の規則・オーバーロードの型・httpResource の型・転送キャッシュのキー・spec と issue
36. [SSR の守りと細部](ssrx/README.md)（10 章）— resolveUrl・location と allowedHosts・サーバーの HttpClient・ホストの検査・プロキシのヘッダー・リダイレクト・ロケール・Node のストリーム・アセットと CSS・spec と issue
37. [Navigation API と FakeNavigation](navx/README.md)（7 章）— Navigation API の型と PlatformNavigation・FakeNavigation の navigate・戻る進む・precommitHandler・Router の連携の残り・テストでの使い方・spec と issue
38. [パイプを書くと何を宣言したことになるか](pipe/README.md)（6 章）— 1 行の | が生むもの・@Pipe の定義・名前の解決・書ける場所と書けない場所・インスタンスと寿命・spec と issue
39. [クエリ（viewChild・contentChildren）の内側](qry/README.md)（7 章）— 1 行の viewChild が生むもの・コンパイラの出力・TQuery の照合・LQuery と結果の集め方・更新の時機と signal クエリ・コンテンツと投影・spec と issue
40. [ng-content と投影の内側](proj/README.md)（6 章）— 1 行の ng-content が生むもの・コンパイラの出力・振り分け・描画と再投影・動的な投影とよくある誤解・spec と issue
41. [resource の細部と新しい部品](resx/README.md)（6 章）— params の特別な戻り値と chain・debounced・エラーの包み方・SSR のキャッシュ・後片付けと漏れの修正・spec と issue
42. [hostDirectives と継承（features）](hdi/README.md)（6 章）— features の並びと実行・継承で def を混ぜる行・継承のコンパイル・host directive の重複の解消・providers と入出力・spec と issue
43. [ErrorHandler とエラーの行き先](err/README.md)（6 章）— ErrorHandler と内部の入口・エラーを捕まえる場所の地図・ブラウザの全体のエラー・@boundary の実行時・@boundary のコンパイル・spec と issue
44. [動的コンポーネント：createComponent と ViewContainerRef](dyn/README.md)（6 章）— 2 つの入口・ComponentFactory.create の中・directives の選択肢・bindings と ComponentRef・ViewContainerRef.createComponent とホストの要素・spec と issue
45. [外のコンポーネント：foreignImports と foreign view](fgn/README.md)（6 章）— 契約と歩み・foreign view・ɵɵforeignComponent の中・@content と後始末・コンパイラと ngtsc・spec と PR
46. [@let の内側：字句から LView の枠まで](letd/README.md)（6 章）— 字句と構文・スコープと binder・テンプレートのパイプライン・実行時とハイドレーション・型チェックと診断・spec と issue
47. [@angular/upgrade の内側：AngularJS と 1 つのページを分け合う](upg/README.md)（6 章）— 全体と起動・downgradeComponent・UpgradeComponent・注入器と変更検知・downgradeModule・spec と issue
48. [Signal Forms の \[formField\]：フィールドと DOM の境目](sfd/README.md)（6 章）— FormField の全体・ネイティブの要素・parse エラーと validity・カスタムコントロール・ControlValueAccessor との互換・spec と issue
49. [WebMCP の内側：Angular のアプリが AI のエージェントにツールを渡す](wmcp/README.md)（4 章）— declareExperimentalWebMcpTool・provideExperimentalWebMcpTools とアプリの寿命・Signal Forms のフォームをツールにする・spec と issue
50. [$locationShim の内側：AngularJS の $location を Angular の Location で動かす](lshim/README.md)（5 章）— LocationUpgradeModule と provider・初期化とブラウザとの同期・url / path / search / hash の読み書き・UrlCodec・spec と issue
51. [ng serve の内側：Vite の middleware と plugin が 1 つの要求をさばくまで](vds/README.md)（5 章）— Vite の設定の組み立て・アセットと base href と index.html・Host の検査と開発用のヘッダー・HMR と SSR の plugin・spec と issue
52. [ng test と Vitest の内側：テストを束ねて走らせるまで](vit/README.md)（5 章）— テストの探し方と options・テスト用のビルド・Vitest の plugin・executor とブラウザ・spec と issue
53. [Karma の builder の内側：esbuild で束ねたテストを Karma に配るまで](kar/README.md)（5 章）— 入口と Karma の設定・テストを束ねる・Karma に配る・unit-test の karma runner・spec と issue
54. [oxc の変換と TypeScript の transformer の内側：ビルドが JavaScript を書き換える行](oxc/README.md)（5 章）— transform の 1 回の走査・後順の走査・linker の AST host と文字列の factory・JIT と Worker の transformer・spec と issue
55. [SSR のサーバールートの内側：ルートを取り出し、木で照合し、応答を組み立てる](srt/README.md)（5 章）— ルートの取り出し・プリレンダーのパラメータとリダイレクト・ルートの木・manifest と renderAngular・応答とその後片付け・spec と issue
56. [Signal Forms のフィールドの木：子を作り、配列を追い、古い木と橋をかける](sft/README.md)（5 章）— 子の作り方・配列の追跡と孤児のフィールド・proxy と context・SignalFormControl と extract・spec と issue
57. [ビルドの前と後：書いた HTML・CSS・class が何に変わるか](bmap/README.md)（3 章）— コンポーネントの JS と DOM・スタイルの束と minify・index.html の仕上げ
58. [Signal Forms の組み込みの検証：required から minDate まで、1 つの validate に下りるまで](sfv/README.md)（5 章）— 共通の形（when・message・error と isEmpty）・数と長さの上限下限と metadata・日付・ValidationError の型・spec と issue
59. [Signal Forms の型を読む：FieldTree から SchemaPath まで、api/types.ts の 1000 行](sfty/README.md)（6 章）— FieldTree と Field・FieldState の読み口・Compat と binding の型・PathKind と SchemaPath・validateHttp と debounce・型の spec と issue
60. [Router のディレクティブとイベントの残り：RouterLink・RouterLinkActive・RouterOutlet・events.ts を行で埋める](rdir/README.md)（6 章）— RouterLink の入力と href・RouterLinkActive の残り・RouterOutlet の入力と detach / attach・events.ts の各クラス・ExtraOptions と RouterModule・spec と issue
61. [@angular/ssr の読み残し：provideServerRendering・リクエストハンドラ・CommonEngine・ビルド側のワーカーを行で埋める](ssrl/README.md)（6 章）— provideServerRendering と withRoutes / withAppShell・createRequestHandler と Node の入口・CommonEngine と性能の記録・i18n と URL の小道具・prerender のワーカーとサーバー起動・spec と issue
62. [Router の読み残し：UrlTree と RouterState の小道具・provideRouter の残り・Router クラス・読み込みとガードを行で埋める](rtl/README.md)（6 章）— UrlTree / ParamMap と木の小道具・ActivatedRoute の Observable と継承・provideRouter と RouterModule の残り・Router クラスと Navigation の型・読み込み・事前読み込み・再利用・関数ガード・spec と issue

## 作り直し方

1. サイト（angular-deep-dive）で `npm run build` を走らせ、プリレンダーの出力を作る。
2. このリポジトリで `npm install`（初回だけ）と `npm run build` を走らせる。サイトの場所が `../angular-deep-dive` でなければ `node tools/build.mjs <サイトの場所>`。
3. `npm run check` で、リンク切れ・SVG の形・手元のパスが残っていないかを確かめる。
