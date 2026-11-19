[目次](../README.md) › [@angular/ssr の読み残し：provideServerRendering・リクエストハンドラ・CommonEngine・ビルド側のワーカーを行で埋める](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：@angular/ssr の残りを固めているテスト

> packages/angular/ssr/test・ssr/node/test と packages/angular/build の server-rendering の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果（249・42・615 件）、作業木で 1 行ずつ変えて落ちる it、@angular/ssr の開いている issue の表。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ssrl-tests-issues)

---

シリーズの最後に、第 1〜5 回で読んだ行の約束を、どの spec のどの it が固めているかを 1 つの表にします。次に、手元での走らせ方と、走った数（ssr/test 249・ssr/node/test 42・build 615）を書き、作業木で 1 行ずつ変えたときに落ちた it を並べます。最後に、ラベル `area: @angular/ssr` の開いている issue 11 件をこのシリーズの章に振り分け、このシリーズで見つけた食い違いをまとめます。

読む対象は ../angular-cli（44129f66a3）の `packages/angular/ssr/test/`・`packages/angular/ssr/node/test/`・`packages/angular/build/src/utils/server-rendering/**/*_spec.ts` と、それぞれの `BUILD.bazel` です。BUILD.bazel の読み方（`spec_bundle` と `flaky = True`）は[SSR の守りのシリーズの最終回](../ssrx/10-ssrx-tests-issues.md)の 2 節、ルートの木の spec は[ルートの木のシリーズの最終回](../srt/05-srt-tests-issues.md)にあるので、ここでは繰り返しません。

