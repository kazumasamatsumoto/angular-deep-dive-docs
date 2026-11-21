[目次](../README.md)

# core の説明文の読み残し

> @Directive・@Component・クエリ・NgModule の型と、DI・ライフサイクル・differ・スケジューラーの説明文を、本物の動きと突き合わせる

これまでのシリーズで、@angular/core の DI・変更検知・コンポーネントの作られ方は動く行を読みました。それでも packages/core/src の di・metadata・change\_detection には、1 行も引いていない行が六千行近く残っています。大半は、@Component の各プロパティ・inject・Provider の形・ライフサイクルのインターフェース・IterableDiffer などに付いた説明文（JSDoc）と例のコードで、これは angular.dev の API リファレンスにそのまま載ります。このシリーズでは説明文を 1 段落ずつ読み、そこに書かれた約束を本物の @angular/core を動かして確かめ、最後に spec と issue を読みます。

全 10 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/crd)

1. [@Directive の説明文：selector・inputs・host・providers・exportAs](01-crd-directive.md)  
   metadata/directives.ts の Directive の未読の行：selector の書ける形、inputs と outputs の文字列の形、host の書き方、providers、exportAs、queries、standalone、hostDirectives の説明と例。説明の約束を本物で確かめる。
2. [@Component の説明文：テンプレート・スタイル・変更検知・カプセル化](02-crd-component.md)  
   metadata/directives.ts の Component と Pipe・Input・Output・HostBinding・HostListener の未読の行、view.ts と resource\_loading.ts：changeDetection（OnPush の既定とデコレーターの Eager）、viewProviders、template と templateUrl、encapsulation、preserveWhitespaces、@Input の transform と alias、@HostListener の args と返り値、JIT の resolveComponentResources。
3. [クエリのデコレーターと @NgModule の説明文](03-crd-query-module.md)  
   metadata/di.ts（Attribute・ContentChildren・ContentChild・ViewChildren・ViewChild）と metadata/ng\_module.ts・do\_bootstrap.ts の未読の行：selector と descendants と read と static と emitDistinctChangesOnly の約束と例、NgModule の providers の例、ModuleWithProviders の forRoot を importProvidersFrom で、ngDoBootstrap。
4. [@Injectable・InjectionToken・forwardRef の説明文](04-crd-injectable-token.md)  
   di/injectable.ts・injection\_token.ts・forward\_ref.ts・service.ts・jit/injectable.ts・jit/service.ts の未読の行：providedIn の各値、factory つきの InjectionToken、forwardRef と resolveForwardRef の例、v22 の @Service、JIT のときの作られ方。
5. [Provider の形の説明文：useClass・useValue・useFactory・useExisting・multi](05-crd-provider.md)  
   di/interface/provider.ts・interface/defs.ts・provider\_collection.ts の未読の行：各 Provider の型の説明と provider\_spec.ts の例、deps の書き方、multi、importProvidersFrom、makeEnvironmentProviders、provideEnvironmentInitializer、ɵprov の形と、開発モードだけで確かめている誤り。
6. [inject と Injector の説明文：フラグ・注入の文脈・Injector.create](06-crd-inject.md)  
   di/injector\_compatibility.ts・metadata.ts・metadata\_attr.ts・injector.ts・r3\_injector.ts の未読の行：inject の options（optional・self・skipSelf・host）、注入の文脈の外で呼んだとき、@Optional ほかのデコレーター、Injector.create と destroy。
7. [ライフサイクルの説明文：OnChanges・DoCheck・AfterView・ChangeDetectorRef](07-crd-lifecycle.md)  
   change\_detection/lifecycle\_hooks.ts・simple\_change.ts・change\_detector\_ref.ts・constants.ts の未読の行：各フックの呼ばれる時と例（OnPush の子の ngDoCheck・ngAfterViewChecked）、SimpleChange の previousValue と firstChange、markForCheck・detach・detectChanges・reattach の約束、既定が OnPush になったことと公開 API から消えた checkNoChanges。
8. [IterableDiffer と KeyValueDiffer の説明文](08-crd-differs.md)  
   change\_detection/differs/\*（default\_iterable\_differ.ts・default\_keyvalue\_differ.ts・iterable\_differs.ts・keyvalue\_differs.ts）の未読の行：diff の約束、forEach\* の順と添字、TrackByFunction、extend の例。本物の differ に配列と Map を通す。
9. [変更検知のスケジューラーの説明文：provideZoneChangeDetection と zoneless](09-crd-scheduling.md)  
   change\_detection/scheduling/ng\_zone\_scheduling.ts・zoneless\_scheduling\_impl.ts の未読の行：provideZoneChangeDetection と bootstrapModule、eventCoalescing と runCoalescing、provideZonelessChangeDetection が挙げる 7 つの API と NG0914・NG0408 の警告。小さなアプリの tick を数えた記録で確かめる。
10. [spec と issue を読む：core の説明文を固めているもの](10-crd-tests-issues.md)  
   packages/core/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、area: core の開いている issue のうち説明文に当たるものの表と、このシリーズで見つけた食い違い。
