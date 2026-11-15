[目次](../README.md) › [@angular/upgrade の内側：AngularJS と 1 つのページを分け合う](README.md) › 第 5 回 / 全 6 回

# downgradeModule：Angular の側を後から起こす

> downgradeModule が $$UpgradeModule.lazyN という AngularJS のモジュールを作り、最初の downgrade したコンポーネントの link で呼ばれる factory の中でだけ Angular を起動する行、複数の downgradeModule の名前と数え方、SyncPromise（promise\_util.ts、c1ae6124c83）で同期に作る理由、zone を既定にした 3 つのコミットと 2a7a5de53fd、UpgradeModule との違い（起動の順・ゾーン・$digest の持ち方）。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/upg-downgrade-module)

---

この章で分かること: `downgradeModule` が作る AngularJS のモジュールの中身を 1 行ずつ読み、Angular の側が「最初の downgrade したコンポーネントが要るとき」に 1 回だけ起動する仕組みが、AngularJS の factory のキャッシュと `SyncPromise` の 2 つでできていることを確かめます。2 つ並べたときの名前の付け方と、UpgradeModule との違いも表にします。

読む対象は `packages/upgrade/static/src/downgrade_module.ts`（373〜456 行目）・`src/common/src/promise_util.ts`・`util.ts` の `validateInjectionKey` の後半です。downgradeComponent の link が `lazyModuleRef` を取り出す行と、`SyncPromise.all` を呼ぶ行は[第 2 回](02-upg-downgrade-component.md)、UpgradeModule の変更検知の橋は[第 4 回](04-upg-injection-cd.md)にあります。

1. [1. 全体と起動](01-upg-bootstrap.md)
2. [2. downgradeComponent](02-upg-downgrade-component.md)
3. [3. UpgradeComponent](03-upg-upgrade-component.md)
4. [4. 注入器と変更検知](04-upg-injection-cd.md)
5. **5. downgradeModule**（この章）
6. [6. spec と issue](06-upg-tests-issues.md)

## 1. 名前を決め、起動の関数を 1 つにそろえる

📄 `angular/packages/upgrade/static/src/downgrade_module.ts` L373–399 （▶ の行: 379–381, 384, 387–388, 390, 393–394, 396, 398）

```ts
373 │ export function downgradeModule<T>(
374 │   moduleOrBootstrapFn:
375 │     | Type<T>
376 │     | NgModuleFactory<T>
377 │     | ((extraProviders: StaticProvider[]) => Promise<NgModuleRef<T>>),
378 │ ): string {
379 ▶   const lazyModuleName = `${ɵconstants.UPGRADE_MODULE_NAME}.lazy${++moduleUid}`;
380 ▶   const lazyModuleRefKey = `${ɵconstants.LAZY_MODULE_REF}${lazyModuleName}`;
381 ▶   const lazyInjectorKey = `${ɵconstants.INJECTOR_KEY}${lazyModuleName}`;
382 │ 
383 │   let bootstrapFn: (extraProviders: StaticProvider[]) => Promise<NgModuleRef<T>>;
384 ▶   if (ɵutil.isNgModuleType(moduleOrBootstrapFn)) {
385 │     // NgModule class
386 │     bootstrapFn = (extraProviders: StaticProvider[]) =>
387 ▶       platformBrowser(extraProviders).bootstrapModule(moduleOrBootstrapFn, {
388 ▶         applicationProviders: [internalProvideZoneChangeDetection({})],
389 │       });
390 ▶   } else if (!ɵutil.isFunction(moduleOrBootstrapFn)) {
391 │     // NgModule factory
392 │     bootstrapFn = (extraProviders: StaticProvider[]) =>
393 ▶       platformBrowser(extraProviders).bootstrapModuleFactory(moduleOrBootstrapFn, {
394 ▶         applicationProviders: [internalProvideZoneChangeDetection({})],
395 │       });
396 ▶   } else {
397 │     // bootstrap function
398 ▶     bootstrapFn = moduleOrBootstrapFn;
399 │   }
```

1. **379 行目: AngularJS のモジュールの名前**

   `UPGRADE_MODULE_NAME` は `'$$UpgradeModule'`、`moduleUid` は downgrade\_module.ts のモジュールの変数（`let moduleUid = 0`）です。呼ぶたびに 1 つ増えるので、名前は `$$UpgradeModule.lazy1`・`$$UpgradeModule.lazy2` … になります（記録でもこの 2 つ）。戻り値はこの名前の文字列で、利用者は AngularJS のメインのモジュールの依存に書き、2 つ以上あるときは `downgradeComponent({ downgradedModule: 名前 })` にも渡します。
