[目次](../README.md) › [core の説明文の読み残し（3）](README.md) › 第 1 回 / 全 8 回

# ハイドレーションの公開 API と型の説明文

> hydration/api.ts・interfaces.ts・tokens.ts・event\_replay.ts の未読の行：withDomHydration の約束、SerializedView ほか ngh の型のコメント、トークンとイベントの再生の説明。本物の platform-server で描いた HTML と、それをハイドレートした記録と並べる。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crh-hydration-api)

---

この章で分かること：ハイドレーションの公開 API の残りの説明文（`withDomHydration`・統計の 1 行・`withEventReplay`）と、サーバーが書く `ngh` の型（`SerializedView` ほか）のコメントが約束していることを、本物の `@angular/platform-server`（22.2.6）で描いた HTML と、その HTML を Node の上でハイドレートした記録で 1 つずつ確かめます。食い違いは 4 つ見つかりました。`JSACTION_BLOCK_ELEMENT_MAP` の「アクションの名前ごと」（tokens.ts 76 行目）は実際には `@defer` のブロックの id ごとで、`collectDomEventsInfo` の「すべての DOM イベント」（event\_replay.ts 227 行目）は記録の対象のイベントだけ、annotate.ts のコメントが「エラーになる」と書く場面は開発モードの警告だけでした。定数 `DEFER_PREFETCH_TRIGGERS`（`'pt'`）はどこからも使われていません（新しい本家で消えました）。

読む対象は `packages/core/src/hydration/` の `api.ts`・`interfaces.ts`・`tokens.ts`・`event_replay.ts`・`skip_hydration.ts` と `utils.ts` の 1 関数です（../angular、8576f161ae4）。動く行の多くは既存の章が読んでいます。`withDomHydration` の流れは[provideClientHydration の章](../platform/07-hydration-provide.md)、`ngh` を書く側は[ngh を書く章](../platform/08-hydration-annotate.md)、道順の文字列は[道順の章](../platform/09-hydration.md)、イベントの再生は[イベントの記録と再生の章](../platform/14-event-replay.md)、platform-browser 側の説明文は[provideClientHydration の説明文の章](../pbd/02-pbd-hydration.md)にあるので、ここでは行だけ指します。

1. **1. ハイドレーションの公開 API と型**（この章）
2. [2. ngh の書き出し](02-crh-hydration-annotate.md)
3. [3. ノードの探し方と不一致](03-crh-hydration-errors.md)
4. [4. @defer](04-crh-defer.md)
5. [5. resource()](05-crh-resource.md)
6. [6. Renderer2](06-crh-renderer.md)
7. [7. 開発用の小道具](07-crh-dev-utils.md)
8. [8. spec と issue](08-crh-tests-issues.md)

この章の記録は、手元の記録のスクリプトが 2 つのプロセスで作りました。1 つ目は `ngServerMode = true` で `renderApplication` を回し、HTML を書きます。2 つ目はその HTML を domino（platform-server に入っている DOM の実装）の文書に読み込み、`ngServerMode = false` で `bootstrapApplication(App, {providers: [provideZonelessChangeDetection(), provideClientHydration()]})` を呼んでハイドレートします。どちらも JIT（`@angular/compiler` を先に読む）で、開発モードと本番（`ngDevMode = false`）の 2 回です。

## 1. withDomHydration の説明文：「サーバーでも分かる旗」

📄 `angular/packages/core/src/hydration/api.ts` L182–192 （▶ の行: 184–186, 189–191）

```ts
182 │ 
183 │ /**
184 ▶  * Returns a set of providers required to setup hydration support
185 ▶  * for an application that is server side rendered. This function is
186 ▶  * included into the `provideClientHydration` public API function from
187 │  * the `platform-browser` package.
188 │  *
189 ▶  * The function sets up an internal flag that would be recognized during
190 ▶  * the server side rendering time as well, so there is no need to
191 ▶  * configure or change anything in NgUniversal to enable the feature.
192 │  */
```

184〜186 行目は「サーバーで描いたアプリのハイドレーションに要る provider の組を返す。platform-browser の `provideClientHydration` に入る」と書きます。[前のシリーズの記録](../pbd/02-pbd-hydration.md)のとおり、`provideClientHydration()` の配列の 2 番目がこれです。189〜191 行目の約束は「内部の旗を立て、それはサーバーで描くときにも読まれるので、NgUniversal の側で何も変えなくてよい」です。旗は次のトークンです。

📄 `angular/packages/core/src/hydration/tokens.ts` L9–18 （▶ の行: 11–13, 15–16）

```ts
 9 │ import {InjectionToken} from '../di/injection_token';
10 │ 
11 ▶ /**
12 ▶  * Internal token that specifies whether DOM reuse logic
13 ▶  * during hydration is enabled.
14 │  */
15 ▶ export const IS_HYDRATION_DOM_REUSE_ENABLED = new InjectionToken<boolean>(
16 ▶   typeof ngDevMode === 'undefined' || ngDevMode ? 'IS_HYDRATION_DOM_REUSE_ENABLED' : '',
17 │ );
18 │ 
```

