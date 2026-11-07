[目次](../README.md)

# フォームの内側

> AbstractControl の木から Signal Forms まで、テストの場所と一緒に

@angular/forms には 3 つの API があります。FormControl の木を自分で組むリアクティブフォーム、テンプレートに ngModel を書くテンプレート駆動フォーム、そして signal を根にする Signal Forms。このシリーズは、値と状態を持つ AbstractControl の木、updateValueAndValidity が検証と状態を親へ伝える順番、入力欄と木をつなぐ ControlValueAccessor と setUpControlValueAccessor の配線、ディレクティブ、そして Signal Forms のスキーマと検証までを、実際の行で 1 つずつ読みます。各章の最後に「この仕組みのテストはどこにあり、手元でどう 1 本走らせ、直すならどのファイルか」を置きます。最終回は forms の issue と最近マージされた PR を読み、どこから関わっていくかを考えます。

全 20 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/forms)

1. [forms の全体像：3 つの API と packages/forms の地図](01-forms-overview.md)  
   リアクティブ・テンプレート駆動・Signal Forms の 3 つが同じパッケージのどこにあるか（src/model・src/directives・signals/）、エントリポイント（@angular/forms と @angular/forms/signals、compat）、ReactiveFormsModule と FormsModule が何を宣言するか。テストの置き場所（test/ の \*\_spec.ts、signals/test/node と web）と bazel のターゲット、このマシンで走らせた件数と時間。
2. [AbstractControl：値と状態を持つ木の節](02-forms-abstract-control.md)  
   FormControl・FormGroup・FormArray の共通の親 AbstractControl が持つもの（value、status、pristine / touched、errors、parent、validator）。status・pristine・touched が内部では signal で持たれ、getter は untracked で読み、\_status などの computed をテンプレートの状態クラスが読む仕組み。markAsTouched / markAsDirty が親へ伝わる順。
3. [updateValueAndValidity：値と検証が親へ伝わる全手順](03-forms-update-value-validity.md)  
   setValue のあとに呼ばれる updateValueAndValidity の中身を 1 行ずつ（\_setInitialStatus → \_updateValue → \_runValidator → \_calculateStatus → \_runAsyncValidator → 親の updateValueAndValidity）。onlySelf と emitEvent の効き方、disabled の子が値と状態から外れる理由、valueChanges が親より子で先に出る順番。
4. [Validators：同期の検証関数と errors の合成](04-forms-validators.md)  
   validators.ts の required・minLength・pattern などが返す ValidationErrors の形、空の値を「検証しない」扱いにする行（email・pattern は isEmptyInputValue、minLength は自分の長さの判定、min は parseFloat の NaN）、compose と mergeErrors で複数の検証をまとめる行（後ろ勝ち・空なら null。単体で渡すと合成されず {} が INVALID になる）、normalizeValidators が Validator オブジェクトを関数に直す理由、hasValidator が参照の一致で探すこと。
5. [非同期の検証：PENDING と打ち切り](05-forms-async-validators.md)  
   \_runAsyncValidator が status を PENDING にし、Promise も Observable も toObservable でそろえ、値が 1 つ届いたら setErrors で確定する流れ。値が変わると前の購読を \_cancelExistingSubscription で捨てる行（debounce はこれを使って自分で書く）、複数の非同期検証を forkJoin で待つ合成（配列で渡すと complete が必要になる）、同期の検証が失敗していると非同期は走らない理由。
6. [events：状態の変化を 1 本の Observable で受ける](06-forms-control-events.md)  
   AbstractControl.events が流す ValueChangeEvent・StatusChangeEvent・PristineChangeEvent・TouchedChangeEvent・FormSubmittedEvent・FormResetEvent と、それぞれが出る行。source が「変化を起こした control」を指す仕組み（sourceControl を親へ渡す）と、disable / enable から上った値と状態のイベントだけは親自身が source になる例外。valueChanges / statusChanges との関係、emitEvent: false で止まるものと、\_updateTouched・\_updatePristine のように止まらないもの。
7. [FormGroup と FormArray：子を束ねる](07-forms-form-group-array.md)  
   FormGroup の controls と \_forEachChild、\_updateValue が enabled な子だけで value を組み立てる行、getRawValue、setValue と patchValue の違い（assertAllValuesPresent・assertControlPresent）、addControl / removeControl / setControl が \_registerOnCollectionChange と \_onCollectionChange を呼ぶ理由。FormArray の push・insert・removeAt と負の添字（\_adjustIndex）、FormRecord。
8. [型付きフォームと FormBuilder](08-forms-typed-forms.md)  
   FormControl&lt;T&gt; の型引数と nonNullable（reset が初期値に戻るか null になるか）、FormGroup の値の型を作る ɵFormGroupValue・ɵRawValue などの型の計算、UntypedFormControl が any の別名であること。FormBuilder の group / control / array の引数の解釈と、NonNullableFormBuilder（fb.nonNullable）。
9. [ControlValueAccessor：入力欄と control の通訳](09-forms-value-accessor.md)  
   writeValue・registerOnChange・registerOnTouched・setDisabledState の 4 つの約束、NG\_VALUE\_ACCESSOR トークン、BaseControlValueAccessor と BuiltInControlValueAccessor、DefaultValueAccessor が input イベントと IME の compositionstart / compositionend を扱う行。selectValueAccessor が「組み込み・既定・自作」の中から 1 つを選ぶ順番。
