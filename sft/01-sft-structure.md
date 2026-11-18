[目次](../README.md) › [Signal Forms のフィールドの木：子を作り、配列を追い、古い木と橋をかける](README.md) › 第 1 回 / 全 5 回

# 子の作り方：FieldNodeStructure が値から子を作る

> field/structure.ts の FieldNodeStructure が、モデルの値のキーを見て子の FieldNode を作る手順。children と materializedChildren の違い、getChild と ensureChildrenMap が子を段ごとに必要になったときだけ作る仕組み（98c5afdb021）、computeChildrenMap が前の子を使い回す条件、Root と Child の構造の違い。掃除の effect（manager.ts）が children() でたどるため、最初の変更検知で全部の子が作られてしまうこと（#70627）も本物で確かめる。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sft-structure)

---

`form(model)` が返す `FieldTree` の裏には、値の形をなぞった `FieldNode` の木があります。この章では、その木の「骨組み」を受け持つ `FieldNodeStructure` が、**モデルの値のキーを見て子の `FieldNode` をいつ作り、値が変わったときにどの子を使い回すか**を 1 行ずつ追います。子を「読まれたときだけ作る」ようにした 98c5afdb021 の差分と、その遅延が掃除の effect の 1 回目で崩れていること（#70627）も、本物を動かした記録で確かめます。

読む対象は `packages/forms/signals/src/field/structure.ts`（このシリーズの中心）、`field/node.ts` の `createStructure`、`field/field_adapter.ts`、`field/manager.ts`、spec は `test/node/api/structure.spec.ts` と `test/node/field_node.spec.ts` です。`FieldNode` の部品の全体と、子の `value` が親の signal から作られる `deepSignal` は [signal-forms](../signals/17-signal-forms.md) の 3〜4 節で、子を作るときに schema のロジックの木から子のロジックを取る `newChild` は [forms-sf-schema](../forms/16-forms-sf-schema.md) の 8 節で読みました。ここでは繰り返しません。

1. **1. 子の作り方**（この章）
2. [2. 配列の追跡と孤児](02-sft-array-identity.md)
3. [3. proxy と context](03-sft-proxy-context.md)
4. [4. SignalFormControl と extract](04-sft-signal-form-control.md)
5. [5. spec と issue](05-sft-tests-issues.md)

## 1. FieldNodeStructure が持つもの

📄 `angular/packages/forms/signals/src/field/structure.ts` L46–82 （▶ の行: 47, 54, 56, 59, 65, 68, 71, 74, 77, 79–80, 82）

```ts
46 │ /** Structural component of a `FieldNode` which tracks its path, parent, and children. */
47 ▶ export abstract class FieldNodeStructure {
48 │   /**
49 │    * Computed map of child fields, based on the current value of this field.
50 │    *
51 │    * This structure reacts to `this.value` and produces a new `ChildrenData` when the
52 │    * value changes structurally (fields added/removed/moved).
53 │    */
54 ▶   protected abstract readonly childrenMap: Signal<ChildrenData | undefined>;
55 │ 
56 ▶   abstract readonly isOrphaned: Signal<boolean>;
57 │ 
58 │   /** The field's value. */
59 ▶   abstract readonly value: WritableSignal<unknown>;
60 │ 
61 │   /**
62 │    * The key of this field in its parent field.
63 │    * Attempting to read this for the root field will result in an error being thrown.
64 │    */
65 ▶   abstract readonly keyInParent: Signal<string>;
66 │ 
67 │   /** The field manager responsible for managing this field. */
68 ▶   abstract readonly fieldManager: FormFieldManager;
69 │ 
70 │   /** The root field that this field descends from. */
71 ▶   abstract readonly root: FieldNode;
72 │ 
73 │   /** The list of property keys to follow to get from the `root` to this field. */
74 ▶   abstract readonly pathKeys: Signal<readonly string[]>;
75 │ 
76 │   /** The parent field of this field. */
77 ▶   abstract readonly parent: FieldNode | undefined;
78 │ 
79 ▶   readonly logic: LogicNode;
80 ▶   readonly node: FieldNode;
81 │ 
82 ▶   readonly createChildNode: ChildNodeCtor;
```

47 行目の `FieldNodeStructure` は抽象クラス（そのままでは `new` できず、継承して使うクラス）です。1 つの `FieldNode` に 1 つずつあり、木の中の位置と子の一覧を受け持ちます。検証や touched のような「状態」は持ちません（それは `FieldNode` の別の部品です）。欄を順に見ます。

| 行 | 欄 | 中身 |
| --- | --- | --- |
| 54 | `childrenMap` | 子の表。値が変わると作り直される signal。**子がまだ作られていなければ `undefined`**（3〜5 節） |
| 56 | `isOrphaned` | 親の子の表から外れた（孤児になった）か。[次の章](02-sft-array-identity.md)で読みます |
| 59 | `value` | このフィールドの値。根なら利用者の model、子なら親を覗く `deepSignal` |
| 65 | `keyInParent` | 親の中でのキー。根で読むと投げる（8 節） |
| 68・71・77 | `fieldManager`・`root`・`parent` | form 全体の管理役・根のノード・親のノード |
| 74 | `pathKeys` | 根からここまでのキーの列（エラーの文言に使う） |
| 79・80 | `logic`・`node` | schema から作ったロジックの木の、この位置の節と、この構造を持つ `FieldNode` 自身 |
| 82 | `createChildNode` | 子の `FieldNode` を作る関数（2 節）。中身は `FieldNode.newChild` |

54〜77 行目が `abstract` なのは、根と子で持ち方が違うからです（8 節）。たとえば `parent` は根では常に `undefined`、子では構築のときに受け取った親です。

📄 `angular/packages/forms/signals/src/field/structure.ts` L89–108 （▶ の行: 90, 96–97, 99, 104, 107）

```ts
 89 │   /** Lazily initialized injector. Do not access directly, access via `injector` getter instead. */
 90 ▶   private _injector: DestroyableInjector | undefined = undefined;
 91 │ 
 92 │   /** Cache whether any logic rules exist on children of this node. */
 93 │   private _anyChildHasLogic?: boolean;
 94 │ 
 95 │   /** Lazily initialized injector. */
 96 ▶   get injector(): DestroyableInjector {
 97 ▶     this._injector ??= Injector.create({
 98 │       providers: [],
 99 ▶       parent: this.fieldManager.injector,
100 │     }) as DestroyableInjector;
101 │     return this._injector;
102 │   }
103 │ 
104 ▶   constructor(logic: LogicNode, node: FieldNode, createChildNode: ChildNodeCtor) {
105 │     this.logic = logic;
106 │     this.node = node;
107 ▶     this.createChildNode = createChildNode;
108 │   }
```

96〜102 行目の `injector` は、初めて読まれたときに 97 行目で作られます。親は 99 行目の `fieldManager.injector`（`form()` に渡した injector）です。field/metadata.ts の `runMetadataCreateLifecycle` が、`create` を持つ metadata（`validateAsync` の resource など）をこの injector の注入文脈で作るので、フィールドが要らなくなったら 6 節の `destroy()` でこれを壊すと、その上の resource も止まります。104〜108 行目の constructor は 3 つを覚えるだけで、子は 1 つも作りません。子を作るのは `childrenMap` の計算です。

