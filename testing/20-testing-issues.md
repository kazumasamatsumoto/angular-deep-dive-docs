[目次](../README.md) › [テストの内側](README.md) › 第 20 回 / 全 20 回

# testing の issue と変更を読む：どこから関わるか

> area: testing のラベルで開いている issue を種類と優先度で分け、この 1 年に @angular/core/testing などへ入ったコミット（getLastFixture、createDirective、RouterTestingHarness.navigate など）の大きさと種類を並べる。issue を手元の spec で再現する手順と、役に立つコメントの書き方。2026-11-01 時点のスナップショット。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/testing-issues)

---

このシリーズで読んできたテストの仕組みが、本家の issue と変更ではどう話題になっているかを見る回です。数字はすべて **2026-11-01 時点のスナップショット**です （open の `area: testing` の issue 20 件と、../angular-main で 2025-11-01 以降に testing 関連のファイルを触ったコミット 27 件）。issue は日々増えたり閉じたりするので、読むときは自分で取り直してください。

この章でしないこと：本家にコメントや PR を出すことは勧めません。ゴールは、issue を読んで「どの回の、どの行の話か」を言えること、手元で確かめた結果を**下書き**にできることです。進め方の 3 段階は [forms-issues](../forms/20-forms-issues.md) と同じで、ラベルと triage の一般的な読み方は [contrib-triage](../contrib/12-contrib-triage.md) で読みました。

1. [1. 全体像](01-testing-overview.md)
2. [2. initTestEnvironment](02-testing-init-environment.md)
3. [3. 後片付け](03-testing-reset-teardown.md)
4. [4. TestBed.inject](04-testing-inject.md)
5. [5. createComponent](05-testing-create-component.md)
6. [6. 入力の渡し方](06-testing-component-bindings.md)
7. [7. createDirective](07-testing-directive-fixture.md)
8. [8. DebugElement と By](08-testing-debug-element.md)
9. [9. detectChanges](09-testing-detect-changes.md)
10. [10. 自動の変更検知](10-testing-auto-detect.md)
11. [11. whenStable](11-testing-when-stable.md)
12. [12. エラーの伝わり方](12-testing-errors.md)
13. [13. fakeAsync](13-testing-fake-async.md)
14. [14. 偽の時計](14-testing-fake-async-scheduler.md)
15. [15. waitForAsync と ProxyZone](15-testing-wait-for-async.md)
16. [16. zone なしの時間](16-testing-zoneless-time.md)
17. [17. effect と signal](17-testing-effects.md)
18. [18. @defer](18-testing-defer.md)
19. [19. RouterTestingHarness](19-testing-router-harness.md)
20. **20. issue と変更を読む**（この章）

## 0. データの取り方

📄 `ターミナル（読み取りだけ）`

```
# 読むだけのコマンド（2026-11-01 に実行）
gh issue list -R angular/angular --label "area: testing" --state open --limit 300 \
  --json number,title,labels,createdAt,updatedAt,comments,reactionGroups
gh issue view 24218 -R angular/angular --json title,body,comments
gh pr list -R angular/angular --search "e7f04bd20c5" --state merged --json number,title,author,mergedAt
gh pr view 71379 -R angular/angular --json body,commits,reviews,comments
gh api repos/angular/angular/pulls/71379/comments   # インラインのレビューコメント（GET）
gh issue view 71210 -R angular/angular --json title,author,comments

# 1 年のコミット（../angular-main、74961c66242）
git -C ../angular-main log --since=2025-11-01 --format="%h|%ad|%an|%s" --date=short -- <testing 関連のパス>
```

`gh issue list` / `gh issue view` / `gh pr list` / `gh pr view` と、`gh api` の GET だけを使っています。コメント・ラベル・レビューを書き込むコマンドは一度も使いません。`--limit 300` で取って 20 件だったので、open の `area: testing` はこの 20 件で全部です（forms の 159 件と比べるとかなり少ない）。

## 1. open の 20 件

