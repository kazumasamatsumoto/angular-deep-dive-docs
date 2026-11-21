[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 10 回 / 全 10 回

# spec と issue を読む：core の説明文を固めているもの

> packages/core/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、area: core の開いている issue のうち説明文に当たるものの表と、このシリーズで見つけた食い違い。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-tests-issues)

---

この章で分かること：第 1〜9 回で読んだ `@angular/core` の説明文（angular.dev の API リファレンスになる JSDoc と、`{@example}` が指す `packages/examples/core` の例）の約束を、`packages/core/test` のどの spec が固めているか、固めていないのはどれか。手元で走らせた target と件数。area: core の issue のうち、このシリーズの説明文に当たるもの。そして、このシリーズで見つけた説明と実装の食い違い・不具合の一覧です。

読む対象は `packages/core/test/` の spec（../angular、8576f161ae4）と、2026-11-21 に取った area: core の開いている issue 263 件です。spec の読み方と 1 本だけ走らせる方法は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、spec の構造は[spec の読み方](../contrib/06-contrib-reading-specs.md)にあります。最終回の形は[common の spec と issue の章](../cmd/09-cmd-tests-issues.md)と同じです。

1. [1. @Directive](01-crd-directive.md)
2. [2. @Component](02-crd-component.md)
3. [3. クエリと @NgModule](03-crd-query-module.md)
4. [4. @Injectable・InjectionToken](04-crd-injectable-token.md)
5. [5. Provider の形](05-crd-provider.md)
6. [6. inject と Injector](06-crd-inject.md)
7. [7. ライフサイクル](07-crd-lifecycle.md)
8. [8. differ](08-crd-differs.md)
9. [9. スケジューラー](09-crd-scheduling.md)
10. **10. spec と issue**（この章）

## 1. 走らせ方と件数

core の spec は 2 つの target に分かれます。packages/core/test/BUILD.bazel の `test_lib` は `glob(["**/*.ts"])` で、`di/`・`change_detection/differs/`・`zone/`・`linker/`・`metadata/` などを Node の `:test`（`angular_jasmine_test`、`shard_count = 4`）で走らせます。`acceptance/` は自分の BUILD.bazel を持ち、`//packages/core/test/acceptance:acceptance`（shard なし）です（BUILD.bazel の読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)）。../angular で絞らずに走らせると、`:test` は 4 つの shard の合計で 1401 specs（pending 8）、`:acceptance` は 2693 specs（pending 3）、どちらも 0 failures で PASSED でした。説明文の `{@example}` が指す packages/examples/core の spec は別の target の `//packages/examples/core:test` で、32 specs、0 failures です。

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ。2026-11-21
# packages/core/test/BUILD.bazel：glob(["**/*.ts"]) の test_lib を Node の :test（shard_count = 4）で走らせる
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all
351 specs, 0 failures, 1 pending spec      # shard 1
350 specs, 0 failures, 3 pending specs     # shard 2
350 specs, 0 failures, 2 pending specs     # shard 3
350 specs, 0 failures, 2 pending specs     # shard 4（合計 1401 specs、pending 8）
//packages/core/test:test                                         PASSED

# packages/core/test/acceptance/BUILD.bazel の :acceptance（shard なし）
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all
2693 specs, 0 failures, 3 pending specs
//packages/core/test/acceptance:acceptance                        PASSED

# 名前で絞る（Node の jasmine。一致が 0 件でも PASSED なので Ran の行を見る。:test は shard ごとに Ran が出るので足す）
$ pnpm bazel test <target> --nocache_test_results --test_output=all "--test_arg=--filter=<名前>"
```

各章で約束を固める it を名前で絞った数は次のとおりで、どれも 0 failures です（`:test` は shard ごとの「Ran N of M specs」の N を足した数）。

| 章 | target | --filter | 件数 |
| --- | --- | --- | --- |
| [1](01-crd-directive.md) | `:acceptance` | `should match attributes to directive selectors without case sensitivity`・`should call prevent default when a handler returns false`・`should support global host listeners on directives`・`should merge attributes on host and template`・`should set an input of a host directive that has been exposed under an alias` | 1 ずつ |
| [1](01-crd-directive.md) | `:test` | `should assign a directive to a ref when it has multiple exportAs names` | 1 |
| [2](02-crd-component.md) | `:acceptance` | `should be off for a component with no styles`・`… with empty styles`・`should check OnPush components in update mode when inputs change`・`should skip OnPush components in update mode when they are not dirty`・`should transform incoming static input values`・`should support global host listeners on components` | 1 ずつ |
| [2](02-crd-component.md) | `:test` | `whitespaces in templates`・`^resource_loading` | 3・14 |
| [3](03-crd-query-module.md) | `:acceptance` | `query logic descendants: false`・`query logic read option`・`query logic querying for string token providers`・`query logic query order`・`should inject attributes` | 8・30・10・2・3 |
| [4](04-crd-injectable-token.md) | `:acceptance` | `^@Service decorator`・`Tree shakable injectors` | 9・2 |
| [4](04-crd-injectable-token.md) | `:test` | `allows injecting a scoped service`・`does not create instances of a service not in scope`・`throws an error on circular deps`・`should wrap and unwrap the reference`・`should instantiate components which are declared using forwardRef` | 1 ずつ |
| [5](05-crd-provider.md) | `:acceptance` | `^importProvidersFrom`・`^EnvironmentProviders`・`should support the ENVIRONMENT_INITIALIZER multi-token` | 9・8・1 |
| [5](05-crd-provider.md) | `:test` | `should throw when mixing multi providers with regular providers`・`injects a service with optional dependencies`・`instantiates a class with useClass and deps`・`injects a token with useExisting` | 1 ずつ |
| [5](05-crd-provider.md)・[6](06-crd-inject.md)・[7](07-crd-lifecycle.md) | `//packages/examples/core:test` | （絞らない）・`^Provider examples`・`^forwardRef examples`・`di metadata examples`・`lifecycle hooks examples`・`injector metadata examples` | 32・11・3・6・8・4 |
| [6](06-crd-inject.md) | `:test` | `dependency resolution`・`InjectorDef-based createInjector`・`Injector.NULL` | 9・32・3 |
| [6](06-crd-inject.md) | `:acceptance` | `di inject\(\)`・`di injection flags`・`di runInInjectionContext`・`di assertInInjectionContext` | 12・7・10・3 |
| [7](07-crd-lifecycle.md) | `:acceptance` | `^onChanges`・`^doCheck`・`^hooks order`・`^hook order`・`^afterViewInit`・`^onDestroy`・`change detection ChangeDetectorRef`・`change detection OnPush`・`providers lifecycles` | 14・7・2・3・10・11・36・20・12 |
| [8](08-crd-differs.md) | `:test` | `^iterable differ`・`^keyvalue differ`・`^IterableDiffers`・`^KeyValueDiffers` | 33・15・5・1 |
| [9](09-crd-scheduling.md) | `:test` | `Angular with zoneless enabled`・`Angular with scheduler and ZoneJS`・`^NgZone` | 25・9・101 |

