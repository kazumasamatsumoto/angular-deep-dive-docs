[目次](../README.md) › [Signal Forms の型を読む：FieldTree から SchemaPath まで、api/types.ts の 1000 行](README.md) › 第 2 回 / 全 6 回

# FieldState と ReadonlyFieldState：状態の読み口を型で並べる

> types.ts の ReadonlyFieldState と FieldState のメンバー（value・errors・disabledReasons・metadata・min/max などの読み口、markAsTouched・reset）、どれが Signal でどれが関数か、ReadonlyFieldTree から得たときに書き込みを消す仕組み。node.ts の実装とどう対応するか。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfty-state)

---

`f.name()` と呼ぶと返ってくる `FieldState` には、32 個のメンバーがあります。この章では、それを宣言している 2 つの interface（`ReadonlyFieldState` と、それを広げた `FieldState`）を 1 行ずつ読み、どれが `Signal` で、どれが「無いこともある `Signal`」で、どれがメソッドかを表に並べ、各メンバーが `field/node.ts` と `field/state.ts` のどの行で実装されているかを対応させます。最後に、ルールの関数が受け取る読み取り専用の状態から「書き込みが消える」のは型の上だけで、実物は同じ `FieldNode` であることを、本物で確かめます。

読む対象は `packages/forms/signals/src/api/types.ts` の 316〜629 行目、`field/node.ts`、`field/state.ts`、spec は `test/node/types.spec.ts` と `test/node/field_node.spec.ts` です。`FieldState` を呼んで得る道（`FieldTree` の呼ぶ側の型）は[前の章](01-sfty-tree.md)の 2 節、`value` と `controlValue` の役割の違い（debounce を挟む）は [signal-forms](../signals/17-signal-forms.md) の 7 節、`disabled`・`readonly`・`hidden`・`touched`・`dirty` を親と合わせる computed は [forms-sf-rules-metadata](../forms/18-forms-sf-rules-metadata.md) の 3 節、`min`・`max` などの metadata の読み口は同じ章の 6 節で読みました。ここではそれらを繰り返さず、型の並びと実装の対応に絞ります。

1. [1. FieldTree と Field](01-sfty-tree.md)
2. **2. FieldState の読み口**（この章）
3. [3. 検証の結果と binding の型](03-sfty-results.md)
4. [4. PathKind と SchemaPath](04-sfty-path.md)
5. [5. validateHttp と debounce](05-sfty-http-debounce.md)
6. [6. spec と issue](06-sfty-tests-issues.md)

## 1. 2 つの interface と、どちらを返すかを決める型

📄 `angular/packages/forms/signals/src/api/types.ts` L316–330 （▶ の行: 316, 325, 329）

```ts
316 ▶  * A readonly view of a {@link FieldTree}'s state.
317 │  *
318 │  * @template TValue The type of the data which the field is wrapped around.
319 │  * @template TKey The type of the property key which this field resides under in its parent.
320 │  *
321 │  *
322 │  * @category structure
323 │  * @publicApi 22.0
324 │  */
325 ▶ export interface ReadonlyFieldState<TValue, TKey extends string | number = string | number> {
326 │   /**
327 │    * The {@link FieldTree} associated with this field state.
328 │    */
329 ▶   readonly fieldTree: ReadonlyFieldTree<unknown, TKey>;
330 │ 
```

325 行目の `ReadonlyFieldState` が「読むだけの状態」で、329 行目の `fieldTree` も読み取り専用の木（`ReadonlyFieldTree`）です。この次の `value` と `controlValue` は `Signal<TValue>`（書けない signal）と宣言されています（[signal-forms](../signals/17-signal-forms.md) の 7 節の引用）。

📄 `angular/packages/forms/signals/src/api/types.ts` L516–554 （▶ の行: 516, 519, 523, 533, 542, 547, 554）

```ts
516 ▶ export interface FieldState<
517 │   TValue,
518 │   TKey extends string | number = string | number,
519 ▶ > extends ReadonlyFieldState<TValue, TKey> {
520 │   /**
521 │    * The {@link FieldTree} associated with this field state.
522 │    */
523 ▶   readonly fieldTree: FieldTree<unknown, TKey>;
524 │ 
525 │   /**
526 │    * A writable signal containing the value for this field.
527 │    *
528 │    * Updating this signal will update the data model that the field is bound to.
529 │    *
530 │    * While updates from the UI control are eventually reflected here, they may be delayed if
531 │    * debounced.
532 │    */
533 ▶   readonly value: WritableSignal<TValue>;
534 │ 
535 │   /**
536 │    * A signal containing the value of the control to which this field is bound.
537 │    *
538 │    * This differs from {@link value} in that it's not subject to debouncing, and thus is used to
539 │    * buffer debounced updates from the control to the field. This will also not take into account
540 │    * the {@link controlValue} of children.
541 │    */
542 ▶   readonly controlValue: WritableSignal<TValue>;
543 │ 
544 │   /**
545 │    * Sets the dirty status of the field to `true`.
546 │    */
547 ▶   markAsDirty(): void;
548 │ 
549 │   /**
550 │    * Sets the touched status of the field and its descendants to `true`.
551 │    *
552 │    * @param options Options for marking the field as touched.
553 │    */
554 ▶   markAsTouched(options?: MarkAsTouchedOptions): void;
```

516〜519 行目、`FieldState` は `ReadonlyFieldState` を `extends` し、523・533・542 行目で 3 つの欄を**書ける型で宣言し直し**ます。`WritableSignal<T>` は `Signal<T>` に `set`・`update`・`asReadonly` を足した型なので、継承した interface で狭い型（部分型）に替えることが許されます。そのうえで 547 行目からメソッドを足します（3 節）。

📄 `angular/packages/forms/signals/src/api/types.ts` L617–629 （▶ の行: 625, 628–629）

```ts
617 │ /**
618 │  * Helper type that resolves to either a {@link FieldState} or {@link ReadonlyFieldState} based on
619 │  * the access mode.
620 │  *
621 │  * @template TValue The type of the value stored in the field.
622 │  * @template TKey The type of the property key.
623 │  * @template TMode The access mode ('readonly' or 'writable').
624 │  */
625 ▶ export type FieldStateByMode<
626 │   TValue,
627 │   TKey extends string | number,
628 ▶   TMode extends 'writable' | 'readonly',
629 ▶ > = TMode extends 'writable' ? FieldState<TValue, TKey> : ReadonlyFieldState<TValue, TKey>;
```

