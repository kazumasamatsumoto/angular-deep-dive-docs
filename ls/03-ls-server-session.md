[目次](../README.md) › [言語サービスの内側](README.md) › 第 3 回 / 全 20 回

# LSP サーバーと Session：tsserver をライブラリとして動かす

> server.ts が引数を読み、banner の require の差し替えで決まった 1 つの TypeScript を読み込んで Session を作る順番。Session が ts.server.ProjectService を globalPlugins に Angular のプラグインを入れて作る行と ServerHost。LSP の要求（hover・completion など）を handlers/ の関数に振り分ける表、ファイルの開閉と変更（差分ごとの ScriptInfo.editContent）の伝え方、プロジェクトを読み終えたときに @angular/core を探して言語サービスを有効・無効にする流れ。version\_provider が拡張に同梱の @angular/language-service と、許可された tsdk か同梱の typescript を探す仕組み。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ls-server-session)

---

LSP サーバーは「tsserver を動かす」のではなく、`typescript` パッケージの `ts.server.ProjectService`（tsserver の中でプロジェクトとファイルを管理している部品）を**ライブラリとして**自分で作り、LSP の要求をその上の言語サービスの呼び出しに直すプログラムです。この章では、起動の順番（引数 → どの TypeScript を読むか → ロガー → `Session` → `listen`）、`Session` が `ProjectService` を作る行、LSP の要求を `handlers/` に振り分ける表、ファイルを開く・変える・閉じるが `ProjectService` に伝わる行、プロジェクトを読み終えたときの流れ、そして `version_provider.ts` が `@angular/language-service` と `typescript` を探す順番を読みます。

読む対象は `vscode-ng-language-service/server/src/` の `server.ts`・`banner.ts`・`cmdline_utils.ts`・`logger.ts`・`version_provider.ts`・`session.ts`・`server_host.ts`・`utils.ts`・`handlers/initialization.ts`・`handlers/did_change_watched_files.ts`、共通の `common/resolver.ts` です。

1. [1. 全体像](01-ls-overview.md)
2. [2. VS Code クライアント](02-ls-client.md)
3. **3. LSP サーバー**（この章）
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

## 1. server.ts：起動の順番

📄 `angular/vscode-ng-language-service/server/src/server.ts` L9–33 （▶ の行: 9, 14–17, 27, 32–33）

```ts
 9 ▶ import {version as tsServerVersion} from 'typescript/lib/tsserverlibrary';
10 │ 
11 │ import {generateHelpMessage, parseCommandLine} from './cmdline_utils';
12 │ 
13 │ // Parse command line arguments
14 ▶ const options = parseCommandLine(process.argv);
15 ▶ if (options.help) {
16 ▶   console.error(generateHelpMessage(process.argv));
17 ▶   process.exit(0);
18 │ }
19 │ 
20 │ import {createLogger} from './logger';
21 │ import {ServerHost} from './server_host';
22 │ import {Session} from './session';
23 │ import {resolveNgLangSvc, resolveTsServer} from './version_provider';
24 │ 
25 │ function main() {
26 │   // Create a logger that logs to file. OK to emit verbose entries.
27 ▶   const logger = createLogger({
28 │     logFile: options.logFile,
29 │     logVerbosity: options.logVerbosity,
30 │   });
31 │ 
32 ▶   const ts = resolveTsServer(options.tsProbeLocations, options.tsdk);
33 ▶   const ng = resolveNgLangSvc(options.ngProbeLocations);
```

📄 `angular/vscode-ng-language-service/server/src/server.ts` L35–74 （▶ の行: 35, 38, 41, 45–46, 51, 54, 60–61, 71）

```ts
35 ▶   const isG3 = ts.resolvedPath.includes('/google3/');
36 │ 
37 │   // ServerHost provides native OS functionality
38 ▶   const host = new ServerHost(isG3, options.useClientSideFileWatcher ?? false);
39 │ 
40 │   // Establish a new server session that encapsulates lsp connection.
41 ▶   const session = new Session({
42 │     host,
43 │     logger,
44 │     // TypeScript allows only package names as plugin names.
45 ▶     ngPlugin: '@angular/language-service',
46 ▶     resolvedNgLsPath: ng.resolvedPath,
47 │     logToConsole: options.logToConsole,
48 │     includeAutomaticOptionalChainCompletions: options.includeAutomaticOptionalChainCompletions,
49 │     includeCompletionsWithSnippetText: options.includeCompletionsWithSnippetText,
50 │     includeCompletionsForModuleExports: options.includeCompletionsForModuleExports,
51 ▶     forceStrictTemplates: isG3 || options.forceStrictTemplates,
52 │     disableBlockSyntax: options.disableBlockSyntax,
53 │     disableLetSyntax: options.disableLetSyntax,
54 ▶     angularCoreVersion: options.angularCoreVersion ?? null,
55 │     suppressAngularDiagnosticCodes: options.suppressAngularDiagnosticCodes ?? null,
56 │   });
57 │ 
58 │   // Log initialization info
59 │   session.info(`Angular language server process ID: ${process.pid}`);
60 ▶   session.info(`Imported typescript/lib/tsserverlibrary is version ${tsServerVersion}.`);
61 ▶   session.info(`Using ${ng.name} v${ng.version} from ${ng.resolvedPath}`);
62 │   if (logger.loggingEnabled()) {
63 │     session.info(`Log file: ${logger.getLogFileName()}`);
64 │   } else {
65 │     session.info(`Logging is turned off. To enable, run command 'Open Angular server log'.`);
66 │   }
67 │   if (process.env.NG_DEBUG === 'true') {
68 │     session.info('Angular Language Service is running under DEBUG mode');
69 │   }
70 │ 
71 ▶   session.listen();
72 │ }
73 │ 
74 │ main();
```

1. **14 行目：引数を読む**

   [第 2 回](02-ls-client.md)の `constructArgs` が作った引数を `parseCommandLine`（2 節）で読みます。15〜18 行目、`--help` なら使い方を出して終わります（他のエディタから `ngserver --help` で見られる）。
2. **27〜30 行目：ファイルに書くロガー**

   ログのファイルと詳しさは 2 節の引数から。ファイルが無ければ何も書きません。
3. **32〜33 行目：TypeScript と言語サービスの場所を決める**

   5 節の `version_provider.ts` です。ここで決まるのは「場所」で、実際の読み込みは 9 行目の import が先に済ませています（3 節で、その 9 行目がどう場所を知るかを読みます）。
4. **35〜38 行目：ServerHost**

   35 行目、TypeScript の場所が `/google3/` の下なら Google の社内の環境とみなし、51 行目で strictTemplates を強制します（ServerHost も `/google/src` の下のディレクトリを監視しません）。38 行目の `ServerHost` は OS の機能（ファイルの読み書き・監視・タイマー・`require`）を `ProjectService` に渡す口です。
5. **41〜56 行目：Session を作る**

   45 行目、tsserver に読ませるプラグインの名前は `'@angular/language-service'`（44 行目のコメントのとおり、TypeScript はパッケージの名前しか受け付けない）。46 行目にその実際の場所を、48〜55 行目に第 2 回の引数の値を渡します。54 行目の `angularCoreVersion` は無ければ `null`。
6. **59〜71 行目：最初のログと listen**

   60 行目で「読み込んだ tsserverlibrary の版」、61 行目で「どこの言語サービスの何版か」をログに出します。動作を疑うときは、まず出力パネルのこの 2 行を見ます。71 行目の `listen()` で LSP の受け付けを始めます。

## 2. 引数と、LSP の運び方

📄 `angular/vscode-ng-language-service/server/src/cmdline_utils.ts` L76–101 （▶ の行: 81–84, 90, 95–97）

