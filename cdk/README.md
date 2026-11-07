[目次](../README.md)

# CDK の内側

> 見た目を持たない部品を、angular/components の実際の行で

CDK（Component Dev Kit）は、Angular Material から見た目を取り除いた「振る舞いだけの部品」です。浮く UI を body の下に出す Overlay、その中身を差し込む Portal、フォーカスを閉じ込める FocusTrap、キーボードで項目を選ぶ ListKeyManager、読み上げを伝える LiveAnnouncer、1 万行を数十行で見せる仮想スクロール、行とセルを組み立てる table、木を描く tree、指に付いてくるドラッグ、そしてテストで部品を操作するハーネス。どれも DOM とブラウザの癖に正面から向き合ったコードです。この回のデモは本物の @angular/cdk をこのページの中で動かします。

全 21 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/cdk)

1. [CDK の概観：見た目を持たない部品と、エントリポイントの層](01-cdk-overview.md)  
   @angular/cdk が @angular/cdk/overlay のような 20 あまりの二次エントリポイントに分かれている理由と、BUILD.bazel の deps で決まる依存の層（platform・bidi・coercion・collections・portal → observers・layout・scrolling → a11y → overlay・table・tree・drag-drop → dialog・menu）。見た目を持たない CDK が構造の CSS だけを \_CdkPrivateStyleLoader で読み込む仕組み。Material や新しい @angular/aria が CDK のどこを使っているか、どの回がどこを扱うかの地図。
2. [Platform と Directionality：ブラウザの判定と、右から左の向き](02-cdk-platform-bidi.md)  
   Platform が userAgent と機能の有無からブラウザを判定する行、サーバーで描画するときに isBrowser が false になる理由、passive なイベントや scroll の挙動を調べる features の関数。Directionality が dir 属性と DIR\_DOCUMENT から ltr / rtl を決め、Dir ディレクティブが子に向きを伝える仕組み。coercion の関数が入力を数値や真偽に直す行。
3. [ContentObserver と BreakpointObserver：DOM と画面幅の変化を知らせる](03-cdk-observers-layout.md)  
   ContentObserver が MutationObserver を要素ごとに 1 つにまとめ、cdkObserveContent が debounce して知らせる行。SharedResizeObserver が box の種類ごとに ResizeObserver を共有する理由。BreakpointObserver が MediaMatcher の matchMedia を組み合わせ、Breakpoints の定数（Handset など）で画面幅を判定する行と、サーバーでの扱い。
4. [Portal と PortalOutlet：「何を出すか」と「どこに出すか」を分ける](04-cdk-portal.md)  
   ComponentPortal・TemplatePortal・DomPortal が「出す中身」を、PortalOutlet が「出す場所」を表す設計。BasePortalOutlet.attach が種類で分岐する行、DomPortalOutlet が createComponent で作った要素を外の DOM ノードに移し、ApplicationRef に attachView する行、CdkPortalOutlet ディレクティブが ViewContainerRef を使う違い。破棄の順番。
5. [Overlay：浮く UI を body の下に出す](05-cdk.md)  
   createOverlayRef が OverlayContainer（body 直下の cdk-overlay-container）の中に host と pane を作り、OverlayRef が中身の attach・位置の更新・backdrop・破棄を受け持つ行。既定で使うネイティブの popover（popover="manual" と showPopover）でトップレイヤーに上げる理由、スタイルを最初の 1 回だけ読み込む仕組み、SSR で作られたコンテナの掃除。
6. [FlexibleConnectedPositionStrategy：はみ出したら別の位置を試す](06-cdk-overlay-position.md)  
   ボタンの下にメニューを出すとき、指定した位置の候補を前から順に試し、画面に収まるかを測って選ぶ計算。\_getOriginPoint と \_getOverlayPoint が基準点を出す行、\_getOverlayFit が画面からはみ出す量と見える面積を測る行、全部はみ出すときに「縮めれば収まる候補」→「一番よく見える候補を withPush で押し戻す」の順で選ぶ行、minWidth/minHeight が無いと withFlexibleDimensions が効かない理由、GlobalPositionStrategy との違い。
