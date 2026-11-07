[目次](../README.md) › [ngtsc の内側](README.md) › 第 2 回 / 全 20 回

# NgtscProgram と NgCompilerHost：TypeScript のプログラムを包む

> NgtscProgram のコンストラクタが CompilerHost を NgCompilerHost で包み、shim（型チェック用の .ngtypecheck.ts など）を足した ts.Program を作るまで、前のプログラムを再利用する oldProgram の扱い、emit() が NgCompiler の prepareEmit から変換を受け取り TypeScript の emit に渡す流れ。tsc\_plugin.ts（tsc のプラグインとして動く形）との違い。

angular/angular · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-program)

---

`NgtscProgram` は、TypeScript の `ts.Program` を 1 つ包んで、ngc と CLI に「普通の Program と同じ顔」を見せるクラスです。この章では、そのコンストラクタが `CompilerHost`（ファイルを読む窓口）を `NgCompilerHost` で包み、ディスクに無いファイル（shim）を足した `ts.Program` を作り、前回の結果を使うかどうかでチケットを選ぶまでと、`emit()` が Angular の変換を TypeScript の emit に渡すまでを、行で追います。

読む対象は `packages/compiler-cli/src/ngtsc/program.ts`・`ngtsc/core/src/host.ts`・`ngtsc/shims/src/`・`ngtsc/entry_point/src/generator.ts`・`ngtsc/tsc_plugin.ts` です。

1. [1. 全体像](01-ngtsc-overview.md)
2. **2. NgtscProgram**（この章）
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
18. [18. 診断と性能](18-ngtsc-diagnostics-perf.md)
19. [19. テストを書く](19-ngtsc-test-env.md)
20. [20. issue と PR を読む](20-ngtsc-issues.md)

## 1. コンストラクタの前半：時計を回し、設定を確かめる

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L50–70 （▶ の行: 56, 58, 61–62, 67–68）

```ts
50 │   constructor(
51 │     rootNames: ReadonlyArray<string>,
52 │     private options: NgCompilerOptions,
53 │     delegateHost: api.CompilerHost,
54 │     oldProgram?: NgtscProgram,
55 │   ) {
56 ▶     const perfRecorder = ActivePerfRecorder.zeroedToNow();
57 │ 
58 ▶     perfRecorder.phase(PerfPhase.Setup);
59 │ 
60 │     // First, check whether the current TS version is supported.
61 ▶     if (!options.disableTypeScriptVersionCheck) {
62 ▶       verifySupportedTypeScriptVersion();
63 │     }
64 │ 
65 │     // In local compilation mode there are almost always (many) emit errors due to imports that
66 │     // cannot be resolved. So we should emit regardless.
67 ▶     if (options.compilationMode === 'experimental-local') {
68 ▶       options.noEmitOnError = false;
69 │     }
70 │ 
```

56 行目で性能の記録係 `ActivePerfRecorder` を「いま」を 0 として作り、58 行目で段を `Setup` にします。以後の時間はこの記録係に段ごとに積まれ、`tracePerformance` の設定があれば 7 節で書き出されます（[第 18 回](18-ngtsc-diagnostics-perf.md)）。61〜63 行目で TypeScript の版を確かめ、67〜69 行目でローカルコンパイル（ファイルごとに閉じてコンパイルする方式）なら `noEmitOnError` を外します（[standalone-local-compilation の章](../standalone/06-standalone-local-compilation.md)）。

## 2. NgCompilerHost.wrap：ホストを包む

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L71–77 （▶ の行: 71–72）

```ts
71 ▶     const reuseProgram = oldProgram?.compiler.getCurrentProgram();
72 ▶     this.host = NgCompilerHost.wrap(delegateHost, rootNames, options, reuseProgram ?? null);
73 │ 
74 │     if (reuseProgram !== undefined) {
75 │       // Prior to reusing the old program, restore shim tagging for all its `ts.SourceFile`s.
76 │       // TypeScript checks the `referencedFiles` of `ts.SourceFile`s for changes when evaluating
77 │       // incremental reuse of data from the old program, so it's important that these match in order
```

