[目次](../README.md) › [テストの内側](README.md) › 第 7 回 / 全 20 回

# createDirective と DirectiveFixture：ディレクティブだけをテストする

> 最新のソースに入った TestBed.createDirective（このサイトの 22.1.6 には未収録）が、セレクタからタグ名を決め、DirectiveTestHost という空のホストにディレクティブを載せて DirectiveFixture を返す手順。複数のタグ名を持つセレクタのエラー、directiveInstance と onDestroy、これまでのテスト用ホストコンポーネントを書く方法との比較。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-directive-fixture)

---

> [!WARNING]
> **ハマりどころ**
>
> `TestBed.createDirective` と `DirectiveFixture` は、`../angular`（22.2.0-next.7）のソースにあり、**このサイトの `@angular/core` 22.1.6 には無い** API です （`node_modules/@angular/core/types/testing.d.ts` に `createDirective` も `DirectiveFixture` も出てきません。入ったのは v22.2.0-next.5 から）。だからこの章では、このサイトの ng test では確かめず、Angular 本体の spec を bazel で走らせて確かめます。

ディレクティブ（テンプレートを持たず、要素に振る舞いを足すクラス）をテストするには、これまで「そのディレクティブを使うだけのホストコンポーネント」を spec に書くのが定番でした。この章では、新しく入った `TestBed.createDirective` が**セレクタからタグ名を決め、空っぽのホストコンポーネント `DirectiveTestHost` にディレクティブを載せ、`DirectiveFixture` を返す**手順を、行番号を指して追います。

読む対象は `packages/core/testing/src/test_bed.ts`（`createDirective`・`DirectiveTestHost`）、`packages/core/testing/src/fixture.ts`（`DirectiveFixture`）、`packages/core/src/render3/interfaces/projection.ts`（セレクタの配列の形）、`packages/core/src/render3/component_ref.ts` です。

1. [1. 全体像](01-testing-overview.md)
2. [2. initTestEnvironment](02-testing-init-environment.md)
3. [3. 後片付け](03-testing-reset-teardown.md)
4. [4. TestBed.inject](04-testing-inject.md)
5. [5. createComponent](05-testing-create-component.md)
6. [6. 入力の渡し方](06-testing-component-bindings.md)
7. **7. createDirective**（この章）
8. [8. DebugElement と By](08-testing-debug-element.md)
9. [9. detectChanges](09-testing-detect-changes.md)
10. [10. 自動の変更検知](10-testing-auto-detect.md)
11. [11. whenStable](11-testing-when-stable.md)
12. [12. エラーの伝わり方](12-testing-errors.md)
13. [13. fakeAsync](13-testing-fake-async.md)
14. [14. 偽の時計](14-testing-fake-async-scheduler.md)
15. [15. waitForAsync と ProxyZone](15-testing-wait-for-async.md)
16. [16. zone なしの時間](16-testing-zoneless-time.md)
17. [17. effect と signal](17-testing-effects.md)
18. [18. @defer](18-testing-defer.md)
19. [19. RouterTestingHarness](19-testing-router-harness.md)
20. [20. issue と変更を読む](20-testing-issues.md)

## 1. 何が入ったのか（2 つのコミット）

📄 `ターミナル（../angular で実行）`

```
$ git show --stat 05c4d5a8354
05c4d5a8354 2026-08-28 Kristiyan Kostadinov
feat(core): add utility for testing directives
Adds `TestBed.createDirective` to make testing directives easier.
Fixes #54164.

 goldens/public-api/core/testing/index.api.md       |  30 +--
 packages/core/src/core_private_export.ts           |   5 +-
 packages/core/src/render3/component_ref.ts         |  24 ++-
 packages/core/test/test_bed_spec.ts                | 198 ++++++++++++++++++-
 packages/core/testing/src/defer.ts                 |   2 +-
 .../src/{component_fixture.ts => fixture.ts}       | 141 +++++++------
 packages/core/testing/src/test_bed.ts              | 218 ++++++++++++++++-----
 packages/core/testing/src/testing.ts               |   3 +-
 8 files changed, 493 insertions(+), 128 deletions(-)

$ git show --stat 77e2a2a85cd
77e2a2a85cd 2026-09-07 Kristiyan Kostadinov
refactor(core): expose onDestroy in DirectiveFixture
Exposes the `onDestroy` method from the host component in `DirectiveFixture`.
We need this for harnesses in the CDK.

 goldens/public-api/core/testing/index.api.md |  1 +
 packages/core/test/test_bed_spec.ts          | 19 +++++++++++++++++++
 packages/core/testing/src/fixture.ts         |  7 ++++++-
 3 files changed, 26 insertions(+), 1 deletion(-)
```

