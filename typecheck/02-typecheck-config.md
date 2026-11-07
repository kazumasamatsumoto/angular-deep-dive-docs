[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 2 回 / 全 20 回

# strictTemplates が TypeCheckingConfig になるまで

> tsconfig の angularCompilerOptions（strictTemplates と、strictInputTypes などの個別の strict フラグ）が、NgCompiler の getTypeCheckingConfig で TypeCheckingConfig の 26 項目に展開される行と、個別のフラグが表に勝つ優先順位。strictTemplates が既定で真になった変更（PR #67802）と fullTemplateTypeCheck の削除（#67792）、どの項目が TCB のどこを変えるか。

angular/angular · 読了 約 11 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-config)

---

tsconfig の `angularCompilerOptions` に書く `strictTemplates` や `strictInputTypes` は、そのまま TCB を作る側に渡るわけではありません。`NgCompiler` の `getTypeCheckingConfig` が、それらを `TypeCheckingConfig` という 26 項目のオブジェクトに展開し、TCB を作る関数はその項目だけを見ます。この章では、公開オプションの定義、展開の手順と優先順位、`strictTemplates` が既定で真になった変更を行で確かめ、ページの上で項目を切り替えて TCB がどう変わるかを見ます。

読む対象は `compiler-cli/src/ngtsc/core/api/src/public_options.ts`（公開オプションの型）と `core/src/compiler.ts` の `strictTemplates`・`getTypeCheckingConfig`・`verifyCompatibleTypeCheckOptions`、それに spec の `template_typecheck_spec.ts` です。`getTypeCheckingConfig` の strict 側と非 strict 側の 2 つの表と個別の上書きの大部分は[compiler-typecheck](../compiler/17-compiler-typecheck.md) の 8 節に引用したので、ここでは残りの行を引き、全体は表にまとめます。

1. [1. 全体像](01-typecheck-overview.md)
2. **2. 設定**（この章）
3. [3. TCB の置き場所](03-typecheck-context.md)
4. [4. 派生プログラム](04-typecheck-program-driver.md)
5. [5. Environment](05-typecheck-environment.md)
6. [6. Scope と TcbOp](06-typecheck-scope.md)
7. [7. 式](07-typecheck-expressions.md)
8. [8. 要素と DOM](08-typecheck-elements-dom.md)
9. [9. 型コンストラクタ](09-typecheck-type-constructor.md)
10. [10. 入力](10-typecheck-inputs.md)
11. [11. 出力とイベント](11-typecheck-outputs-events.md)
12. [12. 双方向](12-typecheck-two-way.md)
13. [13. 制御フロー](13-typecheck-control-flow.md)
14. [14. ng-template のガード](14-typecheck-template-guards.md)
15. [15. 参照と pipe](15-typecheck-refs-pipes.md)
16. [16. 診断の対応付け](16-typecheck-diagnostics-mapping.md)
17. [17. 帯域外の診断](17-typecheck-oob.md)
18. [18. 拡張診断](18-typecheck-extended.md)
19. [19. TemplateTypeChecker](19-typecheck-template-type-checker.md)
20. [20. issue と PR を読む](20-typecheck-issues.md)

## 1. 公開オプション：利用者が書く名前

利用者が tsconfig に書けるテンプレートの型チェックの名前は、`TypeCheckingOptions` というインタフェースに並んでいます。

📄 `angular/packages/compiler-cli/src/ngtsc/core/api/src/public_options.ts` L80–102 （▶ の行: 82, 85, 87, 89, 100, 102）

```ts
 80 │ export interface TypeCheckingOptions {
 81 │   /** Whether type checking of host bindings is enabled. */
 82 ▶   typeCheckHostBindings?: boolean;
 83 │ 
 84 │   /**
 85 ▶    * If `true`, implies all template strictness flags below (unless individually disabled).
 86 │    *
 87 ▶    * Defaults to `true`
 88 │    */
 89 ▶   strictTemplates?: boolean;
 90 │ 
 91 │   /**
 92 │    * Whether to check the type of a binding to a directive/component input against the type of the
 93 │    * field on the directive/component.
 94 │    *
 95 │    * For example, if this is `false` then the expression `[input]="expr"` will have `expr` type-
 96 │    * checked, but not the assignment of the resulting type to the `input` property of whichever
 97 │    * directive or component is receiving the binding. If set to `true`, both sides of the assignment
 98 │    * are checked.
 99 │    *
100 ▶    * Defaults to `false`.
101 │    */
102 ▶   strictInputTypes?: boolean;
```

