[目次](../README.md)

# Signal Forms の組み込みの検証：required から minDate まで、1 つの validate に下りるまで

> 共通の形（when・message・error と isEmpty）・数と長さの上限下限と metadata・日付・ValidationError の型・spec と issue

required・min・maxLength・email・pattern・minDate といった Signal Forms の組み込みの検証は、どれも数十行の関数で、最後は validate と metadata の呼び出しに下ります。既存の forms-sf-validation が validate と非同期の検証を、forms-sf-rules-metadata が metadata の仕組みを読んだので、このシリーズはその上に乗る組み込みの検証を 1 つずつ読みます。when・message・error の共通の設定と、空の値を検証しない isEmpty、上限と下限を metadata に載せて \[formField\] の min や maxlength 属性に渡す仕組み、日付の上限下限が MIN の metadata に別の鍵を指させる書き方、エラーの型と既定のメッセージを順に追います。

全 5 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/sfv)

1. [共通の形：when・message・error と、空の値を検証しない isEmpty](01-sfv-common.md)  
   validation/util.ts の BaseValidatorConfig（message と error のどちらか一方、when）、getOption・isEmpty・normalizeErrors、email.ts と pattern.ts が validate に下りるまでの行。空文字・null・false・NaN を検証しない理由と、required だけが空を見る分担（467b37b4b42）、when が email では検証の関数、pattern では metadata の側で評価される違い（df54e6a7b2e）、g フラグの RegExp を pattern に渡すと lastIndex で結果が交互に変わること。
2. [数と長さの上限下限：max・minLength・maxLength と metadata の集約](02-sfv-limits.md)  
   max.ts・min\_length.ts・max\_length.ts が上限を memo の metadata に 1 回だけ計算し、MAX\_NUMBER・MIN\_LENGTH・MAX\_LENGTH の鍵の reducer が複数のルールを厳しい方にまとめる行（エラーはルールごと）、NaN の上限を先に積むと max() と属性が NaN になる順序、getLengthOrSize が文字列・配列・Set を同じに数えるわけ、その metadata を \[formField\] が input の max・maxlength 属性に渡すところ（#69690・#69831・#70600）、組み込みのルールが使わない注入器を作っていた #71623（67e50693274）。
3. [日付の上限下限：minDate・maxDate が MIN の metadata に鍵を指させる](03-sfv-dates.md)  
   min\_date.ts・max\_date.ts の MIN\_MEMO で下限を 1 回だけ計算する行、MIN\_DATE に値を載せ MIN（LimitSelectionKey）には鍵そのもの（LimitKey）を入れる書き方と、それを 2 段で読む FieldNode.min、null と Invalid Date を検証しない分岐と Invalid Date の下限が min() に残る順序、UTC で比べる約束（2a662755113）と input type=date との往復、CVA の経路の日付の属性（189afa9ce5d）。
4. [エラーの型：ValidationError を作る関数とクラス、fieldTree が付くまで](04-sfv-errors.md)  
   validation\_errors.ts の requiredError・minError・emailError など 10 の作り手（fieldTree を渡す形・渡さない形の型と new の 1 行）、kind ごとのクラス（RequiredValidationError ほか）と options の Object.assign を子のフィールドが上書きする順番、message と fieldTree の付き方（addDefaultField がオブジェクトに書き込む）、\[formField\] の parse エラーが展開でクラスを失い instanceof NgValidationError が偽になること、compat/validation\_errors.ts が Reactive Forms のエラーと行き来する行（#71634）。既定のエラーの名前を書いた 45125306905。
5. [spec と issue を読む：組み込みの検証を固めているテスト](05-sfv-tests-issues.md)  
   packages/forms/signals/test/node/api/validators の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で 1 行ずつ変えて見つけた spec が固めていない行（parse エラーのクラス・\_\_brand）、組み込みの検証の issue と PR の表、origin/main の続き。
