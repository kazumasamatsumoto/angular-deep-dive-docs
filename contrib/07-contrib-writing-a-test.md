[目次](../README.md) › [コントリビュートの道](README.md) › 第 7 回 / 全 15 回

# テストを書いてみる：壊して、失敗を見て、直す

> FormControl の reset(…, {emitEvent: false}) で FormResetEvent が出ないことを確かめる spec を form\_control\_spec.ts に 1 本足し、このマシンで実際に走らせた記録で追う練習。足して通す → 実装をわざと壊して失敗の出力（Expected true to be false. とスタックの行）を読む → 既存の統合テストも同時に落ちたことから「足す前に既存のテストを探す」 → 元に戻して通す。どの describe に足すか、名前の付け方、git diff で変更がテストだけかを確かめる。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-writing-a-test)

---

前の回で spec の読み方を見ました。この回は実際に 1 本書きます。題材は「`FormControl.reset(value, {emitEvent: false})` のとき、`events` に `FormResetEvent` が流れない」こと。テストを足して通す → 実装をわざと壊して失敗の出力を読む → 戻して通す → 変更がテストだけかを確かめる、までを、このマシン（macOS）で 2026-10-31 に実際に走らせた記録で追います。

読む対象は `packages/forms/test/form_control_spec.ts`（足す場所）、`packages/forms/src/model/form_control.ts` の `reset`（壊す場所）、`packages/forms/src/model/abstract_model.ts` の `events`、`packages/forms/test/reactive_integration_spec.ts`（一緒に落ちた既存のテスト）です。

1. [1. 全体像](01-contrib-overview.md)
2. [2. リポジトリの地図](02-contrib-repo-map.md)
3. [3. 手元の準備](03-contrib-setup.md)
4. [4. Bazel の読み方](04-contrib-bazel.md)
5. [5. テストを走らせる](05-contrib-run-tests.md)
6. [6. spec の読み方](06-contrib-reading-specs.md)
7. **7. テストを書く**（この章）
8. [8. 公開 API と golden](08-contrib-public-api.md)
9. [9. コミットメッセージ](09-contrib-commit-messages.md)
10. [10. PR が通るまで](10-contrib-pr-flow.md)
11. [11. ブランチとリリース](11-contrib-branches.md)
12. [12. issue の仕分け](12-contrib-triage.md)
13. [13. コードの書き方](13-contrib-coding-standards.md)
14. [14. 手元で確かめる](14-contrib-debugging.md)
15. [15. 最初の PR](15-contrib-first-pr.md)

> [!NOTE]
> **ポイント**
>
> 最初は「`reset()` で既定値に戻る」テストを書く予定でした。ところが `form_control_spec.ts` を開くと、`it('should reset to the initial value if specified in FormControlOptions')` がもうありました （[第 6 回の 2 節](06-contrib-reading-specs.md)の一覧に載っています）。それで題材を、単体の spec に見当たらなかった「`emitEvent: false` のときの `FormResetEvent`」に変えました。この「書く前に、もうあるかを探す」がこの回のもう 1 つの主題で、5 節で思わぬ形で戻ってきます。

## 1. 確かめたい挙動：reset の最後の 3 行

📄 `angular/packages/forms/src/model/form_control.ts` L531–546 （▶ の行: 533, 538, 543–544）

```ts
531 │   override reset(
532 │     formState: TValue | FormControlState<TValue> = this.defaultValue,
533 ▶     options: {onlySelf?: boolean; emitEvent?: boolean; overwriteDefaultValue?: boolean} = {},
534 │   ): void {
535 │     this._applyFormState(formState);
536 │     this.markAsPristine(options);
537 │     this.markAsUntouched(options);
538 ▶     this.setValue(this.value, options);
539 │     if (options.overwriteDefaultValue) {
540 │       this.defaultValue = this.value;
541 │     }
542 │     this._pendingChange = false;
543 ▶     if (options?.emitEvent !== false) {
544 ▶       this._events.next(new FormResetEvent(this));
545 │     }
546 │   }
```

533 行目、`reset` の 2 つ目の引数に `emitEvent` があります。538 行目の `setValue` にも同じ `options` が渡るので、`emitEvent: false` なら値と状態のイベントは出ません。543〜545 行目が今回の対象で、`emitEvent` が `false` でなければ `FormResetEvent` を `_events` に流します。つまり仕様は「`emitEvent: false` のときは `FormResetEvent` を出さない」です。

📄 `angular/packages/forms/src/model/abstract_model.ts` L758–773 （▶ の行: 758, 773）