```ts
 76 │ export function parseCommandLine(argv: string[]): CommandLineOptions {
 77 │   return {
 78 │     help: hasArgument(argv, '--help'),
 79 │     logFile: findArgument(argv, '--logFile'),
 80 │     logVerbosity: findArgument(argv, '--logVerbosity'),
 81 ▶     logToConsole: hasArgument(argv, '--logToConsole'),
 82 ▶     ngProbeLocations: parseStringArray(argv, '--ngProbeLocations'),
 83 ▶     tsProbeLocations: parseStringArray(argv, '--tsProbeLocations'),
 84 ▶     tsdk: findArgument(argv, '--tsdk') ?? null,
 85 │     includeAutomaticOptionalChainCompletions: hasArgument(
 86 │       argv,
 87 │       '--includeAutomaticOptionalChainCompletions',
 88 │     ),
 89 │     includeCompletionsWithSnippetText: hasArgument(argv, '--includeCompletionsWithSnippetText'),
 90 ▶     includeCompletionsForModuleExports: parseBooleanArgument(
 91 │       argv,
 92 │       '--includeCompletionsForModuleExports',
 93 │     ),
 94 │     forceStrictTemplates: hasArgument(argv, '--forceStrictTemplates'),
 95 ▶     disableBlockSyntax: hasArgument(argv, '--disableBlockSyntax'),
 96 ▶     disableLetSyntax: hasArgument(argv, '--disableLetSyntax'),
 97 ▶     angularCoreVersion: findArgument(argv, '--angularCoreVersion'),
 98 │     suppressAngularDiagnosticCodes: findArgument(argv, '--suppressAngularDiagnosticCodes'),
 99 │     useClientSideFileWatcher: hasArgument(argv, '--useClientSideFileWatcher'),
100 │   };
101 │ }
```

📄 `angular/vscode-ng-language-service/server/src/cmdline_utils.ts` L103–125 （▶ の行: 113–114, 120–124）

```ts
103 │ export function generateHelpMessage(argv: string[]) {
104 │   return `Angular Language Service that implements the Language Server Protocol (LSP).
105 │ 
106 │   Usage: ${argv[0]} ${argv[1]} [options]
107 │ 
108 │   Options:
109 │     --help: Prints help message.
110 │     --logFile: Location to log messages. Logging to file is disabled if not provided.
111 │     --logVerbosity: terse|normal|verbose|requestTime. See ts.server.LogLevel.
112 │     --logToConsole: Enables logging to console via 'window/logMessage'. Defaults to false.
113 ▶     --ngProbeLocations: Path of @angular/language-service. Required.
114 ▶     --tsProbeLocations: Path of typescript. Required.
115 │     --includeAutomaticOptionalChainCompletions: Shows completions on potentially undefined values that insert an optional chain call. Requires TS 3.7+ and strict null checks to be enabled.
116 │     --includeCompletionsWithSnippetText: Enables snippet completions from Angular language server;
117 │     --forceStrictTemplates: Forces the language service to use strictTemplates and ignore the user settings in the 'tsconfig.json'.
118 │     --suppressAngularDiagnosticCodes: A comma-separated list of error codes in templates whose diagnostics should be ignored.
119 │ 
120 ▶   Additional options supported by vscode-languageserver:
121 ▶     --clientProcessId=<number>: Automatically kills the server if the client process dies.
122 ▶     --node-ipc: Communicate using Node's IPC. This is the default.
123 ▶     --stdio: Communicate over stdin/stdout.
124 ▶     --socket=<number>: Communicate using Unix socket.
125 │   `;
```

82〜83 行目、探す場所はカンマ区切りの配列です。90〜93 行目の `--includeCompletionsForModuleExports` だけは値を取る真偽値で、付けなければ真です（第 2 回で拡張は常に付けて値を渡す）。120〜124 行目、LSP の運び方の引数（`--node-ipc`・`--stdio`・`--socket`・`--clientProcessId`）はこのファイルでは読まず、`vscode-languageserver` が読みます。VS Code の拡張は `TransportKind.ipc` で起動するので、`vscode-languageclient`（node\_modules の `lib/node/main.js`）が子プロセスに `--node-ipc` と `--clientProcessId=…` を付けます。他のエディタは `--stdio` で起動できます。そのときの注意が logger.ts にあります。

📄 `angular/vscode-ng-language-service/server/src/logger.ts` L13–30 （▶ の行: 18–20, 26–30）

```ts
13 │ // NOTES:
14 │ // Be very careful about logging. There are two types of logging:
15 │ // 1. Console
16 │ // 2. File
17 │ // The language server could operate in a few different modes, depending on
18 ▶ // startup options. `process.argv` is parsed by `vscode-languageserver` when
19 ▶ // createConnection() is called.
20 ▶ // By default, the server communicates with the client through Node IPC.
21 │ // In this case, logging to stdout/stderr would be piped to VSCode's
22 │ // development console (Output tab in vscode).
23 │ // Verbose log should not be sent to the client as it could negatively impact
24 │ // performance. Instead, verbose log entries should be written to file using
25 │ // the Logger class here.
26 ▶ // The language server could also operate in JSON-RPC mode via stdin/stdout.
27 ▶ // In this case, there must not be any logging done through console.log(),
28 ▶ // console.info() etc, as it could pollute the communication channel.
29 ▶ // TLDR: To log to development console, always use connection.console.log().
30 ▶ // Never use console.log(), console.info(), etc directly.
```

18〜19 行目、`process.argv` は `createConnection()` のときに `vscode-languageserver` が読みます。26〜28 行目、stdin/stdout で JSON-RPC を話すときに `console.log()` を使うと通り道を汚します。だから 29〜30 行目のとおり、出力パネルに出すときは `connection.console`、それ以外はファイルのロガーを使います（`Session.info` などがこの 2 つに振り分ける）。

## 3. どの TypeScript を読み込むか：banner の require の差し替え

1 節の 9 行目は `import … from 'typescript/lib/tsserverlibrary'` と書いているだけです。それなのに `--tsdk` の TypeScript が使われるのは、ビルドで `require` そのものを差し替えているからです。

📄 `angular/vscode-ng-language-service/server/src/banner.ts` L12–40 （▶ の行: 12, 28, 30–31, 33–35, 37）

```ts
12 ▶ const originalRequire = require;
13 │ 
14 │ /**
15 │  * This method provides a custom implementation for the require function to resolve
16 │  * `typescript` module at runtime. We provide this as an override to the built-in
17 │  * 'require' method using the banner funcionality of esbuild. That is, esbuild will
18 │  * compile the server and add this banner to the top of the compilation so any place
19 │  * in the server code that uses `require` will get routed through this override.
20 │  *
21 │  * Refer also to `esbuild` rules in the server package, the `bannerConfig` which overrides the
22 │  * `require` using the `footer` option, and the `serverConfig` which provides the banner code at the
23 │  * top of the server output using the `banner` option.
24 │  *
25 │  * @param moduleName The module to resolve
26 │  * @returns
27 │  */
28 ▶ export function requireOverride(moduleName: string) {
29 │   const TSSERVER = 'typescript/lib/tsserverlibrary';
30 ▶   if (moduleName === 'typescript') {
31 ▶     throw new Error(`Import '${TSSERVER}' instead of 'typescript'`);
32 │   }
33 ▶   if (moduleName === TSSERVER) {
34 ▶     const {tsProbeLocations, tsdk} = parseCommandLine(process.argv);
35 ▶     moduleName = resolveTsServer(tsProbeLocations, tsdk).resolvedPath;
36 │   }
37 ▶   return originalRequire(moduleName);
38 │ }
39 │ 
40 │ requireOverride.resolve = originalRequire.resolve;
```

📄 `angular/vscode-ng-language-service/server/BUILD.bazel` L8–46 （▶ の行: 9, 14, 33, 36, 38, 43–45）

```python
 8 │ esbuild(
 9 ▶     name = "banner",
10 │     config = {
11 │         # This is described in more detail in the `server/banner.ts` but this line actually overrides
12 │         # the built-in `require` function by adding a line at the bottom of the generated banner code
13 │         # to assign the override function to the `require` name.
14 ▶         "footer": {"js": "require = requireOverride;"},
15 │         # Workaround for https://github.com/aspect-build/rules_esbuild/issues/58
16 │         "resolveExtensions": [".js"],
17 │     },
18 │     entry_point = "//vscode-ng-language-service/server/src:banner.js",
19 │     external = [
20 │         "path",
21 │     ],
22 │     format = "cjs",
23 │     # Do not enable minification. It seems to break the extension on Windows (with WSL). See #1198.
24 │     minify = False,
25 │     platform = "node",
26 │     sourcemap = "linked",
27 │     deps = [
28 │         "//:node_modules/source-map-support",
29 │         "//vscode-ng-language-service/server/src",
30 │     ],
31 │ )
32 │ 
33 ▶ esbuild(
34 │     name = "index",
35 │     srcs = [
36 ▶         ":banner",
37 │     ],
38 ▶     config = "esbuild.mjs",
39 │     data = [
40 │         "//vscode-ng-language-service/server:node_modules/@angular/language-service",
41 │         "//vscode-ng-language-service/server:node_modules/typescript",
42 │     ],
43 ▶     entry_point = "//vscode-ng-language-service/server/src:server.js",
44 ▶     external = [
45 ▶         "typescript/lib/tsserverlibrary",
46 │     ],
```

