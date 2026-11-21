[目次](../README.md) › [core の説明文の読み残し（2）](README.md) › 第 10 回 / 全 10 回

# spec と issue を読む：core の説明文（2）を固めているもの

> packages/core/test の spec が、このシリーズで読んだ説明文の約束をどこで固めているか、手元での走らせ方と結果、area: core の開いている issue のうち説明文に当たるものの表と、このシリーズで見つけた食い違い。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/cra-tests-issues)

---

この章で分かること：第 1〜9 回で読んだ `@angular/core`（と DomSanitizer の platform-browser）の説明文の約束を、どの spec が固めているか、固めていないのはどれか。手元で走らせた target と件数。area: core の issue のうち、このシリーズの説明文に当たるもの。そして、このシリーズで見つけた説明と実装の食い違い・不具合の一覧です。

読む対象は `packages/core/test/` と `packages/platform-browser/test/security/` の spec（../angular、8576f161ae4）と、2026-11-21 に取った area: core の開いている issue 263 件です。spec の読み方と 1 本だけ走らせる方法は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)、前のシリーズの最終回は[core の説明文（1）の spec と issue](../crd/10-crd-tests-issues.md)です。

1. [1. ApplicationRef](01-cra-app-ref.md)
2. [2. platform と bootstrap](02-cra-platform.md)
3. [3. ViewContainerRef](03-cra-view-container.md)
4. [4. QueryList・DestroyRef](04-cra-linker-misc.md)
5. [5. input・model・output](05-cra-signal-io.md)
6. [6. signal のクエリ](06-cra-signal-queries.md)
7. [7. NgZone・ErrorHandler](07-cra-zone-errors.md)
8. [8. DebugElement](08-cra-debug.md)
9. [9. サニタイズ](09-cra-sanitize.md)
10. **10. spec と issue**（この章）

## 1. 走らせ方と件数

このシリーズの spec は 4 つの target にあります。`//packages/core/test:test`（`glob(["**/*.ts"])`、Node の jasmine、`shard_count = 4`）は zone/・debug/・sanitization/・testability/・linker/ と application\_ref\_spec.ts ほか、`//packages/core/test/acceptance:acceptance`（shard なし）は view\_container\_ref\_spec.ts・destroy\_ref\_spec.ts・component\_spec.ts・pending\_tasks\_spec.ts ほか、`//packages/core/test/acceptance/authoring:test` は signal の input・model・output・クエリの 5 つの spec、`//packages/platform-browser/test:test` は DomSanitizer です（BUILD.bazel の読み方は[Bazel の読み方](../contrib/04-contrib-bazel.md)）。

📄 `走らせ方（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ。2026-11-22
# packages/core/test/BUILD.bazel：glob(["**/*.ts"]) の test_lib を Node の :test（shard_count = 4）で走らせる
# packages/core/test/acceptance/BUILD.bazel の :acceptance（shard なし）
# packages/core/test/acceptance/authoring/BUILD.bazel の :test（signal の input・model・output・クエリ）
# packages/platform-browser/test/BUILD.bazel の :test（DomSanitizer）
$ pnpm bazel test <target> --nocache_test_results --test_output=all "--test_arg=--filter=<名前>"
# Node の jasmine。一致が 0 件でも PASSED なので Ran の行を見る。:test は shard ごとに Ran が出るので足す
```

各章で約束を固める it を名前で絞った数は次のとおりで、どれも 0 failures です（`:test` は 4 つの shard の「Ran N of M specs」の N を足した数）。