10. [setUpControlValueAccessor：control と入力欄を双方向につなぐ配線](10-forms-setup-control.md)  
   directives/shared.ts の setUpControlValueAccessor が行う手順（setUpValidators → writeValue → setDisabledState → setUpViewChangePipeline → setUpModelChangePipeline → setUpBlurPipeline → setUpDisabledChangeHandler）。updateOn が change / blur / submit のときの \_pendingValue と \_pendingChange、emitModelToViewChange で入力欄に書き戻さない理由、cleanUpControl の後片付け。
11. [組み込みの value accessor：checkbox・number・select・radio](11-forms-builtin-accessors.md)  
   CheckboxControlValueAccessor、NumberValueAccessor・RangeValueAccessor の文字列から数への変換、SelectControlValueAccessor が NgSelectOption の ngValue を自分の \_optionMap（id → 値）に登録し、compareWith で選ばれた項目を探す行、SelectMultipleControlValueAccessor、RadioControlValueAccessor が RadioControlRegistry で同じ親・同じ name のボタンをそろえる仕組み。
12. [リアクティブのディレクティブ：formControl・formGroup・formControlName](12-forms-reactive-directives.md)  
   FormControlDirective が ngOnChanges で setUpControlValueAccessor を呼ぶ行、FormGroupDirective（AbstractFormDirective）が子のディレクティブを directives の配列で持ち、form が差し替わると \_updateDomValue で付け直す仕組み、FormControlName が ControlContainer から自分の control を探す手順、ngSubmit と submitted、formControlName に対応する control が無いときのエラー。
13. [テンプレート駆動：NgModel と NgForm の非同期な登録](13-forms-ng-model.md)  
   NgModel が自分で値 null の FormControl を作り、NgForm への登録（addControl）と値の書き込み（\_updateValue）をどちらも resolvedPromise.then で 1 拍遅らせる仕組み。遅らせる理由（#m="ngModel" をテンプレートの前で読む式に、markForCheck でもう 1 回の変更検知を届ける。ng\_model.ts のコメント）と、そのせいで ngOnInit で form.value が空・writeValue が null で 1 回多く呼ばれること。ngModelChange が viewToModelUpdate から出る行、name と ngModelOptions（standalone・name・updateOn）、NgModelGroup、\_checkForErrors のエラーと子コンポーネントの警告。リアクティブとの違いを同じ入力で比べる。
14. [検証のディレクティブ：required 属性が Validators になるまで](14-forms-validator-directives.md)  
   RequiredValidator・MinLengthValidator・PatternValidator などが NG\_VALIDATORS に multi で自分を足し、setUpValidators で control の検証関数に合成される流れ。AbstractValidatorDirective の ngOnChanges と \_onChange（入力が変わると検証をやり直す）、enabled、自作の Validator と registerOnValidatorChange。
15. [状態クラス：ng-valid・ng-touched・ng-submitted が付くまで](15-forms-status-classes.md)  
   NgControlStatus と NgControlStatusGroup のホストバインディングが AbstractControlStatus の getter を読み、getter が \_status・\_touched・\_pristine などの signal を読むことで、zoneless でもクラスが更新される仕組み。ng-pending、ng-submitted が form にだけ付く理由。
16. [Signal Forms のスキーマ：schema・apply・applyWhen が作るロジックの木](16-forms-sf-schema.md)  
   form(model, schemaFn) に渡した関数が schema / path を通して何を記録するか。FieldPathNode と LogicNode（schema/logic\_node.ts・path\_node.ts）がルールを木として持ち、apply・applyEach・applyWhen・applyWhenValue が子や条件付きのロジックを継ぎ足す仕組み、値の木（FieldNode）とロジックの木が出会う場所。
17. [Signal Forms の検証：validate・validateAsync・Standard Schema](17-forms-sf-validation.md)  
   validate と組み込みのルール（required・min・pattern など）が返すエラーの形（validation\_errors.ts）、子孫にエラーを配る validateTree、validateAsync がフィールドごとの resource でサーバーに聞き 'pending' を経てエラーになる流れと validateHttp、Zod などの Standard Schema をつなぐ validateStandardSchema。エラーがどのフィールドに付くか（fieldTree の指定）。
18. [Signal Forms の状態ルール：disabled・hidden・readonly と metadata](18-forms-sf-rules-metadata.md)  
   disabled・hidden・readonly が LogicNodeBuilder にルールを足し、FieldNode の状態（state.ts）が親の状態と合わせて computed で決まる仕組みと、3 つが検証・touched・dirty を止める行。metadata と createMetadataKey で required や min のような情報を入力欄（\[formField\]）に渡す流れ、debounce ルール。
19. [Signal Forms の submit と、リアクティブフォームとの相互運用](19-forms-sf-submit-compat.md)  
   submit() が全フィールドを touched にし、既定では invalid でなければ（pending は待たずに）action を走らせ、サーバーのエラーをフィールドに戻す流れ（api/structure.ts・field/submit.ts）。compat パッケージの compatForm がリアクティブの FormControl を Signal Forms の木に入れる仕組みと、SignalFormControl が逆に Signal Forms を AbstractControl として見せる仕組み。
20. [forms の issue と PR を読む：どこから関わるか](20-forms-issues.md)  
   area: forms と forms: \* のラベルで open の issue 159 件を分け、forms: signals が半数を超えることと、state: confirmed のまま残る古い issue（#14988・#48350 など）がこのシリーズのどの回の行の話かを読む。最近マージされた forms の PR 30 本の大きさと種類（docs / test / fix / refactor / perf）を並べ、小さな変更が多いことを見る。issue を手元の spec で再現する下書きと、コメントで役に立つ書き方。2026-11-01 時点のスナップショット。
