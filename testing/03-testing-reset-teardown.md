[目次](../README.md) › [テストの内側](README.md) › 第 3 回 / 全 20 回

# テストごとの後片付け：resetTestingModule と destroyAfterEach

> getCleanupHook が beforeEach と afterEach のどちらで resetTestingModule を呼ぶかを destroyAfterEach で決める仕組み。resetTestingModule の try / finally の連なり（destroyActiveFixtures → tearDownTestingModule → オプションを戻す）、fixture の破棄で投げられたエラーを数えて最後に投げる行、removeAllRootElements が DOM の根を消す順番、rethrowErrors の既定値の決まり方。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-reset-teardown)

---

テストが終わると、作った fixture は壊され、テストモジュールは捨てられ、`document.body` に置いたコンポーネントの根の要素も消えます。この章では、それをする `resetTestingModule()` が、afterEach と beforeEach のどちらで呼ばれるのか、中でどの順に何を壊し、途中で `ngOnDestroy` が投げたときにどのエラーが最後に残るのかを、ソースの行で 1 つずつ確かめます。

読む対象は `packages/core/testing/src/test_hooks.ts` と `test_bed.ts` の後半（`resetTestingModule`・`destroyActiveFixtures`・`tearDownTestingModule`）です（angular リポジトリ、v22.2.0-next.7）。

1. [1. 全体像](01-testing-overview.md)
2. [2. initTestEnvironment](02-testing-init-environment.md)
3. **3. 後片付け**（この章）
4. [4. TestBed.inject](04-testing-inject.md)
5. [5. createComponent](05-testing-create-component.md)
6. [6. 入力の渡し方](06-testing-component-bindings.md)
7. [7. createDirective](07-testing-directive-fixture.md)
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

## 1. afterEach か beforeEach か：getCleanupHook

[第 1 回](01-testing-overview.md)で、test\_hooks.ts が import の副作用で `beforeEach(getCleanupHook(false))` と `afterEach(getCleanupHook(true))` を登録することを見ました。その関数の中身です。

📄 `angular/packages/core/testing/src/test_hooks.ts` L29–38 （▶ の行: 30, 32–35）

```ts
29 │ 
30 ▶ export function getCleanupHook(expectedTeardownValue: boolean): VoidFunction {
31 │   return () => {
32 ▶     const testBed = TestBedImpl.INSTANCE;
33 ▶     if (testBed.shouldTearDownTestingModule() === expectedTeardownValue) {
34 ▶       testBed.resetTestingModule();
35 ▶       resetFakeAsyncZoneIfExists();
36 │     }
37 │   };
38 │ }
```

33 行目、`shouldTearDownTestingModule()` の値が引数と一致したときだけ、34 行目の `resetTestingModule()` と 35 行目の `resetFakeAsyncZoneIfExists()` が走ります （後者は zone.js の偽の時計があるときだけ働きます。[第 13 回](13-testing-fake-async.md)）。`shouldTearDownTestingModule()` は次の関数です。

📄 `angular/packages/core/testing/src/test_bed.ts` L959–974 （▶ の行: 961–963）

```ts
959 │   shouldTearDownTestingModule(): boolean {
960 │     return (
961 ▶       this._instanceTeardownOptions?.destroyAfterEach ??
962 ▶       TestBedImpl._environmentTeardownOptions?.destroyAfterEach ??
963 ▶       TEARDOWN_TESTING_MODULE_ON_DESTROY_DEFAULT
964 │     );
965 │   }
966 │ 
967 │   getDeferBlockBehavior(): DeferBlockBehavior {
968 │     return this._instanceDeferBlockBehavior;
969 │   }
970 │ 
971 │   getAnimationsEnabled(): boolean {
972 │     return this._instanceAnimationsEnabled;
973 │   }
974 │ 
```

961〜963 行目、テストの `teardown.destroyAfterEach` ?? 環境の `teardown.destroyAfterEach` ?? 既定の `true`（`TEARDOWN_TESTING_MODULE_ON_DESTROY_DEFAULT`）。この `??` の並びは [第 2 回](02-testing-init-environment.md)のオプションと同じ形です。

| destroyAfterEach | afterEach の `getCleanupHook(true)` | 次の beforeEach の `getCleanupHook(false)` |
| --- | --- | --- |
| `true`（既定） | 一致 → **ここで片付ける** | 不一致 → 何もしない |
| `false` | 不一致 → 何もしない（fixture も DOM もそのまま） | 一致 → **ここで前のテストを片付ける** |

