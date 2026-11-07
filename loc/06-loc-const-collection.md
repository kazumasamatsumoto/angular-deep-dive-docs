[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 6 回 / 全 20 回

# 出力に $localize を書く：i18n の定数と goog.getMsg

> i18n\_const\_collection.ts がメッセージごとに consts の関数に変数を作る行、localize\_utils.ts が $localize のタグ付きテンプレートの文字列（:meaning|description@@id: と :INTERPOLATION:）を組む行、get\_msg\_utils.ts が Closure 用の goog.getMsg を書く行と、2 つを ngI18nClosureMode で分ける出力。i18nUseExternalIds と MSG\_EXTERNAL\_ の名前。ページの上で本物のコンパイラの出力を見るデモ。

angular/angular · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-const-collection)

---

i18n の付いたコンポーネントをビルドすると、`ɵɵdefineComponent` の `consts` が配列ではなく関数になり、その中に ``if (ngI18nClosureMode) { goog.getMsg(…) } else { $localize`…` }`` の組が メッセージの数だけ並びます。この章では、[前の回](05-loc-pipeline-phases.md)の段が作った表から、どの関数がこの文を組み立てるのかを追います。`:meaning|description@@id␟legacy:` の頭の部分、`MSG_EXTERNAL_` の変数名、Closure の枝が本番のビルドでどう消えるかまでを、本物のコンパイラの出力で確かめます。

読む対象は `packages/compiler/src/template/pipeline/src/phases/` の `extract_i18n_messages.ts`・`i18n_const_collection.ts`、`packages/compiler/src/render3/view/i18n/` の `localize_utils.ts`・`get_msg_utils.ts`、`packages/compiler/src/output/output_ast.ts` の `LocalizedString` です。

1. [1. 全体像](01-loc-overview.md)
2. [2. 印とメッセージ](02-loc-markup.md)
3. [3. プレースホルダー](03-loc-placeholders.md)
4. [4. メッセージ ID](04-loc-message-id.md)
5. [5. コンパイラの段](05-loc-pipeline-phases.md)
6. **6. $localize の出力**（この章）
7. [7. ICU のコンパイル](07-loc-icu-compile.md)
8. [8. 設定と古い抽出](08-loc-compiler-options.md)
9. [9. 実行時（1）解析](09-loc-runtime-start.md)
10. [10. 実行時（2）DOM](10-loc-runtime-dom.md)
11. [11. 実行時（3）ICU](11-loc-runtime-icu.md)
12. [12. ロケールのデータ](12-loc-locale-data.md)
13. [13. $localize](13-loc-localize-tag.md)
14. [14. 実行時の翻訳](14-loc-runtime-translations.md)
15. [15. 抽出](15-loc-extract-tool.md)
16. [16. 翻訳ファイルを書く](16-loc-serializers.md)
17. [17. 翻訳ファイルを読む](17-loc-translation-parsers.md)
18. [18. 差し込み](18-loc-translate-tool.md)
19. [19. テスト](19-loc-testing.md)
20. [20. issue と PR を読む](20-loc-issues.md)

