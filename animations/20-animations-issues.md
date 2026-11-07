[目次](../README.md) › [アニメーションの内側](README.md) › 第 20 回 / 全 20 回

# animations の issue と変更を読む：直されたバグから学ぶ

> core: animations のラベルで閉じた 50 件の issue を、このシリーズのどの章の仕組みの話かで分け（並べ替えと出し直しが 10 件、入れ子の leave が 7 件）、報告が 20.2 の直後に集中したこと、入れ子の leave が「入れる → 取り消す → コンポーネントの境界で入れ直す」と往復したことを追う。開いている issue と PR、この 1 年のコミット 30 件が ../angular に入っているか、#64423 の修正と spec、外から入った #69291 の修正。新しいバグの報告を手元のブラウザ版の spec で再現する手順。2026-11-01 時点のスナップショット。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/animations-issues)

---

このシリーズで読んできた `animate.enter` / `animate.leave` と旧エンジンの仕組みが、本家の issue と変更ではどう話題になってきたかを見る最終回です。数字はすべて **2026-11-01 時点のスナップショット**です （`core: animations` のラベルで閉じた issue 50 件、開いている issue 3 件と PR 1 本、シリーズの準備で取ったこの 1 年のコミット 30 件）。issue は日々増えたり閉じたりするので、読むときは自分で取り直してください。

この章でしないこと：本家にコメントや PR を出すことは勧めません。ゴールは、issue を読んで「どの回の、どの行の話か」を言えること、手元で確かめた結果を**下書き**にできることです。進め方の 3 段階は [testing-issues](../testing/20-testing-issues.md)・[forms-issues](../forms/20-forms-issues.md) と同じで、ラベルと triage の読み方は [contrib-triage](../contrib/12-contrib-triage.md) で読みました。

1. [1. 全体像](01-animations-overview.md)
2. [2. テンプレートから命令へ](02-animations-compile.md)
3. [3. 命令がすること](03-animations-instructions.md)
4. [4. 待ち行列](04-animations-queue.md)
5. [5. enter のクラス](05-animations-enter-classes.md)
6. [6. いちばん長いアニメーション](06-animations-longest.md)
7. [7. 関数で動かす](07-animations-functions.md)
8. [8. 動かないとき](08-animations-disabled.md)
9. [9. 消すのを遅らせる](09-animations-leave-removal.md)
10. [10. leave のクラス](10-animations-leave-classes.md)
11. [11. 入れ子の leave](11-animations-leave-nested.md)
12. [12. 並べ替えと出し直し](12-animations-leave-reorder.md)
13. [13. スタイルの後片付け](13-animations-styles-teardown.md)
14. [14. 旧パッケージの入口](14-animations-legacy-setup.md)
15. [15. 旧 DSL とキーフレーム](15-animations-legacy-dsl.md)
16. [16. TransitionAnimationEngine](16-animations-legacy-engine.md)
17. [17. 2 つが同居するとき](17-animations-legacy-compat.md)
18. [18. 移行](18-animations-migration.md)
19. [19. テスト](19-animations-testing.md)
20. **20. issue と変更を読む**（この章）

## 0. データの取り方

📄 `ターミナル（読み取りだけ）`

```
# 読み取りだけ（2026-11-01）
gh issue list -R angular/angular --label "core: animations" --state closed --limit 300 --json number,title,createdAt,closedAt
gh issue list -R angular/angular --label "core: animations" --state open --json number,title
gh issue list -R angular/angular --label "area: animations" --state open --json number,title
gh issue view <番号> -R angular/angular --json number,title,body,stateReason,closedAt,createdAt,labels,comments
gh pr view 71394 -R angular/angular --json title,body,state,files,reviews

# 修正のコミットを探す（../angular-main、74961c66242）
git -C ../angular-main log --since=2025-07-01 -F --grep="#<番号>" --format="%h %ad %s" --date=short
# ../angular（8576f161ae4）に入っているか
git -C ../angular-main merge-base --is-ancestor <hash> 8576f161ae4 && echo yes || echo no
```

