[目次](../README.md) › [CDK の内側](README.md) › 第 3 回 / 全 21 回

# ContentObserver と BreakpointObserver：DOM と画面幅の変化を知らせる

> ContentObserver が MutationObserver を要素ごとに 1 つにまとめ、cdkObserveContent が debounce して知らせる行。SharedResizeObserver が box の種類ごとに ResizeObserver を共有する理由。BreakpointObserver が MediaMatcher の matchMedia を組み合わせ、Breakpoints の定数（Handset など）で画面幅を判定する行と、サーバーでの扱い。

angular/components · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cdk-observers-layout)

---

「この要素の中身が変わったら知らせてほしい」「この要素の大きさが変わったら」「画面の幅がスマホの幅になったら」。CDK はこの 3 つを、ブラウザの `MutationObserver`・`ResizeObserver`・`matchMedia` の上に薄く載せた部品で提供します。この章では、`ContentObserver` が要素ごとに `MutationObserver` を 1 つにまとめる行、`cdkObserveContent` が debounce して知らせる行、`SharedResizeObserver` が box の種類ごとに `ResizeObserver` を共有する理由、`BreakpointObserver` が `MediaMatcher` の `matchMedia` を組み合わせる行と、サーバーでの扱いを読みます。

読む対象は angular/components の `src/cdk/observers/observe-content.ts`・`observers/private/shared-resize-observer.ts`・`layout/breakpoints-observer.ts`・`layout/media-matcher.ts`・`layout/breakpoints.ts` です。

