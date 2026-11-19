[目次](../README.md) › [Router のディレクティブとイベントの残り：RouterLink・RouterLinkActive・RouterOutlet・events.ts を行で埋める](README.md) › 第 2 回 / 全 6 回

# RouterLinkActive の残り：options・aria-current・isActiveChange

> router\_link\_active.ts の未読の行：JSDoc の約束（/user で /user/bob が active になるという 1 文は実装と違う）、routerLinkActiveOptions の 4 つの形と null、ariaCurrentWhenActive の toString、queueMicrotask の中で出る isActiveChange、ContentChildren で集めた子の RouterLink の onChanges の購読と、routerLinkActive を変えたとき古いクラスが残る不具合（98c0265880f）。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/rdir-link-active)

---

`RouterLinkActive` の「いまのページか」の判定（`isActive` と `containsTree`）と、`update` の中身は [router シリーズの RouterLink と RouterLinkActive の章](../router/18-router-link-active.md)で読みました。この章は、そこで飛ばした行を読みます。クラスの宣言の前にある JSDoc の約束、`routerLinkActiveOptions`・`ariaCurrentWhenActive`・`isActiveChange` の宣言、`ContentChildren` で集めた子のリンクの変化をどう購読するか、そして更新がいつ DOM に届くかです。

読む対象は `packages/router/src/directives/router_link_active.ts` の 1〜167 行目と、前の章で引かなかった `update` まわりの数行です。

1. [1. RouterLink の入力](01-rdir-link-inputs.md)
2. **2. RouterLinkActive の残り**（この章）
3. [3. RouterOutlet の入力と detach / attach](03-rdir-outlet.md)
4. [4. events.ts の各クラス](04-rdir-events.md)
5. [5. ExtraOptions と RouterModule](05-rdir-options.md)
6. [6. spec と issue](06-rdir-tests-issues.md)

## 1. JSDoc の約束と、合っていない 1 文

📄 `angular/packages/router/src/directives/router_link_active.ts` L43–67 （▶ の行: 48, 51–52, 54, 58–59, 62, 65）

````ts
43 │  * Use this directive to create a visual distinction for elements associated with an active route.
44 │  * For example, the following code highlights the word "Bob" when the router
45 │  * activates the associated route:
46 │  *
47 │  * ```html
48 ▶  * <a routerLink="/user/bob" routerLinkActive="active-link">Bob</a>
49 │  * ```
50 │  *
51 ▶  * Whenever the URL is either '/user' or '/user/bob', the "active-link" class is
52 ▶  * added to the anchor tag. If the URL changes, the class is removed.
53 │  *
54 ▶  * You can set more than one class using a space-separated string or an array.
55 │  * For example:
56 │  *
57 │  * ```html
58 ▶  * <a routerLink="/user/bob" routerLinkActive="class1 class2">Bob</a>
59 ▶  * <a routerLink="/user/bob" [routerLinkActive]="['class1', 'class2']">Bob</a>
60 │  * ```
61 │  *
62 ▶  * To add the classes only when the URL matches the link exactly, add the option `exact: true`:
63 │  *
64 │  * ```html
65 ▶  * <a routerLink="/user/bob" routerLinkActive="active-link" [routerLinkActiveOptions]="{exact:
66 │  * true}">Bob</a>
67 │  * ```
````

48 行目の例は `routerLink="/user/bob"` のリンクです。51〜52 行目は「URL が `'/user'` か `'/user/bob'` のとき active-link が付く」と書いています。ところが既定の判定（`paths: 'subset'`）は「今の URL がリンクの URL を含むか」です（[router-link-active の章](../router/18-router-link-active.md)の 6〜8 節）。今の URL `/user` はリンク `/user/bob` を含まないので、付きません。付くのは `/user/bob` と、その下の `/user/bob/…` です。下のデモの L2（`/users/1?tab=a`）が、URL `/users` では付かないのが同じ形です。作業木で it を足して確かめた結果は「テストと直し方」に置きました。

