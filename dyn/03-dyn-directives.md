[目次](../README.md) › [動的コンポーネント：createComponent と ViewContainerRef](README.md) › 第 3 回 / 全 6 回

# directives の選択肢：作るときにディレクティブを当てる

> createComponent の directives に渡したディレクティブが、selector の照合なしでコンポーネントの後ろに並び、host directive が前に差し込まれ、その順にコンストラクタとライフサイクルが回るまでを spec で読む。同じものを 2 回（NG0309）・standalone でないもの（NG0907）の確かめは開発モードだけで、本番では 2 回作られたりそのまま作られたりすること、コンポーネントの host directive をもう一度渡すと 1 つにまとまって後ろに移ること、DirectiveWithBindings の bindings はそのディレクティブだけに届くこと。ページの上でディレクティブを選んで作り直し、ホストの属性とライフサイクルの順を記録する。#68779 で TestBed.createComponent に directives が入らなかった経緯。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dyn-directives)

---

`createComponent(Cmp, { directives: [DirA, DirB] })` と書くと、テンプレートの selector の照合をしないで、ホストの要素にディレクティブを当てられます。この章では、渡したディレクティブが**どの順に並び、いつ作られ、ホストの属性とライフサイクルがどの順で回るか**を、spec と、ページの上で作り直す実験で確かめます。同じものを 2 回渡したとき、コンポーネントの host directive をもう一度渡したとき、standalone でないものを渡したときに何が起きるかも、開発モードと本番の両方で記録します。

読む対象は `packages/core/test/acceptance/create_component_spec.ts` の `describe('attaching directives to root component')` と、それが固めている `packages/core/src/render3/component_ref.ts` の `createRootTView`・`createComponentRef`、`packages/core/src/render3/view/directives.ts` です。ソースの行はほかの章で引用済みなので、リンクで済ませます。並べる行は [standalone-entry-checks](../standalone/09-standalone-entry-checks.md) の 5 節、並んだ def をホストに載せる行は [ivy-first-create-pass](../ivy/08-ivy-first-create-pass.md) の 3〜5 節、host directive の並べ方は [standalone-host-directives](../standalone/10-standalone-host-directives.md) の 4〜5 節です。

1. [1. 2 つの入口](01-dyn-entry-points.md)
2. [2. ComponentFactory.create の中](02-dyn-factory-create.md)
3. **3. directives の選択肢**（この章）
4. [4. bindings と ComponentRef](04-dyn-bindings-ref.md)
5. [5. ViewContainerRef とホストの守り](05-dyn-vcr-host.md)
6. [6. spec と issue](06-dyn-tests-issues.md)

## 1. 何が起きているか：照合しないで「もう当たったもの」として渡す

1. **createRootTView：コンポーネントを先頭に、渡した順に並べる**

   ルートの `TView` を作るとき、`[componentDef]` から始まる配列に、`directives` の各要素の `ɵdir` を順に足し、それを `TView` の `directiveRegistry`（そのビューで使えるディレクティブの一覧）にします。開発モードでは、`ɵdir` が無ければ `NG0916`、standalone でなければ `NG0907` です（[standalone-entry-checks](../standalone/09-standalone-entry-checks.md) の 5 節）。
2. **directiveHostFirstCreatePass：照合の関数が「一覧をそのまま返す」**

   テンプレートの要素なら、ここで selector を照合してディレクティブを選びます。`createComponentRef` は照合の関数として `() => rootTView.directiveRegistry` を渡すので、**一覧の全部が「当たった」ことになります**（[boot-application-ref](../boot/10-boot-application-ref.md) の 5 節の引用）。selector を持たないディレクティブ（`@Directive({})`）も当てられるのはこのためです。
3. **resolveDirectives：host directive を差し込み、重複を確かめる**

   当たった一覧に host directive を持つものがあれば、その並べ替えの関数を呼びます。並びは「コンポーネントの host directive → コンポーネント → 渡したディレクティブの host directive（まとめて）→ 渡したディレクティブ」です（[standalone-host-directives](../standalone/10-standalone-host-directives.md) の 4 節）。そのあと、開発モードだけ同じ def が 2 回無いかを確かめ、あれば `NG0309` を投げます（[hdi-host-dedupe](../hdi/04-hdi-host-dedupe.md) の 1 節）。