## 1. 先にゴールを見る：legacy ID 付きの consts

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/localize_legacy_message_ids/legacy_enabled.ts` L3–14 （▶ の行: 6–9）

```ts
 3 │ @Component({
 4 │     selector: 'my-component',
 5 │     template: `
 6 ▶   <div i18n-title title="Some &amp; attribute"></div>
 7 ▶   <div i18n>Some &amp; message</div>
 8 ▶   <div i18n-title title="Some &amp; {{'interpolated'}} attribute"></div>
 9 ▶   <div i18n>Some &amp; {{'interpolated' }} message</div>
10 │   <div i18n>&amp;</div>
11 │   <div i18n>&amp;&quot;</div>
12 │   <div i18n-title title="&quot;"></div>
13 │   <div i18n-title title="&quot;&quot;"></div>
14 │ `,
```

コンプライアンステストの入力です。6・8 行目は `i18n-title`（属性の翻訳）、7・9 行目は `i18n`（本文の翻訳）で、8・9 行目には補間があります。このテストケースは `enableI18nLegacyMessageIdFormat: true` で走ります（TEST\_CASES.json の書き方は[第 19 回](19-loc-testing.md)）。期待する出力の頭とお尻です。

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/localize_legacy_message_ids/legacy_enabled.js` L1–25 （▶ の行: 1–3, 7, 9, 12）

```js
 1 ▶ consts: () => {
 2 ▶   let $i18n_0$;
 3 ▶   if (typeof ngI18nClosureMode !== "undefined" && ngI18nClosureMode) {
 4 │     /**
 5 │      * @suppress {msgDescriptions}
 6 │      */
 7 ▶     const $MSG_EXTERNAL_2908931752694090721$$LEGACY_ENABLED_TS_1$ = /* @ts-ignore */ goog.getMsg(
 8 │         "Some & attribute");
 9 ▶     $i18n_0$ = $MSG_EXTERNAL_2908931752694090721$$LEGACY_ENABLED_TS_1$;
10 │   } else {
11 │     /* @ts-ignore */
12 ▶     $i18n_0$ = $localize`:␟82ec661067f503a3357ecc159b2128325e9208cd␟2908931752694090721:Some & attribute`;
13 │   }
14 │   let $i18n_2$;
15 │   if (typeof ngI18nClosureMode !== "undefined" && ngI18nClosureMode) {
16 │     /**
17 │      * @suppress {msgDescriptions}
18 │      */
19 │     const $MSG_EXTERNAL_2720535395337591908$$LEGACY_ENABLED_TS_13$ = /* @ts-ignore */ goog.getMsg(
20 │         "\"");
21 │     $i18n_2$ = $MSG_EXTERNAL_2720535395337591908$$LEGACY_ENABLED_TS_13$;
22 │   } else {
23 │     /* @ts-ignore */
24 │     $i18n_2$ = $localize`:␟5b30d888e99e7c6cfc6265f89c39b5921805cd2e␟2720535395337591908:"`;
25 │   }
```

📄 `angular/packages/compiler-cli/test/compliance/test_cases/r3_view_compiler_i18n/localize_legacy_message_ids/legacy_enabled.js` L100–130 （▶ の行: 100, 104, 106, 109, 124–125）

```js
100 ▶   return [$i18n_8$, $i18n_10$, $i18n_12$, $i18n_14$, ["title", $i18n_6$], ["title", $i18n_0$], [6, "title"], ["title", $i18n_2$], ["title", $i18n_4$]];
101 │ },
102 │ template: function MyComponent_Template(rf, ctx) {
103 │   if (rf & 1) {
104 ▶     i0.ɵɵelement(0, "div", 5);
105 │     i0.ɵɵelementStart(1, "div");
106 ▶     i0.ɵɵi18n(2, 0);
107 │     i0.ɵɵelementEnd();
108 │     i0.ɵɵelementStart(3, "div", 6);
109 ▶     i0.ɵɵi18nAttributes(4, 4);
110 │     i0.ɵɵelementEnd();
111 │     i0.ɵɵelementStart(5, "div");
112 │     i0.ɵɵi18n(6, 1);
113 │     i0.ɵɵelementEnd();
114 │     i0.ɵɵelementStart(7, "div");
115 │     i0.ɵɵi18n(8, 2);
116 │     i0.ɵɵelementEnd();
117 │     i0.ɵɵelementStart(9, "div");
118 │     i0.ɵɵi18n(10, 3);
119 │     i0.ɵɵelementEnd();
120 │     i0.ɵɵelement(11, "div", 7)(12, "div", 8);
121 │   }
122 │   if (rf & 2) {
123 │     i0.ɵɵadvance(3);
124 ▶     i0.ɵɵi18nExp("interpolated");
125 ▶     i0.ɵɵi18nApply(4);
126 │     i0.ɵɵadvance(3);
127 │     i0.ɵɵi18nExp("interpolated");
128 │     i0.ɵɵi18nApply(6);
129 │   }
130 │ }
```

1 行目、`consts` は引数の無い関数です。2 行目で変数 `i18n_0` を宣言し、3 行目の条件で 2 つの枝に分かれます。7 行目が Closure 用の `goog.getMsg`（変数名は `MSG_EXTERNAL_<ID>$$<ファイル名>_<番号>`）、12 行目が `$localize` のタグ付きテンプレートで、頭の `:␟82ec…␟2908…:` が legacy ID です。100 行目、関数は最後に配列を返します。本文のメッセージは配列の要素として（`$i18n_8$` など）、属性のメッセージは `["title", $i18n_6$]` の組として入り、106 行目の `ɵɵi18n(2, 0)` の `0`、109 行目の `ɵɵi18nAttributes(4, 4)` の 2 つ目の `4` がこの配列の番号です。（`$…$` はテストのマクロで、「名前は何でもよいが同じ名前は同じもの」という意味です。）

この形を作るのは、パイプラインの 57 番 `extractI18nMessages` と 58 番 `collectI18nConsts` の 2 つの段です（[前の回](05-loc-pipeline-phases.md)の 2 節の表）。

## 2. extractI18nMessages：入れ物 1 つにメッセージの op 1 つ

📄 `angular/packages/compiler/src/template/pipeline/src/phases/extract_i18n_messages.ts` L57–77 （▶ の行: 63, 66–69）

```ts
57 │ export function extractI18nMessages(job: CompilationJob): void {
58 │   // Create an i18n message for each context.
59 │   // TODO: Merge the context op with the message op since they're 1:1 anyways.
60 │   const i18nMessagesByContext = new Map<ir.XrefId, ir.I18nMessageOp>();
61 │   const i18nBlocks = new Map<ir.XrefId, ir.I18nStartOp>();
62 │   const i18nContexts = new Map<ir.XrefId, ir.I18nContextOp>();
63 ▶   for (const unit of job.units) {
64 │     for (const op of unit.create) {
65 │       switch (op.kind) {
66 ▶         case ir.OpKind.I18nContext:
67 ▶           const i18nMessageOp = createI18nMessage(job, op);
68 ▶           unit.create.push(i18nMessageOp);
69 ▶           i18nMessagesByContext.set(op.xref, i18nMessageOp);
70 │           i18nContexts.set(op.xref, op);
71 │           break;
72 │         case ir.OpKind.I18nStart:
73 │           i18nBlocks.set(op.xref, op);
74 │           break;
75 │       }
76 │     }
77 │   }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/extract_i18n_messages.ts` L127–148 （▶ の行: 135–137, 141–142）

```ts
127 │ /**
128 │  * Create an i18n message op from an i18n context op.
129 │  */
130 │ function createI18nMessage(
131 │   job: CompilationJob,
132 │   context: ir.I18nContextOp,
133 │   messagePlaceholder?: string,
134 │ ): ir.I18nMessageOp {
135 ▶   let formattedParams = formatParams(context.params);
136 ▶   const formattedPostprocessingParams = formatParams(context.postprocessingParams);
137 ▶   let needsPostprocessing = [...context.params.values()].some((v) => v.length > 1);
138 │   return ir.createI18nMessageOp(
139 │     job.allocateXrefId(),
140 │     context.xref,
141 ▶     context.i18nBlock,
142 ▶     context.message,
143 │     messagePlaceholder ?? null,
144 │     formattedParams,
145 │     formattedPostprocessingParams,
146 │     needsPostprocessing,
147 │   );
148 │ }
```

66〜69 行目、前の回の入れ物（`I18nContextOp`）ごとに 67 行目で `I18nMessageOp` を作って create の末尾に積みます。135〜136 行目で 2 つの表（`params` と `postprocessingParams`）の値を文字列の式にし（前の回の 12 節の `formatValue`）、137 行目、**どれかの名前に値が 2 つ以上あれば `needsPostprocessing`** を立てます。141 行目の `i18nBlock` は、本文のメッセージならブロックの xref、属性のメッセージなら `null` です。この関数の後半は ICU をサブメッセージとして親につなぐ処理で、[次の回](07-loc-icu-compile.md)で読みます。

## 3. collectI18nConsts：consts に並べる 4 つのステップ

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L21–50 （▶ の行: 22, 29, 32, 40, 48–49）

```ts
21 │ /** Name of the global variable that is used to determine if we use Closure translations or not */
22 ▶ const NG_I18N_CLOSURE_MODE = 'ngI18nClosureMode';
23 │ 
24 │ /**
25 │  * Prefix for non-`goog.getMsg` i18n-related vars.
26 │  * Note: the prefix uses lowercase characters intentionally due to a Closure behavior that
27 │  * considers variables like `I18N_0` as constants and throws an error when their value changes.
28 │  */
29 ▶ const TRANSLATION_VAR_PREFIX = 'i18n_';
30 │ 
31 │ /** Prefix of ICU expressions for post processing */
32 ▶ const I18N_ICU_MAPPING_PREFIX = 'I18N_EXP_';
33 │ 
34 │ /**
35 │  * The escape sequence used for message param values.
36 │  */
37 │ const ESCAPE = '\uFFFD';
38 │ 
39 │ /* Closure variables holding messages must be named `MSG_[A-Z0-9]+` */
40 ▶ const CLOSURE_TRANSLATION_VAR_PREFIX = 'MSG_';
41 │ 
42 │ /**
43 │  * Generates a prefix for translation const name.
44 │  *
45 │  * @param extra Additional local prefix that should be injected into translation var name
46 │  * @returns Complete translation const prefix
47 │  */
48 ▶ function getTranslationConstPrefix(extra: string): string {
49 ▶   return `${CLOSURE_TRANSLATION_VAR_PREFIX}${extra}`.toUpperCase();
50 │ }
```

名前の材料です。22 行目が分岐に使うグローバル変数の名前、29 行目が `$localize` の側の変数の頭 `i18n_`、40 行目が Closure の側の頭 `MSG_` です。26〜27 行目のコメントのとおり、`i18n_` が小文字なのは、Closure が `I18N_0` のような大文字の名前を定数とみなし、後で代入するとエラーにするからです。

### ステップ 1・2：メッセージを文にして、行き先を決める

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L118–151 （▶ の行: 124–126, 129–130, 133, 136, 140, 143, 148）

```ts
118 │   const i18nValuesByContext = new Map<ir.XrefId, o.Expression>();
119 │   const messageConstIndices = new Map<ir.XrefId, ir.ConstIndex>();
120 │ 
121 │   for (const unit of job.units) {
122 │     for (const op of unit.create) {
123 │       if (op.kind === ir.OpKind.I18nMessage) {
124 ▶         if (op.messagePlaceholder === null) {
125 ▶           const {mainVar, statements} = collectMessage(job, fileBasedI18nSuffix, messages, op);
126 ▶           if (op.i18nBlock !== null) {
127 │             // This is a regular i18n message with a corresponding i18n block. Collect it into the
128 │             // const array.
129 ▶             const i18nConst = job.addConst(mainVar, statements);
130 ▶             messageConstIndices.set(op.i18nBlock, i18nConst);
131 │           } else {
132 │             // This is an i18n attribute. Extract the initializers into the const pool.
133 ▶             job.constsInitializers.push(...statements);
134 │ 
135 │             // Save the i18n variable value for later.
136 ▶             i18nValuesByContext.set(op.i18nContext, mainVar);
137 │ 
138 │             // This i18n message may correspond to an individual extracted attribute. If so, The
139 │             // value of that attribute is updated to read the extracted i18n variable.
140 ▶             const attributesForMessage = extractedAttributesByI18nContext.get(op.i18nContext);
141 │             if (attributesForMessage !== undefined) {
142 │               for (const attr of attributesForMessage) {
143 ▶                 attr.expression = mainVar.clone();
144 │               }
145 │             }
146 │           }
147 │         }
148 ▶         ir.OpList.remove<ir.CreateOp>(op);
149 │       }
150 │     }
151 │   }
```

ステップ 1（引用の前の部分）は、属性・`I18nAttributes`・属性の式・メッセージの op を Map に集めるだけです。ステップ 2 が本体です。

1. **サブメッセージではないものだけを扱う（124 行目）**

   `messagePlaceholder` が付いているのは ICU のサブメッセージで、親のメッセージの中で一緒に文にされます（次の回）。
2. **文にする（125 行目の `collectMessage`）**

   戻り値の `mainVar` は `i18n_0` のような変数、`statements` はそれに値を入れる文の並び（4 節）です。
3. **本文のメッセージは consts の配列に（126〜130 行目）**

   129 行目の `job.addConst(mainVar, statements)` が、配列に `i18n_0` を足し、文を consts の関数の本体（`constsInitializers`）に足します（`addConst` は[consts の章](../compiler/14-compiler-consts-pure.md)）。130 行目で、ブロックの xref → 配列の番号を覚えます。
4. **属性のメッセージは文だけを足し、変数は属性の値にする（131〜146 行目）**

   133 行目で文だけを関数の本体に足し、136 行目で変数を覚えます。補間の無い属性（`title="Some &amp; attribute"`）は、140〜144 行目でその属性の値を変数に差し替えます。これが 1 節の `["title", $i18n_0$]` です。
5. **メッセージの op を消す（148 行目）**

### ステップ 3・4：番号を op に書き戻す

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L166–196 （▶ の行: 177–180, 183–184, 188, 191–192）

```ts
166 │         let i18nExpressions = i18nExpressionsByElement.get(elem.xref);
167 │         if (i18nExpressions === undefined) {
168 │           // Unused i18nAttributes should have already been removed.
169 │           // TODO: Should the removal of those dead instructions be merged with this phase?
170 │           throw new Error(
171 │             'AssertionError: Could not find any i18n expressions associated with an I18nAttributes instruction',
172 │           );
173 │         }
174 │ 
175 │         // Find expressions for all the unique property names, removing duplicates.
176 │         const seenPropertyNames = new Set<string>();
177 ▶         i18nExpressions = i18nExpressions.filter((i18nExpr) => {
178 ▶           const seen = seenPropertyNames.has(i18nExpr.name);
179 ▶           seenPropertyNames.add(i18nExpr.name);
180 ▶           return !seen;
181 │         });
182 │ 
183 ▶         const i18nAttributeConfig = i18nExpressions.flatMap((i18nExpr) => {
184 ▶           const i18nExprValue = i18nValuesByContext.get(i18nExpr.context);
185 │           if (i18nExprValue === undefined) {
186 │             throw new Error("AssertionError: Could not find i18n expression's value");
187 │           }
188 ▶           return [o.literal(i18nExpr.name), i18nExprValue];
189 │         });
190 │ 
191 ▶         i18nAttributes.i18nAttributesConfig = job.addConst(
192 ▶           new o.LiteralArrayExpr(i18nAttributeConfig),
193 │         );
194 │       }
195 │     }
196 │   }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L198–213 （▶ の行: 202–203, 209）

