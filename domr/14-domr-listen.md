[目次](../README.md) › [DOM レンダラーとイベントの内側](README.md) › 第 14 回 / 全 20 回

# renderer.listen：window: と document: の的、オプション、外し方

> (window:resize) と @HostListener('document:keydown') の window: をコンパイラが切って ɵɵresolveWindow などに変え、core の listeners.ts が本物の的を取って引数 3 つで renderer.listen を呼ぶまで。DefaultDomRenderer2.listen が直接呼ばれたときの 'window'・'document'・'body' の文字列を getGlobalEventTarget で直す行、ListenerOptions（passive・capture・once）が届く道、DomEventsPlugin の addEventListener と removeEventListener、返した関数をビューの破棄で呼ぶまで、false で preventDefault。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/domr-listen)

---

`(window:resize)` や `@HostListener('document:keydown')` の `window:` は、誰がどこで `window` オブジェクトに変えているのか。`Renderer2.listen` の 4 つ目の引数 `options` はテンプレートから届くのか。付けたリスナーはいつ、どの関数で外れるのか。この章では、コンパイラが名前を切るところから、`DefaultDomRenderer2.listen`、`DomEventsPlugin` の付け外しまでを行で追います。

読む対象は `platform-browser/src/dom/dom_renderer.ts` の `listen` と `decoratePreventDefault`、`browser/browser_adapter.ts` の `getGlobalEventTarget`、`dom/events/dom_events.ts`、core の `render3/view/listeners.ts`・`render3/util/misc_utils.ts`・`render/api.ts`、コンパイラの `reify.ts`・`ingest.ts` です。

1. [1. 全体像](01-domr-overview.md)
2. [2. Renderer2 の約束](02-domr-renderer-api.md)
3. [3. DomRendererFactory2](03-domr-renderer-factory.md)
4. [4. 要素とテキスト](04-domr-default-renderer.md)
5. [5. 属性とプロパティ](05-domr-attributes-properties.md)
6. [6. カプセル化](06-domr-encapsulation.md)
7. [7. SharedStylesHost](07-domr-shared-styles.md)
8. [8. CSS 変数の名前空間](08-domr-css-var-namespacing.md)
9. [9. クラスとスタイル](09-domr-styling-overview.md)
10. [10. 優先順位のリスト](10-domr-style-binding-list.md)
11. [11. 値を決めて書く](11-domr-styling-apply.md)
12. [12. \[class\] と \[style\]](12-domr-styling-maps.md)
13. [13. EventManager](13-domr-event-manager.md)
14. **14. listen**（この章）
15. [15. キーのイベント](15-domr-key-events.md)
16. [16. 自分のプラグイン](16-domr-custom-plugin.md)
17. [17. サニタイズ](17-domr-sanitization.md)
18. [18. 信頼の印](18-domr-trusted-types.md)
19. [19. Title と Meta](19-domr-title-meta.md)
20. [20. issue と PR を読む](20-domr-issues.md)

## 1. window: を切るのはコンパイラ

