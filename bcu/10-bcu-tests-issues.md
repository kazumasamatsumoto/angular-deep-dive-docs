[目次](../README.md) › [@angular/build の compilation と utils の読み残し](README.md) › 第 10 回 / 全 10 回

# spec と issue を読む：compilation と utils を固めているテスト

> tools/angular と utils の \*\_spec.ts と builders の tests が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で足した it、@angular/build の開いている issue のうちこのシリーズの行に当たるものの表と、見つけた食い違いと不具合。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-tests-issues)

---

シリーズの最後に、第 1〜9 回で読んだ行の約束を、どの spec のどの it が固めているかを 1 つの表にします。次に、手元での走らせ方と走った数、練習用の作業木で it を足して直した結果を並べます。最後に、開いている issue 59 件をこのシリーズの章に振り分け、このシリーズで見つけた食い違いと不具合をまとめます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/tools/angular/` と `src/utils/` の `*_spec.ts`、それに `src/builders/application/tests/` と `src/builders/dev-server/tests/` です。BUILD.bazel の 2 つの target（unit の `//packages/angular/build:test` と builder を丸ごと動かす `:application_integration_tests`）の読み方は [abl-tests-issues の章](../abl/06-abl-tests-issues.md)で、filter の数え方は [esb-tests-issues の章](../esb/07-esb-tests-issues.md)で読んだので繰り返しません。

1. [1. AotCompilation の残り](01-bcu-aot.md)
2. [2. ParallelCompilation](02-bcu-parallel.md)
3. [3. hmr-candidates](03-bcu-hmr.md)
4. [4. AngularHost と遅延ルート](04-bcu-host.md)
5. [5. 予算と出力の表](05-bcu-budget.md)
6. [6. index.html の仕上げ](06-bcu-index.md)
7. [7. 自動 CSP](07-bcu-auto-csp.md)
8. [8. オプションの小道具](08-bcu-options.md)
9. [9. パス・URL・ソースマップ](09-bcu-paths.md)
10. **10. spec と issue**（この章）

## 1. 章ごとの約束と、固めている spec

このシリーズで読んだファイルのうち、unit の spec を持つのは、tools/angular の angular-compilation と lazy-routes-transformer、utils の bundle-calculator・augment-index-html・auto-csp・inline-fonts・environment-options・normalize-cache・path・source-map・hash です。hmr-candidates・typescript-printer・parallel-compilation・angular-host・stats-table・index-html-generator・i18n-options・normalize-asset-patterns・postcss-configuration・load-proxy-config・url・version には unit の spec がありません。

