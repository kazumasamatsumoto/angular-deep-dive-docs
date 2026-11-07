[目次](../README.md) › [common の内側](README.md) › 第 19 回 / 全 20 回

# ViewportScroller：位置とアンカーへのスクロール

> BrowserViewportScroller の setOffset・getScrollPosition・scrollToPosition・scrollToAnchor、findAnchorFromDocument が id・name・shadow root の中を探す行（2026 年 6 月の修正 a69e56df718）、フォーカスでスクロールさせない修正（97cac1cf4d0、focus({preventScroll: true})）、setHistoryScrollRestoration、サーバーの NullViewportScroller。ルーターの RouterScroller が Scroll のイベントで呼ぶ行と、開いている issue（#48542・#55383・#69979）。ページの上で本物の scrollToAnchor を章の中の的と shadow root に向けるデモ。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-viewport-scroller)

---

`ViewportScroller` は、ページ全体（ビューポート）のスクロール位置を読み書きするサービスです。ルーターの「戻るで元の位置に戻す」「`#見出し` へ飛ぶ」は、最後にこのサービスの 3 つのメソッドを呼びます。この章では、アンカー（URL の `#` の後ろの名前）から要素を探す行、オフセットを引いてスクロールする行、フォーカスを移す行を 1 つずつ追い、開いている issue がどの行の話かを言えるようにします。

読む対象は `packages/common/src/viewport_scroller.ts`（247 行）と、呼び手の `packages/router/src/router_scroller.ts`（167 行）です。

1. [1. 全体像](01-cmn-overview.md)
2. [2. NgClass と NgStyle](02-cmn-ng-class-style.md)
3. [3. NgForOf](03-cmn-ng-for-of.md)
4. [4. NgIf と NgSwitch](04-cmn-ng-if-switch.md)
5. [5. outlet](05-cmn-outlets.md)
6. [6. pipe の仕組み](06-cmn-pipe-mechanism.md)
7. [7. 小さな pipe](07-cmn-simple-pipes.md)
8. [8. KeyValuePipe](08-cmn-keyvalue-pipe.md)
9. [9. DatePipe](09-cmn-date-pipe.md)
10. [10. 日付の書式](10-cmn-format-date.md)
11. [11. 日付の部品](11-cmn-date-getters.md)
12. [12. 数の書式](12-cmn-format-number.md)
13. [13. NgOptimizedImage](13-cmn-image-overview.md)
14. [14. srcset と sizes](14-cmn-image-srcset.md)
15. [15. 画像のローダー](15-cmn-image-loaders.md)
16. [16. LCP と preload](16-cmn-image-lcp-preload.md)
17. [17. Location](17-cmn-location.md)
18. [18. テスト用の Location](18-cmn-location-testing.md)
19. **19. ViewportScroller**（この章）
20. [20. issue と PR を読む](20-cmn-issues.md)

## 1. 抽象クラスと、ブラウザかサーバーかの分かれ

📄 `angular/packages/common/src/viewport_scroller.ts` L22–41 （▶ の行: 22, 26, 28–32, 41）

```ts
22 ▶ export abstract class ViewportScroller {
23 │   // De-sugared tree-shakable injection
24 │   // See #23917
25 │   /** @nocollapse */
26 ▶   static ɵprov = /** @pureOrBreakMyCode */ /* @__PURE__ */ ɵɵdefineInjectable({
27 │     token: ViewportScroller,
28 ▶     providedIn: 'root',
29 ▶     factory: () =>
30 ▶       typeof ngServerMode !== 'undefined' && ngServerMode
31 ▶         ? new NullViewportScroller()
32 ▶         : new BrowserViewportScroller(inject(DOCUMENT), window),
33 │   });
34 │ 
35 │   /**
36 │    * Configures the top offset used when scrolling to an anchor.
37 │    * @param offset A position in screen coordinates (a tuple with x and y values)
38 │    * or a function that returns the top offset position.
39 │    *
40 │    */
41 ▶   abstract setOffset(offset: [number, number] | (() => [number, number])): void;
```

- 26〜33 行目：`@Injectable` を付けず、`ɵprov`（DI が読む定義）を手で書いています（23〜24 行目のコメント）。28 行目で `providedIn: 'root'`、アプリに 1 つです。
- 30〜31 行目：`ngServerMode`（サーバーで描くときにビルドが `true` にする大域の値）が立っていれば `NullViewportScroller`。32 行目、そうでなければ `BrowserViewportScroller` に `DOCUMENT` と大域の `window` を渡します。
- 41 行目から：約束は `setOffset`・`getScrollPosition`・`scrollToPosition`・`scrollToAnchor`・`setHistoryScrollRestoration` の 5 つです。

📄 `angular/packages/common/src/viewport_scroller.ts` L217–236 （▶ の行: 220, 224, 229–230, 236）

