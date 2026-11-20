[目次](../README.md) › [Router の型と説明文の読み残し](README.md) › 第 4 回 / 全 9 回

# Resolve・CanLoad・NavigationBehaviorOptions と型ガード

> models.ts の後半（PartialMatchRouteSnapshot、Resolve と ResolveFn、CanLoad、NavigationBehaviorOptions）と utils/type\_guards.ts：resolver の例、onSameUrlNavigation・skipLocationChange・replaceUrl・state・info・browserUrl の約束。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-resolve-nav)

---

models.ts の最後の区画は、resolver の型（`Resolve` と `ResolveFn`）、非推奨の `CanLoad`、そして `navigateByUrl` の 2 つ目の引数の型 `NavigationBehaviorOptions` です。最後に、ガードがクラスか関数かを見分ける utils/type\_guards.ts を読みます。resolver は説明文の例を本物で動かして、データと実行の順を確かめます。`NavigationBehaviorOptions` は、偽物の履歴に**何が・どの URL で・どの state で**積まれ、ナビゲーションの途中の `router.currentNavigation()` に何が入るかを、項目ごとに記録します。resolver の実行の手順は[resolve と data と title](../router/13-router-resolvers.md)、履歴の書き方は[ブラウザの URL と履歴](../router/16-router-browser-url.md)の章が本体を読んでいます。

読む対象は `packages/router/src/models.ts` の 1258〜1548 行目と 1580〜1672 行目、`packages/router/src/utils/type_guards.ts` の 9〜52 行目です（../angular、8576f161ae4）。`NavigationBehaviorOptions` の `onSameUrlNavigation`・`skipLocationChange`・`replaceUrl` の説明（L1549〜1579）は[navigateByUrl の章](../router/07-router-navigation-request.md)が引いています。

1. [1. models.ts の小さな型](01-rmd-basic-types.md)
2. [2. Route の説明文](02-rmd-route.md)
3. [3. ガードの型](03-rmd-guards.md)
4. **4. Resolve と NavigationBehaviorOptions**（この章）
5. [5. provideRouter の機能](05-rmd-features.md)
6. [6. ルーターのイベント](06-rmd-events.md)
7. [7. RouterLink と RouterOutlet](07-rmd-directives.md)
8. [8. URL とナビゲーションの小道具](08-rmd-url-rest.md)
9. [9. spec と issue](09-rmd-tests-issues.md)

## 1. Resolve（クラス）：例と、実行の順

📄 `angular/packages/router/src/models.ts` L1258–1283 （▶ の行: 1262–1265, 1271–1273, 1278–1279）

````ts
1258 │ 
1259 │ /**
1260 │  * @description
1261 │  *
1262 ▶  * Interface that classes can implement to be a data provider.
1263 ▶  * A data provider class can be used with the router to resolve data during navigation.
1264 ▶  * The interface defines a `resolve()` method that is invoked right after the `ResolveStart`
1265 ▶  * router event. The router waits for the data to be resolved before the route is finally activated.
1266 │  *
1267 │  * The following example implements a `resolve()` method that retrieves the data
1268 │  * needed to activate the requested route.
1269 │  *
1270 │  * ```ts
1271 ▶  * @Injectable({ providedIn: 'root' })
1272 ▶  * export class HeroResolver implements Resolve<Hero> {
1273 ▶  *   private readonly service = inject(HeroService);
1274 │  *
1275 │  *   resolve(
1276 │  *     route: ActivatedRouteSnapshot,
1277 │  *     state: RouterStateSnapshot
1278 ▶  *   ): Observable<Hero>|Promise<Hero>|Hero {
1279 ▶  *     return this.service.getHero(route.paramMap.get('id'));
1280 │  *   }
1281 │  * }
1282 │  * ```
1283 │  *
````

📄 `angular/packages/router/src/models.ts` L1284–1303 （▶ の行: 1292–1295）

````ts
1284 │  * Here, the defined `resolve()` function is provided as part of the `Route` object
1285 │  * in the router configuration:
1286 │  *
1287 │  * ```ts
1288 │  * @NgModule({
1289 │  *   imports: [
1290 │  *     RouterModule.forRoot([
1291 │  *       {
1292 ▶  *         path: 'detail/:id',
1293 ▶  *         component: HeroDetailComponent,
1294 ▶  *         resolve: {
1295 ▶  *           hero: HeroResolver
1296 │  *         }
1297 │  *       }
1298 │  *     ])
1299 │  *   ],
1300 │  *   exports: [RouterModule]
1301 │  * })
1302 │  * export class AppRoutingModule {}
1303 │  * ```
````

📄 `angular/packages/router/src/models.ts` L1304–1324 （▶ の行: 1305, 1312, 1317）

````ts
1304 │  *
1305 ▶  * And you can access to your resolved data from `HeroComponent`:
1306 │  *
1307 │  * ```ts
1308 │  * @Component({
1309 │  *  selector: "app-hero",
1310 │  *  templateUrl: "hero.component.html",
1311 │  * })
1312 ▶  * export class HeroComponent {
1313 │  *
1314 │  *   private readonly activatedRoute = inject(ActivatedRoute);
1315 │  *
1316 │  *  ngOnInit() {
1317 ▶  *    this.activatedRoute.data.subscribe(({ hero }) => {
1318 │  *      // do something with your resolved data ...
1319 │  *    })
1320 │  *  }
1321 │  *
1322 │  * }
1323 │  * ```
1324 │  *
````

1264〜1265 行目の約束は「`resolve()` は `ResolveStart` の直後に呼ばれ、Router はデータがそろうまで活性化を待つ」です。`resolveData`（operators/resolve\_data.ts、[resolve と data の章](../router/13-router-resolvers.md)）が `ResolveStart` と `ResolveEnd` のあいだで走り、そのあと活性化に進むので、そのとおりです。この例は型検査でエラー 0 でした（`HeroService` と `Hero` は例に無いので足しました）。DEMO 2 の 2 行目で `/detail-class/8` へ移ると、`data` は `{"hero":{"name":"Superman-8"}}` です。1305 行目は「`HeroComponent` から」と書きますが、ルートの部品は 1293 行目の `HeroDetailComponent` で、1308〜1312 行目の部品の selector も `app-hero` です。名前が 1 つの例の中でそろっていません。

📄 `angular/packages/router/src/models.ts` L1325–1358 （▶ の行: 1327–1328, 1333, 1335, 1339, 1346, 1352–1356）

````ts
1325 │  * @usageNotes
1326 │  *
1327 ▶  * When both guard and resolvers are specified, the resolvers are not executed until
1328 ▶  * all guards have run and succeeded.
1329 │  * For example, consider the following route configuration:
1330 │  *
1331 │  * ```ts
1332 │  * {
1333 ▶  *  path: 'base'
1334 │  *  canActivate: [BaseGuard],
1335 ▶  *  resolve: {data: BaseDataResolver}
1336 │  *  children: [
1337 │  *   {
1338 │  *     path: 'child',
1339 ▶  *     guards: [ChildGuard],
1340 │  *     component: ChildComponent,
1341 │  *     resolve: {childData: ChildDataResolver}
1342 │  *    }
1343 │  *  ]
1344 │  * }
1345 │  * ```
1346 ▶  * The order of execution is: BaseGuard, ChildGuard, BaseDataResolver, ChildDataResolver.
1347 │  *
1348 │  * @publicApi
1349 │  * @see {@link ResolveFn}
1350 │  * @see [Data resolvers](guide/routing/data-resolvers)
1351 │  */
1352 ▶ export interface Resolve<T> {
1353 ▶   resolve(
1354 ▶     route: ActivatedRouteSnapshot,
1355 ▶     state: RouterStateSnapshot,
1356 ▶   ): MaybeAsync<T | RedirectCommand>;
1357 │ }
1358 │ 
````

