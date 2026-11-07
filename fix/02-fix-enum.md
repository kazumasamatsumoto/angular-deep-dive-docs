[目次](../README.md) › [見つけた不具合を手元で直す](README.md) › 第 2 回 / 全 10 回

# enum の値がずれる：partial evaluator の 1 行

> ngtsc の PartialEvaluator が、初期値の無い enum のメンバーの値を「並びの番号」にしていた件。evaluator\_spec に失敗する it を足し、4 つのファイルシステム（runInEachFileSystem）で落ちるのを確かめ、前のメンバーの値に 1 を足す形に直す。周りのテストと、コミットの本文の書き方。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fix-enum)

---

ngtsc の PartialEvaluator（コンパイル時に式の値を求める部品）は、初期値の無い enum のメンバーに「並びの番号」を入れていました。この回では、その 1 行がいつ・なぜ入ったかを git で読み、`evaluator_spec.ts` に落ちる it を足して 4 つのファイルシステムで 4 回落ちるのを確かめ、「前のメンバーの値 + 1」に直して、周りのテストとコミットのメッセージまで仕上げます。

読む対象は `packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts`・`src/dynamic.ts`・`test/evaluator_spec.ts`、`packages/compiler-cli/src/ngtsc/file_system/testing/src/test_helper.ts`、`.ng-dev/commit-message.mjs` です。

1. [1. 準備と流れ](01-fix-overview.md)
2. **2. enum の値**（この章）
3. [3. 消えた修正を戻す](03-fix-defer-immediate.md)
4. [4. 修正の取りこぼし](04-fix-event-replay-clickmod.md)
5. [5. 安定しないアプリ](05-fix-defer-error-stable.md)
6. [6. spec を直す](06-fix-spec-assertions.md)
7. [7. 一部しか直らない](07-fix-declare-field.md)
8. [8. 覚えたままの出力](08-fix-elements-outputs.md)
9. [9. 直せても出さない](09-fix-elements-reconnect.md)
10. [10. 出す前の点検](10-fix-before-issue.md)

## 1. 不具合の形

[partial evaluator の章](../ngtsc/05-ngtsc-partial-evaluator.md)の 8 節で見つけ、[ngtsc の issue の章](../ngtsc/20-ngtsc-issues.md)の表に載せたものです。`enum Size { Small = 1, Large, Huge = 10, Giant }` を評価すると、`Size.Large` が 1、`Size.Giant` が 3 になります。TypeScript では 2 と 11 です。`@Component` の selector のような、コンパイル時に値を決めるメタデータに使うと、出力の JS がソースの意味とずれます（partial evaluator の章の記録では `app-size-1` が出ました）。