```ts
217 │ /**
218 │  * Provides an empty implementation of the viewport scroller.
219 │  */
220 ▶ export class NullViewportScroller implements ViewportScroller {
221 │   /**
222 │    * Empty implementation
223 │    */
224 ▶   setOffset(offset: [number, number] | (() => [number, number])): void {}
225 │ 
226 │   /**
227 │    * Empty implementation
228 │    */
229 ▶   getScrollPosition(): [number, number] {
230 ▶     return [0, 0];
231 │   }
232 │ 
233 │   /**
234 │    * Empty implementation
235 │    */
236 ▶   scrollToPosition(position: [number, number]): void {}
```

`NullViewportScroller` は 5 つとも何もしません（229〜230 行目、位置はいつも `[0, 0]`）。`@angular/platform-server` も `ViewportScroller` に `NullViewportScroller` を provide しています（[サーバーの platform の章](../platform/03-ssr-platform-server.md)）。

## 2. BrowserViewportScroller の土台：オフセットと位置

📄 `angular/packages/common/src/viewport_scroller.ts` L73–109 （▶ の行: 74, 78, 87–89, 91, 100, 108）

```ts
 73 │ export class BrowserViewportScroller implements ViewportScroller {
 74 ▶   private offset: () => [number, number] = () => [0, 0];
 75 │ 
 76 │   constructor(
 77 │     private document: Document,
 78 ▶     private window: Window,
 79 │   ) {}
 80 │ 
 81 │   /**
 82 │    * Configures the top offset used when scrolling to an anchor.
 83 │    * @param offset A position in screen coordinates (a tuple with x and y values)
 84 │    * or a function that returns the top offset position.
 85 │    *
 86 │    */
 87 ▶   setOffset(offset: [number, number] | (() => [number, number])): void {
 88 ▶     if (Array.isArray(offset)) {
 89 ▶       this.offset = () => offset;
 90 │     } else {
 91 ▶       this.offset = offset;
 92 │     }
 93 │   }
 94 │ 
 95 │   /**
 96 │    * Retrieves the current scroll position.
 97 │    * @returns The position in screen coordinates.
 98 │    */
 99 │   getScrollPosition(): [number, number] {
100 ▶     return [this.window.scrollX, this.window.scrollY];
101 │   }
102 │ 
103 │   /**
104 │    * Sets the scroll position.
105 │    * @param position The new position in screen coordinates.
106 │    */
107 │   scrollToPosition(position: [number, number], options?: ScrollOptions): void {
108 ▶     this.window.scrollTo({...options, left: position[0], top: position[1]});
109 │   }
```

1. **74 行目：オフセットは「関数」で持つ**

   既定は `[0, 0]` を返す関数です。88〜89 行目、配列を渡されたら「その配列を返す関数」に包み、91 行目、関数ならそのまま持ちます。上に固定したヘッダーの高さが画面幅で変わるなら、関数を渡せばスクロールのたびに測り直せます。
2. **100 行目：今の位置は window.scrollX・scrollY**

   ページ全体の位置だけです。中でスクロールする `div` などの位置は扱いません。78 行目の `window` は 1 節の 32 行目で渡された大域の `window` です。
3. **108 行目：options を先に広げ、left と top を後から書く**

   `{...options, left, top}` の順なので、`options` に `top` が入っていても上書きされます。spec の it `should not allow overwriting position with options` がこれを確かめています。

## 3. scrollToAnchor：探す・スクロールする・フォーカスする

📄 `angular/packages/common/src/viewport_scroller.ts` L111–136 （▶ の行: 114–115, 122–123, 125–126, 129, 134）

```ts
111 │   /**
112 │    * Scrolls to an element and attempts to focus the element.
113 │    *
114 ▶    * Note that the function name here is misleading in that the target string may be an ID for a
115 ▶    * non-anchor element.
116 │    *
117 │    * @param target The ID of an element or name of the anchor.
118 │    *
119 │    * @see https://html.spec.whatwg.org/#the-indicated-part-of-the-document
120 │    * @see https://html.spec.whatwg.org/#scroll-to-fragid
121 │    */
122 ▶   scrollToAnchor(target: string, options?: ScrollOptions): void {
123 ▶     const elSelected = findAnchorFromDocument(this.document, target);
124 │ 
125 ▶     if (elSelected) {
126 ▶       this.scrollToElement(elSelected, options);
127 │       // After scrolling to the element, the spec dictates that we follow the focus steps for the
128 │       // target. Rather than following the robust steps, simply attempt focus.
129 ▶       // Use `preventScroll: true` to avoid extra scroll that breaks smooth scrolling.
130 │       // @see https://html.spec.whatwg.org/#get-the-focusable-area
131 │       // @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLOrForeignElement/focus
132 │       // @see https://html.spec.whatwg.org/#focusable-area
133 │       // @see https://www.yanandcoffee.com/2020/05/08/accessible-smooth-scrolling-and-focus-management-solutions/
134 ▶       elSelected.focus({preventScroll: true});
135 │     }
136 │   }
```

📄 `angular/packages/common/src/viewport_scroller.ts` L179–215 （▶ の行: 180, 182–183, 188–191, 193, 197, 199, 203–206, 210, 214）

