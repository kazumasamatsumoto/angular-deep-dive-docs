[目次](../README.md) › [ng コマンドの内側](README.md) › 第 8 回 / 全 10 回

# analytics：何をいつ送るか

> src/analytics/\*・commands/analytics：同意の聞き方と保存場所、送る値の一覧（analytics-parameters）、送らない条件（CI・環境変数）、collector の形。

angular/angular-cli · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-analytics)

---

この章で分かること：Angular CLI が使用状況（コマンドの名前・いくつかのオプション・OS と Node の版など）を Google Analytics に送るしくみの、同意の聞き方・答えの置き場所・送らない条件・送る値の形。記録では、ワークスペースの中で聞かれた答えはグローバルではなくその angular.json に書かれ、`ng analytics info` は `{uid}` の形の設定を「not set」と言い、既定の `@angular/build:application` ではビルドの大きさの値（long-description の言う「バンドルの数と大きさ」）が送られる材料自体がありませんでした。

読む対象は `packages/angular/cli/src/analytics/` の `analytics.ts`・`analytics-parameters.ts`・`analytics-collector.ts` と `src/commands/analytics/` です（../angular-cli、44129f66a3）。これらを呼ぶ `command-module.ts` の `getAnalytics` などは[第 2 回](02-ngx-options.md)の持ち場なので、行だけを指します。手元の 22.2.7 とこの範囲のソースは同じでした（`git diff 44129f66a3 v22.2.7` が空）。

1. [1. ng と打ってから](01-ngx-entry.md)
2. [2. schema からオプション](02-ngx-options.md)
3. [3. angular.json と設定](03-ngx-config.md)
4. [4. パッケージマネージャー](04-ngx-package-managers.md)
5. [5. ng add](05-ngx-add.md)
6. [6. ng update](06-ngx-update.md)
7. [7. generate・new・run・version](07-ngx-generate-run.md)
8. **8. analytics**（この章）
9. [9. ng mcp](09-ngx-mcp.md)
10. [10. spec と issue](10-ngx-tests-issues.md)

> [!WARNING]
> **ハマりどころ**
>
> この章の記録は、どれも実際には送っていません。`ng` はすべて `NG_CLI_ANALYTICS=false` を付け、HOME を作業用の場所に向けて走らせました。「何を送るか」は、`AnalyticsCollector` を Node で直接作り、`https.request` を偽物に差し替えて、送る直前の要求を書き留めたものです（4 節）。

## 1. 送らない条件と、同意を聞く条件

📄 `angular-cli/packages/angular/cli/src/analytics/analytics.ts` L111–143 （▶ の行: 119, 122–123, 127–128, 130–133, 135–138）

```ts
111 │ /**
112 │  * Get the analytics user id.
113 │  *
114 │  * @returns
115 │  * - `string` user id.
116 │  * - `false` when disabled.
117 │  * - `undefined` when not configured.
118 │  */
119 ▶ async function getAnalyticsUserIdForLevel(
120 │   level: 'local' | 'global',
121 │ ): Promise<string | false | undefined> {
122 ▶   if (analyticsDisabled) {
123 ▶     return false;
124 │   }
125 │ 
126 │   const workspace = await getWorkspace(level);
127 ▶   const analyticsConfig: string | undefined | null | { uid?: string } | boolean =
128 ▶     workspace?.getCli()?.['analytics'];
129 │ 
130 ▶   if (analyticsConfig === false) {
131 ▶     return false;
132 ▶   } else if (analyticsConfig === undefined || analyticsConfig === null) {
133 ▶     return undefined;
134 │   } else {
135 ▶     if (typeof analyticsConfig == 'string') {
136 ▶       return analyticsConfig;
137 ▶     } else if (typeof analyticsConfig == 'object' && typeof analyticsConfig['uid'] == 'string') {
138 ▶       return analyticsConfig['uid'];
139 │     }
140 │ 
141 │     return undefined;
142 │   }
143 │ }
```

📄 `angular-cli/packages/angular/cli/src/analytics/analytics.ts` L145–184 （▶ の行: 150–153, 156–158, 162–166, 168, 171–172, 176–179, 183）

```ts
145 │ export async function getAnalyticsUserId(
146 │   context: CommandContext,
147 │   skipPrompt = false,
148 │ ): Promise<string | undefined> {
149 │   const { workspace } = context;
150 ▶   // Global config takes precedence over local config only for the disabled check.
151 ▶   // IE:
152 ▶   // global: disabled & local: enabled = disabled
153 ▶   // global: id: 123 & local: id: 456 = 456
154 │ 
155 │   // check global
156 ▶   const globalConfig = await getAnalyticsUserIdForLevel('global');
157 ▶   if (globalConfig === false) {
158 ▶     return undefined;
159 │   }
160 │ 
161 │   // Not disabled globally, check locally or not set globally and command is run outside of workspace example: `ng new`
162 ▶   if (workspace || globalConfig === undefined) {
163 ▶     const level = workspace ? 'local' : 'global';
164 ▶     let localOrGlobalConfig = await getAnalyticsUserIdForLevel(level);
165 ▶     if (localOrGlobalConfig === undefined) {
166 ▶       if (!skipPrompt) {
167 │         // config is unset, prompt user.
168 ▶         // TODO: This should honor the `no-interactive` option.
169 │         // It is currently not an `ng` option but rather only an option for specific commands.
170 │         // The concept of `ng`-wide options are needed to cleanly handle this.
171 ▶         await promptAnalytics(context, !workspace /** global */);
172 ▶         localOrGlobalConfig = await getAnalyticsUserIdForLevel(level);
173 │       }
174 │     }
175 │ 
176 ▶     if (localOrGlobalConfig === false) {
177 ▶       return undefined;
178 ▶     } else if (typeof localOrGlobalConfig === 'string') {
179 ▶       return localOrGlobalConfig;
180 │     }
181 │   }
182 │ 
183 ▶   return globalConfig;
184 │ }
```

