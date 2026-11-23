[目次](../README.md) › [animations の説明文の読み残し](README.md) › 第 9 回 / 全 9 回

# spec と issue を読む：animations の説明文を固めているもの

> packages/animations の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、area: animations の issue の表と、このシリーズで見つけた食い違い。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/anm-tests-issues)

---

この章で分かること：このシリーズの 8 回で読んだ `@angular/animations` と `platform-browser/animations` の説明文の約束を、本家の spec がどこで固めていて、どこを固めていないか。手元で spec を走らせた結果、1 つの不具合を作業木で直して spec を足した記録、issue の表、そしてこのシリーズで見つけた説明と実装の食い違いと不具合の一覧です。

読む対象は `packages/animations/test/`・`packages/animations/browser/test/`・`packages/platform-browser/animations/test/`・`packages/platform-browser/animations/async/test/` と、テンプレートを通して確かめる `packages/core/test/legacy_animation/` の spec と BUILD.bazel です（../angular、8576f161ae4）。spec の数え方（`if (isNode)` で Node では空になる）は[旧 DSL の章](../animations/15-animations-legacy-dsl.md)と[animations のテストの章](../animations/19-animations-testing.md)で読んだので、ここでは target と件数だけを書きます。

1. [1. trigger・state・style・animate](01-anm-trigger-state.md)
2. [2. transition・query・stagger](02-anm-transition-query.md)
3. [3. AnimationBuilder とプレイヤー](03-anm-builder-players.md)
4. [4. DSL を AST に](04-anm-ast.md)
5. [5. タイムライン](05-anm-timeline.md)
6. [6. 遷移のエンジン](06-anm-engine.md)
7. [7. Web Animations のドライバー](07-anm-driver.md)
8. [8. provideAnimations](08-anm-module.md)
9. **9. spec と issue**（この章）

> [!TIP]
> **新卒エンジニアへ**
>
> spec は「この振る舞いを変えたら落ちる」テストです。説明文の約束に spec が無ければ、誰かがその振る舞いを変えても気づけません。このシリーズで見つけた食い違いと不具合は、ほとんどが「spec の無い形」の上にありました（2 節の表の右の列）。

## 1. 走らせ方と件数

`@angular/animations` の spec は 3 か所の BUILD.bazel に、それぞれ Node の `:test`（`angular_jasmine_test`）とブラウザーの `:test_web`（`ng_web_test_suite`。実際の target は `:test_web_chromium`）があります。DSL とエンジンの spec の多くは Node では走らないので、件数はブラウザー版で見ます。テンプレートを通した spec は core の `:test_web_chromium` の中です。

📄 `走らせたコマンド`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/animations/test:test //packages/animations/test:test_web_chromium \
    //packages/animations/browser/test:test //packages/animations/browser/test:test_web_chromium \
    //packages/platform-browser/animations/test:test //packages/platform-browser/animations/test:test_web_chromium \
    //packages/platform-browser/animations/async/test:test //packages/platform-browser/animations/async/test:test_web_chromium \
    --nocache_test_results --test_output=all
$ pnpm bazel test //packages/core/test:test_web_chromium --nocache_test_results --test_output=all
```

📄 `結果（手元の bazel、2026-11-23）`

```
//packages/animations/test:test                                    9 specs, 0 failures
//packages/animations/test:test_web_chromium                        14 passed, 0 failed
//packages/animations/browser/test:test                            17 specs, 0 failures
//packages/animations/browser/test:test_web_chromium                124 passed, 0 failed
//packages/platform-browser/animations/test:test                    6 specs, 0 failures
//packages/platform-browser/animations/test:test_web_chromium       21 passed, 0 failed, 1 skipped
//packages/platform-browser/animations/async/test:test              1 spec, 0 failures
//packages/platform-browser/animations/async/test:test_web_chromium 15 passed, 0 failed, 1 skipped
Executed 8 out of 8 tests: 8 tests pass.
//packages/core/test:test_web_chromium                              1591 passed, 0 failed, 4 skipped
  （core/test/legacy_animation/ の 4 ファイルはこの中）