この文は 2020 年の 3d0be5213e9 で「When the url is either …」から言い回しだけ直されたもので、新しい本家の main でも同じです。54〜59 行目のクラスの複数指定（空白区切りの文字列か配列）と、62〜65 行目の `{exact: true}` は実装どおりです。

📄 `angular/packages/router/src/directives/router_link_active.ts` L69–101 （▶ の行: 74–75, 79, 84–86, 97, 100–101）

````ts
 69 │  * To directly check the `isActive` status of the link, assign the `RouterLinkActive`
 70 │  * instance to a template variable.
 71 │  * For example, the following checks the status without assigning any CSS classes:
 72 │  *
 73 │  * ```html
 74 ▶  * <a routerLink="/user/bob" routerLinkActive #rla="routerLinkActive">
 75 ▶  *   Bob {{ rla.isActive ? '(already open)' : ''}}
 76 │  * </a>
 77 │  * ```
 78 │  *
 79 ▶  * You can apply the `RouterLinkActive` directive to an ancestor of linked elements.
 80 │  * For example, the following sets the active-link class on the `<div>`  parent tag
 81 │  * when the URL is either '/user/jim' or '/user/bob'.
 82 │  *
 83 │  * ```html
 84 ▶  * <div routerLinkActive="active-link" [routerLinkActiveOptions]="{exact: true}">
 85 ▶  *   <a routerLink="/user/jim">Jim</a>
 86 ▶  *   <a routerLink="/user/bob">Bob</a>
 87 │  * </div>
 88 │  * ```
 89 │  *
 90 │  * The `RouterLinkActive` directive can also be used to set the aria-current attribute
 91 │  * to provide an alternative distinction for active elements to visually impaired users.
 92 │  *
 93 │  * For example, the following code adds the 'active' class to the Home Page link when it is
 94 │  * indeed active and in such case also sets its aria-current attribute to 'page':
 95 │  *
 96 │  * ```html
 97 ▶  * <a routerLink="/" routerLinkActive="active" ariaCurrentWhenActive="page">Home Page</a>
 98 │  * ```
 99 │  *
100 ▶  * NOTE: RouterLinkActive is a `ContentChildren` query.
101 ▶  * Content children queries do not retrieve elements or directives that are in other components' templates, since a component's template is always a black box to its ancestors.
````

74 行目、`#rla="routerLinkActive"` は `exportAs` で取れるインスタンスで、75 行目のように `rla.isActive` を読めます。79〜88 行目は親の要素に付ける使い方、97 行目は `ariaCurrentWhenActive` です。100〜101 行目の NOTE が大事です。子のリンクは `ContentChildren` クエリで集めるので、**別のコンポーネントのテンプレートの中**にある `routerLink` は見えません。`<nav routerLinkActive><app-menu-item></nav>` のように、リンクを子コンポーネントの中に置くと親には何も付きません。この NOTE は 5612ad5b45e（2025-09-16）で足されました。

## 2. 3 つの入力と 1 つの出力

📄 `angular/packages/router/src/directives/router_link_active.ts` L124–148 （▶ の行: 130–131, 135–139, 144, 148）

```ts
124 │ 
125 │   /**
126 │    * Options to configure how to determine if the router link is active.
127 │    *
128 │    * These options are passed to the `isActive()` function.
129 │    *
130 ▶    * When `undefined`, the default subset match behavior is used.
131 ▶    * When `null`, the link is never considered active regardless of the current URL.
132 │    *
133 │    * @see {@link isActive}
134 │    */
135 ▶   @Input() routerLinkActiveOptions:
136 ▶     | {exact: boolean}
137 ▶     | Partial<IsActiveMatchOptions>
138 ▶     | null
139 ▶     | undefined = {exact: false};
140 │ 
141 │   /**
142 │    * Aria-current attribute to apply when the router link is active.
143 │    *
144 ▶    * Possible values: `'page'` | `'step'` | `'location'` | `'date'` | `'time'` | `true` | `false`.
145 │    *
146 │    * @see {@link https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-current}
147 │    */
148 ▶   @Input() ariaCurrentWhenActive?: 'page' | 'step' | 'location' | 'date' | 'time' | true | false;
```

