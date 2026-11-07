[目次](../README.md) › [マイグレーションの内側](README.md) › 第 2 回 / 全 20 回

# 入口と配布物：migrations.json から bundles/\*.cjs まで

> @angular/core の package.json の ng-update が migrations.json を指し、各項目の version と factory（./bundles/&lt;名前&gt;.cjs#migrate）で走るものが決まる流れ（CLI の側は cli-add-update へ）。BUILD.bazel の bundle\_entrypoints と rollup.config.js で 23 個のマイグレーションを 1 つずつ .cjs にまとめる仕組み（external と chunk、.cjs にする理由）、今は誰も使っていない load\_esm.ts と、ESM の @angular/compiler-cli を require で読んでいる今の形。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/mig-entry-bundles)

---

`migrations.json` の factory は `./bundles/change-detection-eager.cjs#migrate` でした（[第 1 回](01-mig-overview.md)）。でもソースのどこにも `bundles/` というディレクトリはありません。この章では、`@angular/core` の package.json から始めて、23 個のマイグレーションが bazel と rollup で 1 つずつ `.cjs` にまとめられ、npm パッケージに入り、CLI が `require` で読むまでを 1 段ずつ追います。最後に、ESM の `@angular/compiler-cli` を読むための `load_esm.ts` が今どうなっているかと、全マイグレーション共通の spec を見ます。

読む対象は `packages/core/package.json`・`packages/core/schematics/BUILD.bazel`・`rollup.config.js`・`tsconfig.json`・`utils/load_esm.ts`・`test/all-migrations.spec.ts` です。

1. [1. 全体像](01-mig-overview.md)
2. **2. 入口と配布物**（この章）
3. [3. プログラムを作る](03-mig-program.md)
4. [4. Tsurge](04-mig-tsurge.md)
5. [5. 置き換え](05-mig-replacements.md)
6. [6. テンプレート](06-mig-templates.md)
7. [7. signal input の段階](07-mig-signal-input-passes.md)
8. [8. 参照の書き換え](08-mig-signal-input-references.md)
9. [9. 移行できない入力](09-mig-signal-input-incompatible.md)
10. [10. signal クエリ](10-mig-signal-queries.md)
11. [11. output()](11-mig-output.md)
12. [12. 制御フロー](12-mig-control-flow.md)
13. [13. inject()](13-mig-inject.md)
14. [14. テンプレートの書き換え](14-mig-template-rewrites.md)
15. [15. 使っていない import](15-mig-cleanup-imports.md)
16. [16. ルーティング](16-mig-routing.md)
17. [17. v22（1）既定](17-mig-v22-defaults.md)
18. [18. v22（2）?.](18-mig-v22-safe-navigation.md)
19. [19. テスト](19-mig-testing.md)
20. [20. issue と PR を読む](20-mig-issues.md)

## 1. package.json の 2 行

📄 `angular/packages/core/package.json` L43–55 （▶ の行: 44, 53）

```json
43 │   "ng-update": {
44 ▶     "migrations": "./schematics/migrations.json",
45 │     "packageGroup": "NG_UPDATE_PACKAGE_GROUP"
46 │   },
47 │   "angular": {
48 │     "bestPractices": {
49 │       "format": "markdown",
50 │       "path": "./resources/best-practices.md"
51 │     }
52 │   },
53 ▶   "schematics": "./schematics/collection.json",
54 │   "sideEffects": false
55 │ }
```

CLI がマイグレーションを探す入口は、この 2 行だけです。44 行目の `ng-update.migrations` は `ng update` が、53 行目の `schematics` は `ng generate @angular/core:<名前>` が読みます。45 行目の `packageGroup` が何に置き換わってどう効くかは [ng add と ng update](../cli/16-cli-add-update.md) の 6 節で読みました。

どちらも `./schematics/` の下を指しています。つまり**配られる `@angular/core` の中に `schematics/` ディレクトリがある**ということです。このサイトの `node_modules/@angular/core`（22.1.6）を開くと、`schematics/` の中は `bundles/`（38 ファイル）・`collection.json`・`migrations.json`・`ng-generate/<15 個>/schema.json` だけです。TypeScript のソースは 1 つも入っていません。

## 2. npm パッケージに入れるもの

📄 `angular/packages/core/schematics/BUILD.bazel` L40–62 （▶ の行: 42–45, 59, 61）

