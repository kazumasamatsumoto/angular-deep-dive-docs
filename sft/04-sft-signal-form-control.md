[目次](../README.md) › [Signal Forms のフィールドの木：子を作り、配列を追い、古い木と橋をかける](README.md) › 第 4 回 / 全 5 回

# SignalFormControl と extract：リアクティブフォームの中の Signal Forms

> compat/src/signal\_form\_control の SignalFormControl が AbstractControl として振る舞うための行（値の 3 通りの書き方と親への知らせの回数、touched・dirty の伝え方、何もしない・投げるメソッド、ルールで status だけが変わったとき #72009）、compatForm の葉の CompatStructure と検証の写し方（#71634・#71633）、extract.ts の extractValue（b542302a23c で反応するように直った）。origin/main の 12278e5f67b・9e99093bfe3・97bde8aa6cb・4422f4ef509 と 22.2.6。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sft-signal-form-control)

---

`SignalFormControl` は、Signal Forms の木を 1 つ持った `AbstractControl` で、既存の `FormGroup` の中に置けます。この章では、その値の書き方 3 通りがそれぞれ親の `FormGroup` にいつ・何回知らせるか、touched・dirty を親へどう伝えるか、何もしない・投げるメソッドが何を意味するかを行で追い、逆向きの `compatForm` の木（`FormControl` を葉に持つ木）の構造と検証の写し方、そして木から素の値を取り出す `extractValue` を読みます。origin/main の 12278e5f67b・9e99093bfe3・97bde8aa6cb・4422f4ef509 が 22.2.6 に入っているかも確かめます。

読む対象は `packages/forms/signals/compat/src/` の `signal_form_control/signal_form_control.ts`・`compat_field_adapter.ts`・`compat_structure.ts`・`compat_field_node.ts`・`compat_validation_state.ts`・`api/extract.ts` と、`src/util/normalize_form_args.ts` です（../angular、8576f161ae4）。コンストラクタ・値の effect と status の effect・`status` の getter・`wrapFieldTreeForSyncUpdates`・`disable()` などが投げること、`compatForm` が adapter を差し替えることと control の値・状態を signal に写すことは、[forms-sf-submit-compat](../forms/19-forms-sf-submit-compat.md) の 5〜7 節で読みました。この章はその残りです。`FormGroup` が子の変化を自分から見に行かず、子から `updateValueAndValidity` を呼んでもらう仕組みは[forms-update-value-validity](../forms/03-forms-update-value-validity.md)です。

1. [1. 子の作り方](01-sft-structure.md)
2. [2. 配列の追跡と孤児](02-sft-array-identity.md)
3. [3. proxy と context](03-sft-proxy-context.md)
4. **4. SignalFormControl と extract**（この章）
5. [5. spec と issue](05-sft-tests-issues.md)

## 1. 引数の読み方：normalizeFormArgs（12278e5f67b の前と後）

📄 `angular/packages/forms/signals/src/util/normalize_form_args.ts` L18–42 （▶ の行: 18, 29–33, 35）

```ts
18 ▶ export function normalizeFormArgs<TModel>(
19 │   args: any[],
20 │ ): [
21 │   WritableSignal<TModel>,
22 │   SchemaOrSchemaFn<TModel> | undefined,
23 │   (FormOptions<TModel> & {adapter?: FieldAdapter}) | undefined,
24 │ ] {
25 │   let model: WritableSignal<TModel>;
26 │   let schema: SchemaOrSchemaFn<TModel> | undefined;
27 │   let options: (FormOptions<TModel> & {adapter?: FieldAdapter}) | undefined;
28 │ 
29 ▶   if (args.length === 3) {
30 ▶     [model, schema, options] = args;
31 ▶   } else if (args.length === 2) {
32 ▶     if (isSchemaOrSchemaFn(args[1])) {
33 ▶       [model, schema] = args;
34 │     } else {
35 ▶       [model, options] = args;
36 │     }
37 │   } else {
38 │     [model] = args;
39 │   }
40 │ 
41 │   return [model, schema, options];
42 │ }
```

`form()`・`compatForm()`・`SignalFormControl` の 3 つが、引数をこの関数で (model, schema, options) に分けます。8576f161ae4 では 29〜30 行目のとおり、**引数が 3 つなら 2 番目を必ず schema とみなします**。`SignalFormControl` のコンストラクタは `[signal(value), schemaOrOptions, options]` の 3 つの配列を渡すので、`new SignalFormControl('a', {injector})` と書くと `{injector}` が schema になり、options は `undefined` です。注入器が渡らないので、注入コンテキストの外では `inject(Injector)` の NG0203 で落ちます（10 節の記録）。引数の数ではなく 32 行目の `isSchemaOrSchemaFn`（`SchemaImpl` か関数か）で分けるようにしたのが origin/main の 12278e5f67b です。

📄 `origin/main の差分（12278e5f67b）`

```
$ git show 12278e5f67b -- packages/forms/signals/src/util/normalize_form_args.ts
# fix(forms): preserve options passed to SignalFormControl（2026-11-02、origin/main、PR #71778）
-  if (args.length === 3) {
-    [model, schema, options] = args;
-  } else if (args.length === 2) {
-    if (isSchemaOrSchemaFn(args[1])) {
-      [model, schema] = args;
-    } else {
-      [model, options] = args;
-    }
+  if (isSchemaOrSchemaFn(args[1])) {
+    schema = args[1];
+    options = args[2];
   } else {
-    [model] = args;
+    options = args[1] && args[2] ? {...args[1], ...args[2]} : (args[1] ?? args[2]);
   }
# 同じコミットで signal_form_control.ts は compatForm に {injector} だけでなく {...opts, injector} を渡すようになった
```

同じコミットで、`SignalFormControl` が `compatForm` に `{injector}` だけでなく `name` などの options も渡すようになりました。サイトの 22.2.6 の `signals-compat.mjs` にはどちらも入っていて（`const formOptions = {...opts, injector}` の行）、`new SignalFormControl('a', {injector, name: 'x'})` は通ります。

## 2. 値を書く 3 つの道と、親への知らせ

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L197–233 （▶ の行: 198–200, 202, 204, 209–210, 214, 218, 223–226, 228, 230）

```ts
197 │   private defineCompatProperties(): void {
198 ▶     const valueProp = getClosureSafeProperty({value: getClosureSafeProperty});
199 ▶     Object.defineProperty(this, valueProp, {
200 ▶       get: () => this.sourceValue(),
201 │     });
202 ▶     const errorsProp = getClosureSafeProperty({errors: getClosureSafeProperty});
203 │     Object.defineProperty(this, errorsProp, {
204 ▶       get: () => signalErrorsToValidationErrors(this.fieldState.errors()),
205 │     });
206 │   }
207 │ 
208 │   private emitControlEvent(event: ControlEvent): void {
209 ▶     untracked(() => {
210 ▶       (this as any)._events.next(event);
211 │     });
212 │   }
213 │ 
214 ▶   override setValue(value: any, options?: ValueUpdateOptions): void {
215 │     this.updateValue(value, options);
216 │   }
217 │ 
218 ▶   override patchValue(value: any, options?: ValueUpdateOptions): void {
219 │     this.updateValue(value, options);
220 │   }
221 │ 
222 │   private updateValue(value: any, options?: ValueUpdateOptions): void {
223 ▶     const parent = this.scheduleParentUpdate(options);
224 ▶     this.sourceValue.set(value);
225 ▶     if (parent) {
226 ▶       this.updateParentValueAndValidity(parent, options?.emitEvent);
227 │     }
228 ▶     if (options?.emitModelToViewChange !== false) {
229 │       for (const fn of this.onChangeCallbacks) {
230 ▶         fn(value, true);
231 │       }
232 │     }
233 │   }
```

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L279–310 （▶ の行: 280–282, 288–290, 293–294, 299）

