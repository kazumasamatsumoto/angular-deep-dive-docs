[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 2 回 / 全 20 回

# Angular を見つける：detect-angular と ngAvailability

> ページに Angular があるか、開発モードか、どの版かを DOM の ng-version 属性と window.ng だけで調べる detect-angular.ts と shared-utils の angular-check、バックエンドを差し込む content script と handshake で起動する backend.ts、queryNgAvailability への返事 ngAvailability と、window.ng にある関数から使える機能を決める supportedApis（ng-debug-api.ts）。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-detect)

---

DevTools のパネルが「Angular application not detected.」や「production configuration」の画面を出すか、タブを出すかは、ページの中で 2 回の判定を経て決まります。1 回目はページを読み込んだときの `detect-angular.ts`（ツールバーのアイコンとバックエンドを差し込むかを決める）、2 回目はパネルからの `queryNgAvailability` に答えるバックエンドの `checkForAngular`（版・開発モード・使える機能 `supportedApis` を返す）です。この章では、その 2 つが **DOM の `ng-version` 属性と `window.ng` の関数の有無だけ**を見ていることを、行で確かめます。

読む対象は `shell-browser/src/app/ng-validate.ts`・`detect-angular.ts`・`content-script.ts`（検出の部分）・`background.ts`・`backend.ts`、`shared-utils/src/lib/angular-check.ts`、`ng-devtools-backend/src/lib/client-event-subscribers.ts` の `checkForAngular`、`shared/ng-debug-api/`、パネルの `devtools.component.ts` です。

1. [1. 全体像](01-devtools-overview.md)
2. **2. Angular を見つける**（この章）
3. [3. メッセージの道](03-devtools-messaging.md)
4. [4. プロトコル](04-devtools-protocol.md)
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. [7. 同じノードを見分ける](07-devtools-identity.md)
8. [8. パネルの木](08-devtools-forest-ui.md)
9. [9. プロパティの直列化](09-devtools-state-serializer.md)
10. [10. 入れ子を開く](10-devtools-property-resolver.md)
11. [11. 値を書き換える](11-devtools-property-mutation.md)
12. [12. 選ぶ・光らせる](12-devtools-inspector-highlight.md)
13. [13. プロファイラーの記録](13-devtools-profiler-capture.md)
14. [14. 記録を描く](14-devtools-profiler-formatters.md)
15. [15. 変更検知を見張る](15-devtools-cd-analyzer.md)
16. [16. 注入器の木](16-devtools-injector-tree.md)
17. [17. signal のグラフ](17-devtools-signal-graph.md)
18. [18. ルーター・TransferState](18-devtools-router-transfer.md)
19. [19. テストとビルド](19-devtools-test-build.md)
20. [20. issue と PR を読む](20-devtools-issues.md)

## 1. ng-validate：検出のスクリプトをページの main world に差し込む

📄 `angular/devtools/projects/shell-browser/src/app/ng-validate.ts` L9–16 （▶ の行: 11, 13–15）

```ts
 9 │ /// <reference types="chrome"/>
10 │ 
11 ▶ if (document.contentType === 'text/html') {
12 │   const script = document.createElement('script');
13 ▶   script.src = chrome.runtime.getURL('app/detect_angular_bundle.js');
14 ▶   document.documentElement.appendChild(script);
15 ▶   document.documentElement.removeChild(script);
16 │ }
```

`ng-validate.ts` は manifest で全 frame に入る content script です（[第 1 回](01-devtools-overview.md)の 2 節）。content script は isolated world にいるので `window.ng` が見えません。そこで 13 行目で拡張の中の `detect_angular_bundle.js` を `src` にした `<script>` を作り、14 行目で DOM に足します。足された script はページの main world で動きます。15 行目ですぐに外すのは、読み込みが始まれば要素は要らないからです。11 行目は HTML でない文書（XML や画像の表示など）を避ける守りです。

## 2. detect-angular：4 つの判定を 1 秒ごとに送る

📄 `angular/devtools/projects/shell-browser/src/app/detect-angular.ts` L26–64 （▶ の行: 28–31, 42, 45, 55–56, 60–61）

```ts
26 │ let detectAngularTimeout: ReturnType<typeof setTimeout>;
27 │ function detectAngular(win: Window): void {
28 ▶   const isAngular = appIsAngular();
29 ▶   const isSupportedAngularVersion = appIsSupportedAngularVersion();
30 ▶   const isDebugMode = appIsAngularInDevMode();
31 ▶   const isIvy = appIsAngularIvy();
32 │ 
33 │   const detection: AngularDetection = {
34 │     isIvy,
35 │     isAngular,
36 │     isDebugMode,
37 │     isSupportedAngularVersion,
38 │     isAngularDevTools: true,
39 │   };
40 │ 
41 │   // For the background script to toggle the icon.
42 ▶   win.postMessage(detection, '*');
43 │ 
44 │   // For the content script to inject the backend.
45 ▶   detectAngularMessageBus.emit('detectAngular', [
46 │     {
47 │       isIvy,
48 │       isAngular,
49 │       isDebugMode,
50 │       isSupportedAngularVersion,
51 │       isAngularDevTools: true,
52 │     },
53 │   ]);
54 │ 
55 ▶   detectAngularTimeout = setTimeout(() => {
56 ▶     detectAngular(win);
57 │   }, 1000);
58 │ }
59 │ 
60 ▶ detectAngularMessageBus.on('backendInstalled', (detection) => {
61 ▶   clearTimeout(detectAngularTimeout);
62 │ });
63 │ 
64 │ detectAngular(window);
```

1. **28〜31 行目：shared-utils の 4 つの関数**

   中身は次の節で読みます。結果を `AngularDetection` という形（[第 4 回](04-devtools-protocol.md)）にまとめます。38 行目の `isAngularDevTools: true` は「この拡張が出したもの」という印です。
2. **45〜53 行目：`detectAngular` を content script へ**

   `SamePageMessageBus`（`window.postMessage` を使う bus、[第 3 回](03-devtools-messaging.md)）で送ります。
3. **55〜57 行目：1 秒後にもう一度**

   detect-angular が動いた時点でルートの要素がまだ描かれていなければ `ng-version` が無く、`isAngular` は false です。そこで `backendInstalled` が返ってくるまで 1 秒ごとに判定をやり直し、60〜62 行目でその返事を受けたら止めます。
4. **42 行目：もう 1 つの `postMessage`**

   41 行目のコメントは「background がアイコンを切り替えるため」です。ただし、この印の無い（`__NG_DEVTOOLS_EVENT__` を持たない）メッセージは、content script の中継（[第 3 回](03-devtools-messaging.md)の 3 節）が 2025-07-19 の a6b2d7dd109 から通さなくなりました。いまアイコンを切り替えているのは、次の 4 節の content script の 79 行目です。[第 3 回](03-devtools-messaging.md)のデモの記録でも、42 行目のメッセージは background に届いていません。

