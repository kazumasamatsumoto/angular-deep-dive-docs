[目次](../README.md)

# Signal Forms の型を読む：FieldTree から SchemaPath まで、api/types.ts の 1000 行

> FieldTree と Field・FieldState の読み口・Compat と binding の型・PathKind と SchemaPath・validateHttp と debounce・型の spec と issue

Signal Forms の公開の API は、関数の数より型の数のほうが多く、その大半が packages/forms/signals/src/api/types.ts の 1 ファイルに入っています。form() が返す FieldTree が呼ぶと FieldState を返す関数でもあり、プロパティで子に下りられる木でもあること、FieldState と ReadonlyFieldState の読み口、PathKind の 3 つの種類で FieldContext の形が変わること、SchemaPath にルールを付けられるかを型で禁じる SchemaPathRules を、型の定義とそれを固める spec で読みます。最後に、型だけでは足りない validateHttp と debounce の実装を読みます。

全 6 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/sfty)

1. [FieldTree と Field：呼べて、プロパティで下りられる木の型](01-sfty-tree.md)  
   types.ts の Field・FieldTree・ReadonlyFieldTree・Subfields・ReadonlyArrayLike・MaybeFieldTree。関数の型とオブジェクトの型の交差で「f() で状態、f.name で子」を表す書き方、配列・タプル・Record・undefined を含む値の扱い、型と実行時の Proxy が食い違う所、型の spec（types.spec.ts・field\_proxy.spec.ts）で固めている行。
2. [FieldState と ReadonlyFieldState：状態の読み口を型で並べる](02-sfty-state.md)  
   types.ts の ReadonlyFieldState と FieldState のメンバー（value・errors・disabledReasons・metadata・min/max などの読み口、markAsTouched・reset）、どれが Signal でどれが関数か、ReadonlyFieldTree から得たときに書き込みを消す仕組み。node.ts の実装とどう対応するか。
3. [検証の結果と binding の型：ValidationResult・DisabledReason・FormFieldBinding・CompatFieldState](03-sfty-results.md)  
   types.ts の前半と中ほど：MarkAsTouchedOptions・OneOrMany・DisabledReason・ValidationSuccess・AsyncValidationResult、CompatFieldState・FormFieldBinding。null・undefined・void を「成功」とまとめる型と、それをルールの種類ごとに受ける logic\_node.ts の builder・addDefaultField・ArrayMergeIgnoreLogic の扱い、型を外した false や文字列が実行時にどうなるか。
4. [PathKind と SchemaPath：ルールを付けられる場所を型で決める](04-sfty-path.md)  
   types.ts の後半：PathKind（Root・Child・Item）と SchemaPathRules（Supported・Unsupported）という型だけの印、SchemaPath・CompatSchemaPath・SchemaPathTree・MaybeSchemaPathTree、Schema・SchemaFn・SchemaOrSchemaFn、LogicFn・Validator、FieldContext と RootFieldContext・ChildFieldContext・ItemFieldContext、ItemType。applyEach の中だけ index が読める理由と、実行時は 1 つの FieldNodeContext であること。手元の tsc の型エラー 13 の形。
5. [validateHttp と debounce：型の外にある、時間と通信の約束](05-sfty-http-debounce.md)  
   debounce のルール（Debouncer：入力欄の値 → モデル）と validateHttp の debounce（core の DebounceTimer：モデル → 問い合わせ）の違い、debounce.ts の数と 'blur' の実装、待ちを取り消す 4 つの道（touched・submit で書く。cf37344a4d6）、HttpValidatorOptions の request・onSuccess・onError・options と validateAsync への下り方。偽物の XhrFactory で外部に通信しないデモ。
6. [spec と issue を読む：型と時間の約束を固めているテスト](06-sfty-tests-issues.md)  
   test/node/types.spec.ts・field\_context.spec.ts・path.spec.ts・api/when.spec.ts・api/debounce.spec.ts・resource.spec.ts が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、型の spec が jasmine で 0 本でもコンパイル（@ts-expect-error と TS2578）で検査される仕組み、型と debounce・validateHttp の issue と PR の表、origin/main の続き。
