[目次](../README.md) › [Forms の説明文の読み残し](README.md) › 第 10 回 / 全 10 回

# spec と issue を読む：Forms の説明文を固めているもの

> packages/forms/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、area: forms の開いている issue のうち説明文に当たるものの表と、このシリーズで見つけた食い違い。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fmd-tests-issues)

---

この章で分かること：第 1〜9 回で読んだ Forms の説明文（angular.dev の API リファレンスになる JSDoc と、`{@example}` が指す例のアプリ）の約束を、`packages/forms/test` のどの spec が固めているか、固めていないのはどれか。手元で走らせた target と件数。area: forms の issue のうち、このシリーズの説明文に当たるもの。そして、このシリーズで見つけた説明と実装の食い違いの一覧です。

読む対象は `packages/forms/test/` の spec と `packages/forms/signals/test/web/reactive_fvc.spec.ts`（../angular、8576f161ae4）、2026-11-21 に取った area: forms の開いている issue 155 件と、docs・example を含む 80 件です。spec の読み方と 1 本だけ走らせる方法は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、forms の issue の地図は[forms の issue](../forms/20-forms-issues.md)にあります。

1. [1. AbstractControl](01-fmd-abstract-model.md)
2. [2. FormGroup・FormRecord・FormArray](02-fmd-group-array.md)
3. [3. FormControl と FormBuilder](03-fmd-control-builder.md)
4. [4. Validators](04-fmd-validators.md)
5. [5. エラーの文言と小道具](05-fmd-errors.md)
6. [6. NgControl](06-fmd-ng-control.md)
7. [7. リアクティブのディレクティブ](07-fmd-reactive-dirs.md)
8. [8. テンプレート駆動のディレクティブ](08-fmd-template-dirs.md)
9. [9. 値のアクセサー](09-fmd-accessors.md)
10. **10. spec と issue**（この章）

## 1. 走らせ方と件数

packages/forms/test/BUILD.bazel は、`glob(["**/*.ts"])` の `test_lib` を Node の `:test`（`zoneless_jasmine_test`）と web の `:test_web`（`zoneless_web_test_suite`）で走らせます（ファイルの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)）。../angular で `pnpm bazel test //packages/forms/test:test --nocache_test_results --test_output=all` は `1153 specs, 0 failures`、PASSED でした（2026-11-21）。第 6 回の FVC の道の spec は Signal Forms の側の `//packages/forms/signals/test/web:test` にあり、こちらは Chromium で 350 passed、Firefox で 346 passed・4 skipped でした。web の suite には `--test_arg=--filter=` が効かないので、全部を走らせた数です。同じ spec を web で走らせる `//packages/forms/test:test_web` も、Chromium と Firefox の両方で PASSED でした。

Node の `:test` を `--test_arg=--filter=<名前>` で describe か it の名前に絞った数は次のとおりで、どれも 0 failures です。jasmine の filter は名前の部分一致なので、`select controls` は select multiple や option の describe の中の同名の it も数えます。

| --filter | 件数 | 固めている約束 | 章 |
| --- | --- | --- | --- |
| `should reexport control` | 14 | ディレクティブの getter が control と同じ値 | [6](06-fmd-ng-control.md) |
| `setting status classes` | 10 | ng-\* のクラスの組（順は並べ替えて消す） | [6](06-fmd-ng-control.md) |
| `FormGroupName` | 3 | `formGroupName` の getter と登録 | [7](07-fmd-reactive-dirs.md) |
| `FormArrayName` | 5 | `formArrayName` の getter と登録 | [7](07-fmd-reactive-dirs.md) |
| `form arrays` | 3 | `FormArray` の下の `formGroupName` | [7](07-fmd-reactive-dirs.md) |
| `nested control rebinding` | 6 | control を差し替えたときの付け替え | [7](07-fmd-reactive-dirs.md) |
| `deprecation warnings` | 4 | `ngModel` の警告の回数（once・always・never） | [7](07-fmd-reactive-dirs.md)・[5](05-fmd-errors.md) |
| `value accessors in reactive forms with custom options` | 1 | `callSetDisabledState: 'whenDisabledForLegacyCode'` | [7](07-fmd-reactive-dirs.md) |
| `basic functionality` | 24 | novalidate・ngNoForm・ngModelGroup（template）と、reactive の基本 | [8](08-fmd-template-dirs.md) |
| `name and ngModelOptions` | 4 | `standalone` と `name` の options | [8](08-fmd-template-dirs.md) |
| `ngFormOptions` | 5 | form の `updateOn` と子の上書き | [8](08-fmd-template-dirs.md) |
| `submit and reset events` | 8 | `submitted` と、reset で `null` になること | [8](08-fmd-template-dirs.md) |
| `select controls` | 33 | `[ngValue]`・`compareWith`・option の増減 | [9](09-fmd-accessors.md) |
| `select multiple controls` | 9 | select multiple の値と `compareWith` | [9](09-fmd-accessors.md) |
| `should support <type=radio>` | 17 | radio の組、disable、reset | [9](09-fmd-accessors.md) |
| `IME events` | 6 | `COMPOSITION_BUFFER_MODE` の既定と true・false | [9](09-fmd-accessors.md) |

