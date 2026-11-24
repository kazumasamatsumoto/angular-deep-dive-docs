[目次](../README.md) › [ng コマンドの内側](README.md) › 第 3 回 / 全 10 回

# angular.json と設定：config・json-file・completion

> src/utilities/config.ts・json-file.ts・eol.ts・completion.ts・prettier.ts・commands/config・commands/completion：ワークスペースとグローバルの設定の探し方（XDG・古い場所・~/.angular-config.json）、ng config の値の道と値の読み替え、jsonc-parser の差分でコメントと字下げを保つ方法と保てない形、ng completion と補完の質問がホームに書くもの、生成したファイルの Prettier での整形。

angular/angular-cli · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-config)

---

この章で分かること：CLI がワークスペースの設定（`angular.json`）とグローバルの設定（`~/.angular-config.json` など）をどこから探し、どう読むか。`ng config` が値の道（`a[3].foo`）と値の文字列をどう読み替えて書くか、コメントと字下げと改行をどうやって保つか（保てない形も 1 つ）、`ng completion` と補完の質問がホームのどのファイルに何を書くか、生成したファイルを Prettier で整える仕組みです。

読む対象は `packages/angular/cli/src/` の `utilities/config.ts`・`json-file.ts`・`eol.ts`・`completion.ts`・`prettier.ts`・`commands/config/cli.ts`・`commands/completion/cli.ts` です（../angular-cli、44129f66a3）。`runCommand` が `getWorkspace('local')` と `getWorkspace('global')` を並べて呼ぶ所は[「ng serve」と打った直後に動くもの](../boot/01-boot-ng-command.md)の 5 節、`angular.json` の中身の形（`WorkspaceDefinition`）は[builder を探し出す章](../boot/02-boot-architect.md)です。

