[目次](../README.md)

# 起動の全手順

> ng serve と打ってから最初の画面が出るまで

ターミナルで ng serve と打つ。数秒後にブラウザに画面が出る。その間に CLI・ビルダー・ブラウザ・Angular 本体のどこで何が起きているかを、1 ステップずつ追います。

全 13 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/boot)

1. [「ng serve」と打った直後に動くもの](01-boot-ng-command.md)  
   bin/ng.js → bootstrap.js → lib/init.ts → lib/cli → runCommand。グローバルにインストールした CLI が、プロジェクト内の CLI に処理を委ねる仕組みまで。
2. [angular.json から builder を探し出す](02-boot-architect.md)  
   ServeCommandModule → ArchitectCommandModule.run → runSingleTarget → Architect.scheduleTarget。「@angular/build:dev-server」という文字列が、どうやって 1 つの関数に変わるのか。
3. [dev-server builder と Vite](03-boot-dev-server.md)  
   execute → initialize → serveWithVite。ビルド結果をディスクに書かず、メモリから配信する仕組み。ポート確認やホスト警告もここで出ている。
4. [application builder：esbuild と Angular コンパイラ](04-boot-application-build.md)  
   buildApplicationInternal → executeBuild → createCompilerPlugin。AOT コンパイルで ɵcmp が作られ、esbuild がそれを束ねる。2 つのツールの分担。
5. [index.html が完成するまで](05-boot-index-html.md)  
   IndexHtmlGenerator.process → augmentIndexHtml。あなたが書いた index.html に、&lt;script type="module"&gt; と &lt;link&gt; がどこに差し込まれるのか。
6. [ブラウザが main.js を実行するまで](06-boot-browser-load.md)  
   HTML の解析、module script の遅延実行、polyfills と main の順番、そして main.ts の最初の 1 行。&lt;app-root&gt; はこの時点では空のタグ。
7. [bootstrapApplication の中身](07-boot-bootstrap-application.md)  
   createProvidersConfig → internalCreateApplication → bootstrap()。「zoneless が既定」はここで決まっている。たった 3 つの関数で DI 木ができるまで。
8. [2 段の DI 木：プラットフォームと環境](08-boot-injectors.md)  
   createOrReusePlatformInjector が作る土台と、R3Injector が作るアプリ用の層。PLATFORM\_INITIALIZER で DOM アダプタが差し込まれる瞬間。
9. [APP\_INITIALIZER：描画の前に待つもの](09-boot-app-initializer.md)  
   ApplicationInitStatus.runInitializers → donePromise。Promise を返す初期化処理が終わるまで、ルートコンポーネントは作られない。PendingTasks との関係も。
10. [ApplicationRef.bootstrap：&lt;app-root&gt; にルートが刺さるまで](10-boot-application-ref.md)  
   ComponentFactory.create → locateHostElement → createRootTView → createLView。空だった &lt;app-root&gt; が、コンポーネントのホスト要素になる手順。
11. [最初の描画：creation pass と update pass](11-boot-first-render.md)  
   renderView がテンプレート関数を Create で呼び、DOM を組む。続く tick が Update で呼び、値を流し込む。同じ関数を 2 回呼ぶ理由。
12. [クリックから画面が変わるまで](12-boot-click-to-paint.md)  
   ɵɵlistener → wrapListener → markViewDirty → scheduler.notify → setTimeout と rAF の競走 → tick → refreshView。既定の zoneless での 1 往復。
13. [SPA の「ページ遷移」で起きていること](13-boot-spa-navigation.md)  
   RouterLink のクリック → navigateByUrl → NavigationTransitions → history.pushState → RouterOutlet.activateWith。ブラウザの戻るボタンは popstate から同じ道へ入る。
