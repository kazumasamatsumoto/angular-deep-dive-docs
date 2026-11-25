[目次](../README.md)

# @angular-devkit の内側

> core・schematics・architect を読む：仮想ファイルシステム・JSON schema・ワークスペース・Tree とエンジン・ワークフロー・jobs・builder の呼び方

ng generate も ng build も、その下で動いているのは @angular-devkit の 3 つのパッケージです。core はパスと仮想ファイルシステム、JSON schema の検査、angular.json の読み書きを持ち、schematics は Tree とエンジンとワークフローを、architect は builder を jobs として呼ぶ仕組みを持っています。これまでのシリーズでは、schematic の規則や ng build の入口として少しずつ引いてきましたが、約 14000 行がまだ読まれていません。このシリーズでは手元の @angular-devkit を Node で本物に動かした記録と並べて、1 層ずつ読みます。

全 12 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/dvk)

1. [パスと文字列：virtual-fs/path と utils/strings](01-dvk-path.md)  
   packages/angular\_devkit/core/src/virtual-fs/path.ts・utils/strings.ts・utils/template.ts：Path という印の付いた文字列、normalize・join・relative・dirname の規則、Windows のパスの扱い、dasherize・classify・camelize、テンプレートの小さな言語。
2. [仮想ファイルシステムの host：memory・scoped・alias・sync・record](02-dvk-host.md)  
   core/src/virtual-fs/host/\*・core/node/host.ts：Host の約束（Observable で返す読み書き）、メモリの host、別のフォルダに見せる scoped と alias、同期の包み、変更を記録してあとで流す record、Node の本物のファイルシステムへのつなぎ。
3. [JSON schema の検査：registry・transforms・visitor](03-dvk-schema.md)  
   core/src/json/schema/\*：ajv を包む CoreSchemaRegistry、format の追加、x-prompt と smart default（$default）、既定値を入れる transforms、schema の木を歩く visitor と pointer。
4. [angular.json を読み書きする：workspace](04-dvk-workspace.md)  
   core/src/workspace/\*：WorkspaceDefinition・ProjectDefinition・TargetDefinition の形、json/reader が作る Proxy と変更の帳簿（metadata）、コメントと並び順と改行を保って modify で書き戻す writer（字下げは空白 2 つ）、host の約束、architect と targets の取り違え。
5. [logger と小さな道具：logger・utils・exception](05-dvk-logger.md)  
   core/src/logger/\*・utils/\*・exception.ts・core/node/cli-logger.ts：Logger の木と level、indent と transform、PartiallyOrderedSet と PriorityQueue、deepCopy ほかの道具、例外の型。
6. [Tree：schematic が触るファイルの木](06-dvk-tree.md)  
   schematics/src/tree/\*：HostTree の読み書きと actions（create・overwrite・rename・delete）、UpdateRecorder の挿入と削除の位置、ScopedTree と DelegateTree、merge の衝突の決め方。
7. [エンジンと規則：engine・rules・formats](07-dvk-engine.md)  
   schematics/src/engine/\*・rules/\*・formats/\*：SchematicEngine が collection・schematic・context を作る順と engine host に聞くこと、addTask の予約と TaskScheduler（同じ優先度は予約の逆順、別の context の TaskId は依存にできない）、Tree 以外を返したときの例外の文、url・schematic()・partitionApplyMerge・renameTemplateFiles の規則の残り、html-selector と path の format の検査。
8. [ワークフローと engine host：sink・workflow・tools・tasks](08-dvk-workflow.md)  
   schematics/src/workflow/\*・sink の残り・tools/\*・tasks/\*：BaseWorkflow と NodeWorkflow の実行の順と lifeCycle、reporter のイベントの順、schema の既定値が入る条件、collection.json を探す engine host（相対パス・node\_modules・別名・extends・名前のキャッシュ）、npm install と RunSchematicTask の task の実行。
9. [architect の jobs：scheduler・registry・strategy](09-dvk-jobs.md)  
   architect/src/jobs/\*：Job の約束（引数・入力・出力のメッセージと state）、SimpleJobRegistry と SimpleScheduler、createJobHandler、購読・stop・ping、strategy（serialize・reuse・memoize）を同時に呼んだときの回数、dispatcher、README と実装の食い違い。
10. [Architect が builder を呼ぶまで：options・context・progress・結果](10-dvk-architect.md)  
   architect/src/architect.ts・api.ts・create-builder.ts・schedule-by-name.ts・options.ts・node/node-modules-architect-host.ts：options の重ね方（configuration は浅く、overrides は 1 段深く）、scheduleTarget と scheduleBuilder、builder の job のキャッシュ、BuilderContext の中身、progress と結果の流れ、builder が失敗・例外を投げたときの result。
11. [テストの道具：SchematicTestRunner と TestingArchitectHost](11-dvk-testing.md)  
   schematics/testing/\*・tools/node-modules-test-engine-host.ts・architect/testing/\*：schematic を手元で走らせる SchematicTestRunner（sink も post task も無い）、本番との違い、builder を試す TestingArchitectHost、テンプレートを写した一時フォルダの TestProjectHost。
12. [spec と issue を読む：@angular-devkit を固めているもの](12-dvk-tests-issues.md)  
   packages/angular\_devkit の core・schematics・architect の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、関係する issue の表と、このシリーズで見つけた食い違い。