05c4d5a8354 が本体です。`test_bed.ts` に `createDirective` を足し、`component_fixture.ts` を `fixture.ts` に改名して `ComponentFixture` と `DirectiveFixture` の共通部分を `AbstractFixture` にくくり出し、`component_ref.ts` の `ComponentFactory.create` に引数を 1 つ足しています（3 節）。10 日後の 77e2a2a85cd は `DirectiveFixture` に `onDestroy` を足すだけの変更で、本文に「CDK の harness で要る」とあります（[harness の章](../cdk/20-harness.md)）。`Fixes #54164` の issue をどう読むかは [第 20 回](20-testing-issues.md)で扱います。

📄 `angular/packages/core/testing/src/test_bed.ts` L90–100 （▶ の行: 93, 96, 99）

```ts
 90 │ /**
 91 │  * Options that can be configured for a test directive.
 92 │  *
 93 ▶  * @publicApi 22.2
 94 │  */
 95 │ export interface TestDirectiveOptions {
 96 ▶   tagName?: string;
 97 │ 
 98 │   /** Bindings to apply to the test directive. */
 99 ▶   bindings?: Binding[];
100 │ }
```

93 行目の `@publicApi 22.2` が「22.2 で公開された」印です。options は 96 行目の `tagName` と 99 行目の `bindings` の 2 つです。`createComponent` の `inferTagName` は無く、代わりにタグ名を直接書けます。

## 2. タグ名を決める

コンポーネントは自分のテンプレートを持つので、ホストのタグ名は何でもかまいません（[第 5 回](05-testing-create-component.md)で既定は `div`）。ディレクティブは違います。`button[my-dir]` のようにタグ名がセレクタに入っていれば、そのタグの上でなければ意味が無いことが多いからです。そこで最初にタグ名を決めます。

### セレクタの配列の形

📄 `angular/packages/core/src/render3/interfaces/projection.ts` L9–38 （▶ の行: 13–15, 17, 27–28, 38）

```ts
 9 │ /**
10 │  * Expresses a single CSS Selector.
11 │  *
12 │  * Beginning of array
13 ▶  * - First index: element name
14 ▶  * - Subsequent odd indices: attr keys
15 ▶  * - Subsequent even indices: attr values
16 │  *
17 ▶  * After SelectorFlags.CLASS flag
18 │  * - Class name values
19 │  *
20 │  * SelectorFlags.NOT flag
21 │  * - Changes the mode to NOT
22 │  * - Can be combined with other flags to set the element / attr / class mode
23 │  *
24 │  * e.g. SelectorFlags.NOT | SelectorFlags.ELEMENT
25 │  *
26 │  * Example:
27 ▶  * Original: `div.foo.bar[attr1=val1][attr2]`
28 ▶  * Parsed: ['div', 'attr1', 'val1', 'attr2', '', SelectorFlags.CLASS, 'foo', 'bar']
29 │  *
30 │  * Original: 'div[attr1]:not(.foo[attr2])
31 │  * Parsed: [
32 │  *  'div', 'attr1', '',
33 │  *  SelectorFlags.NOT | SelectorFlags.ATTRIBUTE 'attr2', '', SelectorFlags.CLASS, 'foo'
34 │  * ]
35 │  *
36 │  * See more examples in node_selector_matcher_spec.ts
37 │  */
38 ▶ export type CssSelector = (string | SelectorFlags)[];
```

コンパイラはセレクタの文字列を配列にして、定義の `selectors` に入れます。13 行目、**1 つのセレクタの 0 番目がタグ名**で、タグ名が無ければ空文字です。14〜15 行目のとおり、そのあとに属性の名前と値が交互に並び、17 行目の `SelectorFlags.CLASS` のあとはクラス名です（27〜28 行目の例）。`'form, [ngForm]'` のようにカンマで並べると、配列の配列 `[['form'], ['', 'ngForm', '']]` になります。selector を書かない `@Directive()` は、コンパイラの `parseSelectorToR3Selector`（`packages/compiler/src/core.ts`）が空の配列 `[]` を返します。

