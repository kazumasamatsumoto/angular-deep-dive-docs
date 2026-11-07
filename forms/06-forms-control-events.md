[目次](../README.md) › [フォームの内側](README.md) › 第 6 回 / 全 20 回

# events：状態の変化を 1 本の Observable で受ける

> AbstractControl.events が流す ValueChangeEvent・StatusChangeEvent・PristineChangeEvent・TouchedChangeEvent・FormSubmittedEvent・FormResetEvent と、それぞれが出る行。source が「変化を起こした control」を指す仕組み（sourceControl を親へ渡す）と、disable / enable から上った値と状態のイベントだけは親自身が source になる例外。valueChanges / statusChanges との関係、emitEvent: false で止まるものと、\_updateTouched・\_updatePristine のように止まらないもの。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-control-events)

---

`AbstractControl.events` は、値・状態・pristine・touched の変化と、フォームの submit / reset を、1 本の Observable に種類つきで流します。この章では、6 つのイベントのクラスと、それぞれが**どの関数のどの行で**`_events.next` されるか、`source` が「変化を起こした control」を指す仕組み（`sourceControl` の受け渡し）、`valueChanges` / `statusChanges` との違い、`emitEvent: false` で止まるものと止まらないものを確かめます。

読む対象は `packages/forms/src/model/abstract_model.ts` のイベントのクラス（93〜188 行目）と `_events.next` を呼ぶ関数、`src/model/form_group.ts` の `reset`、`src/directives/reactive_directives/abstract_form.directive.ts` の `onSubmit` です。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. [3. updateValueAndValidity](03-forms-update-value-validity.md)
4. [4. Validators](04-forms-validators.md)
5. [5. 非同期の検証](05-forms-async-validators.md)
6. **6. events**（この章）
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
20. [20. issue と PR を読む](20-forms-issues.md)

## 1. イベントのクラス

📄 `angular/packages/forms/src/model/abstract_model.ts` L93–131 （▶ の行: 93, 99, 109, 111–112, 124, 126–127）

```ts
 93 ▶ export abstract class ControlEvent<T = any> {
 94 │   /**
 95 │    * Form control from which this event is originated.
 96 │    *
 97 │    * Note: the type of the control can't be infered from T as the event can be emitted by any of child controls
 98 │    */
 99 ▶   public abstract readonly source: AbstractControl<unknown>;
100 │ }
101 │ 
102 │ /**
103 │  * Event fired when the value of a control changes.
104 │  *
105 │  * @see {@link AbstractControl.events}
106 │  *
107 │  * @publicApi
108 │  */
109 ▶ export class ValueChangeEvent<T> extends ControlEvent<T> {
110 │   constructor(
111 ▶     public readonly value: T,
112 ▶     public readonly source: AbstractControl,
113 │   ) {
114 │     super();
115 │   }
116 │ }
117 │ 
118 │ /**
119 │  * Event fired when the control's pristine state changes (pristine <=> dirty).
120 │  *
121 │  * @see {@link AbstractControl.events}
122 │  *
123 │  * @publicApi */
124 ▶ export class PristineChangeEvent extends ControlEvent {
125 │   constructor(
126 ▶     public readonly pristine: boolean,
127 ▶     public readonly source: AbstractControl,
128 │   ) {
129 │     super();
130 │   }
131 │ }
```

📄 `angular/packages/forms/src/model/abstract_model.ts` L133–163 （▶ の行: 140, 142–143, 156, 158–159）

```ts
133 │ /**
134 │  * Event fired when the control's touched status changes (touched <=> untouched).
135 │  *
136 │  * @see {@link AbstractControl.events}
137 │  *
138 │  * @publicApi
139 │  */
140 ▶ export class TouchedChangeEvent extends ControlEvent {
141 │   constructor(
142 ▶     public readonly touched: boolean,
143 ▶     public readonly source: AbstractControl,
144 │   ) {
145 │     super();
146 │   }
147 │ }
148 │ 
149 │ /**
150 │  * Event fired when the control's status changes.
151 │  *
152 │  * @see {@link AbstractControl.events}
153 │  *
154 │  * @publicApi
155 │  */
156 ▶ export class StatusChangeEvent extends ControlEvent {
157 │   constructor(
158 ▶     public readonly status: FormControlStatus,
159 ▶     public readonly source: AbstractControl,
160 │   ) {
161 │     super();
162 │   }
163 │ }
```

