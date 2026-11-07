[目次](../README.md) › [フォームの内側](README.md) › 第 3 回 / 全 20 回

# updateValueAndValidity：値と検証が親へ伝わる全手順

> setValue のあとに呼ばれる updateValueAndValidity の中身を 1 行ずつ（\_setInitialStatus → \_updateValue → \_runValidator → \_calculateStatus → \_runAsyncValidator → 親の updateValueAndValidity）。onlySelf と emitEvent の効き方、disabled の子が値と状態から外れる理由、valueChanges が親より子で先に出る順番。

angular/angular · 読了 約 14 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-update-value-validity)

---

`control.setValue('x')` と書くと、値が入るだけでなく、検証が走り、`status` が決まり、`valueChanges` が出て、同じことが親・そのまた親でも起きます。その全部をしているのが `AbstractControl.updateValueAndValidity` です。この章では、中身を 1 行ずつ読み、`onlySelf` と `emitEvent` がどの行を止めるか、disabled の子がなぜ親の値と状態から消えるか、`valueChanges` がなぜ子 → 親の順に出るかを確かめます。

読む対象は `packages/forms/src/model/abstract_model.ts` の `updateValueAndValidity`・`_calculateStatus`・`disable` / `enable`、`packages/forms/src/model/form_control.ts` のコンストラクタと `setValue` です。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. **3. updateValueAndValidity**（この章）
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
20. [20. issue と PR を読む](20-forms-issues.md)

## 1. 入口：FormControl.setValue

📄 `angular/packages/forms/src/model/form_control.ts` L499–517 （▶ の行: 508–512, 515）

```ts
499 │   override setValue(
500 │     value: TValue,
501 │     options: {
502 │       onlySelf?: boolean;
503 │       emitEvent?: boolean;
504 │       emitModelToViewChange?: boolean;
505 │       emitViewToModelChange?: boolean;
506 │     } = {},
507 │   ): void {
508 ▶     untracked(() => {
509 ▶       (this as Writable<this>).value = this._pendingValue = value;
510 ▶       if (this._onChange.length && options.emitModelToViewChange !== false) {
511 ▶         this._onChange.forEach((changeFn) =>
512 ▶           changeFn(this.value, options.emitViewToModelChange !== false),
513 │         );
514 │       }
515 ▶       this.updateValueAndValidity(options);
516 │     });
517 │   }
```

1. **508 行目：全体を untracked で包む**

   `effect` の中で `setValue` を呼んでも、中で読まれる signal（入力欄の `writeValue` が読むものなど）がその effect の依存にならないようにしています。これを確かめる spec が `describe('FormControl.setValue is untracked')`（form\_control\_spec.ts:1671）です。
2. **509 行目：値を入れる**

   `value` と `_pendingValue`（`updateOn: 'blur'` などで使う「まだ反映していない値」）の両方に同じ値を入れます。`value` は signal ではないただのプロパティです（[第 2 回](02-forms-abstract-control.md)）。
3. **510〜513 行目：入力欄へ書き戻す**

   `_onChange` は、`[formControl]` などの配線が登録した「入力欄へ書く関数」の配列です。`emitModelToViewChange: false` ならここを飛ばします（[第 10 回](10-forms-setup-control.md)）。
4. **515 行目：updateValueAndValidity に同じ options を渡す**

   ここからがこの章の本題です。`onlySelf` と `emitEvent` はそのまま渡ります。

## 2. updateValueAndValidity の全行

📄 `angular/packages/forms/src/model/abstract_model.ts` L1397–1427 （▶ の行: 1400–1401, 1403–1404, 1406–1407, 1409, 1412, 1416–1421, 1424–1425）

