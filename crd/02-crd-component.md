[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 2 回 / 全 10 回

# @Component の説明文：テンプレート・スタイル・変更検知・カプセル化

> metadata/directives.ts の Component と Pipe・Input・Output・HostBinding・HostListener の未読の行、view.ts と resource\_loading.ts：changeDetection（OnPush の既定とデコレーターの Eager）、viewProviders、template と templateUrl、encapsulation、preserveWhitespaces、@Input の transform と alias、@HostListener の args と返り値、JIT の resolveComponentResources。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-component)

---

この章で分かること：`@Component` の説明文が約束する `changeDetection`・`viewProviders`・テンプレートとスタイルの指定・`encapsulation`・`preserveWhitespaces` と、同じファイルの `@Pipe`・`@Input`・`@Output`・`@HostBinding`・`@HostListener`、`ViewEncapsulation`、JIT のリソースの解決（`resolveComponentResources`）を、本物で 1 つずつ確かめます。いちばん大きな食い違いは、554 行目「OnPush が既定」に対して、デコレーターの props（682 行目）が `Eager` を入れることです。クラスそのものは AOT でも JIT でも OnPush ですが、`new Component({})` と、TestBed の `overrideComponent`・`overrideTemplate` を通したコンポーネントは Eager になります。

読む対象は `packages/core/src/metadata/directives.ts` の L386〜1102、`view.ts`、`resource_loading.ts`（../angular、8576f161ae4）です。`@Directive` から受け継ぐ selector・inputs・host などは[第 1 回](01-crd-directive.md)、OnPush の印の付き方は[OnPush と markForCheck の章](../cd/04-cd-onpush-markforcheck.md)、Emulated の CSS の書き換えは[shadow\_css の章](../compiler/18-compiler-shadow-css.md)、空白の除き方は[HTML の構文解析の章](../compiler/04-compiler-html-parser.md)にあります。

1. [1. @Directive](01-crd-directive.md)
2. **2. @Component**（この章）
3. [3. クエリと @NgModule](03-crd-query-module.md)
4. [4. @Injectable・InjectionToken](04-crd-injectable-token.md)
5. [5. Provider の形](05-crd-provider.md)
6. [6. inject と Injector](06-crd-inject.md)
7. [7. ライフサイクル](07-crd-lifecycle.md)
8. [8. differ](08-crd-differs.md)
9. [9. スケジューラー](09-crd-scheduling.md)
10. [10. spec と issue](10-crd-tests-issues.md)

## 1. @Component の説明と、指している例

📄 `angular/packages/core/src/metadata/directives.ts` L386–410 （▶ の行: 394–396, 398, 401, 408–409）

```ts
386 │   /**
387 │    * Decorator that marks a class as an Angular component and provides configuration
388 │    * metadata that determines how the component should be processed,
389 │    * instantiated, and used at runtime.
390 │    *
391 │    * Components are the most basic UI building block of an Angular app.
392 │    * An Angular app contains a tree of Angular components.
393 │    *
394 ▶    * Angular components are a subset of directives, always associated with a template.
395 ▶    * Unlike other directives, only one component can be instantiated for a given element in a
396 ▶    * template.
397 │    *
398 ▶    * Standalone components can be directly imported in any other standalone component or NgModule.
399 │    * NgModule based apps on the other hand require components to belong to an NgModule in
400 │    * order for them to be available to another component or application. To make a component a
401 ▶    * member of an NgModule, list it in the `declarations` field of the `NgModule` metadata.
402 │    *
403 │    * Note that, in addition to these options for configuring a directive,
404 │    * you can control a component's runtime behavior by implementing
405 │    * life-cycle hooks. For more information, see the
406 │    * [Lifecycle Hooks](guide/components/lifecycle) guide.
407 │    *
408 ▶    * HELPFUL: You may not use this interface to describe a class that is a component. Decorators do not affect the typing of the decorated classes.
409 ▶    * Use `Type<unknown>` instead of `Type<Component>`.
410 │    *
```

395〜396 行目「1 つの要素に作れるコンポーネントは 1 つ」は、2 つのコンポーネントの selector が同じ要素に当たると実行時に `NG0300` になる約束です（照合は[実行時の依存解決の章](../standalone/07-standalone-directive-registry.md)）。408〜409 行目の HELPFUL は、`Component` は metadata の型であってクラスの型ではないので `Type<Component>` と書かない、という注意です。

📄 `angular/packages/core/src/metadata/directives.ts` L411–427 （▶ の行: 418, 426）

```ts
411 │    * @usageNotes
412 │    *
413 │    * ### Setting component inputs
414 │    *
415 │    * The following example creates a component with two data-bound properties,
416 │    * specified by the `inputs` value.
417 │    *
418 ▶    * {@example core/ts/metadata/directives.ts region='component-input'}
419 │    *
420 │    *
421 │    * ### Setting component outputs
422 │    *
423 │    * The following example shows two output function that emit on an interval. One
424 │    * emits an output every second, while the other emits every five seconds.
425 │    *
426 ▶    * {@example core/ts/metadata/directives.ts region='component-output-interval'}
427 │    *
```

418・426 行目の `{@example}` は、angular.dev が `packages/examples/core/ts/metadata/directives.ts` の docregion を差し込む印です。`component-input`（L11〜31）は `inputs: ['bankName', 'id: account-id']` と `imports: [BankAccountComponent]` を持つ今の形で、`component-output-interval`（L33〜62）は `output()` と `setInterval` の例です。どちらも `imports` を書いていて、説明文の中に直接書いた例（次の viewProviders の例、[第 1 回](01-crd-directive.md)の outputs・exportAs の例）と違って、そのまま動く形です。

📄 `angular/packages/core/src/metadata/directives.ts` L428–461 （▶ の行: 443, 446–447, 453–456）

````ts
428 │    * ### Injecting a class with a view provider
429 │    *
430 │    * The following simple example injects a class into a component
431 │    * using the view provider specified in component metadata:
432 │    *
433 │    * ```ts
434 │    * class Greeter {
435 │    *    greet(name:string) {
436 │    *      return 'Hello ' + name + '!';
437 │    *    }
438 │    * }
439 │    *
440 │    * @Directive({
441 │    *   selector: 'needs-greeter'
442 │    * })
443 ▶    * class NeedsGreeter {
444 │    *   greeter:Greeter;
445 │    *
446 ▶    *   constructor(greeter:Greeter) {
447 ▶    *     this.greeter = greeter;
448 │    *   }
449 │    * }
450 │    *
451 │    * @Component({
452 │    *   selector: 'greet',
453 ▶    *   viewProviders: [
454 ▶    *     Greeter
455 ▶    *   ],
456 ▶    *   template: `<needs-greeter></needs-greeter>`
457 │    * })
458 │    * class HelloWorld {
459 │    * }
460 │    *
461 │    * ```
````

453〜455 行目の `viewProviders` に置いた `Greeter` を、456 行目のテンプレートの `NeedsGreeter` が 446 行目のコンストラクターで受ける例です。ngc にかけると 456 行目の `<needs-greeter>` が `NG8001` で、`imports: [NeedsGreeter]` を足すとエラー 0 でした（`Greeter` に `@Injectable` が無くても、引数の無いクラスなので `viewProviders` から作れる）。`providers` と `viewProviders` の注入器での違いは[2 つの注入器の章](../standalone/08-standalone-providers-two-injectors.md)です。

## 2. preserveWhitespaces：空白の 5 つの規則

📄 `angular/packages/core/src/metadata/directives.ts` L463–491 （▶ の行: 466, 468, 471–472, 484–487）

````ts
463 │    * ### Preserving whitespace
464 │    *
465 │    * Removing whitespace can greatly reduce AOT-generated code size and speed up view creation.
466 ▶    * As of Angular 6, the default for `preserveWhitespaces` is false (whitespace is removed).
467 │    * To change the default setting for all components in your application, set
468 ▶    * the `preserveWhitespaces` option of the AOT compiler.
469 │    *
470 │    * By default, the AOT compiler removes whitespace characters as follows:
471 ▶    * * Trims all whitespaces at the beginning and the end of a template.
472 ▶    * * Removes whitespace-only text nodes. For example,
473 │    *
474 │    * ```html
475 │    * <button>Action 1</button>  <button>Action 2</button>
476 │    * ```
477 │    *
478 │    * becomes:
479 │    *
480 │    * ```html
481 │    * <button>Action 1</button><button>Action 2</button>
482 │    * ```
483 │    *
484 ▶    * * Replaces a series of whitespace characters in text nodes with a single space.
485 ▶    * For example, `<span>\n some text\n</span>` becomes `<span> some text </span>`.
486 ▶    * * Does NOT alter text nodes inside HTML tags such as `<pre>` or `<textarea>`,
487 ▶    * where whitespace characters are significant.
488 │    *
489 │    * Note that these transformations can influence DOM nodes layout, although impact
490 │    * should be minimal.
491 │    *
````