```ts
179 │ function findAnchorFromDocument(document: Document, target: string): HTMLElement | null {
180 ▶   const documentResult = document.getElementById(target) || document.getElementsByName(target)[0];
181 │ 
182 ▶   if (documentResult) {
183 ▶     return documentResult;
184 │   }
185 │ 
186 │   // `getElementById` and `getElementsByName` won't pierce through the shadow DOM so we
187 │   // have to traverse the DOM manually and do the lookup through the shadow roots.
188 ▶   if (
189 ▶     typeof document.createTreeWalker === 'function' &&
190 ▶     document.body &&
191 ▶     typeof document.body.attachShadow === 'function'
192 │   ) {
193 ▶     const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
194 │     let currentNode = treeWalker.currentNode as HTMLElement | null;
195 │ 
196 │     while (currentNode) {
197 ▶       const shadowRoot = currentNode.shadowRoot;
198 │ 
199 ▶       if (shadowRoot) {
200 │         // Note that `ShadowRoot` doesn't support `getElementsByName`
201 │         // so we have to fall back to `querySelector`.
202 │         const result =
203 ▶           shadowRoot.getElementById(target) ||
204 ▶           shadowRoot.querySelector(`[name="${CSS.escape(target)}"]`);
205 ▶         if (result) {
206 ▶           return result;
207 │         }
208 │       }
209 │ 
210 ▶       currentNode = treeWalker.nextNode() as HTMLElement | null;
211 │     }
212 │   }
213 │ 
214 ▶   return null;
215 │ }
```

1. **180 行目：まず文書の中を id で、だめなら name で**

   `getElementById(target)` が無ければ `getElementsByName(target)[0]`。114〜115 行目のコメントのとおり、名前は `scrollToAnchor` でも、`<a>` に限らずどの要素の id でも当たります。HTML の仕様の「フラグメントが指す場所」も id → `<a name>` の順です（119〜120 行目の @see）。
2. **188〜191 行目：shadow DOM を探せる環境か**

   186〜187 行目のコメントのとおり、`getElementById` と `getElementsByName` は shadow root（`attachShadow` で作る、外から隠れた DOM の木）の中を見ません。TreeWalker と `attachShadow` がある環境だけ、自分で探します。
3. **193〜210 行目：body の下の要素を 1 つずつ、shadow root を持つものだけ中を見る**

   197 行目で `shadowRoot` があれば、203 行目で id、204 行目で `[name="…"]` のセレクタで探します（ShadowRoot に `getElementsByName` が無いので、200〜201 行目）。204 行目の `CSS.escape` は a69e56df718（2026-06-04）で入りました。前は `[name="${target}"]` にフラグメントをそのまま埋めていたので、`"` や `]` を含む名前でセレクタが壊れ、`querySelector` が例外を投げていました。
4. **210 行目：nextNode は shadow root の中へ入らない**

   TreeWalker が歩くのは `document.body` の下の普通の木（light DOM）だけです。shadow root の**中にある**別の shadow host は歩く道に出てこないので、2 段目より深い shadow root は探されず、214 行目で `null` です。これが open の issue #48542（2022 年、「入れ子の ShadowDom では anchorScrolling が効かない。1 段目だけは見つかる」）の行です。

📄 `angular/packages/common/src/viewport_scroller.ts` L160–176 （▶ の行: 167–174）

```ts
160 │   /**
161 │    * Scrolls to an element using the native offset and the specified offset set on this scroller.
162 │    *
163 │    * The offset can be used when we know that there is a floating header and scrolling naively to an
164 │    * element (ex: `scrollIntoView`) leaves the element hidden behind the floating header.
165 │    */
166 │   private scrollToElement(el: HTMLElement, options?: ScrollOptions): void {
167 ▶     const rect = el.getBoundingClientRect();
168 ▶     const left = rect.left + this.window.pageXOffset;
169 ▶     const top = rect.top + this.window.pageYOffset;
170 ▶     const offset = this.offset();
171 ▶     this.window.scrollTo({
172 ▶       ...options,
173 ▶       left: left - offset[0],
174 ▶       top: top - offset[1],
175 │     });
176 │   }
```

1. **167〜169 行目：要素の画面上の位置 + 今のスクロール量 = ページの頭からの位置**

   `getBoundingClientRect()` は今見えている画面の左上からの位置なので、`pageXOffset`・`pageYOffset`（`scrollX`・`scrollY` の別名）を足してページの頭からの位置にします。
2. **170〜175 行目：オフセットを引いて scrollTo**

   2 節の 74 行目の関数を 170 行目で**このときに**呼び、173〜174 行目で引きます。108 行目と同じく `options` を先に広げます。要素の CSS の `scroll-margin-top` は読みません。
3. **134 行目：フォーカスを移す。ただしフォーカスではスクロールさせない**

   127〜128 行目のコメントのとおり、HTML の仕様はスクロールのあとフォーカスの手順を求めるので、`focus()` を呼びます（フォーカスできない要素なら何も起きない）。`preventScroll: true` は 97cac1cf4d0（2026-04-21、fixes #65938）で入りました。前は `focus()` だけで、`html { scroll-behavior: smooth }` のとき、なめらかなスクロールの途中で `focus()` がもう 1 回スクロールを起こし、オフセットを引いた位置からずれていました。

