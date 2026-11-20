[目次](../README.md) › [Router の型と説明文の読み残し](README.md) › 第 2 回 / 全 9 回

# Route インターフェースの説明文：各プロパティの約束

> models.ts の Route の説明文：Simple Configuration から Lazy Loading までの例を本物の Router に入れた結果、matcher・outlet・4 つのガード・data と resolve・children と loadChildren の説明、runGuardsAndResolvers の 6 通りを数えた表。「空の path だけが継ぐ」「prefix の redirect は無限ループ」など、今の実装より古い言い方。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-route)

---

`Route` インターフェースの説明文は、models.ts の中でいちばん長い JSDoc です。冒頭の使い方の例（Simple Configuration から Lazy Loading まで 9 つ）と、各プロパティの短い説明でできています。この章は、その例を 1 つずつ本物の Router に入れて「説明文が言う URL と部品の木」になるかを確かめ、`runGuardsAndResolvers` の 5 つの値と関数を、同じ部品のままパラメーターだけを変えた移動で数えます。`path`・`pathMatch`・`component`・`loadComponent`・`redirectTo`・`providers` の説明文は[Route 設定の検証](../router/04-router-route-config.md)・[loadChildren](../router/11-router-lazy-loading.md)・[redirectTo](../router/10-router-redirects.md)の章が引いているので、ここでは残りを読みます。

読む対象は `packages/router/src/models.ts` の 372〜597 行目（`Route` の説明と例）と、`matcher`・`outlet`・4 つのガード・`data`・`resolve`・`children`・`loadChildren`・`runGuardsAndResolvers` のプロパティの説明です（../angular、8576f161ae4）。

1. [1. models.ts の小さな型](01-rmd-basic-types.md)
2. **2. Route の説明文**（この章）
3. [3. ガードの型](03-rmd-guards.md)
4. [4. Resolve と NavigationBehaviorOptions](04-rmd-resolve-nav.md)
5. [5. provideRouter の機能](05-rmd-features.md)
6. [6. ルーターのイベント](06-rmd-events.md)
7. [7. RouterLink と RouterOutlet](07-rmd-directives.md)
8. [8. URL とナビゲーションの小道具](08-rmd-url-rest.md)
9. [9. spec と issue](09-rmd-tests-issues.md)

## 1. Simple Configuration と Multiple Outlets

📄 `angular/packages/router/src/models.ts` L372–402 （▶ の行: 374–376, 389–390, 394, 397）

