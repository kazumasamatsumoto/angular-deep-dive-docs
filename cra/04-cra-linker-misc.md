[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 4 回 / 全 10 回

# QueryList・DestroyRef・ComponentRef・Compiler の説明文

> linker/query\_list.ts・destroy\_ref.ts・component\_factory.ts・compiler.ts・ng\_module\_factory\_loader.ts ほかの未読の行：QueryList の changes と dirty、DestroyRef.onDestroy の戻り値、v22 で公開 API から外れた ComponentFactory が説明に残る ComponentRef と、非推奨の Compiler・getModuleFactory が今どう動くか。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-linker-misc)

---

この章で分かること：`QueryList`・`DestroyRef`・`ComponentRef`・`Compiler`・`getNgModuleById` の説明文が約束していることと、それが本物でそのとおりに動くか。非推奨の `Compiler` と `getModuleFactory` が今どう動くか。結果として、`QueryList` の「変えられないリスト」と `changes` の型、例の strict での誤り、`Compiler` の「NgModule ごとの Compiler」と `getModuleId`、`ComponentRef` の説明に残る `ComponentFactory`（v22 で公開 API から外れた）が、実物と合いませんでした。platform の注入器の `DestroyRef` が呼ばれないこと（開いている issue #67095）と、NgModule の id が重なったときの例外の文が同じモジュールを 2 回書くことも確かめました。

読む対象は `packages/core/src/linker/` の `query_list.ts`・`destroy_ref.ts`・`component_factory.ts`・`compiler.ts`・`ng_module_factory_loader.ts`・`ng_module_registration.ts` の説明文と、まだ読んでいない行です（../angular、8576f161ae4）。`QueryList` にクエリの結果が入る流れは[LQuery と結果の集め方の章](../qry/04-qry-lquery-results.md)、`DestroyRef` の実装と注入器の破棄は[DestroyRef と破棄の章](../di/14-di-destroy.md)、`createComponent` の 2 つの入口は[2 つの入口の章](../dyn/01-dyn-entry-points.md)、`Compiler.compileModuleSync` と遅延の NgModule は[createNgModule と loadChildren の章](../ngmodule/15-ngmodule-lazy-module.md)、NgModule の id の登録は[NgModule の AOT の出力の章](../ngmodule/03-ngmodule-aot-output.md)にあるので、ここでは繰り返さずに行だけ指します。

