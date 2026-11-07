[目次](../README.md) › [フォームの内側](README.md) › 第 18 回 / 全 20 回

# Signal Forms の状態ルール：disabled・hidden・readonly と metadata

> disabled・hidden・readonly が LogicNodeBuilder にルールを足し、FieldNode の状態（state.ts）が親の状態と合わせて computed で決まる仕組みと、3 つが検証・touched・dirty を止める行。metadata と createMetadataKey で required や min のような情報を入力欄（\[formField\]）に渡す流れ、debounce ルール。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-sf-rules-metadata)

---

検証以外のルール、`disabled`・`hidden`・`readonly` と `metadata` の章です。3 つの状態ルールが何を記録し、`FieldNode` の状態（`field/state.ts`）が**親の状態と合わせて**どう computed で決まるか、それが検証・touched・dirty にどう効くかを追います。後半は metadata で、`required` や `min` が「入力欄の `required` 属性や `min` 属性」になるまでの経路と、自作のキーの作り方、`debounce` も metadata の 1 つであることを見ます。

読む対象は `packages/forms/signals/src/` の `api/rules/`（`disabled.ts`・`hidden.ts`・`readonly.ts`・`metadata.ts`・`debounce.ts`・`validation/min.ts`）、`field/state.ts`・`field/metadata.ts`・`field/debounce.ts`・`field/node.ts`、`schema/logic.ts`、`directive/bindings.ts`・`directive/form_field.ts` です。ルールが builder に記録され、条件で包まれる仕組みは[第 16 回](16-forms-sf-schema.md)、`debounce` の待ち方（`debounceSync`）は [signal-forms](../signals/17-signal-forms.md) の 7 節で読みました。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. [3. updateValueAndValidity](03-forms-update-value-validity.md)
4. [4. Validators](04-forms-validators.md)
5. [5. 非同期の検証](05-forms-async-validators.md)
6. [6. events](06-forms-control-events.md)
7. [7. FormGroup と FormArray](07-forms-form-group-array.md)
8. [8. 型付きフォームと FormBuilder](08-forms-typed-forms.md)
9. [9. ControlValueAccessor](09-forms-value-accessor.md)
10. [10. 双方向の配線](10-forms-setup-control.md)
11. [11. 組み込みの accessor](11-forms-builtin-accessors.md)
12. [12. リアクティブのディレクティブ](12-forms-reactive-directives.md)
13. [13. NgModel と NgForm](13-forms-ng-model.md)
14. [14. 検証のディレクティブ](14-forms-validator-directives.md)
15. [15. 状態クラス](15-forms-status-classes.md)
16. [16. Signal Forms のスキーマ](16-forms-sf-schema.md)
17. [17. Signal Forms の検証](17-forms-sf-validation.md)
18. **18. 状態ルールと metadata**（この章）
19. [19. submit と相互運用](19-forms-sf-submit-compat.md)
20. [20. issue と PR を読む](20-forms-issues.md)

## 0. 全体の流れ

1. **記録**

   `disabled` は「理由」を返す関数、`hidden`・`readonly` は真偽を返す関数を、その path の builder に積む（1 節）。
2. **自分の分を混ぜる**

   hidden・readonly は OR、disabled は理由の配列の連結（2 節）。
3. **親と合わせる**

   どれも「親がそうなら自分もそう」。computed の中で親の signal を読む（3 節）。
4. **効き目**

   3 つのどれかなら検証を飛ばし、touched・dirty も立たず、親にも数えられない（4 節）。
5. **metadata**

   キーごとに reducer で値を 1 つに混ぜ、`state.metadata(KEY)` で signal として読む。`required()`・`min()` もこれ（5〜7 節）。
6. **入力欄へ**

   `[formField]` は状態の名前の表を回して、変わったものだけ要素のプロパティに書く（8 節）。

## 1. 3 つのルールが記録するもの

📄 `angular/packages/forms/signals/src/api/rules/disabled.ts` L45–75 （▶ の行: 57–58, 60, 63–66, 68, 70–71, 73）

```ts
45 │ export function disabled<TValue, TPathKind extends PathKind = PathKind.Root>(
46 │   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
47 │   configOrLogic?:
48 │     | {when?: string | NoInfer<LogicFn<TValue, boolean | string, TPathKind>>}
49 │     | string
50 │     | NoInfer<LogicFn<TValue, boolean | string, TPathKind>>,
51 │ ): void {
52 │   assertPathIsCurrent(path);
53 │ 
54 │   const pathNode = FieldPathNode.unwrapFieldPath(path);
55 │ 
56 │   let logic: string | LogicFn<TValue, boolean | string, TPathKind> | undefined;
57 ▶   if (typeof configOrLogic === 'function' || typeof configOrLogic === 'string') {
58 ▶     logic = configOrLogic;
59 │   } else {
60 ▶     logic = configOrLogic?.when;
61 │   }
62 │ 
63 ▶   pathNode.builder.addDisabledReasonRule((ctx) => {
64 ▶     let result: boolean | string = true;
65 ▶     if (typeof logic === 'string') {
66 ▶       result = logic;
67 │     } else if (logic) {
68 ▶       result = logic(ctx as FieldContext<TValue, TPathKind>);
69 │     }
70 ▶     if (typeof result === 'string') {
71 ▶       return {fieldTree: ctx.fieldTree, message: result};
72 │     }
73 ▶     return result ? {fieldTree: ctx.fieldTree} : undefined;
74 │   });
75 │ }
```

57〜61 行目、`disabled(p.x, { when })` の形と、古い `disabled(p.x, fn)` の形（非推奨）を同じ `logic` にそろえます。63 行目で積むのは「真偽」ではなく**理由（`DisabledReason`）を返す関数**です。64 行目、`when` が無ければ常に disabled。70〜72 行目、`when` が文字列を返したらそれを `message` にした理由、73 行目、真なら message なしの理由、偽なら `undefined`（理由なし）です。理由には 71・73 行目で `fieldTree: ctx.fieldTree`、つまり**どのフィールドのルールで disabled になったか**が入ります。

📄 `angular/packages/forms/signals/src/api/rules/hidden.ts` L52–66 （▶ の行: 62–63, 65）

```ts
52 │ export function hidden<TValue, TPathKind extends PathKind = PathKind.Root>(
53 │   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
54 │   configOrLogic?:
55 │     | {when?: NoInfer<LogicFn<TValue, boolean, TPathKind>>}
56 │     | NoInfer<LogicFn<TValue, boolean, TPathKind>>,
57 │ ): void {
58 │   assertPathIsCurrent(path);
59 │ 
60 │   const pathNode = FieldPathNode.unwrapFieldPath(path);
61 │ 
62 ▶   const logic =
63 ▶     typeof configOrLogic === 'function' ? configOrLogic : (configOrLogic?.when ?? (() => true));
64 │ 
65 ▶   pathNode.builder.addHiddenRule(logic);
66 │ }
```

