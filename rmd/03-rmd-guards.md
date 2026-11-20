[目次](../README.md) › [Router の型と説明文の読み残し](README.md) › 第 3 回 / 全 9 回

# ガードの型：CanActivate から CanMatch まで

> models.ts の LoadedRouterConfig と、CanActivate・CanActivateFn・CanActivateChild・CanDeactivate・CanMatch の説明文と例：どの引数が渡り、何を返すとどうなるか。説明文の例を本物の Router で動かす。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-guards)

---

models.ts の 832〜1244 行目は、ガードの型が並ぶ区画です。`CanActivate`・`CanActivateChild`・`CanDeactivate`・`CanMatch` のクラス用のインターフェースと、関数用の `…Fn` の型が 1 組ずつあり、それぞれに説明文と例が付いています。この章は、その例を本物の Router で動く形にして、**どのガードが、どの引数で、何回呼ばれるか**を記録します。例のうち 2 つは書かれたままでは型が通らないので、どこが通らないかを TypeScript で確かめてから、直した形で動かします。ガードがどの順で呼ばれるか（`checkGuards` が canDeactivate を先に走らせる）は[ガードの実行順](../router/12-router-guards.md)の章、`mapToCanActivate` などの変換は[前のシリーズの第 5 回](../rtl/05-rtl-load-guard.md)にあるので、ここでは型と説明文の側から読みます。

読む対象は `packages/router/src/models.ts` の 832〜1244 行目です（../angular、8576f161ae4）。

1. [1. models.ts の小さな型](01-rmd-basic-types.md)
2. [2. Route の説明文](02-rmd-route.md)
3. **3. ガードの型**（この章）
4. [4. Resolve と NavigationBehaviorOptions](04-rmd-resolve-nav.md)
5. [5. provideRouter の機能](05-rmd-features.md)
6. [6. ルーターのイベント](06-rmd-events.md)
7. [7. RouterLink と RouterOutlet](07-rmd-directives.md)
8. [8. URL とナビゲーションの小道具](08-rmd-url-rest.md)
9. [9. spec と issue](09-rmd-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 「クラスのガード」は `canActivate: [CanActivateTeam]` のようにクラスを書き、Router が注入器からインスタンスを引いてメソッドを呼ぶ古い形です（[第 1 回](01-rmd-basic-types.md)の 3 節の `DeprecatedGuard`）。「関数のガード」は `canActivate: [canActivateTeam]` のように関数を書き、Router が注入の文脈の中で呼びます。説明文はどちらにも例を持っています。

## 1. LoadedRouterConfig と CanActivate（クラス）

📄 `angular/packages/router/src/models.ts` L832–870 （▶ の行: 833–836, 842–845, 852–853, 858, 860–861, 866–867）

````ts
832 │ 
833 ▶ export interface LoadedRouterConfig {
834 ▶   routes: Route[];
835 ▶   injector: EnvironmentInjector | undefined;
836 ▶   factory?: NgModuleFactory<unknown>;
837 │ }
838 │ 
839 │ /**
840 │  * @description
841 │  *
842 ▶  * Interface that a class can implement to be a guard deciding if a route can be activated.
843 ▶  * If all guards return `true`, navigation continues. If any guard returns `false`,
844 ▶  * navigation is cancelled. If any guard returns a `UrlTree`, the current navigation
845 ▶  * is cancelled and a new navigation begins to the `UrlTree` returned from the guard.
846 │  *
847 │  * The following example implements a `CanActivate` function that checks whether the
848 │  * current user has permission to activate the requested route.
849 │  *
850 │  * ```ts
851 │  * class UserToken {}
852 ▶  * class Permissions {
853 ▶  *   canActivate(): boolean {
854 │  *     return true;
855 │  *   }
856 │  * }
857 │  *
858 ▶  * @Injectable()
859 │  * class CanActivateTeam implements CanActivate {
860 ▶  *   private readonly permissions = inject(Permissions);
861 ▶  *   private readonly currentUser = inject(UserToken);
862 │  *
863 │  *   canActivate(
864 │  *     route: ActivatedRouteSnapshot,
865 │  *     state: RouterStateSnapshot
866 ▶  *   ): MaybeAsync<GuardResult> {
867 ▶  *     return this.permissions.canActivate(this.currentUser, route.params.id);
868 │  *   }
869 │  * }
870 │  * ```
````

833〜837 行目の `LoadedRouterConfig` は公開されていない型で、`loadChildren` を読んだ結果（子の `routes`・その `injector`・NgModule なら `factory`）です。`RouterConfigLoader.loadChildren`（router\_config\_loader.ts L82）が返し、recognize.ts L498 と router\_preloader.ts L171 が受けます（[loadChildren の章](../router/11-router-lazy-loading.md)）。

843〜845 行目の約束は「全部 `true` なら進む、どれかが `false` なら取り消し、どれかが `UrlTree` なら取り消して新しいナビゲーション」です。`RedirectCommand` は書いていませんが、866 行目の戻り値の型 `MaybeAsync<GuardResult>` が含みます（[第 1 回](01-rmd-basic-types.md)の 4 節）。「どれか」の決め方は `prioritizedGuardValue` で、配列の**前の**ガードの答えが出るまで後ろの答えを使いません（[ガードの章](../router/12-router-guards.md)）。

この例は書かれたままでは型が通りません。853 行目の `Permissions.canActivate()` は引数なしなのに、867 行目は `(this.currentUser, route.params.id)` と 2 つ渡します。models.ts の 851〜869 行目をそのまま取り出して型検査すると、`TS2554: Expected 0 arguments, but got 2.` になりました。0abb67af59a（2022-07-01、#46684「allow guards and resolvers to be plain functions」）が 853 行目の `canActivate(user: UserToken, id: string)` を `canActivate()` に書き換え、867 行目はそのまま残りました。origin/main も同じです。`ng new` の既定の `noPropertyAccessFromIndexSignature` を付けると、867 行目の `route.params.id` も `TS4111`（`['id']` で読むこと）になります。JS としては動くので、DEMO は 853 行目に引数を足した形で動かします。

📄 `angular/packages/router/src/models.ts` L871–898 （▶ の行: 876, 878, 882, 886, 897）

````ts
871 │  *
872 │  * Here, the defined guard function is provided as part of the `Route` object
873 │  * in the router configuration:
874 │  *
875 │  * ```ts
876 ▶  * @NgModule({
877 │  *   imports: [
878 ▶  *     RouterModule.forRoot([
879 │  *       {
880 │  *         path: 'team/:id',
881 │  *         component: TeamComponent,
882 ▶  *         canActivate: [CanActivateTeam]
883 │  *       }
884 │  *     ])
885 │  *   ],
886 ▶  *   providers: [CanActivateTeam, UserToken, Permissions]
887 │  * })
888 │  * class AppModule {}
889 │  * ```
890 │  *
891 │  * @see [CanActivate](guide/routing/route-guards#canactivate)
892 │  *
893 │  *
894 │  * @publicApi
895 │  */
896 │ export interface CanActivate {
897 ▶   canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): MaybeAsync<GuardResult>;
898 │ }
````

