[目次](../README.md) › [動的コンポーネント：createComponent と ViewContainerRef](README.md) › 第 2 回 / 全 6 回

# ComponentFactory.create の中：注入器・tracing・ホストの要素

> ComponentFactory.create が signal の読み取りを外し、注入器と環境を決め、TracingService があれば componentCreate で包んで（c19066c741a）createComponentRef に進むまで。ChainedInjector が要素の側に渡す「要素だけを調べて」という印と、それがつながった ChainedInjector の中で効く条件、環境の注入器を親に持つ Injector.create を elementInjector に渡すと environmentInjector の上書きが効かないこと、RendererFactory2 が取れないときの NG0407。ホストの要素を探すか作るか、ViewContainerRef だけが差し込む場所の名前空間を渡す修正（2ab5ff56ded、22.1 系列には 9a8e4826b9d で v22.1.4 から）。ページの上で注入器の組み合わせと selector ごとのタグ名・名前空間の表を作る。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dyn-factory-create)

---

[第 1 回](01-dyn-entry-points.md)で、2 つの入口が `ComponentFactory.create` に集まることを見ました。この章では `create` の中で決まる 2 つのこと、**子のコンポーネントが `inject` したときにどの注入器から値が来るか**と、**ホストの要素をどのタグ名・どの名前空間で作るか**を、spec とページの上の実験で確かめます。あわせて、作る処理を包む tracing（c19066c741a）と、名前空間を受け継ぐ修正（2ab5ff56ded）を読みます。

読む対象は `packages/core/src/render3/component_ref.ts`（`ComponentFactory.create` と `createComponentRef`）、`packages/core/src/render3/chained_injector.ts`、`packages/core/src/render3/instructions/element.ts`、`packages/core/test/acceptance/create_component_spec.ts`・`view_container_ref_spec.ts`・`tracing_spec.ts` です。`create` の前半（`createRootViewInjector` と `createRootLViewEnvironment`）とルートの `LView` を作る後半は [boot-application-ref](../boot/10-boot-application-ref.md) の 2〜5 節で、standalone のコンポーネントの専用の注入器（`getStandaloneInjector`）は [ngmodule-standalone-imports](../ngmodule/13-ngmodule-standalone-imports.md) の 4〜6 節で読みました。ここでは繰り返さず、その先を見ます。

1. [1. 2 つの入口](01-dyn-entry-points.md)
2. **2. ComponentFactory.create の中**（この章）
3. [3. directives の選択肢](03-dyn-directives.md)
4. [4. bindings と ComponentRef](04-dyn-bindings-ref.md)
5. [5. ViewContainerRef とホストの守り](05-dyn-vcr-host.md)
6. [6. spec と issue](06-dyn-tests-issues.md)

## 1. create の流れと、tracing で包む行

1. **signal の読み取りを止める**

   `create` は最初に `setActiveConsumer(null)` で「いま signal の読み取りを記録している consumer」を外します（[boot-application-ref](../boot/10-boot-application-ref.md) の 2 節の引用）。`computed` や `effect` の中で `createComponent` を呼んでも、その間に子のコンストラクタが読んだ signal は、外の `computed` や `effect` の依存として記録されません。
2. **注入器と環境を決める**

   `createRootViewInjector` が要素の側の注入器と環境の注入器を `ChainedInjector` でつなぎ（2 節）、`createRootLViewEnvironment` がそこから `RendererFactory2` などを引きます。`RendererFactory2` が引けなければ `NG0407` です（DEMO の最後の行）。
3. **tracing があれば包み、無ければそのまま createComponentRef**

📄 `angular/packages/core/src/render3/component_ref.ts` L288–317 （▶ の行: 288, 290–292, 299–300, 304, 316）

```ts
288 ▶       const tracingService = environment.tracingService;
289 │ 
290 ▶       if (tracingService && tracingService.componentCreate) {
291 ▶         return tracingService.componentCreate(getComponentName(cmpDef), () =>
292 ▶           this.createComponentRef(
293 │             environment,
294 │             rootViewInjector,
295 │             projectableNodes,
296 │             rootSelectorOrNode,
297 │             directives,
298 │             componentBindings,
299 ▶             hostElementNamespace,
300 ▶             allowNonStandaloneDirectives,
301 │           ),
302 │         );
303 │       } else {
304 ▶         return this.createComponentRef(
305 │           environment,
306 │           rootViewInjector,
307 │           projectableNodes,
308 │           rootSelectorOrNode,
309 │           directives,
310 │           componentBindings,
311 │           hostElementNamespace,
312 │           allowNonStandaloneDirectives,
313 │         );
314 │       }
315 │     } finally {
316 ▶       setActiveConsumer(prevConsumer);
317 │     }
```