📄 `angular/packages/forms/src/model/abstract_model.ts` L165–188 （▶ の行: 172–173, 184–185）

```ts
165 │ /**
166 │  * Event fired when a form is submitted
167 │  *
168 │  * @see {@link AbstractControl.events}
169 │  *
170 │  * @publicApi
171 │  */
172 ▶ export class FormSubmittedEvent extends ControlEvent {
173 ▶   constructor(public readonly source: AbstractControl) {
174 │     super();
175 │   }
176 │ }
177 │ /**
178 │  * Event fired when a form is reset.
179 │  *
180 │  * @see {@link AbstractControl.events}
181 │  *
182 │  * @publicApi
183 │  */
184 ▶ export class FormResetEvent extends ControlEvent {
185 ▶   constructor(public readonly source: AbstractControl) {
186 │     super();
187 │   }
188 │ }
```

93 行目の `ControlEvent` が共通の親で、持っているのは 99 行目の `source` だけです。97 行目のコメントのとおり、`source` は子の control のこともあるので、型は `AbstractControl<unknown>` です。子クラスは「何が変わったか」を 1 つずつ足します：`ValueChangeEvent` は 111 行目の `value`、`PristineChangeEvent` は 126 行目の `pristine`、`TouchedChangeEvent` は 142 行目の `touched`、`StatusChangeEvent` は 158 行目の `status`。172 行目の `FormSubmittedEvent` と 184 行目の `FormResetEvent` は `source` しか持ちません。どれもただのクラスなので、受け取る側は `event instanceof ValueChangeEvent` で種類を分けます。

流す先は `_events`（`Subject`）で、公開の `events` はその `asObservable()` です。この 2 行は [contrib シリーズのテストを書く回](../contrib/07-contrib-writing-a-test.md)で読んでいます（abstract\_model.ts 758〜773 行目）。

## 2. どこで next されるか

| イベント | 出す関数（行） | そのときの source |
| --- | --- | --- |
| `ValueChangeEvent` | `updateValueAndValidity`（L1418）、`disable`（L1283）— [第 3 回](03-forms-update-value-validity.md) | 起こした子。ただし `disable` / `enable` から上った親では親自身（4 節） |
| `StatusChangeEvent` | `updateValueAndValidity`（L1419）、`disable`（L1284）、`markAsPending`（L1235）、`_updateControlsErrors`（L1679） | 同上。`setErrors` と非同期の検証の結果は `_updateControlsErrors` の `changedControl` |
| `PristineChangeEvent` | `markAsDirty`（L1145）、`markAsPristine`（L1198）、`_updatePristine`（L1743）— [第 2 回](02-forms-abstract-control.md) | 起こした子 |
| `TouchedChangeEvent` | `markAsTouched`（L1011）、`markAsUntouched`（L1101）、`_updateTouched`（L1750）— 第 2 回 | 起こした子 |
| `FormSubmittedEvent` | `AbstractFormDirective.onSubmit`（abstract\_form.directive.ts L316）、`NgForm.onSubmit` | ディレクティブの `control`（フォームの根） |
| `FormResetEvent` | `FormControl.reset`（form\_control.ts L544）、`FormGroup.reset`（form\_group.ts L574）、`FormArray.reset` | reset を呼ばれた節自身 |

行番号に第 2・3 回のリンクがあるものは、その回の引用で中身を読めます。ここでは、まだ読んでいない 3 つ（`markAsPending`・`_updateControlsErrors`・`reset` と `onSubmit`）を読みます。

📄 `angular/packages/forms/src/model/abstract_model.ts` L1228–1242 （▶ の行: 1231, 1233–1236, 1239–1240）

