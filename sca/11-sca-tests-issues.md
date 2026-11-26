[目次](../README.md) › [@schematics/angular の道具と移行](README.md) › 第 11 回 / 全 11 回

# spec と issue を読む：@schematics/angular の道具を固めているもの

> packages/schematics/angular の utility・migrations・refactor の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、関係する issue の表と、このシリーズで見つけた食い違い。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sca-tests-issues)

---

この章で分かること：このシリーズの 10 回で読んだ `packages/schematics/angular` の `utility/`・`migrations/`・`refactor/` の約束を、本家の spec（`*_spec.ts`）がどこで固めていて、どこを固めていないか。手元で spec を走らせた結果、`area: @schematics/angular` の issue の表、そしてこのシリーズで見つけた説明と実装の食い違い・取りこぼし・不具合の一覧です。

読む対象は `packages/schematics/angular/BUILD.bazel` と、3 つのフォルダの `*_spec.ts` の 31 ファイルです（../angular-cli、44129f66a3）。「新しい本家」は origin/main（0a61cbc4bf、2026-11-25）です。

1. [1. 変更の単位とファイルの道具](01-sca-change.md)
2. [2. AST の道具](02-sca-ast-utils.md)
3. [3. 依存を足す](03-sca-dependency.md)
4. [4. standalone のアプリを書き換える](04-sca-standalone.md)
5. [5. builder の移行](05-sca-build-migrations.md)
6. [6. Karma から Vitest へ](06-sca-karma-vitest.md)
7. [7. Jasmine から Vitest へ（1）骨組み](07-sca-jv-overview.md)
8. [8. Jasmine から Vitest へ（2）spy と型](08-sca-jv-spy.md)
9. [9. Jasmine から Vitest へ（3）matcher](09-sca-jv-matcher.md)
10. [10. Jasmine から Vitest へ（4）lifecycle と fakeAsync](10-sca-jv-lifecycle.md)
11. **11. spec と issue**（この章）

> [!TIP]
> **新卒エンジニアへ**
>
> spec は、関数や schematic を 1 つずつ呼んで結果を確かめるテストです。`@schematics/angular` では、パッケージの中の全部の `*_spec.ts` が 1 つの bazel の target（Node の jasmine）にまとまっていて、ng generate の schematic の spec と、このシリーズの道具・移行・refactor の spec が同じ target で走ります。

## 1. 走らせ方と件数

📄 `angular-cli/packages/schematics/angular/BUILD.bazel` L112–139 （▶ の行: 113, 117, 124, 137–139）

```python
112 │ ts_project(
113 ▶     name = "angular_test_lib",
114 │     testonly = True,
115 │     srcs = glob(
116 │         include = [
117 ▶             "**/*_spec.ts",
118 │             "utility/test/**/*.ts",
119 │         ],
120 │         exclude = [
121 │             # NB: we need to exclude the nested node_modules that is laid out by yarn workspaces
122 │             "node_modules/**",
123 │         ],
124 ▶     ) + ["refactor/jasmine-vitest/test-helpers.ts"],
125 │     deps = [
126 │         ":angular",
127 │         ":node_modules/@angular-devkit/core",
128 │         ":node_modules/@angular-devkit/schematics",
129 │         ":node_modules/jsonc-parser",
130 │         ":node_modules/typescript",
131 │         "//:node_modules/@types/jasmine",
132 │         "//:node_modules/@types/node",
133 │         "//:node_modules/prettier",
134 │     ],
135 │ )
136 │ 
137 ▶ jasmine_test(
138 ▶     name = "test",
139 ▶     data = [":angular_test_lib"],
```

117 行目の `"**/*_spec.ts"` がパッケージの中の spec を全部集め、124 行目で `refactor/jasmine-vitest/test-helpers.ts`（[第 7 回](07-sca-jv-overview.md)の 8 節の `expectTransformation`）だけを足し、137〜139 行目の 1 つの `jasmine_test` で走らせます。Node の jasmine なので、`--test_arg=--filter=` に describe の名前の正規表現を渡せば絞れます（絞って 0 件でも PASSED になるので、件数を見ます）。

📄 `走らせたコマンド（2026-11-27）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/schematics/angular:test --nocache_test_results --test_output=all
# ファイルごとの数は、そのファイルの describe の名前で絞って 31 回走らせた
$ pnpm bazel test //packages/schematics/angular:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=^(addDependency|removeDependency|getDependency) "
```

📄 `結果`

