[目次](../README.md)

# zoneless の内側

> 通知からスケジューリングまで

v21 から zoneless が既定です。「フラグを付けると zone.js が外れる」で終わらせず、誰が通知を出し、通知がどう dirty フラグになり、いつ tick が走るのかを 1 ステップずつ読みます。

全 11 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/zoneless)

1. [zoneless は既定になった：internalCreateApplication が差し込む 3 つのプロバイダ](01-zoneless-default.md)  
   ChangeDetectionScheduler → ChangeDetectionSchedulerImpl、NgZone → NoopNgZone、ZONELESS\_ENABLED → true。provideZoneChangeDetection はこれを上書きしているだけ。
2. [15 種類の通知：NotificationSource を全部読む](02-zoneless-notification-source.md)  
   MarkAncestorsForTraversal / SetInput / MarkForCheck / Listener / RootEffect …。それぞれ誰が、どのコード行から送っているのかを 1 つずつ特定する。
3. [notify：通知が ApplicationRefDirtyFlags になる](03-zoneless-notify.md)  
   switch 文で 15 種類が 4 つのビットに畳まれる。ViewTreeTraversal / ViewTreeCheck / RootEffects / AfterRender。shouldScheduleTick が「もう予約済み」を弾く。
4. [scheduleCallbackWithRafRace：setTimeout と requestAnimationFrame の競走](04-zoneless-raf-race.md)  
   先に来たほうで tick を走らせ、負けたほうは cancel する。rAF だけだと背景タブで止まり、setTimeout だけだと描画と同じフレームに乗らない。
5. [scheduler.tick → ApplicationRef.\_tick → synchronize](05-zoneless-tick.md)  
   dirtyFlags が None なら何もしない。RootEffects を流し、ビューを Targeted で走査し、afterRender を実行し、まだ dirty なら最大 100 回ループする。
6. [連続通知と microtask スケジューラ](06-zoneless-microtask.md)  
   tick 直後の 1 マイクロタスクの間だけ、次の tick を queueMicrotask で予約する。同じ描画フレームに収めるための切り替えと、100 回で止める安全装置。
7. [signal.set() から画面更新まで](07-zoneless-signal-path.md)  
   signalSetFn → producerNotifyConsumers → REACTIVE\_LVIEW\_CONSUMER.consumerMarkedDirty → markAncestorsForTraversal → notify → tick → Targeted → refreshView。全関数を順に。
8. [(click) から画面更新まで（zoneless）](08-zoneless-listener-path.md)  
   wrapListener → markViewDirty(Listener) → notify(Listener) → ViewTreeCheck → tick。zone.js ありのときは Listener 通知が無視される理由も。
9. [PendingTasks と isStable：安定は zone ではなくカウンタで判定](09-zoneless-pending-tasks.md)  
   PendingTasksInternal.add / remove が数を持ち、hasPendingTasksObservable が isStable になる。tick の予約、HttpClient、ルーターのナビゲーションが同じカウンタを使う。
10. [zone.js と同居するとき：ハイブリッドの判定](10-zoneless-hybrid.md)  
   zoneIsDefined / angularZoneId / shouldScheduleTick の zone 判定。zone の中にいるなら zone に任せ、外にいるならスケジューラが動く。onUnstable で予約を取り消す。
11. [zoneless で動く条件、動かなくなる書き方](11-zoneless-migration.md)  
   setTimeout で普通のフィールドを書き換えると画面が変わらない。signal・markForCheck・async pipe・イベントは通知を出す。provideZonelessChangeDetection の警告の意味。
