[目次](../README.md) › [Signal Forms の型を読む：FieldTree から SchemaPath まで、api/types.ts の 1000 行](README.md) › 第 6 回 / 全 6 回

# spec と issue を読む：型と時間の約束を固めているテスト

> test/node/types.spec.ts・field\_context.spec.ts・path.spec.ts・api/when.spec.ts・api/debounce.spec.ts・resource.spec.ts が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、型の spec が jasmine で 0 本でもコンパイル（@ts-expect-error と TS2578）で検査される仕組み、型と debounce・validateHttp の issue と PR の表、origin/main の続き。

angular/angular · 読了 約 10 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/sfty-tests-issues)

---

シリーズの最後に、第 1〜5 回で読んだ型と時間の約束を固めている spec が、どのファイルのどの describe にあり、どう走らせ、どう「落ちる」のかを地図にします。型の spec は実行時の expect がほとんど無く、コンパイルが通ること自体が検査です。その仕組み（関数の中の describe と `@ts-expect-error`）を行で読み、手元で走らせた数、型と debounce・validateHttp の issue と PR の表、origin/main の続きをまとめます。

読む対象は `packages/forms/signals/test/node/` の `types.spec.ts`・`field_context.spec.ts`・`path.spec.ts`・`api/when.spec.ts`・`api/debounce.spec.ts`・`resource.spec.ts` です（../angular、8576f161ae4）。`node/BUILD.bazel` の作りは[sft-tests-issues](../sft/05-sft-tests-issues.md)に、1 本だけ走らせる方法は[テストを 1 本走らせる](../contrib/05-contrib-run-tests.md)にあります。

1. [1. FieldTree と Field](01-sfty-tree.md)
2. [2. FieldState の読み口](02-sfty-state.md)
3. [3. 検証の結果と binding の型](03-sfty-results.md)
4. [4. PathKind と SchemaPath](04-sfty-path.md)
5. [5. validateHttp と debounce](05-sfty-http-debounce.md)
6. **6. spec と issue**（この章）

## 1. spec の地図

パスは `packages/forms/signals/test/` から、括弧の数は describe の行、ほかの数は it の行です。「it」は行の頭が `it(` の数、「走らせた数」は 2 節の絞り込みで jasmine が数えた数です。「種類」の「型」は、コンパイルが通るか（と `@ts-expect-error`）だけで確かめるもの、「実行」は jasmine の expect で確かめるものです。