886 行目の `providers: [CanActivateTeam, UserToken, Permissions]` は、クラスのガードを注入器に置く行です。`RouterModule.forRoot` も `provideRouter` も同じ `ROUTES` と Router を provide するので（[provideRouter の章](../router/05-router-provide-router.md)）、DEMO はこれを `createApplication({providers: [provideRouter(routes), CanActivateTeam, UserToken, Permissions, …]})` に置き換えています。851 行目の `UserToken` と `Permissions` には `@Injectable()` がありませんが、引数の無いクラスなので注入器はそのまま `new` で作ります。

## 2. CanActivateFn：関数の形

📄 `angular/packages/router/src/models.ts` L899–930 （▶ の行: 907–908, 911–912, 916, 924–926, 928）

````ts
899 │ 
900 │ /**
901 │  * The signature of a function used as a `canActivate` guard on a `Route`.
902 │  *
903 │  * If all guards return `true`, navigation continues. If any guard returns `false`,
904 │  * navigation is cancelled. If any guard returns a `UrlTree`, the current navigation
905 │  * is cancelled and a new navigation begins to the `UrlTree` returned from the guard.
906 │  *
907 ▶  * The following example implements and uses a `CanActivateFn` that checks whether the
908 ▶  * current user has permission to activate the requested route.
909 │  *
910 │  * ```ts
911 ▶  * @Injectable()
912 ▶  * class UserToken {}
913 │  *
914 │  * @Injectable()
915 │  * class PermissionsService {
916 ▶  *   canActivate(currentUser: UserToken, userId: string): boolean {
917 │  *     return true;
918 │  *   }
919 │  *   canMatch(currentUser: UserToken): boolean {
920 │  *     return true;
921 │  *   }
922 │  * }
923 │  *
924 ▶  * const canActivateTeam: CanActivateFn = (
925 ▶  *   route: ActivatedRouteSnapshot,
926 ▶  *   state: RouterStateSnapshot,
927 │  * ) => {
928 ▶  *   return inject(PermissionsService).canActivate(inject(UserToken), route.params['id']);
929 │  * };
930 │  * ```
````

📄 `angular/packages/router/src/models.ts` L931–957 （▶ の行: 936, 938, 942, 953–956）

````ts
931 │  *
932 │  * Here, the defined guard function is provided as part of the `Route` object
933 │  * in the router configuration:
934 │  *
935 │  * ```ts
936 ▶  * bootstrapApplication(App, {
937 │  *    providers: [
938 ▶  *      provideRouter([
939 │  *        {
940 │  *          path: 'team/:id',
941 │  *          component: TeamComponent,
942 ▶  *          canActivate: [canActivateTeam],
943 │  *        },
944 │  *      ]),
945 │  *    ],
946 │  *  });
947 │  * ```
948 │  *
949 │  * @publicApi
950 │  * @see {@link Route}
951 │  * @see [CanActivate](guide/routing/route-guards#canactivate)
952 │  */
953 ▶ export type CanActivateFn = (
954 ▶   route: ActivatedRouteSnapshot,
955 ▶   state: RouterStateSnapshot,
956 ▶ ) => MaybeAsync<GuardResult>;
957 │ 
````