7. [スクロール戦略と Dispatcher：スクロール・Esc・外側のクリック](07-cdk-overlay-scroll-dispatch.md)  
   開いた Overlay を、ページがスクロールしたとき位置を直す（reposition）・閉じる（close）・スクロールを止める（block）・何もしない（noop）の 4 つの戦略と、それぞれの行。ScrollDispatcher が document と cdkScrollable のスクロールだけを聞く理由、OverlayKeyboardDispatcher が Esc を一番上の Overlay にだけ渡す行、OverlayOutsideClickDispatcher が pointerdown の起点も見て外側のクリックを判定する行、複数の Overlay が重なったときの順番。
8. [FocusTrap：見えない番兵でフォーカスを閉じ込める](08-cdk-focus-trap.md)  
   FocusTrap が中身の前後に tabindex=0 の番兵要素を置き、番兵にフォーカスが来たら反対側の端に戻す行。InteractivityChecker が要素の可視性・無効・tabindex からフォーカスできるかを判定する行、cdkFocusInitial と cdkFocusRegionStart の探し方。クリックでの脱出まで止める ConfigurableFocusTrap（document の capture の focus で引き戻す inert 戦略）と、重なった罠の一番上だけを有効にする FocusTrapManager。
9. [FocusMonitor：キーボードかマウスか、フォーカスの出どころを見分ける](09-cdk-focus-monitor.md)  
   InputModalityDetector が keydown・mousedown・touchstart を document の capture で拾い、直前の入力手段を覚える行。FocusMonitor が focus を受けたとき、その記録と 1ms（タッチは 650ms）の時間窓から origin（keyboard / mouse / touch / program）を決め、cdk-keyboard-focused などのクラスを付ける行。キーボードのときだけ枠を見せる CSS の書き方、スクリーンリーダーの偽イベントの見分け方、Shadow DOM の扱い。
10. [ListKeyManager：矢印キーと頭文字で項目を選ぶ](10-cdk-key-manager.md)  
   ListKeyManager.onKeydown が上下・Home・End・PageUp などを次の項目の番号に直す行、無効な項目を飛ばす行、withWrap で端から反対側へ回る行。頭文字で選ぶ typeahead が文字を溜めて一定時間で消す仕組み、ActiveDescendantKeyManager と FocusKeyManager の違い（aria-activedescendant か本物のフォーカスか）、TreeKeyManager。
11. [LiveAnnouncer と AriaDescriber：画面読み上げに伝える](11-cdk-live-announcer.md)  
   LiveAnnouncer が aria-live の領域を 1 つ body に作り、文字を入れ直して読み上げさせる行（いったん空にしてから時間を置いて入れる理由）、politeness（polite / assertive）。aria-modal なダイアログが開いているとき領域を aria-owns でつなぐ行。AriaDescriber が説明の要素を共有し aria-describedby を付け外しする行。
12. [Dialog：Overlay と Portal と FocusTrap を組み合わせる](12-cdk-dialog.md)  
   Dialog.open が OverlayRef を作り、CdkDialogContainer をそこに attach し、中身を Portal で差し込む流れ。コンテナがフォーカスを閉じ込め、最初の要素にフォーカスし、閉じたら元の要素に戻す行。フォーカスが入ったあと背後の要素に aria-hidden を付ける行（aria-modal は既定で付けない理由）、DialogRef の closed と backdropClick・Esc で閉じる行、注入器（DIALOG\_DATA）の親の決まり方。
13. [CDK Menu：入れ子のメニューを MenuStack でたどる](13-cdk-menu.md)  
   cdkMenuTriggerFor が Overlay でメニューを開き、開いたメニュー自身が MenuStack に自分を積む行。矢印キーで隣のメニューへ、Esc で 1 段閉じる動きが ListKeyManager とスタック（close / closeSubMenuOf / closeAll と emptied）でどう決まるか。サブメニューへマウスを斜めに動かしても閉じない menu aim（TargetMenuAim）が、直近の座標から伸ばした直線とサブメニューの矩形の交差を多数決して 300ms 待つ判定。