第 1〜5 回の describe ごとの件数は、各回の「テストと直し方」にあります。

## 2. 約束と spec の表

📄 `angular/packages/forms/test/template_integration_spec.ts` L1252–1271 （▶ の行: 1252, 1254, 1265, 1268–1270）

```ts
1252 ▶     it('should reset the form to empty when reset event is fired', async () => {
1253 │       const fixture = initTest(NgModelForm);
1254 ▶       fixture.componentInstance.name = 'should be cleared' as string | null;
1255 │       await fixture.whenStable();
1256 │ 
1257 │       const form = fixture.debugElement.children[0].injector.get(NgForm);
1258 │       const formEl = fixture.debugElement.query(By.css('form'));
1259 │       const input = fixture.debugElement.query(By.css('input'));
1260 │ 
1261 │       expect(input.nativeElement.value).toBe('should be cleared'); // view value
1262 │       expect(fixture.componentInstance.name).toBe('should be cleared'); // ngModel value
1263 │       expect(form.value.name).toEqual('should be cleared'); // control value
1264 │ 
1265 ▶       dispatchEvent(formEl.nativeElement, 'reset');
1266 │       await fixture.whenStable();
1267 │ 
1268 ▶       expect(input.nativeElement.value).toBe(''); // view value
1269 ▶       expect(fixture.componentInstance.name).toBe(null); // ngModel value
1270 ▶       expect(form.value.name).toEqual(null); // control value
1271 │     });
```
*reset の約束を固めている spec：名前も中身も「空（null）に戻す」*

1252 行目の it の名前は「reset イベントで form を**空に**戻す」で、1254 行目で入れた値が、1265 行目の reset のあと 1268〜1270 行目で input は `''`、コンポーネントの `name` と control の値は `null` になることを確かめます。`resetForm` の説明文の「初期の値に戻す」（ng\_form.ts の 354 行目、abstract\_form.directive.ts の 296 行目）と、spec の方が逆のことを固めている例です（[第 8 回](08-fmd-template-dirs.md)の 3 節）。

📄 `angular/packages/forms/test/reactive_integration_spec.ts` L2988–3018 （▶ の行: 2990–2991, 2993, 2997, 3006–3008, 3016）

```ts
2988 │     beforeEach(() => {
2989 │       // Reset `_ngModelWarningSentOnce` on `FormControlDirective` and `FormControlName` types.
2990 ▶       (FormControlDirective as any)._ngModelWarningSentOnce = false;
2991 ▶       (FormControlName as any)._ngModelWarningSentOnce = false;
2992 │ 
2993 ▶       warnSpy = spyOn(console, 'warn');
2994 │     });
2995 │ 
2996 │     describe('deprecation warnings', () => {
2997 ▶       it('should warn once by default when using ngModel with formControlName', async () => {
2998 │         const fixture = initTest(FormGroupNgModel);
2999 │         fixture.componentInstance.form = new FormGroup({
3000 │           'login': new FormControl(''),
3001 │           'password': new FormControl(''),
3002 │         });
3003 │         await fixture.whenStable();
3004 │         await timeout();
3005 │ 
3006 ▶         expect(warnSpy.calls.count()).toEqual(1);
3007 ▶         expect(warnSpy.calls.mostRecent().args[0]).toMatch(
3008 ▶           /It looks like you're using ngModel on the same form field as formControlName/gi,
3009 │         );
3010 │ 
3011 │         fixture.componentInstance.login = 'some value';
3012 │         fixture.changeDetectorRef.markForCheck();
3013 │         await fixture.whenStable();
3014 │         await timeout();
3015 │ 
3016 ▶         expect(warnSpy.calls.count()).toEqual(1);
3017 │       });
3018 │ 
```
*ngModel の警告の spec：static の印を毎回戻してから数える*

2990〜2991 行目で、2 つのディレクティブの static の `_ngModelWarningSentOnce` を毎回 `false` に戻しています。`'once'` は「アプリの中で型ごとに 1 回」なので、戻さないと前の it の警告が残るからです（第 7 回のデモも同じことをしています）。2997 行目の it は `withConfig` を使わない形で 3006 行目の 1 回を確かめ、値を変えたあとも 3016 行目で 1 回のままです。`withConfig({})` と書いただけで `'always'` に変わる点（[第 7 回](07-fmd-reactive-dirs.md)の 5 節）を確かめる it はありません。