85〜89 行目、`strictTemplates` は「下に並ぶ strict の名前を全部まとめて真にする（個別に切ったものを除く）」スイッチで、87 行目のとおり**既定は `true`** です。82 行目の `typeCheckHostBindings` はホストバインディングを型チェックするかどうかで、これは別の系統です（[第 8 回](08-typecheck-elements-dom.md)）。102 行目の `strictInputTypes` は入力への代入の型を見るかどうかですが、100 行目は「Defaults to `false`」のままです。この「既定」は `strictTemplates` を切ったときの話で、`strictTemplates` が既定で真になった今は、何も書かなければ真になります（3 節）。

📄 `angular/packages/compiler-cli/src/ngtsc/core/api/src/public_options.ts` L104–128 （▶ の行: 108–110, 112, 114, 122, 125–126, 128）

```ts
104 │   /**
105 │    * Whether to check if the input binding attempts to assign to a restricted field (readonly,
106 │    * private, or protected) on the directive/component.
107 │    *
108 ▶    * Defaults to `false`, even if "strictTemplates" and/or
109 ▶    * "strictInputTypes" is set. Note that if `strictInputTypes` is not set, or set to `false`, this
110 ▶    * flag has no effect.
111 │    *
112 ▶    * Tracking issue for enabling this by default: https://github.com/angular/angular/issues/38400
113 │    */
114 ▶   strictInputAccessModifiers?: boolean;
115 │ 
116 │   /**
117 │    * Whether to use strict null types for input bindings for directives.
118 │    *
119 │    * If this is `true`, applications that are compiled with TypeScript's `strictNullChecks` enabled
120 │    * will produce type errors for bindings which can evaluate to `undefined` or `null` where the
121 │    * inputs's type does not include `undefined` or `null` in its type. If set to `false`, all
122 ▶    * binding expressions are wrapped in a non-null assertion operator to effectively disable strict
123 │    * null checks.
124 │    *
125 ▶    * Defaults to `false`. Note that if `strictInputTypes` is
126 ▶    * not set, or set to `false`, this flag has no effect.
127 │    */
128 ▶   strictNullInputTypes?: boolean;
```

114 行目の `strictInputAccessModifiers` だけは例外で、108〜109 行目のとおり `strictTemplates` を真にしても**偽のまま**です。readonly・private・protected の入力にテンプレートから代入してもエラーにしない、という意味です。112 行目が既定で真にする作業を追う issue #38400（2020-08 から開いている）で、2026-09-30 に立った #71066（テンプレートから TypeScript の private メンバーへのアクセスを制御するオプション）もこの話の続きです（[第 20 回](20-typecheck-issues.md)）。110 行目・125〜126 行目、`strictInputAccessModifiers` と `strictNullInputTypes` は `strictInputTypes` が偽だと効きません。入力の代入そのものを検査しないので、その細部も検査しようがないからです。

📄 `angular/packages/compiler-cli/src/ngtsc/core/api/src/public_options.ts` L144–164 （▶ の行: 147, 153, 160, 164）

```ts
144 │   /**
145 │    * Whether to use a strict type for null-safe navigation operations.
146 │    *
147 ▶    * If this is `false`, then the return type of `a?.b` or `a?()` will be `any`. If set to `true`,
148 │    * then the return type of `a?.b` for example will be the same as the type of the ternary
149 │    * expression `a != null ? a.b : a`.
150 │    *
151 │    * Defaults to `false`.
152 │    */
153 ▶   strictSafeNavigationTypes?: boolean;
154 │ 
155 │   /**
156 │    * Whether to infer the type of local references.
157 │    *
158 │    * If this is `true`, the type of a `#ref` variable on a DOM node in the template will be
159 │    * determined by the type of `document.createElement` for the given DOM node. If set to `false`,
160 ▶    * the type of `ref` for DOM nodes will be `any`.
161 │    *
162 │    * Defaults to `false`.
163 │    */
164 ▶   strictDomLocalRefTypes?: boolean;
```

147 行目、`strictSafeNavigationTypes` が偽だと `a?.b` の型は `any` です。160 行目、`strictDomLocalRefTypes` が偽だと DOM 要素の `#ref` は `any` です。残りの `strictOutputEventTypes`・`strictDomEventTypes`・`strictContextGenerics`・`strictLiteralTypes`・`strictAttributeTypes` も同じ形で、「真なら推論した型、偽なら `any`（または検査しない）」です。