1327〜1328 行目の約束「ガードが全部通るまで resolver は走らない」と、1346 行目の順「BaseGuard → ChildGuard → BaseDataResolver → ChildDataResolver」は、パイプラインで `checkGuards` が `resolveData` より前にあることから来ます（[setupNavigations の章](../router/08-router-pipeline.md)）。ただしこの設定の例は、そのままでは書けません。1333 行目の `path: 'base'` と 1335 行目の `resolve: {…}` の後ろにカンマが無く（`TS1005`）、カンマを足すと 1339 行目の `guards` が `TS2353: 'guards' does not exist in type 'Route'` になります。`guards` という Route のプロパティはありません。この区画は b00121c9a6e（2020-07-15、「docs: update reference doc for router guards and resolvers」）で入り、関数版の `ResolveFn` の説明（2 節の終わり）を書いた f5a7e02529c（2023-01-27、#48873）は `canActivate` と書きましたが、こちらは残りました。origin/main でも同じです。

## 2. ResolveFn：関数の形と RedirectCommand

📄 `angular/packages/router/src/models.ts` L1359–1390 （▶ の行: 1362–1363, 1365–1366, 1377–1378, 1384, 1388）

````ts
1359 │ /**
1360 │  * Function type definition for a data provider.
1361 │  *
1362 ▶  * A data provider can be used with the router to resolve data during navigation.
1363 ▶  * The router waits for the data to be resolved before the route is finally activated.
1364 │  *
1365 ▶  * A resolver can also redirect a `RedirectCommand` and the Angular router will use
1366 ▶  * it to redirect the current navigation to the new destination.
1367 │  *
1368 │  * @usageNotes
1369 │  *
1370 │  * The following example implements a function that retrieves the data
1371 │  * needed to activate the requested route.
1372 │  *
1373 │  * ```ts
1374 │  * interface Hero {
1375 │  *   name: string;
1376 │  * }
1377 ▶  * @Injectable()
1378 ▶  * export class HeroService {
1379 │  *   getHero(id: string) {
1380 │  *     return {name: `Superman-${id}`};
1381 │  *   }
1382 │  * }
1383 │  *
1384 ▶  * export const heroResolver: ResolveFn<Hero> = (
1385 │  *   route: ActivatedRouteSnapshot,
1386 │  *   state: RouterStateSnapshot,
1387 │  * ) => {
1388 ▶  *   return inject(HeroService).getHero(route.paramMap.get('id')!);
1389 │  * };
1390 │  *
````

📄 `angular/packages/router/src/models.ts` L1391–1418 （▶ の行: 1397, 1404, 1408, 1412）

````ts
1391 │  * bootstrapApplication(App, {
1392 │  *   providers: [
1393 │  *     provideRouter([
1394 │  *       {
1395 │  *         path: 'detail/:id',
1396 │  *         component: HeroDetailComponent,
1397 ▶  *         resolve: {hero: heroResolver},
1398 │  *       },
1399 │  *     ]),
1400 │  *   ],
1401 │  * });
1402 │  * ```
1403 │  *
1404 ▶  * And you can access to your resolved data from `HeroComponent`:
1405 │  *
1406 │  * ```ts
1407 │  * @Component({template: ''})
1408 ▶  * export class HeroDetailComponent {
1409 │  *   private activatedRoute = inject(ActivatedRoute);
1410 │  *
1411 │  *   ngOnInit() {
1412 ▶  *     this.activatedRoute.data.subscribe(({hero}) => {
1413 │  *       // do something with your resolved data ...
1414 │  *     });
1415 │  *   }
1416 │  * }
1417 │  * ```
1418 │  *
````

1365〜1366 行目の「resolver は `RedirectCommand` を返して今のナビゲーションを新しい行き先へ移せる」は、型の 1465 行目の `MaybeAsync<T | RedirectCommand>` と対応します。1365 行目の「can also redirect a `RedirectCommand`」は「return a」の書き違いです。1388 行目の `route.paramMap.get('id')!` の `!` は、`get` が `string | null` を返すからです。DEMO 2 の 1 行目は `/detail/7` で `{"hero":{"name":"Superman-7"}}` になりました。1404 行目は 1 節と同じく「`HeroComponent` から」と書き、1408 行目の部品は `HeroDetailComponent` です。

📄 `angular/packages/router/src/models.ts` L1419–1436 （▶ の行: 1419–1420, 1423, 1430–1432）

````ts
1419 ▶  * If resolved data cannot be retrieved, you may want to redirect the user
1420 ▶  * to a new page instead:
1421 │  *
1422 │  * ```ts
1423 ▶  * export const heroResolver: ResolveFn<Hero> = async (
1424 │  *   route: ActivatedRouteSnapshot,
1425 │  *   state: RouterStateSnapshot,
1426 │  * ) => {
1427 │  *   const router = inject(Router);
1428 │  *   const heroService = inject(HeroService);
1429 │  *   try {
1430 ▶  *     return await heroService.getHero(route.paramMap.get('id')!);
1431 ▶  *   } catch {
1432 ▶  *     return new RedirectCommand(router.parseUrl('/404'));
1433 │  *   }
1434 │  * };
1435 │  * ```
1436 │  *
````

`getHero` が失敗すると 1432 行目で `RedirectCommand` を返します。DEMO 2 の 3 行目（`getHero` が必ず投げるサービスに替えた）では、`router.url` が `'/404'` になり、`data` は空でした。resolver が返した `RedirectCommand` は、`resolveData` の中で redirect の例外に変わり、ガードの redirect と同じ道で新しいナビゲーションになります（[resolve と data の章](../router/13-router-resolvers.md)）。[第 1 回](01-rmd-basic-types.md)の 4 節のとおり、`throw new RedirectCommand(…)` と投げても同じです（spec 2580 行目）。

📄 `angular/packages/router/src/models.ts` L1437–1466 （▶ の行: 1437–1438, 1443, 1445, 1449, 1456, 1462–1465）

````ts
1437 ▶  * When both guard and resolvers are specified, the resolvers are not executed until
1438 ▶  * all guards have run and succeeded.
1439 │  * For example, consider the following route configuration:
1440 │  *
1441 │  * ```ts
1442 │  * {
1443 ▶  *  path: 'base'
1444 │  *  canActivate: [baseGuard],
1445 ▶  *  resolve: {data: baseDataResolver}
1446 │  *  children: [
1447 │  *   {
1448 │  *     path: 'child',
1449 ▶  *     canActivate: [childGuard],
1450 │  *     component: ChildComponent,
1451 │  *     resolve: {childData: childDataResolver}
1452 │  *    }
1453 │  *  ]
1454 │  * }
1455 │  * ```
1456 ▶  * The order of execution is: baseGuard, childGuard, baseDataResolver, childDataResolver.
1457 │  *
1458 │  * @publicApi
1459 │  * @see {@link Route}
1460 │  * @see [Data resolvers](guide/routing/data-resolvers)
1461 │  */
1462 ▶ export type ResolveFn<T> = (
1463 ▶   route: ActivatedRouteSnapshot,
1464 ▶   state: RouterStateSnapshot,
1465 ▶ ) => MaybeAsync<T | RedirectCommand>;
1466 │ 
````

