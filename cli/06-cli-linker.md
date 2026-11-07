[目次](../README.md) › [CLI とビルド](README.md) › 第 6 回 / 全 16 回

# リンカー：部分コンパイルのライブラリを、アプリのビルドで仕上げる

> ライブラリは ɵɵngDeclareComponent などの部分コンパイル（partial）で配布され、アプリのビルドでリンカーが完全な ɵcmp に変える。JavaScriptTransformer がリンクが要るファイルを見分ける行、OxcLinker が宣言の呼び出しを見つけて @angular/compiler-cli/linker の FileLinker に渡し、文字列の AST で置き換える行。なぜライブラリは full で配布しないのか。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cli-linker)

---

npm の `@angular/router` を開くと、`RouterOutlet` の定義は `ɵɵdefineDirective(...)` ではなく `ɵɵngDeclareDirective({ minVersion, version, … })` という**宣言**になっています。これが部分コンパイル（partial）の出力で、アプリのビルドの中でリンカーが完全な定義に書き換えます。この章では、ライブラリが partial で出力される所から、CLI がリンクの要るファイルを見分け、`OxcLinker` が宣言の呼び出しを見つけて `@angular/compiler-cli/linker` の `FileLinker` に渡し、返った文字列で呼び出しを置き換えるまでを追います。

読む対象は angular-cli の `tools/angular/linker/oxc-linker.ts`・`oxc-ast-host.ts`・`string-ast-factory.ts`・`tools/esbuild/javascript-transformer.ts`・`-worker.ts`・`tools/oxc/oxc-transform.ts`、Angular 本体の `compiler-cli/linker/src/file_linker/`（`file_linker.ts`・`partial_linkers/partial_linker_selector.ts`・`partial_component_linker_1.ts`）と、部分コンパイルの出力例（compliance テストの `GOLDEN_PARTIAL.js`）です。

1. [1. 概観](01-cli-overview.md)
2. [2. ng build の段取り](02-build.md)
3. [3. AotCompilation](03-cli-angular-compilation.md)
4. [4. コンポーネントのスタイル](04-cli-component-styles.md)
5. [5. oxc の変換](05-cli-javascript-transformer.md)
6. **6. リンカー**（この章）
7. [7. 遅延チャンク](07-cli-code-splitting.md)
8. [8. budgets](08-cli-budgets.md)
9. [9. i18n](09-cli-i18n.md)
10. [10. 再ビルドとキャッシュ](10-cli-cache-watch.md)
11. [11. HMR](11-cli-hmr.md)
12. [12. unit-test と Vitest](12-cli-unit-test.md)
13. [13. Tree と sink](13-schematics.md)
14. [14. Rule の組み立て](14-schematics-rules.md)
15. [15. ng generate component](15-schematics-component.md)
16. [16. ng add と ng update](16-cli-add-update.md)

## 0. 全体の流れ

1. **ライブラリを partial でビルド**

   `ng build my-lib`（ng-packagr）が `compilationMode: "partial"` で `ɵɵngDeclare*` を出力する（1 節）。
2. **npm に載る**

   宣言には `minVersion` と `version`、テンプレートの**ソースの文字列**がそのまま入る。
3. **アプリのビルドで見分ける**

   `JavaScriptTransformer` が中身に `ɵɵngDeclare` があるファイルだけをワーカーに送る（2 節）。
4. **OxcLinker が呼び出しを見つける**

   oxc の木の走査で、宣言の関数を呼ぶ式を見つける（3 節）。
5. **FileLinker が完全な定義を作る**

   バージョンに合う部分リンカーを選び、テンプレートを**アプリの**コンパイラで解析して `ɵɵdefineComponent` 相当の式を作る（4〜5 節）。
6. **文字列で置き換える**

   `StringAstFactory` がその式を JavaScript の文字列にし、`MagicString` で元の呼び出しを上書きする（6 節）。

## 1. 部分コンパイルの出力

| `compilationMode` | 出力 | どこで使うか |
| --- | --- | --- |
| `full`（既定） | `ɵɵdefineComponent` とテンプレート関数（命令の列）。依存は解析済み | アプリのビルド（`@angular/build:application`）。`@angular/core` 自身もこれで配布される |
| `partial` | `ɵɵngDeclare*` の呼び出し。引数はメタデータの値と、テンプレートのソースの文字列 | npm に配るライブラリ。アプリのビルドでリンクされる |
| `experimental-local` | ファイル単体の情報だけで作った定義。依存は実行時に解決 | 大きなリポジトリの開発時の高速な再ビルド（[ローカルコンパイルの章](../standalone/06-standalone-local-compilation.md)） |

📄 `angular-cli/packages/schematics/angular/library/index.ts` L104–109 （▶ の行: 106–107）

```ts
104 │       targets: {
105 │         build: {
106 ▶           builder: Builders.BuildNgPackagr,
107 ▶           defaultConfiguration: 'production',
108 │           configurations: {
109 │             production: {
```

📄 `angular-cli/packages/schematics/angular/library/files/tsconfig.lib.prod.json.template` L3–11 （▶ の行: 9）

```
 3 │ {
 4 │   "extends": "./tsconfig.lib.json",
 5 │   "compilerOptions": {
 6 │     "declarationMap": false
 7 │   },
 8 │   "angularCompilerOptions": {
 9 ▶     "compilationMode": "partial"
10 │   }
11 │ }
```

`ng generate library` が作るライブラリは、106 行目の ng-packagr の builder で、107 行目のとおり既定で production 構成でビルドされます。production 構成が指す `tsconfig.lib.prod.json` の中身が下で、9 行目が `compilationMode: "partial"` です。コンパイラはこのモードのとき、各ハンドラーの `compilePartial` を呼びます（モードによる分岐は[コンパイラの入口の章](../compiler/02-compiler-entry.md)）。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1653–1689 （▶ の行: 1661–1662, 1664, 1680, 1682, 1685）