629 行目の `FieldStateByMode` が、`TMode` が `'writable'` なら `FieldState`、そうでなければ `ReadonlyFieldState` を選びます。[前の章](01-sfty-tree.md)の 2 節で読んだ `FieldTree` の呼ぶ側の型がこれを使うので、`form()` が返す木（`TMode` の既定は `'writable'`）を呼ぶと `FieldState`、`ReadonlyFieldTree`（ルールの `ctx.fieldTree`、エラーの `fieldTree`、`DisabledReason.fieldTree`）を呼ぶと `ReadonlyFieldState` が返ります。

この 2 つに分けたのは a1a6c5282ed（2026-02-19）です。それまでは `FieldState` 1 つで、ルールの関数の中からも `value.set` が書けました。

📄 `a1a6c5282ed の差分`

```
$ git show a1a6c5282ed -- packages/forms/signals/src/api/types.ts（抜粋。JSDoc は省いた）
# refactor(forms): restrict reactive logic to a readonly API（2026-02-19）
-export interface FieldState<TValue, TKey extends string | number = string | number> {
+export interface ReadonlyFieldState<TValue, TKey extends string | number = string | number> {
   /**
    * The {@link FieldTree} associated with this field state.
    */
-  readonly fieldTree: FieldTree<unknown, TKey>;
+  readonly fieldTree: ReadonlyFieldTree<unknown, TKey>;
 ...
-  readonly value: WritableSignal<TValue>;
+  readonly value: Signal<TValue>;
 ...
+export interface FieldState<
+  TValue,
+  TKey extends string | number = string | number,
+> extends ReadonlyFieldState<TValue, TKey> {
+  readonly fieldTree: FieldTree<unknown, TKey>;
+  readonly value: WritableSignal<TValue>;
+  readonly controlValue: WritableSignal<TValue>;
+  markAsDirty(): void;
+  markAsTouched(): void;
+  reset(value?: TValue): void;
+}
（同じコミットで FieldTree に TMode、FieldStateByMode・ReadonlyFieldTree を足し、DisabledReason・ValidationError の
 fieldTree を ReadonlyFieldTree に、FieldContext の state・stateOf を ReadonlyFieldState に替えた。
 getError と reloadValidation は、その後のコミットで FieldState の側に足された）
```

## 2. ReadonlyFieldState のメンバーを並べる

📄 `angular/packages/forms/signals/src/api/types.ts` L349–386 （▶ の行: 353, 360, 367, 374, 381, 386）

```ts
349 │ 
350 │   /**
351 │    * A signal indicating whether the field is currently disabled.
352 │    */
353 ▶   readonly disabled: Signal<boolean>;
354 │ 
355 │   /**
356 │    * A signal indicating the field's maximum value, if applicable.
357 │    *
358 │    * Applies to `<input>` with a numeric or date `type` attribute and custom controls.
359 │    */
360 ▶   readonly max: Signal<NonNullable<TValue> | undefined> | undefined;
361 │ 
362 │   /**
363 │    * A signal indicating the field's maximum string length, if applicable.
364 │    *
365 │    * Applies to `<input>`, `<textarea>`, and custom controls.
366 │    */
367 ▶   readonly maxLength: Signal<number | undefined> | undefined;
368 │ 
369 │   /**
370 │    * A signal indicating the field's minimum value, if applicable.
371 │    *
372 │    * Applies to `<input>` with a numeric or date `type` attribute and custom controls.
373 │    */
374 ▶   readonly min: Signal<NonNullable<TValue> | undefined> | undefined;
375 │ 
376 │   /**
377 │    * A signal indicating the field's minimum string length, if applicable.
378 │    *
379 │    * Applies to `<input>`, `<textarea>`, and custom controls.
380 │    */
381 ▶   readonly minLength: Signal<number | undefined> | undefined;
382 │ 
383 │   /**
384 │    * A signal of a unique name for the field, by default based on the name of its parent field.
385 │    */
386 ▶   readonly name: Signal<string>;
```

📄 `angular/packages/forms/signals/src/api/types.ts` L387–426 （▶ の行: 391, 396, 401, 406, 411, 416, 418, 425–426）

````ts
387 │ 
388 │   /**
389 │    * A signal indicating the patterns the field must match.
390 │    */
391 ▶   readonly pattern: Signal<readonly RegExp[]>;
392 │ 
393 │   /**
394 │    * A signal indicating whether the field is currently readonly.
395 │    */
396 ▶   readonly readonly: Signal<boolean>;
397 │ 
398 │   /**
399 │    * A signal indicating whether the field is required.
400 │    */
401 ▶   readonly required: Signal<boolean>;
402 │ 
403 │   /**
404 │    * A signal indicating whether the field has been touched by the user.
405 │    */
406 ▶   readonly touched: Signal<boolean>;
407 │ 
408 │   /**
409 │    * A signal indicating whether field value has been changed by user.
410 │    */
411 ▶   readonly dirty: Signal<boolean>;
412 │ 
413 │   /**
414 │    * A signal indicating whether a field is hidden.
415 │    *
416 ▶    * When a field is hidden it is ignored when determining the valid, touched, and dirty states.
417 │    *
418 ▶    * Note: This doesn't hide the field in the template, that must be done manually.
419 │    * ```
420 │    * @if (!field.hidden()) {
421 │    *   ...
422 │    * }
423 │    * ```
424 │    */
425 ▶   readonly hidden: Signal<boolean>;
426 ▶   readonly disabledReasons: Signal<readonly DisabledReason[]>;
````

📄 `angular/packages/forms/signals/src/api/types.ts` L428–467 （▶ の行: 431, 436, 441, 449, 462, 467）

