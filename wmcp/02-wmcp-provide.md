[目次](../README.md) › [WebMCP の内側：Angular のアプリが AI のエージェントにツールを渡す](README.md) › 第 2 回 / 全 4 回

# provideExperimentalWebMcpTools とアプリの寿命：いつ登録され、いつ消えるか

> provide\_tools.ts が環境の初期化でツールを順に declare する行（3b0ae5fef03）と、注入器を作る関数が戻る前に registerTool まで進む順番、SSR で無効にする修正（e50d47a4931）、説明を必須にした変更（c121407c0da）、注入器の destroy での取り消しとルートの自動の後片付け、ブラウザの側で解決した重複したツール名の issue（#68899）と、いまは Promise を捨てるので重複が処理されない reject になること、ツールごとの型推論を提案して閉じた PR（#70159・#71658、#70125 は開いたまま）。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/wmcp-provide)

---

[第 1 回](01-wmcp-declare.md)で、`declareExperimentalWebMcpTool` が 1 つのツールを注入器の寿命に結び付けるところまで読みました。この章では、それを providers の配列に書けるようにした `provideExperimentalWebMcpTools` が、**どの注入器が作られたときに登録し、どの注入器が壊れたときに取り消すか**を追います。SSR で無効にした修正（e50d47a4931）、説明を必須にした変更（c121407c0da）、ルートの注入器の自動の後片付けと重複した名前の issue（#68899）、閉じた PR（#70159・#71658）が変えようとした型も読みます。

読む対象は `packages/core/src/webmcp/provide_tools.ts`・`index.ts`、golden、spec は `packages/core/test/webmcp/provide_tools_spec.ts` です。`provideEnvironmentInitializer` と `createEnvironmentInjector` の中身は [ngmodule-import-providers-from](../ngmodule/14-ngmodule-import-providers-from.md)、環境の初期化の関数を呼ぶ `resolveInjectorInitializers` は [boot-app-initializer](../boot/09-boot-app-initializer.md)、ルートの注入器を壊す `routeInjectorCleanup` は [router-activate-routes](../router/15-router-activate-routes.md) の 9 節で読みました。

1. [1. declareExperimentalWebMcpTool](01-wmcp-declare.md)
2. **2. provide とアプリの寿命**（この章）
3. [3. Signal Forms のフォームをツールにする](03-wmcp-forms.md)
4. [4. spec と issue](04-wmcp-tests-issues.md)

## 1. provide\_tools.ts：環境の初期化で declare を呼ぶだけ

📄 `angular/packages/core/src/webmcp/provide_tools.ts` L15–37 （▶ の行: 18–19, 21–22, 29–30, 32–34）

```ts
15 │ /**
16 │  * Provides a list of WebMCP tools tied to the lifecycle of the associated `Injector`.
17 │  *
18 ▶  * The tools are automatically registered when the environment is initialized
19 ▶  * and unregistered when the associated injector is destroyed.
20 │  *
21 ▶  * The `tools[number].execute` function is invoked in the injection context of the
22 ▶  * associated `Injector`.
23 │  *
24 │  * @param tools The tools to register and execute when invoked by an AI agent.
25 │  * @returns An {@link EnvironmentProviders} that can be used in `bootstrapApplication`
26 │  *     or route providers.
27 │  * @experimental
28 │  */
29 ▶ export function provideExperimentalWebMcpTools<const InputSchema extends JsonSchemaForInference>(
30 ▶   tools: ToolDescriptor<InputSchema>[],
31 │ ): EnvironmentProviders {
32 ▶   return makeEnvironmentProviders([
33 ▶     provideEnvironmentInitializer(() => {
34 ▶       for (const tool of tools) declareExperimentalWebMcpTool(tool);
35 │     }),
36 │   ]);
37 │ }
```

本体は 32〜36 行目の 5 行です。33 行目の `provideEnvironmentInitializer` で「環境の注入器が作られたときに呼ぶ関数」を登録し、その関数が 34 行目で配列のツールを 1 つずつ `declareExperimentalWebMcpTool(tool)` に渡します。34 行目は `injector` を渡していません。環境の初期化の関数は、その注入器自身を「今の注入器」にして呼ばれる（r3\_injector.ts の 428 行目で `setCurrentInjector(this)`、446〜448 行目で 1 つずつ呼ぶ。boot-app-initializer で引用）ので、declare\_tool.ts の 54 行目の `inject(Injector)` がその環境の注入器を返し、55 行目の `DestroyRef` も同じ注入器になります（環境の注入器の `DestroyRef` が注入器そのものであることは [di-destroy](../di/14-di-destroy.md)）。18〜19 行目のコメントのとおり、**その注入器が作られたときに登録し、壊れたときに取り消す**、が約束のすべてです。

34 行目は、`declareExperimentalWebMcpTool` が返す `Promise` を受け取っていません。初期化の関数の型は `() => void` で、待つ仕組みがないからです。これが 5 節の重複した名前の話につながります。

📄 `angular/packages/core/src/webmcp/index.ts` L1–15 （▶ の行: 9–10, 12–14）

```ts
 1 │ /**
 2 │  * @license
 3 │  * Copyright Google LLC All Rights Reserved.
 4 │  *
 5 │  * Use of this source code is governed by an MIT-style license that can be
 6 │  * found in the LICENSE file at https://angular.dev/license
 7 │  */
 8 │ 
 9 ▶ export {declareExperimentalWebMcpTool} from './declare_tool';
10 ▶ export {provideExperimentalWebMcpTools} from './provide_tools';
11 │ export type {
12 ▶   Client as WebMcpClient,
13 ▶   ToolDescriptor as WebMcpToolDescriptor,
14 ▶   Execute as WebMcpToolExecute,
15 │ } from './types';
```