## 2. 説明文の約束を固めている spec

📄 `angular/packages/core/test/di/static_injector_spec.ts` L121–138 （▶ の行: 127–129, 132, 134–135）

```ts
121 │     it('should return a default value when not requested provider on self and optional', () => {
122 │       const injector = Injector.create({providers: []});
123 │       expect(injector.get<Car | null>(Car, null, {self: true})).toBeNull();
124 │       expect(injector.get<Car | number>(Car, 0, {self: true, optional: true})).toBe(0);
125 │     });
126 │ 
127 ▶     it(`should return null when not requested provider on self and optional`, () => {
128 ▶       const injector = Injector.create({providers: []});
129 ▶       expect(injector.get<Car | null>(Car, undefined, {self: true, optional: true})).toBeNull();
130 │     });
131 │ 
132 ▶     it('should throw error when not requested provider on self', () => {
133 │       const injector = Injector.create({providers: []});
134 ▶       expect(() => injector.get(Car, undefined, {self: true})).toThrowError(
135 ▶         'NG0201: No provider found for `Car`. ' +
136 │           `Find more at ${ERROR_DETAILS_PAGE_BASE_URL}/NG0201`,
137 │       );
138 │     });
```
*Injector.get の notFoundValue と optional（第 6 回の 8 節）*

129 行目は `get(Car, undefined, {self: true, optional: true})` が `null` を返すことを固めます。`Injector.get` の説明文（injector.ts L65）は「`notFoundValue` が `undefined` なら例外」なので、spec は実装と型（`T | null`）の側です。134〜135 行目は optional でなければ NG0201 で、`@Self` が親を見ないことも同じファイルの L98 の it が固めています（説明文の metadata.ts L127〜128「上へたどる」と逆の向き）。

📄 `angular/packages/core/test/acceptance/lifecycle_spec.ts` L1296–1305 （▶ の行: 1298, 1300, 1302）

```ts
1296 │     const ChildPrototype = Child.prototype as any;
1297 │     ChildPrototype.ngOnInit = () => events.push('onInit');
1298 ▶     ChildPrototype.ngOnChanges = (e: SimpleChanges) => {
1299 │       const name = e['name'];
1300 ▶       expect(name.previousValue).toEqual(undefined);
1301 │       expect(name.currentValue).toEqual('value');
1302 ▶       expect(name.firstChange).toEqual(true);
1303 │       events.push('ngOnChanges');
1304 │     };
1305 │     ChildPrototype.ngDoCheck = () => events.push('ngDoCheck');
```
*1 回目の ngOnChanges の previousValue（第 7 回の 5 節）*

1300 行目は 1 回目の `previousValue` が `undefined` であることを待ちます。型（simple\_change.ts L22 の `previousValue: T`）は `undefined` を含まず、開いている issue #67516 がこの差を指しています。`firstChange` が入力ごとではなくインスタンスごとだ、ということを固める it は core にはありません。

📄 `angular/packages/core/test/acceptance/change_detection_spec.ts` L454–464 （▶ の行: 454, 459–460, 462–463）

```ts
454 ▶     it('should call doCheck even when OnPush components are not dirty', () => {
455 │       TestBed.configureTestingModule({declarations: [MyComponent, MyApp]});
456 │       const fixture = TestBed.createComponent(MyApp);
457 │       fixture.detectChanges();
458 │ 
459 ▶       fixture.detectChanges();
460 ▶       expect(fixture.componentInstance.comp.doCheckCount).toEqual(2);
461 │ 
462 ▶       fixture.detectChanges();
463 ▶       expect(fixture.componentInstance.comp.doCheckCount).toEqual(3);
464 │     });
```
*OnPush の子の ngDoCheck（第 7 回の 2 節）*

