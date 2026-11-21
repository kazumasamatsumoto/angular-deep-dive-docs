[目次](../README.md) › [Signal Forms の型を読む：FieldTree から SchemaPath まで、api/types.ts の 1000 行](README.md) › 第 4 回 / 全 6 回

# PathKind と SchemaPath：ルールを付けられる場所を型で決める

> types.ts の後半：PathKind（Root・Child・Item）と SchemaPathRules（Supported・Unsupported）という型だけの印、SchemaPath・CompatSchemaPath・SchemaPathTree・MaybeSchemaPathTree、Schema・SchemaFn・SchemaOrSchemaFn、LogicFn・Validator、FieldContext と RootFieldContext・ChildFieldContext・ItemFieldContext、ItemType。applyEach の中だけ index が読める理由と、実行時は 1 つの FieldNodeContext であること。手元の tsc の型エラー 13 の形。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfty-path)

---

`validate(p.name, (ctx) => …)` の `ctx` で `index` を読むと型エラーになり、`applyEach` の中で読むと通ります。この章では、その違いを決めている `types.ts` の後半の型（PathKind・SchemaPathRules・SchemaPath・SchemaPathTree・Schema・SchemaFn・LogicFn・Validator・FieldContext）を 1 つずつ読み、型が実行時には何として現れるか（現れないか）を、ページの上の本物の `form()` と手元の `tsc` の記録で確かめます。

読む対象は `packages/forms/signals/src/api/types.ts` の 81〜113 行目と 672 行目から最後まで、`api/symbols.ts`、`api/structure.ts` の `applyEach`、`api/rules/validation/validate.ts`、`field/context.ts`、`schema/logic.ts` です（../angular、8576f161ae4）。path が実行時には Proxy で、ルールを記録するだけのものであることは[forms-sf-schema](../forms/16-forms-sf-schema.md)で、ルールが受け取る `FieldNodeContext` の各メンバーの実装は[sft-proxy-context](../sft/03-sft-proxy-context.md)で読みました。ここでは繰り返さず、型の側から読みます。

1. [1. FieldTree と Field](01-sfty-tree.md)
2. [2. FieldState の読み口](02-sfty-state.md)
3. [3. 検証の結果と binding の型](03-sfty-results.md)
4. **4. PathKind と SchemaPath**（この章）
5. [5. validateHttp と debounce](05-sfty-http-debounce.md)
6. [6. spec と issue](06-sfty-tests-issues.md)

## 0. 全体の流れ

1. **path に「種類」の印を付ける**

   schema 関数の引数 `p` とその子は、型の上で `PathKind`（Root・Child・Item のどれか）と `SchemaPathRules`（ルールを付けられるか）を持ちます。どちらも実行時には存在しない、型だけの印です（1・2 節）。
2. **子に下りると種類が決まる**

   `SchemaPathTree` が `p.name` を Child にし、`applyEach` だけが要素の path を Item にします（3・4 節）。
3. **ルールの関数に種類を流す**

   `validate` などは path から `TPathKind` を推論し、同じ `TPathKind` でルールの関数の引数の型を決めます（5 節）。
4. **種類で context の形を選ぶ**

   `FieldContext<T, TPathKind>` の条件型が、Root・Child・Item の 3 つの context の型のどれかを選びます（6 節）。
5. **実行時は 1 つのクラス**

   実際に渡るのはいつも同じ `FieldNodeContext` で、`key` も `index` も持っています。型が隠していたメンバーを読むと、実行時のエラーになります（7・8 節）。

## 1. ɵɵTYPE と PathKind：型にだけある印

📄 `angular/packages/forms/signals/src/api/symbols.ts` L9–13 （▶ の行: 10, 12）

```ts
 9 │ /**
10 ▶  * Symbol used to retain generic type information when it would otherwise be lost.
11 │  */
12 ▶ export declare const ɵɵTYPE: unique symbol;
13 │ 
```

12 行目は `declare const` です。型の宣言だけで、JavaScript の値は作りません。10 行目のコメントのとおり「失われる型の情報を残しておく」ための `unique symbol` で、`types.ts` の多くの型が `[ɵɵTYPE]: …` というキーで型の引数を持ち運びます。キーが実行時に存在しないので、どの値もこのキーを本当には持っていません。型の比べ合いのためだけの性質です（このような性質を、ここでは「型の印」と呼びます）。同じファイルの次の行の `FIELD_TREE` は `Symbol(…)` で値を作る点が違います（[sft-proxy-context](../sft/03-sft-proxy-context.md) の 4 節）。

📄 `angular/packages/forms/signals/src/api/types.ts` L81–113 （▶ の行: 86–87, 91, 97, 103–104, 110–111）

```ts
 81 │ /**
 82 │  * The kind of `FieldPath` (`Root`, `Child` of another `FieldPath`, or `Item` in a `FieldPath` array)
 83 │  *
 84 │  * @publicApi 22.0
 85 │  */
 86 ▶ export type PathKind = PathKind.Root | PathKind.Child | PathKind.Item;
 87 ▶ export declare namespace PathKind {
 88 │   /**
 89 │    * The `PathKind` for a `FieldPath` that is at the root of its field tree.
 90 │    */
 91 ▶   export interface Root {
 92 │     /**
 93 │      * The `ɵɵTYPE` is constructed to allow the `extends` clause on `Child` and `Item` to narrow the
 94 │      * type. Another way to think about this is, if we have a function that expects this kind of
 95 │      * path, the `ɵɵTYPE` lists the kinds of path we are allowed to pass to it.
 96 │      */
 97 ▶     [ɵɵTYPE]: 'root' | 'child' | 'item';
 98 │   }
 99 │ 
100 │   /**
101 │    * The `PathKind` for a `FieldPath` that is a child of another `FieldPath`.
102 │    */
103 ▶   export interface Child extends PathKind.Root {
104 ▶     [ɵɵTYPE]: 'child' | 'item';
105 │   }
106 │ 
107 │   /**
108 │    * The `PathKind` for a `FieldPath` that is an item in a `FieldPath` array.
109 │    */
110 ▶   export interface Item extends PathKind.Child {
111 ▶     [ɵɵTYPE]: 'item';
112 │   }
113 │ }
```

86 行目の `PathKind` は 3 つの interface の和で、87 行目の `declare namespace` の中に同じ名前で並んでいます（型の名前と namespace の名前が同じなので、`PathKind` と `PathKind.Item` の両方が書けます）。3 つの違いは `[ɵɵTYPE]` の型だけです。

| interface | 行 | \[ɵɵTYPE\] の型 | extends |
| --- | --- | --- | --- |
| `PathKind.Root` | 91〜98 | `'root' \| 'child' \| 'item'` | ― |
| `PathKind.Child` | 103〜105 | `'child' \| 'item'` | `PathKind.Root` |
| `PathKind.Item` | 110〜112 | `'item'` | `PathKind.Child` |

93〜95 行目のコメントが読み方です。「ある種類の path を受ける関数があるとき、`ɵɵTYPE` は、そこに渡してよい path の種類の一覧」。Root を受ける場所には 3 種類のどれでも渡せ、Item を受ける場所には Item しか渡せません。TypeScript は型を構造で比べるので、`'item'` は `'child' | 'item'` に代入でき、`'root' | 'child' | 'item'` は `'item'` に代入できない、という文字列の和の比べ合いがそのまま「種類の包含」になります。104・111 行目のように子の interface で性質の型を狭めるのは、`extends` が「親の性質の型に代入できる型」だけを許すからです。

