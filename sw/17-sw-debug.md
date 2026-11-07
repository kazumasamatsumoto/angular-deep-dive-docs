[目次](../README.md) › [Service Worker の内側](README.md) › 第 17 回 / 全 20 回

# デバッグのページ：/ngsw/state と DebugHandler

> ngsw/state を開くと出る文字列を作る DebugHandler（debug.ts）と、Driver の debugState・debugVersions・debugIdleState（状態と理由・版ごとのタブ・IdleScheduler の列をメモリから読む。AppVersion と IdleScheduler 自身は debug の関数を持たない）、エラーを 100 件ずつ 2 つの配列に貯める log。/ngsw/state は初期化を起こさないので起こし直した直後は空に近いこと、本番で困ったときにこのページで何が読めるか。ページの上で本物のワーカーのデバッグのページを v1 → v2 → オフラインで並べて読むデモ。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sw-debug)

---

ワーカーが登録されたサイトで `/ngsw/state` を開くと、「NGSW Debug Info:」で始まる文字だけのページが出ます。この章では、その文字列を 1 行ずつ、どの関数のどの行が書いているかを追います。Driver の状態、版とタブの割り当て、アイドルの仕事の列、そしてエラーを貯めておく `log` の 4 つです。最後に、本物の `ngsw-worker.js` を偽物のブラウザの上で動かし、v1 → v2 → オフラインの各段のページを並べて読みます。

読む対象は `packages/service-worker/worker/src/debug.ts`（127 行の `DebugHandler`）と、`worker/src/driver.ts` の `debugState`・`debugVersions`・`debugIdleState`・`onMessageError`・`onUnhandledRejection` です。