4. **initializeDirectives → createDirectivesInstances：並んだ順に作る**

   ホストの属性（`hostAttrs`）は並んだ順に合成され、フックも並んだ順に登録され、インスタンスも並んだ順に作られます（[ivy-first-create-pass](../ivy/08-ivy-first-create-pass.md) の 4〜5 節、[ivy-directives](../ivy/14-ivy-directives.md) の 4 節）。`createComponent` が返る前に、全部のコンストラクタが終わっています。`ngOnInit` などは、最初の変更検知のときです。

## 2. spec で確かめる：属性と、作られる順

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L259–285 （▶ の行: 262, 264–265, 270, 276–277）

```ts
259 │     it('should be able to attach directives when creating a component', () => {
260 │       const logs: string[] = [];
261 │ 
262 ▶       @Directive({
263 │         host: {
264 ▶           'class': 'class-1',
265 ▶           'attr-one': 'one',
266 │         },
267 │       })
268 │       class Dir1 {
269 │         constructor() {
270 ▶           logs.push('Dir1');
271 │         }
272 │       }
273 │ 
274 │       @Directive({
275 │         host: {
276 ▶           'class': 'class-2',
277 ▶           'attr-two': 'two',
278 │         },
279 │       })
280 │       class Dir2 {
281 │         constructor() {
282 │           logs.push('Dir2');
283 │         }
284 │       }
285 │ 
```

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L286–314 （▶ の行: 289–290, 306, 309–311, 313）

```ts
286 │       @Component({
287 │         template: '',
288 │         host: {
289 ▶           'class': 'host',
290 ▶           'attr-three': 'host',
291 │         },
292 │ 
293 │         changeDetection: ChangeDetectionStrategy.Eager,
294 │       })
295 │       class HostComponent {
296 │         constructor() {
297 │           logs.push('HostComponent');
298 │         }
299 │       }
300 │ 
301 │       const hostElement = document.createElement('div');
302 │       const environmentInjector = TestBed.inject(EnvironmentInjector);
303 │       createComponent(HostComponent, {
304 │         hostElement,
305 │         environmentInjector,
306 ▶         directives: [Dir1, Dir2],
307 │       });
308 │ 
309 ▶       expect(logs).toEqual(['HostComponent', 'Dir1', 'Dir2']);
310 ▶       expect(hostElement.className).toBe('host class-1 class-2');
311 ▶       expect(hostElement.getAttribute('attr-one')).toBe('one');
312 │       expect(hostElement.getAttribute('attr-two')).toBe('two');
313 ▶       expect(hostElement.getAttribute('attr-three')).toBe('host');
314 │     });
```

262 行目と 274 行目のディレクティブは、どちらも selector を書いていません。306 行目で渡すと、309 行目でコンストラクタが `HostComponent` → `Dir1` → `Dir2` の順に呼ばれています。310 行目の `className` は `host class-1 class-2` で、289 行目のコンポーネントの `class` が先、渡したディレクティブの `class` が後ろです。311〜313 行目、`attr-one`・`attr-two`・`attr-three` の 3 つの属性がすべて付いています。

host directive があるときの順を固めているのが次の spec です。

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L399–418 （▶ の行: 399, 409）

```ts
399 ▶       @Directive({hostDirectives: [Chain3_2]})
400 │       class Chain3 {
401 │         constructor() {
402 │           logs.push('Chain3 - level 1');
403 │         }
404 │       }
405 │ 
406 │       @Component({
407 │         selector: 'my-comp',
408 │         template: '',
409 ▶         hostDirectives: [Chain1, Chain2, Chain3],
410 │ 
411 │         changeDetection: ChangeDetectionStrategy.Eager,
412 │       })
413 │       class HostComponent {
414 │         constructor() {
415 │           logs.push('HostComponent');
416 │         }
417 │       }
418 │ 
```

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L419–453 （▶ の行: 438, 442, 444, 448–451）

