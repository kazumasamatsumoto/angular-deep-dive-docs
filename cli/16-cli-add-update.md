[目次](../README.md) › [CLI とビルド](README.md) › 第 16 回 / 全 16 回

# ng add と ng update：パッケージを入れて、migrations を走らせる

> ng add がパッケージのバージョンを決めてインストールし、そのパッケージの ng-add schematic を走らせる行。ng update が package.json と registry を比べて更新の組（packageGroup）を決め、インストールの後に migration-collection.json の migrations をバージョンの範囲で選んで走らせる行。@schematics/angular の migrations の例。package.json の書き換えは Tree を通さず直接書き、インストールに失敗したら戻すこと、ng add --dry-run はインストールしないこと。

angular/angular-cli · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cli-add-update)

---

`ng add` と `ng update` は、どちらも「パッケージを入れる」部分と「schematic を走らせる」部分の 2 段でできています。この章では、`ng add` がバージョンを決めてインストールし、そのパッケージの `ng-add` schematic を走らせる行と、`ng update` が package.json と registry を比べて一緒に上げるパッケージの組（packageGroup）を決め、インストールの後に migration をバージョンの範囲で選んで走らせる行を読みます。schematic の実行そのもの（Tree と sink）は[第 13 回](13-schematics.md)で読んだものと同じです。

読む対象は angular-cli リポジトリの `packages/angular/cli/src/commands/add/cli.ts`・`commands/update/cli.ts`・`update/update-resolver.ts`・`update/utilities/migration.ts`・`update/utilities/cli-version.ts`・`package-managers/package-manager.ts`、`packages/schematics/angular/migrations/`、各パッケージの `package.json` の `ng-add` / `ng-update`（`@angular/cli`、angular リポジトリの `@angular/core`・`@angular/localize`）です。

1. [1. 概観](01-cli-overview.md)
2. [2. ng build の段取り](02-build.md)
3. [3. AotCompilation](03-cli-angular-compilation.md)
4. [4. コンポーネントのスタイル](04-cli-component-styles.md)
5. [5. oxc の変換](05-cli-javascript-transformer.md)
6. [6. リンカー](06-cli-linker.md)
7. [7. 遅延チャンク](07-cli-code-splitting.md)
8. [8. budgets](08-cli-budgets.md)
9. [9. i18n](09-cli-i18n.md)
10. [10. 再ビルドとキャッシュ](10-cli-cache-watch.md)
11. [11. HMR](11-cli-hmr.md)
12. [12. unit-test と Vitest](12-cli-unit-test.md)
13. [13. Tree と sink](13-schematics.md)
14. [14. Rule の組み立て](14-schematics-rules.md)
15. [15. ng generate component](15-schematics-component.md)
16. **16. ng add と ng update**（この章）

## 0. 全体の流れ

### ng add &lt;pkg&gt;

1. **入っていれば schematic だけ**

   既に入っていて指定の版を満たせば、インストールを飛ばす（1 節）。
2. **registry から版を決める**

   版を書かなければ、まず `latest`。プロジェクトの依存と peerDependencies が合わなければ、各メジャーの最新を新しい順に試す（2 節）。
3. **インストール**

   パッケージマネージャの add。`package.json` の `ng-add.save` で dependencies / devDependencies / 一時フォルダを選ぶ（3 節）。
4. **ng-add schematic**

   インストールしたパッケージのコレクションから `ng-add` を取り出し、`runSchematic` で実行 → Tree → sink（4 節）。

### ng update &lt;pkg&gt;

1. **現在と目標の版**

   package.json の依存を集め、目標は registry の `latest`。メジャーを 2 つ以上またぐ更新は拒否（5 節）。
2. **一緒に上げる組を決める**

   目標の版の `ng-update.packageGroup` と peerDependencies を足していき、増えなくなるまで繰り返す。peerDependencies を検査（6 節）。
3. **package.json を書き換えてインストール**

   これは Tree を通らずに直接書く。失敗したら package.json を戻す（7 節）。
4. **migrations を選んで走らせる**

   `ng-update.migrations` のコレクションの各 schematic の `version` が「現在 &lt; version ≤ 目標」なら実行（8〜9 節）。

## 1. ng add は「ng-add という名前の schematic」を走らせるコマンド

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L97–106 （▶ の行: 98, 101, 104–105）

```ts
 97 │ export default class AddCommandModule
 98 ▶   extends SchematicsCommandModule
 99 │   implements CommandModuleImplementation<AddCommandArgs>
100 │ {
101 ▶   command = 'add <collection>';
102 │   describe = 'Adds support for an external library to your project.';
103 │   longDescriptionPath = join(__dirname, 'long-description.md');
104 ▶   protected override allowPrivateSchematics = true;
105 ▶   private readonly schematicName = 'ng-add';
106 │   private rootRequire = createRequire(this.context.root + '/');
```

98 行目、`AddCommandModule` は `ng generate` と同じ `SchematicsCommandModule` を継承しています。105 行目、走らせる schematic の名前は固定で `ng-add`。104 行目、private（collection.json で `"private": true`）な schematic も呼べるようにしています。多くのパッケージは `ng-add` を private にして、`ng generate` の一覧に出ないようにしているからです。

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L183–195 （▶ の行: 184–186, 188, 193）

```ts
183 │     if (
184 ▶       packageIdentifier.name &&
185 ▶       packageIdentifier.registry &&
186 ▶       this.isPackageInstalled(packageIdentifier.name)
187 │     ) {
188 ▶       const validVersion = await this.isProjectVersionValid(packageIdentifier);
189 │       if (validVersion) {
190 │         // Already installed so just run schematic
191 │         logger.info('Skipping installation: Package already installed');
192 │ 
193 ▶         return this.executeSchematic({ ...options, collection: packageIdentifier.name });
194 │       }
195 │     }
```

184〜186 行目、registry のパッケージで、もう `node_modules` から解決できるなら、188 行目で指定の版を満たすかを確かめ、満たせば 193 行目で**インストールせずに schematic だけ**を走らせます。もう一度 `ng add` し直すと設定だけがやり直されるのはこの分岐です。

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L205–243 （▶ の行: 208, 214–215, 220, 225–226, 231, 233–234）