> [!NOTE]
> **ポイント**
>
> 以前あった `fullTemplateTypeCheck` は、もうこのインタフェースにありません。PR #67792「refactor(compiler): remove `fullTemplateTypeCheck` compiler option.」（コミット f3c471e0d50、v22.0.0-next.7 から）で消えました。v13 で非推奨になっていたオプションで、コミットの本文は「`strictTemplates: true` を使う」と書いています。

## 2. getTypeCheckingConfig：26 項目に展開する

TCB を作る側（`@angular/compiler`）が受け取るのは `TypeCheckingConfig` です。公開オプションの名前（`strictInputTypes`）と項目の名前（`checkTypeOfInputBindings`）は別で、対応付けるのが `getTypeCheckingConfig` です。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L1066–1088 （▶ の行: 1069–1070, 1072, 1074, 1080–1085）

```ts
1066 │ 
1067 │   private getTypeCheckingConfig(): TypeCheckingConfig {
1068 │     // Determine the strictness level of type checking based on compiler options. As
1069 ▶     // `strictTemplates` is a superset of `fullTemplateTypeCheck`, the former implies the latter.
1070 ▶     // Also see `verifyCompatibleTypeCheckOptions` where it is verified that `fullTemplateTypeCheck`
1071 │     // is not disabled when `strictTemplates` is enabled.
1072 ▶     const strictTemplates = this.strictTemplates;
1073 │ 
1074 ▶     const useInlineTypeConstructors = this.programDriver.supportsInlineOperations;
1075 │ 
1076 │     // Check whether the loaded version of `@angular/core` in the `ts.Program` supports unwrapping
1077 │     // writable signals for type-checking. Only Angular versions greater than 17.2 have the necessary
1078 │     // symbols to type check signals in two-way bindings. We also allow version 0.0.0 in case somebody is
1079 │     // using Angular at head.
1080 ▶     const allowSignalsInTwoWayBindings =
1081 ▶       this.angularCoreVersion === null ||
1082 ▶       coreVersionSupportsFeature(this.angularCoreVersion, '>= 17.2.0-0');
1083 ▶     const allowDomEventAssertion =
1084 ▶       this.angularCoreVersion === null ||
1085 ▶       coreVersionSupportsFeature(this.angularCoreVersion, '>= 20.2.0');
1086 │ 
1087 │     // First select a type-checking configuration, based on whether full template type-checking is
1088 │     // requested.
```

1. **1072 行目：strictTemplates を決める**

   `this.strictTemplates` は `this.options.strictTemplates !== false` を返すゲッターです（[compiler-typecheck](../compiler/17-compiler-typecheck.md) の 8 節に引用）。**書かなければ真、`false` と書いたときだけ偽**です。1069〜1071 行目のコメントは今も `fullTemplateTypeCheck` に触れていますが、そのオプションは 1 節のとおりもうありません。
2. **1074 行目：inline の型コンストラクタを使えるか**

   `useInlineTypeConstructors` は利用者の設定ではなく、`ProgramDriver`（[第 4 回](04-typecheck-program-driver.md)）が元のファイルを書き換えられるかで決まります。ngc では真、言語サービスでは偽です（[第 3 回](03-typecheck-context.md)）。
3. **1080〜1085 行目：@angular/core の版で決まる 2 項目**

   `allowSignalsInTwoWayBindings` は core が 17.2 以上か（[第 12 回](12-typecheck-two-way.md)）、`allowDomEventAssertion` は 20.2 以上か（デモの `ɵassertType` の行。[第 11 回](11-typecheck-outputs-events.md)）。プログラムに入っている `@angular/core` の版を見て、古い core に無い記号を TCB に書かないようにしています。
4. **この続き：strict 側と非 strict 側の 2 つの表から 1 つを選ぶ**

   `if (strictTemplates)` の 2 つの枝で、26 項目を全部書いたオブジェクトを作ります。中身は下の表と、[compiler-typecheck](../compiler/17-compiler-typecheck.md) の 8 節の引用です。