288 行目の `environment.tracingService` は、2 つ目の手順で環境の注入器から `TracingService` を任意で引いたものです。290 行目、それが `componentCreate` を持っていれば、291 行目でコンポーネントの名前と「作る関数」を渡して、包んでもらいます。持っていなければ 304 行目の `else` で同じ `createComponentRef` を直接呼びます。299 行目の `hostElementNamespace`（7 番目の引数）は ViewContainerRef だけが、300 行目の `allowNonStandaloneDirectives`（8 番目）は TestBed だけが渡します（3 節と[第 3 回](03-dyn-directives.md)）。316 行目の `finally` で、外した consumer を元に戻します。

この包み方は c19066c741a（2026-03-06）で入りました。同じコミットは、テンプレートに書いた子コンポーネントを作る命令の側にも同じ包みを足しています。

📄 `angular/packages/core/src/render3/instructions/element.ts` L114–131 （▶ の行: 116–117, 119–120, 122–123, 129）

```ts
114 │ 
115 │   // If the node is a component host and we have a tracing service, we need to wrap the init logic.
116 ▶   if (isComponentHost(tNode)) {
117 ▶     const tracingService = lView[ENVIRONMENT].tracingService;
118 │ 
119 ▶     if (tracingService && tracingService.componentCreate) {
120 ▶       const def = tView.data[tNode.directiveStart + tNode.componentOffset] as ComponentDef<{}>;
121 │ 
122 ▶       return tracingService.componentCreate(getComponentName(def), () => {
123 ▶         initializeElement(index, name, lView, tNode, localRefsIndex);
124 │         return ɵɵelementStart;
125 │       });
126 │     }
127 │   }
128 │ 
129 ▶   initializeElement(index, name, lView, tNode, localRefsIndex);
130 │   return ɵɵelementStart;
131 │ }
```
*ɵɵelementStart の中。要素がコンポーネントのホストのときだけ包む。*

116 行目、ホストの要素にコンポーネントが当たっているときだけ、117 行目で同じ `tracingService` を `lView[ENVIRONMENT]` から取り、122 行目で包みます。つまり `componentCreate` には、**動的に作ったルートのコンポーネントと、テンプレートの中の子のコンポーネントの両方**が届きます。`TracingService` は `ɵTracingService` として出ている非公開の口で、公開 API ではありません。

📄 `angular/packages/core/test/acceptance/tracing_spec.ts` L148–181 （▶ の行: 168, 170, 172, 174, 180）

```ts
148 │     @Component({
149 │       template: '<grandchild/>',
150 │       selector: 'child',
151 │       imports: [GrandChild],
152 │     })
153 │     class Child {}
154 │ 
155 │     @Component({
156 │       template: ` <child />
157 │         <child />
158 │ 
159 │         @if (showExtra()) {
160 │           <extra />
161 │         }`,
162 │       imports: [Child, Extra],
163 │     })
164 │     class App {
165 │       showExtra = signal(false);
166 │     }
167 │ 
168 ▶     const fixture = TestBed.createComponent(App);
169 │     fixture.detectChanges();
170 ▶     expect(createdComponents).toEqual(['App', 'Child', 'Child', 'GrandChild', 'GrandChild']);
171 │ 
172 ▶     fixture.componentInstance.showExtra.set(true);
173 │     fixture.detectChanges();
174 ▶     expect(createdComponents).toEqual([
175 │       'App',
176 │       'Child',
177 │       'Child',
178 │       'GrandChild',
179 │       'GrandChild',
180 ▶       'Extra',
181 │     ]);
```
*tracing\_spec.ts の it('should trace component creations')（:137）の後半。*

170 行目、ルートの `App`、テンプレートの 2 つの `Child`、その中の 2 つの `GrandChild` の順に届きます。172 行目で `@if` の中を出すと、180 行目の `Extra` が足されます。関数の `createComponent` で作ったときも同じかを、記録のスクリプトで確かめました。

📄 `記録（Node）`