1. [1. 全体像](01-sw-overview.md)
2. [2. Generator](02-sw-config-generator.md)
3. [3. ビルド](03-sw-cli-build.md)
4. [4. 登録](04-sw-register.md)
5. [5. Driver の起動](05-sw-driver-lifecycle.md)
6. [6. fetch の横取り](06-sw-driver-fetch.md)
7. [7. 版とタブ](07-sw-versions.md)
8. [8. アセット](08-sw-asset-groups.md)
9. [9. ハッシュ](09-sw-hash-integrity.md)
10. [10. データ](10-sw-data-groups.md)
11. [11. 小さな DB](11-sw-database.md)
12. [12. 更新の確認](12-sw-update-check.md)
13. [13. SwUpdate](13-sw-swupdate.md)
14. [14. アイドルと掃除](14-sw-idle-cleanup.md)
15. [15. 壊れたとき](15-sw-safe-mode.md)
16. [16. プッシュ](16-sw-push.md)
17. **17. デバッグ**（この章）
18. [18. ワーカーのテスト](18-sw-testing-harness.md)
19. [19. アプリ側のテスト](19-sw-testing-app.md)
20. [20. issue と PR を読む](20-sw-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> ブラウザの開発者ツールの Application タブでもワーカーの状態は見えますが、それはブラウザから見た「登録」と「Cache Storage の中身」です。`/ngsw/state` は、ワーカーの中の `Driver` が**自分のメモリの中の状態**を文字にしたもので、どの版をどのタブに割り当てたか、何に失敗したかはここでしか読めません。

## 1. 入口：/ngsw/state だけは無条件に答える

`/ngsw/state` への fetch を拾うのは `Driver.onFetch` です（[第 6 回](06-sw-driver-fetch.md)の 1 節で引用）。パスはコンストラクタで `adapter.parseUrl('ngsw/state', registration.scope)` として作るので、スコープが `/foo/bar/` なら `/foo/bar/ngsw/state` になります。`onFetch` の中の順番は「`ngsw-bypass` の印 → `/ngsw/state` → `SAFE_MODE` → mixed content → `only-if-cached`」です。つまりデバッグのページは、ワーカーが `SAFE_MODE`（何も横取りしない状態、[第 15 回](15-sw-safe-mode.md)）に下がっていても出ます。そこで呼ぶのは `event.respondWith(this.debugger.handleFetch(req))` だけで、`handleFetch`（初期化を待つ・版を割り当てる・アイドルを起こす）は通りません。

`this.debugger` は、コンストラクタの終わりで `new DebugHandler(this, this.adapter)` として作られ、同じものが `IdleScheduler` にも渡されます（[第 5 回](05-sw-driver-lifecycle.md)の 3 節）。`Driver` は自分自身を `Debuggable`（`debugState`・`debugVersions`・`debugIdleState` の 3 つを持つ、という型）として渡しています。

## 2. DebugHandler：ページの文字列を 3 つに分けて作る

📄 `angular/packages/service-worker/worker/src/debug.ts` L12–34 （▶ の行: 12–13, 27–28, 31–32）

```ts
12 ▶ const SW_VERSION = '0.0.0-PLACEHOLDER';
13 ▶ const DEBUG_LOG_BUFFER_SIZE = 100;
14 │ 
15 │ interface DebugMessage {
16 │   time: number;
17 │   value: string;
18 │   context: string;
19 │ }
20 │ 
21 │ export class DebugHandler implements DebugLogger {
22 │   // There are two debug log message arrays. debugLogA records new debugging messages.
23 │   // Once it reaches DEBUG_LOG_BUFFER_SIZE, the array is moved to debugLogB and a new
24 │   // array is assigned to debugLogA. This ensures that insertion to the debug log is
25 │   // always O(1) no matter the number of logged messages, and that the total number
26 │   // of messages in the log never exceeds 2 * DEBUG_LOG_BUFFER_SIZE.
27 ▶   private debugLogA: DebugMessage[] = [];
28 ▶   private debugLogB: DebugMessage[] = [];
29 │ 
30 │   constructor(
31 ▶     readonly driver: Debuggable,
32 ▶     readonly adapter: Adapter,
33 │   ) {}
34 │ 
```

12 行目の `SW_VERSION` は、パッケージを作るときに版の番号に置き換わる印です（tools/bazel/npm\_packages.bzl の置き換えの表）。サイトの node\_modules の配布物では `var SW_VERSION = "22.1.6"` になっていて、テストのハーネスで TypeScript をそのまま動かすと `0.0.0-PLACEHOLDER` のままです。13 行目の `DEBUG_LOG_BUFFER_SIZE` と 27〜28 行目の 2 つの配列が `log` の入れ物です（4 節）。31〜32 行目で、`Driver`（`Debuggable`）と `Adapter` を受け取ります。`Adapter` は時刻（`adapter.time`）と Response を作るのに使います。

📄 `angular/packages/service-worker/worker/src/debug.ts` L35–47 （▶ の行: 36–39, 44–47）

```ts
35 │   async handleFetch(req: Request): Promise<Response> {
36 ▶     const [state, versions, idle] = await Promise.all([
37 ▶       this.driver.debugState(),
38 ▶       this.driver.debugVersions(),
39 ▶       this.driver.debugIdleState(),
40 │     ]);
41 │ 
42 │     const msgState = `NGSW Debug Info:
43 │ 
44 ▶ Driver version: ${SW_VERSION}
45 ▶ Driver state: ${state.state} (${state.why})
46 ▶ Latest manifest hash: ${state.latestHash || 'none'}
47 ▶ Last update check: ${this.since(state.lastUpdateCheck)}`;
```

1. **36〜40 行目：Driver に 3 つを聞く**

   `Promise.all` で `debugState()`・`debugVersions()`・`debugIdleState()` を同時に呼びます。どれも `Driver` のフィールドを読むだけの関数です（3 節）。DB や Cache Storage は読みません。
2. **44〜47 行目：1 つ目のかたまり**

   版の番号、`Driver state: NORMAL ((nominal))` の形の状態とその理由、最新の `ngsw.json` のハッシュ（無ければ `none`）、最後に更新を確かめてからの時間です。

📄 `angular/packages/service-worker/worker/src/debug.ts` L49–76 （▶ の行: 51, 53, 58–59, 61, 64–65, 68, 74）

```ts
49 │     const msgVersions = versions
50 │       .map(
51 ▶         (version) => `=== Version ${version.hash} ===
52 │ 
53 ▶ Clients: ${version.clients.join(', ')}`,
54 │       )
55 │       .join('\n\n');
56 │ 
57 │     const msgIdle = `=== Idle Task Queue ===
58 ▶ Last update tick: ${this.since(idle.lastTrigger)}
59 ▶ Last update run: ${this.since(idle.lastRun)}
60 │ Task queue:
61 ▶ ${idle.queue.map((v) => ' * ' + v).join('\n')}
62 │ 
63 │ Debug log:
64 ▶ ${this.formatDebugLog(this.debugLogB)}
65 ▶ ${this.formatDebugLog(this.debugLogA)}
66 │ `;
67 │ 
68 ▶     return this.adapter.newResponse(
69 │       `${msgState}
70 │ 
71 │ ${msgVersions}
72 │ 
73 │ ${msgIdle}`,
74 ▶       {headers: this.adapter.newHeaders({'Content-Type': 'text/plain'})},
75 │     );
76 │   }
```

1. **49〜55 行目：版ごとのかたまり**

   51 行目で `=== Version <ハッシュ> ===`、53 行目でその版を使っているタブの ID を `, ` でつなぎます。
2. **57〜61 行目：アイドルの仕事**

   58 行目の「Last update tick」は最後に `idle.trigger()` が呼ばれた時刻（リクエストが来るたびに更新）、59 行目の「Last update run」は最後に列を実際に流した時刻です。61 行目で、まだ流していない仕事の名前を ` * ` を付けて並べます。仕組みは[第 14 回](14-sw-idle-cleanup.md)です。
3. **63〜65 行目：log**

   古い方の `debugLogB` を先に、新しい方の `debugLogA` を後に書きます。
4. **68〜75 行目：1 つの Response にする**

   3 つのかたまりを空行でつなぎ、74 行目で `Content-Type: text/plain` を付けます。だからブラウザで開くと、ただの文字のページになります。

📄 `angular/packages/service-worker/worker/src/debug.ts` L78–100 （▶ の行: 79–80, 82, 94, 98）

```ts
 78 │   since(time: number | null): string {
 79 ▶     if (time === null) {
 80 ▶       return 'never';
 81 │     }
 82 ▶     let age = this.adapter.time - time;
 83 │     const days = Math.floor(age / 86400000);
 84 │     age = age % 86400000;
 85 │     const hours = Math.floor(age / 3600000);
 86 │     age = age % 3600000;
 87 │     const minutes = Math.floor(age / 60000);
 88 │     age = age % 60000;
 89 │     const seconds = Math.floor(age / 1000);
 90 │     const millis = age % 1000;
 91 │ 
 92 │     return (
 93 │       '' +
 94 ▶       (days > 0 ? `${days}d` : '') +
 95 │       (hours > 0 ? `${hours}h` : '') +
 96 │       (minutes > 0 ? `${minutes}m` : '') +
 97 │       (seconds > 0 ? `${seconds}s` : '') +
 98 ▶       (millis > 0 ? `${millis}u` : '')
 99 │     );
100 │   }
```

時刻は「今から何前か」で出します。79〜80 行目で `null`（一度も起きていない）は `never`。82 行目で `adapter.time`（ワーカーの今の時刻）との差をとり、94〜98 行目で日・時・分・秒・ミリ秒を `1d2h3m4s5u` の形でつなぎます。ミリ秒の印は `ms` ではなく `u` です。0 の単位は書かないので、差がちょうど 0 ミリ秒だと**空の文字列**になります。デモの 1 段目で「Last update check:」の後ろが空になっていることがあるのはこのためで、「never」とは意味が違います（「今まさに」です）。

## 3. Driver の 3 つの debug 関数

📄 `angular/packages/service-worker/worker/src/driver.ts` L1342–1373 （▶ の行: 1344–1347, 1353, 1355–1357, 1360, 1362, 1369–1371）

```ts
1342 │   async debugState(): Promise<DebugState> {
1343 │     return {
1344 ▶       state: DriverReadyState[this.state],
1345 ▶       why: this.stateMessage,
1346 ▶       latestHash: this.latestHash,
1347 ▶       lastUpdateCheck: this.lastUpdateCheck,
1348 │     };
1349 │   }
1350 │ 
1351 │   async debugVersions(): Promise<DebugVersion[]> {
1352 │     // Build list of versions.
1353 ▶     return Array.from(this.versions.keys()).map((hash) => {
1354 │       const version = this.versions.get(hash)!;
1355 ▶       const clients = Array.from(this.clientVersionMap.entries())
1356 ▶         .filter(([clientId, version]) => version === hash)
1357 ▶         .map(([clientId, version]) => clientId);
1358 │       return {
1359 │         hash,
1360 ▶         manifest: version.manifest,
1361 │         clients,
1362 ▶         status: '',
1363 │       };
1364 │     });
1365 │   }
1366 │ 
1367 │   async debugIdleState(): Promise<DebugIdleState> {
1368 │     return {
1369 ▶       queue: this.idle.taskDescriptions,
1370 ▶       lastTrigger: this.idle.lastTrigger,
1371 ▶       lastRun: this.idle.lastRun,
1372 │     };
1373 │   }
```

1. **1344〜1347 行目：debugState**

   1344 行目は enum の数を名前に戻します（`DriverReadyState[0]` は `'NORMAL'`）。1345 行目の `stateMessage` は、初めは `'(nominal)'` で、状態を下げる所で `Initialization failed due to error: …`・`Degraded due to: …`・`Degraded due to failed initialization: …` に書き換わり、更新がうまく入ると `'(nominal)'` に戻ります（[第 15 回](15-sw-safe-mode.md)）。理由の `…` は error.ts の `errorToString`（[第 9 回](09-sw-hash-integrity.md)に引用）で作る「メッセージ + 改行 + スタック」なので、Driver state の行のあとにスタックの行が続くことがあります。

   1346 行目の `latestHash` は最新の版のハッシュ、1347 行目の `lastUpdateCheck` は `fetchLatestManifest` が ngsw.json を**取れたとき**だけ書く時刻です（[第 12 回](12-sw-update-check.md)）。取れなかった確認では進みません。
2. **1353〜1364 行目：debugVersions**

   1353 行目で、メモリに読み込んである版（`versions` の Map）を 1 つずつ回し、1355〜1357 行目で `clientVersionMap`（タブの ID → 版のハッシュ、[第 7 回](07-sw-versions.md)）からその版のタブだけを取り出します。1360 行目の `manifest` と 1362 行目の `status: ''` も返しますが、DebugHandler はハッシュとタブしか書きません（2 節の 51・53 行目）。`status` はいつも空です。
3. **1367〜1373 行目：debugIdleState**

   1369 行目の `idle.taskDescriptions` は、列に積まれた仕事の `desc` の配列です（idle.ts の getter。[第 14 回](14-sw-idle-cleanup.md)に引用）。仕事の名前は `driver.ts` の `idle.schedule(…)` の第 1 引数で、`check-updates-on-navigation`・`init post-load (update)`・`init post-load (cleanup)`・`initialization(<ハッシュ>)` の 4 種類です。

> [!WARNING]
> **ハマりどころ**
>
> どの関数も**メモリの中**を読むだけです。ブラウザはしばらく使われていないワーカーを止め、次のイベントで起こし直します。起こし直したワーカーでは `Driver` も `DebugHandler` も作り直しなので、log は空です。しかも 1 節のとおり、`/ngsw/state` への fetch は初期化（DB から版の一覧を読む）を起こしません。SwTestHarness で、同じ Cache Storage の上に Driver を作り直してすぐに `/ngsw/state` を開くと、`Latest manifest hash: none`・`Last update check: never`・版のかたまりが無い、になりました。ほかのファイルを 1 つ取ってから開き直すと、ハッシュと版が出ます（`Last update check` は DB に書かないので `never` のまま）。本番で開いたページが空っぽに見えたら、アプリのページを 1 回読み込んでから開き直します。

## 4. log：何が、どの形で貯まるか

📄 `angular/packages/service-worker/worker/src/debug.ts` L102–127 （▶ の行: 104–106, 110–111, 115, 119, 124）

```ts
102 │   log(value: string | Error, context: string = ''): void {
103 │     // Rotate the buffers if debugLogA has grown too large.
104 ▶     if (this.debugLogA.length === DEBUG_LOG_BUFFER_SIZE) {
105 ▶       this.debugLogB = this.debugLogA;
106 ▶       this.debugLogA = [];
107 │     }
108 │ 
109 │     // Convert errors to string for logging.
110 ▶     if (typeof value !== 'string') {
111 ▶       value = this.errorToString(value);
112 │     }
113 │ 
114 │     // Log the message.
115 ▶     this.debugLogA.push({value, time: this.adapter.time, context});
116 │   }
117 │ 
118 │   private errorToString(err: Error): string {
119 ▶     return `${err.name}(${err.message}, ${err.stack})`;
120 │   }
121 │ 
122 │   private formatDebugLog(log: DebugMessage[]): string {
123 │     return log
124 ▶       .map((entry) => `[${this.since(entry.time)}] ${entry.value} ${entry.context}`)
125 │       .join('\n');
126 │   }
127 │ }
```

1. **104〜107 行目：100 件ごとに入れ替える**

   `debugLogA` が 100 件になったら、それを `debugLogB` に移して A を空にします。B にあった古い 100 件は捨てられます。だから残るのは最大 200 件、少なくとも直近の 100 件です。22〜26 行目のコメントのとおり、配列を詰め直さないので 1 件の追加はいつも同じ手間です。
2. **110〜112 行目：Error は文字にしてから貯める**

   119 行目で `Name(message, stack)` の形にします。error.ts の `errorToString`（メッセージ + 改行 + スタック）とは別の関数で、形も違います。
3. **115 行目：時刻と context**

   記録した時刻を `adapter.time` で取り、表示のときに 124 行目で `[since] value context` にします。`context` は「どこで起きたか」の短い文字（`Driver.fetch(https://…/other.txt)` など）です。

`log` を呼んでいる所を `grep -n "debugger.log\|debugHandler.log\|debug.log"` で拾うと、worker/src に 17 か所あります。読むときの見出しにします。

| 場所（関数） | value / context | 章 |
| --- | --- | --- |
| driver.ts `onFetch` | Ignoring passive mixed content request / Ignoring invalid request: 'only-if-cached' …（初めの 1 回だけ） | [第 6 回](06-sw-driver-fetch.md) |
| driver.ts `onMessageError`・`onUnhandledRejection` | 下の引用 | この章 |
| driver.ts `handleFetch` | 版が critical なエラーを投げた（`Driver.handleFetch(version: …)`） | [第 9 回](09-sw-hash-integrity.md) |
| driver.ts `initialize`（3 か所） | DB に最新の manifest が無い / 知らない版を割り当てられたタブ / 版の初期化の予約に失敗 | [第 5 回](05-sw-driver-lifecycle.md) |
| driver.ts `scheduleInitialization` | `initializeFully for …` | [第 9 回](09-sw-hash-integrity.md) |
| driver.ts `checkForUpdate`（2 か所） | Check for update aborted. (Client or server offline.) / Error occurred while updating to manifest … | [第 12 回](12-sw-update-check.md) |
| driver.ts `cleanupCaches` | `cleanupCaches` | [第 14 回](14-sw-idle-cleanup.md) |
| driver.ts `safeFetch` | ネットワークのエラー（`Driver.fetch(<URL>)`）。そのあと 504 を返す | [第 6 回](06-sw-driver-fetch.md) |
| data.ts（3 か所） | `DataGroup(名前@版).syncLru()`・`.safeCacheResponse(…)`・`.detectStorageFull()` | [第 10 回](10-sw-data-groups.md) |
| idle.ts `execute` | `while running idle task …` | [第 14 回](14-sw-idle-cleanup.md) |

📄 `angular/packages/service-worker/worker/src/driver.ts` L356–372 （▶ の行: 359–361, 368–370）

```ts
356 │   private onMessageError(event: ExtendableMessageEvent): void {
357 │     // Handle message deserialization errors that occur when receiving messages
358 │     // that cannot be deserialized, typically due to corrupted data or unsupported formats.
359 ▶     this.debugger.log(
360 ▶       `Message error occurred - data could not be deserialized`,
361 ▶       `Driver.onMessageError(origin: ${event.origin})`,
362 │     );
363 │   }
364 │ 
365 │   private onUnhandledRejection(event: PromiseRejectionEvent): void {
366 │     // Handle unhandled promise rejections in the service worker.
367 │     // This is for debugging and preventing silent failures.
368 ▶     this.debugger.log(
369 ▶       `Unhandled promise rejection occurred`,
370 ▶       `Driver.onUnhandledRejection(reason: ${event.reason})`,
371 │     );
372 │   }
```

ワーカーのグローバルの 2 つのイベントは、log に書くだけのハンドラーです。359〜362 行目の `messageerror` は、ページからの postMessage のデータを読めなかったとき、368〜371 行目の `unhandledrejection` は、ワーカーの中で誰も catch しなかった Promise の拒否です。どちらも状態は変えません。ここで `reason` は文字に埋め込まれるだけなので、Error ならメッセージ（`String(err)` の形）だけでスタックは残りません。

この表に**無いもの**も覚えておきます。

- `assets.ts` は log を呼びません。ハッシュの食い違いなどは例外として上に投げ、`handleFetch` や `scheduleInitialization` の所で記録されます。
- データグループの API が、オフラインでキャッシュにも無いとき。`DataGroup.safeFetch`（data.ts の最後の方、[第 10 回](10-sw-data-groups.md)に引用）は `try` の中で `return this.scope.fetch(req)` と `await` せずに返すので、ネットワークのエラー（Promise の拒否）は `catch` を通らず、504 にも log にもなりません。その拒否は `Driver.handleFetch` で critical でないエラーとしてそのまま投げ直され（第 6 回）、ページからはネットワークエラーに見えます。デモの 3 段目の `/api/news` がこれです。`Driver.safeFetch` の方は `return await` なので、同じオフラインで 504 と log の 1 行になります。

## 5. 本物のワーカーで、各段のページを読む

> **🧪 DEMO — v1 → v2 → オフラインの /ngsw/state**
>
> 本物の `ngsw-worker.js`（`@angular/service-worker` 22.1.6 の配布物）を、偽物のブラウザの上で動かします。偽物にしたのは `self`・Cache Storage・サーバー・タブ・タイマーと時計で（sw-sandbox.ts の先頭のコメント）、時計は仮想なので「6s」はすぐに過ぎます。このページに本物の Service Worker は登録しません。ngsw-config は app（`/index.html`・`/main.js`、prefetch）と api（`/api/**`、performance、maxAge 1h）です。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sw-debug)