```ts
1397 │   updateValueAndValidity(
1398 │     opts: {onlySelf?: boolean; emitEvent?: boolean; sourceControl?: AbstractControl} = {},
1399 │   ): void {
1400 ▶     this._setInitialStatus();
1401 ▶     this._updateValue();
1402 │ 
1403 ▶     if (this.enabled) {
1404 ▶       const shouldHaveEmitted = this._cancelExistingSubscription();
1405 │ 
1406 ▶       (this as Writable<this>).errors = this._runValidator();
1407 ▶       this.status = this._calculateStatus();
1408 │ 
1409 ▶       if (this.status === VALID || this.status === PENDING) {
1410 │         // If the canceled subscription should have emitted
1411 │         // we make sure the async validator emits the status change on completion
1412 ▶         this._runAsyncValidator(shouldHaveEmitted, opts.emitEvent);
1413 │       }
1414 │     }
1415 │ 
1416 ▶     const sourceControl = opts.sourceControl ?? this;
1417 ▶     if (opts.emitEvent !== false) {
1418 ▶       this._events.next(new ValueChangeEvent<TValue>(this.value, sourceControl));
1419 ▶       this._events.next(new StatusChangeEvent(this.status, sourceControl));
1420 ▶       (this.valueChanges as EventEmitter<TValue>).emit(this.value);
1421 ▶       (this.statusChanges as EventEmitter<FormControlStatus>).emit(this.status);
1422 │     }
1423 │ 
1424 ▶     if (!opts.onlySelf) {
1425 ▶       this._parent?.updateValueAndValidity({...opts, sourceControl});
1426 │     }
1427 │   }
```

1. **1400 行目：\_setInitialStatus — まず VALID か DISABLED に戻す**

   前の状態を一度捨てます。中身は 3 節の 1436 行目で、「全部 disabled か」だけで `DISABLED` か `VALID` を決めます。
2. **1401 行目：\_updateValue — 子から自分の値を組み直す**

   `FormControl` では何もしません（3 節の 549 行目）。`FormGroup` は enabled な子の値を集めて `value` を作り直します（[第 7 回](07-forms-form-group-array.md)）。
3. **1403 行目：disabled なら検証を全部飛ばす**

   1400 行目で `DISABLED` になっていれば、1404〜1413 行目は走りません。`errors` も前の値のままです（`disable()` が `null` にしています。4 節）。
4. **1404 行目：走っている非同期の検証を打ち切る**

   前の値のための非同期の検証を `unsubscribe` します（[第 5 回](05-forms-async-validators.md)）。
5. **1406 行目：同期の検証**

   `_runValidator()` の戻り値（`ValidationErrors | null`）を、そのまま `errors` に入れます。
6. **1407 行目：status を計算する**

   `_calculateStatus()`（3 節）。自分の `errors` と子の `status` から決まります。
7. **1409〜1412 行目：同期で通ったときだけ非同期の検証**

   `VALID` か `PENDING` のときだけ `_runAsyncValidator` を呼びます。同期の検証で `INVALID` なら、サーバーに聞きに行く検証は走りません（中身は[第 5 回](05-forms-async-validators.md)）。
8. **1416〜1422 行目：イベントを出す**

   `emitEvent` が `false` でなければ、1418〜1419 行目で `events` に `ValueChangeEvent` と `StatusChangeEvent`、1420〜1421 行目で `valueChanges` と `statusChanges` に流します。値も状態も**決まったあと**なので、購読の中で `control.value` や `control.status` を読むと新しい値です。
9. **1424〜1425 行目：親の updateValueAndValidity**

   `onlySelf` でなければ、親の同じ関数を `{...opts, sourceControl}` で呼びます。親でも 1400 行目からやり直し、親の親へ続きます。自分のイベント（1420 行目）を出した**あと**に親を呼ぶので、`valueChanges` は子 → 親 → 根の順に出ます。

> [!WARNING]
> **ハマりどころ**
>
> 1420 行目で子の `valueChanges` が出た時点では、1425 行目はまだです。だから**子の `valueChanges` の購読の中で親の `value` を読むと、古い値**が返ります。親の新しい値が欲しいなら、親の `valueChanges` を購読します。

## 3. 中で呼ばれる小さな関数

📄 `angular/packages/forms/src/model/abstract_model.ts` L1429–1442 （▶ の行: 1430–1432, 1436, 1440）