送る相手の ID（ユーザー ID）が決まらなければ、何も送りません。決め方は次の順です。

1. **環境変数（122〜123 行目）**

   `analyticsDisabled` は `NG_CLI_ANALYTICS` が `0` か `false`（大文字小文字は問わない）のとき true です（environment-options.ts L46〜47）。`NG_CLI_ANALYTICS=ci` は無効にしませんでした（DEMO の 2 の表）。
2. **グローバルが false なら終わり（156〜158 行目）**

   150〜153 行目のコメントのとおり、グローバルが勝つのは「無効」のときだけです。
3. **ワークスペースがあればそこ、無ければグローバル（162〜164 行目）**

   ワークスペースの中では angular.json の `cli.analytics`、外（`ng new` など）ではグローバルの設定を見ます。グローバルに ID があっても、ワークスペースに値が無ければ 165 行目で「未設定」です。
4. **未設定なら聞く（166〜172 行目）**

   171 行目の 2 つ目の引数 `!workspace` で、ワークスペースの中で聞いた答えは**そのワークスペースに**、外で聞いた答えはグローバルに書きます。168 行目の TODO のとおり `--no-interactive` は見ません。
5. **値の形（130〜141 行目）**

   `false` は無効、文字列はそれが ID、`{uid: "…"}` の形も ID とみなします（137〜138 行目）。それ以外は未設定です。

呼ぶ側の `command-module.ts` では、L151 で `shouldReportAnalytics` が false のコマンド（`ng update`、[第 6 回](06-ngx-update.md)の 1 節）は聞きもせず、L155〜159 で `version`・`update`・`analytics` は `skipPrompt` にします。`ng update` が一時の CLI を起動し直すときは `NG_CLI_ANALYTICS: 'false'` を環境に入れます（cli-version.ts L157）。

📄 `angular-cli/packages/angular/cli/src/analytics/analytics.ts` L61–87 （▶ の行: 63, 66, 69, 71–72, 77–78, 85）

```ts
61 │ /**
62 │  * Prompt the user for usage gathering permission.
63 ▶  * @param force Whether to ask regardless of whether or not the user is using an interactive shell.
64 │  * @return Whether or not the user was shown a prompt.
65 │  */
66 ▶ export async function promptAnalytics(
67 │   context: CommandContext,
68 │   global: boolean,
69 ▶   force = false,
70 │ ): Promise<boolean> {
71 ▶   const level = global ? 'global' : 'local';
72 ▶   const workspace = await getWorkspace(level);
73 │   if (!workspace) {
74 │     throw new Error(`Could not find a ${level} workspace. Are you in a project?`);
75 │   }
76 │ 
77 ▶   if (force || isTTY()) {
78 ▶     const answer = await askConfirmation(
79 │       `
80 │ Would you like to share pseudonymous usage data about this project with the Angular Team
81 │ at Google under Google's Privacy Policy at https://policies.google.com/privacy. For more
82 │ details and how to change this setting, see https://angular.dev/cli/analytics.
83 │ 
84 │   `,
85 ▶       false,
86 │     );
87 │ 
```

📄 `angular-cli/packages/angular/cli/src/analytics/analytics.ts` L88–109 （▶ の行: 88, 90, 97, 103, 105, 108）

```ts
 88 ▶     await setAnalyticsConfig(global, answer);
 89 │ 
 90 ▶     if (answer) {
 91 │       console.log('');
 92 │       console.log(
 93 │         tags.stripIndent`
 94 │          Thank you for sharing pseudonymous usage data. Should you change your mind, the following
 95 │          command will disable this feature entirely:
 96 │ 
 97 ▶              ${colors.yellow(`ng analytics disable${global ? ' --global' : ''}`)}
 98 │        `,
 99 │       );
100 │       console.log('');
101 │     }
102 │ 
103 ▶     process.stderr.write(await getAnalyticsInfoString(context));
104 │ 
105 ▶     return true;
106 │   }
107 │ 
108 ▶   return false;
109 │ }
```

77 行目、聞くのは `force`（`ng analytics prompt`）か `isTTY()` のときだけです。`isTTY()` は「`NG_FORCE_TTY` があればその値、無ければ標準出力が端末で、かつ `CI` が `1`／`true` でない」です（utilities/tty.ts L19〜21）。DEMO の 2 の表は、この関数と環境変数の読み取りを 22.2.7 の dist から Node で呼んだ結果で、端末でも `CI=true` なら false、`CI=yes` なら true、パイプでも `NG_FORCE_TTY=true` なら true でした。85 行目の既定の答えは No です。88 行目で答えをそのまま 45 行目の `setAnalyticsConfig` に渡すので、No も `false` として書かれ、二度と聞かれません。

DEMO の 1 で、ワークスペースの中の `ng analytics prompt`（端末で `n`）は angular.json に `"analytics": false` を書きました。パイプで `echo y |` を渡すと、`force` なので 78 行目まで来ますが、`askConfirmation` は端末でないと聞かずに既定の No を返し（prompt.ts、[第 3 回](03-ngx-config.md)のファイルの並び）、`y` を読まずに `false` を書きました。long-description.md の L2「When installing the Angular CLI you are prompted to allow global collection」は、インストールのときの postinstall の質問を消した efc3c32257（2022-03-29、`fix(@angular/cli): remove analytics prompt postinstall script`）より後の 82cb04927f（2022-10-24）で書かれた文ですが、今の CLI は 166〜171 行目のとおり「最初にコマンドを打ったとき」に聞き、ワークスペースの中ならその angular.json に書きます。

