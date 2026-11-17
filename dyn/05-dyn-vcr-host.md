[目次](../README.md) › [動的コンポーネント：createComponent と ViewContainerRef](README.md) › 第 5 回 / 全 6 回

# ViewContainerRef.createComponent とホストの要素の守り

> ViewContainerRef.createComponent の引数の確かめ（environmentInjector と ngModuleRef を両方渡すと開発モードだけ番号なしの ASSERTION ERROR）、injector の既定が parentInjector でアンカー自身の providers が見えないこと、index の範囲は開発モードだけで子を作ったあとに確かめること、ハイドレーションで記録の無いコンテナを許す 77f1ca08e4a。ホストの要素として script を断る修正（d7f70616a03・9f8e32616b7、NG0905）と、ホストのバインディングを本当のホストで選ぶサニタイズ（d06e3748b7b・f57d5d5c8c3）を、守りの側から読む。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dyn-vcr-host)

---

`ViewContainerRef.createComponent` が、引数をどう読み、注入器を何にし、`index` をどう扱い、ハイドレーションのときに何を探すかを追います。後半は、作ったコンポーネントのホストの要素を守る 2 つの仕組み、「`<script>` をホストにさせない」と「ホストのバインディングを、本当のホストの要素で選んだサニタイザに通す」を、守りの側から読みます。差し込みの本体（`insertImpl` と `LContainer`）は [view-container の章](../template/04-view-container.md)にあります。

読む対象は `packages/core/src/linker/view_container_ref.ts`、`packages/core/src/render3/component_ref.ts`（`assertNotScriptHostElement`）、`render3/interfaces/node.ts`、コミット d7f70616a03・9f8e32616b7・d06e3748b7b・77f1ca08e4a の差分と、`packages/core/test/acceptance/security_spec.ts`・`view_container_ref_spec.ts` です。

1. [1. 2 つの入口](01-dyn-entry-points.md)
2. [2. ComponentFactory.create の中](02-dyn-factory-create.md)
3. [3. directives の選択肢](03-dyn-directives.md)
4. [4. bindings と ComponentRef](04-dyn-bindings-ref.md)
5. **5. ViewContainerRef とホストの守り**（この章）
6. [6. spec と issue](06-dyn-tests-issues.md)

> [!NOTE]
> **ポイント**
>
> 「記録」は `@angular/core` 22.2.6 を Node（JIT と domino）で、開発モードと `ngDevMode = false` の本番の分岐で 1 回ずつ動かした結果です。ページの下のデモは、このサイトの依存（22.2.6）の本番ビルドで動きます。この章のホストの要素の守りの修正は、どれも v22.2.0 から入っていて、22.1.x にも入っています（9f8e32616b7 は v22.1.2 の 7b404567924、d06e3748b7b は v22.1.0 の 23cf1a828be として）。

## 1. 引数の形の判定と、両方の注入器

📄 `angular/packages/core/src/linker/view_container_ref.ts` L441–480 （▶ の行: 441–442, 445, 450–452, 456–457, 465, 476–478）