````ts
372 │ 
373 │ /**
374 ▶  * A configuration object that defines a single route.
375 ▶  * A set of routes are collected in a `Routes` array to define a `Router` configuration.
376 ▶  * The router attempts to match segments of a given URL against each route,
377 │  * using the configuration options defined in this object.
378 │  *
379 │  * Supports static, parameterized, redirect, and wildcard routes, as well as
380 │  * custom route data and resolve methods.
381 │  *
382 │  * For detailed usage information, see the [Routing Guide](guide/routing/common-router-tasks).
383 │  *
384 │  * @usageNotes
385 │  *
386 │  * ### Simple Configuration
387 │  *
388 │  * The following route specifies that when navigating to, for example,
389 ▶  * `/team/11/user/bob`, the router creates the 'Team' component
390 ▶  * with the 'User' child component in it.
391 │  *
392 │  * ```ts
393 │  * [{
394 ▶  *   path: 'team/:id',
395 │  *  component: Team,
396 │  *   children: [{
397 ▶  *     path: 'user/:name',
398 │  *     component: User
399 │  *   }]
400 │  * }]
401 │  * ```
402 │  *
````

376 行目のとおり、Router は URL のセグメントを `Routes` の各要素に照らします（照らし方は[recognize](../router/09-router-recognize.md)の章）。389〜390 行目の約束は「`/team/11/user/bob` で Team の中に User ができる」で、DEMO 2 の 1 行目は `Team{"id":"11"} > User{"id":"11","name":"bob"}` です。User の params に親の `id` まで入っているのは、v22 の既定の `paramsInheritanceStrategy` が `'always'` だからです（17d10f7a992、2026-04-16。[前のシリーズの第 2 回](../rtl/02-rtl-router-state.md)）。

📄 `angular/packages/router/src/models.ts` L403–431 （▶ の行: 406–407, 415–416, 427）

````ts
403 │  * ### Multiple Outlets
404 │  *
405 │  * The following route creates sibling components with multiple outlets.
406 ▶  * When navigating to `/team/11(aux:chat/jim)`, the router creates the 'Team' component next to
407 ▶  * the 'Chat' component. The 'Chat' component is placed into the 'aux' outlet.
408 │  *
409 │  * ```ts
410 │  * [{
411 │  *   path: 'team/:id',
412 │  *   component: Team
413 │  * }, {
414 │  *   path: 'chat/:user',
415 ▶  *   component: Chat
416 ▶  *   outlet: 'aux'
417 │  * }]
418 │  * ```
419 │  *
420 │  * ### Wild Cards
421 │  *
422 │  * The following route uses wild-card notation to specify a component
423 │  * that is always instantiated regardless of where you navigate to.
424 │  *
425 │  * ```ts
426 │  * [{
427 ▶  *   path: '**',
428 │  *   component: WildcardComponent
429 │  * }]
430 │  * ```
431 │  *
````

415 行目の `component: Chat` の後ろにカンマがありません。この例を `const r: Routes = …` に貼ると、TypeScript は 416 行目で `TS1005: ',' expected` を出します（テストの節の型検査）。カンマを足せば、406〜407 行目の約束どおり `/team/11(aux:chat/jim)` で primary に Team、`aux` に Chat ができます（DEMO 2 の 2 行目）。origin/main でも同じ行のままです。427 行目の `'**'` は、どの URL でも残りを全部使って一致します（DEMO 2 の 3 行目）。

## 2. Redirects

📄 `angular/packages/router/src/models.ts` L432–458 （▶ の行: 437–438, 446–447, 455–458）

````ts
432 │  * ### Redirects
433 │  *
434 │  * The following route uses the `redirectTo` property to ignore a segment of
435 │  * a given URL when looking for a child path.
436 │  *
437 ▶  * When navigating to '/team/11/legacy/user/jim', the router changes the URL segment
438 ▶  * '/team/11/legacy/user/jim' to '/team/11/user/jim', and then instantiates
439 │  * the Team component with the User child component in it.
440 │  *
441 │  * ```ts
442 │  * [{
443 │  *   path: 'team/:id',
444 │  *   component: Team,
445 │  *   children: [{
446 ▶  *     path: 'legacy/user/:name',
447 ▶  *     redirectTo: 'user/:name'
448 │  *   }, {
449 │  *     path: 'user/:name',
450 │  *     component: User
451 │  *   }]
452 │  * }]
453 │  * ```
454 │  *
455 ▶  * The redirect path can be relative, as shown in this example, or absolute.
456 ▶  * If we change the `redirectTo` value in the example to the absolute URL segment '/user/:name',
457 ▶  * the result URL is also absolute, '/user/jim'.
458 ▶ 
````

437〜438 行目の相対の redirect と、456〜457 行目の「`'/user/:name'` にすれば結果も絶対の `'/user/jim'`」は、DEMO 2 の 4〜6 行目のとおりです。ただし絶対の形は、説明文の例のまま（`user/:name` が `team/:id` の子にしか無い）だと `NG04002: Cannot match any routes. URL Segment: 'user/jim'` の `NavigationError` になります（5 行目。本番ビルドのこのページでは文が省かれて `NG04002: 'user/jim'` と出ます）。`'/user/jim'` は最上位から照合し直すので、最上位に `user/:name` を 1 つ足すと 6 行目のとおり `User{"name":"jim"}` になります。458 行目は先頭の ` * ` が抜けた空行です。JSDoc はそのままコメントとして続くので、API のページの見え方は変わりません。

## 3. Empty Path と、その子

📄 `angular/packages/router/src/models.ts` L459–480 （▶ の行: 461–462, 465, 472–473）

````ts
459 │  * ### Empty Path
460 │  *
461 ▶  * Empty-path route configurations can be used to instantiate components that do not 'consume'
462 ▶  * any URL segments.
463 │  *
464 │  * In the following configuration, when navigating to
465 ▶  * `/team/11`, the router instantiates the 'AllUsers' component.
466 │  *
467 │  * ```ts
468 │  * [{
469 │  *   path: 'team/:id',
470 │  *   component: Team,
471 │  *   children: [{
472 ▶  *     path: '',
473 ▶  *     component: AllUsers
474 │  *   }, {
475 │  *     path: 'user/:name',
476 │  *     component: User
477 │  *   }]
478 │  * }]
479 │  * ```
480 │  *
````

📄 `angular/packages/router/src/models.ts` L481–501 （▶ の行: 482–483, 485, 492–493）

````ts
481 │  * Empty-path routes can have children. In the following example, when navigating
482 ▶  * to `/team/11/user/jim`, the router instantiates the wrapper component with
483 ▶  * the user component in it.
484 │  *
485 ▶  * Note that an empty path route inherits its parent's parameters and data.
486 │  *
487 │  * ```ts
488 │  * [{
489 │  *   path: 'team/:id',
490 │  *   component: Team,
491 │  *   children: [{
492 ▶  *     path: '',
493 ▶  *     component: WrapperCmp,
494 │  *     children: [{
495 │  *       path: 'user/:name',
496 │  *       component: User
497 │  *     }]
498 │  *   }]
499 │  * }]
500 │  * ```
501 │  *
````

485 行目は「空の path のルートは親の params と data を継ぐ」です。今もそのとおりですが、継ぐのは空の path だけではありません。`getInherited`（router\_state.ts L312〜326、[前のシリーズの第 2 回](../rtl/02-rtl-router-state.md)）は、`paramsInheritanceStrategy === 'always'` なら path に関係なく継ぎ、その既定（L297）が `'always'` です。DEMO 2 の 8 行目では、空の path の `WrapperCmp{"id":"11"}` だけでなく、その子の `User{"id":"11","name":"jim"}` も `id` を持っています。485 行目は 22c71b69ceb（2018-05-29、#29012）で入った文で、既定を `'always'` にした 17d10f7a992 のときに直されませんでした。

## 4. Matching Strategy：「無限ループになる」は今の実装では起きない

📄 `angular/packages/router/src/models.ts` L502–538 （▶ の行: 504–506, 510–512, 519–523, 526, 531）

````ts
502 │  * ### Matching Strategy
503 │  *
504 ▶  * The default path-match strategy is 'prefix', which means that the router
505 ▶  * checks URL elements from the left to see if the URL matches a specified path.
506 ▶  * For example, '/team/11/user' matches 'team/:id'.
507 │  *
508 │  * ```ts
509 │  * [{
510 ▶  *   path: '',
511 ▶  *   pathMatch: 'prefix', //default
512 ▶  *   redirectTo: 'main'
513 │  * }, {
514 │  *   path: 'main',
515 │  *   component: Main
516 │  * }]
517 │  * ```
518 │  *
519 ▶  * You can specify the path-match strategy 'full' to make sure that the path
520 ▶  * covers the whole unconsumed URL. It is important to do this when redirecting
521 ▶  * empty-path routes. Otherwise, because an empty path is a prefix of any URL,
522 ▶  * the router would apply the redirect even when navigating to the redirect destination,
523 ▶  * creating an endless loop.
524 │  *
525 │  * In the following example, supplying the 'full' `pathMatch` strategy ensures
526 ▶  * that the router applies the redirect if and only if navigating to '/'.
527 │  *
528 │  * ```ts
529 │  * [{
530 │  *   path: '',
531 ▶  *   pathMatch: 'full',
532 │  *   redirectTo: 'main'
533 │  * }, {
534 │  *   path: 'main',
535 │  *   component: Main
536 │  * }]
537 │  * ```
538 │  *
````

519〜523 行目は、空の path の redirect を `'prefix'` にすると「空の path はどの URL の頭にも一致するので、行き先へ移るときにも redirect がかかり、無限ループになる」と書きます。同じ文は `pathMatch` のプロパティの説明（L628〜632、[Route 設定の検証](../router/04-router-route-config.md)の章が引く）にもあります。本物で動かすと、次のようになりました（DEMO 2 の Matching Strategy の 6 行）。

1. **509〜516 行目の例のまま、'/main' へ**

   `'/main'` のまま Main が出ます。`''` の redirect は一度かかって `main/main` を作りますが、`'main'` に子が無いので照合に失敗し、`processSegment` の L256〜258 が `NoMatch` を捕まえて次のルートの `'main'` を試し、それが一致します。
2. **行き先の 'main' が子に '\*\*' を持つとき**

   `'/main'` は `'/main/main'` になり、Main の中に `'**'` の部品が出ます。「行き先へ移っても redirect がかかる」は起きますが、1 回で止まります。
3. **止まる理由**

   `expandSegmentAgainstRouteUsingRedirect` は redirect のあとの照合を `processSegment(…, false, …)`（recognize.ts L366〜374、[redirectTo の章](../router/10-router-redirects.md)）で呼びます。この `false` が `allowRedirects` で、redirect した先ではもう redirect しません。絶対の redirect の上限 31 回（`MAX_ALLOWED_REDIRECTS`）も同じ章にあります。519〜523 行目は 22c71b69ceb（2018-05-29、#29012「route interface and types doc example」）で入った文ですが、そのコミットの apply\_redirects.ts（L234〜237）でも、相対の redirect のあとは `expandSegment(…, false)` で照合していました。書かれたときから、この形で無限ループにはなりません。

511 行目の `//default` にも注意が要ります。`pathMatch` を書かない `{path: '', redirectTo: 'main'}` は、開発モードでは validateConfig の L197〜201 が「`please provide 'pathMatch'`」の例外を投げます。validateConfig を呼ぶのは router.ts L399 の `(typeof ngDevMode === 'undefined' || ngDevMode) &&` の後ろなので、本番ビルドでは検査されず、既定の `'prefix'` として動きます。526 行目の「`'/'` のときだけ redirect する」は、`match` の L88 の `route.pathMatch === 'full' && (segmentGroup.hasChildren() || segments.length > 0)` が守ります。

## 5. Componentless Routes と Lazy Loading

📄 `angular/packages/router/src/models.ts` L539–578 （▶ の行: 543–544, 547–549, 553, 556, 561–562, 566–567）

````ts
539 │  * ### Componentless Routes
540 │  *
541 │  * You can share parameters between sibling components.
542 │  * For example, suppose that two sibling components should go next to each other,
543 ▶  * and both of them require an ID parameter. You can accomplish this using a route
544 ▶  * that does not specify a component at the top level.
545 │  *
546 │  * In the following example, 'MainChild' and 'AuxChild' are siblings.
547 ▶  * When navigating to 'parent/10/(a//aux:b)', the route instantiates
548 ▶  * the main child and aux child components next to each other.
549 ▶  * For this to work, the application component must have the primary and aux outlets defined.
550 │  *
551 │  * ```ts
552 │  * [{
553 ▶  *    path: 'parent/:id',
554 │  *    children: [
555 │  *      { path: 'a', component: MainChild },
556 ▶  *      { path: 'b', component: AuxChild, outlet: 'aux' }
557 │  *    ]
558 │  * }]
559 │  * ```
560 │  *
561 ▶  * The router merges the parameters, data, and resolve of the componentless
562 ▶  * parent into the parameters, data, and resolve of the children.
563 │  *
564 │  * This is especially useful when child components are defined
565 │  * with an empty path string, as in the following example.
566 ▶  * With this configuration, navigating to '/parent/10' creates
567 ▶  * the main child and aux components.
568 │  *
569 │  * ```ts
570 │  * [{
571 │  *    path: 'parent/:id',
572 │  *    children: [
573 │  *      { path: '', component: MainChild },
574 │  *      { path: '', component: AuxChild, outlet: 'aux' }
575 │  *    ]
576 │  * }]
577 │  * ```
578 │  *
````

547〜548 行目の `parent/10/(a//aux:b)` は、`parent/10` の下の primary に `a`、`aux` に `b` を置く URL です。DEMO 2 では `（部品なし 'parent/:id'）{"id":"10"} > [MainChild{"id":"10"} | (aux) AuxChild{"id":"10"}]` で、561〜562 行目のとおり、部品の無い親の params が両方の子に入ります。566〜567 行目の空の path の子の形も、`/parent/10` で同じ木になります。549 行目の「アプリの部品に primary と aux の出口が要る」は、木を作る（照合）ためではなく、部品を置く（活性化）ための条件です。DEMO 2 は照合だけなので出口なしで木ができ、DEMO 1 は出口を 2 つ持つルートの部品を bootstrap しています。

📄 `angular/packages/router/src/models.ts` L579–597 （▶ の行: 583–584, 587, 592）

````ts
579 │  * ### Lazy Loading
580 │  *
581 │  * Lazy loading speeds up application load time by splitting the application
582 │  * into multiple bundles and loading them on demand.
583 ▶  * To use lazy loading, provide the `loadChildren` property in the `Route` object,
584 ▶  * instead of the `children` property.
585 │  *
586 │  * Given the following example route, the router will lazy load
587 ▶  * the associated module on demand using the browser native import system.
588 │  *
589 │  * ```ts
590 │  * [{
591 │  *   path: 'lazy',
592 ▶  *   loadChildren: () => import('./lazy-route/lazy.module').then(mod => mod.LazyModule),
593 │  * }];
594 │  * ```
595 │  *
596 │  * @publicApi
597 │  */
````

