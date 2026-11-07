[目次](../README.md) › [言語サービスの内側](README.md) › 第 2 回 / 全 20 回

# VS Code クライアント：サーバーを起動してコマンドを送る

> extension.ts の activate から client.ts の AngularLanguageClient がサーバーのプロセスを起動するまで（使う TypeScript の場所、ログの設定）。commands.ts のコマンド（サーバーの再起動・TCB を見る・テンプレートとコンポーネントの行き来）が、独自の LSP リクエストとしてサーバーに届く流れ。インラインテンプレートの中だけを Angular に回す embedded\_support.ts。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ls-client)

---

VS Code 拡張の側（クライアント）は、サーバーのプロセスを起動し、エディタの要求を「Angular に送るべきものだけ」選んで送り、Angular 独自のコマンドを独自の LSP 要求に直す層です。この章では、`activate` からサーバーが起動するまでの手順（引数の組み立て、使う TypeScript の決め方）、サーバーからの通知の受け方、「TCB を見る」コマンドが拡張 → サーバー → `LanguageService.getTcb` を往復して仮想の文書に出るまで、そしてインラインテンプレートの中だけを Angular に回す判定を、行を指して読みます。

読む対象は `vscode-ng-language-service/client/src/` の `extension.ts`・`client.ts`・`commands.ts`・`embedded_support.ts`・`providers.ts`・`config_change.ts`、共通の型 `common/requests.ts`・`common/notifications.ts`、拡張の `package.json` です。

1. [1. 全体像](01-ls-overview.md)
2. **2. VS Code クライアント**（この章）
3. [3. LSP サーバー](03-ls-server-session.md)
4. [4. tsserver プラグイン](04-ls-ts-plugin.md)
5. [5. CompilerFactory](05-ls-compiler-factory.md)
6. [6. 外部テンプレート](06-ls-external-templates.md)
7. [7. カーソルの位置](07-ls-template-target.md)
8. [8. 診断](08-ls-diagnostics.md)
9. [9. ホバー](09-ls-quick-info.md)
10. [10. 定義へのジャンプ](10-ls-definitions.md)
11. [11. 参照と名前変更](11-ls-references-rename.md)
12. [12. 式の補完](12-ls-completions.md)
13. [13. 要素と属性の補完](13-ls-attribute-completions.md)
14. [14. シグネチャヘルプ](14-ls-signature-help.md)
15. [15. インレイヒント](15-ls-inlay-hints.md)
16. [16. 色分け](16-ls-semantic-tokens.md)
17. [17. 文書のシンボル](17-ls-document-symbols.md)
18. [18. コード修正](18-ls-code-fixes.md)
19. [19. リファクタリング](19-ls-refactorings.md)
20. [20. issue と PR を読む](20-ls-issues.md)

## 1. いつ動き出すか：package.json と activate

📄 `angular/vscode-ng-language-service/package.json` L389–393 （▶ の行: 390–391, 393）

```json
389 │   "activationEvents": [
390 ▶     "onLanguage:html",
391 ▶     "onLanguage:typescript"
392 │   ],
393 ▶   "main": "../dist/bin/vscode-ng-language-service/client/src/extension.js",
```

390〜391 行目、VS Code は HTML か TypeScript のファイルを開いた時点でこの拡張を読み込みます（activation event。拡張を起動する条件）。Angular のプロジェクトかどうかはこの時点では見ていません。393 行目の `main` は bazel の出力先を指していて、配布物を作るときに `./index` に置き換えられます（ルートの BUILD.bazel の `expand_template_rule`）。読み込まれると、`main` のモジュールの `activate` が呼ばれます。

📄 `angular/vscode-ng-language-service/client/src/extension.ts` L15–48 （▶ の行: 16, 20, 23, 25, 28–29, 34, 39–41, 47）

```ts
15 │ export function activate(context: vscode.ExtensionContext) {
16 ▶   const client = new AngularLanguageClient(context);
17 │   context.subscriptions.push(client);
18 │ 
19 │   const startServer = async () => {
20 ▶     registerCommands(client, context);
21 │ 
22 │     // Restart the server on configuration changes that affect startup/session state.
23 ▶     const disposable = vscode.workspace.onDidChangeConfiguration(
24 │       async (e: vscode.ConfigurationChangeEvent) => {
25 ▶         if (!shouldRestartOnConfigurationChange(e)) {
26 │           return;
27 │         }
28 ▶         await client.stop();
29 ▶         await client.start();
30 │       },
31 │     );
32 │     context.subscriptions.push(disposable);
33 │ 
34 ▶     await client.start();
35 │   };
36 │ 
37 │   // If the workspace is untrusted, operate in limited mode:
38 │   // Do NOT start the language server or register commands.
39 ▶   if (!vscode.workspace.isTrusted) {
40 ▶     const trustDisposable = vscode.workspace.onDidGrantWorkspaceTrust(async () => {
41 ▶       await startServer();
42 │     });
43 │     context.subscriptions.push(trustDisposable);
44 │     return;
45 │   }
46 │ 
47 ▶   startServer();
48 │ }
```

1. **16 行目：AngularLanguageClient を作る（まだサーバーは起動しない）**

   コンストラクタは設定を読んで `clientOptions`（3 節）を組み立てるだけです。プロセスを起動するのは 34 行目の `start()` です。
2. **39〜45 行目：信頼されていないワークスペースでは何もしない**

   VS Code の「ワークスペースの信頼」（開いたフォルダのコードを実行してよいかを利用者が決める仕組み）が無いときは、40 行目で「信頼されたら」の購読だけをして戻ります。サーバーは起動せず、20 行目のコマンドの登録もしません。package.json の `capabilities.untrustedWorkspaces` の説明は、理由を「信頼されないローカルのコードを実行しないため」と書いています（サーバーはワークスペースの設定によってはその場所の TypeScript を読み込みます。3 節）。
3. **20 行目：コマンドを登録する（6 節）**
4. **23〜31 行目：設定が変わったら、必要なときだけ再起動**

   25 行目の `shouldRestartOnConfigurationChange` が真なら、28〜29 行目でサーバーを止めて起動し直します。何が「必要なとき」かは次の引用です。
5. **34 行目・47 行目：start()**

📄 `angular/vscode-ng-language-service/client/src/config_change.ts` L13–38 （▶ の行: 14, 18, 22, 25–26, 29）

```ts
13 │ export function shouldRestartOnConfigurationChange(e: ConfigurationChangeLike): boolean {
14 ▶   if (e.affectsConfiguration('typescript.tsdk') || e.affectsConfiguration('js/ts.tsdk.path')) {
15 │     return true;
16 │   }
17 │ 
18 ▶   if (!e.affectsConfiguration('angular')) {
19 │     return false;
20 │   }
21 │ 
22 ▶   const affectsInlayHints =
23 │     e.affectsConfiguration('angular.inlayHints') || e.affectsConfiguration('editor.inlayHints');
24 │ 
25 ▶   if (!affectsInlayHints) {
26 ▶     return true;
27 │   }
28 │ 
29 ▶   const affectsNonInlayAngularSettings =
30 │     e.affectsConfiguration('angular.log') ||
31 │     e.affectsConfiguration('angular.trace.server') ||
32 │     e.affectsConfiguration('angular.enable-strict-mode-prompt') ||
33 │     e.affectsConfiguration('angular.suggest') ||
34 │     e.affectsConfiguration('angular.forceStrictTemplates') ||
35 │     e.affectsConfiguration('angular.suppressAngularDiagnosticCodes') ||
36 │     e.affectsConfiguration('angular.server');
37 │ 
38 │   return affectsNonInlayAngularSettings;
```

14 行目、TypeScript の場所の設定（`typescript.tsdk` と `js/ts.tsdk.path`）が変われば必ず再起動します。サーバーが読み込む TypeScript は起動時にしか決まらないからです（第 3 回）。18 行目、`angular.` 以外の設定は無視します。22〜27 行目、インレイヒントの設定だけの変更なら再起動しません。インレイヒントの設定はサーバーが `workspace/configuration` で毎回尋ねるからです（[第 15 回](15-ls-inlay-hints.md)）。29 行目以降、インレイヒントと一緒に別の設定も変わっていれば再起動します。

## 2. サーバーのプロセスを起動する

📄 `angular/vscode-ng-language-service/client/src/client.ts` L357–368 （▶ の行: 358, 363–366）