```ts
198 │   // Step Four: Propagate the extracted const index into i18n ops that messages were extracted from.
199 │ 
200 │   for (const unit of job.units) {
201 │     for (const op of unit.create) {
202 ▶       if (op.kind === ir.OpKind.I18nStart) {
203 ▶         const msgIndex = messageConstIndices.get(op.root);
204 │         if (msgIndex === undefined) {
205 │           throw new Error(
206 │             'AssertionError: Could not find corresponding i18n block index for an i18n message op; was an i18n message incorrectly assumed to correspond to an attribute?',
207 │           );
208 │         }
209 ▶         op.messageIndex = msgIndex;
210 │       }
211 │     }
212 │   }
213 │ }
```

補間のある属性は、実行時の `ɵɵi18nAttributes` に「属性名, 翻訳した文」の並びを渡します。177〜181 行目で同じ属性名の式を 1 つにまとめ、183〜189 行目で `["title", i18n_6]` の形に並べ、191〜193 行目で consts に足して番号を op に入れます。ステップ 4 の 202〜209 行目は、すべての `I18nStartOp`（子のブロックも）に、**ルートの**メッセージの番号（203 行目の `op.root`）を入れます。前の回の 1 節で、`@if` の分岐の関数がどれも `ɵɵi18nStart(0, 0, N)`（2 つ目が 0）だったのはこのためです。

## 4. collectMessage：変数名と 2 つの枝

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L246–258 （▶ の行: 247, 249, 253, 255–257）

