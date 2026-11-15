[目次](../README.md) › [外のコンポーネント：foreignImports と foreign view](README.md) › 第 1 回 / 全 6 回

# 契約と歩み：4 つの Symbol と g3-only の印

> ForeignComponent の契約がどこまで npm に出ていて、どこからが Google の中だけか（core.ts の g3-only のコメントと、4f9ee3c056a の g3-only・3p-only の印）。0a9b19454d0 の foreign view から 34817da7354 の描く時機の変更までのコミットを月ごとに並べ、22.2 の 3 つの修正も 22.1.4・22.1.5 に同じ差分で入ったことを tag と patch-id で確かめる。ページの上で、外に出ていない Symbol のキーを Proxy で受けて、本物の Angular が外の部品の何を読みに来るか（getComponentId の toString も）を記録する。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fgn-contract-history)

---

この章で分かること：外のコンポーネント（foreign component）の契約のうち、どこまでが npm の `@angular/core` に出ていて、どこからが Google の中（g3）だけなのか。それを決めている `// g3-only` と `// 3p-only` の印（4f9ee3c056a）が何をするのか。そして 2026 年 3 月から 8 月までのコミットが、どの順で、どの版に入ったのか、です。最後に、外に出ていない Symbol のキーを Proxy で受けて、本物の Angular が外の部品の何を読みに来るかを、このページの上で記録します。

読む対象は `packages/core/src/core.ts`、`contributing-docs/google-markers.md`、`packages/core/src/render3/interfaces/node.ts`、`packages/core/src/render3/definition.ts`、`packages/core/test/acceptance/foreign_component/foreign_component_spec.ts` と `git log` です。4 つの Symbol からなる契約そのものと、仕組みの全体の流れは [standalone シリーズの「foreignImports（内部向け）」](../standalone/14-standalone-foreign-imports.md)で読みました。この章ではその行は引かず、リンクで済ませます。

1. **1. 契約と歩み**（この章）
2. [2. foreign view](02-fgn-foreign-view.md)
3. [3. ɵɵforeignComponent の中](03-fgn-instruction.md)
4. [4. @content と後始末](04-fgn-content.md)
5. [5. コンパイラと ngtsc](05-fgn-compiler.md)
6. [6. spec と PR](06-fgn-tests-issues.md)

## 1. 契約のおさらいと、テストの中での作り方

契約は `RENDER`・`ON_DESTROY`・`CONTENT_ADAPTER`・`GET_CONTEXT`（任意）の 4 つの `Symbol` をキーにしたオブジェクトです。`RENDER` は props を受けて `[Node[], 後始末の関数?]` を返し、Angular はそのノードを自分の位置に差し込みます。行ごとの説明は [standalone-foreign-imports の 1 節](../standalone/14-standalone-foreign-imports.md)にあります。ここでは、その契約を本家のテストがどう作っているかを見ます。

📄 `angular/packages/core/test/acceptance/foreign_component/foreign_component_spec.ts` L27–44 （▶ の行: 27–28, 30–34）

```ts
27 ▶ import {ForeignComponent} from '../../../src/interface/foreign_component';
28 ▶ import {foreignImport} from '../../../src/render3/foreign_import';
29 │ 
30 ▶ function frameworkImport<TProps>(component: (props: TProps) => Node[]): ForeignComponent<TProps> {
31 ▶   return foreignImport(
32 ▶     (props) => [component(props)],
33 ▶     () => {},
34 ▶     (producer) => producer(),
35 │   );
36 │ }
37 │ 
38 │ function FancyButton(props: {children: Node[]}): Node[] {
39 │   const button = document.createElement('button');
40 │   for (const child of props.children) {
41 │     button.appendChild(child);
42 │   }
43 │   return [button];
44 │ }
```
*acceptance の spec の先頭。外のフレームワークの代わりを、foreignImport で作っている*

1. **27〜28 行目：`ForeignComponent` と `foreignImport` を src から直接 import する**

   `'@angular/core'` からではなく `'../../../src/interface/foreign_component'` と `'../../../src/render3/foreign_import'` からです。リポジトリの中のテストなので src の行に届きますが、npm の利用者はこの 2 つを import できません（2 節）。
2. **30〜36 行目：`frameworkImport` が「外のフレームワークの橋」の役をする**

   32 行目が `RENDER`（部品の関数を呼んで `[ノード]` を返す）、33 行目が `ON_DESTROY`（何もしない）、34 行目が `CONTENT_ADAPTER`（`producer` をすぐ呼ぶ）です。テンプレートには `foreignImports: [frameworkImport(FancyButton)]` と書きます。この形（1 引数の呼び出し）しか ngtsc が受けないことは[前の章の 3 節](../standalone/14-standalone-foreign-imports.md)で読みました。

## 2. npm に出ているもの、出ていないもの

📄 `angular/packages/core/src/core.ts` L72–83 （▶ の行: 79）

```ts
72 │ export {
73 │   DEFAULT_CURRENCY_CODE,
74 │   LOCALE_ID,
75 │   MissingTranslationStrategy,
76 │   TRANSLATIONS,
77 │   TRANSLATIONS_FORMAT,
78 │ } from './i18n/tokens';
79 ▶ // g3-only export {ForeignComponent} from './interface/foreign_component';
80 │ export {AbstractType, Type} from './interface/type';
81 │ export * from './linker';
82 │ export * from './linker/ng_module_factory_loader_impl';
83 │ export * from './metadata';
```