| ラベル（area: testing 以外） | 件数 |
| --- | --- |
| `P3` | 6 |
| `type: bug/fix` | 4 |
| `area: docs` | 3 |
| `freq2: medium` | 3 |
| `P4` | 3 |
| `cross-cutting: standalone` | 2 |
| `cross-cutting: types` | 2 |
| `feature` | 2 |
| `feature: under consideration` | 2 |
| `freq1: low` | 2 |
| `hotlist: google` | 2 |
| `area: common` | 1 |
| `area: common/http` | 1 |
| `area: elements` | 1 |
| `area: server` | 1 |
| `breaking changes` | 1 |
| `bug` | 1 |
| `core: di` | 1 |
| `doc-topic: reference` | 1 |
| `docsarea: testing` | 1 |
| `effort3: weeks` | 1 |
| `freq3: high` | 1 |
| `needs: clarification` | 1 |
| `needs: discussion` | 1 |
| `state: confirmed` | 1 |
| `type: use-case` | 1 |
| （P0〜P5 の優先度が 1 つも無い） | 11 |

- 優先度が付いているのは 9 件で、`P3` が 6、`P4` が 3。`P0`〜`P2` は 1 件もありません。残りの 11 件は優先度が無いままです。
- 作られた年は 2016 年から 2026 年まで散らばっていて、いちばん古いのは #13066（2016-11-23）。`state: confirmed`（チームが再現を確かめた）は #22449 の 1 件だけです。
- リアクションがいちばん多いのは #22797（子コンポーネントを自動で偽物にしてほしい、71）、次が #48432（standalone に overrideComponent が効かない、35）。コメントが多いのは #24218（17）と #65665（12）です。
- 20 件のコメント 95 件のうち 1 件は、GitHub 上で `spam` として折りたたまれていました（#68797。外部のサービスの自動の書き込み）。役に立たないコメントは隠されます。

> **🧪 DEMO — 20 件を並べ替える（2026-11-01 のスナップショット）**
>
> データは章のコードに定数として埋め込んであり、GitHub には問い合わせません。番号は github.com の issue を新しいタブで開きます。「関係する回」は issue の主題がどの仕組みに当たるかで、原因がその回の行だと断定するものではありません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-issues)

### このシリーズで読んだ行で説明できるもの

- **#24218**（TestBed が非同期の初期化を待たない）：[第 4 回](04-testing-inject.md)の「テストモジュールはいつ作られるか」の話です。3 節で再現します。
- **#47505**（クリックのハンドラのエラーでテストが落ちない）：[第 12 回](12-testing-errors.md)の `TestBedApplicationErrorHandler` の話です。issue は 2022 年の zone.js のテストでの報告（スタックに zone.js が出ている）なので、v22 の既定の zoneless で同じことが起きるかを先に確かめる issue です。
- **#35215**（根の要素の id をバインドすると、前のテストの要素が残る）：[第 5 回](05-testing-create-component.md)で引いた `dom_test_component_renderer.ts` 41 行目が、古い根の要素を `[id^=root]` で探して消しています。id が `root0` などから書き換えられると、この選択子に当たりません。
- **#13066・#22449・#49777**（`DebugElement` の順番と型）：[第 8 回](08-testing-debug-element.md)。

## 2. 1 年のコミット 27 件

../angular-main（74961c66242、2026-10-30）で、2025-11-01 以降に testing 関連のファイル（`*/testing/` や `test_bed*` など）を触ったコミットです。種類（type）と作者を数えます。作者は名前だけを書き、チームの人か外の人かはここでは分けません。

| type | 件数 |
| --- | --- |
| `refactor` | 9 |
| `feat` | 6 |
| `build` | 4 |
| `fix` | 4 |
| `ci` | 2 |
| `docs` | 2 |

| 作者 | 件数 |
| --- | --- |
| Matthieu Riegler | 13 |
| Kristiyan Kostadinov | 5 |
| Andrew Scott | 4 |
| brysonbw | 2 |
| Alex Rickabaugh | 1 |
| Angular Robot | 1 |
| Alan Agius | 1 |

