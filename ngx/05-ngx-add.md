[目次](../README.md) › [ng コマンドの内側](README.md) › 第 5 回 / 全 10 回

# ng add：パッケージを入れて ng-add の schematic を走らせる

> src/commands/add/\*：版の指定が無いときの「入れてよい版」の探し方（latest → 各 major → 全部）、版を指定したときに package.json に書かれる範囲（~ が ^ に変わる）、確認の質問と --skip-confirmation・--dry-run・--registry、ng-add を持たないパッケージを入れてから取り除く流れと組み込みの schematic、ng add @angular/material の差分。

angular/angular-cli · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-add)

---

この章で分かること：`ng add` が、版の指定の無いパッケージの「入れてよい版」をどう探すか、版を指定したときに `package.json` へどんな範囲で書くか、確認の質問・`--skip-confirmation`・`--dry-run`・`--registry` の扱い、`ng-add` の schematic を持たないパッケージをどう片付けるか、組み込みの schematic に回すパッケージ。本物の `ng add @angular/material` などを記録用のワークスペースで走らせた記録と、入れたあとの差分で確かめます。

読む対象は `packages/angular/cli/src/commands/add/cli.ts` と `long-description.md` の、まだ引かれていない行です（../angular-cli、44129f66a3。この 2 つのファイルは 22.2.7 と同じ）。タスクの並び・`latest` の確かめ・peer の比べ方・`ng-add.save` による入れ方・schematic の実行は[ng add と ng update の章](../cli/16-cli-add-update.md)が読んでいるので、ここでは繰り返さずに行だけ指します。パッケージマネージャーの層は[第 4 回](04-ngx-package-managers.md)です。

