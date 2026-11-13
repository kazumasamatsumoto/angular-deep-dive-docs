[目次](../README.md)

# resource の細部と新しい部品

> params の特別な戻り値と chain・debounced・エラーの包み方・SSR のキャッシュ・後片付けと漏れの修正・spec と issue

resource() の大筋（状態・loadEffect・set と reload・snapshot）は signals シリーズの「非同期を Signal の世界に持ち込む」で、httpResource と rxResource は「httpResource と rxResource」で読みました。resource は v20 から v22 にかけて安定版になるまでに、params から状態を返す仕組み、ほかの resource を待つ chain()、signal を遅らせる debounced()、SSR のキャッシュ、購読の漏れの修正などが次々に足されています。このシリーズでは、その新しい部品と細部を、コミットと spec と一緒に 1 つずつ読みます。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/resx)

1. [params から状態を返す：ResourceParamsStatus と chain()](01-resx-params-status.md)  
   params の関数が値の代わりに ResourceParamsStatus.IDLE や LOADING や Error を投げると、extRequest の catch がそれを受けて resource をその状態にする仕組み（2206efa55fc）と、LOADING やエラーでは loader を呼ばない行。params に渡される context の chain() が、ほかの resource の status() を読み、resolved と local 以外は投げて前へ伝える行（reloading も LOADING になる）。params の中で resource を作ると NG0992 になる印と、それが入れ子で下りてしまうこと。params のエラーの後に idle になると value() も hasValue() も投げる穴（#71585 の reload も同じ）。ページの上の本物で 2 段につないだ resource の状態を見る。
2. [debounced()：signal を遅らせて resource の params にする](02-resx-debounced.md)  
   debounce.ts の debounced() が、元の signal の変化を時間か Promise で遅らせ、その間を loading の Resource として見せる行。状態は linkedSignal で持ち、動かすのは effect だけなので、set の直後はまだ resolved のまま（#71636）。古いタイマーを止める修正（0904f90b13a、数で待つときだけ）、計算の循環を避けるための遅い初期化（50e599e73ec）。chain(debounced) と Signal Forms の validateAsync の debounce との関係。ページの上で打った回数・タイマー・loader の回数を数える。
3. [エラーの包み方：value() が投げるとき、ResourceValueError と rethrowFatalErrors](03-resx-errors.md)  
   loader が投げた値が Error でないときに包む encapsulateResourceError と isErrorLike（22.1.6 では null を投げると TypeError になる）、error の状態で value() を読むと ResourceValueError が投げられる行と hasValue() の型、rethrowFatalErrors が投げ直すのは NG0992 だけであること。rxResource の Observable が値を出さずに終わったときの NG0991（-991 にした 8975b4346d5）、stream が Observable を返す前に投げたときの後片付けの修正（9ae98753849）。テンプレートで value() を読むときに何が起きるかをページの上で確かめる。
4. [SSR と resource：id で TransferState に値を残す、待ってから描く](04-resx-ssr-cache.md)  
   resource と rxResource の id オプション（5a7c1e62dc2）が、サーバーの loadEffect で resolved にした直後に値を TransferState に 1 回だけ書き（saveToTransferState）、ブラウザでは状態の linkedSignal の最初の計算で読んで resolved から始め、loader を呼ばない行。provideClientHydration が入れる CACHE\_ACTIVE が、アプリが最初に安定したところで止まること。サーバーが PendingTasks の仕事が外れるまで whenStable で待ってから HTML を作る行と、httpResource の転送キャッシュ（88685cb3b6d）との違い。Node でサーバー描画とハイドレーションを動かした記録の再生。
5. [後片付けと漏れ：destroy、abort、購読の漏れの修正](05-resx-cleanup-leaks.md)  
   壊す・params を変える・set() の入口がどれも abortInProgressLoad で AbortController を止めること、abort を受けて購読をやめる rxResource と httpResource の onAbort に足されてきた修正（93e8565f0ef・080b3687d32・e0e902a8fa9・63886758787・5128dec0ca1）を、コミットの差分と spec で読む。読み込み中に params が使えなくなると前の読み込みが止まらない穴と、origin/main の修正（efbab16e567・833c1f2c96c）。ページの上の本物で、loader の回数・abort・まだ解決していない Promise・生きている購読を数える。
6. [spec と issue を読む：resource の振る舞いを決めているテスト](06-resx-tests-issues.md)  
   core/test/resource の resource\_spec.ts・chain\_spec.ts・params\_status\_spec.ts・debounce\_spec.ts・resource\_snapshot\_spec.ts（70 件）、rx\_resource\_spec.ts、common/http の resource\_spec.ts が、このシリーズの各章の約束をどの it で固めているかの地図。手元での走らせ方と結果、修正の行を消しても通る it。resource に関係する開いている issue と閉じた issue の表。
