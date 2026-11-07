[目次](../README.md) › [フォームの内側](README.md) › 第 20 回 / 全 20 回

# forms の issue と PR を読む：どこから関わるか

> area: forms と forms: \* のラベルで open の issue 159 件を分け、forms: signals が半数を超えることと、state: confirmed のまま残る古い issue（#14988・#48350 など）がこのシリーズのどの回の行の話かを読む。最近マージされた forms の PR 30 本の大きさと種類（docs / test / fix / refactor / perf）を並べ、小さな変更が多いことを見る。issue を手元の spec で再現する下書きと、コメントで役に立つ書き方。2026-11-01 時点のスナップショット。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-issues)

---

このシリーズで読んできた仕組みが、本家の issue と PR ではどう話題になっているかを見る回です。数字はすべて **2026-11-01 時点のスナップショット**です（open の `area: forms` の issue 159 件と、最近マージされた `area: forms` の PR 30 本を、読み取りだけの `gh` で JSON に落としたもの）。issue は日々増えたり閉じたりするので、読むときは自分で取り直してください。

この章でしないこと：本家にコメントや PR を出すことは勧めません。この章のゴールは、issue を読んで「どの回の、どの行の話か」を言えること、そして手元の spec で確かめた結果を**下書き**にできることです。ラベルの一般的な意味と triage の流れは [contrib-triage](../contrib/12-contrib-triage.md) で読んだので、ここでは繰り返しません。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. [3. updateValueAndValidity](03-forms-update-value-validity.md)
4. [4. Validators](04-forms-validators.md)
5. [5. 非同期の検証](05-forms-async-validators.md)
6. [6. events](06-forms-control-events.md)
7. [7. FormGroup と FormArray](07-forms-form-group-array.md)
8. [8. 型付きフォームと FormBuilder](08-forms-typed-forms.md)
9. [9. ControlValueAccessor](09-forms-value-accessor.md)
10. [10. 双方向の配線](10-forms-setup-control.md)
11. [11. 組み込みの accessor](11-forms-builtin-accessors.md)
12. [12. リアクティブのディレクティブ](12-forms-reactive-directives.md)
13. [13. NgModel と NgForm](13-forms-ng-model.md)
14. [14. 検証のディレクティブ](14-forms-validator-directives.md)
15. [15. 状態クラス](15-forms-status-classes.md)
16. [16. Signal Forms のスキーマ](16-forms-sf-schema.md)
17. [17. Signal Forms の検証](17-forms-sf-validation.md)
18. [18. 状態ルールと metadata](18-forms-sf-rules-metadata.md)
19. [19. submit と相互運用](19-forms-sf-submit-compat.md)
20. **20. issue と PR を読む**（この章）

## 0. データの取り方

📄 `ターミナル（読み取りだけ）`

```
# 読み取りだけ。コメント・ラベル・issue の作成はしない
gh issue list --repo angular/angular --label "area: forms" --state open --limit 200 \
  --json number,title,labels,createdAt,comments > issues-area-forms.json
gh pr list --repo angular/angular --label "area: forms" --state merged --limit 30 \
  --json number,title,mergedAt,additions,deletions,changedFiles > prs-merged-forms.json

gh issue view 14988 --repo angular/angular --comments
gh pr view 71177 --repo angular/angular --json title,files,body
```

`gh issue list` / `gh pr list` / `gh issue view` / `gh pr view` は読むだけのコマンドです。`gh issue comment`・`gh issue edit`・`gh pr review` のような書き込みのコマンドはこの章では一度も使いません。PR の一覧は `--limit 30` なので、実際に入ったのは 2026-09-09〜10-28 にマージされた 30 本です。

## 1. forms のラベルの地図

open の `area: forms` 159 件に付いている `forms: *` のラベルを数えると次のとおりです（1 件に複数付くことがあります）。

