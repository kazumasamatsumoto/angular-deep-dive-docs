[目次](../README.md) › [DOM レンダラーとイベントの内側](README.md) › 第 16 回 / 全 20 回

# 自分のプラグインを足す：EVENT\_MANAGER\_PLUGINS

> multi: true の EVENT\_MANAGER\_PLUGINS に自分の EventManagerPlugin を足すと、supports が先に聞かれる順番、addEventListener で返す関数、NgZone の外でリスナーを付けたいときの manager.getZone()。Hammer の統合が 2026 年 3 月に消えた（f99e7ed20f0）あとの、長押しのような独自のイベントの作り方。ページの上で本物の EventManager に独自のプラグインを入れて動かすデモ。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/domr-custom-plugin)

---

`EVENT_MANAGER_PLUGINS` は公開の API で、自分のプラグインを足すと、テンプレートに `(longpress)` のような DOM に無いイベント名を書けるようになります。この章では、足したプラグインがなぜ既定のものより先に聞かれるのか、`supports` と `addEventListener` に何を書けばよいか、`manager.getZone()` をいつ使うかを、第 13〜15 回で読んだ行と、2026 年 3 月に消えた Hammer の統合（f99e7ed20f0）のコードで確かめ、ページの上で長押しのプラグインを本物の `EventManager` に入れて動かします。

読む対象は `packages/platform-browser/src/dom/events/event_manager.ts` の `getZone`、テンプレートのイベントの guide（`adev/src/content/guide/templates/event-listeners.md`）の例、spec の `event_manager_spec.ts` と `core/test/acceptance/hmr_spec.ts` の自作プラグインです。

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
14. [14. listen](14-domr-listen.md)
15. [15. キーのイベント](15-domr-key-events.md)
16. **16. 自分のプラグイン**（この章）
17. [17. サニタイズ](17-domr-sanitization.md)
18. [18. 信頼の印](18-domr-trusted-types.md)
19. [19. Title と Meta](19-domr-title-meta.md)
20. [20. issue と PR を読む](20-domr-issues.md)

## 1. 足し方と、先に聞かれる理由

📄 `あなたのアプリ（例）`

```
// app.config.ts（あなたのアプリ）
providers: [
  { provide: EVENT_MANAGER_PLUGINS, useClass: LongPressPlugin, multi: true },
]

// テンプレート
<button (longpress.600)="openMenu($event)">…</button>
```

1. **配列の後ろに並ぶ**

   あなたの `providers` は `BROWSER_MODULE_PROVIDERS` の後ろに並ぶので（[zoneless の既定の章](../zoneless/01-zoneless-default.md)の 1 節）、`inject(EVENT_MANAGER_PLUGINS)` は `[DomEventsPlugin, KeyEventsPlugin, LongPressPlugin]` になります（multi の配列の作られ方は [multi providers の章](../di/09-di-multi-providers.md)）。
2. **EventManager が逆にする**

   [第 13 回](13-domr-event-manager.md)で読んだコンストラクタが、`DomEventsPlugin` 以外を逆順にし、`DomEventsPlugin` を最後に置きます。聞く順は `[LongPressPlugin, KeyEventsPlugin, DomEventsPlugin]`。**あなたのプラグインが一番先に `supports` を聞かれます**。
3. **だから supports は狭く書く**

   先頭にいるということは、アプリの**全部のイベント名**がまずあなたの `supports` を通るということです（名前ごとに 1 回。答えは第 13 回の `_eventNameToPlugin` に覚えられる）。`true` を返した名前は、`KeyEventsPlugin` にも `DomEventsPlugin` にも行きません。`(click)` を取ってしまわないよう、自分の名前だけに `true` を返します。

> [!WARNING]
> **ハマりどころ**
>
> プラグインは root の `providers`（`bootstrapApplication` の `appConfig`）に書きます。renderer が使う `EventManager` は root に 1 つだけで、作られるときに root の `EVENT_MANAGER_PLUGINS` を受け取ります。ルートやコンポーネントの `providers` に書いた `EVENT_MANAGER_PLUGINS` は、その `EventManager` には届きません。

## 2. 公式の例を読む：DebounceEventPlugin

guide の「Extend event handling」の節にある例です（手元の木 8576f161ae4 の版）。

📄 `angular/adev/src/content/guide/templates/event-listeners.md` L146–185 （▶ の行: 151, 153, 157–158, 162, 165, 169, 171, 173, 176, 179–181）

