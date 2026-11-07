[目次](../README.md) › [イベント配送（event-dispatch）と jsaction の内側](README.md) › 第 2 回 / 全 12 回

# jsaction 属性を読む：書式・解析・要素ごとのキャッシュ

> jsaction="click:handler;keydown:;" の書式（イベントの種類と行き先の名前を : と ; で区切る、名前を省いた形）と、ActionResolver の parseActions がそれを辞書に直す行、cache.ts が要素に解析の結果を貼っておく行（属性が変わったときの扱い）、attribute.ts・property.ts・char.ts の定数。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-attribute)

---

`jsaction="click:save;keydown:;"` のような属性の文字列が、どの関数で「種類 → 名前」の辞書になり、その辞書がどこに貼られ、いつ作り直されるのかを読みます。「属性を JS で書き換えたのに古い名前に届く」「空の名前は無いのと同じか」「`getActionCache` で中を見てよいか」に、行番号で答えられるようにします。

読む対象は `event-dispatch/README.md` の書式の節、`src/attribute.ts`・`src/char.ts`・`src/property.ts`・`src/cache.ts` と、`src/action_resolver.ts` の `parseActions` です。

1. [1. 全体像](01-jsaction-overview.md)
2. **2. jsaction 属性**（この章）
3. [3. EventInfo](03-jsaction-event-info.md)
4. [4. イベントの種類](04-jsaction-event-types.md)
5. [5. 早期の契約](05-jsaction-early-contract.md)
6. [6. EventContract](06-jsaction-contract.md)
7. [7. 行き先を探す](07-jsaction-resolver.md)
8. [8. a11y の click](08-jsaction-a11y-click.md)
9. [9. mouseenter とタッチ](09-jsaction-mouse-touch.md)
10. [10. Dispatcher](10-jsaction-dispatcher.md)
11. [11. Angular の側](11-jsaction-angular.md)
12. [12. spec と issue](12-jsaction-tests-issues.md)

## 1. 書式：README の文法

📄 `angular/packages/core/primitives/event-dispatch/README.md` L88–117 （▶ の行: 97, 99, 101–102, 107, 110–114）

````md
 88 │ ### `jsaction` attribute syntax
 89 │ 
 90 │ The value of the `jsaction` attribute encodes a mapping from event type to
 91 │ handler name. The grammar for its syntax in [EBNF
 92 │ format](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_form) is as
 93 │ follows:
 94 │ 
 95 │ ```ebnf
 96 │ ; JSAction attribute syntax in ENBF format
 97 ▶ jsaction-attr-value   = binding, { ";", jsaction-attr-value }
 98 │ 
 99 ▶ binding               = [ event-type, ":" ], event-handler
100 │ 
101 ▶ event-type            = { white space characters }, [valid-name], { white space characters }
102 ▶ event-handler         = { white space characters }, [valid-name], { white space characters }
103 │ 
104 │ valid-name            = { valid-char }
105 │ 
106 │ valid-char            = character - invalid-name-chars
107 ▶ invalid-name-chars    = ":" | ";" | "."
108 │ ```
109 │ 
110 ▶ - Omitting the event type and colon will default the binding to the `click`
111 ▶   event (e.g.`jsaction="handleClick;hover:handleHover"`)
112 ▶ - Both the event type and handler name can be the empty string (but make sure
113 ▶   to keep the colon: `jsaction="change:;"`)
114 ▶ - The `event-handler` is an arbitrary string that can store metadata needed to
115 │   find the handler that handles the event. The user of JSAction can choose to
116 │   define the semantics of the handler string however they like.
117 │ 
````

1. **97 行目：`;` で区切った「束縛（binding）」の並び**

   `click:save;keydown:open` は束縛が 2 つです。
2. **99 行目：1 つの束縛は「種類 `:` 名前」。種類と `:` は省ける**

   110〜111 行目、省いたときは `click` の束縛になります。`jsaction="save"` は `jsaction="click:save"` と同じ意味です。
3. **101〜102 行目：種類と名前の前後には空白を置いてよい**

   ただし、実装がどこを切り落とすかは 3 節で確かめます（コロンを省いた形では、文字列の端の空白が名前に残ります）。
4. **107 行目：名前に使えない文字は `:`・`;`・`.`**

   `.` は昔の「名前空間.名前」の区切りの名残りです（2 節）。
5. **112〜113 行目：種類も名前も空でよい。ただしコロンは残す**

   `jsaction="change:;"` は「change の行き先はこの要素。名前は空」です。Angular がサーバーで書くのはこの形です（5 節）。