- `refactor` が 9 件でいちばん多く、`feat` 6・`fix` 4・`build` 4・`ci` 2・`docs` 2 と続きます。`test:` の type はこの 27 件の中にはありません。
- `feat` の 6 件のうち 5 件がテストの API そのものです：`TestBed.getFixture`（246a984a5df）→ 2 週間後に `getLastFixture` へ改名（dc3131c6395）、`TestBed.createDirective`（05c4d5a8354。[第 7 回](07-testing-directive-fixture.md)）、`RouterTestingHarness.navigate`（e7f04bd20c5 と 63e21a76ded。[第 19 回](19-testing-router-harness.md)）。
- 行数が 100 行以下のコミットは 9 件です。逆に ecbc89b465c（175 ファイル）や 6270bba056c（483 ファイル）のような全体の書き直しが、行数の大半を占めます。
- PR に付く `area: testing` のラベルはほとんど使われていません。マージ済みで `area: testing` が付いた PR を取ると 26 本で、そのうち 24 本が 2015〜2017 年でした。#71379（navigate）は `area: router` でした。testing の変更を探すときは、ラベルではなく `git log -- packages/core/testing` のようにパスで探します。

> **🧪 DEMO — 27 件を type で絞り込む**
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/testing-issues)

### 外から入った変更の例：#71379 RouterTestingHarness.navigate

1. **issue #71210（2026-10-06、gabrielmethot）**

   「`navigateByUrl` は文字列しか受け取らない。`Router.navigate` と同じ `navigate` が欲しい。PR を出してもよい」。同じ日に atscott が「👍 agreed. Go ahead and send a pr over」と返しています。**先に方針の合意がある**状態です。
2. **PR #71379（2026-10-15、brysonbw）**

   issue を書いた人とは別の人が PR を出しました（issue の作者は 10-16 に「重複を避けるために控える」とコメント）。本文には「今の振る舞い」「新しい振る舞い」と、共通部分を `runNavigation` にまとめた理由、既存の `navigateByUrl` の使い方は変えていないこと、が書かれています。+165 / −7、5 ファイル（ソース・spec・golden・ドキュメント 2 つ）。
3. **レビュー（10-16〜10-25）**

   JeanMeche が、extras を飛ばして型を渡せるオーバーロード、ドキュメントの例（fragment を実際に使うコンポーネントに）、テストの範囲をインラインで指摘しました。その中の「ガードで止まると前のコンポーネントが返るのは古い値ではないか」という指摘（`AGENT:` で始まるコメント）に、atscott が「意図した振る舞い。ガードが止めても Router は今のビューを壊さないので、それを返せば利用者が今のページに留まったことを確かめられる」と答え、「ガードやリダイレクトは `runNavigation` で共通なので `navigateByUrl` の spec で足りる。足すのは新しいオーバーロードの振り分けだけ」とテストの範囲を絞りました。最後に「reviewed-for: public-api」の承認が付いています（公開 API の golden が変わるため。[contrib-public-api](../contrib/08-contrib-public-api.md)）。
4. **マージ（10-28）**

   PR の 3 コミットは、main では 2 コミット（e7f04bd20c5 と 63e21a76ded）になっていました。第 19 回で読んだ `runNavigation` のドキュメントの「ガードで止まったら今のコンポーネントを返す」は、このレビューのやりとりから書き足されたものです。

> [!NOTE]
> **ポイント**
>
> この 1 本から言えるのは、「issue で方針の合意 → 小さく閉じた PR（ソース・spec・golden・ドキュメントをそろえる）→ レビューの指摘に応える」の順で入った、ということまでです。PR の流れ全体とレビューのラベルは [contrib-pr-flow](../contrib/10-contrib-pr-flow.md) です。

## 3. #24218 を手元で再現する

2018 年の issue です。本文は「APP\_INITIALIZER の Promise が終わる前にテストが走る。アプリと同じ約束にしてほしい」、最初のコメントの回避策は `await TestBed.get(ApplicationInitStatus).donePromise`（今は `TestBed.inject`）です。2019〜2023 年のコメントは「まだ起きる」「回避策が効かない」「ドキュメントに無い」が続いていて、`authorAssociation` が `MEMBER` のコメントは 1 件もありません。

### 行で説明する