1. [1. 概観](01-cdk-overview.md)
2. [2. Platform と向き](02-cdk-platform-bidi.md)
3. **3. Observer と画面幅**（この章）
4. [4. Portal](04-cdk-portal.md)
5. [5. Overlay](05-cdk.md)
6. [6. 位置の計算](06-cdk-overlay-position.md)
7. [7. スクロールと Esc](07-cdk-overlay-scroll-dispatch.md)
8. [8. FocusTrap](08-cdk-focus-trap.md)
9. [9. FocusMonitor](09-cdk-focus-monitor.md)
10. [10. ListKeyManager](10-cdk-key-manager.md)
11. [11. LiveAnnouncer](11-cdk-live-announcer.md)
12. [12. Dialog](12-cdk-dialog.md)
13. [13. Menu](13-cdk-menu.md)
14. [14. DataSource と選択](14-cdk-collections.md)
15. [15. 仮想スクロール](15-virtual-scroll.md)
16. [16. table](16-table.md)
17. [17. tree](17-cdk-tree.md)
18. [18. DragRef](18-drag-drop.md)
19. [19. DropListRef](19-cdk-drop-list.md)
20. [20. ハーネス](20-harness.md)
21. [21. Material のテーマ](21-theming.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `MutationObserver` はブラウザの API で、「指定した要素の子の追加・削除や文字の変化」を、変化が起きた後にまとめて（マイクロタスクで）コールバックに渡します。渡されるのは `MutationRecord` の配列で、1 件が「どの要素で、何が起きたか（`type` が `childList` / `characterData` / `attributes`）」の記録です。

## 1. ContentObserver：要素ごとに MutationObserver を 1 つ

📄 `components/src/cdk/observers/observe-content.ts` L98–119 （▶ の行: 98–99, 101–102, 105–106, 109–110, 114–116）

```ts
 98 ▶   observe(elementOrRef: Element | ElementRef<Element>): Observable<MutationRecord[]> {
 99 ▶     const element = coerceElement(elementOrRef);
100 │ 
101 ▶     return new Observable((observer: Observer<MutationRecord[]>) => {
102 ▶       const stream = this._observeElement(element);
103 │       const subscription = stream
104 │         .pipe(
105 ▶           map(records => records.filter(record => !shouldIgnoreRecord(record))),
106 ▶           filter(records => !!records.length),
107 │         )
108 │         .subscribe(records => {
109 ▶           this._ngZone.run(() => {
110 ▶             observer.next(records);
111 │           });
112 │         });
113 │ 
114 ▶       return () => {
115 ▶         subscription.unsubscribe();
116 ▶         this._unobserveElement(element);
117 │       };
118 │     });
119 │   }
```

`observe(element)` は、呼んだ時点では何もしない `Observable` を返します（101 行目）。誰かが subscribe した時点で 102 行目の `_observeElement` が動き、unsubscribe した時点で 114〜117 行目の後始末が動きます。99 行目の `coerceElement` は、`ElementRef` でも要素でも要素に直す coercion の関数です（[第 2 回](02-cdk-platform-bidi.md)）。

📄 `components/src/cdk/observers/observe-content.ts` L125–143 （▶ の行: 126–129, 131–134, 137, 139, 141）

```ts
125 │   private _observeElement(element: Element): Subject<MutationRecord[]> {
126 ▶     return this._ngZone.runOutsideAngular(() => {
127 ▶       if (!this._observedElements.has(element)) {
128 ▶         const stream = new Subject<MutationRecord[]>();
129 ▶         const observer = this._mutationObserverFactory.create(mutations => stream.next(mutations));
130 │         if (observer) {
131 ▶           observer.observe(element, {
132 ▶             characterData: true,
133 ▶             childList: true,
134 ▶             subtree: true,
135 │           });
136 │         }
137 ▶         this._observedElements.set(element, {observer, stream, count: 1});
138 │       } else {
139 ▶         this._observedElements.get(element)!.count++;
140 │       }
141 ▶       return this._observedElements.get(element)!.stream;
142 │     });
143 │   }
```

📄 `components/src/cdk/observers/observe-content.ts` L149–168 （▶ の行: 151–153, 163, 165–166）

```ts
149 │   private _unobserveElement(element: Element) {
150 │     if (this._observedElements.has(element)) {
151 ▶       this._observedElements.get(element)!.count--;
152 ▶       if (!this._observedElements.get(element)!.count) {
153 ▶         this._cleanupObserver(element);
154 │       }
155 │     }
156 │   }
157 │ 
158 │   /** Clean up the underlying MutationObserver for the specified element. */
159 │   private _cleanupObserver(element: Element) {
160 │     if (this._observedElements.has(element)) {
161 │       const {observer, stream} = this._observedElements.get(element)!;
162 │       if (observer) {
163 ▶         observer.disconnect();
164 │       }
165 ▶       stream.complete();
166 ▶       this._observedElements.delete(element);
167 │     }
168 │   }
```

1. **その要素が初めてなら、MutationObserver を 1 つ作る**

   127 行目で `_observedElements`（要素 → 記録の `Map`）に無ければ、128 行目で `Subject`、129 行目で `MutationObserver` を作り、131〜135 行目で要素の中身（子の追加・削除、文字の変化、子孫すべて）を見始めます。137 行目で数を 1 にして記録します。
2. **2 人目からは数を増やすだけ**

   139 行目。同じ要素をもう一度 observe しても `MutationObserver` は増えず、141 行目で同じ `Subject` を返します。
3. **最後の 1 人がやめたら片付ける**

   151 行目で数を減らし、0 になったら 153 行目の `_cleanupObserver`。163 行目で `disconnect`、165 行目で `Subject` を complete、166 行目で記録を消します。
4. **Angular の外で作る**

   126 行目の `runOutsideAngular` の中で作るので、zone.js のアプリでも `MutationObserver` のコールバックで変更検知が走りません。利用者に届ける所だけ 109 行目の `run` で Angular の中に戻します。zoneless のこのサイトでは `NgZone` が `NoopNgZone` なので、どちらも関数をそのまま呼ぶだけです（[zoneless の章](../zoneless/01-zoneless-default.md)）。

### Angular のコメントの変化は捨てる

📄 `components/src/cdk/observers/observe-content.ts` L27–52 （▶ の行: 27–30, 33, 37–40, 48）

```ts
27 ▶ // Angular may add, remove, or edit comment nodes during change detection. We don't care about
28 ▶ // these changes because they don't affect the user-preceived content, and worse it can cause
29 ▶ // infinite change detection cycles where the change detection updates a comment, triggering the
30 ▶ // MutationObserver, triggering another change detection and kicking the cycle off again.
31 │ function shouldIgnoreRecord(record: MutationRecord) {
32 │   // Ignore changes to comment text.
33 ▶   if (record.type === 'characterData' && record.target instanceof Comment) {
34 │     return true;
35 │   }
36 │   // Ignore addition / removal of comments.
37 ▶   if (record.type === 'childList') {
38 ▶     for (let i = 0; i < record.addedNodes.length; i++) {
39 ▶       if (!(record.addedNodes[i] instanceof Comment)) {
40 ▶         return false;
41 │       }
42 │     }
43 │     for (let i = 0; i < record.removedNodes.length; i++) {
44 │       if (!(record.removedNodes[i] instanceof Comment)) {
45 │         return false;
46 │       }
47 │     }
48 ▶     return true;
49 │   }
50 │   // Observe everything else.
51 │   return false;
52 │ }
```

105 行目の `filter` で使う関数です。Angular は `@if` や `<ng-container>` の目印として DOM にコメントを置き、変更検知の中でそれを足したり消したりします。27〜30 行目のコメントのとおり、それを「中身の変化」として知らせると、知らせを受けた側が画面を更新し、その更新がまたコメントを動かし…と止まらなくなることがあります。33 行目でコメントの文字の変化を、37〜48 行目で「足された / 消されたのがコメントだけ」の記録を捨てます。106 行目で、全部捨てて 0 件になったら知らせません。

## 2. cdkObserveContent：debounce を挟んで出力に流す

📄 `components/src/cdk/observers/observe-content.ts` L186–209 （▶ の行: 190, 194, 196, 201, 205–207）

```ts
186 │   /**
187 │    * Whether observing content is disabled. This option can be used
188 │    * to disconnect the underlying MutationObserver until it is needed.
189 │    */
190 ▶   @Input({alias: 'cdkObserveContentDisabled', transform: booleanAttribute})
191 │   get disabled(): boolean {
192 │     return this._disabled;
193 │   }
194 ▶   set disabled(value: boolean) {
195 │     this._disabled = value;
196 ▶     this._disabled ? this._unsubscribe() : this._subscribe();
197 │   }
198 │   private _disabled = false;
199 │ 
200 │   /** Debounce interval for emitting the changes. */
201 ▶   @Input()
202 │   get debounce(): number {
203 │     return this._debounce!;
204 │   }
205 ▶   set debounce(value: NumberInput) {
206 ▶     this._debounce = coerceNumberProperty(value);
207 ▶     this._subscribe();
208 │   }
209 │   private _debounce: number | undefined;
```

📄 `components/src/cdk/observers/observe-content.ts` L211–234 （▶ の行: 213–215, 223–225, 227–229, 233）

```ts
211 │   private _currentSubscription: Subscription | null = null;
212 │ 
213 ▶   ngAfterContentInit() {
214 ▶     if (!this._currentSubscription && !this.disabled) {
215 ▶       this._subscribe();
216 │     }
217 │   }
218 │ 
219 │   ngOnDestroy() {
220 │     this._unsubscribe();
221 │   }
222 │ 
223 ▶   private _subscribe() {
224 ▶     this._unsubscribe();
225 ▶     const stream = this._contentObserver.observe(this._elementRef);
226 │ 
227 ▶     this._currentSubscription = (
228 ▶       this.debounce ? stream.pipe(debounceTime(this.debounce)) : stream
229 ▶     ).subscribe(this.event);
230 │   }
231 │ 
232 │   private _unsubscribe() {
233 ▶     this._currentSubscription?.unsubscribe();
234 │   }
```

1. **中身ができてから見始める**

   213〜216 行目。`ngAfterContentInit`、つまり要素の中身（投影されたものを含む）が作られたあとに 223 行目の `_subscribe` を呼びます。最初の描画で中身が入るのを「変化」として知らせないためです。
2. **作り直すたびに前の購読を切る**

   224 行目で前の購読を切ってから、225 行目で `ContentObserver.observe` を購読し直します。1 節のとおり、同じ要素なら `MutationObserver` は作り直されません。
3. **debounce があれば挟む**

   228 行目。`debounce` が 0 以外なら rxjs の `debounceTime` を挟み、その時間のあいだ次の変化が来なければ最後の記録の配列だけを流します。206 行目の `coerceNumberProperty` で、`debounce="300"` の文字も数になります。
4. **出力にそのまま流す**

   229 行目の `subscribe(this.event)`。`event` は `@Output('cdkObserveContent')` の `EventEmitter` なので、テンプレートの `(cdkObserveContent)="…"` に `MutationRecord[]` が届きます。
5. **止める・再開する**

   194〜196 行目。`cdkObserveContentDisabled` を true にすると購読を切り、false に戻すと購読し直します。207 行目のとおり、`debounce` を変えても購読し直します。

> **🧪 DEMO 1 — cdkObserveContent に何回知らせが来るか**
>
> 点線の箱に本物の `cdkObserveContent` を付けています。ボタンで箱の中の DOM を変えると、届いた `MutationRecord[]` の件数と種類を下に記録します。記録の表示は箱の外にあります（箱の中に置くと、表示の更新そのものが「中身の変化」になります）。
>
> 子を足すと、要素の追加（`childList`）と、Angular がその中の文字のバインディング（`子 {{ i }}` の部分）を書く `characterData` の 2 件が記録されます。「子を 3 つ一度に足す」は 1 回の変更検知で 3 つの要素が入るので、`MutationObserver` がまとめて 1 回だけ呼ばれ、知らせも 1 回（記録は 6 件）です。ページを開いた直後にも `characterData × 2` の知らせが 1 回記録されます。箱の中の 2 つの文字のバインディングを、最初の描画で Angular が書いた記録です。「コメントだけを足す」は `<ng-container />` の目印のコメントしか DOM に入らないので、37〜48 行目で捨てられ、回数が増えません。debounce を 500ms にしてボタンを素早く何度か押すと、知らせは 1 回になり、記録は最後の 1 回分（2 件）だけです。`debounceTime` は途中の値を捨てて最後の値だけを流すからです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cdk-observers-layout)