📄 `angular/goldens/public-api/core/index.api.md` L1513–1520 （▶ の行: 1515, 1518）

```md
1513 │ 
1514 │ // @public
1515 ▶ export function provideEnvironmentInitializer(initializerFn: () => void): EnvironmentProviders;
1516 │ 
1517 │ // @public
1518 ▶ export function provideExperimentalWebMcpTools<const InputSchema extends JsonSchemaForInference>(tools: WebMcpToolDescriptor<InputSchema>[]): EnvironmentProviders;
1519 │ 
1520 │ // @public
```

index.ts の 12〜14 行目で、types.ts の名前に `WebMcp` を付けて公開します。golden の 1518 行目が `provideExperimentalWebMcpTools` の公開の形で、1515 行目の `provideEnvironmentInitializer` と同じく `EnvironmentProviders` を返します。`EnvironmentProviders` なので、コンポーネントの `providers` には書けません。書けるのは `bootstrapApplication` の providers、ルートの `providers`、`createEnvironmentInjector` の第 1 引数です。

📄 `git show 3b0ae5fef03（2026-05-01、最初の provideWebMcpTools）`

````
$ git show 3b0ae5fef03 -- packages/core/src/webmcp/provide_tools.ts
3b0ae5fef03 2026-05-01 Douglas Parker
feat(core): add `provideWebMcpTools`

This is an ergonomic wrapper around `declareWebMcpTool`, allowing a user to define multiple tools directly on an injector's providers, rather than needing to find an injection context.

Example:

```typescript
import {bootstrapApplication, provideWebMcpTools} from '@angular/core';

await bootstrapApplication(RootComp, {
  providers: [
    provideWebMcpTools([
      {
        name: 'hello',
        description: 'Says hello',
        inputSchema: {type: 'object', properties: {}},
        execute: async () => ({content: [{type: 'text', text: 'Hello, World!'}]});
      },
    ]),
  ],
});
```

The `execute` function is invoked in the injection context of the `Injector` it is provided to, meaning you can easily `inject` dependencies and invoke them.

This also works particularly well with route `providers` and `withExperimentalAutoCleanupInjectors`, registering the tools when the router is navigated to and then automatically unregistering them when navigating away. Note that `withExperimentalAutoCleanupInjectors` is required for unregistration to work.

```typescript
import {provideWebMcpTools} from '@angular/core';
import {provideRouter} from '@angular/router';

provideRouter(
  [
    {
      path: '',
      component: Home,
      providers: [
        provideWebMcpTools([
          {
            name: 'hello',
            description: 'Says hello',
            inputSchema: {type: 'object', properties: {}},
            execute: async () => ({content: [{type: 'text', text: 'Hello, World!'}]}),
          },
        ]),
      ],
    },
  ],
  withExperimentalAutoCleanupInjectors(),
);
```

diff --git a/packages/core/src/webmcp/provide_tools.ts b/packages/core/src/webmcp/provide_tools.ts
new file mode 100644
index 00000000000..32942beb8de
--- /dev/null
+++ b/packages/core/src/webmcp/provide_tools.ts
@@ -0,0 +1,36 @@
+/**
+ * @license
+ * Copyright Google LLC All Rights Reserved.
+ *
+ * Use of this source code is governed by an MIT-style license that can be
+ * found in the LICENSE file at https://angular.dev/license
+ */
+
+import type {JsonSchemaForInference} from '../../third_party/@mcp-b/webmcp-types';
+import {EnvironmentProviders, makeEnvironmentProviders, provideEnvironmentInitializer} from '../di';
+import {declareWebMcpTool} from './declare_tool';
+import type {ToolDescriptor} from './types';
+
+/**
+ * Provides a list of WebMCP tools tied to the lifecycle of the associated `Injector`.
+ *
+ * The tools are automatically registered when the environment is initialized
+ * and unregistered when the associated injector is destroyed.
+ *
+ * The `tools[number].execute` function is invoked in the injection context of the
+ * associated `Injector`.
+ *
+ * @param tools The tools to register and execute when invoked by an AI agent.
+ * @returns An {@link EnvironmentProviders} that can be used in `bootstrapApplication`
+ *     or route providers.
+ * @experimental
+ */
+export function provideWebMcpTools<const InputSchema extends JsonSchemaForInference>(
+  tools: ToolDescriptor<InputSchema>[],
+): EnvironmentProviders {
+  return makeEnvironmentProviders([
+    provideEnvironmentInitializer(() => {
+      for (const tool of tools) declareWebMcpTool(tool);
+    }),
+  ]);
+}
````

3b0ae5fef03 の本文は、ルートの `providers` と `withExperimentalAutoCleanupInjectors`（7137a412230 で `withAutoCleanupInjectors` に安定化）を組み合わせると、そのルートに来たときに登録し、離れたときに取り消せる、と書いています。そして「取り消しが働くには `withExperimentalAutoCleanupInjectors` が必要」とも書いています。ルートの注入器は、自動の後片付けが無ければ一度作られたら壊されない（[router-route-config](../router/04-router-route-config.md) で読んだ `_injector` を持ち続ける）ので、ツールも残り続けます。

## 2. いつ登録され、いつ消えるか