```ts
1429 │   /** @internal */
1430 ▶   _updateTreeValidity(opts: {emitEvent?: boolean} = {emitEvent: true}): void {
1431 ▶     this._forEachChild((ctrl: AbstractControl) => ctrl._updateTreeValidity(opts));
1432 ▶     this.updateValueAndValidity({onlySelf: true, emitEvent: opts.emitEvent});
1433 │   }
1434 │ 
1435 │   private _setInitialStatus() {
1436 ▶     this.status = this._allControlsDisabled() ? DISABLED : VALID;
1437 │   }
1438 │ 
1439 │   private _runValidator(): ValidationErrors | null {
1440 ▶     return this.validator ? this.validator(this) : null;
1441 │   }
1442 │ 
```

📄 `angular/packages/forms/src/model/abstract_model.ts` L1687–1700 （▶ の行: 1690–1691, 1695–1699）

```ts
1687 │   /** @internal */
1688 │   _initObservables() {
1689 │     // TODO: this should be piped from events() but is breaking in G3
1690 ▶     (this as Writable<this>).valueChanges = new EventEmitter();
1691 ▶     (this as Writable<this>).statusChanges = new EventEmitter();
1692 │   }
1693 │ 
1694 │   private _calculateStatus(): FormControlStatus {
1695 ▶     if (this._allControlsDisabled()) return DISABLED;
1696 ▶     if (this.errors) return INVALID;
1697 ▶     if (this._hasOwnPendingAsyncValidator || this._anyControlsHaveStatus(PENDING)) return PENDING;
1698 ▶     if (this._anyControlsHaveStatus(INVALID)) return INVALID;
1699 ▶     return VALID;
1700 │   }
```

📄 `angular/packages/forms/src/model/form_control.ts` L548–559 （▶ の行: 549, 553, 557–558）

```ts
548 │   /**  @internal */
549 ▶   override _updateValue(): void {}
550 │ 
551 │   /**  @internal */
552 │   override _anyControls(condition: (c: AbstractControl) => boolean): boolean {
553 ▶     return false;
554 │   }
555 │ 
556 │   /**  @internal */
557 ▶   override _allControlsDisabled(): boolean {
558 ▶     return this.disabled;
559 │   }
```

- 1436 行目の `_setInitialStatus` は `_allControlsDisabled()` だけを見ます。`FormControl` では 557〜558 行目で `this.disabled`、つまり「自分が disabled か」です。
- 1440 行目の `_runValidator` は、合成済みの検証関数（[第 4 回](04-forms-validators.md)）に自分を渡して呼ぶだけです。
- 1694〜1699 行目の `_calculateStatus` は上から順に判定します：全部 disabled → `DISABLED`（1695）、自分に `errors` → `INVALID`（1696）、自分の非同期の検証が走っているか子に `PENDING` がいる → `PENDING`（1697）、子に `INVALID` がいる → `INVALID`（1698）、それ以外 → `VALID`（1699）。`FormControl` の `_anyControls` は 553 行目で必ず `false` なので、1697〜1698 行目の「子」の判定は効きません。
- 1690〜1691 行目、`valueChanges` と `statusChanges` は `EventEmitter`（core の、`Subject` を継承したクラス）です。既定は同期なので、`emit` した行の中で購読の関数が走ります。
- 1430〜1433 行目の `_updateTreeValidity` は、子を先に全部 `onlySelf: true` で計算し直してから自分を計算します。`FormGroupDirective` がフォームを差し替えたときに使います（[第 12 回](12-forms-reactive-directives.md)）。

## 4. 作られたときの 1 回目

📄 `angular/packages/forms/src/model/form_control.ts` L469–497 （▶ の行: 475–476, 478–480, 485）

