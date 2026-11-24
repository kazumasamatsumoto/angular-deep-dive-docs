[目次](../README.md) › [ng コマンドの内側](README.md) › 第 6 回 / 全 10 回

# ng update：版を決めて migrations を走らせる

> src/commands/update/\*：パッケージを書かないときの一覧の作り方、一時の CLI の版の決め方、版の範囲と peer の検査と --force、--migrate-only と from/to/name、git の確認。本物の ng update を 20・21 のワークスペースで動かした記録（migration の選び方は ng add と ng update の章）。

angular/angular-cli · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-update)

---

この章で分かること：`ng update` が、パッケージを書かないと一覧を出し、書くと「一時の CLI を入れ直すか」を決めてから版の範囲と peer を確かめ、`--migrate-only` では入れ直さずに migration だけを走らせる、その順と行。本物の `ng update` を 20 と 21 のワークスペースで動かすと、3 つの所で説明や意図と違う動きをしました。2 メジャー先の一覧が `21.2.9`（本当の最新は `21.2.26`）を出すこと、long-description の勧める `@^21` の書き方で一時の CLI が `latest`（22）になること、21 のワークスペースの `ng update @angular/cli --migrate-only --from=20` が migration を 1 つも走らせずに 0 で終わることです。

読む対象は `packages/angular/cli/src/commands/update/` の `cli.ts`・`update-resolver.ts`・`utilities/cli-version.ts`・`utilities/git.ts` の、まだどの章も引いていない行です（../angular-cli、44129f66a3）。packageGroup と peerDependencies で組を広げる手順、`applyUpdatePlan` とインストール、migration を `version` の範囲で選ぶ `executeMigrations` は[ng add と ng update の章](../cli/16-cli-add-update.md)の 5〜9 節が読んでいるので、ここでは繰り返さずに行だけ指します。

