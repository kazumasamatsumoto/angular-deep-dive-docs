[目次](../README.md) › [@defer とインクリメンタルハイドレーションの内側](README.md) › 第 19 回 / 全 20 回

# @defer のテストを読む：defer\_spec と incremental\_hydration\_spec

> packages/core/test/acceptance/defer\_spec.ts（約 5600 行）の describe の地図と、依存の読み込みを止める書き方（DEFER\_BLOCK\_DEPENDENCY\_INTERCEPTOR や手作りの Promise）、タイマーを進める書き方。packages/platform-server/test/incremental\_hydration\_spec.ts がサーバーで描いた HTML をブラウザ側でハイドレートする書き方。手元での走らせ方と、@defer の不具合を spec の形で再現する手順。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/defer-tests)

---

`@defer` の振る舞いは、3 つの spec ファイルで確かめられています。ブラウザのふりをして TestBed で描く `packages/core/test/acceptance/defer_spec.ts`、サーバーで描いた HTML を同じ Node の中でハイドレートする `packages/platform-server/test/incremental_hydration_spec.ts`、テストを書く人のための `DeferBlockFixture` を確かめる `packages/core/test/defer_fixture_spec.ts` です。この章では、3 つの describe の地図（どの describe がこのシリーズのどの章の話か）を絞り込める表で見せ、依存の読み込みを止める・失敗させる書き方、サーバーからハイドレーションまでを 1 つの it で書く書き方を行で読みます。最後に、[第 17 回](17-defer-hydration-queue.md)で見つけた振る舞いを、spec の形で再現する手順を 1 つ通して書きます。

読む対象は上の 3 つの spec と、`packages/platform-server/test/hydration_utils.ts`、`packages/core/src/hydration/incremental_runtime.ts` のテスト用の関数です。

1. [1. 全体像](01-defer-overview.md)
2. [2. ɵɵdefer 命令](02-defer-instruction.md)
3. [3. 塊の記録](03-defer-details.md)
4. [4. 状態を描く](04-defer-render-state.md)
5. [5. minimum と after](05-defer-minimum-after.md)
6. [6. 依存を読み込む](06-defer-resource-loading.md)
7. [7. トリガーから描画まで](07-defer-trigger-flow.md)
8. [8. when](08-defer-when.md)
9. [9. idle と immediate](09-defer-idle-immediate.md)
10. [10. timer](10-defer-timer.md)
11. [11. interaction と hover](11-defer-dom-triggers.md)
12. [12. viewport](12-defer-viewport.md)
13. [13. prefetch](13-defer-prefetch.md)
14. [14. 入れ子・注入器・クエリ](14-defer-nested-di.md)
15. [15. サーバーでの @defer](15-defer-server.md)
16. [16. hydrate トリガー](16-defer-hydrate-triggers.md)
17. [17. 親から順にハイドレート](17-defer-hydration-queue.md)
18. [18. hydrate のイベント](18-defer-hydrate-events.md)
19. **19. テストを読む**（この章）
20. [20. issue と PR を読む](20-defer-issues.md)

## 1. 3 つの spec と、走らせるターゲット

| spec | 行 | it | bazel のターゲット | 何で描くか |
| --- | --- | --- | --- | --- |
| packages/core/test/acceptance/defer\_spec.ts | 5652 | 109 | `//packages/core/test/acceptance:acceptance`（全部で 2693 件） | TestBed。`PLATFORM_ID` を `'browser'` にして Node で |
| packages/platform-server/test/incremental\_hydration\_spec.ts | 3220 | 41 | `//packages/platform-server/test:test`（全部で 399 件） | platform-server の `renderApplication` → 同じ Node でハイドレート |
| packages/core/test/defer\_fixture\_spec.ts | 447 | 14 | `//packages/core/test:test`（4 本の shard で約 1390 件ずつ） | TestBed と `DeferBlockFixture`（[testing-defer の章](../testing/18-testing-defer.md)） |

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
# defer_spec.ts（acceptance。Node の jasmine、shard なし）
pnpm bazel test //packages/core/test/acceptance:acceptance \
  '--test_arg=--filter=^@defer ' --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/acceptance:acceptance \
  '--test_arg=--filter=trigger resolution' --nocache_test_results --test_output=all
# incremental_hydration_spec.ts（platform-server。shard なし）
pnpm bazel test //packages/platform-server/test:test \
  '--test_arg=--filter=partial hydration' --nocache_test_results --test_output=all
# defer_fixture_spec.ts（core の test。shard が 4 本）
pnpm bazel test //packages/core/test:test \
  '--test_arg=--filter=DeferFixture' --nocache_test_results --test_output=all
```

- どれも Node の jasmine なので、`'--test_arg=--filter=…'` の正規表現が「describe の名前を全部つないだ it の名前」に当たります。**0 件に当たっても PASSED になる**ので、出力の `Ran N of M specs` を必ず見ます。
- 2026-11-06 に走らせた結果：`^@defer ` で `Ran 95 of 2693 specs`（6.1 秒）、`^IdleScheduler` で 15 件（2.1 秒）、`trigger resolution` で 7 件（4.9 秒）、`partial hydration` で `Ran 41 of 399 specs`（7.1 秒）、`DeferFixture` で 14 件（4.8 秒）。ログは scratchpad/defer-logs/e-defer-only.log・e-idle.log・e-trigger.log・e-partial.log・e-fixture.log です。
- 2 節の地図では `@defer` の describe の it は 94 個ですが、走ったのは 95 件でした。`error handling > with ngDevMode`（1328 行目の describe）の中の it が `[true, false].forEach` の中に書かれていて、2 回作られるからです。地図は「書いてある it の数」です。
- shard があるのは `//packages/core/test:test` の方です。`DeferFixture` の 14 件は、4 本の shard に 4・3・3・4 件に分かれて出ました。数字は shard ごとに出るので合計で読みます。