📄 `angular/packages/core/src/core.ts` L108–118 （▶ の行: 115–116）

```ts
108 │ export {
109 │   Binding,
110 │   DirectiveWithBindings,
111 │   inputBinding,
112 │   outputBinding,
113 │   twoWayBinding,
114 │ } from './render3/dynamic_bindings';
115 ▶ // g3-only export {provideForeignRootContext} from './render3/foreign_context';
116 ▶ // g3-only export {foreignImport} from './render3/foreign_import';
117 │ export {createEnvironmentInjector, createNgModule} from './render3/ng_module_ref';
118 │ export {publishNonCoreGlobalUtil as ɵpublishNonCoreGlobalUtil} from './render3/util/global_utils';
```

`@angular/core` の入口のファイルです。79 行目の `ForeignComponent`、115 行目の `provideForeignRootContext`、116 行目の `foreignImport` は、どれも行の頭が `// g3-only` の**コメント**です。TypeScript から見ればただのコメントなので、npm のパッケージには出ません。一方、命令の 3 つ（`ɵɵforeignComponent`・`ɵɵforeignContent`・`ɵɵforeignContentFn`）は `core_render3_private_export.ts` から `ɵɵ` の名前で出ています。コンパイラが出したコードが呼ぶので、出ていないと動きません。

このサイトの `node_modules/@angular/core`（22.1.6）で確かめた記録です。

📄 `記録：サイトの node_modules/@angular/core（22.1.6）`

```
$ cd node_modules/@angular/core && grep '"version"' package.json
  "version": "22.1.6",
$ grep -c foreignImports types/*.d.ts | grep -v ":0$"
（0 件）
$ grep -n "declare function ɵɵforeign" types/core.d.ts
5626:declare function ɵɵforeignComponent(index: number, foreignComponentIndex: number, props?: (() => any) | null): void;
5635:declare function ɵɵforeignContent(index: number, foreignComponentConstIndex: number): any;
5644:declare function ɵɵforeignContentFn(index: number, foreignComponentConstIndex: number): (...args: any[]) => any;
$ grep -n "^interface ForeignComponent\|^declare const RENDER:" types/_debug_node-chunk.d.ts
1084:declare const RENDER: unique symbol;
1128:interface ForeignComponent<TProps = {}, TContext = unknown> {
$ grep -n "Symbol('RENDER')" fesm2022/*.mjs
fesm2022/_debug_node-chunk.mjs:7819:const RENDER = Symbol('RENDER');
$ grep -c "function foreignImport(" fesm2022/*.mjs | grep -v ":0$"
（0 件）
$ grep -o "ɵɵforeign[A-Za-z]*" fesm2022/core.mjs | sort -u
ɵɵforeignComponent
ɵɵforeignContent
ɵɵforeignContentFn
```

1. **型の `foreignImports` は 0 件**

   `Component` の `foreignImports` は `@internal // 3p-only` で、配布物は `stripInternal` で `@internal` の宣言を落として作ります （[公開 API の章](../contrib/08-contrib-public-api.md)で読んだ tsconfig-build.json の設定）。だから章のコードで書くときは `// @ts-ignore` が要ります。
2. **命令の 3 つは型も実体もある**

   記録の `types/core.d.ts:5626`・`:5635`・`:5644` の宣言と、`fesm2022/core.mjs` の export です。
3. **`ForeignComponent` の型と `RENDER` の Symbol は「中にあるが export されていない」**

   d.ts の塊（chunk）の中に宣言はありますが、export の一覧にはありません。下の `TConstants` の型が `ForeignComponent` を参照しているので、型の宣言だけが巻き込まれて残っています。実体の `RENDER` は `Symbol('RENDER')`（`Symbol.for` ではない）なので、外から同じ値を作ることはできません。`foreignImport` 関数は束ねたときに捨てられて、0 件です。

📄 `angular/packages/core/src/render3/interfaces/node.ts` L233–240 （▶ の行: 238, 240）

```ts
233 │ /**
234 │  * Constants that are associated with a view. Includes:
235 │  * - Attribute arrays.
236 │  * - Local definition arrays.
237 │  * - Translated messages (i18n).
238 ▶  * - Foreign components.
239 │  */
240 ▶ export type TConstants = (TAttributes | string | ForeignComponent<any, any>)[];
```

240 行目、ビューの定数の配列（`ɵcmp.consts`）の要素の型に `ForeignComponent<any, any>` が入っています。238 行目のコメントも「Foreign components」。AOT の出力は `consts: [frameworkImport(FancyButton), ...]` の形で、外の部品のオブジェクトを属性の配列と同じ所に並べます（[前の章の 5 節](../standalone/14-standalone-foreign-imports.md)）。この「定数の配列に混ざる」ことが、4 節の記録の理由になります。

## 3. g3-only と 3p-only の印（4f9ee3c056a）