```python
40 │ npm_package(
41 │     srcs = [
42 ▶         "collection.json",
43 ▶         "migrations.json",
44 ▶         ":bundles",
45 ▶         "//packages/core/schematics/ng-generate/cleanup-unused-imports:static_files",
46 │         "//packages/core/schematics/ng-generate/common-to-standalone-migration:static_files",
47 │         "//packages/core/schematics/ng-generate/control-flow-migration:static_files",
48 │         "//packages/core/schematics/ng-generate/inject-migration:static_files",
49 │         "//packages/core/schematics/ng-generate/ngclass-to-class-migration:static_files",
50 │         "//packages/core/schematics/ng-generate/ngstyle-to-style-migration:static_files",
51 │         "//packages/core/schematics/ng-generate/output-migration:static_files",
52 │         "//packages/core/schematics/ng-generate/route-lazy-loading:static_files",
53 │         "//packages/core/schematics/ng-generate/router-testing-module-migration:static_files",
54 │         "//packages/core/schematics/ng-generate/self-closing-tags-migration:static_files",
55 │         "//packages/core/schematics/ng-generate/service-migration:static_files",
56 │         "//packages/core/schematics/ng-generate/signal-input-migration:static_files",
57 │         "//packages/core/schematics/ng-generate/signal-queries-migration:static_files",
58 │         "//packages/core/schematics/ng-generate/signals:static_files",
59 ▶         "//packages/core/schematics/ng-generate/standalone-migration:static_files",
60 │     ],
61 ▶     visibility = ["//packages/core:__pkg__"],
62 │ )
```

1. **42・43 行目：2 つの一覧**

   `collection.json` と `migrations.json` をそのまま入れます。
2. **44 行目：`:bundles`**

   同じ BUILD.bazel の後ろにある `rollup.rollup(name = "bundles", …)` の出力です（4 節）。`.cjs` はここから入ります。
3. **45〜59 行目：`static_files`**

   `ng-generate` の 15 個のディレクトリが、それぞれ `copy_to_bin(name = "static_files", srcs = ["schema.json"])` で schema.json だけを差し出しています。`collection.json` の `"schema": "./ng-generate/…/schema.json"` が配られたパッケージの中で解決できるのは、これがあるからです。
4. **61 行目：見えるのは `packages/core` だけ**

   この npm\_package は `//packages/core` の npm パッケージの一部として組み込まれます。

## 3. bundle\_entrypoints：名前と入口の組

📄 `angular/packages/core/schematics/BUILD.bazel` L64–92 （▶ の行: 64, 66–67, 86–87）

```python
64 ▶ bundle_entrypoints = [
65 │     [
66 ▶         "inject-migration",
67 ▶         "packages/core/schematics/ng-generate/inject-migration/index.js",
68 │     ],
69 │     [
70 │         "route-lazy-loading",
71 │         "packages/core/schematics/ng-generate/route-lazy-loading/index.js",
72 │     ],
73 │     [
74 │         "standalone-migration",
75 │         "packages/core/schematics/ng-generate/standalone-migration/index.js",
76 │     ],
77 │     [
78 │         "cleanup-unused-imports",
79 │         "packages/core/schematics/ng-generate/cleanup-unused-imports/index.js",
80 │     ],
81 │     [
82 │         "signals",
83 │         "packages/core/schematics/ng-generate/signals/index.js",
84 │     ],
85 │     [
86 ▶         "signal-input-migration",
87 ▶         "packages/core/schematics/ng-generate/signal-input-migration/index.js",
88 │     ],
89 │     [
90 │         "signal-queries-migration",
91 │         "packages/core/schematics/ng-generate/signal-queries-migration/index.js",
92 │     ],
```

📄 `angular/packages/core/schematics/BUILD.bazel` L129–157 （▶ の行: 130–131, 154–155）

```python
129 │     [
130 ▶         "http-xhr-backend",
131 ▶         "packages/core/schematics/migrations/http-xhr-backend/index.js",
132 │     ],
133 │     [
134 │         "strict-templates-default",
135 │         "packages/core/schematics/migrations/strict-templates-default/index.js",
136 │     ],
137 │     [
138 │         "can-match-snapshot-required",
139 │         "packages/core/schematics/migrations/can-match-snapshot-required/index.js",
140 │     ],
141 │     [
142 │         "incremental-hydration",
143 │         "packages/core/schematics/migrations/incremental-hydration/index.js",
144 │     ],
145 │     [
146 │         "strict-safe-navigation-narrow",
147 │         "packages/core/schematics/migrations/strict-safe-navigation-narrow/index.js",
148 │     ],
149 │     [
150 │         "model-output",
151 │         "packages/core/schematics/migrations/model-output/index.js",
152 │     ],
153 │     [
154 ▶         "safe-optional-chaining",
155 ▶         "packages/core/schematics/migrations/safe-optional-chaining/index.js",
156 │     ],
157 │ ]
```

