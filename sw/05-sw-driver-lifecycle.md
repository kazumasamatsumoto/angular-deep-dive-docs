[目次](../README.md) › [Service Worker の内側](README.md) › 第 5 回 / 全 20 回

# Driver の起動：install・activate・初期化

> ngsw-worker.js の入口（worker/main.ts）が Adapter と CacheDatabase を作って Driver に渡し、Driver が install で skipWaiting、activate で clients.claim と初期化の合図を送る流れ。ensureInitialized と initialize（DB から版の一覧と割り当てを読む、無ければ ngsw.json を取ってくる）、DriverReadyState（NORMAL・EXISTING\_CLIENTS\_ONLY・SAFE\_MODE）。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sw-driver-lifecycle)

---

ブラウザが `ngsw-worker.js` を読み込むと、最初に動くのは 3 行だけの入口です。この章では、その 3 行が作る `Driver` が install・activate のイベントで何をして、いつ・どの順で DB を読み、`ngsw.json` を取り、版（`AppVersion`）を作り、ファイルの先読みを「あとで」に回すのかを、行番号を指して追います。最後に、本物の `ngsw-worker.js` を偽物のブラウザの上で 1 段ずつ進めて、同じことが起きるのを確かめます。

読む対象は `packages/service-worker/worker/main.ts` と `worker/src/driver.ts`（コンストラクタ・`ensureInitialized`・`initialize`・`scheduleInitialization`）です。

