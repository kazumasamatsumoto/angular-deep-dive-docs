[目次](../README.md) › [Angular DevTools の内側](README.md) › 第 11 回 / 全 20 回

# 値を書き換える：updateState と property-mutation

> パネルで値を編集したときの updateState が、バックエンドの property-mutation.ts で道筋をたどってプロパティ（signal なら set）を書き換え、ng.applyChanges で変更検知を走らせる行。書き換えられない値の扱い。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-property-mutation)

---

パネルのプロパティの値をクリックして書き換えると、ページの中のコンポーネントの値が本当に変わり、画面も描き直されます。この章では、入力した文字が値になるところ（パネル）から、`updateState` のメッセージ、バックエンドの `mutateNestedProp` が道筋をたどって代入する（signal なら `set` する）行、最後に `ng.applyChanges` が変更検知を走らせる行までを追います。書き換えられない値が、どの行で止められるかも見ます。

読む対象は、パネル側の `shared/object-tree-explorer/property-editor/property-editor.component.ts` と `property-resolver/directive-property-resolver.ts`、バックエンド側の `directive-forest/property-mutation/property-mutation.ts`、core の `packages/core/src/render3/util/change_detection_utils.ts` です。

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
11. **11. 値を書き換える**（この章）
12. [12. 選ぶ・光らせる](12-devtools-inspector-highlight.md)
13. [13. プロファイラーの記録](13-devtools-profiler-capture.md)
14. [14. 記録を描く](14-devtools-profiler-formatters.md)
15. [15. 変更検知を見張る](15-devtools-cd-analyzer.md)
16. [16. 注入器の木](16-devtools-injector-tree.md)
17. [17. signal のグラフ](17-devtools-signal-graph.md)
18. [18. ルーター・TransferState](18-devtools-router-transfer.md)
19. [19. テストとビルド](19-devtools-test-build.md)
20. [20. issue と PR を読む](20-devtools-issues.md)

## 1. 編集できる行だけ、入力欄になる

📄 `angular/devtools/projects/ng-devtools/src/lib/shared/object-tree-explorer/object-tree-explorer.component.html` L13–26 （▶ の行: 18–19, 21, 24）

```html
13 │     <div class="prop-row non-expandable-node">
14 │       @if (!omitRootNodesNames() || node.level > 0) {
15 │         <span class="name">{{ node.prop.name }}</span
16 │         >:
17 │       }
18 ▶       @if (!node.prop.descriptor.editable || !editingEnabled()) {
19 ▶         <ng-property-preview class="value" (inspect)="propInspect.emit(node)" [node]="node" />
20 │       } @else {
21 ▶         <ng-property-editor
22 │           class="value"
23 │           [property]="node.prop"
24 ▶           (updateValue)="propValueUpdate.emit({node, newValue: $event})"
25 │         />
26 │       }
```

18 行目、Descriptor の `editable` が `false` の行は preview（表示だけ）、`true` の行は 21 行目の `ng-property-editor` になります。`editable` を決めたのは[第 9 回](09-devtools-state-serializer.md)の 4 節（String・Number・Boolean・null・undefined の葉で、読み取り専用の signal・getter・書き込み禁止でないもの）です。24 行目の `propValueUpdate` は、プロパティの欄（property-view-body）を通って `DirectivePropertyResolver.updateValue` に届きます。

📄 `angular/devtools/projects/ng-devtools/src/lib/shared/object-tree-explorer/property-editor/property-editor.component.ts` L24–38 （▶ の行: 24–25, 32, 34, 36）

```ts
24 ▶ type EditorType = string | number | boolean;
25 ▶ type EditorResult = EditorType | Array<EditorType>;
26 │ 
27 │ enum PropertyEditorState {
28 │   Read,
29 │   Write,
30 │ }
31 │ 
32 ▶ const parseValue = (value: EditorResult): EditorResult => {
33 │   try {
34 ▶     return JSON.parse(value as any) as EditorResult;
35 │   } catch {
36 ▶     return value.toString();
37 │   }
38 │ };
```