2. **380〜381 行目: そのモジュールだけの 2 つのキー**

   `'$$angularLazyModuleRef' + 名前` と `'$$angularInjector' + 名前`。名前を後ろに付けるので、2 つの downgradeModule が同じ AngularJS の `$injector` の中でぶつかりません。[第 4 回](04-upg-injection-cd.md)の `downgradeInjectable` の 77 行目の `INJECTOR_KEY + downgradedModule` は、この 381 行目のキーを指します。
3. **384〜395 行目: NgModule のクラスか factory なら、起動の関数を作る**

   384 行目の `isNgModuleType` は `ɵmod` を持つ関数か（次の 2 節の util.ts）。クラスなら 387 行目で `platformBrowser(extraProviders).bootstrapModule`、古い `NgModuleFactory` なら 393 行目で `bootstrapModuleFactory` を呼ぶ関数にします。どちらも 388・394 行目で `applicationProviders: [internalProvideZoneChangeDetection({})]` を渡し、zone の変更検知で起動します。
4. **396〜398 行目: 関数ならそのまま使う**

   利用者が渡した `(extraProviders) => Promise<NgModuleRef>` をそのまま使います。ここでは zone の provider を足しません。記録の「起動の関数を渡す」では、`platformBrowser(extraProviders).bootstrapModule(AppModule)` と書いただけのとき、コンポーネントが受け取った NgZone は `NoopNgZone` でした（v22 の既定の zoneless）。

### zone を既定にした 3 つのコミット

388・394 行目の形になるまでに、同じ日（2025-09-15）の PR #63814 の中で 2 回書き直され、そのあと別の PR でもう 1 回変わっています。

| コミット | やり方 |
| --- | --- |
| 412d5af92cc | `platformBrowser(extraProviders)` の戻り値に `(platform as any)._additionalApplicationProviders = internalProvideZoneChangeDetection({})` を書いてから `bootstrapModule`。downgrade\_module\_spec.ts から `provideZoneChangeDetection` の 16 行を消した |
| 0bb68a81877 | core の platform\_ref.ts にモジュールの変数と `ɵsetZoneProvidersForNextBootstrap()` を足し、`wrappedBootstrapFn` で「次の 1 回の起動だけ zone の provider を足す」。この形では起動の関数を渡した場合（396 行目の枝）も zone になった |
| d9e597f3418 | downgrade\_module.ts は書式だけ。UpgradeModule の NgModule に `ɵinternalProvideZoneChangeDetection({})` を足した（[第 4 回](04-upg-injection-cd.md)の 2 節） |
| 2a7a5de53fd（2025-10-10、#64354） | core の `bootstrapModule` が `applicationProviders` の選択肢を受け取れるようになり、`ɵsetZoneProvidersForNextBootstrap` と `wrappedBootstrapFn` を消して、今の 388・394 行目の形にした |

0bb68a81877 の形は、起動の関数を渡す場合にも zone の provider を足していました。2a7a5de53fd のあとは、NgModule のクラスと factory の 2 つの枝だけが zone です。`git tag --contains` で最初のタグを見ると、412d5af92cc・0bb68a81877・d9e597f3418 は 21.0.0-next.4、2a7a5de53fd は 21.0.0-next.8 です。

## 2. AngularJS のモジュールの中身

📄 `angular/packages/upgrade/static/src/downgrade_module.ts` L401–417 （▶ の行: 401, 405–410, 415, 417）

```ts
401 ▶   let injector: Injector;
402 │ 
403 │   // Create an ng1 module to bootstrap.
404 │   ɵangular1
405 ▶     .module_(lazyModuleName, [])
406 ▶     .constant(ɵconstants.UPGRADE_APP_TYPE_KEY, ɵutil.UpgradeAppType.Lite)
407 ▶     .factory(ɵconstants.INJECTOR_KEY, [lazyInjectorKey, identity])
408 ▶     .factory(lazyInjectorKey, () => {
409 ▶       if (!injector) {
410 ▶         throw new Error(
411 │           'Trying to get the Angular injector before bootstrapping the corresponding ' +
412 │             'Angular module.',
413 │         );
414 │       }
415 ▶       return injector;
416 │     })
417 ▶     .factory(ɵconstants.LAZY_MODULE_REF, [lazyModuleRefKey, identity])
```

1. **406 行目**

   アプリの種類の定数を `Lite` にします。`validateInjectionKey` と downgradeComponent はこれを見て、downgradeModule のアプリだと知ります。
2. **407 行目**

   名前の付かない `'$$angularInjector'` は、381 行目のキーの factory をそのまま返す別名（`identity` は引数を返すだけの関数）です。
3. **408〜416 行目**

   本物の注入器のキーの factory は、401 行目の `injector` がまだ無ければ例外を投げます。Angular が起動する前に `downgradeInjectable` のサービスを取ると、記録でも「Trying to get the Angular injector before bootstrapping the corresponding Angular module.」になりました。
4. **417 行目**

   名前の付かない `'$$angularLazyModuleRef'` も、380 行目のキーの別名です。