1. **BUILD.bazel 9〜31 行目：banner.ts を 1 つの JS にする**

   14 行目の `footer` で、出力の最後に `require = requireOverride;` の 1 行を足します。
2. **33〜45 行目：サーバー本体の前に、その JS を貼る**

   36 行目でその出力を材料にし、38 行目の esbuild.mjs が `banner`（出力の先頭に貼る文字列）として読み込みます。44〜45 行目、`typescript/lib/tsserverlibrary` は束ねずに外に残すので、サーバーの中のこの名前の import は実行時の `require(…)` になります。
3. **banner.ts 33〜35 行目：その require を横取りする**

   名前が `typescript/lib/tsserverlibrary` なら、34 行目で引数をもう一度読み、35 行目で 5 節の `resolveTsServer` が返した**ファイルの場所**に置き換えてから、37 行目で本来の `require` を呼びます。30〜31 行目、`'typescript'` と書いた require は「`typescript/lib/tsserverlibrary` を import せよ」という例外にしています。`'typescript'` の名前は 33 行目の差し替えの対象ではないので、許せば `--tsdk` と違う場所の TypeScript が読まれるからです。

## 4. Session と ProjectService

📄 `angular/vscode-ng-language-service/server/src/session.ts` L120–153 （▶ の行: 128–130, 133, 138, 146, 151–152）

```ts
120 │   constructor(options: SessionOptions) {
121 │     this.includeAutomaticOptionalChainCompletions =
122 │       options.includeAutomaticOptionalChainCompletions;
123 │     this.includeCompletionsWithSnippetText = options.includeCompletionsWithSnippetText;
124 │     this.includeCompletionsForModuleExports = options.includeCompletionsForModuleExports;
125 │     this.logger = options.logger;
126 │     this.host = options.host;
127 │     this.logToConsole = options.logToConsole;
128 ▶     this.defaultPreferences = {
129 ▶       ...this.defaultPreferences,
130 ▶       includeCompletionsForModuleExports: options.includeCompletionsForModuleExports,
131 │     };
132 │     // Create a connection for the server. The connection uses Node's IPC as a transport.
133 ▶     this.connection = lsp.createConnection({
134 │       // cancelUndispatched is a "middleware" to handle all cancellation requests.
135 │       // LSP spec requires every request to send a response back, even if it is
136 │       // cancelled. See
137 │       // https://microsoft.github.io/language-server-protocol/specifications/specification-current/#cancelRequest
138 ▶       cancelUndispatched(message: lsp.Message): lsp.ResponseMessage | undefined {
139 │         return {
140 │           jsonrpc: message.jsonrpc,
141 │           // This ID is just a placeholder to satisfy the ResponseMessage type.
142 │           // `vscode-jsonrpc` will replace the ID with the ID of the message to
143 │           // be cancelled. See
144 │           // https://github.com/microsoft/vscode-languageserver-node/blob/193f06bf602ee1120afda8f0bac33c5161cab18e/jsonrpc/src/common/connection.ts#L619
145 │           id: -1,
146 ▶           error: new lsp.ResponseError(lsp.LSPErrorCodes.RequestCancelled, 'Request cancelled'),
147 │         };
148 │       },
149 │     });
150 │ 
151 ▶     this.addProtocolHandlers(this.connection);
152 ▶     this.projectService = this.createProjectService(options);
153 │   }
```

133 行目の `createConnection` が LSP の接続です（2 節の引数で運び方が決まる）。138〜147 行目の `cancelUndispatched` は、取り消された要求にも「取り消された」というエラーの応答を返すための口です（LSP の決まりでは全部の要求に応答が要る）。151 行目で要求の受け手を登録し（5 節）、152 行目で `ProjectService` を作ります。

📄 `angular/vscode-ng-language-service/server/src/session.ts` L155–176 （▶ の行: 156–157, 159, 162, 168–171, 173–174）

```ts
155 │   private createProjectService(options: SessionOptions): ts.server.ProjectService {
156 ▶     const projSvc = new ts.server.ProjectService({
157 ▶       host: options.host,
158 │       logger: options.logger,
159 ▶       cancellationToken: ts.server.nullCancellationToken,
160 │       useSingleInferredProject: true,
161 │       useInferredProjectPerProjectRoot: true,
162 ▶       typingsInstaller: ts.server.nullTypingsInstaller,
163 │       // Not supressing diagnostic events can cause a type error to be thrown when the
164 │       // language server session gets an event for a file that is outside the project
165 │       // managed by the project service, and for which a program does not exist in the
166 │       // corresponding project's language service.
167 │       // See https://github.com/angular/vscode-ng-language-service/issues/693
168 ▶       suppressDiagnosticEvents: true,
169 ▶       eventHandler: (e) => this.handleProjectServiceEvent(e),
170 ▶       globalPlugins: [options.ngPlugin],
171 ▶       pluginProbeLocations: [options.resolvedNgLsPath],
172 │       // do not resolve plugins from the directory where tsconfig.json is located
173 ▶       allowLocalPluginLoads: false,
174 ▶       session: undefined,
175 │     });
176 │ 
```

1. **156〜157 行目：tsserver と同じ ProjectService を、自分の ServerHost で作る**

   tsserver の実行ファイルは起動しません。`ProjectService` は tsconfig.json を見つけてプロジェクトを作り、ファイルの中身（`ScriptInfo`）と言語サービスを持つ部品です。
2. **159・162 行目：取り消しと型の自動取得は使わない**

   `nullCancellationToken` は「決して取り消されない」、`nullTypingsInstaller` は `@types` を自動で入れる仕組みを使わない、の意味です。
3. **168〜169 行目：診断のイベントは止め、プロジェクトのイベントだけ受ける**

   tsserver が自分で診断を送る仕組みは止めて（163〜167 行目のコメントに理由）、169 行目の `handleProjectServiceEvent`（7 節）でプロジェクトの読み込みなどのイベントだけを受けます。診断は Session が自分で求めて送ります（[第 8 回](08-ls-diagnostics.md)）。
4. **170〜173 行目：Angular のプラグインを「全部のプロジェクトに」入れる**

   170 行目の `globalPlugins` は tsconfig.json の `plugins` に書かなくても全部のプロジェクトに入るプラグインです。171 行目、それを探す場所は 1 節の 46 行目の場所（拡張に同梱の言語サービス）だけ。173 行目、tsconfig.json のある場所からプラグインを探すことは許しません（172 行目のコメント）。だからプロジェクトに入っている `@angular/language-service` は使われません。
5. **174 行目：session は渡さない**

   tsserver の `Session`（tsserver のプロトコルを話す部品）は使わず、LSP を話すのはこの Session です。

📄 `angular/vscode-ng-language-service/server/src/session.ts` L177–209 （▶ の行: 179, 184, 186, 192–193, 197, 203–205）

```ts
177 │     projSvc.setHostConfiguration({
178 │       formatOptions: projSvc.getHostFormatCodeOptions(),
179 ▶       extraFileExtensions: [
180 │         {
181 │           // TODO: in View Engine getExternalFiles() returns a list of external
182 │           // templates (HTML files). This configuration is no longer needed in
183 │           // Ivy because Ivy returns the typecheck files.
184 ▶           extension: '.html',
185 │           isMixedContent: false,
186 ▶           scriptKind: ts.ScriptKind.Unknown,
187 │         },
188 │       ],
189 │       preferences: {
190 │         // We don't want the AutoImportProvider projects to be created. See
191 │         // https://devblogs.microsoft.com/typescript/announcing-typescript-4-0/#smarter-auto-imports
192 ▶         includePackageJsonAutoImports: 'off',
193 ▶         includeCompletionsForModuleExports: this.includeCompletionsForModuleExports,
194 │       },
195 │       watchOptions: {
196 │         // Used as watch options when not specified by user's `tsconfig`.
197 ▶         watchFile: ts.WatchFileKind.UseFsEvents,
198 │         // On Windows, fs.watch() can hold a lock on the watched directory, which
199 │         // causes problems when users try to rename/move/delete folders.
200 │         // It's better to use polling instead.
201 │         // https://github.com/angular/vscode-ng-language-service/issues/1398
202 │         // More history here: https://github.com/angular/vscode-ng-language-service/commit/6eb2984cbe2112d9f4284192ffa11d40ee6b2f74
203 ▶         watchDirectory:
204 ▶           process.platform === 'win32'
205 ▶             ? ts.WatchDirectoryKind.DynamicPriorityPolling
206 │             : ts.WatchDirectoryKind.UseFsEvents,
207 │         fallbackPolling: ts.PollingWatchKind.DynamicPriority,
208 │       },
209 │     });
```

