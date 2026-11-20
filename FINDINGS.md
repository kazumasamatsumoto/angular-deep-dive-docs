[目次](README.md)

# 見つけた不具合と、手元で作った直し

これまでの連載で、本家（angular/angular・angular/angular-cli・angular/components）のソースを読んでいる途中で見つけた不具合や食い違いを、シリーズごとに 1 か所に集めたものです。どれも本家には issue も PR も出していません。手元で直したものは、本家の木とは別の複製（`../angular-fix` など）の枝にだけあります。

この一覧は、各章の「このシリーズで見つけたもの」などの節を `npm run build` のたびに集め直して作っています（40 シリーズ）。行番号や確かめ方は各章のとおりで、デモは各章の「サイトで読む」（https://angular-deep-dive-cyan.vercel.app）から動かせます。

## 手元で直したもの（見つけた不具合を手元で直す）

どれも、前のシリーズの章でソースの行を根拠に見つけたもので、このシリーズで失敗する spec を書いて手元で確かめ直します。この表の「直しの大きさ」は、手元の枝のコミットで変えた src の行の数で、括弧の中が spec の行の数です。

| 回 | 不具合 | 見つけた章 | パッケージ | 直しの大きさ | 結果 |
| --- | --- | --- | --- | --- | --- |
| [2](fix/02-fix-enum.md) | 初期値の無い enum のメンバーの値が、前のメンバー + 1 でなく「並びの番号」になる | [partial evaluator](ngtsc/05-ngtsc-partial-evaluator.md)・[ngtsc の issue](ngtsc/20-ngtsc-issues.md) | compiler-cli | interpreter.ts +5 -2（spec +15） | 直った。周りの 4 ターゲットも PASSED |
| [3](fix/03-fix-defer-immediate.md) | `@defer (on immediate)` に `@loading` があると、サーバーの描画で placeholder が出ない | [defer の issue](defer/20-defer-issues.md) | core | defer/instructions.ts 1 行（spec +22） | 直った。2024 年の修正が落ちていたのを戻した |
| [4](fix/04-fix-event-replay-clickmod.md) | ハイドレーションの前の Shift クリックなどが再生されない | [jsaction の spec と issue](jsaction/12-jsaction-tests-issues.md) | core | event\_replay.ts 1 行 + 整形 1 行（spec +28） | 直った。整形のフックが関係の無い行も変えた |
| [5](fix/05-fix-defer-error-stable.md) | `@error` の無い塊の読み込みが失敗すると、アプリが安定しない | [defer の issue](defer/20-defer-issues.md) | core | defer/rendering.ts +10 -8（spec +56） | 直った。関係する開いた issue と PR が本家にある |
| [6](fix/06-fix-spec-assertions.md) | インクリメンタルハイドレーションの 4 つの it が、要素名の違いで空回りしている | [defer の issue](defer/20-defer-issues.md) | platform-server（spec だけ） | incremental\_hydration\_spec.ts +5 -5 | 直した。直したら別の誤り（泡立たないイベント）が出た |
| [7](fix/07-fix-declare-field.md) | デコレーターの付いたクラスの `declare` のフィールドが出力に出る | [Ivy の変換](ngtsc/12-ngtsc-ivy-transform.md)・[ngtsc の issue](ngtsc/20-ngtsc-issues.md) | compiler-cli | transform.ts +6 -1（spec +23） | 一部だけ直った |
| [8](fix/08-fix-elements-outputs.md) | Angular Elements が、壊したコンポーネントの出力を覚えたままにする | [Elements の spec と issue](elements/08-elements-tests-issues.md) | elements | component-factory-strategy.ts +2（spec +13） | 直った |
| [9](fix/09-fix-elements-reconnect.md) | 壊したあとにつなぎ直すと、コンポーネントが 1 回おきにしか作られない（#38778） | [Elements の spec と issue](elements/08-elements-tests-issues.md)・[切り離しと破棄](elements/07-elements-disconnect.md) | elements | component-factory-strategy.ts +1（spec +10） | 手元では直ったが、出さないと決めた |

8 つを全部重ねた枝 `all-fixes` では、9 つのターゲット（11 のテスト）がすべて PASSED でした。Elements の 2 つだけは spec の同じ場所に it を足しているので、重ねるときに衝突しました（両方の it を残して解きました）。[最終回](fix/10-fix-before-issue.md)で、新しい本家の上に 1 つずつ載せ直した結果と一緒に扱います。

## Angular Aria の内側

### [issue と PR を読む：Angular Aria の今](aria/20-aria-issues.md) — 6. issue になっていない食い違い（このシリーズで見つけたもの）

📄 `components/src/aria/private/combobox/combobox.ts` L9–40 （▶ の行: 9, 11–12, 16, 21, 27）

```ts
 9 ▶ import {computed, signal, untracked} from '@angular/core';
10 │ import {_getEventTarget} from '@angular/cdk/platform';
11 ▶ import {KeyboardEventManager, ClickEventManager, Modifier} from '../behaviors/event-manager';
12 ▶ import {SignalLike, WritableSignalLike} from '../behaviors/signal-like/signal-like';
13 │ import {ExpansionItem} from '../behaviors/expansion/expansion';
14 │ 
15 │ /** Represents the required inputs for a simple combobox. */
16 ▶ export interface ComboboxInputs extends ExpansionItem {
17 │   /** Whether the combobox should always remain expanded. */
18 │   alwaysExpanded: SignalLike<boolean>;
19 │ 
20 │   /** The value of the combobox. */
21 ▶   value: WritableSignalLike<string>;
22 │ 
23 │   /** The element that the combobox is attached to. */
24 │   element: SignalLike<HTMLElement>;
25 │ 
26 │   /** The popup associated with the combobox. */
27 ▶   popup: SignalLike<ComboboxPopupPattern | undefined>;
28 │ 
29 │   /** An inline suggestion to be displayed in the input. */
30 │   inlineSuggestion: SignalLike<string | undefined>;
31 │ 
32 │   /** Whether the combobox is disabled. */
33 │   disabled: SignalLike<boolean>;
34 │ 
35 │   /** Whether the combobox is readonly. */
36 │   readonly: SignalLike<boolean>;
37 │ 
38 │   /** Whether the combobox is soft disabled. */
39 │   softDisabled?: SignalLike<boolean>;
40 │ }
```

📄 `components/src/aria/private/behaviors/popup/popup.ts` L9–30 （▶ の行: 9, 12, 21, 23, 26, 29）

```ts
 9 ▶ import {SignalLike, WritableSignalLike} from '../signal-like/signal-like';
10 │ 
11 │ /** Valid popup types for aria-haspopup. */
12 ▶ export enum PopupTypes {
13 │   MENU = 'menu',
14 │   TREE = 'tree',
15 │   GRID = 'grid',
16 │   DIALOG = 'dialog',
17 │   LISTBOX = 'listbox',
18 │ }
19 │ 
20 │ /** Represents the inputs for the PopupControl behavior. */
21 ▶ export interface PopupControlInputs {
22 │   /* Refers to the element that serves as the popup. */
23 ▶   controls: SignalLike<string>;
24 │ 
25 │   /* Whether the popup is open or closed. */
26 ▶   expanded: WritableSignalLike<boolean>;
27 │ 
28 │   /* Corresponds to the popup type. */
29 ▶   hasPopup: SignalLike<PopupTypes>;
30 │ }
```

- private/combobox/combobox.ts は 9 行目で `computed`・`signal`・`untracked` を `@angular/core` から import しています。ui-pattern-rules.md の決まりは「signal などは signal-like.ts から」です（[第 2 回](aria/02-aria-signal-like.md)）。private/&lt;部品&gt;/ の Pattern で `@angular/core` を直接 import しているのは combobox だけでした（grep。ほかに import しているのは utils と deferred-content で、どちらも Pattern ではない）。12 行目の型は signal-like から取っています。
- popup.ts の `PopupControl` と、21〜30 行目の入力（`controls`・`expanded`・`hasPopup`）は、どの Pattern からも使われていません。`ComboboxPattern` の popup の種類は、12 行目の `PopupTypes` ではなく文字列の `'listbox' | 'tree' | 'grid' | 'dialog'` です（[第 17 回](aria/17-aria-combobox.md)の 6 節）。
- violations.ts のコメントは「errors として」、使っているのは `console.warn`。test-helpers.ts の `waitForMicrotasks` は `setTimeout(0)`。popup.spec.ts の it の名前の「inert」はコードに無い（[第 19 回](aria/19-aria-testing.md)）。

どれも動きは変わらないので、issue にするほどのものかは分かりません。読むときに「決まりと実物が違う所がある」と知っておくための一覧です。

## テンプレート型チェックの内側

### [issue と PR を読む：テンプレート型チェックの今](typecheck/20-typecheck-issues.md) — issue になっていない食い違い（第 17〜19 回で見つけたもの）

- **呼ばれない `suboptimalTypeInference`**：compiler/src/typecheck/oob.ts:113 のインタフェースと compiler-cli の実装（NG10002）が残っていますが、呼ぶ側は f3c471e0d50 で消えています（[第 17 回](typecheck/17-typecheck-oob.md)の 3 節）。main でもインタフェースは残っていて（main の compiler/src/typecheck/oob.ts:114。`gh api …/contents/…?ref=main` で読んだ）、`gh search code` で見た範囲では呼ぶ場所はありませんでした。同じ名前で探した issue・PR はありません（2026-11-02）。
- **ExtendedTemplateCheckerImpl が受け取る `ts.TypeChecker`**：コンストラクタの引数として渡され ctx に入りますが、16 の検査のどれも使っていません（[第 18 回](typecheck/18-typecheck-extended.md)の 4 節）。外から足す検査（#48117）のために残っているのかどうかは、コードからは分かりません。

## マイグレーションの内側

### [issue と PR を読む：マイグレーションの今](mig/20-mig-issues.md) — 4. このシリーズで見つけた「不具合らしきもの」

第 16〜18 回では、bazel でビルドした本物のバンドル（bazel-bin の packages/core/schematics/bundles/\*.cjs）を、spec と同じ形（`SchematicTestRunner` と一時ディレクトリ）で走らせて確かめました。../angular のファイルは変えていません。どれも `gh search issues` / `gh search prs` で同じ報告は見つかりませんでした（2026-11-03）。**本家に issue や PR を出すことは勧めません。**手元で同じ形を spec にして確かめ、issue を読むときの手がかりにします。

| マイグレーション | 入力の形 | 結果 | 行（章） |
| --- | --- | --- | --- |
| route-lazy-loading | `import * as cmps` と `component: cmps.X` | TypeError で止まる | to-lazy-routes.ts 300・303（[第 16 回](mig/16-mig-routing.md)） |
| route-lazy-loading | 同じ import 宣言にほかの名前がある | 宣言ごと消え、ほかの名前が未定義 | to-lazy-routes.ts 201〜203 |
| route-lazy-loading | `Router` を class で宣言した型の `resetConfig(routes)` | ルートの配列を見つけない | util.ts 100 |
| router-testing-module-migration | `providers` にもう `provideLocationMocks()` がある | 2 つになる | utils.ts 427〜432 |
| change-detection-eager | `describe` の中の `@Component` | Eager が足されない（v22 で OnPush に） | migration.ts 55（[第 17 回](mig/17-mig-v22-defaults.md)） |
| strict-templates-default | `"extends": ["./tsconfig.json"]` | path.join の TypeError で止まる | index.ts 28 |
| strict-templates-default | `"extends": "./tsconfig"`（.json を書かない） | 親が true でも子に false を書く | index.ts 16・28 |
| http-xhr-backend | `provideHttpClient(withRequestsMadeViaParent())` | `withXhr()` を足し、開発モードで Configuration error になる組にする | migration.ts 80〜95 |

ほかに、動きを変えない食い違いもありました。router-testing-module-migration の README と collection.json の説明が `provideRouter()` と書いていること（コードは `RouterModule`）、http-xhr-backend の migrations.json の説明が「HttpXhrBackend を使っているとき」と書いていること、`legacyOptionalChaining` の説明の向きが逆なこと、safe-optional-chaining の使われていない `hasNullCheckInAST` です。

## i18n と $localize の内側

### [issue と PR を読む：i18n の今](loc/20-loc-issues.md) — 4. このシリーズで見つけた「不具合らしきもの」

第 17〜18 回では、サイトの node\_modules の本物（`@angular/localize/tools` 22.1.6）を scratchpad の小さなスクリプトと CLI で走らせて確かめました。../angular のファイルは変えていません。どれも `gh search issues` / `gh search prs` で同じ報告は見つかりませんでした（2026-11-03）。**本家に issue や PR を出すことは勧めません。**手元で同じ形を spec にして確かめ、issue を読むときの手がかりにします。

| 場所 | 入力の形 | 結果 | 行（章） |
| --- | --- | --- | --- |
| localize-translate（SourceFileTranslationHandler） | ロケールが `../evil` の翻訳ファイルと、`$localize` を含む JS | 1 回目の書き込みは診断に積まれるが、同じパスへの 2 回目の書き込みが `try` の外で投げ、残りのファイルも診断の表示もされずに止まる（JS 以外と `$localize` の無い JS では `error:` の行になる） | source\_file\_translation\_handler.ts 129〜138（[第 18 回](loc/18-loc-translate-tool.md)） |
| ng build の翻訳の読み込み（angular-cli） | パーサーが ERROR を返す翻訳ファイル（#60566 の形） | CLI のローダーが `parse()` の診断を受け取らず、空の診断を返すので、エラーも警告も出ずに途中までの翻訳が使われる | angular-cli の load-translations.ts 32・35（[cli-i18n](cli/09-cli-i18n.md)、[第 17 回](loc/17-loc-translation-parsers.md)） |
| SimpleJsonTranslationParser | 拡張子は .json だが `"locale"` か `"translations"` の文字が無い | 理由が「File does not have .json extension.」になる | simple\_json\_translation\_parser.ts 41〜45（第 17 回） |
| canParseXml | 根の要素が 2 つある XLIFF 2.0 や XTB | 警告の文が「XLIFF 1.2 files should only have…」 | translation\_utils.ts 130〜138（第 17 回） |

動きを変えないものとして、`MessageSerializer` の使われていない `isPlaceholderContainer`（message\_serializer.ts 105〜107 行目）と、tools/test/helpers/index.ts の使われていない `counter`（[第 19 回](loc/19-loc-testing.md)の 7 節）、ES2015 のプラグインが投げるのが `Error` でなく文字列であること（第 18 回の 5 節）もありました。

## Service Worker の内側

### [issue と PR を読む：Service Worker の今](sw/20-sw-issues.md) — 5. このシリーズで見つけた「不具合らしきもの」

第 17・18 回で、本物の配布物（サイトの node\_modules の `@angular/service-worker` 22.1.6）をデモの偽物の上で、TypeScript のソースを SwTestHarness の上で走らせて確かめました。../angular のファイルは変えていません。どれも `gh search issues` で同じ報告は見つかりませんでした（2026-11-03。「dataGroups offline」「safeFetch」など）。**本家に issue や PR を出すことは勧めません**（0 節のとおり、security に関わらない直しは受け付けられません）。issue を読むときの手がかりにします。

📄 `出力（scratchpad/sw-logs/e-harness-scratch.log）`

```
# scratchpad/sw-e-work/harness-datagroup.ts（SwTestHarness。../angular は読むだけ）
# asset の /index.html、performance のデータグループ ^/api/.*$。初期化のあと server.online = false
/index.html -> 200 OK                     ← アセットのキャッシュ
/other.txt -> 504 Gateway Timeout         ← Driver.safeFetch（return await）
/api/b -> rejected: Error: Offline.       ← DataGroup.safeFetch（await の無い return）
Debug log:
[] Error(Offline., Error: Offline. ...)   ← /other.txt の 1 行だけ。/api/b は残らない
```

| 場所 | 形 | 結果 | 章 |
| --- | --- | --- | --- |
| data.ts の `DataGroup.safeFetch` | データグループの URL を、オフラインで、キャッシュにも無いときに取る | `try` の中が `return this.scope.fetch(req)`（`await` が無い）なので、拒否が `catch` を通らず、504 にも log にもならずにページまでネットワークエラーとして届く。`Driver.safeFetch` は `return await` で 504 と log の 1 行。main の data.ts も同じ（`gh api …?ref=main` で確かめた） | [第 17 回](sw/17-sw-debug.md)の 4 節・[第 10 回](sw/10-sw-data-groups.md) |
| debug.ts の `since()` | 差がちょうど 0 ミリ秒 | 空の文字列になり、`Last update check:` の後ろや log の `[]` が空になる | [第 17 回](sw/17-sw-debug.md)の 2 節 |
| worker/testing/fetch.ts の `MockRequest.clone` | POST の Request を `scope.fetch` に渡す | method と destination を写さないので、サーバーには GET として届く（テストの道具の限界。製品の動きではない） | [第 18 回](sw/18-sw-testing-harness.md)の 8 節 |
| worker/testing/scope.ts の `ConfigBuilder`・`AssetGroupBuilder` | — | どこからも使われていない。`toManifestGroup()` は `null!` を返すだけ | 第 18 回のテストと直し方 |

> [!NOTE]
> **ポイント**
>
> デモの偽物（sw-sandbox）では、上の 1 つ目の形で `world.fetch` が `error` を入れて返さずに例外を投げます。これは sandbox の `dispatch` が async 関数で、返した Promise が平らにされるためで、本物のワーカーの話ではありません。SwTestHarness でも同じ拒否になり、data.ts の行で説明できることを確かめてから、1 つ目を「不具合らしきもの」に入れました。

## DOM レンダラーとイベントの内側

### [issue と PR を読む：レンダラー・スタイル・イベント・セキュリティの今](domr/20-domr-issues.md) — 5. このシリーズで見つけた「不具合らしきもの」と小さな気づき

第 17〜19 回で、ソースの行と本物の配布物（サイトの node\_modules の 22.1.6）で確かめたものです。../angular のファイルは変えていません。どれも **本家に issue や PR を出すことは勧めません**。issue を読むときの手がかりにします。

| 場所 | 形 | 確かめ方 | 章 |
| --- | --- | --- | --- |
| sanitization.ts の `ɵɵvalidateAttribute`・dom\_security\_schema.ts の `checkSecurityContext` | `math` の名前空間の `set` の `to` が素通り | 第 18 回のデモ 2 で本物の `ɵɵvalidateAttribute('x', ':math:set', 'to')` が値を返す。既に #70743 として開いている | [第 18 回](domr/18-domr-trusted-types.md) |
| meta.ts の `parseSelector` | `name` も `property` も無いタグ（`charset` など）は `property="undefined"` で探すので、`addTag` のたびに増える | 第 19 回のデモで 2 回 addTag。meta\_spec.ts に charset の it は無い。振る舞いとして文書に書かれていないので、不具合かどうかは決めていない | [第 19 回](domr/19-domr-title-meta.md) |
| meta.ts 65 行目の `_cachedHead` | どこからも使われていないフィールド | `grep`。main では消えていた（`gh api …?ref=main`） | 第 19 回 |
| dom\_security\_schema.ts 112 行目のコメント・security\_spec.ts の `SECURITY_SENSITIVE_ATTRS` の上のコメント | 今は無い名前（`SECURITY_SENSITIVE_ELEMENTS`・compiler の `SECURITY_SENSITIVE_ATTRS`）を指している | `grep -rn` で、そのコメントの行しか出ない。main も同じ | 第 18 回 |
| testability.ts の `whenAllStable` | Testability が 0 個だと callback が呼ばれない | ソースの行（40〜49 行目）だけで確かめた。これを確かめる spec は見つからなかった | 第 19 回 |

## common の内側

### [issue と PR を読む：common の今](cmn/20-cmn-issues.md) — 5. このシリーズで見つけた「不具合らしきもの」

各章で、ソースの行と本物の配布物（このサイトの node\_modules の 22.1.6）で確かめたものです。../angular のファイルは変えていません。`gh search issues` で同じ issue は見つかりませんでした（2026-11-05、各章に検索の言葉を書いた）。どれも**本家に issue や PR を出すことは勧めません**。issue を読むときの手がかりにします。確かめ方の細部は各章にあります。