印を入れたのは 4f9ee3c056a（Alex Rickabaugh、2026-05-21 に書かれ、05-26 に main に入った）です。本文は「google3 に取り込むときにファイルごとに当てていた差分を、コメントの印で置き換える」。25 ファイルに印を付け、説明の文書 `contributing-docs/google-markers.md` を足しました。core の 2 ファイルの差分です。

📄 `git show 4f9ee3c056a（core の 2 ファイルだけ）`

```
$ git show 4f9ee3c056a -- packages/core/src/core.ts packages/core/src/metadata/directives.ts
--- a/packages/core/src/core.ts
+++ b/packages/core/src/core.ts
@@ -76,6 +76,7 @@ export {
   TRANSLATIONS,
   TRANSLATIONS_FORMAT,
 } from './i18n/tokens';
+// g3-only export {ForeignComponent} from './interface/foreign_component';
 export {AbstractType, Type} from './interface/type';
@@ -111,6 +112,7 @@ export {
   outputBinding,
   twoWayBinding,
 } from './render3/dynamic_bindings';
+// g3-only export {foreignImport} from './render3/foreign_import';
 export {createEnvironmentInjector, createNgModule} from './render3/ng_module_ref';
--- a/packages/core/src/metadata/directives.ts
+++ b/packages/core/src/metadata/directives.ts
@@ -646,7 +646,7 @@ export interface Component extends Directive {
    * The foreignImports property specifies components from other frameworks that can be used
    * within this component's template.
    *
-   * @internal
+   * @internal // 3p-only
    */
   foreignImports?: ForeignComponent[];
```

`// g3-only export {ForeignComponent}` と `// g3-only export {foreignImport}` の 2 行が足され、`@internal` の行の末尾に `// 3p-only` が付きました。115 行目の `provideForeignRootContext` の行は、あとで 555fc20af04（2026-06-24、context の対応）が同じ形で足しています。印の意味は文書に書いてあります。表の全体は [PR が通るまでの章](../contrib/10-contrib-pr-flow.md)で読みました。ここでは foreign に関わる 2 つの規則を見ます。

📄 `angular/contributing-docs/google-markers.md` L26–36 （▶ の行: 28, 32, 35）

````md
26 │ ### 1. Removing Single Lines (`// 3p-only`)
27 │ 
28 ▶ This tag is appended at the end of a line comment to completely remove that line when the code is synced internally to Google.
29 │ 
30 │ - **GitHub Source**:
31 │   ```typescript
32 ▶   import {ExternalBenchmarkRunner} from './benchmarks'; // 3p-only
33 │   ```
34 │ - **Google's Internal Codebase**:
35 ▶   _(The line is completely removed)_
36 │ 
````

📄 `angular/contributing-docs/google-markers.md` L57–69 （▶ の行: 59, 63, 67）

````md
57 │ ### 3. Activating Single Lines (`// g3-only`)
58 │ 
59 ▶ Google-specific code is written as a comment and prefixed with `// g3-only`. The sync tooling uncomments this line when importing it into Google's codebase.
60 │ 
61 │ - **GitHub Source**:
62 │   ```typescript
63 ▶   // g3-only export {ForeignComponent} from './interface/foreign_component';
64 │   ```
65 │ - **Google's Internal Codebase**:
66 │   ```typescript
67 ▶   export {ForeignComponent} from './interface/foreign_component';
68 │   ```
69 │ 
````

1. **28 行目：`// 3p-only` で終わる行は、google3 では行ごと消える**

   directives.ts の ` * @internal // 3p-only` はこの規則に当たります。google3 ではこの行が消えるので、`foreignImports` は `@internal` でなくなり、型に現れます。GitHub と npm では `@internal` のまま残り、2 節の `stripInternal` で型から落ちます。同じ 1 行が、両側で逆の結果になります。
2. **59 行目：`// g3-only` で始まる行は、google3 ではコメントが外れる**

   63 行目と 67 行目の例は、core.ts の 79 行目そのものです。google3 では `export {ForeignComponent}` が有効になり、GitHub と npm ではコメントのままです。
3. **印を読むツールは、公開のリポジトリの中には無い**

   下の記録のとおり、`git grep` で見つかるのは印を使っている所と説明の文書だけです。

📄 `記録：../angular（8576f161ae4）`

```
$ git grep -l "g3-only"            # 8576f161ae4
contributing-docs/google-markers.md
packages/compiler-cli/src/ngtsc/core/src/feature_detection.ts
packages/compiler/src/legacy_optional_chaining_default.ts
packages/compiler/src/util.ts
packages/core/primitives/event-dispatch/src/event_contract_defines.ts
packages/core/src/core.ts
packages/core/src/render3/jit/directive.ts
packages/core/src/webmcp/declare_tool.ts
packages/core/src/webmcp/provide_tools.ts
packages/core/src/webmcp/types.ts
packages/forms/src/directives/shared.ts
packages/platform-browser/animations/src/module.ts
packages/platform-browser/testing/src/browser.ts
packages/platform-server/src/domino_adapter.ts
packages/router/src/router_state.ts
packages/zone.js/lib/zone.ts
（印を使っている所と説明の文書だけ。印を読んで書き換えるスクリプトは無い）

$ git log --format='%h %ad %s' --date=short -S"g3-only export {provideForeignRootContext}" -- packages/core/src/core.ts
555fc20af04 2026-06-24 refactor(core): add context support for foreign components (#69502)

$ git grep -n -i "foreign" -- goldens/
goldens/public-api/compiler-cli/error_code.api.md:63:    FOREIGN_COMPONENT_CONTENT_UNNECESSARY_FOR_CHILDREN = 8027,
goldens/public-api/compiler-cli/error_code.api.md:64:    FOREIGN_COMPONENT_UNSUPPORTED_BINDING = 8025,
（同じファイルの 31・32・90 行目に CONFLICTING_CONTENT_AND_PROPERTY = 8029・CONFLICTING_CONTENT_DECLARATION = 8028・INVALID_CONTENT_PLACEMENT = 8026。goldens/public-api/core には 0 件）
```