```ts
357 │   async start(): Promise<void> {
358 ▶     if (this.client !== null) {
359 │       throw new Error(`An existing client is running. Call stop() first.`);
360 │     }
361 │ 
362 │     // Node module for the language server
363 ▶     const args = await this.constructArgs();
364 ▶     const prodBundle = this.context.asAbsolutePath('server');
365 ▶     const devBundle = this.context.asAbsolutePath(
366 ▶       path.join('bazel-bin', 'server', 'src', 'server.js'),
367 │     );
368 │ 
```

📄 `angular/vscode-ng-language-service/client/src/client.ts` L377–403 （▶ の行: 377, 380, 386, 388, 391, 398）

```ts
377 ▶       debug: {
378 │         // VS Code Insider launches extensions in debug mode by default but users
379 │         // install prod bundle so we have to check whether dev bundle exists.
380 ▶         module: fs.existsSync(devBundle) ? devBundle : prodBundle,
381 │         transport: lsp.TransportKind.ipc,
382 │         options: {
383 │           // Argv options for Node.js
384 │           execArgv: [
385 │             // do not lazily evaluate the code so all breakpoints are respected
386 ▶             '--nolazy',
387 │             // If debugging port is changed, update .vscode/launch.json as well
388 ▶             '--inspect-brk=6009',
389 │           ],
390 │           env: {
391 ▶             NG_DEBUG: true,
392 │           },
393 │         },
394 │         args,
395 │       },
396 │     };
397 │ 
398 ▶     if (!extensionVersionCompatibleWithAllProjects(serverOptions.run.module)) {
399 │       vscode.window.showWarningMessage(
400 │         `A project in the workspace is using a newer version of Angular than the language service extension. ` +
401 │           `This may cause the extension to show incorrect diagnostics.`,
402 │       );
403 │     }
```

📄 `angular/vscode-ng-language-service/client/src/client.ts` L405–424 （▶ の行: 406–407, 410, 412–413, 416, 420）

```ts
405 │     // Create the language client and start the client.
406 ▶     const forceDebug = process.env['NG_DEBUG'] === 'true';
407 ▶     this.client = new lsp.LanguageClient(
408 │       // This is the ID for Angular-specific configurations, like "angular.log".
409 │       // See contributes.configuration in package.json.
410 ▶       'angular',
411 │       this.name,
412 ▶       serverOptions,
413 ▶       this.clientOptions,
414 │       forceDebug,
415 │     );
416 ▶     await this.client.start();
417 │     // Must wait for the client to be ready before registering notification
418 │     // handlers.
419 │     this.sessionDisposables.push(
420 ▶       registerNotificationHandlers(this.client, () => {
421 │         this.fileToIsInAngularProjectMap.clear();
422 │       }),
423 │     );
424 │   }
```

1. **363 行目：サーバーに渡す引数を作る**

   3 節で読む `constructArgs`。サーバーの起動の設定はすべて**コマンドラインの引数**で渡します。
2. **364〜367 行目：サーバーのモジュールの場所**

   配布物では拡張の中の `server` ディレクトリ、開発中は bazel の出力 `bazel-bin/server/src/server.js` です。普段の起動（`run`）は 364 行目と同じ `server` を IPC で起動します（[第 1 回](01-ls-overview.md)の 1 節）。
3. **377〜396 行目：デバッグのときの起動**

   拡張がデバッグのモードで起動されたときの設定です。380 行目で開発用の出力があればそれを使い、386 行目の `--nolazy` と 388 行目の `--inspect-brk=6009` でデバッガを待ってから動き始めます。391 行目の `NG_DEBUG` はサーバーの中で時間を測るログを有効にします（第 3 回）。DEVELOPER.md の手順にある「VSCE: Attach to Server」は、リポジトリの `.vscode/launch.json` で port 6009 につなぐ設定です。
4. **398〜403 行目：プロジェクトの Angular の方が新しければ警告**

   `extensionVersionCompatibleWithAllProjects` の中身は[第 1 回](01-ls-overview.md)の 4 節で読みました。
5. **407〜415 行目：vscode-languageclient の LanguageClient を作る**

   410 行目の `'angular'` は ID で、`angular.log`・`angular.trace.server` のような設定の名前の頭と一致させています（408〜409 行目のコメント）。412 行目のサーバーの設定と、413 行目の `clientOptions` を渡します。406 行目、環境変数 `NG_DEBUG=true` なら 414 行目でデバッグのモードを強制します。
6. **416 行目と 420 行目：起動を待ってから通知の受け手を登録**

   `client.start()` の中で LSP の `initialize` の往復が終わります。そのあとで 420 行目の `registerNotificationHandlers`（4 節）を登録します。417〜418 行目のコメントのとおり、準備ができる前には登録できません。

## 3. 引数の組み立て：constructArgs

📄 `angular/vscode-ng-language-service/client/src/client.ts` L430–464 （▶ の行: 432, 434, 437–439, 442, 459–462）

```ts
430 │   private async constructArgs(): Promise<string[]> {
431 │     const config = vscode.workspace.getConfiguration();
432 ▶     const args: string[] = ['--logToConsole'];
433 │ 
434 ▶     const ngLog: string = config.get('angular.log', 'off');
435 │     if (ngLog !== 'off') {
436 │       // Log file does not yet exist on disk. It is up to the server to create the file.
437 ▶       const logFile = path.join(this.context.logUri.fsPath, 'nglangsvc.log');
438 ▶       args.push('--logFile', logFile);
439 ▶       args.push('--logVerbosity', ngLog);
440 │     }
441 │ 
442 ▶     args.push('--ngProbeLocations', this.context.extensionPath);
443 │ 
444 │     const includeAutomaticOptionalChainCompletions = config.get<boolean>(
445 │       'angular.suggest.includeAutomaticOptionalChainCompletions',
446 │     );
447 │     if (includeAutomaticOptionalChainCompletions) {
448 │       args.push('--includeAutomaticOptionalChainCompletions');
449 │     }
450 │ 
451 │     const includeCompletionsWithSnippetText = config.get<boolean>(
452 │       'angular.suggest.includeCompletionsWithSnippetText',
453 │     );
454 │     if (includeCompletionsWithSnippetText) {
455 │       args.push('--includeCompletionsWithSnippetText');
456 │     }
457 │ 
458 │     const includeCompletionsForModuleExports = config.get<boolean>('angular.suggest.autoImports');
459 ▶     args.push(
460 ▶       '--includeCompletionsForModuleExports',
461 ▶       includeCompletionsForModuleExports === undefined
462 ▶         ? 'true'
463 │         : includeCompletionsForModuleExports.toString(),
464 │     );
```

432 行目、`--logToConsole` は必ず付きます（サーバーのログを LSP の `window/logMessage` で出力パネルに出す）。434〜440 行目、`angular.log` が `off` 以外なら、VS Code が拡張ごとに用意するログの置き場（`context.logUri`）の `nglangsvc.log` をログのファイルにします。437 行目のコメントのとおり、ファイルを作るのはサーバーです。442 行目の `--ngProbeLocations` は「`@angular/language-service` をどこから探すか」で、**拡張のディレクトリだけ**を渡します。だから使われる言語サービスは常に拡張に同梱のものです（第 3 回）。458〜464 行目、自動 import の補完は設定が無ければ `'true'` を渡します。

📄 `angular/vscode-ng-language-service/client/src/client.ts` L466–496 （▶ の行: 467, 474–475, 480, 488, 496）

```ts
466 │     // Sort the versions from oldest to newest.
467 ▶     const angularVersions = (await getAngularVersionsInWorkspace(this.outputChannel)).sort(
468 │       (a, b) => (a.version.greaterThanOrEqual(b.version) ? 1 : -1),
469 │     );
470 │ 
471 │     // Only disable block syntax if we find angular/core and every one we find does not support
472 │     // block syntax
473 │     if (angularVersions.length > 0) {
474 ▶       const disableBlocks = angularVersions.every((v) => v.version.major < 17);
475 ▶       const disableLet = angularVersions.every((v) => {
476 │         return v.version.major < 18 || (v.version.major === 18 && v.version.minor < 1);
477 │       });
478 │ 
479 │       if (disableBlocks) {
480 ▶         args.push('--disableBlockSyntax');
481 │         this.outputChannel.appendLine(
482 │           `All workspace roots are using versions of Angular that do not support control flow block syntax.` +
483 │             ` Block syntax parsing in templates will be disabled.`,
484 │         );
485 │       }
486 │ 
487 │       if (disableLet) {
488 ▶         args.push('--disableLetSyntax');
489 │         this.outputChannel.appendLine(
490 │           `All workspace roots are using versions of Angular that do not support @let syntax.` +
491 │             ` @let syntax parsing in templates will be disabled.`,
492 │         );
493 │       }
494 │     }
495 │ 
496 ▶     setAngularVersionAndShowMultipleVersionsWarning(angularVersions, args, this.outputChannel);
```

