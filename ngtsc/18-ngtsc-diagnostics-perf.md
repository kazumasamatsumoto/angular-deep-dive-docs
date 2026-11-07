[目次](../README.md) › [ngtsc の内側](README.md) › 第 18 回 / 全 20 回

# 診断と性能の記録：FatalDiagnosticError・ErrorCode・PerfRecorder

> handler が投げる FatalDiagnosticError と、投げずに返す makeDiagnostic・makeRelatedInformation、ErrorCode の数が NG の番号（-99 を前に付けた TypeScript の診断の code）になる行と、ErrorCode の負の値を印にしてエラーの説明のページの URL を足す行（配布物 22.1.6 では URL が next を指していた）。PerfPhase・PerfEvent・PerfCheckpoint と ActivePerfRecorder、tracePerformance の設定で JSON に書き出す方法。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-diagnostics-perf)

---

ngtsc のエラーは、最後はすべて TypeScript と同じ `ts.Diagnostic` になります。handler は解析の途中で `FatalDiagnosticError` を投げるか、`makeDiagnostic` で作った診断を返し、`ErrorCode` の数は `ngErrorCode` で「-99 を前に付けた負の数」にされ、表示のときに `TS-99…` が `NG…` に置き換わります。この章ではその道を 1 つずつ読み、後半で、コンパイラが段ごとの時間と事件の数を数える `ActivePerfRecorder` と、それを JSON に書き出す `tracePerformance` の設定を読みます。

読む対象は `packages/compiler-cli/src/ngtsc/diagnostics/src/` の `error.ts`（126 行）・`util.ts`（85 行）・`error_details_base_url.ts`（28 行）・`error_code.ts` の先頭、`ngtsc/perf/src/` の `api.ts`・`recorder.ts`・`noop.ts`・`clock.ts`、`program.ts` と `perform_compile.ts` の数行です。テンプレートの型チェックの診断（NG8xxx）の作り方は [typecheck-oob](../typecheck/17-typecheck-oob.md)、位置をテンプレートに戻す仕組みは [typecheck-diagnostics-mapping](../typecheck/16-typecheck-diagnostics-mapping.md) で読んだので繰り返しません。

1. [1. 全体像](01-ngtsc-overview.md)
2. [2. NgtscProgram](02-ngtsc-program.md)
3. [3. NgCompiler とチケット](03-ngtsc-compiler-ticket.md)
4. [4. リフレクション](04-ngtsc-reflection.md)
5. [5. 静的な評価](05-ngtsc-partial-evaluator.md)
6. [6. 参照と import](06-ngtsc-references-imports.md)
7. [7. 解析](07-ngtsc-trait-analyze.md)
8. [8. 解決と出力](08-ngtsc-trait-resolve-compile.md)
9. [9. @Directive の handler](09-ngtsc-directive-handler.md)
10. [10. メタデータの登録](10-ngtsc-metadata-registry.md)
11. [11. .d.ts を読む](11-ngtsc-dts-metadata.md)
12. [12. JS の書き換え](12-ngtsc-ivy-transform.md)
13. [13. .d.ts の書き換え](13-ngtsc-dts-transform.md)
14. [14. 差分ビルド](14-ngtsc-incremental.md)
15. [15. 意味のグラフ](15-ngtsc-semantic-graph.md)
16. [16. import の循環](16-ngtsc-cycles.md)
17. [17. HMR](17-ngtsc-hmr.md)
18. **18. 診断と性能**（この章）
19. [19. テストを書く](19-ngtsc-test-env.md)
20. [20. issue と PR を読む](20-ngtsc-issues.md)

## 0. 診断の一生

1. **handler が見つける**

   デコレーターの引数を読んでいて「これは受け付けられない」と分かった所で、`FatalDiagnosticError` を投げるか（1 節）、`makeDiagnostic` の診断を解析の結果に入れて返します（2 節）。
2. **TraitCompiler が受け止める**

   投げられたものは `analyzeTrait` が `toDiagnostic()` で `ts.Diagnostic` にして trait に記録します（1 節）。
3. **番号は -99 を前に付けた数**

   `makeDiagnostic` が `code: ngErrorCode(code)` と書き、`DECORATOR_ARG_NOT_LITERAL`（1001）は `-991001` になります（3 節）。
4. **説明のページがある番号には URL を足す**

   `NgCompiler` が診断を返す前に `addMessageTextDetails` を通し、`ErrorCode` が負の値の番号にだけ「Find more at …/NG1001」を足します（4 節）。
5. **表示で NG に直す**

   `formatDiagnostics` が TypeScript の書式で文字にしてから、`TS-99` を `NG` に置き換えます（5 節）。

