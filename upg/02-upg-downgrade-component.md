[目次](../README.md) › [@angular/upgrade の内側：AngularJS と 1 つのページを分け合う](README.md) › 第 2 回 / 全 6 回

# downgradeComponent：AngularJS のディレクティブの中に Angular のコンポーネントを作る

> downgradeComponent が返す terminal なディレクティブの定義、link が親の注入器を探して ParentInjectorPromise を置く順、DowngradeComponentAdapter がコンポーネントを作り、属性を $observe / $watch でつなぎ、ngOnChanges と detectChanges を自分の watcher で呼び、output を購読する順、signal の input（5f56a658375）と model()（8d31b82116c）を applyValueToInputSignal で書く行と transform を通らないこと、output emitter（cd7c170763b）と #48032 の今、投影の照合と番号の並べ替え、中身をもう一度コンパイルしていた問題の修正（angular-main の b2d3ba9f5f0、22.2.4 などへ backport）。

angular/angular · 読了 約 15 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/upg-downgrade-component)

---

`downgradeComponent({ component })` は、Angular のコンポーネントを AngularJS のテンプレートの中で使えるようにする関数です。この章では、それが返す **AngularJS のディレクティブの定義**と、その `link` の中で `DowngradeComponentAdapter` が**コンポーネントを作り、属性を `$observe` / `$watch` でつなぎ、output を購読し、`ngOnChanges` を呼ぶ順**を 1 行ずつ読みます。signal の input（5f56a658375）・`model()`（8d31b82116c）・output emitter（cd7c170763b）の行と、中身をもう一度コンパイルしていた問題の修正（angular-main の b2d3ba9f5f0）も、前と後を並べて確かめます。

読む対象は `packages/upgrade/src/common/src/downgrade_component.ts`・`downgrade_component_adapter.ts`・`component_info.ts`・`util.ts`（`hookupNgModel`）、spec は `static/test/integration/downgrade_component_spec.ts`・`content_projection_spec.ts` と `src/common/test/downgrade_component_adapter_spec.ts` です。Angular の注入器が DOM に置かれるところは[第 1 回](01-upg-bootstrap.md)、`createComponent` の中は [dyn-factory-create](../dyn/02-dyn-factory-create.md)、`downgradeModule` のときの遅延の箱と `SyncPromise` は[第 5 回](05-upg-downgrade-module.md)で読みます。

1. [1. 全体と起動](01-upg-bootstrap.md)
2. **2. downgradeComponent**（この章）
3. [3. UpgradeComponent](03-upg-upgrade-component.md)
4. [4. 注入器と変更検知](04-upg-injection-cd.md)
5. [5. downgradeModule](05-upg-downgrade-module.md)
6. [6. spec と issue](06-upg-tests-issues.md)

## 1. 返すのはディレクティブの factory

利用者は `angular.module('app').directive('ng2Greet', downgradeComponent({ component: Greet }))` と書きます。`downgradeComponent` が返すのは、AngularJS が 1 回だけ呼んでディレクティブの定義を受け取る factory 関数です。

📄 `angular/packages/upgrade/src/common/src/downgrade_component.ts` L102–134 （▶ の行: 102–105, 107–108, 117–120, 124, 127–129, 134）

```ts
102 ▶   const directiveFactory: IAnnotatedFunction = function (
103 ▶     $compile: ICompileService,
104 ▶     $injector: IInjectorService,
105 ▶     $parse: IParseService,
106 │   ): IDirective {
107 ▶     const unsafelyOverwriteSignalInputs =
108 ▶       (info as {unsafelyOverwriteSignalInputs?: boolean}).unsafelyOverwriteSignalInputs ?? false;
109 │     // When using `downgradeModule()`, we need to handle certain things specially. For example:
110 │     // - We always need to attach the component view to the `ApplicationRef` for it to be
111 │     //   dirty-checked.
112 │     // - We need to ensure callbacks to Angular APIs (e.g. change detection) are run inside the
113 │     //   Angular zone.
114 │     //   NOTE: This is not needed, when using `UpgradeModule`, because `$digest()` will be run
115 │     //         inside the Angular zone (except if explicitly escaped, in which case we shouldn't
116 │     //         force it back in).
117 ▶     const isNgUpgradeLite = getUpgradeAppType($injector) === UpgradeAppType.Lite;
118 ▶     const wrapCallback: <T>(cb: () => T) => typeof cb = !isNgUpgradeLite
119 ▶       ? (cb) => cb
120 ▶       : (cb) => () => (NgZone.isInAngularZone() ? cb() : ngZone.run(cb));
121 │     let ngZone: NgZone;
122 │ 
123 │     // When downgrading multiple modules, special handling is needed wrt injectors.
124 ▶     const hasMultipleDowngradedModules = isNgUpgradeLite && getDowngradedModuleCount($injector) > 1;
125 │ 
126 │     return {
127 ▶       restrict: 'E',
128 ▶       terminal: true,
129 ▶       require: [REQUIRE_INJECTOR, REQUIRE_NG_MODEL],
130 │       // Controller needs to be set so that `angular-component-router.js` (from beta Angular 2)
131 │       // configuration properties can be made available. See:
132 │       // See G3: javascript/angular2/angular1_router_lib.js
133 │       // https://github.com/angular/angular.js/blob/47bf11ee94664367a26ed8c91b9b586d3dd420f5/src/ng/compile.js#L1670-L1691.
134 ▶       controller: function () {},
```

1. **AngularJS から 3 つのサービスを受け取る**

   102〜105 行目の `$compile`・`$injector`・`$parse` です。どれを渡すかは、4 節の 253 行目の `$inject` で AngularJS に伝えます。
2. **型に無い option を読む**

   107〜108 行目の `unsafelyOverwriteSignalInputs` は、`downgradeComponent` の引数の型には書かれていない隠れた option で、5f56a658375 が足しました（6 節）。108 行目で型を広げて読んでいます。
3. **方式で callback の包み方を変える**

   117 行目で `$injector` から方式（[第 1 回](01-upg-bootstrap.md)の `UpgradeAppType`）を読みます。`UpgradeModule` なら `Static` なので、118〜119 行目の `wrapCallback` は何もしない包みです。`downgradeModule`（`Lite`）のときだけ、120 行目で「Angular のゾーンの外なら `ngZone.run` で入る」包みになります。124 行目の「複数の downgrade したモジュール」も `Lite` の話です（[第 5 回](05-upg-downgrade-module.md)）。
4. **定義を返す**

   127 行目 `restrict: 'E'`（要素の名前でだけ当たる）、128 行目 `terminal: true`、129 行目 `require` の 2 つです。`terminal: true` は「この要素より低い優先度のディレクティブと、**子のノードを、AngularJS はコンパイルしない**」という印です。子は `DowngradeComponentAdapter` が自分で `$compile` し、Angular の `ng-content` に配ります（8 節）。`require` の 1 つ目は `'?^^$$angularInjector'`（親の要素から Angular の注入器を探す。`?` は無くてもよい）、2 つ目は `'?ngModel'` です。134 行目の空の `controller` は、古い component router のために置いているだけです（130〜133 行目のコメント）。9 節の修正で、ここに中身が入ります。

## 2. link：親の注入器を探す

📄 `angular/packages/upgrade/src/common/src/downgrade_component.ts` L135–154 （▶ の行: 140–141, 145, 147, 150, 152–153）

```ts
135 │       link: (scope: IScope, element: IAugmentedJQuery, attrs: IAttributes, required: any[]) => {
136 │         // We might have to compile the contents asynchronously, because this might have been
137 │         // triggered by `UpgradeNg1ComponentAdapterBuilder`, before the Angular templates have
138 │         // been compiled.
139 │ 
140 ▶         const ngModel: INgModelController = required[1];
141 ▶         const parentInjector: Injector | Thenable<Injector> | undefined = required[0];
142 │         let moduleInjector: Injector | Thenable<Injector> | undefined = undefined;
143 │         let ranAsync = false;
144 │ 
145 ▶         if (!parentInjector || hasMultipleDowngradedModules) {
146 │           const downgradedModule = info.downgradedModule || '';
147 ▶           const lazyModuleRefKey = `${LAZY_MODULE_REF}${downgradedModule}`;
148 │           const attemptedAction = `instantiating component '${getTypeName(info.component)}'`;
149 │ 
150 ▶           validateInjectionKey($injector, downgradedModule, lazyModuleRefKey, attemptedAction);
151 │ 
152 ▶           const lazyModuleRef = $injector.get(lazyModuleRefKey) as LazyModuleRef;
153 ▶           moduleInjector = lazyModuleRef.injector ?? lazyModuleRef.promise;
154 │         }
```

141 行目の `required[0]` は、`require` の 1 つ目で見つかったものです。`UpgradeModule` のアプリでは、2 つのどちらかが見つかります。

- 先祖に別の downgrade したコンポーネントがあれば、その要素に置かれた `ParentInjectorPromise` か、解決した後の注入器（3 節）。
- 無ければ、AngularJS のルートの要素に置かれた `NgAdapterInjector`（[第 1 回](01-upg-bootstrap.md)の 5.2 節）。

145 行目の枝に入るのは、どちらも見つからないとき（DOM の外で `$compile` したときなど）か、`Lite` で複数のモジュールがあるときです。147 行目で `'$$angularLazyModuleRef'` の名前を作り、150 行目で方式と名前を検査し、152〜153 行目で箱から `injector`（無ければ `promise`）を取ります。`UpgradeModule` の箱は[第 1 回](01-upg-bootstrap.md)の 5.1 節で置いた `{ injector }` なので、いつも `injector` が入っています。140 行目の `required[1]` は 7 節の `ng-model` で使います。

