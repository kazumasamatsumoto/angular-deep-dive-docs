[目次](../README.md) › [HttpClient の細部と issue](README.md) › 第 3 回 / 全 6 回

# オーバーロードの型：observe と responseType で戻り値が決まるしくみ

> client.ts の get・post などが observe（body・events・response）と responseType（json・text・blob・arraybuffer）の組み合わせごとにオーバーロードを持つ理由、TypeScript がどれを選ぶか（型引数の数で候補を絞り、上から最初に合うもの）、options を変数に入れると responseType が string に広がって選ばれなくなる落とし穴（as const）、公開の型 HttpClientCommonOptions の変数が get では通らず head・post では Observable&lt;Object&gt; として通る違い、実行時の分岐との対応。開いている #49760・#21866 を型の面から読む。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/httpx-overload-types)

---

`http.get(url, { responseType: 'text' })` の戻り値が `Observable<string>` になるのは、`get` が 15 個のオーバーロード（同じ名前で引数の形ごとに戻り値の型を書き分けた宣言）を持つからです。この章では、その並び方と、TypeScript が上から順に「最初に合うもの」を選ぶ規則を、型の検査を実際に走らせた記録で確かめます。options を変数に入れると `'text'` が `string` に広がって選ばれなくなる落とし穴、公開の型 `HttpClientCommonOptions` の変数で渡したとき `get` と `head`・`post` で結果が分かれること、開いている #49760・#21866 も型の面から読みます。

読む対象は `packages/common/http/src/client.ts` の宣言と、公開の型の記録 `goldens/public-api/common/http/index.api.md` です。実行時に `observe` と `responseType` で返すものを分ける行は[HttpClient.request の章](../http/03-http-client-request.md)の 4・5 節で読みました。この章は型の側だけです。

1. [1. HttpRequest の options](01-httpx-request-options.md)
2. [2. headers と params の更新](02-httpx-headers-params-updates.md)
3. **3. オーバーロードの型**（この章）
4. [4. httpResource の型](04-httpx-resource-types.md)
5. [5. 転送キャッシュのキー](05-httpx-transfer-cache-key.md)
6. [6. spec と issue](06-httpx-tests-issues.md)

## 1. どのオーバーロードにも付く HttpClientCommonOptions

📄 `angular/packages/common/http/src/client.ts` L20–31 （▶ の行: 25–28）

```ts
20 │ /**
21 │  * Common options for HttpClient requests.
22 │  *
23 │  * @publicApi 22.0
24 │  */
25 ▶ export interface HttpClientCommonOptions extends Omit<HttpRequestOptions, 'headers' | 'params'> {
26 ▶   headers?: HttpHeaders | {[header: string]: string | string[]};
27 ▶   observe?: 'body' | 'events' | 'response';
28 ▶   params?:
29 │     | HttpParams
30 │     | {[param: string]: string | number | boolean | ReadonlyArray<string | number | boolean>};
31 │ }
```

25 行目、`HttpClientCommonOptions` は[第 1 回](01-httpx-request-options.md)の `HttpRequestOptions` から `headers` と `params` を外し（`Omit`）、26・28 行目でただのオブジェクトも許す形に足し直したものです。27 行目で `observe` を足します。`responseType` は `HttpRequestOptions` から受け継ぐので、型は `'arraybuffer' | 'blob' | 'json' | 'text'` の 4 つの合併（ユニオン）です。2026-02 の 6413e703fa1（「refactor http options」）より前は、この型は無く、オーバーロードの 1 つ 1 つに同じ 20 近い項目が書き写されていました。

各オーバーロードは `{ observe: …; responseType: … } & HttpClientCommonOptions` と `&`（交差型。両方の条件を同時に満たす型）で書きます。`responseType` は左の `'text'` と右の 4 つの合併の両方を満たす必要があるので、結果は `'text'` だけです。**「どのオーバーロードか」は左の 2 つで決まり、右は共通の項目を足すだけ**、という作りです。

## 2. get の 15 個の並び

| 順 | observe | responseType | 型引数 | 戻り値の型 |
| --- | --- | --- | --- | --- |
| 1〜3 | `'body'`（省略可） | `'arraybuffer'`・`'blob'`・`'text'`（必須） | なし | `Observable<ArrayBuffer>`・`<Blob>`・`<string>` |
| 4〜6 | `'events'`（必須） | 同じ 3 つ（必須） | なし | `Observable<HttpEvent<ArrayBuffer>>` など |
| 7・8 | `'events'`（必須） | `'json'`（省略可） | なし・`<T>` | `HttpEvent<Object>`・`HttpEvent<T>` |
| 9〜11 | `'response'`（必須） | arraybuffer・blob・text（必須） | なし | `Observable<HttpResponse<ArrayBuffer>>` など |
| 12・13 | `'response'`（必須） | `'json'`（省略可） | なし・`<T>` | `HttpResponse<Object>`・`HttpResponse<T>` |
| 14・15 | `'body'`（省略可） | `'json'`（省略可） | なし・`<T>` | `Observable<Object>`・`Observable<T>` |