407 行目と 417 行目の別名は、downgradeModule が 2 つあると、どちらも同じ名前を登録します。AngularJS の `$provide` は同じ名前を後から登録したもので上書きするので、名前の付かないキーで引くと後に読み込まれた方になります。それを使わせないのが、次の `validateInjectionKey` の検査です。

📄 `angular/packages/upgrade/static/src/downgrade_module.ts` L418–452 （▶ の行: 418, 421–425, 432, 437, 440, 444–446, 451）

```ts
418 ▶     .factory(lazyModuleRefKey, [
419 │       ɵconstants.$INJECTOR,
420 │       ($injector: ɵangular1.IInjectorService) => {
421 ▶         setTempInjectorRef($injector);
422 ▶         const result: ɵutil.LazyModuleRef = {
423 ▶           promise: bootstrapFn(angular1Providers).then((ref) => {
424 ▶             injector = result.injector = new NgAdapterInjector(ref.injector);
425 ▶             injector.get(ɵconstants.$INJECTOR);
426 │ 
427 │             // Destroy the AngularJS app once the Angular `PlatformRef` is destroyed.
428 │             // This does not happen in a typical SPA scenario, but it might be useful for
429 │             // other use-cases where disposing of an Angular/AngularJS app is necessary
430 │             // (such as Hot Module Replacement (HMR)).
431 │             // See https://github.com/angular/angular/issues/39935.
432 ▶             injector.get(PlatformRef).onDestroy(() => ɵutil.destroyApp($injector));
433 │ 
434 │             return injector;
435 │           }),
436 │         };
437 ▶         return result;
438 │       },
439 │     ])
440 ▶     .config([
441 │       ɵconstants.$INJECTOR,
442 │       ɵconstants.$PROVIDE,
443 │       ($injector: ɵangular1.IInjectorService, $provide: ɵangular1.IProvideService) => {
444 ▶         $provide.constant(
445 ▶           ɵconstants.DOWNGRADED_MODULE_COUNT_KEY,
446 ▶           ɵutil.getDowngradedModuleCount($injector) + 1,
447 │         );
448 │       },
449 │     ]);
450 │ 
451 ▶   return lazyModuleName;
452 │ }
```

1. **418 行目: Angular を起動するのは、この factory が呼ばれたとき**

   AngularJS の factory は、その名前が初めて `$injector.get` されたときに 1 回だけ呼ばれ、戻り値（422 行目の `result`）がキャッシュされます。このキーを `get` するのは downgradeComponent の link です（親の Angular のコンポーネントが無いとき。[第 2 回](02-upg-downgrade-component.md)）。だから「最初の downgrade したコンポーネントの link」で Angular が起動し、2 つ目からは同じ `result` が返ります。
2. **421 行目: AngularJS の `$injector` を一時的に置く**

   `setTempInjectorRef` は angular1\_providers.ts のモジュールの変数に入れる関数で、425 行目の `injector.get('$injector')` がそれを読み出して消します（[第 1 回](01-upg-bootstrap.md)）。
3. **423 行目: 起動の関数に AngularJS の 4 つの provider を渡す**

   `angular1Providers` が `extraProviders` になり、387 行目の `platformBrowser(extraProviders)` のプラットフォームの注入器に入ります。
4. **424 行目: 起動が終わったら、`result.injector` と 401 行目の変数に入れる**

   `result.promise` が解決するまでは `result.injector` が無いので、downgradeComponent は `promise` を待ちます。一度入れば、次からは `injector` をすぐ使えます。
5. **432 行目: Angular の `PlatformRef` が壊れたら AngularJS のアプリも壊す**

   HMR のための行（コメントの #39935）。UpgradeModule の同じ行は[第 1 回](01-upg-bootstrap.md)。
6. **440〜449 行目: いくつ downgradeModule があるかを数える**

   config ブロックはモジュールを読み込む順に走ります。444〜447 行目は、前のモジュールの config が入れた `'$$angularDowngradedModuleCount'` を読んで 1 足した定数を入れ直すので、最後に読まれたモジュールの config のあとには、downgradeModule の数が入っています。

📄 `angular/packages/upgrade/src/common/src/util.ts` L85–104 （▶ の行: 86–87, 92–93, 103）

```ts
 85 │ export function getDowngradedModuleCount($injector: IInjectorService): number {
 86 ▶   return $injector.has(DOWNGRADED_MODULE_COUNT_KEY)
 87 ▶     ? $injector.get(DOWNGRADED_MODULE_COUNT_KEY)
 88 │     : 0;
 89 │ }
 90 │ 
 91 │ export function getUpgradeAppType($injector: IInjectorService): UpgradeAppType {
 92 ▶   return $injector.has(UPGRADE_APP_TYPE_KEY)
 93 ▶     ? $injector.get(UPGRADE_APP_TYPE_KEY)
 94 │     : UpgradeAppType.None;
 95 │ }
 96 │ 
 97 │ export function isFunction(value: any): value is Function {
 98 │   return typeof value === 'function';
 99 │ }
100 │ 
101 │ export function isNgModuleType(value: any): value is Type<unknown> {
102 │   // NgModule class should have the `ɵmod` static property attached by AOT or JIT compiler.
103 ▶   return isFunction(value) && !!value[ɵNG_MOD_DEF];
104 │ }
```