1. [1. ng と打ってから](01-ngx-entry.md)
2. [2. schema からオプション](02-ngx-options.md)
3. **3. angular.json と設定**（この章）
4. [4. パッケージマネージャー](04-ngx-package-managers.md)
5. [5. ng add](05-ngx-add.md)
6. [6. ng update](06-ngx-update.md)
7. [7. generate・new・run・version](07-ngx-generate-run.md)
8. [8. analytics](08-ngx-analytics.md)
9. [9. ng mcp](09-ngx-mcp.md)
10. [10. spec と issue](10-ngx-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> DEMO の記録は、手元の `ng`（22.2.7）で、`angular.json` の写しと、記録のたびに空にした「記録用の HOME」（`homes/*`）に対して取りました。本物のホームの設定とシェルの rc ファイルには触れていません。引用の 44129f66a3 と 22.2.7 は、この章の範囲では 3 か所が違います。`config/cli.ts` の 104 行目の綴り（`Confguration` → `Configuration`）、158 行目の正規表現（5 節）、`completion.ts` の 243 行目で書く行（7 節）です。schema の検査の文（「Unknown option … Valid options are …」）は 22.2.7 の @angular-devkit/core の形で、44129f66a3 では「must NOT have additional properties」でした（c0e6b3cf68）。

## 1. どのファイルを読むか

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L50–81 （▶ の行: 52–54, 58–59, 61, 68, 70, 77–79）

```ts
50 │ export const workspaceSchemaPath = path.join(__dirname, '../../lib/config/schema.json');
51 │ 
52 ▶ const configNames = ['angular.json', '.angular.json'];
53 ▶ const globalFileName = '.angular-config.json';
54 ▶ const defaultGlobalFilePath = path.join(os.homedir(), globalFileName);
55 │ 
56 │ function xdgConfigHome(home: string, configFile?: string): string {
57 │   // https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
58 ▶   const xdgConfigHome = process.env['XDG_CONFIG_HOME'] || path.join(home, '.config');
59 ▶   const xdgAngularHome = path.join(xdgConfigHome, 'angular');
60 │ 
61 ▶   return configFile ? path.join(xdgAngularHome, configFile) : xdgAngularHome;
62 │ }
63 │ 
64 │ function xdgConfigHomeOld(home: string): string {
65 │   // Check the configuration files in the old location that should be:
66 │   // - $XDG_CONFIG_HOME/.angular-config.json (if XDG_CONFIG_HOME is set)
67 │   // - $HOME/.config/angular/.angular-config.json (otherwise)
68 ▶   const p = process.env['XDG_CONFIG_HOME'] || path.join(home, '.config', 'angular');
69 │ 
70 ▶   return path.join(p, '.angular-config.json');
71 │ }
72 │ 
73 │ async function projectFilePath(projectPath?: string): Promise<string | null> {
74 │   // Find the configuration, either where specified, in the Angular CLI project
75 │   // (if it's in node_modules) or from the current process.
76 │   return (
77 ▶     (projectPath && (await findUp(configNames, projectPath))) ||
78 ▶     (await findUp(configNames, process.cwd())) ||
79 ▶     (await findUp(configNames, __dirname))
80 │   );
81 │ }
```

ワークスペースの設定の名前は 52 行目の `angular.json` と `.angular.json`、グローバルは 53 行目の `.angular-config.json` です。77〜79 行目、ワークスペースの設定は、渡された場所（`ng config` では渡さない）・今のディレクトリ・**このファイル自身の場所（`__dirname`）**の順に、上へたどって探します。79 行目があるので、ローカルの `node_modules` の CLI はワークスペースの外から呼ばれても、自分の上にある `angular.json` を見つけます。

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L83–115 （▶ の行: 93–94, 99–100, 102–104, 110–111, 114）

```ts
 83 │ function globalFilePath(): string | null {
 84 │   const home = os.homedir();
 85 │   if (!home) {
 86 │     return null;
 87 │   }
 88 │ 
 89 │   // follow XDG Base Directory spec
 90 │   // note that createGlobalSettings() will continue creating
 91 │   // global file in home directory, with this user will have
 92 │   // choice to move change its location to meet XDG convention
 93 ▶   const xdgConfig = xdgConfigHome(home, 'config.json');
 94 ▶   if (existsSync(xdgConfig)) {
 95 │     return xdgConfig;
 96 │   }
 97 │   // NOTE: This check is for the old configuration location, for more
 98 │   // information see https://github.com/angular/angular-cli/pull/20556
 99 ▶   const xdgConfigOld = xdgConfigHomeOld(home);
100 ▶   if (existsSync(xdgConfigOld)) {
101 │     /* eslint-disable no-console */
102 ▶     console.warn(
103 ▶       `Old configuration location detected: ${xdgConfigOld}\n` +
104 ▶         `Please move the file to the new location ~/.config/angular/config.json`,
105 │     );
106 │ 
107 │     return xdgConfigOld;
108 │   }
109 │ 
110 ▶   if (existsSync(defaultGlobalFilePath)) {
111 ▶     return defaultGlobalFilePath;
112 │   }
113 │ 
114 ▶   return null;
115 │ }
```

1. **93〜95 行目：`$XDG_CONFIG_HOME/angular/config.json`**

   XDG\_CONFIG\_HOME が空なら `~/.config/angular/config.json`（58〜59 行目）。記録では、これと `~/.angular-config.json` の両方があると、XDG の方（`pnpm`）が読まれました。
2. **99〜107 行目：古い場所**

   64〜71 行目の `$XDG_CONFIG_HOME/.angular-config.json`（または `~/.config/angular/.angular-config.json`）。警告を出して使います。記録では 102〜105 行目の警告が**2 回**出ました。`runCommand` の `getWorkspace('global')` と、`ng config` の `getWorkspaceRaw`（3 節）が、それぞれこの関数を呼ぶからです。104 行目の移し先は、XDG\_CONFIG\_HOME を設定していても `~/.config/angular/config.json` と書きます。
3. **110〜114 行目：`~/.angular-config.json`**

   どれも無ければ `null` です。90〜92 行目のコメントのとおり、新しく作るときは XDG ではなくこの場所に作ります（3 節）。

## 2. getWorkspace：ローカルは無いこともある、グローバルはいつもある

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L177–212 （▶ の行: 180, 184, 186, 189–191, 194, 199, 205, 210）

```ts
177 │ export async function getWorkspace(
178 │   level: 'local' | 'global',
179 │ ): Promise<AngularWorkspace | undefined> {
180 ▶   if (cachedWorkspaces.has(level)) {
181 │     return cachedWorkspaces.get(level);
182 │   }
183 │ 
184 ▶   const configPath = level === 'local' ? await projectFilePath() : globalFilePath();
185 │   if (!configPath) {
186 ▶     if (level === 'global') {
187 │       // Unlike a local config, a global config is not mandatory.
188 │       // So we create an empty one in memory and keep it as such until it has been modified and saved.
189 ▶       const globalWorkspace = new AngularWorkspace(
190 ▶         { extensions: {}, projects: new workspaces.ProjectDefinitionCollection() },
191 ▶         defaultGlobalFilePath,
192 │       );
193 │ 
194 ▶       cachedWorkspaces.set(level, globalWorkspace);
195 │ 
196 │       return globalWorkspace;
197 │     }
198 │ 
199 ▶     cachedWorkspaces.set(level, undefined);
200 │ 
201 │     return undefined;
202 │   }
203 │ 
204 │   try {
205 ▶     const workspace = await AngularWorkspace.load(configPath);
206 │     cachedWorkspaces.set(level, workspace);
207 │ 
208 │     return workspace;
209 │   } catch (error) {
210 ▶     throw new Error(`Workspace config file cannot be loaded: ${configPath}`, { cause: error });
211 │   }
212 │ }
```

180 行目で `level` ごとにプロセスの中で 1 回だけ読みます。グローバルのファイルが無いときは、186〜196 行目でメモリの上だけの空の `AngularWorkspace` を作り、置き場所は 191 行目の `~/.angular-config.json` にしておきます（第 1 回の `CommandContext` で `globalConfiguration` がいつもある理由）。ローカルが無ければ 199 行目で `undefined` です。205 行目の `load` は下の 158〜166 行目で、@angular-devkit/core の `readWorkspace` に任せます。第 1 回の記録のとおり、この読み方は途中で切れた JSON も受け入れました。

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L149–166 （▶ の行: 149–150, 154, 158–159, 162）

```ts
149 ▶   save(): Promise<void> {
150 ▶     return workspaces.writeWorkspace(
151 │       this.workspace,
152 │       createWorkspaceHost(),
153 │       this.filePath,
154 ▶       workspaces.WorkspaceFormat.JSON,
155 │     );
156 │   }
157 │ 
158 ▶   static async load(workspaceFilePath: string): Promise<AngularWorkspace> {
159 ▶     const result = await workspaces.readWorkspace(
160 │       workspaceFilePath,
161 │       createWorkspaceHost(),
162 ▶       workspaces.WorkspaceFormat.JSON,
163 │     );
164 │ 
165 │     return new AngularWorkspace(result.workspace, workspaceFilePath);
166 │   }
```

## 3. ng config の読み方：get がファイルを作る

📄 `angular-cli/packages/angular/cli/src/commands/config/cli.ts` L28–56 （▶ の行: 32, 34, 39, 42, 45, 49–51）

```ts
28 │ export default class ConfigCommandModule
29 │   extends CommandModule<ConfigCommandArgs>
30 │   implements CommandModuleImplementation<ConfigCommandArgs>
31 │ {
32 ▶   command = 'config [json-path] [value]';
33 │   describe =
34 ▶     'Retrieves or sets Angular configuration values in the angular.json file for the workspace.';
35 │   longDescriptionPath = join(__dirname, 'long-description.md');
36 │ 
37 │   builder(localYargs: Argv): Argv<ConfigCommandArgs> {
38 │     return localYargs
39 ▶       .positional('json-path', {
40 │         description:
41 │           `The configuration key to set or query, in JSON path format. ` +
42 ▶           `For example: "a[3].foo.bar[2]". If no new value is provided, returns the current value of this key.`,
43 │         type: 'string',
44 │       })
45 ▶       .positional('value', {
46 │         description: 'If provided, a new value for the given configuration key.',
47 │         type: 'string',
48 │       })
49 ▶       .option('global', {
50 ▶         description: `Access the global configuration in the caller's home directory.`,
51 ▶         alias: ['g'],
52 │         type: 'boolean',
53 │         default: false,
54 │       })
55 │       .strict();
56 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/config/cli.ts` L58–93 （▶ の行: 59–60, 62–64, 69, 71, 78–80, 83, 86–87, 89）

```ts
58 │   async run(options: Options<ConfigCommandArgs>): Promise<number | void> {
59 ▶     const level = options.global ? 'global' : 'local';
60 ▶     const [config] = await getWorkspaceRaw(level);
61 │ 
62 ▶     if (options.value == undefined) {
63 ▶       if (!config) {
64 ▶         this.context.logger.error('No config found.');
65 │ 
66 │         return 1;
67 │       }
68 │ 
69 ▶       return this.get(config, options);
70 │     } else {
71 ▶       return this.set(options);
72 │     }
73 │   }
74 │ 
75 │   private get(jsonFile: JSONFile, options: Options<ConfigCommandArgs>): number {
76 │     const { logger } = this.context;
77 │ 
78 ▶     const value = options.jsonPath
79 ▶       ? jsonFile.get(parseJsonPath(options.jsonPath))
80 ▶       : jsonFile.content;
81 │ 
82 │     if (value === undefined) {
83 ▶       logger.error('Value cannot be found.');
84 │ 
85 │       return 1;
86 ▶     } else if (typeof value === 'string') {
87 ▶       logger.info(value);
88 │     } else {
89 ▶       logger.info(JSON.stringify(value, null, 2));
90 │     }
91 │ 
92 │     return 0;
93 │   }
```

62 行目、`value` が無ければ get、あれば set です。get は 78〜80 行目で、道が無ければファイルの文字列を**そのまま**（コメントも）出し、あれば `JSONFile.get` で値を取ります。86〜89 行目、文字列ならそのまま、ほかは `JSON.stringify(value, null, 2)` です。記録の `ng config cli` は `{ "packageManager": "npm" }` の 3 行、無い値は 83 行目の「Value cannot be found.」で終了コード 1 でした。

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L214–238 （▶ の行: 223, 225–227, 230–231, 233, 237）

```ts
214 │ /**
215 │  * This method will load the workspace configuration in raw JSON format.
216 │  * When `level` is `global` and file doesn't exists, it will be created.
217 │  *
218 │  * NB: This method is intended to be used only for `ng config`.
219 │  */
220 │ export async function getWorkspaceRaw(
221 │   level: 'local' | 'global' = 'local',
222 │ ): Promise<[JSONFile | null, string | null]> {
223 ▶   let configPath = level === 'local' ? await projectFilePath() : globalFilePath();
224 │ 
225 ▶   if (!configPath) {
226 ▶     if (level === 'global') {
227 ▶       configPath = defaultGlobalFilePath;
228 │       // Config doesn't exist, force create it.
229 │ 
230 ▶       const globalWorkspace = await getWorkspace('global');
231 ▶       await globalWorkspace.save();
232 │     } else {
233 ▶       return [null, null];
234 │     }
235 │   }
236 │ 
237 ▶   return [new JSONFile(configPath), configPath];
238 │ }
```

60 行目の `getWorkspaceRaw` は、グローバルの設定が無いと、227〜231 行目で 2 節のメモリの上の空のワークスペースを `save()` し、ファイルを**作ります**。get と set を分ける前（60 行目）に呼ぶので、読むだけの `ng config -g cli.packageManager` でも作ります。記録では、空の HOME でこれを打つと「Value cannot be found.」（終了コード 1）のあと、HOME に `.angular-config.json` ができていました。中身は `"$schema": "./node_modules/@angular/cli/lib/config/schema.json"`・`"version": 1`・`"projects": {}` で、ホームから見た `./node_modules` の道は意味を持ちません（書いたのは @angular-devkit/core の `writeWorkspace`）。ワークスペースの外では 233 行目で `[null, null]` になり、get は 64 行目の「No config found.」、set は 104 行目の文で、どちらも終了コード 1 でした。

## 4. set：値の文字列を JSON に読み替え、schema で確かめてから書く

📄 `angular-cli/packages/angular/cli/src/commands/config/cli.ts` L95–127 （▶ の行: 96, 100, 104, 107, 109–111, 114, 116–117, 122, 124）

```ts
 95 │   private async set(options: Options<ConfigCommandArgs>): Promise<number | void> {
 96 ▶     if (!options.jsonPath?.trim()) {
 97 │       throw new CommandModuleError('Invalid Path.');
 98 │     }
 99 │ 
100 ▶     const [config, configPath] = await getWorkspaceRaw(options.global ? 'global' : 'local');
101 │     const { logger } = this.context;
102 │ 
103 │     if (!config || !configPath) {
104 ▶       throw new CommandModuleError('Confguration file cannot be found.');
105 │     }
106 │ 
107 ▶     const normalizeUUIDValue = (v: string | undefined) => (v === '' ? randomUUID() : `${v}`);
108 │ 
109 ▶     const value =
110 ▶       options.jsonPath === 'cli.analyticsSharing.uuid'
111 ▶         ? normalizeUUIDValue(options.value)
112 │         : options.value;
113 │ 
114 ▶     const modified = config.modify(parseJsonPath(options.jsonPath), normalizeValue(value));
115 │ 
116 ▶     if (!modified) {
117 ▶       logger.error('Value cannot be found.');
118 │ 
119 │       return 1;
120 │     }
121 │ 
122 ▶     await validateWorkspace(parseJson(config.content), options.global ?? false);
123 │ 
124 ▶     config.save();
125 │ 
126 │     return 0;
127 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/config/cli.ts` L166–192 （▶ の行: 167, 169, 173, 175–176, 179–180, 188, 190）

```ts
166 │ function normalizeValue(value: string | undefined | boolean | number): JsonValue | undefined {
167 ▶   const valueString = `${value}`.trim();
168 │   switch (valueString) {
169 ▶     case 'true':
170 │       return true;
171 │     case 'false':
172 │       return false;
173 ▶     case 'null':
174 │       return null;
175 ▶     case 'undefined':
176 ▶       return undefined;
177 │   }
178 │ 
179 ▶   if (isFinite(+valueString)) {
180 ▶     return +valueString;
181 │   }
182 │ 
183 │   try {
184 │     // We use `JSON.parse` instead of `parseJson` because the latter will parse UUIDs
185 │     // and convert them into a numberic entities.
186 │     // Example: 73b61974-182c-48e4-b4c6-30ddf08c5c98 -> 73.
187 │     // These values should never contain comments, therefore using `JSON.parse` is safe.
188 ▶     return JSON.parse(valueString) as JsonValue;
189 │   } catch {
190 ▶     return value;
191 │   }
192 │ }
```

1. **167〜177 行目：決まった語**

   前後の空白を除いて `true`・`false`・`null`・`undefined` を読み替えます。`undefined` は 114 行目の `modify(path, undefined)` で「消す」になります。記録では `cli.packageManager undefined` で行が消え、無い値を消そうとすると「Value cannot be found.」でした。
2. **179〜181 行目：数に見えるもの**

   `isFinite(+valueString)` なので、`1e3` は 1000、`0x10` は 16、`1.0` は 1、**空文字列は 0** です（`+''` が 0）。記録の `ng config cli.warnings.versionMismatch ""` は、0 になって schema の検査（122 行目）が「must be boolean」で止めました。
3. **183〜191 行目：JSON として読めるもの**

   `'["@schematics/angular"]'` は配列になります。184〜186 行目のコメントは、jsonc の読み方だと UUID の先頭の数字だけを読んでしまうので `JSON.parse` を使う、と書きます。読めなければ文字列のままです。
4. **107〜112 行目：`cli.analyticsSharing.uuid`**

   空なら新しい UUID を作る特別扱いです。ところが `analyticsSharing` は 639a3071c3（2022-10-05、analytics を GA4 に移したとき）で schema から消えていて、記録では 122 行目の検査が「Unknown option "analyticsSharing" at "/cli".」で止めました。この 6 行は通っても書けません。

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L240–261 （▶ の行: 241, 247–250, 252, 257, 259）

```ts
240 │ export async function validateWorkspace(data: json.JsonObject, isGlobal: boolean): Promise<void> {
241 ▶   const schema = readAndParseJson(workspaceSchemaPath);
242 │   if (!isJsonObject(schema)) {
243 │     throw new Error('Workspace schema is not a JSON object.');
244 │   }
245 │ 
246 │   // We should eventually have a dedicated global config schema and use that to validate.
247 ▶   const schemaToValidate: json.schema.JsonSchema = isGlobal
248 ▶     ? {
249 ▶         '$ref': '#/definitions/global',
250 ▶         definitions: schema['definitions'] as json.JsonObject,
251 │       }
252 ▶     : schema;
253 │ 
254 │   const { formats } = await import('@angular-devkit/schematics');
255 │   const registry = new json.schema.CoreSchemaRegistry(formats.standardFormats);
256 │   const validator = await registry.compile(schemaToValidate);
257 ▶   const { success, errors } = await validator(data);
258 │   if (!success) {
259 ▶     throw new json.schema.SchemaValidationException(errors);
260 │   }
261 │ }
```

122 行目の検査です。グローバルのときは 247〜251 行目で `#/definitions/global` だけを当てます。`global` の定義は `$schema`・`version`・`cli`・`schematics` を並べますが `additionalProperties: false` を持たないので、記録の `ng config -g projects.x.root src` は通ってグローバルの設定に `projects` が書かれました。`cli` の下は厳しく、`ng config -g cli.cache.enabled true` は「Unknown option "cache" at "/cli".」でした（キャッシュはワークスペースだけの設定）。

## 5. 値の道：parseJsonPath

📄 `angular-cli/packages/angular/cli/src/commands/config/cli.ts` L130–164 （▶ の行: 132–133, 139, 148, 153, 155–158, 163）

```ts
130 │ /**
131 │  * Splits a JSON path string into fragments. Fragments can be used to get the value referenced
132 ▶  * by the path. For example, a path of "a[3].foo.bar[2]" would give you a fragment array of
133 ▶  * ["a", 3, "foo", "bar", 2].
134 │  * @param path The JSON string to parse.
135 │  * @returns {(string|number)[]} The fragments for the string.
136 │  * @private
137 │  */
138 │ function parseJsonPath(path: string): (string | number)[] {
139 ▶   const fragments = (path || '').split(/\./g);
140 │   const result: (string | number)[] = [];
141 │ 
142 │   while (fragments.length > 0) {
143 │     const fragment = fragments.shift();
144 │     if (fragment == undefined) {
145 │       break;
146 │     }
147 │ 
148 ▶     const match = fragment.match(/([^[]+)((\[.*\])*)/);
149 │     if (!match) {
150 │       throw new CommandModuleError('Invalid JSON path.');
151 │     }
152 │ 
153 ▶     result.push(match[1]);
154 │     if (match[2]) {
155 ▶       const indices = match[2]
156 ▶         .slice(1, -1)
157 ▶         .split('][')
158 ▶         .map((x) => (/^\d$/.test(x) ? +x : x.replace(/"|'/g, '')));
159 │       result.push(...indices);
160 │     }
161 │   }
162 │ 
163 ▶   return result.filter((fragment) => fragment != null);
164 │ }
```

139 行目で `.` で割り、148 行目で各片を「名前」と「`[…]` の並び」に分けます。158 行目、括弧の中が `/^\d$/`（数字 1 文字）なら数、そうでなければ引用符を外した文字列です。**数字 1 文字**なので、`styles[10]` の `10` は文字列 `"10"` になり、配列の 11 番目ではなく `"10"` という名前のプロパティを探します。DEMO の「parseJsonPath」は、44129f66a3 と v22.2.7 の原文からこの関数を取り出して当てた記録で、44129f66a3 は `["projects", …, "styles", "10"]`、v22.2.7 は `…, "styles", 10]` でした。手元の 22.2.7 の `ng config "…styles[10]"` は `s10.css` を返しました。main の 5c656152ef（2026-10-12、`fix(@angular/cli): accept multi-digit array indices in ng config`）が `/^\d+$/` に直し、22.2.7 にも入っています。132〜133 行目の説明文の例 `a[3].foo.bar[2]` は 1 けたなので、どちらの版でも合っていました。`.` で先に割るので、名前に `.` を含むキーは道で指せません。

## 6. JSONFile：コメントと字下げと改行を保つ書き換え

📄 `angular-cli/packages/angular/cli/src/utilities/json-file.ts` L56–81 （▶ の行: 65, 68, 72, 76, 79–80）

```ts
56 │   /** The raw content of the JSON file. */
57 │   public get content(): string {
58 │     return this.#content;
59 │   }
60 │ 
61 │   /**
62 │    * Creates an instance of JSONFile.
63 │    * @param path The path to the JSON file.
64 │    */
65 ▶   constructor(path: string) {
66 │     this.#path = path;
67 │     try {
68 ▶       this.#content = readFileSync(this.#path, 'utf-8');
69 │     } catch (e) {
70 │       assertIsError(e);
71 │       // We don't have to worry about ENOENT, since we'll be creating the file.
72 ▶       if (e.code !== 'ENOENT') {
73 │         throw e;
74 │       }
75 │ 
76 ▶       this.#content = '';
77 │     }
78 │ 
79 ▶     this.#eol = getEOL(this.#content);
80 ▶     this.#detectIndentation();
81 │   }
```

📄 `angular-cli/packages/angular/cli/src/utilities/json-file.ts` L83–119 （▶ の行: 88, 93–95, 112–113, 116, 118）

```ts
 83 │   /**
 84 │    * Gets the parsed JSON abstract syntax tree.
 85 │    * The AST is lazily parsed and cached.
 86 │    */
 87 │   private get JsonAst(): Node | undefined {
 88 ▶     if (this.#jsonAst) {
 89 │       return this.#jsonAst;
 90 │     }
 91 │ 
 92 │     const errors: ParseError[] = [];
 93 ▶     this.#jsonAst = parseTree(this.#content, errors, { allowTrailingComma: true });
 94 ▶     if (errors.length) {
 95 ▶       formatError(this.#path, errors);
 96 │     }
 97 │ 
 98 │     return this.#jsonAst;
 99 │   }
100 │ 
101 │   /**
102 │    * Gets a value from the JSON file at a specific path.
103 │    * @param jsonPath The path to the value.
104 │    * @returns The value at the given path, or `undefined` if not found.
105 │    */
106 │   get(jsonPath: JSONPath): unknown {
107 │     const jsonAstNode = this.JsonAst;
108 │     if (!jsonAstNode) {
109 │       return undefined;
110 │     }
111 │ 
112 ▶     if (jsonPath.length === 0) {
113 ▶       return getNodeValue(jsonAstNode);
114 │     }
115 │ 
116 ▶     const node = findNodeAtLocation(jsonAstNode, jsonPath);
117 │ 
118 ▶     return node === undefined ? undefined : getNodeValue(node);
119 │   }
```

`jsonc-parser` はコメントと末尾のカンマを許す JSON の読み手で、93 行目の `parseTree` は位置つきの木を作ります。94〜95 行目、読めなければ例外（第 1 回の記録の「Failed to parse … as JSON AST Object.」はここ）です。116 行目で道の位置の木を探して値に戻します。

📄 `angular-cli/packages/angular/cli/src/utilities/json-file.ts` L128–164 （▶ の行: 133, 139–142, 147, 149–152, 160–161）

```ts
128 │   modify(
129 │     jsonPath: JSONPath,
130 │     value: JsonValue | undefined,
131 │     insertInOrder?: InsertionIndex | false,
132 │   ): boolean {
133 ▶     if (value === undefined && this.get(jsonPath) === undefined) {
134 │       // Cannot remove a value which doesn't exist.
135 │       return false;
136 │     }
137 │ 
138 │     let getInsertionIndex: InsertionIndex | undefined;
139 ▶     if (insertInOrder === undefined) {
140 ▶       const property = jsonPath.slice(-1)[0];
141 ▶       getInsertionIndex = (properties) =>
142 ▶         [...properties, property].sort().findIndex((p) => p === property);
143 │     } else if (insertInOrder !== false) {
144 │       getInsertionIndex = insertInOrder;
145 │     }
146 │ 
147 ▶     const edits = modify(this.#content, jsonPath, value, {
148 │       getInsertionIndex,
149 ▶       formattingOptions: {
150 ▶         insertSpaces: this.#insertSpaces,
151 ▶         tabSize: this.#tabSize,
152 ▶         eol: this.#eol,
153 │       },
154 │     });
155 │ 
156 │     if (edits.length === 0) {
157 │       return false;
158 │     }
159 │ 
160 ▶     this.#content = applyEdits(this.#content, edits);
161 ▶     this.#jsonAst = undefined;
162 │ 
163 │     return true;
164 │   }
```

147 行目の `modify`（jsonc-parser）は、ファイル全体を書き直すのではなく「この位置のこの文字をこう変える」という編集の一覧を返し、160 行目の `applyEdits` がその分だけ文字を差し替えます。だからほかの行のコメントは残ります。新しいキーを足す位置は 139〜142 行目で、今あるキーと並べて辞書順に入る位置です。記録の `cli` には `cache`・`packageManager`・`schematicCollections`・`warnings` の順に入り、`// CLI の設定` と `/* 行の後ろのコメント */` は残りました。149〜153 行目の字下げと改行は、ファイルから読んだ値です。

📄 `angular-cli/packages/angular/cli/src/utilities/json-file.ts` L166–189 （▶ の行: 176–177, 181, 183–186）

```ts
166 │   /**
167 │    * Deletes a value from the JSON file at a specific path.
168 │    * @param jsonPath The path to the value to delete.
169 │    * @returns `true` if the deletion was successful, `false` otherwise.
170 │    */
171 │   delete(jsonPath: JSONPath): boolean {
172 │     return this.modify(jsonPath, undefined);
173 │   }
174 │ 
175 │   /** Saves the modified content back to the file. */
176 ▶   save(): void {
177 ▶     writeFileSync(this.#path, this.#content);
178 │   }
179 │ 
180 │   /** Detects the indentation of the file. */
181 ▶   #detectIndentation(): void {
182 │     // Find the first line that has indentation.
183 ▶     const match = this.#content.match(/^(?:( )+|\t+)\S/m);
184 ▶     if (match) {
185 ▶       this.#insertSpaces = !!match[1];
186 ▶       this.#tabSize = match[0].length - 1;
187 │     }
188 │   }
189 │ }
```

📄 `angular-cli/packages/angular/cli/src/utilities/eol.ts` L14–37 （▶ の行: 26–27, 30, 33, 36）

```ts
14 │ /**
15 │  * Gets the end-of-line sequence from a string.
16 │  *
17 │  * This function analyzes the given string to determine the most frequent end-of-line (EOL)
18 │  * sequence. It counts the occurrences of carriage return line feed (`\r\n`) and
19 │  * line feed (`\n`).
20 │  *
21 │  * @param content The string to process.
22 │  * @returns The most frequent EOL sequence. If `\r\n` is more frequent, it returns `\r\n`.
23 │  * Otherwise (including ties), it returns `\n`. If no newlines are found, it falls back
24 │  * to the operating system's default EOL sequence.
25 │  */
26 ▶ export function getEOL(content: string): string {
27 ▶   const newlines = content.match(/(?:\r?\n)/g);
28 │ 
29 │   if (newlines?.length) {
30 ▶     const crlf = newlines.filter((l) => l === CRLF).length;
31 │     const lf = newlines.length - crlf;
32 │ 
33 ▶     return crlf > lf ? CRLF : LF;
34 │   }
35 │ 
36 ▶   return EOL;
37 │ }
```

改行は 27〜33 行目で `\r\n` と `\n` の多い方、無ければ OS の改行です。字下げは 183 行目の正規表現で**最初に字下げのある行**を探し、空白なら 186 行目で「その行の長さ − 1」を幅にします。記録では、タブと CRLF の `angular.json` に足した行はタブと CRLF でした。ところが、先頭に `/* … */` のブロックコメントを置いた `angular.json` では、最初に字下げのある行が ` * 先頭のブロックコメント`（空白 1 つ）なので幅が 1 になり、足した `"versionMismatch"` の行は空白 5 つ（親の 4 つ + 1）でした（DEMO の「先頭がブロックコメント」の diff）。ほかの行は 2 つずつなので、そこだけずれます。main も同じ行です。

## 7. 設定の値を読むほかの関数

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L264–303 （▶ の行: 264, 267–268, 275, 277, 281, 285, 296, 298, 302）

```ts
264 ▶   const isInside = (base: string, potential: string): boolean => {
265 │     const absoluteBase = path.resolve(workspace.basePath, base);
266 │     const absolutePotential = path.resolve(workspace.basePath, potential);
267 ▶     const relativePotential = path.relative(absoluteBase, absolutePotential);
268 ▶     if (!relativePotential.startsWith('..') && !path.isAbsolute(relativePotential)) {
269 │       return true;
270 │     }
271 │ 
272 │     return false;
273 │   };
274 │ 
275 ▶   const projects = Array.from(workspace.projects)
276 │     .map(([name, project]) => [project.root, name] as [string, string])
277 ▶     .filter((tuple) => isInside(tuple[0], location))
278 │     // Sort tuples by depth, with the deeper ones first. Since the first member is a path and
279 │     // we filtered all invalid paths, the longest will be the deepest (and in case of equality
280 │     // the sort is stable and the first declared project will win).
281 ▶     .sort((a, b) => b[0].length - a[0].length);
282 │ 
283 │   if (projects.length === 0) {
284 │     return null;
285 ▶   } else if (projects.length > 1) {
286 │     const found = new Set<string>();
287 │     const sameRoots = projects.filter((v) => {
288 │       if (!found.has(v[0])) {
289 │         found.add(v[0]);
290 │ 
291 │         return false;
292 │       }
293 │ 
294 │       return true;
295 │     });
296 ▶     if (sameRoots.length > 0) {
297 │       // Ambiguous location - cannot determine a project
298 ▶       return null;
299 │     }
300 │   }
301 │ 
302 ▶   return projects[0][1];
303 │ }
```

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L305–317 （▶ の行: 306, 308, 311）

```ts
305 │ export function getProjectByCwd(workspace: AngularWorkspace): string | null {
306 ▶   if (workspace.projects.size === 1) {
307 │     // If there is only one project, return that one.
308 ▶     return Array.from(workspace.projects.keys())[0];
309 │   }
310 │ 
311 ▶   const project = findProjectByPath(workspace, process.cwd());
312 │   if (project) {
313 │     return project;
314 │   }
315 │ 
316 │   return null;
317 │ }
```

「今のディレクトリのプロジェクト」は、プロジェクトが 1 つならそれ（306〜308 行目）、そうでなければ今のディレクトリを含む `root` のうち、いちばん深いもの（281 行目、道の文字の長さで比べる）です。同じ `root` が 2 つあれば 296〜298 行目で決めません。第 2 回の builder の project の決め方と、次の 2 つの関数がこれを使います。

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L350–386 （▶ の行: 359, 362, 364, 370–371, 376, 378, 381）

```ts
350 │ export async function getSchematicDefaults(
351 │   collection: string,
352 │   schematic: string,
353 │   project?: string | null,
354 │ ): Promise<{}> {
355 │   const result = {};
356 │   const mergeOptions = (source: json.JsonValue | undefined): void => {
357 │     if (isJsonObject(source)) {
358 │       // Merge options from the qualified name
359 ▶       Object.assign(result, source[`${collection}:${schematic}`]);
360 │ 
361 │       // Merge options from nested collection schematics
362 ▶       const collectionOptions = source[collection];
363 │       if (isJsonObject(collectionOptions)) {
364 ▶         Object.assign(result, collectionOptions[schematic]);
365 │       }
366 │     }
367 │   };
368 │ 
369 │   // Global level schematic options
370 ▶   const globalOptions = await getWorkspace('global');
371 ▶   mergeOptions(globalOptions?.extensions['schematics']);
372 │ 
373 │   const workspace = await getWorkspace('local');
374 │   if (workspace) {
375 │     // Workspace level schematic options
376 ▶     mergeOptions(workspace.extensions['schematics']);
377 │ 
378 ▶     project = project || getProjectByCwd(workspace);
379 │     if (project) {
380 │       // Project level schematic options
381 ▶       mergeOptions(workspace.projects.get(project)?.extensions['schematics']);
382 │     }
383 │   }
384 │ 
385 │   return result;
386 │ }
```

schematic の既定値は、グローバル（371 行目）→ ワークスペース（376 行目）→ プロジェクト（381 行目）の順に `Object.assign` で重ね、後ろが勝ちます。各段で `"@schematics/angular:component"` の形（359 行目）と `"@schematics/angular": { "component": … }` の入れ子の形（362〜364 行目）の両方を読みます。

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L388–420 （▶ の行: 391, 393–394, 407, 410, 415, 419）

```ts
388 │ export async function isWarningEnabled(warning: string): Promise<boolean> {
389 │   const getWarning = (source: json.JsonValue | undefined): boolean | undefined => {
390 │     if (isJsonObject(source)) {
391 ▶       const warnings = source['warnings'];
392 │       if (isJsonObject(warnings)) {
393 ▶         const value = warnings[warning];
394 ▶         if (typeof value == 'boolean') {
395 │           return value;
396 │         }
397 │       }
398 │     }
399 │   };
400 │ 
401 │   let result: boolean | undefined;
402 │ 
403 │   const workspace = await getWorkspace('local');
404 │   if (workspace) {
405 │     const project = getProjectByCwd(workspace);
406 │     if (project) {
407 ▶       result = getWarning(workspace.projects.get(project)?.extensions['cli']);
408 │     }
409 │ 
410 ▶     result = result ?? getWarning(workspace.extensions['cli']);
411 │   }
412 │ 
413 │   if (result === undefined) {
414 │     const globalOptions = await getWorkspace('global');
415 ▶     result = getWarning(globalOptions?.extensions['cli']);
416 │   }
417 │ 
418 │   // All warnings are enabled by default
419 ▶   return result ?? true;
420 │ }
```

第 1 回の `init.ts` の 129 行目が使う `cli.warnings.versionMismatch` の読み方です。プロジェクト → ワークスペース → グローバルの順に最初に boolean が見つかった値で、どこにも無ければ 419 行目で `true` です。ただし第 1 回のとおり、今はその前の 106 行目で道が閉じていて、この関数は呼ばれません。

## 8. ng completion と補完の質問：ホームの rc ファイルに書くもの

📄 `angular-cli/packages/angular/cli/src/commands/completion/cli.ts` L25–62 （▶ の行: 26, 31, 34, 37, 39, 44, 46, 50–51）

```ts
25 │   builder(localYargs: Argv): Argv {
26 ▶     addCommandModuleToYargs(CompletionScriptCommandModule, this.context);
27 │ 
28 │     return localYargs;
29 │   }
30 │ 
31 ▶   async run(): Promise<number> {
32 │     let rcFile: string;
33 │     try {
34 ▶       rcFile = await initializeAutocomplete();
35 │     } catch (err) {
36 │       assertIsError(err);
37 ▶       this.context.logger.error(err.message);
38 │ 
39 ▶       return 1;
40 │     }
41 │ 
42 │     this.context.logger.info(
43 │       `
44 ▶ Appended \`source <(ng completion script)\` to \`${rcFile}\`. Restart your terminal or run the following to autocomplete \`ng\` commands:
45 │ 
46 ▶     ${colors.yellow('source <(ng completion script)')}
47 │       `.trim(),
48 │     );
49 │ 
50 ▶     if ((await hasGlobalCliInstall()) === false) {
51 ▶       this.context.logger.warn(
52 │         'Setup completed successfully, but there does not seem to be a global install of the' +
53 │           ' Angular CLI. For autocompletion to work, the CLI will need to be on your `$PATH`, which' +
54 │           ' is typically done with the `-g` flag in `npm install -g @angular/cli`.' +
55 │           '\n\n' +
56 │           'For more information, see https://angular.dev/cli/completion#global-install',
57 │       );
58 │     }
59 │ 
60 │     return 0;
61 │   }
62 │ }
```

📄 `angular-cli/packages/angular/cli/src/utilities/completion.ts` L222–251 （▶ の行: 223–224, 231–232, 234–235, 237, 241, 243）

```ts
222 │   // Get all the files we can add `ng completion` to which apply to the user's `$SHELL`.
223 ▶   const runCommandCandidates = getShellRunCommandCandidates(shell, home);
224 ▶   if (!runCommandCandidates) {
225 │     throw new Error(
226 │       `Unknown \`$SHELL\` environment variable value (${shell}). Angular CLI autocompletion only supports Bash or Zsh.`,
227 │     );
228 │   }
229 │ 
230 │   // Get the first file that already exists or fallback to a new file of the first candidate.
231 ▶   const candidates = await Promise.allSettled(
232 ▶     runCommandCandidates.map((rcFile) => fs.access(rcFile).then(() => rcFile)),
233 │   );
234 ▶   const rcFile =
235 ▶     candidates.find(
236 │       (result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled',
237 ▶     )?.value ?? runCommandCandidates[0];
238 │ 
239 │   // Append Angular autocompletion setup to RC file.
240 │   try {
241 ▶     await fs.appendFile(
242 │       rcFile,
243 ▶       '\n\n# Load Angular CLI autocompletion.\nsource <(ng completion script)\n',
244 │     );
245 │   } catch (err) {
246 │     assertIsError(err);
247 │     throw new Error(`Failed to append autocompletion setup to \`${rcFile}\`.`, { cause: err });
248 │   }
249 │ 
250 │   return rcFile;
251 │ }
```

📄 `angular-cli/packages/angular/cli/src/utilities/completion.ts` L253–262 （▶ の行: 255–258）

```ts
253 │ /** Returns an ordered list of possible candidates of RC files used by the given shell. */
254 │ function getShellRunCommandCandidates(shell: string, home: string): string[] | undefined {
255 ▶   if (shell.toLowerCase().includes('bash')) {
256 ▶     return ['.bashrc', '.bash_profile', '.profile'].map((file) => path.join(home, file));
257 ▶   } else if (shell.toLowerCase().includes('zsh')) {
258 ▶     return ['.zshrc', '.zsh_profile', '.profile'].map((file) => path.join(home, file));
259 │   } else {
260 │     return undefined;
261 │   }
262 │ }
```

1. **231〜237 行目：どのファイルに書くか**

   256・258 行目の候補を順に見て、最初に**あるもの**、無ければ 1 つ目（`.bashrc` か `.zshrc`）です。記録では、空の HOME で SHELL が zsh なら `.zshrc` を作り、`.bash_profile` だけがある bash なら `.bash_profile` に足しました。
2. **258 行目：zsh の候補**

   `.zsh_profile` と `.profile` は、zsh が起動のときに読むファイルではありません（zsh の man の STARTUP/SHUTDOWN FILES が挙げるのは `.zshenv`・`.zprofile`・`.zshrc`・`.zlogin`）。記録では、`.profile` だけがある HOME で SHELL が zsh だと `.profile` に足し、「Appended … to \`…/.profile\`」と言って終了コード 0 でした。この HOME で zsh を開いても補完は読み込まれません。e2e の completion.ts（L207〜228）は `.zsh_profile` に足されることを確かめています。
3. **241〜244 行目：足す行**

   44129f66a3 は `source <(ng completion script)` の 1 行、22.2.7 は `if [[ $- == *i* ]]; then … fi` で囲んだ 4 行です（21846daf36、対話のシェルのときだけ読む）。記録は 22.2.7 の 4 行で、44 行目の知らせは今も「Appended \`source &lt;(ng completion script)\`」と言います。
4. **34 行目から：もう書いてあるか**

   `ng completion` は確かめずに足します。記録では 2 回続けて打つと `.zshrc` の「ng completion script」が 2 か所になりました。確かめるのは次の質問の道（172〜174 行目）だけです。

📄 `angular-cli/packages/angular/cli/src/utilities/completion.ts` L124–158 （▶ の行: 129–130, 134, 139, 144, 149, 155）

```ts
124 │ async function shouldPromptForAutocompletionSetup(
125 │   command: string,
126 │   config?: CompletionConfig,
127 │ ): Promise<boolean> {
128 │   // Force whether or not to prompt for autocomplete to give an easy path for e2e testing to skip.
129 ▶   if (forceAutocomplete !== undefined) {
130 ▶     return forceAutocomplete;
131 │   }
132 │ 
133 │   // Don't prompt on `ng update`, 'ng version' or `ng completion`.
134 ▶   if (['version', 'update', 'completion'].includes(command)) {
135 │     return false;
136 │   }
137 │ 
138 │   // Non-interactive and continuous integration systems don't care about autocompletion.
139 ▶   if (!isTTY()) {
140 │     return false;
141 │   }
142 │ 
143 │   // Skip prompt if the user has already been prompted.
144 ▶   if (config?.prompted) {
145 │     return false;
146 │   }
147 │ 
148 │   // `$HOME` variable is necessary to find RC files to modify.
149 ▶   const home = env['HOME'];
150 │   if (!home) {
151 │     return false;
152 │   }
153 │ 
154 │   // Get possible RC files for the current shell.
155 ▶   const shell = env['SHELL'];
156 │   if (!shell) {
157 │     return false;
158 │   }
```

📄 `angular-cli/packages/angular/cli/src/utilities/completion.ts` L159–179 （▶ の行: 166, 171–173）

```ts
159 │   const rcFiles = getShellRunCommandCandidates(shell, home);
160 │   if (!rcFiles) {
161 │     return false; // Unknown shell.
162 │   }
163 │ 
164 │   // Don't prompt if the user is missing a global CLI install. Autocompletion won't work after setup
165 │   // anyway and could be annoying for users running one-off commands via `npx` or using `npm start`.
166 ▶   if ((await hasGlobalCliInstall()) === false) {
167 │     return false;
168 │   }
169 │ 
170 │   // Check each RC file if they already use `ng completion script` in any capacity and don't prompt.
171 ▶   for (const rcFile of rcFiles) {
172 ▶     const contents = await fs.readFile(rcFile, 'utf-8').catch(() => undefined);
173 ▶     if (contents?.includes('ng completion script')) {
174 │       return false;
175 │     }
176 │   }
177 │ 
178 │   return true;
179 │ }
```

補完の質問は、`handler` の 108 行目（boot-ng-command の章）が全部のコマンドの前に呼ぶ `considerSettingUpAutocompletion` です。129 行目の `NG_FORCE_AUTOCOMPLETE`、134 行目の `version`・`update`・`completion`、139 行目の TTY でない（CI を含む）、144 行目の「もう聞いた」、HOME と SHELL、166 行目のグローバルの `ng` が無い、172〜174 行目の rc ファイルにもう書いてある、のどれかなら聞きません。第 2 回の記録で、疑似端末で `ng g` を打ったときに最初に出たのがこの質問でした（記録用の `ng` は `node_modules/.bin` の外にあるので、271〜306 行目がグローバルの `ng` とみなす）。

📄 `angular-cli/packages/angular/cli/src/utilities/completion.ts` L36–62 （▶ の行: 41–42, 47–48, 50, 59）

```ts
36 │ export async function considerSettingUpAutocompletion(
37 │   command: string,
38 │   logger: logging.Logger,
39 │ ): Promise<number | undefined> {
40 │   // Check if we should prompt the user to setup autocompletion.
41 ▶   const completionConfig = await getCompletionConfig();
42 ▶   if (!(await shouldPromptForAutocompletionSetup(command, completionConfig))) {
43 │     return undefined; // Already set up or prompted previously, nothing to do.
44 │   }
45 │ 
46 │   // Prompt the user and record their response.
47 ▶   const shouldSetupAutocompletion = await promptForAutocompletion();
48 ▶   if (!shouldSetupAutocompletion) {
49 │     // User rejected the prompt and doesn't want autocompletion.
50 ▶     logger.info(
51 │       `
52 │ Ok, you won't be prompted again. Should you change your mind, the following command will set up autocompletion for you:
53 │ 
54 │     ${colors.yellow(`ng completion`)}
55 │     `.trim(),
56 │     );
57 │ 
58 │     // Save configuration to remember that the user was prompted and avoid prompting again.
59 ▶     await setCompletionConfig({ ...completionConfig, prompted: true });
60 │ 
61 │     return undefined;
62 │   }
```

📄 `angular-cli/packages/angular/cli/src/utilities/completion.ts` L101–122 （▶ の行: 102, 104, 108, 113, 120–121）

```ts
101 │ async function getCompletionConfig(): Promise<CompletionConfig | undefined> {
102 ▶   const wksp = await getWorkspace('global');
103 │ 
104 ▶   return wksp?.getCli()?.['completion'];
105 │ }
106 │ 
107 │ async function setCompletionConfig(config: CompletionConfig): Promise<void> {
108 ▶   const wksp = await getWorkspace('global');
109 │   if (!wksp) {
110 │     throw new Error(`Could not find global workspace`);
111 │   }
112 │ 
113 ▶   wksp.extensions['cli'] ??= {};
114 │   const cli = wksp.extensions['cli'];
115 │   if (!json.isJsonObject(cli)) {
116 │     throw new Error(
117 │       `Invalid config found at ${wksp.filePath}. \`extensions.cli\` should be an object.`,
118 │     );
119 │   }
120 ▶   cli.completion = config as json.JsonObject;
121 ▶   await wksp.save();
122 │ }
```

答えが No なら 59 行目、Yes なら rc ファイルに足したあとに、113〜121 行目でグローバルの設定の `cli.completion.prompted` を `true` にして保存します。記録では、どちらの答えでも空の HOME に `.angular-config.json`（`"cli": { "completion": { "prompted": true } }`）ができ、Yes では `.zshrc` もできました。そのあとで本来のコマンド（`ng config cli`）の出力が続きました。

📄 `angular-cli/packages/angular/cli/src/utilities/completion.ts` L271–306 （▶ の行: 274, 284, 293, 296–298, 300）

```ts
271 │ export function hasGlobalCliInstall(): Promise<boolean> {
272 │   // List all binaries with the `ng` name on the user's `$PATH`.
273 │   return new Promise<boolean>((resolve) => {
274 ▶     execFile('which', ['-a', 'ng'], (error, stdout) => {
275 │       if (error) {
276 │         // No instances of `ng` on the user's `$PATH`
277 │ 
278 │         // `which` returns exit code 2 if an invalid option is specified and `-a` doesn't appear to be
279 │         // supported on all systems. Other exit codes mean unknown errors occurred. Can't tell whether
280 │         // CLI is globally installed, so treat this as inconclusive.
281 │ 
282 │         // `which` was killed by a signal and did not exit gracefully. Maybe it hung or something else
283 │         // went very wrong, so treat this as inconclusive.
284 ▶         resolve(false);
285 │ 
286 │         return;
287 │       }
288 │ 
289 │       // Successfully listed all `ng` binaries on the `$PATH`. Look for at least one line which is a
290 │       // global install. We can't easily identify global installs, but local installs are typically
291 │       // placed in `node_modules/.bin` by NPM / Yarn. `npx` also currently caches files at
292 │       // `~/.npm/_npx/*/node_modules/.bin/`, so the same logic applies.
293 ▶       const lines = stdout.split('\n').filter((line) => line !== '');
294 │       const hasGlobalInstall = lines.some((line) => {
295 │         // A binary is a local install if it is a direct child of a `node_modules/.bin/` directory.
296 ▶         const parent = path.parse(path.parse(line).dir);
297 ▶         const grandparent = path.parse(parent.dir);
298 ▶         const localInstall = grandparent.base === 'node_modules' && parent.base === '.bin';
299 │ 
300 ▶         return !localInstall;
301 │       });
302 │ 
303 │       return resolve(hasGlobalInstall);
304 │     });
305 │   });
306 │ }
```

## 9. 生成したファイルを Prettier で整える

📄 `angular-cli/packages/angular/cli/src/utilities/prettier.ts` L67–101 （▶ の行: 67, 72, 74, 78, 81, 85, 89, 91–93, 98）

```ts
 67 ▶ export async function formatFiles(cwd: string, files: Set<string>): Promise<void> {
 68 │   if (!files.size) {
 69 │     return;
 70 │   }
 71 │ 
 72 ▶   if (prettierCliPath === undefined) {
 73 │     try {
 74 ▶       const prettierPath = createRequire(cwd + '/').resolve('prettier/package.json');
 75 │       const prettierPackageJson = JSON.parse(await readFile(prettierPath, 'utf-8')) as {
 76 │         bin: string;
 77 │       };
 78 ▶       prettierCliPath = join(dirname(prettierPath), prettierPackageJson.bin);
 79 │     } catch {
 80 │       // Prettier is not installed.
 81 ▶       prettierCliPath = null;
 82 │     }
 83 │   }
 84 │ 
 85 ▶   if (!prettierCliPath) {
 86 │     return;
 87 │   }
 88 │ 
 89 ▶   const baseArgs = [
 90 │     prettierCliPath,
 91 ▶     '--write',
 92 ▶     '--no-error-on-unmatched-pattern',
 93 ▶     '--ignore-unknown',
 94 │   ];
 95 │   // `process.execPath` is spawned as the first argument and also counts toward the
 96 │   // command-line limit; it and `prettierCliPath` are absolute paths that may contain
 97 │   // spaces and therefore be quoted.
 98 ▶   const baseLength = [process.execPath, ...baseArgs].reduce(
 99 │     (total, arg) => total + arg.length + (arg.includes(' ') ? 3 : 1),
100 │     0,
101 │   );
```

📄 `angular-cli/packages/angular/cli/src/utilities/prettier.ts` L103–122 （▶ の行: 108, 110–112, 115, 119–120）

```ts
103 │   // Spawn Prettier once per batch so repositories with many changed files do not
104 │   // overflow the OS command-line length limit. A failure in one batch (e.g. a file
105 │   // Prettier cannot parse) must not stop the remaining batches, matching the previous
106 │   // single-invocation behavior, so errors are collected and reported together.
107 │   const errors: string[] = [];
108 ▶   for (const batch of batchFilesByArgumentLength(files, baseLength, MAX_COMMAND_LINE_LENGTH)) {
109 │     try {
110 ▶       await execFileAsync(process.execPath, [...baseArgs, ...batch], {
111 ▶         cwd,
112 ▶         shell: false,
113 │       });
114 │     } catch (error) {
115 ▶       errors.push(error instanceof Error ? error.message : String(error));
116 │     }
117 │   }
118 │ 
119 ▶   if (errors.length > 0) {
120 ▶     throw new Error(errors.join('\n'));
121 │   }
122 │ }
```

schematic が書いたファイルの一覧（`runSchematic`、[ng generate component の章](../cli/15-schematics-component.md)）を受け取り、74 行目で**ワークスペースから**`prettier/package.json` を探します。無ければ 81 行目で `null` にして何もしません。あれば 89〜94 行目の `--write --no-error-on-unmatched-pattern --ignore-unknown` で、Node から Prettier の CLI を、コマンドラインの長さが 32,000 文字を超えないように分けて（108 行目）走らせます。記録では、`.prettierrc` を `singleQuote: false` にした demo-ws（prettier が入っている）で `ng g c fmt-demo` を打つと、できたファイルの 1 行目は `import { Component } from "@angular/core";` と二重引用符になり、`node_modules` の無い写しでは schematic のままの一重引用符でした。Prettier の設定はワークスペースのものが効きます。

> **🧪 DEMO — ng config・ng completion・整形の記録**
>
> ボタンは、手元で本物の `ng` を動かした記録を再生します。`cfg` は `angular.json` の写し（コメントつき・タブと CRLF・先頭のブロックコメント・11 個の要素の配列の 4 種類を、記録のたびに置き直す）、`homes/*` は記録のたびに空にした HOME です。`diff -u` は書き換える前と後です。標準エラーは左に印を付けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-config)

## ここまでの呼び出し（ng config cli.warnings.versionMismatch false）

- 👤 `$ ng config cli.warnings.versionMismatch false` — commands/config/cli.ts
  - `run(options)` — L58 — *value があるので set（L62・L71）*
    - `getWorkspaceRaw('local')` — config.ts L220 — *projectFilePath → findUp（L77〜79）*
      - `new JSONFile(configPath)` — json-file.ts L65 — *改行（eol.ts L26）と字下げ（L181）を読む*
    - `parseJsonPath('cli.warnings.versionMismatch')` — config/cli.ts L138
    - `normalizeValue('false')` — L166 — *→ false*
    - `config.modify(path, false)` — json-file.ts L128 — *jsonc-parser の modify → applyEdits（L147・L160）*
    - `validateWorkspace(parseJson(config.content), false)` — config.ts L240 — *schema.json で確かめる*
    - `config.save()` — json-file.ts L176 — *writeFileSync*

## テストと直し方

| ファイル | 中身（行） | 固めている約束 |
| --- | --- | --- |
| `src/utilities/prettier_spec.ts` | `batchFilesByArgumentLength`（11）› 7 つの it（12〜53） | 9 節の分け方だけ。`formatFiles` を呼ぶ spec は無い |
| `tests/e2e/tests/commands/config/config-get.ts`・`config-set.ts`・`config-set-enum-check.ts`・`config-set-prefix.ts`・`config-set-serve-port.ts` | get と set の往復、enum の検査 | 3〜5 節。2 けたの添字、空の値、コメント・字下げの保ち方は無い |
| `tests/e2e/tests/commands/config/config-global.ts`・`config-global-validation.ts` | グローバルの get・set と、許されないキーの文（L11〜26） | 4 節の 247〜251 行目。get がファイルを作ること、`projects` が書けることは無い |
| `tests/e2e/tests/commands/completion/completion.ts`・`completion-prompt.ts`・`completion-script.ts` | `.bashrc`・`.zshrc`・`.bash_profile`・`.profile`・`.zsh_profile` に足すこと、質問の出る条件 | 8 節。`.zsh_profile` に足すことを正しい振る舞いとして固めている（L207〜228）。2 回打ったときは無い |
| `packages/angular/cli` の unit の spec | `config.ts`・`json-file.ts`・`eol.ts`・`completion.ts`・`config/cli.ts` の spec は 44129f66a3 には無い（22.2.7 は `config/cli_spec.ts` を足し `parseJsonPath` を export した） | — |

📄 `走らせたコマンド（2026-11-24）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=batchFilesByArgumentLength"
（結果は下の段落）
```

手元の bazel で、`batchFilesByArgumentLength` は 7 specs・0 failures でした（全体は 257 specs）。e2e は読んだだけです。

直すとしたら、`json-file.ts` の `#detectIndentation`（181〜188 行目）は、コメントの中の行を数えないように、`parseTree` の木の最初の子の位置からその行の字下げを読む形にします。spec は新しく `json-file_spec.ts` を作り「先頭がブロックコメントのファイルに足した行の字下げ」を確かめます。`config.ts` の `getWorkspaceRaw` は 225〜232 行目の作る処理を set のときだけにする引数を足し、`config/cli.ts` の 60 行目からはそれを使わないようにします（get でファイルを作らない）。107〜112 行目の `analyticsSharing` の 6 行は消せます。`completion.ts` の 258 行目は zsh の候補を `.zshrc`・`.zprofile` にし、e2e の completion.ts の `.zsh_profile` の 2 つのケースもあわせて直します。

## 聞かれそうな質問

**Q. `ng config` で set すると `angular.json` のコメントは消えますか？**

消えません。`JSONFile.modify` は jsonc-parser の `modify` が返す差分だけを `applyEdits` で当てるからです（json-file.ts L147・L160、記録の diff）。字下げと改行もファイルから読みますが、先頭がブロックコメントのファイルでは字下げの幅を 1 と読み違えます（L183〜186）。

**Q. グローバルの設定はどこにありますか？**

`$XDG_CONFIG_HOME/angular/config.json`（無ければ `~/.config/angular/config.json`）、古い場所、`~/.angular-config.json` の順に、最初にあるものです（config.ts L93〜114）。無いときに作るのは `~/.angular-config.json` で、`ng config -g` の get でも作ります（L223〜231、記録）。

**Q. `ng config a.b ""` で空文字列を書けますか？**

書けません。`normalizeValue` の 179 行目で `+''` が 0 なので数の 0 になります（記録では schema の検査で止まった）。`cli.analyticsSharing.uuid` だけは空を UUID に読み替える特別扱いがありますが、そのキー自体が schema にありません。

**Q. `styles[10]` のような道が効きません。**

44129f66a3 の `parseJsonPath` の 158 行目は 1 けたの数字しか数として読まないからです。22.2.7 と main（5c656152ef）では `/^\d+$/` で、記録の 22.2.7 は `s10.css` を返しました。

**Q. zsh を使っているのに、`ng completion` のあと補完が効きません。**

`.zshrc` が無く `.zsh_profile` か `.profile` があると、そちらに足すからです（completion.ts L231〜237・L258）。zsh はどちらも読みません。`.zshrc` に手で `source <(ng completion script)` を書きます。

## 読み終えて

- ワークスペースの設定は今のディレクトリと CLI 自身の場所から上へ探し、グローバルは XDG の config.json → 古い場所 → `~/.angular-config.json`。グローバルはいつもメモリにあり、`ng config -g` は get でもファイルを作る。
- `ng config` の値は `true`/`false`/`null`/`undefined` → 数 → JSON → 文字列の順に読み替え、空は 0。書く前に schema.json で確かめる（グローバルは `definitions/global`）。
- 書き換えは jsonc-parser の差分で、コメントは残る。字下げは最初に字下げのある行から読むので、先頭のブロックコメントで 1 と読み違える。
- `ng completion` は確かめずに rc ファイルに足し、zsh の候補に zsh が読まない `.zsh_profile`・`.profile` がある。質問の答えはグローバルの設定の `cli.completion.prompted`。
- 生成したファイルは、ワークスペースに Prettier があればその設定で整え、無ければ何もしない。

---

← 前: [schema からオプションを作る：command-builder/utilities](02-ngx-options.md)  
次: [npm・pnpm・yarn・bun を見分けて呼ぶ：package-managers](04-ngx-package-managers.md) →