```ts
428 │   /**
429 │    * A signal containing the {@link errors} of the field itself, excluding its descendants.
430 │    */
431 ▶   readonly errors: Signal<ValidationError.WithFieldTree[]>;
432 │ 
433 │   /**
434 │    * A signal containing the {@link errors} of the field and its descendants.
435 │    */
436 ▶   readonly errorSummary: Signal<ValidationError.WithFieldTree[]>;
437 │ 
438 │   /**
439 │    * A signal indicating whether the field's value is currently valid.
440 │    *
441 ▶    * Note: `valid()` is not the same as `!invalid()`.
442 │    * - `valid()` is `true` when there are no validation errors *and* no pending validators.
443 │    * - `invalid()` is `true` when there are validation errors, regardless of pending validators.
444 │    *
445 │    * Ex: consider the situation where a field has 3 validators, 2 of which have no errors and 1 of
446 │    * which is still pending. In this case `valid()` is `false` because of the pending validator.
447 │    * However `invalid()` is also `false` because there are no errors.
448 │    */
449 ▶   readonly valid: Signal<boolean>;
450 │ 
451 │   /**
452 │    * A signal indicating whether the field's value is currently invalid.
453 │    *
454 │    * Note: `invalid()` is not the same as `!valid()`.
455 │    * - `invalid()` is `true` when there are validation errors, regardless of pending validators.
456 │    * - `valid()` is `true` when there are no validation errors *and* no pending validators.
457 │    *
458 │    * Ex: consider the situation where a field has 3 validators, 2 of which have no errors and 1 of
459 │    * which is still pending. In this case `invalid()` is `false` because there are no errors.
460 │    * However `valid()` is also `false` because of the pending validator.
461 │    */
462 ▶   readonly invalid: Signal<boolean>;
463 │ 
464 │   /**
465 │    * Whether there are any validators still pending for this field.
466 │    */
467 ▶   readonly pending: Signal<boolean>;
```

📄 `angular/packages/forms/signals/src/api/types.ts` L468–503 （▶ の行: 472, 478, 483, 489, 495, 502）

```ts
468 │ 
469 │   /**
470 │    * A signal indicating whether the field is currently in the process of being submitted.
471 │    */
472 ▶   readonly submitting: Signal<boolean>;
473 │ 
474 │   /**
475 │    * The property key in the parent field under which this field is stored. If the parent field is
476 │    * array-valued, for example, this is the index of this field in that array.
477 │    */
478 ▶   readonly keyInParent: Signal<TKey>;
479 │ 
480 │   /**
481 │    * The {@link FormField} directives that bind this field to a UI control.
482 │    */
483 ▶   readonly formFieldBindings: Signal<readonly FormFieldBinding[]>;
484 │ 
485 │   /**
486 │    * Reads a metadata value from the field.
487 │    * @param key The metadata key to read.
488 │    */
489 ▶   metadata<M>(key: MetadataKey<M, any, any>): M | undefined;
490 │ 
491 │   /**
492 │    * Checks whether a metadata value exists on the field.
493 │    * @param key The metadata key to check.
494 │    */
495 ▶   hasMetadata(key: MetadataKey<any, any, any>): boolean;
496 │ 
497 │   /**
498 │    * Focuses the first UI control in the DOM that is bound to this field state.
499 │    * If no UI control is bound, does nothing.
500 │    * @param options Optional focus options to pass to the native focus() method.
501 │    */
502 ▶   focusBoundControl(options?: FocusOptions): void;
503 │ }
```

3 つの形に分けると、こうなります。「実装」の列は `FieldNode`（`field/node.ts`）の getter・メソッドの行と、その先の部品です（4 節）。

| 形 | メンバー（types.ts の行） | 実装（node.ts の行 → 先） |
| --- | --- | --- |
| `Signal`（19 個） | `disabled` 353・`readonly` 396・`touched` 406・`dirty` 411・`hidden` 425・`disabledReasons` 426・`name` 386 | 203・215・199・195・211・207・227 → `nodeState`（state.ts の `FieldNodeState`） |
| `errors` 431・`errorSummary` 436・`valid` 449・`invalid` 462・`pending` 467 | 191 ほか → `validationState`（validation.ts。[forms-sf-validation](../forms/17-forms-sf-validation.md)） |   |
| `submitting` 472 | 223 → `submitState`（submit.ts） |   |
| `keyInParent` 478 | `structure.keyInParent`（[sft-array-identity](../sft/02-sft-array-identity.md) の 3 節） |   |
| `formFieldBindings` 483 | 219 → `nodeState.formFieldBindings`（state.ts 67、**実行時は書ける signal**） |   |
| `pattern` 391・`required` 401・（`value`・`controlValue`） | metadata（forms-sf-rules-metadata の 6 節）・`structure.value`・`controlValue`（signal-forms の 7 節） |   |
| `Signal \| undefined`（4 個） | `max` 360・`maxLength` 367・`min` 374・`minLength` 381 | metadata が無ければ getter が `undefined` を返す（forms-sf-rules-metadata の 6 節） |
| そのほか | `fieldTree` 329（関数の形の `FieldTree`）・`metadata` 489・`hasMetadata` 495・`focusBoundControl` 502 | 155・メソッド → `metadataState`・[次の章](03-sfty-results.md) |

- **360〜381 行目の `| undefined`**：「`Signal` そのものが無いことがある」という意味で、`s.max()` は TS2722 になり、`s.max?.()` と書きます（記録の S6・S7）。もとは `max?:` の省略可能な欄でしたが、ee8d2098cb3（2026-03-23、Fixes #67246）で「欄は必ずあり、値が `undefined` のことがある」形に替えました。TypeScript の `exactOptionalPropertyTypes` を有効にしたアプリで、`FieldNode` の getter（`Signal | undefined` を返す）が省略可能な欄の型と合わず、TS2420「incorrectly implements interface」になっていたためです。
- **360・374 行目の `NonNullable<TValue>`**：`min`・`max` の値の型はフィールドの値の型に揃います（日付なら `Date`）。中身は 276c917b349 の日付の制約で、[sfv-dates](../sfv/03-sfv-dates.md) の章です。
- **426 行目の `disabledReasons`**：前後のメンバーと違い、JSDoc がありません。API の文書に説明が出ない 1 行です。中身の `DisabledReason` は[次の章](03-sfty-results.md)で読みます。
- **441〜447・454〜460 行目**：`valid()` は `!invalid()` と同じではありません。保留中（`pending`）の非同期の検証があると両方とも `false` です（[forms-sf-validation](../forms/17-forms-sf-validation.md) の 5 節）。
- **416〜423 行目**：`hidden()` は画面から消しません。`@if` で自分で隠します。

## 3. FieldState が足すもの：5 つのメソッド

📄 `angular/packages/forms/signals/src/api/types.ts` L555–582 （▶ の行: 565–568, 577, 581）