1. [1. ng と打ってから](01-ngx-entry.md)
2. [2. schema からオプション](02-ngx-options.md)
3. [3. angular.json と設定](03-ngx-config.md)
4. [4. パッケージマネージャー](04-ngx-package-managers.md)
5. [5. ng add](05-ngx-add.md)
6. **6. ng update**（この章）
7. [7. generate・new・run・version](07-ngx-generate-run.md)
8. [8. analytics](08-ngx-analytics.md)
9. [9. ng mcp](09-ngx-mcp.md)
10. [10. spec と issue](10-ngx-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> `ng update` はブラウザーでは動かないので、この章の DEMO は、手元の作業用の場所に作った 20 と 21 のワークスペースで本物の `ng update` を走らせた記録の再生です。手元の `ng` は 22.2.7 です。ワークスペースの中で `ng` と打つと、ふつうはワークスペースに入っている CLI（20.3.43 や 21.2.31）が動きます（[第 1 回](01-ngx-entry.md)）。22.2.7 のコードの動きを見たい記録は `NG_DISABLE_VERSION_CHECK=1` を付けて手元の 22.2.7 をそのまま動かしました。22.2.7 と 44129f66a3 の `commands/update/` の違いは、`cli.ts` L196 の誤字（`identifer`）が 22.2.7 で直っていることだけでした（`git diff 44129f66a3 v22.2.7`）。

## 1. コマンドの形：オプションと、その組み合わせの検査

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L59–66 （▶ の行: 60–62）

```ts
59 │ export default class UpdateCommandModule extends CommandModule<UpdateCommandArgs> {
60 ▶   override scope = CommandScope.In;
61 ▶   protected override shouldReportAnalytics = false;
62 ▶   private readonly resolvePaths = [__dirname, this.context.root];
63 │ 
64 │   command = 'update [packages..]';
65 │   describe = 'Updates your workspace and its dependencies. See https://update.angular.dev/.';
66 │   longDescriptionPath = path.join(__dirname, 'long-description.md');
```

60 行目の `CommandScope.In` で、ワークスペースの中でしか動きません。61 行目で `ng update` は analytics を送りません（[第 8 回](08-ngx-analytics.md)）。62 行目の `resolvePaths` は「動いている CLI の場所、ワークスペースの根」の順の配列で、6 節の不具合の元になります。

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L89–127 （▶ の行: 93, 100–101, 104–106, 108–109, 111, 122, 125）

```ts
 89 │       .option('name', {
 90 │         description:
 91 │           'The name of the migration to run. Only available when a single package is updated.',
 92 │         type: 'string',
 93 ▶         conflicts: ['to', 'from'],
 94 │       })
 95 │       .option('from', {
 96 │         description:
 97 │           'Version from which to migrate from. ' +
 98 │           `Only available when a single package is updated, and only with 'migrate-only'.`,
 99 │         type: 'string',
100 ▶         implies: ['migrate-only'],
101 ▶         conflicts: ['name'],
102 │       })
103 │       .option('to', {
104 ▶         describe:
105 ▶           'Version up to which to apply migrations. Only available when a single package is updated, ' +
106 ▶           `and only with 'migrate-only' option. Requires 'from' to be specified. Default to the installed version detected.`,
107 │         type: 'string',
108 ▶         implies: ['from', 'migrate-only'],
109 ▶         conflicts: ['name'],
110 │       })
111 ▶       .option('allow-dirty', {
112 │         describe:
113 │           'Whether to allow updating when the repository contains modified or untracked files.',
114 │         type: 'boolean',
115 │         default: false,
116 │       })
117 │       .option('verbose', {
118 │         describe: 'Display additional details about internal operations during execution.',
119 │         type: 'boolean',
120 │         default: false,
121 │       })
122 ▶       .option('create-commits', {
123 │         describe: 'Create source control commits for updates and migrations.',
124 │         type: 'boolean',
125 ▶         alias: ['C'],
126 │         default: false,
127 │       })
```

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L128–162 （▶ の行: 128–136, 139–140, 146–148, 152–157, 162）

```ts
128 ▶       .middleware((argv) => {
129 ▶         if (argv.name) {
130 ▶           argv['migrate-only'] = true;
131 ▶         }
132 ▶ 
133 ▶         // eslint-disable-next-line @typescript-eslint/no-explicit-any
134 ▶         return argv as any;
135 ▶       })
136 ▶       .check(({ packages, 'allow-dirty': allowDirty, 'migrate-only': migrateOnly }) => {
137 │         const { logger } = this.context;
138 │ 
139 ▶         // This allows the user to easily reset any changes from the update.
140 ▶         if (packages?.length && !checkCleanGit(this.context.root)) {
141 │           if (allowDirty) {
142 │             logger.warn(
143 │               'Repository is not clean. Update changes will be mixed with pre-existing changes.',
144 │             );
145 │           } else {
146 ▶             throw new CommandModuleError(
147 ▶               'Repository is not clean. Please commit or stash any changes before updating.',
148 ▶             );
149 │           }
150 │         }
151 │ 
152 ▶         if (migrateOnly) {
153 ▶           if (packages?.length !== 1) {
154 ▶             throw new CommandModuleError(
155 ▶               `A single package must be specified when using the 'migrate-only' option.`,
156 ▶             );
157 ▶           }
158 │         }
159 │ 
160 │         return true;
161 │       })
162 ▶       .strict();
```

オプションの組み合わせは、yargs の宣言（`implies`・`conflicts`）と、`.check` の 2 段で確かめます。記録で確かめたこと：

1. **--dry-run は無い**

   162 行目の `.strict()` で、宣言に無い `--dry-run` は「Unknown argument: dry-run」で終了コード 1 でした。`ng generate` と違い、`ng update` には変更を見るだけの道がありません。確かめたいときは、この章の記録と同じく git のある複製で走らせて差分を見ます。
2. **--to だけ**

   108 行目の `implies: ['from', 'migrate-only']` で「Missing dependent arguments: to -&gt; from」です。106 行目の説明「Requires 'from' to be specified」のとおりです。
3. **--name と --from**

   93 行目と 101 行目は互いに `conflicts` ですが、出た文は「Missing dependent arguments: from -&gt; migrate-only」でした。128〜135 行目の middleware は `--name` のときに `migrate-only` を立てますが、`implies` の検査はその前に走り、`conflicts` より先に報告されます。`--migrate-only` も付けると、はじめて conflicts の文になります。
4. **--migrate-only に 2 つ**

   152〜157 行目の「A single package must be specified …」です。
5. **git に変更がある**

   140 行目の `checkCleanGit` が false なら 146〜148 行目で止まります（7 節）。`--allow-dirty`（111 行目）で警告だけになります。パッケージを書かない一覧（2 節）は 140 行目の `packages?.length` で検査を飛ばします。

## 2. パッケージを書かないと一覧になる

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L246–276 （▶ の行: 246, 254, 261）

```ts
246 ▶     if (packages.length === 0) {
247 │       try {
248 │         const plan = await resolveUserUpdatePlan(
249 │           {
250 │             force: options.force,
251 │             next: options.next,
252 │             verbose: options.verbose,
253 │             packageManager: packageManager.name,
254 ▶             packages: [],
255 │             workspaceRoot: this.context.root,
256 │           },
257 │           packageManager,
258 │           logger,
259 │         );
260 │ 
261 ▶         await printUpdateUsageMessage(
262 │           plan.packageInfoMap,
263 │           plan.registryClient,
264 │           logger,
265 │           options.next,
266 │         );
267 │ 
268 │         return 0;
269 │       } catch (error) {
270 │         assertIsError(error);
271 │         logger.error(error.message);
272 │ 
273 │         return 1;
274 │       }
275 │     }
276 │ 
```

246 行目、パッケージが 0 個なら 254 行目の `packages: []` で計画を作り（registry から全部の依存の metadata を読む）、261 行目の `printUpdateUsageMessage` で表を出して 0 で終わります。何も書き換えません。

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L1065–1098 （▶ の行: 1069–1070, 1073–1077, 1084–1093）

```ts
1065 │   const packageGroups = new Map<string, string>();
1066 │   const mappedPackages = await Promise.all(
1067 │     Array.from(infoMap.entries(), async ([name, info]) => {
1068 │       const distTags = info.npmPackageJson['dist-tags'] ?? {};
1069 ▶       let tag = next ? (distTags['next'] ? 'next' : 'latest') : 'latest';
1070 ▶       let version = distTags[tag] ?? info.installed.version;
1071 │       const versions = info.npmPackageJson.versions ?? [];
1072 │ 
1073 ▶       const versionDiff = semver.diff(info.installed.version, version);
1074 ▶       if (
1075 ▶         versionDiff !== 'patch' &&
1076 ▶         versionDiff !== 'minor' &&
1077 ▶         /^@(?:angular|nguniversal)\//.test(name)
1078 │       ) {
1079 │         const installedMajorVersion = semver.parse(info.installed.version)?.major;
1080 │         const toInstallMajorVersion = semver.parse(version)?.major;
1081 │         if (
1082 │           installedMajorVersion !== undefined &&
1083 │           toInstallMajorVersion !== undefined &&
1084 ▶           installedMajorVersion < toInstallMajorVersion - 1
1085 ▶         ) {
1086 ▶           const nextMajorVersion = `${installedMajorVersion + 1}.`;
1087 ▶           const nextMajorVersions = versions
1088 ▶             .filter((v) => v.startsWith(nextMajorVersion))
1089 ▶             .sort((a, b) => (a > b ? -1 : 1));
1090 ▶ 
1091 ▶           if (nextMajorVersions.length) {
1092 ▶             version = nextMajorVersions[0];
1093 ▶             tag = '';
1094 │           }
1095 │         }
1096 │       }
1097 │ 
1098 │       const target = info.target?.packageJson || (await registryClient.getManifest(name, version));
```

1. **目標はタグの版（1069〜1070 行目）**

   `--next` なら `next` タグ、無ければ `latest` です。21 のワークスペースでは `21.2.31 -> 22.3.0`、`--next` では `22.3.0-rc.0` でした（2026-11-24 の registry）。
2. **2 メジャー以上先なら 1 つ先の最新（1084〜1093 行目）**

   `@angular/*` で、入っている版が目標より 2 メジャー以上古いと、1 つ先のメジャーの版から最新を選び、1093 行目でタグを消します（コマンドが `@21` の形になる）。
3. **選び方が文字列の比較（1089 行目）**

   `(a, b) => (a > b ? -1 : 1)` は semver ではなく文字列の大小です。`'21.2.9' > '21.2.26'`（`'9' > '2'`）なので、20 のワークスペースの一覧は `@angular/core 20.3.35 -> 21.2.9`・`@angular/cli 20.3.43 -> 21.2.9` でした。registry の 21 系の最新は core が `21.2.26`、cli が `21.2.31` です。1088 行目の `startsWith` はプレリリース（`21.0.0-next.1` など）も候補に入れ、同じ並びでは `21.2.0-rc.0` が `21.2.0` より前に来ます。ローカルの CLI 20.3.43 で出した一覧も同じ `21.2.9` でした。

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L1110–1148 （▶ の行: 1113, 1123–1129, 1132–1133, 1137, 1142–1143）

```ts
1110 │   const packagesToUpdate = mappedPackages
1111 │     .filter(
1112 │       ({ info, version, target }) =>
1113 ▶         target?.['ng-update'] && semver.compare(info.installed.version, version) < 0,
1114 │     )
1115 │     .map(({ name, info, version, tag, target }) => {
1116 │       // Look for packageGroup.
1117 │       const ngUpdate = target?.['ng-update'] as Record<string, unknown> | undefined;
1118 │       const packageGroup = ngUpdate?.['packageGroup'];
1119 │       if (packageGroup) {
1120 │         const packageGroupNames = Array.isArray(packageGroup)
1121 │           ? packageGroup
1122 │           : Object.keys(packageGroup);
1123 ▶         const packageGroupName =
1124 ▶           (ngUpdate?.['packageGroupName'] as string | undefined) ||
1125 ▶           packageGroupNames.find((n) => infoMap.has(n));
1126 ▶ 
1127 ▶         if (packageGroupName) {
1128 ▶           if (packageGroups.has(name)) {
1129 ▶             return null;
1130 │           }
1131 │ 
1132 ▶           for (const groupName of packageGroupNames) {
1133 ▶             packageGroups.set(groupName, packageGroupName);
1134 │           }
1135 │ 
1136 │           packageGroups.set(packageGroupName, packageGroupName);
1137 ▶           name = packageGroupName;
1138 │         }
1139 │       }
1140 │ 
1141 │       let command = `ng update ${name}`;
1142 ▶       if (!tag) {
1143 ▶         command += `@${semver.parse(version)?.major || version}`;
1144 │       } else if (tag == 'next') {
1145 │         command += ' --next';
1146 │       }
1147 │ 
1148 │       return [name, `${info.installed.version} -> ${version} `, command];
```

表に出るのは、1113 行目のとおり目標の版に `ng-update` があり、入っている版より新しいものだけです。1123〜1137 行目で packageGroup の仲間を 1 行にまとめるので、`@angular/router` などは出ず、`@angular/core` の 1 行になります。1142〜1143 行目のコマンドは版のメジャーだけを付けるので、表の版が `21.2.9` でもコマンドの `ng update @angular/core@21` は正しい範囲を指します。間違うのは表の「Version」の列です。この文字列の比較は 9b32066e88（2021-10-28、``fix(@angular/cli): update `ng update` output for Angular packages``）からで、新しい本家（origin/main、de5620f18d）でも同じ行です。

## 3. 一時の CLI を入れるかどうか

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L165–190 （▶ の行: 170–172, 178, 180–181, 184–188）

```ts
165 │   async run(options: Options<UpdateCommandArgs>): Promise<number | void> {
166 │     const { logger, packageManager } = this.context;
167 │ 
168 │     // Check if the current installed CLI version is older than the latest compatible version.
169 │     // Skip when running `ng update` without a package name as this will not trigger an actual update.
170 ▶     if (!disableVersionCheck && options.packages?.length) {
171 ▶       const cliVersionToInstall = await checkCLIVersion(
172 ▶         options.packages,
173 │         logger,
174 │         packageManager,
175 │         options.next,
176 │       );
177 │ 
178 ▶       if (cliVersionToInstall) {
179 │         logger.warn(
180 ▶           'The installed Angular CLI version is outdated.\n' +
181 ▶             `Installing a temporary Angular CLI versioned ${cliVersionToInstall} to perform the update.`,
182 │         );
183 │ 
184 ▶         return runTempBinary(
185 ▶           `@angular/cli@${cliVersionToInstall}`,
186 ▶           packageManager,
187 ▶           process.argv.slice(2),
188 ▶         );
189 │       }
190 │     }
```

📄 `angular-cli/packages/angular/cli/src/commands/update/utilities/cli-version.ts` L46–73 （▶ の行: 52, 56, 61–62, 70, 72）

```ts
46 │ 
47 │ /**
48 │  * Checks if the installed CLI version is compatible with the packages being updated.
49 │  * @param packagesToUpdate The list of packages being updated.
50 │  * @param logger The logger instance.
51 │  * @param packageManager The package manager instance.
52 ▶  * @param verbose Whether to log verbose output.
53 │  * @param next Whether to check for the next version.
54 │  * @returns The version of the CLI to install, or null if the current version is compatible.
55 │  */
56 ▶ export async function checkCLIVersion(
57 │   packagesToUpdate: string[],
58 │   logger: logging.LoggerApi,
59 │   packageManager: PackageManager,
60 │   next = false,
61 ▶ ): Promise<string | null> {
62 ▶   const runnerVersion = getCLIUpdateRunnerVersion(packagesToUpdate, next);
63 │   const manifest = await packageManager.getManifest(`@angular/cli@${runnerVersion}`);
64 │ 
65 │   if (!manifest) {
66 │     logger.warn(`Could not find @angular/cli version '${runnerVersion}'.`);
67 │ 
68 │     return null;
69 │   }
70 ▶ 
71 │   const version = manifest.version;
72 ▶ 
73 │   return VERSION.full === version ? null : String(runnerVersion);
```

📄 `angular-cli/packages/angular/cli/src/commands/update/utilities/cli-version.ts` L82–111 （▶ の行: 82, 86–87, 90, 92–94, 96–98, 100, 110）

```ts
 82 ▶ export function getCLIUpdateRunnerVersion(
 83 │   packagesToUpdate: string[] | undefined,
 84 │   next: boolean,
 85 │ ): string | number {
 86 ▶   if (next) {
 87 ▶     return 'next';
 88 │   }
 89 │ 
 90 ▶   const updatingAngularPackage = packagesToUpdate?.find((r) => ANGULAR_PACKAGES_REGEXP.test(r));
 91 │   if (updatingAngularPackage) {
 92 ▶     // If we are updating any Angular package we can update the CLI to the target version because
 93 ▶     // migrations for @angular/core@13 can be executed using Angular/cli@13.
 94 ▶     // This is same behaviour as `npx @angular/cli@13 update @angular/core@13`.
 95 │ 
 96 ▶     // `@angular/cli@13` -> ['', 'angular/cli', '13']
 97 ▶     // `@angular/cli` -> ['', 'angular/cli']
 98 ▶     const tempVersion = coerceVersionNumber(updatingAngularPackage.split('@')[2]);
 99 │ 
100 ▶     return semver.parse(tempVersion)?.major ?? 'latest';
101 │   }
102 │ 
103 │   // When not updating an Angular package we cannot determine which schematic runtime the migration should to be executed in.
104 │   // Typically, we can assume that the `@angular/cli` was updated previously.
105 │   // Example: Angular official packages are typically updated prior to NGRX etc...
106 │   // Therefore, we only update to the latest patch version of the installed major version of the Angular CLI.
107 │ 
108 │   // This is important because we might end up in a scenario where locally Angular v12 is installed, updating NGRX from 11 to 12.
109 │   // We end up using Angular ClI v13 to run the migrations if we run the migrations using the CLI installed major version + 1 logic.
110 ▶   return VERSION.major;
111 │ }
```

1. **パッケージを書いたときだけ（170 行目）**

   `NG_DISABLE_VERSION_CHECK` が無く、パッケージがあるとき、`checkCLIVersion` が「どの版の CLI で更新を走らせるか」を決めます。
2. **版を決める（82〜111 行目）**

   `--next` なら `next`（86〜87 行目）。`@angular/` のパッケージがあれば、その指定の `@` の後ろを 98 行目で `coerceVersionNumber` にかけ、メジャーを使います。取れなければ 100 行目で `latest`。Angular のパッケージが無ければ、動いている CLI のメジャー（110 行目）です。
3. **同じなら入れない（61〜72 行目）**

   その版の `@angular/cli` の manifest を registry から読み、72 行目で動いている CLI と同じ版なら `null`、違えば 184〜188 行目で一時の場所に入れて、同じ引数（`process.argv.slice(2)`）で起動し直します。

📄 `angular-cli/packages/angular/cli/src/commands/update/utilities/cli-version.ts` L148–168 （▶ の行: 152, 156–157, 165, 167）

```ts
148 │     if (!binPath) {
149 │       throw new Error(`Cannot locate bin for temporary package: ${packageNameNoVersion}.`);
150 │     }
151 │ 
152 ▶     const { status, error } = spawnSync(process.execPath, [binPath, ...args], {
153 │       stdio: 'inherit',
154 │       env: {
155 │         ...process.env,
156 ▶         NG_DISABLE_VERSION_CHECK: 'true',
157 ▶         NG_CLI_ANALYTICS: 'false',
158 │       },
159 │     });
160 │ 
161 │     if (status === null && error) {
162 │       throw error;
163 │     }
164 │ 
165 ▶     return status ?? 0;
166 │   } finally {
167 ▶     await cleanup();
168 │   }
```

一時の CLI は 156 行目で自分の版の検査を止め、157 行目で analytics も止めて起動されます。終わると 167 行目で一時の場所を消します。

`coerceVersionNumber`（[ng add と ng update の章](../cli/16-cli-add-update.md)の 8 節）は、数字で始まらない文字列を `undefined` にします。手元の 22.2.7 の `getCLIUpdateRunnerVersion` を直接呼ぶと、次の表になりました。

| ng update に書いたもの | 98 行目の coerce の結果 | 一時の CLI の版 |
| --- | --- | --- |
| `@angular/core` | `undefined` | `latest` |
| `@angular/core@21` | `21.0.0` | `21` |
| `@angular/core@21.2` | `21.2.0` | `21` |
| `@angular/core@^21` | `undefined` | `latest` |
| `@angular/core@~21.2.0` | `undefined` | `latest` |
| `@angular/core@21.x` | `undefined` | `latest` |
| `@angular/cli@^21 @angular/core@^21` | `undefined` | `latest` |
| `@angular/core@next（--next なし）` | `undefined` | `latest` |
| `@angular/core@21 --next` | `—` | `next` |
| `@ngrx/store@21` | `—` | `22（VERSION.major）` |

印の行が、意図（92〜94 行目「Angular のパッケージを更新するなら、目標の版の CLI で migration を走らせる」）と違う行です。long-description.md は 2 メジャーをまたぐときの書き方として `ng update @angular/cli@^<major_version> @angular/core@^<major_version>` を勧めますが、この `^` の形は 98 行目で版が取れず `latest` になります。DEMO の「3. 一時の CLI」で、20 のワークスペース（ローカルの CLI 20.3.43）から `ng update @angular/cli@21 @angular/core@21` は「Installing a temporary Angular CLI versioned 21.2.31」、`@^21` の形は「versioned 22.3.0」でした。どちらも 21 系に上がりましたが、`^21` では 22.3.0 の CLI が 21 の migration を走らせ、出力の形も migration の順（`@angular/core` が先）も違いました。`split('@')[2]` の取り出しは 1e9e890bb0（2021-11-22）からで、そのコミットの説明は「`ng update @angular/core@12` なら 12 の最新の CLI で走らせる」です。新しい本家でも同じ行です。

52 行目の JSDoc は `@param verbose` を挙げますが、56 行目からの引数に `verbose` はありません。ローカルの 21.2.31 は 72 行目と同じく `String(runnerVersion)` を返すので、「versioned latest」と出ます（6 節の記録）。20.3.43 は「versioned 22.3.0」と具体的な版を出しました（古い版の実装の違い）。

## 4. 指定した版をどう解くか

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L604–628 （▶ の行: 611–612, 614–615, 618, 622, 625）

```ts
604 │ async function resolvePackageVersion(
605 │   registryClient: RegistryClient,
606 │   metadata: PackageMetadata,
607 │   range: string,
608 │   next = false,
609 │ ): Promise<string | null> {
610 │   const distTags = metadata['dist-tags'] ?? {};
611 ▶   let resolvedVersion: string | undefined =
612 ▶     distTags[range] ?? (range === 'next' ? distTags['latest'] : undefined);
613 │ 
614 ▶   if (resolvedVersion && !isReleaseAgeSatisfied(registryClient, metadata, resolvedVersion)) {
615 ▶     resolvedVersion = undefined;
616 │   }
617 │ 
618 ▶   if (resolvedVersion) {
619 │     return resolvedVersion;
620 │   }
621 │ 
622 ▶   return getSatisfyingVersion(
623 │     registryClient,
624 │     metadata,
625 ▶     distTags[range] || range === 'next' ? '*' : range,
626 │     next,
627 │   );
628 │ }
```

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L94–125 （▶ の行: 100–101, 103–105, 107, 109–113, 116–122）

```ts
 94 │ export async function getSatisfyingVersion(
 95 │   registryClient: RegistryClient,
 96 │   metadata: PackageMetadata,
 97 │   range: string,
 98 │   next?: boolean,
 99 │ ): Promise<string | null> {
100 ▶   const options = { includePrerelease: next || undefined };
101 ▶   let candidates = metadata.versions.filter((v) => semver.satisfies(v, range, options));
102 │ 
103 ▶   candidates = candidates.filter((version) =>
104 ▶     isReleaseAgeSatisfied(registryClient, metadata, version),
105 ▶   );
106 │ 
107 ▶   const sorted = semver.rsort(candidates);
108 │ 
109 ▶   for (const version of sorted) {
110 ▶     const manifest = await registryClient.getManifest(metadata.name, version);
111 ▶     if (manifest && !manifest.deprecated) {
112 ▶       return version;
113 ▶     }
114 │   }
115 │ 
116 ▶   // Fallback to deprecated versions if no non-deprecated version satisfies
117 ▶   for (const version of sorted) {
118 ▶     const manifest = await registryClient.getManifest(metadata.name, version);
119 ▶     if (manifest) {
120 ▶       return version;
121 ▶     }
122 ▶   }
123 │ 
124 │   return null;
125 │ }
```

1. **タグならその版（611〜612 行目）**

   `latest` や `next` は dist-tags の版です。`next` タグが無いパッケージでは `latest` に読み替えます。
2. **新しすぎる版は外す（614〜615 行目・103〜105 行目）**

   パッケージマネージャーの「公開から何日たった版だけ入れる」設定（`getMinimumReleaseAge`、[第 4 回](04-ngx-package-managers.md)）を満たさない版は、タグの版でも捨てて範囲の検索に回ります。
3. **範囲なら新しい順に（101・107 行目）**

   範囲を満たす版を semver で新しい順に並べ、109〜113 行目で非推奨（`deprecated`）でない最初の版を選びます。全部が非推奨なら 116〜122 行目で非推奨でも選びます。ここは 2 節と違って `semver.rsort` です。

DEMO の「2. オプションの検査」で、入っている版と同じ `@angular/core@21.2.26` は「Package '@angular/core' is already at '21.2.26'.」で 0、依存に無い `lodash` は「Package 'lodash' is not a dependency.」で 1 でした（どちらも cli.ts の `updatePackagesAndMigrate`、L440・L447）。registry でない `github:angular/angular` は「… is not a registry package identifier.」で、22.2.7 では誤字が直っています。

## 5. peer の検査と --force

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L253–287 （▶ の行: 264, 273–281）

```ts
253 │ function _validateReversePeerDependencies(
254 │   name: string,
255 │   version: string,
256 │   infoMap: Map<string, PackageInfo>,
257 │   logger: logging.LoggerApi,
258 │   next: boolean,
259 │ ): boolean {
260 │   let error = false;
261 │   for (const [installed, installedInfo] of infoMap.entries()) {
262 │     const installedLogger = logger.createChild(installed);
263 │     installedLogger.debug(`${installed}...`);
264 ▶     const peers = (installedInfo.target || installedInfo.installed).packageJson.peerDependencies;
265 │     const peersMeta = (installedInfo.target || installedInfo.installed).packageJson
266 │       .peerDependenciesMeta;
267 │ 
268 │     for (const [peer, range] of Object.entries(peers || {})) {
269 │       if (peer !== name) {
270 │         continue;
271 │       }
272 │ 
273 ▶       const isOptional = !!peersMeta?.[peer]?.optional;
274 ▶       const resolvedRange = _updatePeerVersion(infoMap, name, range);
275 ▶       if (!semver.satisfies(version, resolvedRange, { includePrerelease: next || undefined })) {
276 ▶         logger.error(
277 ▶           `Package ${JSON.stringify(installed)} has an incompatible peer dependency to ` +
278 ▶             `${JSON.stringify(name)} (requires ${JSON.stringify(range)}, ` +
279 ▶             `would install ${JSON.stringify(version)}).`,
280 ▶         );
281 ▶         error = error || !isOptional;
282 │       }
283 │     }
284 │   }
285 │ 
286 │   return error;
287 │ }
```

上げるパッケージの新しい版が、ほかのパッケージの peerDependencies を満たすかの検査です（逆向きと前向きの 2 つを呼ぶ所は[ng add と ng update の章](../cli/16-cli-add-update.md)の 6 節）。264 行目で「上げたあとの版（無ければ入っている版）」の peer を見て、275 行目で満たさなければ 276〜280 行目の文を出します。275 行目の `includePrerelease` は `--next` のときだけです。273・281 行目のとおり、`optional` の peer は文を出すだけで止めません。21 のワークスペースで `ng update @angular/core@22` は、`@angular/build` 21.2.31 の peer の 4 つ（`@angular/compiler`・`platform-browser`・`compiler-cli` の `^21.0.0` と `typescript` の `>=5.9 <6.0`）で止まり、package.json は変わりませんでした。`@angular/build` は `@angular/core` の packageGroup に入っていないので、一緒には上がりません。

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L127–150 （▶ の行: 127, 133, 141–143, 148–150）

```ts
127 ▶ export function angularMajorCompatGuarantee(range: string) {
128 │   let newRange = semver.validRange(range);
129 │   if (!newRange) {
130 │     return range;
131 │   }
132 │   let major = 1;
133 ▶   while (!semver.gtr(major + '.0.0', newRange)) {
134 │     major++;
135 │     if (major >= 99) {
136 │       return newRange;
137 │     }
138 │   }
139 │ 
140 │   newRange = range;
141 ▶   for (let minor = 0; minor < 20; minor++) {
142 ▶     newRange += ` || ^${major}.${minor}.0-alpha.0 `;
143 ▶   }
144 │ 
145 │   return semver.validRange(newRange) || range;
146 │ }
147 │ 
148 ▶ const knownPeerCompatibleList: { [name: string]: PeerVersionTransform } = {
149 ▶   '@angular/core': angularMajorCompatGuarantee,
150 ▶ };
```

274 行目の `_updatePeerVersion` は、peer の相手が `@angular/core` のときだけ、148〜150 行目の表でこの関数に範囲を通します。`^21.0.0` は `... || ^22.0.0-alpha.0 || … || ^22.19.0-alpha.0` に広がり、22.3.0 も 22.20.0 も満たしました（23.0.0 は満たさない）。サードパーティのライブラリが `@angular/core@^21` を peer にしていても、22 への更新を止めないためです。`^22.0.0-alpha.0` が 22 系を全部含むので、141〜143 行目の 20 回の繰り返しの 2 つ目からは結果を変えません。

`--force` を付けると、同じ 4 行を出したあとで止まらずに package.json を書き、インストールし、`@angular/core` の migration を 8 つ走らせました（`src/app/app.ts` に `ChangeDetectionStrategy.Eager`、`tsconfig.app.json` に extendedDiagnostics の 2 つ）。`@angular/build` と `@angular/cli` は 21 のままです。DEMO の「5. peer と --force」の差分がその結果です。

## 6. --migrate-only：入れ直さずに migration だけ

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L362–383 （▶ の行: 364–372）

```ts
362 │ 
363 │     // Check if it is a package-local location
364 ▶     const localMigrations = path.join(packagePath, migrations);
365 ▶     if (existsSync(localMigrations)) {
366 ▶       migrations = localMigrations;
367 ▶     } else {
368 ▶       // Try to resolve from package location.
369 ▶       // This avoids issues with package hoisting.
370 ▶       try {
371 ▶         const packageRequire = createRequire(packagePath + '/');
372 ▶         migrations = packageRequire.resolve(migrations, { paths: this.resolvePaths });
373 │       } catch (e) {
374 │         assertIsError(e);
375 │         if (e.code === 'MODULE_NOT_FOUND') {
376 │           logger.error('Migrations for package were not found.');
377 │         } else {
378 │           logger.error(`Unable to resolve migrations for package.  [${e.message}]`);
379 │         }
380 │ 
381 │         return 1;
382 │       }
383 │     }
```

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L385–410 （▶ の行: 385–386, 396–398, 403, 409）

```ts
385 ▶     if (options.name) {
386 ▶       return executeMigration(
387 │         workflow,
388 │         logger,
389 │         packageName,
390 │         migrations,
391 │         options.name,
392 │         options.createCommits,
393 │       );
394 │     }
395 │ 
396 ▶     const from = coerceVersionNumber(options.from);
397 ▶     if (!from) {
398 ▶       logger.error(`"from" value [${options.from}] is not a valid version.`);
399 │ 
400 │       return 1;
401 │     }
402 │ 
403 ▶     return executeMigrations(
404 │       workflow,
405 │       logger,
406 │       packageName,
407 │       migrations,
408 │       from,
409 ▶       options.to || packageNode.version,
410 │       options.createCommits,
```

1. **migrations の場所を決める（364〜372 行目）**

   入っているパッケージの package.json の `ng-update.migrations` を、まずパッケージの中の道として探し、無ければ 371〜372 行目でモジュールとして解きます。`@angular/core` は `./schematics/migrations.json` で 364 行目で見つかり、`@angular/cli` は `@schematics/angular/migrations/migration-collection.json` なので 372 行目に来ます。
2. **1 つか範囲か（385〜409 行目）**

   `--name` なら `executeMigration` で名前の 1 つ、無ければ `--from` を 396 行目で整え（`latest` は 398 行目の「"from" value \[latest\] is not a valid version.」）、`--to` が無ければ 409 行目で入っている版までです。

372 行目の `paths: this.resolvePaths` が問題です。Node の `require.resolve` に `paths` を渡すと、探し始める場所はその配列になり、371 行目の `createRequire(packagePath + '/')` の場所は使われません。62 行目の配列の先頭は動いている CLI の `__dirname` なので、動いている CLI に付いてきた `@schematics/angular` の migration の一覧が選ばれます。368〜369 行目のコメント「パッケージの場所から解く」と逆です。

DEMO の「6. --migrate-only」で、21 のワークスペース（ローカルの CLI 21.2.31）に `ng update @angular/cli --migrate-only --from=20 --to=21.2.31` を走らせた記録：

1. **ローカルの CLI のまま（NG\_DISABLE\_VERSION\_CHECK=1）**

   21.2.31 の `@schematics/angular` の一覧から、21.0.0 の必須の migration 3 つ（karma の設定の削除・moduleResolution・TypeScript の lib）を走らせ、任意の `use-application-builder` を一覧に出しました。
2. **ふつうに打つ**

   3 節の 98 行目で `@angular/cli` に版が無いので `latest`、「Installing a temporary Angular CLI versioned latest」で 22.3.0 が起動し直しました。その CLI の `__dirname` から 22.3.0 の一覧が選ばれ、範囲 `>20.0.0 <=21.2.31` に入る migration が無いので、何も出さずに終了コード 0 でした。`--name=update-module-resolution` は「Cannot find migration 'update-module-resolution' in '@angular/cli'.」で 1 です（21 の一覧にある名前）。
3. **22.2.7 をそのまま**

   手元の 22.2.7 でも同じく、22.2.7 の一覧が選ばれて何も走りませんでした。

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L639–666 （▶ の行: 641–643, 664–665）

```ts
639 │     if (migrations) {
640 │       for (const migration of migrations) {
641 ▶         // Resolve the package from the workspace root, as otherwise it will be resolved from the temp
642 ▶         // installed CLI version.
643 ▶         const packageJsonPath = findPackageJson(this.context.root, migration.package);
644 │         if (!packageJsonPath) {
645 │           logger.error(
646 │             `Migrations for package (${migration.package}) were not found.` +
647 │               ' The package could not be found in the workspace.',
648 │           );
649 │ 
650 │           return 1;
651 │         }
652 │ 
653 │         const packagePath = path.dirname(packageJsonPath);
654 │         let migrations;
655 │ 
656 │         // Check if it is a package-local location
657 │         const localMigrations = path.join(packagePath, migration.collection);
658 │         if (existsSync(localMigrations)) {
659 │           migrations = localMigrations;
660 │         } else {
661 │           // Try to resolve from package location.
662 │           // This avoids issues with package hoisting.
663 │           try {
664 ▶             const packageRequire = createRequire(packagePath + '/');
665 ▶             migrations = packageRequire.resolve(migration.collection);
666 │           } catch (e) {
```

同じファイルのふつうの更新の道（`resolveFallbackMigrations` のあと）は、641〜642 行目のコメントのとおり「一時の CLI からでなくワークスペースから解く」ために 643 行目でワークスペースの package.json を探し、665 行目は `paths` を渡しません。372 行目の `paths` は 6d266c146c（2024-06-12、`fix(@angular/cli): add fallbacks for migration package resolution`、pnpm で解けない件の直し）で足されました。新しい本家でも同じ行です。#30696（`--name=use-application-builder` が新しすぎる `@angular/build` を入れる、閉）では、migrate-only で版の検査を飛ばす PR #32942 は取り込まれずに閉じられ、migration の側を直す #34304（2026-10-12）で閉じられています。

## 7. git の確認

📄 `angular-cli/packages/angular/cli/src/commands/update/utilities/git.ts` L24–63 （▶ の行: 24–25, 31–32, 46, 49–50, 54, 56, 59, 63）

```ts
24 ▶  * This function only checks for changes that are within the specified root directory.
25 ▶  * Changes outside the root directory are ignored.
26 │  * @param root The root directory of the project to check.
27 │  * @returns True if the repository is clean within the root, false otherwise.
28 │  */
29 │ export function checkCleanGit(root: string): boolean {
30 │   try {
31 ▶     const topLevel = execGit(['rev-parse', '--show-toplevel']);
32 ▶     const result = execGit(['status', '--porcelain', '-z']);
33 │     if (result.length === 0) {
34 │       return true;
35 │     }
36 │ 
37 │     const entries = result.split('\0');
38 │     for (let i = 0; i < entries.length; i++) {
39 │       const line = entries[i];
40 │       if (!line) {
41 │         continue;
42 │       }
43 │ 
44 │       // Status is the first 2 characters.
45 │       // If the status is a rename ('R'), the next entry in the split array is the target path.
46 ▶       let filePath = line.slice(3);
47 │       const status = line.slice(0, 2);
48 │       if (status[0] === 'R') {
49 ▶         // Check the source path (filePath)
50 ▶         if (isPathInsideRoot(filePath, root, topLevel.trim())) {
51 │           return false;
52 │         }
53 │ 
54 ▶         // The next entry is the target path of the rename.
55 │         i++;
56 ▶         filePath = entries[i];
57 │       }
58 │ 
59 ▶       if (isPathInsideRoot(filePath, root, topLevel.trim())) {
60 │         return false;
61 │       }
62 │     }
63 ▶   } catch {}
```

31〜32 行目の git が失敗すると（git の外、git が無い）63 行目の `catch` に落ちて、そのあと true（きれい）を返します。この章の記録で git の無いワークスペースでも更新が止まらなかったのはこのためです。ワークスペースの外の変更は 24〜25 行目のとおり数えません。49 行目と 54 行目のコメントは逆です。`git status --porcelain -z` の名前の変更は「`R 新しい名前\0元の名前\0`」の順で（手元の git で確かめた）、46 行目の `filePath` は新しい名前、56 行目が元の名前です。両方を 50・59 行目で確かめるので、振る舞いは変わりません。

> **🧪 DEMO — 本物の ng update の記録**
>
> 作業用の場所の 20（20.3.x）と 21（21.2.x）のワークスペースで、本物の `ng` を走らせた標準出力・標準エラー出力・終了コードと、書き換わったファイルの差分です（2026-11-24 の npm の registry）。書き換える記録は、ワークスペースの複製を git に入れてから取りました。ページは registry に触りません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-update)