observe 3 通り × responseType 4 通りで 12、json の 3 つにだけ型引数つきの版があるので 15 です。7・8 番目の組を見ます。

📄 `angular/packages/common/http/src/client.ts` L1013–1036 （▶ の行: 1013, 1016–1017, 1019, 1030, 1036）

```ts
1013 ▶   get(
1014 │     url: string,
1015 │     options: {
1016 ▶       observe: 'events';
1017 ▶       responseType?: 'json';
1018 │     } & HttpClientCommonOptions,
1019 ▶   ): Observable<HttpEvent<Object>>;
1020 │ 
1021 │   /**
1022 │    * Constructs a `GET` request that interprets the body as JSON and returns the full
1023 │    * event stream.
1024 │    *
1025 │    * @param url     The endpoint URL.
1026 │    * @param options The HTTP options to send with the request.
1027 │    *
1028 │    * @return An `Observable` of the response, with a response body in the requested type.
1029 │    */
1030 ▶   get<T>(
1031 │     url: string,
1032 │     options: {
1033 │       observe: 'events';
1034 │       responseType?: 'json';
1035 │     } & HttpClientCommonOptions,
1036 ▶   ): Observable<HttpEvent<T>>;
```

1013 行目と 1030 行目は、引数の形がまったく同じで、違いは `<T>` があるかと、戻り値が `HttpEvent<Object>`（1019 行目）か `HttpEvent<T>`（1036 行目）かだけです。1016 行目の `observe: 'events'` は `?` が無い必須の項目で、1017 行目の `responseType?: 'json'` は省略できます。

📄 `angular/packages/common/http/src/client.ts` L1119–1143 （▶ の行: 1119, 1122, 1125, 1137, 1139–1141, 1143）

```ts
1119 ▶   get<T>(
1120 │     url: string,
1121 │     options: {
1122 ▶       observe: 'response';
1123 │       responseType?: 'json';
1124 │     } & HttpClientCommonOptions,
1125 ▶   ): Observable<HttpResponse<T>>;
1126 │ 
1127 │   /**
1128 │    * Constructs a `GET` request that interprets the body as JSON and
1129 │    * returns the response body as an object parsed from JSON.
1130 │    *
1131 │    * @param url     The endpoint URL.
1132 │    * @param options The HTTP options to send with the request.
1133 │    *
1134 │    *
1135 │    * @return An `Observable` of the response body as a JavaScript object.
1136 │    */
1137 ▶   get(
1138 │     url: string,
1139 ▶     options?: {
1140 ▶       observe?: 'body';
1141 ▶       responseType?: 'json';
1142 │     } & HttpClientCommonOptions,
1143 ▶   ): Observable<Object>;
```

最後の組は 1137 行目からで、1139 行目の `options?` も、1140 行目の `observe?` も、1141 行目の `responseType?` も省略できます。つまり `http.get(url)` にいちばん緩く合う宣言で、だから並びの最後にあります。その後ろの 15 番目が `get<T>` で、さらにその後ろの `Observable<any>` を返す本体は実装シグネチャ（外からは呼べない宣言）です（[HttpClient.request の章](../http/03-http-client-request.md)の 1 節）。`get` には「何でも受け取る」宣言は 1 つもありません。

## 3. TypeScript が選ぶ規則

1. **型引数を書いたら、型引数の数が合う宣言だけが候補になる**

   `http.get<Hero[]>(…)` と書くと、`<T>` を持つ 3 つ（8・13・15 番目）だけが候補です。`<T>` の無い 12 個は見られません。
2. **候補を上から順に試し、引数が合った最初の 1 つで決まる**

   `{ responseType: 'text' }` をその場に書くと、1 番目（`'arraybuffer'` が必須）は合わず、2 番目（`'blob'`）も合わず、3 番目で合います。その場に書いたオブジェクトは、相手の型に合わせて `'text'` というリテラル型（その文字列だけを表す型）として見られるからです。
3. **1 つも合わなければエラー。表示されるのは最後の候補のエラー**

   候補が多いと、TypeScript は「The last overload gave the following error.」と、いちばん最後の宣言（get なら 15 番目）で試した結果だけを出します。そのため、エラーの文に出てくる型が、あなたが狙った宣言の型とは限りません。