1. [1. 全体像](01-sw-overview.md)
2. [2. Generator](02-sw-config-generator.md)
3. [3. ビルド](03-sw-cli-build.md)
4. [4. 登録](04-sw-register.md)
5. **5. Driver の起動**（この章）
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
17. [17. デバッグ](17-sw-debug.md)
18. [18. ワーカーのテスト](18-sw-testing-harness.md)
19. [19. アプリ側のテスト](19-sw-testing-app.md)
20. [20. issue と PR を読む](20-sw-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> Service Worker（以下ワーカー）は、ページとは別のスレッドで動く JavaScript です。ブラウザはワーカーに `install`（入れた）・`activate`（使い始めた）・`fetch`（ページが何かを取りに行った）などの**イベント**を送り、ワーカーは `addEventListener` で受け取ります。イベントの `waitUntil(promise)` は「この Promise が終わるまでワーカーを止めないで」という合図です。ページの側で登録するまでの話は [第 4 回](04-sw-register.md)にあります。

## 1. 入口の 3 行：Adapter と CacheDatabase を作って Driver に渡す

📄 `angular/packages/service-worker/worker/main.ts` L9–16 （▶ の行: 13, 15–16）

```ts
 9 │ import {Adapter} from './src/adapter';
10 │ import {CacheDatabase} from './src/db-cache';
11 │ import {Driver} from './src/driver';
12 │ 
13 ▶ const scope = self as unknown as ServiceWorkerGlobalScope;
14 │ 
15 ▶ const adapter = new Adapter(scope.registration.scope, self.caches);
16 ▶ new Driver(scope, adapter, new CacheDatabase(adapter));
```

13 行目の `self` はワーカーの中のグローバル（`ServiceWorkerGlobalScope`）です。15 行目で、登録のスコープ（`registration.scope`、例 `https://app.example/`）と `self.caches`（Cache Storage）を `Adapter` に渡します。16 行目で `Driver` を new するだけで、入口の仕事は終わりです。`Driver` を変数に入れていないのは、以後の仕事がすべて「コンストラクタで登録したイベントのハンドラー」から始まるからです（3 節）。

`Adapter` はワーカーが触るブラウザの API（Request・Response・caches・時刻）をまとめた薄い層で、`CacheDatabase` は Cache Storage の中に JSON を置く小さな DB です。どちらも [第 11 回](11-sw-database.md)で読みます。この章では「`db.open('control')` で表を開き、`read`・`write` で JSON を出し入れできるもの」とだけ覚えておけば足ります。

## 2. Driver が持つ状態：state と initialized

📄 `angular/packages/service-worker/worker/src/driver.ts` L87–113 （▶ の行: 89, 94, 98, 106, 113）

```ts
 87 │ export enum DriverReadyState {
 88 │   // The SW is operating in a normal mode, responding to all traffic.
 89 ▶   NORMAL,
 90 │ 
 91 │   // The SW does not have a clean installation of the latest version of the app, but older
 92 │   // cached versions are safe to use so long as they don't try to fetch new dependencies.
 93 │   // This is a degraded state.
 94 ▶   EXISTING_CLIENTS_ONLY,
 95 │ 
 96 │   // The SW has decided that caching is completely unreliable, and is forgoing request
 97 │   // handling until the next restart.
 98 ▶   SAFE_MODE,
 99 │ }
100 │ 
101 │ export class Driver implements Debuggable, UpdateSource {
102 │   /**
103 │    * Tracks the current readiness condition under which the SW is operating. This controls
104 │    * whether the SW attempts to respond to some or all requests.
105 │    */
106 ▶   state: DriverReadyState = DriverReadyState.NORMAL;
107 │   private stateMessage: string = '(nominal)';
108 │ 
109 │   /**
110 │    * Tracks whether the SW is in an initialized state or not. Before initialization,
111 │    * it's not legal to respond to requests.
112 │    */
113 ▶   initialized: Promise<void> | null = null;
```

`DriverReadyState` は 3 つです。

1. **89 行目 `NORMAL`**

   すべてのリクエストに答える、ふつうの状態。106 行目で `state` の初期値になっています。
2. **94 行目 `EXISTING_CLIENTS_ONLY`**

   最新の版がきれいに入っていない。古い版を使っている開いたタブだけ面倒をみて、新しいタブは割り当てない、という下がった状態です。
3. **98 行目 `SAFE_MODE`**

   キャッシュをまったく信用できないので、次にワーカーが起動し直すまで何も横取りしない状態です。

この章で `state` を書き換えるのは 4 節の「初期化に失敗したら `SAFE_MODE`」の 1 か所だけです。版が壊れたときに `EXISTING_CLIENTS_ONLY` に下がる行と、そこから戻る行は [第 15 回](15-sw-safe-mode.md)で読みます。

113 行目の `initialized` は「初期化の Promise」です。`null` は「まだ一度も初期化を試していない」という意味で、4 節の `ensureInitialized` がこれを見て 1 回だけ初期化します。

## 3. コンストラクタ：イベントを登録するだけ

📄 `angular/packages/service-worker/worker/src/driver.ts` L161–189 （▶ の行: 166–167, 172, 177, 182, 187）

```ts
161 │   constructor(
162 │     private scope: ServiceWorkerGlobalScope,
163 │     private adapter: Adapter,
164 │     private db: Database,
165 │   ) {
166 ▶     this.controlTable = this.db.open('control');
167 ▶     this.ngswStatePath = this.adapter.parseUrl('ngsw/state', this.scope.registration.scope).path;
168 │ 
169 │     // Set up all the event handlers that the SW needs.
170 │ 
171 │     // The install event is triggered when the service worker is first installed.
172 ▶     this.scope.addEventListener('install', (event) => {
173 │       // SW code updates are separate from application updates, so code updates are
174 │       // almost as straightforward as restarting the SW. Because of this, it's always
175 │       // safe to skip waiting until application tabs are closed, and activate the new
176 │       // SW version immediately.
177 ▶       event!.waitUntil(this.scope.skipWaiting());
178 │     });
179 │ 
180 │     // The activate event is triggered when this version of the service worker is
181 │     // first activated.
182 ▶     this.scope.addEventListener('activate', (event) => {
183 │       event!.waitUntil(
184 │         (async () => {
185 │           // As above, it's safe to take over from existing clients immediately, since the new SW
186 │           // version will continue to serve the old application.
187 ▶           await this.scope.clients.claim();
188 │         })(),
189 │       );
```

1. **166 行目：`control` の表を開く**

   `this.db.open('control')` の Promise を `controlTable` に入れます。中に入るのは 5 節で読む `manifests`・`assignments`・`latest` の 3 つです。開くだけなので、デモでは new した直後に `ngsw:/:db:control` という空のキャッシュが見えます。
2. **167 行目：デバッグのページのパスを決める**

   スコープからの相対で `ngsw/state`。[第 6 回](06-sw-driver-fetch.md)の `onFetch` がこのパスだけは無条件に答えます。
3. **172〜178 行目：install では `skipWaiting()` だけ**

   ブラウザは新しいワーカーを入れても、古いワーカーが面倒をみているタブが全部閉じるまで「待機」させるのが既定です。177 行目の `skipWaiting()` はその待機を飛ばします。173〜176 行目のコメントのとおり、**ワーカーのコードが変わっても、古いアプリの版はキャッシュに残っていて新しいワーカーがそれを配り続けられる**ので、待つ理由がありません。この時点ではファイルを 1 つも取りません。
4. **182〜189 行目：activate では `clients.claim()`**

   187 行目の `clients.claim()` は、すでに開いているタブもこのワーカーの管理下に入れる API です。これが無いと、ワーカーを登録したそのタブは再読み込みするまでワーカーを通りません。

📄 `angular/packages/service-worker/worker/src/driver.ts` L190–225 （▶ の行: 201–202, 209–210, 221, 224）

```ts
190 │ 
191 │       // Rather than wait for the first fetch event, which may not arrive until
192 │       // the next time the application is loaded, the SW takes advantage of the
193 │       // activation event to schedule initialization. However, if this were run
194 │       // in the context of the 'activate' event, waitUntil() here would cause fetch
195 │       // events to block until initialization completed. Thus, the SW does a
196 │       // postMessage() to itself, to schedule a new event loop iteration with an
197 │       // entirely separate event context. The SW will be kept alive by waitUntil()
198 │       // within that separate context while initialization proceeds, while at the
199 │       // same time the activation event is allowed to resolve and traffic starts
200 │       // being served.
201 ▶       if (this.scope.registration.active !== null) {
202 ▶         this.scope.registration.active.postMessage({action: 'INITIALIZE'});
203 │       }
204 │     });
205 │ 
206 │     // Handle the fetch, message, push, notificationclick,
207 │     // notificationclose, pushsubscriptionchange, messageerror, rejectionhandled,
208 │     // and unhandledrejection events.
209 ▶     this.scope.addEventListener('fetch', (event) => this.onFetch(event!));
210 ▶     this.scope.addEventListener('message', (event) => this.onMessage(event!));
211 │     this.scope.addEventListener('push', (event) => this.onPush(event!));
212 │     this.scope.addEventListener('notificationclick', (event) => this.onClick(event));
213 │     this.scope.addEventListener('notificationclose', (event) => this.onClose(event));
214 │     this.scope.addEventListener('pushsubscriptionchange', (event) =>
215 │       this.onPushSubscriptionChange(event),
216 │     );
217 │     this.scope.addEventListener('messageerror', (event) => this.onMessageError(event));
218 │     this.scope.addEventListener('unhandledrejection', (event) => this.onUnhandledRejection(event));
219 │ 
220 │     // The debugger generates debug pages in response to debugging requests.
221 ▶     this.debugger = new DebugHandler(this, this.adapter);
222 │ 
223 │     // The IdleScheduler will execute idle tasks after a given delay.
224 ▶     this.idle = new IdleScheduler(this.adapter, IDLE_DELAY, MAX_IDLE_DELAY, this.debugger);
225 │   }
```

1. **201〜203 行目：自分に `INITIALIZE` を postMessage する**

   初期化を activate のイベントの中で待つと、`waitUntil` が終わるまでブラウザは fetch のイベントを送ってきません（191〜200 行目のコメント）。そこで activate はすぐ終わらせ、`registration.active.postMessage` で**自分宛ての message のイベント**を 1 つ作り、別のイベントの中で初期化します。ページの側からではなく自分から送るので、`source` はタブではありません（4 節）。
2. **209〜218 行目：残りのイベント**

   `fetch` は `onFetch`（[第 6 回](06-sw-driver-fetch.md)）、`message` は `onMessage`（[第 13 回](13-sw-swupdate.md)）、`push`・`notificationclick` などは [第 16 回](16-sw-push.md)です。どのハンドラーも同期で呼ばれ、非同期の仕事は `respondWith` か `waitUntil` に渡します。
3. **221・224 行目：`DebugHandler` と `IdleScheduler`**

   `IdleScheduler` は「最後のイベントから 5 秒たったら、積んである仕事をまとめて走らせる」係です（[第 14 回](14-sw-idle-cleanup.md)）。この章の初期化は、重い仕事（ファイルの先読み）をこの係に積みます（6 節）。

## 4. ensureInitialized：初期化をちょうど 1 回だけ

201 行目で送った `INITIALIZE` は、`onMessage` の中のこの行で受け取ります。

📄 `angular/packages/service-worker/worker/src/driver.ts` L310–316 （▶ の行: 314–315）

```ts
310 │     event.waitUntil(
311 │       (async () => {
312 │         // Initialization is the only event which is sent directly from the SW to itself, and thus
313 │         // `event.source` is not a `Client`. Handle it here, before the check for `Client` sources.
314 ▶         if (data.action === 'INITIALIZE') {
315 ▶           return this.ensureInitialized(event);
316 │         }
```

314 行目、`action` が `INITIALIZE` なら、送り主がタブかどうかを確かめる前に 315 行目で `ensureInitialized` を呼びます （それ以外のメッセージの扱いは [第 13 回](13-sw-swupdate.md)）。

📄 `angular/packages/service-worker/worker/src/driver.ts` L374–398 （▶ の行: 378–379, 385–386, 390–391, 393, 396）

```ts
374 │   private async ensureInitialized(event: ExtendableEvent): Promise<void> {
375 │     // Since the SW may have just been started, it may or may not have been initialized already.
376 │     // `this.initialized` will be `null` if initialization has not yet been attempted, or will be a
377 │     // `Promise` which will resolve (successfully or unsuccessfully) if it has.
378 ▶     if (this.initialized !== null) {
379 ▶       return this.initialized;
380 │     }
381 │ 
382 │     // Initialization has not yet been attempted, so attempt it. This should only ever happen once
383 │     // per SW instantiation.
384 │     try {
385 ▶       this.initialized = this.initialize();
386 ▶       await this.initialized;
387 │     } catch (error) {
388 │       // If initialization fails, the SW needs to enter a safe state, where it declines to respond
389 │       // to network requests.
390 ▶       this.state = DriverReadyState.SAFE_MODE;
391 ▶       this.stateMessage = `Initialization failed due to error: ${errorToString(error)}`;
392 │ 
393 ▶       throw error;
394 │     } finally {
395 │       // Regardless if initialization succeeded, background tasks still need to happen.
396 ▶       event.waitUntil(this.idle.trigger());
397 │     }
398 │   }
```

1. **378〜380 行目：もう試したなら同じ Promise を返す**

   `initialized` が `null` でなければ、それを返して終わりです。`INITIALIZE` のメッセージと最初の fetch がほぼ同時に来ても、`initialize()` は 1 回しか走りません。
2. **385〜386 行目：初めてなら `initialize()` を呼んで待つ**

   385 行目で Promise を**先に**`initialized` に入れてから 386 行目で待ちます。待っている間に来た別のイベントは、378 行目で同じ Promise を受け取ります。
3. **390〜393 行目：失敗したら `SAFE_MODE`**

   初期化が投げたら `state` を `SAFE_MODE` にし、理由を `stateMessage` に残して、393 行目でエラーを投げ直します。`initialized` には reject した Promise が残るので、このワーカーが生きている間は 378 行目が同じ失敗を返し続けます。デモの「ngsw.json を 500 で返す」で確かめられます。
4. **396 行目：成功しても失敗しても、アイドルの時計を動かす**

   `idle.trigger()` を `waitUntil` に渡します。この Promise は 5 秒後にアイドルの仕事を走らせ、終わるまで解決しないので、その間ワーカーは止められません。6 節で積んだ先読みは、この 5 秒後に走ります。

`ensureInitialized` を呼ぶのは 3 か所です。`INITIALIZE`（315 行目）、ほかのメッセージ（[第 13 回](13-sw-swupdate.md)）、そして `handleFetch` の先頭（[第 6 回](06-sw-driver-fetch.md)）。ブラウザはアイドルのワーカーを止めて、次のイベントで新しく起動し直すことがあります。起動し直したワーカーは activate を受け取らないので、最初の fetch か message が初期化の引き金になります。

## 5. initialize：DB を読む。無ければ ngsw.json を取ってくる

📄 `angular/packages/service-worker/worker/src/driver.ts` L648–686 （▶ の行: 659, 666–669, 674, 679, 684–685）

```ts
648 │   private async initialize(): Promise<void> {
649 │     // On initialization, all of the serialized state is read out of the 'control'
650 │     // table. This includes:
651 │     // - map of hashes to manifests of currently loaded application versions
652 │     // - map of client IDs to their pinned versions
653 │     // - record of the most recently fetched manifest hash
654 │     //
655 │     // If these values don't exist in the DB, then this is the either the first time
656 │     // the SW has run or the DB state has been wiped or is inconsistent. In that case,
657 │     // load a fresh copy of the manifest and reset the state from scratch.
658 │ 
659 ▶     const table = await this.controlTable;
660 │ 
661 │     // Attempt to load the needed state from the DB. If this fails, the catch {} block
662 │     // will populate these variables with freshly constructed values.
663 │     let manifests: ManifestMap, assignments: ClientAssignments, latest: LatestEntry;
664 │     try {
665 │       // Read them from the DB simultaneously.
666 ▶       [manifests, assignments, latest] = await Promise.all([
667 ▶         table.read<ManifestMap>('manifests'),
668 ▶         table.read<ClientAssignments>('assignments'),
669 ▶         table.read<LatestEntry>('latest'),
670 │       ]);
671 │ 
672 │       // Make sure latest manifest is correctly installed. If not (e.g. corrupted data),
673 │       // it could stay locked in EXISTING_CLIENTS_ONLY or SAFE_MODE state.
674 ▶       if (!this.versions.has(latest.latest) && !Object.hasOwn(manifests, latest.latest)) {
675 │         this.debugger.log(
676 │           `Missing manifest for latest version hash ${latest.latest}`,
677 │           'initialize: read from DB',
678 │         );
679 ▶         throw new Error(`Missing manifest for latest hash ${latest.latest}`);
680 │       }
681 │ 
682 │       // Successfully loaded from saved state. This implies a manifest exists, so
683 │       // the update check needs to happen in the background.
684 ▶       this.idle.schedule('init post-load (update)', async () => {
685 ▶         await this.checkForUpdate();
686 │       });
```

1. **659〜670 行目：`control` の表から 3 つを同時に読む**

   `manifests`（版のハッシュ → `ngsw.json` の中身）、`assignments`（タブの ID → 版のハッシュ）、`latest`（`{latest: ハッシュ}`）。初めて動くワーカーでは表が空なので、`table.read` が投げて catch に行きます。
2. **674〜680 行目：`latest` の指す版が `manifests` に無ければ壊れた DB とみなす**

   自分で投げて、次の catch に行かせます。ここで投げないと、存在しない版を最新として使い続けて `EXISTING_CLIENTS_ONLY` や `SAFE_MODE` から抜けられなくなる、と 672〜673 行目のコメントに書いてあります。
3. **684〜686 行目：読めたなら、更新の確認をアイドルに積む**

   DB に版があったということは、前にも動いたワーカーが起動し直したということです。サーバーに新しい版が出ていないかの確認は急がないので、`'init post-load (update)'` という名前でアイドルに積みます（確認の中身は [第 12 回](12-sw-update-check.md)）。

📄 `angular/packages/service-worker/worker/src/driver.ts` L687–711 （▶ の行: 690–694, 697, 709–710）

```ts
687 │     } catch (_) {
688 │       // Something went wrong. Try to start over by fetching a new manifest from the
689 │       // server and building up an empty initial state.
690 ▶       const manifest = await this.fetchLatestManifest();
691 ▶       const hash = hashManifest(manifest);
692 ▶       manifests = {[hash]: manifest};
693 ▶       assignments = {};
694 ▶       latest = {latest: hash};
695 │ 
696 │       // Save the initial state to the DB.
697 ▶       await Promise.all([
698 │         table.write('manifests', manifests),
699 │         table.write('assignments', assignments),
700 │         table.write('latest', latest),
701 │       ]);
702 │     }
703 │ 
704 │     // At this point, either the state has been loaded successfully, or fresh state
705 │     // with a new copy of the manifest has been produced. At this point, the `Driver`
706 │     // can have its internals hydrated from the state.
707 │ 
708 │     // Schedule cleaning up obsolete caches in the background.
709 ▶     this.idle.schedule('init post-load (cleanup)', async () => {
710 ▶       await this.cleanupCaches();
711 │     });
```

1. **690 行目：`ngsw.json` を取ってくる**

   `fetchLatestManifest` は `ngsw.json?ngsw-cache-bust=<乱数>` を取ります。デモのサーバーの記録に出る 1 行目がこれです。404 なら全部のキャッシュを消して登録を外し、それ以外の失敗なら投げます（[第 12 回](12-sw-update-check.md)・[第 15 回](15-sw-safe-mode.md)）。ここで投げると、4 節の 390 行目で `SAFE_MODE` になります。
2. **691 行目：版のハッシュ**

   `hashManifest` は `JSON.stringify(manifest)` の SHA-1 です（[第 7 回](07-sw-versions.md)）。ファイルが 1 つでも変わると `hashTable` が変わるので、版のハッシュも変わります。
3. **692〜701 行目：まっさらな状態を作って DB に書く**

   版は 1 つ、タブの割り当ては空、最新はその版。3 つを `control` の表に書きます。
4. **709〜711 行目：古いキャッシュの掃除をアイドルに積む**

   DB を読めた場合も読めなかった場合も、ここは通ります。`'init post-load (cleanup)'` の中身は [第 14 回](14-sw-idle-cleanup.md)です。

📄 `angular/packages/service-worker/worker/src/driver.ts` L713–734 （▶ の行: 715, 720–721, 723）

```ts
713 │     // Initialize the `versions` map by setting each hash to a new `AppVersion` instance
714 │     // for that manifest.
715 ▶     Object.keys(manifests).forEach((hash: ManifestHash) => {
716 │       const manifest = manifests[hash];
717 │ 
718 │       // If the manifest is newly initialized, an AppVersion may have already been
719 │       // created for it.
720 ▶       if (!this.versions.has(hash)) {
721 ▶         this.versions.set(
722 │           hash,
723 ▶           new AppVersion(
724 │             this.scope,
725 │             this.adapter,
726 │             this.db,
727 │             this.idle,
728 │             this.debugger,
729 │             manifest,
730 │             hash,
731 │           ),
732 │         );
733 │       }
734 │     });
```

715 行目、`manifests` の版ごとに 723 行目で `AppVersion` を作り、`versions` の Map に入れます。720 行目は「もう作ってあれば作らない」です。`AppVersion` のコンストラクタはアセットグループとデータグループを作り、それぞれのキャッシュを開くだけで、ファイルは取りません（[第 7 回](07-sw-versions.md)）。デモの `settle(0)` のあとに `…:assets:app:cache` などが空のまま並ぶのはこのためです。

このあと、734 行目の続きで `assignments` を `clientVersionMap` に戻します。タブと版の対応の話なので [第 7 回](07-sw-versions.md)で読みます。

## 6. 先読みは「あとで」：scheduleInitialization

📄 `angular/packages/service-worker/worker/src/driver.ts` L752–780 （▶ の行: 753, 756, 768–769, 774, 776）

```ts
752 │     // Set the latest version.
753 ▶     this.latestHash = latest.latest;
754 │ 
755 │     // Finally, assert that the latest version is in fact loaded.
756 ▶     if (!this.versions.has(latest.latest)) {
757 │       throw new Error(
758 │         `Invariant violated (initialize): latest hash ${latest.latest} has no known manifest`,
759 │       );
760 │     }
761 │ 
762 │     // Finally, wait for the scheduling of initialization of all versions in the
763 │     // manifest. Ordinarily this just schedules the initializations to happen during
764 │     // the next idle period, but in development mode this might actually wait for the
765 │     // full initialization.
766 │     // If any of these initializations fail, versionFailed() will be called either
767 │     // synchronously or asynchronously to handle the failure and re-map clients.
768 ▶     await Promise.all(
769 ▶       Object.keys(manifests).map(async (hash: ManifestHash) => {
770 │         try {
771 │           // Attempt to schedule or initialize this version. If this operation is
772 │           // successful, then initialization either succeeded or was scheduled. If
773 │           // it fails, then full initialization was attempted and failed.
774 ▶           await this.scheduleInitialization(this.versions.get(hash)!);
775 │         } catch (err) {
776 ▶           this.debugger.log(err as Error, `initialize: schedule init of ${hash}`);
777 │         }
778 │       }),
779 │     );
780 │   }
```

1. **753 行目：`latestHash` を決める**

   ここで初めて、新しいタブに渡す版が決まります。756〜760 行目は「その版が `versions` に本当にあるか」の確認です。
2. **768〜779 行目：版ごとに `scheduleInitialization`**

   774 行目で呼び、失敗しても 776 行目でログに残すだけで、`initialize` 自体は成功で終わります。壊れた版の扱いは `versionFailed` に任せます（[第 15 回](15-sw-safe-mode.md)）。

📄 `angular/packages/service-worker/worker/src/driver.ts` L953–973 （▶ の行: 961, 964, 968–969, 972）

```ts
953 │   /**
954 │    * Schedule the SW's attempt to reach a fully prefetched state for the given AppVersion
955 │    * when the SW is not busy and has connectivity. This returns a Promise which must be
956 │    * awaited, as under some conditions the AppVersion might be initialized immediately.
957 │    */
958 │   private async scheduleInitialization(appVersion: AppVersion): Promise<void> {
959 │     const initialize = async () => {
960 │       try {
961 ▶         await appVersion.initializeFully();
962 │       } catch (err: any) {
963 │         this.debugger.log(err, `initializeFully for ${appVersion.manifestHash}`);
964 ▶         await this.versionFailed(appVersion, err);
965 │       }
966 │     };
967 │ 
968 ▶     if (isLocalhost(this.scope.registration.scope)) {
969 ▶       return initialize();
970 │     }
971 │ 
972 ▶     this.idle.schedule(`initialization(${appVersion.manifestHash})`, initialize);
973 │   }
```

📄 `angular/packages/service-worker/worker/src/driver.ts` L73–85 （▶ の行: 79, 82）

```ts
73 │ /**
74 │  * Determines if a given URL scope corresponds to localhost.
75 │  *
76 │  * @param scope The service worker registration scope URL to test
77 │  * @returns true if the scope is considered localhost, false otherwise
78 │  */
79 ▶ export function isLocalhost(scope: string): boolean {
80 │   // Use non-capturing groups and ensure localhost is at word boundary
81 │   // This prevents matching domains like "mylocalhost.com" while allowing valid localhost URLs
82 ▶   return /(?:^https?:\/\/)?(?:(?:^|[^\w.])localhost|\[::1\]|127(?:\.\d{1,3}){3})(?::\d+)?(?:\/.*)?$/.test(
83 │     scope,
84 │   );
85 │ }
```

1. **959〜966 行目：仕事の中身は `appVersion.initializeFully()`**

   961 行目。prefetch のアセットグループのファイルを全部取ってキャッシュに入れる仕事です（[第 8 回](08-sw-asset-groups.md)）。失敗したら 964 行目で `versionFailed` を呼びます。
2. **968〜970 行目：localhost ならその場で待つ**

   スコープが localhost（82 行目の正規表現。`localhost`・`[::1]`・`127.x.x.x`）なら、アイドルを待たずに 969 行目で全部取ってから返ります。`initialize` の 768 行目の `await` もそれを待つので、手元の開発サーバーでは初期化が終わった時点で先読みも終わっています（763〜765 行目のコメントの「development mode」）。
3. **972 行目：それ以外はアイドルに積む**

   `initialization(<ハッシュ>)` という名前で積みます。本番では、ページが最初に必要なファイルを取り終えて静かになってから先読みが始まります。デモの偽物のオリジンは `https://app.example` なので、こちらの道を通ります。

## 7. 本物の ngsw-worker.js で 1 段ずつ確かめる

> **🧪 DEMO — install → activate → settle(0) → settle(6000)**
>
> 本物の `ngsw-worker.js`（このサイトに入っている @angular/service-worker 22.1.6 の配布物）を、偽物のブラウザの上で動かします。偽物にしたのは `self.caches`・`self.fetch`・`clients`・タイマーと `Date.now`（仮想の時計）などで、一覧は `sw-sandbox.ts` の先頭のコメントにあります。このページに本物の Service Worker は登録しません。アプリは `/index.html`・`/main.js`・`/styles.css`（グループ app、prefetch）と `/assets/logo.svg`（グループ assets、lazy）です。`settle(ms)` は仮想の時計を ms 進めます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/sw-driver-lifecycle)