lifecycle\_hooks.ts L80〜82「自分の変更検知が飛ばされても呼ばれる」の spec です。同じことが `ngAfterViewChecked` にも起きますが（第 7 回の 3 節、説明文の L224〜225 と合わない）、それを数える it はありません。

📄 `angular/packages/core/test/acceptance/providers_spec.ts` L495–533 （▶ の行: 495, 516–517, 530, 532）

```ts
495 ▶       it('should not invoke ngOnDestroy on multi providers created via useFactory', () => {
496 │         let destroyCalls = 0;
497 │         const SERVICES = new InjectionToken<any>('SERVICES');
498 │ 
499 │         @Injectable()
500 │         class DestroyService {
501 │           ngOnDestroy() {
502 │             destroyCalls++;
503 │           }
504 │         }
505 │ 
506 │         @Injectable()
507 │         class OtherDestroyService {
508 │           ngOnDestroy() {
509 │             destroyCalls++;
510 │           }
511 │         }
512 │ 
513 │         @Component({
514 │           template: '<div></div>',
515 │           providers: [
516 ▶             {provide: SERVICES, useFactory: () => new DestroyService(), multi: true},
517 ▶             {provide: SERVICES, useFactory: () => new OtherDestroyService(), multi: true},
518 │           ],
519 │           standalone: false,
520 │ 
521 │           changeDetection: ChangeDetectionStrategy.Eager,
522 │         })
523 │         class App {
524 │           constructor(@Inject(SERVICES) s: any) {}
525 │         }
526 │ 
527 │         TestBed.configureTestingModule({declarations: [App]});
528 │         const fixture = TestBed.createComponent(App);
529 │         fixture.detectChanges();
530 ▶         fixture.destroy();
531 │ 
532 ▶         expect(destroyCalls).toBe(0);
533 │       });
```
*要素の注入器の useFactory の ngOnDestroy（第 7 回の 4 節）*

516〜517 行目の `useFactory` の multi の provider を 530 行目で destroy し、532 行目は `ngOnDestroy` が 1 回も呼ばれないことを待っています。`OnDestroy` の説明文（L119「サービスが壊されるとき」）とは逆向きで、開いている issue #28738（2019-02-14）の振る舞いを spec が固めています。直すなら、この it の期待も変わります。

📄 `angular/packages/core/test/change_detection/differs/default_iterable_differ_spec.ts` L415–435 （▶ の行: 423–425, 430, 434）

```ts
415 │       it('should consider inserting/removing/moving items with respect to items that have not moved at all', () => {
416 │         const startData = [0, 1, 2, 3];
417 │         const endData = [2, 1];
418 │ 
419 │         differ = differ.diff(startData)!;
420 │         differ = differ.diff(endData)!;
421 │ 
422 │         const operations: string[] = [];
423 ▶         differ.forEachOperation((item: any, prev: number | null, next: number | null) => {
424 ▶           modifyArrayUsingOperation(startData, endData, prev, next);
425 ▶           operations.push(stringifyItemChange(item, prev, next, item.previousIndex));
426 │         });
427 │ 
428 │         expect(operations).toEqual([
429 │           'REMOVE 0 (0 -> VOID) [o=0]',
430 ▶           'MOVE 2 (1 -> 0) [o=2]',
431 │           'REMOVE 3 (2 -> VOID) [o=3]',
432 │         ]);
433 │ 
434 ▶         expect(startData).toEqual(endData);
435 │       });
```
*forEachOperation の 2 つの index（第 8 回の 2 節）*

430 行目の `MOVE 2 (1 -> 0)` は「途中の位置 1 から、`currentIndex` 0 へ」で、0 は `record.currentIndex`（2 の新しい位置）そのものです。424 行目の `modifyArrayUsingOperation` で操作を順に当てて 434 行目で新しい一覧になる、が L53〜58 の約束の spec です。説明文の L64〜66（`currentIndex` も途中の位置）とは合わない数を、spec は正しい値として待っています。

📄 `angular/packages/core/test/zone/ng_zone_spec.ts` L1263–1280 （▶ の行: 1263, 1265–1267, 1272, 1277）

```ts
1263 ▶       it('should run in requestAnimationFrame async', (done) => {
1264 │         coalesceZone.run(() => {});
1265 ▶         expect(logs).toEqual([]);
1266 ▶         scheduler(() => {
1267 ▶           expect(logs).toEqual(['microTask empty']);
1268 │           done();
1269 │         });
1270 │       });
1271 │ 
1272 ▶       it('should only emit onMicroTaskEmpty once within the same event loop for multiple ngZone.run', (done) => {
1273 │         coalesceZone.run(() => {});
1274 │         coalesceZone.run(() => {});
1275 │         expect(logs).toEqual([]);
1276 │         scheduler(() => {
1277 ▶           expect(logs).toEqual(['microTask empty']);
1278 │           done();
1279 │         });
1280 │       });
```
*runCoalescing（第 9 回の 3 節）*

1263 行目の名前は「requestAnimationFrame で非同期に」ですが、確かめているのは 1265 行目（同期のうちは何も無い）と 1267 行目（`scheduler` のあとに 1 回）だけで、`scheduler` が `requestAnimationFrame` の側か `setTimeout` の側かは見ていません。説明文の L214 と同じ言い方です。

📄 `angular/packages/core/test/linker/integration_spec.ts` L2086–2099 （▶ の行: 2087, 2090, 2098）