## 3. angular-check：見ているのは ng-version 属性と window.ng だけ

📄 `angular/devtools/projects/shared-utils/src/lib/angular-check.ts` L13–33 （▶ の行: 14, 18–19, 23, 31–32）

```ts
13 │ export const appIsAngularInDevMode = (): boolean => {
14 ▶   return appIsAngular() && appHasGlobalNgDebugObject();
15 │ };
16 │ 
17 │ export const appIsAngularIvy = (): boolean => {
18 ▶   const rootElement = (window as any).document.querySelector('[ng-version]');
19 ▶   return typeof rootElement?.__ngContext__ !== 'undefined';
20 │ };
21 │ 
22 │ export const appIsAngular = (): boolean => {
23 ▶   return !!getAngularVersion();
24 │ };
25 │ 
26 │ export const appIsSupportedAngularVersion = (): boolean => {
27 │   const version = getAngularVersion();
28 │   if (!version) {
29 │     return false;
30 │   }
31 ▶   const major = parseInt(version.toString().split('.')[0], 10);
32 ▶   return appIsAngular() && (major >= 12 || major === 0);
33 │ };
```

📄 `angular/devtools/projects/shared-utils/src/lib/angular-check.ts` L47–66 （▶ の行: 49–50, 55, 59, 63–64）

```ts
47 │ const appHasGlobalNgDebugObject = (): boolean => {
48 │   return (
49 ▶     typeof ng === 'object' &&
50 ▶     (typeof ng.getComponent === 'function' || typeof ng.probe === 'function')
51 │   );
52 │ };
53 │ 
54 │ export const getAngularVersion = (): string | null => {
55 ▶   const el = document.querySelector('[ng-version]');
56 │   if (!el) {
57 │     return null;
58 │   }
59 ▶   return el.getAttribute('ng-version');
60 │ };
61 │ 
62 │ export function isHydrationEnabled(): boolean {
63 ▶   return Array.from(document.querySelectorAll('[ng-version]')).some(
64 ▶     (rootNode) => (rootNode as HydrationNode)?.__ngDebugHydrationInfo__,
65 │   );
66 │ }
```

| 関数 | 見ているもの | 行 |
| --- | --- | --- |
| `getAngularVersion` | 最初に見つかった `[ng-version]` の要素の属性の値 | 55〜59 |
| `appIsAngular` | その値が空でないか | 23 |
| `appIsSupportedAngularVersion` | 先頭の数（メジャー版）が 12 以上か 0 か | 31〜32 |
| `appIsAngularIvy` | 最初の `[ng-version]` の要素に `__ngContext__` があるか | 18〜19 |
| `appIsAngularInDevMode` | Angular で、かつ `ng` がオブジェクトで `getComponent`（か View Engine の `probe`）を持つか | 14・49〜50 |
| `isHydrationEnabled` | `[ng-version]` の要素のどれかに `__ngDebugHydrationInfo__` があるか | 63〜64 |

`ng-version` 属性はどこで付くのでしょうか。ルートのコンポーネントを作るときです。

📄 `angular/packages/core/src/render3/component_ref.ts` L449–452 （▶ の行: 449–450）

```ts
449 ▶   const tAttributes = rootSelectorOrNode
450 ▶     ? ['ng-version', '0.0.0-PLACEHOLDER']
451 │     : // Extract attributes and classes from the first selector only to match VE behavior.
452 │       extractAttrsAndClassesFromSelector(componentDef.selectors[0]);
```

449〜450 行目で、ルートの要素（`rootSelectorOrNode` がある）には属性 `ng-version` が足されます。`0.0.0-PLACEHOLDER` はリリースのビルドで実際の版に置き換わる文字列で、デモの記録でも `22.1.6` になっています。この属性は開発モードかどうかに関係なく付くので、**本番モードのアプリでも `appIsAngular` は true** です。開発モードかどうかは `window.ng` だけで分けます。`__ngContext__` は Ivy が DOM の要素に書く、`LView`（[ivy-lview の章](../ivy/06-ivy-lview.md)）への手がかりです。

> [!WARNING]
> **ハマりどころ**
>
> 18 行目と 55 行目の `querySelector` は**最初の 1 つ**しか見ません。ページに Angular でない要素で `ng-version` 属性を持つもの（別の拡張が差し込んだ要素など）がアプリより前にあると、版はその要素の値になり、Ivy の判定は false になります。デモの「よその要素（前）」の場面で確かめます。

## 4. content script：アイコンを切り替え、バックエンドを差し込む

📄 `angular/devtools/projects/shell-browser/src/app/content-script.ts` L58–89 （▶ の行: 65, 69, 74, 79, 82–83, 86, 88）

```ts
58 │ const detectAngularMessageBus = new SamePageMessageBus(
59 │   '[ContentScript=>DetectAngular]',
60 │   getContentScriptUri(),
61 │   getDetectAngularScriptUri(),
62 │ );
63 │ 
64 │ detectAngularMessageBus.on('detectAngular', (detectionResult) => {
65 ▶   if (detectionResult.isAngularDevTools !== true) {
66 │     return;
67 │   }
68 │ 
69 ▶   if (detectionResult.isAngular !== true) {
70 │     return;
71 │   }
72 │ 
73 │   // Defensive check against non html page. Realistically this should never happen.
74 ▶   if (document.contentType !== 'text/html') {
75 │     return;
76 │   }
77 │ 
78 │   // Inform the background page so it can toggle the popup and icon.
79 ▶   void chrome.runtime.sendMessage(detectionResult);
80 │ 
81 │   const script = document.createElement('script');
82 ▶   script.src = chrome.runtime.getURL('app/backend_bundle.js');
83 ▶   document.documentElement.appendChild(script);
84 │   document.documentElement.removeChild(script);
85 │ 
86 ▶   detectAngularMessageBus.emit('backendInstalled', [detectionResult]);
87 │ 
88 ▶   attemptBackendHandshake();
89 │ });
```

1. **65・69 行目：DevTools の印があり、Angular であるときだけ進む**

   開発モードでなくても、Ivy でなくても、ここは通ります。バックエンドは本番モードのページにも差し込まれます（だからパネルは「production configuration」の画面を、バックエンドの返事から出せます）。
2. **79 行目：検出の結果を background へ**

   `chrome.runtime.sendMessage` は Port を使わない 1 回きりのメッセージです。background の受け手は次の引用です。
3. **82〜83 行目：`backend_bundle.js` を差し込む**

   1 節と同じやり方で、バックエンドをページの main world で動かします。
4. **86・88 行目：`backendInstalled` を返し、handshake を始める**

   86 行目で detect-angular の 1 秒ごとのやり直しを止めます。88 行目の `attemptBackendHandshake` は 500ms ごとに `handshake` を送り、`backendReady` が返るまで続けます（[第 3 回](03-devtools-messaging.md)）。