### createDirective の前半

📄 `angular/packages/core/testing/src/test_bed.ts` L732–764 （▶ の行: 733–734, 736–737, 740, 742, 745–747, 759, 763）

```ts
732 │   createDirective<T>(type: Type<T>, options?: TestDirectiveOptions): DirectiveFixture<T> {
733 ▶     const renderer = this.inject(TestComponentRenderer);
734 ▶     const directiveDef = getDirectiveDef(type);
735 │ 
736 ▶     if (!directiveDef) {
737 ▶       throw new Error(`It looks like '${stringify(type)}' has not been compiled.`);
738 │     }
739 │ 
740 ▶     let tagName = options?.tagName;
741 │ 
742 ▶     if (!tagName) {
743 │       let tagNameFromSelectors: string | undefined;
744 │ 
745 ▶       for (const [currentTagName] of directiveDef.selectors) {
746 ▶         if (currentTagName) {
747 ▶           if (tagNameFromSelectors && currentTagName !== tagNameFromSelectors) {
748 │             const allTagNames = directiveDef.selectors
749 │               .filter((selector) => selector[0])
750 │               .map((selector) => selector[0])
751 │               .join(', ');
752 │ 
753 │             throw new Error(
754 │               `Directive ${stringify(type)} specifies multiple tag names in its selector ` +
755 │                 `(${allTagNames}). Specify which tag name should be used via the \`tagName\` ` +
756 │                 `key in the options parameter.`,
757 │             );
758 │           }
759 ▶           tagNameFromSelectors = currentTagName as string;
760 │         }
761 │       }
762 │ 
763 ▶       tagName = tagNameFromSelectors;
764 │     }
```

1. **733〜738 行目：renderer と定義**

   `createComponent` と同じく `TestComponentRenderer` を inject し、734 行目で `getDirectiveDef`（`ɵdir`）を読みます。無ければ 737 行目のエラー。`@defer` の確認は無いので、エラーは 1 種類だけです。
2. **740 行目：options.tagName があれば、それで決まり**

   セレクタは見ません。
3. **745 行目：セレクタを 1 つずつ見て、0 番目（タグ名）だけを取り出す**

   `for (const [currentTagName] of directiveDef.selectors)` の分割代入で、各セレクタの 0 番目だけを読みます。746 行目、空文字（タグ名なし）は飛ばします。
4. **747〜758 行目：違うタグ名が 2 つ出たら投げる**

   `button[my-dir], a[my-dir]` なら、1 つ目で `'button'` を覚え（759 行目）、2 つ目の `'a'` が違うので 753 行目で投げます。748〜751 行目でタグ名のあるセレクタを全部集めて、エラーの文面に `(button, a)` と並べます。`a[x], a[y]` のように同じタグ名が 2 回なら投げません（747 行目の `!==`）。
5. **763 行目：見つけたタグ名を使う**

   1 つも無ければ `undefined` のまま次へ進みます。

📄 `angular/packages/core/testing/src/test_bed.ts` L765–774 （▶ の行: 766–767）

```ts
765 │ 
766 ▶     if (!tagName) {
767 ▶       throw new Error(
768 │         `Cannot determine tag name for ${stringify(type)}, because one was not set in ` +
769 │           `the options object and the selector for ${stringify(type)} does not ` +
770 │           `include a tag name. Specify which tag name should be used via the \`tagName\` ` +
771 │           `key in the options parameter.`,
772 │       );
773 │     }
774 │ 
```

766 行目、ここまででタグ名が決まらなければ投げます。`[dir]` のような属性だけのセレクタや、selector の無いディレクティブがこれに当たります。[第 5 回](05-testing-create-component.md)の `inferTagNameFromDefinition` は「最初のセレクタだけを見て、無ければ `div`」でしたが、`createDirective` は**全部のセレクタを見て、決まらなければ `div` にせず投げる**、という違いがあります。

> **🧪 DEMO — セレクタからタグ名を決める手順（再現）**
>
> 左の文字列を配列にする部分は簡易版の再現です（タグ名・`[属性]`・`[属性=値]`・`.クラス` だけ。`:not()` は扱いません。本物はコンパイラの `CssSelector.parse`）。配列からタグ名を決める部分は、test\_bed.ts 740〜773 行目をそのまま関数にしたものです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-directive-fixture)

## 3. DirectiveTestHost にディレクティブを載せる

📄 `angular/packages/core/testing/src/test_bed.ts` L775–801 （▶ の行: 775–776, 778–780, 782–784, 786–787, 789, 791, 794, 796, 800）

```ts
775 ▶     const noNgZone = this.inject(ComponentFixtureNoNgZone, false);
776 ▶     const ngZone = noNgZone ? null : this.inject(NgZone, null);
777 │     const init = () => {
778 ▶       const hostRef = this.createComponentRef(
779 ▶         DirectiveTestHost,
780 ▶         tagName,
781 │         renderer,
782 ▶         undefined,
783 ▶         [
784 ▶           options?.bindings
785 │             ? {
786 ▶                 type,
787 ▶                 bindings: options.bindings,
788 │               }
789 ▶             : type,
790 │         ],
791 ▶         true,
792 │       );
793 │       const fixture = this.runInInjectionContext(
794 ▶         () => new DirectiveFixture(hostRef, hostRef.injector.get(type, null, {self: true})!),
795 │       );
796 ▶       this._activeFixtures.push(fixture);
797 │       return fixture;
798 │     };
799 │ 
800 ▶     return ngZone ? ngZone.run(init) : init();
801 │   }
```

775〜776 行目と 800 行目の `NgZone` の扱いは `createComponent` と同じです（[第 5 回](05-testing-create-component.md)の 6 節）。中身の 778〜792 行目は [standalone-entry-checks](../standalone/09-standalone-entry-checks.md) でも短く見ましたが、ここでは引数を 1 つずつ読みます。

1. **779 行目：作るのはテスト対象ではなく DirectiveTestHost**

   `createComponentRef`（[第 5 回](05-testing-create-component.md)の 3 節）に、ルートのコンポーネントとして `DirectiveTestHost` を渡します。780 行目のタグ名で根の要素が body に置かれるので、**ホストはテスト用のコンポーネントの要素、その上にテスト対象のディレクティブ**、という形になります。
2. **782 行目：ルートのコンポーネント自身への bindings は無し**

   `DirectiveTestHost` には入力も出力も無いので `undefined` です。
3. **783〜790 行目：テスト対象は directives 配列に入れる**

   `options.bindings` があれば `{ type, bindings }`（`DirectiveWithBindings`）にして、無ければクラスそのものを入れます。こうすると `bindings` は `DirectiveTestHost` ではなくテスト対象のディレクティブに向きます（下の 479 行目）。
4. **791 行目：standalone でないディレクティブも許す**

   `allowNonStandaloneDirectives` に `true`。05c4d5a8354 で `ComponentFactory.create` に足された引数です。普段の動的生成は、`directives` に standalone でないディレクティブを渡すと開発モードで `TYPE_IS_NOT_STANDALONE` を投げます（[standalone-entry-checks](../standalone/09-standalone-entry-checks.md) で見た確認）。テストでは `declarations` に書いた NgModule 用のディレクティブも試したいので、この確認を外しています（spec の `should be able to create non-standalone directive declared in an imported module`、:3059）。
5. **794 行目：ディレクティブのインスタンスを、ホストのインジェクタから取る**

   `hostRef.injector` はホスト要素の `NodeInjector`（下の 640〜642 行目）です。`{self: true}` でその要素だけを探すので、ホストに載ったディレクティブのインスタンスが返ります。それを `DirectiveFixture` の 2 つ目の引数に渡し、796 行目で `_activeFixtures` に積みます（後片付けで壊される）。

📄 `angular/packages/core/src/render3/component_ref.ts` L473–493 （▶ の行: 476–477, 479, 482, 487）

```ts
473 │   if (directives) {
474 │     for (let i = 0; i < directives.length; i++) {
475 │       const directive = directives[i];
476 ▶       if (typeof directive !== 'function') {
477 ▶         for (const binding of directive.bindings as BindingInternal[]) {
478 │           varsToAllocate += binding[BINDING].requiredVars;
479 ▶           const targetDirectiveIdx = i + 1;
480 │ 
481 │           if (binding.create) {
482 ▶             binding.targetIdx = targetDirectiveIdx;
483 │             (creationBindings ??= []).push(binding);
484 │           }
485 │ 
486 │           if (binding.update) {
487 ▶             binding.targetIdx = targetDirectiveIdx;
488 │             (updateBindings ??= []).push(binding);
489 │           }
490 │         }
491 │       }
492 │     }
493 │   }
```

`createRootTView` の後半です（前半の `componentBindings` は [第 6 回](06-testing-component-bindings.md)）。476 行目、クラスそのものではなく `{ type, bindings }` のときだけ、その `bindings` を見ます。479 行目の `targetDirectiveIdx = i + 1` が要点で、ルートの `TView` に載る配列は「0 番目がルートのコンポーネント（`DirectiveTestHost`）、1 番目から `directives`」なので、`i + 1` でテスト対象のディレクティブを指します。だから `inputBinding('value', sig)` はディレクティブの `value` に書かれます。

📄 `angular/packages/core/testing/src/test_bed.ts` L1116–1128 （▶ の行: 1117–1119, 1122–1126）

```ts
1116 │ /** Host component used when creating directives during tests. */
1117 ▶ class DirectiveTestHost {
1118 ▶   static ɵfac = () => new DirectiveTestHost();
1119 ▶   static ɵcmp = ɵɵdefineComponent({
1120 │     type: DirectiveTestHost,
1121 │     // Set an attribute on the selector so we don't trigger component ID conflict warnings.
1122 ▶     selectors: [['div', 'ng-directive-test-component', '']],
1123 ▶     decls: 0,
1124 ▶     vars: 0,
1125 ▶     template: () => {},
1126 ▶     encapsulation: ViewEncapsulation.None,
1127 │   });
1128 │ }
```

`DirectiveTestHost` はコンパイラを通さず、1119 行目で `ɵɵdefineComponent` を直接呼んで定義を作っています。1123〜1125 行目、要素の数 0・バインディングの数 0・何もしないテンプレート関数。1126 行目、スタイルの閉じ込め（`ViewEncapsulation`）も無し。つまり**ホスト要素に何も足さない、空っぽのコンポーネント**です。ディレクティブの `host` のクラスやバインディングは、そのままこの要素に付きます。1122 行目のセレクタの属性は、1121 行目のコメントのとおり、コンポーネントの id が他とぶつかったときの警告を避けるためのもので、要素には付きません（ホストは `'#rootN'` で探されるので、[第 5 回](05-testing-create-component.md)の 5 節）。

## 4. DirectiveFixture

📄 `angular/packages/core/testing/src/fixture.ts` L302–322 （▶ の行: 307, 311, 313–315, 319–320）

```ts
302 │ /**
303 │  * Fixture for debugging and testing a directive.
304 │  *
305 │  * @publicApi
306 │  */
307 ▶ export class DirectiveFixture<T> extends AbstractFixture<Element> {
308 │   /**
309 │    * The instance of the directive class.
310 │    */
311 ▶   readonly directiveInstance: T;
312 │ 
313 ▶   constructor(hostRef: ComponentRef<unknown>, directiveInstance: T) {
314 ▶     super(hostRef);
315 ▶     this.directiveInstance = directiveInstance;
316 │   }
317 │ 
318 │   /** Registers a callback that will be invoked when the fixture is destroyed. */
319 ▶   onDestroy(callback: () => void) {
320 ▶     this.hostRef.onDestroy(callback);
321 │   }
322 │ }
```

307 行目、`ComponentFixture` と同じ `AbstractFixture` を継承しているので、`detectChanges`・`whenStable`・`autoDetectChanges`・`debugElement`・`nativeElement` はそのまま使えます （[第 9 回](09-testing-detect-changes.md)〜[第 11 回](11-testing-when-stable.md)）。型引数が `AbstractFixture<Element>` なので、`nativeElement` は `any` ではなく `Element` です。増えるのは 311 行目の `directiveInstance` と、319〜321 行目の `onDestroy` だけで、`componentInstance`・`componentRef`・`getDeferBlocks` はありません。

📄 `angular/packages/core/src/render3/component_ref.ts` L638–651 （▶ の行: 640–641, 648–649）

```ts
638 │   }
639 │ 
640 ▶   override get injector(): Injector {
641 ▶     return new NodeInjector(this._tNode, this._rootLView);
642 │   }
643 │ 
644 │   override destroy(): void {
645 │     this.hostView.destroy();
646 │   }
647 │ 
648 ▶   override onDestroy(callback: () => void): void {
649 ▶     this.hostView.onDestroy(callback);
650 │   }
651 │ }
```

320 行目の `this.hostRef.onDestroy` は、`DirectiveTestHost` の `ComponentRef` の 648〜650 行目で、ホストのビューに後片付けの関数を登録します。ビューが壊されるときはディレクティブの `ngOnDestroy` が先、登録した関数があとです（6 節の spec の 3177 行目）。

## 5. これまでの方法との比較

📄 `これまで（テスト用のホストコンポーネント）`

```
@Directive({selector: '[appHighlight]'})
class Highlight {
  readonly color = input('yellow');
}