````md
146 │ ```ts
147 │ import {Injectable} from '@angular/core';
148 │ import {EventManagerPlugin} from '@angular/platform-browser';
149 │ 
150 │ @Injectable()
151 ▶ export class DebounceEventPlugin extends EventManagerPlugin {
152 │   constructor() {
153 ▶     super(document);
154 │   }
155 │ 
156 │   // Define which events this plugin supports
157 ▶   override supports(eventName: string) {
158 ▶     return /debounce/.test(eventName);
159 │   }
160 │ 
161 │   // Handle the event registration
162 ▶   override addEventListener(element: HTMLElement, eventName: string, handler: Function) {
163 │     // Parse the event: e.g., "click.debounce.500"
164 │     // event: "click", delay: 500
165 ▶     const [event, method, delay = 300] = eventName.split('.');
166 │ 
167 │     let timeoutId: number;
168 │ 
169 ▶     const listener = (event: Event) => {
170 │       clearTimeout(timeoutId);
171 ▶       timeoutId = setTimeout(() => {
172 │         handler(event);
173 ▶       }, delay);
174 │     };
175 │ 
176 ▶     element.addEventListener(event, listener);
177 │ 
178 │     // Return cleanup function
179 ▶     return () => {
180 ▶       clearTimeout(timeoutId);
181 ▶       element.removeEventListener(event, listener);
182 │     };
183 │   }
184 │ }
185 │ ```
````

1. **151〜154 行目：`EventManagerPlugin` を継ぎ、`super(document)`**

   第 13 回で見たとおり、この引数は使われていません。`@Injectable()`（150 行目）は `useClass` で DI に作らせるためです。
2. **157〜159 行目：`supports` は名前に `debounce` を含むか**

   正規表現に `^` も区切りも無いので、`input.debounce.500` だけでなく、名前のどこかに `debounce` を含む全部を取ります。1 節のとおりこのプラグインが先頭なので、狭く書くなら `/^[a-z]+\.debounce(\.\d+)?$/` のようにします。
3. **165 行目：名前を自分で割る**

   `input.debounce.500` → DOM のイベント名 `input` と待ち時間。名前の中に設定を書く形は `KeyEventsPlugin`（[第 15 回](15-domr-key-events.md)）と同じ考え方です。
4. **169〜176 行目：DOM には `input` を付け、時間が経ってから `handler`**

   `handler` は renderer と core が包んだ関数なので、呼べば変更検知の通知も `false` の `preventDefault` も付いてきます（[第 14 回](14-domr-listen.md)）。
5. **179〜182 行目：外す関数を返す**

   待っているタイマーも止めてから `removeEventListener`。ビューを壊したときに core がこの関数を呼びます。返し忘れると、壊したあとも DOM にリスナーとタイマーが残ります。

> [!NOTE]
> **ポイント**
>
> この例は手元の版のままだと型検査を通りません。165 行目の `delay = 300` は文字列の配列の分割代入に数の既定値で、173 行目で `setTimeout` に文字列を渡しています。169 行目の引数 `event` も 165 行目の `event` を隠しています。main では 3ad3afa3c1c（2026-10-05、docs: fix code examples that fail to compile or run in the guides）で `delay = '300'`・`Number(delay)`・引数名 `e` に直っています。

📄 `angular/adev/src/content/guide/templates/event-listeners.md` L189–204 （▶ の行: 198–200）

````md
189 │ ```ts
190 │ import {bootstrapApplication} from '@angular/platform-browser';
191 │ import {EVENT_MANAGER_PLUGINS} from '@angular/platform-browser';
192 │ import {App} from './app';
193 │ import {DebounceEventPlugin} from './debounce-event-plugin';
194 │ 
195 │ bootstrapApplication(App, {
196 │   providers: [
197 │     {
198 ▶       provide: EVENT_MANAGER_PLUGINS,
199 ▶       useClass: DebounceEventPlugin,
200 ▶       multi: true,
201 │     },
202 │   ],
203 │ });
204 │ ```
````

198〜200 行目が 1 節の形です。

## 3. getZone：zone の外で付けて、中で呼ぶ

📄 `angular/packages/platform-browser/src/dom/events/event_manager.ts` L87–92 （▶ の行: 90–91）

```ts
87 │   /**
88 │    * Retrieves the compilation zone in which event listeners are registered.
89 │    */
90 ▶   getZone(): NgZone {
91 ▶     return this._zone;
92 │   }
```