```ts
2086 │   describe('whitespaces in templates', () => {
2087 ▶     it('should not remove whitespaces by default', waitForAsync(() => {
2088 │       @Component({
2089 │         selector: 'comp',
2090 ▶         template: '<span>foo</span>  <span>bar</span>',
2091 │         standalone: false,
2092 │       })
2093 │       class MyCmp {}
2094 │ 
2095 │       const f = TestBed.configureTestingModule({declarations: [MyCmp]}).createComponent(MyCmp);
2096 │       f.detectChanges();
2097 │ 
2098 ▶       expect(f.nativeElement.childNodes.length).toBe(2);
2099 │     }));
```
*名前と中身が逆の it（第 2 回）*

2087 行目の名前は「既定では空白を消さない」ですが、2098 行目は子が 2 つ（間の空白のテキストが消える）を待ちます。f1a063298e9（2018、#22046、既定を `preserveWhitespaces: false` にした変更）で期待だけ 3 から 2 に変え、名前が残りました（[第 2 回](02-crd-component.md)の 2 節）。

## 3. spec が無い約束

📄 `angular/packages/core/test/acceptance/di_spec.ts` L4690–4698 （▶ の行: 4690, 4693–4694, 4696）

```ts
4690 ▶   describe('assertInInjectionContext', () => {
4691 │     function placeholder() {}
4692 │ 
4693 ▶     it('should throw if not in an injection context', () => {
4694 ▶       expect(() => assertInInjectionContext(placeholder)).toThrowMatching(
4695 │         (e: Error) =>
4696 ▶           e instanceof RuntimeError && e.code === RuntimeErrorCode.MISSING_INJECTION_CONTEXT,
4697 │       );
4698 │     });
```
*NG0203 を待つ it は assertInInjectionContext だけ*

`inject()` を注入の文脈の外で呼ぶと NG0203、という `inject` の説明文の中心の約束（injector\_compatibility.ts L274〜283）を待つ it は、packages/core/test に見当たりませんでした（`MISSING_INJECTION_CONTEXT` と NG0203 の文で grep。当たるのは 4696 行目と webmcp の 1 つだけ）。第 6 回の DEMO は、ボタンの処理・`ngOnInit`・`await` の後の 3 つで NG0203 を確かめています。ほかに it が見当たらなかったのは、zoneless の NG0914（zone.js を読み込んだまま `provideZonelessChangeDetection()`）と NG0408（両方 provide）の警告（[第 9 回](09-crd-scheduling.md)の 4 節）、`firstChange` が入力ごとではないこと（第 7 回）、JIT の `@Directive.queries`（[第 1 回](01-crd-directive.md)、AOT の ngtsc\_spec.ts 3295 だけ）、factory が例外を投げたあとの 2 回目の `get`（[第 4 回](04-crd-injectable-token.md)）、`new Component({})` の `changeDetection` の値（[第 2 回](02-crd-component.md)、PR #69898 が足す）です。

## 4. issue の表

issues-open.json（area: core の開いている 263 件、2026-11-21 取得）の題から、このシリーズの説明文と実装に当たるものを選び、閉じたものと PR は `gh issue view` で読みました（読むだけ）。

| issue | 状態 | 中身 | 当たる説明文と章 |
| --- | --- | --- | --- |
| PR #69898 | 開 | JIT のコンポーネントも既定を OnPush に（breaking changes） | `@Component` の changeDetection の既定。[2](02-crd-component.md) |
| #40778 | 開 | `keyup.Enter` の形の output で strictDomEventTypes の型が違う | `@HostListener('window:keydown.enter')` の例が TS2345。[2](02-crd-component.md) |
| #36241 | 開 | 入れ子の構造の中で `@Host` で親のディレクティブを注入できない（Ivy から） | `@Host` の説明（metadata.ts L217〜219「ホストで止まる」）。[6](06-crd-inject.md) |
| #50462 | 開 | `useClass`・`useFactory` で使う飾りの無いクラスに `ngOnDestroy` を書けない | 第 6 回のデモで NG2007。[6](06-crd-inject.md) |
| #66784・#54097 | 開 | `inject()` が `name` の getter が投げる物で失敗する／埋め込みビューの中で injector が違う物を返す | `inject` の実装（説明文の約束の外）。[6](06-crd-inject.md) |
| #67516 | 開 | `SimpleChange` の `previousValue` の型に `undefined` が無い | simple\_change.ts L22。spec の lifecycle\_spec.ts 1300 は `undefined` を待つ。[7](07-crd-lifecycle.md) |
| #28738 | 開 | コンポーネントの `useFactory` のサービスの `ngOnDestroy` が呼ばれない | OnDestroy の説明（L119）。22.2.6 で再現、providers\_spec.ts 495 が今の振る舞いを固める。[7](07-crd-lifecycle.md) |
| #46690・#39949 | 開 | ApplicationRef に付けたビューは `detach` しても外れない／`detach` を子のコンポーネントでも効かせたい | `detach` の説明（change\_detector\_ref.ts L77〜82）。[7](07-crd-lifecycle.md) |
| #45577 | 開 | 子のビューで `detectChanges` を呼ぶと親の `NgForOf` が例外 | `detectChanges` と differ の記録（`forEachOperation`）。[8](08-crd-differs.md) |
| #67209 | 閉 | v21 への移行が書き込む物と `provideZoneChangeDetection` の説明文が食い違う | a2d5048ff38 で L140（bootstrapModule の applicationProviders）に直して閉じた。L75〜77 の内部のコメントは残る。[9](09-crd-scheduling.md) |
| #57528・#61839 | 開 | マクロタスクで予約することの影響（canonical）／zoneless で変更検知を起こさずにイベントを聞きたい | zoneless の説明文の 7 つの API の「listener」。[9](09-crd-scheduling.md) |

