[目次](../README.md) › [フォームの内側](README.md) › 第 7 回 / 全 20 回

# FormGroup と FormArray：子を束ねる

> FormGroup の controls と \_forEachChild、\_updateValue が enabled な子だけで value を組み立てる行、getRawValue、setValue と patchValue の違い（assertAllValuesPresent・assertControlPresent）、addControl / removeControl / setControl が \_registerOnCollectionChange と \_onCollectionChange を呼ぶ理由。FormArray の push・insert・removeAt と負の添字（\_adjustIndex）、FormRecord。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-form-group-array)

---

`FormGroup` と `FormArray` は、子の control を束ねて 1 つの値と状態にする `AbstractControl` です。この章では、子を登録する行（`setParent` と `_registerOnCollectionChange`）、`value` を enabled な子だけで組み立てる行と `getRawValue`、`setValue` が足りない値で投げて `patchValue` は投げない理由、`FormArray` の `push` / `insert` / `removeAt` と負の添字を追います。

読む対象は `packages/forms/src/model/form_group.ts`（`FormGroup` と `FormRecord`）、`packages/forms/src/model/form_array.ts`、`packages/forms/src/model/abstract_model.ts` の `assertControlPresent` / `assertAllValuesPresent` です。型の話（`value` が `Partial` になる理由）は[第 8 回](08-forms-typed-forms.md)に分けます。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. [3. updateValueAndValidity](03-forms-update-value-validity.md)
4. [4. Validators](04-forms-validators.md)
5. [5. 非同期の検証](05-forms-async-validators.md)
6. [6. events](06-forms-control-events.md)
7. **7. FormGroup と FormArray**（この章）
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

## 1. 作るとき：子に親を教える

📄 `angular/packages/forms/src/model/form_group.ts` L209–229 （▶ の行: 214, 216, 219–221, 225, 229）

```ts
209 │   constructor(
210 │     controls: TControl,
211 │     validatorOrOpts?: ValidatorFn | ValidatorFn[] | AbstractControlOptions | null,
212 │     asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[] | null,
213 │   ) {
214 ▶     super(pickValidators(validatorOrOpts), pickAsyncValidators(asyncValidator, validatorOrOpts));
215 │     (typeof ngDevMode === 'undefined' || ngDevMode) && validateFormGroupControls(controls);
216 ▶     this.controls = controls;
217 │     this._initObservables();
218 │     this._setUpdateStrategy(validatorOrOpts);
219 ▶     this._setUpControls();
220 ▶     this.updateValueAndValidity({
221 ▶       onlySelf: true,
222 │       // If `asyncValidator` is present, it will trigger control status change from `PENDING` to
223 │       // `VALID` or `INVALID`. The status should be broadcasted via the `statusChanges` observable,
224 │       // so we set `emitEvent` to `true` to allow that during the control creation process.
225 ▶       emitEvent: !!this.asyncValidator,
226 │     });
227 │   }
228 │ 
229 ▶   public controls: ɵTypedOrUntyped<TControl, TControl, {[key: string]: AbstractControl<any>}>;
```

1. **214 行目：検証関数を親クラスに渡す**

   `pickValidators` / `pickAsyncValidators` は [第 4 回](04-forms-validators.md)・[第 5 回](05-forms-async-validators.md)のとおりです。group 自身にも検証関数を付けられます（「2 つのパスワードが一致する」のような、子をまたぐ検証）。
2. **216 行目：渡したオブジェクトをそのまま controls にする**

   コピーしません。229 行目の `controls` は、あなたが渡した `{name: …, age: …}` そのものです。
3. **219 行目：\_setUpControls で子を登録**

   中身は 3 節で見ます。子 1 つずつに `setParent(this)` します。
4. **220〜226 行目：自分の値と状態を 1 回計算**

   `onlySelf: true` なので親（まだ無い）へは伝えません。225 行目の `emitEvent` は非同期の検証関数があるときだけ `true` で、`PENDING` から結果への変化を `statusChanges` に流すためです（コメントのとおり）。

## 2. 子の足し外し：registerControl と \_onCollectionChange

📄 `angular/packages/forms/src/model/form_group.ts` L241–255 （▶ の行: 249–253）

```ts
241 │   registerControl<K extends string & keyof TControl>(name: K, control: TControl[K]): TControl[K];
242 │   registerControl(
243 │     this: FormGroup<{[key: string]: AbstractControl<any>}>,
244 │     name: string,
245 │     control: AbstractControl<any>,
246 │   ): AbstractControl<any>;
247 │ 
248 │   registerControl<K extends string & keyof TControl>(name: K, control: TControl[K]): TControl[K] {
249 ▶     const existingControl = this._find(name as string);
250 ▶     if (existingControl) return existingControl as TControl[K];
251 ▶     this.controls[name] = control;
252 ▶     control.setParent(this as FormGroup);
253 ▶     control._registerOnCollectionChange(this._onCollectionChange);
254 │     return control;
255 │   }
```

249〜250 行目、同じ名前の子がもうあれば、**何もせずに既存の子を返します**（置き換えない）。251 行目で `controls` に入れ、252 行目で子に親を教え、253 行目で自分の `_onCollectionChange` を子にも渡します。`registerControl` は値と状態を計算し直さないので、ディレクティブが「あとで `updateValueAndValidity` を呼ぶ」前提で使う低い層の入口です。