```ts
419 │       @Directive()
420 │       class Dir1 {
421 │         constructor() {
422 │           logs.push('Dir1');
423 │         }
424 │       }
425 │ 
426 │       @Directive({})
427 │       class Dir2 {
428 │         constructor() {
429 │           logs.push('Dir2');
430 │         }
431 │       }
432 │ 
433 │       const hostElement = document.createElement('div');
434 │       const environmentInjector = TestBed.inject(EnvironmentInjector);
435 │       createComponent(HostComponent, {
436 │         hostElement,
437 │         environmentInjector,
438 ▶         directives: [Dir1, Dir2],
439 │       });
440 │ 
441 │       expect(logs).toEqual([
442 ▶         'Chain1 - level 3',
443 │         'Chain1 - level 2',
444 ▶         'Chain1 - level 1',
445 │         'Chain2 - level 2',
446 │         'Chain2 - level 1',
447 │         'Chain3 - level 2',
448 ▶         'Chain3 - level 1',
449 ▶         'HostComponent',
450 ▶         'Dir1',
451 ▶         'Dir2',
452 │       ]);
453 │     });
```

409 行目、コンポーネント自身が `hostDirectives: [Chain1, Chain2, Chain3]` を持ち、それぞれがさらに host directive を持っています。438 行目で `Dir1`・`Dir2` を渡すと、442〜448 行目で 3 本の鎖が「深い方から」作られ、449 行目でコンポーネント、450〜451 行目で渡した 2 つ、の順になります。**渡したディレクティブは、コンポーネントとその host directive の全部より後ろ**です。コンポーネントの host binding を、渡したディレクティブの host binding で上書きできる、ということでもあります。

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L455–489 （▶ の行: 484, 487–488）

```ts
455 │     it('should destroy the attached directives when the component ref is destroyed', () => {
456 │       const logs: string[] = [];
457 │ 
458 │       @Directive({})
459 │       class Dir1 implements OnDestroy {
460 │         ngOnDestroy() {
461 │           logs.push('Dir1');
462 │         }
463 │       }
464 │ 
465 │       @Directive({})
466 │       class Dir2 implements OnDestroy {
467 │         ngOnDestroy() {
468 │           logs.push('Dir2');
469 │         }
470 │       }
471 │ 
472 │       @Component({template: '', changeDetection: ChangeDetectionStrategy.Eager})
473 │       class HostComponent implements OnDestroy {
474 │         ngOnDestroy() {
475 │           logs.push('HostComponent');
476 │         }
477 │       }
478 │ 
479 │       const hostElement = document.createElement('div');
480 │       const environmentInjector = TestBed.inject(EnvironmentInjector);
481 │       const ref = createComponent(HostComponent, {
482 │         hostElement,
483 │         environmentInjector,
484 ▶         directives: [Dir1, Dir2],
485 │       });
486 │ 
487 ▶       ref.destroy();
488 ▶       expect(logs).toEqual(['HostComponent', 'Dir1', 'Dir2']);
489 │     });
```

487 行目の `ref.destroy()` で、488 行目のとおり `ngOnDestroy` も同じ順（コンポーネント → 渡した順）で呼ばれます。渡したディレクティブの寿命はコンポーネントと同じです。

## 3. DEMO：ディレクティブを選んで作り直す

ページの上の本物（`@angular/core` 22.1.6）で、`DdHost`（`hostDirectives: [DdHostHD]` を持つコンポーネント）に渡すディレクティブを選んで作り直します。ライフサイクルの記録は、各ディレクティブが `inject(DD_LOG)` した関数に書きます。`DD_LOG` は `elementInjector` に渡した `Injector.create` にだけあるトークンです（[第 2 回](02-dyn-factory-create.md)の 2 節）。

> **🧪 DEMO — directives の組み合わせとライフサイクルの順**
>
> いま動いているのは本番ビルドです（`isDevMode()` が `false`）。開発モードだけの確かめ（`NG0309`・`NG0907`）は、本番ビルドでは行われません。
>
> `directives: （まだ作っていません）`
>
> ホストの要素の開始タグ:
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dyn-directives)

1. **最初の組み合わせ（DdA と DdB）**

   コンストラクタは `DdHostHD → DdHost → DdBInner → DdA → DdB` の順です。`DdBInner` は `DdB` の host directive ですが、`DdB` の直前ではなく `DdA` より前に来ます。1 節の 3 つ目の手順の「渡したディレクティブの host directive はまとめて前」のとおりです。`ngOnInit` と `ngAfterViewInit` も同じ順で、`destroy` の `ngOnDestroy` も同じ順でした。class は `dd-host-hd dd-host dd-b-inner dd-a dd-b` の順に並びます。