```
//packages/schematics/angular:test   863 specs, 0 failures, 1 pending（全部、31.7 秒）
utility/    8 ファイル  145 specs（ast-utils 41・dependency 37・find-module 20・standalone/rules 15・
                                   dependencies 11・workspace 10・parse-name 6・paths 5）
migrations/ 8 ファイル  107 specs（use-application-builder 24・stylesheet-updates 17・karma の 3 つ 15/14/19・
                                   trust-proxy-headers 9・add-istanbul 7・update-workspace-config 2）
refactor/  15 ファイル  224 specs, 1 pending（jasmine-spy 49・jasmine-matcher 41・jasmine-misc 30・
                                   jasmine-lifecycle 18・test-file-transformer 15・fake-async-test 12・
                                   index 11・add-imports 11・integration 8・jasmine-type 8・fake-async-flush 7・
                                   fake-async-tick 4・comment-helpers 4・refactor-reporter 4・flush-microtasks 2）
# pending: Comment Preservation should preserve comments around a multi-statement transformation（xit）
```

3 つのフォルダで 31 ファイル・476 specs、パッケージ全体の 863 specs の半分を少し超えます。pending の 1 つは refactor の `xit` で、3 節で見ます。

## 2. 各回の約束を固めている spec と、固めていない所

各回の「テストと直し方」の表を、回ごとにまとめます。

| 回 | spec（specs） | 固めていない所 |
| --- | --- | --- |
| [1](01-sca-change.md) | `utility/workspace_spec.ts`（10） | `change.ts`・`json-file.ts`・`eol.ts` は spec のファイルが無い。Insert と Replace の順、JSON の字下げ、`isDirectory` の近似 |
| [2](02-sca-ast-utils.md) | `ast-utils_spec.ts`（41）・`find-module_spec.ts`（20） | default import・副作用の import への `insertImport`、`import type`、同じ SourceFile で `findNodes` を 2 回、`NgModule` の別名、`ng-ast-utils.ts` |
| [3](03-sca-dependency.md) | `dependency_spec.ts`（37）・`dependencies_spec.ts`（11）ほか class などの schematic | `InstallBehavior.Always` で同じ指定、並べ直しと書式 |
| [4](04-sca-standalone.md) | `standalone/rules_spec.ts`（15） | `app_component.ts`、CodeBlock の偽の値、path alias・`satisfies`・拡張子つきの import |
| [5](05-sca-build-migrations.md) | `use-application-builder` の 2 つ（24・17）、`trust-proxy-headers`（9）、`add-istanbul-instrumenter`（7）、`update-workspace-config`（2） | 移せない builder、`css-import-lexer.ts`（spec が無い）、`ssr.entry` の形（22.2.7 で足された） |
| [6](06-sca-karma-vitest.md) | `migrate-karma-to-vitest` の 3 つ（15・14・19） | config schematic が作った `karma.conf.js` と既定との比べ（comparer は自分の既定とだけ比べる） |
| [7](07-sca-jv-overview.md) | `index_spec.ts`（11）・`test-file-transformer*_spec.ts`（15・11・8）・`utils/` の 2 つ（4・4） | 2 つ以上のファイル（TODO のあとのファイルの書き換え）、レポートの場所、整形の違い（prettier で整えてから比べる） |
| [8](08-sca-jv-spy.md) | `jasmine-spy_spec.ts`（49）・`jasmine-type_spec.ts`（8） | 変換後を走らせること、型の検査。`jasmine.Spy<Fn>` の型引数 |
| [9](09-sca-jv-matcher.md) | `jasmine-matcher_spec.ts`（41）・`jasmine-misc_spec.ts`（30） | オブジェクトへの `toHaveSize`・`jasmine.empty()`、入れ子の `jasmine.truthy()`、否定の `expectAsync` |
| [10](10-sca-jv-lifecycle.md) | `jasmine-lifecycle_spec.ts`（18）・fake-async の 4 つ（12・7・4・2） | 入れ子の関数の中の `done()`、条件の中の `pending()`、`async` でない関数の中の `tick`、`discardPeriodicTasks` |

refactor の spec は 224 本ありますが、変換器の spec はほとんどが「入力の文字列を変換し、期待の文字列と比べる」だけです（[第 7 回](07-sca-jv-overview.md)の 8 節の `expectTransformation`）。変換後のコードを Vitest で走らせることも、型を検査することもありません。第 8〜10 回の DEMO で「spec は通るのに、変換後は Vitest で落ちる・`ng test` の型で止まる」ものが多く出たのはこのためです。