`false` のとき、beforeEach の時点で見ているのは*前のテスト*が `configureTestingModule` に渡した値です。instance の値を消すのは `resetTestingModule` 自身（2 節の 573 行目）なので、消す前に読んでいます。

## 2. resetTestingModule の全体

📄 `angular/packages/core/testing/src/test_bed.ts` L545–582 （▶ の行: 546–547, 549, 551, 553, 557, 564–566, 568–569, 571–573）

```ts
545 │   resetTestingModule(): this {
546 ▶     this.checkGlobalCompilationFinished();
547 ▶     resetCompiledComponents();
548 │     if (this._compiler !== null) {
549 ▶       this.compiler.restoreOriginalState();
550 │     }
551 ▶     this._compiler = new TestBedCompiler(this.platform, this.ngModule);
552 │     // Restore the previous value of the "error on unknown elements" option
553 ▶     setUnknownElementStrictMode(
554 │       this._previousErrorOnUnknownElementsOption ?? THROW_ON_UNKNOWN_ELEMENTS_DEFAULT,
555 │     );
556 │     // Restore the previous value of the "error on unknown properties" option
557 ▶     setUnknownPropertyStrictMode(
558 │       this._previousErrorOnUnknownPropertiesOption ?? THROW_ON_UNKNOWN_PROPERTIES_DEFAULT,
559 │     );
560 │ 
561 │     // We have to chain a couple of try/finally blocks, because each step can
562 │     // throw errors and we don't want it to interrupt the next step and we also
563 │     // want an error to be thrown at the end.
564 ▶     try {
565 ▶       this.destroyActiveFixtures();
566 ▶     } finally {
567 │       try {
568 ▶         if (this.shouldTearDownTestingModule()) {
569 ▶           this.tearDownTestingModule();
570 │         }
571 ▶       } finally {
572 ▶         this._testModuleRef = null;
573 ▶         this._instanceTeardownOptions = undefined;
574 │         this._instanceErrorOnUnknownElementsOption = undefined;
575 │         this._instanceErrorOnUnknownPropertiesOption = undefined;
576 │         this._instanceInferTagName = undefined;
577 │         this._instanceDeferBlockBehavior = DEFER_BLOCK_DEFAULT_BEHAVIOR;
578 │         this._instanceAnimationsEnabled = ANIMATIONS_ENABLED_DEFAULT;
579 │       }
580 │     }
581 │     return this;
582 │   }
```

[NgModule シリーズの TestBed の回](../ngmodule/17-ngmodule-testbed.md)と [standalone シリーズの override の回](../standalone/12-standalone-testbed-override.md)で前半の 545〜551 行目を見ました。ここでは全体を、上から順に 1 段ずつ読みます。

1. **546〜551 行目：コンパイラ側を戻す（ここは投げても守られない）**

   546 行目の `checkGlobalCompilationFinished` は最初の 1 回だけ JIT のモジュールのキューを流します。547 行目で JIT のコンパイル結果を消し、549 行目の `restoreOriginalState()` で override が書き換えた `ɵcmp` などを元に戻し（[standalone の override の回](../standalone/12-standalone-testbed-override.md)）、551 行目で次のテスト用の新しい `TestBedCompiler` を作ります。**fixture やモジュールを壊すより前**にコンパイラが新しくなることに注意してください。
2. **553〜559 行目：未知の要素・プロパティの strict mode を戻す**

   `configureTestingModule` がしまっておいた前の値（無ければ既定の `false`）に戻します。
3. **564〜566 行目：fixture を全部壊す（try）**

   561〜563 行目のコメントのとおり、ここから先は「どの段が投げても次の段を止めず、最後にエラーを投げる」ために try / finally を 2 重にしています。中身は 3 節。
4. **567〜570 行目：モジュールを壊す（1 つ目の finally の中の try）**

   568 行目、`destroyAfterEach` が `true` のときだけ `tearDownTestingModule()`。中身は 4 節。
5. **571〜579 行目：参照を全部手放す（2 つ目の finally）**

   572 行目で `_testModuleRef` を `null` にし、573〜578 行目で `configureTestingModule` が入れた instance の値を全部既定に戻します。ここは何が投げても必ず走るので、次のテストが前のテストの設定を引き継ぐことはありません。

## 3. destroyActiveFixtures：全部壊してから数を投げる

