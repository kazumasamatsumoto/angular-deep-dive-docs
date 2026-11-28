[目次](../README.md) › [webpack の builder の内側：@angular-devkit/build-angular と schematics の CLI](README.md) › 第 12 回 / 全 12 回

# spec と issue を読む：webpack の builder と schematics の CLI を固めているもの

> build\_angular と schematics\_cli の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、関係する issue の表と、このシリーズで見つけた食い違い。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bwp-tests-issues)

---

シリーズの最後に、第 1〜11 回で読んだ webpack の builder と schematics の CLI の約束を、どの bazel の target のどの spec が固めているかを地図にします。次に、手元での走らせ方と走った数、作業木で it を足して直した結果を並べ、開いている issue 23 件をこのシリーズの章に振り分けます。最後に、このシリーズで見つけた食い違いと不具合 39 件（うち不具合 17 件、origin/main で未修正 35 件）を 1 つの表にまとめます。

読む対象は angular-cli（44129f66a3）の `packages/angular_devkit/build_angular/BUILD.bazel` と `src/builders/*/` の spec、`packages/angular_devkit/schematics_cli/test/schematics_spec.ts` です。BUILD.bazel の読み方の一般論は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、spec の中で builder を動かす `BuilderHarness` は[dev-server の spec の章](../vds/05-vds-tests-issues.md)、application builder の側の同じ形の最終回は[bld-tests-issues](../bld/09-bld-tests-issues.md)です。

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
11. [11. schematics の CLI](11-bwp-schematics-cli.md)
12. **12. spec と issue**（この章）

## 1. spec の置き場と bazel の target

📄 `angular-cli/packages/angular_devkit/build_angular/BUILD.bazel` L189–216 （▶ の行: 190, 192, 194, 197, 213–215）

```python
189 │ ts_project(
190 ▶     name = "build_angular_test_lib",
191 │     testonly = True,
192 ▶     srcs = glob(
193 │         include = [
194 ▶             "src/**/*_spec.ts",
195 │         ],
196 │         exclude = [
197 ▶             "src/builders/**/*_spec.ts",
198 │         ],
199 │     ),
200 │     deps = [
201 │         ":build_angular",
202 │         ":build_angular_test_utils",
203 │         ":node_modules/@babel/core",
204 │         ":node_modules/tinyglobby",
205 │         "//:node_modules/@types/node",
206 │         "//:node_modules/prettier",
207 │         "//:node_modules/typescript",
208 │         "//packages/angular_devkit/architect/testing",
209 │         "//packages/angular_devkit/core",
210 │     ],
211 │ )
212 │ 
213 ▶ jasmine_test(
214 ▶     name = "test",
215 ▶     data = [":build_angular_test_lib"],
216 │ )
```

📄 `angular-cli/packages/angular_devkit/build_angular/BUILD.bazel` L281–310 （▶ の行: 281–282, 284–286, 295, 297–299）

```python
281 ▶ LARGE_SPECS = {
282 ▶     "app-shell": {},
283 │     "dev-server": {
284 ▶         "shards": 10,
285 ▶         "size": "large",
286 ▶         "flaky": True,
287 │         "extra_deps": [
288 │             "//:node_modules/@types/http-proxy",
289 │             "//:node_modules/@types/node",
290 │             "//:node_modules/http-proxy",
291 │             "//:node_modules/puppeteer",
292 │             "//:node_modules/undici",
293 │         ],
294 │     },
295 ▶     "extract-i18n": {},
296 │     "karma": {
297 ▶         "shards": 6,
298 ▶         "size": "large",
299 ▶         "flaky": True,
300 │         "extra_deps": [
301 │             "//:node_modules/@types/node",
302 │             "//:node_modules/karma",
303 │             "//:node_modules/karma-chrome-launcher",
304 │             "//:node_modules/karma-coverage",
305 │             "//:node_modules/karma-jasmine",
306 │             "//:node_modules/karma-jasmine-html-reporter",
307 │             "//:node_modules/puppeteer",
308 │             ":node_modules/webpack",
309 │         ],
310 │     },
```