📄 `angular/packages/forms/signals/src/api/rules/readonly.ts` L44–58 （▶ の行: 54–55, 57）

```ts
44 │ export function readonly<TValue, TPathKind extends PathKind = PathKind.Root>(
45 │   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
46 │   configOrLogic?:
47 │     | {when?: NoInfer<LogicFn<TValue, boolean, TPathKind>>}
48 │     | NoInfer<LogicFn<TValue, boolean, TPathKind>>,
49 │ ): void {
50 │   assertPathIsCurrent(path);
51 │ 
52 │   const pathNode = FieldPathNode.unwrapFieldPath(path);
53 │ 
54 ▶   const logic =
55 ▶     typeof configOrLogic === 'function' ? configOrLogic : (configOrLogic?.when ?? (() => true));
56 │ 
57 ▶   pathNode.builder.addReadonlyRule(logic);
58 │ }
```

`hidden` と `readonly` は同じ形で、63・55 行目、`when` が無ければ `() => true`、それを 65・57 行目で builder に積むだけです。理由を持てるのは disabled だけです。

## 2. 自分の分を混ぜる：BooleanOrLogic

📄 `angular/packages/forms/signals/src/schema/logic.ts` L122–134 （▶ の行: 123, 125, 129–131）

```ts
122 │ /** Logic that combines its individual logic function results with logical OR. */
123 ▶ export class BooleanOrLogic extends AbstractLogic<boolean> {
124 │   override get defaultValue() {
125 ▶     return false;
126 │   }
127 │ 
128 │   override compute(arg: FieldContext<any>): boolean {
129 ▶     return this.fns.some((f) => {
130 ▶       const result = f(arg);
131 ▶       return result && result !== IGNORED;
132 │     });
133 │   }
134 │ }
```

hidden と readonly のルールは `BooleanOrLogic` で混ぜます（[第 16 回](16-forms-sf-schema.md)の `LogicContainer` の `hidden` と `readonly`）。129 行目の `some` で 1 つでも真なら真、ルールが 1 つも無ければ 125 行目の既定値 `false`。131 行目、条件が偽で `IGNORED` になったルールは真に数えません。disabled の理由は配列の連結（[第 17 回](17-forms-sf-validation.md) 2 節の `ArrayMergeLogic`）で、理由が 1 つでもあれば disabled です。

## 3. 親と合わせる：field/state.ts

📄 `angular/packages/forms/signals/src/field/state.ts` L103–124 （▶ の行: 109, 111–112, 114, 124）

```ts
103 │   /**
104 │    * The reasons for this field's disablement. This includes disabled reasons for any parent field
105 │    * that may have been disabled, indirectly causing this field to be disabled as well.
106 │    * The `field` property of the `DisabledReason` can be used to determine which field ultimately
107 │    * caused the disablement.
108 │    */
109 ▶   readonly disabledReasons: Signal<readonly DisabledReason[]> = computed(
110 │     () => [
111 ▶       ...(this.node.structure.parent?.nodeState.disabledReasons() ?? []),
112 ▶       ...this.node.logicNode.logic.disabledReasons.compute(this.node.context),
113 │     ],
114 ▶     {equal: shallowArrayEquals},
115 │   );
116 │ 
117 │   /**
118 │    * Whether this field is considered disabled.
119 │    *
120 │    * A field is considered disabled if one of the following is true:
121 │    * - The schema contains logic that directly disabled it
122 │    * - Its parent field is considered disabled
123 │    */
124 ▶   readonly disabled: Signal<boolean> = computed(() => !!this.disabledReasons().length);
```

111 行目で親の `disabledReasons()` を全部受け継ぎ、112 行目で自分のルールの理由を足します。124 行目、理由が 1 つでもあれば disabled です。親の signal を読む computed なので、根を disabled にすると、子孫は全員、根の理由（`fieldTree` が根）を持って disabled になります。114 行目の `shallowArrayEquals` は、中身が同じなら新しい配列でも「変わっていない」と扱う比較で、親の理由が変わらない限り子の computed の読み手に通知しません。

📄 `angular/packages/forms/signals/src/field/state.ts` L126–152 （▶ の行: 133, 135–137, 147, 149–151）

```ts
126 │   /**
127 │    * Whether this field is considered readonly.
128 │    *
129 │    * A field is considered readonly if one of the following is true:
130 │    * - The schema contains logic that directly made it readonly
131 │    * - Its parent field is considered readonly
132 │    */
133 ▶   readonly readonly: Signal<boolean> = computed(
134 │     () =>
135 ▶       (this.node.structure.parent?.nodeState.readonly() ||
136 ▶         this.node.logicNode.logic.readonly.compute(this.node.context)) ??
137 ▶       false,
138 │   );
139 │ 
140 │   /**
141 │    * Whether this field is considered hidden.
142 │    *
143 │    * A field is considered hidden if one of the following is true:
144 │    * - The schema contains logic that directly hides it
145 │    * - Its parent field is considered hidden
146 │    */
147 ▶   readonly hidden: Signal<boolean> = computed(
148 │     () =>
149 ▶       (this.node.structure.parent?.nodeState.hidden() ||
150 ▶         this.node.logicNode.logic.hidden.compute(this.node.context)) ??
151 ▶       false,
152 │   );
```

readonly（133〜138 行目）と hidden（147〜152 行目）は同じ形で、「親がそうなら真、そうでなければ自分のルール」です。`||` なので、親が真なら自分のルールは**評価すらしません**。逆に、子のルールで親を変えることはできません（親の computed は子を読まない）。

## 4. 効き目：検証・touched・dirty

📄 `angular/packages/forms/signals/src/field/validation.ts` L361–373 （▶ の行: 366, 368–371）

```ts
361 │ 
362 │   /**
363 │    * Indicates whether validation should be skipped for this field because it is hidden, disabled,
364 │    * or readonly.
365 │    */
366 ▶   readonly shouldSkipValidation = computed(
367 │     () =>
368 ▶       this.node.hidden() ||
369 ▶       this.node.disabled() ||
370 ▶       this.node.readonly() ||
371 ▶       this.node.structure.isOrphaned(),
372 │   );
373 │ }
```

検証を飛ばす条件は 368〜371 行目、hidden・disabled・readonly・孤立（配列から消えたフィールド）のどれかです。[第 17 回](17-forms-sf-validation.md)で見た `syncErrors`・`rawSyncTreeErrors`・`rawAsyncErrors`・`status` は、どれも最初にこれを見て空配列や `'valid'` を返します。つまり **hidden と disabled と readonly は、検証については同じ扱い**です。