```ts
758 ▶   readonly _events = new Subject<ControlEvent<TValue>>();
759 │ 
760 │   /**
761 │    * A multicasting observable that emits an event every time the state of the control changes.
762 │    * It emits for value, status, pristine or touched changes.
763 │    *
764 │    * **Note**: On value change, the emit happens right after a value of this control is updated. The
765 │    * value of a parent control (for example if this FormControl is a part of a FormGroup) is updated
766 │    * later, so accessing a value of a parent control (using the `value` property) from the callback
767 │    * of this event might result in getting a value that has not been updated yet. Subscribe to the
768 │    * `events` of the parent control instead.
769 │    * For other event types, the events are emitted after the parent control has been updated.
770 │    *
771 │    * @see [Unified control state change events](guide/forms/reactive-forms#unified-control-state-change-events)
772 │    */
773 ▶   public readonly events = this._events.asObservable();
```

758 行目の `_events` は内部の `Subject`、773 行目の `events` がそれを読み取り専用にした公開の Observable です。テストは公開の `events` を購読して、流れてきたものを見ます。内部の `_events` には触りません。テストは利用者と同じ入口から確かめるほうが、実装を書き換えても壊れにくいからです。

## 2. どこに足すか、どう書くか

📄 `angular/packages/forms/test/form_control_spec.ts` L860–880 （▶ の行: 860–861, 863–864, 867, 871–873, 875）

```ts
860 ▶     describe('reset()', () => {
861 ▶       let c: FormControl;
862 │ 
863 ▶       beforeEach(() => {
864 ▶         c = new FormControl('initial value');
865 │       });
866 │ 
867 ▶       it('should reset to a specific value if passed', () => {
868 │         c.setValue('new value');
869 │         expect(c.value).toBe('new value');
870 │ 
871 ▶         c.reset('initial value');
872 ▶         expect(c.value).toBe('initial value');
873 ▶       });
874 │ 
875 ▶       it('should not set the parent when explicitly specified', () => {
876 │         const g = new FormGroup({'one': c});
877 │         c.patchValue('newValue', {onlySelf: true});
878 │         expect(g.value).toEqual({'one': 'initial value'});
879 │       });
880 │ 
```

1. **860 行目の describe('reset()') の中に足す**

   対象はメソッド `reset` なので、`describe('reset()')` の中です。863〜865 行目の `beforeEach` で毎回 `c = new FormControl('initial value')` が作られるので、新しい `it` でも `c` をそのまま使えます。記録では 873 行目と 875 行目の間（最初の `it` の直後）に足しました。
2. **名前は should で始めて、外側の describe とつなげて読める文に**

   失敗したときは「FormControl reset() should not emit a FormResetEvent when emitEvent is false」と表示されます（4 節の出力）。同じ `describe` の中の 867 行目・875 行目と同じく、何をしたら何が起きる（起きない）かを 1 文で書きます。
3. **既存の it の形に合わせる**

   867〜873 行目のように、操作（871 行目）と `expect`（872 行目）を短く並べます。この spec は `async` を使わない同期のテストが中心で、`reset` もイベントを同期に流すので、新しい `it` も同期にします。

足す `it` はこれです。

📄 `packages/forms/test/form_control_spec.ts に足す it`

```
it('should not emit a FormResetEvent when emitEvent is false', () => {
  const events: unknown[] = [];
  c.events.subscribe((event) => events.push(event));

  c.reset('initial value', {emitEvent: false});

  expect(events.some((event) => event instanceof FormResetEvent)).toBe(false);
});
```

流れてきたイベントを全部 `events` に積み、最後に「`FormResetEvent` が 1 つも無い」を確かめます。購読の中で `throw` する形（[第 6 回の 3 節](06-contrib-reading-specs.md)）より、失敗したときに何が起きたかが出力に残ります。`FormResetEvent` を使うので、ファイルの先頭の import にも 1 行足します。

📄 `angular/packages/forms/test/form_control_spec.ts` L9–20 （▶ の行: 15–16, 19）

```ts
 9 │ import {Component, Directive, effect, forwardRef, signal} from '@angular/core';
10 │ import {
11 │   AsyncValidatorFn,
12 │   ControlValueAccessor,
13 │   FormArray,
14 │   FormControl,
15 ▶   FormGroup,
16 ▶   NG_VALUE_ACCESSOR,
17 │   ReactiveFormsModule,
18 │   Validators,
19 ▶ } from '../index';
20 │ 
```