📄 `angular/devtools/projects/ng-devtools/src/lib/shared/object-tree-explorer/property-editor/property-editor.component.ts` L75–103 （▶ の行: 76–78, 82, 86, 88, 99–101）

```ts
 75 │   accept(): void {
 76 ▶     const parsed = parseValue(this.valueToSubmit()!);
 77 ▶     this.updateValue.emit(parsed);
 78 ▶     this.currentPropertyState.set(this.readState);
 79 │   }
 80 │ 
 81 │   reject(): void {
 82 ▶     this.valueToSubmit.set(this.initialValue());
 83 │     this.currentPropertyState.set(this.readState);
 84 │   }
 85 │ 
 86 ▶   onClick(): void {
 87 │     if (this.currentPropertyState() === this.readState) {
 88 ▶       this.currentPropertyState.set(this.writeState);
 89 │     }
 90 │   }
 91 │ 
 92 │   onFocus() {
 93 │     // A slight timeout is required for text selection.
 94 │     setTimeout(() => {
 95 │       this.inputEl()?.nativeElement.select();
 96 │     });
 97 │   }
 98 │ 
 99 ▶   onBlur(): void {
100 ▶     if (this.currentPropertyState() === this.writeState) {
101 ▶       this.accept();
102 │     }
103 │   }
```

1. **86〜90 行目：クリックで書く状態へ**

   コンポーネントの `host` の `(click)`（引用の外）で `onClick` が呼ばれ、入力欄が出ます。
2. **99〜103 行目：フォーカスが外れたら確定**

   テンプレートの `(keydown.enter)` で `accept`、`(keydown.escape)` で `reject` のほか、外をクリックしてフォーカスが外れても 101 行目で確定します。
3. **32〜38 行目：入力した文字を `JSON.parse` で値にする**

   `42` は数、`true` は真偽、`null` は null、`"42"` は文字列の 42 になります。`JSON.parse` が失敗した文字（`hello` など）は 36 行目でそのまま文字列です。つまり、もとが文字列の行に `42` と打つと**数**が入ります。`{"a": 1}` と打てばオブジェクトも入ります（型の 24〜25 行目には無いが、`JSON.parse` はそれを返す）。

## 2. updateState を送る

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/directive-property-resolver.ts` L125–136 （▶ の行: 126–129, 134–135）

```ts
125 │   updateValue(node: FlatNode, newValue: unknown): void {
126 ▶     const directiveId = this._directivePosition;
127 ▶     const keyPath = constructPathOfKeysToPropertyValue(node.prop);
128 ▶     this._messageBus.emit('updateState', [{directiveId, keyPath, newValue}]);
129 ▶     node.prop.descriptor.value = newValue;
130 │   }
131 │ 
132 │   logValue(node?: FlatNode): void {
133 │     const directiveId = this._directivePosition;
134 ▶     const keyPath = node ? constructPathOfKeysToPropertyValue(node.prop) : null;
135 ▶     this._messageBus.emit('logValue', [{directiveId, keyPath}]);
136 │   }
```

📄 `angular/devtools/projects/ng-devtools/src/lib/devtools-tabs/directive-explorer/property-resolver/directive-property-resolver.ts` L40–50 （▶ の行: 44–45, 47, 49）

```ts
40 │ export const constructPathOfKeysToPropertyValue = (
41 │   nodePropToGetKeysFor: Property,
42 │   keys: string[] = [],
43 │ ): string[] => {
44 ▶   keys.unshift(nodePropToGetKeysFor.name);
45 ▶   const parentNodeProp = nodePropToGetKeysFor.parent;
46 │   if (parentNodeProp) {
47 ▶     constructPathOfKeysToPropertyValue(parentNodeProp, keys);
48 │   }
49 ▶   return keys;
50 │ };
```

127 行目の `keyPath` は、[第 10 回](10-devtools-property-resolver.md)の `_toggleNode` と同じく `parent` をさかのぼって作る名前の配列です（44 行目で前に足していく）。128 行目で `updateState` を `[{directiveId, keyPath, newValue}]` で送り、129 行目で**答えを待たずに**パネルの Descriptor の `value` を書き換えます。バックエンドで書き換えが失敗しても、パネルの表示は次の頼み直し（`componentTreeDirty` のあと）まで新しい値のままです。134〜135 行目の `logValue` も同じ形で道筋を送ります（[第 12 回](12-devtools-inspector-highlight.md)）。

## 3. バックエンドの入口：updateState

`updateState` は component-tree.ts にあり（[第 5 回](05-devtools-component-tree.md)の持ち場）、ここでは 2 つの枝だけを短く引きます。その前の行は、`buildDirectiveForest()` で木を作り直し、`directiveId.element` の位置のノードを探し、見つからなければ `log.warn` して戻る行です。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/component-tree/component-tree.ts` L756–762 （▶ の行: 756–760）