テンプレートの `(window:resize)` も、ホストの `'(document:click)'` も、名前は同じ関数 `parseEventListenerName` で最初の `:` の前後に切られます （`splitAtColon` と合わせて [バインディングのパーサの章](../compiler/06-compiler-binding-parser.md)で引用しています）。前が「的（target）」、後ろがイベント名です。`@HostListener` の場合は、その前にデコレータの引数が `host` の形に直されます。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/directive/src/shared.ts` L784–790 （▶ の行: 786）

```ts
784 │         }
785 │ 
786 ▶         bindings.listeners[eventName] = `${member.name}(${args.join(',')})`;
787 │       });
788 │     },
789 │   );
790 │   return bindings;
```

786 行目。`@HostListener('window:resize', ['$event'])` の付いた `onResize` は、`listeners['window:resize'] = 'onResize($event)'` という 1 行になります。ここではまだ `window:` は名前の一部です。この表がホストのバインディングとしてパーサに渡り、そこで切られます。

📄 `angular/packages/compiler/src/template/pipeline/src/ingest.ts` L261–280 （▶ の行: 262–264, 270, 274）

```ts
261 │   } else {
262 ▶     const [phase, target] =
263 ▶       event.type !== e.ParsedEventType.LegacyAnimation
264 ▶         ? [null, event.targetOrPhase]
265 │         : [event.targetOrPhase, null];
266 │ 
267 │     eventBinding = ir.createListenerOp(
268 │       job.root.xref,
269 │       new ir.SlotHandle(),
270 ▶       event.name,
271 │       null,
272 │       makeListenerHandlerOps(job.root, event.handler, event.handlerSpan),
273 │       phase,
274 ▶       target,
275 │       true,
276 │       event.sourceSpan,
277 │     );
278 │   }
279 │   job.root.create.push(eventBinding);
280 │ }
```

262〜265 行目、ふつうのイベントなら `targetOrPhase`（パーサが切った前半）が `target` になり、274 行目で listener の命令の材料（IR の op）に入ります。270 行目の `event.name` は後半の `resize` だけです。テンプレートの要素に書いた `(window:resize)` も、パーサが切った前半を要素のイベントの `target` として持ち、同じ `ir.createListenerOp` で op に入ります。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/reify.ts` L23–30 （▶ の行: 26–29）

```ts
23 │ /**
24 │  * Map of target resolvers for event listeners.
25 │  */
26 ▶ const GLOBAL_TARGET_RESOLVERS = new Map<string, o.ExternalReference>([
27 ▶   ['window', Identifiers.resolveWindow],
28 ▶   ['document', Identifiers.resolveDocument],
29 ▶   ['body', Identifiers.resolveBody],
30 │ ]);
```

最後に命令を書き出す `reify` の段で、`target` の文字列がこの表で関数の参照に変わります（使う側の行は [reify の章](../compiler/16-compiler-reify-emit.md)で引用しています）。結果の命令は `ɵɵlistener('resize', fn, ɵɵresolveWindow)` です。**表に無い文字列なら、その場でコンパイルエラー**です。このサイトの node\_modules の `@angular/compiler` 22.1.6 で JIT コンパイルしてみると、`host: {'(windw:resize)': 'f()'}` は `Unexpected global target 'windw' defined for 'resize' event. Supported list of global targets: window,document,body.` で止まりました（scratchpad/d-verify/jit-target.mjs）。

> [!NOTE]
> **ポイント**
>
> 最初の `:` で切るので、`(MDCTabBar:activated)` のように名前に `:` を含む独自のイベントは「的 `MDCTabBar` のイベント `activated`」と読まれ、上の表に無いのでコンパイルエラーになります。これが 2019 年からの open の issue #28491（Namespaced Custom Events）の中身です。

## 2. 実行時：resolver で本物の的を取り、renderer.listen へ

📄 `angular/packages/core/src/render3/util/misc_utils.ts` L11–33 （▶ の行: 15–16, 23–24, 31–32）

```ts
11 │ /**
12 │  *
13 │  * @codeGenApi
14 │  */
15 ▶ export function ɵɵresolveWindow(element: RElement & {ownerDocument: Document}): EventTarget {
16 ▶   return element.ownerDocument.defaultView!;
17 │ }
18 │ 
19 │ /**
20 │  *
21 │  * @codeGenApi
22 │  */
23 ▶ export function ɵɵresolveDocument(element: RElement & {ownerDocument: Document}): EventTarget {
24 ▶   return element.ownerDocument;
25 │ }
26 │ 
27 │ /**
28 │  *
29 │  * @codeGenApi
30 │  */
31 ▶ export function ɵɵresolveBody(element: RElement & {ownerDocument: Document}): EventTarget {
32 ▶   return element.ownerDocument.body;
33 │ }
```

3 つの resolver は、渡された要素の `ownerDocument` から辿るだけです。16 行目の `defaultView` がその文書の `window`、24 行目が文書そのもの、32 行目が `body`。グローバル変数の `window` ではなく**要素が属する文書から辿る**ので、別の文書（iframe の中など）に描いた要素なら、その文書の `window` になります。