592 行目の例は NgModule を読む形です。`Routes` を返す形と `default` の省略は[前の章](01-rmd-basic-types.md)の 7 節、読み込みの手順は[loadChildren の章](../router/11-router-lazy-loading.md)にあります。

## 6. matcher・outlet・4 つのガードのプロパティ

📄 `angular/packages/router/src/models.ts` L636–645 （▶ の行: 639, 644）

```ts
636 │    */
637 │   pathMatch?: 'prefix' | 'full';
638 │   /**
639 ▶    * A custom URL-matching function. Cannot be used together with `path`.
640 │    *
641 │    * @see [Creating custom route matches](guide/routing/routing-with-urlmatcher)
642 │    *
643 │    */
644 ▶   matcher?: UrlMatcher;
645 │   /**
```

639 行目の「`path` と一緒に使えない」は、`path: ''` のときだけ守られていません（[前の章](01-rmd-basic-types.md)の 5 節、DEMO 2 で matcher が 0 回）。

📄 `angular/packages/router/src/models.ts` L681–700 （▶ の行: 682–683, 688, 690–692, 694–695, 700）

```ts
681 │   /**
682 ▶    * Name of a `RouterOutlet` object where the component can be placed
683 ▶    * when the path matches.
684 │    *
685 │    * @see [Show routes with outlets](guide/routing/show-routes-with-outlets)
686 │    *
687 │    */
688 ▶   outlet?: string;
689 │   /**
690 ▶    * An array of `CanActivateFn` or DI tokens used to look up `CanActivate()`
691 ▶    * handlers, in order to determine if the current user is allowed to
692 ▶    * activate the component. By default, any user can activate.
693 │    *
694 ▶    * When using a function rather than DI tokens, the function can call `inject` to get any required
695 ▶    * dependencies. This `inject` call must be done in a synchronous context.
696 │    *
697 │    * @see [CanActivate](guide/routing/route-guards#canactivate)
698 │    *
699 │    */
700 ▶   canActivate?: Array<CanActivateFn | DeprecatedGuard>;
```