467 行目で、ワークスペースの中で見つかった `@angular/core` を古い順に並べます。474 行目、全部が v17 より前なら `--disableBlockSyntax`（`@if` などのブロックを解析しない）、475〜477 行目、全部が v18.1 より前なら `--disableLetSyntax` を付けます。496 行目の `setAngularVersionAndShowMultipleVersionsWarning` は、いちばん古い版を `--angularCoreVersion` として渡し、マイナー版の違う Angular が 2 つ以上あれば警告を出します。ただし、この 2 つの `--disable…` がサーバーの先でどう使われているかを追うと、言語サービスの側では既に読まれていません（[第 4 回](04-ls-ts-plugin.md)の 5 節）。

📄 `angular/vscode-ng-language-service/client/src/client.ts` L498–528 （▶ の行: 498, 500, 503, 507, 510, 515, 517, 519, 524）

```ts
498 ▶     const forceStrictTemplates = config.get<boolean>('angular.forceStrictTemplates');
499 │     if (forceStrictTemplates) {
500 ▶       args.push('--forceStrictTemplates');
501 │     }
502 │ 
503 ▶     const suppressAngularDiagnosticCodes = config.get<string>(
504 │       'angular.suppressAngularDiagnosticCodes',
505 │     );
506 │     if (suppressAngularDiagnosticCodes) {
507 ▶       args.push('--suppressAngularDiagnosticCodes', suppressAngularDiagnosticCodes);
508 │     }
509 │ 
510 ▶     // Note: Document symbols settings (angular.documentSymbols.enabled,
511 │     // angular.documentSymbols.showImplicitForVariables) are now fetched
512 │     // dynamically via workspace/configuration request by the server.
513 │     // This allows users to change these settings without restarting.
514 │ 
515 ▶     const tsdk = await this.getTsdkPath();
516 │     if (tsdk.trim().length > 0) {
517 ▶       args.push('--tsdk', tsdk);
518 │     }
519 ▶     args.push('--tsProbeLocations', this.context.extensionPath);
520 │ 
521 │     const supportClientSide = config.get('angular.server.useClientSideFileWatcher');
522 │ 
523 │     if (supportClientSide) {
524 ▶       args.push('--useClientSideFileWatcher');
525 │     }
526 │ 
527 │     return args;
528 │   }
```

500 行目の `--forceStrictTemplates` と 507 行目の `--suppressAngularDiagnosticCodes` はプラグインの設定になります（第 4 回）。510〜513 行目のコメントのとおり、文書のシンボルの設定は引数ではなく、サーバーが必要なときに尋ねます。515〜519 行目、使う TypeScript の場所 `--tsdk`（次の引用）と、探す場所 `--tsProbeLocations`（こちらも拡張のディレクトリ）を渡します。524 行目は、ファイルの変更の監視をサーバーではなく VS Code にさせる設定です（3 節のコンストラクタの `fileEvents` と対になる。第 3 回）。

### 使う TypeScript の決め方：getTsdkPath

📄 `angular/vscode-ng-language-service/client/src/client.ts` L638–677 （▶ の行: 638–639, 645, 648–649, 651–652, 655–656, 667, 669, 676）

```ts
638 ▶     if (vscode.workspace.isTrusted) {
639 ▶       const jsTsWorkspaceTsdk = (
640 │         jsTsTsdkInspect?.workspaceValue ?? jsTsTsdkInspect?.workspaceFolderValue
641 │       )?.trim();
642 │       const tsWorkspaceTsdk = (
643 │         tsTsdkInspect?.workspaceValue ?? tsTsdkInspect?.workspaceFolderValue
644 │       )?.trim();
645 ▶       const workspaceTsdk = jsTsWorkspaceTsdk || tsWorkspaceTsdk;
646 │ 
647 │       if (workspaceTsdk) {
648 ▶         const stateKey = `approvedTsdk:${workspaceTsdk}`;
649 ▶         const isApproved = this.context.workspaceState.get<boolean>(stateKey);
650 │ 
651 ▶         if (isApproved) {
652 ▶           if (!path.isAbsolute(workspaceTsdk)) {
653 │             const workspaceFolders = vscode.workspace.workspaceFolders || [];
654 │             for (const folder of workspaceFolders) {
655 ▶               const absolutePath = path.join(folder.uri.fsPath, workspaceTsdk);
656 ▶               if (fs.existsSync(path.join(absolutePath, 'tsserverlibrary.js'))) {
657 │                 return absolutePath;
658 │               }
659 │             }
660 │             if (workspaceFolders.length > 0) {
661 │               return path.join(workspaceFolders[0].uri.fsPath, workspaceTsdk);
662 │             }
663 │           }
664 │           return workspaceTsdk;
665 │         }
666 │ 
667 ▶         if (isApproved === undefined) {
668 │           // Prompt the user asynchronously, without blocking current server initialization
669 ▶           this.promptForTsdkApproval(stateKey);
670 │         }
671 │ 
672 │         // Fall back to globalValue (or bundled) while waiting for approval or if rejected
673 │       }
674 │     }
675 │ 
676 ▶     return jsTsTsdkInspect?.globalValue?.trim() ?? tsTsdkInspect?.globalValue?.trim() ?? '';
677 │   }
```

📄 `angular/vscode-ng-language-service/client/src/client.ts` L679–698 （▶ の行: 683–684, 690–691, 693, 696）

```ts
679 │   private async promptForTsdkApproval(stateKey: string): Promise<void> {
680 │     const allowOption = 'Allow';
681 │     const disallowOption = 'Disallow';
682 │ 
683 ▶     const choice = await vscode.window.showWarningMessage(
684 ▶       `This workspace configures a custom TypeScript compiler path via 'js/ts.tsdk.path' or 'typescript.tsdk'. ` +
685 │         `Do you want to allow the Angular Language Service to load the TypeScript compiler from this path?`,
686 │       allowOption,
687 │       disallowOption,
688 │     );
689 │ 
690 ▶     if (choice === allowOption) {
691 ▶       await this.context.workspaceState.update(stateKey, true);
692 │       // Restart the language server so it launches with the newly authorized compiler path
693 ▶       await vscode.commands.executeCommand('angular.restartNgServer');
694 │     } else {
695 │       // Remember rejection to avoid repeatedly prompting on startup/activation
696 ▶       await this.context.workspaceState.update(stateKey, false);
697 │     }
698 │   }
```

1. **638 行目：信頼されたワークスペースでだけ、ワークスペースの設定を見る**

   639〜645 行目、`js/ts.tsdk.path` を先に、無ければ `typescript.tsdk` の、ワークスペースかフォルダの値を取ります。
2. **648〜649 行目：その場所を、利用者が許したことがあるか**

   `approvedTsdk:パス` という鍵で `workspaceState`（VS Code がワークスペースごとに拡張に持たせる保存場所。リポジトリのファイルではない）を引きます。ワークスペースの設定ファイル（`.vscode/settings.json`）はリポジトリに入れられるので、他人のリポジトリを開いただけで任意の場所の JS を読み込まないための確認です。
3. **651〜665 行目：許されていれば、その場所を使う**

   652〜662 行目、相対パスなら各フォルダの下に `tsserverlibrary.js` があるかを見て絶対パスに直します（#69276 を直した fbe807ca12d）。
4. **667〜670 行目：まだ尋ねていなければ尋ねる。ただし待たない**

   669 行目は `await` していません。尋ねている間は 676 行目に落ち、ユーザー設定（global）の値か空文字（＝同梱の TypeScript）で起動します。
5. **690〜693 行目：許されたら保存して再起動**

   691 行目で保存し、693 行目でコマンド `angular.restartNgServer`（6 節）を呼びます。次の起動では 651 行目を通ります。696 行目、断られたことも保存し、二度と尋ねません。

> [!WARNING]
> **ハマりどころ**
>
> **最近のセキュリティ修正 2 つ（読むだけ）。** ba13a3ce22f（2026-08-12、#70176）は 683〜688 行目の文言から `${workspaceTsdk}` を消しました。VS Code は通知の文字列の中のリンクを解釈し `command:` の URI も許すので、ワークスペースの設定に細工したパスを書けば、確認の通知に「押すとコマンドが走るリンク」を混ぜられたからです。エスケープではなく、パスを表示しないことで防いでいます。69c87301aa5（2026-08-18、#70512）は 6 節の `angular.openJsDocLink` の修正で、後で読みます。