そのまま 4 回押すと、次のように進みます（ハッシュは 8 文字に縮めています）。

1. **new Driver の直後：`ngsw:/:db:control`（0 件）だけ**

   166 行目で表を開いたからです。キャッシュの名前の先頭の `ngsw:/:` はスコープごとに付く接頭辞です（[第 11 回](11-sw-database.md)）。
2. **`install()`・`activate()`：何も変わらない**

   177 行目の `skipWaiting` と 187 行目の `claim` はサーバーに何も取りに行きません。202 行目の `INITIALIZE` は、偽物の `registration.active.postMessage` が仮想の時計の 0 ミリ秒後に message のイベントとして届けるので、まだ処理されていません。
3. **`settle(0)`：`ngsw.json?ngsw-cache-bust=…` が 1 回届き、空のキャッシュが 4 つ増える**

   `INITIALIZE` → 315 行目 → 385 行目 → 666 行目で読めず → 690 行目で取る → 697 行目で `control` に 3 件。723 行目の `AppVersion` が app と assets の `cache` と `meta` を開きます。Task queue に `init post-load (cleanup)`（709 行目）と `initialization(…)`（972 行目）が並び、Latest に版のハッシュが入ります。
4. **`settle(6000)`：`/index.html`・`/main.js`・`/styles.css` が届き、Task queue が空になる**

   396 行目の `trigger` から 5 秒たってアイドルの仕事が走り、961 行目の `initializeFully` が prefetch のファイルを取りました。`/assets/logo.svg` は lazy なので取りません（[第 8 回](08-sw-asset-groups.md)）。