📄 `angular-cli/packages/angular_devkit/build_angular/BUILD.bazel` L311–342 （▶ の行: 311–312, 320–322, 330, 332）

```python
311 ▶     "server": {
312 ▶         "size": "large",
313 │         "extra_deps": [
314 │             "//:node_modules/@angular/animations",
315 │         ],
316 │     },
317 │     "ng-packagr": {
318 │     },
319 │     "browser": {
320 ▶         "shards": 10,
321 ▶         "size": "large",
322 ▶         "flaky": True,
323 │         "extra_deps": [
324 │             "//:node_modules/@types/node",
325 │             "//:node_modules/@angular/animations",
326 │             "//:node_modules/@angular/material",
327 │             "//:node_modules/ajv",
328 │         ],
329 │     },
330 ▶     "prerender": {},
331 │     "browser-esbuild": {},
332 ▶     "ssr-dev-server": {
333 │         "extra_deps": [
334 │             ":node_modules/@angular/ssr",
335 │             "//:node_modules/@types/browser-sync",
336 │             "//:node_modules/@types/node",
337 │             ":node_modules/browser-sync",
338 │             "//:node_modules/express",
339 │             "//:node_modules/undici",
340 │         ],
341 │     },
342 │ }
```

📄 `angular-cli/packages/angular_devkit/build_angular/BUILD.bazel` L376–404 （▶ の行: 378–379, 381, 385, 395–396, 401）

```python
376 │ [
377 │     jasmine_test(
378 ▶         name = "build_angular_" + spec + "_test",
379 ▶         size = LARGE_SPECS[spec].get("size", "medium"),
380 │         data = [
381 ▶             ":build_angular_" + spec + "_test_lib",
382 │             # Helpers for `testing/builder` rely on the npm artifact, so we'll make
383 │             # sure it's available during this test. Notably that the package needs to
384 │             # available as a parent of `modules/testing/builder` for resolution to work!
385 ▶             "//modules/testing/builder:node_modules/@angular-devkit/build-angular",
386 │         ],
387 │         env = {
388 │             # Force IPv4 to resolve RBE resolution issues
389 │             "NODE_OPTIONS": "--dns-result-order=ipv4first",
390 │ 
391 │             # TODO: Replace Puppeteer downloaded browsers with Bazel-managed browsers,
392 │             # or standardize to avoid complex configuration like this!
393 │             "PUPPETEER_DOWNLOAD_PATH": "../../../node_modules/puppeteer/downloads",
394 │         },
395 ▶         flaky = LARGE_SPECS[spec].get("flaky", False),
396 ▶         shard_count = LARGE_SPECS[spec].get("shards", 2),
397 │         # These tests are resource intensive and should not be over-parallized as they will
398 │         # compete for the resources of other parallel tests slowing everything down.
399 │         # Ask Bazel to allocate multiple CPUs for these tests with "cpu:n" tag.
400 │         tags = [
401 ▶             "cpu:2",
402 │         ] + LARGE_SPECS[spec].get("tags", []),
403 │     )
404 │     for spec in LARGE_SPECS
```

spec は 2 つに分かれます。192〜199 行目、`builders/` の外の `*_spec.ts`（babel のプラグインや `utils/`）は 1 つの `build_angular_test_lib` になり、213〜216 行目の `:test` で走ります。`builders/` の中の spec は、281〜342 行目の `LARGE_SPECS` の key ごとに 1 つの target になり（376〜404 行目）、名前は 378 行目の `build_angular_<key>_test` です。396 行目の shard の数は、書いていなければ 2、dev-server と browser は 10、karma は 6 です。395 行目の `flaky` が真の 3 つ（dev-server・karma・browser）は、落ちた shard を bazel がもう一度走らせます。385 行目、どの target も `modules/testing/builder` の npm のパッケージの形の build-angular を使うので、spec はビルドされた後の builder を動かします。schematics の CLI の spec は別の BUILD（`schematics_cli/test/BUILD.bazel`）の `:test` で、npm のパッケージの形にした CLI を `node_modules` に置いて読みます。