## 4. サーバーからの通知を受ける

📄 `angular/vscode-ng-language-service/common/notifications.ts` L11–32 （▶ の行: 11–12, 19, 28, 32）

```ts
11 ▶ export const ProjectLoadingStart = new NotificationType0('angular/projectLoadingStart');
12 ▶ export const ProjectLoadingFinish = new NotificationType0('angular/projectLoadingFinish');
13 │ 
14 │ export interface ProjectLanguageServiceParams {
15 │   projectName: string;
16 │   languageServiceEnabled: boolean;
17 │ }
18 │ 
19 ▶ export const ProjectLanguageService = new NotificationType<ProjectLanguageServiceParams>(
20 │   'angular/projectLanguageService',
21 │ );
22 │ 
23 │ export interface SuggestStrictModeParams {
24 │   configFilePath: string;
25 │   message: string;
26 │ }
27 │ 
28 ▶ export const SuggestStrictMode = new NotificationType<SuggestStrictModeParams>(
29 │   'angular/suggestStrictMode',
30 │ );
31 │ 
32 ▶ export const OpenOutputChannel = new NotificationType('angular/OpenOutputChannel');
```

📄 `angular/vscode-ng-language-service/client/src/client.ts` L708–731 （▶ の行: 714–716, 719, 723, 725）

```ts
708 │ function registerNotificationHandlers(
709 │   client: lsp.LanguageClient,
710 │   onProjectStateChange: () => void,
711 │ ): vscode.Disposable {
712 │   const disposables: vscode.Disposable[] = [];
713 │   disposables.push(
714 ▶     client.onNotification(ProjectLoadingStart, () => {
715 ▶       onProjectStateChange();
716 ▶       vscode.window.withProgress(
717 │         {
718 │           location: vscode.ProgressLocation.Window,
719 ▶           title: 'Initializing Angular language features',
720 │         },
721 │         () =>
722 │           new Promise<void>((resolve) => {
723 ▶             client.onNotification(ProjectLoadingFinish, () => {
724 │               onProjectStateChange();
725 ▶               resolve();
726 │             });
727 │           }),
728 │       );
729 │     }),
730 │   );
731 │ 
```

共通の `notifications.ts` は、LSP の決まりに無い Angular 独自の通知を 5 つ名前付きで定義します（11・12・19・28・32 行目）。拡張とサーバーの両方がこのファイルを import するので、名前の打ち間違いが起きません。714 行目、サーバーが `angular/projectLoadingStart` を送ってくると、716 行目でステータスバーに「Initializing Angular language features」を出し、723 行目で `angular/projectLoadingFinish` が来るまで出し続けます。715 行目と 724 行目で 5 節の「Angular のプロジェクトか」の覚えを捨てます。プロジェクトが読み直されると答えが変わりうるからです。サーバーがいつこれを送るかは第 3 回、`SuggestStrictMode`（strictTemplates の提案）は[第 8 回](08-ls-diagnostics.md)です。`ProjectLanguageService`（19 行目）はサーバーが送りますが、`git grep` で探した範囲では、拡張の側にこれを受ける行はありません。

## 5. 何をサーバーに送るか：middleware と embedded\_support

📄 `angular/vscode-ng-language-service/client/src/client.ts` L68–103 （▶ の行: 69, 72, 74–76, 86, 89–90, 93, 97, 100–101）

```ts
 68 │     const config = vscode.workspace.getConfiguration();
 69 ▶     const useClientSideWatching = config.get('angular.server.useClientSideFileWatcher');
 70 │     const fileEvents = [
 71 │       // Notify the server about file changes to tsconfig.json contained in the workspace
 72 ▶       vscode.workspace.createFileSystemWatcher('**/tsconfig.json'),
 73 │     ];
 74 ▶     if (useClientSideWatching) {
 75 ▶       fileEvents.push(vscode.workspace.createFileSystemWatcher('**/*.ts'));
 76 ▶       fileEvents.push(vscode.workspace.createFileSystemWatcher('**/*.html'));
 77 │       // While we don't need general JSON watching, TypeScript relies on package.json for module resolution, type acquisition, and auto-imports.
 78 │       // If we don't watch it, npm install changes or dependency updates might be missed by the Language Service
 79 │       fileEvents.push(vscode.workspace.createFileSystemWatcher('**/package.json'));
 80 │     }
 81 │ 
 82 │     this.outputChannel = vscode.window.createOutputChannel(this.name);
 83 │     // Options to control the language client
 84 │     this.clientOptions = {
 85 │       // Register the server for Angular templates and TypeScript documents
 86 ▶       documentSelector: [
 87 │         // scheme: 'file' means listen to changes to files on disk only
 88 │         // other option is 'untitled', for buffer in the editor (like a new doc)
 89 ▶         {scheme: 'file', language: 'html'},
 90 ▶         {scheme: 'file', language: 'typescript'},
 91 │       ],
 92 │       synchronize: {
 93 ▶         configurationSection: ['angular', 'typescript', 'editor.inlayHints'],
 94 │         fileEvents,
 95 │       },
 96 │       // Don't let our output console pop open
 97 ▶       revealOutputChannelOn: lsp.RevealOutputChannelOn.Never,
 98 │       outputChannel: this.outputChannel,
 99 │       markdown: {
100 ▶         isTrusted: {
101 ▶           enabledCommands: [OpenJsDocLinkCommandId],
102 │         },
103 │       },
```

86〜91 行目、この拡張は **HTML と TypeScript の全部のファイル**の言語サーバーとして登録されます。つまり何もしなければ、TS のファイルの中のどの位置のホバーも補完も Angular のサーバーに届きます。それを絞るのが `middleware`（要求を送る前に割り込む関数）です。93 行目、`angular`・`typescript`・`editor.inlayHints` の設定の変更をサーバーに知らせます。72 行目、tsconfig.json の変更は常に、74〜80 行目、設定があれば .ts・.html・package.json の変更もサーバーに知らせます。100〜102 行目は 6 節で読みます。

📄 `angular/vscode-ng-language-service/client/src/client.ts` L164–196 （▶ の行: 170–172, 174, 177, 180–181, 183, 192, 195）

```ts
164 │         provideHover: async (
165 │           document: vscode.TextDocument,
166 │           position: vscode.Position,
167 │           token: vscode.CancellationToken,
168 │           next: lsp.ProvideHoverSignature,
169 │         ) => {
170 ▶           if (
171 ▶             !(await this.isInAngularProject(document)) ||
172 ▶             !isNotTypescriptOrSupportedDecoratorField(document, position)
173 │           ) {
174 ▶             return;
175 │           }
176 │ 
177 ▶           const angularResultsPromise = next(document, position, token);
178 │ 
179 │           // Include results for inline HTML via virtual document and native html providers.
180 ▶           if (document.languageId === 'typescript') {
181 ▶             const vdocUri = this.createVirtualHtmlDoc(document);
182 │             const htmlProviderResultsPromise = vscode.commands.executeCommand<vscode.Hover[]>(
183 ▶               'vscode.executeHoverProvider',
184 │               vdocUri,
185 │               position,
186 │             );
187 │ 
188 │             const [angularResults, htmlProviderResults] = await Promise.all([
189 │               angularResultsPromise,
190 │               htmlProviderResultsPromise,
191 │             ]);
192 ▶             return angularResults ?? htmlProviderResults?.[0];
193 │           }
194 │ 
195 ▶           return angularResultsPromise;
196 │         },
```

1. **170〜175 行目：送らない条件**

   Angular のプロジェクトでない（171 行目）か、TS のファイルでデコレータの `template` などの文字列の外（172 行目）なら、174 行目で何も返しません。TS の普通のホバーは VS Code 組み込みの TypeScript 拡張が出します。
2. **177 行目：Angular のサーバーに送る**

   `next` が LSP の `textDocument/hover` を送る本来の処理です。
3. **180〜192 行目：インラインテンプレートでは HTML のホバーも並べて求める**

   TS のファイルの中のテンプレートでは、VS Code の HTML の機能（タグの説明など）が働きません。そこで 181 行目でファイル全体の写しを `.html` の仮想の文書として作り、183 行目で VS Code の HTML の提供者にその文書の同じ位置のホバーを尋ねます。192 行目、Angular の答えがあればそれを、無ければ HTML の答えを返します。