「ngsw.json を 500 で返す」に印を付けて始め直すと、`settle(0)` のあとの Driver state が `SAFE_MODE (Initialization failed due to error: Manifest fetch failed! (status: 500)` になり、Latest は none、Task queue は空のままです （初期化の仕事が何も積まれる前に 690 行目で投げたため）。

### ここまでの呼び出し

- `new Driver(scope, adapter, db)` — worker/main.ts:16 — *イベントを登録するだけ*
  - `install → skipWaiting()` — driver.ts:177
  - `activate → clients.claim()` — driver.ts:187
  - `registration.active.postMessage({action: 'INITIALIZE'})` — driver.ts:202 — *別のイベントで初期化するため*
- `onMessage → ensureInitialized(event)` — driver.ts:315
  - `this.initialized = this.initialize()` — driver.ts:385 — *2 回目からは 379 行目で同じ Promise*
    - `table.read('manifests' / 'assignments' / 'latest')` — driver.ts:666 — *初回は読めない*
    - `fetchLatestManifest() → hashManifest()` — driver.ts:690-691
    - `new AppVersion(...)` — driver.ts:723
    - `latestHash = latest.latest` — driver.ts:753
    - `scheduleInitialization → idle.schedule('initialization(…)')` — driver.ts:972
  - `event.waitUntil(this.idle.trigger())` — driver.ts:396 — *5 秒後に先読み*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| worker/test/happy\_spec.ts | describe `Driver`（257 行目）の it `activates without waiting`（271）・`claims all clients, after activation`（276）・ `initializes prefetched content correctly, after activation`（283）・`… after a request kicks it off`（300）・ `initializes the service worker on fetch if it has not yet been initialized`（313）・`… on message …`（333） | `//packages/service-worker/worker/test:test` |