📄 `angular/packages/forms/signals/src/field/state.ts` L185–194 （▶ の行: 192–193）

```ts
185 │   /** Whether this field is considered non-interactive.
186 │    *
187 │    * A field is considered non-interactive if one of the following is true:
188 │    * - It is hidden
189 │    * - It is disabled
190 │    * - It is readonly
191 │    */
192 ▶   private readonly isNonInteractive = computed(
193 ▶     () => this.hidden() || this.disabled() || this.readonly(),
194 │   );
```

📄 `angular/packages/forms/signals/src/field/state.ts` L71–101 （▶ の行: 78–80, 82, 94–96, 98）

```ts
 71 │   /**
 72 │    * Whether this field is considered dirty.
 73 │    *
 74 │    * A field is considered dirty if one of the following is true:
 75 │    *  - It was directly dirtied and is interactive
 76 │    *  - One of its children is considered dirty
 77 │    */
 78 ▶   readonly dirty: Signal<boolean> = computed(() => {
 79 ▶     const selfDirtyValue = this.selfDirty() && !this.isNonInteractive();
 80 ▶     return this.node.structure.reduceChildren(
 81 │       selfDirtyValue,
 82 ▶       (child, value) => value || child.nodeState.dirty(),
 83 │       shortCircuitTrue,
 84 │     );
 85 │   });
 86 │ 
 87 │   /**
 88 │    * Whether this field is considered touched.
 89 │    *
 90 │    * A field is considered touched if one of the following is true:
 91 │    *  - It was directly touched and is interactive
 92 │    *  - One of its children is considered touched
 93 │    */
 94 ▶   readonly touched: Signal<boolean> = computed(() => {
 95 ▶     const selfTouchedValue = this.selfTouched() && !this.isNonInteractive();
 96 ▶     return this.node.structure.reduceChildren(
 97 │       selfTouchedValue,
 98 ▶       (child, value) => value || child.nodeState.touched(),
 99 │       shortCircuitTrue,
100 │     );
101 │   });
```

1. **79・95 行目：自分の dirty / touched**

   「自分で立てた印」（`selfDirty`・`selfTouched`）があり、かつ **192〜194 行目の非対話（hidden・disabled・readonly）でない**ときだけ真です。印は消さずに無視するので、disabled を外すと、前に触っていた印がまた見えます。
2. **80〜84・96〜100 行目：子のどれかが真なら真**

   子が非対話なら子の dirty / touched は偽なので、親の dirty / touched にも数えられません。disabled.ts と hidden.ts の doc コメントの「親の検証・touched・dirty に寄与しない」はこの 2 段のことです。

`submit` がフォーム全体を touched にするときも、非対話のフィールドには印そのものを付けません（[第 19 回](19-forms-sf-submit-compat.md)の `markAsTouchedInternal`）。

## 5. metadata：キーと reducer

metadata は「フィールドに付ける、検証でも状態でもない情報」です。`required` が付いているか、`min` はいくつか、debounce の関数は何か、をこの仕組みで持ちます。1 つのキーに複数のルールが値を書けるので、キーごとに「どう 1 つにまとめるか」（reducer）を決めておきます。

📄 `angular/packages/forms/signals/src/api/rules/metadata.ts` L33–53 （▶ の行: 39–40, 43, 51–52）

```ts
33 │ export function metadata<
34 │   TValue,
35 │   TKey extends MetadataKey<any, any, any>,
36 │   TPathKind extends PathKind = PathKind.Root,
37 │ >(
38 │   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
39 ▶   key: TKey,
40 ▶   logic: NoInfer<
41 │     LogicFn<
42 │       TValue,
43 ▶       TKey extends LimitSelectionKey ? LimitKey<TValue> : MetadataSetterType<TKey>,
44 │       TPathKind
45 │     >
46 │   >,
47 │ ): TKey {
48 │   assertPathIsCurrent(path);
49 │ 
50 │   const pathNode = FieldPathNode.unwrapFieldPath(path);
51 ▶   pathNode.builder.addMetadataRule(key, logic);
52 ▶   return key;
53 │ }
```

`metadata(path, key, logic)` は 51 行目で builder に積むだけです（[第 16 回](16-forms-sf-schema.md)の `LogicContainer.getMetadata(key)`）。52 行目でキーを返すので、`const MEMO = metadata(p, createMetadataKey(), ...)` と書いて、同じ schema の別のルールから読めます（[第 17 回](17-forms-sf-validation.md)の Standard Schema がこの形）。

📄 `angular/packages/forms/signals/src/api/rules/metadata.ts` L160–171 （▶ の行: 160, 167–169）

```ts
160 ▶ export class MetadataKey<TRead, TWrite, TAcc> {
161 │   private brand!: (write: TWrite) => [TRead, TAcc];
162 │ 
163 │   /** @internal */
164 │   [IS_ASYNC_VALIDATION_RESOURCE]?: true;
165 │ 
166 │   /** Use {@link createMetadataKey}. */
167 ▶   protected constructor(
168 ▶     readonly reducer: MetadataReducer<TAcc, TWrite>,
169 ▶     readonly create: ((state: FieldState<unknown>, data: Signal<TAcc>) => TRead) | undefined,
170 │   ) {}
171 │ }
```

📄 `angular/packages/forms/signals/src/api/rules/metadata.ts` L233–258 （▶ の行: 233–236, 249–251, 257）

```ts
233 ▶ export function createMetadataKey<TWrite>(): MetadataKey<
234 ▶   Signal<TWrite | undefined>,
235 ▶   TWrite,
236 ▶   TWrite | undefined
237 │ >;
238 │ /**
239 │  * Creates a metadata key used to contain a computed value.
240 │  *
241 │  * @param reducer The reducer used to combine individually set values into the final computed value.
242 │  * @template TWrite The type written to this key using the `metadata()` rule
243 │  * @template TAcc The type of the reducer's accumulated value.
244 │  *
245 │  * @see [Creating a metadata key](guide/forms/signals/field-metadata#creating-a-metadata-key)
246 │  *
247 │  * @publicApi 22.0
248 │  */
249 ▶ export function createMetadataKey<TWrite, TAcc>(
250 ▶   reducer: MetadataReducer<TAcc, TWrite>,
251 ▶ ): MetadataKey<Signal<TAcc>, TWrite, TAcc>;
252 │ export function createMetadataKey<TWrite, TAcc>(
253 │   reducer?: MetadataReducer<TAcc, TWrite>,
254 │ ): MetadataKey<Signal<TAcc>, TWrite, TAcc> {
255 │   return new (MetadataKey as new (
256 │     reducer: MetadataReducer<TAcc, TWrite>,
257 ▶   ) => MetadataKey<Signal<TAcc>, TWrite, TAcc>)(reducer ?? MetadataReducer.override<any>());
258 │ }
```