`gh issue list` / `gh issue view` / `gh pr view` と、../angular-main の `git log` / `git merge-base` だけを使っています。コメント・ラベル・レビューを書き込むコマンドは一度も使いません。ラベルは 2 つあり、`area: animations` は旧パッケージ（`@angular/animations`）、新しい仕組みは `core: animations` です。`--limit 300` で取って 50 件だったので、閉じた `core: animations` はこの 50 件で全部です（`area: animations` の閉じたものは 560 件）。

## 1. 閉じた 50 件をこのシリーズの章で分ける

| 主題が当たる章 | 件数 |
| --- | --- |
| 第 12 回 並べ替えと出し直し | 10 |
| 不明 | 8 |
| 第 11 回 入れ子の leave | 7 |
| 第 6 回 いちばん長いアニメーション | 5 |
| 第 13 回 スタイルの後片付け | 3 |
| 第 17 回 2 つが同居するとき | 3 |
| 第 4 回 待ち行列 | 3 |
| 第 5 回 enter のクラス | 3 |
| 第 7 回 関数で動かす | 3 |
| 第 10 回 leave のクラス | 2 |
| 第 2 回 テンプレートから命令へ | 1 |
| 第 8 回 動かないとき | 1 |
| 第 9 回 消すのを遅らせる | 1 |

- いちばん多いのは[第 12 回](12-animations-leave-reorder.md)（並べ替えと出し直し）の 10 件で、`@for` の中の leave・leave の途中での出し直し・動的コンポーネントの重複・ドラッグ & ドロップです。次が[第 11 回](11-animations-leave-nested.md)（入れ子の leave）の 7 件。leave の側（第 9〜13 回）が合わせて 23 件で、enter の側（第 5 回）の 3 件よりずっと多いのは、「消すのを遅らせる」が DOM の操作の順番に割り込む仕組みだからです（[第 9 回](09-animations-leave-removal.md)）。
- 「不明」の 8 件は、タイトルと本文だけでは章を決められなかったものです。多くはコンテンツの投影や動的に作ったコンポーネント（#63418・#63901・#64065・#64163・#64304）で、直したコミット dd7c4cd9d14「コンテンツの投影と組み合わせたアニメーションを直す」は interfaces.ts・utils.ts・animation.ts・node\_manipulation.ts にまたがっています。
- 閉じた理由は「完了」が 45、「予定なし」が 4（#63106・#63812・#64678・#66474）、「重複」が 1（#64163 → #63418）。本文に `#番号` を書いた修正のコミットが見つかったのは 38 件で、その全部が ../angular（8576f161ae4）に入っています。
- 作られてから閉じるまでの日数の中央値は 2 日、1 日以内が 15 件、7 日以内が 40 件です。50 件のうち 40 件に thePunderWoman（Jessica Janiuk。新しい仕組みの作者）がコメントしています。

### いつ報告されたか

| 作られた月 | 件数 |   |
| --- | --- | --- |
| 2025-08 | 14 |   |
| 2025-09 | 9 |   |
| 2025-10 | 11 |   |
| 2025-11 | 2 |   |
| 2025-12 | 1 |   |
| 2026-01 | 4 |   |
| 2026-02 | 2 |   |
| 2026-03 | 5 |   |
| 2026-04 | 0 |   |
| 2026-05 | 1 |   |
| 2026-06 | 1 |   |
| 2026-07 | 0 |   |
| 2026-08 | 0 |   |
| 2026-09 | 0 |   |
| 2026-10 | 0 |   |

20.2.0 のタグは 2025-08-20（../angular の `git log -1 20.2.0`）、21.0.0 は 2025-11-19 です。2025-08〜10 の 3 か月で 34 件（68%）が報告され、新しい API が出た直後に集中しています。2026-01〜03 の 11 件は、21.2 で入った入れ子の leave の変更をめぐるものが多く（3 節）、#67350・#67728 はタイトルに、#67400 は本文に「21.2」を書いています。

> **🧪 DEMO — 50 件を章で絞る（2026-11-01 のスナップショット）**
>
> データは章のコードに定数として埋め込んであり、GitHub には問い合わせません。番号は github.com の issue を新しいタブで開きます。「章」は主題がどの仕組みに当たるかで、原因がその回の行だと断定するものではありません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-issues)