| ファイル | describe と主な it（行） | it | 走らせた数 | 種類 | 章 |
| --- | --- | --- | --- | --- | --- |
| `node/types.spec.ts` | types（55）› 56・62・68 SchemaFn の当てはめ・75・81・87 Schema の当てはめ・94 undefined を含む子にルールを付けない・104 再帰の型・109 ジェネリックの和・118・131 配列の反復・143 FieldState → ReadonlyFieldState・150・164 ルールの中から書けない・metadata（176）› 177・193・209 | 17 | 0（関数の中の describe） | 型 | [第 1 回](01-sfty-tree.md)・[第 2 回](02-sfty-state.md)・[第 4 回](04-sfty-path.md) |
| `node/field_context.spec.ts` | Field Context（44）› 45 value・52 state・59 fieldTree・67 key・96 index・135 pathKeys・156 valueOf・164 stateOf・172 fieldTreeOf | 9 | 9 | 型と実行 | [第 4 回](04-sfty-path.md) |
| `node/path.spec.ts` | path（13）› Active path（14）› 15 applyWhen・37 apply・55 同じ path・73 applyEach の中で外の path を使うと投げる | 4 | 4 | 実行 | [第 4 回](04-sfty-path.md) |
| `node/api/when.spec.ts` | when（29）› 30・49 外の path・65・99・119・142 applyEach と組む・applyWhenValue（166）› 167 狭めない述語・192 狭める述語（201 行目の value() は number） | 8 | 6 ＋ 2 | 型と実行 | [第 4 回](04-sfty-path.md) |
| `node/compat/compat.spec.ts` | Forms compat（28）› 498 FormControl の path にルールを付けない（507・509 の @ts-expect-error）・type test all rules（684）・type tests（752） | 32 | 1（498 だけ絞って） | 型と実行 | [第 4 回](04-sfty-path.md)・[第 3 回](03-sfty-results.md) |
| `node/field_proxy.spec.ts` | FieldTree proxy（13）› 14 メソッドを転送しない（16 の @ts-expect-error）・20 配列を広げる・136 プリミティブは反復できない | 11 | ― | 型と実行 | [第 1 回](01-sfty-tree.md) |
| `node/field_node.spec.ts` | FieldNode › fieldTree（216）・touched 504・disabled 886・927・validation 1227 | 92 | ― | 実行 | [第 2 回](02-sfty-state.md)・[第 3 回](03-sfty-results.md) |
| `node/api/debounce.spec.ts` | debounce（14）› by duration（15）3・by function（71）5・abort signal（190）3・until blurred（272）2・inheritance（315）4・aggregation（395）4 | 21 | 21 | 実行 | [第 5 回](05-sfty-http-debounce.md) |
| `node/resource.spec.ts` | resources（45）› 241 validateHttp の短い形・285 同期が通ったときだけ・316 onError・348 2 回の適用・409 validateHttp の debounce・reloadValidation（444） | 13 | 13 | 実行 | [第 5 回](05-sfty-http-debounce.md) |
| `web/form_field.spec.ts` | debounce（5988）› 5989 native・6016 custom control・6048 reset・6086 根の reset | 4 | 350 本の中（web は絞れない） | 実行 | [第 5 回](05-sfty-http-debounce.md) |

## 2. 走らせ方と結果

📄 `走らせたコマンドと結果（2026-11-19、8576f161ae4）`

```
$ cd ~/angular-research/angular        # 8576f161ae4
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all
539 specs, 0 failures
$ pnpm bazel test //packages/forms/signals/test/node:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=^debounce "        # ほかも同じ形で、describe の名前を ^ と空白で挟む
$ pnpm bazel test //packages/forms/signals/test/web:test_chromium --nocache_test_results --test_output=all
Chromium: 1/1 test files | 350 passed, 0 failed
```

| 絞り込み | 結果 |
| --- | --- |
| `node:test（絞り込みなし）` | PASSED（539 specs, 0 failures） |
| `--filter=^types ` | Ran 0 of 539 specs（3 節） |
| `--filter=^Field Context ` | Ran 9 of 539 specs、0 failures |
| `--filter=^path ` | Ran 4 of 539 specs、0 failures |
| `--filter=^when ` | Ran 6 of 539 specs、0 failures |
| `--filter=^applyWhenValue ` | Ran 2 of 539 specs、0 failures |
| `--filter=Forms compat disallows passing a path` | Ran 1 of 539 specs、0 failures |
| `--filter=^debounce ` | Ran 21 of 539 specs、0 failures |
| `--filter=^resources ` | Ran 13 of 539 specs、0 failures |

`^types ` が 0 本なのは 3 節の理由です。web の suite（`//packages/forms/signals/test/web:test_chromium`）は `--filter` が効かないので全部を走らせ、350 本が通りました。`form_field.spec.ts` の `describe('debounce')` の 4 本はその中に入っています。

## 3. 型の spec は「コンパイルが通ること」で検査する

📄 `angular/packages/forms/signals/test/node/types.spec.ts` L54–73 （▶ の行: 54–55, 57–59, 63–65, 69–72）