64 行目からの配列は「出てくるファイルの名前」と「入口の .js」の組です。66〜67 行目なら、`ng-generate/inject-migration/index.js` から辿れるコードを全部まとめて `inject-migration.cjs` にします。入口が `.ts` ではなく `.js` なのは、各ディレクトリの `ts_project` が先に TypeScript を JavaScript に変えていて、rollup はその出力を読むからです。

組は全部で 23 個あります。`ng-generate/` を指すものが 15 個（86〜87 行目の `signal-input-migration` など）、`migrations/` を指すものが 8 個（130〜131 行目の `http-xhr-backend`、154〜155 行目の `safe-optional-chaining` など）。15 と 8 は、`collection.json` と `migrations.json` の件数とちょうど同じです。新しいマイグレーションを足すときは、一覧の JSON に書くだけでは動かず、**この配列にも 1 組足さないと `.cjs` ができません**。

## 4. rollup の呼び方

📄 `angular/packages/core/schematics/BUILD.bazel` L193–209 （▶ の行: 194–198, 203, 206–207）

```python
193 │     args = [
194 ▶         "--format=cjs",
195 ▶         "--config=$(rootpath rollup.config.js)",
196 ▶         "--dir=packages/core/schematics/bundles",
197 ▶         "--no-sourcemap",
198 ▶     ] + ["--input=%s=%s" % (name, path) for [
199 │         name,
200 │         path,
201 │     ] in bundle_entrypoints],
202 │     out_dirs = [
203 ▶         "bundles",
204 │     ],
205 │     visibility = [
206 ▶         "//packages/core/schematics/ng-generate/ngclass-to-class-migration:__pkg__",
207 ▶         "//packages/core/schematics/test:__pkg__",
208 │     ],
209 │ )
```

1. **194 行目：`--format=cjs`**

   出力を CommonJS（`require` と `exports`）にします。理由は 6 節。
2. **196 行目：`--dir=packages/core/schematics/bundles`**

   出力先です。202〜204 行目の `out_dirs = ["bundles"]` と合わせて、bazel の出力（このマシンでは `dist/bin/packages/core/schematics/bundles/`）にできます。
3. **198 行目：`--input=名前=パス` を 23 個**

   3 節の配列を Python の内包表記で `--input=inject-migration=packages/…/index.js` の形に並べます。rollup は複数の入口を 1 回でまとめるので、入口どうしで共有するモジュールは別のファイル（chunk）に切り出されます。
4. **205〜208 行目：使ってよい相手**

   206 行目の ngclass-to-class-migration と、207 行目の `test` だけがこの出力を data に取れます。`test:test` の spec がバンドルを走らせるのはこのためです（[第 1 回](01-mig-overview.md)のテストの節）。

## 5. rollup.config.js：外に出すもの

📄 `angular/packages/core/schematics/rollup.config.js` L39–67 （▶ の行: 41, 47–49, 52, 58, 61–63）

```js
39 │ const banner = `'use strict';
40 │ /**
41 ▶  * @license Angular v0.0.0-PLACEHOLDER
42 │  * (c) 2010-2026 Google LLC. https://angular.dev/
43 │  * License: MIT
44 │  */`;
45 │ 
46 │ const plugins = [
47 ▶   pathPlugin({tsconfigPath: 'packages/core/schematics/tsconfig.json'}),
48 ▶   nodeResolve({
49 ▶     jail: process.cwd(),
50 │   }),
51 │   stripBannerPlugin,
52 ▶   commonjs(),
53 │ ];
54 │ 
55 │ /** @type {import('rollup').RollupOptions} */
56 │ const config = {
57 │   plugins,
58 ▶   external: ['typescript', 'tslib', /@angular-devkit\/.+/, /@angular\//],
59 │   output: {
60 │     exports: 'auto',
61 ▶     chunkFileNames: '[name]-[hash].cjs',
62 ▶     entryFileNames: '[name].cjs',
63 ▶     banner,
64 │   },
65 │ };
66 │ 
67 │ module.exports = config;
```