928 行目の `inject(PermissionsService)` が使えるのは、Router が関数のガードを `runInInjectionContext(closestInjector, () => guard(futureARS, futureRSS))`（check\_guards.ts L163〜166）で呼ぶからです。`closestInjector` はそのルートの `_environmentInjector`（ルートに `providers` があればその注入器）です。クラスの形との分かれ目は L163 の `isCanActivate(guard)` で、引いた物が `canActivate` メソッドを持っていればメソッドとして、持っていなければ関数として呼びます（[第 4 回](04-rmd-resolve-nav.md)の 5 節）。この例（911〜946 行目）は `packages/examples/router/route_functional_guards.ts` の region と同じ中身で、型検査はエラー 0 でした。

## 3. CanActivateChild と CanActivateChildFn

📄 `angular/packages/router/src/models.ts` L958–989 （▶ の行: 961–964, 972, 978, 982–983, 986）

````ts
958 │ /**
959 │  * @description
960 │  *
961 ▶  * Interface that a class can implement to be a guard deciding if a child route can be activated.
962 ▶  * If all guards return `true`, navigation continues. If any guard returns `false`,
963 ▶  * navigation is cancelled. If any guard returns a `UrlTree`, current navigation
964 ▶  * is cancelled and a new navigation begins to the `UrlTree` returned from the guard.
965 │  *
966 │  * The following example implements a `CanActivateChild` function that checks whether the
967 │  * current user has permission to activate the requested child route.
968 │  *
969 │  * ```ts
970 │  * class UserToken {}
971 │  * class Permissions {
972 ▶  *   canActivate(user: UserToken, id: string): boolean {
973 │  *     return true;
974 │  *   }
975 │  * }
976 │  *
977 │  * @Injectable()
978 ▶  * class CanActivateTeam implements CanActivateChild {
979 │  *   private readonly permissions = inject(Permissions);
980 │  *   private readonly currentUser = inject(UserToken);
981 │  *
982 ▶  *   canActivateChild(
983 ▶  *     route: ActivatedRouteSnapshot,
984 │  *     state: RouterStateSnapshot
985 │  *   ): MaybeAsync<GuardResult> {
986 ▶  *     return this.permissions.canActivate(this.currentUser, route.params.id);
987 │  *   }
988 │  * }
989 │  * ```
````

📄 `angular/packages/router/src/models.ts` L990–1022 （▶ の行: 999–1001, 1003, 1018–1020）

````ts
 990 │  *
 991 │  * Here, the defined guard function is provided as part of the `Route` object
 992 │  * in the router configuration:
 993 │  *
 994 │  * ```ts
 995 │  * @NgModule({
 996 │  *   imports: [
 997 │  *     RouterModule.forRoot([
 998 │  *       {
 999 ▶  *         path: 'root',
1000 ▶  *         canActivateChild: [CanActivateTeam],
1001 ▶  *         children: [
1002 │  *           {
1003 ▶  *              path: 'team/:id',
1004 │  *              component: TeamComponent
1005 │  *           }
1006 │  *         ]
1007 │  *       }
1008 │  *     ])
1009 │  *   ],
1010 │  *   providers: [CanActivateTeam, UserToken, Permissions]
1011 │  * })
1012 │  * class AppModule {}
1013 │  * ```
1014 │  * @see [CanActivateChild](guide/routing/route-guards#canactivatechild)
1015 │  * @publicApi
1016 │  */
1017 │ export interface CanActivateChild {
1018 ▶   canActivateChild(
1019 ▶     childRoute: ActivatedRouteSnapshot,
1020 ▶     state: RouterStateSnapshot,
1021 │   ): MaybeAsync<GuardResult>;
1022 │ }
````

1019 行目の引数の名前は `childRoute` です。`runCanActivateChild`（check\_guards.ts L174〜207、[ガードの章](../router/12-router-guards.md)）は、活性化する子の snapshot（`path[path.length - 1]`）を、祖先の `canActivateChild` に**そのまま**渡します。ガードを持つ親の snapshot ではありません。DEMO の「CanActivateChild（クラス）」は、`'root'` に付けたガードが `route {routeConfig.path: 'team/:id', params: {"id":"7"}}` を受けます。986 行目の `route.params.id` は子の `:id` なので、例は意図どおりに動きます。

📄 `angular/packages/router/src/models.ts` L1023–1044 （▶ の行: 1031–1032, 1034, 1040–1042）