こちらの例は 1449 行目が `canActivate` で、カンマ（1443・1445 行目の後ろ）を足せばエラー 0 です。DEMO 2 の 4 行目は、この形をそのまま組んで `/base/child` へ移り、`baseGuard → childGuard → baseDataResolver → childDataResolver` の順でした。1456 行目のとおりです。子の `data` は `{"data":"base","childData":"child"}` で、親の resolver の結果も入っています（親に部品が無いので継ぐ、[第 2 回](02-rmd-route.md)の 5 節）。

## 3. CanLoad と CanLoadFn：非推奨のガード

📄 `angular/packages/router/src/models.ts` L1467–1497 （▶ の行: 1470–1473, 1482, 1492–1493）

````ts
1467 │ /**
1468 │  * @description
1469 │  *
1470 ▶  * Interface that a class can implement to be a guard deciding if children can be loaded.
1471 ▶  * If all guards return `true`, navigation continues. If any guard returns `false`,
1472 ▶  * navigation is cancelled. If any guard returns a `UrlTree`, current navigation
1473 ▶  * is cancelled and a new navigation starts to the `UrlTree` returned from the guard.
1474 │  *
1475 │  * The following example implements a `CanLoad` function that decides whether the
1476 │  * current user has permission to load requested child routes.
1477 │  *
1478 │  *
1479 │  * ```ts
1480 │  * class UserToken {}
1481 │  * class Permissions {
1482 ▶  *   canLoadChildren(user: UserToken, id: string, segments: UrlSegment[]): boolean {
1483 │  *     return true;
1484 │  *   }
1485 │  * }
1486 │  *
1487 │  * @Injectable()
1488 │  * class CanLoadTeamSection implements CanLoad {
1489 │  *   private readonly permissions = inject(Permissions);
1490 │  *   private readonly currentUser = inject(UserToken);
1491 │  *
1492 ▶  *   canLoad(route: Route, segments: UrlSegment[]): Observable<boolean>|Promise<boolean>|boolean {
1493 ▶  *     return this.permissions.canLoadChildren(this.currentUser, route, segments);
1494 │  *   }
1495 │  * }
1496 │  * ```
1497 │  *
````

📄 `angular/packages/router/src/models.ts` L1498–1535 （▶ の行: 1508–1509, 1519, 1522, 1532, 1534）

````ts
1498 │  * Here, the defined guard function is provided as part of the `Route` object
1499 │  * in the router configuration:
1500 │  *
1501 │  * ```ts
1502 │  * @NgModule({
1503 │  *   imports: [
1504 │  *     RouterModule.forRoot([
1505 │  *       {
1506 │  *         path: 'team/:id',
1507 │  *         component: TeamComponent,
1508 ▶  *         loadChildren: () => import('./team').then(mod => mod.TeamModule),
1509 ▶  *         canLoad: [CanLoadTeamSection]
1510 │  *       }
1511 │  *     ])
1512 │  *   ],
1513 │  *   providers: [CanLoadTeamSection, UserToken, Permissions]
1514 │  * })
1515 │  * class AppModule {}
1516 │  * ```
1517 │  *
1518 │  * @publicApi
1519 ▶  * @deprecated Use {@link CanMatch} instead
1520 │  */
1521 │ export interface CanLoad {
1522 ▶   canLoad(route: Route, segments: UrlSegment[]): MaybeAsync<GuardResult>;
1523 │ }
1524 │ 
1525 │ /**
1526 │  * The signature of a function used as a `canLoad` guard on a `Route`.
1527 │  *
1528 │  * @publicApi
1529 │  * @see {@link CanLoad}
1530 │  * @see {@link Route}
1531 │  * @see {@link CanMatch}
1532 ▶  * @deprecated Use `Route.canMatch` and `CanMatchFn` instead
1533 │  */
1534 ▶ export type CanLoadFn = (route: Route, segments: UrlSegment[]) => MaybeAsync<GuardResult>;
1535 │ 
````