1. **注入器が作られる**

   `bootstrapApplication` ならアプリの環境の注入器、ルートの `providers` ならそのルートに初めて当てはまったとき（ルートの認識の途中）に作られるルートの注入器、`createEnvironmentInjector` ならその呼び出しの中です。どれも作り終える前に `resolveInjectorInitializers` が走ります。
2. **初期化の関数が declare を順に呼ぶ（provide\_tools.ts 34 行目）**

   `declareExperimentalWebMcpTool` は、最初の `await`（declare\_tool.ts 82 行目）まで同期で進むので、**注入器を作る関数が戻る前に、配列の順に `registerTool` が呼ばれています**。`registerTool` の Promise が resolve するのはその後のマイクロタスクで、誰も待っていません。
3. **注入器が壊れる**

   アプリの `destroy()`、`withAutoCleanupInjectors` の `NavigationEnd` での後片付け（router.ts 212 行目から `routeInjectorCleanup`）、自分で作った注入器の `destroy()` のどれかです。注入器は `onDestroy` に登録された順にコールバックを呼ぶ（r3\_injector.ts の 285〜287 行目、di-destroy で引用）ので、declare\_tool.ts の 79 行目の `abortCtrl.abort()` も、配列の順に呼ばれて 1 つずつ取り消されます。

> [!NOTE]
> **ポイント**
>
> ルートを `/products` → `/other` → `/products` と移るとき、`/products` の注入器が壊れるのは 1 回目の移動の `NavigationEnd` です。2 回目の移動で新しい注入器が作られるのはその後なので、**Angular の側の順番では、同じ名前のツールが同時に 2 つ登録されることはありません**。DEMO の「作って壊すを 3 回」がこの順番です。

## 3. SSR で無効にする：e50d47a4931

📄 `git show e50d47a4931（2026-06-01、PR #69068）`

```
$ git show e50d47a4931 -- packages/core/src/webmcp/declare_tool.ts
e50d47a4931 2026-06-01 Doug Parker
fix(core): disable WebMCP during SSR

In certain scenarios like `provideExperimentalWebMcpTools` in `app.config.ts`, a WebMCP tool may be declared before SSR has a chance to polyfill Domino and trigger an error due to an `undefined` `document` value. This aborts from the process before WebMCP has a chance to crash.

diff --git a/packages/core/src/webmcp/declare_tool.ts b/packages/core/src/webmcp/declare_tool.ts
index 62d43aea844..d5dc8f90cc1 100644
--- a/packages/core/src/webmcp/declare_tool.ts
+++ b/packages/core/src/webmcp/declare_tool.ts
@@ -33,6 +33,9 @@ export function declareExperimentalWebMcpTool<const InputSchema extends JsonSche
   tool: ToolDescriptor<InputSchema>,
   injector?: Injector,
 ): void {
+  // SSR may not have a document yet, so we abort before checking it.
+  if (typeof ngServerMode !== 'undefined' && ngServerMode) return;
+
   // modelContext was moved from `navigator` to `document` in the spec, but we check both for compatibility with different environments.
   const modelContext =
     (globalThis.document as {modelContext?: ModelContext}).modelContext ??
```

足されたのは、[第 1 回](01-wmcp-declare.md)の 3-1 節の引用の 36 行目、`if (typeof ngServerMode !== 'undefined' && ngServerMode) return;` の 1 行です。`ngServerMode` はサーバーで動くときに `true` になる大域の値です（[ssr-platform-server](../platform/03-ssr-platform-server.md) の 2 節）。

本文のとおり、`app.config.ts` に `provideExperimentalWebMcpTools` を書くと、サーバーでは Domino（サーバーで DOM の代わりをするライブラリ）が `document` を用意する前にツールが宣言されることがあり、`globalThis.document` が `undefined` のまま 40 行目の `.modelContext` を読んで落ちていました。36 行目は 39〜41 行目より前にあるので、`document` に触る前に戻ります。判定が `declareExperimentalWebMcpTool` の中にあるので、provide を通しても、[第 3 回](03-wmcp-forms.md)のフォームの登録を通しても、すべてここで止まります。

> [!WARNING]
> **ハマりどころ**
>
> SSR で止めたあと、クライアントでのハイドレーションでは、アプリの環境の注入器がもう一度ブラウザで作られるので、そこで登録されます。サーバーで登録しないことと、ブラウザで登録することは別々に起きます。この 36 行目を確かめる spec はありません（[第 1 回](01-wmcp-declare.md)の「テストと直し方」で、消しても 13 個が通ることを確かめました）。

## 4. 説明を必須に：c121407c0da

📄 `git show c121407c0da（2026-06-03、PR #69118。types.ts の部分）`

```
$ git show c121407c0da -- packages/core/src/webmcp/types.ts
c121407c0da 2026-06-03 cexbrayat
fix(core): require WebMCP tool descriptions

The WebMCP ModelContextTool dictionary marks description as required: https://webmachinelearning.github.io/webmcp/#modelcontexttool-dictionary

diff --git a/packages/core/src/webmcp/types.ts b/packages/core/src/webmcp/types.ts
index 03c15496bfe..b587f805229 100644
--- a/packages/core/src/webmcp/types.ts
+++ b/packages/core/src/webmcp/types.ts
@@ -66,7 +66,7 @@ export interface ToolDescriptor<InputSchema extends JsonSchemaForInference> {
   name: string;
 
   /** A description of what the tool does and how the agent should consider using it. */
-  description?: string;
+  description: string;
 
   /**
    * A schema which describes the input arguments expected by the {@link execute} function
```