| 章 | target | この章の行を固めている spec | 固めていないもの（各章の「テストと直し方」） |
| --- | --- | --- | --- |
| [1](01-bwp-browser.md)〜[4](04-bwp-webpack-plugins.md) | `:build_angular_browser_test` | `browser/tests/`・`browser/specs/` の assets・bundleBudgets・outputHashing・styles・scripts など | 失敗したときの `outputs` の形、束を混ぜる検査、`useDefineForClassFields`、ngComponentCount、最適化の順 |
| [5](05-bwp-babel.md) | `:test` | `tools/babel/plugins/*_spec.ts` の 4 つ | enum の左辺の副作用、1 文の static ブロックの副作用 |
| [6](06-bwp-dev-server.md) | `:build_angular_dev-server_test` | `dev-server/tests/options/` の proxyConfig・headers・servePath・forceEsbuild | allowedHosts（`xdescribe`）、forceEsbuild の prebundle の警告 |
| [7](07-bwp-server-ssr.md) | `:build_angular_server_test`・`:build_angular_ssr-dev-server_test` | `server/tests/` の 8 ファイル、`ssr-dev-server/specs/` の 3 ファイル | loader が足す export、Host の扱い（cfe970c8bc で足された）、stdout の無視の文、reload の順 |
| [8](08-bwp-prerender-appshell.md) | `:build_angular_prerender_test`・`:build_angular_app-shell_test` | `prerender/works_spec.ts`（8）・`app-shell/app-shell_spec.ts`（4） | 重要 CSS の二重、`@angular/build:application`、routesFile の空の行、inputIndexPath |
| [9](09-bwp-i18n.md) | `:build_angular_extract-i18n_test` | `extract-i18n/works_spec.ts`（9） | 差し込みの側（unit の spec なし。e2e の `tests/e2e/tests/i18n/`）、`@angular/build:application` の振り分け、copy-assets の symlink |
| [10](10-bwp-karma.md) | `:build_angular_karma_test` | `karma/tests/` の 18 ファイル | spec が見つからないときの文（success だけを見る） |
| [11](11-bwp-schematics-cli.md) | `schematics_cli/test:test` | `test/schematics_spec.ts`（5） | `--debug=false`（22.2.1 で足された）、数に見える文字列、先読み |

## 2. 走らせ方と結果

| target | 中身 | shard | 走らせ方 | 結果 | 時間 | 章 |
| --- | --- | --- | --- | --- | --- | --- |
| `//packages/angular_devkit/build_angular:test` | builders の外の \*\_spec.ts（babel の 4 つ・utils の 2 つ） | 1 | 全部 | 93 specs, 0 failures | 1.0s | 第 5 回 |
| `:build_angular_browser_test` | builders/browser/ の spec（shard 10・large・flaky） | 10 | --filter | 36・33・58・36 件（4 回に分けて --filter）、0 failures、pending 1 | 8〜22s | 第 1〜4 回 |
| `:build_angular_dev-server_test` | builders/dev-server/ の spec（vite と webpack-dev-server で 2 回ずつ） | 10 | --filter | 52 件、0 failures、pending 7 | 7.1s | 第 6 回 |
| `:build_angular_server_test` | builders/server/tests/ の 8 ファイル | 2 | 全部 | 21 + 21 = 42 specs, 0 failures | 118.9s | 第 7 回 |
| `:build_angular_ssr-dev-server_test` | ssr-dev-server/specs/ の 3 ファイル | 2 | 全部 | 2 + 2 = 4 specs, 0 failures | 38.7s | 第 7 回 |
| `:build_angular_prerender_test` | prerender/works\_spec.ts | 2 | 全部 | 4 + 4 = 8 specs, 0 failures | 53.9s | 第 8 回 |
| `:build_angular_app-shell_test` | app-shell/app-shell\_spec.ts | 2 | 全部 | 2 + 2 = 4 specs, 0 failures | 29.0s | 第 8 回 |
| `:build_angular_extract-i18n_test` | extract-i18n/works\_spec.ts | 2 | 全部 | 5 + 4 = 9 specs, 0 failures | 17.4s | 第 9 回 |
| `:build_angular_karma_test` | karma/tests/ の 18 ファイル（application と browser の build で 2 回ずつ） | 6 | 全部 | 14+14+14+14+13+13 = 82 specs, 0 failures, 1 pending | 54.3s | 第 10 回 |
| `//packages/angular_devkit/schematics_cli/test:test` | test/schematics\_spec.ts | 1 | 全部 | 5 specs, 0 failures | 0.9s | 第 11 回 |