```ts
756 ▶   if (node.directives && updatedStateData.directiveId.directive !== undefined) {
757 ▶     const directive = node.directives[updatedStateData.directiveId.directive].instance;
758 ▶     mutateNestedProp(directive, updatedStateData.keyPath, updatedStateData.newValue);
759 ▶     if (ngDebugApiIsSupported(ng, 'getOwningComponent')) {
760 ▶       ng.applyChanges?.(ng.getOwningComponent(directive)!);
761 │     }
762 │     return;
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/component-tree/component-tree.ts` L764–770 （▶ の行: 764–767）

```ts
764 ▶   if (node.component) {
765 ▶     const comp = node.component.instance;
766 ▶     mutateNestedProp(comp, updatedStateData.keyPath, updatedStateData.newValue);
767 ▶     ng.applyChanges?.(comp);
768 │     return;
769 │   }
770 │ };
```

ディレクティブなら 757〜758 行目でそのインスタンスを書き換え、760 行目でその持ち主のコンポーネント（`ng.getOwningComponent`）に `applyChanges`。コンポーネントなら 766〜767 行目です。`ng.applyChanges?.` の `?.` は、古い Angular で関数が無い場合の守りです。`mutateNestedProp` が投げた例外は、ここでは捕まえません（4 節）。

## 4. 道筋をたどって書き換える：mutateNestedProp

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation/property-mutation.ts` L117–152 （▶ の行: 122, 124, 127–128, 133, 139, 143–144, 150）

```ts
117 │ /** Walk the object properties and generate {@link PropertyAccess} objects. */
118 │ function* getNestedProps(
119 │   receiver: any,
120 │   keyPath: ReadonlyArray<string>,
121 │ ): Generator<PropertyAccess, void, void> {
122 ▶   const keys = Array.from(keyPath);
123 │   while (keys.length !== 0) {
124 ▶     const key = keys.shift()!;
125 │ 
126 │     // Prevent Prototype Pollution
127 ▶     if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
128 ▶       throw new AngularDevtoolsError(
129 │         `Access to property \`${key}\` is blocked for security reasons.`,
130 │       );
131 │     }
132 │ 
133 ▶     if (Array.isArray(receiver) && parseInt(key) >= receiver.length) {
134 │       throw new AngularDevtoolsError(
135 │         `Cannot access index ${key} for array of length ${receiver.length}.`,
136 │       );
137 │     }
138 │ 
139 ▶     if (!(key in receiver)) {
140 │       throw new AngularDevtoolsError(`Property \`${key}\` is not defined on the object.`);
141 │     }
142 │ 
143 ▶     const value = receiver[key];
144 ▶     yield {
145 │       receiver,
146 │       key,
147 │       value,
148 │     };
149 │ 
150 ▶     receiver = isSignal(value) ? value() : value;
151 │   }
152 │ }
```

まず `getNestedProps`（ジェネレーター）が、道筋の名前ごとに「受け手（`receiver`）・名前・値」の組を 1 つずつ出します。127〜131 行目で `__proto__`・`constructor`・`prototype` を止め、133 行目で配列の範囲の外を、139 行目で無い名前を止めます。150 行目、値が signal なら**中身を次の受け手にします**。だから signal の中のオブジェクトの名前も、同じ道筋でたどれます。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation/property-mutation.ts` L79–115 （▶ の行: 80, 82, 85–86, 89–90, 92, 94, 99, 102, 108–111, 114）

