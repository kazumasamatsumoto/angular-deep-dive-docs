[目次](../README.md) › [フォームの内側](README.md) › 第 5 回 / 全 20 回

# 非同期の検証：PENDING と打ち切り

> \_runAsyncValidator が status を PENDING にし、Promise も Observable も toObservable でそろえ、値が 1 つ届いたら setErrors で確定する流れ。値が変わると前の購読を \_cancelExistingSubscription で捨てる行（debounce はこれを使って自分で書く）、複数の非同期検証を forkJoin で待つ合成（配列で渡すと complete が必要になる）、同期の検証が失敗していると非同期は走らない理由。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-async-validators)

---

「このユーザー名はもう使われているか」をサーバーに聞くような検証は、結果がすぐには返りません。この章では、非同期の検証関数を渡した control が `PENDING` になり、結果が来たら `setErrors` で状態が決まるまでを 1 行ずつ追います。速く打つと前の検証が打ち切られる行、複数の非同期検証を `forkJoin` で待つ行、同期の検証が失敗していると非同期が走らない理由も見ます。

読む対象は `packages/forms/src/model/abstract_model.ts` の `pickAsyncValidators`・`_runAsyncValidator`・`_cancelExistingSubscription`・`setErrors` と、`packages/forms/src/validators.ts` の `toObservable`・`composeAsync` です。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. [3. updateValueAndValidity](03-forms-update-value-validity.md)
4. [4. Validators](04-forms-validators.md)
5. **5. 非同期の検証**（この章）
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

## 1. 非同期の検証関数を受け取る：配列なら合成する

📄 `angular/packages/forms/src/model/abstract_model.ts` L206–230 （▶ の行: 214–215, 218, 227–229）

```ts
206 │ /**
207 │  * Gets async validators from either an options object or given validators.
208 │  */
209 │ export function pickAsyncValidators(
210 │   asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
211 │   validatorOrOpts?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
212 │ ): AsyncValidatorFn | AsyncValidatorFn[] | null {
213 │   if (typeof ngDevMode === 'undefined' || ngDevMode) {
214 ▶     if (isOptionsObj(validatorOrOpts) && asyncValidator) {
215 ▶       console.warn(asyncValidatorsDroppedWithOptsWarning);
216 │     }
217 │   }
218 ▶   return (isOptionsObj(validatorOrOpts) ? validatorOrOpts.asyncValidators : asyncValidator) || null;
219 │ }
220 │ 
221 │ /**
222 │  * Creates async validator function by combining provided async validators.
223 │  */
224 │ function coerceToAsyncValidator(
225 │   asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
226 │ ): AsyncValidatorFn | null {
227 ▶   return Array.isArray(asyncValidator)
228 ▶     ? composeAsyncValidators(asyncValidator)
229 ▶     : asyncValidator || null;
230 │ }
```

218 行目、2 つ目の引数が options オブジェクトなら `asyncValidators` を、そうでなければ 3 つ目の引数を使います。214〜215 行目、options と 3 つ目の引数を**両方**渡すと、開発モードで警告を出して 3 つ目を捨てます。227〜229 行目は同期の `coerceToValidator`（[第 4 回](04-forms-validators.md)）と同じ形で、**配列のときだけ**`composeAsyncValidators` で 1 つの関数にし、単体ならそのまま使います。この違いは 4 節で効いてきます。

## 2. いつ呼ばれるか：同期の検証が通ったときだけ

非同期の検証を始めるのは `updateValueAndValidity` です（中身の全体は[第 3 回](03-forms-update-value-validity.md)）。その中の順番だけ言うと、abstract\_model.ts 1404 行目で `_cancelExistingSubscription()`、1406 行目で同期の検証（`_runValidator`）、1407 行目で状態を計算し、1409 行目の `if (this.status === VALID || this.status === PENDING)` を満たしたときだけ 1412 行目で `_runAsyncValidator` を呼びます。

つまり同期の検証で `INVALID` になった時点で、非同期の検証関数は**呼ばれもしません**。「空欄なのにサーバーに問い合わせる」ことは、`required` を付けておけば起きません。また 1404 行目の打ち切りは、同期が失敗したときにも走ります。前の値で走っていた検証は、新しい値が同期で落ちた時点で捨てられます。

## 3. \_runAsyncValidator：PENDING にして購読する

