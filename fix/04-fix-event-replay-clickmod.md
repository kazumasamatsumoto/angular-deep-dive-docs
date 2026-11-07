[目次](../README.md) › [見つけた不具合を手元で直す](README.md) › 第 4 回 / 全 10 回

# 同じ修正の取りこぼし：Shift クリックが再生されない

> clickmod を外したコミット（2a915d1912d）が、イベントの委譲の EventDispatcher にだけ clickModSupport: false を渡し、イベントの再生の EventDispatcher に渡していなかった件。spec が別のターゲット（event\_replay\_test）にあって最初は 0 件しか走らなかったこと、domino の上で修飾キーの付いたクリックを作る書き方、1 行の直し。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fix-event-replay-clickmod)

---

2024 年に Angular から clickmod（修飾キー付きのクリックを別の種類として扱う jsaction の機能）を外したコミットは、2 つあった EventDispatcher のうち 1 つにだけ「外す」を渡していました。この回では、その取りこぼしを `git show` と `grep` で見つけ、別のターゲットにあった spec で 0 件しか走らなかった失敗をたどり、domino の上で Shift クリックを作る spec を書いて、1 行で直します。コミットのフックが関係の無い行まで整形したこともそのまま載せます。

読む対象は `packages/core/src/hydration/event_replay.ts`、`packages/core/primitives/event-dispatch/src/` の `event_dispatcher.ts`・`action_resolver.ts`・`event.ts`、`packages/platform-server/test/BUILD.bazel` と `event_replay_spec.ts` です。

1. [1. 準備と流れ](01-fix-overview.md)
2. [2. enum の値](02-fix-enum.md)
3. [3. 消えた修正を戻す](03-fix-defer-immediate.md)
4. **4. 修正の取りこぼし**（この章）
5. [5. 安定しないアプリ](05-fix-defer-error-stable.md)
6. [6. spec を直す](06-fix-spec-assertions.md)
7. [7. 一部しか直らない](07-fix-declare-field.md)
8. [8. 覚えたままの出力](08-fix-elements-outputs.md)
9. [9. 直せても出さない](09-fix-elements-reconnect.md)
10. [10. 出す前の点検](10-fix-before-issue.md)

## 1. 不具合の形

[jsaction の spec と issue の章](../jsaction/12-jsaction-tests-issues.md)の表に載せたものです。ハイドレーションの前（サーバーの HTML が出て、Angular がまだつながっていない間）に Shift や Cmd（Mac 以外では Ctrl）を押しながらクリックすると、そのクリックは早期の契約（[イベントの再生](../platform/14-event-replay.md)の章）に貯まります。ところがハイドレーションのあとの再生で、クリックの種類が `clickmod` に書き換わり、サーバーが付けた `click` の印に当たらないので、ハンドラーが呼ばれません。修飾キーの無いクリックは再生されます。

## 2. 原因の行

📄 `angular/packages/core/src/hydration/event_replay.ts` L220–222 （▶ の行: 220, 222）

```ts
220 ▶   const dispatcher = new EventDispatcher((event) => {
221 │     invokeRegisteredReplayListeners(injector, event, event.currentTarget as Element);
222 ▶   });
```

220 行目で、イベントの再生のための `EventDispatcher` を作ります。222 行目で引数を閉じていて、2 つ目の引数がありません。

📄 `angular/packages/core/primitives/event-dispatch/src/event_dispatcher.ts` L59–63 （▶ の行: 61, 63）

```ts
59 │   constructor(
60 │     private readonly dispatchDelegate: (event: Event, actionName: string) => void,
61 ▶     private readonly clickModSupport = true,
62 │   ) {
63 ▶     this.actionResolver = new ActionResolver({clickModSupport});
```

61 行目、2 つ目の引数 `clickModSupport` の既定は `true` です。63 行目でそれを `ActionResolver`（イベントからどのハンドラーの名前に当てるかを決める部品。[ActionResolver の章](../jsaction/07-jsaction-resolver.md)）に渡します。