## 3. SharedResizeObserver：box の種類ごとに 1 つを共有する

要素の大きさの変化は `ResizeObserver` で知ります。仕様の議論（コードのコメントにある WICG の issue）で「要素ごとに作るより、1 つを共有して多くの要素を見るほうが速い」とされているので、CDK は共有の仕組みを持っています。`@angular/cdk/observers/private` という、CDK と Material の中で使うための入口にあり、Material のタブのヘッダーと form-field のラベルが使っています。

📄 `components/src/cdk/observers/private/shared-resize-observer.ts` L87–102 （▶ の行: 92–95, 97, 102）

```ts
 87 │ /**
 88 │  * Allows observing resize events on multiple elements using a shared set of ResizeObserver.
 89 │  * Sharing a ResizeObserver instance is recommended for better performance (see
 90 │  * https://github.com/WICG/resize-observer/issues/59).
 91 │  *
 92 ▶  * Rather than share a single `ResizeObserver`, this class creates one `ResizeObserver` per type
 93 ▶  * of observed box ('content-box', 'border-box', and 'device-pixel-content-box'). This avoids
 94 ▶  * later calls to `observe` with a different box type from influencing the events dispatched to
 95 ▶  * earlier calls.
 96 │  */
 97 ▶ @Service()
 98 │ export class SharedResizeObserver implements OnDestroy {
 99 │   private _cleanupErrorListener: (() => void) | undefined;
100 │ 
101 │   /** Map of box type to shared resize observer. */
102 ▶   private _observers = new Map<ResizeObserverBoxOptions, SingleBoxSharedResizeObserver>();
```

