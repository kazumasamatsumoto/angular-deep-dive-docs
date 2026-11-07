[目次](../README.md) › [DI の内側](README.md) › 第 12 回 / 全 16 回

# self・skipSelf・host・optional：4 つのビットが探索のどこを止めるか

> InternalInjectFlags の 4 ビットと ForPipe。NodeInjector 側（lookupTokenUsingNodeInjector の Self / SkipSelf、shouldSearchParent と @Host の境界、pipe の ForPipe）と R3Injector 側（get の Self / SkipSelf、host が無視される理由）で同じビットが違う場所で効く。デモで同じトークンを親子と環境に置き、4 つのオプションの組み合わせで何が返るかを確かめる。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/di-resolution-flags)

---

この章で分かること：`inject(TOKEN, { self, skipSelf, host, optional })` の 4 つは、`InternalInjectFlags` という 1 つの数値の 4 ビットになって探索の関数に渡ります。同じビットでも、要素の注入器（`NodeInjector`）と環境インジェクタ（`R3Injector`）では**読む場所も効き方も違います**。特に `host` は `R3Injector` ではどこにも読まれません。1 ビットずつ、それを読んでいる `if` の行を指して説明し、最後にデモで組み合わせを試します。

読む対象は `packages/core/src/di/interface/injector.ts`、`di/metadata.ts`、`render3/di.ts`（`lookupTokenUsingNodeInjector`、`locateDirectiveOrProvider`、`lookupTokenUsingModuleInjector`、`notFoundValueOrThrow`）、`render3/state.ts`（`enterDI`）、`di/r3_injector.ts`（`get`）と、コンパイラのテスト fixture です。

1. [1. 概観](01-di-overview.md)
2. [2. inject() の実装](02-di-inject-function.md)
3. [3. 注入コンテキスト](03-di-injection-context.md)
4. [4. ɵfac の生成](04-di-factory.md)
5. [5. @Injectable と @Service](05-di-injectable-compile.md)
6. [6. InjectionToken と特殊トークン](06-di-injection-token.md)
7. [7. provider の 4 つの形](07-di-provider-to-factory.md)
8. [8. R3Injector.get の全手順](08-di-r3-injector-get.md)
9. [9. multi: true](09-di-multi-providers.md)
10. [10. ブルームフィルタ](10-di.md)
11. [11. NodeInjector の探索](11-di-node-injector-lookup.md)
12. **12. self・skipSelf・host・optional**（この章）
13. [13. provider 無しで取れるトークン](13-di-special-tokens.md)
14. [14. DestroyRef と破棄](14-di-destroy.md)
15. [15. injectAsync と onIdle](15-di-inject-async.md)
16. [16. DevTools と injector profiler](16-di-debug.md)

## 1. 4 つのオプションと 5 つのビット

ビットの定義 `InternalInjectFlags`（`Host = 1`、`Self = 2`、`SkipSelf = 4`、`Optional = 8`、`ForPipe = 16`）と、`inject()` のオブジェクトをビットに変える `convertToBitFlags` は [第 2 回](02-di-inject-function.md)で引用しました。ここでは公開 API 側の説明文を読みます。

📄 `angular/packages/core/src/di/interface/injector.ts` L54–81 （▶ の行: 61, 66, 71–72, 77–79）

```ts
54 │ /**
55 │  * Type of the options argument to [`inject`](api/core/inject).
56 │  *
57 │  * @publicApi
58 │  */
59 │ export interface InjectOptions {
60 │   /**
61 ▶    * Use optional injection, and return `null` if the requested token is not found.
62 │    */
63 │   optional?: boolean;
64 │ 
65 │   /**
66 ▶    * Start injection at the parent of the current injector.
67 │    */
68 │   skipSelf?: boolean;
69 │ 
70 │   /**
71 ▶    * Only query the current injector for the token, and don't fall back to the parent injector if
72 ▶    * it's not found.
73 │    */
74 │   self?: boolean;
75 │ 
76 │   /**
77 ▶    * Stop injection at the host component's injector. Only relevant when injecting from an element
78 ▶    * injector, and a no-op for environment injectors.
79 ▶    */
80 │   host?: boolean;
81 │ }
```

61 行目 `optional`「見つからなければ `null`」、66 行目 `skipSelf`「いまの注入器の親から始める」、71〜72 行目 `self`「いまの注入器だけを見て、親へ行かない」。77〜79 行目の `host` だけ但し書きがあります。「要素の注入器から注入するときだけ意味があり、環境インジェクタでは何もしない（no-op）」。この但し書きが本当かを 5 節で確かめます。

