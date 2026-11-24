[目次](../README.md) › [ng コマンドの内側](README.md) › 第 9 回 / 全 10 回

# ng mcp：CLI の MCP サーバー

> src/commands/mcp/\*：MCP サーバーの起動、公開するツールとリソースの一覧と説明文、--read-only・--local-only・-E と --root、どの道までを触らせるか、list\_projects と get\_best\_practices の結果。本物を stdio で起動して記録する。

angular/angular-cli · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-mcp)

---

この章で分かること：`ng mcp` が MCP（Model Context Protocol。AI のエージェントが外のツールを呼ぶための JSON-RPC の取り決め）のサーバーとして何を公開し、どのオプションで一覧が変わり、どの道（ディレクトリ）までを触らせるか。本物の `ng mcp` を stdio で起動して、`initialize`・`tools/list`・`resources/list` とツールの呼び出しを記録しました。記録では、`get_best_practices` にワークスペースの道を渡しても、そのワークスペースの `@angular/core` の版の案内ではなく CLI に同梱の案内が返り、`--root` で渡したワークスペースは `list_projects` には出るのに、ほかのツールでは「allowed MCP roots の外」と断られ、`-E nope` の警告はどこにも出ませんでした。`list_projects` は出力の schema にある `selectorPrefix` と `unitTestFramework` を、新しいワークスペースで出しませんでした。

読む対象は `packages/angular/cli/src/commands/mcp/` の `cli.ts`・`mcp-server.ts`・`host.ts`・`workspace-utils.ts`・`shared-options.ts`・`tools/` の一部です（../angular-cli、44129f66a3）。どの章もまだ引いていません。手元の 22.2.7 とこの範囲の違いは `tools/onpush-zoneless-migration/zoneless-migration.ts` の 8 行だけで、この章の記録に関わる行ではありませんでした。