📄 `angular/packages/forms/src/model/abstract_model.ts` L1443–1459 （▶ の行: 1444–1446, 1450–1452, 1456）

```ts
1443 │   private _runAsyncValidator(shouldHaveEmitted: boolean, emitEvent?: boolean): void {
1444 ▶     if (this.asyncValidator) {
1445 ▶       this.status = PENDING;
1446 ▶       this._hasOwnPendingAsyncValidator = {
1447 │         emitEvent: emitEvent !== false,
1448 │         shouldHaveEmitted: shouldHaveEmitted !== false,
1449 │       };
1450 ▶       const obs = toObservable(this.asyncValidator(this));
1451 ▶       this._asyncValidationSubscription = obs.subscribe((errors: ValidationErrors | null) => {
1452 ▶         this._hasOwnPendingAsyncValidator = null;
1453 │         // This will trigger the recalculation of the validation status, which depends on
1454 │         // the state of the asynchronous validation (whether it is in progress or not). So, it is
1455 │         // necessary that we have updated the `_hasOwnPendingAsyncValidator` boolean flag first.
1456 ▶         this.setErrors(errors, {emitEvent, shouldHaveEmitted});
1457 │       });
1458 │     }
1459 │   }
```

1. **1444〜1445 行目：非同期の検証関数があれば PENDING**

   結果を待つ前に、まず `status` を `PENDING` にします。結果がまだ届いていなければ、このあと `updateValueAndValidity` が `statusChanges` に `PENDING` を流します（1421 行目、第 3 回の範囲）。
2. **1446〜1449 行目：「自分の非同期検証が走っている」印**

   `_hasOwnPendingAsyncValidator` に、このときの `emitEvent` と `shouldHaveEmitted` を持たせます。状態の計算 `_calculateStatus` は 1697 行目でこの印を見て `PENDING` を返します（[第 3 回](03-forms-update-value-validity.md)）。
3. **1450 行目：検証関数を呼び、Observable にそろえる**

   `this.asyncValidator(this)` の戻り値は Promise でも Observable でもよく、`toObservable` がどちらも Observable にします（次の引用）。
4. **1451 行目：購読を `_asyncValidationSubscription` に持つ**

   次の値が来たときに打ち切れるよう、`Subscription` を control に保存します。
5. **1452・1456 行目：値が届いたら印を消して setErrors**

   1453〜1455 行目のコメントのとおり、先に印を `null` にしないと、`setErrors` の中の状態計算がまだ `PENDING` を返してしまいます。`subscribe` の `next` で呼ぶので、**complete を待たず、値が 1 つ届いた時点で**状態が決まります。

📄 `angular/packages/forms/src/validators.ts` L609–621 （▶ の行: 610–611, 614, 616, 618）

```ts
609 │ export function toObservable(value: any): Observable<any> {
610 ▶   const obs = isPromise(value) ? from(value) : value;
611 ▶   if ((typeof ngDevMode === 'undefined' || ngDevMode) && !isSubscribable(obs)) {
612 │     let errorMessage = `Expected async validator to return Promise or Observable.`;
613 │     // A synchronous validator will return object or null.
614 ▶     if (typeof value === 'object') {
615 │       errorMessage +=
616 ▶         ' Are you using a synchronous validator where an async validator is expected?';
617 │     }
618 ▶     throw new RuntimeError(RuntimeErrorCode.WRONG_VALIDATOR_RETURN_TYPE, errorMessage);
619 │   }
620 │   return obs;
621 │ }
```

610 行目、Promise なら RxJS の `from` で Observable にします。611 行目、それでも購読できないもの（同期の検証関数を間違えて非同期の枠に入れて、オブジェクトや `null` が返ったとき）は、開発モードで 618 行目の `RuntimeError` を投げます。614〜616 行目、戻り値がオブジェクトなら「同期の検証関数を使っていませんか」と付け足します。

## 4. 打ち切り：\_cancelExistingSubscription

📄 `angular/packages/forms/src/model/abstract_model.ts` L1461–1475 （▶ の行: 1462–1463, 1467–1469, 1471–1472）