📄 `angular/packages/service-worker/worker/test/happy_spec.ts` L271–298 （▶ の行: 272–273, 277, 280, 285–287, 290, 297）

```ts
271 │     it('activates without waiting', async () => {
272 ▶       const skippedWaiting = await scope.startup(true);
273 ▶       expect(skippedWaiting).toBe(true);
274 │     });
275 │ 
276 │     it('claims all clients, after activation', async () => {
277 ▶       const claimSpy = spyOn(scope.clients, 'claim');
278 │ 
279 │       await scope.startup(true);
280 ▶       expect(claimSpy).toHaveBeenCalledTimes(1);
281 │     });
282 │ 
283 │     it('initializes prefetched content correctly, after activation', async () => {
284 │       // Automatically advance time to trigger idle tasks as they are added.
285 ▶       scope.autoAdvanceTime = true;
286 ▶       await scope.startup(true);
287 ▶       await scope.resolveSelfMessages();
288 │       scope.autoAdvanceTime = false;
289 │ 
290 ▶       server.assertSawRequestFor('/ngsw.json');
291 │       server.assertSawRequestFor('/foo.txt');
292 │       server.assertSawRequestFor('/bar.txt');
293 │       server.assertSawRequestFor('/redirected.txt');
294 │       server.assertSawRequestFor('/redirect-target.txt');
295 │       expect(await makeRequest(scope, '/foo.txt')).toEqual('this is foo');
296 │       expect(await makeRequest(scope, '/bar.txt')).toEqual('this is bar');
297 ▶       server.assertNoOtherRequests();
298 │     });
```

