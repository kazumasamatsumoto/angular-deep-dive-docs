[目次](../README.md) › [application builder の読み残し：options の正規化・結果の形・BundlerContext・キャッシュ・小さなプラグインを行で埋める](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：application builder の読み残しを固めているテスト

> builders/application/tests と tools/esbuild の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で 1 か所ずつ変えて落ちる it、angular/build:application の開いている issue のうちこのシリーズの行に当たるものの表。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/abl-tests-issues)

---

シリーズの最後に、第 1〜5 回で読んだ行の約束を、どの spec のどの it が固めているかを 1 つの表にします。次に、手元での走らせ方と走った数を書き、作業木で 1 か所ずつ変えたときに落ちた it を並べます。落ちなかった行は、今の振る舞いを確かめる it が無い行です。最後に、ラベル `angular/build:application` の開いている issue 28 件をこのシリーズの章に振り分け、このシリーズで見つけた食い違いをまとめます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/builders/application/tests/`・`src/builders/application/options_spec.ts`・`src/tools/esbuild/*_spec.ts`・`src/utils/debug-id_spec.ts` と `packages/angular/build/BUILD.bazel` です。BUILD.bazel の `jasmine_test` の読み方と、unit の `//packages/angular/build:test`（`shard_count = 4`）は [dev-server のシリーズの最終回](../vds/05-vds-tests-issues.md)で読んだので、ここでは繰り返しません。

1. [1. normalizeOptions](01-abl-options.md)
2. [2. ビルドの結果の形](02-abl-results.md)
3. [3. BundlerContext と後処理の残り](03-abl-context-post.md)
4. [4. ディスクに残るキャッシュ](04-abl-cache.md)
5. [5. 小さなプラグインと検査](05-abl-plugins.md)
6. **6. spec と issue**（この章）

## 1. 2 種類の spec

このシリーズの行を固める spec は 2 種類です。1 つは `tools/esbuild/` などに置いた、関数やクラスを直接呼ぶ unit の spec（`//packages/angular/build:test`）。もう 1 つが、`builders/application/tests/` の、builder を丸ごと動かして出力のファイルやログを見る spec です。

📄 `angular-cli/packages/angular/build/BUILD.bazel` L165–189 （▶ の行: 166, 168, 170, 172, 176–177, 187）

```python
165 │ ts_project(
166 ▶     name = "application_integration_test_lib",
167 │     testonly = True,
168 ▶     srcs = glob(include = ["src/builders/application/tests/**/*.ts"]),
169 │     deps = [
170 ▶         ":build",
171 │         "//packages/angular/build/private",
172 ▶         "//modules/testing/builder",
173 │         ":node_modules/@angular-devkit/architect",
174 │         ":node_modules/@angular-devkit/core",
175 │ 
176 ▶         # Base dependencies for the application in hello-world-app.
177 ▶         "//:node_modules/@angular/common",
178 │         "//:node_modules/@angular/compiler",
179 │         "//:node_modules/@angular/compiler-cli",
180 │         "//:node_modules/@angular/core",
181 │         "//:node_modules/@angular/platform-browser",
182 │         "//:node_modules/@angular/router",
183 │         ":node_modules/rxjs",
184 │         "//:node_modules/tslib",
185 │         "//:node_modules/typescript",
186 │         "//:node_modules/zone.js",
187 ▶         "//:node_modules/buffer",
188 │     ],
189 │ )
```

📄 `angular-cli/packages/angular/build/BUILD.bazel` L289–296 （▶ の行: 290, 292–294）

```python
289 │ jasmine_test(
290 ▶     name = "application_integration_tests",
291 │     size = "medium",
292 ▶     data = [":application_integration_test_lib"],
293 ▶     flaky = True,
294 ▶     shard_count = 25,
295 │ )
296 │ 
```

168 行目、`tests/` の下の .ts は全部この 1 つの ts\_project に入ります。176〜187 行目は、spec の中で作る小さなアプリ（hello-world-app）が import する本物のパッケージです。第 5 回の CommonJS の spec が `import 'buffer'` で警告を出させられるのは、187 行目で `buffer` を入れているからです。293 行目の `flaky = True` で、落ちた shard は 3 回まで走り直します。294 行目、25 の shard に分けます。

📄 `angular-cli/packages/angular/build/src/builders/application/tests/setup.ts` L9–20 （▶ の行: 13, 15–17）

```ts
 9 │ import { Schema } from '../schema';
