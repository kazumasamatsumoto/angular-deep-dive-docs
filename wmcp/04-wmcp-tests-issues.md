[目次](../README.md) › [WebMCP の内側：Angular のアプリが AI のエージェントにツールを渡す](README.md) › 第 4 回 / 全 4 回

# spec と issue を読む：WebMCP を固めているテスト

> core の test/webmcp の 2 つと forms の webmcp.spec.ts の 22 本が、このシリーズの各章の約束をどこで固めているか、作り物の modelContext の作り方（polyfill から #71959 のローカルの mock へ）、手元での走らせ方と結果、WebMCP の issue と PR の表（公式の webmcp-types・document への移動・重複したツール名など）と閉じた PR の傾向、angular-main の続き（38afab7a244 など）。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/wmcp-tests-issues)

---

この章で分かること：第 1〜3 回で読んだ WebMCP の約束を、どの spec のどの it が固めているかの地図と、spec がブラウザの代わりに置く「作り物の modelContext」の作り方、手元で走らせた数です。後半は、WebMCP の issue と PR を章ごとに振り分け、マージされずに閉じた PR の理由を数で見て、angular-main とその先の続きを並べます。

読む対象は `packages/core/test/webmcp/` の `declare_tool_spec.ts`・`provide_tools_spec.ts` と `packages/forms/signals/test/web/webmcp.spec.ts`、PR #71959 が足した `packages/private/testing/src/webmcp_mock.ts` です。Bazel の target の読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせる方法は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. declareExperimentalWebMcpTool](01-wmcp-declare.md)
2. [2. provide とアプリの寿命](02-wmcp-provide.md)
3. [3. Signal Forms のフォームをツールにする](03-wmcp-forms.md)
4. **4. spec と issue**（この章）

## 1. spec の地図

WebMCP の spec は 3 つのファイルにまとまっていて、ほかの場所（platform-server や router の spec）には `modelContext` の文字が出てきません（8576f161ae4 で `grep -rl` したもの）。行番号は it の行です。core の 2 つで 13 本、forms の 1 つで 9 本です。

| ファイル（packages/ から） | 行 | it | 章 |
| --- | --- | --- | --- |
| `core/test/webmcp/declare_tool_spec.ts` | 37 | should register a tool | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/declare_tool_spec.ts` | 68 | should pass tool annotations to registerTool | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/declare_tool_spec.ts` | 98 | should throw if the tool is already registered | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/declare_tool_spec.ts` | 124 | should unregister the tool when its \`Injector\` is destroyed | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/declare_tool_spec.ts` | 146 | should unregister the tool when its injection context is destroyed and no \`injector\` is provided | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/declare_tool_spec.ts` | 167 | should throw when called outside an injection context and no \`injector\` is provided | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/declare_tool_spec.ts` | 180 | should pass an \`AbortSignal\` to the tool and abort it when the injector is destroyed | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/declare_tool_spec.ts` | 221 | should pass an \`AbortSignal\` to the tool and abort it when the client signal aborts | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/declare_tool_spec.ts` | 252 | should run \`execute\` in an injection context | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/declare_tool_spec.ts` | 281 | should infer correct types from schema（型だけの検査。中の関数は呼ばれない） | [第 1 回](01-wmcp-declare.md) |
| `core/test/webmcp/provide_tools_spec.ts` | 32 | should register tools when initialized | [第 2 回](02-wmcp-provide.md) |
| `core/test/webmcp/provide_tools_spec.ts` | 63 | should unregister tools when the injector is destroyed | [第 2 回](02-wmcp-provide.md) |
| `core/test/webmcp/provide_tools_spec.ts` | 87 | should work with route providers（withAutoCleanupInjectors） | [第 2 回](02-wmcp-provide.md) |
| `forms/signals/test/web/webmcp.spec.ts` | 37 | should infer schema and register form as a tool | [第 3 回](03-wmcp-forms.md) |
| `forms/signals/test/web/webmcp.spec.ts` | 100 | should infer required validators in schema | [第 3 回](03-wmcp-forms.md) |
| `forms/signals/test/web/webmcp.spec.ts` | 149 | should fill out and submit the form successfully | [第 3 回](03-wmcp-forms.md) |
| `forms/signals/test/web/webmcp.spec.ts` | 190 | should return a failure message if form validation fails | [第 3 回](03-wmcp-forms.md) |
| `forms/signals/test/web/webmcp.spec.ts` | 224 | should return a failure message if the submit action fails | [第 3 回](03-wmcp-forms.md) |
| `forms/signals/test/web/webmcp.spec.ts` | 257 | should throw an error if the submit action throws an error | [第 3 回](03-wmcp-forms.md) |
| `forms/signals/test/web/webmcp.spec.ts` | 280 | should throw an error if schema cannot be inferred accurately | [第 3 回](03-wmcp-forms.md) |
| `forms/signals/test/web/webmcp.spec.ts` | 324 | should not throw an error when reading the model（#69262） | [第 3 回](03-wmcp-forms.md) |
| `forms/signals/test/web/webmcp.spec.ts` | 343 | should throw an error if \`experimentalWebMcpTool\` is configured but \`provideWebMcpForms\` was not | [第 3 回](03-wmcp-forms.md) |

describe は `declare_tool_spec.ts` の 23 行目 `declareExperimentalWebMcpTool`、`provide_tools_spec.ts` の 18 行目 `provideExperimentalWebMcpTools`、`webmcp.spec.ts` の 16 行目 `Signal Forms WebMCP Integration`（その中の 30 行目に `with provideWebMcpForms() provided`）です。

コミットの側から見ると、spec を 1 つも触らずに入ったものが 3 つあります。SSR で無効にする e50d47a4931（[第 2 回](02-wmcp-provide.md)）、DOM clobbering に備える 8cf7731468f（[第 1 回](01-wmcp-declare.md)）、説明を必須にする c121407c0da（型だけの変更）です。前の 2 つは、`declare_tool.ts` の最初の 2 つの `return` の条件で、どの it もその条件を満たさない状態を作りません（`ngServerMode` を立てる it も、`registerTool` を持たない `modelContext` を置く it も無い）。

## 2. 作り物の modelContext

spec はブラウザの本物の `document.modelContext` を使えないので、作り物を置きます。8576f161ae4 では npm の `@mcp-b/webmcp-polyfill` を使っています。

📄 `angular/packages/forms/signals/test/web/webmcp.spec.ts` L9–35 （▶ の行: 12–13, 19–20, 23, 27, 33）

```ts
 9 │ import {ApplicationRef, Component, input, linkedSignal, signal} from '@angular/core';