## 2. 原因の行と、入った経緯

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` L320–326 （▶ の行: 320, 322–323）

```ts
320 ▶     node.members.forEach((member, index) => {
321 │       const name = this.stringNameFromPropertyName(member.name, context);
322 ▶       if (name !== undefined) {
323 ▶         const resolved = member.initializer ? this.visit(member.initializer, context) : index;
324 │         map.set(name, new EnumValue(enumRef, name, resolved));
325 │       }
326 │     });
```

320 行目で `forEach` の 2 つ目の引数 `index`（0 から数えた並びの番号）を受け取り、323 行目で、初期値（`member.initializer`）が無ければその `index` を値にしています。TypeScript の enum の決まりは次のとおりで、`index` と一致するのは「どのメンバーにも初期値が無い」ときだけです。

- 最初のメンバーに初期値が無ければ 0。
- 初期値の無いメンバーは、前のメンバーの値 + 1（前が数のとき）。
- 前のメンバーが文字列などの数でない値なら、初期値の無いメンバーは TypeScript のエラー（Enum member must have initializer）。

この 323 行目がいつ入ったかを `git -C ../angular log -S': index' -- packages/compiler-cli/src/ngtsc/partial_evaluator/src/interpreter.ts` で探すと、03bcd30e348「fix(compiler-cli): handle enum members without initializers in partial evaluator (#59815)」（2025-01、19.1.5 と 19.2.0 に入った）の 1 つだけが出ます。`git show 03bcd30e348` で読むと、それまでの 323 行目は `member.initializer && this.visit(...)` で、初期値の無いメンバーは `undefined` でした。本文は「In this case the value is the same as the index.」です。spec の変更は、`enum Foo { A, B, C }` の it に `expect(result.resolved).toBe(1)` を 1 行足しただけでした。初期値の無いメンバーしかない形なので、index と TypeScript の値が同じになり、ずれは spec に出ません。

## 3. 失敗する spec を書く

足す場所は、その `enum resolution works` の it（引用は[partial evaluator の章](../ngtsc/05-ngtsc-partial-evaluator.md)の「テストと直し方」）のすぐ後ろです。同じ describe `ngtsc metadata` の中で、同じ補助の関数 `evaluate(コード, 式)` を使えるからです。読む人は「enum の spec はここ」と 1 か所で見られます。

足した it は、デモの「1. spec を足す」の差分にあります。書き方の工夫は 3 つです。

1. **初期値が 2 回ある enum にする**

   `Small = 1, Large, Huge = 10, Giant` にしたので、「初期値のあとの 1 つ目」（Large が 2）と「途中でもう一度初期値が来たあと」（Giant が 11）の 2 つを 1 つの it で確かめます。直しが「最初の初期値からだけ数える」形だと、Giant で落ちます。
2. **式を配列にして 1 回で評価する**

   `evaluate(…, '[Size.Large, Size.Giant]')` で配列にし、`map((value) => value.resolved)` を `toEqual([2, 11])` と比べます。落ちたとき、jasmine は配列の要素ごとに「Expected $\[0\] = 1 to equal 2.」と出すので、どちらがずれたかが 1 回で分かります。
3. **名前は「何がどうなるべきか」を書く**

   `should resolve enum members without an initializer after an initialized member`。前の it の名前（`enum resolution works`）より長いですが、失敗の一覧の 1 行で何が壊れたかが分かります。

### 同じ it が 4 回落ちる理由

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/test/evaluator_spec.ts` L28–31 （▶ の行: 28–29）

```ts
28 ▶ runInEachFileSystem(() => {
29 ▶   describe('ngtsc metadata', () => {
30 │     let _: typeof absoluteFrom;
31 │     beforeEach(() => (_ = absoluteFrom));
```

28 行目で、ファイルの it は全部 `runInEachFileSystem(() => …)` の中にあり、29 行目の describe `ngtsc metadata` はその中です。

📄 `angular/packages/compiler-cli/src/ngtsc/file_system/testing/src/test_helper.ts` L38–42 （▶ の行: 38, 41）

```ts
38 ▶ const FS_ALL = [FS_OS_X, FS_WINDOWS, FS_UNIX, FS_NATIVE];
39 │ 
40 │ function runInEachFileSystemFn(callback: (os: string) => void) {
41 ▶   FS_ALL.forEach((os) => runInFileSystem(os, callback, false));
42 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/file_system/testing/src/test_helper.ts` L47–50 （▶ の行: 47, 49–50）

```ts
47 ▶ let counter = 0;
48 │ function runInFileSystem(os: string, callback: (os: string) => void, error: boolean) {
49 ▶   describe(`<<FileSystem: ${os}>>/${counter++}`, () => {
50 ▶     beforeEach(() => initMockFileSystem(os));
```

38 行目の 4 つ（OS/X・Windows・Unix・Native）について、41 行目で `runInFileSystem` を 1 回ずつ呼びます。49 行目でそのたびに一番外の describe を作り、名前を `<<FileSystem: 名前>>/番号` にします。番号は 47 行目の `counter` で、ファイルをまたいで増えます。50 行目で、it の前に毎回その種類の仮のファイルシステムを用意します。だから同じ it が 4 つの describe の中に 1 つずつあり、直す前は 4 回とも落ちます。失敗の一覧の「&lt;&lt;FileSystem: Native&gt;&gt;/7」「…Unix&gt;&gt;/6」などがそれです。