押して読むときの見どころです（ハッシュは ngsw.json の `timestamp` が毎回違うので、押すたびに変わります）。

1. **1 段目：版が 1 つ、Clients: tab-1、列は空**

   install と activate のあとに積まれた `initialization(…)` と `init post-load (cleanup)` は、仮想の 6 秒で流れて消えています。ナビゲーションで積まれた `check-updates-on-navigation` も、次の 6 秒で流れます。Debug log は空です。
2. **2 段目：版が 2 つ**

   `Latest manifest hash` が v2 に変わり、`=== Version` が 2 つになります。古い版の Clients は tab-1 のまま（開いているタブは版を変えない、[第 7 回](07-sw-versions.md)）、新しいタブ tab-2 は新しい版です。`Last update check` は CHECK\_FOR\_UPDATES で ngsw.json を取れた時刻からの時間です。
3. **3 段目：オフライン**

   `/index.html` はキャッシュから 200。`/other.txt`（どのグループにも無い）は `Driver.safeFetch` で 504 になり、log に `TypeError(…, …stack) Driver.fetch(https://app.example/other.txt)` が 1 行。CHECK\_FOR\_UPDATES では、ngsw.json を取る fetch も同じ `safeFetch` を通るので log に 1 行、そのあと `Check for update aborted. (Client or server offline.)` がもう 1 行です。`Last update check` は 2 段目から進まず、`/api/news` は log に何も残しません（4 節）。