📄 `出力（//packages/core/test:test を DeferFixture で絞ったとき。scratchpad/defer-logs/e-fixture.log の抜粋）`

```
Ran 4 of 1391 specs
4 specs, 0 failures
Ran 3 of 1390 specs
3 specs, 0 failures
Ran 3 of 1390 specs
3 specs, 0 failures
Ran 4 of 1391 specs
4 specs, 0 failures
INFO: Elapsed time: 4.807s
//packages/core/test:test   PASSED in 1.4s
```

## 2. DEMO：describe の地図（絞り込める表）

> **🧪 DEMO — 3 つの spec の describe（名前・行・it の数・このシリーズの章）**
>
> 行と it の数は、下の spec-map.mjs が ../angular（8576f161ae4）の spec ファイルを行頭の字下げで読んで数えたものです（このページの中に持っていて、通信はしません）。「it（直下）」はその describe のすぐ下の it、「it（全部）」は入れ子の describe の分も足した数です。「章」は、describe の中の it の名前と中身を読んで、この章の書き手が付けた対応です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/defer-tests)

📄 `scratchpad の spec-map.mjs（describe と it を字下げで数える。node spec-map.mjs <spec.ts>… で JSON を出す）`

```
// spec ファイルの describe の木（名前・行・直下と配下の it の数）を、行頭の字下げから作る。
// 使い方: node spec-map.mjs <spec.ts> [...]  → JSON を stdout に
import { readFileSync } from 'node:fs';
const out = {};
for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const stack = []; const rows = [];
  lines.forEach((line, i) => {
    // 名前が次の行にある書き方（it(\n  '...'）も拾う
    const joined = /^\s*(describe|it|fit|xit)\(\s*$/.test(line) ? line + (lines[i + 1] ?? '').trim() : line;
    const m = /^(\s*)(describe|it|fit|xit|xdescribe|fdescribe)\(\s*(['"`])(.*?)\3/.exec(joined);
    if (!m) return;
    const indent = m[1].length, kind = m[2], name = m[4];
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (/describe/.test(kind)) {
      const row = { line: i + 1, depth: stack.length, name, path: [...stack.map((s) => s.row.name), name].join(' > '), its: 0, ownIts: 0 };
      rows.push(row); stack.push({ indent, row });
    } else {
      stack.forEach((s) => s.row.its++);
      if (stack.length) stack[stack.length - 1].row.ownIts++;
    }
  });
  const total = lines.filter((l) => /^\s*(it|fit|xit)\(/.test(l)).length;
  out[file.replace(/.*\/packages\//, 'packages/')] = { lines: lines.length - (lines.at(-1) === '' ? 1 : 0), its: total, describes: rows };
}
console.log(JSON.stringify(out, null, 1));

```

地図から分かることです。`defer_spec.ts` の it が多いのは `viewport triggers`（15）・`IdleScheduler`（15）・`prefetch`（13）・`interaction triggers`（11）で、トリガーの章（第 9〜13 回）の話が半分を占めます。`incremental_hydration_spec.ts` は 41 個のうち 17 個が `triggers` の下で、[第 17 回](17-defer-hydration-queue.md)の列の進め方は `basic hydration behavior`・`control flow`・`cleanup` の 11 個に散らばっています。

## 3. defer\_spec.ts の道具：止める・失敗させる・時間を進める

defer\_spec.ts の先頭（1〜252 行目）には、この spec だけで使う道具が並びます。中身は各章で引用しているので、ここでは名前・行・どの章で読むかの表にします（`grep -n` で確かめた行です）。

| 道具 | 行 | 何をするか | 読む章 |
| --- | --- | --- | --- |
| `clearDirectiveDefs(type)` | 62 | JIT では塊の中の依存も最初から読み込まれるので、コンポーネントの定義から依存を消して「まだ読み込んでいない」ことにする | [第 1 回](01-defer-overview.md) |
| `dynamicImportOf(type, timeout)` | 75 | `setTimeout` のあとで解ける Promise で `import()` の代わりをする（`whenStable` がマクロタスクを待つため） | [第 1 回](01-defer-overview.md) |
| `failedDynamicImport()` | 84 | `setTimeout` のあとで reject する Promise | [第 6 回](06-defer-resource-loading.md) |
| `allPendingDynamicImports()` | 94 | 10 ms 待つ（defer\_spec.ts）。incremental\_hydration\_spec.ts の同じ名前の関数は 101 ms 待つ | — |
| `verifyTimeline(fixture, [時刻, 期待], …)` | 104 | 本物の `timeout` で時間を進めながら、時刻ごとの表示を確かめる（`fakeAsync` を使わない） | [第 5 回](05-defer-minimum-after.md) |
| `FakeTimerScheduler` | 147 | `TimerScheduler` の代わり。`invoke()` で積んだ関数を全部呼ぶ | [第 10 回](10-defer-timer.md) |
| `createFixture(template)` と `ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR` | 187・222 | 依存を読み込む関数を包み、`dynamicImportOf(NestedCmp, loadingTimeout)` を返させて、読み込みにかかる時間を it ごとに決める | [第 3 回](03-defer-details.md) |
| `COMMON_PROVIDERS` | 248 | `PLATFORM_ID` を `PLATFORM_BROWSER_ID` にする。Node でもトリガーが付く | — |

> [!TIP]
> **新卒エンジニアへ**
>
> `ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR` は、開発モードのときだけ、依存を読み込む関数（`dependencyResolverFn`）を `intercept(fn)` の戻り値に取り替える仕組みです（[第 6 回](06-defer-resource-loading.md)）。元の関数が `null`（JIT で依存が全部 eager のとき）でも、戻り値の関数が呼ばれます。だから「止める」「遅らせる」「失敗させる」のどれも、この 1 つで書けます。このシリーズの記録のスクリプト（第 17 回の queue.ts など）も同じ仕組みで、読み込みの回数を数え、2 回目だけを失敗させています。

## 4. trigger resolution：トリガーの要素がどこにあっても見つかるか

📄 `angular/packages/core/test/acceptance/defer_spec.ts` L2893–2923 （▶ の行: 2893, 2896, 2905, 2915–2917, 2919–2922）

```ts
2893 ▶     it('should resolve a trigger is outside the defer block', async () => {
2894 │       @Component({
2895 │         template: `
2896 ▶           @defer (on interaction(trigger)) {
2897 │             Main content
2898 │           } @placeholder {
2899 │             Placeholder
2900 │           }
2901 │ 
2902 │           <div>
2903 │             <div>
2904 │               <div>
2905 ▶                 <button #trigger></button>
2906 │               </div>
2907 │             </div>
2908 │           </div>
2909 │         `,
2910 │ 
2911 │         changeDetection: ChangeDetectionStrategy.Eager,
2912 │       })
2913 │       class MyCmp {}
2914 │ 
2915 ▶       const fixture = TestBed.createComponent(MyCmp);
2916 ▶       fixture.detectChanges();
2917 ▶       expect(fixture.nativeElement.textContent.trim()).toBe('Placeholder');
2918 │ 
2919 ▶       fixture.nativeElement.querySelector('button').click();
2920 ▶       fixture.detectChanges();
2921 ▶       await fixture.whenStable();
2922 ▶       expect(fixture.nativeElement.textContent.trim()).toBe('Main content');
2923 │     });
```

7 個の it は、どれもこの形です。2896 行目の `on interaction(trigger)` の `trigger` は、2905 行目の `#trigger` のテンプレート参照です。2916〜2917 行目で placeholder が出ていることを確かめ、2919 行目でボタンを `click()` し、2920〜2921 行目で変更検知と安定を待って、2922 行目で本体が出ていることを確かめます。依存の無い本体なので、interceptor は使っていません。7 個の違いは、`#trigger` の置き場所だけです。

| 行 | it | #trigger の場所 |
| --- | --- | --- |
| 2893 | should resolve a trigger is outside the defer block | 塊の外の、深い div の中 |
| 2925 | should resolve a trigger on a component outside the defer block | 塊の外のコンポーネント（参照はホストの要素） |
| 2965 | should resolve a trigger that is on a parent element | 塊を囲む親の要素 |
| 2995 | should resolve a trigger that is inside a parent embedded view | 外側の `@if` の中（塊は 2 段下の `@if` の中） |
| 3029 | should resolve a trigger that is on a component in a parent embedded view | 同じで、コンポーネント |
| 3071 | should resolve a trigger that is inside the placeholder | 塊の `@placeholder` の中 |
| 3100 | should resolve a trigger that is a component inside the placeholder | 同じで、コンポーネント |

📄 `angular/packages/core/test/acceptance/defer_spec.ts` L3071–3098 （▶ の行: 3074, 3076, 3080, 3092, 3094, 3097）

```ts
3071 │     it('should resolve a trigger that is inside the placeholder', async () => {
3072 │       @Component({
3073 │         template: `
3074 ▶           @defer (on interaction(trigger)) {
3075 │             Main content
3076 ▶           } @placeholder {
3077 │             Placeholder
3078 │             <div>
3079 │               <div>
3080 ▶                 <div><button #trigger></button></div>
3081 │               </div>
3082 │             </div>
3083 │           }
3084 │         `,
3085 │ 
3086 │         changeDetection: ChangeDetectionStrategy.Eager,
3087 │       })
3088 │       class MyCmp {}
3089 │ 
3090 │       const fixture = TestBed.createComponent(MyCmp);
3091 │       fixture.detectChanges();
3092 ▶       expect(fixture.nativeElement.textContent.trim()).toBe('Placeholder');
3093 │ 
3094 ▶       fixture.nativeElement.querySelector('button').click();
3095 │       fixture.detectChanges();
3096 │       await fixture.whenStable();
3097 ▶       expect(fixture.nativeElement.textContent.trim()).toBe('Main content');
3098 │     });
```

3080 行目の `#trigger` は 3076 行目の `@placeholder` の中、つまり塊の LContainer の中のビューにあります。参照の探し方（外のビューへ上るか、placeholder のビューの中を見るか）は[第 11 回](11-defer-dom-triggers.md)で読みます。参照がどこにあるかで探す LView が変わるので、置き場所ごとに it があります。トリガーの探し方を直したときは、この 7 個がそのまま回帰の確かめになります。

## 5. incremental\_hydration\_spec.ts の書き方：サーバー → ブラウザを 1 つの it で

📄 `angular/packages/platform-server/test/hydration_utils.ts` L238–277 （▶ の行: 257, 261, 263–264, 267–268, 270, 275）

```ts
238 │ /**
239 │  * This renders the application with server side rendering logic.
240 │  *
241 │  * @param component the test component to be rendered
242 │  * @param doc the document
243 │  * @param envProviders the environment providers
244 │  * @returns a promise containing the server rendered app as a string
245 │  */
246 │ export async function ssr(
247 │   component: Type<unknown>,
248 │   options: {
249 │     doc?: string;
250 │     envProviders?: Provider[];
251 │     hydrationFeatures?: () => HydrationFeature<HydrationFeatureKind>[];
252 │     enableHydration?: boolean;
253 │   } = {},
254 │ ): Promise<string> {
255 │   try {
256 │     // Enter server mode for the duration of this function.
257 ▶     globalThis['ngServerMode'] = true;
258 │ 
259 │     const defaultHtml = DEFAULT_DOCUMENT;
260 │     const {enableHydration = true, envProviders = [], hydrationFeatures = () => []} = options;
261 ▶     const providers = [
262 │       ...envProviders,
263 ▶       provideServerRendering(),
264 ▶       enableHydration ? provideClientHydration(...hydrationFeatures()) : [],
265 │     ];
266 │ 
267 ▶     const bootstrap = (context: BootstrapContext) =>
268 ▶       bootstrapApplication(component, {providers}, context);
269 │ 
270 ▶     return await renderApplication(bootstrap, {
271 │       document: options?.doc ?? defaultHtml,
272 │     });
273 │   } finally {
274 │     // Leave server mode so the remaining test is back in "client mode".
275 ▶     globalThis['ngServerMode'] = undefined;
276 │   }
277 │ }
```

1. **257 行目と 275 行目：この関数の間だけ ngServerMode を立てる**

   サーバーとブラウザを同じ Node で動かすので、`ngServerMode` を立ててから 263〜264 行目の providers を作り、270 行目でサーバーとして描きます。`provideClientHydration` は呼ばれた時点の `ngServerMode` でサーバー用かブラウザ用かを分けるので、263〜265 行目は 257 行目より後にある必要があります。このシリーズの記録のスクリプトも同じ順にしています（最初に逆にして、サーバーの描画がブラウザ用のハイドレーションで動いてしまいました）。
2. **ブラウザの側は dom\_utils.ts の prepareEnvironmentAndHydrate**

   サーバーの HTML を Node の DOM に入れ、`window.__jsaction_bootstrap` の 1 行を `eval` し、`PLATFORM_ID` を `'browser'` にして `bootstrapApplication` します。spec の先頭の `beforeAll` は、JSAction の契約のスクリプト（`contract_bundle_min.js`）を読み込んでいます。間で `resetTViewsFor(…)` を呼んで、サーバーで作った TView を捨てます。

📄 `angular/packages/platform-server/test/incremental_hydration_spec.ts` L2489–2520 （▶ の行: 2494, 2498, 2500, 2516–2518）

```ts
2489 │       @Component({
2490 │         selector: 'app',
2491 │         imports: [NestedCmp],
2492 │         template: `
2493 │           <main>
2494 ▶             @defer (on interaction; hydrate on interaction) {
2495 │               <article id="item">
2496 │                 <nested-cmp [block]="'primary'" />
2497 │               </article>
2498 ▶             } @placeholder {
2499 │               <span>Outer block placeholder</span>
2500 ▶             } @error {
2501 │               <p>Failed to load dependencies :(</p>
2502 │               <nested-cmp [block]="'error'" />
2503 │             }
2504 │           </main>
2505 │         `,
2506 │       })
2507 │       class SimpleComponent {
2508 │         @ViewChildren(NestedCmp) cmps!: QueryList<NestedCmp>;
2509 │         value = signal('start');
2510 │         fnA() {}
2511 │         fnB() {
2512 │           this.value.set('end');
2513 │         }
2514 │       }
2515 │ 
2516 ▶       const deferDepsInterceptor = {
2517 ▶         intercept() {
2518 ▶           return () => [failedDynamicImport()];
2519 │         },
2520 │       };
```

📄 `angular/packages/platform-server/test/incremental_hydration_spec.ts` L2526–2560 （▶ の行: 2526, 2529–2530, 2533, 2537, 2541, 2546–2547, 2550, 2552, 2554–2555, 2557, 2559–2560）

```ts
2526 ▶       const html = await ssr(SimpleComponent, {envProviders: providers, hydrationFeatures});
2527 │       const ssrContents = getAppContents(html);
2528 │ 
2529 ▶       expect(ssrContents).toContain('<article id="item" jsaction="click:;keydown:;"');
2530 ▶       expect(ssrContents).toContain('Rendering primary block');
2531 │ 
2532 │       // Internal cleanup before we do server->client transition in this test.
2533 ▶       resetTViewsFor(SimpleComponent);
2534 │ 
2535 │       ////////////////////////////////
2536 │       const doc = getDocument();
2537 ▶       const appRef = await prepareEnvironmentAndHydrate(doc, html, SimpleComponent, {
2538 │         envProviders: [
2539 │           ...providers,
2540 │           {provide: PLATFORM_ID, useValue: 'browser'},
2541 ▶           {provide: ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR, useValue: deferDepsInterceptor},
2542 │         ],
2543 │         hydrationFeatures,
2544 │       });
2545 │       const compRef = getComponentRef<SimpleComponent>(appRef);
2546 ▶       appRef.tick();
2547 ▶       await appRef.whenStable();
2548 │ 
2549 │       const appHostNode = compRef.location.nativeElement;
2550 ▶       expect(appHostNode.outerHTML).toContain('Rendering primary block');
2551 │ 
2552 ▶       const article = doc.getElementById('item')!;
2553 │       const clickEvent = new CustomEvent('click', {bubbles: true});
2554 ▶       article.dispatchEvent(clickEvent);
2555 ▶       await allPendingDynamicImports();
2556 │ 
2557 ▶       appRef.tick();
2558 │ 
2559 ▶       expect(appHostNode.outerHTML).not.toContain('Rendering primary block');
2560 ▶       expect(appHostNode.outerHTML).toContain('Rendering error block');
```

1. **2516〜2520 行目：読み込みを必ず失敗させる interceptor**

   ファイルの先頭の `failedDynamicImport()`（defer\_spec.ts の同じ名前の道具と同じ形）を返します。2541 行目でブラウザの側にだけ入れるので、サーバーでは普通に描かれます（2529〜2530 行目）。
2. **2546〜2547 行目：最初のハイドレーションを済ませる**

   ここで塊はまだ眠っていて、2550 行目のとおりサーバーの HTML の本体が見えています。
3. **2552〜2557 行目：塊の中で click を起こし、読み込みの失敗を待つ**

   2554 行目の click が[第 18 回](18-defer-hydrate-events.md)の道に入り、2555 行目の `allPendingDynamicImports()`（101 ms）で reject を待ちます。
4. **2559〜2560 行目：本体が消え、@error が出たか**

   [第 17 回](17-defer-hydration-queue.md)の 4 節の `removeDehydratedViewList` と Error の状態の描画を、DOM の文字で確かめています。登録簿や `hydrating` は見ていません。

📄 `angular/packages/core/src/hydration/incremental_runtime.ts` L108–117 （▶ の行: 109–110, 113–116）

```ts
108 │ /**
109 ▶  * Resets module-level runtime activation for tests that run SSR and client hydration in the same
110 ▶  * process. This is not a full hydration reset and should only be used when cold client activation
111 │  * is part of the behavior under test.
112 │  */
113 ▶ export function resetIncrementalHydrationRuntimeForTests(): void {
114 ▶   isIncrementalHydrationRuntimeActive = false;
115 ▶   _dehydratedBlockRegistryFactory = () => null;
116 ▶   _runIncrementalHydrationBootstrap = () => {};
117 │ }
```

📄 `angular/packages/platform-server/test/incremental_hydration_spec.ts` L3136–3145 （▶ の行: 3136–3139, 3142）

```ts
3136 ▶       resetTViewsFor(SimpleComponent, LazyCmp);
3137 ▶       // The immediate trigger is nested in a lazy route, so verify that it is discovered with a
3138 ▶       // cold client runtime.
3139 ▶       resetIncrementalHydrationRuntimeForTests();
3140 │ 
3141 │       const doc = getDocument();
3142 ▶       const appRef = await prepareEnvironmentAndHydrate(doc, html, SimpleComponent, {
3143 │         envProviders: [...providers],
3144 │         hydrationFeatures,
3145 │       });
```

インクリメンタルハイドレーションの命令は、最初に呼ばれたときにモジュールの変数を本物に差し替えます（incremental-hydration の章の 2 節）。サーバーとブラウザを同じプロセスで動かす spec では、サーバーの描画で差し替わったままになるので、「ブラウザで初めて動く」場面を確かめたい it だけが、3139 行目で 113〜117 行目の関数を呼んで元に戻します。109〜111 行目のコメントのとおり、ハイドレーションの全部を戻すものではありません。

## 6. defer\_fixture\_spec.ts：PendingTasks が残っていても待ち続けない

📄 `angular/packages/core/test/defer_fixture_spec.ts` L168–198 （▶ の行: 168, 181, 183, 190, 194, 196–197）

```ts
168 ▶   it('should not wait forever if application is unstable for a long time', async () => {
169 │     @Component({
170 │       selector: 'defer-comp',
171 │       imports: [SecondDeferredComp],
172 │       template: `
173 │         <div>
174 │           @defer (on immediate) {
175 │             <second-deferred-comp />
176 │           }
177 │         </div>
178 │       `,
179 │     })
180 │     class DeferComp {
181 ▶       constructor(taskService: PendingTasksInternal) {
182 │         // Add a task and never remove it. Keeps application unstable forever
183 ▶         taskService.add();
184 │       }
185 │     }
186 │ 
187 │     TestBed.configureTestingModule({
188 │       imports: [DeferComp, SecondDeferredComp],
189 │       providers: COMMON_PROVIDERS,
190 ▶       deferBlockBehavior: DeferBlockBehavior.Manual,
191 │     });
192 │ 
193 │     const componentFixture = TestBed.createComponent(DeferComp);
194 ▶     const deferBlock = (await componentFixture.getDeferBlocks())[0];
195 │     const el = componentFixture.nativeElement as HTMLElement;
196 ▶     await deferBlock.render(DeferBlockState.Complete);
197 ▶     expect(el.querySelector('.more')).toBeDefined();
198 │   });
```

`DeferBlockFixture` の仕組みと、ほかの it は[testing-defer の章](../testing/18-testing-defer.md)で読みます。ここでは 1 つだけ。183 行目で PendingTasks を足したまま戻さないので、このアプリは一度も安定しません。それでも 196 行目の `render(DeferBlockState.Complete)` が返ってくることを確かめています。[第 17 回](17-defer-hydration-queue.md)の 7 節のように PendingTasks が戻らない不具合を spec で書くときは、`whenStable()` をそのまま `await` すると it がタイムアウトで落ちるだけなので、次の節のように時間を区切って「安定したか」を値にします。

## 7. @defer の不具合を spec の形で再現する手順

[第 17 回](17-defer-hydration-queue.md)の 7 節の「`@error` の無い hydrate の塊の読み込みが失敗すると、アプリが安定に戻らない」を例に、手順を通して書きます。

1. **一番近い既存の it を探す**

   2 節の地図で `control flow` を開き、`should render an error block when loading fails and cleanup the original content`（2480 行目）を見つけます。5 節で読んだとおり、hydrate on interaction の塊・失敗する interceptor・click がそろっています。
2. **違いを 1 つだけにする**

   テンプレートから `@error` の塊（2500〜2503 行目）だけを外します。ほかは同じにします。違いが 1 つなら、結果の違いの原因もそれだけです。
3. **「正しい」を値で書く**

   もとの it は DOM の文字を見ていますが、この不具合は「安定に戻らない」ことなので、`whenStable()` と `timeout(1000)` の早い方を値にして、`true` を期待します。`hydrating` が空になることも確かめます（6 節）。NG0750 が `ErrorHandler` に届くので、下の 209〜221 行目の `withNoopErrorHandler()` で受け止めます。
4. **手元で走らせる**

   ../angular は変更しないので、spec は下に書くだけです。代わりに、共通の harness で同じ手順（サーバーで描く → domino でハイドレート → interceptor で失敗 → click → 101 ms 待つ）を Node で走らせ、`@error` がある形とない形を比べます。
5. **main と issue を確かめる**

   8576f161ae4 より新しい main の `rendering.ts` を `gh api 'repos/angular/angular/contents/…?ref=main'` で読み、手元と同じであることを確かめます（2026-11-06、差分なし）。`gh search issues` で同じ報告を探します。近いのは #71769 と PR #71798 ですが、`await` が解けない形は扱っていません（[第 20 回](20-defer-issues.md)）。

📄 `angular/packages/platform-server/test/hydration_utils.ts` L209–221 （▶ の行: 209–211, 216–217）

```ts
209 ▶ export function withNoopErrorHandler() {
210 ▶   class NoopErrorHandler extends ErrorHandler {
211 ▶     override handleError(error: any): void {
212 │       // noop
213 │     }
214 │   }
215 │   return [
216 ▶     {
217 ▶       provide: ErrorHandler,
218 │       useClass: NoopErrorHandler,
219 │     },
220 │   ];
221 │ }
```

📄 `spec の形で書いた再現（本文に書くだけで、走らせていない）`

```
// packages/platform-server/test/incremental_hydration_spec.ts の describe('control flow') に足すとしたら
// （2480 行目の it をもとに、@error だけを外し、確かめることを「安定に戻るか」に替えた）
it('should finish hydration when loading fails and there is no @error block', async () => {
  @Component({
    selector: 'nested-cmp',
    template: 'Rendering {{ block }} block.',
  })
  class NestedCmp {
    @Input() block!: string;
  }

  @Component({
    selector: 'app',
    imports: [NestedCmp],
    template: `
      <main>
        @defer (on interaction; hydrate on interaction) {
          <article id="item">
            <nested-cmp [block]="'primary'" />
          </article>
        } @placeholder {
          <span>Outer block placeholder</span>
        }
      </main>
    `,
  })
  class SimpleComponent {
    registry = inject(DEHYDRATED_BLOCK_REGISTRY);
  }

  const deferDepsInterceptor = {
    intercept() {
      return () => [failedDynamicImport()];
    },
  };

  const appId = 'custom-app-id';
  const providers = [{provide: APP_ID, useValue: appId}];
  const hydrationFeatures = () => [withIncrementalHydration()];

  const html = await ssr(SimpleComponent, {envProviders: providers, hydrationFeatures});
  resetTViewsFor(SimpleComponent);

  const doc = getDocument();
  const appRef = await prepareEnvironmentAndHydrate(doc, html, SimpleComponent, {
    envProviders: [
      ...providers,
      {provide: PLATFORM_ID, useValue: 'browser'},
      {provide: ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR, useValue: deferDepsInterceptor},
      ...withNoopErrorHandler(), // NG0750 を ErrorHandler で受け止める（hydration_utils.ts から import に足す）
    ],
    hydrationFeatures,
  });
  const compRef = getComponentRef<SimpleComponent>(appRef);
  appRef.tick();
  await appRef.whenStable();

  doc.getElementById('item')!.dispatchEvent(new CustomEvent('click', {bubbles: true}));
  await allPendingDynamicImports();
  appRef.tick();

  // 失敗しても列が終わり、PendingTasks が戻って、アプリが安定に戻ること
  const stable = await Promise.race([
    appRef.whenStable().then(() => true),
    timeout(1000).then(() => false),
  ]);
  expect(stable).toBe(true);
  expect(compRef.instance.registry.hydrating.size).toBe(0);
});
```

> **🧪 記録 — 同じ手順を harness で走らせた結果（記録の再生）**
>
> これは記録です。本物の @angular/core 22.1.6（開発モード・JIT）を Node で、domino の DOM の上で動かした結果です。テンプレートは spec の 2493〜2504 行目と同じ形と、そこから `@error` を外した形で、interceptor は `setTimeout` のあとで reject する Promise を返します。click のあと 101 ms 待ってから `appRef.tick()` し、1000 ms のうちに安定したかを残しました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/defer-tests)

- `@error` がある形は、もとの it と同じく本体が消えて `@error` が出て、安定に戻り、登録簿も `hydrating` も空になりました。拾われなかった reject が 1 つあるのは、[第 17 回](17-defer-hydration-queue.md)の 4 節の `cleanupRemainingHydrationQueue` で reject した Promise を、だれも受け取っていないものです。
- `@error` の無い形は、NG0750 が `ErrorHandler` に届いたあと、1 秒たっても安定せず、`d0` が登録簿と `hydrating` に残り、jsaction も残りました（記録の `html`）。

📄 `scratchpad の記録スクリプト（repro.ts、共通の build.mjs で束ねて node で実行。共通の harness.ts は第 1 回に全文）`

```
// 第 19 回 defer-tests の「spec の形で再現する」の記録。
// incremental_hydration_spec.ts の 'should render an error block when loading fails and cleanup the original content'
// と同じ形（hydrate on interaction・読み込みを失敗させる DEFER_BLOCK_DEPENDENCY_INTERCEPTOR）で、
// @error の塊が「ある」ときと「無い」ときに、クリックのあとアプリが安定に戻るかを比べる。
// ../angular は変更しないので、spec の代わりに共通の harness で同じ手順を Node で走らせる。
// 使い方: node ../_shared/build.mjs repro.ts repro.mjs && node repro.mjs repro.json
import '@angular/compiler';
import {
  Component, ErrorHandler, Input, VERSION, ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR as DEFER_BLOCK_DEPENDENCY_INTERCEPTOR,
  ɵDEHYDRATED_BLOCK_REGISTRY as DEHYDRATED_BLOCK_REGISTRY,
} from '@angular/core';
import { provideClientHydration, withIncrementalHydration } from '@angular/platform-browser';
import { readFileSync } from 'node:fs';
import { installDom, bootBrowser, renderServer, tick, writeJson } from '../_shared/harness';

const OUT = process.argv[2] ?? new URL('./repro.json', import.meta.url).pathname;
const SITE = '~/angular-research/angular-deep-dive';
const unhandled: string[] = [];
process.on('unhandledRejection', (r) => unhandled.push(String(r)));

@Component({ selector: 'nested-cmp', template: 'Rendering {{ block }} block.' })
class NestedCmp { @Input() block!: string; }

// spec の 2493〜2504 行目のテンプレートと同じ形（@error あり）と、そこから @error だけを除いた形。
const WITH_ERROR = `<main>
  @defer (on interaction; hydrate on interaction) {
    <article id="item">
      <nested-cmp [block]="'primary'" />
    </article>
  } @placeholder {
    <span>Outer block placeholder</span>
  } @error {
    <p>Failed to load dependencies :(</p>
    <nested-cmp [block]="'error'" />
  }
</main>`;
const WITHOUT_ERROR = `<main>
  @defer (on interaction; hydrate on interaction) {
    <article id="item">
      <nested-cmp [block]="'primary'" />
    </article>
  } @placeholder {
    <span>Outer block placeholder</span>
  }
</main>`;
@Component({ selector: 'app-root', imports: [NestedCmp], template: WITH_ERROR })
class WithError {}
@Component({ selector: 'app-root', imports: [NestedCmp], template: WITHOUT_ERROR })
class WithoutError {}

// NG0750（@error が無いときの読み込み失敗）を数えるだけの ErrorHandler。
class CountingErrorHandler extends ErrorHandler {
  static errors: string[] = [];
  override handleError(e: any) { CountingErrorHandler.errors.push(String(e?.message ?? e).split('\n')[0]); }
}

async function run(Root: any, label: string) {
  for (const t of [Root, NestedCmp]) t.ɵcmp.tView = null;
  CountingErrorHandler.errors = []; unhandled.length = 0;
  (globalThis as any).ngServerMode = true;
  const serverHydration = provideClientHydration(withIncrementalHydration());
  const html = await renderServer(Root, { providers: [serverHydration], html: '<html><head></head><body><script type="text/javascript" id="ng-event-dispatch-contract"></script><app-root></app-root></body></html>' });
  (globalThis as any).ngServerMode = undefined;
  for (const t of [Root, NestedCmp]) t.ɵcmp.tView = null;

  const doc = installDom(html);
  (0, eval)(readFileSync(`${SITE}/node_modules/@angular/core/event-dispatch-contract.min.js`, 'utf8'));
  for (const s of Array.from(doc.querySelectorAll('script'))) if (s.textContent?.startsWith('window.__jsaction_bootstrap')) (0, eval)(s.textContent);
  const interceptor = { intercept: () => () => [new Promise((_, reject) => setTimeout(() => reject(new Error('chunk failed'))))] };
  const { appRef, ref } = await bootBrowser(Root, {
    providers: [provideClientHydration(withIncrementalHydration()), { provide: DEFER_BLOCK_DEPENDENCY_INTERCEPTOR, useValue: interceptor }, { provide: ErrorHandler, useClass: CountingErrorHandler }],
  });
  const registry: any = appRef.injector.get(DEHYDRATED_BLOCK_REGISTRY);
  doc.getElementById('item')!.dispatchEvent(new (globalThis as any).CustomEvent('click', { bubbles: true }));
  await tick(101); // spec の allPendingDynamicImports() と同じ 101ms
  appRef.tick();
  const stable = await Promise.race([appRef.whenStable().then(() => true), tick(1000).then(() => false)]);
  const host = (ref.location.nativeElement as Element).innerHTML.replace(/<!--[^>]*-->/g, '').replace(/\s+/g, ' ').trim();
  const result = {
    label,
    stableWithin1s: stable,
    html: host,
    registry: [...registry.registry.keys()],
    hydrating: [...registry.hydrating.keys()],
    errorHandler: [...CountingErrorHandler.errors],
    unhandledRejections: [...unhandled],
  };
  appRef.destroy();
  return result;
}

const results = [await run(WithError, '@error あり'), await run(WithoutError, '@error なし')];
await writeJson(OUT, { core: VERSION.full, templates: { withError: WITH_ERROR, withoutError: WITHOUT_ERROR }, results });
process.exit(0);

```

## テストと直し方

- 新しい it を足す場所は、2 節の地図で、直したい行の章に対応する describe を選ぶのが近道です。トリガーの不具合は defer\_spec.ts の各トリガーの describe、ハイドレーションの不具合は incremental\_hydration\_spec.ts の `triggers`・`control flow`・`cleanup` です。
- 依存の読み込みは `ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR` で、時間は `dynamicImportOf` の `timeout` と本物の `timeout` で決めます。最近の main では `fakeAsync` をやめる書き換えが進んでいます（c1025a05105「Migrate more tests off \`fakeAsync\`」、2026-07-27）。#61233（`fakeAsync` と `on timer` の組み合わせ）は、直さない（not planned）として閉じられました（[第 20 回](20-defer-issues.md)）。
- incremental\_hydration\_spec.ts では、`ssr()` の前後の `ngServerMode`、`resetTViewsFor`、必要なら `resetIncrementalHydrationRuntimeForTests()` の 3 つを忘れないようにします。[第 18 回](18-defer-hydrate-events.md)で見たように、既存の it の `expect` が別の要素を見ていないかも確かめます。
- 本家に PR を出すことは勧めません。spec の形にしておくと、issue を読むときに「どの行で止まるか」を手元で確かめる手がかりになります。

## 聞かれそうな質問

**Q. defer\_spec.ts の it は 109 個なのに、走らせると @defer だけで 95 件になるのはなぜですか？**

書いてある it は `@defer` の describe に 94 個、`IdleScheduler` に 15 個ですが、`error handling > with ngDevMode` の it が `[true, false].forEach` の中で 2 回作られるからです。`^@defer ` で絞ると `Ran 95 of 2693 specs`、`^IdleScheduler` で 15 件でした。

**Q. TestBed（JIT）で @defer の「読み込み中」を確かめられるのはなぜですか？**

JIT では塊の中の依存も最初から読み込まれますが、`clearDirectiveDefs` でコンポーネントの定義から依存を消し、`ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR` で読み込みの関数を `dynamicImportOf` を返すものに取り替えるからです（3 節の表の `createFixture`。中身は第 3 回）。

**Q. サーバーで描いてからハイドレートする spec を、1 つのプロセスで書けるのはなぜですか？**

hydration\_utils.ts の `ssr()` が 257 行目で `ngServerMode` を立て、270 行目でサーバーとして描いてから、275 行目で戻すからです。その HTML を dom\_utils.ts の `prepareEnvironmentAndHydrate` がブラウザの側として起動します。モジュールの変数を戻したいときは `resetIncrementalHydrationRuntimeForTests()`（incremental\_runtime.ts 113〜117 行目）を呼びます。

**Q. trigger resolution の 7 個の it は何が違うのですか？**

`on interaction(trigger)` の `#trigger` の置き場所だけです。塊の外・外のコンポーネント・親の要素・外の `@if` の中・placeholder の中などで、参照を探す LView が変わるので、それぞれ確かめています（4 節の表）。

**Q. アプリが安定しない不具合は、spec でどう確かめますか？**

`whenStable()` をそのまま `await` すると it がタイムアウトで落ちるだけなので、`timeout(1000)` と競わせて「安定したか」を値にし、`expect(stable).toBe(true)` と書きます。7 節の再現の spec がこの形です。

## 読み終えて

- @defer の spec は 3 つ。defer\_spec.ts（TestBed、109 個）、incremental\_hydration\_spec.ts（サーバー → ハイドレート、41 個）、defer\_fixture\_spec.ts（`DeferBlockFixture`、14 個）です。
- 絞り込みは it の名前全体への正規表現で、0 件でも PASSED になります。`Ran N of M` を見ます。shard があるのは `//packages/core/test:test` です。
- 読み込みは `ɵDEFER_BLOCK_DEPENDENCY_INTERCEPTOR` で止め・遅らせ・失敗させ、時間は本物の `timeout` で進めます。
- ハイドレーションの spec は `ssr()` → `resetTViewsFor` → `prepareEnvironmentAndHydrate` の順で 1 つの it に書けます。
- 不具合の再現は、一番近い it から違いを 1 つだけにし、「正しい」を値で書いてから、手元で確かめます。

---

← 前: [hydrate on interaction のイベント：jsaction から塊のハイドレーションへ](18-defer-hydrate-events.md)  
次: [issue と PR を読む：@defer とインクリメンタルハイドレーションの今](20-defer-issues.md) →
