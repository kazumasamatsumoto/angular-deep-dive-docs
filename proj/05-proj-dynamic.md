[目次](../README.md) › [ng-content と投影の内側](README.md) › 第 5 回 / 全 6 回

# 動的な投影：createComponent の projectableNodes と、よくある誤解

> createComponent や ViewContainerRef.createComponent に渡す projectableNodes が、セレクタで照合されず番号のまま枠に入る行（component\_ref.ts の projectNodes）。同じ枠の ng-content を 2 回書いたときの 3 通りの結果（最後のワイルドカード・最初のセレクタ・最後に描いた行）、@if で ng-content を切り替えても中身は作り直されず壊れないこと、条件つきで作りたいときに ng-template と ngTemplateOutlet を使う理由を、ページの上の本物で確かめる。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/proj-dynamic)

---

この章では、テンプレートを通らない投影と、投影についてよく言われる 3 つの誤解を、行とページの上の本物で確かめます。分かることは 3 つです。`createComponent` に渡す `projectableNodes` は、セレクタで照合されず、配列の番号がそのまま枠の番号になること。同じ枠の ng-content を 2 回書いたときの結果は、書き方によって「最後のワイルドカード」「最初のセレクタ」「最後に描いた方」の 3 通りに分かれること。`@if` で ng-content を隠しても中身は作り直されず、条件で作りたいなら `ng-template` を渡すことです。

読むファイルは `packages/core/src/render3/component.ts`（`createComponent`）、`linker/view_container_ref.ts`（`ViewContainerRef.createComponent`）、`render3/component_ref.ts`、`render3/node_manipulation.ts`（`getFirstNativeNode`）です。描画の道（`ɵɵprojection`・`applyNodes`・`applyProjectionRecursive`）は[第 4 回](04-proj-render.md)、振り分けは[第 3 回](03-proj-distribute.md)で読んだものを使います。

1. [1. 1 行の ng-content が生むもの](01-proj-what-declared.md)
2. [2. コンパイラの側](02-proj-compile.md)
3. [3. 振り分け](03-proj-distribute.md)
4. [4. 描画と再投影](04-proj-render.md)
5. **5. 動的な投影とよくある誤解**（この章）
6. [6. spec と issue](06-proj-tests-issues.md)

## 1. projectableNodes：枠ごとの DOM ノードの配列

📄 `angular/packages/core/src/render3/component.ts` L65–85 （▶ の行: 73–77）

```ts
65 │  * @param component Component class reference.
66 │  * @param options Set of options to use:
67 │  *  * `environmentInjector`: An `EnvironmentInjector` instance to be used for the component.
68 │  *  * `hostElement` (optional): A DOM node that should act as a host node for the component. If not
69 │  * provided, Angular creates one based on the tag name used in the component selector (and falls
70 │  * back to using `div` if selector doesn't have tag name info).
71 │  *  * `elementInjector` (optional): An `ElementInjector` instance, see additional info about it
72 │  * [here](guide/di/hierarchical-dependency-injection#elementinjector).
73 ▶  *  * `projectableNodes` (optional): A list of DOM nodes that should be projected through
74 ▶  * [`<ng-content>`](api/core/ng-content) of the new component instance, e.g.,
75 ▶  * `[[element1, element2]]`: projects `element1` and `element2` into the same `<ng-content>`.
76 ▶  * `[[element1, element2], [element3]]`: projects `element1` and `element2` into one `<ng-content>`,
77 ▶  * and `element3` into a separate `<ng-content>`.
78 │  *  * `directives` (optional): Directives that should be applied to the component.
79 │  *  * `bindings` (optional): Bindings to apply to the root component.
80 │  *  * `onError` (optional): A callback that will be invoked when an error occurs during the component's change detection or lifecycle hooks.
81 │  *                        Note that this will not catch errors thrown during the component's construction.
82 │  * @returns ComponentRef instance that represents a given Component.
83 │  *
84 │  * @see [Host view using `ViewContainerRef.createComponent`](guide/components/programmatic-rendering#host-view-using-viewcontainerrefcreatecomponent)
85 │  * @see [Popup attached to `document.body` with `createComponent` + `hostElement`](guide/components/programmatic-rendering#popup-attached-to-documentbody-with-createcomponent--hostelement)
```