## 6. 本番で困ったときに読む順

1. **Driver state の行**

   `NORMAL` でなければ、括弧の中の理由（`stateMessage`）が最初の手がかりです。`EXISTING_CLIENTS_ONLY` なら新しいタブも古い版のままか、ネットワークに行きます（[第 15 回](15-sw-safe-mode.md)）。
2. **Latest manifest hash と === Version の数**

   デプロイした ngsw.json のハッシュ（`sha1` を手で取れる）と比べます。版が 2 つ以上あり、自分のタブが古い版の Clients にいれば、「更新は入ったが、このタブはまだ切り替えていない」です（[第 13 回](13-sw-swupdate.md)の `activateUpdate`）。
3. **Last update check**

   `never` や長い時間なら、ngsw.json を取れていません（オフライン・404・ワーカーを起こし直した直後）。
4. **Task queue と Last update run**

   仕事が積まれたまま長く流れていなければ、アイドルの仕事を起こすリクエストが来ていません（[第 14 回](14-sw-idle-cleanup.md)）。
5. **Debug log**

   context の関数名で 4 節の表を引きます。log はワーカーを起こし直すと消えるので、困ったことが起きたその場で開いて写しておきます。

- 👤 `GET /ngsw/state` — ブラウザのタブ — *アドレスバーで開く*
  - `Driver.onFetch(event)` — worker/src/driver.ts — *bypass の次、SAFE\_MODE より前で判定*
    - `DebugHandler.handleFetch(req)` — worker/src/debug.ts 35 — *初期化もアイドルも起こさない*
      - `Driver.debugState / debugVersions / debugIdleState` — worker/src/driver.ts 1342〜1373 — *メモリの中を読むだけ*
      - `DebugHandler.since(time)` — worker/src/debug.ts 78 — *never か 1d2h3m4s5u*
      - `DebugHandler.formatDebugLog(debugLogB / A)` — worker/src/debug.ts 122 — *\[since\] value context*
    - `adapter.newResponse(text, Content-Type: text/plain)` — worker/src/debug.ts 68