## 2. 誰が構造を作るか：FieldNode → adapter → createStructure

`FieldNode` の constructor は、最初に `this.fieldAdapter.createStructure(this, options)` を呼びます（[signal-forms](../signals/17-signal-forms.md) の 3 節の引用）。adapter（作り方を差し替えるための部品）は通常は `BasicFieldAdapter` で、互換の `compatForm` だけが別の adapter を使います（[第 4 回](04-sft-signal-form-control.md)）。

📄 `angular/packages/forms/signals/src/field/field_adapter.ts` L92–124 （▶ の行: 96–97, 121–122）

```ts
 92 │   /**
 93 │    * Creates a new child field node.
 94 │    * @param options
 95 │    */
 96 ▶   newChild(options: ChildFieldNodeOptions): FieldNode {
 97 ▶     return new FieldNode(options);
 98 │   }
 99 │ 
100 │   /**
101 │    * Creates a node state.
102 │    * @param node
103 │    */
104 │   createNodeState(node: FieldNode): FieldNodeState {
105 │     return new FieldNodeState(node);
106 │   }
107 │ 
108 │   /**
109 │    * Creates a validation state.
110 │    * @param node
111 │    */
112 │   createValidationState(node: FieldNode): ValidationState {
113 │     return new FieldValidationState(node);
114 │   }
115 │ 
116 │   /**
117 │    * Creates a node structure.
118 │    * @param node
119 │    * @param options
120 │    */
121 ▶   createStructure(node: FieldNode, options: FieldNodeOptions): FieldNodeStructure {
122 ▶     return node.createStructure(options);
123 │   }
124 │ }
```

📄 `angular/packages/forms/signals/src/field/node.ts` L454–485 （▶ の行: 464, 467–469, 474, 476, 480–482）

```ts
454 │ 
455 │   /**
456 │    * Creates a new root field node for a new form.
457 │    */
458 │   static newRoot<T>(
459 │     fieldManager: FormFieldManager,
460 │     value: WritableSignal<T>,
461 │     pathNode: FieldPathNode,
462 │     adapter: FieldAdapter,
463 │   ): FieldNode {
464 ▶     return adapter.newRoot(fieldManager, value, pathNode, adapter);
465 │   }
466 │ 
467 ▶   createStructure(options: FieldNodeOptions) {
468 ▶     return options.kind === 'root'
469 ▶       ? new RootFieldNodeStructure(
470 │           this,
471 │           options.logic,
472 │           options.fieldManager,
473 │           options.value,
474 ▶           this.newChild.bind(this),
475 │         )
476 ▶       : new ChildFieldNodeStructure(
477 │           this,
478 │           options.logic,
479 │           options.parent,
480 ▶           options.identityInParent,
481 ▶           options.initialKeyInParent,
482 ▶           this.newChild.bind(this),
483 │         );
484 │   }
485 │ 
```

`BasicFieldAdapter.createStructure` は 122 行目でノードに戻し、node.ts の 467 行目の `createStructure` が `options.kind` で分けます。468〜475 行目が根（`RootFieldNodeStructure`）、476〜483 行目が子（`ChildFieldNodeStructure`）です。どちらにも 474・482 行目で `this.newChild.bind(this)` を渡します。これが 1 節 82 行目の `createChildNode` になり、子の表を作る途中で呼ばれます。子の側は 480〜481 行目で親と `identityInParent`（配列の要素を追う印。[次の章](02-sft-array-identity.md)）を受け取ります。`newChild` の中身（配列なら `DYNAMIC` のロジック、そうでなければキーのロジックを取って、97 行目の `new FieldNode(options)` に渡す）は [forms-sf-schema](../forms/16-forms-sf-schema.md) の 8 節です。

## 3. 子の表：ChildrenData と ChildData

📄 `angular/packages/forms/signals/src/field/structure.ts` L588–627 （▶ の行: 589–590, 600, 606, 621, 626）

```ts
588 │ interface MutableChildrenData {
589 ▶   readonly byPropertyKey: Map<string, ChildData>;
590 ▶   byTrackingKey?: Map<TrackingKey, FieldNode>;
591 │ }
592 │ 
593 │ /**
594 │  * Derived data regarding child fields for a specific parent field.
595 │  */
596 │ interface ChildrenData {
597 │   /**
598 │    * Tracks `ChildData` for each property key within the parent.
599 │    */
600 ▶   readonly byPropertyKey: ReadonlyMap<string, ChildData>;
601 │ 
602 │   /**
603 │    * Tracks the instance of child `FieldNode`s by their tracking key, which is always 1:1 with the
604 │    * fields, even if they move around in the parent.
605 │    */
606 ▶   readonly byTrackingKey?: ReadonlyMap<TrackingKey, FieldNode>;
607 │ }
608 │ 
609 │ /**
610 │  * Data for a specific child within a parent.
611 │  */
612 │ interface ChildData {
613 │   /**
614 │    * A computed signal to access the `FieldNode` currently stored at a specific key.
615 │    *
616 │    * Because this is a computed, it only updates whenever the `FieldNode` at that key changes.
617 │    * Because `ChildData` is always associated with a specific key via `ChildrenData.byPropertyKey`,
618 │    * this computed gives a stable way to watch the field stored for a given property and only
619 │    * receives notifications when that field changes.
620 │    */
621 ▶   readonly reader: Signal<FieldNode | undefined>;
622 │ 
623 │   /**
624 │    * The child `FieldNode` currently stored at this key.
625 │    */
626 ▶   node: FieldNode;
627 │ }
```

1 節 54 行目の `childrenMap` の中身です。600 行目の `byPropertyKey` が「キー（文字列）→ `ChildData`」の Map で、`ChildData` は 621 行目の `reader`（そのキーにいる子を返す computed）と 626 行目の `node`（いまそのキーにいる子）の 2 つです。606 行目の `byTrackingKey` は配列の要素を位置ではなく印で追うための表で、[次の章](02-sft-array-identity.md)の主題です。588〜591 行目の `MutableChildrenData` は、作り直す途中で書き換えるための同じ形の型です。

> [!TIP]
> **新卒エンジニアへ**
>
> `node` と `reader` を分けて持つのは、**「キー 0 にいる子」が入れ替わることがある**からです（配列の並べ替え）。`reader` はキーごとに 1 つ作ったら変わらないので、テンプレートや effect は `reader` を読んでおけば、そのキーの子が入れ替わったときだけ知らされます。

## 4. childrenMap は linkedSignal：前の表を受け取って作り直す

📄 `angular/packages/forms/signals/src/field/structure.ts` L291–311 （▶ の行: 292–293, 296–297, 301, 304, 306, 309）