公開の `createComponent` の説明です。73〜77 行目のとおり、`projectableNodes` は「ng-content ごとの DOM ノードの配列」の配列です。`[[el1, el2], [el3]]` なら el1・el2 が 1 つ目の ng-content に、el3 が 2 つ目に入ります。`ViewContainerRef` の側にも同じ口があります。

📄 `angular/packages/core/src/linker/view_container_ref.ts` L417–446 （▶ の行: 417, 422, 429, 436, 442）

```ts
417 ▶   override createComponent<C>(
418 │     componentType: Type<C>,
419 │     options?: {
420 │       index?: number;
421 │       injector?: Injector;
422 ▶       projectableNodes?: Node[][];
423 │       ngModuleRef?: NgModuleRef<unknown>;
424 │       directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[];
425 │       bindings?: Binding[];
426 │       onError?: (error: Error, context: ErrorDetails) => void;
427 │     },
428 │   ): ComponentRef<C>;
429 ▶   override createComponent<C>(
430 │     componentType: Type<C>,
431 │     opts?: {
432 │       index?: number;
433 │       injector?: Injector;
434 │       ngModuleRef?: NgModuleRef<unknown>;
435 │       environmentInjector?: EnvironmentInjector | NgModuleRef<unknown>;
436 ▶       projectableNodes?: Node[][];
437 │       directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[];
438 │       bindings?: Binding[];
439 │       onError?: (error: Error, context: ErrorDetails) => void;
440 │     },
441 │     injector?: Injector | undefined,
442 ▶     projectableNodes?: any[][] | undefined,
443 │     environmentInjector?: EnvironmentInjector | NgModuleRef<any> | undefined,
444 │     directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[],
445 │     bindings?: Binding[],
446 │   ): ComponentRef<C> {
```

417〜428 行目が今の形（options の中の `projectableNodes`、422 行目）、429〜446 行目が実装のシグネチャで、436 行目の options の中と、442 行目の古い位置引数の両方を受けます。本体は options から `projectableNodes` を取り出し、そのまま `ComponentFactory.create` の 2 つ目の引数に渡します（[遅延モジュールの章](../ngmodule/15-ngmodule-lazy-module.md)で読んだ `createComponent` の本体）。どちらの入口も、行き着く先は `ComponentFactory.create` です。

📄 `angular/packages/core/src/render3/component_ref.ts` L412–418 （▶ の行: 415–416）

```ts
412 │       executeContentQueries(rootTView, hostTNode, rootLView);
413 │       directiveHostEndFirstCreatePass(rootTView, hostTNode);
414 │ 
415 ▶       if (projectableNodes !== undefined) {
416 ▶         projectNodes(hostTNode, this.ngContentSelectors, projectableNodes);
417 │       }
418 │ 
```
*ComponentFactory.createComponentRef の中。ルートのホストの TNode を作った直後*

1. **415〜416 行目：渡されたときだけ projectNodes**

   ルートのホストの TNode（ルートの TView の 1 つ目のノード）に、`projectNodes` が枠の配列を入れます。中身は [Elements の投影の章](../elements/04-elements-connect.md)で読んだとおり、`ngContentSelectors` の数だけ回り、`projectableNodes[i]` が `null` か長さ 0 なら `null`、そうでなければ配列の写しを入れます。**セレクタとの照合はしません**。番号がそのまま枠の番号です。
2. **中のコンポーネントの ɵɵprojectionDef は何もしない**

   続く `renderView` でコンポーネントのテンプレート関数が走ると、先頭の `ɵɵprojectionDef` はホストの TNode の `projection` が入っているのを見て、振り分けを飛ばします（[projection の章](../template/02-projection.md)で読んだ最初の `if`）。渡さなかったときは、ホストの TNode に子が無いので、全部の枠が `null` になります。
