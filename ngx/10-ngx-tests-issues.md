[目次](../README.md) › [ng コマンドの内側](README.md) › 第 10 回 / 全 10 回

# spec と issue を読む：ng コマンドを固めているもの

> packages/angular/cli の spec と e2e が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、area: @angular/cli の issue の表と、このシリーズで見つけた食い違い。

angular/angular-cli · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-tests-issues)

---

この章で分かること：このシリーズの 9 回で読んだ `packages/angular/cli` の約束を、本家の unit の spec と e2e がどこで固めていて、どこを固めていないか。手元で spec を走らせた結果、`area: @angular/cli` の issue の表、そしてこのシリーズで見つけた説明と実装の食い違いと不具合の一覧です。

読む対象は `packages/angular/cli/` の `*_spec.ts`（21 ファイル）と BUILD.bazel、`tests/e2e/tests/` の `commands/`・`update/`・`generate/`・`misc/` です（../angular-cli、44129f66a3）。e2e は重いので走らせず、読むだけにしました。

1. [1. ng と打ってから](01-ngx-entry.md)
2. [2. schema からオプション](02-ngx-options.md)
3. [3. angular.json と設定](03-ngx-config.md)
4. [4. パッケージマネージャー](04-ngx-package-managers.md)
5. [5. ng add](05-ngx-add.md)
6. [6. ng update](06-ngx-update.md)
7. [7. generate・new・run・version](07-ngx-generate-run.md)
8. [8. analytics](08-ngx-analytics.md)
9. [9. ng mcp](09-ngx-mcp.md)
10. **10. spec と issue**（この章）

> [!TIP]
> **新卒エンジニアへ**
>
> unit の spec は、関数を 1 つずつ呼んで結果を確かめるテストで、`packages/angular/cli` では 1 つの target（`//packages/angular/cli:test`、Node の jasmine）にまとまっています。e2e は本物の `ng` を一時のワークスペースで動かすテストで、`tests/e2e/tests/` の 1 ファイルが 1 本です。このシリーズの食い違いと不具合の多くは、どちらにも無い形の上にありました。

## 1. 走らせ方と件数

