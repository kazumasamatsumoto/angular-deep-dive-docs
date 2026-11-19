[目次](../README.md) › [Router のディレクティブとイベントの残り：RouterLink・RouterLinkActive・RouterOutlet・events.ts を行で埋める](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：ディレクティブ・イベント・ExtraOptions を固めているテスト

> router\_link\_spec・router\_link\_active.spec・directives/router\_outlet.spec と integration の router\_links・router\_link\_active・route\_reuse\_strategy・router\_events の spec が各章の約束をどこで固めているか、--filter での走らせ方と数（Node 1170・Chromium 1180・Firefox 1178）、RouterLink・RouterLinkActive・RouterOutlet・events・ExtraOptions の issue と PR の表、origin/main の続き。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rdir-tests-issues)

---

シリーズの最後に、第 1〜5 回で読んだ RouterLink・RouterLinkActive・RouterOutlet・events.ts・ExtraOptions の約束が、どの spec のどの describe で固められているかを地図にし、手元で走らせた数を並べます。そのあと、この 5 つに関係する area: router の issue と PR を、本文を読んで今のコードのどの行に当たるかで表にし、origin/main の続きをまとめます。

読む対象は `packages/router/test/` の spec です（../angular、8576f161ae4）。`BUILD.bazel` の作り（`test_lib` を Node の `:test` と web の `:test_web` の両方で走らせる）は[Navigation API の spec と issue](../navx/07-navx-tests-issues.md)に、1 本だけ走らせる方法は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. RouterLink の入力](01-rdir-link-inputs.md)
2. [2. RouterLinkActive の残り](02-rdir-link-active.md)
3. [3. RouterOutlet の入力と detach / attach](03-rdir-outlet.md)
4. [4. events.ts の各クラス](04-rdir-events.md)
5. [5. ExtraOptions と RouterModule](05-rdir-options.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

パスは `packages/router/test/` から、括弧の数は describe の行、ほかの数は it の行です。「it」は行の頭が `it(` の数（複数のファイルをまとめた行は空）、「走らせた数」は 2 節の絞り込みで jasmine が数えた数です。`integration/` の spec は、`integration.spec.ts` の `for (const browserAPI of ['navigation', 'history'])` の中で 2 回登録されるので、走らせた数が it の倍になります。

| ファイル | describe と主な it（行） | it | 絞り込み | 走らせた数 | 章 |
| --- | --- | --- | --- | --- | --- |
| `router_link_spec.ts` | RouterLink（15）› 16 tabindex を変えない・on a non-anchor（38）› 76・85・94・on an anchor（119）› 151・158・165・190 svg・on a custom element anchor（211、customElements がある環境だけ）› 267・271・278・287 UrlTree を入力に・302 UrlTree と queryParams は投げる・316 relativeTo | 14 | `^RouterLink ` | 11（custom element の 3 本は web だけ） | [第 1 回](01-rdir-link-inputs.md) |
| `integration/router_links.spec.ts` | router links（34）› 35 skipLocationChange・95 既定で query と fragment を持ち越さない・172 href の更新・201 preserve・222 merge・248 a 以外・357 query と fragment・should support history and state（386）› 388・393・should support browserUrl（427）› 429・434・469 area | 19 | `routing router links ` | 38（19 × navigation / history） | [第 1 回](01-rdir-link-inputs.md) |
| `router_link_active.spec.ts` | RouterLinkActive（12）› 13 一度も active にならなくてもクラスを外す・28・43 null / undefined のクラス・58 options が null・77 options が undefined・94 部分の IsActiveMatchOptions | 6 | `^RouterLinkActive ` | 6 | [第 2 回](02-rdir-link-active.md) |
| `integration/router_link_active.spec.ts` | routerLinkActive（26）› 27・66 最初のナビゲーションが終わるまでクラスを付けない・89 親の要素・125・161 isActive・199 変わらなければ変更検知を起こさない・226 isActiveChange・270 aria-current | 8 | `routing routerLinkActive ` | 16（8 × 2） | [第 2 回](02-rdir-link-active.md) |
| `directives/router_outlet.spec.ts` | router outlet name（34）› 36・58 名前を変える・102 ngFor・160・component input binding（201）› 202〜594 の 12 本・injectors（657）› 658・692・router outlet data（729）› 730・752・772・807 | 22 | `^router outlet name / ^component input binding / ^injectors / ^router outlet data ` | 4 / 12 / 2 / 4 | [第 3 回](03-rdir-outlet.md) |
| `integration/route_reuse_strategy.spec.ts` | Custom Route Reuse Strategy（36）› 89・102 attach / detach のイベント・161 fragment・212・232・315・368・436・548・652 | 10 | `Custom Route Reuse Strategy` | 20（10 × 2） | [第 3 回](03-rdir-outlet.md) |
| `integration/router_events.spec.ts` | route events（30）› 31 (Child)ActivationStart / End・75 NavigationStart の中でリダイレクト・107 dispose のあと・128 | 4 | `routing route events ` | 8（4 × 2） | [第 4 回](04-rdir-events.md) |
| `integration/guards.spec.ts ほか` | CanLoad（1585）› 1602 GuardRejected・route\_data.spec.ts 167 NoDataFromResolver・navigation.spec.ts 478〜577 Superseded・880 abort（code は見ない）・lazy\_loading.spec.ts 930・1008 NavigationSkipped（code は見ない） |   | `CanLoad / abort an ongoing navigation / custom url handling strategies` | 23 / 14 / 6 | [第 4 回](04-rdir-events.md) |
| `router_preloader.spec.ts・integration/lazy_loading.spec.ts` | RouterPreloader（47）の 9 か所と lazy\_loading.spec.ts 342〜343：RouteConfigLoadStart / End の toString |   | `RouterPreloader` | 22 | [第 4 回](04-rdir-events.md) |
| `bootstrap.spec.ts` | bootstrap（40）› 106〜381 initialNavigation の 8 本・471 スクロールと scrollOffset（web だけ） | 11 | `bootstrap ` | 11（471 は Node では登録されない） | [第 5 回](05-rdir-options.md) |
| `integration/lazy_loading.spec.ts` | lazy loading（65）› 346 throws an error when forRoot() is used in a lazy context（NG04007、開発モード） | 1 | `is used in a lazy context` | 2（1 × 2） | [第 5 回](05-rdir-options.md) |
| `router_scroller.spec.ts・regression_integration.spec.ts・integration/navigation_errors.spec.ts` | RouterScroller（33）› 34 defaults to disabled ほか・useHash（285）› 286・navigation\_errors.spec.ts 118 errorHandler（forRoot） |   | `RouterScroller / useHash / can redirect from error handler with RouterModule.forRoot` | 13 / 1 / 2 | [第 5 回](05-rdir-options.md) |

## 2. 走らせ方と結果

📄 `走らせたコマンドと結果（2026-11-19、8576f161ae4）`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all
1170 specs, 0 failures
$ pnpm bazel test //packages/router/test:test_web --nocache_test_results --test_output=all
Chromium: 1/1 test files | 1180 passed, 0 failed
Firefox: 1/1 test files | 1178 passed, 0 failed
$ pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=^RouterLink "      # ほかも同じ形。--filter は正規表現
```

| --test\_arg=--filter= | 結果 |
| --- | --- |
| `^RouterLink ` | Ran 11 of 1170 specs、0 failures |
| `routing router links ` | Ran 38 of 1170 specs、0 failures |
| `^RouterLinkActive ` | Ran 6 of 1170 specs、0 failures |
| `routing routerLinkActive ` | Ran 16 of 1170 specs、0 failures |
| `^router outlet name ` | Ran 4 of 1170 specs、0 failures |
| `^component input binding ` | Ran 12 of 1170 specs、0 failures |
| `^injectors ` | Ran 2 of 1170 specs、0 failures |
| `^router outlet data ` | Ran 4 of 1170 specs、0 failures |
| `Custom Route Reuse Strategy` | Ran 20 of 1170 specs、0 failures |
| `routing route events ` | Ran 8 of 1170 specs、0 failures |
| `CanLoad` | Ran 23 of 1170 specs、0 failures |
| `RouterPreloader` | Ran 22 of 1170 specs、0 failures |
| `bootstrap ` | Ran 11 of 1170 specs、0 failures |
| `RouterScroller` | Ran 13 of 1170 specs、0 failures |
| `is used in a lazy context` | Ran 2 of 1170 specs、0 failures |
| `forRoot() is used in a lazy context` | Ran 0 of 1170 specs（() が正規表現の空のグループになる） |

Node の `:test` は 1170 本で、web は Chromium が 10 本、Firefox が 8 本多く走ります。差は `if (!isNode)`（bootstrap.spec.ts L470）や `typeof customElements === 'object'`（router\_link\_spec.ts L210）の中の it です。`--filter` は jasmine の正規表現で、describe と it の名前をつないだ全体に当てます。`^RouterLink ` のように頭の `^` と後ろの空白で挟むと、`RouterLinkActive` の describe を外せます。最後の行のとおり、名前に `()` が入る it は、その部分を外して絞ります。

## 3. 各章の約束を固める spec を 1 つずつ

### 第 1 回：tabindex を書いた要素には触らない

📄 `angular/packages/router/test/router_link_spec.ts` L16–36 （▶ の行: 18, 25, 31, 33, 35）

```ts
16 │   it('does not modify tabindex if already set on non-anchor element', async () => {
17 │     @Component({
18 ▶       template: `<div [routerLink]="link" tabindex="1"></div>`,
19 │       standalone: false,
20 │     })
21 │     class LinkComponent {
22 │       link: string | null | undefined = '/';
23 │     }
24 │     TestBed.configureTestingModule({
25 ▶       imports: [RouterModule.forRoot([])],
26 │       declarations: [LinkComponent],
27 │     });
28 │     const fixture = TestBed.createComponent(LinkComponent);
29 │     await fixture.whenStable();
30 │     const link = fixture.debugElement.query(By.css('div')).nativeElement;
31 ▶     expect(link.tabIndex).toEqual(1);
32 │ 
33 ▶     fixture.nativeElement.link = null;
34 │     await fixture.whenStable();
35 ▶     expect(link.tabIndex).toEqual(1);
36 │   });
```

18 行目は a ではない `div` に `tabindex="1"` と書いた例です。31 行目で 1 のまま、33 行目で `routerLink` を `null` にしても、35 行目で 1 のままであることを確かめます。RouterLink が tabindex を変えるのは、tabindex 属性が無く、a 要素でもないときだけです（[第 1 回](01-rdir-link-inputs.md)の tabindex の節）。4 節の #28345 の「いつもフォーカスできてしまう」は、属性を書かない要素の話です。25 行目は今も `RouterModule.forRoot([])` で組んでいて、第 5 回の forRoot の道もこの spec で通っています。

### 第 2 回：一度も active にならなくても、最初のクラスを外す

📄 `angular/packages/router/test/router_link_active.spec.ts` L13–26 （▶ の行: 16, 20, 23, 25）

```ts
13 │   it('removes initial active class even if never active', async () => {
14 │     @Component({
15 │       imports: [RouterLinkActive, RouterLink],
16 ▶       template: '<a class="active" routerLinkActive="active" routerLink="/abc123"></a>',
17 │     })
18 │     class MyCmp {}
19 │ 
20 ▶     TestBed.configureTestingModule({providers: [provideRouter([{path: '**', children: []}])]});
21 │     const fixture = TestBed.createComponent(MyCmp);
22 │     fixture.autoDetectChanges();
23 ▶     await TestBed.inject(Router).navigateByUrl('/');
24 │     await fixture.whenStable();
25 ▶     expect(Array.from(fixture.nativeElement.querySelector('a').classList)).toEqual([]);
26 │   });
```

16 行目のテンプレートは、最初から `class="active"` を持つ a です。23 行目で `'/'` へ移動すると、`/abc123` のリンクは active ではないので、25 行目でクラスが空になります。`update` は active でないときもクラスを外す側を走る、という約束です。最初のナビゲーションが終わるまで `update` そのものが止まる行（4 節の #62973）は、[第 2 回](02-rdir-link-active.md)で integration の 66 行目の it と一緒に読みました。

### 第 3 回：detach と attach のイベント

📄 `angular/packages/router/test/integration/route_reuse_strategy.spec.ts` L138–159 （▶ の行: 141, 143, 146, 149–150, 153, 155, 157）

```ts
138 │       cmp.attachedComponents = [];
139 │       cmp.detachedComponents = [];
140 │ 
141 ▶       router.navigateByUrl('/a');
142 │       await advance(fixture);
143 ▶       expect(cmp.attachedComponents.length).toEqual(0);
144 │       expect(cmp.detachedComponents.length).toEqual(0);
145 │ 
146 ▶       router.navigateByUrl('/b');
147 │       await advance(fixture);
148 │       expect(cmp.attachedComponents.length).toEqual(0);
149 ▶       expect(cmp.detachedComponents.length).toEqual(1);
150 ▶       expect(cmp.detachedComponents[0] instanceof BlankCmp).toBe(true);
151 │ 
152 │       // the route will be reused by the `RouteReuseStrategy`
153 ▶       router.navigateByUrl('/a');
154 │       await advance(fixture);
155 ▶       expect(cmp.attachedComponents.length).toEqual(1);
156 │       expect(cmp.attachedComponents[0] instanceof BlankCmp).toBe(true);
157 ▶       expect(cmp.detachedComponents.length).toEqual(1);
158 │       expect(cmp.detachedComponents[0] instanceof BlankCmp).toBe(true);
159 │     });
```

この describe の `AttachDetachReuseStrategy`（route\_reuse\_strategy.spec.ts L37）は、`pathsToDetach = ['a']` の Route だけを `shouldDetach` で保存し、保存したものを `shouldAttach` で付け直す戦略です。141 行目の最初の移動ではどちらも 0、146 行目で `/b` へ移ると `/a` の部品が detach され（149〜150 行目）、153 行目で `/a` に戻ると同じ部品が attach されます（155〜156 行目）。157 行目の detach が 1 のままなのは、`/b` の Route は `pathsToDetach` に無く、離れるときに detach ではなく deactivate（壊す）になるからです。outlet の `detach` / `attach` と、それを呼ぶ側は[第 3 回](03-rdir-outlet.md)にあります。

### 第 4 回：ChildActivationStart の snapshot は根

📄 `angular/packages/router/test/integration/router_events.spec.ts` L41–73 （▶ の行: 43–44, 48, 50, 56, 58, 60, 64–65, 69–70）

```ts
41 │       await advance(fixture);
42 │ 
43 ▶       const event3 = recordedEvents[3] as ChildActivationStart;
44 ▶       const event9 = recordedEvents[9] as ChildActivationEnd;
45 │ 
46 │       expect(fixture.nativeElement).toHaveText('user fedor');
47 │       expect(event3 instanceof ChildActivationStart).toBe(true);
48 ▶       expect(event3.snapshot).toBe(event9.snapshot.root);
49 │       expect(event9 instanceof ChildActivationEnd).toBe(true);
50 ▶       expect(event9.snapshot).toBe(event9.snapshot.root);
51 │ 
52 │       const event4 = recordedEvents[4] as ActivationStart;
53 │       const event8 = recordedEvents[8] as ActivationEnd;
54 │ 
55 │       expect(event4 instanceof ActivationStart).toBe(true);
56 ▶       expect(event4.snapshot.routeConfig?.path).toBe('user/:name');
57 │       expect(event8 instanceof ActivationEnd).toBe(true);
58 ▶       expect(event8.snapshot.routeConfig?.path).toBe('user/:name');
59 │ 
60 ▶       expectEvents(recordedEvents, [
61 │         [NavigationStart, '/user/fedor'],
62 │         [RoutesRecognized, '/user/fedor'],
63 │         [GuardsCheckStart, '/user/fedor'],
64 ▶         [ChildActivationStart],
65 ▶         [ActivationStart],
66 │         [GuardsCheckEnd, '/user/fedor'],
67 │         [ResolveStart, '/user/fedor'],
68 │         [ResolveEnd, '/user/fedor'],
69 ▶         [ActivationEnd],
70 ▶         [ChildActivationEnd],
71 │         [NavigationEnd, '/user/fedor'],
72 │       ]);
73 │     });
```

`'user/:name'` の 1 段のルートで、4 番目（43 行目、0 から数える）の `ChildActivationStart` の snapshot は 48 行目で木の根です。親が根なので、[第 4 回](04-rdir-events.md)の 4 節の `toString` は `ChildActivationStart(path: '')` になります。56・58 行目は `ActivationStart` / `End` の `routeConfig.path`、60〜72 行目は 11 のイベントの順です。`expectEvents` はクラスと url だけを比べ、`toString` は見ません。

### 第 5 回：遅延モジュールの forRoot は NG04007

📄 `angular/packages/router/test/integration/lazy_loading.spec.ts` L346–371 （▶ の行: 357, 363, 367–368, 370）

```ts
346 │     it('throws an error when forRoot() is used in a lazy context', async () => {
347 │       const router = TestBed.inject(Router);
348 │       const location = TestBed.inject(Location);
349 │ 
350 │       @Component({
351 │         selector: 'lazy',
352 │         template: 'should not show',
353 │         standalone: false,
354 │       })
355 │       class LazyLoadedComponent {}
356 │ 
357 ▶       @NgModule({
358 │         declarations: [LazyLoadedComponent],
359 │         imports: [RouterModule.forRoot([{path: 'loaded', component: LazyLoadedComponent}])],
360 │       })
361 │       class LoadedModule {}
362 │ 
363 ▶       const fixture = await createRoot(router, RootCmp);
364 │ 
365 │       router.resetConfig([{path: 'lazy', loadChildren: () => LoadedModule}]);
366 │ 
367 ▶       let recordedError: any = null;
368 ▶       router.navigateByUrl('/lazy/loaded')!.catch((err) => (recordedError = err));
369 │       await advance(fixture);
370 ▶       expect(recordedError.message).toContain(`NG04007`);
371 │     });
```

357 行目で遅延モジュールの imports に forRoot を書き、368 行目の移動が 370 行目で NG04007 を含むエラーで終わることを確かめます。このエラーを投げる `provideForRootGuard` は開発モードにしか無いので（[第 5 回](05-rdir-options.md)の 5 節）、spec が走る開発モードでは通り、同じ構成の本番ビルドでは例外が出ません。本番の振る舞いを固める spec はありません。

## 4. issue と PR の表

2026-11-19 に gh で読んだ（読むだけ）、このシリーズの 5 つの部品に関係する area: router の issue と PR です。開いている 71 件のうち 28 件と、本文から辿った閉じたもの 3 件。「今のコード」は、本文を読んで 8576f161ae4 のどの行に当たるかです。

| # |   | 状態 | 開いた日 | 閉じた日 | 反応 | コメント | 内容 | 今のコード | 章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 28345 | issue | 開いている | 2019-01-24 |   | 16 | 23 | routerLink が要素をいつもフォーカスできるようにしてしまう（tabindex を付けない設定が欲しい） | router\_link.ts 420〜431 行目の tabindex の更新。tabindex 属性が書いてあれば触らない（426 行目）ので、今の回避は tabindex="-1" を書くこと | [第 1 回](01-rdir-link-inputs.md) |
| 51046 | issue | 開いている | 2023-07-14 |   | 6 | 0 | hostDirectives の RouterLink に routerLink を書くと、ngOnChanges を呼ばないと href ができない | 今は routerLink の setter（455〜467 行目）が signal（441 行目の routerLinkInput）に書く。href を作る時機は第 1 回 | [第 1 回](01-rdir-link-inputs.md) |
| 72080 | issue | 開いている | 2026-11-18 |   | 6 | 3 | リンクに hover したら先読みしたい | RouterLink にはイベントを受ける口が click だけ。先読みは PreloadingStrategy（withPreloading / preloadingStrategy、第 5 回）の側 | [第 1 回](01-rdir-link-inputs.md)・[第 5 回](05-rdir-options.md) |
| 62973 | issue | 開いている | 2025-08-03 |   | 4 | 3 | 最初のナビゲーションが終わるまで RouterLinkActive がクラスを付けず、ちらつく | router\_link\_active.ts 229 行目の !this.router.navigated で update を止める行。integration の 66 行目の it がこの振る舞いを固めている | [第 2 回](02-rdir-link-active.md) |
| 54992 | issue | 開いている | 2024-03-22 |   | 3 | 0 | routerLinkActiveOptions の fragment: 'exact' で、fragment の無いリンクを fragment のある URL で active にしない設定 | IsActiveMatchOptions を isActive に渡す行（router\_link\_active.ts 262〜288 行目）。fragment の比べ方は url\_tree.ts の側 | [第 2 回](02-rdir-link-active.md) |
| 22588 | issue | 開いている | 2018-03-05 |   | 52 | 8 | 1 つのリンクを複数のルートで active にしたい | RouterLinkActive は ContentChildren の RouterLink のどれかが active かを見る（router\_link\_active.ts の hasActiveLinks）。リンク以外の URL を足す入力は無い | [第 2 回](02-rdir-link-active.md) |
| 9426 | issue | 開いている | 2016-06-22 |   | 22 | 7 | 既定の 'router-link-active' クラスを自動で付けたい（古い Router の振る舞い） | routerLinkActive は入力が無ければクラスを付けない（setter が \[\] にする）。既定のクラスは無い | [第 2 回](02-rdir-link-active.md) |
| 71348 | issue | 完了 | 2026-10-14 | 2026-10-21 | 0 | 0 | active のあいだに routerLinkActive の入力を変えると、前のクラスが残る | 98c0265880f が setter で外す行を足した（origin/main、22.2.6 にも入っている）。8576f161ae4 の 209〜215 行目はまだ前の形 | [第 2 回](02-rdir-link-active.md) |
| 64553 | issue | 開いている | 2025-10-21 |   | 3 | 2 | router-outlet の要素がレイアウトに入る（grid / flex の邪魔） | router\_outlet.ts 212 行目の selector: 'router-outlet'。部品は要素の後ろの兄弟に作られ、要素自身は残る | [第 3 回](03-rdir-outlet.md) |
| 49483 | issue | 開いている | 2023-03-20 |   | 7 | 6 | outlet が作った部品にクラスを付ける入力が欲しい | activateWith の createComponent（router\_outlet.ts 404 行目）。部品の要素に触る入力は無い（activate のイベントで受けて自分で付ける） | [第 3 回](03-rdir-outlet.md) |
| 27696 | issue | 開いている | 2018-12-16 |   | 6 | 15 | EmptyOutletComponent の中で、合った部品を外から見えるようにしたい | components/empty\_outlet.ts 26 行目の template は &lt;router-outlet /&gt; だけ | [第 3 回](03-rdir-outlet.md) |
| 60770 | issue | 開いている | 2025-04-07 |   | 0 | 1 | 名前付き outlet の名前を正規表現で選びたい | name 入力（router\_outlet.ts 226 行目）は文字列で、ChildrenOutletContexts に名前で登録される | [第 3 回](03-rdir-outlet.md) |
| 58695 | issue | 開いている | 2024-11-15 |   | 0 | 1 | router-outlet が無いのに移動したら警告したい（@defer で包んだとき） | operators/activate\_routes.ts 213〜216 行目は context.outlet があるときだけ activateWith を呼び、無ければ何もしない（警告も出さない） | [第 3 回](03-rdir-outlet.md) |
| 42489 | issue | 開いている | 2021-06-05 |   | 81 | 18 | 読み込み中に outlet に仮の部品を出したい | outlet は activate の段で初めて部品を作る。読み込み中を知る道は RouteConfigLoadStart / End（第 4 回の 4 節） | [第 3 回](03-rdir-outlet.md)・[第 4 回](04-rdir-events.md) |
| 70906 | issue | 開いている | 2026-09-24 |   | 0 | 0 | ルートの部品自身が attach / detach を知るフックが欲しい | attach（router\_outlet.ts 366 行目）・detach（349 行目）と attachEvents / detachEvents は outlet の側にだけある | [第 3 回](03-rdir-outlet.md) |
| 71007 | issue | 開いている | 2026-09-28 |   | 0 | 5 | RouteReuseStrategy で付け直した子が、壊れた親の注入器の provider を持ち続ける | attach は保存した ComponentRef をそのまま insert し、作ったときの OutletInjector（router\_outlet.ts 417 行目）を持ったまま | [第 3 回](03-rdir-outlet.md) |
| 22799 | issue | 開いている | 2018-03-15 |   | 30 | 4 | ガードが取り消したときに理由を渡したい | canActivate の false は navigation\_transition.ts 677 行目で reason が空、code は GuardRejected。理由を付ける道は今も無い（第 4 回の 5 節） | [第 4 回](04-rdir-events.md) |
| 59782 | issue | 開いている | 2025-01-29 |   | 1 | 0 | デバッグのとき、ナビゲーションを始めた呼び出し元のスタックを出したい | withDebugTracing は stringifyEvent と e を console.log するだけ（provide\_router.ts 526〜527 行目）。NavigationStart が持つのは navigationTrigger だけ | [第 4 回](04-rdir-events.md) |
| 48673 | issue | 開いている | 2023-01-09 |   | 12 | 2 | ナビゲーションでどのルートが deactivate されるかを知りやすくしたい | Route 単位のイベントは ActivationStart / End など activate の側だけで、id も持たない（第 4 回の 4 節） | [第 4 回](04-rdir-events.md) |
| 31800 | issue | 開いている | 2019-07-23 |   | 13 | 6 | 遅延読み込みした Route の設定を後から加工するフック | RouteConfigLoadEnd は route だけを持ち、読み込んだ children を変える口は無い（第 4 回の 4 節） | [第 4 回](04-rdir-events.md) |
| 16211 | issue | 開いている | 2017-04-20 |   | 82 | 67 | canActivate が false だと白い画面や死んだリンクになる | GuardRejected の NavigationCancel と、履歴を戻す canceledNavigationResolution（第 5 回の 2 節、router-browser-url） | [第 4 回](04-rdir-events.md)・[第 5 回](05-rdir-options.md) |
| 70784 | issue | 開いている | 2026-09-17 |   | 0 | 1 | canceledNavigationResolution: 'computed' が起こしたナビゲーションかどうかを知りたい | NavigationStart の navigationTrigger は imperative / popstate / hashchange の 3 つ（events.ts 23 行目）で、履歴を戻すための移動を区別しない | [第 4 回](04-rdir-events.md)・[第 5 回](05-rdir-options.md) |
| 58258 | issue | 開いている | 2024-10-18 |   | 2 | 1 | CSS の scroll-behavior: smooth と withInMemoryScrolling で、移動のあとゆっくり上へ戻る | router\_scroller.ts 122 行目の前へ進む移動の scrollToPosition(\[0, 0\]) は behavior を渡さない。113・115 行目（戻る・進む）には e1da41ffdfd が 'instant' を足した | [第 5 回](05-rdir-options.md) |
| 64299 | PR | 入った | 2025-10-08 | 2025-10-09 | 1 | 2 | スクロールの復元は 'instant' にする（e1da41ffdfd、related to #58258） | router\_scroller.ts 109・113・115 行目 | [第 5 回](05-rdir-options.md) |
| 30139 | issue | 開いている | 2019-04-26 |   | 32 | 24 | すぐには描かれない内容があると、アンカーへのスクロールが効かない | Scroll は setTimeout と requestAnimationFrame の早い方のあとに 1 回だけ出る（router\_scroller.ts の scheduleScrollEvent）。データを待たない | [第 5 回](05-rdir-options.md) |
| 26854 | issue | 開いている | 2018-10-30 |   | 8 | 5 | セレクタとして正しくない fragment で anchorScrolling が DOMException を出す | 今の ViewportScroller は getElementById / getElementsByName を先に使い、querySelector には CSS.escape を通す（viewport\_scroller.ts 180・204 行目） | [第 5 回](05-rdir-options.md) |
| 50362 | issue | 開いている | 2023-05-19 |   | 0 | 3 | ガードの中で skipLocationChange すると、戻ったときにスクロール位置が戻らない | RouterScroller は NavigationStart のときに lastId の位置を保存し、NavigationEnd で lastId を変える（router\_scroller.ts 89・93 行目） | [第 5 回](05-rdir-options.md) |
| 51601 | issue | 予定なし | 2023-08-31 | 2023-08-31 | 0 | 2 | provideRouter で scrollOffset を設定できない | 「ViewportScroller.setOffset の重複なので意図的」。forRoot は router\_module.ts 200〜202 行目で setOffset を呼ぶ（第 5 回の 4 節） | [第 5 回](05-rdir-options.md) |
| 40869 | issue | 開いている | 2021-02-16 |   | 0 | 7 | Router の location の購読を止めたい（custom element を外したあと） | router.ts 292 行目の setUpLocationChangeListener。initialNavigation: 'disabled' でも購読は作られる（第 5 回の 4 節） | [第 5 回](05-rdir-options.md) |
| 63064 | issue | 開いている | 2025-08-08 |   | 0 | 1 | blob: のページで withHashLocation が replaceState の SecurityError になる | HashLocationStrategy の replaceState（hash\_location\_strategy.ts 86〜90 行目）が prepareExternalUrl の結果を渡す | [第 5 回](05-rdir-options.md) |
| 30305 | issue | 開いている | 2019-05-07 |   | 2 | 2 | useHash と $locationShim で、更新のたびに hash が重なる | upgrade の location shim の側（lshim のシリーズ）。forRoot の useHash は router\_module.ts 151 行目で HashLocationStrategy を置くだけ | [第 5 回](05-rdir-options.md) |

反応が多いのは、outlet の「読み込み中の仮の部品」（#42489、81）と、ガードの false の後の画面（#16211、82）、RouterLinkActive を複数のルートで（#22588、52）です。どれも機能の追加の要望で、5 つの部品の今の作りでは「その口が無い」ことが表の右の列の行で分かります。不具合の形のものは、スクロール（#58258・#50362・#30139）と、RouteReuseStrategy で付け直した部品の注入器（#71007）に集まっています。#58258 は、e1da41ffdfd が戻る・進むの 2 つの `scrollToPosition` にだけ `'instant'` を足し、前へ進む移動の L122は残した、という今の形です。

## 5. origin/main の続き

`git -C ~/angular-research/angular log 8576f161ae4..origin/main` を、このシリーズの src（directives/ と events.ts・router\_config.ts・router\_module.ts・router\_scroller.ts）に絞ったものです（origin/main は 943ec3bd8d6）。「22.2.6」は、サイトの依存に同じ変更が入っているか（`node_modules/@angular/router` の fesm2022 で確かめた）です。

| コミット | 日付 | 変えたもの | 22.2.6 | 章 |
| --- | --- | --- | --- | --- |
| `98c0265880f` | 2026-10-14 | fix: routerLinkActive の入力が変わったら前のクラスを外す（#71348） | 入っている | [第 2 回](02-rdir-link-active.md) |
| `319a3c4f326` | 2026-09-25 | perf: RouterLink が UrlTree を持ち続けない（href の計算で読む signal を絞る） | 入っている | [第 1 回](01-rdir-link-inputs.md) |
| `34ea5922bab` | 2026-09-26 | feat: RouterLink に scroll 入力 | 入っていない | [第 1 回](01-rdir-link-inputs.md) |
| `664a9971e3c` | 2026-09-30 | fix: outlet が deactivate したら route data の購読を外す | 入っている | [第 3 回](03-rdir-outlet.md) |
| `262417f1555` | 2026-11-10 | feat: ルートのエラー境界（RouterOutlet が errorComponent を出す） | 入っていない | [第 3 回](03-rdir-outlet.md) |
| `a415a85f8d3` | 2026-11-13 | fix: withErrorBoundaries なしで errorComponent を使ったら警告 | 入っていない | [第 3 回](03-rdir-outlet.md) |
| `04dd9cf2a34` | 2026-11-14 | fix: テストでその警告をリセット | 入っていない | [第 3 回](03-rdir-outlet.md) |
| `2af465b71f3` | 2026-11-02 | docs: outlet の name の注記 | （doc だけ） | [第 3 回](03-rdir-outlet.md) |
| `64502f9ae23` | 2026-10-20 | feat: view transitions を stable に（router\_config.ts の @experimental 17.0 を消す） | （doc だけ） | [第 5 回](05-rdir-options.md) |
| `4380e683d80` | 2026-09-10 | docs: InMemoryScrollingOptions の例を signal と inject に | （doc だけ） | [第 5 回](05-rdir-options.md) |
| `bb41a49ecc4` | 2026-11-05 | docs: RouterModule の例を routes に | （doc だけ） | [第 5 回](05-rdir-options.md) |

events.ts は 8576f161ae4 と origin/main で同じです（`git diff 8576f161ae4 origin/main -- packages/router/src/events.ts` が空）。`NavigationSkipped` の `toString` は origin/main でもまだありません。router\_config.ts と router\_module.ts の差は doc コメントだけで、ExtraOptions の項目は増えていません。`withErrorBoundaries`（262417f1555）は `provideRouter` にだけ足された `withX` で、ExtraOptions に対応する項目はありません。

## 6. このシリーズで確かめたこと

| 何を | どこで | 確かめ方 |
| --- | --- | --- |
| `NavigationSkipped` だけ `toString` が無く、`String(e)` が `[object Object]` | [第 4 回](04-rdir-events.md)の 2 節 | ページの DEMO 1・2、22.2.6 の Node の記録。作業木で it を足すと 2 failures、`toString` を足すと 0 failures、golden が 1 行変わる |
| `reason` は本番でほぼ空。残るのは `NavigationCancelingError: ` の頭と `abort()` の理由だけ | 第 4 回の 5 節 | Node で開発モードと `ngDevMode = false` の 2 回、ページ（本番ビルド）の DEMO 2 |
| forRoot は options をコピーせず、`RouterScroller` がそこに既定を書き込む | [第 5 回](05-rdir-options.md)の 4 節 | ページの DEMO（偽の PlatformLocation と ViewportScroller） |
| 本番では二重の forRoot が例外にならず、子の注入器に 2 つ目の Router ができる | 第 5 回の 5 節 | Node の記録（開発モードは NG04007）、ページの DEMO のボタン |
| 移行ツールが `bindToComponentInputs`・`enableViewTransitions`・`scrollOffset` を `withRouterConfig` に入れ、TS2353 になる | 第 5 回の 6 節 | 作業木の standalone\_migration\_spec.ts に it を足して出力を見る、その 1 行を tsc 6.0.3 |
| router\_link.ts 492〜498 行目の onClick の分岐（修飾キー・中ボタン・`target`）を固める spec が無い | [第 1 回](01-rdir-link-inputs.md)の「テストと直し方」 | 作業木で 493 行目と 497 行目の条件を消しても、RouterLink の 76 本がすべて通る。onClick を直接呼ぶ it を 3 本足すと、それぞれ 1 本ずつ落ちる |
| RouterLinkActive の JSDoc（51〜52 行目）は「URL が `'/user'` のときも active」と書くが、既定の判定では付かない | [第 2 回](02-rdir-link-active.md)の 1 節 | ページの DEMO、作業木で足した it（今のソースのままで通る） |
| integration/router\_link\_active.spec.ts 199〜224 行目の it は、zoneless の target では `hasPendingMicrotasks` が常に `false` なので何も確かめていない | 第 2 回の「テストと直し方」 | 作業木で 202 行目の条件を `if (true)` にしても 26 本が通る |
| `ROUTER_OUTLET_DATA` の文書が、47 行目は「既定は `null`」、244 行目は「`undefined`」と食い違う。実際は `undefined` | [第 3 回](03-rdir-outlet.md)の 5 節 | ページの DEMO、spec の 730〜749 行目 |

どれも issue も PR も出していません。gh で検索した範囲では、同じ件を扱った issue は見つかっていません。各章の「テストと直し方」に詳しい手順があります。

## 聞かれそうな質問

**Q. RouterLink の spec を 1 つだけ走らせたいとき、どう絞りますか？**

`pnpm bazel test //packages/router/test:test --test_arg=--filter=…` です。router\_link\_spec.ts の describe は `RouterLink` なので、`^RouterLink `（頭の ^ と後ろの空白）で 11 本になります。integration の router\_links.spec.ts は `routing router links ` で、navigation と history の 2 回ぶん 38 本です。