| 章 | 本文の約束 | 固めている spec | 固めていない所 |
| --- | --- | --- | --- |
| [1. AotCompilation](01-bcu-aot.md) | tsconfig の上書きと警告、ホスト、影響を受けたファイル、診断の集め方と esbuild のメッセージへの変換、emit | tools/angular/compilation/angular-compilation\_spec.ts の describe TypeScriptCompilation（61 行目）と transformCompilerOptions（197 行目、it 10 件） | AotCompilation の initialize・collectDiagnostics・emitAffectedFiles の単体の it。diagnostics.ts の spec（main で入った）。警告の注記の文字列 |
| [2. ParallelCompilation](02-bcu-parallel.md) | createAngularCompilation の選び方、ワーカーとの MessageChannel、スタイルの頼み返し、update の順番 | 同じ spec の describe createAngularCompilation（169 行目、it 5 件。どれも並列を作らない） | parallel-compilation.ts・parallel-worker.ts・jit-compilation.ts の単体の it（main に parallel-compilation\_spec.ts が 7f4de14688 で入った） |
| [3. hmr-candidates](03-bcu-hmr.md) | 変わったファイルからコンポーネントを探し、テンプレートとスタイルだけの変更かを AST で比べる | builders/dev-server/tests/behavior/component-updates\_spec.ts（15 行目）。候補を返す道は通らない | hmr-candidates.ts と typescript-printer.ts の unit の spec が無い。`styleUrls` の配列の変更 |
| [4. AngularHost](04-bcu-host.md) | リソースの読み込みと変換、外部スタイルの ID の URI、loadComponent / loadChildren に ɵentryName を足す | tools/angular/transformers/lazy-routes-transformer\_spec.ts（12 行目、it 9 件） | angular-host.ts と uri.ts の spec（22.2.7 の 35702a5986 で angular-host\_spec.ts が入った）。ブロックの 2 文目の return、`.catch` |
| [5. 予算と表](05-bcu-budget.md) | 予算の種類としきい値、Initial と Lazy、表の列と並び、警告とエラーの文言 | utils/bundle-calculator\_spec.ts の checkBudgets()（18 行目、it 10 件） | stats-table.ts の spec が無い。見積もりの無い表の行の末尾 |
| [6. index.html](06-bcu-index.md) | crossorigin と SRI、遅延チャンクの importmap、ヒントの属性、lang と dir、preconnect、フォントの取りに行き方 | utils/index-file/augment-index-html\_spec.ts（11 行目、it 28 件）、inline-fonts\_spec.ts（11 行目、it 7 件、ネットに取りに行く）、application/tests/options/subresource-integrity\_spec.ts（it 9 件） | importmap と `<base>` の並び、`<base` の文字の判定、IndexHtmlGenerator の spec、プロキシと UA |
| [7. 自動 CSP](07-bcu-auto-csp.md) | インラインのハッシュ、外部の script のローダー、meta の位置、CSP の各指定 | utils/index-file/auto-csp\_spec.ts（27 行目、it 11 件）、subresource-integrity\_spec.ts の 242 行目 | `<head>` が無い HTML、`unsafeEval`、外部の script の中の文字（type の大文字は 22.2.7 の spec に入った） |
| [8. オプション](08-bcu-options.md) | NG\_ の環境変数、ロケールの表と翻訳の重ね方、assets の正規化、キャッシュの置き場、PostCSS と proxy の設定 | utils/environment-options\_spec.ts（11 行目、it 11 件、NG\_BUILD\_MAX\_WORKERS だけ）、normalize-cache\_spec.ts（14 行目、it 6 件）、application/tests/options/assets\_spec.ts、dev-server/tests/options/proxy-config\_spec.ts | この章で読んだ環境変数、i18n-options・normalize-asset-patterns・postcss-configuration・load-proxy-config の unit の spec |
| [9. パスとソースマップ](09-bcu-paths.md) | POSIX のパス、中かの判定、URL の結合、末尾のコメントの検出と削除と読み込み、xxHash、版の検査 | utils/path\_spec.ts（it 8 件、Windows の 1 件は macOS で走らない）、source-map\_spec.ts（it 33 件）、hash\_spec.ts（it 4 件） | toPosixPath・url.ts・version.ts の spec。正規表現の中の引用符（22.2.7 の spec に入った） |

## 2. 走らせ方と結果

📄 `走らせ方`

```
# ../angular-cli（44129f66a3）で。target は packages/angular/build/BUILD.bazel の jasmine_test(name = "test")（shard_count = 4）
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=(augment-index-html|auto-csp|environment options|normalizeCacheOptions|isSubDirectory|canonicalizePath|removeSourceMappingURL|loadInputSourceMap|isTrailingSourceMapComment|hash utility|AngularCompilation|lazyRoutesTransformer|bundle-calculator)'

# 練習用の作業木（44129f66a3 + 6 回目の直し）で、builder を丸ごと動かす SRI の spec だけ
pnpm bazel test //packages/angular/build:application_integration_tests --nocache_test_results --test_output=all \
  '--test_arg=--filter=Option: "subresourceIntegrity"'
```

📄 `自分で走らせた結果（2026-11-20）`