```
// 記録スクリプト: ɵTracingService を componentCreate だけ持つ値で provide した環境の注入器を作り、
// createComponent(Traced, { environmentInjector }) → detectChanges() → destroy()
// Traced のテンプレートは <leaf-x />（Leaf も selector つきのコンポーネント）
componentCreate に届いた名前: ["Traced","Leaf"]   // 22.1.6 と 22.2.6 で同じ
```

## 2. 注入器：ChainedInjector の「要素だけを調べて」という印

`ChainedInjector` は、要素の側の注入器に先に聞き、無ければ環境の注入器に聞く、という 2 段の注入器です（全体は [ngmodule-standalone-imports](../ngmodule/13-ngmodule-standalone-imports.md) の 6 節）。先に聞くとき、`notFoundValue`（見つからなかったときに返してほしい値）として `NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR` という空のオブジェクトを渡します。ここで大事なのは、返ってきた値を見る条件です。

📄 `angular/packages/core/src/render3/chained_injector.ts` L32–38 （▶ の行: 32–33, 38）

```ts
32 ▶       value !== NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR ||
33 ▶       notFoundValue === (NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR as unknown as T)
34 │     ) {
35 │       // Return the value from the root element injector when
36 │       // - it provides it
37 │       //   (value !== NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR)
38 ▶       // - the module injector should not be checked
```

32 行目は「要素の側で見つかった」。33 行目は「自分を呼んだ人が、この印を `notFoundValue` に渡してきた」です。33 行目のときは、見つからなくても環境の注入器に聞かず、印をそのまま返します（38 行目のコメント「the module injector should not be checked」）。**ChainedInjector の中に ChainedInjector がつながっているときに、内側の方が自分の環境の注入器を勝手に調べない**ための条件です。

spec は 2 本です。1 本目は環境の注入器だけを渡します。

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L129–149 （▶ の行: 137, 142–144, 147）

```ts
129 │   it('should be able to inject tokens from EnvironmentInjector', () => {
130 │     const A = new InjectionToken('A');
131 │     @Component({
132 │       template: 'Token: {{ a }}',
133 │ 
134 │       changeDetection: ChangeDetectionStrategy.Eager,
135 │     })
136 │     class StandaloneComponent {
137 ▶       a = inject(A);
138 │     }
139 │ 
140 │     const hostElement = document.createElement('div');
141 │     const parentInjector = TestBed.inject(EnvironmentInjector);
142 ▶     const providers = [{provide: A, useValue: 'EnvironmentInjector(A)'}];
143 ▶     const environmentInjector = createEnvironmentInjector(providers, parentInjector);
144 ▶     const componentRef = createComponent(StandaloneComponent, {hostElement, environmentInjector});
145 │     componentRef.changeDetectorRef.detectChanges();
146 │ 
147 ▶     expect(hostElement.textContent).toBe('Token: EnvironmentInjector(A)');
148 │     componentRef.destroy();
149 │   });
```

142〜143 行目で `A` を持つ環境の注入器を作り、144 行目で渡すと、137 行目の `inject(A)` がその値を返します（147 行目）。2 本目は、コンポーネントの中から自分の `Injector`（つまり要素の `NodeInjector`）を `elementInjector` に渡します。

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L164–200 （▶ の行: 166, 172, 178–179, 181, 184–185, 199）

```ts
164 │     @Component({
165 │       template: 'Tokens: <div #target></div>',
166 ▶       providers: [{provide: A, useValue: 'ElementInjector(A)'}],
167 │ 
168 │       changeDetection: ChangeDetectionStrategy.Eager,
169 │     })
170 │     class RootStandaloneComponent {
171 │       @ViewChild('target', {read: ElementRef}) target!: ElementRef;
172 ▶       constructor(private injector: Injector) {}
173 │ 
174 │       createChildComponent() {
175 │         const hostElement = this.target.nativeElement;
176 │         const parentInjector = this.injector.get(EnvironmentInjector);
177 │         const providers = [
178 ▶           {provide: A, useValue: 'EnvironmentInjector(A)'},
179 ▶           {provide: B, useValue: 'EnvironmentInjector(B)'},
180 │         ];
181 ▶         const environmentInjector = createEnvironmentInjector(providers, parentInjector);
182 │         const childComponentRef = createComponent(ChildStandaloneComponent, {
183 │           hostElement,
184 ▶           elementInjector: this.injector,
185 ▶           environmentInjector,
186 │         });
187 │         childComponentRef.changeDetectorRef.detectChanges();
188 │       }
189 │     }
190 │ 
191 │     const fixture = TestBed.createComponent(RootStandaloneComponent);
192 │     fixture.detectChanges();
193 │ 
194 │     fixture.componentInstance.createChildComponent();
195 │ 
196 │     const rootEl = fixture.nativeElement;
197 │ 
198 │     // Token A is coming from the Element Injector, token B - from the Environment Injector.
199 ▶     expect(rootEl.textContent).toBe('Tokens: ElementInjector(A) and EnvironmentInjector(B)');
200 │   });
```