1. **テストモジュールは最初の inject で作られる**

   `TestBed.inject` は `testModuleRef` の getter を通り、まだ無ければ `TestBedCompiler.finalize()` を呼びます（[ngmodule-testbed](../ngmodule/17-ngmodule-testbed.md) で引いた `test_bed.ts` 830〜835 行目、[第 4 回](04-testing-inject.md)）。
2. **finalize は runInitializers を呼ぶだけ**

   `finalize()` は NgModuleRef を作った直後に `ApplicationInitStatus.runInitializers()` を呼びます（ngmodule-testbed で引いた `test_bed_compiler.ts` 449〜451 行目）。`runInitializers` は初期化関数を呼んで Promise を `Promise.all` に渡し、終わったら `done = true` にします（[router-initial-navigation](../router/06-router-initial-navigation.md) で引いた `application_init.ts` 239〜275 行目）。**`finalize()` はその `donePromise` を待たずに 459 行目で NgModuleRef を返します。**
3. **アプリは待つ**

   本物の `bootstrap` は `PendingTasks` に 1 つ足してから `runInitializers()` を呼び、`initStatus.donePromise.then(...)` の中でコンポーネントを作ります（router-initial-navigation で引いた `bootstrap.ts` 138〜144 行目）。「アプリでは待つのにテストでは待たない」が、この issue の言う「約束が守られていない」の正体です。

📄 `angular/packages/core/test/application_ref_spec.ts` L642–658 （▶ の行: 645, 647, 651, 655–656）

```ts
642 │     it('should wait for asynchronous app initializers', waitForAsync(async () => {
643 │       const {promise, resolve} = Promise.withResolvers<any>();
644 │       let initializerDone = false;
645 ▶       setTimeout(() => {
646 │         resolve(true);
647 ▶         initializerDone = true;
648 │       }, 1);
649 │ 
650 │       const moduleType = await createModule([
651 ▶         {provide: APP_INITIALIZER, useValue: () => promise, multi: true},
652 │       ]);
653 │       const moduleFactory = await compileNgModuleFactory(defaultPlatform.injector, {}, moduleType);
654 │ 
655 ▶       defaultPlatform.bootstrapModuleFactory(moduleFactory).then((_) => {
656 ▶         expect(initializerDone).toBe(true);
657 │       });
658 │     }));
```

アプリの側には「待つ」ことを固定する spec があります（`application_ref_spec.ts` の `describe('bootstrapModuleFactory')`）。645〜648 行目で 1 ms 後に解決する Promise を作り、651 行目の初期化関数で返し、655〜656 行目で bootstrap が終わった時点で `initializerDone` が `true` であることを見ます。TestBed の側には、非同期の初期化を扱う spec がありません。あるのは同期の初期化の 1 本だけです。

📄 `angular/packages/core/test/test_bed_spec.ts` L864–876 （▶ の行: 868–869, 874–875）

```ts
864 │   it('should run `APP_INITIALIZER` before accessing `LOCALE_ID` provider', () => {
865 │     let locale: string = '';
866 │     @NgModule({
867 │       providers: [
868 ▶         {provide: APP_INITIALIZER, useValue: () => (locale = 'fr-FR'), multi: true},
869 ▶         {provide: LOCALE_ID, useFactory: () => locale},
870 │       ],
871 │     })
872 │     class TestModule {}
873 │ 
874 ▶     TestBed.configureTestingModule({imports: [TestModule]});
875 ▶     expect(TestBed.inject(LOCALE_ID)).toBe('fr-FR');
876 │   });
```

868 行目の初期化関数は同期で `locale` を書き換えるので、875 行目の最初の `inject` の時点で済んでいます。Promise を返す初期化関数では、この形は成り立ちません。

### このサイトの ng test で確かめた

📄 `src/verify-e/issue.spec.ts（要点。確かめたあと消した）`