📄 `angular/packages/upgrade/src/common/src/util.ts` L131–156 （▶ の行: 131–133, 140–141, 149–150）

```ts
131 ▶     case UpgradeAppType.Lite:
132 ▶       if (!downgradedModule && downgradedModuleCount >= 2) {
133 ▶         throw new Error(
134 │           `Error while ${attemptedAction}: 'downgradedModule' not specified.\n` +
135 │             'This application contains more than one downgraded Angular module, thus you need to ' +
136 │             "always specify 'downgradedModule' when downgrading components and injectables.",
137 │         );
138 │       }
139 │ 
140 ▶       if (!$injector.has(injectionKey)) {
141 ▶         throw new Error(
142 │           `Error while ${attemptedAction}: Unable to find the specified downgraded module.\n` +
143 │             'Did you forget to downgrade an Angular module or include it in the AngularJS ' +
144 │             'application?',
145 │         );
146 │       }
147 │ 
148 │       break;
149 ▶     default:
150 ▶       throw new Error(
151 │         `Error while ${attemptedAction}: Not a valid '@angular/upgrade' application.\n` +
152 │           'Did you forget to downgrade an Angular module or include it in the AngularJS ' +
153 │           'application?',
154 │       );
155 │   }
156 │ }
```

`Lite` のアプリでは、132 行目で「名前を書いていないのに downgradeModule が 2 つ以上」を断り、140 行目で「名前のキーが `$injector` に無い」（その downgradeModule をメインのモジュールの依存に書き忘れた）を断ります。149 行目の default は、アプリの種類の定数がどこにも無いとき（UpgradeModule も downgradeModule も使っていない AngularJS のアプリ）です。記録の「2 つ並べる」で、名前を書かない `<cmp-bare>` を出すと、132 行目の文言が AngularJS の `$exceptionHandler`（`console.error`）に出て、要素は空のままでした。

## 3. 親がいるとき・いないときの 2 つの注入器

📄 `angular/packages/upgrade/src/common/src/downgrade_component.ts` L156–189 （▶ の行: 158, 160, 162, 167, 170, 174, 177）

```ts
156 │         // Notes:
157 │         //
158 ▶         // There are two injectors: `finalModuleInjector` and `finalParentInjector` (they might be
159 │         // the same instance, but that is irrelevant):
160 ▶         // - `finalModuleInjector` is used to retrieve `ComponentFactoryResolver`, thus it must be
161 │         //   on the same tree as the `NgModule` that declares this downgraded component.
162 ▶         // - `finalParentInjector` is used for all other injection purposes.
163 │         //   (Note that Angular knows to only traverse the component-tree part of that injector,
164 │         //   when looking for an injectable and then switch to the module injector.)
165 │         //
166 │         // There are basically three cases:
167 ▶         // - If there is no parent component (thus no `parentInjector`), we bootstrap the downgraded
168 │         //   `NgModule` and use its injector as both `finalModuleInjector` and
169 │         //   `finalParentInjector`.
170 ▶         // - If there is a parent component (and thus a `parentInjector`) and we are sure that it
171 │         //   belongs to the same `NgModule` as this downgraded component (e.g. because there is only
172 │         //   one downgraded module, we use that `parentInjector` as both `finalModuleInjector` and
173 │         //   `finalParentInjector`.
174 ▶         // - If there is a parent component, but it may belong to a different `NgModule`, then we
175 │         //   use the `parentInjector` as `finalParentInjector` and this downgraded component's
176 │         //   declaring `NgModule`'s injector as `finalModuleInjector`.
177 ▶         //   Note 1: If the `NgModule` is already bootstrapped, we just get its injector (we don't
178 │         //           bootstrap again).
179 │         //   Note 2: It is possible that (while there are multiple downgraded modules) this
180 │         //           downgraded component and its parent component both belong to the same NgModule.
181 │         //           In that case, we could have used the `parentInjector` as both
182 │         //           `finalModuleInjector` and `finalParentInjector`, but (for simplicity) we are
183 │         //           treating this case as if they belong to different `NgModule`s. That doesn't
184 │         //           really affect anything, since `parentInjector` has `moduleInjector` as ancestor
185 │         //           and trying to resolve `ComponentFactoryResolver` from either one will return
186 │         //           the same instance.
187 │ 
188 │         // If there is a parent component, use its injector as parent injector.
189 │         // If this is a "top-level" Angular component, use the module injector.
```

