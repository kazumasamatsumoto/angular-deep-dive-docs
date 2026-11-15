[目次](../README.md)

# @angular/upgrade の内側：AngularJS と 1 つのページを分け合う

> 全体と起動・downgradeComponent・UpgradeComponent・注入器と変更検知・downgradeModule・spec と issue

@angular/upgrade は、AngularJS（1.x）のアプリを少しずつ Angular に移すために、2 つのフレームワークを同じページで動かす部品です。このシリーズではまだ 1 度も読んでいなかったこのパッケージ（約 3500 行）を、UpgradeModule がどの順で 2 つを起動するか、AngularJS のディレクティブの中に Angular のコンポーネントを作る downgradeComponent、その逆の UpgradeComponent、注入器と変更検知の橋、遅延で読む downgradeModule の順に読みます。signal の input や model()、zoneless への対応、2026 年の修正まで、今も手が入っている場所を、本物の @angular/upgrade と AngularJS 1.8 を Node で動かした記録と一緒に追います。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/upg)

1. [全体と起動：UpgradeModule.bootstrap が 2 つを順に起こす](01-upg-bootstrap.md)  
   パッケージの形（3 つの入口と、static が ɵ の名前空間で使う src/common）、AngularJS を window.angular から 1 つの変数に取る angular1.ts、UpgradeModule の constructor と bootstrap が AngularJS のモジュールを 2 つ作り angular.bootstrap を NgZone の中で呼ぶ順、angular1\_providers の一時変数で $injector を Angular の注入器へ渡す橋と、早く引いたときの NG0200、消えた UpgradeAdapter（f86846555bb）と export から外れた getAngularLib（01a179577b5）。AngularJS 1.8.3 と @angular/upgrade 22.1.6 を Node で起動した記録を 1 段ずつ再生する。
2. [downgradeComponent：AngularJS のディレクティブの中に Angular のコンポーネントを作る](02-upg-downgrade-component.md)  
   downgradeComponent が返す terminal なディレクティブの定義、link が親の注入器を探して ParentInjectorPromise を置く順、DowngradeComponentAdapter がコンポーネントを作り、属性を $observe / $watch でつなぎ、ngOnChanges と detectChanges を自分の watcher で呼び、output を購読する順、signal の input（5f56a658375）と model()（8d31b82116c）を applyValueToInputSignal で書く行と transform を通らないこと、output emitter（cd7c170763b）と #48032 の今、投影の照合と番号の並べ替え、中身をもう一度コンパイルしていた問題の修正（angular-main の b2d3ba9f5f0、22.2.4 などへ backport）。
3. [UpgradeComponent：Angular の中で AngularJS のディレクティブを動かす](03-upg-upgrade-component.md)  
   UpgradeComponent を継承したディレクティブが、UpgradeHelper で AngularJS のディレクティブの定義（name + 'Directive'）とテンプレート（template か $templateCache）を取り、ngOnInit の中で controller を作り $onChanges・$onInit・$doCheck・link・$postLink をこの順に呼ぶこと、$doCheck は $digest から・$onDestroy は ngOnDestroy から呼ばれること、= &lt; @ & の束縛の表と ngDoCheck での = の戻り、require と多スロットの transclusion の扱い。
4. [注入器と変更検知：downgradeInjectable・$digest の橋・zone と zoneless](04-upg-injection-cd.md)  
   downgradeInjectable が AngularJS の factory になる行、2 つの注入器が互いを探す順（どちらも相手の注入器を名前で 1 回引くだけ）、UpgradeModule の NgModule が NgZone を provide する行（d9e597f3418）、onMicrotaskEmpty か afterTick から $rootScope.$digest を呼ぶ橋と、AngularJS 側の変化が downgrade したコンポーネントの $watch で Angular に届く仕組み、zoneless の混在アプリ（900cd37f68c）、Testability と $interval の橋、#67368（子の注入器に別の NgZone ができる）、trusted\_types の使われ方。
5. [downgradeModule：Angular の側を後から起こす](05-upg-downgrade-module.md)  
   downgradeModule が $$UpgradeModule.lazyN という AngularJS のモジュールを作り、最初の downgrade したコンポーネントの link で呼ばれる factory の中でだけ Angular を起動する行、複数の downgradeModule の名前と数え方、SyncPromise（promise\_util.ts、c1ae6124c83）で同期に作る理由、zone を既定にした 3 つのコミットと 2a7a5de53fd、UpgradeModule との違い（起動の順・ゾーン・$digest の持ち方）。
6. [spec と issue を読む：upgrade を固めているテスト](06-upg-tests-issues.md)  
   src/common/test と static/test/integration と static/testing の spec の地図、withEachNg1Version が AngularJS 1.5〜1.8 を読み替えて 4 回走らせる仕組みと ng\_web\_test\_suite、手元での走らせ方と結果（38・626・12）、createAngularTestingModule・createAngularJSTestingModule の中身と #34670、保守モードの注（be7ee3a68b2）、$locationShim と #67153、area: upgrade の issue と PR の表。