📄 `angular/vscode-ng-language-service/client/src/client.ts` L317–352 （▶ の行: 322, 327, 330, 333, 335–336, 346–347, 350）

```ts
317 │   private async isInAngularProject(doc: vscode.TextDocument): Promise<boolean> {
318 │     if (this.client === null) {
319 │       return false;
320 │     }
321 │     const uri = doc.uri.toString();
322 ▶     if (this.fileToIsInAngularProjectMap.has(uri)) {
323 │       return this.fileToIsInAngularProjectMap.get(uri)!;
324 │     }
325 │ 
326 │     try {
327 ▶       const response = await this.client.sendRequest(IsInAngularProject, {
328 │         textDocument: this.client.code2ProtocolConverter.asTextDocumentIdentifier(doc),
329 │       });
330 ▶       if (response == null) {
331 │         // If the response indicates the answer can't be determined at the moment, return `false`
332 │         // but do not cache the result so we can try to get the real answer on follow-up requests.
333 ▶         return false;
334 │       }
335 ▶       if (response) {
336 ▶         this.fileToIsInAngularProjectMap.set(uri, true);
337 │       }
338 │       return response;
339 │     } catch {
340 │       return false;
341 │     }
342 │   }
343 │ 
344 │   private createVirtualHtmlDoc(document: vscode.TextDocument): vscode.Uri {
345 │     const originalUri = document.uri.toString();
346 ▶     const vdocUri = vscode.Uri.file(encodeURIComponent(originalUri) + '.html').with({
347 ▶       scheme: 'angular-embedded-content',
348 │       authority: 'html',
349 │     });
350 ▶     this.virtualDocumentContents.set(vdocUri.toString(), document.getText());
351 │     return vdocUri;
352 │   }
```

「Angular のプロジェクトか」は 327 行目の独自の要求 `angular/isAngularCoreInOwningProject`（6 節の requests.ts）でサーバーに尋ねます。答えは 322 行目でファイルごとに覚えますが、覚えるのは 335〜336 行目の `true` のときだけです。330〜333 行目、サーバーが「まだ分からない」（`null`）と答えたら覚えずに `false` を返し、次の要求でまた尋ねます。346〜350 行目の仮想の文書は、スキーム `angular-embedded-content` の URI に TS のファイルの中身をそのまま入れたものです（コンストラクタで同じスキームの提供者を登録しています）。

### カーソルがデコレータの文字列の中かを、字句だけで判定する

📄 `angular/vscode-ng-language-service/client/src/embedded_support.ts` L11–35 （▶ の行: 11–16, 27–28, 30, 33）

```ts
11 ▶ const ANGULAR_PROPERTY_ASSIGNMENTS = new Set([
12 ▶   'template',
13 ▶   'templateUrl',
14 ▶   'styleUrls',
15 ▶   'styleUrl',
16 ▶   'host',
17 │ ]);
18 │ 
19 │ /**
20 │  * Determines if the position is inside a decorator
21 │  * property that supports language service features.
22 │  */
23 │ export function isNotTypescriptOrSupportedDecoratorField(
24 │   document: vscode.TextDocument,
25 │   position: vscode.Position,
26 │ ): boolean {
27 ▶   if (document.languageId !== 'typescript') {
28 ▶     return true;
29 │   }
30 ▶   return isPropertyAssignmentToStringOrStringInArray(
31 │     document.getText(),
32 │     document.offsetAt(position),
33 ▶     ANGULAR_PROPERTY_ASSIGNMENTS,
34 │   );
35 │ }
```

📄 `angular/vscode-ng-language-service/client/src/embedded_support.ts` L107–130 （▶ の行: 107, 116, 118, 120–121, 123, 127–128）

```ts
107 ▶   const scanner = ts.createScanner(ts.ScriptTarget.ESNext, true /* skipTrivia */);
108 │   scanner.setText(documentText);
109 │ 
110 │   let token: ts.SyntaxKind = scanner.scan();
111 │   let lastToken: ts.SyntaxKind | undefined;
112 │   let lastTokenText: string | undefined;
113 │   let unclosedBraces = 0;
114 │   let unclosedBrackets = 0;
115 │   let propertyAssignmentContext = false;
116 ▶   while (token !== ts.SyntaxKind.EndOfFileToken && scanner.getStartPos() < offset) {
117 │     if (
118 ▶       lastToken === ts.SyntaxKind.Identifier &&
119 │       lastTokenText !== undefined &&
120 ▶       token === ts.SyntaxKind.ColonToken &&
121 ▶       propertyAssignmentNames.has(lastTokenText)
122 │     ) {
123 ▶       propertyAssignmentContext = true;
124 │       token = scanner.scan();
125 │       continue;
126 │     }
127 ▶     if (unclosedBraces === 0 && unclosedBrackets === 0 && isPropertyAssignmentTerminator(token)) {
128 ▶       propertyAssignmentContext = false;
129 │     }
130 │ 
```

📄 `angular/vscode-ng-language-service/client/src/embedded_support.ts` L131–157 （▶ の行: 131, 134, 141–143, 147–148）

```ts
131 ▶     if (token === ts.SyntaxKind.OpenBracketToken) {
132 │       unclosedBrackets++;
133 │     } else if (token === ts.SyntaxKind.OpenBraceToken) {
134 ▶       unclosedBraces++;
135 │     } else if (token === ts.SyntaxKind.CloseBracketToken) {
136 │       unclosedBrackets--;
137 │     } else if (token === ts.SyntaxKind.CloseBraceToken) {
138 │       unclosedBraces--;
139 │     }
140 │ 
141 ▶     const isStringToken =
142 ▶       token === ts.SyntaxKind.StringLiteral ||
143 ▶       token === ts.SyntaxKind.NoSubstitutionTemplateLiteral;
144 │     const isCursorInToken =
145 │       scanner.getStartPos() <= offset &&
146 │       scanner.getStartPos() + scanner.getTokenText().length >= offset;
147 ▶     if (propertyAssignmentContext && isCursorInToken && isStringToken) {
148 ▶       return true;
149 │     }
150 │ 
151 │     lastTokenText = scanner.getTokenText();
152 │     lastToken = token;
153 │     token = scanner.scan();
154 │   }
155 │ 
156 │   return false;
157 │ }
```

1. **27〜29 行目：HTML なら常に真**

   外部テンプレートの `.html` は全部が Angular の範囲です。
2. **107 行目：構文木を作らず、TypeScript の字句解析器（scanner）だけを使う**

   拡張のプロセスで要求のたびに構文木を作るのは重いので、字句（トークン）を先頭から順に読むだけにしています。116 行目、カーソルの位置まで読みます。この関数の上のコメントが書くとおり、`@Component` の中かどうかは見ないので誤って真になることがありますが、そのときはサーバーの言語サービスが正しく何も返さない、という割り切りです。
3. **118〜125 行目：「名前 :」を見たら、その値の中に入った**

   直前の字句が識別子で、その名前が 11〜17 行目の 5 つ（`template`・`templateUrl`・`styleUrls`・`styleUrl`・`host`）のどれかで、今の字句が `:` なら、値の中にいる印を立てます。
4. **127〜139 行目：値の終わりを数える**

   括弧の深さを 131〜139 行目で数え、深さ 0 で `,`・`;`・`}`（127 行目）が来たら値の外に出たとみなします。`styleUrls: ['a', 'b']` の 2 つ目の文字列でも真になるのはこのためです。
5. **141〜149 行目：印が立っていて、カーソルを含む字句が文字列なら真**

   文字列の字句は `'…'` と `` `…` ``（置換の無いテンプレートリテラル）の 2 種類です。

補完・定義・型の定義・シグネチャ・リンクした編集の middleware も同じ判定を使います。名前変更だけは「文字列の中か」（`isInsideStringLiteral`）を使います（[第 4 回](04-ls-ts-plugin.md)）。

## 6. コマンド：独自の LSP 要求に直す

📄 `angular/vscode-ng-language-service/package.json` L30–57 （▶ の行: 33, 38, 43, 48, 53）