6. **114〜116 行目：名前は使う側が意味を決める文字列**

   JSAction は名前を関数に結び付けません。名前をそのまま dispatcher の利用者に渡すだけです。

## 2. 3 つの定数のファイル

📄 `angular/packages/core/primitives/event-dispatch/src/attribute.ts` L9–23 （▶ の行: 15–17, 22）

```ts
 9 │ export const Attribute = {
10 │   /**
11 │    * The jsaction attribute defines a mapping of a DOM event to a
12 │    * generic event (aka jsaction), to which the actual event handlers
13 │    * that implement the behavior of the application are bound. The
14 │    * value is a semicolon separated list of colon separated pairs of
15 ▶    * an optional DOM event name and a jsaction name. If the optional
16 ▶    * DOM event name is omitted, 'click' is assumed. The jsaction names
17 ▶    * are dot separated pairs of a namespace and a simple jsaction
18 │    * name.
19 │    *
20 │    * See grammar in README.md for expected syntax in the attribute value.
21 │    */
22 ▶   JSACTION: 'jsaction' as const,
23 │ };
```

📄 `angular/packages/core/primitives/event-dispatch/src/char.ts` L9–21 （▶ の行: 14, 20）

```ts
 9 │ export const Char = {
10 │   /**
11 │    * The separator between the namespace and the action name in the
12 │    * jsaction attribute value.
13 │    */
14 ▶   NAMESPACE_ACTION_SEPARATOR: '.' as const,
15 │ 
16 │   /**
17 │    * The separator between the event name and action in the jsaction
18 │    * attribute value.
19 │    */
20 ▶   EVENT_ACTION_SEPARATOR: ':' as const,
21 │ };
```

attribute.ts の 22 行目が属性名 `'jsaction'` で、公開の入口から `Attribute` として出ています（Angular は `core/src/event_delegation_utils.ts` でこの名前を使って属性を書き・消します）。15〜18 行目のコメントは「名前は名前空間と単純な名前を `.` でつないだもの」と書いていますが、char.ts 14 行目の `NAMESPACE_ACTION_SEPARATOR` を読んでいる所は、今のソースにはありません（`grep` で確かめました）。使われているのは 20 行目の `EVENT_ACTION_SEPARATOR`（`':'`）だけで、3 節の `parseActions` が読みます。attribute.ts・char.ts・property.ts にあった ActionFlow（Google の内部の仕組み）用の値は 60a72af1633 でまとめて消されていて（コミットの説明は「google3 の ActionFlow の中に直接書かれていて、もう使われていない」）、`NAMESPACE_ACTION_SEPARATOR` は使われないまま残っています。

📄 `angular/packages/core/primitives/event-dispatch/src/property.ts` L9–34 （▶ の行: 15–17, 19, 26, 31–32）

```ts
 9 │ /** All properties that are used by jsaction. */
10 │ export const Property = {
11 │   /**
12 │    * The parsed value of the jsaction attribute is stored in this
13 │    * property on the DOM node. The parsed value is an Object. The
14 │    * property names of the object are the events; the values are the
15 ▶    * names of the actions. This property is attached even on nodes
16 ▶    * that don't have a jsaction attribute as an optimization, because
17 ▶    * property lookup is faster than attribute access.
18 │    */
19 ▶   JSACTION: '__jsaction' as const,
20 │   /**
21 │    * The owner property references an a logical owner for a DOM node. JSAction
22 │    * will follow this reference instead of parentNode when traversing the DOM
23 │    * to find jsaction attributes. This allows overlaying a logical structure
24 │    * over a document where the DOM structure can't reflect that structure.
25 │    */
26 ▶   OWNER: '__owner' as const,
27 │ };
28 │ 
29 │ declare global {
30 │   interface Node {
31 ▶     [Property.JSACTION]?: {[key: string]: string | undefined};
32 ▶     [Property.OWNER]?: ParentNode;
33 │   }
34 │ }
```

19 行目、解析した辞書は要素オブジェクトの `__jsaction` というプロパティに貼られます。15〜17 行目にあるとおり、**`jsaction` 属性の無い要素にも貼ります**。属性を読む（`getAttribute`）よりプロパティを読むほうが速いからです。26 行目の `__owner` は、親をたどるときに `parentNode` の代わりに使う「論理上の親」です（[第 7 回](07-jsaction-resolver.md)）。31〜32 行目で、DOM の `Node` 型にこの 2 つのプロパティを足しています。

## 3. parseActions：文字列から辞書へ