呼んでいるのは core の `listenToDomEvent` です（関数の全体と、`ɵɵlistener` から来る道は [クリックから描画までの章](../boot/12-boot-click-to-paint.md)・[zoneless のリスナーの章](../zoneless/08-zoneless-listener-path.md)で引用しています）。ここでは的と呼び出しの行だけを見ます。

📄 `angular/packages/core/src/render3/view/listeners.ts` L168–171 （▶ の行: 169–170）

```ts
168 │   } else {
169 ▶     const native = getNativeByTNode(tNode, lView) as RElement;
170 ▶     const target = eventTargetResolver ? eventTargetResolver(native) : native;
171 │ 
```

📄 `angular/packages/core/src/render3/view/listeners.ts` L178–181 （▶ の行: 178–179, 181）

```ts
178 ▶     if (!eventTargetResolver) {
179 ▶       (wrappedListener as any).__ngNativeEl__ = native as unknown as Element;
180 │     }
181 ▶     const cleanupFn = renderer.listen(target as RElement, eventName, wrappedListener);
```

1. **169〜170 行目：resolver があれば要素を渡して的を取る**

   169 行目の `native` はリスナーを書いた要素（ホストのリスナーならホスト要素）。`(window:resize)` なら 170 行目の `target` は **`Window` オブジェクト**です。文字列 `'window'` ではありません。
2. **178〜179 行目：要素の上のリスナーにだけ印を付ける**

   `__ngNativeEl__` はイベントの再生（[event-replay の章](../platform/14-event-replay.md)）が二重に呼ばないための印で、`window`・`document`・`body` を的にしたものには付けません。
3. **181 行目：`renderer.listen(target, eventName, wrappedListener)`**

   引数は **3 つ**です。4 つ目の `options` は渡していません。テンプレートや `@HostListener` から付けたリスナーは、いつも `options` 無し（capture も passive も once も無し）です（4 節）。戻り値の `cleanupFn` が外すための関数で、5 節で使います。

### 同じ要素・同じ名前は 1 つにまとめる。ただし window: などは別

📄 `angular/packages/core/src/render3/view/listeners.ts` L149–167 （▶ の行: 150–152, 156–157, 159, 164–167）

```ts
149 │   let existingListener: any = null;
150 ▶   // Please note that the coalescing described here doesn't happen for events specifying an
151 ▶   // alternative target (ex. (document:click)) - this is to keep backward compatibility with the
152 ▶   // view engine.
153 │   // Also, we don't have to search for existing listeners if there are no directives
154 │   // matching on a given node as we can't register multiple event handlers for the same event in
155 │   // a template (this would mean having duplicate attributes).
156 ▶   if (!eventTargetResolver && isTNodeDirectiveHost) {
157 ▶     existingListener = findExistingListener(tView, lView, eventName, tNode.index);
158 │   }
159 ▶   if (existingListener !== null) {
160 │     // Attach a new listener to coalesced listeners list, maintaining the order in which
161 │     // listeners are registered. For performance reasons, we keep a reference to the last
162 │     // listener in that list (in `__ngLastListenerFn__` field), so we can avoid going through
163 │     // the entire set each time we need to add a new listener.
164 ▶     const lastListenerFn = existingListener.__ngLastListenerFn__ || existingListener;
165 ▶     lastListenerFn.__ngNextListenerFn__ = originalListener;
166 ▶     existingListener.__ngLastListenerFn__ = originalListener;
167 ▶     hasCoalesced = true;
```

1 つの要素に、テンプレートの `(click)` と、ディレクティブのホストの `(click)` が両方あると、156〜157 行目で先に登録したリスナーを探し、見つかれば 164〜166 行目でそのリスナーの後ろに数珠つなぎにして（`__ngNextListenerFn__`）、`renderer.listen` を呼びません。DOM のリスナーは 1 つのままです。150〜152 行目のコメントと 156 行目の `!eventTargetResolver` のとおり、**`(document:click)` のような的の付いたものはまとめず、毎回 `renderer.listen` を呼びます**。