```ts
 79 │ export function mutateNestedProp(obj: any, keyPath: string[], newValue: unknown): void {
 80 ▶   if (keyPath.length === 0) throw new AngularDevtoolsError('At least one key is required.');
 81 │ 
 82 ▶   const nestedProps = Array.from(getNestedProps(obj, keyPath));
 83 │ 
 84 │   // Check for nested signals.
 85 ▶   const signalCount = nestedProps.filter((prop) => isSignal(prop.value)).length;
 86 ▶   if (signalCount > 1) throw new AngularDevtoolsError('Cannot mutate nested signals.');
 87 │ 
 88 │   // Check for a single signal.
 89 ▶   const signalIndex = nestedProps.findIndex((prop) => isSignal(prop.value));
 90 ▶   if (signalIndex !== -1) {
 91 │     const sig = nestedProps[signalIndex];
 92 ▶     const props = nestedProps.slice(signalIndex + 1);
 93 │ 
 94 ▶     if (!isWritableSignal(sig.value)) {
 95 │       const propPath = nestedProps
 96 │         .slice(0, signalIndex + 1)
 97 │         .map((prop) => prop.key)
 98 │         .join('.');
 99 ▶       throw new AngularDevtoolsError(`Cannot mutate a readonly signal at \`${propPath}\`.`);
100 │     }
101 │ 
102 ▶     sig.value.set(immutableUpdate(props, newValue));
103 │     return;
104 │   }
105 │ 
106 │   // No signals in this key path, just assign to the last receiver.
107 │   // First check to ensure there this is not a getter.
108 ▶   const finalProp = nestedProps[nestedProps.length - 1];
109 ▶   const descriptor = getInheritedPropertyDescriptor(finalProp.receiver, finalProp.key);
110 ▶   if (descriptor && descriptor.get && !descriptor.set) {
111 ▶     throw new AngularDevtoolsError(`Cannot mutate getter property: ${finalProp.key}`);
112 │   }
113 │ 
114 ▶   finalProp.receiver[finalProp.key] = newValue;
115 │ }
```

1. **85〜86 行目：道筋の上に signal が 2 つ以上あれば止める**

   signal の中に signal があると、どちらの `set` を呼ぶか決められないためです。
2. **89〜104 行目：signal が 1 つあれば、その signal に `set`**

   94 行目、`set` を持たない signal（`computed`・`input()`）は 99 行目で止めます。持っていれば、signal より先の道筋（92 行目の `props`）を `immutableUpdate` で作り直した値を、102 行目で `set` します。
3. **108〜114 行目：signal が無ければ、最後の受け手にただ代入**

   110 行目、`get` だけで `set` の無いプロパティ（getter）は止めます。setter のあるものは 114 行目の代入で setter が呼ばれます。

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation/property-mutation.ts` L154–182 （▶ の行: 160, 163, 166–169, 171–175）

```ts
154 │ /**
155 │  * Apply an immutable update assigning `newValue` to the list of properties
156 │  * provided. Generates new objects and retains existing properties while
157 │  * overwriting the specific nested property given.
158 │  */
159 │ function immutableUpdate(props: PropertyAccess[], newValue: unknown): any {
160 ▶   if (props.length === 0) return newValue;
161 │   const [prop, ...remainingProps] = props;
162 │ 
163 ▶   if (Array.isArray(prop.receiver)) {
164 │     const index = parseInt(prop.key);
165 │ 
166 ▶     return [
167 ▶       ...prop.receiver.slice(0, index),
168 ▶       immutableUpdate(remainingProps, newValue),
169 ▶       ...prop.receiver.slice(index + 1),
170 │     ];
171 ▶   } else if (typeof prop.receiver === 'object') {
172 ▶     assertSafeToImmutablyUpdate(prop.receiver);
173 ▶     return {
174 ▶       ...prop.receiver,
175 ▶       [prop.key]: immutableUpdate(remainingProps, newValue),
176 │     };
177 │   } else {
178 │     throw new AngularDevtoolsError(
179 │       `Cannot immutably update type: ${prop.receiver.constructor.name}`,
180 │     );
181 │   }
182 │ }
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation/property-mutation.ts` L202–233 （▶ の行: 204, 219–220, 225–226, 229–230）