親のコンポーネントは 166 行目の `providers` で `A` を持ち、172 行目でその要素の注入器を受け取ります。178〜179 行目で、渡す環境の注入器にも `A` と `B` を入れておきます。199 行目、`A` は要素の側（`ElementInjector(A)`）、`B` は環境の側から来ます。**要素の側にあれば、環境の注入器の同じトークンより勝つ**ことを固めています。

では、要素の側の注入器が「自分の親」を持っていたらどうなるでしょうか。spec に無い組み合わせを、ページの上の本物で試します。

> **🧪 DEMO — elementInjector と environmentInjector の組み合わせ**
>
> `DFC_ONLY` はアプリの根に無いトークン、`DFC_ROOTED` は `providedIn: 'root'` で `'root（providedIn）'` を返すトークンです。この章のコンポーネントは `providers` で `DFC_ONLY` だけを持っています。ボタンを押すと、組み合わせごとに `createComponent(DfcProbe, { environmentInjector, elementInjector, hostElement })` で作り、2 つを `inject` した値を読んで、すぐ `destroy` します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dyn-factory-create)

1. **「なし」と「Injector.create（parent なし）」：環境の注入器の上書きが効く**

   `elementInjector` を渡さないと `getNullInjector()` が入ります（[第 1 回](01-dyn-entry-points.md)の 2 節）。親の無い `Injector.create` も、見つからなければ最後は空の注入器が印を返すので、`DFC_ROOTED` は渡した環境の値になります。
2. **「この章の NodeInjector」：DFC\_ONLY は章から、DFC\_ROOTED は渡した環境から**

   `NodeInjector` は、要素の木を上っても見つからないと、自分のビューの `lView[INJECTOR]` に聞きます（[di-node-injector-lookup](../di/11-di-node-injector-lookup.md) の 6 節）。この章のビューの `lView[INJECTOR]` もまた、`RouterOutlet` がこの章を ViewContainerRef から作ったときの `ChainedInjector` です（その要素の側は `OutletInjector` で、知らないトークンは `notFoundValue` ごと親に渡します）。印が渡ってくるので 33 行目の条件に当たり、アプリの根を調べずに印を返します。だから `DFC_ROOTED` は外側の `ChainedInjector` が渡した環境に聞き、上書きが効きます。
3. **「Injector.create（parent: アプリの注入器）」：上書きが効かない**

   この行だけ、`DFC_ROOTED` が `'root（providedIn）'` になり、メモの列に「`ref.injector.get(EnvironmentInjector)` が渡した環境と違う」と出ます。`Injector.create` が作る注入器は、自分に無いトークンを `parent` にそのまま聞きます。`parent` がアプリの根の `R3Injector` だと、そこで `providedIn: 'root'` の値が作られて返り、外側の `ChainedInjector` は 32 行目の「見つかった」で止まります。**要素の側の注入器に環境の注入器を親としてつなぐと、その親が `environmentInjector` より先に答える**、ということです。
4. **最後の行：NG0407**

   `createEnvironmentInjector([], null)` は親を持たない環境の注入器で、`RendererFactory2` がありません。`createRootLViewEnvironment` で止まります。本番ビルドではメッセージが省かれ、`NG0407` だけが出ます。開発モードの文は「Angular was not able to inject a renderer (RendererFactory2). Likely this is due to a broken DI hierarchy. ...」でした（Node の記録）。

同じ組み合わせを Node で 22.1.6 と 22.2.6 の開発モードでも走らせ、ページの表と同じ値になることを確かめました（記録の生成物は `dyn-factory-create.data.ts`）。

> [!WARNING]
> **ハマりどころ**
>
> `Injector.create({ providers, parent: this.injector })` のように、**コンポーネントの中で取った `Injector` を親にする**のは安全です（DEMO の最後から 2 行目）。親が `NodeInjector` なので、2 つ目の手順と同じく印が届きます。危ないのは `EnvironmentInjector` や `ApplicationRef.injector` を親にした `Injector.create` を `elementInjector` に渡すときで、そのときは `environmentInjector` で上書きしたつもりの値が使われません。