![PathKind の包含。内側の箱の種類は、外側の箱の種類を受ける場所に渡せる（狭い和から広い和へ）。逆は渡せない](../assets/sfty-path-1.svg)

*PathKind の包含。内側の箱の種類は、外側の箱の種類を受ける場所に渡せる（狭い和から広い和へ）。逆は渡せない*

## 2. SchemaPathRules と SchemaPath：ルールを付けてよいか

📄 `angular/packages/forms/signals/src/api/types.ts` L672–684 （▶ の行: 672, 674, 678, 683）

```ts
672 ▶ export type SchemaPathRules = SchemaPathRules.Supported | SchemaPathRules.Unsupported;
673 │ 
674 ▶ export declare namespace SchemaPathRules {
675 │   /**
676 │    * Used for paths that support settings rules.
677 │    */
678 ▶   type Supported = 1;
679 │ 
680 │   /**
681 │    * Used for paths that do not support settings rules, e.g., compatPath.
682 │    */
683 ▶   type Unsupported = 2;
684 │ }
```

もう 1 つの印が `SchemaPathRules` です。678 行目の `Supported` は数のリテラル型 `1`、683 行目の `Unsupported` は `2` です。値の 1 と 2 には意味が無く、「互いに代入できない 2 つの型」であればよいので数を使っています。674 行目の `declare namespace` の中の `type` には `export` がありませんが、`declare` の namespace（ambient の namespace）の中の宣言は書かなくても外から見えるので、`SchemaPathRules.Supported` と書けます（5 節の `validate.ts` の 17 行目が import し、34 行目で使っています）。

📄 `angular/packages/forms/signals/src/api/types.ts` L686–710 （▶ の行: 688–689, 700, 702–703, 705–708）

```ts
686 │ /**
687 │  * An object that represents a location in the `FieldTree` tree structure and is used to bind logic to a
688 ▶  * particular part of the structure prior to the creation of the form. Because the `FieldPath`
689 ▶  * exists prior to the form's creation, it cannot be used to access any of the field state.
690 │  *
691 │  * @template TValue The type of the data which the form is wrapped around.
692 │  * @template TPathKind The kind of path (root field, child field, or item of an array)
693 │  *
694 │  * @see [The schema function](guide/forms/signals/validation#the-schema-function)
695 │  * @see [Schemas and schema composability](guide/forms/signals/schemas)
696 │  *
697 │  * @category types
698 │  * @publicApi 22.0
699 │  */
700 ▶ export type SchemaPath<
701 │   TValue,
702 ▶   TSupportsRules extends SchemaPathRules = SchemaPathRules.Supported,
703 ▶   TPathKind extends PathKind = PathKind.Root,
704 │ > = {
705 ▶   [ɵɵTYPE]: {
706 ▶     value: () => TValue;
707 ▶     supportsRules: TSupportsRules;
708 ▶     pathKind: TPathKind;
709 │   };
710 │ };
```

`SchemaPath` は 705〜709 行目の 1 つの型の印だけでできたオブジェクトの型で、3 つの型の引数をそこにしまっています。706 行目の値の型（関数の戻り値の形にして持つ）、707 行目のルールの可否、708 行目の種類です。688〜689 行目のコメントのとおり、path はフォームを作る前に存在するので、状態を読む手段はありません。実行時の正体は `FieldPathNode` を包んだ Proxy で、どんなキーでも子の path を返します（[forms-sf-schema](../forms/16-forms-sf-schema.md) の 2 節）。702・703 行目の既定値のとおり、型の引数を省いた `SchemaPath<T>` は「ルールを付けられる、Root の path」です。

📄 `angular/packages/forms/signals/src/api/types.ts` L712–733 （▶ の行: 720, 724–725, 731）

```ts
712 │ /**
713 │  * Schema path used if the value is an AbstractControl.
714 │  *
715 │  * @see [Migrating existing forms to Signal Forms](guide/forms/signals/migration)
716 │  *
717 │  * @category interop
718 │  * @publicApi 22.0
719 │  */
720 ▶ export type CompatSchemaPath<
721 │   TControl extends AbstractControl,
722 │   TPathKind extends PathKind = PathKind.Root,
723 │ > = SchemaPath<
724 ▶   TControl extends AbstractControl<unknown, infer TValue> ? TValue : never,
725 ▶   SchemaPathRules.Unsupported,
726 │   TPathKind
727 │ > &
728 │   // & also we capture the control type, so that `stateOf(p)` can unwrap
729 │   // to a correctly typed `CompatFieldState`.
730 │   {
731 ▶     [ɵɵTYPE]: {control: TControl};
732 │   };
733 │ 
```

720 行目の `CompatSchemaPath` は、値が `AbstractControl`（リアクティブフォームの `FormControl` など）の場所の path です。724 行目で値の型を control の中身の型にし、725 行目で `Unsupported` を付けます。731 行目でさらに control の型そのものを印にしまうので、`stateOf(p.ctrl)` が control を持った状態の型を返せます（6 節の 982〜984 行目）。compatForm の実行時の仕組みは[sft-signal-form-control](../sft/04-sft-signal-form-control.md)と[forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md)にあります。

## 3. SchemaPathTree と MaybeSchemaPathTree：子に下りると Child になる

📄 `angular/packages/forms/signals/src/api/types.ts` L745–780 （▶ の行: 746, 750–752, 754, 756–758, 760–761, 779–780）

```ts
745 │ export type SchemaPathTree<TModel, TPathKind extends PathKind = PathKind.Root> =
746 ▶   // Note: We use `[TModel]` here to avoid distributing over a union type model.
747 │   // (e.g. if we have a model of `number | string`, we want a `SchemaPath<number | string>`,
748 │   // not a `SchemaPath<number> | SchemaPath<string>`.
749 │   // See https://typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types)
750 ▶   ([TModel] extends [AbstractControl]
751 ▶     ? CompatSchemaPath<TModel, TPathKind>
752 ▶     : SchemaPath<TModel, SchemaPathRules.Supported, TPathKind>) &
753 │     // Subpaths
754 ▶     ([TModel] extends [AbstractControl]
755 │       ? unknown
756 ▶       : // Array paths have no subpaths
757 ▶         [TModel] extends [ReadonlyArray<any>]
758 ▶         ? unknown
759 │         : // Object subfields
760 ▶           TModel extends Record<string, any>
761 ▶           ? {[K in keyof TModel]: MaybeSchemaPathTree<TModel[K], PathKind.Child>}
762 │           : // Primitive or other type - no subpaths
763 │             unknown);
764 │ 
765 │ /**
766 │  * Helper type for defining `FieldPath`. Given a type `TValue` that may include `undefined`, it
767 │  * extracts the `undefined` outside the `FieldPath` type.
768 │  *
769 │  * For example `MaybeFieldPath<{a: number} | undefined, PathKind.Child>` would be equivalent to
770 │  * `undefined | FieldTree<{a: number}, PathKind.child>`.
771 │  *
772 │  * @template TValue The type of the data which the field is wrapped around.
773 │  * @template TPathKind The kind of path (root field, child field, or item of an array)
774 │  *
775 │  * @see [Schemas and schema composability](guide/forms/signals/schemas)
776 │  *
777 │  * @publicApi 22.0
778 │  */
779 ▶ export type MaybeSchemaPathTree<TModel, TPathKind extends PathKind = PathKind.Root> =
780 ▶   (TModel & undefined) | SchemaPathTree<Exclude<TModel, undefined>, TPathKind>;
```