3. **ɵɵprojection は配列でも同じ**

   [第 4 回](04-proj-render.md)で読んだ `ɵɵprojection` の「空」は、枠が `null` かどうかです。長さ 0 の配列は `projectNodes` が `null` にしているので、既定の内容が出ます。この正規化は、`[]` を渡すと既定の内容が出なかった不具合（#57471）の修正（`7b1e5be20b9`、PR #57480）で入りました。空でなければ `applyProjectionRecursive` の配列の枝が、DOM ノードを 1 つずつ付けます。

📄 `angular/packages/core/src/render3/node_manipulation.ts` L735–747 （▶ の行: 736, 738–739, 741, 743, 745）

```ts
735 │     } else {
736 ▶       const projectionNodes = getProjectionNodes(lView, tNode);
737 │       if (projectionNodes !== null) {
738 ▶         if (Array.isArray(projectionNodes)) {
739 ▶           return projectionNodes[0];
740 │         }
741 ▶         const parentView = getLViewParent(lView[DECLARATION_COMPONENT_VIEW]);
742 │         ngDevMode && assertParentView(parentView);
743 ▶         return getFirstNativeNode(parentView!, projectionNodes);
744 │       } else {
745 ▶         return getFirstNativeNode(lView, tNode.next);
746 │       }
747 │     }
```

配列はもう 1 か所で特別扱いされます。`getFirstNativeNode` は、ある TNode から始まる「最初の DOM ノード」を探す関数で、ビューを入れる位置（この前に入れる、のノード）を決めるときに使います。ng-content に行き当たると 736 行目で枠の中身を取り（[第 4 回](04-proj-render.md)の `getProjectionNodes`）、配列なら 739 行目でその先頭を返します。TNode なら 741〜743 行目で、その TNode の持ち主である 1 段外のビューで探し直します。空の枠なら 745 行目で次の兄弟へ進みます。

> [!WARNING]
> **ハマりどころ**
>
> `projectNodes` は配列を写すだけで、渡された DOM ノードを元の場所から外しません。外すのは `ɵɵprojection` が付けるときです。だから、枠が `@if` の中にあって描かれない間、すでに document のどこかにあったノードはそのまま残ります（閉じた #54881 で報告された形）。

> **🧪 DEMO 1 — ViewContainerRef.createComponent に projectableNodes を渡す**
>
> ボタンを押すたびに `PrdCard` を 1 つ作ります。DOM ノードは押したときに作り、どの枠に入ったかをカードの文字で見ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/proj-dynamic)

- 「枠 0 を \[\] にする」で `既定の見出し`、「枠 1 を省く」で `既定の本文`、「projectableNodes なし」で両方の既定の内容が出ます。どれも枠が `null` です。
- 「\[h\] の要素を枠 1 に」は、`h` の属性を持つ要素でも 2 つ目の配列に入れたので、`select="[h]"` の枠 0 ではなく枠 1 に出ます。`ngContentSelectors` は `["[h]","*"]` で、配列の番号はこの並びです。

## 2. 誤解 1：同じ ng-content を 2 回書くと、2 か所に出る

DOM ノードは 1 つの場所にしか置けないので、2 か所には出ません。ただ、どちらに出るかは書き方で 3 通りに分かれます。コンパイラの出力から見ます（記録）。

📄 `2 回書いたテンプレートの作成の段（このサイトの @angular/compiler 22.1.6 で Node から。抜粋）` L1–15 （▶ の行: 2, 4–5, 7, 9–10, 13, 15）

```
 1 │ // prd-two-wild（ワイルドカード 2 つ）
 2 ▶ var _c0 = ['*', '*'];   // ngContentSelectors: _c0
 3 │ i0.ɵɵprojectionDef(_c0);
 4 ▶ i0.ɵɵprojection(2);
 5 ▶ i0.ɵɵprojection(5,1);
 6 │ // prd-two-sel（同じ select 2 つ）
 7 ▶ var _c1 = ['[x]', '[x]'];   // ngContentSelectors: _c1
 8 │ i0.ɵɵprojectionDef(_c0);   // _c0 = [[['', 'x', '']], [['', 'x', '']]]
 9 ▶ i0.ɵɵprojection(2);
10 ▶ i0.ɵɵprojection(5,1);
11 │ // prd-in-for-root（@for の中の 1 つ）
12 │ var _c0 = ['*'];
13 ▶ function Demo_For_1_Template(rf, ctx) { if (rf & 1) { i0.ɵɵtext(0); i0.ɵɵprojection(1); } … }
14 │ i0.ɵɵprojectionDef();
15 ▶ i0.ɵɵrepeaterCreate(0,Demo_For_1_Template,2,1,null,null,i0.ɵɵrepeaterTrackByIdentity);
```