📄 `angular/packages/core/src/metadata/directives.ts` L492–532 （▶ の行: 494, 497, 503–504, 513–514, 517, 522–523）

````ts
492 │    * You can override the default behavior to preserve whitespace characters
493 │    * in certain fragments of a template. For example, you can exclude an entire
494 ▶    * DOM sub-tree by using the `ngPreserveWhitespaces` attribute:
495 │    *
496 │    * ```html
497 ▶    * <div ngPreserveWhitespaces>
498 │    *     whitespaces are preserved here
499 │    *     <span>    and here </span>
500 │    * </div>
501 │    * ```
502 │    *
503 ▶    * You can force a single space to be preserved in a text node by using `&ngsp;`,
504 ▶    * which is replaced with a space character by Angular's template
505 │    * compiler:
506 │    *
507 │    * ```html
508 │    * <a>Spaces</a>&ngsp;<a>between</a>&ngsp;<a>links.</a>
509 │    * <!-- compiled to be equivalent to:
510 │    *  <a>Spaces</a> <a>between</a> <a>links.</a>  -->
511 │    * ```
512 │    *
513 ▶    * Note that sequences of `&ngsp;` are still collapsed to just one space character when
514 ▶    * the `preserveWhitespaces` option is set to `false`.
515 │    *
516 │    * ```html
517 ▶    * <a>before</a>&ngsp;&ngsp;&ngsp;<a>after</a>
518 │    * <!-- compiled to be equivalent to:
519 │    *  <a>before</a> <a>after</a> -->
520 │    * ```
521 │    *
522 ▶    * To preserve sequences of whitespace characters, use the
523 ▶    * `ngPreserveWhitespaces` attribute.
524 │    *
525 │    * @Annotation
526 │    */
527 │   (obj: Component): TypeDecorator;
528 │   /**
529 │    * See the `Component` decorator.
530 │    */
531 │   new (obj: Component): Component;
532 │ }
````

466 行目「Angular 6 から既定は false」は、f1a063298e9（2018-02-06、`feat(core): set preserveWhitespaces to false by default (#22046)`）です。DEMO 1 の「preserveWhitespaces」で、下のテンプレートを false と true で描き、ホストの子ノードを並べました（`·` は空白、`⏎` は改行）。

- false では 10 ノード、true では 17 ノードでした。471 行目の先頭と末尾、472 行目の空白だけのテキスト（ボタンの間の 2 つの空白など）は消えます。486〜487 行目のとおり `<pre>` の中は `··a⏎··b` のまま、494 行目の `ngPreserveWhitespaces` の div の中も `··x··` のままです。
- 513〜514 行目の `&ngsp;` は、false では `&ngsp;&ngsp;&ngsp;` が 1 つの空白、true では 3 つの空白でした。
- 485 行目の例「`<span>\n some text\n</span>` は `<span> some text </span>` になる」は少し違います。実際は `·some·text⏎` で、前の `\n `（2 文字）は 1 つの空白になり、後ろの `\n`（1 文字）は改行のまま残りました。続く空白を 1 つにするのは 2 文字以上の並びだけだからです（compiler/src/ml\_parser/html\_whitespaces.ts の `WS_REPLACE_REGEXP` が `{2,}`、[HTML の構文解析の章](../compiler/04-compiler-html-parser.md)）。描かれた見た目は同じです。

📄 `DEMO 1「preserveWhitespaces」のテンプレート（false と true の 2 つのコンポーネントで同じもの）`

```
  <button>Action 1</button>  <button>Action 2</button>
<span>
 some text
</span>
<pre>  a
  b</pre>
<div ngPreserveWhitespaces>  x  <span>   y </span></div>
<a>Spaces</a>&ngsp;<a>between</a>&ngsp;&ngsp;&ngsp;<a>after</a>  
```

## 3. changeDetection：OnPush が既定、でもデコレーターは Eager を足す

📄 `angular/packages/core/src/metadata/directives.ts` L534–563 （▶ の行: 544, 551–552, 554, 559–560）