```ts
246 │   // Sort the params for consistency with TemaplateDefinitionBuilder output.
247 ▶   messageOp.params = new Map([...messageOp.params.entries()].sort());
248 │ 
249 ▶   const mainVar = o.variable(job.pool.uniqueName(TRANSLATION_VAR_PREFIX), o.DYNAMIC_TYPE);
250 │   // Closure Compiler requires const names to start with `MSG_` but disallows any other
251 │   // const to start with `MSG_`. We define a variable starting with `MSG_` just for the
252 │   // `goog.getMsg` call
253 ▶   const closureVar = i18nGenerateClosureVar(
254 │     job.pool,
255 ▶     messageOp.message.id,
256 ▶     fileBasedI18nSuffix,
257 ▶     job.i18nUseExternalIds,
258 │   );
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L280–292 （▶ の行: 281–282, 286–287）

```ts
280 │   // Add the message's statements
281 ▶   statements.push(
282 ▶     ...getTranslationDeclStmts(
283 │       messageOp.message,
284 │       mainVar,
285 │       closureVar,
286 ▶       messageOp.params,
287 ▶       transformFn,
288 │     ),
289 │   );
290 │ 
291 │   return {mainVar, statements};
292 │ }
```

247 行目で表を名前の順に並べ替えます（出力の `goog.getMsg` の表がアルファベット順なのはこのため）。249 行目の `uniqueName('i18n_')` が `i18n_0`・`i18n_1`… を、253〜258 行目が Closure の側の変数を作ります。2 つの引用の間は後処理（`ɵɵi18nPostprocess`）の準備で、次の回で読みます。281〜288 行目で、2 つの枝の文を作ります。

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L346–372 （▶ の行: 355–359, 362, 367–368）

```ts
346 │ function getTranslationDeclStmts(
347 │   message: i18n.Message,
348 │   variable: o.ReadVarExpr,
349 │   closureVar: o.ReadVarExpr,
350 │   params: Map<string, o.Expression>,
351 │   transformFn?: (raw: o.ReadVarExpr) => o.Expression,
352 │ ): o.Statement[] {
353 │   const paramsObject = Object.fromEntries(params);
354 │   const statements: o.Statement[] = [
355 ▶     declareI18nVariable(variable),
356 ▶     o.ifStmt(
357 ▶       createClosureModeGuard(),
358 ▶       createGoogleGetMsgStatements(variable, message, closureVar, paramsObject),
359 ▶       createLocalizeStatements(
360 │         variable,
361 │         message,
362 ▶         formatI18nPlaceholderNamesInMap(paramsObject, /* useCamelCase */ false),
363 │       ),
364 │     ),
365 │   ];
366 │ 
367 ▶   if (transformFn) {
368 ▶     statements.push(new o.ExpressionStatement(variable.set(transformFn(variable))));
369 │   }
370 │ 
371 │   return statements;
372 │ }
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/i18n_const_collection.ts` L374–409 （▶ の行: 383–386, 400–403, 405–406）

````ts
374 │ /**
375 │  * Create the expression that will be used to guard the closure mode block
376 │  * It is equivalent to:
377 │  *
378 │  * ```ts
379 │  * typeof ngI18nClosureMode !== undefined && ngI18nClosureMode
380 │  * ```
381 │  */
382 │ function createClosureModeGuard(): o.BinaryOperatorExpr {
383 ▶   return o
384 ▶     .typeofExpr(o.variable(NG_I18N_CLOSURE_MODE))
385 ▶     .notIdentical(o.literal('undefined', o.STRING_TYPE))
386 ▶     .and(o.variable(NG_I18N_CLOSURE_MODE));
387 │ }
388 │ 
389 │ /**
390 │  * Generates vars with Closure-specific names for i18n blocks (i.e. `MSG_XXX`).
391 │  */
392 │ function i18nGenerateClosureVar(
393 │   pool: ConstantPool,
394 │   messageId: string,
395 │   fileBasedI18nSuffix: string,
396 │   useExternalIds: boolean,
397 │ ): o.ReadVarExpr {
398 │   let name: string;
399 │   const suffix = fileBasedI18nSuffix;
400 ▶   if (useExternalIds) {
401 ▶     const prefix = getTranslationConstPrefix(`EXTERNAL_`);
402 ▶     const uniqueSuffix = pool.uniqueName(suffix);
403 ▶     name = `${prefix}${sanitizeIdentifier(messageId)}$$${uniqueSuffix}`;
404 │   } else {
405 ▶     const prefix = getTranslationConstPrefix(suffix);
406 ▶     name = pool.uniqueName(prefix);
407 │   }
408 │   return o.variable(name);
409 │ }
````

1. **変数を宣言する（355 行目）**

   `var i18n_0;`（ngtsc の出力では `let`）。
2. **if 文を作る（356 行目）**

   条件は 382〜387 行目の `typeof ngI18nClosureMode !== "undefined" && ngI18nClosureMode` です。
3. **真の枝は goog.getMsg（358 行目）、偽の枝は $localize（359〜363 行目）**

   どちらの枝にも同じ `params`（名前 → 印）を渡します。362 行目で `$localize` の側は名前を `START_BOLD_TEXT` の形に、`goog.getMsg` の側（5 節）は `startBoldText` の形にします。
4. **後処理が要れば、最後に代入し直す（367〜368 行目）**

   `i18n_0 = ɵɵi18nPostprocess(i18n_0, …)`。if の外なので、どちらの枝の結果にもかかります。

Closure の側の変数名は 400〜406 行目です。`i18nUseExternalIds` が真（ngtsc の既定）なら 403 行目で `MSG_EXTERNAL_` ＋ メッセージの ID ＋ `$$` ＋ ファイル名から作った接尾辞 ＋ 番号、偽なら 405〜406 行目で `MSG_` ＋ 接尾辞 ＋ 番号（`MSG_DEMO_TS_0`）です。接尾辞は `collectI18nConsts` の最初の行（`fileBasedI18nSuffix`）で、`relativeContextFilePath` の英数字以外を `_` にして大文字にしたものです。403 行目の ID は `message.id`（[第 4 回](04-loc-message-id.md)。`@@` があればその ID）で、外部の翻訳の仕組みが変数名から ID を読めるようにするためのものです。

## 5. $localize の枝：LocalizedString を作る

📄 `angular/packages/compiler/src/render3/view/i18n/localize_utils.ts` L16–37 （▶ の行: 21, 23–24, 31, 34）

```ts
16 │ export function createLocalizeStatements(
17 │   variable: o.ReadVarExpr,
18 │   message: i18n.Message,
19 │   params: {[name: string]: o.Expression},
20 │ ): o.Statement[] {
21 ▶   const {messageParts, placeHolders} = serializeI18nMessageForLocalize(message);
22 │   const sourceSpan = getSourceSpan(message);
23 ▶   const expressions = placeHolders.map((ph) => params[ph.text]);
24 ▶   const localizedString = o.localizedString(
25 │     message,
26 │     messageParts,
27 │     placeHolders,
28 │     expressions,
29 │     sourceSpan,
30 │   );
31 ▶   const variableInitialization = variable.set(localizedString);
32 │   return [
33 │     new o.ExpressionStatement(variableInitialization, null, [
34 ▶       tsIgnoreComment(), // `$localize` might not be available internally.
35 │     ]),
36 │   ];
37 │ }
```

21 行目でメッセージを「文字の部品」と「プレースホルダーの部品」の 2 つの配列にし、23 行目で部品ごとに式（`'�0�'` などの文字列）を表から引き、24〜30 行目で出力 AST の `LocalizedString` を作って、31 行目で変数に代入する文にします。34 行目の `// @ts-ignore` は、`$localize` の型が無い環境でも型エラーにしないためで、1 節の出力の 11 行目に出ています。