1. **ワイルドカード 2 つ（1〜5 行目）**

   `ngContentSelectors` は `['*', '*']` で、4 行目と 5 行目の ng-content は別の枠（0 と 1）です。振り分けの `matchingProjectionSlotIndex` は、`'*'` に会うたびに番号を覚え直し、最後に覚えた番号を返します（[projection の章](../template/02-projection.md)の「最後のワイルドカードが余り物を受け取る」）。だから全部が枠 1（B）に入り、**枠 0（A）は空**です。A に既定の内容があれば、それが出ます（DEMO 2 の `prd-two-fallback`）。
2. **同じ select 2 つ（7〜10 行目）**

   こちらは 7 行目のとおり 2 つの枠が同じセレクタを持ち、振り分けは**最初に合った枠**を返します（[第 3 回](03-proj-distribute.md)）。全部が枠 0（A）に入り、B が空です。ワイルドカードと向きが逆です。
3. **@for の中の 1 つ（12〜15 行目）**

   ng-content の TNode は埋め込みビューのテンプレート（13 行目の `ɵɵprojection(1)`）に 1 つだけで、行の数だけ同じ命令が走ります。どの行も同じ枠の同じ DOM ノードを付けるので、**最後に作った行**に移ります（[Elements の章](../elements/04-elements-connect.md)の「DOM ノードは 1 つの場所にしか置けない」と同じ）。

3 つ目には続きがあります。行を消すとき、埋め込みビューを DOM から外す道は [第 4 回](04-proj-render.md)の `applyNodes` を「外す」の向きで歩き、ビューの根に ng-content があれば、ng-content の分岐から `applyProjectionRecursive` に入って、枠のノードを外します。外すのは DOM の `remove()`（[既定のレンダラの章](../domr/04-domr-default-renderer.md)の `removeChild`）なので、**そのノードが今どの行にあっても外れます**。ng-content が `<div>` の中にあるとき（`prd-in-for`）は、`applyNodes` は要素の子へは降りないので、中身のある行を消したときだけ、div ごと消えます。

> **🧪 DEMO 2 — 同じ枠を 2 回**
>
> 「描く」で 5 つの部品を出し、それぞれの中の div の文字と、`<b>中身</b>` がまだ document に付いているか（`isConnected`）を読みます。@for の 2 つは同じ `rows` を使います。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/proj-dynamic)

このサイトの本番ビルドで確かめた結果です。

1. **描いたあと**

   `prd-two-wild` は B だけ、`prd-two-sel` は A だけ、`prd-two-fallback` は A が `既定 A`・B が中身。`prd-in-for` は行 2 に、`prd-in-for-root` は `[行 1][行 2]中身`（行 2 の後ろ）です。
2. **行を足す**

   どちらの @for でも、中身は新しい行 3 に移ります。
3. **先頭の行を消す**

   `prd-in-for` の中身は行 3 に残ります。`prd-in-for-root` は `[行 2][行 3]` になり、**中身は document から外れます**（消したのは中身の無い行 1 なのに）。
4. **最後の行を消す**

   `prd-in-for` も、中身の入った行 3 の div ごと外れます。どちらも、残った行 2 には戻りません。戻すのは、もう一度 `ɵɵprojection` が走るとき（新しい行を作ったとき）だけです。

## 3. 誤解 2：@if で ng-content を隠すと、中身が作り直される

[第 4 回](04-proj-render.md)の 1 節のとおり、中身は使う側のビューで先に作られています。`@if` が切り替えるのは、ng-content を含む**中のコンポーネントの埋め込みビュー**だけです。