1. [1. ng と打ってから](01-ngx-entry.md)
2. [2. schema からオプション](02-ngx-options.md)
3. [3. angular.json と設定](03-ngx-config.md)
4. [4. パッケージマネージャー](04-ngx-package-managers.md)
5. **5. ng add**（この章）
6. [6. ng update](06-ngx-update.md)
7. [7. generate・new・run・version](07-ngx-generate-run.md)
8. [8. analytics](08-ngx-analytics.md)
9. [9. ng mcp](09-ngx-mcp.md)
10. [10. spec と issue](10-ngx-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> 記録は、ローカルに @angular/cli 22.2.7 を入れた記録用のワークスペース（`demo-ws`、Angular 22.3.0、npm 11.19.1）を、場面ごとに丸ごと写した場所で取りました。v21 の場面は 21.2.31 の CLI で作った `ws21`（Angular 21.2.26）の写しで、`NG_DISABLE_VERSION_CHECK=1` を付けてグローバルの 22.2.7 の `ng add` を使っています。パッケージは npm のレジストリの公開されているものを読んで入れただけです。

## 1. 説明文と、コマンドの形

📄 `angular-cli/packages/angular/cli/src/commands/add/long-description.md` L1–7 （▶ の行: 1–2, 6）

````md
1 ▶ Adds the npm package for a published library to your workspace, and configures
2 ▶ the project in the current working directory to use that library, as specified by the library's schematic.
3 │ For example, adding `@angular/pwa` configures your project for PWA support:
4 │ 
5 │ ```bash
6 ▶ ng add @angular/pwa
7 │ ```
````

1〜2 行目は「公開されたライブラリの npm パッケージをワークスペースに足し、ライブラリの schematic が決めるとおりにプロジェクトを設定する」と書きます。`ng-add` を持たないパッケージのとき（6 節）と、版の指定の扱い（4 節）は説明文にありません。

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L110–144 （▶ の行: 111–112, 115, 117–118, 123, 130, 135, 139, 141, 144）

```ts
110 │   override async builder(argv: Argv): Promise<Argv<AddCommandArgs>> {
111 ▶     const localYargs = (await super.builder(argv))
112 ▶       .positional('collection', {
113 │         description: 'The package to be added.',
114 │         type: 'string',
115 ▶         demandOption: true,
116 │       })
117 ▶       .option('registry', { description: 'The NPM registry to use.', type: 'string' })
118 ▶       .option('verbose', {
119 │         description: 'Display additional details about internal operations during execution.',
120 │         type: 'boolean',
121 │         default: false,
122 │       })
123 ▶       .option('skip-confirmation', {
124 │         description:
125 │           'Skip asking a confirmation prompt before installing and executing the package. ' +
126 │           'Ensure package name is correct prior to using this option.',
127 │         type: 'boolean',
128 │         default: false,
129 │       })
130 ▶       .check(({ registry }) => {
131 │         if (registry === undefined) {
132 │           return true;
133 │         }
134 │ 
135 ▶         if (typeof registry === 'string' && URL.canParse(registry)) {
136 │           return true;
137 │         }
138 │ 
139 ▶         throw new CommandModuleError('Option --registry must be a valid URL.');
140 │       })
141 ▶       // Prior to downloading we don't know the full schema and therefore we cannot be strict on the options.
142 │       // Possibly in the future update the logic to use the following syntax:
143 │       // `ng add @angular/localize -- --package-options`.
144 ▶       .strict(false);
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L146–165 （▶ の行: 146–147, 151, 154–155, 157–158, 162）

```ts
146 ▶     const collectionName = this.getCollectionName();
147 ▶     if (!collectionName) {
148 │       return localYargs;
149 │     }
150 │ 
151 ▶     const workflow = this.getOrCreateWorkflowForBuilder(collectionName);
152 │ 
153 │     try {
154 ▶       const collection = workflow.engine.createCollection(collectionName);
155 ▶       const options = await this.getSchematicOptions(collection, this.schematicName, workflow);
156 │ 
157 ▶       return this.addSchemaOptionsToCommand(localYargs, options);
158 ▶     } catch (error) {
159 │       // During `ng add` prior to the downloading of the package
160 │       // we are not able to resolve and create a collection.
161 │       // Or when the collection value is a path to a tarball.
162 ▶     }
163 │ 
164 │     return localYargs;
165 │   }
```

111 行目で第 2 回の 4 つの共通のオプションを足し、112〜129 行目で `<collection>`・`--registry`・`--verbose`・`--skip-confirmation` を足します。130〜140 行目の `check` は `URL.canParse` で、記録の `--registry not-a-url` は「Error: Option --registry must be a valid URL.」で終了コード 1 でした。144 行目は `strict(false)` です。141〜143 行目のコメントのとおり、パッケージを入れる前には schematic の schema が分からないからです。146〜157 行目は、もう入っていれば（2 回目の `ng add` など）その `ng-add` の schema のオプションを足し、入っていなければ 158〜162 行目で何もしません。

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L167–182 （▶ の行: 168–169, 171, 175, 178, 180）

```ts
167 │   async run(options: Options<AddCommandArgs> & OtherOptions): Promise<number | void> {
168 ▶     this.#projectVersionCache.clear();
169 ▶     this.#rootManifestCache = null;
170 │     const { logger } = this.context;
171 ▶     const { collection, skipConfirmation } = options;
172 │ 
173 │     let packageIdentifier;
174 │     try {
175 ▶       packageIdentifier = npa(collection);
176 │     } catch (e) {
177 │       assertIsError(e);
178 ▶       logger.error(e.message);
179 │ 
180 ▶       return 1;
181 │     }
182 │ 
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L196–204 （▶ の行: 198–199, 202）

```ts
196 │ 
197 │     const taskContext = {
198 ▶       packageIdentifier,
199 ▶       isExactVersion: packageIdentifier.type === 'version',
200 │       executeSchematic: this.executeSchematic.bind(this),
201 │       getPeerDependencyConflicts: this.getPeerDependencyConflicts.bind(this),
202 ▶       dryRun: options.dryRun,
203 │     } as AddCommandTaskContext;
204 │ 
```

175 行目の `npa`（npm-package-arg）は、`@angular/material` を `type: 'range'`・`rawSpec: '*'` に、`@angular/cdk@22.2.7` を `type: 'version'` に、`@angular/cdk@next` を `type: 'tag'` に分けます（手元の npm-package-arg で確かめた）。199 行目の `isExactVersion` は `version` のときだけ `true` です。183〜195 行目のもう入っているときの道（cli-add-update の章）は、記録の 2 回目の `ng add @angular/material` で「Skipping installation: Package already installed」を出し、schematic だけをもう一度走らせました（`material-theme.scss` が 1179 バイトから 2379 バイトに増えた）。

## 2. 版の指定が無いとき：入れてよい版を探す

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L336–360 （▶ の行: 337–338, 340, 343, 347, 355）

```ts
336 │     } catch (e) {
337 ▶       if (e instanceof CommandError) {
338 ▶         logger.error(e.message);
339 │ 
340 ▶         return 1;
341 │       }
342 │ 
343 ▶       throw e;
344 │     }
345 │   }
346 │ 
347 ▶   private async findCompatiblePackageVersionTask(
348 │     context: AddCommandTaskContext,
349 │     task: AddCommandTaskWrapper,
350 │     options: Options<AddCommandArgs>,
351 │   ): Promise<void> {
352 │     const { registry, verbose } = options;
353 │     const { packageIdentifier } = context;
354 │     const { packageManager } = this.context;
355 ▶     const packageName = packageIdentifier.name;
356 │ 
357 │     assert(packageName, 'Registry package identifiers should always have a name.');
358 │ 
359 │     const rejectionReasons: string[] = [];
360 │ 
```

このタスクは 215 行目（cli-add-update の章）で `range` かつ `rawSpec === '*'` のとき、つまり版を書かなかったときだけ動きます。まず 361〜381 行目（同じ章）で `latest` を確かめ、peer が合えばそれで終わりです。記録の demo-ws では「Found compatible package version: 22.3.0.」でした。

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L382–421 （▶ の行: 383–384, 388, 396–397, 401–402, 405–406, 413, 415–416）

```ts
382 │     // 'latest' is invalid or not found, search for most recent matching package.
383 ▶     task.output =
384 ▶       'Could not find a compatible version with `latest`. Searching for a compatible version.';
385 │ 
386 │     let packageMetadata;
387 │     try {
388 ▶       packageMetadata = await packageManager.getRegistryMetadata(packageName, {
389 │         registry,
390 │       });
391 │     } catch (e) {
392 │       assertIsError(e);
393 │       throw new CommandError(`Unable to load package information from registry: ${e.message}`);
394 │     }
395 │ 
396 ▶     if (!packageMetadata) {
397 ▶       throw new CommandError('Unable to load package information from registry.');
398 │     }
399 │ 
400 │     // Allow prelease versions if the CLI itself is a prerelease or locally built.
401 ▶     const allowPrereleases = !!prerelease(VERSION.full) || VERSION.full === '0.0.0';
402 ▶     const potentialVersions = this.#getPotentialVersions(packageMetadata, allowPrereleases);
403 │ 
404 │     // Heuristic-based search: Check the latest release of each major version first.
405 ▶     const majorVersions = this.#getMajorVersions(potentialVersions);
406 ▶     let found = await this.#findCompatibleVersion(context, majorVersions, {
407 │       registry,
408 │       verbose,
409 │       rejectionReasons,
410 │     });
411 │ 
412 │     // Exhaustive search: If no compatible major version is found, fall back to checking all versions.
413 ▶     if (!found) {
414 │       const checkedVersions = new Set(majorVersions);
415 ▶       const remainingVersions = potentialVersions.filter((v) => !checkedVersions.has(v));
416 ▶       found = await this.#findCompatibleVersion(context, remainingVersions, {
417 │         registry,
418 │         verbose,
419 │         rejectionReasons,
420 │       });
421 │     }
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L481–519 （▶ の行: 482–483, 487, 492, 497, 505, 510, 513–514, 518）

```ts
481 │   #getPotentialVersions(packageMetadata: PackageMetadata, allowPrereleases: boolean): string[] {
482 ▶     const versionExclusions = packageVersionExclusions[packageMetadata.name];
483 ▶     const latestVersion = packageMetadata['dist-tags']['latest'];
484 │ 
485 │     const versions = Object.values(packageMetadata.versions).filter((version) => {
486 │       // Latest tag has already been checked
487 ▶       if (latestVersion && version === latestVersion) {
488 │         return false;
489 │       }
490 │ 
491 │       // Prerelease versions are not stable and should not be considered by default
492 ▶       if (!allowPrereleases && prerelease(version)) {
493 │         return false;
494 │       }
495 │ 
496 │       // Excluded package versions should not be considered
497 ▶       if (versionExclusions && satisfies(version, versionExclusions, { includePrerelease: true })) {
498 │         return false;
499 │       }
500 │ 
501 │       return true;
502 │     });
503 │ 
504 │     // Sort in reverse SemVer order so that the newest compatible version is chosen
505 ▶     return versions.sort((a, b) => compare(b, a, true));
506 │   }
507 │ 
508 │   #getMajorVersions(versions: string[]): string[] {
509 │     const majorVersions = new Map<number, string>();
510 ▶     for (const version of versions) {
511 │       const major = semver.major(version);
512 │       const existing = majorVersions.get(major);
513 ▶       if (!existing || semver.gt(version, existing)) {
514 ▶         majorVersions.set(major, version);
515 │       }
516 │     }
517 │ 
518 ▶     return [...majorVersions.values()].sort((a, b) => compare(b, a, true));
519 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L60–95 （▶ の行: 65, 67, 69）