1. **135〜139 行目：routerLinkActiveOptions は 4 つの形を受ける**

   `{exact: boolean}`、`Partial<IsActiveMatchOptions>`（`paths`・`queryParams`・`matrixParams`・`fragment` の一部だけでもよい）、`null`、`undefined` です。130〜131 行目のとおり、`undefined` は「既定の subset」、`null` は「どの URL でも active にしない」で、意味が違います。`Partial` にしたのは 907a94dcec2（2026-01-26）、`null` と `undefined` を受けるようにしたのは 97a3fd6a55e（2026-04-10）です。後者の本文は、ナビゲーションのメニューと本文で同じコンポーネントを使うとき、入力ごとに `@if` で分岐させずに済むように、という理由を書いています。
2. **148 行目：ariaCurrentWhenActive は 5 つの文字列と true / false**

   144 行目のとおり、`aria-current` 属性に入る値の型です。`aria-current` はスクリーンリーダーに「いま開いているページ（や手順）」を伝える属性です。`true` と `false` も書けることに注意してください（4 節）。この入力は dea8c86cd57（2022、#45167）で足されました。

📄 `angular/packages/router/src/directives/router_link_active.ts` L150–167 （▶ の行: 152–153, 156–157, 166）

````ts
150 │   /**
151 │    *
152 ▶    * You can use the output `isActiveChange` to get notified each time the link becomes
153 ▶    * active or inactive.
154 │    *
155 │    * Emits:
156 ▶    * true  -> Route is active
157 ▶    * false -> Route is inactive
158 │    *
159 │    * ```html
160 │    * <a
161 │    *  routerLink="/user/bob"
162 │    *  routerLinkActive="active-link"
163 │    *  (isActiveChange)="this.onRouterLinkActive($event)">Bob</a>
164 │    * ```
165 │    */
166 ▶   @Output() readonly isActiveChange: EventEmitter<boolean> = new EventEmitter();
167 │ 
````

166 行目、`isActiveChange` は `@Output` の `EventEmitter<boolean>` です。152〜153 行目のとおり「active になるたび、外れるたび」に出ます。裏返せば、同じ状態のまま入力や URL が変わっても出ません（5 節）。faf9f5a3bc4（2021、#43280）で足されました。

## 3. options が null のとき

📄 `angular/packages/router/src/directives/router_link_active.ts` L269–271 （▶ の行: 269–270）

```ts
269 ▶     if (opts === null) {
270 ▶       return () => false;
271 │     }
```

📄 `angular/packages/router/src/directives/router_link_active.ts` L228–233 （▶ の行: 229–230, 232）

```ts
228 │   private update(): void {
229 ▶     if (!this.links || !this.router.navigated) return;
230 ▶     if (this.routerLinkActiveOptions === null && !this._isActive) return;
231 │ 
232 ▶     queueMicrotask(() => {
233 │       const hasActiveLinks = this.hasActiveLinks();
```

`null` は 2 か所で効きます。269〜270 行目、判定の関数が「常に `false`」になります。その手前の 230 行目、`null` で、いま active でもないなら `update` はマイクロタスクの予約すらしません。active のときに `null` に変えた場合だけ先へ進み、クラスを外して `isActiveChange(false)` を出します。残りの 3 つの形がどう 4 項目の `IsActiveMatchOptions` に揃えられるかは、router-link-active の章の 6〜7 節で読みました。下の表は、デモで子の Router を `/users/1?tab=a` に置いて options だけを切り替えた記録です。

| routerLinkActiveOptions | L1 /users | L2 /users/1?tab=a | L3 /users/1#bio | 親の nav |
| --- | --- | --- | --- | --- |
| `{exact: false}`（既定）・`undefined` | ○ | ○ | ○ | ○ |
| `{exact: true}` | — | ○ | — | ○ |
| `null` | — | — | — | — |
| `{paths: 'exact'}` | — | ○ | ○ | ○ |
| `{paths: 'subset', fragment: 'exact'}` | ○ | ○ | — | ○ |
| `{paths: 'exact', queryParams: 'ignored', matrixParams: 'exact', fragment: 'ignored'}` | — | ○ | ○ | ○ |