📄 `angular/packages/router/src/models.ts` L701–736 （▶ の行: 704, 706–707, 712, 716, 724, 728, 736）

```ts
701 │   /**
702 │    * An array of `CanMatchFn` or DI tokens used to look up `CanMatch()`
703 │    * handlers, in order to determine if the current user is allowed to
704 ▶    * match the `Route`. By default, any route can match.
705 │    *
706 ▶    * When using a function rather than DI tokens, the function can call `inject` to get any required
707 ▶    * dependencies. This `inject` call must be done in a synchronous context.
708 │    *
709 │    * @see [CanMatch](guide/routing/route-guards#canmatch)
710 │    *
711 │    */
712 ▶   canMatch?: Array<CanMatchFn | DeprecatedGuard>;
713 │   /**
714 │    * An array of `CanActivateChildFn` or DI tokens used to look up `CanActivateChild()` handlers,
715 │    * in order to determine if the current user is allowed to activate
716 ▶    * a child of the component. By default, any user can activate a child.
717 │    *
718 │    * When using a function rather than DI tokens, the function can call `inject` to get any required
719 │    * dependencies. This `inject` call must be done in a synchronous context.
720 │    *
721 │    * @see [CanActivateChild](guide/routing/route-guards#canactivatechild)
722 │    *
723 │    */
724 ▶   canActivateChild?: Array<CanActivateChildFn | DeprecatedGuard>;
725 │   /**
726 │    * An array of `CanDeactivateFn` or DI tokens used to look up `CanDeactivate()`
727 │    * handlers, in order to determine if the current user is allowed to
728 ▶    * deactivate the component. By default, any user can deactivate.
729 │    *
730 │    * When using a function rather than DI tokens, the function can call `inject` to get any required
731 │    * dependencies. This `inject` call must be done in a synchronous context.
732 │    *
733 │    * @see [CanDeactivate](guide/routing/route-guards#candeactivate)
734 │    *
735 │    */
736 ▶   canDeactivate?: Array<CanDeactivateFn<any> | DeprecatedGuard>;
```

