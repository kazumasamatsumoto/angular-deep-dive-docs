[目次](../README.md) › [webpack の builder の内側：@angular-devkit/build-angular と schematics の CLI](README.md) › 第 11 回 / 全 12 回

# schematics の CLI：bin/schematics.ts

> packages/angular\_devkit/schematics\_cli/bin/schematics.ts・blank/\*：schematics コマンドの引数の読み方、collection と schematic の解決、dry-run と出力、対話の質問、blank と schematic の雛形。

angular/angular-cli · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bwp-schematics-cli)

---

この章で分かること: `ng` を使わずに schematic を動かす `schematics` コマンド（`@angular-devkit/schematics-cli`）が、引数を Node の `parseArgs` で CLI の option と schematic の option に分け、`collection:schematic` の名前を解き、`NodeWorkflow` を作って dry-run の出来事を表示し、終わりの文と終了コードを決めるまでです。あわせて、このパッケージが持つ 2 つの schematic（`blank` と `schematic`）が何を作るかを読みます。

読む対象は angular-cli（44129f66a3）の `packages/angular_devkit/schematics_cli/bin/schematics.ts`・`collection.json`・`blank/factory.ts`・`blank/schema.json`・`schematic/factory.ts` です。`NodeWorkflow` が lifeCycle を出す順と npm install の task は[ワークフローの章](../dvk/08-dvk-workflow.md)、Tree と sink（dry-run で書かないところ）は[Tree と sink の章](../cli/13-schematics.md)、schema の検証と `$default` は[JSON schema の検査の章](../dvk/03-dvk-schema.md)、`ng generate` の側の引数の読み方は[ng generate component の章](../cli/15-schematics-component.md)です。