```ts
534 │ /**
535 │  * Supplies configuration metadata for an Angular component.
536 │  *
537 │  * @see [Anatomy of a component](guide/components)
538 │  * @see [ChangeDetectionStrategy](guide/components/advanced-configuration#changedetectionstrategy)
539 │  * @see [Using the viewProviders array](guide/di/hierarchical-dependency-injection#using-the-viewproviders-array)
540 │  * @see [Style scoping](guide/components/styling#style-scoping)
541 │  *
542 │  * @publicApi
543 │  */
544 ▶ export interface Component extends Directive {
545 │   /**
546 │    * The change-detection strategy to use for this component.
547 │    *
548 │    * When a component is instantiated, Angular creates a change detector,
549 │    * which is responsible for propagating the component's bindings.
550 │    * The strategy is one of:
551 ▶    * - `ChangeDetectionStrategy#OnPush` sets the strategy to `CheckOnce` (on demand).
552 ▶    * - `ChangeDetectionStrategy#Eager` sets the strategy to `CheckAlways`.
553 │    *
554 ▶    * NOTE: OnPush is enabled by default.
555 │    */
556 │   changeDetection?: ChangeDetectionStrategy;
557 │ 
558 │   /**
559 ▶    * Defines the set of injectable objects that are visible to its view DOM children.
560 ▶    * See [example](#injecting-a-class-with-a-view-provider).
561 │    *
562 │    */
563 │   viewProviders?: Provider[];
```

📄 `angular/packages/core/src/metadata/directives.ts` L680–698 （▶ の行: 682–683, 685）

```ts
680 │ export const Component: ComponentDecorator = makeDecorator(
681 │   'Component',
682 ▶   (c: Component = {}) => ({changeDetection: ChangeDetectionStrategy.Eager, ...c}),
683 ▶   Directive,
684 │   undefined,
685 ▶   (type: Type<any>, meta: Component) => compileComponent(type, meta),
686 │ );
687 │ 
688 │ /**
689 │  * Type of the Pipe decorator / constructor function.
690 │  *
691 │  * @publicApi
692 │  */
693 │ export interface PipeDecorator {
694 │   /**
695 │    *
696 │    * Decorator that marks a class as pipe and supplies configuration metadata.
697 │    *
698 │    * A pipe class must implement the `PipeTransform` interface.
```

554 行目「OnPush が既定」は 43ef7171b32（2026-03-26、`docs: update change detection strategy references`）で書かれ、実装は eae8f7e30b9（2026-03-16、`feat(core): Set default Component changeDetection strategy to OnPush`）です。そのコミットは `ɵɵdefineComponent` の `onPush: componentDefinition.changeDetection !== ChangeDetectionStrategy.Eager`（render3/definition.ts L352）と、コンパイラの「OnPush のときは書き出さない」（compiler/src/render3/view/compiler.ts L309〜315）を変えました。つまり `changeDetection` を書かないコンポーネントは、定義に何も書かれず、実行時に OnPush になります。

ところが 682 行目の props の関数は、今も `{changeDetection: ChangeDetectionStrategy.Eager, ...c}` です（17f19272c1c、2026-02-11 に `Default` を `Eager` に置き換えたまま）。[第 1 回](01-crd-directive.md)の 9 節のとおり、685 行目の `compileComponent` に渡るのは props を通す前の引数なので、JIT でもクラス自体は OnPush です。props の結果が使われるのは、`new Component({…})` で作った metadata と、クラスに付く `__annotations__` の 2 つです。

- `new Component({selector: 'x', template: ''}).changeDetection` は `1`（`Eager`）でした（DEMO 2 の記録。このページの上で `new Component` を呼ぶと、デコレーターの実体と JIT のコンパイラの入口 `compileComponent` がページの最初の JS に入って約 36 kB 重くなったので、記録にしました）。
- Node の JIT の記録では、`changeDetection` を書かないクラスの `ɵcmp.onPush` は `true`、同じクラスの `__annotations__[0].changeDetection` は `1` でした。
- TestBed は override のとき `__annotations__` から metadata を読み直して `compileComponent` し直します（[TestBed の章](../ngmodule/17-ngmodule-testbed.md)）。`TestBed.overrideComponent(B, {set: {template}})` と `overrideTemplate` のあとでは `ɵcmp.onPush` が `true → false` に変わり、`changeDetection: OnPush` も一緒に `set` したときだけ `true` のままでした（DEMO 2）。テンプレートを差し替えただけで、テストの中のコンポーネントの変更検知の仕方が変わります。

> [!WARNING]
> **ハマりどころ**
>
> これは [#69898](https://github.com/angular/angular/pull/69898)（`fix(core): Ensure JIT components also use OnPush by default.`、2026-07-22 に開かれ、まだ開いている）が 682 行目を `OnPush` にして直そうとしているもので、spec も `packages/core/test/metadata/directives_spec.ts` の `should default changeDetection to OnPush` と、test\_bed\_spec.ts の `should preserve default change detection when overriding components` を足しています。main（d201dd76ef2）では f1c87829991（2026-11-04）が g3（Google の中）向けにだけ OnPush にし、外向けの行は `// 3p-only` の印を付けて Eager のままです。

551〜552 行目の 2 つの戦略を、DEMO 1 の「changeDetection」で並べました。既定（書かない）の子と Eager の子に同じ操作をして、親の `detectChanges` のあとに `field|obj.v|sig` を読みます。外からフィールドを替えるのと、同じ参照のオブジェクトの中身を替えるのは Eager の子だけに映り、入力の参照を替える・子のテンプレートのイベント・`markForCheck()`・テンプレートが読む signal の変更は、OnPush の子にも映りました。551 行目の「on demand」の中身はこの 4 つで、説明文には書いていません（印の付き方は[OnPush と markForCheck の章](../cd/04-cd-onpush-markforcheck.md)、`ChangeDetectorRef` は[第 7 回](07-crd-lifecycle.md)）。

## 4. テンプレートとスタイルの指定

📄 `angular/packages/core/src/metadata/directives.ts` L565–603 （▶ の行: 566–567, 573–574, 580, 586, 591, 594, 601）

```ts
565 │   /**
566 ▶    * The relative path or absolute URL of a template file for an Angular component.
567 ▶    * If provided, do not supply an inline template using `template`.
568 │    *
569 │    */
570 │   templateUrl?: string;
571 │ 
572 │   /**
573 ▶    * An inline template for an Angular component. If provided,
574 ▶    * do not supply a template file using `templateUrl`.
575 │    *
576 │    */
577 │   template?: string;
578 │ 
579 │   /**
580 ▶    * One relative path or an absolute URL for file containing a CSS stylesheet to use
581 │    * in this component.
582 │    */
583 │   styleUrl?: string;
584 │ 
585 │   /**
586 ▶    * Relative paths or absolute URLs for files containing CSS stylesheets to use in this component.
587 │    */
588 │   styleUrls?: string[];
589 │ 
590 │   /**
591 ▶    * One or more inline CSS stylesheets to use
592 │    * in this component.
593 │    */
594 ▶   styles?: string | string[];
595 │ 
596 │   /**
597 │    * One or more animation `trigger()` calls, containing
598 │    * [`state()`](api/animations/state) and `transition()` definitions.
599 │    * See the [Animations guide](guide/animations) and animations API documentation.
600 │    *
601 ▶    * @deprecated 20.2 Use `animate.enter` or `animate.leave` instead. Intent to remove in v23
602 │    */
603 │   animations?: any[];
```

567・574 行目「両方は書かない」は、書いても止まりません。両方を書いた例は ngc がエラー 0 で、出力は `templateUrl` のファイルの中身でした（ngtsc の `parseTemplateDeclaration` が `component.has('templateUrl')` を先に見る、annotations/component/src/resources.ts L392・L424）。JIT は逆で、133 行目の `!Object.hasOwn(component, 'template')` のためにリソースの解決の列に積まず、`template` を描きました（DEMO 2）。同じソースが AOT と JIT で違うテンプレートになります。`styleUrl`（580 行目）と `styleUrls`（586 行目）の両方は、JIT ではリソースを解決するときの 6 節の 72〜77 行目が例外にしました。594 行目の `styles` は文字列 1 つか配列で、JIT では 6 節の 89〜91 行目が配列にそろえます。601 行目の `animations` は v20.2 から非推奨で、v23 で消す予定と書いています。

## 5. encapsulation と ViewEncapsulation

📄 `angular/packages/core/src/metadata/directives.ts` L605–628 （▶ の行: 608, 610–611, 613–614, 616–618, 623, 625）

```ts
605 │   /**
606 │    * An encapsulation policy for the component's styling.
607 │    * Possible values:
608 ▶    * - `ViewEncapsulation.Emulated`: Apply modified component styles in order to emulate
609 │    *                                 a native Shadow DOM CSS encapsulation behavior.
610 ▶    * - `ViewEncapsulation.None`: Apply component styles globally without any sort of encapsulation.
611 ▶    * - `ViewEncapsulation.ShadowDom`: Use the browser's native Shadow DOM API to encapsulate styles.
612 │    *
613 ▶    * If not supplied, the value is taken from the `CompilerOptions`
614 ▶    * which defaults to `ViewEncapsulation.Emulated`.
615 │    *
616 ▶    * If the policy is `ViewEncapsulation.Emulated` and the component has no
617 ▶    * {@link Component#styles styles} nor {@link Component#styleUrls styleUrls},
618 ▶    * the policy is automatically switched to `ViewEncapsulation.None`.
619 │    */
620 │   encapsulation?: ViewEncapsulation;
621 │ 
622 │   /**
623 ▶    * True to preserve or false to remove potentially superfluous whitespace characters
624 │    * from the compiled template. Whitespace characters are those matching the `\s`
625 ▶    * character class in JavaScript regular expressions. Default is false, unless
626 │    * overridden in compiler options.
627 │    */
628 │   preserveWhitespaces?: boolean;
```

📄 `angular/packages/core/src/metadata/view.ts` L9–40 （▶ の行: 18, 24, 26, 28, 32, 35–37）

```ts
 9 │ /**
10 │  * Defines the CSS styles encapsulation policies for the {@link /api/core/Component Component} decorator's
11 │  * `encapsulation` option.
12 │  *
13 │  * See {@link Component#encapsulation encapsulation}.
14 │  *
15 │  * @usageNotes
16 │  * ### Example
17 │  *
18 ▶  * {@example core/ts/metadata/encapsulation.ts region='longform'}
19 │  *
20 │  * @publicApi
21 │  */
22 │ export enum ViewEncapsulation {
23 │   /**
24 ▶    * Emulates a native Shadow DOM encapsulation behavior by adding a specific attribute to the
25 │    * component's host element and applying the same attribute to all the CSS selectors provided
26 ▶    * via {@link Component#styles styles} or {@link Component#styleUrls styleUrls}.
27 │    *
28 ▶    * This is the default option.
29 │    */
30 │   Emulated = 0,
31 │ 
32 ▶   // Historically the 1 value was for `Native` encapsulation which has been removed as of v11.
33 │ 
34 │   /**
35 ▶    * Doesn't provide any sort of CSS style encapsulation, meaning that all the styles provided
36 ▶    * via {@link Component#styles styles} or {@link Component#styleUrls styleUrls} are applicable
37 ▶    * to any HTML element of the application regardless of their host Component.
38 │    */
39 │   None = 2,
40 │ 
```

616〜618 行目「Emulated で styles も styleUrls も無ければ None に切り替える」は、コンパイラの `if (!hasStyles && meta.encapsulation === core.ViewEncapsulation.Emulated)`（compiler/src/render3/view/compiler.ts L290〜293、[shadow\_css の章](../compiler/18-compiler-shadow-css.md)）です。DEMO 1 の「encapsulation」で 5 つを描き、ホストと子の要素に付いた `_ng` の属性と、`<style>` がどこに入ったかを数えました。

- 指定なし + styles は `_nghost-…` と `_ngcontent-…` が付き、`<style>` は head に 1 つで、destroy のあと 0 に戻りました（613〜614 行目・view.ts 24〜28 行目のとおり Emulated が既定）。
- styles が無いもの、空白だけの `styles: ' '` は、どちらも属性が付きません。空白だけの styles も「無い」に入るのは、`style.trim().length > 0` のものだけを数えるからです（compiler.ts L271〜287。spec の `should be off for a component with empty styles`）。617 行目は `styleUrl` を挙げていませんが、外部のスタイル（`externalStyles`）も同じに数えられます。
- None は属性が付かず、`<style>` はそのまま head に入ります（view.ts 35〜37 行目の「どの要素にも効く」）。
- ShadowDom は host に shadowRoot ができ、head には何も入りません。shadowRoot の中の `<style>` は、このコンポーネントの 1 つのほかに、`SharedStylesHost` がそれまでに持っていたほかのコンポーネントの styles の写しも入りました（platform-browser の shared\_styles\_host.ts L214〜220 の `addHost`）。view.ts の `ExperimentalIsolatedShadowDom`（L47〜54、[カプセル化の章](../domr/06-domr-encapsulation.md)が引いている）はこの写しをしないものです。

18 行目の例（packages/examples/core/ts/metadata/encapsulation.ts L12〜34）は ngc にそのまま通ります。32 行目のコメントのとおり、1 は昔の `Native` の番号で、v11 で消えたので欠番です。

> **🧪 DEMO 1 — @Component・@Input・@HostListener・@Pipe の約束を本物で試す**
>
> 押すと、本物の `@angular/core`（22.2.6）で小さなコンポーネントを `createComponent` で作り（文書に付けない div の上）、`detectChanges` して DOM を読み、destroy します。このページは AOT でコンパイルされています。「@HostBinding・@HostListener」は window に `resize` を 2 回、`keydown`（a と Enter）を 1 回ずつ dispatch します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-component)

## 6. JIT のリソースの解決：resolveComponentResources

📄 `angular/packages/core/src/metadata/resource_loading.ts` L13–48 （▶ の行: 13, 16, 29–30, 36, 38, 43–44, 46–47）

````ts
13 ▶ let componentResourceResolutionQueue = new Map<Type<any>, Component>();
14 │ 
15 │ // Track when existing ɵcmp for a Type is waiting on resources.
16 ▶ const componentDefPendingResolution = new Set<Type<any>>();
17 │ 
18 │ /**
19 │  * Used to resolve resource URLs on `@Component` when used with JIT compilation.
20 │  *
21 │  * Example:
22 │  * ```ts
23 │  * @Component({
24 │  *   selector: 'my-comp',
25 │  *   templateUrl: 'my-comp.html', // This requires asynchronous resolution
26 │  * })
27 │  * class MyComponent { }
28 │  *
29 ▶  * // Calling `renderComponent` will fail because `renderComponent` is a synchronous process
30 ▶  * // and `MyComponent`'s `@Component.templateUrl` needs to be resolved asynchronously.
31 │  *
32 │  * // Calling `resolveComponentResources()` will resolve `@Component.templateUrl` into
33 │  * // `@Component.template`, which allows `renderComponent` to proceed in a synchronous manner.
34 │  *
35 │  * // Use browser's `fetch()` function as the default resource resolution strategy.
36 ▶  * resolveComponentResources(fetch).then(() => {
37 │  * // After resolution all URLs have been converted into `template` strings.
38 ▶  * renderComponent(MyComponent);
39 │  * });
40 │  *
41 │  * ```
42 │  *
43 ▶  * @remarks In AOT the resolution happens during compilation, and so there should be no need
44 ▶  * to call this method outside JIT mode.
45 │  *
46 ▶  * @param resourceResolver a function which is responsible for returning a `Promise` to the
47 ▶  * contents of the resolved URL. Browser's `fetch()` method is a good default implementation.
48 │  */
````

この関数は `ɵresolveComponentResources` として私的に export されていて（core\_private\_export.ts L134）、使うのは JIT で `templateUrl` を持つコンポーネントを動かす TestBed などです。43〜44 行目のとおり AOT ではコンパイルの間に読むので呼ぶことはありません。29・38 行目の `renderComponent` は、8d2e5e6c4f5（2022-06-29、`refactor(core): remove experimental renderComponent function (#46605)`）で消えた関数で、例をそのまま tsc にかけると `TS2552: Cannot find name 'renderComponent'.` です。今なら `createComponent` か `bootstrapApplication` を呼ぶ所です。

📄 `angular/packages/core/src/metadata/resource_loading.ts` L49–78 （▶ の行: 52–53, 56, 59, 65–66, 68, 72–75, 77）

```ts
49 │ export async function resolveComponentResources(
50 │   resourceResolver: (url: string) => Promise<string | {text(): Promise<string>; status?: number}>,
51 │ ): Promise<void> {
52 ▶   const currentQueue = componentResourceResolutionQueue;
53 ▶   componentResourceResolutionQueue = new Map();
54 │ 
55 │   // Cache so that we don't fetch the same resource more than once.
56 ▶   const urlCache = new Map<string, Promise<string>>();
57 │ 
58 │   // Helper to dedupe resource fetches
59 ▶   function cachedResourceResolve(url: string): Promise<string> {
60 │     const promiseCached = urlCache.get(url);
61 │     if (promiseCached) {
62 │       return promiseCached;
63 │     }
64 │ 
65 ▶     const promise = resourceResolver(url).then((response) => unwrapResponse(url, response));
66 ▶     urlCache.set(url, promise);
67 │ 
68 ▶     return promise;
69 │   }
70 │ 
71 │   const resolutionPromises = Array.from(currentQueue).map(async ([type, component]) => {
72 ▶     if (component.styleUrl && component.styleUrls?.length) {
73 ▶       throw new Error(
74 ▶         '@Component cannot define both `styleUrl` and `styleUrls`. ' +
75 ▶           'Use `styleUrl` if the component has one stylesheet, or `styleUrls` if it has multiple',
76 │       );
77 ▶     }
78 │ 
```

📄 `angular/packages/core/src/metadata/resource_loading.ts` L79–115 （▶ の行: 81, 84, 89–91, 94–96, 100, 102–103, 111）

```ts
 79 │     const componentTasks: Promise<void>[] = [];
 80 │ 
 81 ▶     if (component.templateUrl) {
 82 │       componentTasks.push(
 83 │         cachedResourceResolve(component.templateUrl).then((template) => {
 84 ▶           component.template = template;
 85 │         }),
 86 │       );
 87 │     }
 88 │ 
 89 ▶     const styles =
 90 ▶       typeof component.styles === 'string' ? [component.styles] : (component.styles ?? []);
 91 ▶     component.styles = styles;
 92 │ 
 93 │     let {styleUrl, styleUrls} = component;
 94 ▶     if (styleUrl) {
 95 ▶       styleUrls = [styleUrl];
 96 ▶       component.styleUrl = undefined;
 97 │     }
 98 │ 
 99 │     if (styleUrls?.length) {
100 ▶       const allFetched = Promise.all(styleUrls.map((url) => cachedResourceResolve(url))).then(
101 │         (fetchedStyles) => {
102 ▶           styles.push(...fetchedStyles);
103 ▶           component.styleUrls = undefined;
104 │         },
105 │       );
106 │ 
107 │       componentTasks.push(allFetched);
108 │     }
109 │ 
110 │     await Promise.all(componentTasks);
111 ▶     componentDefPendingResolution.delete(type);
112 │   });
113 │ 
114 │   await Promise.all(resolutionPromises);
115 │ }
```

📄 `angular/packages/core/src/metadata/resource_loading.ts` L117–155 （▶ の行: 121–124, 131, 133, 135–136, 139, 145–146, 151）

```ts
117 │ export function maybeQueueResolutionOfComponentResources(
118 │   type: Type<any>,
119 │   metadata: Component,
120 │ ): void {
121 ▶   if (componentNeedsResolution(metadata)) {
122 ▶     componentResourceResolutionQueue.set(type, metadata);
123 ▶     componentDefPendingResolution.add(type);
124 ▶   }
125 │ }
126 │ 
127 │ export function isComponentDefPendingResolution(type: Type<any>): boolean {
128 │   return componentDefPendingResolution.has(type);
129 │ }
130 │ 
131 ▶ export function componentNeedsResolution(component: Component): boolean {
132 │   return !!(
133 ▶     (component.templateUrl && !Object.hasOwn(component, 'template')) ||
134 │     component.styleUrls?.length ||
135 ▶     component.styleUrl
136 ▶   );
137 │ }
138 │ 
139 ▶ export function clearResolutionOfComponentResourcesQueue(): Map<Type<any>, Component> {
140 │   const old = componentResourceResolutionQueue;
141 │   componentResourceResolutionQueue = new Map();
142 │   return old;
143 │ }
144 │ 
145 ▶ export function restoreComponentResolutionQueue(queue: Map<Type<any>, Component>): void {
146 ▶   componentDefPendingResolution.clear();
147 │   for (const type of queue.keys()) {
148 │     componentDefPendingResolution.add(type);
149 │   }
150 │   componentResourceResolutionQueue = queue;
151 ▶ }
152 │ 
153 │ export function isComponentResourceResolutionQueueEmpty(): boolean {
154 │   return componentResourceResolutionQueue.size === 0;
155 │ }
```

📄 `angular/packages/core/src/metadata/resource_loading.ts` L157–173 （▶ の行: 161–163, 165–168, 172）

```ts
157 │ async function unwrapResponse(
158 │   url: string,
159 │   response: string | {text(): Promise<string>; status?: number},
160 │ ): Promise<string> {
161 ▶   if (typeof response === 'string') {
162 ▶     return response;
163 ▶   }
164 │ 
165 ▶   if (response.status !== undefined && response.status !== 200) {
166 ▶     throw new RuntimeError(
167 ▶       RuntimeErrorCode.EXTERNAL_RESOURCE_LOADING_FAILED,
168 ▶       ngDevMode && `Could not load resource: ${url}. Response status: ${response.status}`,
169 │     );
170 │   }
171 │ 
172 ▶   return response.text();
173 │ }
```

1. **JIT の compileComponent が列に積む**

   121〜124 行目：`componentNeedsResolution`（131〜136 行目）が真なら、型と metadata を `componentResourceResolutionQueue` に入れ、`componentDefPendingResolution` に型を足します。133 行目のとおり `template` を自分で持っていれば `templateUrl` があっても積みません。
2. **呼ぶ前に作ると例外**

   記録では、解決の前の `createComponent` が `Component 'R' is not resolved: - templateUrl: r.html - styleUrl: r.css Did you run and wait for 'resolveComponentResources()'?` でした（開発モードと本番で同じ文）。
3. **列を取り替えてから読む**

   52〜53 行目で今の列を手元に取って新しい空の列にし、59〜68 行目の `urlCache` で同じ URL は 1 回しか読みません。記録では、同じ `templateUrl` の 2 つのコンポーネントで resolver を呼んだのは 1 回でした。
4. **metadata を書き換える**

   84 行目で `component.template` に読んだ文字列を入れ、94〜96 行目で `styleUrl` を `styleUrls` の 1 つにして消し、102〜103 行目で読んだ CSS を `styles` の後ろに足して `styleUrls` を消します。111 行目で保留の印を外します。
5. **応答の形**

   161〜163 行目の文字列はそのまま、`{text(), status}` は 165 行目で `status !== 200` なら `NG0918`、それ以外は 172 行目の `text()` です。記録では 404・204・0 のどれも `NG0918: Could not load resource: e.html. Response status: …` で、本番では `NG0918` だけでした（168 行目の `ngDevMode &&`）。この確かめは 648bbb097e8（2025-08-04、#62992）で入ったもので、46〜47 行目「`fetch()` がよい既定」のとおり `fetch` を渡すと、204 や `file://` の 0 も失敗になります。

139〜151 行目の `clearResolutionOfComponentResourcesQueue` と `restoreComponentResolutionQueue` は、TestBed が自分の外で積まれた列を一度よけて戻すためのものです（ngmodule-testbed の章の TestBed の流れ）。

> **🧪 DEMO 2 — JIT と TestBed の記録（Node、開発モードと本番）**
>
> 押すと、手元の記録スクリプトを Node（domino の上の JIT、`@angular/core` 22.2.6）で走らせた結果を並べます。TestBed は開発モードで使うものなので、本番の列は空けています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-component)

## 7. @Pipe：名前と pure

📄 `angular/packages/core/src/metadata/directives.ts` L699–722 （▶ の行: 703, 706, 708–710）

````ts
699 │    * For example, if the name is "myPipe", use a template binding expression
700 │    * such as the following:
701 │    *
702 │    * ```html
703 ▶    * {{ exp | myPipe }}
704 │    * ```
705 │    *
706 ▶    * The result of the expression is passed to the pipe's `transform()` method.
707 │    *
708 ▶    * A pipe must belong to an NgModule in order for it to be available
709 ▶    * to a template. To make it a member of an NgModule,
710 ▶    * list it in the `declarations` field of the `NgModule` metadata.
711 │    *
712 │    * @see [Pipes](/guide/templates/pipes)
713 │    *
714 │    */
715 │   (obj: Pipe): TypeDecorator;
716 │ 
717 │   /**
718 │    * See the `Pipe` decorator.
719 │    */
720 │   new (obj: Pipe): Pipe;
721 │ }
722 │ 
````

📄 `angular/packages/core/src/metadata/directives.ts` L723–745 （▶ の行: 731–732, 737–739, 742–744）

```ts
723 │ /**
724 │  * Type of the Pipe metadata.
725 │  *
726 │  * @publicApi
727 │  */
728 │ export interface Pipe {
729 │   /**
730 │    * The pipe name to use in template bindings.
731 ▶    * Typically uses lowerCamelCase
732 ▶    * because the name cannot contain hyphens.
733 │    */
734 │   name: string;
735 │ 
736 │   /**
737 ▶    * When true, the pipe is pure, meaning that the
738 ▶    * `transform()` method is invoked only when its input arguments
739 ▶    * change. Pipes are pure by default.
740 │    *
741 │    * If the pipe has internal state (that is, the result
742 ▶    * depends on state other than its arguments), set `pure` to false.
743 ▶    * In this case, the pipe is invoked on each change-detection cycle,
744 ▶    * even if the arguments have not changed.
745 │    */
```

708〜710 行目「pipe は NgModule に属さないとテンプレートで使えない」は、standalone が既定になる前の説明です。DEMO 1 の `@Pipe` の 2 つは `standalone` を書かずにコンポーネントの `imports` に入れて動いています（古いだけで、NgModule の `declarations` に入れる形も今も動く）。pure の既定（props の `{pure: true, ...p}`、L761）と pipe の定義は[pipe の定義の章](../pipe/02-pipe-class-def.md)が引いています。

- 731〜732 行目「名前に `-` を含められない」は、宣言では止まりません。`name: 'my-pipe'` の宣言だけなら ngc はエラー 0 で、使った所が `NG5002: Parser Error: Unexpected token '-'` と `NG8004: No pipe found with name 'my'.` になりました。式のパーサーが `-` を引き算として読むからです。
- 737〜744 行目の pure は、同じ引数で `detectChanges` を 3 回すると pure の `transform` が 1 回・`pure: false` が 3 回、引数を替えた 4 回目でそれぞれ 2 回・4 回でした（[pipe の仕組みの章](../cmn/06-cmn-pipe-mechanism.md)のキャッシュ）。

## 8. @Input と @Output

📄 `angular/packages/core/src/metadata/directives.ts` L767–785 （▶ の行: 772–774, 778–781）

```ts
767 │ /**
768 │  * @publicApi
769 │  */
770 │ export interface InputDecorator {
771 │   /**
772 ▶    * Decorator that marks a class field as an input property and supplies configuration metadata.
773 ▶    * The input property is bound to a DOM property in the template. During change detection,
774 ▶    * Angular automatically updates the data property with the DOM property's value.
775 │    *
776 │    * @usageNotes
777 │    *
778 ▶    * You can supply an optional name to use in templates when the
779 ▶    * component is instantiated, that maps to the
780 ▶    * name of the bound property. By default, the original
781 ▶    * name of the bound property is used for input binding.
782 │    *
783 │    * The following example creates a component with two input properties,
784 │    * one of which is given a special binding name.
785 │    *
```

📄 `angular/packages/core/src/metadata/directives.ts` L786–825 （▶ の行: 786, 800, 804, 806, 808, 814, 817, 823）

````ts
786 ▶    * ```ts
787 │    * import { Component, Input, numberAttribute, booleanAttribute } from '@angular/core';
788 │    * @Component({
789 │    *   selector: 'bank-account',
790 │    *   template: `
791 │    *     Bank Name: {{bankName}}
792 │    *     Account Id: {{id}}
793 │    *     Account Status: {{status ? 'Active' : 'InActive'}}
794 │    *   `
795 │    * })
796 │    * class BankAccount {
797 │    *   // This property is bound using its original name.
798 │    *   // Defining argument required as true inside the Input Decorator
799 │    *   // makes this property declaration as mandatory
800 ▶    *   @Input({ required: true }) bankName!: string;
801 │    *   // Argument alias makes this property value is bound to a different property name
802 │    *   // when this component is instantiated in a template.
803 │    *   // Argument transform convert the input value from string to number
804 ▶    *   @Input({ alias:'account-id', transform: numberAttribute }) id: number;
805 │    *   // Argument transform the input value from string to boolean
806 ▶    *   @Input({ transform: booleanAttribute }) status: boolean;
807 │    *   // this property is not bound, and is not automatically updated by Angular
808 ▶    *   normalizedBankName: string;
809 │    * }
810 │    *
811 │    * @Component({
812 │    *   selector: 'app',
813 │    *   template: `
814 ▶    *     <bank-account bankName="RBC" account-id="4747" status="true"></bank-account>
815 │    *   `
816 │    * })
817 ▶    * class App {}
818 │    * ```
819 │    *
820 │    * @see [Input properties](guide/components/inputs)
821 │    * @see [Output properties](guide/components/outputs)
822 │    */
823 ▶   (arg?: string | Input): any;
824 │   new (arg?: string | Input): any;
825 │ }
````