5. **最後に：個別のオプションで上書きする**

   選んだ表の上から、利用者が書いた個別の strict の名前を 1 つずつ上書きします。その最後の部分がこれです。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L1184–1195 （▶ の行: 1190–1191, 1193–1194）

```ts
1184 │     if (this.options.strictDomLocalRefTypes !== undefined) {
1185 │       typeCheckingConfig.checkTypeOfDomReferences = this.options.strictDomLocalRefTypes;
1186 │     }
1187 │     if (this.options.strictAttributeTypes !== undefined) {
1188 │       typeCheckingConfig.checkTypeOfAttributes = this.options.strictAttributeTypes;
1189 │     }
1190 ▶     if (this.options.strictContextGenerics !== undefined) {
1191 ▶       typeCheckingConfig.useContextGenericType = this.options.strictContextGenerics;
1192 │     }
1193 ▶     if (this.options.strictLiteralTypes !== undefined) {
1194 ▶       typeCheckingConfig.strictLiteralTypes = this.options.strictLiteralTypes;
1195 │     }
```

1190〜1195 行目、どの上書きも `if (this.options.X !== undefined)` の形です。**書かなかった名前は表の値のまま、書いた名前は `true` でも `false` でも表の値に勝ちます。** だから `"strictTemplates": true, "strictInputTypes": false` は「strict の表から始めて、入力の型だけ切る」という意味になります（4 節の spec）。

| TypeCheckingConfig の項目 | strict 側 | 非 strict 側 | 上書きする公開オプション | TCB のどこが変わるか |
| --- | --- | --- | --- | --- |
| `checkTypeOfInputBindings` | true | false | `strictInputTypes` | 入力に代入する式を `as any` にする（第 10 回） |
| `applyTemplateContextGuards` | true | false | `strictInputTypes` | `ngTemplateContextGuard` の `if` を書かず、ただのブロックにする（第 14 回） |
| `strictNullInputBindings` | true | false | `strictNullInputTypes` | 入力に代入する式に `!` を付ける（第 10 回） |
| `honorAccessModifiersForInputBindings` | **false** | false | `strictInputAccessModifiers` | readonly などの入力に、型だけ借りた別の変数を通して代入する（第 10 回） |
| `checkTypeOfAttributes` | true | false | `strictAttributeTypes` | 静的な属性の代入に `/*D:ignore*/` を付ける |
| `checkTypeOfOutputEvents` / `checkTypeOfAnimationEvents` | true | false | `strictOutputEventTypes`（両方） | `subscribe` を書かず `$event: any` にする（第 11 回） |
| `checkTypeOfDomEvents` | true | false | `strictDomEventTypes` | `addEventListener` を書かず `$event: any` にする（第 11 回） |
| `checkTypeOfDomReferences` | true | false | `strictDomLocalRefTypes` | DOM 要素の `#ref` を `as any` にする（第 15 回） |
| `checkTypeOfNonDomReferences` | true | false | なし | ディレクティブや TemplateRef の `#ref`（第 15 回） |
| `checkTypeOfPipes` | true | false | なし | `transform` を `as any` にする（第 15 回） |
| `strictSafeNavigationTypes` | true | false | `strictSafeNavigationTypes` | `a?.b` を `(a!.b as any)` にする（第 7 回） |
| `checkTemplateBodies` | true | false | なし | `<ng-template>` の中を書かない（第 14 回） |
| `checkControlFlowBodies` | true | false | なし | `@if` / `@for` などの中を書かない（第 13 回） |
| `alwaysCheckSchemaInTemplateBodies` | true | Closure のときだけ true | なし | 中を書かないときも DOM のスキーマは見る（第 8 回） |
| `useContextGenericType` | true | false | `strictContextGenerics` | ジェネリックなコンポーネントの `this` に型引数を書く（第 5・9 回） |
| `strictLiteralTypes` | true | false | `strictLiteralTypes` | オブジェクトや配列のリテラルを `as any` にする（第 7 回） |
| `checkTypeOfDomBindings` | false | false | なし | DOM のプロパティへの代入の型。どちらでも偽（コメントは「まだ準備ができていない」） |
| `checkQueries` | false | false | なし | 型が `false` そのもので、真にできない |
| `enableTemplateTypeChecker` | NgCompiler の `enableTemplateTypeChecker` | なし（言語サービスが真にする） | 真なら省略できる op（要素の宣言など）も全部書く（第 6・19 回） |   |
| `useInlineTypeConstructors` | 1074 行目 | なし | 第 3・9 回 |   |
| `allowSignalsInTwoWayBindings` / `allowDomEventAssertion` | 1080〜1085 行目 | なし | 第 11・12 回 |   |
| `controlFlowPreventingContentProjection` / `unusedStandaloneImports` | `extendedDiagnostics.defaultCategory` か `'warning'` | `extendedDiagnostics.checks` の同名 | 第 17・18 回 |   |