```ts
54 ▶ function typeVerificationOnlyDoNotRunMe() {
55 ▶   describe('types', () => {
56 │     it('should apply schema function of exact type', () => {
57 ▶       const pizzaOrder: WritableSignal<PizzaOrder> = null!;
58 ▶       const pizzaOrderSchema: SchemaFn<PizzaOrder> = null!;
59 ▶       form(pizzaOrder, pizzaOrderSchema);
60 │     });
61 │ 
62 │     it('should apply schema function of partial type', () => {
63 ▶       const pizzaOrder: WritableSignal<PizzaOrder> = null!;
64 ▶       const orderSchema: SchemaFn<Order> = null!;
65 ▶       form(pizzaOrder, orderSchema);
66 │     });
67 │ 
68 │     it('should not apply schema function of different type', () => {
69 ▶       const pizzaOrder: WritableSignal<PizzaOrder> = null!;
70 ▶       const phoneOrderSchema: SchemaFn<PhoneOrder> = null!;
71 ▶       // @ts-expect-error
72 ▶       form(pizzaOrder, phoneOrderSchema);
73 │     });
```

1. **54 行目：どこからも呼ばれない関数**

   `typeVerificationOnlyDoNotRunMe` はファイルの中で宣言されるだけで、呼ばれません。55 行目の `describe('types')` は関数の中なので、jasmine に登録されません。2 節の `^types ` が 0 本なのはこのためです。
2. **57〜59 行目：値は null! で、型だけを作る**

   `null!` は「null を、null でないことにする」書き方で、実行しないので中身は要りません。59 行目の `form(pizzaOrder, pizzaOrderSchema)` が型の上で通ることだけが確かめたいことです。
3. **71〜72 行目：@ts-expect-error で「通らないこと」を書く**

   次の行が型エラーにならないと、TypeScript が `TS2578: Unused '@ts-expect-error' directive` を出します。spec のファイルは `node/BUILD.bazel` の `ng_project`（`test_lib`）でコンパイルされ、エラーがあると `Compiling Angular TS: //packages/forms/signals/test/node:test_lib failed` になり、テストは 1 本も走らずに FAILED TO BUILD です。
4. **63〜65 行目：注記の無い行は「通ること」**

   `SchemaFn<Order>`（部分の型）を `PizzaOrder` のフォームに渡せること。`SchemaFn` は path を受ける関数なので、`PizzaOrder` の path を `Order` の path として渡せる（キーが多いだけ）かぎり、`Order` 用の関数を `PizzaOrder` のフォームに使えます（`Schema` の側は第 4 回の 5 節の `in`）。この行が型エラーになっても同じくコンパイルで落ちます。

📄 `angular/packages/forms/signals/test/node/types.spec.ts` L87–102 （▶ の行: 94–95, 97–100）

```ts
 87 │     it('should not apply schema of different type', () => {
 88 │       const pizzaOrder: WritableSignal<PizzaOrder> = null!;
 89 │       const phoneOrderSchema = schema<PhoneOrder>(null!);
 90 │       // @ts-expect-error
 91 │       form(pizzaOrder, phoneOrderSchema);
 92 │     });
 93 │ 
 94 ▶     it('should not allow binding logic to a potentially undefined field', () => {
 95 ▶       schema<{a: number; b: number | undefined; c?: number}>((p) => {
 96 │         required(p.a);
 97 ▶         // @ts-expect-error
 98 ▶         required(p.b);
 99 ▶         // @ts-expect-error
100 ▶         required(p.c);
101 │       });
102 │     });
```

94〜102 行目は[第 4 回](04-sfty-path.md)の 3 節の `MaybeSchemaPathTree` を固める it です。作業木で `MaybeSchemaPathTree` から `(TModel & undefined) |` を消すと、97 行目の注記だけが TS2578 になり、99 行目は残りました（第 4 回の M3）。95 行目の `c?: number` は省略できるキーなので、`SchemaPathTree` の子を作る写像型（`{[K in keyof TModel]: …}`）が「省略できる」印を保ち、path の型に `undefined` が残るからです。99 行目は `MaybeSchemaPathTree` ではなく、写像型の省略の印を固めています。

test/node の `@ts-expect-error` の数です（`grep -c`、合計 34。test/web には 0）。

| ファイル | @ts-expect-error |
| --- | --- |
| `node/types.spec.ts` | 11 |
| `node/compat/compat.spec.ts` | 9 |
| `node/field_proxy.spec.ts` | 4 |
| `node/field_context.spec.ts` | 3 |
| `node/api/validators/validation_errors.spec.ts` | 3 |
| `node/api/validators/standard_schema.spec.ts` | 2 |
| `node/validation_status.spec.ts` | 1 |
| `node/dynamic.spec.ts` | 1 |

