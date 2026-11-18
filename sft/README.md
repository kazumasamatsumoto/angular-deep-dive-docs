[目次](../README.md)

# Signal Forms のフィールドの木：子を作り、配列を追い、古い木と橋をかける

> 子の作り方・配列の追跡と孤児のフィールド・proxy と context・SignalFormControl と extract・spec と issue

form() が返すフィールドの木は、モデルの値を見ながら子の FieldNode を必要になったときだけ作り、配列では要素の動きを追って同じ子を使い回します。既存の signal-forms と forms-sf-\* の章が FieldNode と検証・状態のルールを読んだので、このシリーズはその下で木の形を決めている field/structure.ts を中心に読みます。子の作り方（98c5afdb021 の遅延の作成）、配列の追跡と取り除かれた要素の孤児のフィールド（3c44d7c90b2・5835a5e3a73）、f\[0\].name のような読み方を支える proxy と context、リアクティブフォームの中で Signal Forms を使う SignalFormControl と extract を順に追います。origin/main の続きも読みます。

全 5 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/sft)

1. [子の作り方：FieldNodeStructure が値から子を作る](01-sft-structure.md)  
   field/structure.ts の FieldNodeStructure が、モデルの値のキーを見て子の FieldNode を作る手順。children と materializedChildren の違い、getChild と ensureChildrenMap が子を段ごとに必要になったときだけ作る仕組み（98c5afdb021）、computeChildrenMap が前の子を使い回す条件、Root と Child の構造の違い。掃除の effect（manager.ts）が children() でたどるため、最初の変更検知で全部の子が作られてしまうこと（#70627）も本物で確かめる。
2. [配列の追跡：要素が動いても同じフィールドを使う](02-sft-array-identity.md)  
   配列の要素のオブジェクトに書き込む TrackingKey（symbol の印）、createKeyOrOrphanSignals が親の子の表から自分の位置を探し孤児を見分ける行、maybeRemoveStaleArrayFields・maybeRemoveStaleObjectFields が消えた子を外す行（73ab88e65bf）、孤児のフィールドが落ちないようにした 3c44d7c90b2・5835a5e3a73。同じ印の要素が 1 つの子を共有する #70840 と、keyInParent が文字列の #71616 も今のコードで確かめる。
3. [proxy と context：f.items\[0\].name と読めるわけ](03-sft-proxy-context.md)  
   field/proxy.ts の FIELD\_PROXY\_HANDLER が、プロパティの読み出し・length・Symbol.iterator・ownKeys・getOwnPropertyDescriptor を子のフィールドと値のキーに変える行と、has の罠が無いので in が target の関数を見ること（#70252）、FieldNodeContext の key・index・pathKeys・valueOf・stateOf・fieldTreeOf と resolve の cache（鍵が path だけ）、di.ts・util.ts・resolution.ts、2a141847a5e の isFieldTree。
4. [SignalFormControl と extract：リアクティブフォームの中の Signal Forms](04-sft-signal-form-control.md)  
   compat/src/signal\_form\_control の SignalFormControl が AbstractControl として振る舞うための行（値の 3 通りの書き方と親への知らせの回数、touched・dirty の伝え方、何もしない・投げるメソッド、ルールで status だけが変わったとき #72009）、compatForm の葉の CompatStructure と検証の写し方（#71634・#71633）、extract.ts の extractValue（b542302a23c で反応するように直った）。origin/main の 12278e5f67b・9e99093bfe3・97bde8aa6cb・4422f4ef509 と 22.2.6。
5. [spec と issue を読む：フィールドの木を固めているテスト](05-sft-tests-issues.md)  
   packages/forms/signals/test の node と web の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で 1 行ずつ変えて見つけた spec の無い行、フィールドの木の issue と PR の表、origin/main の続きと、このシリーズで見つけたもの。