> [!NOTE]
> **ポイント**
>
> 97cac1cf4d0 のタイトルは「prevent focus from scrollToAnchor」ですが、フォーカスは今も移ります（134 行目）。変わったのは「フォーカスのせいでスクロールしない」ことで、中身は `focus({preventScroll: true})` の 1 行です。

## 4. setHistoryScrollRestoration：ブラウザの自動の復元を止める

📄 `angular/packages/common/src/viewport_scroller.ts` L138–158 （▶ の行: 143–145, 147）

```ts
138 │   /**
139 │    * Disables automatic scroll restoration provided by the browser.
140 │    */
141 │   setHistoryScrollRestoration(scrollRestoration: 'auto' | 'manual'): void {
142 │     try {
143 ▶       this.window.history.scrollRestoration = scrollRestoration;
144 ▶     } catch {
145 ▶       console.warn(
146 │         formatRuntimeError(
147 ▶           RuntimeErrorCode.SCROLL_RESTORATION_UNSUPPORTED,
148 │           ngDevMode &&
149 │             'Failed to set `window.history.scrollRestoration`. ' +
150 │               'This may occur when:\n' +
151 │               '• The script is running inside a sandboxed iframe\n' +
152 │               '• The window is partially navigated or inactive\n' +
153 │               '• The script is executed in an untrusted or special context (e.g., test runners, browser extensions, or content previews)\n' +
154 │               'Scroll position may not be preserved across navigation.',
155 │         ),
156 │       );
157 │     }
158 │   }
```

`history.scrollRestoration` を `'manual'` にすると、戻る・進むでブラウザが自分で位置を戻すのをやめます。143 行目で書き、sandbox の iframe などで書けないときは 144〜156 行目で例外を捕まえて警告（`SCROLL_RESTORATION_UNSUPPORTED`）を出すだけにします。この try は 7600bec71d6（2025-06-22）で入りました。

## 5. 呼び手：RouterScroller

このサイトの `app.config.ts` は、ルーターに次の機能を付けています。

📄 `src/app/app.config.ts（このサイト。抜粋）`

```
provideRouter(
  routes,
  withInMemoryScrolling({
    scrollPositionRestoration: 'enabled',
    anchorScrolling: 'enabled',
  }),
),
provideClientHydration(withIncrementalHydration()),
```

`withInMemoryScrolling` が `RouterScroller` を provide し、起動の終わりに `init()` が呼ばれるまでは [ルーターのイベントの章の 6 節](../router/17-router-events.md)で読んでいます。そこで読んだのは、イベントを作る側（`NavigationStart` で位置を覚え、`NavigationEnd` で `Scroll` を予約する）です。ここでは `ViewportScroller` を呼ぶ側を読みます。

📄 `angular/packages/router/src/router_scroller.ts` L38–55 （▶ の行: 46, 48, 52）

```ts
38 │ @Injectable()
39 │ export class RouterScroller implements OnDestroy {
40 │   private routerEventsSubscription?: Unsubscribable;
41 │   private scrollEventsSubscription?: Unsubscribable;
42 │ 
43 │   private lastId = 0;
44 │   private lastSource: NavigationTrigger | undefined = IMPERATIVE_NAVIGATION;
45 │   private restoredId = 0;
46 ▶   private store: {[key: string]: [number, number]} = {};
47 │ 
48 ▶   private isHydrating = inject(IS_HYDRATION_DOM_REUSE_ENABLED, {optional: true}) ?? false;
49 │ 
50 │   private readonly urlSerializer = inject(UrlSerializer);
51 │   private readonly zone = inject(NgZone);
52 ▶   readonly viewportScroller = inject(ViewportScroller);
53 │   private readonly transitions = inject(NavigationTransitions);
54 │ 
55 │   /** @docs-private */
```

📄 `angular/packages/router/src/router_scroller.ts` L65–83 （▶ の行: 65–67, 69, 78–79）

```ts
65 ▶     if (this.isHydrating) {
66 ▶       inject(ApplicationRef)
67 ▶         .whenStable()
68 │         .then(() => {
69 ▶           this.isHydrating = false;
70 │         });
71 │     }
72 │   }
73 │ 
74 │   init(): void {
75 │     // we want to disable the automatic scrolling because having two places
76 │     // responsible for scrolling results race conditions, especially given
77 │     // that browser don't implement this behavior consistently
78 ▶     if (this.options.scrollPositionRestoration !== 'disabled') {
79 ▶       this.viewportScroller.setHistoryScrollRestoration('manual');
80 │     }
81 │     this.routerEventsSubscription = this.createScrollEvents();
82 │     this.scrollEventsSubscription = this.consumeScrollEvents();
83 │   }
```

📄 `angular/packages/router/src/router_scroller.ts` L106–126 （▶ の行: 108–109, 111–115, 119–122）