19 行目、この spec は `@angular/forms` ではなく `'../index'`（パッケージの入口のソース）から import しています。15 行目の `FormGroup` と 16 行目の `NG_VALUE_ACCESSOR` の間に、アルファベット順で `FormResetEvent` を入れます。`FormResetEvent` は `packages/forms/src/forms.ts` から公開されているので、`'../index'` から取れます。

## 3. 手順：足す → 通す → 壊す → 読む → 戻す

📄 `ターミナル`

```
cd ~/angular-research/angular
git switch -c test-forms-reset-emit-event   # 作業用のブランチ

# 1. テストを足して走らせる
npx -y pnpm@12.3.4 bazel test //packages/forms/test:test --test_output=errors

# 2. 実装をわざと壊して、もう一度（壊したことを確かめたら必ず戻す）
npx -y pnpm@12.3.4 bazel test //packages/forms/test:test --test_output=errors

# 3. 実装を戻す
git restore packages/forms/src/model/form_control.ts
npx -y pnpm@12.3.4 bazel test //packages/forms/test:test --test_output=errors

# 4. 変更がテストだけか
git status --short
git diff --stat
```

1. **足す**

   上の `it` と import を足します。差分は下のデモの「1. 足しただけ」です。
2. **走らせる → 通る**

   `//packages/forms/test:test` を走らせます（ラベルの読み方は[第 4 回](04-contrib-bazel.md)、出力の読み方は[第 5 回](05-contrib-run-tests.md)）。記録では PASSED、2 回目なのでキャッシュが効いて 5 秒でした。
3. **わざと壊す**

   通っただけでは、テストが本当にこの挙動を見ているかは分かりません。間違った書き方（たとえば別のイベントを見ている）でも通るからです。そこで 543 行目の `if (options?.emitEvent !== false) {` を `if (true) {` に変え、いつでも `FormResetEvent` を流すようにします。
4. **走らせる → 落ちる → 失敗を読む**

   4 節で読みます。**落ちることを見て初めて、このテストがこの行を守っている**と言えます。
5. **戻す → 通る**

   `git restore packages/forms/src/model/form_control.ts` で実装を戻し、もう一度走らせて PASSED を見ます。
6. **変更がテストだけかを確かめる**

   `git status --short` と `git diff --stat` で、変わったファイルが `packages/forms/test/form_control_spec.ts` だけであることを見ます。このマシンでは元から ` D modules/ssr-benchmarks/dist/index.html` の 1 行が出ますが、これは今回の変更ではありません。壊した実装を戻し忘れたまま commit するのが一番怖い失敗なので、この確認は毎回します。

> **🧪 DEMO — 実際に走らせた 3 つの状態**
>
> 2026-10-31 に ../angular（main 8576f161ae4）で記録した差分と出力です。パスのユーザー名とハッシュだけ書き換え、壊したときの長いログは途中を省いています。
>
> 実装は正しいので、足したテストはすぐ通る。これだけでは「本当にこの挙動を見ているか」は分からない。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-writing-a-test)

## 4. 失敗の出力を読む

壊したときの出力（デモの「2. 実装を壊した」）は 556 行ありました。上から読むと迷います。読む順番はこうです。

1. **最後のまとめを見る**

   `1154 specs, 2 failures` と `//packages/forms/test:test FAILED in 1.5s`。落ちたのは 2 本。1 本のつもりで壊したのに 2 本落ちたことが、まず大事な情報です。
2. **Failures: の段へ飛ぶ**

   `Started` の直後から並ぶ `ERROR RuntimeError: NG01201 …` は、**通っている**別のテストが、エラーを確かめるためにわざと起こしたものの出力です。今回の失敗とは関係ありません。`Failures:` から下だけを読みます。
3. **1) の名前と Message**

   「FormControl reset() should not emit a FormResetEvent when emitEvent is false」は、外側の `describe` から順につないだ名前です。`Expected true to be false.` は、`expect(実際の値).toBe(期待する値)` の 2 つを並べた文です。`events.some(…)` が `true`（`FormResetEvent` が流れた）だったのに、期待は `false` だった、と読みます。
4. **Stack の行**

   `at <Jasmine>` は Jasmine 自身の中なので飛ばし、自分のファイルの行を探します。`form_control_spec.ts:882:73` は「足したあとのファイルの 882 行目、73 文字目」。882 行目は足した `expect(…).toBe(false)` の行で、73 文字目は `toBe` の位置です。元のファイルでは 873 行目の後ろに 9 行（import で 1 行ずれている）足したので、行番号は元の引用とずれます。