L3 が `{exact: true}` で外れるのは、`exactMatchOptions` の `queryParams: 'exact'` で、今の `?tab=a` とリンクのクエリ無しが一致しないからです（フラグメントは `'ignored'`）。`{paths: 'exact'}` では足りない項目が subset の既定で埋まるので、クエリは「リンクの方が少なくてよい」になり、L3 も active です。

## 4. aria-current は toString して書く

📄 `angular/packages/router/src/directives/router_link_active.ts` L241–247 （▶ の行: 241–242, 244–245）

```ts
241 ▶       if (hasActiveLinks && this.ariaCurrentWhenActive !== undefined) {
242 ▶         this.renderer.setAttribute(
243 │           this.element.nativeElement,
244 ▶           'aria-current',
245 ▶           this.ariaCurrentWhenActive.toString(),
246 │         );
247 │       } else {
```

241 行目、active で、かつ `ariaCurrentWhenActive` が `undefined` でないときだけ書きます。245 行目は `toString()` なので、`true` なら `aria-current="true"`、`false` なら `aria-current="false"` です。`false` を渡すと「active なのに aria-current="false"」になります。ARIA の仕様では `"false"` は属性が無いのと同じ意味なので、読み上げは変わりません。active でないときは、何を渡していても属性を外します（この引用のすぐ後の `removeAttribute`）。下のデモでも `true` と `false` で、表の aria-current の列が `true` / `false` の文字列になります。

## 5. isActiveChange はマイクロタスクの中で出る

📄 `angular/packages/router/src/directives/router_link_active.ts` L251–257 （▶ の行: 251–254, 256）

```ts
251 ▶       // Only emit change if the active state changed.
252 ▶       if (this._isActive !== hasActiveLinks) {
253 ▶         this._isActive = hasActiveLinks;
254 ▶         this.cdr.markForCheck();
255 │         // Emit on isActiveChange after classes are updated
256 ▶         this.isActiveChange.emit(hasActiveLinks);
257 │       }
```

252 行目、前回の `_isActive` と違うときだけ、253 行目で書き換え、254 行目で `markForCheck`、256 行目で emit します。この 3 行は 3 節の 232 行目の `queueMicrotask` の中です。したがって `NavigationEnd` を受け取った同期区間では、クラスも `isActive` もまだ古いままです。デモの記録（URL を `/users` から `/users/1?tab=a` へ）が、この順番をそのまま見せます。

| # | 出来事 | 中身 |
| --- | --- | --- |
| 7 | NavigationEnd | `/users/1?tab=a 同期で読んだ class: nav="has-active" L1="on" L2="" L3=""` |
| 8 | isActiveChange（L2） | `true` |
| 9 | isActiveChange（L3） | `true` |
| 10 | その次のマイクロタスク | `読んだ class: nav="has-active" L1="on" L2="on" L3="on"` |

7 行目の記録は、4 つの `RouterLinkActive` がそれぞれ `update` を呼んだ**後**の同期区間で読んだものです（デモは子の Router の events を、ディレクティブより後に購読しています）。それでも L2 と L3 は空で、クラスが付くのは 8・9 行目のマイクロタスクの中です。親の nav と L1 は active のままなので、isActiveChange は出ません。起動直後にクラスが一瞬遅れて付く（ちらつく）という #62973 は、この `queueMicrotask` と 229 行目の `router.navigated` の待ちを挙げています。

> [!NOTE]
> **ポイント**
>
> デモで最初に移動したときは、記録の順番が違います。`NavigationEnd` の時点でまだ子の画面の変更検知が 1 回も走っておらず、`links`（ContentChildren の結果）が無いので、229 行目の `!this.links` で何もしません。クラスが付くのは、その後の最初の変更検知の `ngAfterContentInit`（次の節の 186 行目の `of(null)`）からです。

## 6. 子のリンクの入力が変わったとき

📄 `angular/packages/router/src/directives/router_link_active.ts` L185–191 （▶ の行: 186–187, 189–190）

