[目次](../README.md) › [platform の説明文の読み残し](README.md) › 第 3 回 / 全 7 回

# レンダラーとイベントの説明文：DomRenderer・SharedStylesHost・EventManager・key\_events

> platform-browser/src/dom の events/event\_manager.ts・event\_manager\_plugin.ts・key\_events.ts・dom\_renderer.ts・shared\_styles\_host.ts・util.ts の未読の説明文：EVENT\_MANAGER\_PLUGINS の置き場所、キーの名前の決まり（keydown.shift.enter・code.\* など 20 の名前を本物のテンプレートで当てる）、addEventListener の戻り値、REMOVE\_STYLES\_ON\_COMPONENT\_DESTROY、開発モードだけの addBaseHrefToCssSourceMap、exportNgVar。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-dom)

---

この章で分かること：`EVENT_MANAGER_PLUGINS`・`EventManagerPlugin`・`EventManager`・`KeyEventsPlugin` の説明文と、ガイドのキーの名前の約束を、テンプレートに書いた本物の `(keydown.…)` に合成したキーのイベントを当てて確かめます。あわせて、`REMOVE_STYLES_ON_COMPONENT_DESTROY`、開発モードだけで動く `addBaseHrefToCssSourceMap`、`SharedStylesHost` の 2 つの関数、`exportNgVar` の説明文を読みます。結果として、`KeyEventsPlugin.addEventListener` の `@returns`「登録したキーのイベント」が実際は外す関数であること、ガイドの `(keydown.code.alt.shiftleft)` の例が鳴らないこと（新しい本家で直った）、`exportNgVar` の例の `ng.probe` が 2023 年に消えていること、`EVENT_MANAGER_PLUGINS` はコンポーネントの `providers` では効かないことを確かめました。

読む対象は `packages/platform-browser/src/dom/` の `events/event_manager.ts`・`events/event_manager_plugin.ts`・`events/key_events.ts`・`dom_renderer.ts`・`shared_styles_host.ts`・`util.ts` の説明文と、ガイドの `adev/src/content/guide/templates/event-listeners.md` です（../angular、8576f161ae4）。動く行は DOM レンダラーのシリーズが読んでいます。プラグインを選ぶ順は[EventManager の章](../domr/13-domr-event-manager.md)、キーの名前を読む行は[キーのイベントの章](../domr/15-domr-key-events.md)、自分のプラグインの書き方は[自分のプラグインの章](../domr/16-domr-custom-plugin.md)、スタイルの出し入れは[SharedStylesHost の章](../domr/07-domr-shared-styles.md)にあるので、ここでは繰り返さずに行だけ指します。

1. [1. bootstrapApplication](01-pbd-browser.md)
2. [2. provideClientHydration](02-pbd-hydration.md)
3. **3. レンダラーとイベント**（この章）
4. [4. Meta・Title・tools](04-pbd-meta-tools.md)
5. [5. platform-server](05-pbd-server.md)
6. [6. platform-browser-dynamic](06-pbd-dynamic.md)
7. [7. spec と issue](07-pbd-tests-issues.md)

テンプレートの `(click)` や `(keydown.enter)` は、renderer の `listen` から `EventManager` に渡り、`EventManager` が名前を引き受けるプラグイン（イベントを DOM に付ける係）を選びます。既定のプラグインは 2 つで、`KeyEventsPlugin` がキーの名前を、`DomEventsPlugin` が残り全部を引き受けます。

## 1. EVENT\_MANAGER\_PLUGINS と EventManagerPlugin の説明文

📄 `angular/packages/platform-browser/src/dom/events/event_manager.ts` L21–34 （▶ の行: 24–25, 27, 29, 31–32）

```ts
21 │ 
22 │ import {DomEventsPlugin} from './dom_events';
23 │ 
24 ▶ /**
25 ▶  * The injection token for plugins of the `EventManager` service.
26 │  *
27 ▶  * @see [Extend event handling](guide/templates/event-listeners#extend-event-handling)
28 │  *
29 ▶  * @publicApi
30 │  */
31 ▶ export const EVENT_MANAGER_PLUGINS = new InjectionToken<EventManagerPlugin[]>(
32 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'EventManagerPlugins' : '',
33 │ );
34 │ 
```