```ts
291 │   protected createChildrenMap(): Signal<ChildrenData | undefined> {
292 ▶     return linkedSignal({
293 ▶       source: this.value,
294 │       computation: (
295 │         value: unknown,
296 ▶         previous: {source: unknown; value: ChildrenData | undefined} | undefined,
297 ▶       ): ChildrenData | undefined => this.computeChildrenMap(value, previous?.value, false),
298 │     });
299 │   }
300 │ 
301 ▶   private computeChildrenMap(
302 │     value: unknown,
303 │     prevData: ChildrenData | undefined,
304 ▶     forceMaterialize: boolean,
305 │   ): ChildrenData | undefined {
306 ▶     if (!isObject(value)) {
307 │       // Non-object values have no children. This short-circuit path makes `childrenMap` fast
308 │       // for primitive-valued fields.
309 ▶       return undefined;
310 │     }
311 │ 
```

292 行目、子の表は `linkedSignal`（source が変わるたびに computation で作り直し、外から `set` / `update` もできる signal）です。293 行目の source はこのフィールドの `value`、296 行目の `previous` には前回の結果が入ります。297 行目で `computeChildrenMap(value, 前回の表, false)` を呼びます。306〜309 行目、値がオブジェクトでなければ（文字列・数・`null`）子はなく、`undefined` を返します。

この続きの数行が「子にどこにもルールが無ければ、まだ作らずに `undefined` を返す」近道で、[forms-sf-schema](../forms/16-forms-sf-schema.md) の 8 節で引用しました。304 行目の `forceMaterialize`（強制的に作る）が `true` のときと、前回の表がもうあるときは、その近道を通りません。

📄 `angular/packages/forms/signals/src/field/structure.ts` L324–344 （▶ の行: 326–327, 332, 334, 337, 339, 341）

```ts
324 │     // Previous `ChildrenData` (immutable). This is also where we first initialize our map if
325 │     // needed.
326 ▶     prevData ??= {
327 ▶       byPropertyKey: new Map(),
328 │     };
329 │ 
330 │     // The next `ChildrenData` object to be returned. Initialized lazily when we know there's
331 │     // been a structural change to the model.
332 ▶     let materializedChildren: MutableChildrenData | undefined;
333 │ 
334 ▶     const parentIsArray = isArray(value);
335 │ 
336 │     // Remove fields that have disappeared since the last time this map was computed.
337 ▶     if (prevData !== undefined) {
338 │       if (parentIsArray) {
339 ▶         materializedChildren = maybeRemoveStaleArrayFields(prevData, value, this.identitySymbol);
340 │       } else {
341 ▶         materializedChildren = maybeRemoveStaleObjectFields(prevData, value);
342 │       }
343 │     }
344 │ 
```

326〜328 行目、前回の表が無ければ空の Map から始めます。332 行目の `materializedChildren` は「次に返す表」で、**構造が変わったと分かったときだけ**作ります。337〜343 行目で、前回の表にあって今の値に無いキーを外します（配列なら 339 行目、オブジェクトなら 341 行目。中身は[次の章](02-sft-array-identity.md)）。

📄 `angular/packages/forms/signals/src/field/structure.ts` L345–361 （▶ の行: 346, 348, 353, 355–357, 359）

```ts
345 │     // Now, go through the values and add any new ones.
346 ▶     for (const key of Object.keys(value)) {
347 │       let trackingKey: TrackingKey | undefined = undefined;
348 ▶       const childValue = value[key] as unknown;
349 │ 
350 │       // Fields explicitly set to `undefined` are treated as if they don't exist.
351 │       // This ensures that `{value: undefined}` and `{}` have the same behavior for their `value`
352 │       // field.
353 ▶       if (childValue === undefined) {
354 │         // The value might have _become_ `undefined`, so we need to delete it here.
355 ▶         if (prevData.byPropertyKey.has(key)) {
356 ▶           materializedChildren ??= {...(prevData as MutableChildrenData)};
357 ▶           materializedChildren.byPropertyKey.delete(key);
358 │         }
359 ▶         continue;
360 │       }
361 │ 
```

346 行目、今の値の `Object.keys` を順に見ます。353〜360 行目、値が `undefined` のキーは「無いもの」と同じに扱い、前回あったなら 357 行目で消します。ですから `{profile: undefined}` の `f.profile` は `undefined` になります（DEMO の 5）。この間の数行（配列の要素に印を付ける）は[次の章](02-sft-array-identity.md)で読み、ここではオブジェクトの値だけを追います。

📄 `angular/packages/forms/signals/src/field/structure.ts` L390–417 （▶ の行: 396–397, 399, 401, 404, 407, 409, 412, 416）

```ts
390 │       // Next, make sure the `ChildData` for this key in `byPropertyKey` is up to date. We need
391 │       // to consider two cases:
392 │       //
393 │       // 1. No record exists for this field (yet).
394 │       // 2. A record does exist, but the field identity at this key has changed (only possible
395 │       //    when fields are tracked).
396 ▶       const child = prevData.byPropertyKey.get(key);
397 ▶       if (child === undefined) {
398 │         // No record exists yet - create one.
399 ▶         materializedChildren ??= {...(prevData as MutableChildrenData)};
400 │ 
401 ▶         materializedChildren.byPropertyKey.set(key, {
402 │           // TODO: creating a computed per-key is overkill when the field at a key can't change
403 │           // (e.g. the value is not an array). Maybe this can be optimized?
404 ▶           reader: this.createReader(key),
405 │           // If tracking is in use, then it already created/found the `childNode` for this key.
406 │           // Otherwise we create the child field here.
407 ▶           node: childNode ?? this.createChildNode(key, trackingKey, parentIsArray),
408 │         });
409 ▶       } else if (childNode && childNode !== child.node) {
410 │         // A record exists, but records the wrong `FieldNode`. Update it.
411 │         materializedChildren ??= {...(prevData as MutableChildrenData)};
412 ▶         child.node = childNode;
413 │       }
414 │     }
415 │ 
416 ▶     return materializedChildren ?? prevData;
417 │   }
```

1. **396 行目：前回の表でそのキーを引く**

   オブジェクトの値では、子は「キー」で決まります。前回の表に同じキーがあれば、何もしません。**これが子を使い回す条件**です。値の中身（`profile` の名前が変わった）は見ません。
2. **397〜408 行目：無ければ作る**

   399 行目で表を写し、401 行目でキーに `ChildData` を入れます。404 行目で `reader` を、407 行目で子の `FieldNode` を作ります（配列で印を使うときは、もう作ってある `childNode` を使う）。
3. **409〜413 行目：キーにいる子が入れ替わった（配列のときだけ）**

   412 行目で `child.node` を書き換えます。オブジェクトの値ではここに来ません。
4. **416 行目：変わらなければ前回の表をそのまま返す**

   `linkedSignal` は同じオブジェクトなら変化とみなさないので、値が変わっても構造が同じなら `childrenMap` を読んでいる computed は知らされません。

> [!WARNING]
> **ハマりどころ**
>
> 399 行目の `{...prevData}` は外側のオブジェクトだけを写します。`byPropertyKey` の Map は前回の表と**同じ Map**で、401 行目の `set` は前回の表の Map も書き換えます。324 行目のコメントは「immutable」と書いていますが、変化を知らせているのは「外側のオブジェクトが新しくなったこと」だけです。このことは 73ab88e65bf のコミットメッセージにも「same Map reference via the spread」と書かれています。

## 5. 子を作るのは読まれたときだけ（98c5afdb021）