```

## 2. 各回の約束を固めている spec と、固めていない所

各回の「テストと直し方」の表を、約束ごとに 1 行にまとめます。行番号は spec のファイルのものです。

| 回 | 約束 | 固めている it（ファイル 行） | 固めていない所 |
| --- | --- | --- | --- |
| 1 | timings の文字列と負の値 | `should throw an error if an animation time is invalid`（animation\_spec.ts 162）・`should throw if negative durations are used`（176） | 単位の無い文字列（`'500'`）、大文字の `'1S'`、`ease-in-and-out` |
| 1 | 値の比べ方（true / false と 1 / 0） | ``should match `true` and `false` given boolean values``（animation\_trigger\_spec.ts 200）・``… `1` and `0` …``（211） | 「値を文字列にする」（説明文）を確かめる it は無く、実際は文字列にしない |
| 2 | query の 0 件と optional | `should throw an error when an animation query returns zero elements`（animation\_spec.ts 1213）・`should allow a query to be skipped if it is set as optional …`（1225） | 末尾の `:self`（`query('.item, :self')` で例外） |
| 3 | builder のプレイヤーの start / done | `should listen on start and done on the animation builder's player after it has been reset`（browser\_animation\_builder\_spec.ts 69） | reset のあとに足したコールバック、2 つ build したときの getPosition、同じ factory の 2 回の create |
| 4 | 並行の animate の重なり（NG03010） | `should throw an error if any styles overlap during parallel animations`（animation\_spec.ts 105） | 後の区間が前の区間をはみ出す形。NG03001 を期待する it はどこにも無い |
| 5 | group・keyframes・query の timeline | `keyframe building`（animation\_spec.ts 298）の `group()`（996）・`keyframes()`（730）・`query()`（1200） | browser の spec に stagger と animateChild の it が無い。`stagger('full')` は core の 1 本（下の引用）だけ |
| 6 | 途中での置き換え・リスナー | `should cancel a previously running animation when a follow-up transition kicks off on the same trigger`（transition\_animation\_engine\_spec.ts 523）・`event listeners`（247）の 3 つのエラー | 同じ value で params だけ変える形 |
| 6 | 親子の animateChild と飛ばしたプレイヤー | `should fire and synchronize the start/done callbacks on sub triggers …`（legacy\_animation\_query\_integration\_spec.ts 2920） | — |
| 7 | px の補い | `WebAnimationsStyleNormalizer` の 5 本（下の引用） | `padding` のような表に無い名前の数 |
| 7 | display と position | ``should apply the `display` and `position` styles as regular inline styles …``（legacy\_animations\_with\_web\_animations\_integration\_spec.ts 560、下の引用） | 2 回目の finish、最後の keyframe にだけあるプロパティ、WebAnimationsPlayer の reset |
| 8 | Noop の 3 つの設定 | `noopAnimationTests()`（noop\_animations\_module\_spec.ts、下の引用）・`animation modules`（legacy\_animation\_integration\_spec.ts 77） | `provideNoopAnimations()` の `ANIMATION_MODULE_TYPE`、Noop のもとで `animate.enter` が動くこと |

📄 `angular/packages/core/test/legacy_animation/legacy_animation_query_integration_spec.ts` L723–762 （▶ の行: 723, 735–740, 758–762）

```ts
723 ▶       it('should apply a full stagger step delay if the timing data is left undefined', () => {
724 │         @Component({
725 │           selector: 'ani-cmp',
726 │           template: `
727 │             <div [@myAnimation]="exp">
728 │               <div *ngFor="let item of items" class="item">
729 │                 {{ item }}
730 │               </div>
731 │             </div>
732 │           `,
733 │           animations: [
734 │             trigger('myAnimation', [
735 ▶               transition('* => go', [
736 ▶                 query('.item', [
737 ▶                   stagger('full', [
738 ▶                     style({opacity: 0}),
739 ▶                     animate(1000, style({opacity: 0.5})),
740 ▶                     animate(500, style({opacity: 1})),
741 │                   ]),
742 │                 ]),
743 │               ]),
744 │             ]),
745 │           ],
746 │           standalone: false,
747 │           changeDetection: ChangeDetectionStrategy.Eager,
748 │         })
749 │         class Cmp {
750 │           public exp: any;
751 │           public items: any[] = [0, 1, 2, 3, 4];
752 │         }
753 │ 
754 │         TestBed.configureTestingModule({declarations: [Cmp]});
755 │ 
756 │         const engine = TestBed.inject(ɵAnimationEngine);
757 │         const fixture = TestBed.createComponent(Cmp);
758 ▶         const cmp = fixture.componentInstance;
759 ▶ 
760 ▶         cmp.exp = 'go';
761 ▶         fixture.detectChanges();
762 ▶         engine.flush();
```

`stagger('full')` を確かめる it は、本家でこの 1 本だけです（grep で `stagger('full'` は 737 行目だけ）。735〜740 行目のとおり、`style()` が stagger の**中**にあり、query の前に親の手順もありません。[第 5 回](05-anm-timeline.md)の 6 節で時刻がずれた 2 つの形は、どちらもこの it の外です。