## 4. 記録：型の検査を Node で走らせた結果

型は実行時に残らないので、ページの上では見せられません。代わりに、下の 2 つのファイルを Node で動かし、TypeScript 6.0.3 の型検査器（`checker.typeToString`）で各変数の型と、その行のエラーを取り出しました。`@angular/common` はこのサイトが使う 22.1.6 の型定義（.d.ts）です。**これは 2026-11-06 に一度走らせた記録の再生です**（ページを開いて検査しているわけではありません）。22.2.0-next.7 のソースと ../angular-main の client.ts も同じ宣言であることを確かめてあります。

📄 `scratchpad/a-httpx/tc/cases.ts（検査したファイルの全文）`

```
import {HttpClient, HttpClientCommonOptions} from '@angular/common/http';

interface Hero {
  id: number;
}
declare const http: HttpClient;
const url = '/api/heroes';

// 1. options を省略する
const a1 = http.get(url);
const a2 = http.get<Hero[]>(url);
// 2. responseType をその場に書く
const b1 = http.get(url, {responseType: 'text'});
const b2 = http.get(url, {responseType: 'blob'});
const b3 = http.get(url, {responseType: 'arraybuffer'});
// 3. observe をその場に書く
const c1 = http.get(url, {observe: 'response'});
const c2 = http.get<Hero[]>(url, {observe: 'response'});
const c3 = http.get(url, {observe: 'events', responseType: 'text'});
const c4 = http.get<Hero[]>(url, {observe: 'events'});
// 4. text に型引数を付ける
const d1 = http.get<string>(url, {responseType: 'text'});
// 5. options を変数に入れる
const opts = {responseType: 'text'};
const e1 = http.get(url, opts);
const optsConst = {responseType: 'text'} as const;
const e2 = http.get(url, optsConst);
const optsTyped: {responseType: 'text'} = {responseType: 'text'};
const e3 = http.get(url, optsTyped);
// 6. 公開の型 HttpClientCommonOptions で持つ
const common: HttpClientCommonOptions = {responseType: 'text', observe: 'events'};
const f1 = http.get(url, common);
const f2 = http.head(url, common);
const f3 = http.post(url, {}, common);
const f4 = http.request('GET', url, common);
const f5 = http.delete(url, common);
// 7. 条件で observe を変える
declare const wantEvents: boolean;
const g1 = http.post(url, {}, {observe: wantEvents ? 'events' : 'body'});
const g2 = http.get(url, {observe: wantEvents ? 'events' : 'body'});
// 8. head と post の body
const h1 = http.head(url);
const h2 = http.head(url, {observe: 'response', responseType: 'text'});
const h3 = http.post<Hero>(url, {name: 1});
const h4 = http.post<Hero, {name: string}>(url, {name: 'x'});

```

📄 `scratchpad/a-httpx/tc/run.mjs（検査したスクリプトの全文）`

```
// 使い方: node run.mjs <angular-deep-dive のパス> <cases.ts>
// cases.ts を TypeScript で型検査し、名前が a1〜h9 の変数ごとに「推論された型」と「その行のエラー」を JSON で出す。
// cases.ts と同じディレクトリに angular-deep-dive の node_modules へのリンクを置いて、@angular/common を解決する。
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const [root, file] = process.argv.slice(2);
const require = createRequire(root + '/package.json');
const ts = require('typescript');
const program = ts.createProgram([file], {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  types: [],
  noEmit: true,
  skipLibCheck: true,
});
const checker = program.getTypeChecker();
const sf = program.getSourceFile(file);
const diags = ts.getPreEmitDiagnostics(program).filter((d) => d.file === sf);
const lines = readFileSync(file, 'utf8').split('\n');
const results = [];
ts.forEachChild(sf, function visit(node) {
  if (ts.isVariableDeclaration(node) && /^[a-h]\d$/.test(node.name.getText(sf))) {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    const type = checker.typeToString(checker.getTypeAtLocation(node.name), undefined, ts.TypeFormatFlags.NoTruncation);
    const errors = diags
      .filter((d) => sf.getLineAndCharacterOfPosition(d.start).line === line)
      .map((d) => `TS${d.code}: ` + ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    results.push({id: node.name.getText(sf), line: line + 1, code: lines[line].trim(), type, error: errors[0] ?? null});
  }
  ts.forEachChild(node, visit);
});
const angularCommon = require(root + '/node_modules/@angular/common/package.json').version;
console.log(JSON.stringify({typescript: ts.version, angularCommon, results}, null, 1));

```