このうち types.spec.ts の 11 個だけが「実行しない関数」の中にあり、ほかの 23 個は jasmine で実際に走る it の中にあります（field\_context.spec.ts の 116・121 行目は、型エラーの行を実行して NG01905・NG01906 を確かめる。第 4 回）。作業木で型を崩したときに、どの注記が TS2578 になったかは第 4 回の M1〜M5 と、[第 1 回](01-sfty-tree.md)・[第 2 回](02-sfty-state.md)の「テストと直し方」にあります。

📄 `angular/packages/forms/signals/test/node/api/when.spec.ts` L192–215 （▶ の行: 192, 197, 199–201, 210, 212）

```ts
192 ▶   it('accepts narrowing-predicate and schema for narrowed type', () => {
193 │     const data = signal<{numOrNull: number | null}>({numOrNull: null});
194 │     const f = form(
195 │       data,
196 │       (path) => {
197 ▶         applyWhenValue(
198 │           path.numOrNull,
199 ▶           (value) => value !== null,
200 ▶           (num) => {
201 ▶             validate(num, ({value}) => (value() < 10 ? {kind: 'too-small'} : undefined));
202 │           },
203 │         );
204 │       },
205 │       {injector: TestBed.inject(Injector)},
206 │     );
207 │ 
208 │     expect(f.numOrNull().errors()).toEqual([]);
209 │     f.numOrNull().value.set(5);
210 ▶     expect(f.numOrNull().errors()).toEqual([{kind: 'too-small', fieldTree: f.numOrNull}]);
211 │     f.numOrNull().value.set(null);
212 ▶     expect(f.numOrNull().errors()).toEqual([]);
213 │     f.numOrNull().value.set(15);
214 │     expect(f.numOrNull().errors()).toEqual([]);
215 │   });
```

when.spec.ts の 192 行目の it は、実行の expect と型の検査を兼ねています。199 行目の `(value) => value !== null` は型ガード（`value is number` と推論される述語）なので `applyWhenValue` の 1 つ目の重なり（`TNarrowed`）が選ばれ、200 行目の `num` は `number` の path になります。だから 201 行目の `value() < 10` が型エラーになりません（狭まっていなければ `value()` は `number | null`）。同じファイルの 167 行目の it は狭めない述語で、176 行目は `(value() ?? 0)` と書いています。

📄 `angular/packages/forms/signals/test/node/path.spec.ts` L73–92 （▶ の行: 73, 82, 84, 87）

```ts
73 ▶     it('Disallows using parent paths for apply with array', () => {
74 │       const data = signal({
75 │         needLastName: false,
76 │         items: [{first: '', last: ''}],
77 │       });
78 │ 
79 │       form(
80 │         data,
81 │         (path) => {
82 ▶           applyEach(path.items, () => {
83 │             expect(() => {
84 ▶               validate(path.needLastName, () => {
85 │                 return {kind: 'custom'};
86 │               });
87 ▶             }).toThrowError();
88 │           });
89 │         },
90 │         {injector: TestBed.inject(Injector)},
91 │       );
92 │     });
```

path.spec.ts は型ではなく実行時の約束です。82 行目の `applyEach` の要素の schema の中で、外側の `path.needLastName` にルールを付けると 87 行目で投げます（`assertPathIsCurrent`。[forms-sf-schema](../forms/16-forms-sf-schema.md) の 2 節）。型の上では `path.needLastName` は Child の path で、`validate` に渡せてしまいます。「外の path を使えない」は、型ではなく実行時にしか守られていない約束です。

## 4. issue と PR の表

2026-11-19 に gh で読んだ（読むだけ）、このシリーズの型・debounce・validateHttp に関係する area: forms の issue と PR です。開いている 16 件と、閉じた（完了・予定なし・入った・入らずに閉じた）18 件。「章」はその issue を読むときに開く章です。