5. **2) は既存の統合テスト**

   「reactive forms integration tests unified form state change formControl should not emit an event when resetting it with emit:false」。`Expected 1 to be 0.`、場所は `reactive_integration_spec.ts:1625:31`。次の節で開きます。

## 5. 同じ挙動は、もう統合テストが守っていた

📄 `angular/packages/forms/test/reactive_integration_spec.ts` L1604–1626 （▶ の行: 1604, 1610, 1614, 1618, 1621–1622, 1624–1625）

```ts
1604 ▶     it('formControl should emit an event when resetting it', () => {
1605 │       const fc = new FormControl<string | null>('foo', Validators.required);
1606 │       const fcEvents: ControlEvent[] = [];
1607 │       fc.events.subscribe((event) => fcEvents.push(event));
1608 │       expect(fcEvents.length).toBe(0);
1609 │ 
1610 ▶       fc.reset('bar');
1611 │       expect(fcEvents.length).toBe(3);
1612 │       expect(fcEvents[0]).toBeInstanceOf(ValueChangeEvent);
1613 │       expect(fcEvents[1]).toBeInstanceOf(StatusChangeEvent);
1614 ▶       expect(fcEvents[2]).toBeInstanceOf(FormResetEvent);
1615 │       expect(fcEvents[2].source).toBe(fc);
1616 │     });
1617 │ 
1618 ▶     it('formControl should not emit an event when resetting it with emit:false', () => {
1619 │       const fc = new FormControl<string | null>('foo', Validators.required);
1620 │       const fcEvents: ControlEvent[] = [];
1621 ▶       fc.events.subscribe((event) => fcEvents.push(event));
1622 ▶       expect(fcEvents.length).toBe(0);
1623 │ 
1624 ▶       fc.reset('bar', {emitEvent: false});
1625 ▶       expect(fcEvents.length).toBe(0);
1626 │     });
```

1618〜1626 行目は、名前も中身も今回足したテストとほぼ同じです。1621 行目で `events` を全部積み、1624 行目で `emitEvent: false` の `reset`、1625 行目で「1 つも来ていない」を確かめます。実装を壊すと `FormResetEvent` が 1 つだけ流れるので（値と状態のイベントは 538 行目の `setValue` に渡った `emitEvent: false` で止まる）、「Expected 1 to be 0.」になりました。

第 6 回の 1 節で `.reset(` を grep すると 8 ファイル出ました。それをさらに「`emitEvent: false` を渡している行」に絞ると、このテストは書く前に見つかりました。

📄 `ターミナル（../angular で実行）`