## 3. strictTemplates が既定で真になった変更

`git log -S'strictTemplates !== false'` で、ゲッターを足したコミットが 1 つだけ見つかります。

| コミット | PR | 最初に入ったタグ | 何をしたか |
| --- | --- | --- | --- |
| f46e8bd4408（2026-03-23） | #67802「feat(compiler): Enable `strictTemplates` by default」 | v22.0.0-next.5 | `strictTemplates` のゲッター（`!== false`）を足し、それまでの `!!this.options.strictTemplates` を置き換えた。public\_options.ts の説明を「Defaults to `false`」から 87 行目の「Defaults to `true`」へ。既存のテストが壊れないよう、test/ngtsc/env.ts の `tsconfig()` に「書かなければ `strictTemplates: false`」を足した |
| f3c471e0d50（2026-03-23 作成、2026-04-06 に取り込み） | #67792（2026-04-06 にマージ） | v22.0.0-next.7 | `fullTemplateTypeCheck` を消した（1 節の囲み） |
| f1c0c405c9d（2026-08-05） | #70092「refactor(compiler): remove explicit `strict: true`」 | v22.2.0-next.2 | env.ts の「書かなければ `false`」を消した。いまの test/ngtsc は何も書かなければ strict で走る |

> [!WARNING]
> **ハマりどころ**
>
> f46e8bd4408 は、git のコミットの見出しが「refactor(compiler): remove `fullTemplateTypeCheck` compiler option.」になっています（PR #67792 と同じ見出し）。中身は「既定で真にする」変更で、PR の題は #67802 の「Enable `strictTemplates` by default」です（`gh api repos/angular/angular/commits/f46e8bd4408/pulls` で確かめた）。`git log --oneline` の見出しだけで判断しないでください。

このサイト自身の tsconfig.json は、`strictTemplates` を書かずに `strictInputAccessModifiers` だけを真にしています。

📄 `tsconfig.json（このサイト。抜粋）`

```
"angularCompilerOptions": {
  "enableI18nLegacyMessageIdFormat": false,
  "strictInjectionParameters": true,
  "strictInputAccessModifiers": true
}
```

だから、このサイトのビルドでは strict の表から始まり、strict の表で偽の項目のうち公開オプションで変えられる唯一の `honorAccessModifiersForInputBindings` が、個別の上書きで真になります。

## 4. デモ：項目を切り替えて TCB を並べる

> **🧪 DEMO — 同じテンプレートを、TypeCheckingConfig を変えて generateTypeCheckBlock に通す**
>
> 左は strict の表の値、右はチェックボックスで選んだ値で作った TCB です。右の TCB で、左に同じ行が無い行に色を付けます。`<user-card>` は入力 `size`（readonly の想定）と `title`、出力 `changed` を持つコンポーネント、`*ngFor` は `ngTemplateContextGuard` を持つジェネリックなディレクティブ、`date` は pipe として登録してあります。チェックボックスを変えるとすぐ作り直します（@angular/compiler 22.1.6）。
>
> 「TCB を作る」を押すか、チェックボックスを変えてください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-config)

「位置のコメントを消す」は、`tcb()` の助け（[第 1 回](01-typecheck-overview.md)）と同じ正規表現でコメントを消す表示だけの切り替えです。「strictTemplates: false の表にする」は、チェックボックスの 12 項目に加え、表に無い `alwaysCheckSchemaInTemplateBodies`・`checkTypeOfAnimationEvents`・`checkTypeOfNonDomReferences`・`useContextGenericType`・`strictLiteralTypes` も非 strict 側の値にします。試すと次のことが見えます。

1. **`strictSafeNavigationTypes` を切る**

   `(this).user?.name` が `((this).user!.name as any)` になります。`?.` の結果の型が `any` になり、後ろの誤りが見えなくなります。
