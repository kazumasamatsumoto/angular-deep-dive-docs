[目次](../README.md) › [@angular-devkit の内側](README.md) › 第 12 回 / 全 12 回

# spec と issue を読む：@angular-devkit を固めているもの

> packages/angular\_devkit の core・schematics・architect の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、関係する issue の表と、このシリーズで見つけた食い違い。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-tests-issues)

---

この章で分かること：このシリーズの 11 回で読んだ `@angular-devkit` の core・schematics・architect の約束を、本家の spec（`*_spec.ts`）がどこで固めていて、どこを固めていないか。手元で spec を走らせた結果、`area: @angular-devkit/*` の issue の表、そしてこのシリーズで見つけた説明と実装の食い違いと不具合の一覧です。

読む対象は `packages/angular_devkit/core`・`schematics`・`architect` の `*_spec.ts` と `BUILD.bazel` です（../angular-cli、44129f66a3）。「新しい本家」は origin/main（0a61cbc4bf、2026-11-25）です。

1. [1. パスと文字列](01-dvk-path.md)
2. [2. 仮想ファイルシステムの host](02-dvk-host.md)
3. [3. JSON schema の検査](03-dvk-schema.md)
4. [4. angular.json の読み書き](04-dvk-workspace.md)
5. [5. logger と小さな道具](05-dvk-logger.md)
6. [6. Tree](06-dvk-tree.md)
7. [7. エンジンと規則](07-dvk-engine.md)
8. [8. ワークフローと engine host](08-dvk-workflow.md)
9. [9. architect の jobs](09-dvk-jobs.md)
10. [10. Architect が builder を呼ぶまで](10-dvk-architect.md)
11. [11. テストの道具](11-dvk-testing.md)
12. **12. spec と issue**（この章）

> [!TIP]
> **新卒エンジニアへ**
>
> spec は、関数を 1 つずつ呼んで結果を確かめるテストです。`packages/angular_devkit` では、パッケージの中の決まったフォルダの `*_spec.ts` を集めた 1 つの bazel の target（`jasmine_test`、Node の jasmine）にまとまっていて、core・schematics・architect のそれぞれに、本体と `node/`（または `tools/`）の 2 つずつ、合わせて 6 つです。

## 1. 走らせ方と件数

📄 `angular-cli/packages/angular_devkit/schematics/BUILD.bazel` L37–53 （▶ の行: 38, 40, 46, 50–52）

```python
37 │ ts_project(
38 ▶     name = "schematics_test_lib",
39 │     testonly = True,
40 ▶     srcs = glob(["src/**/*_spec.ts"]),
41 │     deps = [
42 │         ":node_modules/@angular-devkit/core",
43 │         ":node_modules/rxjs",
44 │         ":schematics",
45 │         "//:node_modules/@types/jasmine",
46 ▶         "//packages/angular_devkit/schematics/testing",
47 │     ],
48 │ )
49 │ 
50 ▶ jasmine_test(
51 ▶     name = "test",
52 ▶     data = [":schematics_test_lib"],
53 │ )
```

40 行目のとおり、`schematics:test` が集めるのは `src/**/*_spec.ts` だけです。`tools/` の spec は別の BUILD.bazel の `schematics/tools:test` にあり、`tasks/` と `testing/` には spec のファイルも target もありません。46 行目、spec は `testing`（第 11 回の `SchematicTestRunner`）に依っています。

📄 `走らせたコマンド（2026-11-26、bazel はもう 1 人とロックを待ち合った）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular_devkit/core:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular_devkit/core/node:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular_devkit/schematics:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular_devkit/schematics/tools:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular_devkit/architect:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular_devkit/architect/node:test --nocache_test_results --test_output=all
```

📄 `結果`

```
//packages/angular_devkit/core:test              218 specs, 0 failures
//packages/angular_devkit/core/node:test           4 specs, 0 failures, 3 pending
//packages/angular_devkit/schematics:test        101 specs, 0 failures
//packages/angular_devkit/schematics/tools:test   31 specs, 0 failures, 2 pending
//packages/angular_devkit/architect:test          68 specs, 0 failures
//packages/angular_devkit/architect/node:test      1 spec,  0 failures
# pending: NodeJsAsyncHost can watch / NodeJsSyncHost can watch / NodeJsSyncHost rename to a non-existing dir（xit）
#          NodeWorkflow works / ExportStringRef works on package names（xit）
```

