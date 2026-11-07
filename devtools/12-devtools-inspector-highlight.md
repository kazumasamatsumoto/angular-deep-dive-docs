[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 12 回 / 全 20 回

# 要素を選ぶ・光らせる：component-inspector と highlighter

> ページの上でマウスで要素を選ぶ ComponentInspector、選んだ要素やホバーした要素を枠で囲む highlighter、コンソールに $ng0 として置く set-console-reference と logValue。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-inspector-highlight)

---

DevTools には、パネルとページを行き来する操作が 3 つあります。パネルの木で行を選ぶとコンソールで `$ng0` と打てばそのコンポーネントが返ること、木の行にマウスを乗せるとページの要素が青い枠で光ること、虫めがねのボタンを押してページの上の要素をクリックすると、木のその行が選ばれることです。この章では、その 3 つを受け持つバックエンドの `setConsoleReference`・highlighter・`ComponentInspector` を行で追います。値をコンソールに出す `logValue` も読みます。

読む対象は `ng-devtools-backend/src/lib/` の `console/set-console-reference.ts`・`component-inspector/component-inspector.ts`・`shared/highlighter/`（`index.ts`・`highlights.ts`・`dom.ts`）と、`client-event-subscribers.ts` のうち `selectedComponentCallback` と `setupInspector` です。

1. [1. 全体像](01-devtools-overview.md)
2. [2. Angular を見つける](02-devtools-detect.md)
3. [3. メッセージの道](03-devtools-messaging.md)
4. [4. プロトコル](04-devtools-protocol.md)
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. [7. 同じノードを見分ける](07-devtools-identity.md)
8. [8. パネルの木](08-devtools-forest-ui.md)
9. [9. プロパティの直列化](09-devtools-state-serializer.md)
10. [10. 入れ子を開く](10-devtools-property-resolver.md)
11. [11. 値を書き換える](11-devtools-property-mutation.md)
12. **12. 選ぶ・光らせる**（この章）
13. [13. プロファイラーの記録](13-devtools-profiler-capture.md)
14. [14. 記録を描く](14-devtools-profiler-formatters.md)
15. [15. 変更検知を見張る](15-devtools-cd-analyzer.md)
16. [16. 注入器の木](16-devtools-injector-tree.md)
17. [17. signal のグラフ](17-devtools-signal-graph.md)
18. [18. ルーター・TransferState](18-devtools-router-transfer.md)
19. [19. テストとビルド](19-devtools-test-build.md)
20. [20. issue と PR を読む](20-devtools-issues.md)

## 1. メッセージの受け口

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L389–414 （▶ の行: 390, 392, 395, 398, 402–403, 405–406, 408, 410）

```ts
389 │ const setupInspector = (messageBus: MessageBus<Events>): ComponentInspector => {
390 ▶   const inspector = new ComponentInspector({
391 │     onComponentEnter: (id: number) => {
392 ▶       messageBus.emit('highlightComponent', [id]);
393 │     },
394 │     onComponentLeave: () => {
395 ▶       messageBus.emit('removeComponentHighlight');
396 │     },
397 │     onComponentSelect: (id: number) => {
398 ▶       messageBus.emit('selectComponent', [id]);
399 │     },
400 │   });
401 │ 
402 ▶   messageBus.on('inspectorStart', inspector.startInspecting);
403 ▶   messageBus.on('inspectorEnd', inspector.stopInspecting);
404 │ 
405 ▶   messageBus.on('createHighlightOverlay', (position: ElementPosition) => {
406 ▶     inspector.highlightByPosition(position);
407 │   });
408 ▶   messageBus.on('removeHighlightOverlay', () => inspector.unhighlight());
409 │ 
410 ▶   messageBus.on('enableHydrationOverlays', enableHydrationOverlays);
411 │   messageBus.on('disableHydrationOverlays', disableHydrationOverlays);
412 │ 
413 │   return inspector;
414 │ };
```

`setupInspector` は、ページの Angular が開発モードで、対応している版のときだけ呼ばれます（`subscribeToClientEvents` の中、[第 1 回](01-devtools-overview.md)の持ち場）。`ComponentInspector` を 1 つ作り、ページで起きたことを 3 つのメッセージにしてパネルへ送る関数を渡します（392・395・398 行目）。パネルからは 402〜403 行目の検査の開始と終了、405〜408 行目の「この位置を光らせる／消す」を受けます。410〜411 行目のハイドレーションの枠は [第 18 回](18-devtools-router-transfer.md)の側の話で、同じ highlighter を使います。

## 2. 木で選ぶ → コンソールの $ng0

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L245–251 （▶ の行: 245–246, 250）

```ts
245 ▶ const selectedComponentCallback = (position: ElementPosition) => {
246 ▶   const node = queryDirectiveForest(
247 │     position,
248 │     getDirectiveForestManager().getIndexedDirectiveForest(),
249 │   );
250 ▶   setConsoleReference({node, position});
251 │ };
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/console/set-console-reference.ts` L19–52 （▶ の行: 19–20, 25, 32–34, 38–39, 42–44, 49–50）

```ts
19 ▶ const CONSOLE_REFERENCE_PREFIX = '$ng';
20 ▶ const CAPACITY = 5;
21 │ 
22 │ const nodesForConsoleReference: ConsoleReferenceNode[] = [];
23 │ 
24 │ export const setConsoleReference = (referenceNode: ConsoleReferenceNode) => {
25 ▶   if (referenceNode.node === null) {
26 │     return;
27 │   }
28 │   _setConsoleReference(referenceNode);
29 │ };
30 │ 
31 │ const _setConsoleReference = (referenceNode: ConsoleReferenceNode) => {
32 ▶   prepareCurrentReferencesForInsertion(referenceNode);
33 ▶   nodesForConsoleReference.unshift(referenceNode);
34 ▶   assignConsoleReferencesFrom(nodesForConsoleReference);
35 │ };
36 │ 
37 │ const prepareCurrentReferencesForInsertion = (referenceNode: ConsoleReferenceNode) => {
38 ▶   const foundIndex = nodesForConsoleReference.findIndex((nodeToLookFor) =>
39 ▶     arrayEquals(nodeToLookFor.position, referenceNode.position),
40 │   );
41 │   if (foundIndex !== -1) {
42 ▶     nodesForConsoleReference.splice(foundIndex, 1);
43 ▶   } else if (nodesForConsoleReference.length === CAPACITY) {
44 ▶     nodesForConsoleReference.pop();
45 │   }
46 │ };
47 │ 
48 │ const assignConsoleReferencesFrom = (referenceNodes: ConsoleReferenceNode[]) => {
49 ▶   referenceNodes.forEach((referenceNode, index) =>
50 ▶     setDirectiveKey(referenceNode.node, getConsoleReferenceWithIndexOf(index)),
51 │   );
52 │ };
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/console/set-console-reference.ts` L54–70 （▶ の行: 55–58, 60–61, 63, 65）

