[目次](../README.md) › [ng コマンドの内側](README.md) › 第 4 回 / 全 10 回

# npm・pnpm・yarn・bun を見分けて呼ぶ：package-managers

> src/package-managers/\* と command-runner.ts の getConfiguredPackageManager：packageManager 欄・angular.json・lockfile（上へたどる、.git で止まる、pnpm → yarn → bun → npm）からの決め方、yarn の 1 系の見分け方、descriptor が組み立てるコマンドの文字列、出力の parsers が「無い」（E404）と「失敗」を分ける方法、dryRun でレジストリも読まないこと。本物の 4 種類 5 通りで確かめる。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-package-managers)

---

この章で分かること：CLI が npm・pnpm・yarn（1 系と 2 系以降）・bun のどれを使うかを、`package.json` の `packageManager` 欄・`angular.json` の設定・lockfile からどの順で決めるか。決めたあと、descriptor（パッケージマネージャーごとのコマンドとフラグの表）がどんなコマンドの文字列を組み立てるか、その出力を parsers がどう読み、「無い」と「失敗」をどう分けるか。4 種類 5 通りの本物のパッケージマネージャーで確かめます。

読む対象は `packages/angular/cli/src/package-managers/` の `discovery.ts`・`factory.ts`・`package-manager-descriptor.ts`・`package-manager.ts`・`host.ts`・`error.ts`・`parsers.ts` と、呼ぶ側の `src/command-builder/command-runner.ts` です（../angular-cli、44129f66a3）。`add` の引数の組み立て（`pmAdd`）は[ng add と ng update の章](../cli/16-cli-add-update.md)が読んでいるので、ここでは行だけ指します。