```ts
1023 │ 
1024 │ /**
1025 │  * The signature of a function used as a `canActivateChild` guard on a `Route`.
1026 │  *
1027 │  * If all guards return `true`, navigation continues. If any guard returns `false`,
1028 │  * navigation is cancelled. If any guard returns a `UrlTree`, the current navigation
1029 │  * is cancelled and a new navigation begins to the `UrlTree` returned from the guard.
1030 │  *
1031 ▶  * The following example implements a `canActivate` function that checks whether the
1032 ▶  * current user has permission to activate the requested route.
1033 │  *
1034 ▶  * {@example router/route_functional_guards.ts region="CanActivateChildFn"}
1035 │  *
1036 │  * @publicApi
1037 │  * @see {@link Route}
1038 │  * @see [CanActivateChild](guide/routing/route-guards#canactivatechild)
1039 │  */
1040 ▶ export type CanActivateChildFn = (
1041 ▶   childRoute: ActivatedRouteSnapshot,
1042 ▶   state: RouterStateSnapshot,
1043 │ ) => MaybeAsync<GuardResult>;
1044 │ 
```

1031 行目は「implements a `canActivate` function」と書きますが、この段落は `CanActivateChildFn` の説明です。1034 行目が指す region は、`{path: 'team/:id', component: TeamComponent, canActivateChild: [canActivateChildExample], children: []}` です。`children: []` なので、`/team/7` へ移っても活性化する子が無く、**ガードは一度も呼ばれません**（DEMO の「CanActivateChildFn」）。子 `{path: 'x'}` を足して `/team/8/x` へ移ると、ガードは子の snapshot を受け、その params は `{"id":"8"}` でした。子の path は `'x'` なのに `id` があるのは、既定の `paramsInheritanceStrategy: 'always'` で親の params を継ぐからです（[第 2 回](02-rmd-route.md)の 3 節）。

## 4. CanDeactivate と CanDeactivateFn

📄 `angular/packages/router/src/models.ts` L1045–1083 （▶ の行: 1048–1051, 1059, 1070, 1075–1078, 1080）

````ts
1045 │ /**
1046 │  * @description
1047 │  *
1048 ▶  * Interface that a class can implement to be a guard deciding if a route can be deactivated.
1049 ▶  * If all guards return `true`, navigation continues. If any guard returns `false`,
1050 ▶  * navigation is cancelled. If any guard returns a `UrlTree`, current navigation
1051 ▶  * is cancelled and a new navigation begins to the `UrlTree` returned from the guard.
1052 │  *
1053 │  * The following example implements a `CanDeactivate` function that checks whether the
1054 │  * current user has permission to deactivate the requested route.
1055 │  *
1056 │  * ```ts
1057 │  * class UserToken {}
1058 │  * class Permissions {
1059 ▶  *   canDeactivate(user: UserToken, id: string): boolean {
1060 │  *     return true;
1061 │  *   }
1062 │  * }
1063 │  * ```
1064 │  *
1065 │  * Here, the defined guard function is provided as part of the `Route` object
1066 │  * in the router configuration:
1067 │  *
1068 │  * ```ts
1069 │  * @Injectable()
1070 ▶  * class CanDeactivateTeam implements CanDeactivate<TeamComponent> {
1071 │  *   private readonly permissions = inject(Permissions);
1072 │  *   private readonly currentUser = inject(UserToken);
1073 │  *
1074 │  *   canDeactivate(
1075 ▶  *     component: TeamComponent,
1076 ▶  *     currentRoute: ActivatedRouteSnapshot,
1077 ▶  *     currentState: RouterStateSnapshot,
1078 ▶  *     nextState: RouterStateSnapshot
1079 │  *   ): MaybeAsync<GuardResult> {
1080 ▶  *     return this.permissions.canDeactivate(this.currentUser, route.params.id);
1081 │  *   }
1082 │  * }
1083 │  *
````

1080 行目の `route.params.id` の `route` は、この関数のどこにも無い名前です。引数は 1076 行目の `currentRoute` です。型検査は `TS2552: Cannot find name 'route'. Did you mean 'Router'?` で、JS として動かせば `ReferenceError` になり、ナビゲーションは `NavigationError` で終わります。`git log -S` でたどると、この行は 3e51a199830（2017-03-02、ソースを /packages へ移したコミット）の時点で、もう `route.params.id` でした。4dbd2028fe1（2022-02-02、型を models.ts へ移したコミット）がそのまま運び、origin/main も同じです。DEMO は `currentRoute.params['id']` に直して動かします。

📄 `angular/packages/router/src/models.ts` L1084–1109 （▶ の行: 1090, 1094, 1101, 1103–1106）

````ts
1084 │  * @NgModule({
1085 │  *   imports: [
1086 │  *     RouterModule.forRoot([
1087 │  *       {
1088 │  *         path: 'team/:id',
1089 │  *         component: TeamComponent,
1090 ▶  *         canDeactivate: [CanDeactivateTeam]
1091 │  *       }
1092 │  *     ])
1093 │  *   ],
1094 ▶  *   providers: [CanDeactivateTeam, UserToken, Permissions]
1095 │  * })
1096 │  * class AppModule {}
1097 │  * ```
1098 │  * @see [CanDeactivate](guide/routing/route-guards#candeactivate)
1099 │  * @publicApi
1100 │  */
1101 ▶ export interface CanDeactivate<T> {
1102 │   canDeactivate(
1103 ▶     component: T,
1104 ▶     currentRoute: ActivatedRouteSnapshot,
1105 ▶     currentState: RouterStateSnapshot,
1106 ▶     nextState: RouterStateSnapshot,
1107 │   ): MaybeAsync<GuardResult>;
1108 │ }
1109 │ 
````