1. [1. ApplicationRef](01-cra-app-ref.md)
2. [2. platform と bootstrap](02-cra-platform.md)
3. [3. ViewContainerRef](03-cra-view-container.md)
4. **4. QueryList・DestroyRef**（この章）
5. [5. input・model・output](05-cra-signal-io.md)
6. [6. signal のクエリ](06-cra-signal-queries.md)
7. [7. NgZone・ErrorHandler](07-cra-zone-errors.md)
8. [8. DebugElement](08-cra-debug.md)
9. [9. サニタイズ](09-cra-sanitize.md)
10. [10. spec と issue](10-cra-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `QueryList` は `@ViewChildren`・`@ContentChildren` の結果の入れ物で、`DestroyRef` は「壊れるときに呼ぶ関数」を登録する口です。どちらも、signal の `viewChildren()`（[第 6 回](06-cra-signal-queries.md)）や `takeUntilDestroyed` の下で今も使われています。

## 1. QueryList の説明文：「変えられないリスト」と例

📄 `angular/packages/core/src/linker/query_list.ts` L20–45 （▶ の行: 21–22, 24, 27–29, 31–32, 36, 38）

````ts
20 │ /**
21 ▶  * An unmodifiable list of items that Angular keeps up to date when the state
22 ▶  * of the application changes.
23 │  *
24 ▶  * The type of object that {@link ViewChildren}, {@link ContentChildren}, and {@link QueryList}
25 │  * provide.
26 │  *
27 ▶  * Implements an iterable interface, therefore it can be used in both ES6
28 ▶  * javascript `for (var i of items)` loops as well as in Angular templates with
29 ▶  * `@for(i of myList; track $index)`.
30 │  *
31 ▶  * Changes can be observed by subscribing to the `changes` `Observable`.
32 ▶  * *
33 │  * @usageNotes
34 │  * ### Example
35 │  * ```ts
36 ▶  * @Component({...})
37 │  * class Container {
38 ▶  *   @ViewChildren(Item) items:QueryList<Item>;
39 │  * }
40 │  * ```
41 │  *
42 │  * @publicApi
43 │  *
44 │  * @see [Using QueryList](guide/components/queries#using-querylist)
45 │  */
````

21 行目は「変えられないリスト」と書きます。中の配列を直接書き換える道は無く、131〜132 行目の `toArray` も写しを返すので、写しに `push` しても `length` は 3 のままでした（DEMO の 1 つ目の表）。ただし `reset`・`notifyOnChanges`・`setDirty`・`destroy` は公開のメソッドで、誰でも中身を入れ替えられます。`setDirty` と `destroy` の説明は `/** internal */`（L175・L181）で、`@internal` でないので API から隠れず、公開 API の一覧（goldens/public-api/core/index.api.md の `QueryList`）に載っています。`dirty`・`first`・`last`・`length` は一覧で「(undocumented)」です。

32 行目の `* *` は余分な `*` が 1 つ残った行です。36〜39 行目の例を strict の tsc にかけると（`{...}` を `template: ''` にし、`Item` を足しただけ）、「TS2564: Property 'items' has no initializer and is not definitely assigned in the constructor.」でした。`items!: QueryList<Item>` と書けば通ります。27〜29 行目の `for...of` と `@for` は、`Symbol.iterator`（L189）で動きました。

📄 `angular/packages/core/src/linker/query_list.ts` L70–102 （▶ の行: 72, 74–75, 82–83, 92–93）

```ts
 70 │ 
 71 │   /**
 72 ▶    * Returns the QueryList entry at `index`.
 73 │    */
 74 ▶   get(index: number): T | undefined {
 75 ▶     return this._results[index];
 76 │   }
 77 │ 
 78 │   /**
 79 │    * See
 80 │    * [Array.map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
 81 │    */
 82 ▶   map<U>(fn: (item: T, index: number, array: T[]) => U): U[] {
 83 ▶     return this._results.map(fn);
 84 │   }
 85 │ 
 86 │   /**
 87 │    * See
 88 │    * [Array.filter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter)
 89 │    */
 90 │   filter<S extends T>(predicate: (value: T, index: number, array: readonly T[]) => value is S): S[];
 91 │   filter(predicate: (value: T, index: number, array: readonly T[]) => unknown): T[];
 92 ▶   filter(fn: (item: T, index: number, array: T[]) => boolean): T[] {
 93 ▶     return this._results.filter(fn);
 94 │   }
 95 │ 
 96 │   /**
 97 │    * See
 98 │    * [Array.find](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find)
 99 │    */
100 │   find(fn: (item: T, index: number, array: T[]) => boolean): T | undefined {
101 │     return this._results.find(fn);
102 │   }
```

📄 `angular/packages/core/src/linker/query_list.ts` L103–138 （▶ の行: 129, 131–132, 135–136）

```ts
103 │ 
104 │   /**
105 │    * See
106 │    * [Array.reduce](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce)
107 │    */
108 │   reduce<U>(fn: (prevValue: U, curValue: T, curIndex: number, array: T[]) => U, init: U): U {
109 │     return this._results.reduce(fn, init);
110 │   }
111 │ 
112 │   /**
113 │    * See
114 │    * [Array.forEach](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach)
115 │    */
116 │   forEach(fn: (item: T, index: number, array: T[]) => void): void {
117 │     this._results.forEach(fn);
118 │   }
119 │ 
120 │   /**
121 │    * See
122 │    * [Array.some](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/some)
123 │    */
124 │   some(fn: (value: T, index: number, array: T[]) => boolean): boolean {
125 │     return this._results.some(fn);
126 │   }
127 │ 
128 │   /**
129 ▶    * Returns a copy of the internal results list as an Array.
130 │    */
131 ▶   toArray(): T[] {
132 ▶     return this._results.slice();
133 │   }
134 │ 
135 ▶   toString(): string {
136 ▶     return this._results.toString();
137 │   }
138 │ 
```

72〜75 行目の `get` は、範囲の外では `undefined` でした（型も `T | undefined`）。ほかの関数は中の配列の同じ名前の関数を呼ぶだけです。

`changes` は説明文（L163）が「`changes` の EventEmitter に流す」と書きますが、L60〜61 のとおり中身は rxjs の `Subject` で、`EventEmitter` ではありません（`EventEmitter` の `async` などは使えない）。`new QueryList()` の既定（`emitDistinctChangesOnly = false`、L69）は、中身が同じでも `notifyOnChanges` のたびに流れ、`new QueryList(true)` は本当に変わったときだけ流れました（`[1, 2]`）。`@ViewChildren` の既定は `true` です（metadata/di.ts L84）。

本物の `@ViewChildren` で数えると、既定の方と `{emitDistinctChangesOnly: false}` の方が違ったのは 1 回だけでした。`@for` に当たらない要素（`-c` の `<b>`）を足したときで、クエリは数え直され（ビューが増えたので）、結果は同じなので、既定の方は流さず、`false` の方は流しました。同じ配列を入れ直したり、変えずに描き直したりしたときは、クエリが数え直されないので、どちらも流しません。

## 2. DestroyRef

📄 `angular/packages/core/src/linker/destroy_ref.ts` L16–25 （▶ の行: 17–20）

```ts
16 │ /**
17 ▶  * `DestroyRef` lets you set callbacks to run for any cleanup or destruction behavior.
18 ▶  * The scope of this destruction depends on where `DestroyRef` is injected. If `DestroyRef`
19 ▶  * is injected in a component or directive, the callbacks run when that component or
20 ▶  * directive is destroyed. Otherwise the callbacks run when a corresponding injector is destroyed.
21 │  *
22 │  * @see [Lifecycle DestroyRef](guide/components/lifecycle#destroyref)
23 │  *
24 │  * @publicApi
25 │  */
```

📄 `angular/packages/core/src/linker/destroy_ref.ts` L32–60 （▶ の行: 33–34, 39, 42, 45, 51, 54, 59）

````ts
32 │   /**
33 ▶    * Registers a destroy callback in a given lifecycle scope.  Returns a cleanup function that can
34 ▶    * be invoked to unregister the callback.
35 │    *
36 │    * @usageNotes
37 │    * ### Example
38 │    * ```ts
39 ▶    * const destroyRef = inject(DestroyRef);
40 │    *
41 │    * // register a destroy callback
42 ▶    * const unregisterFn = destroyRef.onDestroy(() => doSomethingOnDestroy());
43 │    *
44 │    * // stop the destroy callback from executing if needed
45 ▶    * unregisterFn();
46 │    * ```
47 │    *
48 │    * @see [Lifecycle DestroyRef](guide/components/lifecycle#destroyref)
49 │    *
50 │    */
51 ▶   abstract onDestroy(callback: () => void): () => void;
52 │ 
53 │   /**
54 ▶    * Indicates whether the instance has already been destroyed.
55 │    *
56 │    * @see [Detecting instance destruction](guide/components/lifecycle#detecting-instance-destruction)
57 │    *
58 │    */
59 ▶   abstract get destroyed(): boolean;
60 │ 
````

18〜20 行目「コンポーネントで取ればそれが壊れるとき、それ以外は対応する注入器が壊れるとき」と、33〜34 行目「戻り値は登録を外す関数」は、どちらも DEMO の 2 つ目の表のとおりでした。`createEnvironmentInjector` で作った注入器から取った `DestroyRef` は注入器そのもので（`__NG_ENV_ID__`、L71）、`destroy()` で残した方だけが呼ばれました。中身は[DestroyRef と破棄の章](../di/14-di-destroy.md)です。同じ関数を 2 回入れて 1 回目の戻り値を呼ぶと、外れるのは 1 つだけで、もう 1 つは呼ばれました（外すのは配列の `indexOf` の最初の 1 つ、render3/util/view\_utils.ts L301〜307）。39〜45 行目の例は strict の tsc に通りました（フィールドの初期化子の中に置いた）。

説明文に無いことが 2 つあります。壊れたあとで `onDestroy` を呼ぶと、コンポーネントの `DestroyRef` は NG0911「View has already been destroyed.」（view\_utils.ts L286〜291）、環境の注入器の `DestroyRef` は NG0205「Injector has already been destroyed.」でした（本番はどちらも番号だけ）。54 行目の `destroyed` を先に見れば避けられます。

もう 1 つは platform の注入器です。`platformBrowser().injector.get(DestroyRef)` に入れた関数は、`PlatformRef.destroy()` で呼ばれず、`destroyed` も `false` のままでした（下の Node の記録）。`PlatformRef.destroy`（platform\_ref.ts L123〜140）は自分の `_destroyListeners` と `PLATFORM_DESTROY_LISTENERS` を呼びますが、platform の注入器の `destroy()` を呼ばないからです。これは開いている issue #67095（`DestroyRef` from platform injector is not destroyed when `PlatformRef.destroy()` is called）と同じ形で、22.2.6 でもそのままでした。20 行目の「対応する注入器が壊れるとき」は正しく、platform の注入器はそもそも壊されません。

| 記録の組 | platform.onDestroy と DestroyRef.onDestroy に入れて platform.destroy() |
| --- | --- |
| 開発モード | `呼ばれた ["PlatformRef.onDestroy"]``platform.destroyed=true``DestroyRef.destroyed=false` |
| 本番 | `呼ばれた ["PlatformRef.onDestroy"]``platform.destroyed=true``DestroyRef.destroyed=false` |

## 3. ComponentRef：説明に残る ComponentFactory

📄 `angular/packages/core/src/linker/component_factory.ts` L35–60 （▶ の行: 37, 39, 42, 44, 47, 52–53, 58）

```ts
35 │ 
36 │   /**
37 ▶    * The host or anchor element for this component instance.
38 │    */
39 ▶   abstract get location(): ElementRef;
40 │ 
41 │   /**
42 ▶    * The dependency injector for this component instance.
43 │    */
44 ▶   abstract get injector(): Injector;
45 │ 
46 │   /**
47 ▶    * This component instance.
48 │    */
49 │   abstract get instance(): C;
50 │ 
51 │   /**
52 ▶    * The host view defined by the template
53 ▶    * for this component instance.
54 │    */
55 │   abstract get hostView(): ViewRef;
56 │ 
57 │   /**
58 ▶    * The change detector for this component instance.
59 │    */
60 │   abstract get changeDetectorRef(): ChangeDetectorRef;
```

📄 `angular/packages/core/src/linker/component_factory.ts` L61–79 （▶ の行: 63, 65, 68, 72–76, 78）

```ts
61 │ 
62 │   /**
63 ▶    * The type of this component (as created by a `ComponentFactory` class).
64 │    */
65 ▶   abstract get componentType(): Type<any>;
66 │ 
67 │   /**
68 ▶    * Destroys the component instance and all of the data structures associated with it.
69 │    */
70 │   abstract destroy(): void;
71 │ 
72 ▶   /**
73 ▶    * A lifecycle hook that provides additional developer-defined cleanup
74 ▶    * functionality for the component.
75 ▶    * @param callback A handler function that cleans up developer-defined data
76 ▶    * associated with this component. Called when the `destroy()` method is invoked.
77 │    */
78 ▶   abstract onDestroy(callback: Function): void;
79 │ }
```

`setInput` の説明（L27〜29、[2 つの入口の章](../dyn/01-dyn-entry-points.md)の引用）の「OnPush でも検査の印を付け、`ngOnChanges` も走る」は、DEMO の 3 つ目の表のとおりでした。`setInput` の直後は描き直されず、`detectChanges` で `'x'` になり、`ngOnChanges` が 1 回呼ばれました。input でない名前を渡すと、開発モードは例外ではなく console.error「NG0303: Can't set value of the 'nope' input on the 'CraLmCmp' component. ...」を書き、本番は何もしませんでした。37 行目の `location` は渡した host の要素、65 行目の `componentType` はそのクラスでした。78 行目の `onDestroy` は戻り値が `void` で、`DestroyRef.onDestroy`（登録を外す関数を返す）と違います。

L17 の「`ComponentFactory` が作ったコンポーネント」と 63 行目の「`ComponentFactory` のクラスが作った型」は、v22.0.0 で `ComponentFactory` と `ComponentFactoryResolver` が公開 API から外れた（b1f5181ffd8、2026-04-06、`refactor(core): remove ComponentFactoryResolver & ComponentFactory from the api surface`）あとも残っています。今 `ComponentRef` を作るのは `createComponent` 関数と `ViewContainerRef.createComponent` で、どちらも内側の `ComponentFactory`（render3/component\_ref.ts L222、公開されていない）を使います。新しい本家でも 2 か所とも同じです。

## 4. Compiler と getNgModuleById

📄 `angular/packages/core/src/linker/compiler.ts` L18–31 （▶ の行: 19–21, 23–25, 29–30）

```ts
18 │ /**
19 ▶  * Low-level service for running the angular compiler during runtime
20 ▶  * to create {@link AbstractComponentFactory}s, which
21 ▶  * can later be used to create and render a Component instance.
22 │  *
23 ▶  * Each `@NgModule` provides an own `Compiler` to its injector,
24 ▶  * that will use the directives/pipes of the ng module for compilation
25 ▶  * of components.
26 │  *
27 │  * @publicApi
28 │  *
29 ▶  * @deprecated
30 ▶  * Ivy JIT mode doesn't require accessing this symbol.
31 │  */
```

📄 `angular/packages/core/src/linker/compiler.ts` L48–65 （▶ の行: 50, 52, 55, 57, 60, 62–63）

```ts
48 │ 
49 │   /**
50 ▶    * Clears all caches.
51 │    */
52 ▶   clearCache(): void {}
53 │ 
54 │   /**
55 ▶    * Clears the cache for the given component/ngModule.
56 │    */
57 ▶   clearCacheFor(type: Type<any>) {}
58 │ 
59 │   /**
60 ▶    * Returns the id for a given NgModule, if one is defined and known to the compiler.
61 │    */
62 ▶   getModuleId(moduleType: Type<any>): string | undefined {
63 ▶     return undefined;
64 │   }
65 │ }
```

`Compiler` は 29〜30 行目のとおり deprecated で、「Ivy の JIT では要らない」と書きます。説明文と合わないところが 3 つありました。20 行目の `{@link AbstractComponentFactory}` は、もう無い名前への link で、API のページでは行き先の無い link になります。新しい本家では 95e8dec4e22（2026-09-23、`docs(core): fix three JSDoc rendering bugs on the API pages`）で `NgModuleFactory` に直りました。23〜25 行目「各 `@NgModule` が自分の `Compiler` を注入器に置く」は、`createNgModule(M, env).injector.get(Compiler)` と `env.get(Compiler)` が同じオブジェクトでした（DEMO の 4 つ目の表）。`Compiler` は `@Service()`（L32、root に 1 つ）で、NgModule は何も置きません。60 行目「NgModule に id が定義されていて、知っていれば返す」の `getModuleId` は、63 行目のとおり常に `undefined` で、`id: 'cra-lm-module'` の NgModule でも `undefined` でした。

`compileModuleSync` の「NgModule とそのコンポーネントをすべてコンパイルする」（L35〜36）は、実際は `new NgModuleFactory(moduleType)` を返すだけで（L39、[遅延モジュールの章](../ngmodule/15-ngmodule-lazy-module.md)）、返った factory で `create` できました。50〜57 行目の 2 つの `clearCache` は何もしません。

📄 `angular/packages/core/src/linker/compiler.ts` L66–97 （▶ の行: 72–75, 79, 83, 92–93, 95–96）

```ts
66 │ 
67 │ /**
68 │  * Options for creating a compiler.
69 │  *
70 │  * @publicApi
71 │  */
72 ▶ export type CompilerOptions = {
73 ▶   defaultEncapsulation?: ViewEncapsulation;
74 ▶   providers?: StaticProvider[];
75 ▶   preserveWhitespaces?: boolean;
76 │ };
77 │ 
78 │ /**
79 ▶  * Token to provide CompilerOptions in the platform injector.
80 │  *
81 │  * @publicApi
82 │  */
83 ▶ export const COMPILER_OPTIONS = new InjectionToken<CompilerOptions[]>(
84 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'compilerOptions' : '',
85 │ );
86 │ 
87 │ /**
88 │  * A factory for creating a Compiler
89 │  *
90 │  * @publicApi
91 │  *
92 ▶  * @deprecated
93 ▶  * Ivy JIT mode doesn't require accessing this symbol.
94 │  */
95 ▶ export abstract class CompilerFactory {
96 ▶   abstract createCompiler(options?: CompilerOptions[]): Compiler;
97 │ }
```

72〜76 行目の `CompilerOptions` と 83 行目の `COMPILER_OPTIONS` は、JIT の `bootstrapModule` が読みます（[第 2 回](02-cra-platform.md)の 7 節）。95〜97 行目の `CompilerFactory` は抽象クラスだけで、core には実装がありません。

📄 `angular/packages/core/src/linker/ng_module_factory_loader.ts` L16–46 （▶ の行: 17–19, 21, 23, 30–32, 35, 37, 41, 44）

```ts
16 │ /**
17 ▶  * Returns the NgModuleFactory with the given id (specified using [@NgModule.id
18 ▶  * field](api/core/NgModule#id)), if it exists and has been loaded. Factories for NgModules that do
19 ▶  * not specify an `id` cannot be retrieved. Throws if an NgModule cannot be found.
20 │  * @publicApi
21 ▶  * @deprecated Use `getNgModuleById` instead.
22 │  */
23 ▶ export function getModuleFactory(id: string): NgModuleFactory<any> {
24 │   const type = getRegisteredNgModuleType(id);
25 │   if (!type) throw noModuleError(id);
26 │   return new R3NgModuleFactory(type);
27 │ }
28 │ 
29 │ /**
30 ▶  * Returns the NgModule class with the given id (specified using [@NgModule.id
31 ▶  * field](api/core/NgModule#id)), if it exists and has been loaded. Classes for NgModules that do
32 ▶  * not specify an `id` cannot be retrieved. Throws if an NgModule cannot be found.
33 │  * @publicApi
34 │  */
35 ▶ export function getNgModuleById<T>(id: string): Type<T> {
36 │   const type = getRegisteredNgModuleType(id);
37 ▶   if (!type) throw noModuleError(id);
38 │   return type;
39 │ }
40 │ 
41 ▶ function noModuleError(id: string): Error {
42 │   return new RuntimeError(
43 │     RuntimeErrorCode.NG_MODULE_ID_NOT_FOUND,
44 ▶     ngDevMode && `No module with ID ${id} loaded`,
45 │   );
46 │ }
```

`getNgModuleById('cra-lm-module')` は、`@NgModule({id: 'cra-lm-module'})` のクラスを返しました（DEMO の 4 つ目の表、Node の JIT の記録。JIT では `@NgModule` を付けたときに登録され、AOT では id を持つ NgModule の出力に登録の呼び出し `ɵɵregisterNgModuleType` が付く。[AOT の出力の章](../ngmodule/03-ngmodule-aot-output.md)）。21 行目の deprecated の `getModuleFactory` も `NgModuleFactory` を返しました。無い id は 44 行目の NG0920「No module with ID nothing loaded」です。

📄 `angular/packages/core/src/linker/ng_module_registration.ts` L14–32 （▶ の行: 17, 24, 26–29, 31–32）

```ts
14 │ /**
15 │  * Map of module-id to the corresponding NgModule.
16 │  */
17 ▶ const modules = new Map<string, NgModuleType>();
18 │ 
19 │ /**
20 │  * Whether to check for duplicate NgModule registrations.
21 │  *
22 │  * This can be disabled for testing.
23 │  */
24 ▶ let checkForDuplicateNgModules = true;
25 │ 
26 ▶ function assertSameOrNotExisting(id: string, type: Type<any> | null, incoming: Type<any>): void {
27 ▶   if (type && type !== incoming && checkForDuplicateNgModules) {
28 ▶     throw new RuntimeError(
29 ▶       RuntimeErrorCode.DUPLICATE_NG_MODULE_ID,
30 │       ngDevMode &&
31 ▶         `Duplicate module registered for ${id} - ${stringify(type)} vs ${stringify(type.name)}`,
32 ▶     );
```

📄 `angular/packages/core/src/linker/ng_module_registration.ts` L51–70 （▶ の行: 52–53, 56–57, 67–68）

```ts
51 │ 
52 ▶ export function clearModulesForTest(): void {
53 ▶   modules.clear();
54 │ }
55 │ 
56 ▶ export function getRegisteredNgModuleType(id: string): NgModuleType | undefined {
57 ▶   return modules.get(id);
58 │ }
59 │ 
60 │ /**
61 │  * Control whether the NgModule registration system enforces that each NgModule type registered has
62 │  * a unique id.
63 │  *
64 │  * This is useful for testing as the NgModule registry cannot be properly reset between tests with
65 │  * Angular's current API.
66 │  */
67 ▶ export function setAllowDuplicateNgModuleIdsForTest(allowDuplicates: boolean): void {
68 ▶   checkForDuplicateNgModules = !allowDuplicates;
69 │ }
70 │ 
```

同じ id の NgModule が 2 つ登録されると 27〜32 行目の NG0921 ですが、32 行目の文は `${stringify(type)} vs ${stringify(type.name)}` で、どちらも先に登録された方（`type`）です。Node の記録で `FirstModule` のあとに同じ id の `SecondModule` を登録すると、文は「Duplicate module registered for cra-lm-dup - FirstModule vs FirstModule」で、後から来た方の名前が出ません。27 行目の引数 `incoming` を使うつもりの行です。e94975d109a（2018-12-11）からこの文で、新しい本家でも同じです。spec（linker/ng\_module\_integration\_spec.ts L321）は `/Duplicate module registered/` しか見ていません。67〜69 行目の `setAllowDuplicateNgModuleIdsForTest` は TestBed が使います（testing/src/test\_bed.ts L528・L542）。

| 記録の組 | 同じ id の NgModule を 2 つ |
| --- | --- |
| 開発モード | `FirstModule を登録した``例外 NG0921: Duplicate module registered for cra-lm-dup - FirstModule vs FirstModule` |
| 本番 | `FirstModule を登録した``例外 NG0921` |

> **🧪 DEMO — QueryList・DestroyRef・ComponentRef・Compiler を本物で試す**
>
> 押すと、このページ（本番ビルド）で本物の `@angular/core`（22.2.6）を呼び、結果を「このページ」の列に書きます。コンポーネントは文書に付けない要素の上に `createComponent` で作り、ApplicationRef には付けず、表を作り終えたら destroy します。作った環境の注入器とモジュールも destroy します。  
>  「開発モード」の列は、同じ関数（cra-linker-misc.demo-lm.ts）を Node（domino の上の JIT）で動かした記録です。上の 2 つの小さな表（platform の `DestroyRef` と、重なった id）は platform を壊すか例外を投げるので、記録だけです（cra-linker-misc.demo-pd.ts）。4 つ目の表（cra-linker-misc.demo-cp.ts）も記録の再生です。`Compiler`・`getNgModuleById`・id を持つ NgModule をこのページで使うと、本番ビルドの最初に読む JS（Initial total）が 0.43 kB 増えたためです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cra-linker-misc)