## 3. ホストの要素：探すか、作るか

📄 `angular/packages/core/src/render3/component_ref.ts` L320–328 （▶ の行: 324, 327）

```ts
320 │   private createComponentRef(
321 │     environment: LViewEnvironment,
322 │     rootViewInjector: Injector,
323 │     projectableNodes?: any[][] | undefined,
324 ▶     rootSelectorOrNode?: any,
325 │     directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[],
326 │     componentBindings?: Binding[],
327 ▶     hostElementNamespace?: string | null,
328 │     allowNonStandaloneDirectives?: boolean,
```

`createComponentRef` は、324 行目の `rootSelectorOrNode`（関数の `createComponent` なら `hostElement`）があれば `locateHostElement` でそれを使い（[boot-application-ref](../boot/10-boot-application-ref.md) の 4 節）、無ければ `createHostElement` で新しく作ります。作るときのタグ名は `inferTagNameFromDefinition` が「最初の selector のタグ名、無ければ `div`」で決めます（[testing-create-component](../testing/05-testing-create-component.md) の 4 節）。この関数は 68f3c65314b（2025-07）で TestBed からも使えるように非公開の名前で出されました。327 行目の `hostElementNamespace` が、2ab5ff56ded で足された 3 つ目の材料です。

📄 `angular/packages/core/test/acceptance/create_component_spec.ts` L202–226 （▶ の行: 203, 215, 218–219, 222）

```ts
202 │   it('should create a host element if none provided', () => {
203 ▶     const selector = 'standalone-comp';
204 │     @Component({
205 │       selector,
206 │       template: 'Hello {{ name }}!',
207 │ 
208 │       changeDetection: ChangeDetectionStrategy.Eager,
209 │     })
210 │     class StandaloneComponent {
211 │       name = 'Angular';
212 │     }
213 │ 
214 │     const environmentInjector = TestBed.inject(EnvironmentInjector);
215 ▶     const componentRef = createComponent(StandaloneComponent, {environmentInjector});
216 │     componentRef.changeDetectorRef.detectChanges();
217 │ 
218 ▶     const hostElement = (componentRef.hostView as EmbeddedViewRef<StandaloneComponent>)
219 ▶       .rootNodes[0];
220 │ 
221 │     // A host element that matches component's selector.
222 ▶     expect(hostElement.tagName.toLowerCase()).toBe(selector);
223 │ 
224 │     expect(hostElement.textContent).toBe('Hello Angular!');
225 │     componentRef.destroy();
226 │   });
```

215 行目、`hostElement` を渡さずに作り、218〜219 行目で `hostView.rootNodes[0]` からホストの要素を取ると、222 行目でタグ名が selector の `standalone-comp` です。作られた要素は**どこにも差し込まれていません**。置くのは呼んだ人の仕事です。

### 2ab5ff56ded：差し込む場所の名前空間を受け継ぐ

📄 `git show 2ab5ff56ded（抜粋）`

```
--- a/packages/core/src/render3/component_ref.ts   （2ab5ff56ded から抜粋）
-function createHostElement(componentDef: ComponentDef<unknown>, renderer: Renderer): RElement {
+function createHostElement(
+  componentDef: ComponentDef<unknown>,
+  renderer: Renderer,
+  hostElementNamespace: string | null,
+): RElement {
   const tagName = inferTagNameFromDefinition(componentDef);
   const namespace =
-    tagName === 'svg' ? SVG_NAMESPACE : tagName === 'math' ? MATH_ML_NAMESPACE : null;
+    tagName === 'svg'
+      ? SVG_NAMESPACE
+      : tagName === 'math'
+        ? MATH_ML_NAMESPACE
+        : hostElementNamespace;
   return createElementNode(renderer, tagName, namespace);

--- a/packages/core/src/linker/view_container_ref.ts
       directives,
       bindings,
+      this._getHostElementNamespace(),
     );
+  /** Returns the namespace used by nodes inserted at this container's render location. */
+  private _getHostElementNamespace(): string | null {
+    if (this._hostTNode.type & TNodeType.Element) {
+      const parentTNode = this._hostTNode.parent ?? this._hostLView[T_HOST];
+      // SVG foreignObject elements are namespace integration points: ...
+      if (parentTNode !== null && parentTNode.type & TNodeType.Element &&
+          typeof parentTNode.value === 'string' &&
+          parentTNode.value.toLowerCase() === 'foreignobject') {
+        return null;
+      }
+      return parentTNode?.namespace ?? null;
+    }
+    return this._hostTNode.namespace;
+  }
```