```ts
441 ▶     injector?: Injector | undefined,
442 ▶     projectableNodes?: any[][] | undefined,
443 │     environmentInjector?: EnvironmentInjector | NgModuleRef<any> | undefined,
444 │     directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[],
445 ▶     bindings?: Binding[],
446 │   ): ComponentRef<C> {
447 │     let index: number | undefined;
448 │     let onError: ((error: Error, context: ErrorDetails) => void) | undefined;
449 │ 
450 ▶     if (ngDevMode) {
451 ▶       assertDefined(
452 ▶         getComponentDef(componentType),
453 │         `Provided Component class doesn't contain Component definition. ` +
454 │           `Please check whether provided class has @Component decorator.`,
455 │       );
456 ▶       assertEqual(
457 ▶         typeof opts !== 'number',
458 │         true,
459 │         'It looks like Component type was provided as the first argument ' +
460 │           "and a number (representing an index at which to insert the new component's " +
461 │           'host view into this container as the second argument. This combination of arguments ' +
462 │           'is incompatible. Please use an object as the second argument instead.',
463 │       );
464 │     }
465 ▶     const options = (opts || {}) as {
466 │       index?: number;
467 │       injector?: Injector;
468 │       ngModuleRef?: NgModuleRef<unknown>;
469 │       environmentInjector?: EnvironmentInjector | NgModuleRef<unknown>;
470 │       projectableNodes?: Node[][];
471 │       directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[];
472 │       bindings?: Binding[];
473 │       onError?: (error: Error, context: ErrorDetails) => void;
474 │     };
475 │ 
476 ▶     if (ngDevMode && options.environmentInjector && options.ngModuleRef) {
477 ▶       throwError(
478 ▶         `Cannot pass both environmentInjector and ngModuleRef options to createComponent().`,
479 │       );
480 │     }
```

1. **451〜455 行目：コンポーネントの定義が無いクラス**

   `@Component` の無いクラスを渡すと、開発モードでは文で教えます（spec は「テストと直し方」の表）。
2. **456〜463 行目：昔の呼び方の名残**

   `ComponentFactory` を渡していたころは `createComponent(factory, index, injector, …)` と位置で渡していました。型を渡す形で 2 つ目に数を渡すと、昔の呼び方と取り違えたとみなして止めます。実装の 441〜445 行目に残る位置の引数（`injector`・`projectableNodes` など）は、この名残を受ける枠で、465 行目からは `options` の値で上書きします。
3. **476〜480 行目：environmentInjector と ngModuleRef を両方渡す**

   `throwError` は `util/assert.ts` の確かめ用の関数で、`RuntimeError` ではなく素の `Error` を `ASSERTION ERROR: …` という文で投げます。**NG の番号はありません**。しかも `ngDevMode` の中なので、本番では投げず、そのあとの `options.environmentInjector || options.ngModuleRef`（[ngmodule-lazy-module の章](../ngmodule/15-ngmodule-lazy-module.md)の引用）で `environmentInjector` が勝ちます。

| やったこと（記録 2） | 開発モード | 本番の分岐 |
| --- | --- | --- |
| createComponent のホストの要素の vcr に、injector を渡さずに作る | `injector を渡さない: who=なし` | `injector を渡さない: who=なし` |
| environmentInjector（WHO を provide）だけ渡す | `environmentInjector だけ渡す: who=environmentInjector` | `environmentInjector だけ渡す: who=environmentInjector` |
| environmentInjector と ngModuleRef（それぞれ WHO を provide）を両方渡す | `両方渡す → ASSERTION ERROR: Cannot pass both environmentInjector and ngModuleRef options to createComponent(). / e.code=undefined` | `両方渡す: 投げなかった。who=environmentInjector` |

子は `inject(WHO, { optional: true })` を表示するだけのコンポーネントです。3 行目、開発モードの `e.code` は `undefined` でした。この 476〜480 行目の確認を固めている spec は、`packages/core/test` の中に見つかりません（`grep -rn "Cannot pass both" packages/core/test` が 0 件）。

## 2. injector の既定は parentInjector

`injector` を渡さないとき、実装は `injector || this.parentInjector` を `ComponentFactory.create` の最初の引数にします（[standalone の imports の章](../ngmodule/13-ngmodule-standalone-imports.md)の引用）。その `parentInjector` です。

📄 `angular/packages/core/src/linker/view_container_ref.ts` L336–350 （▶ の行: 336, 338–340, 346, 348）

```ts
336 ▶   /** @deprecated No replacement */
337 │   override get parentInjector(): Injector {
338 ▶     const parentLocation = getParentInjectorLocation(this._hostTNode, this._hostLView);
339 ▶     if (hasParentInjector(parentLocation)) {
340 ▶       const parentView = getParentInjectorView(parentLocation, this._hostLView);
341 │       const injectorIndex = getParentInjectorIndex(parentLocation);
342 │       ngDevMode && assertNodeInjector(parentView, injectorIndex);
343 │       const parentTNode = parentView[TVIEW].data[
344 │         injectorIndex + NodeInjectorOffset.TNODE
345 │       ] as TElementNode;
346 ▶       return new NodeInjector(parentTNode, parentView);
347 │     } else {
348 ▶       return new NodeInjector(null, this._hostLView);
349 │     }
350 │   }
```

338 行目の `getParentInjectorLocation` は、アンカーのノード**自身ではなく**、そのいちばん近い祖先のノードの注入器の場所を返します（[NodeInjector の探し方の章](../di/11-di-node-injector-lookup.md)）。346 行目でその祖先の `NodeInjector` を作り、祖先が無ければ 348 行目でビューだけを持つ `NodeInjector` にします。336 行目のとおり `parentInjector` 自体は非推奨で、置き換えはありません。つまり、**アンカーの要素に付いたディレクティブやコンポーネントの `providers` は、既定では作った子から見えません**。

| 記録 2 の続き | 子が読んだ WHO |
| --- | --- |
| テンプレートの中の vr-inner が自分の vcr に作る（injector なし） | `テンプレートの中の vr-inner が inject(ViewContainerRef) → createComponent(Item): who=vr-outer の providers` |
| 同じ vcr に injector: inject(Injector) を渡す | `同じ vcr に injector: inject(Injector)（vr-inner の NodeInjector）を渡す: who=vr-inner の providers` |
| vcr.injector.get(WHO) / vcr.parentInjector.get(WHO) | `vcr.injector と vcr.parentInjector で WHO を読む: vr-inner の providers / vr-outer の providers` |

`<vr-outer>` のテンプレートに置いた `<vr-inner>` が、自分のコンストラクタで `inject(ViewContainerRef)` して `createComponent` すると、子が見るのは `vr-inner` の `providers` ではなく、その祖先の `vr-outer` の `providers` でした。`injector: inject(Injector)` を渡すと `vr-inner` のものになります。`vcr.injector`（アンカー自身の `NodeInjector`）と `vcr.parentInjector` を並べると違いが出ます。記録 2 の 1 行目が「なし」なのも同じ理由で、`createComponent` で作ったホストの要素はルートのビューの一番上のノードなので祖先が無く、348 行目の道でした。

📄 `angular/packages/core/test/acceptance/view_container_ref_spec.ts` L1859–1885 （▶ の行: 1861–1862, 1867, 1872–1873, 1877）

```ts
1859 │       it('should maintain connection with module injector when custom injector is provided', () => {
1860 │         const comp = fixture.componentInstance;
1861 ▶         const environmentInjector = createEnvironmentInjector(
1862 ▶           [{provide: TOKEN_B, useValue: '[TokenB - CustomValue]'}],
1863 │           TestBed.inject(EnvironmentInjector),
1864 │         );
1865 │ 
1866 │         // Use factory-less way of creating a component.
1867 ▶         comp.viewContainerRef.createComponent(ChildB, {injector: environmentInjector});
1868 │         fixture.detectChanges();
1869 │ 
1870 │         // Custom injector provides only `TOKEN_B`,
1871 │         // so `TOKEN_A` should be retrieved from the module injector.
1872 ▶         expect(getElementText(fixture.nativeElement.parentNode)).toContain(
1873 ▶           '[TokenA - Value] [TokenB - CustomValue]',
1874 │         );
1875 │ 
1876 │         // Use factory-based API to compare the output with the factory-less one.
1877 ▶         const factoryBasedChildB = createComponent(ChildB, {environmentInjector});
1878 │         fixture.detectChanges();
1879 │ 
1880 │         // Custom injector provides only `TOKEN_B`,
1881 │         // so `TOKEN_A` should be retrieved from the module injector
1882 │         expect(getElementText(fixture.nativeElement.parentNode)).toContain(
1883 │           '[TokenA - Value] [TokenB - CustomValue]',
1884 │         );
1885 │       });
```

spec の側です。1867 行目は `injector` に `EnvironmentInjector` を渡していますが、1872〜1874 行目で NgModule の `TOKEN_A` も読めています。`injector` に渡したものは要素の側の注入器として扱われ、環境の側は 1 節のあとの「`environmentInjector` が無ければ `parentInjector` から `EnvironmentInjector` を探す」行で決まるからです（[ngmodule-lazy-module](../ngmodule/15-ngmodule-lazy-module.md)、つなぎ方は[第 2 回](02-dyn-factory-create.md)）。1877 行目は同じことを関数の `createComponent` でしたものです。`onError` を渡すと、作ったビューの `ON_ERROR` に入ります（[エラーの境界の実行時の章](../err/04-err-boundary-runtime.md)）。

## 3. index：確かめるのは開発モードだけ

📄 `angular/packages/core/src/linker/view_container_ref.ts` L664–674 （▶ の行: 665–666, 668–669, 671, 673）

```ts
664 │   private _adjustIndex(index?: number, shift: number = 0) {
665 ▶     if (index == null) {
666 ▶       return this.length + shift;
667 │     }
668 ▶     if (ngDevMode) {
669 ▶       assertGreaterThan(index, -1, `ViewRef index must be positive, got ${index}`);
670 │       // +1 because it's legal to insert at the end.
671 ▶       assertLessThan(index, this.length + 1 + shift, 'index');
672 │     }
673 ▶     return index;
674 │   }
```

`index` を渡さなければ 666 行目で末尾（`length`）です。渡した数は 668〜672 行目で、開発モードのときだけ 0 以上・`length` 以下かを確かめます（671 行目の `+ 1` は「末尾の 1 つ後ろに差し込むのは正しい」の意味）。この関数を呼ぶのは `insertImpl` で、`LContainer` と `VIEW_REFS` の同じ位置に入れます（[view-container](../template/04-view-container.md)）。

| 記録 1 | 開発モード | 本番の分岐 |
| --- | --- | --- |
| 1 | `createComponent(Item, {}) → A、length=1` | `createComponent(Item, {}) → A、length=1` |
| 2 | `createComponent(Item, {index: 0}) → B、length=2` | `createComponent(Item, {index: 0}) → B、length=2` |
| 3 | `createComponent(Item, {index: 1}) → C、length=3` | `createComponent(Item, {index: 1}) → C、length=3` |
| 4 | `並び: <vr-host ng-version="22.2.6"></vr-host> B(なし) C(なし) A(なし)` | `並び: <vr-host ng-version="22.2.6"></vr-host> B(なし) C(なし) A(なし)` |
| 5 | `vcr.get(0..2): B(なし) / C(なし) / A(なし)` | `vcr.get(0..2): B(なし) / C(なし) / A(なし)` |
| 6 | `index: 9 → ASSERTION ERROR: index [Expected=> 4 < 9 <=Actual]` | `index: 9 → Cannot set properties of undefined (setting '4')` |

A を末尾、B を 0、C を 1 に作ると、並びは B・C・A です。ホストの要素（`vr-host`）が自分で `inject(ViewContainerRef)` したので、3 つはその要素の**後ろの兄弟**として並びます。6 行目、範囲外の 9 は開発モードでは `ASSERTION ERROR`（番号なし）、本番の分岐では `TypeError` でした。

📄 `記録（22.2.6）：範囲外の index で作った子のその後`

```
// 開発モード
Item の constructor
投げた: ASSERTION ERROR: index [Expected=> 1 < 5 <=Actual]
vcr.length=0 / box の中=<ip-host ng-version="22.2.6"></ip-host>
Host を destroy した
app を destroy した
// 本番の分岐（ngDevMode = false）
Item の constructor
投げた: Cannot set properties of undefined (setting '4')
vcr.length=0 / box の中=<ip-host ng-version="22.2.6"></ip-host>
Host を destroy した
app を destroy した
```

`index` を確かめるのは `insertImpl` の中、つまり `componentFactory.create` が子を**作り終わったあと**です。投げたあと、作られた子は `ComponentRef` がどこにも返らないので、ホストやアプリを壊しても `DestroyRef.onDestroy` が呼ばれませんでした。また、`ApplicationRef.attachView` 済みのビューを ViewContainer に入れようとすると `NG0902` です（[第 4 回](04-dyn-bindings-ref.md)の `attachToViewContainerRef`）。

## 4. ハイドレーション：動的なビューを探す行（77f1ca08e4a）

`createComponent` は、作る前に `findMatchingDehydratedView(this._lContainer, componentDef.id)` で、サーバーが描いたビューのうち同じコンポーネントのものを探し、見つかればその最初のノードを `rootSelectorOrNode` として渡して「作る」代わりに「拾う」をします（探し方は [ハイドレーションのコンテナの章](../platform/11-hydration-containers.md)）。探す前提として、`LContainer` を作るときにサーバーの記録（`CONTAINERS`）から、そのコンテナの脱水されたビューの一覧を読みます。

📄 `git show 77f1ca08e4a -- packages/core/src/linker/view_container_ref.ts（PR #68041、2026-04）`