このシリーズの食い違いのうち、同じことを書いた issue と PR は、#69898・#67516・#28738・#50462 のほかには見つかりませんでした（GitHub の検索 API を、`forEachOperation`・`SkipSelf docs`・`@Self docs`・`StaticInjector`・`CheckAlways`・`ngAfterViewChecked OnPush`・`runCoalescing`・`PROVIDED_NG_ZONE`・`firstChange`・`KeyValueDiffers NgClass` などの語で、2026-11-21 に読むだけで実行）。

## 5. このシリーズで見つけたもの（食い違いと不具合）

どれも 8576f161ae4 の行を読み、本物の @angular/core 22.2.6（ページのデモと Node の記録）か、説明文の例をそのまま取り出したファイルの型検査（サイトの compiler-cli、`--strict`・`strictTemplates`）で確かめたものです。「main」は ../angular の origin/main（d201dd76ef2、2026-11-19）で、直っていなければ「main 同じ」と書きました。行のファイルは、断りが無ければ packages/core/src/ からの道です。

| 章 | 何が起きるか | 行（8576f161ae4） | 確かめ方と main |
| --- | --- | --- | --- |
| [1](01-crd-directive.md) | （不具合）`queries: {x: new ContentChildren(...)}` が JIT では入らない（AOT は入る）。JIT の `directiveMetadata` は `metadata.queries` を読まない | metadata/directives.ts 264〜300、render3/jit/directive.ts 394 | Node の JIT で `this.c === undefined`。spec は ngtsc\_spec.ts 3295（AOT）だけ。main 同じ |
| [1](01-crd-directive.md) | （例の誤り）queries の例のフィールドを `,` で区切っていて TS1442。直しても imports が無く NG8001 | directives.ts 285〜286 | strict の ngc。main 同じ |
| [1](01-crd-directive.md) | （食い違い）「要素の境をまたぐ selector は使えない」と書くが、`'form input'`・`'div > span'` はエラーにならず最後の要素名だけが残る。`:not(.a, .b)` は診断でなく `TS500` で止まる | directives.ts 127〜128 | 本物と ngc。main 同じ |
| [1](01-crd-directive.md) | （説明不足）exportAs はカンマで区切って複数の名前にできる（型は string） | directives.ts 240〜262 | AOT・JIT とも。spec linker/integration\_spec.ts 465。main 同じ |
| [1](01-crd-directive.md) | （食い違い）host の静的な属性を「host が指す property に伝わる」と書くが、属性に値を書くだけ（テンプレートの同じ属性が勝つ、class は足し合わせ） | directives.ts 312〜313 | 本物。main 同じ |
| [1](01-crd-directive.md) | （食い違い）outputs の alias を「handler が付く DOM の property」と書く。実際はテンプレートの (イベント名) | directives.ts 197〜201 | 本物。main 同じ |
| [1](01-crd-directive.md) | （例の誤り）outputs・exportAs の例に imports が無く NG8001/NG8003、inputs の例は TS2564 | directives.ts 166〜177・205〜228・245〜259 | strict の ngc。main 同じ |
| [1](01-crd-directive.md) | （説明不足）`[attr=value]` の値は大文字小文字を区別しない、`#id` も書ける | directives.ts 123 | 本物。spec directive\_spec.ts 320。main 同じ |
| [1](01-crd-directive.md) | （例の誤字）閉じタグが `<form>` | directives.ts 137 | main 同じ |
| [1](01-crd-directive.md) | （説明不足）handler が例外を投げても false 扱いで preventDefault | directives.ts 320〜322（実装 render3/view/listeners.ts 92〜95） | 本物。main 同じ |
| [2](02-crd-component.md) | （食い違い）「OnPush が既定」。クラスは OnPush だが、デコレーターの props が `{changeDetection: Eager, ...c}` を入れるので `new Component({}).changeDetection === 1`、TestBed の override のあと `onPush` が false | metadata/directives.ts 554・682 | Node の記録。main は f1c87829991 で g3 だけ直った。PR #69898（開） |
| [2](02-crd-component.md) | （食い違い）template と templateUrl を両方書くとエラーにならず、AOT は templateUrl、JIT は template を使う | directives.ts 567・574 | 本物。main 同じ |
| [2](02-crd-component.md) | （例の誤り）preserveWhitespaces の例。1 文字の `\n` は残る | directives.ts 485 | 本物。main 同じ |
| [2](02-crd-component.md) | （食い違い）input・output が「DOM の property」に結ばれ変更検知で更新、HostListener の結果で要素を更新 | directives.ts 773〜774・836・885・911・1012 | 本物（返り値は false かどうかだけ）。main 同じ |
| [2](02-crd-component.md) | （例の誤り）HostBinding の例の閉じ括弧が無く TS1434、HostListener の `keydown.enter` の例は TS2345（#40778）、ほかの例も TS2564・TS7006・NG8001 | directives.ts 434〜459・787〜817・960〜967・1025〜1039・1056〜1057 | strict の ngc。main 同じ |
| [2](02-crd-component.md) | （古い例）resource\_loading の例の `renderComponent` は消えた関数（TS2552） | metadata/resource\_loading.ts 29・38 | 8d2e5e6c4f5（2022）で消えた。main 同じ |
| [2](02-crd-component.md) | （古い文）pipe は NgModule に属さないと使えない、name に `-` は使えない（宣言はエラーにならない） | directives.ts 708〜710・731〜732 | 本物。main 同じ |
| [2](02-crd-component.md) | （spec の名前）`should not remove whitespaces by default` が消える方を待つ | test/linker/integration\_spec.ts 2087 | 2 節。main 同じ |
| [2](02-crd-component.md) | （説明不足）status が 200 でなければ失敗（204 や file:// の 0 も NG0918） | resource\_loading.ts 165 | 読み比べと spec。main 同じ |
| [3](03-crd-query-module.md) | （書式の崩れ）ContentChild の静的・動的の表の 1 行目が折り返していて表として組めない | metadata/di.ts 256〜263 | 3348f8820b0（2023、#51146）から。main 同じ |
| [3](03-crd-query-module.md) | （例の誤り）例のフィールド `template;`・`someService: SomeService` が strict で TS7008・TS2564 | di.ts 135・139・241・245・350・436・440 | strict の tsc。main 同じ |
| [3](03-crd-query-module.md) | （例の誤り）`@NgModule({declarations: [NgFor]})` は NG6001（standalone でほかのパッケージの宣言） | metadata/ng\_module.ts 98〜107 | ngc。main 同じ |
| [3](03-crd-query-module.md) | （書式、main で直った）`** Note: ***` が太字にならない | di.ts 126・338 | 95e8dec4e22（2026-09-23）で直った |
| [4](04-crd-injectable-token.md) | （例の誤り）standalone の循環 import の例で、後で定義するクラスを imports が読み TS2449。順を入れ替えても input.required を渡さず NG8008 | di/forward\_ref.ts 41〜65 | strict の ngc。24d803b0a2e（2023）から。main 同じ |
| [4](04-crd-injectable-token.md) | （例の食い違い）forwardRef の例は `{provide: Door, deps: [Lock]}` で作るので `@Inject(forwardRef(...))` が読まれない | packages/examples/core/di/ts/forward\_ref/forward\_ref\_spec.ts 23〜47 | 本物（deps の provider は ɵfac を使わない。第 6 回の 4 節と同じ理由）。main 同じ |
| [4](04-crd-injectable-token.md) | （食い違い）InjectionToken の `providedIn: null` も `\|\|` で 'root'（@Injectable の null とは逆） | di/injection\_token.ts 91・113 | 本物。main 同じ |
| [4](04-crd-injectable-token.md) | （言い方）'any' は「遅延モジュールごとに 1 つ」と書くが、聞かれた injector ごとに 1 つ | di/injectable.ts 96〜97（実装 r3\_injector.ts 557） | 本物。main 同じ |
| [4](04-crd-injectable-token.md) | （不具合）factory が例外を投げると記録が CIRCULAR のまま残り、2 回目の get が本当の理由でなく NG0200 Circular dependency | di/r3\_injector.ts 524〜549（hydrate） | 本物（root の子にだけ依存を置く再現）。issue・PR は見つからない。main 同じ |
| [4](04-crd-injectable-token.md) | （綴り）「defition」 | di/jit/service.ts 23 | main 同じ |
| [5](05-crd-provider.md) | （例の取り違え）region TypeProvider の中身は `{provide: Greeting, useClass: Greeting}`（ClassProvider の形）、region ClassProvider の中身は `useValue`（ValueProvider の形） | packages/examples/core/di/ts/provider\_spec.ts 15〜24・57〜71（provider.ts 276・303 が指す） | 読み比べ。main 同じ |
| [5](05-crd-provider.md) | （例の誤り）`@Injectable(SomeModule, {deps: []})` は TS2554（引数は 1 つ） | di/interface/provider.ts 111〜114 | strict の tsc。main 同じ |
| [5](05-crd-provider.md) | （型との食い違い）StaticClassSansProvider の useClass は省けると書くが型は必須（省く形は ConstructorSansProvider）。provide は「たいてい Type か InjectionToken、any でもよい」と書くが型は `Type<any>` | provider.ts 61〜62・142・144 | tsc。main 同じ |
| [5](05-crd-provider.md) | （文の誤り）「この形は TypeProvider の短い形」が自分自身を指す。L267 の `Type'` は main で直った | provider.ts 267・270 | 95e8dec4e22 で L267 だけ直った。L270 は main 同じ |
| [5](05-crd-provider.md) | （食い違い）型引数なしの ModuleWithProviders は「非推奨」と書くが、型引数は必須で TS2314 | provider.ts 389 | tsc。main 同じ |
| [5](05-crd-provider.md) | （開発と本番で違う）multi と普通の provider を混ぜると、開発は「Cannot mix」、本番は黙って置き換えるか `Cannot read properties of undefined (reading 'push')` | di/r3\_injector.ts 497〜521（L512） | 記録。spec static\_injector\_spec.ts 158 は開発の文だけ。main 同じ |
| [5](05-crd-provider.md) | （開発と本番で違う）EnvironmentProviders を `@Component.providers` に入れると、開発は NG0207、本番は `Cannot convert undefined or null to object` | r3\_injector.ts 645〜647、provider.ts 349〜351 | 記録。spec di\_spec.ts 415 は開発だけ。main 同じ |
| [5](05-crd-provider.md) | （開発と本番で違う）importProvidersFrom に standalone のコンポーネントを渡すと、開発は NG0800、本番は通ってその imports の providers を集める | di/provider\_collection.ts 96〜99・107・164〜174 | 記録。spec di\_spec.ts 311 は開発だけ。main 同じ |
| [5](05-crd-provider.md) | （古い文）ViewEngine・StaticInjector の名前 | di/interface/defs.ts 33〜34・100・114・165 | 8c71b9fc42e（2021）で消えた。main 同じ |
| [6](06-crd-inject.md) | （食い違い）`inject` は「成功しなければ `null`」と書くが、options なしで見つからなければ NG0201（型は `T`） | di/injector\_compatibility.ts 172・241 | 本物。7f65089de86（2022）の文が InjectFlags の削除のあと残った。main 同じ（L166・L235） |
| [6](06-crd-inject.md) | （名前の誤り、main で直った）実装の `@param flags`（引数は `options`） | injector\_compatibility.ts 238〜240 | 6e024600e0b（2026-10-08）で直った |
| [6](06-crd-inject.md) | （例の食い違い）useFactory の例の `new Car(engine)` が、1 つ目の例の引数の無い Car と合わず TS2554 | injector\_compatibility.ts 250〜259・269 | strict の ngc。main 同じ（L263） |
| [6](06-crd-inject.md) | （古いコメント）`InternalInjectFlags` を「上の `InjectFlags` の写し」と書くが、公開の `InjectFlags` は v20 で消えた | di/interface/injector.ts 19〜24・48 | 611baaf0695（2025-03-11）で消えた。main 同じ |
| [6](06-crd-inject.md) | （食い違い）`@Self` を「解決は階層を上へたどる」と書く。実際は親へ行かない（spec 98 も） | di/metadata.ts 127〜128 | 本物。0a2132ef104（2016）の文。main 同じ |
| [6](06-crd-inject.md) | （例の誤り）@SkipSelf の例の deps に SkipSelf が無く、2 つ目は `new Self()`。例外は依存が無いから出る | packages/examples/core/di/ts/metadata\_spec.ts 125・131 | 本物。82c77ce2320（2019）で ReflectiveInjector から書き換えたとき。main 同じ |
| [6](06-crd-inject.md) | （食い違い）`Injector.get` は「notFoundValue が undefined なら例外」と書くが、optional なら `null`（spec 127 も） | di/injector.ts 65 | 本物。main 同じ |
| [6](06-crd-inject.md) | （古い文）`INJECTOR` を使うと `StaticInjector` を tree-shake できる。StaticInjector は 2021 年に消えた | di/injector\_token.ts 16〜17 | 8c71b9fc42e（2021-11-09）で消えた。main 同じ |
| [6](06-crd-inject.md) | （説明不足）`Injector.create` の `name` は開発モードの NG0201 の「Source:」だけで、`runInInjectionContext` の中の `inject` の例外には付かない。destroy の後の get・2 回目の destroy は NG0205 | injector.ts 96・140〜147（実装 create\_injector.ts 51〜53、r3\_injector.ts 404〜409） | 記録。main 同じ |
| [7](07-crd-lifecycle.md) | （古い文）`ChangeDetectorRef` の例の説明「OnPush を既定の CheckAlways の代わりに」。v22 の既定は OnPush | change\_detection/change\_detector\_ref.ts 33〜34 | 本物（書かない子は OnPush）。eae8f7e30b9（2026-03-16）から。main 同じ |
| [7](07-crd-lifecycle.md) | （古い文）OnPush は「`Default`（CheckAlways）に戻すまで」。`Default` は deprecated で `Eager` | change\_detection/constants.ts 20〜21 | 読み比べ。main 同じ |
| [7](07-crd-lifecycle.md) | （食い違い）`ngAfterViewChecked` は「コンポーネントのビューを確かめ終えたあと」と書くが、OnPush で飛ばした回にも呼ばれる | change\_detection/lifecycle\_hooks.ts 224〜225・240〜242 | デモ（ngAfterViewChecked +3、表示は変わらない）。f1ab3942187（2018）の文。main 同じ |
| [7](07-crd-lifecycle.md) | （食い違い）`firstChange` は「最初に代入された値か」と書くが、インスタンスの最初の ngOnChanges かどうか（入力ごとではない）。1 回目の `previousValue` は `undefined`（#67516） | change\_detection/simple\_change.ts 22・27（実装 render3/features/ng\_onchanges\_feature.ts 113〜117） | デモ（`setInput('b')` が firstChange=false）。main 同じ |
| [7](07-crd-lifecycle.md) | （不具合）コンポーネントの `useFactory` のサービスの `ngOnDestroy` が呼ばれない（`useClass` は呼ばれる） | render3/di\_setup.ts 260〜269（説明文は lifecycle\_hooks.ts 119） | デモで再現。#28738（開、2019）。spec providers\_spec.ts 495 が今の振る舞いを固める。main 同じ |
| [7](07-crd-lifecycle.md) | （説明が狭い）AfterViewInit・AfterViewChecked を「コンポーネントのビュー」と書くが、ビューを持たないディレクティブにも呼ばれる | lifecycle\_hooks.ts 196〜197・215 | デモ。main 同じ |
| [8](08-crd-differs.md) | （食い違い）`forEachOperation` の `currentIndex` を「record.currentIndex は元の位置、引数は途中の位置」と書くが、どちらも新しい一覧の位置で同じ数 | change\_detection/differs/iterable\_differs.ts 64〜66（実装 default\_iterable\_differ.ts 93・123） | デモ（全部の操作で同じ）と spec 430。8c7e93bebeb（2016）から。main 同じ |
| [8](08-crd-differs.md) | （古い文）`IterableDiffers`・`KeyValueDiffers` を「NgClass が使う」と書く。NgClass は differ を使わない | iterable\_differs.ts 190、keyvalue\_differs.ts 118 | 1be6b0a58a9（2024-01-08）で最後の引数も外れた。main 同じ |
| [8](08-crd-differs.md) | （写しの文）`KeyValueChanges.forEachPreviousItem` の「どこへ動いたか」。KeyValue の記録に位置は無い | keyvalue\_differs.ts 53〜54 | デモ。main 同じ |
| [8](08-crd-differs.md) | （例の誤り）`function userTrackBy(index, user)` は strict で TS7006 ×2 | iterable\_differs.ts 146〜148 | strict の ngc。14abc68ccf9（2021）から。main 同じ |
| [8](08-crd-differs.md) | （内部のコメント）番号の「3)」が 2 つ、「rather then」 | default\_iterable\_differ.ts 342〜351・358 | 1bd304e7abc（2014）から。main 同じ |
| [9](09-crd-scheduling.md) | （言い方）runCoalescing の変更検知は「requestAnimation の中」と書くが、`setTimeout` と `requestAnimationFrame` の早い方 | change\_detection/scheduling/ng\_zone\_scheduling.ts 214（実装 zone/ng\_zone.ts 406） | Node の記録（rAF の無い環境で setTimeout の側）。main 同じ（L215） |
| [9](09-crd-scheduling.md) | （古いコメント）`PROVIDED_NG_ZONE` を「bootstrapModule と一緒に使われていないか確かめる」と書く。実際は両方 provide の警告（NG0408）にだけ使い、L140 は bootstrapModule で使えと書く | ng\_zone\_scheduling.ts 75〜77（使う所 platform/bootstrap.ts 96） | Node の記録（bootstrapModule の applicationProviders で NgZone が届く）。main 同じ |
| [9](09-crd-scheduling.md) | （古いコメント）引数の無い `tick()` に `@param shouldRefreshViews`。SCHEDULE\_IN\_ROOT\_ZONE の「v19 で消す」の TODO も残る | zoneless\_scheduling\_impl.ts 254〜255、zoneless\_scheduling.ts 78 | dabfb6de3dc（2024-07-10）で引数が消えた。main 同じ（L261・L78） |