📄 `angular/packages/core/testing/src/test_bed.ts` L891–922 （▶ の行: 893, 895, 897, 899–900, 914, 916–918）

```ts
891 │   private destroyActiveFixtures(): void {
892 │     let errorCount = 0;
893 ▶     this._activeFixtures.forEach((fixture) => {
894 │       try {
895 ▶         fixture.destroy();
896 │       } catch (e) {
897 ▶         errorCount++;
898 │ 
899 ▶         if (fixture instanceof ComponentFixture) {
900 ▶           console.error('Error during cleanup of component', {
901 │             component: fixture.componentInstance,
902 │             stacktrace: e,
903 │           });
904 │         } else if (fixture instanceof DirectiveFixture) {
905 │           console.error('Error during cleanup of directive', {
906 │             component: fixture.directiveInstance,
907 │             stacktrace: e,
908 │           });
909 │         } else {
910 │           console.error('Error during cleanup of fixture', e);
911 │         }
912 │       }
913 │     });
914 ▶     this._activeFixtures = [];
915 │ 
916 ▶     if (errorCount > 0 && this.shouldRethrowTeardownErrors()) {
917 ▶       throw Error(
918 ▶         `${errorCount} ${errorCount === 1 ? 'fixture' : 'fixtures'} ` +
919 │           `threw errors during cleanup`,
920 │       );
921 │     }
922 │   }
```

1. **893〜895 行目：createComponent で積んだ fixture を順に destroy**

   `_activeFixtures` は `createComponent`・`createDirective` が push した配列です（[第 5 回](05-testing-create-component.md)）。`fixture.destroy()` は自分を `ApplicationRef` のテスト用ビューの集合から外し、まだなら `ComponentRef.destroy()` を呼びます。ここで子まで `ngOnDestroy` が走ります（破棄の順番は [ivy シリーズの destroy の回](../ivy/17-ivy-destroy.md)）。
2. **896〜912 行目：投げても止めない**

   catch して 897 行目で数え、899〜911 行目で `console.error` に fixture の種類ごとの文と元のエラーを出すだけで、次の fixture に進みます。
3. **914 行目：配列を空に**
4. **916〜921 行目：最後に 1 回だけ投げる**

   数が 1 以上で、`shouldRethrowTeardownErrors()` が true なら、`'N fixture(s) threw errors during cleanup'` を投げます。元のエラーの中身はこの文に入らず、`console.error` の側にだけ出ています。

> [!WARNING]
> **ハマりどころ**
>
> このサイトの `@angular/core` 22.1.6 では、918 行目の文は `component` / `components` です（ng test で `2 components threw errors during cleanup` が返った）。../angular のソース（22.2.0-next.7）では `DirectiveFixture` が入ったので、`fixture` / `fixtures` に変わっています。エラー文で検索するときは版に気をつけてください。

### 投げ直すかどうか：shouldRethrowTeardownErrors

📄 `angular/packages/core/testing/src/test_bed.ts` L924–939 （▶ の行: 929–930, 935–937）

```ts
924 │   shouldRethrowTeardownErrors(): boolean {
925 │     const instanceOptions = this._instanceTeardownOptions;
926 │     const environmentOptions = TestBedImpl._environmentTeardownOptions;
927 │ 
928 │     // If the new teardown behavior hasn't been configured, preserve the old behavior.
929 ▶     if (!instanceOptions && !environmentOptions) {
930 ▶       return TEARDOWN_TESTING_MODULE_ON_DESTROY_DEFAULT;
931 │     }
932 │ 
933 │     // Otherwise use the configured behavior or default to rethrowing.
934 │     return (
935 ▶       instanceOptions?.rethrowErrors ??
936 ▶       environmentOptions?.rethrowErrors ??
937 ▶       this.shouldTearDownTestingModule()
938 │     );
939 │   }
```

929〜931 行目、**テストにも環境にも `teardown` が 1 つも書かれていなければ、既定の `true`**（投げ直す）。書かれていれば 935〜937 行目、`rethrowErrors` の instance ?? 環境 ?? **`shouldTearDownTestingModule()`**。つまり `{ destroyAfterEach: false }` とだけ書くと、`rethrowErrors` も `false` になります（ng test でも `shouldRethrowTeardownErrors()` が `false` でした）。後片付けを次の beforeEach に回すと、そこで投げたエラーは*次のテスト*の失敗になってしまうので、黙って `console.error` に回す、という既定です。