```json
30 │   "contributes": {
31 │     "commands": [
32 │       {
33 ▶         "command": "angular.restartNgServer",
34 │         "title": "Restart Angular Language server",
35 │         "category": "Angular"
36 │       },
37 │       {
38 ▶         "command": "angular.openLogFile",
39 │         "title": "Open Angular Server log",
40 │         "category": "Angular"
41 │       },
42 │       {
43 ▶         "command": "angular.getTemplateTcb",
44 │         "title": "View Template Typecheck Block",
45 │         "category": "Angular"
46 │       },
47 │       {
48 ▶         "command": "angular.goToComponentWithTemplateFile",
49 │         "title": "Go to component",
50 │         "category": "Angular"
51 │       },
52 │       {
53 ▶         "command": "angular.goToTemplateForComponent",
54 │         "title": "Go to template",
55 │         "category": "Angular"
56 │       }
57 │     ],
```

📄 `angular/vscode-ng-language-service/client/src/commands.ts` L225–245 （▶ の行: 230–236, 240–242）

```ts
225 │ export function registerCommands(
226 │   client: AngularLanguageClient,
227 │   context: vscode.ExtensionContext,
228 │ ): void {
229 │   const commands: Command[] = [
230 ▶     restartNgServer(client),
231 ▶     openLogFile(client),
232 ▶     getTemplateTcb(client, context),
233 ▶     goToComponentWithTemplateFile(client),
234 ▶     goToTemplateForComponent(client),
235 ▶     openJsDocLinkCommand(),
236 ▶     applyCodeActionCommand(client),
237 │   ];
238 │ 
239 │   for (const command of commands) {
240 ▶     const disposable = command.isTextEditorCommand
241 ▶       ? vscode.commands.registerTextEditorCommand(command.id, command.execute)
242 ▶       : vscode.commands.registerCommand(command.id, command.execute);
243 │     context.subscriptions.push(disposable);
244 │   }
245 │ }
```

| コマンド ID | パレットの名前 | 何をするか | サーバーへの要求 |
| --- | --- | --- | --- |
| `angular.restartNgServer` | Restart Angular Language server | `client.stop()` → `client.start()`。プロセスごと作り直す | なし（プロセスの終了と起動） |
| `angular.openLogFile` | Open Angular Server log | `initialize` の答えの `serverOptions.logFile` を開く。無ければ `angular.log` を `verbose` にする提案 | なし |
| `angular.getTemplateTcb` | View Template Typecheck Block | カーソルの位置のテンプレートの TCB を横に開き、対応する範囲を強調 | `angular/getTcb` |
| `angular.goToComponentWithTemplateFile` | Go to component | .html を `templateUrl` に持つコンポーネントへ | `angular/getComponentsWithTemplateFile` |
| `angular.goToTemplateForComponent` | Go to template | コンポーネントからテンプレートへ | `angular/getTemplateLocationForComponent` |
| `angular.openJsDocLink` | （パレットに出ない） | ホバーの JSDoc のリンクを開く | なし |
| `angular.applyCompletionCodeAction` | （パレットに出ない） | 補完で選んだ項目の追加の編集（import の追加など）を適用 | なし（受け取った編集を適用） |

package.json の 31〜56 行目に書かれてパレットに出るのは 5 つで、230〜236 行目で登録するのは 7 つです。残りの 2 つは利用者が選ぶものではなく、サーバーが返した値（ホバーの Markdown のリンク、補完の項目）から呼ばれます。240〜242 行目、エディタが要るコマンドは `registerTextEditorCommand` で登録し、`execute` に今のエディタが渡ります。テンプレートとコンポーネントの行き来の 2 つは[第 6 回](06-ls-external-templates.md)で読みます。ここでは「TCB を見る」を端から端まで追います。

### getTemplateTcb を端から端まで

📄 `angular/vscode-ng-language-service/client/src/commands.ts` L89–127 （▶ の行: 93, 95, 98–100, 109–110, 116–117, 119–122, 124）

```ts
 89 │ function getTemplateTcb(
 90 │   ngClient: AngularLanguageClient,
 91 │   context: vscode.ExtensionContext,
 92 │ ): Command {
 93 ▶   const TCB_HIGHLIGHT_DECORATION = vscode.window.createTextEditorDecorationType({
 94 │     // See https://code.visualstudio.com/api/references/theme-color#editor-colors
 95 ▶     backgroundColor: new vscode.ThemeColor('editor.selectionHighlightBackground'),
 96 │   });
 97 │ 
 98 ▶   const tcbProvider = new TcbContentProvider();
 99 ▶   const disposable = vscode.workspace.registerTextDocumentContentProvider(
100 ▶     ANGULAR_SCHEME,
101 │     tcbProvider,
102 │   );
103 │   context.subscriptions.push(disposable);
104 │ 
105 │   return {
106 │     id: 'angular.getTemplateTcb',
107 │     isTextEditorCommand: true,
108 │     async execute(textEditor: vscode.TextEditor) {
109 ▶       tcbProvider.clear();
110 ▶       const response = await ngClient.getTcbUnderCursor(textEditor);
111 │       if (response === undefined) {
112 │         return undefined;
113 │       }
114 │       // Change the scheme of the URI from `file` to `ng` so that the document
115 │       // content is requested from our own `TcbContentProvider`.
116 ▶       const tcbUri = response.uri.with({
117 ▶         scheme: ANGULAR_SCHEME,
118 │       });
119 ▶       tcbProvider.update(tcbUri, response.content);
120 ▶       const editor = await vscode.window.showTextDocument(tcbUri, {
121 ▶         viewColumn: vscode.ViewColumn.Beside,
122 ▶         preserveFocus: true, // cursor remains in the active editor
123 │       });
124 ▶       editor.setDecorations(TCB_HIGHLIGHT_DECORATION, response.selections);
125 │     },
126 │   };
127 │ }
```

📄 `angular/vscode-ng-language-service/client/src/client.ts` L545–570 （▶ の行: 556–558, 563, 566–568）

```ts
545 │   /**
546 │    * Requests a template typecheck block at the current cursor location in the
547 │    * specified editor.
548 │    */
549 │   async getTcbUnderCursor(textEditor: vscode.TextEditor): Promise<GetTcbResponse | undefined> {
550 │     if (this.client === null) {
551 │       return undefined;
552 │     }
553 │     const c2pConverter = this.client.code2ProtocolConverter;
554 │     // Craft a request by converting vscode params to LSP. The corresponding
555 │     // response is in LSP.
556 ▶     const response = await this.client.sendRequest(GetTcbRequest, {
557 ▶       textDocument: c2pConverter.asTextDocumentIdentifier(textEditor.document),
558 ▶       position: c2pConverter.asPosition(textEditor.selection.active),
559 │     });
560 │     if (response === null) {
561 │       return undefined;
562 │     }
563 ▶     const p2cConverter = this.client.protocol2CodeConverter;
564 │     // Convert the response from LSP back to vscode.
565 │     return {
566 ▶       uri: p2cConverter.asUri(response.uri),
567 ▶       content: response.content,
568 ▶       selections: await p2cConverter.asRanges(response.selections),
569 │     };
570 │   }
```

📄 `angular/vscode-ng-language-service/common/requests.ts` L32–57 （▶ の行: 32, 34, 37, 41, 43–46, 53）

```ts
32 ▶ export interface GetTcbParams {
33 │   textDocument: lsp.TextDocumentIdentifier;
34 ▶   position: lsp.Position;
35 │ }
36 │ 
37 ▶ export const GetTcbRequest = new lsp.RequestType<
38 │   GetTcbParams,
39 │   GetTcbResponse | null,
40 │   /* error */ void
41 ▶ >('angular/getTcb');
42 │ 
43 ▶ export interface GetTcbResponse {
44 ▶   uri: lsp.DocumentUri;
45 ▶   content: string;
46 ▶   selections: lsp.Range[];
47 │ }
48 │ 
49 │ export const IsInAngularProject = new lsp.RequestType<
50 │   IsInAngularProjectParams,
51 │   boolean | null,
52 │   /* error */ void
53 ▶ >('angular/isAngularCoreInOwningProject');
54 │ 
55 │ export interface IsInAngularProjectParams {
56 │   textDocument: lsp.TextDocumentIdentifier;
57 │ }
```

📄 `angular/vscode-ng-language-service/server/src/handlers/tcb.ts` L12–33 （▶ の行: 13, 18–19, 23–24, 29–31）