```ts
60 │ /**
61 │  * The set of packages that should have certain versions excluded from consideration
62 │  * when attempting to find a compatible version for a package.
63 │  * The key is a package name and the value is a SemVer range of versions to exclude.
64 │  */
65 ▶ const packageVersionExclusions: Record<string, string | Range> = {
66 │   // @angular/localize@9.x and earlier versions as well as @angular/localize@10.0 prereleases do not have peer dependencies setup.
67 ▶   '@angular/localize': '<10.0.0',
68 │   // @angular/material@7.x versions have unbounded peer dependency ranges (>=7.0.0).
69 ▶   '@angular/material': '7.x',
70 │ };
71 │ 
72 │ const DEFAULT_CONFLICT_DISPLAY_LIMIT = 5;
73 │ 
74 │ /**
75 │  * A map of packages to built-in schematics.
76 │  * This is used for packages that do not have a native `ng-add` schematic.
77 │  */
78 │ const BUILT_IN_SCHEMATICS = {
79 │   tailwindcss: {
80 │     collection: '@schematics/angular',
81 │     name: 'tailwind',
82 │   },
83 │   '@vitest/browser-playwright': {
84 │     collection: '@schematics/angular',
85 │     name: 'vitest-browser',
86 │   },
87 │   '@vitest/browser-webdriverio': {
88 │     collection: '@schematics/angular',
89 │     name: 'vitest-browser',
90 │   },
91 │   '@vitest/browser-preview': {
92 │     collection: '@schematics/angular',
93 │     name: 'vitest-browser',
94 │   },
95 │ } as const;
```

1. **388 行目：一覧を 1 回だけ聞く**

   `getRegistryMetadata`（第 4 回）。
2. **401 行目：プレリリースを入れるか**

   CLI 自身がプレリリースか `0.0.0`（手元で組んだもの）のときだけです。
3. **481〜506 行目：候補**

   `latest` を除き（487 行目、もう確かめた）、プレリリースを除き（492 行目）、65〜70 行目の除外（`@angular/localize` の 10.0.0 未満、`@angular/material` の 7.x）を除いて、新しい順に並べます。