4 つの引数は `runCanDeactivate`（check\_guards.ts L209〜228）がそのまま渡します。`component` は出口にいる部品のインスタンス（`context.outlet.component`、preactivation.ts の `getRouteGuards`）、`currentRoute` と `currentState` は今の木、`nextState` は移り先の木です。DEMO の「CanDeactivate（クラス）」では、`'/team/7'` から `'/other'` へ移るとき、`TeamComponent` のインスタンス・`team/:id` の snapshot・`{url: '/team/7'}`・`{url: '/other'}` の順に届きました。部品が出口に無い（bootstrap していない）と、canDeactivate の検査そのものが積まれません（preactivation.ts L154 の `context.outlet.isActivated`）。DEMO が部品を文書に付けない div に bootstrap しているのはこのためです。

📄 `angular/packages/router/src/models.ts` L1110–1132 （▶ の行: 1117–1118, 1120, 1126–1130）

```ts
1110 │ /**
1111 │  * The signature of a function used as a `canDeactivate` guard on a `Route`.
1112 │  *
1113 │  * If all guards return `true`, navigation continues. If any guard returns `false`,
1114 │  * navigation is cancelled. If any guard returns a `UrlTree`, the current navigation
1115 │  * is cancelled and a new navigation begins to the `UrlTree` returned from the guard.
1116 │  *
1117 ▶  * The following example implements and uses a `CanDeactivateFn` that checks whether the
1118 ▶  * user component has unsaved changes before navigating away from the route.
1119 │  *
1120 ▶  * {@example router/route_functional_guards.ts region="CanDeactivateFn"}
1121 │  *
1122 │  * @publicApi
1123 │  * @see {@link Route}
1124 │  * @see [CanDeactivate](guide/routing/route-guards#candeactivate)
1125 │  */
1126 ▶ export type CanDeactivateFn<T> = (
1127 ▶   component: T,
1128 ▶   currentRoute: ActivatedRouteSnapshot,
1129 ▶   currentState: RouterStateSnapshot,
1130 ▶   nextState: RouterStateSnapshot,
1131 │ ) => MaybeAsync<GuardResult>;
1132 │ 
```

1120 行目の region は `canDeactivate: [(component: UserComponent) => !component.hasUnsavedChanges]` で、1 つ目の引数だけを使う関数です。`hasUnsavedChanges = true` のままだと `NavigationCancel`（code 3）で `'/user/7'` に残り、「Permissions の答え」を `true` にして（DEMO は保存したことにして `false` にする）移ると `'/other'` へ進みます。

## 5. CanMatch と CanMatchFn：「飛ばして次を試す」ガード

📄 `angular/packages/router/src/models.ts` L1133–1167 （▶ の行: 1136–1139, 1148, 1154, 1158–1163）

````ts
1133 │ /**
1134 │  * @description
1135 │  *
1136 ▶  * Interface that a class can implement to be a guard deciding if a `Route` can be matched.
1137 ▶  * If all guards return `true`, navigation continues and the `Router` will use the `Route` during
1138 ▶  * activation. If any guard returns `false`, the `Route` is skipped for matching and other `Route`
1139 ▶  * configurations are processed instead.
1140 │  *
1141 │  * The following example implements a `CanMatch` function that decides whether the
1142 │  * current user has permission to access the users page.
1143 │  *
1144 │  *
1145 │  * ```ts
1146 │  * class UserToken {}
1147 │  * class Permissions {
1148 ▶  *   canAccess(user: UserToken, route: Route, segments: UrlSegment[]): boolean {
1149 │  *     return true;
1150 │  *   }
1151 │  * }
1152 │  *
1153 │  * @Injectable()
1154 ▶  * class CanMatchTeamSection implements CanMatch {
1155 │  *   private readonly permissions = inject(Permissions);
1156 │  *   private readonly currentUser = inject(UserToken);
1157 │  *
1158 ▶  *   canMatch(
1159 ▶  *     route: Route,
1160 ▶  *     segments: UrlSegment[],
1161 ▶  *     currentSnapshot: PartialMatchRouteSnapshot,
1162 ▶  *   ): Observable<boolean> | Promise<boolean> | boolean {
1163 ▶  *     return this.permissions.canAccess(this.currentUser, route, segments);
1164 │  *   }
1165 │  * }
1166 │  * ```
1167 │  *
````

📄 `angular/packages/router/src/models.ts` L1168–1206 （▶ の行: 1176–1179, 1182–1183, 1187, 1192–1194, 1199–1204）

````ts
1168 │  * Here, the defined guard function is provided as part of the `Route` object
1169 │  * in the router configuration:
1170 │  *
1171 │  * ```ts
1172 │  * @NgModule({
1173 │  *   imports: [
1174 │  *     RouterModule.forRoot([
1175 │  *       {
1176 ▶  *         path: 'team/:id',
1177 ▶  *         component: TeamComponent,
1178 ▶  *         loadChildren: () => import('./team').then(mod => mod.TeamModule),
1179 ▶  *         canMatch: [CanMatchTeamSection]
1180 │  *       },
1181 │  *       {
1182 ▶  *         path: '**',
1183 ▶  *         component: NotFoundComponent
1184 │  *       }
1185 │  *     ])
1186 │  *   ],
1187 ▶  *   providers: [CanMatchTeamSection, UserToken, Permissions]
1188 │  * })
1189 │  * class AppModule {}
1190 │  * ```
1191 │  *
1192 ▶  * If the `CanMatchTeamSection` were to return `false`, the router would continue navigating to the
1193 ▶  * `team/:id` URL, but would load the `NotFoundComponent` because the `Route` for `'team/:id'`
1194 ▶  * could not be used for a URL match but the catch-all `**` `Route` did instead.
1195 │  *
1196 │  * @publicApi
1197 │  * @see [CanMatch](guide/routing/route-guards#canmatch)
1198 │  */
1199 ▶ export interface CanMatch {
1200 ▶   canMatch(
1201 ▶     route: Route,
1202 ▶     segments: UrlSegment[],
1203 ▶     currentSnapshot: PartialMatchRouteSnapshot,
1204 ▶   ): MaybeAsync<GuardResult>;
1205 │ }
1206 │ 
````