11〜13 行目は「ハイドレーションで DOM を使い回すかどうか」です。値を決める factory は api.ts の L196〜209 で、サーバーでは L198 の `true` のまま返り、ブラウザーでは L202〜203 で `TransferState` に `__nghData__` があるときだけ `true` です。サーバー側では platform-server の utils.ts の `prepareForHydration` が L101 でこのトークンを読み、`true` なら L111 で `annotateForHydration` を呼んで `ngh` を書きます。だから 189〜191 行目のとおり、サーバーの設定にも同じ `provideClientHydration()` を入れるだけで足ります。191 行目の NgUniversal は、今の `@angular/ssr` の前の名前です。古いだけで、約束は今も成り立ちます。

サーバーの側に入れ忘れたらどうなるかを、DEMO の「ngh が無い・nghm が無い」の表で見ます。サーバーに `provideClientHydration` が無いと HTML に `ngh` も `<!--nghm-->` も `ng-state` も出ず、ブラウザーは開発モードで console.warn に NG0505「Angular hydration was requested on the client, but there was no serialized information present in the server response, thus hydration was not enabled. …」を書き、普通の描画に戻りました。本番では何も出ません（L230〜233 が `ngDevMode` の中）。`<body ngcm>`（`RenderMode.Client` のページの印、[provideClientHydration の章の 7 節](../platform/07-hydration-provide.md)）を付けた文書では、開発モードでも何も出ませんでした。