## 4. tearDownTestingModule：モジュールを壊し、最後に DOM の根を消す

📄 `angular/packages/core/testing/src/test_bed.ts` L975–997 （▶ の行: 977, 982, 984, 986–987, 989, 994–995）

```ts
975 │   tearDownTestingModule() {
976 │     // If the module ref has already been destroyed, we won't be able to get a test renderer.
977 ▶     if (this._testModuleRef === null) {
978 │       return;
979 │     }
980 │     // Resolve the renderer ahead of time, because we want to remove the root elements as the very
981 │     // last step, but the injector will be destroyed as a part of the module ref destruction.
982 ▶     const testRenderer = this.inject(TestComponentRenderer);
983 │     try {
984 ▶       this._testModuleRef.destroy();
985 │     } catch (e) {
986 ▶       if (this.shouldRethrowTeardownErrors()) {
987 ▶         throw e;
988 │       } else {
989 ▶         console.error('Error during cleanup of a testing module', {
990 │           component: this._testModuleRef.instance,
991 │           stacktrace: e,
992 │         });
993 │       }
994 ▶     } finally {
995 ▶       testRenderer.removeAllRootElements?.();
996 │     }
997 │   }
```

1. **977〜979 行目：モジュールを作っていなければ何もしない**

   `inject` も `createComponent` も呼ばなかったテストでは `_testModuleRef` は `null` のままなので（[第 4 回](04-testing-inject.md)）、ここで帰ります。
2. **982 行目：先に renderer を取り出しておく**

   980〜981 行目のコメントのとおり、モジュールを壊すとインジェクタも壊れて `TestComponentRenderer` を取り出せなくなるからです。
3. **984 行目：モジュールを壊す**

   `NgModuleRef.destroy()` がテストモジュールのインジェクタを壊し、そこで作られたサービスの `ngOnDestroy` や `DestroyRef.onDestroy` が走ります。`TestBed.runInInjectionContext` の中で登録した `DestroyRef.onDestroy` もここで呼ばれます（[第 4 回](04-testing-inject.md)で確かめた）。
4. **985〜993 行目：投げたら、投げ直すか console.error か**

   3 節の `shouldRethrowTeardownErrors()` で決まります。こちらは元のエラーをそのまま投げ直します（987 行目）。
5. **994〜996 行目：finally で removeAllRootElements**

   モジュールの破棄が投げても投げなくても、最後に `id` が `root` で始まる要素を `document` から全部消します。`?.` なのは、`TestComponentRenderer` の抽象クラスではこのメソッドが任意だからです。中身は [第 5 回](05-testing-create-component.md)で読みます。**DOM を消すのはここだけ**なので、`destroyAfterEach: false` だと 568 行目でここに来ず、根の要素は残ります。

## 5. デモ：どの段が走り、最後にどのエラーが残るか

> **🧪 DEMO — resetTestingModule の try / finally（再現）**
>
> test\_bed.ts 545〜582・891〜922・924〜939・975〜997 行目の分かれ道を、そのまま小さな関数にしています。TestBed は動かしていません。fixture は 2 つある想定です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-reset-teardown)

fixture もモジュールも投げる組み合わせを選ぶと、最後に残るのはモジュールのエラーです。564〜566 行目の try が投げたあと、567 行目からの finally の中で `tearDownTestingModule` が別のエラーを投げると、JavaScript の規則で finally のエラーが前のエラーを置き換えるからです（Node で同じ形の関数を書いて確かめました）。

## 6. このサイトの ng test で確かめたこと

このサイトの ng test（Vitest + jsdom、`@angular/core` 22.1.6）で、7 本の it を順に走らせました。

📄 `src/verify-a/teardown.spec.ts（要点）`

```
// src/verify-a/teardown.spec.ts（要点。確かめたあと消した）
@Component({ selector: 'probe-throws', template: '<p>x</p>' })
class ThrowsOnDestroy {
  ngOnDestroy() { g.__log.push('cmp destroy'); throw new Error('oh no'); }
}

it('A manual reset with throwing fixture (default teardown)', () => {
  TestBed.createComponent(ThrowsOnDestroy);
  TestBed.createComponent(ThrowsOnDestroy);
  try { TestBed.resetTestingModule(); } catch (e: any) { msg = e.message; }
});
it('D destroyAfterEach false leaves DOM', () => {
  TestBed.configureTestingModule({ teardown: { destroyAfterEach: false } });
  TestBed.createComponent(ThrowsOnDestroy);
});
it('E next test after destroyAfterEach false', () => {
  // beforeEach が終わった直後の様子を読む
  r = { log: [...g.__log], roots: document.querySelectorAll('[id^=root]').length,
        html: document.body.innerHTML.slice(0, 120) };
});
it('F leaves throwing fixture for afterEach', () => {
  TestBed.createComponent(ThrowsOnDestroy);   // 片付けは afterEach に任せる
});
it('G after F', () => {});
```