```ts
279 │   private scheduleParentUpdate(options?: ValueUpdateOptions): FormGroup | FormArray | null {
280 ▶     const parent = options?.onlySelf ? null : this.parent;
281 ▶     if (options?.onlySelf || parent) {
282 ▶       this.pendingParentNotifications++;
283 │     }
284 │     return parent;
285 │   }
286 │ 
287 │   private notifyParentUnlessPending(): void {
288 ▶     if (this.pendingParentNotifications > 0) {
289 ▶       this.pendingParentNotifications--;
290 ▶       return;
291 │     }
292 │     const parent = this.parent;
293 ▶     if (parent) {
294 ▶       this.updateParentValueAndValidity(parent);
295 │     }
296 │   }
297 │ 
298 │   private updateParentValueAndValidity(parent: AbstractControl, emitEvent?: boolean): void {
299 ▶     parent.updateValueAndValidity({emitEvent, sourceControl: this} as any);
300 │   }
301 │ 
302 │   private propagateToParent(
303 │     opts: {onlySelf?: boolean} | undefined,
304 │     fn: (parent: AbstractControl) => void,
305 │   ) {
306 │     const parent = this.parent;
307 │     if (parent && !opts?.onlySelf) {
308 │       fn(parent);
309 │     }
310 │   }
```

198〜205 行目、`AbstractControl` の `value` と `errors` は getter を持てない読み取り専用のフィールドなので、`Object.defineProperty` でこのインスタンスに getter を付けます。`getClosureSafeProperty({value: getClosureSafeProperty})` は、Closure Compiler がプロパティの名前を縮めても、縮めたあとの名前を拾うための小技です。`value` は `sourceValue()`、`errors` は Signal Forms のエラーを `ValidationErrors` の形にしたものです。

値の書き方は 3 通りあり、親の `FormGroup` に知らせる回数が違います。

1. **`ctrl.setValue(v)`（214〜233 行目）**

   223 行目の `scheduleParentUpdate` が、親があれば 282 行目で `pendingParentNotifications` を 1 つ増やします。224 行目で signal に書き、226 行目でその場で親の `updateValueAndValidity` を呼びます（親の `valueChanges` が 1 回）。そのあと変更検知の中で値の effect が走ると、288〜290 行目で数を 1 つ減らすだけで、親はもう呼びません。228〜232 行目は、`formControlName` などのディレクティブが登録した `onChange` に新しい値を渡して入力欄を書き直す道です。
2. **`ctrl.sourceValue.set(v)`**

   signal に直接書くので、その場では何も起きません。effect が走ったとき、数が 0 なので 293〜294 行目で親を 1 回呼びます。入力欄から `[formField]` が書き込むのもこの道です。
3. **`ctrl.fieldTree().value.set(v)`**

   forms-sf-submit-compat の 7 節で読んだ包んだ `set` が、書いたあとその場で親の `updateValueAndValidity` を呼びます。このときは `pendingParentNotifications` を増やしません。そのため、あとで effect が走ると 293〜294 行目でもう一度親を呼び、**1 回の set で親の `valueChanges` が 2 回**出ます。

もう 1 つ、値の effect は作られた直後の最初の 1 回も走るので、`FormGroup` に入れただけで、最初の変更検知で親の `updateValueAndValidity` が 1 回呼ばれ、親の `valueChanges` が 1 回出ます。ふつうの `FormControl` を入れただけでは出ません。どちらも 8576f161ae4 の作業木に spec を足して確かめました（`Expected 2 to be 1.` と `Expected 1 to be 0.`、10 節）。11 節の DEMO 1 で数が見えます。

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L527–550 （▶ の行: 529–530, 532–533, 535–536, 541, 543）

```ts
527 │   // Takes a FieldTree and wraps it's state's value to instantly call onUpdate.
528 │   const wrapTree = (t: FieldTree<unknown>): FieldTree<unknown> => {
529 ▶     return treeCache.getOrCreate(t, () => {
530 ▶       return new Proxy(t, {
531 │         // When getting a prop, wrap FieldTree if it's a function
532 ▶         get(target, prop, receiver) {
533 ▶           const val = Reflect.get(target, prop, receiver);
534 │           // Some of FieldTree children are not function, e.g. length.
535 ▶           if (typeof val === 'function' && typeof prop === 'string') {
536 ▶             return wrapTree(val);
537 │           }
538 │           return val;
539 │         },
540 │         // When calling the tree, wrap the returned state
541 ▶         apply(target, _, args) {
542 │           const state: FieldState<unknown> = (target as Function)(...args);
543 ▶           return stateCache.getOrCreate(state, () => wrapState(state));
544 │         },
545 │       }) as FieldTree<unknown>;
546 │     });
547 │   };
548 │ 
549 │   return wrapTree(tree) as FieldTree<T>;
550 │ }
```

包むのは `FieldState` だけでなく、木のたどり方もです。529〜546 行目、`fieldTree` を別の Proxy で包み、535〜536 行目で「名前が文字列のプロパティを読んで関数が返ったら、それも包む」ので、`ctrl.fieldTree.name` や `ctrl.fieldTree[0]` も包んだ木です。ただし 535 行目は `typeof prop === 'string'` なので、`Symbol.iterator` の関数は包みません。配列の反復子は[第 3 回](03-sft-proxy-context.md)の 2 節のとおり**内側の**`tgt.fieldTree` に当てられるので、`[...ctrl.fieldTree]` や `for...of` で取り出した子は包まれていない木です。それに `value.set` しても `onUpdate` は呼ばれず、親はその場では追いつきません（effect が走ってから 1 回）。`[...ctrl.fieldTree][0] === ctrl.fieldTree[0]` も `false` です（10 節の記録）。

280〜284 行目では、`onlySelf` のときも数を増やします。親を呼ばない書き込みのあと、effect が「知らせていない」と思って親を呼ばないようにするためです。ところが作業木で 282 行目を消しても node の 539 本は全部通ります。`signal_form_control_in_form_group.spec.ts` 240 行目の `should not notify parent when onlySelf is true` は、`setValue(20, {onlySelf: true})` の直後（effect が走る前）の親しか見ていないためです。

## 3. touched・dirty を親へ：effect と mark\*

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L142–171 （▶ の行: 145, 147–148, 158–160, 164–167）

```ts
142 │     // Disabled changes effect
143 │     effect(
144 │       () => {
145 ▶         const isDisabled = this.disabled;
146 │         untracked(() => {
147 ▶           for (const fn of this.onDisabledChangeCallbacks) {
148 ▶             fn(isDisabled);
149 │           }
150 │         });
151 │       },
152 │       {injector},
153 │     );
154 │ 
155 │     // Touched changes effect
156 │     effect(
157 │       () => {
158 ▶         const isTouched = this.fieldState.touched();
159 ▶         this.emitControlEvent(new TouchedChangeEvent(isTouched, this));
160 ▶         const parent = this.parent;
161 │         if (!parent) {
162 │           return;
163 │         }
164 ▶         if (!isTouched) {
165 ▶           parent.markAsUntouched();
166 ▶         } else {
167 ▶           parent.markAsTouched();
168 │         }
169 │       },
170 │       {injector},
171 │     );
```

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L172–190 （▶ の行: 176–177, 182–185）