```ts
1461 │   private _cancelExistingSubscription(): boolean {
1462 ▶     if (this._asyncValidationSubscription) {
1463 ▶       this._asyncValidationSubscription.unsubscribe();
1464 │ 
1465 │       // we're cancelling the validator subscription, we keep if it should have emitted
1466 │       // because we want to emit eventually if it was required at least once.
1467 ▶       const shouldHaveEmitted =
1468 ▶         (this._hasOwnPendingAsyncValidator?.emitEvent ||
1469 ▶           this._hasOwnPendingAsyncValidator?.shouldHaveEmitted) ??
1470 │         false;
1471 ▶       this._hasOwnPendingAsyncValidator = null;
1472 ▶       return shouldHaveEmitted;
1473 │     }
1474 │     return false;
1475 │   }
```

1. **1462〜1463 行目：前の購読があれば unsubscribe**

   前の値で走っていた検証の Observable の購読をやめます。HTTP の Observable なら、ここでリクエストが取り消されます。結果があとから届いても `next` が呼ばれないので、古い値の結果で `errors` が上書きされることはありません。
2. **1467〜1469 行目：「本当なら通知するはずだった」を引き継ぐ**

   打ち切った検証が `emitEvent` 付きだったなら、その通知の約束を `shouldHaveEmitted` として返します。受け取った 1404 行目の値は 1412 行目で次の `_runAsyncValidator` に渡り、1448 行目で印に入ります。`emitEvent: false` の値の変更で打ち切られても、`events` には最後に `StatusChangeEvent` が流れる、という細かい約束のためです（[第 6 回](06-forms-control-events.md)）。
3. **1471 行目：印を消す**

   このあと同期の検証が失敗して `_runAsyncValidator` が呼ばれなければ、印は `null` のままなので `PENDING` は残りません。

> [!TIP]
> **新卒エンジニアへ**
>
> **debounce は自分で書く。** forms には「検証を何ミリ秒待つ」の設定がありません。値が変わるたびに検証関数が呼ばれ、前の購読は 1463 行目で捨てられるので、検証関数が `timer(300).pipe(switchMap(() => this.http.get(…)))` を返せば、300ms 以内に次の入力が来たときは `timer` ごと捨てられ、リクエストは出ません。これで debounce になります。

## 5. 状態が決まる：setErrors

📄 `angular/packages/forms/src/model/abstract_model.ts` L1507–1520 （▶ の行: 1510, 1512, 1518–1519）

```ts
1507 │   setErrors(errors: ValidationErrors | null, opts?: {emitEvent?: boolean}): void;
1508 │ 
1509 │   /** @internal */
1510 ▶   setErrors(
1511 │     errors: ValidationErrors | null,
1512 ▶     opts?: {emitEvent?: boolean; shouldHaveEmitted?: boolean},
1513 │   ): void;
1514 │   setErrors(
1515 │     errors: ValidationErrors | null,
1516 │     opts: {emitEvent?: boolean; shouldHaveEmitted?: boolean} = {},
1517 │   ): void {
1518 ▶     (this as Writable<this>).errors = errors;
1519 ▶     this._updateControlsErrors(opts.emitEvent !== false, this, opts.shouldHaveEmitted);
1520 │   }
```

1518 行目で `errors` を書き、1519 行目の `_updateControlsErrors` で状態を計算し直します。`_updateControlsErrors`（abstract\_model.ts 1664 行目、[第 6 回](06-forms-control-events.md)・[第 3 回](03-forms-update-value-validity.md)の範囲）は 1669 行目で `_calculateStatus` を呼び（印はもう `null` なので `VALID` か `INVALID`）、1672 行目で `statusChanges` に流し、1683 行目で親の `_updateControlsErrors` を呼んで、親の状態も決め直します。1510〜1513 行目の 2 つ目の宣言は `@internal` で、`shouldHaveEmitted` を渡せるのは forms の中だけです。

`setErrors` は公開 API でもあり、自分で呼んでエラーを付けることもできます。ただし doc コメントの Note にあるとおり、次の検証で上書きされます（自分で付けたエラーは、次の `updateValueAndValidity` の同期の検証結果で置き換わる）。

## 6. 複数の非同期検証：forkJoin で全部を待つ

📄 `angular/packages/forms/src/validators.ts` L684–712 （▶ の行: 690–691, 694–695, 697, 710）