📄 `angular/devtools/projects/shell-browser/src/app/background.ts` L76–101 （▶ の行: 77, 82, 84, 88–89）

```ts
 76 │   chrome.runtime.onMessage.addListener((req: AngularDetection, sender) => {
 77 ▶     if (!req.isAngularDevTools) {
 78 │       return;
 79 │     }
 80 │ 
 81 │     if (sender && sender.tab) {
 82 ▶       browserAction.setPopup({
 83 │         tabId: sender.tab.id,
 84 ▶         popup: `popups/${getPopUpName(req)}`,
 85 │       });
 86 │     }
 87 │ 
 88 ▶     if (sender && sender.tab && req.isAngular) {
 89 ▶       browserAction.setIcon(
 90 │         {
 91 │           tabId: sender.tab.id,
 92 │           path: {
 93 │             16: chrome.runtime.getURL(`assets/icon16.png`),
 94 │             48: chrome.runtime.getURL(`assets/icon48.png`),
 95 │             128: chrome.runtime.getURL(`assets/icon128.png`),
 96 │           },
 97 │         },
 98 │         () => {},
 99 │       );
100 │     }
101 │   });
```

📄 `angular/devtools/projects/shell-browser/src/app/background.ts` L15–26 （▶ の行: 16, 19, 22）

```ts
15 │ function getPopUpName(ng: AngularDetection): string {
16 ▶   if (!ng.isAngular) {
17 │     return 'not-angular.html';
18 │   }
19 ▶   if (!ng.isIvy || !ng.isSupportedAngularVersion) {
20 │     return 'unsupported.html';
21 │   }
22 ▶   if (!ng.isDebugMode) {
23 │     return 'production.html';
24 │   }
25 │   return 'supported.html';
26 │ }
```

background は 77 行目で印を確かめ、82〜85 行目でそのタブのポップアップ（ツールバーのアイコンを押したときの小さな画面）を決め、88〜100 行目でアイコンを色つきにします。ポップアップは 15〜26 行目の順で、Angular でない → Ivy でないか版が古い → 開発モードでない → 使える、の 4 つです。content script が 69 行目で Angular でない結果を捨てるので、この経路で 16 行目に来ることはありません。Angular でないページのポップアップは、manifest の既定の `not-angular.html` のままです。

## 5. backend.ts：handshake を 1 回だけ受けて起動する

📄 `angular/devtools/projects/shell-browser/src/app/backend.ts` L18–55 （▶ の行: 25–26, 29–31, 44, 54）

```ts
18 │ const messageBus = new SamePageMessageBus(
19 │   '[Backend=>ContentScript]',
20 │   getBackendUri(),
21 │   getContentScriptUri(),
22 │ );
23 │ 
24 │ let initialized = false;
25 ▶ messageBus.on('handshake', () => {
26 ▶   if (initialized) {
27 │     return;
28 │   }
29 ▶   initialized = true;
30 ▶   initializeMessageBus(messageBus);
31 ▶   initializeExtendedWindowOperations();
32 │ 
33 │   let inspectorRunning = false;
34 │   messageBus.on('inspectorStart', () => {
35 │     inspectorRunning = true;
36 │   });
37 │ 
38 │   messageBus.on('inspectorEnd', () => {
39 │     inspectorRunning = false;
40 │   });
41 │ 
42 │   // handles case when mouse leaves chrome extension too quickly. unHighlight() is not a very
43 │   // expensive function and has an if check so it's DOM api call is not called more than necessary
44 ▶   document.addEventListener(
45 │     'mousemove',
46 │     () => {
47 │       if (!inspectorRunning) {
48 │         removeHighlightsByType(HighlightType.InspectElement);
49 │       }
50 │     },
51 │     false,
52 │   );
53 │ 
54 ▶   messageBus.emit('backendReady');
55 │ });
```

1. **25〜29 行目：最初の `handshake` だけ**

   content script は 500ms ごとに handshake を送るので、2 回目以降は 26 行目で捨てます。
2. **30 行目：`initializeMessageBus(messageBus)`**

   ここで初めて `subscribeToClientEvents` が topic ごとの購読を並べます（[第 1 回](01-devtools-overview.md)の 3 節）。31 行目は、パネルの「ソースを見る」などで開発者ツールの `inspect()` から呼ばれる関数を `window.inspectedApplication` に置きます。
3. **44〜52 行目：マウスが動いたら光を消す**

   パネルの木の上でホバーして光らせた枠（[第 12 回](12-devtools-inspector-highlight.md)）が、マウスがページに戻ったときに残らないようにします。
4. **54 行目：`backendReady`**

   content script と background がこれを待っています（[第 3 回](03-devtools-messaging.md)）。

バックエンドは読み込まれた時点で、もう 1 つ版を読みます。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/version.ts` L9–19 （▶ の行: 9–10, 16）

```ts
 9 ▶ const versionElement = document.querySelector('[ng-version]');
10 ▶ const versionRe = /(\d+\.\d+\.\d+(-(next|rc)\.\d+)?)/;
11 │ 
12 │ const defaultVersion = '0.0.0';
13 │ let version = defaultVersion;
14 │ if (versionElement) {
15 │   version = versionElement.getAttribute('ng-version') ?? defaultVersion;
16 ▶   version = (version.match(versionRe) ?? [''])[0] ?? defaultVersion;
17 │ }
18 │ 
19 │ export const VERSION = version;
```

9 行目はファイルが読み込まれたときに 1 回だけ走ります（関数の中ではありません）。10 行目の正規表現で `22.1.6` や `17.0.0-next.3` の形だけを取り出し、取れなければ `0.0.0` です。この `VERSION` は、古い版の Angular の `LView` を直接読む道（`tree-strategies/ltree.ts`）が、ヘッダーの長さを版で切り替えるのに使います（[第 5 回](05-devtools-component-tree.md)）。

## 6. checkForAngular：ngAvailability を組み立てる

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L205–207 （▶ の行: 205–206）

```ts
205 ▶ const checkForAngularCallback = (messageBus: MessageBus<Events>) => () =>
206 ▶   checkForAngular(messageBus);
207 │ 
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L364–387 （▶ の行: 365–366, 368–369, 372–373, 376, 378, 384）

```ts
364 │ const checkForAngular = (messageBus: MessageBus<Events>): void => {
365 ▶   const ngVersion = getAngularVersion();
366 ▶   const appIsIvy = appIsAngularIvy();
367 │ 
368 ▶   if (!ngVersion) {
369 ▶     return;
370 │   }
371 │ 
372 ▶   if (appIsIvy && appIsAngularInDevMode() && appIsSupportedAngularVersion()) {
373 ▶     getDirectiveForestManager();
374 │   }
375 │ 
376 ▶   const devMode = appIsAngularInDevMode();
377 │ 
378 ▶   messageBus.emit('ngAvailability', [
379 │     {
380 │       version: ngVersion.toString(),
381 │       devMode,
382 │       ivy: appIsIvy,
383 │       hydration: isHydrationEnabled(),
384 ▶       supportedApis: devMode ? getSupportedApis() : null,
385 │     },
386 │   ]);
387 │ };
```