📄 `第 7〜11 回の target を走らせたコマンドと結果`

```
cd ~/angular-research/angular-cli   # 44129f66a3
pnpm bazel test //packages/angular_devkit/build_angular:build_angular_server_test \
  //packages/angular_devkit/build_angular:build_angular_ssr-dev-server_test \
  //packages/angular_devkit/build_angular:build_angular_prerender_test \
  //packages/angular_devkit/build_angular:build_angular_app-shell_test \
  //packages/angular_devkit/build_angular:build_angular_extract-i18n_test \
  //packages/angular_devkit/schematics_cli/test:test --nocache_test_results --test_output=all
Executed 6 out of 6 tests: 6 tests pass.     # Elapsed time: 167.4s
pnpm bazel test //packages/angular_devkit/build_angular:build_angular_karma_test --nocache_test_results --test_output=errors
//packages/angular_devkit/build_angular:build_angular_karma_test         PASSED in 54.3s

# shard ごとの数は bazel の testlogs の test.log の最後の行（「21 specs, 0 failures」など）
ls "$(pnpm bazel info bazel-testlogs)"/packages/angular_devkit/build_angular/build_angular_server_test/
shard_1_of_2  shard_2_of_2
```

第 7〜11 回の 7 つの target は全部の spec を走らせました。shard ごとの数は、bazel の出力の `testlogs` の各 shard の `test.log` の最後の「N specs, 0 failures」の行を足しています（server は 21 + 21 で、8 つの spec のファイルの it の数 42 と同じ）。`--test_output=all` でも、大きな shard の出力は 1 MB を超えると端末に出ないので（server の shard 1）、`test.log` を読む方が確かです。browser と dev-server は shard が 10 で重いので、第 1〜6 回は章に関係する describe だけを `--test_arg=--filter=…` で走らせ、shard ごとの「Ran N of M specs」を足しています（0 件に絞っても PASSED になるため）。

## 3. spec の読みどころ

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/tests/setup.ts` L145–181 （▶ の行: 145–146, 166–169, 173, 175）

```ts
145 ▶ /** Runs the test against both an application- and a browser-builder context. */
146 ▶ export function describeKarmaBuilder<T>(
147 │   builderHandler: BuilderHandlerFn<T & json.JsonObject>,
148 │   options: { name?: string; schemaPath: string },
149 │   specDefinitions: ((
150 │     harness: JasmineBuilderHarness<T>,
151 │     setupTarget: typeof setupApplicationTarget,
152 │     isApplicationTarget: true,
153 │   ) => void) &
154 │     ((
155 │       harness: JasmineBuilderHarness<T>,
156 │       setupTarget: typeof setupBrowserTarget,
157 │       isApplicationTarget: false,
158 │     ) => void),
159 │ ) {
160 │   const optionSchema = getCachedSchema(options);
161 │   const harness = new JasmineBuilderHarness<T>(builderHandler, host, {
162 │     builderName: options.name,
163 │     optionSchema,
164 │   });
165 │ 
166 ▶   // The counter is needed to avoid duplicate describe names as they are not allowed.
167 ▶   describe((options.name || builderHandler.name) + ` (${counter++})`, () => {
168 ▶     for (const isApplicationTarget of [true, false]) {
169 ▶       describe(isApplicationTarget ? 'with application builder' : 'with browser builder', () => {
170 │         beforeEach(() => host.initialize().toPromise());
171 │         afterEach(() => host.restore().toPromise());
172 │ 
173 ▶         if (isApplicationTarget) {
174 │           specDefinitions(harness, setupApplicationTarget, true);
175 ▶         } else {
176 │           specDefinitions(harness, setupBrowserTarget, false);
177 │         }
178 │       });
179 │     }
180 │   });
181 │ }
```

karma の spec は 146 行目の `describeKarmaBuilder` で書かれ、168 行目の `for` で、build の target を application builder にした回と browser builder にした回の 2 回ずつ走ります。spec の `builderMode` の既定は `detect` なので、1 つの it が esbuild の道と webpack の道の両方を通ります（2 節の 82 specs は、この 2 回を数えたもの）。dev-server の spec の `describeServeBuilder` も同じ形です（[第 6 回](06-bwp-dev-server.md)）。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/karma/tests/options/include_spec.ts` L18–26 （▶ の行: 18, 21, 24–25）