814 行目のテンプレートは、DEMO 1 の「@Input・@Output と transform」で `Bank Name: RBC Account Id: 4747 Account Status: Active` でした（800〜808 行目に初期値を足し、`App` に `imports` を足したもの）。そのままの例は strict の tsc で 804・806・808 行目の 3 つが `TS2564`、初期値を足すと `NG8001: 'bank-account' is not a known element` です。773〜774 行目「input は DOM の property に結ばれ、変更検知のたびに DOM の property の値でデータを更新する」は、向きと相手が違います。input に入るのは親のテンプレートの式（か静的な属性の文字列）の値で、DOM の property からは読みません。

📄 `angular/packages/core/src/metadata/directives.ts` L826–861 （▶ の行: 834–836, 841, 846, 849, 851, 856–858, 860）

```ts
826 │ 
827 │ /**
828 │  * Type of metadata for an `Input` property.
829 │  *
830 │  * @publicApi
831 │  */
832 │ export interface Input {
833 │   /**
834 ▶    * The name of the DOM property to which the input property is bound.
835 ▶    */
836 ▶   alias?: string;
837 │ 
838 │   /**
839 │    * Whether the input is required for the directive to function.
840 │    */
841 ▶   required?: boolean;
842 │ 
843 │   /**
844 │    * Function with which to transform the input value before assigning it to the directive instance.
845 │    */
846 ▶   transform?: (value: any) => any;
847 │ 
848 │   /**
849 ▶    * @internal
850 │    *
851 ▶    * Whether the input is a signal input.
852 │    *
853 │    * This option exists for JIT compatibility. Users are not expected to use this.
854 │    * Angular needs a way to capture inputs from classes so that the internal data
855 │    * structures can be set up. This needs to happen before the component is instantiated.
856 ▶    * Due to this, for JIT compilation, signal inputs need an additional decorator
857 ▶    * declaring the input. Angular provides a TS transformer to automatically handle this
858 ▶    * for JIT usage (e.g. in tests).
859 │    */
860 ▶   isSignal?: boolean;
861 │ }
```