`description?: string` を `description: string` にした 1 文字の変更です。本文のとおり、WebMCP の仕様の `ModelContextTool` の辞書で `description` が必須だからです。同じコミットで、フォームの登録の options の型（`packages/forms/signals/src/webmcp/tokens.ts`）も必須にしています（[第 3 回](03-wmcp-forms.md)）。型だけの変更で、実行時には何も確かめません。golden の 2158 行目（[第 1 回](01-wmcp-declare.md)の 2 節の引用）が `description: string` になったのもこのコミットです。

## 5. #68899：自動の後片付けと「Duplicate tool name」

#68899（2026-05-23、22.0.0-rc.1）は、ルートの `providers` に `provideExperimentalWebMcpTools` を書き、`withExperimentalAutoCleanupInjectors()` を付けたアプリで、ルートを離れて戻るのを何度か繰り返すと `InvalidStateError: Failed to execute 'registerTool' on 'ModelContext': Duplicate tool name` になる、という報告です。報告の例外の積み重ねは `matchSegmentAgainstRoute` → `resolveInjectorInitializers` → `declareExperimentalWebMcpTool` で、2 節の「ルートの認識の途中で注入器を作り、初期化の関数で登録する」流れそのものです。

| 日付 | 出来事 |
| --- | --- |
| 2026-05-23 | 報告。Chrome 148 で再現、「何度か繰り返すと」出る |
| 2026-05-25 | メンテナーが「再現はするが不安定。取り消しの処理が黙って失敗し、ツールが 4 個ではなく 5 個ある。Chrome の不具合ではないか」とコメント |
| 2026-05-27 | 683172b39a6（`document.modelContext` へ移り、`unregisterTool` の呼び出しをやめ、取り消しは `abort()` だけに） |
| 2026-06-20 | メンテナーが「Chrome 149.0.7827.103 では再現しない」 |
| 2026-06-30 | 報告者が「新しい Chrome では問題ない」と確かめて閉じた |

閉じた理由はブラウザの側で、**#68899 のための Angular のコミットはありません**。2 節の注意のとおり、Angular の側は「古い注入器の destroy（`abort()`）→ 新しい注入器の登録」の順で動いていて、取り消しが効いていれば重なりません。メンテナーが見た「5 個」は、`abort()` の後もブラウザの表から消えていなかった、ということです。

いまのコードで変わったのは、**同じ名前がもし重なったときの失敗の伝わり方**です。報告の時点の declare は同期の関数で、`registerTool` の例外は初期化の関数から、注入器を作る呼び出し（ルートの認識）まで投げられていました。f908140d718 で declare が `async` になり、`registerTool` の失敗は Promise の reject になりました。provide\_tools.ts の 34 行目はその Promise を捨てるので、**失敗は誰にも処理されない reject（`unhandledrejection`）になり、注入器は普通に作られます**。`provideBrowserGlobalErrorListeners` を入れたアプリでは、それが `ErrorHandler` に届きます（[err-global-listeners](../err/03-err-global-listeners.md)）。

📄 `angular/packages/core/test/webmcp/declare_tool_spec.ts` L98–122 （▶ の行: 101, 111–112, 119, 121）

```ts
 98 │   it('should throw if the tool is already registered', async () => {
 99 │     const injector = Injector.create({providers: []});
100 │ 
101 ▶     await declareExperimentalWebMcpTool(
102 │       {
103 │         name: 'testTool',
104 │         description: 'A test tool',
105 │         inputSchema: {type: 'object', properties: {}},
106 │         execute: async () => ({content: []}),
107 │       },
108 │       injector,
109 │     );
110 │ 
111 ▶     await expectAsync(
112 ▶       declareExperimentalWebMcpTool(
113 │         {
114 │           name: 'testTool',
115 │           description: 'Another test tool',
116 │           inputSchema: {type: 'object', properties: {}},
117 │           execute: async () => ({content: []}),
118 │         },
119 ▶         injector,
120 │       ),
121 ▶     ).toBeRejectedWithError(/already registered/);
122 │   });
```

declare を直接呼んだ場合は、98 行目の it のとおり、2 回目の Promise が 121 行目の `already registered`（polyfill の文）で reject されます。provide を通した場合を確かめる it はありません。作業木で次の it を足して確かめました（Zone.js を読む spec の環境なので、処理されない reject は Zone.js が受け取ってログに出し、window の `unhandledrejection` には届きませんでした。それで最後の `expect` だけが落ちています）。

📄 `作業木で provide_tools_spec.ts に足した it（作業木はもう消した）`