```ts
469 │   constructor(
470 │     // formState and defaultValue will only be null if T is nullable
471 │     formState: FormControlState<TValue> | TValue = null as unknown as TValue,
472 │     validatorOrOpts?: ValidatorFn | ValidatorFn[] | FormControlOptions | null,
473 │     asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
474 │   ) {
475 ▶     super(pickValidators(validatorOrOpts), pickAsyncValidators(asyncValidator, validatorOrOpts));
476 ▶     this._applyFormState(formState);
477 │     this._setUpdateStrategy(validatorOrOpts);
478 ▶     this._initObservables();
479 ▶     this.updateValueAndValidity({
480 ▶       onlySelf: true,
481 │       // If `asyncValidator` is present, it will trigger control status change from `PENDING` to
482 │       // `VALID` or `INVALID`.
483 │       // The status should be broadcasted via the `statusChanges` observable, so we set
484 │       // `emitEvent` to `true` to allow that during the control creation process.
485 ▶       emitEvent: !!this.asyncValidator,
486 │     });
487 │     if (
488 │       isOptionsObj(validatorOrOpts) &&
489 │       (validatorOrOpts.nonNullable || validatorOrOpts.initialValueIsDefault)
490 │     ) {
491 │       if (isFormControlState(formState)) {
492 │         this.defaultValue = formState.value;
493 │       } else {
494 │         this.defaultValue = formState;
495 │       }
496 │     }
497 │   }
```

[第 2 回](02-forms-abstract-control.md)で見たとおり `status` の初期値は `undefined` です。それを決めるのが 479〜486 行目の 1 回目の `updateValueAndValidity` です。480 行目 `onlySelf: true`（まだ親がいない）、485 行目 `emitEvent: !!this.asyncValidator`。非同期の検証があるときだけイベントを出すのは、`PENDING` から結果に変わることを `statusChanges` で知らせるためだと、481〜484 行目のコメントが書いています。478 行目の `_initObservables` で `EventEmitter` を作るのはその前です。

## 5. disable と enable：値と状態から外れる理由

📄 `angular/packages/forms/src/model/abstract_model.ts` L1266–1291 （▶ の行: 1273–1275, 1277, 1279, 1282–1286, 1289–1290）

```ts
1266 │   disable(
1267 │     opts: {onlySelf?: boolean; emitEvent?: boolean; sourceControl?: AbstractControl} = {},
1268 │   ): void {
1269 │     // If parent has been marked artificially dirty we don't want to re-calculate the
1270 │     // parent's dirtiness based on the children.
1271 │     const skipPristineCheck = this._parentMarkedDirty(opts.onlySelf);
1272 │ 
1273 ▶     this.status = DISABLED;
1274 ▶     (this as Writable<this>).errors = null;
1275 ▶     this._forEachChild((control: AbstractControl) => {
1276 │       /** We don't propagate the source control downwards */
1277 ▶       control.disable({...opts, onlySelf: true});
1278 │     });
1279 ▶     this._updateValue();
1280 │ 
1281 │     const sourceControl = opts.sourceControl ?? this;
1282 ▶     if (opts.emitEvent !== false) {
1283 ▶       this._events.next(new ValueChangeEvent(this.value, sourceControl));
1284 ▶       this._events.next(new StatusChangeEvent(this.status, sourceControl));
1285 ▶       (this.valueChanges as EventEmitter<TValue>).emit(this.value);
1286 ▶       (this.statusChanges as EventEmitter<FormControlStatus>).emit(this.status);
1287 │     }
1288 │ 
1289 ▶     this._updateAncestors({...opts, skipPristineCheck}, this);
1290 ▶     this._onDisabledChange.forEach((changeFn) => changeFn(true));
1291 │   }
```

1. **1273〜1274 行目：DISABLED にして errors を消す**

   `updateValueAndValidity` を通らず、ここで直接決めます。
2. **1275〜1278 行目：子を全部 disable**

   `onlySelf: true` なので、子は親（いまの節）に戻ってきません。
3. **1279 行目：自分の値を組み直す**
4. **1282〜1287 行目：自分のイベント**
5. **1289 行目：\_updateAncestors で親へ**

   下の 1326〜1337 行目です。
6. **1290 行目：入力欄の disabled を切り替える**

   `_onDisabledChange` は配線が登録した関数で、`setDisabledState(true)` を呼びます（[第 10 回](10-forms-setup-control.md)）。