📄 `components/src/cdk/observers/private/shared-resize-observer.ts` L128–140 （▶ の行: 135–137, 139）

```ts
128 │   /**
129 │    * Gets a stream of resize events for the given target element and box type.
130 │    * @param target The element to observe for resizes.
131 │    * @param options Options to pass to the `ResizeObserver`
132 │    * @return The stream of resize events for the element.
133 │    */
134 │   observe(target: Element, options?: ResizeObserverOptions): Observable<ResizeObserverEntry[]> {
135 ▶     const box = options?.box || 'content-box';
136 ▶     if (!this._observers.has(box)) {
137 ▶       this._observers.set(box, new SingleBoxSharedResizeObserver(box));
138 │     }
139 ▶     return this._observers.get(box)!.observe(target);
140 │   }
```

92〜95 行目が理由です。`ResizeObserver.observe(el, {box})` の `box`（`content-box`・`border-box`・`device-pixel-content-box`）は、**1 つの `ResizeObserver` に同じ要素を別の box で observe し直すと、後の指定で上書きされます**。全部を 1 つで共有すると、後から別の box で頼んだ人のせいで、先に頼んだ人に届く通知が変わってしまいます。そこで 135〜139 行目で box の種類ごとに `SingleBoxSharedResizeObserver` を 1 つ作り、102 行目の `Map` に置きます。

📄 `components/src/cdk/observers/private/shared-resize-observer.ts` L39–76 （▶ の行: 43–44, 54–55, 57–59, 61, 63, 66, 70）

```ts
39 │   constructor(
40 │     /** The box type to observe for resizes. */
41 │     private _box: ResizeObserverBoxOptions,
42 │   ) {
43 ▶     if (typeof ResizeObserver !== 'undefined') {
44 ▶       this._resizeObserver = new ResizeObserver(entries => this._resizeSubject.next(entries));
45 │     }
46 │   }
47 │ 
48 │   /**
49 │    * Gets a stream of resize events for the given element.
50 │    * @param target The element to observe.
51 │    * @return The stream of resize events for the element.
52 │    */
53 │   observe(target: Element): Observable<ResizeObserverEntry[]> {
54 ▶     if (!this._elementObservables.has(target)) {
55 ▶       this._elementObservables.set(
56 │         target,
57 ▶         new Observable<ResizeObserverEntry[]>(observer => {
58 ▶           const subscription = this._resizeSubject.subscribe(observer);
59 ▶           this._resizeObserver?.observe(target, {box: this._box});
60 │           return () => {
61 ▶             this._resizeObserver?.unobserve(target);
62 │             subscription.unsubscribe();
63 ▶             this._elementObservables.delete(target);
64 │           };
65 │         }).pipe(
66 ▶           filter(entries => entries.some(entry => entry.target === target)),
67 │           // Share a replay of the last event so that subsequent calls to observe the same element
68 │           // receive initial sizing info like the first one. Also enable ref counting so the
69 │           // element will be automatically unobserved when there are no more subscriptions.
70 ▶           shareReplay({bufferSize: 1, refCount: true}),
71 │           takeUntil(this._destroyed),
72 │         ),
73 │       );
74 │     }
75 │     return this._elementObservables.get(target)!;
76 │   }
```

1. **ResizeObserver は box ごとに 1 つ、通知は 1 本の Subject に**

   44 行目。この box の `ResizeObserver` の通知は、見ている要素が何であれ全部 `_resizeSubject` に流れます。43 行目で、`ResizeObserver` が無い環境（サーバー）では作りません。