1482 行目の `canLoadChildren(user: UserToken, id: string, segments: UrlSegment[])` の 2 つ目は `string` なのに、1493 行目は `route`（`Route`）を渡します。型検査は `TS2345: Argument of type 'Route' is not assignable to parameter of type 'string'.` でした。07d8d3994cb（2017-07-19、#13127「add UrlSegment\[\] to CanLoad interface」）で `segments` を足したときからこの形で、origin/main も同じです。1471〜1473 行目の「`false` なら取り消し、`UrlTree` なら新しいナビゲーション」は、`runCanLoadGuards` の `redirectIfUrlTree`（check\_guards.ts L230〜263、[loadChildren の章](../router/11-router-lazy-loading.md)）が UrlTree を redirect の例外に変えて守ります。1519 行目と 1532 行目のとおり、`canMatch` を使うよう勧める非推奨の型です。origin/main では 574e5d76ea6 が「Remove canLoad from 1p Router」（google3 の中だけ）として外しはじめています。

## 4. NavigationBehaviorOptions：state・info・browserUrl・scroll

📄 `angular/packages/router/src/models.ts` L1536–1548 （▶ の行: 1539–1541, 1543–1544）

```ts
1536 │ /**
1537 │  * @description
1538 │  *
1539 ▶  * Options that modify the `Router` navigation strategy.
1540 ▶  * Supply an object containing any of these properties to a `Router` navigation function to
1541 ▶  * control how the navigation should be handled.
1542 │  *
1543 ▶  * @see {@link Router#navigate}
1544 ▶  * @see {@link Router#navigateByUrl}
1545 │  * @see [Routing and Navigation guide](guide/routing/common-router-tasks)
1546 │  *
1547 │  * @publicApi
1548 │  */
```

この型は `navigateByUrl(url, extras)` の `extras` で、`navigate` の `NavigationExtras` はこれに `UrlCreationOptions` を足した物です。最初の 3 つの項目のうち `onSameUrlNavigation` の説明は「`OnSameUrlNavigation` の**一部**の値」と書きますが、今の型は `OnSameUrlNavigation` の全部（`'reload' | 'ignore'`）です。332461bd0c5（2022-11-10、#48050）で `Extract<OnSameUrlNavigation, 'reload'>` として入り、726530a9af9（2023-10-18、#52265「Allow `onSameUrlNavigation: 'ignore'` in `navigateByUrl`」）が型を広げ、説明文の「a subset」は残りました。origin/main でも同じ文です。

📄 `angular/packages/router/src/models.ts` L1580–1597 （▶ の行: 1582–1585, 1587–1590, 1592–1593, 1596）

```ts
1580 │ 
1581 │   /**
1582 ▶    * Developer-defined state that can be passed to any navigation.
1583 ▶    * Access this value through the `Navigation.extras` object
1584 ▶    * returned from the [Router.currentNavigation()
1585 ▶    * method](api/router/Router#currentNavigation) while a navigation is executing.
1586 │    *
1587 ▶    * After a navigation completes, the router writes an object containing this
1588 ▶    * value together with a `navigationId` to `history.state`.
1589 ▶    * The value is written when `location.go()` or `location.replaceState()`
1590 ▶    * is called before activating this route.
1591 │    *
1592 ▶    * Note that `history.state` does not pass an object equality test because
1593 ▶    * the router adds the `navigationId` on each navigation.
1594 │    *
1595 │    */
1596 ▶   state?: {[k: string]: any};
1597 │ 
```