## ここまでの呼び出し（ng update @angular/cli --migrate-only --from=20）

- 👤 `ng update @angular/cli --migrate-only --from=20 --to=21.2.31` — ローカルの CLI 21.2.31
  - `.middleware / .check` — cli.ts L128〜161 — *1 つだけか、git はきれいか*
  - `UpdateCommandModule.run` — cli.ts L165
    - `checkCLIVersion → getCLIUpdateRunnerVersion` — cli-version.ts L56 / L82 — *'@angular/cli' に版が無い → latest*
    - `runTempBinary('@angular/cli@latest', …, process.argv.slice(2))` — cli.ts L184 — *22.3.0 を一時の場所に入れて起動し直す*
      - `UpdateCommandModule.migrateOnly` — （一時の 22.3.0 の中）cli.ts L294
        - `packageRequire.resolve(migrations, { paths: this.resolvePaths })` — L372 — *一時の CLI の @schematics/angular を選ぶ*
        - `executeMigrations(…, '20.0.0', '21.2.31')` — L403 → migration.ts — *範囲に入るものが無く、何も出さずに 0*

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `src/commands/update/update-resolver_spec.ts` | `angularMajorCompatGuarantee`（23）› `works with …`（35、9 本） | 5 節の範囲の広げ方 |
| `update-resolver_spec.ts` | `UpdateResolver`（41）› `updates Angular as compatible with Angular N-1`（337）・`uses packageGroup for versioning`（364）・`respects minimumReleaseAge …`（447）・`includes registry metadata when listing updates …`（292） | 4・5 節。292 は一覧の計画を作るところまでで、`printUpdateUsageMessage` の表は見ない |
| `update-resolver_spec.ts` | `RegistryClient`（678）の 4 本 | metadata と manifest の cache |
| `src/commands/update/cli_spec.ts` | `resolveFallbackMigrations`（15）の 3 本 | 6 節の引用の 641 行目の前の、取りこぼした migration を足す所 |
| `tests/e2e/tests/update/update-multiple-versions.ts` | （e2e、走らせていない）L18〜28 は一覧の 2 メジャー先の表を確かめる部分で、TODO でコメントにされている。L29 は 2 メジャーの拒否 | 2 節の 1089 行目を確かめるものは、いま無い |
| `tests/e2e/tests/update/update-application-builder.ts` | L14 `ng update @angular/cli --name=use-application-builder` | 最新のメジャーのワークスペースで走るので、6 節の形（古いメジャーのワークスペース）は通らない |