📄 `angular/packages/forms/src/model/form_group.ts` L287–297 （▶ の行: 294–296）

```ts
287 │   addControl<K extends string & keyof TControl>(
288 │     name: K,
289 │     control: Required<TControl>[K],
290 │     options: {
291 │       emitEvent?: boolean;
292 │     } = {},
293 │   ): void {
294 ▶     this.registerControl(name, control);
295 ▶     this.updateValueAndValidity({emitEvent: options.emitEvent});
296 ▶     this._onCollectionChange();
297 │   }
```

📄 `angular/packages/forms/src/model/form_group.ts` L313–332 （▶ の行: 314–315, 328–331）

```ts
313 │   /**
314 ▶    * Remove a control from this group. In a strongly-typed group, required controls cannot be
315 ▶    * removed.
316 │    *
317 │    * This method also updates the value and validity of the control.
318 │    *
319 │    * @param name The control name to remove from the collection
320 │    * @param options Specifies whether this FormGroup instance should emit events after a
321 │    *     control is removed.
322 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
323 │    * `valueChanges` observables emit events with the latest status and value when the control is
324 │    * removed. When false, no events are emitted.
325 │    */
326 │   removeControl(name: string, options: {emitEvent?: boolean} = {}): void {
327 │     const existingControl = this._find(name);
328 ▶     if (existingControl) existingControl._registerOnCollectionChange(() => {});
329 ▶     delete (this.controls as any)[name];
330 ▶     this.updateValueAndValidity({emitEvent: options.emitEvent});
331 ▶     this._onCollectionChange();
332 │   }
```

📄 `angular/packages/forms/src/model/form_group.ts` L362–375 （▶ の行: 370–374）

```ts
362 │   setControl<K extends string & keyof TControl>(
363 │     name: K,
364 │     control: TControl[K],
365 │     options: {
366 │       emitEvent?: boolean;
367 │     } = {},
368 │   ): void {
369 │     const existingControl = this._find(name as string);
370 ▶     if (existingControl) existingControl._registerOnCollectionChange(() => {});
371 ▶     delete this.controls[name];
372 ▶     if (control) this.registerControl(name, control);
373 ▶     this.updateValueAndValidity({emitEvent: options.emitEvent});
374 ▶     this._onCollectionChange();
375 │   }
```

1. **294〜295 行目：addControl = registerControl + 計算し直し**

   `registerControl` と同じく、同じ名前があれば足しません。**置き換えたいときは `setControl`** です。
2. **328・370 行目：外す子のコールバックを空にする**

   外した子が、あとで中身を変えられても group 側の再配線が走らないよう、子の `_onCollectionChange` を何もしない関数に戻します。329・371 行目で `controls` から `delete` し、372 行目の `setControl` は新しい子を `registerControl` します。
3. **296・331・374 行目：\_onCollectionChange() を呼ぶ**

   `_onCollectionChange` は既定では空の関数で、`[formGroup]` ディレクティブ（`FormGroupDirective`）がつながると、ディレクティブの `_updateDomValue` を呼ぶ関数に差し替わります（reactive\_directives/abstract\_form.directive.ts 85 行目、[第 12 回](12-forms-reactive-directives.md)）。子の集まりが変わったら、`formControlName` と control の組を付け直してもらうための合図です。253 行目で子にも同じ関数を渡すので、入れ子の group の中で足し外ししても、いちばん外の `FormGroupDirective` に届きます。
4. **314〜315 行目：型付きの group では、必須のキーは外せない**

   これは型の話で、`removeControl` の型付きの宣言が `ɵOptionalKeys` を使っています（[第 8 回](08-forms-typed-forms.md)）。実行時の 326〜332 行目は名前を確かめず、無い名前なら何も消さずに計算し直すだけです。

## 3. value を組み立てる：enabled な子だけ

📄 `angular/packages/forms/src/model/form_group.ts` L611–642 （▶ の行: 612–614, 620, 626, 637–638）

```ts
611 │   _setUpControls(): void {
612 ▶     this._forEachChild((control) => {
613 ▶       control.setParent(this);
614 ▶       control._registerOnCollectionChange(this._onCollectionChange);
615 │     });
616 │   }
617 │ 
618 │   /** @internal */
619 │   override _updateValue(): void {
620 ▶     (this as Writable<this>).value = this._reduceValue() as any;
621 │   }
622 │ 
623 │   /** @internal */
624 │   override _anyControls(condition: (c: AbstractControl) => boolean): boolean {
625 │     for (const [controlName, control] of Object.entries(this.controls)) {
626 ▶       if (this.contains(controlName as any) && condition(control as any)) {
627 │         return true;
628 │       }
629 │     }
630 │     return false;
631 │   }
632 │ 
633 │   /** @internal */
634 │   _reduceValue(): Partial<TControl> {
635 │     let acc: Partial<TControl> = {};
636 │     return this._reduceChildren(acc, (acc, control, name) => {
637 ▶       if (control.enabled || this.disabled) {
638 ▶         acc[name] = control.value;
639 │       }
640 │       return acc;
641 │     });
642 │   }
```