```ts
185 │     // `of(null)` is used to force subscribe body to execute once immediately (like `startWith`).
186 ▶     of(this.links.changes, of(null))
187 ▶       .pipe(mergeAll())
188 │       .subscribe((_) => {
189 ▶         this.update();
190 ▶         this.subscribeToEachLinkOnChanges();
191 │       });
```

📄 `angular/packages/router/src/directives/router_link_active.ts` L196–202 （▶ の行: 196, 198, 202）

```ts
196 ▶     const allLinkChanges = [...this.links.toArray(), this.link]
197 │       .filter((link): link is RouterLink => !!link)
198 ▶       .map((link) => link.onChanges);
199 │     this.linkInputChangesSubscription = from(allLinkChanges)
200 │       .pipe(mergeAll())
201 │       .subscribe((link) => {
202 ▶         if (this._isActive !== this.isLinkActive(this.router)(link)) {
```

📄 `angular/packages/router/src/directives/router_link.ts` L435–439 （▶ の行: 438）

```ts
435 │   ngOnChanges(changes?: SimpleChanges): void {
436 │     // This is subscribed to by `RouterLinkActive` so that it knows to update
437 │     // when there are changes to the RouterLinks it's tracking.
438 ▶     this.onChanges.next(this);
439 │   }
```

186 行目、`links.changes`（`@for` などでリンクの数が変わったとき）と `of(null)` を束ね、190 行目でそのたびに子の購読を張り直します。196 行目、ContentChildren で集めたリンクに、自分と同じ要素のリンクを足し、198 行目でそれぞれの `onChanges` を取ります。`onChanges` は `router_link.ts` の 438 行目、`RouterLink.ngOnChanges` の中で `next` される Subject です。つまり子のリンクの `[queryParams]` などが変わると、ここに届きます。

202 行目、届いたリンク 1 本の判定が今の `_isActive` と違うときだけ `update` します。親に複数のリンクがあるとき、これは「そのリンクのせいで結果が変わるかもしれない」ときだけ全体を計算し直す、という近道です。たとえば親が L1 のおかげで active のときに L2 の入力が変わって L2 が外れても、202 行目は `true !== false` で `update` を呼び、全体を計算し直して active のまま、isActiveChange は出ません。

📄 `angular/packages/router/src/directives/router_link_active.ts` L209–215 （▶ の行: 210–211, 214–215）

```ts
209 │   set routerLinkActive(data: string[] | string | null | undefined) {
210 ▶     if (data == null) {
211 ▶       this.classes = [];
212 │       return;
213 │     }
214 ▶     const classes = Array.isArray(data) ? data : data.split(' ');
215 ▶     this.classes = classes.filter((c) => !!c);
```

クラス名の入力のセッターです。読んでいる 8576f161ae4 では、210〜211 行目で `null` なら `classes` を空にするだけ、215 行目で新しい配列に置き換えるだけです。`update` は「今の `classes`」を足すか外すかしかしないので、active のときに `'on'` から `null` や `'lit'` に変えると、古い `'on'` が要素に残ります。これを直したのが新しい本家の 98c0265880f（2026-10-14「remove previous classes when routerLinkActive changes」、#71348）で、セッターの中で使わなくなったクラスを `removeClass` します。このサイトの 22.2.6 にはこの修正が入っているので、デモで routerLinkActive を切り替えると古いクラスは消えます。修正前の動きは「テストと直し方」で spec を古いソースに当てて確かめました。

> **🧪 DEMO — 本物の RouterLinkActive を子の Router の上で動かす**
>
> サイトとは別の Router（偽の LocationStrategy つき）を作り、`<nav routerLinkActive="has-active">` の中に 3 本のリンクを置きました。L1〜L3 には同じ `routerLinkActiveOptions`・`ariaCurrentWhenActive`・`routerLinkActive` を渡しています。移動ボタンは子の Router の `navigateByUrl` を呼ぶだけで、ページの URL は変わりません。下の表は各要素の class 属性と aria-current、2 つ目の表は起きた順の記録です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/rdir-link-active)

## テストと直し方

### spec と it