1587〜1590 行目の約束は「ナビゲーションのあと、この値と `navigationId` を合わせた物を `history.state` に書く。書くのは活性化の前の `location.go()` か `replaceState()`」です。state を組み立てるのは `generateNgRouterState`（state\_manager.ts L321〜332、[ブラウザの URL と履歴](../router/16-router-browser-url.md)の章）で、`{...state, navigationId}` に、`canceledNavigationResolution: 'computed'` なら `ɵrouterPageId`、`browserUrl` があれば `ɵrouterUrl` を足します。DEMO 1 の「state」で積まれた state は `{"from":"list","navigationId":2}` でした。1592〜1593 行目の「`navigationId` が足されるので、`history.state` は渡したオブジェクトと等しくならない」もこのためです。

📄 `angular/packages/router/src/models.ts` L1598–1623 （▶ の行: 1599–1602, 1608–1611, 1617–1618, 1622）

```ts
1598 │   /**
1599 ▶    * Use this to convey transient information about this particular navigation, such as how it
1600 ▶    * happened. In this way, it's different from the persisted value `state` that will be set to
1601 ▶    * `history.state`. This object is assigned directly to the Router's current `Navigation`
1602 ▶    * (it is not copied or cloned), so it should be mutated with caution.
1603 │    *
1604 │    * One example of how this might be used is to trigger different single-page navigation animations
1605 │    * depending on how a certain route was reached. For example, consider a photo gallery app, where
1606 │    * you can reach the same photo URL and state via various routes:
1607 │    *
1608 ▶    * - Clicking on it in a gallery view
1609 ▶    * - Clicking
1610 ▶    * - "next" or "previous" when viewing another photo in the album
1611 ▶    * - Etc.
1612 │    *
1613 │    * Each of these wants a different animation at navigate time. This information doesn't make sense
1614 │    * to store in the persistent URL or history entry state, but it's still important to communicate
1615 │    * from the rest of the application, into the router.
1616 │    *
1617 ▶    * This information could be used in coordination with the View Transitions feature and the
1618 ▶    * `onViewTransitionCreated` callback. The information might be used in the callback to set
1619 │    * classes on the document in order to control the transition animations and remove the classes
1620 │    * when the transition has finished animating.
1621 │    */
1622 ▶   readonly info?: unknown;
1623 │ 
```

1601〜1602 行目の約束は「`info` はコピーせず `Navigation` にそのまま入れる」です。DEMO 1 の「info」で、ガードの中の `router.currentNavigation().extras.info === 渡した物` は `true` でした。履歴の state には入りません（`{"navigationId":2}` のまま）。1608〜1611 行目の箇条書きは、1609 行目の「Clicking」と 1610 行目の「"next" or "previous" when viewing another photo」が 1 つの項目の途中で行が分かれたもので、API のページでは「Clicking」だけの項目と「"next" or "previous" …」の項目の 2 つに描かれます。

📄 `angular/packages/router/src/models.ts` L1624–1658 （▶ の行: 1625–1626, 1631–1632, 1639–1641, 1647–1649, 1651–1652, 1654, 1657）

````ts
1624 │   /**
1625 ▶    * When set, the Router will update the browser's address bar to match the given `UrlTree` instead
1626 ▶    * of the one used for route matching.
1627 │    *
1628 │    *
1629 │    * @usageNotes
1630 │    *
1631 ▶    * This feature is useful for redirects, such as redirecting to an error page, without changing
1632 ▶    * the value that will be displayed in the browser's address bar.
1633 │    *
1634 │    * ```ts
1635 │    * const canActivate: CanActivateFn = (route: ActivatedRouteSnapshot) => {
1636 │    *   const userService = inject(UserService);
1637 │    *   const router = inject(Router);
1638 │    *   if (!userService.isLoggedIn()) {
1639 ▶    *     const targetOfCurrentNavigation = router.currentNavigation()?.finalUrl;
1640 ▶    *     const redirect = router.parseUrl('/404');
1641 ▶    *     return new RedirectCommand(redirect, {browserUrl: targetOfCurrentNavigation});
1642 │    *   }
1643 │    *   return true;
1644 │    * };
1645 │    * ```
1646 │    *
1647 ▶    * This value is used directly, without considering any `UrlHandingStrategy`. In this way,
1648 ▶    * `browserUrl` can also be used to use a different value for the browser URL than what would have
1649 ▶    * been produced by from the navigation due to `UrlHandlingStrategy.merge`.
1650 │    *
1651 ▶    * This value only affects the path presented in the browser's address bar. It does not apply to
1652 ▶    * the internal `Router` state. Information such as `params` and `data` will match the internal
1653 │    * state used to match routes which will be different from the browser URL when using this feature
1654 ▶    * The same is true when using other APIs that cause the browser URL the differ from the Router
1655 │    * state, such as `skipLocationChange`.
1656 │    */
1657 ▶   readonly browserUrl?: UrlTree | string;
1658 │ 
````

1625〜1626 行目の約束は「アドレスバーは照合に使った URL ではなく、この値にする」です。`createBrowserPath`（state\_manager.ts L86〜92）の `targetBrowserUrl ?? rawUrl` がそれで、`rawUrl` の側だけが `urlHandlingStrategy.merge` を通るので、1647 行目の「`UrlHandlingStrategy` を考えずにそのまま使う」も守られます。DEMO 1 の「browserUrl」では、偽物の履歴に `push /shown` が積まれ、その state は `{"navigationId":2,"ɵrouterUrl":"/b"}`、`router.url` は `'/b'` でした。`ɵrouterUrl` は戻る・進むで戻ってきたとき、照合に使う URL を取り戻すための物です（router.ts L329〜342）。