## ここまでの呼び出し（壊れたコンポーネントの DestroyRef に onDestroy）

- 👤 `inject(DestroyRef)`（コンポーネントの constructor）
  - `DestroyRef.__NG_ELEMENT_ID__ → new NodeInjectorDestroyRef(getLView())` — destroy\_ref.ts L65、L95〜97
- 👤 `ref.destroy()`
  - `destroyLView → ON_DESTROY_HOOKS を順に呼ぶ` — [ビューの破棄の章](../ivy/17-ivy-destroy.md)
- 👤 `destroyRef.onDestroy(f)`
  - `NodeInjectorDestroyRef.onDestroy → storeLViewOnDestroy(lView, f)` — destroy\_ref.ts L87〜92
    - `isDestroyed(lView) → throw NG0911` — render3/util/view\_utils.ts L286〜291

## テストと直し方

| ファイル（packages/core/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `linker/query_list_spec.ts` | `QueryList`（13）› `dirty and reset`（25）› `should initially be dirty and empty`（26）、`should support toArray`（112）、`should support first and last`（125）、`should fire callbacks on change`（162） | 1 節 |
| `acceptance/destroy_ref_spec.ts` | `DestroyRef`（22）› `for environnement injector`（23）› `should throw when trying to register destroy callback on destroyed injector`（69）、`should removal single destroy callback if many identical ones are registered`（232）、`should throw when trying to register destroy callback on destroyed LView`（264） | 2 節。platform の注入器の it は無い |
| `linker/ng_module_integration_spec.ts` | `should throw when registering a duplicate module`（310） | 4 節。文は `/Duplicate module registered/` だけを見る |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=QueryList"
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（結果は表の下）
```

結果は手元の bazel で、`//packages/core/test:test`（4 つの shard）の `QueryList` で 21、`//packages/core/test/acceptance:acceptance`（shard は 1 つ）の `DestroyRef` で 12、`emitDistinctChangesOnly` で 0（名前に入った it は無い）、どれも 0 failures でした。