1. **750〜752 行目：自分自身の path**

   値が `AbstractControl` なら `CompatSchemaPath`（Unsupported）、そうでなければ `SchemaPath<TModel, Supported, TPathKind>`。746〜749 行目のコメントのとおり、`[TModel]` と角括弧で包んで、値の型が和（`number | string`）でも分配しない（`SchemaPath<number> | SchemaPath<string>` にしない）ようにしています。
2. **754〜758 行目：control と配列には子が無い**

   756 行目のコメントどおり、配列の path に子はありません。`p.items[0]` は型エラーで（8 節の P13）、要素に下りる道は 4 節の `applyEach` だけです。
3. **760〜761 行目：オブジェクトの子は Child**

   キーごとに `MaybeSchemaPathTree<TModel[K], PathKind.Child>`。親の種類が何であっても、子は必ず Child です。`applyEach` の要素（Item）の子の `item.t` も Child に戻ります。
4. **779〜780 行目：undefined を外に出す**

   値が `T | undefined` の子は「`undefined` か、`T` の path」になり、ルールの関数は `undefined` を受けないので `required(p.nick)` は型エラーです（P9）。値が無いかもしれない場所にルールを付けさせないための形です。

746〜752 行目の角括弧とコメントは 722292f215d（2025-11-14、「improve typing on min & max」、#65212）で、754・757 行目の子の側の角括弧は 83032e36059（2026-03-17、「support generic unions in signal form schemas」、Fixes #65535）で入りました。後者のメッセージは、まだ決まっていない型の引数（`T`）をモデルに使うと、分配する条件型が型エラーを起こしていた（#66596）と書いています。ただし、`T | null` の子に `required` を付ける形は 22.2.6 でも型エラーのままで、開いている #65705 と同じ文が出ます（8 節の G1）。780 行目の `(TModel & undefined)` は、`T` が決まらないと消えないためです。

## 4. applyEach：Item をつくる唯一の場所

📄 `angular/packages/forms/signals/src/api/structure.ts` L264–280 （▶ の行: 274–276, 278, 280）

```ts
264 │  * @param path The target path for an array field whose items the schema will be applied to.
265 │  * @param schema A schema for an element of the array, or function that binds logic to an
266 │  * element of the array.
267 │  * @template TValue The data type of the item field to apply the schema to.
268 │  *
269 │  * @see [Array items with applyEach](guide/forms/signals/schemas#array-items-with-applyeach)
270 │  *
271 │  * @category structure
272 │  * @publicApi 22.0
273 │  */
274 ▶ export function applyEach<TValue extends ReadonlyArray<any>>(
275 ▶   path: SchemaPath<TValue>,
276 ▶   schema: NoInfer<SchemaOrSchemaFn<TValue[number], PathKind.Item>>,
277 │ ): void;
278 ▶ export function applyEach<TValue extends Object>(
279 │   path: SchemaPath<TValue>,
280 ▶   schema: NoInfer<SchemaOrSchemaFn<ItemType<TValue>, PathKind.Child>>,
```

`packages/forms/signals/src` を `grep -n "PathKind.Item"` すると、型の宣言（`types.ts`）の外で `PathKind.Item` を書いているのは `structure.ts` の 276 行目と、この引用の下に続く実装の署名だけです。274〜277 行目の 1 つ目の重なり（overload）は値が配列のときで、要素の schema を `SchemaOrSchemaFn<TValue[number], PathKind.Item>` として受けます。だから `applyEach(p.items, (item) => …)` の `item` は Item の path で、そこに付けたルールの `ctx` だけが `index` を持ちます。これが「applyEach の中だけ index が読める」の答えです。

278〜280 行目の 2 つ目の重なりは、値が配列でないオブジェクトのときです。`applyEach(p.tags, (tag) => …)` の `tag` は 280 行目で `PathKind.Child` になり、`key` は読めて `index` は読めません（P5）。この重なりは c9058087ae8（2025-11-06、「support dynamic object logic」）が、`applyEach` をオブジェクトにも使えるようにしたときに足しました。どちらも実行時には同じ実装で、配列の path の子の `DYNAMIC` に schema を足すだけです（[forms-sf-schema](../forms/16-forms-sf-schema.md) の 5 節）。

> [!WARNING]
> **ハマりどころ**
>
> `apply(p.one, (one) => …)` と `applyWhen` の中の path は、子のフィールドに付けても Root です。`apply` の第 2 引数は `SchemaOrSchemaFn<TValue>`（`TPathKind` を省いた既定の Root）だからです（`structure.ts` の `apply`。引用は forms-sf-schema の 4 節）。型の上では `key` も読めませんが、実行時の `key()` は `"one"` を返します（8 節のデモ）。PathKind は「フィールドが木のどこにあるか」ではなく、「その schema 関数が、自分の path について何を知っているか」を表しています。

## 5. Schema・SchemaFn・LogicFn・Validator：種類をルールの関数に流す

📄 `angular/packages/forms/signals/src/api/types.ts` L818–854 （▶ の行: 825–826, 845, 852–853）