```ts
555 │ 
556 │   /**
557 │    * Gets the first validation error of the given kind on this field.
558 │    *
559 │    * This method is reactive and will re-evaluate when the field's errors change if called
560 │    * within a reactive context (e.g. `computed` or `effect`).
561 │    *
562 │    * @param kind The kind of error (e.g. 'required', 'min').
563 │    * @returns The first matching error, or `undefined` if none.
564 │    */
565 ▶   getError<K extends NgValidationError['kind']>(
566 ▶     kind: K,
567 ▶   ): (Extract<NgValidationError, {kind: K}> & ValidationError.WithFieldTree) | undefined;
568 ▶   getError(kind: string): ValidationError.WithFieldTree | undefined;
569 │ 
570 │   /**
571 │    * Resets the {@link touched} and {@link dirty} state of the field and its descendants.
572 │    *
573 │    * Note this does not change the data model, which can be reset directly if desired.
574 │    *
575 │    * @param value Optional value to set to the form. If not passed, the value will not be changed.
576 │    */
577 ▶   reset(value?: TValue): void;
578 │   /**
579 │    * Reloads all asynchronous validators for this field and its descendants.
580 │    */
581 ▶   reloadValidation(): void;
582 │ }
```

1. **547 行目 `markAsDirty()`・554 行目 `markAsTouched(options?)`**

   touched と dirty を立てる 2 つです。`markAsTouched` は子孫も touched にし、`MarkAsTouchedOptions` の `skipDescendants` で自分だけにできます（eeba51c50b7、2026-03。[次の章](03-sfty-results.md)の 1 節）。逆の `markAsPristine`・`markAsUntouched` は `FieldNode` にはありますが、公開の型にはありません（4 節）。
2. **565〜568 行目 `getError(kind)`**

   同じ名前の宣言が 2 つ並ぶのは**多重定義**（overload：引数の型で戻り値の型を変える書き方）です。`kind` が組み込みのエラーの名前（`NgValidationError['kind']`）なら 567 行目でそのエラーの型に絞り込み、`getError('minLength')?.minLength` が `number` になります（S11）。それ以外の文字列は 568 行目の一般の型です（S12）。
3. **577 行目 `reset(value?)`**

   touched と dirty を戻し、値を渡せばその値にします。値を渡さなければモデルは変わりません（575 行目）。中身は [sfd-custom-control](../sfd/04-sfd-custom-control.md) で読んだ `_reset` です。
4. **581 行目 `reloadValidation()`**

   非同期の検証をやり直させます（74f76d8075d、2026-02-27、Fixes #66994）。4 節の node.ts 359〜376 行目です。

> [!WARNING]
> **ハマりどころ**
>
> `getError` は状態を**読むだけ**のメソッドですが、`FieldState` の側（565 行目）にあり、`ReadonlyFieldState` にはありません。ルールの関数の `ctx.state.getError('required')` は TS2339 です（S17）。実行時の `ctx.state` は同じ `FieldNode` なのでメソッドはあります（5 節）。709f5a390ca（2026-03-23「add FieldState.getError()」、Fixes #63905）が、1 節の分割（a1a6c5282ed、2026-02-19）の後に `FieldState` へ足したためです。gh で探した範囲では、これを扱う issue と PR は見つかりませんでした。

## 4. 実装：FieldNode の getter は部品に回すだけ

`FieldNode` は `implements FieldState<unknown>` と宣言されたクラスで、constructor で部品（`structure`・`validationState`・`nodeState`・`metadataState`・`submitState`）を作ります（[signal-forms](../signals/17-signal-forms.md) の 3 節）。`FieldState` のメンバーは、ほとんどが「部品の signal を返す getter」です。

📄 `angular/packages/forms/signals/src/field/node.ts` L140–162 （▶ の行: 147, 155–157, 159–160）

```ts
140 │   /**
141 │    * The `AbortController` for the currently debounced sync, or `undefined` if there is none.
142 │    *
143 │    * This is used to cancel a pending debounced sync when {@link setControlValue} is called again
144 │    * before the pending debounced sync resolves. It will also cancel any pending debounced sync
145 │    * automatically when recomputed due to `value` being set directly from others sources.
146 │    */
147 ▶   private readonly pendingSync: WritableSignal<AbortController | undefined> = linkedSignal({
148 │     source: () => this.value(),
149 │     computation: (_source, previous) => {
150 │       previous?.value?.abort();
151 │       return undefined;
152 │     },
153 │   });
154 │ 
155 ▶   get fieldTree(): FieldTree<unknown> {
156 ▶     return this.fieldProxy;
157 ▶   }
158 │ 
159 ▶   get logicNode(): LogicNode {
160 ▶     return this.structure.logic;
161 │   }
162 │ 
```

155〜157 行目の `fieldTree` は、constructor で作った Proxy（`fieldProxy`）を返します。だから `f.name().fieldTree === f.name` です（テストと直し方の field\_node.spec.ts 216〜234 行目）。型は `FieldTree<unknown>` で、`FieldState` は自分がどんな値の木から来たかを型で知りません。b772f518f1e（2026-02-06「add fieldTree property to FieldState」）のメッセージにも、`x().fieldTree` は `FieldTree<unknown>` になり型の情報を失う、と書かれています。子の型が `object` になるので、`f().fieldTree.title` は TS2339、`f().fieldTree.name` は `Function` の `name` として `string` と型が付きます（S16・S10。前の章の 5 節）。147 行目の `pendingSync` は debounce の途中の同期を持つ欄で、[第 5 回](05-sfty-http-debounce.md)の主題です。

📄 `angular/packages/forms/signals/src/field/node.ts` L190–229 （▶ の行: 191–192, 195–196, 199–200, 203–204, 207–208, 211, 215, 219–220, 223–224, 227–228）

```ts
190 │ 
191 ▶   get invalid(): Signal<boolean> {
192 ▶     return this.validationState.invalid;
193 │   }
194 │ 
195 ▶   get dirty(): Signal<boolean> {
196 ▶     return this.nodeState.dirty;
197 │   }
198 │ 
199 ▶   get touched(): Signal<boolean> {
200 ▶     return this.nodeState.touched;
201 │   }
202 │ 
203 ▶   get disabled(): Signal<boolean> {
204 ▶     return this.nodeState.disabled;
205 │   }
206 │ 
207 ▶   get disabledReasons(): Signal<readonly DisabledReason[]> {
208 ▶     return this.nodeState.disabledReasons;
209 │   }
210 │ 
211 ▶   get hidden(): Signal<boolean> {
212 │     return this.nodeState.hidden;
213 │   }
214 │ 
215 ▶   get readonly(): Signal<boolean> {
216 │     return this.nodeState.readonly;
217 │   }
218 │ 
219 ▶   get formFieldBindings(): Signal<readonly FormField<unknown>[]> {
220 ▶     return this.nodeState.formFieldBindings;
221 │   }
222 │ 
223 ▶   get submitting(): Signal<boolean> {
224 ▶     return this.submitState.submitting;
225 │   }
226 │ 
227 ▶   get name(): Signal<string> {
228 ▶     return this.nodeState.name;
229 │   }
```