📄 `angular/packages/core/src/metadata/directives.ts` L862–875 （▶ の行: 869–871, 873）

```ts
862 │ 
863 │ /**
864 │  * @Annotation
865 │  * @publicApi
866 │  */
867 │ export const Input: InputDecorator = makePropDecorator(
868 │   'Input',
869 ▶   (arg?: string | {alias?: string; required?: boolean}) => {
870 ▶     if (!arg) {
871 ▶       return {};
872 │     }
873 ▶     return typeof arg === 'string' ? {alias: arg} : arg;
874 │   },
875 │ );
```

873 行目のとおり、文字列 1 つの `@Input('crdcLabel')` は `{alias: 'crdcLabel'}` の省略です。869 行目の引数の型には `transform` が無いのに、`Input` インターフェース（846 行目）には有るので、型は 823 行目の `(arg?: string | Input)` の方で決まり、props の関数は渡された物をそのまま返します。849〜860 行目の `isSignal` は、JIT で `input()` を見つけるために TS の変換が足すデコレーターの印です（[input() の章](../signals/12-signals-input-compile.md)）。transform に使う 2 つの関数（util/coercion.ts L23〜25・L41〜47）を、DEMO 1 で 14 と 10 の値に通しました。

- `booleanAttribute` は `value != null && value !== 'false'` なので、`''`・`'FALSE'`・`'0'`・`0`・`[]` が `true`、`false` になるのは `'false'`・`false`・`null`・`undefined` だけでした。値を書かない属性（`<x status>` の `''`）を真にするための形です。
- `numberAttribute` は `parseFloat` と `Number` の両方で数に読めるものだけを受け、`' 42 '`・`'4.2e1'`・`'0x2A'` が `42`、`'42px'`・`''`・`null`・`true` が fallback（既定 `NaN`）でした。814 行目の例に `account-id="12abc"` を渡すと `Account Id: NaN` です。