```
diff --git a/packages/core/test/webmcp/provide_tools_spec.ts b/packages/core/test/webmcp/provide_tools_spec.ts
index b979c1d233c..1a0b7602c0d 100644
--- a/packages/core/test/webmcp/provide_tools_spec.ts
+++ b/packages/core/test/webmcp/provide_tools_spec.ts
@@ -84,6 +84,36 @@ describe('provideExperimentalWebMcpTools', () => {
     expect(await getModelContext()!.getTools()).toEqual([]);
   });
 
+  it('wmcp-a: two live injectors with the same tool name', async () => {
+    const tools = [
+      {
+        name: 'dupTool',
+        description: 'A duplicated tool',
+        inputSchema: {type: 'object' as const, properties: {}},
+        execute: async () => ({content: []}),
+      },
+    ];
+    const reasons: unknown[] = [];
+    const onRejection = (e: PromiseRejectionEvent) => {
+      reasons.push(e.reason);
+      e.preventDefault();
+    };
+    window.addEventListener('unhandledrejection', onRejection, {capture: true});
+    const parent = TestBed.inject(EnvironmentInjector);
+    const first = createEnvironmentInjector([provideExperimentalWebMcpTools(tools)], parent);
+    const second = createEnvironmentInjector([provideExperimentalWebMcpTools(tools)], parent);
+    await new Promise((resolve) => setTimeout(resolve, 50));
+    window.removeEventListener('unhandledrejection', onRejection, {capture: true});
+
+    console.log('wmcp-a reasons:', reasons.map((r) => String(r)).join(' | '));
+    console.log('wmcp-a tools:', (await getModelContext()!.getTools()).map((t: any) => t.name).join(','));
+    second.destroy();
+    console.log('wmcp-a after second.destroy:', (await getModelContext()!.getTools()).map((t: any) => t.name).join(','));
+    first.destroy();
+    console.log('wmcp-a after first.destroy:', (await getModelContext()!.getTools()).length);
+    expect(reasons.length).toBe(1);
+  });
+
   it('should work with route providers', async () => {
     @Component({
       selector: 'test-comp',
```

📄 `結果（抜き出し）`

```
Chromium: |██████████████████████████████| 0/1 test files | 0 passed, 0 failed
      InvalidStateError: Tool already registered: dupTool
      wmcp-a reasons: 
      wmcp-a tools: dupTool
      wmcp-a after second.destroy: dupTool
      wmcp-a after first.destroy: 0
 ❌ provideExperimentalWebMcpTools > wmcp-a: two live injectors with the same tool name
      wmcp-a: two live injectors with the same tool name: 
      Expected 0 to be 1.
Chromium: |██████████████████████████████| 1/1 test files | 13 passed, 1 failed
```

1 つ目の注入器のツールだけが残り、2 つ目の注入器のツールは登録されないまま、2 つ目を壊しても 1 つ目のツールは消えません（polyfill は reject したツールに abort のリスナーを付けない）。1 つ目を壊すと 0 個になります。DEMO の「壊さずにもう 1 つ作る」が同じ場面です。

> [!NOTE]
> **ポイント**
>
> #69262 は core ではなく forms の issue（必須の input から作ったモデルを、フォームの登録のときにすぐ読んで NG0950 になる。9604ecfd8b5 で直った）で、[第 3 回](03-wmcp-forms.md)で読みます。core の側から言えるのは、f908140d718 で declare を `async` にしても 82 行目までは同期で走るので、それだけでは何も遅れない、という 1 点です。

## 6. 閉じた PR #70159・#71658：ツールごとの型推論

1 節の 29〜30 行目は、型引数 `InputSchema` が配列全体で 1 つです。型の違う 2 つのツールを 1 回の呼び出しに渡すと、TypeScript は 2 つの `inputSchema` を 1 つの型にまとめようとし、`execute` の引数の型が崩れます。これが開いたままの #70125（2026-08-07、22.1.1 で報告）です。[第 1 回](01-wmcp-declare.md)の 2 節の記録（30・36 行目の `'args.arg1' is of type 'unknown'`）が手元で 3 つの版とも再現した結果で、22.1.6・8576f161ae4・22.2.6 のどれでも同じです。

📄 `gh pr diff 71658（2026-10-27。#70159 も同じ形）`

```
$ gh pr diff 71658（閉じた PR。provide_tools.ts の部分）
diff --git a/packages/core/src/webmcp/provide_tools.ts b/packages/core/src/webmcp/provide_tools.ts
index 0047f8a9a99..bc4f7e3fa0a 100644
--- a/packages/core/src/webmcp/provide_tools.ts
+++ b/packages/core/src/webmcp/provide_tools.ts
@@ -26,8 +26,14 @@ import type {ToolDescriptor} from './types';
  *     or route providers.
  * @experimental
  */
-export function provideExperimentalWebMcpTools<const InputSchema extends JsonSchemaForInference>(
-  tools: ToolDescriptor<InputSchema>[],
+export function provideExperimentalWebMcpTools<
+  const InputSchemas extends readonly JsonSchemaForInference[],
+>(
+  // A tuple-mapped type is used instead of `ToolDescriptor<InputSchema>[]` so that each tool
+  // infers its own `InputSchema` from its own `inputSchema` property. With a single shared
+  // generic, TypeScript unifies the schemas of heterogeneous tools and the `execute` callbacks
+  // lose their argument types (see #70125).
+  tools: {[K in keyof InputSchemas]: ToolDescriptor<InputSchemas[K]>},
 ): EnvironmentProviders {
   return makeEnvironmentProviders([
     provideEnvironmentInitializer(() => {
```

2 つの PR はどちらも、型引数を「スキーマのタプル」（`const InputSchemas extends readonly JsonSchemaForInference[]`）にし、引数を写像の型 `{[K in keyof InputSchemas]: ToolDescriptor<InputSchemas[K]>}` にして、配列の 1 つずつが自分の `inputSchema` から型を推論するようにしました。実行時のコードは変わらず、どちらも `packages/core/test/strict_types` にコンパイルが通ることを確かめる spec を足しています。

| PR | 閉じた日 | 閉じたときのコメント |
| --- | --- | --- |
| #70159 | 2026-08-13 | CLA（Google への貢献の同意書）が署名されなかったので進められない |
| #71658 | 2026-10-27 | 「#71354 のため」。#71354 は 38afab7a244（公式の `webmcp-types` へ移る）の PR で、型引数の制約が `JsonSchemaForInference` から `object` に変わった |