191〜229 行目は、1 つの getter が 1 つの部品の欄を返すだけです。`invalid` は `validationState`（192 行目）、`dirty`・`touched`・`disabled`・`disabledReasons`・`hidden`・`readonly`・`formFieldBindings`・`name` は `nodeState`、`submitting` は 224 行目の `submitState` です。getter なので、`f.name().touched` を読むたびに同じ signal が返り、`Object.keys(f.name())` には出てきません（DEMO の「実行時」の列は、prototype の getter を通して読んだもの）。

📄 `angular/packages/forms/signals/src/field/state.ts` L17–43 （▶ の行: 21, 28, 36, 41–42）

```ts
17 │ /**
18 │  * The non-validation and non-submit state associated with a `FieldNode`, such as touched and dirty
19 │  * status, as well as derived logical state.
20 │  */
21 ▶ export class FieldNodeState {
22 │   /**
23 │    * Indicates whether this field has been touched directly by the user (as opposed to indirectly by
24 │    * touching a child field).
25 │    *
26 │    * A field is considered directly touched when a user stops editing it for the first time (i.e. on blur)
27 │    */
28 ▶   private readonly selfTouched = signal(false);
29 │ 
30 │   /**
31 │    * Indicates whether this field has been dirtied directly by the user (as opposed to indirectly by
32 │    * dirtying a child field).
33 │    *
34 │    * A field is considered directly dirtied if a user changed the value of the field at least once.
35 │    */
36 ▶   private readonly selfDirty = signal(false);
37 │ 
38 │   /**
39 │    * Marks this specific field as touched.
40 │    */
41 ▶   markAsTouched(): void {
42 ▶     this.selfTouched.set(true);
43 │   }
```

📄 `angular/packages/forms/signals/src/field/state.ts` L44–69 （▶ の行: 48–49, 55–56, 62–63, 67）

```ts
44 │ 
45 │   /**
46 │    * Marks this specific field as dirty.
47 │    */
48 ▶   markAsDirty(): void {
49 ▶     this.selfDirty.set(true);
50 │   }
51 │ 
52 │   /**
53 │    * Marks this specific field as not dirty.
54 │    */
55 ▶   markAsPristine(): void {
56 ▶     this.selfDirty.set(false);
57 │   }
58 │ 
59 │   /**
60 │    * Marks this specific field as not touched.
61 │    */
62 ▶   markAsUntouched(): void {
63 ▶     this.selfTouched.set(false);
64 │   }
65 │ 
66 │   /** The {@link FormField} directives that bind this field to a UI control. */
67 ▶   readonly formFieldBindings = signal<readonly FormField<unknown>[]>([]);
68 │ 
69 │   constructor(private readonly node: FieldNode) {}
```

`FieldNodeState` の土台は、28 行目の `selfTouched` と 36 行目の `selfDirty` の 2 つの書ける signal です。「self」は「このフィールド自身が」で、子のどれかが touched なら親も touched、という集計は、これを元にした computed（forms-sf-rules-metadata の 3 節）がします。41〜64 行目の 4 つのメソッドは、この 2 つを `true` か `false` にするだけです。67 行目の `formFieldBindings` は `signal(...)` で作った**書ける** signal で、`[formField]` が自分を登録するときに更新します。公開の型（483 行目）は `Signal<readonly FormFieldBinding[]>` なので、利用者のコードからは `set` が見えません（S19）。

📄 `angular/packages/forms/signals/src/field/node.ts` L298–320 （▶ の行: 302–303, 309–310, 316–317）

```ts
298 │ 
299 │   /**
300 │    * Marks this specific field as dirty.
301 │    */
302 ▶   markAsDirty(): void {
303 ▶     this.nodeState.markAsDirty();
304 │   }
305 │ 
306 │   /**
307 │    * Marks this specific field as pristine.
308 │    */
309 ▶   markAsPristine(): void {
310 ▶     this.nodeState.markAsPristine();
311 │   }
312 │ 
313 │   /**
314 │    * Marks this specific field as untouched.
315 │    */
316 ▶   markAsUntouched(): void {
317 ▶     this.nodeState.markAsUntouched();
318 │   }
319 │ 
320 │   /**
```

`FieldNode` の `markAsDirty`（302〜304 行目）は `nodeState.markAsDirty()` を呼ぶだけで、子孫には広げません。`markAsTouched` が子孫に広げるのとは逆です。309〜311 行目の `markAsPristine` と 316〜318 行目の `markAsUntouched` は public なメソッドですが、`FieldState` の型には無いので、利用者のコードからは呼べません。`reset()` の中（`_reset`）から使われます。

📄 `angular/packages/forms/signals/src/field/state.ts` L153–162 （▶ の行: 154, 156–157, 160）

```ts
153 │ 
154 ▶   readonly name: Signal<string> = computed(() => {
155 │     const parent = this.node.structure.parent;
156 ▶     if (!parent) {
157 ▶       return this.node.structure.fieldManager.rootName;
158 │     }
159 │ 
160 ▶     return `${parent.name()}.${this.node.structure.keyInParent()}`;
161 │   });
162 │ 
```

386 行目の `name` の中身です。根は 157 行目で `form()` の `name` の設定（無ければ `ng.form0` のような自動の名前）、子は 160 行目で「親の名前 + `.` + 自分のキー」です。`[formField]` がこれを入力欄の `name` 属性に書きます（DEMO では `sftys.name`）。

📄 `angular/packages/forms/signals/src/field/node.ts` L355–376 （▶ の行: 359–360, 364, 366, 369, 373）

```ts
355 │ 
356 │   /**
357 │    * Reloads all asynchronous validators for this field and its descendants.
358 │    */
359 ▶   reloadValidation(): void {
360 ▶     untracked(() => this._reloadValidation());
361 │   }
362 │ 
363 │   private _reloadValidation(): void {
364 ▶     const keys = this.logicNode.logic.getMetadataKeys();
365 │     for (const key of keys) {
366 ▶       if (key[IS_ASYNC_VALIDATION_RESOURCE]) {
367 │         const resource = this.metadata(key)! as Resource<unknown> &
368 │           Partial<Pick<WritableResource<unknown>, 'reload'>>;
369 ▶         resource.reload?.();
370 │       }
371 │     }
372 │ 
373 ▶     for (const child of this.structure.children()) {
374 │       child._reloadValidation();
375 │     }
376 │   }
```