```
@Injectable({providedIn: 'root'})
class Config {
  readonly seenDone = state.done;   // 作られた瞬間に初期化が済んでいたか
}

it('async initializer', async () => {
  TestBed.configureTestingModule({
    providers: [
      provideAppInitializer(() => new Promise<void>((res) =>
        setTimeout(() => { state.done = true; res(); }, 20))),
    ],
  });
  const status = TestBed.inject(ApplicationInitStatus);
  // status.done → false
  const f = TestBed.createComponent(Cmp);       // Cmp は inject(Config) して seenDone を表示
  await f.whenStable();
  // f.nativeElement.innerHTML → <p>false</p>、status.done → false
  await status.donePromise;
  // status.done → true
  // 起きた順: "Config ctor (done=false)" → "initializer resolved"
});
```

このサイトの `ng test`（Vitest + jsdom、zoneless、@angular/core 22.1.6）で、**今も再現しました**。最初の `inject` の直後は `done` が `false`、root のサービスは初期化が済む前に作られ（`Config ctor (done=false)` → `initializer resolved` の順）、`await fixture.whenStable()` も初期化を待ちませんでした（画面は `<p>false</p>`）。`await status.donePromise` のあとで `done` が `true` になり、最初のコメントの回避策は今も効きます。`whenStable()` が待たないのは、TestBed の経路では初期化の Promise が `PendingTasks` に入らないからです（アプリでは 3 番目の手順の `bootstrap.ts` 139 行目が足す）。

### spec の下書き（../angular には足していない）

📄 `下書き（../angular には足していない・走らせていない）`

```
// packages/core/test/test_bed_spec.ts の describe('TestBed')（646 行目）の中、
// it('should run `APP_INITIALIZER` before accessing `LOCALE_ID` provider')（864 行目）のすぐ後に置く想定。
// import に ApplicationInitStatus と provideAppInitializer を足す。
it('does not wait for an async `APP_INITIALIZER` before `inject` (#24218)', async () => {
  let resolveInit!: () => void;
  TestBed.configureTestingModule({
    providers: [provideAppInitializer(() => new Promise<void>((r) => (resolveInit = r)))],
  });

  const status = TestBed.inject(ApplicationInitStatus);
  // 今の振る舞い: runInitializers() は呼ばれるが、誰も donePromise を待たない
  expect(status.done).toBe(false);

  resolveInit();
  await status.donePromise;
  expect(status.done).toBe(true);
});
```

「直ってほしい振る舞い」ではなく「今の振る舞い」を固定する spec にしています。直すかどうか、直すならどう直すか（`TestBed.inject` を非同期にはできないので、別の API にするのか、ドキュメントで回避策を示すのか）は、まだ誰も決めていないからです。足す場所の目印の 864 行目の it と、アプリの側の 622 行目の it は、どちらも名前に `APP_INITIALIZER` を含むので、次のフィルタで一緒に選べます。

📄 `ターミナル（../angular で実行）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/core/test:test --test_output=all \
  --test_arg=--filter="APP_INITIALIZER"

# 2026-11-01 の出力（下書きを足す前）
Ran 0 of 1399 specs   # shard 1
Ran 0 of 1399 specs   # shard 2
Ran 1 of 1400 specs   # shard 3
Ran 1 of 1400 specs   # shard 4
//packages/core/test:test                                  PASSED in 1.5s
```

下書きを足す前の今は 0 + 0 + 1 + 1 = 2 本でした（test\_bed\_spec.ts の 864 行目と application\_ref\_spec.ts の 622 行目）。下書きの名前にも `APP_INITIALIZER` が入っているので、手元のブランチで足せば 3 本になるはずの数で、それを確かめるのが最初の一歩です。0 本で PASSED になっていないことも必ず見ます（[forms-overview](../forms/01-forms-overview.md)）。

### コメントの下書き（投稿しない）

📄 `コメントの下書き（#24218 向け。英語。投稿しない）`