695 行目などの「`inject` は同期の文脈で呼ぶこと」は、ガードの関数を `runInInjectionContext(closestInjector, () => guard(...))`（check\_guards.ts L163〜166）で呼ぶからです。注入の文脈は関数が同期に動いているあいだだけ有効なので、`await` のあとで `inject` を呼ぶと NG0203 になります。690〜691 行目の「DI tokens used to look up `CanActivate()` handlers」は[前の章](01-rmd-basic-types.md)の 3 節の `DeprecatedGuard` の道で、型の 700 行目が `CanActivateFn | DeprecatedGuard` の配列を受けます。どの順で呼ばれるか（canDeactivate が先、親から子へ）は[ガードの実行順](../router/12-router-guards.md)の章、説明文の例を動かすのは[次の章](03-rmd-guards.md)です。

📄 `angular/packages/router/src/models.ts` L737–757 （▶ の行: 740, 744, 748–749, 753, 757）

```ts
737 │   /**
738 │    * An array of `CanLoadFn` or DI tokens used to look up `CanLoad()`
739 │    * handlers, in order to determine if the current user is allowed to
740 ▶    * load the component. By default, any user can load.
741 │    *
742 │    * When using a function rather than DI tokens, the function can call `inject` to get any required
743 │    * dependencies. This `inject` call must be done in a synchronous context.
744 ▶    * @deprecated Use `canMatch` instead
745 │    */
746 │   canLoad?: Array<CanLoadFn | DeprecatedGuard>;
747 │   /**
748 ▶    * Additional developer-defined data provided to the component via
749 ▶    * `ActivatedRoute`. By default, no additional data is passed.
750 │    */
751 │   data?: Data;
752 │   /**
753 ▶    * A map of DI tokens used to look up data resolvers. See `Resolve`.
754 │    *
755 │    * @see [Resolve](guide/routing/data-resolvers#what-are-data-resolvers)
756 │    */
757 ▶   resolve?: ResolveData;
```