| ファイル | describe / it | 行 | この章のどこ |
| --- | --- | --- | --- |
| router\_link\_active.spec.ts | `RouterLinkActive` › `removes initial active class even if never active` | 13 | 3 節 |
| router\_link\_active.spec.ts | `accepts null / undefined for routerLinkActive`（2 つ） | 28・43 | 6 節のセッター |
| router\_link\_active.spec.ts | `accepts null / undefined for routerLinkActiveOptions …`・`supports partial match options` | 58・77・94 | 2・3 節 |
| integration/router\_link\_active.spec.ts | `routerLinkActive` › `should not set the class until the first navigation succeeds` | 66 | 5 節（229 行目） |
| integration/router\_link\_active.spec.ts | `should set the class on a parent element when the link is active` | 89 | 1・6 節 |
| integration/router\_link\_active.spec.ts | `should not trigger change detection when active state has not changed` | 199 | 6 節（202 行目） |
| integration/router\_link\_active.spec.ts | `should emit on isActiveChange output …`・`should set a provided aria-current attribute …` | 226・270 | 4・5 節 |

📄 `angular/packages/router/test/router_link_active.spec.ts` L58–75 （▶ の行: 59–60, 64, 72, 74）

```ts
58 │   it('accepts null for routerLinkActiveOptions and disables active matching', async () => {
59 ▶     // null is an explicit opt-out: the link should never be marked active regardless
60 ▶     // of the current URL, distinguishing it from undefined which means "use the default".
61 │     @Component({
62 │       imports: [RouterLinkActive, RouterLink],
63 │       template:
64 ▶         '<a routerLinkActive="active" [routerLinkActiveOptions]="null" routerLink="/abc"></a>',
65 │     })
66 │     class MyCmp {}
67 │ 
68 │     TestBed.configureTestingModule({providers: [provideRouter([{path: '**', children: []}])]});
69 │     const fixture = TestBed.createComponent(MyCmp);
70 │     fixture.autoDetectChanges();
71 │     const router = TestBed.inject(Router);
72 ▶     await router.navigateByUrl('/abc');
73 │     await fixture.whenStable();
74 ▶     expect(Array.from(fixture.nativeElement.querySelector('a').classList)).not.toContain('active');
75 │   });
```

59〜60 行目のコメントが 2 節の `null` と `undefined` の違いを書き、72 行目で `/abc` に移動しても、74 行目で `active` が付かないことを確かめています。

📄 `angular/packages/router/test/integration/router_link_active.spec.ts` L66–87 （▶ の行: 80–81, 83, 86）

```ts
66 │     it('should not set the class until the first navigation succeeds', async () => {
67 │       @Component({
68 │         template:
69 │           '<router-outlet></router-outlet><a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" ></a>',
70 │         standalone: false,
71 │       })
72 │       class RootCmpWithLink {}
73 │ 
74 │       TestBed.configureTestingModule({declarations: [RootCmpWithLink]});
75 │       const router: Router = TestBed.inject(Router);
76 │ 
77 │       const f = TestBed.createComponent(RootCmpWithLink);
78 │       await advance(f);
79 │ 
80 ▶       const link = f.nativeElement.querySelector('a');
81 ▶       expect(link.className).toEqual('');
82 │ 
83 ▶       router.initialNavigation();
84 │       await advance(f);
85 │ 
86 ▶       expect(link.className).toEqual('active');
87 │     });
```

80〜81 行目、最初のナビゲーションの前はクラスが空。83 行目で `initialNavigation()` を呼ぶと、86 行目で付きます。229 行目の `router.navigated` の待ちを固める it です。

📄 `angular/packages/router/test/integration/router_link_active.spec.ts` L199–224 （▶ の行: 201, 221–223）

