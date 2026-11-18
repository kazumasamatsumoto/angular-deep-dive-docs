[目次](../README.md) › [Signal Forms のフィールドの木：子を作り、配列を追い、古い木と橋をかける](README.md) › 第 5 回 / 全 5 回

# spec と issue を読む：フィールドの木を固めているテスト

> packages/forms/signals/test の node と web の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で 1 行ずつ変えて見つけた spec の無い行、フィールドの木の issue と PR の表、origin/main の続きと、このシリーズで見つけたもの。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sft-tests-issues)

---

シリーズの最後に、第 1〜4 回で読んだフィールドの木の約束を固めている spec が、どのファイルのどの describe にあり、どの Bazel の target で走るかを地図にします。手元で走らせた数を書き、spec を 3 本読み、作業木で 1 行ずつ変えて「spec が固めていない行」を探した結果と、フィールドの木の issue と PR の表、origin/main の続き、このシリーズで見つけたものをまとめます。

読む対象は `packages/forms/signals/test/node/` と `test/web/` の spec のファイルです（../angular、8576f161ae4）。`node/BUILD.bazel` の中身は[forms シリーズの全体の章](../forms/01-forms-overview.md)、`web/BUILD.bazel` と web の suite の作りは[sfd-tests-issues](../sfd/06-sfd-tests-issues.md)、1 本だけ走らせる方法は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. 子の作り方](01-sft-structure.md)
2. [2. 配列の追跡と孤児](02-sft-array-identity.md)
3. [3. proxy と context](03-sft-proxy-context.md)
4. [4. SignalFormControl と extract](04-sft-signal-form-control.md)
5. **5. spec と issue**（この章）

## 1. spec の地図

パスは `packages/forms/signals/test/` から、括弧の数は describe の行です。「it」は行の頭が `it(` の数で、このシリーズに関係するファイルだけを並べています（node の 539 本のうち 287 本、web の 350 本のうち 12 本）。フィールドの木は DOM が要らないので、約束のほとんどは node の側にあります。web の側は `@for` と `[formField]` を通したときの振る舞いです。

| ファイル | describe（行） | it | target | 章 |
| --- | --- | --- | --- | --- |
| `node/field_node.spec.ts` | FieldNode（45）› instances（58）5・resetting（159）7・fieldTree（216）3・dirty（236）13・touched（446）16・arrays（723）9（その中の tracking 795）・names（846）3・disabled（867）5・readonly（976）4・validation（1042）9・errorSummary（1311）7・composition（1452）1・predefined schema（1480）4・reset（1556）5 | 92 | `node:test` | [第 1 回](01-sft-structure.md)・[第 2 回](02-sft-array-identity.md) |
| `node/api/structure.spec.ts` | structure APIs（13）› apply（14）・lazy materialization（88） | 7 | `node:test` | [第 1 回](01-sft-structure.md) |
| `node/dynamic.spec.ts` | dynamic data patterns（15）› tracking（36） | 3 | `node:test` | [第 2 回](02-sft-array-identity.md) |
| `node/field_proxy.spec.ts` | FieldTree proxy（13） | 11 | `node:test` | [第 3 回](03-sft-proxy-context.md) |
| `node/field_context.spec.ts` | Field Context（44） | 9 | `node:test` | [第 3 回](03-sft-proxy-context.md) |
| `node/recursive_logic.spec.ts` | recursive schema logic（34） | 3 | `node:test` | [第 3 回](03-sft-proxy-context.md) |
| `node/deep_signal.spec.ts` | deepSignal（12） | 3 | `node:test` | [第 1 回](01-sft-structure.md) |
| `node/form.spec.ts` | form（13）› injection context（14） | 5 | `node:test` | [第 3 回](03-sft-proxy-context.md) |
| `node/api/metadata.spec.ts` | metadata（13）（67e50693274 が origin/main で注入器の it を足した） | 6 | `node:test` | [第 1 回](01-sft-structure.md)・[第 3 回](03-sft-proxy-context.md) |
| `node/compat/signal_form_control.spec.ts` | SignalFormControl（29）› value and state access（30）・validation（53）・status management（142）・observables and events（286）・reset（452）・unsupported methods（528）・callback registration（642）・effects and loops（689）・dependency injection（733） | 57 | `node:test` | [第 4 回](04-sft-signal-form-control.md) |
| `node/compat/signal_form_control_in_form_group.spec.ts` | SignalFormControl in FormGroup（21）› integration with parent（259）› array fieldTree（324）・FormArray（373） | 28 | `node:test` | [第 4 回](04-sft-signal-form-control.md) |
| `node/compat/compat.spec.ts` | Forms compat（28）› validation（124）・state propagation（230）・exposing control（413）・arrays（556）・FormGroup（605）・type test all rules（684）・type tests（752） | 32 | `node:test` | [第 4 回](04-sft-signal-form-control.md) |
| `node/compat/extract_value.spec.ts` | extractValue（15）› filtering by touched（152）・filtering by enabled（219） | 21 | `node:test` | [第 4 回](04-sft-signal-form-control.md) |
| `node/compat/compat_validation_error.spec.ts` | destroy$（18）・extracts validation errors（35）・signalErrorsToValidationErrors（70） | 10 | `node:test` | [第 4 回](04-sft-signal-form-control.md) |
| `web/orphan_repro.spec.ts` | Signal Forms array removal orphan repro（13） | 3 | `web:test` | [第 2 回](02-sft-array-identity.md) |
| `web/field_proxy.spec.ts` | field proxy（14） | 1 | `web:test` | [第 3 回](03-sft-proxy-context.md) |
| `web/assertions.spec.ts` | assertions（13） | 2 | `web:test` | [第 3 回](03-sft-proxy-context.md) |
| `web/compat_form.spec.ts` | compatForm with \[formField\] directive（16） | 3 | `web:test` | [第 4 回](04-sft-signal-form-control.md) |
| `web/signal_form_control_web.spec.ts` | SignalFormControl (web)（17） | 3 | `web:test` | [第 4 回](04-sft-signal-form-control.md) |
| `Object.freeze` した要素を配列のモデルに入れると、要素を一度も読まなくても最初の変更検知で TypeError（掃除の effect が `children()` で子を作り、要素に印を書き込もうとする） | `field/structure.ts` 365 行目（`??=` で要素に書き込む）と `field/manager.ts` 84 行目 | Node の記録（stack に `markStructuresLive` → `children`） | #70840 に凍結の件はあるが、読まなくても最初の tick で投げることは書かれていない | [第 2 回](02-sft-array-identity.md) |
| 孤児のエラーの小さなずれ: `ORPHAN_FIELD_ARRAY`（1903）を投げる所がもう無い。根の直下の子が孤児になると、文言に出る親（根）の名前が `<root>.` と点で終わる。孫が孤児になると、親の `keyInParent` が先に投げて親のキーの文言になる | `errors.ts` 18 行目（3c44d7c90b2 から投げる所が 0 件）、`field/structure.ts` 585 行目の `getDebugName` | grep と Node の記録 | 無し | [第 1 回](01-sft-structure.md)・[第 2 回](02-sft-array-identity.md) |