1. [1. browser builder の流れ](01-bwp-browser.md)
2. [2. webpack の共通の設定](02-bwp-webpack-common.md)
3. [3. スタイルの設定](03-bwp-webpack-styles.md)
4. [4. Angular の webpack プラグイン](04-bwp-webpack-plugins.md)
5. [5. babel の最適化のプラグイン](05-bwp-babel.md)
6. [6. webpack の dev-server](06-bwp-dev-server.md)
7. [7. server builder と ssr-dev-server](07-bwp-server-ssr.md)
8. [8. prerender と app-shell](08-bwp-prerender-appshell.md)
9. [9. webpack の i18n](09-bwp-i18n.md)
10. [10. karma の builder の webpack の側](10-bwp-karma.md)
11. **11. schematics の CLI**（この章）
12. [12. spec と issue](12-bwp-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> **collection** は schematic の集まりで、`collection.json` に名前と factory（Rule を返す関数）の場所を並べます。npm のパッケージの名前か、`./` で始まる相対パスで指します。**dry-run** は、どのファイルを作る・書き換えるかだけを表示して、ディスクに書かない走らせ方です。

### 1. 全体の流れ

- 👤 `schematics blank my-thing --dry-run` — 利用者
  - `main({ args })` — bin/schematics.ts 250
    - `parseOptions(args)` — 487 — *CLI の option・schematic の option・位置の引数*
    - `parseSchematicName(_.shift())` — 31 — *collection と schematic*
    - `new NodeWorkflow(process.cwd(), { dryRun, … })` — 280
    - `workflow.reporter.subscribe`・`lifeCycle.subscribe` — 324・362 — *CREATE などを貯めて、終わりに出す*
    - `workflow.execute({ collection, schematic, options })` — 398
      - `blank/factory.ts` の Rule — blank/factory.ts 42
  - `process.exitCode = 0 | 1` — 596

## 2. 引数を分ける：parseArgs と残りの option

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L469–499 （▶ の行: 469, 471–472, 477, 488, 490–491, 493–494）

```ts
469 ▶ const CLI_OPTION_DEFINITIONS = {
470 │   'allow-private': { type: 'boolean' },
471 ▶   'debug': { type: 'boolean' },
472 ▶   'dry-run': { type: 'boolean' },
473 │   'force': { type: 'boolean' },
474 │   'help': { type: 'boolean' },
475 │   'list-schematics': { type: 'boolean' },
476 │   'verbose': { type: 'boolean' },
477 ▶   'interactive': { type: 'boolean', default: true },
478 │ } as const;
479 │ 
480 │ interface Options {
481 │   _: string[];
482 │   schematicOptions: Record<string, unknown>;
483 │   cliOptions: Partial<Record<keyof typeof CLI_OPTION_DEFINITIONS, boolean>>;
484 │ }
485 │ 
486 │ /** Parse the command line. */
487 │ function parseOptions(args: string[]): Options {
488 ▶   const { values, tokens } = parseArgs({
489 │     args,
490 ▶     strict: false,
491 ▶     tokens: true,
492 │     allowPositionals: true,
493 ▶     allowNegative: true,
494 ▶     options: CLI_OPTION_DEFINITIONS,
495 │   });
496 │ 
497 │   const schematicOptions: Options['schematicOptions'] = {};
498 │   const positionals: string[] = [];
499 │ 
```

CLI 自身の option は 469〜478 行目の 8 つで、どれも boolean、`interactive` だけ既定が `true` です。488〜495 行目の `parseArgs` は `strict: false`（知らない option でも例外にしない）・`tokens: true`（引数を 1 つずつの token の列でも返す）・`allowNegative: true`（`--no-debug` を受ける）です。

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L500–533 （▶ の行: 503–504, 513, 517–518, 521–523, 528, 530）

```ts
500 │   for (let i = 0; i < tokens.length; i++) {
501 │     const token = tokens[i];
502 │ 
503 ▶     if (token.kind === 'positional') {
504 ▶       positionals.push(token.value);
505 │       continue;
506 │     }
507 │ 
508 │     if (token.kind !== 'option') {
509 │       continue;
510 │     }
511 │ 
512 │     const name = token.name;
513 ▶     let value: string | number | boolean = token.value ?? true;
514 │ 
515 │     // `parseArgs` already handled known boolean args and their --no- forms.
516 │     // Only process options not in CLI_OPTION_DEFINITIONS here.
517 ▶     if (name in CLI_OPTION_DEFINITIONS) {
518 ▶       continue;
519 │     }
520 │ 
521 ▶     if (/[A-Z]/.test(name)) {
522 ▶       throw new Error(
523 ▶         `Unknown argument ${name}. Did you mean ${strings.decamelize(name).replaceAll('_', '-')}?`,
524 │       );
525 │     }
526 │ 
527 │     // Handle --no-flag for unknown options, treating it as false
528 ▶     if (name.startsWith('no-')) {
529 │       const realName = name.slice(3);
530 ▶       schematicOptions[strings.camelize(realName)] = false;
531 │       continue;
532 │     }
533 │ 
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L534–569 （▶ の行: 535, 537–540, 542, 546–547, 549–550, 553, 558–559, 564）

```ts
534 │     // Handle value for unknown options
535 ▶     if (token.inlineValue === undefined) {
536 │       // Look ahead
537 ▶       const nextToken = tokens[i + 1];
538 ▶       if (nextToken?.kind === 'positional') {
539 ▶         value = nextToken.value;
540 ▶         i++; // Consume next token
541 │       } else {
542 ▶         value = true; // Treat as boolean if no value follows
543 │       }
544 │     }
545 │ 
546 ▶     if (typeof value === 'string') {
547 ▶       if (!isNaN(Number(value))) {
548 │         // Type inference for numbers
549 ▶         value = Number(value);
550 ▶       } else if (value === 'true') {
551 │         // Type inference for booleans
552 │         value = true;
553 ▶       } else if (value === 'false') {
554 │         value = false;
555 │       }
556 │     }
557 │ 
558 ▶     const camelName = strings.camelize(name);
559 ▶     if (Object.prototype.hasOwnProperty.call(schematicOptions, camelName)) {
560 │       const existing = schematicOptions[camelName];
561 │       if (Array.isArray(existing)) {
562 │         existing.push(value);
563 │       } else {
564 ▶         schematicOptions[camelName] = [existing, value];
565 │       }
566 │     } else {
567 │       schematicOptions[camelName] = value;
568 │     }
569 │   }
```

1. **位置の引数（503〜506 行目）**

   `blank`・`my-thing` のような `--` の無い引数を順に集めます。
2. **CLI の option は飛ばす（517〜519 行目）**

   8 つの名前は `parseArgs` の `values` に入っているので、ここでは扱いません。
3. **大文字は例外（521〜525 行目）**

   `--listSchematics` なら「Did you mean list-schematics?」の Error を投げます。
4. **--no-xxx は false（528〜532 行目）**

   知らない option の否定形は、`xxx` を camelCase にして `false`。
5. **値を探す（535〜544 行目）**

   `--name=x` の形でなければ、すぐ後ろの token が位置の引数ならそれを値として**食べ**（540 行目）、無ければ `true`。
6. **型を推す（546〜556 行目）**

   文字列が数として読めれば数（`Number('')` も `0`）、`'true'`・`'false'` は真偽（dbd81a76c9、2026-01）。
7. **名前と重なり（558〜568 行目）**

   camelCase にし、同じ名前が 2 回来たら配列にします。

schematic の option は schema を見ずに型を推すので、記録の `--name=123` は数の `123`、`--name=`（空）は `0` になり、blank の schema（`name` は文字列）の検証で「Data path "/name" must be string.」で落ちました（#24360「数に見える文字列」は今も開いている）。540 行目の先読みでは、値を取らないつもりの option の後ろの位置の引数も値になります。記録の `schematics blank --author my-thing --dry-run` は `author: "my-thing"` になって名前が無くなり、「Error: name option is required.」でした。

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L570–600 （▶ の行: 574, 581, 585, 587, 590, 595–596, 598）

```ts
570 │ 
571 │   return {
572 │     _: positionals,
573 │     schematicOptions,
574 ▶     cliOptions: values as Options['cliOptions'],
575 │   };
576 │ }
577 │ 
578 │ function isTTY(): boolean {
579 │   const isTruthy = (value: undefined | string) => {
580 │     // Returns true if value is a string that is anything but 0 or false.
581 ▶     return value !== undefined && value !== '0' && value.toUpperCase() !== 'FALSE';
582 │   };
583 │ 
584 │   // If we force TTY, we always return true.
585 ▶   const force = process.env['NG_FORCE_TTY'];
586 │   if (force !== undefined) {
587 ▶     return isTruthy(force);
588 │   }
589 │ 
590 ▶   return !!process.stdout.isTTY && !isTruthy(process.env['CI']);
591 │ }
592 │ 
593 │ if (require.main === module) {
594 │   const args = process.argv.slice(2);
595 ▶   main({ args })
596 ▶     .then((exitCode) => (process.exitCode = exitCode))
597 │     .catch((e) => {
598 ▶       throw e;
599 │     });
600 │ }
```

> [!WARNING]
> **ハマりどころ**
>
> 574 行目の `cliOptions` は `parseArgs` の `values` そのままです。`strict: false` の `parseArgs` は、boolean の option に `--debug=false` のように `=` で値を付けると、真偽ではなく文字列の `'false'` を返します（記録の「parseArgs が返す値」）。その値は 3 節の 273 行目の `cliOptions.debug ?? isLocalCollection` で真になるので、44129f66a3 では、使い方の文（445〜446 行目）が書いている `--debug=false` で debug が切れず、`--dry-run=false` でも dry-run のままでした（記録の「44129f66a3 の写し」）。yargs-parser から `parseArgs` に移した eb48d71782（2025-12、21.1.0-next.3 から）で入り、e6350b6f57（2026-09、#34199、22.2.1 から）が `values` の `'true'`・`'false'` を真偽に直しました。`--interactive=false` も同じ形です。

578〜591 行目の `isTTY` は、`NG_FORCE_TTY` があればそれに従い、無ければ stdout が端末で `CI` が真でないときだけ真です。593〜600 行目、直接起動されたときだけ `main` を呼び、戻り値を終了コードにします。598 行目は例外をそのまま投げ直すので、`main` の外に出た例外（255 行目の `parseOptions` の 521〜525 行目など）は Node の「処理されない例外」になり、スタックトレースを出して終わります（記録の `--listSchematics`。spec の 30 行目の it はこの reject を確かめている）。

## 3. main：名前を解き、debug と dry-run を決める

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L17–48 （▶ の行: 32, 35–36, 38–39, 47）

```ts
17 │ /**
18 │  * Parse the name of schematic passed in argument, and return a {collection, schematic} named
19 │  * tuple. The user can pass in `collection-name:schematic-name`, and this function will either
20 │  * return `{collection: 'collection-name', schematic: 'schematic-name'}`, or it will error out
21 │  * and show usage.
22 │  *
23 │  * In the case where a collection name isn't part of the argument, the default is to use the
24 │  * schematics package (@angular-devkit/schematics-cli) as the collection.
25 │  *
26 │  * This logic is entirely up to the tooling.
27 │  *
28 │  * @param str The argument to parse.
29 │  * @return {{collection: string, schematic: (string)}}
30 │  */
31 │ function parseSchematicName(str: string | null): { collection: string; schematic: string | null } {
32 ▶   let collection = '@angular-devkit/schematics-cli';
33 │ 
34 │   let schematic = str;
35 ▶   if (schematic?.includes(':')) {
36 ▶     const lastIndexOfColon = schematic.lastIndexOf(':');
37 │     [collection, schematic] = [
38 ▶       schematic.slice(0, lastIndexOfColon),
39 ▶       schematic.substring(lastIndexOfColon + 1),
40 │     ];
41 │   }
42 │ 
43 │   return { collection, schematic };
44 │ }
45 │ 
46 │ function removeLeadingSlash(value: string): string {
47 ▶   return value[0] === '/' ? value.slice(1) : value;
48 │ }
```

32 行目、collection を書かなければこのパッケージ（`@angular-devkit/schematics-cli`）です。35〜41 行目、`:` があれば**最後の**`:` で分けるので、`@scope/pkg:name` も分けられ、`collection:` は schematic が空の文字列になります。46〜48 行目は出来事のパスの先頭の `/` を落とす小道具です。

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L250–277 （▶ の行: 255, 257, 259–260, 266–267, 270, 273–275）

```ts
250 │ export async function main({
251 │   args,
252 │   stdout = process.stdout,
253 │   stderr = process.stderr,
254 │ }: MainOptions): Promise<0 | 1> {
255 ▶   const { cliOptions, schematicOptions, _ } = parseOptions(args);
256 │ 
257 ▶   const logger = createLogger(!!cliOptions.verbose, stdout, stderr);
258 │ 
259 ▶   if (cliOptions.help) {
260 ▶     logger.info(getUsage());
261 │ 
262 │     return 0;
263 │   }
264 │ 
265 │   /** Get the collection an schematic name from the first argument. */
266 ▶   const { collection: collectionName, schematic: schematicName } = parseSchematicName(
267 ▶     _.shift() || null,
268 │   );
269 │ 
270 ▶   const isLocalCollection = collectionName.startsWith('.') || collectionName.startsWith('/');
271 │ 
272 │   /** Gather the arguments for later use. */
273 ▶   const debug = cliOptions.debug ?? isLocalCollection;
274 ▶   const dryRunPresent = cliOptions['dry-run'] != null;
275 ▶   const dryRun = cliOptions['dry-run'] ?? debug;
276 │   const force = !!cliOptions.force;
277 │   const allowPrivate = !!cliOptions['allow-private'];
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L278–303 （▶ の行: 280, 282–285, 289–290, 293–294, 296, 300）

```ts
278 │ 
279 │   /** Create the workflow scoped to the working directory that will be executed with this run. */
280 ▶   const workflow = new NodeWorkflow(process.cwd(), {
281 │     force,
282 ▶     dryRun,
283 ▶     resolvePaths: [process.cwd(), __dirname],
284 ▶     schemaValidation: true,
285 ▶     packageManager: getPackageManagerName(),
286 │   });
287 │ 
288 │   /** If the user wants to list schematics, we simply show all the schematic names. */
289 ▶   if (cliOptions['list-schematics']) {
290 ▶     return _listSchematics(workflow, collectionName, logger);
291 │   }
292 │ 
293 ▶   if (!schematicName) {
294 ▶     logger.info(getUsage());
295 │ 
296 ▶     return 1;
297 │   }
298 │ 
299 │   if (debug) {
300 ▶     logger.info(
301 │       `Debug mode enabled${isLocalCollection ? ' by default for local collections' : ''}.`,
302 │     );
303 │   }
```

1. **help（259〜263 行目）**

   使い方を出して 0。引数なし（293〜297 行目）も同じ文を出しますが、終了コードは 1 です。
2. **ローカルの collection か（270 行目）**

   collection の名前が `.` か `/` で始まれば、ローカル（作りかけの schematic）とみなします。
3. **debug と dry-run（273〜275 行目）**

   `debug` は書かなければローカルのとき真、`dry-run` は書かなければ `debug` と同じ。だからローカルの collection は、何も書かないと dry-run になります。274 行目で「書いたか」を覚え、終わりの文に使います。
4. **NodeWorkflow（280〜286 行目）**

   今のフォルダを root にし、collection を今のフォルダとこのパッケージのフォルダから探し、schema の検証を有効にし、package manager を lock ファイルから決めます（次の引用）。
5. **一覧（289〜291 行目）**

   `--list-schematics` は schematic の名前の確かめより前なので、`schematics --list-schematics` でも既定の collection の一覧になります。

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L50–67 （▶ の行: 58–59, 61, 63）

```ts
50 │ export interface MainOptions {
51 │   args: string[];
52 │   stdout?: NodeJS.WritableStream;
53 │   stderr?: NodeJS.WritableStream;
54 │ }
55 │ 
56 │ function _listSchematics(workflow: NodeWorkflow, collectionName: string, logger: logging.Logger) {
57 │   try {
58 ▶     const collection = workflow.engine.createCollection(collectionName);
59 ▶     logger.info(collection.listSchematicNames().join('\n'));
60 │   } catch (error) {
61 ▶     logger.fatal(error instanceof Error ? error.message : `${error}`);
62 │ 
63 ▶     return 1;
64 │   }
65 │ 
66 │   return 0;
67 │ }
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L178–217 （▶ の行: 183, 185, 190–191, 206–209, 211, 216）

```ts
178 │ function findUp(names: string | string[], from: string) {
179 │   const filenames = Array.isArray(names) ? names : [names];
180 │ 
181 │   let currentDir = path.resolve(from);
182 │   while (true) {
183 ▶     for (const name of filenames) {
184 │       const p = path.join(currentDir, name);
185 ▶       if (existsSync(p)) {
186 │         return p;
187 │       }
188 │     }
189 │ 
190 ▶     const parentDir = path.dirname(currentDir);
191 ▶     if (parentDir === currentDir) {
192 │       break;
193 │     }
194 │ 
195 │     currentDir = parentDir;
196 │   }
197 │ 
198 │   return null;
199 │ }
200 │ 
201 │ /**
202 │  * return package manager' name by lock file
203 │  */
204 │ function getPackageManagerName() {
205 │   // order by check priority
206 ▶   const LOCKS: Record<string, string> = {
207 ▶     'package-lock.json': 'npm',
208 ▶     'yarn.lock': 'yarn',
209 ▶     'pnpm-lock.yaml': 'pnpm',
210 │   };
211 ▶   const lockPath = findUp(Object.keys(LOCKS), process.cwd());
212 │   if (lockPath) {
213 │     return LOCKS[path.basename(lockPath)];
214 │   }
215 │ 
216 ▶   return 'npm';
217 │ }
```

一覧は 58〜59 行目で collection を作って名前を改行でつなぎ、失敗は 61 行目の `fatal` で、エラーの文だけを出して 1 です（記録の「存在しない collection の一覧」は `Error:` が付かず、実行のときの 7 節の文と形が違う）。package manager は 206〜210 行目の lock ファイルを今のフォルダから上へ探し（178〜199 行目の `findUp`）、無ければ `npm` です。`bun` の lock ファイルは並んでいません（blank の schema の `packageManager` の enum には `bun` がある）。

## 4. 表示の準備：logger・出来事・lifeCycle

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L219–248 （▶ の行: 224, 228, 234, 239–241, 243–244）

```ts
219 │ function createLogger(
220 │   verbose: boolean,
221 │   stdout: NodeJS.WritableStream,
222 │   stderr: NodeJS.WritableStream,
223 │ ): logging.Logger {
224 ▶   const logger = new logging.IndentLogger('schematics');
225 │   const colorLevels: Record<string, (message: string, stream: NodeJS.WritableStream) => string> = {
226 │     info: (s) => s,
227 │     debug: (s) => s,
228 ▶     warn: (s, stream) => styleText(['bold', 'yellow'], s, { stream }),
229 │     error: (s, stream) => styleText(['bold', 'red'], s, { stream }),
230 │     fatal: (s, stream) => styleText(['bold', 'red'], s, { stream }),
231 │   };
232 │ 
233 │   logger.subscribe((entry) => {
234 ▶     if (entry.level === 'debug' && !verbose) {
235 │       return;
236 │     }
237 │ 
238 │     const output =
239 ▶       entry.level === 'warn' || entry.level === 'fatal' || entry.level === 'error'
240 ▶         ? stderr
241 ▶         : stdout;
242 │     const color = colorLevels[entry.level];
243 ▶     const message = color ? color(entry.message, output) : entry.message;
244 ▶     output.write(message + '\n');
245 │   });
246 │ 
247 │   return logger;
248 │ }
```

224 行目の `IndentLogger` に購読を付け、234 行目、`debug` の行は `--verbose` のときだけ出します。239〜241 行目、`warn`・`error`・`fatal` は stderr、ほかは stdout です。228〜230 行目の色は Node の `styleText` に stream を渡すので、端末でない出力には色の符号が付きません（f7a435425a で ansi-colors から替えた）。

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L305–335 （▶ の行: 307, 311–312, 324–325, 327, 331–333）

```ts
305 │   // Indicate to the user when nothing has been done. This is automatically set to off when there's
306 │   // a new DryRunEvent.
307 ▶   let nothingDone = true;
308 │ 
309 │   // Logging queue that receives all the messages to show the users. This only get shown when no
310 │   // errors happened.
311 ▶   let loggingQueue: string[] = [];
312 ▶   let error = false;
313 │ 
314 │   /**
315 │    * Logs out dry run events.
316 │    *
317 │    * All events will always be executed here, in order of discovery. That means that an error would
318 │    * be shown along other events when it happens. Since errors in workflows will stop the Observable
319 │    * from completing successfully, we record any events other than errors, then on completion we
320 │    * show them.
321 │    *
322 │    * This is a simple way to only show errors when an error occur.
323 │    */
324 ▶   workflow.reporter.subscribe((event) => {
325 ▶     nothingDone = false;
326 │     // Strip leading slash to prevent confusion.
327 ▶     const eventPath = removeLeadingSlash(event.path);
328 │ 
329 │     switch (event.kind) {
330 │       case 'error':
331 ▶         error = true;
332 ▶         logger.error(
333 ▶           `ERROR! ${eventPath} ${event.description == 'alreadyExist' ? 'already exists' : 'does not exist'}.`,
334 │         );
335 │         break;
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L336–357 （▶ の行: 339, 345, 349, 353）

```ts
336 │       case 'update':
337 │         loggingQueue.push(
338 │           // TODO: `as unknown` was necessary during TS 5.9 update. Figure out a long-term solution.
339 ▶           `${styleText(['cyan'], 'UPDATE')} ${eventPath} (${(event.content as unknown as Buffer).length} bytes)`,
340 │         );
341 │         break;
342 │       case 'create':
343 │         loggingQueue.push(
344 │           // TODO: `as unknown` was necessary during TS 5.9 update. Figure out a long-term solution.
345 ▶           `${styleText(['green'], 'CREATE')} ${eventPath} (${(event.content as unknown as Buffer).length} bytes)`,
346 │         );
347 │         break;
348 │       case 'delete':
349 ▶         loggingQueue.push(`${styleText(['yellow'], 'DELETE')} ${eventPath}`);
350 │         break;
351 │       case 'rename':
352 │         loggingQueue.push(
353 ▶           `${styleText(['blue'], 'RENAME')} ${eventPath} => ${removeLeadingSlash(event.to)}`,
354 │         );
355 │         break;
356 │     }
357 │   });
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L359–387 （▶ の行: 363–364, 366, 369, 374, 377, 380–381, 385–386）

```ts
359 │   /**
360 │    * Listen to lifecycle events of the workflow to flush the logs between each phases.
361 │    */
362 │   workflow.lifeCycle.subscribe((event) => {
363 ▶     if (event.kind == 'workflow-end' || event.kind == 'post-tasks-start') {
364 ▶       if (!error) {
365 │         // Flush the log queue and clean the error state.
366 ▶         loggingQueue.forEach((log) => logger.info(log));
367 │       }
368 │ 
369 ▶       loggingQueue = [];
370 │       error = false;
371 │     }
372 │   });
373 │ 
374 ▶   workflow.registry.addPostTransform(schema.transforms.addUndefinedDefaults);
375 │ 
376 │   // Show usage of deprecated options
377 ▶   workflow.registry.useXDeprecatedProvider((msg) => logger.warn(msg));
378 │ 
379 │   // Pass the rest of the arguments as the smart default "argv". Then delete it.
380 ▶   workflow.registry.addSmartDefaultProvider('argv', (schema) =>
381 ▶     'index' in schema ? _[Number(schema['index'])] : _,
382 │   );
383 │ 
384 │   // Add prompts.
385 ▶   if (cliOptions.interactive && isTTY()) {
386 ▶     workflow.registry.usePromptProvider(_createPromptProvider());
387 │   }
```

dry-run の出来事（Tree が sink に渡すファイルの操作。[Tree と sink の章](../cli/13-schematics.md)）を、324 行目で 1 つずつ受けます。325 行目、1 つでも来れば「何もしなかった」を下ろします。`error`（もうある・無い）は 332 行目ですぐ出し、ほかは 311 行目の列に貯めます。339・345 行目の大きさは `Buffer` の `length` で、22.2.7 では `byteLength` に替わりました（918eb4335b）。363〜371 行目、workflow の終わりか task の始まりの合図で、エラーが無ければ列を出し、消します。そのため CREATE の行は、記録の「本当に書く」で npm install の前に並びます。374 行目で schema の既定値の無い property を `undefined` で埋め、377 行目で `x-deprecated` を警告にし、380〜382 行目で `$default: { $source: 'argv', index }` に位置の引数を入れます（blank の `name` の `my-thing`）。385〜387 行目、対話の質問は `interactive` で端末のときだけです。

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L69–101 （▶ の行: 74, 76, 78–80, 85–86, 91）

```ts
 69 │ function _createPromptProvider(): schema.PromptProvider {
 70 │   return async (definitions) => {
 71 │     let prompts: typeof import('@inquirer/prompts') | undefined;
 72 │     const answers: Record<string, JsonValue> = {};
 73 │ 
 74 ▶     for (const definition of definitions) {
 75 │       // Only load prompt package if needed
 76 ▶       prompts ??= await import('@inquirer/prompts');
 77 │ 
 78 ▶       switch (definition.type) {
 79 ▶         case 'confirmation':
 80 ▶           answers[definition.id] = await prompts.confirm({
 81 │             message: definition.message,
 82 │             default: definition.default as boolean | undefined,
 83 │           });
 84 │           break;
 85 ▶         case 'list':
 86 ▶           if (!definition.items?.length) {
 87 │             continue;
 88 │           }
 89 │ 
 90 │           answers[definition.id] = await (
 91 ▶             definition.multiselect ? prompts.checkbox : prompts.select
 92 │           )({
 93 │             message: definition.message,
 94 │             validate: (values) => {
 95 │               if (!definition.validator) {
 96 │                 return true;
 97 │               }
 98 │ 
 99 │               return definition.validator(Object.values(values).map(({ value }) => value));
100 │             },
101 │             default: definition.multiselect ? undefined : definition.default,
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L102–124 （▶ の行: 102–103, 107–108, 112, 114–115, 117）

```ts
102 ▶             choices: definition.items?.map((item) =>
103 ▶               typeof item == 'string'
104 │                 ? {
105 │                     name: item,
106 │                     value: item,
107 ▶                     checked:
108 ▶                       definition.multiselect && Array.isArray(definition.default)
109 │                         ? definition.default?.includes(item)
110 │                         : item === definition.default,
111 │                   }
112 ▶                 : {
113 │                     ...item,
114 ▶                     name: item.label,
115 ▶                     value: item.value,
116 │                     checked:
117 ▶                       definition.multiselect && Array.isArray(definition.default)
118 │                         ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
119 │                           definition.default?.includes(item.value as any)
120 │                         : item.value === definition.default,
121 │                   },
122 │             ),
123 │           });
124 │           break;
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L125–162 （▶ の行: 125, 127, 130, 136, 139–140, 143–144, 150, 153–154）

```ts
125 ▶         case 'input': {
126 │           let finalValue: JsonValue | undefined;
127 ▶           answers[definition.id] = await prompts.input({
128 │             message: definition.message,
129 │             default: definition.default as string | undefined,
130 ▶             async validate(value) {
131 │               if (definition.validator === undefined) {
132 │                 return true;
133 │               }
134 │ 
135 │               let lastValidation: ReturnType<typeof definition.validator> = false;
136 ▶               for (const type of definition.propertyTypes) {
137 │                 let potential;
138 │                 switch (type) {
139 ▶                   case 'string':
140 ▶                     potential = String(value);
141 │                     break;
142 │                   case 'integer':
143 ▶                   case 'number':
144 ▶                     potential = Number(value);
145 │                     break;
146 │                   default:
147 │                     potential = value;
148 │                     break;
149 │                 }
150 ▶                 lastValidation = await definition.validator(potential);
151 │ 
152 │                 // Can be a string if validation fails
153 ▶                 if (lastValidation === true) {
154 ▶                   finalValue = potential;
155 │ 
156 │                   return true;
157 │                 }
158 │               }
159 │ 
160 │               return lastValidation;
161 │             },
162 │           });
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L163–176 （▶ の行: 166–167, 174）

```ts
163 │ 
164 │           // Use validated value if present.
165 │           // This ensures the correct type is inserted into the final schema options.
166 ▶           if (finalValue !== undefined) {
167 ▶             answers[definition.id] = finalValue;
168 │           }
169 │           break;
170 │         }
171 │       }
172 │     }
173 │ 
174 ▶     return answers;
175 │   };
176 │ }
```

質問の係は、schema の `x-prompt` から作られた定義を 1 つずつ聞きます。76 行目、`@inquirer/prompts` は最初の質問のときに読み込みます。78〜84 行目の `confirmation` は yes/no、85〜124 行目の `list` は `multiselect` なら checkbox、そうでなければ select で、選択肢が文字列でも `{ label, value }` でも、既定値に当たるものに印を付けます（107〜110・116〜120 行目）。125〜170 行目の `input` は、136〜158 行目で property の型（文字列・数）の順に値を変換して検証し、通った変換の値を 166〜168 行目で答えにします。こうして、数の property に打った `3` は数として schema に入ります。

## 5. 実行と終わりの文

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L389–419 （▶ の行: 398, 400–404, 407, 409–412, 414）

```ts
389 │   /**
390 │    *  Execute the workflow, which will report the dry run events, run the tasks, and complete
391 │    *  after all is done.
392 │    *
393 │    *  The Observable returned will properly cancel the workflow if unsubscribed, error out if ANY
394 │    *  step of the workflow failed (sink or task), with details included, and will only complete
395 │    *  when everything is done.
396 │    */
397 │   try {
398 ▶     await workflow
399 │       .execute({
400 ▶         collection: collectionName,
401 ▶         schematic: schematicName,
402 ▶         options: schematicOptions,
403 ▶         allowPrivate: allowPrivate,
404 ▶         debug: debug,
405 │         logger: logger,
406 │       })
407 ▶       .toPromise();
408 │ 
409 ▶     if (nothingDone) {
410 ▶       logger.info('Nothing to be done.');
411 ▶     } else if (dryRun) {
412 ▶       logger.info(
413 │         `Dry run enabled${
414 ▶           dryRunPresent ? '' : ' by default in debug mode'
415 │         }. No files written to disk.`,
416 │       );
417 │     }
418 │ 
419 │     return 0;
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L420–432 （▶ の行: 421, 423–425, 427, 430）

```ts
420 │   } catch (err) {
421 ▶     if (err instanceof UnsuccessfulWorkflowExecution) {
422 │       // "See above" because we already printed the error.
423 ▶       logger.fatal('The Schematic workflow failed. See above.');
424 ▶     } else if (debug && err instanceof Error) {
425 ▶       logger.fatal(`An error occured:\n${err.stack}`);
426 │     } else {
427 ▶       logger.fatal(`Error: ${err instanceof Error ? err.message : err}`);
428 │     }
429 │ 
430 ▶     return 1;
431 │   }
432 │ }
```

398〜407 行目で `NodeWorkflow.execute` を Promise にして待ちます（中の段取りは[ワークフローの章](../dvk/08-dvk-workflow.md)）。409〜417 行目、出来事が 1 つも無ければ「Nothing to be done.」、dry-run なら「Dry run enabled. No files written to disk.」で、274 行目で `--dry-run` を書かなかったときは「by default in debug mode」が挟まります。421〜431 行目、失敗の文は 3 つに分かれます。workflow の失敗（sink の `error` の出来事などで、もう 332 行目で出している）は「See above.」、debug ならスタック、それ以外は「Error: 」と文です。記録の「存在しない collection」「存在しない schematic」「name なし」は最後の形でした。425 行目の `occured` は綴りの誤りです（`occurred`）。

📄 `angular-cli/packages/angular_devkit/schematics_cli/bin/schematics.ts` L434–467 （▶ の行: 439, 445–446, 451–452, 456–457, 459）

```ts
434 │ /**
435 │  * Get usage of the CLI tool.
436 │  */
437 │ function getUsage(): string {
438 │   return `
439 ▶ schematics [collection-name:]schematic-name [options, ...]
440 │ 
441 │ By default, if the collection name is not specified, use the internal collection provided
442 │ by the Schematics CLI.
443 │ 
444 │ Options:
445 ▶     --debug             Debug mode. This is true by default if the collection is a relative
446 ▶                         path (in that case, turn off with --debug=false).
447 │ 
448 │     --allow-private     Allow private schematics to be run from the command line. Default to
449 │                         false.
450 │ 
451 ▶     --dry-run           Do not output anything, but instead just show what actions would be
452 ▶                         performed. Default to true if debug is also true.
453 │ 
454 │     --force             Force overwriting files that would otherwise be an error.
455 │ 
456 ▶     --list-schematics   List all schematics from the collection, by name. A collection name
457 ▶                         should be suffixed by a colon. Example: '@angular-devkit/schematics-cli:'.
458 │ 
459 ▶     --no-interactive    Disables interactive input prompts.
460 │ 
461 │     --verbose           Show more information.
462 │ 
463 │     --help              Show this message.
464 │ 
465 │ Any additional option is passed to the Schematics depending on its schema.
466 │ `;
467 │ }
```

使い方の文の 445〜446 行目は「ローカルの collection では debug が既定で真、`--debug=false` で切る」、456〜457 行目は「一覧には collection の名前の後ろに `:` を付ける」です。後者は 3 節の 289 行目のとおり `:` が無くても動き、記録でも `--list-schematics` だけで `blank` と `schematic` が出ました。459 行目の `--no-interactive` は 2 節の `allowNegative` で受けます。

## 6. blank と schematic：このパッケージの 2 つの schematic

📄 `angular-cli/packages/angular_devkit/schematics_cli/collection.json` L1–14 （▶ の行: 3, 6, 8, 11）

```json
 1 │ {
 2 │   "schematics": {
 3 ▶     "blank": {
 4 │       "factory": "./blank/factory",
 5 │       "schema": "./blank/schema.json",
 6 ▶       "description": "Create an empty schematic project or add a blank schematic to the current project."
 7 │     },
 8 ▶     "schematic": {
 9 │       "factory": "./schematic/factory",
10 │       "schema": "./schematic/schema.json",
11 ▶       "description": "Create a Schematic template which can be built and published directly to NPM."
12 │     }
13 │   }
14 │ }
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/blank/schema.json` L6–26 （▶ の行: 7, 10–12, 18–19, 26）

```json
 6 │   "properties": {
 7 ▶     "name": {
 8 │       "type": "string",
 9 │       "description": "The package name for the new schematic.",
10 ▶       "$default": {
11 ▶         "$source": "argv",
12 ▶         "index": 0
13 │       }
14 │     },
15 │     "packageManager": {
16 │       "description": "The package manager used to install dependencies.",
17 │       "type": "string",
18 ▶       "enum": ["npm", "yarn", "pnpm", "bun"],
19 ▶       "default": "npm"
20 │     },
21 │     "author": {
22 │       "type": "string",
23 │       "description": "Author for the new schematic."
24 │     }
25 │   },
26 ▶   "required": []
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/blank/factory.ts` L25–63 （▶ の行: 31, 33, 37–38, 43–44, 48–49, 54, 57, 59–60）

```ts
25 │ function addSchematicToCollectionJson(
26 │   collectionPath: Path,
27 │   schematicName: string,
28 │   description: JsonObject,
29 │ ): Rule {
30 │   return (tree: Tree) => {
31 ▶     const collectionJson = tree.readJson(collectionPath);
32 │ 
33 ▶     if (!isJsonObject(collectionJson) || !isJsonObject(collectionJson.schematics)) {
34 │       throw new Error('Invalid collection.json; schematics needs to be an object.');
35 │     }
36 │ 
37 ▶     collectionJson['schematics'][schematicName] = description;
38 ▶     tree.overwrite(collectionPath, JSON.stringify(collectionJson, undefined, 2));
39 │   };
40 │ }
41 │ 
42 │ export default function (options: Schema): Rule {
43 ▶   const schematicsVersion = require('@angular-devkit/schematics/package.json').version;
44 ▶   const coreVersion = require('@angular-devkit/core/package.json').version;
45 │ 
46 │   // Verify if we need to create a full project, or just add a new schematic.
47 │   return (tree: Tree, context: SchematicContext) => {
48 ▶     if (!options.name) {
49 ▶       throw new SchematicsException('name option is required.');
50 │     }
51 │ 
52 │     let collectionPath: Path | undefined;
53 │     try {
54 ▶       const packageJson = tree.readJson('/package.json') as {
55 │         schematics: unknown;
56 │       };
57 ▶       if (typeof packageJson.schematics === 'string') {
58 │         const p = normalize(packageJson.schematics);
59 ▶         if (tree.exists(p)) {
60 ▶           collectionPath = p;
61 │         }
62 │       }
63 │     } catch {}
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/blank/factory.ts` L65–99 （▶ の行: 65, 77–81, 89–90, 93–96）

```ts
65 ▶     let source = apply(url('./schematic-files'), [
66 │       applyTemplates({
67 │         ...options,
68 │         coreVersion,
69 │         schematicsVersion,
70 │         dot: '.',
71 │         camelize: strings.camelize,
72 │         dasherize: strings.dasherize,
73 │       }),
74 │     ]);
75 │ 
76 │     // Simply create a new schematic project.
77 ▶     if (!collectionPath) {
78 ▶       collectionPath = normalize('/' + options.name + '/src/collection.json');
79 ▶       source = apply(url('./project-files'), [
80 ▶         move('package.json', 'package.json.template'),
81 ▶         applyTemplates({
82 │           ...(options as object),
83 │           coreVersion,
84 │           schematicsVersion,
85 │           dot: '.',
86 │           camelize: strings.camelize,
87 │           dasherize: strings.dasherize,
88 │         }),
89 ▶         mergeWith(source),
90 ▶         move(options.name),
91 │       ]);
92 │ 
93 ▶       context.addTask(
94 ▶         new NodePackageInstallTask({
95 ▶           workingDirectory: options.name,
96 ▶           packageManager: options.packageManager,
97 │         }),
98 │       );
99 │     }
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/blank/factory.ts` L100–110 （▶ の行: 101–104, 106）

```ts
100 │ 
101 ▶     return chain([
102 ▶       mergeWith(source),
103 ▶       addSchematicToCollectionJson(collectionPath, strings.dasherize(options.name), {
104 ▶         description: 'A blank schematic.',
105 │         factory:
106 ▶           './' + strings.dasherize(options.name) + '/index#' + strings.camelize(options.name),
107 │       }),
108 │     ]);
109 │   };
110 │ }
```

1. **name は必須（48〜50 行目）**

   schema の 26 行目の `required` は空で、`name` は 10〜13 行目の `argv` の 0 番目から来るので、無いときは factory が「name option is required.」を投げます。
2. **今のフォルダが schematic の project か（52〜63 行目）**

   `/package.json` の `schematics` が文字列で、その `collection.json` があれば、そこに足すだけにします。
3. **新しい project（77〜98 行目）**

   無ければ `project-files` の雛形（README・tsconfig・package.json・collection.json など）に、65〜74 行目の schematic の雛形を重ね、91 行目で `name` のフォルダに動かし、93〜98 行目で npm install の task を足します。80 行目は、雛形の `package.json` を `package.json.template` として扱う並べ替えです（雛形の置き場では本物の package.json の名前のまま置き、renovate が版を上げられるようにする。schematic/factory.ts の 36 行目のコメント）。
4. **collection.json に足す（101〜108 行目）**

   `dasherize(name)` の名前で、`./<name>/index#<camelCase の name>` の factory を書き足します（31〜39 行目の Rule。`schematics` がオブジェクトでなければ例外）。

📄 `angular-cli/packages/angular_devkit/schematics_cli/schematic/factory.ts` L22–52 （▶ の行: 27–28, 34–35, 37–40, 48）

```ts
22 │ export default function (options: Schema): Rule {
23 │   const schematicsVersion = require('@angular-devkit/schematics/package.json').version;
24 │   const coreVersion = require('@angular-devkit/core/package.json').version;
25 │ 
26 │   return (_, context) => {
27 ▶     context.addTask(
28 ▶       new NodePackageInstallTask({
29 │         workingDirectory: options.name,
30 │         packageManager: options.packageManager,
31 │       }),
32 │     );
33 │ 
34 ▶     return mergeWith(
35 ▶       apply(url('./files'), [
36 │         // The `package.json` name is kept to allow renovate to update the dependency versions
37 ▶         move('package.json', 'package.json.template'),
38 ▶         partitionApplyMerge(
39 ▶           (p) => !/\/src\/.*?\/files\//.test(p),
40 ▶           applyTemplates({
41 │             ...options,
42 │             coreVersion,
43 │             schematicsVersion,
44 │             dot: '.',
45 │             dasherize: strings.dasherize,
46 │           }),
47 │         ),
48 ▶         move(options.name),
49 │       ]),
50 │     );
51 │   };
52 │ }
```

`schematic` の方は、27〜32 行目でいつも npm install の task を足し、`files` の雛形（3 つの例の schematic を持つ collection）を 48 行目で `name` のフォルダに置きます。38〜39 行目の `partitionApplyMerge` で、`src/<schematic>/files/` の下（例の schematic が使う雛形そのもの）には雛形の処理をかけません。記録の dry-run では 15 のファイルを作る予定でした。

> **🧪 DEMO — schematics コマンドの 24 通り（記録）**
>
> 記録のスクリプト（`rec-schematics.mjs`）が、空の作業フォルダで @angular-devkit/schematics-cli 22.2.7（@angular-devkit/schematics 22.2.7）を Node v24.22.1 で動かした記録です。npm は、引数と作業フォルダを書いて何もしない記録用の替わりを PATH の先頭に置きました。「44129f66a3 の写し」は、44129f66a3 の `bin/schematics.ts` を TypeScript 6.0.3 の `transpileModule` で CommonJS にして、22.2.7 の写しの `bin/schematics.js` と入れ替えたものです。ローカルの collection の run は、「本当に書く」で作った `my-thing` の factory を `hello.txt` を作る形に書き換えて `tsc` でビルドしてから走らせました。
>
> `schematics --help`（22.2.7）— 終了コード 0（150 ms）
>
> 作られたファイル: （なし）
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bwp-schematics-cli)

記録から読めることです。

- **dry-run**: `blank my-thing --dry-run` は 8 つの CREATE を出し、ディスクには何も作りませんでした。`collection:schematic` と `--name=` の形も同じ結果です。
- **本当に書く**: 8 つのファイルのあと、npm の替わりに `npm install --ignore-scripts` が `my-thing` の中で呼ばれました（[ワークフローの章](../dvk/08-dvk-workflow.md)の task）。package.json の `author` は、option を書かないと空の文字列です。
- **ローカルの collection**: 22.2.7 では `--debug=false`・`--no-debug` で debug が切れて書き、`--dry-run=false` は debug のまま書きました。44129f66a3 の写しでは `--no-debug` だけが効き、`=false` の 2 つは dry-run のままでした。

### 7. この形を入れたコミット

📄 `git show（bin/schematics.ts）`

```
$ git show eb48d71782 --stat   # 2025-12-12、21.1.0-next.3 から
refactor(@angular-devkit/schematics-cli): migrate argument parsing to node:util.parseArgs
（yargs-parser をやめて node:util の parseArgs にした。487〜576 行目の形）

$ git show dbd81a76c9 -- …/bin/schematics.ts   # 2026-01-26
+      } else if (value === 'true') {
+        // Type inference for booleans
+        value = true;
+      } else if (value === 'false') {
+        value = false;

$ git show e6350b6f57 -- …/bin/schematics.ts   # 2026-09-29、22.2.1 から（main は 7085a6eaa6、#34199）
+  for (const key of Object.keys(CLI_OPTION_DEFINITIONS)) {
+    const value = values[key];
+    if (value === 'true') {
+      values[key] = true;
+    } else if (value === 'false') {
+      values[key] = false;
+    }
+  }

$ git show 918eb4335b -- …/bin/schematics.ts   # 2026-11-03（main は a103f87972）
-          // TODO: `as unknown` was necessary during TS 5.9 update. Figure out a long-term solution.
-          `${styleText(['cyan'], 'UPDATE')} ${eventPath} (${(event.content as unknown as Buffer).length} bytes)`,
+          `${styleText(['cyan'], 'UPDATE')} ${eventPath} (${event.content.byteLength} bytes)`,
```

origin/main（2026-11-27）の `bin/schematics.ts` は 22.2.7 と同じで、44129f66a3 との違いは上の e6350b6f57 と 918eb4335b の 2 つです。`blank/` と `schematic/` の factory は 44129f66a3 と同じです。

## テストと直し方

| it（test/schematics\_spec.ts の行） | 固めているもの |
| --- | --- |
| `list-schematics works`（21） | 3 節の 289〜291 行目（collection を書かない形） |
| `errors when using camel case listSchematics`（30） | 2 節の 521〜525 行目（`main` が reject すること） |
| `dry-run works`（37） | 4 節の出来事の表示、5 節の終わりの文 |
| `dry-run is default when debug mode`（49） | 3 節の 273〜275 行目（`--debug` を書いた形） |
| `error when no name is provided`（62） | 6 節の 48〜50 行目、5 節の 427 行目 |

📄 `走らせたコマンドと結果`

```
cd ~/angular-research/angular-cli   # 44129f66a3
pnpm bazel test //packages/angular_devkit/schematics_cli/test:test --nocache_test_results --test_output=all
# 5 specs, 0 failures（test/schematics_spec.ts の it は 5）
//packages/angular_devkit/schematics_cli/test:test                       PASSED in 0.9s
```

44129f66a3 には `--debug=false` の spec がありません（e6350b6f57 が同じファイルに 27 行足した）。`parseOptions` は export されていないので、spec は `main` に引数を渡して stdout を見る形です。直すとしたら、次の場所になります。

- **数に見える文字列**（#24360）: 2 節の 546〜549 行目。schema を見ずに推すので、schematic の schema の型が分かってから変換する（`ng generate` の側のように）か、`''` を数にしない。spec は `blank --name=123 --dry-run` が `CREATE 123/…` を出すことを見る形です。
- **先読み**: 2 節の 537〜541 行目。値の要らない option かどうかを CLI では知れないので、schema を見ない限り直せない形です。
- **処理されない例外**: 255 行目の `parseOptions` を try の中に入れ、521〜525 行目の文を `logger.fatal` で出して 1 を返す。spec の 30 行目の it は reject を期待しているので、書き換えることになります。

## 聞かれそうな質問

**Q. `schematics blank foo` の `blank` はどの collection の schematic ですか？**

collection を書かないと、3 節の 32 行目でこのパッケージ（`@angular-devkit/schematics-cli`）の collection です。6 節の `collection.json` の `blank` です。

**Q. 作りかけの schematic を `schematics .:my-schematic` で走らせたら、ファイルが書かれません。**

3 節の 270・273・275 行目で、`.` で始まる collection は debug が既定で真、dry-run も既定で debug と同じだからです。`--no-debug` か `--dry-run=false`（22.2.1 から。44129f66a3 では `=false` の形は効かない）で書きます。

**Q. schematic の option の型はどう決まりますか？**

2 節の 546〜556 行目で、CLI が文字列の見た目から数と真偽を推します。schema は見ないので、文字列の option に数に見える値を渡すと schema の検証で落ちます（記録の `--name=123`）。

**Q. 対話の質問が出ないのはなぜですか？**

4 節の 385〜386 行目で、`interactive`（既定で真）でも、2 節の `isTTY` が偽（stdout が端末でない、または `CI` が真）なら質問の係を登録しないからです。`NG_FORCE_TTY` で強制できます。

**Q. `--dry-run` で表示されるバイト数は何ですか？**

4 節の 339・345 行目の、作る・書き換える中身の大きさです。CREATE の行は 363〜371 行目でエラーが無いときだけ、workflow の終わりにまとめて出ます。

## 読み終えて

- `schematics` コマンドは `parseArgs` で CLI の 8 つの option を取り、残りの token を schema を見ずに数・真偽・文字列にして schematic に渡す。
- collection の名前が `.` か `/` で始まると debug が既定で真になり、dry-run も既定で真になる。
- dry-run の出来事は貯めて、エラーが無ければ workflow の終わりにまとめて出し、終わりの文と終了コードは 3 通りの失敗の形で決まる。
- `--debug=false` の形は、`parseArgs` に移った 2025-12 から 22.2.1 まで文字列の `'false'` のまま真として扱われていた。

---

← 前: [karma の builder の webpack の側](10-bwp-karma.md)  
次: [spec と issue を読む：webpack の builder と schematics の CLI を固めているもの](12-bwp-tests-issues.md) →