2. **要素ごとに Observable を 1 つ作って取っておく**

   54〜56 行目。同じ要素なら 2 回目からは同じ Observable を返します。
3. **最初の購読で observe、最後の購読が切れたら unobserve**

   57〜64 行目の中身は購読したときに動きます。70 行目の `shareReplay({bufferSize: 1, refCount: true})` で、購読が何人いても 57 行目は 1 回、全員が切れたら 61〜63 行目の `unobserve` が動きます。直前の通知を 1 つ覚えるので、あとから購読した人もすぐ今の大きさを受け取れます。
4. **自分の要素を含む通知だけを通す**

   66 行目。共有の `Subject` には他の要素の通知も流れるので、自分の要素が入っている配列だけを通します。**配列そのものは絞らない**ので、受け取った側で `entry.target` を見て自分の分を選びます（下のデモもそうしています）。

> **🧪 DEMO 2 — 同じ要素を content-box と border-box で observe する**
>
> 下の箱の右下をドラッグすると幅が変わります（CSS の `resize`）。本物の `SharedResizeObserver` に同じ要素を 2 回、box を変えて頼んでいます。2 つは別の `ResizeObserver`（135〜139 行目）なので、互いの box を上書きしません。差は左右の padding（12px ずつ）と border（6px ずつ）の 36px です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cdk-observers-layout)

## 4. BreakpointObserver：matchMedia を組み合わせる

📄 `components/src/cdk/layout/breakpoints.ts` L10–34 （▶ の行: 11, 17–19, 23–25）

```ts
10 │ export const Breakpoints = {
11 ▶   XSmall: '(max-width: 599.98px)',
12 │   Small: '(min-width: 600px) and (max-width: 959.98px)',
13 │   Medium: '(min-width: 960px) and (max-width: 1279.98px)',
14 │   Large: '(min-width: 1280px) and (max-width: 1919.98px)',
15 │   XLarge: '(min-width: 1920px)',
16 │ 
17 ▶   Handset:
18 ▶     '(max-width: 599.98px) and (orientation: portrait), ' +
19 ▶     '(max-width: 959.98px) and (orientation: landscape)',
20 │   Tablet:
21 │     '(min-width: 600px) and (max-width: 839.98px) and (orientation: portrait), ' +
22 │     '(min-width: 960px) and (max-width: 1279.98px) and (orientation: landscape)',
23 ▶   Web:
24 ▶     '(min-width: 840px) and (orientation: portrait), ' +
25 ▶     '(min-width: 1280px) and (orientation: landscape)',
26 │ 
27 │   HandsetPortrait: '(max-width: 599.98px) and (orientation: portrait)',
28 │   TabletPortrait: '(min-width: 600px) and (max-width: 839.98px) and (orientation: portrait)',
29 │   WebPortrait: '(min-width: 840px) and (orientation: portrait)',
30 │ 
31 │   HandsetLandscape: '(max-width: 959.98px) and (orientation: landscape)',
32 │   TabletLandscape: '(min-width: 960px) and (max-width: 1279.98px) and (orientation: landscape)',
33 │   WebLandscape: '(min-width: 1280px) and (orientation: landscape)',
34 │ };
```

`Breakpoints` はメディアクエリの文字列を並べただけの定数です。11 行目の `XSmall` は 600px 未満。17〜19 行目の `Handset` は「縦向きで 600px 未満、**または**横向きで 960px 未満」で、メディアクエリの `,`（または）で 2 つをつないでいます。数値が `599.98px` なのは、`max-width: 599px` だと 599.5px のような小数の幅が漏れるからです。

📄 `components/src/cdk/layout/breakpoints-observer.ts` L63–97 （▶ の行: 63–65, 75–76, 78, 80–82, 91–92）

```ts
63 ▶   isMatched(value: string | readonly string[]): boolean {
64 ▶     const queries = splitQueries(coerceArray(value));
65 ▶     return queries.some(mediaQuery => this._registerQuery(mediaQuery).mql.matches);
66 │   }
67 │ 
68 │   /**
69 │    * Gets an observable of results for the given queries that will emit new results for any changes
70 │    * in matching of the given queries.
71 │    * @param value One or more media queries to check.
72 │    * @returns A stream of matches for the given queries.
73 │    */
74 │   observe(value: string | readonly string[]): Observable<BreakpointState> {
75 ▶     const queries = splitQueries(coerceArray(value));
76 ▶     const observables = queries.map(query => this._registerQuery(query).observable);
77 │ 
78 ▶     let stateObservable = combineLatest(observables);
79 │     // Emit the first state immediately, and then debounce the subsequent emissions.
80 ▶     stateObservable = concat(
81 ▶       stateObservable.pipe(take(1)),
82 ▶       stateObservable.pipe(skip(1), debounceTime(0)),
83 │     );
84 │     return stateObservable.pipe(
85 │       map(breakpointStates => {
86 │         const response: BreakpointState = {
87 │           matches: false,
88 │           breakpoints: {},
89 │         };
90 │         breakpointStates.forEach(({matches, query}) => {
91 ▶           response.matches = response.matches || matches;
92 ▶           response.breakpoints[query] = matches;
93 │         });
94 │         return response;
95 │       }),
96 │     );
97 │   }
```