📄 `angular/packages/core/src/metadata/directives.ts` L877–902 （▶ の行: 884–885, 889, 892, 894）

```ts
877 │ /**
878 │  * Type of the Output decorator / constructor function.
879 │  *
880 │  * @publicApi
881 │  */
882 │ export interface OutputDecorator {
883 │   /**
884 ▶    * Decorator that marks a class field as an output property and supplies configuration metadata.
885 ▶    * The DOM property bound to the output property is automatically updated during change detection.
886 │    *
887 │    * @usageNotes
888 │    *
889 ▶    * You can supply an optional name to use in templates when the
890 │    * component is instantiated, that maps to the
891 │    * name of the bound property. By default, the original
892 ▶    * name of the bound property is used for output binding.
893 │    *
894 ▶    * See `Input` decorator for an example of providing a binding name.
895 │    *
896 │    * @see [Input properties](guide/components/inputs)
897 │    * @see [Output properties](guide/components/outputs)
898 │    *
899 │    */
900 │   (alias?: string): any;
901 │   new (alias?: string): any;
902 │ }
```

📄 `angular/packages/core/src/metadata/directives.ts` L903–920 （▶ の行: 911, 913, 920）

```ts
903 │ 
904 │ /**
905 │  * Type of the Output metadata.
906 │  *
907 │  * @publicApi
908 │  */
909 │ export interface Output {
910 │   /**
911 ▶    * The name of the DOM property to which the output property is bound.
912 │    */
913 ▶   alias?: string;
914 │ }
915 │ 
916 │ /**
917 │  * @Annotation
918 │  * @publicApi
919 │  */
920 ▶ export const Output: OutputDecorator = makePropDecorator('Output', (alias?: string) => ({alias}));
```

885 行目「output に結ばれた DOM の property は変更検知のときに更新される」と 911 行目「alias は output が結ばれる DOM の property の名前」は、どちらも output の働きと違います。output はイベントで、変更検知とは関係なく `emit` したときに親のテンプレートの `(…)` が呼ばれます。DEMO 1 では `@Output('crdcDone')` に `emit('emitted')` して、親の `(crdcDone)` が値を受けました。894 行目は「Input の例を見よ」ですが、`@Input` の例（786〜817 行目）に output はありません。

## 9. @HostBinding と @HostListener

📄 `angular/packages/core/src/metadata/directives.ts` L922–940 （▶ の行: 929–931, 935–936）

```ts
922 │ /**
923 │  * Type of the HostBinding decorator / constructor function.
924 │  *
925 │  * @publicApi
926 │  */
927 │ export interface HostBindingDecorator {
928 │   /**
929 ▶    * Decorator that marks a DOM property or an element class, style or attribute as a host-binding
930 ▶    * property and supplies configuration metadata. Angular automatically checks host bindings during
931 ▶    * change detection, and if a binding changes it updates the host element of the directive.
932 │    *
933 │    * @usageNotes
934 │    *
935 ▶    * NOTE:  **Always** prefer using the [`host` property](guide/components/host-elements#binding-to-the-host-element) over `@HostBinding`.
936 ▶    * This decorator exist exclusively for backwards compatibility.
937 │    *
938 │    * The following example creates a directive that sets the `valid` and `invalid`
939 │    * class, a style color, and an id on the DOM element that has an `ngModel` directive on it.
940 │    *
```

📄 `angular/packages/core/src/metadata/directives.ts` L941–974 （▶ の行: 941, 944, 953, 956–957, 960, 962, 967–968, 972）