2. **`checkTypeOfDomEvents` を切る**

   `_t1.addEventListener("input", ($event): any => …)` が、何にも渡さないアロー関数 `($event: any): any => …` になります。ハンドラの中の式は検査されますが、`$event` は `any` です。
3. **`checkTypeOfPipes` を切る**

   `_pipe_date.transform(…)` が `(_pipe_date.transform as any)(…)` になり、引数の型も戻り値の型も見なくなります。
4. **`applyTemplateContextGuards` を切る**

   `if (NgForOf.ngTemplateContextGuard(_t5, _t6))` がただの `{ … }` になります。`_t6` は `any` のままなので、`u` も `any` です（[第 14 回](14-typecheck-template-guards.md)）。
5. **`honorAccessModifiersForInputBindings` を入れる**

   既定では readonly の `size` に対して `var _t3 = null! as (typeof _t2)["size"]; _t3 = …` と、型だけ借りた別の変数へ代入します（代入の型は見るが、readonly は破らない）。入れると `_t2.size = …` と直接代入し、TypeScript が readonly への代入をエラーにします。このサイトの設定（3 節）はこちらです。

## 5. extendedDiagnostics との関係

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L1779–1799 （▶ の行: 1785, 1788, 1790, 1792）

```ts
1779 │ /**
1780 │  * Checks compiler options compatibility with strictTemplates
1781 │  */
1782 │ function* verifyCompatibleTypeCheckOptions(
1783 │   options: NgCompilerOptions,
1784 │ ): Generator<ts.Diagnostic, void, void> {
1785 ▶   if (options.extendedDiagnostics && options.strictTemplates === false) {
1786 │     yield makeConfigDiagnostic({
1787 │       category: ts.DiagnosticCategory.Error,
1788 ▶       code: ErrorCode.CONFIG_EXTENDED_DIAGNOSTICS_IMPLIES_STRICT_TEMPLATES,
1789 │       messageText: `
1790 ▶ Angular compiler option "extendedDiagnostics" is configured, however "strictTemplates" is disabled.
1791 │ 
1792 ▶ Using "extendedDiagnostics" requires that "strictTemplates" is also enabled.
1793 │ 
1794 │ One of the following actions is required:
1795 │ 1. Remove "strictTemplates: false" to enable it.
1796 │ 2. Remove "extendedDiagnostics" configuration to disable them.
1797 │       `.trim(),
1798 │     });
1799 │   }
```

1785 行目、`extendedDiagnostics` を書いたうえで `strictTemplates: false` と書くと、1788 行目の設定エラーになります。ここは `options.strictTemplates === false` と生の値を比べているので、`strictTemplates` を書かない（既定で真）なら通ります。拡張診断（16 の検査）は TCB の上で動くので、strict の TCB が前提です。設定の残り（`defaultCategory` と `checks`）は[第 18 回](18-typecheck-extended.md)で読みます。

## テストと直し方

📄 `angular/packages/compiler-cli/test/ngtsc/template_typecheck_spec.ts` L832–862 （▶ の行: 833, 836–837, 844, 855, 858）

```ts
832 │       it('should check expressions and their type when enabled', () => {
833 ▶         env.tsconfig({strictTemplates: true, strictInputTypes: true});
834 │ 
835 │         const diags = env.driveDiagnostics();
836 ▶         expect(diags.length).toBe(2);
837 ▶         expect(diags[0].messageText).toEqual(`Type 'boolean' is not assignable to type 'string'.`);
838 │         expect(diags[1].messageText).toEqual(
839 │           `Property 'invalid' does not exist on type 'TestCmp'.`,
840 │         );
841 │       });
842 │ 
843 │       it('should check expressions and their type when overall strictness is enabled', () => {
844 ▶         env.tsconfig({strictTemplates: true});
845 │ 
846 │         const diags = env.driveDiagnostics();
847 │         expect(diags.length).toBe(2);
848 │         expect(diags[0].messageText).toEqual(`Type 'boolean' is not assignable to type 'string'.`);
849 │         expect(diags[1].messageText).toEqual(
850 │           `Property 'invalid' does not exist on type 'TestCmp'.`,
851 │         );
852 │       });
853 │ 
854 │       it('should check expressions but not their type when not enabled', () => {
855 ▶         env.tsconfig({strictTemplates: true, strictInputTypes: false});
856 │ 
857 │         const diags = env.driveDiagnostics();
858 ▶         expect(diags.length).toBe(1);
859 │         expect(diags[0].messageText).toEqual(
860 │           `Property 'invalid' does not exist on type 'TestCmp'.`,
861 │         );
862 │       });
```