📄 `angular/packages/compiler/src/render3/view/i18n/localize_utils.ts` L116–132 （▶ の行: 128–131）

```ts
116 │ /**
117 │  * Serialize an i18n message into two arrays: messageParts and placeholders.
118 │  *
119 │  * These arrays will be used to generate `$localize` tagged template literals.
120 │  *
121 │  * @param message The message to be serialized.
122 │  * @returns an object containing the messageParts and placeholders.
123 │  */
124 │ export function serializeI18nMessageForLocalize(message: i18n.Message): {
125 │   messageParts: o.LiteralPiece[];
126 │   placeHolders: o.PlaceholderPiece[];
127 │ } {
128 ▶   const pieces: o.MessagePiece[] = [];
129 ▶   const serializerVisitor = new LocalizeSerializerVisitor(message.placeholderToMessage, pieces);
130 ▶   message.nodes.forEach((node) => node.visit(serializerVisitor));
131 ▶   return processMessagePieces(pieces);
132 │ }
```

📄 `angular/packages/compiler/src/render3/view/i18n/localize_utils.ts` L44–63 （▶ の行: 50–51, 53, 61）

```ts
44 │ class LocalizeSerializerVisitor implements i18n.Visitor {
45 │   constructor(
46 │     private placeholderToMessage: {[phName: string]: i18n.Message},
47 │     private pieces: o.MessagePiece[],
48 │   ) {}
49 │ 
50 ▶   visitText(text: i18n.Text): any {
51 ▶     if (this.pieces[this.pieces.length - 1] instanceof o.LiteralPiece) {
52 │       // Two literal pieces in a row means that there was some comment node in-between.
53 ▶       this.pieces[this.pieces.length - 1].text += text.value;
54 │     } else {
55 │       const sourceSpan = new ParseSourceSpan(
56 │         text.sourceSpan.fullStart,
57 │         text.sourceSpan.end,
58 │         text.sourceSpan.fullStart,
59 │         text.sourceSpan.details,
60 │       );
61 ▶       this.pieces.push(new o.LiteralPiece(text.value, sourceSpan));
62 │     }
63 │   }
```

📄 `angular/packages/compiler/src/render3/view/i18n/localize_utils.ts` L73–95 （▶ の行: 74, 77–79, 86, 90, 93–94）

```ts
73 │   visitTagPlaceholder(ph: i18n.TagPlaceholder): any {
74 ▶     this.pieces.push(
75 │       this.createPlaceholderPiece(ph.startName, ph.startSourceSpan ?? ph.sourceSpan),
76 │     );
77 ▶     if (!ph.isVoid) {
78 ▶       ph.children.forEach((child) => child.visit(this));
79 ▶       this.pieces.push(
80 │         this.createPlaceholderPiece(ph.closeName, ph.endSourceSpan ?? ph.sourceSpan),
81 │       );
82 │     }
83 │   }
84 │ 
85 │   visitPlaceholder(ph: i18n.Placeholder): any {
86 ▶     this.pieces.push(this.createPlaceholderPiece(ph.name, ph.sourceSpan));
87 │   }
88 │ 
89 │   visitBlockPlaceholder(ph: i18n.BlockPlaceholder): any {
90 ▶     this.pieces.push(
91 │       this.createPlaceholderPiece(ph.startName, ph.startSourceSpan ?? ph.sourceSpan),
92 │     );
93 ▶     ph.children.forEach((child) => child.visit(this));
94 ▶     this.pieces.push(this.createPlaceholderPiece(ph.closeName, ph.endSourceSpan ?? ph.sourceSpan));
95 │   }
```

メッセージの木（[第 2 回](02-loc-markup.md)の `i18n.Message` の `nodes`）を 130 行目で訪問者に渡します。50〜62 行目、文字は文字の部品に。51〜53 行目、文字が 2 つ続いたら（間のコメントが消えた場合）1 つにつなぎます。73〜83 行目、タグは「開きのプレースホルダー → 子 → 閉じのプレースホルダー」と平らに並べ、77 行目、`<br>` のような空要素は開きだけです。86 行目は補間、89〜95 行目は `@if` などのブロックです。木の形はここで消え、**文字とプレースホルダーが交互に並んだ 1 本の列**になります。

📄 `angular/packages/compiler/src/render3/view/i18n/localize_utils.ts` L154–183 （▶ の行: 161, 163, 172, 174, 178, 180）

```ts
154 │ function processMessagePieces(pieces: o.MessagePiece[]): {
155 │   messageParts: o.LiteralPiece[];
156 │   placeHolders: o.PlaceholderPiece[];
157 │ } {
158 │   const messageParts: o.LiteralPiece[] = [];
159 │   const placeHolders: o.PlaceholderPiece[] = [];
160 │ 
161 ▶   if (pieces[0] instanceof o.PlaceholderPiece) {
162 │     // The first piece was a placeholder so we need to add an initial empty message part.
163 ▶     messageParts.push(createEmptyMessagePart(pieces[0].sourceSpan.start));
164 │   }
165 │ 
166 │   for (let i = 0; i < pieces.length; i++) {
167 │     const part = pieces[i];
168 │     if (part instanceof o.LiteralPiece) {
169 │       messageParts.push(part);
170 │     } else {
171 │       placeHolders.push(part);
172 ▶       if (pieces[i - 1] instanceof o.PlaceholderPiece) {
173 │         // There were two placeholders in a row, so we need to add an empty message part.
174 ▶         messageParts.push(createEmptyMessagePart(pieces[i - 1].sourceSpan.end));
175 │       }
176 │     }
177 │   }
178 ▶   if (pieces[pieces.length - 1] instanceof o.PlaceholderPiece) {
179 │     // The last piece was a placeholder so we need to add a final empty message part.
180 ▶     messageParts.push(createEmptyMessagePart(pieces[pieces.length - 1].sourceSpan.end));
181 │   }
182 │   return {messageParts, placeHolders};
183 │ }
```