## テストと直し方

📄 `angular/packages/service-worker/worker/test/happy_spec.ts` L1431–1462 （▶ の行: 1431, 1433–1434, 1439, 1446, 1453, 1458）

```ts
1431 ▶     describe('serving ngsw/state', () => {
1432 │       it('should show debug info (when in NORMAL state)', async () => {
1433 ▶         expect(await makeRequest(scope, '/ngsw/state')).toMatch(
1434 ▶           /^NGSW Debug Info:\n\nDriver version: .+\nDriver state: NORMAL/,
1435 │         );
1436 │       });
1437 │ 
1438 │       it('should show debug info (when in EXISTING_CLIENTS_ONLY state)', async () => {
1439 ▶         driver.state = DriverReadyState.EXISTING_CLIENTS_ONLY;
1440 │         expect(await makeRequest(scope, '/ngsw/state')).toMatch(
1441 │           /^NGSW Debug Info:\n\nDriver version: .+\nDriver state: EXISTING_CLIENTS_ONLY/,
1442 │         );
1443 │       });
1444 │ 
1445 │       it('should show debug info (when in SAFE_MODE state)', async () => {
1446 ▶         driver.state = DriverReadyState.SAFE_MODE;
1447 │         expect(await makeRequest(scope, '/ngsw/state')).toMatch(
1448 │           /^NGSW Debug Info:\n\nDriver version: .+\nDriver state: SAFE_MODE/,
1449 │         );
1450 │       });
1451 │ 
1452 │       it('should show debug info when the scope is not root', async () => {
1453 ▶         const newScope = new SwTestHarnessBuilder('http://localhost/foo/bar/')
1454 │           .withServerState(server)
1455 │           .build();
1456 │         new Driver(newScope, newScope, new CacheDatabase(newScope));
1457 │ 
1458 ▶         expect(await makeRequest(newScope, '/foo/bar/ngsw/state')).toMatch(
1459 │           /^NGSW Debug Info:\n\nDriver version: .+\nDriver state: NORMAL/,
1460 │         );
1461 │       });
1462 │     });
```