| # |   | 状態 | 開いた日 | 閉じた日 | 内容 | つながり | 章 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 65705 | issue | 開いている | 2025-11-28 |   | ジェネリックの T \| null の子に required を付けられない | 22.2.6 でも同じ文の TS2345（第 4 回の G1）。780 行目の (TModel & undefined) が T のまま残る | [第 4 回](04-sfty-path.md) |
| 67241 | issue | 開いている | 2026-02-24 |   | applyEach の中の item.property のルールからも index を読みたい | 子は必ず Child に戻る（types.ts 761 行目）。第 4 回のデモの item.t の行 | [第 4 回](04-sfty-path.md) |
| 66564 | issue | 開いている | 2026-01-14 |   | 配列の SchemaPathTree に数の添字を使えない | 757〜758 行目（P13）。PR #68311 は 2026-04-22 に入らずに閉じた | [第 4 回](04-sfty-path.md) |
| 68311 | PR | 入らずに閉じた | 2026-04-21 | 2026-04-22 | fix: 配列の SchemaPathTree に数の添字を許す（#66564） | 入らずに閉じた | [第 4 回](04-sfty-path.md) |
| 65535 | issue | 完了 | 2025-11-21 | 2026-03-17 | ジェネリックの型がふつうのオブジェクトと同じに扱われない | PR #67304（83032e36059）。SchemaPathTree の \[TModel\] の角括弧 | [第 1 回](01-sfty-tree.md)・[第 4 回](04-sfty-path.md) |
| 67304 | PR | 入った | 2026-02-25 | 2026-03-17 | fix: signal form のスキーマでジェネリックの和を扱う | 83032e36059。常に真の条件型（982〜991 行目）も同じ PR | [第 1 回](01-sfty-tree.md)・[第 4 回](04-sfty-path.md) |
| 66596 | issue | 完了 | 2026-01-15 | 2026-03-19 | 値の型がジェネリックを extends できない | 83032e36059 のメッセージが原因として挙げている | [第 1 回](01-sfty-tree.md)・[第 4 回](04-sfty-path.md) |
| 65479 | issue | 開いている | 2025-11-21 |   | 判別できる和（discriminated union）のモデルを扱いたい | ― | [第 1 回](01-sfty-tree.md)・[第 4 回](04-sfty-path.md) |
| 69321 | issue | 開いている | 2026-06-12 |   | フィールドごとの検証と metadata の型を残して、組み合わせと読み出しに使いたい | ― | [第 4 回](04-sfty-path.md) |
| 71266 | issue | 開いている | 2026-10-09 |   | 親のフィールドに FieldContext から行きたい | FieldContext に parent は無い（963〜1015 行目） | [第 4 回](04-sfty-path.md) |
| 71616 | issue | 開いている | 2026-10-26 |   | 配列の要素の keyInParent() が、型は数なのに文字列を返す | PR #71617（開いている）。ChildFieldContext の key は Signal&lt;string&gt;（1004 行目） | [第 1 回](01-sfty-tree.md)・[第 4 回](04-sfty-path.md) |
| 71491 | PR | 入った | 2026-10-20 | 2026-10-22 | fix: FieldContext の valueOf・stateOf・fieldTreeOf に this: void | d2f5ec92de9。5d7303aeda2 が field\_context.spec.ts に ThisParameterType の検査を足した | [第 4 回](04-sfty-path.md) |
| 67246 | issue | 完了 | 2026-02-24 | 2026-03-24 | FieldNode が FieldState を正しく implements していないという型エラー | ― | [第 2 回](02-sfty-state.md) |
| 64428 | issue | 予定なし | 2025-10-15 | 2025-10-16 | Type 'undefined' is not assignable to type '() =&gt; FieldState&lt;…&gt;' | ― | [第 1 回](01-sfty-tree.md) |
| 66570 | issue | 開いている | 2026-01-15 |   | string \| null の型が、外の部品と組むと型エラーになる | ― | [第 1 回](01-sfty-tree.md) |
| 71149 | issue | 完了 | 2026-10-03 | 2026-11-11 | submit() が、子の debounce の値を書く前に action を走らせる | PR #71150（cf37344a4d6）。作業木の W1 で 6 本落ちる | [第 5 回](05-sfty-http-debounce.md) |
| 71150 | PR | 入った | 2026-10-03 | 2026-11-11 | fix: touched にしたとき子の debounce の値も書く | cf37344a4d6。サイトの 22.2.6 に入っている | [第 5 回](05-sfty-http-debounce.md) |
| 71631 | issue | 開いている | 2026-10-26 |   | 自作の Debouncer の abort の通知が遅れて、computed の中で来る | pendingSync の linkedSignal。第 5 回のデモの markAsTouched の行 | [第 5 回](05-sfty-http-debounce.md) |
| 71772 | PR | 開いている | 2026-11-02 |   | fix: debounce の abort の通知をリアクティブな追跡から切り離す | #71631 の直し | [第 5 回](05-sfty-http-debounce.md) |
| 71627 | PR | 入らずに閉じた | 2026-10-26 | 2026-10-26 | test: 遅れて来る abort の再現の spec | 入らずに閉じた | [第 5 回](05-sfty-http-debounce.md) |
| 66646 | issue | 完了 | 2026-01-20 | 2026-01-30 | debounceForDuration が abort で Promise を解決しない | PR #66650（b1bf535f8e5）。debounce.ts 71 行目 | [第 5 回](05-sfty-http-debounce.md) |
| 71004 | issue | 完了 | 2026-09-28 | 2026-10-01 | debounce('blur') の値が、フォーカス中の入力欄が消えると失われる | PR #71005（c58464d13ed）。form\_field.ts の onCleanup で flushSync | [第 5 回](05-sfty-http-debounce.md) |
| 65641 | issue | 完了 | 2025-11-25 | 2025-11-26 | 同期と非同期の検証を持つフィールドの debounce | debounce のルールは同期の検証も遅らせる、という問い | [第 5 回](05-sfty-http-debounce.md) |
| 69387 | issue | 完了 | 2026-06-12 | 2026-07-09 | matAutocomplete の入力欄で debounce が入力を戻してしまう | CVA への書き戻し（PR #69436 が同じ日に入った） | [第 5 回](05-sfty-http-debounce.md) |
| 71636 | issue | 開いている | 2026-10-26 |   | debounce 付きの非同期の検証が、値を変えた直後は前の結果を返す | 第 5 回のデモの最後のボタン。PR #71637（再現の spec）は閉じた | [第 5 回](05-sfty-http-debounce.md) |
| 66959 | issue | 完了 | 2026-02-07 | 2026-03-26 | 非同期の検証に debounce を | PR #67813（24e52d450d2）が validateAsync と validateHttp に debounce を足した | [第 5 回](05-sfty-http-debounce.md) |
| 67813 | PR | 入った | 2026-03-23 | 2026-03-25 | feat: validateAsync と validateHttp に debounce のオプション | core の DebounceTimer も同時に | [第 5 回](05-sfty-http-debounce.md) |
| 63949 | PR | 入った | 2025-09-19 | 2025-10-27 | refactor: validateHttp に HTTP の失敗のための onError | a5678f6f2b5。validate\_http.ts 64 行目 | [第 5 回](05-sfty-http-debounce.md) |
| 70884 | issue | 開いている | 2026-09-23 |   | validateAsync の debounce が resource の中身を漏らす | PR #70920・#70961・#70983・#71414 はどれも入らずに閉じた | [第 5 回](05-sfty-http-debounce.md) |
| 69620 | issue | 完了 | 2026-07-02 | 2026-07-09 | validateStandardSchema と validateHttp を同じ木に付けると NG0992 | ― | [第 5 回](05-sfty-http-debounce.md) |
| 67859 | issue | 開いている | 2026-03-25 |   | validateAsync の params から undefined を返せない | validateHttp の request は型に \| undefined を書いている（43〜45 行目） | [第 5 回](05-sfty-http-debounce.md) |
| 70815 | issue | 開いている | 2026-09-18 |   | 同期のエラーがあっても非同期の検証を走らせる設定がほしい | validate\_async.ts の 114 行目のコメントの約束 | [第 5 回](05-sfty-http-debounce.md) |
| 69779 | issue | 開いている | 2026-07-15 |   | もっと簡単な非同期の検証 | PR #70124（validatePromise）は入らずに閉じた | [第 5 回](05-sfty-http-debounce.md) |
| 71622 | issue | 開いている | 2026-10-26 |   | コンポーネントを壊してもフィールドが壊れず、非同期の検証が走り続ける | ― | [第 5 回](05-sfty-http-debounce.md) |