2. **DdA を bindings 付きで渡す**

   `DdA` にだけ `ngOnChanges` が呼ばれ、ホストに `data-tone="red"` が付きます。「tone を次の色に」を押すと `data-tone` が変わります。`{ type, bindings }` の `bindings` は、そのディレクティブだけに届きます（5 節）。
3. **DdHostHD をもう一度渡す**

   `DdHostHD` は 1 つしか作られず、`NG0309` にもなりません。ただし順番が変わり、`DdHost` より**後ろ**の、`directives` に書いた位置に移ります（DdA と一緒なら `DdHost → DdA → DdHostHD`、class も `dd-host dd-a dd-host-hd` の順）。host directive の並べ替えは「当たった一覧に既にあるものは host directive として足さない」ので、`directives` に渡した方の位置が使われます（[hdi-host-dedupe](../hdi/04-hdi-host-dedupe.md) の 2 節と同じ仕組み）。
4. **DdA を 2 回、DdNonSa を渡す**

   開発モードなら `NG0309`（同じディレクティブが 2 回）と `NG0907`（standalone でない）で止まり、画面の赤い行に code が出ます。本番ビルドでは止まらず、`DdA` のコンストラクタが 2 回呼ばれ、`DdNonSa` もふつうに作られます。下の記録で、両方を並べます。

### 開発モードと本番の記録（Node）

同じ組み合わせを、記録のスクリプトで 22.1.6 と 22.2.6 を Node で動かして確かめました。本番は `@angular/core` を読む前に `globalThis.ngDevMode = false` にしています。2 つの版で結果は同じでした。コンポーネントは `Host`（`hostDirectives: [CmpHD]`）、渡すのは `DA`・`DB`（`hostDirectives: [DBInner]`）などです。

| directives | 開発モード | ngDevMode = false |
| --- | --- | --- |
| directives なし | `class="cmp-hd host"、記録 16 行` | `class="cmp-hd host"、記録 16 行` |
| \[DA, DB\] | `class="cmp-hd host db-inner da db"、記録 37 行` | `class="cmp-hd host db-inner da db"、記録 37 行` |
| \[DB, DA\] | `class="cmp-hd host db-inner db da"、記録 37 行` | `class="cmp-hd host db-inner db da"、記録 37 行` |
| \[DA, DA\]（同じものを 2 回） | `投げる: NG0309: Directive DA matches multiple times on the same element. Directives can only match an element once.` | `class="cmp-hd host da"、記録 30 行` |
| \[CmpHD\]（コンポーネントの host directive をもう一度） | `class="host cmp-hd"、記録 16 行` | `class="host cmp-hd"、記録 16 行` |
| \[NonSa\]（standalone: false） | `投げる: NG0907: The NonSa directive must be standalone in order to be applied to a dynamically-created component.` | `class="cmp-hd host"、記録 23 行` |
| \[OtherCmp\]（コンポーネント） | `投げる: NG0916: Type OtherCmp does not have 'ɵdir' property.` | `投げる: Cannot read properties of null (reading 'hostDirectives')` |
| \[{type: DA, bindings: \[inputBinding(val)\]}\] + bindings なし | `class="cmp-hd host da"、記録 24 行` | `class="cmp-hd host da"、記録 24 行` |
| \[DA\] + bindings: \[inputBinding(val)\]（コンポーネントへ） | `class="cmp-hd host da"、記録 24 行` | `class="cmp-hd host da"、記録 24 行` |

📄 `記録（Node、開発モード、[DA, DB]、ngDoCheck の行は省略）`

```
CmpHD constructor
Host constructor
DBInner constructor
DA constructor
DB constructor
CmpHD ngOnInit
Host ngOnInit
DBInner ngOnInit
DA ngOnInit
DB ngOnInit
CmpHD ngAfterContentInit
Host ngAfterContentInit
DBInner ngAfterContentInit
DA ngAfterContentInit
DB ngAfterContentInit
CmpHD ngAfterViewInit
Host ngAfterViewInit
DBInner ngAfterViewInit
DA ngAfterViewInit
DB ngAfterViewInit
--- 2 回目の detectChanges
--- destroy
CmpHD ngOnDestroy
Host ngOnDestroy
DBInner ngOnDestroy
DA ngOnDestroy
DB ngOnDestroy
```

