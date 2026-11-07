[目次](../README.md) › [DOM レンダラーとイベントの内側](README.md) › 第 5 回 / 全 20 回

# 属性とプロパティ：ɵɵattribute・ɵɵproperty から setAttribute・setProperty へ

> \[attr.x\]・\[x\]・x="…" がコンパイラの出力（ɵɵattribute・ɵɵdomProperty / ɵɵproperty / ɵɵariaProperty・consts）の段階から別の道を通る仕組み。null で removeAttribute に分かれる setElementAttribute、静的な属性を書く setUpAttributes、名前空間つきの属性（xlink:href）を NAMESPACE\_URIS で setAttributeNS にする行、DefaultDomRenderer2 の setAttribute・removeAttribute・setProperty と、@ で始まる名前を止める checkNoSyntheticProp。既定で出なくなった ng-reflect-\* が input に入れたときだけ付く行。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/domr-attributes-properties)

---

テンプレートに `title="…"`・`[title]="…"`・`[attr.title]="…"` と書くと、どれも見た目は「title が付く」です。でも中では、**コンパイラが出す命令の段階から別の道**を通り、最後に `DefaultDomRenderer2` の `setAttribute`・`removeAttribute`・`setProperty` のどれかに届きます。この章では 3 つの道を 1 本ずつ行番号でたどり、`null` を入れると属性が消える行、`xlink:href` のような名前空間つきの属性、`@` で始まる名前で止まる行、開発モードの `ng-reflect-*` がいつ付くのかを確かめます。

読む対象は core の `render3/instructions/attribute.ts`・`dom_property.ts`・`aria_property.ts`・`shared.ts`・`ng_reflect.ts` と、platform-browser の `dom/dom_renderer.ts` です。命令を選ぶコンパイラの側（`reify.ts`・`binding_specialization.ts`）は 1 節で少しだけ読みます。

1. [1. 全体像](01-domr-overview.md)
2. [2. Renderer2 の約束](02-domr-renderer-api.md)
3. [3. DomRendererFactory2](03-domr-renderer-factory.md)
4. [4. 要素とテキスト](04-domr-default-renderer.md)
5. **5. 属性とプロパティ**（この章）
6. [6. カプセル化](06-domr-encapsulation.md)
7. [7. SharedStylesHost](07-domr-shared-styles.md)
8. [8. CSS 変数の名前空間](08-domr-css-var-namespacing.md)
9. [9. クラスとスタイル](09-domr-styling-overview.md)
10. [10. 優先順位のリスト](10-domr-style-binding-list.md)
11. [11. 値を決めて書く](11-domr-styling-apply.md)
12. [12. \[class\] と \[style\]](12-domr-styling-maps.md)
13. [13. EventManager](13-domr-event-manager.md)
14. [14. listen](14-domr-listen.md)
15. [15. キーのイベント](15-domr-key-events.md)
16. [16. 自分のプラグイン](16-domr-custom-plugin.md)
17. [17. サニタイズ](17-domr-sanitization.md)
18. [18. 信頼の印](18-domr-trusted-types.md)
19. [19. Title と Meta](19-domr-title-meta.md)
20. [20. issue と PR を読む](20-domr-issues.md)

## 1. 3 つの書き方は、コンパイラの出力でもう分かれている

まず結果から見ます。次のテンプレートをこのサイトと同じ `@angular/compiler-cli` 22.1.6 の `ngc` でコンパイルした出力です （`imports` の無いコンポーネント。出力のうち関係する行だけ）。

📄 `入力のテンプレート`

```
<p title="静的" [title]="t()" [attr.title]="t()" [attr.aria-label]="n()" [tabindex]="1"></p>
<svg><a xlink:href="#a" [attr.xlink:href]="h()"></a></svg>
```

📄 `ngc の出力（抜粋）`

```
consts: [["title", "\u9759\u7684", 3, "title", "tabindex"], [0, "xlink", "href", "#a"]],
template: function TAttr_Template(rf, ctx) {
  if (rf & 1) {
    i0.ɵɵdomElement(0, "p", 0);
    i0.ɵɵnamespaceSVG();
    i0.ɵɵdomElementStart(1, "svg");
    i0.ɵɵdomElement(2, "a", 1);
    i0.ɵɵdomElementEnd();
  }
  if (rf & 2) {
    i0.ɵɵdomProperty("title", ctx.t())("tabIndex", 1);
    i0.ɵɵattribute("title", ctx.t())("aria-label", ctx.n());
    i0.ɵɵadvance(2);
    i0.ɵɵattribute("href", ctx.h(), i0.ɵɵsanitizeUrl, "xlink");
  }
}
```

- **静的な `title="静的"`** は命令になりません。`consts[0]` の先頭の `"title", "\u9759\u7684"`（「静的」を `\u` でエスケープしたもの）という組になり、要素を作るときに書かれます（5 節）。その後ろの `3, "title", "tabindex"` の `3` は `AttributeMarker.Bindings` で、「この名前のバインディングがある」というディレクティブ照合用の名前だけの並びです。
- **`[title]`** は `ɵɵdomProperty("title", …)` になります。`[tabindex]` は名前が `"tabIndex"` に変わっています。
- **`[attr.title]`** と **`[attr.aria-label]`** は `ɵɵattribute` です。
- **`xlink:href`** は、静的なら `consts[1]` の `0, "xlink", "href", "#a"`（`0` は `AttributeMarker.NamespaceURI`）、バインディングなら `ɵɵattribute` の 4 つ目の引数に `"xlink"` が付きます。名前空間は URI ではなく、`xlink` という短い名前のまま運ばれます。

同じ `[title]` でも、`<p>` に合うディレクティブを 1 つ import すると出力が変わります（`<p d …>` とディレクティブ `[d]` を足したもの）。

📄 `ngc の出力（ディレクティブが合う要素。抜粋）`

```
consts: [["d", "", 3, "aria-label", "title", "innerHTML"], [3, "href"]],
  if (rf & 2) {
    i0.ɵɵariaProperty("aria-label", ctx.t());
    i0.ɵɵproperty("title", ctx.t())("innerHTML", ctx.t(), i0.ɵɵsanitizeHtml);
    i0.ɵɵattribute("title", ctx.t())("href", ctx.t());
    i0.ɵɵadvance();
    i0.ɵɵproperty("href", ctx.t(), i0.ɵɵsanitizeUrl);
  }
```