| it | 結果 | 説明する行 |
| --- | --- | --- |
| A：投げる fixture を 2 つ作って、自分で `resetTestingModule()` | `2 components threw errors during cleanup`。`ngOnDestroy` は 2 回とも走り、根の要素は 0 個 | 896〜912 行目で止まらず、916 行目で 1 回。995 行目は finally なので投げても走る |
| B：サービスの `ngOnDestroy` が投げる（`teardown` は書かない） | `svc oh no` がそのまま投げられた | 929〜931 行目で true → 987 行目 |
| C：同じで `{ destroyAfterEach: true, rethrowErrors: false }` | 投げない（サービスの `ngOnDestroy` は走った） | 935 行目 → 989 行目 |
| D：`{ destroyAfterEach: false }` で投げる fixture を作って終わる | `shouldRethrowTeardownErrors()` は `false` | 937 行目で `shouldTearDownTestingModule()` の false |
| E：D の次のテストの最初 | D の fixture の `ngOnDestroy` はもう走っていた。それでも `<div id="root4" ng-version="22.1.6"><p>x</p></div>` が `body` に残り、どのテストも失敗しなかった | beforeEach の 33 行目が一致 → 565 行目で破棄。568 行目で tearDown を飛ばすので 995 行目に来ない |
| F：投げる fixture を作って何もせず終わる | **F 自身**が `1 component threw errors during cleanup` で失敗。G は成功 | afterEach の失敗は、その afterEach が付いた it の失敗になる |

📄 `出力（抜粋）`

```
 × E next test after destroyAfterEach false   ← PROBE を投げたので失敗扱い
 × F leaves throwing fixture for afterEach
FAIL  src/verify-a/teardown.spec.ts > teardown probe > F leaves throwing fixture for afterEach
Error: 1 component threw errors during cleanup
 Tests  2 failed | 5 passed (7)
```

E で、D の `<p>x</p>` は fixture が壊されたあとも DOM に残っていました。根の要素を消すのは 4 節の 995 行目だけなので、`destroyAfterEach: false` では次の `createComponent` が新しい根を置くとき（[第 5 回](05-testing-create-component.md)の `insertRootElement`）まで残ります。

## ここまでの呼び出し

- 👤 `afterEach(…)` — test\_hooks.ts L28（ng test では CLI の setup も）
  - `getCleanupHook(true)()` — test\_hooks.ts L31 — *shouldTearDownTestingModule() === true のときだけ*
    - `TestBedImpl.INSTANCE.resetTestingModule()` — test\_bed.ts L545
      - `restoreOriginalState()` → `new TestBedCompiler(…)` — L549-551 — *コンパイラが先に新しくなる*
      - `destroyActiveFixtures()` — L891
        - `fixture.destroy()` × 件数 — L895 — *投げたら数えて console.error。最後に L917 で 1 回投げる*
      - `tearDownTestingModule()` — L975（finally の中）
        - `this.inject(TestComponentRenderer)` — L982
        - `_testModuleRef.destroy()` — L984 — *サービスの ngOnDestroy・DestroyRef*
        - `testRenderer.removeAllRootElements?.()` — L995（finally） — *id が root で始まる要素を消す*
      - `_testModuleRef = null` ほか — L572-578（finally）
    - `resetFakeAsyncZoneIfExists()` — test\_hooks.ts L35

## テストと直し方

この章の仕組みは `test_bed_spec.ts` の `describe('TestBed module teardown')`（:2673）の 16 本がまとめて確かめています。describe の先頭の beforeEach で毎回 `resetTestingModule()` してから始めます。

📄 `angular/packages/core/test/test_bed_spec.ts` L2758–2783 （▶ の行: 2758, 2774–2775, 2778–2780, 2782）