第 1 回の子の作り方は `field_node.spec.ts` の `instances` と `structure.spec.ts` の `lazy materialization`、第 2 回の配列の追跡は `field_node.spec.ts` の `arrays › tracking`・`dynamic.spec.ts`・web の `orphan_repro.spec.ts` が主な置き場です（それぞれの章の「テストと直し方」）。第 3 回の Proxy は `field_proxy.spec.ts` の 2 つ、context は `field_context.spec.ts` と `recursive_logic.spec.ts`、第 4 回は `compat/` の 5 つのファイルです。

## 2. 手元で走らせた結果

8576f161ae4 の ../angular で、次のコマンドを走らせました（2026-11-18）。

📄 `走らせたコマンド`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/forms/signals/test/web:test_chromium --nocache_test_results --test_output=all
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=FieldTree proxy"
# 作業木は git -C ~/angular-research/angular-fix worktree add <scratchpad>/sft-wt-b 8576f161ae4 で作り、
# そこで ~/angular-research/angular/node_modules/.bin/bazel test … を直接走らせた（終わってから worktree remove --force で消した）
```

| target | 結果 |
| --- | --- |
| `//packages/forms/signals/test/node:test` | PASSED（539 specs, 0 failures、2.8 秒） |
| `//packages/forms/signals/test/web:test_chromium` | PASSED（Chromium 1/1 test files、350 passed, 0 failed） |
| `node:test --filter=FieldTree proxy` | Ran 11 of 539 specs、0 failures |
| `node:test --filter=Field Context` | Ran 9 of 539 specs、0 failures |
| `node:test --filter=recursive schema logic` | Ran 3 of 539 specs、0 failures |
| `node:test --filter=SignalFormControl` | Ran 85 of 539 specs、0 failures（2 つのファイルの 57 + 28） |
| `node:test --filter=extractValue` | Ran 21 of 539 specs、0 failures |
| `node:test --filter=compat` | Ran 36 of 539 specs、0 failures |

node の Jasmine は `--test_arg=--filter=…` で describe と it の名前の一部で絞れ、ログの `Ran 11 of 539 specs` で絞れたかが分かります。web の suite は 1 つの bundle を丸ごと走らせるので、絞り込みは効かず、いつも 350 本が走ります。