📄 `angular/packages/forms/signals/src/api/rules/metadata.ts` L295–307 （▶ の行: 299–300, 306）

```ts
295 │ export function createManagedMetadataKey<TRead, TWrite, TAcc>(
296 │   create: (state: FieldState<unknown>, data: Signal<TAcc>) => TRead,
297 │   reducer: MetadataReducer<TAcc, TWrite>,
298 │ ): MetadataKey<TRead, TWrite, TAcc>;
299 ▶ export function createManagedMetadataKey<TRead, TWrite, TAcc>(
300 ▶   create: (state: FieldState<unknown>, data: Signal<TAcc>) => TRead,
301 │   reducer?: MetadataReducer<TAcc, TWrite>,
302 │ ): MetadataKey<TRead, TWrite, TAcc> {
303 │   return new (MetadataKey as new (
304 │     reducer: MetadataReducer<TAcc, TWrite>,
305 │     create: (state: FieldState<unknown>, data: Signal<TAcc>) => TRead,
306 ▶   ) => MetadataKey<TRead, TWrite, TAcc>)(reducer ?? MetadataReducer.override<any>(), create);
307 │ }
```

キーは 168 行目の `reducer` と、169 行目の `create` を持つだけのオブジェクトです。比べるのは同一性なので、キーはモジュールの定数として 1 回作ります。`createMetadataKey()` は 257 行目、reducer を渡さなければ `override`（最後に書いた値が勝つ）。234 行目のとおり読む型は `Signal<T | undefined>` です。`createManagedMetadataKey(create)` は 306 行目で `create` も渡します。`create` は混ぜた値の signal を受け取って*別のもの*を返す関数で、`validateAsync` はこれで「params の signal から resource を作る」キーを作っています（[第 17 回](17-forms-sf-validation.md) 4 節）。

📄 `angular/packages/forms/signals/src/api/rules/metadata.ts` L66–92 （▶ の行: 66, 68, 70, 74, 76–77, 82, 86, 88）

```ts
66 ▶ export interface MetadataReducer<TAcc, TItem> {
67 │   /** The reduce function. */
68 ▶   reduce: (acc: TAcc, item: TItem) => TAcc;
69 │   /** Gets the initial accumulated value. */
70 ▶   getInitial: () => TAcc;
71 │ }
72 │ export const MetadataReducer = {
73 │   /** Creates a reducer that accumulates a list of its individual item values. */
74 ▶   list<TItem>(): MetadataReducer<TItem[], TItem | undefined> {
75 │     return {
76 ▶       reduce: (acc, item) => (item === undefined ? acc : [...acc, item]),
77 ▶       getInitial: () => [],
78 │     };
79 │   },
80 │ 
81 │   /** Creates a reducer that accumulates the min of its individual item values. */
82 ▶   min<T extends Date | number>(): MetadataReducer<T | undefined, T | undefined> {
83 │     return {
84 │       reduce: (acc, item) => {
85 │         if (acc === undefined || item === undefined) {
86 ▶           return acc ?? item;
87 │         }
88 ▶         return item < acc ? item : acc;
89 │       },
90 │       getInitial: () => undefined,
91 │     };
92 │   },
```

📄 `angular/packages/forms/signals/src/api/rules/metadata.ts` L123–134 （▶ の行: 124, 131–132）

```ts
123 │   /** Creates a reducer that always takes the next individual item value as the accumulated value. */
124 ▶   override,
125 │ } as const;
126 │ 
127 │ function override<T>(): MetadataReducer<T | undefined, T>;
128 │ function override<T>(getInitial: () => T): MetadataReducer<T, T>;
129 │ function override<T>(getInitial?: () => T): MetadataReducer<T | undefined, T> {
130 │   return {
131 ▶     reduce: (_, item) => item,
132 ▶     getInitial: () => getInitial?.(),
133 │   };
134 │ }
```

reducer は 68 行目の `reduce` と 70 行目の `getInitial` の組です。用意されているのは `list`（76 行目、`undefined` を捨てて配列に集める）、`min`（88 行目、小さい方）、`max`、`or`、`and`、`override`（131 行目、前の値を捨てて次の値）です。

📄 `angular/packages/forms/signals/src/schema/logic.ts` L185–211 （▶ の行: 187–188, 199–200, 202–206）

```ts
185 │ /** Logic that combines metadata according to the keys's reduce function. */
186 │ export class MetadataMergeLogic<TAcc, TItem> extends AbstractLogic<TAcc, TItem> {
187 ▶   override get defaultValue() {
188 ▶     return this.key.reducer.getInitial();
189 │   }
190 │ 
191 │   constructor(
192 │     predicates: ReadonlyArray<BoundPredicate>,
193 │     private key: MetadataKey<any, TItem, TAcc>,
194 │   ) {
195 │     super(predicates);
196 │   }
197 │ 
198 │   override compute(ctx: FieldContext<any>): TAcc {
199 ▶     if (this.fns.length === 0) {
200 ▶       return this.key.reducer.getInitial();
201 │     }
202 ▶     let acc: TAcc = this.key.reducer.getInitial();
203 ▶     for (let i = 0; i < this.fns.length; i++) {
204 ▶       const item = this.fns[i](ctx);
205 ▶       if (item !== IGNORED) {
206 ▶         acc = this.key.reducer.reduce(acc, item);
207 │       }
208 │     }
209 │     return acc;
210 │   }
211 │ }
```

混ぜ方は 202〜208 行目、初期値から始めて、ルールを積んだ順に `reduce` します。205 行目、条件が偽で `IGNORED` になったルールは飛ばします。`applyWhen` の中の `required` が、条件が偽のとき `required()` を偽にする（[第 16 回](16-forms-sf-schema.md)のデモ）のはこの行です。

## 6. metadata を読む：state.metadata(KEY)

📄 `angular/packages/forms/signals/src/field/metadata.ts` L61–89 （▶ の行: 62, 64–67, 72–75, 79, 87）

```ts
61 │   /** Gets the value of an `MetadataKey` for the field. */
62 ▶   get<T>(key: MetadataKey<T, unknown, unknown>): T | undefined {
63 │     // We create non-managed metadata lazily, the first time they are accessed.
64 ▶     if (this.has(key)) {
65 ▶       if (!this.metadata.has(key)) {
66 ▶         if (key.create) {
67 ▶           throw new RuntimeError(
68 │             RuntimeErrorCode.MANAGED_METADATA_LAZY_CREATION,
69 │             ngDevMode && 'Managed metadata cannot be created lazily',
70 │           );
71 │         }
72 ▶         const logic = this.node.logicNode.logic.getMetadata(key);
73 ▶         this.metadata.set(
74 ▶           key,
75 ▶           computed(() => logic.compute(this.node.context)),
76 │         );
77 │       }
78 │     }
79 ▶     return this.metadata.get(key) as T | undefined;
80 │   }
81 │ 
82 │   /** Checks whether the current metadata state has the given metadata key. */
83 │   has(key: MetadataKey<any, any, any>): boolean {
84 │     // Metadata keys get added to the map lazily, on first access,
85 │     // so we can't rely on checking presence in the metadata map.
86 │     // Instead we check if there is any logic for the given metadata key.
87 ▶     return this.node.logicNode.logic.hasMetadata(key);
88 │   }
89 │ }
```