## 3. DefaultDomRenderer2.listen：文字列の的と、EventManager への受け渡し

`listen` の全体は [クリックから描画までの章](../boot/12-boot-click-to-paint.md)で引用しています。ここでは文字列の的を直す行と、渡す行だけを見ます。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L486–492 （▶ の行: 486–490, 492）

```ts
486 ▶     if (typeof target === 'string') {
487 ▶       target = getDOM().getGlobalEventTarget(this.doc, target);
488 ▶       if (!target) {
489 ▶         throw new RuntimeError(
490 ▶           RuntimeErrorCode.UNSUPPORTED_EVENT_TARGET,
491 │           (typeof ngDevMode === 'undefined' || ngDevMode) &&
492 ▶             `Unsupported event target ${target} for event ${event}`,
```

📄 `angular/packages/platform-browser/src/browser/browser_adapter.ts` L59–71 （▶ の行: 59, 61–62, 64–65, 67–68, 70）

```ts
59 ▶   /** @deprecated No longer being used in Ivy code. To be removed in version 14. */
60 │   override getGlobalEventTarget(doc: Document, target: string): EventTarget | null {
61 ▶     if (target === 'window') {
62 ▶       return window;
63 │     }
64 ▶     if (target === 'document') {
65 ▶       return doc;
66 │     }
67 ▶     if (target === 'body') {
68 ▶       return doc.body;
69 │     }
70 ▶     return null;
71 │   }
```

1. **486 行目：的が文字列のときだけ**

   2 節で見たとおり、テンプレートから来る的はもう `Window` などのオブジェクトなので、ここは通りません。通るのは**あなたが `renderer.listen('window', …)` と文字列で直接呼んだとき**です。
2. **487 行目 → browser\_adapter.ts の 60〜71 行目：3 つの文字列だけを本物にする**

   `'window'` はグローバルの `window`（62 行目）、`'document'` は renderer が持つ `doc`（65 行目）、`'body'` は `doc.body`（68 行目）。ほかは `null`（70 行目）。59 行目のコメントは「Ivy では使っていない、v14 で消す」ですが、487 行目が今も呼んでいます。コメントの方が古いままです。
3. **488〜492 行目：`null` なら NG05102**

   490 行目の `UNSUPPORTED_EVENT_TARGET` は `-5102`。ただし 492 行目の文の `${target}` は、487 行目で**上書きした後の**`target`（つまり `null`）です。`renderer.listen('global', 'click', fn)` の開発モードの文は「Unsupported event target null for event click」になり、渡した `'global'` が出ません（DEMO 2 で確かめられます）。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L503–508 （▶ の行: 503–508）

```ts
503 ▶     return this.eventManager.addEventListener(
504 ▶       target,
505 ▶       event,
506 ▶       wrappedCallback,
507 ▶       options,
508 ▶     ) as VoidFunction;
```

503〜508 行目。的・名前・包んだ関数・`options` を、そのまま `EventManager.addEventListener` に渡し、返ってきた関数を返します。包む関数（`decoratePreventDefault`）は 6 節で、名前でプラグインを選ぶところは [第 13 回](13-domr-event-manager.md)で読みました。

## 4. ListenerOptions：届くのは直接呼んだときだけ

📄 `angular/packages/core/src/render/api.ts` L277–285 （▶ の行: 281–284）

```ts
277 │ /**
278 │  * Options that can be used to configure an event listener.
279 │  * @publicApi
280 │  */
281 ▶ export interface ListenerOptions {
282 ▶   capture?: boolean;
283 ▶   once?: boolean;
284 ▶   passive?: boolean;
285 │ }
```