📄 `components/src/cdk/layout/breakpoints-observer.ts` L134–143 （▶ の行: 140–142）

```ts
134 │ /**
135 │  * Split each query string into separate query strings if two queries are provided as comma
136 │  * separated.
137 │  */
138 │ function splitQueries(queries: readonly string[]): readonly string[] {
139 │   return queries
140 ▶     .map(query => query.split(','))
141 ▶     .reduce((a1, a2) => a1.concat(a2))
142 ▶     .map(query => query.trim());
143 │ }
```

1. **`,` で割る**

   75 行目の `splitQueries`（138〜143 行目）が、渡されたクエリを `,` で割って 1 本ずつにします。`Handset` を渡すと 2 本になります。
2. **1 本ごとに登録する**

   76 行目で 1 本ずつ `_registerQuery`（次の引用）から Observable をもらいます。
3. **全部の最新値を 1 つに**

   78 行目の `combineLatest` で、どれか 1 本が変われば全部の最新値の配列を流します。
4. **最初はすぐ、以後は debounceTime(0)**

   80〜83 行目。最初の値は 81 行目でそのまま流し、2 回目からは 82 行目で `debounceTime(0)` を挟みます。ウィンドウの幅を変えると複数のクエリが同時に切り替わるので、それを 1 回の通知にまとめます。
5. **結果の形**

   91 行目、`matches` は「どれか 1 本でも合えば true」。92 行目、`breakpoints` のキーは**割ったあとの 1 本ずつのクエリ文字列**です。`Breakpoints.Handset` という名前のキーにはなりません。

📄 `components/src/cdk/layout/breakpoints-observer.ts` L99–131 （▶ の行: 102–103, 106, 109, 115–116, 119, 122–123, 129）

```ts
 99 │   /** Registers a specific query to be listened for. */
100 │   private _registerQuery(query: string): Query {
101 │     // Only set up a new MediaQueryList if it is not already being listened for.
102 ▶     if (this._queries.has(query)) {
103 ▶       return this._queries.get(query)!;
104 │     }
105 │ 
106 ▶     const mql = this._mediaMatcher.matchMedia(query);
107 │ 
108 │     // Create callback for match changes and add it is as a listener.
109 ▶     const queryObservable = new Observable((observer: Observer<MediaQueryListEvent>) => {
110 │       // Listener callback methods are wrapped to be placed back in ngZone. Callbacks must be placed
111 │       // back into the zone because matchMedia is only included in Zone.js by loading the
112 │       // webapis-media-query.js file alongside the zone.js file.  Additionally, some browsers do not
113 │       // have MediaQueryList inherit from EventTarget, which causes inconsistencies in how Zone.js
114 │       // patches it.
115 ▶       const handler = (e: MediaQueryListEvent): void => this._zone.run(() => observer.next(e));
116 ▶       mql.addListener(handler);
117 │ 
118 │       return () => {
119 ▶         mql.removeListener(handler);
120 │       };
121 │     }).pipe(
122 ▶       startWith(mql),
123 ▶       map(({matches}) => ({query, matches})),
124 │       takeUntil(this._destroySubject),
125 │     );
126 │ 
127 │     // Add the MediaQueryList to the set of queries.
128 │     const output = {observable: queryObservable, mql};
129 ▶     this._queries.set(query, output);
130 │     return output;
131 │   }
```

102〜104 行目、同じクエリ文字列なら前に作ったものを返すので、アプリのあちこちで同じ `Breakpoints.Handset` を observe しても `MediaQueryList` は 1 本につき 1 つです。106 行目で `MediaMatcher.matchMedia` を呼び、109〜120 行目で、購読されたときに `addListener` で変化を待ち、切れたら `removeListener` します。122 行目の `startWith(mql)` で、購読した直後に今の `matches` を 1 回流します。だから `observe()` は購読した瞬間に今の状態を受け取れます。63〜65 行目の `isMatched` は購読せずに今の `mql.matches` を 1 回読むだけの関数です。

### MediaMatcher：ブラウザの癖とサーバー

📄 `components/src/cdk/layout/media-matcher.ts` L18–46 （▶ の行: 27–28, 31–32, 42–43, 45）