## 3. spec を 3 本読む

📄 `angular/packages/forms/signals/test/node/field_proxy.spec.ts` L57–82 （▶ の行: 57, 62, 66, 68, 72, 75, 77, 79, 81）

```ts
57 ▶   it('should be reactive when children change, but not on value mutations', async () => {
58 │     const injector = TestBed.inject(Injector);
59 │     const appRef = injector.get(ApplicationRef);
60 │     const value = signal<{a: number; b?: number}>({a: 1});
61 │     const f = form(value, {injector});
62 ▶     expect(f.b).not.toBeDefined();
63 │ 
64 │     const log: string[] = [];
65 │ 
66 ▶     effect(
67 │       () => {
68 ▶         log.push(`a: ${f.a().value()}`);
69 │       },
70 │       {injector},
71 │     );
72 ▶     await appRef.whenStable();
73 │     expect(log).toEqual(['a: 1']);
74 │ 
75 ▶     value.set({a: 1, b: 2});
76 │     await appRef.whenStable();
77 ▶     expect(log).toEqual(['a: 1']);
78 │ 
79 ▶     value.set({a: 2, b: 2});
80 │     await appRef.whenStable();
81 ▶     expect(log).toEqual(['a: 1', 'a: 2']);
82 │   });
```

第 3 回と第 1 回の約束を同時に見る 1 本です。62 行目、まだ値に無い `b` は `undefined`。66〜71 行目の effect は `f.a().value()` だけを読みます。75 行目で `b` を足しても、77 行目のとおり effect は走り直しません。`f.a` の値の signal は `a` だけを読む computed で、値が同じなら通知が止まるからです。79 行目で `a` を変えて初めて 81 行目の 2 行目が出ます。`appRef.whenStable()` を挟むのは、effect が変更検知の中で走るためです。

📄 `angular/packages/forms/signals/test/web/field_proxy.spec.ts` L14–47 （▶ の行: 15, 18, 34, 37, 41, 45–46）

```ts
14 │ describe('field proxy', () => {
15 ▶   it('@for over array field should be reactive', () => {
16 │     @Component({
17 │       selector: 'iterate-field',
18 ▶       template: `@for (i of f(); track i) {
19 │         <p>hi</p>
20 │       }`,
21 │     })
22 │     class IterateFieldCmp {
23 │       f = input.required<FieldTree<number[]>>();
24 │     }
25 │ 
26 │     @Component({
27 │       template: `
28 │         <iterate-field [f]="f" />
29 │         <button (click)="add()">add</button>
30 │       `,
31 │       imports: [IterateFieldCmp],
32 │     })
33 │     class ParentCmp {
34 ▶       f = form(signal([0]));
35 │ 
36 │       add() {
37 ▶         this.f().value.update((v) => [...v, v.length]);
38 │       }
39 │     }
40 │ 
41 ▶     const fix = act(() => TestBed.createComponent(ParentCmp));
42 │     expect(fix.nativeElement.querySelectorAll('p').length).toBe(1);
43 │ 
44 │     const btn = fix.nativeElement.querySelector('button');
45 ▶     act(() => btn.click());
46 ▶     expect(fix.nativeElement.querySelectorAll('p').length).toBe(2);
47 │   });
```

第 3 回の 2 節の「反復子を作るときに値を読む」行（`proxy.ts` の `tgt.value();`）を固めている唯一の spec です。18 行目の `@for (i of f(); track i)` は、入力の signal の中身（`FieldTree`）を反復します。37 行目で配列に 1 つ足し、45〜46 行目で `<p>` が 2 つになるのを確かめます。`act` は関数を走らせたあとに `TestBed.tick()` で変更検知を 1 回回す道具です（sfd-tests-issues の 4 節）。その行が無いと、`@for` の差分が反復子の外で `next()` を呼ぶので、テンプレートが値に依存せず、46 行目が 1 のままで落ちます。

📄 `angular/packages/forms/signals/test/node/compat/signal_form_control_in_form_group.spec.ts` L240–257 （▶ の行: 240, 249, 251–252, 254–255）

```ts
240 ▶   it('should not notify parent when onlySelf is true', () => {
241 │     const form = createSignalFormControl(10);
242 │     const value = form.sourceValue;
243 │     const group = new FormGroup({
244 │       n: form,
245 │     });
246 │ 
247 │     const parentEmissions: unknown[] = [];
248 │     group.valueChanges.subscribe((v) => parentEmissions.push(v));
249 ▶ 
250 │     form.setValue(20, {onlySelf: true});
251 ▶ 
252 ▶     expect(parentEmissions.length).toBe(0);
253 │     expect(group.value).toEqual({n: 10});
254 ▶ 
255 ▶     expect(value()).toBe(20);
256 │     expect(form.value).toBe(20);
257 │   });
```