downgradeComponent の link の中のこの長いコメントが、downgradeModule のときに注入器をどう選ぶかの説明です。158〜162 行目のとおり、コンポーネントを作るときの注入器は 2 つで、`finalModuleInjector` はコンポーネントを宣言した NgModule の側（環境の注入器を取る）、`finalParentInjector` はそれ以外の注入に使います。

1. **167 行目: 親の Angular のコンポーネントがいない**

   418 行目の factory で NgModule を起動し、その注入器を 2 つともに使います。
2. **170 行目: 親がいて、同じ NgModule だと分かっている（downgradeModule が 1 つ）**

   親の注入器を 2 つともに使い、418 行目の factory は呼びません。
3. **174 行目: 親がいるが、別の NgModule かもしれない（downgradeModule が 2 つ以上）**

   親の注入器を `finalParentInjector` に、自分の NgModule の注入器を `finalModuleInjector` にします。177 行目のとおり、その NgModule がもう起動していれば、注入器を取るだけで起動し直しません。

どちらの注入器も、まだ `SyncPromise`（または 424 行目の前の Promise）かもしれません。両方がそろうのを待つのが、次の `SyncPromise.all` です。

## 4. SyncPromise: そろっていれば同期で進む

📄 `angular/packages/upgrade/src/common/src/promise_util.ts` L48–67 （▶ の行: 50, 56, 60–62, 64）

```ts
48 │   resolve(value: T): void {
49 │     // Do nothing, if already resolved.
50 ▶     if (this.resolved) return;
51 │ 
52 │     this.value = value;
53 │     this.resolved = true;
54 │ 
55 │     // Run the queued callbacks.
56 ▶     this.callbacks.forEach((callback) => callback(value));
57 │     this.callbacks.length = 0;
58 │   }
59 │ 
60 ▶   then(callback: (value: T) => unknown): void {
61 ▶     if (this.resolved) {
62 ▶       callback(this.value!);
63 │     } else {
64 ▶       this.callbacks.push(callback);
65 │     }
66 │   }
67 │ }
```

📄 `angular/packages/upgrade/src/common/src/promise_util.ts` L22–46 （▶ の行: 27, 34, 38–39, 41）

```ts
22 │ export class SyncPromise<T> {
23 │   protected value: T | undefined;
24 │   private resolved = false;
25 │   private callbacks: ((value: T) => unknown)[] = [];
26 │ 
27 ▶   static all<T>(valuesOrPromises: (T | Thenable<T>)[]): SyncPromise<T[]> {
28 │     const aggrPromise = new SyncPromise<T[]>();
29 │ 
30 │     let resolvedCount = 0;
31 │     const results: T[] = [];
32 │     const resolve = (idx: number, value: T) => {
33 │       results[idx] = value;
34 ▶       if (++resolvedCount === valuesOrPromises.length) aggrPromise.resolve(results);
35 │     };
36 │ 
37 │     valuesOrPromises.forEach((p, idx) => {
38 ▶       if (isThenable(p)) {
39 ▶         p.then((v) => resolve(idx, v));
40 │       } else {
41 ▶         resolve(idx, p);
42 │       }
43 │     });
44 │ 
45 │     return aggrPromise;
46 │   }
```

`SyncPromise` は Promise に似た形の 50 行ほどのクラスです。違いは、61〜62 行目のとおり、もう解決していれば `then` がその場で（同期で）callback を呼ぶことと、56 行目の `resolve` も、待っている callback をその場で呼ぶことです。本物の Promise の `then` は、解決していても callback を microtask に回します。`all` も、41 行目で「thenable でない値」はすぐ数に入れ、34 行目で全部そろったら同期で `resolve` します。

なぜ要るのかは c1ae6124c83（2019-07-25、「compile downgraded components synchronously (if possible)」、#30330 を閉じた）の本文にあります。AngularJS のコンパイルは（テンプレートを取りに行く場合を除いて）同期の処理で、downgrade したコンポーネントも、注入器がそろっていればその場で作りたい。以前は `ParentInjectorPromise#then()`（同期）で保っていたのが、#27217 で `Promise.all()`（非同期）に置き換わって壊れたので、同期のまま束ねる `SyncPromise.all()` を足した、という内容です。#30330 の題は「Staticaly downgraded components no longer rendered in AngularJS tests after call to $compile」で、`$compile` のすぐ後に DOM を見るテストで、コンポーネントがまだ無いことが問題でした。

> **🧪 DEMO 2 — 本物の Promise は、解決していても後で呼ぶ（このページの上で動きます）**
>
> ボタンを押すと、もう解決した `Promise.resolve(注入器)` に `then` を付け、呼んだ順を並べます。下の記録の「2 つ目の &lt;cmp-a&gt; を出す」では、`SyncPromise` のおかげで、コンポーネントの constructor が `$apply` から戻る前に呼ばれています。
>
> 記録（SyncPromise、22.1.6）の「2 つ目の &lt;cmp-a&gt; を出す」の順:
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/upg-downgrade-module)