```ts
54 │ const setDirectiveKey = (node: ComponentTreeNode | null, key: string) => {
55 ▶   Object.defineProperty(window, key, {
56 ▶     get: () => {
57 ▶       if (node?.component) {
58 ▶         return node.component.instance;
59 │       }
60 ▶       if (node?.nativeElement) {
61 ▶         return node.nativeElement;
62 │       }
63 ▶       return node;
64 │     },
65 ▶     configurable: true,
66 │   });
67 │ };
68 │ 
69 │ const getConsoleReferenceWithIndexOf = (consoleReferenceIndex: number) =>
70 │   `${CONSOLE_REFERENCE_PREFIX}${consoleReferenceIndex}`;
```

1. **245〜250 行目：位置からノードを探して渡す**

   パネルの木で行を選ぶと `setSelectedComponent` が位置（`[0, 1]` のような数の並び）で届きます。
2. **37〜46 行目：同じ位置がもうあれば外し、5 つ埋まっていれば最後を捨てる**

   20 行目の `CAPACITY = 5` です。比べるのはノードではなく**位置**（39 行目の `arrayEquals`）です。
3. **33〜34 行目：先頭に入れて、0 番から振り直す**

   いちばん新しく選んだものが `$ng0`、1 つ前が `$ng1` … `$ng4` です（Chrome の DevTools の `$0` に合わせた形）。
4. **55〜66 行目：`window` に getter を置く**

   値ではなく getter なので、コンソールで読んだときに、コンポーネントがあればそのインスタンス（58 行目）、無ければ要素（61 行目、ディレクティブだけの要素など）を返します。65 行目の `configurable: true` で、次に選んだときに置き直せます。

## 3. 光らせる：highlightElement