1. **64・87 行目**

   そのフィールドのロジックにこのキーのルールが 1 つも無ければ、何もせず 79 行目で `undefined`。だから `f.x().metadata(KEY)?.()` と `?.` で読みます。
2. **72〜76 行目**

   初めて読まれたときに、5 節の `compute` を包んだ computed を作って覚えます（遅延作成）。
3. **66〜71 行目**

   managed なキーは遅延で作れません。`create` はフィールドの注入器の中で 1 回だけ呼ぶ必要があるので、`FieldNode` のコンストラクタの最後で先に作られています（[第 17 回](17-forms-sf-validation.md)の `runMetadataCreateLifecycle`）。

📄 `angular/packages/forms/signals/src/field/node.ts` L231–259 （▶ の行: 231–233, 240–242, 253–254, 257–258）

```ts
231 ▶   get max(): Signal<{} | undefined> | undefined {
232 ▶     const maxKey = this.metadata(MAX)?.();
233 ▶     return maxKey ? this.metadata(maxKey) : undefined;
234 │   }
235 │ 
236 │   get maxLength(): Signal<number | undefined> | undefined {
237 │     return this.metadata(MAX_LENGTH);
238 │   }
239 │ 
240 ▶   get min(): Signal<{} | undefined> | undefined {
241 ▶     const minKey = this.metadata(MIN)?.();
242 ▶     return minKey ? this.metadata(minKey) : undefined;
243 │   }
244 │ 
245 │   get minLength(): Signal<number | undefined> | undefined {
246 │     return this.metadata(MIN_LENGTH);
247 │   }
248 │ 
249 │   get pattern(): Signal<readonly RegExp[]> {
250 │     return this.metadata(PATTERN) ?? EMPTY;
251 │   }
252 │ 
253 ▶   get required(): Signal<boolean> {
254 ▶     return this.metadata(REQUIRED) ?? FALSE;
255 │   }
256 │ 
257 ▶   metadata<M>(key: MetadataKey<M, any, any>): M | undefined {
258 ▶     return this.metadataState.get(key);
259 │   }
```

`FieldState` の `required()`・`min()`・`max()` などは、どれも metadata を読むだけの getter です。254 行目、`required` は `REQUIRED` キー（ルールが無ければ常に偽の signal）。241〜242 行目の `min` は 2 段で、まず `MIN` キーから「どのキーを読むか」を取り、そのキーの値を読みます。理由は次の引用です。

📄 `angular/packages/forms/signals/src/api/rules/metadata.ts` L320–343 （▶ の行: 328–329, 335–336, 343）

```ts
320 │ /**
321 │  * A {@link MetadataKey} representing whether the field is required.
322 │  *
323 │  * @see [Required validation](guide/forms/signals/validation#required)
324 │  *
325 │  * @category validation
326 │  * @publicApi 22.0
327 │  */
328 ▶ export const REQUIRED: MetadataKey<Signal<boolean>, boolean, boolean> = createMetadataKey(
329 ▶   MetadataReducer.or(),
330 │ );
331 │ 
332 │ /**
333 │  * A {@link MetadataKey} that points to another key determining the minimum value of the field.
334 │  *
335 ▶  * This indirection allows different keys to be used for different types of values with their
336 ▶  * own reducers, such as {@link MIN_DATE} and {@link MIN_NUMBER}.
337 │  *
338 │  * @see [Minimum and maximum validation](guide/forms/signals/validation#min-and-max)
339 │  *
340 │  * @category validation
341 │  * @publicApi 22.0
342 │  */
343 ▶ export const MIN: LimitSelectionKey = createLimitSelectionKey();
```

📄 `angular/packages/forms/signals/src/api/rules/validation/min.ts` L33–70 （▶ の行: 38, 41–42, 45, 49, 52–53, 58, 62, 66）

```ts
33 │ export function min<TValue extends number | null, TPathKind extends PathKind = PathKind.Root>(
34 │   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
35 │   minValue: number | LogicFn<TValue, number | undefined, TPathKind>,
36 │   config?: BaseValidatorConfig<TValue, TPathKind>,
37 │ ): void {
38 ▶   const MIN_MEMO = createMetadataKey<number | undefined>();
39 │ 
40 │   // Memomize the minimum valid.
41 ▶   metadata(path, MIN_MEMO, (ctx) => {
42 ▶     if (config?.when && !config.when(ctx)) {
43 │       return undefined;
44 │     }
45 ▶     return typeof minValue === 'function' ? minValue(ctx) : minValue;
46 │   });
47 │ 
48 │   // Publish the memoized mininum value for aggregation.
49 ▶   metadata(path, MIN_NUMBER, ({state}) => state.metadata(MIN_MEMO)!());
50 │ 
51 │   // Use `MIN_NUMBER` to define the `min` property of the field.
52 ▶   metadata(path, MIN, () => MIN_NUMBER as LimitKey<TValue>);
53 ▶   validate(path, (ctx) => {
54 │     const value = ctx.value();
55 │     if (value === null || Number.isNaN(value)) {
56 │       return undefined;
57 │     }
58 ▶     const min = ctx.state.metadata(MIN_MEMO)!();
59 │     if (min === undefined || Number.isNaN(min)) {
60 │       return undefined;
61 │     }
62 ▶     if (value < min) {
63 │       if (config?.error) {
64 │         return getOption(config.error, ctx);
65 │       } else {
66 ▶         return minError(min, {message: getOption(config?.message, ctx)});
67 │       }
68 │     }
69 │     return undefined;
70 │   });
```

1. **41〜46 行目：最小値を 1 回だけ計算して memo に入れる**

   38 行目でこの `min()` 呼び出し専用のキーを作り、`when` が偽なら `undefined`、そうでなければ最小値です。
2. **49 行目：公開用のキーに流す**

   `MIN_NUMBER`（数値用。reducer は `max`、つまり複数の `min()` があれば一番厳しいもの）に memo の値を書きます。
3. **52 行目：「min はこのキーを見よ」と書く**

   335〜336 行目のコメントのとおり、日付（`MIN_DATE`）と数値（`MIN_NUMBER`）で別のキーと reducer を使うための間接参照です。