90〜92 行目、`getZone()` は `EventManager` のコンストラクタが受け取った `NgZone` を返すだけです。プラグインは第 13 回で見た、コンストラクタが入れてくれる `this.manager` から呼びます。使い方の形は決まっていて、`KeyEventsPlugin` の `addEventListener` と `eventCallback`（[第 15 回](15-domr-key-events.md)の 4 節）と、消えた Hammer のプラグインが同じ形でした。

📄 `packages/platform-browser/src/dom/events/hammer_gestures.ts（f99e7ed20f0 で削除。f99e7ed20f0^ の版の 273〜289 行目）`

```
    return zone.runOutsideAngular(() => {
      // Creating the manager bind events, must be done outside of angular
      const mc = this._config.buildHammer(element);
      const callback = function (eventObj: HammerInput) {
        zone.runGuarded(function () {
          handler(eventObj);
        });
      };
      mc.on(eventName, callback);
      return () => {
        mc.off(eventName, callback);
        // destroy mc to prevent memory leak
        if (typeof mc.destroy === 'function') {
          mc.destroy();
        }
      };
    });
```

- **付けるのは `runOutsideAngular` の中**：zone.js のアプリでは、zone の中で付けたリスナーは鳴るたびに変更検知のきっかけになります。指を動かすたびに鳴るジェスチャーのイベントを、zone の外で付けています。
- **呼ぶのは `runGuarded` の中**：ジェスチャーと認めたときだけ zone に戻って `handler` を呼び、例外は zone の `onError` に流します。
- **返す関数で後片付け**：`mc.off` と `mc.destroy()`。
- zoneless の既定では `getZone()` は `NoopNgZone` で、どちらも関数をそのまま呼ぶだけです。それでも、zone.js を入れたアプリでも同じプラグインが正しく動くように、この形で書いておきます。zoneless で変更検知を起こすのは `handler` の外側の core の包み（`wrapListener` の `markViewDirty`）なので、**鳴らしたくないときは `handler` を呼ばない**のが唯一の止め方です。

f99e7ed20f0（2026-03-06、BREAKING CHANGE: Hammer.js integration has been removed. Use your own implementation.）で消えたのは、`hammer_gestures.ts`（321 行）と `hammer_gestures_spec.ts`（194 行）、公開の `HAMMER_GESTURE_CONFIG`・`HAMMER_LOADER`・`HammerGestureConfig`・`HammerLoader`・`HammerModule` です（`git show --stat f99e7ed20f0` で 11 ファイル、596 行の削除）。`(swipe)` や `(pan)` を使っていたアプリは、この章の形で自分のプラグインを書くことになります。

## 4. いちばん小さいプラグイン：spec の中の 2 つ

📄 `angular/packages/platform-browser/test/dom/events/event_manager_spec.ts` L506–527 （▶ の行: 507, 517–518, 521–524）

```ts
506 │ /** @internal */
507 ▶ class FakeEventManagerPlugin extends EventManagerPlugin {
508 │   eventHandler: {[event: string]: Function} = {};
509 │ 
510 │   constructor(
511 │     doc: Document,
512 │     public supportedEvents: string[],
513 │   ) {
514 │     super(doc);
515 │   }
516 │ 
517 ▶   override supports(eventName: string): boolean {
518 ▶     return this.supportedEvents.indexOf(eventName) > -1;
519 │   }
520 │ 
521 ▶   override addEventListener(element: Element, eventName: string, handler: Function) {
522 ▶     this.eventHandler[eventName] = handler;
523 ▶     return () => {
524 ▶       delete this.eventHandler[eventName];
525 │     };
526 │   }
527 │ }
```

event\_manager\_spec の `FakeEventManagerPlugin` は、DOM に何も付けず、`handler` を表に入れるだけです（522 行目）。外す関数も表から消すだけ（523〜525 行目）。第 13 回の spec の it は、これを並べて「どれに入ったか」で順番を確かめていました。

📄 `angular/packages/core/test/acceptance/hmr_spec.ts` L1472–1494 （▶ の行: 1479–1485）