## 5. DEMO — Angular はいつ起動するか

> **🧪 DEMO 1 — 記録の再生（@angular/upgrade 22.1.6・AngularJS 1.8.3・jsdom）**
>
> AngularJS のアプリを `angular.bootstrap` で起動し、`ng-repeat` の数を増やして downgrade したコンポーネント `<cmp-a>` を 1 つずつ出します。NgModule の constructor・`ngDoBootstrap`・コンポーネントの constructor と、`$digest` を記録しました。太字の「操作の呼び出しから戻った」より上が同期で起きたこと、下が後（Promise の解決のあと）で起きたことです。Angular のコンポーネントは v22 の既定の OnPush ではなく Eager にしました（押していない方のビューが古いまま残ると、話がずれるため）。
>
> AngularJS のモジュールの名前: `$$UpgradeModule.lazy1`
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/upg-downgrade-module)

- **angular.bootstrap**: プラットフォームはまだ無く、AngularJS の起動は NgZone の外です（UpgradeModule は `ngZone.run` の中で起動する。[第 1 回](01-upg-bootstrap.md)）。
- **1 つ目の &lt;cmp-a&gt;**: link で 418 行目の factory が呼ばれ、`bootstrapModule` の Promise を待つので、操作から戻った時点では中身が空です。NgModule の constructor・`ngDoBootstrap`・コンポーネントの constructor はそのあとに呼ばれ、コンポーネントの constructor の中では `NgZone.isInAngularZone()` が true でした。最後の `$digest` は downgradeComponent の `scope.$evalAsync`（非同期で作ったときの 1 行。[第 2 回](02-upg-downgrade-component.md)）です。
- **2 つ目の &lt;cmp-a&gt;**: `result.injector` がもうあるので、`SyncPromise` が同期で進み、constructor は操作から戻る前に呼ばれ、戻った直後に中身があります。NgModule は 2 回目の起動をしません。
- **Angular の側のボタン**: Angular の tick で 2 つの &lt;cmp-a&gt; は直りますが、AngularJS の表示は `-` のままです。downgradeModule には UpgradeModule の橋（[第 4 回](04-upg-injection-cd.md)）が無く、次の段で `$digest` を手で回すと `1` になります。
- **2 つ並べる**: `<cmp-b>` を出したときに、B の NgModule が初めて起動します（A とは別の NgModule の注入器）。
- **起動の関数を渡す**: NgZone が `NoopNgZone` になり、Angular の側のボタンのあと、もう 1 つの &lt;cmp-a&gt; は古いまま残り、開発モードの `checkNoChanges` が NG0100 を出しました。zoneless の tick は印の付いたビューだけを回すからです（[zoneless で動く条件の章](../zoneless/11-zoneless-migration.md)）。

## 6. UpgradeModule との違い

|   | UpgradeModule | downgradeModule |
| --- | --- | --- |
| 先に起動するもの | Angular（`bootstrapModule` → `ngDoBootstrap` で `upgrade.bootstrap`） | AngularJS（利用者の `angular.bootstrap`）。Angular は最初の downgrade したコンポーネントの link で（418 行目） |
| AngularJS の起動と NgZone | NgZone の中（[第 1 回](01-upg-bootstrap.md)） | NgZone の外（記録で `isInAngularZone()` が false）。コンポーネントを作る・input を渡すところだけ `ngZone.run` で包む（第 2 回の `wrapCallback`） |
| アプリの種類の定数 | `Static` | `Lite`（406 行目） |
| `'$$angularInjector'` | 起動の前から値（init モジュールの `.value`） | 起動の前は例外を投げる factory（408〜416 行目） |
| Angular の変化のあとの `$digest` | 自動（`onMicrotaskEmpty` か `afterTick`。[第 4 回](04-upg-injection-cd.md)） | 無い。利用者が `$apply` か `$digest` を呼ぶ（記録の「Angular の側のボタン」） |
| downgrade したビューの変更検知 | `$digest` のたびの `$watch` の `detectChanges` | それに加えて `ApplicationRef.attachView`（第 2 回の `manuallyAttachView`）。Angular の tick でも回る |
| zone の provider | NgModule の providers（upgrade\_module.ts 149 行目） | 起動の `applicationProviders`（388・394 行目）。起動の関数を渡したときは無い |
| Testability と `$interval` の包み | あり（[第 4 回](04-upg-injection-cd.md)の 5 節） | 無い（downgrade\_module.ts の config は数を数えるだけ） |
| Angular のモジュールの数 | 1 つ | いくつでも。名前（lazy1, lazy2 …）を `downgradedModule` で渡す |