```ts
1228 │   markAsPending(
1229 │     opts: {onlySelf?: boolean; emitEvent?: boolean; sourceControl?: AbstractControl} = {},
1230 │   ): void {
1231 ▶     this.status = PENDING;
1232 │ 
1233 ▶     const sourceControl = opts.sourceControl ?? this;
1234 ▶     if (opts.emitEvent !== false) {
1235 ▶       this._events.next(new StatusChangeEvent(this.status, sourceControl));
1236 ▶       (this.statusChanges as EventEmitter<FormControlStatus>).emit(this.status);
1237 │     }
1238 │ 
1239 ▶     if (!opts.onlySelf) {
1240 ▶       this._parent?.markAsPending({...opts, sourceControl});
1241 │     }
1242 │   }
```

1233 行目で `sourceControl` を決め、1234〜1236 行目で `events` と `statusChanges` の両方に出し、1239〜1240 行目で親の `markAsPending` を同じ `sourceControl` で呼びます。自分のイベントが**先**、親が**あと**です。[第 2 回](02-forms-abstract-control.md)の `markAsTouched`（親が先）とは逆で、`events` の中で「子と親のどちらが先か」は関数ごとに決まっています。

📄 `angular/packages/forms/src/model/abstract_model.ts` L1663–1685 （▶ の行: 1666, 1669, 1671–1672, 1675–1679, 1682–1683）

```ts
1663 │   /** @internal */
1664 │   _updateControlsErrors(
1665 │     emitEvent: boolean,
1666 ▶     changedControl: AbstractControl,
1667 │     shouldHaveEmitted?: boolean,
1668 │   ): void {
1669 ▶     this.status = this._calculateStatus();
1670 │ 
1671 ▶     if (emitEvent) {
1672 ▶       (this.statusChanges as EventEmitter<FormControlStatus>).emit(this.status);
1673 │     }
1674 │ 
1675 ▶     // The Events Observable expose a slight different bevahior than the statusChanges obs
1676 ▶     // An async validator will still emit a StatusChangeEvent is a previously cancelled
1677 ▶     // async validator has emitEvent set to true
1678 ▶     if (emitEvent || shouldHaveEmitted) {
1679 ▶       this._events.next(new StatusChangeEvent(this.status, changedControl));
1680 │     }
1681 │ 
1682 ▶     if (this._parent) {
1683 ▶       this._parent._updateControlsErrors(emitEvent, changedControl, shouldHaveEmitted);
1684 │     }
1685 │   }
```

`setErrors` と非同期の検証の結果（[第 5 回](05-forms-async-validators.md)）はここを通ります。1669 行目で status を計算し直し、1679 行目の `StatusChangeEvent` の `source` は 1666 行目の `changedControl`（`setErrors` を呼ばれた節）、1683 行目でそれを親へ渡します。1675〜1677 行目のコメントのとおり、`events` と `statusChanges` はここで**条件が違います**。1671 行目の `statusChanges` は `emitEvent` だけを見ますが、1678 行目の `events` は「打ち切られた前の非同期の検証が、イベントを出すはずだった」（`shouldHaveEmitted`）ときにも出します。

`FormGroup.reset`（form\_group.ts L563-576）の全文は[第 7 回](07-forms-form-group-array.md)で引用しています。イベントの出る順だけを追うと次のとおりです。

1. **567〜569 行目：子を全部 reset**

   `onlySelf: true` なので、子は親に何も伝えません。子のイベント（子の `FormResetEvent` も）は**子の**`events` にだけ出ます。
2. **570〜571 行目：自分の pristine と touched を数え直す**

   `_updatePristine(options, this)` と `_updateTouched(options, this)`。`source` は自分です。
3. **572 行目：自分の値と状態**

   `updateValueAndValidity(options)`。`ValueChangeEvent` と `StatusChangeEvent` が出ます。
4. **573〜574 行目：最後に FormResetEvent**

   `emitEvent` が `false` でなければ。

`AbstractFormDirective.onSubmit`（abstract\_form.directive.ts L305-322）の全文は[第 12 回](12-forms-reactive-directives.md)で引用しています。

`FormSubmittedEvent` は model の中ではなく、`<form [formGroup]>` の `FormGroupDirective`（と `FormArrayDirective`）の共通の親 `AbstractFormDirective` が出します。313 行目で `submitted` を立て、314 行目で `updateOn: 'submit'` の保留を反映し、315 行目で `ngSubmit` を emit し、**そのあと** 316 行目で `this.form._events.next(new FormSubmittedEvent(this.control))`。流す先は `this.form`（根の節）の `_events` だけで、子の `events` には出ません。テンプレート駆動の `NgForm.onSubmit`（`ng_form.ts`）も同じ形です。`onReset` は `resetForm` → `this.form.reset()` なので、`FormResetEvent` は上の 574 行目から出ます（ディレクティブ側は[第 12 回](12-forms-reactive-directives.md)）。

