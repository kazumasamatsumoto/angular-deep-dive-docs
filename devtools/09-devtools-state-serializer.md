[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 9 回 / 全 20 回

# プロパティを送れる形にする：state-serializer

> serializeDirectiveState と serialized-descriptor-factory.ts が、インスタンスのプロパティを型（prop-type.ts）ごとに Descriptor に直す行、深さの上限、signal・getter・関数・null-prototype のオブジェクトの扱い。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-state-serializer)

---

DevTools のパネルに並ぶ「プロパティ」は、ページの中のコンポーネントのインスタンスそのものではありません。バックエンドがインスタンスのプロパティを 1 つずつ型で見分け、`Descriptor` という小さなオブジェクト（型・表示の文字列・編集できるか・開けるか・値）に直して、メッセージで送ったものです。この章では、その変換の入口 `serializeDirectiveState` から、型を決める `getPropType`、Descriptor を作る 3 つの関数までを、行で追います。

読む対象は `devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/` の `state-serializer.ts`・`serialized-descriptor-factory.ts`・`prop-type.ts`・`object-utils.ts` と、`shared/utils/general.ts` です。

1. [1. 全体像](01-devtools-overview.md)
2. [2. Angular を見つける](02-devtools-detect.md)
3. [3. メッセージの道](03-devtools-messaging.md)
4. [4. プロトコル](04-devtools-protocol.md)
5. [5. コンポーネントの木](05-devtools-component-tree.md)
6. [6. 制御フローの塊](06-devtools-control-flow.md)
7. [7. 同じノードを見分ける](07-devtools-identity.md)
8. [8. パネルの木](08-devtools-forest-ui.md)
9. **9. プロパティの直列化**（この章）
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

## 0. どこから呼ばれるか

パネルで木の行を選ぶと、パネルは `getLatestComponentExplorerView` を送ります。バックエンドの `getLatestComponentState`（component-tree.ts、[第 5 回](05-devtools-component-tree.md)の持ち場）が、選ばれた要素のディレクティブとコンポーネントを 1 つずつ取り出し、「全部ください」という頼み（`propertyQuery.type` が `PropertyQueryTypes.All`）なら `serializeDirectiveState(instance)` を、「開いている行だけ深く」という頼み（`Specified`）なら `deeplySerializeSelectedProperties` を呼びます。後者は[第 10 回](10-devtools-property-resolver.md)で読みます。送られる `Descriptor` の型（`expandable`・`value?`・`editable`・`type`・`preview`・`containerType` の 6 つ）と `PropType` の enum は protocol の messages.ts にあり、[第 4 回](04-devtools-protocol.md)が読みます。