1. **47 行目：`pathPlugin`**

   schematics の `tsconfig.json` の `paths` を見て、`@angular/compiler-cli` などの import をリポジトリの中の場所に読み替えます。その paths はこうです。

📄 `angular/packages/core/schematics/tsconfig.json` L1–23 （▶ の行: 10–12, 16–20）

```json
 1 │ {
 2 │   "compilerOptions": {
 3 │     "noImplicitReturns": true,
 4 │     "noImplicitOverride": true,
 5 │     "noFallthroughCasesInSwitch": true,
 6 │     "noPropertyAccessFromIndexSignature": true,
 7 │     "esModuleInterop": true,
 8 │     "declaration": true,
 9 │     "sourceMap": true,
10 ▶     // Schematics are bundled into CommonJS for shipping.
11 ▶     "module": "ESNext",
12 ▶     "moduleResolution": "bundler",
13 │     "target": "es2022",
14 │     "lib": ["es2022"],
15 │     "types": ["node"],
16 ▶     "paths": {
17 ▶       "@angular/core": ["../"],
18 ▶       "@angular/compiler": ["../../compiler"],
19 ▶       "@angular/compiler-cli": ["../../compiler-cli"],
20 ▶       "@angular/compiler-cli/*": ["../../compiler-cli/*"]
21 │     }
22 │   }
23 │ }
```

1. **tsconfig の 10〜12 行目：ESM で書いて、CJS で配る**

   コメントのとおり、TypeScript の段階では `module: "ESNext"` の import / export のまま出し、CommonJS にするのは rollup（194 行目）の仕事です。
2. **48〜50 行目：`nodeResolve({ jail: process.cwd() })`**

   bare な import（`semver` など）を node\_modules から探してバンドルに入れます。`jail` で作業ディレクトリの外には出ません。
3. **58 行目：`external`**

   `typescript`・`tslib`・`@angular-devkit/*`・`@angular/*` は**バンドルに入れず、`require('…')` のまま残します**。これらは利用者のプロジェクトの node\_modules にあるもの（利用者が入れた TypeScript と、同じ版の `@angular/compiler-cli`）を使うべきだからです。`@schematics/angular` は external に入っていないので、使っている 2 つ（strict-templates-default・strict-safe-navigation-narrow の JSON 書き換え）のぶんがバンドルの中に入ります（`json-file-RJY0pCW_.cjs`、79 KB）。
4. **61〜62 行目：名前**

   入口は `[name].cjs`、共有の chunk は `[name]-[hash].cjs`。`project_paths-CEexbl9C.cjs` のような名前はこの 61 行目から来ます。
5. **41・63 行目：バナー**

   41 行目の `v0.0.0-PLACEHOLDER` は、npm に出すときに版に置き換わります。このサイトの node\_modules の `signals.cjs` の 3 行目は `@license Angular v22.1.6` です。

### できたものを見る

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel build //packages/core/schematics:bundles
ls -l dist/bin/packages/core/schematics/bundles | wc -l     # 38 ファイル
du -sh dist/bin/packages/core/schematics/bundles            # 948K
grep -ho "require('[^']*')" dist/bin/packages/core/schematics/bundles/*.cjs | sort | uniq -c | sort -rn
```

2026-11-03 にこのマシンで走らせると、ビルドは up-to-date（0.19 秒）で、`bundles/` には **38 ファイル・948 KB** がありました。入口が 23、chunk が 15 です。いちばん大きいのは `standalone-migration.cjs`（110,947 バイト）、小さいのは `strict-safe-navigation-narrow.cjs`（1,294 バイト）でした。先頭はこうなっています。

📄 `dist/bin/packages/core/schematics/bundles/signal-input-migration.cjs（1〜23 行目）`

```
'use strict';
/**
 * @license Angular v0.0.0-PLACEHOLDER
 * (c) 2010-2026 Google LLC. https://angular.dev/
 * License: MIT
 */
'use strict';