同じタプルの形を、公式の型になった 22.2.6 の `WebMcpToolDescriptor` で手元で試した記録です。

📄 `<scratchpad>/wmcp-demo/a/types/infer-tuple.ts`

```ts
// #70159 / #71658 の形（タプルに写した型）を 22.2.6 の WebMcpToolDescriptor で試す
import type {EnvironmentProviders, WebMcpToolDescriptor} from '@angular/core';

declare function provideToolsPerTool<const InputSchemas extends readonly object[]>(
  tools: {[K in keyof InputSchemas]: WebMcpToolDescriptor<InputSchemas[K]>},
): EnvironmentProviders;

provideToolsPerTool([
  {
    name: 'tool1',
    description: 'Tool #1',
    inputSchema: {type: 'object', properties: {arg1: {type: 'number'}}, required: ['arg1']},
    execute: (args) => args.arg1.toFixed(),
  },
  {
    name: 'tool2',
    description: 'Tool #2',
    inputSchema: {type: 'object', properties: {arg2: {type: 'string'}}, required: ['arg2']},
    execute: (args) => args.arg2.trim(),
  },
]);
```

📄 `tsc 6.0.3 の出力（いまの形 3 つと、タプルの形）`

```
## 22.1.6
infer.ts(17,13): error TS2322: Type '{ readonly q: string; readonly limit?: number | undefined; }' is not assignable to type '"show-type"'.
infer.ts(30,24): error TS18046: 'args.arg1' is of type 'unknown'.
infer.ts(36,24): error TS18046: 'args.arg2' is of type 'unknown'.
## repo 8576f161ae4 (@mcp-b/webmcp-types 5.1.0)
infer-repo.ts(23,11): error TS2322: Type '{ q: string; limit?: number | undefined; }' is not assignable to type '"show-type"'.
infer-repo.ts(33,24): error TS18046: 'args.arg1' is of type 'unknown'.
infer-repo.ts(39,24): error TS18046: 'args.arg2' is of type 'unknown'.
## 22.2.6
infer-222.ts(17,13): error TS2322: Type '{ q: string; limit?: number | undefined; }' is not assignable to type '"show-type"'.
infer-222.ts(30,24): error TS18046: 'args.arg1' is of type 'unknown'.
infer-222.ts(36,24): error TS18046: 'args.arg2' is of type 'unknown'.
## 22.2.6 tuple-mapped (#70159/#71658 の形)
exit=0
```

最後の `exit=0` がタプルの形で、型のエラーは出ません。angular-main の provide\_tools.ts は 38afab7a244 の後も `<const InputSchema extends object>(tools: ToolDescriptor<InputSchema>[])` の 1 つの型引数のままです。

## 7. DEMO：環境の注入器を作って壊す

> **🧪 DEMO — 本物の provideExperimentalWebMcpTools（22.1.6）と作り物の modelContext**
>
> 「注入器を作る」は `createEnvironmentInjector([provideExperimentalWebMcpTools([search, open])], 親)` を呼びます。作る間だけ `document.modelContext` に作り物を置き、作り終えたら消します。ブラウザに本物の `modelContext` があるときは動かしません。本物のブラウザと spec の polyfill は、同じ名前の 2 回目を `InvalidStateError` で reject します。この作り物は reject せず、「登録しない」と記録するだけです（理由は下の注意）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/wmcp-provide)

手元の Chrome で押した結果です。

| 操作 | 順 | 理由（行） |
| --- | --- | --- |
| 注入器を作る | `registerTool(wmcpp-search)` → `registerTool(wmcpp-open)` → `createEnvironmentInjector` が返る | provide\_tools.ts 34 行目が配列の順に呼び、declare\_tool.ts 82 行目まで同期 |
| いちばん古い注入器を destroy | abort → search を消す → abort → open を消す | `onDestroy` の登録の順（declare\_tool.ts 79 行目） |
| 作って壊すを 3 回 | どの回も「register 2 回 → 返る → abort 2 回」、表は毎回 0 個に戻る | 2 節の注意。名前は重ならない |
| 壊さずにもう 1 つ作る | 2 代目の `registerTool` は 2 つとも「同じ名前がある」→ 注入器は普通に返る。表は 1 代目のまま | 5 節。34 行目は Promise を待たない |
| 続けて 1 代目を destroy、次に 2 代目を destroy | 1 代目で表が 0 個。2 代目の destroy では何も起きない（abort のリスナーが無い） | 5 節の作業木の結果と同じ |

> [!WARNING]
> **ハマりどころ**
>
> 作り物を本物と同じく reject させた試作では、「壊さずにもう 1 つ作る」で、このサイトのコンソールに `ERROR InvalidStateError: …` が 2 件（ツールごとに 1 件）出ました。このサイトは `provideBrowserGlobalErrorListeners` を入れているので、provide\_tools.ts の 34 行目で捨てられた reject が window の `unhandledrejection` から `ErrorHandler` に届いたものです（[err-global-listeners](../err/03-err-global-listeners.md)）。DEMO の決まり（コンソールにエラーを出さない）のため、公開している DEMO は reject させていません。

## ここまでの呼び出し