template\_typecheck\_spec.ts の `describe('strictInputTypes')` の 3 本の it は、同じテンプレート `[foo]="!!invalid"` を 3 つの設定で通します。833 行目（両方を真）と 844 行目（`strictTemplates` だけ）は 836〜837 行目の「boolean を string に代入できない」を含む 2 件、855 行目（`strictTemplates: true` と `strictInputTypes: false`）は 858 行目で 1 件です。2 節の「個別の名前が表に勝つ」がこの 3 本で確かめられています。同じ 3 本組（enabled / overall strictness / not enabled）が `strictNullInputTypes`・`strictSafeNavigationTypes`・`strictOutputEventTypes`・`strictDomLocalRefTypes`・`strictAttributeTypes`・`strictDomEventTypes` の describe にもあります（strict で始まる 8 つの describe に it が合わせて 26 本）。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=ngtsc type checking strict"
```

📄 `出力（2026-11-02 に実行。抜粋）`

```
==================== Test output for //packages/compiler-cli/test/ngtsc:ngtsc (shard 1 of 4):
Ran 24 of 6674 specs
==================== Test output for //packages/compiler-cli/test/ngtsc:ngtsc (shard 4 of 4):
Ran 24 of 6674 specs
==================== Test output for //packages/compiler-cli/test/ngtsc:ngtsc (shard 3 of 4):
Ran 28 of 6678 specs
==================== Test output for //packages/compiler-cli/test/ngtsc:ngtsc (shard 2 of 4):
Ran 28 of 6678 specs
INFO: Elapsed time: 3.140s, Critical Path: 2.92s
//packages/compiler-cli/test/ngtsc:ngtsc                                 PASSED in 2.9s
  Stats over 4 runs: max = 2.9s, min = 2.8s, avg = 2.8s, dev = 0.0s
```

1. **件数を確かめる**

   4 つの shard の合計は 24 + 24 + 28 + 28 = 104 で、26 本の it × 4 つのファイルシステム（[第 1 回](01-typecheck-overview.md)）と合います。2.9 秒で通りました。
2. **tcb() の既定の設定**

   📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/testing/index.ts` L441–468 （▶ の行: 445, 448, 467）

   ```ts
   441 │   const fullConfig: TypeCheckingConfig = {
   442 │     applyTemplateContextGuards: true,
   443 │     checkQueries: false,
   444 │     checkTypeOfInputBindings: true,
   445 ▶     honorAccessModifiersForInputBindings: false,
   446 │     strictNullInputBindings: true,
   447 │     checkTypeOfAttributes: true,
   448 ▶     checkTypeOfDomBindings: false,
   449 │     checkTypeOfOutputEvents: true,
   450 │     checkTypeOfAnimationEvents: true,
   451 │     checkTypeOfDomEvents: true,
   452 │     checkTypeOfDomReferences: true,
   453 │     checkTypeOfNonDomReferences: true,
   454 │     checkTypeOfPipes: true,
   455 │     checkTemplateBodies: true,
   456 │     checkControlFlowBodies: true,
   457 │     alwaysCheckSchemaInTemplateBodies: true,
   458 │     controlFlowPreventingContentProjection: 'warning',
   459 │     unusedStandaloneImports: 'warning',
   460 │     strictSafeNavigationTypes: true,
   461 │     useContextGenericType: true,
   462 │     strictLiteralTypes: true,
   463 │     enableTemplateTypeChecker: false,
   464 │     useInlineTypeConstructors: true,
   465 │     allowSignalsInTwoWayBindings: true,
   466 │     allowDomEventAssertion: true,
   467 ▶     ...config,
   468 │   };
   ```

   `type_check_block_spec` の `tcb()` は、strict の表とほぼ同じ値から始め（445 行目の `honorAccessModifiersForInputBindings: false` まで同じ）、467 行目で spec が渡した項目だけを上書きします。TCB の形を項目ごとに確かめるなら、`tcb(TEMPLATE, DIRECTIVES, {strictSafeNavigationTypes: false})` のように 3 つ目の引数を渡す it を足します。