var migrate_ts_type_references = require('./migrate_ts_type_references-CP8YcwVD.cjs');
var ts = require('typescript');
require('@angular/compiler-cli');
var migrations = require('@angular/compiler-cli/private/migrations');
require('node:path');
var project_paths = require('./project_paths-CEexbl9C.cjs');
var index = require('./index-oY1ww2ZR.cjs');
var assert = require('assert');
var apply_import_manager = require('./apply_import_manager-2ocK7XV4.cjs');
require('@angular-devkit/core');
require('node:path/posix');
require('./leading_space-BTPRV0wu.cjs');
require('@angular-devkit/schematics');
require('./project_tsconfig_paths-DaUdSee4.cjs');
require('@angular/compiler');
```

58 行目の external のとおり、`typescript`・`@angular/compiler-cli/private/migrations`・`@angular-devkit/schematics` は `require` のまま残り、共有の部品は `./project_paths-CEexbl9C.cjs` のような chunk への `require` になっています。38 ファイル全部の `require` を数えるとこうです。

📄 `出力（抜粋）`

```
  33 require('typescript')
  25 require('@angular/compiler-cli/private/migrations')
  25 require('@angular-devkit/core')
  24 require('./project_tsconfig_paths-DaUdSee4.cjs')
  22 require('@angular/compiler-cli')
  22 require('@angular-devkit/schematics')
  20 require('node:path')
  19 require('./project_paths-CEexbl9C.cjs')
  ...
  11 require('@angular/compiler')
  ...
```

## 6. なぜ .cjs なのか

CLI の側で factory を読むのは、angular-devkit の `ExportStringRef` です。

📄 `node_modules/@angular-devkit/schematics/tools/export-ref.js（このサイトの 22.1.7）` L16–27 （▶ の行: 17, 19, 22）

```
16 │     constructor(ref, parentPath = process.cwd(), inner = true) {
17 ▶         const [path, name] = ref.split('#', 2);
18 │         this._module = path[0] == '.' ? (0, node_path_1.resolve)(parentPath, path) : path;
19 ▶         this._module = require.resolve(this._module);
20 │         this._path = (0, node_path_1.dirname)(this._module);
21 │         if (inner) {
22 ▶             this._ref = require(this._module)[name || 'default'];
23 │         }
24 │         else {
25 │             this._ref = require(this._module);
26 │         }
27 │     }
```

1. **17 行目：`#` で 2 つに割る**

   `"./bundles/change-detection-eager.cjs#migrate"` → パス `./bundles/change-detection-eager.cjs` と名前 `migrate`。
2. **19 行目：`require.resolve`**

   collection の JSON があるディレクトリからの相対パスを絶対パスにします。
3. **22 行目：`require(…)[name]`**

   読み込みは `require` です。そして 配られた `@angular/core` の package.json（このサイトの node\_modules の 22.1.6）には `"type": "module"` があるので（ソースの package.json には無く、パッケージを作るときに足されます）、パッケージの中の `.js` は ESM として扱われます。**拡張子を `.cjs` にすると、その 1 ファイルだけは CommonJS として読まれる**ので、`require` で中の `exports.migrate` が取れます。

## 7. load\_esm.ts：ESM を読むための道具と、その今

📄 `angular/packages/core/schematics/utils/load_esm.ts` L24–57 （▶ の行: 25–26, 31–32, 45, 49, 55）