## 2. 答えの置き場所と、info の表示

📄 `angular-cli/packages/angular/cli/src/analytics/analytics.ts` L40–59 （▶ の行: 41, 46–47, 52, 57–58）

```ts
40 │ /**
41 ▶  * Set analytics settings. This does not work if the user is not inside a project.
42 │  * @param global Which config to use. "global" for user-level, and "local" for project-level.
43 │  * @param value Either a user ID, true to generate a new User ID, or false to disable analytics.
44 │  */
45 │ export async function setAnalyticsConfig(global: boolean, value: string | boolean): Promise<void> {
46 ▶   const level = global ? 'global' : 'local';
47 ▶   const workspace = await getWorkspace(level);
48 │   if (!workspace) {
49 │     throw new Error(`Could not find ${level} workspace.`);
50 │   }
51 │ 
52 ▶   const cli = (workspace.extensions['cli'] ??= {});
53 │   if (!workspace || !json.isJsonObject(cli)) {
54 │     throw new Error(`Invalid config found at ${workspace.filePath}. CLI should be an object.`);
55 │   }
56 │ 
57 ▶   cli.analytics = value === true ? randomUUID() : value;
58 ▶   await workspace.save();
59 │ }
```

📄 `angular-cli/packages/angular/cli/src/commands/analytics/settings/cli.ts` L45–82 （▶ の行: 50, 54–55, 64, 67–68, 76, 80）

```ts
45 │ export class AnalyticsDisableModule
46 │   extends AnalyticsSettingModule
47 │   implements CommandModuleImplementation<AnalyticsCommandArgs>
48 │ {
49 │   command = 'disable';
50 ▶   aliases = 'off';
51 │   describe = 'Disables analytics gathering and reporting for the user.';
52 │ 
53 │   async run({ global }: Options<AnalyticsCommandArgs>): Promise<void> {
54 ▶     await setAnalyticsConfig(global, false);
55 ▶     process.stderr.write(await getAnalyticsInfoString(this.context));
56 │   }
57 │ }
58 │ 
59 │ export class AnalyticsEnableModule
60 │   extends AnalyticsSettingModule
61 │   implements CommandModuleImplementation<AnalyticsCommandArgs>
62 │ {
63 │   command = 'enable';
64 ▶   aliases = 'on';
65 │   describe = 'Enables analytics gathering and reporting for the user.';
66 │   async run({ global }: Options<AnalyticsCommandArgs>): Promise<void> {
67 ▶     await setAnalyticsConfig(global, true);
68 ▶     process.stderr.write(await getAnalyticsInfoString(this.context));
69 │   }
70 │ }
71 │ 
72 │ export class AnalyticsPromptModule
73 │   extends AnalyticsSettingModule
74 │   implements CommandModuleImplementation<AnalyticsCommandArgs>
75 │ {
76 ▶   command = 'prompt';
77 │   describe = 'Prompts the user to set the analytics gathering status interactively.';
78 │ 
79 │   async run({ global }: Options<AnalyticsCommandArgs>): Promise<void> {
80 ▶     await promptAnalytics(this.context, global, true);
81 │   }
82 │ }
```

1. **グローバル**

   作業用の HOME で `ng analytics enable --global` を打つと、`~/.angular-config.json` が新しく作られ、`cli.analytics` に 57 行目の `randomUUID()` が入りました（どの道を選ぶかは[第 3 回](03-ngx-config.md)）。
2. **ローカル**

   ワークスペースで `ng analytics disable` は angular.json に `"analytics": false`、`on`（64 行目の別名）は新しい UUID でした。41 行目の「プロジェクトの外では動かない」は local のときの話で、global は外でも動きました。
3. **どのコマンドも最後に info**

   55・68 行目で、書いたあと `getAnalyticsInfoString` を標準エラー出力に出します（info だけは標準出力）。

📄 `angular-cli/packages/angular/cli/src/analytics/analytics.ts` L186–214 （▶ の行: 186–194, 197, 200–201, 211）

```ts
186 ▶ function analyticsConfigValueToHumanFormat(value: unknown): 'enabled' | 'disabled' | 'not set' {
187 ▶   if (value === false) {
188 ▶     return 'disabled';
189 ▶   } else if (typeof value === 'string' || value === true) {
190 ▶     return 'enabled';
191 ▶   } else {
192 ▶     return 'not set';
193 ▶   }
194 ▶ }
195 │ 
196 │ export async function getAnalyticsInfoString(context: CommandContext): Promise<string> {
197 ▶   const analyticsInstance = await getAnalyticsUserId(context, true /** skipPrompt */);
198 │ 
199 │   const { globalConfiguration, workspace: localWorkspace } = context;
200 ▶   const globalSetting = globalConfiguration?.getCli()?.['analytics'];
201 ▶   const localSetting = localWorkspace?.getCli()?.['analytics'];
202 │ 
203 │   return (
204 │     tags.stripIndents`
205 │      Global setting: ${analyticsConfigValueToHumanFormat(globalSetting)}
206 │      Local setting: ${
207 │        localWorkspace
208 │          ? analyticsConfigValueToHumanFormat(localSetting)
209 │          : 'No local workspace configuration file.'
210 │      }
211 ▶      Effective status: ${analyticsInstance ? 'enabled' : 'disabled'}
212 │    ` + '\n'
213 │   );
214 │ }
```