1. **開く（埋め込みビューを作る）**

   埋め込みビューのテンプレート関数の中で `ɵɵprojection` が走り、`applyProjection` を呼びます（[第 4 回](04-proj-render.md)の 3 節）。このとき埋め込みビューはまだ DOM に入っていないので、ng-content がビューの根にあれば親の要素は決まらず、付けるのは続くビューの挿入（`applyView` の「入れる」の向き）が `applyNodes` の ng-content の分岐を通るときです。どちらでも、付けるのは**前から在る**同じ DOM ノードです。
2. **閉じる（埋め込みビューを外して壊す）**

   外す道は 2 節と同じで、枠のノードは DOM から外れるだけです。続く埋め込みビューの破棄は、そのビューの子のビュー（`CHILD_HEAD` から `NEXT` でたどるもの。[ビューの木の章](../ivy/12-ivy-view-tree.md)）だけを壊します（[ビューの破棄の章](../ivy/17-ivy-destroy.md)）。投影されたコンポーネントのビューは、使う側のビューの子なので、ここには入っていません。
3. **閉じている間も**

   投影されたコンポーネントは使う側のビューの一部なので、使う側のビューの変更検知で今までどおり見られます。DEMO 3 の `ngDoCheck` の数は、閉じている間も増えます。`ngOnDestroy` が呼ばれるのは、使う側のビューごと壊れるときです。

## 4. 条件で作りたいとき：ng-template を渡す

使う側が `<ng-template>` で包むと、中身は「テンプレート」（TView と、宣言したビューへの参照）になり、まだ作られません。中のコンポーネントは `contentChild(TemplateRef)` でそれを受け取り、`@if` の中で `ngTemplateOutlet` に渡します。`NgTemplateOutlet` は、自分の `ViewContainerRef` に `createEmbeddedView` で埋め込みビューを作るので（[NgTemplateOutlet の章](../cmn/05-cmn-outlets.md)）、中身のコンポーネントは**開くたびに作られ、閉じるたびに壊れます**。作ったビューの「宣言の場所」は使う側のテンプレートのままなので、中身の式は使う側の値を読みます（[ビューの木の章](../ivy/12-ivy-view-tree.md)の `DECLARATION_VIEW`）。

> **🧪 DEMO 3 — @if で ng-content を隠す場合と、ng-template で作る場合**
>
> 葉（`prd-leaf`）は、作成・破棄・`ngDoCheck` の数を数えます。「描く」は 2 つの部品を閉じた状態で出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/proj-dynamic)

このサイトの本番ビルドで確かめた結果です。

- 閉じた状態で描いた直後：`<ng-content>` の葉は作成 1・DOM に付いている 0、`<ng-template>` の葉は作成 0 です。
- 開く・閉じるを繰り返すと、`<ng-content>` の葉は作成も破棄も増えず、DOM に付いたり外れたりするだけです。`<ng-template>` の葉は、開くたびに作成が、閉じるたびに破棄が 1 増えます。
- `<ng-content>` の葉の `ngDoCheck` は、閉じている間も切り替えのたびに増えます。「片付ける」で使う側ごと壊したときに、初めて破棄が 1 になります。

## 5. 呼び出しの連なり

- 👤 `vcr.createComponent(PrdCard, { projectableNodes })` — view\_container\_ref.ts L417-446
  - `ComponentFactory.create` → `createComponentRef` — component\_ref.ts
    - `projectNodes(hostTNode, ngContentSelectors, projectableNodes)` — component\_ref.ts L415-416 — *番号で枠へ。空は null*
    - `renderView` → `PrdCard のテンプレート関数`
      - `ɵɵprojectionDef` — projection.ts — *projection があるので飛ばす*
      - `ɵɵprojection` → `insertFallbackContent` か `applyProjection` — projection.ts L197-204
        - `applyProjectionRecursive`（配列の枝） — node\_manipulation.ts — *DOM ノードを 1 つずつ付ける*