```
# 77f1ca08e4a 2026-04-05 fix(core): handle missing serialized container hydration data
--- a/packages/core/src/linker/view_container_ref.ts
+++ b/packages/core/src/linker/view_container_ref.ts
@@ -773,16 +773,23 @@ function populateDehydratedViewsInLContainerImpl(
   const currentRNode: RNode | null = getSegmentHead(hydrationInfo, noOffsetIndex);
 
   const serializedViews = hydrationInfo.data[CONTAINERS]?.[noOffsetIndex];
-  ngDevMode &&
-    assertDefined(
-      serializedViews,
-      'Unexpected state: no hydration info available for a given TNode, ' +
-        'which represents a view container.',
-    );
+  if (serializedViews === undefined) {
+    ngDevMode &&
+      console.warn(
+        'Unexpected state: no hydration info available for a given TNode, ' +
+          'which represents a view container.',
+      );
+
+    // This ViewContainerRef was created for an element through a query
+    // (for example `viewChild(..., {read: ViewContainerRef})`) and there
+    // is no corresponding serialized container data in hydration metadata.
+    // Fall back to creation mode and insert an anchor on demand.
+    return false;
+  }
 
   const [commentNode, dehydratedViews] = locateDehydratedViewsInContainer(
     currentRNode!,
-    serializedViews!,
+    serializedViews,
   );
 
   if (ngDevMode) {
```