第 4 回の 2 節の `onlySelf` の 1 本です。249 行目の `setValue(20, {onlySelf: true})` の直後に、251〜252 行目で親が知らされていないことを確かめます。ただし effect が走る前に見ているので、`scheduleParentUpdate` の数え上げ（第 4 回の 2 節の `pendingParentNotifications++`）が無くても通ります。effect のあとに親が知らされるかは、この it は見ていません（4 節）。

## 4. spec が固めていない行

8576f161ae4 の作業木で、章で読んだ行を 1 か所ずつ消したり変えたりして、node（539 本）と web（350 本）を走らせました。落ちる spec が無い行は、直すときに一緒に spec を足す必要がある行です。

| 変えた行 | node | web | 章 |
| --- | --- | --- | --- |
| `field/proxy.ts` 56 行目（反復子を作るときの `tgt.value()`）を消す | 0 failures | 1 failed（`field proxy › @for over array field should be reactive`） | [第 3 回](03-sft-proxy-context.md) |
| `field/proxy.ts` 85 行目（`configurable = true`）を消す | 2 failures（配列のキー、`array fieldTree › should access length property`） | ― | [第 3 回](03-sft-proxy-context.md) |
| `field/context.ts` 59 行目（`stateOf` の bind）を消す | 1 failure（`Forms compat › supports getting control from stateOf`） | ― | [第 3 回](03-sft-proxy-context.md) |
| `field/context.ts` 146 行目を `Number(key)` でなく `key` に | 1 failure（`Field Context › index`） | ― | [第 3 回](03-sft-proxy-context.md) |
| `field/resolution.ts` の finally で深さを 0 に戻す行を消す | 0 failures | ― | [第 3 回](03-sft-proxy-context.md) |
| `signal_form_control.ts` 282 行目（`pendingParentNotifications++`）を消す | 0 failures | ― | [第 4 回](04-sft-signal-form-control.md) |
| `signal_form_control.ts` 313〜315 行目（`'DISABLED'`）を消す | 1 failure（`should support disabled via rules`） | ― | [第 4 回](04-sft-signal-form-control.md) |
| `compat_structure.ts` 97〜99 行目（`value.update`）を消す | 1 failure（`allows to use form control values for validation`） | ― | [第 4 回](04-sft-signal-form-control.md) |
| `api/extract.ts` 102 行目の `\|\| isContainerNode(…)` を消す | 2 failures（入れ物ごと落とす 2 本） | ― | [第 4 回](04-sft-signal-form-control.md) |
| `field/manager.ts` 84 行目を `materializedChildren()` に（#70627 の直しの形） | 0 failures | 350 passed | [第 1 回](01-sft-structure.md)・[第 4 回](04-sft-signal-form-control.md) |

最後の行は第 1 回の #70627 の直しを当てたもので、全部通ります。ところが同じ作業木で、`compatForm` の根の `valid()` だけを読む effect の spec を足すと落ちます（第 4 回の 6 節）。今の掃除の effect が、たまたま compat の子を作っているので見えていないだけで、それを固める spec はありません。

## 5. issue と PR の表

2026-11-18 に gh で読んだ、フィールドの木（子の作り方・配列の追跡・Proxy と context・compat）に関係する area: forms の issue です。開いている 14 件と、閉じた 15 件。「章」は、その issue を読むときに開く章です。PR は本文やタイトルでその issue を指しているものです。

| 章 | 開いている | 完了 | 予定なし | 重複 |
| --- | --- | --- | --- | --- |
| [第 1 回](01-sft-structure.md) | 2 | 2 | 0 | 0 |
| [第 2 回](02-sft-array-identity.md) | 4 | 4 | 3 | 1 |
| [第 3 回](03-sft-proxy-context.md) | 3 | 3 | 2 | 0 |
| [第 4 回](04-sft-signal-form-control.md) | 6 | 2 | 1 | 0 |

2 つの章にまたがる issue は両方に数えています。