```ts
199 │     it('should not trigger change detection when active state has not changed', async () => {
200 │       @Component({
201 ▶         template: `<div id="link" routerLinkActive="active" [routerLink]="link"></div>`,
202 │         standalone: false,
203 │       })
204 │       class LinkComponent {
205 │         link = 'notactive';
206 │       }
207 │ 
208 │       @Component({
209 │         template: '',
210 │         standalone: false,
211 │       })
212 │       class SimpleComponent {}
213 │ 
214 │       TestBed.configureTestingModule({
215 │         imports: [...ROUTER_DIRECTIVES],
216 │         providers: [provideRouter([{path: '', component: SimpleComponent}])],
217 │         declarations: [LinkComponent, SimpleComponent],
218 │       });
219 │ 
220 │       const fixture = await createRoot(TestBed.inject(Router), LinkComponent);
221 ▶       fixture.componentInstance.link = 'stillnotactive';
222 ▶       fixture.detectChanges(false /** checkNoChanges */);
223 ▶       expect(TestBed.inject(NgZone).hasPendingMicrotasks).toBe(false);
224 │     });
```

この it は 6 節の 202 行目（結果が変わりうるときだけ `update`）を固めるつもりのものです。221 行目でリンクを別の非 active の値に変え、223 行目で「保留中のマイクロタスクが無い」ことを `NgZone.hasPendingMicrotasks` で見ています。ところが `//packages/router/test:test` は zoneless の jasmine で走り、そこでの `NgZone` は `NoopNgZone` です。`NoopNgZone` の `hasPendingMicrotasks` は `false` の固定値（`packages/core/src/zone/ng_zone.ts` の `readonly hasPendingMicrotasks = false`）なので、202 行目を `if (true)` にしてもこの it は通ります（下の M5）。

### 手元で走らせた結果

📄 `走らせ方`

```
cd ~/angular-research/angular
pnpm bazel test //packages/router/test:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=routerLinkActive|RouterLinkActive"
```

📄 `結果`

```
# 2026-11-19、手元の macOS（node v24.22.1）で、8576f161ae4
Ran 26 of 1170 specs
26 specs, 0 failures
//packages/router/test:test                                              PASSED in 1.3s
```

📄 `結果（作業木、8576f161ae4 から）`

```
[B1] 98c0265880f の router_link_active.spec.ts（it が 2 つ増える）だけを当てる
1) RouterLinkActive replaces the active classes when routerLinkActive changes
    Expected $.length = 2 to equal 1.
    Expected $[0] = 'active' to equal 'selected'.
2) RouterLinkActive removes the active class when routerLinkActive changes to null
    Expected $.length = 1 to equal 0.
    Unexpected $[0] = 'active' in array.
8 specs, 2 failures

[B2] B1 に、98c0265880f の router_link_active.ts の修正も当てる
8 specs, 0 failures

[D1] 下の 2 つの it を router_link_active.spec.ts に足す（ソースはそのまま）
Ran 8 of 1172 specs
8 specs, 0 failures

[M5] 202 行目の if (this._isActive !== this.isLinkActive(this.router)(link)) を if (true) にする
Ran 26 of 1170 specs
26 specs, 0 failures
```

- B1 は 98c0265880f が足した 2 つの it を、修正前のソースに当てたものです。2 つとも落ち、6 節で読んだ「古いクラスが残る」が再現しました。B2 でセッターの修正も当てると通ります。
- D1 は 1 節の JSDoc の文を確かめる it です。`/user` では付かず、`/user/bob/details` では付くことが、今のソースのままで通ります。JSDoc の 51 行目の方が実装と違います。
- M5 は 202 行目の条件を消したもので、26 個の it が全部通りました。上の 199 行目の it が zoneless では効いていないことの確認です。

📄 `足した it（D1）`

```
  it('does not activate a link whose path is longer than the current URL', async () => {
    @Component({
      imports: [RouterLinkActive, RouterLink],
      template: '<a routerLinkActive="active" routerLink="/user/bob"></a>',
    })
    class MyCmp {}

    TestBed.configureTestingModule({providers: [provideRouter([{path: '**', children: []}])]});
    const fixture = TestBed.createComponent(MyCmp);
    fixture.autoDetectChanges();
    const router = TestBed.inject(Router);
    const link = fixture.nativeElement.querySelector('a');

    await router.navigateByUrl('/user');
    await fixture.whenStable();
    expect(Array.from(link.classList)).not.toContain('active');

    await router.navigateByUrl('/user/bob/details');
    await fixture.whenStable();
    expect(Array.from(link.classList)).toContain('active');
  });

  it('writes the stringified ariaCurrentWhenActive only while active', async () => {
    @Component({
      imports: [RouterLinkActive, RouterLink],
      template:
        '<a routerLinkActive="active" [ariaCurrentWhenActive]="false" routerLink="/abc"></a>',
    })
    class MyCmp {}

    TestBed.configureTestingModule({providers: [provideRouter([{path: '**', children: []}])]});
    const fixture = TestBed.createComponent(MyCmp);
    fixture.autoDetectChanges();
    const router = TestBed.inject(Router);
    const link = fixture.nativeElement.querySelector('a');

    await router.navigateByUrl('/abc');
    await fixture.whenStable();
    expect(link.getAttribute('aria-current')).toBe('false');

    await router.navigateByUrl('/other');
    await fixture.whenStable();
    expect(link.getAttribute('aria-current')).toBeNull();
  });
```