## 3. doDowngrade：作る前に印を置き、作った後に本物を置く

📄 `angular/packages/upgrade/src/common/src/downgrade_component.ts` L190–227 （▶ の行: 190, 195, 198–199, 204–205, 213–214, 220, 222, 225）

```ts
190 ▶         const finalParentInjector = parentInjector || moduleInjector!;
191 │ 
192 │         // If this is a "top-level" Angular component or the parent component may belong to a
193 │         // different `NgModule`, use the module injector for module-specific dependencies.
194 │         // If there is a parent component that belongs to the same `NgModule`, use its injector.
195 ▶         const finalModuleInjector = moduleInjector || parentInjector!;
196 │ 
197 │         const doDowngrade = (injector: Injector, moduleInjector: Injector) => {
198 ▶           const injectorPromise = new ParentInjectorPromise(element);
199 ▶           const facade = new DowngradeComponentAdapter(
200 │             element,
201 │             attrs,
202 │             scope,
203 │             ngModel,
204 ▶             moduleInjector.get(EnvironmentInjector),
205 ▶             injector,
206 │             $compile,
207 │             $parse,
208 │             info.component,
209 │             wrapCallback,
210 │             unsafelyOverwriteSignalInputs,
211 │           );
212 │ 
213 ▶           const projectableNodes = facade.compileContents();
214 ▶           const componentRef = facade.createComponentAndSetup(
215 │             projectableNodes,
216 │             isNgUpgradeLite,
217 │             info.propagateDigest,
218 │           );
219 │ 
220 ▶           injectorPromise.resolve(componentRef.injector);
221 │ 
222 ▶           if (ranAsync) {
223 │             // If this is run async, it is possible that it is not run inside a
224 │             // digest and initial input values will not be detected.
225 ▶             scope.$evalAsync(() => {});
226 │           }
227 │         };
```

1. **2 つの注入器を決める**

   190 行目の `finalParentInjector` は「親」（親のコンポーネントがあればその注入器）、195 行目の `finalModuleInjector` は「このコンポーネントを宣言したモジュール」の注入器です。`UpgradeModule` では 145 行目の枝に入らないので、2 つは同じものです。
2. **要素に「約束」を置く**

   198 行目の `new ParentInjectorPromise(element)` は、作った瞬間に自分を要素の `data` に置きます（4 節の 268 行目）。213 行目で子をコンパイルしている間に子の downgrade したコンポーネントが親を探すと、まだ注入器ではなくこの約束が見つかります。
3. **adapter を作る**

   199〜211 行目。204 行目で、モジュールの注入器から `EnvironmentInjector` を引いて渡します。205 行目の `injector` は「親」です。
4. **子をコンパイルし、コンポーネントを作る**

   213 行目の `compileContents`（8 節）で投影するノードを作り、214 行目の `createComponentAndSetup`（5 節）に渡します。
5. **約束を本物の注入器で解決する**

   220 行目。`componentRef.injector`（コンポーネントの `NodeInjector`）を要素に置き直し、待っていた子へ渡します。だから downgrade したコンポーネントの子は、親の Angular のコンポーネントの `providers` を inject できます（spec の `'should respect hierarchical dependency injection for ng2'`、1008 行目）。
6. **遅れて走ったなら $evalAsync**

   222〜225 行目。4 節の 247 行目より後に走った（非同期になった）ときだけ、`$digest` を 1 回予約して最初の値を拾わせます。

## 4. 同期で走るか、待つか

📄 `angular/packages/upgrade/src/common/src/downgrade_component.ts` L229–255 （▶ の行: 229–231, 233, 236, 243–244, 247, 253）

```ts
229 ▶         const downgradeFn = !isNgUpgradeLite
230 ▶           ? doDowngrade
231 ▶           : (pInjector: Injector, mInjector: Injector) => {
232 │               if (!ngZone) {
233 ▶                 ngZone = pInjector.get(NgZone);
234 │               }
235 │ 
236 ▶               wrapCallback(() => doDowngrade(pInjector, mInjector))();
237 │             };
238 │ 
239 │         // NOTE:
240 │         // Not using `ParentInjectorPromise.all()` (which is inherited from `SyncPromise`), because
241 │         // Closure Compiler (or some related tool) complains:
242 │         // `TypeError: ...$src$downgrade_component_ParentInjectorPromise.all is not a function`
243 ▶         SyncPromise.all([finalParentInjector, finalModuleInjector]).then(([pInjector, mInjector]) =>
244 ▶           downgradeFn(pInjector, mInjector),
245 │         );
246 │ 
247 ▶         ranAsync = true;
248 │       },
249 │     };
250 │   };
251 │ 
252 │   // bracket-notation because of closure - see #14441
253 ▶   directiveFactory['$inject'] = [$COMPILE, $INJECTOR, $PARSE];
254 │   return directiveFactory;
255 │ }
```

243 行目の `SyncPromise.all` は、渡したものが全部ふつうの値なら `then` の callback を**その場で**呼び、約束が混ざっていればそれが解決するのを待ちます（中身は[第 5 回](05-upg-downgrade-module.md)）。`UpgradeModule` の最上位のコンポーネントでは 2 つとも `NgAdapterInjector` なので、`link` の中で同期にコンポーネントまで作られます。そのあと 247 行目で `ranAsync` が `true` になるので、3 節の 222 行目は通りません。親が同じ `$compile` の途中（3 節の 213 行目）にいる子は、親の約束が 220 行目で解決したときに続きが走ります。それでも `SyncPromise` なので、親の `link` の中で同期に終わります（spec の `'should be compiled synchronously, if possible'`、1046 行目）。229〜237 行目の `downgradeFn` は `Lite` のときだけ、最初に `NgZone` を引いて `wrapCallback` で包みます。

📄 `angular/packages/upgrade/src/common/src/downgrade_component.ts` L257–281 （▶ の行: 262, 268, 273, 276, 279）

```ts
257 │ /**
258 │  * Synchronous promise-like object to wrap parent injectors,
259 │  * to preserve the synchronous nature of AngularJS's `$compile`.
260 │  */
261 │ class ParentInjectorPromise extends SyncPromise<Injector> {
262 ▶   private injectorKey: string = controllerKey(INJECTOR_KEY);
263 │ 
264 │   constructor(private element: IAugmentedJQuery) {
265 │     super();
266 │ 
267 │     // Store the promise on the element.
268 ▶     element.data!(this.injectorKey, this);
269 │   }
270 │ 
271 │   override resolve(injector: Injector): void {
272 │     // Store the real injector on the element.
273 ▶     this.element.data!(this.injectorKey, injector);
274 │ 
275 │     // Release the element to prevent memory leaks.
276 ▶     this.element = null!;
277 │ 
278 │     // Resolve the promise.
279 ▶     super.resolve(injector);
280 │   }
281 │ }
```

262 行目の鍵は `controllerKey(INJECTOR_KEY)`、つまり `'$$$angularInjectorController'` で、[第 1 回](01-upg-bootstrap.md)でルートの要素に注入器を置いたのと同じ鍵です。268 行目で約束を置き、解決のときに 273 行目で本物に置き換え、276 行目で要素への参照を切ってから 279 行目で待っている callback を呼びます。

## 5. DowngradeComponentAdapter：作る・つなぐ・片付けるの順

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L42–66 （▶ の行: 42–43, 47–49, 65）

```ts
42 ▶ const INITIAL_VALUE = {
43 ▶   __UNINITIALIZED__: true,
44 │ };
45 │ 
46 │ export class DowngradeComponentAdapter {
47 ▶   private implementsOnChanges = false;
48 ▶   private inputChangeCount: number = 0;
49 ▶   private inputChanges: SimpleChanges = {};
50 │   private componentScope: IScope;
51 │ 
52 │   constructor(
53 │     private element: IAugmentedJQuery,
54 │     private attrs: IAttributes,
55 │     private scope: IScope,
56 │     private ngModel: INgModelController,
57 │     private environmentInjector: EnvironmentInjector,
58 │     private parentInjector: Injector,
59 │     private $compile: ICompileService,
60 │     private $parse: IParseService,
61 │     private component: Type<any>,
62 │     private wrapCallback: <T>(cb: () => T) => () => T,
63 │     private readonly unsafelyOverwriteSignalInputs: boolean,
64 │   ) {
65 ▶     this.componentScope = scope.$new();
66 │   }
```

65 行目で、要素の scope から子の scope（`componentScope`）を作ります。input の `$watch` は全部この子の scope に付くので、10 節で要素が消えて scope が壊れると一緒に外れます。42〜44 行目の `INITIAL_VALUE` は「まだ 1 度も値を受けていない」印、47〜49 行目は `ngOnChanges` に渡す変化を溜める入れ物です（6 節）。

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L68–96 （▶ の行: 70–71, 73, 76–78, 82, 90–93）

```ts
68 │   compileContents(): Node[][] {
69 │     const compiledProjectableNodes: Node[][] = [];
70 ▶     const projectableNodes: Node[][] = this.groupProjectableNodes();
71 ▶     const linkFns = projectableNodes.map((nodes) => this.$compile(nodes));
72 │ 
73 ▶     this.element.empty!();
74 │ 
75 │     linkFns.forEach((linkFn) => {
76 ▶       linkFn(this.scope, (clone: Node[]) => {
77 ▶         compiledProjectableNodes.push(clone);
78 ▶         this.element.append!(clone);
79 │       });
80 │     });
81 │ 
82 ▶     return compiledProjectableNodes;
83 │   }
84 │ 
85 │   createComponentAndSetup(
86 │     projectableNodes: Node[][],
87 │     manuallyAttachView = false,
88 │     propagateDigest = true,
89 │   ): ComponentRef<any> {
90 ▶     const component = this.createComponent(projectableNodes);
91 ▶     this.setupInputs(manuallyAttachView, propagateDigest, component);
92 ▶     this.setupOutputs(component.componentRef);
93 ▶     this.registerCleanup(component.componentRef);
94 │ 
95 │     return component.componentRef;
96 │   }
```