属性を解析するのは `ActionResolver` の `parseActions` です。関数の全体は [event-replay](../platform/14-event-replay.md) の 7 節で引用しているので、ここでは要の 2 か所だけを短く引きます（間の行は文で説明します）。呼ぶのは、対象から親へたどる途中の各要素で動く `populateActionOnElement` です（[第 7 回](07-jsaction-resolver.md)）。

📄 `angular/packages/core/primitives/event-dispatch/src/action_resolver.ts` L252–258 （▶ の行: 252–257）

```ts
252 ▶     let actionMap: {[key: string]: string | undefined} | undefined = cache.get(actionElement);
253 ▶     if (!actionMap) {
254 ▶       const jsactionAttribute = actionElement.getAttribute(Attribute.JSACTION);
255 ▶       if (!jsactionAttribute) {
256 ▶         actionMap = EMPTY_ACTION_MAP;
257 ▶         cache.set(actionElement, actionMap);
258 │       } else {
```
*入口：まず要素に貼られた辞書を見る*

1. **252〜253 行目：要素に辞書が貼ってあれば、それで終わり**

   `cache.get` は 4 節の `element.__jsaction` を返すだけです。**貼ってあれば属性を見に行きません。**属性を書き換えても、ここで古い辞書が返ります。
2. **254〜257 行目：属性が無い（または空文字）なら、空の辞書を貼る**

   `EMPTY_ACTION_MAP`（ファイルの先頭で 1 つだけ作るオブジェクト。[第 7 回](07-jsaction-resolver.md)で引用）を貼ります。`jsaction` の無い親を何度たどっても、2 回目からはプロパティを読むだけになります。

属性があるときは、258 行目の `else` に入り、まず属性の**文字列そのもの**をキーに、解析済みの辞書を探します（`cache.getParsed`。4 節）。無ければ、文字列を正規表現 `/\s*;\s*/`（`;` とその前後の空白）で割り、空の欠片は `continue` で飛ばし、残りを 1 つずつ次の行で辞書にします。

📄 `angular/packages/core/primitives/event-dispatch/src/action_resolver.ts` L268–274 （▶ の行: 268–272, 274）

```ts
268 ▶             const colon = value.indexOf(Char.EVENT_ACTION_SEPARATOR);
269 ▶             const hasColon = colon !== -1;
270 ▶             const type = hasColon ? value.substr(0, colon).trim() : DEFAULT_EVENT_TYPE;
271 ▶             const action = hasColon ? value.substr(colon + 1).trim() : value;
272 ▶             actionMap[type] = action;
273 │           }
274 ▶           cache.setParsed(jsactionAttribute, actionMap);
```
*1 つの欠片を「種類 → 名前」にする*

1. **268 行目：*最初の*`:` の位置を探す**

   `indexOf` なので、`click:a:b` は種類 `click`・名前 `a:b` になります。
2. **270 行目：コロンがあれば前を `trim()` して種類に。無ければ `click`**

   大文字小文字はそのままです。`CLICK:save` の種類は `"CLICK"` で、DOM の `click` とは一致しません。
3. **271 行目：コロンがあれば後ろを `trim()` して名前に。無ければ欠片をそのまま**

   コロンの無い形は `trim()` されません。`;` の前後の空白は割るときに消えますが、属性の文字列の先頭や末尾の空白は残ります（`jsaction=" save"` の名前は `" save"`）。
4. **272 行目：辞書に入れる。同じ種類が 2 回あれば後のほうが残る**
5. **274 行目：文字列をキーに、作った辞書を覚える**

   そのあと、その辞書を要素の `__jsaction` にも貼ります（4 節の `cache.set`）。

下の表は、このサイトの配布物（22.1.6）を使い、ヘッドレスの Chrome で、属性を付けたボタンを `click()` して、届いた名前と `__jsaction` を読んだ記録です。3 節の行のとおりになります。下のデモで同じことを自分の手で試せます。