581 行目の `reloadValidation` は 360 行目で `untracked` の中に入り、364 行目でこのフィールドのロジックにある metadata のキーを全部見て、366 行目で「非同期の検証の resource」の印が付いたキーだけを 369 行目で `reload` します。373 行目で子にも同じことをします。`children()` なので、まだ作られていない子も作ります（[sft-structure](../sft/01-sft-structure.md) の 6 節）。

## 5. 読み取り専用は型の上だけ：実物は同じ FieldNode

1 節の 2 つの interface は、実行時には 1 つのクラス `FieldNode` です。Node で本物を覗いた記録です。

📄 `記録（Node、22.2.6、抜粋）`

```
$ node state.mjs     # @angular/forms 22.2.6 / node v24.22.1、form(signal({name: 'Ada'}), …) の f.name()
fieldTree          getter     function
value              getter     WritableSignal
controlValue       own field  WritableSignal
max                getter     undefined         # max・maxLength・min は metadata が無いので undefined
minLength          getter     Signal            # minLength(p.name, 2) を付けた
formFieldBindings  getter     WritableSignal    # 型は Signal<readonly FormFieldBinding[]>
metadata ・ markAsTouched ・ getError ・ reset …  method     function
FieldNode.prototype だけにあるもの: context, getBindingForFocus, logicNode, parseErrors, markAsTouchedInternal,
  markAsPristine, markAsUntouched, _reset, _reloadValidation, controlValueSignal, sync, flushSync,
  debounceSync, createStructure, newChild
ctx.state === f.name(): true / ctx.fieldTree === f.name: true / ctx.value === f.name().value: true
'set' in ctx.state.value: true / typeof ctx.state.markAsTouched: function
f().name(): ng.form0 / f.name().name(): ng.form0.name
```

1. **ルールが受け取る ctx.state は、f.name() そのもの**

   `validate` の関数で取っておいた `ctx.state`（型は `ReadonlyFieldState`）は `f.name()` と `===` で、`value` には `set` があり、`markAsTouched` もあります。読み取り専用は「型で書けなくする」だけで、別の読み取り専用のオブジェクトを作ってはいません。
2. **型に無いものも持っている**

   `FieldNode.prototype` には `parseErrors`・`markAsPristine`・`markAsUntouched`・`context` など 15 個の、`FieldState` の型に無いメンバーがあります。`Object.keys(f.name())` は `structure`・`validationState` など constructor で入れた 11 個の欄です。
3. **型が書けないと言っている所**

   `ReadonlyFieldState` の `value.set`（S1）・`markAsTouched`（S2）・`reset`（S3）は TS2339、`ReadonlyFieldState` を `FieldState` に入れると、足りない 5 つのメソッドの名前が並ぶ TS2739 です（S5）。逆向き（S4）は通ります。

## 6. DEMO：1 つのフィールドの FieldState を表にする

> **🧪 DEMO — f.name() の 32 のメンバー（@angular/forms 22.2.6）**
>
> モデルは `{name: 'Ada'}`、ルールは `required`・`minLength(3)`・ロック中だけ理由つきで `disabled`・`ctx.state` を取っておくだけの `validate`。入力欄は `[formField]="f.name"` で結んであり、打つと `controlValue` から `value` へ同期されます。ボタンを押すと「今の値」の列が読み直されます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sfty-state)

- **最初**：`formFieldBindings` は入力欄の 1 個、`name` は `sftys.name`、`max`・`maxLength`・`min` は「実行時」も「今の値」も `undefined`（metadata が無い）、`minLength` は Signal で 3 です。下の一覧で `ctx.state === f.name()` が `true`、`'set' in ctx.state.value` も `true` です。
- **1（value.set('Al')）**：`errors` が `["minLength"]` になり、`getError('minLength')?.minLength` が 3 です。`dirty` は変わりません（`value` に直接書いても dirty にはならない。dirty にするのは `controlValue` の側）。
- **2（controlValue.set）・入力欄に打つ**：`dirty` が `true` になり、`value` とモデルが同じ値になります（node.ts の `controlValueSignal`、signal-forms の 7 節）。
- **3・4**：`touched`・`dirty` がそれぞれ `true` に。**5**（`reset()`）で両方 `false` に戻り、値はそのまま。**6**（`reset('Grace')`）は値も替えます。
- **7**：`disabled` が `true`、`disabledReasons` が `["ロック中"]`、検証を飛ばすので `errors` が空になり、`touched`・`dirty` も `false` に見えます（「self」の印は残っていて、ロックを外すと戻る。forms-sf-rules-metadata の 4 節）。**8** は入力欄にフォーカスが移ります。

### tsc の記録

次のファイルの頭に 1 行ずつ足して `tsc --strict` にかけました（TypeScript 6.0.3、型は 22.2.6 の `.d.ts`）。S20 の `det` は `FieldState<{total: number; toppings: string}>` と宣言したものです。

📄 `state.ts（記録用、1〜6 行目）`

```
import {type FieldState, type FieldTree, type ReadonlyFieldState} from '@angular/forms/signals';

declare const s: FieldState<string>;
declare const rs: ReadonlyFieldState<string>;
declare const n: FieldState<number>;
declare const f: FieldTree<{name: string}>;
```

