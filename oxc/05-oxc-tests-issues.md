[目次](../README.md) › [oxc の変換と TypeScript の transformer の内側：ビルドが JavaScript を書き換える行](README.md) › 第 5 回 / 全 5 回

# spec と issue を読む：oxc の変換と transformer を固めているテスト

> tools/oxc と tools/angular/linker・transformers の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で行を変えて確かめた spec の無い行、関係する issue と PR の表、origin/main の続き。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/oxc-tests-issues)

---

この章で分かること: `tools/oxc`・`tools/angular/linker`・`tools/angular/transformers` の spec が、このシリーズの第 1〜4 回のどの約束を固めているかの地図と、手元で走らせた数、作業木で 1 行ずつ変えて「spec が落ちない行」を確かめた結果です。関係する issue と PR の表、44129f66a3 から origin/main までの続き、このシリーズで見つけたものの表を並べます。

読む対象は angular-cli（44129f66a3）の `packages/angular/build/src/tools/oxc/*_spec.ts`（5 ファイル）、`tools/angular/linker/*_spec.ts`（3 ファイル）、`tools/angular/transformers/lazy-routes-transformer_spec.ts`、`tools/angular/compilation/angular-compilation_spec.ts` です。どれも `packages/angular/build/BUILD.bazel` の `unit_test_lib`（`src/**/*_spec.ts`）から `//packages/angular/build:test` の 1 つの `jasmine_test`（shard 4）に入ります。その target の読み方は[dev-server の spec の章](../vds/05-vds-tests-issues.md)の 1 節、1 本だけ走らせる一般論は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. transform の 1 回の走査](01-oxc-transform-pass.md)
2. [2. 後順の走査](02-oxc-traversal.md)
3. [3. linker の読み書き](03-oxc-linker-host.md)
4. [4. TypeScript の transformer](04-oxc-ts-transformers.md)
5. **5. spec と issue**（この章）

## 1. spec の形：transform を呼んで文字列を比べる

📄 `angular-cli/packages/angular/build/src/tools/oxc/pure-toplevel-functions_oxc_spec.ts` L11–46 （▶ の行: 12–16, 29–31, 36–38）

```ts
11 │ function cleanCode(code: string): string {
12 ▶   return code
13 ▶     .replace(/\s+/g, '')
14 ▶     .replace(/"/g, "'")
15 ▶     .replace(/;}/g, '}')
16 ▶     .replace(/,([}\])])/g, '$1');
17 │ }
18 │ 
19 │ function testCase({
20 │   input,
21 │   expected,
22 │   options,
23 │ }: {
24 │   input: string;
25 │   expected: string;
26 │   options?: { topLevelSafeMode: boolean };
27 │ }): jasmine.ImplementationCallback {
28 │   return async () => {
29 ▶     const result = transform('test.js', input, {
30 ▶       sourcemap: false,
31 ▶       topLevelSafeMode: options?.topLevelSafeMode,
32 │     });
33 │     if (!result?.code) {
34 │       fail('Expected oxc-transform to return a transform result.');
35 │     } else {
36 ▶       const actualClean = cleanCode(result.code);
37 ▶       const expectedClean = cleanCode(expected);
38 ▶       expect(actualClean).toEqual(expectedClean);
39 │     }
40 │   };
41 │ }
42 │ 
43 │ function testCaseNoChange(input: string): jasmine.ImplementationCallback {
44 │   return testCase({ input, expected: input });
45 │ }
46 │ 
```

oxc の 4 つの最適化の spec は、どれも同じ形の `testCase` です。29〜32 行目で本物の `transform` を呼び、36〜38 行目で出力と期待の文字列を比べます。比べる前に 11〜17 行目の `cleanCode` で**空白を全部消し**、`"` を `'` に、末尾のカンマと `;}` をそろえます。つまり出力の改行や字下げは見ていません。`adjust-typescript-enums_oxc_spec.ts` だけは、空白を消す代わりに prettier で両方を整形してから比べます。

📄 `angular-cli/packages/angular/build/src/tools/oxc/adjust-typescript-enums_oxc_spec.ts` L324–346 （▶ の行: 325, 332, 336, 340）