282〜284 行目、`capture`・`once`・`passive` の 3 つだけです。DOM の `addEventListener` の第 3 引数（オプションの辞書）と同じ名前で、`DefaultDomRenderer2.listen` → `EventManager.addEventListener` → プラグインの `addEventListener` と、手を加えずに渡されます（`signal` は型に入っていません）。

渡すのは 2 節の 181 行目ではありません。**テンプレートの構文に options を書く場所は無く、core は 3 つの引数で呼ぶ**ので、この型が役に立つのは `inject(Renderer2).listen(el, 'touchstart', fn, { passive: true })` のように自分で呼んだときです。この 4 つ目の引数は d010e11b735（PR #59092、2024-12、最初のタグは 19.1.0-next.3）で入りました。テンプレートで passive や capture を書きたいという issue #8866（2016 年）・#11200（2016 年）は今も open です。

## 5. 外し方：返した関数と、ビューの破棄

`DomEventsPlugin.addEventListener` は `element.addEventListener(eventName, handler, options)` をして、`() => this.removeEventListener(element, eventName, handler, options)` を返します（2 行は [zoneless のリスナーの章](../zoneless/08-zoneless-listener-path.md)で引用しています）。

📄 `angular/packages/platform-browser/src/dom/events/dom_events.ts` L35–42 （▶ の行: 35, 41）

```ts
35 ▶   removeEventListener(
36 │     target: any,
37 │     eventName: string,
38 │     callback: Function,
39 │     options?: ListenerOptions,
40 │   ): void {
41 ▶     return target.removeEventListener(eventName, callback as EventListener, options);
42 │   }
```

41 行目で、付けたときと**同じ `options`** を `removeEventListener` に渡します。DOM は capture の値が違うリスナーを別物として扱うので、`{ capture: true }` で付けたものは `{ capture: true }` で外さないと外れません。返す関数がその組を覚えているので、呼ぶ側は何も覚えなくてよいのです。

core 側では、2 節の 181 行目で受け取った `cleanupFn` を `storeListenerCleanup` が `LView[CLEANUP]` に積み、ビューを壊すときに `processCleanups` が呼びます。積み方と呼ぶ順は [ビューの破棄の章](../ivy/17-ivy-destroy.md)の 6 節で、図つきで読んでいます。名前が `animation`・`transition` で始まるものだけは積まない（要素と一緒に捨てられる）ことも、そこで引用しています。

> [!WARNING]
> **ハマりどころ**
>
> `(window:resize)` も同じように積まれるので、コンポーネントを壊せば `window` から外れます。逆に、あなたが `renderer.listen` を直接呼んだときは core は何も積みません。返ってきた関数を自分で持っておき、`DestroyRef.onDestroy` などで呼ばないと、`window` にリスナーが残り続けます。

## 6. false を返すと preventDefault

3 節の `listen` が渡す前に包む `decoratePreventDefault` の中身の後半です（前半の `'__ngUnwrap__'` は [DebugElement の章](../testing/08-testing-debug-element.md)の `triggerEventHandler` が使う印）。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L529–538 （▶ の行: 529–533, 536）

```ts
529 ▶         typeof ngServerMode !== 'undefined' && ngServerMode
530 ▶           ? this.ngZone.runGuarded(() => eventHandler(event))
531 ▶           : eventHandler(event);
532 ▶       if (allowDefaultBehavior === false) {
533 ▶         event.preventDefault();
534 │       }
535 │ 
536 ▶       return undefined;
537 │     };
538 │   }
```

531 行目でリスナー（core の `wrapListener` が包んだもの）を呼び、532 行目で戻り値が**ちょうど `false`** のときだけ 533 行目で `preventDefault()`。`undefined` や `0` では呼びません。529〜530 行目はサーバー（`ngServerMode`）のときだけ `runGuarded` で包む分かれです。536 行目で DOM には常に `undefined` を返します。

`wrapListener` が何を返すかは [クリックから描画までの章](../boot/12-boot-click-to-paint.md)で引用した `executeListenerWithErrorHandling` で決まります。リスナーが `false` を返したときと、**リスナーが例外を投げたとき**に `false` になります。だから `<a href>` の `(click)` の中で例外が出ると、リンクの移動も止まります。