1. **612〜614 行目：\_setUpControls**

   コンストラクタから呼ばれ、子 1 つずつに `setParent` と `_registerOnCollectionChange`。`registerControl` の 252〜253 行目と同じことを全員にします。
2. **620 行目：\_updateValue は \_reduceValue の結果を value に入れる**

   `updateValueAndValidity` が毎回呼ぶ（[第 3 回](03-forms-update-value-validity.md)）ので、`value` は子が変わるたびに作り直される新しいオブジェクトです。
3. **637〜638 行目：enabled な子だけを入れる**

   子が `enabled` のときだけ `acc[name] = control.value`。**disabled の子のキーは value から消えます**。ただし `this.disabled`（group 自身が disabled）なら全部入れます。全員 disabled で `{}` になるのを避けるためです。
4. **626 行目：状態も enabled な子だけで決める**

   `_anyControls` は `contains` を通すので、disabled の子は「INVALID な子がいるか」「PENDING な子がいるか」の数に入りません。

📄 `angular/packages/forms/src/model/form_group.ts` L383–392 （▶ の行: 385, 391）

```ts
383 │    * @param controlName The control name to check for existence in the collection
384 │    *
385 ▶    * @returns false for disabled controls, true otherwise.
386 │    */
387 │   contains<K extends string>(controlName: K): boolean;
388 │   contains(this: FormGroup<{[key: string]: AbstractControl<any>}>, controlName: string): boolean;
389 │ 
390 │   contains<K extends string & keyof TControl>(controlName: K): boolean {
391 ▶     return this._find(controlName)?.enabled === true;
392 │   }
```

391 行目、`contains` は「名前があるか」ではなく「名前があって enabled か」です（385 行目の doc）。名前があるかだけを見たいなら `get(name)` を使います。

📄 `angular/packages/forms/src/model/form_group.ts` L645–664 （▶ の行: 659–660, 663）

```ts
645 │   _reduceChildren<T, K extends keyof TControl>(
646 │     initValue: T,
647 │     fn: (acc: T, control: TControl[K], name: K) => T,
648 │   ): T {
649 │     let res = initValue;
650 │     this._forEachChild((control: TControl[K], name: K) => {
651 │       res = fn(res, control, name);
652 │     });
653 │     return res;
654 │   }
655 │ 
656 │   /** @internal */
657 │   override _allControlsDisabled(): boolean {
658 │     for (const controlName of Object.keys(this.controls) as Array<keyof TControl>) {
659 ▶       if ((this.controls as any)[controlName].enabled) {
660 ▶         return false;
661 │       }
662 │     }
663 ▶     return Object.keys(this.controls).length > 0 || this.disabled;
664 │   }
```

659〜660 行目、enabled な子が 1 つでもいれば `false`。663 行目、子がいて全員 disabled なら `true`（group は `DISABLED` になる）。子が 1 つもいないときは自分の `disabled` に従うので、空の group は `VALID` です。

📄 `angular/packages/forms/src/model/form_group.ts` L583–608 （▶ の行: 584–585, 601, 605–606）

```ts
583 │   override getRawValue(): ɵTypedOrUntyped<TControl, ɵFormGroupRawValue<TControl>, any> {
584 ▶     return this._reduceChildren({}, (acc, control, name) => {
585 ▶       (acc as any)[name] = (control as any).getRawValue();
586 │       return acc;
587 │     }) as any;
588 │   }
589 │ 
590 │   /** @internal */
591 │   override _syncPendingControls(): boolean {
592 │     let subtreeUpdated = this._reduceChildren(false, (updated: boolean, child) => {
593 │       return child._syncPendingControls() ? true : updated;
594 │     });
595 │     if (subtreeUpdated) this.updateValueAndValidity({onlySelf: true});
596 │     return subtreeUpdated;
597 │   }
598 │ 
599 │   /** @internal */
600 │   override _forEachChild(cb: (v: any, k: any) => void): void {
601 ▶     Object.keys(this.controls).forEach((key) => {
602 │       // The list of controls can change (for ex. controls might be removed) while the loop
603 │       // is running (as a result of invoking Forms API in `valueChanges` subscription), so we
604 │       // have to null check before invoking the callback.
605 ▶       const control = (this.controls as any)[key];
606 ▶       control && cb(control, key);
607 │     });
608 │   }
```

584〜585 行目の `getRawValue` は enabled かどうかを見ず、全部の子の `getRawValue()` を集めます。子が group / array なら再帰します。601〜606 行目の `_forEachChild` は、ループ中に子が消えることがあるので（`valueChanges` の購読の中で `removeControl` した場合、とコメントにある）、606 行目で存在を確かめてから呼びます。

## 4. setValue と patchValue：全部か、あるものだけか

📄 `angular/packages/forms/src/model/form_group.ts` L429–447 （▶ の行: 430, 436–441, 445）

```ts
429 │   override setValue(
430 ▶     value: ɵFormGroupRawValue<TControl>,
431 │     options: {
432 │       onlySelf?: boolean;
433 │       emitEvent?: boolean;
434 │     } = {},
435 │   ): void {
436 ▶     untracked(() => {
437 ▶       assertAllValuesPresent(this, true, value);
438 ▶       (Object.keys(value) as Array<keyof TControl>).forEach((name) => {
439 ▶         assertControlPresent(this, true, name as any);
440 ▶         (this.controls as any)[name].setValue((value as any)[name], {
441 ▶           onlySelf: true,
442 │           emitEvent: options.emitEvent,
443 │         });
444 │       });
445 ▶       this.updateValueAndValidity(options);
446 │     });
447 │   }
```