| 場所 | 形 | 確かめ方 | 章 |
| --- | --- | --- | --- |
| mock\_platform\_location.ts の `forward` | 最後の要素で forward すると、位置が配列の外に出て `TypeError`（225 行目が `< length`） | 第 18 回の DEMO と Node で 22.1.6 を動かした。main も同じ行 | [第 18 回](cmn/18-cmn-location-testing.md) |
| mock\_platform\_location.ts の `pushState`・location\_mock.ts の `pushHistory` | 位置 0 まで戻ってから書くと、進む側の履歴が残る（`> 0` のときだけ捨てる） | 同上。go → go → back → back → go で 4 つ残る | 第 18 回 |
| mock\_location\_strategy.ts の `back` | replaceState のあとで戻ると、今のパスが記録用の文字列 `replace: /b` になる | 本物の Location と組み合わせて Node で動かした | 第 18 回 |
| location.ts の `go` と `onUrlChange` | listener が受け取る URL が、go では base href 付き、戻るでは正規化済み。# が変わる戻るでは 2 回 | 第 17 回の DEMO。振る舞いとして文書に書かれていないので、不具合かどうかは決めていない | [第 17 回](cmn/17-cmn-location.md) |
| imgix\_loader.ts の独自の変換 | 値にカンマを含む変換（`crop: 'faces,edges'`）が `split(',')` で割れる | 第 15 回の DEMO と Node | [第 15 回](cmn/15-cmn-image-loaders.md) |
| keyvalue\_pipe.ts の `compareFn` | 関数 → `null` に変えても並びが戻らない（あとで main の 622a7c7f29d・issue #71893 で直り、22.2.6 に fb705aad90 として入った） | 第 8 回で 22.1.6 を Node で動かした | [第 8 回](cmn/08-cmn-keyvalue-pipe.md) |
| NgStyle の shorthand と longhand | `padding` だけを変えると `padding-left` が画面で消える | 第 2 回の DEMO（renderer に届いた呼び出し） | [第 2 回](cmn/02-cmn-ng-class-style.md) |
| format\_date.ts | 閉じていない `'` が消える／-00:30 のタイムゾーンの符号／0〜99 年の `W` | 第 10・11 回で本物の 22.1.6 を動かして確かめた（第 11 回は spec の形の再現も示した） | [第 10 回](cmn/10-cmn-format-date.md)・[第 11 回](cmn/11-cmn-date-getters.md) |
| number\_pipe.ts の CurrencyPipe | `currencyCode` に `null`・`''` を渡したときの通貨の決め方 | 第 12 回 | [第 12 回](cmn/12-cmn-format-number.md) |
| router\_testing\_module.ts の文書コメント | 「TestBed の既定は MockPlatformLocation」は v21 の c795960ada1 から古い（今は FakeNavigationPlatformLocation） | `git show c795960ada1` の BREAKING CHANGE の文と、platform-browser/testing の providers | 第 18 回 |

テスト用の部品（第 18 回の 3 つ）は TestBed の既定ではないので、ふつうのアプリのテストには出ません。自分で `MockPlatformLocation` を入れたテストで、端の操作をしたときだけ出ます。

## ngtsc の内側

### [issue と PR を読む：ngtsc の今](ngtsc/20-ngtsc-issues.md) — 7. このシリーズで見つけたもの

第 1〜19 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも本物の @angular/compiler-cli 22.1.6 で再現し、手元の木（8576f161ae4）のソースの行と照らして確かめました。本家の spec の形では走らせていません（../angular を変更しないため）。gh で探した範囲では、同じ報告は見つかりませんでした（最後の行の #48976 は既存の issue です）。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| 初期値の無い enum のメンバーの値が TypeScript と違う。`enum Size { Small = 1, Large }` の `Size.Large` を評価すると 1 になる（TypeScript では 2）。selector に使うと `app-size-1` が出力される | partial\_evaluator/src/interpreter.ts 323 行目（並びの番号 index をそのまま値にする） | PartialEvaluator と NgtscProgram の emit の記録 | [第 5 回](ngtsc/05-ngtsc-partial-evaluator.md) |
| Angular のクラスで、ほかのデコレーターが付いた `declare` のフィールドが、`useDefineForClassFields: true` のとき JS に `note;` として出る | transform/src/transform.ts 315-316 行目（作り直したノードに NodeFlags.Ambient が無い） | NgtscProgram の emit と、作り直す前後のノードの比較。既存の spec は es2015 で走るので拾わない | [第 12 回](ngtsc/12-ngtsc-ivy-transform.md) |
| 途中にデコレーターの無い素のクラスを挟むと、継承した入力が型チェックで見えなくなり NG8002 になる（実行時は ɵɵInheritDefinitionFeature で親の入力が効く） | metadata/src/inheritance.ts 50-56 行目（'dynamic' で止まる） | 継承の連なりの記録（plainMiddle の場面） | [第 10 回](ngtsc/10-ngtsc-metadata-registry.md) |
| 配布物 22.1.6（22.2.6 でも同じ）では、エラーの説明へのリンクが v22 ではなく next.angular.dev を指す。ソースでは版の判定の文字列を 2 つに分けて書いているが、配布物では 1 つにまとまったあとで版の番号に置き換わり、`full === "22.1.6"` になっている | diagnostics/src/error\_details\_base\_url.ts 14 行目と、配布物の chunk-NPM4D5UO.js 147 行目（22.2.6 では chunk-HRCA6XIV.js 151 行目） | 記録した診断のリンクと、配布物の中身 | [第 18 回](ngtsc/18-ngtsc-diagnostics-perf.md) |
| （不具合とはしない）resourceChangeTicket の道のあとに emit すると、出力のテンプレートが古いまま。この道を使うのは emit しない言語サービスだけ | annotations/component/src/handler.ts 1547 行目（analysis.template だけ書き換える）と 1602 行目（compileFull は analysis.meta を使う） | チケットの記録 | [第 3 回](ngtsc/03-ngtsc-compiler-ticket.md) |
| （テスト）hmr\_spec.ts 378-392 行目の it は「HMR に対応しない Angular のクラス」を試す名前だが、`Directive` を import して `@Component` と書いているため、実際はデコレーターの無いクラスの道を通っている | test/ngtsc/hmr\_spec.ts 378-392 行目 | 同じ入力の記録（spec-directive と real-directive の場面） | [第 17 回](ngtsc/17-ngtsc-hmr.md) |
| （テスト）ngtsc\_spec.ts 1754 行目の it は名前が @ContentChild なのに、1755 行目で 'ContentChildren' を渡している。@ContentChild そのものを試す it が無い | test/ngtsc/ngtsc\_spec.ts 1754-1755 行目 | spec の行を読む | [第 9 回](ngtsc/09-ngtsc-directive-handler.md) |
| （今は影響なし）性能の記録の JSON を作るとき、事件の配列を段の配列の長さで回している。事件の数が段の数を超えると、後ろの事件が出なくなる書き方 | perf/src/recorder.ts 103 行目 | ソースの行を読む | [第 18 回](ngtsc/18-ngtsc-diagnostics-perf.md) |
| （文書）perf/README.md の説明（ts: の前置き、mark と span）が今のコードと合っていない | perf/README.md | コードと見比べる | [第 18 回](ngtsc/18-ngtsc-diagnostics-perf.md) |
| （既存の issue）standalone のコンポーネントどうしの循環は build のときに知らされず、実行時に ReferenceError で落ちる。開いている #48976 の症状 | annotations/component/src/handler.ts 2111 行目（standalone は循環を調べない） | 記録した .js を Node で読み込む | [第 16 回](ngtsc/16-ngtsc-cycles.md) |

読み方の目安: 上の 2 つ（enum と declare）は、出力の JS がソースの意味とずれるので、影響がいちばん大きいものです。issue を探すときは、題の言葉より、表の「どこ」のファイル名や関数名で gh を検索すると見つけやすくなります。

## Angular DevTools の内側

### [issue と PR を読む：DevTools の今](devtools/20-devtools-issues.md) — 7. このシリーズで見つけたもの

第 1〜19 回を書く途中で、本家の不具合らしきものと、テストの小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも記録（本物の devtools のソースと本物の @angular/core 22.1.6）で起き、手元の木（8576f161ae4）のソースの行と照らして確かめました。記録の環境（Node と domino）のせいで起きるだけのものは入れていません。gh で探した範囲では、同じ報告は見つかりませんでした（#55570 は既存の issue です）。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| 要素の注入器が GC で消え、そのあと provider の一覧を頼んでも返事が来ない。core の `getInjector` は呼ぶたびに新しい NodeInjector を作るが、id の表は最初に作ったものを WeakRef でしか持たない | ng-devtools-backend の component-tree.ts 70-78 行目（getOrCreateInjectorId）と、core の discovery\_utils.ts 147 行目 | `node --expose-gc` で走らせた記録（GC の前後） | [第 7 回](devtools/07-devtools-identity.md) |
| 注入されたサービスの一覧から、要素の注入器の依存が落ちる。道筋の注入器と `providedIn` を、オブジェクトが同じかどうかで比べているが、core が NodeInjector を毎回作り直すので一致しない | directive-forest/component-tree/component-tree.ts の getDependenciesForDirective の 347 行目の比べ方と、core の injector\_discovery\_utils.ts 648 行目 | ɵgetInjectorResolutionPath を 2 回呼んで比べた記録 | [第 16 回](devtools/16-devtools-injector-tree.md) |
| ページに、アプリより前に別の `[ng-version]` の要素があると、版をその要素の値で読み、ivy でないと判定して「対応していない」と出す | shared-utils/src/lib/angular-check.ts 18-19 行目と 55-59 行目（querySelector で最初の 1 つだけを見る） | よその要素を前に置いた場面の記録 | [第 2 回](devtools/02-devtools-detect.md) |
| プロファイラーで複数のフレームを選ぶと、listener の時間（outputs）と、最初のフレームに無いフックの時間が合計から落ちる | ng-devtools の frame-merger.ts の mergeDirective（lifecycle の鍵を足し込まれる側だけで回し、outputs を足す行が無い） | 第 13 回の記録のフレームを足し合わせた結果 | [第 14 回](devtools/14-devtools-profiler-formatters.md) |
| 入れ子の途中の値が null だと、ログを出すだけで止まらずに TypeError になり、返事が送られない。パネルに残った once が次の返事も受け取り、別の行の中身が違う行の下に入る | client-event-subscribers.ts 269-273 行目（getNestedPropertiesCallback）と、パネルの property-data-source.ts の \_toggleNode | 本物のパネルの部品とバックエンドをつないだ記録 | [第 10 回](devtools/10-devtools-property-resolver.md) |
| ハイドレーションの重ね表示を有効にすると、状態が `dehydrated` の要素で例外になって止まる（プロトコルの型には dehydrated がある） | hydration/hydration-overlays.ts 85-97 行目の switch | `ngh` を付けた要素で enableHydrationOverlays を送った記録 | [第 18 回](devtools/18-devtools-router-transfer.md) |
| overlay の大きさを小数のまま書く修正（56847dc77a5）が、あとの highlighter の作り直し（98115e81371）で消え、再び整数に切り捨てている。その修正で足した spec も無くなっている | shared/highlighter/dom.ts 113-116 行目（`~~width`） | merge-base で 56847dc77a5 が祖先であることと、spec の grep | [第 12 回](devtools/12-devtools-inspector-highlight.md) |
| 同じオブジェクトを 2 か所から指すと、循環していないのに 2 つめが `[Circular]` で届く | shared/utils/serialization.ts 32-35 行目（一度見たものをすべて seen に入れる） | route の data に同じオブジェクトを 2 つ入れた記録 | [第 18 回](devtools/18-devtools-router-transfer.md) |
| （小さなもの）制御フローの塊が、木を頼むたびに「新しい」と「消えた」の両方に入り、id が増え続ける。オブジェクトの provider（`{provide, useValue}`）がルーターの木で名前 null になる。signal の中のプロトタイプの無いオブジェクトを書き換えると、意図したエラーではなく TypeError になる | identity-tracker.ts 137-139 行目、router-tree.ts 102 行目、property-mutation.ts 220 行目 | それぞれの記録 | [第 7 回](devtools/07-devtools-identity.md)・[第 18 回](devtools/18-devtools-router-transfer.md)・[第 11 回](devtools/11-devtools-property-mutation.md) |
| （テスト）prop-type.spec.ts 89 行目が `expect(actual).toBe(actual)` で、自分と自分を比べているので型の判定を何も確かめていない。identity-tracker.spec.ts 139 行目の it は「二度は足さない」という名前だが、148 行目は足されることを確かめている | shared/state-serializer/prop-type.spec.ts 89 行目、directive-forest/identity-tracker/identity-tracker.spec.ts 139-148 行目 | spec の行を読む | [第 9 回](devtools/09-devtools-state-serializer.md)・[第 7 回](devtools/07-devtools-identity.md) |
| （既存の issue）コンソールに出す provider の値が、選んだ provider ではなく `injector.get(token)` の値になる。#55570 の症状 | client-event-subscribers.ts 601 行目（logProvider） | providers と viewProviders に同じ token を置いた記録 | [第 16 回](devtools/16-devtools-injector-tree.md) |

読み方の目安: 上の 2 つ（注入器の件）は、どちらも「core が NodeInjector を毎回作り直す」ことと「devtools がオブジェクトの同一性に頼る」ことの組み合わせで起きています。直す場所が core の側か devtools の側かを決めるところから考える、よい練習になります。issue を探すときは、題の言葉より、表の「どこ」のファイル名や関数名で gh を検索すると見つけやすくなります。

## @defer とインクリメンタルハイドレーションの内側

### [issue と PR を読む：@defer とインクリメンタルハイドレーションの今](defer/20-defer-issues.md) — このシリーズで見つけたもの

第 1〜19 回を書く途中で、本家の不具合らしきものと、テストやコメントの小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも本物の @angular/core 22.1.6 を Node で動かした記録で再現し、手元の木（8576f161ae4）のソースの行と照らして確かめました。上の 3 つは、私がソースの行をもう一度読んで確かめています。本家の spec の形では走らせていません（../angular を変更しないため）。gh で探した範囲では、上の 3 つと同じ報告は見つかりませんでした（#71296 と #52800 は既存の issue です）。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `@defer (on immediate)` に `@loading` があると、サーバーの描画で placeholder が出ず、塊のところが空になる。2024 年の修正 383e093e6a1（#54385）が足した「サーバーでは描く」条件が、あとの作り直し 30891d8dec1 で落ちている（その修正には spec が無かった） | defer/instructions.ts 440-446 行目（コメントだけ「クライアントでは」と残り、条件は `loadingTmplIndex === null` だけ） | renderServer の記録（塊 7 と、@loading の無い塊 6 の比較）と、2 つのコミットの差分 | [第 15 回](defer/15-defer-server.md) |
| @error の無い hydrate の塊で依存の読み込みが失敗すると、アプリがいつまでも安定しない。Error のテンプレートが無いので ON\_COMPLETE\_FNS が呼ばれず、ハイドレーションの順番待ちの await が解けず、足した PendingTasks が戻らない。registry・hydrating・jsaction も残る | defer/rendering.ts 249 行目の `if (stateTmplIndex !== null)` の中にある 305-313 行目と、defer/triggering.ts 448-459 行目 | queue.ts・repro.ts の記録（@error がある形は 1 秒以内に安定、無い形は安定しない）。近い #71769・PR #71798 は 478 行目が投げる形だけを扱う | [第 17 回](defer/17-defer-hydration-queue.md)・[第 19 回](defer/19-defer-tests.md) |
| （spec）hydrate on interaction・hover の it が、ハイドレーションのあとに `<div jsaction=` が無いことを確かめているが、実際の要素は `<article>` なので、ハイドレーションが起きても起きなくても通る | platform-server/test/incremental\_hydration\_spec.ts 881 行目・1021-1023 行目 | spec の行を読む（同じ spec の 851 行目は `<article jsaction=` を見ている） | [第 18 回](defer/18-defer-hydrate-events.md) |
| `@defer (when x)` で x が最初から真だと、サーバーの描画で placeholder が出ない（文書の「サーバーでは placeholder」と違う）。2024 年 2 月から同じ形で、最近の後退ではない | defer/instructions.ts 242-256 行目（真なら placeholder を描かずに triggerDeferBlock を呼び、サーバーなのでそこで止まる） | renderServer の記録（塊 1） | [第 15 回](defer/15-defer-server.md)・[第 8 回](defer/08-defer-when.md) |
| （小さな残り）入れ子の hydrate の塊の途中で読み込みが失敗すると、先にハイドレートできた親の塊が registry と hydrating に残る。画面への影響は確かめていない | defer/triggering.ts 488-507 行目と hydration/cleanup.ts 158 行目 | queue.ts の記録（中の塊の失敗の場面で d0 が残る） | [第 17 回](defer/17-defer-hydration-queue.md) |
| （既存の issue）ハイドレーションの途中にもう一度イベントが来たときの #71296 の症状が、22.1.6 でも出る | hydration/event\_replay.ts の塊のハイドレーションの道 | events.ts の記録（inflight の場面） | [第 18 回](defer/18-defer-hydrate-events.md) |
| （main で直っている）on viewport の options で scrollMargin だけが違う 2 つの塊が、1 つの IntersectionObserver を分け合い、2 つ目の options が使われない | primitives/defer/src/triggers.ts 219 行目（鍵が rootMargin と threshold だけ）。main の 61fd731e6a5 で鍵に scrollMargin が足された | viewport.ts の記録（8〜9 段目） | [第 12 回](defer/12-defer-viewport.md) |
| （不具合とはしない）idle の予定を流し終わったあとに、終わった番号で cancelIdleCallback が呼ばれる。ブラウザでは何も起きないが、自分で IdleService を差し替えると cancelOnIdle に終わった番号が来る | defer/idle\_scheduler.ts（c2b14b7ab44 のあとの形） | idle.ts の記録（5 段目） | [第 9 回](defer/09-defer-idle-immediate.md) |
| （仕様どおり）@error が無い塊の読み込みが失敗すると、画面は loading のまま残り、FAILED が tDetails に残るので二度と読み込みに行かない。開いている #52800（やり直し）を読む手がかり | defer/rendering.ts 446 行目・defer/triggering.ts 250 行目 | resource-loading.ts の記録 | [第 6 回](defer/06-defer-resource-loading.md) |
| （コメント）LDeferBlockDetails の説明のコメントが「今は state の欄だけ」と書いているが、実物は 10 個の欄がある | defer/interfaces.ts 250-252 行目 | コードと見比べる | [第 3 回](defer/03-defer-details.md) |

読み方の目安: 上の 2 つ（on immediate のサーバーの描画と、@error の無い hydrate の塊）は、画面や安定の待ちに出るので、影響がいちばん大きいものです。issue を探すときは、題の言葉より、表の「どこ」の関数名（ɵɵdeferOnImmediate・triggerHydrationForBlockQueue など）で gh を検索すると見つけやすくなります。

## イベント配送（event-dispatch）と jsaction の内側

### [spec と issue を読む：event-dispatch の今](jsaction/12-jsaction-tests-issues.md) — このシリーズで見つけたもの

第 1〜11 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。上の 4 つは、本物の配布物（@angular/core 22.1.6）か手元のソース（8576f161ae4）を本物の Chrome で動かして再現し、私がソースの行をもう一度読んで確かめました。本家の spec の形では走らせていません（../angular を変更しないため）。gh で探した範囲では、#71518 のほかに同じ報告は見つかりませんでした。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| ハイドレーションの前に Shift や Cmd（Mac 以外では Ctrl）を押しながらしたクリックが、渡し直されない。早期の契約には貯まるが、再生のときに種類が clickmod に書き換わり、サーバーが付けた `click:;` に当たらない。2a915d1912d（#57201）は当時のイベントの委譲には clickModSupport を false で渡したが、イベントの再生には渡していない | core/src/hydration/event\_replay.ts 220 行目（`new EventDispatcher(fn)` で clickModSupport が既定の true）と primitives/event-dispatch/src/action\_resolver.ts 93-98 行目 | このサイトの本番のプリレンダーで main を止めたまま押してから JS を流す（ふつうのクリックは動き、Shift・Cmd は動かない）。ソースを束ねた記録でも delegate が 0 回 | [第 7 回](jsaction/07-jsaction-resolver.md) |
| 同じ Event を 2 つの EventDispatcher が配ると、2 つ目で `TypeError: Cannot redefine property: stopPropagation` になる。stopPropagation を書き換えられない形（configurable: false）で貼るため。インクリメンタルハイドレーションでは body の契約が残るので、APP\_ID の違う 2 つのアプリが 1 ページにあると起きうる（Angular のアプリ 2 つでは試していない） | primitives/event-dispatch/src/event\_dispatcher.ts 105-114 行目と 172-179 行目 | 公開の入口だけで 2 組の EventContract と EventDispatcher を入れ子に置いて押す（22.1.6・手元・main のソースのどれでも出る）。このサイトでも、デモの組を body まで泡立たせると出る | [第 10 回](jsaction/10-jsaction-dispatcher.md) |
| （既存の issue）早期の契約が body に付けたリスナーが、アプリの起動後も外されず、早期の箱の q に積み続ける。initEventReplay は clearAppScopedEarlyEventContract を呼ぶが、removeAllAppScopedEventListeners を呼ばない（425f44c1333 で抜け落ちた）。#71518 と PR #71519。2026-11-10 に閉じられ、22.2 系には 6b257f59b42 として v22.2.6 から入った（`clearAppScopedEarlyEventContract` がリスナーも外す）。このサイトの 22.2.6 の第 5 回のデモでは、チェックを外しても「clear のあとに q に増えた数」は 0 のまま | core/src/hydration/event\_replay.ts の initEventReplay | 自分専用の appId で同じ順に呼ぶデモと、記録の「安定の後に押す」場面 | [第 5 回](jsaction/05-jsaction-early-contract.md)・[第 11 回](jsaction/11-jsaction-angular.md) |
| registerAppScopedDispatcher（と registerGlobalDispatcher）で渡した関数が呼ばれない。欄の `d` を差し替えるが、リスナーの `h` が呼ぶのは作ったときの局所の `d` のまま。最小化した min.js の中も同じ形。Angular の中ではこの関数を呼んでいないので、Angular のアプリには影響しない | primitives/event-dispatch/src/earlyeventcontract.ts 70-74 行目と 121 行目 | 自分専用の appId のデモで、登録したあとに押しても 0 回のまま | [第 5 回](jsaction/05-jsaction-early-contract.md) |
| getActionCache が返した辞書に書き込むと、ほかの要素にも効く。jsaction の無い要素には共有の EMPTY\_ACTION\_MAP が、同じ文字列の要素には同じ辞書が貼られるため。Angular 本体は getActionCache を使っていない | primitives/event-dispatch/src/action\_resolver.ts 22 行目・256-257 行目と cache.ts 27-29 行目 | ライブのデモ（main でも同じ） | [第 2 回](jsaction/02-jsaction-attribute.md) |
| 素の Dispatcher が再生の配列を空にしないので、2 回目の予定のときに、前のイベントがもう一度渡される。最初の版（666d6465758）のコメントは「空にするのは eventReplayer の役目」と書いていたが、今はそのコメントも無い。Angular は eventReplayer を渡さない EventDispatcher だけを使う | primitives/event-dispatch/src/dispatcher.ts 98-108 行目と createEventReplayer | ソースを束ねて Node で動かした記録 | [第 10 回](jsaction/10-jsaction-dispatcher.md) |
| （文書）README が Dispatcher を `@angular/core/primitives/event-dispatch` から import する例を載せているが、index.ts は Dispatcher を出していない | primitives/event-dispatch/README.md 206 行目と index.ts 13 行目 | 2 つを見比べる（main も同じ） | [第 1 回](jsaction/01-jsaction-overview.md)・[第 10 回](jsaction/10-jsaction-dispatcher.md) |
| （確かめていない手がかり）hydrate トリガーの jsaction を足すときの重複よけが `indexOf` の部分一致なので、要素にすでに `dblclick:;` があると `click:;` が足されない書き方。呼ばれる順番と、実際に塊が目覚めないかは確かめていない | core/src/event\_delegation\_utils.ts 39-42 行目 | ソースの行を読む | [第 11 回](jsaction/11-jsaction-angular.md) |
| （spec）event\_test.ts で、target に関数そのものを渡す it が別の条件で先に偽になって通る（262 行目）、'Enter' を 2 回確かめて Space の文字を確かめていない（276-279 行目）、重複をまとめた it で同じ expect が 2 回ずつ並ぶ（451 行目、667219230ac）。getParentNode の shadow root から host へ跳ぶ道（action\_resolver.ts 213-214 行目）はどの spec も通らない。捕獲の種類を対象の要素だけに渡す行（event\_dispatcher.ts 90-95 行目）を確かめる it が無い | primitives/event-dispatch/test/event\_test.ts ほか | spec の行を読む | [第 8 回](jsaction/08-jsaction-a11y-click.md)・[第 7 回](jsaction/07-jsaction-resolver.md)・[第 10 回](jsaction/10-jsaction-dispatcher.md) |
| （コメント）action\_resolver.ts のコメントが「a11y の click を有効にすると addEvent が key のハンドラを自動で付ける」と書くが、今の addEvent にその処理は無い。event\_type.ts のコメントは「submit は泡立たない」と書くが、一覧（305 行目）とは食い違う（Chrome では泡立つ） | action\_resolver.ts 89-92 行目、event\_type.ts 84-85 行目 | コードと見比べる | [第 8 回](jsaction/08-jsaction-a11y-click.md)・[第 4 回](jsaction/04-jsaction-event-types.md) |