```ts
684 │ /**
685 │  * Merges asynchronous validators into a single validator function.
686 │  * See `Validators.composeAsync` for additional information.
687 │  */
688 │ function composeAsync(validators: (AsyncValidatorFn | null)[]): AsyncValidatorFn | null {
689 │   if (!validators) return null;
690 ▶   const presentValidators: AsyncValidatorFn[] = validators.filter(isPresent) as any;
691 ▶   if (presentValidators.length == 0) return null;
692 │ 
693 │   return function (control: AbstractControl) {
694 ▶     const observables = executeValidators<AsyncValidatorFn>(control, presentValidators).map(
695 ▶       toObservable,
696 │     );
697 ▶     return forkJoin(observables).pipe(map(mergeErrors));
698 │   };
699 │ }
700 │ 
701 │ /**
702 │  * Accepts a list of async validators of different possible shapes (`AsyncValidator` and
703 │  * `AsyncValidatorFn`), normalizes the list (converts everything to `AsyncValidatorFn`) and merges
704 │  * them into a single validator function.
705 │  */
706 │ export function composeAsyncValidators(
707 │   validators: Array<AsyncValidator | AsyncValidatorFn>,
708 │ ): AsyncValidatorFn | null {
709 │   return validators != null
710 ▶     ? composeAsync(normalizeValidators<AsyncValidatorFn>(validators))
711 │     : null;
712 │ }
```

694〜695 行目で全部の検証関数を呼び、それぞれを `toObservable` にそろえます。697 行目の `forkJoin` は、**全部の Observable が complete したら**、それぞれの最後の値を配列で 1 回流します。それを同期と同じ `mergeErrors` で 1 つにします。710 行目、ディレクティブ由来の `AsyncValidator` オブジェクトは `normalizeValidators` で関数に直されます。

> [!WARNING]
> **ハマりどころ**
>
> **配列で渡すと complete が必要になる。** 3 節の 1451 行目は `next` だけで状態を決めるので、単体で渡した検証関数は値を 1 つ流せば済みます。ところが 227〜228 行目で配列は `composeAsync` を通り、697 行目の `forkJoin` は complete するまで何も流しません。`asyncValidators: [v]` と 1 つだけ配列に入れても同じです。`valueChanges` や `Subject` のように complete しない Observable を返すと、配列のときだけ `PENDING` のまま止まります。値を 1 つも流さずに complete する Observable（`EMPTY`）は、単体なら 1451 行目の `next` が来ず、配列なら `forkJoin` が何も流さずに終わるので、どちらの渡し方でも止まります。検証関数は `first()` や `take(1)` で 1 回で閉じる形にしておくのが安全です。

## 7. 全体の流れ

- 👤 `入力（または setValue('ad')）` — あなたの操作
  - `updateValueAndValidity()` — abstract\_model.ts 1397（第 3 回）
    - `_cancelExistingSubscription()` — abstract\_model.ts 1461 — *前の購読を unsubscribe（打ち切り）*
    - `_runValidator() → _calculateStatus()` — abstract\_model.ts 1406–1407 — *INVALID ならここで終わり*
    - `_runAsyncValidator(shouldHaveEmitted, emitEvent)` — abstract\_model.ts 1443 — *status = PENDING*
      - 👤 `asyncValidator(control)` — あなたの検証関数 — *Promise / Observable を返す*
      - `toObservable(…).subscribe(…)` — validators.ts 609 / abstract\_model.ts 1451
    - `statusChanges.emit('PENDING')` — abstract\_model.ts 1421（第 3 回）
- `（800ms 後）next(errors)` — あなたの Observable
  - `_hasOwnPendingAsyncValidator = null → setErrors(errors)` — abstract\_model.ts 1452–1456
    - `_updateControlsErrors() → _calculateStatus()` — abstract\_model.ts 1519 / 1669 — *VALID か INVALID に確定*
    - `statusChanges.emit(status)` — abstract\_model.ts 1672 — *親へも 1683 行目で伝わる*

> **🧪 DEMO — 本物の AsyncValidatorFn（800ms 後に答える）**
>
> @angular/forms 22.1.6 の `FormControl` に、`of(結果).pipe(delay(800))` を返す検証関数を `asyncValidators` で渡しています（外部通信はしません）。`admin`・`root`・`angular` は使用済み扱いです。検証関数の中で「開始」、`finalize` で「打ち切り」、`tap` で「完了」をログに出します。
>
> 2 つ目：1 回 `null` を流すが complete しない検証関数を、単体で渡すか配列で渡すか（作った直後の status）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-async-validators)

試すと次のことが見えます。