📄 `angular/packages/forms/src/model/abstract_model.ts` L267–293 （▶ の行: 270–271, 276, 278, 285–286, 288）

```ts
267 │ export function assertControlPresent(parent: any, isGroup: boolean, key: string | number): void {
268 │   const controls = parent.controls as {[key: string | number]: AbstractControl<any>};
269 │   const collection = isGroup ? Object.keys(controls) : controls;
270 ▶   if (!collection.length) {
271 ▶     throw new RuntimeError(
272 │       RuntimeErrorCode.NO_CONTROLS,
273 │       typeof ngDevMode === 'undefined' || ngDevMode ? noControlsError(isGroup) : '',
274 │     );
275 │   }
276 ▶   if (!hasOwnControl(controls, key)) {
277 │     throw new RuntimeError(
278 ▶       RuntimeErrorCode.MISSING_CONTROL,
279 │       typeof ngDevMode === 'undefined' || ngDevMode ? missingControlError(isGroup, key) : '',
280 │     );
281 │   }
282 │ }
283 │ 
284 │ export function assertAllValuesPresent(control: any, isGroup: boolean, value: any): void {
285 ▶   control._forEachChild((_: unknown, key: string | number) => {
286 ▶     if (value[key] === undefined) {
287 │       throw new RuntimeError(
288 ▶         RuntimeErrorCode.MISSING_CONTROL_VALUE,
289 │         typeof ngDevMode === 'undefined' || ngDevMode ? missingControlValueError(isGroup, key) : '',
290 │       );
291 │     }
292 │   });
293 │ }
```

1. **437 行目 → 285〜286 行目：全部の子に値があるか**

   `assertAllValuesPresent` は**子の側から**回り、渡した値に子の名前のキーが無ければ（`undefined`）、288 行目の `MISSING_CONTROL_VALUE`（NG01002）を投げます。`_forEachChild` は disabled の子も回るので、disabled の子の値も省けません。
2. **439 行目 → 270・276 行目：値のキーに対応する子がいるか**

   今度は**値の側から**回ります。子が 1 つもなければ 271 行目の `NO_CONTROLS`（NG01000）、余計なキーがあれば 278 行目の `MISSING_CONTROL`（NG01001）。
3. **440〜441 行目：子の setValue は onlySelf: true**

   子が 1 つずつ親に伝えると、親の計算が子の数だけ走ります。子には `onlySelf: true` で自分だけ更新させ、最後に 445 行目で 1 回だけ自分の `updateValueAndValidity` を呼びます。
4. **436 行目：untracked**

   `effect` や `computed` の中で `setValue` を呼んでも、中で読む signal（status など、[第 2 回](02-forms-abstract-control.md)）に依存が付かないようにしています（commit 2061fd82538 のメッセージは「AbstractControl への書き込みが signal の読み取りを登録すべきではない」。テストは form\_group\_spec.ts 2787 行目の `describe('FormGroup.setValue is untracked')`）。430 行目の引数の型が `ɵFormGroupRawValue`（全部のキーが必須）なのは、この「全部要る」を型でも表すためです。

📄 `angular/packages/forms/src/model/form_group.ts` L480–504 （▶ の行: 481, 491–495, 499, 503）

```ts
480 │   override patchValue(
481 ▶     value: ɵFormGroupValue<TControl>,
482 │     options: {
483 │       onlySelf?: boolean;
484 │       emitEvent?: boolean;
485 │     } = {},
486 │   ): void {
487 │     // Even though the `value` argument type doesn't allow `null` and `undefined` values, the
488 │     // `patchValue` can be called recursively and inner data structures might have these values, so
489 │     // we just ignore such cases when a field containing FormGroup instance receives `null` or
490 │     // `undefined` as a value.
491 ▶     if (value == null /* both `null` and `undefined` */) return;
492 ▶     (Object.keys(value) as Array<keyof TControl>).forEach((name) => {
493 ▶       const existingControl = this._find(name as string);
494 ▶       if (existingControl) {
495 ▶         existingControl.patchValue(
496 │           /* Guaranteed to be present, due to the outer forEach. */ value[
497 │             name as keyof ɵFormGroupValue<TControl>
498 │           ]!,
499 ▶           {onlySelf: true, emitEvent: options.emitEvent},
500 │         );
501 │       }
502 │     });
503 ▶     this.updateValueAndValidity(options);
504 │   }
```

`patchValue` には assert がありません。492〜494 行目で**値のキー**を回り、`_find` で子が見つかったものだけ 495 行目で `patchValue` します。足りないキーは触らず、余計なキーは無視します。491 行目、入れ子の group に `null` / `undefined` が来たら何もしません。481 行目の引数の型は `ɵFormGroupValue`（全部のキーが省略可）です。

📄 `angular/packages/forms/src/model/form_group.ts` L563–576 （▶ の行: 564, 567–568, 570–572）