説明文のとおりに動いたものも多くありました。`inject` の options の 4 つと説明文の 5 つの場所、`@Optional`・`@Host` の例、`Injector.create` の `parent` と destroy、フックの呼ばれる順と `*Init` が 1 回だけのこと、OnPush の子の `ngDoCheck`（ca440551661、2026-05-20 に足された文）、`markForCheck`・`detach`・`detectChanges`・`reattach`、differ の `diff` の戻り値と trackBy と `extend`、`eventCoalescing` の 2 回と 1 回、`runCoalescing` の 10 回と 1 回、zoneless の説明文の 7 つの API は、どれも説明文のとおりです。

## 聞かれそうな質問

**Q. core の spec を 1 つの describe だけ走らせるには？**

../angular で `pnpm bazel test //packages/core/test/acceptance:acceptance --test_arg=--filter=<名前>` です。`di/`・`change_detection/differs/`・`zone/` などは `//packages/core/test:test` で、4 つの shard に分かれるので、件数は shard ごとの「Ran N」を足します。一致が 0 件でも PASSED になるので、件数を必ず見ます。

**Q. 説明文と spec が食い違っているとき、どちらが正しいのですか？**

このシリーズでは、ほとんど spec と実装が同じ側で、説明文だけが古いか言い過ぎでした（`Injector.get` の optional、`forEachOperation` の index、1 回目の `previousValue`）。逆に、spec が説明文と逆の振る舞いを固めている所（`useFactory` の `ngOnDestroy`、providers\_spec.ts 495）は、直すと spec も変わります。