| 変数 | 呼び出し | TypeScript が出した型 | エラー |
| --- | --- | --- | --- |
| a1（10 行目） | const a1 = http.get(url); | Observable&lt;Object&gt; | なし |
| a2（11 行目） | const a2 = http.get&lt;Hero\[\]&gt;(url); | Observable&lt;Hero\[\]&gt; | なし |
| b1（13 行目） | const b1 = http.get(url, {responseType: 'text'}); | Observable&lt;string&gt; | なし |
| b2（14 行目） | const b2 = http.get(url, {responseType: 'blob'}); | Observable&lt;Blob&gt; | なし |
| b3（15 行目） | const b3 = http.get(url, {responseType: 'arraybuffer'}); | Observable&lt;ArrayBuffer&gt; | なし |
| c1（17 行目） | const c1 = http.get(url, {observe: 'response'}); | Observable&lt;HttpResponse&lt;Object&gt;&gt; | なし |
| c2（18 行目） | const c2 = http.get&lt;Hero\[\]&gt;(url, {observe: 'response'}); | Observable&lt;HttpResponse&lt;Hero\[\]&gt;&gt; | なし |
| c3（19 行目） | const c3 = http.get(url, {observe: 'events', responseType: 'text'}); | Observable&lt;HttpEvent&lt;string&gt;&gt; | なし |
| c4（20 行目） | const c4 = http.get&lt;Hero\[\]&gt;(url, {observe: 'events'}); | Observable&lt;HttpEvent&lt;Hero\[\]&gt;&gt; | なし |
| d1（22 行目） | const d1 = http.get&lt;string&gt;(url, {responseType: 'text'}); | — | TS2769: No overload matches this call.<br>Overload 3 of 15, '(url: string, options?: ({ observe?: "body" \| undefined; responseType?: "json" \| undefined; } & HttpClientCommonOptions) \| undefined): Observable&lt;string&gt;', gave the following error. / Type '"text"' is not assignable to type '"json"'. |
| e1（25 行目） | const e1 = http.get(url, opts); | — | TS2769: No overload matches this call.<br>Types of property 'responseType' are incompatible. / Type 'string' is not assignable to type '"json"'. |
| e2（27 行目） | const e2 = http.get(url, optsConst); | Observable&lt;string&gt; | なし |
| e3（29 行目） | const e3 = http.get(url, optsTyped); | Observable&lt;string&gt; | なし |
| f1（32 行目） | const f1 = http.get(url, common); | — | TS2769: No overload matches this call.<br>Type '"body" \| "events" \| "response" \| undefined' is not assignable to type '"body" \| undefined'. / Type '"events"' is not assignable to type '"body"'. |
| f2（33 行目） | const f2 = http.head(url, common); | Observable&lt;Object&gt; | なし |
| f3（34 行目） | const f3 = http.post(url, {}, common); | Observable&lt;Object&gt; | なし |
| f4（35 行目） | const f4 = http.request('GET', url, common); | Observable&lt;any&gt; | なし |
| f5（36 行目） | const f5 = http.delete(url, common); | — | TS2769: No overload matches this call.<br>Type '"body" \| "events" \| "response" \| undefined' is not assignable to type '"body" \| undefined'. / Type '"events"' is not assignable to type '"body"'. |
| g1（39 行目） | const g1 = http.post(url, {}, {observe: wantEvents ? 'events' : 'body'}); | Observable&lt;Object&gt; | なし |
| g2（40 行目） | const g2 = http.get(url, {observe: wantEvents ? 'events' : 'body'}); | — | TS2769: No overload matches this call.<br>Type '"body" \| "events"' is not assignable to type '"body" \| undefined'. / Type '"events"' is not assignable to type '"body"'. |
| h1（42 行目） | const h1 = http.head(url); | Observable&lt;Object&gt; | なし |
| h2（43 行目） | const h2 = http.head(url, {observe: 'response', responseType: 'text'}); | Observable&lt;HttpResponse&lt;string&gt;&gt; | なし |
| h3（44 行目） | const h3 = http.post&lt;Hero&gt;(url, {name: 1}); | Observable&lt;Hero&gt; | なし |
| h4（45 行目） | const h4 = http.post&lt;Hero, {name: string}&gt;(url, {name: 'x'}); | — | TS2558: Expected 1 type arguments, but got 2. |

a〜c は 2 節の表のとおりです。d1 の `get<string>(url, { responseType: 'text' })` はエラーになります。3 節の 1 つ目の規則で `<T>` を持つ 3 つだけが候補になり、その 3 つはどれも `responseType` が `'json'` だからです。text・blob・arraybuffer では型引数を書かない、が正しい書き方です。