1635〜1644 行目の例は、ガードの中で `router.currentNavigation()?.finalUrl`（照合が終わったあとの今の行き先）を取り、`/404` への `RedirectCommand` の `browserUrl` に渡します。型検査はエラー 0 で、DEMO 1 の最後のボタンでは、ガードが見た `finalUrl` は `'/secret'`、偽物の履歴は `push /secret`（state に `ɵrouterUrl: "/404"`）、`router.url` は `'/404'` でした。説明文には書き違いが 2 つあります。1647 行目の `UrlHandingStrategy`（`UrlHandlingStrategy`）と、1654 行目の「the browser URL the differ」（to differ）です。どちらも 1d3a7529b4f（2024-03-06、#53318）で入り、origin/main でも同じです。

📄 `angular/packages/router/src/models.ts` L1659–1672 （▶ の行: 1660–1661, 1663, 1665, 1668–1669, 1671）

```ts
1659 │   /**
1660 ▶    * Configures how scrolling is handled for an individual navigation when scroll restoration
1661 ▶    * is enabled in the router.
1662 │    *
1663 ▶    * - When 'manual', the router will not perform scrolling when the navigation is complete,
1664 │    * even if scroll restoration is enabled.
1665 ▶    * - When 'after-transition', scrolling will be performed after the `NavigationEnd` event,
1666 │    * according to the behavior configured in the router scrolling feature.
1667 │    *
1668 ▶    * @see withInMemoryRouterScroller
1669 ▶    * @see InMemoryScrollingOptions
1670 │    */
1671 ▶   readonly scroll?: 'manual' | 'after-transition';
1672 │ }
```

1668 行目の `@see withInMemoryRouterScroller` は、公開の関数の名前ではありません。公開されているのは `withInMemoryScrolling`（provide\_router.ts）で、`withInMemoryRouterScroller` という名前は router\_module.ts L191 のコメントにしか出てきません。a03c82564da（2025-10-14、「Add scroll behavior controls on router navigation」）で入り、origin/main も同じです。`scroll` を読むのは `RouterScroller.scheduleScrollEvent`（router\_scroller.ts L133 の `currentNavigation()?.extras.scroll`）です。

> **🧪 DEMO 1 — NavigationBehaviorOptions を 1 つずつ付けて、偽物の履歴と currentNavigation() を見る**
>
> 押すたびに別のアプリを作り、`'/a'` に入ってから表の呼び出しをします。移動先のルートには記録用の `canActivate` があり、ナビゲーションの途中の `router.currentNavigation()` の `extras` と `finalUrl`、非推奨の `getCurrentNavigation()` が同じ物を返すかを写します。偽物の `PlatformLocation` は、`pushState` / `replaceState` を「操作・URL・state」の形で積むだけです。`INFO` は `{via: 'gallery'}` のオブジェクトです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-resolve-nav)

- **skipLocationChange**: 操作は 0 回で、偽物の並びは `/ , /a` のまま、`router.url` は `'/b'` です。L1562（[navigateByUrl の章](../router/07-router-navigation-request.md)が引く）の「履歴に新しい state を積まない」のとおりです。
- **replaceUrl**: `replace /b` で、並びは `/ , /b` になります。
- **同じ URL（既定）**: `NavigationSkipped`（code 0）だけで、記録用のガードも走りません。**'reload'** では `NavigationStart` から `NavigationEnd` まで流れますが、ガードは走らず（[第 2 回](02-rmd-route.md)の DEMO 1）、同じ URL なので `replace /a` になります。
- どの場合も、終わったあとの `currentNavigation()` は `null` で、`getCurrentNavigation()` はナビゲーションの途中で `currentNavigation()` と同じ物を返しました（router.ts の `getCurrentNavigation` は `untracked(currentNavigation)` を返すだけ）。

## 5. type\_guards.ts：クラスか関数かを見分ける

📄 `angular/packages/router/src/utils/type_guards.ts` L9–32 （▶ の行: 9, 11, 13, 20–21, 26–27, 30–31）

```ts
 9 ▶ import {EmptyError} from 'rxjs';
10 │ 
11 ▶ import {CanActivateChildFn, CanActivateFn, CanDeactivateFn, CanLoadFn, CanMatchFn} from '../models';
12 │ 
13 ▶ /**
14 │  * Simple function check, but generic so type inference will flow. Example:
15 │  *
16 │  * function product(a: number, b: number) {
17 │  *   return a * b;
18 │  * }
19 │  *
20 ▶  * if (isFunction<product>(fn)) {
21 ▶  *   return fn(1, 2);
22 │  * } else {
23 │  *   throw "Must provide the `product` function";
24 │  * }
25 │  */
26 ▶ export function isFunction<T>(v: any): v is T {
27 ▶   return typeof v === 'function';
28 │ }
29 │ 
30 ▶ export function isBoolean(v: any): v is boolean {
31 ▶   return typeof v === 'boolean';
32 │ }
```

📄 `angular/packages/router/src/utils/type_guards.ts` L33–52 （▶ の行: 34–35, 38–39, 42–43, 46–47, 49–50）