> **🧪 DEMO 1 — 本物のコンポーネントの listen を記録して、destroy で外れるのを見る**
>
> 章の中で定義した本物のコンポーネント `domr-listen-target`（テンプレートに `(click)`、`host` に `(window:resize)`・`(document:domr-listen-ping)`・`(document:keydown.escape)`）を、共通部品 `domr-probe.ts` の記録係で包んだ**このサイトの本物の `DomRendererFactory2`** で描きます。表は記録のうち `listen` の行だけです。「イベントを送る」は `window` に `resize`、`document` に `domr-listen-ping` を `dispatchEvent` します。描いている間に Esc を押すと escape の数が増えます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-listen)

第 1 引数は `[object Window]`（記録係はノードでないものを文字にするだけ）と `#document` で、文字列の `'window'` ではありません（2 節の 170 行目）。引数の数はどれも 3 です（181 行目）。`keydown.escape` も名前のまま renderer に届いていて、ここから `KeyEventsPlugin` に回ります（[第 15 回](15-domr-key-events.md)）。ホストのリスナーと `(click)` で renderer の番号が違うのは、ホストのリスナーはホスト要素を持つ側（ここではルートのビュー）の renderer で付けるからです。destroy の記録に `removeEventListener` に当たる行が出ないのは、外す関数がプラグインの返したクロージャで、renderer を通らないからです。外れたことは、そのあと「イベントを送る」を押しても数が増えないことで確かめます。

> **🧪 DEMO 2 — renderer.listen を直接呼ぶ**
>
> このサイトの本物の `RendererFactory2` から `createRenderer(null, null)`（型が無いので既定の `DefaultDomRenderer2`）を取り、`listen` を 3 通りに呼びます。`once` の確かめには下のボタンに付けて `click()` を 2 回呼びます（終わったら外します）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-listen)

1 つ目は 487 行目で `'window'` が `window` に変わり、返った関数で外れたので 1 回。2 つ目は `{ once: true }` が DOM まで届いたので 1 回。3 つ目は 489 行目の NG05102 で、開発ビルドでは文の中の的が `null` になっているのが見えます。

## 7. ここまでを 1 本に

- 👤 `@HostListener('window:resize') onResize()` — あなたのコード
  - `bindings.listeners['window:resize'] = 'onResize()'` — compiler-cli …/directive/src/shared.ts L786
  - `parseEventListenerName` → `target: 'window', eventName: 'resize'` — compiler/src/template\_parser/binding\_parser.ts — *最初の : で切る*
  - `GLOBAL_TARGET_RESOLVERS.get('window')` → `ɵɵlistener('resize', fn, ɵɵresolveWindow)` — …/phases/reify.ts L26-29
- `listenToDomEvent(…)` — core/src/render3/view/listeners.ts
  - `target = ɵɵresolveWindow(native)` → `ownerDocument.defaultView` — listeners.ts L170 / misc\_utils.ts L16
  - `renderer.listen(target, 'resize', wrappedListener)` — listeners.ts L181 — *引数 3 つ。options 無し*
    - `DefaultDomRenderer2.listen` — platform-browser/src/dom/dom\_renderer.ts — *的が文字列なら L487 で getGlobalEventTarget*
      - `eventManager.addEventListener(target, event, wrappedCallback, options)` — dom\_renderer.ts L503-508
        - `DomEventsPlugin.addEventListener` → `window.addEventListener('resize', …)` — dom/events/dom\_events.ts — *外す関数を返す*
  - `storeListenerCleanup(…, cleanupFn)` → 破棄のとき `processCleanups` が呼ぶ — ivy-destroy の章

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| core/test/acceptance/listener\_spec.ts | describe `event listeners`（30 行目、it 25 個）。`prevent default`（277）、`coalescing`（323）、`destroy`（622、it 3 つ）、`host listeners`（736。`should support global host listeners on components` は 765）、`global host listeners on special element as directive hosts`（860） | `//packages/core/test/acceptance:acceptance`（Node） |