読み方の目安: 上の 2 つ（修飾キーのクリックが再生されない・2 つの EventDispatcher の例外）は、Angular のアプリの動きに出るので、影響がいちばん大きいものです。issue を探すときは、題の言葉より、表の「どこ」の関数名（initEventReplay・prepareEventForBubbling・clickModSupport など）で gh を検索すると見つけやすくなります。

## Angular Elements の内側

### [出力とイベント：CustomEvent になるまで](elements/06-elements-outputs.md) — この章の行で見つけたもの：外して、待って、戻すと、出力が届かなくなる

1 節の「`ReplaySubject(1)` は最後の配列を覚えている」と、`OutputEmitterRef` の次の行を合わせると、次のことが起きます。

📄 `angular/packages/core/src/authoring/output/output_emitter_ref.ts` L52–58 （▶ の行: 52–54）

```ts
52 ▶     if (this.destroyed) {
53 ▶       throw new RuntimeError(
54 ▶         RuntimeErrorCode.OUTPUT_REF_DESTROYED,
55 │         ngDevMode &&
56 │           'Unexpected subscription to destroyed `OutputRef`. ' +
57 │             'The owning directive/component is destroyed.',
58 │       );
```

1. **要素を外して 10 ms 以上たつ**

   コンポーネントが壊されます（[第 7 回](elements/07-elements-disconnect.md)）。`output()` の `OutputEmitterRef` は `destroyed` になります。`eventEmitters` は、壊れたコンポーネントの出力の配列を覚えたままです。
2. **同じ要素を戻す**

   `connectedCallback` の 204 行目の購読で、`ReplaySubject(1)` が**壊れたコンポーネントの配列**をすぐ渡します。`merge` が 236 行目の `emitter.subscribe` を呼び、52〜58 行目で `RuntimeError`（NG0953）が投げられます。
3. **購読が error で終わる**

   投げられた例外は Observable の中で error として流れ、`subscribeToEvents` の購読（error の受け手を書いていない）が閉じます。コンソールには NG0953 が出ます。
4. **新しいコンポーネントができても、出力は届かない**

   あとでコンポーネントが作り直されて 241 行目で新しい配列が流れても、もう誰も購読していません。**`output()` だけでなく、同じコンポーネントの `EventEmitter` の出力も届きません**。もう一度外して戻しても、204 行目の購読はまた古い配列で落ちます。

次は、このページ（本番ビルド）を開いて、5 節のデモの要素をページの外から操作した記録です。**これは記録です**（デモのボタンではこの操作をしません。コンソールにエラーが出るからです）。

📄 `scratchpad/el-b/verify/verify.mjs（抜粋。playwright-core で操作）`

```
// /chapter/elements-outputs/ を開き、5 節のデモの「要素を作ってつなぐ」を押したあと
await page.locator('el-outputs-emitter button:has-text("legacy.emit")').last().click();
const cycle = async () => {
  await page.evaluate(async () => {
    const el = document.querySelector('el-outputs-emitter')!;
    const parent = el.parentElement!;
    el.remove();
    await new Promise((res) => setTimeout(res, 50)); // DESTROY_DELAY（10 ms）より長く待つ
    parent.append(el);
  });
  await page.waitForTimeout(200);
  // いちばん新しいボタン（最後のもの）を押して、表に行が増えるかを見る
  await page.locator('el-outputs-emitter button:has-text("picked.emit(n)")').last().click();
  await page.locator('el-outputs-emitter button:has-text("legacy.emit")').last().click();
};
await cycle(); // 1 回目に戻す
await cycle(); // 2 回目に戻す
await cycle(); // 3 回目に戻す
```

📄 `結果（HeadlessChrome/155.0.8043.0、2026-11-06）`

```
本番ビルド（このページ）
つないだ直後に legacy を押す → 表に 1 行（legacy {"n":1}）
1 回目に戻す → 中のボタン 3 つ（壊れたコンポーネントのもの）。押しても 0 行
              console.error: ERROR …: NG0953（at OutputEmitterRef.subscribe ← @angular/elements の chunk の _subscribe）
2 回目に戻す → 中のボタン 6 つ（コンポーネントが作り直された）。新しいボタンを押しても 0 行
              console.error: NG0953 がもう 1 回
3 回目に戻す → 中のボタン 6 つ（作り直されない）。押しても 0 行
              console.error: NG0953 がもう 1 回

開発ビルドでは同じところで
  ERROR RuntimeError: NG0953: Unexpected subscription to destroyed `OutputRef`.
  The owning directive/component is destroyed.
が出る
```