179〜188 行目、`.html` を「TypeScript ではない追加の拡張子」として登録します。181〜183 行目の TODO のとおり View Engine の時代の名残で、Ivy では型チェック用のファイルを返すので要らない、と書かれています。192 行目、`package.json` の依存から自動 import の候補を作る仕組み（AutoImportProvider のプロジェクト）は作りません。203〜206 行目、Windows ではディレクトリの監視をポーリングにします（`fs.watch()` がフォルダを掴んで名前の変更や削除を妨げるため、199〜201 行目）。このあと同じ関数の残りで、プラグインの設定（`angularOnly: true` など）を渡します。中身は[第 4 回](04-ls-ts-plugin.md)で読みます。

### ServerHost が変えているところ

📄 `angular/vscode-ng-language-service/server/src/server_host.ts` L267–288 （▶ の行: 267–268, 271, 275–276, 279）

```ts
267 ▶   require(initialPath: string, moduleName: string): ts.server.RequireResult {
268 ▶     if (moduleName !== '@angular/language-service') {
269 │       return {
270 │         module: undefined,
271 ▶         error: new Error(`Angular server will not load plugin '${moduleName}'.`),
272 │       };
273 │     }
274 │     try {
275 ▶       const modulePath = require.resolve(moduleName, {
276 ▶         paths: [initialPath],
277 │       });
278 │       return {
279 ▶         module: require(modulePath),
280 │         error: undefined,
281 │       };
282 │     } catch (e) {
283 │       return {
284 │         module: undefined,
285 │         error: e as Error,
286 │       };
287 │     }
288 │   }
```

📄 `angular/vscode-ng-language-service/server/src/server_host.ts` L157–167 （▶ の行: 163–164, 166）

```ts
157 │   fileExists(path: string): boolean {
158 │     // When a project is reloaded (due to changes in node_modules for example),
159 │     // the typecheck files ought to be retained. However, if they do not exist
160 │     // on disk, tsserver will remove them from project. See
161 │     // https://github.com/microsoft/TypeScript/blob/3c32f6e154ead6749b76ec9c19cbfdd2acad97d6/src/server/editorServices.ts#L2188-L2193
162 │     // To fix this, we fake the existence of the typecheck files.
163 ▶     if (path.endsWith('.ngtypecheck.ts')) {
164 ▶       return true;
165 │     }
166 ▶     return ts.sys.fileExists(path);
167 │   }
```

ServerHost のほとんどのメソッドは `ts.sys`（TypeScript が用意する Node 用の OS の口）にそのまま渡すだけで、違うのは次の所です。267 行目の `require` は `ProjectService` がプラグインを読み込むときに呼ぶ口で、268〜273 行目のとおり **`@angular/language-service` 以外のプラグインは読み込みません**。275〜277 行目、TypeScript が渡す場所（4 節の 171 行目の場所の下の `node_modules`）から Node の決まりで探し、279 行目で読み込みます。読み込んだ後に TypeScript がプラグインの `create` を呼ぶ流れは第 4 回です。163〜165 行目、型チェック用のファイル（`.ngtypecheck.ts`）は disk に無くても「ある」と答えます。158〜162 行目のコメントのとおり、プロジェクトを読み直したときに tsserver がそれをプロジェクトから外さないためです。

## 5. LSP の要求を handlers/ に振り分ける

📄 `angular/vscode-ng-language-service/server/src/handlers/initialization.ts` L12–41 （▶ の行: 13–14, 16, 24, 27, 33–34）

```ts
12 │ export function onInitialize(session: Session, params: lsp.InitializeParams): lsp.InitializeResult {
13 ▶   session.snippetSupport =
14 ▶     params.capabilities.textDocument?.completion?.completionItem?.snippetSupport;
15 │   const serverOptions: ServerOptions = {
16 ▶     logFile: session.logger.getLogFileName(),
17 │   };
18 │   session.clientCapabilities = params.capabilities;
19 │   return {
20 │     capabilities: {
21 │       foldingRangeProvider: true,
22 │       documentSymbolProvider: true,
23 │       codeLensProvider: {resolveProvider: true},
24 ▶       textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
25 │       completionProvider: {
26 │         resolveProvider: true,
27 ▶         triggerCharacters: ['<', '.', '*', '[', '(', '$', '|', '@'],
28 │       },
29 │       definitionProvider: true,
30 │       typeDefinitionProvider: true,
31 │       referencesProvider: true,
32 │       renameProvider: {
33 ▶         // Renames should be checked and tested before being executed.
34 ▶         prepareProvider: true,
35 │       },
36 │       hoverProvider: true,
37 │       signatureHelpProvider: {
38 │         triggerCharacters: ['(', ','],
39 │         retriggerCharacters: [','],
40 │       },
41 │       linkedEditingRangeProvider: true,
```

最初の `initialize` で、サーバーは「できること」（capabilities）を返します。24 行目、文書の変更は**差分**（`Incremental`）で受け取ります。27 行目、補完は `<`・`.`・`*`・`[`・`(`・`$`・`|`・`@` を打ったときに自動で求められます。33〜34 行目、名前変更は先に「できるか」を確かめさせます（`prepareRename`）。16 行目のログのファイルの場所は、拡張の `angular.openLogFile` が使います（第 2 回）。

📄 `angular/vscode-ng-language-service/server/src/session.ts` L240–262 （▶ の行: 241–247, 254, 259, 262）

```ts
240 │   private addProtocolHandlers(conn: lsp.Connection) {
241 ▶     conn.onInitialize((p) => onInitialize(this, p));
242 ▶     conn.onDidChangeWatchedFiles((p) => onDidChangeWatchedFiles(p, this.logger, this.host));
243 ▶     conn.onDidOpenTextDocument((p) => this.onDidOpenTextDocument(p));
244 ▶     conn.onDidCloseTextDocument((p) => this.onDidCloseTextDocument(p));
245 ▶     conn.onDidChangeTextDocument((p) => this.onDidChangeTextDocument(p));
246 ▶     conn.onDidSaveTextDocument((p) => this.onDidSaveTextDocument(p));
247 ▶     conn.onDidChangeConfiguration(() => {
248 │       clearWorkspaceConfigurationCache(this.connection);
249 │       // Apply updated inlay settings without requiring extension restart.
250 │       void this.connection.languages.inlayHint.refresh().catch(() => {
251 │         // Ignore if client does not support inlay hint refresh.
252 │       });
253 │     });
254 ▶     conn.onDefinition((p) => onDefinition(this, p));
255 │     conn.onTypeDefinition((p) => onTypeDefinition(this, p));
256 │     conn.onReferences((p) => onReferences(this, p));
257 │     conn.onRenameRequest((p) => onRenameRequest(this, p));
258 │     conn.onPrepareRename((p) => onPrepareRename(this, p));
259 ▶     conn.onHover((p) => onHover(this, p));
260 │     conn.onFoldingRanges((p) => onFoldingRanges(this, p));
261 │     conn.languages.onLinkedEditingRange((p) => onLinkedEditingRange(this, p));
262 ▶     conn.onDocumentSymbol(async (p) => await onDocumentSymbol(this, p));
```

📄 `angular/vscode-ng-language-service/server/src/session.ts` L263–280 （▶ の行: 263, 265, 269–271, 273–274, 278–279）

```ts
263 ▶     conn.onCompletion((p) => onCompletion(this, p));
264 │     conn.onCompletionResolve((p) => onCompletionResolve(this, p));
265 ▶     conn.onRequest(GetComponentsWithTemplateFile, (p) => getComponentsWithTemplateFile(this, p));
266 │     conn.onRequest(GetTemplateLocationForComponent, (p) =>
267 │       onGetTemplateLocationForComponent(this, p),
268 │     );
269 ▶     conn.onRequest(GetTcbRequest, (p) => onGetTcb(this, p));
270 ▶     conn.onRequest(IsInAngularProject, (p) => isInAngularProject(this, p));
271 ▶     conn.onCodeLens((p) => onCodeLens(this, p));
272 │     conn.onCodeLensResolve((p) => onCodeLensResolve(this, p));
273 ▶     conn.onSignatureHelp((p) => onSignatureHelp(this, p));
274 ▶     conn.onCodeAction((p) => onCodeAction(this, p));
275 │     conn.onCodeActionResolve(async (p) => await onCodeActionResolve(this, p));
276 │ 
277 │     // Inlay hints (LSP 3.17)
278 ▶     conn.onRequest(lsp.InlayHintRequest.type, (p) => onInlayHint(this, p));
279 ▶     conn.onRequest(lsp.InlayHintResolveRequest.type, (p) => onInlayHintResolve(this, p));
280 │   }
```