```ts
18 ▶     it(`should fail when includes doesn't match any files`, async () => {
19 │       harness.useTarget('test', {
20 │         ...BASE_OPTIONS,
21 ▶         include: ['abc.spec.ts', 'def.spec.ts'],
22 │       });
23 │ 
24 ▶       const { result } = await harness.executeOnce();
25 ▶       expect(result?.success).toBeFalse();
26 │     });
```

spec が 1 つも見つからない場合の it は、25 行目で `success` が `false` であることだけを見ます。[第 10 回](10-bwp-karma.md)の記録では、このとき「did not match any spec files」の文がどこにも出ていません。logs を受け取って文を確かめる形にすると、その抜けが spec で分かります。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/prerender/works_spec.ts` L207–228 （▶ の行: 207–210, 216, 220–222, 225–226）

```ts
207 ▶   it('should inline critical css for route', async () => {
208 ▶     const run = await architect.scheduleTarget(
209 ▶       { ...target, configuration: 'production' },
210 ▶       { routes: ['foo'] },
211 │     );
212 │     const output = await run.result;
213 │     await run.stop();
214 │ 
215 │     expect(output.success).toBe(true);
216 ▶ 
217 │     const content = new TextDecoder().decode(
218 │       host.scopedSync().read(normalize('dist/foo/index.html')),
219 │     );
220 ▶ 
221 ▶     expect(content).toMatch(
222 ▶       /<style>p{color:#000}<\/style><link rel="stylesheet" href="styles\.\w+\.css" media="print" data-beasties-media="all">/,
223 │     );
224 │ 
225 ▶     // Validate that beasties does not process already critical css inlined stylesheets.
226 ▶     expect(content).not.toContain(`data-beasties-media="print"`);
227 │     expect(content).not.toContain(`media="print"></noscript>`);
228 │   });
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/app-shell/app-shell_spec.ts` L154–175 （▶ の行: 154, 158, 166, 170–172）

```ts
154 ▶   it('critical CSS is inlined', async () => {
155 │     host.writeMultipleFiles(appShellRouteFiles);
156 │     const overrides = {
157 │       route: 'shell',
158 ▶       browserTarget: 'app:build:production,inline-critical-css',
159 │     };
160 │ 
161 │     const run = await architect.scheduleTarget(target, overrides);
162 │     const output = await run.result;
163 │     await run.stop();
164 │ 
165 │     expect(output.success).toBe(true);
166 ▶     const fileName = 'dist/index.html';
167 │     const content = new TextDecoder().decode(host.scopedSync().read(normalize(fileName)));
168 │ 
169 │     expect(content).toContain('app-shell works!');
170 ▶     expect(content).toContain('p{color:#000}');
171 ▶     expect(content).toMatch(
172 ▶       /<link rel="stylesheet" href="styles\.[a-z0-9]+\.css" media="print" data-beasties-media="all">/,
173 │     );
174 │   });
175 │ 
```