- 壊れたあとに戻すたびに、NG0953 がコンソールに 1 回出ます。2 回目に戻したときにコンポーネントは作り直されます（ボタンが 6 つになる。古い 3 つが残る理由は [第 7 回](elements/07-elements-disconnect.md)）が、新しいボタンを押しても表には何も出ません。
- `EventEmitter` だけのコンポーネントなら、壊れたあとも `subscribe` は例外を投げないので、この形では落ちません。`output()` を 1 つでも持つと起きます。
- 直すなら `component-factory-strategy.ts` の `disconnect` の中の、壊す予定の関数（[第 7 回](elements/07-elements-disconnect.md)の 1 節）で、壊したあとに `eventEmitters` を空の配列にする（`this.eventEmitters.next([])`）形が考えられます。spec は `component-factory-strategy_spec.ts` の describe `disconnect` に、`output()` を持つコンポーネントで「壊したあとに `connect` し直して `events` を購読し、出力が流れる」it を足す形です（私はまだ書いても走らせてもいません）。
- 2026-11-06 に `gh` で「NG0953」「OutputRef destroyed」「elements reattach」などを探しましたが、elements でこれを書いた issue は見つかりませんでした。近いのは、戻したときにコンポーネントが作り直されない [#38778](https://github.com/angular/angular/issues/38778)（開いている。[第 7 回](elements/07-elements-disconnect.md)）です。一覧は [第 8 回](elements/08-elements-tests-issues.md)にあります。

### [spec と issue を読む：Angular Elements の今](elements/08-elements-tests-issues.md) — このシリーズで見つけたもの

第 1〜7 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも本物の @angular/elements 22.1.6 をこのサイトの本番ビルドの上で動かして再現し、上の 3 つは私がソースの行（8576f161ae4）をもう一度読んで確かめました。本家の spec の形では走らせていません（../angular を変更しないため）。gh で探した範囲では、#38778 のほかに同じ報告は見つかりませんでした。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| output() を持つコンポーネントの要素を、外して 10 ms 以上待ってから戻すと、それからあとは出力のイベントが二度と届かない。events の ReplaySubject(1) が壊れたコンポーネントの出力の配列を覚えたままで、戻したときの購読でその配列が渡り、壊れた OutputEmitterRef の subscribe が NG0953 を投げて、要素の購読が error で閉じる。あとで作り直したコンポーネントの出力（EventEmitter も）も届かない | elements/src/component-factory-strategy.ts 71・74 行目と initializeOutputs（229-241 行目）、core/src/authoring/output/output\_emitter\_ref.ts 52-58 行目 | 本番ビルドと開発ビルドで、外して 50 ms 待って戻すのを 3 回（戻すたびに NG0953、新しいボタンを押しても 0 件）。第 6 回に記録として載せた | [第 6 回](elements/06-elements-outputs.md) |
| （既存の issue）壊れたあとに同じ要素をつなぎ直すと、コンポーネントが作られない。壊す予定の関数が scheduledDestroyFn を null に戻さないので、次の connect が取り消しの道に入って return する。待ってから戻すと、作り直される回とされない回が 1 回おきになる。2020 年から開いている #38778。直す PR の #38816・#58586 はどちらも merge されずに閉じている | elements/src/component-factory-strategy.ts 120-123 行目と 146-151 行目 | 第 7 回のデモ（外す → 50 ms 待って戻す、を繰り返す） | [第 7 回](elements/07-elements-disconnect.md)・[第 4 回](elements/04-elements-connect.md) |
| config.injector に NodeInjector（コンポーネントの constructor で受けた Injector。公式のガイドの例の形）を渡すと、standalone のコンポーネントの imports にある NgModule の provider が見えない。`this.injector as EnvironmentInjector` は型を言い張るだけで、core は本物の EnvironmentInjector のときしか standalone の注入器を作らない。df9eed4ff1d で ComponentFactoryResolver を使わない形にしてから | elements/src/component-factory-strategy.ts 207 行目 | Node の JIT の記録（EnvironmentInjector と `Injector.create({parent: NodeInjector})` では見え、NodeInjector では null）。21 系以前で見えていたかは確かめていない | [第 4 回](elements/04-elements-connect.md) |
| （このサイトで目立つ形）ハイドレーションを使うアプリでは、ホストの中身が残る（PRESERVE\_HOST\_CONTENT）ので、作り直したときに古い DOM の後ろに新しい DOM が足される。どの ng-content にも合わない子は、要素の先頭に残る。ハイドレーションの無いアプリでは消える | elements/src/component-factory-strategy.ts の initializeComponent（hostElement を渡す） | 第 4 回・第 7 回のデモと、ハイドレーションの無いアプリの記録 | [第 4 回](elements/04-elements-connect.md)・[第 7 回](elements/07-elements-disconnect.md) |
| （仕様の言い方）ngOnChanges の firstChange が、入力ごとではなくインスタンスごとに決まる。spec の xit のコメントが「ngOnChanges の実装のバグ」と書いている | elements/test/component-factory-strategy\_spec.ts 163 行目（xit） | spec を読む。第 5 回のデモ | [第 5 回](elements/05-elements-inputs-cd.md) |
| （spec）extract-projectable-nodes\_spec の it の名前が動きと合わない。83 行目は「コメントは無視する」とあるのに期待ではコメントが `*` に入り、99 行目は「`*` を優先する」とあるのに期待は逆で、名前に typo もある。5 つの xit（163・254・272・284・347 行目）はどれも 0cebfd7462c で xit になったまま | elements/test/extract-projectable-nodes\_spec.ts 83・99 行目、component-factory-strategy\_spec.ts | spec を読む | [第 4 回](elements/04-elements-connect.md)・[第 8 回](elements/08-elements-tests-issues.md) |
| （文書）reflectComponentType の JSDoc の例で、propName と templateName が逆になっている | core/src/render3/component.ts 188-189 行目 | コードと見比べる | [第 3 回](elements/03-elements-attributes-inputs.md) |

読み方の目安: 上の 3 つは、要素を外して戻す・注入器を渡す、というよくある使い方で出るので、影響がいちばん大きいものです。とくに 1 つ目と 2 つ目は、同じ「外して戻す」の道の別の欄（eventEmitters と scheduledDestroyFn）なので、issue を読むときは一緒に見ると分かりやすくなります。

## HttpClient の細部と issue

### [spec と issue を読む：packages/common/http の今](httpx/06-httpx-tests-issues.md) — 7. このシリーズで見つけたもの

各章で、ソースの行と、自分で動かした記録で確かめたものです。「既存」は `gh` で探して見つかった issue・PR です（2026-11-06）。本家に PR や issue を出すことは勧めません。

| 章 | 何が起きるか | 確かめた行と記録 | 既存 |
| --- | --- | --- | --- |
| [第 5 回](httpx/05-httpx-transfer-cache-key.md) | （不具合）`responseType: 'blob'` の応答を SSR で転送キャッシュに入れると、本文が空で書かれ、ブラウザでは 0 バイトの `Blob` が返る | transfer\_cache.ts 329 行目が `Blob` を `toBase64` に渡し、436 行目の `new Uint8Array(Blob)` が長さ 0。esbuild で束ねたソースで、5 バイトの `Blob` → 書いた本文 `''` → `Blob 0 バイト`。spec の 520 行目の it はキャッシュからの応答を見ていない | 1f057afaac8 で直して 7eb33713b90 で戻された。開いている issue は見つからなかった |
| [第 5 回](httpx/05-httpx-transfer-cache-key.md) | （不具合・開発モードだけ）`includeHeaders: ['ETag']` で運んだヘッダーを `get('etag')` で読むと、値は返るのに NG02802 の警告が出る | transfer\_cache.ts 521 行目の `includes(headerName)` が大文字・小文字を区別する。記録で `get('ETag')` は警告なし、`get('etag')` は警告あり。Proxy の spec は 0 件 | 見つからなかった |
| [第 5 回](httpx/05-httpx-transfer-cache-key.md) | 2 進の本文（`ArrayBuffer`）・`Blob`・`FormData`・本文なしが、全部同じキーになる | transfer\_cache.ts 420・421 行目。記録で 7 つが同じキー。ライブの DEMO（22.2.6）で、B が A の応答をキャッシュから受け取る | #70226（開）、PR #70227（開） |
| [第 5 回](httpx/05-httpx-transfer-cache-key.md) | キャッシュから作った応答で、`url` がリクエストの URL になり、`redirected` が消える | transfer\_cache.ts 333・274 行目。記録で `redirected: true` → `undefined` | #70947（開）、PR #70946（開） |
| [第 5 回](httpx/05-httpx-transfer-cache-key.md) | （コメント）595 行目「64-bit keyspace」は、消えた DJB2 の実物（32 ビット）と合わない。response.ts 206・207 行目「既定の XHR では `undefined`」は、Fetch が既定の今と合わない | `git show 5f36274da3f` の消えた行（`<< 0` と 2 の 31 乗）、1f9a42bb424 | — |
| [第 4 回](httpx/04-httpx-resource-types.md) | （型）`httpResource.text`・`blob`・`arrayBuffer` で、引数に型を書かない `parse` と `defaultValue` を一緒に書くと、TResult が既定の型のまま決まって型のエラーになり、文は「`string` を `HttpResourceRequest` に入れられない」という原因と関係の無いものになる | resource.ts 186〜206 行目の並びと `<TResult = string>`。TypeScript 6.0.3 の記録の i・n1・n6（n2・n3・n7・n8 は通る）。describe `types` は `parse: () => 0` だけ | 見つからなかった。TypeScript の推論の振る舞いから来るもので、不具合かどうかは判断していない |
| [第 4 回](httpx/04-httpx-resource-types.md) | （spec の穴）`parse` が投げたときと、`httpResource.blob` の it が無い | resource\_spec.ts の it の一覧（22 件）。振る舞いはライブの DEMO で確かめた（resource.ts 404〜407 行目） | — |
| [第 1 回](httpx/01-httpx-request-options.md) | `post`・`put`・`patch` の options に `body` があると、第 2 引数の本文ではなく options の `body` が送られる（`body: undefined` なら本文は null）。型の検査は通る。v22.1.0 の c092a002e40（#69241 の修正）から | client.ts 43〜48 行目の `addBody` が `{ body, ...options }` の順に書く。495 行目が `options.body` を使う。22.1.6 と HttpTestingController で再現 | 見つからなかった |
| [第 2 回](httpx/02-httpx-headers-params-updates.md) | `HttpHeaders.set(name, [])` が前の値を消さない（`getAll` は前の値のまま）。コンストラクタに空の配列を渡したときとも扱いが違う | headers.ts 217〜219 行目（空の配列は `'s'` でも return）。set の doc コメントは「置き換える」。spec は無い | 見つからなかった |
| [第 3 回](httpx/03-httpx-overload-types.md) | （型）`HttpClientCommonOptions` の変数や `observe: flag ? 'events' : 'body'` を `head`・`post` などに渡すと `Observable<Object>` として通り、実行時は HttpEvent の列が届く。`get`・`delete` では型のエラーになる | v22.0.0 の 6413e703fa1 で、head・options・patch・post・put の最後のオーバーロードが `options?: HttpClientCommonOptions` だけになった（client.ts 1418・1430・2338・2351 行目）。get と delete は 1137〜1143 行目で形を残す | 見つからなかった |

## SSR の守りと細部

### [spec と issue を読む：platform-server と @angular/ssr の今](ssrx/10-ssrx-tests-issues.md) — このシリーズで見つけたもの

第 1〜9 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。どれも Node で本物のコード（配布物か、../angular・../angular-cli のソースを束ねたもの）を動かして再現し、ソースの行（angular 8576f161ae4、angular-cli 44129f66a3）と照らして確かめました。どれも守りの迂回ではありません。gh で探した範囲では、同じ報告は見つかりませんでした。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| renderApplication に `url` を渡さないと、サーバーの `location.origin` が `undefined://` になり、`replaceState('/next?x=1')` のあとの `PlatformLocation.href` が `undefined:///next?x=1` になる（pathname は正しい） | parseDocument の既定の url と、同梱の domino の origin の getter | renderApplication の記録（url 無しの場面） | [第 2 回](ssrx/02-ssrx-location-allowed-hosts.md) |
| `provideServerRendering({ maxResponseBodySize: 0 })` を渡しても、上限は既定の 1 MB のまま | platform-server の provide\_server.ts 39 行目（値が真のときだけ provide する） | 注入器のトークンの値の記録 | [第 3 回](ssrx/03-ssrx-server-http.md) |
| パスに不正なパーセントの並び（`/%E0%A4%A` など）があると、ルートの照合で URIError が投げられ、404 ではなく例外で終わる | @angular/ssr の routes/route-tree.ts 210 行目（`map(decodeURIComponent)`、ServerRouter.match に catch が無い） | ServerRouter.match の記録 | [第 6 回](ssrx/06-ssrx-redirects.md) |
| `user@example.com` や空白を含む Host は、Node の経路では検査の前の `new URL` / `new Request` で TypeError になり、400 ではなく例外で終わる | node/src/request.ts の URL の組み立て（validateRequest より前） | 本物の IncomingMessage を通した記録 | [第 4 回](ssrx/04-ssrx-host-validation.md)・[第 8 回](ssrx/08-ssrx-node-streams.md) |
| allowedHosts の側は小文字にされないので、`Example.COM` と書くとどの Host とも一致しない（いつも弾く側に倒れる） | utils/validation.ts の isHostAllowed | validateRequest の記録 | [第 4 回](ssrx/04-ssrx-host-validation.md) |
| リダイレクトの Vary は大文字と小文字を区別して重複を除くので、`x-forwarded-prefix` を渡すと同じ名前が 2 つ並ぶ。本番では状態コードを調べないので、200 でも Location 付きの応答が作られる | utils/redirect.ts の createRedirectResponse | createRedirectResponse の記録 | [第 6 回](ssrx/06-ssrx-redirects.md) |
| getPreferredLocale の JSDoc の例が実物と違う。`en;q=0.9,fr-FR;q=0.8` の答えは実物では fr-FR（完全一致が q 値より先）、一致が無いときは undefined ではなく先頭のロケール。例をそのまま it にすると落ちる | i18n.ts 114〜118 行目 | getPreferredLocale の記録と、複製で足した it | [第 7 回](ssrx/07-ssrx-i18n-locale.md) |
| basePath が `/base` のとき、`/base/` はロケールへリダイレクトされず null になる（末尾のスラッシュを落とした basePath と pathname を文字列のまま比べる）。spec のマニフェストはどれも basePath が `/` | app-engine.ts のロケールの入口を選ぶ行 | AngularAppEngine の記録 | [第 7 回](ssrx/07-ssrx-i18n-locale.md) |
| 変換の前に req の本文を読み切っていると、そのあと客が切断しても Web の Request の signal が中断されない（'close' が先に来て 'aborted' の聞き手が外れる） | node/src/request.ts の createWebRequestFromNodeRequest | 127.0.0.1 に立てた http サーバーの記録 | [第 8 回](ssrx/08-ssrx-node-streams.md) |
| CommonEngine は環境変数 NG\_ALLOWED\_HOSTS を options より先に使う。AngularNodeAppEngine は 5875b6024f で options が先になったが、こちらは変わっていない | node/src/common-engine/common-engine.ts 85 行目 | CommonEngine の記録 | [第 9 回](ssrx/09-ssrx-assets-css.md) |
| （テスト）platform-server の utils\_spec.ts 83〜93 行目の it は、投げなければ expect が 1 つも走らない。@angular/ssr の app\_spec.ts 464 行目の it は、6a3446770a の cancel を消しても通る。bb72145f9a は spec を足しておらず、CommonEngine の spec は無い | 各 spec の行 | spec の行を読む。app\_spec は複製で行を戻して走らせた | [第 2 回](ssrx/02-ssrx-location-allowed-hosts.md)・[第 8 回](ssrx/08-ssrx-node-streams.md)・[第 9 回](ssrx/09-ssrx-assets-css.md) |
| （文書）コミットの本文と差分が違う。140c4d04cb3 は「エンコードする」と書くが差分は `/` に置き換える。2acca1165d7 は「既定 10 MB」と書くがコードは 1 MB。hooks.ts 47 行目の「mutated」は 73 行目の写しと合わない | 各コミットと hooks.ts | git show と、ソースの行 | [第 3 回](ssrx/03-ssrx-server-http.md)・[第 9 回](ssrx/09-ssrx-assets-css.md) |

読み方の目安: 上の 4 つは、利用者の目に見える振る舞い（壊れた URL、効かない設定、500 になる応答）なので、影響がいちばん大きいものです。守りのコードは、どれも最後は「弾く側」に倒れていました。issue を探すときは、題の言葉より、表の「どこ」のファイル名や関数名で gh を検索すると見つけやすくなります。

## Navigation API と FakeNavigation

### [spec と issue を読む：Navigation API の連携の今](navx/07-navx-tests-issues.md) — このシリーズで見つけたもの

第 1〜6 回を書く途中で、本家の不具合らしきものと、テストや文書の小さな食い違いが見つかりました。どれも **issue も PR も出していません**。上の 3 つは、手元の作業木（8576f161ae4）で spec を足すと落ち、直すと通ることを確かめました。ソースの行は ../angular と新しい本家（74961c66242）の両方で確かめています。

| 何が起きるか | どこ | 今の状況 | 章 |
| --- | --- | --- | --- |
| FakeNavigation の hashchange の `oldURL` と `newURL` が入れ替わっている | fake\_navigation.ts 547 行目が `createHashChangeEvent(oldUrl, …)` と呼ぶが、1189 行目の関数の引数は `(newURL, oldURL)` の順（新しい本家では 558 行目） | gh で探した範囲では報告も PR も無い。開いている PR #70705 の差分にもこの行は無い | [第 3 回](navx/03-navx-fake-traverse.md) |
| precommitHandler の途中で次の navigate に取って代わられた遷移が、あとから commit し、entries が `[/, /b, /a]` の順になる | fake\_navigation.ts 953 行目の commit() は `result.signal.aborted` を見るが、InternalNavigationResult の側を中断する行が無い | 開いている PR #70705 が、イベントの signal も見る変更を含む | [第 2 回](navx/02-navx-fake-navigate.md)・[第 4 回](navx/04-navx-precommit.md) |
| intercept せずに `preventDefault()` だけを呼ぶと、`navigate()` が TypeError を投げる。非同期の traverse では setTimeout の中の捕まえられない例外になる | fake\_navigation.ts 216 行目（null の navigateEvent を使う） | 開いている PR #70705 の範囲 | [第 2 回](navx/02-navx-fake-navigate.md) |
| 戻る先のガードがリダイレクトすると、`router.url` は `/redirected` なのに `currentEntry` は元の URL のまま（precommit が使えて、URL の更新が deferred のとき） | navigation\_state\_manager.ts 479〜481 行目 | 新しい本家の 3320da96da2（#71433）と、22.2 系の b8383a1987a で直っている | [第 5 回](navx/05-navx-router-integration.md) |
| （文書）FakeNavigationPlatformLocation の例外の文が、無い名前を挙げる。`provideFakeNavigation` は無く（実際は `provideFakePlatformNavigation`）、主語の `FakePlatformNavigation` も無い（クラスは `FakeNavigationPlatformLocation`） | common/testing/src/mock\_platform\_location.ts 292〜295 行目（新しい本家も同じ） | 報告は見つからない | [第 6 回](navx/06-navx-testing.md) |
| （文書）redirect の例外の文が `'push' or 'replace` で終わり、閉じる引用符が無い | fake\_navigation.ts 919 行目 | — | [第 4 回](navx/04-navx-precommit.md) |
| （テスト）it の名前は「replaces history entry by default」だが、中身は `{history: 'push'}` を渡し、780 行目でエントリが 1 つ増えることを確かめている | dom-navigation/testing/test/fake\_platform\_navigation.spec.ts 766 行目 | — | [第 4 回](navx/04-navx-precommit.md) |
| （テスト）「FakeNavigation の更新が必要」というコメントが残っているが、すぐ下の it は普通の it で、手元でも通る | router/test/with\_platform\_navigation.spec.ts 139 行目 | — | [第 6 回](navx/06-navx-testing.md) |
| （参考）handler が同期で throw すると、`navigate()` が例外を投げ、finished が決着しない。エントリの dispose のイベント名が `'disposed'` | fake\_navigation.ts | 新しい本家の a8233232f5a で直っている | [第 2 回](navx/02-navx-fake-navigate.md)・[第 3 回](navx/03-navx-fake-traverse.md) |

読み方の目安: 上の 3 つは FakeNavigation の中の食い違いです。テストの土台なので、利用者のアプリの動きではなく、**テストの結果**が本物のブラウザとずれます。PR #70705 のように、仕様に合わせる大きな変更が進んでいる場所なので、issue を探すときは PR の差分も一緒に読みます。

## パイプを書くと何を宣言したことになるか

### [spec と issue を読む：pipe の振る舞いを決めているテスト](pipe/06-pipe-tests-issues.md) — 書いている途中で見つかったもの

第 1〜5 回を書く途中で、本家の振る舞いの食い違いと、エラーの文の小さな問題が見つかりました。どれも **issue も PR も出していません**。どれもこのサイトの依存の @angular/\* 22.1.6 で再現し、手元の木（8576f161ae4）のソースの行と照らして確かめました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| pipe が ChangeDetectorRef をコンストラクタで受けると、pipe を書いた側のビューのものになる。`inject(ChangeDetectorRef)` で受けると、その pipe を子のコンポーネントの入力（`<child [v]="x \| p">`）に書いたとき、子のビューのものになる。ふつうの補間に書いたときは、どちらも書いた側のもの | compiler/src/render3/r3\_factory.ts 251 行目（ɵfac を作るときだけ ForPipe の印を足す）と、core/src/change\_detection/change\_detector\_ref.ts の injectChangeDetectorRef | 同じ pipe をコンストラクタと inject() の 2 通りで書き、3 つの場所で描いた記録（結果は ctor:Root・inject:Child・inject:Root）。2023 年から開いている #50952 と同じ症状（#59868 はその重複として閉じられている） | [第 2 回](pipe/02-pipe-class-def.md)・[第 5 回](pipe/05-pipe-instances-lifecycle.md) |
| ホストのプロパティのバインディングに pipe を書いたときのエラーの文で、`pipes` と `[` がくっつく（「…cannot contain pipes\[name \| up\] in …」） | expression\_parser/parser.ts 160 行目の文を、1899〜1903 行目の getParseError が場所の文なしで組み立てる（場所の文が空のときは空白が入らない） | このページの上の @angular/compiler と、ngtsc にかけた記録 | [第 4 回](pipe/04-pipe-where-allowed.md) |
| （エラーになるのは意図どおり）補間の中の矢印関数の本体に pipe を書くと（`items.map(i => (i \| p))`）、文は「Cannot have a pipe in an action expression」と言う。ngc では NG5002 が 2 件、名前が空の pipe の NG8004、TS2339 の計 4 件が続けて出る | 矢印関数の本体を ParseFlags.Action で読む行。エラーになること自体は parser\_spec.ts 1107 行目の it が固めている | ngtsc にかけた記録 | [第 4 回](pipe/04-pipe-where-allowed.md) |
| （今は影響なし）@for の track に pipe を書くと、以前はテンプレートパイプラインの「Illegal State」まで進んで落ちていた。62cda789a8c（2025-10、#64316 を直したもの）で前の段のエラーになったが、throw の行は残っている | template/pipeline/src/phases/track\_fn\_optimization.ts 63 行目 | git show と、track に pipe を書いた記録 | [第 4 回](pipe/04-pipe-where-allowed.md) |

読み方の目安: いちばん上の ChangeDetectorRef の件は、同じ pipe でも受け取り方で `markForCheck()` の効く範囲が変わるので、影響がいちばん大きいものです。issue を探すときは、題の言葉より、表の「どこ」の関数名（`injectChangeDetectorRef`・`ForPipe` など）で gh を検索すると見つけやすくなります。

## クエリ（viewChild・contentChildren）の内側

### [spec と issue を読む：クエリの振る舞いを決めているテスト](qry/07-qry-tests-issues.md) — 書いている途中で見つかったもの

第 1〜6 回を書く途中で、AOT と JIT の小さな食い違いと、テストやコメントの古くなった所が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で、angular-main の件はその木（74961c66242）で確かめました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| 単数のクエリ（`@ViewChild`・`@ContentChild`）のフラグが、AOT では 5（descendants と emitDistinctChangesOnly）、JIT では 1 になる。単数のクエリは QueryList を見せないので、結果の値は変わらない | core/src/metadata/di.ts の ViewChild の既定に emitDistinctChangesOnly が無く、core/src/render3/jit/directive.ts 448 行目の `!!ann.emitDistinctChangesOnly` が false になる。ngtsc は shared.ts 535 行目で既定の true を入れる | `@ViewChild('a')` を ngtsc と JIT の両方でコンパイルした記録（AOT は `ɵɵviewQuery(_c0, 5)`、JIT は 1） | [第 2 回](qry/02-qry-compile.md) |
| angular-main で、`read: Injector` を確かめる decorator の側の it が 2 つ消えた。機能の行は残っていて、確かめる it は signal の側の 1 つだけになった | core/test/acceptance/query\_spec.ts。8576f161ae4 では 1780・1800 行目にある it が、ecbc89b465c（2026-10 の「modernize unit tests」）で無くなっている | `git -C angular-main show ecbc89b465c -- packages/core/test/acceptance/query_spec.ts` の削除の行と、両方の木で `read: Injector` を数えた結果（2 と 0） | [第 3 回](qry/03-qry-tquery-match.md)・[第 7 回](qry/07-qry-tests-issues.md) |
| （これを固める it が無い振る舞い）別の ViewContainerRef に入れたビューどうしの結果は、入れた先の位置ではなく入れた時刻の順に並ぶ。先頭に入れると DOM の順と逆になる | core/src/render3/queries/query.ts 452〜456 行目（MOVED\_VIEWS を順に読む） | 第 4 回のデモ（DOM が T2 T1 のとき、結果は T1 T2）。query\_spec.ts と query\_integration\_spec.ts にこの並びの it は無い | [第 4 回](qry/04-qry-lquery-results.md) |
| QueryFlags の定義の NOTE が、今はもう定義の無いファイルを指している | core/src/render3/interfaces/query.ts 27 行目（`packages/compiler/src/render3/view/compiler.ts` を指す。定義は query\_generation.ts にある） | grep | [第 2 回](qry/02-qry-compile.md) |
| compliance テストの道具で、クエリのフラグの名前が分からないときの文が `Unknown SelectorFlag` になっている（別の表から写した文言のまま） | compiler-cli/test/compliance/test\_helpers/expected\_file\_macros.ts 205 行目 | grep | [第 2 回](qry/02-qry-compile.md) |

## ng-content と投影の内側

### [spec と issue を読む：投影の振る舞いを決めているテスト](proj/06-proj-tests-issues.md) — 書いている途中で見つかったもの

第 1〜5 回を書く途中で、実行時に落ちる書き方と、DOM の付け外しの食い違いと、古くなったコメントが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめ、再現はこのサイトの依存の @angular/\* 22.1.6 で行いました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `<div ngProjectAs="">` のように値を空にすると、中の側に `*` 以外の枠が 1 つでもあるとき、最初の描画で `TypeError: Cannot read properties of undefined (reading 'length')` になる。コンパイルの診断は出ない | compiler の const\_collection.ts 247 行目で `parseSelectorToR3Selector('')[0]` が undefined になり定数に入る。core の projection.ts 61 行目は `=== null` だけを見るので、node\_selector\_matcher.ts 347 行目の `selector.length` まで進む | 第 3 回のデモ（「ngProjectAs="" を試す」）と、ngtsc にかけた記録（定数が `["ngProjectAs","",5,undefined]`）。angular-main でも同じコード | [第 3 回](proj/03-proj-distribute.md) |
| `@for` の直下に `<ng-content />` を書き、中身の無い先頭の行を消すと、最後の行に描かれていた投影の中身が document から外れ、どの行にも戻らない。ng-content を要素で包むと起きない | 行のビューを外すときに node\_manipulation.ts 854〜862 行目から applyProjectionRecursive に入り、投影されたノードを今どこにあっても外す | 第 5 回のデモ 2（「@for の直下」で描いてから先頭の行を消す）。この形を固める it は content\_spec.ts に無い | [第 4 回](proj/04-proj-render.md)・[第 5 回](proj/05-proj-dynamic.md) |
| 再投影のとき、外の ng-content に既定の内容が無く外に何も渡されていないと、内の ng-content の既定の内容も出ない（何も表示されない） | projection.ts 197 行目。内から見た枠の先頭は外の ng-content の TNode なので、空と判定されない | 第 4 回のデモのケース 1。content\_spec.ts 2213 行目の it は外に既定の内容がある形だけ | [第 4 回](proj/04-proj-render.md) |
| （仕様の可能性あり）ngProjectAs は select と配列の完全一致で比べるので、`ngProjectAs="div[header]"` は `select="[header]"` に入らない。また、ちょうど `h2` とだけ書いたテキストが `select="h2"` の枠に入る | node\_selector\_matcher.ts 347〜354 行目（完全一致）と、テキストの TNode の value がタグ名の照合に使われること（84 行目の説明は「型も見る」） | 第 3 回のデモ | [第 3 回](proj/03-proj-distribute.md) |
| projection.ts のコメント 2 か所が古い形を説明している（テキストのセレクタの引数、枠の番号の数え方） | projection.ts 77〜87 行目（def73a6728e で引数は無くなった）と 138〜140 行目（aca339e8642 より前の数え方） | git show | [第 1 回](proj/01-proj-what-declared.md) |

## resource の細部と新しい部品

### [spec と issue を読む：resource の振る舞いを決めているテスト](resx/06-resx-tests-issues.md) — 書いている途中で見つかったもの

第 1〜5 回を書く途中で、状態の食い違い、SSR のキャッシュの抜け、修正を固めきれていない spec が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめ、再現はこのサイトの依存の @angular/core 22.1.6 で行いました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| params が Error を投げて error になったあと、params が `undefined` を返すと、status() は idle になるのに error() は前のエラーのままで、value()・hasValue()・snapshot() が ResourceValueError を投げる。`@if (hasValue())` で守ったテンプレートも投げる。IDLE や LOADING を投げた場合は起きない | resource.ts 306〜308 行目。要求の無い状態どうしが `undefined === undefined` で同じ要求と見なされ、エラーの stream が引き継がれる。angular-main でも同じ | 第 1 回のデモと Node の記録の \[4\] | [第 1 回](resx/01-resx-params-status.md) |
| params のエラーのあとで reload() すると、エラーが消えて idle になる（開いている #71585 と同じ。根は上と同じ行） | resource.ts 393 行目 | Node の記録の \[2\] | [第 1 回](resx/01-resx-params-status.md) |
| params の中で resource を作ったときの NG0992 が、入れ子になると出ない。内側の params を計算したあとで印が false に戻り、外側では NG0602 が error() にしまわれる | resource.ts 263 行目（前の値を覚えずに false にする）、debounce.ts 77・109 行目も同じ形 | Node の記録の \[5\] | [第 1 回](resx/01-resx-params-status.md) |
| debounced() は元の signal が投げた値を包まないので、文字列を投げると error() が文字列を返し、value() のメッセージの末尾が "undefined" になる | debounce.ts 75・104 行目 | 第 2 回のデモ | [第 2 回](resx/02-resx-debounced.md)・[第 3 回](resx/03-resx-errors.md) |
| stream の resource は、最初に解決した 1 つ目の値しか TransferState に書かない。サーバーの HTML は 2 つ目の値、ng-state は 1 つ目の値になり、ブラウザは 1 つ目の値を出す | resource.ts 476・494 行目（loadEffect が resolved にした直後の 1 回だけ saveToTransferState を呼ぶ） | 第 4 回の Node の記録（stream が 2 回値を出す場面） | [第 4 回](resx/04-resx-ssr-cache.md) |
| 修正の行を消しても通る spec がある。63886758787 の httpResource の it は購読の途中の abort を通らず、rxResource の PendingTask の it 3 つは resolveOnce を消しても通る。CACHE\_ACTIVE の isActive を固める it は無い | common/http/src/resource.ts の `if (aborted)` の 3 行、rx\_resource.ts の onAbort の 2 行、resource.ts 289 行目 | 作業木で行を消して bazel で走らせた結果（すべて通過） | [第 5 回](resx/05-resx-cleanup-leaks.md)・[第 4 回](resx/04-resx-ssr-cache.md) |
| angular-main で、debounce\_spec.ts の timer cleanup の it 4 つが消えた（ecbc89b465c の「modernize unit tests」）。debounce.ts の修正そのものは残っている。手元の木で修正を戻すと、そのうち 3 つが落ちる | core/test/resource/debounce\_spec.ts（0904f90b13a が足した `describe('timer cleanup')`） | `git -C angular-main show ecbc89b465c` と、作業木で修正を戻して走らせた結果（17 件中 3 件が失敗） | [第 2 回](resx/02-resx-debounced.md) |
| （細かいもの）resource.ts 290 行目の `const key` が使われていない。api.ts 241 行目の説明に「value value」の重複 | resource.ts 290 行目、api.ts 241 行目 | grep | [第 4 回](resx/04-resx-ssr-cache.md) |

読み込み中に params が undefined などになると前の読み込みが abort されない件（#71765）は、origin/main の efbab16e567（2026-11-10）で直っています。手元の木と 22.1.6・22.2.6 には入っていません。詳しくは[第 5 回](resx/05-resx-cleanup-leaks.md)にあります。

## hostDirectives と継承（features）

### [spec と issue を読む：hostDirectives と継承を固めているテスト](hdi/06-hdi-tests-issues.md) — このシリーズで見つけたもの

第 1〜5 回を書いている途中で、本番ビルドだけで落ちる組み合わせや、def に残る書き込みが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、このサイトの依存の @angular/core 22.1.6 と、手元の作業木の spec を使いました。gh で検索した範囲では、同じ件を扱った issue は見つかっていません。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| クラス式（mixin）で `ngOnChanges` を足したコンポーネントだけを使うアプリが、本番ビルドで `TypeError` になる。`registerPreOrderHooks` は prototype の `ngOnChanges` を見て実装を取り出そうとする。その実装を変数に入れる処理は `ɵɵNgOnChangesFeature` の即時実行（`/* @__PURE__ */`）の中にしかないので、どの def もその feature を参照しないと tree shaking で消える。4744bab38ef（v22.1.0）から。angular-main も同じ | ng\_onchanges\_feature.ts 17・42・53〜55 行目、hooks.ts 64 行目 | 22.1.6 の小さな CLI のワークスペースを本番ビルドした記録（`--optimization=false` では動く。`ngOnChanges` を自分で持つコンポーネントを 1 つ足しても動く） | [第 1 回](hdi/01-hdi-features-pipeline.md) |
| （記録）汚された prototype への対策 e6953793542 は、説明にない変化も起こしていた。前の形では、飾りのない中間のクラスを通ると同じ親の def が 2 回混ざり、hostVars が 2 倍になり、host バインディングも 2 回呼ばれていた。22.0.x では #69092 で差し戻されている | inherit\_definition\_feature.ts（e6953793542 の差分） | 作業木で前の形に戻して spec を走らせた結果（5 件が失敗） | [第 2 回](hdi/02-hdi-inherit-runtime.md) |
| 重複の解消で入出力の対応を合わせた結果が、def に残る。合わせる先が、def の `hostDirectives` に貼られた HostDirectiveDef そのものなので、あとで作るほかのコンポーネントにも効く。`[Plain, AsValue]` のあとで `[Plain, AsOther]` を作ると、開発モードでは NG0312 になる。本番では投げないが `other` が露出されず、`[Plain]` だけのコンポーネントにも `value` が露出される。コンパイラの側（t2\_binder.ts 821〜825 行目）は新しいオブジェクトを作るので起きない | host\_directives\_feature.ts 171〜173 行目（def をそのまま登録）、189 行目（書き込み） | 第 4 回のデモと、22.1.6 の JIT の Node の記録、作業木に足した it | [第 4 回](hdi/04-hdi-host-dedupe.md) |
| 重複の解消で 1 つにまとめられた host directive には、後ろのディレクティブに付けた `inputBinding` / `outputBinding` が届かない。`directives: [DirA, {type: DirB, bindings: [inputBinding('value', …)]}]` で、両方が Shared を host directive に持つと、開発モードでは NG0315、本番では黙って届かない。DirB → DirA の順なら届く | instructions/shared.ts 810 行目、view/directive\_outputs.ts 79 行目（host directive の範囲を連続した区間で判定する） | 第 5 回のデモと Node の記録、作業木に足した it | [第 5 回](hdi/05-hdi-host-providers-bindings.md) |
| TestBed.overrideComponent で AOT 済みのコンポーネントの providers / viewProviders を差し替えると、差し替えた値も元の値も注入されず `null` になる。v22.0 から（4ad3a1fe379）。既存の章 [standalone-testbed-override](standalone/12-standalone-testbed-override.md) にも注を足した | testing/src/test\_bed\_compiler.ts 539〜559 行目（resolver が配列を返すだけで、providers を登録する処理を呼ばない） | 22.1.6 の Node の記録。作業木で test\_bed\_spec.ts に it を足すと「Expected null to be 'override'」で落ちる | [第 5 回](hdi/05-hdi-host-providers-bindings.md) |
| （細かいもの）1 つの別名を host directive の 2 つの入力に当てる形（#48925）は、コンパイラが診断なしで通し、実行時の開発モードでは「本来ここには来ない」とコメントのある assert に当たる。基本モードの型チェックでは `@if` の中の衝突に NG8024 が出ない。host\_directives\_spec.ts 1142 行目の it は、名前が viewProviders なのに中身は providers を試している | host\_directives\_feature.ts 255〜265 行目、host\_directives\_spec.ts 1142 行目 | Node の記録、grep | [第 4 回](hdi/04-hdi-host-dedupe.md)・[第 5 回](hdi/05-hdi-host-providers-bindings.md) |

## ErrorHandler とエラーの行き先

### [spec と issue を読む：エラーの行き先を固めているテスト](err/06-err-tests-issues.md) — このシリーズで見つけたもの

第 1〜5 回を書いている途中で、エラーのあとで止まったままになる処理や、何も確かめていない spec が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、このサイトの依存の @angular/core 22.1.6 と、Node で動かした 22.2.6 を使いました。gh で検索した範囲では、同じ件を扱った issue は見つかっていません。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| root の effect が 1 つ投げると、同じ回に待っていた後ろの effect が汚れたまま止まる。旗は先に消されているので、次の tick でも `appRef.tick()` を呼んでも走らず、別の root の effect が汚れて初めて走る。ErrorHandler には 1 回しか届かない。angular-main も同じ | application\_ref.ts 619〜621 行目（旗を消してから flush）、root\_effect\_scheduler.ts 132〜133 行目（「TODO: what happens if this throws an error?」） | 第 2 回のデモの「root の effect」の行と、22.1.6・22.2.6 の Node の記録 | [第 2 回](err/02-err-where-caught.md) |
| error\_handler\_spec.ts の 2 つの it が中身を一度も走らせていない。`() => () => {…}` の形で、jasmine は返った関数を捨てる（b84859073bf から）。別の 2 つの it は、取り消せない `new Event('error')` の `dispatchEvent` の戻り値でハンドラが呼ばれなかったことを確かめているが、呼ばれても true が返る | core/test/error\_handler\_spec.ts 46・71 行目、123・137 行目 | 同じ形の小さな spec が「2 specs, 0 failures」で通ること、Chrome で戻り値を測った結果 | [第 3 回](err/03-err-global-listeners.md) |
| `@error (let value)` の別名が、@error の中ではなく境界を書いたビューに足される。ホストのコンポーネントに同じ名前のプロパティがあると、ホストのテンプレートの `value` が境界のエラーを読み、本体の中では別のビューの枠を読んで 2 回目の更新で TypeError を投げ、境界が @error に切り替わる。型チェックは別名を @error の中にしか置かないので診断は出ない | compiler の template/pipeline/src/phases/generate\_variables.ts 244〜257 行目 | 22.2.6 の AOT と JIT の Node の記録 | [第 5 回](err/05-err-boundary-compile.md) |
| `@error (let e = $index)` のような誤った書き方が、パーサの NG5002 ではなく、スタック付きの TS500 になる。パーサはエラーを積むが変数も残すので、型チェックの中で例外になる。`@for` の `let i = $foo` も同じ形 | compiler の render3/r3\_boundaries.ts 73〜79 行目と、型チェックの scope.ts の境界の分岐 | 22.2.6 の compiler-cli で 16 の書き方をコンパイルした記録 | [第 5 回](err/05-err-boundary-compile.md) |
| 境界の中のビューを作るときに投げられたエラーは、包まずに覚えられる。子の constructor が文字列を投げると @error の `$error` は文字列のまま（更新のときは包まれ、型チェックは Error として扱う）。このときの details は declarationType がホストになり、caughtBy が無い | core の render3/instructions/boundary.ts 159 行目と 164〜173 行目 | 22.2.6 の Node の記録 | [第 4 回](err/04-err-boundary-runtime.md) |
| （細かいもの）全体のリスナーの `if (e.error)` は、`throw 0` のような偽の値も「error を持たない ErrorEvent」として包む | error\_handler.ts 204 行目 | 第 3 回のデモ | [第 3 回](err/03-err-global-listeners.md) |

## 動的コンポーネント：createComponent と ViewContainerRef

### [spec と issue を読む：動的コンポーネントを固めているテスト](dyn/06-dyn-tests-issues.md) — このシリーズで見つけたもの

第 1〜5 回を書いている途中で、開発モードと本番で振る舞いが分かれる書き方や、古くなった説明が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、このサイトの依存の @angular/core 22.1.6 と、Node で動かした 22.2.6 を使いました。gh で検索した範囲では、同じ件を扱った issue は見つかっていません。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `twoWayBinding('formField', sig)` が、開発モードでは呼んだ時点で ``Unexpected `create` callback in inputBinding`` の ASSERTION ERROR になる。名前が formField の inputBinding だけが create を持つため。本番では作れるが、二方向の binding は出力の create だけを使うので、入力の create（controlCreateInternal）は呼ばれない | core の render3/dynamic\_bindings.ts 134〜147 行目（formField の分岐）、229 行目（assertNotDefined）、241 行目（`create: output.create`） | 22.2.6 の Node の記録（開発と本番）。create\_component\_spec.ts の formField の it は inputBinding だけ | [第 4 回](dyn/04-dyn-bindings-ref.md) |
| `vcr.createComponent(C, {index: 5})` のように範囲の外の index を渡すと、コンポーネントを作ってから index を確かめるので、コンストラクタが走ったあとで投げる（開発は ASSERTION ERROR、本番は TypeError）。作られたものは ViewContainerRef にもアプリにも付かず、ホストやアプリを壊しても DestroyRef.onDestroy が呼ばれない。index の範囲の確かめは開発モードだけ | core の linker/view\_container\_ref.ts 524 行目（create）、536 行目（insertImpl）、664〜674 行目（\_adjustIndex）。createEmbeddedView も 413 行目で同じ順 | 22.2.6 の Node の記録（開発と本番） | [第 5 回](dyn/05-dyn-vcr-host.md) |
| reflectComponentType の JSDoc の例が、`@Input('inputName') inputPropName` に対して `{propName: 'inputName', templateName: 'inputPropName'}` と逆に書いている（isSignal も無い）。実物は propName が inputPropName を返し、spec も実物と同じ向き。angular-main でも同じ | core の render3/component.ts 188〜189 行目 | 例と同じクラスを 22.1.6 と 22.2.6 の JIT で作って呼んだ記録 | [第 1 回](dyn/01-dyn-entry-points.md) |
| ComponentFactory を公開 API から外したあとの残り: `ComponentFactory.isBoundToModule` は書くだけで読む行が無い。`TestBedCompiler._getComponentFactories` を呼ぶ行が無い。view\_container\_ref.ts の `ngModule == null` の判定とそのコメントは ComponentFactory を渡せたころの説明のまま。ComponentRef の JSDoc が非公開の ComponentFactory を指している | component\_ref.ts 226・263 行目、testing の test\_bed\_compiler.ts 494 行目、view\_container\_ref.ts 493〜509 行目、linker/component\_factory.ts 17・63 行目 | grep（呼び出し元が 0 件）、f9b74e90e3c・df9eed4ff1d の差分 | [第 1 回](dyn/01-dyn-entry-points.md) |
| spec の穴: environmentInjector と ngModuleRef を両方渡したときの確かめに it が無い。2026-04 の df9eed4ff1d で render3/component\_ref\_spec.ts がファイルごと消え、そこにあった ComponentRef.setInput の it（同じ値なら書かない など）と同じ名前の it が今の木に無い。acceptance の component\_spec.ts 893 行目の it は「投げる」という名前で null が返ることを確かめている | view\_container\_ref.ts 476〜480 行目（`grep -rn "Cannot pass both" packages/core/test` は 0 件）、component\_spec.ts 893〜904 行目 | grep と git show df9eed4ff1d | [第 5 回](dyn/05-dyn-vcr-host.md)・[第 1 回](dyn/01-dyn-entry-points.md) |
| （仕様の可能性あり）環境の注入器を親に持つ `Injector.create({parent: appEnv})` を elementInjector に渡すと、`providedIn: 'root'` のトークンは elementInjector の親から先に見つかるので、environmentInjector で上書きしても効かない。NodeInjector を親にすると上書きが効く。本番で directives にコンポーネントのクラスを渡すと、開発モードだけの確かめが無いため原因の分かりにくい TypeError になる | chained\_injector.ts 32〜44 行目、component\_ref.ts の directives を並べる行（第 3 回） | 第 2 回のデモと Node の記録、第 3 回の本番の記録 | [第 2 回](dyn/02-dyn-factory-create.md)・[第 3 回](dyn/03-dyn-directives.md) |

## 外のコンポーネント：foreignImports と foreign view

### [spec と PR を読む：foreign component を固めているテスト](fgn/06-fgn-tests-issues.md) — このシリーズで見つけたもの

第 1〜5 回を書いている途中で、サーバーで描くと止まる行や、並べ替えで DOM が消える行が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、このサイトの依存の @angular/core 22.1.6 と、Node で動かした 22.2.6 を使いました。gh で検索した範囲では、同じ件を扱った issue や PR は見つかっていません。foreign component は内部向けの仕組みなので、仕様として決めてある振る舞いが含まれているかもしれません。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| 外のコンポーネントを @if などのビューの根に置いて platform-server で描くと、`ReferenceError: document is not defined` で止まる。同じ回の変更検知も止まり、ほかの外のコンポーネントの render も呼ばれない | core の render3/foreign\_view.ts 126 行目（`document.createDocumentFragment()`）、node\_manipulation.ts 962 行目（Detach の枝も大域の `document`） | 22.1.6 と 22.2.6 の renderApplication の記録 | [第 2 回](fgn/02-fgn-foreign-view.md) |
| @for の中の外のコンポーネントで、@content の中身をもう作ったあとに並べ替えると、`insertBefore` が NG05106 を投げ、要素が 1 つ消える。開発モードと本番のどちらでも起きる | core の render3/node\_manipulation.ts 714〜715 行目（`getFirstNativeNode` のコンテナの枝が LogicalOnly のコンテナに降り、外が持っているノードを返す） | 22.1.6・22.2.6 の Node の記録。LogicalOnly なら `lContainer[NATIVE]` を返す 1 行を写しに足すと並べ替わった。spec の並べ替えの it は中身の無い外のコンポーネントだけ | [第 4 回](fgn/04-fgn-content.md) |
| 同じ要素がディレクティブのセレクタと外のコンポーネントの名前の両方に当たると、テンプレートの診断ではなく素の `Error` になり、ビルドは TS500 で落ちる。spec もその throw を期待している | compiler の render3/view/t2\_binder.ts 754〜756 行目、test の binding\_spec.ts 1688 行目 | compiler-cli 22.1.6・22.2.6 の記録 | [第 5 回](fgn/05-fgn-compiler.md) |
| 部分コンパイル（ライブラリの配布の形）では foreignImports が残らず、linker が `foreignImports: null` を渡す。リンクのあとの `<Card>` はふつうの要素になり、診断は 0 件 | compiler-cli の linker/src/file\_linker/partial\_linkers/partial\_component\_linker\_1.ts 257 行目。compliance の test は linked のモードを外している | compiler-cli の部分コンパイル → linker の記録 | [第 5 回](fgn/05-fgn-compiler.md) |
| 外のコンポーネントの名前が HTML の要素名と大文字小文字を無視して同じだと、HTML の要素の定義が使われる。`<Title ... />` は「Only void, custom and foreign elements can be self closed」になる | compiler の ml\_parser/html\_tags.ts 192 行目（定義が無ければ小文字にして引き直す） | compiler-cli 22.1.6 の記録（確かめたのは Title だけ） | ― |
| @Component の定義を作るとき、consts の中の外のコンポーネントのオブジェクトを `join` で文字列にする。文字列にできないオブジェクトだと、クラスを読み込んだ時点で TypeError になる（不具合というより、橋を書く側が知っておくこと） | core の render3/definition.ts 739 行目（getComponentId） | ページの上の Proxy の橋 | [第 1 回](fgn/01-fgn-contract-history.md) |
| spec が固めていない行: 再利用のときの `setCurrentTNode(tNode, false)` の 1 行は、消しても render3 の 9 specs が通る（固めているのは前の形に戻らないことだけ） | core の render3/instructions/foreign\_component.ts | 作業木で行を消して bazel | [第 3 回](fgn/03-fgn-instruction.md) |

## @let の内側：字句から LView の枠まで

### [spec と issue を読む：@let を固めているテスト](letd/06-letd-tests-issues.md) — このシリーズで見つけたもの

第 1〜5 回を書いている途中で、lexer が止まらなくなる書き方や、ハイドレーションが止まる `@let` の値が見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、Node で動かした @angular/\* 22.1.6（書いたときのこのサイトの依存）と 22.2.6 を使いました。2 つ目と 3 つ目は、すでに開いている issue や PR と根が同じです。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `@let` の構文を切った設定（`tokenizeLet: false`）でブロックの構文は有効にしておくと、`@let` の文字で lexer が先へ進まず、空の TEXT のトークンを積み続けてメモリが尽きる。`a@letter.example` のような文字でも起きる。版の古い部分コンパイルの宣言を linker にかける道で届く | compiler の ml\_parser/lexer.ts 1421〜1424 行目（`_isTextEnd` が `_tokenizeLet` を見ずに `_isLetStart()` で止まる。読む側の 251 行目は `_tokenizeLet` を見る）。18a675081f9（20.2.0）から | heap 64 MB の Worker で `parseTemplate(…, {enableLetSyntax: false})`。compiler 22.1.6・22.2.6 の linker の記録 | [第 1 回](letd/01-letd-syntax.md) |
| `@let pair = ['a', true];` のように 1 番目の要素が true の配列を子のビューで読むと、サーバーの側でコンテナとして書き出され、ブラウザのハイドレーションが NG0502 で止まる | core の hydration/annotate.ts 658 行目（`isLContainer` の枝が 686 行目の `!isLetDeclaration` より先）、node\_lookup\_utils.ts 172 行目 | 22.1.6・22.2.6 の platform-server と domino の記録。658 行目の前で LetDeclaration を外す写しで消える。根は #59504・#71929 と同じ | [第 4 回](letd/04-letd-runtime.md) |
| ハイドレーションの後片付けが、`@let` に入れた利用者の配列に `i18nNodes` などを書き足す。凍らせた配列では TypeError（#71929 の最小の形は今も起きる。#71990 は開いたまま） | core の hydration/cleanup.ts 114〜120 行目 | 22.1.6・22.2.6 の記録。#71990 の形の写しで消える | [第 4 回](letd/04-letd-runtime.md) |
| 読み取りだけの変数への書き込み（`[(x)]` に signal でない `@let` を書くなど）の診断が、NG8005 ではなく NG998005 と表示される。spec は文だけを比べている | compiler-cli の ngtsc/typecheck/template\_semantics/src/template\_semantics\_checker.ts 149 行目で `ngErrorCode()` を掛け、受け取る checker.ts 927 行目がもう一度掛ける | compiler-cli 22.1.6・22.2.6 の formatDiagnostics の記録 | [第 5 回](letd/05-letd-typecheck.md) |
| `@let` の終わりの `;` を忘れると、名前の span が飲み込まれた後ろの方の同じ文字を指す | compiler の ml\_parser/parser.ts 894 行目（`lastIndexOf(name)`） | ページの上の parseTemplate | [第 1 回](letd/01-letd-syntax.md) |
| NG8109（signal を呼ばずに補間した）の文の閉じ括弧が 1 つ多い（`s()}`） | compiler-cli の typecheck/extended/checks/interpolated\_signal\_not\_invoked/index.ts 217 行目 | compiler-cli の記録 | [第 5 回](letd/05-letd-typecheck.md) |

## @angular/upgrade の内側：AngularJS と 1 つのページを分け合う

### [spec と issue を読む：upgrade を固めているテスト](upg/06-upg-tests-issues.md) — このシリーズで見つけたもの

第 1〜5 回を書いている途中で、投影の番号の並べ方や、downgrade した input が transform を通らないこと、zoneless の枝を固める spec が無いことなどが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現には、Node の上で動かした @angular/upgrade 22.1.6 と AngularJS 1.8.3（jsdom 26）を使いました。spec の穴は、作業木で行を変えて static/test の 614 の it が通るままかで確かめました。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| AngularJS の側から投影した要素が、セレクタに合う ng-content のうち番号の小さい方ではなく、文字列として先に来る方に入る（\[2\] と \[10\] の両方に合うと \[10\] に入る）。Angular のテンプレートから同じものを投影すると \[2\] に入る | upgrade の src/common/src/downgrade\_component\_adapter.ts 396 行目（`ngContentIndices.sort()` に比べる関数が無い） | ng-content が 12 個のコンポーネントの記録。配布物の写しで `(a, b) => a - b` にすると \[2\] に入る | [第 2 回](upg/02-upg-downgrade-component.md) |
| downgrade したコンポーネントの input に `transform`（例: `booleanAttribute`）があっても、AngularJS の属性から入る値は transform を通らない（空の文字列が `''` のまま。`ComponentRef.setInput` なら `true`） | 同じファイルの `updateInput`（319〜348 行目）。transform を走らせるのは core の write\_to\_directive\_input.ts 57〜61 行目で、この道を通らない | デコレーターの input と signal の input の両方の記録。5f56a658375 のコミットの本文に、setInput への書き換えを先送りした理由が書かれている | [第 2 回](upg/02-upg-downgrade-component.md) |
| AngularJS の起動より前に Angular の側で `$injector` に頼るものを引くと最初は分かりやすいエラーになるが、それを受け止めて起動を続けると、後の bootstrap が `NG0200: Circular dependency detected for $injector` で止まり、元の原因がメッセージに出ない | upgrade の static/src/angular1\_providers.ts 21 行目が投げ、core の di/r3\_injector.ts 530 行目で入れた CIRCULAR の印が戻されないまま残る（upgrade に限らない注入器のふるまい）。upgrade\_module.ts 291 行目で表に出る | Node の記録（3 つ目の場面） | [第 1 回](upg/01-upg-bootstrap.md) |
| zoneless の混在アプリで `$digest` を呼ぶ枝を消しても、spec が 1 つも落ちない。この枝を入れたコミットの本文は afterEveryRender だが、入ったコードは内部の `afterTick` を `as any` で購読している | upgrade の static/src/upgrade\_module.ts 328〜329 行目（900cd37f68c、spec の追加なし） | 作業木で 328 行目を `false && …` にしても static/test は 614 passed | [第 4 回](upg/04-upg-injection-cd.md) |
| downgradeModule に NgModule のクラスを渡すと zone の変更検知が足されるが、起動の関数を渡すと足されず、v22 では NoopNgZone のまま動く。クラスの形で足す provider を消しても spec が落ちない | upgrade の static/src/downgrade\_module.ts 388 行目と 396〜398 行目（2a7a5de53fd からこの差がある） | 作業木で 388 行目を `applicationProviders: []` にしても 614 passed。3 つの形の記録 | [第 5 回](upg/05-upg-downgrade-module.md) |
| 遅延読み込みの NgModule や standalone のコンポーネントの imports に UpgradeModule を置くと、根とは別の NgZone ができる（根の NgModule や bootstrapApplication の providers に置けば同じ）。閉じた #67368 の続きの問いに当たる | upgrade の static/src/upgrade\_module.ts 149 行目（UpgradeModule の providers の zone の変更検知、d9e597f3418） | 置き場所ごとに NgZone が根と同じかを比べた記録 | [第 4 回](upg/04-upg-injection-cd.md) |
| zoneless のとき、AngularJS の側の whenStable の callback が Angular のタイマーを待たずにその場で呼ばれる | upgrade の static/src/upgrade\_module.ts 203〜230 行目（Testability の橋） | NoopNgZone の記録。仕様の範囲かどうかはソースとコミットからは決められない | [第 4 回](upg/04-upg-injection-cd.md) |

ほかに、UpgradeHelper の `$httpBackend` の枝（upgrade\_helper.ts 110〜119 行目）は UpgradeAdapter が消えた後どこからも呼ばれていないこと、getAngularLib は export から外れただけで angular1.ts に残っていることを、[第 3 回](upg/03-upg-upgrade-component.md)と[第 1 回](upg/01-upg-bootstrap.md)に書きました。

## Signal Forms の \[formField\]：フィールドと DOM の境目

### [spec と issue を読む：\[formField\] を固めているテスト](sfd/06-sfd-tests-issues.md) — このシリーズで見つけたもの

第 1〜5 回を書いている途中で、CVA の `name` が配列の並べ替えに追いつかないことや、`[type]` を束縛した日付の input が監視されないことなどが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現は、書いたときのサイトの依存の @angular/forms 22.1.6 で動かしたページの上のデモと、作業木に足した spec（web の suite）です。下の表のデモの 4 つは、今のサイトの 22.2.6 でも同じに出ます。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| `@for` の各行の CVA に自動で付いた `name` が、配列の先頭を消しても書き直されない。続けて行を足すと 2 つの CVA が同じ名前になる（ネイティブの input は正しく付け直される） | forms の signals/src/directive/control\_cva.ts 102〜106 行目と 124〜126 行目（`isDefinedPredicate` は今の値が空のときだけ真）、core の render3/instructions/control.ts 182〜183 行目 | 第 5 回のデモの「name の追従」と、作業木の spec | [第 5 回](sfd/05-sfd-cva.md) |
| number\|null のモデルを text の input につなぐ形（41b1410cb8a で扱えるようになった）でも、欄を空にするたびに開発モードで NG01921 の警告が出る | signals/src/directive/native.ts 148〜159 行目（条件が「text の input で値が null」だけ） | number\_input.spec.ts 232・254 行目の it を走らせたログに NG01921 が出る | [第 2 回](sfd/02-sfd-native.md) |
| `[type]` を束縛した日付の input は、ブラウザの検証の変化を拾う InputValidityMonitor に登録されない | signals/src/directive/control\_native.ts 67〜68 行目（作るときに 1 回だけ type を見る。67 行目に TODO がある） | 第 3 回のデモ | [第 3 回](sfd/03-sfd-validity.md) |
| まだ document につながっていない時点で監視を始めた日付の input では、監視用の style が document の head ではなく input の中に入り、要素ごとに 1 つずつ増える | signals/src/directive/input\_validity\_monitor.ts 52〜55 行目と 91〜95 行目（つながっていない要素の `getRootNode()` は要素の木の根を返す） | 第 3 回のデモ（`@if` の中の date の input） | [第 3 回](sfd/03-sfd-validity.md) |
| 最初の更新の後で `[type]` が変わると、min / max を受けるかの判定が古いまま残り、DOM の value も書き直されない | signals/src/directive/form\_field.ts 425 行目（`_elementAcceptsMinMax ??=` で 1 回だけ判定） | 第 2 回のデモ（color から text に切り替える） | [第 2 回](sfd/02-sfd-native.md) |

ほかに、日付の input を置いただけで dirty になること（開いている #69632 と同じ現象）の原因の道筋を[第 3 回](sfd/03-sfd-validity.md)に、CVA に `pattern` として空の配列が書かれること（#68246）と InteropNgControl に無いメソッド（#69678）を[第 5 回](sfd/05-sfd-cva.md)に書きました。

## WebMCP の内側：Angular のアプリが AI のエージェントにツールを渡す

### [spec と issue を読む：WebMCP を固めているテスト](wmcp/04-wmcp-tests-issues.md) — このシリーズで見つけたもの

第 1〜3 回を書いている途中で、登録の失敗が受け取られないまま捨てられる場所が 2 つと、守りの行を固める spec が無いことなどが見つかりました。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめました。再現は、書いたときのサイトの依存の @angular/core 22.1.6 で動かしたページの上のデモ（今のサイトの 22.2.6 でも同じに出ます）と、Node の上の 22.2.6 の記録、作業木に足した spec です。

| 何が起きるか | どこ | 確かめ方 | 章 |
| --- | --- | --- | --- |
| provideExperimentalWebMcpTools で登録が失敗しても（同じ名前のツールなど）、注入器はふつうに作られ、失敗は受け取る人のいない reject になる。2 つ目のツールは登録されない | core の webmcp/provide\_tools.ts 34 行目（`declareExperimentalWebMcpTool` の Promise を捨てる。f908140d718 で登録が非同期になってから） | 同じ名前のツールを持つ注入器を 2 つ作る、作業木の spec | [第 2 回](wmcp/02-wmcp-provide.md) |
| form() の `experimentalWebMcpTool` で、モデルからスキーマを作れなかったとき（null を含むモデルなど）のエラーが、ErrorHandler に届かず、受け取る人のいない reject になる | forms の signals/src/api/structure.ts 231〜236 行目（`registerWebMcpForm` の Promise を捨てる）、webmcp/registration.ts 32 行目と 47 行目 | Node の 22.2.6 の記録（unhandledRejection）と、作業木の spec（Chromium）。既存の spec はトークンを直接呼ぶのでこの道を通らない | [第 3 回](wmcp/03-wmcp-forms.md) |
| 登録の途中で注入器を壊したときの AbortError を飲み込む枝、SSR で止める行、`registerTool` が関数かを確かめる行を消しても、core の 13 の spec が全部通る | core の webmcp/declare\_tool.ts 36 行目・46 行目・84〜89 行目（98960556a6d・e50d47a4931・8cf7731468f） | 作業木で行を消して `webmcp_chromium` を走らせる。「登録の途中で destroy」の it を足すと、枝を消したときだけ落ちる | [第 1 回](wmcp/01-wmcp-declare.md) |
| フォームのツールの execute は、エージェントの引数でモデル全体を置き換えるので、引数で省いたプロパティがモデルから消える。submission の無いフォームでは、NG01915 で reject される前にモデルがもう書き換わっている | forms の signals/src/webmcp/registration.ts 69 行目（`node.value.set(args)`）と 72 行目（`submit`） | Node の 22.2.6 の記録。省いたプロパティの件は開いている PR #71271 と同じ指摘 | [第 3 回](wmcp/03-wmcp-forms.md) |
| 配列のフィールドのスキーマは先頭の要素だけから作られ、空の配列ではスキーマを作れない | forms の signals/src/webmcp/registration.ts 104〜112 行目 | Node の 22.2.6 の記録 | [第 3 回](wmcp/03-wmcp-forms.md) |
| angular-main では、core の annotations を `registerTool` に渡すことを確かめる it が無くなっている | core の test/webmcp/declare\_tool\_spec.ts（ecbc89b465c のテストの一斉の更新で古い形に戻り、fe9c0d77975 で一度戻ってから cdc2ea085e2 でまた消えた） | angular-main の履歴と、2026-11-16 の本家の main のファイル | [第 4 回](wmcp/04-wmcp-tests-issues.md) |

ほかに、ツールごとの引数の型推論が効かない #70125 が 22.1.6・8576f161ae4・22.2.6 のどれでも再現すること（閉じた PR #70159・#71658 の経緯）を[第 2 回](wmcp/02-wmcp-provide.md)に、readonly・disabled・hidden のフィールドもスキーマに載り書き換えられること（閉じた PR #70819・#70820 の指摘）を[第 3 回](wmcp/03-wmcp-forms.md)に書きました。

## $locationShim の内側：AngularJS の $location を Angular の Location で動かす

### [spec と issue を読む：$locationShim を固めているテスト](lshim/05-lshim-tests-issues.md) — このシリーズで見つけたもの

第 1〜4 回を書いている途中で見つけたものを並べます。どれも **issue も PR も出していません**。ソースの行は手元の木（8576f161ae4）で確かめ、再現には Node の上で動かした `@angular/common/upgrade` 22.1.6 と AngularJS 1.8.3（jsdom 26）を使いました。2026-11-17 に gh で検索した範囲では、「見つからない」と書いた行に当たる issue はありませんでした。

| 何が起きるか | どこ | 確かめ方 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| 初期化のあとに `state()` だけを替えた digest では、ブラウザにも `onChange` にも何も起きない（AngularJS 1.8.3 は history を積む）。替えた state は、次に URL を替えたときに一緒に書かれる | location\_shim.ts 744〜753 行目（`state()` が `updateBrowser` を立てない） | 記録の html5 の 8〜9 段目。作業木に it を足すと 65 specs, 1 failure、`this.updateBrowser = true;` を足すと 65 specs, 0 failures（2 つの作業木で別々に確かめた） | 見つからない | [第 3 回](lshim/03-lshim-api.md)・[第 2 回](lshim/02-lshim-sync.md) |
| ブラウザの「進む」を `$locationChangeStart` の `preventDefault()` で止めると、`$location` は戻るがブラウザの URL は進んだまま（AngularJS 1.8.3 は書き戻す） | location\_shim.ts の urlChanges の購読（167〜171 行目）と `browserUrl` の 288 行目（`lastBrowserUrl` が popstate でそろわない） | 第 2 回の記録の 7 段目 | 見つからない | [第 2 回](lshim/02-lshim-sync.md) |
| port を書かない `http://` の URL で `port()` が 80 ではなく `null` | location\_shim.ts の `DEFAULT_PORTS`（20〜22 行目、キーが `'http:'`）と params.ts 223 行目（protocol の `:` を落とす） | 第 1 回の記録の「protocol() / host() / port()」 | — | [第 2 回](lshim/02-lshim-sync.md)・[第 4 回](lshim/04-lshim-params.md) |
| `useHash: true` で、開いた URL の hash を `$$hash` と読み、再読み込みのたびに URL の hash が重なって伸びる | location\_shim.ts 359〜371 行目と 484 行目 | 再読み込みを 3 回繰り返す記録。#70501 の差分を写しに当てると伸びないが、path のモードのアンカーが path になる | #30305（開いている）、#70501（閉） | [第 3 回](lshim/03-lshim-api.md) |
| `useHash: true` でも `absUrl()` と `$locationChangeStart` に渡る URL に `#` が入らない | location\_shim.ts 485 行目 | 記録の hash のモードの全部の段 | 見つからない | [第 3 回](lshim/03-lshim-api.md) |
| `search()` にオブジェクトを渡したあと、`search()` の戻り値に `hasOwnProperty` などのメソッドが無い（AngularJS 1.8.3 の戻り値は普通のオブジェクト） | location\_shim.ts 671 行目（862a0c8ab34） | 記録の 4 段目以降の `typeof search().hasOwnProperty`。671 行目を `{}` に戻しても 64 specs, 0 failures | 見つからない | [第 3 回](lshim/03-lshim-api.md) |
| 戻る前と後で hash が違うと、`history.back()` 1 回で `$locationChangeStart` と `$locationChangeSuccess` が 2 回ずつ出る。また戻ったあとの `state()` が、戻った先の `history.state` ではなく最後に書いた state のまま | `Location.onUrlChange` に popstate と hashchange の両方が届く。state は `cacheState` が戻る道で呼ばれないため（どちらも第 2 回の範囲の行） | 記録の 10 段目と、hash が同じ URL の間で戻る比べ（1 回だけ） | 見つからない | [第 3 回](lshim/03-lshim-api.md)・[第 2 回](lshim/02-lshim-sync.md) |
| `/indexXhtml` のような path も `/index.html` として落とし、`areEqual('/docs', '/docs/indexXhtml')` が true（Angular の `Location` は d109bf90d50 で直っている） | params.ts 238 行目（`.` が escape されていない） | codec の記録と、ページの上の写し | #69023（閉、古い PR として） | [第 4 回](lshim/04-lshim-params.md) |
| `hashPrefix` と `serverBaseHref` の設定を読む行が無い。`appBaseHref` も APP\_BASE\_HREF も無いと `<base href>` を読まない | location\_upgrade\_module.ts の `LocationUpgradeConfig` と `provideAppBaseHref` | grep と、設定を変えて起動した記録 | — | [第 1 回](lshim/01-lshim-module.md) |
| テスト用の `provide$location` と `APP_BASE_HREF_RESOLVED`、upgrade.spec.ts の `MockUpgradeModule` が使われていない | upgrade\_location\_test\_module.ts 71〜82・92〜112 行目、upgrade.spec.ts 17〜27 行目 | 72 行目の token を替えても 64 specs, 0 failures。`grep -rn` | — | 第 5 回（3 節） |
| 5064dc75acb（#32037）の題と PR の本文は「AngularJS のイベントの前に知らせる」だが、コードと spec は `$locationChangeSuccess` の後 | コミットのメッセージ（location\_shim.ts の `$watch` の中） | `git show 5064dc75acb` と `gh pr view 32037` | — | [第 3 回](lshim/03-lshim-api.md) |

## ng serve の内側：Vite の middleware と plugin が 1 つの要求をさばくまで

### [spec と issue を読む：dev-server を固めているテスト](vds/05-vds-tests-issues.md) — このシリーズで見つけたもの

書きながら作業木と記録で見つけたものです。本家の行と、再現に使った記録を書きます。「既存の issue / PR」は 2026-11-17 に gh で検索した結果（読むだけ）です。

| ソースの行 | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- |
| vite 8.1.5 の `isHostAllowedInternal`（16915 行目）と `vite/index.ts` の 104〜108 行目 | `allowedHosts: ["*"]` で起動すると、名前の付いた Host は全部 Vite の 403。SSR の側（`security.allowedHosts`）は `'*'` を「全部」と読む | 「allowedHosts "\*" vite」「allowedHosts wildcard dev-server」で見つからず | [第 3 回](vds/03-vds-host-headers.md) |
| CLI の `json-schema.ts` の `getSupportedTypes`（22.1.7） | `ng serve --allowed-hosts demo.test` が `Argument: project, Given: "demo.test"` で止まる | #33955（閉じた）。7ee5f905a8（PR #34607）は main と 22.3.x だけ | [第 3 回](vds/03-vds-host-headers.md) |
| `chrome-devtools-middleware.ts` の 24〜65 行目 | 24 行目を壊しても dev-server の 77 specs が全部通る。足した it は壊すと落ち、戻すと通る | #30482 は機能の要望（閉じた）。spec の不足の issue は見つからず | [第 3 回](vds/03-vds-host-headers.md) |
| vite の 26014 行目と `ssr-middleware.ts` の 22〜75 行目 | `--ssl -c ssr`（内部の SSR）で、許していない Host にも 200（Vite は https で Host を見ず、内部の SSR は `AngularAppEngine` を通らない） | Vite の判断による動き。Angular の側の issue は見つからず | [第 3 回](vds/03-vds-host-headers.md) |
| `ssr-middleware.ts` の 22〜75 行目（`resetComponentUpdates` が無い） | 22.1.7 で `-c ssr`、コンポーネントの CSS → テンプレート → `@import` の CSS の順に変えると、読み直しても 10px のまま。`/@ng/component` が 6758 バイトの古い更新を返す | #34163（閉じた）。de91345c13（main）・37cf399d95（22.2.x、v22.2.1 から）。22.1.x には無い | [第 4 回](vds/04-vds-hmr-ssr.md) |
| `hmr.ts` の 107〜124 行目と、vite の `client.mjs` の 970 行目 | `NG_HMR_CSTYLES=1` で、テンプレートの更新の後に同じ CSS の link が 2 本残り、次の `css-update`（40px）が効かない | #34248（同じ設定の別の症状、開いている）。この形は見つからず | [第 4 回](vds/04-vds-hmr-ssr.md) |
| `hmr.ts` の 86〜159 行目 | 98 行目を `some` に壊しても落ちる spec が無い。WebSocket に送る枠を見る spec が無い | 見つからず | [第 4 回](vds/04-vds-hmr-ssr.md) |
| `id-prefix-plugin.ts` の 61 行目 | `base` を escape せずに正規表現に入れる（名前は 58 行目で escape する） | 見つからず（実害の報告も無い） | [第 4 回](vds/04-vds-hmr-ssr.md) |
| `options.ts` の 130 行目（22.1.7 には無い） | `--port 0` で Vite に渡る `strictPort` が `true` | PR #34055（strictPort）・#34686（port 0 をそのまま渡す） | [第 1 回](vds/01-vds-config.md) |
| `builders/dev-server/vite/utils.ts` の 106〜116 行目 | `isAbsoluteUrl` はどこからも呼ばれない | 見つからず | [第 1 回](vds/01-vds-config.md) |
| `assets-middleware.ts` の 53 行目 | 拡張子の無いアセットなどの ETag が `W/` + 引用符の無い hash | PR #34566（0e2799d3a2、main と 22.3.x） | [第 2 回](vds/02-vds-assets-html.md) |
| `assets-middleware.ts` の 58〜61 行目 | 拡張子の無いアセット（`/version`）に `Content-Type` が付かない | 見つからず | [第 2 回](vds/02-vds-assets-html.md) |
| `tools/vite/utils.ts` の 30〜32 行目と `assets-middleware.ts` の 43 行目 | `baseHref: /app/` でも、base の外の `/version`・`/styles.css`・`/favicon.ico` が 200 | 見つからず（#27576 は base と proxy の別の話） | [第 2 回](vds/02-vds-assets-html.md) |

どれも、本文に書いたのは行と再現だけです。第 1〜2 回の行は、それぞれの章の記録とテストの節にあります。

## ng test と Vitest の内側：テストを束ねて走らせるまで

### [spec と issue を読む：unit-test builder を固めているテスト](vit/05-vit-tests-issues.md) — このシリーズで見つけたもの

書きながら記録と作業木で見つけたものです。本家の行と、再現に使った記録を書きます。「既存の issue / PR」は 2026-11-17 に gh で検索した結果（読むだけ）です。

| ソースの行 | 見つけたこと | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| `test-discovery.ts findTests 57〜58 行目` | exclude は glob の include にしか効かず、spec のパスを直に書くと外れない | --include src/app/greet.spec.ts --exclude '\*\*/greet.spec.ts' で 2 つのテストが走り、終了コード 0（第 1 回の記録） | 見つからない | 第 1 回 6 節 |
| `test-discovery.ts 117・194 行目と 22 行目のコメント` | entry の名前は 128 文字に縮めた後に接頭辞が付くので、128 文字を超える | 202 文字の名前が spec- 付きで 133 文字（第 1 回の記録） | 見つからない | 第 1 回 7 節 |
| `test-discovery.ts 187 行目のコメント` | 「SHA256 の 8 文字」だが、198 行目の calculateHash は xxhash（cda8830710 から） | 22.1.7 の名前は sha256 と一致、44129f66a3 では変わる | 見つからない | 第 1 回 7 節 |
| `plugins.ts 234 行目` | config.plugins を消しても、root の Vite には利用者の plugin が残る | runnerConfig の記録で demo-user-plugin が root の 21 番目にも入った | 見つからない | 第 3 回 4 節 |
| `plugins.ts の projectDefaults と projectOverrides の extends: false` | vitest 5 で plugin が 2 回適用されるのを止める 2 行に spec が無い | 作業木で消すと 104 specs が通る。足した it は expected 2 to be 1 で落ちる | 8504cfffcf（spec なし） | 第 3 回 5 節 |
| `runner-config-vitest_spec.ts 400・432・465・497 行目` | 4 つの警告の it は文言の expect がコメントのまま | plugins.ts の 209 行目を消しても通る | 0aab1158d6 からの TODO | 第 3 回 4 節 |
| `plugins.ts 565 行目と Vite の mergeConfig` | Set で重複を消しても、root の設定と混ぜた後に exclude が重複する | --coverage + runnerConfig の記録で src/app/label.ts が 2 回 | 見つからない | 第 3 回 7 節 |
| `executor.ts 191 行目` | テストが落ちても理由の文言が All tests passed. のまま | NG\_TEST\_LOG=1 で落ちる spec を走らせると success: false. Reason: All tests passed. | 見つからない | 第 4 回 6 節 |
| `executor.ts 196〜201 行目と runners/vitest/index.ts 29〜33 行目` | runnerConfig で依存の確認を飛ばすと、provider の package が無い exitCode 1 を threshold の不足と読む | --coverage --runner-config で Reason: Test run failed due to unmet coverage thresholds.（テストは 0 本） | 見つからない | 第 4 回 6 節 |
| `executor.ts 210〜241 行目と vitest の startVitest の finally` | --watch=false の 1 回目の close には timeout がかからない | 記録で close が 2 回、2 回目は 1 ms 以内。timeout を 1 ms にしても警告が出ない | #32832 の本文が触れている（95510511d9 で閉じた） | 第 4 回 4 節 |
| `executor.ts 138 行目と vitest の SIGINT の扱い` | watch を Ctrl+C で止めると、テストが落ちていても終了コード 0。asyncDispose も呼ばれない | SIGINT から 41 ms で終了コード 0、Disposing の行なし | 見つからない | 第 4 回 4 節 |
| `browser-provider.ts 148 行目` | runnerConfig のときの文言が "playwright" or "webdriverio" で、要る package と違う | --browsers=chromium --runner-config の記録 | origin/main の f9325ab02d（PR #34442）で直った | 第 4 回 8 節 |
| `runners/karma/index.ts 33 行目` | coverage はいつもオブジェクトなので、karma-coverage をいつも要求する | origin/main の index\_spec.ts を 44129f66a3 に置くと 1 つ落ちる | origin/main の 77fb7fa0f2（PR #34500）で直った | 第 4 回 9 節 |
| `runner-config-vitest_spec.ts 167 行目の it` | 1 回目に落ち、flaky = True の 2 回目で通った | unit-test\_integration\_tests の shard 4（Expected false to be true.） | 見つからない | この章 3 節 |

ほかに、spec が無いと各章で書いた行は、[第 1 回](vit/01-vit-discovery.md)の `DependencyChecker`・大文字と小文字の扱い・`preserveSymlinks` を継ぐ行、[第 2 回](vit/02-vit-build.md)の `adjustOutputHashing`・renderer・`findVitestBaseConfig`（`build-options.ts` と `configuration.ts` に `_spec.ts` が無い）、[第 3 回](vit/03-vit-plugins.md)の `determineCoverageProvider`（export されていない）、[第 4 回](vit/04-vit-executor.md)の後片付けの timeout です。

## Karma の builder の内側：esbuild で束ねたテストを Karma に配るまで

### [spec と issue を読む：Karma の builder を固めているテスト](kar/05-kar-tests-issues.md) — このシリーズで見つけたもの

書きながら記録と作業木で見つけたものです。本家の行と、再現に使った記録を書きます。「既存の issue / PR」は 2026-11-17 に gh で検索した結果（読むだけ）です。

| ソースの行 | 見つけたこと | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| `builders/karma/application_builder.ts 105〜107、progress-reporter.ts 53〜92` | ng test --watch で、1 回目の SIGINT（Ctrl+C）では Karma が止まり一時のフォルダも消えるが、ng のプロセスが終わらない。2 回目の SIGINT で終わる | 第 3 回の記録の watch（process group へ SIGINT、10 秒待つ）と sigint-pty.py（疑似端末に Ctrl+C、15 秒待つ）。どちらも 1 回目では終わらず、2 回目ですぐ終わった | 見つからなかった（"SIGINT"・"ctrl c" などで検索） | 第 3 回 |
| `builders/karma/find-tests.ts 15〜17（removeLeadingSlash）` | POSIX で --include に絶対パスを渡すと先頭の「/」が落ちて何も見つからない（unit-test の側は 683d0e09e5 で直っている） | 第 1 回の記録の「--include 絶対パス」。結果は空、0 件で終了コード 1 | 見つからなかった | 第 1 回 |
| `builders/karma/karma-config.ts 35・36` | karmaConfig があるとき、karma.conf.js の client.clearContext: false が --watch=false で true になる | 第 1 回の記録の「conf で basePath などを上書き」 | 見つからなかった（#28271 はこの行を入れた元の件） | 第 1 回 |
| `builders/karma/application_builder.ts 214` | zone.js を使うかを、polyfills にちょうど "zone.js" があるかだけで決める | 第 2 回の本文（行の読み） | #30689 は application builder の zoneless の判定の件で、別の行 | 第 2 回 |
| `unit-test/runners/karma/executor.ts 143` | coverageWatermarks を書かなくても coverageReporter.watermarks に {} が入る | 第 4 回の記録の「unit-test + 使えない options」の karmaOptions の後 | 見つからなかった | 第 4 回 |
| `builders/karma/tests/setup.ts 137〜141` | harness が karma.conf.js から webpack の plugin と framework を先に消すので、configureKarma の 369〜387 行目（外す行と警告）を通る spec が無い | この章の 4 節（filter を常に true にしても 41 specs が通る） | — | 第 3 回 |
| `builders/karma/tests/setup.ts 145、web-worker-tsconfig_spec.ts 74・85` | describeKarmaBuilder は isApplicationTarget をいつも true で渡すので、85 行目の it は定義されない | この章の 2 節（行の読み）。走らせた数も 41 で合う | — | 第 5 回 |

ほかに、spec が無いと各章で書いた行は、[第 1 回](kar/01-kar-entry.md)の `getBuiltInKarmaConfig`（harness がいつも `karmaConfig` を書く）、[第 2 回](kar/02-kar-build.md)の zoneless の仮想の init と `@angular/localize` の有無、[第 3 回](kar/03-kar-serve.md)の junit・scripts の重なり・`files.clear()`・coverage の spec の除外・一時のフォルダの後片付け、[第 4 回](kar/04-kar-runner.md)の options の写し方と `transforms` です。

## oxc の変換と TypeScript の transformer の内側：ビルドが JavaScript を書き換える行

### [spec と issue を読む：oxc の変換と transformer を固めているテスト](oxc/05-oxc-tests-issues.md) — このシリーズで見つけたもの

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

## SSR のサーバールートの内側：ルートを取り出し、木で照合し、応答を組み立てる

### [spec と issue を読む：サーバールートを固めているテスト](srt/05-srt-tests-issues.md) — このシリーズで見つけたもの

第 1〜4 回を書く途中で、本家の振る舞いの食い違いと、spec や文書の小さな抜けが見つかりました。どれも Node で本物の @angular/ssr 22.2.7（と、比べるための 22.1.7）を動かすか、作業木で行を変えて bazel で走らせて確かめ、ソースの行（angular-cli 44129f66a3）と照らしています。「既存」の欄は、gh で題と本文を検索した範囲で見つかったものです。

| 何が起きるか | ソースの行 | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| Router に `user/:id` を `user/new` より先に書くと、`/user/new` の応答は、ヘッダーなどの値を `user/new` の serverRoute から取り、本文は Router が選んだ `user/:id` の部品になる | routes/route-tree.ts 243〜261 行目（段ごとに完全一致が先）と、Router の上から順の照合 | 第 3 回の記録 order（`ɵgetOrCreateAngularServerApp().handle`） | 同じ種類の食い違い（URL の文字の読み方）は #33555（開）・PR #34091（開）。並びの順の形は書かれていない | [第 3 回](srt/03-srt-route-tree.md) |
| serverRoute の path が先頭の段の `*`（`'*'`・`'*/x'`）だと、`getPrerenderParams` との組がエラーにならない（`'p/*'` はエラー） | routes/ng-routes.ts 589 行目（8bfcae4c1b で `path.includes('*')` から変わった） | 第 3 回の記録 star。`path.split('/').includes('*')` にすると 249 件はそのまま通る（T9） | 見つからない | [第 3 回](srt/03-srt-route-tree.md) |
| `toObject` → `fromObject` で decode がもう 1 回かかり、`%25` を含む経路は manifest から作り直した木で当たらなくなる | routes/route-tree.ts 175〜181 行目と 210 行目 | 第 3 回の記録（1 往復の前後で match の答えが変わる） | 見つからない | [第 3 回](srt/03-srt-route-tree.md) |
| Router の path に `%` をそのまま書くと（`50%-off`）、取り出しの `insert` が `URIError` を投げる | routes/route-tree.ts 210 行目 | 第 3 回の記録 | リクエストの側の同じ `URIError` は、SSR の守りのシリーズの最終回の表にある。issue は見つからない | [第 3 回](srt/03-srt-route-tree.md) |
| 使われない serverRoute のエラーは、書いた `post/:slug` ではなく正規化した `post/*` で出る | routes/ng-routes.ts の逆向きの検査（serverRoutes の木の `traverse()`）と route-tree.ts 121 行目 | 第 3 回の記録 unused | — | [第 3 回](srt/03-srt-route-tree.md) |
| 44129f66a3（と 22.1.7）では、描画中に request.signal を abort しても描画を続け、保留中のタスクが終わらないとプラットフォームを壊さない | utils/promise.ts 43 行目（待つのをやめるだけ）と utils/ng.ts 54〜59 行目（signal を受け取らない） | 第 4 回の記録 `/hang`（22.1.7 は 600 ms 待っても破棄されない、22.2.7 は 1〜2 ms で破棄） | origin/main の 47bc9c3969（PR #34568）で直っていて、22.2.7 にも入っている | [第 4 回](srt/04-srt-manifest-render.md) |
| （spec）完全一致の枝からの後戻り、プラットフォームを壊す 3 か所、`promiseWithAbort` の聞き手の 2 か所、`hasOptions`、`MODULE_PRELOAD_MAX` は、消しても 249 件が通る。53b9623b7b が足した it は decode を外しても通る。`withAppShell` を起動する it は `test/` に無い | 5 節の表の各行 | 作業木で行を変えて bazel（T1・T4・T11〜T16・T19） | — | 第 1・3・4 回 |
| （文書）`RouteTree.match` の JSDoc は「先に入れたものが勝つ」のままで、4df97d1923 のあとの動き（完全一致が先）と違う。`getPrerenderParams` の JSDoc の例の path は `/` で始まり、そのままだと先頭の `/` の検査で弾かれる | routes/route-tree.ts 141〜143 行目、routes/route-config.ts 156・166 行目 | git show 4df97d1923、第 3 回の記録 bad の 1 つめのエラー | — | [第 3 回](srt/03-srt-route-tree.md) |
| 22.2.7 で `getPrerenderParams` の値が 1 つでも検査に落ちると、その経路の残りの値と fallback の 1 件が出ない（値ごとではなく経路ごとに止まる） | 22.2.7 の ng-routes の展開の行（bf1602a916 で足された検査を、for の外側の try が包む） | 第 2 回の記録（値の表で `/item/first` だけが残る行） | bf1602a916（PR #34570）の spec はエラーが 1 件出ることだけを確かめる | [第 2 回](srt/02-srt-prerender-params.md) |
| `fallback: None` でも、invoke が偽の取り出し（manifest に木が無いときのリクエスト時）では、型の経路が Server で木に入り、サーバーで描かれる | routes/ng-routes.ts の fallback の条件（第 2 回の 5 節） | 第 2 回の記録（5 節の表の右の列） | — | [第 2 回](srt/02-srt-prerender-params.md) |
| （spec）0fdcde5426（正規表現の g の状態）を戻すと落ちる it は、jasmine の並べ替えの seed で入れ替わる。`getPrerenderParams` が投げる場合と、文字列でない値を返す場合の it は 44129f66a3 に無い | test/routes/ng-routes\_spec.ts の describe（184 行目） | 作業用の複製で行を戻して bazel を 3 回（第 2 回） | 0fdcde5426 は spec を足していない（#33154） | [第 2 回](srt/02-srt-prerender-params.md) |
| （型）取り出しの結果の型 `AngularRouterConfigResult` に、どこでも値を入れない `serverRoutesConfig` がある | routes/ng-routes.ts 125 行目 | grep（第 1 回） | — | [第 1 回](srt/01-srt-extract.md) |
| matcher のルートの下のサーバールートは、`親の経路/**` の文字列の前方一致で集めるので、`**` を使わずに書いた serverRoute（`shop/*/sale`）は集められない | routes/ng-routes.ts 274・275 行目 | 第 1 回の記録と ng-routes\_spec.ts 383 行目の it | — | [第 1 回](srt/01-srt-extract.md) |

読み方の目安: 上の 2 つ（並びの順の食い違い、先頭の `*`）は、利用者が普通に書ける設定で起きるので影響がいちばん大きいものです。3・4 つめは `%` を経路に書いたときだけです。片付けの抜けは 22.2.7 では直っていますが、それを見張る spec は 44129f66a3 の `test/` にはありません。

## Signal Forms のフィールドの木：子を作り、配列を追い、古い木と橋をかける

### [spec と issue を読む：フィールドの木を固めているテスト](sft/05-sft-tests-issues.md) — このシリーズで見つけたもの

このシリーズを書いている途中で見つけたものです。どれも **issue も PR も出していません**。ソースの行は 8576f161ae4 で、origin/main（ca92b968b8e）とサイトの 22.2.6 の `.mjs` でも同じ形であることを確かめました。再現は、22.2.6 で動かしたページの上のデモと Node の記録、8576f161ae4 の作業木に足した spec（node:test）です。gh で探した範囲で、同じことを報告した issue があるものは「既存」に書きました。

| 何が起きるか | ソースの行 | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| 値が文字列・数・`null` のフィールドに `Object.hasOwn(f.name, 'x')`・`Object.getOwnPropertyDescriptor(f.name, 'x')` を呼ぶと TypeError（`Reflect.getOwnPropertyDescriptor called on non-object`）。`Object.keys(f.name)` は `[]` | `field/proxy.ts` 80〜88 行目（82 行目が値をそのまま渡す。90〜93 行目の ownKeys にはある「オブジェクトでなければ」の分かれ道が無い）。e87f423d907 から | 第 3 回の DEMO 1、作業木の spec（`Expected function not to throw`） | 無し | [第 3 回](sft/03-sft-proxy-context.md) |
| 再帰のスキーマで、同じフィールドに違う深さで付けた 2 つのルールが同じ path を `valueOf`・`stateOf`・`fieldTreeOf` で読むと、2 番目のルールが 1 番目の深さで決まったフィールドを受け取る（B だけなら `next.data`、A と並べると根の `data`） | `field/context.ts` 46〜49・110・112 行目（cache の鍵が path だけ）と 79 行目（深さはモジュールの変数で、鍵にも依存にも入らない）、`field/resolution.ts` 9 行目。b8314bd3409 から | 第 3 回の DEMO 2 と Node の記録、作業木の spec（`Expected $[1] = 'B:D0' to equal 'B:D1'`） | 無し | [第 3 回](sft/03-sft-proxy-context.md) |
| `SignalFormControl` を `FormGroup` に入れると、最初の変更検知、`markAsPristine()`・`markAsUntouched()`、dirty だったものの `reset()` のたびに、**兄弟の**`FormControl` の dirty・touched が消える | `compat/src/signal_form_control/signal_form_control.ts` 164〜168・182〜186・398・403 行目（親の `markAsUntouched()`・`markAsPristine()` を呼ぶ。リアクティブフォームは親に `_updatePristine`・`_updateTouched` を呼ぶ） | 第 4 回の DEMO 1、作業木の spec 2 本 | 無し | [第 4 回](sft/04-sft-signal-form-control.md) |
| `ctrl.fieldTree().value.set(v)` 1 回で親の `valueChanges` が 2 回（`reset()` は値が変わると 3 回）。`FormGroup` に入れただけで、最初の変更検知で親の `valueChanges` が 1 回 | 同じファイルの 110〜112 行目（`onUpdate` が数えずに親を呼ぶ）と 287〜296 行目、値の effect の最初の 1 回（118〜128 行目） | 第 4 回の DEMO 1、作業木の spec 2 本 | #72009 の PR #72014（開いている）の書き換えで変わる形 | [第 4 回](sft/04-sft-signal-form-control.md) |
| `[...ctrl.fieldTree]`・`for...of` で取り出した配列の子は包まれていない木で、`value.set` しても親がその場で追いつかない（`[...ctrl.fieldTree][0] !== ctrl.fieldTree[0]`） | 同じファイルの 535 行目（`typeof prop === 'string'` で `Symbol.iterator` を包まない）と `field/proxy.ts` 57 行目（内側の `tgt.fieldTree` に反復子を当てる） | Node の記録、作業木の spec（`Expected $.c[0] = 'a' to equal 'X'`） | 無し | [第 4 回](sft/04-sft-signal-form-control.md) |
| `compatForm` の根の `valid()`・`invalid()` は、compat の子を一度も読む前は `FormControl` の validator を見ない。今は掃除の effect が最初の tick で子を作るので、それより前の同期の読み出しだけで見えるが、#70627 の 1 行の直しを当てると tick のあとも見えたまま（既存の spec は全部通る） | `field/structure.ts` の `computeChildrenMap` の遅延の判断（どの子にもスキーマのルールが無ければ子を作らない、98c5afdb021）と、`compat/src/compat_structure.ts`（compat の子の検証はルールでなく control から来る）、`field/manager.ts` 84 行目 | 第 4 回の DEMO 2、作業木の spec 2 本（manager.ts をそのまま／直したとき） | 無し（#70627 の PR #71659 が開いている） | [第 4 回](sft/04-sft-signal-form-control.md)・[第 1 回](sft/01-sft-structure.md) |

ほかに、既存の issue を今のコードで確かめたものがあります。第 1 回の掃除の effect が遅延で作らなかった子を全部作ること（#70627）、第 2 回の同じ印の要素が 1 つの子を共有すること（#70840）と `keyInParent` が文字列であること（#71616）、第 3 回の `in` が子のキーを見ないこと（#70252）、第 4 回の status の変化を親に知らせないこと（#72009）・compat の `errorSummary`・`parseErrors` が空であること（#71634・#71633）です。小さなものでは、`compat/src/api/extract.ts` の先頭に、b542302a23c のあとで使われなくなった `untracked` の import が残っています（origin/main も同じ）。

## ビルドの前と後：書いた HTML・CSS・class が何に変わるか

### [index.html の前と後：script と link、重要な CSS とフォントの埋め込み、プリレンダーとの違い](bmap/03-bmap-index-html.md) — このシリーズで見つけたもの

各章で、ソースの行と、自分で動かした記録で確かめたものです。「既存」は `gh` で探して見つかった issue・PR です（2026-11-18）。

| 章 | 何が起きるか | ソースの行 | 再現 | 既存の issue / PR |
| --- | --- | --- | --- | --- |
| [第 1 回](bmap/01-bmap-component.md) | （不具合ではない・spec の穴）`_nghost-ng-c…` の数字を決める `getComponentId` の材料を固める spec が無く、新しい本家では材料が 1 つ減って、同じコンポーネントの数字が変わる | core/src/render3/definition.ts の `getComponentId`。98b0f3b7207（origin/main と v22.3.0-rc.0）で `componentDef.signals` の 1 行が消えた | 題材の `Card` は 22.2.6 で `c663675611`、その 1 行だけを消した作業木で `c3857098018`（第 1 回の 7 節・10 節） | — |
| [第 2 回](bmap/02-bmap-styles-bundle.md) | （不具合・22.2.7 まで）Google Fonts の CSS のディスクのキャッシュが効かず、ビルドのたびにダウンロードする | inline-fonts.ts 184 行目が `base64`、258 行目が `hex`。259 行目の前にフォルダを作る行が無く、260 行目の `catch` が失敗を捨てる | 22.2.7 の `inline-fonts.js` の `https.get` を数える偽物に差し替え、同じ URL で 2 回 `processURL`。フォルダの有無にかかわらず 2 回。修正を当てた写しは 1 回 | #34719（閉）、PR #34720（4673cecf00、main。22.2.x に 67595ebff8、22.3.x に 820ca173fe。v22.2.7 より後） |
| [第 3 回](bmap/03-bmap-index-html.md) | （不具合らしきもの）`index.html` の `<head>` に `<style/>` と書くと、エラーにならずにビルドが通り、ページの中身が全部 `<style>` の文字になる | valid-self-closing-tags.ts 73 行目の SVG の `style` が、HTML の中の `<style/>` にも当たる（表がタグの場所を見ない） | 複製の `src/index.html` に `<style/>` を 1 行足して `ng build -c development`。`<link>` と `<script>` が `<!doctype html>` の前に付く。headless Chrome で `<body>` が空 | 見つからなかった（SVG のタグを許す #27702・#28502 は閉） |
| [第 3 回](bmap/03-bmap-index-html.md) | （不具合らしきもの）`ngCspNonce` を使うと、`<noscript>` の中の `<link>` の nonce が `fonts.inline` によって付いたり付かなかったりする | index-html-generator.ts のコンストラクタで、全部に通す列の `addNonce` が `fonts.inline` のときだけ入る。CSR の列の `addNonce` は beasties のあと | 複製の `<app-root ngCspNonce="r4nd0m">` を production でビルドすると付き、`fonts: false` にすると付かない | 見つからなかった（link に nonce を付ける #34255・PR #34256 は閉） |
| [第 3 回](bmap/03-bmap-index-html.md) | （警告どおりの限界）CSS の入れ子が出力に残ると、beasties 0.5.4 がそのセレクターを読めず、重要な CSS から外す | inline-critical-css.ts 38 行目の `warn` が警告を集める。入れ子が残るのは target が新しいときだけ（第 2 回の 3 節） | `.browserslistrc` を「last 2 Chrome versions」にし、`&.on` の規則を足して production。`Could not parse 1 selector … &.on (Empty sub-selector)` | 見つからなかった |

## Signal Forms の組み込みの検証：required から minDate まで、1 つの validate に下りるまで

### [spec と issue を読む：組み込みの検証を固めているテスト](sfv/05-sfv-tests-issues.md) — このシリーズで見つけたもの

このシリーズを書いている途中で見つけたものです。どれも **issue も PR も出していません**。ソースの行は 8576f161ae4 で、origin/main（943ec3bd8d6）とサイトの 22.2.6 の `.mjs` でも同じ形であることを確かめました。gh で探した範囲で、同じことを報告した issue があるものは「既存」に書きました。上の 3 つは第 1〜3 回で見つけたもので、詳しい行と記録はそれぞれの章にあります。

| 何が起きるか | ソースの行 | 再現 | 既存の issue / PR | 章 |
| --- | --- | --- | --- | --- |
| `pattern` に `g`（か `y`）フラグの `RegExp` を渡すと、`lastIndex` が前の一致の位置で残り、同じ種類の値でも結果が交互に変わる。doc コメントに注意が無い | `pattern.ts` 51 行目（渡された `RegExp` の `test` をそのまま呼ぶ） | 第 1 回の DEMO と記録 | gh の検索では見つからず | [第 1 回](sfv/01-sfv-common.md) |
| `max(NaN)` を `max(10)` より先に積むと、`max()` と input の `max` 属性が `NaN` のまま（検証は 10 で正しく落ちる）。積む順で結果が変わる | `api/rules/metadata.ts` 86〜88 行目の reducer（`item < acc` が `NaN` で常に偽） | 第 2 回の DEMO と記録。`max.spec.ts` 119 行目は検証の結果だけを見る | gh の検索では見つからず | [第 2 回](sfv/02-sfv-limits.md) |
| Invalid Date の下限を先に積むと、`min()` が Invalid Date のまま、`min` 属性が `"NaN-NaN-NaN"`（検証は正しい） | `api/rules/metadata.ts` 101 行目の reducer（`item > acc`）と `min_date.ts` 60 行目（検証だけが飛ばす） | 第 3 回の DEMO と記録 | gh の検索では見つからず | [第 3 回](sfv/03-sfv-dates.md) |
| `[formField]` を通った parse エラーは、`errors()` と `getError('parse')` で `instanceof NgValidationError`・`instanceof NativeInputParseError` が偽（ただのオブジェクト）。型は `NgValidationError` の和に入っている | `directive/form_field.ts` 187〜191 行目（`{...err, fieldTree, formField}`）。parse エラーを入れた ebae211add3 からこの形（a67e00741c2 で今の場所に移った） | 第 4 回の DEMO（qty に `3a`）、4 節の E6（変えても spec は全部通る） | gh の検索では見つからず | [第 4 回](sfv/04-sfv-errors.md) |
| `error` に schema の外の 1 つのオブジェクトを渡して 2 つのフィールド（か 2 つのフォーム）に使うと、2 つ目のエラーの `fieldTree` が 1 つ目のフィールドを指す。`errorSummary()` の並びもそこに寄る | `field/validation.ts` 408・411 行目（`??=` で返されたオブジェクトに書き込む）と `required.ts` などの `getOption(config.error, ctx)`（関数でなければ同じオブジェクト） | 第 4 回の DEMO（shareA・shareB）と Node の記録 | gh の検索では見つからず | [第 4 回](sfv/04-sfv-errors.md) |
| spec の名前が中身と合っていない：`min.spec.ts` 77 行目・`required.spec.ts` 93 行目の「`wraps it as custom`」（包まない）、`email.spec.ts` 15 行目の「`returns requiredTrue error when the value is false`」（email のエラーを見る）、`compat_validation_error.spec.ts` 18 行目の `describe('destroy$')`（中身は `reactiveErrorsToSignalErrors`） | それぞれ 46dbd185664・b8314bd3409・60447945bc5 から。origin/main も同じ | grep と `git log -S` | 無し | [第 1 回](sfv/01-sfv-common.md)・[第 4 回](sfv/04-sfv-errors.md) |
| `validation_errors.ts` の `WithFieldTree` などの doc コメントが「`field` property」と書いている（プロパティは `fieldTree`） | `validation_errors.ts` 22・32・44 行目。ae0c59028a2（`field` から `fieldTree` に改名）の残り。origin/main も同じ | grep | 無し | [第 4 回](sfv/04-sfv-errors.md) |

ほかに、既存の issue を今のコードで確かめたものがあります。第 4 回の `CompatValidationError` が `fieldTree` と `message` を書かないこと（#71634）、既定の文言を設定する口が無いこと（#66396）です。

## @angular/ssr の読み残し：provideServerRendering・リクエストハンドラ・CommonEngine・ビルド側のワーカーを行で埋める

### [spec と issue を読む：@angular/ssr の残りを固めているテスト](ssrl/06-ssrl-tests-issues.md) — 7. このシリーズで見つけたもの

どれも 44129f66a3 の行を読み、Node か本物の ng build（@angular/build・@angular/ssr 22.2.7）で確かめたものです。gh で同じ話の issue と PR を探し、見つからなかったものには「既存なし」と書いています。

|   | 何が起きるか | 行 | 確かめ方 | 既存の issue |
| --- | --- | --- | --- | --- |
| A1 | CommonEngine に `enablePerformanceProfiler: true` を付けて 2 つのリクエストを重ねると、先に始まって後に終わった方の render が `SyntaxError: The "start:🅰️:Render Page" performance mark has not been set` で reject する。表（printPerformanceLogs）にもほかのリクエストの行が混ざる | peformance-profiler.ts 44〜46 行目で mark の名前がラベルだけで決まり、52〜56 行目の finally で後の方が先の方の start の mark を消す。15 行目はプロセスの measure を全部読む | 第 3 回の記録（150 ms と 40 ms の render を 30 ms ずらして重ねる） | 閉じた #27374 が同じ例外（再現できず閉じられている）。開いているものはなし |
| A2 | createRequestHandler / createNodeRequestHandler の JSDoc の例は `export default` だが、dev-server と prerender が読むのは名前つきの `reqHandler` だけ。例どおりに書くと ng serve は警告を出して内部の中間処理に切り替わる | src/handler.ts 31・39 行目、node/src/handler.ts 37 行目ほか。読む側は ssr-middleware.ts 105〜106 行目と launch-server.ts 22 行目 | 第 2 回の記録（export default だけの server.ts） | 既存なし |
| B1 | outputMode を書かない設定で `prerender.routesFile` と withAppShell を一緒に使うと、app shell の印が落ち、index.html が app shell にならない（index.html が出力されず、ng-app-shell/index.html が別に出る） | prerender.ts 438 行目の return が appShellRoute を返さない（b2e2be052f が 427 行目の return にだけ足した）。main でも同じ | 第 5 回の「outputMode なし ＋ routesFile」と「prerender: true」の 2 つのビルド。M7 で直しても 615 件とも通る | 既存なし（"routesFile appShell" ほかで検索） |
| B2 | routesFile の末尾に改行があると、空の行が `/` のルートになり、RenderMode.Client にした `/` も prerender される | prerender.ts の routesFile の行（split のあと空の行を除かない）。main でも同じ | 第 5 回の「同じ ＋ routes.txt の末尾に改行」のビルド | 既存なし |
| B3 | 大文字と小文字を区別しない比べ方を固める it が無い | i18n.ts 200・201 行目（JSDoc は 99 行目） | M1：`toLowerCase()` を消しても 249 件とも通る | —（spec の抜け） |
| B4 | JSDoc と本物の食い違い：空文字の約束、`*` の説明、Map の順、renderAngular の戻り値の `destroy`、「ファイルらしいリクエストは飛ばす」のコメント | i18n.ts 13・14、52、64・65 行目。ng.ts 49〜52 行目。app-engine.ts 230・237 行目 | 第 4 回の JSDoc の表（本物の関数に流した） | —（文書） |
| B5 | JSDoc と本物の食い違い（ビルドの側）：PrerenderOutput の例の `appShell`、escapeUnsafeChars の「Unicode のエスケープ」、エンジン用のマニフェストの「Google App Engine」 | prerender.ts 47・51 行目。manifest.ts 54 行目、66・67 行目 | 第 5 回の 8 節 | —（文書） |
| B6 | `ExtractRoutesWorkerData` がどこからも使われず、使っている `hasSsrEntry` を型に持たない | routes-extractor-worker.ts 17・18、24〜26 行目 | ../angular-cli を grep して定義の 1 か所だけ | —（型） |
| B7 | 44129f66a3 の generateRedirectStaticPage は `"` を含むリダイレクト先で属性を壊す | utils.ts 34 行目から | 第 5 回の 4 節（2 つの版に同じ URL） | main の 537a47a482 で直っている（22.2.7 に入っている） |

振る舞いとして確かめたが食い違いではないものも 2 つあります。prerender 中にコンポーネントが資産でない相対 URL を `fetch('/…')` で直接呼ぶと、fetch-patch が受け取った文字列をそのまま元の fetch に回し、`Failed to parse URL from /api/hello` で失敗します（server.ts を起動した設定でも同じ。HttpClient の呼び出しは先に絶対 URL になるので届く）。また、prerender の描画では `inject(REQUEST)` が `null` です。どちらも第 5 回の記録にあります。

## Router の読み残し：UrlTree と RouterState の小道具・provideRouter の残り・Router クラス・読み込みとガードを行で埋める

### [spec と issue を読む：Router の読み残しを固めているテスト](rtl/06-rtl-tests-issues.md) — 7. このシリーズで見つけたもの

どれも 8576f161ae4 の行を読み、本物の @angular/router 22.2.6（ページのデモ・Node）か作業木の spec で確かめたものです。gh で同じ話の issue を探し、見つからなかったものには「既存なし」と書いています。

|   | 何が起きるか | 行 | 確かめ方 | 既存の issue |
| --- | --- | --- | --- | --- |
| A1 | `ParamMap.get` の型は `string \| null` だが、値が空の配列なら `undefined`、数なら数のまま返る | shared.ts 61 行目の型、86〜93 行目の `Array.isArray(v) ? v[0] : v` | [第 1 回](rtl/01-rtl-url-tree.md)のデモと Node。spec なし | 既存なし |
| A2 | `UrlSegment.parameters` の doc の例は `{id: 33}` だが、実際は文字列の `'33'` | url\_tree.ts 370 行目 | 第 1 回のデモと Node | 既存なし |
| A3 | `getInherited` の doc コメントは「既定では親の data を継承しない」と書くが、既定値は v22.0.0 から `'always'` | router\_state.ts 297 行目の既定値、307〜310 行目のコメント | [第 2 回](rtl/02-rtl-router-state.md)のデモ（既定で子が親の params・data・title を受け取る） | 既存なし（ガイドだけ直った） |
| A4 | 根の `ActivatedRoute.url` の初期値は `[UrlSegment('')]`、`snapshot.url` は `[]`。比べるのが snapshot なので、その後も揃わない | router\_state.ts 79 行目と 107 行目 | 第 2 回のデモ（開発・本番） | 既存なし |
| A5 | `withEnabledBlockingInitialNavigation()` と `withDisabledInitialNavigation()` を両方渡すと、順番によらず最初のナビゲーションが走る。警告もエラーも出ない（`provideHttpClient` は同じ種類の重複を調べている） | provide\_router.ts 395〜429 行目（423 行目の `initialNavigation()`）、469〜477 行目 | [第 3 回](rtl/03-rtl-provide-router.md)のデモと Node（開発・本番） | 既存なし |
| A6 | `withDebugTracing` は本番ビルドで provider を 1 つも返さないが、doc に書かれていない（`enableTracing` も同じ）。spec なし | provide\_router.ts 490〜491 行目の doc、515・534〜536 行目 | 第 3 回のデモ（本番のページで 0 個） | 既存なし |
| B1 | `Router.lastSuccessfulNavigation` が書き込める signal のまま返る（`currentNavigation` は `asReadonly()`） | router.ts 378〜380 行目と 177 行目、navigation\_transition.ts 349 行目 | [第 4 回](rtl/04-rtl-router-class.md)のデモと作業木の spec（`.set` が関数） | 既存なし |
| B2 | constructor のコメントは「破棄されると events は complete される」と書くが、`dispose` は `unsubscribe()` を呼ぶ。破棄のあとの `router.events.subscribe()` は `ObjectUnsubscribedError` を投げる。spec なし | router.ts 184〜186 行目のコメント、412〜416 行目 | 第 4 回のデモ | 既存なし |
| B3 | `NoPreloading` の doc は「既定で有効」と書くが、`withPreloading` を渡さなければ `RouterPreloader` 自体が作られない。`RouterPreloader` の doc の「すべてのナビゲーションのイベント」も、実際は `NavigationEnd` だけ | router\_preloader.ts 73 行目、90〜92 行目と 112 行目 | [第 5 回](rtl/05-rtl-load-guard.md)のデモ | 既存なし |
| B4 | `mapToCanActivate` などの `mapTo*` を通す spec が packages/router/test に 1 つもない。`mapToCanMatch` などの doc は、例のファイルに無い `region='CanActivate'` を指す | utils/functional\_guards.ts 28・61・79 行目 | grep と bazel の filter（0 件）、作業木で書き足した spec は通った | 既存なし |
| B5 | export された `loadChildren` の doc は「@angular-devkit/build-angular が使う」と書くが、今の呼び出し元は angular-cli の @angular/ssr（ng-routes.ts） | router\_config\_loader.ts 117〜119 行目 | angular-cli を grep | 既存なし |

もう 1 つ、括弧の中の primary の先頭のセグメントに `:` があると、serialize してから parse し直したとき名前付きの outlet に化ける問題（url\_tree.ts 509〜519 行目）は、8576f161ae4 では再現しますが、本家ではすでに 011675e417d で直っていて、22.2.4 以降（このサイトの 22.2.6 も）には入っています（[第 1 回](rtl/01-rtl-url-tree.md)）。

## application builder の読み残し：options の正規化・結果の形・BundlerContext・キャッシュ・小さなプラグインを行で埋める

### [spec と issue を読む：application builder の読み残しを固めているテスト](abl/06-abl-tests-issues.md) — 6. このシリーズで見つけたもの（食い違いと不具合）

| 章 | 食い違い | 確かめ方 |
| --- | --- | --- |
| [1](abl/01-abl-options.md) | outputMode を書くと appShell は無視される、という警告の文に対し、appShellOptions は作られる | 22.2.7 の ng build（その章の 3 節） |
| [1](abl/01-abl-options.md) | index の output のフォルダが捨てられ、schema.json の説明と合わない | 作業木で it を足すと落ちる（その章の 4 節） |
| [1](abl/01-abl-options.md) | tests/options/output-mode.ts が \_spec.ts で終わらず、1 度も走っていない | 名前を変えて走らせると 2 件とも落ちる |
| [2](abl/02-abl-results.md) | 失敗をはさんだ再ビルドで、その間に消した出力が dist に残る | 作業木で it を足すと落ちる（その章の 5 節） |
| [2](abl/02-abl-results.md) | dev-server の utils.ts 94 行目は外部のコンポーネントのスタイルを「64 桁の 16 進数 + .css」で見分けるが、cda8830710 から ID は xxHash の 16 桁で、NG\_HMR\_CSTYLES=1 の `?ngcomp` の応答がカプセル化されない | 記録の CSS の名前と curl（その章の最後の節） |
| [2](abl/02-abl-results.md) | 同じスタイルが再ビルドのたびに 2 つ届き、古い方が後に残る（開いている #34248 の症状の仕組み） | NG\_HMR\_CSTYLES=1 の記録（その章と第 3 回の 5 節） |
| [3](abl/03-abl-context-post.md) | watch で前の結果に debug ID をもう一度通すと ID が変わり、JS を変えていない回にも main.js が modified になる | 作業木の it と ng serve の記録（その章の 11 節） |
| [3](abl/03-abl-context-post.md) | 読み込みキャッシュを分け合う context が、自分の読まないファイルの変更でも捨てられる（新しい本家の 9534f6287e で直った） | その章の 6 節のデモ |
| [4](abl/04-abl-cache.md) | persistent-load-result-cache.ts の冒頭のコメント（鍵に中身、sha256）が、calculateCacheKey と hash.ts に合わない | git show d11a663e77・cda8830710 |
| [4](abl/04-abl-cache.md) | PersistentLoadResultCache は resolveDir と pluginData を L2 に残さない。put のときに無かった依存は、あとで作られても検証されない | SQLite を L2 にした Node の記録。wasm の onLoad で 2 回目に 2 つのエラー（第 5 回の 5b） |
| [5](abl/05-abl-plugins.md) | angular.json の scripts に入れたパッケージが 3rdpartylicenses.txt に出ない（metafile の入力が仮想のパスだけ） | カウンターに tslib を足した ng build（その章の 10 節） |

第 4 回の 2 つめは、まだどこからも使われていないクラスの話なので、いまの ng build では起きません。第 5 回の wasm の contents の onLoad は、その組み合わせで初めて表に出る前提（`pluginData` が必ずある）です。

## tools/esbuild の読み残し：束ね方の設定・JS の後処理・watch・i18n の差し込み・スタイル・コンパイラプラグインの残りを行で埋める

### [spec と issue を読む：tools/esbuild の読み残しを固めているテスト](esb/07-esb-tests-issues.md) — 6. このシリーズで見つけたもの（食い違いと不具合）

| 章 | 食い違い | 確かめ方 |
| --- | --- | --- |
| [1](esb/01-esb-code-bundle.md) | polyfills のパスに `'` があると、入口の import の文字列が切れて esbuild のエラーになる（743 行目。22.2.7 で直った） | 作業木の it（4 節） |
| [1](esb/01-esb-code-bundle.md) | 142〜146 行目の createCompilerPluginOptions だけ読み込みキャッシュを渡していない（22.2.7 と新しい本家は 72dc9677cf で足した） | 行の読み比べ |
| [2](esb/02-esb-js-transformer.md) | 文字列に ɵ があるだけの node\_modules のファイルは、ワーカーが何も変えないと、先に切った sourceMappingURL のコメントが元のバイト列ごと戻り、sourceMap.vendor が偽でもそのパッケージの元のソースが main.js.map に出る | Node の記録と、偽のパッケージを置いたカウンターの ng build、作業木の it |
| [3](esb/03-esb-watcher.md) | cwd の外のファイルは、396 行目の判定が自分の dirKey を見ていつも偽になり、作ったばかりの購読を 407 行目でやめる。既定の Parcel の道では変更を返さない（22.2.7 で直った） | 本物の createWatcher に操作を当てた記録、作業木の it |
| [4](esb/04-esb-i18n-inliner.md) | ID が `constructor` のメッセージに翻訳が無いと、警告ではなく「Cannot read properties of undefined (reading 'map')」のエラーになり、出力に ID 付きの元の文が残る（reader の 170 行目と、@angular/localize の translations.ts の 62 行目） | 22.2.7 の `inlineTemplateUpdate` を Node から呼んだ記録 |
| [4](esb/04-esb-i18n-inliner.md) | 116 行目の Blob の道は、Piscina がワーカーを起こすのに SharedArrayBuffer を使うので、ふつうは通りようがない | 作業木の it（4 節）、piscina の dist/worker\_pool/index.js の 43 行目 |
| [4](esb/04-esb-i18n-inliner.md) | reader の 19〜20 行目のコメントは「UTF-8 のバイト順は UTF-16 の順と同じ」と言うが、U+E000 以上と補助面の文字で順が違う。エンコーダーも読む側もバイト順で比べるので、結果は合っている | encoder の 48〜50 行目のコメントと読み比べ |
| [5](esb/05-esb-styles.md) | PostCSS の設定に無いプラグインがあると、ng build が esbuild のエラーにならず Node ごと落ちる。落ちないようにしても、理由（プラグイン名）が捨てられ "postcss" を読めないと 3 つ出る | カウンターに .postcssrc.json を置いた ng build、作業木の it（4 節） |
| [5](esb/05-esb-styles.md) | 既定の sass-embedded では Sass のスタックが絶対パスで、`join(cwd, …)` が無いパスを作る。`@use` の連なりの真ん中のファイルが見張られず、ng build --watch で直しても作り直されない | 22.2.7 の `ng build --watch` の記録と、NG\_BUILD\_SASS\_EMBEDDED=0 との比べ |
| [5](esb/05-esb-styles.md) | 関数の名前 `resetSassWorkerPoolCaches`・`shutdownSassWorkerPool` の「ワーカーのプール」は fc5a2ecb14 で消えている。stylesheet-cache-key.ts のコメントの「キャッシュの鍵の頭」は、呼ぶ所が無い | grep |
| [6](esb/06-esb-compiler-rest.md) | Secondary の文脈は onStart の 168〜175 行目で先に返るので、setupWarnings が消えず、毎回の再ビルドで同じ警告（キャッシュを作れない、など）を返す | 永続キャッシュの場所を作れなくした Node の記録（main は 1 回目だけ、polyfills は 3 回とも） |
| [6](esb/06-esb-compiler-rest.md) | component-stylesheets.ts の collectReferencedFiles（231 行目）がインラインのスタイルの参照先を集めない（22.2.7 の 978351af71 で直った） | 行の読み比べ |