| `jsaction` の値 | click で届いた名前 | 要素の `__jsaction` | 決めている行 |
| --- | --- | --- | --- |
| `"handleClick"` | `"handleClick"` | `{click: "handleClick"}` | 270・271（コロンなし） |
| `"click: a ; keydown : b "` | `"a"` | `{click: "a", keydown: "b"}` | 270・271 の `trim()` |
| `" foo"` | `" foo"` | `{click: " foo"}` | 271（コロンなしは trim しない） |
| `"click:;keydown:;"` | `""` | `{click: "", keydown: ""}` | 271（空の名前） |
| `";;click:x;;"` | `"x"` | `{click: "x"}` | 空の欠片を飛ばす `continue` |
| `"click:a:b"` | `"a:b"` | `{click: "a:b"}` | 268（最初のコロン） |
| `"keydown:;;keyup:"` | （行き先なし） | `{keydown: "", keyup: ""}` | click の束縛が無い |
| `"CLICK:x"` | （行き先なし） | `{CLICK: "x"}` | 270（大文字のまま） |
| `":x"` | （行き先なし） | `{"": "x"}` | 270（種類が空文字） |
| `"toString"` | （行き先なし） | 関数 `Object.prototype.toString` | `getParsed`（4 節の 4 番） |

## 4. cache.ts：2 つのキャッシュ

📄 `angular/packages/core/primitives/event-dispatch/src/cache.ts` L9–38 （▶ の行: 14, 19–20, 27–30, 36–37）

```ts
 9 │ import {Property} from './property';
10 │ 
11 │ /**
12 │  * Map from jsaction annotation to a parsed map from event name to action name.
13 │  */
14 ▶ const parseCache: {[key: string]: {[key: string]: string | undefined}} = {};
15 │ 
16 │ /**
17 │  * Reads the jsaction parser cache from the given DOM Element.
18 │  */
19 ▶ export function get(element: Element): {[key: string]: string | undefined} | undefined {
20 ▶   return element[Property.JSACTION];
21 │ }
22 │ 
23 │ /**
24 │  * Reads the jsaction parser cache for the given DOM element. If no cache is yet present,
25 │  * creates an empty one.
26 │  */
27 ▶ export function getDefaulted(element: Element): {[key: string]: string | undefined} {
28 ▶   const cache = get(element) ?? {};
29 ▶   set(element, cache);
30 ▶   return cache;
31 │ }
32 │ 
33 │ /**
34 │  * Writes the jsaction parser cache to the given DOM Element.
35 │  */
36 ▶ export function set(element: Element, actionMap: {[key: string]: string | undefined}) {
37 ▶   element[Property.JSACTION] = actionMap;
38 │ }
```

📄 `angular/packages/core/primitives/event-dispatch/src/cache.ts` L40–69 （▶ の行: 46–47, 56–57, 65–67）

```ts
40 │ /**
41 │  * Looks up the parsed action map from the source jsaction attribute value.
42 │  *
43 │  * @param text Unparsed jsaction attribute value.
44 │  * @return Parsed jsaction attribute value, if already present in the cache.
45 │  */
46 ▶ export function getParsed(text: string): {[key: string]: string | undefined} | undefined {
47 ▶   return parseCache[text];
48 │ }
49 │ 
50 │ /**
51 │  * Inserts the parse result for the given source jsaction value into the cache.
52 │  *
53 │  * @param text Unparsed jsaction attribute value.
54 │  * @param parsed Attribute value parsed into the action map.
55 │  */
56 ▶ export function setParsed(text: string, parsed: {[key: string]: string | undefined}) {
57 ▶   parseCache[text] = parsed;
58 │ }
59 │ 
60 │ /**
61 │  * Clears the jsaction parser cache from the given DOM Element.
62 │  *
63 │  * @param element .
64 │  */
65 ▶ export function clear(element: Element) {
66 ▶   if (Property.JSACTION in element) {
67 ▶     delete element[Property.JSACTION];
68 │   }
69 │ }
```

このファイルには、性質の違うキャッシュが 2 つあります。

|   | 要素ごとのキャッシュ | 文字列ごとのキャッシュ |
| --- | --- | --- |
| 置き場所 | 要素の `__jsaction`（36〜37 行目の `set`） | モジュールの変数 `parseCache`（14 行目） |
| キー | 要素そのもの | 属性の文字列（46〜47・56〜57 行目） |
| 読む関数 | `get`（19〜21 行目） | `getParsed` |
| 消す関数 | `clear`（65〜69 行目） | 無い（ページを閉じるまで残る） |

この作りから、次の 4 つのことが言えます。どれも下のデモで確かめられます。

1. **属性を書き換えても、要素のキャッシュは古いまま**

   一度イベントが通った要素には辞書が貼られ、3 節 252〜253 行目で属性を見なくなります。`setAttribute` を監視する仕組みはどこにもありません。作り直させるには 65〜68 行目の `clear`（`delete element.__jsaction`）が要ります。ところが `clear` は index.ts から出ておらず、配布物の 22.1.6 の束にも入っていません（使う所が無いので束ねるときに落ちています）。ソースの中で `clear` を呼んでいるのは spec（dispatcher\_test.ts 515 行目。下の「テストと直し方」）だけです。