````ts
818 │  * @template TModel Data type.
819 │  *
820 │  * @see [Create reusable schemas with schema](guide/forms/signals/schemas#create-reusable-schemas-with-schema)
821 │  *
822 │  * @category types
823 │  * @publicApi 22.0
824 │  */
825 ▶ export type Schema<in TModel> = {
826 ▶   [ɵɵTYPE]: SchemaFn<TModel, PathKind.Root>;
827 │ };
828 │ 
829 │ /**
830 │  * A function that receives a {@link SchemaPathTree} and applies rules to fields.
831 │  *
832 │  * A `SchemaFn` can be passed directly to {@link form} or to the {@link schema} function to create a
833 │  * cached {@link Schema}.
834 │  *
835 │  * ```typescript
836 │  * const userFormSchema: SchemaFn<User> = (p) => {
837 │  *   required(p.name);
838 │  *   disabled(p.email, ({valueOf}) => valueOf(p.name) === '');
839 │  * };
840 │  *
841 │  * const f = form(userModel, userFormSchema, {injector});
842 │  * ```
843 │  *
844 │  * @template TModel Data type.
845 ▶  * @template TPathKind The kind of path this schema function can be bound to.
846 │  *
847 │  * @see [Schemas and schema composability](guide/forms/signals/schemas)
848 │  *
849 │  * @category types
850 │  * @publicApi 22.0
851 │  */
852 ▶ export type SchemaFn<TModel, TPathKind extends PathKind = PathKind.Root> = (
853 ▶   p: SchemaPathTree<TModel, TPathKind>,
854 │ ) => void;
````

852〜854 行目の `SchemaFn<TModel, TPathKind>` は「`SchemaPathTree<TModel, TPathKind>` を受けて何も返さない関数」です。`applyEach` に渡す関数はこの形で、`TPathKind` が Item になります。825〜827 行目の `Schema` は `schema()` が返すもの（実行時は `SchemaImpl`）の型で、型の印に `SchemaFn<TModel, PathKind.Root>` を持つだけで、`TPathKind` の引数がありません。そのため同じ `schema<T>(…)` を `apply` にも `applyEach` にも渡せます（P12）。825 行目の `in` は、`TModel` を「受け取る側」としてだけ使う、という変性（型の引数の向き）の注記です。`Schema<Order>` を `PizzaOrder` のフォームに渡せる（types.spec.ts の 81 行目の it）のはこの向きのためです。

📄 `angular/packages/forms/signals/src/api/types.ts` L856–883 （▶ の行: 867–868, 881–883）

```ts
856 │ /**
857 │  * A {@link Schema} or {@link SchemaFn}.
858 │  *
859 │  * @template TModel The type of data stored in the form that this schema function is attached to.
860 │  * @template TPathKind The kind of path this schema function can be bound to.
861 │  *
862 │  * @see [Schemas and schema composability](guide/forms/signals/schemas)
863 │  *
864 │  * @category types
865 │  * @publicApi 22.0
866 │  */
867 ▶ export type SchemaOrSchemaFn<TModel, TPathKind extends PathKind = PathKind.Root> =
868 ▶   Schema<TModel> | SchemaFn<TModel, TPathKind>;
869 │ 
870 │ /**
871 │  * A function that receives the `FieldContext` for the field the logic is bound to and returns
872 │  * a specific result type.
873 │  *
874 │  * @template TValue The data type for the field the logic is bound to.
875 │  * @template TReturn The type of the result returned by the logic function.
876 │  * @template TPathKind The kind of path the logic is applied to (root field, child field, or item of an array)
877 │  *
878 │  * @category types
879 │  * @publicApi 22.0
880 │  */
881 ▶ export type LogicFn<TValue, TReturn, TPathKind extends PathKind = PathKind.Root> = (
882 ▶   ctx: FieldContext<TValue, TPathKind>,
883 ▶ ) => TReturn;
```

867〜868 行目の `SchemaOrSchemaFn` は 2 つの和です。`Schema` の側は `TPathKind` を見ないので、種類の検査が効くのは関数を直接渡したときだけです。Item 用に書いた `SchemaFn<T, PathKind.Item>` を `apply` に渡すと、関数の引数の向きの比べ合いで `'root'` が `'item'` に入らず、型エラーになります（P7。tsc の文に `[ɵɵTYPE].pathKind[ɵɵTYPE]` が出ます）。

881〜883 行目の `LogicFn<TValue, TReturn, TPathKind>` が、すべてのルールの関数の元の型です。引数は `FieldContext<TValue, TPathKind>` の 1 つだけで、ここで path の種類が context の型に変わります。検証の 3 つの型は、この `TReturn` を決めたものです。`FieldValidator` と `TreeValidator` は[forms-sf-validation](../forms/17-forms-sf-validation.md)で引用しました（この引用のすぐ上にあります）。残りの 1 つが次の `Validator` です。

📄 `angular/packages/forms/signals/src/api/types.ts` L921–936 （▶ の行: 923–924, 932, 934）

```ts
921 │ /**
922 │  * A function that takes the `FieldContext` for the field being validated and returns a
923 ▶  * `ValidationResult` indicating errors for the field and its sub-fields. In a `Validator` all
924 ▶  * errors must explicitly define their target field.
925 │  *
926 │  * @template TValue The type of value stored in the field being validated
927 │  * @template TPathKind The kind of path being validated (root field, child field, or item of an array)
928 │  * @see [Signal Form Validation](/guide/forms/signals/validation)
929 │  * @category types
930 │  * @publicApi 22.0
931 │  */
932 ▶ export type Validator<TValue, TPathKind extends PathKind = PathKind.Root> = LogicFn<
933 │   TValue,
934 ▶   ValidationResult,
935 │   TPathKind
936 │ >;
```

934 行目の戻り値は `ValidationResult`（既定の型引数のまま。付け先の `fieldTree` を持つエラー）で、923〜924 行目のとおり「エラーはすべて付け先を明示する」検証の関数の型です。3 つの戻り値の型の違いは[第 3 回](03-sfty-results.md)で読みます。`packages/forms/signals` の src と compat を `grep -rn "Validator<"` で探すと（`FieldValidator` などを除く）、`Validator` を書いているのは 932 行目の定義だけで、どの関数の引数にも使われていない公開の型です。

📄 `angular/packages/forms/signals/src/api/rules/validation/validate.ts` L12–36 （▶ の行: 17, 26, 33–35）

```ts
12 │ import type {
13 │   FieldContext,
14 │   FieldValidator,
15 │   PathKind,
16 │   SchemaPath,
17 ▶   SchemaPathRules,
18 │ } from '../../types';
19 │ 
20 │ /**
21 │  * Adds logic to a field to determine if the field has validation errors.
22 │  *
23 │  * @param path The target path to add the validation logic to.
24 │  * @param logic A `Validator` that returns the current validation errors.
25 │  * @template TValue The type of value stored in the field the logic is bound to.
26 ▶  * @template TPathKind The kind of path the logic is bound to (a root path, child path, or item of an array)
27 │  *
28 │  * @see [Custom validation rules](guide/forms/signals/validation#using-validate)
29 │  *
30 │  * @category logic
31 │  * @publicApi 22.0
32 │  */
33 ▶ export function validate<TValue, TPathKind extends PathKind = PathKind.Root>(
34 ▶   path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
35 ▶   logic: NoInfer<FieldValidator<TValue, TPathKind>>,
36 │ ): void {
```

ルールの関数の側から見ると、種類は次のように流れます。33 行目の `TPathKind` は 34 行目の `path` の型から推論され、35 行目の `logic` の型 `FieldValidator<TValue, TPathKind>` に使われます。35 行目の `NoInfer` は「この引数からは推論しない」という印で、`TValue` と `TPathKind` を path だけから決めるためのものです。これが無いと、ルールの関数の引数に書いた型（P6 の `FieldContext<unknown, PathKind.Item>`）から逆に推論されてしまいます。34 行目の `SchemaPathRules.Supported` が、Unsupported の path（`CompatSchemaPath`）を締め出す行です（P10）。`required`・`disabled`・`debounce`・`validateHttp` など、ルールを付ける関数はどれも同じ形の署名です。本体は `ctx` を `FieldContext<TValue, TPathKind>` に `as` で読み替えて渡すだけです（この引用の続きで、[signal-forms](../signals/17-signal-forms.md) で引用しました）。

## 6. FieldContext：種類で 3 つの形から選ぶ

📄 `angular/packages/forms/signals/src/api/types.ts` L947–972 （▶ の行: 947, 950–954, 963, 965, 967, 969, 972）

```ts
947 ▶ export type FieldContext<
948 │   TValue,
949 │   TPathKind extends PathKind = PathKind.Root,
950 ▶ > = TPathKind extends PathKind.Item
951 ▶   ? ItemFieldContext<TValue>
952 ▶   : TPathKind extends PathKind.Child
953 ▶     ? ChildFieldContext<TValue>
954 ▶     : RootFieldContext<TValue>;
955 │ 
956 │ /**
957 │  * The base field context that is available for all fields.
958 │  *
959 │  * @see [Understanding the field context](guide/forms/signals/cross-field-logic#understanding-the-field-context)
960 │  *
961 │  * @publicApi 22.0
962 │  */
963 ▶ export interface RootFieldContext<TValue> {
964 │   /** A signal containing the value of the current field. */
965 ▶   readonly value: Signal<TValue>;
966 │   /** The state of the current field. */
967 ▶   readonly state: ReadonlyFieldState<TValue>;
968 │   /** The current field. */
969 ▶   readonly fieldTree: ReadonlyFieldTree<TValue>;
970 │ 
971 │   /** Gets the value of the field represented by the given path. */
972 ▶   valueOf<PValue>(p: SchemaPath<PValue, SchemaPathRules>): PValue;
```

950〜954 行目は条件型の入れ子です。`TPathKind` が Item に代入できれば `ItemFieldContext`、Child に代入できれば `ChildFieldContext`、どちらでもなければ `RootFieldContext`。1 節の包含のとおり、Root は Item にも Child にも代入できないので 954 行目に落ち、Child は 952 行目で止まります。

963〜994 行目の `RootFieldContext` は全部 readonly の読み口です。965 行目の `value` は `Signal`（書けない）、967 行目の `state` は `ReadonlyFieldState`、969 行目の `fieldTree` は `ReadonlyFieldTree` です。ルールの中から値を書き換えられないのはこの型のためで、967・969 行目は a1a6c5282ed（2026-03-10、「restrict reactive logic to a readonly API」）が読み取り専用の型に替えました（`ReadonlyFieldState` は[第 2 回](02-sfty-state.md)）。965 行目の `Signal` は最初のコミットからです。972 行目の `valueOf` は `SchemaPath<PValue, SchemaPathRules>`、つまり Supported と Unsupported の両方を受けます。ルールは付けられない `FormControl` の path でも、値は読めます（P11）。

📄 `angular/packages/forms/signals/src/api/types.ts` L974–994 （▶ の行: 974, 980, 982, 984–985, 987, 989, 991, 993）

```ts
974 ▶   // Note: These methods use a tautological conditional type (`[P] extends [any] ? ... : never`).
975 │   // This is required because the `FieldNodeContext` implementation returns a deferred conditional
976 │   // type from `FieldTreeBase` (e.g. `[P] extends [AbstractControl] ? ...`).
977 │   // TypeScript is strictly invariant when matching generic method signatures and will throw an
978 │   // assignability error if the interface signature is fully resolved while the implementation
979 │   // signature is a deferred conditional. This tautological wrapper mimics the deferred
980 ▶   // structure so that TypeScript accepts the assignment gracefully.
981 │   /** Gets the state of the field represented by the given path. */
982 ▶   stateOf<PControl extends AbstractControl>(
983 │     p: CompatSchemaPath<PControl>,
984 ▶   ): [PControl] extends [any] ? ReadonlyCompatFieldState<PControl> : never;
985 ▶   stateOf<PValue>(
986 │     p: SchemaPath<PValue, SchemaPathRules>,
987 ▶   ): [PValue] extends [any] ? ReadonlyFieldState<PValue> : never;
988 │   /** Gets the field represented by the given path. */
989 ▶   fieldTreeOf<PModel>(
990 │     p: SchemaPathTree<PModel>,
991 ▶   ): [PModel] extends [any] ? ReadonlyFieldTree<PModel> : never;
992 │   /** The list of keys that lead from the root field to the current field. */
993 ▶   readonly pathKeys: Signal<readonly string[]>;
994 │ }
```

`stateOf` は 2 つの重なりで、`CompatSchemaPath` なら control を持った状態の型（984 行目）、そうでなければ `ReadonlyFieldState`（987 行目）を返します。戻り値の `[PControl] extends [any] ? … : never` は常に真になる条件型で、974〜980 行目のコメントのとおり、実装の `FieldNodeContext` の署名に形を合わせるためのものです（83032e36059 で入りました）。993 行目の `pathKeys` は 2fd8dc9195b（2025-11-06、「expose pathKeys as part of the API」）で公開されました。Root にあるので、どのルールからも読めます。

📄 `angular/packages/forms/signals/src/api/types.ts` L996–1022 （▶ の行: 1002, 1004, 1012, 1014, 1022）

```ts
 996 │ /**
 997 │  * Field context that is available for all fields that are a child of another field.
 998 │  *
 999 │  * @category structure
1000 │  * @publicApi 22.0
1001 │  */
1002 ▶ export interface ChildFieldContext<TValue> extends RootFieldContext<TValue> {
1003 │   /** The key of the current field in its parent field. */
1004 ▶   readonly key: Signal<string>;
1005 │ }
1006 │ 
1007 │ /**
1008 │  * Field context that is available for all fields that are an item in an array field.
1009 │  *
1010 │  * @publicApi 22.0
1011 │  */
1012 ▶ export interface ItemFieldContext<TValue> extends ChildFieldContext<TValue> {
1013 │   /** The index of the current field in its parent field. */
1014 ▶   readonly index: Signal<number>;
1015 │ }
1016 │ 
1017 │ /**
1018 │  * Gets the item type of an object that is possibly an array.
1019 │  *
1020 │  * @publicApi 22.0
1021 │  */
1022 ▶ export type ItemType<T extends Object> = T extends ReadonlyArray<any> ? T[number] : T[keyof T];
```

1002 行目の `ChildFieldContext` が足すのは 1004 行目の `key`、1012 行目の `ItemFieldContext` が足すのは 1014 行目の `index` だけです。`key` は配列の要素でも `Signal<string>`（`"0"`）で、数がほしいときは `index` を読みます。1022 行目の `ItemType` は、`applyEach` の 2 つ目の重なり（オブジェクト）で要素の型を出すための型です。配列なら `T[number]`、オブジェクトなら `T[keyof T]`（値の型の和）です。

## 7. 実装は 1 つ：FieldNodeContext と AbstractLogic

📄 `angular/packages/forms/signals/src/field/context.ts` L18–37 （▶ の行: 21, 37）

```ts
18 │ import {
19 │   CompatSchemaPath,
20 │   CompatFieldState,
21 ▶   FieldContext,
22 │   ReadonlyCompatFieldState,
23 │   ReadonlyFieldState,
24 │   ReadonlyFieldTree,
25 │   SchemaPath,
26 │   SchemaPathRules,
27 │   SchemaPathTree,
28 │ } from '../api/types';
29 │ import {FieldPathNode} from '../schema/path_node';
30 │ import {isArray} from '../util/type_guards';
31 │ import type {FieldNode} from './node';
32 │ import {getBoundPathDepth} from './resolution';
33 │ 
34 │ /**
35 │  * `FieldContext` implementation, backed by a `FieldNode`.
36 │  */
37 ▶ export class FieldNodeContext implements FieldContext<unknown> {
```

37 行目、実装のクラスは `FieldContext<unknown>`（型引数を省いたので Root、つまり `RootFieldContext<unknown>`）を implements するだけです。それでもこのクラスは `key` の getter と `index` の computed を持っていて（[sft-proxy-context](../sft/03-sft-proxy-context.md) の 5 節の表）、根の context にも配列でない子の context にもあります。型の 3 つの形は、この 1 つのクラスの「見せ方」の違いです。

📄 `angular/packages/forms/signals/src/schema/logic.ts` L71–98 （▶ の行: 76, 78, 92）

```ts
71 │ /**
72 │  * Base class for all logic. It is responsible for combining the results from multiple individual
73 │  * logic functions registered in the schema, and using them to derive the value for some associated
74 │  * piece of field state.
75 │  */
76 ▶ export abstract class AbstractLogic<TReturn, TValue = TReturn> {
77 │   /** The set of logic functions that contribute to the value of the associated state. */
78 ▶   protected readonly fns: Array<LogicFn<any, TValue | typeof IGNORED>> = [];
79 │ 
80 │   constructor(
81 │     /**
82 │      * A list of predicates that conditionally enable all logic in this logic instance.
83 │      * The logic is only enabled when *all* of the predicates evaluate to true.
84 │      */
85 │     private predicates: ReadonlyArray<BoundPredicate>,
86 │   ) {}
87 │ 
88 │   /**
89 │    * Computes the value of the associated field state based on the logic functions and predicates
90 │    * registered with this logic instance.
91 │    */
92 ▶   abstract compute(arg: FieldContext<any>): TReturn;
93 │ 
94 │   /**
95 │    * The default value that the associated field state should assume if there are no logic functions
96 │    * registered by the schema (or if the logic is disabled by a predicate).
97 │    */
98 │   abstract get defaultValue(): TReturn;
```

ルールの関数を持つ側も種類を区別しません。78 行目の `fns` は `LogicFn<any, …>`（種類を省いたので Root）の配列で、92 行目の `compute` は `FieldContext<any>` を受けます。フィールドの `FieldNode` が持つ 1 つの context が、そのフィールドのすべてのルールに渡ります。種類が意味を持つのは、ルールを登録する呼び出し（5 節の 33〜35 行目）を型検査するときだけです。

## 8. DEMO：型の種類と、実行時の context

> **🧪 DEMO 1 — 6 か所のルールが受け取った context を読む**
>
> サイトの依存の `@angular/forms/signals`（22.2.6）で、ページの上に `form(signal({name: 'Ann', one: {t: 'o'}, items: [{t: 'a'}, {t: 'b'}], tags: {x: 1, y: 2}}), schema)` を作っています。スキーマは表の 1 列目の 6 か所に `validate` を付け、受け取った context を Map に置くだけです。「context を読む」で各フィールドの `errors()` を読んでルールを走らせ、置いた context の `key()`・`index()`・`pathKeys()` を try/catch で読みます。型で読めないメンバーも、実行時は同じクラスなので `ItemFieldContext` と見なして読んでいます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sfty-path)