prerender の 220〜222 行目は `p{color:#000}` の `<style>` と `<link>` の並びを、app-shell の 170〜172 行目は `<link>` の形を見ます。spec の `styles.css` は `p` の規則だけで、`p` は描く前の `index.html` に無いので、[第 8 回](08-bwp-prerender-appshell.md)の「browser のビルドと render-worker の 2 回差し込む」は起きません。4 節の作業木では、`body` の規則を足した it で二重を再現しました。

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/ssr-dev-server/specs/works_spec.ts` L80–97 （▶ の行: 81, 83–84, 87, 91, 96）

```ts
80 │   it('works', async () => {
81 ▶     const run = await architect.scheduleTarget(target);
82 │     const output = await run.result;
83 ▶     expect(output.success).toBe(true);
84 ▶     const response = await fetch(`http://localhost:${output.port}/`);
85 │     await run.stop();
86 │ 
87 ▶     expect(await response.text()).toContain('<title>HelloWorldApp</title>');
88 │   });
89 │ 
90 │   it('works with port 0', async () => {
91 ▶     const run = await architect.scheduleTarget(target, { port: 0 });
92 │     const output = await run.result;
93 │     await run.stop();
94 │ 
95 │     expect(output.success).toBe(true);
96 ▶     expect(output.baseUrl).not.toContain('4200');
97 │   });
```

📄 `angular-cli/packages/angular_devkit/build_angular/src/builders/extract-i18n/works_spec.ts` L123–142 （▶ の行: 124, 126, 133–134, 138, 141）

```ts
123 │   it('issues warnings for duplicate message identifiers', async () => {
124 ▶     host.appendToFile(
125 │       'src/app/app.component.ts',
126 ▶       'const c = $localize`:@@message-2:message contents`; const d = $localize`:@@message-2:different message contents`;',
127 │     );
128 │ 
129 │     const logger = new logging.Logger('');
130 │     const logs: string[] = [];
131 │     logger.subscribe((e) => logs.push(e.message));
132 │ 
133 ▶     const run = await architect.scheduleTarget(extractI18nTargetSpec, undefined, { logger });
134 ▶     await expectAsync(run.result).toBeResolvedTo(jasmine.objectContaining({ success: true }));
135 │ 
136 │     await run.stop();
137 │ 
138 ▶     expect(host.scopedSync().exists(extractionFile)).toBe(true);
139 │ 
140 │     const fullLog = logs.join();
141 ▶     expect(fullLog).toContain('Duplicate messages with id');
142 │   });
```

ssr-dev-server の 84 行目は `localhost` の URL で取りに行くので、44129f66a3 の Host の書き換え（[第 7 回](07-bwp-server-ssr.md)）は、`host` が既定の `localhost` のこの spec では表に出ません。cfe970c8bc は、Host を `example.com` にした要求が 500 になる it を足しています。extract-i18n の 126 行目は、同じ ID で文の違う 2 つの `$localize` を書き足し、141 行目でその警告の文を見ます。build の target は browser builder なので、[第 9 回](09-bwp-i18n.md)の webpack の側の抽出を通ります。

📄 `angular-cli/packages/angular_devkit/schematics_cli/test/schematics_spec.ts` L21–35 （▶ の行: 22–23, 25, 27, 30–33）

```ts
21 │   it('list-schematics works', async () => {
22 ▶     const args = ['--list-schematics'];
23 ▶     const res = await main({ args, stdout, stderr });
24 │     const output = stripVTControlCharacters(stdout.read()?.toString() || '');
25 ▶     expect(output).toMatch(/blank/);
26 │     expect(output).toMatch(/schematic/);
27 ▶     expect(res).toEqual(0);
28 │   });
29 │ 
30 ▶   it('errors when using camel case listSchematics', async () => {
31 ▶     const args = ['--listSchematics'];
32 ▶     await expectAsync(main({ args, stdout, stderr })).toBeRejectedWithError(
33 ▶       'Unknown argument listSchematics. Did you mean list-schematics?',
34 │     );
35 │   });
```

📄 `angular-cli/packages/angular_devkit/schematics_cli/test/schematics_spec.ts` L49–68 （▶ の行: 50–51, 53, 58, 63, 66–67）

```ts
49 │   it('dry-run is default when debug mode', async () => {
50 ▶     const args = ['blank', 'foo', '--debug'];
51 ▶     const res = await main({ args, stdout, stderr });
52 │     const output = stripVTControlCharacters(stdout.read()?.toString() || '');
53 ▶     expect(output).toMatch(/Debug mode enabled./);
54 │     expect(output).toMatch(/CREATE foo\/README.md/);
55 │     expect(output).toMatch(/CREATE foo\/.gitignore/);
56 │     expect(output).toMatch(/CREATE foo\/src\/foo\/index.ts/);
57 │     expect(output).toMatch(/CREATE foo\/src\/foo\/index_spec.ts/);
58 ▶     expect(output).toMatch(/Dry run enabled by default in debug mode./);
59 │     expect(res).toEqual(0);
60 │   });
61 │ 
62 │   it('error when no name is provided', async () => {
63 ▶     const args = ['blank'];
64 │     const res = await main({ args, stdout, stderr });
65 │     const output = stripVTControlCharacters(stderr.read()?.toString() || '');
66 ▶     expect(output).toMatch(/Error: name option is required/);
67 ▶     expect(res).toEqual(1);
68 │   });
```

schematics の CLI の spec は、`main` を直に呼んで、`PassThrough` の stdout と stderr を読みます。30 行目の it は、32〜34 行目で大文字の option のとき `main` が **reject する**ことを期待しているので、[第 11 回](11-bwp-schematics-cli.md)の「処理されない例外のスタックトレース」はこの spec では固定された形です。50 行目の `--debug` は値を付けない形で、44129f66a3 の `--debug=false` の誤りはこの 5 つの it では見えません。

## 4. 作業木で試したこと

📄 `作業木（44129f66a3）で it を足して直した記録`

```
# 第 8 回：prerender の重要 CSS の二重（作業木、44129f66a3）
works_spec.ts に「should inline critical css only once when index.html already matches it」を足す
  → 1 spec, 1 failure（Expected 2 to be 1.）
