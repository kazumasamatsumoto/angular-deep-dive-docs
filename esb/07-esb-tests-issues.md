[目次](../README.md) › [tools/esbuild の読み残し：束ね方の設定・JS の後処理・watch・i18n の差し込み・スタイル・コンパイラプラグインの残りを行で埋める](README.md) › 第 7 回 / 全 7 回

# spec と issue を読む：tools/esbuild の読み残しを固めているテスト

> tools/esbuild の \*\_spec.ts と builders/application/tests が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、@angular/build の開いている issue のうちこのシリーズの行に当たるものの表。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/esb-tests-issues)

---

シリーズの最後に、第 1〜6 回で読んだ行の約束を、どの spec のどの it が固めているかを 1 つの表にします。次に、手元での走らせ方と走った数、練習用の作業木で行を変えたり it を足したりした結果を並べます。最後に、開いている issue 59 件をこのシリーズの章に振り分け、このシリーズで見つけた食い違いをまとめます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/tools/esbuild/` の `*_spec.ts`（watcher・javascript-transformer・i18n-inliner・i18n-translation-encoder・stylesheets/stylesheet-cache-key・angular/compilation-state・angular/source-file-cache）と、`src/builders/application/tests/` です。BUILD.bazel の 2 つの target（unit の `//packages/angular/build:test` と builder を丸ごと動かす `:application_integration_tests`）の読み方は [vds-tests-issues の章](../vds/05-vds-tests-issues.md)と [abl-tests-issues の章](../abl/06-abl-tests-issues.md)で読んだので繰り返しません。

1. [1. 束ね方の設定を作る関数](01-esb-code-bundle.md)
2. [2. JavaScriptTransformer](02-esb-js-transformer.md)
3. [3. watcher](03-esb-watcher.md)
4. [4. I18nInliner](04-esb-i18n-inliner.md)
5. [5. スタイルのプラグイン](05-esb-styles.md)
6. [6. compiler-plugin の残り](06-esb-compiler-rest.md)
7. **7. spec と issue**（この章）

## 1. 章ごとの約束と、固めている spec

このシリーズで読んだファイルのうち、unit の spec を持つのは watcher・javascript-transformer・i18n-inliner・i18n-translation-encoder（reader も一緒に）・stylesheet-cache-key・compilation-state・source-file-cache の 7 つです（tools/esbuild の下の spec は全部で 13 ファイル）。`application-code-bundle.ts`・`stylesheet-plugin-factory.ts`・`sass-language.ts`・`less-language.ts`・`compiler-plugin.ts` には unit の spec が無く、builder を丸ごと動かす spec が出力やログを見ることで間接に固めています。