```
Checked against the v22.2.0-next.7 sources (8576f161ae4) and with
@angular/core 22.1.6 in a Vitest + jsdom project (zoneless, no zone.js).

The behavior described in this issue still reproduces:
- `TestBed.inject(ApplicationInitStatus).done` is `false` right after the first
  `TestBed.inject()`, while an async initializer is still pending.
- Root services created at that point see the pre-initializer state.
- `await fixture.whenStable()` does not wait for the initializer either
  (the initializer promise is not tracked as a pending task in TestBed).
- The workaround from the first comment still works:
  `await TestBed.inject(ApplicationInitStatus).donePromise;`

Where this comes from: `TestBedCompiler.finalize()` calls
`ApplicationInitStatus.runInitializers()` synchronously and returns the module ref
without awaiting `donePromise`, whereas `bootstrap()` adds a pending task and
chains on `initStatus.donePromise` before bootstrapping components.

A spec that pins down the current behavior (could live next to
"should run `APP_INITIALIZER` before accessing `LOCALE_ID` provider" in
packages/core/test/test_bed_spec.ts):

  (spec here)
```

- **どの版で確かめたか**：ソースのコミット（`8576f161ae4`）と、確かめたパッケージの版（22.1.6）を分けて書く。
- **今も起きるか**：2018 年の issue なので、v22 の zoneless の既定で再現するかがいちばん役に立つ情報です。
- **原因の行**：`finalize()` と `bootstrap()` の違いまで。「こう直すべき」とは書かない。
- **書かないこと**：「まだ直っていない」「いつ直りますか」だけのコメント。この issue の 2018〜2021 年のコメントの多くがそれです。

## 4. どう関わるか：3 つの段階を testing に当てはめる

1. **① 説明できる領域を作る**

   このシリーズで、`TestBed`・`ComponentFixture`・effect・@defer・`RouterTestingHarness` の各 API が、どの行でどう動くかを読みました。issue を開いたら、まず 1 節の表の「関係する回」を決め、その回の行で説明できるかを試します。
2. **② 手元で再現し、コメントを下書きする**

   この回の #24218 のように、このサイトの ng test（読者の手元と同じ Vitest の環境）と ../angular の bazel test（本家の spec の形）の両方で確かめられます。2016〜2020 年の issue は、v22 で振る舞いが変わっているものがあり、「再現しない」も役に立つ情報です。
3. **③ 話がまとまってから小さく**

   #71379 のように、issue で方針の合意があり、ソース・spec・golden・ドキュメントがそろった小さな変更が入っています。#24218 のように振る舞いを変える話は、方針が決まるまで PR にしません。方針が要らない候補としては、[第 18 回](18-testing-defer.md)で見た「必ず通ってしまう」アサーションがあります。

📄 `angular/packages/core/test/defer_fixture_spec.ts` L74–105 （▶ の行: 99–100, 102, 104）

```ts
 74 │   it('should defer load immediately on playthrough', async () => {
 75 │     @Component({
 76 │       selector: 'defer-comp',
 77 │       imports: [SecondDeferredComp],
 78 │       template: `
 79 │         <div>
 80 │           @defer (when shouldLoad) {
 81 │             <second-deferred-comp />
 82 │           }
 83 │         </div>
 84 │       `,
 85 │     })
 86 │     class DeferComp {
 87 │       shouldLoad = false;
 88 │     }
 89 │ 
 90 │     TestBed.configureTestingModule({
 91 │       imports: [DeferComp, SecondDeferredComp],
 92 │       providers: COMMON_PROVIDERS,
 93 │     });
 94 │ 
 95 │     const componentFixture = TestBed.createComponent(DeferComp);
 96 │     const el = componentFixture.nativeElement as HTMLElement;
 97 │     expect(el.querySelectorAll('.more').length).toBe(0);
 98 │ 
 99 ▶     componentFixture.componentInstance.shouldLoad = true;
100 ▶     componentFixture.detectChanges();
101 │ 
102 ▶     await componentFixture.whenStable(); // await loading of deps
103 │ 
104 ▶     expect(el.querySelector('.more')).toBeDefined();
105 │   });
```

104 行目の `expect(el.querySelector('.more')).toBeDefined()` は、`querySelector` が `null` を返しても通ります（`toBeDefined` は `undefined` でないことだけを見る）。これを `not.toBeNull()` にしたとき通るかどうかは、まだ確かめていません。手元のブランチで変えて走らせ、通るなら「テストを強くする」小さな変更の候補、落ちるなら「99〜102 行目では本体が描かれていない」という発見で、どちらでも説明できることが 1 つ増えます。