happy\_spec.ts の `describe('serving ngsw/state')`（1431 行目）は 4 本です。1433〜1434 行目のとおり、確かめているのは**先頭の 3 行**（見出し・Driver version・Driver state）を正規表現で合わせることだけです。1439・1446 行目は `driver.state` を直接書き換えて、状態の名前が出ることを見ます。1453・1458 行目は、スコープが `/foo/bar/` のときに `/foo/bar/ngsw/state` で答えることです。

📄 `angular/packages/service-worker/worker/test/happy_spec.ts` L1201–1232 （▶ の行: 1205, 1207, 1209, 1220, 1225, 1227）

```ts
1201 │     describe('messageerror events', () => {
1202 │       it('logs message deserialization errors', async () => {
1203 │         await driver.initialized;
1204 │ 
1205 ▶         const debuggerLogSpy = spyOn(driver.debugger, 'log');
1206 │ 
1207 ▶         scope.handleMessageError('someClient');
1208 │ 
1209 ▶         expect(debuggerLogSpy).toHaveBeenCalledWith(
1210 │           'Message error occurred - data could not be deserialized',
1211 │           'Driver.onMessageError(origin: )',
1212 │         );
1213 │       });
1214 │     });
1215 │ 
1216 │     describe('unhandledrejection events', () => {
1217 │       it('logs unhandled promise rejection errors', async () => {
1218 │         await driver.initialized;
1219 │ 
1220 ▶         const debuggerLogSpy = spyOn(driver.debugger, 'log');
1221 │ 
1222 │         // To drain the microtask queue (and process all rejections)
1223 │         await new Promise((r) => setTimeout(r));
1224 │ 
1225 ▶         scope.handleUnhandledRejection('Test rejection reason');
1226 │ 
1227 ▶         expect(debuggerLogSpy).toHaveBeenCalledWith(
1228 │           'Unhandled promise rejection occurred',
1229 │           'Driver.onUnhandledRejection(reason: Test rejection reason)',
1230 │         );
1231 │       });
1232 │     });
```

