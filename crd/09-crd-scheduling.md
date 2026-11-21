[目次](../README.md) › [core の説明文の読み残し](README.md) › 第 9 回 / 全 10 回

# 変更検知のスケジューラーの説明文：provideZoneChangeDetection と zoneless

> change\_detection/scheduling/ng\_zone\_scheduling.ts・zoneless\_scheduling\_impl.ts の未読の行：provideZoneChangeDetection と bootstrapModule、eventCoalescing と runCoalescing、provideZonelessChangeDetection が挙げる 7 つの API と NG0914・NG0408 の警告。小さなアプリの tick を数えた記録で確かめる。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/crd-scheduling)

---

この章で分かること：`provideZoneChangeDetection` と `NgZoneOptions`（`eventCoalescing`・`runCoalescing`）、`provideZonelessChangeDetection` の説明文が約束していることを、小さなアプリを bootstrap して `ApplicationRef` の tick（変更検知の 1 回）を数えて確かめます。説明文の数（2 回と 1 回、何度もと 1 回）と、zoneless の説明文が挙げる 7 つの API は、全部そのとおりに tick を起こしました。合わなかったのは、内部のコメント 2 つ（`PROVIDED_NG_ZONE` と `tick` の `@param`）と、`runCoalescing` の「requestAnimationFrame で走る」の言い方です。

読む対象は `packages/core/src/change_detection/scheduling/` の `ng_zone_scheduling.ts`・`zoneless_scheduling_impl.ts`・`zoneless_scheduling.ts`（../angular、8576f161ae4）の説明文です。実装の行は既存の章が読んでいます。`provideZoneChangeDetection` が provide する物と `NgZoneChangeDetectionScheduler` は[NgZoneChangeDetectionScheduler の章](../zone/11-zone-ngzone-scheduler.md)、2 つの coalescing の仕組みは[eventCoalescing / runCoalescing の章](../zone/12-zone-coalescing.md)、zoneless が既定になった経緯は[zoneless は既定になったの章](../zoneless/01-zoneless-default.md)、通知が tick の予約になるまでは[notify の章](../zoneless/03-zoneless-notify.md)、zone.js と同居するときは[ハイブリッドの章](../zoneless/10-zoneless-hybrid.md)にあります。