```ts
33 │ 
34 ▶ export function isCanLoad(guard: any): guard is {canLoad: CanLoadFn} {
35 ▶   return guard && isFunction<CanLoadFn>(guard.canLoad);
36 │ }
37 │ 
38 ▶ export function isCanActivate(guard: any): guard is {canActivate: CanActivateFn} {
39 ▶   return guard && isFunction<CanActivateFn>(guard.canActivate);
40 │ }
41 │ 
42 ▶ export function isCanActivateChild(guard: any): guard is {canActivateChild: CanActivateChildFn} {
43 ▶   return guard && isFunction<CanActivateChildFn>(guard.canActivateChild);
44 │ }
45 │ 
46 ▶ export function isCanDeactivate<T>(guard: any): guard is {canDeactivate: CanDeactivateFn<T>} {
47 ▶   return guard && isFunction<CanDeactivateFn<T>>(guard.canDeactivate);
48 │ }
49 ▶ export function isCanMatch(guard: any): guard is {canMatch: CanMatchFn} {
50 ▶   return guard && isFunction<CanMatchFn>(guard.canMatch);
51 │ }
52 │ 
```

34〜51 行目の 5 つは同じ形で、「`guard` が偽でなく、そのメソッドが関数なら真」を返します。返り値の型 `guard is {canActivate: CanActivateFn}` は TypeScript の型ガードで、真のとき呼び出し側で `guard.canActivate(…)` を型どおりに呼べるようにします。check\_guards.ts の L163・L195・L220・L244・L278 がこれで「メソッドとして呼ぶか、関数として `runInInjectionContext` で呼ぶか」を分けます（[前の章](03-rmd-guards.md)の 2 節）。30 行目の `isBoolean` は canDeactivate の結果の検査（check\_guards.ts L71）に使われます。L53〜55 の `isEmptyError` は[resolve と data の章](../router/13-router-resolvers.md)が引いています。

13〜25 行目のコメントの例は、`isFunction<product>(fn)` と関数の名前を型引数に書いています。`product` は値なので、取り出して型検査すると `TS2749: 'product' refers to a value, but is being used as a type here. Did you mean 'typeof product'?` でした。`isFunction` は公開 API ではない（index.ts から export されていない）ので、このコメントは API のページには出ません。

「メソッドを持つか」で分けるので、関数に `canActivate` という名前のメソッドを生やすと、関数としては呼ばれず、メソッドのほうが呼ばれます。`InjectionToken` に `useValue: {canActivate}` を置いても、文字列のトークンに関数を置いても動きます（DEMO 2 の最後の 3 行）。後の 2 つが models.ts L108 の `DeprecatedGuard`（[第 1 回](01-rmd-basic-types.md)の 3 節）の「`ProviderToken<any> | string`」です。

> **🧪 DEMO 2 — resolver の例と、型ガードの分かれ道**
>
> 1 つのアプリに、`heroResolver`（1384 行）・`HeroResolver`（1272 行）・失敗して `RedirectCommand` を返す resolver（1423 行）・1442〜1455 行目の順の例・3 種類の古い形のガードを並べ、順に移ります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-resolve-nav)

## ここまでの呼び出し

- 👤 `router.navigateByUrl(url, {state, info, browserUrl, …})` — router.ts L546
  - `scheduleNavigation(mergedTree, IMPERATIVE_NAVIGATION, null, extras)` — router.ts L555・L665 — *extras は Navigation.extras にそのまま*
  - `onSameUrlNavigation の判定` — navigation\_transition.ts L505〜506 — *同じ URL で 'reload' でなければ NavigationSkipped*
  - `checkGuards → resolveData` — check\_guards.ts L56・resolve\_data.ts L28 — *ガードのあとに resolver*
  - `HistoryStateManager.handleRouterEvent（BeforeActivateRoutes）→ setBrowserUrl` — state\_manager.ts L231〜235・L246 — *deferred で skipLocationChange でなければ*
    - `createBrowserPath / generateNgRouterState` — state\_manager.ts L86・L321 — *browserUrl ?? merge の URL、{...state, navigationId, ɵrouterUrl}*

## テストと直し方

| ファイル（packages/router/test/） | describe › it（行） | 固めている約束 | 走らせた数 |
| --- | --- | --- | --- |
| `operators/resolve_data.spec.ts` | `resolveData operator`（16）› 18・26・34・54・98 ほか | 最初の値だけを使う、完了しない resolver で取り消す | 10 |
| `integration/route_data.spec.ts` | 688 `should allow resolvers as pure functions`・703 | `ResolveFn` と `inject` | 4 |
| `integration/guards.spec.ts` | `CanLoad`（1585）› 1602・1725・1811 ほか | `false` で読まない、UrlTree で redirect | 12 |
| `integration/navigation.spec.ts` | 147 `should set transient navigation info`・167・199 | ガードの中の `currentNavigation()?.extras?.info`。ただし `toEqual('navigation info')` と文字列で比べるので、1601〜1602 行目の「コピーしない」（同じオブジェクト）は確かめていない | 6 |
| `integration/navigation.spec.ts` | 265 `should set history.state if passed using imperative navigation`・291 | `state` と `navigationId` | 4 |
| `integration/integration.spec.ts`・`navigation.spec.ts` | 286・308・330（skipLocationChange）、405（replaceUrl）、397（browserUrl と popstate） | 3 つの項目 | 10・8・8 |
| `integration/guards.spec.ts` | 535 `can redirect to 404 without changing the URL`・576 `retains browserUrl through UrlTree redirects` | 1635〜1644 行目の例に近い形（535 は `getCurrentNavigation()?.finalUrl` を `navigateByUrl` に渡す） | （`browserUrl` の 8 に含む） |
| （なし） | — | 1346・1456 行目の「親のガード → 子のガード → 親の resolver → 子の resolver」の順。`guards order`（2004）はガードだけを並べる | — |