📄 `angular/packages/core/test/legacy_animation/legacy_animations_with_web_animations_integration_spec.ts` L586–605 （▶ の行: 597–598, 600–602, 604–605）

```ts
586 │ 
587 │       const engine = TestBed.inject(ɵAnimationEngine);
588 │       const fixture = TestBed.createComponent(Cmp);
589 │       const cmp = fixture.componentInstance;
590 │ 
591 │       const elm = cmp.element.nativeElement;
592 │       expect(elm.style.getPropertyValue('display')).toEqual('table');
593 │       expect(elm.style.getPropertyValue('position')).toEqual('fixed');
594 │ 
595 │       cmp.myAnimationExp = 'go';
596 │       fixture.detectChanges();
597 ▶ 
598 ▶       expect(elm.style.getPropertyValue('display')).toEqual('inline');
599 │       expect(elm.style.getPropertyValue('position')).toEqual('absolute');
600 ▶ 
601 ▶       const player = engine.players.pop()!;
602 ▶       player.finish();
603 │       player.destroy();
604 ▶ 
605 ▶       expect(elm.style.getPropertyValue('display')).toEqual('inline-block');
```

600〜602 行目は finish と destroy を 1 回ずつ呼び、604〜605 行目で元の inline の値に戻ることを見ます。[第 7 回](07-anm-driver.md)の 4 節の 2 つ（finish を 2 回、最後の keyframe にだけあるプロパティ）は、この形では起きません。

📄 `angular/packages/animations/browser/test/dsl/style_normalizer/web_animations_style_normalizer_spec.ts` L22–56 （▶ の行: 33–34, 39–40, 44, 47, 51, 54）

```ts
22 │   describe('normalizeStyleValue', () => {
23 │     function normalize(prop: string, val: string | number): string {
24 │       const errors: Error[] = [];
25 │       const result = normalizer.normalizeStyleValue(prop, prop, val, errors);
26 │       if (errors.length) {
27 │         throw new Error(errors.join('\n'));
28 │       }
29 │       return result;
30 │     }
31 │ 
32 │     it('should normalize number-based dimensional properties to use a `px` suffix if missing', () => {
33 ▶       expect(normalize('width', 10)).toEqual('10px');
34 ▶       expect(normalize('height', 20)).toEqual('20px');
35 │     });
36 │ 
37 │     it('should report an error when a string-based dimensional value does not contain a suffix at all', () => {
38 │       expect(() => {
39 ▶         normalize('width', '50');
40 ▶       }).toThrowError(/Please provide a CSS unit value for width:50/);
41 │     });
42 │ 
43 │     it('should not normalize non-dimensional properties with `px` values, but only convert them to string', () => {
44 ▶       expect(normalize('opacity', 0)).toEqual('0');
45 │       expect(normalize('opacity', '1')).toEqual('1');
46 │       expect(normalize('color', 'red')).toEqual('red');
47 ▶       expect(normalize('fontWeight', '100')).toEqual('100');
48 │     });
49 │ 
50 │     it('should not normalize dimensional-based values that already contain a dimensional suffix or a non dimensional value', () => {
51 ▶       expect(normalize('width', '50em')).toEqual('50em');
52 │       expect(normalize('height', '500pt')).toEqual('500pt');
53 │       expect(normalize('borderWidth', 'inherit')).toEqual('inherit');
54 ▶       expect(normalize('paddingTop', 'calc(500px + 200px)')).toEqual('calc(500px + 200px)');
55 │     });
56 │ 
```

寸法の名前（`width`・`height`・`borderWidth`・`paddingTop`）と、寸法でない名前（`opacity`・`color`・`fontWeight`）だけで、「表に無い寸法のプロパティ」（`padding` の数）は確かめていません。この spec は Node でも走ります。

📄 `angular/packages/platform-browser/animations/test/noop_animations_module_spec.ts` L15–39 （▶ の行: 17, 20, 26, 30, 35, 38）