````ts
941 ▶    * ```ts
942 │    * @Directive({selector: '[ngModel]'})
943 │    * class NgModelStatus {
944 ▶    *   constructor(public control: NgModel) {}
945 │    *   // class bindings
946 │    *   @HostBinding('class.valid') get valid() { return this.control.valid; }
947 │    *   @HostBinding('class.invalid') get invalid() { return this.control.invalid; }
948 │    *
949 │    *   // style binding
950 │    *   @HostBinding('style.color') get color() { return this.control.valid ? 'green': 'red'; }
951 │    *
952 │    *   // style binding also supports a style unit extension
953 ▶    *   @HostBinding('style.width.px') @Input() width: number = 500;
954 │    *
955 │    *   // attribute binding
956 ▶    *   @HostBinding('attr.aria-required')
957 ▶    *   @Input() required: boolean = false;
958 │    *
959 │    *   // property binding
960 ▶    *   @HostBinding('id') get id() { return this.control.value?.length ? 'odd':  'even'; }
961 │    *
962 ▶    * @Component({
963 │    *   selector: 'app',
964 │    *   template: `<input [(ngModel)]="prop">`,
965 │    * })
966 │    * class App {
967 ▶    *   prop;
968 ▶    * }
969 │    * ```
970 │    *
971 │    */
972 ▶   (hostPropertyName?: string): any;
973 │   new (hostPropertyName?: string): any;
974 │ }
````

📄 `angular/packages/core/src/metadata/directives.ts` L975–999 （▶ の行: 983, 985–987, 989, 998）

```ts
975 │ 
976 │ /**
977 │  * Type of the HostBinding metadata.
978 │  *
979 │  * @publicApi
980 │  */
981 │ export interface HostBinding {
982 │   /**
983 ▶    * The DOM property that is bound to a data property.
984 │    * This field also accepts:
985 ▶    *   * classes, prefixed by `class.`
986 ▶    *   * styles, prefixed by `style.`
987 ▶    *   * attributes, prefixed by `attr.`
988 │    */
989 ▶   hostPropertyName?: string;
990 │ }
991 │ 
992 │ /**
993 │  * @Annotation
994 │  * @publicApi
995 │  */
996 │ export const HostBinding: HostBindingDecorator = makePropDecorator(
997 │   'HostBinding',
998 ▶   (hostPropertyName?: string) => ({hostPropertyName}),
999 │ );
```

941〜968 行目の例は、960 行目の後ろにクラスの閉じ括弧が無く、962 行目の `@Component` がクラスの中に入って `TS1434` などになります。`}` を足し、`FormsModule` と `NgModelStatus` を `App` の `imports` に入れ、967 行目の `prop;` に初期値を足すとエラー 0 でした。972 行目の引数は省けて、DEMO 1 の `@HostBinding() title` はフィールドの名前の `title` に結ばれました（説明文には無い）。`'class.valid'`・`'style.width.px'`・`'attr.aria-required'` は 985〜987 行目のとおり `class="valid"`・`style="width: 500px;"`・`aria-required="false"` です。

📄 `angular/packages/core/src/metadata/directives.ts` L1001–1041 （▶ の行: 1011–1012, 1014, 1018, 1029–1030）

````ts
1001 │ /**
1002 │  * Type of the HostListener decorator / constructor function.
1003 │  *
1004 │  * @publicApi
1005 │  */
1006 │ export interface HostListenerDecorator {
1007 │   /**
1008 │    * Decorator that declares a DOM event to listen for,
1009 │    * and provides a handler method to run when that event occurs.
1010 │    *
1011 ▶    * Angular invokes the supplied handler method when the host element emits the specified event,
1012 ▶    * and updates the bound element with the result.
1013 │    *
1014 ▶    * If the handler method returns false, applies `preventDefault` on the bound element.
1015 │    *
1016 │    * @usageNotes
1017 │    *
1018 ▶    * NOTE:  **Always** prefer using the [`host` property](guide/components/host-elements#binding-to-the-host-element) over `@HostListener`.
1019 │    * This decorator exist exclusively for backwards compatibility.
1020 │    *
1021 │    * The following example declares a directive
1022 │    * that attaches a click listener to a button and counts clicks.
1023 │    *
1024 │    * ```ts
1025 │    * @Directive({selector: 'button[counting]'})
1026 │    * class CountClicks {
1027 │    *   numberOfClicks = 0;
1028 │    *
1029 ▶    *   @HostListener('click', ['$event.target'])
1030 ▶    *   onClick(btn) {
1031 │    *     console.log('button', btn, 'number of clicks:', this.numberOfClicks++);
1032 │    *   }
1033 │    * }
1034 │    *
1035 │    * @Component({
1036 │    *   selector: 'app',
1037 │    *   template: '<button counting>Increment</button>',
1038 │    * })
1039 │    * class App {}
1040 │    * ```
1041 │    *
````

📄 `angular/packages/core/src/metadata/directives.ts` L1042–1077 （▶ の行: 1056–1057, 1069, 1071–1072, 1075）

````ts
1042 │    * The following example registers another DOM event handler that listens for `Enter` key-press
1043 │    * events on the global `window`.
1044 │    * ```angular-ts
1045 │    * import { HostListener, Component } from "@angular/core";
1046 │    *
1047 │    * @Component({
1048 │    *   selector: 'app',
1049 │    *   template: `
1050 │    *    <h1>Hello, you have pressed enter {{counter}} number of times!</h1>
1051 │    *      Press enter  key to increment the counter.
1052 │    *    <button (click)="resetCounter()">Reset Counter</button>`
1053 │    * })
1054 │    * class AppComponent {
1055 │    *   counter = 0;
1056 ▶    *   @HostListener('window:keydown.enter', ['$event'])
1057 ▶    *   handleKeyDown(event: KeyboardEvent) {
1058 │    *     this.counter++;
1059 │    *   }
1060 │    *   resetCounter() {
1061 │    *     this.counter = 0;
1062 │    *   }
1063 │    * }
1064 │    * ```
1065 │    * The list of valid key names for `keydown` and `keyup` events
1066 │    * can be found here:
1067 │    * https://www.w3.org/TR/DOM-Level-3-Events-key/#named-key-attribute-values
1068 │    *
1069 ▶    * NOTE: that keys can also be combined, e.g. `@HostListener('keydown.shift.a')`.
1070 │    *
1071 ▶    * The global target names that can be used to prefix an event name are
1072 ▶    * `document:`, `window:` and `body:`.
1073 │    *
1074 │    */
1075 ▶   (eventName: string, args?: string[]): any;
1076 │   new (eventName: string, args?: string[]): any;
1077 │ }
````

📄 `angular/packages/core/src/metadata/directives.ts` L1078–1102 （▶ の行: 1088, 1092, 1101）

```ts
1078 │ 
1079 │ /**
1080 │  * Type of the HostListener metadata.
1081 │  *
1082 │  * @publicApi
1083 │  */
1084 │ export interface HostListener {
1085 │   /**
1086 │    * The DOM event to listen for.
1087 │    */
1088 ▶   eventName?: string;
1089 │   /**
1090 │    * A set of arguments to pass to the handler method when the event occurs.
1091 │    */
1092 ▶   args?: string[];
1093 │ }
1094 │ 
1095 │ /**
1096 │  * @Annotation
1097 │  * @publicApi
1098 │  */
1099 │ export const HostListener: HostListenerDecorator = makePropDecorator(
1100 │   'HostListener',
1101 ▶   (eventName?: string, args?: string[]) => ({eventName, args}),
1102 │ );
```

