[目次](../README.md)

# Angular Elements の内側

> createCustomElement・属性と入力・ComponentNgElementStrategy・投影するノード・入力と変更検知・出力とイベント・切り離しと破棄

@angular/elements は、Angular のコンポーネントを Web Components のカスタム要素（customElements.define で登録する、HTML のタグとして使える要素）に包むパッケージです。packages/elements/src は 750 行ほどで、createCustomElement が HTMLElement を継承したクラスを作り、そのクラスが要素のライフサイクル（connectedCallback・attributeChangedCallback・disconnectedCallback）を ComponentNgElementStrategy に渡します。strategy は、要素がページにつながったときにコンポーネントを作り、要素の子を ng-content へ投影し、属性やプロパティで来た値を入力に入れて変更検知の予定を立て、出力を DOM の CustomEvent に直し、要素が外れたら少し待ってからコンポーネントを壊します。このシリーズでは、その流れを 1 つずつ読みます。ページの上のデモは、本物の @angular/elements 22.1.6 で、このページに本物のカスタム要素を登録して動かします。各章の最後に、その仕組みの spec と手元での走らせ方を置きます。最終回は、開いている issue を読みます。

全 8 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/elements)

1. [Angular Elements の全体像：カスタム要素とコンポーネントの間](01-elements-overview.md)  
   packages/elements/src の分担（create-custom-element・component-factory-strategy・element-strategy・extract-projectable-nodes・utils）と、カスタム要素のライフサイクルの呼び出しが strategy を通ってコンポーネントに届く全体図。NgElement・NgElementStrategy・NgElementStrategyFactory の約束、公開の API（public\_api.ts）、各章へのリンク。
2. [createCustomElement：HTMLElement を継承したクラスを作る](02-elements-create.md)  
   createCustomElement が NgElementImpl を作り、observedAttributes を入力から決め、connectedCallback・attributeChangedCallback・disconnectedCallback を strategy に回し、入力ごとにプロパティの getter と setter を定義する行。strategy を遅れて作る理由と、つながる前に設定されたプロパティの扱い、signal の入力の getter の修正（be0455adda7）。
3. [属性と入力：名前の変換と getComponentInputs](03-elements-attributes-inputs.md)  
   utils.ts の getComponentInputs（reflectComponentType の inputs を返すだけ）・camelToDashCase・getDefaultAttributeToPropertyInputs と scheduler。HTML の属性（文字列か null）が入力の名前と値に直る道、別名（alias）を付けると属性とプロパティの名前がずれること（#58302）、transform は要素の側ではなく core の setInput の先で呼ばれ signal の入力でも効くこと。src から呼ばれなくなった isFunction・kebabToCamelCase・strictEquals。
4. [要素がつながるとき：ComponentNgElementStrategy.connect と投影](04-elements-connect.md)  
   connect が、前の切り離しの予定を取り消すか、initializeComponent でコンポーネントを作る行（壊れたあとのつなぎ直しで作られない #38778 の形も）。要素の子を CSS のセレクターと '\*' で ng-content ごとに分ける extractProjectableNodes（ngProjectAs は効かない）と core の projectNodes・applyProjection、注入器（EnvironmentInjector として渡される）、作る前に貯めておいた入力の値を入れる initializeInputs と、ApplicationRef への attachView。
5. [入力と変更検知：setInputValue と ChangeDetectionScheduler](05-elements-inputs-cd.md)  
   setInputValue がつながる前は値を Map に置き、つながったあとは ComponentRef.setInput に渡す行。setInput が Object.is で同じ値を弾く行、ngOnChanges のための SimpleChanges を NgOnChangesFeature が箱にためて tick の中で 1 回だけ渡す行、isViewDirty・markForRefresh と NotificationSource.CustomElement の通知、runInZone。v22 の既定（zoneless・OnPush）では何回入れても tick は 1 回にまとまる（scheduleDetectChanges は 0cebfd7462c で消えた）。
6. [出力とイベント：CustomEvent になるまで](06-elements-outputs.md)  
   initializeOutputs がコンポーネントの出力（output と EventEmitter）を events の Observable（ReplaySubject と switchMap）にまとめ、NgElementImpl が connect より前に購読して dispatchEvent(new CustomEvent(name, {detail})) にする行。イベントの名前（別名）・detail・bubbles（書いていないので false）、constructor と ngOnInit の emit のどちらが届くか。外して待って戻すと output() の要素でイベントの購読が NG0953 で落ちる記録。
7. [切り離しと破棄：少し待ってから壊す](07-elements-disconnect.md)  
   disconnect が 10 ms 後に destroy する予定を立て、同じ要素がすぐつながり直したら取り消す行、壊すときに ComponentRef.destroy から ApplicationRef.detachView と destroyLView に進む行と、要素の側で出力の購読をすぐやめる行。要素を DOM の中で移動したときに作り直されない理由と、待ってから戻すと 1 回おきにしか作り直されない #38778 が v22 でも起きること、残った DOM と PRESERVE\_HOST\_CONTENT。
8. [spec と issue を読む：Angular Elements の今](08-elements-tests-issues.md)  
   packages/elements/test の 6 つの spec（64 件、うち xit 5 件）の地図と、xit が止められている理由、ng\_web\_test\_suite で Chromium と Firefox のブラウザで走る書き方と手元での走らせ方（名前の絞り込みは効かない）。ラベル area: elements の開いている 36 件と 2025 年以降に閉じた 23 件、2024 年 6 月からの修正を、このシリーズのどの章の行に関係するかで絞り込める表にする。