📄 `走らせたコマンド（2026-11-24）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=UpdateResolver"
```

結果は手元の bazel で `//packages/angular/cli:test` が 257 specs・0 failures、名前で絞ると `UpdateResolver` 14、`angularMajorCompatGuarantee` 9、`resolveFallbackMigrations` 3、`RegistryClient` 4 で、どれも 0 failures でした。`printUpdateUsageMessage`・`getCLIUpdateRunnerVersion`・`migrateOnly`・`checkCleanGit` を確かめる unit の spec はありません。

直すとしたら、2 節は update-resolver.ts の 1087〜1089 行目を `semver.rsort`（プレリリースを外すなら `semver.prerelease(v) === null` で絞る）にし、update-resolver\_spec.ts に「20 の版から 21.2.9 と 21.2.26 があるとき 21.2.26 を出す」it を、`printUpdateUsageMessage` に偽の `infoMap` と logger を渡す形で足します。3 節は cli-version.ts の 98 行目で、`coerceVersionNumber` の前に `semver.minVersion` で範囲の最小の版を取るか、`npa` の `fetchSpec` から範囲を解き、`getCLIUpdateRunnerVersion` の spec（今は無い）に `@^21`・`@~21.2.0` の行を足します。6 節は cli.ts の 372 行目で `paths` の先頭をワークスペース（`this.context.root`）にするか、665 行目と同じく `paths` を渡さず、それで解けないときだけ `resolvePaths` を使います。git.ts の 49・54 行目はコメントの入れ替えだけです。