98c5afdb021 の前は、`childrenMap` の computation が値の全部のキーに子を作っていました。ルールの無いフィールドにも子が作られ、大きな配列で遅くなる（#67212）ので、「ルールのある子が無ければ表を `undefined` のままにし、読まれたときに初めて作る」形に変えました。差分の要の所です。

📄 `98c5afdb021 の差分`

```
$ git show 98c5afdb021 -- packages/forms/signals/src/field/structure.ts（抜粋）
# perf(forms): lazily instantiate signal form fields（2026-02-26、Fixes #67212）
@@ -101,6 +104,7 @@ export abstract class FieldNodeStructure {
   /** Gets the child fields of this field. */
   children(): readonly FieldNode[] {
+    this.ensureChildrenMap();
     const map = this.childrenMap();
@@ -108,8 +112,35 @@
+  _areChildrenMaterialized(): boolean {
+    return untracked(this.childrenMap) !== undefined;
+  }
+
+  private ensureChildrenMap() {
+    // If we're already materialized, there's nothing to do.
+    if (this._areChildrenMaterialized()) {
+      return;
+    }
+    untracked(() => {
+      (this.childrenMap as WritableSignal<ChildrenData | undefined>).update((current) =>
+        this.computeChildrenMap(this.value(), current, true),
+      );
+    });
+  }
+
   /** Retrieve a child `FieldNode` of this node by property key. */
   getChild(key: PropertyKey): FieldNode | undefined {
+    this.ensureChildrenMap();
+
     const strKey = key.toString();
@@ -253,108 +284,126 @@
       computation: (
         value: unknown,
         previous: {source: unknown; value: ChildrenData | undefined} | undefined,
-      ): ChildrenData | undefined => {
-        if (!isObject(value)) {
-          ...（ここに computeChildrenMap の本体がそのまま書かれていた）
+      ): ChildrenData | undefined => this.computeChildrenMap(value, previous?.value, false),
+    });
+  }
+
+  private computeChildrenMap(
+    value: unknown,
+    prevData: ChildrenData | undefined,
+    forceMaterialize: boolean,
+  ): ChildrenData | undefined {
+    ...
+    if (!forceMaterialize && prevData === undefined) {
+      if (!(this._anyChildHasLogic ??= this.logic.anyChildHasLogic())) {
+        return undefined;
+      }
+    }
（残りは本体の移動と、変数名 data → materializedChildren の付け替え。ほかに schema/logic.ts・logic_node.ts に
 hasLogicRules() と anyChildHasLogic() を足し、test/node/api/structure.spec.ts に describe('lazy materialization') の 3 つの it を足した）
```

📄 `angular/packages/forms/signals/src/field/structure.ts` L147–160 （▶ の行: 149–150, 155–157）

```ts
147 │   private ensureChildrenMap() {
148 │     // If we're already materialized, there's nothing to do.
149 ▶     if (this._areChildrenMaterialized()) {
150 ▶       return;
151 │     }
152 │ 
153 │     // We force materialization by telling the linkedSignal to re-evaluate now, but treating
154 │     // its source value as having changed, or rather skipping the lazy fast-path.
155 ▶     untracked(() => {
156 ▶       (this.childrenMap as WritableSignal<ChildrenData | undefined>).update((current) =>
157 ▶         this.computeChildrenMap(this.value(), current, true),
158 │       );
159 │     });
160 │   }
```

`ensureChildrenMap` は 149 行目で、表がもうあれば何もしません。無ければ 156〜157 行目で `childrenMap` を `update` し、`computeChildrenMap(今の値, 今の表, true)` の結果を入れます。第 3 引数の `true` が 4 節 304 行目の `forceMaterialize` で、ルールの有無にかかわらず表を作ります。155 行目の `untracked` は、テンプレートや computed の中で呼ばれても、この書き込みを依存として記録させないためです。一度入れた表は linkedSignal の「前回の値」になるので、以後の値の変更では 4 節の近道（前回の表が無いとき）を通らず、作った子が保たれます。

📄 `angular/packages/forms/signals/src/field/structure.ts` L162–188 （▶ の行: 163–164, 166, 171, 173, 184, 187）

```ts
162 │   /** Retrieve a child `FieldNode` of this node by property key. */
163 ▶   getChild(key: PropertyKey): FieldNode | undefined {
164 ▶     this.ensureChildrenMap();
165 │ 
166 ▶     const strKey = key.toString();
167 │ 
168 │     // Lookup the computed reader for this key in `childrenMap`. This lookup doesn't need to be
169 │     // reactive since `childrenMap` guarantees it will always return the same `reader` for the same
170 │     // `key`, so long as that key exists.
171 ▶     let reader = untracked(this.childrenMap)?.byPropertyKey.get(strKey)?.reader;
172 │ 
173 ▶     if (!reader) {
174 │       // The key doesn't exist / doesn't have a child field associated with it. In this case, we
175 │       // need to be clever. We want to return `undefined`, but also be notified by reactivity if the
176 │       // field _does_ pop into existence later. Basically, we want to depend on a reader for a key
177 │       // that doesn't exist.
178 │       //
179 │       // We do precisely that by creating an ephemeral reader which will be read and then dropped.
180 │       // If we're in a reactive context, the ephemeral reader will live on in the dependencies of
181 │       // that context and notify it if the field is later created. When the reactive context reruns,
182 │       // it will again attempt the read which will call `getChild()`, which will then find the real
183 │       // reader for that key.
184 ▶       reader = this.createReader(strKey);
185 │     }
186 │ 
187 ▶     return reader();
188 │   }
```

`f.profile` の読み出しは、Proxy（[第 3 回](03-sft-proxy-context.md)）を通ってここに来ます。164 行目でまず表を作り、166 行目でキーを文字列にし（`f.items[0]` の `0` も `'0'`）、171 行目で表から `reader` を引きます。キーが無いときは 184 行目で使い捨ての `reader` を作って読みます。`undefined` を返しつつ、テンプレートの中なら「そのキーに子が現れたら知らせて」と依存を残すためです（174〜183 行目のコメント）。187 行目で `reader` を読んで子を返します。

📄 `angular/packages/forms/signals/src/field/structure.ts` L419–428 （▶ の行: 426–427）

```ts
419 │   /**
420 │    * Creates a "reader" computed for the given key.
421 │    *
422 │    * A reader is a computed signal that memoizes the access of the `FieldNode` stored at this key
423 │    * (or returns `undefined` if no such field exists). Accessing fields via the reader ensures that
424 │    * reactive consumers aren't notified unless the field at a key actually changes.
425 │    */
426 ▶   private createReader(key: string): Signal<FieldNode | undefined> {
427 ▶     return computed(() => this.childrenMap()?.byPropertyKey.get(key)?.node);
428 │   }
```

427 行目、`reader` は「表の、このキーの `node`」を返すだけの computed です。b96f65a963f（2025-12）で入りました。computed は結果が同じなら下流に知らせないので、`f.data` を読む effect は、form のどこかの値が変わるたびではなく、`data` にいる子が入れ替わったときだけ動きます。