📄 `angular/packages/forms/test/value_accessor_integration_spec.ts` L714–745 （▶ の行: 714, 716–718, 721, 727–728, 732–735, 737）

```ts
714 ▶       it('should use formControlName to group radio buttons when name is absent', async () => {
715 │         const fixture = initTest(FormControlRadioButtons);
716 ▶         const foodCtrl = new FormControl('fish');
717 ▶         const drinkCtrl = new FormControl('sprite');
718 ▶         fixture.componentInstance.form = new FormGroup({'food': foodCtrl, 'drink': drinkCtrl});
719 │         await fixture.whenStable();
720 │ 
721 ▶         const inputs = fixture.debugElement.queryAll(By.css('input'));
722 │         expect(inputs[0].nativeElement.checked).toEqual(false);
723 │         expect(inputs[1].nativeElement.checked).toEqual(true);
724 │         expect(inputs[2].nativeElement.checked).toEqual(false);
725 │         expect(inputs[3].nativeElement.checked).toEqual(true);
726 │ 
727 ▶         dispatchEvent(inputs[0].nativeElement, 'change');
728 ▶         inputs[0].nativeElement.checked = true;
729 │         await fixture.whenStable();
730 │ 
731 │         const value = fixture.componentInstance.form.value;
732 ▶         expect(value.food).toEqual('chicken');
733 ▶         expect(inputs[1].nativeElement.checked).toEqual(false);
734 ▶         expect(inputs[2].nativeElement.checked).toEqual(false);
735 ▶         expect(inputs[3].nativeElement.checked).toEqual(true);
736 │ 
737 ▶         drinkCtrl.setValue('cola');
738 │         await fixture.whenStable();
739 │ 
740 │         expect(inputs[0].nativeElement.checked).toEqual(true);
741 │         expect(inputs[1].nativeElement.checked).toEqual(false);
742 │         expect(inputs[2].nativeElement.checked).toEqual(true);
743 │         expect(inputs[3].nativeElement.checked).toEqual(false);
744 │       });
745 │ 
```
*radio の組の spec：formControlName が違う 2 組だけを置く*

714 行目の it は、`name` の無い radio を `formControlName` で組にできることを、`food` と `drink` の 2 組で確かめます。2 組は `name`（`formControlName` から入る）が違うので、レジストリの `_isSameGroup` が分けます。第 9 回で見つけた「`name` の無い `[formControl]` の radio を 2 組置くと、別の control どうしが同じ組になる」は、`_parent` も `name` も一致する場合で、この形の it はありません。

次の表は、このシリーズで確かめた説明文の約束と、それを固める spec です。「無い」は、grep と読み比べで見つからなかったものです。