186〜194 行目の表示は、文字列と `true` を enabled、`false` を disabled、それ以外を「not set」にします。1 節の 137〜138 行目が ID とみなす `{uid: "…"}` の形は「not set」と出ました（DEMO の 1 の最後）。`NG_CLI_ANALYTICS=false` の記録なので「Effective status」はいつも disabled です（197 行目 → 122 行目）。

📄 `angular-cli/packages/angular/cli/src/commands/analytics/cli.ts` L27–48 （▶ の行: 36–41）

```ts
27 │ export default class AnalyticsCommandModule
28 │   extends CommandModule
29 │   implements CommandModuleImplementation
30 │ {
31 │   command = 'analytics';
32 │   describe = 'Configures the gathering of Angular CLI usage metrics.';
33 │   longDescriptionPath = join(__dirname, 'long-description.md');
34 │ 
35 │   builder(localYargs: Argv): Argv {
36 ▶     const subcommands = [
37 ▶       AnalyticsInfoCommandModule,
38 ▶       AnalyticsDisableModule,
39 ▶       AnalyticsEnableModule,
40 ▶       AnalyticsPromptModule,
41 ▶     ].sort(); // sort by class name.
42 │ 
43 │     for (const module of subcommands) {
44 │       addCommandModuleToYargs(module, this.context);
45 │     }
46 │ 
47 │     return localYargs.demandCommand(1, demandCommandFailureMessage).strict();
48 │   }
```

41 行目の「sort by class name」は、比べ関数の無い `sort()` がクラスのソースの文字列を比べることに頼っています（`ng cache` の同じ形は[第 7 回](07-ngx-generate-run.md)の 5 節）。

## 3. 何を送るか：パラメータの一覧

📄 `angular-cli/packages/angular/cli/src/analytics/analytics-parameters.ts` L9–42 （▶ の行: 9, 19, 27, 32, 41）

```ts
 9 ▶ /** Any changes in this file needs to be done in the mts version. */
10 │ 
11 │ export type PrimitiveTypes = string | number | boolean;
12 │ 
13 │ /**
14 │  * GA built-in request parameters
15 │  * @see https://www.thyngster.com/ga4-measurement-protocol-cheatsheet
16 │  * @see http://go/depot/google3/analytics/container_tag/templates/common/gold/mpv2_schema.js
17 │  */
18 │ export enum RequestParameter {
19 ▶   ClientId = 'cid',
20 │   DebugView = '_dbg',
21 │   GtmVersion = 'gtm',
22 │   Language = 'ul',
23 │   NewToSite = '_nsi',
24 │   NonInteraction = 'ni',
25 │   PageLocation = 'dl',
26 │   PageTitle = 'dt',
27 ▶   ProtocolVersion = 'v',
28 │   SessionEngaged = 'seg',
29 │   SessionId = 'sid',
30 │   SessionNumber = 'sct',
31 │   SessionStart = '_ss',
32 ▶   TrackingId = 'tid',
33 │   TrafficType = 'tt',
34 │   UserAgentArchitecture = 'uaa',
35 │   UserAgentBitness = 'uab',
36 │   UserAgentFullVersionList = 'uafvl',
37 │   UserAgentMobile = 'uamb',
38 │   UserAgentModel = 'uam',
39 │   UserAgentPlatform = 'uap',
40 │   UserAgentPlatformVersion = 'uapv',
41 ▶   UserId = 'uid',
42 │ }
```

📄 `angular-cli/packages/angular/cli/src/analytics/analytics-parameters.ts` L44–62 （▶ の行: 48–49, 53–55, 57, 59–60）

```ts
44 │ /**
45 │  * User scoped custom dimensions.
46 │  * @remarks
47 │  * - User custom dimensions limit is 25.
48 ▶  * - `up.*` string type.
49 ▶  * - `upn.*` number type.
50 │  * @see https://support.google.com/analytics/answer/10075209?hl=en
51 │  */
52 │ export enum UserCustomDimension {
53 ▶   UserId = 'up.ng_user_id',
54 ▶   OsArchitecture = 'up.ng_os_architecture',
55 ▶   NodeVersion = 'up.ng_node_version',
56 │   NodeMajorVersion = 'upn.ng_node_major_version',
57 ▶   AngularCLIVersion = 'up.ng_cli_version',
58 │   AngularCLIMajorVersion = 'upn.ng_cli_major_version',
59 ▶   PackageManager = 'up.ng_package_manager',
60 ▶   PackageManagerVersion = 'up.ng_pkg_manager_version',
61 │   PackageManagerMajorVersion = 'upn.ng_pkg_manager_major_v',
62 │ }
```

📄 `angular-cli/packages/angular/cli/src/analytics/analytics-parameters.ts` L64–85 （▶ の行: 68–69, 73–76, 79, 82–84）

```ts
64 │ /**
65 │  * Event scoped custom dimensions.
66 │  * @remarks
67 │  * - Event custom dimensions limit is 50.
68 ▶  * - `ep.*` string type.
69 ▶  * - `epn.*` number type.
70 │  * @see https://support.google.com/analytics/answer/10075209?hl=en
71 │  */
72 │ export enum EventCustomDimension {
73 ▶   Command = 'ep.ng_command',
74 ▶   SchematicCollectionName = 'ep.ng_schematic_collection_name',
75 ▶   SchematicName = 'ep.ng_schematic_name',
76 ▶   Standalone = 'ep.ng_standalone',
77 │   SSR = 'ep.ng_ssr',
78 │   Style = 'ep.ng_style',
79 ▶   Routing = 'ep.ng_routing',
80 │   InlineTemplate = 'ep.ng_inline_template',
81 │   InlineStyle = 'ep.ng_inline_style',
82 ▶   BuilderTarget = 'ep.ng_builder_target',
83 ▶   Aot = 'ep.ng_aot',
84 ▶   Optimization = 'ep.ng_optimization',
85 │ }
```