`.ng-dev/google-sync-config.json` は同期するファイルの範囲（`packages/**` など）を決める設定で、印の書き換えはしません。つまり公開側で確かめられるのは「印がどこに付いているか」と「文書に書かれた規則」までです。goldens/public-api のうち foreign の名前が出るのは compiler-cli の `error_code.api.md` だけで、テンプレートの検査のエラー番号 8025〜8029 です（[第 5 回](05-fgn-compiler.md)）。core の公開 API の golden には 1 件もありません。

## 4. 定義した瞬間に読まれる 3 つのキー

6 節のデモの Proxy は、ボタンを押す前から 3 回読まれます。どこで読まれるのかを追うと、`ɵɵdefineComponent` の最後の行に行き着きます。

📄 `angular/packages/core/src/render3/definition.ts` L379–386 （▶ の行: 381）

```ts
379 │     def.directiveDefs = extractDefListOrFactory(dependencies, extractDirectiveDef);
380 │     def.pipeDefs = extractDefListOrFactory(dependencies, getPipeDef);
381 ▶     def.id = getComponentId(def);
382 │ 
383 │     return def;
384 │   });
385 │ }
386 │ 
```

📄 `angular/packages/core/src/render3/definition.ts` L685–711 （▶ の行: 685, 694, 696, 705, 710）

```ts
685 ▶ function getComponentId<T>(componentDef: ComponentDef<T>): string {
686 │   let hash = 0;
687 │ 
688 │   // For components with i18n in templates, the `consts` array is generated by the compiler
689 │   // as a function. If client and server bundles were produced with different minification
690 │   // configurations, the serializable contents of the function body would be different on
691 │   // the client and on the server. This might result in different ids generated. To avoid this
692 │   // issue, we do not take the `consts` contents into account if it's a function.
693 │   // See https://github.com/angular/angular/issues/58713.
694 ▶   const componentDefConsts = typeof componentDef.consts === 'function' ? '' : componentDef.consts;
695 │ 
696 ▶   // We cannot rely solely on the component selector as the same selector can be used in different
697 │   // modules.
698 │   //
699 │   // `componentDef.style` is not used, due to it causing inconsistencies. Ex: when server
700 │   // component styles has no sourcemaps and browsers do.
701 │   //
702 │   // Example:
703 │   // https://github.com/angular/components/blob/d9f82c8f95309e77a6d82fd574c65871e91354c2/src/material/core/option/option.ts#L248
704 │   // https://github.com/angular/components/blob/285f46dc2b4c5b127d356cb7c4714b221f03ce50/src/material/legacy-core/option/option.ts#L32
705 ▶   const hashSelectors = [
706 │     componentDef.selectors,
707 │     componentDef.ngContentSelectors,
708 │     componentDef.hostVars,
709 │     componentDef.hostAttrs,
710 ▶     componentDefConsts,
711 │     componentDef.vars,
```

📄 `angular/packages/core/src/render3/definition.ts` L726–741 （▶ の行: 730, 732, 739–740）

```ts
726 │   if (typeof ngDevMode === 'undefined' || ngDevMode) {
727 │     // If client and server bundles were produced with different minification configurations,
728 │     // the serializable contents of the function body would be different on the client and on
729 │     // the server. Ensure that we do not accidentally use functions in component id computation.
730 ▶     for (const item of hashSelectors) {
731 │       assertNotEqual(
732 ▶         typeof item,
733 │         'function',
734 │         'Internal error: attempting to use a function in component id computation logic.',
735 │       );
736 │     }
737 │   }
738 │ 
739 ▶   for (const char of hashSelectors.join('|')) {
740 ▶     hash = (Math.imul(31, hash) + char.charCodeAt(0)) << 0;
741 │   }
```

1. **381 行目：コンポーネントの定義を作るたびに `getComponentId` を呼ぶ**

   id はコンポーネントを見分ける文字列で、696〜704 行目のコメントのとおり、サーバーの束とブラウザの束で同じ値になるように材料を選んでいます。`ɵɵdefineComponent` はクラスの static の初期化で呼ばれるので、クラスが読み込まれた時点で 1 回走ります。
2. **694 行目と 710 行目：`consts` の配列を、そのままハッシュの材料に入れる**

   `consts` が関数（i18n のとき）でなければ、配列のまま `hashSelectors` に入ります。2 節の `TConstants` のとおり、その中に外の部品のオブジェクトがあります。