📄 `angular/packages/platform-browser/src/dom/events/event_manager_plugin.ts` L12–21 （▶ の行: 13, 15–16, 18）

```ts
12 │ /**
13 ▶  * The plugin definition for the `EventManager` class
14 │  *
15 ▶  * It can be used as a base class to create custom manager plugins, i.e. you can create your own
16 ▶  * class that extends the `EventManagerPlugin` one.
17 │  *
18 ▶  * @see [Extend event handling](guide/templates/event-listeners#extend-event-handling)
19 │  *
20 │  * @publicApi
21 │  */
```

24〜25 行目は「`EventManager` のプラグインのためのトークン」、event\_manager\_plugin.ts の 15〜16 行目は「自分のプラグインの元のクラスとして継げる」とだけ書き、どこに provide するかは書きません（27 行目と 18 行目のガイドへのリンクの先、[自分のプラグインの章の 1・2 節](../domr/16-domr-custom-plugin.md)）。

DEMO の 1 つ目の表で、2 回目の click でだけ handler を呼ぶ `PbddTwicePlugin`（`(pbdd-twice)` を引き受ける）を 2 か所に置きました。

1. **コンポーネントの providers では効かない**

   コンポーネントの中の `inject(EVENT_MANAGER_PLUGINS)` が返したのは自分の provider の 1 つだけで、プラグインの `supports` は一度も呼ばれず、`manager` も入りませんでした。renderer が使う `EventManager` はアプリの環境の注入器に 1 つで（L279 の `EventManager`、browser.ts）、作られたときにその注入器の `EVENT_MANAGER_PLUGINS` を受け取るからです（L49〜50）。`(pbdd-twice)` は `DomEventsPlugin` が名前のまま DOM に付け、click では鳴らず、`new CustomEvent('pbdd-twice')` で 1 回鳴りました。例外も警告もありません。
2. **アプリの providers なら効く**

   `createApplication({providers: […]})` に置くと、`inject(EVENT_MANAGER_PLUGINS)` は既定の 2 つと合わせて 3 つ、`supports('pbdd-twice')` が呼ばれて true、`addEventListener` の時点で `manager` が入っていて、2 回の click で handler が 1 回呼ばれました。コンポーネントを壊すと、返した外す関数が呼ばれました。

## 2. EventManager.addEventListener と KeyEventsPlugin の説明文

📄 `angular/packages/platform-browser/src/dom/events/event_manager.ts` L61–76 （▶ の行: 68, 70–72, 74–75）

```ts
61 │     const domEventPlugin = plugins.find((p) => p instanceof DomEventsPlugin);
62 │     if (domEventPlugin) {
63 │       this._plugins.push(domEventPlugin);
64 │     }
65 │   }
66 │ 
67 │   /**
68 ▶    * Registers a handler for a specific element and event.
69 │    *
70 ▶    * @param element The HTML element to receive event notifications.
71 ▶    * @param eventName The name of the event to listen for.
72 ▶    * @param handler A function to call when the notification occurs. Receives the
73 │    * event object as an argument.
74 ▶    * @param options Options that configure how the event listener is bound.
75 ▶    * @returns  A callback function that can be used to remove the handler.
76 │    */
```

📄 `angular/packages/platform-browser/src/dom/events/key_events.ts` L46–59 （▶ の行: 48, 53–54, 56–57）

```ts
46 │ 
47 │ /**
48 ▶  * A browser plug-in that provides support for handling of key events in Angular.
49 │  */
50 │ @Injectable()
51 │ export class KeyEventsPlugin extends EventManagerPlugin {
52 │   /**
53 ▶    * Initializes an instance of the browser plug-in.
54 ▶    * @param doc The document in which key events will be detected.
55 │    */
56 ▶   constructor(@Inject(DOCUMENT) doc: any) {
57 ▶     super(doc);
58 │   }
59 │ 
```

📄 `angular/packages/platform-browser/src/dom/events/key_events.ts` L68–83 （▶ の行: 70, 72–73, 75, 77, 82）