## 3. spec が実物と違う形を固めている所

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy_spec.ts` L13–40 （▶ の行: 15, 17, 37–39）

```ts
13 │     {
14 │       description:
15 ▶         'should transform spyOn(object, "method") to vi.spyOn(object, "method").mockReturnValue(undefined)',
16 │       input: `spyOn(service, 'myMethod');`,
17 ▶       expected: `vi.spyOn(service, 'myMethod').mockReturnValue(undefined);`,
18 │     },
19 │     {
20 │       description: 'should transform .and.returnValue(...) to .mockReturnValue(...)',
21 │       input: `spyOn(service, 'myMethod').and.returnValue(42);`,
22 │       expected: `vi.spyOn(service, 'myMethod').mockReturnValue(42);`,
23 │     },
24 │     {
25 │       description:
26 │         'should transform .and.returnValue(Promise.resolve(...)) to .mockResolvedValue(...)',
27 │       input: `spyOn(service, 'myMethod').and.returnValue(Promise.resolve(42));`,
28 │       expected: `vi.spyOn(service, 'myMethod').mockResolvedValue(42);`,
29 │     },
30 │     {
31 │       description:
32 │         'should transform .and.returnValue(Promise.reject(...)) to .mockRejectedValue(...)',
33 │       input: `spyOn(service, 'myMethod').and.returnValue(Promise.reject(42));`,
34 │       expected: `vi.spyOn(service, 'myMethod').mockRejectedValue(42);`,
35 │     },
36 │     {
37 ▶       description: 'should transform .and.returnValues() to chained .mockReturnValueOnce() calls',
38 ▶       input: `spyOn(service, 'myMethod').and.returnValues('a', 'b', 'c');`,
39 ▶       expected: `vi.spyOn(service, 'myMethod').mockReturnValueOnce('a').mockReturnValueOnce('b').mockReturnValueOnce('c');`,
40 │     },
```

17 行目は `spyOn(service, 'myMethod')` を `.mockReturnValue(undefined)` つきにする約束で、`myMethod` の戻り値の型がふつうの型なら `ng test` で TS2345 になる形です（[第 8 回](08-sca-jv-spy.md)の 1 節）。37〜39 行目の `returnValues('a', 'b', 'c')` は、値が尽きたあと元の関数を呼ぶ形で、Jasmine の「尽きたら `undefined`」と違います（同じ回の 2 節）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-spy_spec.ts` L107–116 （▶ の行: 112–114）

```ts
107 │       description: 'should transform .and.rejectWith(error) to .mockRejectedValue(error)',
108 │       input: `spyOn(service, 'myMethod').and.rejectWith('some error');`,
109 │       expected: `vi.spyOn(service, 'myMethod').mockRejectedValue('some error');`,
110 │     },
111 │     {
112 ▶       description: 'should transform .and.identity() to .getMockName()',
113 ▶       input: `spyOn(service, 'myMethod').and.identity();`,
114 ▶       expected: `vi.spyOn(service, 'myMethod').getMockName();`,
115 │     },
116 │     {
```