```ts
563 │   override reset(
564 ▶     value: ɵTypedOrUntyped<TControl, ɵFormGroupArgumentValue<TControl>, any> = {},
565 │     options: {onlySelf?: boolean; emitEvent?: boolean; overwriteDefaultValue?: boolean} = {},
566 │   ): void {
567 ▶     this._forEachChild((control: AbstractControl, name) => {
568 ▶       control.reset(value ? (value as any)[name] : null, {...options, onlySelf: true});
569 │     });
570 ▶     this._updatePristine(options, this);
571 ▶     this._updateTouched(options, this);
572 ▶     this.updateValueAndValidity(options);
573 │     if (options?.emitEvent !== false) {
574 │       this._events.next(new FormResetEvent(this));
575 │     }
576 │   }
```

`reset` は 567〜568 行目で全部の子の `reset` を呼びます。値が無いキーの子には `value[name]`（`undefined`）が渡り、`FormControl.reset` は引数が `undefined` なら既定値（`defaultValue`）を使います（[第 8 回](08-forms-typed-forms.md)）。そのあと 570〜572 行目で pristine・touched・値と状態を自分で決め直します。`FormResetEvent` を流す 573〜575 行目は[第 6 回](06-forms-control-events.md)です。

## 5. FormArray：添字で並ぶ子

📄 `angular/packages/forms/src/model/form_array.ts` L168–196 （▶ の行: 169, 185, 188, 191–192, 194–195）

```ts
168 │   at(index: number): ɵTypedOrUntyped<TControl, TControl, AbstractControl<any>> {
169 ▶     return (this.controls as any)[this._adjustIndex(index)];
170 │   }
171 │ 
172 │   /**
173 │    * Insert a new `AbstractControl` at the end of the array.
174 │    *
175 │    * @param control Form control to be inserted
176 │    * @param options Specifies whether this FormArray instance should emit events after a new
177 │    *     control is added.
178 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
179 │    * `valueChanges` observables emit events with the latest status and value when the control is
180 │    * inserted. When false, no events are emitted.
181 │    *
182 │    * NOTE: Pushing to the FormArray will not mark it dirty. If you want to mark if dirty, call `markAsDirty()`.
183 │    */
184 │   push(control: TControl | Array<TControl>, options: {emitEvent?: boolean} = {}): void {
185 ▶     if (Array.isArray(control)) {
186 │       control.forEach((ctrl) => {
187 │         this.controls.push(ctrl);
188 ▶         this._registerControl(ctrl);
189 │       });
190 │     } else {
191 ▶       this.controls.push(control);
192 ▶       this._registerControl(control);
193 │     }
194 ▶     this.updateValueAndValidity({emitEvent: options.emitEvent});
195 ▶     this._onCollectionChange();
196 │   }
```

📄 `angular/packages/forms/src/model/form_array.ts` L213–243 （▶ の行: 214, 216–217, 236–237, 239–242）

```ts
213 │   insert(index: number, control: TControl, options: {emitEvent?: boolean} = {}): void {
214 ▶     this.controls.splice(index, 0, control);
215 │ 
216 ▶     this._registerControl(control);
217 ▶     this.updateValueAndValidity({emitEvent: options.emitEvent});
218 │   }
219 │ 
220 │   /**
221 │    * Remove the control at the given `index` in the array.
222 │    *
223 │    * @param index Index in the array to remove the control.  If `index` is negative, wraps around
224 │    *     from the back. If `index` is greatly negative (less than `-length`), removes the first
225 │    *     element. This behavior is the same as `Array.splice(index, 1)`.
226 │    * @param options Specifies whether this FormArray instance should emit events after a
227 │    *     control is removed.
228 │    * * `emitEvent`: When true or not supplied (the default), both the `statusChanges` and
229 │    * `valueChanges` observables emit events with the latest status and value when the control is
230 │    * removed. When false, no events are emitted.
231 │    *
232 │    * NOTE: Removing the FormArray will not mark it dirty. If you want to mark if dirty, call `markAsDirty()`.
233 │    */
234 │   removeAt(index: number, options: {emitEvent?: boolean} = {}): void {
235 │     // Adjust the index, then clamp it at no less than 0 to prevent undesired underflows.
236 ▶     let adjustedIndex = this._adjustIndex(index);
237 ▶     if (adjustedIndex < 0) adjustedIndex = 0;
238 │ 
239 ▶     if (this.controls[adjustedIndex])
240 ▶       this.controls[adjustedIndex]._registerOnCollectionChange(() => {});
241 ▶     this.controls.splice(adjustedIndex, 1);
242 ▶     this.updateValueAndValidity({emitEvent: options.emitEvent});
243 │   }
```

📄 `angular/packages/forms/src/model/form_array.ts` L498–512 （▶ の行: 499–502, 511）

```ts
498 │   clear(options: {emitEvent?: boolean} = {}): void {
499 ▶     if (this.controls.length < 1) return;
500 ▶     this._forEachChild((control) => control._registerOnCollectionChange(() => {}));
501 ▶     this.controls.splice(0);
502 ▶     this.updateValueAndValidity({emitEvent: options.emitEvent});
503 │   }
504 │ 
505 │   /**
506 │    * Adjusts a negative index by summing it with the length of the array. For very negative
507 │    * indices, the result may remain negative.
508 │    * @internal
509 │    */
510 │   private _adjustIndex(index: number): number {
511 ▶     return index < 0 ? index + this.length : index;
512 │   }
```