4. **53〜69 行目：検証も同じ memo を読む**

   58 行目、検証の関数は 41 行目の memo を読み、62 行目で比べ、66 行目で `minError` を返します。

`min` は「metadata を書くルール 3 つ」と「検証のルール 1 つ」の束です。`required` も同じで（[signal-forms](../signals/17-signal-forms.md) の 6 節）、metadata の `REQUIRED` と検証は別のルールですが、同じ path・同じ条件で積まれるので、いつも一緒に変わります（Q&A の 3 問目）。

## 7. debounce も metadata

📄 `angular/packages/forms/signals/src/api/rules/debounce.ts` L30–59 （▶ の行: 37–38, 45–46, 50–51, 54–55, 58）

```ts
30 │ export function debounce<TValue, TPathKind extends PathKind = PathKind.Root>(
31 │   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
32 │   config: number | 'blur' | Debouncer<TValue, TPathKind>,
33 │ ): void {
34 │   assertPathIsCurrent(path);
35 │ 
36 │   const pathNode = FieldPathNode.unwrapFieldPath(path);
37 ▶   const debouncer = normalizeDebouncer(config);
38 ▶   pathNode.builder.addMetadataRule(DEBOUNCER, () => debouncer);
39 │ }
40 │ 
41 │ function normalizeDebouncer<TValue, TPathKind extends PathKind>(
42 │   debouncer: number | 'blur' | Debouncer<TValue, TPathKind>,
43 │ ) {
44 │   // If it's already a debounce function, return it as-is.
45 ▶   if (typeof debouncer === 'function') {
46 ▶     return debouncer;
47 │   }
48 │   // If it's 'blur', return a debouncer that never resolves. The field will still be updated when
49 │   // the control is blurred.
50 ▶   if (debouncer === 'blur') {
51 ▶     return debounceUntilBlur();
52 │   }
53 │   // If it's a non-zero number, return a timer-based debouncer.
54 ▶   if (debouncer > 0) {
55 ▶     return debounceForDuration(debouncer);
56 │   }
57 │   // Otherwise it's 0, so we return a function that will synchronize the model without delay.
58 ▶   return immediate;
59 │ }
```

📄 `angular/packages/forms/signals/src/field/debounce.ts` L13–22 （▶ の行: 16, 18, 22）

```ts
13 │ /**
14 │  * A private {@link MetadataKey} used to aggregate `debounce()` rules.
15 │  *
16 ▶  * This will pick the last `debounce()` rule on a field that is currently applied, if conditional.
17 │  */
18 ▶ export const DEBOUNCER: MetadataKey<
19 │   Signal<Debouncer<any> | undefined> | undefined,
20 │   Debouncer<any>,
21 │   Debouncer<any> | undefined
22 ▶ > = createMetadataKey();
```

`debounce(path, config)` は 37 行目で設定を関数にそろえ、38 行目で非公開のキー `DEBOUNCER` に書くだけです。設定は 3 種類で、45〜46 行目の関数はそのまま、50〜51 行目の `'blur'` は「中断されるまで解決しない Promise」、54〜55 行目の正の数はタイマー、0 以下は 58 行目の何もしない関数です。キーは 22 行目の `createMetadataKey()`、つまり override で、16 行目のとおり**最後の debounce が勝ちます**。

📄 `angular/packages/forms/signals/src/field/state.ts` L163–183 （▶ の行: 168–170, 174–175, 182）

```ts
163 │   /**
164 │    * An optional {@link Debouncer} factory for this field.
165 │    */
166 │   readonly debouncer: Signal<((signal: AbortSignal) => Promise<void> | void) | undefined> =
167 │     computed(() => {
168 ▶       if (this.node.logicNode.logic.hasMetadata(DEBOUNCER)) {
169 ▶         const debouncerLogic = this.node.logicNode.logic.getMetadata(DEBOUNCER);
170 ▶         const debouncer = debouncerLogic.compute(this.node.context);
171 │ 
172 │         // Even if this field has a `debounce()` rule, it could be applied conditionally and currently
173 │         // inactive, in which case `compute()` will return undefined.
174 ▶         if (debouncer) {
175 ▶           return (signal) => debouncer(this.node.context, signal);
176 │         }
177 │       }
178 │ 
179 │       // Fallback to the parent's debouncer, if any. If there is no debouncer configured all the way
180 │       // up to the root field, this simply returns `undefined` indicating that the operation should
181 │       // not be debounced.
182 ▶       return this.node.structure.parent?.nodeState.debouncer?.();
183 │     });
```

読むのは `FieldNodeState.debouncer` です。168〜170 行目で自分の `DEBOUNCER` を計算し、あれば 175 行目で「文脈を渡して呼ぶ関数」にして返します。182 行目、自分に無ければ**親の debouncer** を使います。根に `debounce(p, 300)` を 1 つ書けば、全部の入力欄が 300 ms 待ちになります。この関数を `debounceSync` が呼んで待つところは [signal-forms](../signals/17-signal-forms.md) の 7 節です。

## 8. 入力欄へ：\[formField\] が読む状態の表

📄 `angular/packages/forms/signals/src/directive/bindings.ts` L25–64 （▶ の行: 25–26, 30, 32, 34, 39–40, 58, 62–63）

```ts
25 ▶ const FIELD_STATE_KEY_TO_CONTROL_BINDING = {
26 ▶   disabled: 'disabled' as ControlBindingKey,
27 │   disabledReasons: 'disabledReasons' as ControlBindingKey,
28 │   dirty: 'dirty' as ControlBindingKey,
29 │   errors: 'errors' as ControlBindingKey,
30 ▶   hidden: 'hidden' as ControlBindingKey,
31 │   invalid: 'invalid' as ControlBindingKey,
32 ▶   max: 'max' as ControlBindingKey,
33 │   maxLength: 'maxLength' as ControlBindingKey,
34 ▶   min: 'min' as ControlBindingKey,
35 │   minLength: 'minLength' as ControlBindingKey,
36 │   name: 'name' as ControlBindingKey,
37 │   pattern: 'pattern' as ControlBindingKey,
38 │   pending: 'pending' as ControlBindingKey,
39 ▶   readonly: 'readonly' as ControlBindingKey,
40 ▶   required: 'required' as ControlBindingKey,
41 │   touched: 'touched' as ControlBindingKey,
42 │ } as const satisfies {[K in keyof ReadonlyFieldState<unknown>]?: ControlBindingKey};
43 │ 
44 │ /**
45 │  * Inverts `FIELD_STATE_KEY_TO_CONTROL_BINDING` to look up the minified name of the corresponding
46 │  * field state property from its control binding name.
47 │  */
48 │ const CONTROL_BINDING_TO_FIELD_STATE_KEY = /* @__PURE__ */ (() => {
49 │   const map = {} as Record<ControlBindingKey, keyof typeof FIELD_STATE_KEY_TO_CONTROL_BINDING>;
50 │   for (const key of Object.keys(FIELD_STATE_KEY_TO_CONTROL_BINDING) as Array<
51 │     keyof typeof FIELD_STATE_KEY_TO_CONTROL_BINDING
52 │   >) {
53 │     map[FIELD_STATE_KEY_TO_CONTROL_BINDING[key]] = key;
54 │   }
55 │   return map;
56 │ })();
57 │ 
58 ▶ export function readFieldStateBindingValue(
59 │   fieldState: ReadonlyFieldState<unknown>,
60 │   key: ControlBindingKey,
61 │ ): unknown {
62 ▶   const property = CONTROL_BINDING_TO_FIELD_STATE_KEY[key];
63 ▶   return fieldState[property]?.();
64 │ }
```