直すとしたら、ng\_module\_registration.ts の 32 行目を `${stringify(type)} vs ${stringify(incoming)}` にし、spec は ng\_module\_integration\_spec.ts の 310 行目の it で文の全体（`SomeModule vs SomeOtherModule`）を待ちます。説明文は、query\_list.ts の 21 行目に「Angular が入れ替える」を足して `setDirty`・`destroy` の `/** internal */` を `/** @internal */` に（公開 API から外すのは API の変更）、L163 の EventEmitter を Observable に、36〜39 行目の例に `!` を足します。compiler.ts の 23〜25 行目と 60 行目、component\_factory.ts の 17 行目と 63 行目は今の実装に合わせて書き直します。platform の `DestroyRef` は issue #67095 のとおり `PlatformRef.destroy`（platform\_ref.ts L123〜140）で platform の注入器を壊すかどうかの話になります。

## 聞かれそうな質問

**Q. `@ViewChildren` の `changes` は、描き直すたびに流れますか？**

流れません。クエリが数え直されたときだけで、既定（`emitDistinctChangesOnly: true`）では結果が変わったときだけです。当たらない要素だけが増えたときは、`false` にした方だけが流しました。

**Q. `QueryList.changes` は `EventEmitter` ですか？**

いいえ、rxjs の `Subject` です（L60〜61）。説明文（L163）が EventEmitter と書いているだけです。