```
//packages/angular/build:test（shard_count = 4）
  Ran 33 of 506 specs / Ran 37 of 510 specs / Ran 35 of 508 specs / Ran 37 of 510 specs
  → 142 件、0 failures、PASSED

//packages/angular/build:application_integration_tests（shard_count = 25、作業木）
  Ran 1 of 372 specs が 9 つの shard、Ran 0 of 371 specs が 16 の shard → 9 件、0 failures、PASSED
```

unit の `--filter` は shard ごとに効き、0 件に絞っても `PASSED` になるので、4 つの shard の「Ran N」を足して、grep で数えた it の数と比べました。142 件は、第 1〜5 回の 41 件（AngularCompilation の describe 22・lazyRoutesTransformer 9・bundle-calculator 10）と、第 6〜9 回の 101 件（augment-index-html 28・auto-csp 11・environment options 11・normalizeCacheOptions 6・path 8・source-map 33・hash 4）の和です。inline-fonts\_spec.ts の 7 件は、本物の Google Fonts と Typekit に取りに行くので、手元では走らせていません。

## 3. spec の読みどころ

📄 `angular-cli/packages/angular/build/src/utils/index-file/augment-index-html_spec.ts` L11–24 （▶ の行: 13–15）

```ts
11 │ describe('augment-index-html', () => {
12 │   const indexGeneratorOptions: AugmentIndexHtmlOptions = {
13 ▶     html: '<html><head></head><body></body></html>',
14 ▶     baseHref: '/',
15 ▶     sri: false,
16 │     files: [],
17 │     loadOutputFile: async (_fileName: string) => '',
18 │     entrypoints: [
19 │       ['scripts', false],
20 │       ['polyfills', true],
21 │       ['main', true],
22 │       ['styles', false],
23 │     ],
24 │   };
```

📄 `angular-cli/packages/angular/build/src/utils/index-file/augment-index-html_spec.ts` L462–476 （▶ の行: 464–466, 469, 471–474）

```ts
462 │   it('should escape `<` characters in inline importmap JSON', async () => {
463 │     const { content } = await augmentIndexHtml({
464 ▶       ...indexGeneratorOptions,
465 ▶       sri: true,
466 ▶       chunksIntegrity: new Map([['lazy<chunk.js', 'sha384-abc']]),
467 │     });
468 │ 
469 ▶     const match = content.match(/<script type="importmap">([^<]+)<\/script>/);
470 │     expect(match).withContext('importmap script tag missing').not.toBeNull();
471 ▶     expect(match?.[1]).toContain('./lazy\\u003cchunk.js');
472 ▶     expect(match?.[1]).not.toContain('./lazy<chunk.js');
473 ▶     expect(JSON.parse(match?.[1] ?? '{}')).toEqual({
474 ▶       integrity: { './lazy<chunk.js': 'sha384-abc' },
475 │     });
476 │   });
```

augment-index-html の it は、13 行目の共通の HTML（`<head></head>` だけで `<base>` が無い）と 14 行目の `baseHref: '/'` を使います。そのため importmap の it（462 行目）は、6 回目の 264〜268 行目の「`<base>` を足す道」だけを通り、471〜472 行目で `<` が `\u003c` に逃がされたこと、473〜474 行目で `./` の付いた鍵を見ます。`<base>` を書いた index.html の道（280〜282 行目）は、この describe には 1 件もありません。

📄 `angular-cli/packages/angular/build/src/utils/index-file/auto-csp_spec.ts` L225–243 （▶ の行: 226, 231, 237–241）

```ts
225 │   it('should preserve integrity and crossorigin attributes in loader script', async () => {
226 ▶     const result = await autoCsp(`
227 │       <html>
228 │         <head>
229 │         </head>
230 │         <body>
231 ▶           <script src="./main.js" type="module" crossorigin="anonymous" integrity="sha384-xyz123"></script>
232 │           <div>Some text </div>
233 │         </body>
234 │       </html>
235 │     `);
236 │ 
237 ▶     const csps = getCsps(result);
238 ▶     expect(csps).toHaveSize(1);
239 ▶     expect(csps[0]).toMatch(CSP_SINGLE_HASH_REGEX);
240 ▶     expect(result).toContain(
241 ▶       `const scripts = [['./main.js', 'module', false, false, "sha384-xyz123", "anonymous"]];`,
242 │     );
243 │   });
```