| 記号 | 行 | 書いたもの | 確かめたいこと | tsc の結果 |
| --- | --- | --- | --- | --- |
| S1 | 8 | `rs.value.set('x');` | ReadonlyFieldState の value に書く | TS2339 Property 'set' does not exist on type 'Signal&lt;string&gt;'. |
| S2 | 9 | `rs.markAsTouched();` | ReadonlyFieldState の markAsTouched | TS2339 Property 'markAsTouched' does not exist on type 'ReadonlyFieldState&lt;string, string \| number&gt;'. |
| S3 | 10 | `rs.reset();` | ReadonlyFieldState の reset | TS2339 Property 'reset' does not exist on type 'ReadonlyFieldState&lt;string, string \| number&gt;'. |
| S4 | 11 | `const a: ReadonlyFieldState<string> = s;` | FieldState を ReadonlyFieldState に | 通る |
| S5 | 12 | `const b: FieldState<string> = rs;` | ReadonlyFieldState を FieldState に | TS2739 Type 'ReadonlyFieldState&lt;string, string \| number&gt;' is missing the following properties from type 'FieldState&lt;string, string \| number&gt;': markAsDirty, markAsTouched, getError, reset, reloadValidation |
| S6 | 13 | `s.max();` | max をそのまま呼ぶ | TS2722 Cannot invoke an object which is possibly 'undefined'. |
| S7 | 14 | `const m: string \| undefined = s.max?.();` | max?.() の型 | 通る |
| S8 | 15 | `const nm: number \| undefined = n.min?.();` | number の min | 通る |
| S9 | 16 | `s.controlValue.set('typed');` | controlValue に書く | 通る |
| S10 | 17 | `const s10: string = f().fieldTree.name;` | fieldTree の name（Function の name） | 通る |
| S16 | 18 | `f().fieldTree.title;` | fieldTree から子に下りる | TS2339 Property 'title' does not exist on type 'FieldTree&lt;unknown, string \| number, "writable"&gt;'. |
| S11 | 19 | `const e = s.getError('minLength');` | getError の型 | 通る |
| S12 | 21 | `const kind: string \| undefined = s.getError('custom')?.kind;` | 自作の kind | 通る |
| S13 | 22 | `const p: readonly RegExp[] = s.pattern();` | pattern は常に Signal | 通る |
| S14 | 23 | `s.metadata;` | metadata はメソッド | 通る |
| S15 | 24 | `const sub: boolean = s.submitting();` | submitting | 通る |
| S17 | 25 | `rs.getError('required');` | ReadonlyFieldState の getError | TS2339 Property 'getError' does not exist on type 'ReadonlyFieldState&lt;string, string \| number&gt;'. |
| S18 | 26 | `const fb: number = s.formFieldBindings().length;` | formFieldBindings の長さ | 通る |
| S19 | 27 | `s.formFieldBindings.set([]);` | formFieldBindings に書く | TS2339 Property 'set' does not exist on type 'Signal&lt;readonly FormFieldBinding\[\]&gt;'. |
| S20 | 29 | `det.value.set({total: 0});` | 書ける value に、キーの足りない値を入れる（types.spec.ts 158 行目と同じ値） | TS2345 Argument of type '{ total: number; }' is not assignable to parameter of type '{ total: number; toppings: string; }'. |

## ここまでの呼び出し（f.name().touched() を読む）

- 👤 `f.name()` — 利用者のコード — *型は FieldStateByMode → FieldState（types.ts 629）*
  - `FIELD_PROXY_HANDLER` の罠の無い呼び出し → target の `() => this` — field/proxy.ts — *FieldNode を返す*
  - `.touched` → `get touched()` — node.ts 199–201
    - `this.nodeState.touched` — field/state.ts — *selfTouched と子の touched を集める computed*
      - `selfTouched` — state.ts 28 — *markAsTouched（41 行目）が true にする*

## テストと直し方

この章の型を固めているのは `test/node/types.spec.ts` の 3 つの it と、`test/node/field_node.spec.ts` の `describe('fieldTree')`（216 行目）です。

📄 `angular/packages/forms/signals/test/node/types.spec.ts` L143–174 （▶ の行: 143, 146, 150, 153–158, 164, 168–169）

```ts
143 ▶     it('should allow assigning FieldState to ReadonlyFieldState', () => {
144 │       const pizzaOrder: WritableSignal<PizzaOrder> = null!;
145 │       const f = form(pizzaOrder);
146 ▶       const readonlyState: ReadonlyFieldState<PizzaOrder> = f();
147 │       readonlyState.value();
148 │     });
149 │ 
150 ▶     it('should prevent writing to field value through context in a validation rule', () => {
151 │       schema<PizzaOrder>((p) => {
152 │         validate(p.id, (ctx) => {
153 ▶           // @ts-expect-error
154 ▶           ctx.value.set('new value');
155 ▶           // @ts-expect-error
156 ▶           ctx.state.value.set('new value');
157 ▶           // @ts-expect-error
158 ▶           ctx.stateOf(p.details).value.set({total: 0});
159 │           return null;
160 │         });
161 │       });
162 │     });
163 │ 
164 ▶     it('should prevent writing to field value through context in a signal provider', () => {
165 │       provideSignalFormsConfig({
166 │         classes: {
167 │           'my-class': (binding) => {
168 ▶             // @ts-expect-error
169 ▶             binding.state().value.set('new value');
170 │             return true;
171 │           },
172 │         },
173 │       });
174 │     });
```

- `it('should allow assigning FieldState to ReadonlyFieldState')`（143 行目）：146 行目、書ける状態を読み取り専用の型に入れられること（S4 と同じ）。
- `it('should prevent writing to field value through context in a validation rule')`（150 行目）：153〜158 行目の 3 つの `@ts-expect-error`。ルールの中で `ctx.value`・`ctx.state.value`・`ctx.stateOf(…).value` に書けないこと。
- `it('should prevent writing to field value through context in a signal provider')`（164 行目）：168〜169 行目、`provideSignalFormsConfig` の関数が受け取る binding の `state()` にも書けないこと（`FormFieldBinding` は[次の章](03-sfty-results.md)）。

📄 `angular/packages/forms/signals/test/node/field_node.spec.ts` L216–234 （▶ の行: 220, 226, 232）

```ts
216 │   describe('fieldTree', () => {
217 │     it('should return the associated field tree from state produced by the root field tree', () => {
218 │       const f = form(signal(''), {injector: TestBed.inject(Injector)});
219 │ 
220 ▶       expect(f().fieldTree).toBe(f);
221 │     });
222 │ 
223 │     it('should return the associated field tree from state produced by a child field tree', () => {
224 │       const f = form(signal({a: 1, b: 2}), {injector: TestBed.inject(Injector)});
225 │ 
226 ▶       expect(f.a().fieldTree).toBe(f.a);
227 │     });
228 │ 
229 │     it('should return the associated field tree from state produced by an array item field tree', () => {
230 │       const f = form(signal([1, 2, 3]), {injector: TestBed.inject(Injector)});
231 │ 
232 ▶       expect(f[0]().fieldTree).toBe(f[0]);
233 │     });
234 │   });
```

220・226・232 行目、根・子・配列の要素のどれでも `f().fieldTree` が元の `FieldTree` と同じものであること（4 節の 155〜157 行目）。

📄 `走らせ方`

```
cd ~/angular-research/angular
pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all \
  --test_arg=--filter="FieldNode fieldTree|FieldNode touched|FieldNode resetting|infers built-in error types"
```