25〜42 行目が「`FieldState` のプロパティ名 → 入力欄に書く名前」の表です。disabled・hidden・readonly・required・min・max などが並び、58〜64 行目の `readFieldStateBindingValue` は 63 行目で `fieldState[property]?.()`、つまり 6 節の getter を呼んで値を読みます。ネイティブ要素なら、[signal-forms](../signals/17-signal-forms.md) の 8 節で読んだ `ɵngControlUpdate` の関数がこの表の名前を全部回し、前回と違う値だけを書きます。

📄 `angular/packages/forms/signals/src/directive/form_field.ts` L413–437 （▶ の行: 418–419, 423–433, 435）

```ts
413 │   /** @internal */
414 │   elementAcceptsNativeProperty<K extends ControlBindingKey>(
415 │     key: K,
416 │   ): key is K &
417 │     ('min' | 'max' | 'minLength' | 'maxLength' | 'disabled' | 'required' | 'readonly' | 'name') {
418 ▶     if (!this.elementIsNativeFormElement) {
419 ▶       return false;
420 │     }
421 │ 
422 │     switch (key) {
423 ▶       case 'min':
424 ▶       case 'max':
425 ▶         return (this._elementAcceptsMinMax ??= elementAcceptsMinMax(this.element));
426 ▶       case 'minLength':
427 ▶       case 'maxLength':
428 ▶         return this.elementAcceptsTextualValues;
429 ▶       case 'disabled':
430 ▶       case 'required':
431 ▶       case 'readonly':
432 ▶       case 'name':
433 ▶         return true;
434 │       default:
435 ▶         return false;
436 │     }
437 │   }
```

ただし DOM のプロパティとして書くのは、要素が受け付けるものだけです。418 行目、`<input>`・`<select>`・`<textarea>` 以外には書きません。423〜425 行目、`min`/`max` は数値や日付の入力欄だけ、426〜428 行目、`minLength`/`maxLength` は文字の入力欄だけ、429〜433 行目、disabled・required・readonly・name は常に書きます。435 行目、hidden は DOM に書きません。hidden は「描画しない」ためのもので、テンプレートの `@if` で消すのが前提です （開発ビルドでは、hidden のフィールドが描画されていると `form_field.ts` が警告を出します）。表にあって DOM に書かない値（errors・touched など）は、自作の入力部品の input に渡ります。

## 9. ここまでを 1 本に（根を disabled にする）

- 👤 `lockAll.set(true)`（`disabled(p, { when: () => lockAll() ? 'ロック中です' : false })`）
  - 根の `disabledReasons` computed が古くなる — state.ts 109–113
    - ルールが `{fieldTree: 根, message: 'ロック中です'}` を返す — disabled.ts 70–71
  - 子の `disabledReasons` が親の理由を受け継ぐ → `disabled()` 真 — state.ts 111 / 124
  - 子の `shouldSkipValidation` 真 → `errors()` 空、内部の `status` 'valid' — validation.ts 369
  - 子の `touched()`・`dirty()` 偽（印は残る） — state.ts 79 / 95 / 193
  - `ɵngControlUpdate` が表を回し、`disabled` を要素に書く — bindings.ts 26 / form\_field.ts 429 — *変更検知の中*

## 10. DEMO：状態ルールと自作の metadata

> **🧪 DEMO — disabled（when 付き）・hidden・readonly と metadata**
>
> 本物の `@angular/forms/signals`（22.1.6）です。根に `disabled(p, {when})`、nickname に `hidden`、note に `readonly`、name と nickname に `required`、age に `min(18)`・`max(120)`。自作のキーは 2 つ：`PLACEHOLDER = createMetadataKey<string>()` と `HINTS = createMetadataKey(MetadataReducer.list<string>())`。入力欄の `placeholder` は `[formField]` ではなく、テンプレートで `f.name().metadata(PLACEHOLDER)?.()` を読んで付けています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-sf-rules-metadata)

「根を disabled」を入れると、全行の `disabled` が `true` になり、`disabledReasons` に根の「ロック中です」が並び、エラーが消えて `valid` が `true` になります（3 節 111 行目、4 節 369 行目）。name に何か打ってから入れると、name の `dirty` が `false` に変わり、外すと `true` に戻ります。印は消えず、4 節 79 行目で無視されているだけです。nickname を hidden にすると入力欄が消え（`@if`）、`required` エラーも消えます。そのまま `markAsTouched()` を押しても nickname の `touched` は `false` です。`HINTS` は 2 つのルールの値を `list` reducer で集め、lockAll が偽の間は 2 つ目が `undefined` なので捨てられます（5 節 76 行目）。age の入力欄には `min="18"` と `max="120"` の属性が付いています（8 節 423〜425 行目。開発者ツールで確かめられます）。

## テストと直し方

| spec（signals/test/） | describe / it | 確かめていること |
| --- | --- | --- |
| `node/api/hidden.spec.ts` | 13 行目 `describe('hidden')` › 50 行目 `it('propagates the value down')`・69 行目 `it('disables validation for the field')`・100 行目 `it('disables touch state propagation')` | 3 節 149 行目、4 節 368 行目、4 節 95 行目 |
| `node/api/readonly.spec.ts` | 13 行目 `describe('readonly')` › 80 行目 `it('propagates the value down')`・130 行目 `it('disables touch state propagation')` | readonly の同じ 3 点 |
| `node/field_node.spec.ts` | 45 行目 `describe('FieldNode')` › 867 行目 `describe('disabled')` › 927 行目 `it('disabled reason should propagate to children')` | 3 節 111 行目 |
| `node/field_node.spec.ts` | 446 行目 `describe('touched')` › 580 行目 `it('should not be marked as touched when is disabled')` | 4 節 95 行目 |
| `node/api/metadata.spec.ts` | 13 行目 `describe('metadata')` › 54 行目 `it('should reduce values with MetadataReducer.list')` など 6 本 | 5 節の reducer |
| `node/api/debounce.spec.ts` | 14 行目 `describe('debounce')` › 315 行目 `describe('inheritance')`・395 行目 `describe('aggregation')` | 7 節 182 行目（親の debouncer）と 16 行目（最後が勝つ） |
| `web/form_field.spec.ts` | 94 行目 `describe('field directive')` › 184 行目 `describe('properties')` | 8 節。ブラウザの DOM が要るので `//packages/forms/signals/test/web:test` の方 |

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/node:test \
  --test_arg=--filter="^(hidden |readonly |FieldNode disabled )" \
  --test_output=all