7 回目の 117〜118 行目（50994d76e5）を固める it です。240〜241 行目は、ローダーの配列の 1 行を文字列のまま比べます。22.2.7 では 7 回目の 7 節の直しで `'module'` が `"module"` になるので、v22.2.7 の spec ではこの文字列も変わっています。

📄 `angular-cli/packages/angular/build/src/utils/environment-options_spec.ts` L11–28 （▶ の行: 14–15, 17, 20–21, 26）

```ts
11 │ describe('environment options - maxWorkers', () => {
12 │   const originalEnvValue = process.env['NG_BUILD_MAX_WORKERS'];
13 │ 
14 ▶   function loadEnvironmentOptions(): typeof import('./environment-options') {
15 ▶     delete require.cache[require.resolve('./environment-options')];
16 │ 
17 ▶     return require('./environment-options');
18 │   }
19 │ 
20 ▶   afterEach(() => {
21 ▶     if (originalEnvValue !== undefined) {
22 │       process.env['NG_BUILD_MAX_WORKERS'] = originalEnvValue;
23 │     } else {
24 │       delete process.env['NG_BUILD_MAX_WORKERS'];
25 │     }
26 ▶     delete require.cache[require.resolve('./environment-options')];
27 │   });
28 │ 
```

環境変数の値はファイルを読んだときに 1 回だけ決まるので（8 回目の 1 節）、15 行目と 26 行目で `require.cache` から消して、読み直します。`NG_BUILD_DEBUG_OPTIMIZE` の it を足すなら、この `loadEnvironmentOptions` をそのまま使えます。

📄 `angular-cli/packages/angular/build/src/utils/normalize-cache_spec.ts` L36–60 （▶ の行: 45, 48, 51, 53, 55–57）

```ts
36 │   it('should resolve cache path relative to main repository root in a git worktree', async () => {
37 │     const mainRepoRoot = join(tempDir, 'main-repo');
38 │     const mainGitDir = join(mainRepoRoot, '.git');
39 │     const worktreeRoot = join(tempDir, 'worktree');
40 │ 
41 │     // Create main repo structure
42 │     await mkdir(mainGitDir, { recursive: true });
43 │ 
44 │     // Create worktree folder and .git file pointing to the main repo's worktree metadata folder
45 ▶     const worktreeMetadataDir = join(mainGitDir, 'worktrees/wt-1');
46 │     await mkdir(worktreeMetadataDir, { recursive: true });
47 │     await mkdir(worktreeRoot, { recursive: true });
48 ▶     await writeFile(join(worktreeRoot, '.git'), `gitdir: ${worktreeMetadataDir}`);
49 │ 
50 │     // Create the commondir file in the worktree metadata folder pointing back to the main .git dir
51 ▶     await writeFile(join(worktreeMetadataDir, 'commondir'), '../..');
52 │ 
53 ▶     const options = normalizeCacheOptions({}, worktreeRoot);
54 │ 
55 ▶     expect(options.basePath).toBe(resolve(mainRepoRoot, '.angular/cache'));
56 ▶     expect(options.path).toBe(resolve(mainRepoRoot, '.angular/cache', '0.0.0-PLACEHOLDER'));
57 ▶     expect(options.localBasePath).toBe(resolve(worktreeRoot, '.angular/cache'));
58 │     expect(options.localPath).toBe(resolve(worktreeRoot, '.angular/cache', '0.0.0-PLACEHOLDER'));
59 │   });
60 │ 
```