113 行目の `.and.identity()` は、jasmine-core では文字列のプロパティで、呼ぶと Jasmine の側で TypeError になる書き方です。spec は Jasmine で動かない入力の変換を固めています（第 8 回の 2 節）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/jasmine-matcher_spec.ts` L144–152 （▶ の行: 148–150）

```ts
144 │       input: `expect(value).toBeNegativeInfinity();`,
145 │       expected: `expect(value).toBe(-Infinity);`,
146 │     },
147 │     {
148 ▶       description: 'should transform toHaveSize(number) to toHaveLength(number)',
149 ▶       input: `expect(myArray).toHaveSize(3);`,
150 ▶       expected: `expect(myArray).toHaveLength(3);`,
151 │     },
152 │     {
```

`toHaveSize` の入力は配列（`myArray`）だけです。オブジェクトのキーの数を数える Jasmine の使い方は、変換後に「to have property 'length'」で落ちます（[第 9 回](09-sca-jv-matcher.md)の 1 節）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/test-file-transformer_spec.ts` L186–206 （▶ の行: 187, 189–190, 192–194, 197, 201–202）

```ts
186 │     {
187 ▶       description: 'should preserve comments around a multi-statement transformation',
188 │       input: `
189 ▶           // Check if the spy was called correctly
190 ▶           expect(mySpy).toHaveBeenCalledOnceWith('foo');
191 │         `,
192 ▶       expected: `
193 ▶           // Check if the spy was called correctly
194 ▶           expect(mySpy).toHaveBeenCalledTimes(1);
195 │           expect(mySpy).toHaveBeenCalledWith('foo');
196 │         `,
197 ▶       skipped: true,
198 │     },
199 │   ];
200 │ 
201 ▶   testCases.forEach(({ description, input, expected, skipped }) => {
202 ▶     (skipped ? xit : it)(description, async () => {
203 │       await expectTransformation(input, expected);
204 │     });
205 │   });
206 │ });
```

パッケージ全体でただ 1 つの pending がこれです。期待（192〜195 行目）はコメントが 1 回ですが、実物は割った 2 つの文の両方にコメントを付けるので、197 行目の `skipped: true` で 202 行目の `xit` にしてあります（第 9 回の 3 節の記録の「30」）。

📄 `angular-cli/packages/schematics/angular/refactor/jasmine-vitest/transformers/fake-async-test_spec.ts` L308–339 （▶ の行: 308, 317–318, 334–336）

```ts
308 ▶       description: 'should not append `vi.runOnlyPendingTimersAsync()` in `test` or `afterEach`',
309 │       input: `
310 │           import { fakeAsync } from '@angular/core/testing';
311 │ 
312 │           describe('My fakeAsync suite', () => {
313 │             afterEach(fakeAsync(() => {
314 │               console.log('afterEach');
315 │             }));
316 │ 
317 ▶             it('works', fakeAsync(() => {
318 ▶               expect(1).toBe(1);
319 │             }));
320 │           });
321 │       `,
322 │       expected: `
323 │           describe('My fakeAsync suite', () => {
324 │             beforeEach(() => {
325 │               vi.useFakeTimers({ advanceTimeDelta: 1, shouldAdvanceTime: true });
326 │             });
327 │             afterEach(() => {
328 │               vi.useRealTimers();
329 │             });
330 │             afterEach(async () => {
331 │               console.log('afterEach');
332 │             });
333 │ 
334 ▶             it('works', async () => {
335 ▶               expect(1).toBe(1);
336 ▶             });
337 │           });
338 │       `,
339 │     },
```

`it(fakeAsync(…))` の終わりに残ったタイマーを流す文を足さない約束です。Angular の `fakeAsync` は既定で終わりに流すので、変換後は流れずに捨てられます（[第 10 回](10-sca-jv-lifecycle.md)の 4 節の記録の「06」「07」）。

ほかの回では、`find-module_spec.ts` の 44 行目の it の名前（「no modules found」で中身は「More than one module matches」、[第 2 回](02-sca-ast-utils.md)）、`dependencies_spec.ts` の describe の名前（`addDependency` で中身は `addPackageJsonDependency`、[第 3 回](03-sca-dependency.md)）、`karma-config-comparer_spec.ts` の 258 行目（comparer 自身の既定と比べる、[第 6 回](06-sca-karma-vitest.md)）が、名前や入力と実物の約束が違う形でした。

## 4. issue と PR の表

2026-11-27 に開いている `area: @schematics/angular` の 26 件のうち、このシリーズで読んだ所に関わるものと、refactor-jasmine-vitest の閉じた issue・開いている PR です（gh は読むだけ）。

| # | 題（作られた日） | 状態 | このシリーズとの関わり |
| --- | --- | --- | --- |
| 34730 | refactor-jasmine-vitest removes done() from asynchronous callbacks, so migrated tests no longer wait for them（2026-11-16） | open | [第 10 回](10-sca-jv-lifecycle.md)の 3 節。記録の「04」「05」「10」。直す PR #34787 が open |
| 26517 | getMainFilePath util function fails because of hardcoded target name（2023-11） | open | [第 4 回](04-sca-standalone.md)の 5 節。`standalone/util.ts` の 25 行目の `'build'` |
| 24497 | ng g module with route option not working with the new provideRouter（2023-01） | open | [第 2 回](02-sca-ast-utils.md)。`addRouteDeclarationToModule` が NgModule の `RouterModule` の呼び出しを探す |
| 12740 | ng add fails to find app.module.ts when using custom tsconfig.json paths（2018-10） | open | 第 4 回の 4 節。path alias の import を読まないのは standalone の道具でも同じ形 |
| 24204 | Promote standalone component helpers to public API（2022-11） | open | 第 4 回。44129f66a3 の `utility/index.ts` は `export * from './standalone'`（b14b959901、2023-06）で `addRootImport`・`addRootProvider` を出している |
| 33253 | Bare spyOn() migration silently changes test behavior（2026-05） | closed | [第 8 回](08-sca-jv-spy.md)の 1 節。直した 673dbaf89f の `mockReturnValue(undefined)` が型の検査で止まる |
| 33864 | refactors fail() call incorrectly（2026-08） | closed | [第 9 回](09-sca-jv-matcher.md)の 6 節。`expect.fail` に（ce1b60f896） |
| 33112・31941・31940 | spy call arguments・createSpyObj without base name・curried mockDate（2025-11〜2026-04） | closed | 第 8 回の 4・5 節、第 9 回の 6 節 |
| 33021・32323 | does not include describe if xdescribe was used・fails on Windows with ENOENT when creating markdown report | closed | 第 10 回の 1 節（`--add-imports` の名前の表）、[第 7 回](07-sca-jv-overview.md)の 5 節（レポートの名前） |
| PR 34602・34619 | cast createSpyObj to MockedObject・add a TODO for negated expectAsync matchers | open | 第 8 回の 4 節（TS2322）、第 9 回の 4 節（記録の「19」） |

6 節の「直っていない不具合」のうち、#34730・#26517・#24497・#12740 のほかに同じ件の issue と PR は、gh で探して見つかりませんでした（探した言葉は、各回の関数名と、`toHaveSize`・`returnValues`・`throwError`・`identity`・`discardPeriodicTasks`・`pending`・`mockReturnValue`・`report` など）。

## 5. このシリーズで見つけたもの（食い違いと不具合）

「内容」は、説明文・JSDoc・コメント（無ければ名前から期待すること）と、記録か実装で確かめた振る舞いです。行は 44129f66a3 の `packages/schematics/angular` からのパスで、「新しい本家」は origin/main（0a61cbc4bf）で同じ行を見た結果です。左に印のある行が、新しい本家で直っていない「不具合」です。第 1〜6 回の行と第 7〜10 回の行は、それぞれの回の記録のメモから集めました。

> **🧪 一覧（種類で絞れます）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sca-tests-issues)