1. **直す前：記録が無ければ開発モードで投げる**

   issue #68014（2026-04）の報告は、`viewChild('vcr', { read: ViewContainerRef })` で取った ViewContainerRef にハイドレーションの有効なページで差し込むと、`ASSERTION ERROR: Unexpected state: no hydration info available …` になる、というものでした。差分のコメントのとおり、クエリで要素から作った ViewContainerRef には、ハイドレーションの記録（`CONTAINERS`）に対応するコンテナのデータが無いことがあります。
2. **直したあと：警告して、作る道に戻る**

   `serializedViews === undefined` なら開発モードで `console.warn` を出し、`false`（脱水されたビューは無い）を返します。呼んだ側はアンカーを作る普通の道を通ります。足された spec は `query_spec.ts` の `it('should not throw when hydration metadata has no serialized container data')` で、警告の文を確かめています。この修正は v22.0.0 と v21.2.8 から入っています。

関数の `createComponent` のほうは事情が違います。開いている #61231（2025-05）は「`createComponent` で作ったものが、クライアントで作り直されて二重になる」という報告で、返事は「`createComponent` は常にルートのコンポーネントを作るので、シリアライズするデータが無い。今はこの形はハイドレーションと両立しない」でした。ルートのビューの `retrieveHydrationInfo(hostElement, …, true)` の道は[第 2 回](02-dyn-factory-create.md)にあります。

## 5. ホストの要素の守り：&lt;script&gt; を断る

📄 `angular/packages/core/src/render3/component_ref.ts` L337–350 （▶ の行: 340–343）

```ts
337 │     );
338 │ 
339 │     const hostRenderer = environment.rendererFactory.createRenderer(null, cmpDef);
340 ▶     const hostElement = rootSelectorOrNode
341 ▶       ? locateHostElement(hostRenderer, rootSelectorOrNode, cmpDef.encapsulation, rootViewInjector)
342 ▶       : createHostElement(cmpDef, hostRenderer, hostElementNamespace ?? null);
343 ▶     assertNotScriptHostElement(hostElement);
344 │ 
345 │     const sharedStylesHost = rootViewInjector.get(SHARED_STYLES_HOST, null);
346 │     const styleHost = getStyleHost(
347 │       hostElement,
348 │       () => rootViewInjector.get(DOCUMENT, null) ?? getDocument(),
349 │     );
350 │     if (sharedStylesHost) sharedStylesHost.addHost(styleHost);
```

📄 `angular/packages/core/src/render3/component_ref.ts` L195–207 （▶ の行: 196–199, 201–204）

```ts
195 │ function assertNotScriptHostElement(element: RElement | null | undefined): void {
196 ▶   const elementName =
197 ▶     element && 'localName' in element && typeof element.localName === 'string'
198 ▶       ? element.localName
199 ▶       : element?.tagName;
200 │ 
201 ▶   if (elementName?.toLowerCase() === 'script') {
202 ▶     throw new RuntimeError(
203 ▶       RuntimeErrorCode.UNSAFE_VALUE_IN_SCRIPT,
204 ▶       ngDevMode && `"<script>" tag is not allowed as a component host element.`,
205 │     );
206 │   }
207 │ }
```

1. **343 行目：ホストの要素が決まった直後に 1 回だけ**

   340〜342 行目で、渡された要素を使う（`locateHostElement`）か、セレクタから作る（`createHostElement`）かが決まり、その結果を 343 行目で確かめます。`ViewContainerRef.createComponent`・関数の `createComponent`・`ApplicationRef.bootstrap` は、どれも `ComponentFactory.create` を通るので、ここを通らずにホストの要素を決める道はありません。