| # | 状態 | 開いた日 | 閉じた日 | 中身 | PR | 章 |
| --- | --- | --- | --- | --- | --- | --- |
| #70627 | 開いている | 2026-09-09 | ― | 掃除の effect の children() が、遅延で作らなかった子を最初の tick で全部作る<br>Signal form children initialization is not really lazy | #70633（閉じた）・#71659（開いている）・#71635（失敗する spec だけ、閉じた） | [第 1 回](01-sft-structure.md) |
| #71622 | 開いている | 2026-10-26 | ― | form を持つコンポーネントを壊しても、フィールド（の注入器）が壊されない<br>Signal forms: destroying a form's component doesn't destroy its fields, so async validation keeps running | #71625（再現の spec だけ、閉じた） | [第 1 回](01-sft-structure.md) |
| #70772 | 開いている | 2026-09-17 | ― | 配列の要素を id などの業務のキーで追いたい<br>Signal Forms: allow custom identity tracking for array items | ― | [第 2 回](02-sft-array-identity.md) |
| #70840 | 開いている | 2026-09-21 | ― | 同じ印の要素が 1 つの子を共有する。凍結した要素で投げる<br>Signal Forms: array items that share the tracking symbol (spread copy) share one field — writes land in the wrong row; frozen items throw | #71217（閉じた） | [第 2 回](02-sft-array-identity.md) |
| #68511 | 開いている | 2026-05-01 | ― | string\[\] のような値にも要素ごとの子ができる（設計の議論）<br>Signal Forms: how should opaque array values be modeled - field tree creates per-element child nodes for \`Field&lt;T\[\]&gt;\` | ― | [第 2 回](02-sft-array-identity.md) |
| #71616 | 開いている | 2026-10-26 | ― | 配列の子の keyInParent が文字列（型は number）<br>signal forms: keyInParent() returns a string for array items (typed as number) | #71617（開いている） | [第 2 回](02-sft-array-identity.md)・[第 3 回](03-sft-proxy-context.md) |
| #70252 | 開いている | 2026-08-18 | ― | Proxy に has の罠が無いので、in が target の関数を見る<br>\`Symbol.iterator in FieldTree\` is always false | #70253（下書き、閉じた）・#72040（閉じた） | [第 3 回](03-sft-proxy-context.md) |
| #71266 | 開いている | 2026-10-09 | ― | 親のフィールドを読む公開の口がほしい<br>Signal forms: expose parent field access | ― | [第 3 回](03-sft-proxy-context.md) |
| #72009 | 開いている | 2026-11-12 | ― | ルールで status だけが変わると親に知らせない<br>SignalFormControl does not update its parent FormGroup when a rule changes its status (disabled / conditional validators) | #72013（閉じた）・#72014（開いている） | [第 4 回](04-sft-signal-form-control.md) |
| #68882 | 開いている | 2026-05-22 | ― | disable() が投げるので、親の FormGroup を disable できない<br>Allow disable in SignalFormControl | #69683（閉じた） | [第 4 回](04-sft-signal-form-control.md) |
| #71634 | 開いている | 2026-10-26 | ― | compat の errorSummary は常に空、errors に fieldTree が無い<br>Signal forms: compatForm() FormControl errors are missing from errorSummary() | #71630（再現の spec だけ、閉じた） | [第 4 回](04-sft-signal-form-control.md) |
| #71633 | 開いている | 2026-10-26 | ― | compat の parseErrors は常に空<br>Signal forms: compatForm() fields ignore parse errors, so submit() sends the last valid value | #71628（再現の spec だけ、閉じた） | [第 4 回](04-sft-signal-form-control.md) |
| #68097 | 開いている | 2026-04-08 | ― | compat の木の値を素の値で読める signal がほしい（extractValue の反応は PR #68202 で入った）<br>Reactive \`value\` signal for \`compatForm\` that unwraps \`AbstractControl\` values | #68202（マージ、b542302a23c） | [第 4 回](04-sft-signal-form-control.md) |
| #66544 | 開いている | 2026-01-14 | ― | compatForm の f().value() に FormControl がそのまま入る<br>Form value for Signal Forms with FormControls | #68330（toValueSignal を足す、閉じた） | [第 4 回](04-sft-signal-form-control.md) |
| #67212 | 完了 | 2026-02-23 | 2026-03-20 | 大きな配列で遅い。98c5afdb021（子を遅延で作る）<br>Signal forms: poor performances with large arrays | ― | [第 1 回](01-sft-structure.md) |
| #71623 | 完了 | 2026-10-26 | 2026-11-04 | フィールドごとの注入器を、使わなくても作っていた。67e50693274<br>Signal forms: \`required()\`, \`min()\`, and other built-in rules create an injector for every field | #71626（再現の spec だけ、閉じた） | [第 1 回](01-sft-structure.md)・[第 3 回](03-sft-proxy-context.md) |
| #63882 | 完了 | 2025-09-17 | 2025-11-13 | 並べ替えで @for が DOM を動かさなかった（配列の追跡の前）<br>@for does not properly track an array of signal form fields | ― | [第 2 回](02-sft-array-identity.md) |
| #66711 | 完了 | 2026-01-22 | 2026-05-05 | 消した行の blur が孤児の keyInParent を読んで落ちる。3c44d7c90b2<br>Signal forms array field tracking value causes orphan field error | ― | [第 2 回](02-sft-array-identity.md) |
| #66796 | 重複 | 2026-01-28 | 2026-01-30 | track の式が孤児の value() を読む<br>Signal Forms: Using \`@for(userForm of valueForm.users; track userForm.id().value())\` causes runtime error | ― | [第 2 回](02-sft-array-identity.md) |
| #65881 | 予定なし | 2025-12-05 | 2025-12-11 | 孤児のフィールドの NG01904<br>Signal Forms: orphan field, can't find element in array &lt;root&gt; | ― | [第 2 回](02-sft-array-identity.md) |
| #67620 | 予定なし | 2026-03-11 | 2026-03-11 | \*ngFor で配列のフィールドを回す<br>Signal Forms: working with arrays not working with ngFor | ― | [第 2 回](02-sft-array-identity.md)・[第 3 回](03-sft-proxy-context.md) |
| #68441 | 完了 | 2026-04-29 | 2026-04-30 | 要素を足しても木が増えない（モデルを書き換えていた）<br>Signal Form \`fieldTree\` not updated when the form's model adds elements to array properties at runtime | ― | [第 2 回](02-sft-array-identity.md) |
| #70692 | 予定なし | 2026-09-11 | 2026-09-13 | 入れ子の form() が親の reset で孤児になる<br>reset() on parent form orphans nested form() inside FormValueControl using transformedValue (NG01904) | ― | [第 2 回](02-sft-array-identity.md) |
| #70934 | 完了 | 2026-09-25 | 2026-10-02 | 外した view のクラスの束縛が孤児を読む。c0dc8c4bbee<br>Signal Forms: NG01904 from \`provideSignalFormsConfig({ classes })\` when an array is replaced while the form's view is detached (RouteReuseStrategy) | ― | [第 2 回](02-sft-array-identity.md) |
| #69984 | 完了 | 2026-07-28 | 2026-07-29 | isFieldTree を足した。2a141847a5e<br>Implement isFieldTree() as parallel to isSignal() | ― | [第 3 回](03-sft-proxy-context.md) |
| #67705 | 予定なし | 2026-03-16 | 2026-03-16 | FieldState.fieldTree の型が FieldTree&lt;unknown&gt;<br>Signal Forms: Type of FieldState.fieldTree seems wrong? | ― | [第 3 回](03-sft-proxy-context.md) |
| #71621 | 完了 | 2026-10-26 | 2026-11-10 | valueOf の instanceof AbstractControl。4422f4ef509<br>Signal forms: every app that uses \`form()\` ships \`AbstractControl\` and \`Validators\` from reactive forms | #71624（計測の spec だけ、閉じた） | [第 3 回](03-sft-proxy-context.md)・[第 4 回](04-sft-signal-form-control.md) |
| #68905 | 完了 | 2026-05-24 | 2026-11-02 | compat の required が Validators.required を映さない。97bde8aa6cb<br>\[Signal Forms\] \`compatForm\` signal form \`required\` state does not reflect \`Validators.required\` | #68911（マージ）・#68913（閉じた） | [第 4 回](04-sft-signal-form-control.md) |
| #66047 | 予定なし | 2025-12-13 | 2025-12-13 | compat のフィールドに disabled のルールを効かせたい<br>Support disabled rule for compatForm | ― | [第 4 回](04-sft-signal-form-control.md) |

