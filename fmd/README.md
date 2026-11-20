[目次](../README.md)

# Forms の説明文の読み残し

> AbstractControl・FormGroup・FormArray・FormControl・FormBuilder・Validators と、NgControl・リアクティブとテンプレートのディレクティブ・ControlValueAccessor の説明文を、本物の動きと突き合わせる

「Forms の内側」では、値と状態が伝わる流れの行を読みました。それでも packages/forms/src には、1 行も引いていない行が六千行近く残っています。大半は、AbstractControl・FormGroup・Validators・各ディレクティブに付いた説明文（JSDoc）と例のコードで、これは angular.dev の API リファレンスにそのまま載ります。説明と実装が食い違えば、フォームを書く人はみな同じ思い違いをします。このシリーズでは説明文を 1 段落ずつ読み、そこに書かれた約束を本物の @angular/forms を動かして確かめ、最後に spec と issue を読みます。

全 10 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/fmd)

1. [AbstractControl の説明文：値・状態・イベントの約束](01-fmd-abstract-model.md)  
   model/abstract\_model.ts の未読の行：status の 4 つの値と各フラグ、validator の getter、events・valueChanges の順番の約束、markAs\*・disable・enable の onlySelf と emitEvent、get のパスの形、getError と hasError、setErrors の例。説明に書かれた約束を本物で確かめる。
2. [FormGroup・FormRecord・FormArray の説明文](02-fmd-group-array.md)  
   model/form\_group.ts と form\_array.ts の未読の行：クラスの説明の例（strict に通るか）、addControl・setControl・contains、setValue・patchValue・reset の opts、FormRecord の reset、FormArray の at・insert・removeAt・setControl の負の添字と clear。
3. [FormControl と FormBuilder の説明文](03-fmd-control-builder.md)  
   model/form\_control.ts と form\_builder.ts の未読の行：FormControlOptions と nonNullable、defaultValue と reset、registerOnChange、FormBuilder・NonNullableFormBuilder・UntypedFormBuilder の group・control・array・record の型と例。
4. [Validators とバリデーターのディレクティブの説明文](04-fmd-validators.md)  
   validators.ts と directives/validators.ts の未読の行：NG\_VALIDATORS の例、required・requiredTrue・min・max・email・minLength・maxLength・pattern・compose の説明と例を境界の入力で試し、required・minlength・max・pattern・email のディレクティブが属性をどう読むかを本物で確かめる。
5. [エラーの文言と小道具：reactive\_errors・template\_driven\_errors・shared](05-fmd-errors.md)  
   directives/reactive\_errors.ts・template\_driven\_errors.ts・error\_examples.ts・errors.ts・shared.ts・util.ts の未読の行：例外と警告の文と例、番号の正と負、shared.ts のトークンと小道具。わざと誤った使い方をして開発モードの本物の文を記録し、本番で何が残るかと並べる。
6. [NgControl と AbstractControlDirective の説明文](06-fmd-ng-control.md)  
   directives/ng\_control.ts・abstract\_control\_directive.ts・ng\_control\_status.ts・form\_interface.ts・control\_value\_accessor.ts の未読の行：ディレクティブから control の状態を読む getter と path、ng-\* のクラスが付く順、Form インターフェース、ControlValueAccessor の説明文の例、v22 で入った「CVA の無いカスタムコントロールに \[formControl\] を付けたとき」の NgControl の道（ngControlCreate・ngControlUpdate・parse のエラー）。
7. [リアクティブフォームのディレクティブの説明文](07-fmd-reactive-dirs.md)  
   directives/reactive\_directives の form\_group\_name.ts・abstract\_form.directive.ts・form\_control\_name.ts・form\_control\_directive.ts と form\_providers.ts の未読の行：formGroupName・formArrayName・formControlName・\[formControl\]・\[formArray\] の説明文と例のアプリ、ReactiveFormsModule.withConfig、disabled 属性と ngModel の警告がいつ何回出るか。
8. [テンプレート駆動フォームのディレクティブの説明文](08-fmd-template-dirs.md)  
   directives/ng\_form.ts・ng\_model.ts・ng\_model\_group.ts・ng\_no\_validate\_directive.ts の未読の行：NgForm の submitted と reset、ngFormOptions と ngModelOptions（name・standalone・updateOn）、NgModelGroup の親、novalidate。例のアプリを本物で動かし、値がいつ入るかを 3 つの時点で読む。
9. [値のアクセサーの説明文：select・radio・既定のアクセサー](09-fmd-accessors.md)  
   directives の select\_control\_value\_accessor.ts・select\_multiple\_control\_value\_accessor.ts・radio\_control\_value\_accessor.ts・default\_value\_accessor.ts ほかの未読の行：compareWith、ngValue と value、radio の name、IME の合成中の扱い。
10. [spec と issue を読む：Forms の説明文を固めているもの](10-fmd-tests-issues.md)  
   packages/forms/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、area: forms の開いている issue のうち説明文に当たるものの表と、このシリーズで見つけた食い違い。