読んだ結果のうち、行で説明できるものです。

| 見えるもの | 理由（行） |
| --- | --- |
| どの行も `'key' in ctx` と `'index' in ctx` が `true`、「根の ctx と同じクラス」も `true` | 実行時は 7 節の 1 つのクラス。型の 3 つの形は実行時に存在しない |
| 根の行の `key()`・`index()` が `NG01905` | 根には親が無い（keyInParent が投げる）。型では P1・P3 の型エラーで止まる場所 |
| `p.name`・`item.t`・`tags` の行の `index()` が `NG01906` | 親が配列でない。型では Child（761 行目・280 行目）なので P2・P5 で止まる |
| `apply(p.one, …)` の行の `key()` が `"one"` | 型は Root（4 節の注意）でも、フィールドは根の子 |
| `items` の行だけ `index()` が数 | 型でも Item（276 行目）。`key()` は文字列の `"0"` |
| 「items の先頭に 1 つ足す」で、元の 2 行の `index()` が 1 と 2 になり、新しい行が 0 で増える | context はフィールドごとに 1 つで、位置は読むたびに今の親から決まる（[sft-array-identity](../sft/02-sft-array-identity.md)） |
| `Object.keys(根の ctx)` に `index` があり `key` が無い | `index` はクラスの field（インスタンスの性質）、`key` はプロトタイプの getter |