2. **同じ文字列の要素は、同じ辞書オブジェクトを共有する**

   274 行目で覚えた辞書が、同じ文字列の 2 つ目の要素にもそのまま貼られます。1000 個のボタンが `jsaction="click:;"` でも、解析は 1 回です。そのかわり、ある要素の辞書を書き換えると、同じ文字列のほかの要素（これから解析される要素も）に効いてしまいます。属性の無い要素の `EMPTY_ACTION_MAP` も全部で 1 つです。
3. **`getActionCache`（27〜31 行目の `getDefaulted`）は読むだけではない**

   28 行目、貼られていなければ `{}` を作り、29 行目で**貼ります**。まだイベントが通っていない要素にこれを呼ぶと、空の辞書が貼られ、3 節 252〜253 行目でそれが使われ続けるので、**その要素の `jsaction` 属性は二度と読まれません**。この関数は、以前 Angular が属性を書かずに辞書へ直接書き込む実験（全体の委譲）で使っていたもので、その実験は 5f356fc0920 で消され、今は Angular の中から呼ばれていません。
4. **文字列が `Object.prototype` の名前と同じだと、22.1.6 では壊れる**

   14 行目の `parseCache` は `{}` なので、`getParsed("toString")`（47 行目）は「覚えていない」ではなく、`Object.prototype.toString` 関数を返します。3 節の `getParsed` の直後の `if (!actionMap)` を素通りして、その関数が辞書として要素に貼られ、`jsaction="toString"`（= `click:toString`）の行き先が見つかりません。同じことは辞書を引く側でも起きます。`{}` の辞書を `actionMap["toString"]` と引くと、書いていない種類なのに関数が返り、`undefined` でないので「行き先あり」になります。手元の版より後の `main` の 8d8859cb211（v22.3.0-next.0 から）が、3 つの `{}` を `Object.create(null)`（プロトタイプの無いオブジェクト）に替えて、両方を直しています。

📄 `8d8859cb211 の中身（git show を短くしたもの）`

```
$ git -C ../angular show 8d8859cb211 --stat
fix(core): don't use plain objects as maps for jsaction data
 packages/core/primitives/event-dispatch/src/action_resolver.ts | 5 +++--
 packages/core/primitives/event-dispatch/src/cache.ts           | 6 ++++--

（action_resolver.ts）
-const EMPTY_ACTION_MAP: {[key: string]: string} = {};
+const EMPTY_ACTION_MAP: {[key: string]: string} = /* @__PURE__ */ Object.create(null);
-          actionMap = {};
+          actionMap = Object.create(null) as {[key: string]: string | undefined};
（cache.ts）
-const parseCache: {[key: string]: {[key: string]: string | undefined}} = {};
+const parseCache: {[key: string]: {[key: string]: string | undefined}} =
+  /* @__PURE__ */ Object.create(null);
-  const cache = get(element) ?? {};
+  const cache = get(element) ?? Object.create(null);
```

> [!NOTE]
> **ポイント**
>
> Angular が書く `jsaction` は `click:;` の形だけで、文字列が `"toString"` のようになることはありません。8d8859cb211 は、ライブラリとして「プロトタイプの名前と同じキーを辞書から引くと、`undefined` ではなく継承した値が出る」こと（コミットの説明文）を直したもので、Angular の利用者の画面で起きていた不具合の報告に結び付いたものではありません（コミットに issue の番号はありません）。

## 5. Angular はこの属性をどう使っているか

Angular がこの属性を書くのはサーバーだけです。テンプレートにリスナーのある要素に、種類ごとに `"click" + ":;"` をつないで `jsaction="click:;keydown:;"` を書きます（`setJSActionAttributes`。[event-replay](../platform/14-event-replay.md) の 2 節、[hydration-annotate](../platform/08-hydration-annotate.md)）。名前は空ですが、3 節の 271 行目で `""` が入るので、辞書を引くと `undefined` ではなく `""` が返り、「この要素が行き先」と判定されます。Angular は名前を使わず、要素に預けた関数（`__jsaction_fns`）を呼ぶので、空で足ります。