```ts
1653 │   compilePartial(
1654 │     node: ClassDeclaration,
1655 │     analysis: Readonly<ComponentAnalysisData>,
1656 │     resolution: Readonly<ComponentResolutionData>,
1657 │   ): CompileResult[] {
1658 │     if (analysis.template.errors !== null && analysis.template.errors.length > 0) {
1659 │       return [];
1660 │     }
1661 ▶     const templateInfo: DeclareComponentTemplateInfo = {
1662 ▶       content: analysis.template.content,
1663 │       sourceUrl: analysis.template.declaration.resolvedTemplateUrl,
1664 ▶       isInline: analysis.template.declaration.isInline,
1665 │       inlineTemplateLiteralExpression:
1666 │         analysis.template.sourceMapping.type === 'direct'
1667 │           ? new o.WrappedNodeExpr(analysis.template.sourceMapping.node)
1668 │           : null,
1669 │     };
1670 │ 
1671 │     const perComponentDeferredDeps = this.canDeferDeps
1672 │       ? this.resolveAllDeferredDependencies(resolution)
1673 │       : null;
1674 │     const defer = this.compileDeferBlocks(resolution);
1675 │     const meta: R3ComponentMetadata<R3TemplateDependencyMetadata> = {
1676 │       ...analysis.meta,
1677 │       ...resolution,
1678 │       defer,
1679 │     };
1680 ▶     const fac = compileDeclareFactory(toFactoryMetadata(meta, FactoryTarget.Component));
1681 │     const inputTransformFields = compileInputTransformFields(analysis.inputs);
1682 ▶     const def = compileDeclareComponentFromMetadata(meta, analysis.template, templateInfo);
1683 │     const classMetadata =
1684 │       analysis.classMetadata !== null
1685 ▶         ? compileComponentDeclareClassMetadata(
1686 │             analysis.classMetadata,
1687 │             perComponentDeferredDeps,
1688 │           ).toStmt()
1689 │         : null;
```

1661〜1669 行目、テンプレートは解析結果ではなく**ソースの文字列**（`content`）とその在りかとして持ちます。1680・1682・1685 行目で、factory・定義・クラスのメタデータの 3 つを、それぞれ `compileDeclare…` で宣言の形にします。結果はこうなります。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_compiler_compliance/components_and_directives/standalone/GOLDEN_PARTIAL.js` L4–27 （▶ の行: 5, 7–8, 10, 19）

```js
 4 │ import { Component } from '@angular/core';
 5 ▶ import * as i0 from "@angular/core";
 6 │ export class OtherCmp {
 7 ▶     static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "0.0.0-PLACEHOLDER", ngImport: i0, type: OtherCmp, deps: [], target: i0.ɵɵFactoryTarget.Component });
 8 ▶     static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "0.0.0-PLACEHOLDER", type: OtherCmp, isStandalone: true, selector: "other-cmp", ngImport: i0, template: '', isInline: true });
 9 │ }
10 ▶ i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "0.0.0-PLACEHOLDER", ngImport: i0, type: OtherCmp, decorators: [{
11 │             type: Component,
12 │             args: [{
13 │                     selector: 'other-cmp',
14 │                     template: '',
15 │                 }]
16 │         }] });
17 │ export class StandaloneCmp {
18 │     static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "0.0.0-PLACEHOLDER", ngImport: i0, type: StandaloneCmp, deps: [], target: i0.ɵɵFactoryTarget.Component });
19 ▶     static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "0.0.0-PLACEHOLDER", type: StandaloneCmp, isStandalone: true, selector: "ng-component", ngImport: i0, template: '<other-cmp></other-cmp>', isInline: true, dependencies: [{ kind: "component", type: OtherCmp, selector: "other-cmp" }] });
20 │ }
21 │ i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "0.0.0-PLACEHOLDER", ngImport: i0, type: StandaloneCmp, decorators: [{
22 │             type: Component,
23 │             args: [{
24 │                     template: '<other-cmp></other-cmp>',
25 │                     imports: [OtherCmp],
26 │                 }]
27 │         }] });
```

1. **7〜8 行目：宣言の呼び出し**

   `static ɵcmp` の値が `i0.ɵɵngDeclareComponent({…})` です。`minVersion` は「この宣言を読めるリンカーの最低のバージョン」、`version` は「この宣言を出力したコンパイラのバージョン」。テストでは `0.0.0-PLACEHOLDER` ですが、npm のパッケージでは実際の値（このサイトの `@angular/router` なら `"22.1.6"`）が入ります。
2. **8・19 行目：テンプレートは文字列のまま**

   `template: '<other-cmp></other-cmp>'` はソースの文字列です。full の出力なら、ここが `ɵɵelement(0, "other-cmp")` を呼ぶテンプレート関数になります（同じ入力の full の出力は[standalone の章](../standalone/01-standalone.md)）。
3. **5 行目：ngImport**

   宣言の引数の `ngImport: i0` は、リンク後のコードが `ɵɵdefineComponent` などを参照するための `@angular/core` の名前空間です。
4. **10〜16 行目：メタデータも宣言**

   リンクすると `ɵsetClassMetadata` の呼び出しになり、本番では[第 5 回](05-cli-javascript-transformer.md)の 8 節で消えます。

## 2. リンクが要るファイルを見分ける

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer.ts` L88–111 （▶ の行: 96–99, 103, 110）

```ts
 88 │ /**
 89 │  * Determines whether JavaScript code requires Angular linker processing.
 90 │  *
 91 │  * @param path The full path to the file.
 92 │  * @param data The data (string or Buffer) of the file.
 93 │  * @returns True if the code contains an Angular partial declaration; otherwise false.
 94 │  */
 95 │ function requiresLinking(path: string, data: string | Uint8Array): boolean {
 96 ▶   // @angular/core and @angular/compiler will cause false positives
 97 ▶   // Also, TypeScript files do not require linking
 98 ▶   if (/[\\/]@angular[\\/](?:compiler|core)[\\/]|\.[cm]?tsx?$/.test(path)) {
 99 ▶     return false;
100 │   }
101 │ 
102 │   if (typeof data === 'string') {
103 ▶     return data.includes(LINKER_DECLARATION_PREFIX);
104 │   }
105 │ 
106 │   const dataBuffer = Buffer.isBuffer(data)
107 │     ? data
108 │     : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
109 │ 
110 ▶   return dataBuffer.includes(LINKER_DECLARATION_PREFIX_BYTES);
111 │ }
```