14. [DataSource と SelectionModel：データと選択を部品から切り離す](14-cdk-collections.md)  
   DataSource が connect / disconnect で配列を流す Observable を渡す約束と、table・tree・仮想スクロールが配列・Observable・DataSource を 1 本の Observable にそろえて受け取る理由。SelectionModel が Set で選択を持ち、changed で差分（added / removed）を 1 回にまとめて出す行、単一選択で前の値を外す行、compareWith。\_RecycleViewRepeaterStrategy が外した行のビューを 20 個までしまって使い回す行と、\_DisposeViewRepeaterStrategy との違い。
15. [仮想スクロール：1 万件を数十件で見せる](15-virtual-scroll.md)  
   CdkVirtualScrollViewport が scroll を受けて表示範囲を計算し、CdkVirtualForOf が範囲内の行だけを描く流れ。FixedSizeVirtualScrollStrategy が minBufferPx と maxBufferPx で再描画の回数を抑える計算、全体の高さを出す spacer、内側の要素を transform で動かす行、ビューの使い回し。
16. [cdk-table：列の定義から行とセルを組み立てる](16-table.md)  
   CdkTable が cdkColumnDef・cdkHeaderRowDef・cdkRowDef を集め、データの差分（IterableDiffer）に合わせて行を足し引きし、各行に列ごとのセルを差し込む流れ。CdkCellOutlet.mostRecentCellOutlet という静的プロパティで行とセルを受け渡す理由、sticky の行と列を StickyStyler が置く行、trackBy。
17. [CdkTree：入れ子のデータを平らに並べて描く](17-cdk-tree.md)  
   CdkTree が childrenAccessor か levelAccessor でデータをたどり、展開されているノードだけを平らな列にして描く行（閉じた枝の中も毎回たどる）。展開の状態を持つ仕組み（非推奨の TreeControl と、木の中の SelectionModel）、cdkTreeNodePadding が深さから字下げを出す行、cdkTreeNodeOutlet による入れ子の描画、TreeKeyManager による矢印キーでの開閉。
18. [DragRef：ドラッグを滑らかに見せる計算](18-drag-drop.md)  
   pointerdown から、縦横の移動量の和がしきい値（dragStartThreshold）を超えて初めてドラッグを始める行、document へのリスナーを DragDropRegistry が押している間だけ張る行、リストの中では placeholder と popover のプレビューを作る行、位置を制限して transform だけで動かす行、dragStartDelay とタッチの扱い、離したあとに CSS の transition で元の位置へ戻る流れ。
19. [DropListRef：並べ替えの位置と、リストをまたぐ移動](19-cdk-drop-list.md)  
   ドラッグ中の要素がどの位置に入るかを、DropListRef が各項目の ClientRect と比べて決める行。SingleAxisSortStrategy と MixedSortStrategy（折り返すリスト）の違い、cdkDropListConnectedTo で別のリストに入るときの判定、端に近づくと自動でスクロールする行、moveItemInArray と transferArrayItem。
20. [コンポーネントハーネス：テストが DOM の構造に縛られない仕組み](20-harness.md)  
   ComponentHarness が locatorFor で子の要素やハーネスを探し、TestElement の click や getText を通して操作する設計。HarnessEnvironment の抽象メソッドを TestbedHarnessEnvironment が実装する行、操作のたびに変化検知と whenStable を待つ行、parallel() で読み取りをまとめる仕組み。
21. [Material のテーマ：値の代わりに CSS 変数の名前を返す](21-theming.md)  
   Angular Material の M3 テーマが、デザイントークン（--mat-sys-\* と部品ごとの変数）を CSS 変数として 1 回だけ出す仕組み。トークンの関数が引数の有無で「値を出す」と「変数名を返す」を切り替える行、部品の scss が var() で読む行、overrides の mixin。CDK の上に見た目を載せる層として。