`canMatch` は照合の段で走ります。`matchWithChecks`（config\_matching.ts L54〜80、[recognize](../router/09-router-recognize.md)の章）は、まず `match` で path が合うかを見て、合ったときだけ `runCanMatchGuards` を呼び、答えが `true` でなければ `{...noMatch}` を返します。recognize はそれを「このルートは合わない」として次のルートへ進みます。1192〜1194 行目の約束「`false` なら URL は `team/:id` のまま、`'**'` の `NotFoundComponent` が出る」は、DEMO の「CanMatch（クラス）」で Permissions を `false` にすると、`NavigationEnd('/team/7')`・`router.url '/team/7'`・出ている部品 `NotFoundComponent` になり、そのとおりでした。`true` のときは 1178 行目の `loadChildren` が呼ばれ、`TeamComponent` の中に子が出ます。`false` のときは `loadChildren` は呼ばれません。`canMatch` は読み込みより前に走るからです。

1162 行目の戻り値の型は `Observable<boolean> | Promise<boolean> | boolean` で、インターフェースの 1204 行目の `MaybeAsync<GuardResult>` より狭い型です。狭い型を返すメソッドは広い型のインターフェースを実装できるので、型検査は通ります。UrlTree や `RedirectCommand` を返す例はここにはなく、返したときは `redirectIfUrlTree`（check\_guards.ts L254〜263）が redirect の例外にします（[redirectTo の章](../router/10-router-redirects.md)）。

📄 `angular/packages/router/src/models.ts` L1207–1232 （▶ の行: 1210–1212, 1217, 1219–1221, 1227–1230）

```ts
1207 │ /**
1208 │  * The signature of a function used as a `canMatch` guard on a `Route`.
1209 │  *
1210 ▶  * If all guards return `true`, navigation continues and the `Router` will use the `Route` during
1211 ▶  * activation. If any guard returns `false`, the `Route` is skipped for matching and other `Route`
1212 ▶  * configurations are processed instead.
1213 │  *
1214 │  * The following example implements and uses a `CanMatchFn` that checks whether the
1215 │  * current user has permission to access the team page.
1216 │  *
1217 ▶  * {@example router/route_functional_guards.ts region="CanMatchFn"}
1218 │  *
1219 ▶  * @param route The route configuration.
1220 ▶  * @param segments The URL segments that have not been consumed by previous parent route evaluations.
1221 ▶  * @param currentSnapshot The current route snapshot up to this point in the matching process.
1222 │  *
1223 │  * @publicApi
1224 │  * @see {@link Route}
1225 │  * @see [CanMatch](guide/routing/route-guards#canmatch)
1226 │  */
1227 ▶ export type CanMatchFn = (
1228 ▶   route: Route,
1229 ▶   segments: UrlSegment[],
1230 ▶   currentSnapshot: PartialMatchRouteSnapshot,
1231 │ ) => MaybeAsync<GuardResult>;
1232 │ 
```

1220 行目の `segments` は「親までの評価で使われていないセグメント」で、DEMO では最上位のルートなので `['team', '7']` です。1221 行目の `currentSnapshot` は `createPreMatchRouteSnapshot`（config\_matching.ts L37〜52、[前のシリーズの第 5 回](../rtl/05-rtl-load-guard.md)の 5 節）が作る 10 項目の写しで、`params {"id":"7"}` と `url 'team/7'` がもう入っています。`match` が通ったあとで作るからです。説明文に無いことが 1 つあります。canMatch のガードが何も流さずに完了する Observable を返すと、`false` と同じく次のルートへ進みます（spec の `falls back to second route when canMatch returns EMPTY`、2114 行目）。recognize.ts L257 が `isEmptyError` を `NoMatch` と同じに扱うからで、canActivate の空の Observable が `NavigationError` になる（[第 1 回](01-rmd-basic-types.md)の DEMO 1）のと違います。