型の issue は「ジェネリックのまま使う」（#65705・#65535・#66596）と「配列の要素と index」（#67241・#66564・#71616）の 2 つに集まっています。前者は第 4 回の 3 節の角括弧と `MaybeSchemaPathTree`、後者は 3 節の「配列には子が無い・子は Child」と 6 節の `key` の型が相手です。debounce の issue は、ほとんどが 2 節の「待ちを取り消す 4 つの道」のどれかで、取り消すときに書くか書かないか（#71149・#71004）と、取り消しの通知がいつ届くか（#66646・#71631）です。

## 5. origin/main の続き

`git -C ~/angular-research/angular log 8576f161ae4..origin/main` を、このシリーズの src と spec に絞ったものです（origin/main は 943ec3bd8d6、2026-11-17）。「サイト」は、サイトの依存の 22.2.6 に同じ変更が入っているか（`node_modules/@angular/forms` の fesm2022 と `.d.ts` で確かめた）です。

| コミット | 日付 | 変えたもの | 22.2.6 |
| --- | --- | --- | --- |
| `c58464d13ed` | 2026-10-01 | 入力欄が消えるとき、debounce('blur') の待ちを書く（form\_field.ts の onCleanup で flushSync。flushSync を private から外した） | 入っている |
| `d2f5ec92de9` | 2026-10-22 | RootFieldContext の valueOf・stateOf・fieldTreeOf に this: void（型だけ） | 入っている（.d.ts） |
| `5d7303aeda2` | 2026-10-22 | field\_context.spec.ts の分割代入の it を、ThisParameterType を型で確かめる形に替えた | ―（spec） |
| `67e50693274` | 2026-11-03 | 使わないフィールドの注入器を作らない（structure.ts の destroy） | 入っている |
| `4422f4ef509` | 2026-11-09 | valueOf の AbstractControl の検査を Symbol の印に（context.ts 171 行目） | 入っている |
| `cf37344a4d6` | 2026-11-11 | touched にしたとき子の debounce の待ちも書く（node.ts の markAsTouchedInternal）。debounce.spec.ts に 8 本 | 入っている |
| `b6116ea0296` | 2026-10-12 | types.ts の SchemaFn の doc コメントの例を disabled(p.email, {when}) に | ―（文書） |