3. **739 行目：`hashSelectors.join('|')` で全部を文字列にする**

   配列の `join` は要素を文字列に変えます。外の部品のオブジェクトは `Symbol.toPrimitive` → `toString` の順に探され、`Object.prototype.toString` が `Symbol.toStringTag` を読んで `"[object Object]"` を返します。これがデモの記録の最初の 3 行です。730〜736 行目の開発モードの検査は「関数が混ざっていないか」を見るだけで、オブジェクトは通ります。

> [!WARNING]
> **ハマりどころ**
>
> 最初に作った Proxy は、知らないキーに `undefined` を返していました。すると 739 行目の `join` が下の例外で落ち、22.1.4・22.1.6・22.2.6 のどれでも、クラスの読み込みの時点で止まりました（[第 3 回](03-fgn-instruction.md)の記録スクリプトを Node で走らせたときの最初の結果）。`foreignImport` が返す普通のオブジェクトなら `Object.prototype` を持つので起きません。契約の 4 つのキーのほかに、「文字列にできること」も暗に求められている、ということです。この章の橋は、知らないキーを `Reflect.get` で元のオブジェクトに渡して避けています。

📄 `記録：知らないキーに undefined を返す Proxy を consts に入れたとき（22.1.6）`

```
<node_modules>/@angular/core/fesm2022/_debug_node-chunk.mjs:10307
  for (const char of hashSelectors.join('|')) {
                                   ^

TypeError: Cannot convert object to primitive value
    at Array.join (<anonymous>)
    at Array.toString (<anonymous>)
    at Array.join (<anonymous>)
    at getComponentId (<node_modules>/@angular/core/fesm2022/_debug_node-chunk.mjs:10307:36)
    at Object.toString (<node_modules>/@angular/core/fesm2022/_debug_node-chunk.mjs:10173:14)
    at noSideEffects (<node_modules>/@angular/core/fesm2022/_debug_node-chunk.mjs:28:5)
    at Module.ɵɵdefineComponent (<node_modules>/@angular/core/fesm2022/_debug_node-chunk.mjs:10139:10)
```

## 5. コミットの歩み（2026 年 3 月〜8 月）

../angular（8576f161ae4、22.2.0-next.7）の `git log` から、外のコンポーネントに関わるコミットを main に入った日（committer date）の順に並べました。「最初の版」は `git tag --contains` で見つかる、日付がいちばん早いタグです。22.2 で入った 3 つは、同じ差分（`git patch-id` が一致）が 22.1.x にも入っています。