753 行目の `resolve` の説明は「データの resolver を引く DI トークンの map」で、関数（`ResolveFn`）を書けることに触れていません。型の 757 行目の `ResolveData` は `ResolveFn<unknown> | DeprecatedResolve`（L259〜261）で、関数の形が先に来ます。ガードの 4 つのプロパティは「`CanActivateFn` or DI tokens」と関数を先に書くので、`resolve` だけ古い言い方が残っています。

## 7. children・loadChildren と runGuardsAndResolvers

📄 `angular/packages/router/src/models.ts` L764–777 （▶ の行: 766–767, 771, 776）

```ts
764 │ 
765 │   /**
766 ▶    * An array of child `Route` objects that specifies a nested route
767 ▶    * configuration.
768 │    */
769 │   children?: Routes;
770 │   /**
771 ▶    * An object specifying lazy-loaded child routes.
772 │    *
773 │    * @see [Injection context lazy loading](guide/routing/loading-strategies)
774 │    *
775 │    */
776 ▶   loadChildren?: LoadChildren;
777 │ 
```

📄 `angular/packages/router/src/models.ts` L778–804 （▶ の行: 781–782, 784–791, 796）

```ts
778 │   /**
779 │    * A policy for when to run guards and resolvers on a route.
780 │    *
781 ▶    * Guards and/or resolvers will always run when a route is activated or deactivated. When a route
782 ▶    * is unchanged, the default behavior is the same as `paramsChange`.
783 │    *
784 ▶    * `paramsChange` : Rerun the guards and resolvers when path or
785 ▶    * path param changes. This does not include query parameters. This option is the default.
786 ▶    * - `always` : Run on every execution.
787 ▶    * - `pathParamsChange` : Rerun guards and resolvers when the path params
788 ▶    * change. This does not compare matrix or query parameters.
789 ▶    * - `paramsOrQueryParamsChange` : Run when path, matrix, or query parameters change.
790 ▶    * - `pathParamsOrQueryParamsChange` : Rerun guards and resolvers when the path params
791 ▶    * change or query params have changed. This does not include matrix parameters.
792 │    *
793 │    * @see {@link RunGuardsAndResolvers}
794 │    * @see [Control when guards and resolvers execute](guide/routing/customizing-route-behavior)
795 │    */
796 ▶   runGuardsAndResolvers?: RunGuardsAndResolvers;
797 │ 
798 │   /**
799 │    * A `Provider` array to use for this `Route` and its `children`.
800 │    *
801 │    * The `Router` will create a new `EnvironmentInjector` for this
802 │    * `Route` and use it for this `Route` and its `children`. If this
803 │    * route also has a `loadChildren` function which returns an `NgModuleRef`, this injector will be
804 │    * used as the parent of the lazy loaded module.
```

判定は `shouldRunGuardsAndResolvers`（preactivation.ts L176〜206、[ガードの章](../router/12-router-guards.md)）の `switch` 1 つです。`'pathParamsChange'` は `equalPath`（セグメントの path の文字列だけを比べる）、`'paramsChange'` と既定は `equalParamsAndUrlSegments`（params と、セグメントの path と行列パラメーターを比べる）、クエリを含む 2 つはそれに `shallowEqual(queryParams)` を足します。関数なら `runInInjectionContext` で呼びます。説明文の書き方で気になる所が 2 つあります。

- 784 行目の `paramsChange` だけ、行頭の `- ` がありません。markdown の箇条書きにならず、前の段落の続きの文として描かれます。同じ文の型の説明（L352）も同じです。
- 784〜785 行目の `paramsChange` は「path か path param が変わったら。クエリは含まない」と書き、**行列パラメーター**（`;m=1`）に触れていません。`equalParamsAndUrlSegments` は行列パラメーターも比べるので、DEMO 1 の 3 行目で `paramsChange` は走ります。789 行目の `paramsOrQueryParamsChange` は「path, matrix, or query」と書くので、並べて読むと `paramsChange` は行列パラメーターを含まないように読めます。spec（テストの節）は `/a;p=1` で走ることを固めています。