prerender/index.ts の _scheduleBuilds で browser の optimization.styles.inlineCritical を false にして渡す
  → build_angular_prerender_test PASSED（4 + 5 = 9 specs, 0 failures）

# 第 4 回：scripts の束を混ぜたときの検査と useDefineForClassFields（第 4 回の記録）
scripts_spec.ts と tsconfig_spec.ts に it を 2 つ足す → 2 件とも落ちる
helpers.ts の 211 行目と typescript.ts の 36 行目を直す → --filter=Option: "scripts"|Option: "tsConfig" の 23 件が 0 failures

# 第 5 回：enum とクラスの static ブロック（第 5 回の記録）
2 つの spec に it を 1 つずつ足す → 95 specs, 2 failures
adjust-typescript-enums.ts と adjust-static-class-members.ts を直す → 95 specs, 0 failures
```

どれも練習用の作業木（`git worktree add … 44129f66a3`）で、先に it だけを足して落ちることを確かめ、次に直して通ることを確かめ、作業木を消しました。第 8 回の分は差分を[第 8 回](08-bwp-prerender-appshell.md)の「テストと直し方」に載せています。第 4・5 回の分は各章の「テストと直し方」にあります。

## 5. 開いている issue と、このシリーズの行

2026-11-29 に gh で読んだ angular/angular-cli の開いている issue のうち、label が「area: @angular-devkit/build-angular」の 41 件と「area: @angular-devkit/schematics-cli」の 4 件から、このシリーズの範囲（webpack の builder と schematics の CLI）に当たるものを章に振り分けました。application builder だけの話（#26809・#26615 など）と、builder の外の話（#23088 の文書など）は除いています。

> **🧪 DEMO — issue を章で絞る**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bwp-tests-issues)

karma の issue が 10 件と最も多く、どれも webpack の側の束の作り方（組み込みの main・context の HTML・coverage）に当たります。schematics の CLI の 4 件のうち 2 件（#26412・#24360）は[第 11 回](11-bwp-schematics-cli.md)の型の推し方の行で、#26412 の「true / false が文字列」は schematic の option の側は dbd81a76c9（2026-01）で真偽になっていますが、issue は開いたままです。

## 6. このシリーズで見つけたもの（食い違いと不具合）

第 1〜11 回の記録で確かめた、説明・コメント・schema の約束と実装の食い違い、壊れる入力、不具合です。行は 44129f66a3、「main」は origin/main（2026-11-27）と 22.2.x の枝で直っているか、「issue」は gh で探した結果です。種類は、振る舞いが約束と違って利用者に見えるものを「不具合」、コメント・説明・使われない option など読み手が誤るものを「食い違い」、壊れる引数やファイルを「壊れる入力」、文言だけのものを「説明」にしました。

> **🧪 DEMO — 食い違いと不具合を絞る**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bwp-tests-issues)

> [!NOTE]
> **ポイント**
>
> 直ったものは 3 つの形に分かれます。22.2.x の枝に cherry-pick されて 22.2.7 に入ったもの（B1 の ssr-dev-server の Host、B15 の `--debug=false`、B14 の karma の schema の説明）、origin/main だけで直って 22.2.x には無いもの（B10 の copy-assets の symlink、#34164）、どちらでも未修正のものです。未修正のものの多くは、2 つの builder の間の名前の確かめ（prerender・app-shell・extract-i18n が `@angular/build:application` を知らない）と、記録しないと見えないログの抜け（karma の spec が無い文、ssr-dev-server の stdout の無視）でした。

## 聞かれそうな質問

**Q. webpack の builder の spec を 1 つだけ走らせるには？**

1 節の 378 行目の名前の target に、`--test_arg=--filter=<describe か it の名前>` を付けます。shard のどれか 1 つだけに入るので、ほかの shard は「Ran 0 of N specs」で PASSED になります。数は shard ごとに足します（2 節）。

**Q. karma の spec は、webpack の道と esbuild の道のどちらを確かめていますか？**

両方です。3 節の 168 行目で、build の target を application builder にした回と browser builder にした回の 2 回ずつ走り、`builderMode` は `detect` です。

**Q. このシリーズで見つけたもののうち、22.2.x で直っていないものは？**

6 節の表で「origin/main で未修正のものだけ」を選ぶと出ます。`@angular/build:application` を知らない 3 つの builder、prerender の重要 CSS の二重、karma の spec が無い文、babel の 2 つのプラグインの副作用などです。

**Q. spec が通っているのに見つかった不具合があるのはなぜですか？**

spec の入力が狭いからです。prerender の重要 CSS の spec は `p` の規則だけ（3 節の 220 行目）、ssr-dev-server の spec は `localhost` だけ（84 行目）、karma の spec は `success` だけ（25 行目）、schematics の CLI の spec は `--debug` の値なしだけ（50 行目）を見ています。

## 読み終えて

- build\_angular の spec は、`builders/` の外の unit の `:test` と、`LARGE_SPECS` の key ごとの `build_angular_<key>_test` に分かれ、shard と flaky は key ごとに決まる。
- 第 7〜11 回の 7 つの target は全部走らせて 0 failures（server 42・ssr-dev-server 4・prerender 8・app-shell 4・extract-i18n 9・karma 82・schematics の CLI 5）。
- karma と dev-server の spec は、同じ it を esbuild の道と webpack の道で 2 回ずつ走らせる。
- 見つけたものは 39 件。多くは spec の入力が狭いところ（p だけ、localhost だけ、success だけ）と、2 つの builder の名前の確かめの抜けにあった。

---

← 前: [schematics の CLI：bin/schematics.ts](11-bwp-schematics-cli.md)