記録 — 手元の tsc で型エラーにした 13 の形

同じことを型の側で確かめた記録です。`<work>/sfty-demo/b/tsc/path.ts` に 13 の形を書き、サイトの `node_modules` の TypeScript 6.0.3 と `@angular/forms` 22.2.6 の `.d.ts` で `npx tsc --noEmit --strict --moduleResolution bundler --skipLibCheck path.ts` を走らせました（`M` はモデルの型の略。長い文は「…」で縮めています）。

|   | 書いたもの | 行:列 | tsc の結果 | 理由 |
| --- | --- | --- | --- | --- |
| P1 | `validate(p, ({index}) => …)` | 13:17 | TS2339: Property 'index' does not exist on type 'RootFieldContext&lt;M&gt;'. | 根の path は PathKind.Root。FieldContext の条件型（950〜954 行目）が RootFieldContext を選ぶ |
| P2 | `validate(p.name, ({index}) => …)` | 18:22 | TS2339: Property 'index' does not exist on type 'ChildFieldContext&lt;string&gt;'. | 子の path は 761 行目で PathKind.Child。ChildFieldContext には key だけ |
| P3 | `validate(p, ({key}) => …)` | 23:17 | TS2339: Property 'key' does not exist on type 'RootFieldContext&lt;M&gt;'. | key は ChildFieldContext（1004 行目）から |
| P4 | `applyEach(p.items, item => validate(item, ({index, key}) => …))` | ― | エラーなし | structure.ts 276 行目が要素の schema に PathKind.Item を渡す |
| P5 | `applyEach(p.tags, tag => validate(tag, ({index}) => …))` | 37:21 | TS2339: Property 'index' does not exist on type 'ChildFieldContext&lt;number&gt;'. | オブジェクトへの applyEach は 280 行目の重なりで PathKind.Child。同じ形の ({key}) は 36 行目で通る |
| P6 | `validate(p, recordIndex)（引数を FieldContext<unknown, PathKind.Item> と書いた関数）` | 44:15 | TS2345: Argument of type '({ index }: FieldContext&lt;unknown, PathKind.Item&gt;) =&gt; undefined' is not assignable to parameter of type 'FieldValidator&lt;M, Root&gt;'. … Type 'RootFieldContext&lt;M&gt;' is missing the following properties from type 'ItemFieldContext&lt;unknown&gt;': index, key | 引数の型の向き。Root の ctx しか来ない場所に Item の ctx を求める関数は渡せない（field\_context.spec.ts 117 行目の @ts-expect-error と同じ形） |
| P7 | `apply(p.one, itemSchema)（itemSchema: SchemaFn<{t: string}, PathKind.Item>）` | 52:16 | TS2345: … Type 'SchemaPathTree&lt;{ t: string; }, Root&gt;' is not assignable to type 'SchemaPath&lt;{ t: string; }, 1, Item&gt;'. The types of '\[ɵɵTYPE\].pathKind\[ɵɵTYPE\]' are incompatible between these types. Type '"item" \| "root" \| "child"' is not assignable to type '"item"'. Type '"root"' is not assignable to type '"item"'. | 97 行目と 111 行目の ɵɵTYPE の文字列の和がそのまま比べられている。同じ itemSchema を applyEach（53 行目）に渡すのは通る |
| P8 | `applyEach(p.items, rootSchema)（rootSchema: SchemaFn<{t: string}>）` | ― | エラーなし | Item の path は Root の path に代入できる（狭い和 → 広い和） |
| P9 | `required(p.nick)（nick: string \| undefined）` | 66:12 | TS2345: Argument of type 'MaybeSchemaPathTree&lt;string \| undefined, Child&gt;' is not assignable to parameter of type 'SchemaPath&lt;string, 1, Child&gt;'. Type 'undefined' is not assignable to type 'SchemaPath&lt;string, 1, Child&gt;'. | 779〜780 行目。値の undefined が path の型の外に出る |
| P10 | `compatForm(…) の中で required(p.ctrl) と debounce(p.ctrl, 100)（ctrl は FormControl）` | 73:12・74:12 | TS2345: Argument of type 'SchemaPathTree&lt;FormControl&lt;string&gt;, Child&gt;' is not assignable to parameter of type 'SchemaPath&lt;unknown, 1, Root&gt;'. The types of '\[ɵɵTYPE\].supportsRules' are incompatible between these types. Type '2' is not assignable to type '1'. | 725 行目で CompatSchemaPath は Unsupported（683 行目の 2）、ルールの関数は Supported（678 行目の 1）だけを受ける |
| P11 | `validate(p.plain, ({valueOf}) => valueOf(p.ctrl) …)` | ― | エラーなし | valueOf は SchemaPath&lt;PValue, SchemaPathRules&gt;（972 行目）で、Supported と Unsupported の両方を受ける |
| P12 | `const s = schema<{t: string}>(…); applyEach(p.items, s); apply(p.one, s)` | ― | エラーなし | Schema&lt;T&gt;（825〜827 行目）は PathKind を持たないので、どちらの SchemaOrSchemaFn にも入る |
| P13 | `required(p.items[0].t)` | 91:12 | TS7053: Element implicitly has an 'any' type because expression of type '0' can't be used to index type 'SchemaPath&lt;{ t: string; }\[\], 1, Child&gt;'. | 757〜758 行目。配列の path には子が無い。要素に下りる道は applyEach だけ |
| G1 | `function g1<T>(m: WritableSignal<{directValue: T \| null}>) { form(m, p => required(p.directValue)) }` | generic.ts 13:14 | TS2345: Argument of type 'CompatSchemaPath&lt;AbstractControl&lt;any, any, any&gt; & Exclude&lt;T, undefined&gt;, Child&gt; \| SchemaPath&lt;Exclude&lt;T, undefined&gt; \| null, 1, Child&gt; \| undefined' is not assignable to parameter of type 'SchemaPath&lt;Exclude&lt;T, undefined&gt; \| null, 1, Child&gt;'. | 開いている #65705 と同じ文。T が決まらないと 780 行目の (TModel & undefined) が消えず、750 行目の分かれ道も両方残る。T を string に決めた g2 は通る |