| 場所 | spec のファイル | spec の無いもの（このシリーズで読んだ所） |
| --- | --- | --- |
| `core/src/`（`virtual-fs` 6・`json` 4・`workspace` 5・`logger` 4・`utils` 4） | 23 | `utils/strings.ts`・`utils/template.ts`（第 1 回）、`ScopedHost`（第 2 回）、`visitJsonSchema` と `ɵflatten`（第 3 回）、`LevelCapLogger`（第 5 回） |
| `core/node/` | 1（`host_spec.ts`） | `cli-logger.ts`（第 5 回）、`testing/` |
| `schematics/src/`（`tree` 5・`rules` 4・`engine` 1・`sink` 2・`formats` 2） | 14 | `engine/engine.ts`（第 7 回。TaskScheduler も collection のキャッシュも）、`workflow/base.ts`（第 8 回） |
| `schematics/tools/` | 4 | `node-workflow_spec.ts` の 1 本は `xit`（下）。`node-modules-test-engine-host.ts` |
| `schematics/tasks/`・`testing/` | 0 | npm install の引数（第 8 回）、`SchematicTestRunner` そのもの（第 11 回） |
| `architect/src/`（`jobs` 4 と `index`・`api`・`options`） | 7 | `ping()`・register の 2 つ目の形・strategy の options（第 9 回）、`create-builder.ts` の progress の順（第 10 回） |
| `architect/node/`・`testing/` | 1（`jobs/job-registry_spec.ts`）・0 | `WorkspaceNodeModulesArchitectHost`（第 10 回）、`TestingArchitectHost`・`TestProjectHost`（第 11 回） |

📄 `angular-cli/packages/angular_devkit/schematics/tools/workflow/node-workflow_spec.ts` L14–27 （▶ の行: 15–18, 22–24）

```ts
14 │ describe('NodeWorkflow', () => {
15 ▶   // TODO: this test seems to either not work on windows or on linux.
16 ▶   xit('works', async () => {
17 ▶     const workflow = new NodeWorkflow(new NodeJsSyncHost(), { dryRun: true });
18 ▶     const collection = path.join(__dirname, '../../../../schematics/angular/package.json');
19 │ 
20 │     await workflow
21 │       .execute({
22 ▶         collection,
23 ▶         schematic: 'ng-new',
24 ▶         options: { name: 'workflow-test', version: '6.0.0-rc.4' },
25 │       })
26 │       .toPromise();
27 │   });
```

`NodeWorkflow` の spec は 1 本だけで、15 行目のコメント（Windows か Linux のどちらかで動かない）のまま 16 行目で `xit`（止めた it）になっています。`schematics/tools:test` の pending の 1 つがこれで、ng generate の下の `NodeWorkflow` は、手元の spec では一度も走っていません（[第 8 回](08-dvk-workflow.md)の記録が代わりです）。

## 2. 各回の約束を固めている spec と、固めていない所

各回の「テストと直し方」の表を、回ごとにまとめます。行番号は spec のファイルのものです。