名前空間（namespace）は、同じ `<g>` というタグでも「SVG の g」か「ただの HTML の要素」かを分ける URI です。`createElementNS` に渡す値で決まり、SVG の名前空間でないと描かれません。修正の前は、タグ名が `svg` か `math` のときだけ名前空間を付け、それ以外は `null`（HTML）でした。修正のあとは、ViewContainerRef が差し込む場所の名前空間を調べて渡します。`<ng-container>` のコンテナならその名前空間、要素のコンテナならその親の名前空間、ただし親が `<foreignObject>`（SVG の中で HTML に戻る場所）なら HTML です。

📄 `angular/packages/core/test/acceptance/view_container_ref_spec.ts` L312–339 （▶ の行: 314, 322, 334, 337–338）

```ts
312 │       it('should inherit the namespace of the insertion context for dynamic host elements', () => {
313 │         @Component({
314 ▶           selector: 'g[dynamic-group]',
315 │           template: '<svg:text>SVG content</svg:text>',
316 │ 
317 │           changeDetection: ChangeDetectionStrategy.Eager,
318 │         })
319 │         class SvgGroupComp {}
320 │ 
321 │         @Component({
322 ▶           template: '<svg><ng-container #container></ng-container></svg>',
323 │ 
324 │           changeDetection: ChangeDetectionStrategy.Eager,
325 │         })
326 │         class TestComp {
327 │           @ViewChild('container', {read: ViewContainerRef}) container!: ViewContainerRef;
328 │         }
329 │ 
330 │         TestBed.configureTestingModule({imports: [TestComp, SvgGroupComp]});
331 │         const fixture = TestBed.createComponent(TestComp);
332 │         fixture.detectChanges();
333 │ 
334 ▶         const componentRef = fixture.componentInstance.container.createComponent(SvgGroupComp);
335 │         fixture.detectChanges();
336 │ 
337 ▶         expect(componentRef.location.nativeElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
338 ▶         expect(componentRef.location.nativeElement.tagName.toLowerCase()).toBe('g');
339 │       });
```
*view\_container\_ref\_spec.ts の describe('element namespaces')（:240）に足された 1 本目。*

322 行目の `<svg>` の中の `<ng-container>` を ViewContainerRef にして、314 行目の `g[dynamic-group]` を 334 行目で作ると、337 行目でホストの要素が SVG の名前空間になります。続く `it('should use the HTML namespace inside an SVG foreignObject')`（:341）が `foreignObject` の場合を固めています。

📄 `ターミナル（../angular）`

```
$ git log --all --oneline --grep="preserve namespace for dynamic component hosts"
9a8e4826b9d fix(core): preserve namespace for dynamic component hosts
2ab5ff56ded fix(core): preserve namespace for dynamic component hosts
$ git tag --contains 2ab5ff56ded | sort -V | head -1
v22.2.0-next.4
$ git tag --contains 9a8e4826b9d | sort -V | head -1
v22.1.4
```

2ab5ff56ded は 22.2 の系列のコミットですが、同じ題の 9a8e4826b9d が 22.1 の系列に入っていて、v22.1.4 から含まれます。このサイトの 22.1.6 にも入っているので、ページの上の本物で確かめられます。

> **🧪 DEMO — ホストの要素のタグ名と名前空間**
>
> 上の 7 行は関数の `createComponent` で `hostElement` を渡さずに作り、上の枠に置いてから読みます。下の行は、下の SVG の中の 2 か所（`<ng-container #svgVcr>` と、`<foreignObject>` の中の `<div #foVcr>`）の ViewContainerRef から作ります。読んだらすぐ `destroy` します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dyn-factory-create)

1. **selector から属性と class も付く**

   `'button[dfc-x].dfc-big'` は `<button dfc-x class="dfc-big">` になり、`'.dfc-class-only'` はタグ名が無いので `div` に class だけが付きます。属性と class は、ルートの `TView` を作るときに最初の selector から取り出したものです（[boot-application-ref](../boot/10-boot-application-ref.md) の 3 節の `createRootTView`）。selector の無いコンポーネントは、コンパイラが入れた `ng-component` になります。