```ts
205 │     const tasks = new Listr<AddCommandTaskContext>(
206 │       [
207 │         {
208 ▶           title: 'Determining Package Manager',
209 │           task: (_context, task) =>
210 │             (task.output = `Using package manager: ${color.dim(this.context.packageManager.name)}`),
211 │           rendererOptions: { persistentOutput: true },
212 │         },
213 │         {
214 ▶           title: 'Searching for compatible package version',
215 ▶           enabled: packageIdentifier.type === 'range' && packageIdentifier.rawSpec === '*',
216 │           task: (context, task) => this.findCompatiblePackageVersionTask(context, task, options),
217 │           rendererOptions: { persistentOutput: true },
218 │         },
219 │         {
220 ▶           title: 'Loading package information',
221 │           task: (context, task) => this.loadPackageInfoTask(context, task, options),
222 │           rendererOptions: { persistentOutput: true },
223 │         },
224 │         {
225 ▶           title: 'Confirming installation',
226 ▶           enabled: !skipConfirmation && !options.dryRun,
227 │           task: (context, task) => this.confirmInstallationTask(context, task),
228 │           rendererOptions: { persistentOutput: true },
229 │         },
230 │         {
231 ▶           title: 'Installing package',
232 │           skip: (context) => {
233 ▶             if (context.dryRun) {
234 ▶               return `Skipping package installation. Would install package ${color.blue(
235 │                 context.packageIdentifier.toString(),
236 │               )}.`;
237 │             }
238 │ 
239 │             return false;
240 │           },
241 │           task: (context, task) => this.installPackageTask(context, task, options),
242 │           rendererOptions: { bottomBar: Infinity },
243 │         },
```

画面に出る 5 つのタスク（listr2）がここで並びます。215 行目、「Searching for compatible package version」は**版を書かなかったときだけ**（`rawSpec === '*'`）。`ng add @angular/material@20` と書けばその範囲がそのまま使われます。226 行目、確認のプロンプトは `--skip-confirmation` か `--dry-run` で出ません。233〜236 行目、`--dry-run` ではインストールを飛ばします。

## 2. 版を決める：latest と peerDependencies

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L361–381 （▶ の行: 363, 368–370, 375）