```ts
2758 ▶   it('should not interrupt fixture destruction if an error is thrown', () => {
2759 │     @Component({
2760 │       template: '',
2761 │       standalone: false,
2762 │     })
2763 │     class ThrowsOnDestroy {
2764 │       ngOnDestroy() {
2765 │         throw Error('oh no');
2766 │       }
2767 │     }
2768 │ 
2769 │     TestBed.configureTestingModule({
2770 │       declarations: [ThrowsOnDestroy],
2771 │       teardown: {destroyAfterEach: true},
2772 │     });
2773 │ 
2774 ▶     for (let i = 0; i < 3; i++) {
2775 ▶       TestBed.createComponent(ThrowsOnDestroy);
2776 │     }
2777 │ 
2778 ▶     const spy = spyOn(console, 'error');
2779 ▶     expect(() => TestBed.resetTestingModule()).toThrowError(
2780 ▶       '3 fixtures threw errors during cleanup',
2781 │     );
2782 ▶     expect(spy).toHaveBeenCalledTimes(3);
2783 │   });
```

`it('should not interrupt fixture destruction if an error is thrown')`。2774〜2776 行目で投げる fixture を 3 つ作り、2779〜2781 行目で数が 1 つの文にまとまること、2782 行目で `console.error` が 3 回（止まらずに 3 つとも壊した）ことを見ています。3 節の 896〜918 行目そのものです。

📄 `angular/packages/core/test/test_bed_spec.ts` L2884–2909 （▶ の行: 2885–2886, 2891, 2896–2897, 2901, 2906）

```ts
2884 │   it('should rethrow errors based on the default teardown behavior', () => {
2885 ▶     expect(TestBedImpl.INSTANCE.shouldRethrowTeardownErrors()).toBe(
2886 ▶       TEARDOWN_TESTING_MODULE_ON_DESTROY_DEFAULT,
2887 │     );
2888 │   });
2889 │ 
2890 │   it('should rethrow errors if the option is omitted and test teardown is enabled', () => {
2891 ▶     TestBed.configureTestingModule({teardown: {destroyAfterEach: true}});
2892 │     expect(TestBedImpl.INSTANCE.shouldRethrowTeardownErrors()).toBe(true);
2893 │   });
2894 │ 
2895 │   it('should not rethrow errors if the option is omitted and test teardown is disabled', () => {
2896 ▶     TestBed.configureTestingModule({teardown: {destroyAfterEach: false}});
2897 ▶     expect(TestBedImpl.INSTANCE.shouldRethrowTeardownErrors()).toBe(false);
2898 │   });
2899 │ 
2900 │   it('should rethrow errors if the option is enabled, but teardown is disabled', () => {
2901 ▶     TestBed.configureTestingModule({teardown: {destroyAfterEach: false, rethrowErrors: true}});
2902 │     expect(TestBedImpl.INSTANCE.shouldRethrowTeardownErrors()).toBe(true);
2903 │   });
2904 │ 
2905 │   it('should not rethrow errors if the option is disabled, but teardown is enabled', () => {
2906 ▶     TestBed.configureTestingModule({teardown: {destroyAfterEach: true, rethrowErrors: false}});
2907 │     expect(TestBedImpl.INSTANCE.shouldRethrowTeardownErrors()).toBe(false);
2908 │   });
2909 │ });
```

末尾の 5 本が 3 節の 929〜937 行目の分かれ道を 1 本ずつ押さえています。2896〜2897 行目が「`destroyAfterEach: false` だけ書くと投げ直さない」です。

📄 `ターミナル`

```
cd ~/angular-research/angular

pnpm bazel test //packages/core/test:test \
  --test_arg=--filter="TestBed module teardown" --test_output=all
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
==================== Test output for //packages/core/test:test (shard 2 of 4):
Ran 4 of 1389 specs
4 specs, 0 failures
==================== Test output for //packages/core/test:test (shard 1 of 4):
Ran 4 of 1389 specs
4 specs, 0 failures
==================== Test output for //packages/core/test:test (shard 4 of 4):
Ran 4 of 1389 specs
4 specs, 0 failures
==================== Test output for //packages/core/test:test (shard 3 of 4):
Ran 4 of 1389 specs
4 specs, 0 failures
INFO: Elapsed time: 2.429s, Critical Path: 1.72s
//packages/core/test:test                                                PASSED in 1.5s
```

1. **件数**

   4 + 4 + 4 + 4 = **16 本**で、describe の中の it の数と一致しました（Ran の読み方は [第 1 回](01-testing-overview.md)）。