タグ付きテンプレートは「文字 → 式 → 文字 → … → 文字」と、必ず文字が 1 つ多い形です。161〜164 行目（列がプレースホルダーで始まる）、172〜175 行目（プレースホルダーが 2 つ続く）、178〜181 行目（プレースホルダーで終わる）で、空の文字の部品を足してその形にそろえます。1 節の 12 行目は文字が 1 つだけ、`<b>{{…}}</b>` のような所では `''` の部品が並びます。

## 6. 頭の :meaning|description@@id␟legacy: を組む

`LocalizedString` は出力の段（JIT の emitter や ngtsc の translator）で、部品ごとに文字列にされます。1 つ目の部品の頭がこれです。

📄 `angular/packages/compiler/src/output/output_ast.ts` L751–777 （▶ の行: 760–762, 764–765, 767–769, 772）

```ts
751 │   /**
752 │    * Serialize the given `meta` and `messagePart` into "cooked" and "raw" strings that can be used
753 │    * in a `$localize` tagged string. The format of the metadata is the same as that parsed by
754 │    * `parseI18nMeta()`.
755 │    *
756 │    * @param meta The metadata to serialize
757 │    * @param messagePart The first part of the tagged string
758 │    */
759 │   serializeI18nHead(): CookedRawString {
760 ▶     let metaBlock = this.metaBlock.description || '';
761 ▶     if (this.metaBlock.meaning) {
762 ▶       metaBlock = `${this.metaBlock.meaning}${MEANING_SEPARATOR}${metaBlock}`;
763 │     }
764 ▶     if (this.metaBlock.customId) {
765 ▶       metaBlock = `${metaBlock}${ID_SEPARATOR}${this.metaBlock.customId}`;
766 │     }
767 ▶     if (this.metaBlock.legacyIds) {
768 ▶       this.metaBlock.legacyIds.forEach((legacyId) => {
769 ▶         metaBlock = `${metaBlock}${LEGACY_ID_INDICATOR}${legacyId}`;
770 │       });
771 │     }
772 ▶     return createCookedRawString(
773 │       metaBlock,
774 │       this.messageParts[0].text,
775 │       this.getMessagePartSourceSpan(0),
776 │     );
777 │   }
```

1. **description から始める（760 行目）**

   無ければ空文字。
2. **meaning があれば前に `|` でつなぐ（761〜763 行目）**

   `header|welcome text`。
3. **自分で付けた ID があれば後ろに `@@`（764〜766 行目）**

   `header|welcome text@@welcome`。
4. **legacy ID があれば `␟` で全部つなぐ（767〜771 行目）**

   XLIFF 1.2 用の sha1 と XMB 用の 10 進の 2 つ（どう計算するかは[第 4 回](04-loc-message-id.md)）。`enableI18nLegacyMessageIdFormat` が偽なら `legacyIds` は空で、ここは何も足しません。
5. **1 つ目の部品の文字と合わせる（772〜776 行目）**

   次の関数で、頭が空かどうかで形を変えます。

📄 `angular/packages/compiler/src/output/output_ast.ts` L828–867 （▶ の行: 828–831, 853, 855–856, 861–863）