`git diff 8576f161ae4 origin/main -- packages/forms/signals/src/api/types.ts` は、`this: void` の 4 行と doc コメントの 1 行だけです。PathKind・SchemaPathRules・SchemaPath・FieldContext・Debouncer の型の形は変わっていません。

## 6. このシリーズで確かめたこと

| 何を | どこで | 確かめ方 |
| --- | --- | --- |
| Unsupported の path に型を外して付けたルールは、例外も出さず、1 回も呼ばれない | [第 4 回](04-sfty-path.md)の 8 節 | Node 24 と 22.2.6 で compatForm に required と validate を付けた記録。`errors()` は `[]` |
| #65705 の型エラーは 22.2.6 でも同じ文で出る | 第 4 回の G1 | 手元の tsc 6.0.3 |
| types.spec.ts 99 行目は MaybeSchemaPathTree ではなく、写像型の省略の印を固めている | 3 節、第 4 回の M3 | 作業木で 780 行目を変えて node:test を組む |
| debounce.spec.ts の 186 行目は `await debounceResult.resolve` で、Debouncer の Promise を解決していない | [第 5 回](05-sfty-http-debounce.md)の「テストと直し方」 | origin/main でも同じ（212 行目）。作業木の D2（取り消しを見ない）でもこの it は落ちない |
| validateHttp の request が `undefined` でも、debounce の間は pending | 第 5 回の 3 節 | ページの上の DEMO 2 の 'a'（約 400 ms） |
| request が `undefined` を返すことを確かめる it は無い | 第 5 回の「テストと直し方」 | `grep -n "request:"`（resource.spec.ts の 6 本と standard\_schema.spec.ts の 1 本） |
| 8576f161ae4 の `markAsTouched` は子の debounce の待ちを書かない（#71149） | 第 5 回の 2 節 | 作業木に cf37344a4d6 の spec だけを入れて 29 本中 6 failures |