コンストラクタ引数のデコレータ（`@Self()` など）も同じビットになります。

📄 `angular/packages/core/src/di/metadata.ts` L241–250 （▶ の行: 250）

```ts
241 │ /**
242 │  * Host decorator and metadata.
243 │  *
244 │  * @Annotation
245 │  * @publicApi
246 │  */
247 │ export const Host: HostDecorator =
248 │   // Disable tslint because `InternalInjectFlags` is a const enum which gets inlined.
249 │   // tslint:disable-next-line: no-toplevel-property-access
250 ▶   attachInjectFlag(makeParamDecorator('Host'), InternalInjectFlags.Host);
```

250 行目、`@Host` はパラメータデコレータにビット `InternalInjectFlags.Host` を貼り付けたものです。`Self`・`SkipSelf`・`Optional` も同じ形で、`attachInjectFlag` の中身と、AOT でこのビットが `ɵfac` の第 2 引数になる流れは[第 4 回](04-di-factory.md)で読みました。

### ForPipe：コンパイラだけが付ける 5 つ目のビット

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_di/di/pipe_and_injectable_pipe_first.js` L1–10 （▶ の行: 6）

```js
 1 │ // NOTE The prov definition must be last so MyOtherPipe.fac is defined
 2 │ export class MyOtherPipe {
 3 │   // ...
 4 │   static ɵfac = function MyOtherPipe_Factory(__ngFactoryType__) {
 5 │     /* @ts-ignore */
 6 ▶     return new (__ngFactoryType__ || MyOtherPipe)(i0.ɵɵdirectiveInject(Service, 16));
 7 │   };
 8 │   static ɵpipe = /*@__PURE__*/ i0.ɵɵdefinePipe({ name: "myOtherPipe", type: MyOtherPipe, pure: true, standalone: false });
 9 │   static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: MyOtherPipe, factory: MyOtherPipe.ɵfac });