90〜93 行目が、`link` の 214 行目から呼ばれる 4 つの順です。**作る（90）→ input をつなぐ（91）→ output をつなぐ（92）→ 片付けを登録する（93）**。その前に 3 節の 213 行目が `compileContents`（68〜83 行目、8 節）を呼んで、投影するノードを作っています。

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L98–129 （▶ の行: 99–100, 102, 106–110, 112–113, 119, 126）

```ts
 98 │   private createComponent(projectableNodes: Node[][]): ComponentInfo {
 99 ▶     const providers: StaticProvider[] = [{provide: $SCOPE, useValue: this.componentScope}];
100 ▶     const childInjector = Injector.create({
101 │       providers: providers,
102 ▶       parent: this.parentInjector,
103 │       name: 'DowngradeComponentAdapter',
104 │     });
105 │ 
106 ▶     const componentRef = createComponent(this.component, {
107 ▶       elementInjector: childInjector,
108 ▶       environmentInjector: this.environmentInjector,
109 ▶       projectableNodes,
110 ▶       hostElement: this.element[0] as Element,
111 │     });
112 ▶     const viewChangeDetector = componentRef.injector.get(ChangeDetectorRef);
113 ▶     const changeDetector = componentRef.changeDetectorRef;
114 │ 
115 │     // testability hook is commonly added during component bootstrap in
116 │     // packages/core/src/application_ref.bootstrap()
117 │     // in downgraded application, component creation will take place here as well as adding the
118 │     // testability hook.
119 ▶     const testability = componentRef.injector.get(Testability, null);
120 │     if (testability) {
121 │       componentRef.injector
122 │         .get(TestabilityRegistry)
123 │         .registerApplication(componentRef.location.nativeElement, testability);
124 │     }
125 │ 
126 ▶     hookupNgModel(this.ngModel, componentRef.instance);
127 │ 
128 │     return {viewChangeDetector, componentRef, changeDetector};
129 │   }
```

1. **$scope を持つ子の注入器を作る**

   99〜104 行目。`'$scope'` を 65 行目の `componentScope` にした `Injector.create` で、親は 3 節の「親」です。[第 3 回](03-upg-upgrade-component.md)の `UpgradeComponent` は、この `'$scope'` を引いて AngularJS の scope を作ります。
2. **既にある要素の上にコンポーネントを作る**

   106〜111 行目の `createComponent` に、`elementInjector`（子の注入器）・`environmentInjector`（204 行目の値）・`projectableNodes`（8 節）・`hostElement`（AngularJS が作った要素そのもの）を渡します。`hostElement` を渡すと、Angular は要素を新しく作らずにその要素をホストにします（[dyn-factory-create](../dyn/02-dyn-factory-create.md) の 3 節）。この形は df9eed4ff1d（v22.0.0）で `ComponentFactoryResolver` から書き換わったものです。
3. **2 つの ChangeDetectorRef を取る**

   112 行目はコンポーネントのビューの、113 行目はホストのビューの `ChangeDetectorRef` です。6 節で、前者は `markForCheck`、後者は `detectChanges` に使います。
4. **Testability と ng-model**

   119〜124 行目は Testability の登録（[第 4 回](04-upg-injection-cd.md)）。126 行目の `hookupNgModel` は、コンポーネントが `writeValue` と `registerOnChange` を持っていれば AngularJS の `ngModel` とつなぎます（7 節）。

## 6. input：$observe と $watch、ngOnChanges、signal

📄 `angular/packages/upgrade/src/common/src/component_info.ts` L15–35 （▶ の行: 27–29, 31–33）

```ts
15 │ export class PropertyBinding {
16 │   bracketAttr: string;
17 │   bracketParenAttr: string;
18 │   parenAttr: string;
19 │   onAttr: string;
20 │   bindAttr: string;
21 │   bindonAttr: string;
22 │ 
23 │   constructor(
24 │     public prop: string,
25 │     public attr: string,
26 │   ) {
27 ▶     this.bracketAttr = `[${this.attr}]`;
28 ▶     this.parenAttr = `(${this.attr})`;
29 ▶     this.bracketParenAttr = `[(${this.attr})]`;
30 │     const capitalAttr = this.attr.charAt(0).toUpperCase() + this.attr.slice(1);
31 ▶     this.onAttr = `on${capitalAttr}`;
32 ▶     this.bindAttr = `bind${capitalAttr}`;
33 ▶     this.bindonAttr = `bindon${capitalAttr}`;
34 │   }
35 │ }
```

`PropertyBinding` は、1 つの input（や output）の名前から、AngularJS のテンプレートに書ける 6 つの属性の名前を作ります。`title` なら `[title]`（27 行目）・`(title)`（28 行目）・`[(title)]`（29 行目）・`onTitle`（31 行目）・`bindTitle`（32 行目）・`bindonTitle`（33 行目）です。後ろの 3 つは、AngularJS が `on-title`・`bind-title`・`bindon-title` の属性名を正規化した形です。

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L131–166 （▶ の行: 137, 139, 142, 144, 147–149, 152, 157, 162–163, 165）

```ts
131 │   private setupInputs(
132 │     manuallyAttachView: boolean,
133 │     propagateDigest = true,
134 │     {componentRef, changeDetector, viewChangeDetector}: ComponentInfo,
135 │   ): void {
136 │     const attrs = this.attrs;
137 ▶     const inputs = reflectComponentType(this.component)?.inputs ?? [];
138 │     for (const input of inputs) {
139 ▶       const inputBinding = new PropertyBinding(input.propName, input.templateName);
140 │       let expr: string | null = null;
141 │ 
142 ▶       if (Object.hasOwn(attrs, inputBinding.attr)) {
143 │         const observeFn = ((prop, isSignal) => {
144 ▶           let prevValue = INITIAL_VALUE;
145 │           return (currValue: any) => {
146 │             // Initially, both `$observe()` and `$watch()` will call this function.
147 ▶             if (!strictEquals(prevValue, currValue)) {
148 ▶               if (prevValue === INITIAL_VALUE) {
149 ▶                 prevValue = currValue;
150 │               }
151 │ 
152 ▶               this.updateInput(componentRef, prop, prevValue, currValue, isSignal);
153 │               prevValue = currValue;
154 │             }
155 │           };
156 │         })(inputBinding.prop, input.isSignal);
157 ▶         attrs.$observe(inputBinding.attr, observeFn);
158 │ 
159 │         // Use `$watch()` (in addition to `$observe()`) in order to initialize the input in time
160 │         // for `ngOnChanges()`. This is necessary if we are already in a `$digest`, which means that
161 │         // `ngOnChanges()` (which is called by a watcher) will run before the `$observe()` callback.
162 ▶         let unwatch: Function | null = this.componentScope.$watch(() => {
163 ▶           unwatch!();
164 │           unwatch = null;
165 ▶           observeFn(attrs[inputBinding.attr]);
166 │         });
```

1. **input の一覧を取る**

   137 行目の `reflectComponentType(...).inputs` で、`propName`（クラスのフィールド名）・`templateName`（テンプレートでの名前）・`isSignal` を受け取ります。
2. **ただの属性（name="Hi {{who}}"）なら $observe**

   142 行目。属性がそのままの名前で書かれていたら、157 行目の `attrs.$observe` で補間の結果を受けます。159〜161 行目のコメントのとおり、すでに `$digest` の途中だと、`ngOnChanges` を呼ぶ watcher（下の 190 行目）が `$observe` の最初の callback より先に走ります。そこで 162〜166 行目で「1 回だけの `$watch`」も付け、最初の値をその watcher より先に入れます。同じ値が 2 回来ても、147 行目の `strictEquals` で 2 回目は捨てます。
3. **最初の previousValue は undefined ではない**

   148〜149 行目、1 回目は `prevValue` を今の値にしてから 152 行目の `updateInput` を呼びます。だから最初の `SimpleChange` は `previousValue` と `currentValue` が同じです（DEMO の 1 段目の `'Hi Alice'→'Hi Alice'（first）`）。Angular のテンプレートから渡したときの最初の `previousValue` は `undefined` なので、ここは振る舞いが違います。

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L167–183 （▶ の行: 167, 169, 171, 173, 176, 181）

```ts
167 ▶       } else if (Object.hasOwn(attrs, inputBinding.bindAttr)) {
168 │         expr = attrs[inputBinding.bindAttr];
169 ▶       } else if (Object.hasOwn(attrs, inputBinding.bracketAttr)) {
170 │         expr = attrs[inputBinding.bracketAttr];
171 ▶       } else if (Object.hasOwn(attrs, inputBinding.bindonAttr)) {
172 │         expr = attrs[inputBinding.bindonAttr];
173 ▶       } else if (Object.hasOwn(attrs, inputBinding.bracketParenAttr)) {
174 │         expr = attrs[inputBinding.bracketParenAttr];
175 │       }
176 ▶       if (expr != null) {
177 │         const watchFn = (
178 │           (prop, isSignal) => (currValue: unknown, prevValue: unknown) =>
179 │             this.updateInput(componentRef, prop, prevValue, currValue, isSignal)
180 │         )(inputBinding.prop, input.isSignal);
181 ▶         this.componentScope.$watch(expr, watchFn);
182 │       }
183 │     }
```