| ラベル | 件数 | 主に関係する回 |
| --- | --- | --- |
| `forms: signals` | 89 | [第 16〜19 回](16-forms-sf-schema.md) |
| `forms: ngModel` | 4 | [第 13 回](13-forms-ng-model.md) |
| `forms: Controls API` | 4 | [第 2・3 回](02-forms-abstract-control.md) |
| `forms: strictly typed` | 4 | [第 8 回](08-forms-typed-forms.md) |
| `forms: validators` | 3 | [第 4・14 回](04-forms-validators.md) |
| `forms: directives` | 2 | [第 12 回](12-forms-reactive-directives.md) |
| `forms: ControlValueAccessor` | 2 | [第 9〜11 回](09-forms-value-accessor.md) |
| `forms: template-driven` | 1 | [第 13 回](13-forms-ng-model.md) |
| `forms: disabling controls` | 1 | [第 10 回](10-forms-setup-control.md) |
| `forms: DOM` | 0 | — |
| `forms: dynamic` | 0 | — |
| `forms: change detection` | 0 | — |
| （`forms: *` が 1 つも無い） | 51 |   |

- **`forms: signals` が 89 件**で、159 件の半分を超えます。そのうち 72 件は 2026 年に作られた issue です。
- `forms: DOM`・`forms: dynamic`・`forms: change detection` はラベルとしてはありますが、このスナップショットの open の issue には 0 件でした。
- ほかに多いラベルは `feature`（20）、`P3`（19）、`feature: under consideration`（16）、`type: bug/fix`（16）、`state: confirmed`（14）。優先度の P0〜P5 と `state: *` の意味は [contrib-triage](../contrib/12-contrib-triage.md) の表のとおりです。

> **🧪 DEMO — 159 件をラベルで絞り込む（2026-11-01 のスナップショット）**
>
> データは章のコードに定数として埋め込んであり、GitHub には問い合わせません。行の番号は github.com の issue を新しいタブで開きます。最初は `state: confirmed` で絞り込んであります。
>
> 作られた年ごとの件数（open のまま残っているもの）：
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-issues)

## 2. state: confirmed のまま残っている古い issue

`state: confirmed`（チームが再現を確かめた）が付いた 14 件は、2016〜2022 年に作られたものばかりです。どの回の仕組みの話かを並べます。「関係する回」は issue の主題がどの仕組みに当たるかで、原因がその回の行だと断定するものではありません。