| 月 | コミット | main に入った日 | 場所 | 何をしたか | 最初の版 | この章 |
| --- | --- | --- | --- | --- | --- | --- |
| 5 月 | 0a9b19454d0 | 05-15（書いたのは 03-25） | core | foreign view を作る内部 API（`createForeignView`、`TViewType.Foreign`） | v22.1.0-next.0 | [第 2 回](02-fgn-foreign-view.md) |
| 88b0e420cf8 | 05-18 | compiler・compiler-cli | `foreignImports` を読む | v22.1.0-next.0 | [第 5 回](05-fgn-compiler.md) |   |
| d596d8bd0ac | 05-19 | compiler・compiler-cli | テンプレートの要素を照合して検査する（#68674） | v22.1.0-next.0 | 第 5 回 |   |
| 7c60a98b3cc | 05-19 | compiler-cli | import の別名を受ける（#68674） | v22.1.0-next.0 | 第 5 回 |   |
| 4f9ee3c056a | 05-26 | リポジトリ全体 | g3-only と 3p-only の印 | v22.1.0-next.0 | 3 節 |   |
| 6981cd782a1 | 05-27 | compiler（core に空の命令） | 命令を出す。`ɵɵforeignComponent` はまだ何もしない | v22.1.0-next.0 | 第 5 回 |   |
| 6 月 | 330e209c692 | 06-03 | core | head と tail のコメントに開発モードの文字 | v22.1.0-next.0 | 第 2 回 |
| e678955eacd | 06-03 | core | `ɵɵforeignComponent` の中身（作成時に描く） | v22.1.0-next.0 | [第 3 回](03-fgn-instruction.md) |   |
| 0c07356c5c9 | 06-03 | core | 再利用のときの `currentTNode` | v22.1.0-next.0 | 第 3 回 |   |
| aeb55c8bc10 | 06-03 | compiler-cli | 呼んでいない signal を props に渡せる | v22.1.0-next.0 | 第 5 回 |   |
| f89d0e4c8fc | 06-05 | compiler・core | 子を `children` として渡す（`ɵɵforeignContent`） | v22.1.0-next.0 | [第 4 回](04-fgn-content.md) |   |
| f19bbe59dd9 | 06-05 | compiler | 特定の props に内容を渡す（`@content`） | v22.1.0-next.0 | 第 4・5 回 |   |
| 56607967dbb | 06-05 | core | LogicalOnly のコンテナ | v22.1.0-next.0 | 第 4 回 |   |
| 1f6e843648f | 06-05 | compiler-cli | `@content` の置き場所の検査 | v22.1.0-next.0 | 第 5 回 |   |
| 79e5d5d75f0 | 06-05 | compiler-cli | `@content` の名前の衝突の検査 | v22.1.0-next.0 | 第 5 回 |   |
| 337442453b7 | 06-05 | compiler-cli | `@content (children)` を禁止 | v22.1.0-next.0 | 第 5 回 |   |
| daa47b4aad8 | 06-05 | compiler-cli | 束縛の検査を解析の段階へ | v22.1.0-next.0 | 第 5 回 |   |
| b399f78c347 | 06-08 | compiler・core | `@content` を関数で渡す（`ɵɵforeignContentFn`） | v22.1.0-next.0 | 第 4 回 |   |
| 25c744c4d0a | 06-08 | compiler・core | 外の部品を `consts` の添字で渡す（2 番目の引数が添字に） | v22.1.0-next.0 | 第 3・5 回 |   |
| 11b206b9190 | 06-08 | core | `@content` のビューの後始末（`ON_DESTROY`） | v22.1.0-next.0 | 第 4 回 |   |
| b3748e9fe4a | 06-08 | core | コンテナの目印を集める順を DOM に合わせる | v22.1.0-next.0 | 第 4 回 |   |
| 4847c0e07b1 | 06-29 | core・compiler | 内容を遅れて描く（`CONTENT_ADAPTER`） | v22.1.0-next.4 | 第 4 回 |   |
| 555fc20af04 | 06-29 | core | context（`GET_CONTEXT`・`FOREIGN_CONTEXT`）（#69502） | v22.1.0-next.4 | 第 4 回 |   |
| a720094deb2 | 06-29 | core・compiler-cli | `@content` の書き方をそろえる（#69502） | v22.1.0-next.4 | 第 4 回 |   |
| 7 月 | a19c02706fd | 07-07 | compiler-cli | isolated declarations | v22.1.0-next.5 | 第 5 回 |
| 5bd00add071 | 07-09 | compiler | 制御フローの中に置ける（#69674） | v22.1.0-next.6 | 第 5 回 |   |
| 2e442f78762 | 07-09 | compiler | 制御フローの根が外の部品なら要素名を出さない（#69674） | v22.1.0-next.6 | 第 5 回 |   |
| eb3e480360d | 07-21 | compiler-cli（テスト） | DOM だけの命令と全部の命令の切り替えを、foreign\_component の例から切り離して確かめる compliance を足す | v22.1.0-rc.0 | — |   |
| 8 月 | 915a03ae856 | 08-25 | core | JIT で断る | v22.2.0-next.4 ／ v22.1.4（b199bdfa2ad） | 第 3 回 |
| a46292af260 | 08-25 | compiler-cli | 関連メッセージの元ファイルをテンプレートに | v22.2.0-next.4 ／ v22.1.4（afe8499a14c） | 第 5 回 |   |
| 34817da7354 | 08-27 | core・compiler | 描く時機を作成時から更新のあとのビューの effect へ | v22.2.0-next.5 ／ v22.1.5（60f8a785fd2） | 第 3 回 |   |

📄 `記録：22.2 のコミットが 22.1.x にも入っていること`

```
$ git log v22.1.6 --format='%h %s' --fixed-strings --grep="<34817da7354 の件名>" -1
60f8a785fd2 refactor(core): defer foreign component rendering to post-update pass
$ git show 60f8a785fd2 | git patch-id ; git show 34817da7354 | git patch-id
e336bf153856…  60f8a785fd2…
e336bf153856…  34817da7354…
$ git tag --contains 60f8a785fd2 | sort -V | head -1
v22.1.5
（同じようにして 915a03ae856 → b199bdfa2ad（v22.1.4）、a46292af260 → afe8499a14c（v22.1.4）。patch-id はどれも一致）
```

1. **3 月に書かれ、5 月に入った**

   0a9b19454d0 は書いた日（author date）が 03-25、main に入った日が 05-15 です。残りはほぼ leonsenft さんのコミットで、6 月 3〜8 日の 1 週間に core の中身の大半が入りました。
2. **22.1.0 で全体がそろい、22.2 の 3 つも 22.1.x に入った**

   描く時機を変えた 34817da7354 も、22.1.5 に同じ差分（60f8a785fd2）が入っています。このサイトが使う 22.1.6 の `ɵɵforeignComponent` は、22.2.6 のものと同じ形（`createViewEffect` で 1 回だけ描く）です。違いが見えるのは 22.1.4 との間で、[第 3 回](03-fgn-instruction.md)で 3 つの版を並べて動かします。
3. **名前に foreign が付いても別の話のもの**

   ef09d108f23（devtools、09-09）は「ページの中にある、別のアプリの root の要素」を扱う修正で、外のコンポーネントとは関係ありません。56847dc77a5（devtools）と cd656701b07 は SVG の `<foreignObject>`、06b004ec5c4 は ngtsc の `ForeignFunctionResolver` の話です。
4. **angular-main（74961c66242）にだけあるもの**

   684a89027bc（10-12、preprocessor の照合）と c7fd4a2ed99（10-26、検査をそろえる）はどちらも compiler-cli の修正で、[第 6 回](06-fgn-tests-issues.md)で読みます。core の `foreign_view.ts`・`instructions/foreign_component.ts`・`interface/foreign_component.ts`・`foreign_import.ts` は、8576f161ae4 と 74961c66242 で 1 行も変わっていません（`git diff --stat` が空）。