アプリが安定したあと、Angular は `@defer` の外の要素から `jsaction` 属性を`removeAttribute` で消します（`removeListeners`。[event-replay](../platform/14-event-replay.md) の 8 節）。消すのは属性と `ngb` と `__jsaction_fns` で、**要素に貼られた `__jsaction` は消しません**。4 節の 1 番のとおり、一度解析された要素は属性が消えても辞書が残ります。インクリメンタルハイドレーションで body の契約が残っていると、その要素のクリックは今も「行き先あり」になりますが、Angular の側の関数は再生のイベントか `@defer` の塊の要素でなければ何もしません（[第 11 回](11-jsaction-angular.md)）。

## 6. 本物で試す

> **🧪 DEMO — jsaction を書き換えて、届く名前とキャッシュを見る（ライブ）**
>
> 「始める」で、赤い枠（`#jsa-at-stage`）に本物の `EventContract` と `EventDispatcher`（@angular/core 22.1.6）を作り、`click`・`dblclick`・`keydown`・`keyup` を聞きます。要素 A と B の `jsaction` は、章のコードが `setAttribute` で書きます。「属性を書き換えてキャッシュも消す」は、`cache.ts` の `clear`（入口に無い）と同じ `delete element.__jsaction` を章のコードで行います。`__jsaction` の表示は、プロパティを読むだけです（`getActionCache` は呼びません）。
>
> 試し方の例：(1) 始める → A を押す（`"save"` が届き、`__jsaction` が貼られる）。(2) 例の `click:;keydown:;` を選び「属性だけ書き換える」→ A を押す（属性は変わったのに `"save"` のまま。252〜253 行目）。(3)「属性を書き換えてキャッシュも消す」→ A を押す（`""` が届き、Enter の keydown も届く）。(4) `toString` を選んでキャッシュも消して押す（22.1.6 では行き先なし、`__jsaction` が関数になる）。(5)「作り直す」（A と B の `__jsaction` も消して始め直す）→ A を押す前に「getActionCache(A) を呼ぶ」→ A を押す（属性があるのに行き先なし）。B は A と同じ文字列なので、両方押すと「同じオブジェクト」が `true` になります（274 行目の共有）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/jsaction-attribute)

> [!WARNING]
> **ハマりどころ**
>
> デモの外枠（`#jsa-at-wrap`）で `stopPropagation` しています。このページの `<body>` にある Angular 自身の契約とぶつからないようにするためです（理由は[第 1 回](01-jsaction-overview.md)の注意）。なお `parseCache` はモジュールに 1 つなので、デモで覚えた文字列は、Angular 自身の契約が解析するときにも同じものが使われます。

## ここまでの呼び出し

- `Dispatcher.dispatch(eventInfo)` — dispatcher.ts L78
  - `ActionResolver.resolveAction()` → `populateAction()` — action\_resolver.ts L104 / L135 — *対象から親へ（第 7 回）*
    - `populateActionOnElement(actionElement, eventInfo)` — action\_resolver.ts L230 — *要素ごと*
      - `parseActions(actionElement)` — action\_resolver.ts L251
        - `cache.get(element)` — cache.ts L19 — *貼ってあればここで終わり*
        - `element.getAttribute('jsaction')` — action\_resolver.ts L254 — *Attribute.JSACTION*
        - `cache.getParsed(text)` — cache.ts L46 — *同じ文字列を解析済みならそれ*
        - `text.split(/\s*;\s*/)` → `indexOf(':')` → `trim()` — action\_resolver.ts L262〜L272
        - `cache.setParsed(text, map)` → `cache.set(element, map)` — cache.ts L56 / L36 — *element.\_\_jsaction = map*
      - `actionMap[eventType]` が `undefined` でなければ行き先 — action\_resolver.ts L233

## テストと直し方

属性の解析とキャッシュを確かめている `it` は、`test/dispatcher_test.ts` の `describe('Dispatcher')`（332 行目）の中にあります。

| 行 | `it` の名前 | 確かめていること |
| --- | --- | --- |
| 455 | `caches jsaction attribute` | 属性を `renamedHandleClick` に書き換えても、次のクリックは `handleClick` に届く（4 節の 1 番） |
| 491 | `re-parses jsaction attribute if the action cache is cleared` | `cache.clear` の後は新しい名前に届く |
| 529 | `handles trailing semicolon in jsaction attribute` | `"handleClick;"`（空の欠片を飛ばす） |
| 552 | `handles jsaction attributes without action names, first action` | `"keydown:;;keyup:"` の keydown は名前 `""` で届く |
| 575 | `handles jsaction attributes without action names, last action` | 同じ属性の keyup も `""` で届く |
| 598 | `does not handle jsaction attributes without event type or action name` | 同じ属性に click は無いので、行き先は `undefined` |