// これまで: テスト用のホストコンポーネントを書く
@Component({
  imports: [Highlight],
  template: '<p appHighlight [color]="color()">text</p>',
})
class TestHost {
  readonly color = signal('red');
}

const fixture = TestBed.createComponent(TestHost);
await fixture.whenStable();
const p = fixture.debugElement.query(By.directive(Highlight));
const dir = p.injector.get(Highlight);
fixture.componentInstance.color.set('blue');
```

📄 `22.2 から（createDirective）`

```
// 22.2 から: createDirective（このサイトの 22.1.6 には無い）
const color = signal('red');
const fixture = TestBed.createDirective(Highlight, {
  tagName: 'p',                              // '[appHighlight]' にはタグ名が無いので必須
  bindings: [inputBinding('color', color)],
});
await fixture.whenStable();
const dir = fixture.directiveInstance;
color.set('blue');
```

|   | テスト用のホストコンポーネント | createDirective |
| --- | --- | --- |
| 書くもの | ホストのクラスとテンプレート | 無し（`DirectiveTestHost` が代わり） |
| タグ名 | テンプレートに書いたとおり | セレクタから（2 節）、決まらなければ `tagName` が必須 |
| ディレクティブのインスタンス | `query(By.directive(X))` → `injector.get(X)`（[第 8 回](08-testing-debug-element.md)） | `fixture.directiveInstance`（794 行目で取ってある） |
| 入力を変える | ホストの signal / プロパティを変える | `bindings` の signal を `set`（[第 6 回](06-testing-component-bindings.md)） |
| 1 つの要素に複数のディレクティブ | テンプレートに並べればよい | テスト対象は 1 つ（783〜790 行目の配列は 1 要素） |
| 中身の要素（子要素や投影） | テンプレートに書ける | 無し（1123 行目、要素 0 個） |
| ホストがコンポーネント | あなたのホストのクラス | `DirectiveTestHost`（何も足さない） |

## ここまでの呼び出し

- 👤 `TestBed.createDirective(Dir, { bindings })` — あなたの spec
  - `getDirectiveDef(Dir)` — test\_bed.ts L734
  - タグ名を決める — test\_bed.ts L740-773 — *tagName → selectors\[i\]\[0\]、違えば / 無ければ投げる*
  - `createComponentRef(DirectiveTestHost, tagName, renderer, undefined, [{ type: Dir, bindings }], true)` — test\_bed.ts L778
    - `insertRootElement('rootN', tagName)` — 第 5 回
    - `ComponentFactory.create(..., directives, undefined, undefined, true)` — component\_ref.ts L266
      - `createRootTView` — component\_ref.ts L473 — *Dir の bindings は targetIdx = 1*
  - `hostRef.injector.get(Dir, null, {self: true})` — test\_bed.ts L794
  - `new DirectiveFixture(hostRef, instance)` → `_activeFixtures.push` — fixture.ts L313 / test\_bed.ts L796

## テストと直し方

📄 `angular/packages/core/test/test_bed_spec.ts` L3025–3057 （▶ の行: 3029–3030, 3034, 3038, 3042, 3045–3046, 3051, 3054–3055）

```ts
3025 │   it('should be able to set the tag name of the host element', () => {
3026 │     @Directive({selector: 'hello-world'})
3027 │     class Dir {}
3028 │ 
3029 ▶     const fixture = TestBed.createDirective(Dir, {tagName: 'my-dir'});
3030 ▶     expect(fixture.nativeElement.tagName).toBe('MY-DIR');
3031 │   });
3032 │ 
3033 │   it('should infer the tag name from the selector by default', () => {
3034 ▶     @Directive({selector: 'my-inferred-tag[hello-world]'})
3035 │     class Dir {}
3036 │ 
3037 │     const fixture = TestBed.createDirective(Dir);
3038 ▶     expect(fixture.nativeElement.tagName).toBe('MY-INFERRED-TAG');
3039 │   });
3040 │ 
3041 │   it('should throw if the directive selector does not set a tag name and `tagName` is not specified', () => {
3042 ▶     @Directive({selector: '[dir]'})
3043 │     class Dir {}
3044 │ 
3045 ▶     expect(() => TestBed.createDirective(Dir)).toThrowError(
3046 ▶       /Cannot determine tag name for Dir, because one was not set in the options object and the selector for Dir does not include a tag name/,
3047 │     );
3048 │   });
3049 │ 
3050 │   it('should throw if the directive selector specifies multiple tag name', () => {
3051 ▶     @Directive({selector: 'button[my-dir], a[my-dir]'})
3052 │     class Dir {}
3053 │ 
3054 ▶     expect(() => TestBed.createDirective(Dir)).toThrowError(
3055 ▶       /Directive Dir specifies multiple tag names in its selector \(button, a\)/,
3056 │     );
3057 │   });
```

📄 `angular/packages/core/test/test_bed_spec.ts` L3161–3179 （▶ の行: 3166, 3172, 3176–3177）

```ts
3161 │   it('should invoke destroy callbacks when the fixture is destroyed', () => {
3162 │     const callbacks: string[] = [];
3163 │ 
3164 │     @Directive()
3165 │     class Dir {
3166 ▶       ngOnDestroy() {
3167 │         callbacks.push('directive: ngOnDestroy');
3168 │       }
3169 │     }
3170 │ 
3171 │     const fixture = TestBed.createDirective(Dir, {tagName: 'div'});
3172 ▶     fixture.onDestroy(() => callbacks.push('fixture: onDestroy'));
3173 │     fixture.detectChanges();
3174 │     expect(callbacks).toEqual([]);
3175 │ 
3176 ▶     fixture.destroy();
3177 ▶     expect(callbacks).toEqual(['directive: ngOnDestroy', 'fixture: onDestroy']);
3178 │   });
3179 │ });
```

`packages/core/test/test_bed_spec.ts` の一番外側の `describe('TestBed.createDirective')`（:2969）に 12 本あります。3029〜3030 行目が `tagName` の指定、3034〜3038 行目がセレクタからの推定、3045〜3046 行目と 3054〜3055 行目が 2 節の 2 種類のエラーです。3172 行目と 3177 行目が 4 節の `onDestroy`（77e2a2a85cd が足した spec）で、`ngOnDestroy` が先、`onDestroy` の関数があとの順を確かめています。ほかに `bindings` の入力（:2987）と出力（:3006）、非 standalone（:3059）、DI（:3085・:3100・:3125）の `it` があります。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test:test --test_arg=--filter="TestBed.createDirective" --test_output=all
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Ran 3 of 1392 specs
3 specs, 0 failures
Ran 3 of 1392 specs
3 specs, 0 failures
Ran 3 of 1392 specs
3 specs, 0 failures
Ran 3 of 1392 specs
3 specs, 0 failures
INFO: Elapsed time: 6.066s, Critical Path: 2.31s
//packages/core/test:test                                                PASSED in 1.6s
```