> [!NOTE]
> **さらに深く**
>
> 遅延は「キーごと」ではなく「**段ごと**」です。`getChild('profile')` の 164 行目は根の表を作るので、そのとき 4 節の 407 行目で `profile` だけでなく `address` と `note` の子も作られます。作られないのは、その子たちの下の段（`profile.name` など）です。1000 行の配列で `f.rows[5]` を読むと、1000 行ぶんの子が作られます（7 節の 2 つ目の記録の 1004）。

## 6. children() と materializedChildren() の違い

📄 `angular/packages/forms/signals/src/field/structure.ts` L110–145 （▶ の行: 111–112, 117, 129–130, 134, 143–144）

```ts
110 │   /** Gets the child fields of this field. */
111 ▶   children(): readonly FieldNode[] {
112 ▶     this.ensureChildrenMap();
113 │     const map = this.childrenMap();
114 │     if (map === undefined) {
115 │       return [];
116 │     }
117 ▶     return Array.from(map.byPropertyKey.values()).map((child) => untracked(child.reader)!);
118 │   }
119 │ 
120 │   /**
121 │    * Gets only the child fields that have been materialized already.
122 │    *
123 │    * This is useful for iterating over children without triggering materialization of children
124 │    * that haven't been accessed yet.
125 │    *
126 │    * Note: This method assumes it is called within an untracked context (or in a non-reactive context)
127 │    * as it reads signals without wrapping them in `untracked()`.
128 │    */
129 ▶   materializedChildren(): readonly FieldNode[] {
130 ▶     const map = this.childrenMap();
131 │     if (map === undefined) {
132 │       return [];
133 │     }
134 ▶     return Array.from(map.byPropertyKey.values()).map((child) => child.node);
135 │   }
136 │ 
137 │   /**
138 │    * Internal method (cast to any in tests) to check if the children map has been materialized.
139 │    * Useful for validating that fields without logic are lazily instantiated.
140 │    *
141 │    * @internal
142 │    */
143 ▶   _areChildrenMaterialized(): boolean {
144 ▶     return untracked(this.childrenMap) !== undefined;
145 │   }
```

|   | `children()`（111 行目） | `materializedChildren()`（129 行目） |
| --- | --- | --- |
| 表が無いとき | 112 行目で作る（子を全部作る） | 作らない。130 行目で `undefined` を見て空の配列 |
| 返すもの | 117 行目、各キーの `reader` を `untracked` で読んだ子 | 134 行目、各キーの `node` |
| 前提 | どこから呼んでもよい | 126〜127 行目のコメントのとおり、`untracked` の中で呼ぶ |

143〜145 行目の `_areChildrenMaterialized()` は、表がもうあるかを `untracked` で見るだけの関数で、spec が `as any` で呼んで遅延を確かめます（テストと直し方）。どちらを使うかで、「子を全部たどる処理」が子を作ってしまうかが決まります。呼ぶ側の一覧です。

📄 `記録`

```
$ cd packages/forms/signals && grep -rn ".children()\|materializedChildren()\|reduceChildren(" src
src/webmcp/registration.ts:125:    const children = node.structure.children();
src/field/manager.ts:84:    for (const child of structure.children()) {
src/field/state.ts:80:    return this.node.structure.reduceChildren(
src/field/state.ts:96:    return this.node.structure.reduceChildren(
src/field/validation.ts:203:    return this.node.structure.reduceChildren(
src/field/validation.ts:277:      const errors = this.node.structure.reduceChildren(this.errors(), (child, result) => [
src/field/validation.ts:294:    this.node.structure.reduceChildren(
src/field/node.ts:135:      .children()                                    # getBindingForFocus（focusBoundControl）
src/field/node.ts:294:    for (const child of this.structure.children()) { # markAsTouchedInternal
src/field/node.ts:351:    for (const child of this.structure.materializedChildren()) {  # _reset
src/field/node.ts:373:    for (const child of this.structure.children()) { # _reloadValidation
# （8576f161ae4。structure.ts の中の定義は除いた）
```

`_reset`（`reset()`）は作った子だけをたどり、`markAsTouchedInternal`（`markAsTouched()` と `submit()`）・`getBindingForFocus`（`focusBoundControl()`）・`_reloadValidation`・WebMCP の登録・掃除の effect（7 節）は `children()` で子を作ります。origin/main の cf37344a4d6（2026-10）は `markAsTouchedInternal` を「検証を飛ばす部分木（hidden・disabled・readonly）は `materializedChildren()`」に変えました。22.2.6 の `_validation_errors-chunk.mjs` にはもう入っています（`skipValidation ? this.structure.materializedChildren() : this.structure.children()`）。

📄 `angular/packages/forms/signals/src/field/structure.ts` L190–218 （▶ の行: 195, 200–201, 210, 216–217）

```ts
190 │   /**
191 │    * Perform a reduction over a field's children (if any) and return the result.
192 │    *
193 │    * Optionally, the reduction is short circuited based on the provided `shortCircuit` function.
194 │    */
195 ▶   reduceChildren<T>(
196 │     initialValue: T,
197 │     fn: (child: FieldNode, value: T) => T,
198 │     shortCircuit?: (value: T) => boolean,
199 │   ): T {
200 ▶     const map = this.childrenMap();
201 ▶     if (!map) {
202 │       return initialValue;
203 │     }
204 │ 
205 │     let value = initialValue;
206 │     for (const child of map.byPropertyKey.values()) {
207 │       if (shortCircuit?.(value)) {
208 │         break;
209 │       }
210 ▶       value = fn(untracked(child.reader)!, value);
211 │     }
212 │     return value;
213 │   }
214 │ 
215 │   /** Destroys the field when it is no longer needed. */
216 ▶   destroy(): void {
217 ▶     this.injector.destroy();
218 │   }
```

195 行目の `reduceChildren` は、valid・dirty・touched のような「子から集める」状態が使います（上の一覧の state.ts と validation.ts）。200 行目で `childrenMap()` を**依存として**読み、表が無ければ 201〜202 行目で初期値を返します。子を作りません。まだ作られていない子にはルールも touched も無いので、集めなくても結果は同じです。210 行目で各子を `untracked(child.reader)` で取り出します。

216〜218 行目の `destroy()` は injector を壊すだけです。8576f161ae4 では 217 行目が getter の `this.injector` を読むので、**一度も使っていない injector をわざわざ作ってから壊していました**。origin/main の 67e50693274（2026-10-30、Fixes #71623）が `this._injector?.destroy()` に変え、22.2.6 の `.mjs` にも入っています（`destroy() { this._injector?.destroy(); }`）。

## 7. 掃除の effect が、作らなかった子を全部作る（#70627）

`destroy()` を呼ぶのは `FormFieldManager` の effect です。`form()` は根のノードを作った直後に `createFieldManagementEffect` を呼び（api/structure.ts、[signal-forms](../signals/17-signal-forms.md) の 2 節の引用）、effect は根からたどれる構造を集め、たどれなくなった構造を壊します（[次の章](02-sft-array-identity.md)の 6 節）。たどり方がこれです。

📄 `angular/packages/forms/signals/src/field/manager.ts` L73–88 （▶ の行: 83–85）