10 │ 
11 │ // TODO: Consider using package.json imports field instead of relative path
12 │ //       after the switch to rules_js.
13 ▶ export * from '../../../../../../../modules/testing/builder/src';
14 │ 
15 ▶ export const APPLICATION_BUILDER_INFO = Object.freeze({
16 ▶   name: '@angular/build:application',
17 ▶   schemaPath: __dirname + '/../schema.json',
18 │ });
19 │ 
20 │ /**
```

📄 `angular-cli/modules/testing/builder/src/jasmine-helpers.ts` L28–57 （▶ の行: 28, 30, 45–46, 50, 53, 55）

```ts
28 ▶ let counter = 0;
29 │ 
30 ▶ export function describeBuilder<T>(
31 │   builderHandler: BuilderHandlerFn<T & json.JsonObject>,
32 │   options: { name?: string; schemaPath: string },
33 │   specDefinitions: (harness: JasmineBuilderHarness<T>) => void,
34 │ ): void {
35 │   let optionSchema = optionSchemaCache.get(options.schemaPath);
36 │   if (optionSchema === undefined) {
37 │     optionSchema = JSON.parse(readFileSync(options.schemaPath, 'utf8')) as json.schema.JsonSchema;
38 │     optionSchemaCache.set(options.schemaPath, optionSchema);
39 │   }
40 │   const harness = new JasmineBuilderHarness<T>(builderHandler, host, {
41 │     builderName: options.name,
42 │     optionSchema,
43 │   });
44 │ 
45 ▶   // The counter is needed to avoid duplicate describe names as they are not allowed.
46 ▶   describe((options.name || builderHandler.name) + ` (Suite: ${counter++})`, () => {
47 │     beforeEach(async () => {
48 │       harness.resetProjectMetadata();
49 │ 
50 ▶       await host.initialize().toPromise();
51 │     });
52 │ 
53 ▶     afterEach(() => host.restore().toPromise());
54 │ 
55 ▶     specDefinitions(harness);
56 │   });
57 │ }
```

spec は `describeBuilder(buildApplication, APPLICATION_BUILDER_INFO, …)` で始まります。46 行目、外側の describe の名前は 16 行目の `@angular/build:application` に「(Suite: N)」を足したものです。28 行目の N はファイルを読み込んだ順に増えるので、`--filter` で頭に `^` を付けるなら、この接頭辞から書くか、付けずに内側の describe の名前だけで絞ります。第 5 回は付けずに絞りました。50 行目と 53 行目、it ごとに仮のプロジェクトを初期化し、終わったら戻します。

## 2. 章ごとの約束と、固めている spec

| 章 | 本文の約束 | 固めている spec | 固めていない所 |
| --- | --- | --- | --- |
| [1. normalizeOptions](01-abl-options.md) | getLocaleBaseHref | options\_spec.ts の describe getLocaleBaseHref（it 7 件） | normalizeOptions そのものの unit の spec は無い |
| index・outputPath・appShell・outputMode | tests/options の index\_spec・output-path\_spec・app-shell\_spec、behavior/index-csr\_spec | フォルダを含む index の output、outputMode と appShell を一緒に書く it。output-mode.ts は名前が \_spec.ts でなく 1 度も走っていない |   |
| [2. ビルドの結果の形](02-abl-results.md) | Incremental の added・modified・removed、失敗からの戻り | behavior/rebuild-errors\_spec（it 4 件）・rebuild-assets\_spec（it 2 件）ほか rebuild-\* | results.ts・bundler-files.ts・bundler-execution-result.ts・build-action.ts の unit の spec。失敗の回の間に消えた出力の it |
| [3. BundlerContext と後処理](03-abl-context-post.md) | invalidate、debug ID | bundler-context\_spec.ts の invalidate（it 9 件）、utils/debug-id\_spec.ts（it 16 件） | 読み込みキャッシュを分け合う 2 つの context の it、esbuild の形の source map に 2 回通す it |
| [4. ディスクに残るキャッシュ](04-abl-cache.md) | getOrCreate の相乗り・名前空間の鍵 | cache\_spec.ts（MemoryCache 8 件・NamespacedCacheStore 5 件） | store.get の待ちの間の put でやり直す枝（3 節の M2） |
| SQLite の store | sqlite-cache-store\_spec.ts（31 件） | LMDB の store の spec は無い |   |
| 読み込み結果のキャッシュ | load-result-cache\_spec.ts（5 件）・persistent-load-result-cache\_spec.ts（13 件） | 時刻と大きさの速い道（M6）、治した行の書き戻し（M7）、resolveDir・pluginData、put のときに無かった依存 |   |
| [5. 小さなプラグインと検査](05-abl-plugins.md) | loader 属性・wasm・ignorelist・scripts | behavior/loader-import-attribute\_spec（9 件）・wasm-esm\_spec（7 件）、options/sourcemap\_spec（21 件）・scripts\_spec（20 件） | tools/esbuild の下のプラグインの unit の spec は 1 つも無い。wasm の 10,000 バイトの境目と、埋めない道（M9） |
| CommonJS の警告・ライセンス | options/allowed-common-js-dependencies\_spec（8 件）・extract-licenses\_spec（7 件） | scripts に入れたパッケージのライセンス |   |

第 1〜3 回の行は、それぞれの章の「テストと直し方」と同じ内容です。作業木で it を足して直してみた結果も、それぞれの章にあります。

## 3. 走らせ方と結果

📄 `走らせ方`

```
# ../angular-cli（44129f66a3）で
# 第 4 回：キャッシュの 6 つの describe（unit、4 shard）
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=^(MemoryCache|NamespacedCacheStore|MemoryLoadResultCache|extractDiskFilePath|PersistentLoadResultCache|SqliteCacheStore) "
# 第 1・3 回の unit（getLocaleBaseHref・BundlerContext・debug-id・hash）
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=^(getLocaleBaseHref|BundlerContext|debug-id|hash utility) "
# 第 5 回：builder を丸ごと動かす 7 つの describe（25 shard、flaky = True）
pnpm bazel test //packages/angular/build:application_integration_tests --nocache_test_results --test_output=all \
  "--test_arg=--filter=(Option: .extractLicenses.|Option: .allowedCommonJsDependencies.|Behavior: .loader import attribute.|Behavior: .Supports WASM/ES module integration.|Option: .scripts.|Option: .externalDependencies.|Option: .sourceMap.)"
```

📄 `自分で走らせた結果（2026-11-20）`

```
//packages/angular/build:test（キャッシュの 6 つ）
  Ran 15 / 16 / 15 / 16 specs → 62 specs, 0 failures   PASSED
//packages/angular/build:test（getLocaleBaseHref・BundlerContext・debug-id・hash utility）
  Ran 9 / 9 / 9 / 9 specs → 36 specs, 0 failures   PASSED
//packages/angular/build:application_integration_tests（7 つの describe）
  25 shard の Ran を足して 76 specs, 0 failures     PASSED in 14.2s
```

unit の `--filter` は shard ごとに効き、0 件に絞っても `PASSED` になるので、4 つの shard の「Ran N of M specs」を足して、it の数と比べました。キャッシュの 6 つは 13 + 31 + 5 + 13 = 62、2 つめは BundlerContext 9・getLocaleBaseHref 7・debug-id 16・hash utility 4 の 36 で、どちらも grep で数えた it の数と同じです。builder を丸ごと動かす 7 つの describe は、it の行が 73 で、allowed-common-js-dependencies\_spec.ts の AOT / JIT の繰り返し（1 つ増える）と sourcemap\_spec.ts の 3 つの拡張子の繰り返し（2 つ増える）を足して 76 です。

## 4. 1 か所ずつ変えて、落ちる it を数える

練習用の作業木（44129f66a3）で、第 4・5 回が読んだ行を 1 か所ずつ変えて bazel を走らせ、落ちた it を数えました。1 つ終わるたびに `git checkout -- <ファイル>` で戻しています（スクリプトは下）。変え方は、TypeScript の型検査を通る最小の書き換え（条件に `< 0` を足して偽にする、など）です。

> **🧪 DEMO — 変えた行と落ちた it（14 回）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/abl-tests-issues)

M0 は絞り込みの数を確かめるために変えずに走らせた回です。M2・M6・M7・M9 は、変えても 1 件も落ちませんでした。

- M2：cache\_spec.ts の store は `Map` で、`get` が同期で返るので、待ちの間に `put` が入る状況を作れません。
- M6：速い道を消しても、遅い道（中身のハッシュ）で同じ答えになります。速さの約束なので、答えを見る it では落ちません。
- M7：heal の it（persistent-load-result-cache\_spec.ts の 187 行目）は、治したあとの get が当たることだけを見て、store に書き戻したかは見ません。
- M9：wasm-esm\_spec.ts の「10kb 未満は埋める」（190 行目）の wasm は 70 バイトほどで、上限を 100 にしても埋めたままです。上限を超えて fetch や readFile になる道の it はありません。

📄 `記録のスクリプト（mutate.py）`

```
# 作業木で 1 か所ずつ変えて bazel を走らせ、落ちた it を記録する。終わるたびに git checkout で戻す。
# 使い方: WT=<作業木> LOGDIR=<ログの置き場> python3 mutate.py [M1 M2 ...] > mutate.json
import json, os, re, subprocess, sys

WT = os.environ['WT']
LOG = os.environ['LOGDIR']
E = 'packages/angular/build/src/tools/esbuild/'
UNIT = '//packages/angular/build:test'
APP = '//packages/angular/build:application_integration_tests'
F_CACHE = '--test_arg=--filter=^(MemoryCache|NamespacedCacheStore|MemoryLoadResultCache|extractDiskFilePath|PersistentLoadResultCache|SqliteCacheStore) '
def f_app(name):
    return f'--test_arg=--filter={name}'

M = [
    ('M0', '変えない（キャッシュの 6 つの describe）', None, None, None, UNIT, F_CACHE),
    ('M1', 'cache.ts 66 行目: 長さの接頭辞をやめる', E + 'cache.ts',
     '    this.#prefix = `${namespace.length}:${namespace}:`;', '    this.#prefix = `${namespace}:`;', UNIT, F_CACHE),
    ('M2', 'cache.ts 137〜139 行目: 待ちの間の書き込みでやり直さない', E + 'cache.ts',
     '      if ((this.#writeCounts.get(key) || 0) !== startWriteCount) {\n        return this.getOrCreate(key, creator);\n      }\n', '', UNIT, F_CACHE),
    ('M3', 'sqlite-cache-store.ts 303 行目: 縮まなくても圧縮した形で書く', E + 'sqlite-cache-store.ts',
     '        if (compressed.byteLength < data.byteLength) {', '        if (compressed.byteLength > -1) {', UNIT, F_CACHE),
    ('M4', 'sqlite-cache-store.ts 171 行目: ロック中でも DB を消す', E + 'sqlite-cache-store.ts',
     "        if (!isBusy && this.cachePath !== ':memory:') {", "        if ((!isBusy || true) && this.cachePath !== ':memory:') {", UNIT, F_CACHE),
    ('M5', 'load-result-cache.ts 63 行目: エラーでも前回の watchFiles を足さない', E + 'load-result-cache.ts',
     '    if (result.errors && result.errors.length > 0) {', '    if (result.errors && result.errors.length < 0) {', UNIT, F_CACHE),
    ('M6', 'persistent-load-result-cache.ts 167 行目: 時刻と大きさの速い道を使わない', E + 'persistent-load-result-cache.ts',
     '      if (stats.size === expected.size && stats.mtimeMs === expected.mtimeMs) {', '      if (stats.size === expected.size && stats.mtimeMs < 0) {', UNIT, F_CACHE),
    ('M7', 'persistent-load-result-cache.ts 196 行目: 治した行を書き戻さない', E + 'persistent-load-result-cache.ts',
     '  if (healed) {', '  if (healed && watchFiles.length < 0) {', UNIT, F_CACHE),
    ('M8', 'commonjs-checker.ts 123 行目: 警告した import の子も調べる', E + 'commonjs-checker.ts',
     '        // Skip all descendants since they are also most likely not ESM but solved by addressing this import\n        continue;\n', '', APP, f_app('Option: .allowedCommonJsDependencies.')),
    ('M9', 'wasm-plugin.ts 118 行目: 埋める上限を 10,000 から 100 に', E + 'wasm-plugin.ts',
     '      const inlineWasm = wasmContents.byteLength < 10_000;', '      const inlineWasm = wasmContents.byteLength < 100;', APP, f_app('Behavior: .Supports WASM/ES module integration.')),
    ('M10', 'license-extractor.ts 172 行目: LICENSE という名前だけを探す', E + 'license-extractor.ts',
     '              LICENSE_FILE_REGEXP.test(entry.name)', "              entry.name === 'LICENSE'", APP, f_app('Option: .extractLicenses.')),
    ('M11', 'sourcemap-ignorelist-plugin.ts 165 行目: 番号を 1 つも集めない', E + 'sourcemap-ignorelist-plugin.ts',
     "                if (location === 0 || (location > 0 && sources[index][location - 1] === '/')) {", "                if (location < -1) {", APP, f_app('Option: .sourceMap.')),
    ('M12', 'loader-import-attribute-plugin.ts 24 行目: 不正な loader を通す', E + 'loader-import-attribute-plugin.ts',
     '        if (!SUPPORTED_LOADERS.includes(loader)) {', '        if (!SUPPORTED_LOADERS.includes(loader) && loader.length < 0) {', APP, f_app('Behavior: .loader import attribute.')),
    ('M13', 'global-scripts.ts 129 行目: 2 つめ以降のファイルをつなげない', E + 'global-scripts.ts',
     '                bundleContent.addSource(new MagicString(fileContent, { filename }));', '                if (bundleContent.toString() === "") bundleContent.addSource(new MagicString(fileContent, { filename }));', APP, f_app('Option: .scripts.')),
]

only = sys.argv[1:]
res = []
for (mid, what, f, old, new, target, flt) in M:
    if only and mid not in only:
        continue
    if f:
        p = os.path.join(WT, f)
        s = open(p).read()
        assert s.count(old) == 1, (mid, s.count(old))
        open(p, 'w').write(s.replace(old, new))
    cmd = ['pnpm', 'bazel', 'test', target, '--nocache_test_results', '--test_output=all', flt]
    r = subprocess.run(cmd, cwd=WT, capture_output=True, text=True)
    out = r.stdout + r.stderr
    open(os.path.join(LOG, f'b-mut-{mid}.log'), 'w').write(out)
    if f:
        subprocess.run(['git', 'checkout', '--', f], cwd=WT, check=True)
    per_shard = {}
    for block in out.split('==================== Test output for ')[1:]:
        m = re.match(r'\S+(?: \(shard (\d+) of \d+\))?:', block)
        shard = m.group(1) if m and m.group(1) else '1'
        r2 = re.search(r'^Ran (\d+) of', block, re.M) or re.search(r'^(\d+) specs?,', block, re.M)
        if r2:
            per_shard[shard] = int(r2.group(1))
    ran = sum(per_shard.values())
    fails = sorted(set(re.findall(r'^\d+\) (.+)$', out, re.M)))
    # flaky = True の target は落ちると 3 回まで走るので、同じ失敗が繰り返し出る。名前の集合で数える
    nfail = len(fails)
    build_error = 'ERROR:' in out and ran == 0
    res.append({'id': mid, 'what': what, 'target': target.split(':')[1], 'specs': ran, 'failures': nfail,
                'failed': [re.sub(r' \(Suite: \d+\)', '', x) for x in fails], 'buildError': build_error, 'exit': r.returncode})
    print(json.dumps(res[-1], ensure_ascii=False), file=sys.stderr)
print(json.dumps(res, ensure_ascii=False, indent=1))

```

## 5. 開いている issue と、このシリーズの行

2026-11-20 に取った、angular/angular-cli のラベル `angular/build:application` の開いている issue 28 件のうち、このシリーズの行に当たるのは 12 件でした。ほかに gh の検索で、ラベルは `area: @angular/build` だけの 2 件を足しています。振り分けは本文を読んで決めたもので、issue の側が原因の行を名指ししているわけではありません。

30 件

| # | 題 | 作成 | 章 | このシリーズの行との関係 |
| --- | --- | --- | --- | --- |
| 32789 | \`deploy-url\` is not prepended to imported file url when using \`file\` loader in \`esbuild\` | 2026-03-18 | [1. normalizeOptions](01-abl-options.md) | loader の file と deployUrl。normalizeOptions が loader を残す行の先（esbuild の publicPath） |
| 32405 | Content Security Policy and SPAs | 2026-02-02 | 対象外 | CSP のハッシュを出す提案。index.html の章の話 |
| 31523 | Support for list of allowed licenses for 3rdpartylicenses.txt | 2025-10-20 | [5. 小さなプラグインと検査](05-abl-plugins.md) | license-extractor.ts は license の値を書き写すだけで、許す一覧を持たない（10 節） |
| 30742 | Expose internal "instrumentForCoverage" option | 2025-07-18 | [1. normalizeOptions](01-abl-options.md) | instrumentForCoverage は schema に無い内部の option（1 節の 123 行目） |
| 30689 | incorrect detection of zoneless app | 2025-07-10 | [5. 小さなプラグインと検査](05-abl-plugins.md) | polyfills に .ts / .js があると zoneless でないとみなし、wasm の allowAsync も偽になる（5 節） |
| 30676 | Esbuild Web Worker Type Safety and Redundant tsconfig.worker.json | 2025-07-09 | 対象外 | web worker の型検査 |
| 30675 | i18n causes esbuild chunks to be cache-busted on each deploy | 2025-07-08 | 対象外 | i18n の出力のハッシュ |
| 30494 | ng serve: The filename hash for Shared Workers changes on every rebuild, which constantly breaks the debugging session. | 2025-06-09 | 対象外 | Shared Worker の名前のハッシュ |
| 30412 | Angular build fails to resolve CSS when package is externalized | 2025-05-29 | [5. 小さなプラグインと検査](05-abl-plugins.md) | externalDependencies は esbuild の external で、Sass の @use の解決は別の道（1 節の 94〜96 行目の手前） |
| 30332 | Fonts are not resolved when using base href | 2025-05-16 | 対象外 | フォントの URL と base href（スタイルの章） |
| 29787 | Angular v19 prerender uses the wrong package.json | 2025-03-09 | 対象外 | SSR の package.json の imports |
| 29615 | Make autoCSP configurable | 2025-02-12 | [1. normalizeOptions](01-abl-options.md) | autoCsp を設定できるようにする提案（security の正規化） |
| 29546 | File replacements are ignored for web workers | 2025-01-30 | [1. normalizeOptions](01-abl-options.md) | fileReplacements の表（2 節）を web worker の束が使わない |
| 29188 | allow proxy config during ng build when using \`outputMode: server\` | 2024-12-19 | [1. normalizeOptions](01-abl-options.md) | outputMode: server のビルド中の proxy |
| 29130 | Worklet support | 2024-12-11 | 対象外 | worklet の対応 |
| 28994 | WebWorkers problem in Angular related to Vite \`optimizeDeps\` | 2024-11-28 | [5. 小さなプラグインと検査](05-abl-plugins.md) | ライブラリの中の new Worker と Vite の事前バンドル（external の判断は dev-server 側） |
| 28956 | Changes will no longer be recognized if you remove and re-add same component | 2024-11-25 | [4. ディスクに残るキャッシュ](04-abl-cache.md) | コンポーネントを消して戻すと変更が拾われない。MemoryLoadResultCache の逆引き（7 節）と watcher のどちらかは未確認 |
| 28874 | Spread operator slow with \`application\` builder | 2024-11-15 | 対象外 | スプレッド演算子の変換（target） |
| 28426 | Angular 18 production build doesn't work with vendor source maps | 2024-09-17 | [5. 小さなプラグインと検査](05-abl-plugins.md) | vendor のソースマップ。ignorelist（6 節）は番号を足すだけで、出力の有無は sourceMap の設定 |
| 27819 | JS support for PostCSS config | 2024-06-11 | 対象外 | PostCSS の JS の設定 |
| 27715 | Creating unnecessary excessive chunks | 2024-05-25 | 対象外 | チャンクの分け方 |
| 27473 | Angular never searches for zone.js in the correct path | 2024-04-16 | 対象外 | zone.js の場所の解決 |
| 27116 | \`externalPackagesPlugin\` slows down \`ng serve\` substantially | 2024-02-16 | [5. 小さなプラグインと検査](05-abl-plugins.md) | loader に text があると external-packages の onResolve が全部の import で build.resolve する（1 節 43・80 行目） |
| 27066 | Add built-in support for font size-adjustment | 2024-02-09 | 対象外 | フォントの size-adjust |
| 27038 | Built-In Font Optimization: Improve Angular Performance & Core Web Vitals | 2024-02-05 | 対象外 | フォントの最適化 |
| 26809 | Throw an error if client builds retain references to \`\*.server.ts\` files | 2024-01-05 | 対象外 | .server.ts の混入の検査 |
| 26615 | Wildcard imports without an extension are not supported in application builder | 2023-12-07 | 対象外 | 拡張子の無いワイルドカードの import() |
| 26350 | Esbuilder cannot localize 3rd party components | 2023-11-14 | 対象外 | i18n と ng serve |
| 34674 | Debug ID changes the bytes of polyfills and main but not their file names, so cached files fail the SRI check | 2026-11-08 | [3. BundlerContext と後処理の残り](03-abl-context-post.md) | ラベル angular/build:application は付いていない（area: @angular/build）。gh の検索で追加 |
| 34262 | Follow-up to issue: SSR: Add a way to configure externalDependencies for the server bundle only | 2026-10-06 | [1. normalizeOptions](01-abl-options.md) | 同上 |

## 6. このシリーズで見つけた食い違い

| 章 | 食い違い | 確かめ方 |
| --- | --- | --- |
| [1](01-abl-options.md) | outputMode を書くと appShell は無視される、という警告の文に対し、appShellOptions は作られる | 22.2.7 の ng build（その章の 3 節） |
| [1](01-abl-options.md) | index の output のフォルダが捨てられ、schema.json の説明と合わない | 作業木で it を足すと落ちる（その章の 4 節） |
| [1](01-abl-options.md) | tests/options/output-mode.ts が \_spec.ts で終わらず、1 度も走っていない | 名前を変えて走らせると 2 件とも落ちる |
| [2](02-abl-results.md) | 失敗をはさんだ再ビルドで、その間に消した出力が dist に残る | 作業木で it を足すと落ちる（その章の 5 節） |
| [2](02-abl-results.md) | dev-server の utils.ts 94 行目は外部のコンポーネントのスタイルを「64 桁の 16 進数 + .css」で見分けるが、cda8830710 から ID は xxHash の 16 桁で、NG\_HMR\_CSTYLES=1 の `?ngcomp` の応答がカプセル化されない | 記録の CSS の名前と curl（その章の最後の節） |
| [2](02-abl-results.md) | 同じスタイルが再ビルドのたびに 2 つ届き、古い方が後に残る（開いている #34248 の症状の仕組み） | NG\_HMR\_CSTYLES=1 の記録（その章と第 3 回の 5 節） |
| [3](03-abl-context-post.md) | watch で前の結果に debug ID をもう一度通すと ID が変わり、JS を変えていない回にも main.js が modified になる | 作業木の it と ng serve の記録（その章の 11 節） |
| [3](03-abl-context-post.md) | 読み込みキャッシュを分け合う context が、自分の読まないファイルの変更でも捨てられる（新しい本家の 9534f6287e で直った） | その章の 6 節のデモ |
| [4](04-abl-cache.md) | persistent-load-result-cache.ts の冒頭のコメント（鍵に中身、sha256）が、calculateCacheKey と hash.ts に合わない | git show d11a663e77・cda8830710 |
| [4](04-abl-cache.md) | PersistentLoadResultCache は resolveDir と pluginData を L2 に残さない。put のときに無かった依存は、あとで作られても検証されない | SQLite を L2 にした Node の記録。wasm の onLoad で 2 回目に 2 つのエラー（第 5 回の 5b） |
| [5](05-abl-plugins.md) | angular.json の scripts に入れたパッケージが 3rdpartylicenses.txt に出ない（metafile の入力が仮想のパスだけ） | カウンターに tslib を足した ng build（その章の 10 節） |

第 4 回の 2 つめは、まだどこからも使われていないクラスの話なので、いまの ng build では起きません。第 5 回の wasm の contents の onLoad は、その組み合わせで初めて表に出る前提（`pluginData` が必ずある）です。

## 聞かれそうな質問

**Q. application builder の spec を 1 つのファイルだけ走らせるには？**

`//packages/angular/build:application_integration_tests` に、そのファイルの内側の describe の名前で `--test_arg=--filter=…` を付けます。外側の名前は 46 行目で「@angular/build:application (Suite: N)」になるので、頭の `^` は付けないか、この接頭辞から書きます。25 の shard の「Ran N」を足して、it の数と同じかを確かめます（3 節）。

**Q. flaky = True の target で落ちたとき、何回分のログが出ますか？**

落ちた shard は 3 回まで走り直すので、同じ失敗が 3 回出ます（293 行目）。4 節の数は、shard ごとに最後の「Ran N」と、失敗の名前の重なりを除いた数で数えています（スクリプトの per\_shard）。

**Q. プラグインに unit の spec が無いのに、どこで壊れたと気づけますか？**

builder を丸ごと動かす spec です。4 節の M8・M10〜M13 は、その spec で落ちました。逆に M9 のように、spec の作るアプリが境目に届かない行は、変えても気づけません。

**Q. このシリーズで一番 it が足りない所はどこですか？**

4 節で 1 件も落ちなかった 4 つ（getOrCreate の待ちの間の put、L2 の速い道と書き戻し、wasm の上限）と、2 節の「固めていない所」です。第 4 回の PersistentLoadResultCache は、組み込まれる前に resolveDir と pluginData の it を足しておくと、wasm の onLoad のような使い方で壊れないことを確かめられます。

## 読み終えて

- このシリーズの行を固める spec は、unit の //packages/angular/build:test と、builder を丸ごと動かす application\_integration\_tests（25 shard・flaky）の 2 つ。
- 走らせた数は 62・36・76 件で、どれも 0 failures。--filter は Ran N を足して it の数と比べる。
- 1 か所ずつ変えた 13 回のうち、4 回は 1 件も落ちなかった（相乗りの待ち、L2 の速い道と書き戻し、wasm の上限）。
- 開いている 28 件のうち 12 件がこのシリーズの行に当たる。#27116（loader と external-packages）は第 5 回 1 節の近道の分岐がそのまま条件。

---

← 前: [小さなプラグインと検査：外部パッケージ・仮想モジュール・wasm・CommonJS・ライセンス](05-abl-plugins.md)