1. [1. @Directive](01-crd-directive.md)
2. [2. @Component](02-crd-component.md)
3. [3. クエリと @NgModule](03-crd-query-module.md)
4. [4. @Injectable・InjectionToken](04-crd-injectable-token.md)
5. [5. Provider の形](05-crd-provider.md)
6. [6. inject と Injector](06-crd-inject.md)
7. [7. ライフサイクル](07-crd-lifecycle.md)
8. [8. differ](08-crd-differs.md)
9. **9. スケジューラー**（この章）
10. [10. spec と issue](10-crd-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 「スケジューラー」は、変更検知（`ApplicationRef` の `_tick`）をいつ走らせるかを決める物です。zone.js のアプリでは `NgZone` の「マイクロタスクが空になった」（`onMicrotaskEmpty`）のたびに、zoneless のアプリでは Angular の API からの通知を受けて予約します。このサイトは zoneless で動いているので、ページの上でもう 1 つのアプリを作ったり zone.js を読み込んだりはしません。この章の表は全部、Node（domino の上の JIT）で録った記録の再生です。

## 1. provideZoneChangeDetection：NgModule のアプリでも applicationProviders で

📄 `angular/packages/core/src/change_detection/scheduling/ng_zone_scheduling.ts` L132–152 （▶ の行: 134–135, 137–138, 140, 144–146）

````ts
132 │ 
133 │ /**
134 ▶  * Provides `NgZone`-based change detection for the application bootstrapped using
135 ▶  * `bootstrapApplication`.
136 │  *
137 ▶  * Add this provider to use `NgZone`/ZoneJS-based change detection and configure options like
138 ▶  * `eventCoalescing` in the `NgZone`.
139 │  *
140 ▶  * If you need this provider function in an NgModule-based application, pass it as `applicationProviders` to `bootstrapModule()`.
141 │  *
142 │  * @usageNotes
143 │  * ```ts
144 ▶  * bootstrapApplication(MyApp, {providers: [
145 ▶  *   provideZoneChangeDetection({eventCoalescing: true}),
146 ▶  * ]});
147 │  * ```
148 │  *
149 │  * @publicApi
150 │  * @see {@link /api/platform-browser/bootstrapApplication bootstrapApplication}
151 │  * @see {@link NgZoneOptions}
152 │  */
````

137〜138 行目のとおり、この関数は `NgZone` と zone のスケジューラーを provide し（中身は[NgZoneChangeDetectionScheduler の章](../zone/11-zone-ngzone-scheduler.md)の 1 節）、`NgZoneOptions` を `NgZone` の constructor に渡します。140 行目は a2d5048ff38（2026-02-23、`` docs: update doc for `provideZoneChangeDetection` ``、#67209「v21 への移行が書き込む物と説明文が食い違う」への対応）で、それまでの「`bootstrapModule` では使えず、`BootstrapOptions` を使う」を置き換えた文です。手元の記録で `platformBrowser().bootstrapModule(Mod, {applicationProviders: [provideZoneChangeDetection({eventCoalescing: true})]})` とすると、注入器の `NgZone` は本物の `NgZone` で、`shouldCoalesceEventChangeDetection` は `true`、警告は 0 でした。

📄 `angular/packages/core/src/change_detection/scheduling/ng_zone_scheduling.ts` L74–83 （▶ の行: 75–77, 79, 81）

```ts
74 │ 
75 ▶ /**
76 ▶  * Internal token used to verify that `provideZoneChangeDetection` is not used
77 ▶  * with the bootstrapModule API.
78 │  */
79 ▶ export const PROVIDED_NG_ZONE = new InjectionToken<boolean>(
80 │   typeof ngDevMode === 'undefined' || ngDevMode ? 'provideZoneChangeDetection token' : '',
81 ▶   {factory: () => false},
82 │ );
83 │ 
```

ところが 75〜77 行目の内部のコメントは、`PROVIDED_NG_ZONE` を「`provideZoneChangeDetection` が `bootstrapModule` と一緒に使われていないかを確かめるため」と書いたままです。この token を読むのは platform/bootstrap.ts の L96 だけで、そこでは「zone と zoneless の両方が provide されていたら警告」に使います（4 節の表の NG0408）。`bootstrapModule` を確かめる処理はありません。このコメントは d7d6514add2（2023-03-08、``feat(core): Add ability to configure `NgZone` in `bootstrapApplication` (#49557)``）のころの文で、84b2351d50f（2024-05-15）で使い道が変わったあとも残っています。新しい本家（origin/main の d201dd76ef2、2026-11-19）でも同じです。

## 2. eventCoalescing：説明文の 2 回と 1 回

📄 `angular/packages/core/src/change_detection/scheduling/ng_zone_scheduling.ts` L168–184 （▶ の行: 170, 176, 178, 181–184）

````ts
168 │ 
169 │ /**
170 ▶  * Used to configure event and run coalescing with `provideZoneChangeDetection`.
171 │  *
172 │  * @publicApi
173 │  *
174 │  * @see {@link provideZoneChangeDetection}
175 │  */
176 ▶ export interface NgZoneOptions {
177 │   /**
178 ▶    * Optionally specify coalescing event change detections or not.
179 │    * Consider the following case.
180 │    *
181 ▶    * ```html
182 ▶    * <div (click)="doSomething()">
183 ▶    *   <button (click)="doSomethingElse()"></button>
184 ▶    * </div>
````

この続き（L185〜218、2 つのオプションの説明の本体）は[coalescing の章](../zone/12-zone-coalescing.md)が引いています。L187〜190「button を押すと 2 つのハンドラが呼ばれ、変更検知が 2 回」、L192〜193「既定は false」、L194〜195「true なら 1 回」を、182〜184 行目のテンプレートそのままのコンポーネントで数えると、`provideZoneChangeDetection()` は 2 回、`{eventCoalescing: true}` は 1 回でした（DEMO の表 1）。どちらも DOM は `2`（2 つのハンドラが 1 ずつ足した）です。zoneless のアプリでは、どちらのハンドラも `NotificationSource.Listener` を通知しますが、予約は 1 回にまとまるので 1 回です（[(click) から画面更新まで（zoneless）の章](../zoneless/08-zoneless-listener-path.md)）。

## 3. runCoalescing：10 回と 1 回、ただし「rAF の中」ではない

L204〜210 の例（`for` で `ngZone.run` を 10 回）を zone の外から呼ぶと、`provideZoneChangeDetection()` は同期のうちに 10 回、`{runCoalescing: true}` は同期のうちは 0 回で、待ったあと 1 回でした（DEMO の表 2）。L212「何度も」と L213「1 回だけ」のとおりです。zoneless のアプリの `NoopNgZone.run` は関数を呼ぶだけで、0 回です。L214「さらに、変更検知は requestAnimation の中で走る」は言い過ぎです。まとめた変更検知は `scheduleCallbackWithRafRace` で `setTimeout` と `requestAnimationFrame` の早い方に預けられ（zone/ng\_zone.ts L406、[setTimeout と requestAnimationFrame の競走の章](../zoneless/04-zoneless-raf-race.md)）、`requestAnimationFrame` の無い Node の記録では `setTimeout` の側で走りました。spec の `should run in requestAnimationFrame async`（zone/ng\_zone\_spec.ts 1044・1263）は、非同期に走ることを確かめていて、どちらの側で走ったかは見ていません。L213〜214 は 0663708a759（2023-12-05）で application\_ref.ts から移されたままの文です。

> [!NOTE]
> **ポイント**
>
> `NgZoneOptions` は今は 2 つだけです。3 つ目の `ignoreChangesOutsideZone` は 92e09adc0a1（2025-07-17、`fix(core): Remove ignoreChangesOutsideZone option (#62700)`）で消えました。代わりに、zone の外の通知を拾うかどうかは[ハイブリッドの章](../zoneless/10-zoneless-hybrid.md)の判定（`shouldScheduleTick`）で決まります。

## 4. provideZonelessChangeDetection：7 つの API は全部 tick を起こす

📄 `angular/packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts` L331–368 （▶ の行: 335, 337–340, 342, 346–347, 349–355, 364）

````ts
331 │ /**
332 │  * Provides change detection without ZoneJS for the application bootstrapped using
333 │  * `bootstrapApplication`.
334 │  *
335 ▶  * NOTE: Zoneless is enabled by default in Angular v21+. Ensure `provideZoneChangeDetection` is not used to override this default.
336 │  *
337 ▶  * This function allows you to configure the application to not use the state/state changes of
338 ▶  * ZoneJS to schedule change detection in the application. This will work when ZoneJS is not present
339 ▶  * on the page at all or if it exists because something else is using it (either another Angular
340 ▶  * application which uses ZoneJS for scheduling or some other library that relies on ZoneJS).
341 │  *
342 ▶  * This can also be added to the `TestBed` providers to configure the test environment to more
343 │  * closely match production behavior. This will help give higher confidence that components are
344 │  * compatible with zoneless change detection.
345 │  *
346 ▶  * ZoneJS uses browser events to trigger change detection. When using this provider, Angular will
347 ▶  * instead use Angular APIs to schedule change detection. These APIs include:
348 │  *
349 ▶  * - `ChangeDetectorRef.markForCheck`
350 ▶  * - `ComponentRef.setInput`
351 ▶  * - updating a signal that is read in a template
352 ▶  * - when bound host or template listeners are triggered
353 ▶  * - attaching a view that was marked dirty by one of the above
354 ▶  * - removing a view
355 ▶  * - registering a render hook (templates are only refreshed if render hooks do one of the above)
356 │  *
357 │  * @usageNotes
358 │  * ```ts
359 │  * bootstrapApplication(MyApp, {providers: [
360 │  *   provideZonelessChangeDetection(),
361 │  * ]});
362 │  * ```
363 │  *
364 ▶  * @publicApi 20.2
365 │  *
366 │  * @see {@link /api/platform-browser/bootstrapApplication bootstrapApplication}
367 │  * @see [Angular without ZoneJS (Zoneless)](guide/zoneless)
368 │  */
````

346〜355 行目の 7 つを、OnPush（v22 の既定）のルートのコンポーネント 1 つのアプリで 1 つずつ試し、tick の回数と DOM を書きました（DEMO の表 3）。7 つとも tick は 1 回で、「フィールドを変えるだけ」と「`setTimeout` の中でフィールドを変える」は 0 回です。355 行目「render hook を登録したときは、hook が上の 6 つのどれかをしない限りテンプレートは更新しない」のとおり、`afterNextRender` の登録の回は tick が 1 回でも DOM は変わりませんでした。一覧に無い `ViewContainerRef.insert` も 1 回です（ビューを付けると `updateAncestorTraversalFlagsOnAttach` が `NotificationSource.ViewAttached` を通知する、render3/util/view\_utils.ts L247〜248）。

同じ操作を zone のアプリ（表 3'）で試すと、違うのは `setTimeout` の行だけで、tick が 2 回（`ngZone.run` を抜けたときと、タイマーのあと）走りましたが、DOM は `n=0` のままでした。ルートが OnPush で、誰も印を付けていないからです。346 行目の「ZoneJS はブラウザーのイベントで変更検知を起こす」は tick の話で、v22 の既定の OnPush では、zone のアプリでも描き直すには上の 7 つの API のどれかが要ります。

335 行目「v21+ では zoneless が既定」は 26afb736b7d（2026-03-23、``docs: Update `provideZonelessChangeDetection` tsdocs``）で足されました。表 4 のとおり、何も provide しないアプリの `NgZone` は `NoopNgZone` です。開発モードで zone.js が読み込まれていると、この関数は呼ばれたときに NG0914（「zoneless なのに Zone.js を読み込んでいる」）を `console.warn` します（L372〜380）。何も provide しない（既定の zoneless）アプリでは、zone.js があっても警告は出ませんでした。警告はこの公開の関数の中にしか無いからです。両方を provide すると、開発モードの bootstrap で NG0408（「両方 provide されている。たぶん間違い」）が出て、`NgZone` は後に書いた方（この記録では `NoopNgZone`）になります。本番の記録ではどちらの警告も出ません。

📄 `angular/packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts` L247–257 （▶ の行: 249, 251–252, 254–255, 257）

```ts
247 │ 
248 │   /**
249 ▶    * Calls ApplicationRef._tick inside the `NgZone`.
250 │    *
251 ▶    * Calling `tick` directly runs change detection and cancels any change detection that had been
252 ▶    * scheduled previously.
253 │    *
254 ▶    * @param shouldRefreshViews Passed directly to `ApplicationRef._tick` and skips straight to
255 ▶    *     render hooks when `false`.
256 │    */
257 ▶   private tick(): void {
```

`ChangeDetectionSchedulerImpl.tick` の内部の説明（`private` なので API リファレンスには載りません）は、254〜255 行目で `@param shouldRefreshViews` を挙げますが、257 行目の `tick()` は引数を取りません。80f96e7c519（2024-03-18）で書かれたころの引数で、dabfb6de3dc（2024-07-10、``refactor(core): track dirtiness bits in `ApplicationRef` (#57453)``）で「views を確かめるか」が `ApplicationRefDirtyFlags` に置き換わったときに引数だけ消え、説明が残りました（[scheduler.tick の章](../zoneless/05-zoneless-tick.md)）。zoneless\_scheduling.ts L78 の `SCHEDULE_IN_ROOT_ZONE` の「TODO: v19 で消す」も v22 で残っています。

> **🧪 DEMO — tick の回数（Node の記録の再生）**
>
> 押すと、Node（domino の上の JIT、`@angular/core` 22.2.6）で小さなアプリを `createApplication` で作り、ルートのコンポーネントを bootstrap してから操作し、`ApplicationRef` の `_tick` が呼ばれた回数と DOM の文字を書いた記録を表にします。zone.js ありの記録は、../angular の node\_modules のブラウザー用 zone.js 0.16.2 を先に読み込みました（domino の要素のイベントにもパッチが当たるようにしてから）。使った関数は crd-scheduling.demo-sch.ts にあり、このページでは読み込みません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/crd-scheduling)

## ここまでの呼び出し

- 👤 `button.dispatchEvent(click)`（eventCoalescing: false、zone.js あり）
  - `zone.js の EventTask → button のハンドラ` — *NgZone の中*
    - `タスクを抜ける → checkStable → onMicrotaskEmpty` — zone/ng\_zone.ts
      - `NgZoneChangeDetectionScheduler → applicationRef._tick()` — ng\_zone\_scheduling.ts L50〜66 — *1 回目*
  - `バブリング → div のハンドラ（別の EventTask）`
    - `onMicrotaskEmpty → _tick()` — *2 回目（eventCoalescing: true なら、checkStable を rAF の競走まで預けて 1 回）*

## テストと直し方

| ファイル（packages/core/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `zone/ng_zone_spec.ts` | `coalescing`（930）› `shouldCoalesceRunChangeDetection = false, shouldCoalesceEventChangeDetection = false`（954）› `should emit onMicroTaskEmpty multiple times within the same event loop for multiple ngZone.run`（971） | 3 節の 10 回 |
| `zone/ng_zone_spec.ts` | `shouldCoalesceEventChangeDetection = true, ...`（1024）› `should only emit onMicroTaskEmpty once within the same event loop for multiple event tasks`（1064） | 2 節の 1 回 |
| `zone/ng_zone_spec.ts` | `shouldCoalesceRunChangeDetection = true`（1243）› `should run in requestAnimationFrame async`（1263）・`should only emit onMicroTaskEmpty once within the same event loop for multiple ngZone.run`（1272） | 3 節の 1 回。rAF の側で走ったかは見ない |
| `change_detection_scheduler_spec.ts` | `Angular with zoneless enabled`（61）› `notifies scheduler`（76）› `when signal updates`（95）・`when using markForCheck()`（111）・`on input binding`（131）・`on event listener bound in template`（146）・`when inserting a view`（222）・`when attaching view to ApplicationRef`（348）・`executes render hooks without refreshing CheckAlways views`（481） | 4 節の 7 つ |
| `change_detection_scheduler_spec.ts` | `Angular with scheduler and ZoneJS`（751）› `does not cause double change detection with run coalescing`（904） | zone と zoneless のスケジューラーが二重に走らないこと |

📄 `走らせたコマンド（2026-11-21）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/core/test:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
（絞らない）                         1401 specs（4 つの shard の合計）, 0 failures, 8 pending
--filter=Angular with zoneless enabled   Ran 6 + 7 + 6 + 6 = 25 specs、0 failures
--filter=Angular with scheduler and ZoneJS  Ran 2 + 2 + 2 + 3 = 9 specs、0 failures
--filter=^NgZone                     Ran 25 + 25 + 26 + 25 = 101 specs、0 failures、2 pending

# 記録（Node、domino の上の JIT、@angular/core 22.2.6）
$ node record-zone.mjs <angular-deep-dive> <関数名> '<引数>' zone|nozone [prod]
#   zone は ../angular の node_modules のブラウザー用 zone.js 0.16.2 を先に読み込む
#   （domino の要素の EventTarget.prototype を global の EventTarget に置いてからパッチを当てさせる）
```

直すとしたら、公開の説明文は ng\_zone\_scheduling.ts の L214 だけです（「`setTimeout` と `requestAnimationFrame` の早い方で走る」）。内部のコメントは、L75〜77 を「zone と zoneless の両方が provide されていないかを確かめるため」に、zoneless\_scheduling\_impl.ts の 254〜255 行目の `@param` を消すのがそれぞれ 1 行の変更です。NG0914 と NG0408 の警告を固める it は、change\_detection\_scheduler\_spec.ts にも application\_ref\_spec.ts にも見当たらないので、足すならそこです（`console.warn` を spy して、開発モードで 1 回出ることを待つ）。

## 聞かれそうな質問

**Q. `eventCoalescing` を true にすると、何がまとまりますか？**

1 つのイベントのバブリングで続けて呼ばれるハンドラの変更検知です。説明文の例（L181〜185）を数えると、false で 2 回、true で 1 回でした。まとめた 1 回は `setTimeout` と `requestAnimationFrame` の早い方で走ります。

**Q. zoneless のアプリで、変更検知が予約されるのはどんなときですか？**

説明文の 346〜355 行目の 7 つ（`markForCheck`、`setInput`、テンプレートが読む signal、束縛した listener、印の付いたビューを付ける、ビューを外す、render hook の登録）です。記録では 7 つとも 1 回、フィールドを変えるだけや `setTimeout` は 0 回でした。

**Q. zone.js を読み込んだまま zoneless にするとどうなりますか？**

`provideZonelessChangeDetection()` を呼んだ場合だけ、開発モードで NG0914 の警告が出ます。動きは zoneless のままです（`NgZone` は `NoopNgZone`）。何も provide しない既定の zoneless では警告は出ません。

**Q. NgModule のアプリで zone の変更検知を使い続けるには？**

`bootstrapModule(AppModule, {applicationProviders: [provideZoneChangeDetection()]})` です（L140）。記録でも、オプションが `NgZone` に届いていました。L75〜77 の内部のコメントは古いままです。

**Q. `ignoreChangesOutsideZone` はどこへ行きましたか？**

92e09adc0a1（2025-07-17）で消えました。今の `NgZoneOptions` は `eventCoalescing` と `runCoalescing` の 2 つです。

## 読み終えて

- `eventCoalescing` と `runCoalescing` は説明文の数のとおり（2→1、10→1）。まとめた 1 回は rAF だけでなく `setTimeout` との競走で走る。
- zoneless の説明文の 7 つの API は、どれも tick を 1 回起こす。フィールドの代入と `setTimeout` は起こさない。
- v22 の既定は OnPush なので、zone のアプリでも tick だけでは OnPush のビューは描き直されない。
- NG0914（zone.js を読み込んだまま zoneless）と NG0408（両方 provide）は開発モードの警告だけ。
- `PROVIDED_NG_ZONE` のコメントと `tick` の `@param` は、実装が変わったあとに残った内部の文。

---

← 前: [IterableDiffer と KeyValueDiffer の説明文](08-crd-differs.md)  
次: [spec と issue を読む：core の説明文を固めているもの](10-crd-tests-issues.md) →