log の spec は、1205・1220 行目で `driver.debugger.log` を `spyOn` して、呼ばれた引数を比べる形です。1207 行目の `scope.handleMessageError` と 1225 行目の `scope.handleUnhandledRejection` は、テスト用の偽物の self が持つ「イベントを送る」関数です（[第 18 回](18-sw-testing-harness.md)）。同じ形の spec は `describe('bugs')` の中の「keeps serving … when failing to write to cache」の 3 本（データグループのキャッシュに書けないとき）にもあり、どれも log の中身ではなく `log` の呼ばれ方を見ています。

📄 `ターミナル`

```
cd ~/angular-research/angular
git status --short          # 走らせる前と後で同じか（ソースは変えない）
pnpm bazel test //packages/service-worker/worker/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=serving ngsw/state|messageerror events|unhandledrejection events'
```

📄 `出力（2026-11-03。ログは scratchpad/sw-logs/e-debug.log）`

```
Ran 6 of 153 specs
6 specs, 0 failures
Finished in 0.008 seconds
//packages/service-worker/worker/test:test                               PASSED in 0.6s
```

3 つの describe の 6 本が 0.008 秒で通りました（ターゲット全体は 153 本、フィルタ無しでは 0.084 秒）。**0 本に一致しても PASSED** になるので、「Ran 6 of 153」を必ず見ます。