📄 `angular/packages/core/test/acceptance/listener_spec.ts` L622–654 （▶ の行: 626, 646–647, 649–650, 652–653）

```ts
622 │   describe('destroy', () => {
623 │     it('should destroy listeners when view is removed', () => {
624 │       @Component({
625 │         selector: 'my-comp',
626 ▶         template: ` <button *ngIf="visible" (click)="count()">Click me!</button> `,
627 │         standalone: false,
628 │ 
629 │         changeDetection: ChangeDetectionStrategy.Eager,
630 │       })
631 │       class MyComp {
632 │         visible = true;
633 │         counter = 0;
634 │         count() {
635 │           this.counter++;
636 │         }
637 │       }
638 │ 
639 │       TestBed.configureTestingModule({declarations: [MyComp]});
640 │       const fixture = TestBed.createComponent(MyComp);
641 │       fixture.detectChanges();
642 │ 
643 │       const comp = fixture.componentInstance;
644 │ 
645 │       const button = fixture.nativeElement.querySelector('button');
646 ▶       button.click();
647 ▶       expect(comp.counter).toBe(1);
648 │ 
649 ▶       comp.visible = false;
650 ▶       fixture.detectChanges();
651 │ 
652 ▶       button.click();
653 ▶       expect(comp.counter).toBe(1);
654 │     });
```

649〜650 行目で `*ngIf` を消してビューを壊し、652〜653 行目で同じボタンを押しても数が増えないことで「外れた」を確かめます。DEMO 1 と同じ確かめ方です。

📄 `angular/packages/core/test/acceptance/listener_spec.ts` L765–791 （▶ の行: 775, 786–787）

```ts
765 │     it('should support global host listeners on components', () => {
766 │       const events: string[] = [];
767 │ 
768 │       @Component({
769 │         template: ``,
770 │         standalone: false,
771 │ 
772 │         changeDetection: ChangeDetectionStrategy.Eager,
773 │       })
774 │       class MyComp {
775 ▶         @HostListener('document:click')
776 │         onClick() {
777 │           events.push('global click!');
778 │         }
779 │       }
780 │ 
781 │       const fixture = TestBed.createComponent(MyComp);
782 │       fixture.detectChanges();
783 │ 
784 │       const host = fixture.nativeElement;
785 │ 
786 ▶       host.click();
787 ▶       expect(events).toEqual(['global click!']);
788 │ 
789 │       host.click();
790 │       expect(events).toEqual(['global click!', 'global click!']);
791 │     });
```

775 行目の `document:click` を、786 行目のホスト要素の `click()`（document まで泡立つ）で鳴らしています。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance \
  --nocache_test_results --test_output=all '--test_arg=--filter=^event listeners'