```ts
172 │ 
173 │     // Dirty changes effect
174 │     effect(
175 │       () => {
176 ▶         const isDirty = this.fieldState.dirty();
177 ▶         this.emitControlEvent(new PristineChangeEvent(!isDirty, this));
178 │         const parent = this.parent;
179 │         if (!parent) {
180 │           return;
181 │         }
182 ▶         if (isDirty) {
183 ▶           parent.markAsDirty();
184 ▶         } else {
185 ▶           parent.markAsPristine();
186 │         }
187 │       },
188 │       {injector},
189 │     );
190 │   }
```

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L386–404 （▶ の行: 386, 388, 391, 393, 396, 398, 401, 403）

```ts
386 ▶   override markAsTouched(opts?: {onlySelf?: boolean}): void {
387 │     this.fieldState.markAsTouched();
388 ▶     this.propagateToParent(opts, (parent) => parent.markAsTouched(opts));
389 │   }
390 │ 
391 ▶   override markAsDirty(opts?: {onlySelf?: boolean}): void {
392 │     this.fieldState.markAsDirty();
393 ▶     this.propagateToParent(opts, (parent) => parent.markAsDirty(opts));
394 │   }
395 │ 
396 ▶   override markAsPristine(opts?: {onlySelf?: boolean}): void {
397 │     (this.fieldState as FieldNode).markAsPristine();
398 ▶     this.propagateToParent(opts, (parent) => parent.markAsPristine(opts));
399 │   }
400 │ 
401 ▶   override markAsUntouched(opts?: {onlySelf?: boolean}): void {
402 │     (this.fieldState as FieldNode).markAsUntouched();
403 ▶     this.propagateToParent(opts, (parent) => parent.markAsUntouched(opts));
404 │   }
```

- 143〜153 行目、disabled が変わると、`registerOnDisabledChange` で登録された関数（ディレクティブが入力欄の `disabled` を切り替える）を呼びます。
- 156〜171 行目、touched が変わると `TouchedChangeEvent` を流し、164〜168 行目で親を `markAsUntouched()` か `markAsTouched()` にします。174〜189 行目の dirty も同じ形で、182〜186 行目で親を `markAsDirty()` か `markAsPristine()` にします。
- 386〜404 行目の 4 つの `mark*` も、Signal Forms の状態を変えてから、親の同じ名前のメソッドを呼びます。

touched と dirty（`markAsTouched`・`markAsDirty`）を親へ伝えるのは、リアクティブフォームの `FormControl` と同じ向きです。違うのは **untouched と pristine** です。リアクティブフォームの `markAsPristine` は、自分と子を pristine にしたあと、親には `_updatePristine`（子から数え直す）を呼び、親自身を `markAsPristine` にはしません（[forms-abstract-control](../forms/02-forms-abstract-control.md)）。`FormGroup.markAsPristine()` は**すべての子**を pristine にするメソッドなので、185 行目・398 行目のように親のそれを呼ぶと、隣の `FormControl` の dirty まで消えます。165 行目・403 行目の untouched も同じです。

しかも 156 行目と 174 行目の effect は最初の 1 回も走るので、`SignalFormControl` がまだ untouched・pristine なら、`FormGroup` に入れたあとの最初の変更検知で、親とすべての兄弟が untouched・pristine に戻ります。dirty だった `SignalFormControl` を `ctrl.reset()` したときや、`ctrl.markAsPristine()` を呼んだときも同じです。作業木の spec で 3 つとも確かめ（10 節）、サイトの 22.2.6 と origin/main（ca92b968b8e）の同じ行もこの形のままです。gh で探した範囲では、この件の issue はありません。

## 4. 何もしないメソッドと、投げるメソッド

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L406–432 （▶ の行: 406, 410, 414, 418–419, 424–425, 430–431）

```ts
406 ▶   override updateValueAndValidity(_opts?: Object): void {}
407 │ 
408 │   /** @internal */
409 │   // @ts-ignore
410 ▶   override _updateValue(): void {}
411 │ 
412 │   /** @internal */
413 │   // @ts-ignore
414 ▶   override _forEachChild(_cb: (c: AbstractControl) => void): void {}
415 │ 
416 │   /** @internal */
417 │   // @ts-ignore
418 ▶   override _anyControls(_condition: (c: AbstractControl) => boolean): boolean {
419 ▶     return false;
420 │   }
421 │ 
422 │   /** @internal */
423 │   // @ts-ignore
424 ▶   override _allControlsDisabled(): boolean {
425 ▶     return this.disabled;
426 │   }
427 │ 
428 │   /** @internal */
429 │   // @ts-ignore
430 ▶   override _syncPendingControls(): boolean {
431 ▶     return false;
432 │   }
```

`FormGroup` は子を `_forEachChild`・`_anyControls` などの内部のメソッドでたどります。`SignalFormControl` は子を持たない葉として振る舞うので、414 行目はたどらず、418〜420 行目は常に `false` です。406 行目の `updateValueAndValidity` は何もしません。値も状態も signal から getter で読むので、計算し直すものが無いからです。親の `FormGroup` が子の `updateValueAndValidity` を呼んでも、`SignalFormControl` の側は何も変わりません（5 節）。424〜426 行目、`_allControlsDisabled` は自分の disabled（ルールの結果）を返すので、親の `FormGroup` は「子が全部 disabled なら自分も DISABLED」を、ルールの結果で判断できます。

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L253–277 （▶ の行: 258–259, 262–263, 265–266, 269–270, 275）

```ts
253 │   override getRawValue(): T {
254 │     return this.value;
255 │   }
256 │ 
257 │   override reset(value?: T | FormControlState<T>, options?: ValueUpdateOptions): void {
258 ▶     if (isFormControlState(value)) {
259 ▶       throw unsupportedDisableEnableError();
260 │     }
261 │ 
262 ▶     const resetValue = value ?? this.initialValue;
263 ▶     this.fieldState.reset(resetValue);
264 │ 
265 ▶     if (value !== undefined) {
266 ▶       this.updateValue(value, options);
267 │     } else if (!options?.onlySelf) {
268 │       const parent = this.parent;
269 ▶       if (parent) {
270 ▶         this.updateParentValueAndValidity(parent, options?.emitEvent);
271 │       }
272 │     }
273 │ 
274 │     if (options?.emitEvent !== false) {
275 ▶       this.emitControlEvent(new FormResetEvent(this));
276 │     }
277 │   }
```

📄 `angular/packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts` L552–578 （▶ の行: 552, 556–558, 566, 569, 573, 576）

```ts
552 ▶ function isFormControlState(formState: unknown): formState is FormControlState<unknown> {
553 │   return (
554 │     typeof formState === 'object' &&
555 │     formState !== null &&
556 ▶     Object.keys(formState).length === 2 &&
557 ▶     'value' in formState &&
558 ▶     'disabled' in formState
559 │   );
560 │ }
561 │ 
562 │ function unsupportedFeatureError(message: string | null): Error {
563 │   return new RuntimeError(RuntimeErrorCode.UNSUPPORTED_FEATURE, message ?? false);
564 │ }
565 │ 
566 ▶ function unsupportedDisableEnableError(): Error {
567 │   return unsupportedFeatureError(
568 │     ngDevMode &&
569 ▶       'Imperatively changing enabled/disabled status in form control is not supported in signal forms. Instead use a "disabled" rule to derive the disabled status from a signal.',
570 │   );
571 │ }
572 │ 
573 ▶ function unsupportedValidatorsError(): Error {
574 │   return unsupportedFeatureError(
575 │     ngDevMode &&
576 ▶       'Dynamically adding and removing validators is not supported in signal forms. Instead use the "applyWhen" rule to conditionally apply validators based on a signal.',
577 │   );
578 │ }
```

