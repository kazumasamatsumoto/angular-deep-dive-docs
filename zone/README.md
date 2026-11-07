[目次](../README.md)

# zone.js の内側

> モンキーパッチから NgZone まで

zone.js は「ブラウザ API を書き換える」と説明されます。実際に何をどう書き換え、タスクをどう数え、Angular がそれをどう使って変更検知のタイミングを決めていたかを読みます。

全 13 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/zone)

1. [zone.js は何をしていたのか（概観）](01-ngzone.md)  
   中心にあるのは入れ子カウンタ 1 つだけ。非同期処理を onEnter と onLeave で挟み、0 に戻ったら変更検知。zoneless で外せた理由も分かる。
2. [Zone とは何か：非同期をまたいで引き継がれる実行文脈](02-zone-what.md)  
   ZoneImpl のフィールドは parent / name / \_properties / \_zoneDelegate。fork で子を作り、run で「今の zone」を切り替える。Zone.current の正体は 1 本のスタック。
3. [モンキーパッチの実際：setTimeout が差し替わる手順](03-zone-patching.md)  
   patchBrowser → patchTimer → patchMethod。window.setTimeout が別の関数に置き換わり、元の関数は \_\_zone\_symbol\_\_setTimeout に退避される。
4. [Task のライフサイクル：scheduleTask → invokeTask → cancelTask](04-zone-task.md)  
   ZoneTask の state は notScheduled / scheduling / scheduled / running / canceling。\_transitionTo が遷移を検査し、runCount が実行回数を数える。
5. [ZoneDelegate：親子の鎖で割り込む](05-zone-delegate.md)  
   fork したときに渡した onInvokeTask などの ZoneSpec は、ZoneDelegate の鎖に組み込まれる。自分にないフックは親の delegate に委ねる。Angular はこの鎖の 1 段。
6. [マイクロタスクキュー：ZoneAwarePromise と drainMicroTaskQueue](06-zone-microtask.md)  
   Promise そのものが差し替えられる。then のコールバックは \_microTaskQueue に入り、最外のタスクが終わった瞬間に drainMicroTaskQueue が一気に流す。
7. [addEventListener のパッチ：EventTask](07-zone-events.md)  
   patchEventTarget が addEventListener を置き換え、リスナーを EventTask で包む。要素ごとに \_\_zone\_symbol\_\_clickfalse という配列でタスクを持つ。
8. [hasTask と \_updateTaskCount：残りタスクを数える](08-zone-hastask.md)  
   ZoneDelegate.\_taskCounts が microTask / macroTask / eventTask の数を持つ。0 と 1 の境目をまたいだときだけ onHasTask が呼ばれる。NgZone はこれを聞いている。
9. [NgZone：Angular が fork する 1 つの zone](09-zone-ngzone-fork.md)  
   constructor で Zone.current を \_outer に取り、fork した子を \_inner にする。forkInnerZoneWithAngularBehavior が渡す 4 つのフックと isAngularZone プロパティ。
10. [onEnter / onLeave / checkStable：「安定」の判定](10-zone-ngzone-stability.md)  
   \_nesting が 0、マイクロタスクが残っていない、まだ安定と言っていない。3 条件がそろったら onMicrotaskEmpty を emit し、その後で onStable。
11. [NgZoneChangeDetectionScheduler：onMicrotaskEmpty → tick](11-zone-ngzone-scheduler.md)  
   provideZoneChangeDetection が ZONELESS\_ENABLED を false にし、NgZone を本物に差し替え、ENVIRONMENT\_INITIALIZER で購読を開始する。tick は ViewTreeGlobal で全走査。
12. [eventCoalescing / runCoalescing と runOutsideAngular](12-zone-coalescing.md)  
   delayChangeDetectionForEvents が checkStable を rAF まで遅らせる。1 クリックで複数のイベントが連続しても変更検知は 1 回。\_outer.run で外に出る抜け道。
13. [1 クリックの全行程（zone.js あり）](13-zone-click-trace.md)  
   パッチ済みリスナー → ZoneTask.invokeTask → onInvokeTask → onEnter → あなたのハンドラ → markViewDirty → onLeave → checkStable → onMicrotaskEmpty → tick。呼び出し順をすべて並べる。