1. **365〜370 行目：版が無ければ返事をしない**

   3 節の `getAngularVersion` が null なら、369 行目で何も送らずに戻ります。パネルは返事が来るまで問い合わせを続けます（8 節）。
2. **372〜374 行目：使えるなら木の係を作っておく**

   `getDirectiveForestManager()` はコンポーネントの木を集める係を最初の 1 回だけ作ります（[第 5 回](05-devtools-component-tree.md)）。
3. **378〜386 行目：返事**

   3 節の関数の結果をそのまま詰め、384 行目で開発モードのときだけ `getSupportedApis()` を呼び、そうでなければ `null` を入れます。7 節の関数はどれも最初に `ngDebugClient()` を呼び、`window.ng` が無ければ投げるので（16〜20 行目）、本番モードのページでここを呼ばないことが投げない理由になっています。

同じ 3 つの条件は、バックエンドの起動のときにも使われています。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L149–161 （▶ の行: 149–150, 157–159）

```ts
149 ▶   if (appIsAngularInDevMode() && appIsSupportedAngularVersion() && appIsAngularIvy()) {
150 ▶     inspector.ref = setupInspector(messageBus);
151 │ 
152 │     // Often websites have `scroll` event listener which triggers
153 │     // Angular's change detection. We don't want to constantly send
154 │     // update requests, instead we want to request an update at most
155 │     // once every 250ms
156 │     runOutsideAngular(() => {
157 ▶       getProfiler(config?.depsForTestOnly)
158 ▶         .changeDetection$.pipe(debounceTime(250))
159 ▶         .subscribe(() => messageBus.emit('componentTreeDirty'));
160 │     });
161 │   }
```

149 行目の 3 つがそろったときだけ、ページの要素を選ぶ inspector を作り、157〜159 行目で変更検知のたびに（250ms にまとめて）`componentTreeDirty` をパネルに送ります。どれか 1 つでも false なら、topic ごとの購読は並ぶのに、パネルの木が自分から更新されることはありません。

## 7. supportedApis：window.ng にある関数から使える機能を決める

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/ng-debug-api/ng-debug-api.ts` L14–52 （▶ の行: 16–17, 21, 29, 35, 38, 41, 44, 47）

```ts
14 │ /** Returns a handle to window.ng APIs (global angular debugging). */
15 │ export const ngDebugClient = () => {
16 ▶   if (typeof (window as any).ng === 'undefined') {
17 ▶     throw new AngularDevtoolsError(
18 │       'Angular debugging APIs are not available. Ensure that your Angular app is in development mode and does not invoke `enableProdMode()`.',
19 │     );
20 │   }
21 ▶   return (window as any).ng as Partial<GlobalUtils>;
22 │ };
23 │ 
24 │ /** Type guard that checks whether a given debug API is supported within window.ng */
25 │ export function ngDebugApiIsSupported<T extends Partial<GlobalUtils>, K extends keyof T>(
26 │   ng: T,
27 │   api: K,
28 │ ): ng is T & Record<K, NonNullable<T[K]>> {
29 ▶   return typeof ng[api] === 'function';
30 │ }
31 │ 
32 │ /** Checks whether Dependency Injection debug API is supported within window.ng */
33 │ export function ngDebugDependencyInjectionApiIsSupported(): boolean {
34 │   const ng = ngDebugClient();
35 ▶   if (!ngDebugApiIsSupported(ng, 'getInjector')) {
36 │     return false;
37 │   }
38 ▶   if (!ngDebugApiIsSupported(ng, 'ɵgetInjectorResolutionPath')) {
39 │     return false;
40 │   }
41 ▶   if (!ngDebugApiIsSupported(ng, 'ɵgetDependenciesFromInjectable')) {
42 │     return false;
43 │   }
44 ▶   if (!ngDebugApiIsSupported(ng, 'ɵgetInjectorProviders')) {
45 │     return false;
46 │   }
47 ▶   if (!ngDebugApiIsSupported(ng, 'ɵgetInjectorMetadata')) {
48 │     return false;
49 │   }
50 │ 
51 │   return true;
52 │ }
```

16〜20 行目：`window.ng` が無ければ `AngularDevtoolsError` を投げます。29 行目の `ngDebugApiIsSupported` は `typeof ng[api] === 'function'` だけです。注入器の木（`dependencyInjection`）は 35〜49 行目の 5 つの関数がそろって初めて true になります。1 つでも欠けた古い版では Injector Tree のタブが出ません。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/ng-debug-api/ng-debug-api.ts` L54–85 （▶ の行: 61, 63, 66, 75–77, 84）

```ts
54 │ /** Checks whether Profiler API is supported within window.ng */
55 │ export function ngDebugProfilerApiIsSupported(): boolean {
56 │   const ng = ngDebugClient();
57 │ 
58 │   // Temporary solution. Convert to an eligible API when available.
59 │   // https://github.com/angular/angular/pull/60585#discussion_r2017047132
60 │   // If there is a Wiz application, make Profiler API unavailable.
61 ▶   const roots = getAppRoots().filter((el) => ng.getComponent?.(el));
62 │   return (
63 ▶     !!roots.length &&
64 │     !roots.some((el) => {
65 │       const comp = ng.getComponent!(el)!;
66 ▶       return ng.getDirectiveMetadata?.(comp)?.framework === Framework.Wiz;
67 │     })
68 │   );
69 │ }
70 │ 
71 │ /** Checks whether Router API is supported within window.ng */
72 │ export function ngDebugRoutesApiIsSupported(): boolean {
73 │   const ng = ngDebugClient();
74 │   return (
75 ▶     ngDebugApiIsSupported(ng, 'ɵgetLoadedRoutes') &&
76 ▶     ngDebugApiIsSupported(ng, 'ɵgetRouterInstance') &&
77 ▶     ngDebugApiIsSupported(ng, 'ɵnavigateByUrl')
78 │   );
79 │ }
80 │ 
81 │ /** Checks whether Signal Graph API is supported within window.ng */
82 │ export function ngDebugSignalGraphApiIsSupported(): boolean {
83 │   const ng = ngDebugClient();
84 ▶   return ngDebugApiIsSupported(ng, 'ɵgetSignalGraph');
85 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/ng-debug-api/ng-debug-api.ts` L87–111 （▶ の行: 93, 101, 104, 108）