📄 `angular-cli/packages/angular/cli/src/analytics/analytics-parameters.ts` L87–107 （▶ の行: 88, 90–92, 96, 100–101, 103–104, 106）

```ts
 87 │ /**
 88 ▶  * Event scoped custom mertics.
 89 │  * @remarks
 90 ▶  * - Event scoped custom mertics limit is 50.
 91 ▶  * - `ep.*` string type.
 92 ▶  * - `epn.*` number type.
 93 │  * @see https://support.google.com/analytics/answer/10075209?hl=en
 94 │  */
 95 │ export enum EventCustomMetric {
 96 ▶   AllChunksCount = 'epn.ng_all_chunks_count',
 97 │   LazyChunksCount = 'epn.ng_lazy_chunks_count',
 98 │   InitialChunksCount = 'epn.ng_initial_chunks_count',
 99 │   ChangedChunksCount = 'epn.ng_changed_chunks_count',
100 ▶   DurationInMs = 'epn.ng_duration_ms',
101 ▶   CssSizeInBytes = 'epn.ng_css_size_bytes',
102 │   JsSizeInBytes = 'epn.ng_js_size_bytes',
103 ▶   NgComponentCount = 'epn.ng_component_count',
104 ▶   AllProjectsCount = 'epn.all_projects_count',
105 │   LibraryProjectsCount = 'epn.libs_projects_count',
106 ▶   ApplicationProjectsCount = 'epn.apps_projects_count',
107 │ }
```

値の名前は GA4 の Measurement Protocol の形で、`up.*`／`upn.*` がユーザーごと、`ep.*`／`epn.*` がイベントごと（`n` が付くのは数）です。イベントの次元（73〜84 行目）のうち、オプションの値を送るのは、schema に `x-user-analytics` を書いたオプションだけです（`@schematics/angular` の component の `inlineStyle`・`inlineTemplate`・`standalone`・`style` や、application builder の `aot`・`optimization` など。読み取りは json-schema.ts L371〜372、[第 2 回](02-ngx-options.md)）。それを値に変える command-module.ts の `getAnalyticsParameters`（L213）の JSDoc（L207〜212）は、4 節の `periodFlush` の説明「Flush on an interval …」の写しのままです。

9 行目は「変更は mts 版にもする」ですが、その `analytics-parameters.mts` を読んでいた scripts/validate-user-analytics.mts は、85c6e39458（2025-12-10、ts-node をやめて Node の TypeScript 対応に移した）から `.ts` を直接 import しています。`.mts` の方の 9 行目「ts-node のために要る」も古く、`.mts` を import する所は repo の中にありません（`git grep`）。新しい本家でも 2 つのファイルが残っています。88・90 行目は「mertics」で、91 行目は数の値の一覧なのに `ep.*` を「string type」と書いています（96〜106 行目は全部 `epn.`）。

## 4. どう送るか：AnalyticsCollector

📄 `angular-cli/packages/angular/cli/src/analytics/analytics-collector.ts` L26–58 （▶ の行: 26–27, 40–46, 49–52, 56–57）

```ts
26 ▶ const TRACKING_ID_PROD = 'G-VETNJBW8L4';
27 ▶ const TRACKING_ID_STAGING = 'G-TBMPRL1BTM';
28 │ 
29 │ export class AnalyticsCollector {
30 │   private trackingEventsQueue: Record<string, PrimitiveTypes | undefined>[] | undefined;
31 │   private readonly requestParameterStringified: string;
32 │   private readonly userParameters: Record<UserCustomDimension, PrimitiveTypes | undefined>;
33 │ 
34 │   constructor(
35 │     private logger: logging.Logger,
36 │     userId: string,
37 │     packageManagerInfo: { name: string; version: string | undefined },
38 │   ) {
39 │     const requestParameters: Partial<Record<RequestParameter, PrimitiveTypes>> = {
40 ▶       [RequestParameter.ProtocolVersion]: 2,
41 ▶       [RequestParameter.ClientId]: userId,
42 ▶       [RequestParameter.UserId]: userId,
43 ▶       [RequestParameter.TrackingId]:
44 ▶         /^\d+\.\d+\.\d+$/.test(VERSION.full) && VERSION.full !== '0.0.0'
45 ▶           ? TRACKING_ID_PROD
46 ▶           : TRACKING_ID_STAGING,
47 │ 
48 │       // Built-in user properties
49 ▶       [RequestParameter.SessionId]: randomUUID(),
50 ▶       [RequestParameter.UserAgentArchitecture]: os.arch(),
51 ▶       [RequestParameter.UserAgentPlatform]: os.platform(),
52 ▶       [RequestParameter.UserAgentPlatformVersion]: os.release(),
53 │       [RequestParameter.UserAgentMobile]: 0,
54 │       [RequestParameter.SessionEngaged]: 1,
55 │       // The below is needed for tech details to be collected.
56 ▶       [RequestParameter.UserAgentFullVersionList]:
57 ▶         'Google%20Chrome;111.0.5563.64|Not(A%3ABrand;8.0.0.0|Chromium;111.0.5563.64',
58 │     };
```