## 6. デモ：本物の命令が、外の部品の何を読みに来るか

この章のデモの部品は、`foreignImports: [miniImport(MiniBadge)]` を `// @ts-ignore` 付きで書き、サイトのビルド（AOT、compiler-cli 22.1.6）で本当にコンパイルしています。`miniImport` は**仕組みを見るための手作りの橋で、本家の使い方ではありません**。外に出ていない Symbol のキーを、Proxy の `get` で受けて `key.description`（`'RENDER'` など）で振り分け、素の DOM で描く小さな関数を返します。受けたキーと呼ばれた関数を、すべて順に記録します。

DEMO — 本物の ɵɵforeignComponent が、外の部品の何を読みに来るか この枠の中の `<MiniBadge>` は、この章のコンポーネントの `foreignImports` に 手作りの橋 `miniImport(MiniBadge)` を入れて、サイトの AOT（compiler-cli 22.1.6）で本当にコンパイルしたものです。橋は Proxy で、読まれたキーと呼ばれた関数を順に書き出します。外の部品を置く場所（記録はありません。ページを開いた直後の記録は、最初に描き終えたあとに表示します）

1. **ページを開いた時点の 3 行：`Symbol(Symbol.toPrimitive)`・`"toString"`・`Symbol(Symbol.toStringTag)`**

   4 節の `getComponentId` です。章のコードが読み込まれ、デモの部品の `ɵcmp` が作られた瞬間に読まれます。
2. **「置く」のあと、まず `CONTENT_ADAPTER`・`ON_DESTROY`・`GET_CONTEXT`**

   `<MiniBadge>` の中に `<em>` の子があるので、コンパイラは `ɵɵforeignContent` を `ɵɵforeignComponent` の前に出します。それが @if のビューを作る（作成の回）ときに 3 つを読み、その場で `CONTENT_ADAPTER(producer)` を呼びます（[第 4 回](04-fgn-content.md)）。この橋の `CONTENT_ADAPTER` は `producer` を呼ばずにそのまま返し、`GET_CONTEXT` は `undefined` です。
3. **次に `RENDER` を読み、呼ぶ。`ɵɵforeignComponent` 自身は作成の回に何も読まない**

   `RENDER` を読むのは、更新の回のあとのビューの effect の中です（[第 3 回](03-fgn-instruction.md)）。外の側が `props.children()` を呼ぶと、そこで初めて Angular の子のビューが作られ、`ON_DESTROY` で渡された関数に「中のビューを壊す関数」が預けられます。
4. **「外す」と、`RENDER` が返した後始末の関数が呼ばれる**

   橋はその中で、預かった destroy を呼び返します。どちらの行も、キーを新しく読みません。読むのは最初の 1 回だけで、あとは手元に持った関数を呼んでいます。

> [!NOTE]
> **ポイント**
>
> このデモが動くのは、`ɵɵforeignComponent` がキーを「`foreignComponent[RENDER]`」の形で読むだけだからです。ngtsc は `miniImport(MiniBadge)` を評価せず、式のまま `consts` に書き出します（[前の章の 3・5 節](../standalone/14-standalone-foreign-imports.md)）。逆に、JIT では `foreignImports` を書いた時点で例外になります（第 3 回）。

## ここまでの呼び出し

- 👤 `@Component({foreignImports: [miniImport(MiniBadge)], ...})` — 章のデモの部品（AOT でコンパイル）
  - `ɵɵdefineComponent({consts: [miniImport(MiniBadge), ...]})` — コンパイラの出力 — *クラスの読み込み時に 1 回*
    - `getComponentId(def)` — render3/definition.ts L381
      - `hashSelectors.join('|')` — definition.ts L739 — *toPrimitive → toString → toStringTag*
- 👤 ボタンで @if を true
  - `ɵɵforeignContent(0, 0)` — instructions/foreign\_component.ts — *CONTENT\_ADAPTER・ON\_DESTROY・GET\_CONTEXT を読む（第 4 回）*
  - `ɵɵforeignComponent(1, 0, () => ({label, children}))` — instructions/foreign\_component.ts — *作成の回は読まない（第 3 回）*
    - `foreignComponent[RENDER](props, context)` — ビューの effect の中 — *RENDER を読んで呼ぶ*

## テストと直し方

### spec と it

| ファイル | describe / it | 行 | この章のどこ |
| --- | --- | --- | --- |
| acceptance/foreign\_component/foreign\_component\_spec.ts | `foreign components` の 31 個の it（先頭の `frameworkImport` を全部が使う） | 30〜36（橋）、46〜 | 1 節 |
| acceptance/foreign\_component/foreign\_component\_context\_spec.ts | `foreign component context` の 5 個の it | 65〜 | 第 4 回 |
| render3/foreign\_component\_spec.ts | `ɵɵforeignComponent` の 9 個の it | 27〜 | 第 3 回 |
| render3/foreign\_view\_spec.ts | `foreign views` の 4 個の it | 54〜 | 第 2 回 |
| render3/ivy/jit\_spec.ts | `render3 jit` › `foreign components` の 2 個の it | 551〜595 | 第 3 回 |