📄 `angular/packages/forms/src/model/abstract_model.ts` L1311–1337 （▶ の行: 1316–1318, 1320, 1322, 1330–1331, 1333, 1335）

```ts
1311 │   enable(opts: {onlySelf?: boolean; emitEvent?: boolean} = {}): void {
1312 │     // If parent has been marked artificially dirty we don't want to re-calculate the
1313 │     // parent's dirtiness based on the children.
1314 │     const skipPristineCheck = this._parentMarkedDirty(opts.onlySelf);
1315 │ 
1316 ▶     this.status = VALID;
1317 ▶     this._forEachChild((control: AbstractControl) => {
1318 ▶       control.enable({...opts, onlySelf: true});
1319 │     });
1320 ▶     this.updateValueAndValidity({onlySelf: true, emitEvent: opts.emitEvent});
1321 │ 
1322 ▶     this._updateAncestors({...opts, skipPristineCheck}, this);
1323 │     this._onDisabledChange.forEach((changeFn) => changeFn(false));
1324 │   }
1325 │ 
1326 │   private _updateAncestors(
1327 │     opts: {onlySelf?: boolean; emitEvent?: boolean; skipPristineCheck?: boolean},
1328 │     sourceControl: AbstractControl,
1329 │   ): void {
1330 ▶     if (!opts.onlySelf) {
1331 ▶       this._parent?.updateValueAndValidity(opts);
1332 │       if (!opts.skipPristineCheck) {
1333 ▶         this._parent?._updatePristine({}, sourceControl);
1334 │       }
1335 ▶       this._parent?._updateTouched({}, sourceControl);
1336 │     }
1337 │   }
```

`enable` は 1316 行目で `VALID` にし、子を全部 enable し、1320 行目で自分の `updateValueAndValidity` を `onlySelf: true` で呼んで検証をやり直します。どちらも最後に `_updateAncestors` で、1331 行目の親の `updateValueAndValidity`、1333 行目の `_updatePristine`、1335 行目の `_updateTouched` を呼びます。

親の `updateValueAndValidity` の中では、2 節の 1401 行目で `FormGroup._updateValue` が enabled な子だけで値を組み、1407 行目の `_calculateStatus` が使う `_anyControls` も enabled な子だけを見ます（[第 7 回](07-forms-form-group-array.md)）。disabled の子が親の `value` からも `valid` の判定からも消えるのはこの 2 か所のためです。値が消えるわけではなく、`getRawValue()` には入っています。

> [!NOTE]
> **さらに深く**
>
> 1331 行目は親に `sourceControl` を渡していません（`opts` に入っていれば別ですが、`disable()` を普通に呼んだときは入っていません）。そのため、子の `disable()` で親の `events` に出る `ValueChangeEvent` の `source` は子ではなく親自身になります。`setValue` の 1425 行目とは違うところで、[第 6 回](06-forms-control-events.md)で spec と一緒に確かめます。

## ここまでの呼び出し

- 👤 `name.setValue('x')` — あなたのコード — *name は profile の子、profile は root の子*
  - `untracked(() => …)` — form\_control.ts L508
    - `value = _pendingValue = 'x'` — L509
    - `_onChange.forEach(fn)` — L511 — *入力欄へ書く（第 10 回）*
    - `name.updateValueAndValidity(options)` — abstract\_model.ts L1397
      - `_setInitialStatus → _updateValue` — L1400–1401 — *VALID に戻す / FormControl は何もしない*
      - `errors = _runValidator(); status = _calculateStatus()` — L1406–1407
      - `_runAsyncValidator(...)` — L1412 — *VALID / PENDING のときだけ（第 5 回）*
      - `valueChanges.emit('x') / statusChanges.emit` — L1420–1421 — *name の購読が走る*
      - `profile.updateValueAndValidity({...opts, sourceControl: name})` — L1425
        - `_updateValue()` — form\_group.ts — *enabled な子から value を作り直す（第 7 回）*
        - `valueChanges.emit({ name: 'x' })` — L1420 — *profile の購読が走る*
        - `root.updateValueAndValidity(…)` — L1425
          - `valueChanges.emit({ profile: …, age: 20 })` — L1420 — *最後に root の購読*