`reset` は 263 行目で Signal Forms の `reset`（touched・dirty を戻す）をし、値があれば 266 行目で 2 節の `updateValue` を通ります。258〜260 行目、`{value, disabled}` の箱（552〜560 行目、キーがちょうどその 2 つ）を渡すと投げます。disabled を命令で変えられないからで、566〜571 行目の文が「`disabled` ルールで」と言います。`disable()`・`enable()` も同じ例外です（forms-sf-submit-compat の 7 節）。`FormGroup.disable()` は自分を DISABLED にしてから子の `disable()` を順に呼ぶので、`SignalFormControl` を含む `FormGroup` を disable すると、途中で投げて「親は DISABLED、前の子は disabled、後ろの子はそのまま」で止まります（11 節の DEMO 1）。これを「親から disable させてほしい」と求めるのが開いている #68882（2026-05-22）で、`disable()` を root の `disabled` ルールで実装する PR #69683 は、2026-10-27 に「指摘に応えていない」として閉じられています。

`updateOn` も同じ考えで、origin/main の 9e99093bfe3 が、`'change'` 以外を渡したとき（コンストラクタの options か、親の `FormGroup` から受け継いだとき）に NG01920 を投げるようにしました。22.2.6 にはもう入っています（forms-sf-submit-compat の 7 節の囲み）。

📄 `origin/main の差分（9e99093bfe3）`

```
$ git show 9e99093bfe3 -- packages/forms/signals/compat/src/signal_form_control/signal_form_control.ts
# fix(forms): reject unsupported updateOn in SignalFormControl（2026-10-27、origin/main）
+  override setParent(parent: FormGroup | FormArray | null): void {
+    super.setParent(parent);
+    if ((typeof ngDevMode === 'undefined' || ngDevMode) && parent && parent.updateOn !== 'change') {
+      throw unsupportedUpdateOnError(parent.updateOn, true);
+    }
+  }
+
+  override get updateOn(): 'change' | 'blur' | 'submit' {
+    return 'change';
+  }
# コンストラクタでも options.updateOn が 'change' 以外なら同じ例外（NG01920）
```

## 5. ルールで status だけが変わったとき（#72009）

2 節の 3 つの道は、どれも**値**の変化から親に知らせます。`required(p, {when: () => isRequired()})` の `isRequired` だけを変えたときのように、値は同じで status だけが変わると、status の effect（forms-sf-submit-compat の 7 節で読んだ、コンストラクタの 2 つ目の effect）は自分の `statusChanges` と `StatusChangeEvent` を出すだけで、親を呼びません。親の `FormGroup` の status と value は古いまま残り、次に値が変わるか、親の `updateValueAndValidity()` を誰かが呼ぶまで追いつきません。disabled のルールが真になったときも、親の value に disabled の子が残ったままです。

これが開いている #72009（2026-11-12）です。PR は 2 つあり、#72013 は同じ日に閉じ、#72014（開いている）は `pendingParentNotifications` の数え方をやめて、「最後に親に知らせた値と status」を覚え、値か status のどちらかが違えば値の effect と status の effect の両方から親を呼ぶ形にしています。その PR では、包んだ `set` の `onUpdate` も「知らせた」と記録するので、2 節の「1 回の set で 2 回」もこの書き換えで変わります（PR の差分を読んだかぎり。マージされていないので 22.2.6 にも origin/main にもありません）。

## 6. compatForm の木：adapter と CompatStructure

📄 `angular/packages/forms/signals/compat/src/compat_field_adapter.ts` L41–71 （▶ の行: 47–48, 58, 66–68, 70）

```ts
41 │   newRoot<TModel>(
42 │     fieldManager: FormFieldManager,
43 │     value: WritableSignal<TModel>,
44 │     pathNode: FieldPathNode,
45 │     adapter: FieldAdapter,
46 │   ): FieldNode {
47 ▶     if (value() instanceof AbstractControl) {
48 ▶       return createCompatNode({
49 │         kind: 'root',
50 │         fieldManager,
51 │         value,
52 │         pathNode,
53 │         logic: pathNode.builder.build(),
54 │         fieldAdapter: adapter,
55 │       });
56 │     }
57 │ 
58 ▶     return this.basicAdapter.newRoot<TModel>(fieldManager, value, pathNode, adapter);
59 │   }
60 │ 
61 │   /**
62 │    * Creates a regular or compat node state based on whether the control is present.
63 │    * @param node
64 │    * @param options
65 │    */
66 ▶   createNodeState(node: CompatFieldNode, options: CompatChildFieldNodeOptions): FieldNodeState {
67 ▶     if (!options.control) {
68 ▶       return this.basicAdapter.createNodeState(node);
69 │     }
70 ▶     return new CompatNodeState(node, options);
71 │   }
```

子の側の分かれ道（親の値のそのキーが `AbstractControl` か）は forms-sf-submit-compat の 5 節で読みました。根でも同じで、47 行目、model の値そのものが `AbstractControl` なら根から compat のノードです（`compatForm(signal(new FormControl('x')))`）。66〜71 行目のように、状態・構造・検証のどれも `options.control` があるかで compat 版とふつう版を選びます。

📄 `angular/packages/forms/signals/compat/src/compat_structure.ts` L109–150 （▶ の行: 109, 114–115, 121–123, 127, 135, 140, 143–144, 148–149）