| 行 | LSP のメソッド | 受け手 | 章 |
| --- | --- | --- | --- |
| 241 | `initialize` | `handlers/initialization.ts` の `onInitialize` | この章 |
| 242 | `workspace/didChangeWatchedFiles` | `handlers/did_change_watched_files.ts` | この章の 6 節 |
| 243〜246 | `textDocument/didOpen`・`didClose`・`didChange`・`didSave` | Session 自身（`onDidOpenTextDocument` など） | この章の 6 節 |
| 247〜253 | `workspace/didChangeConfiguration` | 設定の覚えを捨て、インレイヒントの再取得を頼む | [第 15 回](15-ls-inlay-hints.md) |
| 254〜256 | `textDocument/definition`・`typeDefinition`・`references` | `handlers/definitions.ts` | [第 10 回](10-ls-definitions.md)・[第 11 回](11-ls-references-rename.md) |
| 257〜258 | `textDocument/rename`・`prepareRename` | `handlers/rename.ts` | [第 11 回](11-ls-references-rename.md) |
| 259 | `textDocument/hover` | `handlers/hover.ts` | [第 9 回](09-ls-quick-info.md) |
| 260 | `textDocument/foldingRange` | `handlers/folding.ts` | [第 17 回](17-ls-document-symbols.md) |
| 261 | `textDocument/linkedEditingRange` | `handlers/linked_editing_range.ts` | [第 14 回](14-ls-signature-help.md) |
| 262 | `textDocument/documentSymbol` | `handlers/document_symbols.ts` | [第 17 回](17-ls-document-symbols.md) |
| 263〜264 | `textDocument/completion`・`completionItem/resolve` | `handlers/completions.ts` | [第 12 回](12-ls-completions.md) |
| 265 | `angular/getComponentsWithTemplateFile`（独自） | `handlers/code_lens.ts` の `getComponentsWithTemplateFile` | [第 6 回](06-ls-external-templates.md) |
| 266〜268 | `angular/getTemplateLocationForComponent`（独自） | `handlers/template_info.ts` | [第 6 回](06-ls-external-templates.md) |
| 269 | `angular/getTcb`（独自） | `handlers/tcb.ts` | [第 2 回](02-ls-client.md) |
| 270 | `angular/isAngularCoreInOwningProject`（独自） | `handlers/template_info.ts` の `isInAngularProject` | [第 2 回](02-ls-client.md) |
| 271〜272 | `textDocument/codeLens`・`codeLens/resolve` | `handlers/code_lens.ts` | [第 18 回](18-ls-code-fixes.md) |
| 273 | `textDocument/signatureHelp` | `handlers/signature.ts` | [第 14 回](14-ls-signature-help.md) |
| 274〜275 | `textDocument/codeAction`・`codeAction/resolve` | `handlers/code_actions.ts` | [第 18 回](18-ls-code-fixes.md)・[第 19 回](19-ls-refactorings.md) |
| 278〜279 | `textDocument/inlayHint`・`inlayHint/resolve` | `handlers/inlay_hints.ts` | [第 15 回](15-ls-inlay-hints.md) |

受け手の関数は `(session, params)` の形で、ほとんどが最初に `session.getLSAndScriptInfo(params.textDocument)`（[第 1 回](01-ls-overview.md)の 1 節）で言語サービスを取り出し、LSP の位置を文字数に直して、`ts.LanguageService` の形のメソッドを呼びます。位置の直し方は 1 つの関数にまとまっています。

📄 `angular/vscode-ng-language-service/server/src/utils.ts` L78–95 （▶ の行: 79, 81–82, 93–94）

```ts
78 │ export function tsTextSpanToLspRange(scriptInfo: ts.server.ScriptInfo, textSpan: ts.TextSpan) {
79 ▶   const start = scriptInfo.positionToLineOffset(textSpan.start);
80 │   const end = scriptInfo.positionToLineOffset(textSpan.start + textSpan.length);
81 ▶   // ScriptInfo (TS) is 1-based, LSP is 0-based.
82 ▶   return lsp.Range.create(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1);
83 │ }
84 │ 
85 │ /**
86 │  * Convert lsp.Position to the absolute offset in the file. LSP keeps track of
87 │  * offset using 0-based index whereas TypeScript uses 1-based index.
88 │  * @param scriptInfo Used to determine the offsets.
89 │  * @param position
90 │  */
91 │ export function lspPositionToTsPosition(scriptInfo: ts.server.ScriptInfo, position: lsp.Position) {
92 │   const {line, character} = position;
93 ▶   // ScriptInfo (TS) is 1-based, LSP is 0-based.
94 ▶   return scriptInfo.lineOffsetToPosition(line + 1, character + 1);
95 │ }
```

81 行目と 93 行目のコメントのとおり、TypeScript の `ScriptInfo` の行と列は 1 始まり、LSP は 0 始まりです。94 行目で 1 を足して `lineOffsetToPosition`（行と列 → 文字数）を、82 行目で 1 を引いて戻します。

## 6. ファイルを開く・変える・閉じる

`textDocument/didOpen` を受ける `onDidOpenTextDocument` は、URI をパスにし、`openFiles`（`MruTracker`：最近使った順に並べる集合。診断を最近使ったファイルから求めるのに使う）を更新し、`.html` なら `ScriptKind.Unknown`（TS として解析させない）にして、**エディタの中身ごと**`ProjectService.openClientFile(パス, 中身, 種類)` を呼びます。保存していない中身は disk より新しいからです。この呼び出しの中で TypeScript が tsconfig.json を探してプロジェクトを作り、7 節のイベントが起きます。そのあと、プロジェクトを「汚れた」印にして診断を求めます。.html のためにプロジェクトを探し直す部分を含めて、この関数の行は[第 6 回](06-ls-external-templates.md)で読みます。ここでは変更と閉じるを読みます。

📄 `angular/vscode-ng-language-service/server/src/session.ts` L676–714 （▶ の行: 683–684, 693–694, 699–702, 705, 709, 713）

```ts
676 │   private onDidCloseTextDocument(params: lsp.DidCloseTextDocumentParams) {
677 │     const {textDocument} = params;
678 │     const filePath = uriToFilePath(textDocument.uri);
679 │     if (!filePath) {
680 │       return;
681 │     }
682 │     this.logger.info(`Closing file: ${filePath}`);
683 ▶     this.openFiles.delete(filePath);
684 ▶     this.projectService.closeClientFile(filePath);
685 │   }
686 │ 
687 │   private onDidChangeTextDocument(params: lsp.DidChangeTextDocumentParams): void {
688 │     const {contentChanges, textDocument} = params;
689 │     const filePath = uriToFilePath(textDocument.uri);
690 │     if (!filePath) {
691 │       return;
692 │     }
693 ▶     this.openFiles.update(filePath);
694 ▶     const scriptInfo = this.projectService.getScriptInfo(filePath);
695 │     if (!scriptInfo) {
696 │       this.error(`Failed to get script info for ${filePath}`);
697 │       return;
698 │     }
699 ▶     for (const change of contentChanges) {
700 ▶       if ('range' in change) {
701 ▶         const [start, end] = lspRangeToTsPositions(scriptInfo, change.range);
702 ▶         scriptInfo.editContent(start, end, change.text);
703 │       } else {
704 │         // New text is considered to be the full content of the document.
705 ▶         scriptInfo.editContent(0, scriptInfo.getSnapshot().getLength(), change.text);
706 │       }
707 │     }
708 │ 
709 ▶     const project = this.getDefaultProjectForScriptInfo(scriptInfo);
710 │     if (!project || !project.languageServiceEnabled) {
711 │       return;
712 │     }
713 ▶     this.requestDiagnosticsOnOpenOrChangeFile(scriptInfo.fileName, `Changing ${filePath}`);
714 │   }
```