| 章 | 説明文の約束 | spec（packages/forms/test/ から） |
| --- | --- | --- |
| [1](01-fmd-abstract-model.md) | `getError` は control か error が無ければ `null` | form\_group\_spec.ts の getError（1047）› 1055。errors はあるがキーが無い場合は無い |
| [1](01-fmd-abstract-model.md) | `events` の順（769 行目） | form\_group\_spec.ts の disabled events（2106）› 2128 が逆向きの事実を固める |
| [2](02-fmd-group-array.md) | `patchValue` は親に伝える | form\_group\_spec.ts の patchValue（486）› 526・532 |
| [2](02-fmd-group-array.md) | `FormArray`・`FormRecord` の reset と nonNullable の子 | 無い |
| [3](03-fmd-control-builder.md) | reset と既定の値、boxed values | form\_control\_spec.ts の reset()（860）、boxed values（60） |
| [3](03-fmd-control-builder.md) | nonNullable の builder に options だけの物 | 無い |
| [4](04-fmd-validators.md) | `pattern` の `^`・`$` | validators\_spec.ts の pattern（387）› 431〜440。`\|` を含む文字列は無い |
| [5](05-fmd-errors.md) | 例外の文の頭 | reactive\_integration\_spec.ts の errors（4212）› 4222 ほか。`[formArray]` の場合は無い |
| [6](06-fmd-ng-control.md) | getter は control と同じ（`enabled`・`disabled`・`status` も） | directives\_spec.ts の 194 ほか 14 本。`enabled`・`disabled`・`status` の行は無い |
| [6](06-fmd-ng-control.md) | `path` の要素は文字列 | 無い |
| [6](06-fmd-ng-control.md) | FVC に `[formControl]`：値・状態・エラー・required | signals/test/web/reactive\_fvc.spec.ts の 38・130・312・363・508・722。`updateOn` は main の 1081 から |
| [6](06-fmd-ng-control.md) | ng-\* のクラスの一覧 | reactive\_integration\_spec.ts の setting status classes（1693）。順は無い |
| [7](07-fmd-reactive-dirs.md) | `formGroupName` を `FormArray`・`[formArray]` の下で | form arrays（666）› 707。`[formArray]` の直下は無い |
| [7](07-fmd-reactive-dirs.md) | `disabled` 属性の警告 | 無い（`disabled attribute with a reactive` で 0 件） |
| [7](07-fmd-reactive-dirs.md) | 例のアプリのコメントの値 | 例の e2e（packages/examples/forms/ts/\*/e2e\_test）は input と文だけ。`form.value` は無い |
| [8](08-fmd-template-dirs.md) | 値は 1 回の microtask のあとに入る | it の多くが `await fixture.whenStable()` で待つ形で、「同期の時点では空」を確かめる it は無い |
| [8](08-fmd-template-dirs.md) | `ngModelGroup` を `[ngForm]` や入れ子の下で | basic functionality › 296 のクラスの it だけ |
| [9](09-fmd-accessors.md) | `[value]` の option と `compareWith`、select multiple の型 | 無い |
| [9](09-fmd-accessors.md) | radio の組 | value\_accessor\_integration\_spec.ts の 714・769・899。name の無い 2 組の `[formControl]` は無い |
| [9](09-fmd-accessors.md) | IME | template\_integration\_spec.ts の IME events（2530）› 2531・2561・2589 |
| 全体 | 説明文の中の ```` ```ts ````・```` ```html ```` の例がコンパイルできること | 無い。`{@example}` の例のファイルは `packages/examples` の build でコンパイルされるので、この 2 つで結果が分かれる（第 7〜9 回が使った例のファイル 11 個はどれも strict の ngc に通った。説明文の中では CVA の host の例と `<option[ngValue]` の例が通らず、第 1〜4 回にも同じ形のものがある） |

## 3. issue の表

issues-open.json（2026-11-21、area: forms の開いている 155 件）と issues-docs.json（docs・example を含む 80 件、閉じたものも）から、このシリーズの説明文に当たるものを選び、足りない分は `gh issue view` で読みました。Signal Forms だけの issue は外しています。