📄 `angular/packages/core/primitives/event-dispatch/test/dispatcher_test.ts` L491–527 （▶ の行: 503, 510, 513, 515, 518, 525）

```ts
491 │   it('re-parses jsaction attribute if the action cache is cleared', () => {
492 │     const container = getRequiredElementById('click-container');
493 │     const actionElement = getRequiredElementById('click-action-element');
494 │     const targetElement = getRequiredElementById('click-target-element');
495 │ 
496 │     const eventContract = createEventContract({
497 │       container,
498 │       eventTypes: ['click'],
499 │     });
500 │     const dispatchDelegate = createDispatchDelegateSpy();
501 │     createDispatcher({dispatchDelegate, eventContract});
502 │ 
503 ▶     let clickEvent = dispatchMouseEvent(targetElement);
504 │ 
505 │     expect(dispatchDelegate).toHaveBeenCalledTimes(1);
506 │     let eventInfoWrapper = dispatchDelegate.calls.mostRecent().args[0];
507 │     expect(eventInfoWrapper.getEventType()).toBe('click');
508 │     expect(eventInfoWrapper.getEvent()).toBe(clickEvent);
509 │     expect(eventInfoWrapper.getTargetElement()).toBe(targetElement);
510 ▶     expect(eventInfoWrapper.getAction()?.name).toBe('handleClick');
511 │     expect(eventInfoWrapper.getAction()?.element).toBe(actionElement);
512 │ 
513 ▶     actionElement.setAttribute('jsaction', 'renamedHandleClick');
514 │     // Clear attribute cache.
515 ▶     cache.clear(actionElement);
516 │     dispatchDelegate.calls.reset();
517 │ 
518 ▶     clickEvent = dispatchMouseEvent(targetElement);
519 │ 
520 │     expect(dispatchDelegate).toHaveBeenCalledTimes(1);
521 │     eventInfoWrapper = dispatchDelegate.calls.mostRecent().args[0];
522 │     expect(eventInfoWrapper.getEventType()).toBe('click');
523 │     expect(eventInfoWrapper.getEvent()).toBe(clickEvent);
524 │     expect(eventInfoWrapper.getTargetElement()).toBe(targetElement);
525 ▶     expect(eventInfoWrapper.getAction()?.name).toBe('renamedHandleClick');
526 │     expect(eventInfoWrapper.getAction()?.element).toBe(actionElement);
527 │   });
```
*キャッシュを消すと解析し直す（455 行目の it と、515 行目の 1 行だけが違う）*

503 行目の 1 回目のクリックで 510 行目の `handleClick` に届き、要素に辞書が貼られます。513 行目で属性を書き換え、515 行目で `cache.clear` を呼んでから押すと、525 行目のとおり新しい名前に届きます。455 行目の `it` は 515 行目が無い版で、そのときは古い名前のまま、という確かめ方です。要素は、ファイルの先頭の `domContent` にある `<div id="click-action-element" jsaction="handleClick">`（種類を省いた形）です。

📄 `手元で走らせるコマンド`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/primitives/event-dispatch/test:browser_test_chromium \
  --nocache_test_results --test_output=all