```ts
 87 │ /**
 88 │  * Checks if transfer state is available.
 89 │  * Transfer state is only relevant when Angular app uses Server-Side Rendering.
 90 │  */
 91 │ export function ngDebugTransferStateApiIsSupported(): boolean {
 92 │   const ng = ngDebugClient();
 93 ▶   return ngDebugApiIsSupported(ng, 'ɵgetTransferState');
 94 │ }
 95 │ 
 96 │ /** Checks whether signal properties inspection API is supported within window.ng */
 97 │ export function ngDebugSignalPropertiesInspectionApiIsSupported(): boolean {
 98 │   const ng = ngDebugClient();
 99 │ 
100 │   // If all apps are Angular, make the API available.
101 ▶   const roots = getAppRoots().filter((el) => ng.getComponent?.(el));
102 │   return (
103 │     !!roots.length &&
104 ▶     roots.every((el) => {
105 │       const comp = ng.getComponent!(el)!;
106 │       const fw = ng.getDirectiveMetadata?.(comp)?.framework;
107 │       // `framework` might be optional in the case of `AngularDirectiveDebugMetadata`.
108 ▶       return !fw || fw === Framework.Angular;
109 │     })
110 │   );
111 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/ng-debug-api/supported-apis.ts` L24–40 （▶ の行: 25, 28, 32）

```ts
24 │ export function getSupportedApis(): SupportedApis {
25 ▶   const profiler = ngDebugProfilerApiIsSupported();
26 │   const dependencyInjection = ngDebugDependencyInjectionApiIsSupported();
27 │   const routes = ngDebugRoutesApiIsSupported();
28 ▶   const signals = ngDebugSignalGraphApiIsSupported();
29 │   const transferState = ngDebugTransferStateApiIsSupported();
30 │   const signalPropertiesInspection = ngDebugSignalPropertiesInspectionApiIsSupported();
31 │ 
32 ▶   return {
33 │     profiler,
34 │     dependencyInjection,
35 │     routes,
36 │     signals,
37 │     transferState,
38 │     signalPropertiesInspection,
39 │   };
40 │ }
```

| 項目 | true になる条件 | 行（ng-debug-api.ts） |
| --- | --- | --- |
| `profiler` | `getComponent` が返すルートが 1 つ以上あり、そのどれも Wiz でない | 61〜68 |
| `dependencyInjection` | `getInjector` と 4 つの `ɵ` 関数がすべてある | 35〜51 |
| `routes` | `ɵgetLoadedRoutes`・`ɵgetRouterInstance`・`ɵnavigateByUrl` がある（ルーターが置く。[第 1 回](01-devtools-overview.md)の 4 節） | 74〜78 |
| `signals` | `ɵgetSignalGraph` がある | 84 |
| `transferState` | `ɵgetTransferState` がある | 93 |
| `signalPropertiesInspection` | ルートが 1 つ以上あり、すべてが Angular（`framework` が無いか Angular） | 101〜109 |

61 行目と 101 行目の `.filter((el) => ng.getComponent?.(el))` が、ef09d108f23（2026-09-02）で足された行です（テストと直し方の節）。

## 8. パネル：500ms ごとに聞き、最初の返事で画面を決める

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools.component.ts` L72–104 （▶ の行: 76, 79–81, 83, 91–93, 99, 102）

```ts
 72 │   readonly supportedVersion = computed(() => {
 73 │     const {majorVersion, ivy} = this.appData();
 74 │     // Check that major version is either greater or equal to the last supported version
 75 │     // or that the major version is 0 for the (0.0.0-PLACEHOLDER) dev build case.
 76 ▶     return (majorVersion >= LAST_SUPPORTED_VERSION || majorVersion === 0) && ivy;
 77 │   });
 78 │ 
 79 ▶   private interval$ = interval(500).subscribe((attempt) => {
 80 ▶     if (attempt === DETECT_ANGULAR_ATTEMPTS) {
 81 ▶       this.angularStatus.set(AngularStatus.DOES_NOT_EXIST);
 82 │     }
 83 ▶     this.messageBus.emit('queryNgAvailability');
 84 │   });
 85 │ 
 86 │   constructor() {
 87 │     inject(ThemeService).initializeThemeWatcher();
 88 │     inject(BrowserStylesService).initBrowserSpecificStyles();
 89 │     inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
 90 │ 
 91 ▶     this.messageBus.once('ngAvailability', ({version, devMode, ivy, hydration, supportedApis}) => {
 92 ▶       this.angularStatus.set(version ? AngularStatus.EXISTS : AngularStatus.DOES_NOT_EXIST);
 93 ▶       this.appData.init({
 94 │         version,
 95 │         devMode,
 96 │         ivy,
 97 │         hydration,
 98 │       });
 99 ▶       this.interval$.unsubscribe();
100 │ 
101 │       if (supportedApis) {
102 ▶         this.supportedApis.init(supportedApis);
103 │       }
104 │     });
```

1. **79〜84 行目：500ms ごとに `queryNgAvailability`**

   コンポーネントができた瞬間から問い合わせます。80〜81 行目で 20 回目（10 秒後）に「無い」に切り替えますが、83 行目の送信は止めません。あとから Angular が起動すれば、まだ答えを受けられます。
2. **91 行目：`once` で最初の返事だけ**

   92 行目で状態を決め、93〜98 行目でアプリの情報を 1 回だけ設定し、99 行目で問い合わせを止め、102 行目で `supportedApis` を設定します（本番モードでは null なので設定しません）。2 回目以降の返事は聞きません。
3. **76 行目：タブを出すには版と Ivy の両方**

   メジャー版が 12 以上か 0、かつ `ivy` が true のときだけ、タブが並びます。そうでなければ「only supports Angular versions 12 and above」です。開発モードでなければ、その手前で「production configuration」の画面になります。

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/devtools-tabs.component.ts` L89–107 （▶ の行: 91, 93, 96, 99, 102）

```ts
 89 │   protected readonly tabs = computed<Tab[]>(() => {
 90 │     const supportedApis = this.supportedApis();
 91 ▶     const tabs: Tab[] = ['Components'];
 92 │ 
 93 ▶     if (supportedApis.profiler) {
 94 │       tabs.push('Profiler');
 95 │     }
 96 ▶     if (supportedApis.dependencyInjection) {
 97 │       tabs.push('Injector Tree');
 98 │     }
 99 ▶     if (supportedApis.routes && this.routes().length > 0) {
100 │       tabs.push('Router Tree');
101 │     }
102 ▶     if (this.appData().hydration) {
103 │       tabs.push('Transfer State');
104 │     }
105 │ 
106 │     return tabs;
107 │   });
```

タブの並びは `supportedApis` からそのまま決まります。Components は 91 行目で必ず出し、Profiler は 93 行目、Injector Tree は 96 行目、Router Tree は 99 行目（さらにルートが 1 つ以上あるとき）です。Transfer State だけは 102 行目で `supportedApis.transferState` ではなく `appData().hydration`（3 節の `isHydrationEnabled`）を見ています。

## 9. DEMO：場面ごとの検出と ngAvailability

> **🧪 DEMO — angular-check の返り値と ngAvailability（記録の再生）**
>
> これは記録です。本物の devtools のソース（angular/angular の `devtools/`、8576f161ae4）を、本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かした結果です。場面ごとに別のプロセスで、アプリを描画 → shared-utils の 6 つの関数を呼ぶ → 本物のバックエンドに `queryNgAvailability` を渡す、の順に記録しました（共通の部品は[第 1 回](01-devtools-overview.md)に全文）。「ポップアップ」と「パネルの画面」の 2 行だけは、4 節と 8 節の分かれ道をこの表のために書き直した**移植**です。
>
> 場面のボタンを押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-detect)