## 3. source の仕組み：sourceControl を持って上る

1. **起こした節が自分を sourceControl にする**

   `markAsTouched` などは、最初に `const sourceControl = opts.sourceControl ?? this;` を作ります（第 2 回の L1005、この章の 1233 行目）。外から呼ばれたときは `opts.sourceControl` が無いので自分です。
2. **親へは {...opts, sourceControl} で渡す**

   親の同じ関数を呼ぶとき、`sourceControl` を引数に入れて渡します（1240 行目、第 3 回の L1425）。親は 1 の式で `opts.sourceControl` を見つけるので、自分ではなく子を `source` にします。
3. **それぞれの節が自分の \_events に next する**

   イベントは子の `events` から親へ「伝わる」のではありません。親でも同じ関数が走り、**親が自分の `_events` に**、子を `source` にしたイベントを流します。だから根の `events` を 1 本購読すれば木全体の変化が見え、`source` でどの子かが分かります。

`source` と `root` は別のものです。`root` は「この節の一番上」（[第 2 回](02-forms-abstract-control.md)の 5 節）、`source` は「このイベントを起こした節」です。根の `events` で `event.source !== form` なら子が起こした変化、`event.source.root === form` はいつも成り立ちます。

## 4. source が子にならないところ：disable

📄 `angular/packages/forms/test/reactive_integration_spec.ts` L1374–1400 （▶ の行: 1388, 1390, 1393–1395, 1398–1399）

```ts
1374 │     it('Nested formControl should emit disabled', () => {
1375 │       const fc1 = new FormControl<string | null>('foo', Validators.required);
1376 │       const fc2 = new FormControl<string | null>('bar', Validators.required);
1377 │       const fg = new FormGroup({fc1, fc2});
1378 │ 
1379 │       const fc1Events: ControlEvent[] = [];
1380 │       const fc2Events: ControlEvent[] = [];
1381 │       const fgEvents: ControlEvent[] = [];
1382 │       fc1.events.subscribe((event) => fc1Events.push(event));
1383 │       fc2.events.subscribe((event) => fc2Events.push(event));
1384 │       fg.events.subscribe((event) => fgEvents.push(event));
1385 │ 
1386 │       expect(fg.pristine).toBeTrue();
1387 │ 
1388 ▶       fc1.disable();
1389 │       expect(fc1Events.length).toBe(2);
1390 ▶       expect(fgEvents.length).toBe(3);
1391 │       expect(fc2Events.length).toBe(0);
1392 │ 
1393 ▶       expectValueChangeEvent(fgEvents.at(-3), {fc2: 'bar'}, fg);
1394 ▶       expectStatusChangeEvent(fgEvents.at(-2), 'VALID', fg);
1395 ▶       expectTouchedChangeEvent(fgEvents.at(-1), false, fc1);
1396 │       // No prisitine event sent as fg was already pristine
1397 │ 
1398 ▶       expectValueChangeEvent(fc1Events.at(-2), 'foo', fc1);
1399 ▶       expectStatusChangeEvent(fc1Events.at(-1), 'DISABLED', fc1);
1400 │     });
```

`reactive_integration_spec.ts` の spec です。1388 行目で子の `fc1.disable()` を呼ぶと、1393〜1394 行目のとおり、親 `fg` の `ValueChangeEvent` と `StatusChangeEvent` の `source` は **`fg` 自身**です。[第 3 回の 5 節](03-forms-update-value-validity.md)で読んだ `_updateAncestors` の 1331 行目が、親の `updateValueAndValidity` に `sourceControl` を渡していないためです。一方 1395 行目の `TouchedChangeEvent` は `source` が `fc1` です（`_updateAncestors` が `_updateTouched({}, sourceControl)` と渡している）。spec がこの形で書かれているので、今の挙動は spec で固定されています。

## 5. valueChanges / statusChanges との関係