167〜175 行目、`bind-x`・`[x]`・`bindon-x`・`[(x)]` のどれかなら、その値を AngularJS の**式**として扱い、181 行目で `componentScope.$watch(expr, …)` します。式は 65 行目の子の scope で評価されるので、要素の scope の変数がそのまま読めます。

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L185–224 （▶ の行: 186, 188, 190–191, 194, 197, 200, 203–204, 210–211, 216, 221–222）

```ts
185 │     // Invoke `ngOnChanges()` and Change Detection (when necessary)
186 ▶     const detectChanges = () => changeDetector.detectChanges();
187 │     const prototype = this.component.prototype;
188 ▶     this.implementsOnChanges = !!(prototype && (<OnChanges>prototype).ngOnChanges);
189 │ 
190 ▶     this.componentScope.$watch(
191 ▶       () => this.inputChangeCount,
192 │       this.wrapCallback(() => {
193 │         // Invoke `ngOnChanges()`
194 ▶         if (this.implementsOnChanges) {
195 │           const inputChanges = this.inputChanges;
196 │           this.inputChanges = {};
197 ▶           (<OnChanges>componentRef.instance).ngOnChanges(inputChanges);
198 │         }
199 │ 
200 ▶         viewChangeDetector.markForCheck();
201 │ 
202 │         // If opted out of propagating digests, invoke change detection when inputs change.
203 ▶         if (!propagateDigest) {
204 ▶           detectChanges();
205 │         }
206 │       }),
207 │     );
208 │ 
209 │     // If not opted out of propagating digests, invoke change detection on every digest
210 ▶     if (propagateDigest) {
211 ▶       this.componentScope.$watch(this.wrapCallback(detectChanges));
212 │     }
213 │ 
214 │     // If necessary, attach the view so that it will be dirty-checked.
215 │     // (Allow time for the initial input values to be set and `ngOnChanges()` to be called.)
216 ▶     if (manuallyAttachView || !propagateDigest) {
217 │       let unwatch: Function | null = this.componentScope.$watch(() => {
218 │         unwatch!();
219 │         unwatch = null;
220 │ 
221 ▶         const appRef = this.parentInjector.get<ApplicationRef>(ApplicationRef);
222 ▶         appRef.attachView(componentRef.hostView);
223 │       });
224 │     }
```

1. **変わった数を $watch する**

   190〜191 行目。`updateInput` が数える `inputChangeCount` を見る watcher で、input がいくつ変わっても 1 回の `$digest` で 1 回だけ下の処理をします。
2. **ngOnChanges を自分で呼ぶ**

   194〜197 行目。188 行目で調べた「プロトタイプに `ngOnChanges` があるか」が真なら、溜めた変化を渡して呼びます。Angular の `ngOnChanges` の仕組み（`NgOnChangesFeature`）は通りません。
3. **markForCheck、必要なら detectChanges**

   200 行目でコンポーネントのビューに印を付けます（OnPush でも更新されるように）。203〜205 行目、`propagateDigest: false` のときだけここで `detectChanges` します。
4. **既定では $digest のたびに detectChanges**

   210〜211 行目。`propagateDigest` が既定の `true` なら、引数 1 つの `$watch`（毎回呼ばれる watcher）で 186 行目の `detectChanges` を呼びます。AngularJS の `$digest` が、このコンポーネントの変更検知の引き金です（[第 4 回](04-upg-injection-cd.md)）。
5. **ApplicationRef につなぐのは Lite か opt-out のときだけ**

   216〜223 行目。`UpgradeModule` で既定のままなら、このビューは `ApplicationRef` に入りません。

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L319–348 （▶ の行: 326–327, 330–332, 339–344, 346）

```ts
319 │   private updateInput(
320 │     componentRef: ComponentRef<any>,
321 │     prop: string,
322 │     prevValue: any,
323 │     currValue: any,
324 │     isSignal: boolean,
325 │   ) {
326 ▶     if (this.implementsOnChanges) {
327 ▶       this.inputChanges[prop] = new SimpleChange(prevValue, currValue, prevValue === currValue);
328 │     }
329 │ 
330 ▶     this.inputChangeCount++;
331 ▶     const instanceProp = componentRef.instance[prop];
332 ▶     const node = instanceProp?.[SIGNAL] as InputSignalNode<unknown, unknown> | undefined;
333 │     // Model signals are writable signal inputs (they expose `.set()` and `applyValueToInputSignal`).
334 │     // Overwriting them would destroy the internal OutputEmitterRef that setupOutputs() already
335 │     // subscribed to, severing the Angular→AngularJS two-way binding. Always use
336 │     // applyValueToInputSignal for model signals regardless of the unsafelyOverwriteSignalInputs
337 │     // flag. Check applyValueToInputSignal (not just .set) to distinguish model() from a plain
338 │     // WritableSignal used with @Input(), which also has .set() but does not support this method.
339 ▶     const isModelSignal =
340 ▶       node != null &&
341 ▶       typeof instanceProp.set === 'function' &&
342 ▶       typeof node.applyValueToInputSignal === 'function';
343 ▶     if (isModelSignal || (isSignal && !this.unsafelyOverwriteSignalInputs)) {
344 ▶       node!.applyValueToInputSignal(node!, currValue);
345 │     } else {
346 ▶       componentRef.instance[prop] = currValue;
347 │     }
348 │   }
```

326〜327 行目で変化を溜め、330 行目で数を進めます。値の書き方は 3 通りです。

| input の種類 | 通る行 | 入れたコミット |
| --- | --- | --- |
| `@Input()` のふつうのフィールド | 346 行目 `instance[prop] = currValue` | 最初から |
| `input()`（`isSignal` が true） | 343〜344 行目 `applyValueToInputSignal` | 5f56a658375（#56860） |
| `model()` | 339〜342 行目で見分け、343〜344 行目 | 8d31b82116c（#60599） |
| `input()` で `unsafelyOverwriteSignalInputs: true` | 346 行目（signal を値で上書き） | 5f56a658375 |

5f56a658375 のコミットメッセージは、「正しいのは `ComponentRef.setInput` に書き換えることだが、それは操作のタイミングを変えて壊れる可能性があるので、今は `InputSignalNode` に直接書く」と書いています。8d31b82116c は、`model()` を 346 行目で上書きすると 7 節で購読した `OutputEmitterRef` ごと消えて双方向の束縛が切れる、という問題の修正です（333〜338 行目のコメント）。`model()` は `.set` と `applyValueToInputSignal` の両方を持つことで、`@Input()` に置いたただの `WritableSignal` と見分けます（339〜342 行目）。

> [!WARNING]
> **ハマりどころ**
>
> 344 行目と 346 行目は、Angular がテンプレートの input に書くときの `writeToDirectiveInput`（[signals-input-compile](../signals/12-signals-input-compile.md)）を通りません。`writeToDirectiveInput` は書く前に input の `transform` を呼びますが、ここには `transform` を呼ぶ行がありません。DEMO の比較の「transform を持つ input」では、`@Input({transform: booleanAttribute})` と `input(false, {transform: booleanAttribute})` の両方に AngularJS の属性から空の文字列を渡すと、どちらも `''`（文字列）のままでした。同じコンポーネントに `ComponentRef.setInput` で同じ値を書くと、どちらも `true` です。gh の検索では、この違いを扱った issue は見つかりませんでした（2026-11-16）。

`isSignal` は 137 行目の `reflectComponentType` が `ɵcmp.inputs` の `InputFlags.SignalBased` から作ります。AOT ならコンパイラが付けますが、変換を通らない JIT では付かず、346 行目で signal が文字列に上書きされます（DEMO の比較の 1 つ目、`ctx.title is not a function`）。本家の spec が `ɵcmp.inputs` を手で書き換えているのはこのためです（テストの節の 202 行目）。

## 7. output：名前の組み立てと購読

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L227–254 （▶ の行: 229, 231–234, 236–238, 241–242, 244, 247, 250）

```ts
227 │   private setupOutputs(componentRef: ComponentRef<any>) {
228 │     const attrs = this.attrs;
229 ▶     const outputs = reflectComponentType(this.component)?.outputs ?? [];
230 │     for (const output of outputs) {
231 ▶       const outputBindings = new PropertyBinding(output.propName, output.templateName);
232 ▶       const bindonAttr = outputBindings.bindonAttr.substring(
233 ▶         0,
234 ▶         outputBindings.bindonAttr.length - 6,
235 │       );
236 ▶       const bracketParenAttr = `[(${outputBindings.bracketParenAttr.substring(
237 ▶         2,
238 ▶         outputBindings.bracketParenAttr.length - 8,
239 │       )})]`;
240 │       // order below is important - first update bindings then evaluate expressions
241 ▶       if (Object.hasOwn(attrs, bindonAttr)) {
242 ▶         this.subscribeToOutput(componentRef, outputBindings, attrs[bindonAttr], true);
243 │       }
244 ▶       if (Object.hasOwn(attrs, bracketParenAttr)) {
245 │         this.subscribeToOutput(componentRef, outputBindings, attrs[bracketParenAttr], true);
246 │       }
247 ▶       if (Object.hasOwn(attrs, outputBindings.onAttr)) {
248 │         this.subscribeToOutput(componentRef, outputBindings, attrs[outputBindings.onAttr]);
249 │       }
250 ▶       if (Object.hasOwn(attrs, outputBindings.parenAttr)) {
251 │         this.subscribeToOutput(componentRef, outputBindings, attrs[outputBindings.parenAttr]);
252 │       }
253 │     }
254 │   }
```

