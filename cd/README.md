[目次](../README.md)

# 変更検知の各ステップ

> tick の中で起きていること

ApplicationRef.tick() が呼ばれてから DOM が書き換わるまで。どのビューを更新し、どれを飛ばし、フックやエフェクトをいつ呼ぶのかを関数単位で追います。

全 9 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/cd)

1. [変更検知は何を見て「省略」するか（概観）](01-change-detection.md)  
   LView のフラグと refreshView() の実装から、OnPush・markForCheck・Signal の 3 つがどう一本の仕組みに合流しているかを読み解く。
2. [detectChangesInView：更新する 4 つの理由と 2 つのモード](02-cd-detect-changes-in-view.md)  
   shouldRefreshView を決める ||= の 4 行を 1 行ずつ。Global と Targeted の違い、HasChildViewsToRefresh だけが立っているときに「通り道」として降りる処理。
3. [refreshView の全ステップを上から下まで](03-cd-refresh-view.md)  
   enterView → テンプレート Update → preOrder フック → view effect → 埋め込みビュー → content フック → host binding → 子コンポーネント → view フック → フラグの後始末。順番に理由がある。
4. [OnPush と markForCheck：Dirty を根まで伸ばす](04-cd-onpush-markforcheck.md)  
   CheckAlways が立っていないビューは Dirty がないと飛ばされる。markViewDirty は親へ親へと Dirty を立てながら根まで登り、途中で止まらない。
5. [テンプレートの ReactiveLViewConsumer](05-cd-signal-consumer.md)  
   LView\[REACTIVE\_TEMPLATE\_CONSUMER\] に入る consumer。consumerBeforeComputation で依存を集め、signal が変わると consumerMarkedDirty → markAncestorsForTraversal。CheckAlways 用の一時 consumer も。
6. [HasChildViewsToRefresh と Targeted モード：通り道だけ降りる](06-cd-targeted-traversal.md)  
   markAncestorsForTraversal は Dirty ではなく HasChildViewsToRefresh を立てる。Targeted モードは RefreshView か「通り道」のビューしか触らない。OnPush でも signal で更新される理由。
7. [checkNoChanges と ExpressionChangedAfterItHasBeenChecked](07-cd-check-no-changes.md)  
   開発モードでは tick のあとに 2 回目の走査がある。bindingUpdated が CheckNoChangesMode で値の変化を見つけると例外。exhaustive モードとの違い。
8. [afterRender / afterNextRender はいつ走るか](08-cd-after-render.md)  
   AfterRenderManager.execute が synchronizeOnce の末尾で呼ばれる。4 つのフェーズの順番と、フックの中でビューを dirty にするとループに戻る仕組み。
9. [effect はいつ走るか：root effect と view effect](09-cd-effects.md)  
   コンポーネントの中で作った effect は LView\[EFFECTS\] に入り refreshView の中で走る。外で作った effect は ZoneAwareEffectScheduler.flush で tick の冒頭に走る。