📄 `走らせたコマンドと型検査（2026-11-21、../angular の 8576f161ae4）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=resolveData operator             Ran 10 of 1170 specs、0 failures
--filter=should allow resolvers as pure functions|should allow DI in resolvers as pure functions
                                          Ran 4 of 1170 specs、0 failures
--filter=guards CanLoad                   Ran 12 of 1170 specs、0 failures
--filter=transient navigation info        Ran 6 of 1170 specs、0 failures
--filter=history.state                    Ran 4 of 1170 specs、0 failures
--filter=skipLocationChange               Ran 10 of 1170 specs、0 failures
--filter=replaceUrl                       Ran 8 of 1170 specs、0 failures
--filter=browserUrl                       Ran 8 of 1170 specs、0 failures

# 説明文の例の型検査（models.ts の行をそのまま取り出した .ts、サイトの TypeScript 6.0.3、--strict）
ex-canload.ts(25,63): error TS2345: Argument of type 'Route' is not assignable to parameter of type 'string'.   # 1493 行目
ex-resolve-order.ts(16,2): error TS1005: ',' expected.     # 1333 行目の path: 'base' の後ろ
ex-resolve-order.ts(18,2): error TS1005: ',' expected.     # 1335 行目の resolve: {…} の後ろ
fix-resolve-order.ts(21,5): error TS2353: Object literal may only specify known properties, and 'guards' does not exist in type 'Route'.   # カンマを足すと 1339 行目
ex-resolvefn-order.ts: 1443・1445 行目に同じ 2 つの TS1005（足すとエラー 0）
ex-resolve.ts / ex-resolvefn-redirect.ts / ex-browserurl.ts   # エラー 0
type_guards.ts の 16〜24 行目のコメントの例:
ex-type-guards.ts(8,16): error TS2749: 'product' refers to a value, but is being used as a type here. Did you mean 'typeof product'?
```

直すとしたら、説明文は models.ts の 1305・1404 行目（`HeroComponent`）、1333・1335・1339 行目（カンマと `guards`）、1365 行目（redirect → return）、1443・1445 行目（カンマ）、1482〜1493 行目（`id: string` と `route`）、L1553〜1554（「a subset」）、1609〜1610 行目（箇条書き）、1647・1654 行目（綴り）、1668 行目（`withInMemoryScrolling`）です。type\_guards.ts の 20 行目は `isFunction<typeof product>` になります。spec を足すなら、「コピーしない」は navigation.spec.ts の 147 行目の it の `toEqual` を、渡したオブジェクトとの `toBe` に替える形、順番は guards.spec.ts の `order`（2004）に、DEMO 2 の 4 行目と同じ親子の `resolve` を足して logger に積む形です。

## 聞かれそうな質問

**Q. resolver から redirect するには、何を返せばよいですか？**

`RedirectCommand` です（1365〜1366 行目、型は 1465 行目）。`UrlTree` は resolver の戻り値の型に入っていません。`throw new RedirectCommand(…)` でも同じになります（spec 2580 行目）。DEMO 2 の 3 行目で `/404` へ移りました。

**Q. `state` で渡した値は、どこで読めますか？**

ナビゲーションの途中は `router.currentNavigation()?.extras.state`、終わったあとは `history.state`（`navigationId` が足された物）と `lastSuccessfulNavigation()?.extras.state` です（1582〜1590 行目）。`skipLocationChange` と一緒だと履歴に書かないので、`history.state` には入りません（[第 1 回](01-rmd-basic-types.md)の DEMO 1）。

**Q. `info` と `state` はどう違いますか？**

`state` は履歴に書かれて戻る・進むでも残り、`info` は今のナビゲーションの `Navigation` にだけ入り、履歴には書かれません（1599〜1602 行目）。`info` はコピーされないので、渡したオブジェクトそのものがガードの中で見えます（DEMO 1）。

**Q. `browserUrl` を使うと、`ActivatedRoute` の params はどちらの URL のものになりますか？**

照合に使った URL（`router.url`）のものです（1651〜1653 行目）。アドレスバーだけが `browserUrl` になり、照合の URL は state の `ɵrouterUrl` に残して、戻ってきたときに router.ts L329〜342 が取り戻します。

**Q. 古いクラスのガードと関数のガードを、Router はどう見分けますか？**

type\_guards.ts の `isCanActivate` などが、引いた物に同じ名前のメソッドがあるかで見分けます（38〜40 行目）。クラスかどうかは見ていないので、メソッドを持つ関数はメソッドのほうが呼ばれます（DEMO 2）。

## 読み終えて

- resolver はガードのあとに走り、`RedirectCommand` を返すか投げると redirect になる。説明文の順の例は、関数版（1442 行目）だけがそのまま書ける。
- `state` は `navigationId` と合わせて履歴に、`info` は Navigation にだけ、`browserUrl` はアドレスバーにだけ効き、照合の URL は `ɵrouterUrl` に残る。
- このシリーズの説明文の中で、この区画は書き違いがいちばん多い。型の変更（#52265）や機能の追加（#53318・a03c82564da）のときに入った文が、そのまま残っている。
- type\_guards.ts は「メソッドを持つか」だけでクラスのガードと関数のガードを分ける。

---

← 前: [ガードの型：CanActivate から CanMatch まで](03-rmd-guards.md)  
次: [provideRouter の機能の説明文：withXxx の約束](05-rmd-features.md) →