## 2. 開いている issue と PR

| # | 作成 | ラベル | 内容 | 章 |
| --- | --- | --- | --- | --- |
| [#66244](https://github.com/angular/angular/issues/66244) | 2025-12-24 | `area: core`・`core: animations` | どれかのコンポーネントに `(animate.leave)` があると、レンダラーを壊しても `<style>` が head から消えない。thePunderWoman は「子が CSS で消えていく途中に親が消えると、アニメーションが終わるまで CSS を消せない。安全に消せる時を知るのが難しい」と返している | [第 13 回](13-animations-styles-teardown.md) |
| [#71393](https://github.com/angular/angular/issues/71393) | 2026-10-16 | `area: compiler` | `animate.entr` のような打ち間違いがエラーにならず、leave として動く。`name === 'animate.enter' ? ENTER : LEAVE` と `name.endsWith('enter')` で種類を決めているため | [第 2 回](02-animations-compile.md) |
| [PR #71394](https://github.com/angular/angular/pull/71394) | 2026-10-16 | `area: compiler` | #71393 を直す PR（aminesbdev。issue と同じ人）。`animate.enter` / `animate.leave` 以外の `animate.` の名前をエラーにする。7 ファイル（binding\_parser.ts +46、ngtsc\_spec.ts +83 など）。レビューはまだ付いていない | [第 2 回](02-animations-compile.md) |
| [#71703](https://github.com/angular/angular/issues/71703) | 2026-10-28 | `area: animations`・`needs: clarification` | 親子で連携する enter / leave に同じ振る舞いの移行先ができるまで、v23 で `@angular/animations` を消さないでほしい。JeanMeche が「v23 で消すことはなさそう」と返した | [第 18 回](18-animations-migration.md) |

開いている `core: animations` は #66244 の 1 件だけ、開いている `area: animations` は #71703 の 1 件だけです。`animate.` を含む open の PR は #71394 の 1 本でした。新しい仕組みの issue の多くは、報告から数日で修正が入って閉じています（1 節）。開いたまま残っているのは、#66244 のように「いつ安全か」の判断が要るものと、#71703 のように方針の話です。

## 3. 直されたバグから学ぶ：入れ子の leave の往復

1. **ea2016a6dce（2026-01-30）入れ子のアニメーションに対応**

   「テンプレートの中に入れ子の leave があれば、親の要素を消す前にそれを走らせる」。#66476（ホストの `(animate.leave)` が効かない）を直すものとして入りました（PR #66848）。
2. **2026-03 の報告**

   #67400「21.2.0 で animate.leave のコンポーネントが DOM に残る」、#67526「親が先に消えるのに子の leave が走る（ドキュメントが古い）」、#67552「\[Canonical\] ルートの遷移で animate.leave を走らせないで」。#67552 の本文は「子のアニメーションが走らないという混乱は消えたが、今度は逆の声が来ている。特にルートの遷移では、子のアニメーションを走らせたくないことが多い」です。
3. **999c14eaab9（2026-03-11）取り消し**

   「入れ子のアニメーションの集め方の範囲が広すぎた。ルートの遷移で、子のすべての要素のアニメーションが遷移の前に積まれて走った。範囲を絞ってやり直す」。fixes #67552。
4. **df659b8d0cf（2026-03-12）コンポーネントの境界で区切って入れ直す**

   「同じコンポーネントのビューと、その中の `@if` / `@for` の中だけで、入れ子の leave を待つ」。コミットには `BREAKING CHANGE: Leave animations are no longer limited to the element being removed.` が書かれています。fixes #67633。この「境界」を作っているのが、[第 11 回](11-animations-leave-nested.md)で読む `collectNestedViewAnimations` の「子のコンポーネントには降りない」コメントの行です。

> [!NOTE]
> **ポイント**
>
> この往復から言えるのは、「どこまでの子を待つか」は仕様の判断で、行を読んだだけでは「正しい」が決まらない、ということです。#68796（2026-05-19）でも、ガイドの例のとおりに子孫の `animate.leave` が走らないと報告され、thePunderWoman が「一度そう変えたが、実質的に破壊的変更だったので戻して入れ直した」と説明して閉じています。issue を読むときは、まず「それは今の仕様（コンポーネントの境界）どおりか」を第 11 回の行で確かめます。

## 4. この 1 年のコミット 30 件

シリーズの準備で取った一覧（scratchpad の `commits-animations-1y.txt`、../angular-main、2025-10-31〜2026-10-08）です。取り方の記録が無いので、この 1 年の animations のコミットの全部ではありません。参考に、`git log --since=2025-11-01 -- packages/animations packages/core/src/animation packages/platform-browser/animations` は 46 件でした。

| type | 件数 |
| --- | --- |
| `fix` | 13 |
| `refactor` | 11 |
| `test` | 2 |
| `feat` | 2 |
| `docs` | 1 |
| `revert` | 1 |

- `fix` 13・`refactor` 11・`feat` 2・`test` 2・`docs` 1・`revert` 1。`fix` の 13 件には、取り消しの 999c14eaab9（`fix(core): reverts …`）も入っています。
- 作者は Jessica Janiuk が 14 件、SkyZeroZx が 3 件、Matthieu Riegler・Matt Lewis・Kristiyan Kostadinov が 2 件ずつ、ほかの 7 人が 1 件ずつです。所属は数えていません。
- ../angular（8576f161ae4、2026-09-06）に**入っていない**のは 7 件です。このシリーズの行番号は ../angular のものなので、この 7 件の変更は本文に入っていません。各章で「最新の main では」と 1 文書いているのはこの差です （例: c60c41e29aa で `tick_animation_frames.ts` が消えた。[第 19 回](19-animations-testing.md)）。

> **🧪 DEMO — 30 件を type と「../angular に入っているか」で絞る**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/animations-issues)

## 5. issue → 修正 → spec を 1 本たどる：#64423

#64423（2025-10-15）は「20.3.3 から 20.3.4 に上げたら、ダイアログの中で `createComponent` したコンポーネントが、閉じたあとも消えない」という退行の報告です。同じ日の aab73671e4e（#64441）で直り、翌日に閉じました。最初の再現は依存の多いもので、チームは「最小の再現」を何度か求め、最後は JoostK が StackBlitz で最小の形に削っています。閉じるときに thePunderWoman が「特別なパッチ 20.3.6 を出した」と書きました。コミットの本文は「まれに、`afterEveryRender` の待ち行列が消えてしまうことがある。`afterNextRender` にして、要るときだけ予約する」で、queue.ts を 79 行変えています（[第 4 回](04-animations-queue.md)）。このコミットで足された spec が、`describe('animation queue timing')` の最初の it（2311 行目「should run animations with a fresh componentRef after destroy」）です。

📄 `angular/packages/core/test/acceptance/animation_spec.ts` L2314–2353 （▶ の行: 2315–2316, 2318–2319, 2342, 2345, 2347, 2351）

```ts
2314 │         template: `
2315 ▶           @if (step() === 0) {
2316 ▶             <p class="not-here" [animate.leave]="'fade-out'">THIS SHOULD NOT BE HERE</p>
2317 │           }
2318 ▶           @if (step() === 1) {
2319 ▶             <p class="all-there-is">THIS SHOULD BE ALL THERE IS</p>
2320 │           }
2321 │         `,
2322 │       })
2323 │       class StepperComponent {
2324 │         readonly step = signal(0);
2325 │       }
2326 │ 
2327 │       @Component({
2328 │         selector: 'app-dynamic',
2329 │         template: `<ng-container #dynamicComponent></ng-container>`,
2330 │       })
2331 │       class DynamicComponent implements AfterViewInit, OnDestroy {
2332 │         @ViewChild('dynamicComponent', {read: ViewContainerRef})
2333 │         dynamicComponent!: ViewContainerRef;
2334 │ 
2335 │         constructor() {
2336 │           this.componentRef = null;
2337 │         }
2338 │ 
2339 │         protected componentRef: ComponentRef<StepperComponent> | null;
2340 │ 
2341 │         ngAfterViewInit(): void {
2342 ▶           this.componentRef = this.dynamicComponent.createComponent(
2343 │             StepperComponent,
2344 │           ) as ComponentRef<StepperComponent>;
2345 ▶           this.componentRef!.changeDetectorRef.detectChanges();
2346 │ 
2347 ▶           this.componentRef!.instance.step.set(1);
2348 │         }
2349 │ 
2350 │         ngOnDestroy(): void {
2351 ▶           this.componentRef?.destroy();
2352 │         }
2353 │       }
```

📄 `angular/packages/core/test/acceptance/animation_spec.ts` L2375–2407 （▶ の行: 2375, 2381–2382, 2385, 2388, 2390, 2397, 2400, 2402, 2405–2406）

```ts
2375 ▶       TestBed.configureTestingModule({animationsEnabled: true});
2376 │ 
2377 │       const fixture = TestBed.createComponent(TestComponent);
2378 │       const cmp = fixture.componentInstance;
2379 │       fixture.detectChanges();
2380 │ 
2381 ▶       expect(fixture.debugElement.query(By.css('p.all-there-is'))).not.toBeNull();
2382 ▶       expect(fixture.debugElement.query(By.css('p.not-here.fade-out'))).not.toBeNull();
2383 │ 
2384 │       // Finish the leave animation to ensure it is removed
2385 ▶       tickAnimationFrames(1);
2386 │ 
2387 │       // verify element is removed post animation
2388 ▶       expect(fixture.debugElement.query(By.css('p.not-here'))).toBeNull();
2389 │ 
2390 ▶       cmp.toggleOverlay();
2391 │       fixture.detectChanges();
2392 │ 
2393 │       // show is false. Nothing should be present.
2394 │       expect(fixture.debugElement.query(By.css('p.all-there-is'))).toBeNull();
2395 │       expect(fixture.debugElement.query(By.css('p.not-here'))).toBeNull();
2396 │ 
2397 ▶       cmp.toggleOverlay();
2398 │       fixture.detectChanges();
2399 │ 
2400 ▶       expect(fixture.debugElement.query(By.css('p.not-here'))).not.toBeNull();
2401 │ 
2402 ▶       tickAnimationFrames(1);
2403 │ 
2404 │       // show is true. Only one element should be present.
2405 ▶       expect(fixture.debugElement.query(By.css('p.all-there-is'))).not.toBeNull();
2406 ▶       expect(fixture.debugElement.query(By.css('p.not-here'))).toBeNull();
2407 │     }));
```

1. **2315〜2319・2342〜2347 行目 作った直後に leave**

   `StepperComponent` は `step` が 0 なら 2316 行目の `[animate.leave]="'fade-out'"` の段落、1 なら 2319 行目の段落を出します。`DynamicComponent` は `ngAfterViewInit` の中で 2342 行目の `createComponent` で作り、2345 行目で描いてから、2347 行目ですぐ `step` を 1 にします。作った直後に leave が待ち行列に積まれる形です。
2. **2381〜2388 行目 1 回目は消える**

   2381〜2382 行目で両方の段落があり、`.not-here` に `fade-out` が付いていること、2385 行目で rAF 1 回分進めると 2388 行目で `.not-here` が消えていることを確かめます（この it には `.fade-out` の CSS が無いので、長さ 0 として外れる。[第 6 回](06-animations-longest.md)）。
3. **2390〜2406 行目 壊して作り直しても、もう一度消える**

   2390 行目と 2397 行目で外側の `@if` を切り替え、`DynamicComponent` を壊して作り直します（2351 行目の `ngOnDestroy` で `componentRef` も壊す）。2400 行目で新しい `.not-here` が出て、2402 行目のあと、2405〜2406 行目で今度も `.all-there-is` だけが残ることを見ます。it の名前「破棄のあと、新しい componentRef でもアニメーションが走る」がこの後半です。

### 外から入った修正の例：#69291 → PR #69296

1. **issue #69291（2026-06-10 19:51、kaiguogit）**

   「排他的なアコーディオンでパネルを切り替えると、閉じるほうの `animate.leave` が飛ばされる（兄弟のインスタンスが TNode を共有する）」。最初のコメントで、`cancelLeavingNodes`（utils.ts）を #67032 の前後で比べて退行を特定し、続けて最小の再現（StackBlitz と GitHub のリポジトリ）、版ごとに毎フレーム `getComputedStyle` と `getAnimations()` を記録した結果、21.2.x と 21.1.6 の並べた再現を書いています。
2. **PR #69296（同じ日の 20:20、同じ人）**

   utils.ts（+67 −13）、node\_manipulation.ts（+2 −2）、animation\_spec.ts（+110）と、bundle の golden symbols 8 ファイル。20:40 に thePunderWoman が承認し、翌日に main（6b5616b2c77）と 22.0.x に入りました。行は[第 12 回](12-animations-leave-reorder.md)の `leavingNodes` と `cancelLeavingNodes` です。

> [!NOTE]
> **ポイント**
>
> この 1 本から言えるのは、「退行を起こしたコミットまで特定し、版を並べた再現と測った記録を issue に書いた」うえで、小さく閉じた変更（ソース・spec・golden）が入った、ということまでです。PR の流れとレビューのラベルは [contrib-pr-flow](../contrib/10-contrib-pr-flow.md) です。この章は、自分から PR を出すことを勧めていません。

## 6. どう関わるか：3 つの段階を animations に当てはめる

1. **① 読む：issue を章に当てはめる**

   1 節の表のように、まず「どの回の仕組みか」を決めます。leave なら第 9〜13 回、旧パッケージと一緒なら第 17 回、テストでだけ起きるなら第 19 回（jsdom では仕組みが動かない）です。そのうえで、#68796 のように「今の仕様どおり」なのか、#69291 のように「前の版では動いていた」のかを分けます。
2. **② 手元のブラウザ版の spec で再現する**

   animations の spec は Node では走りません（[第 19 回](19-animations-testing.md)）。再現は `acceptance_web_chromium` で、2743 本の中に自分の 1 本を足して確かめます。手順は下の 7 節です。
3. **③ issue に役立つコメント（下書きまで）**

   #69291 の最初のコメントが手本になります。「どの版で起きて、どの版で起きないか」「再現の最小の形」「どの関数のどの行が関わるか」の 3 つです。「まだ起きます」だけのコメントは情報を足しません。この章では下書きまでにして、投稿しません。

## 7. 新しいバグの報告を手元で再現する手順

📄 `手順（2〜4 は試していない）`

```
# 1) このサイトのような小さなアプリで再現する（ブラウザで。jsdom では仕組みが動かない）
#    最初は表示しない @if + animate.leave の要素を置き、ボタンで消して DOM を毎フレーム記録する
#    （第 18 回・第 19 回のデモと同じ形）