- 👤 `@if (open()) { <ng-content /> }` が偽になる — 中のコンポーネントのテンプレート
  - `applyView(Detach)` → `applyNodes` → `applyProjectionRecursive` — node\_manipulation.ts L854-862 — *枠のノードを DOM から外すだけ*
  - `destroyLView` → `destroyViewTree` — node\_manipulation.ts — *埋め込みビューの子だけ。投影されたコンポーネントは含まない*

## テストと直し方

### この章の振る舞いを固めているテスト

content\_spec.ts の一番外の `describe('projection')` から 2 つ。どちらも 2 節の形です。

📄 `angular/packages/core/test/acceptance/content_spec.ts` L505–533 （▶ の行: 505, 508–509, 530）

```ts
505 ▶   it('should project nodes into the last ng-content', () => {
506 │     @Component({
507 │       selector: 'child',
508 ▶       template: `<div><ng-content></ng-content></div>
509 ▶         <span><ng-content></ng-content></span>`,
510 │       standalone: false,
511 │ 
512 │       changeDetection: ChangeDetectionStrategy.Eager,
513 │     })
514 │     class Child {}
515 │ 
516 │     @Component({
517 │       selector: 'parent',
518 │       template: `<child>content</child>`,
519 │       standalone: false,
520 │ 
521 │       changeDetection: ChangeDetectionStrategy.Eager,
522 │     })
523 │     class Parent {}
524 │ 
525 │     TestBed.configureTestingModule({declarations: [Parent, Child], imports: [CommonModule]});
526 │     const fixture = TestBed.createComponent(Parent);
527 │     fixture.detectChanges();
528 │ 
529 │     expect(getElementHtml(fixture.nativeElement)).toBe(
530 ▶       '<child><div></div><span>content</span></child>',
531 │     );
532 │   });
533 │ 
```

508〜509 行目はワイルドカードの ng-content を 2 つ書いたもので、530 行目で前の `<div>` が空、後ろの `<span>` に `content`。2 節の 1 つ目（最後のワイルドカード）です。

📄 `angular/packages/core/test/acceptance/content_spec.ts` L535–562 （▶ の行: 535, 539, 559–560）

```ts
535 ▶   it('should project nodes into the last ng-content unrolled by ngFor', () => {
536 │     @Component({
537 │       selector: 'child',
538 │       template:
539 ▶         '<div *ngFor="let item of [1, 2]; let i = index">({{i}}):<ng-content></ng-content></div>',
540 │       standalone: false,
541 │ 
542 │       changeDetection: ChangeDetectionStrategy.Eager,
543 │     })
544 │     class Child {}
545 │ 
546 │     @Component({
547 │       selector: 'parent',
548 │       template: '<child>content</child>',
549 │       standalone: false,
550 │ 
551 │       changeDetection: ChangeDetectionStrategy.Eager,
552 │     })
553 │     class Parent {}
554 │ 
555 │     TestBed.configureTestingModule({declarations: [Parent, Child], imports: [CommonModule]});
556 │     const fixture = TestBed.createComponent(Parent);
557 │     fixture.detectChanges();
558 │ 
559 ▶     expect(getElementHtml(fixture.nativeElement)).toBe(
560 ▶       '<child><div>(0):</div><div>(1):content</div></child>',
561 │     );
562 │   });
```

539 行目は 1 つの ng-content を `*ngFor` で 2 回描くもので、559〜560 行目で 2 つ目の行にだけ `content` があります。2 節の 3 つ目（最後に描いた方）です。

📄 `angular/packages/core/test/acceptance/content_spec.ts` L2149–2173 （▶ の行: 2152–2153, 2165–2166, 2169, 2173）