## 1. 入口：serializeDirectiveState

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/state-serializer.ts` L119–134 （▶ の行: 119, 121–124, 127, 133）

```ts
119 ▶ export function serializeDirectiveState(instance: object): Record<string, Descriptor> {
120 │   const result: Record<string, Descriptor> = {};
121 ▶   const value = unwrapSignal(instance);
122 ▶   const isReadonly = isSignal(instance);
123 ▶   getKeys(value).forEach((prop) => {
124 ▶     if (typeof prop === 'string' && ignoreList.has(prop)) {
125 │       return;
126 │     }
127 ▶     result[prop] = levelSerializer(value, prop, isReadonly, 0, 0);
128 │   });
129 │   return result;
130 │ }
131 │ 
132 │ export function serializeValue(value: unknown, level = 0): Descriptor {
133 ▶   return levelSerializer({value}, 'value', false, 0, level);
134 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/state-serializer.ts` L22–28 （▶ の行: 23, 25, 27）

```ts
22 │ // todo(aleksanderbodurri) pull this out of this file
23 ▶ const METADATA_PROPERTY_NAME = '__ngContext__';
24 │ 
25 ▶ const ignoreList = new Set([METADATA_PROPERTY_NAME, '__ngSimpleChanges__']);
26 │ 
27 ▶ const MAX_LEVEL = 1;
28 │ 
```

1. **121〜122 行目：インスタンスが signal なら中身を読む**

   ディレクティブのインスタンスが signal であることはまずありませんが、同じ関数を入れ子の値（[第 10 回](10-devtools-property-resolver.md)で signal の中を開くとき）にも使うためです。signal の中身として読んだものは、122 行目で「読み取り専用」とみなします。
2. **123 行目：キーを `getKeys` で集める**

   何を「プロパティ」とみなすかはここで決まります（2 節）。
3. **124 行目：`__ngContext__` と `__ngSimpleChanges__` を飛ばす**

   25 行目の集合です。`__ngContext__` は Angular が要素やインスタンスに付ける「どの LView に属するか」の目印（[ivy-lview](../ivy/06-ivy-lview.md)）、`__ngSimpleChanges__` は `ngOnChanges` のために前回の値を持っておく欄で、どちらも利用者のプロパティではありません。
4. **127 行目：1 つずつ `levelSerializer(value, prop, isReadonly, 0, 0)`**

   最後の 2 つの引数が「いまの深さ 0、上限 0」です。上限が 0 なので、オブジェクトや配列の**中身は送りません**（5 節）。27 行目の `MAX_LEVEL = 1` は、第 10 回の `deeplySerializeSelectedProperties` の側で使われる上限です。

133 行目の `serializeValue` は、値 1 つを `{value}` という入れ物に入れて同じ関数に通す近道です。signal のグラフのノードの preview（[第 17 回](17-devtools-signal-graph.md)）と、`@for` の塊の要素（[第 6 回](06-devtools-control-flow.md)、深さの上限 5）で使われます。

## 2. どれをプロパティとみなすか：getKeys

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/object-utils.ts` L11–48 （▶ の行: 11–13, 22, 25, 28, 34, 37, 46–48）

```ts
11 ▶ // Intentionally do not include all the prototype (Except for getters and setters)
12 ▶ // because it contains inherited methods (hasOwnProperty, etc.). Also ignore symbols
13 ▶ // because it is tricky to pass a path to a symbol.
14 │ //
15 │ // We'd have to go through a serialization and deserialization logic
16 │ // which will add unnecessary complexity.
17 │ export function getKeys(obj: {}): string[] {
18 │   if (!obj) {
19 │     return [];
20 │   }
21 │   obj = unwrapSignal(obj);
22 ▶   const properties = Object.getOwnPropertyNames(obj);
23 │ 
24 │   // Object.getPrototypeOf can return null, on empty objectwithout prototype for example
25 ▶   const prototypeMembers = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(obj) ?? {});
26 │ 
27 │   const ignoreList = ['__proto__'];
28 ▶   const gettersAndSetters = Object.keys(prototypeMembers).filter((methodName) => {
29 │     if (ignoreList.includes(methodName)) {
30 │       return false;
31 │     }
32 │     const targetMethod = prototypeMembers[methodName];
33 │ 
34 ▶     return targetMethod.get || targetMethod.set;
35 │   });
36 │ 
37 ▶   return properties.concat(gettersAndSetters);
38 │ }
39 │ 
40 │ /**
41 │  * This helper function covers the common scenario as well as the getters and setters
42 │  * @param instance The target object
43 │  * @param propName The string representation of the target property name
44 │  * @returns The Descriptor object of the property
45 │  */
46 ▶ export const getDescriptor = (instance: any, propName: string): PropertyDescriptor | undefined =>
47 ▶   Object.getOwnPropertyDescriptor(instance, propName) ||
48 ▶   Object.getOwnPropertyDescriptor(Object.getPrototypeOf(instance), propName);
```

- 22 行目：インスタンス自身が持つ名前（`Object.getOwnPropertyNames`）。クラスのフィールドはコンストラクタの中でインスタンスに置かれるので、すべてここに入ります。`private` のフィールド（TypeScript の `private` は実行時にはただのプロパティ）も入ります。
- 25〜35 行目：プロトタイプ（クラスの `prototype`）の上のものは、**getter か setter のあるものだけ**。11〜13 行目のコメントのとおり、メソッドは入れません（`hasOwnProperty` のような継承したメソッドまで並んでしまうため）。見るのは 1 段上のプロトタイプだけで、親クラスの getter はたどりません。
- シンボルをキーにしたプロパティも入れません（12〜13 行目。道筋を送るのが難しいため）。
- 25 行目の `?? {}` は、`Object.create(null)` のようにプロトタイプが `null` のオブジェクトでも落ちないためのものです。
- 46〜48 行目の `getDescriptor` は、あとで「getter か」「書き込めるか」を見るために、自分 → 1 段上のプロトタイプの順でプロパティ記述子を探します。

## 3. 型を決める：getPropType と signal の読み方

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/prop-type.ts` L13–45 （▶ の行: 29–32, 34, 37, 40, 43）

```ts
13 │ const commonTypes = {
14 │   boolean: PropType.Boolean,
15 │   bigint: PropType.BigInt,
16 │   function: PropType.Function,
17 │   number: PropType.Number,
18 │   string: PropType.String,
19 │   symbol: PropType.Symbol,
20 │ };
21 │ 
22 │ /**
23 │  * Determines the devtools-PropType of a component's property
24 │  * @param prop component's property
25 │  * @returns PropType
26 │  * @see `devtools/projects/protocol`
27 │  */
28 │ export const getPropType = (prop: unknown): PropType => {
29 ▶   if (isSignal(prop)) {
30 ▶     const {error, value} = safelyReadSignalValue(prop);
31 ▶     if (error) {
32 ▶       return PropType.Unknown;
33 │     }
34 ▶     prop = value;
35 │   }
36 │ 
37 ▶   if (prop === undefined) {
38 │     return PropType.Undefined;
39 │   }
40 ▶   if (prop === null) {
41 │     return PropType.Null;
42 │   }
43 ▶   if (prop instanceof HTMLElement) {
44 │     return PropType.HTMLNode;
45 │   }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/prop-type.ts` L46–66 （▶ の行: 47, 51, 53, 55, 57, 59, 62, 65）

```ts
46 │   const type = typeof prop;
47 ▶   if (type in commonTypes) {
48 │     return commonTypes[type as keyof typeof commonTypes];
49 │   }
50 │   if (type === 'object') {
51 ▶     if (Array.isArray(prop)) {
52 │       return PropType.Array;
53 ▶     } else if (prop instanceof Set) {
54 │       return PropType.Set;
55 ▶     } else if (prop instanceof Map) {
56 │       return PropType.Map;
57 ▶     } else if (Object.prototype.toString.call(prop) === '[object Date]') {
58 │       return PropType.Date;
59 ▶     } else if (prop instanceof Node) {
60 │       return PropType.HTMLNode;
61 │     } else {
62 ▶       return PropType.Object;
63 │     }
64 │   }
65 ▶   return PropType.Unknown;
66 │ };
```

1. **29〜35 行目：signal なら中身の型で決める**

   `signal(1)` の型は Function ではなく **Number** です。読むときに例外が出たら（computed の中で throw した場合など）32 行目で `Unknown`。signal かどうかは、ページの `window.ng.isSignal` に聞きます（下の general.ts）。
2. **37〜49 行目：undefined → null → HTMLElement → typeof の 6 種**

   順番に意味があります。`typeof null` は `'object'` なので、40 行目で先に分けます。
3. **50〜64 行目：オブジェクトを細かく分ける**

   配列 → Set → Map → Date → DOM の Node → それ以外は Object。57 行目は `instanceof Date` ではなく `Object.prototype.toString` で見るので、別の realm（iframe など）で作った Date も Date になります。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/utils/general.ts` L40–67 （▶ の行: 41–43, 45, 50, 53, 58, 62, 64）

```ts
40 │ export function isSignal(prop: unknown): prop is (() => unknown) & {set: (value: unknown) => void} {
41 ▶   const ng = ngDebugClient();
42 ▶   if (!ngDebugApiIsSupported(ng, 'isSignal')) {
43 ▶     return false;
44 │   }
45 ▶   return (window as any).ng.isSignal(prop);
46 │ }
47 │ 
48 │ export function safelyReadSignalValue(signal: any): {error?: Error; value?: any} {
49 │   try {
50 ▶     const value = signal();
51 │     return {error: undefined, value};
52 │   } catch (error) {
53 ▶     return {error: error as Error, value: undefined};
54 │   }
55 │ }
56 │ 
57 │ export function unwrapSignal(s: any): any {
58 ▶   if (!isSignal(s)) {
59 │     return s;
60 │   }
61 │ 
62 ▶   const {error, value} = safelyReadSignalValue(s);
63 │   if (error) {
64 ▶     return;
65 │   }
66 │   return value;
67 │ }
```

41〜45 行目、`isSignal` はバックエンドの中で判定を書かず、ページの Angular が置いた `ng.isSignal` を呼びます（[signals-debug](../signals/18-signals-debug.md) の章が読んだ global\_utils.ts の関数の 1 つ）。古い Angular でこの関数が無ければ 42 行目で「signal ではない」とみなします（`ngDebugApiIsSupported` は[第 2 回](02-devtools-detect.md)）。`safelyReadSignalValue` は 50 行目で signal を呼び、53 行目で例外を捕まえて `{error}` で返します。`unwrapSignal` は 62〜64 行目のとおり、読めなければ `undefined` を返します。

> [!WARNING]
> **ハマりどころ**
>
> signal を「呼ぶ」ので、DevTools でプロパティを見るだけで computed の計算が走ります。計算の中で例外を投げる computed は、パネルでは `Signal(⚠️ Error): メッセージ` と出ます（デモの `broken`）。

## 4. 浅い Descriptor：createShallowSerializedDescriptor

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/state-serializer.ts` L76–115 （▶ の行: 76, 85–87, 89, 98, 100–101, 104–107, 114–115）

```ts
 76 ▶ function levelSerializer(
 77 │   instance: any,
 78 │   propName: string | number,
 79 │   isReadonly: boolean,
 80 │   currentLevel = 0,
 81 │   level = MAX_LEVEL,
 82 │   continuation = levelSerializer,
 83 │ ): Descriptor {
 84 │   let serializableInstance: any;
 85 ▶   try {
 86 ▶     serializableInstance = instance[propName];
 87 ▶   } catch {
 88 │     return {
 89 ▶       type: PropType.Error,
 90 │       value: '',
 91 │       containerType: null,
 92 │       editable: false,
 93 │       expandable: false,
 94 │       preview: '',
 95 │     };
 96 │   }
 97 │ 
 98 ▶   const propData: PropertyData = {
 99 │     prop: serializableInstance,
100 ▶     type: getPropType(serializableInstance),
101 ▶     containerType: getContainerType(serializableInstance),
102 │   };
103 │ 
104 ▶   switch (propData.type) {
105 ▶     case PropType.Array:
106 ▶     case PropType.Object:
107 ▶       return createLevelSerializedDescriptor(
108 │         instance,
109 │         propName,
110 │         propData,
111 │         {level, currentLevel},
112 │         continuation,
113 │       );
114 ▶     default:
115 ▶       return createShallowSerializedDescriptor(instance, propName, propData, isReadonly);
```

どの深さでも、1 つのプロパティはまず `levelSerializer` を通ります。85〜96 行目、`instance[propName]` を読むこと自体を `try` で包みます。getter が例外を投げると、89 行目の `PropType.Error` の Descriptor になります（パネルの表示は factory の 80 行目の `[⚠️ Error when retrieving the value]`）。104〜115 行目で、配列とオブジェクトは 5 節の `createLevelSerializedDescriptor`、それ以外はすべて `createShallowSerializedDescriptor` へ行きます。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/serialized-descriptor-factory.ts` L205–229 （▶ の行: 213–214, 218–220, 224–225）

```ts
205 │ export function createShallowSerializedDescriptor(
206 │   instance: any,
207 │   propName: string | number,
208 │   propData: TerminalType,
209 │   isReadonly: boolean,
210 │ ): Descriptor {
211 │   const {type, containerType} = propData;
212 │ 
213 ▶   const descriptor = getDescriptor(instance, propName as string);
214 ▶   const getterOrSetter: boolean = isGetterOrSetter(descriptor);
215 │ 
216 │   const shallowSerializedDescriptor: Descriptor = {
217 │     type,
218 ▶     expandable: shallowPropTypeToTreeMetaData[type].expandable,
219 ▶     editable: isEditable(descriptor, propName, propData, getterOrSetter) && !isReadonly,
220 ▶     preview: getPreview(propData, getterOrSetter),
221 │     containerType,
222 │   };
223 │ 
224 ▶   if (propData.prop !== undefined && serializable.has(type)) {
225 ▶     shallowSerializedDescriptor.value = unwrapSignal(propData.prop);
226 │   }
227 │ 
228 │   return shallowSerializedDescriptor;
229 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/serialized-descriptor-factory.ts` L43–81 （▶ の行: 43, 51, 54–57, 59–61, 64, 67–68, 71, 73, 79–80）

```ts
43 ▶ const serializable: Set<PropType> = new Set([
44 │   PropType.Boolean,
45 │   PropType.String,
46 │   PropType.Null,
47 │   PropType.Number,
48 │   PropType.Object,
49 │   PropType.Undefined,
50 │   PropType.Unknown,
51 ▶ ]);
52 │ 
53 │ const typeToDescriptorPreview: Formatter<string> = {
54 ▶   [PropType.Array]: (prop: Array<unknown>) => `Array(${prop.length})`,
55 ▶   [PropType.Set]: (prop: Set<unknown>) => `Set(${prop.size})`,
56 ▶   [PropType.Map]: (prop: Map<unknown, unknown>) => `Map(${prop.size})`,
57 ▶   [PropType.BigInt]: (prop: bigint) => `${truncate(prop.toString())}n`,
58 │   [PropType.Boolean]: (prop: boolean) => truncate(prop.toString()),
59 ▶   [PropType.String]: (prop: string) => `"${prop}"`,
60 ▶   [PropType.Function]: (prop: Function) => `${prop.name ? 'ƒ ' : ''}(...)`,
61 ▶   [PropType.HTMLNode]: (prop: Node) => prop.constructor.name,
62 │   [PropType.Null]: (_: null) => 'null',
63 │   [PropType.Number]: (prop: any) => prop.toString(),
64 ▶   [PropType.Object]: (prop: Object) => {
65 │     // Some type of objects don't have a constructor (e.g. Object.create(null)),
66 │     return (
67 ▶       (prop.constructor && prop.constructor.name !== 'Object' ? `${prop.constructor.name} ` : '') +
68 ▶       (getKeys(prop).length > 0 ? '{...}' : '{}')
69 │     );
70 │   },
71 ▶   [PropType.Symbol]: (symbol: symbol) => `Symbol(${symbol.description})`,
72 │   [PropType.Undefined]: (_: undefined) => 'undefined',
73 ▶   [PropType.Date]: (prop: unknown) => {
74 │     if (prop instanceof Date) {
75 │       return `Date(${new Date(prop).toISOString()})`;
76 │     }
77 │     return `${prop}`;
78 │   },
79 ▶   [PropType.Unknown]: (_: any) => 'unknown',
80 ▶   [PropType.Error]: (_: any) => '[⚠️ Error when retrieving the value]',
81 │ };
```

1. **224〜226 行目：`value` を付けるのは serializable な型だけ**

   43〜51 行目の集合（Boolean・String・Null・Number・Object・Undefined・Unknown）です。BigInt・Symbol・Function・Date・Map・Set・HTMLNode は `value` を持たず、`preview` の文字列だけが届きます。関数や DOM のノードは、メッセージ（[第 3 回](03-devtools-messaging.md)）にそのまま載せられないからです。Object がこの集合にありますが、浅い関数にはそもそも Object は来ません（104〜107 行目）。
2. **220 行目：`preview` は 53〜81 行目の表で作る**

   文字列は 59 行目で `"` で囲み、BigInt と Boolean は `truncate`（同じファイルの末尾、引用の外）で 20 文字に切ります。60 行目、関数は名前があれば `ƒ (...)`、無ければ `(...)`。67〜68 行目、オブジェクトは「クラス名 + `{...}`」で、ふつうの `{}` のオブジェクトならクラス名は付きません。
3. **218〜219 行目：開けるか・編集できるか**

   型ごとの表（次の引用）と `isEditable`（その次）で決めます。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/serialized-descriptor-factory.ts` L95–118 （▶ の行: 99–100, 103–104, 111–112, 115–116）

```ts
 95 │ const shallowPropTypeToTreeMetaData: Record<
 96 │   Exclude<PropType, NestedType>,
 97 │   {editable: boolean; expandable: boolean}
 98 │ > = {
 99 ▶   [PropType.String]: {
100 ▶     editable: true,
101 │     expandable: false,
102 │   },
103 ▶   [PropType.BigInt]: {
104 ▶     editable: false,
105 │     expandable: false,
106 │   },
107 │   [PropType.Boolean]: {
108 │     editable: true,
109 │     expandable: false,
110 │   },
111 ▶   [PropType.Number]: {
112 ▶     editable: true,
113 │     expandable: false,
114 │   },
115 ▶   [PropType.Date]: {
116 ▶     editable: false,
117 │     expandable: false,
118 │   },
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/serialized-descriptor-factory.ts` L157–183 （▶ の行: 163, 167, 171, 175, 179, 182–183）

```ts
157 │ const isEditable = (
158 │   descriptor: PropertyDescriptor | undefined,
159 │   propName: string | number,
160 │   propData: TerminalType,
161 │   isGetterOrSetter: boolean,
162 │ ) => {
163 ▶   if (propData.containerType === 'ReadonlySignal') {
164 │     return false;
165 │   }
166 │ 
167 ▶   if (typeof propName === 'symbol') {
168 │     return false;
169 │   }
170 │ 
171 ▶   if (isGetterOrSetter) {
172 │     return false;
173 │   }
174 │ 
175 ▶   if (descriptor?.writable === false) {
176 │     return false;
177 │   }
178 │ 
179 ▶   return shallowPropTypeToTreeMetaData[propData.type].editable;
180 │ };
181 │ 
182 ▶ const isGetterOrSetter = (descriptor: any): boolean =>
183 ▶   (descriptor?.set || descriptor?.get) && !('value' in descriptor);
```

表で `editable: true` なのは String・Boolean・Number・Null・Undefined の 5 つだけです（表の後半、Symbol から Error までは引用の外で、すべて `false`）。浅い型はどれも `expandable: false` なので、Map と Set は中を開けません。そのうえで `isEditable` が 4 つの理由で `false` にします。163 行目の読み取り専用の signal、167 行目のシンボルのキー、171 行目の getter / setter、175 行目の `writable: false`（`Object.freeze` したオブジェクトのプロパティや、`Object.defineProperty` で書き込み禁止にしたもの）。TypeScript の `readonly` は実行時には何も残らないので、`readonly` のフィールドは編集できる側に入ります。182〜183 行目の `isGetterOrSetter` は「`get` か `set` があり、`value` が無い」記述子です。最後に 219 行目で、1 節の `isReadonly`（signal の中身として読んだもの）なら編集できなくなります。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/serialized-descriptor-factory.ts` L185–203 （▶ の行: 186–187, 189, 191–192, 197, 200–202）

```ts
185 │ const getPreview = (propData: TerminalType | CompositeType, isGetterOrSetter: boolean) => {
186 ▶   if (propData.containerType === 'ReadonlySignal') {
187 ▶     const {error, value} = safelyReadSignalValue(propData.prop);
188 │     if (error) {
189 ▶       return `Signal(⚠️ Error)${error.message ? `: ${error.message}` : ''}`;
190 │     }
191 ▶     return `Readonly Signal(${typeToDescriptorPreview[propData.type](value)})`;
192 ▶   } else if (propData.containerType === 'WritableSignal') {
193 │     const {error, value} = safelyReadSignalValue(propData.prop);
194 │     if (error) {
195 │       return `Signal(⚠️ Error)${error.message ? `: ${error.message}` : ''}`;
196 │     }
197 ▶     return `Signal(${typeToDescriptorPreview[propData.type](value)})`;
198 │   }
199 │ 
200 ▶   return !isGetterOrSetter
201 ▶     ? typeToDescriptorPreview[propData.type](propData.prop)
202 ▶     : typeToDescriptorPreview[PropType.Function]({name: ''});
203 │ };
```

signal の表示は 191 行目の `Readonly Signal(…)` と 197 行目の `Signal(…)` の 2 通りで、括弧の中は中身の型の表示（signal を外した値で 53〜81 行目を使う）です。getter / setter は 202 行目で、値ではなく `(...)` を見せます（関数の表示を名前なしで借りている）。ただし 224〜226 行目は getter でも通るので、getter の String や Number には `value` が付いて届きます（デモの `upper`）。

## 5. 配列とオブジェクト：深さの上限

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/serialized-descriptor-factory.ts` L231–265 （▶ の行: 249, 251–253, 257–258, 260）

```ts
231 │ export function createLevelSerializedDescriptor(
232 │   instance: {},
233 │   propName: string | number,
234 │   propData: CompositeType,
235 │   levelOptions: LevelOptions,
236 │   continuation: (
237 │     instance: any,
238 │     propName: string | number,
239 │     isReadonly: boolean,
240 │     level?: number,
241 │     max?: number,
242 │   ) => Descriptor,
243 │ ): Descriptor {
244 │   const {type, prop, containerType} = propData;
245 │ 
246 │   const descriptor = getDescriptor(instance, propName as string);
247 │   const getterOrSetter: boolean = isGetterOrSetter(descriptor);
248 │ 
249 ▶   const levelSerializedDescriptor: Descriptor = {
250 │     type,
251 ▶     editable: false,
252 ▶     expandable: !getterOrSetter && getKeys(prop).length > 0,
253 ▶     preview: getPreview(propData, getterOrSetter),
254 │     containerType,
255 │   };
256 │ 
257 ▶   if (levelOptions.level !== undefined && levelOptions.currentLevel < levelOptions.level) {
258 ▶     const value = getLevelDescriptorValue(propData, levelOptions, continuation);
259 │     if (value !== undefined) {
260 ▶       levelSerializedDescriptor.value = value;
261 │     }
262 │   }
263 │ 
264 │   return levelSerializedDescriptor;
265 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/serialized-descriptor-factory.ts` L331–368 （▶ の行: 344–345, 347–349, 351–352, 354–355）

```ts
331 │ function getLevelDescriptorValue(
332 │   propData: CompositeType,
333 │   levelOptions: LevelOptions,
334 │   continuation: (
335 │     instance: any,
336 │     propName: string | number,
337 │     isReadonly: boolean,
338 │     level?: number,
339 │     max?: number,
340 │   ) => Descriptor,
341 │ ) {
342 │   const {type, prop} = propData;
343 │   const {currentLevel, level} = levelOptions;
344 ▶   const value = unwrapSignal(prop);
345 ▶   const isReadonly = isSignal(prop);
346 │   switch (type) {
347 ▶     case PropType.Array:
348 ▶       return value.map((_: any, idx: number) =>
349 ▶         continuation(value, idx, isReadonly, currentLevel + 1, level),
350 │       );
351 ▶     case PropType.Object:
352 ▶       return getKeys(value).reduce(
353 │         (accumulator, propName) => {
354 ▶           if (!ignoreList.has(propName)) {
355 ▶             accumulator[propName] = continuation(
356 │               value,
357 │               propName,
358 │               isReadonly,
359 │               currentLevel + 1,
360 │               level,
361 │             );
362 │           }
363 │           return accumulator;
364 │         },
365 │         {} as Record<string, Descriptor>,
366 │       );
367 │   }
368 │ }
```

1. **251 行目：配列とオブジェクトは編集できない**

   パネルで書き換えられるのは、いつも葉（浅い型）の値です（[第 11 回](11-devtools-property-mutation.md)）。
2. **252 行目：中にキーがあるときだけ開ける**

   空の `{}` や `[]` は開けません。getter で返すオブジェクトも開けません（`!getterOrSetter`）。
3. **257 行目：上限まで来ていなければ、中身を 1 段ずつ作る**

   `serializeDirectiveState` は上限 0 で呼ぶので、0 &lt; 0 は偽で、**中身（`value`）は付きません**。中身はパネルで行を開いたときに、改めて頼みます（[第 10 回](10-devtools-property-resolver.md)）。上限を上げて呼ぶと 348 行目（配列は添字ごと）と 352〜362 行目（オブジェクトは `getKeys` ごと）で、1 段深い `levelSerializer`（`continuation`）を呼びます。
4. **345 行目：signal の中身は読み取り専用として下へ渡す**

   1 節の 122 行目と同じ考えです。ただし、この `isReadonly` は「signal を通って読んだ」という印で、書き換えの側（[第 11 回](11-devtools-property-mutation.md)）では signal の中も書き換えられます。

循環（自分自身を指すプロパティ）でも止まらずに済むのは、この「1 回の頼みで深さの上限まで」という作りのおかげです。`JSON.stringify` のように全部たどるわけではないので、`self = this` も `Root {...}` の 1 行で終わります。

## 6. signal の 2 つの入れ物：getContainerType

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/state-serializer.ts` L156–166 （▶ の行: 157–158, 161, 165）

```ts
156 │ function getContainerType(instance: unknown): ContainerType {
157 ▶   if (isSignal(instance)) {
158 ▶     return isWritableSignal(instance) ? 'WritableSignal' : 'ReadonlySignal';
159 │   }
160 │ 
161 ▶   return null;
162 │ }
163 │ 
164 │ function isWritableSignal(s: any): boolean {
165 ▶   return typeof s['set'] === 'function';
166 │ }
```

`containerType` はパネルの表示（`Signal(…)` の印や signal のグラフへのボタン）と、4 節の 163 行目の「編集できない」に使われます。165 行目のとおり、**`set` という関数を持つかどうか**だけで見分けます。`signal()` は `WritableSignal`、`computed()` と `input()` は `set` を持たないので `ReadonlySignal`。`model()` は `set` を持つので `WritableSignal` になります。

> **🧪 DEMO — serializeDirectiveState が返した Descriptor（記録の再生）**
>
> これは記録です。本物の devtools のソース（angular/angular の devtools/、8576f161ae4）を、本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かした結果です。下のスクリプトのコンポーネントを platform-server（domino）で描画し、パネルの代わりに `getLatestComponentExplorerView` を `propertyQuery: All` で送って、返ってきた `latestComponentExplorerView` の `properties['app-root'].props` をそのまま並べました。`type` は数で届くので、protocol の `PropType` の名前を添えています。記録の値は書き換えていません。記録の共通の部品（アプリを描画する harness）は[第 1 回](01-devtools-overview.md)に全文があります。
>
> `method()` は表にありません。2 節の getKeys がメソッドを拾わないからです。`label` は `input('x')` です。JIT（実行時のコンパイル）では signal の input を見つけるのに `@Input({isSignal: true})` が要るので、Angular の TS の変換が足すものと同じものを手で書きました（core の metadata/directives.ts の `isSignal` のコメント）。値は親から渡していないので初期値の `"x"` です。`host` の preview の `HTMLUnknownElement3` は domino の要素のクラス名です。ブラウザでは `HTMLElement` などになります。`arrow` に名前が無いのは、記録のビルド（esbuild、`useDefineForClassFields: false`）でフィールドがコンストラクタの中の代入 `this.arrow = () => 1` になり、関数に名前が付かないためです。Angular CLI の既定も `useDefineForClassFields: false` です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-state-serializer)

## 7. ここまでの呼び出し

- `getLatestComponentExplorerView` — client-event-subscribers.ts — *パネルからのメッセージ（第 5 回）*
  - `getLatestComponentState(query)` — component-tree.ts — *PropertyQueryTypes.All なら*
    - `serializeDirectiveState(instance)` — state-serializer.ts 119
      - `getKeys(value)` — object-utils.ts 17 — *own の名前 + getter / setter*
      - `levelSerializer(value, prop, isReadonly, 0, 0)` — state-serializer.ts 76
        - `getPropType(prop)` — prop-type.ts 28 — *signal は ng.isSignal → 中身の型*
        - `getContainerType(prop)` — state-serializer.ts 156
        - `createShallowSerializedDescriptor` / `createLevelSerializedDescriptor` — serialized-descriptor-factory.ts 205 / 231 — *上限 0 なので中身なし*
  - `messageBus.emit('latestComponentExplorerView', [{forest, properties}])` — client-event-subscribers.ts

## 8. 最近の修正：null-prototype のオブジェクト（d7161fd431a）

d7161fd431a（2026-05-22、fix、#68798 を閉じた）は、`Object.create(null)` で作ったオブジェクト（`Object.groupBy` の戻り値もこれ）を持つコンポーネントを選ぶと DevTools が落ちる不具合を直しました。直す前の 67 行目は `prop.constructor.name !== 'Object'` で、プロトタイプが無いオブジェクトは `constructor` を持たないので `undefined.name` で TypeError でした。直したあとは `prop.constructor &&` を前に置き、constructor が無ければクラス名を付けずに `{...}` にします（65 行目のコメント）。足した spec は state-serializer.spec.ts の 2 件で、浅い場合（下の引用）と、`deeplySerializeSelectedProperties` で中まで開く場合です。デモの `nullProto` が直したあとの形です。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/state-serializer.spec.ts` L497–511 （▶ の行: 497–498, 501, 507）

```ts
497 ▶   it('should preview objects without prototypes as plain objects', () => {
498 ▶     const grouped = Object.create(null);
499 │     grouped.foo = 1;
500 │ 
501 ▶     const result = serializeDirectiveState({grouped});
502 │ 
503 │     expect(result['grouped']).toEqual({
504 │       type: PropType.Object,
505 │       editable: false,
506 │       expandable: true,
507 ▶       preview: '{...}',
508 │       containerType: null,
509 │     });
510 │   });
511 │ 
```

なお、同じ頃の 03f1758e2ae（2026-08-06、fix、#70104）は「ノードの直列化の後退」という題ですが、プロパティの直列化ではなく、要素の位置（`[0, 1]` のような数の並び）を文字列にした `serializedId` の形が、カンマ区切りから JSON に変わったのに読む側が追いついていなかった不具合です。DOM の要素を Elements パネルで開く機能に関係するので、[第 12 回](12-devtools-inspector-highlight.md)で触れます。

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| shared/state-serializer/state-serializer.spec.ts | describe `deeplySerializeSelectedProperties`（87 行目）の it 15 件。`should preview objects without prototypes as plain objects`（497）、`getKeys should all keys including getters and setters`（580）、`getKeys should not throw on empty object without prototype`（595）など。名前は describe の 1 つにまとまっていますが、`serializeDirectiveState` や `getKeys` を直接呼ぶ it も入っています | `//devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer:test` |
| shared/state-serializer/prop-type.spec.ts | describe `getPropType`（13 行目）。表の 12 件を 1 つの it の形（87 行目）で回す |   |

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/prop-type.spec.ts` L40–56 （▶ の行: 45–47）

```ts
40 │     {
41 │       expression: true,
42 │       propType: PropType.Boolean,
43 │       propTypeName: 'Boolean',
44 │     },
45 ▶     // TODO: configure the test environment to be env that supports big integer notation.
46 ▶     /* {
47 ▶       expression: 123n,
48 │       propType: PropType.BigInt,
49 │       propTypeName: 'BigInt',
50 │     }, */
51 │     {
52 │       expression: Math.random,
53 │       propType: PropType.Function,
54 │       propTypeName: 'Function',
55 │     },
56 │     {
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer/prop-type.spec.ts` L76–92 （▶ の行: 86–89）

```ts
76 │     {
77 │       expression: new Map<unknown, unknown>([
78 │         ['name', 'John'],
79 │         ['age', 40],
80 │         [{id: 123}, undefined],
81 │       ]),
82 │       propType: PropType.Map,
83 │       propTypeName: 'Map',
84 │     },
85 │   ];
86 ▶   for (const {expression, propType, propTypeName} of testCases) {
87 ▶     it(`should determine ${String(expression)} as PropType:${propTypeName}(${propType})`, () => {
88 ▶       const actual = getPropType(expression);
89 ▶       expect(actual).toBe(actual);
90 │     });
91 │   }
92 │ });
```

> [!NOTE]
> **さらに深く**
>
> prop-type.spec.ts の 89 行目は `expect(actual).toBe(actual)` で、**自分と自分を比べています**。`propType`（期待する型）と比べていないので、`getPropType` が何を返してもこの 12 件は通ります。`git log -S` で探すと、この行は cb500c7ee52（2023-11-25、Map と Symbol の対応を足したコミット）からあり、いまの main（gh api で読んだもの）でも同じです。45〜50 行目の BigInt の場合はコメントで外されていて、signal の場合（3 節の 29〜35 行目）は表にありません。手元で 89 行目を `toBe(propType)` に変えて走らせると、本当に確かめる spec になります（このサイトでは ../angular を変えないので、走らせた結果は載せていません）。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer:test --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/devtools-logs/c-all.log。ほかの 6 つのターゲットと一緒に走らせ、全体で 44.4 秒）`

```
//devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer:test_chromium
  Chromium: 1/1 test files | 27 passed, 0 failed   Finished running tests in 0.8s
//devtools/projects/ng-devtools-backend/src/lib/shared/state-serializer:test_firefox
  Firefox: 1/1 test files | 27 passed, 0 failed    Finished running tests in 4.1s
state-serializer:test_chromium PASSED in 3.7s / state-serializer:test_firefox PASSED in 7.9s
```

- 27 件は state-serializer.spec.ts の 15 件と prop-type.spec.ts の 12 件の合計です。1 つの `:test` が Chromium と Firefox の 2 つのターゲットになります（[第 19 回](19-devtools-test-build.md)）。
- `--test_arg=--filter=…` のような it の絞り込みは、このターゲット（web test runner）では試していません。ターゲット全体を走らせました。

### 直すとしたら

- 「パネルの表示が違う（型・preview・編集できるか）」は、まず `getPropType`（prop-type.ts）と `typeToDescriptorPreview`・`shallowPropTypeToTreeMetaData`・`isEditable`（serialized-descriptor-factory.ts）です。spec は state-serializer.spec.ts に `serializeDirectiveState({…})` の形で足します（497 行目の it と同じ形）。
- 「選ぶと DevTools が落ちる」は、読むときに例外が出る値です。getter は levelSerializer の 85〜96 行目で捕まえますが、preview を作る 53〜81 行目は捕まえていません（d7161fd431a はその 1 つの場所を直したもの）。デモと同じように、変わった値を持つインスタンスを作って `serializeDirectiveState` に通すと手元で確かめられます。
- 本家に PR を出すことは勧めません。issue を読むときは、まずデモと同じ書き方で、その値がどの Descriptor になるかを手元で確かめます（[第 20 回](20-devtools-issues.md)）。

## 聞かれそうな質問

**Q. パネルにメソッドが出ないのはなぜですか？getter は出ますよね？**

`getKeys` が、インスタンス自身の名前（22 行目）と、1 段上のプロトタイプの **getter / setter だけ**（28〜35 行目）を集めるからです。メソッドはプロトタイプの上のふつうの関数なので入りません。フィールドに入れたアロー関数はインスタンス自身のものなので、Function として出ます。

**Q. オブジェクトの中身は最初から送られていますか？**

送られていません。`serializeDirectiveState` は 127 行目で上限 0 で呼ぶので、`createLevelSerializedDescriptor` の 257 行目の条件が偽になり、`value` を付けません。届くのは `preview` と `expandable` だけで、中身は行を開いたときに頼みます（[第 10 回](10-devtools-property-resolver.md)）。

**Q. computed や input() をパネルで編集できないのはなぜですか？**

`set` を持たないので、`getContainerType` の 165 行目で `ReadonlySignal` になり、`isEditable` の 163 行目で `false` になるからです。`signal()` と `model()` は `set` があるので `WritableSignal` で、中身が浅い型なら編集できます。

**Q. Map や Set の中を DevTools で見られないのはなぜですか？**

Map と Set は `getPropType` の 53〜56 行目で独自の型になり、浅い Descriptor の表で `expandable: false` だからです。届くのは `Map(1)` のような preview（56 行目）だけです。中を見たいときは、いちばん上の段の行ならメニューからコンソールに出せます（[第 12 回](12-devtools-inspector-highlight.md)の `logValue`）。

**Q. プロパティを見るだけで、アプリの何かが動くことはありますか？**

あります。signal は 3 節の `safelyReadSignalValue` で呼ばれ、getter は 86 行目で読まれます。重い computed の計算や、副作用のある getter はパネルで選ぶたびに走ります。例外は捕まえるので落ちはしません（89 行目の Error、32 行目の Unknown）。

## 読み終えて

- パネルのプロパティは `Descriptor`（型・preview・editable・expandable・containerType・value）で届き、インスタンスそのものは届かない。
- プロパティとみなすのは、インスタンス自身の名前と 1 段上の getter / setter。メソッドとシンボルは入らない。
- signal は中身の型で表し、`set` を持つかで WritableSignal / ReadonlySignal を分ける。読み取り専用・getter・書き込み禁止は編集できない。
- 最初の頼みは深さの上限 0 で、オブジェクトと配列は preview だけ。中身は行を開いたときに頼み直す。
- prop-type.spec.ts の 89 行目は自分と比べていて、型の判定を確かめていない。

---

← 前: [パネルの木：平らな木への展開・差分・絞り込み](08-devtools-forest-ui.md)  
次: [入れ子を開く：getNestedProperties とプロパティの木](10-devtools-property-resolver.md) →