1. [1. provideServerRendering の中身](01-ssrl-provide.md)
2. [2. server.ts の入口](02-ssrl-handlers.md)
3. [3. CommonEngine の残りと性能の記録](03-ssrl-common-engine.md)
4. [4. i18n と URL の小道具](04-ssrl-i18n-url.md)
5. [5. ビルド側のワーカー](05-ssrl-build-workers.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

ファイルごとの行数、字下げの浅い（2 文字まで）`describe` とその行、`it(` で始まる行の数です。下のスクリプトが grep で数えました。3 つの組の it の数（249・42・29）は、2 節で bazel が走らせた数（249・42・絞ったときの 29）と同じでした。

20 ファイル

### ssr/test（it 249 件）

| ファイル | 行 | describe（行） | it | 章 |
| --- | --- | --- | --- | --- |
| app-engine\_spec.ts | 489 | AngularAppEngine（107）<br>Localized app（110）<br>Localized app with single locale（228）<br>Non-localized app（289）<br>Invalid host headers（344）<br>Disable host check（433） | 29 | [第 4 回 i18n と URL](04-ssrl-i18n-url.md)<br>[AngularAppEngine](../platform/04-ssr-app-engine.md)<br>[ロケールの選び方](../ssrx/07-ssrx-i18n-locale.md)<br>[ホストとヘッダーの検査](../ssrx/04-ssrx-host-validation.md) |
| app\_spec.ts | 567 | AngularServerApp（22）<br>handle（181） | 36 | [第 3 回 CommonEngine](03-ssrl-common-engine.md)<br>[AngularAppEngine](../platform/04-ssr-app-engine.md) |
| assets\_spec.ts | 48 | ServerAsset（11） | 3 | [アセットと重要 CSS](../ssrx/09-ssrx-assets-css.md) |
| hooks\_spec.ts | 65 | Hooks（11）<br>on（19）<br>run（32）<br>has（54） | 7 | [第 3 回 CommonEngine](03-ssrl-common-engine.md) |
| i18n\_spec.ts | 170 | getPotentialLocaleIdFromUrl（11）<br>getPreferredLocale（69） | 20 | [第 4 回 i18n と URL](04-ssrl-i18n-url.md)<br>[ロケールの選び方](../ssrx/07-ssrx-i18n-locale.md) |
| routes/ng-routes\_spec.ts | 844 | extractRoutesAndCreateRouteTree（25）<br>route configuration validation（59）<br>when \`invokeGetPrerenderParams\` is true（184） | 28 | [ルートの取り出し](../srt/01-srt-extract.md) |
| routes/route-tree\_spec.ts | 289 | RouteTree（12）<br>toObject and fromObject（19）<br>match（123） | 18 | [ルートの木](../srt/03-srt-route-tree.md) |
| routes/router\_spec.ts | 141 | ServerRouter（20）<br>from（47）<br>match（76） | 6 | [ルートの木](../srt/03-srt-route-tree.md) |
| utils/promise\_spec.ts | 36 | promiseWithAbort（12） | 2 | [AngularAppEngine](../platform/04-ssr-app-engine.md) |
| utils/redirect\_spec.ts | 67 | Redirect Utils（11）<br>createRedirectResponse（12） | 7 | [リダイレクトと URL の照合](../ssrx/06-ssrx-redirects.md) |
| utils/url\_spec.ts | 223 | URL Utils（20）<br>stripTrailingSlash（21）<br>stripLeadingSlash（39）<br>addLeadingSlash（57）<br>addTrailingSlash（72）<br>joinUrlParts（87）<br>stripIndexHtmlFromURL（117）<br>buildPathWithParams（167）<br>stripMatrixParams（198） | 38 | [第 4 回 i18n と URL](04-ssrl-i18n-url.md)<br>[リダイレクトと URL の照合](../ssrx/06-ssrx-redirects.md) |
| utils/validation\_spec.ts | 532 | Validation Utils（18）<br>getFirstHeaderValue（19）<br>parseForwardedHeader（42）<br>normalizeTrustProxyHeaders（135）<br>validateUrl（177）<br>validateRequest（213）<br>sanitizeRequestHeaders（398） | 55 | [ホストとヘッダーの検査](../ssrx/04-ssrx-host-validation.md)<br>[プロキシのヘッダー](../ssrx/05-ssrx-proxy-headers.md) |

### ssr/node/test（it 42 件）

| ファイル | 行 | describe（行） | it | 章 |
| --- | --- | --- | --- | --- |
| request\_http1\_spec.ts | 230 | createWebRequestFromNodeRequest (HTTP/1.1)（13）<br>GET handling（48）<br>POST handling（143）<br>abort handling（193） | 9 | [第 2 回 server.ts の入口](02-ssrl-handlers.md)<br>[Node のリクエストとレスポンス](../ssrx/08-ssrx-node-streams.md) |
| request\_http2\_spec.ts | 229 | createWebRequestFromNodeRequest (HTTP/2)（20）<br>GET handling（59）<br>POST handling（150）<br>abort handling（192） | 9 | [第 2 回 server.ts の入口](02-ssrl-handlers.md)<br>[Node のリクエストとレスポンス](../ssrx/08-ssrx-node-streams.md) |
| request\_spec.ts | 214 | createRequestUrl（29） | 14 | [第 2 回 server.ts の入口](02-ssrl-handlers.md) |
| response\_http1\_spec.ts | 154 | writeResponseToNodeResponse (HTTP/1.1)（13） | 5 | [Node のリクエストとレスポンス](../ssrx/08-ssrx-node-streams.md) |
| response\_http2\_spec.ts | 163 | writeResponseToNodeResponse (HTTP/2)（19） | 5 | [Node のリクエストとレスポンス](../ssrx/08-ssrx-node-streams.md) |

### build server-rendering（it 29 件）

| ファイル | 行 | describe（行） | it | 章 |
| --- | --- | --- | --- | --- |
| esm-in-memory-loader/loader-hooks\_spec.ts | 246 | esm-in-memory-loader loader-hooks（12）<br>resolve（29）<br>load（126） | 15 | [第 5 回 ビルド側のワーカー](05-ssrl-build-workers.md) |
| esm-in-memory-loader/utils\_spec.ts | 147 | server-rendering shared file utilities（11）<br>createSharedFile（12）<br>createSharedServerFiles（112） | 10 | [第 5 回 ビルド側のワーカー](05-ssrl-build-workers.md) |
| manifest\_spec.ts | 143 | generateAngularServerAppManifest（14） | 4 | [第 5 回 ビルド側のワーカー](05-ssrl-build-workers.md) |

📄 `数えたスクリプト（count-specs.mjs）`

```
// spec の地図：ファイルごとの行数、字下げの浅い（2 文字まで）describe とその行、it( で始まる行の数を grep で数える。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
const CLI = '~/angular-research/angular-cli';
const DIRS = [
  ['ssr/test', 'packages/angular/ssr/test', '//packages/angular/ssr/test:test'],
  ['ssr/node/test', 'packages/angular/ssr/node/test', '//packages/angular/ssr/node/test:test'],
  ['build server-rendering', 'packages/angular/build/src/utils/server-rendering', '//packages/angular/build:test'],
];
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : f.endsWith('_spec.ts') ? [p] : []; });
const out = [];
for (const [group, dir, target] of DIRS) {
  for (const f of walk(path.join(CLI, dir)).sort()) {
    const lines = readFileSync(f, 'utf8').split('\n');
    const tops = [];
    lines.forEach((l, i) => { const m = l.match(/^( {0,2})describe\('([^']+)'/); if (m) tops.push({ name: m[2], line: i + 1 }); });
    const its = lines.filter((l) => /^\s*it\(/.test(l)).length;
    out.push({ group, target, file: path.relative(path.join(CLI, dir), f), lines: lines.length - (lines.at(-1) === '' ? 1 : 0), tops, its });
  }
}
console.log(JSON.stringify(out));

```

## 2. 走らせ方と結果

📄 `走らせ方`

```
# 練習用の作業木（../angular-cli-fix から 44129f66a3 で作った別の場所）。node_modules は ../angular-cli-fix のものを symlink
git -C ~/angular-research/angular-cli-fix worktree add <scratchpad>/ssrl-wt-b 44129f66a3
ln -s ~/angular-research/angular-cli-fix/node_modules <scratchpad>/ssrl-wt-b/node_modules
cd <scratchpad>/ssrl-wt-b

pnpm bazel test //packages/angular/ssr/test:test //packages/angular/ssr/node/test:test //packages/angular/build:test \
  --nocache_test_results --test_output=all

# build の 615 件から、server-rendering の 3 つの spec だけに絞る（一番外の describe の名前。正規表現）
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all \
  "--test_arg=--filter=^(generateAngularServerAppManifest|esm-in-memory-loader loader-hooks|server-rendering shared file utilities) "
```

📄 `自分で走らせた結果（2026-11-19）`

```
//packages/angular/ssr/node/test:test   PASSED in 0.5s    42 specs, 0 failures
//packages/angular/ssr/test:test        PASSED in 1.1s   249 specs, 0 failures
//packages/angular/build:test           PASSED in 7.3s   154 + 153 + 154 + 154 = 615 specs, 0 failures（Stats over 4 runs）
Executed 3 out of 3 tests: 3 tests pass.   （INFO: Elapsed time: 48.686s。作業木で初めて走らせた回）

--filter で 3 つの spec に絞ったとき：shard ごとに Ran 7 of 593 / 7 of 593 / 7 of 593 / 8 of 594 specs → 29 件
```

3 つのターゲットは BUILD.bazel が違います。`//packages/angular/ssr/test:test` と `node/test:test` は spec を 1 つに束ねてから走らせ（`spec_bundle`）、ssr/test は `flaky = True` なので、落ちると 3 回まで走り直します（4 節の表で「落ちた」行のログには、同じ結果が 3 回出ていました）。`//packages/angular/build:test` は `packages/angular/build/BUILD.bazel` の `jasmine_test(name = "test", shard_count = 4)` で、`src/**/*_spec.ts` の全部（615 件）を 4 つに分けて走らせます。server-rendering の spec はそのうちの 29 件です。`--filter` は shard ごとに効き、0 件に絞っても `PASSED` になるので、「Ran N of M specs」を足して確かめます。

## 3. 章ごとの約束と、固めている spec

| 章 | 本文の約束 | 固めている spec（行） |
| --- | --- | --- |
| [第 1 回](01-ssrl-provide.md) | provideServerRendering(withRoutes(…)) が SERVER\_ROUTES\_CONFIG を積む | test/testing-utils.ts 114 行目の 1 か所で呼び、app\_spec と app-engine\_spec のアプリがそれで起動する。直接確かめる it は無い |
| withAppShell と ServerRenderingOptions | 無し（test/ のどこでも起動されない） |   |
| [第 2 回](02-ssrl-handlers.md) | createRequestHandler・createNodeRequestHandler が付ける印、isSsr\*RequestHandler、attachNodeGlobalErrorHandlers | 無し（ssr の test/・node/test/、build の server-rendering の spec のどれにも無い） |
| Node の req から Web の Request を作る | node/test/request\_spec.ts（describe createRequestUrl 29 行目）、request\_http1\_spec.ts（13 行目）、request\_http2\_spec.ts（20 行目） |   |
| [第 3 回](03-ssrl-common-engine.md) | CommonEngine と peformance-profiler.ts | 無し |
| Hooks の on・has・run | test/hooks\_spec.ts（describe Hooks 11 行目、7 件） |   |
| [第 4 回](04-ssrl-i18n-url.md) | getPotentialLocaleIdFromUrl・getPreferredLocale の答え | test/i18n\_spec.ts（11 行目 8 件、69 行目 12 件） |
| 大文字と小文字を区別しない比べ方（normalizeLocale） | 無し（4 節の M1） |   |
| url.ts の小道具（index.html を落とす、\* の置き換えほか） | test/utils/url\_spec.ts（describe URL Utils 20 行目、38 件） |   |
| AngularAppEngine のマニフェストの置き場と静的なフラグ | test/app-engine\_spec.ts の 5 つの describe が setAngularAppEngineManifest を呼び（112・230・297・348・437 行目）、Disable host check（433 行目）が 458・462 行目で ɵdisableAllowedHostsCheck を立てて戻す。getter が投げる文の it は無い |   |
| [第 5 回](05-ssrl-build-workers.md) | ESM ローダーのフックの resolve と load | esm-in-memory-loader/loader-hooks\_spec.ts（12 行目、15 件） |
| `@angular/` のファイルに `var ngServerMode=true;` を足す | 無し（4 節の M5） |   |
| 出力のファイルを SharedArrayBuffer に | esm-in-memory-loader/utils\_spec.ts（11 行目、10 件） |   |
| サーバー用のマニフェスト（重要 CSS・nonce・CSS を chunk にしない） | manifest\_spec.ts（14 行目、4 件）。escapeUnsafeChars とエンジン用のマニフェストは無し（M6） |   |
| launch-server・fetch-patch・render-worker・routes-extractor-worker・prerender.ts・models.ts・generateRedirectStaticPage | unit の spec は無し。e2e の tests/e2e/tests/build/server-rendering/ と prerender/ がビルドしたアプリで確かめる |   |

第 1〜3 回の行は、それぞれの章の「テストと直し方」と同じ内容です。第 1〜3 回は spec を作業木で書き足して走らせた結果（255 件・45 件）も載せていて、この章の 2 節の 249・42 件は、何も足していないときの数です。

## 4. 1 行ずつ変えて、落ちる it を数える

同じ作業木で、第 4・5 回が読んだ行を 1 つずつ変えて bazel を走らせ、落ちた it を数えました。1 つ終わるたびに `git checkout -- <ファイル>` で戻しています（スクリプトは下）。

|   | 変えた行 | 走った数 | 落ちた数 | 落ちた it |
| --- | --- | --- | --- | --- |
| M0 | build の 3 つの spec だけ（変えない） | 29 | 0 | — |
| M1 | i18n.ts 201 行目: toLowerCase をやめる | 249 | 0 | — |
| M2 | i18n.ts 88 行目: q 値の並べ替えをやめる | 249 | 2 | getPreferredLocale should return the closest match when no valid languages in header<br>getPreferredLocale should return the exact match with the highest quality value |
| M3 | url.ts 147 行目: -11 を -10 に | 249 | 5 | URL Utils stripIndexHtmlFromURL should handle URLs with HTTPS scheme and /index.html at the end<br>URL Utils stripIndexHtmlFromURL should handle URLs with a fragment and /index.html at the end<br>URL Utils stripIndexHtmlFromURL should handle URLs with both query parameters and fragments and /index.html at the end<br>URL Utils stripIndexHtmlFromURL should handle URLs with query parameters and /index.html at the end<br>URL Utils stripIndexHtmlFromURL should remove /index.html from the end of the URL path |
| M4 | app-engine.ts 295〜297 行目: ロケール 1 つの近道を消す | 249 | 0 | — |
| M5 | loader-hooks.ts 141 行目: ngServerMode の前置きをやめる | 29 | 0 | — |
| M6 | manifest.ts 60 行目: escapeUnsafeChars を素通しに | 29 | 0 | — |
| M7 | prerender.ts 438 行目: 合わせた木でも appShellRoute を返す（直した形） | 615 | 0 | — |

M0 は絞り込みの数を確かめるために変えずに走らせた回です。M1・M4・M5・M6 は、変えても 1 件も落ちませんでした。どの行も、今の振る舞いを確かめる it が無いということです。M4 の近道（ロケールが 1 つなら URL を見ない）を消しても、single locale の describe（228 行目、7 件）は 7 件とも通りました。7 件の URL は `/it/…` の 6 件と `/unknown/page`（`null` を期待）で、近道が無くても `it` の入口が引かれるか、どの入口も引かれずに `null` になります。M7 は 8 節（第 5 回）の app shell の印を直した形で、615 件とも通りました。直す前も直したあとも、この行を通る spec がありません。

📄 `変えて走らせたスクリプト（mutate.py）`

```
# 作業木で 1 行ずつ変えて bazel を走らせ、落ちた spec を記録する。終わるたびに git checkout で戻す。
import subprocess, json, re, sys, os
WT = os.environ['WT']; LOG = os.environ['LOGDIR']
SSR = '//packages/angular/ssr/test:test'
BLD = '//packages/angular/build:test'
FILTER_B = '--test_arg=--filter=^(generateAngularServerAppManifest|esm-in-memory-loader loader-hooks|server-rendering shared file utilities) '
M = [
 ('M0', 'build の 3 つの spec だけ（変えない）', None, None, None, [BLD], [FILTER_B]),
 ('M1', 'i18n.ts 201 行目: toLowerCase をやめる', 'packages/angular/ssr/src/i18n.ts', '  return locale.toLowerCase();', '  return locale;', [SSR], []),
 ('M2', 'i18n.ts 88 行目: q 値の並べ替えをやめる', 'packages/angular/ssr/src/i18n.ts', '    .sort(([_localeA, qualityA], [_localeB, qualityB]) => qualityB - qualityA);', '    ;', [SSR], []),
 ('M3', 'url.ts 147 行目: -11 を -10 に', 'packages/angular/ssr/src/utils/url.ts', "modifiedURL.pathname.slice(0, /** '/index.html'.length */ -11)", "modifiedURL.pathname.slice(0, /** '/index.html'.length */ -10)", [SSR], []),
 ('M4', 'app-engine.ts 295〜297 行目: ロケール 1 つの近道を消す', 'packages/angular/ssr/src/app-engine.ts', "    if (this.supportedLocales.length === 1) {\n      return this.getEntryPointExports(supportedLocales[this.supportedLocales[0]]);\n    }\n", '', [SSR], []),
 ('M5', 'loader-hooks.ts 141 行目: ngServerMode の前置きをやめる', 'packages/angular/build/src/utils/server-rendering/esm-in-memory-loader/loader-hooks.ts', '    const source = Buffer.concat([NG_SERVER_MODE_INIT_BYTES, fileBytes]);', '    const source = fileBytes;', [BLD], [FILTER_B]),
 ('M6', 'manifest.ts 60 行目: escapeUnsafeChars を素通しに', 'packages/angular/build/src/utils/server-rendering/manifest.ts', "  return str.replace(/[$`\\\\]/g, (c) => UNSAFE_CHAR_MAP[c]);", '  return str;', [BLD], [FILTER_B]),
 ('M7', 'prerender.ts 438 行目: 合わせた木でも appShellRoute を返す（直した形）', 'packages/angular/build/src/utils/server-rendering/prerender.ts', '    return { errors, serializedRouteTree: Array.from(uniqueRoutes.values()) };', '    return { errors, appShellRoute, serializedRouteTree: Array.from(uniqueRoutes.values()) };', [BLD], []),
]
only = sys.argv[1:] 
res = []
for (mid, what, f, old, new, targets, args) in M:
  if only and mid not in only: continue
  if f:
    p = os.path.join(WT, f); s = open(p).read()
    assert s.count(old) == 1, (mid, s.count(old))
    open(p, 'w').write(s.replace(old, new))
  cmd = ['pnpm', 'bazel', 'test', *targets, '--nocache_test_results', '--test_output=all', *args]
  r = subprocess.run(cmd, cwd=WT, capture_output=True, text=True)
  out = r.stdout + r.stderr
  open(os.path.join(LOG, f'b-bazel-{mid}.log'), 'w').write(out)
  if f: subprocess.run(['git', 'checkout', '--', f], cwd=WT)
  summ = re.findall(r'(\d+) specs?, (\d+) failures?', out)
  ran = re.findall(r'Ran (\d+) of (\d+) specs', out)
  fails = sorted(set(re.findall(r'^\d+\) (.+)$', out, re.M)))
  res.append({'id': mid, 'what': what, 'exit': r.returncode, 'summary': summ, 'ran': ran, 'failed': fails})
  print(mid, r.returncode, summ, ran, len(fails), flush=True)
  json.dump(res, open(os.path.join(LOG, 'b-mutations.json' if not only else 'b-mutations-partial.json'), 'w'), ensure_ascii=False, indent=1)