> **🧪 DEMO 1 — runGuardsAndResolvers の 6 通りで、ガード・resolver・canDeactivate を数える**
>
> 押すと、6 通りの値それぞれで別のアプリを作り、ルートの部品（出口を持つ）を文書に付けない div に bootstrap します。ルートは `{path: 'item/:id', component: Item, runGuardsAndResolvers, canActivate, canDeactivate, resolve}` の 1 つで、表の 7 つの URL へ順に移り、1 回ごとに増えた数を「canActivate / resolver / canDeactivate」で書きます。関数は `(from, to) => to.queryParams['force'] === '1'` です。下の小さな字が説明文から読める答えで、合わない所と説明に書いていない所を赤くします。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-route)

1 行目は 781 行目の「活性化のときはいつも走る」で、6 通りとも `1 / 1 / 0` です（canDeactivate は `'/'` の部品のほうに無いので 0）。2 行目以降は説明文の答えと合い、合わないのは `paramsChange` の 3 行目（説明に書いていない）だけです。canDeactivate は、ガードと resolver を走らせるときにだけ数が増えます。`getRouteGuards` が `shouldRun` のときだけ、出口に部品がいる `CanDeactivate` の検査を足すからです（preactivation.ts L138〜174）。部品のインスタンスは 7 回とも作り直されませんでした（再利用）。フラグメントだけの変更と、`onSameUrlNavigation: 'reload'` の同じ URL では、`'always'` 以外は何も走りません。[前の章](01-rmd-basic-types.md)の 2 節で読んだ models.ts L80〜82 の注意のとおりです。

> **🧪 DEMO 2 — 説明文の例を本物の Router に入れる**
>
> 例ごとに別のアプリを作り、`navigateByUrl` のあとの `router.url` と、`routerState.snapshot` の木を「部品{params} &gt; 子」の形で書きます。`[A | (aux) B]` は兄弟、`(aux)` は名前つきの出口です。title の 3 行は、既定の `DefaultTitleStrategy` のまま動かし、そのアプリの `DOCUMENT` だけを文書に付けない別の `HTMLDocument` に替えています。`Title` サービスはその文書の `title` に書くので、このページの `document.title` は変わりません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-route)

title のプロパティの説明（L600〜601、[Route 設定の検証](../router/04-router-route-config.md)の章が引く）は「静的な文字列か、`Resolve` を実装した `Injectable`」で、型（L606）が受ける `ResolveFn<string>` に触れていません。DEMO 2 の最後の 3 行のとおり、関数でも別の文書の title と `snapshot.title` が `"fn jim"` になります。title の解決は[resolve と data と title](../router/13-router-resolvers.md)の章です。

## ここまでの呼び出し

- 👤 `router.navigateByUrl('/item/1;m=1?q=1')` — router.ts L546
  - `recognize → processSegment → matchWithChecks / match` — recognize.ts・config\_matching.ts L54・L82 — *path・pathMatch・matcher・redirectTo*
    - `expandSegmentAgainstRouteUsingRedirect → processSegment(…, false, …)` — recognize.ts L324・L366 — *redirect のあとは redirect しない*
  - `getAllRouteGuards → getRouteGuards` — preactivation.ts L47・L110
    - `shouldRunGuardsAndResolvers(curr, future, runGuardsAndResolvers)` — preactivation.ts L176 — *switch 1 つ*
    - `canDeactivateChecks.push(…)` — preactivation.ts L154 — *shouldRun かつ出口に部品があるときだけ*
  - `checkGuards → resolveData` — check\_guards.ts L56・resolve\_data.ts L28

## テストと直し方

| ファイル（packages/router/test/） | describe › it（行） | 固めている約束 | 走らせた数 |
| --- | --- | --- | --- |
| `integration/guards.spec.ts` | `runGuardsAndResolvers`（598）› 679・706・738・781・831・856・892 | 6 通りの値。679 は `/a;p=1`（行列パラメーター）で `paramsChange` が走る | 14（7 本 × 2） |
| `apply_redirects.spec.ts` | `redirects`（27）› `empty paths`（967）› 968・985・1002・1029・1049 ほか | 空の path の redirect。1002 は `'full'` が終わりでだけ一致すること | 18 |
| `page_title_strategy_spec.ts` | `title strategy`（26）› 43・49・55 ほか | 文字列・resolver・関数の title | 9 |
| （integration と recognize の各所） | `named outlets`・`componentless` を名前に持つ it | 名前つきの出口と、部品の無い親 | 32・23 |
| （なし） | — | `'prefix'` の空の path の redirect で、行き先へ移ったときに何が起きるか（4 節）。説明文の「無限ループ」を確かめる it も、否定する it も無い | — |