📄 `angular/packages/core/primitives/event-dispatch/src/action_resolver.ts` L93–98 （▶ の行: 94–96, 98）

```ts
93 │     if (
94 ▶       this.clickModSupport &&
95 ▶       eventInfoLib.getEventType(eventInfo) === EventType.CLICK &&
96 ▶       eventLib.isModifiedClickEvent(eventInfoLib.getEvent(eventInfo))
97 │     ) {
98 ▶       eventInfoLib.setEventType(eventInfo, EventType.CLICKMOD);
```

📄 `angular/packages/core/primitives/event-dispatch/src/event.ts` L166–172 （▶ の行: 166, 168, 171）

```ts
166 ▶     (isMac && (e as any).metaKey) ||
167 │     // `ctrlKey` is an old DOM API.
168 ▶     (!isMac && (e as any).ctrlKey) ||
169 │     isMiddleClick(e) ||
170 │     // `shiftKey` is an old DOM API.
171 ▶     (e as any).shiftKey
172 │   );
```

1. **94 行目：clickModSupport が true**

   再生の EventDispatcher では既定のまま true なので、次の 2 つを確かめに進みます。
2. **95〜96 行目：click で、修飾されたクリックか**

   `isModifiedClickEvent` は event.ts の 166〜171 行目で、Mac なら metaKey、Mac 以外なら ctrlKey、中ボタン、そして **どの OS でも shiftKey** を見ます。
3. **98 行目：種類を CLICKMOD に書き換える**

   これで、要素の `jsaction` 属性の `click:…` ではなく `clickmod` の名前を探すことになり、見つからずに終わります。

## 3. 取りこぼしを見つける

