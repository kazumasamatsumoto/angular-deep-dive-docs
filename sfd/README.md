[目次](../README.md)

# Signal Forms の \[formField\]：フィールドと DOM の境目

> FormField の全体・ネイティブの要素・parse エラーと validity・カスタムコントロール・ControlValueAccessor との互換・spec と issue

forms シリーズの Signal Forms の章は、スキーマ・検証・メタデータ・送信と、フォームの「中身」を読みました。このシリーズは、その中身を画面の要素につなぐ側、\[formField\] ディレクティブを読みます。1 つの \[formField\] が、相手がネイティブの input か、FormValueControl を実装したコンポーネントか、ControlValueAccessor かを見分け、値・状態・エラーをどの向きにどの時機で流すかを、directive/ の 9 つのファイルと 2026 年の修正（日付の input・radio・number の途中の値・CVA の重複した writeValue・debounce 中の古い書き戻しなど）の順に追います。デモはページの上の本物の @angular/forms/signals 22.2.6 です。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/sfd)

1. [FormField の全体：1 つのディレクティブが相手を見分けるまで](01-sfd-form-field.md)  
   コンパイラが \[formField\] に ɵɵcontrolCreate と ɵɵcontrol を足し、core が素通しと value / checked の model を調べてから、form\_field.ts の FormField が CVA → カスタムコントロール → ネイティブの要素の順に経路を決めるまで（複数の CVA から選ぶ規則を標準の forms の selectValueAccessor に揃えた de56d74da39）、bindings.ts が前回の値と比べて状態を書く行、\[type\] を束縛した input で min / max の判定を最初の更新まで遅らせた 394ad0c2a26、FormRoot とファイル名の変更（f4a5b42ebe6）。
2. [ネイティブの要素：input・select・checkbox・radio の読み書き](02-sfd-native.md)  
   native.ts の getNativeControlValue と setNativeControlValue が input の type と今のモデルの値の型の組で値を読み書きする行、number | null を text の input につなぐ 41b1410cb8a と null の警告（37f3279fe78）の食い違い、属性を先に値を後に書く range の修正（3524de29f34）、打っている途中の数を残す修正とその revert（2e32872720e・7a626175f75）、radio の同期（9e37a58e14b）、select.ts の MutationObserver と文字の変化を捨てる判定（#71443）。
3. [parse エラーと validity：ブラウザの検証をフィールドに戻す](03-sfd-validity.md)  
   parse エラーが 3 つの出す側から FormField の parseErrorsSource に入り、FormField.parseErrors（f43bad4d7b7 の shallowArrayEquals）を通ってフィールドの errors() に並ぶまで、validity.badInput を parse エラーにする行、input\_validity\_monitor.ts が :valid / :invalid のアニメーションの animationstart で input イベントの無い変化を拾う仕組みとリスナーの外し忘れの修正（6cc54e5edef）、transformed\_value.ts の transformedValue、同じフィールドの別の要素に parse エラーが届く #71632 と \[formControl\] での 1 回遅れ（#71127）。
4. [カスタムコントロール：FormValueControl と FormCheckboxControl](04-sfd-custom-control.md)  
   api/control.ts のインターフェースが求める value・checked の model と任意の 16 個の input・touch・focus()・reset()、control\_custom.ts がそれらにどう値と状態を書き、valueChange と touch を受け取るか（フォームからの書き込みは input としてなので model の subscribe は呼ばれない、#71679）、reset の伝わり方（849dba6c650）、debounce('blur') と touch の output（12fcec8ce90）、transformedValue を使う入れ子の form()（#70692）と custom radio（#69782）。
5. [ControlValueAccessor との互換：古いコントロールを \[formField\] で使う](05-sfd-cva.md)  
   control\_cva.ts と interop\_ng\_control.ts が CVA に registerOnChange・registerOnTouched・writeValue・setDisabledState をどの順で呼ぶか（標準の forms と逆の順）、writeValue の重複を減らす修正（2e9aeea0fed）とそれが生んだ debounce 中の古い書き戻しの修正（2e0cb52dbf0）、NG\_VALIDATORS を parseErrors に入れる橋（f9f24fc6699）、空でない name の input には書かない修正（38861ac41bb）とその穴、InteropNgControl に無いメンバー（#69678）、CVA の中の \[pattern\] の問題（#68246）。
6. [spec と issue を読む：\[formField\] を固めているテスト](06-sfd-tests-issues.md)  
   packages/forms/signals/test の web（350 本）と node（539 本）の spec のうち、directive/ の約束を固めているものの地図、BUILD.bazel の target と act の読み方、手元での走らせ方と結果（Chromium・Firefox・node）、\[formField\] に関係する開いている 25 件と閉じた 38 件の issue の章ごとの表と、閉じ方の傾向。