```ts
12 │ export function onGetTcb(session: Session, params: GetTcbParams): GetTcbResponse | null {
13 ▶   const lsInfo = session.getLSAndScriptInfo(params.textDocument);
14 │   if (lsInfo === null) {
15 │     return null;
16 │   }
17 │   const {languageService, scriptInfo} = lsInfo;
18 ▶   const offset = lspPositionToTsPosition(scriptInfo, params.position);
19 ▶   const response = languageService.getTcb(scriptInfo.fileName, offset);
20 │   if (response === undefined) {
21 │     return null;
22 │   }
23 ▶   const {fileName: tcfName} = response;
24 ▶   const tcfScriptInfo = session.projectService.getScriptInfo(tcfName);
25 │   if (!tcfScriptInfo) {
26 │     return null;
27 │   }
28 │   return {
29 ▶     uri: filePathToUri(tcfName),
30 ▶     content: response.content,
31 ▶     selections: response.selections.map((span) => tsTextSpanToLspRange(tcfScriptInfo, span)),
32 │   };
33 │ }
```

📄 `angular/packages/language-service/src/language_service.ts` L764–803 （▶ の行: 766, 768, 773, 778, 787, 789–792, 797–799）

```ts
764 │   getTcb(fileName: string, position: number): GetTcbResponse | undefined {
765 │     return this.withCompilerAndPerfTracing<GetTcbResponse | undefined>(
766 ▶       PerfPhase.LsTcb,
767 │       (compiler) => {
768 ▶         const typeCheckInfo = getTypeCheckInfoAtPosition(fileName, position, compiler);
769 │         if (typeCheckInfo === undefined) {
770 │           return undefined;
771 │         }
772 │ 
773 ▶         const tcb = compiler.getTemplateTypeChecker().getTypeCheckBlock(typeCheckInfo.declaration);
774 │         if (tcb === null) {
775 │           return undefined;
776 │         }
777 │ 
778 ▶         const selectionNodesInfo = getTcbNodesOfTemplateAtPosition(
779 │           typeCheckInfo.nodes,
780 │           position,
781 │           tcb,
782 │         );
783 │         if (selectionNodesInfo === null) {
784 │           return undefined;
785 │         }
786 │ 
787 ▶         const sf = selectionNodesInfo.componentTcbNode.getSourceFile();
788 │ 
789 ▶         const selections = selectionNodesInfo.nodes.map((n) => {
790 ▶           return {
791 ▶             start: n.getStart(sf),
792 ▶             length: n.getEnd() - n.getStart(sf),
793 │           };
794 │         });
795 │ 
796 │         return {
797 ▶           fileName: sf.fileName,
798 ▶           content: sf.getFullText(),
799 ▶           selections,
800 │         };
801 │       },
802 │     );
803 │   }
```

📄 `angular/vscode-ng-language-service/client/src/providers.ts` L37–63 （▶ の行: 42, 44, 48, 51, 54, 57）

```ts
37 │   /**
38 │    * This callback is invoked only when user explicitly requests to view or
39 │    * update typecheck file. We do not automatically update the typecheck document
40 │    * when the source file changes.
41 │    */
42 ▶   readonly onDidChange = this.onDidChangeEmitter.event;
43 │ 
44 ▶   provideTextDocumentContent(
45 │     uri: vscode.Uri,
46 │     token: vscode.CancellationToken,
47 │   ): vscode.ProviderResult<string> {
48 ▶     if (uri.toString() !== this.tcbFile?.toString()) {
49 │       return null;
50 │     }
51 ▶     return this.tcbContent;
52 │   }
53 │ 
54 ▶   update(uri: vscode.Uri, content: string) {
55 │     this.tcbFile = uri;
56 │     this.tcbContent = content;
57 ▶     this.onDidChangeEmitter.fire(uri);
58 │   }
59 │ 
60 │   clear() {
61 │     this.tcbFile = null;
62 │     this.tcbContent = null;
63 │   }
```

1. **拡張：commands.ts 110 行目 → client.ts 556 行目**

   コマンドは `getTcbUnderCursor` を呼び、557〜558 行目で今の文書とカーソル（`selection.active`）を LSP の形（URI と 0 始まりの行・文字）に直して、556 行目で独自の要求 `GetTcbRequest` を送ります。
2. **型：requests.ts 37〜41 行目**

   メソッド名は `angular/getTcb`。引数（32〜35 行目）と答え（43〜47 行目：TCB の入ったファイルの URI、その全文、強調する範囲の配列）の型は、拡張とサーバーがこの 1 つのファイルを共有します。53 行目は 5 節の `isAngularCoreInOwningProject` です。
3. **サーバー：handlers/tcb.ts 13〜19 行目**

   13 行目でファイルの言語サービスを取り出し（[第 1 回](01-ls-overview.md)の 1 節）、18 行目で「行と文字」をファイルの中の文字数に直し、19 行目で `languageService.getTcb` を呼びます。プラグインはこれをそのまま `LanguageService` に渡します（第 4 回）。
4. **LanguageService：language\_service.ts 768〜782 行目**

   768 行目で、位置からコンポーネントとテンプレートのノードを探します（`getTypeCheckInfoAtPosition`。[第 7 回](07-ls-template-target.md)）。773 行目で `TemplateTypeChecker.getTypeCheckBlock` にコンポーネントのクラスを渡して TCB の関数の `ts.Node` を受け取り、778 行目の `getTcbNodesOfTemplateAtPosition` でカーソルの下のテンプレートのノードに対応する TCB の中のノードを探します（位置コメントで探す。第 7 回）。
5. **LanguageService：787〜800 行目**

   787 行目、TCB は 1 つの `ts.SourceFile`（`.ngtypecheck.ts` の shim、または inline の TCB なら元のファイルの写し）の中にあります。789〜794 行目で強調する範囲を「そのファイルの中の開始と長さ」にし、798 行目で**ファイルの全文**を返します。TCB の関数 1 つではなく、import や型コンストラクタを含むファイル全体が見えるのはこのためです。
6. **サーバー：tcb.ts 23〜31 行目**

   24 行目で TCB のファイルの `ScriptInfo` を取り、31 行目でその `ScriptInfo` を使って範囲を LSP の「行と文字」に直します。元のファイルではなく TCB のファイルの行で数えるのが要点です。
7. **拡張：commands.ts 116〜124 行目**

   116〜118 行目で URI のスキームを `file` から `ng` に変えます。98〜102 行目で登録した `TcbContentProvider` が `ng:` の文書の中身を返すからです。119 行目で中身を渡し、120〜123 行目で横の列に、フォーカスを移さずに開き、124 行目で 93〜96 行目の背景色で範囲を強調します。
8. **providers.ts：読み取り専用の仮想の文書**

   44〜52 行目、覚えている URI と同じものを求められたときだけ中身を返します。54〜57 行目で中身を差し替えたら `onDidChange` を発火し、VS Code に前に開いた同じ URI の中身を捨てさせます。38〜41 行目のコメントのとおり、元のファイルを書き換えても自動では更新されません。もう一度コマンドを実行します。

### angular.openJsDocLink：信頼するコマンドを 1 つに絞る

📄 `angular/vscode-ng-language-service/client/src/commands.ts` L182–208 （▶ の行: 189, 192, 195–199）

```ts
182 │ /**
183 │  * Proxy command for opening links in jsdoc comments.
184 │  *
185 │  * This is needed to avoid VS Code incorrectly rewriting file names.
186 │  */
187 │ function openJsDocLinkCommand(): Command<OpenJsDocLinkCommand_Args> {
188 │   return {
189 ▶     id: OpenJsDocLinkCommandId,
190 │     isTextEditorCommand: false,
191 │     async execute(args) {
192 ▶       if (typeof args?.file !== 'string' || args.file.length === 0) {
193 │         return;
194 │       }
195 ▶       // Command URI arguments are untrusted. This value is a filesystem path, so use `Uri.file`
196 ▶       // to prevent URI schemes from selecting another VS Code resource provider.
197 ▶       // https://code.visualstudio.com/api/references/vscode-api#Uri.file
198 ▶       const uri = vscode.Uri.file(args.file);
199 ▶       const document = await vscode.workspace.openTextDocument(uri);
200 │       return await vscode.window.showTextDocument(document, {
201 │         selection: new vscode.Range(
202 │           new vscode.Position(args.position?.start.line ?? 0, args.position?.start.character ?? 0),
203 │           new vscode.Position(args.position?.end.line ?? 0, args.position?.end.character ?? 0),
204 │         ),
205 │       });
206 │     },
207 │   };
208 │ }
```