# 2) 自分の作業コピー（../angular とは別のクローン）で、acceptance の spec に同じ形の it を書く
#    置き場所の例: packages/core/test/acceptance/animation_spec.ts の describe('animate.leave')（76 行目）
#    書いた it だけを見たいなら、その it を一時的に fit にする（コミットに混ぜない）

# 3) ブラウザ版で走らせる（絞れないので、全 2743 本 + 足した 1 本が走る）
pnpm bazel test //packages/core/test/acceptance:acceptance_web_chromium --nocache_test_results --test_output=all

# 4) 落ちることを確かめてから、どの行で起きているかを第 2〜13 回の行で説明する
# ※ 私たちは ../angular を変えないので、2〜4 は試していない
```

- **1 の小さなアプリ**：このサイトの第 18・19 回のデモのように、ボタンを押したときだけ毎フレーム DOM と `getAnimations()` を記録すると、「クラスが付いたか」「いつ外れたか」が数字で残ります。#69291 の報告者の記録と同じ形です。
- **2 の spec の形**：`TestBed.configureTestingModule({animationsEnabled: true})`、`fakeAsync` と `tickAnimationFrames`（../angular の形）、または `async` と `nextAnimationFrame()`（最新の main の形）。5 節の it が見本です。
- **3 の確かめ方**：ブラウザ版は名前で絞れないので、足した it が走ったかは passed の数が 1 増えたかで見ます（2026-11-01 は 2743）。0 本で PASSED になる Node 版で確かめた気にならないこと。

## テストと直し方

この回の「テスト」は 5 節の spec と 7 節の手順です。5 節の it は `acceptance_web_chromium` の 2743 本の中にあり（2026-11-01、PASSED in 6.8s）、`describe('animation queue timing')`（animation\_spec.ts:2310）の it は 3 本です。

- #64423 の行は queue.ts の待ち行列の予約（[第 4 回](04-animations-queue.md)）。
- #69291 の行は utils.ts の `cancelLeavingNodes` / `trackLeavingNodes`（[第 12 回](12-animations-leave-reorder.md)）。
- #64525 の行は renderer.ts 89〜92 行目と async\_animation\_renderer.ts の `removeChild`（[第 17 回](17-animations-legacy-compat.md)）。
- #66244（open）の行は `allLeavingAnimations` と `NoneEncapsulationDomRenderer` の後片付け（[第 13 回](13-animations-styles-teardown.md)）。
- #71393（open）の行は binding\_specialization.ts・convert\_animations.ts・ingest.ts の種類の決め方（[第 2 回](02-animations-compile.md)）。

## 聞かれそうな質問

**Q. animate.leave は不安定なのですか？**

閉じた 50 件のうち leave の側（第 9〜13 回）が 23 件で、2025-08〜10 に 34 件が集中しています。その後は月に 0〜5 件です。開いている `core: animations` は #66244 の 1 件だけで、閉じたもののうち修正のコミットが見つかった 38 件はすべて ../angular に入っています。「出た直後に多くの報告があり、作者がすぐ直した」というのが数字から言えることで、21.2 の入れ子の leave の往復（3 節）のように、仕様の判断で揺れた時期もあります。

**Q. area: animations と core: animations はどう違いますか？**

`area: animations` は旧パッケージ `@angular/animations`、`core: animations` は core の `animate.enter` / `animate.leave` です。#71703 のように旧パッケージの存続の話は `area: animations`、#71393 のようにコンパイラーの話は `area: compiler` で、`animate.` の issue でも `core: animations` が付かないことがあります。探すときはラベルと `animate.` の検索の両方を使います。

**Q. 報告した人がそのまま直すことはありますか？**

あります。#69291 の kaiguogit は、issue を書いた 30 分後に PR #69296 を出し、翌日にマージされました。#66794 では mattlewis92 が「テストの中で再現できた」とコメントしています。どちらも、退行の特定・最小の再現・測った記録が先にありました。この章は、自分から PR を出すことは勧めていません。

**Q. v23 で旧パッケージの issue はどうなりますか？**

../angular と最新の main の @deprecated は「Intent to remove in v23」のままですが、#71703 で JeanMeche が「v23 で消すことはなさそう」と返しています（[第 18 回](18-animations-migration.md)）。開いている `area: animations` は #71703 の 1 件だけです。

## 読み終えて

- 閉じた `core: animations` は 50 件。並べ替えと出し直し（第 12 回）が 10 件、入れ子の leave（第 11 回）が 7 件で、leave の側が 23 件。
- 2025-08〜10 に 34 件。閉じるまでの中央値は 2 日で、修正のコミットは全部 ../angular に入っている。
- 入れ子の leave は「入れる → 取り消す → コンポーネントの境界で入れ直す（BREAKING CHANGE）」と往復した。今の仕様は第 11 回の行。
- open は #66244（スタイルの後片付け）・#71393 と PR #71394（コンパイラー）・#71703（旧パッケージの存続）。
- 関わり方は「章に当てはめる → ブラウザ版の spec で再現 → 版・再現・行のそろったコメントを下書き」。

---

← 前: [アニメーションのテスト：ブラウザでしか確かめられないもの](19-animations-testing.md)  
次: [Angular Aria の全体像：ディレクティブ・UI Pattern・Behavior の 3 層](../aria/01-aria-overview.md) →