閉じるのは 684 行目の `closeClientFile` だけです。変更は、5 節の `Incremental` のとおり差分で届くので、699〜707 行目で 1 つずつ `ScriptInfo.editContent(開始, 終了, 新しい文字列)` を呼んで中身を書き換えます。701 行目で LSP の範囲を文字数に直し、範囲の無い変更（全文）なら 705 行目で全体を置き換えます。`ProjectService.applyChangesInOpenFiles` は使っていません。このハンドラ自身はプログラムを作り直しません。書き換えのあとにするのは、709 行目でプロジェクトを取り出すことと、713 行目で診断を頼むこと（300 ミリ秒待ってから。第 8 回）だけです。

### ファイルの監視を VS Code にさせるとき

📄 `angular/vscode-ng-language-service/server/src/handlers/did_change_watched_files.ts` L14–24 （▶ の行: 19, 22）

```ts
14 │ export function onDidChangeWatchedFiles(
15 │   params: lsp.DidChangeWatchedFilesParams,
16 │   logger: ts.server.Logger,
17 │   host: ServerHost,
18 │ ) {
19 ▶   for (const change of params.changes) {
20 │     const filePath = uriToFilePath(change.uri);
21 │     logger.info(`Received file change event for ${filePath} type ${change.type}`);
22 ▶     host.notifyFileChange(filePath, change.type);
23 │   }
24 │ }
```

📄 `angular/vscode-ng-language-service/server/src/server_host.ts` L121–151 （▶ の行: 122, 126, 128, 131, 138–139, 145–146）

```ts
121 │   notifyFileChange(fileName: string, type: lsp.FileChangeType): void {
122 ▶     if (!this.useClientSideFileWatcher) {
123 │       return;
124 │     }
125 │ 
126 ▶     const callbacks = this.fileWatchers.get(fileName);
127 │     if (callbacks) {
128 ▶       callbacks.forEach((callback) =>
129 │         callback(
130 │           fileName,
131 ▶           type === lsp.FileChangeType.Deleted
132 │             ? ts.FileWatcherEventKind.Deleted
133 │             : ts.FileWatcherEventKind.Changed,
134 │         ),
135 │       );
136 │     }
137 │ 
138 ▶     for (const [dirPath, watchers] of this.directoryWatchers) {
139 ▶       if (fileName.startsWith(dirPath)) {
140 │         // If it's a direct child or recursive watch
141 │         const relative = path.relative(dirPath, fileName);
142 │         const isDirectChild = !relative.includes(path.sep);
143 │ 
144 │         for (const watcher of watchers) {
145 ▶           if (watcher.recursive || isDirectChild) {
146 ▶             watcher.callback(fileName);
147 │           }
148 │         }
149 │       }
150 │     }
151 │   }
```

普段は TypeScript が `ts.sys.watchFile` などで自分で disk を監視します。`angular.server.useClientSideFileWatcher` を有効にすると、拡張が VS Code の監視の結果（[第 2 回](02-ls-client.md)の `fileEvents`）を `workspace/didChangeWatchedFiles` で送り、22 行目で ServerHost に渡します。ServerHost は監視の登録を自分の表に覚えておき（`watchFile`・`watchDirectory`）、128〜135 行目でファイルの、138〜150 行目でディレクトリの登録者を呼びます。122 行目、設定が無効なら何もしません（そのときは監視は TypeScript がしている）。

## 7. プロジェクトを読み終えたとき

📄 `angular/vscode-ng-language-service/server/src/session.ts` L365–400 （▶ の行: 367, 369, 372, 375, 378, 380–381, 394）

```ts
365 │   private handleProjectServiceEvent(event: ts.server.ProjectServiceEvent) {
366 │     switch (event.eventName) {
367 ▶       case ts.server.ProjectLoadingStartEvent:
368 │         this.isProjectLoading = true;
369 ▶         this.connection.sendNotification(ProjectLoadingStart);
370 │         this.logger.info(`Loading new project: ${event.data.reason}`);
371 │         break;
372 ▶       case ts.server.ProjectLoadingFinishEvent: {
373 │         if (this.isProjectLoading) {
374 │           this.isProjectLoading = false;
375 ▶           this.connection.sendNotification(ProjectLoadingFinish);
376 │         }
377 │         const {project} = event.data;
378 ▶         const angularCore = this.findAngularCore(project);
379 │         if (angularCore) {
380 ▶           this.enableLanguageServiceForProject(project);
381 ▶         } else if (project.getProjectReferences()?.length) {
382 │           // Do not disable language service for project if it has project references. Even though
383 │           // we couldn't find angular/core for this parent tsconfig, it might exist in the
384 │           // referenced projects. Disabling the language service for this root project will clean up
385 │           // the program for the project.
386 │           // https://github.com/microsoft/TypeScript/commit/3c4c060dff2b0292d3a4d88ba0627b7657d67e7f#diff-fad6af6557c1406192e30af30e0113a5eb327d60f9e2588bdce6667d619ebd04R973-R983
387 │           // We need to keep this language service and program enabled because referenced projects
388 │           // don't load until we open a client file for that project.
389 │           this.info(
390 │             `@angular/core could not be found for project ${project.getProjectName()} but it has references that might.` +
391 │               ` The Angular language service will remain enabled for this project.`,
392 │           );
393 │         } else {
394 ▶           this.disableLanguageServiceForProject(
395 │             project,
396 │             `project is not an Angular project ('@angular/core' could not be found)`,
397 │           );
398 │         }
399 │         break;
400 │       }
```

📄 `angular/vscode-ng-language-service/server/src/session.ts` L817–837 （▶ の行: 819, 827, 830–831, 833）

```ts
817 │   private findAngularCore(project: ts.server.Project): string | null {
818 │     const projectName = project.getProjectName();
819 ▶     if (!project.languageServiceEnabled) {
820 │       this.info(
821 │         `Language service is already disabled for ${projectName}. ` +
822 │           `This could be due to non-TS files that exceeded the size limit (${ts.server.maxProgramSizeForNonTsFiles} bytes).` +
823 │           `Please check log file for details.`,
824 │       );
825 │       return null;
826 │     }
827 ▶     if (!project.hasRoots() || project.isNonTsProject()) {
828 │       return null;
829 │     }
830 ▶     const angularCore = project.getFileNames().find(isAngularCore);
831 ▶     if (angularCore === undefined && project.getExcludedFiles().some(isAngularCore)) {
832 │       this.info(
833 ▶         `Please check your tsconfig.json to make sure 'node_modules' directory is not excluded.`,
834 │       );
835 │     }
836 │     return angularCore ?? null;
837 │   }
```

1. **367〜369 行目：読み込みの開始を拡張に知らせる**

   拡張はステータスバーに「Initializing Angular language features」を出します（[第 2 回](02-ls-client.md)の 4 節）。
2. **372〜378 行目：読み終えたら、@angular/core があるかを見る**

   830 行目、プロジェクトのファイルの中に `@angular/core/…​.d.ts` があるかで決めます（`isAngularCore` は utils.ts の正規表現）。831〜835 行目、見つからず、除外されたファイルの中にあれば「node\_modules を除外していないか」とログに出します。
3. **380 行目：あれば言語サービスを有効にする**

   `enableLanguageServiceForProject` は TypeScript の言語サービスを有効にし、strictTemplates の提案を確かめ、プロジェクト全体を一度解析させて（外部テンプレートがどのプロジェクトのものか分かるように）、診断を求めます。この関数の行は[第 8 回](08-ls-diagnostics.md)で読みます。
4. **381〜392 行目：無くても、プロジェクトの参照があれば止めない**

   solution-style の tsconfig.json（自分ではファイルを持たず `references` で他の tsconfig を並べる形）では、親に `@angular/core` が無くても参照先にある場合があり（382〜388 行目のコメント「it might exist in the referenced projects」）、参照先のプロジェクトはそのファイルを開くまで読み込まれないからです。
5. **394〜397 行目：それ以外は止める**

   `disableLanguageServiceForProject` が、Angular の無いプロジェクトでは TypeScript の言語サービスごと止めます（`project.disableLanguageService()`）。止めたプロジェクトのファイルは `getLSAndScriptInfo` が `null` を返すので、どの要求にも答えません。

この 2 つのイベントのあいだ（読み込み中）に来た要求も、そのまま処理されます。診断を送る時機（変更から 300 ミリ秒待って、最近使ったファイルから順に）は[第 8 回](08-ls-diagnostics.md)で読みます。