1. **名前の作り方と Ran の合計**

   フルネームは「`TestBed.createDirective should ...`」です。`--filter` は正規表現なので `.` は任意の 1 文字に一致しますが、そのままでも 12 本だけに一致しました。4 つに分かれて 3 + 3 + 3 + 3 = **12 本**。spec の `it` の数と同じです。
2. **直すとしたら**

   タグ名の決め方は `test_bed.ts` の `createDirective` の 740〜773 行目、載せ方は 777〜798 行目の `init`、`bindings` の向き先は `component_ref.ts` の `createRootTView`、fixture の API は `fixture.ts` の `DirectiveFixture` です。spec は `describe('TestBed.createDirective')` に足します。公開 API を変えると `goldens/public-api/core/testing/index.api.md` も変わります（05c4d5a8354 と 77e2a2a85cd の両方が触っている）。
3. **issue を読むときの手がかり**

   「`createDirective` でエラーになる」報告は、まず 2 節の 2 つの文面のどちらかを見ます。「ディレクティブのクラスがホストに付かない」なら、セレクタではなく `tagName` で決まった要素に付いているか、`DirectiveTestHost` が何も足さないことを確かめます（[第 20 回](20-testing-issues.md)）。

## 聞かれそうな質問

**Q. 属性セレクタのディレクティブだと、タグは何になりますか？**

