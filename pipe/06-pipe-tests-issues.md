[目次](../README.md) › [パイプを書くと何を宣言したことになるか](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：pipe の振る舞いを決めているテスト

> core の acceptance/pipe\_spec.ts（28 本の it が 43 件になる）、コンパイラの compliance テストの pipe の 20 個の test case、型チェックとパーサーの spec が、このシリーズの約束をどこで固めているか。手元で走らせた件数。題に pipe を含む開いている issue と、2025-06 以降に閉じた issue の表、どの issue がどの章の行に関係するか。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pipe-tests-issues)

---

シリーズの最後に、`| date` と 1 行書いたことで生まれる約束――定義・名前の解決・命令・インスタンスの数と寿命・型チェック・書ける場所――が、本家のどの spec で固められているかを地図にします。そのうえで手元で走らせた件数を並べ、題に pipe を含む issue（開いている 7 件と、2025-06-01 以降に閉じた 28 件、それに第 5 回に関係する 1 件）を、このシリーズと既存の章に振り分けます。

読む対象は `packages/core/test/acceptance/pipe_spec.ts`（1085 行）、`packages/compiler-cli/test/compliance/test_cases/` の pipe の test case、型チェックの `compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` と `compiler-cli/test/ngtsc/template_typecheck_spec.ts`、パーサーの `compiler/test/expression_parser/parser_spec.ts` です。Bazel のターゲットの読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)、1 本だけ走らせるやり方は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、compliance テストの形は[spec の読み方](../contrib/06-contrib-reading-specs.md)の章にあります。

1. [1. 1 行の | が生むもの](01-pipe-what-declared.md)
2. [2. @Pipe が作るもの](02-pipe-class-def.md)
3. [3. 名前の解決](03-pipe-name-resolution.md)
4. [4. 書ける場所と書けない場所](04-pipe-where-allowed.md)
5. [5. インスタンスの数と寿命](05-pipe-instances-lifecycle.md)
6. **6. spec と issue**（この章）

## 1. 約束と spec の地図

シリーズの共通の 6 つの約束と、それを確かめている spec です。行は ../angular（22.2.0-next.7、8576f161ae4）のものです。

| 約束 | 確かめている spec（行） | 章 |
| --- | --- | --- |
| @Pipe のクラスは static な定義（ɵpipe と ɵfac）を持つだけ | compliance の `r3_compiler_compliance/components_and_directives/pipes`（should render pipes ほか）・`standalone`（should properly compile a standalone pipe）・`r3_view_compiler_di/di`（pipe と injectable の 2 つのデコレーター）。pipe\_spec.ts 359 行目（Injectable を継承した pipe の DI） | [第 2 回](02-pipe-class-def.md) |
| 名前 date → クラス DatePipe を解決し、dependencies に入れる | pipe\_spec.ts 147・195・284 行目（同じ名前があるときに後ろが勝つ）、930〜1062 行目（見つからないときの実行時のエラー）。template\_typecheck\_spec.ts 1886・1913 行目（NG8004） | [第 3 回](03-pipe-name-resolution.md) |
| 作成の ɵɵpipe と更新の ɵɵpipeBindN。pure なら引数が同じ限り前の値 | compliance の `pipes`（should use appropriate function for a given no of pipe arguments）。pipe\_spec.ts 57〜129 行目、describe `pure`（407）・`impure`（454）・`pure pipe error handling`（784） | [第 1 回](01-pipe-what-declared.md)・[pipe の仕組み](../cmn/06-cmn-pipe-mechanism.md) |
| インスタンスは「書いた場所 × ビュー」ごと。DI はその場所のノード、壊れると ngOnDestroy | pipe\_spec.ts describe `lifecycles`（529）・`injection mechanism`（563）。let\_spec.ts 198 行目、control\_flow\_for\_spec.ts 147 行目ほか。compliance の `r3_view_compiler_let`（should not optimize away declareLet if expression is using a pipe） | [第 5 回](05-pipe-instances-lifecycle.md) |
| 型チェックで `_pipe1.transform(x, 'short')` になる | type\_check\_block\_spec.ts describe `config.checkTypeOfPipes`（1439）、template\_typecheck\_spec.ts 1941 行目（should report an error with pipe bindings） | [型チェックの pipe](../typecheck/15-typecheck-refs-pipes.md) |
| 書けない場所がある | parser\_spec.ts 485・1063・1107・1611 行目、r3\_template\_transform\_spec.ts 709・2465 行目、template\_typecheck\_spec.ts 7038 行目。pipe\_spec.ts 322 行目（三項演算子の中） | [第 4 回](04-pipe-where-allowed.md) |

## 2. pipe\_spec.ts の地図

`packages/core/test/acceptance/pipe_spec.ts` の `it(` の行は 28 本で、Node で走るのは 43 件です。下の表は、行ごとの describe と、その it が固めている章（この章の書き手が振り分けたもの）です。

| 章 | it の行 | 走る件数 |
| --- | --- | --- |
| [第 1 回 1 行の \| が生むもの](01-pipe-what-declared.md) | 4 | 4 |
| [第 2 回 @Pipe が作るもの](02-pipe-class-def.md) | 1 | 1 |
| [第 3 回 名前の解決](03-pipe-name-resolution.md) | 9 | 15 |
| [第 4 回 書ける場所と書けない場所](04-pipe-where-allowed.md) | 1 | 1 |
| [第 5 回 インスタンスの数と寿命](05-pipe-instances-lifecycle.md) | 6 | 6 |
| [pipe の仕組み（pure と impure）](../cmn/06-cmn-pipe-mechanism.md) | 7 | 16 |