8 回目の 6 節の worktree の道を、一時のフォルダに `.git` のファイル（48 行目）と `commondir`（51 行目）を作って試します。worktree の直下のワークスペースだけで、デモの「worktree の中の apps/web」の形はこの版にありません（22.2.x の b198044048 で足されました）。

📄 `angular-cli/packages/angular/build/src/utils/source-map_spec.ts` L81–89 （▶ の行: 82–83, 86–88）

```ts
81 │   it('should not remove sourcemap comments inside regex literals', () => {
82 ▶     const code = 'const regex = /\\/\\/# sourceMappingURL=inline.js.map/;';
83 ▶     expect(removeSourceMappingURL(code)).toBe(code);
84 │   });
85 │ 
86 ▶   it('should not affect normal division operators', () => {
87 ▶     const code = 'const ratio = 10 / 2;\n//# sourceMappingURL=main.js.map';
88 ▶     expect(removeSourceMappingURL(code)).toBe('const ratio = 10 / 2;\n');
89 │   });
```

「正規表現のリテラルの中」の it は、82 行目のとおり `\/\/` と書いた形だけで、9 回目の 124〜138 行目の「`\` が奇数個なら飛ばす」を固めています。引用符を含む `/"/` の形は無く、その後の文字列を読み違える状態機械のずれ（#34590）は、この describe では見えませんでした。

## 4. 作業木で試したこと

練習用の作業木（44129f66a3）で it を足し、落ちるのを見てから直しを当てました。詳しい手順は [6 回目](06-bcu-index.md)の「テストと直し方」にあります。作業木は試したあとに消しました。

| 章 | したこと | 結果 |
| --- | --- | --- |
| [6](06-bcu-index.md) | augment-index-html\_spec.ts に「`<base href="/">` のある HTML で、importmap が `<base>` より後ろ」を期待する it を足す | 「Expected 12 to be greater than 89.」で落ちる |
| [6](06-bcu-index.md) | augment-index-html.ts の `case 'base'` で、`<base>` の開始タグを先に出してから importmap を出し、`return` する | augment-index-html と auto-csp の 40 件、builder の subresourceIntegrity の 9 件が通る |

## 5. 開いている issue と、このシリーズの行

2026-11-20 に gh で読んだ、angular/angular-cli のラベル `area: @angular/build` の開いている 55 件と `angular/build:application` の 28 件（重なりを除いて 59 件）のうち、このシリーズの行に当たるのは 16 件でした。振り分けは本文と issue を読んで決めたもので、振り分けた 16 件のうち、issue の側がこのシリーズの行を名指ししているのは #34725 だけです。

> **🧪 DEMO — 開いている issue を章で絞る**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bcu-tests-issues)

## 6. このシリーズで見つけたもの（食い違いと不具合）

各章で、ソースの行と、自分で動かした記録で確かめたものです。「main」は新しい本家（815c98e07a）、「22.2.x」はリリースの枝です。