````ts
202 │ /** Assert that a given signal is writable. */
203 │ function isWritableSignal<Value>(sig: Signal<Value>): sig is WritableSignal<Value> {
204 ▶   return 'set' in sig;
205 │ }
206 │ 
207 │ /**
208 │  * Assert that the given object may be safely updated in an immutable fashion.
209 │  *
210 │  * Objects with user-defined prototypes may not be immutably updated because they
211 │  * would lose their prototypes.
212 │  *
213 │  * ```typescript
214 │  * ({...new MyFoo()}).doSomething(); // Doesn't work.
215 │  * ```
216 │  */
217 │ function assertSafeToImmutablyUpdate(obj: {}): void {
218 │   // `new MyClass()` case.
219 ▶   if (obj.constructor !== Object) {
220 ▶     throw new AngularDevtoolsError(`Cannot immutably update type: ${obj.constructor.name}`);
221 │   }
222 │ 
223 │   // `{ get foo() { return 'foo'; } }` case.
224 │   // Need to check all inherited property descriptors, not just own descriptors.
225 ▶   for (const prop in obj) {
226 ▶     const descriptor = getInheritedPropertyDescriptor(obj, prop);
227 │     if (!descriptor) continue;
228 │ 
229 ▶     if (descriptor.get || descriptor.set) {
230 ▶       throw new AngularDevtoolsError('Cannot immutably update object with getters or setters.');
231 │     }
232 │   }
233 │ }
````

signal の中身は、そのまま書き換えると signal が「変わった」と気づきません（同じオブジェクトを `set` しても等しいとみなされる）。そこで `immutableUpdate` は、道筋の各段を**コピーして作り直します**。配列は 166〜170 行目で前後を `slice` して挟み、オブジェクトは 173〜176 行目のスプレッドです。スプレッドはプロトタイプを捨てるので、172 行目の `assertSafeToImmutablyUpdate` が、219 行目でクラスのインスタンス（`constructor !== Object`）を、225〜231 行目で getter / setter を持つオブジェクトを止めます。204 行目の `isWritableSignal` は `'set' in sig` で、第 9 回の `getContainerType`（`typeof s['set'] === 'function'`）とは書き方が違いますが、見ているものは同じです。

## 5. 変更検知を走らせる：ng.applyChanges

📄 `angular/packages/core/src/render3/util/change_detection_utils.ts` L18–43 （▶ の行: 26, 28–29, 39–42）

```ts
18 │ /**
19 │  * Marks a component for check (in case of OnPush components) and synchronously
20 │  * performs change detection on the application this component belongs to.
21 │  *
22 │  * @param component Component to {@link /api/core/ChangeDetectorRef#markForCheck mark for check}
23 │  *
24 │  * @publicApi
25 │  */
26 ▶ export function applyChanges(component: {}): void {
27 │   ngDevMode && assertDefined(component, 'component');
28 ▶   markViewDirty(getComponentViewByInstance(component), NotificationSource.DebugApplyChanges);
29 ▶   getRootComponents(component).forEach((rootComponent) => detectChanges(rootComponent));
30 │ }
31 │ 
32 │ /**
33 │  * Synchronously perform change detection on a component (and possibly its sub-components).
34 │  *
35 │  * This function triggers change detection in a synchronous way on a component.
36 │  *
37 │  * @param component The component which the change detection should be performed on.
38 │  */
39 ▶ function detectChanges(component: {}): void {
40 ▶   const view = getComponentViewByInstance(component);
41 ▶   view[FLAGS] |= LViewFlags.RefreshView;
42 ▶   detectChangesInternal(view);
43 │ }
```