記録から読み取れることです。

1. **「ɵgetSignalGraph が無い」：変わるのは `signals` の 1 つだけ**

   7 節の 84 行目のとおり、関数が 1 つ欠けると、その機能だけが false になります。パネルは signal のグラフのボタンを出しません（[第 17 回](17-devtools-signal-graph.md)）。ほかの機能には影響しません。
2. **「本番モード」の 2 つ：`appIsAngular` と `appIsAngularIvy` は true のまま**

   `ng-version` と `__ngContext__` は本番モードでも付くので、変わるのは `appIsAngularInDevMode` だけです。返事は `devMode: false`・`supportedApis: null` で、ポップアップは `production.html`、パネルは「production configuration」の画面になります。JIT の場面で `window.ng` に残る `ɵcompilerFacade` は compiler が置くもので、`getComponent` が無いので 49〜50 行目の判定は false です。
3. **「よその要素（後ろ）」：何も変わらない**

   3 節の関数は最初の `[ng-version]` しか見ず、7 節の関数は 61・101 行目で `getComponent` が null を返す要素を外すからです。
4. **「よその要素（前）」：版が `0.0.0-PLACEHOLDER` になり、Ivy が false になる**

   最初の `[ng-version]` がよその要素になり、その要素には `__ngContext__` が無いからです。返事は `ivy: false` で、パネルは 8 節の 76 行目で「only supports Angular versions 12 and above」を出し、ポップアップは `unsupported.html` になります。さらに 6 節の 149 行目の条件が false なので、バックエンドは inspector も `componentTreeDirty` も用意しません。`supportedApis` の 6 つが true のままなのと対照的です。

📄 `scratchpad の記録スクリプト（a/detect.ts。場面ごとに node detect.mjs と場面の名前で実行）`

```
// devtools-detect の記録: 場面ごとに別のプロセスで走らせ、shared-utils の angular-check の返り値と、
// queryNgAvailability への backend の返事 ngAvailability を記録する。
// 使い方: node ../_shared/build.mjs detect.ts detect.mjs && for s in dev no-signal-graph foreign-after foreign-before prod prod-aot; do node detect.mjs $s; done
import './prod-prelude';
import { Component, signal } from '@angular/core';
import { bootApp, makeBus, loadBackend, tick, writeJson, clone } from '../_shared/harness';
import {
  appIsAngular,
  appIsAngularInDevMode,
  appIsAngularIvy,
  appIsSupportedAngularVersion,
  getAngularVersion,
  isHydrationEnabled,
} from '~/angular-research/angular/devtools/projects/shared-utils';

const scenario = process.argv[2] ?? 'dev';

@Component({ selector: 'app-root', template: '<p>{{ n() }}</p>' })
class Root {
  n = signal(1);
}

// Angular でない要素が ng-version を持っている場面（拡張や他のライブラリが置いた要素の代わり）
const foreign = '<foreign-widget ng-version="0.0.0-PLACEHOLDER"></foreign-widget>';
const html =
  scenario === 'foreign-after'
    ? `<html><head></head><body><app-root></app-root>${foreign}</body></html>`
    : scenario === 'foreign-before'
      ? `<html><head></head><body>${foreign}<app-root></app-root></body></html>`
      : undefined;

const result: any = { scenario, ngDevMode: (globalThis as any).ngDevMode === false ? false : 'object（開発モード）' };
try {
  await bootApp(Root, { html });
} catch (e) {
  result.bootError = String(e);
}
const g = globalThis as any;
result.windowNgKeys = g.ng === undefined ? null : Object.keys(g.ng).sort();
if (scenario === 'prod-aot') {
  // AOT の本番ビルドには JIT コンパイラが入らないので、window.ng（JIT の ɵcompilerFacade だけが入っている）も無い。その代わりに消す
  delete g.ng;
}
if (scenario === 'no-signal-graph' && g.ng) {
  // window.ng の 1 つの関数だけを消す（記録のスクリプトの中だけ。古い版の Angular の代わり）
  delete g.ng.ɵgetSignalGraph;
}
result.ngVersionElements = Array.from(document.querySelectorAll('[ng-version]')).map((el) => ({
  tag: el.tagName.toLowerCase(),
  ngVersion: el.getAttribute('ng-version'),
  hasNgContext: typeof (el as any).__ngContext__ !== 'undefined',
}));
result.windowNg = g.ng === undefined ? null : Object.keys(g.ng).length;
result.angularCheck = {
  getAngularVersion: getAngularVersion(),
  appIsAngular: appIsAngular(),
  appIsSupportedAngularVersion: appIsSupportedAngularVersion(),
  appIsAngularInDevMode: appIsAngularInDevMode(),
  appIsAngularIvy: appIsAngularIvy(),
  isHydrationEnabled: isHydrationEnabled(),
};

try {
  const { initializeMessageBus } = await loadBackend();
  result.backendLoaded = true;
  const { bus, send, take } = makeBus();
  try {
    initializeMessageBus(bus as any);
    send('queryNgAvailability');
    await tick(10);
    result.replies = take();
  } catch (e) {
    result.error = `${(e as Error).name}: ${(e as Error).message}`;
    result.replies = take();
  }
} catch (e) {
  result.backendLoaded = false;
  result.error = `${(e as Error).name}: ${(e as Error).message}`;
}
await writeJson(new URL(`./detect-${scenario}.json`, import.meta.url).pathname, clone(result));
process.exit(0);

```

📄 `scratchpad の記録スクリプト（a/prod-prelude.ts。detect.ts の先頭で import）`

```
// 「本番モード」の場面だけ、@angular/core を読み込む前に ngDevMode を false にする（enableProdMode や本番ビルドの define と同じ値）。
// ESM の import は書いた順に評価されるので、detect.ts の先頭でこのファイルを import する。
if (process.argv[2] === 'prod' || process.argv[2] === 'prod-aot') (globalThis as any).ngDevMode = false;

```

## ここまでの呼び出し

- 👤 `ページを開く` — あなたのブラウザ — *アプリが ng-version 付きのルートを描く*
  - `ng-validate.ts` → `<script src="detect_angular_bundle.js">` — content script（isolated world） — *13〜15 行目*
    - `detectAngular(window)` — detect-angular.ts（main world） — *angular-check の 4 つ → detectAngular を送る。1 秒ごと*
      - `on('detectAngular')` — content-script.ts — *79 行目で background へ、82〜83 行目で backend を差し込む*
        - `chrome.runtime.onMessage` → `setPopup`・`setIcon` — background.ts — *getPopUpName*
        - `on('handshake')` → `initializeMessageBus()` → `emit('backendReady')` — backend.ts（main world） — *第 3 回*