output にも `PropertyBinding` を作り（231 行目）、4 つの書き方を順に見ます。232〜235 行目は、`bindonValueChange` から最後の 6 文字（`Change`）を落として `bindonValue` を作ります。236〜239 行目も同じで、`[(valueChange)]` から `[(value)]` を作ります。つまり **名前が `…Change` で終わる output だけが、`bindon-value` と `[(value)]` の双方向の束縛の「戻り道」になります**。`model('value')` の output は `valueChange` なのでちょうど当たります。241〜246 行目の 2 つは代入（`true`）、247〜252 行目の `on-x` と `(x)` は式の評価です。240 行目のコメントのとおり、代入が先です。

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L256–280 （▶ の行: 262–264, 267, 269–272, 274, 276）

```ts
256 │   private subscribeToOutput(
257 │     componentRef: ComponentRef<any>,
258 │     output: PropertyBinding,
259 │     expr: string,
260 │     isAssignment: boolean = false,
261 │   ) {
262 ▶     const getter = this.$parse(expr);
263 ▶     const setter = getter.assign;
264 ▶     if (isAssignment && !setter) {
265 │       throw new Error(`Expression '${expr}' is not assignable!`);
266 │     }
267 ▶     const emitter = componentRef.instance[output.prop] as EventEmitter<any> | OutputEmitterRef<any>;
268 │     if (emitter) {
269 ▶       const subscription = emitter.subscribe(
270 ▶         isAssignment
271 ▶           ? (v: any) => setter!(this.scope, v)
272 ▶           : (v: any) => getter(this.scope, {'$event': v}),
273 │       );
274 ▶       componentRef.onDestroy(() => subscription.unsubscribe());
275 │     } else {
276 ▶       throw new Error(
277 │         `Missing emitter '${output.prop}' on component '${getTypeName(this.component)}'!`,
278 │       );
279 │     }
280 │   }
```

1. **式を $parse する**

   262 行目。代入なら 263 行目の `assign` が要り、無ければ 264〜265 行目で投げます（`a + b` のような式に双方向で書いたとき）。
2. **インスタンスのフィールドを取る**

   267 行目。`EventEmitter` でも `output()` の `OutputEmitterRef` でもよく、無ければ 276 行目で投げます。
3. **関数を 1 つ渡して subscribe**

   269〜273 行目。代入なら `setter(this.scope, v)`、式なら `getter(this.scope, {'$event': v})` を呼ぶ関数です。`this.scope` は要素の scope（65 行目の子ではない方）です。cd7c170763b（#60366、v20.0.0）より前は `subscribe({next: …})` と observer のオブジェクトを渡していて、関数しか受けない `OutputEmitterRef.subscribe` で `listenerFn is not a function` になっていました。
4. **コンポーネントが壊れたら購読を外す**

   274 行目。#48032（購読の漏れ）を直した 253d7564647（v16.2.0）の行です。DEMO の「ng-if で消す」で、`EventEmitter` の observers は 1 → 0 になりました。`OutputEmitterRef` の方は壊れるときに自分で listener の配列を捨てる（1 → `null`）ので、274 行目と二重に外れます。記録の 22.1.6 では漏れは残っていません。

📄 `angular/packages/upgrade/src/common/src/util.ts` L190–222 （▶ の行: 196–197, 205, 207–208, 210, 212, 220–221）

```ts
190 │ /**
191 │  * @return Whether the passed-in component implements the subset of the
192 │  *     `ControlValueAccessor` interface needed for AngularJS `ng-model`
193 │  *     compatibility.
194 │  */
195 │ function supportsNgModel(component: any) {
196 ▶   return (
197 ▶     typeof component.writeValue === 'function' && typeof component.registerOnChange === 'function'
198 │   );
199 │ }
200 │ 
201 │ /**
202 │  * Glue the AngularJS `NgModelController` (if it exists) to the component
203 │  * (if it implements the needed subset of the `ControlValueAccessor` interface).
204 │  */
205 ▶ export function hookupNgModel(ngModel: INgModelController, component: any) {
206 │   if (ngModel && supportsNgModel(component)) {
207 ▶     ngModel.$render = () => {
208 ▶       component.writeValue(ngModel.$viewValue);
209 │     };
210 ▶     component.registerOnChange(ngModel.$setViewValue.bind(ngModel));
211 │     if (typeof component.registerOnTouched === 'function') {
212 ▶       component.registerOnTouched(ngModel.$setTouched.bind(ngModel));
213 │     }
214 │   }
215 │ }
216 │ 
217 │ /**
218 │  * Test two values for strict equality, accounting for the fact that `NaN !== NaN`.
219 │  */
220 ▶ export function strictEquals(val1: any, val2: any): boolean {
221 ▶   return val1 === val2 || (val1 !== val1 && val2 !== val2);
222 │ }
```

5 節の 126 行目の `hookupNgModel` です。196〜197 行目で `writeValue` と `registerOnChange` を持つかを見て、207〜208 行目で AngularJS の `$render` を `writeValue` に、210 行目で Angular の変化を `$setViewValue` につなぎます。`ControlValueAccessor` の一部だけを使う形で、`NG_VALUE_ACCESSOR` の provider は見ません。220〜221 行目の `strictEquals` は 6 節の 147 行目が使う `NaN` を等しいとみなす比較です。

## 8. 投影：AngularJS の子をどの ng-content へ

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L350–378 （▶ の行: 351–352, 365–366, 369, 371–373）

```ts
350 │   private groupProjectableNodes() {
351 ▶     let ngContentSelectors = reflectComponentType(this.component)?.ngContentSelectors ?? [];
352 ▶     return groupNodesBySelector(ngContentSelectors, this.element.contents!());
353 │   }
354 │ }
355 │ 
356 │ /**
357 │  * Group a set of DOM nodes into `ngContent` groups, based on the given content selectors.
358 │  */
359 │ export function groupNodesBySelector(
360 │   ngContentSelectors: readonly string[],
361 │   nodes: Node[],
362 │ ): Node[][] {
363 │   const projectableNodes: Node[][] = [];
364 │ 
365 ▶   for (let i = 0, ii = ngContentSelectors.length; i < ii; ++i) {
366 ▶     projectableNodes[i] = [];
367 │   }
368 │ 
369 ▶   for (let j = 0, jj = nodes.length; j < jj; ++j) {
370 │     const node = nodes[j];
371 ▶     const ngContentIndex = findMatchingNgContentIndex(node, ngContentSelectors);
372 ▶     if (ngContentIndex != null) {
373 ▶       projectableNodes[ngContentIndex].push(node);
374 │     }
375 │   }
376 │ 
377 │   return projectableNodes;
378 │ }
```

351 行目で `ngContentSelectors`（コンポーネントのテンプレートの `ng-content` の select を並べたもの）を取り、352 行目で要素の今の子（`contents()`、テキストも含む）を分けます。365〜367 行目でセレクタの数だけ空の配列を作り、369〜375 行目で子を 1 つずつ見て、当たった番号の配列に入れます。どこにも当たらない子は捨てられます。5 節の `compileContents` は、この配列ごとに 71 行目で `$compile` し、73 行目で要素を空にし、76〜78 行目で要素の scope に link しながら要素に戻します。

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L380–411 （▶ の行: 386, 388–389, 391–392, 396, 398–399, 401, 407, 409–410）

```ts
380 │ function findMatchingNgContentIndex(
381 │   element: any,
382 │   ngContentSelectors: readonly string[],
383 │ ): number | null {
384 │   const ngContentIndices: number[] = [];
385 │   let wildcardNgContentIndex: number = -1;
386 ▶   for (let i = 0; i < ngContentSelectors.length; i++) {
387 │     const selector = ngContentSelectors[i];
388 ▶     if (selector === '*') {
389 ▶       wildcardNgContentIndex = i;
390 │     } else {
391 ▶       if (matchesSelector(element, selector)) {
392 ▶         ngContentIndices.push(i);
393 │       }
394 │     }
395 │   }
396 ▶   ngContentIndices.sort();
397 │ 
398 ▶   if (wildcardNgContentIndex !== -1) {
399 ▶     ngContentIndices.push(wildcardNgContentIndex);
400 │   }
401 ▶   return ngContentIndices.length ? ngContentIndices[0] : null;
402 │ }
403 │ 
404 │ function matchesSelector(el: any, selector: string): boolean {
405 │   const elProto = <any>Element.prototype;
406 │ 
407 ▶   return el.nodeType === Node.ELEMENT_NODE
408 │     ? // matches is supported by all browsers from 2014 onwards except non-chromium edge
409 ▶       (elProto.matches ?? elProto.msMatchesSelector).call(el, selector)
410 ▶     : false;
411 │ }
```

386〜395 行目、`'*'` は覚えておき、ほかは 391 行目の `matchesSelector`（中身は 409 行目の `Element.prototype.matches`）で当たった番号を集めます。398〜400 行目で `'*'` を最後に足し、401 行目で先頭を返します。407 行目、要素でないノード（テキスト）は `'*'` にしか入りません。Angular 自身の投影は CSS の `matches` を使わず、コンパイラが作った形で照合します（[projection](../template/02-projection.md)）。ここは別の実装です。

> [!WARNING]
> **ハマりどころ**
>
> 396 行目の `ngContentIndices.sort()` は引数なしなので、数を**文字列として**並べます。`[2, 10]` は `[10, 2]` になり、401 行目は 10 を返します。ng-content が 11 個以上あり、1 つの子が 2 桁の番号と 1 桁の番号の両方に当たるときだけ起きます。同じ `class="a b"` の要素が、AngularJS の側からは `[10]` に（下の表）、Angular のテンプレートからは `[2]` に（DEMO の比較の最後）入りました。386 行目の `for` は番号の小さい順に押し込むので、`sort()` を数の比較（`(a, b) => a - b`）にした写しでは `[2]` に入りました（下の表）。