```ts
24 │ export async function loadEsmModule<T>(modulePath: string | URL): Promise<T> {
25 ▶   const namespaceObject = await new Function('modulePath', `return import(modulePath);`)(
26 ▶     modulePath,
27 │   );
28 │ 
29 │   // If it is not ESM then the values needed will be stored in the `default` property.
30 │   // TODO_ESM: This can be removed once `@angular/*` packages are ESM only.
31 ▶   if (namespaceObject.default) {
32 ▶     return namespaceObject.default;
33 │   } else {
34 │     return namespaceObject;
35 │   }
36 │ }
37 │ 
38 │ /**
39 │  * Attempt to load the new `@angular/compiler-cli/private/migrations` entry. If not yet present
40 │  * the previous deep imports are used to constructor an equivalent object.
41 │  *
42 │  * @returns A Promise that resolves to the dynamically imported compiler-cli private migrations
43 │  * entry or an equivalent object if not available.
44 │  */
45 ▶ export async function loadCompilerCliMigrationsModule(): Promise<
46 │   typeof import('@angular/compiler-cli/private/migrations')
47 │ > {
48 │   try {
49 ▶     return await loadEsmModule('@angular/compiler-cli/private/migrations');
50 │   } catch {
51 │     // rules_nodejs currently does not support exports field entries. This is a temporary workaround
52 │     // that leverages devmode currently being CommonJS. If that changes before rules_nodejs supports
53 │     // exports then this workaround needs to be reworked.
54 │     // TODO_ESM: This can be removed once Bazel supports exports fields.
55 ▶     return require('@angular/compiler-cli/private/migrations.js');
56 │   }
57 │ }
```

`@angular/compiler-cli` の package.json は `"type": "module"` の ESM です。CommonJS のバンドルからそれを読む方法として、このファイルは 2 つを用意しています。

1. **25〜27 行目：`new Function` で `import()`**

   関数の上のコメントにあるとおり、TypeScript が CommonJS に出力すると `import()` を `require` に書き換えてしまうので、文字列から関数を作って書き換えを避けます。31〜32 行目は、CommonJS のモジュールを `import()` したときの `default` を外す処理です。
2. **45〜56 行目：`loadCompilerCliMigrationsModule`**

   49 行目で `@angular/compiler-cli/private/migrations` を `import()` し、失敗したら 55 行目で `require` に戻ります。

> [!WARNING]
> **ハマりどころ**
>
> ところが、**このスナップショットでは `load_esm.ts` を import しているファイルが 1 つもありません**。`grep -rn "load_esm\|loadEsmModule\|loadCompilerCliMigrationsModule" packages` で出るのは、このファイル自身の 3 行だけです。`git log -S loadEsmModule -- packages/core/schematics` で見ると、最後に使う側が消えたのは `bc61cc24499`（2022-01-27、「remove old migrations」）でした。今のマイグレーションは 5 節で見たとおり `require('@angular/compiler-cli/private/migrations')` を直接書いています。

それで動くのは、Node.js が ESM のファイルを `require` できるようになったからです（Node 22.12 で既定で有効になった `require(esm)`）。`@angular/core` の package.json の冒頭の `engines` は `"node": "^22.22.3 || ^24.15.0 || >=26.0.0"` で、どの版でも `require(esm)` が使えます。確かめるために、このサイトの node\_modules に入っている 22.1.6 の `signal-input-migration.cjs` を Node 24.22.1 から `SchematicTestRunner` で走らせると、`@angular/compiler-cli` の `require` は失敗せず、マイグレーションは最後まで動きました（[第 4 回](04-mig-tsurge.md)の「テストと直し方」で使う実験と同じものです）。

## 8. all-migrations.spec.ts：8 つ全部に同じことを確かめる

📄 `angular/packages/core/schematics/test/all-migrations.spec.ts` L24–50 （▶ の行: 24–26, 30–31, 34, 39, 49）

```ts
24 ▶   const migrationCollectionPath = resolve('../migrations.json');
25 ▶   const allMigrationSchematics = Object.keys(
26 ▶     (JSON.parse(fs.readFileSync(migrationCollectionPath, 'utf8')) as any).schematics,
27 │   );
28 │ 
29 │   beforeEach(() => {
30 ▶     runner = new SchematicTestRunner('test', migrationCollectionPath);
31 ▶     host = new TempScopedNodeJsSyncHost();
32 │     tree = new UnitTestTree(new HostTree(host));
33 │ 
34 ▶     writeFile('/node_modules/@angular/core/index.d.ts', `export const MODULE: any;`);
35 │     writeFile(
36 │       '/angular.json',
37 │       JSON.stringify({
38 │         version: 1,
39 ▶         projects: {t: {root: '', architect: {build: {options: {tsConfig: './tsconfig.json'}}}}},
40 │       }),
41 │     );
42 │     writeFile('/tsconfig.json', `{}`);
43 │ 
44 │     previousWorkingDir = process.cwd();
45 │     tmpDirPath = getSystemPath(host.root);
46 │ 
47 │     // Switch into the temporary directory path. This allows us to run
48 │     // the schematic against our custom unit test tree.
49 ▶     process.chdir(tmpDirPath);
50 │   });
```

1. **24〜27 行目：一覧を読む**

   bazel の runfiles の中で `../migrations.json` を読み、`schematics` のキー（8 つの名前）を取り出します。
2. **30〜32 行目：本物の runner と一時ディレクトリ**

   `SchematicTestRunner` に `migrations.json` そのものを渡します。factory は `./bundles/*.cjs` なので、2 節〜5 節で作った `.cjs` が走ります。
3. **34〜42 行目：最小のワークスペース**

   中身が `MODULE` 1 つだけの `@angular/core` の型、`build` だけの `angular.json`、空の `tsconfig.json`。
4. **49 行目：`process.chdir`**

   一時ディレクトリに移ってから走らせます。古い形のマイグレーションが `process.cwd()` を基準にパスを作るためです。

📄 `angular/packages/core/schematics/test/all-migrations.spec.ts` L61–74 （▶ の行: 62, 66–67）

```ts
61 │   async function runMigration(migrationName: string) {
62 ▶     await runner.runSchematic(migrationName, undefined, tree);
63 │   }
64 │ 
65 │   if (allMigrationSchematics.length) {
66 ▶     allMigrationSchematics.forEach((name) => {
67 ▶       describe(name, () => createTests(name));
68 │     });
69 │   } else {
70 │     it('should pass', () => {
71 │       expect(true).toBe(true);
72 │     });
73 │   }
74 │ 
```

📄 `angular/packages/core/schematics/test/all-migrations.spec.ts` L75–108 （▶ の行: 76–77, 82, 89, 101, 106）

```ts
 75 │   function createTests(migrationName: string) {
 76 ▶     // Regression test for: https://github.com/angular/angular/issues/36346.
 77 ▶     it('should not throw if non-existent symbols are imported with rootDirs', async () => {
 78 │       writeFile(
 79 │         `/tsconfig.json`,
 80 │         JSON.stringify({
 81 │           compilerOptions: {
 82 ▶             rootDirs: ['./generated'],
 83 │           },
 84 │         }),
 85 │       );
 86 │       writeFile(
 87 │         '/index.ts',
 88 │         `
 89 ▶       import {Renderer} from '@angular/core';
 90 │ 
 91 │       const variableDecl: Renderer = null;
 92 │ 
 93 │       export class Test {
 94 │         constructor(renderer: Renderer) {}
 95 │       }
 96 │     `,
 97 │       );
 98 │ 
 99 │       let error: any = null;
100 │       try {
101 ▶         await runMigration(migrationName);
102 │       } catch (e) {
103 │         error = e;
104 │       }
105 │ 
106 ▶       expect(error).toBe(null, migrationName);
107 │     });
108 │   }
```

66〜67 行目で名前ごとに `describe` を作り、77 行目の `it` を 1 つずつ入れます。中身は #36346 の回帰テスト（76 行目）で、82 行目の `rootDirs` と、89 行目の「`@angular/core` に無い `Renderer` を import するファイル」を用意し、101 行目で走らせて 106 行目で「例外が出ないこと」だけを確かめます。**何をどう書き換えるかは見ていません**。「どのマイグレーションも、型が解決できないコードで落ちない」という最低線を、マイグレーションを足すたびに自動で 1 本ずつ増やす仕組みです。

## ここまでの流れ

- `ts_project`（各ディレクトリ） — BUILD.bazel — *.ts → .js（ESNext の import のまま）*
  - `rollup.rollup(name = "bundles")` — schematics/BUILD.bazel L159–209 — *--format=cjs、--input を 23 個*
    - `pathPlugin` → `nodeResolve` → `commonjs`、external — rollup.config.js L46–58
    - `bundles/<名前>.cjs`（23）+ chunk（15） — dist/bin/packages/core/schematics/bundles/
  - `npm_package` — schematics/BUILD.bazel L40–62 — *bundles + 一覧 2 つ + schema.json 15 個*
- 👤 `ng update @angular/core` — 利用者
  - `package.json` の `ng-update.migrations` — packages/core/package.json L44
    - `new ExportStringRef("./bundles/x.cjs#migrate")` — @angular-devkit/schematics/tools/export-ref.js L16–27 — *require して exports.migrate*

## テストと直し方

### 走らせたもの

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/schematics/test:test \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=all migrations"
```

📄 `出力（2026-11-03 に実行。抜粋）`

```
==================== Test output for //packages/core/schematics/test:test (shard 3 of 16):
Ran 1 of 511 specs
1 spec, 0 failures
==================== Test output for //packages/core/schematics/test:test (shard 9 of 16):
Ran 0 of 510 specs
0 specs, 0 failures
…（16 shard のうち 8 つが 1 spec、8 つが 0 spec）
INFO: Elapsed time: 2.828s, Critical Path: 2.14s
//packages/core/schematics/test:test                                     PASSED in 1.9s
```

`--filter=all migrations` は、いちばん外の `describe('all migrations', …)` の名前に当たる正規表現です。16 shard のうち 8 つが 1 spec ずつ、合計 **8 specs・0 failures、2.8 秒**（ターゲットの実行 1.9 秒）。8 は `migrations.json` の件数と同じです。

### 直すとしたら

- **「`.cjs` が見つからない」「`migrate` が関数でない」**：`migrations.json` / `collection.json` の factory と、BUILD.bazel の `bundle_entrypoints`（64 行目からの配列）の名前が一致しているか。spec は `all-migrations.spec.ts`（ng update の 8 つは自動で入る）と `test/` の各 spec。
- **バンドルにしたときだけ壊れる**（パッケージが見つからない、同じ部品が 2 回入る）：`rollup.config.js` の external（58 行目）と、各ディレクトリの BUILD の deps。確かめるのはバンドルを走らせる `//packages/core/schematics/test:test`。`migrations/<名前>:test` はクラスを直接呼ぶので、この種の不具合は出ません。
- **`load_esm.ts`**：使う側が無いので、手を入れても何も変わりません。消すかどうかは本家の判断です（この章では提案しません）。
- 関係する issue：#69527（「`change-detection-eager.cjs` で失敗」。スタックに `project_paths-C3_ORvxG.cjs` の `runMigrationInDevkit` が出ているのは、5 節の chunk に Tsurge の土台が入っているからです。原因は rootDir で、[第 3 回](03-mig-program.md)で読む 26b0c719eff で直りました）。一覧は [第 20 回](20-mig-issues.md)。

## 聞かれそうな質問

**Q. 配られた `@angular/core` に、マイグレーションの TypeScript は入っていますか？**

入っていません。`npm_package`（40〜62 行目）が入れるのは、一覧の JSON 2 つ（42・43 行目）、`:bundles`（44 行目）、ng-generate の schema.json（45〜59 行目）だけです。デバッグでスタックを読むときは `node_modules/@angular/core/schematics/bundles/*.cjs` の行番号になります。

**Q. マイグレーションの中の TypeScript は、利用者のものとフレームワークのもの、どちらが使われますか？**

利用者のプロジェクトのものです。`rollup.config.js` 58 行目で `typescript` と `@angular/*` を external にしているので、バンドルの中には `require('typescript')` が残り、利用者の node\_modules から解決されます。

**Q. なぜ `.js` ではなく `.cjs` なのですか？**

CLI は factory を `require` で読み（export-ref.js 22 行目）、`@angular/core` の package.json は `"type": "module"` だからです。`.js` だと ESM として扱われ、CommonJS の `exports.migrate` を書いた中身と食い違います。rollup の出力名（61〜62 行目）で拡張子を `.cjs` に固定しています。

**Q. 新しいマイグレーションを足すには、どのファイルに書きますか？**

少なくとも 4 か所です。本体（`migrations/<名前>/` か `ng-generate/<名前>/`）、一覧の JSON（ng update なら `migrations.json` に `version` 付きで）、`BUILD.bazel` の `bundle_entrypoints`（64 行目からの配列）と `rollup.rollup` の srcs、ng generate なら `npm_package` の `static_files`（45〜59 行目）。ng update のものは `all-migrations.spec.ts` の 66〜67 行目で自動的に 1 本の spec が増えます。

**Q. `load_esm.ts` の `loadCompilerCliMigrationsModule` は、どこで使われていますか？**

このスナップショットではどこでも使われていません（grep で 0 件）。最後の使う側は bc61cc24499（2022-01-27）で消えました。今のバンドルは 5 節のとおり `require('@angular/compiler-cli/private/migrations')` を直接書いていて、Node の `require(esm)` で ESM の compiler-cli を読んでいます。

## 読み終えて

- `@angular/core` の package.json の 44 行目（ng-update.migrations）と 53 行目（schematics）が入口。配られる中身は `bundles/*.cjs` と JSON だけ。
- BUILD.bazel の `bundle_entrypoints` 23 組を、rollup が 1 回で `--format=cjs` にまとめる。共有部分は `[name]-[hash].cjs` の chunk になる。
- `typescript`・`@angular/*`・`@angular-devkit/*` は external で、利用者の node\_modules のものを使う。
- `.cjs` なのは、CLI が `require` で読み、`@angular/core` が `"type": "module"` だから。`load_esm.ts` は今は誰も使っていない。
- `all-migrations.spec.ts` は ng update の 8 つ全部に「型が解決できなくても落ちない」を確かめる。8 specs、2.8 秒。

---

← 前: [マイグレーションの全体像：ng update と ng generate](01-mig-overview.md)  
次: [tsconfig を探してプログラムを作る](03-mig-program.md) →