| issue | 状態 | 中身 | 当たる説明文と章 |
| --- | --- | --- | --- |
| #60539 | 開 | 同じ組の `[formControl]` の radio に同じ `value` が 2 つあると、片方を押すともう片方が選ばれる | `fireUncheck` の「チェックを外す」（radio\_control\_value\_accessor.ts 256）。第 9 回で見つけた別の組の巻き込みと、根（`writeValue` が値で `checked` を決める）が同じ。[9](09-fmd-accessors.md) |
| #40074 | 開 | `name` と `formControlName` を合わせる決まりのため、別の `FormGroup` の同名の radio がブラウザーで 1 組になる | 113〜115 行目「`name` は省いてよい」と 41〜49 行目の例外。[9](09-fmd-accessors.md) |
| #11763 | 開 | radio を 1 つずつ無効にしたい | `setDisabledState` の 228〜243 行目の理由の説明。[9](09-fmd-accessors.md) |
| #26037 | 開 | `[value]` で束縛した radio の DOM の `value` が `'on'` のまま | `value` は accessor の入力で DOM に書かない（167〜169 行目）。[9](09-fmd-accessors.md) |
| #28486 | 開 | radio にも `compareWith` が欲しい | `compareWith` は select だけ。[9](09-fmd-accessors.md) |
| #14342 | 開 | option に無い値を `patchValue` しても select の form が valid のまま | 74〜81 行目（一致する option が無いときの説明が無い）。[9](09-fmd-accessors.md) |
| #9796 | 開 | `contentEditable` の div に `ngModel` | `ngDefaultControl` の 73〜80 行目。[9](09-fmd-accessors.md) |
| #48350 | 開 | `formControlName` に `[disabled]` が効かなくなった | `disabled` の警告と `callSetDisabledState` の 81〜82 行目。[7](07-fmd-reactive-dirs.md) |
| #23016 | 開 | `formArrayName` の下の `[formGroupName]` が更新されない | form\_group\_name.ts 43 行目「`FormGroupDirective` の下だけ」。[7](07-fmd-reactive-dirs.md) |
| #68744 | 開 | CVA に渡す `[formControl]` を差し替えると、前の control にも書き込みが残る | `[formControl]` の差し替え（第 7 回の 4 節のデモは組み込みの accessor で、残らない）。[7](07-fmd-reactive-dirs.md) |
| #13761 | 開 | コンテンツの投影の中で `formControlName` が親を見つけない | 103 行目の `@Host()`（同じテンプレートの中だけ探す）。[7](07-fmd-reactive-dirs.md) |
| #31021 | 開 | 非同期の検証が終わってから `ngSubmit` を出したい | `onSubmit` の説明（`ngSubmit` はすぐ出る）。[7](07-fmd-reactive-dirs.md)・[8](08-fmd-template-dirs.md) |
| #30653 | 開 | `updateOn: 'blur'` の `ngModel` で、2 回目から値が消えない | `ngModelOptions` の `updateOn`。[8](08-fmd-template-dirs.md) |
| #19705・#20371 | 開 | `ngModelOptions` に debounce を、`updateOn` に複数のイベントを | 226〜227 行目の 3 つの値。[8](08-fmd-template-dirs.md) |
| #69310 | 開 | 描かれた control の無い `ngModelGroup` の状態のクラスが、OnPush で変わらない | 1 拍遅らせる登録（`resolvedPromise`）。[8](08-fmd-template-dirs.md)・[6](06-fmd-ng-control.md) |
| #69440 | 開 | `NgForm.addControl`・`addFormGroup` の microtask の中に null の確かめが無い | 271 行目と 227〜237 行目。[8](08-fmd-template-dirs.md) |
| #69421 | 開 | `ngAfterContentInit` で読む `NgModel.valueAccessor` が `null` | ng\_control.ts 77 行目「control の value accessor」。723abd4d571（2026-01-27）で accessor を選ぶ時点が constructor から登録（microtask）に移った。[6](06-fmd-ng-control.md) |
| #29218・#14988 | 開 | `writeValue` が `ngOnInit` より先に来る、最初に `null` で 1 回来る | CVA の「初期化のときに forms の API が呼ぶ」（51〜52 行目）。[6](06-fmd-ng-control.md) |
| #45968・#54112 | 開 | CVA とテンプレートの束縛に型が付かない、型付きの CVA が欲しい | `registerOnChange(fn: any)`（79 行目）。[6](06-fmd-ng-control.md) |
| #35330 | 閉 | 注入した `NgControl` に `control` が無い（v9） | `NgModel` の 102 行目の `field` の文と同じ「どのプロパティで control を取るか」。[8](08-fmd-template-dirs.md) |
| #13129 | 開 | 子の `valueChanges` は親の値が変わる前に出る | abstract\_model.ts の 769 行目（events の順）。[1](01-fmd-abstract-model.md) |
| #51296 | 開 | `enable()` に子を残す option が欲しい | 1298 行目「子も全部 enable」。[1](01-fmd-abstract-model.md) |
| #72068 | 開 | 変換した値の control が `reset()` のあと空に見える | reset と既定の値。[3](03-fmd-control-builder.md) |
| #14057・#19153 | 開 | 「名前の無い control」の例外の文が分かりにくい | 例外の文。[5](05-fmd-errors.md) |
| #21564・#36746・#54930 | 閉 | `setErrors`・boxed values・`ControlConfig` の説明文 | 直ったもの。[1](01-fmd-abstract-model.md)・[3](03-fmd-control-builder.md) |

このシリーズの食い違いのうち、同じことを書いた issue と PR は見つかりませんでした（`gh search issues` と `gh search prs` を、`field property`・`option[ngValue]`・`compareWith example`・`whenDisabled callSetDisabledState docs`・`FormArrayDirective example` などの語で、2026-11-21 に読むだけで実行）。開いている area: forms の PR の一覧にも、これらの行を直すものはありませんでした。

## 4. このシリーズで見つけたもの（食い違いと不具合）

どれも 8576f161ae4 の行を読み、本物の @angular/forms 22.2.6（ページのデモと Node の記録）か、説明文の例をそのまま取り出したファイルの型検査（サイトの TypeScript と compiler-cli、`--strict`・`strictTemplates`）で確かめたものです。「main」は ../angular の origin/main（d201dd76ef2、2026-11-19）で、直っていなければ「main 同じ」と書きました。第 1〜5 回の行は、その章の記録をそのまま並べています。

