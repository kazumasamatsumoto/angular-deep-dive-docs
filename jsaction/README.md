[目次](../README.md)

# イベント配送（event-dispatch）と jsaction の内側

> jsaction 属性・EventInfo・イベントの種類・早期の契約・EventContract・ActionResolver・a11y の click・mouseenter とタッチ・Dispatcher と EventDispatcher・Angular とのつながり

packages/core/primitives/event-dispatch/ は、JSAction と呼ばれる小さなイベント委譲のライブラリです。イベントのリスナーを要素ごとに付けず、コンテナ（ふつうは body やアプリのルート）に種類ごとに 1 つだけ付け、イベントが来たら、要素に書いた jsaction 属性（例: jsaction="click:;keydown:;"）を親へたどって行き先を決めます。行き先のコード（Angular ではハイドレーションの済んだリスナー）がまだ無ければイベントを貯めておき、あとで渡し直します。Angular はこれを 2 つの所で使っています。SSR のページで JS が来る前のクリックを失わないイベントの記録と再生（withEventReplay）と、@defer (hydrate on interaction / hover) の塊を目覚めさせる道です。このシリーズでは、jsaction 属性の書式と解析、イベントを運ぶ EventInfo の形、扱うイベントの種類、HTML の中のスクリプトで最初に置く早期の契約、EventContract と EventContractContainer、ActionResolver が行き先を探す道、キーボードの Enter や Space を click として扱う a11y の click、委譲では来ない mouseenter を作り直す仕組みとタッチ、貯めたイベントを渡す Dispatcher と EventDispatcher（stopPropagation の真似）、そして Angular の側のつながりを 1 つずつ読みます。イベントの記録と再生の概観（event-replay）と hydrate のイベント（defer-hydrate-events）はこれまでの章に書いたので、そこへリンクします。このライブラリは DOM だけで動くので、ページの上のデモは、本物の @angular/core/primitives/event-dispatch をこのページの DOM で動かします。各章の最後に、その仕組みの spec と手元での走らせ方を置きます。最終回は、spec の読み方と開いている issue を読みます。

全 12 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/jsaction)

1. [JSAction の全体像：契約・行き先の解決・配送](01-jsaction-overview.md)  
   event-dispatch のファイルの分担（eventcontract・event\_contract\_container・earlyeventcontract・action\_resolver・event\_info・event\_type・event・dispatcher・event\_dispatcher・a11y\_click）と、イベントが「早期の契約で貯める → EventContract が受ける → ActionResolver が行き先を決める → Dispatcher が渡す」と流れる全体図。README が挙げる 2 つの問題、Angular が使う 2 つの所（イベントの記録と再生・hydrate トリガー）、公開されている入口（index.ts）と各章へのリンク。
2. [jsaction 属性を読む：書式・解析・要素ごとのキャッシュ](02-jsaction-attribute.md)  
   jsaction="click:handler;keydown:;" の書式（イベントの種類と行き先の名前を : と ; で区切る、名前を省いた形）と、ActionResolver の parseActions がそれを辞書に直す行、cache.ts が要素に解析の結果を貼っておく行（属性が変わったときの扱い）、attribute.ts・property.ts・char.ts の定数。
3. [EventInfo：イベントを運ぶ入れ物の形](03-jsaction-event-info.md)  
   event\_info.ts の EventInfo（イベントの種類・イベント・対象の要素・コンテナ・時刻・行き先・再生かどうか・a11y の click か・解決済みか）を、別々に最小化される契約と dispatcher の間で受け渡すために、名前を付け替えさせない短い名前のオブジェクト（行き先だけが \[名前, 要素\] の配列）で持つ理由と、get・set の関数、createEventInfoFromParameters・createEventInfo・cloneEventInfo（浅い写し）、外へ見せる EventInfoWrapper。
4. [イベントの種類：泡立つもの・捕まえるもの・早期のもの](04-jsaction-event-types.md)  
   event\_type.ts の EventType の一覧、BUBBLE\_EVENT\_TYPES と CAPTURE\_EVENT\_TYPES（focus・blur・load・error などを捕獲の段で付ける理由）、MOUSE\_SPECIAL\_EVENT\_TYPES、EARLY\_EVENT\_TYPES と isEarlyEventType、event.ts の getBrowserEventType・addEventListener・removeEventListener が passive と capture を決める行。
5. [早期の契約：JS が来る前のイベントを貯める](05-jsaction-early-contract.md)  
   contract\_binary.ts を esbuild（event-dispatch/BUILD.bazel の contract\_bundle\_min）で束ねた 476 バイトの event-dispatch-contract.min.js と、platform-server がそれを消すか window.\_\_jsaction\_bootstrap(document.body, appId, 泡立つ種類, 捕獲の種類) の 1 行を足す行（packages/platform-server/src/utils.ts）。earlyeventcontract.ts・bootstrap\_app\_scoped.ts・bootstrap\_global.ts が window.\_ejsas\[appId\]・window.\_ejsa に貯め場所を置く行、アプリが起動したあとに取り出して片付ける関数と、Angular が &lt;body&gt; のリスナーを外さないこと（#71518）・registerAppScopedDispatcher が流れを変えないこと。