```

📄 `出力（2026-11-04 に実行。抜粋。ログは scratchpad/domr-logs/d-listener.log）`

```
Ran 25 of 2693 specs
25 specs, 0 failures
Finished in 0.13 seconds
//packages/core/test/acceptance:acceptance                               PASSED in 1.4s
```

- 25 件 = listener\_spec.ts の it の全部（`grep -c` で 25）。`^event listeners` で始まる名前の it はこのファイルだけでした。

### 直すとしたら

- 3 節の NG05102 の文で、渡した文字列が `null` になる件は、`DefaultDomRenderer2.listen` の 487 行目で上書きする前の値を文に使えば直ります。手元の木（8576f161ae4）でも、2026-11-04 の main でも同じ行のままでした（main では 1 行ずれて 493 行目）。gh で「Unsupported event target」を探すと、同じ件の issue は見つかりませんでした。確かめる it は、DOM のある `platform-browser/test/dom/dom_renderer_spec.ts`（ブラウザのターゲット）に「`listen('global', …)` が投げる文に `global` が入る」の形で足します。
- NG05102 の説明のページ（`adev/src/content/reference/errors/NG05102.md`、2026-06 に足された）は、`@HostListener('windw:resize')` の打ち間違いでこのエラーが出ると書いています。1 節のとおり、その打ち間違いは `reify` の段のコンパイルエラーで止まり、実行時の NG05102 には届きません（JIT で確かめた結果は 1 節）。2026-11-04 の main でも同じ文です。
- 新しい的（`root:`）を足す提案 issue #70150（2026-08、open）には PR #70167 が出ましたが、メンテナーが「まだこの機能への意見を集めている」と返して 2026-08-12 に閉じています。PR が触っていたのは `reify.ts` の表（1 節の 26〜30 行目）と `misc_utils.ts`（2 節）と listener\_spec で、この章で読んだ場所そのものです。
- 本家に PR を出すことは勧めません。issue の「リスナーが外れない」「window に付かない」を読むときに、181 行目（core が積む）と、直接呼んだ `listen`（誰も積まない）のどちらの話かを見分ける手がかりにします（[第 20 回](20-domr-issues.md)）。

## 聞かれそうな質問

**Q. (window:resize) のとき、renderer.listen には 'window' という文字列が渡りますか？**

渡りません。コンパイラが reify.ts の 27 行目で `ɵɵresolveWindow` に変え、core の listeners.ts 170 行目でそれを呼んで、`Window` オブジェクトを第 1 引数にします（DEMO 1）。文字列が渡るのは、自分で `renderer.listen('window', …)` と呼んだときだけで、そのときは dom\_renderer.ts の 487 行目が直します。

**Q. テンプレートで passive: true のリスナーは書けますか？**

書けません。core は listeners.ts 181 行目で引数 3 つの `renderer.listen` を呼び、`options` を渡しません。`ListenerOptions`（api.ts 281〜285 行目）が届くのは `Renderer2.listen` を自分で呼んだときです。独自のプラグインで名前から options を決める手もあります（[第 16 回](16-domr-custom-plugin.md)）。

**Q. (document:keydown) のリスナーは、コンポーネントを消すと外れますか？**

外れます。181 行目で受け取った外す関数を core が `LView[CLEANUP]` に積み、ビューの破棄で呼びます（[ivy-destroy](../ivy/17-ivy-destroy.md)）。listener\_spec の 622〜654 行目と DEMO 1 で、壊したあとに鳴らしても呼ばれないことを確かめられます。

**Q. 同じボタンに 2 つのディレクティブが (click) を付けたら、addEventListener は 2 回ですか？**

1 回です。listeners.ts の 156〜157 行目で既存のリスナーを見つけ、164〜166 行目で後ろにつなぐので、`renderer.listen` は最初の 1 回だけです。ただし `(document:click)` のような的の付いたものは 156 行目の条件でまとめないので、付けた数だけ `document` にリスナーが付きます。

**Q. リスナーから false を返すと何が起きますか？**

dom\_renderer.ts の 532〜533 行目で `event.preventDefault()` が呼ばれます。ちょうど `false` のときだけで、`undefined` では呼ばれません。リスナーが例外を投げたときも core の包みが `false` を返すので、同じく呼ばれます。

## 読み終えて

- `window:`・`document:`・`body:` はコンパイラが切り、reify.ts 26〜30 行目の表で resolver の関数に変える。表に無ければコンパイルエラー。
- 実行時は resolver が要素の `ownerDocument` から本物の的を取り、listeners.ts 181 行目で引数 3 つの `renderer.listen`。
- 文字列の的と `ListenerOptions` が意味を持つのは、`Renderer2.listen` を自分で呼んだときだけ。
- 外すのは `DomEventsPlugin` が返す関数（同じ options で `removeEventListener`）。core はそれを積んでおき、ビューの破棄で呼ぶ。
- リスナーが `false` を返すか例外を投げると `preventDefault()`。

---

← 前: [EventManager とプラグイン：イベント名で振り分ける](13-domr-event-manager.md)  
次: [keydown.enter と keydown.shift.a：KeyEventsPlugin](15-domr-key-events.md) →