| 章 | 何が起きるか | 行（8576f161ae4） | 確かめ方と main |
| --- | --- | --- | --- |
| [1](01-fmd-abstract-model.md) | （食い違い）値以外のイベントは「親を更新したあとに流れる」と書くが、`StatusChangeEvent` は親より先に出る（受け取った時点の親の status は古い） | model/abstract\_model.ts 769 | デモ。1c736dc3b25（#54579）から。main 同じ |
| [1](01-fmd-abstract-model.md) | （食い違い）`getError` は「control か error が無ければ null」と書くが、errors はあってキーが無いと `undefined` | model/abstract\_model.ts 1608〜1609（実装 1613） | デモ。spec は errors が null の場合だけ。e268a0579a3 から。main 同じ |
| [1](01-fmd-abstract-model.md) | （写し間違い）`enable` の opts を「untouched に mark したとき」と説明する | model/abstract\_model.ts 1302〜1303 | デモ（値と状態のイベント）。a57825acf35 から。main 同じ |
| [1](01-fmd-abstract-model.md) | （誤ったリンク）`@see markAsDisabled`（その名前は無く、`disable`） | model/abstract\_model.ts 66 | grep。9d114c052a3 から。main 同じ |
| [1](01-fmd-abstract-model.md) | （誤ったリンク）asyncValidator の getter が `Validators.compose()` を見よと書く（非同期は `composeAsync`） | model/abstract\_model.ts 595 | 1d9d02696ea から。main 同じ |
| [1](01-fmd-abstract-model.md) | （例の誤り）removeValidators・hasValidator の例が 1 つのブロックで `const ctrl` を 2 回宣言する | model/abstract\_model.ts 876・881、920・925 | TS2451 ×4。7316fa71c43 から。main 同じ |
| [1](01-fmd-abstract-model.md) | （食い違い）onlySelf を省くと「祖先を全部 mark する」と書くが、markAsUntouched・markAsPristine は子から数え直す | model/abstract\_model.ts 1065〜1066・1162〜1163 | デモ。main 同じ |
| [1](01-fmd-abstract-model.md) | （型の説明の誤り）`Value<FormGroup<…>>` を `{address: string\|undefined}` と書く（実際は `{address?: string}`） | model/abstract\_model.ts 342 | tsc。main 同じ |
| [2](02-fmd-group-array.md) | （食い違い）patchValue の onlySelf を「Default is true」と書く（既定は false） | model/form\_group.ts 473〜474 | デモと form\_group\_spec.ts 526。main 同じ |
| [2](02-fmd-group-array.md) | （食い違い）FormRecord・FormArray の reset は「子を null に」と書くが、nonNullable の子は既定の値に戻る | model/form\_group.ts 812〜813、model/form\_array.ts 389〜390 | デモ。main 同じ |
| [2](02-fmd-group-array.md) | （例の誤り）`FormGroup<{one?: FormControl<string>}>` の例が型に通らず、`value.one` の型の答えも違う | model/form\_group.ts 176〜182 | TS2322。main 同じ |
| [2](02-fmd-group-array.md) | （例の誤り）group の検証関数・options・reset の例 | model/form\_group.ts 103・137・141・151・153・560 | TS2345・TS2531 ×3・TS1005、103 行目の `last; 'Drew'`。main 同じ |
| [2](02-fmd-group-array.md) | （食い違い）「Throws other wise」と書くが、console.warn だけ | model/form\_group.ts 676 | 683 行目の TODO。main 同じ |
| [3](03-fmd-control-builder.md) | （例の誤り）`console.log(name); // 'Alex'` など。`name` は control で、値は `name.value` | form\_builder.ts 156・168・179 | 2dbdebc6467 から。main 同じ |
| [3](03-fmd-control-builder.md) | （不具合）`fb.nonNullable.control('a', {})` など、空の options を渡すと `TypeError: this.validator is not a function` | form\_builder.ts 366〜384（`isAbstractControlOptions` 22〜31） | デモ。nullable の builder は正常。2dbdebc6467 から。main 同じ |
| [3](03-fmd-control-builder.md) | （型の不具合）説明文の例 `[{value, disabled}, {updateOn: 'blur'}]` の control の型が配列になる。`ControlConfig` の 2 つ目は options を受けない | form\_builder.ts 235・202〜205（`PermissiveControlConfig` 46、`ControlConfig` 71〜75） | tsc（TS2353）。3b8503f960f の例。main 同じ |
| [4](04-fmd-validators.md) | （食い違い）`pattern` は「値全体に一致しなければならない」と書くが、`a\|b` は `'xb'` を通す | directives/validators.ts 654、validators.ts 408〜410 | デモ。main 同じ |
| [4](04-fmd-validators.md) | （狭い実装）`min`・`max` のディレクティブは「どの formControlName・formControl・ngModel にも」と書くが、セレクターは `input[type=number]` だけ | directives/validators.ts 202〜203・254〜255 | デモ（range は spec 2033 で意図）。main 同じ |
| [4](04-fmd-validators.md) | （例の誤り）AsyncValidator の例が `Observable` を import しない | directives/validators.ts 307・315 | TS2304。main 同じ |
| [5](05-fmd-errors.md) | （古い文）`[formArray]` に undefined でも「formGroup expects a FormGroup」、`[formArray]` の下でも通る formGroupName に「親に formGroup が要る」 | directives/reactive\_errors.ts 63・74・86 | デモ。74・86 は main 同じ、63 の文は abstract\_form.directive.ts に移って残る（fc3dc890aad） |
| [5](05-fmd-errors.md) | （一覧の欠け）NG01354 の解説ページはあるが、一覧の表に無い | adev/src/content/reference/errors/overview.md | 38d093232c6 でページ追加。main 同じ |
| [5](05-fmd-errors.md) | （綴り・古い例）「parent be ngModelGroup」（to が抜け）、`Option 2: `、例が `*ngFor` | directives/template\_driven\_errors.ts 50・88、error\_examples.ts 36 | main 同じ |
| [5](05-fmd-errors.md) | （誤ったリンク、main で直った）`FormsModule#withconfig`（アンカーは withConfig） | directives/shared.ts 46・61 | f825c9bc7cc で直った |
| [6](06-fmd-ng-control.md) | （例の誤り）CVA の `registerOnChange` の例の host `'_onChange($event.target.value)'` は、今の既定の型検査を通らない | control\_value\_accessor.ts 73 | strictTemplates の ngc で TS2531・TS2339（0571b335b9b で host の型検査が既定に）。main 同じ |
| [6](06-fmd-ng-control.md) | （古い）`Form` は「`FormGroupDirective` と `NgForm` が実装する」。`FormArrayDirective` も実装する | form\_interface.ts 17 | abstract\_form.directive.ts 58。main 同じ |
| [6](06-fmd-ng-control.md) | （説明不足）`NgControlStatusGroup` は「グループには `ng-submitted` も付く」と書くが、`formGroupName` などには付かない | ng\_control\_status.ts 120〜122 | デモの 9 行目。main 同じ |
| [6](06-fmd-ng-control.md) | （説明不足、main で直った）`isRequired` の説明が途中で切れ、`Validators.required` を書かない | ng\_control.ts 289 | f9cf82642ca で直った |
| [6](06-fmd-ng-control.md) | （不具合、直った）FVC に付けた `updateOn: 'blur'` の control が、値を出した瞬間に `setValue` する | ng\_control.ts 232〜237 | 401b4f2011c（22.2.6 には a7b0e8ef9d6 で入っている） |
| [7](07-fmd-reactive-dirs.md) | （例の欠け）`FormArrayDirective` の説明文が「次の例は」と書くが、例が無い | form\_array\_directive.ts 37〜38 | 0dd95c503f4 で写した文。main 同じ |
| [7](07-fmd-reactive-dirs.md) | （狭すぎる）`formGroupName` は「親の `FormGroupDirective` とだけ使える」。`formArrayName` と `[formArray]` の下でも動く | form\_group\_name.ts 43 | デモの 6 番目、233〜238 行目。main 同じ |
| [7](07-fmd-reactive-dirs.md) | （例のコメントの誤り）nestedFormGroup の `form.value` のコメントが `email: ''`。本物は `null` | packages/examples/forms/ts/nestedFormGroup/nested\_form\_group\_example.ts 53 | デモ（2cdd0511092 から）。main 同じ |
| [7](07-fmd-reactive-dirs.md) | （値の名前の誤り）`callSetDisabledState` の古い値を `whenDisabled` と書く。型は `'whenDisabledForLegacyCode'` | form\_providers.ts 82（と 43） | tsc --strict で TS2322（96b7fe93af3 から）。main 同じ |
| [7](07-fmd-reactive-dirs.md)・[8](08-fmd-template-dirs.md) | （食い違い）`resetForm` は「初期の値に戻す」と書くが、nonNullable でない control は `null` に戻る | abstract\_form.directive.ts 296、ng\_form.ts 354 | デモと template\_integration\_spec.ts 1252（099d1a67a0c から）。main 同じ |
| [7](07-fmd-reactive-dirs.md) | （リンク）FormsModule の「Template-driven Forms Guide」が `guide/forms`（Overview と同じ）を指す | form\_providers.ts 28 | adev に template-driven-forms.md がある。main 同じ |
| [7](07-fmd-reactive-dirs.md) | （綴り）「it always an empty array」 | abstract\_form.directive.ts 175 | main 同じ |
| [8](08-fmd-template-dirs.md) | （食い違い）`NgModel` は「ディレクティブの `field` プロパティで control を取れる」と書くが、`field` は無い（`control`） | ng\_model.ts 102 | `'field' in m` が `false`、ngc で TS2339。2fdd4da2a86（Signal Forms の `[control]` → `[field]` の改名）で `control` から置き換わった。main 102 同じ |
| [8](08-fmd-template-dirs.md) | （名前の誤り）`FormModule`・`ReactiveFormModule` | ng\_form.ts 106 | 9a550202860 から。main 同じ |
| [8](08-fmd-template-dirs.md) | （狭すぎる）`NgModelGroup` は「`NgForm` の子として（`<form>` の中で）だけ」。`[ngForm]` の下でも入れ子でも動く | ng\_model\_group.ts 39 | デモ（`<div ngForm>` の中の入れ子）。main 同じ |
| [9](09-fmd-accessors.md) | （例の誤り）`compareWith` の例の `<option[ngValue]="country">` は空白が抜けていて NG5002 | select\_control\_value\_accessor.ts 90 | ngc で NG5002 ×2。e7608e503f1（`*ngFor` → `@for`）で空白が消えた。main 90 同じ |
| [9](09-fmd-accessors.md) | （説明不足）`compareWith` は `[value]` の option には効かず、1 つの select の `[value]` は文字列になる。select multiple の `[value]` は型が残る | select\_control\_value\_accessor.ts 79〜81・283〜284、select\_multiple\_control\_value\_accessor.ts 245〜246・251 | デモ（compareWith 0 回、`'2'` と `[2]`）。main 同じ |
| [9](09-fmd-accessors.md) | （不具合）`name` の無い `[formControl]` の radio は、別の control どうしも 1 つの組になり、片方を選ぶと別の control の同じ値の radio に `checked` が付く（値は変わらない）。`fireUncheck` の「外す」とも合わない | radio\_control\_value\_accessor.ts 92〜100・256・260〜262 | デモ（ページの Chrome と Node の両方）。根の同じ #60539、関連の #40074。main 同じ |
| [9](09-fmd-accessors.md) | （古い）select が `change` を聞く理由を IE と書く | select\_control\_value\_accessor.ts 99〜101 | main 同じ |
| [9](09-fmd-accessors.md) | （綴り）「The follow example」「one or of more」「evntually」 | select\_multiple\_control\_value\_accessor.ts 59・124、radio\_control\_value\_accessor.ts 113、select\_control\_value\_accessor.ts 146 | main 同じ |