downgradeModule の説明のコメント（「Differences with `UpgradeModule`」の見出し）も、違いは 2 つだと書いています。「AngularJS のメインのモジュールを Angular のゾーンの中で起動しない」と「Angular の側で変化があっても自動で `$digest()` を回さない」です。同じコメントは、downgradeModule と UpgradeModule を同じアプリで一緒に使うことはできない、とも書いています。

## テストと直し方

この章の行を固めている spec です（行番号は 8576f161ae4 で `grep -n` したもの）。

| spec | describe / it（行） | 固めていること |
| --- | --- | --- |
| `src/common/test/promise_util_spec.ts` | `isThenable()`（11）の it 3 つ、`SyncPromise`（39）の it 3 つと `.all()`（88）の it 3 つ | 同期で呼ぶこと、2 回目の `resolve` を無視すること、`all` の数え方 |
| `static/test/integration/downgrade_module_spec.ts` | 59 行目の `lazy-load ng2 module (propagateDigest: …)` の it 21 個と、1612 行目の `(common error)` の it 3 個。58 行目の `[true, false].forEach` で 2 回ずつ | 複数のモジュール（63）、NgModule のクラス（130）、入れ子（189・280）、注入器の木（466・552）、Angular のゾーンの中で作る・壊す（808・848・890・959）、NgZone を 1 回だけ取る（1440）、エラー（1671・1715・1751） |

📄 `angular/packages/upgrade/src/common/test/promise_util_spec.ts` L39–66 （▶ の行: 47–48, 50, 52–53, 61–62, 64）

```ts
39 │ describe('SyncPromise', () => {
40 │   it('should call all callbacks once resolved', () => {
41 │     const spy1 = jasmine.createSpy('spy1');
42 │     const spy2 = jasmine.createSpy('spy2');
43 │ 
44 │     const promise = new SyncPromise<string>();
45 │     promise.then(spy1);
46 │     promise.then(spy2);
47 ▶ 
48 ▶     expect(spy1).not.toHaveBeenCalled();
49 │     expect(spy2).not.toHaveBeenCalled();
50 ▶ 
51 │     promise.resolve('foo');
52 ▶ 
53 ▶     expect(spy1).toHaveBeenCalledWith('foo');
54 │     expect(spy2).toHaveBeenCalledWith('foo');
55 │   });
56 │ 
57 │   it('should call callbacks immediately if already resolved', () => {
58 │     const spy = jasmine.createSpy('spy');
59 │ 
60 │     const promise = new SyncPromise<string>();
61 ▶     promise.resolve('foo');
62 ▶     promise.then(spy);
63 │ 
64 ▶     expect(spy).toHaveBeenCalledWith('foo');
65 │   });
66 │ 
```

📄 `angular/packages/upgrade/static/test/integration/downgrade_module_spec.ts` L161–187 （▶ の行: 161–162, 169, 177, 183, 186）

```ts
161 ▶         const downModA = downgradeModule(Ng2ModuleA);
162 ▶         const downModB = downgradeModule(Ng2ModuleB);
163 │         const ng1Module = angular
164 │           .module_('ng1', [downModA, downModB])
165 │           .directive(
166 │             'ng2A',
167 │             downgradeComponent({
168 │               component: Ng2ComponentA,
169 ▶               downgradedModule: downModA,
170 │               propagateDigest,
171 │             }),
172 │           )
173 │           .directive(
174 │             'ng2B',
175 │             downgradeComponent({
176 │               component: Ng2ComponentB,
177 ▶               downgradedModule: downModB,
178 │               propagateDigest,
179 │             }),
180 │           );
181 │ 
182 │         const element = html('<ng2-a></ng2-a> | <ng2-b></ng2-b>');
183 ▶         angular.bootstrap(element, [ng1Module.name]);
184 │ 
185 │         // Wait for the module to be bootstrapped.
186 ▶         setTimeout(() => expect(element.textContent).toBe('a | b'));
187 │       }));
```

📄 `angular/packages/upgrade/static/test/integration/downgrade_module_spec.ts` L1771–1786 （▶ の行: 1772, 1774, 1777–1778）

```ts
1771 │           const element = html('<ng2-a></ng2-a> | <ng2-b></ng2-b>');
1772 ▶           angular.bootstrap(element, [ng1Module.name]);
1773 │ 
1774 ▶           expect(errorSpy).toHaveBeenCalledTimes(1);
1775 │           expect(errorSpy).toHaveBeenCalledWith(
1776 │             new Error(
1777 ▶               "Error while instantiating component 'Ng2ComponentB': 'downgradedModule' not " +
1778 ▶                 'specified.\n' +
1779 │                 'This application contains more than one downgraded Angular module, thus you need ' +
1780 │                 "to always specify 'downgradedModule' when downgrading components and " +
1781 │                 'injectables.',
1782 │             ),
1783 │             '<ng2-b>',
1784 │           );
1785 │         }));
1786 │       });
```