## 5. 変数に入れると選ばれない

e1 の `const opts = { responseType: 'text' }` は、`const` でも中のプロパティは書き換えられるので、TypeScript は `responseType` を `string` に広げます（widening）。`string` は `'text'` にも `'json'` にも代入できないので、どの宣言にも合いません。エラーの文は 3 節のとおり最後の候補（15 番目）のもので、「Type 'string' is not assignable to type '"json"'」と、`json` の話に見えます。

2017 年から開いている #18586（「Http ResponseType cannot be set」）がこの話です。当時の担当者は issue の中で「意図した設計。戻り値の型を選ぶには `observe` と `responseType` の値を静的に知る必要がある」と答え、`responseType: 'text' as 'text'` を回避として示しています。今なら e2 の `as const`（すべてのプロパティを読み取り専用のリテラル型にする）か、e3 のように変数に型を書きます。

### 公開の型 HttpClientCommonOptions で持つと、get は通らず head と post は通る

f1〜f5 は、v22 で公開になった `HttpClientCommonOptions` を変数の型に使った場合です。`observe` も `responseType` も合併のままなので、`get`（f1）と `delete`（f5）はエラーです。ところが `head`（f2）と `post`（f3）は通り、**型は `Observable<Object>`** です。理由は最後の宣言の形の違いです。

📄 `angular/packages/common/http/src/client.ts` L1408–1430 （▶ の行: 1418, 1430）

```ts
1408 │   /**
1409 │ 
1410 │    * Constructs a \`HEAD\` request that interprets the body as JSON and
1411 │    * returns the response body as an object parsed from JSON.
1412 │    *
1413 │    * @param url     The endpoint URL.
1414 │    * @param options The HTTP options to send with the request.
1415 │    *
1416 │    * @return An \`Observable\` of the response, with the response body as an object parsed from JSON.
1417 │    */
1418 ▶   head(url: string, options?: HttpClientCommonOptions): Observable<Object>;
1419 │ 
1420 │   /**
1421 │    * Constructs a \`HEAD\` request that interprets the body as JSON and returns
1422 │    * the response in a given type.
1423 │    *
1424 │    * @param url     The endpoint URL.
1425 │    * @param options The HTTP options to send with the request.
1426 │    *
1427 │    * @return An \`Observable\` of the \`HttpResponse\` for the request,
1428 │    * with a response body of the given type.
1429 │    */
1430 ▶   head<T>(url: string, options?: HttpClientCommonOptions): Observable<T>;
```

📄 `angular/packages/common/http/src/client.ts` L2338–2351 （▶ の行: 2338, 2351）

```ts
2338 ▶   post(url: string, body: any | null, options?: HttpClientCommonOptions): Observable<Object>;
2339 │ 
2340 │   /**
2341 │    * Constructs a `POST` request that interprets the body as JSON
2342 │    * and returns an observable of the response.
2343 │    *
2344 │    * @param url The endpoint URL.
2345 │    * @param body The content to replace with.
2346 │    * @param options HTTP options
2347 │    *
2348 │    * @return  An `Observable` of the `HttpResponse` for the request, with a response body in the
2349 │    * requested type.
2350 │    */
2351 ▶   post<T>(url: string, body: any | null, options?: HttpClientCommonOptions): Observable<T>;
```

1418・1430 行目と 2338・2351 行目、`head` と `post` の最後の 2 つは `options?: HttpClientCommonOptions` そのものです。`get` の最後の 2 つ（2 節の 1139〜1142 行目）が `{ observe?: 'body'; responseType?: 'json' } &` を付けているのとは違います。`observe: 'events'` の値を持ちうる変数でも、この宣言には合ってしまい、戻り値は本文の型（`Object`）と名乗ります。

📄 `git show 6413e703fa1 -- packages/common/http/src/client.ts（head の最後の宣言、抜粋）`

```
-  head(
-    url: string,
-    options?: {
-      headers?: HttpHeaders | Record<string, string | string[]>;
-      context?: HttpContext;
-      observe?: 'body';
-      params?: ...;
-      reportProgress?: boolean;
-      responseType?: 'json';
-      withCredentials?: boolean;
-      ...（credentials から timeout まで 1 行ずつ）
-    },
-  ): Observable<Object>;
+  head(url: string, options?: HttpClientCommonOptions): Observable<Object>;
```