4. **405〜410 行目：各 major のいちばん新しい版を先に**

   508〜519 行目で major ごとに 1 つにして新しい順です。v21 のワークスペースの記録では、`latest`（22.3.0）が peer で合わず「Could not find a compatible version with \`latest\`.」、次に 21 系のいちばん新しい 21.2.14 で合って「Found compatible package version: @angular/material@21.2.14.」でした。
5. **413〜421 行目：だめなら全部**

   major ごとの先頭がどれも合わなければ、残りの全部の版を順に確かめます。

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L442–479 （▶ の行: 457–458, 461, 465, 467–468, 473）

```ts
442 │   async #findCompatibleVersion(
443 │     context: AddCommandTaskContext,
444 │     versions: string[],
445 │     options: {
446 │       registry?: string;
447 │       verbose?: boolean;
448 │       rejectionReasons: string[];
449 │     },
450 │   ): Promise<PackageManifest | null> {
451 │     const { packageIdentifier } = context;
452 │     const { packageManager } = this.context;
453 │     const { registry, verbose, rejectionReasons } = options;
454 │     const packageName = packageIdentifier.name;
455 │     assert(packageName, 'Package name must be defined.');
456 │ 
457 ▶     for (const version of versions) {
458 ▶       const manifest = await packageManager.getManifest(`${packageName}@${version}`, {
459 │         registry,
460 │       });
461 ▶       if (!manifest) {
462 │         continue;
463 │       }
464 │ 
465 ▶       const conflicts = await this.getPeerDependencyConflicts(manifest);
466 │       if (conflicts) {
467 ▶         if (verbose || rejectionReasons.length < DEFAULT_CONFLICT_DISPLAY_LIMIT) {
468 ▶           rejectionReasons.push(...conflicts);
469 │         }
470 │         continue;
471 │       }
472 │ 
473 ▶       context.packageIdentifier = npa.resolve(manifest.name, manifest.version);
474 │ 
475 │       return manifest;
476 │     }
477 │ 
478 │     return null;
479 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L423–440 （▶ の行: 423–426, 434, 436–437）

```ts
423 ▶     if (!found) {
424 ▶       let message = `Unable to find compatible package.`;
425 ▶       if (rejectionReasons.length > 0) {
426 ▶         message +=
427 │           '\nThis is often because of incompatible peer dependencies.\n' +
428 │           'These versions were rejected due to the following conflicts:\n' +
429 │           rejectionReasons
430 │             .slice(0, verbose ? undefined : DEFAULT_CONFLICT_DISPLAY_LIMIT)
431 │             .map((r) => `  - ${r}`)
432 │             .join('\n');
433 │       }
434 ▶       task.output = message;
435 │     } else {
436 ▶       task.output = `Found compatible package version: ${color.blue(
437 ▶         context.packageIdentifier.toString(),
438 │       )}.`;
439 │     }
440 │   }
```

1 つの版ごとに 458 行目で manifest を聞くので、全部を確かめると版の数だけ `npm view` が走ります。467 行目、理由は `--verbose` でなければ 5 つまでしか集めません。見つからなかったときは、423〜434 行目で `task.output` に「Unable to find compatible package.」と理由を書くだけで、**例外を投げません**。`context.packageIdentifier` は `{name}@*` のままなので、次の「Loading package information」は `*` の manifest（つまり `latest`）を読み、合わないと分かった版の入れ方へ進みます（4 節の 562〜567 行目の警告は出る）。

## 3. 確認と、TTY でないとき

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L570–594 （▶ の行: 574–576, 578, 583, 585, 587, 591–592）

```ts
570 │   private async confirmInstallationTask(
571 │     context: AddCommandTaskContext,
572 │     task: AddCommandTaskWrapper,
573 │   ): Promise<void> {
574 ▶     if (!isTTY()) {
575 ▶       task.output =
576 ▶         `'--skip-confirmation' can be used to bypass installation confirmation. ` +
577 │         `Ensure package name is correct prior to '--skip-confirmation' option usage.`;
578 ▶       throw new CommandError('No terminal detected');
579 │     }
580 │ 
581 │     const { ListrInquirerPromptAdapter } = await import('@listr2/prompt-adapter-inquirer');
582 │     const { confirm } = await import('@inquirer/prompts');
583 ▶     const shouldProceed = await task.prompt(ListrInquirerPromptAdapter).run(confirm, {
584 │       message:
585 ▶         `The package ${color.blue(context.packageIdentifier.toString())} will be installed and executed.\n` +
586 │         'Would you like to proceed?',
587 ▶       default: true,
588 │       theme: { prefix: '' },
589 │     });
590 │ 
591 ▶     if (!shouldProceed) {
592 ▶       throw new CommandError('Command aborted');
593 │     }
594 │   }
```

確認のタスクは 226 行目で `--skip-confirmation` も `--dry-run` も無いときです。574〜578 行目、TTY でなければ `--skip-confirmation` の案内を出して「No terminal detected」で止めます。記録の `ng add @angular/material`（TTY でない）は、版を探して情報を読んだあと、ここで終了コード 1 でした。疑似端末で `n` と答えると 592 行目の「Command aborted」で、`node_modules/@angular` に `material` は入っていませんでした。

## 4. 版を指定したとき：package.json に書かれる範囲

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L521–545 （▶ の行: 530, 535, 540–542）

```ts
521 │   private async loadPackageInfoTask(
522 │     context: AddCommandTaskContext,
523 │     task: AddCommandTaskWrapper,
524 │     options: Options<AddCommandArgs>,
525 │   ): Promise<void> {
526 │     const { registry } = options;
527 │ 
528 │     let manifest;
529 │     try {
530 ▶       manifest = await this.context.packageManager.getManifest(context.packageIdentifier, {
531 │         registry,
532 │       });
533 │     } catch (e) {
534 │       assertIsError(e);
535 ▶       throw new CommandError(
536 │         `Unable to fetch package information for '${context.packageIdentifier}': ${e.message}`,
537 │       );
538 │     }
539 │ 
540 ▶     if (!manifest) {
541 ▶       throw new CommandError(
542 ▶         `Unable to fetch package information for '${context.packageIdentifier}'.`,
543 │       );
544 │     }
545 │ 
```

530 行目で、指定どおりの manifest を読みます（第 4 回の `getManifest`。範囲なら満たすいちばん新しい版、dist-tag ならその版）。そのあとの 547〜555 行目（cli-add-update の章の引用）が、入れる指定を `(isExactVersion ? '' : '^') + manifest.version` に置き換えます。記録の結果は次のとおりです。

| 打ったもの | npa の type | 読んだ manifest | npm に渡した指定 | package.json（記録） | 入った版 |
| --- | --- | --- | --- | --- | --- |
| `@angular/material` | range（`*`） | 22.3.0（2 節） | `^22.3.0` | `"^22.3.0"` | 22.3.0 |
| `@angular/cdk@22.2.7` | version | 22.2.7 | `22.2.7` | `"^22.2.7"` | 22.2.7 |
| `@angular/cdk@~22.2.0` | range | 22.2.7（~22.2.0 のいちばん新しい版） | `^22.2.7` | `"^22.3.0"` | **22.3.0** |
| `@angular/cdk@next` | tag | 22.4.0-next.0 | `^22.4.0-next.0` | `"^22.4.0-next.0"` | 22.4.0-next.0 |

1 つ目、`~22.2.0` と頼むと、`~22.2.0` を満たさない 22.3.0 が入りました。manifest の版（22.2.7）に `^` を付けた `^22.2.7` を npm に渡すので、npm はその範囲のいちばん新しい 22.3.0 を選びます。この置き換えは ad0fd5f41f（2026-03-06、`perf(@angular/cli): avoid redundant package version resolution in ng add`）で入りました。それまでは打ったとおりの指定（`toString()`）を渡していました。2 つ目、`22.2.7` と決めて頼んでも、`package.json` は `"^22.2.7"` でした。b5fb457e15（2026-03-09、`fix(@angular/cli): preserve exact version in ng add when requested`）は `^` を付けないようにしましたが、658〜667 行目（cli-add-update の章）が `save: 'none'` で `npm install @angular/cdk@22.2.7` を走らせるので、npm が自分の既定（`save-prefix` の `^`）で書きます。コミットの説明の「exact version is preserved」は、npm では `package.json` に届きません。どちらも main で同じ行です。

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L561–568 （▶ の行: 562–563, 565）

```ts
561 │ 
562 ▶     if (await this.getPeerDependencyConflicts(manifest)) {
563 ▶       task.output = color.yellow(
564 │         figures.warning +
565 ▶           ' Package has unmet peer dependencies. Adding the package may not succeed.',
566 │       );
567 │     }
568 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L881–891 （▶ の行: 881–882, 885, 888, 890）

```ts
881 ▶       } catch {
882 ▶         // Not found or invalid so ignore
883 │       }
884 │ 
885 ▶       return null;
886 │     });
887 │ 
888 ▶     const conflicts = (await Promise.all(checks)).filter((result): result is string => !!result);
889 │ 
890 ▶     return conflicts.length > 0 && conflicts;
891 │   }
```

版を指定したときの peer の確かめは警告だけです。記録の `@angular/material@20` は「⚠ Package has unmet peer dependencies. Adding the package may not succeed.」のあと入れ方へ進み、npm が `ERESOLVE unable to resolve dependency tree` で失敗して、第 1 回の `handler` の 131〜135 行目の「Error: Package installation failed: Process exited with code 1.」と `Output: npm error code ERESOLVE …` で終了コード 1 でした。どの peer が合わないかは、この警告には出ません（理由の文は 2 節の探し方の中だけ）。

## 5. もう入っているか：isProjectVersionValid と findProjectVersion

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L671–701 （▶ の行: 676, 681–682, 686, 688, 690, 693, 697）

```ts
671 │   private async isProjectVersionValid(packageIdentifier: npa.Result): Promise<boolean> {
672 │     if (!packageIdentifier.name) {
673 │       return false;
674 │     }
675 │ 
676 ▶     const installedVersion = await this.findProjectVersion(packageIdentifier.name);
677 │     if (!installedVersion) {
678 │       return false;
679 │     }
680 │ 
681 ▶     if (packageIdentifier.rawSpec === '*') {
682 ▶       return true;
683 │     }
684 │ 
685 │     if (
686 ▶       packageIdentifier.type === 'range' &&
687 │       packageIdentifier.fetchSpec &&
688 ▶       packageIdentifier.fetchSpec !== '*'
689 │     ) {
690 ▶       return satisfies(installedVersion, packageIdentifier.fetchSpec);
691 │     }
692 │ 
693 ▶     if (packageIdentifier.type === 'version') {
694 │       const v1 = valid(packageIdentifier.fetchSpec);
695 │       const v2 = valid(installedVersion);
696 │ 
697 ▶       return v1 !== null && v1 === v2;
698 │     }
699 │ 
700 │     return false;
701 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L758–790 （▶ の行: 759, 764, 767, 770, 776, 778–779, 781）

```ts
758 │   private async findProjectVersion(name: string): Promise<string | null> {
759 ▶     const cachedVersion = this.#projectVersionCache.get(name);
760 │     if (cachedVersion !== undefined) {
761 │       return cachedVersion;
762 │     }
763 │ 
764 ▶     const installedPackagePath = this.resolvePackageJson(name);
765 │     if (installedPackagePath) {
766 │       try {
767 ▶         const installedPackage = JSON.parse(
768 │           await fs.readFile(installedPackagePath, 'utf-8'),
769 │         ) as PackageManifest;
770 ▶         this.#projectVersionCache.set(name, installedPackage.version);
771 │ 
772 │         return installedPackage.version;
773 │       } catch {}
774 │     }
775 │ 
776 ▶     const projectManifest = await this.getProjectManifest();
777 │     if (projectManifest) {
778 ▶       const version =
779 ▶         projectManifest.dependencies?.[name] || projectManifest.devDependencies?.[name];
780 │       if (version) {
781 ▶         this.#projectVersionCache.set(name, version);
782 │ 
783 │         return version;
784 │       }
785 │     }
786 │ 
787 │     this.#projectVersionCache.set(name, null);
788 │ 
789 │     return null;
790 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L792–807 （▶ の行: 793, 799–800）

```ts
792 │   private async getProjectManifest(): Promise<PackageManifest | null> {
793 ▶     if (this.#rootManifestCache) {
794 │       return this.#rootManifestCache;
795 │     }
796 │ 
797 │     const { root } = this.context;
798 │     try {
799 ▶       this.#rootManifestCache = JSON.parse(
800 ▶         await fs.readFile(join(root, 'package.json'), 'utf-8'),
801 │       ) as PackageManifest;
802 │ 
803 │       return this.#rootManifestCache;
804 │     } catch {
805 │       return null;
806 │     }
807 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L809–842 （▶ の行: 811, 814, 816, 820, 822–823）

```ts
809 │   private resolvePackageJson(name: string): string | undefined {
810 │     try {
811 ▶       return this.rootRequire.resolve(join(name, 'package.json'));
812 │     } catch (e) {
813 │       assertIsError(e);
814 ▶       if (e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
815 │         try {
816 ▶           const mainPath = this.rootRequire.resolve(name);
817 │           let directory = dirname(mainPath);
818 │ 
819 │           // Stop at the node_modules boundary or the root of the file system
820 ▶           while (directory && basename(directory) !== 'node_modules') {
821 │             const packageJsonPath = join(directory, 'package.json');
822 ▶             if (existsSync(packageJsonPath)) {
823 ▶               return packageJsonPath;
824 │             }
825 │ 
826 │             const parent = dirname(directory);
827 │             if (parent === directory) {
828 │               break;
829 │             }
830 │             directory = parent;
831 │           }
832 │         } catch (e) {
833 │           assertIsError(e);
834 │           this.context.logger.debug(
835 │             `Failed to resolve package '${name}' during fallback: ${e.message}`,
836 │           );
837 │         }
838 │       }
839 │     }
840 │ 
841 │     return undefined;
842 │   }
```

入っている版は、764〜772 行目でワークスペースから `name/package.json` を解決して読み、無ければ 776〜784 行目で `package.json` の依存の**範囲の文字列**（`"^22.2.0"` など）を「版」として使います。814〜838 行目は `exports` で `package.json` を出していないパッケージのため、本体から上へたどって探します。681 行目、版を書かずに打つと、入っていればどんな版でも「入っている」です。範囲（686〜690 行目）なら満たすか、決めた版（693〜697 行目）なら等しいかで、e2e の version-specifier.ts（L23〜48）がこの 4 通りを確かめています。

## 6. ng-add を持たないパッケージ：片付けと組み込みの schematic

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L249–271 （▶ の行: 253–255, 258–262, 265）

```ts
249 │     try {
250 │       const result = await tasks.run(taskContext);
251 │       assert(result.collectionName, 'Collection name should always be available');
252 │ 
253 ▶       let shouldCleanUp = false;
254 ▶       if (!result.hasSchematics && !options.dryRun) {
255 ▶         const packageJsonPath = this.resolvePackageJson(result.collectionName);
256 │         if (packageJsonPath && existsSync(packageJsonPath)) {
257 │           try {
258 ▶             const localManifest = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
259 ▶             if (localManifest.schematics) {
260 ▶               result.hasSchematics = true;
261 ▶               if (localManifest['ng-add']?.save === false) {
262 ▶                 shouldCleanUp = true;
263 │               }
264 │             } else {
265 ▶               await this.cleanUpTemporaryDependency(result.collectionName);
266 │               shouldCleanUp = false;
267 │             }
268 │           } catch {}
269 │         }
270 │       }
271 │ 
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L596–624 （▶ の行: 598, 601, 604, 607, 610, 612, 617, 619）

```ts
596 │   private async cleanUpTemporaryDependency(packageName: string): Promise<void> {
597 │     try {
598 ▶       this.context.logger.info(`Cleaning up temporary dependency '${packageName}'...`);
599 │ 
600 │       // 1. Remove from root package.json
601 ▶       const projectManifest = await this.getProjectManifest();
602 │       if (projectManifest) {
603 │         if (projectManifest.dependencies) {
604 ▶           delete projectManifest.dependencies[packageName];
605 │         }
606 │         if (projectManifest.devDependencies) {
607 ▶           delete projectManifest.devDependencies[packageName];
608 │         }
609 │ 
610 ▶         await fs.writeFile(
611 │           join(this.context.root, 'package.json'),
612 ▶           JSON.stringify(projectManifest, null, 2) + '\n',
613 │         );
614 │       }
615 │ 
616 │       // 2. Silent install pass to prune files from node_modules and update the lockfile
617 ▶       await this.context.packageManager.install({ ignoreScripts: true });
618 │     } catch (error) {
619 ▶       this.context.logger.warn(
620 │         `Failed to clean up temporary dependency '${packageName}': ` +
621 │           `${error instanceof Error ? error.message : error}`,
622 │       );
623 │     }
624 │   }
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L287–319 （▶ の行: 289, 291–292, 294, 297, 299, 302, 308, 310, 313, 315）

```ts
287 │       if (!result.hasSchematics) {
288 │         // Fallback to a built-in schematic if the package does not have an `ng-add` schematic
289 ▶         const packageName = result.packageIdentifier.name;
290 │         if (packageName) {
291 ▶           const builtInSchematic =
292 ▶             BUILT_IN_SCHEMATICS[packageName as keyof typeof BUILT_IN_SCHEMATICS];
293 │           if (builtInSchematic) {
294 ▶             logger.info(
295 │               `The ${color.blue(packageName)} package does not provide \`ng add\` actions.`,
296 │             );
297 ▶             logger.info('The Angular CLI will use built-in actions to add it to your project.');
298 │ 
299 ▶             return this.executeSchematic({
300 │               ...options,
301 │               collection: builtInSchematic.collection,
302 ▶               schematicName: builtInSchematic.name,
303 │               package: packageName,
304 │             });
305 │           }
306 │         }
307 │ 
308 ▶         let message = options.dryRun
309 │           ? 'The package does not provide any `ng add` actions, so no further actions would be taken.'
310 ▶           : 'Package installed successfully. The package does not provide any `ng add` actions, so no further actions were taken.';
311 │ 
312 │         if (result.homepage) {
313 ▶           message += `\nFor more information about this package, visit its homepage at ${result.homepage}`;
314 │         }
315 ▶         logger.info(message);
316 │ 
317 │         return;
318 │       }
319 │ 
```

0ae5690c35（2026-07-31、`fix(@angular/cli): always install package during ng add to inspect manifest on disk for schematics`）から、`ng add` はレジストリの manifest に `schematics` が無くても一度入れ、254〜270 行目で入れたあとのファイルを読みます（GitHub Packages などが `schematics` を消して返すため）。そこにも `schematics` が無ければ、265 行目で `cleanUpTemporaryDependency` を呼んで消します。記録の `ng add is-number --skip-confirmation` は「Cleaning up temporary dependency 'is-number'...」のあと、308〜313 行目の「Package installed successfully. The package does not provide any \`ng add\` actions, so no further actions were taken.」を出して終了コード 0 でした。ところが前後の diff では `package.json` も `node_modules` も元のままで、`is-number` は入っていません。文の「installed successfully」は、消したあとに出ています。

片付けの 610〜613 行目は `package.json` を `JSON.stringify(…, null, 2)` で書き直すので、タブや 4 つの空白で字下げしたファイルは 2 つの空白に変わります（第 3 回の `JSONFile` のように字下げを読まない）。617 行目の `install({ ignoreScripts: true })` で、node\_modules と lockfile から取り除きます。

287〜306 行目は、`ng-add` を持たないパッケージのうち 78〜95 行目の表にあるものを、`@schematics/angular` の組み込みの schematic に回します。記録の `ng add tailwindcss` は、いったん入れた `tailwindcss`（4.3.5）を片付け、「The tailwindcss package does not provide \`ng add\` actions.」のあと `tailwind` の schematic が `.postcssrc.json` を作り、`styles.css` に `@import 'tailwindcss';` を足し、`package.json` に `tailwindcss`・`@tailwindcss/postcss`・`postcss` を足して入れ直しました。`package.json` の範囲は schematic の決めた `^4.1.12` で、入った版は 4.3.5 です。

## 7. ng add @angular/material の差分

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L626–637 （▶ の行: 632, 636）

```ts
626 │   private async installPackageTask(
627 │     context: AddCommandTaskContext,
628 │     task: AddCommandTaskWrapper,
629 │     options: Options<AddCommandArgs>,
630 │   ): Promise<void> {
631 │     const { registry } = options;
632 ▶     const { packageIdentifier, savePackage } = context;
633 │     const { packageManager } = this.context;
634 │ 
635 │     // Only show if installation will actually occur
636 ▶     task.title = 'Installing package';
637 │ 
```

📄 `angular-cli/packages/angular/cli/src/commands/add/cli.ts` L703–727 （▶ の行: 704, 709–710, 712–714, 721）

```ts
703 │   private getCollectionName(): string | undefined {
704 ▶     const [, collectionName] = this.context.args.positional;
705 │     if (!collectionName) {
706 │       return undefined;
707 │     }
708 │ 
709 ▶     // The CLI argument may specify also a version, like `ng add @my/lib@13.0.0`,
710 ▶     // but here we need only the name of the package, like `@my/lib`.
711 │     try {
712 ▶       const packageName = npa(collectionName).name;
713 ▶       if (packageName) {
714 ▶         return packageName;
715 │       }
716 │     } catch (e) {
717 │       assertIsError(e);
718 │       this.context.logger.error(e.message);
719 │     }
720 │ 
721 ▶     return collectionName;
722 │   }
723 │ 
724 │   private isPackageInstalled(name: string): boolean {
725 │     return !!this.resolvePackageJson(name);
726 │   }
727 │ 
```

記録の `ng add @angular/material --skip-confirmation` は、npm で `@angular/material` を入れ（`--ignore-scripts`、第 4 回）、material の `ng-add` が `@angular/cdk` を足して入れ直し（「Installing packages (npm)...」）、テーマのファイル `src/material-theme.scss` を作り、`angular.json` の `styles` に足し、`src/index.html` に Roboto と Material Symbols のフォントの `<link>` を足しました。TTY でないので material の質問（テーマなど）は聞かれず、schema の既定値でした。差分を見ると、`angular.json` の `styles` は 1 行の配列に、`index.html` は全体の字下げと `<meta … />` の形が変わっています。schematic が触ったファイルを第 3 回の `formatFiles`（ワークスペースの Prettier、`printWidth: 100`）が整えたからで、schematic が足した行より広い範囲が書き換わります。704〜721 行目の `getCollectionName` は 1 節の 146 行目が使う名前で、`@my/lib@13.0.0` から版を外して `@my/lib` にします（709〜710 行目のコメント）。

## 8. --dry-run と、無いパッケージ

記録の `ng add @angular/material --dry-run` は、「\[DRY RUN\] Would execute in \[`<work>`/add/dry\]: npm view --json @angular/material@latest …」のあと「Could not find a compatible version with \`latest\`.」、一覧も同じく走らせず、「Unable to load package information from registry.」で終了コード 1 でした。第 4 回のとおり、`--dry-run` は `runCommand` の 72 行目で `PackageManager` の `dryRun` になり、読むだけの `npm view` も走らないからです。cli-add-update の章の読んだ「`--dry-run` はインストールしない」（232〜237 行目の `skip`）の前に、2 節の 396〜398 行目で止まります。無いパッケージ（`@angular/no-such-package-ngx-demo`）も同じ文で終了コード 1 でした。`latest` も一覧も「無い」（`null`）なので、パッケージが無いのか、レジストリが読めないのかを文では区別しません。

> **🧪 DEMO — 本物の ng add の記録**
>
> ボタンは、`demo-ws`（または `ws21`）を場面ごとに `<work>/add/*` へ写して `ng add` を走らせた記録を再生します。下の段は、走らせる前と後の `diff -ru`（`node_modules`・`package-lock.json`・`tools` を除く）と、`node_modules` に入ったパッケージの版です。listr2 の進み具合の行は TTY でないときの形です。標準エラーは左に印を付けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-add)

## ここまでの呼び出し（ng add @angular/cdk@~22.2.0）

- 👤 `$ ng add @angular/cdk@~22.2.0 --skip-confirmation` — commands/add/cli.ts
  - `run(options)` — L167 — *npa → type: 'range'、isExactVersion: false（L175・L199）*
    - `loadPackageInfoTask` — L521 — *rawSpec が \* でないので版を探すタスクは飛ばす*
      - `packageManager.getManifest(npa)` — L530 → package-manager.ts L560 — *~22.2.0 のいちばん新しい 22.2.7*
      - `npa.resolve(name, '^' + '22.2.7')` — L549〜554 — *頼んだ ~ が ^ に変わる*
    - `installPackageTask` — L626
      - `packageManager.add('@angular/cdk@^22.2.7', 'none', …, true)` — L658〜667 — *npm install … --ignore-scripts → 22.3.0*
    - `collection.createSchematic('ng-add', true)` — L281
    - `executeSchematic(…)` — L326 → L728 — *runSchematic → formatFiles*

## テストと直し方

| ファイル（tests/e2e/tests/commands/add/） | 中身 | 固めている約束 |
| --- | --- | --- |
| `version-specifier.ts` | もう入っているときの 4 通り（L23〜48） | 5 節の 681〜697 行目。入れたあとの `package.json` の範囲は見ない |
| `add-version.ts` | `ng-add-simple@^1.0.0` を入れて `package.json` が `^1.0.0`（L5〜6） | 4 節で、`^` で頼んで `^` になる形だけ。`~` と決めた版は無い |
| `peer.ts` | peer の合わない・合うパッケージで警告の有無（L9〜28） | 4 節の 562〜567 行目 |
| `add-material.ts`・`add-tailwindcss.ts`・`add-pwa.ts`・`add-registry-stripped-schematics.ts`・`registry-option.ts`・`secure-registry.ts`・`dir.ts`・`file.ts` | 実際のパッケージ、組み込みの schematic、schematics を消すレジストリ、`--registry`、ディレクトリと tarball | 6・7 節。`ng-add` を持たないパッケージを片付けたあと「installed successfully」と言う形と、`--dry-run` が止まる形は無い |
| `packages/angular/cli` の unit の spec | `commands/add` の spec は無い | — |

📄 `走らせたコマンド（2026-11-24）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all
（結果は下の段落）
```

手元の bazel の `//packages/angular/cli:test` は 257 specs・0 failures で、`ng add` の行を通る unit の spec はありません。e2e は読んだだけです。

直すとしたら、`cli.ts` の 547〜555 行目で、打った指定が `range` のときは置き換えずに元の範囲を渡し（`~22.2.0` を守る）、`version` のときは 658〜667 行目の `add` の 2 つ目の引数を `'exact'` にします（npm の `--save-exact`）。e2e は add-version.ts に「`~` で頼むと `~`」「決めた版で頼むと `^` の無い版」を足します。265 行目で片付けたときは 308〜310 行目の文を「入れてみたが `ng add` の動きが無いので取り除いた」にし、423〜434 行目は見つからなければ `CommandError` を投げます。

## 聞かれそうな質問

**Q. `ng add` で版を書かないと、いつも `latest` が入りますか？**

peer が合えば `latest`、合わなければ各 major のいちばん新しい版を新しい順に確かめ、それでもだめなら全部の版を確かめます（L405〜421）。記録の v21 のワークスペースでは material 21.2.14 でした。

**Q. `ng add @angular/cdk@~22.2.0` で 22.3.0 が入りました。**

読んだ manifest の版に `^` を付けて渡すからです（L549〜554、ad0fd5f41f から）。`^22.2.7` を npm が 22.3.0 に解決しました（記録）。決めた版（`@22.2.7`）でも、npm が `^` を付けて保存します。

**Q. CI で `ng add` が「No terminal detected」で止まります。**

確認の質問（L574〜578）が TTY を要るからです。`--skip-confirmation` を付けます。schematic の質問は TTY でなければ聞かれず、既定値になります（第 2 回の 166 行目）。

**Q. `ng add --dry-run` で何が起きるか見たいのですが、止まります。**

`--dry-run` が `PackageManager` の `dryRun` になり、レジストリを読む `npm view` も走らないので、2 節で「Unable to load package information from registry.」になります（記録、第 4 回）。

**Q. `ng add` で入れたのに `package.json` に入っていません。**

そのパッケージが `schematics` を持たず、78〜95 行目の表にも無いと、入れたあと 265 行目で取り除くからです。文は「Package installed successfully.」と言います（記録の is-number）。普通に入れるなら `npm install` を使います。

## 読み終えて

- 版を書かない `ng add` だけが、`latest` → 各 major の先頭 → 全部の順に peer の合う版を探す。見つからなくても例外にせず、`latest` を入れに進む。
- 版を書くと、読んだ manifest の版に `^` を付けて入れる。`~` の範囲は守られず、決めた版も npm では `^` で保存される。
- 確認の質問は TTY が要り、`--skip-confirmation` で飛ばす。`--dry-run` はレジストリも読まないので途中で止まる。
- `schematics` の無いパッケージは入れてから取り除き、表にあるもの（tailwindcss、`@vitest/browser-*`）は組み込みの schematic に回す。
- 入れたあとの差分には、schematic の変更に加えて、ワークスペースの Prettier による整形が入る。

---

← 前: [npm・pnpm・yarn・bun を見分けて呼ぶ：package-managers](04-ngx-package-managers.md)  
次: [ng update：版を決めて migrations を走らせる](06-ngx-update.md) →