71 行目。前回の `NgtscProgram` があれば、その `NgCompiler` が最後に持っていた `ts.Program` を「再利用するプログラム」にします（なぜ `getTsProgram()` ではないのかは 6 節）。72 行目で、呼び出し側のホストを `NgCompilerHost.wrap` に渡します。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/host.ts` L199–224 （▶ の行: 208, 210, 215–216, 219, 223–224）

```ts
199 │   static wrap(
200 │     delegate: ts.CompilerHost,
201 │     inputFiles: ReadonlyArray<string>,
202 │     options: NgCompilerOptions,
203 │     oldProgram: ts.Program | null,
204 │   ): NgCompilerHost {
205 │     const topLevelShimGenerators: TopLevelShimGenerator[] = [];
206 │     const perFileShimGenerators: PerFileShimGenerator[] = [];
207 │ 
208 ▶     const rootDirs = getRootDirs(delegate, options as ts.CompilerOptions);
209 │ 
210 ▶     perFileShimGenerators.push(new TypeCheckShimGenerator());
211 │ 
212 │     let diagnostics: ts.Diagnostic[] = [];
213 │ 
214 │     const normalizedTsInputFiles: AbsoluteFsPath[] = [];
215 ▶     for (const inputFile of inputFiles) {
216 ▶       if (!isNonDeclarationTsPath(inputFile)) {
217 │         continue;
218 │       }
219 ▶       normalizedTsInputFiles.push(resolve(inputFile));
220 │     }
221 │ 
222 │     let entryPoint: AbsoluteFsPath | null = null;
223 ▶     if (options.flatModuleOutFile != null && options.flatModuleOutFile !== '') {
224 ▶       entryPoint = findFlatIndexEntryPoint(normalizedTsInputFiles);
```

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/host.ts` L243–274 （▶ の行: 246, 251, 255, 262–263, 265）

```ts
243 │       } else {
244 │         const flatModuleId = options.flatModuleId || null;
245 │         const flatModuleOutFile = normalizeSeparators(options.flatModuleOutFile);
246 ▶         const flatIndexGenerator = new FlatIndexGenerator(
247 │           entryPoint,
248 │           flatModuleOutFile,
249 │           flatModuleId,
250 │         );
251 ▶         topLevelShimGenerators.push(flatIndexGenerator);
252 │       }
253 │     }
254 │ 
255 ▶     const shimAdapter = new ShimAdapter(
256 │       delegate,
257 │       normalizedTsInputFiles,
258 │       topLevelShimGenerators,
259 │       perFileShimGenerators,
260 │       oldProgram,
261 │     );
262 ▶     const shimTagger = new ShimReferenceTagger(
263 ▶       perFileShimGenerators.map((gen) => gen.extensionPrefix),
264 │     );
265 ▶     return new NgCompilerHost(
266 │       delegate,
267 │       inputFiles,
268 │       rootDirs,
269 │       shimAdapter,
270 │       shimTagger,
271 │       entryPoint,
272 │       diagnostics,
273 │     );
274 │   }
```

1. **210 行目：ファイルごとの shim の作り手は `TypeCheckShimGenerator` 1 つ**

   shim は「ディスクに無いのに、プログラムの中にあるように見せるファイル」です。`perFileShimGenerators` は、利用者の .ts 1 つにつき 1 つの shim を作る係の配列で、v22 では型チェック用の 1 種類だけです。
2. **214〜220 行目：利用者の .ts の一覧**

   216 行目で .d.ts などを外し、219 行目で絶対パスにします。この一覧が shim を足す「元のファイル」になります。
3. **223〜224 行目、246〜251 行目：`flatModuleOutFile` があれば、プログラムに 1 つだけの shim を足す**

   ライブラリの公開の入口（flat module index）を作る設定です。`FlatIndexGenerator` を `topLevelShimGenerators`（プログラムに 1 つだけの shim の係）に積みます。
4. **255〜264 行目：`ShimAdapter` と `ShimReferenceTagger`**

   前者は「この名前のファイルは shim か、なら作って返す」係、後者は「元のファイルに shim への参照を書き足す」係です（3 節）。263 行目で、後者には shim の拡張子の前置き（`ngtypecheck`）だけを渡します。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/host.ts` L147–168 （▶ の行: 156, 160, 163, 166）

```ts
147 │   constructor(
148 │     delegate: ExtendedTsCompilerHost,
149 │     inputFiles: ReadonlyArray<string>,
150 │     rootDirs: ReadonlyArray<AbsoluteFsPath>,
151 │     private shimAdapter: ShimAdapter,
152 │     private shimTagger: ShimReferenceTagger,
153 │     entryPoint: AbsoluteFsPath | null,
154 │     diagnostics: ts.Diagnostic[],
155 │   ) {
156 ▶     super(delegate);
157 │ 
158 │     this.entryPoint = entryPoint;
159 │     this.constructionDiagnostics = diagnostics;
160 ▶     this.inputFiles = [...inputFiles, ...shimAdapter.extraInputFiles];
161 │     this.rootDirs = rootDirs;
162 │ 
163 ▶     if (this.resolveModuleNames === undefined) {
164 │       // In order to reuse the module resolution cache during the creation of the type-check
165 │       // program, we'll need to provide `resolveModuleNames` if the delegate did not provide one.
166 ▶       this.resolveModuleNames = this.createCachedResolveModuleNamesFunction();
167 │     }
168 │   }
```

160 行目が大事です。**`inputFiles` は、渡された rootNames の後ろに `shimAdapter.extraInputFiles` を足したもの**です。4 節の 83 行目で、`ts.createProgram` にはこちらが渡ります。163〜167 行目は、呼び出し側が `resolveModuleNames` を持っていないときに、モジュール解決の結果を覚えておく版を自分で作ります（型チェック用のプログラムを作るときに同じ結果を使い回すため、とコメントにあります）。

> [!TIP]
> **新卒エンジニアへ**
>
> `ts.CompilerHost` は、TypeScript が「ファイルを読む」「あるか確かめる」「書く」「カレントディレクトリは？」などを外に聞くための窓口のオブジェクトです。ngtsc はこの窓口を差し替えるだけで、TypeScript 本体には手を入れずに「無いファイルをあるように見せる」ことができます。

### DelegatingCompilerHost：渡し忘れを型エラーにする

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/host.ts` L26–41 （▶ の行: 26, 38–40）

```ts
26 ▶ // A persistent source of bugs in CompilerHost delegation has been the addition by TS of new,
27 │ // optional methods on ts.CompilerHost. Since these methods are optional, it's not a type error that
28 │ // the delegating host doesn't implement or delegate them. This causes subtle runtime failures. No
29 │ // more. This infrastructure ensures that failing to delegate a method is a compile-time error.
30 │ 
31 │ /**
32 │  * Delegates all methods of `ExtendedTsCompilerHost` to a delegate, with the exception of
33 │  * `getSourceFile` and `fileExists` which are implemented in `NgCompilerHost`.
34 │  *
35 │  * If a new method is added to `ts.CompilerHost` which is not delegated, a type error will be
36 │  * generated for this class.
37 │  */
38 ▶ export class DelegatingCompilerHost implements Omit<
39 ▶   RequiredDelegations<ExtendedTsCompilerHost>,
40 ▶   'getSourceFile' | 'fileExists'
41 │ > {
```

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/host.ts` L117–124 （▶ の行: 120–122）

```ts
117 │   private delegateMethod<M extends keyof ExtendedTsCompilerHost>(
118 │     name: M,
119 │   ): ExtendedTsCompilerHost[M] {
120 ▶     return this.delegate[name] !== undefined
121 ▶       ? (this.delegate[name] as any).bind(this.delegate)
122 ▶       : undefined!;
123 │   }
124 │ }
```

`NgCompilerHost` の親 `DelegatingCompilerHost` は、`ts.CompilerHost` のメソッドを 1 つずつ元のホストに渡すだけのクラスです。26〜29 行目のコメントのとおり、TypeScript が `CompilerHost` に省略できるメソッドを足すたびに「渡し忘れ」が実行時の不具合になってきたので、38〜41 行目の `RequiredDelegations<…>` で「全部のメソッドを持て」と型で縛ります。自分で実装するのは `getSourceFile` と `fileExists` の 2 つだけです（40 行目）。120〜122 行目、元のホストに無いメソッドは `undefined` のままにします。

## 3. shim がプログラムに入る 2 つの道

📄 `angular/packages/compiler-cli/src/ngtsc/shims/src/adapter.ts` L99–125 （▶ の行: 104, 107–108, 113, 116–117, 119, 121）

```ts
 99 │     // Process top-level generators and pre-generate their shims. Accumulate the list of filenames
100 │     // as extra input files.
101 │     const extraInputFiles: AbsoluteFsPath[] = [];
102 │ 
103 │     for (const gen of topLevelGenerators) {
104 ▶       const sf = gen.makeTopLevelShim();
105 │       sfExtensionData(sf).isTopLevelShim = true;
106 │ 
107 ▶       if (!gen.shouldEmit) {
108 ▶         this.ignoreForEmit.add(sf);
109 │       }
110 │ 
111 │       const fileName = absoluteFromSourceFile(sf);
112 │       this.shims.set(fileName, sf);
113 ▶       extraInputFiles.push(fileName);
114 │     }
115 │ 
116 ▶     // Add to that list the per-file shims associated with each root file. This is needed because
117 ▶     // reference tagging alone may not work in TS compilations that have `noResolve` set. Such
118 │     // compilations rely on the list of input files completely describing the program.
119 ▶     for (const rootFile of tsRootFiles) {
120 │       for (const gen of this.generators) {
121 ▶         extraInputFiles.push(makeShimFileName(rootFile, gen.suffix));
122 │       }
123 │     }
124 │ 
125 │     this.extraInputFiles = extraInputFiles;
```

1. **道 1（103〜114 行目）：プログラムに 1 つだけの shim は、先に作って入力に足す**

   104 行目で中身を作り、113 行目で入力のファイル名に足します。107〜109 行目、`shouldEmit` が `false` の shim は emit しない集合に入れます。
2. **道 1'（119〜123 行目）：rootNames のファイルの shim の名前も、入力に足す**

   116〜118 行目のコメントのとおり、`noResolve`（参照をたどらない）の設定でも shim が入るようにするためです。名前だけを足し、中身はまだ作りません。
3. **道 2：元のファイルを読んだときに、shim への参照を書き足す**

   TypeScript は `/// <reference path>` の一覧（`sf.referencedFiles`）にあるファイルもプログラムに入れます。`ShimReferenceTagger.tag` がこの一覧に `foo.ngtypecheck.ts` を足すので、rootNames に無いファイルの shim も入ります（引用は [typecheck-program-driver の章](../typecheck/04-typecheck-program-driver.md)）。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/host.ts` L295–321 （▶ の行: 302–303, 305, 309, 319）

```ts
295 │   getSourceFile(
296 │     fileName: string,
297 │     languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions,
298 │     onError?: ((message: string) => void) | undefined,
299 │     shouldCreateNewSourceFile?: boolean | undefined,
300 │   ): ts.SourceFile | undefined {
301 │     // Is this a previously known shim?
302 ▶     const shimSf = this.shimAdapter.maybeGenerate(resolve(fileName));
303 ▶     if (shimSf !== null) {
304 │       // Yes, so return it.
305 ▶       return shimSf;
306 │     }
307 │ 
308 │     // No, so it's a file which might need shims (or a file which doesn't exist).
309 ▶     const sf = this.delegate.getSourceFile(
310 │       fileName,
311 │       languageVersionOrOptions,
312 │       onError,
313 │       shouldCreateNewSourceFile,
314 │     );
315 │     if (sf === undefined) {
316 │       return undefined;
317 │     }
318 │ 
319 ▶     this.shimTagger.tag(sf);
320 │     return sf;
321 │   }
```

`NgCompilerHost` が自分で実装する `getSourceFile` です。302 行目で、まず「この名前は shim か」を `ShimAdapter` に聞き、そうなら 305 行目で作った shim を返します。違えば 309 行目で元のホストから本物を読み、319 行目で道 2 の書き足しをしてから返します。

📄 `angular/packages/compiler-cli/src/ngtsc/shims/src/adapter.ts` L162–198 （▶ の行: 164, 170, 173, 175, 178, 181, 194, 198）

```ts
162 │     // This is the first time seeing this path. Try to match it against a shim generator.
163 │     for (const record of this.generators) {
164 ▶       const match = record.test.exec(fileName);
165 │       if (match === null) {
166 │         continue;
167 │       }
168 │ 
169 │       // The path matched. Extract the filename prefix without the extension.
170 ▶       const prefix = match[1];
171 │       // This _might_ be a shim, if an underlying base file exists. The base file might be .ts or
172 │       // .tsx.
173 ▶       let baseFileName = absoluteFrom(prefix + '.ts');
174 │       // Retrieve the original file for which the shim will be generated.
175 ▶       let inputFile = this.delegate.getSourceFile(baseFileName, ts.ScriptTarget.Latest);
176 │       if (inputFile === undefined) {
177 │         // No .ts file by that name - try .tsx.
178 ▶         baseFileName = absoluteFrom(prefix + '.tsx');
179 │         inputFile = this.delegate.getSourceFile(baseFileName, ts.ScriptTarget.Latest);
180 │       }
181 ▶       if (inputFile === undefined || isShim(inputFile)) {
182 │         // This isn't a shim after all since there is no original file which would have triggered
183 │         // its generation, even though the path is right. There are a few reasons why this could
184 │         // occur:
185 │         //
186 │         // * when resolving an import to an .ngfactory.d.ts file, the module resolution algorithm
187 │         //   will first look for an .ngfactory.ts file in its place, which will be requested here.
188 │         // * when the user writes a bad import.
189 │         // * when a file is present in one compilation and removed in the next incremental step.
190 │         //
191 │         // Note that this does not add the filename to `notShims`, so this path is not cached.
192 │         // That's okay as these cases above are edge cases and do not occur regularly in normal
193 │         // operations.
194 ▶         return undefined;
195 │       }
196 │ 
197 │       // Actually generate and cache the shim.
198 ▶       return this.generateSpecific(fileName, record.generator, inputFile);
```

shim かどうかは名前で決まります。164 行目で、コンストラクタで作った正規表現（`.ngtypecheck.ts` で終わる名前に合う形）に当て、170 行目で元の名前の部分を取り出し、173〜180 行目で `.ts`、無ければ `.tsx` の元のファイルを探します。元が無ければ 194 行目で `undefined`（shim ではなかった）、あれば 198 行目で作ります。作る係が `TypeCheckShimGenerator` です。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/shim.ts` L21–27 （▶ の行: 22–23）

```ts
21 │ export class TypeCheckShimGenerator implements PerFileShimGenerator {
22 ▶   readonly extensionPrefix = 'ngtypecheck';
23 ▶   readonly shouldEmit = false;
24 │ 
25 │   generateShimForFile(
26 │     sf: ts.SourceFile,
27 │     genFilePath: AbsoluteFsPath,
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/shim.ts` L38–44 （▶ の行: 40）

```ts
38 │     return ts.createSourceFile(
39 │       genFilePath,
40 ▶       'export const USED_FOR_NG_TYPE_CHECKING = true;',
41 │       ts.ScriptTarget.Latest,
42 │       true,
43 │       ts.ScriptKind.TS,
44 │     );
```

22 行目が拡張子の前置き、23 行目で emit しない shim だと宣言します。最初に作る中身は 40 行目の 1 行だけです。テンプレートの型チェックのコード（TCB）は、型チェックのときに別の `ts.Program` の中で書き込まれます（[typecheck-program-driver の章](../typecheck/04-typecheck-program-driver.md)）。最初から空でも shim を入れておくのは、「型チェック用のプログラムと元のプログラムでファイルの組が同じでないと、TypeScript が前の結果を使い回さない」からだと、このクラスの先頭のコメント（引用の外）に書かれています。

📄 `angular/packages/compiler-cli/src/ngtsc/entry_point/src/generator.ts` L26–37 （▶ の行: 27, 36）

```ts
26 │     this.flatIndexPath =
27 ▶       join(dirname(entryPoint), relativeFlatIndexPath).replace(/\.js$/, '') + '.ts';
28 │   }
29 │ 
30 │   makeTopLevelShim(): ts.SourceFile {
31 │     const relativeEntryPoint = relativePathBetween(this.flatIndexPath, this.entryPoint);
32 │     const contents = `/**
33 │  * Generated bundle index. Do not edit.
34 │  */
35 │ 
36 ▶ export * from '${relativeEntryPoint}';
37 │ `;
```

もう 1 つの shim、flat module index の中身です。27 行目で `flatModuleOutFile` の `.js` を `.ts` にした名前を作り、36 行目の `export * from '…'` 1 行を書きます。こちらは `shouldEmit = true` なので、本当に .js として出力されます。

## 4. ts.createProgram と、そのあとの片付け

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L82–88 （▶ の行: 82–83, 86）

```ts
82 ▶     this.tsProgram = perfRecorder.inPhase(PerfPhase.TypeScriptProgramCreate, () =>
83 ▶       ts.createProgram(this.host.inputFiles, options, this.host, reuseProgram),
84 │     );
85 │ 
86 ▶     perfRecorder.phase(PerfPhase.Unaccounted);
87 │     perfRecorder.memory(PerfCheckpoint.TypeScriptProgramCreate);
88 │ 
```

83 行目。`ts.createProgram` に渡すのは `this.host.inputFiles`（rootNames ＋ shim の名前）、包んだホスト、そして 71 行目の再利用するプログラムです。前回のプログラムを第 4 引数に渡すと、TypeScript は中身の変わらないファイルの `ts.SourceFile` を使い回します。そのために、作る前に前回のファイルの参照を書き足し直しています（`retagAllTsFiles`。この行は [typecheck-program-driver の章](../typecheck/04-typecheck-program-driver.md)が引用しています）。参照の一覧が前回と違うと、TypeScript は「変わった」とみなすからです。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/host.ts` L170–193 （▶ の行: 176–177, 184–185, 191–192）

```ts
170 │   /**
171 │    * Retrieves a set of `ts.SourceFile`s which should not be emitted as JS files.
172 │    *
173 │    * Available after this host is used to create a `ts.Program` (which causes all the files in the
174 │    * program to be enumerated).
175 │    */
176 ▶   get ignoreForEmit(): Set<ts.SourceFile> {
177 ▶     return this.shimAdapter.ignoreForEmit;
178 │   }
179 │ 
180 │   /**
181 │    * Retrieve the array of shim extension prefixes for which shims were created for each original
182 │    * file.
183 │    */
184 ▶   get shimExtensionPrefixes(): string[] {
185 ▶     return this.shimAdapter.extensionPrefixes;
186 │   }
187 │ 
188 │   /**
189 │    * Performs cleanup that needs to happen after a `ts.Program` has been created using this host.
190 │    */
191 ▶   postProgramCreationCleanup(): void {
192 ▶     this.shimTagger.finalize();
193 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/shims/src/reference_tagger.ts` L80–87 （▶ の行: 84–85）

```ts
80 │   /**
81 │    * Disable the `ShimReferenceTagger` and free memory associated with tracking tagged files.
82 │    */
83 │   finalize(): void {
84 ▶     this.enabled = false;
85 ▶     this.tagged.clear();
86 │   }
87 │ }
```

プログラムを作り終えたら、`NgtscProgram` は `postProgramCreationCleanup` を呼びます（191〜193 行目）。中身は書き足し係の 84 行目、`enabled = false` にして、以後は書き足さないことだけです。176〜178 行目の `ignoreForEmit` は 3 節の 107〜109 行目で集めた「emit しない shim」の集合、184〜186 行目は型チェックのプログラムを作る `TsCreateProgramDriver` に渡す拡張子の前置きです。

📄 `angular/packages/compiler-cli/src/ngtsc/shims/src/expando.ts` L148–172 （▶ の行: 155, 170）

```ts
148 │ export function untagTsFile(sf: ts.SourceFile): void {
149 │   if (sf.isDeclarationFile || !isExtended(sf)) {
150 │     return;
151 │   }
152 │ 
153 │   const ext = sfExtensionData(sf);
154 │   if (ext.originalReferencedFiles !== null) {
155 ▶     sf.referencedFiles = ext.originalReferencedFiles as Array<ts.FileReference>;
156 │   }
157 │ }
158 │ 
159 │ /**
160 │  * Apply the previously tagged `referencedFiles` to the given `ts.SourceFile`, if it was previously
161 │  * tagged.
162 │  */
163 │ export function retagTsFile(sf: ts.SourceFile): void {
164 │   if (sf.isDeclarationFile || !isExtended(sf)) {
165 │     return;
166 │   }
167 │ 
168 │   const ext = sfExtensionData(sf);
169 │   if (ext.taggedReferenceFiles !== null) {
170 ▶     sf.referencedFiles = ext.taggedReferenceFiles as Array<ts.FileReference>;
171 │   }
172 │ }
```

書き足した参照は、そのままでは emit の結果に `/// <reference>` として出てしまいます。そこで emit の直前（`NgCompiler.prepareEmit`、[第 3 回](03-ngtsc-compiler-ticket.md)）に 155 行目で元の一覧へ戻し、次のビルドや型チェックのプログラムを作るときに 170 行目で書き足した一覧へ戻します。元の一覧と書き足した一覧は、どちらも `ts.SourceFile` に直接ぶら下げた拡張のデータ（`sfExtensionData`）に覚えてあります。

## 5. チケットの選び方

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L97–114 （▶ の行: 98–101, 103–104, 107, 113）

```ts
 97 │ 
 98 ▶     this.incrementalStrategy =
 99 ▶       oldProgram !== undefined
100 ▶         ? oldProgram.incrementalStrategy.toNextBuildStrategy()
101 ▶         : new TrackedIncrementalBuildStrategy();
102 │     const modifiedResourceFiles = new Set<AbsoluteFsPath>();
103 ▶     if (this.host.getModifiedResourceFiles !== undefined) {
104 ▶       const strings = this.host.getModifiedResourceFiles();
105 │       if (strings !== undefined) {
106 │         for (const fileString of strings) {
107 ▶           modifiedResourceFiles.add(absoluteFrom(fileString));
108 │         }
109 │       }
110 │     }
111 │ 
112 │     let ticket: CompilationTicket;
113 ▶     if (oldProgram === undefined) {
114 │       ticket = freshCompilationTicket(
```

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L123–136 （▶ の行: 123–125, 129, 135）

```ts
123 ▶     } else {
124 ▶       ticket = incrementalFromCompilerTicket(
125 ▶         oldProgram.compiler,
126 │         this.tsProgram,
127 │         this.incrementalStrategy,
128 │         programDriver,
129 ▶         modifiedResourceFiles,
130 │         perfRecorder,
131 │       );
132 │     }
133 │ 
134 │     // Create the NgCompiler which will drive the rest of the compilation.
135 ▶     this.compiler = NgCompiler.fromTicket(ticket, this.host);
136 │   }
```

1. **98〜101 行目：差分ビルドの記録の置き場を受け継ぐ**

   前回があれば、前回の `TrackedIncrementalBuildStrategy` から次の 1 つを作り、無ければ新しく作ります。前回の解析の結果はこの箱を通って受け継がれます（[第 14 回](14-ngtsc-incremental.md)）。
2. **103〜110 行目：変わったリソースの一覧を読む**

   ホストに `getModifiedResourceFiles` があれば（ngc では [第 1 回](01-ngtsc-overview.md)の `performCompilation` が、CLI では自分のホストが生やす）、変わった `.html`・`.css` のパスを集めます。
3. **113 行目：前回が無ければ `freshCompilationTicket`**

   型チェッカーを外から使う設定（`enableTemplateTypeChecker`）も、壊れたデータを使う設定（`usePoisonedData`）も `false` で作ります（この呼び出しは [standalone-imports-check の章](../standalone/03-standalone-imports-check.md)が引用しています）。
4. **123〜131 行目：前回があれば `incrementalFromCompilerTicket`**

   前回の `NgCompiler`（125 行目）と変わったリソース（129 行目）を渡します。4 種類のチケットの中身と違いは [第 3 回](03-ngtsc-compiler-ticket.md)で読みます。
5. **135 行目：`NgCompiler.fromTicket(ticket, this.host)`**

   包んだホストを `NgCompilerAdapter`（NgCompiler がホストに求める窓口）として渡します。ここまでで、Angular の解析はまだ 1 行も走っていません。

## 6. getTsProgram と getReuseTsProgram

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L138–152 （▶ の行: 139, 143, 149–150）

```ts
138 │   getTsProgram(): ts.Program {
139 ▶     return this.tsProgram;
140 │   }
141 │ 
142 │   getReuseTsProgram(): ts.Program {
143 ▶     return this.compiler.getCurrentProgram();
144 │   }
145 │ 
146 │   getTsOptionDiagnostics(
147 │     cancellationToken?: ts.CancellationToken | undefined,
148 │   ): readonly ts.Diagnostic[] {
149 ▶     return this.compiler.perfRecorder.inPhase(PerfPhase.TypeScriptDiagnostics, () =>
150 ▶       this.tsProgram.getOptionsDiagnostics(cancellationToken),
151 │     );
152 │   }
```

139 行目の `getTsProgram()` は 83 行目で作ったプログラム、143 行目の `getReuseTsProgram()` は `NgCompiler` が**いま**持っているプログラムです。テンプレートの型チェックは、shim に TCB を書き込んだ新しい `ts.Program` を作り、`NgCompiler` はそれを「いまのプログラム」として覚えます。次のビルドで再利用すべきなのはこちら（shim の中身まで最新）なので、2 節の 71 行目も `getCurrentProgram()` を使います。デモの 3 つ目の場面で、2 つが別物になるのを見ます。149〜150 行目のように、TypeScript の診断も `perfRecorder.inPhase` で段の時間を測りながら `this.tsProgram` に聞きます。

## 7. emit()：prepareEmit の変換を TypeScript に渡す

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L302–340 （▶ の行: 306–310, 319, 327, 330, 334–335, 338）

```ts
302 │     const forceEmit = opts?.forceEmit ?? false;
303 │ 
304 │     this.compiler.perfRecorder.memory(PerfCheckpoint.PreEmit);
305 │ 
306 ▶     const res = this.compiler.perfRecorder.inPhase(PerfPhase.TypeScriptEmit, () => {
307 ▶       const {transformers} = this.compiler.prepareEmit();
308 ▶       const ignoreFiles = this.compiler.ignoreForEmit;
309 ▶       const emitCallback = (opts?.emitCallback ??
310 ▶         defaultEmitCallback) as api.TsEmitCallback<CbEmitRes>;
311 │ 
312 │       const writeFile: ts.WriteFileCallback = (
313 │         fileName: string,
314 │         data: string,
315 │         writeByteOrderMark: boolean,
316 │         onError: ((message: string) => void) | undefined,
317 │         sourceFiles: ReadonlyArray<ts.SourceFile> | undefined,
318 │       ) => {
319 ▶         if (sourceFiles !== undefined) {
320 │           // Record successful writes for any `ts.SourceFile` (that's not a declaration file)
321 │           // that's an input to this write.
322 │           for (const writtenSf of sourceFiles) {
323 │             if (writtenSf.isDeclarationFile) {
324 │               continue;
325 │             }
326 │ 
327 ▶             this.compiler.incrementalCompilation.recordSuccessfulEmit(writtenSf);
328 │           }
329 │         }
330 ▶         this.host.writeFile(fileName, data, writeByteOrderMark, onError, sourceFiles);
331 │       };
332 │ 
333 │       const customTransforms = opts && opts.customTransformers;
334 ▶       const beforeTransforms = transformers.before || [];
335 ▶       const afterDeclarationsTransforms = transformers.afterDeclarations;
336 │ 
337 │       if (customTransforms !== undefined && customTransforms.beforeTs !== undefined) {
338 ▶         beforeTransforms.push(...customTransforms.beforeTs);
339 │       }
340 │ 
```

1. **307 行目：`this.compiler.prepareEmit()`**

   ここで初めて解析が要るので、まだなら解析が走ります。戻り値は TypeScript の変換（`before` と `afterDeclarations`）です（並びは [第 3 回](03-ngtsc-compiler-ticket.md)）。
2. **309〜310 行目：emit の仕方は差し替えられる**

   呼び出し側が `emitCallback` を渡さなければ、下の `defaultEmitCallback` を使います。
3. **312〜331 行目：書き込みを横取りして「書けた」を記録する**

   327 行目で、出力の元になった .ts を差分ビルドの記録に「emit 済み」と知らせ、330 行目で本当のホストに書きます。次のビルドでは、変わっていないファイルの emit を飛ばせます。
4. **334〜339 行目：利用者の変換は Angular の変換の後ろ**

   `customTransformers.beforeTs` は Angular の `before` の配列の後ろに足されます。Angular がデコレーターを消して `ɵcmp` を足したあとの AST を受け取ることになります。

このあとのループで、`.d.ts` と `ignoreForEmit`（emit しない shim）を飛ばしながらファイルごとに `emitCallback` を呼びます（ループは [typecheck-context の章](../typecheck/03-typecheck-context.md)が引用しています）。

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L372–388 （▶ の行: 376, 380–382）

```ts
372 │       this.compiler.perfRecorder.memory(PerfCheckpoint.Emit);
373 │ 
374 │       // Run the emit, including a custom transformer that will downlevel the Ivy decorators in
375 │       // code.
376 ▶       return ((opts && opts.mergeEmitResultsCallback) || mergeEmitResults)(emitResults);
377 │     });
378 │ 
379 │     // Record performance analysis information to disk if we've been asked to do so.
380 ▶     if (this.options.tracePerformance !== undefined) {
381 ▶       const perf = this.compiler.perfRecorder.finalize();
382 ▶       getFileSystem().writeFile(
383 │         getFileSystem().resolve(this.options.tracePerformance),
384 │         JSON.stringify(perf, null, 2),
385 │       );
386 │     }
387 │     return res;
388 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/program.ts` L414–428 （▶ の行: 422, 427）

```ts
414 │ const defaultEmitCallback: api.TsEmitCallback<ts.EmitResult> = ({
415 │   program,
416 │   targetSourceFile,
417 │   writeFile,
418 │   cancellationToken,
419 │   emitOnlyDtsFiles,
420 │   customTransformers,
421 │ }) =>
422 ▶   program.emit(
423 │     targetSourceFile,
424 │     writeFile,
425 │     cancellationToken,
426 │     emitOnlyDtsFiles,
427 ▶     customTransformers,
428 │   );
```

376 行目で、ファイルごとの結果を 1 つにまとめます。380〜386 行目、`tracePerformance` があれば記録係を締めて JSON に書きます（[第 1 回](01-ngtsc-overview.md)のデモの段ごとの時間はこれです）。既定の emit は 422 行目の `program.emit` そのもので、427 行目に Angular の変換を渡します。**JS を書くのはあくまで TypeScript**で、Angular は変換の関数を差し込むだけです。

### isShim と isResource

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/host.ts` L276–293 （▶ の行: 282, 292）

```ts
276 │   /**
277 │    * Check whether the given `ts.SourceFile` is a shim file.
278 │    *
279 │    * If this returns false, the file is user-provided.
280 │    */
281 │   isShim(sf: ts.SourceFile): boolean {
282 ▶     return isShim(sf);
283 │   }
284 │ 
285 │   /**
286 │    * Check whether the given `ts.SourceFile` is a resource file.
287 │    *
288 │    * This simply returns `false` for the compiler-cli since resource files are not added as root
289 │    * files to the project.
290 │    */
291 │   isResource(sf: ts.SourceFile): boolean {
292 ▶     return false;
293 │   }
```

`NgCompiler` はホストに「これは shim か」「これはリソースか」を聞きます。shim のファイルは診断の対象から外されます（`ignoreForDiagnostics`、[第 3 回](03-ngtsc-compiler-ticket.md)のコンストラクタ）。292 行目、ngc ではテンプレートや CSS はプログラムのファイルにならないので、`isResource` は常に `false` です。言語サービスは外部テンプレートを tsserver のファイルとして開くので、自分のアダプターで別の答えを返します（[ls-compiler-factory の章](../ls/05-ls-compiler-factory.md)）。

## 8. tsc\_plugin.ts：NgTscPlugin との違い

`NgTscPlugin` は、Bazel の `tsc_wrapped`（Google の中で使う TypeScript のビルド係）のプラグインとして Angular のコンパイルを差し込む形です。`NgtscProgram` と違い、**`ts.Program` を作るのはプラグインを呼ぶ側**です。

📄 `angular/packages/compiler-cli/src/ngtsc/tsc_plugin.ts` L92–103 （▶ の行: 100–101）

```ts
 92 │   wrapHost(
 93 │     host: ts.CompilerHost & Partial<UnifiedModulesHost>,
 94 │     inputFiles: readonly string[],
 95 │     options: ts.CompilerOptions,
 96 │   ): PluginCompilerHost {
 97 │     // TODO(alxhub): Eventually the `wrapHost()` API will accept the old `ts.Program` (if one is
 98 │     // available). When it does, its `ts.SourceFile`s need to be re-tagged to enable proper
 99 │     // incremental compilation.
100 ▶     this.options = {...this.ngOptions, ...options} as NgCompilerOptions;
101 ▶     this.host = NgCompilerHost.wrap(host, inputFiles, this.options, /* oldProgram */ null);
102 │     return this.host;
103 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/tsc_plugin.ts` L140–170 （▶ の行: 140–141, 152, 165, 167–168）

```ts
140 ▶     if (oldProgram === undefined || oldState === null) {
141 ▶       ticket = freshCompilationTicket(
142 │         program,
143 │         this.options,
144 │         strategy,
145 │         programDriver,
146 │         perfRecorder,
147 │         /* enableTemplateTypeChecker */ false,
148 │         /* usePoisonedData */ false,
149 │       );
150 │     } else {
151 │       strategy.toNextBuildStrategy().getIncrementalState(oldProgram);
152 ▶       ticket = incrementalFromStateTicket(
153 │         oldProgram,
154 │         oldState,
155 │         program,
156 │         this.options,
157 │         strategy,
158 │         programDriver,
159 │         modifiedResourceFiles,
160 │         perfRecorder,
161 │         false,
162 │         false,
163 │       );
164 │     }
165 ▶     this._compiler = NgCompiler.fromTicket(ticket, this.host);
166 │     return {
167 ▶       ignoreForDiagnostics: this._compiler.ignoreForDiagnostics,
168 ▶       ignoreForEmit: this._compiler.ignoreForEmit,
169 │     };
170 │   }
```

📄 `angular/packages/compiler-cli/src/ngtsc/tsc_plugin.ts` L183–192 （▶ の行: 184, 191）

```ts
183 │   getNextProgram(): ts.Program {
184 ▶     return this.compiler.getCurrentProgram();
185 │   }
186 │ 
187 │   createTransformers(): ts.CustomTransformers {
188 │     // The plugin consumer doesn't know about our perf tracing system, so we consider the emit phase
189 │     // as beginning now.
190 │     this.compiler.perfRecorder.phase(PerfPhase.TypeScriptEmit);
191 ▶     return this.compiler.prepareEmit().transformers;
192 │   }
```

|   | NgtscProgram（ngc・CLI） | NgTscPlugin（tsc\_wrapped） |
| --- | --- | --- |
| ホストを包む | コンストラクタの 72 行目 | `wrapHost` の 101 行目（前回のプログラムは `null`） |
| `ts.Program` を作る | 自分で（83 行目） | 呼ぶ側が作って `setupCompilation` に渡す |
| 前回の記録の置き場 | `TrackedIncrementalBuildStrategy`（前の `NgtscProgram` が持つ） | `PatchedProgramIncrementalBuildStrategy`（`ts.Program` に直接ぶら下げる） |
| 差分のチケット | `incrementalFromCompilerTicket`（124 行目） | `incrementalFromStateTicket`（152 行目）。前の `NgCompiler` を持っていないので、プログラムと記録から作る |
| emit | `emit()` の中で TypeScript の emit まで呼ぶ | `createTransformers()` で変換だけを返す（191 行目） |

184 行目の `getNextProgram()` は、6 節の `getReuseTsProgram()` と同じく `getCurrentProgram()` を返します。呼ぶ側は次のビルドでこれを再利用します。

## 9. DEMO：getSourceFiles() にあるファイル

> **🧪 DEMO — NgtscProgram の ts.Program に入っているファイル（記録の再生）**
>
> これは記録です。@angular/compiler-cli 22.1.6 を Node で動かした結果です（@angular/compiler-cli 22.1.6 / TypeScript 6.0.3）。3 つの .ts（下）を `new NgtscProgram(rootNames, options, host)` に渡し、`getTsProgram().getSourceFiles()` のうち .d.ts でないファイルを並べました。「shim か」は `isShim`、「emit しない」「診断しない」は `compiler.ignoreForEmit`・`compiler.ignoreForDiagnostics` に入っているか、「参照」は `sf.referencedFiles` です。
>
> 場面のボタンを押してください。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-program)

記録から読み取れることです。

1. **既定：3 つの .ts に 3 つの `.ngtypecheck.ts`**

   `inputFiles` は 6 つ（160 行目で rootNames の後ろに shim の名前が 3 つ）。shim は「emit しない」「診断しない」の両方に入り、利用者のファイルの referencedFiles にはそれぞれの shim が書き足されています（道 2）。emit のあとは referencedFiles が空に戻ります（4 節の 155 行目）。
2. **flatModuleOutFile：rootNames が 1 つでも shim は 4 つ**

   `inputFiles` は `index.ts`・`public-api.ts`（top-level shim、道 1）・`index.ngtypecheck.ts`（道 1'）の 3 つだけです。それでも `app.component.ngtypecheck.ts` と `shout.pipe.ngtypecheck.ts` がプログラムにあるのは、`index.ts` の export をたどって読んだファイルに道 2 の参照が書き足されたからです。`public-api.ts` は shim ですが「emit しない」には入りません（`shouldEmit = true`）。
3. **型チェックのあと：別のプログラムができている**

   `getTsProgram() === getReuseTsProgram()` が `false` です。`app.component.ngtypecheck.ts` の中身を比べると、`getTsProgram()` では 40 行目の 1 行のまま、`getReuseTsProgram()` では TCB が書き込まれています（テンプレートを持つのは `App` だけなので、`shout.pipe.ngtypecheck.ts` と `index.ngtypecheck.ts` は 1 行のままです）。TCB の先頭の import のパスが `../` を 7 回たどる長い形になっているのは記録した環境（一時ディレクトリの場所）で出たもので、この章ではその理由を追いません。

📄 `scratchpad の記録スクリプト（program.mjs、angular-deep-dive を cwd にして node で実行）`

```
// ngtsc-program の記録: NgtscProgram を作り、getTsProgram().getSourceFiles() のうち、プロジェクトのファイルを並べる。
// 使い方: cd angular-deep-dive && node <このファイル> > program.json
import {mkdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const req = createRequire(join(process.cwd(), 'package.json'));
const load = (id) => import(pathToFileURL(req.resolve(id)).href);
const {NgtscProgram, NodeJSFileSystem, setFileSystem, createCompilerHost, isShim, VERSION} =
  await load('@angular/compiler-cli');
const ts = (await load('typescript')).default;

const tmp = join(dirname(fileURLToPath(import.meta.url)), 'tmp-program');
rmSync(tmp, {recursive: true, force: true});
mkdirSync(join(tmp, 'src'), {recursive: true});
symlinkSync(join(process.cwd(), 'node_modules'), join(tmp, 'node_modules'), 'dir');

const files = {
  'src/shout.pipe.ts': `import {Pipe} from '@angular/core';
@Pipe({name: 'shout'})
export class ShoutPipe {
  transform(v: string) { return v.toUpperCase(); }
}
`,
  'src/app.component.ts': `import {Component} from '@angular/core';
import {ShoutPipe} from './shout.pipe';
@Component({selector: 'app-root', imports: [ShoutPipe], template: '{{ title | shout }}'})
export class App {
  title = 'ngtsc';
}
`,
  'src/index.ts': `export * from './app.component';
export * from './shout.pipe';
`,
};
for (const [name, text] of Object.entries(files)) writeFileSync(join(tmp, name), text);
setFileSystem(new NodeJSFileSystem());

const baseOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  declaration: true,
  skipLibCheck: true,
  rootDir: join(tmp, 'src'),
  outDir: join(tmp, 'out'),
  strictTemplates: true,
};

function describeFiles(program, ngProgram) {
  const rows = [];
  let dts = 0;
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) {
      dts++;
      continue;
    }
    rows.push({
      file: relative(tmp, sf.fileName),
      shim: isShim(sf),
      ignoreForEmit: ngProgram.compiler.ignoreForEmit.has(sf),
      ignoreForDiagnostics: ngProgram.compiler.ignoreForDiagnostics.has(sf),
      referencedFiles: sf.referencedFiles.map((r) => relative(tmp, r.fileName)),
      text: sf.text.length > 400 ? sf.text.slice(0, 400) + '…（' + sf.text.length + ' 文字）' : sf.text,
    });
  }
  return {dtsCount: dts, files: rows};
}

function scene(id, title, rootNames, extraOptions, afterCreate) {
  const options = {...baseOptions, ...extraOptions};
  const host = createCompilerHost({options});
  host.writeFile = () => {}; // emit の結果はこの場面では使わない
  const p = new NgtscProgram(rootNames.map((f) => join(tmp, f)), options, host);
  const created = describeFiles(p.getTsProgram(), p);
  const out = {
    id,
    title,
    rootNames,
    options: extraOptions,
    // NgCompilerHost.inputFiles（program.ts 83 行目で ts.createProgram に渡す配列。private の host を JS から読む）
    hostInputFiles: p.host.inputFiles.map((f) => relative(tmp, f)),
    afterConstructor: created,
  };
  afterCreate?.(p, out);
  return out;
}

const scenes = [
  scene('default', '既定：rootNames に 3 つの .ts', ['src/app.component.ts', 'src/shout.pipe.ts', 'src/index.ts'], {}, (p, out) => {
    // emit すると prepareEmit の untagAllTsFiles で referencedFiles が元に戻る
    const diags = p.getNgSemanticDiagnostics();
    out.ngSemanticDiagnostics = diags.length;
    p.emit();
    const sf = p.getTsProgram().getSourceFile(join(tmp, 'src/app.component.ts'));
    out.afterEmitReferencedFiles = sf.referencedFiles.map((r) => relative(tmp, r.fileName));
  }),
  scene('flat', 'flatModuleOutFile を付けて、rootNames を index.ts 1 つに', ['src/index.ts'], {flatModuleOutFile: 'public-api.js'}),
  scene('reuse', '型チェックのあと：getTsProgram と getReuseTsProgram', ['src/app.component.ts', 'src/shout.pipe.ts', 'src/index.ts'], {}, (p, out) => {
    const diags = p.getNgSemanticDiagnostics();
    out.ngSemanticDiagnostics = diags.length;
    out.sameProgram = p.getTsProgram() === p.getReuseTsProgram();
    out.afterTypeCheck = {
      tsProgram: describeFiles(p.getTsProgram(), p),
      reuseTsProgram: describeFiles(p.getReuseTsProgram(), p),
    };
  }),
];

console.log(
  JSON.stringify(
    {compilerCli: VERSION.full, typescript: ts.version, inputs: files, scenes},
    null,
    2,
  ),
);
rmSync(tmp, {recursive: true, force: true});

```

## ここまでの呼び出し

- 👤 `new NgtscProgram(rootNames, options, host, oldProgram?)` — ngc の createProgram か、CLI
  - `ActivePerfRecorder.zeroedToNow()` — program.ts 56
  - `NgCompilerHost.wrap()` — core/src/host.ts 199 — *TypeCheckShimGenerator・FlatIndexGenerator・ShimAdapter・ShimReferenceTagger*
    - `new ShimAdapter()` — shims/src/adapter.ts — *extraInputFiles を作る（道 1・1'）*
  - `ts.createProgram(host.inputFiles, options, host, reuseProgram)` — program.ts 83
    - `NgCompilerHost.getSourceFile()` — core/src/host.ts 295 — *shim なら maybeGenerate、違えば読んで tag（道 2）*
  - `host.postProgramCreationCleanup()` — core/src/host.ts 191 — *tagger.finalize*
  - `freshCompilationTicket()` か `incrementalFromCompilerTicket()` — program.ts 113・124
  - `NgCompiler.fromTicket(ticket, host)` — program.ts 135 — *第 3 回*
- 👤 `program.emit()` — program.ts
  - `compiler.prepareEmit()` — program.ts 307 — *解析がまだなら、ここで走る*
  - `defaultEmitCallback()` → `tsProgram.emit(sf, writeFile, …, transformers)` — program.ts 414-428

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| src/ngtsc/shims/test/adapter\_spec.ts・reference\_tagger\_spec.ts | describe `ShimAdapter`（18 行目）の it 4 件（`should recognize a basic shim name`・`should detect a prior shim if one is available` など）、describe `ShimReferenceTagger`（21 行目）の it 8 件（`should not tag shims after finalization`（76）・`should be able to untag references and retag them later`（117）など） | `//packages/compiler-cli/src/ngtsc/shims/test:test` |
| src/ngtsc/entry\_point/test/entry\_point\_spec.ts | describe `findFlatIndexEntryPoint`（17 行目） | `//packages/compiler-cli/src/ngtsc/entry_point/test:test` |
| test/ngtsc/ngtsc\_spec.ts | describe `flat module indices`（7925 行目、it 13 件）・`disableTypeScriptVersionCheck`（9117 行目、it 4 件） | `//packages/compiler-cli/test/ngtsc:ngtsc`（shard 4 つ） |
| src/ngtsc/core/test/compiler\_spec.ts | 各 it が `NgCompilerHost.wrap` → `ts.createProgram` を手で組む（下の引用） | `//packages/compiler-cli/src/ngtsc/core/test:test` |

📄 `angular/packages/compiler-cli/src/ngtsc/core/test/compiler_spec.ts` L393–409 （▶ の行: 396–398, 403）

```ts
393 │         const options: NgCompilerOptions = {
394 │           strictTemplates: true,
395 │         };
396 ▶         const baseHost = new NgtscCompilerHost(getFileSystem(), options);
397 ▶         const host = NgCompilerHost.wrap(baseHost, [COMPONENT], options, /* oldProgram */ null);
398 ▶         const program = ts.createProgram({host, options, rootNames: host.inputFiles});
399 │         const compilerA = makeFreshCompiler(
400 │           host,
401 │           options,
402 │           program,
403 ▶           new TsCreateProgramDriver(program, host, options, []),
404 │           new NoopIncrementalBuildStrategy(),
405 │           /** enableTemplateTypeChecker */ false,
406 │           /* usePoisonedData */ false,
407 │         );
408 │ 
409 │         const componentSf = getSourceFileOrError(program, COMPONENT);
```

`NgtscProgram` のコンストラクタを、テストが手で分解した形です。396 行目で `FileSystem` の上に素のホストを作り、397 行目で 2 節の `wrap`、398 行目で `rootNames: host.inputFiles`（160 行目の shim 込みの一覧）を渡して `ts.createProgram`、403 行目で型チェック用のドライバーを作ります。ngtsc の部品を単体で試すときは、この 4 行をまねるのが近道です。

📄 `angular/packages/compiler-cli/test/ngtsc/ngtsc_spec.ts` L7925–7935 （▶ の行: 7928, 7932, 7934）

```ts
7925 │     describe('flat module indices', () => {
7926 │       it('should generate a basic flat module index', () => {
7927 │         env.tsconfig({
7928 ▶           'flatModuleOutFile': 'flat.js',
7929 │         });
7930 │         env.write('test.ts', 'export const TEST = "this is a test";');
7931 │ 
7932 ▶         env.driveMain();
7933 │         const jsContents = env.getContents('flat.js');
7934 ▶         expect(jsContents).toContain("export * from './test';");
7935 │       });
```

📄 `angular/packages/compiler-cli/test/ngtsc/ngtsc_spec.ts` L9117–9128 （▶ の行: 9121–9122, 9125–9127）

```ts
9117 │     describe('disableTypeScriptVersionCheck', () => {
9118 │       afterEach(() => restoreTypeScriptVersionForTesting());
9119 │ 
9120 │       it('produces an error when not supported and version check is enabled', () => {
9121 ▶         setTypeScriptVersionForTesting('3.4.0');
9122 ▶         env.tsconfig({disableTypeScriptVersionCheck: false});
9123 │         env.write('empty.ts', '');
9124 │ 
9125 ▶         const diags = env.driveDiagnostics();
9126 ▶         expect(diags.length).toBe(1);
9127 ▶         expect(diags[0].messageText).toContain('but 3.4.0 was found instead');
9128 │       });
```

📄 `angular/packages/compiler-cli/src/ngtsc/shims/test/reference_tagger_spec.ts` L76–85 （▶ の行: 78, 83–84）

```ts
76 │     it('should not tag shims after finalization', () => {
77 │       const tagger = new ShimReferenceTagger(['test1', 'test2']);
78 ▶       tagger.finalize();
79 │ 
80 │       const fileName = _('/file.ts');
81 │       const sf = makeArbitrarySf(fileName);
82 │ 
83 ▶       tagger.tag(sf);
84 ▶       expectReferencedFiles(sf, []);
85 │     });
```

flat module の it は、7928 行目の設定 → 7932 行目の `env.driveMain()`（[第 19 回](19-ngtsc-test-env.md)）→ 7934 行目で出力の `flat.js` に 3 節の 36 行目の 1 行があるかを見ます。版の確認の it は、9121 行目で TypeScript の版を偽って、1 節の 61〜63 行目がエラーを出すことを 9126〜9127 行目で確かめます。書き足し係の it は、78 行目で `finalize` したあとの 83 行目の `tag` が何もしないことを見ます（4 節の 84 行目）。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/shims/test:test //packages/compiler-cli/src/ngtsc/entry_point/test:test --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc '--test_arg=--filter=flat module indices' --nocache_test_results --test_output=all
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc '--test_arg=--filter=disableTypeScriptVersionCheck' --nocache_test_results --test_output=all
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/ngtsc-logs/a-units.log・a-ngtsc-flat.log・a-ngtsc-tsversion.log）`

```
//packages/compiler-cli/src/ngtsc/shims/test:test        48 specs, 0 failures  PASSED in 0.6s
//packages/compiler-cli/src/ngtsc/entry_point/test:test  12 specs, 0 failures  PASSED in 0.9s

flat module indices（4 つの shard）
Ran 12 of 6714 specs / Ran 13 of 6715 specs / Ran 13 of 6715 specs / Ran 14 of 6716 specs
INFO: Elapsed time: 2.900s
//packages/compiler-cli/test/ngtsc:ngtsc   PASSED in 2.4s

disableTypeScriptVersionCheck（4 つの shard）
Ran 4 of 6742 specs ×4
INFO: Elapsed time: 2.385s
//packages/compiler-cli/test/ngtsc:ngtsc   PASSED in 2.1s
```

- shims の 48 件は it 12 件 × 4 つのファイルシステム、entry\_point の 12 件も同じ数え方です。
- `flat module indices` は 4 つの shard の `Ran` を足すと 12 + 13 + 13 + 14 = 52 件で、it 13 件 × 4 つのファイルシステム（`ngtsc_spec.ts` も `runInEachFileSystem` で包まれている）と合います。`disableTypeScriptVersionCheck` は各 shard で 4 件ずつでした。shard ごとに「of N」の N が違う理由は確かめていません。

### 直すとしたら

- shim が入らない・入りすぎる不具合は、`ShimAdapter` の `maybeGenerate`（名前の判定）と、`NgCompilerHost.getSourceFile`（どちらの道か）が入口です。単体の it は `adapter_spec.ts`・`reference_tagger_spec.ts` に、プログラム全体の振る舞いは `ngtsc_spec.ts` の `env.driveMain()` の形で足します。
- 書き足した参照の出し入れは、最近も直されています。ae0ec7315c6（2026-07-14、fix）は、型チェック用のプログラムを作る `TsCreateProgramDriver.updateFiles` の最後に `retagAllTsFiles(this.program)` を 1 行足しました。前は古いプログラムの参照を元に戻す（155 行目）と、TypeScript が使い回した同じ `ts.SourceFile` を共有する新しいプログラムの側まで元に戻り、TS 5.5 以降で `getSemanticDiagnostics()` が `referencedFiles[index]` の読み出しで落ちていました。後は新しいプログラムの側を 170 行目で書き足し直します。spec は `typecheck/test/program_spec.ts` に it 3 件（`should retain shim tags on shared SourceFiles after updateFiles` など）が足されています。デモの 3 つ目の場面で、型チェックのあとも referencedFiles が書き足されたままなのは、この行のためです。
- 本家に PR を出すことは勧めません。「emit した .js に `/// <reference path="….ngtypecheck.ts" />` が出る」「型チェックのあとに TypeScript の診断で落ちる」という issue を見たら、4 節の書き足しと戻しの順番を疑い、上の 2 つの spec の形で手元で再現します（[第 20 回](20-ngtsc-issues.md)）。

## 聞かれそうな質問

**Q. `.ngtypecheck.ts` というファイルはディスクのどこにありますか？**

どこにもありません。`NgCompilerHost.getSourceFile` の 302〜305 行目で、名前を聞かれたときにメモリの上で作って返します。最初の中身は `export const USED_FOR_NG_TYPE_CHECKING = true;` の 1 行（40 行目）で、emit もしません（23 行目）。

**Q. rootNames に入れていないファイルにも shim ができるのはなぜですか？**

元のファイルを読んだときに、319 行目で `referencedFiles` に shim の名前を書き足すからです。TypeScript はこの一覧にあるファイルもプログラムに入れます。rootNames のファイルの shim は、それとは別に 119〜123 行目で入力の一覧にも足します（`noResolve` のため）。

**Q. 前回の `NgtscProgram` を渡すと何が速くなりますか？**

2 つあります。83 行目の `ts.createProgram` に前回のプログラムが渡り、TypeScript が変わらないファイルを使い回すこと。そして 124 行目で `incrementalFromCompilerTicket` を選び、Angular の解析の結果も変わらないファイルの分は使い回すことです（[第 14 回](14-ngtsc-incremental.md)）。

**Q. 次のビルドに渡すのは `getTsProgram()` ではだめですか？**

型チェックのあとは、`NgCompiler` が持つプログラム（143 行目、`getReuseTsProgram()`）の方が shim の中身まで新しいので、71 行目もそちらを使います。デモの 3 つ目の場面で、2 つが別物で、shim の中身が違うのを確かめられます。

**Q. 独自の TypeScript の変換を足すと、Angular の変換の前と後のどちらで動きますか？**

`customTransformers.beforeTs` は 338 行目で Angular の `before` の配列の後ろに足されるので、後です。Angular がデコレーターを処理したあとの AST を受け取ります。

## 読み終えて

- `NgtscProgram` はホストを `NgCompilerHost` で包み、shim の名前を足した `inputFiles` で `ts.createProgram` します。
- shim は「入力の一覧に足す」道と「元のファイルの referencedFiles に書き足す」道の 2 つで入り、emit の前に書き足しを戻します。
- 前回が無ければ `freshCompilationTicket`、あれば `incrementalFromCompilerTicket`。どちらも `NgCompiler.fromTicket` に渡すだけで、解析はまだ走りません。
- `emit()` は `prepareEmit` の変換を TypeScript の `program.emit` に渡し、書けたファイルを差分ビルドの記録に知らせます。
- `NgTscPlugin` は同じ部品を使いますが、プログラムを作るのも emit するのも呼ぶ側です。

---

← 前: [ngtsc の全体像：tsc の横で動くもう 1 つのコンパイラ](01-ngtsc-overview.md)  
次: [NgCompiler とチケット：新しく作るか、前の結果から作るか](03-ngtsc-compiler-ticket.md) →
