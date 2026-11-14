[目次](../README.md)

# hostDirectives と継承（features）

> features の並びと実行・継承で def を混ぜる行・継承のコンパイル・host directive の重複の解消・providers と入出力・spec と issue

hostDirectives が standalone に限られる理由と、ɵɵHostDirectivesFeature の大筋は standalone シリーズの「hostDirectives が standalone 限定である理由」で読みました。このシリーズでは、def に貼られる features という仕組みそのものと、もう 1 つの大きな feature である継承（ɵɵInheritDefinitionFeature）、そして 2026 年に入った host directive の重複の解消や providers の修正を、コミットと spec と一緒に 1 つずつ読みます。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/hdi)

1. [features とは何か：コンパイラが並べ、defineComponent が順に呼ぶ](01-hdi-features-pipeline.md)  
   コンパイラの addFeatures が ProvidersFeature・HostDirectivesFeature・InheritDefinitionFeature・NgOnChangesFeature・ControlFeature・ExternalStylesFeature をどの条件でどの順に並べるか、ɵɵdefineComponent が def を作ったあとで features を 1 つずつ呼ぶ行、各 feature が def に書く欄。v22.1 の ɵɵNgOnChangesFeature は def に何も書かず、ngOnChanges の仕組みは最初の作成パスで作られること、そのために mixin の ngOnChanges が本番ビルドで落ちる再現。本物の @angular/compiler で features の配列を出し、ページの上で順を入れ替えた def を作る。
2. [継承の実行時：ɵɵInheritDefinitionFeature が親の def を混ぜる](02-hdi-inherit-runtime.md)  
   ɵɵInheritDefinitionFeature が static の鎖を上がり、Object.hasOwn で親自身の def だけを拾う行、inputs・outputs・hostBindings・クエリ・hostAttrs・hostVars・アニメーションの合わせ方、親の features のうち ngInherit を持つものだけを子に呼び直す行、同じ祖先を 2 回混ぜないための shouldInheritFields。汚された prototype への対策（e6953793542）を作業木で前の形に戻し、飾りのない中間のクラスで同じ def が 2 回混ざっていたことも確かめる。ページの上の本物の 3 段の継承で、混ぜられた def を読む。
3. [継承のコンパイル：usesInheritance、飾りのない親、ɵfac の受け継ぎ](03-hdi-inherit-compile.md)  
   ngtsc・部分コンパイル・リンカー・JIT が usesInheritance を「extends がある」だけで決める行、飾りのない親が Angular の機能を使うときの NG2007 と、findInheritedCtor が親のコンストラクタをたどって NG2006 を出す行、子にコンストラクタが無いときの ɵfac、JIT が飾りのない親に def を付ける addDirectiveDefToUndecoratedParents と、新しい本家の修正 2adfdf0f73b（作業木で前後を走らせる）。compiler-cli 22.1.6 で 9 つの書き方をコンパイルした記録を再生する。
4. [host directive の重複の解消：同じディレクティブが何度も当たるとき](04-hdi-host-dedupe.md)  
   同じディレクティブが 1 つの要素に何度も当たるとき、テンプレートで当たったものを残して host directive の分を捨て、host directive どうしは入出力の露出を 1 つに合わせる仕組み（コンパイラは 57432f1b6a8、実行時は 9c55fcb3e65。#57846）。合わせられないときの NG8024（型チェックが降りた要素だけ）と NG0312（開発モードの実行時だけ）の違いと、実行時の合わせた結果が def に残ること。ページの上の本物で作って数え、コンパイラの診断は記録で見る。
5. [host directive の providers と入出力：注入器と配線の細部](05-hdi-host-providers-bindings.md)  
   host directive の providers があると viewProviders が host: true で取れなかった不具合の修正（886cf6c452a）、host directive の入力の別名と静的な属性の初期値の配線（setupHostDirectiveInputsOrOutputs・setupInitialInputs）、特定のディレクティブに届ける inputBinding / outputBinding の範囲の判定、ホストと host directive の host バインディングとライフサイクルの順。ページの上の本物で、子から inject した値とノードの上の並びを読む。
6. [spec と issue を読む：hostDirectives と継承を固めているテスト](06-hdi-tests-issues.md)  
   core/test/acceptance の host\_directives\_spec.ts と inherit\_definition\_feature\_spec.ts、compiler の binding\_spec.ts、compiler-cli の ngtsc の spec と compliance が、このシリーズの各章の約束をどこで固めているか。手元での走らせ方と結果。hostDirectives と継承に関係する開いている issue と閉じた issue の表と、数で見る傾向。