この形は 6413e703fa1 で入りました。それより前の `head` の最後の宣言は `observe?: 'body'` と `responseType?: 'json'` を持っていて、`get` と同じ形でした。共通の型にまとめるときに、`head`・`options`・`patch`・`post`・`put` の最後の 2 つでは、その 2 項目まで `HttpClientCommonOptions` の合併に置き換わっています（`get` と `delete` は残っています）。g1 と g2 も同じ違いです。`{ observe: wantEvents ? 'events' : 'body' }` は、その場に書いても `'events' | 'body'` の合併なので、`get`（g2）はエラー、`post`（g1）は `Observable<Object>` です。

> [!WARNING]
> **ハマりどころ**
>
> **型と実行時の値が食い違う（本家の不具合らしきもの）。** f2・f3・g1 は型の上では本文（`Object`）ですが、実行時は `options.observe === 'events'` なので、[HttpClient.request の章](../http/03-http-client-request.md)の 4 節の分かれ道でイベントの列がそのまま返ります。下のデモで、同じ呼び出しが `Sent` のイベントと `HttpResponse` の 2 つを流すことを確かめられます。6413e703fa1 は v22.0.0 に入っていて、22.2.0-next.7 と ../angular-main でも同じです。確かめ方は章末に書きます。

## 6. 値が静的に決まらないときの request

📄 `angular/packages/common/http/src/client.ts` L412–429 （▶ の行: 413, 421, 426–427, 429）

```ts
412 │   /**
413 ▶    * Constructs a request where response type and requested observable are not known statically.
414 │    *
415 │    * @param method  The HTTP method.
416 │    * @param url     The endpoint URL.
417 │    * @param options The HTTP options to send with the request.
418 │    *
419 │    * @return An `Observable` of the requested response, with body of type `any`.
420 │    */
421 ▶   request(
422 │     method: string,
423 │     url: string,
424 │     options?: {
425 │       body?: any;
426 ▶       observe?: 'body' | 'events' | 'response';
427 ▶       responseType?: 'arraybuffer' | 'blob' | 'json' | 'text';
428 │     } & HttpClientCommonOptions,
429 ▶   ): Observable<any>;
```

413 行目のコメントのとおり、`request` にだけは「応答の種類と observe が静的に分からない」ときの宣言があります。426〜427 行目で合併をそのまま受け取り、429 行目で `Observable<any>` を返します。f4 のとおり、`HttpClientCommonOptions` の変数を渡すなら、`head` や `post` より `request` の方が正直な型（`any`。「分からない」と言っている）になります。

## 7. 型から読む 2 つの issue

### #49760：送る本文に型引数を付けたい

2338 行目の `body: any | null` のとおり、`post` の本文はどの宣言でも `any` です。型引数は戻り値の 1 つだけなので、h4 の `post<Hero, {name: string}>` は「Expected 1 type arguments, but got 2」になります。2023-04 の issue は、OpenAPI から作った型で本文を縛りたい、という要望です。issue の中では「URL ごとに本文の型が違うのに、汎用の `post` にどう型を付けるのか」という返答と、自分で包む形の回避が書かれています。

📄 `#49760 の回避の形（自分のコード）`

```
// 自分のサービスに置く包み。T は応答、B は送る本文
post<T, B>(url: string, body: B, options?: { headers?: HttpHeaders }): Observable<T> {
  return this.http.post<T>(url, body, options);
}
```

`HttpClient` の側で直すなら、15 個の宣言のそれぞれに 2 つ目の型引数を足すことになり、3 節の 1 つ目の規則（型引数の数で候補が決まる）のため、今 `post<Hero>` と書いているコードが合う宣言も変わります。

### #21866：head は本文を期待している

h1 の `http.head(url)` は `Observable<Object>` です。HEAD の応答は HTTP の決まりで本文を持たないのに、`responseType` の既定は `'json'` で、型も本文を名乗ります。2018 年の issue は「HEAD では `responseType` の既定を `'text'` にすべき」で、2020 年に担当者が「その通りだが、厳密には破壊的変更になる」と答えています（ラベル `breaking changes`）。今の `FetchBackend` は、本文が無いか空の JSON を `null` にするので（[FetchBackend の章](../http/06-http-backend-fetch.md)）、issue の書いた例外は起きず、届くのは `null` です。型の `Object` は `null` を含みません。下のデモの h1 で確かめられます。

## 8. DEMO：同じ呼び出しを実行すると、何が届くか