## 聞かれそうな質問

**Q. `ng update` を打っただけで何か変わりますか？**

変わりません。パッケージが 0 個だと 246 行目で計画を作って表を出すだけで、git の検査（140 行目）も一時の CLI（170 行目）も飛ばします。ただし表の版は、2 メジャー以上先のとき 1089 行目の文字列の比較で古い版（記録では `21.2.9`）を出すことがあります。

**Q. 変更を見るだけの `--dry-run` はありますか？**

ありません。162 行目の `.strict()` で「Unknown argument: dry-run」です。git のある状態で走らせ、`git diff` で見て、要らなければ戻します。140 行目の検査はそのためにあります（139 行目のコメント）。

**Q. 「Installing a temporary Angular CLI」は何を入れていますか？**

更新を走らせる CLI です。`@angular/core@21` のように数字で書けばそのメジャー、書かなければ `latest`、`--next` なら `next`（82〜111 行目）。`^21` や `~21.2.0` は 98 行目で版が取れず `latest` になります。

**Q. v21 のまま、後から CLI の v21 の migration を走らせたいときは？**

ふつうの `ng update @angular/cli --migrate-only --from=…` は一時の `latest` の CLI に移り、その CLI の一覧を使うので、v21 の migration は走りません（6 節）。記録では `NG_DISABLE_VERSION_CHECK=1` を付けてワークスペースの 21.2.31 のまま走らせると、3 つ走りました。`@angular/core` は migrations がパッケージの中の道（364 行目）なので、この影響を受けません。

**Q. `--force` は何を飛ばしますか？**

peer の検査で見つけた不一致で止めることだけです。文は同じく出て、そのまま package.json を書いてインストールし、migration も走ります。npm 7 以上では、これと別にインストールのときの `--force` が常に付きます（`shouldForcePackageManager`、`--verbose` で「NPM 7+ detected」と出る）。

## 読み終えて

- パッケージを書かないと一覧だけ。書くと、git の検査 → 一時の CLI を入れるか → 版を解く → peer の検査 → 書いてインストール → migration。
- 一覧の 2 メジャー先の版は文字列の比較で選ばれ、記録では 21.2.26 でなく 21.2.9 を出した。
- 一時の CLI の版は `@` の後ろの数字から。`^21` の形は `latest` になり、long-description の勧める書き方で 22 の CLI が 21 への更新を走らせた。
- `--migrate-only` は migrations を動いている CLI の場所から先に解くので、一時の CLI に移ると、そのワークスペースの版の migration が走らない。
- `--dry-run` は無く、git の外では「きれい」とみなして止めない。

---

← 前: [ng add：パッケージを入れて ng-add の schematic を走らせる](05-ngx-add.md)  
次: [ng generate・new・run・version・cache](07-ngx-generate-run.md) →