第 1〜3 回で確かめたことは、それぞれの章の「テストと直し方」にあります。

## 聞かれそうな質問

**Q. types.spec.ts は jasmine で何本走りますか？**

0 本です。17 本の it は、どこからも呼ばれない `typeVerificationOnlyDoNotRunMe`（54 行目）の中の describe にあります。検査はコンパイルの段で、`test_lib` がコンパイルできれば通り、できなければ FAILED TO BUILD になります。

**Q. @ts-expect-error の行が型エラーでなくなると、なぜテストが落ちるのですか？**

TypeScript は使われなかった `@ts-expect-error` を TS2578 のエラーにするからです。spec は `ng_project` で型検査つきでコンパイルされるので、エラーが 1 つでもあると jasmine の前で止まります（第 4 回の M1〜M5、3 節の 71〜72 行目）。

**Q. debounce の spec は、なぜ入力欄を使わずに書けるのですか？**

入力欄の \[formField\] がしていることは `controlValue.set` と、blur での `markAsTouched` の 2 つで、spec はそれを直接呼ぶからです（第 5 回の debounce.spec.ts 43・62・66 行目）。DOM の blur や入力欄が消えるときの書き込みは web の `form_field.spec.ts` の `describe('debounce')`（5988 行目）です。

**Q. validateHttp の spec はどうやってサーバーに答えさせていますか？**

`provideHttpClientTesting` の `HttpTestingController` で、`expectOne(url)` で出た要求を取り、`flush(body)` か `flush(null, {status: 500})` で答えます（resource.spec.ts 61 行目の beforeEach と 333 行目）。debounce の待ちは `timeout(80)` で本当に待ちます（435 行目）。

**Q. 型の振る舞いを変える PR には、どの spec を足しますか？**

path とスキーマの形なら types.spec.ts の `describe('types')`、context の形なら field\_context.spec.ts、compat の path なら compat.spec.ts の 498 行目の隣です。どれも「通るべき行」は注記なしで、「通らないべき行」は `@ts-expect-error` で書きます。公開の型が変われば golden（`goldens/public-api/forms/signals/index.api.md`）も変わります。

## 読み終えて

- 型の spec は「実行しない関数の中の describe」と `@ts-expect-error` で書かれ、検査はコンパイル（TS2578 で FAILED TO BUILD）。jasmine の数には出ない。
- test/node の `@ts-expect-error` は 34 個で、types.spec.ts の 11 個以外は実行される it の中にある。
- debounce は debounce.spec.ts の 21 本と web の 4 本、validateHttp は resource.spec.ts の 13 本の一部が固めている。request が `undefined` の道と、解決したあとの「直接書いた値が勝つ」は固まっていない。
- 型の issue はジェネリックと配列の index に、debounce の issue は待ちの取り消しに集まっている。
- origin/main で型の形は変わっておらず、debounce は touched のときに子の待ちも書くようになった（22.2.6 にも入っている）。

---

← 前: [validateHttp と debounce：型の外にある、時間と通信の約束](05-sfty-http-debounce.md)  
次: [RouterLink の入力：queryParams から target まで、href とクリックに効く行](../rdir/01-rdir-link-inputs.md) →