## 1. FatalDiagnosticError：投げて、TraitCompiler が受け止める

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/error.ts` L14–46 （▶ の行: 16–19, 21–22, 31, 36, 41, 43–44）

```ts
14 │ export class FatalDiagnosticError extends Error {
15 │   constructor(
16 ▶     readonly code: ErrorCode,
17 ▶     readonly node: ts.Node,
18 ▶     readonly diagnosticMessage: string | ts.DiagnosticMessageChain,
19 ▶     readonly relatedInformation?: ts.DiagnosticRelatedInformation[],
20 │   ) {
21 ▶     super(
22 ▶       `FatalDiagnosticError: Code: ${code}, Message: ${ts.flattenDiagnosticMessageText(
23 │         diagnosticMessage,
24 │         '\n',
25 │       )}`,
26 │     );
27 │ 
28 │     // Extending `Error` ends up breaking some internal tests. This appears to be a known issue
29 │     // when extending errors in TS and the workaround is to explicitly set the prototype.
30 │     // https://stackoverflow.com/questions/41102060/typescript-extending-error-class
31 ▶     Object.setPrototypeOf(this, new.target.prototype);
32 │   }
33 │ 
34 │   // Trying to hide `.message` from `Error` to encourage users to look
35 │   // at `diagnosticMessage` instead.
36 ▶   declare message: never;
37 │ 
38 │   /**
39 │    * @internal
40 │    */
41 ▶   _isFatalDiagnosticError = true;
42 │ 
43 ▶   toDiagnostic(): ts.DiagnosticWithLocation {
44 ▶     return makeDiagnostic(this.code, this.node, this.diagnosticMessage, this.relatedInformation);
45 │   }
46 │ }
```

- 16〜19 行目：持つのは 4 つ。`ErrorCode`、エラーを付ける TypeScript のノード、メッセージ（文字列か、入れ子の `ts.DiagnosticMessageChain`）、関連情報（「ここで宣言されている」など、別の場所を指す補足）です。
- 21〜26 行目：`Error` としての `message` には、番号とメッセージを平らにした文字列を入れます。スタックトレースに出るのはこれです。
- 31 行目：28〜30 行目のコメントのとおり、`Error` を継承すると壊れる内部のテストがあったための回避で、プロトタイプを明示して付け直します。
- 36 行目：`declare message: never` で、`.message` を読む書き方を型の上で禁じ、`diagnosticMessage` を読ませます。
- 41 行目と 111〜113 行目（次の引用）：`isFatalDiagnosticError` は `instanceof` ではなく、この印のプロパティを見ます。`NgCompiler.getDiagnostics` の `catch` はこちらを使い、下の `analyzeTrait` は `instanceof` を使っています。
- 43〜45 行目：`toDiagnostic()` は 2 節の `makeDiagnostic` を呼ぶだけです。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L466–472 （▶ の行: 467–469, 471）

```ts
466 │     } catch (err) {
467 ▶       if (err instanceof FatalDiagnosticError) {
468 ▶         trait.toAnalyzed(null, [err.toDiagnostic()], null);
469 ▶         return;
470 │       } else {
471 ▶         throw err;
472 │       }
```

投げられた `FatalDiagnosticError` を受け止めるのは `TraitCompiler.analyzeTrait` です（前後は [compiler-entry](../compiler/02-compiler-entry.md) の 2 節と [第 7 回](07-ngtsc-trait-analyze.md)）。468 行目で、解析の結果を `null`、診断を 1 つだけ持つ trait にして 469 行目で戻ります。**解析の結果が残らない**ので、そのクラスはあとの段（解決・出力・型チェック）で「無いもの」として扱われます。`FatalDiagnosticError` 以外の例外は 471 行目で投げ直され、コンパイラ全体が落ちます。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/directive/src/shared.ts` L2058–2067 （▶ の行: 2059–2063）

```ts
2058 │   let bindings: ParsedHostBindings;
2059 ▶   try {
2060 ▶     bindings = parseHostBindings(hostMetadata);
2061 ▶   } catch (e) {
2062 ▶     throw new FatalDiagnosticError(
2063 ▶       ErrorCode.HOST_BINDING_PARSE_ERROR,
2064 │       hostExpr,
2065 │       (e as Error).message,
2066 │     );
2067 │   }
```

2026-06-23 の 8b2785b597c（fixes #69106）は、この「普通の `Error` が漏れてコンパイラが落ちる」の直しです。`@angular/compiler` の `parseHostBindings` は、壊れた `host`（値が文字列でないプロパティのバインディングなど）に普通の `Error` を投げます。言語サービス（エディターの補完）で書きかけのコードを解析すると、これで落ちていました。2059〜2066 行目で包んで、`HOST_BINDING_PARSE_ERROR` の `FatalDiagnosticError` に変えています。足した spec は ngtsc\_spec.ts の `should report a diagnostic instead of crashing when a host property binding has a non-static value` です。

## 2. makeDiagnostic と、投げずに返す診断

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/error.ts` L48–77 （▶ の行: 53, 55, 58–63, 72–73, 75）

```ts
48 │ export function makeDiagnostic(
49 │   code: ErrorCode,
50 │   node: ts.Node,
51 │   messageText: string | ts.DiagnosticMessageChain,
52 │   relatedInformation?: ts.DiagnosticRelatedInformation[],
53 ▶   category: ts.DiagnosticCategory = ts.DiagnosticCategory.Error,
54 │ ): ts.DiagnosticWithLocation {
55 ▶   node = ts.getOriginalNode(node);
56 │   return {
57 │     category,
58 ▶     code: ngErrorCode(code),
59 ▶     file: ts.getOriginalNode(node).getSourceFile(),
60 ▶     start: node.getStart(undefined, false),
61 ▶     length: node.getWidth(),
62 ▶     messageText,
63 ▶     relatedInformation,
64 │   };
65 │ }
66 │ 
67 │ export function makeDiagnosticChain(
68 │   messageText: string,
69 │   next?: ts.DiagnosticMessageChain[],
70 │ ): ts.DiagnosticMessageChain {
71 │   return {
72 ▶     category: ts.DiagnosticCategory.Message,
73 ▶     code: 0,
74 │     messageText,
75 ▶     next,
76 │   };
77 │ }
```

- 53 行目：分類の既定は `Error`。警告を作るときは 5 つめに `Warning` を渡します。
- 55・59 行目：変換の途中で作り直されたノードでも、元のファイルの元の位置を指すように `ts.getOriginalNode` で戻します。
- 58 行目：`code` は `ErrorCode` のままではなく、3 節の `ngErrorCode` を通した数です。
- 60〜61 行目：`getStart(undefined, false)` の 2 つめの `false` は「前にある JSDoc を含めない」です。エディターの赤い波線は、ノードの最初の文字からノードの幅だけ引かれます。
- 67〜77 行目：`makeDiagnosticChain` は、入れ子のメッセージの 1 段を作ります。72〜73 行目のとおり分類は `Message`、番号は 0 で、番号を持つのは一番外の診断だけです。

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/error.ts` L79–113 （▶ の行: 83, 87–89, 98–99, 102–103, 105, 112）

```ts
 79 │ export function makeRelatedInformation(
 80 │   node: ts.Node,
 81 │   messageText: string,
 82 │ ): ts.DiagnosticRelatedInformation {
 83 ▶   node = ts.getOriginalNode(node);
 84 │   return {
 85 │     category: ts.DiagnosticCategory.Message,
 86 │     code: 0,
 87 ▶     file: node.getSourceFile(),
 88 ▶     start: node.getStart(),
 89 ▶     length: node.getWidth(),
 90 │     messageText,
 91 │   };
 92 │ }
 93 │ 
 94 │ export function addDiagnosticChain(
 95 │   messageText: string | ts.DiagnosticMessageChain,
 96 │   add: ts.DiagnosticMessageChain[],
 97 │ ): ts.DiagnosticMessageChain {
 98 ▶   if (typeof messageText === 'string') {
 99 ▶     return makeDiagnosticChain(messageText, add);
100 │   }
101 │ 
102 ▶   if (messageText.next === undefined) {
103 ▶     messageText.next = add;
104 │   } else {
105 ▶     messageText.next.push(...add);
106 │   }
107 │ 
108 │   return messageText;
109 │ }
110 │ 
111 │ export function isFatalDiagnosticError(err: any): err is FatalDiagnosticError {
112 ▶   return err._isFatalDiagnosticError === true;
113 │ }
```

`makeRelatedInformation`（79〜92 行目）は位置とメッセージだけの補足で、番号は 0 です。`addDiagnosticChain`（94〜109 行目）は、すでにあるメッセージの下に段を足します。98〜99 行目、文字列なら新しい段を作り、102〜106 行目、段なら `next` に足します。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/directive/src/shared.ts` L391–397 （▶ の行: 391–393）

```ts
391 ▶       diagnostics = [
392 ▶         makeDiagnostic(
393 ▶           ErrorCode.NON_STANDALONE_NOT_ALLOWED,
394 │           expr,
395 │           `Only standalone components/directives are allowed when 'strictStandalone' is enabled.`,
396 │         ),
397 │       ];
```

投げずに返す例が、2026-08-19 の 74b294cd51b です。`strictStandalone` のときに `standalone: false` を見つけたら、以前は `FatalDiagnosticError` を投げていました。それだと 1 節の 468 行目でクラスの解析の結果が消え、そのコンポーネントを使う側にまで別のエラーが連鎖します。今は 391〜397 行目で診断を配列に入れ、解析の結果と一緒に返します（`diagnostics: directiveResult.diagnostics` を handler に 1 行ずつ足した）。**投げるか返すか**は、「この先の段を続けられるか」で決まります。

## 3. ErrorCode と ngErrorCode：-99 を前に付ける

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/error_code.ts` L9–16 （▶ の行: 10, 12–14）

```ts
 9 │ /**
10 ▶  * @publicApi
11 │  */
12 ▶ export enum ErrorCode {
13 ▶   DECORATOR_ARG_NOT_LITERAL = -1001,
14 ▶   DECORATOR_ARITY_WRONG = 1002,
15 │   DECORATOR_NOT_CALLED = 1003,
16 │   DECORATOR_UNEXPECTED = 1005,
```

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/error_code.ts` L66–69 （▶ の行: 68–69）

```ts
66 │   COMPONENT_MISSING_TEMPLATE = 2001,
67 │   PIPE_MISSING_NAME = 2002,
68 ▶   PARAM_MISSING_TOKEN = -2003,
69 ▶   DIRECTIVE_MISSING_SELECTOR = 2004,
```

`ErrorCode` は 10 行目のとおり `@publicApi` です（番号は公開の約束で、`goldens/public-api/compiler-cli/error_code.api.md` で見張られています）。13 行目の `-1001` と 68 行目の `-2003` の**負の値**は、「angular.dev に説明のページがある」の印です（4 節）。14 行目の 1002 や 69 行目の 2004 のような正の値はページがありません。手元の木では負の値は 10 個でした（`grep -c '= -'`）。main（2026-11-03）では `CONTROL_FLOW_PREVENTING_CONTENT_PROJECTION`（8011）も負の値に変わり、11 個です（`git diff HEAD origin/main`）。

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/util.ts` L31–34 （▶ の行: 32–33）

```ts
31 │ export function ngErrorCode(code: ErrorCode): number {
32 ▶   const absoluteCode = Math.abs(code);
33 ▶   return -(ERROR_CODE_MARKER * 10 ** decimalDigits(absoluteCode) + absoluteCode);
34 │ }
```

32 行目で絶対値をとるので、印の負号は番号に影響しません。33 行目は `-(99 × 10^桁数 + 番号)` で、1001 は 4 桁なので `-(990000 + 1001) = -991001` です。TypeScript 自身の診断の番号は正の数なので、負の数で、しかも先頭が 99 なら Angular の番号だと見分けられます。この関数の全体と、型チェックの番号（8xxx）での使われ方は [typecheck-oob](../typecheck/17-typecheck-oob.md) の 3 節で読みました。

> [!NOTE]
> **さらに深く**
>
> 2026-08-17 の 45ebb127e32 より前の `ngErrorCode` は `parseInt('-99' + code)` でした。文字をつなぐので、負の値の `ErrorCode` を渡すと `'-99-1001'` になり、`parseInt` は `-99` を返します。負の値を印に使うために、32 行目の `Math.abs` の形に書き換えられました。

## 4. 説明のページの URL を足す

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L676–697 （▶ の行: 679, 681–682, 684–685, 688, 695）

```ts
676 │   /**
677 │    * Add https://angular.dev/errors error guide links to diagnostics for this compilation.
678 │    */
679 ▶   private addMessageTextDetails(diagnostics: ts.Diagnostic[]): ts.Diagnostic[] {
680 │     return diagnostics.map((diag) => {
681 ▶       const errorCode = errorCodeWithGuideFromDiagnosticCode(diag.code);
682 ▶       if (errorCode !== null) {
683 │         const messageText =
684 ▶           typeof diag.messageText === 'string'
685 ▶             ? addDiagnosticDetails(errorCode, diag.messageText)
686 │             : {
687 │                 ...diag.messageText,
688 ▶                 messageText: addDiagnosticDetails(errorCode, diag.messageText.messageText),
689 │               };
690 │         return {
691 │           ...diag,
692 │           messageText,
693 │         };
694 │       }
695 ▶       return diag;
696 │     });
697 │   }
```

`NgCompiler` の `getDiagnostics`・`getDiagnosticsForFile`・`getDiagnosticsForComponent` は、どれも最後に `addMessageTextDetails` を通して返します。681 行目で診断の番号から「ページのある `ErrorCode`」を引き、あれば 684〜689 行目でメッセージに URL を足します。入れ子のメッセージなら 688 行目、一番外の段の文字だけに足します。

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/util.ts` L46–52 （▶ の行: 50–51）

```ts
46 │   if (absoluteErrorCode === null) {
47 │     return null;
48 │   }
49 │ 
50 ▶   const codeWithGuide = -absoluteErrorCode;
51 ▶   return ErrorCode[codeWithGuide] !== undefined ? codeWithGuide : null;
52 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/util.ts` L71–85 （▶ の行: 72, 74–75, 77, 79–80）

```ts
71 │ function absoluteErrorCodeFromDiagnosticCode(code: number): number | null {
72 ▶   if (code >= 0) return null;
73 │ 
74 ▶   const diagnosticCode = Math.abs(code);
75 ▶   const markerMultiplier = 10 ** (decimalDigits(diagnosticCode) - ERROR_CODE_MARKER_DIGITS);
76 │ 
77 ▶   if (markerMultiplier <= 1) return null;
78 │ 
79 ▶   const marker = Math.trunc(diagnosticCode / markerMultiplier);
80 ▶   return marker === ERROR_CODE_MARKER ? diagnosticCode % markerMultiplier : null;
81 │ }
82 │ 
83 │ function decimalDigits(value: number): number {
84 │   return String(value).length;
85 │ }
```

1. **72 行目：正の数なら null**

   TypeScript 自身の診断は 4 節の対象外です。
2. **74〜75 行目：先頭 2 桁を取り出す割る数**

   `-991001` なら 6 桁なので `10^(6-2) = 10000`。
3. **79〜80 行目：先頭が 99 なら残りが番号**

   `trunc(991001 / 10000) = 99` なので `991001 % 10000 = 1001`。
4. **50〜51 行目：負の値の ErrorCode があるか**

   `ErrorCode[-1001]` は TypeScript の数の enum の逆引きで `'DECORATOR_ARG_NOT_LITERAL'` を返すので `-1001` を返します。2004 なら `ErrorCode[-2004]` が無いので `null`。

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/util.ts` L54–69 （▶ の行: 58–59, 63, 67–68）

```ts
54 │ /**
55 │  * Appends a "Find more at <url>" guide link to the message text of a diagnostic.
56 │  */
57 │ export function addDiagnosticDetails(code: ErrorCode, messageText: string): string {
58 ▶   const details = `Find more at ${ERROR_DETAILS_PAGE_BASE_URL}/${formatCompilerErrorCode(code)}`;
59 ▶   return appendMessageText(messageText, details);
60 │ }
61 │ 
62 │ function appendMessageText(messageText: string, textToAppend: string): string {
63 ▶   if (messageText === '') {
64 │     return textToAppend;
65 │   }
66 │ 
67 ▶   const separator = messageText.match(/[.,;!?\n]$/) ? ' ' : '. ';
68 ▶   return `${messageText}${separator}${textToAppend}`;
69 │ }
```

58 行目の `formatCompilerErrorCode` は `NG${Math.abs(code)}` なので、`-1001` から `NG1001` を作ります。67 行目、メッセージが句読点で終わっていれば空白 1 つ、そうでなければ `". "` でつなぎます。

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/error_details_base_url.ts` L11–28 （▶ の行: 13–16, 27）

```ts
11 │ export const DOC_PAGE_BASE_URL: string = (() => {
12 │   const full = VERSION.full;
13 ▶   const isPreRelease =
14 ▶     full.includes('-next') || full.includes('-rc') || full === '0.0.0' + '-PLACEHOLDER';
15 ▶   const prefix = isPreRelease ? 'next' : `v${VERSION.major}`;
16 ▶   return `https://${prefix}.angular.dev`;
17 │ })();
18 │ 
19 │ /**
20 │  * Base URL for the error details page.
21 │  *
22 │  * Keep the files below in full sync:
23 │  *  - packages/compiler-cli/src/ngtsc/diagnostics/src/error_details_base_url.ts
24 │  *  - packages/core/src/error_details_base_url.ts
25 │  */
26 │ export const ERROR_DETAILS_PAGE_BASE_URL: string = (() => {
27 ▶   return `${DOC_PAGE_BASE_URL}/errors`;
28 │ })();
```

URL の前半は版で変わります。13〜14 行目で `-next`・`-rc`・開発中の `0.0.0-PLACEHOLDER` なら `next.angular.dev`、そうでなければ 15 行目で `v22.angular.dev` のような版の付いた場所です（2026-01 の 0aaadafc507、issue #44650「エラーのリンクを今の版の文書に」）。14 行目の `'0.0.0' + '-PLACEHOLDER'` と 2 つに分けた書き方は、リリースのときに `0.0.0-PLACEHOLDER` という文字列が版の番号に置き換えられるのを避けるためです（core の同じファイルにはそのコメントがあります）。

> [!WARNING]
> **ハマりどころ**
>
> このサイトに入っている配布物 22.1.6 では、この書き分けが効いていませんでした。`node_modules/@angular/compiler-cli/bundles/chunk-NPM4D5UO.js` の該当の行は次のとおりで、`full === "22.1.6"` は 22.1.6 では常に真です。そのため 22.1.6 のエラーのリンクは `v22.angular.dev` ではなく `next.angular.dev` を指します（6 節の DEMO の「Find more at https://next.angular.dev/errors/NG1001」がその結果）。

📄 `node_modules/@angular/compiler-cli/bundles/chunk-NPM4D5UO.js 145〜150 行目（配布物 22.1.6。repo の外なので文字列で表示）`

```
var DOC_PAGE_BASE_URL = (() => {
  const full = VERSION.full;
  const isPreRelease = full.includes("-next") || full.includes("-rc") || full === "22.1.6";
  const prefix = isPreRelease ? "next" : `v${VERSION.major}`;
  return `https://${prefix}.angular.dev`;
})();
```

配布物を作るバンドラーが `'0.0.0' + '-PLACEHOLDER'` を 1 つの文字列にまとめ、そのあとでリリースの置き換えが当たった形です。同じ配布物の `@angular/core` の `fesm2022/_pending_tasks-chunk.mjs` では 2 つに分かれたまま残っていて、正しく `v22` になります。main の `error_details_base_url.ts`（2026-11-05 に `gh api` で取得）も同じ書き方で、gh の検索で同じ issue は見つかりませんでした。issue を読む・書く前に、配布物の行と、`formatDiagnostics` の出力の URL で確かめるところまでにします。

## 5. 表示：TS-99 を NG に

📄 `angular/packages/compiler-cli/src/perform_compile.ts` L32–45 （▶ の行: 38–39）

```ts
32 │ export function formatDiagnostics(
33 │   diags: ReadonlyArray<ts.Diagnostic>,
34 │   host: ts.FormatDiagnosticsHost = defaultFormatHost,
35 │ ): string {
36 │   if (diags && diags.length) {
37 │     return diags
38 ▶       .map((diagnostic) =>
39 ▶         replaceTsWithNgInErrors(ts.formatDiagnosticsWithColorAndContext([diagnostic], host)),
40 │       )
41 │       .join('');
42 │   } else {
43 │     return '';
44 │   }
45 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/src/util.ts` L12–14 （▶ の行: 12）

```ts
12 ▶ const ERROR_CODE_MATCHER = /(\u001b\[\d+m ?)TS-99(\d+: ?\u001b\[\d+m)/g;
13 │ 
14 │ const ERROR_CODE_MARKER = 99;
```

`ngc` の出力は、39 行目で TypeScript の `formatDiagnosticsWithColorAndContext`（色と前後の行つき）に書かせ、それを `replaceTsWithNgInErrors` に通します。12 行目の正規表現は `TS-99` の前後に色の制御文字（`\u001b[…m`）があることを前提にしています。色を付けない `ts.formatDiagnostics` を使う道具では置き換えが当たらず、`error TS-991001:` のまま見えます（6 節の DEMO の「色なしの書式」）。置き換えの全体は [typecheck-diagnostics-mapping](../typecheck/16-typecheck-diagnostics-mapping.md) の 8 節です。

## 6. DEMO：わざと壊した入力の診断

> **🧪 記録の再生：6 つの場面の診断**
>
> これは記録です。@angular/compiler-cli 22.1.6（TypeScript 6.0.3、Node v24.22.1）の `NgtscProgram` を Node で動かし、`getTsSyntacticDiagnostics`・`getTsSemanticDiagnostics`・`getNgStructuralDiagnostics`・`getNgSemanticDiagnostics` の順に集めた結果です。1 つの場面ごとに別のディレクトリで 1 回コンパイルしました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-diagnostics-perf)

- **NG1001・NG2003 にだけ URL**が付きます。3 節の負の値の 2 つです。NG2003 は入れ子のメッセージなので、4 節の 688 行目のとおり一番外の段にだけ付き、その後ろに `next` の「Consider using the @Inject decorator…」が続きます。
- NG2003 は `strictInjectionParameters: true` のときだけ出ます。付けないと、同じ入力はエラーにならず、ɵfac が `i0.ɵɵinvalidFactory()` を呼ぶ形で出力され、実行時に作ろうとしたときに例外になります（ngtsc\_spec.ts の `with strictInjectionParameters = false` の describe が、この文字列を確かめています）。
- NG1010（imports に評価できない値）は、入れ子のメッセージ（「Value could not be determined statically.」）と、関連情報 2 つ（評価が止まった場所と、関数の宣言）を持ちます。関連情報は第 5 回の静的な評価が残した理由（`DynamicValue`）から作られます（[第 5 回](05-ngtsc-partial-evaluator.md)）。
- NG3004（export していないクラス）は、別のファイルから参照を作ろうとして失敗したときのもので、関連情報が宣言の場所を指します（[第 6 回](06-ngtsc-references-imports.md)）。

## 7. 性能の記録：PerfPhase・PerfEvent・PerfCheckpoint

`perf/src/api.ts` の 3 つの enum が、数える物の名前です。`PerfPhase`（段。手元の木で 32 個）は「今どの段にいるか」で時間を割り振る先、`PerfEvent`（事件。19 個）は数える出来事、`PerfCheckpoint`（点。9 個）はメモリを測る場所です。どれも最後に `LAST` があり、配列の長さに使います。main では `PerfPhase` に言語サービスの `LsSmartSelection` が 1 つ足されています。

📄 `angular/packages/compiler-cli/src/ngtsc/perf/src/api.ts` L392–416 （▶ の行: 392, 400, 405, 410, 416）

```ts
392 ▶   phase(phase: PerfPhase): PerfPhase;
393 │ 
394 │   /**
395 │    * Run `fn` in the given `PerfPhase` and return the result.
396 │    *
397 │    * Enters `phase` before executing the given `fn`, then exits the phase and returns the result.
398 │    * Prefer this API to `phase()` where possible.
399 │    */
400 ▶   inPhase<T>(phase: PerfPhase, fn: () => T): T;
401 │ 
402 │   /**
403 │    * Record the memory usage of the compiler at the given checkpoint.
404 │    */
405 ▶   memory(after: PerfCheckpoint): void;
406 │ 
407 │   /**
408 │    * Record that a specific event has occurred, possibly more than once.
409 │    */
410 ▶   eventCount(event: PerfEvent, incrementBy?: number): void;
411 │ 
412 │   /**
413 │    * Return the `PerfRecorder` to an empty state (clear all tracked statistics) and reset the zero
414 │    * point to the current time.
415 │    */
416 ▶   reset(): void;
```

📄 `angular/packages/compiler-cli/src/ngtsc/perf/src/recorder.ts` L25–48 （▶ の行: 26–28, 30, 36–37, 42–44, 47）

```ts
25 │ export class ActivePerfRecorder implements PerfRecorder {
26 ▶   private counters: number[];
27 ▶   private phaseTime: number[];
28 ▶   private bytes: number[];
29 │ 
30 ▶   private currentPhase = PerfPhase.Unaccounted;
31 │   private currentPhaseEntered: HrTime;
32 │ 
33 │   /**
34 │    * Creates an `ActivePerfRecorder` with its zero point set to the current time.
35 │    */
36 ▶   static zeroedToNow(): ActivePerfRecorder {
37 ▶     return new ActivePerfRecorder(mark());
38 │   }
39 │ 
40 │   private constructor(private zeroTime: HrTime) {
41 │     this.currentPhaseEntered = this.zeroTime;
42 ▶     this.counters = Array(PerfEvent.LAST).fill(0);
43 ▶     this.phaseTime = Array(PerfPhase.LAST).fill(0);
44 ▶     this.bytes = Array(PerfCheckpoint.LAST).fill(0);
45 │ 
46 │     // Take an initial memory snapshot before any other compilation work begins.
47 ▶     this.memory(PerfCheckpoint.Initial);
48 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/perf/src/recorder.ts` L59–82 （▶ の行: 60, 64–67, 72, 74, 76, 81）

```ts
59 │   memory(after: PerfCheckpoint): void {
60 ▶     this.bytes[after] = process.memoryUsage().heapUsed;
61 │   }
62 │ 
63 │   phase(phase: PerfPhase): PerfPhase {
64 ▶     const previous = this.currentPhase;
65 ▶     this.phaseTime[this.currentPhase] += timeSinceInMicros(this.currentPhaseEntered);
66 ▶     this.currentPhase = phase;
67 ▶     this.currentPhaseEntered = mark();
68 │     return previous;
69 │   }
70 │ 
71 │   inPhase<T>(phase: PerfPhase, fn: () => T): T {
72 ▶     const previousPhase = this.phase(phase);
73 │     try {
74 ▶       return fn();
75 │     } finally {
76 ▶       this.phase(previousPhase);
77 │     }
78 │   }
79 │ 
80 │   eventCount(counter: PerfEvent, incrementBy: number = 1): void {
81 ▶     this.counters[counter] += incrementBy;
82 │   }
```

1. **36〜38 行目：今の時刻を 0 にして作る**

   `mark()` は `process.hrtime()`（下の clock.ts）。42〜44 行目で、3 つの enum の `LAST` の長さの配列を 0 で埋め、47 行目で最初のメモリを測ります。
2. **63〜69 行目：段を切り替える**

   65 行目で、*今までいた段*に、その段に入ってからの時間（マイクロ秒）を足し、66〜67 行目で新しい段と入った時刻を覚えます。段は入れ子にならず、いつもどれか 1 つの段にいます。
3. **71〜78 行目：inPhase**

   段に入り、関数を走らせ、`finally` で前の段に戻します。例外が出ても時間の割り振りが崩れません。
4. **60・81 行目：メモリと事件**

   メモリは `heapUsed`（V8 のヒープの使用量）を上書きで、事件は足し算で記録します。

📄 `angular/packages/compiler-cli/src/ngtsc/perf/src/clock.ts` L12–21 （▶ の行: 15, 19–20）

```ts
12 │ export type HrTime = [number, number];
13 │ 
14 │ export function mark(): HrTime {
15 ▶   return process.hrtime();
16 │ }
17 │ 
18 │ export function timeSinceInMicros(mark: HrTime): number {
19 ▶   const delta = process.hrtime(mark);
20 ▶   return delta[0] * 1000000 + Math.floor(delta[1] / 1000);
21 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/perf/src/recorder.ts` L119–146 （▶ の行: 126–127, 133–134, 140, 144）

```ts
119 │ /**
120 │  * A `PerfRecorder` that delegates to a target `PerfRecorder` which can be updated later.
121 │  *
122 │  * `DelegatingPerfRecorder` is useful when a compiler class that needs a `PerfRecorder` can outlive
123 │  * the current compilation. This is true for most compiler classes as resource-only changes reuse
124 │  * the same `NgCompiler` for a new compilation.
125 │  */
126 ▶ export class DelegatingPerfRecorder implements PerfRecorder {
127 ▶   constructor(public target: PerfRecorder) {}
128 │ 
129 │   eventCount(counter: PerfEvent, incrementBy?: number): void {
130 │     this.target.eventCount(counter, incrementBy);
131 │   }
132 │ 
133 ▶   phase(phase: PerfPhase): PerfPhase {
134 ▶     return this.target.phase(phase);
135 │   }
136 │ 
137 │   inPhase<T>(phase: PerfPhase, fn: () => T): T {
138 │     // Note: this doesn't delegate to `this.target.inPhase` but instead is implemented manually here
139 │     // to avoid adding an additional frame of noise to the stack when debugging.
140 ▶     const previousPhase = this.target.phase(phase);
141 │     try {
142 │       return fn();
143 │     } finally {
144 ▶       this.target.phase(previousPhase);
145 │     }
146 │   }
```

`DelegatingPerfRecorder` は、127 行目の `target` を後から差し替えられる記録係です。`NgCompiler` は handler などに、この包んだ記録係を渡します。テンプレートや CSS のファイルだけが変わった再ビルドでは、`NgCompiler` と handler を使い回したまま、`target` だけを新しい `ActivePerfRecorder` に替えます（[第 3 回](03-ngtsc-compiler-ticket.md)の `resourceChangeTicket`）。138〜139 行目のコメントのとおり、`inPhase` を自分で書いているのは、デバッガーのスタックを 1 段浅くするためです。

📄 `angular/packages/compiler-cli/src/ngtsc/perf/src/noop.ts` L10–26 （▶ の行: 10, 16, 20, 26）

```ts
10 ▶ class NoopPerfRecorder implements PerfRecorder {
11 │   eventCount(): void {}
12 │ 
13 │   memory(): void {}
14 │ 
15 │   phase(): PerfPhase {
16 ▶     return PerfPhase.Unaccounted;
17 │   }
18 │ 
19 │   inPhase<T>(phase: PerfPhase, fn: () => T): T {
20 ▶     return fn();
21 │   }
22 │ 
23 │   reset(): void {}
24 │ }
25 │ 
26 ▶ export const NOOP_PERF_RECORDER: PerfRecorder = new NoopPerfRecorder();
```

`NOOP_PERF_RECORDER` は何も数えない記録係で、16 行目のとおり段を聞かれると常に `Unaccounted` を返します。単体テストで handler を作るときに渡されます（[第 19 回](19-ngtsc-test-env.md)）。

## 8. tracePerformance：JSON に書き出す

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L56–58 （▶ の行: 56, 58）

```ts
56 ▶     const perfRecorder = ActivePerfRecorder.zeroedToNow();
57 │ 
58 ▶     perfRecorder.phase(PerfPhase.Setup);
```

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L523–534 （▶ の行: 525–526, 533–534）

```ts
523 │     let dtsFileCount = 0;
524 │     let nonDtsFileCount = 0;
525 ▶     for (const sf of inputProgram.getSourceFiles()) {
526 ▶       if (sf.isDeclarationFile) {
527 │         dtsFileCount++;
528 │       } else {
529 │         nonDtsFileCount++;
530 │       }
531 │     }
532 │ 
533 ▶     livePerfRecorder.eventCount(PerfEvent.InputDtsFile, dtsFileCount);
534 ▶     livePerfRecorder.eventCount(PerfEvent.InputTsFile, nonDtsFileCount);
```

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L380–386 （▶ の行: 380–384）

```ts
380 ▶     if (this.options.tracePerformance !== undefined) {
381 ▶       const perf = this.compiler.perfRecorder.finalize();
382 ▶       getFileSystem().writeFile(
383 ▶         getFileSystem().resolve(this.options.tracePerformance),
384 ▶         JSON.stringify(perf, null, 2),
385 │       );
386 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/perf/src/recorder.ts` L87–116 （▶ の行: 89, 97–99, 103–105, 109–111）

```ts
 87 │   finalize(): PerfResults {
 88 │     // Track the last segment of time spent in `this.currentPhase` in the time array.
 89 ▶     this.phase(PerfPhase.Unaccounted);
 90 │ 
 91 │     const results: PerfResults = {
 92 │       events: {},
 93 │       phases: {},
 94 │       memory: {},
 95 │     };
 96 │ 
 97 ▶     for (let i = 0; i < this.phaseTime.length; i++) {
 98 ▶       if (this.phaseTime[i] > 0) {
 99 ▶         results.phases[PerfPhase[i]] = this.phaseTime[i];
100 │       }
101 │     }
102 │ 
103 ▶     for (let i = 0; i < this.phaseTime.length; i++) {
104 ▶       if (this.counters[i] > 0) {
105 ▶         results.events[PerfEvent[i]] = this.counters[i];
106 │       }
107 │     }
108 │ 
109 ▶     for (let i = 0; i < this.bytes.length; i++) {
110 ▶       if (this.bytes[i] > 0) {
111 ▶         results.memory[PerfCheckpoint[i]] = this.bytes[i];
112 │       }
113 │     }
114 │ 
115 │     return results;
116 │   }
```

1. **56〜58 行目：NgtscProgram のコンストラクターの最初で作る**

   時刻 0 は `NgtscProgram` を作り始めた瞬間です。`NgtscProgram` の流れは [第 2 回](02-ngtsc-program.md)。
2. **525〜534 行目：入力のファイルを数える**

   `NgCompiler` を作るとき、プログラムの全ファイルを `.d.ts` とそれ以外に分けて数えます。型チェック用の shim（`*.ngtypecheck.ts`）もここで数えられます（DEMO）。
3. **380〜386 行目：emit の最後に書く**

   `angularCompilerOptions.tracePerformance` にパスがあれば、`finalize()` の結果を `JSON.stringify(perf, null, 2)` で書きます。この前後の emit の流れは [第 2 回](02-ngtsc-program.md)で引用しています。
4. **89 行目：最後の段の時間を締める**

   `Unaccounted` に切り替えることで、今いた段に最後の時間が入ります。
5. **97〜113 行目：0 より大きいものだけ、名前つきで**

   enum の逆引き（`PerfPhase[i]`）で番号を名前にします。一度も入らなかった段・起きなかった事件は JSON に出ません。

> [!NOTE]
> **ポイント**
>
> 103 行目は事件の配列（`counters`、長さ 19）を回すのに、段の配列の長さ（`phaseTime.length`、32）を使っています。19 番目より後は `undefined > 0` が偽なので結果は変わりませんが、`PerfEvent` が `PerfPhase` より多くなると、後ろの事件が JSON に出なくなる書き方です（数は配布物 22.1.6 の `PerfPhase.LAST = 32`・`PerfEvent.LAST = 19` で確かめた）。

📄 `angular/packages/compiler-cli/src/ngtsc/perf/README.md` L13–21 （▶ の行: 15, 19）

```md
13 │ # Enabling performance traces
14 │ 
15 ▶ Performance traces are enabled via the undocumented `tracePerformance` option in `angularCompilerOptions` inside the tsconfig.json file. This option takes a string path relative to the current directory, which will be used to write the trace JSON file.
16 │ 
17 │ ## In-Memory TS Host Tracing
18 │ 
19 ▶ By default, the trace file will be written with the `fs` package directly. However, ngtsc supports in-memory compilation using a `ts.CompilerHost` for all operations. In the event that tracing is required when using an in-memory filesystem, a `ts:` prefix can be added to the value of `tracePerformance`, which will cause the trace JSON file to be written with the TS host's `writeFile` method instead.
20 │ 
21 │ This is not done by default as `@angular/cli` does not allow writing arbitrary JSON files via its host.
```

perf の README は 15 行目で「文書に書いていない設定」と断っています。19 行目の `ts:` の前置きは、今の `program.ts` には見当たりません（`grep -rn "'ts:'" packages/compiler-cli/src` で 0 件）。380〜386 行目は前置きを見ずに `getFileSystem().writeFile` で書きます。README の前半（このファイルより上の「What is a performance trace?」）が書く「mark と span の事件」の形も、今の `finalize()` の `{events, phases, memory}` とは違います。README は古い形のままです。

> **🧪 記録の再生：tracePerformance が書いた JSON**
>
> これは記録です。4 つのファイル（コンポーネント 2・pipe 1・@Injectable 1）に `tracePerformance` を付けて、上と同じ 4 つの診断を集めてから `emit()` しました。時間は記録した 1 回のもので、機械や回によって変わります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-diagnostics-perf)

- 一番大きいのは `TypeScriptProgramCreate`（TypeScript のプログラムを作る、`lib.dom.d.ts` などの読み込みを含む）で、Angular 自身の段（`Analysis`・`Resolve`・`Compile`）は小さく出ます。
- `InputDtsFile` の 265 は TypeScript の `lib` の `.d.ts`（63 個）と `@angular/core` などの `.d.ts`、`InputTsFile` の 8 は入力の 4 つと、それぞれの `*.ngtypecheck.ts` です。`EmitSourceFile` が 4 なのは、shim は emit しないからです（[第 2 回](02-ngtsc-program.md)）。
- `TypeScriptDiagnostics`・`TcbGeneration`・`TcbUpdateProgram`・`TtcDiagnostics` は、診断を集めたので現れました。診断を集めずに `emit()` だけにすると、この 4 つの段は JSON に出ませんでした（この記録とは別に、1 つのコンポーネントで 1 回確かめた）。

## ここまでの呼び出し

- `handler.analyze(...)` — annotations/… — *throw new FatalDiagnosticError(code, node, msg) か、diagnostics: \[makeDiagnostic(...)\] を返す*
  - `TraitCompiler.analyzeTrait` — transform/src/compilation.ts 466 — *err.toDiagnostic()*
    - `makeDiagnostic` → `ngErrorCode` — diagnostics/src/error.ts 48・util.ts 31 — *code = -991001*
- `NgCompiler.getDiagnostics` → `addMessageTextDetails` — core/src/compiler.ts 679 — *負の ErrorCode だけ URL*
  - `errorCodeWithGuideFromDiagnosticCode` → `addDiagnosticDetails` — util.ts 46・54
- 👤 `formatDiagnostics` — perform\_compile.ts 32 — *TS-99 → NG*
- `NgtscProgram.emit` → `perfRecorder.finalize()` — program.ts 380 — *tracePerformance があれば JSON*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| ngtsc/diagnostics/test/format\_compiler\_error\_spec.ts（33 行） | describe `compiler error formatting`（17 行目）に it が 3 つ。45ebb127e32 で足された単体テストです。 | `//packages/compiler-cli/src/ngtsc/diagnostics/test:test` |
| test/ngtsc/ngtsc\_spec.ts | describe `diagnostic guide links`（7313 行目）に it が 2 つ。`error handling`（2841 行目）に FatalDiagnosticError の it が並びます。 | `//packages/compiler-cli/test/ngtsc:ngtsc` |
| perf | `ngtsc/perf/` に `test/` は無く、`tracePerformance` を確かめる spec も `packages/compiler-cli/test` に見当たりません（`grep -rn tracePerformance packages/compiler-cli/test` で 0 件）。 | — |

📄 `angular/packages/compiler-cli/src/ngtsc/diagnostics/test/format_compiler_error_spec.ts` L17–33 （▶ の行: 19, 24–25, 29–30）

```ts
17 │ describe('compiler error formatting', () => {
18 │   it('formats compiler error codes using the absolute enum value', () => {
19 ▶     expect(formatCompilerErrorCode(ErrorCode.DECORATOR_ARG_NOT_LITERAL)).toBe('NG1001');
20 │     expect(formatCompilerErrorCode(ErrorCode.DECORATOR_ARITY_WRONG)).toBe('NG1002');
21 │   });
22 │ 
23 │   it('keeps diagnostic codes stable for error codes with guide markers', () => {
24 ▶     expect(ngErrorCode(ErrorCode.DECORATOR_ARG_NOT_LITERAL)).toBe(-991001);
25 ▶     expect(ngErrorCode(ErrorCode.DECORATOR_ARITY_WRONG)).toBe(-991002);
26 │   });
27 │ 
28 │   it('adds error guide details to diagnostic message text', () => {
29 ▶     expect(addDiagnosticDetails(ErrorCode.DECORATOR_ARG_NOT_LITERAL, 'message')).toBe(
30 ▶       `message. Find more at ${ERROR_DETAILS_PAGE_BASE_URL}/NG1001`,
31 │     );
32 │   });
33 │ });
```

24 行目は 3 節の計算（負の値の印があっても `-991001`）、29〜30 行目は 4 節の `". "` のつなぎ方です。URL の前半は `ERROR_DETAILS_PAGE_BASE_URL` をそのまま使うので、4 節の版の判定はこの spec では確かめていません。

📄 `angular/packages/compiler-cli/test/ngtsc/ngtsc_spec.ts` L7314–7345 （▶ の行: 7323, 7331, 7333, 7336–7337, 7340, 7342–7343）

```ts
7314 │       it('should add error guide links only to diagnostics that have guides', () => {
7315 │         env.tsconfig({strictTemplates: true});
7316 │         env.write(
7317 │           'test.ts',
7318 │           `
7319 │           import {Component} from '@angular/core';
7320 │ 
7321 │           @Component({
7322 │             selector: 'test-cmp',
7323 ▶             template: '<not-known>{{value | missingPipe}}</not-known>',
7324 │           })
7325 │           export class Cmp {
7326 │             value = '';
7327 │           }
7328 │         `,
7329 │         );
7330 │ 
7331 ▶         const diags = env.driveDiagnostics();
7332 │         const schemaDiag = diags.find(
7333 ▶           (diag) => diag.code === ngErrorCode(ErrorCode.SCHEMA_INVALID_ELEMENT),
7334 │         );
7335 │         expect(schemaDiag).toBeDefined();
7336 ▶         expect(ts.flattenDiagnosticMessageText(schemaDiag!.messageText, '\n')).toContain(
7337 ▶           `Find more at ${ERROR_DETAILS_PAGE_BASE_URL}/NG8001`,
7338 │         );
7339 │ 
7340 ▶         const pipeDiag = diags.find((diag) => diag.code === ngErrorCode(ErrorCode.MISSING_PIPE));
7341 │         expect(pipeDiag).toBeDefined();
7342 ▶         expect(ts.flattenDiagnosticMessageText(pipeDiag!.messageText, '\n')).not.toContain(
7343 ▶           'Find more at',
7344 │         );
7345 │       });
```

7323 行目の 1 つのテンプレートで、ページのある NG8001（`SCHEMA_INVALID_ELEMENT` は負の値）と、ページの無い `MISSING_PIPE` の 2 つの診断を出し、7336〜7337 行目で前者にだけ URL があり、7342〜7343 行目で後者に無いことを見ています。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/diagnostics/test:test \
  --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=diagnostic guide links'
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/ngtsc-logs/e-diag-unit.log・e-guide.log）`

```
# diagnostics/test:test
3 specs, 0 failures
//packages/compiler-cli/src/ngtsc/diagnostics/test:test                  PASSED in 0.7s

# test/ngtsc:ngtsc（終わった順に shard 2・1・3・4）
Ran 1 of 6747 specs
1 spec, 0 failures
Ran 2 of 6748 specs
2 specs, 0 failures
Ran 2 of 6748 specs
2 specs, 0 failures
Ran 3 of 6749 specs
3 specs, 0 failures
//packages/compiler-cli/test/ngtsc:ngtsc                                 PASSED in 2.3s
```

- ngtsc の結合テストは shard ごとの「Ran」を足すと 1 + 2 + 2 + 3 = 8 で、it 2 つ × 4 つのファイルシステムです。shard の分け方は [第 17 回](17-ngtsc-hmr.md)の「テストと直し方」に書きました。

### 直すとしたら

- 「コンパイラが落ちる（スタックトレースが出る）」系は、1 節の 471 行目で投げ直された普通の `Error` です。8b2785b597c と同じく、投げている呼び出しを `FatalDiagnosticError` で包み、ngtsc\_spec.ts の `error handling` の describe に `verifyThrownError(ErrorCode.…, '…')` の it を足す形が入口です。
- 「1 つのエラーのせいで関係ないエラーが山ほど出る」系は、投げていた所を 2 節の 74b294cd51b のように「返す」に変えられないかを見ます。spec は `standalone_spec.ts` のように、診断の数（`diags.length`）を確かめる形です。
- 4 節の URL の版は、`error_details_base_url.ts` の 14 行目と配布物の行を見比べるところまでにします。直すとしたら、ソースでなく配布物を作る段（バンドルとリリースの置き換え）の話なので、spec の形では確かめにくい種類です。
- 本家に PR を出すことは勧めません。issue を読むときに、メッセージの番号から 3 節・4 節の計算を逆にたどれると、どの handler のどの行かを探す手がかりになります（[第 20 回](20-ngtsc-issues.md)）。

## 聞かれそうな質問

**Q. NG1001 の診断を TypeScript の API で受け取ると、code はいくつですか？**

`-991001` です。`makeDiagnostic` の 58 行目が `ngErrorCode` を通し、util.ts の 33 行目で `-(99 × 10^4 + 1001)` になります。`NG1001` の文字は表示のとき（5 節）か、URL を作るとき（4 節の 58 行目）にだけ作られます。

**Q. FatalDiagnosticError を投げるのと、diagnostics を返すのは何が違いますか？**

投げると `analyzeTrait` の 468 行目で解析の結果が `null` になり、そのクラスはあとの段で無いものとして扱われます。返すと解析の結果が残るので、そのクラスを使う側の解決や型チェックが続きます（2 節の 74b294cd51b）。

**Q. どのエラーに「Find more at …」が付きますか？**

`ErrorCode` の値が負のもの（手元の木で 10 個。NG1001・NG2003・NG2009・NG3003・NG6100・NG8001・NG8002・NG8003 など）だけです。4 節の 50〜51 行目が、番号から負の値の enum を逆引きできるかで決めます。

**Q. エラーのリンクの版はどう決まりますか？**

`@angular/compiler` の `VERSION.full` が `-next`・`-rc` を含めば `next.angular.dev`、そうでなければ `v22.angular.dev` のような場所です（error\_details\_base\_url.ts の 13〜15 行目）。ただし配布物 22.1.6 ではバンドルのせいで常に `next` になっていました（4 節の注意）。

**Q. ビルドのどこが遅いかを、CLI を通さずに測れますか？**

`tsconfig.json` の `angularCompilerOptions` に `"tracePerformance": "trace.json"` を書いて `ngc -p` で走らせると、emit の最後に段ごとのマイクロ秒・事件の数・メモリの JSON が書かれます（program.ts の 380〜386 行目）。文書に無い設定で、形は変わることがあります（README の 15 行目）。

## 読み終えて

- ngtsc の診断は ts.Diagnostic。FatalDiagnosticError は analyzeTrait が受け止めて解析の結果を捨て、makeDiagnostic を返せば解析の結果が残る。
- code は ngErrorCode で -99 を前に付けた負の数。表示のときに TS-99 が NG に置き換わる（色つきの書式のときだけ）。
- ErrorCode が負の値なら説明のページがあり、addMessageTextDetails が URL を足す。URL の版は VERSION で決まるが、22.1.6 の配布物では next を指していた。
- ActivePerfRecorder は「今いる段」に時間を足し続ける。tracePerformance でその合計を JSON に書く。DelegatingPerfRecorder は記録係を差し替えるための包み。

---

← 前: [HMR の更新モジュール：コンポーネントだけを差し替える関数を作る](17-ngtsc-hmr.md)  
次: [ngtsc のテストを書く：NgtscTestEnvironment と runInEachFileSystem](19-ngtsc-test-env.md) →