**Q. 説明文の中心の約束なのに spec が無いものは？**

`inject()` を文脈の外で呼ぶと NG0203（`assertInInjectionContext` の it しかない）、zoneless の NG0914・NG0408 の警告、JIT の `@Directive.queries` などです（3 節）。

**Q. 見つけた食い違いのうち、新しい本家で直っているのは？**

`inject` の `@param flags`（6e024600e0b）と、クエリの説明の `** Note: ***` と Provider の説明の `Type'`（どちらも 95e8dec4e22）の 3 つです。ほかは d201dd76ef2 でも同じ文です。

## 読み終えて

- core の spec は `:test`（shard 4、1401）と `:acceptance`（2693）の 2 つで、どちらも 0 failures。名前で絞ると各章の約束を固める it が見つかる。
- spec はたいてい実装の側を固めていて、説明文の食い違いは spec を見れば裏が取れる（optional の `null`、`forEachOperation`、`previousValue`）。
- `useFactory` の `ngOnDestroy` のように、spec が issue（#28738）の振る舞いを固めている所もある。
- NG0203 を待つ `inject()` の it と、zoneless の警告の it は無い。
- 見つけた食い違いの多くは、公開 API が変わったあとに残った文（InjectFlags、StaticInjector、CheckAlways、NgClass、ignoreChangesOutsideZone の周り）。

---

← 前: [変更検知のスケジューラーの説明文：provideZoneChangeDetection と zoneless](09-crd-scheduling.md)  
次: [ApplicationRef とアプリのトークンの説明文](../cra/01-cra-app-ref.md) →