2. **196〜201 行目：名前空間に左右されない名前で比べる**

   要素の `localName`（接頭辞と名前空間を除いた名前）があればそれを、無ければ `tagName` を小文字にして `'script'` と比べます。HTML の `script` も SVG の名前空間の `script` も同じ名前になります。
3. **202〜205 行目：NG0905**

   `RuntimeErrorCode.UNSAFE_VALUE_IN_SCRIPT` は 905 です。204 行目の文は開発モードだけで、本番では `NG0905` の番号だけになります。`RuntimeError` なので、`e.code` に 905 が入ります（記録 3）。

📄 `git show d7f70616a03（2026-06）-- component_ref.ts と instructions/shared.ts`

```ts
# d7f70616a03 2026-06-28 fix(core): reject dynamic script host elements
--- a/packages/core/src/render3/component_ref.ts
+++ b/packages/core/src/render3/component_ref.ts
@@ -183,6 +183,15 @@ function createHostElement(componentDef: ComponentDef<unknown>, renderer: Render
   return createElementNode(renderer, tagName, namespace);
 }
 
+function assertNotScriptHostElement(tagName: string | null | undefined): void {
+  if (tagName?.toLowerCase() === 'script') {
+    throw new RuntimeError(
+      RuntimeErrorCode.UNSAFE_VALUE_IN_SCRIPT,
+      ngDevMode && `"<script>" tag is not allowed as a component host element.`,
+    );
+  }
+}
+
 /**
  * Infers the tag name that should be used for a component based on its definition.
  * @param componentDef Definition for which to resolve the tag name.
@@ -303,6 +312,7 @@ export class ComponentFactory<T> {
     const hostElement = rootSelectorOrNode
       ? locateHostElement(hostRenderer, rootSelectorOrNode, cmpDef.encapsulation, rootViewInjector)
       : createHostElement(cmpDef, hostRenderer);
+    assertNotScriptHostElement(hostElement?.tagName);
 
     const sharedStylesHost = rootViewInjector.get(SHARED_STYLES_HOST, null);
     const styleHost = getStyleHost(
--- a/packages/core/src/render3/instructions/shared.ts
+++ b/packages/core/src/render3/instructions/shared.ts
@@ -181,12 +180,6 @@ export function locateHostElement(
     encapsulation === ViewEncapsulation.ShadowDom ||
     encapsulation === ViewEncapsulation.ExperimentalIsolatedShadowDom;
   const rootElement = renderer.selectRootElement(elementOrSelector, preserveContent);
-  if (rootElement.tagName.toLowerCase() === 'script') {
-    throw new RuntimeError(
-      RuntimeErrorCode.UNSAFE_VALUE_IN_SCRIPT,
-      ngDevMode && `"<script>" tag is not allowed as a component host element.`,
-    );
-  }
   applyRootElementTransform(rootElement as HTMLElement);
   return rootElement;
 }
```

d7f70616a03 の本文によると、以前の修正（GHSA-692r-grfm-v8x7）は `locateHostElement` の中、つまり「要素を渡された」道でだけ確かめていました。セレクタから要素を作る道（`createHostElement`）は通らないので、確かめる場所を「どちらの道でもホストが決まったあと」の `ComponentFactory` に移しています。差分の下半分が、`shared.ts` から消えた前の行です。

📄 `git show 9f8e32616b7（2026-08）-- component_ref.ts`

```ts
# 9f8e32616b7 2026-08-08 fix(core): reject prefixed SVG script hosts
--- a/packages/core/src/render3/component_ref.ts
+++ b/packages/core/src/render3/component_ref.ts
@@ -184,8 +184,13 @@ function createHostElement(componentDef: ComponentDef<unknown>, renderer: Render
   return createElementNode(renderer, tagName, namespace);
 }
 
-function assertNotScriptHostElement(tagName: string | null | undefined): void {
-  if (tagName?.toLowerCase() === 'script') {
+function assertNotScriptHostElement(element: RElement | null | undefined): void {
+  const elementName =
+    element && 'localName' in element && typeof element.localName === 'string'
+      ? element.localName
+      : element?.tagName;
+
+  if (elementName?.toLowerCase() === 'script') {
     throw new RuntimeError(
       RuntimeErrorCode.UNSAFE_VALUE_IN_SCRIPT,
       ngDevMode && `"<script>" tag is not allowed as a component host element.`,
@@ -313,7 +318,7 @@ export class ComponentFactory<T> {
     const hostElement = rootSelectorOrNode
       ? locateHostElement(hostRenderer, rootSelectorOrNode, cmpDef.encapsulation, rootViewInjector)
       : createHostElement(cmpDef, hostRenderer);
-    assertNotScriptHostElement(hostElement?.tagName);
+    assertNotScriptHostElement(hostElement);
 
     const sharedStylesHost = rootViewInjector.get(SHARED_STYLES_HOST, null);
     const styleHost = getStyleHost(
```

9f8e32616b7 は、比べる名前を `tagName` から `localName` にしました。名前空間の要素では `tagName` に接頭辞が付くことがあり、`localName` はいつも名前だけだからです。引数も名前の文字列から要素そのものに変わっています。

📄 `angular/packages/core/test/acceptance/security_spec.ts` L1267–1302 （▶ の行: 1267–1268, 1270, 1277–1278, 1281, 1288, 1296, 1298）