📄 `angular-cli/packages/angular/cli/src/analytics/analytics-collector.ts` L60–87 （▶ の行: 60–61, 64, 72, 74–75, 79–80, 84）

```ts
60 ▶     if (ngDebug) {
61 ▶       requestParameters[RequestParameter.DebugView] = 1;
62 │     }
63 │ 
64 ▶     this.requestParameterStringified = querystring.stringify(requestParameters);
65 │ 
66 │     const parsedVersion = semver.parse(process.version);
67 │     const packageManagerVersion = packageManagerInfo.version;
68 │ 
69 │     this.userParameters = {
70 │       // While architecture is being collect by GA as UserAgentArchitecture.
71 │       // It doesn't look like there is a way to query this. Therefore we collect this as a custom user dimension too.
72 ▶       [UserCustomDimension.OsArchitecture]: os.arch(),
73 │       // While User ID is being collected by GA, this is not visible in reports/for filtering.
74 ▶       [UserCustomDimension.UserId]: userId,
75 ▶       [UserCustomDimension.NodeVersion]: parsedVersion
76 │         ? `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`
77 │         : 'other',
78 │       [UserCustomDimension.NodeMajorVersion]: parsedVersion?.major,
79 ▶       [UserCustomDimension.PackageManager]: packageManagerInfo.name,
80 ▶       [UserCustomDimension.PackageManagerVersion]: packageManagerVersion,
81 │       [UserCustomDimension.PackageManagerMajorVersion]: packageManagerVersion
82 │         ? +packageManagerVersion.split('.', 1)[0]
83 │         : undefined,
84 ▶       [UserCustomDimension.AngularCLIVersion]: VERSION.full,
85 │       [UserCustomDimension.AngularCLIMajorVersion]: VERSION.major,
86 │     };
87 │   }
```

📄 `angular-cli/packages/angular/cli/src/analytics/analytics-collector.ts` L111–130 （▶ の行: 111, 115, 119–120, 123–128）

```ts
111 ▶   reportArchitectRunEvent(parameters: Partial<Record<EventCustomDimension, PrimitiveTypes>>): void {
112 │     this.event('run_architect', parameters);
113 │   }
114 │ 
115 ▶   reportSchematicRunEvent(parameters: Partial<Record<EventCustomDimension, PrimitiveTypes>>): void {
116 │     this.event('run_schematic', parameters);
117 │   }
118 │ 
119 ▶   reportCommandRunEvent(command: string): void {
120 ▶     this.event('run_command', { [EventCustomDimension.Command]: command });
121 │   }
122 │ 
123 ▶   private event(eventName: string, parameters?: Record<string, PrimitiveTypes>): void {
124 ▶     this.trackingEventsQueue ??= [];
125 ▶     this.trackingEventsQueue.push({
126 ▶       ...this.userParameters,
127 ▶       ...parameters,
128 ▶       'en': eventName,
129 │     });
130 │   }
```

📄 `angular-cli/packages/angular/cli/src/analytics/analytics-collector.ts` L132–173 （▶ の行: 138, 140–142, 144, 150–151, 158, 164, 167–168, 171）

```ts
132 │   /**
133 │    * Flush on an interval (if the event loop is waiting).
134 │    *
135 │    * @returns a method that when called will terminate the periodic
136 │    * flush and call flush one last time.
137 │    */
138 ▶   periodFlush(): () => Promise<void> {
139 │     let analyticsFlushPromise = Promise.resolve();
140 ▶     const analyticsFlushInterval = setInterval(() => {
141 ▶       if (this.trackingEventsQueue?.length) {
142 ▶         analyticsFlushPromise = analyticsFlushPromise.then(() => this.flush());
143 │       }
144 ▶     }, 4000);
145 │ 
146 │     return () => {
147 │       clearInterval(analyticsFlushInterval);
148 │ 
149 │       // Flush one last time.
150 ▶       return analyticsFlushPromise.then(() => this.flush());
151 ▶     };
152 │   }
153 │ 
154 │   async flush(): Promise<void> {
155 │     const pendingTrackingEvents = this.trackingEventsQueue;
156 │     this.logger.debug(`Analytics flush size. ${pendingTrackingEvents?.length}.`);
157 │ 
158 ▶     if (!pendingTrackingEvents?.length) {
159 │       return;
160 │     }
161 │ 
162 │     // The below is needed so that if flush is called multiple times,
163 │     // we don't report the same event multiple times.
164 ▶     this.trackingEventsQueue = undefined;
165 │ 
166 │     try {
167 ▶       await this.send(pendingTrackingEvents);
168 ▶     } catch (error) {
169 │       // Failure to report analytics shouldn't crash the CLI.
170 │       assertIsError(error);
171 ▶       this.logger.debug(`Send analytics error. ${error.message}.`);
172 │     }
173 │   }
```

📄 `angular-cli/packages/angular/cli/src/analytics/analytics-collector.ts` L175–207 （▶ の行: 177, 179–181, 184–185, 192, 203–205）