ホバーに出る JSDoc の `{@link …}` は、サーバーが `command:angular.openJsDocLink?…` という Markdown のリンクに直して返します（[第 9 回](09-ls-quick-info.md)の text\_render.ts）。Markdown の中のコマンドのリンクは、5 節の引用の 100〜102 行目で `enabledCommands: [OpenJsDocLinkCommandId]` と書いた**このコマンドだけ**が押せます（3403e79f9f6c、2026-05-20）。そのうえで 69c87301aa5（2026-08-18、#70512）が、このコマンドの引数を 198 行目の `vscode.Uri.file` で読むように変えました。前は `vscode.Uri.parse(args.file)` で、細工した JSDoc から `file:` 以外のスキームの URI を渡すと、VS Code の別の提供者に文書を開かせられたからです。192 行目で引数が空でない文字列であることも確かめます。195〜197 行目のコメントが理由を書いています。

## テストと直し方

📄 `angular/vscode-ng-language-service/client/src/tests/embedded_support_spec.ts` L16–37 （▶ の行: 17, 19, 22, 24, 26, 30, 32, 34）

```ts
16 │ describe('embedded language support', () => {
17 ▶   describe('isInsideAngularContext', () => {
18 │     it('empty file', () => {
19 ▶       test('¦', isNotTypescriptOrSupportedDecoratorField, false);
20 │     });
21 │ 
22 ▶     it('just after template', () => {
23 │       test(
24 ▶         `const foo = {template: '<div></div>'¦}`,
25 │         isNotTypescriptOrSupportedDecoratorField,
26 ▶         false,
27 │       );
28 │     });
29 │ 
30 ▶     it('inside template', () => {
31 │       test(
32 ▶         `const foo = {template: '<div>¦</div>'}`,
33 │         isNotTypescriptOrSupportedDecoratorField,
34 ▶         true,
35 │       );
36 │     });
37 │ 
```

📄 `angular/vscode-ng-language-service/client/src/tests/extension_spec.ts` L13–30 （▶ の行: 13–14, 17, 19, 28–29）

```ts
13 ▶ describe('extension config restart policy', () => {
14 ▶   it('does not restart for inlay-only angular settings', () => {
15 │     expect(
16 │       shouldRestartOnConfigurationChange(
17 ▶         createConfigChangeEvent(['angular', 'angular.inlayHints']),
18 │       ),
19 ▶     ).toBeFalse();
20 │   });
21 │ 
22 │   it('does not restart for editor inlay hints only', () => {
23 │     expect(
24 │       shouldRestartOnConfigurationChange(createConfigChangeEvent(['editor.inlayHints'])),
25 │     ).toBeFalse();
26 │   });
27 │ 
28 ▶   it('restarts for non-inlay angular settings', () => {
29 ▶     expect(shouldRestartOnConfigurationChange(createConfigChangeEvent(['angular.log']))).toBeTrue();
30 │   });
```

5 節の判定は `client/src/tests/embedded_support_spec.ts` の describe('isInsideAngularContext')（17 行目、it 10 本）と、同じファイルの describe('isNotTypescriptOrSupportedDecoratorRange')（it 3 本）が確かめます。カーソルは言語サービスの spec と同じ `¦` で書き、22〜28 行目「`template` の文字列の直後」なら偽、30〜36 行目「文字列の中」なら真、を見ます。1 節の再起動の判定は `extension_spec.ts` の describe('extension config restart policy')（13 行目、it 7 本）です。どちらも `vscode` を import せずに（型だけ）確かめられるよう、判定を別のファイルに出してあります。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //vscode-ng-language-service/client/src/tests:test \
  --nocache_test_results --test_output=all
pnpm bazel test //vscode-ng-language-service/common/tests:test \
  --nocache_test_results --test_output=all
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //vscode-ng-language-service/client/src/tests:test:
20 specs, 0 failures
Finished in 0.004 seconds
INFO: Elapsed time: 0.418s, Critical Path: 0.23s
//vscode-ng-language-service/client/src/tests:test                       PASSED in 0.2s
==================== Test output for //vscode-ng-language-service/common/tests:test:
2 specs, 0 failures
Finished in 0.003 seconds
INFO: Elapsed time: 0.280s, Critical Path: 0.13s
//vscode-ng-language-service/common/tests:test                           PASSED in 0.1s
```

1. **件数**

   client は 13 + 7 = 20 specs（0.2 秒）、common は resolver\_spec.ts の describe('Version') の 2 specs（0.1 秒）で、どちらも spec のファイルの it の数と一致しました。
2. **直すとしたら**

   「インラインテンプレートで補完やホバーが出ない／TS の普通の場所で Angular が答えてしまう」なら `embedded_support.ts` の `isPropertyAssignmentToStringOrStringInArray` で、spec は embedded\_support\_spec.ts に `test('…¦…', 判定, 期待)` の 1 行を足します。「設定を変えたのに反映されない」なら `config_change.ts` と extension\_spec.ts。サーバーの起動の引数（3 節）は spec がありません。引数の読み取り側（サーバーの `cmdline_utils.ts`）の spec は[第 3 回](03-ls-server-session.md)です。`getTcb` は[第 1 回](01-ls-overview.md)の gettcb\_spec.ts（6 本）で、LSP の往復まで含めると ivy\_spec.ts の it('should handle getTcb request') ですが、後者はこのスナップショットではビルドできません。
3. **関係する issue**

   閉じたもの：#70176（TSDK の承認の通知へのコマンド URI の注入）・#70512（`openJsDocLink`）・#69276（相対パスの tsdk が使われない）・#69145（ワークスペースの TypeScript を使いたい。ed2420c0f8b で設定の読み方を直して閉じた）。開いているもの：#65483（拡張とプロジェクトの Angular の版の関係を文書に）。一覧は[第 20 回](20-ls-issues.md)。

## 聞かれそうな質問

**Q. TS のファイルを開いただけで Angular のサーバーが起動するのはなぜですか？**

package.json の 390〜391 行目の activation event が `onLanguage:html` と `onLanguage:typescript` だからです。起動したあと、Angular のプロジェクトかどうかはサーバーに尋ね（client.ts 327 行目）、違えば middleware が要求を送りません（171 行目）。ただし信頼されていないワークスペースでは起動しません（extension.ts 39〜45 行目）。

**Q. インラインテンプレートで HTML のタグの説明が出るのは Angular の機能ですか？**

Angular のサーバーが答えなかったときの、VS Code の HTML の機能です。client.ts の 181 行目でファイル全体を `.html` の仮想の文書にし、183 行目で HTML の提供者に尋ね、192 行目で Angular の答えが無いときにそれを返します。

**Q. 「View Template Typecheck Block」で出るのは TCB の関数だけですか？**

TCB の入った `ts.SourceFile` の全文です（language\_service.ts の 798 行目の `getFullText()`）。強調される範囲は 789〜794 行目で作った、カーソルの下のノードに対応する部分です。開いた文書は読み取り専用の仮想の文書で（providers.ts）、元を書き換えても自動では更新されません。

**Q. ワークスペースの `typescript.tsdk` を書いたのに、同梱の TypeScript が使われます。**

初めてのときは、確認の通知に答えるまで同梱のもので起動します（client.ts の 669 行目は待たず、676 行目へ落ちる）。「Allow」を押すと 691 行目で保存し 693 行目で再起動するので、2 回目の起動から使われます。「Disallow」を選んだことも 696 行目で保存されるので、それ以後は尋ねられません。信頼されていないワークスペースでは、ワークスペースの値は 638 行目で読まれません。

## 読み終えて

- 拡張は HTML か TS を開くと読み込まれ、信頼されたワークスペースでだけ、サーバーを Node の IPC の子プロセスとして起動する。設定はすべてコマンドラインの引数で渡す。
- 言語サービスと TypeScript を探す場所として渡すのは拡張のディレクトリだけ。ワークスペースの TypeScript は、利用者が許したときだけ `--tsdk` で渡る。
- 拡張は HTML と TS の全部の言語サーバーとして登録し、middleware と字句だけの判定で「Angular のプロジェクトの、デコレータの文字列の中」に絞って送る。
- 独自のコマンドは `common/requests.ts` の型を共有する独自の LSP 要求になる。`getTcb` は TCB のファイルの全文と、そのファイルの中の範囲を返す。
- 2026 年の修正で、Markdown のコマンドは `openJsDocLink` だけを信頼し、その引数は `Uri.file` で読み、tsdk の承認の通知にはパスを出さない。

---

← 前: [言語サービスの全体像：拡張・サーバー・プラグイン・LanguageService](01-ls-overview.md)  
次: [LSP サーバーと Session：tsserver をライブラリとして動かす](03-ls-server-session.md) →