```ts
324 │   it(
325 ▶     'wraps Crockford-style TypeScript enum IIFE without leaving dangling parentheses',
326 │     testCase({
327 │       input: `
328 │         var HDirection;
329 │         (function (HDirection) {
330 │           HDirection[HDirection['Backwards'] = -1] = 'Backwards';
331 │           HDirection[HDirection['Forwards'] = 1] = 'Forwards';
332 ▶         }(HDirection || (HDirection = {})));
333 │         const nextStatement = true;
334 │       `,
335 │       expected: `
336 ▶         var HDirection = /*#__PURE__*/ (function (HDirection) {
337 │           HDirection[(HDirection['Backwards'] = -1)] = 'Backwards';
338 │           HDirection[(HDirection['Forwards'] = 1)] = 'Forwards';
339 │           return HDirection;
340 ▶         }(HDirection || {}));
341 │ 
342 │         const nextStatement = true;
343 │       `,
344 │     }),
345 │   );
346 │ 
```

325 行目の it が、[第 1 回](01-oxc-transform-pass.md)の Crockford 風の enum（199a864df9、#33791）の約束です。332 行目の `}(HDirection || (HDirection = {})));` の入力から、336 行目の `/*#__PURE__*/` の IIFE と、340 行目の `(HDirection || {})` の出力になることを見ます。

📄 `angular-cli/packages/angular/build/src/tools/oxc/oxc-transform_spec.ts` L51–80 （▶ の行: 70–73, 75, 77）

```ts
51 │     it('should perform linking and advanced optimizations simultaneously in a single pass', () => {
52 │       const input = `
53 │       import * as i0 from "@angular/core";
54 │       export class MyComponent {
55 │         static create() {
56 │           return new MyComponent();
57 │         }
58 │       }
59 │       MyComponent.ɵcmp = i0.ɵɵngDeclareComponent({
60 │         minVersion: "12.0.0",
61 │         version: "14.0.0",
62 │         ngImport: i0,
63 │         type: MyComponent,
64 │         isStandalone: true,
65 │         selector: "my-cmp",
66 │         template: "<span>Hello</span>"
67 │       });
68 │     `;
69 │ 
70 ▶       const result = transform('test.js', input, {
71 ▶         link: true,
72 ▶         advancedOptimizations: true,
73 ▶         topLevelSafeMode: true,
74 │       });
75 ▶       expect(result.code).toContain('i0.ɵɵdefineComponent');
76 │       expect(result.code).not.toContain('i0.ɵɵngDeclareComponent');
77 ▶       expect(result.code).toContain('let MyComponent = /*#__PURE__*/ (() => {');
78 │     });
79 │   });
80 │ });
```

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/oxc-linker_spec.ts` L9–35 （▶ の行: 14–16, 32–34）

```ts
 9 │ import { transform } from '../../oxc/oxc-transform';