> **🧪 DEMO — 記録の型と、実行時に届いた値**
>
> ボタンを押すと、このページで `@angular/common/http` を読み込み、本物の `HttpClient` と `FetchBackend` で、4 節の記録のうち 11 個と同じ呼び出しを 1 回ずつ実行します。`fetch` は[第 1 回](01-httpx-request-options.md)と同じく、その間だけ「`{"hero":"Ann"}`（Content-Type は application/json）を返す関数」に替えます。HEAD には本文の無い応答を返します。f2〜f4 の `common` は `{ responseType: 'text', observe: 'events' }` を `HttpClientCommonOptions` の変数に入れたもの、g1 は `wantEvents = true` です。流れた値を全部集めて、`→` でつないで出します。
>
> 「実行する」を押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/httpx-overload-types)

押すと分かることです。

1. **a1・b1〜b3・c1・c3 は、型と値が一致する**

   `Object` には object、`string` には文字列、`Blob` には Blob が届きます。`HttpEvent<string>` は Sent と Response の 2 つです。
2. **f2・f3・g1 は、型が `Object` なのに HttpEvent が 2 つ（Sent と HttpResponse）届く**

   5 節の食い違いです。f2 の HEAD は本文が無いので、`HttpResponse` の body は `null` です。
3. **f4 は `any` で、届くのは同じ HttpEvent の列**

   型が「分からない」と言っているので、食い違いではありません。
4. **h1 は `Object` と名乗って `null` が届く**

   #21866 の型の面です。

## ここまでの選ばれ方

- 👤 `http.get(url, { responseType: 'text' })` — あなたのコード
  - 型引数なし → 15 個すべてが候補 — 3 節の規則 1
  - 上から試す：1 番目 `'arraybuffer'` ✕、2 番目 `'blob'` ✕、3 番目 `'text'` ○ — client.ts の get の宣言 — *Observable&lt;string&gt;*
  - 実装シグネチャ `get(url, options = {}): Observable<any>` — 外からは見えない
    - `this.request<any>('GET', url, options as any)` — 型をここで捨てる — *実行時の分かれ道は HttpClient.request の章*

## テストと直し方

### 型の変化を見張るもの：公開 API の記録

オーバーロードの型を確かめる spec（client\_spec.ts など）はありません。client\_spec.ts の it は実行時の振る舞いを見るので、5 節の食い違いでは落ちません。型の変化を見張っているのは、`goldens/public-api/common/http/index.api.md` という公開 API の記録です。ビルドした .d.ts から公開の宣言を書き出し、このファイルと違えばテストが落ちます。

📄 `angular/goldens/public-api/common/http/index.api.md` L173–184 （▶ の行: 177–179, 181）

```md
173 │     get<T>(url: string, options: {
174 │         observe: 'response';
175 │         responseType?: 'json';
176 │     } & HttpClientCommonOptions): Observable<HttpResponse<T>>;
177 ▶     get(url: string, options?: {
178 ▶         observe?: 'body';
179 ▶         responseType?: 'json';
180 │     } & HttpClientCommonOptions): Observable<Object>;
181 ▶     get<T>(url: string, options?: {
182 │         observe?: 'body';
183 │         responseType?: 'json';
184 │     } & HttpClientCommonOptions): Observable<T>;
```

📄 `angular/goldens/public-api/common/http/index.api.md` L229–238 （▶ の行: 237–238）

```md
229 │     head(url: string, options: {
230 │         observe: 'response';
231 │         responseType?: 'json';
232 │     } & HttpClientCommonOptions): Observable<HttpResponse<Object>>;
233 │     head<T>(url: string, options: {
234 │         observe: 'response';
235 │         responseType?: 'json';
236 │     } & HttpClientCommonOptions): Observable<HttpResponse<T>>;
237 ▶     head(url: string, options?: HttpClientCommonOptions): Observable<Object>;
238 ▶     head<T>(url: string, options?: HttpClientCommonOptions): Observable<T>;
```

177〜184 行目が `get` の最後の 2 つ、237〜238 行目が `head` の最後の 2 つです。5 節の違いは、この記録の上でも見えています。6413e703fa1 はこのファイルの 2472 行が変わる大きな変更で、レビューでは public-api の確認が付いていますが、記録の差分が大きく、この 2 行の意味の変化は目立ちません。

### 手元で走らせた結果

../angular で `pnpm bazel test //packages/common:common_api --test_output=errors` は PASSED（テスト 1.6 秒、全体 8.0 秒、2026-11-06、scratchpad/httpx-logs/a-golden.log）。宣言を変えたら `pnpm bazel run //packages/common:common_api.accept` で記録を書き直します（contributing-docs/public-api-surface.md の手順）。4 節の型の記録は、上の run.mjs を `node run.mjs <angular-deep-dive> cases.ts` で走らせたものです。