```

📄 `実際に走らせた記録（scratchpad/forms-logs/e-forms-sf-rules-submit.log）`

```
# 第 19 回のフィルタと | でつないだ 1 本で走らせた記録
# --test_arg=--filter="^(hidden |readonly |FieldNode disabled |submit |FormRoot |Forms compat |SignalFormControl )"
Ran 170 of 539 specs
170 specs, 0 failures
//packages/forms/signals/test/node:test                                  PASSED in 1.0s
# 内訳（spec ファイルの it の数）
#   この回の分: hidden 7 + readonly 8 + FieldNode disabled 5 = 20
#   第 19 回の分: submit 28 + FormRoot 5 + Forms compat 32 + SignalFormControl 57 + SignalFormControl in FormGroup 28 = 150
```

走らせる回数を節約するため、第 19 回の describe とつないだ 1 本で走らせました。170 本は、spec ファイルの `it` の数（この回の分が 20 本、第 19 回の分が 150 本）と一致しています。上のコマンド（この回の分だけ）の対象は、spec ファイルの `it` を数えると 20 本です（`FieldNode disabled` の 5 本は `describe('disabled')` の中の `it` の数）。2026-11-01 にこの回の分だけを走らせると `Ran 20 of 539 specs` / `20 specs, 0 failures` で、数え方と一致しました。

- **親子の伝わり方**がおかしいなら、`field/state.ts` の `disabledReasons`・`readonly`・`hidden`・`touched`・`dirty`。足す先は `field_node.spec.ts` の該当する describe か、`api/hidden.spec.ts`・`api/readonly.spec.ts`。
- **metadata の混ぜ方・読み方**なら、`schema/logic.ts` の `MetadataMergeLogic` と `field/metadata.ts` の `get`。足す先は `api/metadata.spec.ts`。
- **入力欄の属性**なら、`directive/bindings.ts` の表と `form_field.ts` の `elementAcceptsNativeProperty`。足す先は `web/form_field.spec.ts`（ブラウザのテスト）。

手元で壊すなら、`state.ts` 79 行目の `&& !this.isNonInteractive()` を消して `should not be marked as dirty when is disabled` が落ちるのを見る、くらいの小ささにします（必ず戻す）。「disabled にしたのに dirty が残る」「hidden のフィールドが送信される値に入る」という issue を読むときは、この章の行で「仕様か、実装の漏れか」を切り分けます（[第 20 回](20-forms-issues.md)）。

## 聞かれそうな質問

**Q. hidden と disabled の違いは何ですか？どちらも検証されないのですか？**

検証については違いがありません。`shouldSkipValidation`（`validation.ts` 366〜372 行目）が hidden・disabled・readonly を同じに扱い、どれも検証を飛ばし、親の valid にも数えられません。touched・dirty も `isNonInteractive`（`state.ts` 192〜194 行目）で 3 つ同じです。違いは 3 つあります。disabled だけが理由（`disabledReasons`、`disabled.ts` 70〜73 行目）を持てること、入力欄に書かれるのは disabled で、hidden は DOM に書かれない（`form_field.ts` 429〜435 行目）こと、hidden は `@if` で描画から外す前提であることです。どれも値は model に残ります。

**Q. 親が disabled なら子はどうなりますか？子だけ有効にできますか？**

子も disabled です。`state.ts` 111 行目で子は親の `disabledReasons()` を全部受け継ぎ、124 行目で理由が 1 つでもあれば disabled です。子のルールは理由を*足す*ことしかできないので、子だけ有効にはできません。readonly と hidden も 135・149 行目の `||` で同じです。子を個別に切り替えたいなら、親ではなく子それぞれに `disabled(p.x, { when })` を付けます。

**Q. required の metadata と required の検証は別物ですか？**

別のルールです。`required()` は `REQUIRED` キー（`metadata.ts` 328〜330 行目、reducer は `or`）に「必須か」を書くルールと、空ならエラーを返す検証のルールを、同じ path に続けて積みます（`min` も同じ形、`min.ts` 41〜53 行目）。同じ path・同じ条件で積まれるので、`applyWhen` の中でも一緒に消えます。`f.x().required()`（`node.ts` 253〜255 行目）と入力欄の `required` 属性は metadata、`errors()` の `required` は検証から来ます。`metadata(p.x, REQUIRED, () => true)` だけを書けば、属性は付くがエラーは出ない、という状態も作れます。

**Q. 自作の metadata は \[formField\] 以外からどう読みますか？**

`f.x().metadata(KEY)` で signal が返ります（`node.ts` 257〜259 行目 → `field/metadata.ts` 62〜80 行目）。そのフィールドにこのキーのルールが無ければ `undefined` なので、`?.()` で呼びます。テンプレートで読めば、その signal がテンプレートの依存になり、ルールの中で読んだ signal が変わると描画し直されます。デモの `placeholder` と `HINTS` がこの形です。

**Q. debounce を親に付けると子にも効きますか？**

効きます。`FieldNodeState.debouncer`（`state.ts` 166〜183 行目）は、自分に `DEBOUNCER` が無ければ 182 行目で親の debouncer を使います。子に別の `debounce` を書けばそちらが優先され（168〜176 行目）、同じフィールドに複数書けば override の reducer で最後の 1 つが勝ちます（`field/debounce.ts` 16・22 行目）。

## 読み終えて

- `disabled` は理由を返す関数、`hidden`・`readonly` は真偽を返す関数を builder に積む。自分の分は配列の連結と OR で混ぜる
- 3 つとも「親がそうなら自分もそう」の computed。子のルールで親の状態を打ち消すことはできない
- 3 つのどれかなら検証を飛ばし、touched・dirty も見えなくなる（印は残る）。検証については 3 つは同じ扱い
- metadata はキー（reducer と任意の create）ごとに値を 1 つに混ぜた signal。`required()`・`min()`・debounce はどれも metadata の読み手
- `[formField]` は状態の名前の表を回して、要素が受け付けるものだけを DOM のプロパティに書く。hidden は書かれない

---

← 前: [Signal Forms の検証：validate・validateAsync・Standard Schema](17-forms-sf-validation.md)  
次: [Signal Forms の submit と、リアクティブフォームとの相互運用](19-forms-sf-submit-compat.md) →