```ts
15 │ describe('NoopAnimationsModule', () => {
16 │   beforeEach(() => {
17 ▶     TestBed.configureTestingModule({imports: [NoopAnimationsModule]});
18 │   });
19 │ 
20 ▶   noopAnimationTests();
21 │ });
22 │ 
23 │ describe('BrowserAnimationsModule with disableAnimations = true', () => {
24 │   beforeEach(() => {
25 │     TestBed.configureTestingModule({
26 ▶       imports: [BrowserAnimationsModule.withConfig({disableAnimations: true})],
27 │     });
28 │   });
29 │ 
30 ▶   noopAnimationTests();
31 │ });
32 │ 
33 │ describe('provideNoopAnimations()', () => {
34 │   beforeEach(() => {
35 ▶     TestBed.configureTestingModule({providers: [provideNoopAnimations()]});
36 │   });
37 │ 
38 ▶   noopAnimationTests();
39 │ });
```

3 つの設定から同じ `noopAnimationTests()` を呼ぶので、3 つが同じに振る舞うことはここで固まっています（[第 8 回](08-anm-module.md)の記録と合う）。ただし中の 2 本は、コールバックが呼ばれるかだけを見ます。

## 3. 作業木で直して spec を足した記録：stagger('full')

第 5 回で見つけた `stagger('full')` の不具合を、手元の作業木（../angular-fix から 8576f161ae4 で作り、記録のあと消した。../angular は変えていない）で直し、本家の spec の形で it を 2 本足して走らせました。直しは第 5 回の 6 節の 1 行（`parentContext.currentStaggerTime = tl.currentTime - parentContext.currentTimeline.currentTime;`）です。

📄 `足した it（packages/animations/browser/test/dsl/animation_spec.ts の describe('keyframe building') の中）`

```
describe('stagger("full")', () => {
  it('should start each queried element after the previous one when a style() precedes the stagger', () => {
    const sub3 = createDiv();
    rootElement.appendChild(sub3);
    const steps = [
      query('div', [
        style({opacity: 0}),
        stagger('full', [animate(1000, style({opacity: 0.5})), animate(500, style({opacity: 1}))]),
      ]),
    ];
    const players = invokeAnimationSequence(rootElement, steps);
    expect(players.map((p) => p.delay + p.duration)).toEqual([1500, 3000, 4500]);
  });

  it('should not add the time of the preceding parent steps to every queried element', () => {
    const steps = [
      animate(500, style({width: '10px'})),
      query('div', [stagger('full', [style({opacity: 0}), animate(1000, style({opacity: 1}))])]),
    ];
    const players = invokeAnimationSequence(rootElement, steps).filter((p) => p.element !== rootElement);
    expect(players.map((p) => p.delay)).toEqual([500, 1500]);
  });
});
```

📄 `結果（2026-11-23）`

```
# 作業木（8576f161ae4 から作り、記録のあと消した）で
#   src/dsl/animation_timeline_builder.ts の L545〜546 を 1 行に（第 5 回の直し）
#   test/dsl/animation_spec.ts の describe('keyframe building') に describe('stagger("full")') の it を 2 本
$ pnpm bazel test //packages/animations/browser/test:test_web_chromium --nocache_test_results --test_output=all
Chromium: 1/1 test files | 126 passed, 0 failed

# 直しだけを戻す（it の 2 本は残す）
Chromium: 1/1 test files | 124 passed, 2 failed
 ❌ Animation > keyframe building > stagger("full") > should not add the time of the preceding parent steps to every queried element
      Expected $[1] = 2000 to equal 1500.
 ❌ Animation > keyframe building > stagger("full") > should start each queried element after the previous one when a style() precedes the stagger
      Expected $[2] = 3000 to equal 4500.
```

直した形では既存の 124 本も含めて 126 本が通り、直しを戻すと足した 2 本だけが落ちました。落ちたときの値（3000・2000）は、第 5 回の DEMO の記録（2 つ目と 3 つ目が同時、親の 500ms が毎回足される）と同じです。core の L723 の it（上の引用）を直した形で走らせてはいません。

## 4. issue の表

2026-11-23 に開いている `area: animations` は 2 件です。閉じたものから、このシリーズで読んだ所に関わるものを gh で読んで取り足しました。2025-08-20 前後に、旧パッケージの issue の多くが「非推奨になったので」と NOT\_PLANNED で閉じられています。

