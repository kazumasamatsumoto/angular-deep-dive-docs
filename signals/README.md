[目次](../README.md)

# Signal の内側

> signal.set() の 1 行が、どのノードを、どの順で汚すか

Signal の実体は @angular/core/primitives/signals にある ReactiveNode という小さなオブジェクトと、それを producer と consumer の双方向リンクでつないだグラフです。signal() を読むと activeConsumer にリンクが張られ、set() すると version とグローバルな epoch が進み、consumer に dirty が伝わります（push）。computed は読まれたときに初めて、依存先の version を見比べて再計算するかを決めます（pull）。この仕組みの上に computed・linkedSignal・effect・afterRenderEffect・input()・model()・toSignal・resource・httpResource・Signal Forms が組み立てられています。primitives と core と compiler の実際の行で、1 ステップずつ追います。

全 18 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/signals)

1. [Signal の概観：version と epoch、2 つのカウンタで無駄な再計算を止める](01-signals.md)  
   signal() / computed() の中身を graph.ts から読む。バージョン番号とエポックという 2 つのカウンタだけで、無駄な再計算を止めている仕組みを追う。
2. [ReactiveNode の構造：signal の正体は「関数にぶら下がった 1 つのオブジェクト」](02-signals-reactive-node.md)  
   REACTIVE\_NODE プロトタイプの全フィールド（version / lastCleanEpoch / dirty / producers / consumers / kind / consumerAllowSignalWrites など）を 1 つずつ読み、createSignal が getter 関数に \[SIGNAL\] でノードを付ける行、SIGNAL\_NODE が REACTIVE\_NODE を展開したコピーで、各ノードはそれを Object.create でプロトタイプにすること（IIFE と tree-shaking）、isSignal の判定、core の signal() が primitives の createSignal を包む行を追う。
3. [依存の追跡：activeConsumer、producerAccessed、ReactiveLink、untracked](03-signals-tracking.md)  
   「いま誰が読んでいるか」を表すグローバル変数 activeConsumer と setActiveConsumer。producerAccessed が既存のリンクを再利用するか新しい ReactiveLink を作るかを決める行、consumerBeforeComputation / finalizeConsumerAfterComputation が「前回の依存のうち今回読まなかったもの」を切る手順、untracked が activeConsumer を null にして戻すだけの実装。条件分岐で依存が変わる例をデモで見せる。
4. [set と update：equal・version・epoch、そして NG0600 で書き込みを止める場所](04-signals-set.md)  
   signalSetFn が producerUpdatesAllowed で書き込みを許すか判定し、equal（既定は Object.is）で同じ値なら何もしない行、signalValueChanged が version++ → producerIncrementEpoch → producerNotifyConsumers → postSignalSetFn の順に呼ぶ行。consumerAllowSignalWrites が false の consumer（computed・linkedSignal・テンプレート）の中で書くと NG0600 になり、そのメッセージを application\_ref.ts の publishSignalConfiguration が差し込む仕組み。
5. [push と pull：dirty を伝える producerNotifyConsumers と、version を見比べる consumerPollProducersForChange](05-signals-push-pull.md)  
   set は consumer に dirty を伝えるだけで値は計算しない（push）。読む側が producerUpdateValueVersion → consumerPollProducersForChange で「依存先の version が記録と違うか」を確かめてから再計算する（pull）。lastCleanEpoch で全体が変わっていなければ即答する近道、ひし形の依存（A → B, C → D）で D が 1 回しか計算されない（グリッチが出ない）理由、通知中の読み込みと effect の同期実行を禁じる inNotificationPhase。
6. [computed の内側：UNSET・COMPUTING・ERRORED と、遅延評価とメモ化](06-signals-computed.md)  
   COMPUTED\_NODE の producerMustRecompute と producerRecomputeValue を 1 行ずつ読む。初回は UNSET、計算中は COMPUTING にして自分を読んだら「Detected cycle in computations.」（コード無しの Error）、例外は ERRORED としてキャッシュして次に読んだ人にも投げる、新しい値が equal なら version を進めない（下流の再計算が止まる）。読まれない computed は計算されないことをデモで確かめる。
7. [live な consumer と non-live：リンクの張り方の違いと、メモリが解放される理由](07-signals-live.md)  
   consumer には live（effect やテンプレートのように常に通知を受けたいもの）と non-live（読まれたときだけ計算する computed）がある。producerAddLiveConsumer が producer の consumers リストにリンクを足し、自分の producers にも再帰的に live を広げる行、consumerIsLive の判定、最後の live consumer が外れたとき producerRemoveLiveConsumerLink がリンクを切る行、consumerDestroy。non-live の computed は producer から参照されないので GC される。
8. [linkedSignal の内側：書ける computed、source と previous](08-signals-linked-signal.md)  
   LINKED\_SIGNAL\_NODE が COMPUTED\_NODE と同じ producerRecomputeValue の形を持ちつつ、source の値と previous（前回の source と value）を computation に渡す行、linkedSignalSetFn が自分の value を直接書き換えて version を進める行、source が変わると書いた値が捨てられる理由。core の linkedSignal() が短い形（関数 1 つ）と長い形（{source, computation}）をどう振り分けるか。