```ts
73 │   /**
74 │    * Collects all structures reachable from the given structure into the given set.
75 │    *
76 │    * @param structure The root structure
77 │    * @param liveStructures The set of reachable structures to populate
78 │    */
79 │   private markStructuresLive(
80 │     structure: FieldNodeStructure,
81 │     liveStructures: Set<FieldNodeStructure>,
82 │   ): void {
83 ▶     liveStructures.add(structure);
84 ▶     for (const child of structure.children()) {
85 ▶       this.markStructuresLive(child.structure, liveStructures);
86 │     }
87 │   }
88 │ }
```

84 行目が `children()` です。6 節の表のとおり `children()` は表が無ければ作るので、**effect が 1 回走ると、根から葉まで全部の子が作られます**。5 節の遅延は、`form()` を作ってから最初の変更検知（effect が流れる時）までしか効きません。本物で確かめた記録です。

📄 `記録（Node、22.2.6）`

```
# ~/angular-research/angular-deep-dive の node_modules（@angular/core・@angular/forms 22.2.6）を Node で読み込み、
# createEnvironmentInjector に provideZonelessChangeDetection を入れて ApplicationRef.tick() で effect を流した
# @angular/forms 22.2.6 / node v24.22.1
tick せずに  : 根の子の表 false / f.a.b の子の表 false
tick してから: 根の子の表 true / f.a.b の子の表 true
rows 1000 行: tick 前の子の構造 0
rows 1000 行: tick 後の子の構造 6001（tick 80 ms）
# 「子の表」は structure._areChildrenMaterialized()。「子の構造」は fieldManager.structures.size（根は数えない）
# 6001 = rows 1 + 行 1000 + 各行の id・name・tags 3000 + tags の要素 2000
```

tick（`ApplicationRef.tick()`、アプリの変更検知を 1 回走らせること。effect もここで流れる）をしなければ、根の表も `f.a.b` の表も無いままです。tick すると両方できます。1000 行のモデルでは、何も読まなくても 1 回の tick で 6001 個の子の構造ができました。#67212 の計測（値を `set` した直後の同期の時間）には、この effect の時間は入りません。

📄 `記録（Node、22.2.6 を実行時に差し替え）`

```
# 同じ 1000 行。manager.ts 84 行目を materializedChildren() に替えた版（実行時に prototype を差し替え）
# @angular/forms 22.2.6 / node v24.22.1
22.2.6 のまま: 1 回目の tick 後 6001 / rows[5].name を読んで tick 6001 / rows[5] を消して tick 5995
materializedChildren に替えた: 1 回目の tick 後 0 / rows[5].name を読んで tick 1004 / rows[5] を消して tick 1000
# 1004 = rows 1 + 行 1000（f.rows[5] を読むと、rows の子の表がまとめてできる）+ rows[5] の id・name・tags 3
```

84 行目を `materializedChildren()` にすると、1 回目の tick の後も 0 個のままで、1 行だけ読めば 1004 個、その行を消すと掃除されて 1000 個に戻ります。この不具合は #70627（2026-09、開いている）で報告され、同じ 1 行の直しが #70633（閉じた）と #71659（開いている）で出ています。#71635 は失敗する spec だけの PR（閉じた）です。origin/main（ca92b968b8e）の manager.ts はまだ `children()` のままで、22.2.6 の `.mjs` も同じです。

## 8. RootFieldNodeStructure と ChildFieldNodeStructure

📄 `angular/packages/forms/signals/src/field/structure.ts` L431–452 （▶ の行: 432, 434, 437–438, 441–442, 445–446, 449）

```ts
431 │ /** The structural component of a `FieldNode` that is the root of its field tree. */
432 ▶ export class RootFieldNodeStructure extends FieldNodeStructure {
433 │   override get parent(): undefined {
434 ▶     return undefined;
435 │   }
436 │ 
437 ▶   override get root(): FieldNode {
438 ▶     return this.node;
439 │   }
440 │ 
441 ▶   override get pathKeys(): Signal<readonly string[]> {
442 ▶     return ROOT_PATH_KEYS;
443 │   }
444 │ 
445 ▶   override get keyInParent(): Signal<string> {
446 ▶     return ROOT_KEY_IN_PARENT;
447 │   }
448 │ 
449 ▶   override readonly isOrphaned = FALSE_SIGNAL;
450 │ 
451 │   /** @internal */
452 │   override readonly childrenMap: Signal<ChildrenData | undefined>;
```

📄 `angular/packages/forms/signals/src/field/structure.ts` L465–476 （▶ の行: 469–470, 473–474）

```ts
465 │   constructor(
466 │     /** The full field node that corresponds to this structure. */
467 │     node: FieldNode,
468 │     logic: LogicNode,
469 ▶     override readonly fieldManager: FormFieldManager,
470 ▶     override readonly value: WritableSignal<unknown>,
471 │     createChildNode: ChildNodeCtor,
472 │   ) {
473 ▶     super(logic, node, createChildNode);
474 ▶     this.childrenMap = this.createChildrenMap();
475 │   }
476 │ }
```

根は親が無いので、433〜447 行目の getter が決まった値を返します。`parent` は `undefined`、`root` は自分、`pathKeys` と `keyInParent` は下の 2 つの共有の signal、449 行目の `isOrphaned` は常に `false` です。469〜470 行目で `fieldManager` と `value`（利用者の model そのもの）を受け取り、474 行目で子の表を作ります。

📄 `angular/packages/forms/signals/src/field/structure.ts` L478–491 （▶ の行: 480, 482–483, 486, 488–489）

```ts
478 │ /** The structural component of a child `FieldNode` within a field tree. */
479 │ export class ChildFieldNodeStructure extends FieldNodeStructure {
480 ▶   override readonly root: FieldNode;
481 │   override readonly pathKeys: Signal<readonly string[]>;
482 ▶   override readonly keyInParent: Signal<string>;
483 ▶   override readonly value: WritableSignal<unknown>;
484 │   override readonly childrenMap: Signal<ChildrenData | undefined>;
485 │ 
486 ▶   override readonly isOrphaned: Signal<boolean>;
487 │ 
488 ▶   override get fieldManager(): FormFieldManager {
489 ▶     return this.root.structure.fieldManager;
490 │   }
491 │ 
```

子は 480〜486 行目を constructor で埋めます（[signal-forms](../signals/17-signal-forms.md) の 4 節で引用した constructor。`keyInParent` と `isOrphaned` を作り、`value` を `deepSignal(親の value, keyInParent)` にし、子の表を作り、`fieldManager.structures` に自分を足す）。488〜490 行目、`fieldManager` は自分では持たず、根の構造のものを読みます。`fieldManager.structures` に自分を足すのは子だけなので、7 節の記録の「子の構造の数」に根は入りません。

📄 `angular/packages/forms/signals/src/field/structure.ts` L569–586 （▶ の行: 570, 576–578, 584–585）