```
$ grep -rn "emitEvent: false" packages/forms/test | grep "reset" | cut -c1-120
packages/forms/test/form_array_spec.ts:773:          a.reset([], {emitEvent: false});
packages/forms/test/reactive_integration_spec.ts:1507:      formGroupDir.resetForm(undefined, {emitEvent: false});
packages/forms/test/reactive_integration_spec.ts:1624:      fc.reset('bar', {emitEvent: false});
packages/forms/test/reactive_integration_spec.ts:1655:      fg.reset({fc1: 'newFoo', fc2: 'newBar'}, {emitEvent: false})
packages/forms/test/reactive_integration_spec.ts:1687:      fa.reset(['newFoo', 'newBar'], {emitEvent: false});
packages/forms/test/form_group_spec.ts:842:        it('should not emit events when `FormGroup.reset` is called with `emi
packages/forms/test/form_group_spec.ts:847:          g.reset({}, {emitEvent: false});
packages/forms/test/form_control_spec.ts:1075:          c.reset(null, {emitEvent: false});
```

`form_control_spec.ts` で出てくるのは `valueChanges` を見る 1075 行目だけで、`events` を見るテストは無い。けれども `reactive_integration_spec.ts:1624` は、上の引用の 1624 行目そのものです。統合テストのファイルの `describe('unified form state change')` の中に、テンプレートを使わない `FormControl` 単体の `reset` のテストが 2 本（1604〜1616 行目と 1618〜1626 行目）あります。これは単体の spec だけを見ていたら気づけません。

### それでも足す意味はあるか

- **練習としては意味がある。** 「足す → 通る → 壊すと落ちる → 戻すと通る」を通しでやり、失敗の出力の読み方を覚えられた。2 本落ちたことで「既存のテストを探す」の大切さも実物で分かった。
- **テストだけの PR として本家に出す意味は薄い。** 守りたい挙動はもう 1618 行目のテストが守っていて、壊せば今回と同じく必ず落ちます。同じことを 2 か所で確かめると、挙動を変えるときに直す場所が増えます。出すなら、PR の説明に「reactive\_integration\_spec.ts L1618 に同じ確認がある」と書き、単体の spec にも置く理由（`FormControl` の `reset()` の仕様の一覧に載せたい）を示して、判断をレビューに委ねます。
- **本家に出すなら置き場所も見直す。**`describe('reset()')` の中には、イベントをまとめた入れ子の `describe('reset() events')`（[第 6 回の 3 節](06-contrib-reading-specs.md)で読んだもの）があり、`valueChanges` の `emitEvent: false` のテスト「should not fire an event when explicitly specified」もそこにあります。記録では最初の `it` の直後に足しましたが、名前の並びとしてはこちらが近い場所です。

> [!WARNING]
> **ハマりどころ**
>
> 記録のあと、実装もテストも元に戻し、`git -C ../angular status --short` が元からある 1 行だけになったことを確かめています。手元で練習するときも、終わったら `git restore` で戻すか、ブランチごと捨ててください。

## 全体の流れ

- 👤 `it('should not emit a FormResetEvent …')` — form\_control\_spec.ts（足した it） — *あなたのテスト*
  - `c.events.subscribe(…)` — abstract\_model.ts L773 — *公開の Observable を購読*
  - `c.reset('initial value', {emitEvent: false})` — form\_control.ts L531
    - `this.setValue(this.value, options)` — form\_control.ts L538 — *emitEvent: false で値・状態のイベントは止まる*
    - `if (options?.emitEvent !== false)` — form\_control.ts L543 — *false なので FormResetEvent を流さない*
  - 👤 `expect(events.some(… instanceof FormResetEvent)).toBe(false)` — form\_control\_spec.ts:882 — *壊すと Expected true to be false.*

## 聞かれそうな質問

**Q. 既にテストがある挙動にテストを足しても意味がありますか？**

今回は、同じ確認が `reactive_integration_spec.ts` 1618〜1626 行目にあり、実装を壊すと両方が落ちました。守られている挙動に同じ確認を足しても、守りは強くなりません。直す場所が増えるだけです。意味が出るのは、既存のテストが見ていない条件（別の引数、`FormGroup` の場合など）を足すときです。練習としては、壊して落ちるのを見ることに意味がありました。

**Q. バグ修正の PR では、なぜ先に失敗するテストを書くのですか？**

今回 543 行目を壊して落ちるのを見たのと同じ理由です。直す前の実装でテストが落ち、直したあとで通ることを見て初めて、「このテストはこのバグを捕まえる」と言えます。直したあとに書いたテストは、最初から通るので、バグを本当に捕まえるかが分かりません。CONTRIBUTING.md の Coding Rules にも「All features or bug fixes must be tested」とあり（[第 13 回](13-contrib-coding-standards.md)）、レビューではそのテストが修正の前に落ちるかを見られます。

**Q. テストだけの PR のコミットの type は何ですか？**

`test` です。commit-message-guidelines.md の type の表では「Adding missing tests or correcting existing tests」。ng-dev の設定では `test` の scope は任意で、リリースノートには載りません。今回なら `test(forms): …` の形になります。規則と検査の仕組みは[第 9 回](09-contrib-commit-messages.md)で読みます。バグ修正とそのテストを一緒に出すときは、type は `fix` で、テストは同じコミットに入れます。

**Q. Stack の行番号が、エディタで開いた行と合いません。**

出力の `form_control_spec.ts:882:73` は、テストを足したあとのファイルの行です。今回は import で 1 行、`it` で 9 行足したので、元の行番号から最大 10 行ずれます。自分の変更が入ったファイルをそのまま開けば合います。

## 読み終えて

- 足す場所は対象のメソッドの `describe`。`beforeEach` で作られるものを使い、名前は should で始めて外側とつなげて読める文にする
- 通っただけでは足りない。実装をわざと壊して落ちるのを見て、テストがその行を守っていると確かめる
- 失敗の出力は最後のまとめ → `Failures:` → Message → 自分のファイルの Stack の行、の順に読む
- 書く前に、関数名だけでなくイベントやクラスの名前でも `test/` 全体を grep する。今回は統合テストがもう守っていた
- 最後に `git status` と `git diff --stat` で、変更がテストだけであることを確かめる

---

← 前: [spec の読み方：Angular のテストはどう書かれているか](06-contrib-reading-specs.md)  
次: [公開 API と golden：API を変えると何が起きるか](08-contrib-public-api.md) →