1. [1. ng と打ってから](01-ngx-entry.md)
2. [2. schema からオプション](02-ngx-options.md)
3. [3. angular.json と設定](03-ngx-config.md)
4. **4. パッケージマネージャー**（この章）
5. [5. ng add](05-ngx-add.md)
6. [6. ng update](06-ngx-update.md)
7. [7. generate・new・run・version](07-ngx-generate-run.md)
8. [8. analytics](08-ngx-analytics.md)
9. [9. ng mcp](09-ngx-mcp.md)
10. [10. spec と issue](10-ngx-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> lockfile は「入れたパッケージの正確な版」を書き留めるファイルで、npm は `package-lock.json`、pnpm は `pnpm-lock.yaml`、yarn は `yarn.lock`、bun は `bun.lock` を作ります。この層は 44129f66a3 と 22.2.7 で違いがいちばん大きい所です（22.2.7 は 22.2.x の枝に、yarn 2 系以降と bun のエラーの読み方、無い版を聞いたときの確かめ、`install` の既定の `--ignore-scripts` などの修正を入れた）。そこで DEMO は、本物の `ng`（22.2.7）のほかに、`PackageManager` を直接呼ぶ記録の道具を 2 つの実装で走らせました。22.2.7 の dist と、44129f66a3 の `src/package-managers` を `git show` で取り出して esbuild で 1 つにしたものです。使ったのは npm 11.19.1・pnpm 12.3.4・yarn 1.22.22・yarn 4.19.0・bun 1.4.5 で、レジストリからは読むだけです。

## 1. 誰が「使うと決めた」パッケージマネージャーを渡すか

📄 `angular-cli/packages/angular/cli/src/command-builder/command-runner.ts` L68–80 （▶ の行: 69–70, 72–74）

```ts
68 │   const cacheConfig = workspace && getCacheConfig(workspace);
69 ▶   const packageManager = await createPackageManager({
70 ▶     cwd: root,
71 │     logger,
72 ▶     dryRun: dryRun || help || jsonHelp || getYargsCompletions,
73 ▶     tempDirectory: cacheConfig?.enabled ? cacheConfig.path : undefined,
74 ▶     configuredPackageManager: await getConfiguredPackageManager(
75 │       root,
76 │       workspace,
77 │       globalConfiguration,
78 │     ),
79 │   });
80 │ 
```

`runCommand` は、どのコマンドでも yargs に登録する前にここで `PackageManager` を 1 つ作り、`CommandContext` に入れます（第 1 回の 7 節）。70 行目の `cwd` はワークスペースの場所、73 行目の一時ディレクトリは `angular.json` のキャッシュの設定です。72 行目の `dryRun` は、`--dry-run`・`--help`・`--json-help`・補完のどれかなら `true` です。3 節で見るとおり、`dryRun` の `PackageManager` はレジストリを読むコマンドも走らせません。`ng add @angular/material --dry-run` は「Unable to load package information from registry.」で止まりました（[第 5 回](05-ngx-add.md)の記録）。

📄 `angular-cli/packages/angular/cli/src/command-builder/command-runner.ts` L184–221 （▶ の行: 200–202, 205, 210, 212, 215, 218）

```ts
184 │ /**
185 │  * Gets the configured package manager by checking package.json, or the local and global angular.json files.
186 │  *
187 │  * @param root The root directory of the workspace.
188 │  * @param localWorkspace The local workspace.
189 │  * @param globalWorkspace The global workspace.
190 │  * @returns The package manager name and version.
191 │  */
192 │ async function getConfiguredPackageManager(
193 │   root: string,
194 │   localWorkspace: AngularWorkspace | undefined,
195 │   globalWorkspace: AngularWorkspace,
196 │ ): Promise<ConfiguredPackageManagerInfo | undefined> {
197 │   let result: ConfiguredPackageManagerInfo | undefined;
198 │ 
199 │   try {
200 ▶     const packageJsonPath = join(root, 'package.json');
201 ▶     const pkgJson = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as JsonValue;
202 ▶     result = getPackageManager(pkgJson);
203 │   } catch {}
204 │ 
205 ▶   if (result) {
206 │     return result;
207 │   }
208 │ 
209 │   if (localWorkspace) {
210 ▶     const project = getProjectByCwd(localWorkspace);
211 │     if (project) {
212 ▶       result = getPackageManager(localWorkspace.projects.get(project)?.extensions['cli']);
213 │     }
214 │ 
215 ▶     result ??= getPackageManager(localWorkspace.extensions['cli']);
216 │   }
217 │ 
218 ▶   result ??= getPackageManager(globalWorkspace.extensions['cli']);
219 │ 
220 │   return result;
221 │ }
```

📄 `angular-cli/packages/angular/cli/src/command-builder/command-runner.ts` L223–239 （▶ の行: 231–234）

```ts
223 │ /**
224 │  * Get the package manager name from a JSON value.
225 │  * @param source The JSON value to get the package manager name from.
226 │  * @returns The package manager name and version.
227 │  */
228 │ function getPackageManager(
229 │   source: JsonValue | undefined,
230 │ ): ConfiguredPackageManagerInfo | undefined {
231 ▶   if (source && isJsonObject(source)) {
232 ▶     const value = source['packageManager'];
233 ▶     if (typeof value === 'string') {
234 ▶       return value.split('@', 2) as unknown as ConfiguredPackageManagerInfo;
235 │     }
236 │   }
237 │ 
238 │   return undefined;
239 │ }
```

1. **200〜206 行目：`package.json` の `packageManager` 欄がいちばん強い**

   Corepack の書き方（`"pnpm@12.3.4"`）です。記録では、この欄が `npm@11.19.1` で `angular.json` が `pnpm` のとき、npm でした。
2. **209〜215 行目：`angular.json` の `cli.packageManager`**

   今のディレクトリのプロジェクトの設定、なければワークスペースの設定。`ng new` はこの欄と `package.json` の欄の両方に書きます（記録の demo-ws の `angular.json` も `"cli": { "packageManager": "npm" }` を持つ）。
3. **218 行目：グローバルの設定**

   第 3 回の `~/.angular-config.json` などです。
4. **234 行目：`split('@', 2)`**

   名前と版に分けるだけで、名前が知っているものかは確かめません。版は `+sha512.…` まで含みます。記録の `pnpm@12.3.4+sha512.0123abcd` は、`ng version` の表に `pnpm 12.3.4+sha512.0123abcd` と出ました。

📄 `angular-cli/packages/angular/cli/src/utilities/config.ts` L319–348 （▶ の行: 319, 332, 336, 339, 343–344）

```ts
319 ▶ export async function getConfiguredPackageManager(): Promise<PackageManager | null> {
320 │   const getPackageManager = (source: json.JsonValue | undefined): PackageManager | null => {
321 │     if (isJsonObject(source)) {
322 │       const value = source['packageManager'];
323 │       if (value && typeof value === 'string') {
324 │         return value as PackageManager;
325 │       }
326 │     }
327 │ 
328 │     return null;
329 │   };
330 │ 
331 │   let result: PackageManager | null = null;
332 ▶   const workspace = await getWorkspace('local');
333 │   if (workspace) {
334 │     const project = getProjectByCwd(workspace);
335 │     if (project) {
336 ▶       result = getPackageManager(workspace.projects.get(project)?.extensions['cli']);
337 │     }
338 │ 
339 ▶     result ??= getPackageManager(workspace.extensions['cli']);
340 │   }
341 │ 
342 │   if (!result) {
343 ▶     const globalOptions = await getWorkspace('global');
344 ▶     result = getPackageManager(globalOptions?.extensions['cli']);
345 │   }
346 │ 
347 │   return result;
348 │ }
```

`utilities/config.ts` にも同じ名前の `getConfiguredPackageManager` があります。こちらは `package.json` の欄を読みません。44129f66a3 の `src` と `lib` を grep すると、呼んでいる所はありませんでした（使われているのは `command-runner.ts` の 192 行目の方）。f7123612bc（2026-01-22、`refactor(@angular/cli): remove old package manager utilities`）で古い道具を消したときの残りで、main にもあります。

## 2. 決め方：設定 → lockfile → npm

📄 `angular-cli/packages/angular/cli/src/package-managers/factory.ts` L75–114 （▶ の行: 75, 78–79, 82–83, 85, 88, 96, 104–106, 112）

```ts
 75 ▶   let [name, version] = configured;
 76 │   let source: 'configured' | 'discovered' | 'default';
 77 │ 
 78 ▶   if (name) {
 79 ▶     source = 'configured';
 80 │     logger?.debug(`Using configured package manager: '${name}'.`);
 81 │   } else {
 82 ▶     const discovered = await discover(host, cwd, logger);
 83 ▶     if (discovered) {
 84 │       name = discovered;
 85 ▶       source = 'discovered';
 86 │       logger?.debug(`Discovered package manager: '${name}'.`);
 87 │     } else {
 88 ▶       name = DEFAULT_PACKAGE_MANAGER;
 89 │       source = 'default';
 90 │       logger?.debug(
 91 │         `No lockfile found. Using default package manager: '${DEFAULT_PACKAGE_MANAGER}'.`,
 92 │       );
 93 │     }
 94 │   }
 95 │ 
 96 ▶   if (name === 'yarn' && !dryRun) {
 97 │     assert.deepStrictEqual(
 98 │       SUPPORTED_PACKAGE_MANAGERS.yarn.versionCommand,
 99 │       SUPPORTED_PACKAGE_MANAGERS['yarn-classic'].versionCommand,
100 │       'Yarn and Yarn Classic version commands must match for detection logic to be valid.',
101 │     );
102 │ 
103 │     try {
104 ▶       version ??= await getPackageManagerVersion(host, cwd, name, logger);
105 ▶       if (version && major(version) < 2) {
106 ▶         name = 'yarn-classic';
107 │         logger?.debug(`Detected yarn classic. Using 'yarn-classic'.`);
108 │       }
109 │     } catch {
110 │       logger?.debug('Failed to get yarn version.');
111 │     }
112 ▶   } else if (name === 'yarn') {
113 │     logger?.debug('Skipping yarn version check due to dry run. Assuming modern yarn.');
114 │   }
```

📄 `angular-cli/packages/angular/cli/src/package-managers/discovery.ts` L92–131 （▶ の行: 101, 103, 105–106, 115–116, 118, 121–122, 129）

```ts
 92 │ export async function discover(
 93 │   host: Host,
 94 │   startDir: string,
 95 │   logger?: Logger,
 96 │ ): Promise<PackageManagerName | null> {
 97 │   logger?.debug(`Starting package manager discovery in '${startDir}'...`);
 98 │   let currentDir = startDir;
 99 │ 
100 │   while (true) {
101 ▶     const found = await findLockfiles(host, currentDir, logger);
102 │ 
103 ▶     if (found.size > 0) {
104 │       logger?.debug(`Found lockfile(s): [${[...found].join(', ')}]. Applying precedence...`);
105 ▶       for (const packageManager of PACKAGE_MANAGER_PRECEDENCE) {
106 ▶         if (found.has(packageManager)) {
107 │           logger?.debug(`Selected '${packageManager}' based on precedence.`);
108 │ 
109 │           return packageManager;
110 │         }
111 │       }
112 │     }
113 │ 
114 │     // Stop searching if we reach the git repository root.
115 ▶     if (await isDirectory(host, join(currentDir, '.git'))) {
116 ▶       logger?.debug(`Reached repository root at '${currentDir}'. Stopping search.`);
117 │ 
118 ▶       return null;
119 │     }
120 │ 
121 ▶     const parentDir = dirname(currentDir);
122 ▶     if (parentDir === currentDir) {
123 │       // We have reached the filesystem root.
124 │       logger?.debug('Reached filesystem root. No lockfile found.');
125 │ 
126 │       return null;
127 │     }
128 │ 
129 ▶     currentDir = parentDir;
130 │   }
131 │ }
```

📄 `angular-cli/packages/angular/cli/src/package-managers/discovery.ts` L31–64 （▶ の行: 41, 43–44, 48–49, 51, 61）

```ts
31 │ async function findLockfiles(
32 │   host: Host,
33 │   directory: string,
34 │   logger?: Logger,
35 │ ): Promise<Set<PackageManagerName>> {
36 │   logger?.debug(`Searching for lockfiles in '${directory}'...`);
37 │ 
38 │   const foundPackageManagers = new Set<PackageManagerName>();
39 │   const checks: Promise<void>[] = [];
40 │ 
41 ▶   for (const [name, descriptor] of Object.entries(SUPPORTED_PACKAGE_MANAGERS)) {
42 │     const manager = name as PackageManagerName;
43 ▶     for (const lockfile of descriptor.lockfiles) {
44 ▶       checks.push(
45 │         (async () => {
46 │           try {
47 │             const path = join(directory, lockfile);
48 ▶             const stats = await host.stat(path);
49 ▶             if (stats.isFile()) {
50 │               logger?.debug(`  Found '${lockfile}'.`);
51 ▶               foundPackageManagers.add(manager);
52 │             }
53 │           } catch {
54 │             // File does not exist or cannot be accessed.
55 │           }
56 │         })(),
57 │       );
58 │     }
59 │   }
60 │ 
61 ▶   await Promise.all(checks);
62 │ 
63 │   return foundPackageManagers;
64 │ }
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager-descriptor.ts` L343–352 （▶ の行: 344–345, 347–351）

```ts
343 │ /**
344 ▶  * The order of precedence for package managers.
345 ▶  * This is a best-effort ordering based on estimated Angular community usage and default presence.
346 │  */
347 ▶ export const PACKAGE_MANAGER_PRECEDENCE: readonly PackageManagerName[] = [
348 ▶   'pnpm',
349 ▶   'yarn',
350 ▶   'bun',
351 ▶   'npm',
352 │ ];
```

1. **78〜80 行目：設定があればそれ**

   lockfile は見ません。記録では `packageManager` 欄が `yarn@1.22.22` で `pnpm-lock.yaml` がある場所は yarn でした。
2. **82〜86 行目：lockfile を上へたどる**

   `discover` は 101 行目で今のディレクトリのすべての lockfile を並べて調べ（41〜59 行目、`Promise.all`）、見つかれば 105 行目から 347〜352 行目の順（pnpm → yarn → bun → npm）で 1 つ選びます。4 つ全部がある記録は pnpm、`yarn.lock` と `package-lock.json` は yarn でした。1 つも無ければ 115 行目で `.git` のディレクトリがあればそこで止まり、無ければ 121〜129 行目で親へ進みます。記録では、親に `pnpm-lock.yaml` があると子でも pnpm、子に `.git` を置くと「Reached repository root」で止まって npm でした。344〜345 行目のコメントのとおり、順は「Angular の利用者の多さの見込み」です。
3. **88 行目：何も無ければ npm**

   記録の「No lockfile found. Using default package manager: 'npm'.」です。
4. **96〜111 行目：yarn は版で 2 つに分ける**

   yarn だけは lockfile の名前が同じなので、104 行目で版を聞き（設定に版があればそれ）、105 行目で 2 未満なら `yarn-classic` にします。記録では PATH の yarn が 1.22.22 なら「Detected yarn classic.」、4.19.0 ならそのまま `yarn` でした。`packageManager` 欄が `yarn`（版なし）なら `yarn --version` を走らせて決めました。

📄 `angular-cli/packages/angular/cli/src/package-managers/factory.ts` L138–177 （▶ の行: 138, 142–144, 149, 151, 153, 159–160, 167, 171–172）

```ts
138 ▶   const result = await determinePackageManager(host, cwd, configuredPackageManager, logger, dryRun);
139 │   const { name, source } = result;
140 │   let { version } = result;
141 │ 
142 ▶   const descriptor = SUPPORTED_PACKAGE_MANAGERS[name];
143 ▶   if (!descriptor) {
144 ▶     throw new Error(`Unsupported package manager: "${name}"`);
145 │   }
146 │ 
147 │   // Do not verify if the package manager is installed during a dry run.
148 │   let initializationError: Error | undefined;
149 ▶   if (!dryRun && !version) {
150 │     try {
151 ▶       version = await getPackageManagerVersion(host, cwd, name, logger);
152 │     } catch {
153 ▶       if (source === 'default') {
154 │         initializationError = new Error(
155 │           `'${DEFAULT_PACKAGE_MANAGER}' was selected as the default package manager, but it is not installed or` +
156 │             ` cannot be found in the PATH. Please install '${DEFAULT_PACKAGE_MANAGER}' to continue.`,
157 │         );
158 │       } else {
159 ▶         initializationError = new Error(
160 ▶           `The project is configured to use '${name}', but it is not installed or cannot be` +
161 │             ` found in the PATH. Please install '${name}' to continue.`,
162 │         );
163 │       }
164 │     }
165 │   }
166 │ 
167 ▶   const packageManager = new PackageManager(host, cwd, descriptor, {
168 │     dryRun,
169 │     logger,
170 │     tempDirectory,
171 ▶     version,
172 ▶     initializationError,
173 │   });
174 │ 
175 │   logger?.debug(`Successfully created PackageManager for '${name}'.`);
176 │ 
177 │   return packageManager;
```

143〜145 行目、知らない名前なら例外です。`package.json` の欄が `cnpm@9.0.0` の記録は、`ng version` でも「An unhandled exception occurred: Unsupported package manager: "cnpm"」で終了コード 127 でした。1 節のとおりどのコマンドでもここを通るので、`packageManager` 欄に descriptor の無い名前を書いたワークスペースでは、`ng` のどのコマンドも動きません（開いている issue の #30947「Allow using Deno as package manager」はこの表に名前を足す話です）。149〜165 行目、版を聞いて失敗しても、その場では止めずに `initializationError` に入れておき、実際にコマンドを走らせるとき（4 節の 192 行目）に投げます。記録の「`bun.lock` があって PATH に bun が無い」場所では、`ng version` は止まらず、表の Package Manager が `bun <error>` でした。

## 3. descriptor：コマンドとフラグの表

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager-descriptor.ts` L38–73 （▶ の行: 40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70）

```ts
38 │ export interface PackageManagerDescriptor {
39 │   /** The binary executable for the package manager. */
40 ▶   readonly binary: string;
41 │ 
42 │   /** The lockfile names used by the package manager. */
43 ▶   readonly lockfiles: readonly string[];
44 │ 
45 │   /** The command to add a package. */
46 ▶   readonly addCommand: string;
47 │ 
48 │   /** The command to install all dependencies. */
49 ▶   readonly installCommand: readonly string[];
50 │ 
51 │   /** The flag to force a clean installation. */
52 ▶   readonly forceFlag: string;
53 │ 
54 │   /** The flag to save a package with an exact version. */
55 ▶   readonly saveExactFlag: string;
56 │ 
57 │   /** The flag to save a package with a tilde version range. */
58 ▶   readonly saveTildeFlag: string;
59 │ 
60 │   /** The flag to save a package as a dev dependency. */
61 ▶   readonly saveDevFlag: string;
62 │ 
63 │   /** The flag to prevent the lockfile from being updated. */
64 ▶   readonly noLockfileFlag: string;
65 │ 
66 │   /** The flag to prevent lifecycle scripts from being executed. */
67 ▶   readonly ignoreScriptsFlag: string;
68 │ 
69 │   /** The flag to ignore peer dependency warnings/errors. */
70 ▶   readonly ignorePeerDependenciesFlag?: string;
71 │ 
72 │   /** The configuration files used by the package manager. */
73 │   readonly configFiles: readonly string[];
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager-descriptor.ts` L169–198 （▶ の行: 172–173, 175–177, 179–181, 185, 187–189）

```ts
169 │ export const SUPPORTED_PACKAGE_MANAGERS = {
170 │   npm: {
171 │     binary: 'npm',
172 ▶     lockfiles: ['package-lock.json', 'npm-shrinkwrap.json'],
173 ▶     addCommand: 'install',
174 │     installCommand: ['install'],
175 ▶     forceFlag: '--force',
176 ▶     saveExactFlag: '--save-exact',
177 ▶     saveTildeFlag: '--save-tilde',
178 │     saveDevFlag: '--save-dev',
179 ▶     noLockfileFlag: '--no-package-lock',
180 ▶     ignoreScriptsFlag: '--ignore-scripts',
181 ▶     ignorePeerDependenciesFlag: '--force',
182 │     configFiles: ['.npmrc'],
183 │     getRegistryOptions: (registry: string) => ({ args: ['--registry', registry] }),
184 │     versionCommand: ['--version'],
185 ▶     listDependenciesCommand: ['list', '--depth=0', '--json=true', '--all=true'],
186 │     getReleaseAgeConfigCommand: ['config', 'get', 'before'],
187 ▶     getPackageNameCommand: ['pkg', 'get', 'name'],
188 ▶     getManifestCommand: ['view', '--json'],
189 ▶     viewCommandFieldArgFormatter: (fields) => [...fields],
190 │     outputParsers: {
191 │       listDependencies: parseNpmLikeDependencies,
192 │       getRegistryManifest: parseNpmLikeManifest,
193 │       getRegistryMetadata: parseNpmLikeMetadata,
194 │       getError: parseNpmLikeError,
195 │       getReleaseAge: parseNpmBeforeDate,
196 │     },
197 │     isNotFound: isKnownNotFound,
198 │   },
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager-descriptor.ts` L199–226 （▶ の行: 201, 205–206, 208–209, 212, 214, 216–217）

```ts
199 │   yarn: {
200 │     binary: 'yarn',
201 ▶     lockfiles: ['yarn.lock'],
202 │     addCommand: 'add',
203 │     installCommand: ['install'],
204 │     forceFlag: '--force',
205 ▶     saveExactFlag: '--exact',
206 ▶     saveTildeFlag: '--tilde',
207 │     saveDevFlag: '--dev',
208 ▶     noLockfileFlag: '',
209 ▶     ignoreScriptsFlag: '--mode=skip-build',
210 │     configFiles: ['.yarnrc.yml', '.yarnrc.yaml'],
211 │     copyConfigFromProject: true,
212 ▶     getRegistryOptions: (registry: string) => ({ env: { YARN_NPM_REGISTRY_SERVER: registry } }),
213 │     versionCommand: ['--version'],
214 ▶     listDependenciesCommand: ['info', '--name-only', '--json'],
215 │     getReleaseAgeConfigCommand: ['config', 'get', 'npmMinimalAgeGate'],
216 ▶     getManifestCommand: ['npm', 'info', '--json'],
217 ▶     viewCommandFieldArgFormatter: (fields) => ['--fields', fields.join(',')],
218 │     outputParsers: {
219 │       listDependencies: parseYarnModernDependencies,
220 │       getRegistryManifest: parseNpmLikeManifest,
221 │       getRegistryMetadata: parseNpmLikeMetadata,
222 │       getError: parseNpmLikeError,
223 │       getReleaseAge: parseYarnReleaseAge,
224 │     },
225 │     isNotFound: isKnownNotFound,
226 │   },
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager-descriptor.ts` L227–254 （▶ の行: 229–232, 239–240, 245–246）

```ts
227 │   'yarn-classic': {
228 │     binary: 'yarn',
229 ▶     // This is intentionally empty. `yarn-classic` is not a discoverable package manager.
230 ▶     // The discovery process finds `yarn` via `yarn.lock`, and the factory logic
231 ▶     // determines whether it is classic or modern by checking the installed version.
232 ▶     lockfiles: [],
233 │     addCommand: 'add',
234 │     installCommand: ['install'],
235 │     forceFlag: '--force',
236 │     saveExactFlag: '--exact',
237 │     saveTildeFlag: '--tilde',
238 │     saveDevFlag: '--dev',
239 ▶     noLockfileFlag: '--no-lockfile',
240 ▶     ignoreScriptsFlag: '--ignore-scripts',
241 │     configFiles: ['.yarnrc', '.npmrc'],
242 │     getRegistryOptions: (registry: string) => ({ args: ['--registry', registry] }),
243 │     versionCommand: ['--version'],
244 │     listDependenciesCommand: ['list', '--depth=0', '--json'],
245 ▶     getManifestCommand: ['info', '--json', '--verbose'],
246 ▶     requiresManifestVersionLookup: true,
247 │     outputParsers: {
248 │       listDependencies: parseYarnClassicDependencies,
249 │       getRegistryManifest: parseYarnClassicManifest,
250 │       getRegistryMetadata: parseYarnClassicMetadata,
251 │       getError: parseYarnClassicError,
252 │     },
253 │     isNotFound: isKnownNotFound,
254 │   },
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager-descriptor.ts` L255–283 （▶ の行: 257, 262, 264, 266, 270, 273）

```ts
255 │   pnpm: {
256 │     binary: 'pnpm',
257 ▶     lockfiles: ['pnpm-lock.yaml'],
258 │     addCommand: 'add',
259 │     installCommand: ['install'],
260 │     forceFlag: '--force',
261 │     saveExactFlag: '--save-exact',
262 ▶     saveTildeFlag: '--save-tilde',
263 │     saveDevFlag: '--save-dev',
264 ▶     noLockfileFlag: '--no-lockfile',
265 │     ignoreScriptsFlag: '--ignore-scripts',
266 ▶     ignorePeerDependenciesFlag: '--strict-peer-dependencies=false',
267 │     configFiles: ['.npmrc', 'pnpm-workspace.yaml'],
268 │     getRegistryOptions: (registry: string) => ({ args: ['--registry', registry] }),
269 │     versionCommand: ['--version'],
270 ▶     listDependenciesCommand: ['list', '--depth=0', '--json'],
271 │     getReleaseAgeConfigCommand: ['config', 'get', 'minimum-release-age'],
272 │     getPackageNameCommand: ['pkg', 'get', 'name'],
273 ▶     getManifestCommand: ['view', '--json'],
274 │     viewCommandFieldArgFormatter: (fields) => [...fields],
275 │     outputParsers: {
276 │       listDependencies: parseNpmLikeDependencies,
277 │       getRegistryManifest: parseNpmLikeManifest,
278 │       getRegistryMetadata: parseNpmLikeMetadata,
279 │       getError: parseNpmLikeError,
280 │       getReleaseAge: parsePnpmReleaseAge,
281 │     },
282 │     isNotFound: isKnownNotFound,
283 │   },
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager-descriptor.ts` L284–300 （▶ の行: 286, 290–293, 296, 299–300）

```ts
284 │   bun: {
285 │     binary: 'bun',
286 ▶     lockfiles: ['bun.lockb', 'bun.lock'],
287 │     addCommand: 'add',
288 │     installCommand: ['install'],
289 │     forceFlag: '--force',
290 ▶     saveExactFlag: '--exact',
291 ▶     saveTildeFlag: '', // Bun does not have a flag for tilde, it defaults to caret.
292 ▶     saveDevFlag: '--development',
293 ▶     noLockfileFlag: '', // Bun does not have a flag for this.
294 │     ignoreScriptsFlag: '--ignore-scripts',
295 │     configFiles: ['bunfig.toml', '.npmrc'],
296 ▶     copyConfigFromProject: true,
297 │     getRegistryOptions: (registry: string) => ({ args: ['--registry', registry] }),
298 │     versionCommand: ['--version'],
299 ▶     listDependenciesCommand: ['pm', 'ls'],
300 ▶     getManifestCommand: ['pm', 'view', '--json'],
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager-descriptor.ts` L301–340 （▶ の行: 301, 303, 312, 323, 327）

```ts
301 ▶     getRegistryMetadata: async (packageName, fetchAndParse) => {
302 │       const [distTags, versions] = await Promise.all([
303 ▶         fetchAndParse(['pm', 'view', '--json', packageName, 'dist-tags'], (stdout) => {
304 │           if (!stdout) {
305 │             return {};
306 │           }
307 │ 
308 │           const parsed = JSON.parse(stdout);
309 │ 
310 │           return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
311 │         }),
312 ▶         fetchAndParse(['pm', 'view', '--json', packageName, 'versions'], (stdout) => {
313 │           if (!stdout) {
314 │             return null;
315 │           }
316 │ 
317 │           const parsed = JSON.parse(stdout);
318 │ 
319 │           return Array.isArray(parsed) ? parsed : [parsed];
320 │         }),
321 │       ]);
322 │ 
323 ▶       if (!versions || versions.length === 0) {
324 │         return null;
325 │       }
326 │ 
327 ▶       return {
328 │         name: packageName,
329 │         'dist-tags': (distTags || {}) as Record<string, string>,
330 │         versions: versions as string[],
331 │       };
332 │     },
333 │     outputParsers: {
334 │       listDependencies: parseBunDependencies,
335 │       getRegistryManifest: parseNpmLikeManifest,
336 │       getRegistryMetadata: parseNpmLikeMetadata,
337 │       getError: parseNpmLikeError,
338 │     },
339 │     isNotFound: isKnownNotFound,
340 │   },
```

ファイルの説明文のとおり、5 つは互いに引き継がない完全な表です。DEMO の「descriptor が組み立てるコマンド」は、`dryRun: true` の `PackageManager` で 9 つのメソッドを呼び、217 行目（`#run`、下の引用）が書く `[DRY RUN] Would execute in …` の行を集めた記録です。たとえば `add('@angular/cdk@22.2.7', 'none', false, false, true)` は npm で `npm install @angular/cdk@22.2.7 --ignore-scripts`、yarn 4 で `yarn add … --mode=skip-build`、bun で `bun add … --ignore-scripts` でした。

- **177 行目と 262 行目の `--save-tilde`**：`save` が `'tilde'` のときのフラグです。本物の npm 11.19.1 は「npm warn Unknown cli config "--save-tilde".」と言って無視し `^7.0.0` で保存、pnpm 12.3.4 は「error: unexpected argument '--save-tilde' found」で終了コード 2 でした（npm と pnpm で `~` を付けるのは `--save-prefix=~` の設定）。今の CLI に `'tilde'` を渡す呼び手は無いので、表に出ていない値です。
- **181 行目の npm の `ignorePeerDependenciesFlag` は `--force`**：peer の検査を飛ばすだけでなく、npm の `--force` の他の効き目も付きます。pnpm は 266 行目の `--strict-peer-dependencies=false`、yarn と bun は無い（記録でもフラグが付かない）です。
- **232 行目の yarn-classic の `lockfiles: []`**：2 節の 96〜111 行目でしか選ばれません。245〜246 行目、1 系の `yarn info` は範囲や dist-tag を受けないので、先に一覧を聞いて版を決めます（4 節の 576〜593 行目）。
- **bun は 300 行目の `pm view` に欲しい項目を絞る形が無く**、301〜332 行目の一覧の取り方も `dist-tags` と `versions` の 2 回に分けます。記録の bun の `getRegistryManifest` は、`versions` まで持った文書全体でした。

## 4. コマンドを走らせ、出力を読む：「無い」と「失敗」

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager.ts` L191–230 （▶ の行: 192, 198–199, 207, 210, 214–217, 220, 223, 226, 230）

```ts
191 │     return this.#runWithThrottle(async () => {
192 ▶       this.ensureInstalled();
193 │ 
194 │       const { registry, cwd, ...runOptions } = options;
195 │       const finalArgs = [...args];
196 │       let finalEnv: Record<string, string> | undefined;
197 │ 
198 ▶       if (registry) {
199 ▶         const registryOptions = this.descriptor.getRegistryOptions?.(registry);
200 │         if (!registryOptions) {
201 │           throw new Error(
202 │             `The configured package manager, '${this.descriptor.binary}', does not support a custom registry.`,
203 │           );
204 │         }
205 │ 
206 │         if (registryOptions.args) {
207 ▶           finalArgs.push(...registryOptions.args);
208 │         }
209 │         if (registryOptions.env) {
210 ▶           finalEnv = registryOptions.env;
211 │         }
212 │       }
213 │ 
214 ▶       const executionDirectory = cwd ?? this.cwd;
215 ▶       if (this.options.dryRun) {
216 ▶         this.options.logger?.info(
217 ▶           `[DRY RUN] Would execute in [${executionDirectory}]: ${this.descriptor.binary} ${finalArgs.join(' ')}`,
218 │         );
219 │ 
220 ▶         return { stdout: '', stderr: '' };
221 │       }
222 │ 
223 ▶       const commandResult = await this.host.runCommand(this.descriptor.binary, finalArgs, {
224 │         ...runOptions,
225 │         cwd: executionDirectory,
226 ▶         stdio: 'pipe',
227 │         env: finalEnv,
228 │       });
229 │ 
230 ▶       return { stdout: commandResult.stdout.trim(), stderr: commandResult.stderr.trim() };
```

192 行目で 2 節の `initializationError` を投げます。215〜221 行目、`dryRun` なら **どのコマンドも**走らせず、空の出力を返します。`npm view` のような読むだけのコマンドも区別しません。1 節の `ng add --dry-run` が止まるのはこのためで、空の出力は 4 節の parsers で `null`（「無い」）になります。

📄 `angular-cli/packages/angular/cli/src/package-managers/host.ts` L127–162 （▶ の行: 128, 132, 136–137, 143, 149, 154, 160–162）

```ts
127 │   ): Promise<{ stdout: string; stderr: string }> => {
128 ▶     const signal = options.timeout ? AbortSignal.timeout(options.timeout) : undefined;
129 │     const isWin32 = platform() === 'win32';
130 │ 
131 │     return new Promise((resolve, reject) => {
132 ▶       const env: Record<string, string | undefined> = {
133 │         ...process.env,
134 │         ...options.env,
135 │         //  NPM updater notifier will prevents the child process from closing until it timeout after 3 minutes.
136 ▶         NO_UPDATE_NOTIFIER: '1',
137 ▶         NPM_CONFIG_UPDATE_NOTIFIER: 'false',
138 │       };
139 │ 
140 │       // When running via Yarn Classic (`yarn run <script>`), Yarn automatically injects
141 │       // `npm_config_registry=https://registry.yarnpkg.com` into the environment.
142 │       // Strip this fallback so that spawned child processes correctly respect local `.npmrc`/`.yarnrc` files.
143 ▶       if (
144 │         (env['npm_config_registry'] === 'https://registry.yarnpkg.com' ||
145 │           env['NPM_CONFIG_REGISTRY'] === 'https://registry.yarnpkg.com') &&
146 │         (env['npm_config_user_agent']?.includes('yarn') ||
147 │           env['NPM_CONFIG_USER_AGENT']?.includes('yarn'))
148 │       ) {
149 ▶         delete env['npm_config_registry'];
150 │         delete env['NPM_CONFIG_REGISTRY'];
151 │       }
152 │ 
153 │       const spawnOptions = {
154 ▶         shell: isWin32,
155 │         stdio: options.stdio ?? 'pipe',
156 │         signal,
157 │         cwd: options.cwd,
158 │         env,
159 │       } satisfies SpawnOptions;
160 ▶       const childProcess = isWin32
161 ▶         ? spawn(`${command} ${args.join(' ')}`, spawnOptions)
162 ▶         : spawn(command, args, spawnOptions);
```

実際の起動は `host.ts` です。136〜137 行目で npm の更新の知らせを止め（コメントのとおり、知らせのせいで子のプロセスが 3 分終わらないことがある）、143〜151 行目で yarn 1 系が子に入れる `npm_config_registry=https://registry.yarnpkg.com` を消します。Windows だけ 154 行目でシェルを通し、161 行目でコマンドを 1 つの文字列に繋ぎます（だから 4 節の 520〜522 行目のように、Windows では版の指定を引用符で包む）。

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager.ts` L253–283 （▶ の行: 255, 264, 268–271, 278, 281–283）

```ts
253 │     const { cache, cacheKey, bypassCache, ...runOptions } = options;
254 │ 
255 ▶     if (!bypassCache && cache && cacheKey && cache.has(cacheKey)) {
256 │       return cache.get(cacheKey) as T | null;
257 │     }
258 │ 
259 │     let stdout;
260 │     let stderr;
261 │     let exitCode;
262 │     let thrownError;
263 │     try {
264 ▶       ({ stdout, stderr } = await this.#run(args, runOptions));
265 │       exitCode = 0;
266 │     } catch (e) {
267 │       thrownError = e;
268 ▶       if (e instanceof PackageManagerError) {
269 ▶         stdout = e.stdout;
270 ▶         stderr = e.stderr;
271 ▶         exitCode = e.exitCode;
272 │       } else {
273 │         // Re-throw unexpected errors
274 │         throw e;
275 │       }
276 │     }
277 │ 
278 ▶     // Yarn classic can exit with code 0 even when an error occurs.
279 │     // To ensure we capture these cases, we will always attempt to parse a
280 │     // structured error from the output, regardless of the exit code.
281 ▶     const getError = this.descriptor.outputParsers.getError;
282 ▶     const parsedError =
283 ▶       getError?.(stdout, this.options.logger) ?? getError?.(stderr, this.options.logger) ?? null;
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager.ts` L285–324 （▶ の行: 285, 291–293, 296, 299, 305–306, 312, 314, 319, 322）

```ts
285 ▶     if (parsedError) {
286 │       this.options.logger?.debug(
287 │         `[${this.descriptor.binary}] Structured error (code: ${parsedError.code}): ${parsedError.summary}`,
288 │       );
289 │ 
290 │       // Special case for 'not found' errors (e.g., E404). Return null for these.
291 ▶       if (this.descriptor.isNotFound(parsedError)) {
292 ▶         if (cache && cacheKey) {
293 ▶           cache.set(cacheKey, null);
294 │         }
295 │ 
296 ▶         return null;
297 │       } else {
298 │         // For all other structured errors, throw a more informative error.
299 ▶         throw new PackageManagerError(parsedError.summary, stdout, stderr, exitCode);
300 │       }
301 │     }
302 │ 
303 │     // If an error was originally thrown and we didn't parse a more specific
304 │     // structured error, re-throw the original error now.
305 ▶     if (thrownError) {
306 ▶       throw thrownError;
307 │     }
308 │ 
309 │     // If we reach this point, the command succeeded and no structured error was found.
310 │     // We can now safely parse the successful output.
311 │     try {
312 ▶       const result = parser(stdout, this.options.logger);
313 │       if (cache && cacheKey) {
314 ▶         cache.set(cacheKey, result);
315 │       }
316 │ 
317 │       return result;
318 │     } catch (e) {
319 ▶       const message = `Failed to parse package manager output: ${
320 │         e instanceof Error ? e.message : ''
321 │       }`;
322 ▶       throw new PackageManagerError(message, stdout, stderr, exitCode);
323 │     }
324 │   }
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager-descriptor.ts` L146–156 （▶ の行: 147, 154–155）

```ts
146 │ /** A set of error codes that are known to indicate a "package not found" error. */
147 ▶ const NOT_FOUND_ERROR_CODES = new Set(['E404']);
148 │ 
149 │ /**
150 │  * A shared function to check if a structured error represents a "package not found" error.
151 │  * @param error The structured error to check.
152 │  * @returns True if the error code is a known "not found" code, false otherwise.
153 │  */
154 ▶ function isKnownNotFound(error: ErrorInfo): boolean {
155 ▶   return NOT_FOUND_ERROR_CODES.has(error.code);
156 │ }
```

1. **278〜283 行目：終了コードに関係なく、まずエラーを読む**

   yarn 1 系は失敗しても 0 で終わることがあるからです。stdout、だめなら stderr を `getError` に渡します。
2. **291〜296 行目：「無い」は `null`**

   `isNotFound` は 154〜156 行目で、コードが `E404` のときだけです。
3. **299 行目：ほかの構造のあるエラーは `PackageManagerError`**

   読めなかった失敗は 305〜307 行目でそのまま投げ直します。
4. **311〜323 行目：成功なら parser**

   parser が投げれば「Failed to parse package manager output」です。

📄 `angular-cli/packages/angular/cli/src/package-managers/parsers.ts` L506–543 （▶ の行: 516, 518, 520, 523, 528–529, 535）

```ts
506 │ export function parseNpmLikeError(output: string, logger?: Logger): ErrorInfo | null {
507 │   logger?.debug(`Parsing npm-like error output...`);
508 │   logStdout(output, logger); // Log output for debugging purposes
509 │ 
510 │   if (!output) {
511 │     logger?.debug('  output is empty. No error found.');
512 │ 
513 │     return null;
514 │   }
515 │ 
516 ▶   // Attempt to parse as JSON first (common for pnpm, modern yarn, bun, npm 12)
517 │   try {
518 ▶     let jsonError = JSON.parse(output);
519 │     if (Array.isArray(jsonError)) {
520 ▶       jsonError = jsonError[0];
521 │     }
522 │     if (jsonError && typeof jsonError === 'object' && 'error' in jsonError) {
523 ▶       jsonError = jsonError.error;
524 │     }
525 │ 
526 │     if (
527 │       jsonError &&
528 ▶       typeof jsonError.code === 'string' &&
529 ▶       (typeof jsonError.summary === 'string' || typeof jsonError.message === 'string')
530 │     ) {
531 │       const summary = jsonError.summary || jsonError.message;
532 │       logger?.debug(`  Successfully parsed JSON error with code '${jsonError.code}'.`);
533 │ 
534 │       return {
535 ▶         code: jsonError.code,
536 │         summary,
537 │         detail: jsonError.detail,
538 │       };
539 │     }
540 │   } catch (e) {
541 │     logger?.debug(`  Failed to parse output as JSON: ${e}. Attempting regex fallback.`);
542 │     // Fallback to regex for plain text errors (common for npm)
543 │   }
```

📄 `angular-cli/packages/angular/cli/src/package-managers/parsers.ts` L545–572 （▶ の行: 546, 548, 553, 556, 565–566）

```ts
545 │   // Regex for npm-like error codes (e.g., `npm ERR! code E404` or `npm error code E404`)
546 ▶   const errorCodeMatch = output.match(/npm (ERR!|error) code (E\d{3}|[A-Z_]+)/);
547 │   if (errorCodeMatch) {
548 ▶     const code = errorCodeMatch[2]; // Capture group 2 is the actual error code
549 │     let summary: string | undefined;
550 │ 
551 │     // Find the most descriptive summary line (the line after `npm ERR! code ...` or `npm error code ...`).
552 │     for (const line of output.split('\n')) {
553 ▶       if (line.startsWith('npm ERR!') && !line.includes(' code ')) {
554 │         summary = line.replace('npm ERR! ', '').trim();
555 │         break;
556 ▶       } else if (line.startsWith('npm error') && !line.includes(' code ')) {
557 │         summary = line.replace('npm error ', '').trim();
558 │         break;
559 │       }
560 │     }
561 │ 
562 │     logger?.debug(`  Successfully parsed text error with code '${code}'.`);
563 │ 
564 │     return {
565 ▶       code,
566 ▶       summary: summary || `Package manager error: ${code}`,
567 │     };
568 │   }
569 │ 
570 │   logger?.debug('  Failed to parse npm-like error. No structured error found.');
571 │ 
572 │   return null;
```

npm・pnpm（と 44129f66a3 では yarn 4 と bun も）の `getError` です。516 行目のコメントは JSON のエラーを「pnpm, modern yarn, bun, npm 12 でよくある」と書き、523 行目で `{"error": {…}}` を開き、535 行目で `code` をそのまま使います。npm の生の出力は、記録のとおり `npm error code E404` の行と JSON の両方を出し、546 行目の正規表現か JSON で `E404` になって `null` でした。

pnpm 12.3.4 の生の出力は、無いパッケージが `"code": "ERR_PNPM_FETCH_404"`、無い版が `"code": "ERR_PNPM_PACKAGE_NOT_FOUND"` でした。どちらも 154 行目の `E404` ではないので「無い」にならず、22.2.7 でも `getManifest('@angular/no-such-package-ngx-demo')` は `PackageManagerError`「GET … Not Found - 404」、`getRegistryManifest('@angular/cdk', '99.0.0')` は「No matching version found …」を投げました。同じ問いに npm・yarn 4・bun（22.2.7）は `null` を返します。main（de5620f18d）の 165 行目も `new Set(['E404'])` のままです。parsers\_spec.ts の 178 行目は「modern yarn の JSON のエラー」という名前で `ERR_PNPM_NO_SUCH_PACKAGE` を読ませていて、その値が「無い」に当たるかは確かめません。

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager.ts` L515–547 （▶ の行: 520, 523, 525–526, 529, 531, 533–534, 538, 543）

```ts
515 │   async getRegistryManifest(
516 │     packageName: string,
517 │     version: string,
518 │     options: { timeout?: number; registry?: string; bypassCache?: boolean } = {},
519 │   ): Promise<PackageManifest | null> {
520 ▶     const specifier = this.host.requiresQuoting
521 │       ? `"${packageName}@${version}"`
522 │       : `${packageName}@${version}`;
523 ▶     const commandArgs = [...this.descriptor.getManifestCommand, specifier];
524 │     const formatter = this.descriptor.viewCommandFieldArgFormatter;
525 ▶     if (formatter) {
526 ▶       commandArgs.push(...formatter(MANIFEST_FIELDS));
527 │     }
528 │ 
529 ▶     const cacheKey = options.registry ? `${specifier}|${options.registry}` : specifier;
530 │ 
531 ▶     const manifest = await this.#fetchAndParse(
532 │       commandArgs,
533 ▶       (stdout, logger) => this.descriptor.outputParsers.getRegistryManifest(stdout, logger),
534 ▶       { ...options, cache: this.#manifestCache, cacheKey },
535 │     );
536 │ 
537 │     // If the provided version was not a specific version, also cache the specific fetched version
538 ▶     if (manifest && manifest.version !== version) {
539 │       const manifestSpecifier = `${manifest.name}@${manifest.version}`;
540 │       const manifestCacheKey = options.registry
541 │         ? `${manifestSpecifier}|${options.registry}`
542 │         : manifestSpecifier;
543 ▶       this.#manifestCache.set(manifestCacheKey, manifest);
544 │     }
545 │ 
546 │     return manifest;
547 │   }
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager.ts` L564–596 （▶ の行: 564, 566, 575–578, 582–583, 588, 595）

```ts
564 ▶     const { name, type, fetchSpec } = typeof specifier === 'string' ? npa(specifier) : specifier;
565 │ 
566 ▶     switch (type) {
567 │       case 'range':
568 │       case 'version':
569 │       case 'tag': {
570 │         if (!name) {
571 │           throw new Error(`Could not parse package name from specifier: ${specifier}`);
572 │         }
573 │ 
574 │         // `fetchSpec` is the version, range, or tag.
575 ▶         let versionSpec = fetchSpec ?? 'latest';
576 ▶         if (this.descriptor.requiresManifestVersionLookup) {
577 ▶           if (type === 'tag' || !fetchSpec) {
578 ▶             const metadata = await this.getRegistryMetadata(name, options);
579 │             if (!metadata) {
580 │               return null;
581 │             }
582 ▶             versionSpec = metadata['dist-tags'][versionSpec];
583 ▶           } else if (type === 'range') {
584 │             const metadata = await this.getRegistryMetadata(name, options);
585 │             if (!metadata) {
586 │               return null;
587 │             }
588 ▶             versionSpec = maxSatisfying(metadata.versions, fetchSpec) ?? '';
589 │           }
590 │           if (!versionSpec) {
591 │             return null;
592 │           }
593 │         }
594 │ 
595 ▶         return this.getRegistryManifest(name, versionSpec, options);
596 │       }
```

📄 `angular-cli/packages/angular/cli/src/package-managers/parsers.ts` L291–327 （▶ の行: 295, 298, 301, 306, 310, 317, 326）

```ts
291 │ export function parseNpmLikeManifest(stdout: string, logger?: Logger): PackageManifest | null {
292 │   logger?.debug(`Parsing npm-like manifest...`);
293 │   logStdout(stdout, logger);
294 │ 
295 ▶   if (!stdout) {
296 │     logger?.debug('  stdout is empty. No manifest found.');
297 │ 
298 ▶     return null;
299 │   }
300 │ 
301 ▶   const result = JSON.parse(stdout);
302 │ 
303 │   // npm view returns an array of manifests if the query matches multiple versions
304 │   // (e.g. when using a version range). We find the highest version to ensure
305 │   // we get the latest relevant manifest, even if the output is not sorted.
306 ▶   if (Array.isArray(result)) {
307 │     let maxManifest: PackageManifest | null = null;
308 │ 
309 │     for (const manifest of result) {
310 ▶       if (!isValidManifest(manifest)) {
311 │         logger?.debug(
312 │           '  Skipping invalid manifest in array (missing name, version, or invalid SemVer).',
313 │         );
314 │         continue;
315 │       }
316 │ 
317 ▶       if (!maxManifest || compare(manifest.version, maxManifest.version) > 0) {
318 │         maxManifest = manifest;
319 │       }
320 │     }
321 │ 
322 │     if (!maxManifest) {
323 │       logger?.debug('  No valid manifests found in the array.');
324 │     }
325 │ 
326 ▶     return maxManifest;
327 │   }
```

📄 `angular-cli/packages/angular/cli/src/package-managers/parsers.ts` L260–283 （▶ の行: 265, 267, 275, 279）

```ts
260 │ function isValidManifest(obj: unknown): obj is PackageManifest {
261 │   if (typeof obj !== 'object' || obj === null) {
262 │     return false;
263 │   }
264 │ 
265 ▶   const { name, version } = obj as Record<string, unknown>;
266 │ 
267 ▶   return typeof name === 'string' && typeof version === 'string' && valid(version) !== null;
268 │ }
269 │ 
270 │ function isValidMetadata(obj: unknown): obj is PackageMetadata {
271 │   if (typeof obj !== 'object' || obj === null) {
272 │     return false;
273 │   }
274 │ 
275 ▶   const { name, versions, 'dist-tags': distTags } = obj as Record<string, unknown>;
276 │ 
277 │   return (
278 │     typeof name === 'string' &&
279 ▶     Array.isArray(versions) &&
280 │     typeof distTags === 'object' &&
281 │     distTags !== null
282 │   );
283 │ }
```

44129f66a3 の `getRegistryManifest` は、返ってきた manifest が聞いた版かを確かめません（531〜535 行目は parser に渡すだけ）。記録では、44129f66a3 の実装で yarn 4.19.0 に `@angular/cdk@99.0.0` を聞くと、`version: "22.3.0"`（その時の `latest`）の manifest が返りました。生の `yarn npm info --json @angular/cdk@99.0.0` が、無い版でも終了コード 0 で `latest` を返すからです。無い dist-tag（`nosuchtag`）も同じでした。22.2.7 は 81e9eae21d と c063601c29（main、2026-11-02〜04）を入れ、返った版が聞いた範囲を満たさなければ `null` にするので、記録も `null` でした。bun も 44129f66a3 では無い版・無いパッケージで「Process exited with code 1.」を投げ、22.2.7（322777d80b）では `null` でした。

📄 `angular-cli/packages/angular/cli/src/package-managers/parsers.ts` L403–441 （▶ の行: 406–408, 413, 425–429, 433, 437）

```ts
403 │   // Yarn classic outputs JSONL. We need to find the relevant object.
404 │   let manifest;
405 │   for (const json of parseJsonLines(stdout, logger)) {
406 ▶     // The manifest data is in a JSON object with type 'inspect'.
407 ▶     if (json.type === 'inspect' && json.data) {
408 ▶       manifest = json.data;
409 │       break;
410 │     }
411 │   }
412 │ 
413 ▶   if (!manifest) {
414 │     logger?.debug('  Failed to find manifest in yarn classic output.');
415 │ 
416 │     return null;
417 │   }
418 │ 
419 │   // Yarn classic removes any field with a falsy value
420 │   // https://github.com/yarnpkg/yarn/blob/7cafa512a777048ce0b666080a24e80aae3d66a9/src/cli/commands/info.js#L26-L29
421 │   // Add a default of 'false' for the `save` field when the `ng-add` object is present but does not have any fields.
422 │   // There is a small chance this causes an incorrect value. However, the use of `ng-add` is rare and, in the cases
423 │   // it is used, save is set to either a `false` literal or a truthy value. Special cases can be added for specific
424 │   // packages if discovered.
425 ▶   if (
426 ▶     manifest['ng-add'] &&
427 ▶     typeof manifest['ng-add'] === 'object' &&
428 ▶     Object.keys(manifest['ng-add']).length === 0
429 ▶   ) {
430 │     manifest['ng-add'].save ??= false;
431 │   }
432 │ 
433 ▶   if (!isValidManifest(manifest)) {
434 │     logger?.debug(
435 │       '  Parsed JSON is not a valid manifest (missing name, version, or invalid SemVer).',
436 │     );
437 ▶ 
438 │     return null;
439 │   }
440 │ 
441 │   return manifest;
```

yarn 1.22.22 は違う形で同じ穴を持っています。生の `yarn info --json --verbose @angular/cdk@99.0.0` は終了コード 0 で、`inspect` の `data` はパッケージ全体の文書（`name`・`dist-tags`・`versions`…）に `version: "99.0.0"` を足したものでした。407 行目でこれを manifest とし、433 行目の `isValidManifest` は名前と版の形しか見ないので通ります。記録の 22.2.7 の yarn-classic は `{"name":"@angular/cdk","version":"99.0.0"}` を返し、22.2.7 の「聞いた範囲を満たすか」の確かめも `99.0.0` 同士なので通りました。無い版を「ある」と答える形で、`peerDependencies` も `schematics` もありません。main も同じ parser です。

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager.ts` L371–390 （▶ の行: 371, 378, 380–383, 385）

```ts
371 ▶   async install(
372 │     options: {
373 │       timeout?: number;
374 │       force?: boolean;
375 │       registry?: string;
376 │       ignoreScripts?: boolean;
377 │       ignorePeerDependencies?: boolean;
378 ▶     } = { ignoreScripts: true },
379 │   ): Promise<void> {
380 ▶     const flags = [
381 ▶       options.force ? this.descriptor.forceFlag : '',
382 ▶       options.ignoreScripts ? this.descriptor.ignoreScriptsFlag : '',
383 ▶       options.ignorePeerDependencies ? (this.descriptor.ignorePeerDependenciesFlag ?? '') : '',
384 │     ].filter((flag) => flag);
385 ▶     const args = [...this.descriptor.installCommand, ...flags];
386 │ 
387 │     await this.#run(args, options);
388 │ 
389 │     this.#dependencyCache = null;
390 │   }
```

378 行目の `= { ignoreScripts: true }` は引数の既定値なので、**何か 1 つでも渡すと**`ignoreScripts` は `undefined` になり、`--ignore-scripts` が付きません。記録の 44129f66a3 では `install()` が `npm install --ignore-scripts`、`install({ force: true })` が `npm install --force`（スクリプトが走る）、22.2.7 は `npm install --force --ignore-scripts` でした。main の a69fe511c6（2026-11-02、`fix(@angular/cli): default ignoreScripts to true when install options are provided`）が分割代入の既定値に直し、22.2.7 にも入っています。

📄 `angular-cli/packages/angular/cli/src/package-managers/error.ts` L21–52 （▶ の行: 21, 31–33, 43, 45, 48, 51）

```ts
21 ▶ export class PackageManagerError extends Error {
22 │   /**
23 │    * Creates a new `PackageManagerError` instance.
24 │    * @param message The error message.
25 │    * @param stdout The standard output of the failed process.
26 │    * @param stderr The standard error of the failed process.
27 │    * @param exitCode The exit code of the failed process.
28 │    */
29 │   constructor(
30 │     message: string,
31 ▶     public readonly stdout: string,
32 ▶     public readonly stderr: string,
33 ▶     public readonly exitCode: number | null,
34 │   ) {
35 │     super(message);
36 │   }
37 │ }
38 │ 
39 │ /**
40 │  * Represents structured information about an error returned by a package manager command.
41 │  * This is a data interface, not an `Error` subclass.
42 │  */
43 ▶ export interface ErrorInfo {
44 │   /** A specific error code (e.g. 'E404', 'EACCES'). */
45 ▶   readonly code: string;
46 │ 
47 │   /** A short, human-readable summary of the error. */
48 ▶   readonly summary: string;
49 │ 
50 │   /** An optional, detailed description of the error. */
51 ▶   readonly detail?: string;
52 │ }
```

`PackageManagerError` は stdout・stderr・終了コードを持ち、第 1 回の `handler` の 131〜135 行目が「Error: Package installation failed: …」と `Output:` の形で出します。`ErrorInfo`（43〜52 行目）は parser が返す「構造のあるエラー」で、例外ではありません。

> **🧪 DEMO — 4 種類のパッケージマネージャーで動かした記録**
>
> 「1」は `package.json`・`angular.json`・lockfile の組み合わせごとに場所を作り直し、`NG_DEBUG=1 ng version` の debug の行と表の Package Manager の行を抜き出したものです。「2」「3」は `PackageManager` を直接呼ぶ記録の道具（`pm-drive.cjs`）の出力で、`dist` は 22.2.7、`base` は 44129f66a3 の実装です。「3」はレジストリを本当に読み、→ の右が戻り値（manifest は名前・版・peer の数などに縮めた）です。標準エラーは左に印を付けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-package-managers)

## ここまでの呼び出し（pnpm-lock.yaml のあるワークスペースで ng add の版を調べるまで）

- 👤 `$ ng add @angular/cdk` — lib/cli → runCommand
  - `getConfiguredPackageManager(root, workspace, global)` — command-runner.ts L192 — *package.json → angular.json → グローバル*
  - `createPackageManager({ cwd, dryRun, configuredPackageManager })` — factory.ts L128
    - `determinePackageManager(…)` — L64 — *設定が無ければ discover*
      - `discover(host, cwd)` — discovery.ts L92 — *findLockfiles → PACKAGE\_MANAGER\_PRECEDENCE*
    - `getPackageManagerVersion(…)` — factory.ts L35 — *失敗は initializationError に*
  - `packageManager.getManifest('@angular/cdk@latest')` — package-manager.ts L560 — *ng add の 363 行目（第 5 回）*
    - `getRegistryManifest(name, 'latest')` — L515
      - `#fetchAndParse(['view', '--json', …], parser, { cache })` — L242
        - `#run(args)` → `host.runCommand('pnpm', args)` — L187 → host.ts L118 — *dryRun なら走らせない*
        - `getError(stdout) ?? getError(stderr)` — L281〜283 — *E404 だけが「無い」*
        - `parseNpmLikeManifest(stdout)` — parsers.ts L291

## テストと直し方

| ファイル（src/package-managers/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `discovery_spec.ts` | `discover`（12）› 11 の it（13〜104）。`should apply precedence when multiple lockfiles are found`（40）・`should stop searching at a .git boundary`（49）・`should prioritize the closest lockfile, regardless of precedence`（76） | 2 節の上へのたどり方と順。`factory.ts` の設定との優先と yarn の分け方の spec は無い |
| `package-manager_spec.ts` | `PackageManager`（13）› `getRegistryManifest`（23）・`getVersion`（59）・`acquireTempPackage`（89）・`getRegistryMetadata`（345）・`initializationError`（381）・`getMinimumReleaseAge`（409） | 引用の符号の付け方（24・41）、一時ディレクトリの設定ファイルの写し方。`install` の引数と dryRun の振る舞いは無い（22.2.7 で 551 行の spec を足した） |
| `parsers_spec.ts` | `parsers`（24）› `parseNpmLikeError`（177）・`parseNpmLikeManifest`（287）・`parseYarnClassicManifest`（409）ほか 13 の describe | 4 節の parser。`ERR_PNPM_*` が「無い」になるか、yarn 1 系が無い版に返す文書を確かめる it は無い |

📄 `走らせたコマンド（2026-11-24）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=discover"
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=PackageManager"
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=parse"
（結果は下の段落）
```

手元の bazel で、名前で絞ると `discover` は 12 specs、`PackageManager` は 27 specs、`parse` は 57 specs で、どれも 0 failures でした（全体は 257 specs）。spec の `MockHost`（testing/mock-host.ts）はコマンドを走らせないので、上の記録のような本物の出力は spec の中にはありません。

直すとしたら、`package-manager.ts` の `#run`（215〜221 行目）で、`dryRun` でも読むだけのコマンド（`getManifestCommand`・`versionCommand`・`listDependenciesCommand`）は走らせる引数を足し、`#fetchAndParse` からそれを使います。spec は package-manager\_spec.ts に「dryRun でも getRegistryManifest は host.runCommand を呼ぶ」を足します。pnpm の「無い」は、`package-manager-descriptor.ts` の pnpm の `isNotFound` を `E404`・`ERR_PNPM_FETCH_404`・`ERR_PNPM_PACKAGE_NOT_FOUND` にし、parsers\_spec.ts の 178 行目の it の名前を pnpm に直して `isNotFound` の確かめを足します。yarn 1 系は `parseYarnClassicManifest` で、`data` に `versions` があり聞いた版がその中に無ければ `null` にします。

## 聞かれそうな質問

**Q. pnpm-lock.yaml があるのに npm が使われます。**

`package.json` の `packageManager` 欄か `angular.json` の `cli.packageManager` が npm だからです。設定は lockfile より強く（factory.ts L78〜80、command-runner.ts L200〜218）、`ng new` は両方に書きます。

**Q. lockfile が 2 つあるとどれになりますか？**

同じディレクトリなら pnpm → yarn → bun → npm の順です（descriptor の L347〜352）。違うディレクトリなら、今の場所から上へたどって先に見つかった方で、`.git` のある所で止まります（discovery.ts L101〜129、記録）。

**Q. `packageManager` 欄に `deno@2.0.0` と書いたら `ng` が全部動かなくなりました。**

`createPackageManager` の 143〜145 行目が descriptor の無い名前で例外を投げ、`runCommand` がどのコマンドでも最初にこれを呼ぶからです（記録の cnpm は終了コード 127）。

**Q. `ng add` はパッケージの postinstall のスクリプトを走らせますか？**

走らせません。`add` の 5 つ目の引数 `true`（ng add の 663 行目）で `--ignore-scripts`（yarn 4 は `--mode=skip-build`）が付きます（記録）。`install` は 44129f66a3 では引数を渡すと付かず、22.2.7 と main では付きます。

**Q. 無いパッケージを聞いたとき、どのパッケージマネージャーでも同じ答えになりますか？**

なりません。22.2.7 で、npm・yarn 4・bun・yarn 1 系は `null`、pnpm 12 は `ERR_PNPM_FETCH_404` が `E404` でないので例外でした。無い版は、yarn 1 系だけが `version: "99.0.0"` の文書を返しました（記録）。

## 読み終えて

- 使うパッケージマネージャーは、`package.json` の欄 → `angular.json`（プロジェクト → ワークスペース）→ グローバル → lockfile（上へ、`.git` で止まる、pnpm → yarn → bun → npm）→ npm の順。yarn だけは版で 1 系と分ける。
- 知らない名前を設定すると、どのコマンドも「Unsupported package manager」で止まる。入っていないときはコマンドを走らせる時まで止めない。
- descriptor は 5 つの独立した表。npm と pnpm の `--save-tilde` は本物では効かない・失敗するが、今は呼ぶ人がいない。
- 「無い」は `E404` だけで、pnpm 12 の `ERR_PNPM_*` は失敗になる。yarn 1 系は無い版をあると答える。yarn 4 と bun の同じ穴は 22.2.7 と main で直った。
- `dryRun` の `PackageManager` はレジストリを読むコマンドも走らせず、`--dry-run` を付けたコマンドに渡るので `ng add --dry-run` が止まる。

---

← 前: [angular.json と設定：config・json-file・completion](03-ngx-config.md)  
次: [ng add：パッケージを入れて ng-add の schematic を走らせる](05-ngx-add.md) →