```ts
106 │   private consumeScrollEvents() {
107 │     return this.transitions.events.subscribe((e) => {
108 ▶       if (!(e instanceof Scroll) || e.scrollBehavior === 'manual') return;
109 ▶       const instantScroll: ScrollOptions = {behavior: 'instant'};
110 │       // a popstate event. The pop state event will always ignore anchor scrolling.
111 ▶       if (e.position) {
112 ▶         if (this.options.scrollPositionRestoration === 'top') {
113 ▶           this.viewportScroller.scrollToPosition([0, 0], instantScroll);
114 ▶         } else if (this.options.scrollPositionRestoration === 'enabled') {
115 ▶           this.viewportScroller.scrollToPosition(e.position, instantScroll);
116 │         }
117 │         // imperative navigation "forward"
118 │       } else {
119 ▶         if (e.anchor && this.options.anchorScrolling === 'enabled') {
120 ▶           this.viewportScroller.scrollToAnchor(e.anchor);
121 ▶         } else if (this.options.scrollPositionRestoration !== 'disabled') {
122 ▶           this.viewportScroller.scrollToPosition([0, 0]);
123 │         }
124 │       }
125 │     });
126 │   }
```

1. **78〜79 行目：'disabled' でなければ、ブラウザの自動の復元を止める**

   このサイトは `'enabled'` なので、起動のときに 4 節の 143 行目が `'manual'` を書きます。2 か所が別々に位置を戻すと競り合う、と 75〜77 行目のコメントにあります。
2. **108 行目：Scroll のイベントだけ。'manual' なら何もしない**

   `scrollBehavior` は、`router.navigate(…, {scroll: 'manual'})` のように 1 回の移動ごとに渡せる値です（`Scroll` を作る行は [ルーターのイベントの章](../router/17-router-events.md)）。
3. **111〜116 行目：位置があるのは戻る・進む（popstate）のときだけ**

   `'top'` なら 113 行目で `[0, 0]`、`'enabled'` なら 115 行目で覚えておいた位置へ。どちらも 109 行目の `{behavior: 'instant'}` を付けます（e1da41ffdfd、2025-10-06。ページを移動するブラウザの戻ると同じく、なめらかにしない）。**戻る・進むでは、アンカーがあってもアンカーへは飛びません**（110 行目のコメント）。
4. **119〜123 行目：新しい移動では、アンカーか、頭へ**

   アンカーがあり `anchorScrolling: 'enabled'` なら 120 行目で `scrollToAnchor(e.anchor)`。**options を渡さない**ので、CSS の `scroll-behavior` がそのまま効きます（3 節の 134 行目の修正が効く場面）。それ以外は、`'disabled'` でなければ 122 行目で `[0, 0]` です。
5. **48・65〜71 行目：hydration（サーバーで描いた DOM を使い回す起動）の最初の移動では、何もしない**

   48 行目で hydration が有効かを読み、66〜70 行目で、アプリが安定したら（`whenStable`）`false` に戻します。このサイトは `provideClientHydration` を使うので当てはまります。8ec0d1eee80（2026-04-12、closes #64578）で入り、サーバーで描いたページを読み込み中にユーザーがスクロールした位置を、最初の移動で `[0, 0]` に戻さなくなりました。止める行（`scheduleScrollEvent` の頭）はルーターのイベントの章で引用しています。

> [!TIP]
> **新卒エンジニアへ**
>
> `withInMemoryScrolling` の options は `scrollPositionRestoration` と `anchorScrolling` の 2 つだけで、オフセットはありません。`provideRouter` の書き方で固定ヘッダーの分を引きたいときは、自分で `inject(ViewportScroller).setOffset(…)` を呼びます。`RouterModule.forRoot` の `scrollOffset` は、router\_module.ts の `provideRouterScroller` が `setOffset` に渡します。

## 6. 開いている issue と、閉じた提案

| issue | 内容 | この章の行 | 状態（2026-11-05） |
| --- | --- | --- | --- |
| #48542（2022-12） | 入れ子の `ViewEncapsulation.ShadowDom` で anchorScrolling が効かない | 3 節の 193・210 行目（TreeWalker が shadow root の中へ入らない） | open。PR なし |
| #55383（2024-04） | `scroll-margin-top` を守らない | 3 節の 167〜175 行目（オフセットは `setOffset` の値だけ） | open。PR #70509（2026-09）は閉じた |
| #69979（2026-07） | Chrome 150 の `scrollTo` が返す Promise（スクロールの終わり）を返してほしい | 2 節の 108 行目・3 節の 171 行目（戻り値を捨てる） | open。メンバーが「次の破壊的変更の時期に」とコメント |
| #70469（2026-08） | `getOffset()` を足してほしい | 2 節の 74 行目 | not planned で閉じた |
| #64748（2025-10） | `BrowserViewportScroller` と `findAnchorFromDocument` を公開してほしい | 3 節の 179 行目 | not planned で閉じた |