## 8. version\_provider：言語サービスと TypeScript を探す順番

📄 `angular/vscode-ng-language-service/server/src/version_provider.ts` L15–51 （▶ の行: 15–16, 38–39, 42, 44, 47）

```ts
15 ▶ const MIN_TS_VERSION = '5.0';
16 ▶ const MIN_NG_VERSION = '15.0';
17 │ const TSSERVERLIB = 'typescript/lib/tsserverlibrary';
18 │ 
19 │ /**
20 │  * Resolve the node module with the specified `packageName` that satisfies
21 │  * the specified minimum version.
22 │  * @param packageName name of package to be resolved
23 │  * @param minVersionStr minimum version
24 │  * @param probeLocations locations to initiate node module resolution
25 │  * @param rootPackage location of package.json. For example, the root package of
26 │  * `typescript/lib/tsserverlibrary` is `typescript`.
27 │  */
28 │ function resolveWithMinVersion(
29 │   packageName: string,
30 │   minVersionStr: string,
31 │   probeLocations: string[],
32 │   rootPackage: string,
33 │ ): NodeModule {
34 │   if (!packageName.startsWith(rootPackage)) {
35 │     throw new Error(`${packageName} must be in the root package`);
36 │   }
37 │   const minVersion = new Version(minVersionStr);
38 ▶   for (const location of probeLocations) {
39 ▶     const nodeModule = resolve(packageName, location, rootPackage);
40 │     if (
41 │       nodeModule &&
42 ▶       (nodeModule.version.greaterThanOrEqual(minVersion) || nodeModule.version.isVersionZero())
43 │     ) {
44 ▶       return nodeModule;
45 │     }
46 │   }
47 ▶   throw new Error(
48 │     `Failed to resolve '${packageName}' with minimum version '${minVersion}' from ` +
49 │       JSON.stringify(probeLocations, null, 2),
50 │   );
51 │ }
```

📄 `angular/vscode-ng-language-service/common/resolver.ts` L20–42 （▶ の行: 27–28, 32–33, 39）

```ts
20 │ export function resolve(
21 │   packageName: string,
22 │   location: string,
23 │   rootPackage?: string,
24 │ ): NodeModule | undefined {
25 │   rootPackage = rootPackage || packageName;
26 │   try {
27 ▶     const packageJsonPath = require.resolve(`${rootPackage}/package.json`, {
28 ▶       paths: [location],
29 │     });
30 │     // Do not use require() to read JSON files since it's a potential security
31 │     // vulnerability.
32 ▶     const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
33 ▶     const resolvedPath = require.resolve(packageName, {
34 │       paths: [location],
35 │     });
36 │     return {
37 │       name: packageName,
38 │       resolvedPath,
39 ▶       version: new Version(packageJson.version),
40 │     };
41 │   } catch {}
42 │ }
```

📄 `angular/vscode-ng-language-service/server/src/version_provider.ts` L126–133 （▶ の行: 130, 132）

```ts
126 │ /**
127 │  * Resolve `@angular/language-service` from the given locations.
128 │  * @param probeLocations locations from which resolution is attempted
129 │  */
130 ▶ export function resolveNgLangSvc(probeLocations: string[]): NodeModule {
131 │   const ngls = '@angular/language-service';
132 ▶   return resolveWithMinVersion(ngls, MIN_NG_VERSION, probeLocations, ngls);
133 │ }
```

📄 `angular/vscode-ng-language-service/server/src/version_provider.ts` L59–74 （▶ の行: 60–61, 64–65, 67, 73）

```ts
59 │ export function resolveTsServer(probeLocations: string[], tsdk: string | null): NodeModule {
60 ▶   if (tsdk !== null) {
61 ▶     const resolvedFromTsdk = resolveTsServerFromTsdk(tsdk, probeLocations);
62 │     const minVersion = new Version(MIN_TS_VERSION);
63 │     if (resolvedFromTsdk !== undefined) {
64 ▶       if (resolvedFromTsdk.version.greaterThanOrEqual(minVersion)) {
65 ▶         return resolvedFromTsdk;
66 │       } else {
67 ▶         console.warn(
68 │           `Ignoring TSDK version specified in the TypeScript extension options ${resolvedFromTsdk.version} because it is lower than the required TS version for the language service (${MIN_TS_VERSION}).`,
69 │         );
70 │       }
71 │     }
72 │   }
73 ▶   return resolveWithMinVersion(TSSERVERLIB, MIN_TS_VERSION, probeLocations, 'typescript');
74 │ }
```

📄 `angular/vscode-ng-language-service/server/src/version_provider.ts` L76–108 （▶ の行: 82–83, 85, 88–89, 92, 100）

```ts
 76 │ function resolveTsServerFromTsdk(tsdk: string, probeLocations: string[]): NodeModule | undefined {
 77 │   // `tsdk` is the folder path to the tsserver and lib*.d.ts files under a
 78 │   // TypeScript install, for example
 79 │   // - /google/src/head/depot/google3/third_party/javascript/node_modules/typescript/stable/lib
 80 │   // When the `tsdk` is an absolute path, we only look there for TS Server.
 81 │   // When it is a relative path, we look for that tsdk relative to the rest of the probe locations.
 82 ▶   if (path.isAbsolute(tsdk)) {
 83 ▶     probeLocations = [tsdk];
 84 │   } else {
 85 ▶     probeLocations = probeLocations.map((location) => path.join(location, tsdk));
 86 │   }
 87 │   for (const location of probeLocations) {
 88 ▶     const tsserverlib = path.join(location, 'tsserverlibrary.js');
 89 ▶     if (!fs.existsSync(tsserverlib)) {
 90 │       continue;
 91 │     }
 92 ▶     const packageJson = path.resolve(tsserverlib, '../../package.json');
 93 │     if (!fs.existsSync(packageJson)) {
 94 │       continue;
 95 │     }
 96 │     try {
 97 │       const json = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
 98 │       return {
 99 │         name: TSSERVERLIB,
100 ▶         resolvedPath: tsserverlib,
101 │         version: new Version(json.version),
102 │       };
103 │     } catch {
104 │       continue;
105 │     }
106 │   }
107 │   return undefined;
108 │ }
```

1. **共通：探す場所を順に、最低の版を満たす最初のもの**

   38〜46 行目、探す場所を前から順に試し、42 行目で最低の版（15・16 行目：TypeScript 5.0、言語サービス 15.0）以上か、版が `0.0.0`（手元でビルドしたもの）なら採ります。どこにも無ければ 47 行目で例外になり、サーバーは起動しません。1 つの場所での探し方は resolver.ts で、27〜28 行目で「その場所から Node の決まりで」`package.json` を探して 32 行目で版を読み、33 行目で本体のファイルの場所を求めます。
2. **言語サービス：resolveNgLangSvc（130〜133 行目）**

   探す場所は引数 `--ngProbeLocations` だけです。VS Code の拡張はそこに拡張のディレクトリしか渡さないので（[第 2 回](02-ls-client.md)の 3 節の `--ngProbeLocations`）、**見つかるのは常に拡張に同梱の言語サービス**です。
3. **TypeScript：resolveTsServer（59〜74 行目）**

   60 行目、`--tsdk` があれば先に試し、64〜65 行目で 5.0 以上ならそれを使います。古ければ 67 行目で警告して捨てます。無いか使えなければ 73 行目で `--tsProbeLocations` から探します。`--tsdk` は TypeScript の `lib` ディレクトリの場所で、82〜83 行目、絶対パスならそこだけ、85 行目、相対パスなら探す場所それぞれからの相対として、88 行目で `tsserverlibrary.js` があるか、92 行目でその 2 つ上の `package.json` の版を見ます。

> [!WARNING]
> **ハマりどころ**
>
> README（[第 1 回](01-ls-overview.md)の 4 節）は TypeScript を「1. tsdk の設定、2. 拡張に同梱、3. ワークスペースの node\_modules」の順で探すと書いています。VS Code の拡張から起動したときは、`--tsProbeLocations` に拡張のディレクトリしか渡らないので（第 2 回の 3 節）、73 行目で見つかるのは同梱の TypeScript です。3 番目に当たる経路は、このスナップショットの client.ts と version\_provider.ts からは見つけられませんでした。ワークスペースの TypeScript を使うには、tsdk を設定して許可します（第 2 回の 3 節）。他のエディタ（`ngserver` を直接起動するもの）は、自分で `--tsProbeLocations` にワークスペースを渡せます。