木の行にマウスを乗せると、パネルが `createHighlightOverlay` を位置で送り、`ComponentInspector.highlightByPosition` が呼ばれます。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/component-inspector/component-inspector.ts` L102–121 （▶ の行: 103–104, 106, 111–112, 116–119）

```ts
102 │   highlightByPosition(position: ElementPosition): void {
103 ▶     const forest: ComponentTreeNode[] = getDirectiveForestManager().getDirectiveForest();
104 ▶     const elementToHighlight = findNodeInForest(position, forest);
105 │     if (elementToHighlight) {
106 ▶       this.highlightElement(elementToHighlight);
107 │     }
108 │   }
109 │ 
110 │   unhighlight() {
111 ▶     this.currentHighlight?.destroy();
112 ▶     this.currentHighlight = null;
113 │   }
114 │ 
115 │   private highlightElement(element: Element) {
116 ▶     this.unhighlight();
117 ▶     const cmp = findDirectiveAndHost(element).directive;
118 ▶     this.currentHighlight = highlightElement(element, inspectElementHighlightTemplate, {
119 ▶       'component-name': [getDirectiveName(cmp)],
120 │     });
121 │   }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/component-tree/component-tree.ts` L846–852 （▶ の行: 846–847, 850–851）

```ts
846 ▶       const component = ng.getComponent?.(el);
847 ▶       if (component) {
848 │         return {directive: component, host: el};
849 │       }
850 ▶       const directive = ng.getDirectives?.(el)?.[0];
851 ▶       if (directive) {
852 │         return {directive, host: el};
```

要素からディレクティブを探す `findDirectiveAndHost` は component-tree.ts にあり（[第 5 回](05-devtools-component-tree.md)の持ち場）、ここでは中心の 7 行だけ引きます。要素から親へさかのぼりながら、まず `ng.getComponent`（846 行目）、無ければ `ng.getDirectives` の最初の 1 つ（850 行目）を探します。ラベルの名前は 119 行目の `getDirectiveName`（インスタンスの `constructor.name`）です。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/index.ts` L159–200 （▶ の行: 172–173, 181–182, 184, 187–189, 191–192, 197）

```ts
159 │ /**
160 │  * Highlight an element.
161 │  *
162 │  * @param targetElement Element that you want to highlight.
163 │  * @param template Template of the highlight (i.e. highlight type).
164 │  * @param props Props required for the labels, if applicable.
165 │  * @returns A `Highlight` reference.
166 │  */
167 │ export function highlightElement<T extends HighlightLabelDefinition = HighlightLabelDefinition>(
168 │   targetElement: Element,
169 │   template: HighlightTemplate<T>,
170 │   props: HighlightLabelProps<T>,
171 │ ): Highlight | null {
172 ▶   const dir = findDirectiveAndHost(targetElement).directive;
173 ▶   if (!dir) {
174 │     debugLog.warn(
175 │       'Highlighter: Unable to find the corresponding directive to the provided element -',
176 │       targetElement,
177 │     );
178 │     return null;
179 │   }
180 │ 
181 ▶   const rect = getComponentRect(targetElement);
182 ▶   if (!rect || rect.height === 0 || rect.width === 0) {
183 │     // display nothing in case the component is not visible
184 ▶     return null;
185 │   }
186 │ 
187 ▶   const {overlay, labels} = createOverlayWithLabels(template, props);
188 ▶   const highlight = new Highlight(overlay, labels, template, highlightDestroyEvents);
189 ▶   storeHighlight(targetElement, highlight);
190 │ 
191 ▶   highlight.position(rect);
192 ▶   displayElementHighlights(targetElement);
193 │ 
194 │   // NOTE: Chrome V8 is optimized to unobserve elements
195 │   // detached from the DOM that don't have any other
196 │   // strong references in the code.
197 ▶   resizeObserver.observe(targetElement);
198 │ 
199 │   return highlight;
200 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/dom.ts` L144–152 （▶ の行: 145, 148, 151）

```ts
144 │ export function getComponentRect(el: Node): DOMRect | undefined {
145 ▶   if (!(el instanceof Element)) {
146 │     return;
147 │   }
148 ▶   if (!isInDoc(el)) {
149 │     return;
150 │   }
151 ▶   return el.getBoundingClientRect();
152 │ }
```

1. **172〜179 行目：Angular のものでない要素は光らせない**
2. **181〜185 行目：大きさが 0 の要素は光らせない**

   145 行目、`HTMLElement` ではなく `Element` で見るので SVG の要素も測れます（56847dc77a5、7 節）。148 行目、文書から外れた要素は測りません。
3. **187〜189 行目：overlay の要素を作り、`Highlight` に包んで覚える**

   まだ `body` には入れていません。
4. **191〜192 行目：位置を合わせ、優先順位で 1 つだけ見せる**

   1 つの要素に複数の枠（変更検知の枠・検査の枠・ハイドレーションの枠）が重なったときの決め方が 4 節です。
5. **197 行目：`ResizeObserver` で大きさの変化を見張る**

   要素の大きさが変わると、同じファイルの上の方（引用の外）の購読が `requestAnimationFrame` の中で位置を合わせ直します。ウィンドウの `resize` も同じように見張っています。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/dom.ts` L35–71 （▶ の行: 42–46, 53, 56, 58, 61）

```ts
35 │ export function createOverlayWithLabels<T extends HighlightLabelDefinition>(
36 │   template: HighlightTemplate,
37 │   props: HighlightLabelProps<T>,
38 │ ): {
39 │   overlay: HTMLElement;
40 │   labels: Record<keyof T, HTMLElement>;
41 │ } {
42 ▶   const overlay = document.createElement('div');
43 ▶   overlay.className = OVERLAY_CLASS;
44 ▶   overlay.style.position = 'absolute';
45 ▶   overlay.style.zIndex = '2147483647';
46 ▶   overlay.style.pointerEvents = 'none';
47 │   overlay.style.display = 'grid';
48 │   overlay.style.alignItems = 'end';
49 │   overlay.style.justifyContent = 'space-between';
50 │   overlay.style.gridTemplateColumns = 'repeat(3, 1fr)';
51 │   overlay.style.gap = '2px';
52 │ 
53 ▶   switch (template.style) {
54 │     case 'fill':
55 │     default:
56 ▶       overlay.style.backgroundColor = toCSSColor(...template.overlayColor, 0.35);
57 │       break;
58 ▶     case 'outline':
59 │       {
60 │         const color = toCSSColor(...template.overlayColor, 0.5);
61 ▶         overlay.style.border = `3px solid ${color}`;
62 │         overlay.style.boxSizing = 'border-box';
63 │         overlay.style.boxShadow = `inset 0 0 10px ${color}`;
64 │       }
65 │       break;
66 │   }
67 │ 
68 │   if (template.labelsType === 'static') {
69 │     overlay.style.boxSizing = 'border-box';
70 │     overlay.style.padding = '2px';
71 │   }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/dom.ts` L109–117 （▶ の行: 113–116）

```ts
109 │ export function positionOverlayElement(dimensions: DOMRect, overlayElement: HTMLElement) {
110 │   const {width, height, top, left} = dimensions;
111 │   const style = overlayElement.style;
112 │ 
113 ▶   style.width = ~~width + 'px';
114 ▶   style.height = ~~height + 'px';
115 ▶   style.top = ~~top + window.scrollY + 'px';
116 ▶   style.left = ~~left + window.scrollX + 'px';
117 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/highlights.ts` L221–234 （▶ の行: 223–226, 229–231）

```ts
221 │ /** Template for "Inspect element" highlight. */
222 │ export const inspectElementHighlightTemplate: HighlightTemplate<InspectElementLabels> = {
223 ▶   type: HighlightType.InspectElement,
224 ▶   overlayColor: COLORS.blue,
225 ▶   labelsType: 'sticky',
226 ▶   ttl: 4000,
227 │   labels: {
228 │     ['component-name']: {
229 ▶       x: 'right',
230 ▶       offset: 'outset',
231 ▶       content: (name: string) => `<${name}>`,
232 │     },
233 │   },
234 │ };
```

overlay は `body` の直下に置く `position: absolute` の `div` で、44〜46 行目のとおりいちばん手前に出し、マウスを素通しします（`pointer-events: none`）。検査の枠は 224 行目の青で、56 行目の塗り（不透明度 0.35）です。229〜231 行目、右側にコンポーネント名のラベル `<Card>` を枠の外（`outset`）に付けます。113〜116 行目の `~~` は小数を切り捨てて整数にする書き方です（7 節）。226 行目の `ttl: 4000` は、4 秒たつと枠が自分で消える設定です（5 節）。

## 4. 1 つの要素に枠が重なったら：優先順位

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/highlights.ts` L80–91 （▶ の行: 82–84, 86–88）

```ts
80 │ // Add a new type for each new template.
81 │ //
82 ▶ // WARNING: The enum numeric value matters. It's used for establishing
83 ▶ // a priority when a single target element has multiple highlights.
84 ▶ // The smaller the number, the higher the priority.
85 │ export enum HighlightType {
86 ▶   ChangeDetection = 0,
87 ▶   InspectElement = 1,
88 ▶   HydrationSkipped = 2,
89 │   HydrationMismatched = 3,
90 │   HydrationCompleted = 4,
91 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/index.ts` L147–157 （▶ の行: 149–151, 153–155）

```ts
147 │ /** Store the `Highlight` in the active highlights data structures. */
148 │ function storeHighlight(targetElement: Element, highlight: Highlight) {
149 ▶   const currentHighlights = activeHighlights.get(targetElement) ?? [];
150 ▶   currentHighlights.push(highlight);
151 ▶   highlightsRegistry.register(targetElement, highlight, highlight);
152 │ 
153 ▶   if (currentHighlights.length === 1) {
154 ▶     activeHighlights.set(targetElement, currentHighlights);
155 ▶     targetElements.push(new WeakRef(targetElement));
156 │   }
157 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/index.ts` L268–284 （▶ の行: 278–279, 281–282）

```ts
268 │ /**
269 │  * Determines the highlight with the highest priority and
270 │  * renders it. The rest are hidden.
271 │  */
272 │ function displayElementHighlights(targetElement: Element) {
273 │   const highlights = activeHighlights.get(targetElement);
274 │   if (!highlights || !highlights.length) {
275 │     return;
276 │   }
277 │ 
278 ▶   const prioritizedHighlights = highlights.sort((a, b) => a.type - b.type);
279 ▶   prioritizedHighlights[0].display();
280 │ 
281 ▶   for (let i = 1; i < prioritizedHighlights.length; i++) {
282 ▶     prioritizedHighlights[i].hide();
283 │   }
284 │ }
```

枠は要素ごとの配列（`activeHighlights`、`WeakMap`）に入り、151 行目で `FinalizationRegistry` にも登録されます（要素がガベージコレクションで消えたら枠も消す）。278 行目で `type` の小さい順に並べ、279 行目で先頭だけ `display`、残りは 282 行目で `hide`。82〜84 行目のコメントのとおり、enum の数が優先順位です。変更検知の枠（0、[第 15 回](15-devtools-cd-analyzer.md)）が検査の枠（1）より、検査の枠がハイドレーションの枠（2〜4）より前に出ます。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/highlights.ts` L127–150 （▶ の行: 139–140, 143, 147–149）

```ts
127 │   /**
128 │    * Remove the highlight.
129 │    */
130 │   destroy() {
131 │     // Since there is a chance that there are references
132 │     // outside of `highlighter.ts`, we store the destroy state.
133 │     // Ideally, we should clean up all references.
134 │     // Getting the warning, means that there MIGHT be a problem
135 │     // with the code (i.e. there is chance for a memory leak).
136 │     // However, this could be a false positive since GC passes
137 │     // are not guaranteed to happen immediately.
138 │     // This is merely a warning to be diligent with references storing.
139 ▶     if (this.destroyed) {
140 ▶       debugLog.warn('The highlight has already been destroyed. Check references storing.');
141 │       return;
142 │     }
143 ▶     if (this.ttlTimeout) {
144 │       clearTimeout(this.ttlTimeout);
145 │       this.ttlTimeout = 0;
146 │     }
147 ▶     this.destroyEvents.emit([this]);
148 ▶     this.overlayElement.remove();
149 ▶     this.destroyed = true;
150 │   }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/highlights.ts` L152–185 （▶ の行: 154, 162, 166, 168, 173, 175, 182–183）

```ts
152 │   /** Render/append the highlight to the DOM. */
153 │   display() {
154 ▶     if (document.body.contains(this.overlayElement)) {
155 │       return;
156 │     }
157 │     if (this.destroyed) {
158 │       debugLog.warn('Cannot display a destroyed highlight.');
159 │       return;
160 │     }
161 │ 
162 ▶     document.body.appendChild(this.overlayElement);
163 │ 
164 │     // Initiate TTL, if it's set
165 │     const {ttl} = this.template;
166 ▶     if (ttl !== undefined && ttl > 0 && !this.ttlTimeout) {
167 │       runOutsideAngular(() => {
168 ▶         this.ttlTimeout = setTimeout(() => this.destroy(), ttl);
169 │       });
170 │ 
171 │       // Check whether there is enough time to fade out the
172 │       // element gracefully. If not, do not animate.
173 ▶       const timeUntilFadeOut = ttl - OVERLAY_FADE_OUT_DUR;
174 │       if (timeUntilFadeOut >= 0) {
175 ▶         fadeOutOverlay(this.overlayElement, timeUntilFadeOut);
176 │       }
177 │     }
178 │   }
179 │ 
180 │   /** Remove the highlight from the DOM. */
181 │   hide() {
182 ▶     if (document.body.contains(this.overlayElement)) {
183 ▶       document.body.removeChild(this.overlayElement);
184 │     }
185 │   }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/index.ts` L109–145 （▶ の行: 110, 116, 124–125, 128, 133–135）

```ts
109 │ // Clean up the references after `destroy` has been called.
110 ▶ highlightDestroyEvents.subscribe(([highlight]) => {
111 │   forEachActiveHighlight((h, target) => {
112 │     if (highlight !== h) {
113 │       return;
114 │     }
115 │ 
116 ▶     const targetHighlights = activeHighlights.get(target);
117 │ 
118 │     if (!targetHighlights) {
119 │       return false;
120 │     }
121 │ 
122 │     const idx = targetHighlights.indexOf(highlight);
123 │     if (idx > -1) {
124 ▶       targetHighlights.splice(idx, 1);
125 ▶       highlightsRegistry.unregister(h);
126 │ 
127 │       // Determine if there are any other highlights that can be rendered.
128 ▶       displayElementHighlights(target);
129 │     }
130 │ 
131 │     // In case there are no other highlights attached to that element,
132 │     // remove the target element from the global vars.
133 ▶     if (!targetHighlights.length) {
134 ▶       activeHighlights.delete(target);
135 ▶       resizeObserver.unobserve(target);
136 │ 
137 │       const targetElsIdx = targetElements.findIndex((wr) => wr.deref() === target);
138 │       if (targetElsIdx > -1) {
139 │         targetElements.splice(targetElsIdx, 1);
140 │       }
141 │     }
142 │ 
143 │     return false;
144 │   });
145 │ });
```

`destroy` は 147 行目で「消えた」ことを同期の `EventEmitter` で知らせ、148 行目で DOM から外します。知らせを受けた index.ts の 110〜145 行目が、要素の配列から外し（124 行目）、128 行目で**残りの枠のうち優先の高いものを出し直します**。`display` の 166〜169 行目、TTL があればタイマーで `destroy` を予約し、173〜176 行目で消える 100 ms 前からフェードアウトのアニメーションを始めます。

## 5. ページの上で選ぶ：ComponentInspector

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/component-inspector/component-inspector.ts` L47–69 （▶ の行: 48–50, 54, 57, 61–62, 64–66）

```ts
47 │   startInspecting(): void {
48 ▶     window.addEventListener('mouseover', this.elementMouseOver, true);
49 ▶     window.addEventListener('click', this.elementClick, true);
50 ▶     window.addEventListener('mouseout', this.cancelEvent, true);
51 │   }
52 │ 
53 │   stopInspecting(): void {
54 ▶     window.removeEventListener('mouseover', this.elementMouseOver, true);
55 │     window.removeEventListener('click', this.elementClick, true);
56 │     window.removeEventListener('mouseout', this.cancelEvent, true);
57 ▶     this.unhighlight();
58 │   }
59 │ 
60 │   elementClick(e: MouseEvent): void {
61 ▶     e.stopImmediatePropagation();
62 ▶     e.preventDefault();
63 │ 
64 ▶     if (this._selectedDirective.directive && this._selectedDirective.host) {
65 ▶       this._onComponentSelect(
66 ▶         getDirectiveForestManager().getDirectiveId(this._selectedDirective.directive)!,
67 │       );
68 │     }
69 │   }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/component-inspector/component-inspector.ts` L71–100 （▶ の行: 72, 74–76, 79–83, 89–91）

```ts
 71 │   elementMouseOver(e: MouseEvent): void {
 72 ▶     this.cancelEvent(e);
 73 │ 
 74 ▶     const el = e.target;
 75 ▶     if (el instanceof Node) {
 76 ▶       this._selectedDirective = findDirectiveAndHost(el);
 77 │     }
 78 │ 
 79 ▶     this.unhighlight();
 80 ▶     if (this._selectedDirective.directive && this._selectedDirective.host) {
 81 ▶       this.highlightElement(this._selectedDirective.host);
 82 ▶       this._onComponentEnter(
 83 ▶         getDirectiveForestManager().getDirectiveId(this._selectedDirective.directive)!,
 84 │       );
 85 │     }
 86 │   }
 87 │ 
 88 │   cancelEvent(e: MouseEvent): void {
 89 ▶     e.stopImmediatePropagation();
 90 ▶     e.preventDefault();
 91 ▶     this._onComponentLeave();
 92 │   }
 93 │ 
 94 │   bindMethods(): void {
 95 │     this.startInspecting = this.startInspecting.bind(this);
 96 │     this.stopInspecting = this.stopInspecting.bind(this);
 97 │     this.elementMouseOver = this.elementMouseOver.bind(this);
 98 │     this.elementClick = this.elementClick.bind(this);
 99 │     this.cancelEvent = this.cancelEvent.bind(this);
100 │   }
```

1. **48〜50 行目：`window` に capture（第 3 引数 `true`）で 3 つのリスナー**

   capture なので、ページのどの要素のリスナーよりも先に受けます。
2. **72 行目・89〜91 行目：まずイベントを止め、「離れた」を送る**

   mouseover のたびに、最初に `cancelEvent` が `stopImmediatePropagation`・`preventDefault` を呼び、`removeComponentHighlight` を送ります（パネルの木の強調を消す）。検査中はページのボタンなどが反応しません。
3. **74〜85 行目：マウスの下の要素から、ディレクティブのある要素を探して光らせる**

   見つかれば 81 行目で枠、82〜84 行目でそのディレクティブの id（`getDirectiveId`、[第 7 回](07-devtools-identity.md)）を `highlightComponent` で送ります。パネルはその行を強調します。
4. **60〜69 行目：クリックで選ぶ**

   クリックそのものも止め（61〜62 行目）、最後に mouseover で見つけたディレクティブの id を `selectComponent` で送ります。パネルはその行を選び、プロパティを頼みます（[第 9 回](09-devtools-state-serializer.md)）。
5. **53〜58 行目：止めるとき、リスナーを外して枠を消す**

   36857553333（2026-07-08、refactor）で、パネルで Esc を押すと検査を止めるようになりました。変わったのはパネルの devtools-tabs.component.ts だけで、`host` に `'(document:keydown.Escape)': 'stopInspecting()'` を足し、検査中なら `toggleInspector()` で `inspectorEnd` を送ります（[第 1 回](01-devtools-overview.md)の持ち場のファイル）。キーを受けるのはパネルの document なので、ページの上で Esc を押しても止まりません。

## 6. 値をコンソールに出す：logValue と log

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/component-tree/component-tree.ts` L797–803 （▶ の行: 798–800, 803）

```ts
797 │   if (node.component) {
798 ▶     const compInstance = node.component.instance;
799 ▶     if (valueInfo.keyPath === null) {
800 ▶       logSignalToConsole(compInstance);
801 │       return;
802 │     }
803 ▶     const value = valueInfo.keyPath.reduce((obj, key) => obj && obj[key], compInstance);
```

パネルのプロパティの行のメニュー（いちばん上の段の行だけ）から「コンソールに出す」を選ぶと、`logValue` が `keyPath` つきで届きます。`logValue` も component-tree.ts にあり、ここではコンポーネントの枝の 7 行だけ引きます。799〜801 行目、`keyPath` が `null` ならインスタンスそのもの、あれば 803 行目の `reduce` でたどった値を、`logSignalToConsole` がページの `console.log` に出します（signal なら `unwrapSignal` で中身）。第 9 回の Descriptor と違い、**本物のオブジェクト**がページのコンソールに出るので、Map や Set の中も見られます。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/client-event-subscribers.ts` L136–142 （▶ の行: 136–139, 141）

```ts
136 ▶   const SAFE_LOG_LEVELS = new Set(['log', 'info', 'warn', 'debug', 'error']);
137 ▶   messageBus.on('log', ({message, level}) => {
138 ▶     if (SAFE_LOG_LEVELS.has(level)) {
139 ▶       log[level](message);
140 │     } else {
141 ▶       debugLog.warn(`Invalid log level attempted: ${level}`);
142 │     }
```

パネルが自分のメッセージをページのコンソールに出させる `log` の受け口です（`subscribeToClientEvents` の中）。66cbfee57b0（2026-06-02、refactor「harden console invocations」）は、もとの `console[level](…)` の前に、136 行目の 5 つの名前の集合で `level` を確かめる形にしました。コミットの説明は「プロトタイプ汚染がコンソールの呼び出しに影響しないようにする」です。もとの形では、`level` が `constructor` なら `console.constructor`（`Object` の関数）が呼ばれていました。いまは 1371c946aa9 で `log[level]`（DevTools の印 `[Angular DevTools]` を付けて出す自前の logger）に変わり、集合に無い名前は 141 行目の `debugLog.warn`（DevTools 自体の開発モードのときだけ出る）になります。

## 7. 最近の作り直しと修正

- **98115e81371（2026-07-15、refactor「revamp highlighter」）**：それまでの highlighter.ts（選んだ要素と overlay を 1 つずつモジュールの変数で持つ形）を、この章で読んだ `shared/highlighter/` の 3 つのファイルに作り直しました。枠を `Highlight` のオブジェクトにし、要素ごとの配列・型による優先順位（4 節）・TTL・`ResizeObserver` と `resize` での位置の合わせ直し・`FinalizationRegistry` での後片付けが入りました。`findDirectiveAndHost` もこのとき component-tree.ts へ移りました。
- **56847dc77a5（2026-06-21、fix「SVG とディレクティブのホストを正しく光らせる」）**：要素の判定を `HTMLElement` から `Element` にし（いまの 145 行目）、さかのぼりを「最初のコンポーネントかディレクティブ」で止めるようにしました（いまの 846〜852 行目）。`<a routerLink>` のようなディレクティブだけの要素で、親のコンポーネントが光ってしまう不具合でした。デモの `<a appTip>` の段が、直したあとの形です。
- **03f1758e2ae（2026-08-06、fix、#70104）**：Chrome の拡張で、パネルからページの要素を Elements パネルで開く（`inspect(…)`）・ソースを開くときに使う、位置を文字列にした `serializedId` の読み方を直しました。#69309 で位置の文字列がカンマ区切りから JSON の配列の形に変わったのに、ページ側の `findNodeFromSerializedPosition`（component-tree.ts）が `split(',')` のままだったのを、`JSON.parse` にしました。足した spec は shell-browser の chrome-application-operations.spec.ts で、`inspectedWindow.eval` に渡す文字列が `findConstructorByPosition("[0,0]", 0)` になることを確かめます（[第 3 回](03-devtools-messaging.md)の持ち場）。

> [!NOTE]
> **さらに深く**
>
> 56847dc77a5 はもう 1 つ、「0.5 px のような小数の大きさの要素で、overlay が 0 px になる」問題も直していました（overlay の大きさを `${width}px` のように小数のまま書く）。その spec が `should preserve subpixel overlay dimensions`（`new DOMRect(0, 0, 0.5, 0.5)` で `'0.5px'` を期待）です。ところが、そのあと（コミットの順で 56847dc77a5 は 98115e81371 の祖先。`git merge-base --is-ancestor` で確かめました）の作り直しの dom.ts は、113〜116 行目で再び `~~width` と整数に切り捨てていて、いまの main（gh api で読んだもの）も同じです。作り直しの新しい highlighter.spec.ts にも、この spec と、ディレクティブだけのホストを確かめる spec（`should return a directive-only host before a parent component host`）はありません（`grep -rn subpixel` で 0 件）。182 行目は「幅か高さが 0 なら光らせない」なので、0.5 × 0.5 の要素なら枠は作られ、113 行目で幅 0 px の枠になります。手で確かめるなら、highlighter.spec.ts の `createTargetElement(0.5, 0.5)` で `style.width` を見る it を足して走らせます。

## 8. ここまでの呼び出し

- 👤 `虫めがねを押す` — パネル — *inspectorStart*
  - `ComponentInspector.startInspecting()` — component-inspector.ts 47 — *window に capture で 3 つ*
- 👤 `ページの要素の上にマウス` — ページ
  - `elementMouseOver(e)` → `cancelEvent` — component-inspector.ts 71・88 — *removeComponentHighlight*
    - `findDirectiveAndHost(e.target)` — component-tree.ts 846〜852 — *ng.getComponent → ng.getDirectives*
    - `highlightElement(host, inspectElementHighlightTemplate, …)` — shared/highlighter/index.ts 167
      - `createOverlayWithLabels` → `new Highlight` → `position` → `displayElementHighlights` — dom.ts 35・highlights.ts・index.ts 272
    - `messageBus.emit('highlightComponent', [id])` — client-event-subscribers.ts 392
- 👤 `クリック` — ページ
  - `elementClick(e)` → `emit('selectComponent', [id])` — component-inspector.ts 60 / client-event-subscribers.ts 398
- `setSelectedComponent(position)` — client-event-subscribers.ts 245 — *パネルが選んだ行の位置*
  - `setConsoleReference({node, position})` → `window.$ng0` — set-console-reference.ts 24・55

> **🧪 DEMO — 選ぶ・光らせる・検査する（記録の再生）**
>
> これは記録です。本物の devtools のソース（angular/angular の devtools/、8576f161ae4）を、本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かした結果です。パネルの代わりにメッセージを送り、段ごとに、バックエンドが emit したもの・`window` の `$ng0`〜`$ng4` が返すもの・`body` の直下の overlay の HTML・ページのコンソールに出たものを残しました。共通の部品は[第 1 回](01-devtools-overview.md)に全文があります。
>
> 記録の環境の代わり（devtools のロジックではないもの）が 3 つあります。① domino にはレイアウトが無く `getBoundingClientRect` が無いので、すべての要素が同じ `{"top":10,"left":20,"width":200,"height":40,"right":220,"bottom":50,"x":20,"y":10}` を返すようにしました（だから overlay の位置と大きさはどの要素でも 200 × 40 で、本物の要素の大きさではありません。0 のままだと 182 行目で枠が作られません）。`scrollX`・`scrollY` は 0、`animate` は何もしない関数です。② domino の要素のイベントは `window`（ここでは Node の `globalThis`）まで届かないので、`ComponentInspector` が `window` に付けたリスナーを覚えておき、`target` を要素にした偽のイベントで呼びました。③ コンソールは置き換えて記録しました。
>
> 1〜4 段：`[0, 1]` は `<a appTip>`（ディレクティブだけの要素）なので、`$ng0` は要素を返します（58 行目ではなく 61 行目）。4 段目で `[0, 0]` を選び直すと、37〜46 行目で前の位置から外れて先頭に戻ります。8〜12 段：mouseover のたびに `removeComponentHighlight` が先に出ます（72 行目）。mouseout では枠は消えず、`removeComponentHighlight` だけです。`inspectorEnd` で枠が消え、`window` のリスナーが 0 になります（`resize` の 1 つは highlighter のもの）。13〜14 段：検査の枠は TTL の 4000 ms で自分で消えます。18 段：`level: "constructor"` は集合に無いので、何も出ません（`debugLog.warn` は DevTools の開発モードのときだけ出る）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-inspector-highlight)

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| component-inspector/component-inspector.spec.ts | describe `ComponentInspector`（12 行目）の 5 件。リスナーを付ける・外す（18・28）、イベントを止める（38）など | `//devtools/projects/ng-devtools-backend/src/lib/component-inspector:test` |
| shared/highlighter/highlighter.spec.ts | describe `highlighter`（27）→ `highlightElement`（65）・`removeElementHighlights`（146）・`removeAllHighlights`（187）・`removeHighlightsByType`（211）・`Priority system`（230） | `//devtools/projects/ng-devtools-backend/src/lib/shared/highlighter:test` |
| shared/highlighter/highlights.spec.ts | describe `Highlight`（45）→ `updateLabel`・`display`（114、TTL の it は `jasmine.clock()`）・`hide`・`position`・`destroy` |   |

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/component-inspector/component-inspector.spec.ts` L18–45 （▶ の行: 19, 21–23, 40, 42–43）

```ts
18 │   it('should add event listeners to window on start inspecting', () => {
19 ▶     const eventsSpy = spyOn(window, 'addEventListener');
20 │     const inspector = new ComponentInspector();
21 ▶     inspector.startInspecting();
22 ▶     expect(eventsSpy).toHaveBeenCalledTimes(3);
23 ▶     expect(eventsSpy).toHaveBeenCalledWith('mouseover', jasmine.any(Function), true);
24 │     expect(eventsSpy).toHaveBeenCalledWith('click', jasmine.any(Function), true);
25 │     expect(eventsSpy).toHaveBeenCalledWith('mouseout', jasmine.any(Function), true);
26 │   });
27 │ 
28 │   it('should remove event listeners from window on stop inspecting', () => {
29 │     const eventsSpy = spyOn(window, 'removeEventListener');
30 │     const inspector = new ComponentInspector();
31 │     inspector.stopInspecting();
32 │     expect(eventsSpy).toHaveBeenCalledTimes(3);
33 │     expect(eventsSpy).toHaveBeenCalledWith('mouseover', jasmine.any(Function), true);
34 │     expect(eventsSpy).toHaveBeenCalledWith('click', jasmine.any(Function), true);
35 │     expect(eventsSpy).toHaveBeenCalledWith('mouseout', jasmine.any(Function), true);
36 │   });
37 │ 
38 │   it('should cancel events from mouse after start inspecting', () => {
39 │     const inspector = new ComponentInspector();
40 ▶     const mouseEventSpy = jasmine.createSpyObj('e', ['stopImmediatePropagation', 'preventDefault']);
41 │     inspector.startInspecting();
42 ▶     inspector.cancelEvent(mouseEventSpy);
43 ▶     expect(mouseEventSpy.stopImmediatePropagation).toHaveBeenCalledTimes(1);
44 │     expect(mouseEventSpy.preventDefault).toHaveBeenCalledTimes(1);
45 │   });
```

`ComponentInspector` の spec は、リスナーの数と `cancelEvent` だけを見ます。**mouseover から `findDirectiveAndHost` を通って `highlightComponent` を送る道（5 節）を通る spec はありません**。デモの 8〜10 段がそこを通した記録です。set-console-reference.ts にも spec はありません（console/BUILD.bazel にテストのターゲットが無い）。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/highlighter.spec.ts` L27–63 （▶ の行: 31, 39, 47–48, 51–52, 58–59）

```ts
27 │ describe('highlighter', () => {
28 │   let getComponentSpy: jasmine.Spy;
29 │   let testElements: HTMLElement[] = [];
30 │ 
31 ▶   function createTargetElement(width: number = 100, height: number = 50): HTMLElement {
32 │     const el = document.createElement('div');
33 │ 
34 │     el.style.position = 'absolute';
35 │     el.style.width = `${width}px`;
36 │     el.style.height = `${height}px`;
37 │ 
38 │     document.body.appendChild(el);
39 ▶     spyOn(el, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 0, width, height));
40 │ 
41 │     testElements.push(el);
42 │ 
43 │     return el;
44 │   }
45 │ 
46 │   beforeEach(() => {
47 ▶     getComponentSpy = jasmine.createSpy('getComponent').and.returnValue({});
48 ▶     (window as any).ng = {getComponent: getComponentSpy};
49 │   });
50 │ 
51 ▶   afterEach(() => {
52 ▶     removeAllHighlights();
53 │     for (const el of testElements) {
54 │       el.remove();
55 │     }
56 │     testElements = [];
57 │ 
58 ▶     for (const el of getHighlightOverlays()) {
59 ▶       el.remove();
60 │     }
61 │ 
62 │     delete (window as any).ng;
63 │   });
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/highlighter.spec.ts` L261–278 （▶ の行: 261, 264, 267, 271, 274, 276）

```ts
261 ▶     it('should promote the next highest priority highlight when the top one is destroyed', () => {
262 │       const el = createTargetElement();
263 │ 
264 ▶       const inspectHighlight = highlightElement(el, inspectElementHighlightTemplate, {
265 │         'component-name': ['TestComponent'],
266 │       });
267 ▶       highlightElement(el, hydrationCompletedHighlightTemplate, {
268 │         'icon': ['hydrated'],
269 │       });
270 │ 
271 ▶       expect(getHighlightOverlays().length).toBe(1);
272 │       expect(getHighlightOverlays()[0].textContent).toContain('<TestComponent>');
273 │ 
274 ▶       inspectHighlight!.destroy();
275 │ 
276 ▶       expect(getHighlightOverlays().length).toBe(1);
277 │       expect(getHighlightOverlays()[0].querySelector('svg')).not.toBeNull();
278 │     });
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/highlights.spec.ts` L45–51 （▶ の行: 46–49）

```ts
45 │ describe('Highlight', () => {
46 ▶   beforeEach(() => {
47 ▶     const highlightOverlays = document.body.querySelectorAll('.' + OVERLAY_CLASS);
48 ▶     for (const h of highlightOverlays) {
49 ▶       h.remove();
50 │     }
51 │   });
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/highlighter/highlights.spec.ts` L114–134 （▶ の行: 115, 120, 122, 125, 131, 133）

```ts
114 │   describe('display', () => {
115 ▶     it('should append the overlay to document.body', () => {
116 │       const highlight = createHighlight(createTemplate(), {
117 │         title: document.createElement('div'),
118 │       });
119 │ 
120 ▶       highlight.display();
121 │ 
122 ▶       expect(getOverlay()).not.toBeNull();
123 │     });
124 │ 
125 ▶     it('should NOT duplicate the overlay if already displayed', () => {
126 │       const highlight = createHighlight(createTemplate(), {
127 │         title: document.createElement('div'),
128 │       });
129 │ 
130 │       highlight.display();
131 ▶       highlight.display();
132 │ 
133 ▶       expect(document.body.querySelectorAll('.' + OVERLAY_CLASS).length).toBe(1);
134 │     });
```

highlighter.spec.ts は 39 行目で要素の `getBoundingClientRect` を spy にして大きさを与え（デモの環境の代わりと同じ考え）、48 行目で `window.ng` を偽物にします。後片付けは 51〜63 行目の `afterEach` で、overlay を消します。同じテストのファイルの束（1 つの `test_bundle.spec.js`）に入る highlights.spec.ts は、46〜51 行目の `beforeEach` で前の overlay を消しますが、`afterEach` はありません。115〜123 行目の it は `display()` した overlay を `body` に残したまま終わります。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //devtools/projects/ng-devtools-backend/src/lib/component-inspector:test //devtools/projects/ng-devtools-backend/src/lib/shared/highlighter:test --nocache_test_results --test_output=all
# 順番で落ちるかを見るために、highlighter だけを 8 回ずつ
pnpm bazel test //devtools/projects/ng-devtools-backend/src/lib/shared/highlighter:test_chromium //devtools/projects/ng-devtools-backend/src/lib/shared/highlighter:test_firefox --nocache_test_results --runs_per_test=8 --test_output=errors
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/devtools-logs/c-all.log と c-highlighter-runs.log）`

```
component-inspector:test_chromium  Chromium: 1/1 test files | 5 passed, 0 failed   (0.9s)   PASSED in 3.1s
component-inspector:test_firefox   Firefox:  1/1 test files | 5 passed, 0 failed   (2.3s)   PASSED in 4.5s
highlighter:test_firefox           Firefox:  1/1 test files | 31 passed, 0 failed  (4.5s)   PASSED in 7.4s
highlighter:test_chromium          Chromium: 1/1 test files | 30 passed, 1 failed  (1.6s)   FAILED in 3.7s
  ❌ highlighter > Priority system > should promote the next highest priority highlight when the top one is destroyed
     Expected 2 to be 1.  at highlighter.spec.ts:271:44   (Jasmine randomize seed: 17765)

--runs_per_test=8 のとき
highlighter:test_chromium PASSED in 2.0s  Stats over 8 runs: max = 2.0s, min = 1.9s, avg = 2.0s
highlighter:test_firefox  PASSED in 6.4s  Stats over 8 runs: max = 6.4s, min = 4.4s, avg = 5.4s
```

- 1 回目、highlighter の Chromium で 1 件落ちました（seed 17765）。271 行目で overlay の数が 1 ではなく 2 でした。同じターゲットを Chromium・Firefox で 8 回ずつ（計 16 回）走らせ直すと、すべて通りました。jasmine は it の順番を seed で混ぜます。
- 落ちた形は、highlights.spec.ts の overlay を残す it（115〜123 行目など）が、highlighter.spec.ts の overlay の数を数える it（241・257・271 行目）の直前に走ったときに起きる形と合います。前者は `afterEach` で片付けず、後者は `beforeEach` で片付けないからです。ただし seed 17765 での it の並びを取り出して確かめてはいないので、原因はこの読みの段階です。
- component-inspector の 5 件・highlighter の 31 件（Firefox）は通りました。

### 直すとしたら

- 「違う要素が光る・光らない」は、`findDirectiveAndHost`（component-tree.ts）と `highlightElement` の 172〜185 行目です。spec は highlighter.spec.ts の `highlightElement` の describe に、`createTargetElement` の形で足します。
- 「小さい要素の枠が 0 px」は dom.ts の 113〜116 行目です。56847dc77a5 の `should preserve subpixel overlay dimensions` と同じ形の it を highlighter.spec.ts に足すと、いまの行では落ちるはずの形になります（手元で確かめる入口。走らせた結果は載せていません）。
- 順番で落ちる spec は、highlights.spec.ts に `afterEach` の片付けを足すか、highlighter.spec.ts に `beforeEach` の片付けを足すかのどちらかが入口です。jasmine の seed を固定して走らせる方法は、このターゲットでは試していません。
- 本家に PR を出すことは勧めません。issue を読むときは、まずデモと同じ形（大きさを与えた要素と `ng`）で手元で再現できるかを確かめます（[第 20 回](20-devtools-issues.md)）。

## 聞かれそうな質問

**Q. コンソールの `$ng0` は、いつ、どう決まりますか？**

パネルの木で行を選んだとき（`setSelectedComponent`）に、`setConsoleReference` が `window` に getter を置きます（55 行目）。いちばん新しいものが `$ng0` で、5 つまで（20 行目）。同じ位置を選び直すと先頭に戻ります（38〜42 行目）。ページの上の検査で選んだときも、パネルがその行を選ぶので同じ道を通ります。

**Q. `$ng0` がコンポーネントではなく要素を返すことがあるのはなぜですか？**

選んだノードにコンポーネントが無いとき（ディレクティブだけの要素など）は、58 行目ではなく 61 行目の `nativeElement` を返すからです。デモの 3 段目がそれです。

**Q. 検査中にページのボタンを押しても反応しないのはなぜですか？**

`startInspecting` が `window` に capture で click のリスナーを付け（49 行目）、61〜62 行目で `stopImmediatePropagation` と `preventDefault` を呼ぶからです。ページのリスナーまでイベントが届きません。

**Q. 枠が 4 秒で消えるのはなぜですか？**

検査の枠のテンプレートが `ttl: 4000`（226 行目）で、`display` の 166〜169 行目がタイマーで `destroy` を予約するからです。変更検知の枠は 1000 ms です（同じファイルの `changeDetectionHighlightTemplate`）。

**Q. SVG の要素や `<a routerLink>` も光らせられますか？**

いまはできます。145 行目が `Element` で判定し、`findDirectiveAndHost` が 850 行目でディレクティブだけの要素でも止まるからです（56847dc77a5）。ただし、0.5 px のような小数の大きさは 113〜116 行目で切り捨てられます（7 節）。

## 読み終えて

- `$ng0`〜`$ng4` は、木で選んだ位置を新しい順に 5 つまで覚え、`window` に getter として置いたもの。
- 枠は `body` の直下の `div`。要素ごとに複数持ち、型の数の小さいものが優先して見え、TTL で自分で消える。
- ページの上の検査は、`window` の capture のリスナーでイベントを止め、親へさかのぼって最初のコンポーネントかディレクティブを探し、その id をパネルへ送る。
- 作り直し（98115e81371）のあと、小数の大きさの扱いと、その spec が消えている。highlighter の spec には、順番によって落ちるものがある（1 回だけ観測）。

---

← 前: [値を書き換える：updateState と property-mutation](11-devtools-property-mutation.md)  
次: [プロファイラーの記録：ɵsetProfiler からフレームまで](13-devtools-profiler-capture.md) →