1. **169・511 行目：at と負の添字**

   `at(index)` は 511 行目の `_adjustIndex` で負なら `length` を足します。`at(-1)` は最後の子。`-length` より小さいと、足しても負のままなので `undefined` です（`Array.prototype.at` と同じ。テストは 6 節）。
2. **185〜195 行目：push は配列も受け取る**

   配列なら 1 つずつ、そうでなければ 1 つを `controls.push` し、188・192 行目の `_registerControl` で親を教えます。194 行目で計算し直し、195 行目で `_onCollectionChange()`。
3. **214 行目：insert は splice をそのまま使う**

   `_adjustIndex` を通さず `splice(index, 0, control)` なので、負の添字の扱いは `splice` に任せています。
4. **236〜241 行目：removeAt は添字を直してから splice**

   `_adjustIndex` のあと、237 行目でまだ負なら 0 に寄せます（`removeAt(-10)` は先頭を消す）。240 行目で消える子のコールバックを空に戻し、241 行目で取り除きます。
5. **500〜502 行目：clear は全員のコールバックを空にして splice(0)**

   499 行目、もともと空なら何もしません（イベントも流れません）。

> [!NOTE]
> **ポイント**
>
> このリビジョンでは、`_onCollectionChange()` を呼ぶのは `push`（195 行目）と `setControl` だけで、`insert`（213〜218 行目）・`removeAt`（234〜243 行目）・`clear`（498〜503 行目）は呼びません。FormGroup 側は `addControl`・`removeControl`・`setControl` の 3 つとも呼びます（2 節）。これが `FormGroupDirective` の側で何を起こすかは、ディレクティブを読む[第 12 回](12-forms-reactive-directives.md)の範囲です。

📄 `angular/packages/forms/src/model/form_array.ts` L524–558 （▶ の行: 532–534, 539, 552, 556–557）

```ts
524 │   override _forEachChild(cb: (c: AbstractControl, index: number) => void): void {
525 │     this.controls.forEach((control: AbstractControl, index: number) => {
526 │       cb(control, index);
527 │     });
528 │   }
529 │ 
530 │   /** @internal */
531 │   override _updateValue(): void {
532 ▶     (this as Writable<this>).value = this.controls
533 ▶       .filter((control) => control.enabled || this.disabled)
534 ▶       .map((control) => control.value);
535 │   }
536 │ 
537 │   /** @internal */
538 │   override _anyControls(condition: (c: AbstractControl) => boolean): boolean {
539 ▶     return this.controls.some((control) => control.enabled && condition(control));
540 │   }
541 │ 
542 │   /** @internal */
543 │   _setUpControls(): void {
544 │     this._forEachChild((control) => this._registerControl(control));
545 │   }
546 │ 
547 │   /** @internal */
548 │   override _allControlsDisabled(): boolean {
549 │     for (const control of this.controls) {
550 │       if (control.enabled) return false;
551 │     }
552 ▶     return this.controls.length > 0 || this.disabled;
553 │   }
554 │ 
555 │   private _registerControl(control: AbstractControl) {
556 ▶     control.setParent(this);
557 ▶     control._registerOnCollectionChange(this._onCollectionChange);
558 │   }
```

📄 `angular/packages/forms/src/model/form_array.ts` L453–460 （▶ の行: 456, 459）

```ts
453 │   /**
454 │    * The aggregate value of the array, including any disabled controls.
455 │    *
456 ▶    * Reports all values regardless of disabled status.
457 │    */
458 │   override getRawValue(): ɵFormArrayRawValue<TControl> {
459 ▶     return this.controls.map((control: AbstractControl) => control.getRawValue());
460 │   }
```

532〜534 行目、`FormArray` の `value` も enabled な子だけ（または自分が disabled なら全部）。disabled の子は **詰められる**ので、`value` の添字と `controls` の添字がずれます（下のデモで `row-1` を disable すると、`value[0]` は `row-2` になる）。添字で対応を取りたいなら `getRawValue()`（458〜460 行目、全部の子を `map`）を使います。539 行目の `_anyControls`、552 行目の `_allControlsDisabled` は FormGroup と同じ考え方です。

## 6. FormRecord：キーが決まっていない group

📄 `angular/packages/forms/src/model/form_group.ts` L742–760 （▶ の行: 742–744, 746, 752, 759）