1. **git show 2a915d1912d を読む**

   見出しは「refactor(core): Remove clickmod support from Angular. (#57201)」（2024-07-30。本体で 18.2.0、パッチの枝の 0c729765a15 で 18.1.4 に入った）、本文は「shift + click などを clickmod にする古い機能で、Angular に足す意味が無いので外す」です。差分は 5 ファイル +16 -13 で、`ActionResolver` に `clickModSupport`（既定 true）を足し、`EventDispatcher` の constructor に 2 つ目の引数（既定 true）を足し、`event_delegation_utils.ts` の `initGlobalEventDelegation` だけを `new EventDispatcher(invokeRegisteredListeners, /** clickModSupport */ false)` にしました。spec は event\_dispatch\_spec.ts に `new MouseEvent('click', {bubbles: true, shiftKey: true})` の確かめを足しています。
2. **そのときの木で、同じ種類のものを数える**

   `git show 2a915d1912d:packages/core/src/hydration/event_replay.ts | grep -n EventDispatcher` で見ると、147 行目に `new EventDispatcher(invokeRegisteredListeners)` があり、2 つ目の引数を渡していません。つまりこのコミットの時点で、`new EventDispatcher` は core の src に 2 つあり、直したのは 1 つだけでした。既定を true にしたので、直さなかった方は前と同じ振る舞いのまま残りました。
3. **今の木で探す：grep -rn 'new EventDispatcher' packages**

   出てくるのは event-dispatch の自分のテスト（`event_dispatcher_test.ts`）の 7 か所と、2 節の event\_replay.ts 220 行目だけです。`false` を渡していた `initGlobalEventDelegation` は、5f356fc0920「refactor(core): Remove global event delegation code. (#57893)」（2024-09、19.0.0）で丸ごと消えました。`git log -S'clickModSupport */ false' -- packages/core/src` もこの 2 つ（足した 2a915d1912d と消した 5f356fc0920）だけを出します。だから今の Angular では、clickmod を外すと決めたコミットがあるのに、残った唯一の EventDispatcher で clickmod が効いています。

> [!TIP]
> **新卒エンジニアへ**
>
> 「機能を外す」「引数を足す」コミットを読んだら、そのコミットが変えた呼び出しの**種類**で木を grep します。差分に出てくるのは直した場所だけで、直さなかった場所は差分に出ません。`git show <コミット>:<パス>` でそのときのファイルを読むと、「当時から取りこぼしていたのか、あとで増えたのか」も分かります。

## 4. spec を足したのに 0 件

spec は `event_replay_spec.ts` の describe `bubbling behavior` に足しました（6 節）。最初は `//packages/platform-server/test:test` で走らせ、デモの「2. まず別のターゲットで」の記録になりました。「Ran 0 of 399 specs / 0 specs, 0 failures」で PASSED です。1 件も走っていません。

📄 `angular/packages/platform-server/test/BUILD.bazel` L77–83 （▶ の行: 77–78, 80）

```python
77 ▶ zoneless_jasmine_test(
78 ▶     name = "event_replay_test",
79 │     data = [
80 ▶         ":event_replay_test_lib",
81 │         "//packages/core/primitives/event-dispatch:contract_bundle_min",
82 │     ],
83 │ )
```

`event_replay_spec.ts` は、同じ BUILD.bazel の `test_lib` から exclude で外されています（[第 1 回](01-fix-overview.md)の 3 節）。77〜78 行目の `zoneless_jasmine_test` の `event_replay_test` が、80 行目で `:event_replay_test_lib` を持ち、その srcs が `event_replay_spec.ts` だけです。名前のとおり zone.js を読み込まない環境で走るターゲットです。だから正しいラベルは `//packages/platform-server/test:event_replay_test` です。jsaction の章でも「0 件に一致しても PASSED になるので、Ran N of 23 specs を見る」と書いていました。足したあとは 24 件になります。

## 5. 走らせて失敗を確かめる

デモの「3. 直す前に走らせる」は「Ran 1 of 24 specs / 1 spec, 1 failure」で、1 つの it に 2 つの失敗が出ます。

1. **Expected spy unknown to have been called once. It was called 0 times.**

   ハイドレーションの前の Shift クリックで、ハンドラーが 1 回も呼ばれなかったこと。1 節の症状です。
2. **TypeError: Cannot read properties of undefined (reading 'shiftKey')**

   次の `expect(onClickSpy.calls.argsFor(0)[0].shiftKey)` で、1 回目の呼び出しが無いので `argsFor(0)` が空の配列になり、`[0]` が undefined になったものです。1 つ目の失敗の続きで、別の不具合ではありません。

## 6. domino の上で Shift クリックを作る

📄 `angular/packages/platform-server/test/event_replay_spec.ts` L588–594 （▶ の行: 588–589, 592–593）

```ts
588 ▶       const doc = getDocument();
589 ▶       prepareEnvironment(doc, ssrContents);
590 │       resetTViewsFor(SimpleComponent);
591 │       const bottomEl = doc.getElementById('bottom')!;
592 ▶       bottomEl.click();
593 ▶       await hydrate(doc, SimpleComponent, {hydrationFeatures});
594 │       expect(onClickSpy).toHaveBeenCalledTimes(1);
```

隣の it は、588〜589 行目でサーバーの HTML を domino（platform-server がサーバーで使う DOM の実装）の文書に入れ、592 行目の `bottomEl.click()` でハイドレーションの前にクリックし、593 行目でハイドレーションします。足した it はこの流れをそのまま使い、592 行目のところだけを「Shift の付いたクリック」に替えます。`click()` は修飾キーを付けられないので、イベントを自分で作ります。

2a915d1912d がブラウザの spec で使った `new MouseEvent('click', {bubbles: true, shiftKey: true})` は、domino では使えません。

📄 `node_modules/domino/lib/MouseEvent.js（angular/domino 4d97473116d。cuts の repo に無いので原文を写した）` L6–15 （▶ の行: 6, 8, 11）

```
 6 ▶ function MouseEvent() {
 7 │   // Just use the superclass constructor to initialize
 8 ▶   UIEvent.call(this);
 9 │ 
10 │   this.screenX = this.screenY = this.clientX = this.clientY = 0;
11 ▶   this.ctrlKey = this.altKey = this.shiftKey = this.metaKey = false;
12 │   this.button = 0;
13 │   this.buttons = 1;
14 │   this.relatedTarget = null;
15 │ }
```

6 行目、domino の `MouseEvent` は引数を 1 つも受け取りません。8 行目で親の constructor を引数なしで呼び、11 行目で `shiftKey` を false にします。だから `new MouseEvent('click', {shiftKey: true})` と書いても、種類も `shiftKey` も入りません。platform-server は domino の型を `globalThis` に入れるので（[platform-server の章](../platform/03-ssr-platform-server.md)）、テストの中の `MouseEvent` がこれを指すことがあります。このテストの中で大域の `MouseEvent` がどれを指すかは確かめていません。どちらであっても、文書から作れば domino のものになります。

📄 `node_modules/domino/lib/Document.js（同じく原文を写した）` L242–251 （▶ の行: 248–249）

```
242 │   createEvent: { value: function createEvent(interfaceName) {
243 │     interfaceName = interfaceName.toLowerCase();
244 │     var name = replacementEvent[interfaceName] || interfaceName;
245 │     var constructor = events[supportedEvents[name]];
246 │ 
247 │     if (constructor) {
248 ▶       var e = new constructor();
249 ▶       e._initialized = false;
250 │       return e;
251 │     }
```

`doc.createEvent('MouseEvent')` は 248 行目で上の constructor を呼び、249 行目で「まだ初期化していない」印を付けます。足した it は次の 3 行でイベントを仕上げます。

1. **const event = doc.createEvent('MouseEvent');**

   domino の文書から MouseEvent を作ります。`doc` は 588 行目の `getDocument()` の文書です。
2. **event.initEvent('click', true, true);**

   種類を click にし、泡立つ（bubbles）・取り消せる、にします。泡立たないと、文書の上で待つ早期の契約まで届きません。
3. **Object.defineProperty(event, 'shiftKey', {value: true});**

   domino では `shiftKey` はただの自分のプロパティなので代入でも入りますが、TypeScript の lib.dom.d.ts の `MouseEvent` では `readonly shiftKey: boolean` なので、`event.shiftKey = true` は型のエラーになります。`Object.defineProperty` なら型のエラーにならずに値を入れられます。domino には `initMouseEvent`（15 個の引数）もあり、それでも入りますが、足した it は確かめたい `shiftKey` だけを入れる形にしました。Shift を選んだのは、2 節の event.ts 171 行目のとおり、Mac かどうかに関係なく見られるからです。Cmd と Ctrl は、event.ts が `navigator.userAgent` から決める `isMac` によって、見る方が変わります。

最後に `bottomEl.dispatchEvent(event)` で送り、ハイドレーションのあと `toHaveBeenCalledTimes(1)` と、渡された Event の `shiftKey` が true のままかを確かめます。

## 7. 最小の直しと、整形のフック

直しは 222 行目を `}, /** clickModSupport */ false);` にすることです。`/** clickModSupport */` の書き方は、2a915d1912d が event\_delegation\_utils.ts で使ったものにそろえました。デモの「4. 直す」の差分の 1 つ目の塊がそれです。

ところが差分には、2 つ目の塊があります。

📄 `angular/packages/core/src/hydration/event_replay.ts` L241–243 （▶ の行: 241）

```ts
241 ▶   for (let i = 0; i < tCleanup.length; ) {
242 │     const firstParam = tCleanup[i++];
243 │     const secondParam = tCleanup[i++];
```

241 行目の `for (let i = 0; i < tCleanup.length; ) {` が、コミットの中では `…length;) {` に変わっています。この行は直していません。コミットのときに pre-commit のフックが `ng-dev format staged` を走らせ、**ファイル全体**を整形したからです（[第 1 回](01-fix-overview.md)の 6 節）。同じ整形で、手で 4 行に書いた呼び出しも `}, /** clickModSupport */ false);` の 1 行にまとめられました。基点の event\_replay.ts をリポジトリの prettier 3.9.6 で `--check` すると警告が出ます。本家のファイルが、もう今の prettier の形になっていないのです。

### 関係の無い差分をどうするか

📄 `angular/contributing-docs/building-and-testing-angular.md` L170–176 （▶ の行: 170–171, 175）

```md
170 ▶ Angular uses [prettier](https://prettier.io) to format the source code.
171 ▶ If the source code is not properly formatted, the CI will fail and the PR cannot be merged.
172 │ 
173 │ You can automatically format your code by running:
174 │ 
175 ▶ - `pnpm ng-dev format changed [shaOrRef]`: format only files changed since the provided
176 │   sha/ref. `shaOrRef` defaults to `main`.
```

contributing-docs に書かれているのは、170〜171 行目の「prettier で整形する。整形されていないと CI が落ち、PR はマージできない」と、175 行目の `pnpm ng-dev format changed` などの整形のコマンドです。「自分が変えていない行の整形の差分をどうするか」の決まりは、contributing-docs には書かれていません。だから決まりに頼らず、選べる形を並べておきます。

| 形 | よいところ | 気をつけること |
| --- | --- | --- |
| そのまま 1 つのコミットに入れ、本文か説明に「241 行目はフックの整形」と書く | フックの出力のとおりで、171 行目の整形の検査に合う形になる | 読む人は「なぜこの行が変わったのか」を必ず聞く。書いておかないと、直しの差分が 1 行でないように見える |
| 整形だけのコミットを別に分ける | 直しのコミットの差分が本当の 1 行になる | コミットが 2 つになる。整形だけのコミットの type をどうするかは、手元では決めていない |
| 241 行目を元に戻してからコミットする（フックを避ける） | 本家の今の行と同じになる | フックは stage したファイル全体を整形するので、ふつうにコミットするとまた変わる。整形の検査がこの行をどう扱うかは確かめていない |

手元の枝 `fix/event-replay-modified-click`（e5405670d77）は、1 つ目の形のまま（整形の行を含む 1 つのコミット）です。本文にはまだ整形のことを書いていません。

## 8. もう一度走らせる・周りのテスト

- デモの「5. 直したあと」：「Ran 1 of 24 specs / 1 spec, 0 failures」で PASSED。
- デモの「6. 周りのテスト」：`//packages/platform-server/test:event_replay_test`（24 specs, 0 failures）・`//packages/platform-server/test:test`（399 specs, 0 failures）・ `//packages/core/primitives/event-dispatch/test:browser_test`（chromium と firefox で、どちらも 111 passed, 0 failed）。4 つとも PASSED です。

`:event_replay_test` は再生の spec 全部、`:test` はハイドレーションの spec で、再生を使う側です。event-dispatch の browser\_test は `EventDispatcher` と `ActionResolver` そのものの spec で、ブラウザで走ります。直したのは呼び出す側の引数だけですが、その引数が効く部品が壊れていないことをここで確かめました。ブラウザのテストなので `--test_arg=--filter` は効かず、全部の it が走ります。

## 9. コミットと、issue を出す前に確かめること

見出しは `fix(core): replay clicks with modifier keys during hydration`。本文（デモの「7. コミット」）は「2a915d1912d は、イベントの委譲の EventDispatcher に clickModSupport: false を渡して clickmod を外した。再生の EventDispatcher は既定（true）のままで、ハイドレーションの前の Shift・Meta（Mac）・Ctrl（ほか）のクリックが clickmod になる。サーバーは click の印しか描かないので、再生されなかった」です。2a915d1912d の type は `refactor` でしたが、このコミットは利用者から見える振る舞い（再生されないクリック）を直すので `fix` です。issue が無いので footer は書いていません。

> [!NOTE]
> **ポイント**
>
> このシリーズでは PR も issue も出しません。下は、出すかどうかを決める前に手元で確かめたことです。

- **同じ報告**：gh で「event replay shift click」「event replay modifier」は issue も PR も 0 件。「clickmod」は #57201・#56193・#56188 の 3 つの PR だけで、どれも clickmod の不具合の報告ではありません。
- **新しい本家**：`../angular-main` でも event\_replay.ts の `new EventDispatcher` は 2 つ目の引数を渡していません。event\_replay.ts は main で 3a0835b3328（2 つのアプリが同じ APP\_ID を使う件）で変わっていますが、cherry-pick は衝突しませんでした（[最終回](10-fix-before-issue.md)）。
- **レビューで聞かれそうなこと**：「241 行目の差分は何か」（7 節）。「clickmod を外した意図どおりか」——2a915d1912d の本文は Angular から外すと書いていて、委譲の側だけを外す理由は書いていません。「shiftKey のクリックを再生したとき、ブラウザの既定の動き（新しいウィンドウで開くなど）とどう関わるか」——これは手元では確かめていません。

## テストと直し方：手元で走らせた記録

> **🧪 fix/event-replay-modified-click：spec・0 件・直す前・直す・直したあと・周り・コミット**
>
> これは手元の複製で走らせた記録の再生です。「2. まず別のターゲットで」は PASSED でも 0 件、「3. 直す前に走らせる」が正しいターゲットでの失敗です。「4. 直す」の差分の 2 つ目の塊が、フックの整形で変わった行です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fix-event-replay-clickmod)

## 聞かれそうな質問

**Q. clickmod は 2024 年に外したのに、なぜ今も効いているのですか？**

2a915d1912d は EventDispatcher の constructor に既定 true の引数を足し、当時の `initGlobalEventDelegation` にだけ false を渡しました。再生の event\_replay.ts の EventDispatcher には渡さず、false を渡した方はあとで 5f356fc0920 が消しました。今の 220〜222 行目は 2 つ目の引数が無いので、event\_dispatcher.ts 61 行目の既定 true になります（2・3 節）。

**Q. 足した spec を走らせたら 0 件で PASSED でした。なぜですか？**

`event_replay_spec.ts` は BUILD.bazel の `test_lib` から exclude で外され、77〜80 行目の `event_replay_test` に入っているからです。`:test` に絞ると「Ran 0 of 399 specs」で PASSED になります（4 節）。

**Q. なぜ `new MouseEvent('click', {shiftKey: true})` を使わないのですか？**

domino の MouseEvent は 6 行目のとおり引数を受け取らず、11 行目で shiftKey を false にするので、辞書が無視されます。`doc.createEvent('MouseEvent')`・`initEvent`・`Object.defineProperty` で作りました（6 節）。

**Q. Cmd や Ctrl でなく Shift を使ったのはなぜですか？**

event.ts の 166〜168 行目は Mac かどうか（`isMac`）で metaKey と ctrlKey を分けますが、171 行目の shiftKey はいつも見るからです。テストの環境の userAgent に左右されません（6 節）。

**Q. 直していない 241 行目が差分に入っているのはなぜですか？**

コミットのときの `ng-dev format staged` がファイル全体を整形したからです。基点の event\_replay.ts は今の prettier の形ではありません。contributing-docs は 170〜171 行目で整形を求めるだけで、関係の無い整形の差分の扱いは書いていません（7 節）。

## 読み終えて

- event\_replay.ts 220〜222 行目の EventDispatcher は 2 つ目の引数が無く、clickModSupport が既定の true。Shift クリックは CLICKMOD になり再生されない。
- 2a915d1912d は 2 つの EventDispatcher の 1 つだけに false を渡した。差分に出ない取りこぼしは、変えた呼び出しの種類で grep し、`git show <コミット>:<パス>` で当時の木を読んで見つける。
- event\_replay\_spec.ts は `:event_replay_test` にある。`:test` では 0 件で PASSED になる。
- domino の MouseEvent は引数を読まない。`createEvent`・`initEvent`・`defineProperty` で作り、OS に関係しない Shift を使う。
- 整形のフックは関係の無い行も変える。contributing-docs に決まりは無いので、差分の説明か、コミットの分け方を自分で決める。

---

← 前: [消えた修正を戻す：@defer (on immediate) と SSR の placeholder](03-fix-defer-immediate.md)  
次: [アプリが安定しない：@error の無い塊の読み込みの失敗](05-fix-defer-error-stable.md) →