## 6. 動かして確かめる

> **🧪 DEMO — root &gt; profile &gt; name で、発火した順を記録する**
>
> `name = new FormControl('', Validators.required)`、`profile = new FormGroup({ name })`、`root = new FormGroup({ profile, age: new FormControl(20) })`。3 つの `valueChanges` と `statusChanges` を購読して、呼ばれた順にログへ足します。
>
> ふつうに押すと name → profile → root の順です（1420 行目 → 1425 行目）。onlySelf を付けると name だけが出て、root.value は古いまま。emitEvent: false を付けると 1 行も出ませんが、root.value は新しくなります（1417 行目で止まるのはイベントだけ）。空文字で setValue すると name も profile も root も INVALID。name.disable で root.value から name が消え、root.getRawValue() には残ります。「大文字にして setValue し直す」を付けて 'ab' を入れると、内側の setValue が root まで済んでから外側が profile へ進むので、profile と root の valueChanges が 2 回ずつ、どちらも 'AB' で出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-update-value-validity)

## テストと直し方

📄 `angular/packages/forms/test/form_control_spec.ts` L754–788 （▶ の行: 754, 756, 759–761, 764, 773, 778, 782, 784, 787）

```ts
754 ▶       it('should set the parent', () => {
755 │         c.setValue('newValue');
756 ▶         expect(g.value).toEqual({'one': 'newValue'});
757 │       });
758 │ 
759 ▶       it('should not set the parent when explicitly specified', () => {
760 ▶         c.setValue('newValue', {onlySelf: true});
761 ▶         expect(g.value).toEqual({'one': 'oldValue'});
762 │       });
763 │ 
764 ▶       it('should fire an event', async () => {
765 │         c.valueChanges.subscribe((value) => {
766 │           expect(value).toEqual('newValue');
767 │         });
768 │ 
769 │         c.setValue('newValue');
770 │         await timeout();
771 │       });
772 │ 
773 ▶       it('should not fire an event when explicitly specified', async () => {
774 │         c.valueChanges.subscribe((value) => {
775 │           throw 'Should not happen';
776 │         });
777 │ 
778 ▶         c.setValue('newValue', {emitEvent: false});
779 │         await timeout();
780 │       });
781 │ 
782 ▶       it('should work on a disabled control', () => {
783 │         g.addControl('two', new FormControl('two'));
784 ▶         c.disable();
785 │         c.setValue('new value');
786 │         expect(c.value).toEqual('new value');
787 ▶         expect(g.value).toEqual({'two': 'two'});
788 │       });
```