- `[OtherCmp]`（コンポーネントのクラス）は、開発モードでは `NG0916`（`ɵdir` が無い）ですが、本番では `getDirectiveDef` が `null` を返して配列に `null` が入り、host directive を並べる関数の中で `Cannot read properties of null (reading 'hostDirectives')` という、原因の分かりにくい `TypeError` になりました。
- `[DA, DA]` は本番で記録が 30 行になり、`DA` の各フックが 2 回ずつ呼ばれています（開発モードは `NG0309`）。
- どの場面でも `ngOnInit` などのフックは、最初の `detectChanges()` の中で呼ばれました。`createComponent` が返った時点では、コンストラクタだけです。

## 4. spec で確かめる：開発モードの 2 つの確かめ

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L559–576 （▶ の行: 573, 575）

```ts
559 │     it('should throw if the same directive is attached multiple times', () => {
560 │       @Directive({})
561 │       class Dir {}
562 │ 
563 │       @Component({template: '', changeDetection: ChangeDetectionStrategy.Eager})
564 │       class HostComponent {}
565 │ 
566 │       const hostElement = document.createElement('div');
567 │       const environmentInjector = TestBed.inject(EnvironmentInjector);
568 │ 
569 │       expect(() => {
570 │         createComponent(HostComponent, {
571 │           hostElement,
572 │           environmentInjector,
573 ▶           directives: [Dir, Dir],
574 │         });
575 ▶       }).toThrowError(/Directive Dir matches multiple times on the same element/);
576 │     });
```

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L638–657 （▶ の行: 639, 652, 655）

```ts
638 │     it('should throw if attached directive is not standalone', () => {
639 ▶       @Directive({standalone: false})
640 │       class Dir {}
641 │ 
642 │       @Component({template: '', changeDetection: ChangeDetectionStrategy.Eager})
643 │       class HostComponent {}
644 │ 
645 │       const hostElement = document.createElement('div');
646 │       const environmentInjector = TestBed.inject(EnvironmentInjector);
647 │ 
648 │       expect(() => {
649 │         createComponent(HostComponent, {
650 │           hostElement,
651 │           environmentInjector,
652 ▶           directives: [Dir],
653 │         });
654 │       }).toThrowError(
655 ▶         /The Dir directive must be standalone in order to be applied to a dynamically-created component/,
656 │       );
657 │     });
```

575 行目は `NG0309` の文、655 行目は `NG0907` の文を確かめています。spec は開発モード（`ngDevMode` が真）で走るので、3 節の「本番では止まらない」側を固めている spec はありません。同じ describe にある「ディレクティブでないクラス」（:578）・「`{ type, bindings }` の形でディレクティブでないクラス」（:596）・「コンポーネントのクラス」（:619）の 3 本は、どれも `does not have 'ɵdir' property`（`NG0916`）を確かめています。

> [!NOTE]
> **ポイント**
>
> standalone でないディレクティブを当てられる抜け道が 1 つあります。`ComponentFactory.create` の 8 番目の引数 `allowNonStandaloneDirectives` で、`TestBed.createDirective`（05c4d5a8354、22.2 から）だけが渡します（[testing-directive-fixture](../testing/07-testing-directive-fixture.md)）。公開 API の `createComponent` は渡しません。

## 5. DirectiveWithBindings：特定のディレクティブにだけ届ける

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L891–928 （▶ の行: 892–894, 904, 906–907, 910–911, 916–919, 926–927）