- 速く打つ（またはボタン）と、「#1 開始 → #1 打ち切り → #2 開始 → …」の順に並び、完了は最後の 1 つだけ（1463 行目）。
- required を付けて空にすると、「開始」が出ずに `INVALID` になる（1409 行目の条件）。
- complete しない検証関数は、単体なら `VALID`、配列なら `PENDING` のまま（1451 行目と 697 行目の違い）。

## テストと直し方

control の非同期検証は `packages/forms/test/form_control_spec.ts` の 433 行目 `describe('asyncValidator')`（外側は 34 行目 `describe('FormControl')`）にまとまっています。検証関数の `asyncValidator('expected', …)` は同じディレクトリの `util.ts` の補助関数です。

📄 `angular/packages/forms/test/form_control_spec.ts` L459–494 （▶ の行: 459–460, 463, 465, 468, 481, 488–489, 493）

```ts
459 ▶       it('should run the async validator only when the sync validator passes', async () => {
460 ▶         const c = new FormControl('', Validators.required, asyncValidator('expected'));
461 │         await timeout();
462 │ 
463 ▶         expect(c.errors).toEqual({'required': true});
464 │ 
465 ▶         c.setValue('some value');
466 │         await timeout();
467 │ 
468 ▶         expect(c.errors).toEqual({'async': true});
469 │       });
470 │ 
471 │       it('should mark the control as pending while running the async validation', async () => {
472 │         const c = new FormControl('', null!, asyncValidator('expected'));
473 │ 
474 │         expect(c.pending).toEqual(true);
475 │ 
476 │         await timeout();
477 │ 
478 │         expect(c.pending).toEqual(false);
479 │       });
480 │ 
481 ▶       it('should only use the latest async validation run', async () => {
482 │         const c = new FormControl(
483 │           '',
484 │           null!,
485 │           asyncValidator('expected', {'long': 200, 'expected': 100}),
486 │         );
487 │ 
488 ▶         c.setValue('long');
489 ▶         c.setValue('expected');
490 │ 
491 │         await timeout(300);
492 │ 
493 ▶         expect(c.valid).toEqual(true);
494 │       });
```

459〜469 行目が 2 節の「同期が通ったときだけ」です。最初は `''` で `required` が落ちるので `errors` は `{required: true}`、値を入れると非同期の `{async: true}` に変わります。481〜494 行目が 4 節の打ち切りで、488 行目の 200ms かかる検証を 489 行目の `setValue` で捨てるので、491 行目で 300ms 待ったあと、493 行目で 100ms の検証の結果どおり `valid` になっています。

📄 `angular/packages/forms/test/validators_spec.ts` L600–626 （▶ の行: 600, 607, 617–618, 622, 625）

```ts
600 ▶         it('should wait for all validators before setting errors', async () => {
601 │           function getTimerObs(time: number, errorMap: {[key: string]: any}): AsyncValidatorFn {
602 │             return (c: AbstractControl) => {
603 │               return timer(time).pipe(map(() => errorMap));
604 │             };
605 │           }
606 │ 
607 ▶           const v = Validators.composeAsync([
608 │             getTimerObs(100, {one: true}),
609 │             getTimerObs(200, {two: true}),
610 │           ])!;
611 │ 
612 │           let errorMap: {[key: string]: any} | null | undefined = undefined;
613 │           (v(new FormControl('invalid')) as Observable<ValidationErrors | null>)
614 │             .pipe(first())
615 │             .subscribe((errors: {[key: string]: any} | null) => (errorMap = errors));
616 │ 
617 ▶           await timeout(100);
618 ▶           expect(errorMap).not.toBeDefined(
619 │             `Expected errors not to be set until all validators came back.`,
620 │           );
621 │ 
622 ▶           await timeout(100);
623 │           expect(errorMap!)
624 │             .withContext(`Expected errors to merge once all validators resolved.`)
625 ▶             .toEqual({one: true, two: true});
626 │         });
```

`validators_spec.ts` の 600〜626 行目は 6 節の `forkJoin` で、100ms の時点ではまだ何も流れず（618 行目）、200ms で 2 つを合わせた結果が流れることを確かめます。

📄 `ターミナル`