```ts
361 │     // Attempt to use the 'latest' tag from the registry.
362 │     try {
363 ▶       const latestManifest = await packageManager.getManifest(`${packageName}@latest`, {
364 │         registry,
365 │       });
366 │ 
367 │       if (latestManifest) {
368 ▶         const conflicts = await this.getPeerDependencyConflicts(latestManifest);
369 ▶         if (!conflicts) {
370 ▶           context.packageIdentifier = npa.resolve(latestManifest.name, latestManifest.version);
371 │           task.output = `Found compatible package version: ${color.blue(latestManifest.version)}.`;
372 │ 
373 │           return;
374 │         }
375 ▶         rejectionReasons.push(...conflicts);
376 │       }
377 │     } catch (e) {
378 │       assertIsError(e);
379 │       throw new CommandError(`Unable to load package information from registry: ${e.message}`);
380 │     }
381 │ 
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L849–880 （▶ の行: 849, 852, 859, 866, 872–874, 876）

```ts
849 ▶     const checks = Object.entries(manifest.peerDependencies).map(async ([peer, range]) => {
850 │       let peerIdentifier;
851 │       try {
852 ▶         peerIdentifier = npa.resolve(peer, range);
853 │       } catch {
854 │         this.context.logger.warn(`Invalid peer dependency ${peer} found in package.`);
855 │ 
856 │         return null;
857 │       }
858 │ 
859 ▶       if (peerIdentifier.type !== 'version' && peerIdentifier.type !== 'range') {
860 │         // type === 'tag' | 'file' | 'directory' | 'remote' | 'git'
861 │         // Cannot accurately compare these as the tag/location may have changed since install.
862 │         return null;
863 │       }
864 │ 
865 │       try {
866 ▶         const version = await this.findProjectVersion(peer);
867 │         if (!version) {
868 │           return null;
869 │         }
870 │ 
871 │         const options = { includePrerelease: true };
872 ▶         if (
873 ▶           !intersects(version, peerIdentifier.rawSpec, options) &&
874 ▶           !satisfies(version, peerIdentifier.rawSpec, options)
875 │         ) {
876 ▶           return (
877 │             `Package "${manifest.name}@${manifest.version}" has an incompatible peer dependency to "` +
878 │             `${peer}@${peerIdentifier.rawSpec}" (requires "${version}" in project).`
879 │           );
880 │         }
```

1. **まず latest（363 行目）**

   `pkg@latest` の manifest（その版の package.json）を registry から取ります。
2. **peerDependencies を今のプロジェクトと比べる（849〜880 行目）**

   849 行目、相手の `peerDependencies` を 1 つずつ見て、866 行目でプロジェクトに入っている版を探し、872〜874 行目で範囲が交わらず満たしもしなければ 876 行目の文言で「合わない」とします。プロジェクトに入っていない peer は数えません（867〜869 行目）。
3. **合えば決まり（369〜373 行目）**

   合わなければ 375 行目で理由を貯め、その先で registry の全版を取り、プレリリースと除外の版を落として、**各メジャーの最新を新しい順に**同じ検査にかけます。それでも無ければ全版を新しい順に試します。

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L546–560 （▶ の行: 549, 553, 557–559）

```ts
546 │     // Avoid fully resolving the package version from the registry again in later steps
547 │     if (context.packageIdentifier.registry) {
548 │       assert(context.packageIdentifier.name, 'Registry package identifier must have a name');
549 ▶       context.packageIdentifier = npa.resolve(
550 │         context.packageIdentifier.name,
551 │         // `save-prefix` option is ignored by some package managers so the caret is needed to ensure
552 │         // that the value in the project package.json is correct.
553 ▶         (context.isExactVersion ? '' : '^') + manifest.version,
554 │       );
555 │     }
556 │ 
557 ▶     context.hasSchematics = !!manifest.schematics;
558 ▶     context.savePackage = manifest['ng-add']?.save;
559 ▶     context.collectionName = manifest.name;
560 │     context.homepage = manifest.homepage;
```

決まった版の manifest をもう一度読み、553 行目、版を書いていなければ `^` を付けた範囲（`^20.1.0` など）にします。package.json に書かれる値がこれです。557 行目で `schematics` フィールドがあるか（schematics のパッケージか。[第 15 回](15-schematics-component.md)の 2 節）、558 行目で `ng-add.save` を読みます。

## 3. インストール：ng-add.save

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L638–668 （▶ の行: 638, 643, 656, 658, 660–661, 663）

```ts
638 ▶     if (context.savePackage === false) {
639 │       task.title += ' in temporary location';
640 │ 
641 │       // Temporary packages are located in a different directory
642 │       // Hence we need to resolve them using the temp path
643 ▶       const { workingDirectory } = await packageManager.acquireTempPackage(
644 │         packageIdentifier.toString(),
645 │         {
646 │           registry,
647 │         },
648 │       );
649 │ 
650 │       const tempRequire = createRequire(workingDirectory + '/');
651 │       assert(context.collectionName, 'Collection name should always be available');
652 │       const resolvedCollectionPath = tempRequire.resolve(
653 │         join(context.collectionName, 'package.json'),
654 │       );
655 │ 
656 ▶       context.collectionName = dirname(resolvedCollectionPath);
657 │     } else {
658 ▶       await packageManager.add(
659 │         packageIdentifier.toString(),
660 ▶         'none',
661 ▶         savePackage === 'devDependencies',
662 │         false,
663 ▶         true,
664 │         {
665 │           registry,
666 │         },
667 │       );
668 │     }
```

📄 `angular-cli/packages/angular/cli/src/package-managers/package-manager.ts` L338–357 （▶ の行: 340–341, 343, 347, 351, 355）

```ts
338 │   async add(
339 │     packageName: string,
340 ▶     save: 'exact' | 'tilde' | 'none',
341 ▶     asDevDependency: boolean,
342 │     noLockfile: boolean,
343 ▶     ignoreScripts: boolean,
344 │     options: { registry?: string } = {},
345 │   ): Promise<void> {
346 │     const flags = [
347 ▶       asDevDependency ? this.descriptor.saveDevFlag : '',
348 │       save === 'exact' ? this.descriptor.saveExactFlag : '',
349 │       save === 'tilde' ? this.descriptor.saveTildeFlag : '',
350 │       noLockfile ? this.descriptor.noLockfileFlag : '',
351 ▶       ignoreScripts ? this.descriptor.ignoreScriptsFlag : '',
352 │     ].filter((flag) => flag);
353 │ 
354 │     const specifier = this.host.requiresQuoting ? `"${packageName}"` : packageName;
355 ▶     const args = [this.descriptor.addCommand, specifier, ...flags];
356 │ 
357 │     await this.#run(args, options);
```

| package.json の `ng-add.save` | 何が起きるか |
| --- | --- |
| 書いていない / `"dependencies"` | 658〜667 行目、`add(pkg, 'none', false, …)`。`dependencies` に `^` 付きで入る |
| `"devDependencies"` | 661 行目が `true` になり、347 行目でマネージャの `--save-dev` 相当の旗が付く |
| `false` | 638〜656 行目、プロジェクトに入れずに一時フォルダへ取得し、そこからコレクションを読む。schematic を走らせたら終わり |

663 行目の 5 番目の引数 `true` は 343 行目の `ignoreScripts` で、351 行目で `--ignore-scripts` 相当が付きます。**インストール時のパッケージのスクリプトは走りません**。設定の変更は次の `ng-add` schematic の仕事です。実例として、`@angular/localize` の package.json です。

📄 `angular/packages/localize/package.json` L25–31 （▶ の行: 25, 29–30）

```json
25 ▶   "schematics": "./schematics/collection.json",
26 │   "ng-update": {
27 │     "packageGroup": "NG_UPDATE_PACKAGE_GROUP"
28 │   },
29 ▶   "ng-add": {
30 ▶     "save": "devDependencies"
31 │   },
```

25 行目の `schematics` でコレクション（その中に `ng-add`）を持ち、29〜30 行目で devDependencies に入れるよう指定しています。

## 4. ng-add schematic を走らせる

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L272–286 （▶ の行: 273–275, 281, 283）

```ts
272 │       // Check if the installed package has actual add actions and not just schematic support
273 ▶       if (result.hasSchematics && !options.dryRun) {
274 ▶         const workflow = this.getOrCreateWorkflowForBuilder(result.collectionName);
275 ▶         const collection = workflow.engine.createCollection(result.collectionName);
276 │ 
277 │         // listSchematicNames cannot be used here since it does not list private schematics.
278 │         // Most `ng-add` schematics are marked as private.
279 │         // TODO: Consider adding a `hasSchematic` helper to the schematic collection object.
280 │         try {
281 ▶           collection.createSchematic(this.schematicName, true);
282 │         } catch {
283 ▶           result.hasSchematics = false;
284 │         }
285 │       }
286 │ 
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L320–335 （▶ の行: 320–321, 323, 326, 328, 331–332）

```ts
320 ▶       if (options.dryRun) {
321 ▶         logger.info("The package's `ng add` actions would be executed next.");
322 │ 
323 ▶         return;
324 │       }
325 │ 
326 ▶       const schematicExitCode = await this.executeSchematic({
327 │         ...options,
328 ▶         collection: result.collectionName,
329 │       });
330 │ 
331 ▶       if (shouldCleanUp) {
332 ▶         await this.cleanUpTemporaryDependency(result.collectionName);
333 │       }
334 │ 
335 │       return schematicExitCode;
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L728–756 （▶ の行: 731, 739, 741, 744, 746–747）

```ts
728 │   private executeSchematic(
729 │     options: Options<AddCommandArgs> & OtherOptions & { schematicName?: string },
730 │   ): Promise<number | void> {
731 ▶     const {
732 │       verbose,
733 │       skipConfirmation,
734 │       interactive,
735 │       force,
736 │       dryRun,
737 │       registry,
738 │       defaults,
739 ▶       collection: collectionName,
740 │       schematicName,
741 ▶       ...schematicOptions
742 │     } = options;
743 │ 
744 ▶     return this.runSchematic({
745 │       schematicOptions,
746 ▶       schematicName: schematicName ?? this.schematicName,
747 ▶       collectionName,
748 │       executionOptions: {
749 │         interactive,
750 │         force,
751 │         dryRun,
752 │         defaults,
753 │         packageRegistry: registry,
754 │       },
755 │     });
756 │   }
```

1. **ng-add があるか（273〜285 行目）**

   インストールしたパッケージのコレクションを作り、281 行目で `ng-add` を取り出せるか試します（private も取れる `true`）。無ければ 283 行目で「schematic 無し」にし、Tailwind など一部のパッケージは CLI 内蔵の schematic に回ります。
2. **--dry-run なら走らせない（320〜323 行目）**

   「``The package's `ng add` actions would be executed next.``」と出して終わります。`ng add --dry-run` は**インストールも ng-add も実行しない**ので、何のファイルが変わるかは出ません。
3. **実行（326〜329 行目 → 744〜755 行目）**

   731〜742 行目で CLI 自身のオプションを外し、残りを schematic のオプションにして、746 行目で `schematicName ?? 'ng-add'`。[第 15 回](15-schematics-component.md)の 8 節と同じ `runSchematic` です。
4. **一時インストールの片付け（331〜333 行目）**

   `ng-add.save: false` のときは、終わったら package.json と node\_modules から消します。

> [!NOTE]
> **ポイント**
>
> インストール（3 節）は `npm install` などのプロセスが直接 `package.json` と `node_modules` を書き換えます。Tree と sink（第 13 回）を通るのは、4 節の `ng-add` schematic が行う変更だけです。したがって「ng-add の途中で衝突して止まった」場合、パッケージはインストール済みで、設定ファイルは何も変わっていない状態になります。

## 5. ng update：現在と目標の版

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L214–245 （▶ の行: 216–218, 233, 236–237, 241–242）

```ts
214 │         // Wildcard uses the next tag if next option is used otherwise use latest tag.
215 │         // Wildcard is present if no selector is provided on the command line.
216 ▶         if (packageIdentifier.rawSpec === '*') {
217 ▶           packageIdentifier.fetchSpec = options.next ? 'next' : 'latest';
218 ▶           packageIdentifier.type = 'tag';
219 │         }
220 │ 
221 │         packages.push(packageIdentifier);
222 │       } catch (e) {
223 │         assertIsError(e);
224 │         logger.error(e.message);
225 │ 
226 │         return 1;
227 │       }
228 │     }
229 │ 
230 │     logger.info(`Using package manager: ${colors.gray(packageManager.name)}`);
231 │     logger.info('Collecting installed dependencies...');
232 │ 
233 ▶     const rootDependencies = await packageManager.getProjectDependencies();
234 │     logger.info(`Found ${rootDependencies.size} dependencies.`);
235 │ 
236 ▶     const workflow = new NodeWorkflow(this.context.root, {
237 ▶       packageManager: packageManager.name,
238 │       packageManagerForce: await shouldForcePackageManager(packageManager, logger, options.verbose),
239 │       // __dirname -> favor @schematics/update from this package
240 │       // Otherwise, use packages from the active workspace (migrations)
241 ▶       resolvePaths: this.resolvePaths,
242 ▶       schemaValidation: true,
243 │       engineHostCreator: (options) => new SchematicEngineHost(options.resolvePaths),
244 │     });
245 │ 
```

216〜218 行目、`ng update @angular/core` のように版を書かなければ、目標はタグ `latest`（`--next` なら `next`）。233 行目でプロジェクトの依存（package.json と、入っている版）を集めます。236〜244 行目で migration 用の `NodeWorkflow` を作ります。`ng generate` の 3 節のような `dryRun` は渡していません。`ng update` に `--dry-run` は無いからです。

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L482–516 （▶ の行: 482, 487, 489–490, 492, 512, 516）

```ts
482 ▶       if (manifest.version === node.version) {
483 │         logger.info(`Package '${packageName}' is already up to date.`);
484 │         continue;
485 │       }
486 │ 
487 ▶       if (ANGULAR_PACKAGES_REGEXP.test(node.name)) {
488 │         const { name, version } = node;
489 ▶         const toBeInstalledMajorVersion = +manifest.version.split('.')[0];
490 ▶         const currentMajorVersion = +version.split('.')[0];
491 │ 
492 ▶         if (toBeInstalledMajorVersion - currentMajorVersion > 1) {
493 │           // Only allow updating a single version at a time.
494 │           if (currentMajorVersion < 6) {
495 │             // Before version 6, the major versions were not always sequential.
496 │             // Example @angular/core skipped version 3, @angular/cli skipped versions 2-5.
497 │             logger.error(
498 │               `Updating multiple major versions of '${name}' at once is not supported. Please migrate each major version individually.\n` +
499 │                 `For more information about the update process, see https://update.angular.dev/.`,
500 │             );
501 │           } else {
502 │             const nextMajorVersionFromCurrent = currentMajorVersion + 1;
503 │ 
504 │             logger.error(
505 │               `Updating multiple major versions of '${name}' at once is not supported. Please migrate each major version individually.\n` +
506 │                 `Run 'ng update ${name}@${nextMajorVersionFromCurrent}' in your workspace directory ` +
507 │                 `to update to latest '${nextMajorVersionFromCurrent}.x' version of '${name}'.\n\n` +
508 │                 `For more information about the update process, see https://update.angular.dev/?v=${currentMajorVersion}.0-${nextMajorVersionFromCurrent}.0`,
509 │             );
510 │           }
511 │ 
512 ▶           return 1;
513 │         }
514 │       }
515 │ 
516 ▶       packagesToUpdate.push(requestIdentifier.toString());
```

482 行目、目標と今が同じなら飛ばします。487〜492 行目、`@angular/*`（と CLI 関係）のパッケージは、**メジャーを 2 つ以上またぐ更新を拒否**して 512 行目で終わります。v20 から v22 へは、まず `ng update @angular/core@21` です。

## 6. 一緒に上げる組：packageGroup と peerDependencies

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L944–970 （▶ の行: 948, 952, 954, 958, 965, 967, 970）

```ts
944 │   if (packages.size === 0) {
945 │     await Promise.all(Array.from(npmDeps.keys(), (depName) => getOrFetchPackageMetadata(depName)));
946 │   } else {
947 │     let lastPackagesSize;
948 ▶     do {
949 │       lastPackagesSize = packages.size;
950 │ 
951 │       let lastGroupSize;
952 ▶       do {
953 │         lastGroupSize = packages.size;
954 ▶         for (const name of Array.from(packages.keys())) {
955 │           const metadata = await getOrFetchPackageMetadata(name);
956 │           const spec = packages.get(name);
957 │           if (metadata && spec) {
958 ▶             const resolvedVersion = await resolvePackageVersion(
959 │               registryClient,
960 │               metadata,
961 │               spec,
962 │               !!options.next,
963 │             );
964 │             if (resolvedVersion) {
965 ▶               packages.set(name, resolvedVersion as VersionRange);
966 │             }
967 ▶             await _addPackageGroup(packages, npmDeps, metadata, registryClient, logger);
968 │           }
969 │         }
970 ▶       } while (packages.size > lastGroupSize);
```

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L671–709 （▶ の行: 671, 676, 679, 685, 702–703, 706–707）

```ts
671 ▶   const packageGroup = ngUpdateMetadata['packageGroup'];
672 │   if (!packageGroup) {
673 │     return;
674 │   }
675 │   let packageGroupNormalized: Record<string, string>;
676 ▶   if (Array.isArray(packageGroup) && !packageGroup.some((x) => typeof x != 'string')) {
677 │     packageGroupNormalized = packageGroup.reduce(
678 │       (acc, curr) => {
679 ▶         acc[curr] = version;
680 │ 
681 │         return acc;
682 │       },
683 │       {} as Record<string, string>,
684 │     );
685 ▶   } else if (typeof packageGroup === 'object' && packageGroup !== null) {
686 │     packageGroupNormalized = Object.entries(packageGroup).reduce(
687 │       (acc, [name, v]) => {
688 │         if (typeof v === 'string') {
689 │           acc[name] = v;
690 │         }
691 │ 
692 │         return acc;
693 │       },
694 │       {} as Record<string, string>,
695 │     );
696 │   } else {
697 │     logger.warn(`PackageGroup metadata for ${metadata.name} is malformed. Ignoring.`);
698 │ 
699 │     return;
700 │   }
701 │ 
702 ▶   for (const [member, memberVersion] of Object.entries(packageGroupNormalized)) {
703 ▶     if (packages.has(member)) {
704 │       continue;
705 │     }
706 ▶     if (allDependencies.has(member)) {
707 ▶       packages.set(member, memberVersion as VersionRange);
708 │     }
709 │   }
```

1. **指定された版を解く（958〜965 行目）**

   タグや範囲を、registry の具体的な版に置き換えます。
2. **packageGroup を足す（967 行目 → 671〜709 行目）**

   目標の版の package.json の `ng-update.packageGroup` を読み、676〜684 行目、配列なら全員に**同じ版**を、685〜695 行目、オブジェクトなら書かれた版を割り当てます。706〜707 行目、**プロジェクトの依存にあるものだけ**を更新の組に足します。
3. **増えなくなるまで（952〜970 行目）**

   足したパッケージにも packageGroup があるかもしれないので、組の大きさが変わらなくなるまで繰り返します。その外側（948 行目からの `do`）で同じように peerDependencies を足し、これも増えなくなるまで繰り返します。

packageGroup は各パッケージの package.json に書かれています。

📄 `angular/packages/core/package.json` L43–46 （▶ の行: 44–45）

```json
43 │   "ng-update": {
44 ▶     "migrations": "./schematics/migrations.json",
45 ▶     "packageGroup": "NG_UPDATE_PACKAGE_GROUP"
46 │   },
```

📄 `angular/tools/bazel/npm_packages.bzl` L6–33 （▶ の行: 8–11, 29–32）

```python
 6 │ # Packages which are versioned together on npm
 7 │ ANGULAR_SCOPED_PACKAGES = ["@angular/%s" % p for p in [
 8 ▶     # core should be the first package because it's the main package in the group
 9 ▶     # this is significant for Angular CLI and "ng update" specifically, @angular/core
10 ▶     # is considered the identifier of the group by these tools.
11 ▶     "core",
12 │     "bazel",
13 │     "common",
14 │     "compiler",
15 │     "compiler-cli",
16 │     "animations",
17 │     "elements",
18 │     "platform-browser",
19 │     "platform-browser-dynamic",
20 │     "forms",
21 │     "platform-server",
22 │     "upgrade",
23 │     "router",
24 │     "language-service",
25 │     "localize",
26 │     "service-worker",
27 │ ]]
28 │ 
29 ▶ PKG_GROUP_REPLACEMENTS = {
30 ▶     "\"NG_UPDATE_PACKAGE_GROUP\"": """[
31 ▶       %s
32 ▶     ]""" % ",\n      ".join(["\"%s\"" % s for s in ANGULAR_SCOPED_PACKAGES]),
33 │ }
```

📄 `angular-cli/packages/angular/cli/package.json` L30–42 （▶ の行: 31–35）

```json
30 │   "ng-update": {
31 ▶     "migrations": "@schematics/angular/migrations/migration-collection.json",
32 ▶     "packageGroup": {
33 ▶       "@angular/cli": "0.0.0-PLACEHOLDER",
34 ▶       "@angular/build": "0.0.0-PLACEHOLDER",
35 ▶       "@angular/ssr": "0.0.0-PLACEHOLDER",
36 │       "@angular-devkit/architect": "0.0.0-EXPERIMENTAL-PLACEHOLDER",
37 │       "@angular-devkit/build-angular": "0.0.0-PLACEHOLDER",
38 │       "@angular-devkit/build-webpack": "0.0.0-EXPERIMENTAL-PLACEHOLDER",
39 │       "@angular-devkit/core": "0.0.0-PLACEHOLDER",
40 │       "@angular-devkit/schematics": "0.0.0-PLACEHOLDER"
41 │     }
42 │   }
```

`@angular/core` のソースでは 45 行目が `"NG_UPDATE_PACKAGE_GROUP"` という文字列で、ビルド時に 29〜33 行目でパッケージ名の**配列**に置き換わります（このサイトの `node_modules/@angular/core/package.json` では `["@angular/core", "@angular/bazel", "@angular/common", …]` の 16 個）。配列なので 6 節の 679 行目で全員が同じ版になり、`ng update @angular/core` だけで、プロジェクトにある `@angular/router` や `@angular/forms` も揃って上がります。`@angular/cli` は 32〜41 行目のオブジェクト形で、31 行目の migrations は `@schematics/angular` の中を指しています。

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L230–250 （▶ の行: 230, 237–238, 240–241, 246）

```ts
230 ▶   for (const [peer, range] of Object.entries(peerDependencies)) {
231 │     const peerInfo = infoMap.get(peer);
232 │     if (!peerInfo) {
233 │       continue;
234 │     }
235 │ 
236 │     const isOptional = !!peerDependenciesMeta[peer]?.optional;
237 ▶     const resolvedRange = _updatePeerVersion(infoMap, peer, range);
238 ▶     const resolvedVersion = peerInfo.target ? peerInfo.target.version : peerInfo.installed.version;
239 │ 
240 ▶     if (!semver.satisfies(resolvedVersion, resolvedRange, { includePrerelease: true })) {
241 ▶       logger.error(
242 │         `Package ${JSON.stringify(name)} has an incompatible peer dependency to ` +
243 │           `${JSON.stringify(peer)} (requires ${JSON.stringify(range)}, ` +
244 │           `would install ${JSON.stringify(resolvedVersion)}).`,
245 │       );
246 ▶       error = error || !isOptional;
247 │     }
248 │   }
249 │ 
250 │   return error;
```

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L298–315 （▶ の行: 305–307, 310–311）

```ts
298 │   for (const name of infoMap.keys()) {
299 │     const info = infoMap.get(name);
300 │     if (!info || !info.target) {
301 │       continue;
302 │     }
303 │ 
304 │     logger.debug(`Checking ${name}...`);
305 ▶     error = _validateForwardPeerDependencies(name, infoMap, logger) || error;
306 ▶     error =
307 ▶       _validateReversePeerDependencies(name, info.target.version, infoMap, logger, next) || error;
308 │   }
309 │ 
310 ▶   if (error && !force) {
311 ▶     throw new Error(
312 │       'Incompatible peer dependencies found. See above for details. ' +
313 │         'You can bypass this check using the --force option.',
314 │     );
315 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/update/update-resolver.ts` L1025–1049 （▶ の行: 1031, 1037, 1039, 1042–1044）

```ts
1025 │   const packagesToUpdate = new Map<string, string>();
1026 │   const migrationsToRun: { package: string; collection: string; from: string; to: string }[] = [];
1027 │ 
1028 │   if (packages.size > 0) {
1029 │     if (!(options.migrateOnly && options.from && options.packages)) {
1030 │       const sublog = new logging.LevelCapLogger('validation', logger.createChild(''), 'warn');
1031 ▶       _validateUpdatePackages(packageInfoMap, !!options.force, !!options.next, sublog);
1032 │ 
1033 │       for (const [name, info] of packageInfoMap.entries()) {
1034 │         if (!info.target || !info.installed) {
1035 │           continue;
1036 │         }
1037 ▶         packagesToUpdate.set(name, info.target.version);
1038 │ 
1039 ▶         if (info.target.updateMetadata.migrations) {
1040 │           migrationsToRun.push({
1041 │             package: name,
1042 ▶             collection: info.target.updateMetadata.migrations,
1043 ▶             from: info.installed.version,
1044 ▶             to: info.target.version,
1045 │           });
1046 │         }
1047 │       }
1048 │     }
1049 │   }
```

305 行目、上げるパッケージの**新しい版の** peerDependencies が、他のパッケージの「上げた後の版（無ければ今の版）」を満たすか（238〜240 行目）。306〜307 行目、逆に、他のパッケージの peerDependencies が、このパッケージの新しい版を満たすか。どちらかで外れれば 310〜311 行目で止まります（`--force` で無視）。通れば 1037 行目で「何をどの版へ」、1039〜1046 行目で「目標の版に `ng-update.migrations` があれば、`from` = 今入っている版・`to` = 目標の版で migration を走らせる」と計画に書きます。

## 7. package.json を直接書き、インストールする

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L544–559 （▶ の行: 547, 553）

```ts
544 │     const packageJsonPath = path.join(this.context.root, 'package.json');
545 │     let originalPackageJsonContent: string | undefined;
546 │     try {
547 ▶       originalPackageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
548 │     } catch {
549 │       // Ignore backup errors.
550 │     }
551 │ 
552 │     try {
553 ▶       await applyUpdatePlan(this.context.root, plan, logger);
554 │     } catch (error) {
555 │       assertIsError(error);
556 │       logger.error(`Error updating package.json: ${error.message}`);
557 │ 
558 │       return 1;
559 │     }
```

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L590–627 （▶ の行: 594, 604, 607–609, 612, 614）

```ts
590 │       {
591 │         title: 'Installing packages',
592 │         async task() {
593 │           try {
594 ▶             await packageManager.install({
595 │               ignorePeerDependencies,
596 │             });
597 │           } catch (e) {
598 │             throw new CommandError('Unable to install packages');
599 │           }
600 │         },
601 │       },
602 │     ]);
603 │     try {
604 ▶       await tasks.run();
605 │       // Clear Node's module resolution path cache to prevent stale lookups
606 │       // when resolving migration package paths.
607 ▶       const Module = require('node:module');
608 ▶       if (Module && Module._pathCache) {
609 ▶         Module._pathCache = Object.create(null);
610 │       }
611 │     } catch (e) {
612 ▶       if (originalPackageJsonContent !== undefined) {
613 │         try {
614 ▶           await fs.writeFile(packageJsonPath, originalPackageJsonContent, 'utf8');
615 │           logger.info('Restored package.json to its original state.');
616 │         } catch (restoreError) {
617 │           assertIsError(restoreError);
618 │           logger.error(`Failed to restore package.json: ${restoreError.message}`);
619 │         }
620 │       }
621 │ 
622 │       if (e instanceof CommandError) {
623 │         return 1;
624 │       }
625 │ 
626 │       throw e;
627 │     }
```

547 行目で今の package.json を控え、553 行目の `applyUpdatePlan` が package.json を**ファイルとして直接**書き換えます（`^` や `~` の接頭辞は残す）。ここは schematic でも Tree でもありません。594 行目でインストールし、失敗したら 612〜620 行目で控えた package.json を書き戻します。607〜609 行目、成功したら Node のモジュール解決のキャッシュを消します。この後、**新しく入った版の** migrations を読み込むためです。

## 8. migrations を選ぶ：version と from / to

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L679–692 （▶ の行: 679, 683–685）

```ts
679 ▶         const result = await executeMigrations(
680 │           workflow,
681 │           logger,
682 │           migration.package,
683 ▶           migrations,
684 ▶           migration.from,
685 ▶           migration.to,
686 │           options.createCommits,
687 │         );
688 │ 
689 │         // A non-zero value is a failure for the package's migrations
690 │         if (result !== 0) {
691 │           return result;
692 │         }
```

📄 `angular-cli/packages/angular/cli/src/commands/update/utilities/migration.ts` L116–147 （▶ の行: 125–127, 133, 137, 142–143）

```ts
116 │ export async function executeMigrations(
117 │   workflow: NodeWorkflow,
118 │   logger: logging.Logger,
119 │   packageName: string,
120 │   collectionPath: string,
121 │   from: string,
122 │   to: string,
123 │   commit: boolean = false,
124 │ ): Promise<number> {
125 ▶   const collection = workflow.engine.createCollection(collectionPath);
126 ▶   const migrationRange = new semver.Range(
127 ▶     '>' + (semver.prerelease(from) ? from.split('-')[0] + '-0' : from) + ' <=' + to.split('-')[0],
128 │   );
129 │ 
130 │   const requiredMigrations: MigrationSchematicDescriptionWithVersion[] = [];
131 │   const optionalMigrations: MigrationSchematicDescriptionWithVersion[] = [];
132 │ 
133 ▶   for (const name of collection.listSchematicNames()) {
134 │     const schematic = workflow.engine.createSchematic(name, collection);
135 │     const description = schematic.description as MigrationSchematicDescription;
136 │ 
137 ▶     description.version = coerceVersionNumber(description.version);
138 │     if (!description.version) {
139 │       continue;
140 │     }
141 │ 
142 ▶     if (semver.satisfies(description.version, migrationRange, { includePrerelease: true })) {
143 ▶       (description.optional ? optionalMigrations : requiredMigrations).push(
144 │         description as MigrationSchematicDescriptionWithVersion,
145 │       );
146 │     }
147 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/update/utilities/cli-version.ts` L23–45 （▶ の行: 28–29, 35–38, 44）

```ts
23 │ export function coerceVersionNumber(version: string | undefined): string | undefined {
24 │   if (!version) {
25 │     return undefined;
26 │   }
27 │ 
28 ▶   if (!/^\d{1,30}\.\d{1,30}\.\d{1,30}/.test(version)) {
29 ▶     const match = version.match(/^\d{1,30}(\.\d{1,30})*/);
30 │ 
31 │     if (!match) {
32 │       return undefined;
33 │     }
34 │ 
35 ▶     if (!match[1]) {
36 ▶       version = version.substring(0, match[0].length) + '.0.0' + version.substring(match[0].length);
37 ▶     } else if (!match[2]) {
38 ▶       version = version.substring(0, match[0].length) + '.0' + version.substring(match[0].length);
39 │     } else {
40 │       return undefined;
41 │     }
42 │   }
43 │ 
44 ▶   return semver.valid(version) ?? undefined;
45 │ }
```

1. **コレクションを開く（125 行目）**

   683 行目の `migrations` は、インストールした後のパッケージの中の `migration-collection.json` のパスです。
2. **範囲を作る（126〜128 行目）**

   `'>' + from + ' <=' + to` の `-` より前。`from` がプレリリース（`22.0.0-rc.1` など）なら `22.0.0-0` にして、正式版の migration を取りこぼさないようにします。
3. **各 schematic の version（133〜140 行目）**

   コレクションの全 schematic の `version` を 137 行目の `coerceVersionNumber` で整えます。28〜41 行目、`"22"` は `22.0.0`、`"22.1"` は `22.1.0`。`version` の無い schematic は migration ではないので飛ばします。
4. **範囲に入るものを選ぶ（142〜145 行目）**

   `includePrerelease` で判定し、`optional` かどうかで 2 つの列に分けます。

📄 `angular-cli/packages/schematics/angular/migrations/migration-collection.json` L1–34 （▶ の行: 5–6, 13–15）

```json
 1 │ {
 2 │   "encapsulation": false,
 3 │   "schematics": {
 4 │     "add-istanbul-instrumenter": {
 5 ▶       "version": "22.0.0",
 6 ▶       "factory": "./add-istanbul-instrumenter/migration",
 7 │       "description": "Add 'istanbul-lib-instrument' to 'devDependencies' if Karma unit testing is used."
 8 │     },
 9 │     "use-application-builder": {
10 │       "version": "22.0.0",
11 │       "factory": "./use-application-builder/migration",
12 │       "description": "Migrate application projects to the new build system. Application projects that are using the '@angular-devkit/build-angular' package's 'browser' and/or 'browser-esbuild' builders will be migrated to use the new 'application' builder. You can read more about this, including known issues and limitations, here: https://angular.dev/tools/cli/build-system-migration",
13 ▶       "optional": true,
14 ▶       "recommended": true,
15 ▶       "documentation": "tools/cli/build-system-migration"
16 │     },
17 │     "migrate-karma-to-vitest": {
18 │       "version": "22.0.0",
19 │       "factory": "./migrate-karma-to-vitest/migration",
20 │       "description": "Migrate projects using legacy Karma unit-test builder to the new unit-test builder with Vitest.",
21 │       "optional": true
22 │     },
23 │     "trust-proxy-headers": {
24 │       "version": "22.0.0",
25 │       "factory": "./trust-proxy-headers/migration",
26 │       "description": "Add 'trustProxyHeaders' configuration to 'AngularNodeAppEngine' or 'AngularAppEngine'. For more information see: https://angular.dev/best-practices/security#configuring-trusted-proxy-headers"
27 │     },
28 │     "update-workspace-config": {
29 │       "version": "22.0.0",
30 │       "factory": "./update-workspace-config/migration",
31 │       "description": "Update the angular workspace configuration."
32 │     }
33 │   }
34 │ }
```

> **🧪 DEMO — from / to でどの migration が走るか**
>
> 上の `migration-collection.json` の 5 件の `version`・`optional`・`recommended` を章の .ts に手で写し、126〜145 行目の選び方を自作の関数で再現しました。semver の比較は `1.2.3` と `1.2.3-rc.0` の形だけを扱う単純な実装で、それ以外の範囲の書式（`^` や `||` など）は扱いません。版を 1 つしか書かない `22` や `22.1` は `coerceVersionNumber` と同じく補います。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cli-add-update)

## 9. migration を走らせる：必須は順に、任意は選ばせる

📄 `angular-cli/packages/angular/cli/src/commands/update/utilities/migration.ts` L172–187 （▶ の行: 173, 176, 178, 184–185）

```ts
172 │   // Optional migrations
173 ▶   if (optionalMigrations.length) {
174 │     logger.info(colors.magenta(`** Optional migrations of package '${packageName}' **\n`));
175 │ 
176 ▶     optionalMigrations.sort(compareMigrations);
177 │ 
178 ▶     const migrationsToRun = await getOptionalMigrationsToRun(
179 │       logger,
180 │       optionalMigrations,
181 │       packageName,
182 │     );
183 │ 
184 ▶     if (migrationsToRun?.length) {
185 ▶       return executePackageMigrations(workflow, logger, migrationsToRun, packageName, commit);
186 │     }
187 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/update/utilities/migration.ts` L43–63 （▶ の行: 50, 54–57, 63）

```ts
43 │ export async function executeSchematic(
44 │   workflow: NodeWorkflow,
45 │   logger: logging.Logger,
46 │   collection: string,
47 │   schematic: string,
48 │   options: Record<string, unknown> = {},
49 │ ): Promise<{ success: boolean; files: Set<string> }> {
50 ▶   const workflowSubscription = subscribeToWorkflow(workflow, logger);
51 │ 
52 │   // TODO: Allow passing a schematic instance directly
53 │   try {
54 ▶     await workflow
55 ▶       .execute({
56 ▶         collection,
57 ▶         schematic,
58 │         options,
59 │         logger,
60 │       })
61 │       .toPromise();
62 │ 
63 ▶     return { success: !workflowSubscription.error, files: workflowSubscription.files };
```

必須の migration は version の順に並べて 1 つずつ実行し（この直前の `executePackageMigrations`）、任意のものは 176 行目で並べてから 178 行目で選択肢を出し、選ばれたものだけを 185 行目で実行します（端末でなければ一覧だけを出して実行しない）。1 つの migration は 54〜61 行目の `workflow.execute`、つまり `ng generate` と同じ **Tree → DryRunSink → HostSink** の 1 回の実行です（[第 13 回](13-schematics.md)）。migration ごとに sink まで終わるので、3 つ目で失敗しても 1・2 つ目の変更はディスクに残ります（`--create-commits` なら 1 つずつコミットされる）。

### migration の例：update-workspace-config

📄 `angular-cli/packages/schematics/angular/migrations/update-workspace-config/migration.ts` L17–47 （▶ の行: 17–18, 20, 25–26, 33, 38, 40–41）

```ts
17 ▶ export default function (): Rule {
18 ▶   return updateWorkspace((workspace) => {
19 │     for (const project of workspace.projects.values()) {
20 ▶       if (project.extensions['projectType'] !== ProjectType.Application) {
21 │         continue;
22 │       }
23 │ 
24 │       for (const target of project.targets.values()) {
25 ▶         if (
26 ▶           target.builder !== Builders.Application &&
27 │           target.builder !== Builders.BuildApplication
28 │         ) {
29 │           continue;
30 │         }
31 │ 
32 │         for (const [, options] of allTargetOptions(target)) {
33 ▶           const ssr = options['ssr'];
34 │           if (!ssr || !isJsonObject(ssr)) {
35 │             continue;
36 │           }
37 │ 
38 ▶           const platform = ssr['experimentalPlatform'];
39 │           if (platform) {
40 ▶             ssr['platform'] = platform;
41 ▶             delete ssr['experimentalPlatform'];
42 │           }
43 │         }
44 │       }
45 │     }
46 │   });
47 │ }
```

migration も中身はふつうの Rule です。17 行目、オプションを受け取らない RuleFactory。18 行目の `updateWorkspace` は Tree から `angular.json` を読み、変更を Tree に書き戻す Rule です。20 行目でアプリのプロジェクトだけ、25〜27 行目で application builder のターゲットだけを見て、33 行目の `ssr` の設定のうち 38〜42 行目、古い `experimentalPlatform` を `platform` に名前を変えます。該当する設定が無ければ何も変わらず、画面には「`Migration completed (No changes made).`」と出ます。

### registry が ng-update を返さないとき

📄 `angular-cli/packages/angular/cli/src/commands/update/cli.ts` L719–746 （▶ の行: 723, 726, 731, 735–736, 739, 742–743）

```ts
719 │ export async function resolveFallbackMigrations(
720 │   workspaceRoot: string,
721 │   plan: UpdatePlan,
722 │ ): Promise<{ package: string; collection: string; from: string; to: string }[]> {
723 ▶   const migrations = [...plan.migrationsToRun];
724 │   const existingMigrationPackages = new Set(migrations.map((m) => m.package));
725 │ 
726 ▶   for (const [packageName, targetVersion] of plan.packagesToUpdate) {
727 │     if (existingMigrationPackages.has(packageName)) {
728 │       continue;
729 │     }
730 │ 
731 ▶     const packageJsonPath = findPackageJson(workspaceRoot, packageName);
732 │     if (packageJsonPath) {
733 │       try {
734 │         const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
735 ▶         const ngUpdate = packageJson?.['ng-update'];
736 ▶         if (ngUpdate && typeof ngUpdate === 'object' && typeof ngUpdate.migrations === 'string') {
737 │           const installedVersion = plan.packageInfoMap.get(packageName)?.installed.version;
738 │           if (installedVersion) {
739 ▶             migrations.push({
740 │               package: packageName,
741 │               collection: ngUpdate.migrations,
742 ▶               from: installedVersion,
743 ▶               to: targetVersion,
744 │             });
745 │           }
746 │         }
```

6 節の計画は registry の manifest から作るので、`ng-update` を落として返す社内 registry では migrations が空になります。726〜746 行目、インストールの後に `node_modules/<pkg>/package.json` を読み、735〜736 行目で `ng-update.migrations` があれば、742〜743 行目の from / to で足します。

## ここまでの呼び出し

- 👤 `ng add @angular/localize` — ターミナル
  - `AddCommandModule.run` — commands/add/cli.ts L167
    - `findCompatiblePackageVersionTask` → `getPeerDependencyConflicts` — add/cli.ts L347 / L844
    - `loadPackageInfoTask` — add/cli.ts L521 — *^版、schematics、ng-add.save*
    - `installPackageTask → packageManager.add` — add/cli.ts L626 / package-manager.ts L338
    - `executeSchematic → runSchematic(ng-add)` — add/cli.ts L728 — *第 13 回の Tree と sink*
- 👤 `ng update @angular/core` — ターミナル
  - `UpdateCommandModule.run → updatePackagesAndMigrate` — commands/update/cli.ts L165 / L415
    - `resolveUserUpdatePlan` — update-resolver.ts L864 — *packageGroup / peer を足し、検査し、migrationsToRun*
    - `applyUpdatePlan` → `packageManager.install` — update-resolver.ts L1189 / update/cli.ts L594
    - `resolveFallbackMigrations` — update/cli.ts L719
    - `executeMigrations(workflow, …, from, to)` — utilities/migration.ts L116
      - `executePackageMigrations → executeSchematic → workflow.execute` — migration.ts L192 / L43 — *migration ごとに sink まで*

## 聞かれそうな質問

**Q. `ng add` と `npm install` + 手で設定、は何が違いますか？**

2 点です。版の決め方（2 節、363〜381 行目で latest がプロジェクトの peerDependencies と合うか確かめ、合わなければ古いメジャーを探す）と、インストール後に 4 節の 281 行目でパッケージの `ng-add` schematic を探して走らせること。インストール自体は 658〜667 行目でパッケージマネージャを呼ぶだけで、スクリプトは 663 行目の `ignoreScripts` で止めています。

**Q. `ng add --dry-run` で何が変わるか見られますか？**

見られません。233〜236 行目でインストールを飛ばし、320〜323 行目で「ng-add を次に実行する」と出して終わるので、`ng-add` schematic は走りません。`ng generate --dry-run` のような `CREATE` / `UPDATE` の一覧は出ません。

**Q. `ng update @angular/core` で `@angular/router` も上がるのはなぜですか？**

`@angular/core` の package.json の `ng-update.packageGroup` が、ビルド時に `@angular/*` 16 個の配列になっているからです（npm\_packages.bzl 29〜33 行目）。6 節の 676〜684 行目で配列の全員に同じ版を割り当て、706〜707 行目でプロジェクトの依存にあるものだけを足します。入っていない `@angular/service-worker` などは足されません。

**Q. v21 から v22 に上げたら、どの migration が走りますか？**

`@angular/cli` の分は、126〜128 行目の範囲 `>21.x.y <=22.a.b` に `migration-collection.json` の 5 件（全部 `version: "22.0.0"`）が入ります。必須の 3 件（`add-istanbul-instrumenter`・`trust-proxy-headers`・`update-workspace-config`）は順に走り、任意の 2 件（`use-application-builder` は recommended）は選択肢として出ます。`@angular/core` の分は、その package.json の 44 行目が指す `schematics/migrations.json` から同じ規則で選ばれます。既に 22.0.0 以上から 22.1 へ上げるときは、`>22.0.0` を満たさないので 1 件も走りません。

**Q. migration を後からもう一度走らせたいときは？**

`ng update <pkg> --migrate-only --from=21.2.0 --to=22.1.0` で、インストールせずに 8 節の `executeMigrations` だけを走らせられます（`from` は `coerceVersionNumber` で整えられる）。1 つだけなら `--migrate-only --name=<migration 名>` です。端末でない環境で任意の migration が一覧だけ出たときも、このコマンドで個別に実行できます。

## 読み終えて

- `ng add` = 版を決める（latest → peerDependencies で絞る）→ パッケージマネージャで入れる（`ng-add.save`）→ そのパッケージの `ng-add` schematic を走らせる。
- `ng add --dry-run` はインストールも ng-add もしない。Tree を通るのは ng-add の変更だけ。
- `ng update` は packageGroup と peerDependencies で組を広げ、peer を両方向に検査し、package.json を直接書いてインストールする。
- migration は `version` が「今 &lt; version ≤ 目標」のもの。必須は順に、任意は選ばせる。1 つずつ Tree と sink で書かれる。
- メジャーは 1 つずつしか上げられない（`@angular/*`）。

---

← 前: [ng generate component の中身：@schematics/angular の 1 本を読む](15-schematics-component.md)  
次: [CDK の概観：見た目を持たない部品と、エントリポイントの層](../cdk/01-cdk-overview.md) →