```

📄 `走らせた結果`

```
（2026-11-06、このマシンで実行）
Chromium: 1/1 test files | 111 passed, 0 failed
//packages/core/primitives/event-dispatch/test:browser_test_chromium   PASSED in 0.8s
（'--test_arg=--filter=caches jsaction' を付けても 111 passed。1 つだけは走らせられない）
```

- **直す入口**：書式の解釈を変えるなら `action_resolver.ts` の `parseActions`、キャッシュの持ち方を変えるなら `cache.ts` です。spec は `dispatcher_test.ts` の上の 6 つの隣に足すのが自然です（`cache.ts` には自分の spec ファイルがありません）。
- **8d8859cb211 の spec**：直しのコミットが変えたのは `src/` の 2 ファイルだけで、spec はその直前の 5cb3ed2958a（「失敗する spec だけを先に入れる」コミット）が `dispatcher_test.ts` の最後に `it('action map does not resolve Object.prototype properties as actions')` として足しています。その `it` は `eventType` が `'toString'` の `EventInfo` を `ActionResolver.resolveAction` に渡し、行き先が `undefined` になることを見るもので、**辞書を引く側**の衝突です。属性の**文字列**が `"toString"` のとき（`parseCache` のキーの衝突）は、その spec では確かめていません。手元で確かめるなら、455 行目の `it` と同じ形で `jsaction="toString"` の要素を押し、`getAction()?.name` が `'toString'` になるかを見ます。この形の確かめを、配布物の 22.1.6・手元の版のソース・`main` のソース（どれも esbuild で束ねたもの）に対してヘッドレスの Chrome で走らせると、22.1.6 と手元の版は行き先が見つからず、`main` は `'toString'` に届きました。
- 属性を書き換えたら作り直してほしい、という変更は、4 節の 1 番のとおり「どこからも `clear` が呼ばれない」ことと、Angular が辞書を共有させて解析を 1 回にしていることの両方に関わります。issue を読むときは、属性とキャッシュのどちらの話かを先に分けます（[第 12 回](12-jsaction-tests-issues.md)）。

## 聞かれそうな質問

**Q. JS で `jsaction` 属性を書き換えたら、次のクリックから新しい名前になりますか？**

一度イベントが通った要素ではなりません。action\_resolver.ts 252〜253 行目で、要素に貼られた `__jsaction` があれば属性を読まないからです。dispatcher\_test.ts 455 行目の `it` がこの振る舞いを確かめています。作り直すには cache.ts 65〜68 行目の `clear` が要りますが、公開の入口には出ていません。

**Q. `jsaction="click:;"` の空の名前は、「書いていない」のと同じですか？**

違います。271 行目で名前は `""` になり、272 行目で辞書に入ります。辞書を引いた値が `undefined` でなければ行き先なので、空でもこの要素が行き先になります。Angular はこの形を書きます。「書いていない」のは `"keydown:;;keyup:"` の click のように、種類そのものが辞書に無い場合です（dispatcher\_test.ts 598 行目）。

**Q. 同じ `jsaction` のボタンが 1000 個あると、解析も 1000 回ですか？**

1 回です。cache.ts 14 行目の `parseCache` が属性の文字列をキーに辞書を覚え（274 行目）、2 つ目からは cache.ts 46〜47 行目の `getParsed` がそれを返します。ただし要素への貼り付け（`__jsaction`）は、その要素をイベントが通るたびに初めの 1 回行われます。全部の要素が同じ辞書オブジェクトを指します。

**Q. `getActionCache(element)` で、要素の解析結果を見てもよいですか？**

見るだけのつもりで呼ぶと壊れることがあります。cache.ts 28〜29 行目で、貼られていなければ空の `{}` を貼るので、まだ解析されていない要素では、その後 `jsaction` 属性が読まれなくなります。見るだけなら `element.__jsaction`（property.ts 19 行目）を読みます。デモの表示もそうしています。

**Q. 種類を省いた `jsaction="save"` は、Ctrl を押しながらのクリックでも動きますか？**

省いた形は 270 行目で `click` の束縛になります。修飾キー付きのクリックは、解析より前に種類が `clickmod` に書き換えられるので、`click` の束縛には届きません（`resolveEventType`。[第 7 回](07-jsaction-resolver.md)）。修飾キー付きでも受けたいときは `clickmod:save` を書きます。ヘッドレスの Chrome で、`"click:plain;clickmod:mod"` の要素を Shift を押した `click` で押すと `"mod"` に届きました。Angular がサーバーで書く `click:;` にも同じことが言えます。`event_replay.ts` は `EventDispatcher` を 2 つ目の引数（`clickModSupport`、既定は `true`）なしで作るので、配布物の 22.1.6 で同じ形（`jsaction="click:;"`、dispatcher の登録前に Shift つきと無しのクリックを 1 回ずつ）を試すと、渡されたのは Shift の無いほうだけでした（[第 7 回](07-jsaction-resolver.md)・[第 11 回](11-jsaction-angular.md)）。

## 読み終えて

- `jsaction` は `;` で区切った「種類:名前」の並び。種類を省くと click、名前は空でもよく、空でも「行き先あり」。
- `parseActions` は最初の `:` で割り、コロンのある形だけ `trim()` する。大文字小文字はそのまま。
- 解析の結果は要素の `__jsaction` と、文字列ごとの `parseCache` の 2 か所に残る。どちらも属性の変更では作り直されない。
- `getActionCache` は無ければ空を貼るので、読むだけには使わない。
- 22.1.6 では `"toString"` のような文字列で行き先が見つからない。`main` の 8d8859cb211 が `Object.create(null)` で直した（spec は 5cb3ed2958a。辞書を引く側だけを確かめている）。

---

← 前: [JSAction の全体像：契約・行き先の解決・配送](01-jsaction-overview.md)  
次: [EventInfo：イベントを運ぶ入れ物の形](03-jsaction-event-info.md) →