- 👤 `createEnvironmentInjector([provideExperimentalWebMcpTools(tools)], parent)` — *またはルートの providers・bootstrapApplication*
  - `new EnvironmentNgModuleRefAdapter({runEnvironmentInitializers: true})` — ng\_module\_ref.ts 161–173
    - `R3Injector.resolveInjectorInitializers()` — r3\_injector.ts 426–455 — *428 行目で自分を今の注入器に*
      - 初期化の関数 — provide\_tools.ts 33–35
        - `declareExperimentalWebMcpTool(tool)` を配列の順に — provide\_tools.ts 34 — *Promise は捨てる*
          - `inject(Injector)` = この環境の注入器 — declare\_tool.ts 54
          - `destroyRef.onDestroy(() => abortCtrl.abort())` — declare\_tool.ts 79
          - `modelContext.registerTool(wrappedTool, {signal})` — declare\_tool.ts 82 — *ここまで同期*
- 👤 `injector.destroy()`・`NavigationEnd` の後片付け・アプリの destroy
  - `onDestroy` のコールバックを登録の順に — r3\_injector.ts — *di-destroy*
    - `abortCtrl.abort()` → ブラウザが登録を取り消す — declare\_tool.ts 79

## テストと直し方

この章の約束を固めているのは `provide_tools_spec.ts` の `describe('provideExperimentalWebMcpTools')`（18 行目）の 3 つの it、`'should register tools when initialized'`（32 行目）・`'should unregister tools when the injector is destroyed'`（63 行目）・`'should work with route providers'`（87 行目）です。

📄 `angular/packages/core/test/webmcp/provide_tools_spec.ts` L32–61 （▶ の行: 37, 39, 48, 51–52, 57–58, 60）

```ts
32 │   it('should register tools when initialized', async () => {
33 │     const execute = jasmine.createSpy<Execute<JsonSchemaForInference>>('execute').and.returnValue({
34 │       content: [{type: 'text', text: 'Hello!'}],
35 │     });
36 │ 
37 ▶     const envInjector = createEnvironmentInjector(
38 │       [
39 ▶         provideExperimentalWebMcpTools([
40 │           {
41 │             name: 'testTool',
42 │             description: 'A test tool',
43 │             inputSchema: {type: 'object', properties: {}},
44 │             execute,
45 │           },
46 │         ]),
47 │       ],
48 ▶       TestBed.inject(EnvironmentInjector),
49 │     );
50 │ 
51 ▶     expect(await getModelContext()!.getTools()).toEqual([
52 ▶       jasmine.objectContaining({name: 'testTool'}),
53 │     ]);
54 │ 
55 │     const tools = await getModelContext()!.getTools();
56 │     const testTool = tools.find((t: any) => t.name === 'testTool')!;
57 ▶     await (getModelContext() as any).executeTool(testTool, '{}');
58 ▶     expect(execute).toHaveBeenCalledOnceWith({}, jasmine.any(Object));
59 │ 
60 ▶     envInjector.destroy();
61 │   });
```

37〜49 行目で `createEnvironmentInjector` に `provideExperimentalWebMcpTools` を入れ、51〜53 行目で、**作った直後に `await` も挟まずに**ツールがあることを確かめます（`getTools()` の `await` はその後）。2 節の「作る関数が戻る前に `registerTool` が呼ばれている」に頼った書き方です。

📄 `angular/packages/core/test/webmcp/provide_tools_spec.ts` L63–85 （▶ の行: 64, 78, 82, 84）

```ts
63 │   it('should unregister tools when the injector is destroyed', async () => {
64 ▶     const envInjector = createEnvironmentInjector(
65 │       [
66 │         provideExperimentalWebMcpTools([
67 │           {
68 │             name: 'testTool',
69 │             description: 'A test tool',
70 │             inputSchema: {type: 'object', properties: {}},
71 │             execute: async () => ({content: []}),
72 │           },
73 │         ]),
74 │       ],
75 │       TestBed.inject(EnvironmentInjector),
76 │     );
77 │ 
78 ▶     expect(await getModelContext()!.getTools()).toEqual([
79 │       jasmine.objectContaining({name: 'testTool'}),
80 │     ]);
81 │ 
82 ▶     envInjector.destroy();
83 │ 
84 ▶     expect(await getModelContext()!.getTools()).toEqual([]);
85 │   });
```

📄 `angular/packages/core/test/webmcp/provide_tools_spec.ts` L87–117 （▶ の行: 100, 102–103, 114）

```ts
 87 │   it('should work with route providers', async () => {
 88 │     @Component({
 89 │       selector: 'test-comp',
 90 │       template: '',
 91 │     })
 92 │     class TestComp {}
 93 │ 
 94 │     TestBed.configureTestingModule({
 95 │       imports: [TestComp],
 96 │       providers: [
 97 │         provideRouter(
 98 │           [
 99 │             {
100 ▶               path: 'test',
101 │               component: TestComp,
102 ▶               providers: [
103 ▶                 provideExperimentalWebMcpTools([
104 │                   {
105 │                     name: 'routeTool',
106 │                     description: 'A route tool',
107 │                     inputSchema: {type: 'object', properties: {}},
108 │                     execute: async () => ({content: []}),
109 │                   },
110 │                 ]),
111 │               ],
112 │             },
113 │           ],
114 ▶           withAutoCleanupInjectors(),
115 │         ),
116 │       ],
117 │     });
```

📄 `angular/packages/core/test/webmcp/provide_tools_spec.ts` L118–140 （▶ の行: 124, 127–128, 133–134）