| 章 | 本文の約束 | 固めている spec | 固めていない所 |
| --- | --- | --- | --- |
| [1. 束ね方の設定](01-esb-code-bundle.md) | polyfills の 3 通りの戻り値、サーバーの polyfills、main.server と server.ts の束、polyfills の import の並べ方、共通の土台 | options/polyfills\_spec.ts（19 行目の describe を baseUrl の 3 通りで）・server\_spec.ts（it 6 件）・ssr\_spec.ts（it 5 件）・conditions\_spec.ts・behavior/build-conditions\_spec.ts | application-code-bundle.ts の unit の spec が無い。ローカルとパッケージが混ざるときの順（689 行目）、`'` を含むパス（743 行目） |
| [2. JavaScriptTransformer](02-esb-js-transformer.md) | 宣言の接頭辞と最適化の候補の見分け、セマフォ、キャッシュ、ワーカーの依存の遅延読み込み、ソースマップのコメント | javascript-transformer\_spec.ts の describe JavaScriptTransformer sourcemaps（11 行目、it 27 件。372 行目の describe advanced optimizations fast-path pre-filter を含む） | ワーカーが何も変えなかったときのソースマップのコメント、セマフォ・close・カバレッジの道 |
| [3. watcher](03-esb-watcher.md) | パスの正規化と照合のキー、WatcherQueue、cwd の外のファイル（ParcelExternalManager）、polling と preserveSymlinks の道 | watcher\_spec.ts の describe Watcher（22 行目、it 33 件）。toPosixPathNormalized・getDirectoryPath・isPathInside（3・3・7 件）、ChangedFiles（3 件）、createWatcher（17 件） | cwd の外の it（230 行目）は polling: true で、既定の Parcel の道を通らない。WatcherQueue だけを試す it が無い |
| [4. I18nInliner](04-esb-i18n-inliner.md) | 窓・キャッシュの鍵・組み直しの順・ワーカーの覚え書き・エスケープ・ソースマップ・HMR の 1 片 | i18n-inliner\_spec.ts の describe I18nInliner（58 行目、it 42 件） | 116 行目の Blob の道（作業木で消しても 42 件が通る）。何ロケールずつ送るか（508〜521 行目）。ID が `constructor` のメッセージ |
| 翻訳の直列化（頭・索引・置き場）と Proxy | i18n-translation-encoder\_spec.ts（15 行目、it 8 件）、options/i18n-missing-translation\_spec.ts（13 行目、it 6 件） | Proxy に無い名前で `Object.prototype` の値が返る所（reader の 170 行目） |   |
| [5. スタイル](05-esb-styles.md) | 言語・create・PostCSS の用意と失敗・混ぜ方・Sass の深い import と警告・Less | options/inline-style-language\_spec.ts（it 4 件 × AOT / JIT）・style-preprocessor-options-sass\_spec.ts（it 3 件）・behavior/stylesheet-url-resolution\_spec.ts（it 16 件）・component-stylesheets\_spec.ts（it 5 件） | stylesheet-plugin-factory・sass-language・less-language の unit の spec が無い。PostCSS のプラグインが無いとき（Node ごと落ちる）。Tailwind の言葉が無ければ PostCSS を通さない分かれ道 |
| エラーのときの watchFiles、キャッシュの鍵の頭 | stylesheet-cache-key\_spec.ts（13 行目、it 5 件） | Sass のスタックから拾うファイル（sass-embedded の絶対パス）。キャッシュの鍵の関数は呼ぶ所が無い |   |
| [6. compiler-plugin の残り](06-esb-compiler-rest.md) | Primary と Secondary の文脈、onStart と onLoad の残り、FileReferenceTracker、JIT のコールバック、component-stylesheets の残り、Bazel のパス | angular/compilation-state\_spec.ts（13 行目、Primary 9 件・Secondary 5 件）、behavior/component-stylesheets\_spec.ts・rebuild-component\_styles\_spec.ts・component-templates\_spec.ts・rebuild-errors\_spec.ts・web-workers-application\_spec.ts・rebuild-web-workers\_spec.ts・options/file-replacements\_spec.ts | compiler-plugin.ts・jit-plugin-callbacks.ts・file-reference-tracker.ts・rewrite-bazel-paths.ts の unit の spec が無い。Secondary の警告の繰り返し |

## 2. 走らせ方と結果

📄 `走らせ方`

```
# ../angular-cli（44129f66a3）で
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=^(JavaScriptTransformer|Watcher|compilation-state|SourceFileCache|I18nInliner|SharedArrayBuffer Translation Encoder|Stylesheet Global Config Hash) '

pnpm bazel test //packages/angular/build:application_integration_tests --nocache_test_results --test_output=all \
  '--test_arg=--filter=(Option: polyfills|Option: .ssr.|Option: .server.|Option: .conditions.|Behavior: .conditional imports.|Option: .i18nMissingTranslation.|Option: .inlineStyleLanguage.|Option: .stylePreprocessorOptions.sass.|Behavior: .Stylesheet url\(\) Resolution.|Behavior: .Component Stylesheets.|Behavior: .Component Templates.|Behavior: .Rebuilds when component stylesheets change.|Behavior: .Rebuilds when Web Worker files change.|Behavior: .Bundles web worker files|Option: .fileReplacements.|Behavior: .Rebuild Error Detection.)'
```