```ts
68 │ 
69 │   /**
70 ▶    * Registers a handler for a specific element and key event.
71 │    * @param element The HTML element to receive event notifications.
72 ▶    * @param eventName The name of the key event to listen for.
73 ▶    * @param handler A function to call when the notification occurs. Receives the
74 │    * event object as an argument.
75 ▶    * @returns The key event that was registered.
76 │    */
77 ▶   override addEventListener(
78 │     element: HTMLElement,
79 │     eventName: string,
80 │     handler: Function,
81 │     options?: ListenerOptions,
82 ▶   ): Function {
83 │     const parsedEvent = KeyEventsPlugin.parseEventName(eventName)!;
```

event\_manager.ts の 75 行目「ハンドラーを外せる関数を返す」は合っています。key\_events.ts の 75 行目は「登録したキーのイベントを返す」と書きますが、82 行目の型は `Function` で、中は `getDOM().onAndCancel(…)` の戻り値（L91〜93）、つまり `removeEventListener` する外す関数です（[listen の章](../domr/14-domr-listen.md)）。DEMO の 2 つ目の表で、`EventManager.addEventListener(div, 'keydown.enter', …)` の戻り値は `typeof` が `'function'` で、呼んだあとの Enter では鳴りませんでした。この文は 23a98b9e513（2018-05-02、docs: add doc to event-management api (#23656)）からで、新しい本家（origin/main の d201dd76ef2、2026-11-19。以下「新しい本家」）でも同じです。

53〜54 行目の「`doc`：キーのイベントを捕まえる文書」も、今は使われていません。56〜57 行目で `super(doc)` に渡し、`EventManagerPlugin` の constructor が `private _doc` に入れるだけで（event\_manager\_plugin.ts L23〜24 の「TODO: remove (has some usage in G3)」）、リスナーは L92 のとおり渡された要素に付きます。

📄 `angular/packages/platform-browser/src/dom/events/key_events.ts` L143–156 （▶ の行: 145–148, 154–155）

```ts
143 │ 
144 │   /**
145 ▶    * Determines whether the actual keys pressed match the configured key code string.
146 ▶    * The `fullKeyCode` event is normalized in the `parseEventName` method when the
147 ▶    * event is attached to the DOM during the `addEventListener` call. This is unseen
148 ▶    * by the end user and is normalized for internal consistency and parsing.
149 │    *
150 │    * @param event The keyboard event.
151 │    * @param fullKeyCode The normalized user defined expected key event string
152 │    * @returns boolean.
153 │    */
154 ▶   static matchEventFullKeyCode(event: KeyboardEvent, fullKeyCode: string): boolean {
155 ▶     let keycode = _keyMap[event.key] || event.key;
156 │     let key = '';
```

📄 `angular/packages/platform-browser/src/dom/events/key_events.ts` L180–190 （▶ の行: 182–183, 185, 188, 190）

```ts
180 │ 
181 │   /**
182 ▶    * Configures a handler callback for a key event.
183 ▶    * @param fullKey The event name that combines all simultaneous keystrokes.
184 │    * @param handler The function that responds to the key event.
185 ▶    * @param zone The zone in which the event occurred.
186 │    * @returns A callback function.
187 │    */
188 ▶   static eventCallback(fullKey: string, handler: Function, zone: NgZone): Function {
189 │     return (event: KeyboardEvent) => {
190 ▶       if (KeyEventsPlugin.matchEventFullKeyCode(event, fullKey)) {
```

145〜148 行目「押されたキーが、`parseEventName` で正規化した文字列と合うか」は、[キーのイベントの章の 3 節](../domr/15-domr-key-events.md)のとおり、前方一致ではなく全部が同じときだけです。185 行目の `zone` は「イベントが起きた zone」と書きますが、使い方は L191 の `zone.runGuarded(() => handler(event))`、つまり「handler を呼ぶ zone」です。zoneless の既定では `NoopNgZone` で、関数をそのまま呼ぶだけです。

## 3. ガイドのキーの名前を、本物のテンプレートで当てる

📄 `angular/adev/src/content/guide/templates/event-listeners.md` L81–99 （▶ の行: 81, 85, 88, 90, 92, 95–96）

````md
81 ▶ You can also add additional key modifiers:
82 │ 
83 │ ```angular-html
84 │ <!-- Matches shift and enter -->
85 ▶ <input type="text" (keyup.shift.enter)="updateField($event)" />
86 │ ```
87 │ 
88 ▶ Angular supports the modifiers `alt`, `control`, `meta`, and `shift`.
89 │ 
90 ▶ You can specify the key or code that you would like to bind to keyboard events. The key and code fields are a native part of the browser keyboard event object. By default, event binding assumes you want to use the [Key values for keyboard events](https://developer.mozilla.org/docs/Web/API/UI_Events/Keyboard_event_key_values).
91 │ 
92 ▶ Angular also allows you to specify [Code values for keyboard events](https://developer.mozilla.org/docs/Web/API/UI_Events/Keyboard_event_code_values) by providing a built-in `code` suffix.
93 │ 
94 │ ```angular-html
95 ▶ <!-- Matches alt and left shift -->
96 ▶ <input type="text" (keydown.code.alt.shiftleft)="updateField($event)" />
97 │ ```
98 │ 
99 │ This can be useful for handling keyboard events consistently across different operating systems. For example, when using the Alt key on macOS devices, the `key` property reports the key based on the character already modified by the Alt key. This means that a combination like Alt + S reports a `key` value of `'ß'`. The `code` property, however, corresponds to the physical or virtual button pressed rather than the character produced.
````

ガイドは 85 行目で `(keyup.shift.enter)`、88 行目で「使える修飾キーは `alt`・`control`・`meta`・`shift`」、92 行目で `code` を前に付けると `event.code` で比べると書き、95〜96 行目の例 `(keydown.code.alt.shiftleft)` に「Alt と左の Shift に当たる」と添えます。

DEMO の「キーの名前」の部品は、20 の名前をテンプレートの `(keydown.…)`・`(keyup.…)` にそのまま書き（AOT でコンパイルされ、このサイトの `EventManager` と `KeyEventsPlugin` を通る）、13 通りの押し方の `KeyboardEvent` を keydown と keyup の順に当てます。本番のこのページで、当たったのは次のとおりでした。

| 名前 | 鳴った押し方 | なぜ |
| --- | --- | --- |
| `keyup.shift.enter`・`keydown.shift.enter` | Shift+Enter だけ | Enter だけでは `shift.` が足りない。keyup と keydown は 1 つずつ |
| `keydown.control.shift.z`・`keydown.shift.control.z` | Ctrl+Shift+Z（両方とも） | 修飾キーは書いた順でなく alt・control・meta・shift の順に並べ直す（L121〜127） |
| `keydown.a` | A だけ | Ctrl+A・Shift+A は修飾キーが多くて外れる |
| `keydown.shift.1` | どれも鳴らない | Shift+1 の `event.key` は `'!'`。`keydown.code.shift.digit1` は鳴る |
| `keydown.code.alt.shiftleft`（ガイドの例） | どれも鳴らない | 左の Shift を押すと `shiftKey` も true で、作る文字列は `code.alt.shift.shiftleft`（L169〜176） |
| `keydown.code.alt.shift.shiftleft` | Alt+左 Shift | 新しい本家のガイドはこちらに直った |
| `keydown.del` | どれも鳴らない | Delete の `event.key` は `'Delete'`。名前の側は `esc` しか直さない（L197〜199） |
| `keydown.a.control`・`keydown.ctrl.a` | どれも鳴らない | `parseEventName` が null（L130〜133）で、`DomEventsPlugin` がその名前のまま DOM に付ける。例外も警告も無い |

ガイドの 96 行目の例は 2e4e1214cc6（2026-10-26、docs: fix the left shift key event example）で `(keydown.code.alt.shift.shiftleft)` に直りました。手元の 8576f161ae4 と、このサイトの 22.2.6 のころの angular.dev は直る前の文です。合成した `KeyboardEvent` は `isTrusted` が false ですが、`KeyEventsPlugin` は `key`・`code`・修飾キーの 4 つの真偽しか見ないので（L154〜178）、実際にキーを押したときと同じ答えになります。

## 4. REMOVE\_STYLES\_ON\_COMPONENT\_DESTROY と、開発モードだけの addBaseHrefToCssSourceMap

`REMOVE_STYLES_ON_COMPONENT_DESTROY` の説明文（dom\_renderer.ts L62〜66「壊したコンポーネントのスタイルを DOM から外すか。既定は true」）は[スタイルの後片付けの章](../animations/13-animations-styles-teardown.md)が読んでいます。DEMO の 3 つ目の表（記録）で、既定のアプリはコンポーネントを壊すと `<head>` の `<style>` が 1 → 0、false にしたアプリは 1 のまま残り、アプリを壊したときに 0 になりました（`SharedStylesHost.ngOnDestroy`、shared\_styles\_host.ts L202〜207）。説明文のとおりで、残ったスタイルはアプリを壊すまで外れないことは説明文に無い点です。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L114–136 （▶ の行: 116–117, 119–125, 127, 133–135）

```ts
114 │ 
115 │ /**
116 ▶  * Prepends a baseHref to the `sourceMappingURL` within the provided CSS content.
117 ▶  * If the `sourceMappingURL` contains an inline (encoded) map, the function skips processing.
118 │  *
119 ▶  * @note For inline stylesheets, the `sourceMappingURL` is relative to the page's origin
120 ▶  * and not the provided baseHref. This function is needed as when accessing the page with a URL
121 ▶  * containing two or more segments.
122 ▶  * For example, if the baseHref is set to `/`, and you visit a URL like `http://localhost/foo/bar`,
123 ▶  * the map would be requested from `http://localhost/foo/bar/comp.css.map` instead of what you'd expect,
124 ▶  * which is `http://localhost/comp.css.map`. This behavior is corrected by modifying the `sourceMappingURL`
125 ▶  * to ensure external source maps are loaded relative to the baseHref.
126 │  *
127 ▶ 
128 │  * @param baseHref - The base URL to prepend to the `sourceMappingURL`.
129 │  * @param styles - An array of CSS content strings, each potentially containing a `sourceMappingURL`.
130 │  * @returns The updated array of CSS content strings with modified `sourceMappingURL` values,
131 │  * or the original content if no modification is needed.
132 │  */
133 ▶ export function addBaseHrefToCssSourceMap(baseHref: string, styles: string[]): string[] {
134 ▶   if (!baseHref) {
135 ▶     return styles;
136 │   }
```

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L137–160 （▶ の行: 138, 141, 145, 147–149, 151, 154, 156）

```ts
137 │ 
138 ▶   const absoluteBaseHrefUrl = new URL(baseHref, 'http://localhost');
139 │ 
140 │   return styles.map((cssContent) => {
141 ▶     if (!cssContent.includes('sourceMappingURL=')) {
142 │       return cssContent;
143 │     }
144 │ 
145 ▶     return cssContent.replace(SOURCEMAP_URL_REGEXP, (_, sourceMapUrl) => {
146 │       if (
147 ▶         sourceMapUrl[0] === '/' ||
148 ▶         sourceMapUrl.startsWith('data:') ||
149 ▶         PROTOCOL_REGEXP.test(sourceMapUrl)
150 │       ) {
151 ▶         return `/*# sourceMappingURL=${sourceMapUrl} */`;
152 │       }
153 │ 
154 ▶       const {pathname: resolvedSourceMapUrl} = new URL(sourceMapUrl, absoluteBaseHrefUrl);
155 │ 
156 ▶       return `/*# sourceMappingURL=${resolvedSourceMapUrl} */`;
157 │     });
158 │   });
159 │ }
160 │ 
```

116 行目「CSS の中の `sourceMappingURL` の前に baseHref を付ける」関数で、6b09716754b（2025-01-27、fix(platform-browser): prepend `baseHref` to `sourceMappingURL` in CSS content (#59730)）で足されました。呼ぶのはスタイルを持つ 2 つの renderer の constructor で、どちらも `if (ngDevMode)` の中です（L581〜585・L664〜668、「本番では利用者がコンポーネントに CSS の source map を付けないから」というコメント付き）。本番のこのページでは動かないので、Node の記録で見せます（DEMO の 4 つ目の表）。

1. **122〜125 行目の例のとおり**

   `<base href="/">` で `comp.css.map` は `/comp.css.map`、`<base href="/app/">` では `/app/comp.css.map` になりました。本番の記録は書き換えません。
2. **117 行目のインラインの map は飛ばす**

   `data:` で始まるものはそのままでした。説明文に無いことに、`/` で始まるものと `https:` のものも 147〜152 行目でそのまま返します。
3. **「前に付ける」のではなく、解決した path を書く**

   154 行目は `new URL(sourceMapUrl, absoluteBaseHrefUrl)` の `pathname` なので、`../maps/comp.css.map` は `/maps/comp.css.map` になりました（`/app/` の外に出る）。
4. **1 つの CSS に 2 つあれば最初だけ**

   L50 の `SOURCEMAP_URL_REGEXP` に `g` が無いので、145 行目の `replace` は最初の 1 つだけを直し、2 つ目の `b.map` はそのままでした。

127 行目は、コメントの中なのに先頭の `*` が無い空行です。TypeScript の JSDoc としてはそのまま読めますが、123〜125 行目の `http://localhost/…` の例は説明の中の URL で、例のコードではありません。新しい本家でも同じです。

## 5. SharedStylesHost の 2 つの関数と exportNgVar

📄 `angular/packages/platform-browser/src/dom/shared_styles_host.ts` L55–70 （▶ の行: 57–63）

```ts
55 │ 
56 │ /**
57 ▶  * Searches a DOM document's head element for style elements with a matching application
58 ▶  * identifier attribute (`ng-app-id`) to the provide identifier and adds usage records for each.
59 ▶  * @param doc An HTML DOM document instance.
60 ▶  * @param appId A string containing an Angular application identifier.
61 ▶  * @param inline A Map object for tracking inline (defined via `styles` in component decorator) style usage.
62 ▶  * @param external A Map object for tracking external (defined via `styleUrls` in component decorator) style usage.
63 ▶  * @returns Whether or not styles were added.
64 │  */
65 │ function addServerStyles(
66 │   doc: Document,
67 │   appId: string,
68 │   inline: Map<string, UsageRecord<HTMLStyleElement>>,
69 │   external: Map<string, UsageRecord<HTMLLinkElement>>,
70 │ ): boolean {
```

57〜58 行目「文書の head から、`APP_ID` の合う `ng-app-id` 属性の style を探し、使用の記録を足す」と 63 行目「足したかを返す」のとおり、戻り値は `SharedStylesHost` の constructor が `doc.head` を出し先に入れるかに使います（L135〜136）。中の行（L71〜91）と、このサイトのプリレンダーした head で `ng-app-id` が外れる様子は[SharedStylesHost の章の 4 節](../domr/07-domr-shared-styles.md)と[コンポーネントのスタイルの章](../cli/04-cli-component-styles.md)です。

📄 `angular/packages/platform-browser/src/dom/shared_styles_host.ts` L90–107 （▶ の行: 95, 97, 100–103）

```ts
 90 │ 
 91 │   return true;
 92 │ }
 93 │ 
 94 │ /**
 95 ▶  * Creates a `link` element for the provided external style URL.
 96 │  * @param url A string of the URL for the stylesheet.
 97 ▶  * @param doc A DOM Document to use to create the element.
 98 │  * @returns An HTMLLinkElement instance.
 99 │  */
100 ▶ export function createLinkElement(url: string, doc: Document): HTMLLinkElement {
101 ▶   const linkElement = doc.createElement('link');
102 ▶   linkElement.setAttribute('rel', 'stylesheet');
103 ▶   linkElement.setAttribute('href', url);
104 │ 
105 │   return linkElement;
106 │ }
107 │ 
```

95〜98 行目のとおり、外部スタイル（`styleUrl` を JS に入れずに URL のまま配るビルドのとき）の `<link rel="stylesheet">` を作るだけの関数です。export されていて、スタイルを持つ renderer の側でも使われます（dom\_renderer.ts L38 の import）。

📄 `angular/packages/platform-browser/src/dom/util.ts` L13–29 （▶ の行: 14–15, 20–21, 26–27）

```ts
13 │ /**
14 ▶  * Exports the value under a given `name` in the global property `ng`. For example `ng.probe` if
15 ▶  * `name` is `'probe'`.
16 │  * @param name Name under which it will be exported. Keep in mind this will be a property of the
17 │  * global `ng` object.
18 │  * @param value The value to export.
19 │  */
20 ▶ export function exportNgVar(name: string, value: any): void {
21 ▶   if (typeof COMPILED === 'undefined' || !COMPILED) {
22 │     // Note: we can't export `ng` when using closure enhanced optimization as:
23 │     // - closure declares globals itself for minified names, which sometimes clobber our `ng` global
24 │     // - we can't declare a closure extern as the namespace `ng` is already used within Google
25 │     //   for typings for angularJS (via `goog.provide('ng....')`).
26 ▶     const ng = (global['ng'] = (global['ng'] as {[key: string]: any} | undefined) || {});
27 ▶     ng[name] = value;
28 │   }
29 │ }
```

14〜15 行目の例「たとえば `name` が `'probe'` なら `ng.probe`」の `ng.probe` は、もうありません。`exportNgVar('probe', …)` を呼んでいた platform-browser の dom/debug/ng\_probe.ts は e57d5db0458（2023-03-02、refactor(core): remove unused r2 debug code (#49292)）で消え、今この関数を呼ぶのは `enableDebugTools` と `disableDebugTools` の 2 行だけです（tools/tools.ts L31・L41、[次の章](04-pbd-meta-tools.md)）。説明文の例は古いだけで、関数は今も `window.ng` にそのまま名前を足します。

> **🧪 DEMO — キーの名前を本物で当て、プラグインを置く場所を試す**
>
> はじめの部品は、この章のコンポーネントのテンプレートに 20 の名前を書いた要素です。「全部押す」で 13 通りの `KeyboardEvent` をこの要素にだけ `dispatchEvent` し、どの名前の handler が呼ばれたかを ● で並べます。「引き受けるプラグイン」の列は本物の `ɵKeyEventsPlugin.parseEventName` の答えです。  
>  下の 1・2 つ目のボタンは、このページで本物を動かします。1 つ目はコンポーネントを文書に付けない要素の上に作り、`createApplication` で小さなアプリも作って、最後に両方 destroy します。「開発モード（記録）」の列と 3・4 つ目の表は、同じ関数を Node（domino の上の JIT）で動かした記録です。  
>  本番ビルドの最初に読む JS（Initial total）は、この章を入れても 486.46 kB のままでした。はじめはプラグインのデモを動的 import にしていて、その chunk が platform-browser を直接 import すると、最初に読む chunk の分け方が変わって 487.69 kB に、3 つ目をページで動かすと `REMOVE_STYLES_ON_COMPONENT_DESTROY` の分だけ main の export が増えて 486.47 kB になったので、プラグインのデモは章の chunk に入れ、3 つ目は記録にしました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-dom)

## ここまでの呼び出し（コンポーネントの providers に置いたプラグイン）

- 👤 `<button (pbdd-twice)="count()">` — providers: \[{provide: EVENT\_MANAGER\_PLUGINS, multi: true}\]
  - `renderer.listen(button, 'pbdd-twice', …)` — dom\_renderer.ts L477〜509 — *renderer は環境の注入器から*
    - `EventManager.addEventListener → _findPluginFor('pbdd-twice')` — event\_manager.ts L77〜113 — *環境の注入器の 2 つのプラグインだけを見る*
      - `DomEventsPlugin.supports → true` — dom\_events.ts L21〜23
      - `element.addEventListener('pbdd-twice', …)` — dom\_events.ts L31 — *名前のまま。click では鳴らない*

## テストと直し方

| ファイル（packages/platform-browser/test/dom/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `events/key_events_spec.ts` | `KeyEventsPlugin`（11）› `should correctly parse event names`（21）・`should match key field`（103）・`should match code field`（234）ほか 3 つ | 3 節の表。`addEventListener` の戻り値を見る it は無い |
| `events/event_manager_spec.ts` | `EventManager`（27）› `should delegate event bindings to the first plugin supporting the event`（45）ほか | 1 節。プラグインはどれも `new EventManager([…], zone)` に直接渡す形で、置き場所の it は無い。ブラウザーの suite だけで動く |
| `dom_renderer_spec.ts` | `addBaseHrefToCssSourceMap`（598）の 7 つの it、`should update an external sourceMappingURL by prepending the baseHref as a prefix`（355） | 4 節。`../` と 2 つの map の it は無い |
| `dom_renderer_spec.ts` | `` should not cleanup styles of destroyed components when `REMOVE_STYLES_ON_COMPONENT_DESTROY` is `false` ``（220）・`should cleanup styles of destroyed components by default`（288） | 4 節の 3 つ目の表 |
| `shared_styles_host_spec.ts` | `SharedStylesHost`（13）› `inline`（24）› `should reuse SSR generated element`（60）ほか | 5 節の `addServerStyles` |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-browser/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
$ pnpm bazel test //packages/platform-browser/test:test_web_chromium --nocache_test_results --test_output=all
（結果は表の下）
```

結果は手元の bazel で、`//packages/platform-browser/test:test`（Node）の絞り込みが `KeyEventsPlugin` で 6 specs、`addBaseHrefToCssSourceMap` で 9 specs、`SharedStylesHost` で 22 specs、どれも 0 failures でした。`EventManager` は Node では 0 specs で（ブラウザーの suite だけにある）、ブラウザーの suite は全体で 253 passed・0 failed・5 skipped です（2026-11-22）。

直すとしたら、key\_events.ts の 75 行目を「ハンドラーを外す関数を返す」に、53〜54 行目を「使われない（EventManagerPlugin に渡すだけ）」に、185 行目を「handler を呼ぶ zone」に、util.ts の 14〜15 行目の例を `ng.profiler`（`enableDebugTools` が置く名前）に直します。`EVENT_MANAGER_PLUGINS` の 24〜25 行目には「アプリの環境の注入器（`bootstrapApplication` の providers）に置く。コンポーネントやルートの providers に置いても使われない」と添えます。spec は key\_events\_spec.ts に「`addEventListener` の戻り値を呼ぶと、もう handler が呼ばれない」を、dom\_renderer\_spec.ts の `addBaseHrefToCssSourceMap` に `../` の it を足すと、今の振る舞いが固まります。

## 聞かれそうな質問

**Q. 自分の `EventManagerPlugin` を、使うコンポーネントの providers に書けば効きますか？**

効きません。renderer の `EventManager` はアプリの環境の注入器に 1 つで、作られたときの `EVENT_MANAGER_PLUGINS` しか見ません（event\_manager.ts L49〜50）。DEMO の 1 つ目の表で、`supports` は一度も呼ばれず、名前は `DomEventsPlugin` がそのまま DOM に付けました。`bootstrapApplication` の providers に書きます。

**Q. `(keydown.ctrl.s)` と書いたら、何が起きますか？**

何も鳴らず、例外も警告も出ません。`ctrl` は修飾キーの名前ではないので `parseEventName` が null を返し（L130〜133）、`DomEventsPlugin` が `'keydown.ctrl.s'` という名前のイベントを DOM に付けます。正しくは `(keydown.control.s)` です。

**Q. ガイドの `(keydown.code.alt.shiftleft)` は、なぜ鳴らないのですか？**

左の Shift を押すと `shiftKey` も true で、押した側の文字列が `code.alt.shift.shiftleft` になるからです（L169〜176。`code.` のときの主なキーは `shiftleft` なので、170 行目の比べで `shift` と別物になる）。新しい本家のガイドは `(keydown.code.alt.shift.shiftleft)` に直っています。

**Q. `KeyEventsPlugin.addEventListener` は何を返しますか？**

外す関数です（L91〜93 の `onAndCancel` の戻り値）。75 行目の「登録したキーのイベント」は合っていません。DEMO の 2 つ目の表で、呼んだあとは鳴りませんでした。

**Q. CSS の `sourceMappingURL` が本番ビルドで書き換わらないのはなぜですか？**

`addBaseHrefToCssSourceMap` を呼ぶ 2 か所が `if (ngDevMode)` の中だからです（L581〜585・L664〜668）。本番では CSS の source map を付けない前提です。

## 読み終えて

- `EVENT_MANAGER_PLUGINS` はアプリの環境の注入器に置く。コンポーネントの providers では黙って使われない。
- キーの名前は修飾キーを並べ直し、全部が同じときだけ鳴る。`shift.1`・`del`・`ctrl`・修飾キーが後ろの名前は黙って鳴らない。
- ガイドの `code.alt.shiftleft` の例は鳴らず、新しい本家で `code.alt.shift.shiftleft` に直った。
- `KeyEventsPlugin.addEventListener` の `@returns` と `doc` の説明は、外す関数と使われない引数のこと。
- `addBaseHrefToCssSourceMap` は開発モードだけで、相対の path を解決して書き、2 つ目の map は直さない。`exportNgVar` の例の `ng.probe` は 2023 年に消えた。

---

← 前: [provideClientHydration と with\* の説明文](02-pbd-hydration.md)  
次: [Meta・Title・enableDebugTools・Safe\* の説明文](04-pbd-meta-tools.md) →