| 回 | 固めている spec（ファイル 行） | 固めていない所 |
| --- | --- | --- |
| [1](01-dvk-path.md) | core の `path_spec.ts` の `normalize`（23）・`split`（86）・`asWindowsPath`（164）、schematics の `template_spec.ts` の `contentTemplate`（124） | `'C:\\..'` が `'/'` になること、1 文字の名前・UNC、`<%- %>` に数と 0。`strings.ts`・`template.ts` の spec は無い |
| [2](02-dvk-host.md) | `memory_spec.ts` の `SimpleMemoryHost`（14）、`record_spec.ts` の `CordHost`（13）の 28 個、`core/node/host_spec.ts` | file の下に書く・directory の rename・重ねた rename の中間（record\_spec.ts:175 は commit の先しか見ない）。`host_spec.ts` の 3 つは macOS と Windows で `xit` |
| [3](03-dvk-schema.md) | `registry_spec.ts` の `CoreSchemaRegistry`（14）、`prompt_spec.ts`、`transforms_spec.ts` の `addUndefinedDefaults`（12） | `$id` を持つ schema の `$ref`（transforms\_spec.ts:215 は `$id` 無し）、配列の中の `x-prompt`、`ɵflatten` |
| [4](04-dvk-workspace.md) | `core_spec.ts`・`definitions_spec.ts`・`json/reader_spec.ts`・`json/writer_spec.ts`（名前で絞って 97） | "targets" のファイルの書き戻し（spec の JSON はどれも "architect"）、CRLF とタブ。reader\_spec.ts:140 は名前が「warns」で中身は例外 |
| [5](05-dvk-logger.md) | `logger_spec.ts`・`indent_spec.ts`・`priority-queue_spec.ts` ほか（名前で絞って 22） | `IndentLogger` の `createChild` の子、`TransformLogger` の子、同じ優先度の並び（priority-queue\_spec.ts は 1 つ push するだけ） |
| [6](06-dvk-tree.md) | `host-tree_spec.ts`・`scoped_spec.ts`・`recorder_spec.ts`・`action_spec.ts`（47） | scope が `'/'` の `ScopedTree`、窓をまたぐ rename、strategy ごとの merge の衝突 |
| [7](07-dvk-engine.md) | `engine/schematic_spec.ts` の `Schematic`（50）、`rules/call_spec.ts` の `callRule`（67）、`formats/` の 2 つ | `engine.ts` の spec が無い（task の順、別の context の TaskId、private の文）。call\_spec.ts:68 は例外のクラスだけで文を見ない |
| [8](08-dvk-workflow.md) | `tools/file-system-engine-host_spec.ts` の 24 個（別名・extends・循環・private）、`sink/dryrun_spec.ts`・`host_spec.ts` | `NodeWorkflow`（`xit`）、`BaseWorkflow` の lifeCycle と失敗の後、`resolvePaths`、名前のキャッシュ、`tasks/` |
| [9](09-dvk-jobs.md) | `simple-scheduler_spec.ts` の 19、`strategy_spec.ts` の 4、`simple-registry_spec.ts`・`dispatcher_spec.ts` | `ping()`、register の 2 つ目の形の schema、strategy の options、終わった後の memoize |
| [10](10-dvk-architect.md) | `index_spec.ts` の `architect`（19）の 18、`options_spec.ts` の `mergeOptions`（11）、`api_spec.ts` | `WorkspaceNodeModulesArchitectHost`（configuration の重ね方、パスの確かめ、`loadBuilder`）、progress の順、別のパッケージの同じ名前の builder |
| [11](11-dvk-testing.md) | （道具そのものの spec は無い）。使う側の `@schematics/angular` の 37 ファイルと `architect/src/index_spec.ts` | `callRule` の parentContext、`tasks` の順、`addBuilderFromPackage` の別名 |

## 3. spec が実物と違う形を固めている所

📄 `angular-cli/packages/angular_devkit/architect/src/index_spec.ts` L111–121 （▶ の行: 111–113, 115）

```ts
111 ▶   it('runs targets parallel', async () => {
112 ▶     const run = await architect.scheduleTarget(target1, {});
113 ▶     const run2 = await architect.scheduleTarget(target1, {});
114 │     await flush();
115 ▶     expect(called).toBe(2);
116 │     expect(await run.result).toEqual(jasmine.objectContaining({ success: true }));
117 │     expect(await run2.result).toEqual(jasmine.objectContaining({ success: true }));
118 │     expect(called).toBe(2);
119 │     await run.stop();
120 │   });
121 │ 
```

同じ target（112・113 行目の `target1`）を 2 回呼んで、115 行目で 2 回走ったことを確かめます。api.ts の JSDoc（164〜166 行目）の「同じ名前の target は順に走る」とは逆の約束を、spec が固めています（[第 10 回](10-dvk-architect.md)の 3 節。記録も並んで走った）。直すなら JSDoc の方です。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler_spec.ts` L365–379 （▶ の行: 371, 374–377）

```ts
365 │     expect(resolves.length).toBe(2);
366 │     resolves[1]();
367 │ 
368 │     await new Promise((r) => setTimeout(r, 10));
369 │     expect(done).toEqual([0, 1, 2]);
370 │     expect(resolves.length).toBe(3);
371 ▶     subscription.unsubscribe();
372 │     resolves[2]();
373 │ 
374 ▶     job.stop();
375 ▶     await job.output.toPromise();
376 ▶     expect(keepGoing).toBe(false);
377 ▶     expect(done).toEqual([0, 1, 2, -1]);
378 │     expect(job.state).toBe(JobState.Ended);
379 │   });
```

it の名前は `can be cancelled by unsubscribing from the raw output`（318 行目）ですが、371 行目で購読を外した後、374 行目で `job.stop()` を呼んでから 376 行目で止まったことを見ています。[第 9 回](09-dvk-jobs.md)の 6 節の記録のとおり、購読を外すだけでは job は止まりません。名前と中身が違い、README の 227〜229 行目の「購読を外すと Stop」もこの名前と同じ誤解のままです。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/strategy_spec.ts` L244–268 （▶ の行: 248–249, 262–265）