9. [effect の内側：BASE\_EFFECT\_NODE・runEffect・onCleanup・破棄](09-signals-effect-node.md)  
   primitives の BASE\_EFFECT\_NODE と runEffect が consumerBeforeComputation → fn(onCleanup) → consumerAfterComputation をどう包むか、cleanup がいつ呼ばれるか（次の実行の前と destroy）。core の effect() が injector・manualCleanup・DestroyRef をどう扱い、EffectRef.destroy が何を外すか。primitives に残る createWatch が core の effect では使われていないこと。スケジューリングは「effect はいつ走るか」の章に任せ、この章はノードと寿命を読む。
10. [afterRenderEffect：4 つのフェーズを signal でつなぐ](10-signals-after-render-effect.md)  
   afterRenderEffect({earlyRead, write, mixedReadWrite, read}) がフェーズごとに AfterRenderPhaseEffectNode を作り、前のフェーズの戻り値を次のフェーズに signal として渡す行。依存が変わったフェーズと、その値を読む後続フェーズに dirty が伝わり、実際に走るのは前のフェーズの戻り値の version が進んだときだけになる仕組み、consumerAllowSignalWrites: true の理由、AfterRenderManager に登録されて描画の後に走る順番。
11. [input と viewChild は何でできているか](11-authoring.md)  
   input() は signal にプロパティを 2 つ足しただけ。viewChild() はカウンタを読む computed。どちらも Signal の仕組みを組み替えて作られている。
12. [input() はコンパイラにどう見えるか：初期化子 API の検出から InputFlags.SignalBased まで](12-signals-input-compile.md)  
   ngtsc の initializer\_functions.ts がクラスフィールドの初期化子から input / input.required / model / output / viewChild などを import 元まで確かめて見つける行、input\_function.ts が InputMapping に isSignal を立てる行、compiler が inputs を \[InputFlags.SignalBased, "name"\] の形で出す行。実行時に setInput が applyValueToInputSignal を呼ぶ経路と、型検査用の ɵINPUT\_SIGNAL\_BRAND\_WRITE\_TYPE。compliance fixture の実際の出力を読む。
13. [model() と output()：双方向バインディングと OutputEmitterRef](13-signals-model-output.md)  
   createModelSignal が input の signal に set と subscribe を足し、set で値を変えると listeners に emit する行。コンパイラが \[(value)\] を property と (valueChange) の 2 つに分ける行と ɵɵtwoWayProperty / ɵɵtwoWayListener。output() の OutputEmitterRef が listeners 配列を持ち、DestroyRef で破棄されたあとの subscribe は NG0953 を throw し、emit は NG0953 を warn に出すだけの違い、outputFromObservable / outputToObservable。
14. [toSignal と toObservable：Observable と Signal の橋渡し](14-signals-rxjs-interop.md)  
   toSignal が subscribe して状態を signal に入れ（Value / Error / NoValue の 3 種類）、computed で読み出すときにエラーを投げる仕組み、requireSync の NG0601、initialValue、DestroyRef で unsubscribe する行、manualCleanup。toObservable が effect の中で source を読み ReplaySubject に next する行と、その値が届くタイミング（同期ではない）。
15. [非同期を Signal の世界に持ち込む](15-resource.md)  
   resource() の 6 つの状態（内部は 4 つ）を作る linkedSignal と computed、loader を呼ぶ effect、前の読み込みを AbortController で止める行、set / reload / destroy、debounced と resourceFromSnapshots を読む。
16. [httpResource と rxResource：resource の上に HttpClient と Observable を載せる](16-signals-http-resource.md)  
   httpResource が request を params 関数として HttpRequest に変え、loader の中で HttpClient の Observable を購読して ResourceStreamItem を流す行、progress / headers / statusCode が signal になる理由、text / blob / arrayBuffer の版、parse と equal。rxResource が stream の Observable を同じ形に変換する行。resource() 本体の状態遷移は「非同期を Signal の世界に持ち込む」の章に任せる。
17. [Signal Forms — 値のコピーを持たないフォーム](17-signal-forms.md)  
   v22 で入った 3 つ目のフォーム API。渡した signal を根の value にし、子は deepSignal で覗くので値のコピーを持たない。検証は computed の中で走り、\[formField\] は ɵɵcontrol で入力欄とつながる。
18. [DevTools が signal のグラフを描ける理由：getSignalGraph と formatter](18-signals-debug.md)  
   signal\_debug.ts の getSignalGraph が注入器からテンプレートの consumer と effect を集め、producers のリンクを辿ってノードと辺を作る手順、kind で種類を見分ける行、debugName をコンパイラが開発ビルドだけに足す変換、toggleWatchSignal。primitives の formatter.ts が Chrome DevTools のカスタムフォーマッタで Signal(1) と表示する仕組み（\[Signal: 値\] は開発モードの toString）と、ngDevMode で外れる理由。