決まらずに投げます。`[dir]` は `[['', 'dir', '']]` で 0 番目が空文字なので、test\_bed.ts 746 行目で飛ばされ、766〜772 行目の `Cannot determine tag name for Dir ...` になります（spec の 3045〜3046 行目）。`createDirective(Dir, { tagName: 'div' })` のように、使う場所に合わせて指定します。`createComponent` のように `div` にはしません。

**Q. bindings は使えますか？setInput は？**

`bindings` は使えます。783〜790 行目で `{ type, bindings }` にして渡し、`createRootTView` の 479 行目で `targetIdx = i + 1`、つまりテスト対象のディレクティブに向きます。入力は `inputBinding` に signal を渡して `set` します（spec :2987）。`DirectiveFixture` には `componentRef` が無く、`setInput` を呼ぶ口はありません。持っている `hostRef` は `DirectiveTestHost` のもので、外からは見えません（`protected`）。

**Q. ホストディレクティブ（hostDirectives）を持つディレクティブはどうなりますか？**

`createDirective` は、テスト対象を `ComponentFactory.create` の `directives` に入れるだけです（778〜792 行目）。`directives` に入れたディレクティブのホストディレクティブが適用され、入力も束ねられることは、`create_component_spec.ts` の `should bind to inputs of host directives of directives applied to the root component`（:787）が公開 API の `createComponent` で確かめています。`createDirective` の spec にはホストディレクティブを使う `it` はありません（12 本の名前を見たかぎり）。ホストディレクティブそのものは [hostDirectives の章](../standalone/10-standalone-host-directives.md)です。