```ts
18 │ @Service()
19 │ export class MediaMatcher {
20 │   private _platform = inject(Platform);
21 │   private _nonce = inject(CSP_NONCE, {optional: true});
22 │ 
23 │   /** The internal matchMedia method to return back a MediaQueryList like object. */
24 │   private _matchMedia: (query: string) => MediaQueryList;
25 │ 
26 │   constructor() {
27 ▶     this._matchMedia =
28 ▶       this._platform.isBrowser && window.matchMedia
29 │         ? // matchMedia is bound to the window scope intentionally as it is an illegal invocation to
30 │           // call it from a different scope.
31 ▶           window.matchMedia.bind(window)
32 ▶         : noopMatchMedia;
33 │   }
34 │ 
35 │   /**
36 │    * Evaluates the given media query and returns the native MediaQueryList from which results
37 │    * can be retrieved.
38 │    * Confirms the layout engine will trigger for the selector query provided and returns the
39 │    * MediaQueryList for the query provided.
40 │    */
41 │   matchMedia(query: string): MediaQueryList {
42 ▶     if (this._platform.WEBKIT || this._platform.BLINK) {
43 ▶       createEmptyStyleRule(query, this._nonce);
44 │     }
45 ▶     return this._matchMedia(query);
46 │   }
```

📄 `components/src/cdk/layout/media-matcher.ts` L49–87 （▶ の行: 52, 54, 59, 65, 67–68, 72, 76, 79, 82）

```ts
49 │ /**
50 │  * Creates an empty stylesheet that is used to work around browser inconsistencies related to
51 │  * `matchMedia`. At the time of writing, it handles the following cases:
52 ▶  * 1. On WebKit browsers, a media query has to have at least one rule in order for `matchMedia`
53 │  * to fire. We work around it by declaring a dummy stylesheet with a `@media` declaration.
54 ▶  * 2. In some cases Blink browsers will stop firing the `matchMedia` listener if none of the rules
55 │  * inside the `@media` match existing elements on the page. We work around it by having one rule
56 │  * targeting the `body`. See https://github.com/angular/components/issues/23546.
57 │  */
58 │ function createEmptyStyleRule(query: string, nonce: string | undefined | null) {
59 ▶   if (mediaQueriesForWebkitCompatibility.has(query)) {
60 │     return;
61 │   }
62 │ 
63 │   try {
64 │     if (!mediaQueryStyleNode) {
65 ▶       mediaQueryStyleNode = document.createElement('style');
66 │ 
67 ▶       if (nonce) {
68 ▶         mediaQueryStyleNode.setAttribute('nonce', nonce);
69 │       }
70 │ 
71 │       mediaQueryStyleNode.setAttribute('type', 'text/css');
72 ▶       document.head!.appendChild(mediaQueryStyleNode);
73 │     }
74 │ 
75 │     if (mediaQueryStyleNode.sheet) {
76 ▶       mediaQueryStyleNode.sheet.insertRule(
77 │         // Drop the curly braces to avoid injection attacks. Curly braces aren't
78 │         // valid media query syntax so this should be a no-op in valid cases.
79 ▶         `@media ${query.replace(/[{}]/g, '')} {body{ }}`,
80 │         0,
81 │       );
82 ▶       mediaQueriesForWebkitCompatibility.add(query);
83 │     }
84 │   } catch (e) {
85 │     console.error(e);
86 │   }
87 │ }
```

📄 `components/src/cdk/layout/media-matcher.ts` L89–99 （▶ の行: 90, 94, 96–97）

```ts
89 │ /** No-op matchMedia replacement for non-browser platforms. */
90 ▶ function noopMatchMedia(query: string): MediaQueryList {
91 │   // Use `as any` here to avoid adding additional necessary properties for
92 │   // the noop matcher.
93 │   return {
94 ▶     matches: query === 'all' || query === '',
95 │     media: query,
96 ▶     addListener: () => {},
97 ▶     removeListener: () => {},
98 │   } as any;
99 │ }
```

1. **ブラウザなら本物、そうでなければ偽物**

   27〜32 行目。`Platform.isBrowser`（[第 2 回](02-cdk-platform-bidi.md)）が true で `window.matchMedia` があれば本物を `bind(window)` して持ち、そうでなければ 89〜99 行目の `noopMatchMedia` を使います。
2. **サーバーでは「all と空文字だけが合う」**

   94 行目。`Breakpoints.Handset` などはすべて `matches: false` になり、96〜97 行目の `addListener` は何もしないので、以後の通知もありません。
3. **WebKit / Blink では空の規則を足す**

   42〜43 行目。50〜56 行目のコメントのとおり、WebKit は `@media` の規則が 1 つも無いクエリの変化を通知せず、Blink も規則が何にも当たらないと止まることがあるので、59〜82 行目でクエリごとに `@media … {body{ }}` という中身の無い規則を 1 つの `<style>` に足します。67〜68 行目で CSP の nonce も付け、79 行目で `{``}` を取り除いて規則の差し込みを防ぎます。