P10 を型を無視して実行すると（`<work>/sfty-demo/b/node/rec-compat.mjs`、Node 24 と 22.2.6）、`required(p.ctrl)` も `validate(p.ctrl, …)` も例外を出さずに登録され、`f.ctrl().errors()` は `[]`、`validate` の関数は 1 回も呼ばれませんでした。control のフィールドの検証は control の側の状態を読むので（[forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md)）、付けたルールは黙って使われません。`Unsupported` は、その「黙って効かない」を型エラーにして先に知らせる印です。test/node/compat/compat.spec.ts の 498 行目の it も、型を外して実行時に同じ呼び出しをしています（テストと直し方）。

## 9. この形になるまで

| コミット | 日付 | この章の行に入ったもの |
| --- | --- | --- |
| b8314bd3409 | 2025-08-28 | 最初のコミット（#63408）。PathKind の 3 つの interface（81〜113 行目）、SchemaPathTree の Child、FieldContext の条件型と 3 つの context |
| 60447945bc5 | 2025-11-06 | compatForm を足したとき。SchemaPathRules（672〜684 行目）、SchemaPath の 2 つ目の型引数、CompatSchemaPath |
| c9058087ae8 | 2025-11-06 | applyEach をオブジェクトにも。structure.ts 278〜281 行目の Child の重なりと ItemType |
| 2fd8dc9195b | 2025-11-06 | pathKeys を公開（993 行目） |
| a1a6c5282ed | 2026-03-10 | ルールの中の読み口を readonly に（967・969 行目の ReadonlyFieldState・ReadonlyFieldTree） |
| 722292f215d | 2025-11-14 | SchemaPathTree の自分の path の側を `[TModel]` の角括弧に（746〜752 行目）。#65212 |
| 83032e36059 | 2026-03-17 | ジェネリックの和の扱い（754・757 行目の角括弧、982〜991 行目の常に真の条件型）。Fixes #65535 |
| d2f5ec92de9 | origin/main | valueOf・stateOf・fieldTreeOf に `this: void`（型だけ。サイトの 22.2.6 の `.d.ts` にはもう入っている） |

`git diff 8576f161ae4 origin/main -- packages/forms/signals/src/api/types.ts` の差は、この `this: void` と、`SchemaFn` の doc コメントの例を `disabled(p.email, {when: …})` に直した 1 行だけです。PathKind・SchemaPathRules・SchemaPath・FieldContext の型の形は変わっていません。

## 10. 呼び出しの連なり：applyEach の中の validate の ctx が ItemFieldContext になるまで（型検査）

- 👤 `form(m, (p) => applyEach(p.items, (item) => validate(item, ({index}) => …)))` — 利用者 — *p は SchemaPathTree&lt;M, Root&gt;*
  - `p.items` — types.ts 761 — *MaybeSchemaPathTree&lt;Item\[\], Child&gt; → 757〜758 で子なし*
  - `applyEach<TValue extends ReadonlyArray>` — structure.ts 274〜277 — *schema は SchemaOrSchemaFn&lt;TValue\[number\], PathKind.Item&gt;*
    - `SchemaFn<Item, PathKind.Item>` — types.ts 852〜854 — *item は SchemaPathTree&lt;Item, Item&gt;*
      - `validate<TValue, TPathKind>(path, logic)` — validate.ts 33〜35 — *path から TPathKind = Item を推論。logic は NoInfer*
        - `FieldValidator<TValue, Item>` → `LogicFn` — types.ts 881〜883 — *ctx: FieldContext&lt;TValue, Item&gt;*
          - `FieldContext<TValue, Item>` — types.ts 950〜951 — *ItemFieldContext。index は 1014 行目*
- `（実行時）FieldNodeContext` — context.ts 37 — *型に関係なく同じクラス。index() は配列の親でだけ数を返す*

## テストと直し方

📄 `angular/packages/forms/signals/test/node/field_context.spec.ts` L96–133 （▶ の行: 98, 116–119, 121–122, 128–131）

```ts
 96 │   it('index', () => {
 97 │     const indices: (string | number)[] = [];
 98 ▶     const recordIndex = ({index}: FieldContext<unknown, PathKind.Item>) => {
 99 │       try {
100 │         indices.push(index());
101 │       } catch (e) {
102 │         indices.push((e as Error).message);
103 │       }
104 │       return undefined;
105 │     };
106 │     const pets = signal({
107 │       cats: [
108 │         {name: 'pirojok-the-cat', age: 5},
109 │         {name: 'mielo', age: 10},
110 │       ],
111 │       owner: 'joe',
112 │     });
113 │     const f = form(
114 │       pets,
115 │       (p) => {
116 ▶         // @ts-expect-error
117 ▶         validate(p, recordIndex);
118 ▶         applyEach(p.cats, (cat) => {
119 ▶           validate(cat, recordIndex);
120 │         });
121 ▶         // @ts-expect-error
122 ▶         validate(p.owner, recordIndex);
123 │       },
124 │       {injector: TestBed.inject(Injector)},
125 │     );
126 │     f().valid();
127 │     expect(indices).toEqual([
128 ▶       jasmine.stringContaining('NG01905'), // SIGNAL_FORMS_ROOT_FIELD_NO_PARENT
129 ▶       0,
130 ▶       1,
131 ▶       jasmine.stringContaining('NG01906'), // SIGNAL_FORMS_PARENT_NOT_ARRAY
132 │     ]);
133 │   });
```

この 1 本の it が、型と実行時の両方を固めています。98 行目の関数は引数を `FieldContext<unknown, PathKind.Item>` と書いていて、116〜117 行目（根）と 121〜122 行目（配列でない子）は `@ts-expect-error`（次の行が型エラーであることを求める注記）付きで渡します。その上で実行して、128〜131 行目で根は `NG01905`、要素は 0 と 1、`owner` は `NG01906` を確かめます。同じファイルの 67 行目の it が `key` を同じ形で固めています。

📄 `angular/packages/forms/signals/test/node/compat/compat.spec.ts` L498–518 （▶ の行: 498, 507–510）