1. [1. ng と打ってから](01-ngx-entry.md)
2. [2. schema からオプション](02-ngx-options.md)
3. [3. angular.json と設定](03-ngx-config.md)
4. [4. パッケージマネージャー](04-ngx-package-managers.md)
5. [5. ng add](05-ngx-add.md)
6. [6. ng update](06-ngx-update.md)
7. [7. generate・new・run・version](07-ngx-generate-run.md)
8. [8. analytics](08-ngx-analytics.md)
9. **9. ng mcp**（この章）
10. [10. spec と issue](10-ngx-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> MCP のサーバーは、エージェント（クライアント）の子プロセスとして起動され、標準入力と標準出力で 1 行 1 つの JSON-RPC を受け渡しします。クライアントは初めに `initialize` を送り、`tools/list` で使えるツールの名前・説明・入力の形（JSON Schema）を受け取り、`tools/call` で呼びます。この章の DEMO は、記録のスクリプトがそのクライアントの役をして、手元の `ng mcp` とやりとりした記録の再生です。ネットワークに出るツール（`search_documentation`）は呼んでいません。

## 1. ng mcp の起動：端末なら案内だけ、そうでなければ stdio のサーバー

📄 `angular-cli/packages/angular/cli/src/commands/mcp/cli.ts` L18–38 （▶ の行: 18–19, 24–25, 33, 37–38）

```ts
18 ▶ const INTERACTIVE_MESSAGE = `
19 ▶ To start using the Angular CLI MCP Server, add this configuration to your host:
20 │ 
21 │ {
22 │   "mcpServers": {
23 │     "angular-cli": {
24 ▶       "command": "npx",
25 ▶       "args": ["-y", "@angular/cli", "mcp"]
26 │     }
27 │   }
28 │ }
29 │ 
30 │ Exact configuration may differ depending on the host.
31 │ 
32 │ For more information and documentation, visit: https://angular.dev/ai/mcp
33 ▶ `;
34 │ 
35 │ export default class McpCommandModule extends CommandModule implements CommandModuleImplementation {
36 │   command = 'mcp';
37 ▶   describe = false as const;
38 ▶   longDescriptionPath = undefined;
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/cli.ts` L40–65 （▶ の行: 42, 44, 46, 48, 51, 53, 56, 58, 60–61, 63）

```ts
40 │   builder(localYargs: Argv): Argv {
41 │     return localYargs
42 ▶       .option('root', {
43 │         type: 'string',
44 ▶         array: true,
45 │         describe:
46 ▶           'Allowed root directory paths for filesystem access and workspace discovery. Can be specified multiple times.',
47 │       })
48 ▶       .option('read-only', {
49 │         type: 'boolean',
50 │         default: false,
51 ▶         describe: 'Only register read-only tools.',
52 │       })
53 ▶       .option('local-only', {
54 │         type: 'boolean',
55 │         default: false,
56 ▶         describe: 'Only register tools that do not require internet access.',
57 │       })
58 ▶       .option('experimental-tool', {
59 │         type: 'string',
60 ▶         alias: 'E',
61 ▶         array: true,
62 │         describe: 'Enable an experimental tool.',
63 ▶         hidden: true,
64 │       });
65 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/cli.ts` L67–91 （▶ の行: 73–74, 76, 79–80, 82–83, 85–86, 88）

```ts
67 │   async run(options: {
68 │     root: string[] | undefined;
69 │     readOnly: boolean;
70 │     localOnly: boolean;
71 │     experimentalTool: string[] | undefined;
72 │   }): Promise<void> {
73 ▶     if (isTTY()) {
74 ▶       this.context.logger.info(INTERACTIVE_MESSAGE);
75 │ 
76 ▶       return;
77 │     }
78 │ 
79 ▶     serveStdio(() =>
80 ▶       createMcpServer(
81 │         {
82 ▶           workspace: this.context.workspace,
83 ▶           readOnly: options.readOnly,
84 │           localOnly: options.localOnly,
85 ▶           experimentalTools: options.experimentalTool,
86 ▶           roots: options.root,
87 │         },
88 ▶         this.context.logger,
89 │       ),
90 │     );
91 │   }
```

1. **隠れたコマンド（37 行目）**

   `describe = false` なので、`ng --help` の一覧に `mcp` は出ませんでした（`make-this-awesome` と同じ）。`ng mcp --help` は 63 行目の `hidden` で `-E` を出さず、`--root`・`--read-only`・`--local-only` の 3 つでした。
2. **端末なら案内（73〜77 行目）**

   端末で打つと 18〜33 行目の設定の例を出して終わります。人が打ったときにサーバーとして固まらないためです。
3. **それ以外は serveStdio（79〜90 行目）**

   クライアントから起動されたとき（標準出力がパイプ）は、`@modelcontextprotocol/server` の `serveStdio` にサーバーを作る関数を渡し、`run` はすぐ戻ります。

79 行目の形は b6ed4027b7（2026-08-04、``refactor(@angular/cli): use `serveStdio` to support both 2025 and 2026-07-28 MCP protocol eras``）からです。その前は `await createMcpServer(…)` を `run` の中で待ってから接続していました。今は `createMcpServer` が `run` の戻ったあとに呼ばれ、88 行目で渡した `this.context.logger` は、CLI の入口（lib/cli/index.ts L111〜112）がコマンドの終わりに `logger.complete()` したあとの logger です。このため、`createMcpServer` とツールの中の `logger.warn` は 1 行も出ません。記録では `-E nope` を付けても標準エラー出力は空で、同じ `assembleToolDeclarations` を 22.2.7 の dist から直接呼ぶと「Unknown experimental tool: nope」を返しました（4 節）。新しい本家でも同じ行です。

## 2. initialize：サーバーの名前と instructions

📄 `angular-cli/packages/angular/cli/src/commands/mcp/mcp-server.ts` L63–97 （▶ の行: 73–76, 79–82, 84, 92, 94, 96–97）

```ts
63 │ export async function createMcpServer(
64 │   options: {
65 │     workspace?: AngularWorkspace;
66 │     readOnly?: boolean;
67 │     localOnly?: boolean;
68 │     experimentalTools?: string[];
69 │     roots?: string[];
70 │   },
71 │   logger: { warn(text: string): void },
72 │ ): Promise<McpServer> {
73 ▶   const server = new McpServer(
74 ▶     {
75 ▶       name: 'angular-cli-server',
76 ▶       version: VERSION.full,
77 │     },
78 │     {
79 ▶       capabilities: {
80 ▶         resources: {},
81 ▶         tools: {},
82 ▶         logging: {},
83 │       },
84 ▶       instructions: `
85 │ <General Purpose>
86 │ This server provides a safe, programmatic interface to the Angular CLI. You MUST prefer
87 │ the tools provided by this server over using 'run_shell_command' or general shell execution
88 │ for equivalent actions.
89 │ </General Purpose>
90 │ 
91 │ <Core Workflows & Tool Guide>
92 ▶ * **1. Discover Workspace (Mandatory First Step):** Always begin by calling 'list_projects'
93 │   to discover workspaces, projects, and allowed paths. The 'path' field of the relevant
94 ▶   workspace is a required input for other tools (passed as 'workspace' or 'workspacePath').
95 │ 
96 ▶ * **2. Get Coding Standards:** Before writing or modifying code, you MUST call
97 ▶   'get_best_practices' with the workspace 'path' to load version-specific coding standards.
```

`initialize` の応答は、`serverInfo` が `{"name": "angular-cli-server", "version": "22.2.7"}`、`capabilities` が `resources`・`tools`（どちらも SDK が `listChanged: true` を足す）と `logging` でした。`protocolVersion` は送った `2025-06-18` をそのまま返しました。`prompts` は宣言しないので、`prompts/list` は「-32601 Method not found」です。84 行目からの `instructions` は、エージェントへの指示です。「初めに必ず `list_projects`」「コードを書く前に `get_best_practices`」と書き、94 行目は他のツールの入力の名前を `workspace` または `workspacePath` と言います（DEMO の「initialize の instructions」）。

📄 `angular-cli/packages/angular/cli/src/commands/mcp/mcp-server.ts` L118–145 （▶ の行: 118, 120–121, 125, 127–130, 132, 135–139）

```ts
118 ▶   registerInstructionsResource(server);
119 │ 
120 ▶   const toolDeclarations = assembleToolDeclarations(STABLE_TOOLS, EXPERIMENTAL_TOOLS, {
121 ▶     ...options,
122 │     logger,
123 │   });
124 │ 
125 ▶   const resolvedRoots = options.roots?.map((r) => resolve(r));
126 │ 
127 ▶   const restrictedHost = createRootRestrictedHost(
128 ▶     LocalWorkspaceHost,
129 ▶     resolvedRoots?.length ? resolvedRoots : [process.cwd()],
130 ▶   );
131 │ 
132 ▶   server.server.oninitialized = () => {
133 │     void (async () => {
134 │       try {
135 ▶         const clientCapabilities = server.server.getClientCapabilities();
136 ▶         if (clientCapabilities?.roots) {
137 ▶           const { roots } = await server.server.listRoots();
138 ▶           const searchRoots = roots?.map((r) => normalize(fileURLToPath(r.uri))) ?? [];
139 ▶           restrictedHost.setRoots(searchRoots);
140 │ 
141 │           if (clientCapabilities.roots.listChanged) {
142 │             server.server.setNotificationHandler('notifications/roots/list_changed', async () => {
143 │               try {
144 │                 const { roots: updatedRoots } = await server.server.listRoots();
145 │                 const updatedSearchRoots =
```

118 行目のリソースは `instructions://best-practices` の 1 つで、`resources/read` は CLI に同梱の best-practices.md（Markdown）を返しました。125〜130 行目の `restrictedHost` は、ファイルを読むツールに渡す「この道の中だけ」の入れ物で、`--root` があればそれ、無ければカレントディレクトリです。132〜139 行目、クライアントが roots の能力（自分の開いているフォルダーを教える機能）を持っていれば、接続のあとで問い合わせてその道に置き換えます。

## 3. ツールの一覧

📄 `angular-cli/packages/angular/cli/src/commands/mcp/mcp-server.ts` L28–61 （▶ の行: 31, 37–44, 51, 58–60）

```ts
28 │ /**
29 │  * Tools to manage devservers. Should be bundled together, then added to experimental or stable as a group.
30 │  */
31 ▶ const DEVSERVER_TOOLS = [DEVSERVER_START_TOOL, DEVSERVER_STOP_TOOL, DEVSERVER_WAIT_FOR_BUILD_TOOL];
32 │ 
33 │ /**
34 │  * The set of tools that are enabled by default for the MCP server.
35 │  * These tools are considered stable and suitable for general use.
36 │  */
37 ▶ const STABLE_TOOLS = [
38 ▶   AI_TUTOR_TOOL,
39 ▶   BEST_PRACTICES_TOOL,
40 ▶   DOC_SEARCH_TOOL,
41 ▶   LIST_PROJECTS_TOOL,
42 ▶   ZONELESS_MIGRATION_TOOL,
43 ▶   RUN_TARGET_TOOL,
44 ▶   ...DEVSERVER_TOOLS,
45 │ ] as const;
46 │ 
47 │ /**
48 │  * The set of tools that are available but not enabled by default.
49 │  * These tools are considered experimental and may have limitations.
50 │  */
51 ▶ export const EXPERIMENTAL_TOOLS: readonly AnyMcpToolDeclaration[] = [] as const;
52 │ 
53 │ /**
54 │  * Experimental tools that are grouped together under a single name.
55 │  *
56 │  * Used for enabling them as a group.
57 │  */
58 ▶ export const EXPERIMENTAL_TOOL_GROUPS: Record<string, readonly AnyMcpToolDeclaration[]> = {
59 ▶   'all': EXPERIMENTAL_TOOLS,
60 ▶   'devserver': [],
61 │ };
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/tool-registry.ts` L39–50 （▶ の行: 41–42, 44–45, 47–49）

```ts
39 │ export interface McpToolDeclaration<TInput extends ZodRawShape, TOutput extends ZodRawShape> {
40 │   name: string;
41 ▶   title?: string;
42 ▶   description: string;
43 │   annotations?: ToolAnnotations;
44 ▶   inputSchema?: TInput;
45 ▶   outputSchema?: TOutput;
46 │   factory: McpToolFactory<TInput>;
47 ▶   shouldRegister?: (context: McpToolContext) => boolean | Promise<boolean>;
48 ▶   isReadOnly?: boolean;
49 ▶   isLocalOnly?: boolean;
50 │ }
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/tool-registry.ts` L61–96 （▶ の行: 68, 72, 74, 77–79, 81, 83, 86, 90–91）

```ts
61 │ export async function registerTools(
62 │   server: McpServer,
63 │   context: Omit<McpToolContext, 'server'>,
64 │   declarations: AnyMcpToolDeclaration[],
65 │ ): Promise<void> {
66 │   for (const declaration of declarations) {
67 │     const toolContext = { ...context, server };
68 ▶     if (declaration.shouldRegister && !(await declaration.shouldRegister(toolContext))) {
69 │       continue;
70 │     }
71 │ 
72 ▶     const { name, factory, shouldRegister, isReadOnly, isLocalOnly, ...config } = declaration;
73 │ 
74 ▶     const handler = await factory(toolContext);
75 │ 
76 │     // Add declarative characteristics to annotations
77 ▶     config.annotations ??= {};
78 ▶     if (isReadOnly !== undefined) {
79 ▶       config.annotations.readOnlyHint = isReadOnly;
80 │     }
81 ▶     if (isLocalOnly !== undefined) {
82 │       // openWorldHint: false means local only
83 ▶       config.annotations.openWorldHint = !isLocalOnly;
84 │     }
85 │ 
86 ▶     server.registerTool(
87 │       name,
88 │       {
89 │         ...config,
90 ▶         inputSchema: config.inputSchema ? z.object(config.inputSchema) : undefined,
91 ▶         outputSchema: config.outputSchema ? z.object(config.outputSchema) : undefined,
92 │       },
93 │       handler,
94 │     );
95 │   }
96 │ }
```

37〜45 行目の 9 つが、そのまま `tools/list` の順でした。各ツールの `isReadOnly`・`isLocalOnly` は、78〜84 行目で MCP の `annotations` の `readOnlyHint` と `openWorldHint`（外の世界に触るか）に写されます。90〜91 行目で zod の形を JSON Schema にし、入力の説明文（`.describe(…)`）がそのまま schema の `description` になります。68 行目の `shouldRegister` を持つツールは、今は 1 つもありません。51 行目の実験的なツールは空、60 行目の `devserver` の組も空です（devserver の 3 つは 44 行目で安定版に入っている）。

| 名前 | title | readOnlyHint | openWorldHint | 入力 | 出力の鍵 |
| --- | --- | --- | --- | --- | --- |
| `ai_tutor` | Start Angular AI Tutor | true | false | `（なし）` | `—` |
| `get_best_practices` | Get Angular Coding Best Practices Guide | true | false | `workspacePath` | `—` |
| `search_documentation` | Search Angular Documentation (angular.dev) | true | true | `query（必須）、includeTopContent、version` | `searchedVersion、results` |
| `list_projects` | List Angular Projects | true | false | `（なし）` | `workspaces、parsingErrors、versioningErrors` |
| `onpush_zoneless_migration` | Plan migration to OnPush and/or zoneless | true | false | `fileOrDirPath（必須）` | `—` |
| `run_target` | Run Project Target | false | false | `workspace、project、target（必須）、configuration、options` | `status、logs、extensions` |
| `devserver_start` | Start Development Server | false | false | `workspace、project、port` | `message、address` |
| `devserver_stop` | Stop Development Server | false | false | `workspace、project` | `message、logs` |
| `devserver_wait_for_build` | Wait for Devserver Build | true | false | `workspace、project、timeout` | `status、logs` |

記録の `tools/list` の表です（説明文の全文は DEMO の「ツールの説明文」）。`run_target` と devserver の入力の `project` の説明は shared-options.ts の文です。

📄 `angular-cli/packages/angular/cli/src/commands/mcp/shared-options.ts` L11–24 （▶ の行: 16, 21–22）

```ts
11 │ export const workspaceAndProjectOptions = {
12 │   workspace: z
13 │     .string()
14 │     .optional()
15 │     .describe(
16 ▶       'The path to the workspace directory (containing angular.json). If not provided, uses the current directory.',
17 │     ),
18 │   project: z
19 │     .string()
20 │     .optional()
21 ▶     .describe(
22 ▶       'Which project to target in a monorepo context. If not provided, targets the default project.',
23 │     ),
24 │ };
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/workspace-utils.ts` L59–83 （▶ の行: 60, 62–63, 72–73, 78–79）

```ts
59 │ /**
60 ▶  * Returns the name of the default project in the current workspace, or undefined if none exists.
61 │  *
62 ▶  * If no default project is defined but there's only a single project in the workspace, its name will
63 ▶  * be returned.
64 │  */
65 │ export function getDefaultProjectName(workspace: AngularWorkspace | undefined): string | undefined {
66 │   const projects = workspace?.projects;
67 │ 
68 │   if (!projects) {
69 │     return undefined;
70 │   }
71 │ 
72 ▶   const defaultProjectName = workspace?.extensions['defaultProject'] as string | undefined;
73 ▶   if (defaultProjectName) {
74 │     return defaultProjectName;
75 │   }
76 │ 
77 │   // No default project defined? This might still be salvageable if only a single project exists.
78 ▶   if (projects.size === 1) {
79 ▶     return Array.from(projects.keys())[0];
80 │   }
81 │ 
82 │   return undefined;
83 │ }
```

22 行目の「default project」は 72 行目の `defaultProject` の拡張の値を指し、無ければ 78〜79 行目でプロジェクトが 1 つのときだけその名前です。`defaultProject` は CLI の設定では v14 で使わなくなった項目で、[第 7 回](07-ngx-generate-run.md)の `ng deploy` の説明文の直し（5887a6f8e0）と同じ言い方が残っています。

## 4. オプションでツールの一覧がどう変わるか

📄 `angular-cli/packages/angular/cli/src/commands/mcp/mcp-server.ts` L189–222 （▶ の行: 192–193, 196–198, 200–204, 206, 209, 212–213, 215–217, 220）

```ts
189 │ ): AnyMcpToolDeclaration[] {
190 │   let toolDeclarations = [...stableDeclarations];
191 │ 
192 ▶   if (options.readOnly) {
193 ▶     toolDeclarations = toolDeclarations.filter((tool) => tool.isReadOnly);
194 │   }
195 │ 
196 ▶   if (options.localOnly) {
197 ▶     toolDeclarations = toolDeclarations.filter((tool) => tool.isLocalOnly);
198 ▶   }
199 │ 
200 ▶   const enabledExperimentalTools = new Set(options.experimentalTools);
201 ▶   for (const [toolGroupName, toolGroup] of Object.entries(EXPERIMENTAL_TOOL_GROUPS)) {
202 ▶     if (enabledExperimentalTools.delete(toolGroupName)) {
203 ▶       for (const tool of toolGroup) {
204 ▶         enabledExperimentalTools.add(tool.name);
205 │       }
206 ▶     }
207 │   }
208 │ 
209 ▶   if (enabledExperimentalTools.size > 0) {
210 │     const experimentalToolsMap = new Map(experimentalDeclarations.map((tool) => [tool.name, tool]));
211 │ 
212 ▶     for (const toolName of enabledExperimentalTools) {
213 ▶       const tool = experimentalToolsMap.get(toolName);
214 │       if (tool) {
215 ▶         toolDeclarations.push(tool);
216 ▶       } else if (!stableDeclarations.some((t) => t.name === toolName)) {
217 ▶         options.logger.warn(`Unknown experimental tool: ${toolName}`);
218 │       }
219 │     }
220 ▶   }
221 │ 
222 │   return toolDeclarations;
```

| オプション | 数 | tools/list の名前 | 標準エラー出力 |
| --- | --- | --- | --- |
| `（なし）` | 9 | `ai_tutor, get_best_practices, search_documentation, list_projects, onpush_zoneless_migration, run_target, devserver_start, devserver_stop, devserver_wait_for_build` | （空） |
| `--read-only` | 6 | `ai_tutor, get_best_practices, search_documentation, list_projects, onpush_zoneless_migration, devserver_wait_for_build` | （空） |
| `--local-only` | 8 | `ai_tutor, get_best_practices, list_projects, onpush_zoneless_migration, run_target, devserver_start, devserver_stop, devserver_wait_for_build` | （空） |
| `--read-only --local-only` | 5 | `ai_tutor, get_best_practices, list_projects, onpush_zoneless_migration, devserver_wait_for_build` | （空） |
| `-E all` | 9 | `ai_tutor, get_best_practices, search_documentation, list_projects, onpush_zoneless_migration, run_target, devserver_start, devserver_stop, devserver_wait_for_build` | （空） |
| `-E devserver` | 9 | `ai_tutor, get_best_practices, search_documentation, list_projects, onpush_zoneless_migration, run_target, devserver_start, devserver_stop, devserver_wait_for_build` | （空） |
| `-E nope` | 9 | `ai_tutor, get_best_practices, search_documentation, list_projects, onpush_zoneless_migration, run_target, devserver_start, devserver_stop, devserver_wait_for_build` | （空） |
| `-E list_projects` | 9 | `ai_tutor, get_best_practices, search_documentation, list_projects, onpush_zoneless_migration, run_target, devserver_start, devserver_stop, devserver_wait_for_build` | （空） |

1. **--read-only（192〜194 行目）**

   `isReadOnly` の 6 つが残り、`run_target`・`devserver_start`・`devserver_stop` が消えました。`search_documentation`（外に送る）は残ります。消えたツールを呼ぶと「-32602 Tool run\_target not found」でした。
2. **--local-only（196〜198 行目）**

   `isLocalOnly` の 8 つ、`search_documentation` だけが消えます。両方なら 5 つです。
3. **-E（200〜220 行目）**

   201〜206 行目で組の名前を中のツールの名前に開き、209 行目からは実験的なツールの表で探します。今は表が空なので、`-E all`・`-E devserver`・`-E nope` のどれでも 9 つのままでした。216 行目で安定版の名前（`-E list_projects`）は何も言わず、それ以外は 217 行目で警告しますが、1 節のとおりこの警告は出ません。

200〜220 行目は 192〜198 行目の絞り込みの**あと**なので、`--read-only` と `-E` を一緒に使うと、読み取り専用でない実験的なツールも足されます。今は実験的なツールが無いので、この形は記録では確かめられません。

## 5. どの道までを触らせるか

📄 `angular-cli/packages/angular/cli/src/commands/mcp/host.ts` L295–306 （▶ の行: 295, 297, 299–300, 302）

```ts
295 ▶ export function createRootRestrictedHost(
296 │   baseHost: Host,
297 ▶   initialRoots: string[] = [process.cwd()],
298 │ ): Host {
299 ▶   const defaultRoots = resolveRoots(initialRoots);
300 ▶   let roots = defaultRoots;
301 │ 
302 ▶   function checkPath(path: string) {
303 │     const resolvedPath = resolve(path);
304 │     let realPath: string;
305 │     try {
306 │       realPath = realpathSync(resolvedPath);
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/host.ts` L332–357 （▶ の行: 332–333, 335, 338–339, 345–346, 348–349, 353–354）

```ts
332 ▶     const isAllowed = roots.some((root) => {
333 ▶       const rel = relative(root, realPath);
334 │ 
335 ▶       return !rel.startsWith('..') && !isAbsolute(rel);
336 │     });
337 │ 
338 ▶     if (!isAllowed) {
339 ▶       throw new Error(`Access denied: path '${path}' is outside allowed roots.`);
340 │     }
341 │   }
342 │ 
343 │   return {
344 │     ...baseHost,
345 ▶     setRoots(newRoots: string[]) {
346 ▶       roots = newRoots.length > 0 ? resolveRoots(newRoots) : defaultRoots;
347 │     },
348 ▶     stat(path: string) {
349 ▶       checkPath(path);
350 │ 
351 │       return baseHost.stat(path);
352 │     },
353 ▶     existsSync(path: string) {
354 ▶       checkPath(path);
355 │ 
356 │       return baseHost.existsSync(path);
357 │     },
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/workspace-utils.ts` L85–121 （▶ の行: 91, 95–99, 113, 117–118, 120）

```ts
 85 │ function isWithinAllowedRoot(root: string, targetPath: string): boolean {
 86 │   const rel = relative(root, targetPath);
 87 │ 
 88 │   return !rel.startsWith('..') && !isAbsolute(rel);
 89 │ }
 90 │ 
 91 ▶ async function getAllowedWorkspaceRoots(server: McpToolContext['server']): Promise<string[]> {
 92 │   let roots: string[];
 93 │   const clientCapabilities = server.server.getClientCapabilities();
 94 │ 
 95 ▶   if (clientCapabilities?.roots) {
 96 ▶     const { roots: clientRoots } = await server.server.listRoots();
 97 ▶     roots = clientRoots?.map((root) => fileURLToPath(root.uri)) ?? [];
 98 ▶   } else {
 99 ▶     roots = [process.cwd()];
100 │   }
101 │ 
102 │   return roots
103 │     .map((root) => {
104 │       try {
105 │         return realpathSync(root);
106 │       } catch {
107 │         return null;
108 │       }
109 │     })
110 │     .filter((root): root is string => root !== null);
111 │ }
112 │ 
113 ▶ export async function isAllowedWorkspacePath(
114 │   server: McpToolContext['server'],
115 │   workspacePath: string,
116 │ ): Promise<boolean> {
117 ▶   const allowedRoots = await getAllowedWorkspaceRoots(server);
118 ▶   const resolvedWorkspacePath = realpathSync(workspacePath);
119 │ 
120 ▶   return allowedRoots.some((root) => isWithinAllowedRoot(root, resolvedWorkspacePath));
121 │ }
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/workspace-utils.ts` L179–206 （▶ の行: 179–181, 183, 192–194）

```ts
179 ▶   } else if (mcpWorkspace) {
180 ▶     workspace = mcpWorkspace;
181 ▶     workspacePath = workspace.basePath;
182 │   } else {
183 ▶     const found = findAngularJsonDir(process.cwd(), host);
184 │ 
185 │     if (!found) {
186 │       throw new Error(
187 │         'Could not find an Angular workspace (angular.json) in the current directory. ' +
188 │           "You can use 'list_projects' to find available workspaces.",
189 │       );
190 │     }
191 │ 
192 ▶     if (server && !(await isAllowedWorkspacePath(server, found))) {
193 ▶       throw new Error(
194 ▶         `The current directory resolves to a workspace outside the allowed MCP roots: ${found}. ` +
195 │           "You can use 'list_projects' to find available workspaces.",
196 │       );
197 │     }
198 │ 
199 │     workspacePath = found;
200 │     const configPath = join(workspacePath, 'angular.json');
201 │     try {
202 │       workspace = await AngularWorkspace.load(configPath);
203 │     } catch (e) {
204 │       throw new Error(`Failed to load workspace configuration at ${configPath}.`, { cause: e });
205 │     }
206 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/projects.ts` L567–587 （▶ の行: 567, 577–579, 582–584）

```ts
567 ▶ async function createListProjectsHandler({ server, roots: configuredRoots }: McpToolContext) {
568 │   return async () => {
569 │     const workspaces: WorkspaceData[] = [];
570 │     const parsingErrors: ParsingError[] = [];
571 │     const versioningErrors: z.infer<typeof listProjectsOutputSchema.versioningErrors> = [];
572 │     const seenPaths = new Set<string>();
573 │     const versionCache = new Map<string, string | undefined>();
574 │ 
575 │     let searchRoots: string[] | undefined;
576 │     const clientCapabilities = server.server.getClientCapabilities();
577 ▶     if (clientCapabilities?.roots) {
578 ▶       const { roots } = await server.server.listRoots();
579 ▶       searchRoots = roots?.map((r) => normalize(fileURLToPath(r.uri)));
580 │     }
581 │ 
582 ▶     if (!searchRoots || searchRoots.length === 0) {
583 ▶       searchRoots =
584 ▶         configuredRoots && configuredRoots.length > 0 ? configuredRoots : [process.cwd()];
585 │     }
586 │ 
587 │     searchRoots = deduplicateSearchRoots(searchRoots);
```

道の制限は 3 か所にあり、見ているものが違います。

| どこ | クライアントの roots | --root | どちらも無い |
| --- | --- | --- | --- |
| `restrictedHost`（host.ts 332〜339、ファイルを読むツールと run\_target の起動） | 使う（mcp-server.ts 139） | 使う（mcp-server.ts 129） | カレントディレクトリ |
| `list_projects` の探す場所（projects.ts 577〜585） | 使う | 使う（584 行目） | カレントディレクトリ |
| `isAllowedWorkspacePath`（workspace-utils.ts 91〜120、get\_best\_practices・run\_target・devserver の道の検査） | 使う（95〜97 行目） | **使わない** | カレントディレクトリ（99 行目） |

DEMO の「5. 道」で確かめたこと：

1. **cwd がワークスペース**

   `list_projects` は ws22 を 1 つ返し（`frameworkVersion: "22"`。欠けた鍵は 6 節）、隣の ws21 を渡した `get_best_practices` は「Workspace path is outside the allowed MCP roots」、`run_target` は「Access denied: path '&lt;work&gt;/ws21' is outside allowed roots.」（host.ts 339 行目）でした。
2. **cwd の外を --root で渡す**

   空のディレクトリで `ng mcp --root <work>/ws22` を起動すると、`list_projects` は ws22 を返しましたが、同じ道の `get_best_practices` と `run_target` は「Workspace path is outside the allowed MCP roots」でした。`isAllowedWorkspacePath` が 99 行目でカレントディレクトリしか見ないからです。46 行目の `--root` の説明「filesystem access and workspace discovery のための許す道」と合いません。`--root` は 41555dfb3b（2026-08-04、``feat(@angular/cli): add `--root` command line option to `mcp` command``）で足され、そのとき workspace-utils.ts は変わっていません。
3. **クライアントの roots で渡す**

   同じ空のディレクトリから、クライアントの roots に ws22 を入れると、3 つとも通りました（`run_target` の `nope` は「Project target does not exist.」まで進む）。サーバーは各ツールの呼び出しのたびに `roots/list` を送ってきました。
4. **cwd がワークスペースの下（src/app）**

   `ng` 自体はワークスペースを上にたどって見つけ（context の workspace）、181 行目で `run_target` はそれを使おうとしましたが、`restrictedHost` の根は `src/app` なので「Access denied: path '&lt;work&gt;/ws22' is outside allowed roots.」でした。`list_projects` は下にしか探さないので見つからず、次の文を返しました。

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/projects.ts` L622–634 （▶ の行: 622, 628–630）

```ts
622 ▶     if (workspaces.length === 0 && parsingErrors.length === 0) {
623 │       return {
624 │         content: [
625 │           {
626 │             type: 'text' as const,
627 │             text:
628 ▶               'No Angular workspace found.' +
629 ▶               ' An `angular.json` file, which marks the root of a workspace,' +
630 ▶               ' could not be located in the current directory or any of its parent directories.',
631 │           },
632 │         ],
633 │         structuredContent: { workspaces: [] },
634 │       };
```

630 行目の「current directory or any of its parent directories」は、上にはたどらない実装（projects.ts の `findAngularJsonFiles`、根から下へ）と合いません。記録では親のディレクトリに angular.json があるのに、この文でした。

## 6. list\_projects の結果に欠けている 2 つ

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/projects.ts` L462–479 （▶ の行: 465, 469, 475–476）

```ts
462 │     for (const [name, project] of ws.projects.entries()) {
463 │       const sourceRoot = project.sourceRoot ?? posix.join(project.root, 'src');
464 │       const fullSourceRoot = join(workspaceRoot, sourceRoot);
465 ▶       const unitTestFramework = getUnitTestFramework(project.targets.get('test'));
466 │       const styleLanguage = await getProjectStyleLanguage(project, ws, fullSourceRoot);
467 │       const targets = Array.from(project.targets.keys());
468 │ 
469 ▶       projects.push({
470 │         name,
471 │         type: project.extensions['projectType'] as 'application' | 'library' | undefined,
472 │         builder: project.targets.get('build')?.builder,
473 │         root: project.root,
474 │         sourceRoot,
475 ▶         selectorPrefix: project.extensions['prefix'] as string,
476 ▶         unitTestFramework,
477 │         styleLanguage,
478 │         targets,
479 │       });
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/projects.ts` L338–353 （▶ の行: 346–351）

```ts
338 │ function getUnitTestFramework(
339 │   testTarget: import('@angular-devkit/core').workspaces.TargetDefinition | undefined,
340 │ ): 'jasmine' | 'jest' | 'vitest' | 'unknown' | undefined {
341 │   if (!testTarget) {
342 │     return undefined;
343 │   }
344 │ 
345 │   // For the new unit-test builder, the runner option directly informs the framework.
346 ▶   if (testTarget.builder === '@angular/build:unit-test') {
347 ▶     const runner = testTarget.options?.['runner'] as 'karma' | 'vitest' | undefined;
348 ▶     if (runner === 'karma') {
349 ▶       return 'jasmine'; // Karma is a runner, but the framework is Jasmine.
350 ▶     } else {
351 ▶       return runner; // For 'vitest', the runner and framework are the same.
352 │     }
353 │   }
```

ws22 の `list_projects` の結果には、出力の schema にある `selectorPrefix` と `unitTestFramework` が両方ありませんでした。ws22 の angular.json には `"prefix": "app"` と `"test": {"builder": "@angular/build:unit-test"}` があります。

1. **selectorPrefix（475 行目）**

   `project.extensions['prefix']` を読みますが、@angular-devkit/core のワークスペースの読み込みは `prefix` を `root`・`sourceRoot` と同じ決まった項目として扱い（core の workspace/json/reader.ts L179・L205）、`extensions` には入れません。ws22 を同じ `readWorkspace` で読むと、`extensions` の鍵は `projectType` と `schematics` だけで、`project.prefix` が `"app"` でした。どのワークスペースでも `selectorPrefix` は出ません。9d5c8077e9（2025-07-07）からこの行です。
2. **unitTestFramework（346〜351 行目）**

   `@angular/build:unit-test` では `runner` の option をそのまま返します。新しいワークスペースは `runner` を書かず、builder の schema の既定（`"default": "vitest"`）に任せるので、351 行目は `undefined` を返し、鍵ごと消えます。`list_projects` の説明文は「テストを書く前にこの値を必ず使う」「`unknown` なら設定ファイルを見る」と言いますが、`unknown` にもならずに黙って欠けます。45024e836b（2025-10-15）からの形です。

tools/projects\_spec.ts は偽のワークスペースを手で作り、L45 で `extensions: { projectType: 'application', prefix: 'app' }`、L39 で `options: { runner: 'vitest' }` と書いています。実物の読み込みと違う場所に `prefix` を置き、実物の新しいワークスペースに無い `runner` を置いているので、L90 の `unitTestFramework` の expect は通ります（`selectorPrefix` を確かめる expect は無い）。新しい本家でも 475・351 行目は同じです。

## 7. 読み取り専用のツールを呼んだ結果

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/best-practices.ts` L94–132 （▶ の行: 99, 102, 112–113, 123–124, 126–128, 131）

```ts
 94 │ async function getVersionSpecificBestPractices(
 95 │   workspacePath: string,
 96 │   logger: McpToolContext['logger'],
 97 │   server: McpToolContext['server'],
 98 │ ): Promise<{ content: string; source: string } | undefined> {
 99 ▶   if (server) {
100 │     let isAllowed: boolean;
101 │     try {
102 ▶       isAllowed = await isAllowedWorkspacePath(server, workspacePath);
103 │     } catch (e) {
104 │       logger.warn(
105 │         `Failed to verify workspace path '${workspacePath}': ` +
106 │           `${e instanceof Error ? e.message : e}. Falling back to the bundled guide.`,
107 │       );
108 │ 
109 │       return undefined;
110 │     }
111 │ 
112 ▶     if (!isAllowed) {
113 ▶       throw new Error(
114 │         `Workspace path is outside the allowed MCP roots: ${workspacePath}. ` +
115 │           "You can use 'list_projects' to find available workspaces.",
116 │       );
117 │     }
118 │   }
119 │ 
120 │   // 1. Resolve the path to package.json
121 │   let pkgJsonPath: string;
122 │   try {
123 ▶     const workspaceRequire = createRequire(workspacePath);
124 ▶     pkgJsonPath = workspaceRequire.resolve('@angular/core/package.json');
125 │   } catch (e) {
126 ▶     logger.warn(
127 ▶       `Could not resolve '@angular/core/package.json' from '${workspacePath}'. ` +
128 ▶         'Is Angular installed in this project? Falling back to the bundled guide.',
129 │     );
130 │ 
131 ▶     return undefined;
132 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/best-practices.ts` L202–226 （▶ の行: 210–211, 216–217, 223–225）

```ts
202 │ function createBestPracticesHandler({ logger, server }: McpToolContext) {
203 │   let bundledBestPractices: Promise<string>;
204 │ 
205 │   return async (input: BestPracticesInput) => {
206 │     let content: string | undefined;
207 │     let source: string | undefined;
208 │ 
209 │     // First, try to get the version-specific guide.
210 ▶     if (input.workspacePath) {
211 ▶       const versionSpecific = await getVersionSpecificBestPractices(
212 │         input.workspacePath,
213 │         logger,
214 │         server,
215 │       );
216 ▶       if (versionSpecific) {
217 ▶         content = versionSpecific.content;
218 │         source = versionSpecific.source;
219 │       }
220 │     }
221 │ 
222 │     // If the version-specific guide was not found for any reason, fall back to the bundled version.
223 ▶     if (content === undefined) {
224 ▶       content = await (bundledBestPractices ??= getBundledBestPractices());
225 ▶       source = `bundled (CLI v${VERSION.full})`;
226 │     }
```

`get_best_practices` は、`workspacePath` があれば、そのワークスペースに入っている `@angular/core` の package.json の `angular.bestPractices` が指す案内（版ごとの案内）を返し、無ければ 223〜225 行目で CLI に同梱の案内を返す、という作りです。記録で ws22 の道を渡すと、返った本文は CLI 22.2.7 の同梱の案内と 1 文字も違わず、ws22 の `@angular/core` 22.3.0 の `resources/best-practices.md`（`providedIn: 'root'` の行が 1 行少ない）とは違いました。原因は 123 行目の `createRequire(workspacePath)` です。`createRequire` は渡した道を「ファイル」とみなし、その親のディレクトリから探すので、末尾に `/` の無いワークスペースの道では、ワークスペースの `node_modules` を見ません。

📄 `createRequire の道の末尾（手元の記録）`

```
# Node 24.22.1 で、ワークスペースの外の空のディレクトリから
createRequire("<work>/ws22").resolve("@angular/core/package.json")   -> MODULE_NOT_FOUND
createRequire("<work>/ws22/").resolve("@angular/core/package.json")  -> <work>/ws22/node_modules/@angular/core/package.json
```

126〜129 行目の「Falling back to the bundled guide.」の警告も 1 節の理由で出ないので、利用者からは版ごとの案内に切り替わらないことが見えません。この形は 68e711307e（2025-10-17、`feat(@angular/cli): make get_best_practices tool version-aware`）からで、新しい本家でも同じ行です。同じ CLI の version-info.ts は `createRequire(context.root + '/')`（81 行目のコメント「Trailing slash is used to allow the path to be treated as a directory」、[第 7 回](07-ngx-generate-run.md)の 4 節）と書いています。親のディレクトリの `node_modules` に `@angular/core` がある形（ワークスペースを下に持つモノレポ）では、親の版の案内を返すことになります。

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/onpush-zoneless-migration/zoneless-migration.ts` L56–70 （▶ の行: 62–69）

```ts
56 │ export async function registerZonelessMigrationTool(
57 │   fileOrDirPath: string,
58 │   host: Host,
59 │   extras: ServerContext,
60 │ ) {
61 │   let filesWithComponents, componentTestFiles, zoneFiles, categorizationErrors;
62 ▶   try {
63 ▶     ({ filesWithComponents, componentTestFiles, zoneFiles, categorizationErrors } =
64 ▶       await discoverAndCategorizeFiles(fileOrDirPath, host, extras));
65 ▶   } catch (e) {
66 ▶     return createResponse(
67 ▶       `Error: Could not access the specified path. Please ensure the following path is correct ` +
68 ▶         `and that you have the necessary permissions:\n${fileOrDirPath}`,
69 ▶     );
70 │   }
```

`onpush_zoneless_migration` に ws22 の `app.ts` を渡すと、OnPush にするための手順の文（エージェント向けの指示）を返しました。ファイルは書き換えません。根の外の ws21 の `app.ts` は、65〜69 行目が host の「outside allowed roots」の例外を握りつぶし、「Could not access the specified path. Please ensure … you have the necessary permissions」と返しました（`isError` も付かない）。`ai_tutor` は Angular v20 を前提にしたチューターの指示の Markdown を返しました。

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/doc-search.ts` L100–120 （▶ の行: 105–106, 110, 113–114, 118–119）

```ts
100 │ function createDocSearchHandler({ logger }: McpToolContext) {
101 │   let apiKey: string | undefined;
102 │ 
103 │   async function performSearch(query: string, version: number) {
104 │     if (!apiKey) {
105 ▶       const dcip = createDecipheriv(
106 ▶         'aes-256-gcm',
107 │         (k1 + ALGOLIA_APP_ID).padEnd(32, '^'),
108 │         iv,
109 │       ).setAuthTag(Buffer.from(at, 'base64'));
110 ▶       apiKey = dcip.update(ALGOLIA_API_E, 'hex', 'utf-8') + dcip.final('utf-8');
111 │     }
112 │ 
113 ▶     const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/angular_v${version}/query`;
114 ▶     const response = await fetch(url, {
115 │       method: 'POST',
116 │       headers: {
117 │         'Content-Type': 'application/json',
118 ▶         'X-Algolia-Application-Id': ALGOLIA_APP_ID,
119 ▶         'X-Algolia-API-Key': apiKey,
120 │       },
```

`search_documentation` は 113〜114 行目で Algolia（angular.dev の検索）に問い合わせます。`--local-only` で消えるのはこのためです。105〜110 行目は、ソースに暗号化して置いた検索専用の鍵を戻す処理です。この記録では呼んでいません。

📄 `angular-cli/packages/angular/cli/src/commands/mcp/mcp-server.ts` L164–177 （▶ の行: 169, 171–172）

```ts
164 │   await registerTools(
165 │     server,
166 │     {
167 │       workspace: options.workspace,
168 │       logger,
169 ▶       exampleDatabasePath: join(__dirname, '../../../lib/code-examples.db'),
170 │       devservers: new Map<string, Devserver>(),
171 ▶       host: restrictedHost,
172 ▶       roots: resolvedRoots,
173 │     },
174 │     toolDeclarations,
175 │   );
176 │ 
177 │   return server;
```

169 行目の `exampleDatabasePath` を読むツールは、44129f66a3 にはもうありません（`git grep` で tool-registry.ts の型の 1 か所だけ）。消えた `find_examples` のためのもので、新しい本家ではこの行が消えています。

> **🧪 DEMO — 本物の ng mcp との JSON-RPC の記録**
>
> 記録のスクリプトがクライアントの役をして、`initialize` → `notifications/initialized` → 各要求を 1 行ずつ送り、応答を書き留めたものです（22.2.7、2026-11-24）。`<work>` は作業用の場所です。
>
> **ツールの説明文（tools/list の description）**
>
> **initialize の instructions と、端末での案内・--help**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-mcp)

## ここまでの呼び出し（クライアントが ng mcp を起動して list\_projects を呼ぶ）

- 👤 `npx -y @angular/cli mcp` — クライアントの子プロセス、標準出力はパイプ
  - `McpCommandModule.run` — cli.ts L67 — *isTTY() が false*
    - `serveStdio(() => createMcpServer(…))` — L79 — *run は戻り、logger は complete される*
      - `createMcpServer` — mcp-server.ts L63
        - `assembleToolDeclarations` — L180 — *--read-only・--local-only・-E*
        - `createRootRestrictedHost(LocalWorkspaceHost, roots ?? [cwd])` — L127 → host.ts L295
        - `registerTools → server.registerTool` — L164 → tool-registry.ts L61 — *annotations に readOnlyHint・openWorldHint*
      - `server.oninitialized → listRoots → setRoots` — mcp-server.ts L132 — *クライアントに roots があるときだけ*
  - 👤 `tools/call list_projects` — クライアント
    - `createListProjectsHandler の関数` — projects.ts L568 — *roots → --root → cwd から下へ探す*

## テストと直し方

| ファイル（src/commands/mcp/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `host_spec.ts` | `createRootRestrictedHost`（14）の 3 本 | 5 節の host の根の外を拒む |
| `workspace-utils_spec.ts` | `MCP Workspace Utils`（24）› `resolveWorkspaceAndProject`（104）› `should allow provided workspace within allowed MCP roots`（225）・`should reject provided workspace outside allowed MCP roots`（236） | 5 節。どちらもクライアントの `listRoots` を偽物にした形で、`--root` の形は無い |
| `workspace-utils_spec.ts` | `getDefaultProjectName`（77）› `should return defaultProject from extensions`（84） | 3 節の default project |
| `tools/projects_spec.ts` | `List Projects Tool`（18）› `should use configured roots when client roots capability is absent`（93）・`should fall back to configured roots when client supports roots but returns an empty list`（110） | 5 節の `list_projects` の `--root` |
| `tools/projects_spec.ts` | 同 › `should list workspaces and extract available architect targets`（76）、偽のワークスペース（L36〜47） | 6 節。L45 の `extensions` の `prefix`・L39 の `runner` は実物の形と違う。`selectorPrefix` の expect は無い |
| `tools/run-target/run-target_spec.ts`・`tools/devserver/devserver_spec.ts` | `Run Target Tool`（18）・`Serve Tools`（32） | run\_target と devserver。`--root` だけを与えた形は無い |
| （無い） | `mcp-server.ts`・`cli.ts`・`tools/best-practices.ts` の spec | 4 節の `assembleToolDeclarations`、1 節の logger、6 節の版ごとの案内 |

📄 `走らせたコマンド（2026-11-24）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<下の名前>"
```

結果は手元の bazel で `//packages/angular/cli:test` が 257 specs・0 failures でした。名前で絞ると、`createRootRestrictedHost` 3、`MCP Workspace Utils` 22、`MCP Utils` 4、`List Projects Tool` 3、`Run Target Tool` 13、`Serve Tools` 9、`Doc Search Tool` 2、`migrateSingleFile` 8、`migrateTestFile` 3 で、どれも 0 failures でした。

直すとしたら、7 節は best-practices.ts の 123 行目を `createRequire(join(workspacePath, 'package.json'))`（または末尾に `/`）にし、`best-practices_spec.ts` を作って「ワークスペースの `@angular/core` の `angular.bestPractices` の案内を返す」を確かめます。5 節は workspace-utils.ts の `getAllowedWorkspaceRoots`（91 行目）に `context.roots`（`--root`）を渡し、クライアントの roots が無いときは 99 行目の代わりにそれを使います。workspace-utils\_spec.ts の L225・L236 の並びに「`--root` の中は許す」を足す形です。projects.ts の 630 行目の文は「or any of its subdirectories」にします。6 節は 475 行目を `project.prefix` に、351 行目を `runner ?? 'vitest'` にし、projects\_spec.ts の偽のワークスペースを `prefix` を外に置く形（`readWorkspace` の結果と同じ）に直して `selectorPrefix` の expect と、`runner` の無い unit-test の it を足します。1 節は cli.ts の 88 行目に、complete しない別の logger（標準エラー出力に書く）を渡すか、`createMcpServer` の警告を `run` の中で先に出す形です。

## 聞かれそうな質問

**Q. エージェントに Angular のワークスペースを書き換えさせたくないときは？**

`--read-only` です（192〜194 行目）。`run_target` と devserver の起動・停止が一覧から消え、呼んでも「Tool not found」です。外に問い合わせる `search_documentation` は残るので、それも止めるなら `--local-only` も付けます（5 つになる）。

**Q. どの道までをツールに見せますか？**

クライアントが roots を持っていればそれ、無ければ `--root`、それも無ければ `ng mcp` を起動したディレクトリです。ただし `get_best_practices`・`run_target`・devserver の道の検査（workspace-utils.ts 91〜120 行目）は `--root` を見ないので、`--root` だけで外のワークスペースを渡すと断られます（5 節）。

**Q. `-E` で何が使えますか？**

44129f66a3 では何も増えません。実験的なツールの表（51 行目）が空で、`all`・`devserver` の組も空だからです。知らない名前の警告は 217 行目にありますが、1 節の理由で出ません。

**Q. `get_best_practices` はワークスペースの Angular の版に合わせた案内を返しますか？**

そう作ってありますが、記録では返しませんでした。123 行目の `createRequire(workspacePath)` が親のディレクトリから探すので、ワークスペースの `@angular/core` を見つけられず、CLI に同梱の案内になります。

**Q. MCP のサーバーとして起動したかは、どう見分けていますか？**

73 行目の `isTTY()` だけです。端末で打てば案内を出して終わり、パイプなら JSON-RPC を待ちます。`NG_FORCE_TTY` や `CI` もここに効きます（[第 8 回](08-ngx-analytics.md)の 1 節の表）。

## 読み終えて

- `ng mcp` は隠れたコマンドで、端末なら案内、パイプなら `serveStdio` で 9 つのツールと 1 つのリソースを出す。
- `--read-only` は 6 つ、`--local-only` は 8 つ、両方で 5 つ。`-E` は今は何も足さない。
- 道の制限は 3 か所にあり、`--root` を見るのは host と `list_projects` だけ。
- `get_best_practices` は `createRequire` の道の末尾のせいで、ワークスペースの版の案内に切り替わらない。`list_projects` は `selectorPrefix` と、`runner` を書かない新しいワークスペースの `unitTestFramework` を出さない。
- `serveStdio` に移ってから、サーバーの中の `logger.warn` は complete した logger に書かれて消える。

---

← 前: [analytics：何をいつ送るか](08-ngx-analytics.md)  
次: [spec と issue を読む：ng コマンドを固めているもの](10-ngx-tests-issues.md) →