6. [EventContract と EventContractContainer：コンテナにリスナーを付ける](06-jsaction-contract.md)  
   EventContract の欄と、addEvent が種類ごとに EventContractContainer へリスナーを 1 つ付ける行（重複・mouseenter の戻り、ブラウザの名前が違うときの browserEventTypeToExtraEventTypes）、handleEvent が EventInfo を作り、dispatcher が無ければ再生の印を付けて queue に貯め、あれば渡す行、getEventTypesForBrowserEventType（replayEarlyEventInfos が使う）と handler、registerDispatcher（ecrd）と実行時には読まれない Restriction、cleanUp。
7. [ActionResolver：対象から親へたどって行き先を探す](07-jsaction-resolver.md)  
   resolveEventType・resolveAction・resolveParentAction が、イベントの対象の要素から親へ（入れ物の手前まで。\_\_owner と shadow root の host を通って）たどり、jsaction 属性にそのイベントの種類がある最初の要素を行き先にする populateAction・getParentNode・populateActionOnElement の行。修飾キーや中ボタンのクリックを clickmod に分ける isModifiedClickEvent・isMiddleClick と、それが Angular のイベントの再生で Shift・Cmd のクリックを渡し直さない理由。
8. [a11y の click：Enter と Space を click として扱う](08-jsaction-a11y-click.md)  
   a11y\_click.ts が ActionResolver に差し込む 3 つの関数（keydown の種類を click に書き換える updateEventInfoForA11yClick、preventDefaultForA11yClick、populateClickOnlyAction）と、event.ts の isActionKeyEvent・isValidActionKeyTarget・isSpaceKeyEvent・shouldCallPreventDefaultOnNativeHtmlControl・isNativeHTMLControl・isFocusable・IDENTIFIER\_TO\_KEY\_TRIGGER\_MAPPING が、div・button・a・input・role の要素と Enter・Space でどう分かれるか、key\_code.ts。Angular の配布物ではこの仕組みが使われていないこと。
9. [mouseenter とタッチ：委譲では来ないイベントを作り直す](09-jsaction-mouse-touch.md)  
   mouseenter・mouseleave・pointerenter・pointerleave は泡立たないので、mouseover・mouseout から作り直す isMouseSpecialEvent・createMouseSpecialEvent の行（ActionResolver の syntheticMouseEventSupport）、タッチの touchend を click の形に作り直す getTouchData・recreateTouchEventAsClick、作り直したイベントの preventDefault・stopPropagation、getTarget。Angular の配布物ではどちらの作り直しも動いていないことをページの上で確かめる（isModifiedClickEvent・isMiddleClick は第 7 回）。
10. [Dispatcher と EventDispatcher：渡し直しと stopPropagation の真似](10-jsaction-dispatcher.md)  
   dispatcher.ts の Dispatcher（再生の予定を立てる scheduleEventInfoWrapperReplay・createEventReplayer。配列を空にしないので 2 回目の予定で前のイベントが再び渡る）と、Angular が使う event\_dispatcher.ts の EventDispatcher が、行き先を解決して dispatchDelegate に渡し、親へ泡立たせながら（捕獲の種類は対象の要素だけ）、イベントの stopPropagation・preventDefault・composedPath・currentTarget を差し替える（patchEventInstance、EventPhase、PROPAGATION\_STOPPED\_SYMBOL）行。書き換えられない形で貼るので、同じ Event を 2 つの EventDispatcher が配ると TypeError になること。
11. [Angular の側：イベントの記録と再生・hydrate の道とのつながり](11-jsaction-angular.md)  
   core の event\_delegation\_utils.ts と hydration/event\_replay.ts のうち event-replay の章で読んでいない行（起動のときの守り・使わないアプリでは空の預ける口・アプリが壊れたときの片付け）、サーバーが jsaction を付ける条件（hydration/annotate.ts）、render3/view/listeners.ts と invokeListeners で本物のリスナーと再生の二重の呼び出しを防ぐ行、最近の修正（d5fd51e9569 二重の呼び出し・3583c01bf9a イベントでない値の守りと関数の同一性・30e9c62bdfb メモリリーク）と、開いている #71518・#66506 の形を Node の記録で確かめる。
12. [spec と issue を読む：event-dispatch の今](12-jsaction-tests-issues.md)  
   packages/core/primitives/event-dispatch/test/（eventcontract\_test・dispatcher\_test・event\_dispatcher\_test・event\_test）がブラウザで走る書き方と手元での走らせ方（名前の絞り込みは効かない）、platform-server の event\_replay\_test（--filter が効く）。ラベル core: event dispatch と core: event listeners の issue、ラベルの無いイベントの再生の issue、2025 年 11 月以降の修正を、このシリーズのどの章の行に関係するかで絞り込める表にする。