10 │ 
11 │ describe('oxc-linker', () => {
12 │   it('should not modify code that does not need linking', () => {
13 │     const input = 'const x = 1;';
14 ▶     const result = transform('test.js', input, { link: true, advancedOptimizations: false });
15 ▶     expect(result.code).toBe(input);
16 ▶     expect(result.map).toBeUndefined();
17 │   });
18 │ 
19 │   it('should link a partial directive declaration', () => {
20 │     const input = `
21 │       import * as i0 from "@angular/core";
22 │       export class MyDirective {}
23 │       MyDirective.ɵdir = i0.ɵɵngDeclareDirective({
24 │         minVersion: "12.0.0",
25 │         version: "14.0.0",
26 │         ngImport: i0,
27 │         type: MyDirective,
28 │         selector: "[my-dir]"
29 │       });
30 │     `;
31 │ 
32 ▶     const result = transform('test.js', input, { link: true, advancedOptimizations: false });
33 ▶     expect(result.code).toContain('i0.ɵɵdefineDirective');
34 ▶     expect(result.code).not.toContain('i0.ɵɵngDeclareDirective');
35 │   });
```

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/oxc-linker_spec.ts` L57–79 （▶ の行: 70, 73, 75–77）

```ts
57 │   it('should generate a decoded sourcemap when sourcemap option is enabled', () => {
58 │     const input = `
59 │       import * as i0 from "@angular/core";
60 │       export class MyDirective {}
61 │       MyDirective.ɵdir = i0.ɵɵngDeclareDirective({
62 │         minVersion: "12.0.0",
63 │         version: "14.0.0",
64 │         ngImport: i0,
65 │         type: MyDirective,
66 │         selector: "[my-dir]"
67 │       });
68 │     `;
69 │ 
70 ▶     const result = transform('test.js', input, {
71 │       link: true,
72 │       advancedOptimizations: false,
73 ▶       sourcemap: true,
74 │     });
75 ▶     expect(result.map).toBeDefined();
76 ▶     expect(result.map?.version).toBe(3);
77 ▶     expect(result.map?.sources).toContain('test.js');
78 │   });
79 │ });
```

リンクの spec は形が違います。`oxc-transform_spec.ts` の 70〜77 行目は、`link: true` と `advancedOptimizations: true` を同時に渡し、リンクの結果（75 行目）と静的メンバーの包み直し（77 行目）が**同じ 1 回の transform** で起きることを見ます（[第 2 回](02-oxc-traversal.md)の f4dad31cce の約束）。`oxc-linker_spec.ts` は 14〜16 行目でリンクの要らないコードが同じ文字列のまま map も無いこと、32〜34 行目で `i0.ɵɵdefineDirective` があり `i0.ɵɵngDeclareDirective` が無いことを `toContain` で見ます。リンクの出力の全文は比べません。`oxc-linker_spec.ts` の 73 行目で `sourcemap: true` にした it は、75〜77 行目で map があること・version・sources だけを見ます（`oxc-transform_spec.ts` の sourcemaps の it も、ほかに mappings が空でないことを見るだけです）。

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/oxc-ast-host_spec.ts` L13–31 （▶ の行: 20–21, 24, 28）

```ts
13 │ describe('OxcAstHost', () => {
14 │   let host: OxcAstHost;
15 │ 
16 │   beforeEach(() => {
17 │     host = new OxcAstHost();
18 │   });
19 │ 
20 ▶   function parseExpression(code: string): unknown {
21 ▶     const { program } = parseSync('test.js', `const x = ${code};`, { range: true });
22 │     const stmt = program.body[0] as { declarations: Array<{ init: unknown }> };
23 │ 
24 ▶     return stmt.declarations[0].init;
25 │   }
26 │ 
27 │   function parseStatement(code: string): unknown {
28 ▶     const { program } = parseSync('test.js', code, { range: true });
29 │ 
30 │     return program.body[0];
31 │   }
```

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/string-ast-factory_spec.ts` L25–54 （▶ の行: 27, 31–33）

```ts
25 │   describe('literals and identifiers', () => {
26 │     it('should correctly format string literals', () => {
27 ▶       expect(factory.createLiteral('hello')).toBe('"hello"');
28 │     });
29 │ 
30 │     it('should correctly format numeric literals including NaN and Infinity', () => {
31 ▶       expect(factory.createLiteral(123)).toBe('123');
32 ▶       expect(factory.createLiteral(NaN)).toBe('NaN');
33 ▶       expect(factory.createLiteral(Infinity)).toBe('Infinity');
34 │     });
35 │ 
36 │     it('should correctly format boolean literals', () => {
37 │       expect(factory.createLiteral(true)).toBe('true');
38 │       expect(factory.createLiteral(false)).toBe('false');
39 │     });
40 │ 
41 │     it('should correctly format null and undefined literals', () => {
42 │       expect(factory.createLiteral(null)).toBe('null');
43 │       expect(factory.createLiteral(undefined)).toBe('undefined');
44 │     });
45 │ 
46 │     it('should correctly create identifiers', () => {
47 │       expect(factory.createIdentifier('myVar')).toBe('myVar');
48 │     });
49 │ 
50 │     it('should correctly format regular expression literals', () => {
51 │       expect(factory.createRegularExpressionLiteral('abc+', 'g')).toBe('/abc+/g');
52 │       expect(factory.createRegularExpressionLiteral('abc+', null)).toBe('/abc+/');
53 │     });
54 │   });
```

📄 `angular-cli/packages/angular/build/src/tools/angular/linker/string-ast-factory_spec.ts` L183–210 （▶ の行: 198, 201–202, 206–207）

```ts
183 │     it('should format statements', () => {
184 │       expect(factory.createBlock(['foo();', 'bar();'])).toBe('{\nfoo();\nbar();\n}');
185 │       expect(factory.createIfStatement('cond', 'foo();', 'bar();')).toBe(
186 │         'if (cond) foo(); else bar();',
187 │       );
188 │       expect(factory.createIfStatement('cond', 'foo();', null)).toBe('if (cond) foo();');
189 │       expect(factory.createReturnStatement('val')).toBe('return val;');
190 │       expect(factory.createReturnStatement(null)).toBe('return;');
191 │       expect(factory.createThrowStatement('err')).toBe('throw err;');
192 │       expect(factory.createVariableDeclaration('x', '1', 'const')).toBe('const x = 1;');
193 │       expect(factory.createVariableDeclaration('y', null, 'let')).toBe('let y;');
194 │     });
195 │   });
196 │ 
197 │   describe('template literals', () => {
198 ▶     it('should format template literals and tagged templates', () => {
199 │       const template = {
200 │         elements: [
201 ▶           { raw: 'Hello ', cooked: 'Hello ', range: null },
202 ▶           { raw: '!', cooked: '!', range: null },
203 │         ],
204 │         expressions: ['name'],
205 │       };
206 ▶       expect(factory.createTemplateLiteral(template)).toBe('`Hello ${name}!`');
207 ▶       expect(factory.createTaggedTemplate('tag', template)).toBe('tag`Hello ${name}!`');
208 │     });
209 │   });
210 │ });
```

[第 3 回](03-oxc-linker-host.md)の host の spec は、20〜25 行目で `const x = …;` の形にして oxc-parser で読み、21 行目の `range: true` で位置のある節点を host に渡します。factory の spec は factory を単独で呼び、戻り値の文字列を `toBe` で比べます。27 行目の文字列のリテラルは `'hello'` だけ、201〜202 行目のテンプレートは `raw` と `cooked` が同じで、エスケープの要る値はありません（3 節）。

## 2. 地図と走らせた結果

> **🧪 DEMO — spec の地図を章でふるい分ける**
>
> 行は 44129f66a3 で `grep -n` したもの、「it」は jasmine が数える spec の数です。spec の無いファイルも 0 として入れました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/oxc-tests-issues)

📄 `走らせたコマンド`

```
cd ~/angular-research/angular-cli-fix   # 44129f66a3（../angular-cli と同じ版、pnpm install 済み）
# 全部（src/**/*_spec.ts、shard 4）
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all
# この地図の 9 ファイル（traversal と 3 つの transformer は spec が無い）
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=^(oxc-|OxcAstHost|StringAstFactory|adjust-static-class-members oxc|adjust-typescript-enums oxc|elide-angular-metadata oxc|pure-toplevel-functions oxc|lazyRoutesTransformer)'
pnpm bazel test //packages/angular/build:test --nocache_test_results --test_output=all '--test_arg=--filter=AngularCompilation createAngularCompilation'
```

📄 `結果（出力から抜き出したもの）`

```
全部：154 + 153 + 154 + 154 = 615 specs, 0 failures（PASSED in 7.2s）
地図の 9 ファイル（angular-compilation_spec を除く）：Ran 40 of 496 ／ 39 of 495 ／ 40 of 496 ／ 40 of 496 specs = 159 specs, 0 failures（PASSED in 1.0s）
createAngularCompilation：1 + 1 + 1 + 2 = 5 specs, 0 failures
# 絞り込みの名前に合わない shard も PASSED になるので、Ran の行で数を確かめる
```

地図の 10 ファイルの合計は 185 specs で、そのうち 9 ファイル（angular-compilation\_spec の 26 を除く）が絞り込みの 159 specs と同じ数です。どれも 1 回目で通りました。`traversal.ts` と、[第 4 回](04-oxc-ts-transformers.md)の 3 つの transformer には、44129f66a3 の unit の spec がありません。transformer の出力は application builder の統合の target が一部を見ます（第 4 回の「テストと直し方」、7 specs）。

## 3. 行を変えると、どの spec が落ちるか

📄 `作業木で走らせたコマンド`

```
git -C ~/angular-research/angular-cli-fix worktree add --detach <scratchpad>/oxc-wt-b 44129f66a3
# run.mjs：作業木の tools/oxc と tools/angular/linker の .ts（spec を含む）を transpileModule で CJS にして、
#          ../angular-cli-fix の node_modules（NODE_PATH）の jasmine で走らせる。行を変えない作業木では 150 specs, 0 failures（bazel の 159 から lazy-routes の 9 を除いた数と同じ）
# mutate.mjs：1 行を変える → run.mjs → 戻す、を 12 回
node <scratchpad>/oxc-demo/b/mut/mutate.mjs <scratchpad>/oxc-wt-b
git -C ~/angular-research/angular-cli-fix worktree remove --force <scratchpad>/oxc-wt-b   # 終わったら消した
```

| 場所（tools/ から） | 変えたこと | 150 specs の結果 | 章 | 落ちない理由（spec の入力を grep して確かめた） |
| --- | --- | --- | --- | --- |
| `oxc/oxc-transform.ts 298` | hasPureComment がいつも false | 0 failures | 第 1 回 | pure-toplevel の spec で注釈があるのは expected の側だけ。注釈ずみの入力が無い |
| `oxc/oxc-transform.ts 740` | hires: 'boundary' → false | 0 failures | 第 1 回 | source map の it は mappings が空でないことだけを見る（oxc-transform\_spec.ts の sourcemaps の it） |
| `oxc/traversal.ts 78` | isTypeOnlyTypeScriptNode がいつも false（型の部分木を刈らない） | 0 failures | 第 2 回 | spec の入力はどれも JavaScript（test.js）で、型の注釈が無い |
| `oxc/traversal.ts 92` | pushNodesReverse を前から積む（訪ねる順が逆） | 0 failures | 第 2 回 | 訪ねた順を見る spec が無い（150 の it が、同じ期待の出力のまま通った） |
| `linker/oxc-ast-host.ts 273` | startLine: 0 → 42 | 0 failures | 第 3 回 | getRange の it は startPos と endPos だけを見る |
| `linker/oxc-linker.ts 69` | sourceMapping: false → true | 0 failures | 第 3 回 | spec の入力に sourceMappingURL の行が無い |
| `linker/oxc-linker.ts 83` | isPartialDeclaration の確かめを外す | 0 failures | 第 3 回 | spec の入力に宣言以外の呼び出しが無い |
| `linker/string-ast-factory.ts 93` | 「( で始まり ) で終わる」なら包まない、を外す | 0 failures | 第 3 回 | 括弧が二重になるだけの入力しか無い |
| `linker/string-ast-factory.ts 135` | /\*@\_\_PURE\_\_\*/ を付けない | 1 failure | 第 3 回 | string-ast-factory\_spec.ts 100 行目の it |
| `linker/string-ast-factory.ts 188` | isObjectLiteral がいつも false | 1 failure | 第 3 回 | string-ast-factory\_spec.ts 168 行目の it |
| `linker/string-ast-factory.ts 214` | JSON.stringify(value) → \`"${value}"\` | 0 failures | 第 3 回 | spec の文字列は 'hello' だけで、エスケープの要る文字が無い |
| `linker/string-ast-factory.ts 264` | elements\[i\].raw → cooked | 0 failures | 第 3 回 | spec のテンプレートは raw と cooked が同じ |

12 の行のうち落ちたのは 2 つ（どちらも factory の単独の it）でした。spec の無い行の多くは、**spec の入力に、その行が働く形が無い**ものです。たとえば `oxc-linker.ts` 69 行目の `sourceMapping: false`（7e5510e464）は、入力の末尾に `//# sourceMappingURL=` があるときだけ働き（[第 3 回](03-oxc-linker-host.md)の 5 節の記録）、spec の入力にはその行がありません。足すとしたら、`oxc-linker_spec.ts` に「`sourceMappingURL` の行がある宣言をリンクしても warn が出ない」it、`pure-toplevel-functions_oxc_spec.ts` に「すでに `/*#__PURE__*/` のある呼び出しに 2 つ目を付けない」it、`oxc-ast-host_spec.ts` の `describe('getRange')` に行と桁の it です。

## 4. issue と PR

> **🧪 DEMO — issue と PR を章でふるい分ける**
>
> 2026-11-18 に gh で読んだもの（読むだけ）。日付は開いた日、PR は merge した日です。oxc-parser の依存の更新と、oxc を使う schematics・i18n の PR は入れていません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/oxc-tests-issues)

開いている issue で、このシリーズの行に一番近いのは #34198 です。後ろで宣言するクラスを、前のクラスの static の宣言（`deps` など）が名前で参照する FESM で、unit-test の builder が ReferenceError で止まるという報告で、まだ返事がありません。手元で作った同じ形（前のクラスの `ɵɵngDeclareComponent` の `dependencies` が後ろのクラスを指す）を 22.2.7 の oxc のリンカーと Babel のリンカーに通すと、どちらも `dependencies: [Parent]` を static の初期化の中に置き、評価すると両方とも ReferenceError でした。違いは、Babel が純粋関数の定数（`_c0`）をファイルの先頭に置き、oxc が IIFE の中に置くことだけで、報告の差はこの形では再現できていません（`<scratchpad>/oxc-demo/b/probe/tdz.mjs`）。

## 5. origin/main の続き

📄 `../angular-cli の git log（このシリーズに関係するもの）`

```
$ git -C ../angular-cli log --format='%h %ad %s' --date=short 44129f66a3..origin/main -- packages/angular/build/src/tools/oxc packages/angular/build/src/tools/angular
（25 本のうち、compilation などの 17 本を除いた、このシリーズの行に触れる 8 本）
d9e3e22720 2026-11-03 refactor(@angular/build): remove oxc WASI shim
12578eccae 2026-11-03 refactor(@angular/build): centralize oxc-parser loading with scoped WASI shim (#34632)
fd8e743fde 2026-11-02 fix(@angular/build): enable oxc WASI fallback in WebContainer environments
174eb34540 2026-10-29 fix(@angular/build): elide non-value aliases and remaining type-only AST constructs
b6bfa2c747 2026-10-29 fix(@ngtools/webpack): elide imports used only in type re-exports or type declarations
999d84ca52 2026-09-28 perf(@angular/build): avoid loading compiler-cli and typescript in js transform worker
43aab6a1cf 2026-09-21 fix(@angular/build): support parenthesized expressions in oxc linker
eb1edeb514 2026-09-21 refactor(@angular/build): relocate non-esbuild utilities out of tools/esbuild
# 22.2.x への backport：e347d722f4・ca32365c4a・b5dd8e2634・a4ce7bf461・4b6caacbc7・d55e899954・1fc2732795（どれも v22.2.7 に入っている）
```

| 章 | コミット（日付） | 中身 |
| --- | --- | --- |
| 第 3 回 | 43aab6a1cf（09-21） | host の全部の入口で `ParenthesizedExpression` を外す（Fixes #34129）。`oxc-ast-host_spec.ts` に括弧の it を足し、`oxc-linker_spec.ts` に `ɵɵngDeclareClassMetadataAsync` の it（5 つ目）を足した |
| 第 3 回 | 999d84ca52（09-28） | `OxcLinker` が `@angular/compiler-cli` の本体を読み込まないよう、logger を手で書いたオブジェクトに替えた（ワーカーの起動で TypeScript を読まない） |
| 第 4 回 | b6bfa2c747・174eb34540（10-29） | `elideImports` の型だけの構文と、名前だけを消す道の直し。`jit-bootstrap-transformer_spec.ts` が新しく入った（2 つの it） |
| 第 1・2 回 | fd8e743fde（11-02）・12578eccae・d9e3e22720（11-03） | WebContainer で oxc-parser の WASI の binding に落とす shim を入れ、読み込みを `load-oxc-parser.ts` にまとめ、翌日に shim ごと外した。`traversal.ts` と `oxc-transform.ts` の import の行が変わった |
| — | eb1edeb514（09-21） | `tools/esbuild` の外に移した utility の import の行（compilation の 5 ファイル） |

このサイトの依存の @angular/build 22.2.7 は、44129f66a3 にこのうち 7 本の backport（上の log の最後の行）を足したものです。第 3・4 回の記録で「22.2.7」と「HEAD」の出力が違うのは、43aab6a1cf と 174eb34540 の分です。

## このシリーズで見つけたもの

書きながら記録と作業木で見つけたものです。本家の行と、再現に使った記録を書きます。「既存の issue / PR」は 2026-11-18 に gh で検索した結果（読むだけ）です。

| ソースの行 | 見つけたこと | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| `tools/oxc/oxc-transform.ts 403〜406（adjustTypeScriptEnumsInStatements）` | enum の各メンバーの代入の右辺だけを isPure で見る。enum Reg { A = register("a") } は TypeScript が Reg\[Reg\["A"\] = register("a")\] = "A" と出すので、呼び出しが左辺に入り、印付きの IIFE に包まれる（使われなければ呼び出しごと消せる形）。Babel の版も右辺だけを見ていた | &lt;scratchpad&gt;/oxc-demo/a/record-transform.mjs の 6 つ目の入力（Live、Date.now()）と、&lt;scratchpad&gt;/oxc-demo/a/patched/ の条件を足した写し（第 1 回） | なし（"enum side effect pure annotation" "enum initializer function call removed" で検索） | 第 1 回 |
| `tools/oxc/oxc-transform.ts 212（analyzeClassStaticProperties）と 543〜547` | static のキーが計算されたもの（static \[key\] = 1）かを見ない。oxc-parser は \[key\] のキーも Identifier にするので名前 key のプロパティとして判定され、static \[ɵfac\] = register() は Angular の static の名前として値を見ずに包まれる | &lt;scratchpad&gt;/oxc-demo/a/record-transform.mjs の 4 つ目の入力（class E）と Node での確かめ（第 1 回） | なし（"static computed property pure" で検索） | 第 1 回 |
| `tools/oxc/oxc-transform.ts 144・148（isPure）` | 単項演算子の種類と、オブジェクトのプロパティのキーを見ないので、delete globalThis.foo と { \[register()\]: 1 } も純粋とみなし、それを static に持つクラスが包まれる。Babel の scope.isPure より広い | &lt;scratchpad&gt;/oxc-demo/a/record-transform.mjs の横での確かめ（第 1 回の 2 節） | なし（"isPure delete" "advancedOptimizations computed" で検索） | 第 1 回 |
| `tools/oxc/oxc-transform.ts の isAlreadyEdited（CallExpression・NewExpression の枝の最初）` | 後順の走査（2b85529e82・f4dad31cce の後）では、書き換えた範囲の内側を後から訪ねることが無いので、この確かめが真を返す場面が無い | &lt;scratchpad&gt;/oxc-demo/a/record-traversal.mjs と old/ の比べ（第 2 回） | —（ふるまいは変わらない。消してよいかの記録） | 第 2 回 |
| `tools/angular/linker/oxc-ast-host.ts 271〜276（getRange）` | 行と桁をいつも 0 で返す。リンクするテンプレートの誤りの「ファイル@行:桁」が、oxc では @0:14、同じ入力の Babel のリンカーでは @5:26 になる | &lt;scratchpad&gt;/oxc-demo/b/linker/record.mjs の「テンプレートに誤り」（第 3 回の記録） | なし（2026-11-18、gh で "linker error location" "oxc linker getRange" などを検索） | 第 3 回 |
| `tools/angular/transformers/jit-resource-transformer.ts 196 と 113〜120` | JIT で、styles の値が変数（文字列でも配列でもない）かつ styleUrl / styleUrls があると、styles のキーが 2 つになり、変数のスタイルが渡らない | &lt;scratchpad&gt;/oxc-demo/b/ts/record.mjs の「styles が変数・styleUrl あり」（第 4 回の記録） | なし（"jit styles styleUrl" などで検索）。@ngtools/webpack の replace\_resources.ts も同じ形の分岐 | 第 4 回 |
| `tools/angular/transformers/jit-bootstrap-transformer.ts 72〜76（44129f66a3）` | 名前だけを消す集合を作っても、消す関数がファイルの直下しか見ないので、platformBrowserDynamic の名前が import に残る | &lt;scratchpad&gt;/oxc-demo/b/ts/record.mjs の「ほかの名前と同じ import」（HEAD の版） | origin/main の 174eb34540 で直った（#34582 の続き。22.2.x は a4ce7bf461、22.2.7 に入っている） | 第 4 回 |
| `tools/angular/linker/string-ast-factory.ts 93（wrapOperand）` | 両端だけを見るので (a) \|\| (b) を包まれた式とみなし、! を付けると !(a) \|\| (b) になる。記録の 4 つのリンクでは、この形の文字列は渡ってこなかった | &lt;scratchpad&gt;/oxc-demo/b/linker/record.mjs の単体の呼び出し（UNIT の最後の行） | なし | 第 3 回 |
| `3 節の表の 0 failures の 10 行` | 行を変えても spec が落ちない（spec の無い行）。不具合ではなく、固める spec が無いことの記録 | &lt;scratchpad&gt;/oxc-demo/b/mut/mutate.mjs（作業木で 1 行ずつ） | — | 第 1〜3 回 |

## 聞かれそうな質問

**Q. oxc の spec を 1 ファイルだけ走らせるには？**

`pnpm bazel test //packages/angular/build:test --test_arg=--filter=<describe の名前>` です。describe の名前はファイルの名前と違い、たとえば `OxcAstHost`・`StringAstFactory`・`adjust-typescript-enums oxc-transform implementation` です（2 節の表）。4 つの shard に分かれるので、`Ran N of …` の行を足して数を確かめます。

**Q. Node の jasmine で直接走らせてもよいのですか？**

行を変えて何度も走らせるときに使いました（3 節）。`.ts` を `transpileModule` で直すだけなので型の検査はしません。行を変えない作業木で 150 specs が通り、bazel の 159 から lazy-routes の 9 を除いた数と同じだったので、同じ spec が走っていることは確かめてあります。bazel の target とは、型の検査をしない点が違います。

**Q. リンクの出力の全文を比べる spec はありますか？**

44129f66a3 にはありません。`oxc-linker_spec.ts` と `oxc-transform_spec.ts` は `toContain` で関数名を見るだけです（1 節）。全文の形は、Angular 本体の compliance のテストの `GOLDEN_PARTIAL.js` が部分宣言の側を固めていて（[リンカーの章](../cli/06-cli-linker.md)の 1 節）、リンクした後の文字列の形は第 3 回の記録で見られます。

**Q. traversal.ts の spec が無いのは問題ですか？**

3 節の 2 つの行（型の部分木を刈らない、訪ねる順を逆にする）は、どちらも 150 specs が通りました。後順の走査は 4 つの最適化の spec の中で間接に通りますが、訪ねた順やコンテキスト（関数の中かなど）を直接見る it はありません。[第 2 回](02-oxc-traversal.md)の記録が、その順を Node で確かめたものです。

## 読み終えて

- このシリーズの行を固める unit の spec は 10 ファイル・185 specs で、どれも `//packages/angular/build:test`（shard 4）に入る。`traversal.ts` と 3 つの transformer には unit の spec が無い。
- 最適化の spec は空白を消して文字列を比べ、リンクの spec は `toContain` で関数名を見る。source map は「空でない」ことだけ。
- 作業木で 12 の行を変えて、落ちたのは factory の 2 つの it だけ。spec の無い行は、spec の入力にその行が働く形が無いものが多い。
- 見つけたもの：最適化の側は、呼び出しを値に持つ enum・計算されたキーの static・`isPure` の広さで、どれも「包んでよい」側に倒れる。linker と transformer の側は、`getRange` の行と桁が 0、JIT の `styles` の変数と `styleUrl` の重複、`wrapOperand` の両端だけの判定。`replaceBootstrap` の名前の消し残しは origin/main で直っている。
- 開いている #34198 は、手元の同じ形では oxc と Babel のリンカーで差が出なかった。

---

← 前: [TypeScript の transformer：JIT の resource・bootstrap の置き換え・Web Worker](04-oxc-ts-transformers.md)  
次: [ルートを取り出す：サーバーで Router を起動して設定をたどる](../srt/01-srt-extract.md) →