判定は文字列の検索だけです。103・110 行目、中身に定数 `LINKER_DECLARATION_PREFIX`（`'ɵɵngDeclare'`）が含まれるか。木は作りません。98 行目、`@angular/core` と `@angular/compiler` は除外します。`@angular/core` は宣言の関数を**定義する側**なので名前が中に出てきますが、自分自身は full で配布されていて、リンクするものがありません。TypeScript のファイル（アプリのソース）も除外です。この結果がワーカーへの依頼の `skipLinker` になります（[第 5 回](05-cli-javascript-transformer.md)の 2 節 277 行目）。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/javascript-transformer-worker.ts` L182–220 （▶ の行: 182–184, 191, 200, 209）

```ts
182 ▶   if (shouldLink && useBabelLinker) {
183 ▶     babelLinkerDeps ??= Promise.all([
184 ▶       import('@angular/compiler-cli/linker/babel'),
185 │       import('@angular/compiler-cli'),
186 │       import('@babel/core'),
187 │     ]);
188 │     const [{ createEs2015LinkerPlugin }, { ConsoleLogger, LogLevel }, { transformAsync }] =
189 │       await babelLinkerDeps;
190 │ 
191 ▶     const result = await transformAsync(code, {
192 │       filename,
193 │       inputSourceMap: false,
194 │       sourceMaps: !!useInputSourcemap,
195 │       compact: false,
196 │       configFile: false,
197 │       babelrc: false,
198 │       browserslistConfigFile: false,
199 │       plugins: [
200 ▶         createEs2015LinkerPlugin({
201 │           fileSystem: {
202 │             exists: () => false,
203 │             readFile: () => '',
204 │             resolve: (...paths: string[]) => paths.join('/'),
205 │             dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
206 │             relative: (_from: string, to: string) => to,
207 │           } as never,
208 │           logger: new ConsoleLogger(LogLevel.info),
209 ▶           linkerJitMode: jit,
210 │           // This is a workaround until https://github.com/angular/angular/issues/42769 is fixed.
211 │           sourceMapping: false,
212 │         }) as PluginItem,
213 │       ],
214 │     });
215 │ 
216 │     code = result?.code ?? code;
217 │     if (result?.map) {
218 │       maps.push(result.map as EncodedSourceMap);
219 │     }
220 │   }
```

ワーカーの中で、`NG_BUILD_BABEL_LINKER=1` なら 182〜220 行目で Babel のリンカー（`createEs2015LinkerPlugin`）を走らせます。184〜186 行目、Babel はこのときに初めて読み込みます。そうでなければ、第 5 回の 3 節 223 行目の `oxcLink` が真になり、4 つの最適化と同じ 1 回の走査の中でリンクします。

## 3. OxcLinker が宣言の呼び出しを見つける

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L263–268 （▶ の行: 264, 267–268）

```ts
263 │ export function transform(filename: string, code: string, options: OxcTransformOptions) {
264 ▶   const { program } = parseSync(filename, code, { range: true });
265 │   const source = new MagicString(code);
266 │ 
267 ▶   const shouldLink = options.link && needsLinking(filename, code);
268 ▶   const linker = shouldLink ? new OxcLinker(filename, code, options.jit) : undefined;
```

📄 `angular/packages/compiler-cli/linker/src/file_linker/needs_linking.ts` L11–28 （▶ の行: 18–19, 27）

```ts
11 │ /**
12 │  * Determines if the provided source file may need to be processed by the linker, i.e. whether it
13 │  * potentially contains any declarations. If true is returned, then the source file should be
14 │  * processed by the linker as it may contain declarations that need to be fully compiled. If false
15 │  * is returned, parsing and processing of the source file can safely be skipped to improve
16 │  * performance.
17 │  *
18 ▶  * This function may return true even for source files that don't actually contain any declarations
19 ▶  * that need to be compiled.
20 │  *
21 │  * @param path the absolute path of the source file for which to determine whether linking may be
22 │  * needed.
23 │  * @param source the source file content as a string.
24 │  * @returns whether the source file may contain declarations that need to be linked.
25 │  */
26 │ export function needsLinking(path: string, source: string): boolean {
27 ▶   return declarationFunctions.some((fn) => source.includes(fn));
28 │ }
```

📄 `angular/packages/compiler-cli/linker/src/file_linker/partial_linkers/partial_linker_selector.ts` L28–49 （▶ の行: 28, 30–31, 38）

```ts
28 ▶ export const ɵɵngDeclareDirective = 'ɵɵngDeclareDirective';
29 │ export const ɵɵngDeclareClassMetadata = 'ɵɵngDeclareClassMetadata';
30 ▶ export const ɵɵngDeclareComponent = 'ɵɵngDeclareComponent';
31 ▶ export const ɵɵngDeclareFactory = 'ɵɵngDeclareFactory';
32 │ export const ɵɵngDeclareInjectable = 'ɵɵngDeclareInjectable';
33 │ export const ɵɵngDeclareInjector = 'ɵɵngDeclareInjector';
34 │ export const ɵɵngDeclareNgModule = 'ɵɵngDeclareNgModule';
35 │ export const ɵɵngDeclarePipe = 'ɵɵngDeclarePipe';
36 │ export const ɵɵngDeclareClassMetadataAsync = 'ɵɵngDeclareClassMetadataAsync';
37 │ export const ɵɵngDeclareService = 'ɵɵngDeclareService';
38 ▶ export const declarationFunctions = [
39 │   ɵɵngDeclareDirective,
40 │   ɵɵngDeclareClassMetadata,
41 │   ɵɵngDeclareComponent,
42 │   ɵɵngDeclareFactory,
43 │   ɵɵngDeclareInjectable,
44 │   ɵɵngDeclareInjector,
45 │   ɵɵngDeclareNgModule,
46 │   ɵɵngDeclarePipe,
47 │   ɵɵngDeclareClassMetadataAsync,
48 │   ɵɵngDeclareService,
49 │ ];
```

267 行目、Angular 本体の `needsLinking` でもう一度確かめます。27 行目、38〜49 行目の 10 個の関数名のどれかが中身にあるか、です。18〜19 行目のコメントのとおり、文字列としてあるだけでも真になりうる、速さ優先の判定です。真なら 268 行目でファイルごとに `OxcLinker` を 1 つ作ります。

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform.ts` L639–652 （▶ の行: 639–640, 644–648, 650）

```ts
639 ▶       case 'CallExpression': {
640 ▶         if (isAlreadyEdited(node.start, node.end)) {
641 │           return;
642 │         }
643 │ 
644 ▶         if (linker) {
645 ▶           const linkedCode = linker.linkCallExpression(node);
646 ▶           if (linkedCode !== undefined) {
647 ▶             source.overwrite(node.start, node.end, linkedCode);
648 ▶             markEdited(node.start, node.end);
649 │ 
650 ▶             return;
651 │           }
652 │         }
```

第 5 回で見た後順の走査で、呼び出し式（`CallExpression`）に出会うたびに 645 行目の `linkCallExpression` を試します。宣言なら、647 行目で**呼び出し式の範囲全体**をリンクの結果の文字列で上書きし、648 行目でその範囲を「書き換え済み」と記録して、650 行目で戻ります。640 行目、すでに書き換えた範囲の内側にある呼び出しは飛ばします。リンクの結果の文字列は、6 節のとおり元のソースから組み立てるので、同じ範囲に別の書き換えを重ねないための確認です。

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/oxc-linker.ts` L55–95 （▶ の行: 63–64, 67–69, 72, 82–83, 87–89, 91）

```ts
55 │ export class OxcLinker {
56 │   readonly #fileLinker: FileLinker<unknown, string, unknown, string | undefined>;
57 │ 
58 │   constructor(filename: string, code: string, jit = false) {
59 │     SHARED_LOGGER ??= new ConsoleLogger(LogLevel.info);
60 │     SHARED_AST_HOST ??= new OxcAstHost();
61 │     SHARED_DECLARATION_SCOPE ??= new InlineDeclarationScope();
62 │ 
63 ▶     const astFactory = new StringAstFactory(code);
64 ▶     const linkerEnvironment = LinkerEnvironment.create(
65 │       noopFileSystem,
66 │       SHARED_LOGGER,
67 ▶       SHARED_AST_HOST,
68 ▶       astFactory,
69 ▶       { linkerJitMode: jit, sourceMapping: false },
70 │     );
71 │ 
72 ▶     this.#fileLinker = new FileLinker(linkerEnvironment, filename as AbsoluteFsPath, code);
73 │   }
74 │ 
75 │   /**
76 │    * Attempts to link an Angular partial declaration CallExpression.
77 │    *
78 │    * @param node The CallExpression AST node to check and link.
79 │    * @returns The linked code string if the node is a partial declaration, or undefined otherwise.
80 │    */
81 │   linkCallExpression(node: CallExpression): string | undefined {
82 ▶     const calleeName = SHARED_AST_HOST.getSymbolName(node.callee);
83 ▶     if (!calleeName || !this.#fileLinker.isPartialDeclaration(calleeName)) {
84 │       return undefined;
85 │     }
86 │ 
87 ▶     const args = SHARED_AST_HOST.parseArguments(node);
88 ▶     const linkedCode = this.#fileLinker.linkPartialDeclaration(
89 ▶       calleeName,
90 │       args,
91 ▶       SHARED_DECLARATION_SCOPE,
92 │     );
93 │ 
94 │     return linkedCode as string;
95 │   }
```

1. **63〜72 行目：FileLinker の環境を組む**

   `LinkerEnvironment` は「木を読む係（`AstHost`）」と「式を作る係（`AstFactory`）」の組です。Babel のリンカーなら Babel の木と Babel の節点の工場ですが、ここでは 67 行目の `OxcAstHost`（oxc の木を読む）と 68 行目の `StringAstFactory`（**文字列**を作る）を渡します。`FileLinker` 自体は Angular 本体のもので、どちらの組でも同じコードが動きます。
2. **82〜85 行目：呼び出し先の名前で振り分け**

   `getSymbolName` で `i0.ɵɵngDeclareComponent` から `ɵɵngDeclareComponent` を取り出し、83 行目でリンカーが対応する名前か確かめます。
3. **87〜94 行目：引数を渡してリンク**

   引数の oxc の節点の配列と、91 行目の宣言のスコープ（下）を渡し、返ってきた**文字列**を返します。

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/oxc-ast-host.ts` L32–47 （▶ の行: 38–42）

```ts
32 │ export class OxcAstHost implements AstHost<unknown> {
33 │   getSymbolName(node: unknown): string | null {
34 │     if (!isNode(node)) {
35 │       return null;
36 │     }
37 │ 
38 ▶     if (node.type === 'Identifier') {
39 ▶       return node.name;
40 ▶     } else if (node.type === 'MemberExpression') {
41 ▶       if (!node.computed && node.property.type === 'Identifier') {
42 ▶         return node.property.name;
43 │       }
44 │     }
45 │ 
46 │     return null;
47 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/oxc-ast-host.ts` L280–296 （▶ の行: 290–292, 294）

```ts
280 │ function isMinifiedBooleanLiteral(
281 │   node: Node,
282 │ ): node is UnaryExpression & { argument: NumericLiteral } {
283 │   if (node.type !== 'UnaryExpression') {
284 │     return false;
285 │   }
286 │ 
287 │   const arg = node.argument;
288 │ 
289 │   return (
290 ▶     node.prefix === true &&
291 ▶     node.operator === '!' &&
292 ▶     arg.type === 'Literal' &&
293 │     typeof arg.value === 'number' &&
294 ▶     (arg.value === 0 || arg.value === 1)
295 │   );
296 │ }
```

`OxcAstHost` は、リンカーが「この節点は文字列か」「オブジェクトのキーと値は」と聞くのに、oxc の節点の `type` を見て答えます。280〜296 行目のように、minify 済みのライブラリの `!0`（true）・`!1`（false）も真偽値として読めます。

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/oxc-linker.ts` L19–46 （▶ の行: 20–22, 28–29, 35–36, 41–42）

```ts
19 │ /**
20 ▶  * A declaration scope that instructs the Angular compiler to emit constant pools
21 ▶  * inside a local IIFE around each linked declaration rather than hoisting shared
22 ▶  * constants to the module level.
23 │  *
24 │  * Preferred due to:
25 │  * - In-Place String Replacement: Enables fast in-place string replacements in
26 │  *   `MagicString` without parsing or mutating surrounding ES module statements.
27 │  * - Better Tree-Shaking Locality: Component constants are strictly encapsulated
28 ▶  *   within the component's `@__PURE__` IIFE closure (`(function() { ... })()`). If a
29 ▶  *   bundler tree-shakes an unused component from a library FESM, all of its associated
30 │  *   constants are automatically eliminated without leaving orphan top-level variables.
31 │  * - Negligible Wire Size Impact: LZ77/Brotli compression deduplicates repeated IIFE
32 │  *   wrappers and array literals over the wire to near-zero marginal cost.
33 │  */
34 │ class InlineDeclarationScope implements DeclarationScope<unknown, unknown> {
35 ▶   getConstantScopeRef(): null {
36 ▶     return null;
37 │   }
38 │ }
39 │ 
40 │ const noopFileSystem: ReadonlyFileSystem = {
41 ▶   exists: () => false,
42 ▶   readFile: () => '',
43 │   resolve: (...paths: string[]) => paths.join('/'),
44 │   dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
45 │   relative: (_from: string, to: string) => to,
46 │ } as unknown as ReadonlyFileSystem;
```

35〜37 行目、定数をまとめて置く場所（スコープ）を `null` と答えます。するとリンカーは、テンプレートが使う定数（属性の配列など）をファイルの先頭に足すのではなく、その定義の IIFE の中に入れます（4 節の `LocalEmitScope`）。20〜32 行目のコメントのとおり、こうすると呼び出し式の範囲だけを文字列で置き換えれば済み、コンポーネントが木の揺さぶりで消えるときに定数も一緒に消えます。40〜46 行目、ファイルシステムは何もしない偽物です。リンカーが外部のテンプレートファイルやソースマップを読みに行かないようにしています（69 行目 `sourceMapping: false`）。

## 4. FileLinker：バージョンに合う部分リンカーを選ぶ

📄 `angular/packages/compiler-cli/linker/src/file_linker/file_linker.ts` L24–45 （▶ の行: 33–34, 36, 43–44）

```ts
24 │ export class FileLinker<TConstantScope, TStatement, TExpression, TType> {
25 │   private linkerSelector: PartialLinkerSelector<TExpression>;
26 │   private emitScopes = new Map<TConstantScope, EmitScope<TStatement, TExpression, TType>>();
27 │ 
28 │   constructor(
29 │     private linkerEnvironment: LinkerEnvironment<TStatement, TExpression, TType>,
30 │     sourceUrl: AbsoluteFsPath,
31 │     code: string,
32 │   ) {
33 ▶     this.linkerSelector = new PartialLinkerSelector<TExpression>(
34 ▶       createLinkerMap<TStatement, TExpression, TType>(this.linkerEnvironment, sourceUrl, code),
35 │       this.linkerEnvironment.logger,
36 ▶       this.linkerEnvironment.options.unknownDeclarationVersionHandling,
37 │     );
38 │   }
39 │ 
40 │   /**
41 │    * Return true if the given callee name matches a partial declaration that can be linked.
42 │    */
43 ▶   isPartialDeclaration(calleeName: string): boolean {
44 ▶     return this.linkerSelector.supportsDeclaration(calleeName);
45 │   }
```

📄 `angular/packages/compiler-cli/linker/src/file_linker/file_linker.ts` L59–83 （▶ の行: 64, 70, 74–75, 77–80, 82）

```ts
59 │   linkPartialDeclaration(
60 │     declarationFn: string,
61 │     args: TExpression[],
62 │     declarationScope: DeclarationScope<TConstantScope, TExpression>,
63 │   ): TExpression {
64 ▶     if (args.length !== 1) {
65 │       throw new Error(
66 │         `Invalid function call: It should have only a single object literal argument, but contained ${args.length}.`,
67 │       );
68 │     }
69 │ 
70 ▶     const metaObj = AstObject.parse<R3PartialDeclaration, TExpression>(
71 │       args[0],
72 │       this.linkerEnvironment.host,
73 │     );
74 ▶     const ngImport = metaObj.getNode('ngImport');
75 ▶     const emitScope = this.getEmitScope(ngImport, declarationScope);
76 │ 
77 ▶     const minVersion = metaObj.getString('minVersion');
78 ▶     const version = metaObj.getString('version');
79 ▶     const linker = this.linkerSelector.getLinker(declarationFn, minVersion, version);
80 ▶     const definition = linker.linkPartialDeclaration(emitScope.constantPool, metaObj, version);
81 │ 
82 ▶     return emitScope.translateDefinition(definition);
83 │   }
```

1. **64 行目：引数はオブジェクト 1 つ**

   宣言の呼び出しの引数は必ずメタデータのオブジェクト 1 つです。
2. **70 行目：AstHost で包む**

   `AstObject` は、`getString('version')` のように、木の節点をキーで読むための包みです。中で 3 節の `OxcAstHost` を呼びます。
3. **74〜75 行目：定数の置き場**

   下の `getEmitScope`。
4. **77〜79 行目：バージョンで部分リンカーを選ぶ**

   宣言の `minVersion` と `version` を読んで、`PartialLinkerSelector` に聞きます。
5. **80・82 行目：完全な定義を作り、翻訳する**

   部分リンカーが Angular のコンパイラの出力の木（`o.Expression`）を作り、82 行目でそれを `AstFactory` の言葉（ここでは文字列）に翻訳します。

📄 `angular/packages/compiler-cli/linker/src/file_linker/file_linker.ts` L98–110 （▶ の行: 102–103, 105）

```ts
 98 │   private getEmitScope(
 99 │     ngImport: TExpression,
100 │     declarationScope: DeclarationScope<TConstantScope, TExpression>,
101 │   ): EmitScope<TStatement, TExpression, TType> {
102 ▶     const constantScope = declarationScope.getConstantScopeRef(ngImport);
103 ▶     if (constantScope === null) {
104 │       // There is no constant scope so we will emit extra statements into the definition IIFE.
105 ▶       return new LocalEmitScope<TStatement, TExpression, TType>(
106 │         ngImport,
107 │         this.linkerEnvironment.translator,
108 │         this.linkerEnvironment.factory,
109 │       );
110 │     }
```

📄 `angular/packages/compiler-cli/linker/src/file_linker/emit_scopes/local_emit_scope.ts` L29–35 （▶ の行: 33）

```ts
29 │   override translateDefinition(definition: LinkedDefinition): TExpression {
30 │     // Treat statements from the ConstantPool as definition statements.
31 │     return super.translateDefinition({
32 │       expression: definition.expression,
33 ▶       statements: [...this.constantPool.statements, ...definition.statements],
34 │     });
35 │   }
```

3 節の `InlineDeclarationScope` が `null` を返すので、102〜109 行目で `LocalEmitScope` になります。33 行目、定数の文は定義の文と一緒にされ、定義を返す IIFE の中に入ります。

📄 `angular/packages/compiler-cli/linker/src/file_linker/partial_linkers/partial_linker_selector.ts` L80–106 （▶ の行: 86, 88–89, 97–100）

```ts
 80 │ export function createLinkerMap<TStatement, TExpression, TType>(
 81 │   environment: LinkerEnvironment<TStatement, TExpression, TType>,
 82 │   sourceUrl: AbsoluteFsPath,
 83 │   code: string,
 84 │ ): Map<string, LinkerRange<TExpression>[]> {
 85 │   const linkers = new Map<string, LinkerRange<TExpression>[]>();
 86 ▶   const LATEST_VERSION_RANGE = getRange('<=', PLACEHOLDER_VERSION);
 87 │ 
 88 ▶   linkers.set(ɵɵngDeclareDirective, [
 89 ▶     {range: LATEST_VERSION_RANGE, linker: new PartialDirectiveLinkerVersion1(sourceUrl, code)},
 90 │   ]);
 91 │   linkers.set(ɵɵngDeclareClassMetadataAsync, [
 92 │     {range: LATEST_VERSION_RANGE, linker: new PartialClassMetadataAsyncLinkerVersion1()},
 93 │   ]);
 94 │   linkers.set(ɵɵngDeclareClassMetadata, [
 95 │     {range: LATEST_VERSION_RANGE, linker: new PartialClassMetadataLinkerVersion1()},
 96 │   ]);
 97 ▶   linkers.set(ɵɵngDeclareComponent, [
 98 ▶     {
 99 ▶       range: LATEST_VERSION_RANGE,
100 ▶       linker: new PartialComponentLinkerVersion1(
101 │         createGetSourceFile(sourceUrl, code, environment.sourceFileLoader),
102 │         sourceUrl,
103 │         code,
104 │       ),
105 │     },
106 │   ]);
```

📄 `angular/packages/compiler-cli/linker/src/file_linker/partial_linkers/partial_linker_selector.ts` L165–197 （▶ の行: 171, 174, 177–180, 184, 189, 191, 196）

```ts
165 │   getLinker(functionName: string, minVersion: string, version: string): PartialLinker<TExpression> {
166 │     if (!this.linkers.has(functionName)) {
167 │       throw new Error(`Unknown partial declaration function ${functionName}.`);
168 │     }
169 │     const linkerRanges = this.linkers.get(functionName)!;
170 │ 
171 ▶     if (version === PLACEHOLDER_VERSION) {
172 │       // Special case if the `version` is the same as the current compiler version.
173 │       // This helps with compliance tests where the version placeholders have not been replaced.
174 ▶       return linkerRanges[linkerRanges.length - 1].linker;
175 │     }
176 │ 
177 ▶     const declarationRange = getRange('>=', minVersion);
178 ▶     for (const {range: linkerRange, linker} of linkerRanges) {
179 ▶       if (semver.intersects(declarationRange, linkerRange)) {
180 ▶         return linker;
181 │       }
182 │     }
183 │ 
184 ▶     const message =
185 │       `This application depends upon a library published using Angular version ${version}, ` +
186 │       `which requires Angular version ${minVersion} or newer to work correctly.\n` +
187 │       `Consider upgrading your application to use a more recent version of Angular.`;
188 │ 
189 ▶     if (this.unknownDeclarationVersionHandling === 'error') {
190 │       throw new Error(message);
191 ▶     } else if (this.unknownDeclarationVersionHandling === 'warn') {
192 │       this.logger.warn(`${message}\nAttempting to continue using this version of Angular.`);
193 │     }
194 │ 
195 │     // No linker was matched for this declaration, so just use the most recent one.
196 ▶     return linkerRanges[linkerRanges.length - 1].linker;
197 │   }
```

1. **86 行目：このリンカーが読める範囲**

   `LATEST_VERSION_RANGE` は「`<=` このリンカー自身のバージョン」です。ソースでは `0.0.0-PLACEHOLDER` ですが、npm に載る `@angular/compiler-cli` では実際の値に置き換わっています（このサイトの node\_modules では `"22.1.6"`）。
2. **177〜182 行目：minVersion と範囲が交わるか**

   宣言の「`>=` minVersion」とリンカーの範囲が交われば、そのリンカーを使います。いまはどの宣言にもリンカーが 1 つ（Version1）しか無いので、交われば必ずそれです。
3. **184〜196 行目：新しすぎるライブラリ**

   ライブラリの `minVersion` がアプリのリンカーより新しいと交わりません。184〜187 行目の「このアプリは Angular `version` で公開されたライブラリに依存していて、それには `minVersion` 以上が必要」という文を、設定に応じてエラー（189 行目）か警告（191 行目）にし、196 行目で最新のリンカーで続行します。

## 5. 部分リンカーの中：アプリのコンパイラで仕上げる

📄 `angular/packages/compiler-cli/linker/src/file_linker/partial_linkers/partial_component_linker_1.ts` L93–122 （▶ の行: 97, 99–100, 104–107, 109, 118–119）

```ts
 93 │   private toR3ComponentMeta(
 94 │     metaObj: AstObject<R3DeclareComponentMetadata, TExpression>,
 95 │     version: string,
 96 │   ): R3ComponentMetadata<R3TemplateDependencyMetadata> {
 97 ▶     const templateSource = metaObj.getValue('template');
 98 │     const isInline = metaObj.has('isInline') ? metaObj.getBoolean('isInline') : false;
 99 ▶     const templateInfo = this.getTemplateInfo(templateSource, isInline);
100 ▶     const {major, minor} = new semver.SemVer(version);
101 │ 
102 │     // Enable the new block syntax if compiled with v17 and
103 │     // above, or when using the local placeholder version.
104 ▶     const enableBlockSyntax = major >= 17 || version === PLACEHOLDER_VERSION;
105 ▶     const enableLetSyntax =
106 ▶       major > 18 || (major === 18 && minor >= 1) || version === PLACEHOLDER_VERSION;
107 ▶     const hasOnPushByDefault = major >= 22 || version === PLACEHOLDER_VERSION;
108 │ 
109 ▶     const template = parseTemplate(templateInfo.code, templateInfo.sourceUrl, {
110 │       escapedString: templateInfo.isEscaped,
111 │       range: templateInfo.range,
112 │       enableI18nLegacyMessageIdFormat: false,
113 │       preserveWhitespaces: metaObj.has('preserveWhitespaces')
114 │         ? metaObj.getBoolean('preserveWhitespaces')
115 │         : false,
116 │       // We normalize line endings if the template is was inline.
117 │       i18nNormalizeLineEndingsInICUs: isInline,
118 ▶       enableBlockSyntax,
119 ▶       enableLetSyntax,
120 │       // TODO(crisbeto): figure out how this is enabled.
121 │       enableSelectorless: false,
122 │     });
```

`ɵɵngDeclareComponent` の部分リンカーは、宣言のメタデータを `R3ComponentMetadata`（full のコンパイルが使うのと同じ入力）に戻し、最後に `compileComponentFromMetadata` を呼びます（その呼び出しは[コンパイラの概観](../compiler/01-compiler.md)で引用済み）。109 行目、テンプレートは**ここで初めて解析**されます。解析するのはアプリが入れている `@angular/compiler` です。そのとき 100〜107 行目で、宣言の `version`（ライブラリをビルドしたコンパイラのバージョン）を見て構文を切り替えます。v17 より前のライブラリでは `@if` などのブロック構文を有効にせず（104 行目）、`@let` は 18.1 以上（105〜106 行目）、107 行目、`changeDetection` を書いていないコンポーネントの既定は v22 以上なら `OnPush`、それより前のライブラリなら従来の既定（`Eager`）です。ライブラリを書いた時点の意味が、新しいアプリでも保たれます。

## 6. 式を文字列にする：StringAstFactory

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/string-ast-factory.ts` L29–54 （▶ の行: 34–35, 37–40, 42, 44）

```ts
29 │ export class StringAstFactory implements AstFactory<string, unknown, string> {
30 │   constructor(private readonly sourceCode: string = '') {}
31 │ 
32 │   private render(expr: unknown): string {
33 │     let rendered: string;
34 ▶     if (typeof expr === 'string') {
35 ▶       rendered = expr;
36 │     } else if (
37 ▶       typeof expr === 'object' &&
38 ▶       expr !== null &&
39 ▶       typeof (expr as { start?: number; end?: number }).start === 'number' &&
40 ▶       typeof (expr as { end?: number }).end === 'number'
41 │     ) {
42 ▶       const { start, end } = expr as { start: number; end: number };
43 │ 
44 ▶       rendered = this.sourceCode.slice(start, end);
45 │     } else {
46 │       rendered = String(expr);
47 │     }
48 │ 
49 │     if (rendered.startsWith(OBJECT_LITERAL_PREFIX)) {
50 │       return rendered.slice(OBJECT_LITERAL_PREFIX.length);
51 │     }
52 │ 
53 │     return rendered;
54 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/string-ast-factory.ts` L134–145 （▶ の行: 135, 137）

```ts
134 │   createCallExpression(callee: unknown, args: unknown[], pure: boolean): string {
135 ▶     const annotation = pure ? '/*@__PURE__*/ ' : '';
136 │ 
137 ▶     return `${annotation}${this.wrapReceiver(callee)}(${args.map((a) => this.render(a)).join(', ')})`;
138 │   }
139 │ 
140 │   createCallChain(callee: unknown, args: unknown[], pure: boolean, isOptional: boolean): string {
141 │     const annotation = pure ? '/*@__PURE__*/ ' : '';
142 │     const operator = isOptional ? '?.' : '';
143 │ 
144 │     return `${annotation}${this.wrapReceiver(callee)}${operator}(${args.map((a) => this.render(a)).join(', ')})`;
145 │   }
```

Babel のリンカーは Babel の節点を作り、Babel がコードを生成します。`StringAstFactory` は節点を作らず、**最初から文字列**を組み立てます。32〜47 行目の `render` が要で、すでに文字列ならそのまま、oxc の節点（`start`・`end` を持つ）なら 44 行目で**元のソースの同じ範囲を切り出し**ます。宣言の引数の `type: RouterOutlet` や `providers: [...]` のような式は、解析も再生成もされず、元の文字列のまま新しい定義に埋め込まれます。135 行目、純粋な呼び出し（`ɵɵdefineComponent(...)` など）には `/*@__PURE__*/` を付けます。これで、リンクした定義も第 5 回と同じく esbuild が消せる形になります。

> **🧪 DEMO — このサイトの本番の JS で、リンク済みかを数える**
>
> npm の `@angular/router`（このサイトの node\_modules）の `RouterOutlet` は `static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "17.1.0", version: "22.1.6", type: RouterOutlet, selector: "router-outlet", inputs: { name: { classPropertyName: "name", … } }, … })` です。ボタンを押すと、このページが読んだ JS を取得し、宣言の形（`minVersion:"…",version:` の空白なしの並び）と、リンク済みの定義（`static ɵcmp=` / `static ɵdir=` / `static ɵpipe=`）を数え、`router-outlet` の定義の先頭を切り出します。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/cli-linker)

## 呼び出しの連なり

- 👤 `ng build my-lib` — ng-packagr + tsconfig.lib.prod.json — *compilationMode: partial*
  - `ComponentDecoratorHandler.compilePartial()` — ngtsc annotations/component/src/handler.ts L1653 — *ɵɵngDeclareComponent*
- `ng build`（アプリ） — compiler-plugin.ts onLoad(.mjs)
  - `JavaScriptTransformer.transformData() → requiresLinking()` — tools/esbuild/javascript-transformer.ts L95
    - `transformWithOxc() → needsLinking() → new OxcLinker()` — tools/oxc/oxc-transform.ts L267
      - `CallExpression → OxcLinker.linkCallExpression()` — tools/angular/linker/oxc-linker.ts L81
        - `FileLinker.linkPartialDeclaration()` — compiler-cli/linker/src/file\_linker/file\_linker.ts L59
          - `PartialLinkerSelector.getLinker(fn, minVersion, version)` — partial\_linker\_selector.ts L165
          - `PartialComponentLinkerVersion1 → parseTemplate → compileComponentFromMetadata` — partial\_component\_linker\_1.ts L81
          - `LocalEmitScope.translateDefinition() → StringAstFactory` — emit\_scopes/local\_emit\_scope.ts L29
      - `source.overwrite(node.start, node.end, linkedCode)` — oxc-transform.ts L647

## 聞かれそうな質問

**Q. なぜライブラリは full で配らないのですか？**

full の出力は `ɵɵelementStart` などの**命令**の呼び出しの列で、命令は `@angular/core` の非公開の API です。名前・引数・意味は Angular のバージョンごとに変わってよいものなので、v21 で full にしたライブラリを v22 のアプリに入れると、存在しない命令や意味の違う引数を呼ぶことになります。partial の出力は、命令の代わりにメタデータとテンプレートのソースを持つ、バージョン間で約束された形（`minVersion` 付き）です。アプリのビルドで、アプリと**同じバージョン**のコンパイラ（5 節 109 行目）が命令の列を作るので、ライブラリは古い Angular でビルドしたままで新しいアプリで動きます。逆の向き（新しすぎるライブラリ）は、4 節 184〜196 行目で検出されます。

**Q. リンクはどれくらい時間がかかりますか？**

この版の CLI は時間を個別に表示しません。コストの内訳はソースから読めます。リンクが要らないファイルは、2 節 103 行目の文字列の検索だけで、ワーカーにも送られません。要るファイルでは、5 節のとおり**コンポーネントごとにテンプレートを解析してコンパイル**するので、アプリ自身のコンポーネントを AOT でコンパイルするのと同じ種類の仕事があります（型検査は無い）。その結果は第 5 回の 3 節のキャッシュ（中身のハッシュが鍵）に入るので、ディスクのキャッシュ（[第 10 回](10-cli-cache-watch.md)）が有効なら、node\_modules が変わらない限り 2 回目以降のビルドではワーカーに送られずにキャッシュから返ります。

**Q. Babel のリンカーとは何が違いますか？**

`FileLinker` から下（4〜5 節）は同じ Angular 本体のコードです。違うのは木と出力の係で、Babel は Babel の木を読み、Babel の節点を作り、ファイル全体のコードを生成し直します。2 節 191〜214 行目の `transformAsync` がそれです。oxc のほうは 3 節のとおり、木は読むだけで、宣言の呼び出しの範囲だけを文字列で上書きし、引数の式は元のソースを切り出して使います。もう 1 つ、定数の置き場が違います。oxc は 3 節 35〜37 行目でファイルの先頭に定数を足さず、IIFE の中に入れます。何かの不具合で oxc のリンクを疑うときは、`NG_BUILD_BABEL_LINKER=1` を付けてビルドすると 2 節 182 行目の Babel の道になり、比べられます。

**Q. ng serve でもリンクは走りますか？**

走ります。第 5 回の 4 つの最適化は本番だけですが、リンクは開発ビルドでも必要です（リンクしないと `ɵɵngDeclareComponent` を実行時に呼ぶことになり、それには JIT のコンパイラが要る）。例外は JIT モードのビルドで、第 5 回 1 節 573 行目のとおりリンクを飛ばし、宣言は実行時に JIT のコンパイラが処理します。

## 読み終えて

- ライブラリは `compilationMode: "partial"` で、命令の列の代わりにメタデータとテンプレートのソースを持つ `ɵɵngDeclare*` を出力する。
- CLI は中身に `ɵɵngDeclare` があるかの文字列検索でリンクの要るファイルを選び、oxc の 1 回の走査の中で宣言の呼び出しを見つける。
- `OxcLinker` は Angular 本体の `FileLinker` に、oxc の木を読む係と文字列を作る係を渡し、返った文字列で呼び出しの範囲だけを上書きする。
- `FileLinker` は `minVersion` で部分リンカーを選び、宣言の `version` に合わせた構文の設定で、アプリのコンパイラがテンプレートを解析する。
- このサイトの本番の JS には宣言の形は 0 件で、`RouterOutlet` も `static ɵdir=` の完全な定義になっている。

---

← 前: [JavaScriptTransformer：oxc で純粋の印を付け、メタデータを消す](05-cli-javascript-transformer.md)  
次: [遅延チャンク：loadComponent が別ファイルになり、chunk-optimizer がまとめ直す](07-cli-code-splitting.md) →