1. **28 行目：そのコンポーネントの LView に印を付ける**

   `markViewDirty` は、その view から根まで「調べ直す」印を付けます（OnPush でも描き直される）。通知の出どころは `NotificationSource.DebugApplyChanges` で、zoneless のスケジューラーへの知らせ方は [zoneless-notification-source](../zoneless/02-zoneless-notification-source.md) の章が読んでいます。
2. **29 行目：根のコンポーネントごとに、その場で変更検知**

   39〜43 行目の `detectChanges` が、根の view に `RefreshView` を立てて `detectChangesInternal` を呼びます（[cd-detect-changes-in-view](../cd/02-cd-detect-changes-in-view.md)）。スケジューラーを待たずに**同期で**描き直すので、`updateState` から戻ったときには DOM が変わっています。

## 6. ここまでの呼び出し

- 👤 `値を入力してフォーカスを外す` — property-editor.component.ts 99
  - `accept()` → `parseValue` → `updateValue.emit` — property-editor.component.ts 75・32
    - `DirectivePropertyResolver.updateValue(node, newValue)` — directive-property-resolver.ts 125
      - `messageBus.emit('updateState', [{directiveId, keyPath, newValue}])` — directive-property-resolver.ts 128
        - `updateState(updatedStateData)` — component-tree.ts — *ページの中*
          - `mutateNestedProp(instance, keyPath, newValue)` — property-mutation.ts 79
            - `getNestedProps` → `sig.value.set(immutableUpdate(…))` または `receiver[key] = newValue` — property-mutation.ts 118・102・114
          - `ng.applyChanges(component)` — change\_detection\_utils.ts 26
            - `markViewDirty` → `detectChanges(root)` → `detectChangesInternal` — change\_detection\_utils.ts 28・39

> **🧪 DEMO — updateState で書き換える（記録の再生）**
>
> これは記録です。本物の devtools のソース（angular/angular の devtools/、8576f161ae4）を、本物の @angular/core 22.1.6（開発モード）のアプリにつないで Node で動かした結果です。パネルの代わりに `updateState` を送り、その前後の `app-root` の中の HTML と、`getLatestComponentExplorerView` で頼み直した 1 段目の行の Descriptor、`send` から投げられた例外を残しました。場面は上から順に同じアプリで続けて行ったものです（前の場面の書き換えが残っています）。共通の部品は[第 1 回](01-devtools-overview.md)に全文があります。
>
> パネルでは `computed`・`input()`・getter の行は入力欄にならないので（1 節）、この 3 つはパネルの代わりに送れば届く、という場面です。`label` は `input('x')` に、JIT のための `@Input({isSignal: true})` を手で付けたものです（第 9 回のデモと同じ）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/devtools-property-mutation)

> [!NOTE]
> **さらに深く**
>
> 「signal の中の null-prototype のオブジェクト」の場面は、220 行目の `obj.constructor.name` が `constructor` の無いオブジェクトで TypeError になるもので、記録の環境（Node・domino）に関係なく、この行だけで決まります。止めること自体は意図どおりで（スプレッドで作り直すとプロトタイプが `Object.prototype` に変わる）、違うのはメッセージだけです。[第 9 回](09-devtools-state-serializer.md)の d7161fd431a は表示の側の同じ形（`prop.constructor.name`）を直しましたが、書き換えの側のこの行は残っています。パネルでこの場面に入るには、signal の中のプロトタイプの無いオブジェクトの葉（数など）を編集します。

## 7. 最近の修正：道筋のたどり方を固くする（752fb476eb5）