```ts
569 │ /** A signal representing an empty list of path keys, used for root fields. */
570 ▶ const ROOT_PATH_KEYS = computed<readonly string[]>(() => []);
571 │ 
572 │ /**
573 │  * A signal representing a non-existent key of the field in its parent, used for root fields which
574 │  * do not have a parent. This signal will throw if it is read.
575 │  */
576 ▶ const ROOT_KEY_IN_PARENT = computed(() => {
577 ▶   throw new RuntimeError(
578 ▶     RuntimeErrorCode.ROOT_FIELD_NO_PARENT,
579 │     ngDevMode && 'The top-level field in the form has no parent.',
580 │   );
581 │ });
582 │ 
583 │ /** Gets a human readable name for a field node for use in error messages. */
584 ▶ function getDebugName(node: FieldNode) {
585 ▶   return `<root>.${node.structure.pathKeys().join('.')}`;
586 │ }
```

570 行目の `ROOT_PATH_KEYS` は空の配列、576〜581 行目の `ROOT_KEY_IN_PARENT` は読むと `ROOT_FIELD_NO_PARENT`（NG01905）を投げる computed です。`f().keyInParent()` を読むとこれが出ます。585 行目の `getDebugName` は孤児のエラーの文言に使う名前で、`<root>.` の後に `pathKeys` を `.` でつなぎます。根の直下の子が孤児になったときは `pathKeys` が空なので、文言は `of <root>.` と点で終わります（下の DEMO の 5 で見えます）。

## 9. DEMO：どの子がいつ作られ、入れ替えた後も同じか

> **🧪 DEMO — 本物の form() の木（@angular/forms 22.2.6）**
>
> モデルは `{profile: {name, email}, address: {city, zip}, note}`。ボタンを 1 から順に押してください。「操作の直後」はボタンの処理の中で同期に、「次の描画の後」は `afterNextRender` で、掃除の effect（7 節）が流れた後に見ます。覗いているのは `f().structure` の `materializedChildren()`（子を作らずに、作られた子だけ）と `_areChildrenMaterialized()`（子の表があるか）と `fieldManager.structures.size` です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sft-structure)

- **1 を押した直後**は、根の行だけが印を持ち、子の表は「なし」です（5 節）。**描画の後**には全部の行が印を持ちます（7 節の 84 行目）。
- **2・3** を押す時点では、1 の後の描画（掃除の effect）でもう全部作られているので、印も子の表も変わりません。ボタンの処理が終わるたびに描画が走るので、「作っただけで、まだ effect が流れていない木」を 2 で読むことはできません。
- **4**（profile を新しいオブジェクトに）では、`f.profile.name` の印が変わらず、取っておいた方と `===` です（4 節の 396 行目）。
- **5**（`undefined`）では `profile` の 3 行が消え、子の構造の数が描画の後に 7 から 4 に減ります（掃除の effect が孤児を壊す。[次の章](02-sft-array-identity.md)の 6 節）。取っておいた方の `keyInParent()` と `value()` は NG01902 を投げます（次の章の 3 節）。本番ビルドなので文言はコードだけです。**6** で戻すと新しい印になり、取っておいた方とは別物です。6 の「直後」にもう `f.profile` の印があるのは、表を見るために根の `childrenMap()` を読んだ時点で linkedSignal が計算し直され、前回の表があるので 4 節の近道を通らずに 407 行目で新しいキーの子が作られるからです（`materializedChildren()` が作らないのは「まだ表の無い段」だけ）。

## ここまでの呼び出し

- 👤 `f.profile` — 利用者のコード
  - `FIELD_PROXY_HANDLER.get` — proxy.ts — *第 3 回*
    - `FieldNodeStructure.getChild('profile')` — structure.ts 163
      - `ensureChildrenMap()` — structure.ts 147 — *表があれば何もしない*
        - `childrenMap.update(… computeChildrenMap(value, current, true))` — structure.ts 156
          - `createReader(key)` と `createChildNode(key, undefined, false)` — structure.ts 404・407 — *キーの数だけ*
            - `FieldNode.newChild` → `BasicFieldAdapter.newChild` → `new FieldNode(options)` — node.ts 486 / field\_adapter.ts 97
              - `adapter.createStructure` → `node.createStructure` → `new ChildFieldNodeStructure` — field\_adapter.ts 122 / node.ts 476
                - `createKeyOrOrphanSignals`・`deepSignal`・`createChildrenMap`・`structures.add` — structure.ts 516–525 — *孫の表はまだ作らない*
      - `reader()` — structure.ts 187 — *そのキーの node を返す*
- `effect`（次の変更検知）→ `markStructuresLive` → `children()` — manager.ts 84 — *全部の段の表を作る（#70627）*

## テストと直し方

この章の約束は `test/node/api/structure.spec.ts` の `describe('lazy materialization')`（88 行目）と、`test/node/field_node.spec.ts` の `describe('instances')`（58 行目）が固めています。前者は `it('should stay unmaterialized when children have no schema logic')`（89 行目）・`it('should materialize children when explicitly accessed')`（101 行目）・`it('should eagerly materialize children when they have schema logic')`（120 行目）の 3 つで、98c5afdb021 が足しました。

📄 `angular/packages/forms/signals/test/node/api/structure.spec.ts` L101–132 （▶ の行: 110, 113–114, 117, 122, 129–130）

```ts
101 │     it('should materialize children when explicitly accessed', () => {
102 │       const s = schema<{a: {b: string}}>((p) => {
103 │         // No logic applied
104 │       });
105 │ 
106 │       const data = signal({a: {b: 'test'}});
107 │       const f = form(data, s, {injector: TestBed.inject(Injector)});
108 │ 
109 │       // Initially false
110 ▶       expect((f() as any).structure._areChildrenMaterialized()).toBeFalse();
111 │ 
112 │       // Accessing 'a' forces materialization of root's children
113 ▶       const childA = f.a;
114 ▶       expect((f() as any).structure._areChildrenMaterialized()).toBeTrue();
115 │ 
116 │       // 'a' itself should not have materialized its children ('b') yet
117 ▶       expect((childA() as any).structure._areChildrenMaterialized()).toBeFalse();
118 │     });
119 │ 
120 │     it('should eagerly materialize children when they have schema logic', () => {
121 │       const s = schema<{a: {b: string}}>((p) => {
122 ▶         required(p.a.b, {message: 'required'});
123 │       });
124 │ 
125 │       const data = signal({a: {b: 'test'}});
126 │       const f = form(data, s, {injector: TestBed.inject(Injector)});
127 │ 
128 │       // Because 'a.b' has rules, 'a' and 'b' must be materialized up the tree
129 ▶       expect((f() as any).structure._areChildrenMaterialized()).toBeTrue();
130 ▶       expect((f.a() as any).structure._areChildrenMaterialized()).toBeTrue();
131 │     });
132 │   });
```

110 行目は表が無いこと、113〜114 行目は `f.a` を読むと根の表ができること、117 行目は `a` の下（`b`）はまだ無いこと、122 行目でルールを付けると 129〜130 行目で先に作られていることです。どの it も effect を流していません（`TestBed.tick()` を呼ばない）。7 節の崩れは、この 3 つでは見えません。

📄 `angular/packages/forms/signals/test/node/field_node.spec.ts` L58–79 （▶ の行: 67–68, 74–76）