- 1012 行目「handler の結果で bound element を更新する」は 13d82ce248a（2021-02-05、#40720）の文で、実際は何も更新しません。DEMO 1 で `'returned value'` を返しても要素は変わらず、返り値は 1014 行目の `false` かどうかだけが見られます（[第 1 回](01-crd-directive.md)の 7 節、listeners.ts L92）。
- 1092 行目の `args` は文字列のまま式として読まれ、`['$event.target', '"literal"', '1 + 1']` は `SPAN・literal・2` の 3 つの引数になりました。
- `'window:resize'` は window の `resize` を 1 回聞き、destroy のあとは聞きません。`'window:keydown.enter'` は a では呼ばれず Enter で 1 回、1069 行目の `'keydown.shift.a'` は Shift+A だけで 1 回でした。
- 1056〜1057 行目の例は、strictTemplates の ngc で `TS2345: Argument of type 'Event' is not assignable to parameter of type 'KeyboardEvent'.` です。`'keydown'`・`'window:keydown'` なら `$event` は `KeyboardEvent` ですが、キーの修飾を付けた `'keydown.enter'` は `Event` になります（テンプレートの `(keydown.enter)` も同じ。開いている issue [#40778](https://github.com/angular/angular/issues/40778)）。
- 1075 行目の `eventName` は必須の `string` ですが、`@HostListener('')` も ngc を通り、`new Event('')` を dispatch すると呼ばれました。

## 説明文の例を ngc にかける

📄 `例を 1 つずつ strict + strictTemplates の ngc にかけた結果（2026-11-21、手元の記録）`

```
# 説明文の例を 1 つずつ、strict の tsc と strictTemplates の ngc（@angular/compiler-cli 22.2.6）にかける
viewproviders.ts（L434-459）       NG8001: 'needs-greeter' is not a known element
  └ imports: [NeedsGreeter] で     エラー 0
input.ts（L787-817）               TS2564: Property 'id' ... ・ 'status' ... ・ 'normalizedBankName' has no initializer ...
  └ 初期値を足すと                 NG8001: 'bank-account' is not a known element
  └ imports: [BankAccount] も      エラー 0
hostbinding.ts（L942-968）         TS1434: Unexpected keyword or identifier.（L962 の @Component がクラスの中）ほか 2 つ
  └ } と FormsModule・prop の初期値 エラー 0
hostlistener1.ts（L1025-1039）     TS7006: Parameter 'btn' implicitly has an 'any' type.
  └ btn に型・App に imports        エラー 0
hostlistener2.ts（L1045-1063）     TS2345: Argument of type 'Event' is not assignable to parameter of type 'KeyboardEvent'.
  └ 引数の型を Event にすると       エラー 0
  # 'keydown'・'window:keydown' なら KeyboardEvent、'keydown.enter'・'window:keydown.enter' は Event（テンプレートの (keydown.enter) も同じ）
hostlistener-empty.ts               エラー 0（@HostListener('') と @HostBinding()）
pipe-hyphen-decl.ts                 エラー 0（name: 'my-pipe' を宣言するだけ）
pipe-hyphen.ts                      NG5002: Parser Error: Unexpected token '-' ... ・ NG8004: No pipe found with name 'my'.
resource.ts（resource_loading.ts L23-39）  TS2552: Cannot find name 'renderComponent'.
encapsulation-ex.ts（view.ts L18 の例） エラー 0
both.ts（template と templateUrl を両方） エラー 0。出力は templateUrl のファイルの <p>u</p>
```

## ここまでの呼び出し

- 👤 `@Component({selector, template})` — changeDetection を書かない
  - `makeDecorator('Component', props, Directive, undefined, typeFn)` — directives.ts L680〜686
    - `new DecoratorFactory(meta)` → props → `{changeDetection: Eager, ...c}` — L682 — *\_\_annotations\_\_ に入る*
    - `typeFn(cls, meta)` → `compileComponent(type, meta)` — L685、util/decorators.ts L68 — *props を通す前の meta*
      - `ɵɵdefineComponent` → `onPush: changeDetection !== Eager` — render3/definition.ts L352 — *OnPush*
  - 👤 `TestBed.overrideTemplate(Cmp, …)`
    - `__annotations__` の metadata + override → `compileComponent` — testing/src/test\_bed\_compiler.ts — *Eager*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `packages/core/test/acceptance/component_spec.ts` | `encapsulation › should be off for a component with no styles`（261）・`should be off for a component with empty styles`（272） | 5 節の None への切り替え |
| `packages/core/test/acceptance/change_detection_spec.ts` | `should skip OnPush components in update mode when they are not dirty`（466）・`should check OnPush components in update mode when inputs change`（480） | 3 節の OnPush。`new Component({})` と TestBed の override の it は #69898 が足すまで無い |
| `packages/core/test/linker/integration_spec.ts` | `whitespaces in templates` の 3 つ（2087〜2129） | 2 節。1 つ目の名前 `should not remove whitespaces by default` は、f1a063298e9 で期待を `toBe(3)` から `toBe(2)`（消える）に変えたときに名前だけ残った |
| `packages/core/test/acceptance/directive_spec.ts` | `should transform incoming static input values`（818） | 8 節の transform |
| `packages/core/test/acceptance/listener_spec.ts` | `should support global host listeners on components`（765） | 9 節の window: |
| `packages/core/test/metadata/resource_loading_spec.ts` | `resource_loading` の 14 の it（`should cache multiple resolution to same URL` 92・`should throw if both styleUrls and styleUrl are passed in` 169・`should fail when fetch is resolving to a 404` 202 ほか） | 6 節。200 以外の 2xx の it は無い |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
should be off for a component with no styles                        Ran 1 of 2693 specs、0 failures
should be off for a component with empty styles                     Ran 1 of 2693 specs、0 failures
should check OnPush components in update mode when inputs change    Ran 1 of 2693 specs、0 failures
should skip OnPush components in update mode when they are not dirty Ran 1 of 2693 specs、0 failures
should transform incoming static input values                       Ran 1 of 2693 specs、0 failures
should support global host listeners on components                  Ran 1 of 2693 specs、0 failures
$ pnpm bazel test //packages/core/test:test ... "--test_arg=--filter=<下の名前>"     # 4 つに割って走る
whitespaces in templates      1 + 1 + 1 specs、0 failures
^resource_loading             4 + 3 + 3 + 4 = 14 specs、0 failures
```

直すとしたら、682 行目は #69898 のとおり `OnPush` にするのが説明文（554 行目）と合う形で、`new Component({})` の値と TestBed の override のあとの `onPush` が変わるので、#69898 には breaking changes の印が付いています。説明文の側は、773〜774・885・911 行目の「DOM の property」を「テンプレートのバインディングの名前」に、1012 行目の「結果で更新する」を消す、960 行目の後ろに `}`、resource\_loading.ts の 29・38 行目の `renderComponent` を今の API に、708〜710 行目を standalone の pipe の説明に、です。integration\_spec.ts の L2087 の it の名前は `should remove whitespaces by default` が期待と合います。

## 聞かれそうな質問

**Q. v22 で `changeDetection` を書かないコンポーネントは OnPush ですか？**

クラスは AOT でも JIT でも OnPush です（render3/definition.ts L352）。ただし `new Component({})` の metadata と `__annotations__` は `Eager` で（682 行目）、TestBed で `overrideComponent` や `overrideTemplate` をしたコンポーネントは Eager に変わります。テストで同じにしたいなら、override の `set` に `changeDetection` も入れます。

**Q. OnPush のコンポーネントは何で描き直されますか？**

DEMO 1 で確かめた 4 つです。入力の参照が変わる、そのコンポーネントのテンプレートのイベント、`markForCheck()`、テンプレートが読む signal の変更。外からフィールドを替えるのと、同じ参照のオブジェクトの中身を替えるのは映りません。

**Q. `styles` を書かないと `_ngcontent` の属性はどうなりますか？**

付きません。Emulated のまま styles が無い（空白だけも含む）と、コンパイラが None に切り替えます（616〜618 行目、compiler.ts L290〜293）。

**Q. `booleanAttribute('0')` は false ですか？**

true です。false になるのは `'false'`・`false`・`null`・`undefined` だけで、空の文字列 `''` も true です（coercion.ts L24）。

**Q. `@HostListener('window:keydown.enter', ['$event'])` の引数を `KeyboardEvent` にするとエラーになるのはなぜですか？**

キーの修飾を付けたイベント名は、型チェックで `Event` として扱われるからです（#40778）。`Event` で受けて中で `KeyboardEvent` に絞るか、修飾の無い `'window:keydown'` で受けて `key` を見ます。

**Q. ShadowDom のコンポーネントの中にほかのコンポーネントのスタイルが入るのはなぜですか？**

`ShadowDomRenderer` が shadowRoot を `SharedStylesHost` の host に足し、`addHost` がそれまでに登録されたスタイルを全部写すからです（shared\_styles\_host.ts L214〜220）。写さないのが `ExperimentalIsolatedShadowDom` です。

## 読み終えて

- OnPush の既定はクラスの定義の側で決まり、デコレーターの props は Eager を足したまま。その差は `new Component({})` と TestBed の override で表に出る（#69898）。
- `preserveWhitespaces: false` は 2 文字以上の空白だけを 1 つにし、`<pre>` と `ngPreserveWhitespaces` は触らない。
- styles の無い Emulated は None。ShadowDom は shadowRoot にほかのコンポーネントのスタイルも写す。
- @Input・@Output・@HostListener の説明文の「DOM の property」「結果で更新」は実際と違う。`'keydown.enter'` の `$event` は `Event`。
- `resolveComponentResources` は列を取り替えて URL ごとに 1 回読み、status が 200 でなければ `NG0918`。例の `renderComponent` はもう無い。

---

← 前: [@Directive の説明文：selector・inputs・host・providers・exportAs](01-crd-directive.md)  
次: [クエリのデコレーターと @NgModule の説明文](03-crd-query-module.md) →