第 6〜9 回の説明文で、書いてあるとおりに動いたものも多くありました。getter と control の一致、`path` の文字列、`standalone` と `name` の options の 2 つの例、`ngFormOptions` の `updateOn`、select と radio の例のアプリ、IME の既定の動きは、どれも説明文のとおりです。

## 聞かれそうな質問

**Q. 説明文の中の例が壊れていても、CI で気付かないのはなぜですか？**

JSDoc の ```` ```html ```` や ```` ```ts ```` の中は文字列で、どの build もコンパイルしないからです。`{@example}` が指す `packages/examples` のファイルはコンパイルされるので、第 7〜9 回の例のファイルはどれも通り、説明文の中の例（CVA の host、`<option[ngValue]`）と、説明文に書かれた値の名前（`whenDisabled`）が通りませんでした。第 1〜4 回の説明文の中の例にも、同じ形で通らないものがあります（4 節の表）。

**Q. forms の spec を 1 つの describe だけ走らせるには？**

`pnpm bazel test //packages/forms/test:test --test_arg=--filter="submit and reset events"` のように名前で絞ります。一致が 0 件でも PASSED になるので、`Ran 8 of 1153 specs` の行を見ます（1 節）。

**Q. spec が説明文と逆のことを固めている例はありますか？**

あります。reset の spec（template\_integration\_spec.ts 1252）は「空に戻す」を固め、`resetForm` の説明文は「初期の値に戻す」です。patchValue の既定（第 2 回）や events の順（第 1 回）も同じ形です。

**Q. NgModel の field の文は、いつ、なぜ入りましたか？**

2fdd4da2a86（2025-10-06）です。Signal Forms の `[control]` ディレクティブを `[field]` に改名したコミットが、関係の無い `NgModel` の説明文の `control` まで書き換えました（第 8 回）。

**Q. radio の巻き込みは、どうすれば避けられますか？**

`[formControl]` の radio の組ごとに別の `name` を付けるか、`[formGroup]` の中の `formControlName` にします。`name` か `_parent` が違えば、レジストリは別の組と見なします（第 9 回の 5 節）。

## 読み終えて

- forms の Node の spec は 1153 本、FVC の道は Signal Forms の web の suite にある。名前で絞ったときは件数を見る。
- 説明文の約束の多くは spec に固められているが、例のコンパイル、`path` の型、`[value]` と `compareWith`、名前の無い radio の組、`disabled` の警告は固められていない。
- spec が説明文と逆のことを固めている所（reset）は、説明文の方を実装に合わせるのが筋。
- 見つけたもののうち、例の誤り・値の名前・`field` は 1 行の直し、radio の組は実装の不具合。

---

← 前: [値のアクセサーの説明文：select・radio・既定のアクセサー](09-fmd-accessors.md)