```ts
109 ▶ export class CompatStructure extends FieldNodeStructure {
110 │   override value: WritableSignal<unknown>;
111 │   override keyInParent: Signal<string>;
112 │   override root: FieldNode;
113 │   override pathKeys: Signal<readonly string[]>;
114 ▶   override readonly children = signal([]);
115 ▶   override readonly childrenMap = computed(() => undefined);
116 │   override readonly parent: ParentFieldNode | undefined;
117 │   override readonly fieldManager: FormFieldManager;
118 │   override readonly isOrphaned: Signal<boolean>;
119 │ 
120 │   constructor(node: FieldNode, options: CompatFieldNodeOptions) {
121 ▶     super(options.logic, node, () => {
122 ▶       throw new RuntimeError(
123 ▶         RuntimeErrorCode.COMPAT_NO_CHILDREN,
124 │         ngDevMode && `Compat nodes don't have children.`,
125 │       );
126 │     });
127 ▶     this.value = getControlValueSignal(options);
128 │     this.parent = getParentFromOptions(options);
129 │     this.root = this.parent?.structure.root ?? node;
130 │     this.fieldManager = getFieldManagerFromOptions(options);
131 │ 
132 │     const identityInParent = options.kind === 'child' ? options.identityInParent : undefined;
133 │     const initialKeyInParent = options.kind === 'child' ? options.initialKeyInParent : undefined;
134 │ 
135 ▶     const signals = this.createKeyOrOrphanSignals(
136 │       options.kind,
137 │       identityInParent,
138 │       initialKeyInParent,
139 │     );
140 ▶     this.keyInParent = signals.keyInParent;
141 │     this.isOrphaned = signals.isOrphaned;
142 │ 
143 ▶     this.pathKeys = computed(() =>
144 ▶       this.parent ? [...this.parent.structure.pathKeys(), this.keyInParent()] : [],
145 │     );
146 │   }
147 │ 
148 ▶   override getChild(): FieldNode | undefined {
149 ▶     return undefined;
150 │   }
```

1. **114〜115 行目：子を持たない**

   `children` は空、`childrenMap` は常に `undefined` です。121〜126 行目、子を作る関数を渡す先にも「compat のノードに子は無い」で投げる関数を置きます。
2. **148〜150 行目：getChild は常に undefined**

   `FormGroup` を葉に持っても、`f.addr.city` は `undefined` です（compat.spec.ts 668 行目の it は `f.value`・`f.setValue` が `undefined` であることを固めています）。
3. **127 行目：value は control の生の値**

   forms-sf-submit-compat の 6 節の `getControlValueSignal` で、`getRawValue()` の写しです。`FormGroup` なら `{city: 'Tokyo'}` のようなオブジェクトです。
4. **135〜145 行目：位置の signal はふつうと同じ**

   `createKeyOrOrphanSignals`（[第 2 回](02-sft-array-identity.md)）で `keyInParent` と孤児の判定を作り、143〜145 行目で `pathKeys` を親から作ります。

第 3 回の Proxy の `ownKeys` は値のキーを返すので、`Object.keys(f.addr)` は `['city']` なのに、`f.addr.city` は `undefined` です（11 節の DEMO 2）。8 節の `extractValue` が「キーの先が関数か」を確かめるのはこのためです。

もう 1 つ、**根の `valid()` は、compat の子を一度も読む前は `FormControl` の検証を見ません**。根の `syncValid` は子を `reduceChildren` で畳み込みますが、子の `FieldNode` は「どの子にもスキーマのルールが無ければ、読まれるまで作らない」ので（98c5afdb021、[第 1 回](01-sft-structure.md)）、`compatForm(signal({name: new FormControl('', Validators.required)}))` の `f().valid()` は、最初に読むと `true` です。`f.name` を一度読むと子ができて、根も `false` になります。compat の子の検証はスキーマのルールではなく `FormControl` の validator から来るので、「ルールが無い子は後で作ってよい」の前提に合いません。作業木の spec（`Expected true to be false.`）と 11 節の DEMO 2 の「子を読む前の根」で確かめました。gh で探した範囲では、この件の issue はありません。

今のところ、これが見えるのは**最初の変更検知の前**に同期で読んだときだけです。`FormFieldManager` の掃除の effect が最初の tick で `children()` をたどって全部の子を作るので（[第 1 回](01-sft-structure.md)の 7 節、#70627）、そのあとは根も正しく `false` になります。ところが #70627 を直す 1 行（その effect を `materializedChildren()` でたどる。PR #71659 が開いている）を作業木に当てると、根の `valid()` だけを読む effect は tick のあとも `true` を見続けます（`Expected $[0] = true to equal false.`）。その状態でも node の 539 本と web の 350 本は全部通るので、今の spec はこの組み合わせを固めていません。

## 7. compat の検証の写し方：errors・required・errorSummary・parseErrors

📄 `angular/packages/forms/signals/compat/src/compat_field_node.ts` L81–105 （▶ の行: 90, 92, 94, 96–97, 101）

```ts
 81 │ 
 82 │ /**
 83 │  * A helper function, simplifying getting reactive control properties after status changes.
 84 │  *
 85 │  * Used to extract errors and statuses such as valid, pending.
 86 │  *
 87 │  * @param options
 88 │  * @param getValue
 89 │  */
 90 ▶ export const getControlStatusSignal = <T>(
 91 │   options: CompatFieldNodeOptions,
 92 ▶   getValue: (c: AbstractControl<unknown>) => T,
 93 │ ) => {
 94 ▶   return extractControlPropToSignal<unknown, T>(options, (c, destroy$) =>
 95 │     toSignal(
 96 ▶       c.statusChanges.pipe(
 97 ▶         map(() => getValue(c)),
 98 │         takeUntil(destroy$),
 99 │       ),
100 │       {
101 ▶         initialValue: getValue(c),
102 │       },
103 │     ),
104 │   );
105 │ };
```

📄 `angular/packages/forms/signals/compat/src/compat_validation_state.ts` L20–37 （▶ の行: 21, 26, 31, 36）

```ts
20 │ // Readonly signal containing an empty array, used for optimization.
21 ▶ const EMPTY_ARRAY_SIGNAL = computed(() => []);
22 │ 
23 │ /**
24 │  * Compat version of a validation state that wraps a FormControl, and proxies it's validation state.
25 │  */
26 ▶ export class CompatValidationState implements ValidationState {
27 │   readonly syncValid: Signal<boolean>;
28 │   /**
29 │    * All validation errors for this field.
30 │    */
31 ▶   readonly errors: Signal<CompatValidationError[]>;
32 │   readonly pending: Signal<boolean>;
33 │   readonly invalid: Signal<boolean>;
34 │   readonly valid: Signal<boolean>;
35 │ 
36 ▶   readonly parseErrors: Signal<ValidationError.WithFormField[]> = computed(() => []);
37 │ 
```

📄 `angular/packages/forms/signals/compat/src/compat_validation_state.ts` L54–75 （▶ の行: 55–56, 59–60, 63–66, 72–73）

```ts
54 │ 
55 ▶   asyncErrors: Signal<(ValidationError.WithFieldTree | 'pending')[]> = EMPTY_ARRAY_SIGNAL;
56 ▶   errorSummary: Signal<ValidationError.WithFieldTree[]> = EMPTY_ARRAY_SIGNAL;
57 │ 
58 │   // Those are irrelevant for compat mode, as it has no children
59 ▶   rawSyncTreeErrors = EMPTY_ARRAY_SIGNAL;
60 ▶   syncErrors = EMPTY_ARRAY_SIGNAL;
61 │   rawAsyncErrors = EMPTY_ARRAY_SIGNAL;
62 │ 
63 ▶   // Compat fields can't have validation rules applied to them; however, there are other
64 ▶   // features that depend on this property, such as `markAsTouched()`.
65 ▶   readonly shouldSkipValidation = computed(
66 ▶     () => this.node.hidden() || this.node.disabled() || this.node.readonly(),
67 │   );
68 │ 
69 │   /**
70 │    * Computes status based on whether the field is valid/invalid/pending.
71 │    */
72 ▶   readonly status: Signal<'valid' | 'invalid' | 'unknown'> = computed(() => {
73 ▶     return calculateValidationSelfStatus(this);
74 │   });
75 │ }
```

90〜105 行目の `getControlStatusSignal` は、control の `statusChanges` が出るたびに `getValue(c)` を読み直す signal で、101 行目の初期値もその場で読みます。検証の状態（forms-sf-submit-compat の 6 節で読んだコンストラクタ）はどれもこれで作るので、`errors()` は `FormControl` の `errors` を `CompatValidationError` の配列にしたものです。

| メンバー | 行 | compat のノードで返すもの | issue / コミット |
| --- | --- | --- | --- |
| `parseErrors` | 36 | 常に空。`[formField]` が compat のフィールドに parse エラーを報告しても、残る場所が無い | #71633（開いている） |
| `errorSummary` | 56 | 常に空。根の `errorSummary()` にも `FormControl` のエラーが入らない。`errors()` の要素には `fieldTree` も無い | #71634（開いている、再現の spec の PR #71630 は閉じた） |
| `asyncErrors`・`syncErrors` など | 55・59〜61 | 常に空。子を持たず、スキーマのルールも走らない |   |
| `shouldSkipValidation` | 65〜67 | hidden・disabled・readonly のどれか。compat のノードでは検証を飛ばすためではなく、`markAsTouched()` などがこれを見るために置く（63〜64 行目のコメント） |   |
| `required` | （8576f161ae4 には無い） | ふつうの `FieldNode` の `required`（metadata の `REQUIRED`）なので、`Validators.required` は見えず `false` | 97bde8aa6cb が直した（#68905 完了） |

📄 `origin/main の差分（97bde8aa6cb）`

```
$ git show 97bde8aa6cb -- packages/forms/signals/compat/src/compat_field_node.ts
# fix(forms): reflect required validators in compat fields（コミット 2026-11-02、origin/main、Fixes #68905）
 export class CompatFieldNode extends FieldNode {
   readonly control: Signal<AbstractControl>;
+  private readonly requiredSignal: Signal<boolean>;

   constructor(public readonly options: CompatFieldNodeOptions) {
     super(options);
     this.control = this.options.control;
+    this.requiredSignal = getControlStatusSignal(this.options, (c) =>
+      c.hasValidator(Validators.required),
+    );
+  }
+
+  override get required(): Signal<boolean> {
+    return this.requiredSignal;
   }
 }