```ts
244 │   it('works', async () => {
245 │     let started = 0;
246 │     let finished = 0;
247 │ 
248 ▶     registry.register(
249 ▶       strategy.memoize()(
250 │         createJobHandler((input: number[]) => {
251 │           started++;
252 │ 
253 │           return new Promise<number>((resolve) =>
254 │             setTimeout(() => {
255 │               finished++;
256 │               resolve(input.reduce((a, c) => a + c, 0));
257 │             }, 100),
258 │           );
259 │           // eslint-disable-next-line @typescript-eslint/no-explicit-any
260 │         }) as any,
261 │       ),
262 ▶       {
263 ▶         argument: { items: { type: 'number' } },
264 ▶         output: { type: 'number' },
265 ▶         name: 'add',
266 │       },
267 │     );
268 │ 
```

248 行目の `register(handler, { argument, output, name })` は、[第 9 回](09-dvk-jobs.md)の 2 節の「2 つ目の形」で、263〜264 行目の schema は効いていません（名前だけが付く）。この it は回数だけを見るので通ります。同じ形の `validates outputs`（simple-scheduler\_spec.ts:105）は 1 つ目の形（名前が先）なので検査が効く、という違いが spec の中にあります。

## 4. issue の表

2026-11-26 に開いている `area: @angular-devkit/core`（3 件）・`schematics`（13 件）・`architect`（2 件）のうち、このシリーズで読んだ所に関わるものです（gh は読むだけ）。

| # | 題（作られた日） | このシリーズとの関わり |
| --- | --- | --- |
| 21131 | externalSchematic executes schematics from migration.json instead of collection.json（2021-06-14） | [第 8 回](08-dvk-workflow.md)の 6 節と同じ根。エンジンの collection のキャッシュが名前だけを鍵にする（engine.ts:197〜200）ので、同じ名前で先に作った collection（issue では migration.json、記録では v1 の `dup`）が使われる。44129f66a3 と main で同じ |
| 12087 | SchematicTestRunner.callRule does not use the logger by default（2018-09-04） | [第 11 回](11-dvk-testing.md)の 4 節。既定では `NullLogger`、logger を渡すと TypeError（schematic-test-runner.ts:122） |
| 17205 | Unit testing a rule that uses mergeWith/apply fails due to missing context（2020-03-12） | 同じ 4 節。`callRule` の中の `url()` は「reading 'path'」で止まる（記録）。コメントの「本物の Schematic を作っていない」は 122 行目の `{} as Schematic` |
| 11739 | SchematicTestRunner: ability to run scheduled tasks（2018-08-01） | 第 11 回の 2 節。runner は task を予約の記録にするだけで、workflow が無いので RunSchematicTask は走らせられない |
| 21680 | Have NodePackageInstallTask use project directory if no directory specified（2021-08-31） | [第 8 回](08-dvk-workflow.md)の 8 節。cwd は `NodeWorkflow` の root（executor.ts:81） |
| 16150 | \[schematics\] more details about the missing fields（2019-11-11） | 第 8 回の 5 節の `NodeModulesEngineHost`。`SchematicMissingFieldsException` の文は名前だけで、どの collection か出さない |
| 22786 | Support executing ESM schematics（2022-03-02） | 第 8 回の 5 節の `ExportStringRef` が `require` で factory を読む（export-ref.ts:23） |
| 12479 | Progress indication for schematics（2018-10-04） | 第 8 回の lifeCycle は始まりと終わりの 6 種類だけで、進み具合は無い（architect の progress と違う） |
| 19905 | Architect#scheduleBuilder or context.scheduleBuilder results in incorrect target on context（2021-01-29） | [第 10 回](10-dvk-architect.md)。22.2.7 の記録の `scheduleBuilder('demo-builders:echo')` では `context.target` は `undefined` で、issue の `{ project: undefined, … }` の形は出なかった（schedule-by-name.ts:65 が target の無いとき足さない） |
| 14827 | applyPostTransforms should not be applied for all builder schemas（2019-06-19） | 第 10 回の 2 節。`scheduleBuilder` でも schema の object と array に `{}` と `[]` が入った（記録） |
| 23169 | Add support for "&lt;%\_", "\_%&gt;" and "-%&gt;" delimiters in templating（2022-05-18） | [第 1 回](01-dvk-path.md)のテンプレートの小さな言語の区切り |
| 27896 | Angular schematics generates blank lines through template（2024-06-21） | 第 1 回の 6 節。22.2.7 の `template('a\n<% if (true) { %>\nb\n<% } %>\nc')({})` は `"a\n\nb\n\nc"` で、`<% %>` だけの行の改行が空行として残った（手元で確かめた） |
| 16527 | Copy then delete can cause "This should never happen" error.（2020-01-02） | 文は core の `virtual-fs/host/record.ts` の 273 行目の `UnknownException`。[第 2 回](02-dvk-host.md)の CordHost（[第 6 回](06-dvk-tree.md)の HostTree の中身）の記録の組み合わせで起きる |