`scope` は `SwTestHarness`（Node の中の偽物の `self`。[第 18 回](18-sw-testing-harness.md)）です。272 行目の `startup(true)` が install と activate を送り、273 行目で 177 行目の `skipWaiting` が呼ばれたことを、280 行目で 187 行目の `claim` が 1 回呼ばれたことを確かめます。285 行目の `autoAdvanceTime` は「アイドルの 5 秒待ちのタイマーが作られた瞬間に、偽物の時計をその分進める」スイッチで、287 行目で 202 行目の `INITIALIZE` を処理させます。297 行目の `assertNoOtherRequests` は、このページのデモの「サーバーに届いた」と同じものを、ずれなく確かめています。

📄 `angular/packages/service-worker/worker/test/happy_spec.ts` L313–331 （▶ の行: 315–316, 319–320, 328, 330）

```ts
313 │     it('initializes the service worker on fetch if it has not yet been initialized', async () => {
314 │       // Driver is initially uninitialized.
315 ▶       expect(driver.initialized).toBeNull();
316 ▶       expect(driver['latestHash']).toBeNull();
317 │ 
318 │       // Making a request initializes the driver (fetches assets).
319 ▶       expect(await makeRequest(scope, '/foo.txt')).toEqual('this is foo');
320 ▶       expect(driver['latestHash']).toEqual(jasmine.any(String));
321 │       server.assertSawRequestFor('/ngsw.json');
322 │       server.assertSawRequestFor('/foo.txt');
323 │       server.assertSawRequestFor('/bar.txt');
324 │       server.assertSawRequestFor('/redirected.txt');
325 │       server.assertSawRequestFor('/redirect-target.txt');
326 │ 
327 │       // Once initialized, cached resources are served without network requests.
328 ▶       expect(await makeRequest(scope, '/foo.txt')).toEqual('this is foo');
329 │       expect(await makeRequest(scope, '/bar.txt')).toEqual('this is bar');
330 ▶       server.assertNoOtherRequests();
331 │     });
```