- `valueChanges` と `statusChanges` は `events` から作られた Observable ではなく、別々の `EventEmitter` です（[第 3 回の 3 節](03-forms-update-value-validity.md)の 1690〜1691 行目。1689 行目に「`events` から pipe したいが G3（Google の社内のコード）で壊れる」という TODO があります）。同じ関数の中で、隣り合う行で両方に流しています（1235〜1236 行目）。
- `valueChanges` は値だけを流し、`source` がありません。どの子が変えたかは分かりません。
- pristine / touched の変化と、submit / reset は `events` にしか出ません。
- 1678 行目のとおり、非同期の検証が打ち切られたときの status は `events` にだけ出ることがあります。

## 6. emitEvent: false で止まるもの、止まらないもの

📄 `angular/packages/forms/test/reactive_integration_spec.ts` L1646–1658 （▶ の行: 1655–1657）

```ts
1646 │     it('formGroup should not emit a reset event when resetting it with emit:false', () => {
1647 │       const fc1 = new FormControl<string | null>('foo', Validators.required);
1648 │       const fc2 = new FormControl<string | null>('bar', Validators.required);
1649 │       const fg = new FormGroup({fc1, fc2});
1650 │ 
1651 │       const fgEvents: ControlEvent[] = [];
1652 │       fg.events.subscribe((event) => fgEvents.push(event));
1653 │       expect(fgEvents.length).toBe(0);
1654 │ 
1655 ▶       fg.reset({fc1: 'newFoo', fc2: 'newBar'}, {emitEvent: false});
1656 ▶       expect(fgEvents.length).toBe(1);
1657 ▶       expect(fgEvents[0]).toBeInstanceOf(TouchedChangeEvent);
1658 │     });
```

ほとんどの関数は `if (... opts.emitEvent !== false)` の中で `_events.next` するので、`emitEvent: false` で止まります。止まらないのは、親を数え直す 2 つの関数です。

- `_updateTouched`（[第 2 回](02-forms-abstract-control.md)の 1748〜1755 行目）は `emitEvent` を見ず、変わっていなくても 1750 行目で毎回 `TouchedChangeEvent` を出します。上の spec の 1655〜1657 行目は、`fg.reset(..., {emitEvent: false})` でも `TouchedChangeEvent` が 1 つ出ることを**期待値として**書いています。2 節の 571 行目の `_updateTouched(options, this)` から出たものです。
- `_updatePristine`（第 2 回の 1733〜1745 行目）も `emitEvent` を見ず、1742 行目で「変わったら」出します。子の `markAsPristine({emitEvent: false})` で親が pristine に戻ると、親の `events` には `PristineChangeEvent` が出ます。`markAsUntouched({emitEvent: false})` も、親の `_updateTouched` で親の `events` に出ます。
- 1678 行目の `shouldHaveEmitted` の `StatusChangeEvent`（5 節）。

## 7. 動かして確かめる

> **🧪 DEMO — 根の form.events を 1 本だけ購読する**
>
> `form = new FormGroup({ name: FormControl('', required), address: FormGroup({ city: FormControl('') }) })` を `<form [formGroup]="form">` に渡しています。購読しているのは `form.events` だけです。source が子のイベントは赤で出ます。入力欄に打っても、blur しても出ます。
>
> city.setValue は source が address.city のまま、Value → Status。city.disable は source が form（4 節）、そのあと TouchedChangeEvent は source が address.city。submit は「ngSubmit の購読」の行のあとに FormSubmittedEvent（315 行目 → 316 行目）。emitEvent: false を付けて name を touched にしてから name.markAsUntouched を押すと、TouchedChangeEvent が 1 つ残ります（6 節）。form.reset も同じです。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-control-events)

## テストと直し方