## テストと直し方

📄 `angular/vscode-ng-language-service/server/src/tests/cmdline_utils_spec.ts` L11–36 （▶ の行: 11–13, 27–29）

```ts
11 ▶ describe('parseCommandLine', () => {
12 ▶   it('should parse "help"', () => {
13 ▶     const options = parseCommandLine(['--help']);
14 │     expect(options.help).toBe(true);
15 │   });
16 │ 
17 │   it('should parse "logFile"', () => {
18 │     const options = parseCommandLine(['--logFile', 'foo.log']);
19 │     expect(options.logFile).toBe('foo.log');
20 │   });
21 │ 
22 │   it('should parse "logVerbosity"', () => {
23 │     const options = parseCommandLine(['--logVerbosity', 'normal']);
24 │     expect(options.logVerbosity).toBe('normal');
25 │   });
26 │ 
27 ▶   it('should parse "ngProbeLocations"', () => {
28 ▶     const options = parseCommandLine(['--ngProbeLocations', '/foo,/bar']);
29 ▶     expect(options.ngProbeLocations).toEqual(['/foo', '/bar']);
30 │   });
31 │ 
32 │   it('should parse "tsProbeLocations"', () => {
33 │     const options = parseCommandLine(['--tsProbeLocations', '/baz,/qux']);
34 │     expect(options.tsProbeLocations).toEqual(['/baz', '/qux']);
35 │   });
36 │ 
```

📄 `angular/vscode-ng-language-service/server/src/tests/version_provider_spec.ts` L13–35 （▶ の行: 13–14, 17, 19, 26–27, 31, 33）

```ts
13 ▶ describe('Node Module Resolver', () => {
14 ▶   const probeLocations = [__dirname];
15 │ 
16 │   it('should be able to resolve tsserver', () => {
17 ▶     const result = resolveTsServer(probeLocations, null);
18 │     expect(result).toBeDefined();
19 ▶     expect(result.resolvedPath).toMatch(/typescript\/lib\/tsserverlibrary.js$/);
20 │   });
21 │ 
22 │   it('should resolve tsserver from typescript.tsdk provided as fs path', () => {
23 │     // Resolve relative to cwd.
24 │     const absPath = resolve('node_modules/typescript/lib');
25 │     expect(isAbsolute(absPath)).toBeTrue();
26 ▶     const result = resolveTsServer(probeLocations, absPath);
27 ▶     expect(result.resolvedPath.endsWith('typescript/lib/tsserverlibrary.js')).toBeTrue();
28 │   });
29 │ 
30 │   it('should be able to resolve Angular language service', () => {
31 ▶     const result = resolveNgLangSvc(probeLocations);
32 │     expect(result).toBeDefined();
33 ▶     expect(result.resolvedPath.endsWith('@angular/language-service/index.js')).toBeTrue();
34 │   });
35 │ });
```

引数の読み取りは `server/src/tests/cmdline_utils_spec.ts` の describe('parseCommandLine')（11 行目、it 9 本）で、27〜30 行目のように配列にして `parseCommandLine` に渡し、結果の 1 つの欄を確かめます。探す順番は `version_provider_spec.ts` の describe('Node Module Resolver')（13 行目、it 3 本）で、14 行目の「spec のディレクトリ」から探して、19 行目で `tsserverlibrary.js`、33 行目で `@angular/language-service/index.js` が見つかることを見ます。26 行目は `--tsdk` に絶対パスを渡す場合です。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //vscode-ng-language-service/server/src/tests:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=parseCommandLine|Node Module Resolver"
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //vscode-ng-language-service/server/src/tests:test:
Ran 12 of 49 specs
12 specs, 0 failures
Finished in 0.005 seconds
INFO: Elapsed time: 0.471s, Critical Path: 0.30s
//vscode-ng-language-service/server/src/tests:test                       PASSED in 0.2s
```

1. **件数**

   フィルタは正規表現なので `|` で 2 つの describe を選べます。9 + 3 = 12 本で、「Ran 12 of 49 specs」と一致しました（0.2 秒）。サーバーの spec 全体（49 本）は[第 1 回](01-ls-overview.md)で走らせました。
2. **spec が無いところ**

   Session（要求の振り分け・ファイルの開閉・プロジェクトのイベント）を単体で確かめる spec はありません。確かめているのは本物のサーバーを起動する `integration/lsp/ivy_spec.ts` で、このスナップショットではビルドできません（第 1 回）。`--disableBlockSyntax` と `--disableLetSyntax` の読み取りにも spec はありません（どう使われているかは[第 4 回](04-ls-ts-plugin.md)の 5 節）。
3. **直すとしたら**

   「引数が効かない」なら cmdline\_utils.ts の `parseCommandLine` と cmdline\_utils\_spec.ts、「違う TypeScript や言語サービスが読まれる」なら version\_provider.ts の `resolveTsServer`・`resolveTsServerFromTsdk` と version\_provider\_spec.ts。ファイルの開閉やプロジェクトの扱いは session.ts で、手元では ivy\_spec.ts を読んで同じ形の手順を考える、までにします。関係する閉じた issue：#69881（host の欄を打っているとサーバーが落ち、再起動されない。8b2785b597c で compiler-cli が落ちずに診断を出すように直した）。一覧は[第 20 回](20-ls-issues.md)。

## 聞かれそうな質問

**Q. このサーバーは tsserver を子プロセスとして起動しているのですか？**

していません。session.ts の 156 行目で `ts.server.ProjectService` を自分のプロセスの中に作り、174 行目で tsserver の `Session` は使わないと渡しています。読み込む TypeScript は banner.ts の 35 行目で決まった `tsserverlibrary.js` 1 つで、プラグインも同じものを使います（第 4 回）。

**Q. プロジェクトの node\_modules に入っている @angular/language-service は使われますか？**

VS Code の拡張からは使われません。プラグインを探す場所は session.ts の 171 行目の 1 か所（拡張に同梱の場所）だけで、173 行目で tsconfig.json の場所から探すことを禁じています。その場所自体も、version\_provider.ts の 132 行目が `--ngProbeLocations`（拡張のディレクトリだけ）から探したものです。さらに ServerHost の 268 行目は、この名前以外のプラグインを読み込みません。

**Q. Angular を使っていない TypeScript のプロジェクトを開くと、サーバーは何をしますか？**

プロジェクトを読み終えたとき（session.ts の 372 行目）に 830 行目で `@angular/core` の `.d.ts` を探し、無ければ 394 行目でそのプロジェクトの言語サービスを止めます。以後そのファイルの要求には答えません。ただしプロジェクトの参照があるときは止めません（381 行目）。拡張の側も、「Angular のプロジェクトか」を尋ねてから送ります（第 2 回）。

**Q. 文字を 1 つ打つたびに、全部のファイルを解析し直すのですか？**

打った差分の処理は session.ts の 702 行目で `ScriptInfo` の中身を書き換えるだけで、この場ではコンパイルしません。次に言語サービスのメソッド（診断やホバー）が呼ばれたときに、Angular の側は `CompilerFactory` が前のコンパイルをどこまで使い回すかを決めます（[第 5 回](05-ls-compiler-factory.md)）。診断は 713 行目から 300 ミリ秒待って求めるので、打ち続けている間は待ちが延びます（第 8 回）。

## 読み終えて

- サーバーは引数を読み、banner の差し替えた `require` で決まった 1 つの TypeScript を読み込み、`Session` を作って `listen` する。
- `Session` は `ts.server.ProjectService` を自分で作り、`globalPlugins` に Angular のプラグインを入れる。探す場所は拡張に同梱の 1 か所で、ServerHost は他のプラグインを読み込まない。
- LSP の要求は session.ts の 241〜279 行目で `handlers/` の関数に 1 対 1 で振り分けられ、位置は 0 始まりと 1 始まりを直してから言語サービスに渡る。
- 開くは `openClientFile`、変えるは差分ごとの `ScriptInfo.editContent`、閉じるは `closeClientFile`。読み終えたプロジェクトに `@angular/core` が無ければ言語サービスを止める。
- VS Code から起動したとき、言語サービスは常に同梱、TypeScript は「許可された tsdk」か同梱。README の 3 番目の経路は VS Code の起動では使われない。

---

← 前: [VS Code クライアント：サーバーを起動してコマンドを送る](02-ls-client.md)  
次: [tsserver プラグイン：TypeScript の言語サービスに Angular を重ねる](04-ls-ts-plugin.md) →