## 4. 走らせて失敗を確かめる

ターゲットは同じディレクトリの BUILD.bazel の `jasmine_test`（`test`）なので、`//packages/compiler-cli/src/ngtsc/partial_evaluator/test:test` です。Node の jasmine なので `--test_arg=--filter=enum` が効きます（[第 1 回](01-fix-overview.md)の 4 節）。デモの「2. 直す前に走らせる」の要点は次のとおりです。

- 「Ran 20 of 369 specs / 20 specs, 4 failures」。全部で 369 件は、partial evaluator の章で数えた 365 件に、足した it の 4 回分を加えた数です。
- 4 つの失敗はどれも「Expected $\[0\] = 1 to equal 2.」「Expected $\[1\] = 3 to equal 11.」。1 節の 1 と 3 がそのまま出ています。
- 出力の「evaluator\_spec.ts:683:70」は、足したあとのファイルでの位置（足した it の `expect`）です。

## 5. 最小の直し

差分はデモの「3. 直す」にあります（interpreter.ts +5 -2）。やっていることは 3 つです。

1. **次の値を持ち歩く：`let nextValue: ResolvedValue = 0;`**

   forEach の外に、次の「初期値の無いメンバー」の値を置きます。最初は 0 です。`index` は使わなくなるので forEach の引数から消します。
2. **値を、名前の確かめ（322 行目の if）の外で決める**

   `const resolved = member.initializer ? this.visit(member.initializer, context) : nextValue;` を if の前に出しました。名前が文字列にできないメンバー（322 行目で飛ばされるもの）も、次の値を進めます。元のコードの `index` も飛ばしたメンバーを数えていたので、その数え方を保ちました。
3. **数なら + 1、数でなければ DynamicValue**

   `nextValue = typeof resolved === 'number' ? resolved + 1 : DynamicValue.fromUnknown(member);`。前の値が数でないとき、次の初期値の無いメンバーの値は TypeScript でもエラーです。そこで「分からない」を表す DynamicValue にします。

### なぜ DynamicValue.fromUnknown なのか

DynamicValue（静的に決められない値）は private の constructor しか持たず、作るときは `dynamic.ts` の static の factory を使います。factory は理由ごとに分かれています：`fromDynamicInput`（入力が DynamicValue）・`fromDynamicString`・`fromExternalReference`・`fromUnsupportedSyntax`・`fromUnknownIdentifier`（Identifier の宣言が無い）・`fromInvalidExpressionType`（演算に合わない型）・`fromComplexFunctionCall`・`fromDynamicType`・`fromSyntheticInput`、そして最後の 1 つです。

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/dynamic.ts` L82–92 （▶ の行: 89, 91）

```ts
82 │   /**
83 │    * A value could not be determined because one of the inputs to its evaluation is a synthetically
84 │    * produced value.
85 │    */
86 │   SYNTHETIC_INPUT,
87 │ 
88 │   /**
89 ▶    * A value could not be determined statically for any reason other the above.
90 │    */
91 ▶   UNKNOWN,
92 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/partial_evaluator/src/dynamic.ts` L149–151 （▶ の行: 149–150）

```ts
149 ▶   static fromUnknown(node: ts.Node): DynamicValue {
150 ▶     return new DynamicValue(node, undefined, DynamicValueReason.UNKNOWN);
151 │   }
```

89〜91 行目の `UNKNOWN` は「上のどれでもない理由」です。ここで起きているのは「前のメンバーが数でないので、+ 1 ができない」で、ほかの理由のどれにも当たりません。149〜150 行目の `fromUnknown` はノードだけを受け取るので、`member`（初期値の無いメンバーの宣言）を渡し、エラーの説明がそのメンバーを指すようにしました。

採らなかった案は「数でないときは元どおり `index` にする」です。TypeScript がエラーにする形で、もっともらしい数を黙って返すことになるので、分からないものは分からないと返す形にしました。

## 6. もう一度走らせる・周りのテスト

デモの「4. 直したあと」は同じコマンドで PASSED です。「5. 周りのテスト」では 2 つの範囲を選びました。

- `//packages/compiler-cli/src/ngtsc/partial_evaluator/...`：`...` はそのディレクトリの下の全部のターゲットです。`partial_evaluator_deps`・`test`・`test_lib_deps` の 3 つで、直したファイルを持つパッケージそのものです。
- `//packages/compiler-cli/test/ngtsc:ngtsc`：本物のプログラムを ngtsc でコンパイルして出力を確かめる大きな spec の集まりです。PartialEvaluator を使う側（デコレーターのメタデータの評価）の振る舞いがここで確かめられます。shard が 4 つで、記録では 26.0 秒でした。