```
cd ~/angular-research/angular

# form_control_spec.ts の describe('FormControl') > describe('asyncValidator') だけ
pnpm bazel test //packages/forms/test:test \
  --test_arg=--filter="FormControl asyncValidator" --test_output=all

# 2026-11-01 にこのマシンで走らせた結果（~/…/scratchpad/forms-logs/b-forms-async-validators.log から抜粋）
Ran 22 of 1153 specs
22 specs, 0 failures
//packages/forms/test:test                                               PASSED in 0.9s

# composeAsync（forkJoin）は validators_spec.ts の describe('composeAsync')
pnpm bazel test //packages/forms/test:test \
  --test_arg=--filter="Validators composeAsync" --test_output=all
# 2026-11-01 の実行: Ran 11 of 1153 specs / 11 specs, 0 failures
```

- **直すとしたら**：打ち切りと状態の決まり方は `abstract_model.ts` の `_runAsyncValidator`・`_cancelExistingSubscription`（1443〜1475 行目）、合成は `validators.ts` の `composeAsync`。テストは前者が `form_control_spec.ts` の `describe('asyncValidator')`（group なら `form_group_spec.ts` 1189 行目の `describe('asyncValidator')`）、後者が `validators_spec.ts` の `describe('composeAsync')` です。
- 非同期のテストは `await timeout(…)`（`@angular/private/testing`）で実時間を待ちます。この 3 つの spec ファイルには `fakeAsync` が 1 つもありません（grep で 0 件）。`util.ts` の `asyncValidator` は、値ごとの待ち時間（`{long: 200}` など）を取って Promise を返す補助関数です。手元で足すときもこの形に合わせます。
- 1 節の配列と単体の違いは、仕様として固まったものか、たまたまそうなっているのかをこの章では判断していません。issue を探すときの手がかりにしてください（[第 20 回](20-forms-issues.md)）。

## 聞かれそうな質問

**Q. debounce はどこで設定しますか？**

設定はありません。値が変わるたびに 1412 行目で検証関数が呼ばれ、前の購読は 1463 行目で捨てられます。だから検証関数が `timer(ms)` から始まる Observable を返せば、間に次の入力が来たとき `timer` ごと捨てられ、自然に debounce になります。入力のたびに検証関数そのものは呼ばれるので、重い処理は `timer` のあとに置きます。

**Q. PENDING のまま止まります。**

3 つ確かめます。(1) 検証関数の Observable が 1 つも値を流していない（1451 行目の `next` が来ないと 1452 行目の印が消えない）。(2) 配列で渡していて、どれかの Observable が complete しない（697 行目の `forkJoin` が流さない）。(3) 親の form が `PENDING` なら、子のどれかが `PENDING`（1697 行目の `_anyControlsHaveStatus(PENDING)`）。

**Q. updateOn: 'blur' と組み合わせるとどうなりますか？**

非同期の検証は `updateValueAndValidity` から呼ばれるので、control の値が変わる時点で走ります。`updateOn: 'blur'` では入力欄の値が control に入るのが blur のときなので（[第 10 回](10-forms-setup-control.md)の `_pendingValue`）、検証も blur のたびに 1 回だけ走ります。打つたびにサーバーに聞きたくないときの簡単な方法です。

**Q. 同期の検証が INVALID なのに、非同期の結果を見たいときは？**

1409 行目の条件があるので、同期が `INVALID` の間は非同期は呼ばれません。両方の結果がほしいなら、その検査を非同期の検証関数の中に入れる（同期の関数を呼んで、結果を合わせて返す）しかありません。

**Q. Promise を返してもよいですか？**

よいです。610 行目で `from(promise)` にしてから購読します。ただし Promise は取り消せないので、1463 行目で unsubscribe しても処理そのものは最後まで走ります（結果は捨てられます）。HTTP を取り消したいなら Observable を返します。

## 読み終えて

- 非同期の検証は `updateValueAndValidity` の中で、同期が `VALID`（または `PENDING`）のときだけ呼ばれる（1409 行目）
- `_runAsyncValidator` は `PENDING` にして購読し、値が 1 つ届いたら印を消して `setErrors` で状態を決め直す
- 値が変わると `_cancelExistingSubscription` が前の購読を unsubscribe する。古い結果は届かない。debounce はこれを使って自分で書く
- 配列で渡すと `composeAsync` の `forkJoin` を通るので、complete しない Observable は `PENDING` のまま止まる

---

← 前: [Validators：同期の検証関数と errors の合成](04-forms-validators.md)  
次: [events：状態の変化を 1 本の Observable で受ける](06-forms-control-events.md) →