### 直すとしたら

- 5 節は、client.ts の `head`・`options`・`patch`・`post`・`put` の最後の 2 つの宣言を、`get` と同じ `{ observe?: 'body'; responseType?: 'json' } & HttpClientCommonOptions` に戻す形です。公開の型が変わるので、上の記録の書き直しが要ります。ただし今 f2・f3・g1 の形で通っているコードはエラーになるので、型の上では破壊的変更です。
- 型の振る舞いを spec にするなら、記録の cases.ts のようなファイルを型検査だけ走らせる形になります。このパッケージにはその仕組みが無く、公開 API の記録が代わりです。
- #18586・#49760・#21866 はどれも「型を変えると既存のコードの選ばれ方が変わる」ので、長く開いたままです。issue の全体は[第 6 回](06-httpx-tests-issues.md)にまとめます。本家に PR や issue を出すことは勧めません。

**本番ビルドでデモを動かした結果（2026-11-06）。**ヘッドレスの Chrome（HeadlessChrome/155.0.8043.0）で本番ビルドのこのページを開き、「実行する」を押しました。a1 は object、b1 は string、b2 は Blob（size 14、type 'application/json'）、b3 は ArrayBuffer（byteLength 14）、c1 は HttpResponse、c3 は Sent → HttpResponse でした。型が Observable&lt;Object&gt; の f2（head）・f3（post）・g1（post）は、どれも Sent のイベントと HttpResponse の 2 つが届きました（f2 の body は null）。f4（request、型は any）も同じ 2 つ、h1（head(url)）は null でした。/api/ への通信は 0 件、コンソールの警告とエラーは 0 件です（scratchpad/a-httpx/verify/verify.mjs、prod.json）。

## 聞かれそうな質問

**Q. `http.get<string>(url, { responseType: 'text' })` がエラーになるのはなぜですか？**

型引数を書くと、`<T>` を持つ宣言（8・13・15 番目）だけが候補になり、その 3 つはどれも `responseType` が `'json'`（1034・1123 行目と、15 番目も同じ形）だからです。text の宣言（3 番目）は型引数を持ちません。型引数を外せば `Observable<string>` になります（記録の b1 と d1）。

**Q. options を変数に入れたら「No overload matches this call」になりました。**

`responseType: 'text'` が `string` に広がったからです（記録の e1）。`as const` を付けるか（e2）、変数に `{ responseType: 'text' }` の型を書きます（e3）。エラーの文が `'json'` の話に見えるのは、最後の候補のエラーだけが出るからです。

**Q. `HttpClientCommonOptions` の変数を渡すと、型はどうなりますか？**

メソッドによって違います。`get` と `delete` はエラー、`head`・`options`・`patch`・`post`・`put` は最後の宣言（1418 行目や 2338 行目）に合って `Observable<Object>`、`request` は 421〜429 行目の宣言で `Observable<any>` です。`observe: 'events'` が入っていると、実行時はイベントの列が届きます。

**Q. 戻り値の `T` は実行時に確かめられますか？**

確かめられません。`get<Hero[]>` の `T` は型の上の名前だけで、実装シグネチャで `options as any` にして `request` に渡したあとは、JSON を解析した値がそのまま届きます。text・blob・arraybuffer だけは、実行時にも値の種類を確かめる行があります（[HttpClient.request の章](../http/03-http-client-request.md)の 5 節）。

**Q. なぜ条件型（引数の型から戻り値の型を計算する仕組み）にしないのですか？**

2020 年に「オーバーロードの大半を消して options から戻り値を推論する」PR（#38999）が出ましたが、2022 年に閉じられました。担当者は、各シグネチャを別々に示す今の形の方が、メソッドごとの API ドキュメントが分かりやすい、と理由を書いています。

## 読み終えて

- get の 15 個は observe 3 通り × responseType 4 通り + json の型引数版 3 つで、上から順に「最初に合うもの」が選ばれます。型引数を書くと、型引数を持つ宣言だけが候補です。
- options を変数に入れると `'text'` が `string` に広がり、どれにも合いません。`as const` か型を書きます。
- `HttpClientCommonOptions` の変数は、`get` では通らず、`head`・`post` などでは `Observable<Object>` として通ります。observe が events なら、実行時はイベントの列です。
- 型の変化は spec ではなく、公開 API の記録（index.api.md）で見張られています。

---

← 前: [headers と params の更新の規則：append・set・delete と遅れた適用](02-httpx-headers-params-updates.md)  
次: [httpResource の型：text・blob・arrayBuffer と parse](04-httpx-resource-types.md) →