| 子（AngularJS の側から投影） | 22.1.6 そのまま | 396 行目だけ数の比較にした写し |
| --- | --- | --- |
| y（class="a"） | slot2 | slot2 |
| x（class="a b"） | slot10 | slot2 |
| z（class="b"） | slot10 | slot10 |

閉じた PR #70494（2026-08-31〜09-22）は、この節の別の問題を直そうとしていました。投影する子の根に `ng-if` があり、Angular の側の `ng-content` が `*ngIf` などの埋め込みビューの中にあると、76 行目の link の時点でまだ `ng-if` の目印のコメントに親が無く、最初の中身が入らない（#16685）というものです。

📄 `PR #70494（gh pr diff で読んだもの。merge されていない）`

```
--- a/packages/upgrade/src/common/src/downgrade_component_adapter.ts   （閉じた PR #70494 の差分から抜粋）
   compileContents(): Node[][] {
-    const compiledProjectableNodes: Node[][] = [];
-    const projectableNodes: Node[][] = this.groupProjectableNodes();
-    const linkFns = projectableNodes.map((nodes) => this.$compile(nodes));
+    // `$compile()` may replace root nodes (e.g. `ng-if` replaces its element with a comment).
+    // Wrapping each group ensures that these replacements are reflected in the nodes passed to
+    // Angular for projection.
+    const projectableNodes = this.groupProjectableNodes().map((nodes) => angularElement(nodes));
+    this.projectableNodesLinkFns = projectableNodes.map((nodes) => this.$compile(nodes));
 
     this.element.empty!();
 
-    linkFns.forEach((linkFn) => {
-      linkFn(this.scope, (clone: Node[]) => {
-        compiledProjectableNodes.push(clone);
-        this.element.append!(clone);
-      });
-    });
-
-    return compiledProjectableNodes;
+    return projectableNodes;
   }
@@
-    const detectChanges = () => changeDetector.detectChanges();
+    const detectChanges = () => {
+      changeDetector.detectChanges();
+      this.linkProjectableNodes();
+    };
@@
+  private linkProjectableNodes(): void {
+    // AngularJS structural directives need their root markers to have a parent before linking.
+    // Angular creates embedded views containing projection slots during change detection, so link
+    // the projected nodes only after the component has completed its first change detection.
+    const linkFns = this.projectableNodesLinkFns;
+    this.projectableNodesLinkFns = [];
+    for (const linkFn of linkFns) {
+      linkFn(this.scope);
+    }
+  }
```

PR は、`compileContents` では `$compile` だけをして link の関数を覚え、6 節の 186 行目の `detectChanges` の後（Angular が埋め込みビューを作った後）に link する形でした。閉じた理由は、メンテナーのコメントの「`@angular/upgrade` は保守モードで、セキュリティの修正のほかは bug fix も受け付けない」（#70875 の注）です。

## 9. 中身をもう一度コンパイルしていた問題と、その修正（angular-main）

5 節の 68〜83 行目の `compileContents` は、**link の時点で要素の中にあるもの**を `$compile` します。ところが同じ要素に付いた AngularJS のほかのディレクティブ（`ng-transclude` や `ng-bind` など）は、`downgradeComponent` の link より先に要素へ中身を書き込めます。そうして書かれた中身は、テンプレートではなくデータです。それを 71 行目が AngularJS のテンプレートとしてもう一度コンパイルしていたのが #71441 で、angular-main の b2d3ba9f5f0（PR #71442）が直しました。

📄 `angular-main の b2d3ba9f5f0（ソースの 2 ファイル、git show から抜粋）`

```
--- a/packages/upgrade/src/common/src/downgrade_component.ts   （angular-main の b2d3ba9f5f0、2026-10-25。抜粋）
+    // A copy of the contents of each element, taken before anything on the element is linked.
+    const templates = new WeakMap<Node, Node[]>();
+
     return {
       restrict: 'E',
       terminal: true,
@@
-      controller: function () {},
+      controller: [
+        '$element',
+        function (element: IAugmentedJQuery) {
+          // Controllers are instantiated before anything on the element is linked, so the contents
+          // are still the template. A fragment keeps the copies as siblings, as multi-element
+          // directives (e.g. `ng-repeat-start`) need.
+          const fragment = document.createDocumentFragment();
+          element[0].childNodes.forEach((node) => fragment.appendChild(node.cloneNode(true)));
+          templates.set(element[0], Array.from(fragment.childNodes));
+        },
+      ],
       link: (scope: IScope, element: IAugmentedJQuery, attrs: IAttributes, required: any[]) => {
+        const template = templates.get(element[0]) ?? [];
+        templates.delete(element[0]);
@@
-          const projectableNodes = facade.compileContents();
+          const projectableNodes = facade.compileContents(template);

--- a/packages/upgrade/src/common/src/downgrade_component_adapter.ts
-  compileContents(): Node[][] {
+  compileContents(template: Node[]): Node[][] {
+    if (!template.length) {
+      // There is no template to compile, so whatever is in the element was put there by AngularJS
+      // (e.g. through `ng-transclude`): project it as it is.
+      const projectableNodes = this.groupProjectableNodes(this.element.contents!());
+      projectableNodes.forEach((nodes) =>
+        nodes.forEach((node) => this.element[0].removeChild(node)),
+      );
+      this.element.empty!();
+      return projectableNodes;
+    }
+
     const compiledProjectableNodes: Node[][] = [];
-    const projectableNodes: Node[][] = this.groupProjectableNodes();
+    const projectableNodes: Node[][] = this.groupProjectableNodes(template);
@@
-  private groupProjectableNodes() {
+  private groupProjectableNodes(nodes: Node[]) {
     let ngContentSelectors = reflectComponentType(this.component)?.ngContentSelectors ?? [];
-    return groupNodesBySelector(ngContentSelectors, this.element.contents!());
+    return groupNodesBySelector(ngContentSelectors, nodes);
```

1. **controller で写しを取る**

   1 節の 134 行目の空の `controller` を、`$element` を受ける関数に変えました。AngularJS は、同じ要素のどのディレクティブの link よりも先に controller を作ります。その時点の子はまだテンプレートのままなので、`cloneNode(true)` で写して `WeakMap` に入れます。
2. **link では写しの方をコンパイルする**

   `compileContents(template)` は、写しを `groupNodesBySelector` に渡して分け、写しを `$compile` します。要素の今の中身はコンパイルしません。
3. **写しが空なら、今の中身をそのまま投影する**

   テンプレートに子が無いのに中身があるなら、それは AngularJS が入れたもの（`ng-transclude` など）なので、コンパイルせずにそのまま分けて投影します。

前と後の違いは、ふつうのテンプレートでも見えます。`ng-transclude` を付けた要素に downgrade したコンポーネントを置き、利用者が書いた `<b>{{ label() }}</b>` を transclude させた記録です（upgrade の部分だけを入れ替え、core は 22.1.6 のまま）。

| @angular/upgrade | &lt;b&gt; の中身 | $rootScope の下の watcher の数 | 1 回の $digest で label() が呼ばれた数 |
| --- | --- | --- | --- |
| 22.1.6（修正の前） | 「」 | 4 | 1 |
| 22.2.6（修正の後） | 「L」 | 3 | 1 |

22.1.6 では、`ng-transclude` が正しい scope（利用者のテンプレートの scope）で link した `<b>` を、76 行目がもう一度 `this.scope`（`ng-transclude` を置いたコンポーネントの isolate scope）で link します。watcher が 1 つ増え、増えた方は `label` の無い scope で評価するので、中身が空で上書きされます。22.2.6 では写しが空なので 3 つ目の手順の枝に入り、コンパイルし直しません。

📄 `どの版に入ったか（git と npm で確かめた）`

```
$ git -C ~/angular-research/angular-main log --all --oneline --grep="only compile the template contents of a downgraded"
59ee277941a fix(upgrade): only compile the template contents of a downgraded component   # 最初のタグ v20.3.35
bc74d72035b fix(upgrade): only compile the template contents of a downgraded component   # v21.2.26
ecaec13db4f fix(upgrade): only compile the template contents of a downgraded component   # v22.2.4
b2d3ba9f5f0 fix(upgrade): only compile the template contents of a downgraded component   # v22.3.0-next.3
$ npm pack @angular/upgrade@22.1.8 / @22.2.6 を展開して grep -c "templates = new WeakMap" fesm2022/static.mjs
22.1.8: 0   22.2.6: 1     （22.1.x の最後の 22.1.8 は 2026-09-23 公開で、修正より前）
```

> [!NOTE]
> **ポイント**
>
> この修正は 22.2.4・21.2.26・20.3.35 に backport されています（PR #71614・#71610・#71611）。22.1.x には入っていません。この章の記録の 22.1.6 は修正の前の版です。何がどう悪用できたかは、このサイトでは書きません。

## 10. 片付け：$destroy から ComponentRef.destroy

📄 `angular/packages/upgrade/src/common/src/downgrade_component_adapter.ts` L282–317 （▶ の行: 284, 287, 291, 293–296, 312, 314）