今度は `ɵɵproperty` と `ɵɵariaProperty` です。違いを生むのはコンパイラの次の行です。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/reify.ts` L811–842 （▶ の行: 820, 822, 838–841）

```ts
811 │ /**
812 │  * Reifies a DOM property binding operation.
813 │  *
814 │  * This is an optimized version of {@link reifyProperty} that avoids unnecessarily trying to bind
815 │  * to directive inputs at runtime for views that don't import any directives.
816 │  *
817 │  * @param op A property binding operation.
818 │  * @returns A statement to update the property at runtime.
819 │  */
820 ▶ function reifyDomProperty(op: ir.DomPropertyOp | ir.PropertyOp): ir.UpdateOp {
821 │   return ng.domProperty(
822 ▶     DOM_PROPERTY_REMAPPING.get(op.name) ?? op.name,
823 │     op.expression,
824 │     op.sanitizer,
825 │     op.sourceSpan,
826 │   );
827 │ }
828 │ 
829 │ /**
830 │  * Reifies a property binding operation.
831 │  *
832 │  * The returned statement attempts to bind to directive inputs before falling back to a DOM
833 │  * property.
834 │  *
835 │  * @param op A property binding operation.
836 │  * @returns A statement to update the property at runtime.
837 │  */
838 ▶ function reifyProperty(op: ir.PropertyOp): ir.UpdateOp {
839 ▶   return isAriaAttribute(op.name)
840 ▶     ? ng.ariaProperty(op.name, op.expression, op.sourceSpan)
841 ▶     : ng.property(op.name, op.expression, op.sanitizer, op.sourceSpan);
842 │ }
```

`imports` にディレクティブが無いビューは `DomOnly` というモードでコンパイルされ（何で決まるかは [standalone-used-only](../standalone/04-standalone-used-only.md)）、プロパティのバインディングは 820 行目の `reifyDomProperty` に行きます。822 行目で `tabindex` → `tabIndex` などの名前の付け替えをコンパイル時に済ませてしまいます。ディレクティブがありうるビューは 838 行目の `reifyProperty` で、839 行目で名前が `aria-` で始まれば `ɵɵariaProperty`、そうでなければ 841 行目の `ɵɵproperty` です。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/binding_specialization.ts` L97–117 （▶ の行: 102, 105, 107）

```ts
 97 │         case ir.BindingKind.Property:
 98 │         case ir.BindingKind.LegacyAnimation:
 99 │           // Convert a property binding targeting an ARIA attribute (e.g. [aria-label]) into an
100 │           // attribute binding when we know it can't also target an input. Note that a `Host` job is
101 │           // always `DomOnly`, so this condition must be checked first.
102 ▶           if (job.mode === TemplateCompilationMode.DomOnly && isAriaAttribute(op.name)) {
103 │             ir.OpList.replace<ir.UpdateOp>(
104 │               op,
105 ▶               ir.createAttributeOp(
106 │                 op.target,
107 ▶                 /* namespace= */ null,
108 │                 op.name,
109 │                 op.expression,
110 │                 op.securityContext,
111 │                 /* isTextAttribute= */ false,
112 │                 op.isStructuralTemplateAttribute,
113 │                 op.templateKind,
114 │                 op.i18nMessage,
115 │                 op.sourceSpan,
116 │               ),
117 │             );
```

`DomOnly` の `[aria-label]` は、もっと前の段階で属性のバインディングに書き換えられます。102 行目、`DomOnly` で名前が ARIA なら、105 行目で `createAttributeOp`（`[attr.aria-label]` と同じもの）に置き換えます。ディレクティブの input に当たることが無いと分かっているからです。この章のデモのコンポーネントも `imports` が無いので、`DomOnly` の出力です。

## 2. \[attr.x\] の道：ɵɵattribute → setElementAttribute → setAttribute

📄 `angular/packages/core/src/render3/instructions/attribute.ts` L26–42 （▶ の行: 33–34, 36–38）

```ts
26 │ export function ɵɵattribute(
27 │   name: string,
28 │   value: any,
29 │   sanitizer?: SanitizerFn | null,
30 │   namespace?: string,
31 │ ): typeof ɵɵattribute {
32 │   const lView = getLView();
33 ▶   const bindingIndex = nextBindingIndex();
34 ▶   if (bindingUpdated(lView, bindingIndex, value)) {
35 │     const tView = getTView();
36 ▶     const tNode = getSelectedTNode();
37 ▶     elementAttributeInternal(tNode, lView, name, value, sanitizer, namespace);
38 ▶     ngDevMode && storePropertyBindingMetadata(tView.data, tNode, 'attr.' + name, bindingIndex);
39 │   }
40 │ 
41 │   return ɵɵattribute;
42 │ }
```

33〜34 行目は、どのバインディングの命令にもある「前回と同じ値なら何もしない」の部分です（`bindingUpdated` は [ivy-update-instructions](../ivy/10-ivy-update-instructions.md)）。36 行目で、直前の `ɵɵadvance` が選んだ要素の TNode を取り、37 行目で `elementAttributeInternal` に渡します。38 行目の `storePropertyBindingMetadata` は開発モードだけの記録で、名前に `attr.` を付けて残します（`ExpressionChangedAfterItHasBeenChecked` のエラー文で使う名前）。

📄 `angular/packages/core/src/render3/instructions/shared.ts` L499–519 （▶ の行: 509, 511–513, 517–518）