5 節の「不具合」の行のうち、#21131 のほかに同じ件の issue と PR は、gh で探して見つかりませんでした（探した言葉は各回の関数名と例外の文。「Unknown task dependency」「Unknown Protocol on url」「Invalid rule result」「collection cache」など）。

## 5. このシリーズで見つけたもの（食い違いと不具合）

「説明・約束」は説明文・JSDoc・コメント・README の言うこと（無ければ名前から期待すること）、「実際」は記録か実装で確かめた振る舞いです。行は 44129f66a3 で、「新しい本家」は origin/main（0a61cbc4bf）で同じ行を見た結果です。左に印のある行が、新しい本家で直っていない「不具合」です。第 1〜6 回の行は各回の記録のメモから、第 7〜11 回の行はこの章を書いた側の記録から集めました。

> **🧪 一覧（種類で絞れます）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-tests-issues)

22.2.7 で直っていたのは、テンプレートの例外（99741e8eb5・3ed20d1db0）、smart default の provider と知らないキーの文（ad04d689bb・c0e6b3cf68）、`DelegateTree` の `partition`・`filter`（e7fd1bd9cb・1854c1714d）、`chain` の入れ子（cf1f3b9d43）で、どれも main にも入っています。第 7〜11 回の不具合は、どれも main で同じ行のままでした。

## 聞かれそうな質問

**Q. @angular-devkit の spec はどこで走らせますか？**

../angular-cli で `pnpm bazel test //packages/angular_devkit/<core|schematics|architect>:test` と、`core/node:test`・`schematics/tools:test`・`architect/node:test` の 6 つです（BUILD.bazel の `jasmine_test(name = "test")`）。Node の jasmine なので `--test_arg=--filter=<describe の名前>` で絞れます。

**Q. 見つけた不具合を直すとき、spec はどこに足しますか？**

エンジンと workflow は spec のファイルが無いので、`schematics/src/engine/engine_spec.ts` と `src/workflow/base_spec.ts` を作るところからです（40 行目の glob に入るので BUILD.bazel は変えなくてよい）。jobs は `simple-scheduler_spec.ts`・`strategy_spec.ts`・`simple-registry_spec.ts`、Architect のキャッシュは `index_spec.ts`（ただし `TestingArchitectHost` では起きないので、`WorkspaceNodeModulesArchitectHost` の spec を `architect/node/` に作る）、runner は `schematics/testing/` に新しく作ります。

**Q. spec が全部通っているのに、なぜ不具合があるのですか？**

2 節の表のとおり、不具合の多くは spec の無いファイル（`engine.ts`・`workflow/base.ts`・`tasks/`・`testing/`・Node の host）か、spec が通らない道（購読を外しただけ・2 つ目の register の形・`xit`）の上にあります。3 節の 3 つは、spec の名前や入力が実物の約束と違う形でした。

**Q. このシリーズの不具合で、既に issue があるものは？**

collection の名前のキャッシュ（第 8 回）は #21131 と同じ根で、runner の `callRule`（第 11 回）は #12087・#17205 と同じ所です。ほかは見つかりませんでした（4 節）。

## 読み終えて

- @angular-devkit の spec は 6 つの target に 423 本（218・4・101・31・68・1）。手元では全部通り、pending は `xit` の 5 本。
- spec の無い所：`engine.ts`・`workflow/base.ts`・`tasks/`・`testing/`・`WorkspaceNodeModulesArchitectHost`・`strings.ts`・`template.ts`。不具合の多くはここにあった。
- spec が実物と違う約束を固めている所：同じ target は並んで走る（JSDoc と逆）、「購読を外すと止まる」という名前の it、効いていない schema を渡す memoize の it。
- 関わる issue は #21131（collection の名前のキャッシュ）と #12087・#17205（runner の callRule）。ほかの不具合の issue は見つからなかった。

---

← 前: [テストの道具：SchematicTestRunner と TestingArchitectHost](11-dvk-testing.md)