- **開いている 14 件のうち 9 件に、閉じた PR があります。**#70252（`has` の罠、2 本）・#70840（同じ印の要素）・#68882（disable）・#70627・#72009・#66544 と、下の「再現の spec だけ」の 3 件です。#70627・#71616・#72009 には開いている PR もあります。
- **2026-10-26 に 1 人の報告者が開いた issue**（この表では #71621〜#71623・#71633・#71634）には、同じ人の「再現の spec だけ」の PR（#71624〜#71626・#71628・#71630）が付き、どれも閉じています。issue のうち #71621 と #71623 は、別の人のコミット（4422f4ef509・67e50693274）で完了しました。
- **閉じた issue の多くは配列と孤児です**（第 2 回）。予定なしの 3 件（#65881・#67620・#70692）は、使い方（`track` の書き方や、木の外でのフィールドの使い方）で返したものです。

## 6. origin/main の続き

`git log 8576f161ae4..origin/main -- packages/forms/signals`（origin/main は ca92b968b8e、2026-11-16）の 38 本のうち、フィールドの木に関係するものです。サイトの依存の 22.2.6 の `.mjs` に入っているかは、それぞれの章で確かめました。

| コミット | 中身 | 22.2.6 | 章 |
| --- | --- | --- | --- |
| `67e50693274` | フィールドの注入器を、使うときにだけ作る。`destroy()` は作った注入器だけを壊す（#71623） | 入っている | [第 1 回](01-sft-structure.md)・[第 3 回](03-sft-proxy-context.md) |
| `cf37344a4d6` | touched にするとき、検証を飛ばす部分木でも debounce 中の値を書く（`materializedChildren()` だけをたどる） | 入っている（`skipValidation ? this.structure.materializedChildren()`） | [第 1 回](01-sft-structure.md) |
| `c0dc8c4bbee` | 孤児のフィールドでは classes の束縛を飛ばす（#70934） | 入っている | [第 2 回](02-sft-array-identity.md) |
| `d2f5ec92de9`・`5d7303aeda2` | context の `valueOf`・`stateOf`・`fieldTreeOf` の型に `this: void`（型だけ）と、その spec | 型だけ | [第 3 回](03-sft-proxy-context.md) |
| `4422f4ef509` | `valueOf` の `instanceof AbstractControl` を Symbol の印に（#71621） | 入っている | [第 3 回](03-sft-proxy-context.md)・[第 4 回](04-sft-signal-form-control.md) |
| `12278e5f67b` | `normalizeFormArgs` と `SignalFormControl` の options | 入っている | [第 4 回](04-sft-signal-form-control.md) |
| `9e99093bfe3` | `SignalFormControl` の `updateOn` | 入っている | [第 4 回](04-sft-signal-form-control.md) |
| `97bde8aa6cb` | compat のフィールドの `required`（#68905） | 入っている | [第 4 回](04-sft-signal-form-control.md) |