> **🧪 DEMO 3 — BreakpointObserver.observe(\[Handset, Tablet, Web\])**
>
> 本物の `BreakpointObserver` に 3 つの定数を渡して購読しています（ブラウザで描画したあと）。ウィンドウの幅や端末の向きを変えると値が変わります。キーが 6 本あるのは、3 つの定数がどれも `,` で 2 本に割られるからです（138〜143 行目）。
>
> ブラウザで表示されると購読します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cdk-observers-layout)

## ここまでの呼び出し

- 👤 `<div (cdkObserveContent)="…" debounce="300">` — あなたのテンプレート
  - `CdkObserveContent.ngAfterContentInit → _subscribe` — observe-content.ts L213-229
    - `ContentObserver.observe(el)` — L98-118 — *購読で \_observeElement*
      - `new MutationObserver(…).observe(el, {childList, characterData, subtree})` — L129-135 — *要素ごとに 1 つ、数を数える*
    - `filter(!shouldIgnoreRecord) → debounceTime(300) → event.emit` — L105, L228-229
- 👤 `breakpointObserver.observe(Breakpoints.Handset)` — あなたのコード
  - `splitQueries → _registerQuery(query) × 2` — breakpoints-observer.ts L75-76
    - `MediaMatcher.matchMedia(query)` — media-matcher.ts L41-46 — *サーバーでは noopMatchMedia*
  - `combineLatest → take(1) / debounceTime(0) → BreakpointState` — L78-96

## 聞かれそうな質問

**Q. MutationObserver を自分で new するのと何が違いますか？**

違いは 3 つです。同じ要素を何か所で見ても `MutationObserver` は 1 つで、最後の購読が切れたら `disconnect` まで自動でやること（observe-content.ts 127〜139 行目、151〜166 行目）。Angular が置くコメントの変化を捨てるので、変更検知との間で知らせが止まらなくなる心配が無いこと（31〜52 行目）。`cdkObserveContent` なら `ngAfterContentInit` から見始めて、`debounce` を入力で渡せ、破棄で購読が切れること（213〜234 行目）です。反対に、`attributes` の変化は見ません（131〜135 行目の設定に無い）。属性の変化を知りたいなら自分で `MutationObserver` を使います。

**Q. サーバーで描画するとき BreakpointObserver はどうなりますか？**

エラーにはならず、すべて「合っていない」になります。`MediaMatcher` の constructor（media-matcher.ts 27〜32 行目）で `Platform.isBrowser` が false なので `noopMatchMedia` が使われ、94 行目で `'all'` と `''` 以外は `matches: false` です。`addListener` も何もしないので、それ以後の通知はありません。サーバーでは画面の幅が分からないので、サーバーの HTML は「どれにも合わない」ときの表示になり、ブラウザで起動し直してから実際の幅の表示に変わります。表示が大きく変わる所は、CSS のメディアクエリで書くほうがちらつきません。

**Q. CSS のメディアクエリではなく、JS で画面幅を判定するのはどんなときですか？**

見た目ではなく**振る舞いやテンプレートの構造**を変えたいときです。たとえば「スマホの幅ではサイドバーを overlay で開き、広い画面では常に出しておく」「狭いときは表ではなくカードの一覧を `@if` で描く」などは CSS だけでは書けません。`BreakpointObserver` は CSS と同じクエリ文字列（breakpoints.ts）を使うので、CSS 側と判定がずれません。CDK の中ではハイコントラストの検出（a11y）が、Material では autocomplete・bottom-sheet・snack-bar が使っています。

**Q. ResizeObserver の通知で、関係ない要素の entry が混ざっていました。**

`SharedResizeObserver` の仕様どおりです。shared-resize-observer.ts 66 行目の `filter` は「自分の要素を含む配列か」を見るだけで、配列の中身は絞りません。同じ box の `ResizeObserver` を共有している他の要素の entry も同じ配列に入るので、受け取った側で `entry.target === 自分の要素` で選びます。

## 読み終えて

- `ContentObserver` は要素ごとに `MutationObserver` を 1 つにまとめ、購読の数を数えて最後の 1 人で `disconnect` する。Angular のコメントの変化は捨てる。
- `cdkObserveContent` は `ngAfterContentInit` から見始め、`debounce` があれば `debounceTime` を挟んで出力に流す。
- `SharedResizeObserver` は box の種類ごとに `ResizeObserver` を 1 つ共有する。box を混ぜると上書きされるから。通知の配列は絞られない。
- `BreakpointObserver` はクエリを `,` で割って 1 本ずつ `matchMedia` し、`combineLatest` でまとめる。結果のキーは割ったあとの文字列。
- サーバーでは `MediaMatcher` が `noopMatchMedia` を使い、すべて `matches: false`。

---

← 前: [Platform と Directionality：ブラウザの判定と、右から左の向き](02-cdk-platform-bidi.md)  
次: [Portal と PortalOutlet：「何を出すか」と「どこに出すか」を分ける](04-cdk-portal.md) →
