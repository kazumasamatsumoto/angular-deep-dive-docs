[目次](../README.md)

# ng コマンドの内側

> @angular/cli を読む：引数の読み方・schema から作るオプション・設定・パッケージマネージャー・ng add と ng update・analytics・MCP サーバー

「CLI とビルド」のシリーズでは、ng build のあとで動く @angular/build を読みました。では、ターミナルで ng と打ってから builder や schematic が呼ばれるまでには何が起きているのでしょうか。packages/angular/cli/src は、ほとんどの行がまだ引かれていません。ここには、引数を読む command-builder、JSON schema からオプションを作る仕組み、angular.json の読み書き、npm・pnpm・yarn・bun を見分けて呼ぶ層、ng add と ng update、analytics、そして AI のための MCP サーバーがあります。このシリーズでは本物の @angular/cli 22.2.7 を手元の小さなワークスペースで動かした記録と並べて、1 段ずつ読みます。

全 10 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/ngx)

1. [ng と打ってから：bin/ng・init・command-runner](01-ngx-entry.md)  
   packages/angular/cli の bin/ng.js・bootstrap.js・lib/init.ts・lib/cli/index.ts・node-version.ts・environment-options.ts・command-runner.ts・command-module.ts：グローバルとローカルの CLI の版の比べ方（init.ts の 106 行目が文字列を数として比べ、警告が一度も出ない）、Node の版の 2 つの検査（27 が止まる）、環境変数の読み方、終了コード 1・3・127 とログのファイル、yargs の設定と、既定のコマンド '\*' のせいで打ち間違いの提案が出ないこと。
2. [schema からオプションを作る：command-builder/utilities](02-ngx-options.md)  
   src/command-builder/utilities/json-schema.ts・json-help.ts・normalize-options-middleware.ts・schematics-command-module.ts・architect-command-module.ts・architect-base-command-module.ts・memoize.ts：JSON schema の型（string・boolean・number・enum・array・oneOf・key=value の map）が yargs のオプションに変わる規則、default を --help のときだけ渡す理由、required が yargs に渡らないこと、x-prompt と --defaults、位置引数の並べ方、builder の project の決め方。自作の schematic と builder で確かめる。
3. [angular.json と設定：config・json-file・completion](03-ngx-config.md)  
   src/utilities/config.ts・json-file.ts・eol.ts・completion.ts・prettier.ts・commands/config・commands/completion：ワークスペースとグローバルの設定の探し方（XDG・古い場所・~/.angular-config.json）、ng config の値の道と値の読み替え、jsonc-parser の差分でコメントと字下げを保つ方法と保てない形、ng completion と補完の質問がホームに書くもの、生成したファイルの Prettier での整形。
4. [npm・pnpm・yarn・bun を見分けて呼ぶ：package-managers](04-ngx-package-managers.md)  
   src/package-managers/\* と command-runner.ts の getConfiguredPackageManager：packageManager 欄・angular.json・lockfile（上へたどる、.git で止まる、pnpm → yarn → bun → npm）からの決め方、yarn の 1 系の見分け方、descriptor が組み立てるコマンドの文字列、出力の parsers が「無い」（E404）と「失敗」を分ける方法、dryRun でレジストリも読まないこと。本物の 4 種類 5 通りで確かめる。
5. [ng add：パッケージを入れて ng-add の schematic を走らせる](05-ngx-add.md)  
   src/commands/add/\*：版の指定が無いときの「入れてよい版」の探し方（latest → 各 major → 全部）、版を指定したときに package.json に書かれる範囲（~ が ^ に変わる）、確認の質問と --skip-confirmation・--dry-run・--registry、ng-add を持たないパッケージを入れてから取り除く流れと組み込みの schematic、ng add @angular/material の差分。
6. [ng update：版を決めて migrations を走らせる](06-ngx-update.md)  
   src/commands/update/\*：パッケージを書かないときの一覧の作り方、一時の CLI の版の決め方、版の範囲と peer の検査と --force、--migrate-only と from/to/name、git の確認。本物の ng update を 20・21 のワークスペースで動かした記録（migration の選び方は ng add と ng update の章）。
7. [ng generate・new・run・version・cache](07-ngx-generate-run.md)  
   src/commands/generate・new・run・version・cache・deploy ほか：collection と schematic の選び方（schematicCollections の順、collection:name）、ng new の collection、ng run の target の文字列、ng version の表の作り方、cache の場所と on/off、target の無い lint・e2e・deploy。
8. [analytics：何をいつ送るか](08-ngx-analytics.md)  
   src/analytics/\*・commands/analytics：同意の聞き方と保存場所、送る値の一覧（analytics-parameters）、送らない条件（CI・環境変数）、collector の形。
9. [ng mcp：CLI の MCP サーバー](09-ngx-mcp.md)  
   src/commands/mcp/\*：MCP サーバーの起動、公開するツールとリソースの一覧と説明文、--read-only・--local-only・-E と --root、どの道までを触らせるか、list\_projects と get\_best\_practices の結果。本物を stdio で起動して記録する。
10. [spec と issue を読む：ng コマンドを固めているもの](10-ngx-tests-issues.md)  
   packages/angular/cli の spec と e2e が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、area: @angular/cli の issue の表と、このシリーズで見つけた食い違い。