proxy.ts・context.ts の `resolve`・compat の構造と検証の状態・`extract.ts` の中身は、origin/main でも 8576f161ae4 と同じです（`extract.ts` は doc の `{@link}` の書き方だけ、`resolution.ts` はコメントの例だけが変わった）。

## このシリーズで見つけたもの

このシリーズを書いている途中で見つけたものです。どれも **issue も PR も出していません**。ソースの行は 8576f161ae4 で、origin/main（ca92b968b8e）とサイトの 22.2.6 の `.mjs` でも同じ形であることを確かめました。再現は、22.2.6 で動かしたページの上のデモと Node の記録、8576f161ae4 の作業木に足した spec（node:test）です。gh で探した範囲で、同じことを報告した issue があるものは「既存」に書きました。

| 何が起きるか | ソースの行 | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| 値が文字列・数・`null` のフィールドに `Object.hasOwn(f.name, 'x')`・`Object.getOwnPropertyDescriptor(f.name, 'x')` を呼ぶと TypeError（`Reflect.getOwnPropertyDescriptor called on non-object`）。`Object.keys(f.name)` は `[]` | `field/proxy.ts` 80〜88 行目（82 行目が値をそのまま渡す。90〜93 行目の ownKeys にはある「オブジェクトでなければ」の分かれ道が無い）。e87f423d907 から | 第 3 回の DEMO 1、作業木の spec（`Expected function not to throw`） | 無し | [第 3 回](03-sft-proxy-context.md) |
| 再帰のスキーマで、同じフィールドに違う深さで付けた 2 つのルールが同じ path を `valueOf`・`stateOf`・`fieldTreeOf` で読むと、2 番目のルールが 1 番目の深さで決まったフィールドを受け取る（B だけなら `next.data`、A と並べると根の `data`） | `field/context.ts` 46〜49・110・112 行目（cache の鍵が path だけ）と 79 行目（深さはモジュールの変数で、鍵にも依存にも入らない）、`field/resolution.ts` 9 行目。b8314bd3409 から | 第 3 回の DEMO 2 と Node の記録、作業木の spec（`Expected $[1] = 'B:D0' to equal 'B:D1'`） | 無し | [第 3 回](03-sft-proxy-context.md) |
| `SignalFormControl` を `FormGroup` に入れると、最初の変更検知、`markAsPristine()`・`markAsUntouched()`、dirty だったものの `reset()` のたびに、**兄弟の**`FormControl` の dirty・touched が消える | `compat/src/signal_form_control/signal_form_control.ts` 164〜168・182〜186・398・403 行目（親の `markAsUntouched()`・`markAsPristine()` を呼ぶ。リアクティブフォームは親に `_updatePristine`・`_updateTouched` を呼ぶ） | 第 4 回の DEMO 1、作業木の spec 2 本 | 無し | [第 4 回](04-sft-signal-form-control.md) |
| `ctrl.fieldTree().value.set(v)` 1 回で親の `valueChanges` が 2 回（`reset()` は値が変わると 3 回）。`FormGroup` に入れただけで、最初の変更検知で親の `valueChanges` が 1 回 | 同じファイルの 110〜112 行目（`onUpdate` が数えずに親を呼ぶ）と 287〜296 行目、値の effect の最初の 1 回（118〜128 行目） | 第 4 回の DEMO 1、作業木の spec 2 本 | #72009 の PR #72014（開いている）の書き換えで変わる形 | [第 4 回](04-sft-signal-form-control.md) |
| `[...ctrl.fieldTree]`・`for...of` で取り出した配列の子は包まれていない木で、`value.set` しても親がその場で追いつかない（`[...ctrl.fieldTree][0] !== ctrl.fieldTree[0]`） | 同じファイルの 535 行目（`typeof prop === 'string'` で `Symbol.iterator` を包まない）と `field/proxy.ts` 57 行目（内側の `tgt.fieldTree` に反復子を当てる） | Node の記録、作業木の spec（`Expected $.c[0] = 'a' to equal 'X'`） | 無し | [第 4 回](04-sft-signal-form-control.md) |
| `compatForm` の根の `valid()`・`invalid()` は、compat の子を一度も読む前は `FormControl` の validator を見ない。今は掃除の effect が最初の tick で子を作るので、それより前の同期の読み出しだけで見えるが、#70627 の 1 行の直しを当てると tick のあとも見えたまま（既存の spec は全部通る） | `field/structure.ts` の `computeChildrenMap` の遅延の判断（どの子にもスキーマのルールが無ければ子を作らない、98c5afdb021）と、`compat/src/compat_structure.ts`（compat の子の検証はルールでなく control から来る）、`field/manager.ts` 84 行目 | 第 4 回の DEMO 2、作業木の spec 2 本（manager.ts をそのまま／直したとき） | 無し（#70627 の PR #71659 が開いている） | [第 4 回](04-sft-signal-form-control.md)・[第 1 回](01-sft-structure.md) |