📄 `結果`

```
# 2026-11-19、手元の macOS で（8576f161ae4）
Ran 27 of 539 specs
27 specs, 0 failures     # fieldTree 3・touched 16・resetting 7・getError の型 1
//packages/forms/signals/test/node:test                                  PASSED in 0.8s
```

型を崩したときに spec が捕まえるかを、作業木で確かめました。

📄 `結果（作業木、bazel を直接）`

```
# 作業木（8576f161ae4）で 1 か所ずつ変えて //packages/forms/signals/test/node:test を走らせた（試した後で戻し、作業木も消した）

[W3] types.ts 339 行目の ReadonlyFieldState.value を WritableSignal<TValue> にする
packages/forms/signals/test/node/types.spec.ts:155:11 - error TS2578: Unused '@ts-expect-error' directive.
packages/forms/signals/test/node/types.spec.ts:168:13 - error TS2578: Unused '@ts-expect-error' directive.
ERROR: Build did NOT complete successfully      # 157 行目の印は落ちない（下の説明）

[W7a] types.spec.ts に「ctx.state.getError('required') が書ける」it を足すだけ
packages/forms/signals/test/node/types.spec.ts:167:21 - error TS2339: Property 'getError' does not exist on type 'ReadonlyFieldState<string, string | number>'.
packages/forms/signals/test/node/types.spec.ts:168:34 - error TS2339: Property 'getError' does not exist on type 'ReadonlyFieldState<{ total: number; toppings: string; }, string | number>'.
ERROR: Build did NOT complete successfully

[W7b] W7a に加えて、getError の 2 つの宣言を FieldState から ReadonlyFieldState（hasMetadata の後）へ移す
539 specs, 0 failures
//packages/forms/signals/test/node:test                                  PASSED
```

W3 で落ちたのは 155 行目と 168 行目の印だけで、157 行目（`ctx.stateOf(p.details).value.set({total: 0})`）の印は残りました。`{total: 0}` は `details` の型（`total` と `toppings`）に足りないので、`value` が書ける型でも 158 行目は別の理由で型エラーになり、`@ts-expect-error` が満たされてしまいます（S20 で同じ値を書ける `value` に入れると TS2345）。この印は「書けないこと」を確かめていません。確かめるなら 158 行目の値を `{total: 0, toppings: ''}` にします。

### 直すとしたら

- 3 節の `getError` は、types.ts の 565〜568 行目の 2 つの宣言を `ReadonlyFieldState` の側（495 行目の `hasMetadata` の後など）へ移す形です。`FieldState` は継承でそのまま持ちます。spec は `types.spec.ts` の `describe('types')` に、ルールの中で `ctx.state.getError` を読む it を足します（W7a で今は落ち、W7b で通る）。公開の API の golden（`goldens/public-api/forms/signals/index.api.md`）も変わります。

📄 `足した it（W7a・W7b）`

```
    it('should allow reading errors by kind through context in a validation rule', () => {
      schema<PizzaOrder>((p) => {
        validate(p.id, (ctx) => {
          ctx.state.getError('required');
          ctx.stateOf(p.details).getError('custom');
          return null;
        });
      });
    });
```

- types.spec.ts 158 行目の値を、`details` の型を満たすものにする（上の W3 の説明）。
- 2 節の 426 行目 `disabledReasons` に JSDoc を足す（文書だけで、型は変わらない）。

## 聞かれそうな質問

**Q. ルールの関数の中で `ctx.state.value.set(...)` が書けないのはなぜですか？**

`ctx.state` の型が `ReadonlyFieldState` で、`value` が `Signal<TValue>` と宣言されているからです（1 節）。`WritableSignal` に宣言し直しているのは `FieldState` の 533 行目だけです。実行時の `ctx.state` は `f.name()` と同じ `FieldNode` で、`set` も持っています（5 節の記録）。

**Q. `f.name().max()` がコンパイルエラーになるのはなぜですか？**

360 行目が `Signal<…> | undefined` で、max のルールが無いフィールドでは getter が `undefined` を返すからです。`max?.()` と書きます。省略可能な欄（`max?:`）だったものを ee8d2098cb3 がこの形に替えました（#67246）。

**Q. FieldState のメンバーで、Signal でないものはどれですか？**

`fieldTree`（関数の形の `FieldTree`）と、メソッドの `metadata`・`hasMetadata`・`focusBoundControl`（489・495・502 行目）、それに `FieldState` が足す `markAsDirty`・`markAsTouched`・`getError`・`reset`・`reloadValidation` の 5 つです。`max` など 4 つは「無いこともある Signal」です。

**Q. markAsDirty は子孫に広がりますか？**

広がりません。node.ts 302〜304 行目は `nodeState.markAsDirty()` を呼ぶだけで、state.ts 48〜50 行目が自分の `selfDirty` を `true` にします。親の `dirty()` は子の dirty を集める computed なので、子を dirty にすると親も dirty に見えます。`markAsTouched` は既定で子孫に広げます。

**Q. validator の中で getError を使いたいときは？**

型の上では `ReadonlyFieldState` に `getError` が無いので書けません（S17）。`ctx.state.errors()` から `find` で探すのが型の通る書き方です。`getError` の実装（node.ts）も `this.errors().find((e) => e.kind === kind)` です。

## 読み終えて

- `FieldState` は `ReadonlyFieldState` を広げ、`fieldTree`・`value`・`controlValue` を書ける型で宣言し直し、5 つのメソッドを足した interface。どちらを返すかは `FieldStateByMode` が `TMode` で決める
- 読み口は Signal が 19、「無いこともある Signal」が 4（`max`・`maxLength`・`min`・`minLength`）、メソッドが 3（`FieldState` で 8）
- `FieldNode` の getter は部品（`nodeState`・`validationState`・`submitState`・`metadataState`・`structure`）の signal を返すだけ。touched と dirty の土台は state.ts の `selfTouched`・`selfDirty`
- 読み取り専用は型の上だけ。`ctx.state` は `f.name()` と同じ `FieldNode` で、`formFieldBindings` も実行時は書ける signal
- 読むだけの `getError` が `ReadonlyFieldState` に無く、types.spec.ts 158 行目の印は別の理由で満たされている

---

← 前: [FieldTree と Field：呼べて、プロパティで下りられる木の型](01-sfty-tree.md)  
次: [検証の結果と binding の型：ValidationResult・DisabledReason・FormFieldBinding・CompatFieldState](03-sfty-results.md) →