```ts
175 │   private async send(data: Record<string, PrimitiveTypes | undefined>[]): Promise<void> {
176 │     return new Promise<void>((resolve, reject) => {
177 ▶       const request = https.request(
178 │         {
179 ▶           host: 'www.google-analytics.com',
180 ▶           method: 'POST',
181 ▶           path: '/g/collect?' + this.requestParameterStringified,
182 │           headers: {
183 │             // The below is needed for tech details to be collected even though we provide our own information from the OS Node.js module
184 ▶             'user-agent':
185 ▶               'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
186 │           },
187 │         },
188 │         (response) => {
189 │           // The below is needed as otherwise the response will never close which will cause the CLI not to terminate.
190 │           response.on('data', () => {});
191 │ 
192 ▶           if (response.statusCode !== 200 && response.statusCode !== 204) {
193 │             reject(
194 │               new Error(`Analytics reporting failed with status code: ${response.statusCode}.`),
195 │             );
196 │           } else {
197 │             resolve();
198 │           }
199 │         },
200 │       );
201 │ 
202 │       request.on('error', reject);
203 ▶       const queryParameters = data.map((p) => querystring.stringify(p)).join('\n');
204 ▶       request.write(queryParameters);
205 ▶       request.end();
206 │     });
207 │   }
```

1. **1 回の実行で 1 つの要求の形（40〜64 行目）**

   要求の URL の query は作るときに 1 回だけ組み立てます（64 行目）。`tid` は 44 行目で、版が `x.y.z` の正式版なら本番の `G-VETNJBW8L4`、プレリリースや `0.0.0` なら 27 行目の staging です。`sid` は 49 行目で毎回新しい UUID です。
2. **イベントに毎回付ける値（72〜84 行目）**

   ユーザー ID（74 行目）、Node とパッケージマネージャーと CLI の版、OS のアーキテクチャです。
3. **貯めて 4 秒ごとに送る（138〜151 行目）**

   コマンドの初め（command-module.ts L117）で `periodFlush` を始め、終わり（L141）で最後の `flush` を待ちます。164 行目で先に列を空にするので、2 回送ることはありません。失敗しても 171 行目の debug の記録だけで、CLI は止まりません。
4. **要求（177〜205 行目）**

   `POST https://www.google-analytics.com/g/collect?…` の本文に、イベントを 1 行 1 つの query の形で並べます（203 行目）。184〜185 行目で Chrome の user-agent を名乗ります。

DEMO の 3 は、command-module.ts などが `ng generate component foo` で渡す形（`run_command` の `generate_component`、プロジェクトの数の `workspace_info`、`run_schematic`、`run_architect`）を手で与えて `flush()` した、送る直前の要求です。56〜57 行目の `uafvl` は、もとの文字列が `%20`・`%3A` を含むのに 64 行目の `querystring.stringify` がもう一度符号にするので、要求の上では `Google%2520Chrome` と二重になっていました。fb19f5f3d3（2023-03-30、`fix(@angular/cli): collect tech information`）からこの形です。

ビルドの大きさや時間（`run_build`・`run_rebuild`、metrics の 96〜103 行目）は、architect-base-command-module.ts L76〜88 が builder の出力の `stats` から作ります。その `stats` を出すのは repo の中で `@angular-devkit/build-angular` の webpack の builder だけで（`ngComponentCount` を grep すると webpack の stats.ts と occurrences-plugin.ts だけ）、ws22 の `@angular/build:application` を Architect で直接走らせた出力の鍵は `info`・`success`・`target` の 3 つでした。既定の builder では、builder の名前（`run_architect`）までしか材料がありません。long-description.md は「ビルドのコマンドでは、builder の名前、バンドルの数と大きさ、ビルドと再ビルドの時間」と書いています。

## 5. 説明文との突き合わせ

| 説明 | 言っていること | 実際 |
| --- | --- | --- |
| commands/analytics/long-description.md L2 | CLI をインストールするときに、グローバルの収集を聞かれる | 最初にコマンドを打ったときに聞く。ワークスペースの中ならその angular.json に書く（1 節） |
| 同 L17 | ビルドのコマンドでは、バンドルの数と大きさ、時間なども | 既定の `@angular/build:application` は `stats` を出さないので、builder の名前だけ（4 節） |
| docs/design/analytics.md L99〜101 | `NG_CLI_ANALYTICS` は User ID を表す文字列で、`"false"` なら無効 | ID としては読まない。`0`／`false` で無効、それ以外は何もしない（1 節。2019 年の 2e9dc3d252 の文のまま） |
| analytics-parameters.ts L9 | 変更は mts 版にもする | mts 版を読む所はもう無い（3 節） |
| analytics.ts L150〜153 | グローバルが勝つのは無効のときだけ | そのとおり（ワークスペースに値が無ければ、グローバルに ID があっても聞く） |
| 同 L168 | TODO: `no-interactive` を守るべき | 守らない（TODO のとおり） |

> **🧪 DEMO — ng analytics の記録、isTTY の表、送る直前の要求**
>
> 1 は本物の `ng analytics`（`NG_CLI_ANALYTICS=false`、作業用の HOME）、2 は 22.2.7 の dist の関数を環境変数ごとに読み直した表、3 は偽の `https.request` に渡った要求です。どれも送っていません。
>
> **1. ng analytics**
>
> **2. isTTY() と isCI と analyticsDisabled**
>
> **3. 送る直前の要求**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-analytics)

## ここまでの呼び出し（ワークスペースの中で、未設定のまま ng generate）

- 👤 `ng generate component foo` — 端末、NG\_CLI\_ANALYTICS なし
  - `CommandModule.handler → getAnalytics()` — command-module.ts L116 / L150
    - `getAnalyticsUserId(context, false)` — analytics.ts L145
      - `getAnalyticsUserIdForLevel('global')` — L156 — *false なら終わり*
      - `getAnalyticsUserIdForLevel('local')` — L164 — *未設定*
      - `promptAnalytics(context, false)` — L171 → L66 — *isTTY() のときだけ（L77）*
        - `setAnalyticsConfig(false, answer)` — L88 → L45 — *angular.json の cli.analytics*
    - `new AnalyticsCollector(logger, userId, pm)` — command-module.ts L172 → collector L34
    - `reportCommandRunEvent・reportWorkspaceInfoEvent` — L119 / L89
    - `reportSchematicRunEvent` — schematics-command-module.ts L157 — *collection が safelist のときだけ（analytics.ts L23〜28）*
  - `stopPeriodicFlushes() → flush() → send()` — collector L146 / L154 / L175