| 章 | 何が起きるか | 行 | 確かめ方と今の状態 |
| --- | --- | --- | --- |
| [1](01-bcu-aot.md) | （食い違い）tsconfig の警告の注記の文字列に空白が無く、綴りも違う | compiler-options.ts の 96〜97 行目 | .ts を transpile して呼んだ記録。main の 13a7346493（22.2.x は 0dc103735e）で直った |
| [1](01-bcu-aot.md) | （不具合）ファイルの先頭（start が 0）の診断に、行・列・行の全文が付かない | diagnostics.ts の 40 行目の `if (info.start)` | 2 つの版の convertTypeScriptDiagnostic に同じ診断を渡した記録。main の cd70beb20d（22.2.x は e78cf0ae96）で直った |
| [1](01-bcu-aot.md) | （通らない道）sourceMap の道で、`.map` を入れた鍵に JS を上書きする | aot-compilation.ts の 452〜460 行目 | 行の読み比べ。compiler-options.ts の 119 行目で通らない |
| [2](02-bcu-parallel.md) | （約束）並列のとき、update を呼ばずに initialize すると、ワーカーの SourceFile のキャッシュが古いまま emit する | parallel-worker.ts（呼ぶ側の compiler-plugin.ts の 200〜202 行目が守っている） | 本物のワーカーで update を呼ばない記録 |
| [3](03-bcu-hmr.md) | （不具合）対応するフィールドの一覧が `'stylesUrl'` で、`styleUrls` の配列を変えると HMR の候補にならない | hmr-candidates.ts の 217〜223 行目 | 本物と 222 行目だけ替えた写しの記録。22.2.7 と main も同じ |
| [4](04-bcu-host.md) | （食い違い）アロー関数のブロックの 2 文目の return、`.then().catch()` の loadComponent に ɵentryName が付かない | lazy-routes-transformer.ts の 78〜89 行目 | 13 通りの入力の記録。SSR の modulepreload の対応づけから抜けるだけで、アプリは動く |
| [5](05-bcu-budget.md) | （食い違い）見積もりの無い表で、ファイルの行の末尾に「 \| 」が残る。サーバーの段は 23 個の空白も続く | stats-table.ts の 168〜174 行目 | 記録と、このサイトの development のビルドの表 |
| [6](06-bcu-index.md) | （不具合）`<base>` を書いた index.html では、遅延チャンクの integrity の importmap が `<base>` の前に出る。深いパスで直接開くと鍵がずれ、遅延チャンクの integrity が検査されない | augment-index-html.ts の 280〜282 行目と 301 行目 | headless Chrome の記録（`/deep/route` で違う integrity のチャンクが読み込まれた）と、作業木の it（4 節）。main も同じ行。gh で見つからなかった |
| [6](06-bcu-index.md) | （食い違い）`<base>` も baseHref も無いと importmap が出ない。`<head>` の無い HTML も同じ | 264 行目と 274〜284 行目、340〜342 行目 | Node の記録 |
| [6](06-bcu-index.md) | （食い違い）コメントの中に `<base` と書くと、baseHref の `<base>` を足さない | 246 行目の `html.includes('<base')` | Node の記録。main も同じ |
| [7](07-bcu-auto-csp.md) | （食い違い）`<head>` の開始タグが無いと、CSP の meta が出ず、警告も無い | auto-csp.ts の 174 行目 | Node の記録。main も同じ |
| [7](07-bcu-auto-csp.md) | （食い違い）外部の script の中に書いた文字が、ローダーに置き換えたあと `<body>` の HTML として残る | 144 行目の `emitText` | 22.2.7 の autoCsp に 1 行の HTML を当てた記録。main も同じ |
| [7](07-bcu-auto-csp.md) | （不具合・22.2.7 で直った）`type="Module"` や `application/javascript` の外部の script がローダーに回らず、`'strict-dynamic'` で止められる | 47 行目と 57 行目 | headless Chrome で 2 つとも `script-src-elem` の違反。22.2.x の e31bd66f67（main は 8e1b20253a） |
| [8](08-bcu-options.md) | （食い違い）`NG_BUILD_DEBUG_OPTIMIZE` に名前を並べると、書いた物が「戻る」形で、beautify は消せず、知らない値は `1` と同じ | environment-options.ts の 60〜82 行目 | 子プロセスの記録。main も同じ |
| [8](08-bcu-options.md) | （食い違い）`translation` の無いロケールの object に「Expected a string, array of strings, or object.」と出る | i18n-options.ts の 159・187 行目 | Node の記録。main も同じ |
| [8](08-bcu-options.md) | （不具合）sourceRoot と同じ頭の兄弟のフォルダ（`src-assets`）を assets に書くと「outside of the output path」で止まる。object の形は渡した object に output を書き込む | normalize-asset-patterns.ts の 38・40・42 行目と 78 行目 | Node の記録。main の 58c30c05f6 と c042a66fed で直った（22.2.x には無い） |
| [8](08-bcu-options.md) | （不具合・22.2.7 で直った）worktree の中の入れ子のワークスペースのキャッシュが、元のリポジトリの直下になる | normalize-cache.ts の 79 行目 | 2 つの版の記録。22.2.x の b198044048（main は aa53b97247） |
| [8](08-bcu-options.md) | （不具合・22.2.7 で直った）proxy の配列の形の文字列の context を捨てる、glob の鍵の順番が変わる、glob の正規表現が `?` 以降にも当たる | load-proxy-config.ts の 93〜95・117〜118・116 行目 | 2 つの版の記録。22.2.x の 996e47f809・405bfa370a・7d9ba62803 |
| [8](08-bcu-options.md) | （食い違い）読み込んだ proxy の設定の object を書き換えるので、同じプロセスで 2 回目に読むと配列の形が空になる | 100 行目と 143 行目 | Node の記録。dev-server は 1 回だけ呼ぶ。main も同じ |
| [8](08-bcu-options.md) | （食い違い）postcss.config.json の object の形で、値が `true` のプラグインを黙って飛ばす | postcss-configuration.ts の 119〜121 行目 | Node の記録。main も同じ |
| [9](09-bcu-paths.md) | （不具合・22.2.7 で直った）`/"/` のような正規表現の後ろで、文字列の中の `//# sourceMappingURL=` を消して壊れた JavaScript を返す | source-map.ts の 96〜257 行目（正規表現の状態が無い） | 2 つの版の記録。#34590、#34632（22.2.x は 631ac8aa66） |
| [9](09-bcu-paths.md) | （食い違い）`joinUrlParts` は `HTTPS://` の大文字を URL と見なさず、頭に `/` を付ける | url.ts の 118 行目 | Node の記録。main も同じ |