2. **まだ spec が無いところ**

   fixture とモジュールの両方が投げたときに fixture の数のエラーが置き換えられること（5 節）を確かめる it は、この describe にありません。手元で確かめるなら、`should re-throw errors that were thrown during fixture cleanup`（:2734）と `should re-throw errors that were thrown during module teardown by default`（:2785）を合わせた形の it を足し、`toThrowError` にどちらの文が来るかを見ます。
3. **直すとしたら**

   順番は `resetTestingModule`（545 行目）、fixture のエラーの数え方は `destroyActiveFixtures`（891 行目）、投げ直しの既定は `shouldRethrowTeardownErrors`（924 行目）、DOM は `tearDownTestingModule` の 995 行目です。どれを変えても、足す場所は `TestBed module teardown` の describe です。本家に出す前に、手元で 16 本が通ることと、足した 1 本の N を確かめます。「テストが終わったのに DOM が残る」「別のテストで失敗が出る」という issue は、まず `destroyAfterEach` と `rethrowErrors` が 3 節のどの組み合わせかを確かめると説明がつくことが多いです（[第 20 回](20-testing-issues.md)）。

## 聞かれそうな質問

**Q. destroyAfterEach: false にするのはどんなときですか？**

テストが終わったあとの DOM を目で見たいときです。`false` だと afterEach では片付けず（test\_hooks.ts 33 行目が不一致）、次のテストの beforeEach で fixture を壊しても 568 行目で `tearDownTestingModule` を飛ばすので、995 行目の `removeAllRootElements` が走りません。CLI も `ng test --debug` のときだけこれを環境に渡します（[第 2 回](02-testing-init-environment.md)）。代わりに、モジュールのサービスの `ngOnDestroy` が呼ばれない、片付けのエラーが黙って `console.error` に回る（937 行目）、の 2 つを受け入れることになります。

**Q. afterEach で失敗したテストは、どの it の失敗として出ますか？**

その afterEach が付いた it、つまり片付けられたテスト自身です。ng test で、投げる fixture を残して終わった it（F）が `1 component threw errors during cleanup` で失敗し、次の it（G）は成功しました。[第 1 回](01-testing-overview.md)で見た test\_hooks.ts のコメントにある「afterEach で片付けるのは、エラーを正しいテストに結びつけるため」がこれです。`destroyAfterEach: false` で beforeEach に回した場合は、投げ直すなら*次の* it の失敗になります。

**Q. fixture.destroy() を自分で呼ぶ必要はありますか？**

通常はありません。`createComponent` が積んだ fixture を 893〜895 行目が全部壊します。テストの途中で「壊したあとの振る舞い」を確かめたいときだけ自分で呼びます。そのあと 895 行目でもう一度 `destroy()` が呼ばれますが、`fixture.destroy()` は破棄済みなら `ComponentRef.destroy()` を呼ばないので 2 回壊れることはありません（[第 5 回](05-testing-create-component.md)）。

**Q. 片付けのエラー文に、元の ngOnDestroy のエラーが出ないのはなぜですか？**

917〜920 行目が投げるのは件数の文だけで、元のエラーは 899〜911 行目の `console.error` の `stacktrace` に出しているからです。テストの出力のコンソールの側を探してください。モジュールの破棄で投げた場合は 987 行目で元のエラーをそのまま投げ直すので、こちらは中身が見えます。

## 読み終えて

- 片付けは `getCleanupHook` が `shouldTearDownTestingModule()` を見て、afterEach（既定）か次の beforeEach（`destroyAfterEach: false`）のどちらかで `resetTestingModule()` を呼ぶ。
- `resetTestingModule` はコンパイラを戻してから、try / finally の 2 重で「fixture を全部壊す → モジュールを壊して DOM の根を消す → 参照と instance の値を手放す」を必ず最後まで進める。
- fixture のエラーは数えて最後に 1 回、件数の文で投げる。モジュールのエラーは元のまま投げる。両方なら後者が残る。
- 投げ直すかは、`teardown` を書かなければ true、書けば `rethrowErrors` ?? `destroyAfterEach`。DOM の根を消すのは `tearDownTestingModule` の finally だけ。

---

← 前: [initTestEnvironment：テスト用のプラットフォームと BrowserTestingModule](02-testing-init-environment.md)  
次: [TestBed.inject と注入コンテキスト：テストモジュールはいつ作られるか](04-testing-inject.md) →
