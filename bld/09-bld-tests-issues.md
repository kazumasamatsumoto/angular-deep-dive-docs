[目次](../README.md) › [@angular/build の読み残し（sass・i18n・dev-server・unit-test）](README.md) › 第 9 回 / 全 9 回

# spec と issue を読む：@angular/build の読み残しを固めているもの

> このシリーズで読んだ sass・i18n・chunk-optimizer・dev-server・Vite の middleware・unit-test と ng-packagr の約束を固める spec、手元での走らせ方と結果、作業木で試した直し、関係する issue の表と、このシリーズで見つけた食い違いと不具合。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/bld-tests-issues)

---

シリーズの最後に、第 1〜8 回で読んだ行の約束を、どの spec のどの it が固めているかを 1 つの表にします。次に、手元での走らせ方と走った数、練習用の作業木で it を足して直した結果を並べます。最後に、開いている issue 56 件をこのシリーズの章に振り分け、このシリーズで見つけた食い違いと不具合 38 件をまとめます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/build/src/tools/sass/lexer_spec.ts` と、`src/builders/application/tests/`・`src/builders/dev-server/tests/`・`src/builders/unit-test/tests/` の spec です。BUILD.bazel の target の読み方（unit の `//packages/angular/build:test` は shard 4、builder を丸ごと動かす `:application_integration_tests` は shard 25・flaky）は [abl-tests-issues の章](../abl/06-abl-tests-issues.md)で、`--filter` の数え方は [esb-tests-issues の章](../esb/07-esb-tests-issues.md)で読んだので繰り返しません。

1. [1. sass の url を書き換える](01-bld-sass-rebase.md)
2. [2. sass を常駐のコンパイラで動かす](02-bld-sass-service.md)
3. [3. メッセージを取り出す](03-bld-extract-i18n.md)
4. [4. 翻訳を差し込む](04-bld-i18n-inline.md)
5. [5. チャンクを束ね直す](05-bld-chunk-optimizer.md)
6. [6. ng serve の入口の残り](06-bld-dev-server-rest.md)
7. [7. Vite の middleware の残り](07-bld-vite-middlewares.md)
8. [8. unit-test と ng-packagr](08-bld-unit-test-packagr.md)
9. **9. spec と issue**（この章）

## 1. 章ごとの約束と、固めている spec

このシリーズで読んだファイルのうち、unit の spec を持つのは `tools/sass/lexer.ts` だけです。rebasing-importer・sass-service・extract-i18n の builder・i18n-locale-plugin・chunk-optimizer・esbuild/utils・profiling・dev-server の options と vite/index・setup-middlewares-plugin・assets-middleware・angular-memory-plugin・ng-packagr の builder・private.ts には、unit の spec がありません。残りは builder を丸ごと動かす spec が、間接に固めています。