📄 `走らせたコマンド`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=<describe の名前>"
```

📄 `結果（手元の bazel、2026-11-24）`

```
//packages/angular/cli:test                                257 specs, 0 failures
# --test_arg=--filter=<名前>（部分一致の件数、どれも 0 failures）
parseJsonSchemaToOptions 16   memoize 18   discover 12   PackageManager 27   parsers 57
batchFilesByArgumentLength 7  UpdateResolver 14   angularMajorCompatGuarantee 9
resolveFallbackMigrations 3   RegistryClient 4    CLI cache config utilities 4
createRootRestrictedHost 3    MCP Workspace Utils 22   MCP Utils 4   List Projects Tool 3
Run Target Tool 13   Serve Tools 9   Doc Search Tool 2   migrateSingleFile 8   migrateTestFile 3
```

`packages/angular/cli` の src と lib の .ts（spec と testing を除く）107 ファイルのうち、同じ名前の `_spec.ts` を持つのは 20 です。spec のある場所は command-builder の `json-schema`、`package-managers/`、`commands/update/`、`commands/cache/utilities`、`commands/mcp/` の一部、`utilities/memoize`・`prettier` で、`lib/`（`init.ts`・`cli/index.ts`）、`command-runner.ts`、`analytics/`、`commands/generate`・`new`・`run`・`version`・`add`・`config`・`completion` には unit の spec がありません（`version-info_spec.ts` と `config/cli_spec.ts` は 22.2.7 で足された）。

## 2. 各回の約束を固めている spec と、固めていない所

各回の「テストと直し方」の表を、回ごとにまとめます。行番号は spec のファイルのものです。

| 回 | 固めている spec（ファイル 行） | 固めていない所 |
| --- | --- | --- |
| [1](01-ngx-entry.md) | e2e の misc/version.ts（L7〜21）・commands/unknown-option.ts（L5〜16）・commands/help/ | グローバルとローカルの版の警告、知らないコマンドと打ち間違いの提案。init.ts・command-runner.ts の unit の spec は無い |
| [2](02-ngx-options.md) | json-schema\_spec.ts の `parseJsonSchemaToOptions`（14）の型ごとの it、memoize\_spec.ts | oneOf の array（22.3.0 で直った）、positional の並べ方（22.2.7 で it を足した）。memoize\_spec.ts L85 は not の抜けた例外の文をそのまま固めている |
| [3](03-ngx-config.md) | prettier\_spec.ts、e2e の commands/config/・commands/completion/ | コメントと字下げの保ち方、get がファイルを作ること。completion.ts の e2e（L207〜228）は zsh が読まない .zsh\_profile に足すことを固めている |
| [4](04-ngx-package-managers.md) | discovery\_spec.ts の `discover`（12）、package-manager\_spec.ts、parsers\_spec.ts | dryRun の PackageManager が読むコマンドも止めること、pnpm 12 の ERR\_PNPM\_\* のエラー、yarn 1 系の無い版 |
| [5](05-ngx-add.md) | e2e の commands/add/（peer.ts L41、version-specifier.ts L21〜46 ほか 16 本） | `commands/add/cli.ts` の unit の spec は無い。`--dry-run` は e2e に無い |
| [6](06-ngx-update.md) | update-resolver\_spec.ts の `angularMajorCompatGuarantee`（23）・`UpdateResolver`（41）・`RegistryClient`（678）、cli\_spec.ts の `resolveFallbackMigrations`（15） | 一覧の表（`printUpdateUsageMessage`）、一時の CLI の版（`getCLIUpdateRunnerVersion`）、`--migrate-only` の migrations の場所。e2e の一覧の確かめは TODO でコメントのまま（3 節） |
| [7](07-ngx-generate-run.md) | cache/utilities\_spec.ts（4 本）、e2e の generate/schematics-collections.ts（L54〜82）・commands/run-configuration-option.ts | 無い schematic の名前の文、`defaultCollection`、`ng run` の 4 つ目のコロン |
| [8](08-ngx-analytics.md) | e2e の commands/analytics/ の 3 本 | unit の spec は 0 本。`{uid}` の形の表示、ワークスペースの中で聞いた答えの置き場所。`ng update` で聞かないことの e2e は `--help` で打つので handler を通らない（3 節） |
| [9](09-ngx-mcp.md) | host\_spec.ts・workspace-utils\_spec.ts・tools/projects\_spec.ts・run-target・devserver・zoneless の spec（名前で絞った 9 つの describe で 67 本） | `mcp-server.ts`・`cli.ts`・`best-practices.ts` の spec は無い。`--root` だけで外のワークスペースを渡す形、`selectorPrefix`、`runner` の無い unit-test（3 節） |

## 3. spec が実物と違う形を固めている所

📄 `angular-cli/packages/angular/cli/src/commands/mcp/tools/projects_spec.ts` L36–47 （▶ の行: 39, 43–45）

```ts
36 │     const projects = new workspaces.ProjectDefinitionCollection();
37 │     const targets = new workspaces.TargetDefinitionCollection();
38 │     targets.set('build', { builder: '@angular-devkit/build-angular:application' });
39 ▶     targets.set('test', { builder: '@angular/build:unit-test', options: { runner: 'vitest' } });
40 │     targets.set('lint', { builder: '@angular-eslint/builder:lint' });
41 │     targets.set('e2e', { builder: '@cypress/schematic:cypress' });
42 │ 
43 ▶     projects.set('my-app', {
44 ▶       root: 'projects/my-app',
45 ▶       extensions: { projectType: 'application', prefix: 'app' },
46 │       targets,
47 │     });
```

[第 9 回](09-ngx-mcp.md)の 6 節の 2 つの欠けは、この偽のワークスペースの上では起きません。45 行目は `prefix` を `extensions` に入れますが、本物の `readWorkspace` は `prefix` を決まった項目として `project.prefix` に置きます。39 行目は `runner: 'vitest'` を書きますが、22.2.7 の `ng new` が作る test の target は `runner` を書きません。同じ spec の L90 の `unitTestFramework` の expect は通り、`selectorPrefix` を見る expect はありません。

📄 `angular-cli/tests/e2e/tests/update/update-multiple-versions.ts` L13–29 （▶ の行: 18, 20–22, 29）

```ts
13 │     const extraArgs = ['--force'];
14 │     if (isPrereleaseCli()) {
15 │       extraArgs.push('--next');
16 │     }
17 │ 
18 ▶     // TODO(alanagius): investigate how to re-enable this. This is failing but it's correct since we are using the public registry.
19 │     // Update Angular from v13 to 14
20 ▶     // const { stdout } = await ng('update', ...extraArgs);
21 ▶     // if (!/@angular\/core\s+13\.\d\.\d+ -> 14\.\d\.\d+\s+ng update @angular\/core@14/.test(stdout)) {
22 ▶     //   // @angular/core                      13.x.x -> 14.x.x         ng update @angular/core@14
23 │     //   throw new Error(
24 │     //     `Output didn't match "@angular/core                      13.x.x -> 14.x.x         ng update @angular/core@14". OUTPUT: \n` +
25 │     //       stdout,
26 │     //   );
27 │     // }
28 │ 
29 ▶     const { message } = await expectToFail(() => ng('update', '@angular/core', ...extraArgs));
```

[第 6 回](06-ngx-update.md)の 2 節の一覧の表（2 メジャー先を文字列の比較で選ぶ）を確かめる部分が、18 行目の TODO とともにコメントになっています。21 行目の正規表現 `13\.\d\.\d+ -> 14\.\d\.\d+` は版の形しか見ないので、戻しても `21.2.9` を見分けません。動いているのは 29 行目の 2 メジャーの拒否だけです。

📄 `angular-cli/tests/e2e/tests/commands/analytics/ask-analytics-command.ts` L40–53 （▶ の行: 40, 42, 48–50）

```ts
40 ▶   // CLI should skip analytics prompt during `ng update`.
41 │   await mockHome(async () => {
42 ▶     const { stdout } = await execWithEnv('ng', ['update', '--help'], {
43 │       ...process.env,
44 │       NG_FORCE_TTY: '1',
45 │       NG_FORCE_AUTOCOMPLETE: 'false',
46 │     });
47 │ 
48 ▶     assert.doesNotMatch(
49 ▶       stdout,
50 ▶       ANALYTICS_PROMPT,
51 │       'CLI prompted for analytics permission during an update where it should not have.',
52 │     );
53 │   });
```

40 行目の「`ng update` の間は analytics を聞かない」を、42 行目は `ng update --help` で確かめます。`--help` は yargs が説明を出して終わり、コマンドの handler（command-module.ts の `getAnalytics`）まで来ないので、`ng update` の `shouldReportAnalytics = false`（update/cli.ts L61）と `skipPrompt`（command-module.ts L155〜159）のどちらを消しても、この it は通ります（[第 8 回](08-ngx-analytics.md)の 1 節）。

## 4. issue の表

2026-11-24 に開いている `area: @angular/cli` は 25 件で、そのうちこのシリーズで読んだ所に関わるものと、gh で読んで取り足した閉じたものです（gh は読むだけ）。

| # | 題 | 状態 | このシリーズとの関わり |
| --- | --- | --- | --- |
| 16549 | Running \`ng version\` outside an Angular project has confusing output（2020-01-05） | open | 第 7 回の 4 節。外では表が出ず、Angular の行も出ない（記録のとおり） |
| 16020 | Failed update prevents further updates（2019-11-01） | open | 第 6 回。package.json を先に書くので、失敗のあとの一覧は「済み」と言う（[ng add と ng update の章](../cli/16-cli-add-update.md)の 7 節） |
| 16016 | Provide better story for individual migration results（2019-11-01） | open・ng update DX | 第 6 回の 6 節の「何も出さずに 0」 |
| 29178 | Streamlining the migration experience（2024-12-18） | open・in backlog | 第 6 回の `--migrate-only` と一時の CLI |
| 26512 | \[Yarn3\] Installing temporary version of @angular/cli fails（2023-11-28） | open | 第 6 回の 3 節の `runTempBinary` |
| 21660 | CLI generates items in unexpected workspace directories（2021-08-26） | open | 第 7 回の 1 節のカレントディレクトリのプロジェクト |
| 30947 | Allow using Deno as package manager（2025-08-18） | open | 第 4 回の descriptor の無い名前 |
| 24582 | Provide option to disable autocompletion（2023-01-20） | open | 第 3 回の completion |
| 32922 | Allowing MCP server to discover and call available Angular schematics（2026-04-02） | open | 第 9 回の 2 節の instructions の「ng generate … --help をシェルで」 |
| 32130 | Angular CLI MCP server integration via Gemini CLI behaves inconsistently（2025-12-15） | open・needs: investigation | 第 9 回。サーバーの警告が出ない（1 節）ので、利用者から理由が見えない |
| 34716 | Add MCP to commonly used MCP registries（2026-11-13） | open | 第 9 回の 1 節の設定の例 |
| 30696 | Running the optional angular build migration installs incompatible version of @angular/build（2025-07-10） | closed（2026-10-12、#34304） | 第 6 回の 6 節と同じ根（migrate-only で一時の latest の CLI に移る）。PR #32942（migrate-only で版の検査を飛ばす）は 2026-04-07 に取り込まれずに閉じられた |
| 33077 | Security: Angular CLI MCP roots bypass via unvalidated workspace path（2026-04-28） | closed（2026-04-30、ff88f491da） | 第 9 回の 5 節の `isAllowedWorkspacePath` を入れた件。`--root`（2026-08-04）はそのあとに足され、この検査に入っていない |
| 31097 | Angular CLI MCP Server - get\_best\_practices tool is not provided（2025-09-02） | closed（2025-09-04） | 第 9 回の 7 節の `get_best_practices` が一覧に出ないという報告。版ごとの案内（68e711307e、2025-10-17）より前の件 |

5 節の「不具合」の行のうち新しい本家で直っていないもの（一覧の版、`^21` の一時の CLI、`--migrate-only` の migrations の場所、MCP の警告、`--root`、`get_best_practices` の `createRequire`、`selectorPrefix`、`unitTestFramework`、`{uid}` の表示と、第 1〜5 回の行）は、gh で同じ件の issue と PR を探しましたが、#30696 と #32942 のほかは見つかりませんでした（探した言葉は各回の本文の関数名と文）。

## 5. このシリーズで見つけたもの（食い違いと不具合）

「説明・約束」は説明文・コメント・help の文の言うこと、「実際」は記録か実装で確かめた振る舞いです。行は 44129f66a3 で、「新しい本家」は origin/main（de5620f18d、2026-11-23）で同じ行を見た結果です。左に印のある行が、新しい本家で直っていない「不具合」です。

> **🧪 一覧（種類で絞れます）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-tests-issues)

## 聞かれそうな質問

**Q. `packages/angular/cli` の spec はどこで走らせますか？**

../angular-cli で `pnpm bazel test //packages/angular/cli:test` の 1 つです（BUILD.bazel の `jasmine_test(name = "test")`）。Node の jasmine なので `--test_arg=--filter=<describe の名前>` で絞れ、件数は部分一致の数です（1 節）。e2e は `tests/e2e/` の別の仕組みで、本物のパッケージを作って一時のワークスペースで動かします。