```ts
1267 ▶ describe('Component host element validation', () => {
1268 ▶   it('should throw an error when dynamically creating a component with a script selector', () => {
1269 │     @Component({
1270 ▶       selector: 'script',
1271 │       template: '',
1272 │     })
1273 │     class ScriptHost {}
1274 │ 
1275 │     const environmentInjector = TestBed.inject(EnvironmentInjector);
1276 │     expect(() => {
1277 ▶       createComponent(ScriptHost, {environmentInjector});
1278 ▶     }).toThrowError(/"<script>" tag is not allowed as a component host element/);
1279 │   });
1280 │ 
1281 ▶   it('should throw an error when dynamically mounting a component onto a script tag', () => {
1282 │     @Component({
1283 │       selector: 'my-sink',
1284 │       template: '',
1285 │     })
1286 │     class MySink {}
1287 │ 
1288 ▶     const scriptHost = document.createElement('script');
1289 │     document.head.appendChild(scriptHost);
1290 │ 
1291 │     try {
1292 │       const environmentInjector = TestBed.inject(EnvironmentInjector);
1293 │       expect(() => {
1294 │         createComponent(MySink, {
1295 │           environmentInjector,
1296 ▶           hostElement: scriptHost,
1297 │         });
1298 ▶       }).toThrowError(/"<script>" tag is not allowed as a component host element/);
1299 │     } finally {
1300 │       scriptHost.remove();
1301 │     }
1302 │   });
```

📄 `angular/packages/core/test/acceptance/security_spec.ts` L1327–1344 （▶ の行: 1327, 1334, 1336–1337, 1341, 1343）

```ts
1327 ▶   it('should reject a prefixed SVG script host element', () => {
1328 │     @Component({
1329 │       selector: 'my-prefixed-svg-script-host',
1330 │       template: '',
1331 │     })
1332 │     class MyPrefixedSvgScriptHost {}
1333 │ 
1334 ▶     const host = document.createElementNS(SVG_NAMESPACE_URI, 'x:script');
1335 │ 
1336 ▶     expect(host.tagName).toBe('x:script');
1337 ▶     expect(host.localName).toBe('script');
1338 │     expect(() =>
1339 │       createComponent(MyPrefixedSvgScriptHost, {
1340 │         environmentInjector: TestBed.inject(EnvironmentInjector),
1341 ▶         hostElement: host,
1342 │       }),
1343 ▶     ).toThrowError(/"<script>" tag is not allowed as a component host element/);
1344 │   });
```

`describe('Component host element validation')`（:1267）の 4 本です。1268 行目がセレクタから作る道（d7f70616a03 が足した）、1281 行目が要素を渡す道、間の :1304 が SVG の名前空間の `script`、1327 行目が 9f8e32616b7 の足した接頭辞付きの形です。1336〜1337 行目で「`tagName` と `localName` が違う要素であること」を先に確かめてから、1343 行目で同じ文で投げることを見ています。

| 記録 3（22.2.6） | 開発モード | 本番の分岐 |
| --- | --- | --- |
| 1 | `hostElement: document.createElement("script"): code=905 NG0905: "<script>" tag is not allowed as a component host element.` | `hostElement: document.createElement("script"): code=905 NG0905` |
| 2 | `selector が script のコンポーネント: code=905 NG0905: "<script>" tag is not allowed as a component host element.` | `selector が script のコンポーネント: code=905 NG0905` |
| 3 | ` （要素の tagName=x:script / localName=script）` | ` （要素の tagName=x:script / localName=script）` |
| 4 | `hostElement: SVG の名前空間の script（接頭辞付き）: code=905 NG0905: "<script>" tag is not allowed as a component host element.` | `hostElement: SVG の名前空間の script（接頭辞付き）: code=905 NG0905` |
| 5 | `ViewContainerRef.createComponent(selector が script): code=905 NG0905: "<script>" tag is not allowed as a component host element.` | `ViewContainerRef.createComponent(selector が script): code=905 NG0905` |
| 6 | `このあと vcr.length=0` | `このあと vcr.length=0` |

4 つとも `code=905` で、最後の行の `vcr.length=0` のとおり、`ViewContainerRef` の側にも何も残りません。投げるのが `createLView` より前なので、ビューが登録される前に止まります。

> [!NOTE]
> **ポイント**
>
> セキュリティの修正の読み方、報告の流れ（`SECURITY.md` と Google の VRP）は [DOM と描画のシリーズの issue の章](../domr/20-domr-issues.md)と [サニタイズの章](../domr/17-domr-sanitization.md)にあります。この章では、何が断られ、どの行で断り、どの spec が固めているかだけを書いています。

## 6. ホストのバインディングを、本当のホストで選ぶ（d06e3748b7b・f57d5d5c8c3）

ディレクティブの `host: { '[attr.href]': 'v' }` のようなホストのバインディングは、コンパイルのときにはどの要素に付くか分かりません。`createComponent` の `directives` や `hostElement` を使うと、宣言したセレクタとは別の要素に付くこともあります。issue #69550（2026-06）はこの食い違いの報告で、d06e3748b7b（#69558）で直りました。

📄 `git show d06e3748b7b -- packages/core/src/render3/component_ref.ts（2 つ目のハンク）`

```
# d06e3748b7b 2026-06-30 fix(core): sanitize host bindings on concrete hosts (#69558)
--- a/packages/core/src/render3/component_ref.ts
+++ b/packages/core/src/render3/component_ref.ts
@@ -369,7 +370,7 @@ export class ComponentFactory<T> {
         HEADER_OFFSET,
         rootLView,
         TNodeType.Element,
-        '#host',
+        TNodeName.DynamicHost,
         () => rootTView.directiveRegistry,
         true,
         0,
```