`describe('FormControl')` の中の `describe('setValue')`（form\_control\_spec.ts:724）の後半です。756 行目は 1425 行目（親へ伝わる）、760〜761 行目は `onlySelf` で親の値が古いまま、773〜780 行目は `emitEvent: false` で `valueChanges` が出ないこと、782〜788 行目は disabled な子の値が親の値に入らないことを確かめています。disable のイベントの順番は同じファイルの `describe('disable() & enable()')`（:1248）の中の `describe('disabled events')`（:1518）にあり、`it('should emit status change events in correct order')` が `['control', 'group']` の順を見ています。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/test:test --test_arg=--filter="FormControl (setValue|disable)" --test_output=all
```

📄 `出力（抜粋。2026-11-01 に実行）`

```
Ran 32 of 1153 specs
32 specs, 0 failures
Finished in 0.022 seconds
//packages/forms/test:test                    PASSED in 0.9s
```

1. **名前の作り方**

   `"FormControl (setValue|disable)"` は「`FormControl setValue …`」と「`FormControl disable() & enable() …`」で始まるフルネームを全部選ぶ正規表現で、32 本が走りました。`updateValueAndValidity` という名前の describe は無いので、メソッド名で `--filter` すると 0 本になります（[第 1 回](01-forms-overview.md)の落とし穴）。
2. **直すとしたら**

   順番やオプションの効き方は `abstract_model.ts` の `updateValueAndValidity`（1397 行目）、disabled の扱いは `disable`（1266 行目）・`enable`（1311 行目）・`_updateAncestors`（1326 行目）、状態の決まり方は `_calculateStatus`（1694 行目）です。`FormControl` だけの話なら `form_control_spec.ts` の `setValue` / `disable() & enable()`、親子の話なら `form_group_spec.ts` の `describe('setValue')`（:358）が足す場所の入口です。
3. **issue を読むときの手がかり**

   「`valueChanges` の中で親の値が古い」「`emitEvent: false` なのに親が変わった」のような issue は、たいてい 2 節の 1416〜1425 行目の順番で説明がつきます。再現はこの章のデモと同じ形（3 段の木と購読のログ）を spec に書けば作れます（[第 20 回](20-forms-issues.md)）。

## 聞かれそうな質問

**Q. 子より親が先に valueChanges を出すことはありますか？**

`setValue` から始まる道ではありません。1420 行目で自分の `valueChanges` を出してから、1425 行目で親を呼ぶからです。`disable` も 1285 行目で自分を出してから 1289 行目で親へ進みます。ただし、子の購読の中でもう一度 `setValue` を呼ぶと、内側の呼び出しが根まで済んでから外側が親へ進むので、親の `valueChanges` が 2 回出ます（デモの「大文字」）。`markAsTouched` などの `events` は逆に親が先です（[第 2 回](02-forms-abstract-control.md)）。

**Q. disabled の control の検証は走りますか？**

走りません。1400 行目の `_setInitialStatus` が 1436 行目で `DISABLED` にし（`FormControl` では 557〜558 行目の `this.disabled`）、1403 行目の `if (this.enabled)` で 1404〜1413 行目を全部飛ばします。`errors` は 1274 行目で `disable()` が `null` にしたままです。disabled のまま `setValue` すると値は変わりますが（spec の 782〜788 行目）、検証はされず、親の値にも入りません。

**Q. setValue の中で setValue を呼ぶとどうなりますか？**

`valueChanges` は 1690 行目の `EventEmitter` で同期に流れるので、購読の中の `setValue` は、外側の 1420 行目の `emit` の途中で、もう 1 回 `updateValueAndValidity` を最初から最後まで走ります。結果として、内側の値で子 → 親 → 根のイベントが出たあとに、外側の残り（1421 行目から）が続きます。外側の親の計算も 1401 行目で子から値を組み直すので、親の値はどちらの回も内側の値です。条件なしで同じ値を入れ直すと終わらないので、デモのように「変わるときだけ」にするか、内側で `emitEvent: false` を渡します。

**Q. onlySelf と emitEvent の違いは何ですか？**

`onlySelf` は 1424 行目で**親の計算**を止めます。親の `value` と `status` は古いまま残ります（spec の 760〜761 行目）。`emitEvent: false` は 1417 行目で**イベント**だけを止めます。1425 行目で `{...opts}` を親に渡すので親もイベントを出しませんが、親の値と状態は新しくなります。

## 読み終えて

- `updateValueAndValidity` は「状態を戻す → 値を組む → （enabled なら）同期の検証 → status → 非同期の検証 → イベント → 親」の順。
- イベントは値と状態が決まったあとに出る。親を呼ぶのはそのあとなので、`valueChanges` は子 → 親 → 根。子の購読の中の親の値は古い。
- `onlySelf` は親の計算を、`emitEvent: false` はイベントだけを止める。
- disabled の節は `_setInitialStatus` で `DISABLED` になって検証を飛ばし、親の `_updateValue` と `_anyControls` から外れる。`getRawValue()` には残る。

---

← 前: [AbstractControl：値と状態を持つ木の節](02-forms-abstract-control.md)  
次: [Validators：同期の検証関数と errors の合成](04-forms-validators.md) →