| # | 作成 | 主題 | 関係する回 | コメント |
| --- | --- | --- | --- | --- |
| [#9275](https://github.com/angular/angular/issues/9275) | 2016-06-16 | チェックボックスと ngModel | [第 11 回](11-forms-builtin-accessors.md) | 46 |
| [#13063](https://github.com/angular/angular/issues/13063) | 2016-11-23 | ngModelChange の中で model を書き換える | [第 13 回](13-forms-ng-model.md) | 9 |
| [#13674](https://github.com/angular/angular/issues/13674) | 2016-12-27 | 入れ子の enable() / disable() | [第 3 回](03-forms-update-value-validity.md) | 4 |
| [#14057](https://github.com/angular/angular/issues/14057) | 2017-01-22 | 差し替えのあとの「There is no FormControl instance attached」 | [第 12 回](12-forms-reactive-directives.md) | 42 |
| [#14988](https://github.com/angular/angular/issues/14988) | 2017-03-07 | writeValue が null で 1 回多く呼ばれる | [第 13 回](13-forms-ng-model.md) | 71 |
| [#16933](https://github.com/angular/angular/issues/16933) | 2017-05-22 | FormArray.at の型 | [第 8 回](08-forms-typed-forms.md) | 13 |
| [#19491](https://github.com/angular/angular/issues/19491) | 2017-09-29 | 同じ name のラジオの 1 つを消すと control ごと消える | [第 13 回](13-forms-ng-model.md) | 2 |
| [#21109](https://github.com/angular/angular/issues/21109) | 2017-12-20 | valueChanges の中で updateValueAndValidity | [第 3 回](03-forms-update-value-validity.md) | 3 |
| [#23657](https://github.com/angular/angular/issues/23657) | 2018-05-02 | 検証の状態を読むと ExpressionChanged | [第 15 回](15-forms-status-classes.md) | 60 |
| [#29218](https://github.com/angular/angular/issues/29218) | 2019-03-11 | writeValue が ngOnInit より前に呼ばれる | [第 10 回](10-forms-setup-control.md) | 27 |
| [#30653](https://github.com/angular/angular/issues/30653) | 2019-05-24 | ngModelOptions の updateOn: 'blur' | [第 10 回](10-forms-setup-control.md) | 6 |
| [#38196](https://github.com/angular/angular/issues/38196) | 2020-07-23 | ラジオとリアクティブフォームのずれ | [第 11 回](11-forms-builtin-accessors.md) | 4 |
| [#42815](https://github.com/angular/angular/issues/42815) | 2021-07-10 | 入れ子の ControlValueAccessor と検証 | [第 14 回](14-forms-validator-directives.md) | 15 |
| [#48350](https://github.com/angular/angular/issues/48350) | 2022-12-04 | \[disabled\] と formControlName | [第 10 回・第 12 回](10-forms-setup-control.md) | 46 |

### #14988：writeValue が null で 1 回多く呼ばれる（2017-03-07）

本文の主張は「`[(ngModel)]` で使うと、自作の accessor の `writeValue` が最初に `null`、次に本当の値の 2 回呼ばれる。`formControlName` では起きない」です。[第 13 回](13-forms-ng-model.md)で読んだ行に、そのまま当てはまります。

1. **値 null の control**

   `NgModel` はフィールドで `new FormControl()` を作る（第 13 回の ng\_model.ts 173 行目）。
2. **先に積まれた then**

   `NgForm.addControl` が microtask の中で `setUpControlValueAccessor` を呼び、そこで `writeValue(control.value)` = `writeValue(null)`（第 13 回の ng\_form.ts 228〜233 行目、[第 10 回](10-forms-setup-control.md)の `writeValue` の行）。
3. **後に積まれた then**

   `NgModel._updateValue` が `setValue(model)` し、`writeValue(model)`（第 13 回の ng\_model.ts 425〜430 行目）。
4. **リアクティブ**

   `FormControl` は最初から値を持っていて、登録も同期なので 1 回だけ（[第 12 回](12-forms-reactive-directives.md)）。

第 13 回のデモは本物の @angular/forms 22.1.6 で、この順番（`writeValue(null)` → `writeValue("Alice")`）がそのまま出ます。では、なぜ 9 年以上 open なのか。スレッドを読むと分かることは次のとおりです。

- 2020 年に修正の PR（#38140「fix(forms): ValueAccessor.writeValue(...) sometimes called with null」）が出ましたが、2022-01-27 にマージされずに閉じられています（`gh pr view 38140` で確かめた状態）。
- 2026-09-29 のコメントは、二重の呼び出しが `ngModel` の構造（control を先につなぎ、値を microtask であとから入れる）から来ていること、1 回目を消すと**すべてのアプリのすべての accessor**で `writeValue` の回数とタイミングが変わること、accessor 側で最初の `null` を無視すれば今でも避けられること、を挙げています。第 13 回の 4 節で読んだ「2 回目の変更検知を起こすために遅らせている」理由と合わせると、「直す」が単純な 1 行の変更ではないことが分かります。
- 71 件のコメントのうち 21 件は 120 字未満で、多くは「まだ直っていない」「進捗は？」という内容です。

### #48350：formControlName と \[disabled\]（2022-12-04、P1・regression）

📄 `angular/packages/forms/src/directives/reactive_directives/form_control_name.ts` L121–130 （▶ の行: 125–128）

```ts
121 │   /**
122 │    * @description
123 │    * Triggers a warning in dev mode that this input should not be used with reactive forms.
124 │    */
125 ▶   @Input('disabled')
126 ▶   set isDisabled(isDisabled: boolean) {
127 ▶     if (typeof ngDevMode === 'undefined' || ngDevMode) {
128 ▶       console.warn(disabledAttrWarning);
129 │     }
130 │   }
```

📄 `angular/packages/forms/src/directives/reactive_errors.ts` L95–110 （▶ の行: 96–98, 103, 108–109）

```ts
 95 │ export const disabledAttrWarning = `
 96 ▶   It looks like you're using the disabled attribute with a reactive form directive. If you set disabled to true
 97 ▶   when you set up this control in your component class, the disabled attribute will actually be set in the DOM for
 98 ▶   you. We recommend using this approach to avoid 'changed after checked' errors.
 99 │ 
100 │   Example:
101 │   // Specify the \`disabled\` property at control creation time:
102 │   form = new FormGroup({
103 ▶     first: new FormControl({value: 'Nancy', disabled: true}, Validators.required),
104 │     last: new FormControl('Drew', Validators.required)
105 │   });
106 │ 
107 │   // Controls can also be enabled/disabled after creation:
108 ▶   form.get('first')?.enable();
109 ▶   form.get('last')?.disable();
110 │ `;
```

`formControlName` の `disabled` 入力は、125〜130 行目のとおり値を使わず、開発モードで 95〜110 行目の警告を出すだけです（`[formControl]` も同じ。[第 12 回](12-forms-reactive-directives.md)の 1 節）。issue は「v14 では `[disabled]` / `[attr.disabled]` で入力欄が無効になったのに、v15 でならなくなった」という報告です。スレッドでは、v15 で accessor の `setDisabledState` を**いつも**呼ぶように変えた修正が原因と特定されています。いつも呼ぶので、control が有効なら つないだときに `setDisabledState(false)` が呼ばれ（[第 10 回](10-forms-setup-control.md)の `callSetDisabledState === 'always'` の行）、accessor が入力欄の `disabled` を `false` に書きます。旧来の動きは `ReactiveFormsModule.withConfig({ callSetDisabledState: 'whenDisabledForLegacyCode' })` で選べ、このオプションは消さない、とも書かれています。第 12 回のデモの `city: setDisabledState(false)` の行が、その「いつも呼ぶ」です。

この 2 件に共通するのは、**原因はもう分かっていて、変えると既存のアプリの振る舞いが変わる**ことです。issue が開いたままなのは「誰も調べていない」からではありません。だから「直します」と PR を出すより先に、スレッドの結論を読むことが要ります。

## 3. 最近マージされた forms の PR 30 本

| type | 本数 |
| --- | --- |
| `docs` | 14 |
| `fix` | 7 |
| `test` | 3 |
| `refactor` | 3 |
| `（type なし）` | 2 |
| `perf` | 1 |

30 本のうち **17 本は足した行と消した行の合計が 30 行以下**です。docs の 1〜2 行の直し（#70632・#70787・#71373・#71555 など）や、spec にアサーションを足すだけの test（#71639）があります。fix も、#71177（第 12 回の `addControl`）が 103 行・8 ファイルで、その多くは spec とエラーのドキュメントです。逆に #71209 は全パッケージの spec を書き換える 175 ファイルの refactor で、この 1 本が行数の大半を占めます。タイトルに type が無い 2 本（WebMCP の annotation）はタイトルのまま載せています。

| # | マージ | type | + / − | ファイル | タイトル |
| --- | --- | --- | --- | --- | --- |
| [#70582](https://github.com/angular/angular/pull/70582) | 2026-09-09 | `test` | +6 / −53 | 8 | test(forms): remove redundant change detection configuration |
| [#70615](https://github.com/angular/angular/pull/70615) | 2026-09-09 | `test` | +544 / −723 | 3 | test(forms): migrate integration tests to \`whenStable\` |
| [#70654](https://github.com/angular/angular/pull/70654) | 2026-09-10 | `（type なし）` | +30 / −2 | 6 | Add WebMCP \`consequentialHint\` annotation |
| [#70632](https://github.com/angular/angular/pull/70632) | 2026-09-10 | `docs` | +2 / −0 | 1 | docs(forms): close the unterminated code fences in the compatForm docs |
| [#70682](https://github.com/angular/angular/pull/70682) | 2026-09-11 | `docs` | +78 / −12 | 3 | docs(forms): document what required() considers empty |
| [#70555](https://github.com/angular/angular/pull/70555) | 2026-09-16 | `fix` | +28 / −1 | 2 | fix(forms): mark control as dirty before setting its value in FVC interop |
| [#70824](https://github.com/angular/angular/pull/70824) | 2026-09-21 | `docs` | +9 / −9 | 9 | docs(forms): name the default error factories in the signal validators |
| [#70787](https://github.com/angular/angular/pull/70787) | 2026-09-22 | `docs` | +0 / −1 | 1 | docs(forms): remove \`valid\` from the custom control state table |
| [#71116](https://github.com/angular/angular/pull/71116) | 2026-10-01 | `docs` | +2 / −2 | 2 | docs(forms): remove remaining experimental framing from Signal Forms docs |
| [#71005](https://github.com/angular/angular/pull/71005) | 2026-10-01 | `fix` | +130 / −6 | 3 | fix(forms): write a pending debounced value when its control is destroyed |
| [#70940](https://github.com/angular/angular/pull/70940) | 2026-10-02 | `fix` | +53 / −0 | 2 | fix(forms): skip class bindings for orphaned fields |
| [#71140](https://github.com/angular/angular/pull/71140) | 2026-10-05 | `refactor` | +194 / −175 | 3 | refactor(forms): modernize value accessor integration tests |
| [#71179](https://github.com/angular/angular/pull/71179) | 2026-10-06 | `docs` | +15 / −7 | 1 | docs(forms): use FormRoot for submission in signal forms comparison example |
| [#71191](https://github.com/angular/angular/pull/71191) | 2026-10-06 | `fix` | +29 / −1 | 2 | fix(forms): use \`Object.is\` when comparing control bindings in signal forms |
| [#71244](https://github.com/angular/angular/pull/71244) | 2026-10-10 | `docs` | +2 / −7 | 3 | docs(forms): update stale statements in the signal forms guides |
| [#71209](https://github.com/angular/angular/pull/71209) | 2026-10-12 | `refactor` | +7158 / −12189 | 175 | refactor: modernize unit tests across all packages |
| [#71156](https://github.com/angular/angular/pull/71156) | 2026-10-12 | `docs` | +34 / −3 | 4 | docs(forms): use the \`when\` option in disabled examples |
| [#71320](https://github.com/angular/angular/pull/71320) | 2026-10-13 | `docs` | +5 / −3 | 2 | docs(forms): fix signal forms compat examples |
| [#71273](https://github.com/angular/angular/pull/71273) | 2026-10-14 | `docs` | +55 / −2 | 3 | docs(forms): document that minDate and maxDate expect UTC dates |
| [#71340](https://github.com/angular/angular/pull/71340) | 2026-10-14 | `docs` | +3 / −3 | 1 | docs(forms): clarify FormRoot and submit() outcomes in the submission guide |
| [#71123](https://github.com/angular/angular/pull/71123) | 2026-10-20 | `（type なし）` | +16 / −6 | 5 | WebMCP \`debugging\` annotation |
| [#71177](https://github.com/angular/angular/pull/71177) | 2026-10-20 | `fix` | +103 / −2 | 8 | fix(forms): don't crash when formControlName has no matching control |
| [#71373](https://github.com/angular/angular/pull/71373) | 2026-10-21 | `docs` | +1 / −1 | 1 | docs(forms): fix the removeItem() field state claim in the dynamic forms guide |
| [#71491](https://github.com/angular/angular/pull/71491) | 2026-10-22 | `fix` | +23 / −5 | 3 | fix(forms): annotate field context helpers with this: void |
| [#71554](https://github.com/angular/angular/pull/71554) | 2026-10-23 | `docs` | +26 / −4 | 3 | docs(forms): show the validator message for compat errors in the migration guide |
| [#71555](https://github.com/angular/angular/pull/71555) | 2026-10-23 | `docs` | +0 / −1 | 1 | docs(forms): update stale statements in the signal forms API docs |
| [#71589](https://github.com/angular/angular/pull/71589) | 2026-10-24 | `perf` | +214 / −2 | 3 | perf(forms): match multi-select identities in a single pass |
| [#71639](https://github.com/angular/angular/pull/71639) | 2026-10-26 | `test` | +26 / −2 | 2 | test(forms): add missing assertions to two signal forms specs |
| [#71638](https://github.com/angular/angular/pull/71638) | 2026-10-26 | `refactor` | +6 / −5 | 1 | refactor(forms): correct the InputValidityMonitor doc comment |
| [#71652](https://github.com/angular/angular/pull/71652) | 2026-10-28 | `fix` | +101 / −1 | 4 | fix(forms): reject unsupported updateOn in SignalFormControl |

> [!NOTE]
> **ポイント**
>
> この表から言えるのは「マージされる forms の PR の多くは小さく、docs と test が半分以上」までです。誰が書いたか・どこの所属かは、この章では数えていません。PR の type の書き方と、レビューから merge までの流れは [contrib-commit-messages](../contrib/09-contrib-commit-messages.md) と [contrib-pr-flow](../contrib/10-contrib-pr-flow.md) です。

## 4. どう関わるか：3 つの段階

1. **① 読む**

   このシリーズで、forms のどの仕組みを行番号で説明できるかの「地図」を作りました。issue を開いたら、まず「何回の何節の話か」を決めます。1 節のデモで `forms: ngModel` や `forms: directives` の issue を開き、第 12・13 回の行で説明できるかを試すのが練習になります。
2. **② issue に役立つ形で関わる**

   手元の spec で再現できたか・できなかったか、どのバージョン（どのコミット）で、どの行から来ているか、を**下書き**にします。下に 1 つ作ります。投稿するかどうかはそのあとで決めればよく、下書きを作るだけでも、その issue の仕組みを説明できるようになります。
3. **③ 合意が取れた小さな変更を出す**

   3 節の表のとおり、入っている変更の多くは小さく、何を直すかがはっきりしています。#14988 や #48350 のように振る舞いを変える話は、スレッドで方針が決まっていないうちは PR にしません。

### 再現の spec の下書き（#14988）

📄 `angular/packages/forms/test/template_integration_spec.ts` L46–56 （▶ の行: 47, 49–52, 54）

```ts
46 │ describe('template-driven forms integration tests', () => {
47 ▶   useAutoTick();
48 │ 
49 ▶   function initTest<T>(component: Type<T>, ...directives: Type<any>[]): ComponentFixture<T> {
50 ▶     TestBed.configureTestingModule({
51 ▶       declarations: [component, ...directives],
52 ▶       imports: [FormsModule, CommonModule],
53 │     });
54 ▶     return TestBed.createComponent(component);
55 │   }
56 │ 
```

`template_integration_spec.ts` の一番外の describe です。47 行目の `useAutoTick()` で時間を進め、49〜55 行目の `initTest(component, ...directives)` が 52 行目で `FormsModule` を import した TestBed を作ります。下書きはこの `initTest` に、自作の accessor（`LoggedCva`）を 2 つ目の引数で渡す形にしました。

📄 `下書き（../angular には足していない・走らせていない）`

```
// packages/forms/test/template_integration_spec.ts の describe('ngModel corner cases') に足す想定の下書き。
// 走らせていません。期待値は ng_model.ts / ng_form.ts を読んで立てた「今の振る舞い」です。
it('calls writeValue with the initial null before the bound value (#14988)', async () => {
  const calls: unknown[] = [];

  @Component({
    selector: 'logged-cva',
    template: '',
    providers: [{provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LoggedCva), multi: true}],
    standalone: false,
  })
  class LoggedCva implements ControlValueAccessor {
    writeValue(value: unknown) {
      calls.push(value);
    }
    registerOnChange() {}
    registerOnTouched() {}
  }

  @Component({
    selector: 'ng-model-writevalue-order',
    template: `<form><logged-cva name="v" [(ngModel)]="value"></logged-cva></form>`,
    standalone: false,
  })
  class App {
    value = 'Hello';
  }

  const fixture = initTest(App, LoggedCva);
  await fixture.whenStable();

  // NgForm.addControl の then（ng_form.ts L233 → writeValue(null)）が先、
  // NgModel._updateValue の then（ng_model.ts L427 → writeValue('Hello')）があと。
  expect(calls).toEqual([null, 'Hello']);
});
```

期待値 `[null, 'Hello']` は、第 13 回で読んだ ng\_form.ts 233 行目と ng\_model.ts 427 行目の順番から立てたものです。手元のブランチで実際に足すなら、「テストと直し方」のコマンドで it の名前まで入れて走らせ、`Ran 1 of 1154 specs`（1 本足したので総数も 1 増える）になること、0 本で PASSED になっていないことを確かめます。「直ってほしい振る舞い」ではなく「今の振る舞い」を固定する spec にしているのは、#14988 のように振る舞いを変えるかどうか自体が議論になっている issue では、まず今の動きを正確に示すことがいちばん役に立つからです。

### コメントの書き方

📄 `angular/contributing-docs/auto-issue-locking.md` L14–19 （▶ の行: 16–19）

```md
14 │ ## Why lock conversations?
15 │ 
16 ▶ Automatically locking closed, inactive issues guides people towards filing new issues with updated
17 ▶ context rather than commenting on a "resolved" issue that contains out-of-date or unrelated
18 ▶ information. As an example, someone may comment "I'm still having this issue", but without
19 ▶ providing any of the additional information the team needs to investigate.
```

閉じた issue を自動でロックする理由の説明に、役に立たないコメントの例がそのまま書かれています。18〜19 行目「I'm still having this issue」とだけ書いて、調べるのに要る情報を何も足さないコメントです。#14988 の短いコメントの多くがこれに当たります。open の 159 件全体では、「any update」「+1」「me too」「still an issue」を含む 200 字未満のコメントが 64 件ありました（スナップショットの JSON を正規表現で数えた値）。賛成を示したいだけなら、本文への 👍 のリアクションにします （feature request の投票がリアクションで数えられることは [contrib-triage](../contrib/12-contrib-triage.md) で読みました）。

📄 `angular/contributing-docs/saved-issue-replies.md` L56–76 （▶ の行: 56, 59, 62, 65, 70, 73）

````md
56 ▶ ## Angular: Behaving as Expected (v1)
57 │ 
58 │ ```
59 ▶ It appears this behaves as expected. If you still feel there is an issue, please provide further details in a new issue.
60 │ ```
61 │ 
62 ▶ ## Angular: Non-reproducible (v2)
63 │ 
64 │ ```
65 ▶ I'm sorry but we can't reproduce the problem following the instructions you provided.
66 │ 
67 │ If the problem still exists in your application please [open a new issue](https://github.com/angular/angular/issues/new/choose) and follow the instructions in the issue template.
68 │ ```
69 │ 
70 ▶ ## Angular: Obsolete (v2)
71 │ 
72 │ ```
73 ▶ Thanks for reporting this issue. This issue is now obsolete due to changes in the recent releases. Please update to the most recent Angular version.
74 │ 
75 │ If the problem still exists in your application, please [open a new issue](https://github.com/angular/angular/issues/new/choose) and follow the instructions in the issue template.
76 │ ```
````

📄 `angular/.github/ISSUE_TEMPLATE/1-bug-report.yaml` L32–41 （▶ の行: 35, 37–38）

```yaml
32 │   - type: dropdown
33 │     id: is-regression
34 │     attributes:
35 ▶       label: Is this a regression?
36 │       options:
37 ▶         - 'Yes'
38 ▶         - 'No'
39 │     validations:
40 │       required: true
41 │ 
```

チームが issue を閉じるときの定型文です。56 行目「Behaving as Expected」、62 行目「Non-reproducible」、70 行目「Obsolete」（最近のリリースの変更で古くなった）。裏返すと、古い issue に対して役に立つのは「今の main（または最新のリリース）で再現するか、しないか」を示すことです。再現しなければ Obsolete の判断材料に、再現すれば今も生きている証拠になります。バグ報告のテンプレートが 35 行目で「Is this a regression?」を必ず聞くのも同じで、どのバージョンから起きるかが分かると、原因の PR を探せます（#48350 では、それで v15 の 1 本の修正まで絞り込まれました）。

役に立つ形のコメントの下書きです（英語で書く。投稿はしない）。

📄 `コメントの下書き（#14988 向け。投稿しない）`

```
Reproduced on 22.2.0-next.7 (8576f161ae4) with a spec added to
packages/forms/test/template_integration_spec.ts (draft below, not submitted):
writeValue receives [null, 'Hello'] for [(ngModel)] inside <form>,
and ['Hello'] for formControlName.

Where it comes from:
- NgModel creates its control with the initial value null (ng_model.ts L173).
- NgForm.addControl registers it and calls setUpControlValueAccessor inside
  resolvedPromise.then (ng_form.ts L228-L233), which calls writeValue(control.value).
- The bound value is applied in a later microtask by NgModel._updateValue
  (ng_model.ts L425-L430).
For standalone ngModel the first call happens synchronously (ng_model.ts L388).
```

- **バージョンとコミット**：どの版で確かめたか（`8576f161ae4`）。
- **再現の形**：どのファイルのどの describe に足した spec か。stackblitz より、そのまま本家の spec に入る形の方が、直す人がすぐ使えます。
- **行番号**：原因を「この行」と言えるところまで。言えないことは書かない。
- **書かないこと**：「まだ直っていない」「いつ直りますか」だけのコメント。

## テストと直し方

この回の「テスト」は、上の下書きの spec です。足す場所は `packages/forms/test/template_integration_spec.ts` の `describe('ngModel corner cases')`（2612 行目）で、その describe だけを走らせるコマンドは次のとおりです（2026-11-01 に走らせると `Ran 10 of 1153 specs` / `10 specs, 0 failures` で通りました。手元でも Ran の数を必ず見てください）。

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/test:test \
  --test_arg=--filter="template-driven forms integration tests ngModel corner cases" \
  --test_output=all
# 下書きの it を足したあとは、it の名前まで入れて 1 本に絞る
#   --test_arg=--filter="ngModel corner cases calls writeValue with the initial null"
```

- #14988 の行は 第 13 回で引いた `ng_form.ts` の `addControl`（228〜233 行目）と `ng_model.ts` の `_updateValue`（425〜430 行目）。読み方は[第 13 回](13-forms-ng-model.md)。
- #48350 の行は `shared.ts` の `setUpControlValueAccessor` の `callSetDisabledState` の分岐。読み方は[第 10 回](10-forms-setup-control.md)。
- #14057 の行は `abstract_form.directive.ts` の `_updateDomValue` の `cleanUpControl`（第 12 回で引いた 332 行目）。読み方は[第 12 回](12-forms-reactive-directives.md)。
- 手元のブランチで spec を足す → 走らせる → 実装を一時的に壊して落ちることを確かめる → 戻す、の手順は [contrib-writing-a-test](../contrib/07-contrib-writing-a-test.md)。`../angular` の作業ツリーを汚したまま他の作業をしないこと。

## 聞かれそうな質問

**Q. 古い state: confirmed の issue を見つけたら、直して PR を出してもよいですか？**

先にスレッドの最後まで読みます。2 節の #14988 と #48350 は、どちらも原因は分かっていて、変えると既存のアプリの振る舞いが変わるために止まっています。#14988 には修正の PR（#38140）が一度出て、マージされずに閉じられています。こういう issue に、議論の結論を変える材料なしに PR を出しても、同じ理由で止まります。まずは今の main で再現するかを spec で確かめ（4 節の下書き）、振る舞いを変えてよいという合意があるか、変えずに済む小さな改善（エラーメッセージ・ドキュメント）があるかを探します。

**Q. forms: signals の issue が多いのはなぜですか？**

数字で言えるのは、`forms: signals` の 89 件のうち 72 件が 2026 年に作られた issue で、2026 年に作られた open の forms の issue 78 件のうち、それ以外は 6 件しかない、ということです。Signal Forms は新しい API で、3 節の PR を見ても docs の直し（「experimental の言い方を外す」#71116 など）と fix が続いています。新しい API は、使う人が増えるにつれて境目の振る舞いの報告が集まります。どの回の話かは[第 16〜19 回](16-forms-sf-schema.md)で地図を作れます。リアクティブフォームの古い issue より、議論が短く、まだ方針が固まっていないものも多いので、読む練習には向いています。

**Q. issue にコメントする前に、何を確かめればよいですか？**

- 同じ内容がスレッドに既に無いか（最後まで読む）。
- 今の main か最新のリリースで再現するか。手元の spec で、どのコミットで確かめたか（4 節）。
- 再現の形が、本家の spec にそのまま入る形になっているか（`initTest` を使う、など）。
- 原因を言うなら、ファイル名と行番号まで。分からないことは「分からない」と書くか、書かない。
- 賛成だけならリアクション。「+1」「any update?」はコメントにしない（4 節の locking.md 18〜19 行目）。

**Q. このスナップショットはどうやって新しくしますか？**

0 節の `gh issue list` と `gh pr list` を取り直し、JSON を章の `.ts` の定数に入れ直します（この章は fetch しないので、ページを開くたびに GitHub に問い合わせることはありません）。ラベルの名前は増えたり変わったりするので、`forms: *` の一覧（`FORMS_LABEL_ORDER`）も見直します。

## 読み終えて

- open の forms の issue は 159 件、うち `forms: signals` が 89 件。古いリアクティブ / テンプレート駆動の issue は件数は少ないが、議論が長い。
- 古い `state: confirmed` の多くは「原因は分かっているが、直すと既存アプリの振る舞いが変わる」もの。#14988 は第 13 回、#48350 は第 10・12 回の行で説明できる。
- 最近マージされた forms の PR は、docs と test の小さな変更が半分以上。
- 関わり方は ①読む ②再現の spec と行番号を下書きにする ③合意が取れた小さな変更、の順。コメントは「どの版で、どの spec で、どの行」。

---

← 前: [Signal Forms の submit と、リアクティブフォームとの相互運用](19-forms-sf-submit-compat.md)  
次: [テストの全体像：@angular/core/testing と、テストを支えるパッケージの地図](../testing/01-testing-overview.md) →