📄 `angular/packages/core/src/render3/interfaces/node.ts` L16–25 （▶ の行: 19–21, 23–24）

```ts
16 │ import {RNode} from './renderer_dom';
17 │ import type {LView, TView} from './view';
18 │ 
19 ▶ /**
20 ▶  * Internal tag name used for a root host `TNode` when Angular creates a component against an
21 ▶  * existing host element. The concrete DOM tag is resolved from the native element at runtime.
22 │  */
23 ▶ export const enum TNodeName {
24 ▶   DynamicHost = '#host',
25 │ }
```

動的に作るコンポーネントのホストの `TNode` の名前は、前から `'#host'` という印でした。d06e3748b7b はそれに `TNodeName.DynamicHost` という名前を付け（23〜24 行目）、サニタイズの側で「名前が `#host` なら、本当の要素の `tagName` を読み直す」ようにしました。f57d5d5c8c3 で名前空間（`namespaceURI`）も読み直すようになっています。読み直す関数 `resolveElement` と、URL と Resource URL の選び分けは [サニタイズの章](../domr/17-domr-sanitization.md)で引用しています。

📄 `angular/packages/core/test/acceptance/security_spec.ts` L925–959 （▶ の行: 925–927, 939–940, 942, 944, 951–952, 955）

```ts
925 ▶     const hostElement = namespace
926 ▶       ? document.createElementNS(namespace, tagName)
927 ▶       : document.createElement(tagName);
928 │ 
929 │     let componentRef: ComponentRef<DynamicComponent> | undefined;
930 │ 
931 │     @Component({
932 │       template: '',
933 │     })
934 │     class AppHost {
935 │       private appRef = inject(ApplicationRef);
936 │       private environmentInjector = inject(EnvironmentInjector);
937 │ 
938 │       constructor() {
939 ▶         componentRef = createComponent(DynamicComponent, {
940 ▶           hostElement,
941 │           environmentInjector: this.environmentInjector,
942 ▶           directives: [CarrierDirective],
943 │         });
944 ▶         this.appRef.attachView(componentRef.hostView);
945 │       }
946 │     }
947 │ 
948 │     const fixture = TestBed.createComponent(AppHost);
949 │ 
950 │     try {
951 ▶       if (expectedError) {
952 ▶         await expectAsync(fixture.whenStable()).toBeRejectedWithError(expectedError);
953 │       } else {
954 │         await fixture.whenStable();
955 ▶         expect(hostElement.getAttribute(attrName)).toBe(expected ?? null);
956 │       }
957 │     } finally {
958 │       componentRef?.destroy();
959 │     }
```

`describe('host binding sanitization')`（:882）の共通の関数 `expectHostBinding` です。925〜927 行目で、名前空間を指定できるホストの要素を作り、939〜943 行目でホストのバインディングを持つディレクティブを `directives` で当てて作り、955 行目で属性の値を見ます。この describe の中でこの関数は 18 回呼ばれ、要素・属性・名前空間の組み合わせを変えています（`directives` ではなく ViewContainerRef や host directive を使う it は別の形で書いてあります）。同じことを記録した結果です。

| 記録 4（22.2.6、開発モード） |
| --- |
| `hostElement が <a>: href="unsafe:javascript:void(0)"` |
| `hostElement が <div>: href="javascript:void(0)"` |

同じディレクティブでも、ホストが `<a>` なら `href` は URL の文脈なので `unsafe:` が付き、`<div>` の `href` は文脈が無いので、そのままです。

## ここまでの呼び出し

- 👤 `vcr.createComponent(Cmp, { index, injector, environmentInjector, bindings })` — あなたのコード
  - 開発モードの確かめ（定義・位置の引数・両方の注入器） — view\_container\_ref.ts L450〜480 — *番号なしの ASSERTION ERROR*
  - `injector || this.parentInjector` — view\_container\_ref.ts L337 — *アンカーの祖先の NodeInjector*
  - `findMatchingDehydratedView(lContainer, componentDef.id)` — hydration/views.ts — *ハイドレーションのときだけ*
  - `componentFactory.create(...)` — component\_ref.ts — *第 2 回*
    - `locateHostElement` / `createHostElement` → `assertNotScriptHostElement` — component\_ref.ts L343・L195 — *NG0905*
    - ホストの TNode は `TNodeName.DynamicHost` — interfaces/node.ts L23 — *サニタイズで本当の要素を読み直す*
  - `insertImpl(hostView, index)` → `_adjustIndex(index)` — view\_container\_ref.ts L664 — *範囲は開発モードだけ*

## DEMO：ViewContainerRef に作る・注入器・script のホスト

> **🧪 DEMO — この章の ViewContainerRef に VhItem を作る**
>
> 下の破線の枠の中の `<ng-container>` が ViewContainer のアンカーで、そこには `WHO` を provide するディレクティブ `vhAnchor` が付いています。作った子は、読めた `WHO` を表示します。index は今の長さまでしか選べないようにしてあります（3 節の範囲外は、作った子が残ってしまうため）。
>
> vcr.get(0..n) の順: `（空）`
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dyn-vcr-host)

「渡さない」で作ると `WHO` は「なし」、`injector: vcr.injector` ならアンカーの `vhAnchor` の値になります（2 節）。「両方」は本番ビルドなので投げず、`environmentInjector` の値が出ます（1 節の右の列）。script の 3 つは、どれも `code=905` で断られ、要素は document に付いていないので何も残りません。

## テストと直し方