```ts
58 │   describe('instances', () => {
59 │     it('should get the same instance when asking for a child multiple times', () => {
60 │       const f = form(
61 │         signal({
62 │           a: 1,
63 │           b: 2,
64 │         }),
65 │         {injector: TestBed.inject(Injector)},
66 │       );
67 ▶       const child = f.a;
68 ▶       expect(f.a).toBe(child);
69 │     });
70 │ 
71 │     it('should get the same instance when asking for a child multiple times (after update)', () => {
72 │       const value = signal<{a: number; b?: number}>({a: 1, b: 2});
73 │       const f = form(value, {injector: TestBed.inject(Injector)});
74 ▶       const child = f.a;
75 ▶       value.set({a: 3});
76 ▶       expect(f.a).toBe(child);
77 │     });
78 │   });
79 │ 
```

68 行目は同じキーを 2 回読むと同じ `FieldTree`、75〜76 行目は値を `set` しても同じキーの子は同じものだ、ということです（4 節 396 行目）。

📄 `走らせ方`

```
cd ~/angular-research/angular
# Node の jasmine（--test_arg=--filter が効く）
pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all \
  --test_arg=--filter="tracking|lazy materialization|instances"
pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all
```

📄 `結果`

```
# 2026-11-18、手元の macOS で（8576f161ae4）
Ran 10 of 539 specs
10 specs, 0 failures            # lazy materialization 3・instances 2・tracking 5（field_node 4 と dynamic 1）
//packages/forms/signals/test/node:test                                  PASSED in 0.9s
539 specs, 0 failures           # フィルタなし
//packages/forms/signals/test/node:test                                  PASSED in 1.0s
```

### 直すとしたら

- 7 節は `FormFieldManager.markStructuresLive`（manager.ts 79〜87 行目）の 84 行目を `materializedChildren()` にする 1 行です。作られていない子には effect も resource も無いので、掃除でたどる必要がありません。後から作られた子は、effect が `childrenMap()` を依存として読んでいる（`materializedChildren` の 130 行目）ので、表が変われば effect が走り直します。spec は `describe('lazy materialization')` に、`TestBed.tick()` で effect を流してから `_areChildrenMaterialized()` を見る it を足す形です。作業木で試した差分と結果です。

📄 `作業木で試した差分`

```
# 作業木（8576f161ae4）で試した差分。作業木は試した後で消した
--- a/packages/forms/signals/src/field/manager.ts
+++ b/packages/forms/signals/src/field/manager.ts
@@ -81,7 +81,7 @@ export class FormFieldManager {
     liveStructures.add(structure);
-    for (const child of structure.children()) {
+    for (const child of structure.materializedChildren()) {
       this.markStructuresLive(child.structure, liveStructures);
--- a/packages/forms/signals/test/node/api/structure.spec.ts
+++ b/packages/forms/signals/test/node/api/structure.spec.ts
@@ -117,6 +117,16 @@ describe('structure APIs', () => {
+    it('should stay unmaterialized after the field cleanup effect runs', () => {
+      const data = signal({a: {b: 'test'}});
+      const f = form(data, {injector: TestBed.inject(Injector)});
+
+      // Flush root effects, including the FormFieldManager cleanup effect.
+      TestBed.tick();
+
+      expect((f() as any).structure._areChildrenMaterialized()).toBeFalse();
+    });
```

📄 `結果（作業木、bazel を直接）`

```
# spec だけを足した状態（manager.ts は元のまま）
Ran 4 of 540 specs
1) structure APIs lazy materialization should stay unmaterialized after the field cleanup effect runs
  Message:
    Expected true to be false.
4 specs, 1 failure
//packages/forms/signals/test/node:test                                  FAILED in 1.3s
# manager.ts も替えた状態
540 specs, 0 failures
//packages/forms/signals/test/node:test                                  PASSED in 1.2s
Chromium: |██████████████████████████████| 1/1 test files | 350 passed, 0 failed
//packages/forms/signals/test/web:test_chromium                          PASSED in 3.4s
```

- 6 節の `destroy()` は origin/main で直っています（67e50693274）。`children()` を使うほかの呼び手（`_reloadValidation`・`getBindingForFocus`）も、作られていない子には resource も束縛も無いので、`materializedChildren()` で足ります。直すなら node.ts の各関数と、spec は structure.spec.ts の同じ describe に、呼んだ後に `_areChildrenMaterialized()` が `false` のままかを見る it です。

## 聞かれそうな質問

**Q. form() を作った時点で、全部のフィールドの FieldNode ができますか？**

作った時点ではできません。子にルールが無ければ、4 節の近道で子の表は `undefined` のままです。読まれたとき（`getChild` の 164 行目）にその段だけ作ります。ただし 22.2.6 と origin/main では、`form()` が作る掃除の effect（manager.ts 84 行目の `children()`）が最初の変更検知で全部の段を作ります（7 節、#70627）。

**Q. model.set で profile のオブジェクトを丸ごと置き換えたら、f.profile は別物になりますか？**

同じものです。オブジェクトの値では子は「キー」で決まり、396 行目で前回の表に同じキーがあれば何もしません。子の `value` は `deepSignal` なので、新しい中身は読み出すときに見えます。キーが消えた（`undefined` を含む。353〜359 行目）ときだけ子が外れ、戻ると 407 行目で新しい子が作られます。

**Q. children() と materializedChildren() はどう使い分けますか？**

`children()` は 112 行目で表を作るので「全部の子に何かしたい」とき、`materializedChildren()` は作られた子だけを返すので「作られた子にしか状態が無い」処理に使います。`reset()` は後者（6 節の grep の記録の node.ts:351）、掃除の effect は前者（manager.ts 84 行目）で、そのために遅延が崩れます。

**Q. f.missing のように無いキーを読んでも、後でそのキーが現れたらテンプレートは更新されますか？**

されます。`getChild` は 184 行目で使い捨ての `reader`（427 行目の computed）を作って読むので、テンプレートはその computed を通して `childrenMap` に依存します。キーが現れて表が変わると computed が新しい子を返し、テンプレートが読み直します。

**Q. f().keyInParent() を読むと何が起きますか？**

根の `keyInParent` は 445〜447 行目で 576 行目の `ROOT_KEY_IN_PARENT` を返し、読むと NG01905「The top-level field in the form has no parent.」を投げます。

## 読み終えて

- `FieldNodeStructure` は木の位置と子の表を持つ部品。子の表 `childrenMap` は `value` を source にした `linkedSignal` で、キーごとに `reader` と `node` を持つ
- オブジェクトの値では子はキーで決まり、同じキーがある限り同じ `FieldNode` を使い回す。`undefined` のキーは無いものと同じ
- 98c5afdb021 から、ルールの無い子は `getChild` の `ensureChildrenMap` で段ごとに作る。`children()` は作り、`materializedChildren()` と `reduceChildren` は作らない
- 掃除の effect が `children()` でたどるので、最初の変更検知で全部の段が作られる（#70627、22.2.6 と origin/main でもそのまま）
- 根と子の違いは getter と constructor だけ。`destroy()` が使っていない injector を作る問題は 67e50693274 で直り、22.2.6 に入っている

---

← 前: [spec と issue を読む：サーバールートを固めているテスト](../srt/05-srt-tests-issues.md)  
次: [配列の追跡：要素が動いても同じフィールドを使う](02-sft-array-identity.md) →