```ts
742 ▶ export class FormRecord<TControl extends AbstractControl = AbstractControl> extends FormGroup<{
743 ▶   [key: string]: TControl;
744 ▶ }> {}
745 │ 
746 ▶ export interface FormRecord<TControl> {
747 │   /**
748 │    * Registers a control with the records's list of controls.
749 │    *
750 │    * See `FormGroup#registerControl` for additional information.
751 │    */
752 ▶   registerControl(name: string, control: TControl): TControl;
753 │ 
754 │   /**
755 │    * Add a control to this group.
756 │    *
757 │    * See `FormGroup#addControl` for additional information.
758 │    */
759 ▶   addControl(name: string, control: TControl, options?: {emitEvent?: boolean}): void;
760 │ 
```

742〜744 行目、`FormRecord` は `FormGroup<{[key: string]: TControl}>` を継承するだけで、**実行時の中身は 1 行もありません**。746 行目からの `interface FormRecord`（クラスと同じ名前の interface で、宣言を足す TypeScript の書き方）は、メソッドの引数を「どんな文字列のキーでもよい、ただし子は全部 `TControl`」という型に書き直しています。FormGroup が「決まったキーと、キーごとの型」、FormRecord が「自由なキーと、そろった型」です。

> **🧪 DEMO — 本物の FormArray と FormGroup**
>
> @angular/forms 22.1.6 です。各行は `[formControl]` で入力欄につないでいます。行の disable や足し外しのたびに、`arr.events` を受けて下の値を読み直します。
>
> 2 つ目：`new FormGroup({name: FormControl('Alex'), age: FormControl(20)})` に `setValue` / `patchValue`。投げたエラーは try/catch で捕まえて表示します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-form-group-array)

試すと次のことが見えます。

- `row-1` を disable すると `value` から消えて詰まり、`getRawValue()` には残る（533 行目と 459 行目）。全部 disable すると `status` が `DISABLED` になり、`value` に全部戻る（552 行目と 533 行目の `this.disabled`）。
- `setValue({name})` は `NG01002: Must supply a value for form control with name: 'age'`、余計なキーは `NG01001`。`patchValue({name})` は通る。
- age を disable しても `setValue({name})` は NG01002 のまま（285 行目の `_forEachChild` は disabled の子も回る）。

## ここまでの流れ

- 👤 `group.setValue({name: 'Bea', age: 30})` — あなたのコード
  - `assertAllValuesPresent(this, true, value)` — abstract\_model.ts 284 — *子の側から：値が足りなければ NG01002*
  - `assertControlPresent(this, true, name)` — abstract\_model.ts 267 — *値の側から：子がいなければ NG01001*
  - `controls[name].setValue(v, {onlySelf: true})` — form\_group.ts 440 — *子は親に伝えない*
  - `this.updateValueAndValidity(options)` — form\_group.ts 445
    - `_updateValue() → _reduceValue()` — form\_group.ts 620 / 634 — *enabled な子だけで value*
    - `_calculateStatus() → _anyControls(…)` — abstract\_model.ts（第 3 回）/ form\_group.ts 624 — *contains で enabled な子だけ*

## テストと直し方

FormGroup は `packages/forms/test/form_group_spec.ts`（外側は 45 行目 `describe('FormGroup')`。72 行目 `getRawValue`、240 行目 `adding and removing controls`、358 行目 `setValue`、486 行目 `patchValue`）、FormArray は `packages/forms/test/form_array_spec.ts`（29 行目 `describe('FormArray')`。32 行目 `adding/removing`、196 行目 `getRawValue()`、1453 行目 `out of bounds positive indices`、1490 行目 `negative indices`）です。

📄 `angular/packages/forms/test/form_group_spec.ts` L408–434 （▶ の行: 408, 410, 416, 420–421, 423, 433）

```ts
408 ▶       it('should throw if fields are missing from supplied value (subset)', () => {
409 │         expect(() => g.setValue({'one': 'one'})).toThrowError(
410 ▶           new RegExp(`NG01002: Must supply a value for form control with name: 'two'`),
411 │         );
412 │       });
413 │ 
414 │       it('should throw if a value is provided for a missing control (superset)', () => {
415 │         expect(() => g.setValue({'one': 'one', 'two': 'two', 'three': 'three'})).toThrowError(
416 ▶           new RegExp(`NG01001: Cannot find form control with name: 'three'`),
417 │         );
418 │       });
419 │ 
420 ▶       it('should throw if a value is not provided for a disabled control', () => {
421 ▶         c2.disable();
422 │         expect(() => g.setValue({'one': 'one'})).toThrowError(
423 ▶           new RegExp(`NG01002: Must supply a value for form control with name: 'two'`),
424 │         );
425 │       });
426 │ 
427 │       it('should throw if no controls are set yet', () => {
428 │         const empty = new FormGroup({});
429 │         expect(() =>
430 │           empty.setValue({
431 │             'one': 'one',
432 │           }),
433 ▶         ).toThrowError(new RegExp(`no form controls registered with this group`));
434 │       });
```

408〜425 行目が 4 節の 3 つの assert です。420〜425 行目は「disabled の子の値も省けない」で、デモの 3 つ目と同じことを確かめています。433 行目は 271 行目の `noControlsError` の文の一部に一致させています。

📄 `angular/packages/forms/test/form_array_spec.ts` L1490–1516 （▶ の行: 1503, 1506, 1509, 1513）

```ts
1490 │     describe('negative indices', () => {
1491 │       let c1: FormControl = new FormControl(1);
1492 │       let c2: FormControl = new FormControl(2);
1493 │       let c3: FormControl = new FormControl(3);
1494 │       let c4: FormControl = new FormControl(4);
1495 │       let c99: FormControl = new FormControl(99);
1496 │ 
1497 │       let fa: FormArray;
1498 │ 
1499 │       beforeEach(() => {
1500 │         fa = new FormArray([c1, c2, c3, c4]);
1501 │       });
1502 │ 
1503 ▶       // This spec checks the behavior is identical to `Array.prototype.at(index)`
1504 │       describe('should work with at', () => {
1505 │         it('wrapping from the back between [-length, 0)', () => {
1506 ▶           expect(fa.at(-1)).toBe(c4);
1507 │           expect(fa.at(-2)).toBe(c3);
1508 │           expect(fa.at(-3)).toBe(c2);
1509 ▶           expect(fa.at(-4)).toBe(c1);
1510 │         });
1511 │ 
1512 │         it('becoming undefined when less than -length', () => {
1513 ▶           expect(fa.at(-5)).toBeUndefined();
1514 │           expect(fa.at(-10)).toBeUndefined();
1515 │         });
1516 │       });
```

1503 行目のコメントのとおり、`at` の負の添字は `Array.prototype.at` と同じであることを確かめています。

📄 `ターミナル`

```
cd ~/angular-research/angular

# form_array_spec.ts の describe('FormArray') > describe('negative indices') だけ
pnpm bazel test //packages/forms/test:test \
  --test_arg=--filter="FormArray negative indices" --test_output=all

# 2026-11-01 にこのマシンで走らせた結果（~/…/scratchpad/forms-logs/b-forms-form-group-array.log から抜粋）
Ran 22 of 1153 specs
22 specs, 0 failures
//packages/forms/test:test                                               PASSED in 1.0s

# setValue が足りない値で投げるテスト（form_group_spec.ts の describe('setValue')）
pnpm bazel test //packages/forms/test:test \
  --test_arg=--filter="FormGroup setValue should throw" --test_output=all
# 2026-11-01 の実行: Ran 4 of 1153 specs / 4 specs, 0 failures
```

- `"FormArray negative indices"` は 1490 行目の describe の下にある入れ子の describe（`should work with at` / `setControl` / `removeAt` / `insert`）も全部含むので 22 本になりました。
- **直すとしたら**：値の組み立ては `form_group.ts` の `_reduceValue`（634 行目）と `form_array.ts` の `_updateValue`（531 行目）、子の足し外しは各メソッド、setValue の検査は `abstract_model.ts` の `assertAllValuesPresent` / `assertControlPresent`。テストは同じ名前の describe（`setValue`、`adding/removing` など）に `it` を足します。
- 5 節の注記（`insert` などが `_onCollectionChange` を呼ばない）は、この章では「そう書いてある」までしか確かめていません。ディレクティブ側の影響を第 12 回で読んでから、同じ話の issue があるかを探すのが順番です（[第 20 回](20-forms-issues.md)）。

## 聞かれそうな質問

**Q. disabled の子は value から消えるのに、getRawValue には残るのはなぜですか？**

`value` は「いま有効な入力」、`getRawValue` は「全部の子の値」と役目が分かれているからです。`_reduceValue` の 637 行目は `control.enabled || this.disabled` のときだけ入れ、`getRawValue` の 584〜585 行目は条件なしで全部の子を集めます。状態も同じ考え方で、disabled の子は 626 行目の `contains` で検証の数から外れます。送信には `value`、保存した値を全部取り出すには `getRawValue()` と使い分けます。

**Q. at(-1) は何を返しますか？**

最後の子です。169 行目の `at` は 511 行目の `_adjustIndex` で `-1 + length` にします。`-length` より小さいと負のままなので `undefined`（form\_array\_spec.ts 1512〜1515 行目）。`removeAt` だけは 237 行目で 0 に寄せるので、先頭が消えます。

**Q. FormRecord と FormGroup の違いは何ですか？**

実行時は同じです（742〜744 行目、`FormGroup` を継承するだけ）。違うのは型で、FormGroup は「キーごとに型が違う決まった形」、FormRecord は「どんなキーでも足せるが、子は全部同じ型」。あとからキーを足し外しする連想配列のような form には FormRecord を使うと、`addControl` の型エラーに悩まずに済みます。

**Q. addControl で同じ名前の control を渡したら置き換わりますか？**

置き換わりません。`addControl` が呼ぶ `registerControl` の 249〜250 行目で、同じ名前の子があれば既存の子を返して終わります。置き換えは `setControl`（370〜372 行目で古い子を外してから登録）です。

**Q. setValue と patchValue、どちらを使えばよいですか？**

サーバーから取ってきた「全部そろっているはずの値」を入れるなら `setValue`。足りないキーがあれば 288 行目のエラーで早く気づけます。一部だけ変えたいなら `patchValue`（492〜495 行目で、あるキーだけ）。

## 読み終えて

- 子を登録すると `setParent` と `_registerOnCollectionChange`。足し外しのたびに `_onCollectionChange()` でディレクティブに合図する（FormArray の `insert`・`removeAt`・`clear` は呼ばない）
- `value` は enabled な子だけで毎回作り直す（FormArray は詰める）。`getRawValue()` は全部
- `setValue` は「子の側」と「値の側」の 2 つの assert で全部そろっているかを確かめ、`patchValue` はあるキーだけを触る
- FormArray の `at` / `removeAt` / `setControl` は負の添字を `_adjustIndex` で直し、FormRecord は型だけが違う FormGroup

---

← 前: [events：状態の変化を 1 本の Observable で受ける](06-forms-control-events.md)  
次: [型付きフォームと FormBuilder](08-forms-typed-forms.md) →