| ファイル | describe / it（行） | この章のどこ |
| --- | --- | --- |
| view\_container\_ref\_spec.ts | `ViewContainerRef` :54 › `createComponent` :1446 › `createComponent using Type` :1787 の `should maintain connection with module injector when custom injector is provided` :1859・`should throw if class without @Component decorator …` :1887 | 1・2 節 |
| view\_container\_ref\_spec.ts | `` `options` argument handling `` :2035 の ``should take provided `options` arguments into account`` :2041（`index: 0` で前に入る） | 3 節 |
| view\_container\_ref\_spec.ts | `create` :90 › `element namespaces` :240 の 4 本（2ab5ff56ded の 2 本を含む） | [第 2 回](02-dyn-factory-create.md) |
| query\_spec.ts | `should not throw when hydration metadata has no serialized container data` :1829 | 4 節 |
| security\_spec.ts | `Component host element validation` :1267 の 4 本 | 5 節 |
| security\_spec.ts | `host binding sanitization` :882 の 18 本（`expectHostBinding` :889） | 6 節 |

📄 `ターミナル`

```
cd ~/angular-research/angular
for f in "^ViewContainerRef createComponent" "^Component host element validation" \
         "^host binding sanitization" "^ViewContainerRef create element namespaces"; do
  pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results \
    --test_output=all "--test_arg=--filter=$f"
done
```

📄 `出力（抜粋。2026-11-15 に実行）`

```
Ran 15 of 2693 specs
15 specs, 0 failures
Ran 4 of 2693 specs
4 specs, 0 failures
Ran 18 of 2693 specs
18 specs, 0 failures
Ran 4 of 2693 specs
4 specs, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.3s（4 回とも PASSED）
```

1. **走らせた数**

   `^host binding sanitization` の 18 本は、882〜1266 行目の `it(` の数と同じです。出力の途中に `ERROR RuntimeError: NG0904 …` や `NG0910` が出ますが、`expectedError` を渡した it が、わざと起こしたエラーを `ErrorHandler` が console に書いたもので、失敗ではありません（`18 specs, 0 failures`）。
2. **直すとしたら**

   引数・注入器・index は `view_container_ref.ts` の `R3ViewContainerRef.createComponent` と `_adjustIndex`、spec は `view_container_ref_spec.ts` の `createComponent using Type`（:1787）に足します。1 節の「両方の注入器」の確認と、3 節の「範囲外の index のあとに残る子」には、今は it がありません。ホストの要素の確かめは `component_ref.ts` の `assertNotScriptHostElement` と `security_spec.ts` の `Component host element validation`、サニタイズは `sanitization.ts` の `resolveElement` と `host binding sanitization` の `expectHostBinding` の形です。

## 聞かれそうな質問

**Q. ViewContainerRef.createComponent で、アンカーの要素のディレクティブの providers が inject できません。**

既定の注入器が `parentInjector` だからです。view\_container\_ref.ts 338 行目の `getParentInjectorLocation` はアンカーの祖先の注入器を返すので、アンカー自身の `providers` は入りません。`injector: vcr.injector` か、そのディレクティブの中で `inject(Injector)` したものを渡します（2 節の記録）。

**Q. environmentInjector と ngModuleRef を両方渡すとエラーになりますか？**

開発モードでだけ、476〜480 行目の `throwError` で `ASSERTION ERROR: Cannot pass both …` を投げます。番号は無く、`e.code` は `undefined` です。本番では投げずに `environmentInjector` が使われます。どちらか一方にします。

**Q. index に length より大きい数を渡すと？**

範囲を確かめるのは view\_container\_ref.ts 668〜672 行目の開発モードだけです。記録では、開発モードは `ASSERTION ERROR`、本番の分岐は `TypeError` で、どちらも子はもう作られていて、あとで `onDestroy` が呼ばれませんでした（3 節）。渡す前に `vcr.length` と比べます。

**Q. &lt;script&gt; の要素をホストにすると、どこで止まりますか？**

`ComponentFactory.createComponentRef` がホストの要素を決めた直後、component\_ref.ts 343 行目の `assertNotScriptHostElement` です。要素を渡しても、セレクタから作っても、SVG の名前空間でも、196〜201 行目の `localName` の比較で `NG0905` になります。ビューを作る前なので、何も残りません。

**Q. 動的なコンポーネントのホストのバインディングは、何の要素としてサニタイズされますか？**

本当のホストの要素です。ホストの `TNode` の名前は node.ts 24 行目の `'#host'`（`TNodeName.DynamicHost`）で、サニタイズの側がこれを見て、要素の `tagName` と名前空間を読み直します（d06e3748b7b・f57d5d5c8c3）。同じディレクティブでも `<a>` なら `unsafe:` が付き、`<div>` なら付きません（6 節の記録）。

## 読み終えて

- 引数の確かめ（定義・昔の位置の引数・両方の注入器）は開発モードだけで、番号の無い `ASSERTION ERROR`。本番では `environmentInjector` が勝つ
- `injector` の既定は `parentInjector`。アンカー自身の `providers` は見えない
- `index` の範囲も開発モードだけで、確かめるのは子を作ったあと
- ホストの要素は、どの入口でもホストが決まった直後に `localName` で `script` かを確かめ、`NG0905` で断る
- ホストのバインディングは `#host` の印を手がかりに、本当のホストの要素と名前空間でサニタイザを選ぶ

---

← 前: [bindings と ComponentRef：作ったあとの入力・出力・破棄](04-dyn-bindings-ref.md)  
次: [spec と issue を読む：動的コンポーネントを固めているテスト](06-dyn-tests-issues.md) →