## 6. PartialMatchRouteSnapshot の説明

📄 `angular/packages/router/src/models.ts` L1233–1244 （▶ の行: 1234–1241）

```ts
1233 │ /**
1234 ▶  * A subset of the `ActivatedRouteSnapshot` interface that includes only the known data
1235 ▶  * up to the route matching phase. Some data are not accurately known
1236 ▶  * at in this phase. For example, resolvers are not run until
1237 ▶  * later, so any resolved title would not be populated. The same goes for lazy
1238 ▶  * loaded components. This is also true for all the snapshots up to the
1239 ▶  * root, so properties that include parents (root, parent, pathFromRoot)
1240 ▶  * are also excluded. And naturally, the full route matching hasn't yet
1241 ▶  * happened so firstChild and children are not available either.
1242 │  *
1243 │  * @publicApi
1244 │  */
```

1234〜1241 行目は「照合の段では分かっていない物がある。resolver はまだなので解決した title は入らない、遅延の部品も同じ、親をたどる `root`・`parent`・`pathFromRoot` も、子の `firstChild`・`children` も無い」です。型の本体（L1245〜1257）は `Pick` で 10 項目を選びます（[redirectTo の章](../router/10-router-redirects.md)が引いています）。1236 行目の「at in this phase」は「in this phase」の書き違いです。

> **🧪 DEMO — 説明文の 8 つの例を動かし、呼ばれた順と引数を記録する**
>
> 押すたびに `createApplication` で別のアプリを作り、ルートの部品を文書に付けない div に bootstrap してから、例のルートへ移ります（CanDeactivate の 2 つは、先に `'/team/7'` か `'/user/7'` に入ってから `'/other'` へ）。「Permissions の答え」は、例の `Permissions`・`PermissionsService` のメソッドが返す値です。`loadChildren` は `import('./team')` の代わりに子の配列を返します。ネットワークは使いません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rmd-guards)

8 つの例で、ガードの関数・メソッドはどれも 1 回のナビゲーションで 1 回だけ呼ばれました（`children: []` の CanActivateChildFn だけ 0 回）。Permissions が `false` のとき、canActivate と canActivateChild は `NavigationCancel`（code 3）で `router.url` は `'/'` のまま、canDeactivate は元の URL に残り、canMatch は取り消さずに `'**'` へ進みます。

## ここまでの呼び出し

- `matchWithChecks → runCanMatchGuards` — config\_matching.ts L54・check\_guards.ts L265 — *照合の段。false なら noMatch で次のルートへ*
- `checkGuards` — check\_guards.ts L56 — *ガードの段*
  - `runCanDeactivateChecks → runCanDeactivate` — L80・L209 — *(component, currentRoute, currentState, nextState)*
  - `runCanActivateChecks` — L93
    - `runCanActivateChild` — L174 — *祖先のガードに子の snapshot を渡す*
    - `runCanActivate` — L149
      - `getTokenOrFunctionIdentity → isCanActivate(guard)` — preactivation.ts L66・type\_guards.ts L38 — *メソッドか関数か*
      - 👤 `guard.canActivate(route, state) / guard(route, state)` — L163〜166

## テストと直し方

| ファイル（packages/router/test/integration/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `guards.spec.ts` | `CanActivate`（81）› `should work when given a class`（187）・`should work when returns an observable`（212）・`returns a promise`（237） | クラスと戻り値の 3 つの形 |
| `guards.spec.ts` | `CanActivateChild`（1509）› `should be invoked when activating a child`（1510）・1536 | 子を活性化するときに親のガードが呼ばれる |
| `guards.spec.ts` | `CanDeactivate`（981）› `next state`（1357）› 1379・1415 | 4 つ目の引数 `nextState`（クラスと関数） |
| `guards.spec.ts` | 1191 `should pass correct component to canDeactivate when using named outlets in componentless parent routes` | 1 つ目の引数の部品 |
| `guards.spec.ts` | `canMatch`（2088）› 2098・2114・2131・2293 | `false` と `EMPTY` で次のルート、3 つ目の引数（`receives PreMatchRouteSnapshot as third argument`） |
| `guards.spec.ts` | 2349・2407・2470・2517 | 関数のガードと `inject`（注入の文脈） |
| （なし） | — | 説明文の例そのものを型検査・実行する仕組み。`{@example}` で引く packages/examples/router の例は、その BUILD.bazel の `ng_project`（`glob(["**/*.ts"])`）でコンパイルされるが、models.ts に直接書いた例（851・970・1057・1146 行目など）は検査されない |