```ts
1472 │       TestBed.configureTestingModule({
1473 │         providers: [
1474 │           {
1475 │             // Note: TestBed brings things into the zone even if they aren't which makes this
1476 │             // test hard to write. We have to intercept the listener being bound at the renderer
1477 │             // level in order to get a true sense if it'll be bound inside or outside the zone.
1478 │             // We do so with a custom event manager.
1479 ▶             provide: EVENT_MANAGER_PLUGINS,
1480 ▶             multi: true,
1481 ▶             useValue: {
1482 ▶               supports: () => true,
1483 ▶               addEventListener: (_: unknown, name: string) => {
1484 ▶                 calls.push({name, inZone: NgZone.isInAngularZone()});
1485 ▶                 return () => {};
1486 │               },
1487 │             },
1488 │           },
1489 │         ],
1490 │       });
1491 │ 
1492 │       const fixture = TestBed.createComponent(App);
1493 │       fixture.detectChanges();
1494 │       expect(calls).toEqual([{name: 'click', inZone: true}]);
```

hmr\_spec では、`useValue` に**ただのオブジェクト**を渡しています（1481 行目）。`EventManagerPlugin` を継いでいなくても、`EventManager` が使うのは `supports` と `addEventListener` と、コンストラクタが書き込む `manager` だけなので動きます（型は `EventManagerPlugin[]` ですが、`instanceof` で調べるのは `DomEventsPlugin` だけ）。1482 行目の `supports: () => true` は先頭に並ぶので、このテストの `(click)` は全部ここに来ます。1484 行目で「付けたときに Angular の zone の中にいたか」を記録して、HMR で置き換えた後も zone の中で付くことを確かめています。

> **🧪 DEMO — 長押しのプラグインを本物の EventManager に入れて、テンプレートの (longpress.600) を動かす**
>
> 「作って描く」を押すと、`createEnvironmentInjector` で小さな木を作ります。中身は `EVENT_MANAGER_PLUGINS` に `ɵDomEventsPlugin`・`ɵKeyEventsPlugin`・この章の `LongPressPlugin`（この順で multi）、本物の `EventManager`、それを使う本物の `ɵDomRendererFactory2`（@angular/platform-browser 22.1.6）です。その木で、テンプレートに `(longpress.600)` と `(click)` を書いた本物のコンポーネントを、共通部品 `domr-probe.ts` の記録係で包んで描きます。ページの root の `EventManager` には何も足しません。`LongPressPlugin` は `pointerdown`（またはボタンにフォーカスして Enter / Space を押し始めたとき）から 600 ミリ秒数え、途中で離すか外れると止めます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-custom-plugin)

記録を見ると、`click` の名前でも `LongPressPlugin.supports('click')` が先に呼ばれて `false` を返しています（1 節の順番）。`longpress.600` は renderer に名前のまま届き、`supports` が `true` を返したので `addEventListener` が呼ばれます。長押しの間に `pointerup` で click も 1 回数えられるのは、ボタンの click は DOM の別のイベントで、`DomEventsPlugin` が付けたものだからです。「destroy」を押すと、core がビューの破棄で外す関数を呼び、「外す関数が呼ばれた」が出ます（[第 14 回](14-domr-listen.md)の 5 節）。

## 5. ここまでを 1 本に

- 👤 `{ provide: EVENT_MANAGER_PLUGINS, useClass: LongPressPlugin, multi: true }` — appConfig.providers
- `new EventManager([Dom, Key, LongPress], zone)` — event\_manager.ts — *\_plugins = \[LongPress, Key, Dom\]（第 13 回）*
  - 👤 `<button (longpress.600)="…">` — あなたのテンプレート
  - `renderer.listen(button, 'longpress.600', fn)` — 第 14 回
    - `_findPluginFor('longpress.600')` → `LongPressPlugin.supports` が true — 第 13 回
    - `LongPressPlugin.addEventListener(button, 'longpress.600', fn)` — この章のデモ
      - `this.manager.getZone().runOutsideAngular(() => addEventListener('pointerdown' …))` — event\_manager.ts L90 — *外す関数を返す*
      - `setTimeout` 600ms → `zone.runGuarded(() => fn(new CustomEvent('longpress')))` — この章のデモ — *fn は core の wrapListener が包んだもの*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| core/test/acceptance/hmr\_spec.ts | it `should bind events inside the NgZone after a replacement`。自作のプラグインで「付けたときの zone」を記録する | `//packages/core/test/acceptance:acceptance`（Node） |