4 つとも PASSED、全体の経過は 64.956 秒でした。

## 7. コミットの書き方

📄 `angular/.ng-dev/commit-message.mjs` L6–9 （▶ の行: 7–8）

```js
6 │ export const commitMessage = {
7 ▶   maxLineLength: Infinity,
8 ▶   minBodyLength: 20,
9 │   minBodyLengthTypeExcludes: ['docs'],
```

📄 `angular/contributing-docs/commit-message-guidelines.md` L18–21 （▶ の行: 18–19, 21）

```md
18 ▶ The `body` is mandatory for all commits except for those of type "docs".
19 ▶ When the body is present it must be at least 20 characters long and must conform to the [Commit Message Body](#commit-body) format.
20 │ 
21 ▶ The `footer` is optional. The [Commit Message Footer](#commit-footer) format describes what the footer is used for and the structure it must have.
```

commit-msg のフックが使う決まりは、7 行目で 1 行の長さの上限が無く、8 行目で本文が 20 文字以上要ることです。文書の 18〜19 行目も同じことを書いていて、本文は docs の型のほかは必須です。21 行目のとおり footer（`Fixes #…` などを書く最後の段）は任意です。type と scope の一覧の読み方は[コミットメッセージの章](../contrib/09-contrib-commit-messages.md)にあります。

1. **見出し：fix(compiler-cli): resolve enum members without an initializer from the previous member**

   利用者から見える振る舞いの直しなので type は `fix`。直したファイルは compiler-cli のパッケージなので scope は `compiler-cli`。要約は命令形・小文字で始める・最後に点を付けない、です。
2. **本文：何が・なぜ**

   記録の本文（デモの「6. コミット」）は、「評価器は初期値の無いメンバーに添字を使っていた」（何が）、「TypeScript は前のメンバー + 1 を使うので、`enum Size {Small = 1, Large}` で 2 でなく 1 になる」（なぜ間違いか）、「コンパイルしたメタデータが間違う。たとえば enum で組んだ selector」（影響）の順です。どう直したかは見出しの「from the previous member」が言っています。
3. **footer：issue が無いので書かない**

   この不具合の issue は無い（8 節）ので、`Fixes #…` は書いていません。issue の番号が無いのに `Fixes` の行を作ることはしません。記録の本文は、index を入れた 03bcd30e348 に触れていません。履歴を追った人には役に立つ情報なので、本文に「03bcd30e348 から」と書き足すかは、仕上げのときに決めることです。

コミットのとき、フックの出力は「Formatting 2 file(s) / ✔ Formatting complete. / ✔ Valid commit message」でした（[第 1 回](01-fix-overview.md)の 6 節）。

## 8. issue を出す前に確かめること

> [!NOTE]
> **ポイント**
>
> このシリーズでは PR も issue も出しません。ここに書くのは、出すかどうかを決める前に、手元で確かめておくことです。