315〜316 行目、install も activate も送らずに作った `Driver` は `initialized` が `null`。319 行目の fetch 1 つで初期化が走り、`latestHash` が入ります（ワーカーが起動し直したときの道）。このテストのハーネスのスコープは `http://localhost/` なので、968 行目の分かれ道で先読みもその場で済み、321〜325 行目のファイルがもう届いています。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
git status --short          # 走らせる前と後で同じか（ソースは変えない）
pnpm bazel test //packages/service-worker/worker/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=^Driver (activates without waiting|claims all clients|initializes)'
```

📄 `出力（2026-11-03 に実行。抜粋。ログは scratchpad/sw-logs/b-lifecycle.log）`

```
Ran 6 of 153 specs
6 specs, 0 failures
//packages/service-worker/worker/test:test                               PASSED in 0.6s
```

- 153 件のうち 6 件が走りました（happy\_spec の上の 6 つの it）。filter は「describe の名前 + 空白 + it の名前」への正規表現です。
- 0 件一致でも PASSED になるので、`Ran 6 of 153` の行を必ず見ます。

### 直すとしたら

- 起動の順番（install・activate・`INITIALIZE`）を変えるなら `Driver` のコンストラクタ（3 節）。it は happy\_spec の 271〜331 行目の形で、`scope.startup` と `server.assertSawRequestFor` を使って足します。
- 初期化で読むもの・書くものを変えるなら `initialize`（5〜6 節）。DB の中身が壊れていたときのテストは happy\_spec の it `cleans up properly when failing to load stored state` と `should not enter degraded mode if manifest for latest hash is missing upon initialization`（674〜680 行目の確認）が手本です。
- `SAFE_MODE` に入ったワーカーは起動し直すまで戻りません（390 行目と 378 行目）。この挙動に関係する issue は [第 20 回](20-sw-issues.md)の表で、戻り方の行は [第 15 回](15-sw-safe-mode.md)で読みます。本家に PR を出すことは勧めません。手元で確かめ、issue を読むときの手がかりにします。

## 聞かれそうな質問

**Q. 新しい ngsw-worker.js を出したのに、古いタブが閉じるまで待たないのはなぜ？**

install のハンドラーが 177 行目で `skipWaiting()` を呼ぶからです。173〜176 行目のコメントのとおり、ワーカーのコードの更新とアプリの版の更新は別物で、新しいワーカーも DB とキャッシュに残っている古い版を配れるので、待つ必要がありません。activate では 187 行目の `clients.claim()` で開いているタブも引き取ります。

**Q. activate のときにファイルを全部取るの？**

取りません。activate は 202 行目で自分に `INITIALIZE` を送るだけです。その message のイベントで `initialize` が走り、取るのは `ngsw.json`（690 行目）だけ。prefetch のファイルは 972 行目でアイドルに積まれ、最後のイベントから 5 秒後に取ります。スコープが localhost のときだけ 969 行目でその場で取ります。

**Q. ブラウザがワーカーを止めて起こし直したら、もう一度 ngsw.json を取るの？**

取りません。起動し直したワーカーは最初の fetch か message で `ensureInitialized` を呼び、666〜670 行目で DB から 3 つを読めるので catch に行きません。代わりに 684〜686 行目で更新の確認をアイドルに積み、5 秒後に `ngsw.json` を取ります。

**Q. 初期化が 2 回走ることはある？**

1 つのワーカーの中ではありません。385 行目で Promise を `initialized` に入れてから待つので、後から来たイベントは 378〜379 行目で同じ Promise を受け取ります。失敗した Promise も残るので、失敗したワーカーは起動し直すまで `SAFE_MODE` のままです。

**Q. DriverReadyState はどこで変わる？**

この章の範囲では 390 行目（初期化の失敗で `SAFE_MODE`）だけです。`EXISTING_CLIENTS_ONLY` に下がる行と `NORMAL` に戻る行は [第 15 回](15-sw-safe-mode.md)で読みます。

## 読み終えて

- 入口は `new Driver(scope, adapter, db)` の 1 行で、以後の仕事はすべてコンストラクタで登録したイベントから始まる。
- install は `skipWaiting`、activate は `clients.claim` と自分宛ての `INITIALIZE`。どちらもファイルを取らない。
- `ensureInitialized` は Promise を先に覚えて初期化を 1 回にし、失敗なら `SAFE_MODE`、どちらでも `idle.trigger()` を待たせる。
- `initialize` は DB の 3 つを読み、無ければ `ngsw.json` を取って作り直し、版ごとに `AppVersion` を作って、先読みをアイドルに積む。

---

← 前: [ワーカーの登録：provideServiceWorker と登録の戦略](04-sw-register.md)  
次: [fetch を横取りする：Driver.onFetch と handleFetch](06-sw-driver-fetch.md) →