| # | 題 | 状態 | このシリーズとの関わり |
| --- | --- | --- | --- |
| 72146 | animate.enter and (animate.enter) replay enter animations on already-rendered DOM during SSR client hydration（2026-11-20） | open | 新しい API の側（第 8 回の 4 節の「Noop でも animate.enter は動く」と同じく、旧パッケージの設定に関係しない） |
| 71703 | Retain Angular animations in v23 until coordinated enter/leave has a supported migration path（2026-10-28） | open・needs: clarification | 全部の回の `@deprecated … Intent to remove in v23` |
| 66399 | Stagger documentation example is not working（2026-01-08） | closed（同じ日） | 第 2 回の stagger の例（optional が無く NG03014）。「旧パッケージは非推奨」として閉じられた |
| 46928 | False positive warnings about not animatable properties（2022-07-21） | closed・NOT\_PLANNED（2025-08-20） | 第 7 回の 2 節の animatable\_props\_set の警告（aspect-ratio・position） |
| 26630 | AnimationPlayer onStart and onDone events emit only once（2018-10-21） | closed（2022-06-21） | これを直した 342effeb7d4 の形が、第 3 回・第 7 回の reset のあとの 2 回呼び |
| 64486 | \`Element.animate\` can return \`null\` in Chromium browsers（2025-10-17） | closed（2025-10-21） | 第 7 回の 5 節の getPosition の「init 済みで Animation が無い」 |
| 59044 | The \`provideAnimations()\` return type is \`Provider\` instead of \`EnvironmentProviders\`（2024-12-04） | closed・NOT\_PLANNED（2025-07-10） | 第 8 回の 3 節（返すのは `Provider[]`） |
| 56732 | \[@.disabled\]="undefined" attribute assumes "true" value and disables the animation（2024-06-27） | closed・NOT\_PLANNED（2025-08-20） | 第 6 回の 7 節（旧パッケージの入口の章の 178〜180 行目） |
| 45058 | :enter and :leaving animations of children with triggers are asymmetric/confusing/unclear（2022-02-11） | closed・NOT\_PLANNED（2025-08-20） | 第 6 回の親子 |

5 節の不具合（種類が「不具合」の行）について、gh で同じ件の issue と PR を探しましたが、見つかりませんでした（探した言葉は各回の本文）。

## 5. このシリーズで見つけたもの（食い違いと不具合）

「説明・約束」は説明文かコメントの言うこと、「実際」は記録か実装で確かめた振る舞いです。行は 8576f161ae4 で、新しい本家（origin/main、8b15295e8c7、2026-11-20）では、どの行も変わっていません（直っていない）。左に印のある行が「不具合」です。

> **🧪 一覧（種類で絞れます）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/anm-tests-issues)

## 聞かれそうな質問

**Q. 旧パッケージの spec は、どこで走らせれば全部見られますか？**

ブラウザー版の 4 つ（animations・animations/browser・platform-browser/animations・同 async の `:test_web_chromium`）と、core の `:test_web_chromium`（legacy\_animation の 4 ファイル）です。Node の `:test` は、DSL とエンジンの spec の大半が `if (isNode)` で空になるので、件数が少なく見えます（1 節）。

**Q. 見つけた不具合を直すとき、spec はどこに足しますか？**

timeline の計算なら browser/test/dsl/animation\_spec.ts の `invokeAnimationSequence` を使う it が一番書きやすく、3 節のとおり Node でなくブラウザー版で走ります。テンプレートとエンジンを通した振る舞いは core/test/legacy\_animation/ の spec です。プレイヤーの reset は animations/test/animation\_player\_spec.ts と browser/test/render/web\_animations/web\_animations\_player\_spec.ts です。

**Q. このシリーズの食い違いは、新しい本家で直っていますか？**

どれも直っていません。8576f161ae4 から origin/main（2026-11-20）までに packages/animations の src で変わったのは animation\_renderer.ts（a62ae5b04df、メモリリーク）だけで、5 節の行はどれも同じです。

**Q. 閉じられた issue と、5 節の行の関係は？**

#46928（動かせないプロパティの誤った警告）は第 7 回の表の古さと同じ所、#66399（stagger の例が動かない）は第 2 回の例と同じ所で、どちらも「旧パッケージは非推奨」として閉じられています。#26630 を直した変更が、第 3・7 回の reset のあとの 2 回呼びの形を入れました。

## 読み終えて

- 件数はブラウザー版で見る。browser/test は 124 本、core の legacy\_animation を含む web 版は 1591 本。
- 食い違いと不具合は、spec の無い形（stagger と style の組み合わせ、reset のあと、2 回目の finish、表に無いプロパティ）の上にあった。
- `stagger('full')` は 1 行で直り、本家の spec の形で 2 本足すと、直しの有無で通る・落ちるが分かれた。
- 開いている issue は 2 件で、多くの旧パッケージの issue は 2025-08-20 前後に非推奨を理由に閉じられた。5 節の行はどれも新しい本家で直っていない。

---

← 前: [provideAnimations と BrowserAnimationsModule の説明文](08-anm-module.md)