2. **関数の createComponent は名前空間を渡さない**

   `'g[dfc-g]'` を関数で作ると、名前空間は XHTML で、`tagName` が大文字の `G` になります（HTML の要素の `tagName` は大文字）。関数の `createComponent` は `create` に 6 つしか渡さないので（[第 1 回](01-dyn-entry-points.md)）、7 番目の `hostElementNamespace` はいつも無しです。SVG の中に置きたいなら、`document.createElementNS('http://www.w3.org/2000/svg', 'g')` で作った要素を `hostElement` に渡します。
3. **ViewContainerRef は差し込む場所に合わせる**

   `<svg>` の中の `<ng-container>` から作ると、`g` も `div` も `ng-component` も SVG の名前空間になります。`<foreignObject>` の中の `<div>` から作ると XHTML です。`svg` と `math` の 2 つのタグ名だけは、どこに置いても自分の名前空間です。

> [!NOTE]
> **さらに深く**
>
> 2ab5ff56ded が直したのは**ホストの要素だけ**です。ホストのコンポーネントのテンプレートの中の要素は、コンパイラが名前空間を決めます。テンプレートの一番外が `<svg>` でないコンポーネントでは、`svg:` を付けない `<rect>` は HTML の要素として扱われます。開いている #10404（「SVG の中に g\[test\] の selector のコンポーネントを動的に足すと問題がある」）と、その重複として閉じられた #66893 は、この子の側の話を含んでいます。
>
> 📄 `記録（Node）`
>
> ```
> // 記録スクリプトで selector: 'g[dyn-g]', template: '<svg:circle r="1"></svg:circle><rect></rect>' を JIT でコンパイルしたとき
> NG0304: 'rect' is not a known element (used in the 'C4' component template):
> // ViewContainerRef を <svg> の中に置いて作っても、子の名前空間はこうなる（22.1.6 と 22.2.6 で同じ）
> g    → http://www.w3.org/2000/svg
>   circle（svg: を付けた）→ http://www.w3.org/2000/svg
>   rect（付けない）      → http://www.w3.org/1999/xhtml
> ```

## 4. shadow root の下で作るとき（cdda51a3b2f）

cdda51a3b2f（2026-03-30）は、shadow root の下でアプリを起動できるようにしたコミットで、`createComponentRef` にも行を足しています。ホストの要素の `getRootNode()` が `ShadowRoot` ならそこを、文書につながっていればその `head` を、スタイルを入れる先として `SharedStylesHost` に登録します（行は [domr-shared-styles](../domr/07-domr-shared-styles.md) で引用）。コミットの本文によると、登録した先の参照の数を数えていないので、壊すときに外すのは shadow root のときだけで、文書の `head` は外しません。3 節の「どこにも差し込まれていない」要素は `getRootNode()` が自分自身なので、代わりの文書の `head` に登録されます。

## ここまでの呼び出し

- 👤 `createComponent(Cmp, { environmentInjector, elementInjector })` / `vcr.createComponent(Cmp)` — 第 1 回
  - `ComponentFactory.create(...)` — component\_ref.ts L266 — *setActiveConsumer(null)*
    - `createRootViewInjector` → `new ChainedInjector(elementInjector, env)` — ngmodule-standalone-imports
    - `createRootLViewEnvironment` — RendererFactory2 が無ければ NG0407
    - `tracingService.componentCreate(name, fn)` — component\_ref.ts L291 — *あるときだけ*
      - `createComponentRef(..., hostElementNamespace)` — component\_ref.ts L320
        - `locateHostElement` か `createHostElement(def, renderer, ns)` — boot-application-ref / 2ab5ff56ded
        - `createLView` → `directiveHostFirstCreatePass` → `renderView` — boot-application-ref
  - `inject(TOKEN)`（子のコンストラクタ） — NodeInjector → lView\[INJECTOR\]
    - `ChainedInjector.get` → 要素の側（印つき）→ 環境 — chained\_injector.ts L32〜38

## テストと直し方

この章の spec は 3 つのファイルにあります。`create_component_spec.ts` の `describe('createComponent')`（:41）の直下の 7 本（注入器は :129・:151、ホストの要素は :202・:228）、`view_container_ref_spec.ts` の `describe('ViewContainerRef')`（:54）→ `describe('create')`（:90）→ `describe('element namespaces')`（:240）の 4 本、`tracing_spec.ts` の `describe('TracingService')`（:20）→ `it('should trace component creations')`（:137）です。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
  --test_arg=--filter="^createComponent should"
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
  --test_arg=--filter="ViewContainerRef create element namespaces"
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
  --test_arg=--filter="TracingService should trace component creations"