752fb476eb5（2026-06-02、refactor「Harden props navigation」）は、`getNestedProps` に 126〜131 行目の 5 行を足しました（当時は `Error` で、いまは 1371c946aa9 が `AngularDevtoolsError` に置き換えた）。足す前は、道筋 `['foo', '__proto__', 'polluted']` の 2 段目で `receiver` が `Object.prototype` になり、最後の 114 行目の代入で**ページのすべてのオブジェクト**に `polluted` が生えるところでした（プロトタイプ汚染）。パネルの木には `__proto__` の行は出ません（[第 9 回](09-devtools-state-serializer.md)の getKeys が `__proto__` を外している）。コミットの説明は「`prototype` や `constructor` のようなプロパティへの望まない読み書きを防ぐため」で、パネルが送る道筋を信じずに、受ける側で止める形です。足した spec は下の 330〜342 行目です。

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| directive-forest/property-mutation/property-mutation.spec.ts | describe `property-mutation`（12 行目）→ `mutateNestedProp`（13）→ `without signals`（18、it 10 件）と `with signals`（131、it 18 件）。ほかに `throws when no keys are given`（14） | `//devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation:test` |

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation/property-mutation.spec.ts` L131–148 （▶ の行: 132, 135, 137, 140, 144, 146–147）

```ts
131 │     describe('with signals', () => {
132 ▶       it('updates when the last value is a signal', () => {
133 │         const obj = {foo: signal(1)};
134 │ 
135 ▶         mutateNestedProp(obj, ['foo'], 2);
136 │ 
137 ▶         expect(obj.foo()).toBe(2);
138 │       });
139 │ 
140 ▶       it('immutably updates when the last receiver is a signal', () => {
141 │         const obj = {foo: signal({bar: 1})};
142 │         const originalSignalValue = obj.foo();
143 │ 
144 ▶         mutateNestedProp(obj, ['foo', 'bar'], 2);
145 │ 
146 ▶         expect(obj.foo()).not.toBe(originalSignalValue); // Immutable update.
147 ▶         expect(obj.foo()).toEqual({bar: 2});
148 │       });
```

📄 `angular/devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation/property-mutation.spec.ts` L304–342 （▶ の行: 304, 311–312, 316, 325–326, 330, 333, 336, 339）

```ts
304 ▶       it('throws on readonly signals', () => {
305 │         const obj = {
306 │           foo: {
307 │             bar: computed(() => ({baz: 1})),
308 │           },
309 │         };
310 │ 
311 ▶         expect(() => mutateNestedProp(obj, ['foo', 'bar', 'baz'], 2)).toThrowError(
312 ▶           'Cannot mutate a readonly signal at `foo.bar`.',
313 │         );
314 │       });
315 │ 
316 ▶       it('throws on nested signals', () => {
317 │         const obj = {
318 │           foo: signal({
319 │             bar: signal({
320 │               baz: 1,
321 │             }),
322 │           }),
323 │         };
324 │ 
325 ▶         expect(() => mutateNestedProp(obj, ['foo', 'bar', 'baz'], 2)).toThrowError(
326 ▶           'Cannot mutate nested signals.',
327 │         );
328 │       });
329 │ 
330 ▶       it('throw on mutating __proto__, constructor, or prototype properties', () => {
331 │         const obj = {foo: signal({})};
332 │ 
333 ▶         expect(() => mutateNestedProp(obj, ['foo', '__proto__'], {})).toThrowError(
334 │           /Access to property `__proto__` is blocked for security reasons./,
335 │         );
336 ▶         expect(() => mutateNestedProp(obj, ['foo', 'constructor'], {})).toThrowError(
337 │           /Access to property `constructor` is blocked for security reasons./,
338 │         );
339 ▶         expect(() => mutateNestedProp(obj, ['foo', 'prototype'], {})).toThrowError(
340 │           /Access to property `prototype` is blocked for security reasons./,
341 │         );
342 │       });
```

spec は `mutateNestedProp` を直接呼び、`signal`・`computed` は本物の @angular/core のものを使います。146 行目は「`set` した値が前の値と別のオブジェクト」であること（4 節のコピー）を、311〜312 行目は 99 行目のメッセージを確かめます。null-prototype のオブジェクトの場合と、配列の `length` を書き換える場合の it はありません。`updateState`（component-tree.ts）と `applyChanges` を通す spec も、このターゲットにはありません。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation:test --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/devtools-logs/c-all.log。ほかのターゲットと一緒に走らせ、全体で 44.4 秒）`

```
//devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation:test_chromium
  Chromium: 1/1 test files | 29 passed, 0 failed   Finished running tests in 0.8s
//devtools/projects/ng-devtools-backend/src/lib/directive-forest/property-mutation:test_firefox
  Firefox: 1/1 test files | 29 passed, 0 failed    Finished running tests in 3.5s
property-mutation:test_chromium PASSED in 4.0s / property-mutation:test_firefox PASSED in 5.7s
```

29 件は、14 行目の 1 件 + `without signals` の 10 件 + `with signals` の 18 件です。

### 直すとしたら

- 「書き換えたのに画面が変わらない」は、まず 3 節の `updateState` の 760・767 行目（`applyChanges` に渡すコンポーネント）と、5 節の 28〜29 行目です。
- 「書き換えると例外」は `mutateNestedProp` と `assertSafeToImmutablyUpdate` で、spec は property-mutation.spec.ts の `with signals` に、311〜313 行目の `toThrowError('…')` の形で足します。null-prototype の場合は 219〜220 行目を `obj.constructor?.name` のように直すと、意図どおりの `AngularDevtoolsError` になります（手元で確かめるときの入口。本家の変更は勧めません）。
- パネルの側は、2 節の 129 行目が答えを待たずに表示を変えるので、失敗したことがパネルに出ません。`updateState` には答えのメッセージがありません（protocol の `Events`、[第 4 回](04-devtools-protocol.md)）。
- 本家に PR を出すことは勧めません。issue を読むときは、デモと同じ書き方（`updateState` をバックエンドへ送る）で、どの行で止まるかを手元で確かめます（[第 20 回](20-devtools-issues.md)）。

## 聞かれそうな質問

**Q. DevTools で signal の値を書き換えると、computed や effect は動きますか？**

動きます。102 行目で本物の `set` を呼ぶので、signal のグラフにとってはアプリが `set` したのと同じです。デモの「signal（WritableSignal）」で `doubled` も 10 になっています。

**Q. signal の中のオブジェクトの 1 か所だけを書き換えると、signal はどうなりますか？**

道筋のその段までを `immutableUpdate`（160〜181 行目）でコピーして作り直した新しい値を `set` します。もとのオブジェクトは変わらず、別のオブジェクトに置き換わります（spec の 146 行目）。

**Q. input() の値を DevTools で変えられないのはなぜですか？**

`input()` の signal は `set` を持たないので、パネルでは編集できない行になり（第 9 回）、メッセージを送っても 94〜99 行目で `Cannot mutate a readonly signal` になります。親から渡す値を変えたいときは、親のプロパティを書き換えます。

**Q. 書き換えたあと、なぜ OnPush のコンポーネントも描き直されるのですか？**

`applyChanges` の 28 行目の `markViewDirty` が、そのコンポーネントから根までに「調べ直す」印を付けるからです。そのうえで 29 行目が根から同期で変更検知を走らせます。

**Q. DevTools 経由でページのオブジェクトを壊せませんか？**

道筋に `__proto__`・`constructor`・`prototype` があれば 127〜131 行目で止めます（752fb476eb5）。ただし、配列の `length` のように「ふつうの名前」で意味を持つものは止めないので、デモのとおり配列を切り詰めることはできます。

## 読み終えて

- 入力した文字は `JSON.parse` で値になり、`updateState` に道筋（`keyPath`）と一緒に載る。パネルは答えを待たずに表示を変える。
- `mutateNestedProp` は道筋をたどり、signal が 1 つあればその先をコピーして `set`、無ければ最後の受け手に代入する。
- 読み取り専用の signal・getter・入れ子の signal・クラスのインスタンスのコピー・`__proto__` などは、それぞれ決まった行で例外になる。
- 最後に `ng.applyChanges` が印を付け、根から同期で変更検知を走らせる。

---

← 前: [入れ子を開く：getNestedProperties とプロパティの木](10-devtools-property-resolver.md)  
次: [要素を選ぶ・光らせる：component-inspector と highlighter](12-devtools-inspector-highlight.md) →