📄 `自分で走らせた結果（2026-11-20）`

```
//packages/angular/build:test（shard_count = 4）
  Ran 33 of 518 specs / Ran 32 of 517 specs / Ran 32 of 517 specs / Ran 33 of 518 specs
  → 130 件、0 failures、PASSED in 6.4s

//packages/angular/build:application_integration_tests（shard_count = 25、flaky = True）
  25 の shard の「Ran N」の和 → 90 件、0 failures、PASSED in 29.3s
```

unit の `--filter` は shard ごとに効き、0 件に絞っても `PASSED` になるので、4 つの shard の「Ran N of M specs」を足して、grep で数えた it の数と比べました。130 件は、JavaScriptTransformer 27・Watcher 33・compilation-state 14・SourceFileCache 1・I18nInliner 42・エンコーダー 8・stylesheet-cache-key 5 の和です。builder を丸ごと動かす 90 件は、第 1 回の 5 つの describe の 40 件、第 4・5 回の 5 つの describe の 38 件（6 + 8 + 3 + 16 + 5）、第 6 回の 7 つの describe の 17 件の和から、第 5 回と第 6 回で同じ Behavior: "Component Stylesheets" の 5 件を 1 回分引いた数です。

## 3. spec の読みどころ

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner_spec.ts` L58–77 （▶ の行: 65–68, 74–75）

```ts
58 │ describe('I18nInliner', () => {
59 │   let inliner: I18nInliner | undefined;
60 │ 
61 │   beforeAll(async () => {
62 │     await initializeHash();
63 │   });
64 │ 
65 ▶   // A single thread is used throughout so that every file of every locale is inlined by the same
66 ▶   // Worker. Any translation state that a Worker retains between requests is then observable.
67 ▶   function createInliner(options?: Partial<I18nInlinerOptions>, maxConcurrency = 1): I18nInliner {
68 ▶     inliner = new I18nInliner({ missingTranslation: 'warning', maxConcurrency, ...options });
69 │ 
70 │     return inliner;
71 │   }
72 │ 
73 │   afterEach(async () => {
74 ▶     await inliner?.close();
75 ▶     inliner = undefined;
76 │   });
77 │ 
```

I18nInliner の spec は、既定でワーカーを 1 本にしています（67 行目の `maxConcurrency = 1`）。65〜66 行目のコメントのとおり、すべてのロケールのすべてのファイルを同じワーカーが受けるので、ワーカーが頼みをまたいで残す覚え書き（第 4 回の 7 節）の取り違えが it に出ます。74〜75 行目、it ごとに close してワーカーを止めます。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner_spec.ts` L535–567 （▶ の行: 543, 545, 550, 554, 559, 561, 565）

```ts
535 │   it('inlines multiple locales with partial cache hits and misses via inlineAll', async () => {
536 │     const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-cache-test-'));
537 │ 
538 │     try {
539 │       const files = [
540 │         browserFile('main.js', GREETING_SOURCE),
541 │         browserFile('other.js', 'export const answer = 42;\n'),
542 │       ];
543 ▶       const initialInliner = new I18nInliner({
544 │         missingTranslation: 'warning',
545 ▶         persistentCachePath: cacheDir,
546 │         maxConcurrency: 2,
547 │       });
548 │ 
549 │       // Pre-populate cache for 'fr'
550 ▶       await initialInliner.inlineForLocale(
551 │         files,
552 │         'fr',
553 │         { greeting: translationFor('Bonjour') },
554 ▶         'integrity-fr-1',
555 │       );
556 │       await initialInliner.close();
557 │ 
558 │       // Create new inliner with same cache path, inlining cached 'fr' alongside uncached 'de' and 'es'
559 ▶       inliner = new I18nInliner({
560 │         missingTranslation: 'warning',
561 ▶         persistentCachePath: cacheDir,
562 │         maxConcurrency: 2,
563 │       });
564 │ 
565 ▶       const results = await inliner.inlineAll(files, [
566 │         {
567 │           locale: 'fr',
```

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-inliner_spec.ts` L582–604 （▶ の行: 583, 585, 588, 598–600）

```ts
582 │ 
583 ▶       expect(results.size).toBe(3);
584 │ 
585 ▶       const fr = results.get('fr');
586 │       expect(fr?.errors).toEqual([]);
587 │       expect(findFile(fr?.outputFiles ?? [], 'main.js').text).toContain('"Bonjour"');
588 ▶       expect(findFile(fr?.outputFiles ?? [], 'other.js').text).toBe('export const answer = 42;\n');
589 │ 
590 │       const de = results.get('de');
591 │       expect(de?.errors).toEqual([]);
592 │       expect(findFile(de?.outputFiles ?? [], 'main.js').text).toContain('"Hallo"');
593 │ 
594 │       const es = results.get('es');
595 │       expect(es?.errors).toEqual([]);
596 │       expect(findFile(es?.outputFiles ?? [], 'main.js').text).toContain('"Hola"');
597 │ 
598 ▶       // Verify deterministic file order matching input order
599 ▶       for (const localeResult of results.values()) {
600 ▶         expect(localeResult.outputFiles.map((f) => f.path)).toEqual(['main.js', 'other.js']);
601 │       }
602 │     } finally {
603 │       await fs.rm(cacheDir, { recursive: true, force: true });
604 │     }
```

キャッシュの当たりと外れが混ざる it です。550〜555 行目で fr だけをディスクのキャッシュに入れ、559 行目で同じ場所を使う新しい inliner を作り、565 行目で fr・de・es を 1 回で渡します。fr は第 4 回の 4 節の 356〜368 行目で当たり、de と es だけがワーカーに行きます。598〜600 行目は、組み直しの順（419・426 行目）が入力の順になることを確かめています。ただし「fr がワーカーに行かなかったこと」は見ていません。作業木で 343 行目の `if (this.#transformedFileCache)` を常に偽にして（キャッシュを引かずに全部をワーカーに送る）走らせると、この it を含む I18nInliner の 43 件（4 節で足した 1 件を含む）がすべて通りました。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/i18n-translation-encoder_spec.ts` L34–50 （▶ の行: 40–41, 45, 48）

```ts
34 │   it('works with Proxy wrapper and "in" operator', () => {
35 │     const translation = {
36 │       msg1: 'Message 1',
37 │       msg2: 'Message 2',
38 │     };
39 │ 
40 ▶     const buffer = encodeTranslationToBuffer(translation);
41 ▶     const proxy = createSharedTranslationProxy<string>(buffer);
42 │ 
43 │     expect(proxy['msg1']).toEqual('Message 1');
44 │     expect(proxy['msg2']).toEqual('Message 2');
45 ▶     expect(proxy['unknown']).toBeUndefined();
46 │     expect('msg1' in proxy).toBeTrue();
47 │     expect('msg2' in proxy).toBeTrue();
48 ▶     expect('unknown' in proxy).toBeFalse();
49 │   });
50 │ 
```

40 行目で直列化し、41 行目で Proxy をかぶせて、45 行目で無い名前は `undefined`、48 行目で `in` も false を確かめます。`unknown` のような名前では正しく、`constructor` や `toString` のように `Object.prototype` にある名前の it はありません（第 4 回のデモの最後の行）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/stylesheets/stylesheet-cache-key_spec.ts` L13–34 （▶ の行: 18, 25, 28, 30–31）

```ts
13 │ describe('Stylesheet Global Config Hash', () => {
14 │   beforeAll(async () => {
15 │     await initializeHash();
16 │   });
17 │ 
18 ▶   const baseOptions: BundleStylesheetOptions = {
19 │     workspaceRoot: '/root',
20 │     optimization: true,
21 │     inlineFonts: false,
22 │     sourcemap: true,
23 │     outputNames: { bundles: 'styles', media: 'media' },
24 │     target: ['chrome100'],
25 ▶     cacheOptions: { enabled: true, path: '/cache', basePath: '/root' },
26 │   };
27 │ 
28 ▶   describe('calculateGlobalStylesheetConfigHash', () => {
29 │     it('should generate consistent hashes for identical options', () => {
30 ▶       const hash1 = calculateGlobalStylesheetConfigHash(baseOptions, '1.0.0');
31 ▶       const hash2 = calculateGlobalStylesheetConfigHash({ ...baseOptions }, '1.0.0');
32 │       expect(hash1).toBe(hash2);
33 │     });
34 │ 
```

📄 `angular-cli/packages/angular/build/src/builders/application/tests/behavior/stylesheet_autoprefixer_spec.ts` L22–34 （▶ の行: 24）

```ts
22 │ 
23 │ describeBuilder(buildApplication, APPLICATION_BUILDER_INFO, (harness) => {
24 ▶   describe('Behavior: "Stylesheet autoprefixer"', () => {
25 │     for (const ext of ['css'] /* ['css', 'sass', 'scss', 'less'] */) {
26 │       it(`should add prefixes for listed browsers in global styles [${ext}]`, async () => {
27 │         await harness.writeFile(
28 │           '.browserslistrc',
29 │           `
30 │           Safari 15.4
31 │           Edge 104
32 │           Firefox 91
33 │          `,
34 │         );
```

stylesheet-cache-key の 5 件は、同じ値なら同じハッシュ、1 つ変えれば違うハッシュ、を見ます。関数そのものは呼ぶ所が無いので、この 5 件はビルドの振る舞いを何も固めていません。autoprefixer の spec の 24 行目は、拡張子の繰り返しが `['css']` だけで、sass・scss・less はコメントの中です（f04859d161、2023-03-13 から）。Sass や Less を通った CSS に接頭辞が付くことは、この describe では確かめていません。

## 4. 作業木で試したこと

練習用の作業木（44129f66a3）で、章ごとに行を変えたり it を足したりして、落ちるかどうかを見ました。詳しい手順はそれぞれの章の「テストと直し方」にあります。

| 章 | したこと | 結果 |
| --- | --- | --- |
| [1](01-esb-code-bundle.md) | 22.2.7 の polyfills\_spec.ts の it「uses a provided file with a single quote in its path」を足す | 「Expected ";" but found "s"」で落ちる。743 行目を `JSON.stringify` にすると 13 件が通る（22.2.7 の b3baa20c6c と同じ直し方） |
| [2](02-esb-js-transformer.md) | ɵ を含む node\_modules の Buffer を transformData に渡し、出力に sourceMappingURL が無いことを期待する it を足す | コメントが残って落ちる。ワーカーの 156 行目の条件に「134〜135 行目で切った」印を足すと 28 件が通る |
| [3](03-esb-watcher.md) | 230 行目の it から polling: true を外した it を足す | 「Expected 'timeout' not to be 'timeout'.」で落ちる。ensureDirWatched の 395 行目の直後に `pendingSubscriptions.delete(dirKey)` を足すと 34 件が通る（22.2.7 の e3e893682d と同じ直し方） |
| [4](04-esb-i18n-inliner.md) | i18n-inliner.ts の 116 行目を `return undefined;` にする | I18nInliner の 42 件がすべて通る（固めていない） |
| [4](04-esb-i18n-inliner.md) | SharedArrayBuffer を消して fr を inline する it を足す | Piscina がワーカーを起こせず「SharedArrayBuffer is not a constructor」。先にワーカーを起こす形にすると 43 件が通り、116 行目を変えると落ちる |
| [4](04-esb-i18n-inliner.md) | i18n-inliner.ts の 343 行目の if を常に偽にする（ディスクのキャッシュを引かない） | I18nInliner の 43 件がすべて通る（キャッシュの当たりで仕事を減らすことは固めていない） |
| [5](05-esb-styles.md) | stylesheet-plugin-factory\_spec.ts を作り、無い PostCSS のプラグインで束ねる it を置く | 「Unhandled promise rejection」と、注にプラグイン名が無いことで落ちる。121・138・139 行目を直すと通り、unit の 616 件と、スタイルと i18n の builder の spec 66 件も通る |

## 5. 開いている issue と、このシリーズの行

2026-11-20 に gh で読んだ、angular/angular-cli のラベル `area: @angular/build` の開いている 55 件と `angular/build:application` の 28 件（重なりを除いて 59 件）のうち、このシリーズの行に当たるのは 16 件でした。振り分けは本文と issue を読んで決めたもので、issue の側が原因の行を名指ししているわけではありません。

> **🧪 DEMO — 開いている issue を章で絞る**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/esb-tests-issues)

## 6. このシリーズで見つけたもの（食い違いと不具合）

| 章 | 食い違い | 確かめ方 |
| --- | --- | --- |
| [1](01-esb-code-bundle.md) | polyfills のパスに `'` があると、入口の import の文字列が切れて esbuild のエラーになる（743 行目。22.2.7 で直った） | 作業木の it（4 節） |
| [1](01-esb-code-bundle.md) | 142〜146 行目の createCompilerPluginOptions だけ読み込みキャッシュを渡していない（22.2.7 と新しい本家は 72dc9677cf で足した） | 行の読み比べ |
| [2](02-esb-js-transformer.md) | 文字列に ɵ があるだけの node\_modules のファイルは、ワーカーが何も変えないと、先に切った sourceMappingURL のコメントが元のバイト列ごと戻り、sourceMap.vendor が偽でもそのパッケージの元のソースが main.js.map に出る | Node の記録と、偽のパッケージを置いたカウンターの ng build、作業木の it |
| [3](03-esb-watcher.md) | cwd の外のファイルは、396 行目の判定が自分の dirKey を見ていつも偽になり、作ったばかりの購読を 407 行目でやめる。既定の Parcel の道では変更を返さない（22.2.7 で直った） | 本物の createWatcher に操作を当てた記録、作業木の it |
| [4](04-esb-i18n-inliner.md) | ID が `constructor` のメッセージに翻訳が無いと、警告ではなく「Cannot read properties of undefined (reading 'map')」のエラーになり、出力に ID 付きの元の文が残る（reader の 170 行目と、@angular/localize の translations.ts の 62 行目） | 22.2.7 の `inlineTemplateUpdate` を Node から呼んだ記録 |
| [4](04-esb-i18n-inliner.md) | 116 行目の Blob の道は、Piscina がワーカーを起こすのに SharedArrayBuffer を使うので、ふつうは通りようがない | 作業木の it（4 節）、piscina の dist/worker\_pool/index.js の 43 行目 |
| [4](04-esb-i18n-inliner.md) | reader の 19〜20 行目のコメントは「UTF-8 のバイト順は UTF-16 の順と同じ」と言うが、U+E000 以上と補助面の文字で順が違う。エンコーダーも読む側もバイト順で比べるので、結果は合っている | encoder の 48〜50 行目のコメントと読み比べ |
| [5](05-esb-styles.md) | PostCSS の設定に無いプラグインがあると、ng build が esbuild のエラーにならず Node ごと落ちる。落ちないようにしても、理由（プラグイン名）が捨てられ "postcss" を読めないと 3 つ出る | カウンターに .postcssrc.json を置いた ng build、作業木の it（4 節） |
| [5](05-esb-styles.md) | 既定の sass-embedded では Sass のスタックが絶対パスで、`join(cwd, …)` が無いパスを作る。`@use` の連なりの真ん中のファイルが見張られず、ng build --watch で直しても作り直されない | 22.2.7 の `ng build --watch` の記録と、NG\_BUILD\_SASS\_EMBEDDED=0 との比べ |
| [5](05-esb-styles.md) | 関数の名前 `resetSassWorkerPoolCaches`・`shutdownSassWorkerPool` の「ワーカーのプール」は fc5a2ecb14 で消えている。stylesheet-cache-key.ts のコメントの「キャッシュの鍵の頭」は、呼ぶ所が無い | grep |
| [6](06-esb-compiler-rest.md) | Secondary の文脈は onStart の 168〜175 行目で先に返るので、setupWarnings が消えず、毎回の再ビルドで同じ警告（キャッシュを作れない、など）を返す | 永続キャッシュの場所を作れなくした Node の記録（main は 1 回目だけ、polyfills は 3 回とも） |
| [6](06-esb-compiler-rest.md) | component-stylesheets.ts の collectReferencedFiles（231 行目）がインラインのスタイルの参照先を集めない（22.2.7 の 978351af71 で直った） | 行の読み比べ |

## 聞かれそうな質問

**Q. tools/esbuild の 1 つの spec のファイルだけを走らせるには？**

`//packages/angular/build:test` に `--test_arg=--filter=^<外側の describe の名前> ` を付けます（末尾の空白で、名前が前方一致の別の describe を外します）。4 つの shard の「Ran N」を足して、it の数と同じかを確かめます（2 節）。

**Q. stylesheet-plugin-factory.ts を直したら、どこに spec を足せばよいですか？**

44129f66a3 にはこのファイルの unit の spec がありません。同じフォルダに `stylesheet-plugin-factory_spec.ts` を作れば、BUILD.bazel の `unit_test_lib` の glob（`src/**/*_spec.ts`）に入り、何も足さずに `:test` で走ります。4 節で作った it がその形です。

**Q. I18nInliner の spec が全部通れば、分け方を変えても安全ですか？**

出力の中身は守られますが、分け方そのもの（何ロケールずつ送るか、キャッシュで当たった組をワーカーに送らないこと）は見ていません。3 節の 535 行目の it も、作業木でキャッシュを引かないように変えて通りました。分け方を固めるなら、`WorkerPool.prototype.run` に spy を付けて頼みの数と中身を見る it が要ります。

**Q. このシリーズで見つけた食い違いのうち、22.2.7 で直っているのはどれですか？**

第 1 回の `'` を含む polyfills のパス（b3baa20c6c）と読み込みキャッシュの渡し忘れ（72dc9677cf）、第 3 回の cwd の外の購読（e3e893682d）、第 5 回の Sass のスタックの割り方（b946277064）とパッケージの解決の表（040bc21ec3）、第 6 回のインラインのスタイルの参照先（978351af71）です。PostCSS のプラグインが無いときに落ちることと、sass-embedded の絶対パスをつなぐことは、新しい本家（815c98e07a）でも同じ行です。

## 読み終えて

- tools/esbuild の unit の spec は 7 ファイル。束ね方の設定・スタイルのプラグイン・compiler-plugin は、builder を丸ごと動かす spec が間接に固めている。
- このシリーズの spec は、unit が 130 件、builder の spec が 90 件で、どちらも通った。
- 作業木で行を変えても落ちない所（Blob の道など）と、it を足すと落ちる所（PostCSS のプラグインが無いとき）を、それぞれの章に書いた。
- 開いている issue のうち 16 件が、このシリーズで読んだ行に当たる。

---

← 前: [compiler-plugin の残り：コンパイルの状態・JIT のコールバック・コンポーネントのスタイル](06-esb-compiler-rest.md)  
次: [AotCompilation の残り：プログラムの作り直し・診断・出力の書き出し](../bcu/01-bcu-aot.md) →