| 章 | target | --filter | 件数 |
| --- | --- | --- | --- |
| [1](01-cra-app-ref.md) | `:test` | `attachView / detachView`・`ApplicationInitStatus`・`provideStabilityDebugging`・`AppRef stability`・`bootstrap ApplicationRef`・`bootstrap destroy` | 6・12・2・7・6・6 |
| [2](02-cra-platform.md) | `:acceptance` | `bootstrap options`・`PlatformRef cleanup`・`changing bootstrap options` | 22・1・5 |
| [2](02-cra-platform.md) | `:test` | `bootstrap bootstrapModule`・`bootstrapModuleFactory` | 15・3 |
| [3](03-cra-view-container.md) | `:acceptance` | `ViewContainerRef insert`・`move`・`get and indexOf`・`detach`・`remove`・`createEmbeddedView`・`createComponent`・`TemplateRef`・`ViewRef` | 12・2・3・3・3・5・15・38・14 |
| [4](04-cra-linker-misc.md) | `:test`・`:acceptance` | `QueryList`・`DestroyRef` | 21・12 |
| [5](05-cra-signal-io.md) | `authoring:test`（acceptance） | `output\(\) function`・`model inputs`・`signal inputs` | 11・18・10 |
| [5](05-cra-signal-io.md) | `//packages/core/test/authoring:test` | `input signal`・`model signal`（全体 19） | 8・11 |
| [6](06-cra-signal-queries.md) | `authoring:test` | （絞らない）・`queries as signals`・`queries as signals view`・`queries as signals content queries` | 62・23・12・5 |
| [6](06-cra-signal-queries.md) | `:acceptance` | `required initiliazers` | 3 |
| [7](07-cra-zone-errors.md) | `:test` | `^NgZone `・`^NoopNgZone`・`^EventEmitter`・`^TransferState`・`^ErrorHandler`・`^Testability` | 101・3・17・19・5・16 |
| [7](07-cra-zone-errors.md) | `:acceptance` | `^PendingTasks`・`^public PendingTasks` | 4・4 |
| [8](08-cra-debug.md) | `:test` | `^debug element`・`^debug element properties`・`^debug element context on DebugNode` | 67・7・3 |
| [9](09-cra-sanitize.md) | `:test` | `^HTML sanitizer`・`^sanitization`・`^URL sanitizer` | 42・12・30 |
| [9](09-cra-sanitize.md) | `platform-browser/test:test` | `^DOM Sanitization Service` | 1 |

## 2. 説明文の約束を固めている spec と、固めていない所

📄 `angular/packages/core/test/acceptance/component_spec.ts` L979–995 （▶ の行: 979, 984, 987, 991, 994）