```ts
499 │ export function elementAttributeInternal(
500 │   tNode: TNode,
501 │   lView: LView,
502 │   name: string,
503 │   value: any,
504 │   sanitizer: SanitizerFn | null | undefined,
505 │   namespace: string | null | undefined,
506 │ ) {
507 │   if (ngDevMode) {
508 │     assertNotSame(value, NO_CHANGE as any, 'Incoming value should never be NO_CHANGE.');
509 ▶     assertTNodeType(
510 │       tNode,
511 ▶       TNodeType.Element,
512 ▶       `Attempted to set attribute \`${name}\` on a container node. ` +
513 ▶         `Host bindings are not valid on ng-container or ng-template.`,
514 │     );
515 │   }
516 │ 
517 ▶   const element = getNativeByTNode(tNode, lView) as RElement;
518 ▶   setElementAttribute(lView[RENDERER], element, namespace, tNode.value, name, value, sanitizer);
519 │ }
```

509〜514 行目は開発モードの確認で、TNode が要素でなければ止まります。`<ng-container [attr.x]>` のように DOM の要素が無いところへ属性を書こうとすると、512〜513 行目のメッセージになります。517 行目で LView から本物の要素を取り、518 行目で `lView[RENDERER]`（このビューのレンダラー）と一緒に `setElementAttribute` へ渡します。

📄 `angular/packages/core/src/render3/instructions/shared.ts` L521–542 （▶ の行: 530–531, 533, 535, 537–538, 540）

```ts
521 │ export function setElementAttribute(
522 │   renderer: Renderer,
523 │   element: RElement,
524 │   namespace: string | null | undefined,
525 │   tagName: string | null,
526 │   name: string,
527 │   value: any,
528 │   sanitizer: SanitizerFn | null | undefined,
529 │ ) {
530 ▶   if (value == null) {
531 ▶     if (sanitizer != null) {
532 │       // Execute sanitizer to enforce security controls (e.g., neutralizing iframe)
533 ▶       sanitizer(value, tagName || '', name);
534 │     }
535 ▶     renderer.removeAttribute(element, name, namespace);
536 │   } else {
537 ▶     const strValue =
538 ▶       sanitizer == null ? renderStringify(value) : sanitizer(value, tagName || '', name);
539 │ 
540 ▶     renderer.setAttribute(element, name, strValue as string, namespace);
541 │   }
542 │ }
```

1. **530 行目：値が `null` か `undefined` なら消す**

   `==` なので `null` と `undefined` の両方です。535 行目で `renderer.removeAttribute` を呼びます。空文字 `''` や `false` は消えずに、次の分かれで文字列として書かれます。
2. **531〜533 行目：消すときもサニタイザは呼ぶ**

   `sanitizer` があるときは、値が `null` でも 533 行目で呼びます。コメントのとおり、`<iframe>` の属性を確かめる関数のように「呼ばれること」自体に意味があるものがあるためです（[第 17 回](17-domr-sanitization.md)）。
3. **537〜538 行目：文字列にする**

   サニタイザが無ければ `renderStringify` で文字列にします。あればサニタイザの戻り値をそのまま使います（`[attr.href]` に `javascript:` を入れると `unsafe:` が付くのはここ）。
4. **540 行目：名前空間と一緒に `setAttribute`**

   4 つ目の引数の `namespace` は、1 節の出力の `"xlink"` です。名前空間の無い属性では `undefined` が渡ります（デモの記録の `setAttribute(<p>, "title", "…", undefined)`）。

### DefaultDomRenderer2 の setAttribute と removeAttribute

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L402–428 （▶ の行: 403–405, 407, 409, 412, 418, 420, 422, 425）

```ts
402 │   setAttribute(el: any, name: string, value: string, namespace?: string): void {
403 ▶     if (namespace) {
404 ▶       name = namespace + ':' + name;
405 ▶       const namespaceUri = NAMESPACE_URIS[namespace];
406 │       if (namespaceUri) {
407 ▶         el.setAttributeNS(namespaceUri, name, value);
408 │       } else {
409 ▶         el.setAttribute(name, value);
410 │       }
411 │     } else {
412 ▶       el.setAttribute(name, value);
413 │     }
414 │   }
415 │ 
416 │   removeAttribute(el: any, name: string, namespace?: string): void {
417 │     if (namespace) {
418 ▶       const namespaceUri = NAMESPACE_URIS[namespace];
419 │       if (namespaceUri) {
420 ▶         el.removeAttributeNS(namespaceUri, name);
421 │       } else {
422 ▶         el.removeAttribute(`${namespace}:${name}`);
423 │       }
424 │     } else {
425 ▶       el.removeAttribute(name);
426 │     }
427 │   }
428 │ 
```

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L41–46 （▶ の行: 43）

```ts
41 │   'svg': 'http://www.w3.org/2000/svg',
42 │   'xhtml': 'http://www.w3.org/1999/xhtml',
43 ▶   'xlink': 'http://www.w3.org/1999/xlink',
44 │   'xml': 'http://www.w3.org/XML/1998/namespace',
45 │   'xmlns': 'http://www.w3.org/2000/xmlns/',
46 │   'math': 'http://www.w3.org/1998/Math/MathML',
```

名前空間があるとき、404 行目で名前を `xlink:href` のように組み立て、405 行目で短い名前から URI を引きます。表 `NAMESPACE_URIS` は `svg`・`xhtml`・`xlink`（43 行目）・`xml`・`xmlns`・`math` の 6 つです。表にあれば 407 行目の `setAttributeNS`、無ければ 409 行目で `unknown:name` という名前のただの属性として書きます。

`removeAttribute` は名前の扱いが逆向きです。420 行目の `removeAttributeNS(namespaceUri, name)` にはローカル名（`href`）だけを渡し、表に無い名前空間は 422 行目で `prefix:name` の名前で消します。`setAttributeNS` は修飾名（`xlink:href`）を、`removeAttributeNS` はローカル名を受け取る、という DOM の API の違いに合わせた形です。

> [!WARNING]
> **ハマりどころ**
>
> `createElement` は名前空間に URI を渡されても動きますが（表に無ければ渡された文字列をそのまま URI として使う `NAMESPACE_URIS[namespace] || namespace`）、`setAttribute` にはその逃げ道がありません。URI を渡すと 405 行目の表引きが外れ、409 行目で `el.setAttribute('http://www.w3.org/1999/xlink:href', …)` になり、名前に `/` を含むので DOM が `InvalidCharacterError` を投げます（ヘッドレスの Chrome 156 で確認）。`createElement` の TODO のコメントが「名前空間の扱いを揃えるべき」と書いている不揃いです （`createElement` は [第 4 回](04-domr-default-renderer.md)）。コンパイラが出す命令は 1 節のとおり短い名前なので、テンプレートから来る呼び出しでは起きません。

## 3. \[aria-x\] の道：input が無ければ属性

📄 `angular/packages/core/src/render3/instructions/aria_property.ts` L36–56 （▶ の行: 42, 44–46, 50）

```ts
36 │ export function ɵɵariaProperty<T>(name: string, value: T): typeof ɵɵariaProperty {
37 │   const lView = getLView();
38 │   const bindingIndex = nextBindingIndex();
39 │   if (bindingUpdated(lView, bindingIndex, value)) {
40 │     const tView = getTView();
41 │     const tNode = getSelectedTNode();
42 ▶     const hasSetInput = setAllInputsForProperty(tNode, tView, lView, name, value);
43 │ 
44 ▶     if (hasSetInput) {
45 ▶       isComponentHost(tNode) && markDirtyIfOnPush(lView, tNode.index);
46 ▶       ngDevMode && setNgReflectProperties(lView, tView, tNode, name, value);
47 │     } else {
48 │       ngDevMode && assertTNodeType(tNode, TNodeType.Element);
49 │       const element = getNativeByTNode(tNode, lView) as RElement;
50 ▶       setElementAttribute(lView[RENDERER], element, null, tNode.value, name, value, null);
51 │     }
52 │ 
53 │     ngDevMode && storePropertyBindingMetadata(tView.data, tNode, name, bindingIndex);
54 │   }
55 │   return ɵɵariaProperty;
56 │ }
```

ディレクティブがありうるビューの `[aria-label]` は、この命令になります。42 行目で、まず同じ名前の input を持つディレクティブを探して値を入れます。1 つでも入れば（44 行目）DOM には書かず、OnPush のコンポーネントなら 45 行目で dirty にします。入らなかったときだけ、50 行目で 2 節と同じ `setElementAttribute` を 名前空間 `null`・サニタイザ `null` で呼びます。つまり `[aria-label]` は **DOM のプロパティ（`el.ariaLabel`）ではなく属性**として書かれます。

この形は 2025 年の 2 つのコミットで決まりました。`4138aca91fe`（ARIA のプロパティのバインディングを属性として書く。#62630）と、`f008045dedc`（input に当たるときは属性に書き換えない。#63925）です。

## 4. \[x\] の道：ɵɵdomProperty / ɵɵproperty → setDomProperty → setProperty

📄 `angular/packages/core/src/render3/instructions/dom_property.ts` L33–47 （▶ の行: 40, 42–43）

```ts
33 │ export function ɵɵdomProperty<T>(
34 │   propName: string,
35 │   value: T,
36 │   sanitizer?: SanitizerFn | null,
37 │ ): typeof ɵɵdomProperty {
38 │   const lView = getLView();
39 │   const bindingIndex = nextBindingIndex();
40 ▶   if (bindingUpdated(lView, bindingIndex, value)) {
41 │     const tView = getTView();
42 ▶     const tNode = getSelectedTNode();
43 ▶     setDomProperty(tNode, lView, propName, value, lView[RENDERER], sanitizer);
44 │     ngDevMode && storePropertyBindingMetadata(tView.data, tNode, propName, bindingIndex);
45 │   }
46 │   return ɵɵdomProperty;
47 │ }
```

`DomOnly` のビューで出る `ɵɵdomProperty` は、43 行目でいきなり `setDomProperty` を呼びます。input を探す手間がありません。ディレクティブがありうるビューの `ɵɵproperty` は、input を探してから同じところへ来ます。

📄 `angular/packages/core/src/render3/instructions/property.ts` L45–49 （▶ の行: 48）

```ts
45 │   if (bindingUpdated(lView, bindingIndex, value)) {
46 │     const tView = getTView();
47 │     const tNode = getSelectedTNode();
48 ▶     setPropertyAndInputs(tNode, lView, propName, value, lView[RENDERER], sanitizer);
49 │     ngDevMode && storePropertyBindingMetadata(tView.data, tNode, propName, bindingIndex);
```

📄 `angular/packages/core/src/render3/instructions/shared.ts` L260–266 （▶ の行: 260, 262, 264–265）

```ts
260 ▶   const hasSetInput = setAllInputsForProperty(tNode, tView, lView, propName, value);
261 │ 
262 ▶   if (hasSetInput) {
263 │     isComponentHost(tNode) && markDirtyIfOnPush(lView, tNode.index);
264 ▶     ngDevMode && setNgReflectProperties(lView, tView, tNode, propName, value);
265 ▶     return; // Stop propcessing if we've matched at least one input.
266 │   }
```

`ɵɵproperty` の 48 行目は `setPropertyAndInputs` を呼び、その 260 行目で input を探します。当たれば 265 行目で帰り、DOM には何も書きません。当たらなかったときに名前を付け替えて（`class` → `className` など）`setDomProperty` へ行く残りの行は [ivy-update-instructions](../ivy/10-ivy-update-instructions.md) で読みました。264 行目の `setNgReflectProperties` は 6 節です。

📄 `angular/packages/core/src/render3/instructions/shared.ts` L305–308 （▶ の行: 307–308）

```ts
305 │     // It is assumed that the sanitizer is only added when the compiler determines that the
306 │     // property is risky, so sanitization can be done without further checks.
307 ▶     value = sanitizer != null ? (sanitizer(value, tNode.value || '', propName) as any) : value;
308 ▶     renderer.setProperty(element as RElement, propName, value);
```

`setDomProperty` の最後の 2 行です。307 行目で、コンパイラが危ないと判断したプロパティ（`innerHTML`・`href` など。1 節の 2 つ目の出力の `ɵɵsanitizeHtml`）だけサニタイザを通し、308 行目で `renderer.setProperty` を呼びます。その前の、知らないプロパティを開発モードで止める行は [ngmodule-schemas](../ngmodule/16-ngmodule-schemas.md) で読みました。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L466–475 （▶ の行: 467–470, 474）

```ts
466 │ 
467 ▶     (typeof ngDevMode === 'undefined' || ngDevMode) &&
468 ▶       this.throwOnSyntheticProps &&
469 ▶       checkNoSyntheticProp(name, 'property');
470 ▶     el[name] = value;
471 │   }
472 │ 
473 │   setValue(node: any, value: string): void {
474 ▶     node.nodeValue = value;
475 │   }
```

レンダラーの側は 470 行目の `el[name] = value` の 1 行が本体です。値は文字列にしません。`[tabindex]="0"` なら数の `0`、`[disabled]="true"` なら真偽値の `true` がそのままプロパティに入ります（デモの記録の `setProperty(<p>, "tabIndex", 0)`）。属性が変わるかどうかは DOM のそのプロパティ次第で、`title` や `tabIndex` は属性に映り、`value` は映りません。467〜469 行目は開発モードだけの確認で、次の節の `checkNoSyntheticProp` です。474 行目の `setValue` はテキストの中身を書く別のメソッドで、属性とは関係ありません。

## 5. 静的な属性と、@ で始まる名前

1 節の `consts` に入った静的な属性は、要素を作った直後に `setupStaticAttributes` → `setUpAttributes` が 1 回だけ書きます。配列を前から読む全体の形は [compiler-consts-pure](../compiler/14-compiler-consts-pure.md)、呼ばれる時機は [ivy-create-instructions](../ivy/09-ivy-create-instructions.md) で読みました。ここでは、名前の 1 文字目で道が分かれる 7 行だけを見ます。

📄 `angular/packages/core/src/render3/util/attrs_utils.ts` L63–69 （▶ の行: 66–67, 69）

```ts
63 │       const attrName = value as string;
64 │       const attrVal = attrs[++i];
65 │       // Standard attributes
66 ▶       if (isAnimationProp(attrName)) {
67 ▶         renderer.setProperty(native, attrName, attrVal);
68 │       } else {
69 ▶         renderer.setAttribute(native, attrName, attrVal as string);
```

📄 `angular/packages/core/src/render3/util/attrs_utils.ts` L97–102 （▶ の行: 101）

```ts
 97 │ export function isAnimationProp(name: string): boolean {
 98 │   // Perf note: accessing charCodeAt to check for the first character of a string is faster as
 99 │   // compared to accessing a character at index 0 (ex. name[0]). The main reason for this is that
100 │   // charCodeAt doesn't allocate memory to return a substring.
101 ▶   return name.charCodeAt(0) === CharCode.AT_SIGN;
102 │ }
```

📄 `angular/packages/core/src/render3/util/attrs_utils.ts` L57–60 （▶ の行: 57, 60）

```ts
57 ▶       const namespaceURI = attrs[i++] as string;
58 │       const attrName = attrs[i++] as string;
59 │       const attrVal = attrs[i++] as string;
60 ▶       renderer.setAttribute(native, attrName, attrVal, namespaceURI);
```

静的な属性でも、名前が `@` で始まる（101 行目）ものだけは 67 行目で `setProperty` に回します。`<div @fade>` のような旧アニメーションのトリガーです。それ以外は 69 行目の `setAttribute` です。これは名前空間の無い組の分かれで、`AttributeMarker.NamespaceURI` の印の後ろの組は、57〜59 行目で URI の位置にある短い名前・属性名・値を読み、60 行目で 4 つ目の引数つきの `setAttribute` を呼びます （変数名は `namespaceURI` ですが、中身は 1 節の出力の `"xlink"` です）。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L306–310 （▶ の行: 308, 310）

```ts
306 │   /**
307 │    * By default this renderer throws when encountering synthetic properties
308 ▶    * This can be disabled for example by the AsyncAnimationRendererFactory
309 │    */
310 ▶   throwOnSyntheticProps = true;
```

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L543–549 （▶ の行: 544–546, 548）

```ts
543 │ function checkNoSyntheticProp(name: string, nameKind: string) {
544 ▶   if (name.charCodeAt(0) === AT_CHARCODE) {
545 ▶     throw new RuntimeError(
546 ▶       RuntimeErrorCode.UNEXPECTED_SYNTHETIC_PROPERTY,
547 │       `Unexpected synthetic ${nameKind} ${name} found. Please make sure that:
548 ▶   - Make sure \`provideAnimationsAsync()\`, \`provideAnimations()\` or \`provideNoopAnimations()\` call was added to a list of providers used to bootstrap an application.
549 │   - There is a corresponding animation configuration named \`${name}\` defined in the \`animations\` field of the \`@Component\` decorator (see https://angular.dev/api/core/Component#animations).`,
```

旧アニメーションの仕組み（`provideAnimations()` など）を入れていないと、`@fade` は `DefaultDomRenderer2.setProperty` にそのまま届きます。開発モードでは 544 行目で 1 文字目が `@` かを見て、545 行目で止めます。548 行目のメッセージが「provider を足したか」を聞いているのはこのためです。310 行目の `throwOnSyntheticProps` は既定で `true` で、308 行目のコメントのとおりアニメーションのレンダラーが `false` にして、この確認を切ります （アニメーションの側は [animations-legacy-setup](../animations/14-animations-legacy-setup.md)）。本番のビルドでは 467 行目の `ngDevMode` が偽なので確認は走らず、`el['@fade'] = value` が黙って実行されるだけです。

## 6. ng-reflect-\* は「input に入れたとき」だけ

以前の版では、開発モードで要素に `ng-reflect-*` という属性が付いていました。v22 では**既定で付きません**。

📄 `angular/packages/core/src/ng_reflect.ts` L11–23 （▶ の行: 12, 18, 21）

```ts
11 │ /** Defines the default value of the `NG_REFLECT_ATTRS_FLAG` flag. */
12 ▶ export const NG_REFLECT_ATTRS_FLAG_DEFAULT = false;
13 │ 
14 │ /**
15 │  * Defines an internal flag that indicates whether the runtime code should be
16 │  * producing `ng-reflect-*` attributes.
17 │  */
18 ▶ export const NG_REFLECT_ATTRS_FLAG = new InjectionToken<boolean>(
19 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'NG_REFLECT_FLAG' : '',
20 │   {
21 ▶     factory: () => NG_REFLECT_ATTRS_FLAG_DEFAULT,
22 │   },
23 │ );
```

📄 `angular/packages/core/src/ng_reflect.ts` L37–54 （▶ の行: 39, 42–43, 46, 52–53）

```ts
37 │ export function provideNgReflectAttributes(): EnvironmentProviders {
38 │   const providers =
39 ▶     typeof ngDevMode === 'undefined' || ngDevMode
40 │       ? [
41 │           {
42 ▶             provide: NG_REFLECT_ATTRS_FLAG,
43 ▶             useValue: true,
44 │           },
45 │         ]
46 ▶       : [];
47 │   return makeEnvironmentProviders(providers);
48 │ }
49 │ 
50 │ export function normalizeDebugBindingName(name: string) {
51 │   // Attribute names with `$` (eg `x-y$`) are valid per spec, but unsupported by some browsers
52 ▶   name = camelCaseToDashCase(name.replace(/[$@]/g, '_'));
53 ▶   return `ng-reflect-${name}`;
54 │ }
```

📄 `angular/packages/core/src/render3/component_ref.ts` L163–166 （▶ の行: 164–165）

```ts
163 │   let ngReflect = false;
164 ▶   if (typeof ngDevMode === 'undefined' || ngDevMode) {
165 ▶     ngReflect = rootLViewInjector.get(NG_REFLECT_ATTRS_FLAG, NG_REFLECT_ATTRS_FLAG_DEFAULT);
166 │   }
```

12 行目の既定値は `false` で、21 行目のトークンの既定もそれを返します。`provideNgReflectAttributes()` を providers に足したときだけ 43 行目で `true` が入り、それも 39 行目のとおり開発モードのときだけです（本番では 46 行目の空の配列）。値を読むのはルートのコンポーネントを作るときの 1 回で、165 行目で読んだ値が `LViewEnvironment` の `ngReflect` になり、木の全部のビューに受け継がれます（`LViewEnvironment` は [第 3 回](03-domr-renderer-factory.md)）。既定を `false` にしたのは 2025-04 のコミット `c2987d8402b` です。

📄 `angular/packages/core/src/render3/instructions/shared.ts` L327–348 （▶ の行: 329, 334–335, 337–338, 340, 343, 346）

```ts
327 │ function setNgReflectProperty(lView: LView, tNode: TNode, attrName: string, value: any) {
328 │   const environment = lView[ENVIRONMENT];
329 ▶   if (!environment.ngReflect) {
330 │     return;
331 │   }
332 │   const element = getNativeByTNode(tNode, lView) as RElement | RComment;
333 │   const renderer = lView[RENDERER];
334 ▶   attrName = normalizeDebugBindingName(attrName);
335 ▶   const debugValue = normalizeDebugBindingValue(value);
336 │   if (tNode.type & TNodeType.AnyRNode) {
337 ▶     if (value == null) {
338 ▶       renderer.removeAttribute(element as RElement, attrName);
339 │     } else {
340 ▶       renderer.setAttribute(element as RElement, attrName, debugValue);
341 │     }
342 │   } else {
343 ▶     const textContent = escapeCommentText(
344 │       `bindings=${JSON.stringify({[attrName]: debugValue}, null, 2)}`,
345 │     );
346 ▶     renderer.setValue(element as RComment, textContent);
347 │   }
348 │ }
```

呼ばれるのは 4 節の 264 行目（と `ɵɵariaProperty` の 46 行目、静的な属性を input に入れる `setInputsFromAttrs`）で、**input に値を入れたときだけ**です。DOM のプロパティに書いた `[title]` には付きません。334 行目で名前を `ng-reflect-` + ダッシュ区切りにし（`ng_reflect.ts` の 52〜53 行目。`$` と `@` は `_` に）、337〜340 行目で 2 節と同じ `removeAttribute` / `setAttribute` を呼びます。要素でない `<ng-template>` などでは、343〜346 行目でコメントのノードの中身に `bindings={…}` を書きます。

## 7. 動かして確かめる

1 節のテンプレートとほぼ同じものを、この章の中で定義した本物のコンポーネントにしました（`imports` が無いので `DomOnly`）。`[attr.aria-label]` には `null` を入れられ、svg の中の `<a>` には静的な `xlink:href` と `[attr.xlink:title]` があります。

> **🧪 DEMO — このサイトの本物の DomRendererFactory2 に届いた呼び出しを記録する**
>
> 下の枠に、この章の中で定義した本物のコンポーネント（テンプレートは 1 節の 3 通りの書き方をまとめたもの）を描きます。Renderer2 への呼び出しは、共通部品 `domr-probe.ts` の記録係（本物の RendererFactory2 を包んで、呼ばれた順に 1 行ずつ残す）が記録します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-attributes-properties)

「描く」を押すと、ヘッドレスの Chrome（開発ビルド）では次の 24 回が記録されました（2026-11-04）。

- `factory.createRenderer(null, … None, → r1)` — ホスト要素を作るための既定のレンダラー
- `factory.createRenderer(<domr-attr-target>, … None, → r2)` — styles が無いので None — *第 6 回 1 節*
  - `r2.createElement("p", null)` → `r2.setAttribute(<p>, "title", "静的な title")` — setUpAttributes の 69 行目 — *静的*
  - `r2.createElement("a", "svg")` → `r2.setAttribute(<a ns=svg>, "href", "#domr-attr-a", "xlink")` — setUpAttributes の 60 行目 — *静的・名前空間つき*
- `factory.begin()` — ここから更新
  - `r2.setProperty(<p>, "title", "こんにちは")` → `r2.setProperty(<p>, "tabIndex", 0)` — ɵɵdomProperty → setDomProperty 308 行目
  - `r2.setAttribute(<p>, "title", "こんにちは", undefined)` — ɵɵattribute → 540 行目
  - `r2.removeAttribute(<p>, "aria-label", undefined)` — 535 行目 — *最初から null*
  - `r2.setAttribute(<a ns=svg>, "title", "こんにちは", "xlink")` — 540 行目
- `factory.end()`

- 最初の更新で `removeAttribute(<p>, "aria-label")` が呼ばれています。属性はまだ付いていませんが、初回は前回の値が無いので `bindingUpdated` が真になり、530 行目の分かれで消しに行くからです。
- `text` だけ変えて「値を入れて変更検知」を押すと、`setProperty(…"title"…)`・`setAttribute(…"title"…)`・`setValue`・`setAttribute(<a>, "title", …, "xlink")` だけが呼ばれ、値の変わらない `tabIndex` は呼ばれません（34 行目・40 行目の `bindingUpdated`）。aria-label のチェックを外して押すと、記録は `removeAttribute(<p>, "aria-label", undefined)` の 1 回だけです。
- `<a>` の属性は `xlink:href`・`xlink:title` とも namespaceURI が `http://www.w3.org/1999/xlink` になります（407 行目の `setAttributeNS`）。
- 破棄の記録は `r2.destroy()` の 1 回だけです。ホスト要素を枠から外すのは、`appendChild` したこの章のコードの側です（レンダラーの呼び出しではありません）。

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| platform-browser/test/dom/dom\_renderer\_spec.ts | describe `setAttribute`（35）・`removeAttribute`（64）の中の describe `with namespace`。it は `xmlns`・`xml`・`svg`・`xhtml`・`xlink`・`unknown` の 6 つずつ | `//packages/platform-browser/test:test_web_chromium`（ブラウザだけ） |
| core/test/acceptance/attributes\_spec.ts | describe `attribute creation`（13、it 2 つ。`should allow for setting xlink namespaced attributes` は 30）・`attribute binding`（59、it 6 つ。`should sanitize attribute values` は 185）・`attribute interpolation`（214、it 1 つ） | `//packages/core/test/acceptance:acceptance` |
| core/test/linker/integration\_spec.ts | describe `logging property updates`（1745、it 14 個。`should reflect property values as attributes` は 1780） | `//packages/core/test:test` |

📄 `angular/packages/platform-browser/test/dom/dom_renderer_spec.ts` L35–62 （▶ の行: 41, 43, 47, 49, 53, 57, 59）

```ts
35 │   describe('setAttribute', () => {
36 │     describe('with namespace', () => {
37 │       it('xmlns', () => shouldSetAttributeWithNs('xmlns'));
38 │       it('xml', () => shouldSetAttributeWithNs('xml'));
39 │       it('svg', () => shouldSetAttributeWithNs('svg'));
40 │       it('xhtml', () => shouldSetAttributeWithNs('xhtml'));
41 ▶       it('xlink', () => shouldSetAttributeWithNs('xlink'));
42 │ 
43 ▶       it('unknown', () => {
44 │         const div = document.createElement('div');
45 │         expect(div.hasAttribute('unknown:name')).toBe(false);
46 │ 
47 ▶         renderer.setAttribute(div, 'name', 'value', 'unknown');
48 │ 
49 ▶         expect(div.getAttribute('unknown:name')).toBe('value');
50 │       });
51 │ 
52 │       function shouldSetAttributeWithNs(namespace: string): void {
53 ▶         const namespaceUri = NAMESPACE_URIS[namespace];
54 │         const div = document.createElement('div');
55 │         expect(div.hasAttributeNS(namespaceUri, 'name')).toBe(false);
56 │ 
57 ▶         renderer.setAttribute(div, 'name', 'value', namespace);
58 │ 
59 ▶         expect(div.getAttributeNS(namespaceUri, 'name')).toBe('value');
60 │       }
61 │     });
62 │   });
```

41 行目の `xlink` は 52〜60 行目の共通の関数で、`setAttribute(div, 'name', 'value', 'xlink')` が `getAttributeNS(URI, 'name')` で読めることを確かめます（407 行目）。43〜50 行目の `unknown` は 409 行目の分かれで、`unknown:name` という普通の属性ができることを確かめています。

📄 `angular/packages/core/test/acceptance/attributes_spec.ts` L30–56 （▶ の行: 32, 49–50）

```ts
30 │   it('should allow for setting xlink namespaced attributes', () => {
31 │     @Component({
32 ▶       template: `<div id="test" xlink:href="bar" title="Hello"></div>`,
33 │       standalone: false,
34 │       changeDetection: ChangeDetectionStrategy.Eager,
35 │     })
36 │     class Comp {}
37 │ 
38 │     TestBed.configureTestingModule({declarations: [Comp]});
39 │     const fixture = TestBed.createComponent(Comp);
40 │     fixture.detectChanges();
41 │ 
42 │     const div = fixture.debugElement.query(By.css('div')).nativeElement;
43 │     const attrs = div.attributes;
44 │ 
45 │     expect(attrs['id'].name).toEqual('id');
46 │     expect(attrs['id'].namespaceURI).toEqual(null);
47 │     expect(attrs['id'].value).toEqual('test');
48 │ 
49 ▶     expect(attrs['xlink:href'].name).toEqual('xlink:href');
50 ▶     expect(attrs['xlink:href'].namespaceURI).toEqual('http://www.w3.org/1999/xlink');
51 │     expect(attrs['xlink:href'].value).toEqual('bar');
52 │ 
53 │     expect(attrs['title'].name).toEqual('title');
54 │     expect(attrs['title'].namespaceURI).toEqual(null);
55 │     expect(attrs['title'].value).toEqual('Hello');
56 │   });
```

こちらはテンプレートからの道で、32 行目の静的な `xlink:href` が setUpAttributes の 60 行目を通って、50 行目の namespaceURI になることを見ています。

📄 `angular/packages/core/test/linker/integration_spec.ts` L1780–1811 （▶ の行: 1783, 1786, 1794, 1803, 1810）

```ts
1780 │     it('should reflect property values as attributes', () => {
1781 │       TestBed.configureTestingModule({
1782 │         declarations: [MyComp, MyDir],
1783 ▶         providers: [provideNgReflectAttributes()],
1784 │       });
1785 │       TestBed.overrideComponent(MyComp, {
1786 ▶         set: {template: `<div my-dir [elprop]="ctxProp()"></div>`},
1787 │       });
1788 │       const fixture = TestBed.createComponent(MyComp);
1789 │ 
1790 │       fixture.componentInstance.ctxProp.set('hello');
1791 │       fixture.detectChanges();
1792 │ 
1793 │       const html = fixture.nativeElement.innerHTML;
1794 ▶       expect(html).toContain('ng-reflect-dir-prop="hello"');
1795 │     });
1796 │ 
1797 │     it('should reflect property values on unbound inputs', () => {
1798 │       TestBed.configureTestingModule({
1799 │         declarations: [MyComp, MyDir],
1800 │         providers: [provideNgReflectAttributes()],
1801 │       });
1802 │       TestBed.overrideComponent(MyComp, {
1803 ▶         set: {template: `<div my-dir elprop="hello" title="Reflect test"></div>`},
1804 │       });
1805 │       const fixture = TestBed.createComponent(MyComp);
1806 │       fixture.detectChanges();
1807 │ 
1808 │       const html = fixture.nativeElement.innerHTML;
1809 │       expect(html).toContain('ng-reflect-dir-prop="hello"');
1810 ▶       expect(html).not.toContain('ng-reflect-title');
1811 │     });
```

1783 行目で `provideNgReflectAttributes()` を入れたときだけ付くこと、1794 行目で名前が input の内側の名前（`dirProp` → `dir-prop`）になること、1810 行目で input でない `title` には付かないこと（6 節）を確かめています。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
  '--test_arg=--filter=^attribute (creation|binding|interpolation)'
pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=logging property updates'
# dom_renderer_spec.ts の setAttribute / removeAttribute はブラウザでだけ走る（23〜27 行目で Node なら抜ける）
pnpm bazel test //packages/platform-browser/test:test_web_chromium --nocache_test_results --test_output=all
```

📄 `出力（2026-11-04 に実行。抜粋。ログは scratchpad/domr-logs/b-attr-acceptance.log・b-ngreflect.log・b-web-chromium.log）`

```
//packages/core/test/acceptance:acceptance
Ran 9 of 2693 specs
9 specs, 0 failures
//packages/core/test/acceptance:acceptance       PASSED in 1.4s

//packages/core/test:test  （4 つのシャードに分かれて走る）
Ran 3 of 1390 specs / Ran 4 of 1391 specs / Ran 4 of 1391 specs / Ran 3 of 1390 specs
//packages/core/test:test                         PASSED in 1.4s

//packages/platform-browser/test:test_web_chromium
Chromium: 1/1 test files | 253 passed, 0 failed, 5 skipped
//packages/platform-browser/test:test_web_chromium PASSED in 2.1s
```

- acceptance の 9 件 = `attribute creation` 2・`attribute binding` 6・`attribute interpolation` 1。
- `//packages/core/test:test` は 4 つのシャードに分かれて走り、3 + 4 + 4 + 3 = 14 件が `logging property updates` の it の数と合います。
- `dom_renderer_spec.ts` は下の 23〜27 行目で、Node なら `should pass` だけにして抜けます。`:test`（Node）では setAttribute の it が 1 つも走りません。ブラウザの `:test_web_chromium` はターゲット全体（platform-browser/test の spec を 1 つにまとめたもの）の 253 件で確かめました（5 件の skip は `xit` など）。

📄 `angular/packages/platform-browser/test/dom/dom_renderer_spec.ts` L22–27 （▶ の行: 23, 25–26）

```ts
22 │ describe('DefaultDomRendererV2', () => {
23 ▶   if (isNode) {
24 │     // Jasmine will throw if there are no tests.
25 ▶     it('should pass', () => {});
26 ▶     return;
27 │   }
```

### 直すとしたら

- 名前空間の付け方を変えるなら `DefaultDomRenderer2.setAttribute` / `removeAttribute`（402〜427 行目）で、it は `dom_renderer_spec.ts` の describe `with namespace` に足します（ブラウザで走らせる）。
- `null` のときの扱いやサニタイザを呼ぶ順を変えるなら core の `setElementAttribute`（521〜542 行目）で、it は `attributes_spec.ts` の describe `attribute binding` に足します（Node で走る）。
- この辺りは 2026 年も直されています。`7168bed663b`（SVG の外で作られた SVG のアニメーションの要素の属性も確かめる。#70490）と `f57d5d5c8c3`（ホストのバインディングのサニタイズで名前空間を数に入れる。#69558）は、どちらも「要素や属性の名前空間」と「サニタイズの表」の突き合わせの修正で、詳しくは [第 17 回](17-domr-sanitization.md) と [第 20 回](20-domr-issues.md) で読みます。本家に PR を出すことは勧めません。ここで読んだ行は、issue の「属性が付かない」「消えない」がどの分かれで起きたかを言い当てる手がかりにします。

## 聞かれそうな質問

**Q. `[title]` と `[attr.title]` は何が違うの？**

`[title]` は `ɵɵdomProperty`（ディレクティブがありうるビューでは `ɵɵproperty`）→ `setDomProperty` → `setProperty` の 470 行目で `el.title = value` を実行します。`[attr.title]` は `ɵɵattribute` → `setElementAttribute` の 540 行目 → `setAttribute` の 412 行目で `el.setAttribute('title', String(value))` です。`title` は属性とプロパティが連動するので見た目は同じですが、`null` を入れると、属性の側は 535 行目で消え、プロパティの側は `el.title = null`（文字列 `"null"`）になります。

**Q. 属性を消したいときは何を入れればいい？**

`null` か `undefined` です。530 行目が `value == null` で `removeAttribute` に分かれます。空文字や `false` は消えずに `""`・`"false"` として書かれます。

**Q. `[attr.xlink:href]` の `xlink` はどう扱われる？**

コンパイラが名前を `xlink` と `href` に分け、`ɵɵattribute("href", v, ɵɵsanitizeUrl, "xlink")` を出します。レンダラーの 404 行目で `xlink:href` を組み立て、405 行目で `NAMESPACE_URIS` から URI を引いて 407 行目の `setAttributeNS` で書きます。表に無い接頭辞は 409 行目で普通の属性になります。

**Q. `[aria-label]` はプロパティ？属性？**

属性です。`imports` の無いビューでは、コンパイラが `binding_specialization.ts` の 102〜105 行目で属性のバインディングに書き換えます。ディレクティブがありうるビューでは `ɵɵariaProperty` になり、42 行目で input に当たらなければ 50 行目で `setElementAttribute` を呼びます。

**Q. テストで `ng-reflect-*` を頼りにしていたら消えた。**

v22 では `NG_REFLECT_ATTRS_FLAG` の既定が `false`（`ng_reflect.ts` 12 行目）です。`provideNgReflectAttributes()` を足せば開発モードでだけ戻ります（43 行目）。ただし付くのは input に値を入れたときだけ（`setPropertyAndInputs` の 264 行目）で、DOM のプロパティへのバインディングには元から付きません。

## 読み終えて

- `[x]`・`[attr.x]`・`x="…"` は、コンパイラの出力の段階で `ɵɵdomProperty`/`ɵɵproperty`・`ɵɵattribute`・`consts` の組に分かれる。
- 属性の道は `setElementAttribute` の 530 行目で、`null`/`undefined` なら `removeAttribute`、それ以外は文字列にして `setAttribute`。
- 名前空間は短い名前（`xlink`）のまま運ばれ、レンダラーの `NAMESPACE_URIS` で URI になって `setAttributeNS` で書かれる。
- プロパティの道は `el[name] = value` の 1 行。値は文字列にならない。名前が `@` で始まると開発モードで止まる。
- `ng-reflect-*` は既定で出ず、`provideNgReflectAttributes()` を入れても input に入れたときだけ。

---

← 前: [DefaultDomRenderer2：要素とテキストを作って差し込む](04-domr-default-renderer.md)  
次: [Emulated・None・ShadowDom：renderer ごとのカプセル化](06-domr-encapsulation.md) →