- **同じ報告があるか**：2026-11-06 に gh で「enum member initializer」「enum partial evaluator value」「enum selector wrong value compiler」を issue と PR で探しました。enum の値のずれの報告は見つかりません。近いのは #29062（2019、テンプレートの式の enum の参照）と #36461（2020、二項演算の enum）で、どちらも別の件です。
- **原因の行を入れた PR**：03bcd30e348 は #59815 のコミットの 1 つです（gh の検索では「Handle const enums in HMR replacement function」の題で出ます）。この PR の題は HMR の話で、enum の値そのものの直しは 3 つのコミットのうちの 1 つでした。
- **新しい本家で直っているか**：`../angular-main`（74961c66242）の 323 行目も同じ形で、直っていません。interpreter.ts は main で別の件（a614bd23cd9）で変わっていますが、cherry-pick は衝突しませんでした（[最終回](10-fix-before-issue.md)）。

## テストと直し方：手元で走らせた記録

> **🧪 fix/enum-auto-increment：spec・直す前・直す・直したあと・周り・コミット**
>
> これは手元の複製で走らせた記録の再生です。「2. 直す前に走らせる」で同じ失敗が 4 回（4 つのファイルシステム）出ていること、「3. 直す」の差分で forEach から `index` が消えたことを見てください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fix-enum)

## 聞かれそうな質問

**Q. 元の spec（enum resolution works）はなぜこの不具合を見つけられなかったのですか？**

`enum Foo { A, B, C }` の `Foo.B` が 1 かを見るだけだからです。初期値が 1 つも無いと、323 行目の `index` と TypeScript の値が同じになります。その 1 行の expect を足した 03bcd30e348 の本文も「the value is the same as the index」で、初期値のあとの形を考えていません（2 節）。

**Q. 同じ it がなぜ 4 回落ちるのですか？**

evaluator\_spec.ts は 28 行目で全体を `runInEachFileSystem` に入れていて、test\_helper.ts の 41 行目が 38 行目の 4 つのファイルシステムごとに describe を作るからです（49 行目）。失敗の名前の「&lt;&lt;FileSystem: Native&gt;&gt;/7」がその describe です（3 節）。

**Q. 初期値が別の enum のメンバー（`A = Other.X, B`）のときはどうなりますか？**

手元では確かめていません。コードを読むと、`Other.X` の評価は enum の Map から EnumValue をそのまま返すので、直したあとの `typeof resolved === 'number'` は false になり、`B` は DynamicValue になります。直す前は `index`（1）でした。TypeScript の値は `Other.X` + 1 です。仕上げの前に、EnumValue の `resolved` を開くかどうかと、その it を足すかを決める必要があります。

**Q. なぜ `index` に戻さず DynamicValue にしたのですか？**

前の値が数でないとき、初期値の無いメンバーは TypeScript でもエラーで、正しい数がありません。dynamic.ts の 91 行目の `UNKNOWN` は「ほかのどの理由でもない」で、149 行目の `fromUnknown` はノードだけで作れるので、メンバーの宣言を渡しました（5 節）。

**Q. issue が無いとき、コミットの footer はどう書きますか？**

書きません。commit-message-guidelines.md の 21 行目のとおり footer は任意です。要るのは見出しと、8 行目の minBodyLength の 20 文字以上の本文です（7 節）。

## 読み終えて

- interpreter.ts の 323 行目は、初期値の無い enum のメンバーに forEach の `index` を入れていた。初期値のあとでは TypeScript の値とずれる。
- その行は 03bcd30e348（#59815）で入り、足した spec は index と TypeScript の値が同じ形だけを確かめていた。
- evaluator\_spec.ts は runInEachFileSystem で 4 回走るので、落ちる it は 4 回落ちる。件数も 4 の倍数で増える（365 → 369）。
- 直しは `nextValue` を持ち歩き、数なら + 1、数でなければ `DynamicValue.fromUnknown(member)`。別の enum のメンバーを初期値にした形は、まだ確かめていない。
- コミットは `fix(compiler-cli): …`、本文は 20 文字以上、issue が無ければ footer は書かない。

---

← 前: [直す前の準備：手元の複製と 1 つの直しの流れ](01-fix-overview.md)  
次: [消えた修正を戻す：@defer (on immediate) と SSR の placeholder](03-fix-defer-immediate.md) →