**Q. なぜ integration の spec は数が倍になるのですか？**

`integration.spec.ts` が `routerLinkIntegrationSpec()` などの関数を、`for (const browserAPI of ['navigation', 'history'])` の中の describe で 2 回呼ぶからです。`withExperimentalPlatformNavigation()` を入れるかどうかだけが違います。

**Q. NavigationCancel の code を確かめる spec はどこにありますか？**

GuardRejected は guards.spec.ts の CanLoad（L1641〜1643）と navigation\_errors.spec.ts の L372、NoDataFromResolver は route\_data.spec.ts L196、Superseded は navigation.spec.ts の L503・L536・L574・L612、Redirect は navigation.spec.ts L1015です。Aborted と NavigationSkippedCode を確かめる spec はありません（第 4 回の「テストと直し方」）。

**Q. 本番ビルドでだけ変わる振る舞いは、spec で固められていますか？**

この 5 つの部品では固められていません。spec は開発モードで走るので、`reason` が空になること（第 4 回）と、ROUTER\_FORROOT\_GUARD が無いこと（第 5 回）は、spec の外にある約束です。

**Q. issue を読むとき、どこから今のコードを当てればよいですか？**

まず部品（RouterLink / RouterLinkActive / RouterOutlet / events / ExtraOptions）を決めて、その章の引用の行と、4 節の「今のコード」の列を見ます。古い issue（#28345・#26854 など）は、本文のコードと今のコードが違うことがあるので、今の行を読んでから本文の再現を当てます。

## 読み終えて

- このシリーズの約束は、router\_link\_spec・router\_link\_active.spec・directives/router\_outlet.spec と、integration の router\_links・router\_link\_active・route\_reuse\_strategy・router\_events の spec で固められている。integration は 2 回ずつ走る。
- Node の `:test` は 1170 本、web は Chromium 1180・Firefox 1178。`--filter` は正規表現で、`^名前 ` の形で絞る。
- event の `toString` と `reason`、`NavigationSkippedCode` と `Aborted`、本番だけの振る舞いは spec が無い。
- issue は「その口が無い」機能の要望が多く、不具合の形のものはスクロールと付け直した部品の注入器に集まっている。

---

← 前: [ExtraOptions と RouterModule.forRoot：設定の型と、withX との対応表](05-rdir-options.md)  
次: [provideServerRendering の中身：withRoutes と withAppShell が積む provider](../ssrl/01-ssrl-provide.md) →