📄 `angular-cli/packages/angular/cli/src/analytics/analytics.ts` L20–38 （▶ の行: 23–28, 30–31）

```ts
20 │ /**
21 │  * This is the ultimate safelist for checking if a package name is safe to report to analytics.
22 │  */
23 ▶ export const analyticsPackageSafelist = [
24 ▶   /^@angular\//,
25 ▶   /^@angular-devkit\//,
26 ▶   /^@nguniversal\//,
27 ▶   '@schematics/angular',
28 ▶ ];
29 │ 
30 ▶ export function isPackageNameSafeForAnalytics(name: string): boolean {
31 ▶   return analyticsPackageSafelist.some((pattern) => {
32 │     if (typeof pattern == 'string') {
33 │       return pattern === name;
34 │     } else {
35 │       return pattern.test(name);
36 │     }
37 │   });
38 │ }
```

23〜28 行目の safelist に入る collection と builder の名前だけを送ります。my-schematics のような自作の collection や、サードパーティの builder は、`run_command` のコマンド名だけで、collection の名前や builder の名前は送りません。

## テストと直し方

| ファイル | 中身（行） | 固めている約束 |
| --- | --- | --- |
| `tests/e2e/tests/commands/analytics/ask-analytics-command.ts` | （e2e、走らせていない）L9〜22 `NG_FORCE_TTY=1` で聞く・L25〜38 `NG_CLI_ANALYTICS=false` で聞かない・L41〜53 `ng update --help` で聞かない | 1 節。L41〜53 は `--help` なのでコマンドの handler まで来ず、command-module.ts L155〜159 の `skipPrompt` を通らない |
| `tests/e2e/tests/commands/analytics/analytics-info.ts` | L6〜22 未設定・UUID・false の 3 つの Effective status | 2 節。`{uid}` の形は無い |
| `tests/e2e/tests/commands/analytics/analytics-enable-disable.ts` | L6・L9 | 2 節の書き込み |
| （unit） | `src/analytics/` と `src/commands/analytics/` に `*_spec.ts` は無い | — |

📄 `走らせたコマンド（2026-11-24）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=analytics"
```

結果は手元の bazel で `//packages/angular/cli:test` が 257 specs・0 failures でした。この章の範囲の unit の spec は 0 本で、名前に analytics を含む it もありません。

直すとしたら、2 節の表示は analytics.ts の `analyticsConfigValueToHumanFormat`（186 行目）に `typeof value === 'object' && typeof value.uid === 'string'` の枝を足し、long-description.md の L2 と L17、docs/design/analytics.md の L99〜101、analytics-parameters.ts の 9 行目と 88〜92 行目の文を今の振る舞いに合わせます。`analytics-parameters.mts` は消せます。spec は、`getAnalyticsUserId` と `getAnalyticsInfoString` に偽の `getWorkspace` を渡す `analytics_spec.ts` を新しく作り、「`{uid}` の形は enabled と出る」「ワークスペースの中では local に書く」を確かめるのが一番小さい形です。

## 聞かれそうな質問

**Q. CI で analytics の質問が出て止まりませんか？**

出ません。77 行目の `isTTY()` が、`CI` が `1`／`true` なら false です。`CI=yes` のような値は CI とみなさないので、端末なら聞きます（DEMO の 2）。確実に止めるなら `NG_CLI_ANALYTICS=false` です（122 行目）。

**Q. グローバルで有効にしたのに、新しいワークスペースでまた聞かれました。**

162〜166 行目で、ワークスペースの中ではその angular.json の値を見るからです。グローバルの ID は、ワークスペースに値が無いときの代わりにはなりません（183 行目に来るのはワークスペースの外だけ）。グローバルで無効にすれば、156〜158 行目でどこでも聞かれません。

**Q. 何が送られますか？**

コマンドの名前（`generate_component` など）、プロジェクトの数、safelist の collection と schematic の名前、`x-user-analytics` の付いたオプションの値、builder の名前、OS・Node・パッケージマネージャー・CLI の版、ユーザー ID です（DEMO の 3）。プロジェクトの名前や道は、どの値にも入っていません。

**Q. `ng analytics info` の「not set」は本当に送っていませんか？**

186〜194 行目の表示は文字列と `true` と `false` しか見分けないので、`{uid: "…"}` の形は「not set」と出ますが、137〜138 行目では ID として使います。「Effective status」の行が実際の判定です（197・211 行目）。

## 読み終えて

- 送るかどうかは「環境変数 → グローバルの無効 → ワークスペース（外ならグローバル）の値」。未設定なら端末のときだけ聞く。
- ワークスペースの中で聞かれた答えは、その angular.json に書かれる。インストールのときには聞かない。
- 送る値は analytics-parameters.ts の名前の GA4 の形で、自作の collection や builder の名前は safelist で落とす。
- 既定の application builder は `stats` を出さず、ビルドの大きさや時間は送る材料が無い。
- 説明文の 4 か所（long-description の 2 か所、design の文書、mts のコメント）が今の振る舞いと合っていない。

---

← 前: [ng generate・new・run・version・cache](07-ngx-generate-run.md)  
次: [ng mcp：CLI の MCP サーバー](09-ngx-mcp.md) →