ほかに、既存の issue を今のコードで確かめたものがあります。第 1 回の掃除の effect が遅延で作らなかった子を全部作ること（#70627）、第 2 回の同じ印の要素が 1 つの子を共有すること（#70840）と `keyInParent` が文字列であること（#71616）、第 3 回の `in` が子のキーを見ないこと（#70252）、第 4 回の status の変化を親に知らせないこと（#72009）・compat の `errorSummary`・`parseErrors` が空であること（#71634・#71633）です。小さなものでは、`compat/src/api/extract.ts` の先頭に、b542302a23c のあとで使われなくなった `untracked` の import が残っています（origin/main も同じ）。

## 聞かれそうな質問

**Q. フィールドの木の振る舞いを 1 本だけ試したいとき、どの target を走らせますか？**

`//packages/forms/signals/test/node:test` に `--test_arg=--filter=…` を付けます。フィールドの木の spec はほとんど node の側にあり、Jasmine なので名前で絞れます（2 節）。`@for` を通す 1 本（`field proxy`）だけは web の側で、そちらは絞れず 350 本が走ります。

**Q. Proxy の反復子が @for に反応することは、どこで固まっていますか？**

`test/web/field_proxy.spec.ts` 15 行目の 1 本だけです（3 節）。作業木で `proxy.ts` の反復子の中の `tgt.value();` を消すと、node の 539 本は全部通り、この 1 本だけが落ちます（4 節）。

**Q. SignalFormControl の親への知らせの回数は spec で固まっていますか？**

固まっていません。`signal_form_control_in_form_group.spec.ts` は親の値と status をその場で見るもので、effect のあとの回数は見ていません。`pendingParentNotifications++` を消しても全部通り、`fieldTree().value.set` で 2 回知らせることもどの spec も見ていません（3・4 節）。

**Q. このシリーズの issue で、いちばん多いのはどの章ですか？**

第 2 回（配列の追跡と孤児）です。開いているものは第 4 回（compat）が多く、#72009・#71634・#71633・#68882・#68097・#66544 の 6 件があります（5 節）。

## 読み終えて

- フィールドの木の spec は node の側に集まっていて、`node:test` の 539 本のうち、このシリーズに関係するのは 287 本です。名前で絞って走らせます。
- 反復子を作るときに値を読む行は web の 1 本だけが固め、`pendingParentNotifications` と `resolve` の深さの後始末はどの spec も固めていません。
- #70627 の直しは、`compatForm` の根の `valid()` を見えたまま壊す組み合わせで、今の spec はそれを捕まえません。
- 開いている issue は配列の追跡と compat に多く、閉じた PR の多い issue（#70252・#70840・#68882）が残っています。

---

← 前: [SignalFormControl と extract：リアクティブフォームの中の Signal Forms](04-sft-signal-form-control.md)  
次: [コンポーネントの前と後：テンプレートと class は JS に、CSS は styles の文字列に](../bmap/01-bmap-component.md) →