10 │ import {TestBed} from '@angular/core/testing';
11 │ import {form, provideExperimentalWebMcpForms, required} from '@angular/forms/signals';
12 ▶ import {cleanupWebMCPPolyfill, initializeWebMCPPolyfill} from '@mcp-b/webmcp-polyfill';
13 ▶ import type {ChromeModelContextExtensions, ModelContext} from '@mcp-b/webmcp-types';
14 │ import {REGISTER_WEBMCP_FORM, RegisterWebMcpForm} from '../../src/webmcp/tokens';
15 │ 
16 │ describe('Signal Forms WebMCP Integration', () => {
17 │   beforeEach(() => {
18 │     // Firefox throws a security error with this.
19 ▶     Object.defineProperty(globalThis, 'originAgentCluster', {
20 ▶       value: true,
21 │       configurable: true,
22 │     });
23 ▶     initializeWebMCPPolyfill({installTestingShim: true});
24 │   });
25 │ 
26 │   afterEach(() => {
27 ▶     cleanupWebMCPPolyfill();
28 │   });
29 │ 
30 │   describe('with provideWebMcpForms() provided', () => {
31 │     beforeEach(() => {
32 │       TestBed.configureTestingModule({
33 ▶         providers: [provideExperimentalWebMcpForms()],
34 │       });
35 │     });
```

12 行目で polyfill の 2 つの関数を、13 行目でその型を import します。23 行目の `initializeWebMCPPolyfill({installTestingShim: true})` が `document.modelContext` を置き、27 行目の `cleanupWebMCPPolyfill()` が外します。19〜22 行目は、18 行目のコメントのとおり Firefox で polyfill が security error を出すのを避けるために `originAgentCluster` を書き換えています。33 行目で `provideExperimentalWebMcpForms()` を TestBed に入れます。`BUILD.bazel` の 14〜15 行目の依存がこの 2 つの package です（[\[formField\] のシリーズの最終回](../sfd/06-sfd-tests-issues.md)の 2 節で引用したファイル）。

📄 `angular/packages/forms/signals/test/web/webmcp.spec.ts` L49–75 （▶ の行: 49–50, 62, 64–66, 72, 75）

```ts
49 ▶       const modelContext = (globalThis.document as any).modelContext;
50 ▶       const registerSpy = spyOn(modelContext, 'registerTool').and.callThrough();
51 │ 
52 │       TestBed.runInInjectionContext(() => {
53 │         form(model, {
54 │           experimentalWebMcpTool: {
55 │             name: 'testFormTool',
56 │             description: 'A test form tool',
57 │           },
58 │         });
59 │       });
60 │       await TestBed.inject(ApplicationRef).whenStable();
61 │ 
62 ▶       expect(registerSpy).toHaveBeenCalledWith(
63 │         jasmine.objectContaining({
64 ▶           annotations: {
65 ▶             readOnlyHint: false,
66 ▶             untrustedContentHint: false,
67 │           },
68 │         }),
69 │         jasmine.anything(),
70 │       );
71 │ 
72 ▶       const registeredTools = await getModelContext().getTools();
73 │       expect(registeredTools[0].name).toBe('testFormTool');
74 │       expect(registeredTools[0].description).toBe('A test form tool');
75 ▶       expect(registeredTools[0].inputSchema).toEqual({
```

渡したものを確かめる方法は 2 つあります。49〜50 行目のように polyfill の `registerTool` を `spyOn(…).and.callThrough()` で包み、62〜70 行目で渡された引数（annotations）を見る方法と、72 行目のように polyfill の `getTools()` で登録済みのツールを読み、75 行目からの `inputSchema` を比べる方法です。

📄 `angular/packages/forms/signals/test/web/webmcp.spec.ts` L357–368 （▶ の行: 359, 361, 364, 367）

```ts
357 │ });
358 │ 
359 ▶ function getModelContext(): ModelContext & ChromeModelContextExtensions {
360 │   // Because we use the 3p types, we need to cast the document.
361 ▶   return globalThis.document.modelContext!;
362 │ }
363 │ 
364 ▶ async function executeTool(toolName: string, args: string) {
365 │   const toolsForSubmit = await getModelContext().getTools();
366 │   const testFormSubmitTool = toolsForSubmit.find((t) => t.name === toolName)!;
367 ▶   return getModelContext().executeTool!(testFormSubmitTool, args);
368 │ }
```

361 行目で `document.modelContext` を polyfill の型（`ModelContext & ChromeModelContextExtensions`）として読みます。367 行目の `executeTool` は polyfill が足した呼び出し口で、引数を **JSON の文字列**で受けます。そのため spec の呼び出しは `JSON.stringify({…})` を渡し、返り値を `JSON.parse` します（[第 3 回](03-wmcp-forms.md)の「テストと直し方」の 212 行目）。

### #71959：polyfill からローカルの mock へ

2026-11-11 にマージされた PR #71959（angular-main の 74961c66242 より後。core は d398ea15931、forms は 5a802b5e0fc）は、この polyfill をやめました。PR の本文の理由は次のとおりです。`@mcp-b/webmcp-polyfill` は非推奨になり、後継の `@w3c/webmcp-polyfill` にはテスト用の道具が無く、モジュールの中の Map に登録を持つので polyfill を完全に外せない。そこで core と forms のテストのために、小さな `ModelContext` の mock を書いた。

📄 `packages/private/testing/src/webmcp_mock.ts（PR #71959、gh pr diff で読んだもの。license の行を除く）`

```
import type {ModelContextTool, ModelContext} from '@angular/core/third_party/webmcp-types';

/**
 * A `WebMCP.ModelContext` mock with partially implemented API.
 */
export class ModelContextMock implements Pick<
  ModelContext,
  'registerTool' | 'getTools' | 'executeTool'
> {
  private readonly tools = new Map<string, ModelContextTool>();

  async registerTool(tool: ModelContextTool, {signal}: {signal?: AbortSignal} = {}) {
    if (this.tools.has(tool.name)) {
      throw new DOMException(
        `A tool named ${tool.name} is already registered`,
        'InvalidStateError',
      );
    }
    this.tools.set(tool.name, tool);
    signal?.addEventListener('abort', () => this.tools.delete(tool.name));
  }

  async getTools(): ReturnType<ModelContext['getTools']> {
    return Array.from(this.tools.values()).map(
      ({name, title = '', description, inputSchema, annotations}) => ({
        name, title, description, inputSchema, annotations,
        origin: location.origin,
        window,
      }),
    );
  }

  async executeTool({name}: {name: string}, input: Record<string, unknown> = {}): Promise<string> {
    const tool = this.tools.get(name)!;
    const output = await tool.execute(input, {signal: new AbortController().signal});

    return JSON.stringify(output);
  }
}

export function installWebMcpMock(): ModelContextMock {
  const mock = new ModelContextMock();
  Object.defineProperty(document, 'modelContext', {value: mock, configurable: true});

  return mock;
}

export function uninstallWebMcpMock() {
  const doc = document as {modelContext?: unknown};

  if (doc.modelContext instanceof ModelContextMock) {
    delete doc.modelContext;
  }
}
```

- `registerTool` は、同じ名前が登録済みなら `InvalidStateError` の `DOMException` を投げます。[第 2 回](02-wmcp-provide.md)の重複したツール名（#68899）で、ブラウザが投げるのと同じ名前のエラーです。
- 渡された `signal` が abort されたら Map から消します。[第 1 回](01-wmcp-declare.md)の取り消しは、この 1 行で観察できます。
- `executeTool` は文字列ではなく **オブジェクト**を受け、2 番目の引数に新しい `AbortSignal` を付けて `execute` を呼び、返り値を `JSON.stringify` します。
- `installWebMcpMock()` は `Object.defineProperty(document, 'modelContext', …)` で置き、`uninstallWebMcpMock()` は自分が置いたものだけを `delete` します。

forms の spec の側は、次のように変わりました（同じ PR の diff から抜き出したもの）。

📄 `packages/forms/signals/test/web/webmcp.spec.ts の diff（PR #71959）`

```
   describe('Signal Forms WebMCP Integration', () => {
+    let modelContext: ModelContextMock;
+
+    async function executeTool(toolName: string, args: Record<string, unknown>) {
+      const toolsForSubmit = await modelContext.getTools();
+      const testFormSubmitTool = toolsForSubmit.find((t) => t.name === toolName)!;
+      return modelContext.executeTool(testFormSubmitTool, args);
+    }
+
     beforeEach(() => {
       ...
-      initializeWebMCPPolyfill({installTestingShim: true});
+      modelContext = installWebMcpMock();
     });

     afterEach(() => {
-      cleanupWebMCPPolyfill();
+      uninstallWebMcpMock();
     });
 ...
-      const result = await executeTool(
-        'testFormSubmitTool',
-        JSON.stringify({
-          name: 'Alice',
-          age: 25,
-        }),
-      );
+      const result = await executeTool('testFormSubmitTool', {
+        name: 'Alice',
+        age: 25,
+      });
```

同じ PR で、core の `declare_tool.ts` から「polyfill の mock client に `AbortSignal` が無い」という TODO のコメントが 1 行消えています。[第 1 回](01-wmcp-declare.md)・[第 2 回](02-wmcp-provide.md)のページの上のデモと、[第 3 回](03-wmcp-forms.md)の記録のスクリプトが置いた作り物も、`registerTool` を受けて覚え、abort で消すという同じ形です。

## 3. target と手元で走らせた結果

core の 2 つは `packages/core/test/webmcp/BUILD.bazel` の `ng_web_test_suite(name = "webmcp")`、forms の 1 つは `packages/forms/signals/test/web/BUILD.bazel` の `zoneless_web_test_suite(name = "test")` で、どちらもブラウザで走ります。`tools/bazel/web_test.bzl` を読むと、前者は bootstrap に `//tools/testing:browser`、後者は `//tools/testing:browser_zoneless` を前に足すだけの違いです。名前の後ろに `_chromium`・`_firefox` を付けた target ができます。web の suite は 1 つの bundle を丸ごと走らせるので、`--test_arg=--filter` で絞れません（forms の WebMCP の 9 本だけを走らせることはできず、350 本が走る）。

📄 `走らせたコマンド（8576f161ae4、2026-11-16）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/webmcp:webmcp_chromium //packages/forms/signals/test/web:test_chromium \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/core/test/webmcp:webmcp_firefox //packages/forms/signals/test/web:test_firefox \
  --nocache_test_results --test_output=all
```

| target | 結果 |
| --- | --- |
| `//packages/core/test/webmcp:webmcp_chromium` | 13 passed, 0 failed（0.3 秒） |
| `//packages/core/test/webmcp:webmcp_firefox` | 13 passed, 0 failed |
| `//packages/forms/signals/test/web:test_chromium` | 350 passed, 0 failed（webmcp.spec.ts の 9 本を含む） |
| `//packages/forms/signals/test/web:test_firefox` | 346 passed, 0 failed, 4 skipped（skip は form\_field.spec.ts の 4 本） |
| `web:test_chromium（作業木に第 3 回の確かめの spec を 1 つ足す）` | 353 passed, 0 failed |

- core の 13 本は、1 節の表の core の行の数と同じです。`should infer correct types from schema` は中の関数を呼ばない型だけの検査ですが、it としては数に入ります。
- 最後の行は、[第 3 回](03-wmcp-forms.md)の「テストと直し方」で作業木に足した確かめの spec（3 本）です。作業木は終わってから消しました。

## 4. issue と PR の表

2026-11-16 に gh で取った、WebMCP の issue 4 件と PR 42 件です（取った issue 7 件のうち、Signal Forms の非同期の検証・送信のエラーと Renovate の Dependency Dashboard の 3 件は WebMCP と関係が無いので外した。PR は 45 件のうち関係の無い 6 件を外し、コミットから辿った 3 件 #69265・#69287・#69397 を足した）。「章」は、その issue や PR を読むときに開く章です。docs と依存の更新はシリーズの外にしました。

| 章 | issue | 開いている PR | マージ | 閉じた PR |
| --- | --- | --- | --- | --- |
| [第 1 回](01-wmcp-declare.md) | 2 | 0 | 12 | 0 |
| [第 2 回](02-wmcp-provide.md) | 1 | 0 | 3 | 2 |
| [第 3 回](03-wmcp-forms.md) | 1 | 1 | 10 | 2 |
| [この章](04-wmcp-tests-issues.md) | 0 | 0 | 1 | 0 |
| シリーズの外 | 0 | 0 | 9 | 8 |

2 つの章にまたがるものは両方に数えています。

| # | 種類・状態 | 開いた日 | 閉じた日 | 作者 | 中身 | 章 |
| --- | --- | --- | --- | --- | --- | --- |
| #68899 | issue・完了 | 2026-05-23 | 2026-06-30 | 9kubczas4 | ルートを離れて戻ると Duplicate tool name。Chrome 149 で再現しなくなり、コードを変えずに閉じた<br>withExperimentalAutoCleanupInjectors + provideExperimentalWebMcpTools race condition causes InvalidStateError | [第 2 回](02-wmcp-provide.md) |
| #68947 | issue・完了 | 2026-05-27 | 2026-06-01 | geromegrignon | 仕様が navigator から document に移った。#68961（683172b39a6）で閉じた<br>move WebCMP from navigator to document API | [第 1 回](01-wmcp-declare.md) |
| #69262 | issue・完了 | 2026-06-09 | 2026-06-10 | JeanMeche | required の input から作ったモデルで NG0950。9604ecfd8b5（#69265）で effect に遅らせた<br>\`experimentalWebMcpTool\` is responsible for invoking the model synchronously | [第 3 回](03-wmcp-forms.md) |
| #71268 | issue・完了 | 2026-10-09 | 2026-10-28 | beaufortfrancois | 公式の webmcp-types に移る。#71354（38afab7a244、angular-main）で閉じた<br>WebMCP: use official \`webmcp-types\` and make \`inputSchema\` optional | [第 1 回](01-wmcp-declare.md) |
| #71271 | PR・開いている | 2026-10-09 | ― | jhjh1214 | execute で省いたプロパティの値を残す（今の値に引数を重ねる）<br>fix(forms): keep values of properties omitted by WebMCP form tool calls | [第 3 回](03-wmcp-forms.md) |
| #68139 | PR・マージ | 2026-04-11 | 2026-05-06 | dgp1130 | vendor した型（5387e13b10d）・declareWebMcpTool・注入コンテキストで execute（77ec83782f2）・provideWebMcpTools（3b0ae5fef03）<br>Initial WebMCP Support | [第 1 回](01-wmcp-declare.md)・[第 2 回](02-wmcp-provide.md) |
| #68565 | PR・マージ | 2026-05-05 | 2026-05-15 | dgp1130 | 1963a0eb181<br>Add \`provideExperimentalWebMcpForms\` | [第 3 回](03-wmcp-forms.md) |
| #68647 | PR・マージ | 2026-05-09 | 2026-05-11 | dgp1130 | 38e26f07597<br>refactor(core): add "experimental" to WebMCP API names. | [第 1 回](01-wmcp-declare.md) |
| #68961 | PR・マージ | 2026-05-27 | 2026-06-01 | JeanMeche | 683172b39a6<br>refactor(core): Update webmcp support to use \`document.modelContext\` | [第 1 回](01-wmcp-declare.md) |
| #69068 | PR・マージ | 2026-06-01 | 2026-06-04 | dgp1130 | e50d47a4931（spec なし）<br>fix(core): disable WebMCP during SSR | [第 2 回](02-wmcp-provide.md) |
| #69069 | PR・マージ | 2026-06-01 | 2026-06-04 | dgp1130 | df77e42327c<br>fix(forms): set \`additionalProperties: false\` on generated WebMCP form | [第 3 回](03-wmcp-forms.md) |
| #69118 | PR・マージ | 2026-06-03 | 2026-06-09 | cexbrayat | c121407c0da（spec なし。型だけの変更）<br>fix(core): require WebMCP tool descriptions | [第 2 回](02-wmcp-provide.md)・[第 1 回](01-wmcp-declare.md) |
| #69265 | PR・マージ | 2026-06-09 | 2026-06-10 | JeanMeche | 9604ecfd8b5<br>fix(forms): delay mcp reading the form model by a \`tick\` | [第 3 回](03-wmcp-forms.md) |
| #69287 | PR・マージ | 2026-06-10 | 2026-06-10 | atscott | a7e7a2cf05c。#69118 で壊れた型を直す<br>refactor(forms): fix initWebMcpForm description to be required | [第 3 回](03-wmcp-forms.md) |
| #69397 | PR・マージ | 2026-06-17 | 2026-06-17 | arturovt | 8cf7731468f（spec なし）<br>fix(core): guard against DOM clobbering in declareExperimentalWebMcpTool | [第 1 回](01-wmcp-declare.md) |
| #69720 | PR・マージ | 2026-07-10 | 2026-07-10 | dgp1130 | f908140d718・ce4f7adc951<br>Update WebMCP tool registration to be asynchronous | [第 1 回](01-wmcp-declare.md)・[第 3 回](03-wmcp-forms.md) |
| #70258 | PR・マージ | 2026-08-18 | 2026-08-19 | dgp1130 | e041f9483e5<br>refactor(core): pass AbortSignal to WebMCP tools to handle cancellation | [第 1 回](01-wmcp-declare.md) |
| #70496 | PR・マージ | 2026-09-01 | 2026-09-01 | dgp1130 | 91a2bf84250（core）と 6e299da8cfc（forms）<br>WebMCP annotations | [第 1 回](01-wmcp-declare.md)・[第 3 回](03-wmcp-forms.md) |
| #70654 | PR・マージ | 2026-09-09 | 2026-09-10 | dgp1130 | 96dbae53bbf・8ca879e2d86（angular-main だけ）<br>Add WebMCP \`consequentialHint\` annotation | [第 1 回](01-wmcp-declare.md)・[第 3 回](03-wmcp-forms.md) |
| #71123 | PR・マージ | 2026-10-01 | 2026-10-20 | dgp1130 | fe9c0d77975・cdc2ea085e2（angular-main だけ）<br>WebMCP \`debugging\` annotation | [第 1 回](01-wmcp-declare.md)・[第 3 回](03-wmcp-forms.md) |
| #71354 | PR・マージ | 2026-10-14 | 2026-10-28 | hawkgs | 38afab7a244（angular-main だけ）。22.2.x へは #71719 で backport<br>refactor(core): use official webmcp-types | [第 1 回](01-wmcp-declare.md) |
| #71719 | PR・マージ | 2026-10-29 | 2026-11-04 | hawkgs | #71354 を 22.2.x へ<br>\[Backport 22.2.x\] refactor(core): use official webmcp-types | [第 1 回](01-wmcp-declare.md) |
| #71959 | PR・マージ | 2026-11-11 | 2026-11-11 | hawkgs | spec の作り物を polyfill から ModelContextMock へ（2 節）<br>Replace @mcp-b/webmcp-polyfilll with a local mock | [この章](04-wmcp-tests-issues.md) |
| #68756 | PR・マージ | 2026-05-16 | 2026-05-20 | dgp1130 | adev の ai/webmcp.md<br>docs: add WebMCP docs | ― |
| #70767 | PR・マージ | 2026-09-16 | 2026-09-17 | michael-small | docs の例<br>docs: log form value in WebMCP signal forms example | ― |
| #71241 | PR・マージ | 2026-10-07 | 2026-10-10 | Kulikowski | docs<br>docs: describe WebMCP as a proposed web standard | ― |
| #71445 | PR・マージ | 2026-10-20 | 2026-10-21 | MeAkib | 非同期の検証は走るが、既定では送信を止めない（4b8cd366d14）<br>docs: correct the async validator note in the WebMCP guide | [第 3 回](03-wmcp-forms.md) |
| #69038 | PR・マージ | 2026-06-01 | 2026-06-01 | angular-robot | 依存の更新<br>build: update dependency @mcp-b/webmcp-polyfill to v3 (main) | ― |
| #69039 | PR・マージ | 2026-06-01 | 2026-06-01 | angular-robot | 依存の更新<br>build: update dependency @mcp-b/webmcp-types to v3 (main) | ― |
| #69652 | PR・マージ | 2026-07-06 | 2026-07-06 | angular-robot | 依存の更新<br>build: update dependency @mcp-b/webmcp-polyfill to v4 (main) | ― |
| #69653 | PR・マージ | 2026-07-06 | 2026-07-07 | angular-robot | 依存の更新<br>build: update dependency @mcp-b/webmcp-types to v4 (main) | ― |
| #70400 | PR・マージ | 2026-08-26 | 2026-09-04 | JeanMeche | 98960556a6d。execute の引数の型に unknown\[\] が入った<br>build: update mcp-b webmcp dependencies to v5 | [第 3 回](03-wmcp-forms.md) |
| #70662 | PR・マージ | 2026-09-10 | 2026-09-10 | alan-agius4 | 593a5df61c3<br>build: make webmcp-types sources genrule cross-platform | ― |
| #71969 | PR・マージ | 2026-11-11 | 2026-11-11 | JeanMeche | compiler-cli のテスト用のワークスペース<br>refactor(compiler-cli): remove dependencies on deprecated webmcp packages | ― |
| #70159 | PR・閉じた | 2026-08-12 | 2026-08-13 | SnowingFox | CLA が署名されず、レビューに進まなかった<br>fix(core): preserve per-tool argument type inference in provideExperimentalWebMcpTools | [第 2 回](02-wmcp-provide.md) |
| #70213 | PR・閉じた | 2026-08-15 | 2026-08-17 | aminesbdev | ルートの一覧などをツールにする案。ルートの設定は人がふだん触れない情報で、エージェントにだけ見せると人とエージェントの見え方が分かれる、という返信<br>feat(router): introduce WebMCP router features | ― |
| #70250 | PR・閉じた | 2026-08-18 | 2026-08-18 | aminesbdev | Reactive Forms にはもう新しい機能を足さず、Signal Forms に集中する、という返信<br>feat(forms): introduce WebMCP tool support for Reactive Forms | ― |
| #70267 | PR・閉じた | 2026-08-19 | 2026-08-19 | aminesbdev | 同じことを Chrome DevTools for Agents の third party tools でもうしている（core/src/debug/ai）、という返信<br>feat(core): introduce WebMCP component inspector tool | ― |
| #70268 | PR・閉じた | 2026-08-19 | 2026-08-20 | aminesbdev | 人が観察した失敗の issue が無いので変えない、という返信<br>fix(forms): support generic form filling by listening to change events | ― |
| #70819 | PR・閉じた | 2026-09-19 | 2026-09-19 | aminesbdev | 開いて 1 分で閉じ、#70820 として出し直した<br>fix(forms): prevent WebMCP agents from writing non-editable form fields | [第 3 回](03-wmcp-forms.md) |
| #70820 | PR・閉じた | 2026-09-19 | 2026-10-03 | aminesbdev | hidden は特別扱いしない、塞ぐならスキーマから外す、という返信のあと作者が閉じた<br>fix(forms): prevent WebMCP agents from writing non-editable form fields | [第 3 回](03-wmcp-forms.md) |
| #71658 | PR・閉じた | 2026-10-27 | 2026-10-27 | aparzi | #71354（公式の型へ移る）があるので閉じた<br>fix(core): infer WebMCP tool argument types per tool | [第 2 回](02-wmcp-provide.md) |
| #70393 | PR・閉じた | 2026-08-26 | 2026-08-26 | angular-robot | Renovate が自動で閉じた（タイトルの autoclosed）<br>build: update dependency @mcp-b/webmcp-polyfill to v5 (main) - autoclosed | ― |
| #70394 | PR・閉じた | 2026-08-26 | 2026-08-26 | angular-robot | Renovate が自動で閉じた（タイトルの autoclosed）<br>build: update dependency @mcp-b/webmcp-types to v5 (main) - autoclosed | ― |
| #70399 | PR・閉じた | 2026-08-26 | 2026-08-26 | angular-robot | #70400 が引き継いだ（Takeover）<br>build: update mcp-b webmcp dependencies to v5 (main) | ― |
| #71346 | PR・閉じた | 2026-10-14 | 2026-11-11 | angular-robot | #71354・#71959 で @mcp-b の依存そのものが無くなった<br>build: update mcp-b webmcp dependencies to v6 (main) - autoclosed | ― |

## 5. 閉じた PR の傾向

- **PR 42 件のうち、マージ 29・マージされずに閉じた 12・開いている 1。**閉じた 12 件のうち 4 件は Renovate（angular-robot）の依存の更新で、人が出したものは 8 件です。
- **人が出して閉じた 8 件の理由は 3 つに分かれます。** 機能の提案（範囲の外）4 件（#70213・#70250・#70267・#70268）。書けないフィールドを守る 2 件（#70819・#70820）。型の推論 2 件（#70159・#71658）。
- **8 件のうち 6 件は同じ 1 人の作者が 2026-08-15〜09-19 に出したもの**で、7 件は開いてから 2 日以内に閉じています。いちばん長いのは #70820 の 14 日で、6e299da8cfc の作者の長い返信のあとに PR の作者が自分で閉じました（[第 3 回](03-wmcp-forms.md)の 6 節）。
- **機能の提案の 4 件は、どれも「範囲の外」の説明で返されています。**router のツール（人が見ない情報をエージェントにだけ見せない）、Reactive Forms（新しい機能は Signal Forms に集中する）、component inspector（Chrome DevTools for Agents の third party tools ですでにしている）、change イベント（人が観察した失敗の issue が無い）です。
- **型の推論の 2 件は、中身ではなく手続きで止まりました。**#70159 は CLA が署名されず、#71658 は公式の型へ移る #71354 があるので閉じられています。
- **マージされた 29 件のうち 11 件は WebMCP の作者（dgp1130）の PR**で、Renovate を除いた 25 件の、開いてからマージまでの中央値は 2 日です（いちばん長いのは最初の #68139 の 25 日）。
- **issue は 4 件だけで、どれも閉じています。**#68899 はコードを変えずに、Chrome 149 で再現しなくなったことを報告者と確かめて閉じました。

## 6. 新しい本家との違い

angular-main（74961c66242、2026-10-30）では、8576f161ae4 から先に WebMCP を触ったコミットが次のとおりあります（`git log 8576f161ae4..HEAD -i --grep=mcp` と、`webmcp` のディレクトリの log）。

| コミット | 中身 | 章 |
| --- | --- | --- |
| `96dbae53bbf`・`8ca879e2d86` | `consequentialHint` の annotation（#70654）。forms では `experimentalWebMcpTool.annotations` に `consequentialHint` だけを渡せるようになり、固定の値より前に広げる | [第 1 回](01-wmcp-declare.md)・[第 3 回](03-wmcp-forms.md) |
| `fe9c0d77975`・`cdc2ea085e2` | `debugging` の annotation（#71123）。forms は `debugging: false` を固定に足す | [第 1 回](01-wmcp-declare.md)・[第 3 回](03-wmcp-forms.md) |
| `38afab7a244` | vendor する型を `@mcp-b/webmcp-types` から公式の `webmcp-types` へ（#71354、#71268 を閉じた）。forms の `registration.ts` は `JsonSchemaForInference` をやめ、自分の `type JsonSchema = Record<string, unknown>` を使う | [第 1 回](01-wmcp-declare.md)・[第 3 回](03-wmcp-forms.md) |
| `593a5df61c3` | vendor した型の genrule を Windows でも動くように（#70662） | ― |
| `ecbc89b465c` | 全 package のテストの書き方の一斉の更新（175 ファイル）。WebMCP では core の `declare_tool_spec.ts` と forms の `webmcp.spec.ts`（`selector` を消す）を触った | この章 |
| `4b8cd366d14`・`a7330423357`・`d81bd0881e3` | adev の WebMCP のガイドの直し（非同期の検証の注記、提案中の標準という説明、例の log） | [第 3 回](03-wmcp-forms.md) |

angular-main より後に、#71959（2 節の mock）・#71969（compiler-cli のテスト用のワークスペースから非推奨の WebMCP の package を外す）・#71719（#71354 の 22.2.x への backport）がマージされています。開いている PR は #71271 の 1 件だけです（[第 3 回](03-wmcp-forms.md)）。

core の `declare_tool_spec.ts` の中身は、angular-main で大きく変わっています。8576f161ae4 にある `should pass tool annotations to registerTool`（68 行目）は、ecbc89b465c で消え、fe9c0d77975 で戻り、cdc2ea085e2 でまた消えました。ecbc89b465c は同時に、Firefox のための `originAgentCluster` の書き換えを消し、AbortSignal の it で「実行中のまま取り消す」形をやめています。2026-11-16 に gh で読んだ本家の main の同じファイルでも it は 9 本で、annotations の it はありません。

## このシリーズで見つけたもの

第 1〜3 回を書いている途中で、登録の失敗が受け取られないまま捨てられる場所が 2 つと、守りの行を固める spec が無いことなどが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現は、書いたときのサイトの依存の @angular/core 22.1.6 で動かしたページの上のデモ（今のサイトの 22.2.6 でも同じに出ます）と、Node の上の 22.2.6 の記録、作業木に足した spec です。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| provideExperimentalWebMcpTools で登録が失敗しても（同じ名前のツールなど）、注入器はふつうに作られ、失敗は受け取る人のいない reject になる。2 つ目のツールは登録されない | core の webmcp/provide\_tools.ts 34 行目（`declareExperimentalWebMcpTool` の Promise を捨てる。f908140d718 で登録が非同期になってから） | 同じ名前のツールを持つ注入器を 2 つ作る、作業木の spec | [第 2 回](02-wmcp-provide.md) |
| form() の `experimentalWebMcpTool` で、モデルからスキーマを作れなかったとき（null を含むモデルなど）のエラーが、ErrorHandler に届かず、受け取る人のいない reject になる | forms の signals/src/api/structure.ts 231〜236 行目（`registerWebMcpForm` の Promise を捨てる）、webmcp/registration.ts 32 行目と 47 行目 | Node の 22.2.6 の記録（unhandledRejection）と、作業木の spec（Chromium）。既存の spec はトークンを直接呼ぶのでこの道を通らない | [第 3 回](03-wmcp-forms.md) |
| 登録の途中で注入器を壊したときの AbortError を飲み込む枝、SSR で止める行、`registerTool` が関数かを確かめる行を消しても、core の 13 の spec が全部通る | core の webmcp/declare\_tool.ts 36 行目・46 行目・84〜89 行目（98960556a6d・e50d47a4931・8cf7731468f） | 作業木で行を消して `webmcp_chromium` を走らせる。「登録の途中で destroy」の it を足すと、枝を消したときだけ落ちる | [第 1 回](01-wmcp-declare.md) |
| フォームのツールの execute は、エージェントの引数でモデル全体を置き換えるので、引数で省いたプロパティがモデルから消える。submission の無いフォームでは、NG01915 で reject される前にモデルがもう書き換わっている | forms の signals/src/webmcp/registration.ts 69 行目（`node.value.set(args)`）と 72 行目（`submit`） | Node の 22.2.6 の記録。省いたプロパティの件は開いている PR #71271 と同じ指摘 | [第 3 回](03-wmcp-forms.md) |
| 配列のフィールドのスキーマは先頭の要素だけから作られ、空の配列ではスキーマを作れない | forms の signals/src/webmcp/registration.ts 104〜112 行目 | Node の 22.2.6 の記録 | [第 3 回](03-wmcp-forms.md) |
| angular-main では、core の annotations を `registerTool` に渡すことを確かめる it が無くなっている | core の test/webmcp/declare\_tool\_spec.ts（ecbc89b465c のテストの一斉の更新で古い形に戻り、fe9c0d77975 で一度戻ってから cdc2ea085e2 でまた消えた） | angular-main の履歴と、2026-11-16 の本家の main のファイル | [第 4 回](04-wmcp-tests-issues.md) |

ほかに、ツールごとの引数の型推論が効かない #70125 が 22.1.6・8576f161ae4・22.2.6 のどれでも再現すること（閉じた PR #70159・#71658 の経緯）を[第 2 回](02-wmcp-provide.md)に、readonly・disabled・hidden のフィールドもスキーマに載り書き換えられること（閉じた PR #70819・#70820 の指摘）を[第 3 回](03-wmcp-forms.md)に書きました。

## 聞かれそうな質問

**Q. WebMCP の振る舞いを変えたとき、どの target を走らせますか？**

core の `declareExperimentalWebMcpTool` と `provideExperimentalWebMcpTools` なら `//packages/core/test/webmcp:webmcp_chromium`（13 本、0.3 秒）、forms なら `//packages/forms/signals/test/web:test_chromium`（350 本）です。forms の 9 本だけに絞ることはできません。core を変えると forms の WebMCP も `declareExperimentalWebMcpTool` を呼ぶので、両方を走らせます。

**Q. spec はどうやってブラウザの modelContext の代わりを置いていますか？**

8576f161ae4 では `@mcp-b/webmcp-polyfill` の `initializeWebMCPPolyfill({installTestingShim: true})` を beforeEach で呼び、afterEach で `cleanupWebMCPPolyfill()` します（`webmcp.spec.ts` 23・27 行目）。#71959 からは、`@angular/private/testing` の `installWebMcpMock()` が `document.modelContext` に `ModelContextMock` を置き、`executeTool` は JSON の文字列ではなくオブジェクトを受けます。

**Q. テストが無いまま入った WebMCP の変更はありますか？**

SSR で無効にする e50d47a4931 と、DOM clobbering に備える 8cf7731468f と、説明を必須にする c121407c0da の 3 つは、spec のファイルを触っていません（1 節）。また angular-main では、core の annotations を `registerTool` に渡す it が無くなっています（6 節）。

**Q. マージされずに閉じた PR は、どんな理由が多いですか？**

人が出した 8 件のうち 4 件が機能の提案で、どれも「範囲の外」の説明で返されています（router・Reactive Forms・component inspector・change イベント）。残りは書けないフィールドを守る 2 件と、型の推論の 2 件（CLA と、公式の型への移行）です。7 件は 2 日以内に閉じています（5 節）。

## 読み終えて

- WebMCP の約束は 3 つの spec のファイル（core 13 本、forms 9 本）が固めていて、どちらもブラウザの suite で、`webmcp_chromium` と `test_chromium` で走ります。
- spec は作り物の `modelContext` を置いて、`registerTool` の spy と `getTools`・`executeTool` で確かめます。作り物は 2026-11-11 の #71959 で polyfill からローカルの `ModelContextMock` に変わりました。
- WebMCP の PR は 42 件のうち 29 件がマージされ、人が出して閉じた 8 件の半分は「範囲の外」の機能の提案でした。
- angular-main では annotations が 2 つ増え（`consequentialHint`・`debugging`）、型は公式の `webmcp-types` に移りました。

---

← 前: [Signal Forms のフォームをツールにする：スキーマから JSON Schema へ](03-wmcp-forms.md)  
次: [LocationUpgradeModule：$location を差し替える provider の組み立て](../lshim/01-lshim-module.md) →