#55383 の PR #70509 は、要素の `getComputedStyle` から `scroll-margin-top` を読んで引く修正でした。Andrew Scott（ルーターの担当）が閉じたときの理由は 3 つで、「`ViewportScroller` は `window.scrollTo` の座標を手で計算する古い仕組みで、CSS を一部まねても `scroll-padding`・スクロールする親・scroll snap は扱えない。これ以上の推測を足したくない」「`scroll-margin` をすでに書いているアプリの位置が変わる」「アンカーへのスクロールを今の CSS に合わせるなら、`Element.scrollIntoView()` などを使ってルーターの側で設計し直す」でした。#70469 の PR #70470 も、「抽象クラスにメソッドを足すのは破壊的変更」として閉じています。**この章の行に小さな直しを足す PR は、方針として受け入れられにくい場所**だと読めます。

> **🧪 DEMO — 本物の scrollToAnchor を、章の中の的に向ける**
>
> 「スクロール」を押すと、`ViewportScroller.ɵprov` の factory（1 節の 29〜32 行目）をこのページの injector の中で呼んで、本物の `BrowserViewportScroller`（22.1.6）をもう 1 つ作り、`setOffset([0, 入力の値])` と `scrollToAnchor(的, {behavior})` を呼びます。ルーターが使う root の `ViewportScroller` とは別のインスタンスなので、オフセットはこのデモの中だけです。ページ全体がスクロールします。URL は変えません。「元の位置に戻る」で、最初に押す前の位置へ `scrollToPosition` で戻ります。表の「期待する位置」だけは、167〜175 行目の式をこの表のために計算したもので、的を探すのも表のための移植（2 段目の shadow root の中まで探す）です。的の箱は表より上に置いています（表の行が増えても的の位置がずれず、ブラウザのスクロールの調整（scroll anchoring）が入らないように）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cmn-viewport-scroller)

- `cmn-vs-target-light`（DEMO の中の 1 つ目の箱、id）と `cmn-vs-target-name`（2 つ目、`<a name>`）は 180 行目で見つかります。`cmn-vs-target-shadow1` と `a"]),(*` は 1 段目の shadow root の中なので 203・204 行目で見つかります（後者は `CSS.escape` のおかげ）。
- `cmn-vs-target-shadow2` は 2 段目の shadow root の中です。期待する位置は出ますが、本物は 214 行目で `null` を返し、位置もフォーカスも変わりません（#48542）。
- scroll-margin-top を付けても直後の位置は同じです（#55383）。`smooth` では直後の位置は途中の値で、1 秒後に期待する位置（オフセットを引いた位置）に着きます。

## ここまでの呼び出し（このサイトで #見出し へのリンクを押したとき）

- `RouterScroller.consumeScrollEvents` の購読 — router\_scroller.ts 107 — *Scroll を受け取る*
  - `viewportScroller.scrollToAnchor(e.anchor)` — router\_scroller.ts 120
    - `findAnchorFromDocument(document, target)` — viewport\_scroller.ts 123 / 179
      - `getElementById || getElementsByName` → TreeWalker で shadow root — viewport\_scroller.ts 180 / 193
    - `scrollToElement(el, options)` — viewport\_scroller.ts 126 / 166
      - `window.scrollTo({left: x − offset[0], top: y − offset[1]})` — viewport\_scroller.ts 171
    - `el.focus({preventScroll: true})` — viewport\_scroller.ts 134

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| common/test/viewport\_scroller\_spec.ts | describe `BrowserViewportScroller`（12 行目）の中に `setHistoryScrollRestoration`（13 行目、it 3 つ）と `scrollToAnchor`（52 行目、it 9 つ） | `scrollToAnchor` は `//packages/common/test:test_web_chromium` だけで中身が走る。Node では 54〜58 行目で飛ばす |
| router/test/router\_scroller.spec.ts | describe `RouterScroller`（33 行目）の 13 件。`ViewportScroller` を `spyOn` して、呼ばれた引数を見る | `//packages/router/test:test`（Node） |

📄 `angular/packages/common/test/viewport_scroller_spec.ts` L52–74 （▶ の行: 54, 56–57, 64–65, 71–72）

```ts
52 │   describe('scrollToAnchor', () => {
53 │     // Testing scroll behavior does not make sense outside a browser
54 ▶     if (isNode) {
55 │       // Jasmine will throw if there are no tests.
56 ▶       it('should pass', () => {});
57 ▶       return;
58 │     }
59 │ 
60 │     const anchor = 'anchor';
61 │     let scroller: BrowserViewportScroller;
62 │ 
63 │     beforeEach(() => {
64 ▶       scroller = new BrowserViewportScroller(document, window);
65 ▶       scroller.scrollToPosition([0, 0]);
66 │     });
67 │ 
68 │     it('should scroll when element with matching id is found', () => {
69 │       const {anchorNode, cleanup} = createTallElement();
70 │       anchorNode.id = anchor;
71 ▶       scroller.scrollToAnchor(anchor);
72 ▶       expect(scroller.getScrollPosition()[1]).not.toEqual(0);
73 │       cleanup();
74 │     });
```

54〜57 行目：Node の jasmine では `should pass` という空の it を 1 つ置いて describe を終わります（it が 0 件だと jasmine が例外を投げるため、とコメント）。64 行目で本物の `document` と `window` を渡し、71〜72 行目で「動いたか」（`not.toEqual(0)`）だけを見ます。どこまで動いたかの数は見ていません。