| 章 | 本文の約束 | 固めている spec | 固めていない所 |
| --- | --- | --- | --- |
| [1. url の書き換え](01-bld-sass-rebase.md) | url( を拾い、部分ファイルの相対の url をエントリの場所に合わせる | `tools/sass/lexer_spec.ts` の describe「Sass URL lexer」（11 行目、it 2 件）、`application/tests/behavior/stylesheet-url-resolution_spec.ts`（14 行目、it 16 件） | image-set の `(` の直後・大文字の URL(・`\"`・`@import url()`。rebasing-importer の unit の spec |
| [2. sass-service](02-bld-sass-service.md) | sass-embedded の子プロセス 1 つで compileString、importer と logger の呼び戻し | `application/tests/options/inline-style-language_spec.ts`（14 行目、AOT / JIT で 8 件）、`style-preprocessor-options-sass_spec.ts`（13 行目、3 件） | sass-service.ts を直接呼ぶ spec（新しい本家に sass-language\_spec.ts）。同じ瞬間の close、pkg: の containingUrl |
| [3. extract-i18n](03-bld-extract-i18n.md) | 抽出のモードでビルドし、format を選んで書く | packages/angular/build の中には無い。e2e の `tests/e2e/tests/i18n/extract-ivy*.ts`（3 ファイル）だけ | format ごとの出力、重複、outFile と outputPath、legacy-migrate の警告 |
| [4. 翻訳の差し込み](04-bld-i18n-inline.md) | 翻訳を読み、ロケールのデータを差し込み、足りない翻訳を知らせる | `application/tests/options/i18n-missing-translation_spec.ts`（13 行目、6 件）、`tools/esbuild/i18n-inliner_spec.ts`（58 行目）、`i18n-translation-encoder_spec.ts`（15 行目、8 件） | i18n-locale-plugin の unit の spec（e2e の ivy-localize-locale-data.ts だけ）。作業フォルダを変えたとき |
| [5. 束ね直し](05-bld-chunk-optimizer.md) | Rolldown の出力を metafile に戻し、失敗は 1 つのエラー。表・JSON のログ・書き出し・計測 | `application/tests/behavior/chunk-optimization-server_spec.ts`（114 行目、it 1 件）。e2e の `tests/e2e/tests/build/chunk-optimizer*.ts`（5 ファイル） | metafile の中身（bytesInOutput、ソースマップの行）、失敗の結果、logBuildStats・createJsonBuildManifest・profiling |
| [6. ng serve の入口](06-bld-dev-server-rest.md) | options の正規化、ビルドの options の書き換え、ssl、受け口 | `dev-server/tests/options/` の allowed-hosts（4 件）・port（4 件）・define（3 件）・headers（4 件） | inspect・PORT の形、`angular:log`・`angular:invalidate` の形、SSR の inspect。prebundle の 4 件は `xdescribe` |
| [7. middleware](07-bld-vite-middlewares.md) | middleware の並び、`?ngcomp=` の encapsulation、Vitest 用のアセット、メモリの plugin | `dev-server/tests/behavior/build-assets_spec.ts`（23 行目、11 件）。新しい本家に assets-middleware\_spec.ts（createBuildAssetsMiddleware の 4 件） | `?ngcomp=` を通る spec が無い。updateResultRecord・メモリの plugin の unit の spec |
| [8. unit-test と ng-packagr](08-bld-unit-test-packagr.md) | 知らない build の target、NG\_TEST\_LOG、ng-packagr の呼び方と結果、private の export | `unit-test/tests/behavior/vitest-barrel-side-effects_spec.ts`（15 行目）と `vitest-zone-init_spec.ts`（71 行目）が ng-packagr の target を通る | ng-packagr の builder の spec が無い。ng-package.json の assets。buildTarget の 4 件は `xdescribe` |

## 2. 走らせ方と結果

どれも ../angular-cli で `pnpm bazel test <target> --nocache_test_results` に `--test_arg=--filter=…` を付けて走らせました。jasmine の filter は shard ごとに効き、0 件に絞っても PASSED になるので、shard ごとの「Ran N of M specs」を足して it の数と比べています。

| 回 | target と filter | 走った数 | 結果 |
| --- | --- | --- | --- |
| 1 | `:test`・`^Sass URL lexer ` | 2（shard ごとに 0・0・1・1） | PASSED |
| 1・2・4 | `:application_integration_tests`・url の describe・inlineStyleLanguage・stylePreprocessorOptions.sass・i18nMissingTranslation | 33（16 + 8 + 3 + 6） | 0 failures、PASSED |
| 5 | `:application_integration_tests`・`Chunk optimization with a server entry point` | 1（25 の shard の 1 つ） | PASSED |
| 6・7 | `:dev-server_integration_tests`・allowedHosts・port・define・headers・prebundle・`Behavior: "browser builder assets"` | 30（うち prebundle の 4 件は pending） | 0 failures、PASSED |
| 8 | `:unit-test_integration_tests`・barrel・`Option: "buildTarget"`・`when testing a library` | 6（うち buildTarget の 4 件は pending） | 0 failures、PASSED |

pending の 8 件は、どれも describe ごと `xdescribe` で止められています。3 節で 2 つを読みます。extract-i18n には BUILD.bazel に target そのものが無く、e2e（npm のパッケージを作って仮のプロジェクトで動かす）は手元では走らせていません。

## 3. spec の読みどころ

📄 `angular-cli/packages/angular/build/src/tools/sass/lexer_spec.ts` L9–31 （▶ の行: 11–13, 17, 24–25, 29）

```ts
 9 │ import { findUrls } from './lexer';
10 │ 
11 ▶ describe('Sass URL lexer', () => {
12 ▶   it('should find url immediately after a colon, comma, or whitespace', () => {
13 ▶     const input = `.c{property:url("first"),url("second"), url("third");}`;
14 │ 
15 │     const result = [...findUrls(input)];
16 │ 
17 ▶     expect(result).toEqual([
18 │       { start: 16, end: 23, value: 'first' },
19 │       { start: 29, end: 37, value: 'second' },
20 │       { start: 44, end: 51, value: 'third' },
21 │     ]);
22 │   });
23 │ 
24 ▶   it('should find full url with string containing url function', () => {
25 ▶     const input = `.c{property:url("url('abc')");}`;
26 │ 
27 │     const result = [...findUrls(input)];
28 │ 
29 ▶     expect(result).toEqual([{ start: 16, end: 28, value: `url('abc')` }]);
30 │   });
31 │ });
```

lexer の 2 件は、13 行目のとおり `:`・`,`・空白の直後と、25 行目の「文字列の中の url(」だけです。1 回目で見つけた `(` の直後（image-set）と大文字の `URL(` の形は無く、作業木で足した it は 1 件目が「Expected $.length = 1 to equal 2.」で落ちました（1 回目）。

📄 `angular-cli/packages/angular/build/src/builders/application/tests/options/i18n-missing-translation_spec.ts` L31–56 （▶ の行: 31, 34–35, 47, 49–50, 52–53）

```ts
31 ▶     it('should warn when i18nMissingTranslation is undefined (default)', async () => {
32 │       harness.useTarget('build', {
33 │         ...BASE_OPTIONS,
34 ▶         localize: true,
35 ▶         i18nMissingTranslation: undefined,
36 │       });
37 │ 
38 │       await harness.writeFile(
39 │         'src/app/app.component.html',
40 │         `
41 │           <p id="hello" i18n="An introduction header for this sample">Hello {{ title }}! </p>
42 │         `,
43 │       );
44 │ 
45 │       await harness.writeFile('src/locales/messages.fr.xlf', MISSING_TRANSLATION_FILE_CONTENT);
46 │ 
47 ▶       const { result, logs } = await harness.executeOnce({ outputLogsOnFailure: false });
48 │ 
49 ▶       expect(result?.success).toBeTrue();
50 ▶       expect(logs).toContain(
51 │         jasmine.objectContaining({
52 ▶           level: 'warn',
53 ▶           message: jasmine.stringMatching('No translation found for'),
54 │         }),
55 │       );
56 │     });
```

足りない翻訳の警告は、53 行目のとおり文の一部（`No translation found for`）で見ています。4 回目の「警告にロケールを付ける」直しをしても、この it はそのまま通ります。ロケールの数だけ同じ文が並ぶことは、この it では見えません。

📄 `angular-cli/packages/angular/build/src/builders/application/tests/behavior/chunk-optimization-server_spec.ts` L12–24 （▶ の行: 14–17, 19–23）

```ts
12 │ /**
13 │  * Fixture application with a server entry point and four lazy routes.
14 ▶  * Four lazy chunks exceed the default chunk optimization threshold (3),
15 ▶  * so the optimization pass runs without requiring the
16 ▶  * `NG_BUILD_OPTIMIZE_CHUNKS` environment variable (which is captured at
17 ▶  * module load time and cannot be toggled per spec).
18 │  *
19 ▶  * `shared.ts` is imported statically by both `main.ts` and two of the lazy
20 ▶  * components. esbuild emits such modules as a separate `chunk-*.js` shared
21 ▶  * chunk, while the chunk optimizer merges entry-reachable modules back into
22 ▶  * the main chunk. The absence of `chunk-*.js` files is therefore used as a
23 ▶  * signal that the optimization pass actually ran.
24 │  */
```

📄 `angular-cli/packages/angular/build/src/builders/application/tests/behavior/chunk-optimization-server_spec.ts` L127–151 （▶ の行: 131, 133, 136, 140, 145, 147–148）

```ts
127 │     it('generates a server manifest consistent with the optimized browser chunks', async () => {
128 │       harness.useTarget('build', {
129 │         ...BASE_OPTIONS,
130 │         server: 'src/main.server.ts',
131 ▶         ssr: true,
132 │         polyfills: ['zone.js'],
133 ▶         optimization: true,
134 │         // Name lazy chunks after their route entry points so that only shared
135 │         // chunks use the `chunk-` prefix, which the assertions below rely on.
136 ▶         namedChunks: true,
137 │       });
138 │ 
139 │       const { result } = await harness.executeOnce();
140 ▶       expect(result?.success).toBeTrue();
141 │ 
142 │       // The chunk optimizer merges entry-reachable shared modules back into the
143 │       // main chunk. A remaining `chunk-*.js` shared chunk indicates the
144 │       // optimization pass did not run and this test would be vacuous.
145 ▶       expect(harness.hasFileMatch('dist/browser', /^chunk-/)).toBeFalse();
146 │ 
147 ▶       const manifestContent = harness.readFile('dist/server/angular-app-manifest.mjs');
148 ▶       const mappingSource = /entryPointToBrowserMapping: (\{[\s\S]*?\n\})/.exec(manifestContent);
149 │       expect(mappingSource)
150 │         .withContext('entryPointToBrowserMapping should be present in the server manifest')
151 │         .not.toBeNull();
```

15〜17 行目、`NG_BUILD_OPTIMIZE_CHUNKS` はモジュールを読んだときに 1 回だけ決まるので、spec ごとに変えられません。そこで遅延ルートを 4 つ作って既定の閾値 3 を超えさせ、145 行目の「`chunk-` で始まるファイルが残っていない」を束ね直しが走った印にします（22〜23 行目）。5 回目の作業木で足した it も同じ作りで、`sourceMap: true`・`statsJson: true` を足して browser-stats.json の行がすべて dist にあるかを見ました（直す前は 5 件の .js.map が残って落ち、直すと通った）。この spec の 133 行目は `optimization: true` だけで `sourceMap` を付けていないので、ソースマップの道（5 回目の 4 節）は通りません。

📄 `angular-cli/packages/angular/build/src/builders/dev-server/tests/options/prebundle_spec.ts` L9–30 （▶ の行: 14–17, 22–24）

```ts
 9 │ import { executeDevServer } from '../../index';
10 │ import { executeOnceAndFetch } from '../execute-fetch';
11 │ import { describeServeBuilder } from '../jasmine-helpers';
12 │ import { BASE_OPTIONS, DEV_SERVER_BUILDER_INFO } from '../setup';
13 │ 
14 ▶ // TODO: Temporarily disabled pending investigation into test-only Vite not stopping when caching is enabled
15 ▶ describeServeBuilder(executeDevServer, DEV_SERVER_BUILDER_INFO, (harness, setupTarget) => {
16 ▶   // prebundling is not available in webpack
17 ▶   xdescribe('option: "prebundle"', () => {
18 │     beforeEach(async () => {
19 │       setupTarget(harness);
20 │ 
21 │       harness.useProject('test', {
22 ▶         cli: {
23 ▶           cache: {
24 ▶             enabled: true,
25 │           },
26 │         },
27 │       });
28 │ 
29 │       // Application code is not needed for these tests
30 │       await harness.writeFile(
```

14 行目のコメントは「キャッシュを有効にすると、テストの中の Vite が止まらない件を調べるまで一時的に止める」です。17 行目の `xdescribe` で、22〜24 行目のキャッシュを有効にする設定ごと、4 件が走りません。prebundle は既定で有効（6 回目の 2 節）なのに、その振る舞いを bazel で見ている it は今 0 件です。

📄 `angular-cli/packages/angular/build/src/builders/unit-test/tests/behavior/vitest-barrel-side-effects_spec.ts` L13–26 （▶ の行: 14, 16–18, 20, 23）

```ts
13 │   describe('Behavior: "Vitest barrel sideEffects"', () => {
14 ▶     // Regression test for https://github.com/angular/angular-cli/issues/33910.
15 │     it('should retain barrel-exported components when package.json has sideEffects: false', async () => {
16 ▶       harness.withBuilderTarget(
17 ▶         'build',
18 ▶         async () => ({ success: true }),
19 │         {
20 ▶           project: 'src/lib/ng-package.json',
21 │         },
22 │         {
23 ▶           builderName: '@angular/build:ng-packagr',
24 │         },
25 │       );
26 │ 
```

ng-packagr の target のテストは、16〜25 行目で build の target を「すぐ `{ success: true }` を返す偽の ng-packagr の builder」にして作ります。ng-packagr 自身は動かないので、8 回目の 3・4 節（ng-packagr の builder）の行はここでは通りません。読み替え（unit-test/builder.ts の 353〜391 行目）は通りますが、ng-package.json に `assets` を書いた it はありません。

## 4. 作業木で試したこと

練習用の作業木（44129f66a3 を worktree で取り出したもの）で it を足し、落ちるのを見てから直しを当てました。試したあとに作業木は消しました。

| 回 | 足した it と直し | 直す前 | 直したあと |
| --- | --- | --- | --- |
| 1 | lexer\_spec.ts に 2 件（image-set の `(` の直後、`my-url(` は拾わない）。lexer.ts 58 行目に `current !== 0x0028` | 1 件目が「Expected $.length = 1 to equal 2.」 | 2 件とも通る。unit の全部と Sass を通る builder の 32 件も 0 failures |
| 2 | tools/sass/sass-service\_spec.ts を作り、compile → close → compile の 1 件。close で世代を進め、古い世代なら作り直す | 「Async compiler has already been disposed」 | 通る。unit の全部と builder の 32 件も 0 failures |
| 5 | application/tests/behavior/chunk-optimization-stats\_spec.ts を作り、遅延ルート 4 つ・sourceMap・statsJson で 1 件。chunk-optimizer.ts 350 行目で使ったチャンクの .map も飛ばす | 「Expected $.length = 5 to equal 0.」（esbuild のチャンクの .js.map が 5 つ） | 既存の server の it と合わせて 2 件とも通る |
| 7 | builders/dev-server/vite/utils\_spec.ts を作り、AngularHost と同じ名前の CSS がコンポーネントのスタイルの表に入るかの 1 件と、styles.css が入らないかの 1 件。vite/utils.ts 94 行目の `{64}` を `{16}` に | 1 件目が「Expected false to be true.」 | 2 件とも通る |

## 5. 開いている issue と、このシリーズの行

2026-11-28 に gh で読んだ、angular/angular-cli のラベル area: @angular/build の開いている 56 件のうち、このシリーズの行に当たるのは 10 件でした。振り分けは本文と issue を読んで決めたもので、issue の側がこのシリーズのファイルを名指ししているのは #34774（chunk-optimizer の augmentChunkHash）と #34248（NG\_HMR\_CSTYLES の ?ngcomp=）です。

> **🧪 DEMO — 開いている issue を章で絞る**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bld-tests-issues)

## 6. このシリーズで見つけたもの（食い違いと不具合）

「食い違い」は説明（JSDoc・schema・コミットの説明・title / summary）と実装が合わない所、「不具合」は記録で壊れ方を確かめた所、「壊れる入力」は思った形にならない入力、「事実」は直す話ではないが知っておくべき所です。最後の列は新しい本家（1e4b0960d8）で同じかどうかで、22.2.x で直ったものはそのコミットを書いています。

> **🧪 DEMO — 見つけたものを種類と章で絞る（38 件）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/bld-tests-issues)

第 5〜8 回で見つけたものは、gh で開いている issue と閉じた issue を検索して、同じ報告は見つかりませんでした。近いものとして、#34248 は 7 回目の 94 行目とは別の原因（ビルドの側の古い中身）、#28656 は 133 行目の正規表現が正しい ID を拒んだ別の件（2024-10 に閉じた）、#34044 は 5 回目の 116〜118 行目で閉じた件です。

## 聞かれそうな質問

**Q. このシリーズの範囲で、いちばん spec が薄いのはどこですか？**

ng-packagr の builder（spec が 0）と extract-i18n の builder（bazel の target が無い）です。どちらも見つけたものが複数あり（ng-packagr は案内の文が消える・watch で結果を出さない、extract-i18n は絶対パスの outFile・legacy-migrate の警告）、spec を置く場所から作る必要があります（8 回目と 3 回目の「テストと直し方」）。

**Q. bazel で PASSED だったのに、pending が 8 件あるのはなぜ？**

dev-server の prebundle\_spec.ts（17 行目）と unit-test の build-target\_spec.ts が describe ごと `xdescribe` になっていて、jasmine はその it を走らせずに pending と数えるからです。PASSED は「失敗が 0」の意味で、走った数は shard の「Ran N」を足して確かめます。

**Q. 見つけた不具合を確かめるのに、なぜ dist の関数を直接呼んだのですか？**

ng build や ng serve では途中の値（metafile の行、componentStyles の中身、async generator の return の値）が見えないからです。@angular/build の package.json の `exports` は深いパスを出さないので、dist のファイルを絶対パスで require しました（8 回目の 5 節）。最後は本物の ng build / ng serve / ng test でも同じ症状を見ています。

**Q. 22.2.7 で直っていて、44129f66a3 には残っているものは？**

6 節の表の「直った」の行です。Sass の canonicalize と ZoneAwarePromise（47c328d3ef）、extract-i18n の aot（13923047f6）と schema の説明（d53890b349）、dev-server の sslCert / sslKey（47075bee89）と hmr の説明（22f836a70b）。ほかに、本文の範囲の外で ETag の引用符（0f63a03bae）や消えた出力の Vite のキャッシュ（3e464c3f55）も直っています。

## 読み終えて

- このシリーズのファイルで unit の spec を持つのは lexer.ts だけ。ほかは builder を丸ごと動かす spec が間接に固め、extract-i18n と ng-packagr の builder には bazel の spec が無い。
- 走らせた数は unit 2 件、application 34 件、dev-server 30 件（pending 4）、unit-test 6 件（pending 4）で、失敗は 0。pending は `xdescribe`。
- 作業木で 4 つの直しを試し、どれも足した it が落ちてから通った（lexer・sass-service・chunk-optimizer の .map・コンポーネントのスタイルの名前）。
- 開いている 56 件のうち 10 件がこのシリーズの行に当たり、見つけたものは 38 件。大半は新しい本家でも同じ。

---

← 前: [unit-test と ng-packagr の builder の残り](08-bld-unit-test-packagr.md)  
次: [browser builder の流れ：options から webpack の実行まで](../bwp/01-bwp-browser.md) →