```

97bde8aa6cb は `CompatFieldNode` の `required` を、90 行目の `getControlStatusSignal` で `hasValidator(Validators.required)` を読む signal に替えました。作者の日付は 2026-05-25 ですが、本家に入ったのは 2026-11-02 で、8576f161ae4 には無く、サイトの 22.2.6 の `signals-compat.mjs` にはあります（`requiredSignal` の行）。

## 8. extractValue：木から素の値を取り出す

📄 `angular/packages/forms/signals/compat/src/api/extract.ts` L86–118 （▶ の行: 90, 97–98, 100, 102–103, 106–107, 110, 116）

```ts
 86 │ export function extractValue<T>(
 87 │   field: FieldTree<T>,
 88 │   filter?: ExtractFilter,
 89 │ ): RawValue<T> | DeepPartial<RawValue<T>> {
 90 ▶   return visitFieldTree(field, filter) as RawValue<T> | DeepPartial<RawValue<T>>;
 91 │ }
 92 │ 
 93 │ function visitFieldTree(
 94 │   field: FieldTree<unknown>,
 95 │   filter?: ExtractFilter,
 96 │ ): RawValue<unknown> | DeepPartial<RawValue<unknown>> {
 97 ▶   const state = field();
 98 ▶   const value = state.value();
 99 │ 
100 ▶   const matchingChildren = extractChildren(field, value, filter);
101 │ 
102 ▶   if (matchingChildren !== undefined || isContainerNode(field, value)) {
103 ▶     return matchingChildren;
104 │   }
105 │ 
106 ▶   if (matchesFilter(state, filter)) {
107 ▶     return value;
108 │   }
109 │ 
110 ▶   return undefined;
111 │ }
112 │ 
113 │ function isContainerNode(field: FieldTree<unknown>, value: unknown): boolean {
114 │   return (
115 │     (isArray(value) || isObject(value)) &&
116 ▶     Object.keys(value).some((k) => isFieldTreeNode(field[k as keyof FieldTree<unknown>]))
117 │   );
118 │ }
```

📄 `angular/packages/forms/signals/compat/src/api/extract.ts` L120–142 （▶ の行: 125, 128, 132, 134–135, 138, 141）

```ts
120 │ function extractChildren(
121 │   field: FieldTree<unknown>,
122 │   value: unknown,
123 │   filter?: ExtractFilter,
124 │ ): unknown {
125 ▶   if (isArray(value)) {
126 │     const record = field as unknown as Record<number, FieldTree<unknown>>;
127 │     const arrayValue = value as readonly FieldTree<unknown>[];
128 ▶     const result: unknown[] = new Array(arrayValue.length);
129 │     let hasMatch = false;
130 │ 
131 │     for (let i = 0; i < arrayValue.length; i++) {
132 ▶       const child = record[i];
133 │ 
134 ▶       const childResult = visitFieldTree(child, filter);
135 ▶       if (childResult !== undefined) {
136 │         hasMatch = true;
137 │       }
138 ▶       result[i] = childResult;
139 │     }
140 │ 
141 ▶     return hasMatch ? result : undefined;
142 │   }
```

📄 `angular/packages/forms/signals/compat/src/api/extract.ts` L144–173 （▶ の行: 147, 149–150, 154–155, 159, 165–166）

```ts
144 │   if (isObject(value)) {
145 │     const record = field as unknown as Record<string, unknown>;
146 │     const objectValue = value as Record<string, unknown>;
147 ▶     const entries = Object.keys(objectValue)
148 │       .map<[string, FieldTree<unknown>] | undefined>((key) => {
149 ▶         const child = record[key];
150 ▶         return isFieldTreeNode(child) ? [key, child] : undefined;
151 │       })
152 │       .filter(isKeyedChild)
153 │       .map(([key, child]) => {
154 ▶         const childResult = visitFieldTree(child, filter);
155 ▶         return childResult !== undefined ? ([key, childResult] as [string, unknown]) : undefined;
156 │       })
157 │       .filter((v) => v !== undefined);
158 │ 
159 ▶     return entries.length ? Object.fromEntries(entries) : undefined;
160 │   }
161 │ 
162 │   return undefined;
163 │ }
164 │ 
165 ▶ function isFieldTreeNode(value: unknown): value is FieldTree<unknown> {
166 ▶   return typeof value === 'function';
167 │ }
168 │ 
169 │ function isKeyedChild(
170 │   value: [string, FieldTree<unknown>] | undefined,
171 │ ): value is [string, FieldTree<unknown>] {
172 │   return value !== undefined;
173 │ }
```

1. **97〜98 行目：状態と値を読む**

   compat の葉なら、値は `FormControl` の生の値です（6 節）。
2. **100 行目：子があれば子から作る**

   配列なら 125〜142 行目で同じ長さの配列を作り、132 行目で `field[i]` の子をたどります。filter で外れた要素は `undefined` のまま位置を残し（138 行目）、1 つも当たらなければ 141 行目で配列ごと `undefined` です。オブジェクトなら 147〜157 行目で値のキーごとに `field[key]` を読み、150 行目で関数（= 子の `FieldTree`）のものだけを残します。
3. **102〜104 行目：入れ物なら子の結果を返す**

   116 行目の `isContainerNode` は「値のキーのどれかの先に子のフィールドがある」かどうかです。compat の `FormGroup` の葉は値がオブジェクトでも子が無い（6 節）ので入れ物ではなく、106〜108 行目で値をそのまま返します。

165〜167 行目の `isFieldTreeNode` は `typeof value === 'function'` だけで、第 3 回の `isFieldTree`（2a141847a5e）より前からあります。Proxy の `get` は子でないキーに `undefined` を返すので、ここではこれで足ります。作業木で 102 行目の `|| isContainerNode(…)` を消すと、`extract_value.spec.ts` の「子が全部外れたら入れ物ごと落とす」2 本が落ちます。

90 行目は b542302a23c（2026-04-14、PR #68202）で `untracked(() => visitFieldTree(…))` から今の形になりました。前は `computed(() => extractValue(f))` に依存が付かず、`FormControl` の値が変わっても読み直されませんでした。その差分には `console.log('value', value)` が 1 行入っていて、同じ日の 8e8c5524bb6「removed console log」が消しています。ファイルの先頭の `import {untracked}` は使われないまま残っています（origin/main も同じ）。PR #68202 が参照していた #68097（compat の値を素の値で読める signal がほしい）は、まだ開いています。

## 9. origin/main の続きと 22.2.6

| コミット（origin/main） | 中身 | 22.2.6 の .mjs | 節 |
| --- | --- | --- | --- |
| `12278e5f67b`（2026-11-02） | `normalizeFormArgs` を引数の数でなく schema かどうかで分ける。`SignalFormControl` が options を全部 `compatForm` に渡す | 入っている（`formOptions`） | 1 |
| `9e99093bfe3`（2026-10-27） | `updateOn` が `'change'` 以外なら NG01920。`get updateOn()` は常に `'change'` | 入っている（`unsupportedUpdateOnError`） | 4 |
| `97bde8aa6cb`（2026-11-02） | compat のフィールドの `required` が `Validators.required` を映す（#68905） | 入っている（`requiredSignal`） | 7 |
| `4422f4ef509`（2026-11-02） | `valueOf` の `instanceof AbstractControl` を Symbol の印に（#71621） | 入っている（`_isAbstractControl`） | [第 3 回](03-sft-proxy-context.md)の 5 節 |
| （PR #72014、開いている） | status の変化でも親に知らせる（#72009） | 無い | 5 |

4422f4ef509 のあとも、compat の側の `compat_field_adapter.ts` 47 行目は `value() instanceof AbstractControl` のままです。compat を使うなら `AbstractControl` はどのみち要るので、ここは木の振り落としの話になりません。

## 10. 作業木で確かめた記録

📄 `8576f161ae4 の作業木に足した spec（3 回に分けて計 15 本）`

```
# 8576f161ae4 の作業木に spec を足して走らせた結果（node:test、--filter で probe の 11 本・probe2 の 3 本・probe3 の 1 本。ここに出したのは SignalFormControl と compatForm の分）
sft-b probe SignalFormControl fieldTree().value.set 1 回で親の valueChanges は 1 回
  Expected 2 to be 1.