```ts
282 │   private registerCleanup(componentRef: ComponentRef<any>) {
283 │     const testabilityRegistry = componentRef.injector.get(TestabilityRegistry);
284 ▶     const destroyComponentRef = this.wrapCallback(() => componentRef.destroy());
285 │     let destroyed = false;
286 │ 
287 ▶     this.element.on!('$destroy', () => {
288 │       // The `$destroy` event may have been triggered by the `cleanData()` call in the
289 │       // `componentScope` `$destroy` handler below. In that case, we don't want to call
290 │       // `componentScope.$destroy()` again.
291 ▶       if (!destroyed) this.componentScope.$destroy();
292 │     });
293 ▶     this.componentScope.$on('$destroy', () => {
294 ▶       if (!destroyed) {
295 ▶         destroyed = true;
296 ▶         testabilityRegistry.unregisterApplication(componentRef.location.nativeElement);
297 │ 
298 │         // The `componentScope` might be getting destroyed, because an ancestor element is being
299 │         // removed/destroyed. If that is the case, jqLite/jQuery would normally invoke `cleanData()`
300 │         // on the removed element and all descendants.
301 │         //   https://github.com/angular/angular.js/blob/2e72ea13fa98bebf6ed4b5e3c45eaf5f990ed16f/src/jqLite.js#L349-L355
302 │         //   https://github.com/jquery/jquery/blob/6984d1747623dbc5e87fd6c261a5b6b1628c107c/src/manipulation.js#L182
303 │         //
304 │         // Here, however, `destroyComponentRef()` may under some circumstances remove the element
305 │         // from the DOM and therefore it will no longer be a descendant of the removed element when
306 │         // `cleanData()` is called. This would result in a memory leak, because the element's data
307 │         // and event handlers (and all objects directly or indirectly referenced by them) would be
308 │         // retained.
309 │         //
310 │         // To ensure the element is always properly cleaned up, we manually call `cleanData()` on
311 │         // this element and its descendants before destroying the `ComponentRef`.
312 ▶         cleanData(this.element[0]);
313 │ 
314 ▶         destroyComponentRef();
315 │       }
316 │     });
317 │   }
```

AngularJS の要素が消えると jqLite が要素に `$destroy` のイベントを送ります。287〜292 行目はそれを受けて `componentScope.$destroy()` を呼び、293 行目からの `$destroy` の listener に進みます。295 行目で一度だけにし、296 行目で Testability の登録を外し、312 行目で要素と子孫の jqLite のデータを消し（`destroyComponentRef` が要素を DOM から外すと、AngularJS の側の掃除が届かないため。298〜311 行目のコメント）、314 行目で `ComponentRef.destroy()` です。逆向き（要素ではなく先祖の scope が壊れたとき）でも、65 行目の子の scope が一緒に壊れるので同じ listener に入ります。

## 11. DEMO：AngularJS の側から値を変え、output を受ける

> **🧪 DEMO — downgrade したコンポーネントの input・output・破棄（記録の再生）**
>
> `<scratchpad>/upg-demo/a/record-downgrade.mjs` の記録です（AngularJS 1.8.3・@angular/upgrade 22.1.6・@angular/core 22.1.6・jsdom 26.1.0）。AngularJS のテンプレートは `<ng2-greet ng-if="show" name="Hi {{who}}" [title]="title" bindon-value="m.val" (clicked)="onClicked($event)" on-picked="onPicked($event)"><span class="head">…</span> text <b>bold</b></ng2-greet>` です。`name` は `@Input`（setter で記録）、`title` は `input()`、`value` は `model()`、`clicked` は `EventEmitter`、`picked` は `output()` です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/upg-downgrade-component)

段を進めると、この章の行がこの順で見えます。

- 1 段目：`constructor` → `name` の setter（346 行目）→ `ngOnChanges`（3 つまとめて 1 回、197 行目）→ `ngOnInit`（210〜211 行目の `detectChanges` の中）。`title` の `transform` の記録が 1 行も無いのは、6 節の注のとおりです。
- 2〜3 段目：変わった input だけの `ngOnChanges`。`title`（signal）にも `SimpleChange` が届きます（326〜327 行目は signal でも溜める）。
- 5 段目：Angular の側の `value.set()` が `valueChange` を出し、271 行目の `setter` で `m.val` に書かれ、次の `$digest` で 181 行目の `$watch` が気づいて、もう一度 `ngOnChanges` が呼ばれます。
- 6 段目：`EventEmitter` も `output()` も、272 行目の `getter(this.scope, {'$event': v})` で AngularJS の関数まで届きます。
- 7 段目：`ng-if` が要素を消すと `ngOnDestroy` まで同期に走り、購読が外れます（274 行目と 10 節）。

## ここまでの呼び出し

- `$compile` が `<ng2-greet>` に当たる — AngularJS — *terminal なので子はコンパイルしない*
  - `link(scope, element, attrs, required)` — downgrade\_component.ts 135
    - `SyncPromise.all([parent, module]).then(doDowngrade)` — 243 — *UpgradeModule ならその場で*
      - `new ParentInjectorPromise(element)` — 198
      - `new DowngradeComponentAdapter(…)` — 199 — *componentScope = scope.$new()（65）*
      - `compileContents()` — adapter 68 — *groupNodesBySelector → $compile → link*
      - `createComponentAndSetup()` — 85
        - `createComponent(component, {elementInjector, environmentInjector, projectableNodes, hostElement})` — 106
        - `setupInputs()` — 131 — *$observe / $watch、inputChangeCount の watcher、detectChanges の watcher*
        - `setupOutputs()` → `subscribeToOutput()` — 227 → 256
        - `registerCleanup()` — 282
      - `injectorPromise.resolve(componentRef.injector)` — 220
- `$digest` — AngularJS
  - `observeFn` / `watchFn` → `updateInput()` — 143 / 177 → 319
  - `ngOnChanges(inputChanges)` → `markForCheck()` — 197 → 200
  - `changeDetector.detectChanges()` — 211

## テストと直し方

この章の約束は 3 つの spec にあります。`static/test/integration/downgrade_component_spec.ts` の `describe('downgrade ng2 component')`（45 行目）には、`'should bind properties, events'`（49 行目）、`'should bind properties to signal inputs'`（179 行目）、`model()` の 2 つ（224 行目・264 行目）、`'should support two-way binding and event listener'`（352 行目）、`propagateDigest` の 3 つ（405・475・543 行目）、``'should initialize inputs in time for `ngOnChanges`'``（580 行目）、`'should bind to ng-model'`（638 行目）、片付けの 2 つ（710・775 行目）、`'should respect hierarchical dependency injection for ng2'`（1008 行目）、`'should be compiled synchronously, if possible'`（1046 行目）があります。

📄 `angular/packages/upgrade/static/test/integration/downgrade_component_spec.ts` L190–221 （▶ の行: 192, 202, 217, 219–220）

```ts
190 │       })
191 │       class Ng2Component {
192 ▶         message = input<string>('');
193 │       }
194 │ 
195 │       @NgModule({declarations: [Ng2Component], imports: [BrowserModule, UpgradeModule]})
196 │       class Ng2Module {
197 │         ngDoBootstrap() {}
198 │       }
199 │ 
200 │       // Hack to wire up the `input()` signal correctly, since our JIT tests don't run with the
201 │       // transform which supports `input()`.
202 ▶       (Ng2Component as any).ɵcmp.inputs.message = ['message', /* InputFlags.SignalBased */ 1];
203 │ 
204 │       ng1Module.directive(
205 │         'ng2',
206 │         downgradeComponent({
207 │           component: Ng2Component,
208 │         }),
209 │       );
210 │ 
211 │       const element = html(`
212 │         <div>
213 │           <ng2 literal="Text" message="Hello {{name}}"></ng2>
214 │         </div>`);
215 │ 
216 │       bootstrap(platformBrowserDynamic(), Ng2Module, element, ng1Module).then((upgrade) => {
217 ▶         expect(multiTrim(document.body.textContent)).toEqual('Message: Hello world');
218 │ 
219 ▶         $apply(upgrade, 'name = "everyone"');
220 ▶         expect(multiTrim(document.body.textContent)).toEqual('Message: Hello everyone');
221 │       });
```

192 行目の `input()` は JIT では signal と分からないので、202 行目で `ɵcmp.inputs` に `SignalBased`（1）を手で書きます（6 節）。219〜220 行目が 343〜344 行目の道を確かめています。

📄 `angular/packages/upgrade/static/test/integration/downgrade_component_spec.ts` L224–262 （▶ の行: 236, 245–246, 252, 259–260）

```ts
224 │     it('should propagate AngularJS→Angular changes through model() signals', waitForAsync(() => {
225 │       const ng1Module = angular.module_('ng1', []).run(($rootScope: angular.IScope) => {
226 │         $rootScope['value'] = 'initial';
227 │       });
228 │ 
229 │       @Component({
230 │         selector: 'ng2',
231 │         template: 'Value: {{value()}}',
232 │         changeDetection: ChangeDetectionStrategy.Eager,
233 │         standalone: false,
234 │       })
235 │       class Ng2Component {
236 ▶         value = model<string>('');
237 │       }
238 │ 
239 │       @NgModule({declarations: [Ng2Component], imports: [BrowserModule, UpgradeModule]})
240 │       class Ng2Module {
241 │         ngDoBootstrap() {}
242 │       }
243 │ 
244 │       // Wire up the model() signal for JIT tests. AOT compilation handles this automatically.
245 ▶       (Ng2Component as any).ɵcmp.inputs = {value: ['value', /* InputFlags.SignalBased */ 1]};
246 ▶       (Ng2Component as any).ɵcmp.outputs = {valueChange: 'value'};
247 │ 
248 │       ng1Module.directive('ng2', downgradeComponent({component: Ng2Component}));
249 │ 
250 │       const element = html(`
251 │         <div>
252 ▶           <ng2 bindon-value="value"></ng2>
253 │           | value: {{value}}
254 │         </div>`);
255 │ 
256 │       bootstrap(platformBrowserDynamic(), Ng2Module, element, ng1Module).then((upgrade) => {
257 │         expect(multiTrim(document.body.textContent)).toEqual('Value: initial | value: initial');
258 │ 
259 ▶         $apply(upgrade, 'value = "updated"');
260 ▶         expect(multiTrim(document.body.textContent)).toEqual('Value: updated | value: updated');
261 │       });
262 │     }));
```