この警告の相手側には、説明と違うコメントがあります。annotate.ts の L283〜287「ビューが 0 個でも `__nghData__` のキーは必ず書く。サーバーのハイドレーションが正しく入った合図で、ブラウザーがキーを見つけられなければエラーになる」です。実際は開発モードの警告だけで、例外は出ず、本番では何も出ません。このコメントと NG0505 の警告は同じコミット fe34de47bf3（2023-04-06、refactor(core): add a warning when hydration annotation is missing in server response (#49743)）で入りました。新しい本家（origin/main の d201dd76ef2、2026-11-20。以下「新しい本家」）でも同じ文です。

📄 `angular/packages/core/src/hydration/api.ts` L297–308 （▶ の行: 299, 303, 306）

```ts
297 │             };
298 │           }
299 ▶           return () => {}; // noop
300 │         },
301 │         multi: true,
302 │       },
303 ▶     );
304 │   }
305 │ 
306 ▶   return makeEnvironmentProviders(providers);
307 │ }
308 │ 
```

`__nghData__` が無かったブラウザーでは、`APP_BOOTSTRAP_LISTENER` も 299 行目の何もしない関数になります。使われなかった DOM の片付け（L289、[コンテナの章の 5 節](../platform/11-hydration-containers.md)）も、3 節の統計の行も無くなります。303 行目までの `providers.push` は L251 の `if` の中なので、サーバーでは `PRESERVE_HOST_CONTENT` とこのリスナーは入りません。

## 2. 2 つのモジュールの変数：コードを入れる旗と、i18n の旗

📄 `angular/packages/core/src/hydration/api.ts` L65–80 （▶ の行: 66–67, 69, 72–73, 75–77, 79）

```ts
65 │ /**
66 ▶  * Indicates whether the hydration-related code was added,
67 ▶  * prevents adding it multiple times.
68 │  */
69 ▶ let isHydrationSupportEnabled = false;
70 │ 
71 │ /**
72 ▶  * Indicates whether the i18n-related code was added,
73 ▶  * prevents adding it multiple times.
74 │  *
75 ▶  * Note: This merely controls whether the code is loaded,
76 ▶  * while `setIsI18nHydrationSupportEnabled` determines
77 ▶  * whether i18n blocks are serialized or hydrated.
78 │  */
79 ▶ let isI18nHydrationRuntimeSupportEnabled = false;
80 │ 
```

66〜67 行目と 72〜73 行目は「ハイドレーションの（i18n の）コードを足したかどうか。何度も足さないため」です。どちらもモジュールの変数で、L99〜100・L118〜119 で 1 回だけ `true` にし、`false` には戻しません。足すのは、命令が DOM を作る代わりに探す実装への差し替えです（[provideClientHydration の章の 5 節](../platform/07-hydration-provide.md)）。

75〜77 行目は「これはコードを読み込むかを決めるだけで、i18n のブロックを書き出す・ハイドレートするかは `setIsI18nHydrationSupportEnabled` が決める」と書きます。実装もそのとおりで、i18n.ts の L41〜47 の `_isI18nHydrationSupportEnabled` を、サーバーの annotate.ts L827（i18n のあるコンポーネントに `ngSkipHydration` を付けるか）と、ブラウザーの i18n.ts L418・i18n\_apply.ts L157 が読みます。`withDomHydration` の初期化子が L216 で毎回 `false` に戻し、`withI18nSupport` の初期化子が L325 で `true` にします。前者が先に並ぶ（platform-browser の hydration.ts の L285 が先、L292 が後）ので、`withI18nSupport()` を書いたアプリだけが `true` で終わります（[i18n のハイドレーションの章](../platform/13-hydration-i18n.md)）。

## 3. printHydrationStats：開発モードの統計の 1 行

📄 `angular/packages/core/src/hydration/api.ts` L125–142 （▶ の行: 127, 132–136, 138, 140）

```ts
125 │ 
126 │ /**
127 ▶  * Outputs a message with hydration stats into a console.
128 │  */
129 │ function printHydrationStats(injector: Injector) {
130 │   const console = injector.get(Console);
131 │   const message =
132 ▶     `Angular hydrated ${ngDevMode!.hydratedComponents} component(s) ` +
133 ▶     `and ${ngDevMode!.hydratedNodes} node(s), ` +
134 ▶     `${ngDevMode!.componentsSkippedHydration} component(s) were skipped. ` +
135 ▶     (isIncrementalHydrationEnabled(injector)
136 ▶       ? `${ngDevMode!.deferBlocksWithIncrementalHydration} defer block(s) were configured to use incremental hydration. `
137 │       : '') +
138 ▶     `Learn more at ${DOC_PAGE_BASE_URL}/guide/hydration.`;
139 │   // tslint:disable-next-line:no-console
140 ▶   console.log(message);
141 │ }
142 │ 
```

127 行目「ハイドレーションの数を console に出す」は、L290〜293 の `ngDevMode` の中から呼ばれます。DEMO の「統計の行」では、小さなアプリが「Angular hydrated 3 component(s) and 29 node(s), 0 component(s) were skipped. 0 defer block(s) were configured to use incremental hydration. Learn more at https://v22.angular.dev/guide/hydration.」、本番の記録では行そのものがありませんでした。135 行目の条件は、v22 ではインクリメンタルが既定なので、`@defer` を書かないアプリでも「0 defer block(s)」まで出ます。

📄 `angular/packages/core/src/hydration/utils.ts` L354–362 （▶ の行: 355, 357, 359）

```ts
354 │ 
355 ▶ export function countBlocksSkippedByHydration(injector: Injector) {
356 │   const transferState = injector.get(TransferState);
357 ▶   const nghDeferData = transferState.get(NGH_DEFER_BLOCKS_KEY, {});
358 │   if (ngDevMode) {
359 ▶     ngDevMode.deferBlocksWithIncrementalHydration = Object.keys(nghDeferData).length;
360 │   }
361 │ }
362 │ 
```

136 行目の数は、L291 で呼ぶこの関数が数えます。名前は「ハイドレーションで飛ばしたブロックを数える」ですが、359 行目は `__nghDeferData__` のキーの数、つまり hydrate のトリガーを持つ `@defer` の数をそのまま入れます。5 つの `@defer`（timer・immediate・idle・never・interaction）を描いた記録では「5 defer block(s) were configured to use incremental hydration」で、この行より先にハイドレートを終えていた 2 つ（immediate と idle。記録では子のコンポーネントの作成がこの行より前）も、決してハイドレートしない `hydrate never` も数えていました。行の文（136 行目の「configured」）が数の中身に合っていて、関数の名前だけが合いません。この関数は 4a2df5628af（2024-12-13、refactor(core): add skipped defer blocks count to ngDevMode (#59188)）で入りました。

## 4. ngh の型の説明文と、記録の値

`ngh` の属性の値は、`ng-state` の script の `__nghData__`（配列）の番号です。配列の 1 つ 1 つが `SerializedView` で、キーは 1 文字の定数です（キーの一覧と、なぜ 1 文字かは[ngh を書く章の 5 節](../platform/08-hydration-annotate.md)）。ここでは各キーのコメントを読み、記録の値と並べます。

📄 `angular/packages/core/src/hydration/interfaces.ts` L51–80 （▶ の行: 52–56, 63–65, 74–77）

```ts
51 │ /**
52 ▶  * Represents element containers within this view, stored as key-value pairs
53 ▶  * where key is an index of a container in an LView (also used in the
54 ▶  * `elementContainerStart` instruction), the value is the number of root nodes
55 ▶  * in this container. This information is needed to locate an anchor comment
56 ▶  * node that goes after all container nodes.
57 │  */
58 │ export interface SerializedElementContainers {
59 │   [key: number]: number;
60 │ }
61 │ 
62 │ /**
63 ▶  * Serialized data structure that contains relevant hydration
64 ▶  * annotation information that describes a given hydration boundary
65 ▶  * (e.g. a component).
66 │  */
67 │ export interface SerializedView {
68 │   /**
69 │    * Serialized information about <ng-container>s.
70 │    */
71 │   [ELEMENT_CONTAINERS]?: SerializedElementContainers;
72 │ 
73 │   /**
74 ▶    * Serialized information about templates.
75 ▶    * Key-value pairs where a key is an index of the corresponding
76 ▶    * `template` instruction and the value is a unique id that can
77 ▶    * be used during hydration to identify that template.
78 │    */
79 │   [TEMPLATES]?: Record<number, string>;
80 │ 
```

小さなアプリ（`@if`・3 つの `@for`・`<ng-container>`・同じ子コンポーネント 2 つ・ボタン）の記録では、`__nghData__` は `[{}, {"t":{"2":"t0","5":"t1"},"c":{…},"e":{"6":1}}]` でした（DEMO の 1 つ目）。52〜56 行目の `e` は「`<ng-container>` の番号 → 中の根のノードの数。後ろのコメントの印を見つけるため」で、`"6":1` は 6 番の `<ng-container>` の中に `<b>` が 1 つあり、その後ろに `<!--ng-container-->` がある、という意味です。63〜65 行目の「ハイドレーションの境目（例：コンポーネント）」のとおり、1 つの `SerializedView` はコンポーネント 1 つ分です。2 つの `<crh-child>` はどちらも `ngh="0"` で、中身の同じビューを 1 つにまとめていました（[ngh を書く章の 4 節](../platform/08-hydration-annotate.md)）。74〜77 行目の `t` は「template 命令の番号 → ハイドレーションで見分ける id」で、`@if` の 2 番が `t0`、`@for` の 5 番が `t1` でした。

📄 `angular/packages/core/src/hydration/interfaces.ts` L81–104 （▶ の行: 82–85, 90–93, 98–100, 102–103）

```ts
 81 │   /**
 82 ▶    * Serialized information about view containers.
 83 ▶    * Key-value pairs where a key is an index of the corresponding
 84 ▶    * LContainer entry within an LView, and the value is a list
 85 ▶    * of serialized information about views within this container.
 86 │    */
 87 │   [CONTAINERS]?: Record<number, SerializedContainerView[]>;
 88 │ 
 89 │   /**
 90 ▶    * Serialized information about nodes in a template.
 91 ▶    * Key-value pairs where a key is an index of the corresponding
 92 ▶    * DOM node in an LView and the value is a path that describes
 93 ▶    * the location of this node (as a set of navigation instructions).
 94 │    */
 95 │   [NODES]?: Record<number, string>;
 96 │ 
 97 │   /**
 98 ▶    * A list of ids which represents a set of nodes disconnected
 99 ▶    * from the DOM tree at the serialization time, but otherwise
100 ▶    * present in the internal data structures.
101 │    *
102 ▶    * This information is used to avoid triggering the hydration
103 ▶    * logic for such nodes and instead use a regular "creation mode".
104 │    */
```

82〜85 行目の `c` は「LContainer の番号 → 中のビューの一覧」です。記録の `"5":[{"i":"t1","r":1,"x":3}]` は、`@for` の中のビューの一覧です。90〜93 行目の `n`（道順）と 98〜103 行目の `d` は、小さなアプリには出ず、第 2 回のテンプレートの記録に出ました。`<ng-content>` の後ろの要素が `"n":{"3":"hfn2"}`（ホストから最初の子、次の兄弟を 2 回）、`<ng-content>` の無いコンポーネントに渡した要素が `"d":[4,5]` です。102〜103 行目「そういうノードはハイドレーションせず、普通の作成の流れで作る」は、ブラウザーの `canHydrateNode`（utils.ts L522〜531）が `isDisconnectedNode` で外すことで果たされます（[第 3 回](03-crh-hydration-errors.md)）。

📄 `angular/packages/core/src/hydration/interfaces.ts` L114–126 （▶ の行: 116–117, 119, 122, 124）

```ts
114 │ 
115 │   /**
116 ▶    * If this view represents a `@defer` block, this field contains
117 ▶    * unique id of the block.
118 │    */
119 ▶   [DEFER_BLOCK_ID]?: string;
120 │ 
121 │   /**
122 ▶    * This field represents a status, based on the `DeferBlockState` enum.
123 │    */
124 ▶   [DEFER_BLOCK_STATE]?: number;
125 │ }
126 │ 
```

📄 `angular/packages/core/src/hydration/interfaces.ts` L127–155 （▶ の行: 132, 134–138, 143–145, 150–152, 154）

```ts
127 │ /**
128 │  * Serialized data structure that contains relevant hydration
129 │  * annotation information about a view that is a part of a
130 │  * ViewContainer collection.
131 │  */
132 ▶ export interface SerializedContainerView extends SerializedView {
133 │   /**
134 ▶    * Unique id that represents a TView that was used to create
135 ▶    * a given instance of a view:
136 ▶    *  - TViewType.Embedded: a unique id generated during serialization on the server
137 ▶    *  - TViewType.Component: an id generated based on component properties
138 ▶    *                        (see `getComponentId` function for details)
139 │    */
140 │   [TEMPLATE_ID]: string;
141 │ 
142 │   /**
143 ▶    * Number of root nodes that belong to this view.
144 ▶    * This information is needed to effectively traverse the DOM tree
145 ▶    * and identify segments that belong to different views.
146 │    */
147 │   [NUM_ROOT_NODES]: number;
148 │ 
149 │   /**
150 ▶    * Number of times this view is repeated.
151 ▶    * This is used to avoid serializing and sending the same hydration
152 ▶    * information about similar views (for example, produced by *ngFor).
153 │    */
154 ▶   [MULTIPLIER]?: number;
155 │ }
```

コンテナの中のビュー（`SerializedContainerView`）は、132 行目のとおり `SerializedView` のキーをすべて持ったうえで（入れ子の `c`・`t` など）、134〜138 行目の `i` で「どの TView で作ったか」を持ちます。埋め込みのビューはサーバーで振った `t0`・`t1`、コンポーネントのビューは `getComponentId` の id です。ルートのコンポーネントが `ViewContainerRef` で隣にコンポーネントを足した記録では `"i":"c502613084"` でした。143〜145 行目の `r` は根のノードの数、150〜152 行目の `x` は「同じ形のビューが続いた回数。`*ngFor` で作ったような同じ情報を何度も送らないため」です。`@for` で 3 つの `<li>` を描いた記録は `x` が 3 で、1 つ分だけが書かれていました。152 行目の `*ngFor` は `@for` が入る前の例で、古いだけです（`@for` でもまとめる）。116〜124 行目の `di` と `s` は、`@defer` のビューに付きます。記録では `{"i":"t0","r":1,"di":"d0","s":2}` で、`s` の 2 は `DeferBlockState.Complete`（defer/interfaces.ts L186）です。

📄 `angular/packages/core/src/hydration/interfaces.ts` L156–192 （▶ の行: 158–159, 163, 165, 173–176, 181–182, 184, 188–190）

```ts
156 │ 
157 │ /**
158 ▶  * Serialized data structure that contains relevant defer block
159 ▶  * information that describes a given incremental hydration boundary
160 │  */
161 │ export interface SerializedDeferBlock {
162 │   /**
163 ▶    * This contains the unique id of this defer block's parent, if it exists.
164 │    */
165 ▶   [DEFER_PARENT_BLOCK_ID]?: string;
166 │ 
167 │   /**
168 │    * This field represents a status, based on the `DeferBlockState` enum.
169 │    */
170 │   [DEFER_BLOCK_STATE]?: number;
171 │ 
172 │   /**
173 ▶    * Number of root nodes that belong to this defer block's template.
174 ▶    * This information is needed to effectively traverse the DOM tree
175 ▶    * and add jsaction attributes to root nodes appropriately for
176 ▶    * incremental hydration.
177 │    */
178 │   [NUM_ROOT_NODES]: number;
179 │ 
180 │   /**
181 ▶    * The list of triggers that exist for incremental hydration, based on the
182 ▶    * `Trigger` enum.
183 │    */
184 ▶   [DEFER_HYDRATE_TRIGGERS]?: (DeferBlockTrigger | SerializedTriggerDetails)[];
185 │ }
186 │ 
187 │ export interface SerializedTriggerDetails {
188 ▶   trigger: DeferBlockTrigger;
189 ▶   delay?: number;
190 ▶   intersectionObserverOptions?: IntersectionObserverInit;
191 │ }
192 │ 
```

158〜159 行目の `SerializedDeferBlock` は、`__nghData__` とは別のキー `__nghDeferData__` に、ブロックの id ごとに入ります。5 つの `@defer` の記録は次でした。

| テンプレート | \_\_nghDeferData\_\_ の値（記録） |
| --- | --- |
| `@defer (hydrate on timer(50ms))` | `"d0":{"r":1,"s":2,"t":[{"trigger":5,"delay":50}]}` |
| `@defer (hydrate on immediate)` | `"d1":{"r":1,"s":2,"t":[1]}` |
| `@defer (hydrate on idle)` | `"d2":{"r":1,"s":2,"t":[0]}` |
| `@defer (hydrate never)` | `"d3":{"r":1,"s":2}` |
| `@defer (hydrate on interaction; prefetch on idle)` | `"d4":{"r":1,"s":2}` |

181〜182 行目の `t` は「インクリメンタルのトリガーの一覧（`Trigger` の enum で）」で、数は `DeferBlockTrigger`（Idle が 0、Immediate が 1、Timer が 5）でした。188〜190 行目の `SerializedTriggerDetails` は、timer の `delay` と viewport の `intersectionObserverOptions` の入れ物です。interaction と hover は一覧に入らず、要素の `jsaction` で表されます（[hydrate on interaction の章](../defer/18-defer-hydrate-events.md)）。163・165 行目の親の id（`p`）は入れ子のときだけ書かれます（[第 4 回](04-crh-defer.md)の記録）。説明文が無いものが 1 つあります。キーの定数の並び（L45〜49）にある `DEFER_PREFETCH_TRIGGERS = 'pt'` は、型にもこの節の説明文にも無く、ソースのどこからも読まれません。prefetch のトリガーは書き出されず、5 行目の記録にも `prefetch on idle` の跡はありません。95449302e95（2024-10-14、refactor(core): add incremental hydration infrastructure (#58193)）で入り、新しい本家では b493d767a4b（2026-11-01、refactor(core): remove unused internal code）で消えました。`t` の文字は、`SerializedView` の `TEMPLATES`（L37）と、このブロックの `DEFER_HYDRATE_TRIGGERS`（L48）で 2 回使われています。入る object が別なのでぶつかりません。

> **🧪 DEMO — このページの ng-state と、記録の ngh を並べる**
>
> 1 つ目のボタンは、このページの文書を**読むだけ**です。このサイトの HTML はビルドのときに platform-server で描いたもの（`outputMode: "static"`）で、`ng-state` の script はハイドレーションのあとも残ります。その `__nghData__` と `__nghDeferData__` のキーを数え、interfaces.ts の説明と並べます（crh-hydration-api.demo-doc.ts）。`ngh` の属性はハイドレーションで読み終えた要素から外すので（[ノードを確保する章](../platform/10-hydration-claim.md)）、0 個になります。  
>  2〜5 つ目は、章の初めに書いた 2 つのプロセスの記録です（crh-hydration-api.data.ts）。ページは platform-server を読み込みません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crh-hydration-api)

## 5. トークンの説明文

📄 `angular/packages/core/src/hydration/tokens.ts` L33–41 （▶ の行: 35–36, 38）

```ts
33 │ 
34 │ /**
35 ▶  * Internal token that indicates whether hydration support for i18n
36 ▶  * is enabled.
37 │  */
38 ▶ export const IS_I18N_HYDRATION_ENABLED = new InjectionToken<boolean>(
39 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'IS_I18N_HYDRATION_ENABLED' : '',
40 │ );
41 │ 
```

35〜36 行目「i18n のハイドレーションが有効かどうか」は、api.ts の L317〜318 で `IS_HYDRATION_DOM_REUSE_ENABLED` と同じ値を返す factory です。`withI18nSupport()` を書いても、ブラウザーに `__nghData__` が無ければ `false` です。

📄 `angular/packages/core/src/hydration/tokens.ts` L66–91 （▶ の行: 68–69, 71, 76, 78–79, 81, 86, 88）

```ts
66 │ 
67 │ /**
68 ▶  * Internal token that indicates whether incremental hydration support
69 ▶  * is enabled.
70 │  */
71 ▶ export const IS_INCREMENTAL_HYDRATION_ENABLED = new InjectionToken<boolean>(
72 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'IS_INCREMENTAL_HYDRATION_ENABLED' : '',
73 │ );
74 │ 
75 │ /**
76 ▶  * A map of DOM elements with `jsaction` attributes grouped by action names.
77 │  */
78 ▶ export const JSACTION_BLOCK_ELEMENT_MAP = new InjectionToken<Map<string, Set<Element>>>(
79 ▶   typeof ngDevMode !== 'undefined' && ngDevMode ? 'JSACTION_BLOCK_ELEMENT_MAP' : '',
80 │   {
81 ▶     factory: () => new Map<string, Set<Element>>(),
82 │   },
83 │ );
84 │ 
85 │ /**
86 ▶  * Internal token that indicates whether the initial navigation is blocking in the application.
87 │  */
88 ▶ export const IS_ENABLED_BLOCKING_INITIAL_NAVIGATION = new InjectionToken<boolean>(
89 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'IS_ENABLED_BLOCKING_INITIAL_NAVIGATION' : '',
90 │ );
91 │ 
```

68〜69 行目の `IS_INCREMENTAL_HYDRATION_ENABLED` は factory を持たず、api.ts の L347〜348 で `true` を入れたときだけあります。読む側の utils.ts の `isIncrementalHydrationEnabled`（L408〜412）は既定を `false` にして `optional` で読むので、無ければ「無効」です。

76 行目は `JSACTION_BLOCK_ELEMENT_MAP` を「`jsaction` の属性を持つ DOM の要素を、アクションの名前ごとにまとめた Map」と書きます。実際にこの Map に入れるのは event\_delegation\_utils.ts の `sharedMapFunction`（L61〜69）で、キーは要素の `ngb` の属性（`@defer` のブロックの id、`d0` など）、無ければ空文字です。event\_replay.ts の L57〜60 も、空文字を「`@defer` の外の、再生する要素ぜんぶ」のキーと書いていて、L176〜178 でそのキーの要素だけ印を外します。アクションの名前（`click` など）ではまとめていません。この説明は 95449302e95（2024-10-14、#58193）のときからで、新しい本家でも同じです。79 行目と 61 行目は名前の付け方が `typeof ngDevMode !== 'undefined' && ngDevMode` で、ほかのトークン（72 行目ほか）の `=== 'undefined' ||` と逆です。`ngDevMode` がまだ決まっていないときに名前が空になるだけで、動きは変わりません。86 行目の `IS_ENABLED_BLOCKING_INITIAL_NAVIGATION` は、ルーターの `enabledBlocking` と一緒に使ったときの警告に使います（[provideClientHydration の説明文の章の 3 節](../pbd/02-pbd-hydration.md)）。

## 6. イベントの再生の説明文

📄 `angular/packages/core/src/hydration/event_replay.ts` L68–75 （▶ の行: 70–71, 73）

```ts
68 │ 
69 │ /**
70 ▶  * Returns a set of providers required to setup support for event replay.
71 ▶  * Requires hydration to be enabled separately.
72 │  *
73 ▶  * @see [Capturing and replaying event](guide/hydration#capturing-and-replaying-events)
74 │  *
75 │  */
```

70〜71 行目「イベントの再生に要る provider の組。ハイドレーションは別に有効にすること」です。core のこの関数は platform-browser の `withEventReplay()` と、既定のインクリメンタル（api.ts L345）の両方から呼ばれます。v22 では書かなくても入っていることは[provideClientHydration の説明文の章の 2 節](../pbd/02-pbd-hydration.md)で確かめました。

📄 `angular/packages/core/src/hydration/event_replay.ts` L225–240 （▶ の行: 227–228, 230, 233, 238–239）

```ts
225 │ 
226 │ /**
227 ▶  * Extracts information about all DOM events (added in a template) registered on elements in a give
228 ▶  * LView. Maps collected events to a corresponding DOM element (an element is used as a key).
229 │  */
230 ▶ export function collectDomEventsInfo(
231 │   tView: TView,
232 │   lView: LView,
233 ▶   eventTypesToReplay: {regular: Set<string>; capture: Set<string>},
234 │ ): Map<Element, string[]> {
235 │   const domEventsInfo = new Map<Element, string[]>();
236 │   const lCleanup = lView[CLEANUP];
237 │   const tCleanup = tView.cleanup;
238 ▶   if (!tCleanup || !lCleanup) {
239 ▶     return domEventsInfo;
240 │   }
```

227〜228 行目は `collectDomEventsInfo` を「LView の要素に（テンプレートで）付けた、すべての DOM イベントの情報を取り出し、要素ごとにまとめる」と書きます。サーバーは annotate.ts の L556〜558 でこれを呼び、まとめた名前を L734〜738 で `jsaction` の属性にします。ところが本体は L248〜250 で `isEarlyEventType` に入らないイベントを飛ばし、L262〜265 で DOM のリスナーでないもの（`output` の購読）も飛ばします。DEMO の「jsaction の印」では、`(click)`・`(keydown)`・`(input)`・`(focus)`・`(blur)` は印になり、同じテンプレートの `(mouseenter)` と `(scroll)` は印になりませんでした。head の script は `window.__jsaction_bootstrap(document.body,"ng",["click","keydown","input"],["focus","blur"])` で、233 行目の `eventTypesToReplay` の `regular` と `capture` の 2 つです。「すべての DOM イベント」は、実際には記録の対象になるイベント（[イベントの記録と再生の章の 1 節](../platform/14-event-replay.md)）だけです。この説明は a730f09ae9e（2024-04-15、feat(core): Add a public API to establish events to be replayed …（#55356））からで、新しい本家でも同じです。`<ng-container (click)>` は L118 のとおりコメントのノードなので、印は付きません。

## 7. isInSkipHydrationBlock の 66 行目

📄 `angular/packages/core/src/hydration/skip_hydration.ts` L46–72 （▶ の行: 56–58, 61, 66）

```ts
46 │ 
47 │ /**
48 │  * Checks whether a TNode has a flag to indicate that it's a part of
49 │  * a skip hydration block.
50 │  */
51 │ export function hasInSkipHydrationBlockFlag(tNode: TNode): boolean {
52 │   return (tNode.flags & TNodeFlags.inSkipHydrationBlock) === TNodeFlags.inSkipHydrationBlock;
53 │ }
54 │ 
55 │ /**
56 ▶  * Helper function that determines if a given node is within a skip hydration block
57 ▶  * by navigating up the TNode tree to see if any parent nodes have skip hydration
58 ▶  * attribute.
59 │  */
60 │ export function isInSkipHydrationBlock(tNode: TNode): boolean {
61 ▶   if (hasInSkipHydrationBlockFlag(tNode)) {
62 │     return true;
63 │   }
64 │   let currentTNode: TNode | null = tNode.parent;
65 │   while (currentTNode) {
66 ▶     if (hasInSkipHydrationBlockFlag(tNode) || hasSkipHydrationAttrOnTNode(currentTNode)) {
67 │       return true;
68 │     }
69 │     currentTNode = currentTNode.parent;
70 │   }
71 │   return false;
72 │ }
```

56〜58 行目は「TNode の木を親へたどり、どれかの親に `ngSkipHydration` の属性があるかで、飛ばす範囲の中かを決める」と書きます。61 行目は自分の旗（`TNodeFlags.inSkipHydrationBlock`）を先に見て、あれば `true` を返します。66 行目の前半 `hasInSkipHydrationBlockFlag(tNode)` は、親の `currentTNode` ではなく自分の `tNode` を見ています。61 行目で `false` だった同じ式なので、ループの中では必ず `false` で、ループが見るのは後半の親の属性だけです。結果の動きは 56〜58 行目の説明どおりです。61 行目の早期の `return` と 66 行目の前半は、同じコミット dcf908634f6（2023-10-15、refactor(core): check "skip hydration" condition only when hydration info is present (#52221)）で足されました。新しい本家でも L70 に同じ式があります。

## ここまでの呼び出し（サーバーとブラウザーの両方に provideClientHydration を書いたとき）

- 👤 `renderApplication(bootstrap, {document, url})` — *サーバー*
  - `IS_HYDRATION_DOM_REUSE_ENABLED` の factory — api.ts L196〜209 — *サーバーは true のまま*
  - `prepareForHydration` — platform-server utils.ts L95〜 — *L101 で旗を読む*
    - `annotateForHydration` — annotate.ts L243〜301 — *ngh と \_\_nghData\_\_・\_\_nghDeferData\_\_（4 節）*
    - `collectDomEventsInfo` — event\_replay.ts L230〜273 — *記録の対象のイベントだけ（6 節）*
- 👤 `bootstrapApplication(App, {providers: [provideClientHydration()]})` — *ブラウザー*
  - `IS_HYDRATION_DOM_REUSE_ENABLED` の factory — api.ts L202〜203 — *\_\_nghData\_\_ があれば true*
  - `ENVIRONMENT_INITIALIZER` — api.ts L213〜246 — *無ければ開発モードで NG0505*
  - `APP_BOOTSTRAP_LISTENER` — api.ts L264〜302 — *安定したら片付けて、統計の 1 行（3 節）*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `platform-server/test/full_app_hydration_spec.ts` | `error handling`（6142）› `should log a warning when there was no hydration info in the TransferState`（6988） | 1 節の NG0505。例外にならないことは見ていない |
| `platform-server/test/full_app_hydration_spec.ts` | `error handling` › `should not log a warning when there was no hydration info in the TransferState, but a client mode marker is present`（7026） | 1 節の `ngcm`。走る順で落ちる（下の結果） |
| `platform-server/test/full_app_hydration_spec.ts` | `annotations`（129）› `should add hydration annotations to component host nodes during ssr`（130）・`should remove ngh attributes after hydration on the client`（237） | 4 節の `ngh` と、読み終えたら外すこと |
| `platform-server/test/full_app_hydration_spec.ts` | `ngSkipHydration`（3320）› `should skip hydrating when ng-containers exist and ngSkipHydration attribute is present`（3837） | 3 節の統計の行（3877 行目で文を比べる） |
| `platform-server/test/incremental_hydration_spec.ts` | 644 行目・2245 行目で「… defer block(s) were configured to use incremental hydration.」を比べる it | 3 節の 136 行目 |
| `platform-server/test/event_replay_spec.ts` | `event dispatch script`（643）› `should not replay mouse events`（687） | 6 節の `(mouseenter)` に印が付かないこと |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-server/test:test //packages/platform-server/test:event_replay_test \
    --nocache_test_results --test_output=all
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=no hydration info in the TransferState"
$ pnpm bazel test //packages/platform-server/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=no hydration info in the TransferState" "--test_arg=--seed=46107"
$ pnpm bazel test //packages/platform-server/test:event_replay_test --nocache_test_results --test_output=all \
    "--test_arg=--filter=should not replay mouse events"
```

手元の bazel（2026-11-22）で、test は 399 specs・0 failures、event\_replay\_test は 23 specs・0 failures でした。ところが 2 行目の絞り込み（6988 行目と、その下の 7026 行目の「client mode marker」の it の 2 つが当たる）を 6 回走らせると 4 回が「2 specs, 1 failure」で、落ちたのは 7026 行目の it でした（seed 46107 で毎回再現。NG0401「Missing Platform: This may be due to using \`bootstrapApplication\` on the server without passing a \`BootstrapContext\`.」）。integration\_spec.ts の L77・L468 が、ファイルを読み込んだときに NgModule の providers で provideServerRendering() を呼び、provide\_server.ts の L35〜37 が globalThis.ngServerMode を true にして戻しません。hydration\_utils.ts の ssr()（L246〜277）が最後に undefined に戻すまで、ブラウザーのつもりの bootstrapApplication はサーバー扱いになります。7026 行目の it は ssr() を呼ばないので、ほかのどの it よりも先に走ると落ちます。全部を走らせたときは、たまたまほかの it が先に ssr() を呼んでいました。新しい本家でも 3 か所とも同じです。

直すとしたら、どれも説明文の 1 行です。tokens.ts の 76 行目は「`@defer` のブロックの id（`ngb`）ごと、ブロックの外は空文字」に、event\_replay.ts の 227 行目は「再生の対象になる DOM イベント」に、annotate.ts の L287 は「開発モードで警告を出す」にします。utils.ts の `countBlocksSkippedByHydration`（355 行目）は数えているものに合わせて名前を変え、skip\_hydration.ts の 66 行目は前半を消すか `currentTNode` にします（後者は、親にだけ旗がある場合の動きが変わります）。spec は、full\_app\_hydration\_spec.ts の 6988 行目の隣に「本番では何も出ず、例外にもならない」it、event\_replay\_spec.ts に `JSACTION_BLOCK_ELEMENT_MAP` のキーが `ngb` の値になることを見る it を足します。

## 聞かれそうな質問

**Q. サーバーの設定に `provideClientHydration()` を入れ忘れると、どこで分かりますか？**

ブラウザーの開発モードで、console.warn の NG0505 です（api.ts L230〜245）。例外にはならず、普通の描画になります。本番と `<body ngcm>` のページでは何も出ません（DEMO の 5 つ目）。

**Q. `ngh="0"` の 0 は何の番号ですか？**

`ng-state` の `__nghData__` の配列の番号です。中身が同じなら別のコンポーネントでも同じ番号を共有します（記録の 2 つの `<crh-child>`、63〜65 行目）。

**Q. `"x":3` は何ですか？**

同じ形のビューが 3 つ続いたので、1 つ分だけ書いて回数を付けた、という印です（150〜152 行目）。`@for` でも `*ngFor` でも同じです。

**Q. `(mouseenter)` を書いた要素に `jsaction` が付かないのはなぜですか？**

`collectDomEventsInfo` が記録の対象のイベントだけを集めるからです（L248〜250）。227 行目の「すべての DOM イベント」より狭く、event\_replay\_spec.ts の 687 行目の it がこれを固めています。

**Q. 統計の行の「defer block(s) were configured」はハイドレートしていないブロックの数ですか？**

いいえ。`__nghDeferData__` のキーの数で（359 行目）、すでにハイドレートしたブロックも、`hydrate never` のブロックも数えます。

## 読み終えて

- `withDomHydration` の旗（`IS_HYDRATION_DOM_REUSE_ENABLED`）は、サーバーでは常に true、ブラウザーでは `__nghData__` があるときだけ true。
- `__nghData__` が無いときは開発モードの警告（NG0505）だけ。annotate.ts の「エラーになる」というコメントは実装と違う。
- `ngh` の型のコメントは記録の値と合う。合わないのは使われない `'pt'` の定数（新しい本家で削除）と、`JSACTION_BLOCK_ELEMENT_MAP` の「アクションの名前ごと」と、`collectDomEventsInfo` の「すべて」。
- 統計の 1 行は開発モードだけで、defer の数は「飛ばした数」ではなく hydrate のトリガーを持つブロックの数。

---

← 前: [spec と issue を読む：platform の説明文を固めているもの](../pbd/07-pbd-tests-issues.md)  
次: [ngh の書き出しの説明文：annotate と utils](02-crh-hydration-annotate.md) →