refactor-jasmine-vitest は、44129f66a3（2026-09-10）のあと、2026-10-24〜11-17 に 11 の修正が main に入り（うち 7 つは 22.2.7 にも。第 8〜10 回の「直った」の行）、今も PR が 3 つ開いている、動きの多い所です。直っていない不具合のうち refactor のものは、変換の出力の文字列としては「正しく」、変換後を Vitest か型の検査に通して初めて見えるものがほとんどでした。utility と migrations の不具合は、spec の無いファイル（`change.ts`・`json-file.ts`・`css-import-lexer.ts`・`app_component.ts`）か、spec が通らない形（別のパッケージの builder、config schematic の名前の規則）の上にありました。

## 聞かれそうな質問

**Q. @schematics/angular の spec はどう走らせますか？**

../angular-cli で `pnpm bazel test //packages/schematics/angular:test` です。BUILD.bazel の 117 行目でパッケージの中の `*_spec.ts` を全部集めた 1 つの target なので、`--test_arg=--filter=^(describe の名前) ` で絞ります。

**Q. refactor の spec が全部通るのに、変換後の spec が落ちるのはなぜ？**

変換器の spec は文字列を比べるだけで、変換後を走らせも型を検査もしないからです（2 節）。3 節のとおり、Jasmine と意味が違う出力や、Jasmine で動かない入力を期待どおりとして固めている it もあります。

**Q. 見つけた不具合を直すとき、spec はどこに足しますか？**

refactor は各変換器の `transformers/*_spec.ts` の表に 1 行を足すのが基本です。ファイルをまたぐ不具合（第 7 回の共有の reporter）は `index_spec.ts` に 2 つのファイルを置く it を足します。utility の `change.ts`・`json-file.ts`、migrations の `css-import-lexer.ts` は spec のファイルを作るところからで、117 行目の glob に入るので BUILD.bazel は変えなくてよいです。

**Q. このシリーズの不具合で、既に issue があるものは？**

done コールバック（第 10 回）が #34730、build target の名前（第 4 回）が #26517、`provideRouter` の route（第 2 回）が #24497、path alias（第 4 回）が #12740 です。ほかは見つかりませんでした（4 節）。

## 読み終えて

- @schematics/angular の spec は 1 つの target に 863 本。このシリーズの 3 つのフォルダは 31 ファイル・476 本（utility 145・migrations 107・refactor 224）で、手元では全部通り、pending は `xit` の 1 本。
- spec の無い所：`change.ts`・`json-file.ts`・`eol.ts`・`css-import-lexer.ts`・`app_component.ts`。refactor の spec は変換後を走らせない。
- spec が実物と違う約束を固めている所：`returnValues` の鎖、`.and.identity()`、配列だけの `toHaveSize`、`it(fakeAsync)` の終わり、名前と中身の違う it と describe。
- 関わる issue は #34730・#26517・#24497・#12740。ほかの不具合の issue は見つからなかった。

---

← 前: [Jasmine から Vitest へ（4）：lifecycle と fakeAsync](10-sca-jv-lifecycle.md)