**Q. button\[my-dir\], a\[my-dir\] のディレクティブは、どうテストすればよいですか？**

`tagName` を指定して、タグごとに作ります。747 行目で違うタグ名が 2 つあると投げるので（spec の 3054〜3055 行目、文面は `(button, a)`）、`createDirective(Dir, { tagName: 'button' })` と `{ tagName: 'a' }` の 2 本の `it` にします。

**Q. このサイト（22.1.6）で同じことをしたいときは？**

5 節の「これまで」の書き方をします。テスト用のホストコンポーネントのテンプレートでディレクティブを使い、`By.directive` で要素を探してインジェクタからインスタンスを取ります（[第 8 回](08-testing-debug-element.md)）。

## 読み終えて

- `TestBed.createDirective` は 22.2 の API（05c4d5a8354）。このサイトの 22.1.6 には無い
- タグ名は `options.tagName` → 全セレクタの 0 番目。違うタグ名が 2 つ、または 1 つも無いと投げる（`div` にはしない）
- ホストは空っぽのコンポーネント `DirectiveTestHost`。テスト対象は `directives` 配列に入り、`bindings` は `targetIdx = i + 1` でテスト対象に向く
- `allowNonStandaloneDirectives: true` で、NgModule に宣言したディレクティブも載せられる
- `DirectiveFixture` は `AbstractFixture` の上に `directiveInstance` と `onDestroy` だけを足したもの

---

← 前: [入力の渡し方：setInput と bindings（inputBinding・outputBinding・twoWayBinding）](06-testing-component-bindings.md)  
次: [DebugElement と By：テストから DOM とコンポーネントを覗く](08-testing-debug-element.md) →