## 聞かれそうな質問

**Q. utils の 1 つの spec のファイルだけを走らせるには？**

`//packages/angular/build:test` に `--test_arg=--filter=<describe の名前>` を付けます。4 つの shard の「Ran N」を足して、grep で数えた it の数と同じかを確かめます（2 節）。`augment-index-html` なら 28 件です。

**Q. index-html-generator.ts を直したら、どこに spec を足せばよいですか？**

44129f66a3 にはこのファイルの unit の spec がありません。同じフォルダに `index-html-generator_spec.ts` を作れば、BUILD.bazel の `unit_test_lib` の glob（`src/**/*_spec.ts`）に入り、何も足さずに `:test` で走ります。6 回目のデモの「SSR と autoCsp を同時に」のような、コンストラクタの列の組み立ての it が最初の 1 件になります。

**Q. inline-fonts\_spec.ts を手元で走らせないのはなぜですか？**

11 行目からの it が、本物の `fonts.googleapis.com` と `use.typekit.net` に取りに行くからです。6 回目のデモは、`https.get` を偽物に差し替えて同じ道を通しました。

**Q. このシリーズで見つけたもののうち、22.2.7 で直っているのはどれですか？**

第 1 回の注記の文字列と先頭の診断、第 7 回の JS の MIME 型、第 8 回の worktree のキャッシュと proxy の 3 つ、第 9 回の正規表現の後ろのコメントです。第 8 回の assets の兄弟のフォルダは main だけで直っています。第 6 回の importmap の並びは、main でも同じ行のままです。

## 読み終えて

- このシリーズの unit の spec は 142 件で、全部が通った。inline-fonts の 7 件はネットに取りに行くので走らせていない。
- augment-index-html の spec は共通の HTML に `<base>` が無いので、`<base>` を書いた index.html の道を固めていない。そこで importmap の並びの不具合が見つかり、作業木の it で落ち、直しで通った。
- hmr-candidates・stats-table・index-html-generator・i18n-options・normalize-asset-patterns・load-proxy-config・url・version には unit の spec が無い。
- 開いている issue のうち 16 件が、このシリーズで読んだ行に当たる。

---

← 前: [パス・URL・ソースマップ・版の小道具：path・url・source-map・hash・version](09-bcu-paths.md)