3. **直すとしたら**

   公開オプションを足すなら public\_options.ts の `TypeCheckingOptions`、項目への展開は compiler.ts の `getTypeCheckingConfig`、項目そのものは `@angular/compiler` の `compiler/src/typecheck/api.ts` の `TypeCheckingConfig` です。確かめる spec は template\_typecheck\_spec.ts の上の 3 本組の形です。`strictTemplates` を書かないときに strict になることを直接確かめる it は、`'by default'` などの文字列で grep した範囲では見つかりませんでした（env.ts が何も足さなくなったので、書かない spec は全部 strict で走っています）。
4. **issue を読むときの手がかり**

   #38400（`strictInputAccessModifiers` を既定に）は 1 節の 112 行目に URL が書かれています。閉じた #55868（`strictTemplates` を「警告だけ」にするモード）は、2024-05 にチームが「tsconfig を分ければよいので、警告のモードは作らない」と答えて閉じました。[第 20 回](20-typecheck-issues.md)で一覧にします。

## 聞かれそうな質問

**Q. strictTemplates を false にすると、何が消えますか？**

2 節の表の「非 strict 側」になります。入力の型（`as any`）、`ngTemplateContextGuard`、`$event` の型、`#ref` の型、pipe の型、`?.` の型、リテラルの型が全部 `any` 扱いになり、`<ng-template>` と `@if` / `@for` の中身はそもそも TCB に書かれません。それでも `{{ foo.bar }}` の `foo` がコンポーネントに無いことは見つかります（`this.foo` は書かれるので）。4 節のデモの「strictTemplates: false の表にする」で、どの行が変わるかを見られます。

**Q. 個別のフラグは strictTemplates より優先されますか？**

優先されます。`getTypeCheckingConfig` は先に `strictTemplates` で表を選び、そのあと 1190〜1195 行目の形の `!== undefined` の上書きを順に当てます。`strictTemplates: false` と `strictInputTypes: true` なら、非 strict の表から始めて入力の型だけ検査します。逆の組み合わせは 4 節の spec の 855 行目です。

**Q. extendedDiagnostics は別の設定ですか？**

別の設定ですが、独立ではありません。1785 行目のとおり、`strictTemplates: false` と一緒に書くと設定エラーです。拡張診断の個々の重さ（エラー・警告・抑止）は `extendedDiagnostics.checks` で選びます（[第 18 回](18-typecheck-extended.md)）。表の最後の 2 項目（`controlFlowPreventingContentProjection`・`unusedStandaloneImports`）だけは TCB を作る側が直接使うので、`TypeCheckingConfig` にも入っています。

**Q. fullTemplateTypeCheck はどうなりましたか？**

v22.0.0-next.7 で消えました（PR #67792）。1069〜1071 行目のコメントに名前が残っているだけで、`getTypeCheckingConfig` はもう読みません。tsconfig に残っていても、`TypeCheckingOptions` に無い名前なので何も起きません。

**Q. 言語サービスでも同じ値になりますか？**

利用者の strict の名前から決まる項目は同じです。違うのは 1074 行目の `useInlineTypeConstructors`（言語サービスの `ProgramDriver` は元のファイルを書き換えないので偽）と、`enableTemplateTypeChecker`（言語サービスは真）です。その結果、言語サービスでは inline が要る場合の扱いが変わります（[第 3 回](03-typecheck-context.md)）。

## 読み終えて

- 利用者が書く名前（`strictInputTypes` など）と、TCB を作る側が読む項目（`checkTypeOfInputBindings` など 26 個）は別で、`getTypeCheckingConfig` が対応付ける。
- 手順は「`strictTemplates !== false` で表を選ぶ → 書かれた個別の名前で上書き」。書いた名前は表に勝つ。
- `strictTemplates` の既定が真になったのは PR #67802（v22.0.0-next.5）。`fullTemplateTypeCheck` は #67792 で消えた。
- `strictInputAccessModifiers` だけは strict でも偽のまま（#38400）。このサイトは個別に真にしている。

---

← 前: [テンプレート型チェックの全体像：TCB を作って TypeScript に任せる](01-typecheck-overview.md)  
次: [TypeCheckContext：TCB をどこに置くか](03-typecheck-context.md) →