📄 `angular/packages/common/test/viewport_scroller_spec.ts` L107–121 （▶ の行: 108, 110–111, 118–119）

```ts
107 │     it('should scroll when a shadow DOM anchor name contains CSS selector metacharacters', () => {
108 ▶       const trickyName = 'a"]),(*';
109 │       const {anchorNode, cleanup} = createTallElementWithShadowRoot();
110 ▶       anchorNode.name = trickyName;
111 ▶       scroller.scrollToAnchor(trickyName);
112 │       expect(scroller.getScrollPosition()[1]).not.toEqual(0);
113 │       cleanup();
114 │     });
115 │ 
116 │     it('should not throw when the anchor would form an invalid shadow DOM selector', () => {
117 │       const {cleanup} = createTallElementWithShadowRoot();
118 ▶       expect(() => scroller.scrollToAnchor('"><script>')).not.toThrow();
119 ▶       expect(scroller.getScrollPosition()[1]).toEqual(0);
120 │       cleanup();
121 │     });
```

📄 `angular/packages/common/test/viewport_scroller_spec.ts` L131–153 （▶ の行: 133, 140, 142, 146）

```ts
131 │     it('should honor the scroll offset when smooth scrolling', async () => {
132 │       // Ensure the scroll behavior is smooth for this test, as the bug only occurred with smooth scrolling.
133 ▶       document.documentElement.style.scrollBehavior = 'smooth';
134 │ 
135 │       const {anchorNode, cleanup} = createTallElement();
136 │       anchorNode.id = anchor;
137 │ 
138 │       // Padding ensures the page is tall enough that the offset-adjusted target
139 │       // is reachable and not clamped to the maximum scroll position.
140 ▶       document.body.style.paddingBottom = '5000px';
141 │       // Header offset
142 ▶       scroller.setOffset([0, 80]);
143 │ 
144 │       scroller.scrollToAnchor(anchor);
145 │ 
146 ▶       await waitFor(() => throwUnless(anchorNode.getBoundingClientRect().top).toBe(80), {
147 │         timeout: 1_000,
148 │       });
149 │ 
150 │       document.documentElement.style.scrollBehavior = '';
151 │       document.body.style.paddingBottom = '';
152 │       cleanup();
153 │     });
```

107〜121 行目が a69e56df718 で、131〜153 行目が 97cac1cf4d0 で足された it です。146 行目は、なめらかなスクロールが終わるのを `waitFor` で 1 秒まで待ち、要素の上端が画面の上から 80（142 行目のオフセット）になることを見ます。

📄 `angular/packages/router/test/router_scroller.spec.ts` L108–131 （▶ の行: 112, 117, 122, 126, 129–130）

```ts
108 │   describe('anchor scrolling', () => {
109 │     it('should work (scrollPositionRestoration is disabled)', async () => {
110 │       const {events, viewportScroller} = createRouterScroller({
111 │         scrollPositionRestoration: 'disabled',
112 ▶         anchorScrolling: 'enabled',
113 │       });
114 │       events.next(new NavigationStart(1, '/a#anchor'));
115 │       events.next(new NavigationEnd(1, '/a#anchor', '/a#anchor'));
116 │       await nextScrollEvent(events);
117 ▶       expect(viewportScroller.scrollToAnchor).toHaveBeenCalledWith('anchor');
118 │ 
119 │       events.next(new NavigationStart(2, '/a#anchor2'));
120 │       events.next(new NavigationEnd(2, '/a#anchor2', '/a#anchor2'));
121 │       await nextScrollEvent(events);
122 ▶       expect(viewportScroller.scrollToAnchor).toHaveBeenCalledWith('anchor2');
123 │       (viewportScroller.scrollToAnchor as jasmine.Spy).calls.reset();
124 │ 
125 │       // we never scroll to anchor when navigating back.
126 ▶       events.next(new NavigationStart(3, '/a#anchor', 'popstate'));
127 │       events.next(new NavigationEnd(3, '/a#anchor', '/a#anchor'));
128 │       await nextScrollEvent(events);
129 ▶       expect(viewportScroller.scrollToAnchor).not.toHaveBeenCalled();
130 ▶       expect(viewportScroller.scrollToPosition).not.toHaveBeenCalled();
131 │     });
```

126〜130 行目が 5 節の 111 行目（popstate ではアンカーへ飛ばない）の確かめです。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/common/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=BrowserViewportScroller'
pnpm bazel test //packages/common/test:test_web_chromium \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/router/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=RouterScroller'
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/cmn-logs/d-scroller-node.log・d-common-web.log・d-router-scroller-only.log）`

```
# Node
Ran 4 of 667 specs
4 specs, 0 failures
//packages/common/test:test                                              PASSED in 0.7s

# Chromium（フィルタ無し。packages/common/test/ の spec 全部）
Chromium: 1/1 test files | 676 passed, 2 failed
 ❌ DatePipe > transform > should give precedence to the passed in timezone over the default one
 ❌ Format date > formatDate > should format invalid in IE ISO date
//packages/common/test:test_web_chromium                                 FAILED in 5.5s