```ts
891 │       @Component({template: '', changeDetection: ChangeDetectionStrategy.Eager})
892 ▶       class RootComp {
893 ▶         @Input() someInput = '';
894 ▶         @Input() someOtherInput = '';
895 │       }
896 │ 
897 │       const oneValue = signal('initial');
898 │       const twoValue = signal('initial');
899 │       const hostElement = document.createElement('div');
900 │       const environmentInjector = TestBed.inject(EnvironmentInjector);
901 │       const ref = createComponent(RootComp, {
902 │         hostElement,
903 │         environmentInjector,
904 ▶         directives: [
905 │           {
906 ▶             type: RootDir1,
907 ▶             bindings: [inputBinding('someInput', oneValue)],
908 │           },
909 │           {
910 ▶             type: RootDir2,
911 ▶             bindings: [inputBinding('someOtherInput', twoValue)],
912 │           },
913 │         ],
914 │       });
915 │       ref.changeDetectorRef.detectChanges();
916 ▶       expect(ref.instance.someInput).toBe('');
917 ▶       expect(ref.instance.someOtherInput).toBe('');
918 ▶       expect(dir1Instance.someInput).toBe('initial');
919 ▶       expect(dir2Instance.someOtherInput).toBe('initial');
920 │ 
921 │       oneValue.set('one changed');
922 │       twoValue.set('two changed');
923 │       ref.changeDetectorRef.detectChanges();
924 │       expect(ref.instance.someInput).toBe('');
925 │       expect(ref.instance.someOtherInput).toBe('');
926 ▶       expect(dir1Instance.someInput).toBe('one changed');
927 ▶       expect(dir2Instance.someOtherInput).toBe('two changed');
928 │     });
```
*it('should bind input to directives, but not the root component')（:869）の後半。*

892〜895 行目のとおり、コンポーネントの `RootComp` も、2 つのディレクティブと同じ名前の入力 `someInput`・`someOtherInput` を持っています。906〜907 行目と 910〜911 行目で、ディレクティブごとに別の signal を `inputBinding` で渡しています。916〜917 行目、コンポーネント自身にも同じ名前の入力がありますが、空のままです。918〜919 行目と 926〜927 行目、それぞれのディレクティブにだけ値が届き、signal を変えると追いかけます。

1. **届け先は「directives の何番目か」で決まる**

   `createRootTView` は、`directives` の `i` 番目の要素の `bindings` に `targetIdx = i + 1`（0 番はコンポーネント）を書きます（[testing-directive-fixture](../testing/07-testing-directive-fixture.md) の 3 節の引用）。値を書く側は、`directiveRegistry[targetIdx]` の def の型で、ホストの `TNode` の `directiveToIndex` を引いて書き込み先を決めます（[hdi-host-providers-bindings](../hdi/05-hdi-host-providers-bindings.md) の 4 節）。host directive が前に差し込まれて並びがずれても、型で引くので届け先はずれません。
2. **コンポーネントへの bindings はコンポーネントにだけ**

   `createComponent` の `bindings`（`directives` の中ではない方）は `targetIdx = 0` なので、同じ名前の入力を持つディレクティブがあっても届きません（spec の `should not bind root component inputs to directives`、:698）。`setInput` は逆に、名前が合う入力を全部書きます（`should write to the inputs of the attached directives using setInput`、:522）。bindings と setInput の違いは[第 4 回](04-dyn-bindings-ref.md)で読みます。

## 6. TestBed.createComponent に directives が無い理由（#68779）

2026-05-18 に、`TestBed.createComponent` にも `directives` を足してほしいという issue #68779 と、その実装の PR #68780 が出ました。フォームのコントロールのテストで、`formControl` を当てるためだけにテスト用のホストのコンポーネントを書きたくない、という動機です。PR には「`TestBed.createComponent` は、アプリの中で使われるのと同じ形でコンポーネントをテストするためのもので、任意のディレクティブを当てるためのものではないので、意図して入れていない」という返事が付き、2026-05-20 に閉じられました。issue の方は、ディレクティブをテストするための `TestBed.createDirective`（05c4d5a8354、`Fixes #54164`）が入った 2026-08-28 に閉じられています（[testing-directive-fixture](../testing/07-testing-directive-fixture.md)）。

## ここまでの呼び出し

- 👤 `createComponent(Cmp, { environmentInjector, hostElement, directives: [A, { type: B, bindings }] })` — あなたのコード
  - `createRootTView(..., bindings, directives)` — component\_ref.ts — *targetIdx = i + 1、\[cmpDef, A, B\] を directiveRegistry に*
    - `getDirectiveDefOrThrow` / standalone の確かめ — 開発モードだけ（NG0916・NG0907）
  - `directiveHostFirstCreatePass(..., () => rootTView.directiveRegistry)` — view/elements.ts — *照合しない*
    - `resolveDirectives` → `resolveHostDirectives` — view/directives.ts — *host directive を前に*
      - `assertNoDuplicateDirectives` — 開発モードだけ（NG0309）
    - `initializeDirectives` — hostAttrs の合成・フックの登録
  - `createDirectivesInstances` — 並んだ順にコンストラクタ
