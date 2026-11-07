[目次](../README.md) › [見つけた不具合を手元で直す](README.md) › 第 7 回 / 全 10 回

# 一部しか直らない直し：declare のフィールドと NodeFlags.Ambient

> Angular のクラスの、ほかのデコレーターが付いた declare のフィールドが useDefineForClassFields で JS に出る件。TypeScript がパーサーの付けた内部の印でフィールドを落としていること、作り直したノードでその印が消えること、内部の API に頼る直しがビルドで落ちたこと、公開の API だけの直しで直る範囲と残る形（@Input() declare）を一時的な it で確かめたこと。

angular/angular · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/fix-declare-field)

---

この章の直しは「一部しか直らない」直しです。Angular のクラスで、Angular のものでないデコレーターが付いた `declare` のフィールドが、`useDefineForClassFields: true` のとき JS に本物のフィールドとして出る件を、手元の複製で直します。TypeScript は `declare` を修飾子ではなく、パーサーが付けるノードの内部の印で見分けています。Angular の変換がノードを作り直すと、その印が消えます。内部の API で印を付け直す直しはビルドで落ち、公開の API だけで直せる範囲と、直らずに残る形（`@Input() declare`）を記録で確かめました。

読む対象は `packages/compiler-cli/src/ngtsc/transform/src/transform.ts` の `_stripAngularDecorators`、TypeScript 6.0.3 の `typescript.js` の `visitPropertyDeclaration`、spec の `packages/compiler-cli/test/ngtsc/ngtsc_spec.ts` です。

1. [1. 準備と流れ](01-fix-overview.md)
2. [2. enum の値](02-fix-enum.md)
3. [3. 消えた修正を戻す](03-fix-defer-immediate.md)
4. [4. 修正の取りこぼし](04-fix-event-replay-clickmod.md)
5. [5. 安定しないアプリ](05-fix-defer-error-stable.md)
6. [6. spec を直す](06-fix-spec-assertions.md)
7. **7. 一部しか直らない**（この章）
8. [8. 覚えたままの出力](08-fix-elements-outputs.md)
9. [9. 直せても出さない](09-fix-elements-reconnect.md)
10. [10. 出す前の点検](10-fix-before-issue.md)

> [!NOTE]
> **ポイント**
>
> このシリーズでは PR も issue も出しません。この章の結論は「直せる範囲は手元で仕上げたが、残りは方針を聞くのが先」です。

## 1. 不具合の形

見つけたのは ngtsc シリーズの[Ivy の変換の章](../ngtsc/12-ngtsc-ivy-transform.md)の「テストと直し方」で、[ngtsc の不具合の表](../ngtsc/20-ngtsc-issues.md)に載せました。`declare note: string` は「実行時には何も作らない」という宣言です。ところが次の形を、`useDefineForClassFields: true`（クラスのフィールドを JavaScript の仕様どおり「定義」として出す設定。target が ES2022 以上なら既定で true）でコンパイルすると、フィールドが出ます。

- `@Directive(…)` のクラスの中の `@Log declare value: string;`（`Log` は Angular のものでないデコレーター）
- 出る JS：constructor の中に `Object.defineProperty(this, "value", { …, value: void 0 })`（target が ES2015 のとき。ES2022 なら `value;` というクラスのフィールド）

`declare` の無いフィールドと同じく、インスタンスに `value` が `undefined` で作られます。たとえば親のクラスの constructor が入れた値や、prototype に置いた getter・setter を、この定義が覆います。`declare` を書いた人が避けたかったことそのものです。

## 2. 原因の行：作り直すと印が消える