promise\_util\_spec.ts の 50〜53 行目は「`resolve` した、その行のすぐ後で callback が呼ばれている」、61〜64 行目は「解決したあとの `then` がその場で呼ぶ」を見ます。downgrade\_module\_spec.ts の 161〜162 行目は NgModule のクラスを渡す形で、186 行目は setTimeout のあとに 2 つの中身がそろったことだけを見ます。1777 行目は 2 節の 132 行目の文言です。

手元の結果は[第 4 回](04-upg-injection-cd.md)と同じ実行（`//packages/upgrade/src/common/test:test` が 38 passed、`//packages/upgrade/static/test:test` が 614 passed・12 skipped、Chromium と Firefox）です。作業木（../angular-fix から 8576f161ae4 で作り、終わってから消した）で 388 行目を `applicationProviders: []` にしても、`//packages/upgrade/static/test:test_chromium` は 614 passed・0 failed のままでした。downgrade\_module\_spec.ts の it の多くは自分の起動の関数に `applicationProviders: [provideZoneChangeDetection()]` を書き、NgModule のクラスを渡す 130 行目の it は中身の文字だけを見るので、388 行目の zone を確かめる it がありません。

直すとしたら、起動のきっかけは downgrade\_module.ts の 418 行目の factory、名前と数は 379〜381 行目と 440〜449 行目、検査は util.ts の `validateInjectionKey`、同期の進み方は promise\_util.ts です。388 行目を固めるなら、downgrade\_module\_spec.ts の 130 行目の it に「コンポーネントの中で `NgZone.isInAngularZone()` が true」を足す形になります（記録ではクラスを渡すと true、起動の関数だと `NoopNgZone` で false）。

## 聞かれそうな質問

**Q. downgradeModule の Angular は、いつ起動しますか？**

downgrade したコンポーネントが初めて link されたときです。link が `'$$angularLazyModuleRef' + 名前` を `$injector.get` し、その factory（418 行目）が 423 行目で起動の関数を呼びます。AngularJS の factory は 1 回しか呼ばれないので、2 回目からは同じ `result` が返ります。

**Q. downgradeInjectable のサービスだけを先に使うとどうなりますか？**

408〜416 行目の factory が「Trying to get the Angular injector before bootstrapping the corresponding Angular module.」を投げます。サービスの側から起動することはありません（記録の 2 段目）。

**Q. downgradeModule を 2 つ使うと、名前を書かなければいけないのはなぜですか？**

名前の付かない `'$$angularInjector'` と `'$$angularLazyModuleRef'`（407・417 行目）は、2 つのモジュールが同じ名前で登録し、後に読まれた方が勝つからです。util.ts の 132 行目が、数が 2 以上で名前の無い呼び出しを断ります。

**Q. なぜ SyncPromise という自前のクラスがあるのですか？**

注入器がもうそろっているときに、downgrade したコンポーネントを AngularJS のコンパイルと同じターンで作るためです。本物の Promise の `then` は必ず後で呼ぶので（DEMO 2）、`$compile` の直後に DOM を見るコードやテストで中身が空になります（c1ae6124c83、#30330）。

**Q. downgradeModule のアプリで、Angular の変化を AngularJS に知らせるには？**

自動では知らせません（6 節の表）。利用者が `$rootScope.$apply` か `$digest` を呼びます。逆向き（AngularJS → Angular）は、downgrade したコンポーネントの input の `$watch` と `ngZone.run` で包んだ callback が受け持ちます（第 2 回）。

**Q. 起動の関数を渡すと何が違いますか？**

396〜398 行目でそのまま使うので、zone の provider が足されません。v22 の `bootstrapModule` の既定は zoneless なので、関数の中で `applicationProviders: [provideZoneChangeDetection()]` を書かなければ `NoopNgZone` で動きます（記録の「起動の関数を渡す」）。

## 読み終えて

- downgradeModule は `$$UpgradeModule.lazyN` という名前の AngularJS のモジュールを作り、Angular の起動を 418 行目の factory に閉じ込める
- 「最初の 1 回だけ起動」は AngularJS の factory のキャッシュ、「2 つ目からは同期で作る」は `SyncPromise`（c1ae6124c83）
- 2 つ以上なら名前を渡す。名前の付かないキーは後勝ちで、util.ts の 132 行目が断る
- zone の provider は NgModule のクラスと factory のときだけ（388・394 行目、2a7a5de53fd）。そこを固める spec は無い
- UpgradeModule と違い、AngularJS は NgZone の外で起動し、Angular の変化で `$digest` は自動で回らない

---

← 前: [注入器と変更検知：downgradeInjectable・$digest の橋・zone と zoneless](04-upg-injection-cd.md)  
次: [spec と issue を読む：upgrade を固めているテスト](06-upg-tests-issues.md) →