```ts
979 ▶     it('should throw if required query is read in the constructor', () => {
980 │       @Component({
981 │         template: `<div #el></div>`,
982 │       })
983 │       class AppComponent {
984 ▶         divEl = viewChild.required<ElementRef<HTMLDivElement>>('el');
985 │ 
986 │         constructor() {
987 ▶           this.divEl();
988 │         }
989 │       }
990 │ 
991 ▶       // non-required query results are undefined before we run creation mode on the view queries
992 │       expect(() => {
993 │         TestBed.createComponent(AppComponent);
994 ▶       }).toThrowError(/NG0951: Child query result is required but no value is available/);
995 │     });
```
*viewChild.required を constructor で読む（第 6 回の 5 節）*

994 行目は開発モードの文まで待つので、`NG0951` の約束はここで固まっています。describe の名前（L928 の `required initiliazers`）は `initializers` の綴り違いで、`--filter` もこの綴りで絞ります。注入コンテキストの外で 6 つの関数を呼ぶ it は無く、`contentChild.required` の文の取り違えと、`contentChildren` の検査の抜けは、spec に引っかかりません（第 6 回の 6 節）。

📄 `angular/packages/core/test/zone/ng_zone_spec.ts` L813–840 （▶ の行: 814, 818, 822, 828, 832, 835, 837）

```ts
813 │   describe('exceptions', () => {
814 ▶     it('should call the on error callback when it is invoked via zone.runGuarded', (done) => {
815 │       macroTask(() => {
816 │         const exception = new Error('sync');
817 │ 
818 ▶         _zone.runGuarded(() => {
819 │           throw exception;
820 │         });
821 │ 
822 ▶         expect(_errors.length).toBe(1);
823 │         expect(_errors[0]).toBe(exception);
824 │         done();
825 │       });
826 │     });
827 │ 
828 ▶     it('should not call the on error callback but rethrow when it is invoked via zone.run', (done) => {
829 │       macroTask(() => {
830 │         const exception = new Error('sync');
831 │         expect(() =>
832 ▶           _zone.run(() => {
833 │             throw exception;
834 │           }),
835 ▶         ).toThrowError('sync');
836 │ 
837 ▶         expect(_errors.length).toBe(0);
838 │         done();
839 │       });
840 │     });
```
*runGuarded と run のエラー（第 7 回の 2 節）*

`runGuarded`（818・822 行目、onError に 1 件）と `run`（832〜835・837 行目、投げ直して onError は 0 件）は固められていますが、同じ説明文を持つ `runTask` のエラーの it はありません。`runTask` は記録では投げ直さず onError に出ました。この it を足せば、説明文（ng\_zone.ts L248）か実装のどちらかを決めることになります。

📄 `angular/packages/core/test/testability/testability_spec.ts` L270–297 （▶ の行: 270, 273, 276, 283, 290, 294）

```ts
270 ▶     it('should fire whenstable callback with didWork if event is already finished', fakeAsync(() => {
271 │       const task = pendingTasks.add();
272 │       task();
273 ▶       testability.whenStable(execute);
274 │ 
275 │       tick();
276 ▶       expect(execute).toHaveBeenCalled();
277 │       testability.whenStable(execute2);
278 │ 
279 │       tick();
280 │       expect(execute2).toHaveBeenCalled();
281 │     }));
282 │ 
283 ▶     it('should fire whenstable callback with didwork when event finishes', fakeAsync(() => {
284 │       const task = pendingTasks.add();
285 │       testability.whenStable(execute);
286 │ 
287 │       tick();
288 │       task();
289 │ 
290 ▶       tick();
291 │       expect(execute).toHaveBeenCalled();
292 │       testability.whenStable(execute2);
293 │ 
294 ▶       tick();
295 │       expect(execute2).toHaveBeenCalled();
296 │     }));
297 │   });
```
*名前だけ残った didWork（第 7 回の 9 節）*

270・283 行目の名前は「didWork 付きで呼ぶ」ですが、276・290 行目は呼ばれたかだけを見ます。c2dd703d2ff（2024-01-02、#53767）が引数を外したときに中身だけ直した跡で、説明文（testability.ts L233〜234）と同じく取り残されています。

📄 `angular/packages/core/test/debug/debug_node_spec.ts` L927–935 （▶ の行: 927, 931–934）

```ts
927 ▶     it('should preserve the type of the property values', () => {
928 │       const fixture = TestBed.createComponent(TestCmptWithPropBindings);
929 │       fixture.detectChanges();
930 │ 
931 ▶       const button = fixture.debugElement.query(By.css('button'));
932 ▶       expect(button.properties['disabled']).toEqual(true);
933 ▶       expect(button.properties['tabIndex']).toEqual(1337);
934 ▶       expect(button.properties['title']).toEqual('hello');
935 │     });
```
*properties の値の型（第 8 回の 4 節）*

933 行目の `tabIndex` が数の `1337` であることは、開発モードでだけ成り立ちます。本番ではバインディングの名前を残さないので、`properties` は DOM の値になり、`input.value` のように文字列に変わる型もあります。spec は開発モードで走るので、この差を見ません。

📄 `angular/packages/core/test/sanitization/html_sanitizer_spec.ts` L155–163 （▶ の行: 155–156, 160）

```ts
155 ▶   describe('should strip dangerous attributes', () => {
156 ▶     const dangerousAttrs = ['id', 'name', 'style'];
157 │ 
158 │     for (const attr of dangerousAttrs) {
159 │       it(`${attr}`, () => {
160 ▶         expect(sanitizeHtml(defaultDoc, `<a ${attr}="x">evil!</a>`)).toEqual('<a>evil!</a>');
161 │       });
162 │     }
163 │   });
```
*style は「危ない属性」（第 9 回の 5 節）*

📄 `angular/packages/platform-browser/test/security/dom_sanitization_service_spec.ts` L11–19 （▶ の行: 13–14, 16–17, 19）

```ts
11 │ import {DomSanitizerImpl} from '../../src/security/dom_sanitization_service';
12 │ 
13 ▶ describe('DOM Sanitization Service', () => {
14 ▶   it('accepts resource URL values for resource contexts', () => {
15 │     const svc = TestBed.runInInjectionContext(() => new DomSanitizerImpl());
16 ▶     const resourceUrl = svc.bypassSecurityTrustResourceUrl('http://hello/world');
17 ▶     expect(svc.sanitize(SecurityContext.URL, resourceUrl)).toBe('http://hello/world');
18 │   });
19 ▶ });
```
*DomSanitizer の spec はこの 1 本だけ（第 9 回の 3 節）*

156 行目は `style` を `id`・`name` と並べて落とすことを固めます。DomSanitizer の「安全な値はそのまま残す」（dom\_sanitization\_service.ts L97〜99）は、この許可リストの意味の「安全」です。DomSanitizer そのものの spec は 13〜19 行目の 1 本で、ResourceURL の印を URL の文脈に渡すことだけを見ます。`sanitize` の説明（L116〜117「HTML 以外は、ただの文字列なら例外」）を固める it も、実物（URL と STYLE は例外にならない）を固める it もありません。

ほかに it が見当たらなかったのは、第 1 回の `attachView` の例外のあとの `viewCount`、第 2 回の `createPlatform` を直接呼ぶ形、第 3 回の範囲外の `move` と負の添字、第 4 回の platform の `DestroyRef`、第 7 回の `EventEmitter` の observer の形の error と、子の injector の ErrorHandler に届かないこと、第 8 回の `name` の `'#host'` です（各章の「テストと直し方」）。

## 3. issue の表

issues-open.json（area: core の開いている 263 件、2026-11-21 取得）の題から、このシリーズの説明文と実装に当たるものを選び、PR は gh pr view で読みました（読むだけ）。

| issue | 状態 | 中身 | 当たる説明文と章 |
| --- | --- | --- | --- |
| #46690 | 開 | ApplicationRef に付けたビューは、付けたままでは変更検知から外せない | attachView・detach の説明。1 |
| #67095 | 開 | platform の注入器の `DestroyRef` が `PlatformRef.destroy()` で壊されない | destroy\_ref.ts L20。4 で再現 |
| #43198・#64090 | 開 | platform の factory に親の注入器を渡したい／platform の段の機能 | createPlatform の注入器。2 |
| #62458・#61231 | 開 | `createComponent` に selector の option を／`createComponent` で作ったものがハイドレーションされない | createComponent の options。3 |
| #70727 | 開 | 壊したあとの `emit` の NG0953 を止められるように | output の emit。5（spec の名前は error だが console.warn を待つ） |
| #57955・#54782 | 開 | 深い signal の input と model／インスタンスから input の signal を書き換えたい | input・model の約束の外。5 |
| #59067 | 開 | signal のクエリが、input が入る前に値を持つ | 値が入る時（作成パスのあと、変更検知の前）。6 |
| #55237・#69369 | 開 | `contentChild` に locator の配列を／`viewChild(Component)` を遅延の chunk と使えるように | locator の型（queries.ts L18〜32）。6 |
| #69228・#61839 | 開 | テンプレートのリスナーの reject した Promise を ErrorHandler へ／zoneless で変更検知を起こさずにイベントを聞く | ErrorHandler の届き先・NgZone。7 |
| #64742 | 開 | `PendingTasks` に Explicit Resource Management（`using`）を | add の戻り値。7 |
| #71459 | 開 | `HOST_TAG_NAME` と `DebugElement.name` が根で `'#host'` | debug\_node.ts L150・L159。8 で再現 |
| #45270・PR #70425 | 開・開 | DomSanitizer で `style` の属性を残して中身をサニタイズしたい／それを許す PR（2026-08-27） | 許可リスト。9 |
| #61013・#49386・#40659・#36650 | 開 | MathML が消える／SafeValue を返す API／SafeStyle の非推奨／差し替えられるサニタイザー | サニタイズの公開 API。9 |

このシリーズの食い違いのうち、同じことを書いた issue と PR は、上の #67095・#71459・#45270 のほかには見つかりませんでした（GitHub の検索 API を、runTask onError・whenStable callback・DebugElement properties production・contentChildren injection context・isStable macrotasks NgZone などの語で、2026-11-22 に読むだけで実行）。

## 4. このシリーズで見つけたもの（食い違いと不具合）

どれも 8576f161ae4 の行を読み、本物の `@angular/core` 22.2.6（ページのデモと Node の記録）か、説明文の例をそのまま取り出したファイルの型検査（サイトの compiler-cli、strict・strictTemplates）で確かめたものです。「main」は ../angular の origin/main で、直っていなければ「main 同じ」と書きました。行のファイルは、断りが無ければ packages/core/src/ からの道です。

| 章 | 何が起きるか | 行（8576f161ae4） | 確かめ方と main |
| --- | --- | --- | --- |
| 1 | （不具合）`attachView` が NG0902 を投げたあとも `_views` に残り、`viewCount` が 1 増えたまま。入れ物ごと destroy しても外れない | application/application\_ref.ts 721〜726（L724 の push が L725 より先） | Node の記録。2 行を入れ替えると 0。spec 802 は viewCount を見ない。issue なし。main 同じ |
| 1 | （例の誤り）isStable の例の `subscribe(` を閉じる括弧が無く TS1005 | application\_ref.ts 183 | strict の tsc。353362f5a4c（2019）から。main 同じ |
| 1 | （zone.js 前提）isStable・zone.run・tick の説明が zone のアプリの話。zoneless（既定）では isStable は PendingTasks だけで決まり、印の無い Eager のフィールドの変更は tick で描かれない | application\_ref.ts 169〜173・206〜208・222〜247・524 | ページと Node の記録。main 同じ |
| 1 | （例の誤り）「Observable を返す例」が firstValueFrom の Promise を返す | application/application\_init.ts 96〜123 | 19edf2c057f（2024）の書き換えから。main 同じ |
| 1 | （説明不足）APP\_ID の文字の確かめは開発モードだけ。provideStabilityDebugging の警告は最初に安定するまでだけ。同じビューを 2 回 attachView すると 2 増える | application\_tokens.ts 14〜43・stability\_debug\_impl.ts 31〜32・application\_ref.ts 715〜726 | ページと Node の記録。main 同じ |
| 2 | （不具合）platform の scope の無い注入器を `createPlatform` に渡すと NG0201 を投げたうえ注入器が残り、以後 `getPlatform()`・`platformBrowser()`・`destroyPlatform()` がすべて NG0201 | platform/platform.ts 38〜59（L54 と L56 の順） | 新しいプロセスの Node の記録。spec なし。issue なし。main 同じ |
| 2 | （古い文）BootstrapOptions の `ngZone`・`ngZoneEventCoalescing`・`ngZoneRunCoalescing` はもう読まれない（どれを渡しても NoopNgZone） | application\_ref.ts 94〜149、zone/ng\_zone.ts 611（getNgZone を呼ぶ行が無い） | zone.js ありの Node の記録。51ebe9a4fcc（2025-11-21）で枝が消えた。spec 577 は意味を失っている。22.2.6 で getNgZone も消えた |
| 2 | （説明不足）platform があるときの providePlatformInitializer は呼ばれず警告も無い。assertPlatform の確かめは開発モードだけ。サーバーでは platform は呼ぶたびに別。違う JIT の options の 2 つ目は失敗せず console.error だけ | platform.ts 80〜81・111〜134・195〜221、platform\_ref.ts 23〜28、application\_ngmodule\_factory\_compiler.ts 38〜40 | Node の記録。main 同じ |
| 3 | （不具合）3 つ入った入れ物で `move(v0, 3)` は、先に v0 を外してから添字を確かめるので、開発は assert の例外、本番は TypeError、どちらも v0 は外れたまま戻らない | linker/view\_container\_ref.ts 570〜632（L580〜590・L668〜672） | Node とページ。spec に範囲外の move の it なし。main 同じ |
| 3 | （本番で壊れる）負・範囲外の添字の確かめは開発モードだけ。本番の insert(v, -1)・createEmbeddedView(…, {index: -1})・move(v, -1) は TypeError のうえ入れ物が壊れる。壊れたビューの insert も本番は確かめない | view\_container\_ref.ts 165・183・259・269・284・292・573・668〜672 | ページと Node の記録。main 同じ |
| 3 | （説明文の誤り）「createComponent 関数で作り ApplicationRef に付ける例」が VCR の createComponent の例。EmbeddedViewRef.context は「目印から受け継ぐ」でなく渡したもの（丸ごとの入れ替えの非推奨が公開の説明に出ない）。maxiumum | view\_container\_ref.ts 98〜103、view\_ref.ts 94〜96、element\_ref.ts 62 | 読み比べと記録。L269 の @param は main の 6e024600e0b で直った。ほかは main 同じ |
| 3 | （説明不足）detach は新しい ViewRef を返す。createEmbeddedView の injector は宣言側の provider より優先。createComponent の既定の injector は目印の親。environmentInjector と ngModuleRef の両方は開発だけ例外 | view\_container\_ref.ts 185・225・476〜480・655〜662 | ページと記録。main 同じ |
| 4 | （不具合）NG0921 の文が「FirstModule vs FirstModule」と、先に登録された方を 2 回言う | linker/ng\_module\_registration.ts 31〜32 | Node の記録。e94975d109a（2018）から。spec 310 は正規表現だけ。issue なし。main 同じ |
| 4 | （説明と API）説明では変えられない QueryList の setDirty・destroy が `/** internal */`（@internal でない）で公開 API に載る。changes は EventEmitter でなく Subject。例は TS2564 | linker/query\_list.ts 21・32〜39・163・170〜187 | goldens と strict の tsc。main 同じ |
| 4 | （古い文）Compiler は NgModule ごとでなく root に 1 つ。getModuleId はいつも undefined。ComponentFactory は v22 で公開 API から外れた | linker/compiler.ts 23〜25・59〜64、component\_factory.ts 17・63 | ページと Node。compiler.ts 20 の link は main の 95e8dec4e22 で直った |
| 4 | （既知の不具合）platform の DestroyRef の onDestroy が PlatformRef.destroy() で呼ばれない | linker/destroy\_ref.ts 20、platform/platform\_ref.ts 123〜140 | Node の記録。#67095（開）。main 同じ |
| 5 | （不具合、例外の文）`input()`・`model()` を注入の文脈の外で呼ぶと、開発モードの NG0203 が「inputFunction()」「modelFunction()」と内部の名前を言う（第 6 回の viewChildFn・contentChildFn と同じ形）。本番は input() は確かめず signal を返す | authoring/input/input.ts 25・32、model/model.ts 18・24（di/contextual.ts 84 が debugFn.name を使う） | Node の記録。018f8266b3c（2024-03）から。issue なし。main 同じ |
| 5 | （説明が足りない）model の出力は子の set・update のときだけ流れ、親から束ねた値の変化では流れない（spec 213 は流れない方を固める）。transform は値が変わったときだけ走る。束ねない required はテンプレートで NG8008、createComponent では実行時の NG0950 | model/model\_signal.ts 48〜49、input/input\_signal.ts 27〜28、input.ts 100〜101 | ページと Node。main 同じ |
| 5 | （札の誤り）`@publicAPI`（大文字）が 11 か所。adev の安定版の札は `'publicApi'` のときだけ付く（queries.ts の 48・69・204 も同じで、こちらは @docsPrivate の型の中） | input.ts 46・103・166、input\_signal.ts 17・55、model.ts 41、model\_signal.ts 28・51、output\_emitter\_ref.ts 31、output\_ref.ts 20・29 | ts.getJSDocTags と adev の categorization.mts 165。1b1519224d1（2024-09）から。main 同じ |
| 5 | （説明に無い）壊したあとの emit は console.warn の NG0953（#70727）。OutputOptions.alias の説明が無い。outputFromObservable の例の `<some-observable>` は置き換えの印（TS1005） | output/output\_emitter\_ref.ts 84〜93、output.ts 20〜22、rxjs-interop/src/output\_from\_observable.ts 78 | ページと tsc。main 同じ |
| 6 | （不具合）`contentChild.required` の注入コンテキストの検査が `contentChildren` を渡すので、NG0203 の文が呼んでいない関数の名前を言う | authoring/queries.ts 186 | Node の記録（開発モード）。018f8266b3c（2024-03、#54761）から。issue なし。main 同じ |
| 6 | （不具合）`contentChildren` だけ注入コンテキストの検査が無く、外で呼んでも例外にならず結ばれない signal を返す（AOT は直接の呼び出しを NG8110 で止めるが、別名に取り出すと止まらない） | queries.ts 322〜331 | Node の記録と ngc。018f8266b3c から。issue なし。main 同じ |
| 6 | （頁に出ない）`@See` が大文字で、angular.dev の contentChild の頁に案内が出ない | queries.ts 271（頁の生成は adev の jsdoc-transforms.mts L253 で 'see' だけ） | angular.dev の 2 つの頁を 2026-11-22 に確かめた。6073493c5bb（2026-03）から。main 同じ |
| 6 | （例とコメント）例の imports 抜け（NG8001）と `@Component({...})`（TS1109）、NG0203 の文の名前が viewChildFn・contentChildFn、contentChild の中のコメントが viewChild のまま、headerElElRequired | queries.ts 99・113〜118・144・257・260・275〜276・309 | strict の ngc と Node の記録。main 同じ |
| 7 | （例が v22 で動かない）NgZone の例は、v22 の既定の OnPush では zone の中でも画面が 1% のまま。Eager を足すと説明どおり 100 回と 2 回。label は TS2564 | zone/ng\_zone.ts 45〜100（68〜69・76〜77・64） | zone.js ありの Node の記録。OnPush の既定は eae8f7e30b9（2026-03-16）。main 同じ |
| 7 | （説明文の誤り）`runTask` は同期のエラーを投げ直さず onError に出す（説明は逆） | ng\_zone.ts 248（実装 L250〜258・L518〜522） | zone.js ありの記録（開発・本番）。6279e50d785（2017）から。spec なし。main 同じ |
| 7 | （説明文の誤り）NgZone の isStable は macrotask が残っていても true（説明は「どちらも無い」） | ng\_zone.ts 111（実装 checkStable L354〜385） | zone.js ありの記録。main 同じ |
| 7 | （説明不足）子の EnvironmentInjector の ErrorHandler にはテンプレートのリスナーのエラーが届かず root のものへ。EventEmitter は error を渡さないと、関数の形は捨て、observer の形は未処理のエラー。非同期の EventEmitter と PendingTasks.run はアプリの安定をふさぎ、run の失敗は ErrorHandler へ。NoopNgZone の runGuarded は投げ直す | error\_handler.ts 56〜61・146〜169、event\_emitter.ts 94・131・146・152・179〜186、pending\_tasks.ts 63〜84、ng\_zone.ts 568〜570 | ページと Node の記録。main 同じ |
| 7 | （説明文の誤り）Testability.whenStable のコールバックは、時間切れでも安定でも引数 0 個（説明は「一覧か null」）。spec の名前「with didWork」も残る。findProviders はいつも \[\] | testability/testability.ts 187・226・233〜234・276〜284 | zone.js ありの記録。c2dd703d2ff（2024-01、#53767）から。main 同じ |
| 7 | （例の誤り）Testability の例の第 2 引数の `{ }` 抜け（TS1005）、ErrorHandler の例の TS7006 | testability.ts 88、error\_handler.ts 68 | strict の tsc。main 同じ |
| 7 | （古い文、直った）TransferState の説明の、もう無い ServerTransferStateModule | transfer\_state.ts 62〜63 | e8b588d8b7f（2024-03）で消えたモジュール。main の 860832591d5 と 22.2.6 で直った |
| 8 | （開発と本番で違う）DebugElement.properties のバインディングの値は開発モードだけ。本番は DOM の値（`[value]="5"` が開発 number 5、本番 string '5'） | debug/debug\_node.ts 165〜175・695〜711（render3/instructions/dom\_property.ts 44 ほか） | ページと Node の記録。spec 927 は開発だけ。main 同じ |
| 8 | （説明と違う）DebugElement.name が動的に作った根では `'#host'` | debug\_node.ts 150・159 | ページと記録。#71459（開）。main 同じ |
| 8 | （型と実物）listeners の中身は DebugEventListener の実例でない素の object | debug\_node.ts 40〜45・108〜109 | ページと記録。main 同じ |
| 8 | （古い例・言い過ぎ）context の説明が \*ngFor と NgForOf（@for では $implicit・$index の文脈）。nativeElement を「コンポーネントの根」。host のバインディングは入らないというコメント（実際は入る） | debug\_node.ts 96〜98・143・685〜687 | ページと記録。main 同じ。使われない索引（L736〜747）は main の b493d767a4b と 22.2.6 で消えた |
| 9 | （説明文の誤り）DomSanitizer.sanitize は「HTML 以外はただの文字列なら例外」と書くが、URL は直して返し STYLE はそのまま返す。例外は SCRIPT と RESOURCE\_URL だけ | platform-browser/src/security/dom\_sanitization\_service.ts 116〜117（実装 L169〜214） | ページと記録。0331473e3ac（2023-01、#48765）の書き直しから。spec なし。main 同じ |
| 9 | （古い文）bypassSecurityTrustUrl の「safe style URL」「&lt;img src&gt;」。22.2.6 と main では img の src は URL の文脈から外れた | dom\_sanitization\_service.ts 148〜149、core の dom\_security\_schema.ts 91〜92 | 読み比べ。表の 2 行は 22.2.6（6fa2b083e6f）と main（439ff1bdf4f）で消えた。説明文は main 同じ |
| 9 | （内部の説明文）ɵɵsanitizeStyle を「危ないものを取り除く」（何もしない）、script の戻り値の崩れた文、bypass の「String に包む」（class に包む）、hich、NgModule の頃の「モジュールに import」 | sanitization/sanitization.ts 75〜76・157〜158・272〜273、bypass.ts 143〜199 | 読み比べとページ。resource URL の `<img src>`（L129〜130）は 22.2.6 と main で直った。ほかは main 同じ |

説明文のとおりに動いたものも多くありました。signal のクエリの 4 つの関数の型と read・descendants の既定、required の NG0951、NgZone の run・runGuarded・onUnstable・onMicrotaskEmpty・onStable の順、EventEmitter の async、PendingTasks の add と run、TransferState の鍵と toJson の書き換え、DebugElement の query・queryAll・queryAllNodes と triggerEventHandler、`javascript:` の URL と `<script>`・`on*` を落とすサニタイズ、違う種類の印を渡すと例外、は説明文のとおりです。

## 聞かれそうな質問

**Q. このシリーズで、説明文ではなく実装の不具合と言えるものは？**

`attachView` の例外のあとの viewCount（第 1 回）、`createPlatform` の注入器が残る（第 2 回）、範囲外の `move` でビューが戻らない（第 3 回）、NG0921 の文（第 4 回）、NG0203 の文が内部の関数の名前を言う（第 5 回の inputFunction・modelFunction、第 6 回の viewChildFn・contentChildFn と、別の関数の名前の contentChildren）と `contentChildren` の検査の抜け（第 6 回）です。どれも spec が無いか、spec が文の一部しか見ていません。

**Q. 説明文と実装のどちらに合わせるべきか、どう決めますか？**

spec がどちらを固めているかを先に見ます。`runTask` のエラーは spec が無く、実装は 2017 年から同じなので、説明文を直す方が影響が小さい。`sanitize` の L116〜117 も、URL と STYLE を例外にすると今のアプリが壊れるので、説明文の側です。

**Q. 開発モードと本番で違う振る舞いは、spec で見つかりますか？**

見つかりにくいです。spec は開発モードで走るので、本番だけの差（第 3 回の負の添字、第 8 回の properties の型）は、本番のビルドか `ngDevMode = false` の Node の記録で確かめる必要がありました。

**Q. spec の名前だけが古いものは？**

testability\_spec.ts の「with didWork」（L270・L283）と、component\_spec.ts の describe の綴り `required initiliazers`（L928）です。前者は振る舞いが変わったあとに名前が残り、後者は綴り違いのまま `--filter` の名前になっています。

## 読み終えて

- このシリーズの spec は 4 つの target。`:test` は 4 つの shard の Ran を足して数える。
- 説明文の約束の多くは spec で固まっているが、runTask のエラー・sanitize の文字列・注入コンテキストの外のクエリは it が無い。
- 見つけた不具合は、どれも「失敗した操作が状態を残す」か「文が別の名前を言う」形で、spec が状態や文の全体を見ていない所にあった。
- v22 の既定（zoneless・OnPush）で、zone.js 前提の説明文と例がまとめて古くなった。
- 22.2.6 と main では、TransferState の文・使われない debug の索引・img の src・resource URL の文が直っている。

---

← 前: [サニタイズの公開 API の説明文：DomSanitizer の約束と SecurityContext](09-cra-sanitize.md)  
次: [bootstrapApplication と BrowserModule の説明文](../pbd/01-pbd-browser.md) →