sft-b probe SignalFormControl setValue 1 回で親の valueChanges は 1 回（対照）          … 通る
sft-b probe SignalFormControl FormGroup に入れただけでは親の valueChanges は出ない
  Expected 1 to be 0.
sft-b probe SignalFormControl 配列を for...of で取り出した子に set しても親がすぐ追いつく
  Expected $.c[0] = 'a' to equal 'X'.
sft-b probe SignalFormControl ルールで status が変わると親も変わる（#72009）
  Expected 'INVALID' to be 'VALID'.
sft-b probe SignalFormControl 2 番目の引数に options を渡せる（12278e5f67b の前）
  Expected function not to throw, but it threw Error: NG0203: The `Injector` token injection failed. …
sft-b probe2 SignalFormControl の最初の effect で、隣の FormControl の dirty / touched が消えない
  Expected false to be true.（3 つとも）
sft-b probe2 SignalFormControl の markAsPristine で、隣の FormControl の dirty が消えない
  Expected false to be true.
sft-b probe2 compatForm の根の valid は、子を読む前から FormControl の検証を見る
  Expected true to be false.
sft-b probe compatForm FormControl のエラーが errorSummary に出る（#71634）
  Expected false to be true.（根の invalid。子を読む前なので）  Expected 0 to be 1.
sft-b probe3 compatForm の根の valid だけを読む effect が、FormControl の検証を見る
  manager.ts はそのまま                                   … 通る（掃除の effect が先に子を作る）
  manager.ts 84 行目を materializedChildren() にした作業木  Expected $[0] = true to equal false.
  （同じ作業木で node:test 539 specs, 0 failures、web:test_chromium 350 passed）
```

spec の中身は「正しいならこうなる」を期待にしたもので、落ちたものが今の振る舞いです。`setValue` の 1 本（対照）だけが通りました。作業木は確かめたあと消しました。

## 11. DEMO

> **🧪 DEMO 1 — FormGroup の中の SignalFormControl**
>
> 本物の `@angular/forms/signals/compat`（22.2.6）です。`ctrl = new SignalFormControl('', p => { required(p, {when: () => isRequired()}); minLength(p, 3); disabled(p, {when: () => isDisabled()}) })`、`group = new FormGroup({sig: ctrl, other: new FormControl('x')})`。`group.valueChanges`・`group.statusChanges`・`ctrl.valueChanges` の回数を数えています。1 行が 1 回の操作で、左が「操作の直後（同期）」、右が「`ApplicationRef.whenStable()` のあと（effect が走ったあと）」です。値が変わった欄を太字にします。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sft-signal-form-control)

試すと見えること（数は、ページを開いて最初に「今の状態を記録」を押したところからの差です）。

- ページを開いた時点で `group valueChanges` がすでに 1 です（2 節の、値の effect の最初の 1 回）。
- `setValue` は直後に group が 1 増え、effect のあとは増えません。`fieldTree().value.set` は直後に 1、effect のあとにもう 1 増えます。`sourceValue.set` は直後は変わらず、effect のあとに 1 増えます（2 節）。
- 空のまま「required の条件を切り替え」ると、`ctrl.status` は VALID になるのに `group.status` は INVALID のままで、group の数も増えません（5 節、#72009）。「group.updateValueAndValidity()」で追いつきます。disabled の条件でも同じで、group.value に sig が残ります。
- 「other.markAsDirty()」のあと「ctrl.markAsPristine()」を押すと、その場で other が pristine に戻ります（398 行目）。「other.markAsDirty()」「ctrl.markAsDirty()」「ctrl.reset()」の順に押すと、effect のあとに戻ります（182〜186 行目。ctrl が pristine のままの reset では dirty の effect が走らないので戻りません）。
- 「ctrl.reset()」は group の valueChanges が直後に 2 増え、値が変わっていれば effect のあとにもう 1 増えます。`FieldNode` の `reset` は値を渡されると `this.value.set` で書き（[sfd-custom-control](../sfd/04-sfd-custom-control.md)）、263 行目の `this.fieldState` は包んだ状態なので、その `set` が `onUpdate` を呼びます。そこに 270 行目の親の呼び出しと、値の effect が足されます。
- 「group.disable()」は投げ、group は DISABLED のまま、other は VALID のまま（`sig` が先に並んでいて、そこで止まるため）です（4 節）。「group.enable()」も投げます。

> **🧪 DEMO 2 — compatForm と extractValue**
>
> `cf = compatForm(signal({name: new FormControl('', Validators.required), addr: new FormGroup({city: new FormControl('Tokyo')}), age: 20}))`。下の 2 行の `extractValue` はテンプレートの `computed` の中で呼んでいて、`FormControl` の値が変わると読み直されます（8 節の b542302a23c）。「子を読む前の根」は、押すたびに新しい `compatForm` を作って、子を読む前と後で根の `valid()` を比べます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sft-signal-form-control)

- name が空のとき、`cf.name().errors()` は `required` を 1 つ持ち、`fieldTree` は無く、`cf().errorSummary().length` は 0 です（7 節、#71634）。`required()` は 22.2.6 なので `true` です（97bde8aa6cb）。
- `Object.keys(cf.addr)` は `["city"]`、`cf.addr.city` は `undefined`（6 節）。`extractValue` は `addr` を `{"city": …}` の葉として返します。
- `extractValue(cf, {dirty: true})` は最初 `undefined` で、`name.markAsDirty()` のあとは `{"name": …}` だけになります。
- 「子を読む前の根」は、`true` → `false` → `false` と出ます（6 節）。ボタンの処理の中で同期に読むので、掃除の effect より先です。

## 12. 呼び出しの連なり：fieldTree().value.set('ab')

- 👤 `ctrl.fieldTree().value.set('ab')` — 利用者のコード — *包んだ FieldState の value*
  - `value.set(v)` — signal\_form\_control.ts の wrapFieldTreeForSyncUpdates — *元の set（sourceValue に書く）*
  - `onUpdate()` → `parent.updateValueAndValidity({sourceControl})` — コンストラクタで渡した onUpdate — *1 回目。pendingParentNotifications は 0 のまま*
    - `FormGroup._updateValue()` → `valueChanges.emit` — forms/src/model — *子の value の getter（199〜201）を読む*
- `ApplicationRef.tick()` — 変更検知 — *root effect が走る*
  - `値の effect` → `notifyParentUnlessPending()` — signal\_form\_control.ts 287〜296 — *数が 0 なので 294 行目で 2 回目*
  - `valueChanges.emit`・`ValueChangeEvent` — 値の effect の続き — *ctrl の側は 1 回*

## テストと直し方

| spec（test/ から） | describe（行） | 固めているもの |
| --- | --- | --- |
| `node/compat/signal_form_control.spec.ts` | 29 `SignalFormControl` › 30 値・53 検証・142 dirty/touched・286 observable とイベント・452 reset・528 使えないメソッド・642 callback・689 effect の無限ループ・733 DI | 2〜4 節。142 の中の 247・260 行目は onlySelf の pristine / untouched を親へ伝えないこと |
| `node/compat/signal_form_control_in_form_group.spec.ts` | 21 `SignalFormControl in FormGroup` › 223 sourceControl・240 onlySelf・259 親との同期（324 配列の fieldTree、373 FormArray） | 2 節。親の `valueChanges` の回数と、兄弟の状態は見ていない |
| `node/compat/compat.spec.ts` | 28 `Forms compat` › 124 検証・230 状態の伝わり方・413 control を出す・556 配列・605 FormGroup・668 FormControl のプロパティを子とみなさない | 6・7 節 |
| `node/compat/extract_value.spec.ts` | 15 `extractValue`（64 行目が b542302a23c の反応の it） | 8 節 |
| `node/normalize_form_args.spec.ts` | （8576f161ae4 には無い。12278e5f67b が足した） | 1 節 |
| `web/signal_form_control_web.spec.ts`・`web/compat_form.spec.ts` | 17 `SignalFormControl (web)`・16 `compatForm with [formField] directive` | `[formField]` と `formControlName` につないだとき |

📄 `走らせたコマンドと結果（8576f161ae4、2026-11-18）`

```
$ cd ~/angular-research/angular
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=SignalFormControl"
Ran 85 of 539 specs / 85 specs, 0 failures
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=extractValue"
Ran 21 of 539 specs / 21 specs, 0 failures
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all "--test_arg=--filter=compat"
Ran 36 of 539 specs / 36 specs, 0 failures