📄 `走らせたコマンドと型検査（2026-11-21、../angular の 8576f161ae4）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
--filter=guards CanActivate         Ran 52 of 1170 specs、0 failures   # 後ろの空白で CanActivateChild を外す
--filter=guards CanActivateChild    Ran 4 of 1170 specs、0 failures
--filter=guards CanDeactivate       Ran 26 of 1170 specs、0 failures
--filter=guards canMatch            Ran 18 of 1170 specs、0 failures
--filter=guards order               Ran 4 of 1170 specs、0 failures
--filter=should allow guards as functions|should allow DI in plain function guards|can run functional guards serially|should run in injection context
                                    Ran 8 of 1170 specs、0 failures

# 説明文の例を、models.ts の行をそのまま取り出した .ts にして型検査（サイトの TypeScript 6.0.3、--strict）
ex-canactivate.ts(28,41): error TS2554: Expected 0 arguments, but got 2.          # 867 行目（853 行目の canActivate() は引数なし）
ex-candeactivate.ts(29,61): error TS2552: Cannot find name 'route'. Did you mean 'Router'?   # 1080 行目
ex-canactivatefn.ts / ex-canactivatechild.ts / ex-canmatch.ts                     # エラー 0
# ng new の既定の noPropertyAccessFromIndexSignature も付けると
ex-canactivate.ts(28,72): error TS4111: Property 'id' comes from an index signature, so it must be accessed with ['id'].
ex-canactivatechild.ts(28,72): error TS4111: （986 行目の route.params.id も同じ）
```

直すとしたら、どれも models.ts の説明文の変更です。853 行目の `canActivate()` に `(user: UserToken, id: string)` を戻す、1080 行目の `route` を `currentRoute` にする、867・986・1080 行目の `params.id` を `params['id']` にする、1031 行目の `canActivate` を `canActivateChild` にする、1236 行目の `at in`、の 5 つです。spec は振る舞いを固めているので足す物はありません。説明文の例が型の変更に追いつかない問題は、0abb67af59a のように型を変えたコミットで例が取り残されたことから来ています。packages/examples の側に移して `{@example}` で引く形（CanActivateChildFn などはもうそうなっている）にすると、例が BUILD の型検査に入ります。

## 聞かれそうな質問

**Q. `canActivateChild` のガードが受け取る `route` は、親と子のどちらですか？**

子です。`runCanActivateChild` は活性化する子の snapshot を、祖先の各ガードにそのまま渡します（check\_guards.ts L174〜207）。DEMO の「CanActivateChild（クラス）」で、`'root'` のガードが `team/:id` の snapshot を受けました。

**Q. `canMatch` が `false` を返すと、ナビゲーションは取り消されますか？**

取り消されません。そのルートを「合わない」として次のルートを試します（config\_matching.ts L79 の `v === true ? result : {...noMatch}`）。次が無ければ `Cannot match any routes` の `NavigationError` です。1192〜1194 行目の例では `'**'` が拾い、URL はそのままです。

**Q. `canDeactivate` が呼ばれないことがあるのはなぜですか？**

出口に部品がいないときと、ルートが再利用されてガードを走らせないときです。`getRouteGuards` は `shouldRun && context.outlet.isActivated` のときだけ検査を積みます（preactivation.ts L154〜155）。[第 2 回](02-rmd-route.md)の DEMO 1 で、ガードが走らない移動では canDeactivate も 0 回でした。

**Q. 説明文の例をそのままコピーして動かないのはどれですか？**

CanActivate（853 行目の引数なしの `canActivate()` を 2 つの引数で呼ぶ）と CanDeactivate（1080 行目の無い名前 `route`）です。前者は型だけのエラーで JS は動き、後者は実行すると `ReferenceError` になります。CanActivateChildFn の region は型は通りますが、`children: []` なのでガードが呼ばれません。

**Q. クラスのガードと関数のガードは、Router の中でどこで分かれますか？**

`getTokenOrFunctionIdentity` で注入器から引いたあと、`isCanActivate(guard)`（type\_guards.ts）が `canActivate` メソッドの有無で分けます。メソッドがあれば `guard.canActivate(…)`、無ければ `runInInjectionContext` で関数として呼びます（check\_guards.ts L163〜166）。

## 読み終えて

- 4 つのガードの型は、引数の並びが Router の呼び出し（check\_guards.ts の `runCan…`）とそのまま対応している。
- `canActivateChild` は子の snapshot を受け、`canDeactivate` は出口の部品と今と次の木を受け、`canMatch` は使われていないセグメントと照合途中の写しを受ける。
- `canMatch` の `false` と空の Observable は「次を試す」、それ以外のガードの `false` は「取り消し」。
- models.ts に直接書いた例のうち 2 つは型が通らない。型を変えたコミット（0abb67af59a）や、2017 年からの書き違いが残っている。

---

← 前: [Route インターフェースの説明文：各プロパティの約束](02-rmd-route.md)  
次: [Resolve・CanLoad・NavigationBehaviorOptions と型ガード](04-rmd-resolve-nav.md) →