245〜246 行目で `valueChange` の output も手で足し、252 行目の `bindon-value` で 7 節の 232〜235 行目と 6 節の 339〜344 行目を通します。

投影は `static/test/integration/content_projection_spec.ts` の `describe('content projection')`（33 行目）の 4 つ（37・75・115・164 行目）と、`src/common/test/downgrade_component_adapter_spec.ts` の `describe('groupNodesBySelector')`（18 行目）の 4 つ（19・40・64・70 行目）です。`PropertyBinding` は `component_info_spec.ts` の 2 つ（12・24 行目）です。

📄 `angular/packages/upgrade/src/common/test/downgrade_component_adapter_spec.ts` L40–62 （▶ の行: 49–50, 58, 61）

```ts
40 │       it('should collect up unmatched nodes for the wildcard selector', () => {
41 │         const contentNodes = nodes(
42 │           '<div class="x"><span>div-1 content</span></div>' +
43 │             '<input type="number" name="myNum">' +
44 │             '<input type="date" name="myDate">' +
45 │             '<span>span content</span>' +
46 │             '<div class="x"><span>div-2 content</span></div>',
47 │         );
48 │ 
49 ▶         const selectors = ['.x', '*', 'input[type=date]'];
50 ▶         const projectableNodes = groupNodesBySelector(selectors, contentNodes);
51 │ 
52 │         expect(projectableNodes[0]).toEqual(
53 │           nodes(
54 │             '<div class="x"><span>div-1 content</span></div>' +
55 │               '<div class="x"><span>div-2 content</span></div>',
56 │           ),
57 │         );
58 ▶         expect(projectableNodes[1]).toEqual(
59 │           nodes('<input type="number" name="myNum">' + '<span>span content</span>'),
60 │         );
61 ▶         expect(projectableNodes[2]).toEqual(nodes('<input type="date" name="myDate">'));
62 │       });
```

49 行目のセレクタは 3 つで、`'*'` の位置（1 番）と当たった番号の並べ替え（396 行目）の両方を通りますが、番号は 1 桁だけです。

📄 `angular/packages/upgrade/static/test/integration/content_projection_spec.ts` L75–113 （▶ の行: 105–106, 111）

```ts
 75 │     it('should correctly project structural directives', waitForAsync(() => {
 76 │       @Component({
 77 │         selector: 'ng2',
 78 │         template: 'ng2-{{ itemId }}(<ng-content></ng-content>)',
 79 │         standalone: false,
 80 │       })
 81 │       class Ng2Component {
 82 │         @Input() itemId: string = '';
 83 │       }
 84 │ 
 85 │       @NgModule({
 86 │         imports: [BrowserModule, UpgradeModule],
 87 │         declarations: [Ng2Component],
 88 │       })
 89 │       class Ng2Module {
 90 │         ngDoBootstrap() {}
 91 │       }
 92 │ 
 93 │       const ng1Module = angular
 94 │         .module_('ng1', [])
 95 │         .directive('ng2', downgradeComponent({component: Ng2Component}))
 96 │         .run(($rootScope: angular.IRootScopeService) => {
 97 │           $rootScope['items'] = [
 98 │             {id: 'a', subitems: [1, 2, 3]},
 99 │             {id: 'b', subitems: [4, 5, 6]},
100 │             {id: 'c', subitems: [7, 8, 9]},
101 │           ];
102 │         });
103 │ 
104 │       const element = html(`
105 ▶            <ng2 ng-repeat="item in items" [item-id]="item.id">
106 ▶              <div ng-repeat="subitem in item.subitems">{{ subitem }}</div>
107 │            </ng2>
108 │          `);
109 │ 
110 │       bootstrap(platformBrowserDynamic(), Ng2Module, element, ng1Module).then((upgrade) => {
111 ▶         expect(multiTrim(document.body.textContent)).toBe('ng2-a( 123 )ng2-b( 456 )ng2-c( 789 )');
112 │       });
113 │     }));
```

105 行目の `ng-repeat` は downgrade したコンポーネントの要素そのものに、106 行目の `ng-repeat` は投影される子に付いていて、どちらも 71 行目の `$compile` と 76 行目の link を通ります。

📄 `走らせ方（web の suite。--test_arg=--filter は効かない）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/upgrade/static/test:test_chromium //packages/upgrade/src/common/test:test_chromium \
  --nocache_test_results --test_output=all
```

📄 `結果（2026-11-16、手元の macOS で。第 1 回と同じ 1 回の実行）`

```
Chromium: |██████████████████████████████| 1/1 test files | 38 passed, 0 failed
Chromium: |██████████████████████████████| 1/1 test files | 614 passed, 0 failed, 12 skipped
//packages/upgrade/src/common/test:test_chromium                         PASSED in 2.2s
//packages/upgrade/static/test:test_chromium                             PASSED in 5.3s
```

### 直すとしたら

- 8 節の番号の並べ替えは、`downgrade_component_adapter.ts` の `findMatchingNgContentIndex` の 396 行目です。DEMO の写しでは `(a, b) => a - b` にして `[2]` に入りました。386 行目の `for` が小さい順に押し込むので、並べ替えを消しても同じ結果になります。spec は `downgrade_component_adapter_spec.ts` の `describe('groupNodesBySelector')`（18 行目）に、11 個以上のセレクタで 2 つに当たる子の it を足す形です。
- 6 節の `transform` は、`updateInput`（319〜348 行目）が `writeToDirectiveInput` を通らないのが原因です。5f56a658375 のメッセージにある `ComponentRef.setInput` への書き換えは `ngOnChanges` を呼ぶ時期も変えるので、``'should initialize inputs in time for `ngOnChanges`'``（580 行目）などのタイミングの it を一緒に見る必要があります。spec は `'should bind properties to signal inputs'`（179 行目）の隣に、`transform` を持つ `@Input` と `input()` の it を足す形です。

## 聞かれそうな質問

**Q. downgrade したコンポーネントの変更検知は、何が起こしますか？**

AngularJS の `$digest` です。210〜211 行目が毎回呼ばれる `$watch` で `detectChanges` を呼びます。`UpgradeModule` の既定ではビューは `ApplicationRef` に入らないので（216 行目の条件）、Angular の `tick` だけでは更新されません。Angular の側で起きた変化が `$digest` を起こす経路は[第 4 回](04-upg-injection-cd.md)です。

**Q. `ngOnChanges` は Angular のテンプレートのときと同じですか？**

違いが 2 つあります。呼ぶのは Angular ではなく 197 行目の adapter で、1 回の `$digest` で変わった input をまとめて渡します。最初の `previousValue` は `undefined` ではなく今の値です（148〜149 行目、DEMO の 1 段目）。

**Q. `input()` の signal はそのまま使えますか？**

AOT なら使えます。343〜344 行目で `applyValueToInputSignal` に書きます（5f56a658375、v19.0.0 から）。`model()` は 8d31b82116c（v22.1.0、22.0.3 にも backport）から双方向で使えます。ただし `transform` は呼ばれません（6 節の注）。`unsafelyOverwriteSignalInputs: true` を渡すと signal が値で上書きされ、テンプレートの `title()` が `TypeError` になります（DEMO の比較）。

**Q. `[(value)]` の双方向が効かない output があるのはなぜですか？**

232〜239 行目が output の名前から最後の `Change` を落として属性名を作るからです。`valueChange` なら `bindon-value` と `[(value)]` に当たりますが、`Change` で終わらない output は双方向の戻り道になりません。

**Q. output の購読は漏れませんか？**

漏れません。274 行目で `componentRef.onDestroy` に `unsubscribe` を登録しています（#48032 を直した 253d7564647）。DEMO の 7 段目で `EventEmitter` の observers が 1 → 0 になるのを確かめました。

**Q. 要素の中に書いた子は、どの scope で評価されますか？**

要素の scope（`link` に渡された `scope`）です。76 行目で `this.scope` に link します。65 行目の `componentScope` は input の `$watch` と Angular の側の `'$scope'` のためのもので、子の評価には使いません。9 節の修正の前は、ほかのディレクティブが書いた中身まで 76 行目で link していたので、その中身も要素の scope で評価されました。

## 読み終えて

- `downgradeComponent` は `restrict: 'E'`・`terminal: true` のディレクティブを返し、子のコンパイルと投影を自分で引き受ける
- link は親の注入器を `'?^^$$angularInjector'` で探し、要素に約束を置いてから作り、作った後に `componentRef.injector` で解決する。`UpgradeModule` ではこれが全部同期に終わる
- input は属性なら `$observe`＋1 回の `$watch`、式なら `$watch`。`ngOnChanges` と `detectChanges` は adapter の watcher が呼ぶ。signal は `applyValueToInputSignal` に直接書くので `transform` を通らない
- output は `subscribe(関数)` と `onDestroy` での `unsubscribe`。双方向は `…Change` という名前の output だけ
- 投影の番号の並べ替えは文字列の順（396 行目）。中身の二重のコンパイルは angular-main の b2d3ba9f5f0 で直り、22.2.4 などに backport された

---

← 前: [全体と起動：UpgradeModule.bootstrap が 2 つを順に起こす](01-upg-bootstrap.md)  
次: [UpgradeComponent：Angular の中で AngularJS のディレクティブを動かす](03-upg-upgrade-component.md) →