直すとしたら、JSDoc は 51〜52 行目を「URL が `/user/bob` か、その下（`/user/bob/…`）のとき」に変えるだけで、D1 の 1 つ目の it が固めます。199 行目の it は、`NgZone` ではなく `spyOn(RouterLinkActive.prototype as any, 'update')` のように `update` の呼び出し回数で確かめる形に変えれば、zoneless でも M5 を捕まえられます。

## 聞かれそうな質問

**Q. `routerLink="/user/bob"` のリンクは、URL が `/user` のとき active ですか？**

いいえ。JSDoc の 51〜52 行目はそう書いていますが、既定の subset の判定は「今の URL がリンクを含むか」なので、`/user` では付きません。作業木で足した D1 の it が、今のソースのままで通ります。付くのは `/user/bob` とその下です。

**Q. `[routerLinkActiveOptions]="null"` と書かないのとでは何が違いますか？**

書かない（または `undefined`）なら 139 行目の既定 `{exact: false}` か subset で判定します。`null` なら 269〜270 行目で判定が常に `false` になり、230 行目で、もともと active でなければ `update` の予約もしません。

**Q. `isActiveChange` のハンドラーの中で要素のクラスを読むと、もう付いていますか？**

付いています。256 行目の emit は、同じマイクロタスクの中でクラスを足し外しし（255 行目のコメントのとおり）、`_isActive` を書き換えた（253 行目）後だからです。逆に `NavigationEnd` を購読した同期の処理の中では、まだ付いていません（デモの記録の 7 行目）。

**Q. 子コンポーネントの中のリンクに、親の `routerLinkActive` が反応しないのはなぜですか？**

子のリンクは `ContentChildren(RouterLink, {descendants: true})` で集めるので、別のコンポーネントのテンプレートの中は見えないからです（100〜101 行目の NOTE）。`descendants: true` は投影された中身を深くまで見るという意味で、コンポーネントの内側には入りません。

**Q. `[ariaCurrentWhenActive]="false"` にすると属性は付きませんか？**

付きます。241 行目は `!== undefined` で見るので、active のとき 245 行目の `toString()` で `aria-current="false"` が書かれます。外れるのは active でないときです。

**Q. リンクの `queryParams` だけが変わったとき、親の `RouterLinkActive` は計算し直しますか？**

そのリンクの判定が今の `_isActive` と違うときだけです（202 行目）。届く経路は `RouterLink.ngOnChanges` の 438 行目 → 198 行目の `onChanges` の購読です。

## 読み終えて

- `routerLinkActiveOptions` の `null` は「決して active にしない」、`undefined` は「既定」。`null` は 230 行目と 269 行目の 2 か所で効きます。
- `aria-current` は active のときだけ `toString()` で書き、`false` でも `"false"` の文字列が付きます。
- クラスと `isActiveChange` は `queueMicrotask` の中で更新されます。`NavigationEnd` の同期区間ではまだ古いままです。
- JSDoc の 51〜52 行目は実装と違い、integration の 199 行目の it は zoneless の target では何も確かめていません。

---

← 前: [RouterLink の入力：queryParams から target まで、href とクリックに効く行](01-rdir-link-inputs.md)  
次: [RouterOutlet の入力と detach / attach：名前付きの出口と routerOutletData](03-rdir-outlet.md) →