```

📄 `出力（抜粋。2026-11-15 に実行）`

```
Ran 7 of 2693 specs
7 specs, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.3s
Ran 4 of 2693 specs
4 specs, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.3s
Ran 1 of 2693 specs
1 spec, 0 failures
//packages/core/test/acceptance:acceptance                               PASSED in 1.3s
```

1. **本数の確かめ方**

   `"^createComponent should"` は `describe('createComponent')` の直下だけに合い、中の `describe`（`attaching directives ...` など）には合わないので 7 本です。`element namespaces` の 4 本は、`runTestWithSelectors`（:241）が 2 回呼ばれて作る 2 本と、2ab5ff56ded が足した 2 本です。
2. **直すとしたら**

   注入器の順は `chained_injector.ts` の `ChainedInjector.get` と、`component_ref.ts` の `createRootViewInjector` です。2 節の DEMO の「`Injector.create({ parent: 環境の注入器 })` を `elementInjector` に渡す」組み合わせを固める spec は今はありません。足すなら `create_component_spec.ts` の :151 の隣です。名前空間は `component_ref.ts` の `createHostElement` と、ViewContainerRef の `_getHostElementNamespace`（[第 5 回](05-dyn-vcr-host.md)のファイル）で、spec は :240 の `describe` に足します。

## 聞かれそうな質問

**Q. elementInjector と environmentInjector の両方に同じトークンがあったら、どちらが使われますか？**

要素の側です。`ChainedInjector` は先に要素の側に聞き、見つかれば 32 行目の条件で返します。spec の 199 行目が `ElementInjector(A)` を固めています。要素の側の注入器が「環境の注入器を親に持つ `Injector.create`」のときは、親の方まで要素の側として調べられるので、`environmentInjector` で上書きしたつもりの値も負けます（2 節の DEMO）。

**Q. NG0407 はどんなときに出ますか？**

ルートのビューの注入器（`ChainedInjector`）から `RendererFactory2` が引けないときです。ふつうはアプリの根の注入器にあるので、親の無い `createEnvironmentInjector([], null)` のように、アプリの根につながっていない注入器を `environmentInjector` に渡したときに出ます（DEMO の最後の行）。

**Q. SVG の中に動的にコンポーネントを置くには？**

`<svg>` の中に ViewContainerRef を置いて `vcr.createComponent` を使えば、ホストの要素は SVG の名前空間になります（2ab5ff56ded、22.1.4 から。spec の 337 行目）。関数の `createComponent` なら、`createElementNS` で作った要素を `hostElement` に渡します。どちらの場合も、テンプレートの中の SVG の要素には `svg:` を付けます。

**Q. createComponent の中で signal を読むと、外の effect の依存になりますか？**

なりません。`create` の最初で `setActiveConsumer(null)` にし、316 行目の `finally` で戻すので、その間に子のコンストラクタなどが読んだ signal は、外の `computed` や `effect` に記録されません。

**Q. TracingService の componentCreate には何が届きますか？**

`ComponentFactory.create` で作るルートのコンポーネント（component\_ref.ts 291 行目）と、テンプレートの中でホストの要素にコンポーネントが当たったとき（element.ts 122 行目）の両方の名前です。spec の 170 行目では `App` のあとに子と孫が、記録では `Traced` のあとに `Leaf` が届きました。

## 読み終えて

- `create` は signal の読み取りを外してから、注入器 → 環境 → （tracing で包んで）`createComponentRef` の順に進む
- `ChainedInjector` は要素の側に「見つからなければ印を返して」と頼む。内側にも `ChainedInjector` があれば印がそのまま戻り、環境の上書きが効く
- 要素の側に環境の注入器を親に持つ `Injector.create` を渡すと、その親が先に答える
- ホストの要素は selector の最初のタグ名で作り、ViewContainerRef から作るときだけ差し込む場所の名前空間を受け継ぐ（2ab5ff56ded、22.1.4 から）
- 関数の `createComponent` で作ったホストの要素はどこにも差し込まれない。置き場所は呼んだ人が決める

---

← 前: [2 つの入口：createComponent 関数と ViewContainerRef.createComponent](01-dyn-entry-points.md)  
次: [directives の選択肢：作るときにディレクティブを当てる](03-dyn-directives.md) →