## テストと直し方

この回の「テスト」は 3 節の下書きの spec です。足す場所は `packages/core/test/test_bed_spec.ts` の `describe('TestBed')`（646 行目）の中、864 行目の it の後ろで、走らせるコマンドは 3 節のとおりです（今は 2 本）。

- #24218 の行は `test_bed_compiler.ts` の `finalize()`（ngmodule-testbed で引いた 427〜460 行目）と `bootstrap.ts` の初期化の待ち方（router-initial-navigation で引いた 137〜147 行目）。読み方は[第 4 回](04-testing-inject.md)。
- #47505 の行は `TestBedApplicationErrorHandler` と `fixture.ts` の `AbstractFixture` のコンストラクタの `onError` の投げ直し。読み方は[第 12 回](12-testing-errors.md)。
- #35215 の行は `dom_test_component_renderer.ts` の `removeAllRootElementsImpl`（41 行目の `[id^=root]`）。読み方は[第 5 回](05-testing-create-component.md)。
- 手元のブランチで spec を足す → 走らせる → 実装を一時的に壊して落ちることを確かめる → 戻す、の手順は [contrib-writing-a-test](../contrib/07-contrib-writing-a-test.md)。../angular の作業ツリーを汚したまま他の作業をしないこと（この章を書く間も `git status` は変えていません）。

## 聞かれそうな質問

**Q. area: testing の issue は少ないのに、直されていないのはなぜですか？**

20 件のうち 11 件は優先度が付いておらず、付いている 9 件も `P3` と `P4` だけです。2 件の `feature: under consideration`（#22797・#37178）のように「するかどうか」から決まっていないものもあります。#24218 のように、原因は行で説明できても、直すと `TestBed.inject` の同期の約束を変えることになるものもあります。数が少ないことと、すぐ直せることは別です。

**Q. テストの API への変更は誰が入れていますか？**

この 1 年の 27 件では、Matthieu Riegler が 13 件、Kristiyan Kostadinov が 5 件、Andrew Scott が 4 件、brysonbw が 2 件でした（2 節）。新しい API（`getFixture` / `getLastFixture`・`createDirective`・`navigate`）の 5 件のうち、`navigate` の 2 件は issue で方針が決まったあとの PR から入っています。所属は数えていません。

**Q. 古い issue に「今も起きます」と書くのは役に立ちますか？**

「どの版・どのコミットで、どんな最小の spec で起きたか」が付いていれば役に立ちます。3 節のコメントの下書きは、版（8576f161ae4 と 22.1.6）・再現の手順・原因の行の 3 つをそろえました。それが無い「まだ起きる」だけのコメントは、#24218 にすでに何件もあり、情報を足しません。

**Q. issue を書いた人が「PR を出したい」と言っていたら、別の人が出してよいですか？**

#71210 では、作者が「PR を出してもよい」と書き、別の人が先に PR を出し、作者は「重複を避けるために控える」とコメントしました（2 節）。結果としてマージはされましたが、先にその issue で「取りかかってよいか」を聞くほうが、重複の作業を避けられます。この章では、自分から PR を出すことは勧めていません。

## 読み終えて

- open の `area: testing` は 20 件。優先度は `P3`・`P4` の 9 件だけで、11 件は無い。いちばん古いのは 2016 年
- この 1 年の testing 関連のコミット 27 件は refactor が最多。新しい API は `getLastFixture`・`createDirective`・`RouterTestingHarness.navigate`
- #71379 は「issue で合意 → ソース・spec・golden・ドキュメントをそろえた小さな PR → レビューの指摘に応える」の順で入った
- #24218 は今も再現する。原因は `finalize()` が `donePromise` を待たないこと。今の振る舞いを固定する spec とコメントを下書きにした（投稿しない）

---

← 前: [RouterTestingHarness：ルーティングを本物の Router でテストする](19-testing-router-harness.md)  
次: [アニメーションの全体像：core の animate.enter / leave と @angular/animations](../animations/01-animations-overview.md) →