| 行 | describe（行） | it | 件数 | 章 |
| --- | --- | --- | --- | --- |
| 57 | pipe（35） | `should support interpolation` | 1 | [第 1 回 1 行の \| が生むもの](01-pipe-what-declared.md) |
| 75 | pipe（35） | `should support bindings` | 1 | [第 1 回 1 行の \| が生むもの](01-pipe-what-declared.md) |
| 111 | pipe（35） | `should support arguments in pipes` | 1 | [第 1 回 1 行の \| が生むもの](01-pipe-what-declared.md) |
| 129 | pipe（35） | `should support calling pipes with different number of arguments` | 1 | [第 1 回 1 行の \| が生むもの](01-pipe-what-declared.md) |
| 147 | pipe（35） | ``should pick a Pipe defined in `declarations` over imported Pipes`` | 1 | [第 3 回 名前の解決](03-pipe-name-resolution.md) |
| 195 | pipe（35） | `should respect imported module order when selecting Pipe (last imported Pipe is used)` | 1 | [第 3 回 名前の解決](03-pipe-name-resolution.md) |
| 249 | pipe（35） | `should do nothing when no change` | 1 | [pipe の仕組み（pure と impure）](../cmn/06-cmn-pipe-mechanism.md) |
| 284 | pipe（35） | `should support duplicates by using the later entry` | 1 | [第 3 回 名前の解決](03-pipe-name-resolution.md) |
| 322 | pipe（35） | `should support pipe in context of ternary operator` | 1 | [第 4 回 書ける場所と書けない場所](04-pipe-where-allowed.md) |
| 359 | pipe（35） | `should be able to use DI in a Pipe that extends an Injectable` | 1 | [第 2 回 @Pipe が作るもの](02-pipe-class-def.md) |
| 408 | pure（407） | `should call pure pipes only if the arguments change` | 1 | [pipe の仕組み（pure と impure）](../cmn/06-cmn-pipe-mechanism.md) |
| 475 | impure（454） | `should call impure pipes on each change detection run` | 1 | [pipe の仕組み（pure と impure）](../cmn/06-cmn-pipe-mechanism.md) |
| 503 | impure（454） | `should not cache impure pipes` | 1 | [pipe の仕組み（pure と impure）](../cmn/06-cmn-pipe-mechanism.md) |
| 530 | lifecycles（529） | `should call ngOnDestroy on pipes` | 1 | [第 5 回 インスタンスの数と寿命](05-pipe-instances-lifecycle.md) |
| 564 | injection mechanism（563） | `should be able to handle Service injection` | 1 | [第 5 回 インスタンスの数と寿命](05-pipe-instances-lifecycle.md) |
| 598 | injection mechanism（563） | `should be able to handle Token injections` | 1 | [第 5 回 インスタンスの数と寿命](05-pipe-instances-lifecycle.md) |
| 636 | injection mechanism（563） | `should be able to handle Module injection` | 1 | [第 5 回 インスタンスの数と寿命](05-pipe-instances-lifecycle.md) |
| 673 | injection mechanism（563） | `should inject the ChangeDetectorRef of the containing view when using pipe inside a component input` | 1 | [第 5 回 インスタンスの数と寿命](05-pipe-instances-lifecycle.md) |
| 727 | injection mechanism（563） | `should inject the ChangeDetectorRef of the containing view when using pipe inside a component input which has child nodes` | 1 | [第 5 回 インスタンスの数と寿命](05-pipe-instances-lifecycle.md) |
| 790 | pure pipe error handling（784） | `should not re-invoke pure pipes if it fails initially` | 1 | [pipe の仕組み（pure と impure）](../cmn/06-cmn-pipe-mechanism.md) |
| 822 | pure pipe error handling（784） | `should display the last known result from a pure pipe when it throws` | 1 | [pipe の仕組み（pure と impure）](../cmn/06-cmn-pipe-mechanism.md) |
| 870 | pure pipe error handling with multiple arguments（867） | `should not invoke … argument pure pipe second time if it throws unless input changes` | 10 | [pipe の仕組み（pure と impure）](../cmn/06-cmn-pipe-mechanism.md) |
| 930 | missing pipe detection logic (inside …（927） | `should throw an error if a pipe is not found in a component` | 2 | [第 3 回 名前の解決](03-pipe-name-resolution.md) |
| 949 | missing pipe detection logic (inside …（927） | `should throw an error if a pipe is not found inside an inline template` | 2 | [第 3 回 名前の解決](03-pipe-name-resolution.md) |
| 973 | missing pipe detection logic (inside …（927） | `should throw an error if a pipe is not found inside a projected content` | 2 | [第 3 回 名前の解決](03-pipe-name-resolution.md) |
| 1006 | missing pipe detection logic (inside …（927） | `should throw an error if a pipe is not found inside a projected content in an inline template` | 2 | [第 3 回 名前の解決](03-pipe-name-resolution.md) |
| 1041 | missing pipe detection logic (inside …（927） | `should throw an error if a pipe is not found in a property binding` | 2 | [第 3 回 名前の解決](03-pipe-name-resolution.md) |
| 1062 | missing pipe detection logic (inside …（927） | `should throw an error if a pipe is not found inside a structural directive input` | 2 | [第 3 回 名前の解決](03-pipe-name-resolution.md) |

28 本が 43 件になるのは、2 か所で it をループの中に書いているからです。

📄 `angular/packages/core/test/acceptance/pipe_spec.ts` L867–870 （▶ の行: 869–870）

```ts
867 │     describe('pure pipe error handling with multiple arguments', () => {
868 │       const args: string[] = new Array(10).fill(':0');
869 ▶       for (let numberOfPipeArgs = 0; numberOfPipeArgs < args.length; numberOfPipeArgs++) {
870 ▶         it(`should not invoke ${numberOfPipeArgs} argument pure pipe second time if it throws unless input changes`, () => {
```

📄 `angular/packages/core/test/acceptance/pipe_spec.ts` L919–921 （▶ の行: 919）

```ts
919 ▶   [false, true].forEach((componentIsStandalone) => {
920 │     const expectedThrowRegex = new RegExp(
921 │       "The pipe 'testMissingPipe' could not be found in the 'TestComponent' component." +
```

- 869 行目の `for` は、引数 0〜9 個の pure な pipe で「throw したら引数が変わるまで呼ばない」を 10 回確かめます（870 行目の it が 10 件）。`ɵɵpipeBind1`〜`4` と `ɵɵpipeBindV` の全部の道を通すためです（[pipe の仕組みの章](../cmn/06-cmn-pipe-mechanism.md)）。
- 919 行目の `forEach` は、見つからない pipe の 6 本の it を、standalone のコンポーネントと NgModule のコンポーネントで 2 回ずつ作ります（12 件）。エラーの文の後半が「@Component.imports」か「module」かで変わるのを確かめるためです（[第 3 回](03-pipe-name-resolution.md)）。
- 一番多いのは[pipe の仕組み](../cmn/06-cmn-pipe-mechanism.md)（pure と impure とエラーのあと）の 16 件、次が[第 3 回](03-pipe-name-resolution.md)の 15 件です。第 5 回の DI の it は 5 本で、どれもコンストラクタで受けています（第 5 回の 4 節）。

📄 `angular/packages/core/test/acceptance/pipe_spec.ts` L333–353 （▶ の行: 334, 347, 352）

```ts
333 │     @Component({
334 ▶       template: `{{ condition ? 'a' : ('b' | pipe) }}`,
335 │       standalone: false,
336 │ 
337 │       changeDetection: ChangeDetectionStrategy.Eager,
338 │     })
339 │     class App {
340 │       condition = false;
341 │     }
342 │ 
343 │     TestBed.configureTestingModule({declarations: [App, MyPipe]});
344 │     const fixture = TestBed.createComponent(App);
345 │     fixture.detectChanges();
346 │ 
347 ▶     expect(fixture.nativeElement).toHaveText('b');
348 │ 
349 │     fixture.componentInstance.condition = true;
350 │     fixture.changeDetectorRef.markForCheck();
351 │     fixture.detectChanges();
352 ▶     expect(fixture.nativeElement).toHaveText('a');
353 │   });
```

322 行目の it は、三項演算子の分岐の中の pipe です。334 行目は `('b' | pipe)` と括弧で包んでいますが、[第 4 回](04-pipe-where-allowed.md)の 7 節のとおり、括弧なしの `condition ? 'a' : 'b' | pipe` でも木は同じ `Conditional(condition, 'a', Pipe(pipe)['b'])` です。347 行目で `false` のときに pipe を通した 'b'、352 行目で `true` のときに 'a' を確かめます。

../angular-main（74961c66242）では、この spec は 2026-10-06 の ecbc89b465c（refactor(core): modernize unit tests across all packages）で書き直され、969 行になりました。`standalone: false` と `TestBed.configureTestingModule({declarations: …})` が `imports: […]` に、`changeDetection: ChangeDetectionStrategy.Eager` の行が消えています。it の行は同じ 28 本です。上の表の行番号は、../angular のものです。

## 3. コンパイラの側：compliance と型チェックとパーサー

compliance テストは、test case の .ts をコンパイルし、出力が期待の .js と同じかを比べます。TEST\_CASES.json の説明に pipe を含む test case は 20 個あります（../angular で数えたもの）。

| ディレクトリ | 説明（TEST\_CASES.json） | 章 |
| --- | --- | --- |
| r3\_compiler\_compliance/components\_and\_directives | should instantiate pipes in a closure when they are forward referenced | [第 3 回](03-pipe-name-resolution.md) |
| …/components\_and\_directives/pipes | should render pipes | [第 1 回](01-pipe-what-declared.md) |
| should use appropriate function for a given no of pipe arguments | [第 1 回](01-pipe-what-declared.md) |   |
| should generate the proper instruction when injecting ChangeDetectorRef into a pipe | [第 5 回](05-pipe-instances-lifecycle.md) |   |
| should handle a pipe that does not have a name | [第 2 回](02-pipe-class-def.md) |   |
| …/components\_and\_directives/standalone | should properly compile a standalone pipe | [第 2 回](02-pipe-class-def.md) |
| r3\_view\_compiler\_arrow\_functions | should handle arrow function that is passed into a pipe | [第 4 回](04-pipe-where-allowed.md) |
| r3\_view\_compiler\_control\_flow | should generate switch block with a pipe in its expression | [第 4 回](04-pipe-where-allowed.md)・[第 5 回](05-pipe-instances-lifecycle.md) |
| should generate an if block using pipes in its conditions |   |   |
| should generate an for loop block using a pipe in its expression |   |   |
| r3\_view\_compiler\_deferred | should generate a deferred block with a \`when\` trigger that has a pipe | [第 4 回](04-pipe-where-allowed.md) |
| r3\_view\_compiler\_di/di | should have the pipe factory take precedence over the injectable factory, if a class has multiple decorators | [第 2 回](02-pipe-class-def.md) |
| r3\_view\_compiler\_i18n | should support i18n message with multiple pipes | [第 4 回](04-pipe-where-allowed.md) |
| r3\_view\_compiler\_let | should create a let using a pipe | [第 4 回](04-pipe-where-allowed.md) |
| should not optimize away declareLet if expression is using a pipe |   |   |
| r3\_view\_compiler\_styling/mixed\_style\_and\_class | should stamp out pipe definitions in the creation block if used by styling bindings | [スロットと vars](../compiler/12-compiler-slots-vars.md) |
| should properly offset multiple style pipe references for styling bindings |   |   |
| r3\_view\_compiler\_template | should support pipes in template bindings | [第 4 回](04-pipe-where-allowed.md) |
| source\_mapping/inline\_templates | should map interpolation with pipe (full compile) | — |
| should map interpolation with pipe (partial compile) |   |   |

[第 4 回](04-pipe-where-allowed.md)の 7 節の「矢印関数そのものに pipe が掛かる」は、出力の形でも固められています。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_arrow_functions/arrow_function_pipe.ts` L10–17 （▶ の行: 12, 14）

```ts
10 │ @Component({
11 │   template: `
12 ▶     {{(a, b) => a + b | test}}
13 │     <hr>
14 ▶     {{(a, b) => a + b + componentProp | test}}
15 │   `,
16 │   imports: [TestPipe]
17 │ })
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_arrow_functions/arrow_function_pipe.js` L1–23 （▶ の行: 1, 11, 17）

```js
 1 ▶ const $arrowFn0$ = (ctx, view) => (a, b) => a + b;
 2 │ const $arrowFn1$ = (ctx, view) => (a, b) => a + b + ctx.componentProp;
 3 │ …
 4 │ $r3$.ɵɵdefineComponent({
 5 │   …
 6 │   decls: 5,
 7 │   vars: 8,
 8 │   template: function TestComp_Template(rf, ctx) {
 9 │     if (rf & 1) {
10 │       $r3$.ɵɵtext(0);
11 ▶       $r3$.ɵɵpipe(1, "test");
12 │       $r3$.ɵɵdomElement(2, "hr");
13 │       $r3$.ɵɵtext(3);
14 │       $r3$.ɵɵpipe(4, "test");
15 │     }
16 │     if (rf & 2) {
17 ▶       $r3$.ɵɵtextInterpolate1(" ", $r3$.ɵɵpipeBind1(1, 3, $r3$.ɵɵarrowFunction(2, $arrowFn0$, ctx)), " ");
18 │       $r3$.ɵɵadvance(3);
19 │       $r3$.ɵɵtextInterpolate1(" ", $r3$.ɵɵpipeBind1(4, 6, $r3$.ɵɵarrowFunction(5, $arrowFn1$, ctx)), " ");
20 │     }
21 │   },
22 │   …
23 │ });
```

1 行目で矢印関数は外の定数になり、17 行目で `ɵɵarrowFunction(2, $arrowFn0$, ctx)` が作った関数が、そのまま `ɵɵpipeBind1` の第 3 引数（transform の値）になります。11 行目の `ɵɵpipe(1, "test")` はふつうの pipe と同じ作成の命令です。

📄 `angular/packages/compiler-cli/test/ngtsc/template_typecheck_spec.ts` L7051–7065 （▶ の行: 7054, 7063–7064）

```ts
7051 │           @Component({
7052 │             selector: 'test-cmp',
7053 │             imports: [TestPipe],
7054 ▶             template: '@for (item of items; track item | test) {}',
7055 │           })
7056 │           export class TestCmp {
7057 │             items = [];
7058 │           }
7059 │         `,
7060 │         );
7061 │ 
7062 │         const diags = env.driveDiagnostics();
7063 ▶         expect(diags.length).toBe(1);
7064 ▶         expect(diags[0].messageText).toContain('Cannot use pipes in track expressions');
7065 │       });
```

ngtsc の spec の側では、track の pipe は診断 1 件（7063 行目）で、文は「Cannot use pipes in track expressions」（7064 行目）です。[第 4 回](04-pipe-where-allowed.md)の 5 節の 62cda789a8c が、この期待を「Illegal State」から書き換えました。

## 4. 手元で走らせた結果

📄 `走らせたコマンド`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test/acceptance:acceptance --nocache_test_results --test_output=all '--test_arg=--filter=^pipe '
pnpm bazel test //packages/compiler/test/expression_parser:expression_parser --nocache_test_results --test_output=all --test_arg=--filter=pipe
pnpm bazel test //packages/compiler/test/render3:test --nocache_test_results --test_output=all --test_arg=--filter=pipe
pnpm bazel test //packages/compiler-cli/test/compliance/full:full --nocache_test_results --test_output=all --test_arg=--filter=pipe
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test --nocache_test_results --test_output=all --test_arg=--filter=pipe
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc --nocache_test_results --test_output=all --test_arg=--filter=pipe
```

| ターゲット | 絞り込み | 結果（2026-11-09） | ログ（pipe-logs/） |
| --- | --- | --- | --- |
| `//packages/core/test/acceptance:acceptance` | `^pipe ` | Ran 43 of 2693 specs、0 failures | b-pipe-acc.log |
| `//packages/compiler/test/expression_parser:expression_parser` | なし / `pipe` | 342 specs / Ran 33 of 342 | b-expr.log・b-expr-pipe.log |
| `//packages/compiler/test/render3:test` | `pipe` / `track` | Ran 13 of 499 / Ran 6 of 499 | b-r3-pipe.log・b-r3-track.log |
| `//packages/compiler-cli/test/compliance/full:full` | `pipe` | 2 つの shard で Ran 7 of 605・Ran 12 of 610（19 件） | b-compliance-pipe.log |
| `//packages/compiler-cli/src/ngtsc/typecheck/test:test` | `pipe` | Ran 35 of 1747 | b-tcb-pipe.log |
| `//packages/compiler-cli/test/ngtsc:ngtsc` | `pipe` | 4 つの shard で 39・42・40・43（164 件） | b-ngtsc-pipe.log |

- どれも PASSED。どれも Node の jasmine なので `--test_arg=--filter=…` が効きます。filter は it と describe の名前をつないだ文字への正規表現で、大文字・小文字を区別します。
- compliance の full は 20 個の test case のうち 19 個です。`(partial compile)` の 1 つは TEST\_CASES.json の `compilationModeFilter` が `['linked compile', 'declaration-only emit']` で、full の対象に入っていません（リンカーの側の `compliance/linked` で走ります）。
- shard（`shard_count`）のあるターゲットは、「Ran N of M」が shard ごとに出ます。M が shard ごとに違うのは、spec のファイルを shard に振り分けるからです。
- `acceptance` は zone.js を読む `angular_jasmine_test` で、ログの頭に「DEPRECATION: Monkey patching detected」が出ますが、失敗ではありません（BUILD.bazel の形は[コンポーネントのバインディングのテストの章](../testing/06-testing-component-bindings.md)）。

## 5. DEMO：issue を章で絞り込む

`gh issue list --search` を語を変えて 22 回走らせ（1 回 60 件まで。2026-11-09）、見つかった issue のうち題に pipe を含むものから、開いている 7 件と、2025-06-01 以降に閉じた 28 件を選び、題に pipe を含まない #59868 を足しました。本文とコメントを読んで、関係する章に振り分けています。要約はこの章の書き手が付けたもので、題をそのまま写していません。表は下のスクリプトが作ったデータです。

| 章 | 開いている | 閉じた |
| --- | --- | --- |
| [第 2 回 @Pipe が作るもの](02-pipe-class-def.md) | 1 | 3 |
| [第 3 回 名前の解決](03-pipe-name-resolution.md) | 1 | 1 |
| [第 4 回 書ける場所と書けない場所](04-pipe-where-allowed.md) | 0 | 2 |
| [第 5 回 インスタンスの数と寿命](05-pipe-instances-lifecycle.md) | 1 | 2 |
| [pipe の仕組み（pure と impure）](../cmn/06-cmn-pipe-mechanism.md) | 1 | 4 |
| [型チェックの pipe](../typecheck/15-typecheck-refs-pipes.md) | 0 | 1 |
| [AsyncPipe](../template/08-async-pipe.md) | 2 | 3 |
| [DatePipe](../cmn/09-cmn-date-pipe.md) | 0 | 4 |
| [数の書式](../cmn/12-cmn-format-number.md) | 0 | 3 |
| [KeyValuePipe](../cmn/08-cmn-keyvalue-pipe.md) | 0 | 2 |
| [小さな pipe](../cmn/07-cmn-simple-pipes.md) | 0 | 1 |
| [i18n の書き出し](../loc/16-loc-serializers.md) | 1 | 0 |
| （シリーズと pipe の章の外） | 0 | 3 |

> **🧪 DEMO — pipe の issue（36 件）**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pipe-tests-issues)

表から読めることです。

- 閉じた 29 件の内訳は NOT\_PLANNED が 17・DUPLICATE が 5・COMPLETED が 7 です。COMPLETED のうちコードが変わったのは 4 件（#64316 の 62cda789a8c、#62136 の ed5062a91cb、#46867 の 9eac43cf469、#36427 の 58d536bc836）で、残りの 3 件は文書の直しか、既にある機能（resource）の案内です。
- 一番多いのは `signal` と pure の pipe の話です（[pipe の仕組み](../cmn/06-cmn-pipe-mechanism.md)の 5 件）。#69767・#69474・#66360・#65318 は、どれもメンテナーのコメントでまとめの #61501（開）を案内されて閉じています。#61501 の中のメンテナーのコメントは「pipe は凝った memoize された関数呼び出し」で、[pipe の仕組みの章](../cmn/06-cmn-pipe-mechanism.md)の 5 節の「直前の 1 組だけ覚える」と同じことを言っています。
- common の pipe（数・keyvalue・json）の機能の要望 #47479・#66132・#66100 は、どれも「今ある pipe に足す予定は無い。Intl などで自分の pipe を作る」と答えて NOT\_PLANNED で閉じられています。#70488（DatePipe の既定の locale）は、「DatePipe の引数で locale を渡せる」と言われて、書いた人が自分で閉じました。
- このシリーズの章に直接つながるのは 9 件です。[第 4 回](04-pipe-where-allowed.md)の #64316（直った）と #62076（優先順位、設計どおり）、[第 5 回](05-pipe-instances-lifecycle.md)の #50952（開）・#59868・#39276、[第 3 回](03-pipe-name-resolution.md)の #65665（開）と #62136、[第 2 回](02-pipe-class-def.md)の #36427 と #53112（開）。

📄 `pipe-demo/b/issues/make-data.mjs`

```js
// 第 6 回 pipe-tests-issues の表のデータを作る。
// 入力: pipe-logs/b-selected.json（2026-11-09 に gh で取った、題に pipe を含む issue のうち、開いている 7 件と 2025-06-01 以降に閉じた 28 件）、
//       pipe-logs/b-59868.json（題に pipe を含まないが第 5 回に関係する 1 件）、
//       ../angular（8576f161ae4）の packages/core/test/acceptance/pipe_spec.ts。
// NOTES の ja（要約）と ch（関係する章）はこの章の書き手が本文とコメントを読んで付けたもの。題はそのまま写さない。
// 使い方: node make-data.mjs <pipe-logs のディレクトリ> <angular のディレクトリ> <出力する .data.ts>
import { readFileSync, writeFileSync } from 'node:fs';
const [logs, repo, out] = process.argv.slice(2);

const NOTES = {
  61501: ['cmn-pipe-mechanism', 'signal の時代の pipe：テンプレートの中で computed のように使いたい（まとめの issue）', ''],
  50952: ['pipe-instances-lifecycle', 'pipe での inject() とコンストラクタの注入で、届く注入器が違う', 'PR #70358（開）'],
  65665: ['pipe-name-resolution', 'v21 と Vitest で、NgModule のコンポーネントの async が NG8004（テストが AOT になった）', ''],
  53112: ['pipe-class-def', 'ディレクティブと pipe の定義（入力・名前など）を実行時に読む関数が欲しい', ''],
  52461: ['loc-serializers', 'async を使うファイルで、i18n の抽出の equiv-text が崩れる', ''],
  47932: ['async-pipe', 'async pipe なしで Observable をテンプレートで開きたい', ''],
  43727: ['async-pipe', 'async が最初に null を返すことが、strict の型で困る', ''],
  70488: ['cmn-date-pipe', 'DATE_PIPE_DEFAULT_OPTIONS に既定の locale を足したい', ''],
  70483: ['', 'Vitest のブラウザで pipe のテストが crypto.createHash で落ちる（Node の API で、Angular の外）', ''],
  69772: ['async-pipe', 'ngrx の push pipe のような、async の改良版が欲しい', ''],
  69767: ['cmn-pipe-mechanism', '言語を切り替えたとき、pure の pipe を呼び直させたい（#61501 と重複）', ''],
  69474: ['cmn-pipe-mechanism', 'transform の中で読んだ signal が変わっても描き直されない（設計どおり）', ''],
  66773: ['pipe-class-def', 'standalone: true と false の違いを文書で説明してほしい', 'PR #66775'],
  66360: ['cmn-pipe-mechanism', 'signal を読む pure な pipe が欲しい（重複）', ''],
  66288: ['cmn-date-pipe', "書式の 'Y'（週の年）で、年末の日付の年が 1 つ進む", ''],
  66271: ['cmn-date-pipe', "書式の 'YYYY' が 'yyyy' と違う年を出す", ''],
  66132: ['cmn-keyvalue-pipe', 'keyvalue の既定の並べ替えをやめてほしい', ''],
  66129: ['pipe-class-def', '@Pipe の standalone の既定値が API の文書に無い', 'PR #66477'],
  66100: ['cmn-simple-pipes', 'JsonPipe に replacer を渡したい（BigInt を出したい）', ''],
  65318: ['cmn-pipe-mechanism', 'transform を既定で untracked で動かしたい', ''],
  64316: ['pipe-where-allowed', 'track に pipe を書くとコンパイラが落ち、場所の分からない文だけが出る', '62cda789a8c（v21.0.0）'],
  64198: ['typecheck-refs-pipes', '@for の of に slice を通すと、要素の型が分からない（再現が無く閉じた）', ''],
  63613: ['', 'rxResource に RxJS の pipe 関数を渡したい（Angular の pipe ではない）', ''],
  62440: ['async-pipe', 'HTTP の読み込み中とエラーを扱う async が欲しい（resource を案内）', ''],
  62136: ['pipe-name-resolution', 'NG8004 の文に、よく使う pipe の直し方を足してほしい', 'ed5062a91cb'],
  62076: ['pipe-where-allowed', '@if (false && value() | test) でも pipe が呼ばれる（| が && より弱い）', ''],
  56907: ['cmn-format-number', 'ブルガリアの通貨の書式が違う（CLDR の版、#48697 と重複）', ''],
  47479: ['cmn-format-number', '通貨の pipe で、端数が無いときだけ小数を出さない書き方が欲しい', ''],
  46867: ['cmn-keyvalue-pipe', '省略できるキーを持つ型で keyvalue が型のエラー', '9eac43cf469'],
  44867: ['async-pipe', '!(x | async) を警告してほしい（eslint の規則を案内）', ''],
  39276: ['pipe-instances-lifecycle', '投影した中身の pipe が、host の viewProviders を見る（今の振る舞いが正しい）', ''],
  36427: ['pipe-class-def', 'TestBed で、基底クラスを継承した pipe が「selector が無い」と言われる', 'PR #70507（58d536bc836）'],
  33803: ['cmn-format-number', '通貨コードと値の間の空白（CLDR、重複）', ''],
  29874: ['cmn-date-pipe', '0001-01-01 が紀元前の日付になる（Date の計算）', ''],
  21331: ['', 'animations の query が async と一緒だと効かない（新しい animate.enter に移って閉じた）', ''],
  59868: ['pipe-instances-lifecycle', '子の入力に書いた pipe で、inject(ChangeDetectorRef) が子のものになる（#50952 と重複）', ''],
};

const raw = [...JSON.parse(readFileSync(`${logs}/b-selected.json`, 'utf8')), JSON.parse(readFileSync(`${logs}/b-59868.json`, 'utf8'))];
const issues = raw.map((i) => {
  const note = NOTES[i.number];
  if (!note) throw new Error('要約の無い issue: ' + i.number);
  return {
    n: i.number,
    state: i.state === 'OPEN' ? 'open' : 'closed',
    reason: i.stateReason ?? '',
    opened: i.createdAt.slice(0, 10),
    closed: (i.closedAt ?? '').slice(0, 10),
    labels: i.labels.map((l) => l.name),
    ch: note[0],
    ja: note[1],
    link: note[2],
  };
}).sort((a, b) => b.n - a.n);

// pipe_spec.ts の describe / it を行番号つきで拾い、この章の書き手が章に振り分ける
const CH_OF_LINE = {
  57: 'pipe-what-declared', 75: 'pipe-what-declared', 111: 'pipe-what-declared', 129: 'pipe-what-declared',
  147: 'pipe-name-resolution', 195: 'pipe-name-resolution', 284: 'pipe-name-resolution',
  249: 'cmn-pipe-mechanism', 322: 'pipe-where-allowed', 359: 'pipe-class-def',
  408: 'cmn-pipe-mechanism', 475: 'cmn-pipe-mechanism', 503: 'cmn-pipe-mechanism',
  530: 'pipe-instances-lifecycle', 564: 'pipe-instances-lifecycle', 598: 'pipe-instances-lifecycle', 636: 'pipe-instances-lifecycle',
  673: 'pipe-instances-lifecycle', 727: 'pipe-instances-lifecycle',
  790: 'cmn-pipe-mechanism', 822: 'cmn-pipe-mechanism', 870: 'cmn-pipe-mechanism',
  930: 'pipe-name-resolution', 949: 'pipe-name-resolution', 973: 'pipe-name-resolution', 1006: 'pipe-name-resolution', 1041: 'pipe-name-resolution', 1062: 'pipe-name-resolution',
};
// 1 つの it の行から、何件の spec が作られるか（for と forEach の中は複数）
const RUNS = { 870: 10, 930: 2, 949: 2, 973: 2, 1006: 2, 1041: 2, 1062: 2 };
const lines = readFileSync(`${repo}/packages/core/test/acceptance/pipe_spec.ts`, 'utf8').split('\n');
const specs = [];
const stack = [];
lines.forEach((l, idx) => {
  const m = l.match(/^(\s*)(describe|it)\((['`])(.*?)\3/s) ?? l.match(/^(\s*)(describe|it)\((`)(.*)$/);
  if (!m) return;
  const line = idx + 1;
  const depth = m[1].length / 2;
  // テンプレート文字列の名前は、\${…} を … に置き換える
  const name = m[3] === '`' ? m[4].replace(/\$\{[^}]*\}?/g, '…').replace(/`.*$/, '') : m[4];
  if (m[2] === 'describe') {
    stack.length = depth;
    stack[depth] = { line, name };
    return;
  }
  const ch = CH_OF_LINE[line];
  if (!ch) throw new Error('章の無い it: ' + line);
  const parent = stack.filter(Boolean).slice(-1)[0];
  specs.push({ line, name, describe: parent ? `${parent.name}（${parent.line}）` : '', runs: RUNS[line] ?? 1, ch });
});
const total = specs.reduce((a, s) => a + s.runs, 0);
if (total !== 43) throw new Error('数が 43 にならない: ' + total);

const body = `// 自動生成 — 手で編集しないこと（scratchpad の pipe-demo/b/issues/make-data.mjs が作った）。
// issue の欄（番号・状態・日付・ラベル）は 2026-11-09 に gh で取ったもの。ch・ja・link はこの章の書き手が付けたもの。
// SPECS は ../angular（8576f161ae4）の packages/core/test/acceptance/pipe_spec.ts から拾ったもの。

export const SPECS = ${JSON.stringify(specs)} as const;

export const ISSUES = ${JSON.stringify(issues)} as const;

export const SCRIPT = ${JSON.stringify(readFileSync(new URL(import.meta.url).pathname, 'utf8'))};
`;
// 手元の絶対パスが紛れていないか（この行自身に当たらないよう、文字を分けて書く）
for (const bad of ['/Us' + 'ers/', 'Users-' + 'kazu', '_bazel' + '_kazu', '/private' + '/tmp']) if (body.includes(bad)) throw new Error('絶対パスが残っている: ' + bad);
writeFileSync(out, body);
console.log('specs', specs.length, 'runs', total, 'issues', issues.length);

```
*表のデータを作ったスクリプトの全文（記録）*

## 書いている途中で見つかったもの

第 1〜5 回を書く途中で、本家の振る舞いの食い違いと、エラーの文の小さな問題が見つかりました。どれも **issue も PR も出していません**。どれもこのサイトの依存の @angular/\* 22.1.6 で再現し、手元の木（8576f161ae4）のソースの行と照らして確かめました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| pipe が ChangeDetectorRef をコンストラクタで受けると、pipe を書いた側のビューのものになる。`inject(ChangeDetectorRef)` で受けると、その pipe を子のコンポーネントの入力（`<child [v]="x \| p">`）に書いたとき、子のビューのものになる。ふつうの補間に書いたときは、どちらも書いた側のもの | compiler/src/render3/r3\_factory.ts 251 行目（ɵfac を作るときだけ ForPipe の印を足す）と、core/src/change\_detection/change\_detector\_ref.ts の injectChangeDetectorRef | 同じ pipe をコンストラクタと inject() の 2 通りで書き、3 つの場所で描いた記録（結果は ctor:Root・inject:Child・inject:Root）。2023 年から開いている #50952 と同じ症状（#59868 はその重複として閉じられている） | [第 2 回](02-pipe-class-def.md)・[第 5 回](05-pipe-instances-lifecycle.md) |
| ホストのプロパティのバインディングに pipe を書いたときのエラーの文で、`pipes` と `[` がくっつく（「…cannot contain pipes\[name \| up\] in …」） | expression\_parser/parser.ts 160 行目の文を、1899〜1903 行目の getParseError が場所の文なしで組み立てる（場所の文が空のときは空白が入らない） | このページの上の @angular/compiler と、ngtsc にかけた記録 | [第 4 回](04-pipe-where-allowed.md) |
| （エラーになるのは意図どおり）補間の中の矢印関数の本体に pipe を書くと（`items.map(i => (i \| p))`）、文は「Cannot have a pipe in an action expression」と言う。ngc では NG5002 が 2 件、名前が空の pipe の NG8004、TS2339 の計 4 件が続けて出る | 矢印関数の本体を ParseFlags.Action で読む行。エラーになること自体は parser\_spec.ts 1107 行目の it が固めている | ngtsc にかけた記録 | [第 4 回](04-pipe-where-allowed.md) |
| （今は影響なし）@for の track に pipe を書くと、以前はテンプレートパイプラインの「Illegal State」まで進んで落ちていた。62cda789a8c（2025-10、#64316 を直したもの）で前の段のエラーになったが、throw の行は残っている | template/pipeline/src/phases/track\_fn\_optimization.ts 63 行目 | git show と、track に pipe を書いた記録 | [第 4 回](04-pipe-where-allowed.md) |

読み方の目安: いちばん上の ChangeDetectorRef の件は、同じ pipe でも受け取り方で `markForCheck()` の効く範囲が変わるので、影響がいちばん大きいものです。issue を探すときは、題の言葉より、表の「どこ」の関数名（`injectChangeDetectorRef`・`ForPipe` など）で gh を検索すると見つけやすくなります。

## 聞かれそうな質問

**Q. pipe の振る舞いを変えたら、まずどの spec を走らせればいいですか？**

実行時なら `//packages/core/test/acceptance:acceptance` を `--test_arg=--filter=^pipe ` で絞って 43 件、出力の形なら compliance の `full` を `pipe` で絞って 19 件です（4 節）。どちらも数秒で終わります。

**Q. pipe\_spec.ts の it は 28 本なのに、なぜ 43 件走るのですか？**

869 行目の `for` が 1 本の it を 10 件に、919 行目の `forEach` が 6 本の it を 12 件にするからです（2 節）。

**Q. pipe をイベントで使えない・track で使えない、はどこで固められていますか？**

パーサーの parser\_spec.ts 485 行目（action）と 1107 行目（矢印関数の本体）、テンプレートの変換の r3\_template\_transform\_spec.ts 709 行目（双方向）と 2465 行目（track）、ngtsc の template\_typecheck\_spec.ts 7038 行目（track の診断）です。

**Q. pipe で inject(ChangeDetectorRef) を使うときの違いは、spec で固められていますか？**

コンストラクタで受ける形だけです。pipe\_spec.ts 673・727 行目はどちらもコンストラクタで、`inject()` の形の it は、ホストではない場所（@let やブロックの式）に書いたものだけです（[第 5 回](05-pipe-instances-lifecycle.md)のテストの節）。関係する issue は #50952（開）と #59868（重複として閉じた）です。

**Q. signal を読む pipe を pure のまま描き直させる方法はありますか？**

今の pipe の仕組みにはありません。#69474 は「設計どおり」として閉じられ、まとめの #61501 が開いています。そこでの案内は、transform から `computed()` を返してテンプレートで呼ぶ形です（#69767 のコメント）。

## 読み終えて

- 実行時の約束は core の pipe\_spec.ts（28 本・43 件）、出力の形は compliance の 20 個の test case、型は type\_check\_block\_spec.ts と template\_typecheck\_spec.ts、書ける場所はパーサーとテンプレートの変換の spec が固めている。
- どのターゲットも Node の jasmine で、`--test_arg=--filter=` で名前を絞れる。shard のあるターゲットは shard ごとに件数が出る。
- pipe の issue の多くは signal と pure の話と、common の pipe の要望で、#61501 に集まっている。
- このシリーズの行に直接つながる開いた issue は、#50952（inject() とコンストラクタ）・#65665（テストの AOT で NG8004）・#53112（定義を実行時に読む）。

---

← 前: [インスタンスの数と寿命：@for の中の pipe、inject、ngOnDestroy](05-pipe-instances-lifecycle.md)  
次: [1 行の viewChild が生むもの：クエリの全体像](../qry/01-qry-what-declared.md) →