```ts
498 ▶   it('disallows passing a path with a FormControl on the type level', () => {
499 │     const control = new FormControl(5, {nonNullable: true, validators: [Validators.min(3)]});
500 │     const cat = signal({
501 │       name: 'pirojok-the-cat',
502 │       age: control,
503 │     });
504 │     compatForm(
505 │       cat,
506 │       (path) => {
507 ▶         // @ts-expect-error
508 ▶         required(path.age);
509 ▶         // @ts-expect-error
510 ▶         validate(path.age, () => {
511 │           return undefined;
512 │         });
513 │       },
514 │       {
515 │         injector: TestBed.inject(Injector),
516 │       },
517 │     );
518 │   });
```

Unsupported を固めているのはこの it です。507・509 行目の `@ts-expect-error` が、`FormControl` の path への `required` と `validate` を型エラーと決めています。

手元で走らせたコマンドと結果です（2026-11-19、8576f161ae4）。

📄 `走らせたコマンドと結果`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all
539 specs, 0 failures
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=^Field Context "
Ran 9 of 539 specs / 9 specs, 0 failures
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=^path "
Ran 4 of 539 specs / 4 specs, 0 failures      # path.spec.ts（sub-schema の中で外の path を使うと投げる）
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=Forms compat disallows passing a path"
Ran 1 of 539 specs / 1 spec, 0 failures
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=^types "
Ran 0 of 539 specs / 0 specs, 0 failures      # types.spec.ts は関数の中の describe で、実行時には登録されない（第 6 回）
```

`@ts-expect-error` の検査は、`node/BUILD.bazel` の `ng_project`（spec を TypeScript としてコンパイルする手順）で行われます。注記の次の行が型エラーにならないと、TypeScript が `TS2578: Unused '@ts-expect-error' directive` を出してコンパイルが失敗し、テストは 1 本も走りません。作業木（`git -C ~/angular-research/angular-fix worktree add <work>/sfty-wt-b 8576f161ae4`、終えてから `worktree remove --force` で消しました）で 1 か所ずつ型を変えた結果です。

|   | 変えたところ | node:test の結果 |
| --- | --- | --- |
| M1 | `ChildFieldContext` に `readonly index: Signal<number>` を足す | FAILED TO BUILD。`field_context.spec.ts:121:9 - error TS2578` |
| M2 | 683 行目の `Unsupported` を `1` に | FAILED TO BUILD。`compat/compat.spec.ts:507:9` と `509:9` の TS2578 |
| M3 | 780 行目から `(TModel & undefined) \|` を消す | FAILED TO BUILD。`types.spec.ts:97:9` の TS2578（99 行目の `c?: number` は省略可能の印で `undefined` が残るので、まだ型エラー） |
| M4 | 111 行目の Item の `[ɵɵTYPE]` を `'child' \| 'item'` に | FAILED TO BUILD。`field_context.spec.ts:121:9` の TS2578（Child が Item に代入できるようになり、950 行目で Child も ItemFieldContext になる） |
| M5 | structure.ts 276 行目の `PathKind.Item` を `PathKind.Child` に | FAILED TO BUILD。`field_context.spec.ts:119:25 - error TS2345`（要素の path が Child になり、Item の関数を渡せない） |

型を変える修正なら、`packages/forms/signals/src/api/types.ts` の該当する型と、`api/structure.ts` の重なりを直し、足す先は `test/node/field_context.spec.ts`（context の形）か `test/node/types.spec.ts`（path とスキーマの形）です。型のテストは `@ts-expect-error` で「通らないこと」を、注記なしの行で「通ること」を書きます。公開の型を変えると `goldens/public-api/forms/signals/index.api.md` も変わるので、`pnpm bazel run //packages/forms:forms_api.accept` で更新します（[contrib-public-api](../contrib/08-contrib-public-api.md)）。#67241（開いている。「applyEach の中で `item.t` に付けたルールからも index を読みたい」）は、3 節の 761 行目で子が必ず Child に戻ることと直接つながっています。

## 聞かれそうな質問

**Q. applyEach の中でだけ ctx.index が読めるのはなぜですか？**

`PathKind.Item` の path を作るのが `structure.ts` の 276 行目だけだからです。要素の schema は `SchemaOrSchemaFn<TValue[number], PathKind.Item>` で、そこで `validate` を呼ぶと 33〜35 行目で `TPathKind` が Item に決まり、`FieldContext` の 950〜951 行目が `ItemFieldContext`（1014 行目に index）を選びます。`p.items[0]` のような添字の path は、配列の path に子が無い（757〜758 行目）ので書けません。

**Q. 型を無視して根のルールで ctx.index() を呼ぶとどうなりますか？**

`NG01905` を投げます。実行時の context はいつも同じ `FieldNodeContext`（context.ts 37 行目）で、index は「key を読み、親が配列か確かめる」computed なので、根では key の段階で投げます。配列でない子では `NG01906` です（field\_context.spec.ts 128〜131 行目、8 節のデモ）。

**Q. SchemaPathRules の Supported と Unsupported が 1 と 2 なのはなぜですか？**

互いに代入できない 2 つの型であればよく、値に意味は無いからです（678・683 行目）。`ɵɵTYPE` と同じく実行時には存在しません。ルールの関数は 34 行目のように `SchemaPathRules.Supported` だけを受け、`valueOf` は 972 行目で両方を受けます。

**Q. apply(p.address, s) の中の path では key が読めないのはなぜですか？**

`apply` の第 2 引数が `SchemaOrSchemaFn<TValue>` で、種類の既定値の Root だからです。sub-schema は「どこに適用されるか」を知らずに書ける関数なので、Root として型検査されます。実行時は子のフィールドなので、`key()` は `"address"` を返します。

**Q. schema() で作った Schema を applyEach に渡しても型エラーにならないのはなぜですか？**

`Schema<TModel>`（825〜827 行目）は種類の型引数を持たず、`SchemaOrSchemaFn` の和（867〜868 行目）の片方としてどの種類の場所にも入るからです。中の関数は Root として書かれているので、中で index は読めません。種類の検査が効くのは、関数を直接 `SchemaFn<T, PathKind.Item>` として渡したときです（P7・P12）。

**Q. 型の spec（@ts-expect-error）は、どうやって「落ちる」のですか？**

spec のファイルは `ng_project` でコンパイルされ、注記の次の行が型エラーにならないと TS2578 でコンパイルが失敗します。jasmine は 1 本も走らず、ターゲットは FAILED TO BUILD になります（作業木の M1〜M5）。

## 読み終えて

- PathKind と SchemaPathRules は `declare const ɵɵTYPE` のキーにしまった型だけの印で、実行時には存在しない。PathKind の包含は文字列の和の代入可能性そのもの（93〜95 行目）。
- 子に下りると必ず Child（761 行目）、Item を作るのは配列への `applyEach`（structure.ts 276 行目）だけ。`apply` の中は Root。
- ルールの関数は path から `TPathKind` を推論し、`NoInfer` でルールの関数の側からの推論を止め、`FieldContext` の条件型（950〜954 行目）で context の形を選ぶ。
- 実装は 1 つの `FieldNodeContext`。型が隠した `key`・`index` を読むと NG01905・NG01906 になる。
- 型の約束は field\_context.spec.ts・compat.spec.ts・types.spec.ts の `@ts-expect-error` が、コンパイルの失敗（TS2578）として固めている。

---

← 前: [検証の結果と binding の型：ValidationResult・DisabledReason・FormFieldBinding・CompatFieldState](03-sfty-results.md)  
次: [validateHttp と debounce：型の外にある、時間と通信の約束](05-sfty-http-debounce.md) →