**Q. 見つけた不具合を直すとき、spec はどこに足しますか？**

`ng update` の版の選び方は update-resolver\_spec.ts（偽の registry の metadata を渡す形が既にある）、一時の CLI の版は cli-version.ts に新しい spec、MCP の 3 つは workspace-utils\_spec.ts と tools/projects\_spec.ts（3 節の偽のワークスペースを本物の形に直す）と、新しい best-practices\_spec.ts です。analytics は unit の spec が無いので `analytics_spec.ts` を作るところからです。

**Q. このシリーズの不具合は、新しい本家で直っていますか？**

第 6〜9 回の不具合は、どれも origin/main で同じ行のままでした。直っていたのは `ng version` の例外（2e0f48e3ff）・git worktree のキャッシュの道（b198044048）・`identifer` の誤字などで、これらは手元の 22.2.7 にも入っています。第 1〜5 回の直り済みの行は、5 節の「直った」で絞ると見られます。

**Q. spec が通っているのに不具合があるのはなぜですか？**

3 節の 3 つのように、spec の入力が実物と違う形（`extensions` の `prefix`、`runner` を書いた test の target）だったり、確かめたい道を通らない打ち方（`--help`）だったり、確かめる部分がコメントになっていたりするからです。projects\_spec.ts は、偽のワークスペースを本物の形（`prefix` を外、`runner` なし）にすると、projects.ts L351 が `undefined` を返すので L90 の expect が落ちます。直すときは先に spec の入力を本物の形にします。

## 読み終えて

- `packages/angular/cli` の unit の spec は 1 つの target に 257 本。107 のソースのうち spec を持つのは 20 で、入口・analytics・多くのコマンドには無い。
- 食い違いと不具合は、spec の無い形か、spec が実物と違う形で確かめている所にあった。
- 第 6〜9 回の不具合（一覧の版、`^21` の一時の CLI、`--migrate-only`、MCP の警告・`--root`・版ごとの案内・`list_projects` の 2 つ）は、新しい本家でも直っていない。
- 関わる issue は、`--migrate-only` の #30696（migration の側で閉じた）と、MCP の roots の #33077（`--root` より前に閉じた）。ほかは見つからなかった。

---

← 前: [ng mcp：CLI の MCP サーバー](09-ngx-mcp.md)