`events` の spec は `reactive_integration_spec.ts` の `describe('reactive forms integration tests')`（:148）の中の `describe('unified form state change')`（:1151）にまとまっています。`it('Nested formControl should emit changes for itself and its parent')`（:1276）が `source` の受け渡し、4 節の `it('Nested formControl should emit disabled')` が disable、`it('formControl should not emit when emitEvent is false')`（:1454）が `emitEvent: false`、6 節の `it('formGroup should not emit a reset event when resetting it with emit:false')` が reset です。describe の先頭（:1155〜1197）に `expectValueChangeEvent` などの確かめ用の関数があり、どの it も「種類・`source`・中身」の 3 つを見ています。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/test:test --test_arg=--filter="unified form state change" --test_output=all
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Ran 20 of 1153 specs
20 specs, 0 failures
Finished in 0.066 seconds
//packages/forms/test:test                    PASSED in 0.9s
```

1. **名前の作り方**

   `unified form state change` は describe の名前そのままなので、この中の it 20 本が全部走ります（`Ran 20 of 1153 specs`）。1 本だけなら `"unified form state change Nested formControl should emit disabled"` のように it までつなぎます。
2. **直すとしたら**

   イベントの中身や `source` は、表の「出す関数」の行です。model の関数なら `abstract_model.ts`（`reset` は `form_control.ts`・`form_group.ts`・`form_array.ts`）、submit なら `abstract_form.directive.ts` と `ng_form.ts`。足す spec は `unified form state change` の中で、上の確かめ用の関数を使って書くのが既存の形です。テンプレート駆動の `NgForm` のイベントは `directives_spec.ts` の `describe('NgForm')` の中の `describe('events emissions')`（:450）にもあります。
3. **issue を読むときの手がかり**

   「`emitEvent: false` なのにイベントが出る」「`source` が子にならない」という話は、6 節と 4 節の行で説明がつき、しかも spec が今の挙動を期待値として書いています。直すと既存の spec が落ちるので、挙動を変える提案は「spec のどの行を変えることになるか」まで読んでから議論に加わるのが筋です（[第 20 回](20-forms-issues.md)）。

## 聞かれそうな質問

**Q. valueChanges と events のどちらを使えばよいですか？**

値だけが欲しいなら `valueChanges` で足ります。どの子が変えたか（`source`）、pristine / touched の変化、submit / reset まで 1 か所で受けたいなら `events` です。2 つは別々の Subject で、同じ関数の隣り合う行（1234〜1236 行目のように）で両方に流されます。`events` にだけ出るものがあり（5 節）、1678 行目のように条件が違うところもあります。

**Q. source と root の違いは何ですか？**

`source` はイベントを起こした節、`root` は木の一番上です。根の `events` に出る `ValueChangeEvent` の `source` は、`setValue` された子です（第 3 回の 1425 行目で `sourceControl` を渡すため）。ただし子の `disable()` から上った値と状態のイベントは、親自身が `source` になります（4 節の 1393〜1394 行目）。

**Q. emitEvent: false で events も止まりますか？**

ほとんどは止まります。止まらないのは、親を数え直す `_updateTouched`（毎回出す）と `_updatePristine`（変わったら出す）、それに 1678 行目の `shouldHaveEmitted` です。`FormGroup.reset(..., {emitEvent: false})` で `TouchedChangeEvent` が 1 つ出るのは spec の 1656〜1657 行目が期待している挙動です。

**Q. 子の FormResetEvent は親の events に出ますか？**

出ません。`FormGroup.reset` は 568 行目で子を `onlySelf: true` で reset するので、子の `FormResetEvent` は子の `events` だけに出ます。親の `events` に出るのは 574 行目の、`source` が親自身の `FormResetEvent` です。`FormSubmittedEvent` も、316 行目のとおり根の `_events` にだけ出ます。

## 読み終えて

- `events` は 6 つのクラスを流す 1 本の Observable。種類は `instanceof` で分け、どれも `source` を持つ。
- イベントは伝わるのではなく、親でも同じ関数が走って親が自分の `_events` に流す。`{...opts, sourceControl}` を渡すので、`source` は起こした子になる。
- 例外は `disable` / `enable` から上った値と状態のイベント（`source` が親自身）。spec がその形を期待している。
- `valueChanges` / `statusChanges` は別の `EventEmitter`。pristine / touched と submit / reset は `events` にしか出ない。
- `emitEvent: false` でも、`_updateTouched`・`_updatePristine`・`shouldHaveEmitted` の 3 か所からはイベントが出る。

---

← 前: [非同期の検証：PENDING と打ち切り](05-forms-async-validators.md)  
次: [FormGroup と FormArray：子を束ねる](07-forms-form-group-array.md) →