10 │ }
```

これはコンパイラのテストの期待出力です。6 行目、パイプのコンストラクタ引数 `service: Service` は `ɵɵdirectiveInject(Service, 16)` になります。`16` が `ForPipe` です。コンパイラは対象がパイプのとき、デコレータが無くても必ずこのビットを足します（[第 4 回](04-di-factory.md)の `compileInjectDependency`）。`inject()` の `convertToBitFlags` は 4 つのオプションしか変換しないので、`inject()` からは付きません。

このビットを読むのは `core/src` の中で `change_detection/change_detector_ref.ts` の `injectChangeDetectorRef` だけです（`grep -rn ForPipe` の結果）。パイプがコンポーネントのホスト要素で使われたとき、子コンポーネントのビューではなく、パイプを使っている側のビューの `ChangeDetectorRef` を返すために使います。中身は[Ref の章](../ivy/16-ivy-refs.md)の `createViewRef` で読めます。探索の経路（この章の本題）には影響しません。

## 2. NodeInjector 側：Self と SkipSelf は出発点で効く

[第 11 回](11-di-node-injector-lookup.md)で読んだ `lookupTokenUsingNodeInjector` の、ループに入る前の部分です。フラグの `if` だけを見ます。

📄 `angular/packages/core/src/render3/di.ts` L553–568 （▶ の行: 556–557, 561, 565, 567–568）

```ts
553 │     let previousTView: TView | null = null;
554 │     let injectorIndex = getInjectorIndex(tNode, lView);
555 │     let parentLocation = NO_PARENT_INJECTOR;
556 ▶     let hostTElementNode: TNode | null =
557 ▶       flags & InternalInjectFlags.Host ? lView[DECLARATION_COMPONENT_VIEW][T_HOST] : null;
558 │ 
559 │     // If we should skip this injector, or if there is no injector on this node, start by
560 │     // searching the parent injector.
561 ▶     if (injectorIndex === -1 || flags & InternalInjectFlags.SkipSelf) {
562 │       parentLocation =
563 │         injectorIndex === -1
564 │           ? getParentInjectorLocation(tNode, lView)
565 ▶           : lView[injectorIndex + NodeInjectorOffset.PARENT];
566 │ 
567 ▶       if (parentLocation === NO_PARENT_INJECTOR || !shouldSearchParent(flags, false)) {
568 ▶         injectorIndex = -1;
```

1. **SkipSelf：自分を飛ばして親から始める（561・565 行目）**

   561 行目の条件に `flags & SkipSelf` があります。自分に注入器があっても、565 行目で保存済みの親の場所を読み、ループの出発点を親に変えます。**自分の要素の providers・viewProviders・ディレクティブはまとめて見ません**。
2. **SkipSelf + Self：何も見ない（567〜568 行目）**

   親から始めようとしても、567 行目の `shouldSearchParent(flags, false)` が `Self` で `false` を返すので、568 行目で `-1` になりループに入りません。要素は 1 つも見ません。
3. **Host：止まる場所を先に決める（556〜557 行目）**

   `Host` のときだけ、`lView[DECLARATION_COMPONENT_VIEW][T_HOST]` を `hostTElementNode` に入れます。`DECLARATION_COMPONENT_VIEW` は「いまのビューを宣言したコンポーネントのビュー」で、その `T_HOST` はそのコンポーネントのホスト要素です。つまり**「自分を書いたテンプレートの持ち主のホスト要素」**が止まる場所です。

## 3. NodeInjector 側：Self と Host は「上がるか」で効く

📄 `angular/packages/core/src/render3/di.ts` L601–614 （▶ の行: 604–607）

```ts
601 │       parentLocation = lView[injectorIndex + NodeInjectorOffset.PARENT];
602 │       if (
603 │         parentLocation !== NO_PARENT_INJECTOR &&
604 ▶         shouldSearchParent(
605 ▶           flags,
606 ▶           lView[TVIEW].data[injectorIndex + NodeInjectorOffset.TNODE] === hostTElementNode,
607 ▶         ) &&
608 │         bloomHasToken(bloomHash, injectorIndex, lView)
609 │       ) {
610 │         // The def wasn't found anywhere on this node, so it was a false positive.
611 │         // Traverse up the tree and continue searching.
612 │         previousTView = tView;
613 │         injectorIndex = getParentInjectorIndex(parentLocation);
614 │         lView = getParentInjectorView(parentLocation, lView);
```

604〜607 行目、1 つの注入器を調べ終えて親へ上がるかを決める場所です。第 2 引数は「いま調べた要素が `hostTElementNode` か」。[第 10 回](10-di.md) 7 節で読んだ `shouldSearchParent` は、`Self` なら常に `false`、`Host` なら第 2 引数が `true` のとき `false` を返します。だから `Self` は**最初の 1 つで止まり**、`Host` は**ホスト要素を調べたあとで止まります**。

### ホスト要素の上では、viewProviders とコンポーネントしか見えない

`Host` にはもう 1 つ効き目があります。止まる要素（ホスト要素）を調べるとき、`searchTokensOnInjector` は `isHostSpecialCase` を `true` にして渡します （[第 11 回](11-di-node-injector-lookup.md) 5 節の 659 行目）。受け取る側がこれです。

📄 `angular/packages/core/src/render3/di.ts` L700–721 （▶ の行: 703–704, 714–717）

```ts
700 │   const startingIndex = canAccessViewProviders
701 │     ? injectablesStart
702 │     : injectablesStart + cptViewProvidersCount;
703 ▶   // When the host special case applies, only the viewProviders and the component are visible
704 ▶   const endIndex = isHostSpecialCase ? injectablesStart + cptViewProvidersCount : directiveEnd;
705 │   for (let i = startingIndex; i < endIndex; i++) {
706 │     const providerTokenOrDef = tInjectables[i] as ProviderToken<any> | DirectiveDef<any> | string;
707 │     if (
708 │       (i < directivesStart && token === providerTokenOrDef) ||
709 │       (i >= directivesStart && (providerTokenOrDef as DirectiveDef<any>).type === token)
710 │     ) {
711 │       return i;
712 │     }
713 │   }
714 ▶   if (isHostSpecialCase) {
715 ▶     const dirDef = tInjectables[directivesStart] as DirectiveDef<any>;
716 ▶     if (dirDef && isComponentDef(dirDef) && dirDef.type === token) {
717 ▶       return directivesStart;
718 │     }
719 │   }
720 │   return null;
721 │ }
```

704 行目、探す範囲の終わりを `injectablesStart + cptViewProvidersCount`、つまり **viewProviders の区間の終わり**にします。ホスト要素の `providers` と、他のディレクティブは範囲の外です。714〜717 行目、そのうえでコンポーネント自身（`directivesStart` の位置にある def）だけは追加で見ます。703 行目のコメントがそのまま仕様です：「host の特例では viewProviders とコンポーネントだけが見える」。

> [!NOTE]
> **ポイント**
>
> つまり子コンポーネントで `inject(X, { host: true })` と書くと、親コンポーネントの **viewProviders は見えるが providers は見えません**。`viewProviders` は「テンプレートの中の子に見せる」ための置き場所なので、`host` は「テンプレートの持ち主が、テンプレートのために用意したもの」までに範囲を絞る指定です。デモの 5・6 行目で確かめます。

## 4. NodeInjector 側：見つからなかったら（Self・Host・Optional）

📄 `angular/packages/core/src/render3/di.ts` L407–418 （▶ の行: 413–415, 418）

```ts
407 │ function lookupTokenUsingModuleInjector<T>(
408 │   lView: LView,
409 │   token: ProviderToken<T>,
410 │   flags: InternalInjectFlags,
411 │   notFoundValue?: any,
412 │ ): T | null {
413 ▶   if (flags & InternalInjectFlags.Optional && notFoundValue === undefined) {
414 ▶     // This must be set or the NullInjector will throw for optional deps
415 ▶     notFoundValue = null;
416 │   }
417 │ 
418 ▶   if ((flags & (InternalInjectFlags.Self | InternalInjectFlags.Host)) === 0) {
```

1. **Optional：notFoundValue を null にする（413〜415 行目）**

   `inject()` は `notFoundValue` を渡さない（`undefined`）ので、`Optional` のときここで `null` になります。414 行目のコメントのとおり、こうしないと環境側の `NullInjector` が例外を投げます。
2. **Self か Host なら環境へ行かない（418 行目）**

   418 行目、`Self | Host` のどちらかが立っていれば、環境インジェクタの `get`（[第 11 回](11-di-node-injector-lookup.md) 6 節）を飛ばして、末尾の `notFoundValueOrThrow` へ行きます。**環境に provide してあっても見つかりません**。`SkipSelf` はここで止めないので、環境へは普通に行きます。

📄 `angular/packages/core/src/render3/di.ts` L386–396 （▶ の行: 391–392, 394）

```ts
386 │ function notFoundValueOrThrow<T>(
387 │   notFoundValue: T | null,
388 │   token: ProviderToken<T>,
389 │   flags: InternalInjectFlags,
390 │ ): T | null {
391 ▶   if (flags & InternalInjectFlags.Optional || notFoundValue !== undefined) {
392 ▶     return notFoundValue;
393 │   } else {
394 ▶     throwProviderNotFoundError(token, 'NodeInjector');
395 │   }
396 │ }
```

391 行目、`Optional` か、呼び出し元が `notFoundValue` を渡していれば 392 行目でそれを返します。どちらでもなければ 394 行目で NG0201（`PROVIDER_NOT_FOUND`）を投げます。メッセージ末尾に `in NodeInjector` と付くのはこの行だけです。環境側まで行ってから見つからなかったときは `NullInjector` が投げるので、メッセージが違います（[第 8 回](08-di-r3-injector-get.md)）。

第 11 回 6 節で見たとおり、環境インジェクタへ行くときに渡すフラグは `Optional` ビットだけです。`SkipSelf` を付けて `inject()` しても、環境インジェクタの中では「自分を飛ばす」は起きません。`SkipSelf` が飛ばすのは**要素 1 つぶん**です。

### 関数を持つトークン（ElementRef など）の SkipSelf

`ElementRef` のようにブルームを使わないトークン（[第 13 回](13-di-special-tokens.md)）は、ループに入らないので 2 節の 561 行目が効きません。代わりに `enterDI` が出発点の要素をずらします。

📄 `angular/packages/core/src/render3/state.ts` L575–605 （▶ の行: 578, 586–589, 594, 599–600, 602–603）

```ts
575 │ export function enterDI(lView: LView, tNode: TNode, flags: InternalInjectFlags) {
576 │   ngDevMode && assertLViewOrUndefined(lView);
577 │ 
578 ▶   if (flags & InternalInjectFlags.SkipSelf) {
579 │     ngDevMode && assertTNodeForTView(tNode, lView[TVIEW]);
580 │ 
581 │     let parentTNode = tNode as TNode | null;
582 │     let parentLView = lView;
583 │ 
584 │     while (true) {
585 │       ngDevMode && assertDefined(parentTNode, 'Parent TNode should be defined');
586 ▶       parentTNode = parentTNode!.parent as TNode | null;
587 ▶       if (parentTNode === null && !(flags & InternalInjectFlags.Host)) {
588 ▶         parentTNode = getDeclarationTNode(parentLView);
589 ▶         if (parentTNode === null) break;
590 │ 
591 │         // In this case, a parent exists and is definitely an element. So it will definitely
592 │         // have an existing lView as the declaration view, which is why we can assume it's defined.
593 │         ngDevMode && assertDefined(parentLView, 'Parent LView should be defined');
594 ▶         parentLView = parentLView[DECLARATION_VIEW]!;
595 │ 
596 │         // In Ivy there are Comment nodes that correspond to ngIf and NgFor embedded directives
597 │         // We want to skip those and look only at Elements and ElementContainers to ensure
598 │         // we're looking at true parent nodes, and not content or other types.
599 ▶         if (parentTNode.type & (TNodeType.Element | TNodeType.ElementContainer)) {
600 ▶           break;
601 │         }
602 ▶       } else {
603 ▶         break;
604 │       }
605 │     }
```

578 行目、`SkipSelf` のときだけ、586 行目で `tNode.parent` へ上がります。587〜589 行目、ビューの先頭まで来たら宣言元の要素へ移りますが、**`Host` が立っていればビューの境界を越えません**（587 行目の `!(flags & Host)`）。599〜600 行目、境界を越えて着いた先が要素か `ng-container` ならそこで止まり、`@if` などのコンテナ（コメントノード）ならさらに上がります。同じビューの中で親が見つかったときは、602〜603 行目でそのまま止まります。だから `inject(ElementRef, { skipSelf: true })` は親要素の `ElementRef` になります。

## 5. R3Injector 側：同じビットを get の中で読む

環境インジェクタを直接 `get` したとき（`inject(EnvironmentInjector).get(...)`、または環境インジェクタの中で作られるサービスの `inject()`）は、`R3Injector.get` がビットを読みます。全体は[第 8 回](08-di-r3-injector-get.md)で読んだので、フラグの行だけ再掲します。

📄 `angular/packages/core/src/di/r3_injector.ts` L344–348 （▶ の行: 345）

```ts
344 │       // Check for the SkipSelf flag.
345 ▶       if (!(flags & InternalInjectFlags.SkipSelf)) {
346 │         // SkipSelf isn't set, check if the record belongs to this injector.
347 │         let record: Record<T> | undefined | null = this.records.get(token);
348 │         if (record === undefined) {
```

📄 `angular/packages/core/src/di/r3_injector.ts` L374–383 （▶ の行: 376, 379–382）

```ts
374 │       // Select the next injector based on the Self flag - if self is set, the next injector is
375 │       // the NullInjector, otherwise it's the parent.
376 ▶       const nextInjector = !(flags & InternalInjectFlags.Self) ? this.parent : getNullInjector();
377 │       // Set the notFoundValue based on the Optional flag - if optional is set and notFoundValue
378 │       // is undefined, the value is null, otherwise it's the notFoundValue.
379 ▶       notFoundValue =
380 ▶         flags & InternalInjectFlags.Optional && notFoundValue === THROW_IF_NOT_FOUND
381 ▶           ? null
382 ▶           : notFoundValue;
383 │       return nextInjector.get(token, notFoundValue);
```

345 行目、`SkipSelf` なら自分の `records` を見ません。376 行目、`Self` なら次の注入器を親ではなく `NullInjector` にします。つまり自分の `records` だけを見ます。379〜382 行目、`Optional` で `notFoundValue` が既定値（`THROW_IF_NOT_FOUND`）なら `null` にします。

`Host` を読む行は `r3_injector.ts` のどこにもありません（`grep -n Host r3_injector.ts` は 0 件）。1 節 77〜79 行目の「環境インジェクタでは no-op」は、**読まれないから何も起きない**という意味です。

## 6. 4 ビット × 2 種類の注入器

| ビット | NodeInjector（要素）での効果 | R3Injector（環境）での効果 |
| --- | --- | --- |
| `self` | 最初の要素で止まる（604 行目）。環境へ行かない（418 行目） | 自分の records だけ。次は NullInjector（376 行目） |
| `skipSelf` | 出発点を親の要素にする（561・565 行目）。環境へは普通に行き、環境では自分を飛ばさない | 自分の records を飛ばして親へ（345 行目） |
| `host` | 宣言したコンポーネントのホスト要素で止まる（556〜557・606 行目）。そこでは viewProviders とコンポーネントだけ（704 行目）。環境へ行かない（418 行目） | 読む行が無い。無視される（77〜79 行目の no-op） |
| `optional` | 見つからなければ `null`（413〜415・391〜392 行目） | `THROW_IF_NOT_FOUND` を `null` に（379〜382 行目） |

## 7. DEMO：同じトークンを 3 か所に置いて試す

下のデモでは、`FLAG_TOKEN` を 3 か所に置きました。子コンポーネント自身の `providers`（`self`）、親コンポーネントの `providers`（`parent`）、章の `imports` の NgModule（`env`）です。ほかに親の `viewProviders` だけにある `PARENT_VIEW` と、環境だけにある `ENV_ONLY` を置きました。子は親のテンプレートの中にいるので、子から見た `hostTElementNode` は親のホスト要素です。

1) は子のコンストラクタで本物の `inject()` を呼んだ結果です。2) はチェックボックスで選んだ options を、子の `inject(Injector)`（子のホスト要素の `NodeInjector`）と `inject(EnvironmentInjector)` の `get` に渡します。`NodeInjector.get` は `inject()` と同じ `getOrCreateInjectable` を呼ぶだけなので（[第 1 回](01-di-overview.md)）、同じ options なら 1) と同じ結果になります。例外は `try/catch` で捕まえて表示しています。

> **🧪 DEMO — 4 つのオプションの組み合わせ**
>
> 親 `<app-flags-parent>`（providers: parent / viewProviders: PARENT\_VIEW）→ 子 `<app-flags-child>`（providers: self）。環境は章の imports の NgModule（env）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/di-resolution-flags)

1) の各行が通った道は次のとおりです。

| # | 呼び方 | 結果 | 理由（行） |
| --- | --- | --- | --- |
| 1 | `inject(FLAG_TOKEN)` | self | 出発点の子の要素で見つかる |
| 2 | `{ self }` | self | 同上。上がる前に見つかる |
| 3 | `{ skipSelf }` | parent | 565 行目で出発点が親のホスト要素になる |
| 4 | `{ host }` | self | 子の要素は hostTElementNode ではないので普通に探し、見つかる |
| 5 | `{ skipSelf, host }` | 例外 NG0201 | 親のホスト要素は 704 行目で viewProviders だけ。606 行目で止まり、418 行目で環境へ行かず、394 行目 |
| 6 | `inject(PARENT_VIEW, { skipSelf, host })` | parent（viewProviders） | 704 行目の範囲に viewProviders は入る |
| 7 | `inject(ENV_ONLY)` | env | 要素に一度も provide されていないので要素を見ずに環境へ（第 10 回） |
| 8 | `inject(ENV_ONLY, { self })` | 例外 NG0201 | 418 行目で環境へ行かず、394 行目（`in NodeInjector`） |
| 9 | `{ optional, self }` | null | 415 行目で null、392 行目で返す |
| 10 | `inject(ENV_ONLY, { host })` | 例外 NG0201 | 418 行目。`host` は環境を止める |

2) では `EnvironmentInjector.get` の行に注目してください。`host` を付けても `env` のまま（5 節）、`self` でも `env`（自分の records にある）、`skipSelf` を付けると親の環境インジェクタには無いので例外（`optional` も付ければ `null`）です。`self` と `skipSelf` を両方付けると、NodeInjector 側は 567 行目で何も見ずに終わります。

## ここまでの呼び出し

- 👤 `inject(TOKEN, { skipSelf: true, host: true })` — 子のコンストラクタ
  - `convertToBitFlags(options)` — injector\_compatibility.ts L300 — *SkipSelf | Host = 5（第 2 回）*
  - `ɵɵdirectiveInject(TOKEN, 5)` → `getOrCreateInjectable` — instructions/di.ts L45 / di.ts L457
    - `lookupTokenUsingNodeInjector(tNode, lView, TOKEN, 5, NOT_FOUND)` — di.ts L506
      - `hostTElementNode = lView[DECLARATION_COMPONENT_VIEW][T_HOST]` — di.ts L556〜557 — *親のホスト要素*
      - `SkipSelf` → 出発点を親へ — di.ts L561〜568
      - `searchTokensOnInjector` → `locateDirectiveOrProvider(…, isHostSpecialCase = true)` — di.ts L659 / L704 — *viewProviders とコンポーネントだけ*
      - `shouldSearchParent(5, true)` → false — di.ts L604〜606 — *ホスト要素で止まる*
    - `lookupTokenUsingModuleInjector(lView, TOKEN, 5)` — di.ts L407 — *L418 で Host → 環境を飛ばす*
      - `notFoundValueOrThrow(undefined, TOKEN, 5)` — di.ts L386 — *Optional でないので L394 で NG0201*

## 聞かれそうな質問

**Q. @Host はどこで止まりますか？**

「その `inject` を書いたテンプレートの持ち主（コンポーネント）のホスト要素」で止まります。556〜557 行目で `lView[DECLARATION_COMPONENT_VIEW][T_HOST]` を止まる要素として覚え、606 行目でその要素を調べたら上がりません。そのホスト要素の上では 704 行目で viewProviders とコンポーネント自身だけが見えます。さらに 418 行目で環境インジェクタにも行きません。コンポーネント自身のコンストラクタで使うと、自分のホスト要素は自分のビューではなく外側のビューにあるので、止まるのは**自分を置いた親コンポーネントのホスト要素**です（デモの 5・6 行目）。

**Q. skipSelf は、コンポーネント自身の viewProviders も飛ばしますか？**

飛ばします。561 行目と 565 行目は「自分の要素の注入器」をまるごと飛ばして親の要素から始めるので、その要素に積まれた viewProviders・providers・ディレクティブはどれも見ません（3 つは同じ要素の `tView.data` の区間で、[standalone 第 8 回](../standalone/08-standalone-providers-two-injectors.md)）。環境インジェクタでは `skipSelf` は効きません。第 11 回 6 節のとおり環境へ渡すのは `Optional` ビットだけだからです。

**Q. optional を付けて見つからなかったとき、何が返りますか？**

`inject()` なら `null` です。`inject()` は `notFoundValue` を渡さないので、413〜415 行目で `null` に置き換わり、`Self` / `Host` なら 391〜392 行目、それ以外なら環境インジェクタの 379〜382 行目を経て `NullInjector` がその `null` を返します。`injector.get(token, 'x', { optional: true })` のように `notFoundValue` を自分で渡したときは、413 行目と 380 行目の条件に当たらないので `'x'` が返ります。

**Q. host は R3Injector では本当に無視されますか？**

はい。`r3_injector.ts` に `Host` ビットを読む行はありません。`R3Injector.get` が読むのは 345 行目の `SkipSelf`、376 行目の `Self`、380 行目の `Optional` だけです。デモ 2) で `host` を付けても `EnvironmentInjector.get` は `env` を返します。一方、要素から `inject(X, { host: true })` したときは 418 行目で環境へ行かないので、「環境にあるのに見つからない」ことになります。

**Q. パイプの constructor で ChangeDetectorRef を受け取ると、どのビューの Ref になりますか？**

パイプを使っている側のビューのものです。コンパイラがパイプの依存に必ず `ForPipe`（16）を足し（fixture の 6 行目）、`injectChangeDetectorRef` がそのビットを見て、パイプがコンポーネントのホスト要素で使われていても子コンポーネントのビューを返さないようにしています。`ForPipe` は探索の経路には影響しません。

## 読み終えて

- 4 つのオプションは 1 つの数値の 4 ビット。NodeInjector 側では `lookupTokenUsingNodeInjector` と `lookupTokenUsingModuleInjector`、R3Injector 側では `get` が読む。
- `self` は「上がらない」と「環境へ行かない」。`skipSelf` は「要素 1 つぶん飛ばす」で、環境には効かない。
- `host` は宣言元コンポーネントのホスト要素で止まり、そこでは viewProviders とコンポーネントだけを見る。環境へも行かない。R3Injector では読まれない。
- `optional` は `notFoundValue` を `null` にするだけ。例外を投げる場所は `notFoundValueOrThrow`（要素側）か `NullInjector`（環境側）。
- `ForPipe` はコンパイラだけが付け、`ChangeDetectorRef` の作り方だけを変える。

---

← 前: [NodeInjector の探索：getOrCreateInjectable から環境インジェクタへ落ちるまで](11-di-node-injector-lookup.md)  
次: [ElementRef・ChangeDetectorRef・ViewContainerRef・TemplateRef・Injector が provider 無しで取れる理由](13-di-special-tokens.md) →
