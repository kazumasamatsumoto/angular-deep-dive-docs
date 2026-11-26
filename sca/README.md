[目次](../README.md)

# @schematics/angular の道具と移行

> utility・migrations・refactor を読む：Change と AST の道具・依存の追加・standalone の書き換え・builder の移行・Jasmine から Vitest へ

ng generate や ng update が書き換えるコードは、@schematics/angular の utility にある小さな道具で組まれています。AST を探して import を足す関数、package.json に依存を足す規則、standalone のアプリに provider を足す規則、application builder や Vitest への移行、Jasmine のテストを Vitest の書き方に直す refactor。これまでのシリーズでは個々の schematic の入口だけを読み、約 9000 行がまだ読まれていません。このシリーズでは手元の @schematics/angular を Node で本物に動かした記録と並べて、道具を 1 つずつ読みます。

全 11 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/sca)

1. [変更の単位とファイルの道具：Change・json-file・workspace](01-sca-change.md)  
   packages/schematics/angular/utility/change.ts・json-file.ts・workspace.ts・workspace-models.ts：InsertChange・RemoveChange・ReplaceChange と applyToUpdateRecorder、JSONFile の読み書き、updateWorkspace と getWorkspace、angular.json の型。
2. [AST の道具：ast-utils・ng-ast-utils・find-module](02-sca-ast-utils.md)  
   utility/ast-utils.ts・ng-ast-utils.ts・find-module.ts：findNodes と getSourceNodes、insertImport、addSymbolToNgModuleMetadata（declarations・imports・providers）、bootstrap の呼び出しを探す、モジュールを探す順。
3. [依存を足す：dependency・dependencies・generate-from-files](03-sca-dependency.md)  
   utility/dependency.ts・dependencies.ts・generate-from-files.ts：addDependency 規則（type・existing・install）、package.json の並び順、NodePackageInstallTask の予約、ファイルの雛形から生成する共通の規則。
4. [standalone のアプリを書き換える：utility/standalone](04-sca-standalone.md)  
   utility/standalone/\*：addRootImport と addRootProvider、app.config.ts と bootstrapApplication の探し方、CodeBlock の小さなテンプレート、app component の探し方。
5. [builder の移行：use-application-builder ほか](05-sca-build-migrations.md)  
   migrations/use-application-builder/\*・trust-proxy-headers・add-istanbul-instrumenter：browser から application builder への options の付け替え、server target と依存の置き換え、スタイルの ~・^ の import の書き換え（css-import-lexer）、ほかの ng update の移行。
6. [Karma から Vitest へ：migrate-karma-to-vitest](06-sca-karma-vitest.md)  
   migrations/migrate-karma-to-vitest/\*：karma.conf.js を読んで既定と比べる analyzer と comparer、karma-processor、angular.json の test target の書き換え、残すものと捨てるもの。
7. [Jasmine から Vitest へ（1）：refactor の骨組み](07-sca-jv-overview.md)  
   refactor/jasmine-vitest/index.ts・test-file-transformer.ts・utils/\*：対象のファイルの選び方、変換器を順に当てる仕組み、AST の道具、TODO のコメントと reporter。
8. [Jasmine から Vitest へ（2）：spy と型](08-sca-jv-spy.md)  
   refactor/jasmine-vitest/transformers/jasmine-spy.ts・jasmine-type.ts：spyOn・createSpy・createSpyObj・and.returnValue ほかを vi.fn・vi.spyOn に直す規則、jasmine.Spy などの型の書き換え、直せないものの印。
9. [Jasmine から Vitest へ（3）：matcher とその他](09-sca-jv-matcher.md)  
   refactor/jasmine-vitest/transformers/jasmine-matcher.ts・jasmine-misc.ts：toBeTrue・toHaveBeenCalledOnceWith・jasmine.any・objectContaining などの対応、clock・pending・fail ほかの扱い。
10. [Jasmine から Vitest へ（4）：lifecycle と fakeAsync](10-sca-jv-lifecycle.md)  
   refactor/jasmine-vitest/transformers/jasmine-lifecycle.ts・fake-async-\*.ts：fdescribe・xit・done コールバック・beforeAll の書き換え、fakeAsync・tick・flush を Vitest の偽のタイマーに直す規則。
11. [spec と issue を読む：@schematics/angular の道具を固めているもの](11-sca-tests-issues.md)  
   packages/schematics/angular の utility・migrations・refactor の spec が、このシリーズで読んだ約束をどこで固めているか、手元での走らせ方と結果、関係する issue の表と、このシリーズで見つけた食い違い。