- 👤 `「Angular」のタブを開く` — 開発者ツール
  - `interval(500)` → `emit('queryNgAvailability')` — ng-devtools/src/lib/devtools.component.ts — *79〜84 行目*
    - `checkForAngular()` → `getSupportedApis()` — client-event-subscribers.ts・supported-apis.ts — *ngAvailability を返す*
  - `once('ngAvailability')` → `angularStatus`・`appData`・`supportedApis` — devtools.component.ts — *画面とタブが決まる*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| shared-utils/src/lib/angular-check.spec.ts | describe `angular-check`（21 行目）の下に `getAngularVersion`（24）・`appIsSupportedAngularVersion`（31）・`appIsAngular`（52）・`appIsAngularIvy`（63）・`appIsAngularInDevMode`（86） | `//devtools/projects/shared-utils:test`（arrayEquals の spec と合わせて 22 件） |
| ng-devtools-backend/src/lib/shared/ng-debug-api/ng-debug-api.spec.ts・supported-apis.spec.ts | describe `ng-debug-api`（61 行目）の下に機能ごとの describe 5 つ。it `should ignore elements where getComponent returns null (e.g. extension elements)`（119・213）。describe `supported-apis`（11） | `//devtools/projects/ng-devtools-backend/src/lib/shared/ng-debug-api:ng-debug-api_test`（16 件） |
| ng-devtools/src/lib/devtools.component.spec.ts | describe `DevtoolsComponent`（64 行目）。`angularStatus` の 3 つの値と版・開発モードで、どの画面が出るかの 5 件 | `//devtools/projects/ng-devtools/src/lib:test`（5 件） |

📄 `angular/devtools/projects/shared-utils/src/lib/angular-check.spec.ts` L63–84 （▶ の行: 65, 68–69, 79, 81）

```ts
63 │   describe('appIsAngularIvy', () => {
64 │     it('should not recognize VE apps', () => {
65 ▶       (window as any).ng = {
66 │         probe(): void {},
67 │       };
68 ▶       setNgVersion();
69 ▶       expect(appIsAngularIvy()).toBeFalse();
70 │     });
71 │ 
72 │     it('should not recognize no Angular apps', () => {
73 │       expect(appIsAngularIvy()).toBeFalse();
74 │     });
75 │ 
76 │     it('should recognize Ivy apps', () => {
77 │       const el = document.createElement('div');
78 │       el.setAttribute('ng-version', '0.0.0-PLACEHOLDER');
79 ▶       (el as any).__ngContext__ = 0;
80 │       document.body.append(el);
81 ▶       expect(appIsAngularIvy()).toBeTrue();
82 │       el.remove();
83 │     });
84 │   });
```

Ivy の判定の spec です。65〜69 行目は `window.ng` に `probe` だけを置いた View Engine の代わりで、`__ngContext__` が無いので false。79〜81 行目は `__ngContext__` を手で置いた要素で true です。3 節の注意（よその要素が前にある場合）を確かめる it はありません。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/ng-debug-api/ng-debug-api.spec.ts` L119–135 （▶ の行: 120–121, 126, 129）

```ts
119 │     it('should ignore elements where getComponent returns null (e.g. extension elements)', () => {
120 ▶       const foreignRoot = document.createElement('foreign-extension-app');
121 ▶       foreignRoot.setAttribute('ng-version', '0.0.0-PLACEHOLDER');
122 │       document.body.appendChild(foreignRoot);
123 │ 
124 │       try {
125 │         const fakeNg = fakeNgGlobal(Framework.Angular);
126 ▶         const originalGetComponent = fakeNg.getComponent!;
127 │         fakeNg.getComponent = (el) => (el === foreignRoot ? null : originalGetComponent(el));
128 │         (globalThis as any).ng = fakeNg;
129 ▶ 
130 │         expect(ngDebugProfilerApiIsSupported()).toBeTrue();
131 │       } finally {
132 │         foreignRoot.remove();
133 │       }
134 │     });
135 │   });
```

ef09d108f23 で足された it です。120〜121 行目で `ng-version` を持つよその要素を足し、126 行目でその要素にだけ `getComponent` が null を返す偽の `ng` を作り、129 行目で profiler が true のままであることを確かめます。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //devtools/projects/shared-utils:test \
  //devtools/projects/ng-devtools-backend/src/lib/shared/ng-debug-api:ng-debug-api_test \
  //devtools/projects/ng-devtools/src/lib:test \
  --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/devtools-logs/a-tests.log）`

```
//devtools/projects/shared-utils:test_chromium   1/1 test files | 22 passed, 0 failed   PASSED in 2.4s
//devtools/projects/shared-utils:test_firefox    1/1 test files | 22 passed, 0 failed   PASSED in 5.3s
//devtools/projects/ng-devtools-backend/src/lib/shared/ng-debug-api:ng-debug-api_test_chromium  16 passed  PASSED in 2.3s
//devtools/projects/ng-devtools-backend/src/lib/shared/ng-debug-api:ng-debug-api_test_firefox   16 passed  PASSED in 5.8s
//devtools/projects/ng-devtools/src/lib:test_chromium   5 passed  PASSED in 1.4s
//devtools/projects/ng-devtools/src/lib:test_firefox    5 passed  PASSED in 2.8s
```

- 3 つのターゲットは、第 1 回の表のほかの 4 つと同じ 1 回の bazel で走らせました（全体の Elapsed は 47.4 秒）。件数は Chromium と Firefox で同じです。
- it の名前での絞り込み（`--test_filter`）は効かなかったので、ターゲット全体を走らせています（[第 1 回](01-devtools-overview.md)）。

### 最近の修正を 2 つ読む

- **ef09d108f23（2026-09-02、#70515）よその要素を安全に扱う。** 前は 61 行目と 101 行目が `getAppRoots()` の結果をそのまま使い、よその要素について `ng.getComponent(el)` が null を返すと、65・105 行目の `ng.getDirectiveMetadata(null)` が core の中で投げていました（PR の説明では、IP Protect という Chrome の拡張が差し込む要素で起きたとあります）。後は `.filter((el) => ng.getComponent?.(el))` で先に外します。同じコミットで、`component-tree.ts` の `getDirectiveMetadata` も `dir` が無いときに呼ばないようになり（[第 5 回](05-devtools-component-tree.md)）、spec は上の 2 件と `component-tree.spec.ts` に 1 件が足されています。
- **1a2bcb2295c（2026-07-27）本番モードでプロファイラーを始めない。** 前の `profiling/performance-track.ts` は、ファイルの一番外側で `getProfiler().subscribe(…)` を呼んでいました。`getProfiler` の中は `ngDebugClient()`（7 節の 16〜20 行目）なので、`window.ng` の無いページではファイルを読み込んだだけで投げます。後はその購読を `enablePerformanceTrack()` の中の `initializePerformanceTrack()` に移し、Performance パネルの記録を有効にしたときに初めて呼びます（[第 15 回](15-devtools-cd-analyzer.md)）。spec は `performance-track.spec.ts`（新規、1 件）と、それを走らせる BUILD のターゲット `performance_track_test` です。前と後を、`window.ng` の無いページで読み込んで比べた記録です。