```ts
118 │ 
119 │     const router = TestBed.inject(Router);
120 │     const rootFixture = TestBed.createComponent(TestComp);
121 │     await rootFixture.whenStable();
122 │ 
123 │     // No tools should be registered initially
124 ▶     expect(await getModelContext()!.getTools()).toEqual([]);
125 │ 
126 │     // Navigate to the route to register the tools
127 ▶     await router.navigateByUrl('/test');
128 ▶     expect(await getModelContext()!.getTools()).toEqual([
129 │       jasmine.objectContaining({name: 'routeTool'}),
130 │     ]);
131 │ 
132 │     // Navigate away to destroy route environment injector context
133 ▶     await router.navigateByUrl('/');
134 ▶     expect(await getModelContext()!.getTools()).toEqual([]);
135 │   });
136 │ });
137 │ 
138 │ function getModelContext(): ModelContext {
139 │   return (globalThis as any).document?.modelContext;
140 │ }
```

102〜103 行目がルートの `providers`、114 行目が `withAutoCleanupInjectors()`（7137a412230 で `withExperimentalAutoCleanupInjectors` から書き換え）です。124 行目で「最初は 0 個」、127〜130 行目で `/test` に来たら登録、133〜134 行目で `/` に戻ったら 0 個を確かめます。`withAutoCleanupInjectors()` を外した場合（3b0ae5fef03 の本文の「取り消しには必要」）を確かめる it はありません。

走らせ方と結果は[第 1 回](01-wmcp-declare.md)と同じ `//packages/core/test/webmcp:webmcp_chromium` で、13 個のうち 3 個がこの spec です（2026-11-16、手元の 8576f161ae4 で 13 passed）。

### 直すとしたら

- 5 節の「処理されない reject」は、`provide_tools.ts` の `provideExperimentalWebMcpTools` の 34 行目で捨てている Promise の失敗を、どこへ渡すかの問題です。初期化の関数の中で `inject(ErrorHandler)` を取って `.catch` で渡す、などの形が考えられます。spec は `provide_tools_spec.ts` の 63 行目の it の隣に、同じ名前のツールを持つ注入器を 2 つ作り、失敗がどこに届くかを確かめる it を足します。5 節の作業木の it のとおり、この spec の環境では Zone.js が先に受け取るので、window の `unhandledrejection` を待つ形では確かめられません。
- 6 節の型は `provideExperimentalWebMcpTools` の 29〜31 行目で、#71658 と同じ写像の型（angular-main なら制約は `readonly object[]`）にし、`packages/core/test/strict_types` に型の違う 2 つのツールを渡す spec を足す形です。#70125 は開いたままです。

## 聞かれそうな質問

**Q. provideExperimentalWebMcpTools と declareExperimentalWebMcpTool はどう使い分けますか？**

provide は「ある環境の注入器の寿命と同じだけ」のツールを providers に並べる形で、中身は provide\_tools.ts の 34 行目で declare を呼ぶだけです。コンポーネントの寿命に結び付けたいとき、登録の成否を `await` で受けたいときは declare を使います（provide は Promise を捨てる）。

**Q. ルートの providers に書いたツールは、ルートを離れると消えますか？**

`withAutoCleanupInjectors()` を付けたときだけです。`NavigationEnd` で使われていないルートの注入器が壊され（router.ts 212 行目）、declare\_tool.ts の 79 行目で取り消されます。付けないと、ルートの注入器は残り続けるのでツールも残ります（3b0ae5fef03 の本文）。spec は 114 行目で付けた場合だけを確かめています。

**Q. SSR でツールを登録しようとするとどうなりますか？**

何も起きません。declare\_tool.ts の 36 行目で `ngServerMode` が真なら戻ります（e50d47a4931）。`document` を読む 39〜41 行目より前なので、サーバーで `document` がまだ無くても落ちません。ブラウザでアプリの注入器が作られたときに登録されます。

**Q. #68899 の「Duplicate tool name」は、いまの Angular で直っていますか？**

Angular のコミットでは直していません。Chrome 149 で再現しなくなったことを確かめて閉じられました。Angular の側の順番（古い注入器の abort → 新しい注入器の登録）はもともと重ならない形で、変わったのは、もし重なったら失敗が処理されない reject になる点です（f908140d718 と 34 行目。DEMO の「壊さずにもう 1 つ作る」）。

**Q. 型の違うツールを 1 回の provide に並べると execute の引数が unknown になるのはなぜですか？**

29〜30 行目の型引数 `InputSchema` が配列全体で 1 つだからです（#70125、開いたまま）。2 つの PR（#70159・#71658）がタプルの写像の型を提案しましたが、CLA と公式の型への移行の都合で閉じられました。今は、ツールごとに provide を分けるか、declare を使うと、それぞれ別に推論されます。

## 読み終えて

- provideExperimentalWebMcpTools は、環境の初期化の関数で declare を配列の順に呼ぶだけ。注入器を作る関数が戻る前に registerTool まで進む
- 取り消しは注入器の destroy（onDestroy の順）。ルートの providers なら withAutoCleanupInjectors が NavigationEnd で壊すときだけ消える
- SSR では declare\_tool.ts の 36 行目で戻る（e50d47a4931）。description は仕様に合わせて必須（c121407c0da）
- #68899 はブラウザの側で解決。いまは provide が Promise を捨てるので、名前が重なると処理されない reject になる
- ツールごとの型推論（#70125）は 2 つの PR（#70159・#71658）が閉じられ、開いたまま。タプルの写像の型なら 22.2.6 の型でも通る

---

← 前: [declareExperimentalWebMcpTool：1 つのツールを登録して取り消すまで](01-wmcp-declare.md)  
次: [Signal Forms のフォームをツールにする：スキーマから JSON Schema へ](03-wmcp-forms.md) →