### Angular の側

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/transform.ts` L310–316 （▶ の行: 310–312, 315–316）

```ts
310 ▶     const nonCoreDecorators = this._nonCoreDecoratorsOnly(node);
311 ▶     if (nonCoreDecorators === undefined) {
312 ▶       return node;
313 │     }
314 │ 
315 ▶     const combinedModifiers = [...nonCoreDecorators, ...(modifiers ?? [])];
316 ▶     return ts.factory.replaceDecoratorsAndModifiers(node, combinedModifiers) as T;
```

`_stripAngularDecorators` の後半です（前半と全体の流れは[Ivy の変換の章](../ngtsc/12-ngtsc-ivy-transform.md)の 5 節）。310 行目の `_nonCoreDecoratorsOnly` は、ノードのデコレーターから `@angular/core` のものを除いた残りの配列を返し、デコレーターが 1 つも無いときだけ `undefined` を返します。だから 311〜312 行目で元のノードのまま返るのは「デコレーターが無い」ときだけです。デコレーターが 1 つでもあれば、外すものが無くても、315〜316 行目で `ts.factory.replaceDecoratorsAndModifiers` を呼び、**新しいノード**を作ります。`@Log declare value` は Angular のデコレーターを持たないのに、ここで作り直されます。

### TypeScript の側

作り直したノードを、TypeScript の ts 変換（型の注釈などを落として JS にする段）が受け取ります。次は `node_modules/typescript/lib/typescript.js`（6.0.3）のプロパティの処理の始まりです。cuts の repo に無いので、../angular-fix/node\_modules から写して示します。

📄 `node_modules/typescript/lib/typescript.js（TypeScript 6.0.3）` L99580–99590 （▶ の行: 99581–99583, 99585, 99587, 99590）

```
99580 │   function visitPropertyDeclaration(node, parent2) {
99581 ▶     const isAmbient = node.flags & 33554432 /* Ambient */ || hasSyntacticModifier(node, 64 /* Abstract */);
99582 ▶     if (isAmbient && !(legacyDecorators && hasDecorators(node))) {
99583 ▶       return void 0;
99584 │     }
99585 ▶     let modifiers = isClassLike(parent2) ? !isAmbient ? visitNodes2(node.modifiers, visitor, isModifierLike) : visitNodes2(node.modifiers, modifierElidingVisitor, isModifierLike) : visitNodes2(node.modifiers, decoratorElidingVisitor, isModifierLike);
99586 │     modifiers = injectClassElementTypeMetadata(modifiers, node, parent2);
99587 ▶     if (isAmbient) {
99588 │       return factory2.updatePropertyDeclaration(
99589 │         node,
99590 ▶         concatenate(modifiers, factory2.createModifiersFromModifierFlags(128 /* Ambient */)),
```

99581 行目で、`declare` かどうか（`isAmbient`）を `node.flags & 33554432 /* Ambient */` で決めています。`declare` という修飾子があるかではなく、**ノードの flags の印**を見ています。この印はパーサーがソースを読んだときに付けるものです。

1. **印があるとき（元のノード）**

   99582〜99583 行目、デコレーターが無ければフィールドごと消します。`@Log` のようにデコレーターがあり、古い形のデコレーター（`experimentalDecorators`）なら残し、99587〜99590 行目で `declare` の修飾子を付け直して返します。デコレーターの呼び出し（`__decorate([Log], Child.prototype, "value", void 0)`）は出ますが、フィールドの定義は出ません。
2. **印が無いとき（作り直したノード）**

   99585 行目で、修飾子を `visitor` に通します。ここで `declare` は落ち、99587 行目の分岐にも入りません。ふつうのフィールドとして扱われ、`useDefineForClassFields` の変換で定義が出ます。

作り直したノードの flags には、パーサーの付けた Ambient の印がありません。Angular は 316 行目で修飾子（`declare` を含む）をそのまま渡していますが、TypeScript は修飾子を見ていないので、渡しても効きません。

### TypeScript だけの小さな実験

Angular を通さずに、TypeScript だけで同じことが起きるかを確かめました（手元の `fix-logs/declare/exp/exp.cjs`）。`function Log(…){}` と `export class Child { @Log declare value: string; }` の 2 行を、`ts.transpileModule` で target ES2015・`useDefineForClassFields: true`・`experimentalDecorators: true` にし、プロパティのノードだけを差し替える before の変換を 3 通り渡して、出力に `defineProperty(this` があるかを見ます。

| プロパティのノードをどうするか | フィールドの定義 |
| --- | --- |
| 何もしない（同じノードを返す） | 出ない |
| `ts.factory.replaceDecoratorsAndModifiers(n, [...デコレーター, ...修飾子])`（316 行目と同じ） | 出る |
| `ts.factory.updatePropertyDeclaration(n, 同じ修飾子, …)` | 出る |

中身をまったく変えずに作り直すだけで出ます。原因は Angular の何かの判断ではなく、「作り直すこと」そのものだと、ここで切り分けられました。

## 3. 失敗する spec を書く

足す場所は、ngtsc\_spec.ts の describe `inherited directives` の最後にある、同じ `@Log declare value` を使う it の直後です（全文は[Ivy の変換の章](../ngtsc/12-ngtsc-ivy-transform.md)の「テストと直し方」）。

📄 `angular/packages/compiler-cli/test/ngtsc/ngtsc_spec.ts` L9483–9486 （▶ の行: 9483–9484）

```ts
9483 ▶       it('should emit `declare` fields without runtime initialization in decorated classes', () => {
9484 ▶         env.tsconfig();
9485 │         env.write(
9486 │           'test.ts',
```

📄 `angular/packages/compiler-cli/test/ngtsc/ngtsc_spec.ts` L9514–9519 （▶ の行: 9516–9517）

```ts
9514 │           `),
9515 │         );
9516 ▶       });
9517 ▶     });
9518 │ 
9519 │     describe('SVG animation processing', () => {
```

9483 行目の it は今もある「`declare` のフィールドを初期化しない」の検査ですが、9484 行目の `env.tsconfig()` は compilerOptions を何も渡していません。テストの tsconfig の土台は次のとおりです。

📄 `angular/packages/compiler-cli/test/ngtsc/env.ts` L101–104 （▶ の行: 102）

```ts
101 │         "declaration": true,
102 ▶         "target": "es2015",
103 │         "newLine": "lf",
104 │         "module": "es2015",
```

102 行目で target が es2015 です。`useDefineForClassFields` の既定は target が ES2022 より前なら false なので、今ある it は、この不具合が出ない設定で通っていました。新しい it は 9516 行目と 9517 行目のあいだに入れ、`env.tsconfig({}, {useDefineForClassFields: true})` で設定を足しました。第 2 引数がそのまま compilerOptions になります。

📄 `angular/packages/compiler-cli/test/ngtsc/env.ts` L233–235 （▶ の行: 234）

```ts
233 │     if (compilerOptions !== undefined) {
234 ▶       tsconfig['compilerOptions'] = compilerOptions;
235 │     }
```

書き方で工夫したのは、確かめる文字列を 2 つにしたことです（デモの「1. spec を足す」）。

- `expect(jsContents).not.toContain('Object.defineProperty(this, "value"')`：target が es2015 なので、定義はクラスのフィールドではなく constructor の中の `Object.defineProperty(this, …)` として出ます。ES2022 の `value;` を探しても見つかりません。
- `expect(jsContents).toContain('], Child.prototype, "value", void 0);')`：`@Log` のデコレーターの呼び出しは残っていること。フィールドごと消してしまう間違った直しでも 1 つ目は通るので、2 つ目で防ぎます。

## テストと直し方：手元で走らせた記録

> **🧪 記録の再生：spec を足す → 落ちる → 直す → 通る → 残る形を確かめる → 周り → コミット**
>
> これは手元の複製で走らせた記録の再生です。ブラウザの中で bazel を動かしているのではありません。出力は記録から要るところだけ抜き、長い行は「…（略）」で切っています。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/fix-declare-field)

### 直す前に走らせる：shard と 4 つのファイルシステム

「2. 直す前に走らせる」は `--test_arg=--filter=declare. fields` です（`.` は正規表現の任意の 1 文字で、it の名前の `` `declare` fields `` の逆引用符に当たります）。今ある it と新しい it の 2 つに当たります。`//packages/compiler-cli/test/ngtsc:ngtsc` は shard\_count = 4 で、spec が 4 つの shard に分かれて走ります。さらに ngtsc\_spec.ts は `runInEachFileSystem` で Native・Unix・Windows・OS/X の 4 つのファイルシステムの上で同じ it を走らせます。だから 2 つの it が 8 回走り、shard ごとの出力は「Ran 2 of 6752」「Ran 1 of 6751」「Ran 3 of 6753」「Ran 2 of 6752」に分かれ、失敗は新しい it の 4 回でした（「FAILED in 3 out of 4」は、4 つの shard のうち 3 つに失敗が入ったという意味です）。出力の JS には `export class Child { constructor() { Object.defineProperty(this, "value", …) } }` が出ています。

### 最初の直しは、ビルドで落ちた

最初に試したのは、作り直したノードに印を付け直す直しでした。TypeScript の `ts.setNodeFlags` で、元のノードの `ts.NodeFlags.Ambient` を新しいノードに付けます。これはテストの前の、compiler-cli のビルドで落ちました。

📄 `ビルドの出力（要点）`

```
error TS2339: Property 'Ambient' does not exist on type 'typeof NodeFlags'.
```

`typescript.d.ts`（公開の型）の `enum NodeFlags` には `Ambient` がありません。実行時の typescript.js には `NodeFlags.Ambient = 33554432` も `setNodeFlags` もありますが、どちらも TypeScript の内部のもので、公開の API ではありません。この試しの差分とビルドの記録全体は残していません。残っているのは上のエラーの 1 行と、「`(ts as any)` で包めば通る形」というメモだけで、包んだ版は走らせていません。

内部の API に頼らない理由は 2 つです。公開の型に無いものは、TypeScript の版が上がったときに名前や値が変わっても知らせが来ません。そして compiler-cli の package.json の peerDependencies は typescript `>=6.0 <6.1` で、TypeScript の次の版に上げるたびに、その内部の形が残っているかを確かめ直すことになります。ただし、compiler-cli に前例が無いわけではありません。公平のために示します。

📄 `angular/packages/compiler-cli/src/ngtsc/util/src/typescript.ts` L79–82 （▶ の行: 80–81）

```ts
79 │ export function getTokenAtPosition(sf: ts.SourceFile, pos: number): ts.Node {
80 ▶   // getTokenAtPosition is part of TypeScript's private API.
81 ▶   return (ts as any).getTokenAtPosition(sf, pos);
82 │ }
```

80〜81 行目は「TypeScript の private API」とコメントを付けて、`(ts as any).getTokenAtPosition` を呼んでいます。内部の API を使う道はありますが、使うならこのように 1 か所に閉じ込め、理由を書くのがこのリポジトリの形です。今回は公開の API だけで直る範囲があったので、そちらを採りました。

### 採った直し

「3. 直す」の差分です。311 行目の条件に、`nonCoreDecorators.length === ts.getDecorators(node)?.length`（外す Angular のデコレーターが 1 つも無い）を足し、そのときは作り直さずに元のノードを返します。外すものが無いなら、作り直す理由も無いからです。足したコメントには「作り直すと、パーサーだけが付ける印（TypeScript が `declare` のフィールドを落とすのに使うもの）が消える」と書きました。

「4. 直したあと」は、4 つの shard で 1・2・2・3、合わせて 8 specs, 0 failures です。

### 残る形を確かめる

この直しは「Angular のデコレーターが 1 つも無い」ときだけ効きます。`@Input() declare a: string;` のように Angular のデコレーターがあると、外すために作り直しが要るので、印は消えたままです。それを、一時的な it（名前に `TEMP probe`）で確かめました。`@Input() declare a: string;` と `@Input() @Log declare b: string;` を持つクラスで、`Object.defineProperty(this, …)` の出たフィールドの名前を集め、空であることを期待します。

デモの「5. 残る形を確かめる」。shard 3 と 4 で 4 回（4 つのファイルシステム）落ち、どれも「Expected $.length = 2 to equal 0. Unexpected $\[0\] = 'a' in array. Unexpected $\[1\] = 'b' in array.」でした。直したあとも `a` と `b` の両方に定義が出ます。この it は確かめたあとで消し、コミットには入れていません。

### 周りのテスト

「6. 周りのテスト」では、変えた transform.ts を通る道のターゲットを、`...`（その下の全部）で広く選びました。`//packages/compiler-cli/test/ngtsc:ngtsc`（4 shard、59.5 秒）、`//packages/compiler-cli/src/ngtsc/transform/...`、`//packages/compiler-cli/test/compliance/...`（コンパイラの出力を期待の JS と比べるテスト）で、「Executed 88 out of 88 tests: 88 tests pass.」でした。compliance の期待のファイルを 1 つも書き換えずに通ったので、今ある出力の形は変わっていません。

## 4. コミットの書き方：直る範囲を本文に書く

- **見出し：``fix(compiler-cli): keep `declare` fields with non-Angular decorators out of the JS output``**。直る範囲（Angular のものでないデコレーター）を見出しに入れました。「`declare` のフィールドを直す」とだけ書くと、`@Input() declare` も直ったように読めます。
- **本文**：Ivy の変換が、`@angular/core` のデコレーターが 1 つも無いメンバーでも新しいノードを作っていたこと、新しいノードはパーサーが `declare` のフィールドに付ける印を失うこと、そのため `useDefineForClassFields` で `@Log declare value: string` が本物のフィールドとして出たこと、そして「外すものが無いときは元のノードを残す」こと。
- **書いていないこと**：残る形（`@Input() declare`）は本文にありません。見出しと「when there is nothing to strip」で範囲は読み取れますが、レビューでは「Angular のデコレーターがあるときは？」と聞かれる形です。出すときは、本文に 1 文「Angular のデコレーターを外すメンバーは、まだ同じ問題がある（作り直しが要るため）」を足すか、先に issue で方針を聞くかのどちらかになります。

📄 `angular/.ng-dev/commit-message.mjs` L7–8 （▶ の行: 8）

```js
7 │   maxLineLength: Infinity,
8 ▶   minBodyLength: 20,
```

8 行目の `minBodyLength: 20` のとおり本文は 20 文字以上が要ります（7 行目のとおり 1 行の長さに上限はありません）。フックの `ng-dev commit-message pre-commit-validate` は「Valid commit message」でした。

## 5. issue を出す前に確かめること

1. **同じ報告が無いか**

   gh で「declare field decorator useDefineForClassFields」は 0 件、「declare property emitted ivy」は 16 件で、どれも別の件でした。
2. **この直しだけを出すか、方針を聞くのが先か**

   直る範囲（Angular のものでないデコレーターだけ）は公開の API で直せました。残り（`@Input() declare`）は、作り直したノードに印を戻すしかなく、内部の API が要ります。どちらを選ぶかは compiler-cli の持ち主が決めることなので、この件は「issue で残りの形と、考えられる道（たとえば、内部の API を 1 か所に閉じ込めて使う、`declare` と Angular のデコレーターの組み合わせを診断で知らせる）を示して方針を聞く」のが先、というのが手元での結論です。残りの形は最終回の「直さないと決めたもの」で扱います。
3. **レビューで聞かれそうなこと**

   (1) `@Input() declare` はどうするのか（上のとおり）。(2) 元のノードを返すと、ほかに困ることは無いのか（compliance を含む 88 テストが期待のファイルを変えずに通った）。(3) `ts.getDecorators(node)?.length` を 310 行目のあとでもう一度呼ぶ重さ（`_nonCoreDecoratorsOnly` の中でも呼んでいる）。

## 聞かれそうな質問

**Q. Angular は 316 行目で `declare` の修飾子もそのまま渡しているのに、なぜ消えるのですか？**

TypeScript の ts 変換が、修飾子ではなく flags の印で `declare` を見分けているからです。typescript.js 99581 行目の `node.flags & 33554432 /* Ambient */` がその判定で、印はパーサーが付けます。316 行目で作ったノードにはこの印が無く、99585 行目で修飾子が `visitor` に通されて `declare` が落ちます。TypeScript だけの実験でも、何も変えずに `replaceDecoratorsAndModifiers` で作り直すだけでフィールドが出ました。

**Q. なぜ今ある spec（9483 行目）では見つからなかったのですか？**

9484 行目の `env.tsconfig()` が compilerOptions を渡さず、env.ts 102 行目の target es2015 のままなので、`useDefineForClassFields` が false だったからです。false では、もともと初期値の無いフィールドは出ません。新しい it は `env.tsconfig({}, {useDefineForClassFields: true})` で設定を足しました。

**Q. `@Input() declare a: string;` はこの直しで直りますか？**

直りません。`@Input()` は外す Angular のデコレーターなので、316 行目の作り直しが要り、印が消えます。一時的な it で確かめると、直したあとも `a` にも `@Input() @Log declare b` の `b` にも `Object.defineProperty(this, …)` が出ました（4 つのファイルシステムで 4 回）。

**Q. `ts.setNodeFlags` で印を付け直す方が、全部直るのではありませんか？**

全部に効く道ですが、`NodeFlags.Ambient` は公開の型（typescript.d.ts）に無く、最初の直しは TS2339 でビルドが落ちました。`(ts as any)` で包めば型の検査は避けられ、util/src/typescript.ts 81 行目のような前例もあります。ただ TypeScript の版で変わりうる内部に頼るかどうかは持ち主が決めることなので、手元では公開の API で直る範囲だけを直し、残りは方針を聞く側に回しました。

**Q. spec の 2 つ目の expect（`__decorate` の呼び出しが残る）は何のためですか？**

フィールドを消しすぎる直しを防ぐためです。1 つ目の `not.toContain('Object.defineProperty(this, "value"')` は、メンバーごと消しても通ります。`@Log` は利用者のデコレーターなので、呼び出しは残らなければいけません。今ある 9483 行目の it も、同じ `__decorate` の行を期待しています。

## 読み終えて

- transform.ts の 310〜316 行目は、デコレーターが 1 つでもあれば、外すものが無くてもノードを作り直していた。
- TypeScript は `declare` をパーサーが付けた flags の印（Ambient）で見分ける。作り直したノードには印が無く、`useDefineForClassFields` でフィールドが出る。TypeScript だけの実験で、作り直しそのものが原因と切り分けた。
- 印を付け直す直しは、公開の型に無い `NodeFlags.Ambient` で TS2339 になった。採ったのは「外すものが無ければ作り直さない」という公開の API だけの直し。
- 直る範囲は Angular のものでないデコレーターだけで、`@Input() declare` は残る。範囲は見出しに書き、残りは issue で方針を聞くのが先。

---

← 前: [spec を直す：何も確かめていない expect を見つける](06-fix-spec-assertions.md)  
次: [覚えたままの出力：Elements の ReplaySubject](08-fix-elements-outputs.md) →