📄 `走らせたコマンド（2026-11-21、../angular の 8576f161ae4）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=runGuardsAndResolvers                                Ran 14 of 1170 specs、0 failures
--filter=title strategy                                       Ran 9 of 1170 specs、0 failures
--filter=redirects empty paths                                Ran 18 of 1170 specs、0 failures
--filter=should redirect empty path route only when terminal  Ran 1 of 1170 specs、0 failures
--filter=named outlets                                        Ran 32 of 1170 specs、0 failures
--filter=componentless                                        Ran 23 of 1170 specs、0 failures

# 372〜597 行目の 10 の例を const rN: Routes = … に貼って型検査（サイトの TypeScript 6.0.3）
$ tsc --strict --experimentalDecorators --noEmit ex-route.ts
ex-route.ts(31,3): error TS1005: ',' expected.        # 416 行目の outlet: 'aux'（415 行目にカンマが無い）
$ tsc --strict --experimentalDecorators --noEmit fix-route.ts   # カンマを足した版: エラー 0
```

`--filter` は `runGuardsAndResolvers`・`title strategy`・`redirects empty paths`・`should redirect empty path route only when terminal`（1）・`named outlets`・`componentless` の 6 つで、どれも `0 failures` でした。372〜597 行目の 10 の例は、models.ts から行をそのまま取り出して `const rN: Routes = …` に貼り、TypeScript 6.0.3 の `--strict` で型検査しました。エラーは Multiple Outlets の 1 つ（`TS1005: ',' expected`）だけで、415 行目にカンマを足すと 0 になりました。

直すとしたら、どれも models.ts の説明文の変更です。415 行目のカンマ、485 行目の「空の path だけが継ぐ」（既定の `'always'` に合わせる）、519〜523 行目と L628〜632 の「無限ループ」（一度だけ redirect がかかる、または照合に失敗する、と書く）、784 行目の `- ` と行列パラメーター、753 行目の `resolve` の関数です。4 節を spec で固めるなら、`apply_redirects.spec.ts` の `empty paths`（967）に、DEMO 2 と同じ `'prefix'` の 2 つの構成（子なし・子に `'**'`）で `'/main'` を照合する it を足す形になります。

## 聞かれそうな質問

**Q. 空の path の redirect に `pathMatch: 'full'` を付け忘れると、本当に無限ループしますか？**

今の実装ではしません。付け忘れ（`pathMatch` を書かない）は、開発モードなら validateConfig の L197〜201 が例外にします（本番では検査せず `'prefix'` として動く）。`'prefix'` の場合は、redirect のあとの照合が `allowRedirects` を `false` にした呼び出し（recognize.ts L372）で走るので、redirect は 1 回で止まり、子が無ければ次のルートへ進みます（DEMO 2）。

**Q. `runGuardsAndResolvers: 'paramsChange'` で、行列パラメーターだけ変えたらガードは走りますか？**

走ります。既定でもある `paramsChange` は `equalParamsAndUrlSegments` で、セグメントの行列パラメーターも比べるからです（preactivation.ts L202〜204）。`pathParamsChange` なら走りません。DEMO 1 の 3 行目で確かめられます。

**Q. 同じ URL へ `onSameUrlNavigation: 'reload'` で移ると、resolver はもう一度走りますか？**

`runGuardsAndResolvers: 'always'` のときだけ走ります。`'reload'` は照合とイベントをやり直すだけで、ガードと resolver を走らせるかはこのプロパティが決めます（DEMO 1 の 6 行目）。

**Q. 名前つきの出口の子が、親の `:id` を読めるのはなぜですか？**

親に部品が無いときは、`getInherited`（router\_state.ts L319〜325）が親の params を子に混ぜるからです（561〜562 行目）。v22 では既定の `paramsInheritanceStrategy` が `'always'` なので、親に部品があっても継ぎます。

**Q. ガードの関数で `await` のあとに `inject` してはいけないのはなぜですか？**

ガードは `runInInjectionContext` の中で同期に呼ばれ（check\_guards.ts L163〜166）、注入の文脈はその呼び出しが返るまでしか続かないからです。694〜695 行目の「同期の文脈で」はこのことです。

## 読み終えて

- `Route` の 9 つの例は、Multiple Outlets のカンマを足せばどれも説明文どおりの URL と木になる。
- 「空の path だけが親を継ぐ」「prefix の redirect は無限ループ」の 2 つは、既定の `'always'` と `allowRedirects = false` のある今の実装より古い言い方。
- `runGuardsAndResolvers` は preactivation.ts の `switch` 1 つで決まり、`paramsChange` は行列パラメーターも見る。
- ガードと resolver が走らない移動では canDeactivate も走らず、部品は再利用される。
- `resolve` と `title` のプロパティの説明は、関数の形に触れていない。

---

← 前: [models.ts の小さな型：GuardResult・RedirectCommand・UrlMatcher・Data・LoadChildren](01-rmd-basic-types.md)  
次: [ガードの型：CanActivate から CanMatch まで](03-rmd-guards.md) →
