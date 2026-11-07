[目次](../README.md)

# Angular Aria の内側

> @angular/aria の Listbox・Tabs・Tree・Grid・Combobox・Menu

@angular/aria は、見た目を持たずに WAI-ARIA のパターン（listbox・tabs・tree・grid・combobox・menu など）のキーボード操作・フォーカス・選択・ARIA 属性だけを受け持つディレクティブの集まりです。中は 3 層になっています。テンプレートに書く ngListbox などのディレクティブ、その裏で状態を持つ UI Pattern（ListboxPattern など）、そして複数の Pattern が共有する Behavior（フォーカス・移動・選択・頭文字検索・展開）です。このシリーズは、Pattern が core の signal ではなく SignalLike を使う理由と、項目を DOM の順に並べる SortedCollection から始め、Behavior を 1 つずつ読み、それを組み合わせた各部品へ進みます。各章の最後に、その仕組みを確かめている spec と、components リポジトリでの走らせ方（ブラウザで動く bazel のテスト）を置きます。最終回は、開いている issue と、それに付いた外部の PR を読みます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/aria)

1. [Angular Aria の全体像：ディレクティブ・UI Pattern・Behavior の 3 層](01-aria-overview.md)  
   @angular/aria のエントリポイント（accordion・combobox・grid・listbox・menu・tabs・toolbar・tree と private）と、ディレクティブ → UI Pattern → Behavior の 3 層。Listbox ディレクティブが自分の input を \`...this\` で ListboxPattern に渡す行。CDK の a11y（ListKeyManager）や CDK Menu との違い、このサイトに入れた 22.1.8 と読んでいる 22.2.0-next.5 の差。spec の置き場と、ブラウザで走る bazel のテスト。
2. [SignalLike：Pattern が core の signal を直接使わない理由](02-aria-signal-like.md)  
   ui-pattern-rules.md が Pattern の入力を SignalLike / WritableSignalLike に限る決まりと、signal-like.ts が @angular/core/primitives/signals の createSignal・createComputed・createLinkedSignal から signal・computed・linkedSignal を作り直す行。asReadonly が自分自身を返すこと、debugName を空文字にしている行（理由はソースに無い）と、それを消そうとする PR #32904、どこからも呼ばれていない convertGetterSetterToWritableSignalLike。ディレクティブの input() や model() がそのまま Pattern の入力になる仕組み。
3. [SortedCollection：項目を DOM の順に並べる](03-aria-collection.md)  
   ngOption などの子が register / unregister で親に名乗り出て、SortedCollection が Set と version の signal から orderedItems を計算する仕組み。sortDirectives が compareDocumentPosition で並べる行、MutationObserver が childList の変化だけで version を進める理由、afterNextRender で見張りを始める理由。contentChildren から置き換えた変更と、その TODO。
4. [イベントマネージャ：キーと修飾キーを処理に結びつける](04-aria-events.md)  
   KeyboardEventManager・PointerEventManager・ClickEventManager が on(修飾キー, キー, 処理) で config を積み、handle が合ったものを全部、積んだ順に走らせる仕組み。getModifiers・hasModifiers（完全一致のビット）、preventDefault と stopPropagation の既定、Pattern の keydown が computed で、組み立てのときに読んだ signal が変わったときだけ作り直される理由、isFakeClick・isProgrammaticClick、プロトタイプ汚染を避けた変更と、配列なしの Ctrl | Shift が合わない落とし穴。
5. [ListFocus：roving tabindex と aria-activedescendant](05-aria-list-focus.md)  
   ListFocus が activeItem の signal から activeIndex を計算し、focusMode が roving なら項目の tabindex を 0 / -1 で切り替え、activedescendant ならコンテナにフォーカスを残して aria-activedescendant を返す行。softDisabled で無効な項目にもフォーカスを置く理由、isFocusable、focus() が要素に本当に focus するかどうかの opts。
6. [ListNavigation：次へ・前へ・最初・最後](06-aria-list-navigation.md)  
   ListNavigation の next / prev / first / last / goto が \_advance と \_peek で、wrap と無効な項目の飛ばし方（ListFocus.isFocusable）を見ながら次の項目を探す行。peek 系が動かずに先を見る理由と使っている場所（Toolbar・Menu）。orientation と textDirection は入力にあるが ListNavigation は読まず、矢印キーの読み替え（右から左で左右が逆）は ListboxPattern の prevKey / nextKey が受け持つこと。
7. [ListSelection：選ぶ・外す・範囲で選ぶ](07-aria-list-selection.md)  
   ListSelection の select / deselect / toggle / selectOne / selectAll / selectRange が value の WritableSignalLike を書き換える行。multi のとき Shift で範囲を選ぶための rangeStartIndex / rangeEndIndex と ListFocus.prevActiveIndex、無効な項目と readonly の扱い。selectionMode は入力にあるが ListSelection は読まず、follow / explicit は ListboxPattern のキーの表（selectOne を付けて動くか）で分かれること。
8. [ListTypeahead：頭文字で項目を探す](08-aria-typeahead.md)  
   ListTypeahead.search が打った文字を \_query にためて typeaheadDelay（既定 500 ms）で消し、今の項目の次から label の前方一致で探す行。isTyping の間はスペースを選択ではなく文字として扱う理由。CDK の Typeahead（cdk-key-manager）との違い。
9. [Listbox：Behavior を組み合わせた最初の部品](09-aria-listbox.md)  
   List が ListFocus・ListNavigation・ListSelection・ListTypeahead を 1 つにまとめ、ListboxPattern が keydown / pointerdown の表を組み、Listbox ディレクティブが host に role・aria-multiselectable・aria-activedescendant を書く行。afterRenderEffect で setDefaultState を走らせる理由、選んだ値が無くなった項目を value から外す effect、開発モードの validate と reportViolations。
10. [Accordion：ListExpansion で開いて閉じる](10-aria-accordion.md)  
   ListExpansion の open / close / toggle / openAll が expanded の値を書く行と、multiExpandable が偽なら他を閉じる仕組み。AccordionGroup・AccordionTrigger・AccordionPanel が aria-expanded・aria-controls・role="region" をどう結ぶか、トリガーが別のコンポーネントの中にあっても見つかる理由。パネルの中で Enter を押すと開閉してしまう開いている issue。
11. [DeferredContent：閉じているパネルの中身を作らない](11-aria-deferred-content.md)  
   DeferredContentAware の contentVisible と、DeferredContent が afterRenderEffect で TemplateRef を ViewContainerRef に作る・preserveContent でなければ消す行。Accordion と Tabs のパネルが中身を遅らせて作る仕組みと、最初から作ってほしいという開いている issue。
12. [Tabs：選んだタブとパネルを結ぶ](12-aria-tabs.md)  
   TabListPattern が List を使わずに ListFocus・ListNavigation・ListExpansion（multiExpandable: false）を組み、選択を「1 つだけ開く」で表す行。フォーカスと選択を分ける selectionMode、value の文字列でタブとパネルを結ぶ aria-controls・aria-labelledby、パネルの tabindex。pointerdown でなく click で選ぶ変更、選んだタブを消したときにタブの止まり場所が無くなる開いている issue と、それに付いた PR。
13. [Toolbar：ウィジェットの集まりと、22.1.8 からの書き換え](13-aria-toolbar.md)  
   ToolbarPattern が ToolbarWidget と ToolbarWidgetGroup を 1 本の List として並べ、ラジオのような group の中と外で矢印キーの意味を変える行。このサイトの 22.1.8 と読んでいる 22.2.0-next.5 の差（選択の Behavior を外した #33747）を diff で読み、同じ API 名でも中身が変わったことを確かめる。
14. [Tree：入れ子の項目を平らなリストとして動かす](14-aria-tree.md)  
   Tree の Behavior が DOM の順に並べた平らなリストの上で、見えている項目だけに止まり（TreeListFocus）、→ で開くか最初の子へ進み、← で閉じるか親へ戻る行。parent / firstChild / nextSibling、aria-level・aria-setsize・aria-posinset の計算、クリックが選択と開閉を続けて呼ぶ行と、それをドキュメントで答えた #33468。TreeItemGroup を要素から ng-template の構造ディレクティブにした 2f094f2ffa。CdkTree（cdk-tree）との違い。
15. [Grid：行と列の 2 次元を動く](15-aria-grid.md)  
   GridData がセルの行・列の広がり（rowspan / colspan）から座標の表を作り、GridFocus が今いるセルと座標を別々に持ち、GridNavigation が 3 種類の折り返しで上下左右・行の端へ動き、GridSelection が範囲の中のセルを選ぶ行。Behavior に残る selectionAnchor の linkedSignal と、キーとマウスからの範囲選択を外した 2a13f69e03、無効なセルを roving tabindex の計算から外した修正、大きな表で遅かった 2 つの問題（pointermove・セルの host のバインディング）の直し方。
16. [Grid のセルとウィジェット：セルの中の入力欄へ入る](16-aria-grid-cells.md)  
   GridRow・GridCell・GridCellWidget が、セルの中のボタンや入力欄へ Enter で入り Escape で出る仕組み（widget の activate / deactivate と 3 つの widgetType）、セルを行の外で宣言すると GRID\_ROW が見つからない問題（#32603）と、注入トークンを公開して継いだ部品を作れるようにした変更（8d3da9ea36、22.2 から）。
17. [Combobox：入力欄と、開いて閉じるポップアップ](17-aria-combobox.md)  
   ComboboxPattern が入力欄に残ったフォーカスのまま、キーを 1 つだけ持つ keyboardEventRelay の signal に置き、描画のあとの effect で写しを作ってポップアップ（Listbox・Tree・Grid）へ投げ直す仕組み、select と autocomplete を分ける isEditable・aria-autocomplete、フォーカスが外れたら setTimeout で閉じる行。この 1 年でいちばん多く直された部品で、zone.js との相性や中継の再送の修正、続けて打ったキーが落ちる開いている issue（#33973）をページの上で再現。PopupControl はどの Pattern にも使われておらず、filterMode は以前の combobox とともに消えた。
18. [Menu と MenuBar：入れ子のメニューを開いて閉じる](18-aria-menu.md)  
   MenuPattern・MenuBarPattern・MenuTriggerPattern（private/menu/menu.ts、883 行）が、サブメニューを開く・閉じる・ホバーで移る・頭文字で移るを受け持つ行。項目が後から来てもフォーカスを中へ移す修正、サブメニューの中の DOM が変わるとたたまれていた問題。22.1.8 との差と、CDK Menu（cdk-menu）との違い。
19. [Aria のテスト：ハーネス・axe-core・violations](19-aria-testing.md)  
   Behavior・Pattern・ディレクティブの 3 種類の spec（signal だけで Pattern を確かめる書き方と、TestBed とブラウザ）、private/testing/test-helpers.ts、ComboboxHarness などのテストハーネス、cdk/testing/private の runAccessibilityChecks 経由で axe-core を走らせる spec、開発モードだけの validate と reportViolations（console.warn）。components リポジトリの bazel のブラウザテスト（chromium と firefox、strict\_deps\_test）の走らせ方と件数、このサイトの Vitest + jsdom で Aria を動かした結果。
20. [issue と PR を読む：Angular Aria の今](20-aria-issues.md)  
   area: aria/\* ラベルで開いている issue と、この 1 年に閉じた issue の表。開いている issue の多くに数日のうちに外部の PR が付いていること、その PR がどの行を直しているか。developer preview が外れた変更、Material との関係、spinbutton など新しい部品の提案。