- **このパッケージの方針**：packages/service-worker/PACKAGE.md の 1 行目（[第 1 回](01-sw-overview.md)に引用）のとおり、セキュリティの修正以外の新しい機能の PR は受け付けられず、不具合の直しも慎重に扱われます（PR #67918 は「security の脆弱性以外の貢献は受け付けていない」として 2026-04-10 に閉じられた。[第 20 回](20-sw-issues.md)）。「直すとしたら」は、手元で確かめて issue を読むための入口です。
- **spec が無いもの**：`since()` の形（0 ミリ秒が空になることも含めて）、`log` の 100 件の入れ替え、`debugVersions` の Clients の行、`/ngsw/state` が初期化を待たないこと。`DebugHandler` を直接 new する spec はありません。
- **直すとしたら**：表示は `debug.ts` の `handleFetch`・`since`・`formatDebugLog`、何を出すかは `driver.ts` の 3 つの debug 関数です。spec は happy\_spec.ts の `describe('serving ngsw/state')` に、`scope.advance(ms)` で時計を進めてから全文を比べる it を足す形になります。
- **4 節のデータグループの拒否**：入口は data.ts の `DataGroup.safeFetch`、spec は data\_spec.ts（`server.online = false` にして、キャッシュに無い API を取る it はまだありません）。SwTestHarness で確かめた手順は[第 20 回](20-sw-issues.md)の 4 節にまとめました。
- **関係する issue**：#66798「ngsw/state の URL を変えたい」（2026-01-28 に立って同じ日に閉じた）。[第 20 回](20-sw-issues.md)の表にあります。本家に PR を出すことは勧めません。手元で spec を足して走らせ、issue を読むときの手がかりにします。

## 聞かれそうな質問

**Q. /ngsw/state はワーカーが壊れて SAFE\_MODE でも見られますか？**

見られます。`onFetch` は `ngsw-bypass` の印を見たすぐ後に `/ngsw/state` を判定し、`SAFE_MODE` の判定はその後です（1 節、第 6 回）。答えるのは `DebugHandler.handleFetch` だけで、2 節の 36〜40 行目のとおり Driver のメモリを読むだけなので、状態も変えません。

**Q. 開いたら Latest manifest hash: none で、版が 1 つも出ません。ワーカーは動いていないのですか？**

ワーカーを起こし直した直後だと、そう出ます。`/ngsw/state` への fetch は初期化を起こさず（1 節）、1344〜1373 行目はメモリの中しか読まないからです。SwTestHarness で作り直した Driver でも同じになりました（3 節の注意）。アプリのページを 1 回読み込んでから開き直します。

**Q. Debug log には何件まで残りますか？ワーカーを閉じたら消えますか？**

104〜107 行目で 100 件ごとに 2 つの配列を入れ替えるので、最大 200 件、少なくとも直近の 100 件です。配列は `DebugHandler` のフィールドで、DB にも Cache Storage にも書かないので、ブラウザがワーカーを止めれば消えます。

**Q. 「Last update check:」の後ろが空です。never と何が違いますか？**

`since()` は 79〜80 行目で `null` を `never` にし、それ以外は 94〜98 行目で 0 でない単位だけをつなぐので、差がちょうど 0 ミリ秒だと空になります。空は「今まさに確かめた」、never は「このワーカーで一度も ngsw.json を取れていない」です。

**Q. オフラインで API を叩いたのに、Debug log に何も出ません。**

データグループの URL で、キャッシュにも無いときです。`DataGroup.safeFetch` が `await` せずに返すので、拒否は 504 にも log にもならずにページまで届きます（4 節）。アセットやどのグループにも無い URL は `Driver.safeFetch` を通るので、504 と log の 1 行になります。

## 読み終えて

- `/ngsw/state` は `onFetch` で bypass の次に判定され、SAFE\_MODE でも出る。答えるのは `DebugHandler.handleFetch` だけで、初期化もアイドルも起こさない。
- ページは 3 つのかたまり（Driver の状態・版ごとのタブ・アイドルの列と log）で、どれも `driver.ts` 1342〜1373 行目がメモリから読んだもの。ワーカーを起こし直すと空に近くなる。
- log は 100 件ずつの 2 つの配列で最大 200 件。Error は `Name(message, stack)`、context はどこで起きたかの関数名。
- spec が確かめているのは先頭の 3 行と `log` の呼ばれ方だけ。表示の形やデータグループのオフラインの拒否には spec が無い。

---

← 前: [プッシュ通知：SwPush と push・notificationclick](16-sw-push.md)  
次: [ワーカーのテスト：SwTestHarness と偽物のブラウザ](18-sw-testing-harness.md) →