| 版 | window.ng | 読み込みで投げたか | 例外 |
| --- | --- | --- | --- |
| 前（1a2bcb2295c^） | `undefined` | 投げた | ``AngularDevtoolsError: Angular debugging APIs are not available. Ensure that your Angular app is in development mode and does not invoke `enableProdMode()`.`` |
| 後（8576f161ae4） | `undefined` | 投げない | — |

`backend_bundle.js` は 1 つのファイルに束ねられているので、その中の 1 つのファイルが読み込みで投げると、`backend.ts` の 25 行目の `handshake` の購読まで届きません。すると content script は handshake を送り続け、パネルは返事を受けられないまま 8 節の 80〜81 行目で「Angular application not detected.」になります。1a2bcb2295c の前は、`window.ng` の無い本番のページ（JIT コンパイラを含まない AOT のビルド）で、「production configuration」ではなくこの画面になる順番でした。

📄 `scratchpad の記録スクリプト（a/perf-track.ts。前の版は git show で写したもの）`

```
// devtools-detect の「テストと直し方」用の記録: 1a2bcb2295c（本番モードでプロファイラーを始めない）の前と後で、
// window.ng が無いページ（AOT の本番ビルドの代わり）で performance-track.ts を読み込んだときに投げるかを比べる。
// 前の版は `git show 1a2bcb2295c^:…/performance-track.ts` を old/ に写し、相対 import を絶対パスに書き換えただけのもの。
// 使い方: node ../_shared/build.mjs perf-track.ts perf-track.mjs && node perf-track.mjs before && node perf-track.mjs after
import './prod-prelude';
import { Component } from '@angular/core';
import { bootApp, writeJson } from '../_shared/harness';

const which = process.argv[3] ?? process.argv[2];
@Component({ selector: 'app-root', template: '<p>prod</p>' })
class Root {}
await bootApp(Root);
delete (globalThis as any).ng;
const result: any = { which, windowNg: typeof (globalThis as any).ng };
try {
  if (which === 'before') await import('./old/performance-track.before-1a2bcb2295c');
  else await import('~/angular-research/angular/devtools/projects/ng-devtools-backend/src/lib/profiling/performance-track');
  result.importThrew = false;
} catch (e) {
  result.importThrew = true;
  result.error = `${(e as Error).name}: ${(e as Error).message}`;
}
await writeJson(new URL(`./perf-track-${which}.json`, import.meta.url).pathname, result);
process.exit(0);

```

### 直すとしたら

- 「Angular なのに見つからない」「版が違う」は `shared-utils/src/lib/angular-check.ts` です。3 節の注意（最初の 1 つしか見ない）を直すなら、`getAppRoots` のように全部の `[ng-version]` を見て `__ngContext__` のあるものを選ぶ形になります。spec は `angular-check.spec.ts` の `appIsAngularIvy` の describe に、よその要素を先に置いた it を足します。
- 「タブが出ない」は 7 節の判定と 8 節の `tabs` です。spec は `ng-debug-api.spec.ts` の `fakeNgGlobal` で関数を出し入れします。
- 「本番モードで変な画面」は、バックエンドの中で `window.ng` を読み込み時に触っていないかを探します。1a2bcb2295c と同じ形の不具合は、`ngDebugClient()` がファイルの一番外側で呼ばれていないかを `grep` すれば見つかります。
- 本家に PR を出すことは勧めません。issue を読むときは、まずポップアップ（4 節）とパネルの画面（8 節）のどちらの話かを分け、記録の場面と同じ条件（よその要素・window.ng の関数の有無・本番モード）を当てはめると、どの行の判定で分かれたかが分かります（[第 20 回](20-devtools-issues.md)）。

## 聞かれそうな質問

**Q. DevTools は Angular の版をどうやって知るのですか？**

DOM の `ng-version` 属性です。`component_ref.ts` の 449〜450 行目がルートの要素に付け、`angular-check.ts` の 55〜59 行目が最初の `[ng-version]` の値を読みます。`window.ng` には版を返す関数はありません。

**Q. 開発モードかどうかはどこで分けていますか？**

`window.ng` がオブジェクトで `getComponent` を持つかどうかです（`angular-check.ts` の 49〜50 行目）。`ngDevMode` の値を直接見てはいません。`window.ng` は開発モードでだけ置かれるので（[第 1 回](01-devtools-overview.md)）、結果として同じになります。

**Q. 本番モードのページにもバックエンドは差し込まれますか？**

差し込まれます。content script の 69 行目は `isAngular` だけを見るからです。バックエンドは `devMode: false`・`supportedApis: null` の `ngAvailability` を返し（384 行目）、パネルはそれで「production configuration」の画面を出します。1a2bcb2295c の前は、`window.ng` の無いページでバックエンドの読み込みが投げていました。

**Q. 古い Angular で、Injector Tree のタブだけが出ません。**

`dependencyInjection` は `ng-debug-api.ts` の 35〜49 行目の 5 つの関数がすべてあるときだけ true になるからです。1 つでも無い版では false で、タブは `devtools-tabs.component.ts` の 96 行目で足されません。

**Q. パネルを開いても「Angular application not detected.」のままです。何を疑いますか？**

パネルは `ngAvailability` を 1 回も受け取れていません（8 節の 80〜81 行目）。バックエンドが返事をしないのは、版が見つからないとき（369 行目）か、バックエンドが起動していない（handshake が届かない・読み込みで投げた）ときです。前者は `[ng-version]` の有無、後者は第 3 回の道のどこで止まったかを見ます。

## 読み終えて

- 検出は 2 回：ページを読み込んだときの `detect-angular`（アイコンと差し込み）と、パネルの問い合わせに答える `checkForAngular`（`ngAvailability`）。
- 見ているのは DOM の最初の `[ng-version]`・その要素の `__ngContext__`・`window.ng` の関数の有無だけです。
- `supportedApis` は機能ごとに必要な `window.ng` の関数がそろっているかで決まり、タブの並びを決めます。
- パネルは最初の `ngAvailability` 1 回で画面を決め、返事が無いあいだは 500ms ごとに聞き続けます。

---

← 前: [DevTools の全体像：ページ・content script・background・パネル](01-devtools-overview.md)  
次: [メッセージの道：ページから DevTools のパネルまで](03-devtools-messaging.md) →