| platform-browser/test/dom/events/event\_manager\_spec.ts | describe `EventManager` の、`FakeEventManagerPlugin` を使う it（[第 13 回](13-domr-event-manager.md)） | `//packages/platform-browser/test:test_web_chromium`（ブラウザ） |

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=should bind events inside the NgZone after a replacement'
```

📄 `出力（2026-11-04 に実行。抜粋。ログは scratchpad/domr-logs/d-hmr.log）`

```
Ran 1 of 2693 specs
1 spec, 0 failures
Finished in 0.076 seconds
//packages/core/test/acceptance:acceptance                               PASSED in 1.3s
```

- 1 件 = この it だけ（名前の全文で絞った）。event\_manager\_spec の結果は第 13 回（ブラウザのターゲットで 253 件）。

### 直すとしたら

- プラグインの約束を変えるなら `event_manager_plugin.ts` の抽象クラス、並び方や選び方なら `event_manager.ts` です（第 13 回）。it は event\_manager\_spec の `FakeEventManagerPlugin` を並べる形か、テンプレートを通して確かめたいなら hmr\_spec の 1472〜1490 行目のように TestBed の `providers` に `EVENT_MANAGER_PLUGINS` を足す形にします。
- 関係する open の issue：テンプレートで debounce したい #51654（2023 年。コメントで「イベントのプラグインでできる」と答えられ、guide の 2 節の例はその形）、zoneless で変更検知を起こさずに聞きたい #61839（2025 年。3 節の最後のとおり、core の包みが `markViewDirty` を呼ぶので、プラグインでできるのは `handler` を呼ばないことだけ）。#61839 には、関係する PR を「今は何もしない」と閉じたときのメンテナーの言葉が引かれています。
- 本家に PR を出すことは勧めません。プラグインの issue を読むときは、まず「そのプラグインがどこに provide されていて、`_plugins` の何番目か」を確かめるところから始めます（[第 20 回](20-domr-issues.md)）。

## 聞かれそうな質問

**Q. 自分のプラグインは KeyEventsPlugin より先ですか、後ですか？**

先です。あなたの providers は既定の 2 つより後ろに並び、`EventManager` のコンストラクタが `DomEventsPlugin` 以外を逆順にするので、後から足したものほど先に聞かれます（第 13 回の 2 節、DEMO の `_plugins`）。`DomEventsPlugin` だけは場所に関係なく最後です。

**Q. プラグインを 2 つ足したら、どちらが先？**

後に書いた方が先です。同じ逆順のためです。両方が同じ名前に `true` を返すなら、後に書いた方だけが使われます。

**Q. あるコンポーネントの providers にだけプラグインを書けますか？**

効きません。renderer が使う `EventManager` は root に 1 つで、作られたときに root の `EVENT_MANAGER_PLUGINS` を受け取ったきりです。DEMO のように `EventManager` と `RendererFactory2` ごと別の木で provide すれば、その木で描いたものだけに効かせることはできますが、ふつうは root に書きます。

**Q. addEventListener で外す関数を返さないと？**

型が `Function` なので返さないとコンパイルで止まりますが、空の関数を返すと、ビューを壊したときに core が呼んでも何も外れず、DOM にリスナー（とタイマー）が残ります。guide の例の 179〜182 行目のように、付けたもの全部とタイマーを片付ける関数を返します。

**Q. zoneless でも getZone().runOutsideAngular を書く意味は？**

zoneless の既定では `NoopNgZone` なので何もしません。zone.js を入れたアプリでも同じプラグインで細かいイベント（pointermove など）が変更検知を起こさないようにするための書き方で、`KeyEventsPlugin` も消えた Hammer のプラグインも同じ形でした。zoneless で変更検知を止めたいなら、`handler` を呼ばないことです。

## 読み終えて

- 自分のプラグインは root の providers に `multi: true` で足す。逆順のおかげで `KeyEventsPlugin` より先に聞かれる。
- 先頭にいるので、`supports` は自分の名前だけに `true` を返すように狭く書く。
- `addEventListener` は DOM に付け、付けたもの全部を片付ける関数を返す。core がビューの破棄で呼ぶ。
- 付けるのは `getZone().runOutsideAngular`、呼ぶのは `runGuarded`。Hammer の統合も同じ形だった。

---

← 前: [keydown.enter と keydown.shift.a：KeyEventsPlugin](15-domr-key-events.md)  
次: [サニタイズの流れ：ɵɵsanitizeHtml から DomSanitizer まで](17-domr-sanitization.md) →