**Q. 壊れたあとで `destroyRef.onDestroy` を呼ぶとどうなりますか？**

コンポーネントのものは NG0911、環境の注入器のものは NG0205 の例外です。`destroyRef.destroyed`（54 行目）を先に見ます。

**Q. platform の注入器から取った `DestroyRef` は使えますか？**

登録はできますが、`PlatformRef.destroy()` では呼ばれません（issue #67095）。platform の後片付けは `PlatformRef.onDestroy` に入れます。

**Q. `Compiler.getModuleId` で NgModule の id を取れますか？**

取れません。63 行目のとおり常に `undefined` です。id からクラスを引くのは `getNgModuleById` です。

## 読み終えて

- `QueryList` は「変えられない」と書かれるが、`reset` などは公開で、`setDirty`・`destroy` は `@internal` の付け忘れで API に載る。`changes` は `Subject`。
- `emitDistinctChangesOnly` の差が出るのは、クエリが数え直されて結果が同じときだけ。
- `DestroyRef.onDestroy` の戻り値で外せる。壊れたあとは NG0911／NG0205。platform の注入器の `DestroyRef` は呼ばれない（#67095）。
- `Compiler` は root に 1 つで、`getModuleId` は常に `undefined`。`ComponentRef` の説明には外れた `ComponentFactory` が残る。
- 重なった NgModule の id の例外の文は、先に登録された方を 2 回書く。

---

← 前: [ViewContainerRef・TemplateRef・ViewRef・ElementRef の説明文](03-cra-view-container.md)  
次: [input()・model()・output() の説明文](05-cra-signal-io.md) →