```

## 5. spec を読む

📄 `angular-cli/packages/angular/ssr/test/i18n_spec.ts` L117–134 （▶ の行: 118–119, 122, 126–127, 133）

```ts
117 │   it('should return the first available locale when no valid languages are in header', () => {
118 ▶     const header = 'xyz;q=0.5';
119 ▶     const supportedLocales = ['en-GB', 'fr-FR', 'de-DE'];
120 │     const result = getPreferredLocale(header, supportedLocales);
121 │     // No valid language, fallback to the first available locale
122 ▶     expect(result).toBe('en-GB');
123 │   });
124 │ 
125 │   it('should return the closest match when no valid languages in header', () => {
126 ▶     const header = 'en-XYZ;q=0.7,fr-XYZ;q=0.8';
127 ▶     const supportedLocales = ['en-GB', 'fr-FR', 'de-DE'];
128 │     const result = getPreferredLocale(header, supportedLocales);
129 │ 
130 │     // Since there is no exact match for 'en-XYZ' or 'fr-XYZ',
131 │     // the function should return 'fr-FR' as the closest match,
132 │     // as it shares the language prefix 'fr' with the 'fr-XYZ' in the header.
133 ▶     expect(result).toBe('fr-FR');
134 │   });
```

M2（q 値の並べ替えをやめる）で落ちた 2 件のうちの 1 つが 125〜133 行目の it です。126 行目のヘッダーは `en-XYZ;q=0.7` を先に書き、133 行目は q 値の高い `fr` の接頭辞の一致（`fr-FR`）を期待します。並べ替えが無いと、書いた順の `en` が先に接頭辞で当たって `en-GB` になります。118・122 行目の it は「一致が無ければ先頭」で、[第 4 回](04-ssrl-i18n-url.md)の 2 節の「JSDoc は undefined と書くが、本物は先頭を返す」を、spec の側が先頭のほうで決めています。どちらの it も、対応ロケール（119・127 行目）とヘッダーの大文字・小文字はそろえて書かれていて、M1 で落ちる it が無いのはこのためです。

📄 `angular-cli/packages/angular/ssr/test/utils/url_spec.ts` L117–140 （▶ の行: 118, 121, 130–131, 133, 136–137, 139）

```ts
117 │   describe('stripIndexHtmlFromURL', () => {
118 ▶     it('should remove /index.html from the end of the URL path', () => {
119 │       const url = new URL('http://www.example.com/page/index.html');
120 │       const result = stripIndexHtmlFromURL(url);
121 ▶       expect(result.href).toBe('http://www.example.com/page');
122 │     });
123 │ 
124 │     it('should not modify the URL if /index.html is not present', () => {
125 │       const url = new URL('http://www.example.com/page');
126 │       const result = stripIndexHtmlFromURL(url);
127 │       expect(result.href).toBe('http://www.example.com/page');
128 │     });
129 │ 
130 ▶     it('should handle URLs without a path', () => {
131 ▶       const url = new URL('http://www.example.com/index.html');
132 │       const result = stripIndexHtmlFromURL(url);
133 ▶       expect(result.href).toBe('http://www.example.com/');
134 │     });
135 │ 
136 ▶     it('should not modify the URL if /index.html is in the middle of the path', () => {
137 ▶       const url = new URL('http://www.example.com/index.html/page');
138 │       const result = stripIndexHtmlFromURL(url);
139 ▶       expect(result.href).toBe('http://www.example.com/index.html/page');
140 │     });
```

M3（`-11` を `-10` に）で落ちたのは、この describe の 5 件でした。130〜134 行目の「根の `/index.html`」は落ちません。`-10` でも pathname が `/` になり、URL の決まりで同じ `http://www.example.com/` になるからです。136〜140 行目は「途中の `index.html` は落とさない」で、[第 4 回](04-ssrl-i18n-url.md)の 3 節の `endsWith('/index.html')` を固めます。大文字の `INDEX.HTML` の it はありません。app\_spec と app-engine\_spec の「index.html で終わる URL」の it は M3 で落ちませんでした。どちらも `/ssr/index.html` のような URL で、10 文字だけ落とすと pathname は `/ssr/` になりますが、その URL でも同じページが描かれて it は通りました。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/esm-in-memory-loader/loader-hooks_spec.ts` L12–28 （▶ の行: 13–15, 18, 23–25）

```ts
12 │ describe('esm-in-memory-loader loader-hooks', () => {
13 ▶   const workspaceRoot = '/mock/workspace/root';
14 ▶   const sharedFiles = createSharedServerFiles({
15 ▶     'main.server.mjs': 'export const main = true;',
16 │     'chunk-abc.mjs': 'export const chunk = "abc";',
17 │     'nested/chunk-sub.mjs': 'export const sub = "sub";',
18 ▶     'utf8.mjs': 'export const text = "🔥 UTF-8 🚀";',
19 │     'empty.mjs': '',
20 │   });
21 │ 
22 │   beforeEach(() => {
23 ▶     initialize({
24 ▶       workspaceRoot,
25 ▶       outputFiles: sharedFiles,
26 │     });
27 │   });
28 │ 
```

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/esm-in-memory-loader/loader-hooks_spec.ts` L224–246 （▶ の行: 224, 227, 232, 238, 240, 242）

```ts
224 ▶     it('should delegate to nextLoad for non-angular file URLs', async () => {
225 │       const nextLoad = jasmine.createSpy('nextLoad').and.resolveTo({ format: 'module' });
226 │       const result = await load(
227 ▶         'file:///workspace/node_modules/rxjs/index.js',
228 │         { format: 'module' },
229 │         nextLoad,
230 │       );
231 │ 
232 ▶       expect(nextLoad).toHaveBeenCalledWith('file:///workspace/node_modules/rxjs/index.js', {
233 │         format: 'module',
234 │       });
235 │       expect(result.format).toBe('module');
236 │     });
237 │ 
238 ▶     it('should delegate to nextLoad for non-memory non-file URLs', async () => {
239 │       const nextLoad = jasmine.createSpy('nextLoad').and.resolveTo({ format: 'builtin' });
240 ▶       const result = await load('node:fs', { format: 'builtin' }, nextLoad);
241 │ 
242 ▶       expect(nextLoad).toHaveBeenCalledWith('node:fs');
243 │       expect(result.format).toBe('builtin');
244 │     });
245 │   });
246 │ });
```

loader-hooks\_spec は、14 行目の SharedArrayBuffer の表を 23〜26 行目の `initialize` に渡し、resolve と load を関数として直接呼びます（[第 5 回](05-ssrl-build-workers.md)の 6 節の記録と同じ呼び方です）。load の it は、メモリ上のファイルの 6 件（表に無いときに reject する 1 件を含む）と、227 行目の `rxjs`（`/@angular/` を含まない）と 240 行目の `node:fs` を次へ回す 2 件です。`/@angular/` を含むファイルに 1 行足す道の it はありません（M5）。242 行目は `nextLoad` が `'node:fs'` の 1 つの引数で呼ばれることを確かめていて、第 5 回の「組み込みは context を渡さずに次へ」を固めています。

📄 `angular-cli/packages/angular/build/src/utils/server-rendering/manifest_spec.ts` L14–52 （▶ の行: 14, 21, 36, 39–40, 44, 48–50）

```ts
14 ▶ describe('generateAngularServerAppManifest', () => {
15 │   beforeAll(async () => {
16 │     await initializeHash();
17 │   });
18 │ 
19 │   const dummyMetafile = { inputs: {}, outputs: {} } as unknown as Metafile;
20 │ 
21 ▶   it('should include criticalCssPlans when inlineCriticalCss is true', async () => {
22 │     const additionalHtml = new Map([
23 │       [
24 │         'index.server.html',
25 │         createOutputFile(
26 │           'index.server.html',
27 │           '<html><body><app-root></app-root></body></html>',
28 │           BuildOutputFileType.ServerApplication,
29 │         ),
30 │       ],
31 │     ]);
32 │     const outputFiles = [
33 │       createOutputFile('styles.css', 'h1 { color: blue; }', BuildOutputFileType.Browser),
34 │     ];
35 │ 
36 ▶     const { manifestContent } = await generateAngularServerAppManifest(
37 │       additionalHtml,
38 │       outputFiles,
39 ▶       true,
40 ▶       undefined,
41 │       undefined,
42 │       '/',
43 │       new Set(),
44 ▶       dummyMetafile,
45 │       undefined,
46 │     );
47 │ 
48 ▶     expect(manifestContent).toContain('criticalCssPlans: [');
49 ▶     expect(manifestContent).toContain('styles.css');
50 ▶     expect(manifestContent).not.toContain('nonce:');
51 │   });
52 │ 
```

manifest\_spec は generateAngularServerAppManifest を 9 つの引数で直接呼び、返った `manifestContent` の文字列に `toContain` を当てます。39 行目の `true` が inlineCriticalCss、40 行目の `undefined` が routes、44 行目が metafile で、48〜50 行目が文字列の検査です。4 件とも HTML は `<html><body>…` のような `` ` `` も `$` も含まない文字列で、M6（escapeUnsafeChars を素通し）で落ちる it はありません。44129f66a3 のあとの dd095343a5 と be9e3a01f3 は、どちらもこの describe に it を足しています（`'` を含むルート、`blog/archive` と `blog_archive`）。

## 6. 開いている issue

angular/angular-cli のラベル `area: @angular/ssr` の開いている issue を、2026-11-19 に `gh issue list` で読みました（11 件）。本文を読んで、一番近いこのシリーズの章（無ければ既存の章）に振り分けています。このシリーズの章に入ったのは 8 件です。

| 章 | 件数 |
| --- | --- |
| [第 1 回 provideServerRendering](01-ssrl-provide.md) | 1 |
| [第 2 回 server.ts の入口](02-ssrl-handlers.md) | 1 |
| [第 3 回 CommonEngine](03-ssrl-common-engine.md) | 0 |
| [第 4 回 i18n と URL](04-ssrl-i18n-url.md) | 3 |
| [第 5 回 ビルド側のワーカー](05-ssrl-build-workers.md) | 3 |
| [ルートの取り出し](../srt/01-srt-extract.md) | 1 |
| [Node のリクエストとレスポンス](../ssrx/08-ssrx-node-streams.md) | 1 |
| （どの章でもない） | 1 |

11 件

| # | 作られた日 | 題 | 何の話か | 章 | ラベル | コメント |
| --- | --- | --- | --- | --- | --- | --- |
| 34754 | 2026-11-19 | Angular SSR can crash \`AngularAppEngine\` servers with a single aborted request (22.2.6 regression) | 22.2.6 から、描画中にクライアントが切断すると、AngularAppEngine で動かすサーバー（node:http・Hono・Deno など）がプロセスごと落ちる。AngularNodeAppEngine はプロセス全体のエラー処理を付けるので落ちない（第 2 回の attachNodeGlobalErrorHandlers）。原因に挙げているのは renderAngular が中断で platform を壊す変更（第 4 回の 4 節） | [第 2 回 server.ts の入口](02-ssrl-handlers.md) | area: @angular/ssr | 0 |
| 33819 | 2026-08-08 | Proposal: \`103 Early Hints\` from \`@angular/ssr/node\`, with measurements | @angular/ssr/node から 103 Early Hints を送る提案。描画の待ち時間に main の JS を先に取らせた計測つき | [Node のリクエストとレスポンス](../ssrx/08-ssrx-node-streams.md) | severity4: memory/performance, area: @angular/ssr, gemini-triaged | 1 |
| 33555 | 2026-07-12 | Angular SSR route-policy confusion can expose client-only data under public cache headers | /profile; や /profile//public のような形のパスで、ServerRoute の照合と Router の描画が別のルートになり、Client のルートが別の ServerRoute の public なキャッシュのヘッダーで描かれる。パスを整える小道具（stripMatrixParams・joinUrlParts）は第 4 回、照合はルートの木の章 | [第 4 回 i18n と URL](04-ssrl-i18n-url.md) | area: @angular/ssr, gemini-triaged | 1 |
| 32490 | 2026-02-13 | Prerendering of concrete server route doesn't work, when using wildcard client route | Router のルートが \*\* だけのとき、ServerRoute に書いた具体的なルートを Prerender にしても prerender されない | [ルートの取り出し](../srt/01-srt-extract.md) | type: bug/fix, freq1: low, severity3: broken, area: @angular/ssr | 2 |
| 31340 | 2025-09-29 | feat: add option to disable route extraction feature | ルートの取り出しを止めるオプションの要望（NG\_BUILD\_PARTIAL\_SSR=1 で一部だけ止められる）。取り出すのは第 5 回の routes-extractor-worker | [第 5 回 ビルド側のワーカー](05-ssrl-build-workers.md) | feature, feature: insufficient votes, area: @angular/ssr | 14 |
| 30305 | 2025-05-14 | Angular 19 SSR/hybrid rendering engine: cross-request cache | リクエストをまたいで SSR 中の API の応答をキャッシュしたい、という要望 | （どの章でもない） | feature, feature: under consideration, area: @angular/ssr | 4 |
| 29787 | 2025-03-09 | Angular v19 prerender uses the wrong package.json | prerender が dist ではなくソースの側の package.json の imports を読む。第 5 回の 6 節のとおり、メモリ上のファイルは &lt;workspaceRoot&gt;/.angular/prerender-root/&lt;UUID&gt;/ にあるものとして解決される | [第 5 回 ビルド側のワーカー](05-ssrl-build-workers.md) | type: bug/fix, freq1: low, angular/build:application, area: @angular/ssr, area: @angular/build | 3 |
| 29449 | 2025-01-22 | Dynamic base href (APP\_BASE\_HREF) for SSR | SSR で base href（APP\_BASE\_HREF）をリクエストごとに変えたい（ドメインごとに違う base href の複数テナント）。base path と接頭辞を扱う行は第 4 回 | [第 4 回 i18n と URL](04-ssrl-i18n-url.md) | feature, feature: insufficient votes, area: @angular/ssr | 6 |
| 29425 | 2025-01-21 | Route-specific app-shell: prerendering dynamic parameterized pages | パラメーター付きのルート（posts/:id）に、1 枚の prerender した骨組みのページを返したい（ルートごとの app shell）。withAppShell は第 1 回 | [第 1 回 provideServerRendering](01-ssrl-provide.md) | feature, feature: under consideration, area: @angular/ssr | 4 |
| 29188 | 2024-12-19 | allow proxy config during ng build when using \`outputMode: server\` | outputMode: server の ng build で proxy の設定を使いたい。ルートの取り出し中の /api の呼び出しが、第 5 回の launch-server が起動した server.ts の \*\* に回ってループする | [第 5 回 ビルド側のワーカー](05-ssrl-build-workers.md) | type: bug/fix, freq1: low, severity3: broken, angular/build:application, area: @angular/ssr, area: @angular/build | 5 |
| 29111 | 2024-12-11 | Support for Multi-Domain Locale Detection in Angular SSR | URL の区切りではなく、ドメインでロケールを選びたい。今のロケールの選び方は URL の区切りと Accept-Language だけ（第 4 回の 1・2 節） | [第 4 回 i18n と URL](04-ssrl-i18n-url.md) | feature, area: @angular/ssr | 5 |

開いていないが、このシリーズの行に直接つながる issue もあります。#34722（同じ chunk になる 2 つのページ）は main の be9e3a01f3 で、#34358（Node 26 の `module.register()` の非推奨）は b640b32e14 で、#29236（server の fetch の相対 URL）は a0b4ea23c4 で、#27590（空白を含む資産の名前）は 5f1478786e で閉じています（どれも第 5 回）。

## 7. このシリーズで見つけたもの

どれも 44129f66a3 の行を読み、Node か本物の ng build（@angular/build・@angular/ssr 22.2.7）で確かめたものです。gh で同じ話の issue と PR を探し、見つからなかったものには「既存なし」と書いています。

|   | 何が起きるか | 行 | 確かめ方 | 既存の issue |
| --- | --- | --- | --- | --- |
| A1 | CommonEngine に `enablePerformanceProfiler: true` を付けて 2 つのリクエストを重ねると、先に始まって後に終わった方の render が `SyntaxError: The "start:🅰️:Render Page" performance mark has not been set` で reject する。表（printPerformanceLogs）にもほかのリクエストの行が混ざる | peformance-profiler.ts 44〜46 行目で mark の名前がラベルだけで決まり、52〜56 行目の finally で後の方が先の方の start の mark を消す。15 行目はプロセスの measure を全部読む | 第 3 回の記録（150 ms と 40 ms の render を 30 ms ずらして重ねる） | 閉じた #27374 が同じ例外（再現できず閉じられている）。開いているものはなし |
| A2 | createRequestHandler / createNodeRequestHandler の JSDoc の例は `export default` だが、dev-server と prerender が読むのは名前つきの `reqHandler` だけ。例どおりに書くと ng serve は警告を出して内部の中間処理に切り替わる | src/handler.ts 31・39 行目、node/src/handler.ts 37 行目ほか。読む側は ssr-middleware.ts 105〜106 行目と launch-server.ts 22 行目 | 第 2 回の記録（export default だけの server.ts） | 既存なし |
| B1 | outputMode を書かない設定で `prerender.routesFile` と withAppShell を一緒に使うと、app shell の印が落ち、index.html が app shell にならない（index.html が出力されず、ng-app-shell/index.html が別に出る） | prerender.ts 438 行目の return が appShellRoute を返さない（b2e2be052f が 427 行目の return にだけ足した）。main でも同じ | 第 5 回の「outputMode なし ＋ routesFile」と「prerender: true」の 2 つのビルド。M7 で直しても 615 件とも通る | 既存なし（"routesFile appShell" ほかで検索） |
| B2 | routesFile の末尾に改行があると、空の行が `/` のルートになり、RenderMode.Client にした `/` も prerender される | prerender.ts の routesFile の行（split のあと空の行を除かない）。main でも同じ | 第 5 回の「同じ ＋ routes.txt の末尾に改行」のビルド | 既存なし |
| B3 | 大文字と小文字を区別しない比べ方を固める it が無い | i18n.ts 200・201 行目（JSDoc は 99 行目） | M1：`toLowerCase()` を消しても 249 件とも通る | —（spec の抜け） |
| B4 | JSDoc と本物の食い違い：空文字の約束、`*` の説明、Map の順、renderAngular の戻り値の `destroy`、「ファイルらしいリクエストは飛ばす」のコメント | i18n.ts 13・14、52、64・65 行目。ng.ts 49〜52 行目。app-engine.ts 230・237 行目 | 第 4 回の JSDoc の表（本物の関数に流した） | —（文書） |
| B5 | JSDoc と本物の食い違い（ビルドの側）：PrerenderOutput の例の `appShell`、escapeUnsafeChars の「Unicode のエスケープ」、エンジン用のマニフェストの「Google App Engine」 | prerender.ts 47・51 行目。manifest.ts 54 行目、66・67 行目 | 第 5 回の 8 節 | —（文書） |
| B6 | `ExtractRoutesWorkerData` がどこからも使われず、使っている `hasSsrEntry` を型に持たない | routes-extractor-worker.ts 17・18、24〜26 行目 | ../angular-cli を grep して定義の 1 か所だけ | —（型） |
| B7 | 44129f66a3 の generateRedirectStaticPage は `"` を含むリダイレクト先で属性を壊す | utils.ts 34 行目から | 第 5 回の 4 節（2 つの版に同じ URL） | main の 537a47a482 で直っている（22.2.7 に入っている） |

振る舞いとして確かめたが食い違いではないものも 2 つあります。prerender 中にコンポーネントが資産でない相対 URL を `fetch('/…')` で直接呼ぶと、fetch-patch が受け取った文字列をそのまま元の fetch に回し、`Failed to parse URL from /api/hello` で失敗します（server.ts を起動した設定でも同じ。HttpClient の呼び出しは先に絶対 URL になるので届く）。また、prerender の描画では `inject(REQUEST)` が `null` です。どちらも第 5 回の記録にあります。

## 聞かれそうな質問

**Q. @angular/build の server-rendering の spec だけを走らせるには？**

`//packages/angular/build:test` に `"--test_arg=--filter=^(generateAngularServerAppManifest|esm-in-memory-loader loader-hooks|server-rendering shared file utilities) "` を付けます。shard が 4 つあるので、Ran N of M を 4 つ足して 29 件になることを確かめます。

**Q. flaky = True の ssr/test で落ちると、何回走りますか？**

3 回です。M2 と M3 のログには、同じ「249 specs, 2 failures」と「249 specs, 5 failures」が 3 回ずつ出ていました。

**Q. このシリーズの行で、spec が 1 つも無いのはどこですか？**

第 2 回の印と attachNodeGlobalErrorHandlers、第 3 回の CommonEngine と性能の記録、第 5 回の launch-server・fetch-patch・ワーカー・prerender.ts・models.ts・generateRedirectStaticPage です（3 節の表の色の付いた行）。ビルドの側は e2e がアプリを組み立てて確かめます。

**Q. B1 を固めるなら、どこに spec を足しますか？**

prerender.ts には unit の spec が無いので、e2e の `tests/e2e/tests/build/app-shell/` に、outputMode を書かず `prerender.routesFile` と withAppShell を使うアプリを組み立て、index.html が app shell になることを見る形です。直す行は 438 行目の return に `appShellRoute` を足すだけで、M7 で 615 件が通ることは確かめてあります。

**Q. 開いている issue のうち、第 5 回のワーカーに関係するのは？**

3 件です。ルートの取り出しを止めたい（#31340）、prerender がソースの側の package.json を読む（#29787、仮想の根からの解決）、取り出し中の /api がループする（#29188、launch-server が起動した server.ts）。

## 読み終えて

- ssr/test は 249 件、ssr/node/test は 42 件、build は 4 つの shard で 615 件。server-rendering の spec はそのうち 29 件で、describe の名前の --filter で絞れる。
- このシリーズの行の多く（handler の印、CommonEngine、launch-server、fetch-patch、ワーカー、prerender.ts）には unit の spec が無い。
- 1 行ずつ変えて走らせると、normalizeLocale・ロケール 1 つの近道・ngServerMode の前置き・escapeUnsafeChars は 1 件も落ちなかった。
- 開いている issue 11 件のうち 8 件がこのシリーズの章に入る。第 4 回はロケールと base href、第 5 回はルートの取り出しと prerender のサーバー。
- 第 5 回の app shell の印（B1）は、直す形が 1 行で、どの spec も通ることまで確かめてある。

---

← 前: [ビルド側のワーカー：ルートの取り出し・prerender の描画・サーバーの起動・fetch の差し替え](05-ssrl-build-workers.md)