```ts
828 ▶ const escapeSlashes = (str: string): string => str.replace(/\\/g, '\\\\');
829 ▶ const escapeStartingColon = (str: string): string => str.replace(/^:/, '\\:');
830 ▶ const escapeColons = (str: string): string => str.replace(/:/g, '\\:');
831 ▶ const escapeForTemplateLiteral = (str: string): string =>
832 │   str.replace(/`/g, '\\`').replace(/\${/g, '$\\{');
833 │ 
834 │ /**
835 │  * Creates a `{cooked, raw}` object from the `metaBlock` and `messagePart`.
836 │  *
837 │  * The `raw` text must have various character sequences escaped:
838 │  * * "\" would otherwise indicate that the next character is a control character.
839 │  * * "`" and "${" are template string control sequences that would otherwise prematurely indicate
840 │  *   the end of a message part.
841 │  * * ":" inside a metablock would prematurely indicate the end of the metablock.
842 │  * * ":" at the start of a messagePart with no metablock would erroneously indicate the start of a
843 │  *   metablock.
844 │  *
845 │  * @param metaBlock Any metadata that should be prepended to the string
846 │  * @param messagePart The message part of the string
847 │  */
848 │ function createCookedRawString(
849 │   metaBlock: string,
850 │   messagePart: string,
851 │   range: ParseSourceSpan | null,
852 │ ): CookedRawString {
853 ▶   if (metaBlock === '') {
854 │     return {
855 ▶       cooked: messagePart,
856 ▶       raw: escapeForTemplateLiteral(escapeStartingColon(escapeSlashes(messagePart))),
857 │       range,
858 │     };
859 │   } else {
860 │     return {
861 ▶       cooked: `:${metaBlock}:${messagePart}`,
862 ▶       raw: escapeForTemplateLiteral(
863 ▶         `:${escapeColons(escapeSlashes(metaBlock))}:${escapeSlashes(messagePart)}`,
864 │       ),
865 │       range,
866 │     };
867 │   }
```

853〜858 行目、頭が空なら `:` は付けません。ただし 856 行目、部品が `:` で始まるときは `\:` にします（829 行目）。そうしないと `$localize` が頭と読み違えるからです（読む側は[第 13 回](13-loc-localize-tag.md)の `splitBlock`）。861 行目、頭があれば `:頭:文字`。863 行目、頭の中の `:` は全部 `\:` にします（830 行目）。831〜832 行目、`` ` `` と `${` はテンプレートリテラルを壊すので、raw の側だけエスケープします。2 つ目以降の部品（`:INTERPOLATION:`）は同じクラスの `serializeI18nTemplatePart` が作り、ICU のときだけ `@@` が付きます（[次の回](07-loc-icu-compile.md)）。

## 7. goog.getMsg の枝

📄 `angular/packages/compiler/src/render3/view/i18n/get_msg_utils.ts` L56–92 （▶ の行: 57–59, 63–64, 73–74, 78, 80, 83）

```ts
56 │ ): o.Statement[] {
57 ▶   const messageString = serializeI18nMessageForGetMsg(message);
58 ▶   const args = [o.literal(messageString) as o.Expression];
59 ▶   if (Object.keys(placeholderValues).length) {
60 │     // Message template parameters containing the magic strings replaced by the Angular runtime with
61 │     // real data, e.g. `{'interpolation': '\uFFFD0\uFFFD'}`.
62 │     args.push(
63 ▶       mapLiteral(
64 ▶         formatI18nPlaceholderNamesInMap(placeholderValues, true /* useCamelCase */),
65 │         true /* quoted */,
66 │       ),
67 │     );
68 │ 
69 │     // Message options object, which contains original source code for placeholders (as they are
70 │     // present in a template, e.g.
71 │     // `{original_code: {'interpolation': '{{ name }}', 'startTagSpan': '<span>'}}`.
72 │     args.push(
73 ▶       mapLiteral({
74 ▶         original_code: o.literalMap(
75 │           Object.keys(placeholderValues).map((param) => ({
76 │             key: formatI18nPlaceholderName(param),
77 │             quoted: true,
78 ▶             value: message.placeholders[param]
79 │               ? // Get source span for typical placeholder if it exists.
80 ▶                 o.literal(message.placeholders[param].sourceSpan.toString())
81 │               : // Otherwise must be an ICU expression, get it's source span.
82 │                 o.literal(
83 ▶                   message.placeholderToMessage[param].nodes
84 │                     .map((node) => node.sourceSpan.toString())
85 │                     .join(''),
86 │                 ),
87 │           })),
88 │         ),
89 │       }),
90 │     );
91 │   }
92 │ 
```

📄 `angular/packages/compiler/src/render3/view/i18n/get_msg_utils.ts` L93–110 （▶ の行: 99–101, 105, 107–108）

```ts
 93 │   // /**
 94 │   //  * @desc description of message
 95 │   //  * @meaning meaning of message
 96 │   //  */
 97 │   // const MSG_... = goog.getMsg(..);
 98 │   // I18N_X = MSG_...;
 99 ▶   const googGetMsgStmt = new o.DeclareVarStmt(
100 ▶     closureVar.name,
101 ▶     o.variable('goog').prop('getMsg').callFn(args, null, undefined, [
102 │       tsIgnoreComment(), // `goog` might not be available externally.
103 │     ]),
104 │     o.INFERRED_TYPE,
105 ▶     o.StmtModifier.Final,
106 │   );
107 ▶   googGetMsgStmt.addLeadingComment(i18nMetaToJSDoc(message));
108 ▶   const i18nAssignmentStmt = new o.ExpressionStatement(variable.set(closureVar));
109 │   return [googGetMsgStmt, i18nAssignmentStmt];
110 │ }
```

57 行目、メッセージを 1 本の文字列にします。`$localize` と違い、プレースホルダーは `{$startBoldText}` の形で文字列の中に埋めます（同じファイルの `GetMsgSerializerVisitor`）。59〜67 行目、プレースホルダーがあれば 2 つ目の引数に「名前 → 印」の表（64 行目で `startBoldText` の形に）、72〜90 行目で 3 つ目の引数に `original_code`（テンプレートに書いてあった元の文字列。78〜80 行目は通常の、83〜86 行目は ICU の）を付けます。99〜106 行目で `const MSG_… = goog.getMsg(…)`（105 行目の `Final` が `const`）を作り、107 行目で meaning と description を JSDoc（`@desc`・`@meaning`）として前に付け、108 行目で `i18n_0 = MSG_…` を足します。

## 8. 本番のビルドで Closure の枝はどうなるか

出力には 2 つの枝が両方残ります。どちらが走るかは実行時の `ngI18nClosureMode` で決まります。

📄 `angular/packages/core/src/util/ng_i18n_closure_mode.ts` L13–30 （▶ の行: 14, 20, 25–26, 28）

```ts
13 │ declare global {
14 ▶   const ngI18nClosureMode: boolean;
15 │ }
16 │ 
17 │ /**
18 │  * NOTE: changes to the `ngI18nClosureMode` name must be synced with `compiler-cli/src/tooling.ts`.
19 │  */
20 ▶ if (typeof ngI18nClosureMode === 'undefined') {
21 │   // These property accesses can be ignored because ngI18nClosureMode will be set to false
22 │   // when optimizing code and the whole if statement will be dropped.
23 │   // Make sure to refer to ngI18nClosureMode as ['ngI18nClosureMode'] for closure.
24 │   // NOTE: we need to have it in IIFE so that the tree-shaker is happy.
25 ▶   (function () {
26 ▶     global['ngI18nClosureMode'] =
27 │       // TODO(FW-1250): validate that this actually, you know, works.
28 ▶       typeof goog !== 'undefined' && typeof goog.getMsg === 'function';
29 │   })();
30 │ }
```

@angular/core を読み込んだとき、20 行目で誰も値を決めていなければ、26〜28 行目で「`goog.getMsg` という関数があるか」を入れます。普通のブラウザでは `false` なので、`$localize` の枝が走ります。Angular CLI はさらに、ビルドのときに値を決め打ちします。

📄 `angular-cli/packages/angular/build/src/tools/esbuild/angular/compiler-plugin.ts` L119–128 （▶ の行: 121–122）

```ts
119 │ 
120 │       // Setup defines based on the values used by the Angular compiler-cli
121 ▶       build.initialOptions.define ??= {};
122 ▶       build.initialOptions.define['ngI18nClosureMode'] ??= 'false';
123 │ 
124 │       // The factory is only relevant for compatibility purposes with the private API.
125 │       // TODO: Update private API in the next major to allow compilation function factory removal here.
126 │       const angularCompilationContext =
127 │         compilationContextOrCompilation instanceof AngularCompilationContext
128 │           ? compilationContextOrCompilation
```

122 行目、esbuild の `define` で `ngI18nClosureMode` を `false` に置き換えます。すると 4 節の条件は `typeof false !== "undefined" && false`、つまり常に偽になり、最適化で `goog.getMsg` の枝ごと消えます。コンパイラが片方の枝だけを出す設定は今はなく、それを提案する issue が #43854（開いている）です。

## 9. デモ：設定を変えて consts の関数を見る

> **🧪 DEMO — このページの @angular/compiler 22.1.6 で consts の関数を作る**
>
> 「コンパイルする」を押すと、`loc-compile.ts` の `compileI18nTemplate`（本物の `parseTemplate` → `compileComponentFromMetadata`）で JS を作り、`consts: () => {` の部分だけを切り出します。「i18nUseExternalIds」は 4 節の 400 行目の分岐、「legacy ID」は parseTemplate の `enableI18nLegacyMessageIdFormat`（6 節の 767 行目）に渡ります。出力は JIT の emitter が書いたもので、ngtsc とは違い、タグ付きテンプレートは `$localize(__makeTemplateObject([…], […]), …)` の呼び出しの形、`let` は `var` になり、`goog.getMsg` の前の JSDoc は出ません。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-const-collection)

最初の例で、2 つのチェックを入れたままにすると `MSG_EXTERNAL_welcome$$DEMO_TS_2` と `header|welcome text@@welcome␟3e83…␟6798…` が出ます。両方外すと `MSG_DEMO_TS_2` と `header|welcome text@@welcome` になり、`@@` も meaning も無い `alt` の文は頭そのものが消えます。`MSG_EXTERNAL_` の後ろの数字が、legacy ID の 2 つ目（XMB の 10 進）と同じなのは、どちらも `message.id` だからです。返す配列は `[i18n_2, ['title', i18n_1], ['src', 'a.png', 'alt', i18n_0, 6, 'title']]` で、補間の無い `alt` は 3 節のステップ 2 で静的な属性の値に、補間のある `title` はステップ 3 の組になります（`6` は属性の区切りの印。[consts の章](../compiler/14-compiler-consts-pure.md)）。

## ここまでの呼び出し

- `extractI18nMessages(job)`（57 番） — extract\_i18n\_messages.ts 67 — *入れ物 → I18nMessageOp*
  - `createI18nMessage` → `formatParams` — extract\_i18n\_messages.ts 135・137
- `collectI18nConsts(job)`（58 番） — i18n\_const\_collection.ts
  - `collectMessage` — 125 — *i18n\_N と MSG\_… の変数*
    - `i18nGenerateClosureVar` — 400〜406
    - `getTranslationDeclStmts` — 355〜368 — *var / if / postprocess*
      - `createGoogleGetMsgStatements` — get\_msg\_utils.ts 57・99・108
      - `createLocalizeStatements` → `serializeI18nMessageForLocalize` — localize\_utils.ts 21・130
        - `o.localizedString(…)` — localize\_utils.ts 24
  - `job.addConst(mainVar, statements)` — 129 — *consts の関数の本体と配列へ*
- `LocalizedString.serializeI18nHead` — output\_ast.ts 759 — *emit のとき*

## テストと直し方

### spec とテストケース

| 場所 | 中身 | 件数 |
| --- | --- | --- |
| r3\_view\_compiler\_i18n/localize\_legacy\_message\_ids/（`legacy_enabled`・`legacy_disabled`） | 1 節。legacy ID の有無と `&amp;` などのエスケープ | 2 |
| r3\_view\_compiler\_i18n/element\_attributes/ | 属性の翻訳。TEST\_CASES.json の 1 件は `i18nUseExternalIds: false` で走り、`MSG_` の名前を確かめる | 15 |
| r3\_view\_compiler\_i18n/es5\_support/ | ES5 の出力では `$localize` が `__makeTemplateObject` の呼び出しになる | 1 |
| r3\_view\_compiler\_i18n/namespaces/ | SVG・MathML の中の i18n | 2 |

どれもターゲットは `//packages/compiler-cli/test/compliance/full:full` です。

### 手元で走らせた結果

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/test/compliance/full:full \
  --nocache_test_results --test_output=all \
  "--test_arg=--filter=r3_view_compiler_i18n/(localize_legacy_message_ids|es5_support|element_attributes|namespaces)"
```

📄 `出力（2026-11-03 に実行。抜粋。ログは scratchpad/i18n-logs/b-consts.log）`

```
//packages/compiler-cli/test/compliance/full:full（shard 2）
shard 1: Ran 10 of 607 specs, 10 specs, 0 failures
shard 2: Ran 10 of 607 specs, 10 specs, 0 failures
PASSED in 1.4s（bazel 全体 2.0 秒）
```

- 2 つの shard に 10 本ずつ、合計 20 本（2 + 15 + 1 + 2 と一致）。1.4 秒でした。

### 直すとしたら

- 変数名や 2 つの枝の形：`i18n_const_collection.ts` の `getTranslationDeclStmts`・`i18nGenerateClosureVar`。#43854（片方の枝だけを出す）を手元で試すなら、356〜364 行目の `o.ifStmt` を設定で分ける所が入口で、テストは `localize_legacy_message_ids` の形のケースを足します。ライブラリの部分コンパイル（linker）を通る出力でも両方の枝が要るかを、issue の議論で確かめてからです。
- 頭やエスケープ：`output_ast.ts` の `createCookedRawString`。`legacy_enabled.ts` の `&amp;`・`&quot;` のケースが手本です。
- どれも本家に PR は出さず、手元で spec を足して落ちることを確かめ、issue を読む手がかりにします（[第 20 回](20-loc-issues.md)）。

## 聞かれそうな質問

**Q. consts が配列ではなく関数になるのはなぜですか？**

`$localize` の呼び出しを、配列を作る前に実行する文（`constsInitializers`）が要るからです。i18n\_const\_collection.ts の 129・133 行目で文が足され、文があるとき consts は関数になります（関数にする行は[compiler-entry の章](../compiler/02-compiler-entry.md)の `compileComponentFromMetadata`）。関数は最初にテンプレートを作るときに 1 回だけ呼ばれるので、翻訳もそのとき 1 回だけ決まります（[第 14 回](14-loc-runtime-translations.md)）。

**Q. goog.getMsg の枝は本番のバンドルに残りますか？**

Angular CLI のビルドでは残りません。compiler-plugin.ts の 122 行目で `ngI18nClosureMode` を `false` に置き換えるので、条件が常に偽になり、最適化で消えます。CLI を通さないビルドでは、core の ng\_i18n\_closure\_mode.ts 26〜28 行目が実行時に `goog.getMsg` の有無で決めます。

**Q. MSG\_EXTERNAL\_ の後ろの数字は何ですか？**

メッセージの `id` です（i18n\_const\_collection.ts 403 行目）。`@@welcome` を付ければ `MSG_EXTERNAL_welcome$$…` になります。`i18nUseExternalIds` を `false` にすると ID は入らず、`MSG_ファイル名_番号`（405〜406 行目）です。

**Q. $localize の頭の ␟ の後ろの 2 つの値は？**

legacy ID です。output\_ast.ts の 767〜771 行目が `legacyIds` を全部 `␟` でつなぎます。`enableI18nLegacyMessageIdFormat` を `false` にすると空になり、何も付きません（Angular CLI の新しいプロジェクトの tsconfig は `false`。[第 8 回](08-loc-compiler-options.md)）。

**Q. 補間のある属性と無い属性で、出力はどう違いますか？**

無い属性は、翻訳した変数がそのまま静的な属性の値になります（i18n\_const\_collection.ts 140〜144 行目、1 節の `["title", $i18n_0$]`）。ある属性は `ɵɵi18nAttributes` の設定の配列に入り（183〜193 行目）、update で `ɵɵi18nExp` と `ɵɵi18nApply` が呼ばれます（1 節の 124〜125 行目）。

## 読み終えて

- 入れ物 1 つにつきメッセージの op が 1 つでき、ルートのメッセージは consts の配列に、属性のメッセージは属性の値か `ɵɵi18nAttributes` の設定に入る。
- メッセージ 1 つは `var i18n_N; if (ngI18nClosureMode) { goog.getMsg } else { $localize }` と、必要なら後処理の代入。consts は関数になる。
- `$localize` の頭は description → `meaning|` → `@@id` → `␟legacy` の順に組まれ、`:` と `` ` `` と `${` はエスケープされる。
- `i18nUseExternalIds` が変えるのは Closure の側の変数名だけ。Angular CLI のビルドでは Closure の枝は消える。

---

← 前: [コンパイラの i18n の段：文脈を作り、プレースホルダーを解決する](05-loc-pipeline-phases.md)  
次: [ICU をコンパイルする：plural と select](07-loc-icu-compile.md) →