# router
Ran 13 of 1170 specs
13 specs, 0 failures
//packages/router/test:test                                              PASSED in 1.0s
```

- Node の 4 件 = `setHistoryScrollRestoration` の it 3 つ + Node 用の空の `should pass` 1 つです。`scrollToAnchor` の 9 つは Node では走りません。
- Chromium は web test runner で、`--test_arg=--filter` を付けずに packages/common/test/ の spec 全部（678 件）を走らせました。`scrollToAnchor` の 9 つを含む 676 件が通り、落ちた 2 件は日付の spec です。どちらも期待が 1 日ずれていて、ブラウザがこのマシンの時刻帯（JST）で日付を作ることによります（Node のターゲットでは通る）。この章の spec ではありません。
- router の `RouterScroller` は 13 件、1.0 秒でした。

### 直すとしたら

- 探し方は `findAnchorFromDocument`（179〜215 行目）、位置は `scrollToElement`（166〜176 行目）、フォーカスは `scrollToAnchor` の 134 行目です。it は describe `scrollToAnchor` に足し、**Chromium のターゲットで走らせて確かめます**（Node では 54〜58 行目で飛ばすので、足しても Node の結果は変わらない）。
- #48542 を spec の形で書くなら、`createTallElementWithShadowRoot`（同じ spec の下の方の関数）の shadow root の中に、もう 1 つ `attachShadow` した要素を置き、その中の id を `scrollToAnchor` に渡して `getScrollPosition()[1]` が 0 のまま、を見る形になります。上の DEMO の `cmn-vs-target-shadow2` と同じ形です。
- 6 節のとおり、ルーターの担当者は `ViewportScroller` にこれ以上の推測を足さない方針を書いています。本家に PR を出すことは勧めません。issue を読むときに「探す（180〜214 行目）」「位置（167〜175 行目）」「フォーカス（134 行目）」「呼び手（router\_scroller.ts 108〜123 行目）」のどこの話かを分ける手がかりにします（[第 20 回](20-cmn-issues.md)）。

## 聞かれそうな質問

**Q. 固定ヘッダーの下に見出しが隠れます。**

`setOffset([0, ヘッダーの高さ])` か、高さが変わるなら関数を渡します（87〜93 行目）。173〜174 行目で引かれます。CSS の `scroll-margin-top` は 167〜175 行目で読まないので効きません（#55383、open）。`provideRouter` では `withInMemoryScrolling` にオフセットの設定が無いので、自分で `setOffset` を呼びます。

**Q. 戻るボタンで、URL に # があるのにアンカーへ飛びません。**

router\_scroller.ts の 111〜116 行目で、popstate のときは覚えておいた位置（`e.position`）を使い、アンカーは 119 行目の else の側でしか見ないからです（110 行目のコメント）。

**Q. サーバーで描くとき、scrollToPosition はエラーになりますか？**

なりません。30〜31 行目で `ngServerMode` なら `NullViewportScroller` が入り、224〜236 行目のとおり何もしません。`getScrollPosition` は `[0, 0]` です。

**Q. scrollToAnchor に渡す名前は、&lt;a name&gt; でないとだめですか？**

どの要素の id でも当たります。180 行目で先に `getElementById`、無ければ `getElementsByName` です。shadow root の中は 203・204 行目で同じ順に探します（2 段目より深い所は探さない）。

**Q. scrollToAnchor でフォーカスは移りますか？**

移ります。134 行目の `focus({preventScroll: true})` です。ただしフォーカスできない要素（`tabindex` の無い `div` など）では何も起きません。`preventScroll` は、フォーカスでもう 1 回スクロールしないための指定です（97cac1cf4d0）。

**Q. なめらかなスクロールが終わったことを知れますか？**

今はできません。108・171 行目は `window.scrollTo` の戻り値を捨て、メソッドの戻り値も `void` です。Promise を返す API の提案が #69979 で open です。本家の web test が使う Chrome for Testing 155 で、このページを開いて `window.scrollTo(0, 0)` を評価すると、Promise が返り `{interrupted: false}` で解決しました（2026-11-05、playwright-core で確かめた）。`BrowserViewportScroller` はこの Promise を捨てています。

## 読み終えて

- `ViewportScroller` は root に 1 つ。ブラウザでは `BrowserViewportScroller`、サーバーでは何もしない `NullViewportScroller`。
- アンカーは id → name → 1 段目の shadow root の順に探す。TreeWalker は shadow root の中へ入らないので、2 段目より深い所は見つからない。
- 位置は「画面上の位置 + 今のスクロール量 − オフセット」を `window.scrollTo` に渡すだけ。`scroll-margin` は読まない。
- ルーターは popstate なら覚えた位置へ `instant` で、新しい移動ならアンカーか頭へ。hydration の最初の移動では動かさない。
- 担当者は `ViewportScroller` を古い仕組みと見ていて、小さな直しより、ルーターの側での設計し直しを考えている。

---

← 前: [テスト用の Location：SpyLocation・MockPlatformLocation・provideLocationMocks](18-cmn-location-testing.md)  
次: [issue と PR を読む：common の今](20-cmn-issues.md) →