契約の形（4 つのキー）を直接確かめる it はありません。どの spec も、それぞれの先頭で自分の橋を作っています。acceptance の `frameworkImport`（30〜36 行目）、render3 の spec の `noopOnDestroy` と `eagerContentAdapter`、jit\_spec の `fooImport` の 3 種類です。

### 手元で走らせた結果

../angular で `pnpm bazel test <target> --nocache_test_results --test_output=all` を走らせました（2026-11-15）。`//packages/core/test/acceptance/foreign_component:foreign_component` は「36 specs, 0 failures」（2 つの spec ファイルの合計）。`//packages/core/test/render3:render3` に `--test_arg=--filter="^ɵɵforeignComponent "` を付けると「9 specs, 0 failures」、`"^foreign views "` では「4 specs, 0 failures」。`//packages/core/test/render3/ivy:ivy` に `"foreign components"` では「2 specs, 0 failures」でした。

### 直すとしたら

- 契約にキーを足す・変えるときは、`interface/foreign_component.ts`（型と Symbol）と `render3/foreign_import.ts`（4 つを詰める関数）を一緒に直し、上の 3 種類の橋を全部そろえる必要があります。どれか 1 つでも古いままだと、その spec のファイルだけが別の契約で動きます。
- npm に出すかどうかは core.ts の `// g3-only` の行と、directives.ts の `@internal // 3p-only` で決まっています。公開に変えるなら、この印を外すと同時に goldens/public-api/core の golden が変わります。
- 4 節の「文字列にできること」は、どの spec も確かめていません。`foreignImport` が普通のオブジェクトを返す限り問題になりませんが、契約を満たす別の作り方（Proxy や `Object.create(null)`）では 739 行目で止まります。確かめるなら、render3 の spec に `Object.create(null)` で作った部品を `consts` に入れる it を足す形です。

## 聞かれそうな質問

**Q. 普通のアプリ（npm の @angular/core）で foreignImports を使えますか？**

使える形では出ていません。`foreignImport` と `ForeignComponent` は core.ts の 116・79 行目でコメント（`// g3-only`）で、型の `foreignImports` は `@internal` で落ちています。`RENDER` などのキーは `Symbol('RENDER')` なので、外から同じキーを作れません。この章のデモは、キーを Proxy で受けるという、本家が想定していない形で中を覗いているだけです。

**Q. g3-only の行は、誰がいつコメントを外すのですか？**

google-markers.md の 59 行目のとおり、google3 に取り込む同期のツールが外します。そのツールは公開のリポジトリにはありません（`git grep` で見つかるのは印と文書だけ）。4f9ee3c056a の本文によれば、それまではファイルごとの差分を同期のたびに当てていて、それを印に置き換えました。

**Q. デモの Proxy に、ボタンを押す前から toString が来るのはなぜですか？**

`ɵɵdefineComponent` の 381 行目が `getComponentId` を呼び、694・710 行目で `consts` の配列をハッシュの材料にし、739 行目で `join('|')` するからです。`consts` には外の部品のオブジェクトが入っている（node.ts 240 行目）ので、文字列に変える途中で `Symbol.toPrimitive`・`toString`・`Symbol.toStringTag` が読まれます。

**Q. 22.1.6 と 22.2.6 で、外の部品を描く時機は違いますか？**

違いません。34817da7354（22.2.0-next.5）と同じ差分の 60f8a785fd2 が v22.1.5 に入っていて（patch-id が一致）、22.1.6 の d.ts でも `ɵɵforeignComponent` の 3 番目の引数は `(() => any) | null` です。作成の回に描いていたのは 22.1.4 までで、[第 3 回](03-fgn-instruction.md)で 3 つの版を並べます。

**Q. 型の ForeignComponent が d.ts の中にあるのに、import できないのはなぜですか？**

`TConstants`（node.ts 240 行目）の要素の型として参照されているので、束ねた d.ts の塊に宣言が入っています。しかし export の一覧には無いので、名前で import できません。記録の `types/_debug_node-chunk.d.ts:1128` の `interface ForeignComponent` には `export` が付いていません。

## 読み終えて

- npm に出ているのは命令の 3 つ（`ɵɵforeignComponent` など）だけ。`foreignImport`・`ForeignComponent`・`provideForeignRootContext` は core.ts の `// g3-only` のコメント
- `// 3p-only` は「google3 では行を消す」、`// g3-only` は「google3 ではコメントを外す」。`@internal // 3p-only` は、google3 だけで `foreignImports` を型に出す
- 外の部品のオブジェクトは `consts` に入るので、`getComponentId` の `join` で文字列にされる。契約の外の、暗の約束
- core の中身は 2026 年 6 月 3〜8 日にそろい、22.2 の 3 つの修正も 22.1.4・22.1.5 に入った。22.1.6 と 22.2.6 の命令は同じ形

---

← 前: [spec と issue を読む：動的コンポーネントを固めているテスト](../dyn/06-dyn-tests-issues.md)  
次: [foreign view：head と tail のコメントで囲むビュー](02-fgn-foreign-view.md) →