```ts
2149 │     it('should render the content through projectableNodes along with fallback', () => {
2150 │       @Component({
2151 │         template:
2152 ▶           `<ng-content>One fallback</ng-content>|` +
2153 ▶           `<ng-content>Two fallback</ng-content>|<ng-content>Three fallback</ng-content>`,
2154 │ 
2155 │         changeDetection: ChangeDetectionStrategy.Eager,
2156 │       })
2157 │       class Projection {}
2158 │ 
2159 │       const hostElement = document.createElement('div');
2160 │       const environmentInjector = TestBed.inject(EnvironmentInjector);
2161 │       const paragraph = document.createElement('p');
2162 │       paragraph.textContent = 'override';
2163 │       const secondParagraph = document.createElement('p');
2164 │       secondParagraph.textContent = 'override';
2165 ▶       const projectableNodes = [[paragraph], [], [secondParagraph]];
2166 ▶       const componentRef = createComponent(Projection, {
2167 │         hostElement,
2168 │         environmentInjector,
2169 ▶         projectableNodes,
2170 │       });
2171 │       componentRef.changeDetectorRef.detectChanges();
2172 │ 
2173 ▶       expect(getElementHtml(hostElement)).toContain('<p>override</p>|Two fallback|<p>override</p>');
```

2152〜2153 行目のワイルドカード 3 つは、テンプレートの子なら 1 節のとおり最後の 1 つにしか入りませんが、`projectableNodes` では番号で 3 つの枠に分かれます。2165 行目の真ん中の `[]` は 2173 行目で `Two fallback` になります（`7b1e5be20b9` で足された it）。linker の側（`projection_integration_spec.ts`）には、`ViewContainerRef.createComponent` に渡したノードを、遅れて作るテンプレートの ng-content で出し入れする it があります。

📄 `angular/packages/core/test/linker/projection_integration_spec.ts` L848–864 （▶ の行: 848, 850, 853, 857–858, 861–862）

```ts
848 ▶     it('should pass nodes to the default ng-content inside a delayed embedded view', () => {
849 │       const cmptRef = createCmptInstance(
850 ▶         'A(<ng-template #ref="delayedInsert" delayedInsert>[<ng-content></ng-content>]</ng-template>)C',
851 │         [[document.createTextNode('B')]],
852 │       );
853 ▶       expect(cmptRef.location.nativeElement).toHaveText('A()C');
854 │ 
855 │       const delayedInsert = cmptRef.instance.directiveRef as DelayedInsertTplRef;
856 │ 
857 ▶       delayedInsert.show();
858 ▶       cmptRef.changeDetectorRef.detectChanges();
859 │       expect(cmptRef.location.nativeElement).toHaveText('A([B])C');
860 │ 
861 ▶       delayedInsert.hide();
862 ▶       cmptRef.changeDetectorRef.detectChanges();
863 │       expect(cmptRef.location.nativeElement).toHaveText('A()C');
864 │     });
```

850 行目の `ng-template` の中の ng-content は、853 行目ではまだ描かれていません。857〜858 行目で作ると `[B]` が入り、861〜862 行目で外すと、ノードは DOM から外れます。3 節の「開く」「閉じる」と同じ道です。

### 手元で走らせた結果

📄 `ターミナル（~/angular-research/angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test:test \
  '--test_arg=--filter=^projection projectable nodes' --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/acceptance:acceptance \
  '--test_arg=--filter=^projection should project nodes into the last' --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/acceptance:acceptance \
  '--test_arg=--filter=^projection fallback content .*projectableNodes' --nocache_test_results --test_output=all
```

📄 `出力（2026-11-11 に実行。抜粋）`

```
Ran 2 of 1396 specs
2 specs, 0 failures
Ran 2 of 1396 specs
2 specs, 0 failures
Ran 1 of 1395 specs
1 spec, 0 failures
Ran 2 of 1396 specs
2 specs, 0 failures
//packages/core/test:test                                                PASSED in 1.5s
Ran 2 of 2693 specs
2 specs, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.3s
Ran 2 of 2693 specs
2 specs, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.3s
```

`//packages/core/test:test` は `shard_count = 4` なので、`projectable nodes` の describe の 7 件が 2 + 2 + 1 + 2 に分かれて出ます。content\_spec.ts の 2 つの `last ng-content` の it と、`projectableNodes` を名前に持つ 2 つの it（2123・2149 行目）も通りました。一方、「`@if` の中の ng-content を閉じても、投影したコンポーネントは壊れない」を名指しで確かめる it は、content\_spec.ts と projection\_integration\_spec.ts を `destroy` で grep した範囲には見つかりません（DEMO 3 の振る舞い）。2 節の「根の ng-content を持つ行を消すと、別の行にある中身も外れる」を確かめる it も見つかりません。