- 👤 `ref.changeDetectorRef.detectChanges()` — 最初の変更検知で ngOnChanges / ngOnInit / ngAfterViewInit

## テストと直し方

`create_component_spec.ts` の `describe('createComponent')`（:41）→ `describe('attaching directives to root component')`（:258）に 11 本、`DirectiveWithBindings` は `describe('root component inputs')`（:660）の `should bind input to directives, but not the root component`（:869）などにあります。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
  --test_arg=--filter="createComponent attaching directives to root component"
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
  --test_arg=--filter="createComponent root component inputs should bind input to directives"
```

📄 `出力（抜粋。2026-11-15 に実行）`

```
Ran 11 of 2693 specs
11 specs, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.3s
Ran 1 of 2693 specs
1 spec, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.7s
```

1. **本数の確かめ方**

   `describe('attaching directives to root component')` の中の `it(` は :259 から :638 までの 11 本で、`Ran 11` と一致しました。
2. **直すとしたら**

   並べる行と standalone の確かめは `component_ref.ts` の `createRootTView`、重複の確かめは `view/directives.ts` の `assertNoDuplicateDirectives`、host directive の並べ替えは `features/host_directives_feature.ts` の `resolveHostDirectives` です。「コンポーネントの host directive を `directives` にも渡すと、1 つにまとまって順番がコンポーネントの後ろに変わる」ことを固める spec は今はありません。足すなら :348 の `should execute host directives in the correct order` の隣です。

## 聞かれそうな質問

**Q. directives で渡したディレクティブに selector は要りますか？**

要りません。照合の関数が一覧をそのまま返すので、selector は見られません。spec の 262 行目と 274 行目のディレクティブも selector を書いていません。

**Q. 渡したディレクティブと、コンポーネントの host directive は、どちらが先に作られますか？**

コンポーネントの host directive が先です。並びは「コンポーネントの host directive → コンポーネント → 渡したディレクティブの host directive → 渡したディレクティブ」で、spec の 442〜451 行目が固めています。ただし同じディレクティブを `directives` にも渡すと、1 つにまとまってコンポーネントの後ろに移ります（DEMO）。

**Q. 同じディレクティブを 2 回渡すとどうなりますか？**

開発モードでは `NG0309: Directive Dir matches multiple times on the same element.` で止まります（spec の 575 行目）。本番ビルドでは確かめが無いので、インスタンスが 2 つ作られ、フックも 2 回ずつ呼ばれました（DEMO と記録）。

**Q. ngOnInit はいつ呼ばれますか？**

`createComponent` が返った時点ではコンストラクタだけで、最初の変更検知のときです。`appRef.attachView` したなら次の `tick`、そうでなければ自分で呼ぶ `changeDetectorRef.detectChanges()` の中です（記録の `[DA, DB]` の行）。

**Q. DirectiveWithBindings で渡した入力は、コンポーネントにも届きますか？**

届きません。`{ type, bindings }` の `bindings` は、その `type` のディレクティブだけに書かれます。spec の 916〜917 行目で、同じ名前の入力を持つコンポーネントは空のままです。

## 読み終えて

- `directives` は selector の照合を飛ばして「当たったもの」として並べる。コンポーネントが先頭、渡した順にその後ろ
- host directive は前に差し込まれる。渡したディレクティブの host directive は、渡したディレクティブ全部より前にまとまる
- コンストラクタは `createComponent` の中、`ngOnInit` などは最初の変更検知。どれも並んだ順
- 重複（NG0309）と standalone（NG0907）の確かめは開発モードだけ。本番では 2 回作られたり、そのまま作られたりする
- `{ type, bindings }` の bindings はそのディレクティブだけに届く。`createComponent` の `bindings` はコンポーネントだけに届く

---

← 前: [ComponentFactory.create の中：注入器・tracing・ホストの要素](02-dyn-factory-create.md)  
次: [bindings と ComponentRef：作ったあとの入力・出力・破棄](04-dyn-bindings-ref.md) →
