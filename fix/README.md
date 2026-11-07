[目次](../README.md)

# 見つけた不具合を手元で直す

> 手元の複製・失敗する spec・最小の直し・周りのテスト・コミットの書き方・閉じた PR を読む・出す前の点検

これまでのシリーズの最終回で、本家の不具合らしきものをいくつも見つけてきました。このシリーズでは、そのうち根拠の強い 8 つを、コミッターがするのと同じ手順で手元で直します。本家の木（../angular）は変えず、git clone --local で作った手元の複製の中だけで作業します。1 つの不具合ごとに枝を切り、本家と同じ形の spec を足して失敗を確かめ、できるだけ少ない行で直し、その spec と周りのテストが通ることを bazel で確かめ、本家の決まりの形でコミットします。直しが一部しか効かなかったもの、spec を直したら別の誤りが見つかったもの、メンテナーが「直すべきか」を疑っている既存の issue も、そのまま載せます。ページの上のデモは、手元で走らせたコマンドと出力、差分の記録の再生です。PR も issue も出しません。「出せる状態まで手元で仕上げる」までが、このシリーズの範囲です。

全 10 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/fix)

1. [直す前の準備：手元の複製と 1 つの直しの流れ](01-fix-overview.md)  
   git clone --local で複製を作り、pnpm install と bazel test を手元で走らせるまで。テストのターゲットの探し方（BUILD.bazel の名前、別のターゲットに分かれた spec）、--test\_arg=--filter が効くものと効かないもの（Node の jasmine とブラウザの web test runner）、shard、1 つの不具合に 1 つの枝、コミットのときに動くフック（ng-dev format staged と commit-message の検査）。
2. [enum の値がずれる：partial evaluator の 1 行](02-fix-enum.md)  
   ngtsc の PartialEvaluator が、初期値の無い enum のメンバーの値を「並びの番号」にしていた件。evaluator\_spec に失敗する it を足し、4 つのファイルシステム（runInEachFileSystem）で落ちるのを確かめ、前のメンバーの値に 1 を足す形に直す。周りのテストと、コミットの本文の書き方。
3. [消えた修正を戻す：@defer (on immediate) と SSR の placeholder](03-fix-defer-immediate.md)  
   2024 年の修正（383e093e6a1）が足した「サーバーでは placeholder を描く」条件が、あとの作り直しで落ちていた件。git log -S と git show で消えた行を追い、full\_app\_hydration\_spec に spec を足して空の SSR 出力を確かめ、条件を戻す。元の修正に spec が無かったことが、なぜ後退を招いたか。
4. [同じ修正の取りこぼし：Shift クリックが再生されない](04-fix-event-replay-clickmod.md)  
   clickmod を外したコミット（2a915d1912d）が、イベントの委譲の EventDispatcher にだけ clickModSupport: false を渡し、イベントの再生の EventDispatcher に渡していなかった件。spec が別のターゲット（event\_replay\_test）にあって最初は 0 件しか走らなかったこと、domino の上で修飾キーの付いたクリックを作る書き方、1 行の直し。
5. [アプリが安定しない：@error の無い塊の読み込みの失敗](05-fix-defer-error-stable.md)  
   インクリメンタルハイドレーションが ON\_COMPLETE\_FNS の呼び出しを待つのに、その呼び出しが「状態のテンプレートがあるとき」の中にあったため、@error の無い塊の読み込みが失敗すると PendingTasks が戻らなかった件。whenStable を時間で区切って「安定しない」を spec にする書き方と、呼び出しを if の外へ出す直し。
6. [spec を直す：何も確かめていない expect を見つける](06-fix-spec-assertions.md)  
   incremental\_hydration\_spec の 4 つの it が、ハイドレーションのあとに &lt;div jsaction= が無いことを確かめていたが、要素は &lt;article&gt; だった件。イベントを送る行を一時的に消しても通ること（空回り）を示し、要素の名前を直すと keydown の it が落ちて、泡立たないイベントという 2 つ目の誤りが見つかった流れ。test: のコミット。
7. [一部しか直らない直し：declare のフィールドと NodeFlags.Ambient](07-fix-declare-field.md)  
   Angular のクラスの、ほかのデコレーターが付いた declare のフィールドが useDefineForClassFields で JS に出る件。TypeScript がパーサーの付けた内部の印でフィールドを落としていること、作り直したノードでその印が消えること、内部の API に頼る直しがビルドで落ちたこと、公開の API だけの直しで直る範囲と残る形（@Input() declare）を一時的な it で確かめたこと。
8. [覚えたままの出力：Elements の ReplaySubject](08-fix-elements-outputs.md)  
   ComponentNgElementStrategy の eventEmitters（ReplaySubject(1)）が、壊したコンポーネントの出力を覚えたままで、つなぎ直したときの購読が NG0953 で閉じる件。strategy の単体の spec で「壊したあとに購読してもエラーにならない」を確かめ、壊すときに空の配列を流す 1 行の直し。
9. [直せても出さない：#38778 と閉じた 2 つの PR](09-fix-elements-reconnect.md)  
   2020 年から開いている #38778（つなぎ直すとコンポーネントが作られない）を、手元では 1 行で直せた。そのうえで、閉じた PR #38816 と #58586 のレビューを読み、メンテナーが「壊して作り直すこと自体」を疑い、#64229 と #64228 に設計の話を移したことを確かめる。直す前に読むべきもの。
10. [出す前の点検：8 つの直しをどう並べるか](10-fix-before-issue.md)  
   8 つの枝を 1 つに重ねて関係するテストをすべて走らせた結果、spec の衝突、新しい main の上に乗るかの確かめ、gh（読むだけ）で同じ報告や PR を探した結果。issue を書くときに要るもの（最小の再現・版・期待と実際）、レビューで聞かれそうなこと、どれから出すか・出さないか、直さないと決めたものとその理由。
