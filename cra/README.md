[目次](../README.md)

# core の説明文の読み残し（2）

> ApplicationRef・platform・ViewContainerRef・signal の input/output/クエリ・NgZone・ErrorHandler・DebugElement・サニタイズの説明文を、本物の動きと突き合わせる

「core の説明文の読み残し」では DI・デコレーター・変更検知の説明文を読みました。packages/core/src にはまだ、ApplicationRef・bootstrap・ViewContainerRef・TemplateRef・input()・model()・output()・viewChild()・NgZone・ErrorHandler・DebugElement・DomSanitizer などの説明文（JSDoc）と例が、1 行も引かれないまま残っています。このシリーズでは説明文を 1 段落ずつ読み、そこに書かれた約束を本物の @angular/core を動かして確かめ、最後に spec と issue を読みます。

全 10 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/cra)

1. [ApplicationRef とアプリのトークンの説明文](01-cra-app-ref.md)  
   application/application\_ref.ts・application\_tokens.ts・application\_init.ts・stability\_debug\_impl.ts・tracing.ts の未読の行：isStable・tick・attachView・bootstrap・whenStable の約束、APP\_ID・APP\_INITIALIZER・provideAppInitializer・provideStabilityDebugging の説明と例。
2. [platform と bootstrap の説明文](02-cra-platform.md)  
   platform/platform.ts・platform\_ref.ts・bootstrap.ts・application/platform\_tokens.ts・application\_ngmodule\_factory\_compiler.ts の未読の行：createPlatform・destroyPlatform・PlatformRef.bootstrapModule の options（v21 から読まれない ngZone）、PLATFORM\_INITIALIZER と SSR の 3 つのトークンの説明と、何度 platform を作れて何度 bootstrap できるか。
3. [ViewContainerRef・TemplateRef・ViewRef・ElementRef の説明文](03-cra-view-container.md)  
   linker/view\_container\_ref.ts・template\_ref.ts・view\_ref.ts・element\_ref.ts の未読の行：createEmbeddedView と createComponent の options、insert・move・detach・indexOf の添字の約束、ElementRef の注意書き。本物の ViewContainerRef で例を動かす。
4. [QueryList・DestroyRef・ComponentRef・Compiler の説明文](04-cra-linker-misc.md)  
   linker/query\_list.ts・destroy\_ref.ts・component\_factory.ts・compiler.ts・ng\_module\_factory\_loader.ts ほかの未読の行：QueryList の changes と dirty、DestroyRef.onDestroy の戻り値、v22 で公開 API から外れた ComponentFactory が説明に残る ComponentRef と、非推奨の Compiler・getModuleFactory が今どう動くか。
5. [input()・model()・output() の説明文](05-cra-signal-io.md)  
   authoring/input/\*・model/\*・output/\* の未読の行：required と alias と transform、model の双方向の約束、output と outputFromObservable・OutputEmitterRef の destroy の後の emit。説明文の例を strictTemplates に通し、本物で動かす。
6. [viewChild()・contentChild() ほか signal のクエリの説明文](06-cra-signal-queries.md)  
   authoring/queries.ts の未読の行：viewChild・viewChildren・contentChild・contentChildren の required・read・descendants、値が入る時と required の例外、例のコード。
7. [NgZone・ErrorHandler・EventEmitter・PendingTasks の説明文](07-cra-zone-errors.md)  
   zone/ng\_zone.ts・error\_handler.ts・event\_emitter.ts・pending\_tasks.ts・testability/testability.ts・transfer\_state.ts の未読の行：run・runTask・runGuarded と onStable・isStable の約束、v22 で動かなくなった NgZone の例、ErrorHandler が届く injector、EventEmitter の async と error、PendingTasks.run、TransferState の鍵、Testability.whenStable。
8. [DebugElement と DebugNode の説明文](08-cra-debug.md)  
   debug/debug\_node.ts の未読の行：nativeElement・componentInstance・injector・listeners・triggerEventHandler・query と queryAll の約束、By の述語。本物の TestBed なしで getDebugNode を使って確かめる。
9. [サニタイズの公開 API の説明文：DomSanitizer の約束と SecurityContext](09-cra-sanitize.md)  
   sanitization/dom\_security\_schema.ts・bypass.ts・sanitization.ts・html\_sanitizer.ts・inert\_body.ts と platform-browser の DomSanitizer の未読の行：SecurityContext の各値がどの属性に当たるか、DomSanitizer.sanitize と bypassSecurityTrust\* が何を約束し何を約束しないか、開発モードの警告。安全な使い方の側から読む。
10. [spec と issue を読む：core の説明文（2）を固めているもの](10-cra-tests-issues.md)  
   packages/core/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、area: core の開いている issue のうち説明文に当たるものの表と、このシリーズで見つけた食い違い。