# 作業木（8576f161ae4）で 1 か所ずつ変えて node:test を走らせた結果
signal_form_control.ts 282 行目（pendingParentNotifications++）を消す   539 / 0 failures
signal_form_control.ts 313〜315 行目（DISABLED）を消す                    539 / 1 failure（SignalFormControl validation should support disabled via rules）
extract.ts 102 行目の || isContainerNode(…) を消す                          539 / 2 failures（extractValue filtering … should drop the entire container …）
compat_structure.ts 97〜99 行目（value.update）を消す                      539 / 1 failure（Forms compat allows to use form control values for validation）
```

- **untouched・pristine で兄弟を消さない**なら、`signal_form_control.ts` の touched・dirty の effect（164〜168・182〜186 行目）と `markAsPristine`・`markAsUntouched`（398・403 行目）で、親の `markAsPristine()` ではなく、リアクティブフォームと同じ「親に数え直させる」形にします。足す先は `signal_form_control_in_form_group.spec.ts`（兄弟の `FormControl` を dirty にしてから、の it）。
- **1 回の set で親が 2 回**なら、`wrapFieldTreeForSyncUpdates` に渡す `onUpdate` でも `pendingParentNotifications` を数えるか、#72014 の「最後に知らせた値」の形にします。同じ spec に「親の `valueChanges` を数える」it を足すと、282 行目もいっしょに固まります。
- **compatForm の根の valid**なら、`structure.ts` の遅延の判断（[第 1 回](01-sft-structure.md)）に「compat の子がありうるとき」を入れるか、`CompatFieldAdapter` の側で根の子を先に作ります。足す先は `compat.spec.ts` の `validation`（124 行目）。

## 聞かれそうな質問

**Q. SignalFormControl の値をコードから変えるとき、どれを使えばいいですか？**

`setValue` です。親への知らせが 1 回で済み（223・226 行目と 288〜290 行目）、`onChange` でディレクティブにも届きます（228〜232 行目）。`fieldTree().value.set` は親に 2 回知らせ、`sourceValue.set` は変更検知まで親が古いままです（2 節）。

**Q. なぜ SignalFormControl の updateValueAndValidity は何もしないのですか？**

値も status も signal から getter で読むので（406 行目、status は forms-sf-submit-compat の 7 節）、計算し直して覚えておくものが無いからです。反対に、親を計算し直させるのは子の側の仕事で、2 節の 3 つの道と effect がそれをします。

**Q. FormGroup に SignalFormControl を入れたら、ほかのコントロールの dirty が消えました。なぜですか？**

dirty の effect が最初の 1 回で「pristine」と見て、親の `markAsPristine()` を呼ぶからです（182〜186 行目）。`FormGroup.markAsPristine()` はすべての子を pristine にします。touched も同じです（164〜168 行目）。3 節。

**Q. compatForm の FormGroup の葉で、f.addr.city と書けないのはなぜですか？**

compat のノードは子を持たないからです（`compat_structure.ts` 114〜115・148〜150 行目）。`f.addr().value()` で `{city}` の値は読めます。Proxy の `ownKeys` は値のキーを返すので `Object.keys` には `city` が出ますが、読むと `undefined` です。

**Q. extractValue を computed の中で呼んでも大丈夫ですか？**

今は大丈夫です。b542302a23c で `untracked` をやめ（90 行目）、97〜98 行目の `field()`・`value()` の読み出しに依存が付きます。compat の値は `valueChanges` の写しなので、`FormControl.setValue` で読み直されます。

## 読み終えて

- `SignalFormControl` は子を持たない `AbstractControl` で、値と状態は signal の getter、親への知らせは同期の呼び出しと effect の 2 本立て。`pendingParentNotifications` がその重なりを数える。
- status だけが変わったときは親に知らせない（#72009、PR #72014）。`fieldTree().value.set` は親に 2 回知らせる。
- untouched・pristine を親の `markAs*` で伝えるので、兄弟の `FormControl` の touched・dirty が消える。
- `compatForm` の葉は子を持たず、検証は `statusChanges` の写し。`parseErrors` と `errorSummary` は空（#71633・#71634）、根の `valid()` は子を読むまで葉を見ない。
- 12278e5f67b・9e99093bfe3・97bde8aa6cb・4422f4ef509 は 22.2.6 に入っている。

---

← 前: [proxy と context：f.items\[0\].name と読めるわけ](03-sft-proxy-context.md)  
次: [spec と issue を読む：フィールドの木を固めているテスト](05-sft-tests-issues.md) →