### 直すとしたら

- `projectableNodes` の受け取りは `component_ref.ts` の `projectNodes`（415〜416 行目から呼ばれる）。番号と枠の対応や空の扱いを変えるなら、content\_spec.ts の `describe('fallback content')` の 2123・2149 行目の it と、projection\_integration\_spec.ts の `describe('projectable nodes')`（718 行目）を走らせます。
- 行を消したときに枠のノードを外す道は `applyNodes` の ng-content の分岐と `applyProjectionRecursive`（[第 4 回](04-proj-render.md)の 5 節）。「今その ng-content の場所にあるときだけ外す」ようにするなら、外す前にノードの親を確かめる分岐が要り、it は content\_spec.ts の 535 行目の it の隣（@for で行を消す形）に足すことになります。
- 2 回書いたワイルドカードの扱い（最後が勝つ）は振り分けの `matchingProjectionSlotIndex`（[第 3 回](03-proj-distribute.md)）で、そこのコメントのとおり View Engine との互換のためです。変えると 505 行目の it の期待値が変わります。

## 聞かれそうな質問

**Q. `projectableNodes` で渡した要素は、`select` で振り分けられますか？**

いいえ。415〜416 行目の `projectNodes` は `projectableNodes[i]` を i 番の枠に入れるだけで、セレクタと照合しません。中のコンポーネントの `ɵɵprojectionDef` も、`projection` が入っているので振り分けを飛ばします。並びは `reflectComponentType(…).ngContentSelectors` で確かめられます（DEMO 1）。

**Q. 空の配列を渡すと、既定の内容は出ますか？**

出ます。`projectNodes` が長さ 0 を `null` にするので、`ɵɵprojection` の判定で空になります（content\_spec.ts 2165・2173 行目）。この修正（#57471、`7b1e5be20b9`）を含むタグは、手元の木では 19.0.0 からです。

**Q. `@if` と `@else` の両方に `<ng-content />` を書くと、片方にしか出ないのはなぜですか？**

2 つのワイルドカードは別の枠で、振り分けは最後のワイルドカードの枠に全部を入れるからです（2 節の 1 つ目、spec の 505 行目）。最初の枠は空のままなので、どちらの分岐が出ていても、出るのは後ろに書いた ng-content だけです（開いている #7795 と、その重複として閉じた #61282）。

**Q. `@if` の中の ng-content を閉じても `ngOnDestroy` が呼ばれないのは不具合ですか？**

今の作りの結果です。投影されたコンポーネントは使う側のビューで作られ、その子のビューです。閉じて壊れるのは中のコンポーネントの埋め込みビューで、その破棄は自分の子のビューしか見ません（3 節）。同じ報告は #47571（not planned で閉じた）や #64498（重複として閉じた）にあり、どちらも canonical の #64504 にまとめられています。

**Q. 条件で作り、閉じたら壊したいときは？**

使う側が中身を `<ng-template>` で包み、中のコンポーネントが `contentChild(TemplateRef)` で受けて `ngTemplateOutlet` で描きます（4 節、DEMO 3 の作成・破棄の数）。

## 読み終えて

- `projectableNodes` は番号で枠に入り、セレクタは効かない。空の配列は `null` になり既定の内容が出る（component\_ref.ts 415〜416 行目の `projectNodes`）。
- 同じ枠を 2 回：ワイルドカード 2 つは後ろ、同じ select 2 つは前、@for の中の 1 つは最後に描いた行。どれも DOM ノードは 1 か所。
- ビューを外すときは枠のノードも外れる。根に ng-content がある行を消すと、中身が別の行にあっても外れる。
- @if で ng-content を隠しても、中身は作り直されず、壊れず、変更検知も続く。条件で作るなら ng-template。

---

← 前: [描画と再投影：ɵɵprojection、applyProjectionRecursive、既定の内容](04-proj-render.md)  
次: [spec と issue を読む：投影の振る舞いを決めているテスト](06-proj-tests-issues.md) →
