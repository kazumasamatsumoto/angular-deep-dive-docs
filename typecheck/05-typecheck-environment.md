[目次](../README.md) › [テンプレート型チェックの内側](README.md) › 第 5 回 / 全 20 回

# Environment と TCB アダプタ：参照を TypeScript の式にする

> TCB の中でコンポーネント・ディレクティブ・pipe・外部の型をどう書くかを決める Environment / ReferenceEmitEnvironment と、ts の宣言を AST を持たないメタデータ（TcbDirectiveMetadata など）に移す tcb\_adapter.ts。ネイティブのプリプロセッサにつなぐための設計。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-environment)

---

TCB の中には `i0.Dir`・`_ctor1`・`_pipe1`・`i1.ɵassertType` のような名前が出てきます。これらは TCB を作る関数（compiler パッケージ）が自分で決めているのではなく、**TcbEnvironment という窓口に「この参照を TypeScript の式にして」と頼んで**返してもらった文字列です。この章では、その窓口の 5 つのメソッド、compiler-cli 側の実装 `Environment` と `ReferenceEmitEnvironment` が import を足す手順、そして ts の宣言を「AST を持たないメタデータ」に移す `tcb_adapter.ts` を、行を指して読みます。

読む対象は `packages/compiler/src/typecheck/` の `api.ts`・`ops/context.ts`、`packages/compiler-cli/src/ngtsc/typecheck/src/` の `environment.ts`・`reference_emit_environment.ts`・`tcb_adapter.ts` です。

1. [1. 全体像](01-typecheck-overview.md)
2. [2. 設定](02-typecheck-config.md)
3. [3. TCB の置き場所](03-typecheck-context.md)
4. [4. 派生プログラム](04-typecheck-program-driver.md)
5. **5. Environment**（この章）
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

> [!TIP]
> **新卒エンジニアへ**
>
> TCB（Type Check Block）の基本の形と、compiler パッケージが TCB の文字列を作り compiler-cli がそれをファイルに置くという分担は [compiler-typecheck](../compiler/17-compiler-typecheck.md) に書きました。この章はその「境目」にある窓口を読みます。

## 1. TcbEnvironment：TCB の生成器が外に頼む 5 つのこと

📄 `angular/packages/compiler/src/typecheck/api.ts` L150–164 （▶ の行: 153–155, 158–163）

```ts
150 │ export type TypeCheckId = string & {__brand: 'TypeCheckId'};
151 │ 
152 │ /**
153 ▶  * Interface representing the environment needed for TCB generation.
154 ▶  * This allows us to avoid depending on the full `Environment` class from `compiler-cli`
155 ▶  * which depends on TypeScript APIs.
156 │  */
157 │ export interface TcbEnvironment {
158 ▶   config: TypeCheckingConfig;
159 ▶   referenceTcbValue(ref: TcbReferenceMetadata): TcbExpr;
160 ▶   referenceExternalSymbol(moduleName: string, name: string): TcbExpr;
161 ▶   pipeInst(pipeMeta: TcbPipeMetadata): TcbExpr;
162 ▶   typeCtorFor(dir: TcbDirectiveMetadata): TcbExpr;
163 ▶   getPreludeStatements(): TcbExpr[];
164 │ }
```
*compiler/src/typecheck/api.ts。TCB の生成器が知っている Environment は、このインタフェースだけ*

153〜155 行目のコメントが、このインタフェースがある理由です。「TypeScript の API に依存している compiler-cli の `Environment` クラスに、依存しないで済むようにする」。compiler パッケージ（`packages/compiler`）は TypeScript を import しません。だから TCB の生成器は「クラスを指す式」を自分では作れず、ここに頼みます。

| 行 | メソッド | 頼む内容 | 呼ぶ場所（grep） |
| --- | --- | --- | --- |
| 158 | `config` | TypeCheckingConfig（[第 2 回](02-typecheck-config.md)） | ほぼ全部の op が `tcb.env.config` を読む |
| 159 | `referenceTcbValue(ref)` | コンポーネント・ディレクティブ・pipe のクラスを指す式 | type\_check\_block.ts:48（`this:` の型）、directive\_type.ts:42、inputs.ts:121、template.ts:145 |
| 160 | `referenceExternalSymbol(module, name)` | `@angular/core` などの記号を指す式 | events.ts:166・172・218、references.ts:92、inputs.ts:175、ops/expression.ts:42 |
| 161 | `pipeInst(pipe)` | pipe のインスタンスを表す変数 | ops/expression.ts:212・215・219（[第 15 回](15-typecheck-refs-pipes.md)） |
| 162 | `typeCtorFor(dir)` | ジェネリックなディレクティブの型コンストラクタ | directive\_constructor.ts:160・175（[第 9 回](09-typecheck-type-constructor.md)） |
| 163 | `getPreludeStatements()` | TCB の本体の前に置く文 | type\_check\_block.ts:93 |

`referenceExternalSymbol` に渡される組み合わせは、grep すると `('@angular/core', 'ɵassertType')`・`('@angular/core', 'TemplateRef')`・`('@angular/core', 'AnimationCallbackEvent')`・`('@angular/animations', 'AnimationEvent')` の 4 つが文字列で書かれていて、残りは `R3Identifiers`（`ɵunwrapWritableSignal` や `ɵINPUT_SIGNAL_BRAND_WRITE_TYPE`）から渡されます。

### op はどこから env にたどり着くか

📄 `angular/packages/compiler/src/typecheck/ops/context.ts` L43–63 （▶ の行: 50, 54–56）

```ts
43 │ /**
44 │  * Overall generation context for the type check block.
45 │  *
46 │  * `Context` handles operations during code generation which are global with respect to the whole
47 │  * block. It's responsible for variable name allocation and management of any imports needed. It
48 │  * also contains the template metadata itself.
49 │  */
50 ▶ export class Context {
51 │   private nextId = 1;
52 │ 
53 │   constructor(
54 ▶     readonly env: TcbEnvironment,
55 ▶     readonly domSchemaChecker: DomSchemaChecker<unknown>,
56 ▶     readonly oobRecorder: OutOfBandDiagnosticRecorder<unknown>,
57 │     readonly id: TypeCheckId,
58 │     readonly boundTarget: BoundTarget<TcbDirectiveMetadata>,
59 │     private pipes: Map<string, TcbPipeMetadata> | null,
60 │     readonly schemas: SchemaMetadata[],
61 │     readonly hostIsStandalone: boolean,
62 │     readonly hostPreserveWhitespaces: boolean,
63 │   ) {}
```
*compiler/src/typecheck/ops/context.ts。TCB 1 つにつき 1 つの Context*

54 行目、`Context` は `env` を持っています。どの `TcbOp`（[第 6 回](06-typecheck-scope.md)）も `this.tcb` にこの `Context` を持つので、`this.tcb.env.referenceTcbValue(...)` のように呼べます。55〜56 行目の `domSchemaChecker` と `oobRecorder` も同じく外から渡される窓口です（[第 8 回](08-typecheck-elements-dom.md)・[第 17 回](17-typecheck-oob.md)）。

## 2. 参照を AST なしで表す：TcbReferenceMetadata と TcbDirectiveMetadata

📄 `angular/packages/compiler/src/typecheck/api.ts` L37–61 （▶ の行: 39, 41, 43, 45, 48, 53, 58, 61）

```ts
37 │ export interface TcbReferenceMetadata {
38 │   /** The name of the class */
39 ▶   readonly name: string;
40 │   /** The module path where the symbol is located, or null if local/ambient */
41 ▶   readonly moduleName: string | null;
42 │   /** True if the symbol successfully emitted locally (no external import required) */
43 ▶   readonly isLocal: boolean;
44 │   /** If the reference could not be externally emitted, this string holds the diagnostic reason why */
45 ▶   readonly unexportedDiagnostic: string | null;
46 │ 
47 │   /** Key used to uniquely identify the target of this reference. */
48 ▶   readonly key: TcbReferenceKey;
49 │ 
50 │   /**
51 │    * Defines the `AbsoluteSourceSpan` of the target's node name, if available.
52 │    */
53 ▶   readonly nodeNameSpan?: AbsoluteSourceSpan;
54 │ 
55 │   /**
56 │    * The absolute path to the file containing the reference node, if available.
57 │    */
58 ▶   readonly nodeFilePath?: string;
59 │ }
60 │ 
61 ▶ export type TcbReferenceKey = string & {__brand: 'TcbReferenceKey'};
```

クラスへの参照は、`ts.ClassDeclaration` ではなく**文字列と真偽値だけ**で表されます。39 行目の `name`（クラス名）、41 行目の `moduleName`（import するならそのモジュール名）、43 行目の `isLocal`（import 不要か）、45 行目の `unexportedDiagnostic`（import できない理由。4 節）、48 行目の `key`（同じクラスかを見分ける文字列。61 行目の `TcbReferenceKey` は string に印を付けた型）。53・58 行目の位置は、帯域外の診断（[第 17 回](17-typecheck-oob.md)）で宣言の場所を指すために残してあります。

📄 `angular/packages/compiler/src/typecheck/api.ts` L104–139 （▶ の行: 105, 119–120, 122, 135–138）

```ts
104 │ export interface TcbDirectiveMetadata {
105 ▶   ref: TcbReferenceMetadata;
106 │   name: string;
107 │   selector: string | null;
108 │   isComponent: boolean;
109 │   isGeneric: boolean;
110 │   isStructural: boolean;
111 │   isStandalone: boolean;
112 │   isExplicitlyDeferred: boolean;
113 │   deferredBlocks?: Set<string> | null;
114 │   preserveWhitespaces: boolean;
115 │   exportAs: string[] | null;
116 │   matchSource: MatchSource;
117 │ 
118 │   /** Type parameters of the directive, if available. */
119 ▶   typeParameters: TcbTypeParameter[] | null;
120 ▶   inputs: ClassPropertyMapping<TcbInputMapping>;
121 │   outputs: ClassPropertyMapping;
122 ▶   requiresInlineTypeCtor: boolean;
123 │   ngTemplateGuards: TemplateGuardMeta[];
124 │   hasNgTemplateContextGuard: boolean;
125 │   hasNgFieldDirective: boolean;
126 │   coercedInputFields: Set<ClassPropertyName>;
127 │   restrictedInputFields: Set<ClassPropertyName>;
128 │   stringLiteralInputFields: Set<ClassPropertyName>;
129 │   undeclaredInputFields: Set<ClassPropertyName>;
130 │   publicMethods: Set<string>;
131 │   ngContentSelectors: string[] | null;
132 │   animationTriggerNames: LegacyAnimationTriggerNames | null;
133 │ }
134 │ 
135 ▶ export interface TcbComponentMetadata {
136 ▶   ref: TcbReferenceMetadata;
137 ▶   typeParameters: TcbTypeParameter[] | null;
138 ▶   typeArguments: string[] | null;
139 │ }
```

ディレクティブも同じです。105 行目の `ref` は上の `TcbReferenceMetadata`、119 行目の型引数は `TcbTypeParameter`（名前と文字列表現だけの型）、120 行目の入力は `ClassPropertyMapping` です。122 行目の `requiresInlineTypeCtor` のように、ts の宣言を見ないと決められないことは、**あらかじめ計算した結果だけ**を持ちます。135〜139 行目の `TcbComponentMetadata` は TCB の `this` になるコンポーネントで、型引数は 138 行目の文字列の配列です。

## 3. tcb\_adapter.ts：ts の宣言からメタデータを作る

では誰がこの文字列を埋めるのか。ngtsc（`ngc`）の中では `adaptTypeCheckBlockMetadata` です。呼ぶのは、shim ファイルに TCB を足す `TypeCheckFile.addTypeCheckBlock` と、元のファイルに差し込む `InlineTcbOp.execute`（context.ts）の 2 か所で、どちらも直後に `generateTypeCheckBlock` を呼びます（置き場所の分かれ方は[第 3 回](03-typecheck-context.md)）。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/tcb_adapter.ts` L50–72 （▶ の行: 51–52, 55–57, 61–62, 64–65）

```ts
50 │ /**
51 ▶  * Adapts the compiler's `TypeCheckBlockMetadata` (which includes full TS AST nodes)
52 ▶  * into a purely detached `TcbTypeCheckBlockMetadata` that can be mapped to JSON.
53 │  */
54 │ export function adaptTypeCheckBlockMetadata(
55 ▶   ref: Reference<ClassDeclaration<ts.ClassDeclaration>>,
56 ▶   meta: TypeCheckBlockMetadata,
57 ▶   env: Environment,
58 │   reflector: ReflectionHost,
59 │   genericContextBehavior: TcbGenericContextBehavior,
60 │ ): {tcbMeta: TcbTypeCheckBlockMetadata; component: TcbComponentMetadata} {
61 ▶   const refCache = new Map<Reference<ClassDeclaration>, TcbReferenceMetadata>();
62 ▶   const dirCache = new Map<TypeCheckableDirectiveMeta, TcbDirectiveMetadata>();
63 │ 
64 ▶   const canReferenceType = (r: Reference) => {
65 ▶     const result = env.refEmitter.emit(
66 │       r,
67 │       env.contextFile,
68 │       ImportFlags.NoAliasing | ImportFlags.AllowTypeImports | ImportFlags.AllowRelativeDtsImports,
69 │     );
70 │     return result.kind === ReferenceEmitKind.Success;
71 │   };
72 │ 
```

1. **51〜52 行目：何をするか**

   「TS の AST ノードを含む `TypeCheckBlockMetadata` を、JSON にできる切り離された `TcbTypeCheckBlockMetadata` に移す」。入力は 55〜56 行目のコンポーネントへの参照と、compiler-cli のメタデータです。
2. **57 行目：env を受け取る**

   `env` は compiler-cli の `Environment`（6 節）。import を作れるかどうかを、この env の `refEmitter` と `contextFile`（TCB を書くファイル）で決めます。
3. **61〜62 行目：キャッシュ**

   同じ参照・同じディレクティブを何度も変換しないための Map。BoundTarget のメソッドはノードごとに何度も呼ばれるので、変換を 1 回にまとめます。
4. **64〜71 行目：参照できるか**

   `refEmitter.emit` が Success を返すか。この関数は 8 節の `adaptGenerics` に渡され、型引数の制約を TCB のファイルから参照できるかの判定に使われます。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/tcb_adapter.ts` L98–131 （▶ の行: 99, 106–107, 113–116, 122, 129）

```ts
 98 │   const convertDir = (dir: TypeCheckableDirectiveMeta): TcbDirectiveMetadata => {
 99 ▶     if (dirCache.has(dir)) return dirCache.get(dir)!;
100 │ 
101 │     const tcbDir: TcbDirectiveMetadata = {
102 │       isComponent: dir.isComponent,
103 │       name: dir.name,
104 │       selector: dir.selector,
105 │       exportAs: dir.exportAs,
106 ▶       inputs: ClassPropertyMapping.fromMappedObject<TcbInputMapping>(
107 ▶         dir.inputs.toJointMappedObject((input: InputMapping) => {
108 │           return {
109 │             classPropertyName: input.classPropertyName,
110 │             bindingPropertyName: input.bindingPropertyName,
111 │             required: input.required,
112 │             isSignal: input.isSignal,
113 ▶             transformType: (() => {
114 ▶               if (input.transform != null) {
115 ▶                 const node = translateType(
116 ▶                   new TransplantedType(input.transform.type),
117 │                   env.contextFile,
118 │                   reflector,
119 │                   env.refEmitter,
120 │                   env.importManager,
121 │                 );
122 ▶                 return tempPrint(node, env.contextFile);
123 │               }
124 │               return undefined;
125 │             })(),
126 │           };
127 │         }),
128 │       ),
129 ▶       outputs: dir.outputs,
130 │       isStructural: dir.isStructural,
131 │       isStandalone: dir.isStandalone,
```

`convertDir` は 99 行目でキャッシュを見てから、ディレクティブのメタデータの各項目を写します。ほとんどは値の写しですが、113〜125 行目の `transformType` だけは違います。`input({transform})` の変換関数の型は ts の型ノードなので、115〜121 行目の `translateType` で TCB のファイルから見た型ノードにしてから、122 行目の `tempPrint` で**文字列に印字**します。TCB の生成器はこの文字列をそのまま型として書きます（入力の章 [第 10 回](10-typecheck-inputs.md)）。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/tcb_adapter.ts` L180–199 （▶ の行: 181, 183, 187, 194–196）

```ts
180 │   const originalBoundTarget = meta.boundTarget.target;
181 ▶   const adaptedBoundTarget: BoundTarget<TcbDirectiveMetadata> = {
182 │     target: {
183 ▶       template: originalBoundTarget.template,
184 │       host: originalBoundTarget.host
185 │         ? {
186 │             node: originalBoundTarget.host.node,
187 ▶             directives: originalBoundTarget.host.directives.map(convertDir),
188 │           }
189 │         : undefined,
190 │     },
191 │     getUsedDirectives: () => meta.boundTarget.getUsedDirectives().map(convertDir),
192 │     getEagerlyUsedDirectives: () => meta.boundTarget.getEagerlyUsedDirectives().map(convertDir),
193 │     getUsedPipes: () => meta.boundTarget.getUsedPipes(),
194 ▶     getDirectivesOfNode: (node) => {
195 ▶       const dirs = meta.boundTarget.getDirectivesOfNode(node);
196 ▶       return dirs ? dirs.map(convertDir) : null;
197 │     },
198 │     getForeignComponent: (element) => meta.boundTarget.getForeignComponent(element),
199 │     getReferenceTarget: (ref) => {
```

BoundTarget（[compiler-binder](../compiler/09-compiler-binder.md) で作られる照合結果）は、181 行目で同じ形のオブジェクトに包み直します。183 行目、テンプレートのノード（R3 AST）はそのまま渡します。R3 AST はもともと compiler パッケージの型で、ts のノードを含まないからです。変換が要るのはディレクティブを返すメソッドだけで、187 行目（ホストの directives）や 194〜197 行目（`getDirectivesOfNode`）のように、返す前に `convertDir` を通します。

## 4. extractReferenceMetadata：import できるか、できないか

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/tcb_adapter.ts` L318–343 （▶ の行: 322–323, 325, 341, 343）

```ts
318 │ function extractReferenceMetadata(
319 │   ref: Reference<ClassDeclaration>,
320 │   env: Environment,
321 │ ): TcbReferenceMetadata {
322 ▶   let name = ref.debugName || ref.node.name!.text;
323 ▶   let moduleName = ref.ownedByModuleGuess;
324 │   let unexportedDiagnostic: string | null = null;
325 ▶   let isLocal = true;
326 │ 
327 │   // When the compiler operates in `CopySourceToTcb` mode, it creates a separate shim file
328 │   // and copies the entire source content of the original file into it. From a pure text
329 │   // perspective in that shim file, the original classes are local.
330 │   //
331 │   // However, during the generation phase here, the compiler is still working with the
332 │   // AST nodes of the original file. So, `ref.node.getSourceFile()` returns the original
333 │   // file, not the shim file. If we fall through to standard reference resolution below,
334 │   // the emitter would assume it needs to generate an import (because the target file and
335 │   // source file don't match in AST terms). For non-exported symbols, that auto-import
336 │   // would fail.
337 │   //
338 │   // This condition acts as a bridge between AST reality and the physical file text:
339 │   // it identifies that the class is local because its text was copied to this shim,
340 │   // and it ensures we just output the class name directly rather than an import.
341 ▶   if (env.copiedSourceOriginPath !== undefined) {
342 │     const refFile = absoluteFromSourceFile(ref.node.getSourceFile());
343 ▶     if (refFile === env.copiedSourceOriginPath) {
```

322〜325 行目が既定値です。名前はクラス名、`moduleName` は `ownedByModuleGuess`（その参照をどのモジュールから得たかの推測）、`isLocal` は真。341〜343 行目は CopySourceToTcb という置き方（元のファイルの中身を shim にまるごと写して、そこに TCB を足す。[第 3 回](03-typecheck-context.md)）のときだけの近道で、元のファイルのクラスは写した先でも「同じファイルにある」ので、import を作らずに名前だけを返します（327〜340 行目のコメント）。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/tcb_adapter.ts` L366–398 （▶ の行: 368, 370–374, 378, 381–383, 394–395, 397）

```ts
366 │   }
367 │ 
368 ▶   const emitted = env.refEmitter.emit(ref, env.contextFile, ImportFlags.NoAliasing);
369 │   if (emitted.kind === ReferenceEmitKind.Success) {
370 ▶     if (emitted.expression instanceof ExternalExpr) {
371 ▶       name = emitted.expression.value.name!;
372 ▶       moduleName = emitted.expression.value.moduleName;
373 ▶       isLocal = false;
374 ▶     } else if (emitted.expression instanceof WrappedNodeExpr) {
375 │       const node = emitted.expression.node;
376 │       const extractedName = extractNameFromExpr(node);
377 │       if (extractedName !== null) {
378 ▶         name = extractedName;
379 │       }
380 │     }
381 ▶   } else if (emitted.kind === ReferenceEmitKind.Failed) {
382 ▶     unexportedDiagnostic = emitted.reason;
383 ▶     isLocal = false;
384 │   }
385 │ 
386 │   const nodeName = ref.node?.name as ts.Identifier | undefined;
387 │   const nodeNameSpan = nodeName
388 │     ? new AbsoluteSourceSpan(nodeName.getStart(), nodeName.getEnd())
389 │     : undefined;
390 │   const nodeFilePath =
391 │     nodeName !== undefined ? absoluteFromSourceFile(nodeName.getSourceFile()) : undefined;
392 │   let key: TcbReferenceKey;
393 │ 
394 ▶   if (nodeFilePath !== undefined && nodeNameSpan !== undefined) {
395 ▶     key = `${nodeFilePath}#${nodeNameSpan.start}` as TcbReferenceKey;
396 │   } else {
397 ▶     key = (moduleName ? `${moduleName}#${name}` : name) as TcbReferenceKey;
398 │   }
```

1. **368 行目：ReferenceEmitter に聞く**

   「TCB を書くファイル（`env.contextFile`）から、このクラスをどう書けば参照できるか」。`NoAliasing` は別名の再 export を使わない指定です。
2. **370〜373 行目：別のファイルにある（ExternalExpr）**

   import が要るので、名前とモジュール名を取り、`isLocal` を偽にします。ふつうの shim ファイルの TCB では、コンポーネントもディレクティブもここを通ります（shim は元のファイルとは別のファイルだからです）。
3. **374〜380 行目：同じファイルにある（WrappedNodeExpr）**

   識別子を直接書けるので、その名前だけ。inline の TCB（元のファイルに差し込む）で、同じファイルのクラスを指すときがこれです。
4. **381〜383 行目：参照できない（Failed）**

   export されていないクラスを別ファイルから指そうとした場合です。理由の文字列を `unexportedDiagnostic` に入れておきます。**ここではまだエラーにしません**。TCB の中で実際に使われたときに 5 節の 52 行目が投げます。
5. **394〜398 行目：key**

   宣言のファイルと名前の位置で `/path/to/file.ts#123` のような key を作ります。同じクラスなら別の Reference から来ても同じ key になり、6 節の型コンストラクタや pipe の使い回しに使われます。

## 5. ReferenceEmitEnvironment：参照を TcbExpr にする

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/reference_emit_environment.ts` L23–44 （▶ の行: 29, 31–33, 36, 42–43）

```ts
23 │ /**
24 │  * An environment for a given source file that can be used to emit references.
25 │  *
26 │  * This can be used by the type-checking block, or constructor logic to generate
27 │  * references to directives or other symbols or types.
28 │  */
29 ▶ export class ReferenceEmitEnvironment {
30 │   constructor(
31 ▶     readonly importManager: ImportManager,
32 ▶     public refEmitter: ReferenceEmitter,
33 ▶     public contextFile: ts.SourceFile,
34 │   ) {}
35 │ 
36 ▶   canReferenceType(
37 │     ref: Reference,
38 │     flags: ImportFlags = ImportFlags.NoAliasing |
39 │       ImportFlags.AllowTypeImports |
40 │       ImportFlags.AllowRelativeDtsImports,
41 │   ): boolean {
42 ▶     const result = this.refEmitter.emit(ref, this.contextFile, flags);
43 ▶     return result.kind === ReferenceEmitKind.Success;
44 │   }
```

`ReferenceEmitEnvironment` は 31〜33 行目の 3 つ（import を足す `ImportManager`、参照の書き方を決める `ReferenceEmitter`、TCB を書くファイル）を持つだけの土台です。36〜44 行目の `canReferenceType` は、TCB を shim に置けるか inline にするかの判定（`requiresInlineTypeCheckBlock`。[第 3 回](03-typecheck-context.md)）で使われます。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/reference_emit_environment.ts` L46–79 （▶ の行: 50–53, 55, 60, 62, 66–69, 72–75）

```ts
46 │   /**
47 │    * Generates a `TcbExpr` from a `TcbReferenceMetadata` object.
48 │    */
49 │   referenceTcbValue(ref: TcbReferenceMetadata): TcbExpr {
50 ▶     if (ref.unexportedDiagnostic !== null || ref.isLocal || ref.moduleName === null) {
51 ▶       if (ref.unexportedDiagnostic !== null) {
52 ▶         throw new FatalDiagnosticError(
53 ▶           ErrorCode.IMPORT_GENERATION_FAILURE,
54 │           this.contextFile,
55 ▶           makeDiagnosticChain(`Unable to import symbol ${ref.name}.`, [
56 │             makeDiagnosticChain(ref.unexportedDiagnostic),
57 │           ]),
58 │         );
59 │       }
60 ▶       return new TcbExpr(ref.name);
61 │     }
62 ▶     return this.referenceExternalSymbol(ref.moduleName, ref.name);
63 │   }
64 │ 
65 │   referenceExternalSymbol(moduleName: string, name: string): TcbExpr {
66 ▶     const importResult = this.importManager.addImport({
67 ▶       exportModuleSpecifier: moduleName,
68 ▶       exportSymbolName: name,
69 ▶       requestedFile: this.contextFile,
70 │     });
71 │ 
72 ▶     if (ts.isIdentifier(importResult)) {
73 ▶       return new TcbExpr(importResult.text);
74 ▶     } else if (ts.isIdentifier(importResult.expression)) {
75 ▶       return new TcbExpr(`${importResult.expression.text}.${importResult.name.text}`);
76 │     }
77 │ 
78 │     throw new Error('Unexpected value returned by import manager');
79 │   }
```

1. **50 行目：import しない 3 つの場合**

   import できない理由がある、ローカル、モジュール名が無い。どれかなら 60 行目で名前をそのまま書きます。
2. **51〜58 行目：import できない理由があるなら投げる**

   4 節の 382 行目で入れた理由を付けて、`FatalDiagnosticError`（`IMPORT_GENERATION_FAILURE`）を投げます。メッセージは `Unable to import symbol 名前.`。投げられたエラーは compiler.ts でテンプレートの診断を集める所（`getTemplateDiagnostics` を呼ぶ try）が捕まえ、1 つの診断に変えます。
3. **62 行目 → 66〜70 行目：import を足す**

   `ImportManager.addImport` に「このモジュールのこの名前を、このファイルで使いたい」と頼みます。返り値は ts の式です。
4. **72〜75 行目：ts の式を文字列に戻す**

   名前付き import なら識別子（72〜73 行目）、名前空間 import なら `i0.Dir` の形（74〜75 行目）。shim ファイル用の `TypeCheckFile` は `ImportManager` を `forceGenerateNamespacesForNewImports: true` で作るので、新しい import はいつも `import * as i0 from '…'` になり、TCB には `i0.Dir` と書かれます。

この組み合わせを確かめているのが template\_typecheck\_spec.ts の `it('should not fail with a runtime error when generating TCB')`（:87。[第 3 回](03-typecheck-context.md)で引用）です。export していない子コンポーネント `Sub`（:98）を、export したコンポーネントのテンプレートで使います。コンポーネントが export されているので TCB は shim に置かれ、shim から `Sub` を import できないので 4 節の 381〜383 行目で理由が入り、TCB が `Sub` の型を書こうとした所で 52 行目が投げます。期待値（:113）が `Unable to import symbol Sub.` です。コンポーネント自身が export されていなければ TCB は inline になり、`Sub` は同じファイルの識別子として書けるので、このエラーは出ません。

## 6. Environment：型コンストラクタと pipe を TCB の外に置く

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/environment.ts` L27–61 （▶ の行: 30–31, 38–41, 44–45, 47–48, 50, 53）

```ts
27 │ /**
28 │  * A context which hosts one or more Type Check Blocks (TCBs).
29 │  *
30 ▶  * An `Environment` supports the generation of TCBs by tracking necessary imports, declarations of
31 ▶  * type constructors, and other statements beyond the type-checking code within the TCB itself.
32 │  * Through method calls on `Environment`, the TCB generator can request `ts.Expression`s which
33 │  * reference declarations in the `Environment` for these artifacts`.
34 │  *
35 │  * `Environment` can be used in a standalone fashion, or can be extended to support more specialized
36 │  * usage.
37 │  */
38 ▶ export class Environment extends ReferenceEmitEnvironment {
39 ▶   private nextIds = {
40 ▶     pipeInst: 1,
41 ▶     typeCtor: 1,
42 │   };
43 │ 
44 ▶   private typeCtors = new Map<TcbReferenceKey, string>();
45 ▶   protected typeCtorStatements: TcbExpr[] = [];
46 │ 
47 ▶   private pipeInsts = new Map<TcbReferenceKey, string>();
48 ▶   protected pipeInstStatements: TcbExpr[] = [];
49 │ 
50 ▶   copiedSourceOriginPath?: AbsoluteFsPath;
51 │ 
52 │   constructor(
53 ▶     readonly config: TypeCheckingConfig,
54 │     importManager: ImportManager,
55 │     refEmitter: ReferenceEmitter,
56 │     contextFile: ts.SourceFile,
57 │     copiedSourceOriginPath?: AbsoluteFsPath,
58 │   ) {
59 │     super(importManager, refEmitter, contextFile);
60 │     this.copiedSourceOriginPath = copiedSourceOriginPath;
61 │   }
```

30〜31 行目、`Environment` の仕事は「必要な import、型コンストラクタの宣言、TCB の本体以外の文を追いかけること」です。38 行目で 5 節の `ReferenceEmitEnvironment` を継ぎ、39〜42 行目の番号で `_ctor1`・`_pipe1` の名前を振ります。44・47 行目の Map は 4 節の `key` で引くので、同じディレクティブ・同じ pipe は 1 つのファイルの中で 1 回しか宣言されません。45・48 行目に溜めた文を返すのが次の `getPreludeStatements` です。50 行目の `copiedSourceOriginPath` は 4 節の 341 行目の近道の印です。

型コンストラクタを作る `typeCtorFor` は[第 9 回](09-typecheck-type-constructor.md)、pipe の変数を作る `pipeInst` は[第 15 回](15-typecheck-refs-pipes.md)で読みます。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/environment.ts` L116–119 （▶ の行: 117）

```ts
116 │   getPreludeStatements(): TcbExpr[] {
117 ▶     return [...this.pipeInstStatements, ...this.typeCtorStatements];
118 │   }
119 │ }
```

117 行目、pipe の変数の宣言と型コンストラクタの宣言を返します。TCB の生成器はこれを `if (true) {` の中の先頭に並べます（[compiler-typecheck](../compiler/17-compiler-typecheck.md) 3 節の `renderBlockStatements`）。ただし shim ファイル用の `TypeCheckFile` は `getPreludeStatements` を空の配列を返すように上書きし、溜めた宣言をファイルの先頭に 1 回だけ書きます（[第 3 回](03-typecheck-context.md)）。だから spec の期待値では `const _ctor1: …` や `var _pipe1 = null! as i0.TestPipe;` が TCB の関数の外に出ます。

## 7. ページの上で：デモの env と本物の Environment

このシリーズのデモは、本物の `generateTypeCheckBlock` に**デモ用の TcbEnvironment** を渡しています。デモの env は、`referenceTcbValue` でクラス名をそのまま、`referenceExternalSymbol` で `i0.名前`、`typeCtorFor` で `_ctor_名前`、`pipeInst` で `_pipe_名前` を返し、`getPreludeStatements` は空です（import も宣言も足しません）。下のデモは、出力からこの 5 つが作った部分を拾い、本物ならどう書くかを並べます。

> **🧪 TcbEnvironment が作った部分を拾う**
>
> ボタンを押すと、このサイトに入っている @angular/compiler 22.1.6 の generateTypeCheckBlock が動きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/typecheck-environment)

「本物」の欄は、spec の期待値で確かめた形です。

| デモの出力 | 本物（type\_check\_block\_spec の期待値） | it の名前 |
| --- | --- | --- |
| `this: DemoCmp` | `this: i0.Test<T>` | should use the generic type of the context when enabled（下の引用） |
| `null! as Dir` | `var _t2 = null! as i0.Dir;` | should generate a forward directive reference correctly（[第 6 回](06-typecheck-scope.md)で引用） |
| `_ctor_GenericDir(…)` | `const _ctor1: <T extends string = any>(init: Pick<i0.Dir<T>, …>) => i0.Dir<T> = null!;` と `_ctor1(…)` | should generate a circular directive reference correctly ほか |
| `_pipe_upper.transform(…)` | `var _pipe1 = null! as i0.TestPipe;` と `_pipe1.transform(…)` | should check types of pipes when enabled |
| `i0.ɵassertType` | `i1.ɵassertType<typeof _t1>($event.target);` | should assert the type for DOM events bound on void elements |
| `i0.ɵINPUT_SIGNAL_BRAND_WRITE_TYPE` | `import * as i1 from '@angular/core';` と `[i1.ɵINPUT_SIGNAL_BRAND_WRITE_TYPE]` | should prefer namespace imports in type check files for new imports |

spec の `tcb()` は本物の `TypeCheckFile` を使うので、テスト用のファイル `/synthetic.ts` の import が `i0`、後から足された `@angular/core` が `i1` になっています。デモの `i0.` は「外部の記号」の印で、どのモジュールかは区別していません。

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L1545–1557 （▶ の行: 1550, 1554, 1556）

```ts
1545 │     describe('config.strictContextGenerics', () => {
1546 │       const TEMPLATE = `Test`;
1547 │ 
1548 │       it('should use the generic type of the context when enabled', () => {
1549 │         const block = tcb(TEMPLATE);
1550 ▶         expect(block).toContain('function _tcb1<T extends string>(this: i0.Test<T>)');
1551 │       });
1552 │ 
1553 │       it('should use any for the context generic type when disabled', () => {
1554 ▶         const DISABLED_CONFIG: TypeCheckingConfig = {...BASE_CONFIG, useContextGenericType: false};
1555 │         const block = tcb(TEMPLATE, undefined, DISABLED_CONFIG);
1556 ▶         expect(block).toContain('function _tcb1(this: i0.Test<any>)');
1557 │       });
```

1550 行目と 1556 行目の違いは、次の節の `adaptGenerics` で決まります。

## 8. adaptGenerics：コンポーネントの型引数をどう書くか

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/src/tcb_adapter.ts` L282–315 （▶ の行: 285–287, 291, 293, 296, 300, 302–303, 306, 308, 312）

```ts
282 │   let typeParameters: TcbTypeParameter[] | null;
283 │   let typeArguments: string[] | null;
284 │ 
285 ▶   if (node.typeParameters !== undefined && node.typeParameters.length > 0) {
286 ▶     if (!env.config.useContextGenericType) {
287 ▶       genericContextBehavior = TcbGenericContextBehavior.FallbackToAny;
288 │     }
289 │ 
290 │     switch (genericContextBehavior) {
291 ▶       case TcbGenericContextBehavior.UseEmitter:
292 │         const emitter = new TypeParameterEmitter(node.typeParameters, reflector);
293 ▶         const emittedParams = emitter.canEmit(canReferenceType)
294 │           ? emitter.emit(referenceType)
295 │           : undefined;
296 ▶         typeParameters = generateTcbTypeParameters(
297 │           emittedParams || node.typeParameters,
298 │           env.contextFile,
299 │         );
300 ▶         typeArguments = typeParameters.map((param) => param.name);
301 │         break;
302 ▶       case TcbGenericContextBehavior.CopyClassNodes:
303 ▶         typeParameters = generateTcbTypeParameters(node.typeParameters, env.contextFile);
304 │         typeArguments = typeParameters.map((param) => param.name);
305 │         break;
306 ▶       case TcbGenericContextBehavior.FallbackToAny:
307 │         typeParameters = generateTcbTypeParameters(node.typeParameters, env.contextFile);
308 ▶         typeArguments = new Array<string>(node.typeParameters.length).fill('any');
309 │         break;
310 │     }
311 │   } else {
312 ▶     typeParameters = typeArguments = null;
313 │   }
314 │ 
315 │   return {typeParameters, typeArguments};
```

1. **286〜288 行目：useContextGenericType が偽なら any**

   1554 行目の設定がこれです。306〜309 行目で型引数の数だけ `'any'` を並べ、`this: i0.Test<any>` になります。
2. **291〜301 行目：UseEmitter（shim の TCB の既定）**

   `TypeParameterEmitter` が制約（`T extends string` の `string` の部分）を TCB のファイルから書けるか確かめ、書けるなら書き直した型引数を使います（[第 9 回](09-typecheck-type-constructor.md)）。
3. **302〜305 行目：CopyClassNodes（inline の TCB）**

   元のファイルに差し込むので、クラスの型引数のノードをそのまま写せます。
4. **312 行目：型引数が無い**

   どちらも `null`。TCB の関数は `function _tcb1(this: i0.Cmp)` になります。

3 つの値は `TcbGenericContextBehavior`（compiler の ops/context.ts の enum。[第 9 回](09-typecheck-type-constructor.md)で引用）です。`generateTcbTypeParameters` が型引数を `TcbTypeParameter`（名前と文字列）にするので、ここでも TCB の生成器に渡るのは文字列だけです。

## 9. TCB の import は元のファイルの import と別か

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L2549–2561 （▶ の行: 2550, 2558, 2560）

```ts
2549 │     it('should re-use existing imports from original source files', () => {
2550 ▶       // This is especially important for inline type check blocks.
2551 │       // See: https://github.com/angular/angular/pull/53521#pullrequestreview-1778130879.
2552 │       const {templateTypeChecker, program, programStrategy} = setup([
2553 │         {
2554 │           fileName: absoluteFrom('/test.ts'),
2555 │           templates: {'AppComponent': TEMPLATE},
2556 │           declarations: [DIRECTIVE],
2557 │           source: `
2558 ▶           import {Component} from '@angular/core'; // should be re-used
2559 │ 
2560 ▶           class AppComponent {}
2561 │           export class Dir {}
```

📄 `angular/packages/compiler-cli/src/ngtsc/typecheck/test/type_check_block_spec.ts` L2566–2577 （▶ の行: 2567, 2573–2574）

```ts
2566 │       // Trigger type check block generation.
2567 ▶       templateTypeChecker.getDiagnosticsForFile(
2568 │         getSourceFileOrError(program, absoluteFrom('/test.ts')),
2569 │         OptimizeFor.SingleFile,
2570 │       );
2571 │ 
2572 │       const testSf = getSourceFileOrError(programStrategy.getProgram(), absoluteFrom('/test.ts'));
2573 ▶       expect(testSf.text).toContain(
2574 ▶         `import { Component, ɵINPUT_SIGNAL_BRAND_WRITE_TYPE } from '@angular/core'; // should be re-used`,
2575 │       );
2576 │       expect(testSf.text).toContain(`[ɵINPUT_SIGNAL_BRAND_WRITE_TYPE]`);
2577 │     });
```

2560 行目の `AppComponent` は export されていないので、TCB は元のファイル `/test.ts` に inline で差し込まれます。inline の TCB を差し込むとき、context.ts はそのファイル用の `ImportManager` を作り、同じモジュールの import が既にあればそれを書き換えます。そのため 2558 行目の `import {Component} from '@angular/core'` に名前が足され、2574 行目の `import { Component, ɵINPUT_SIGNAL_BRAND_WRITE_TYPE } …` になります。shim の TCB なら、7 節の表のとおり shim ファイルに新しい `import * as i1` が足されます。どちらも型検査用のプログラムの中だけの変更で、出力される JS には入りません（[第 4 回](04-typecheck-program-driver.md)）。

## 10. なぜ AST を持たないメタデータにしたのか

tcb\_adapter.ts を作ったコミット 8217ef9b244（2026-02-12、refactor(compiler-cli): abstract type check block metadata to be AST-free）の説明はこうです（要約）。「型チェックのメタデータを、ts.Node や ts.Declaration への参照を持たない、切り離せて直列化できるものにする。新しい tcb\_adapter が ts の AST に結びついたメタデータを切り離した構造に移す。これは、生きた TypeScript のオブジェクトではなく JSON でメタデータを渡すネイティブのプリプロセッサ（Rust や ts-go）を支える下地になる」。続く 7fa274510fc（2026-04-13）が「もう TypeScript に結びついていないので」TCB の生成を compiler パッケージに移し、c70625e8066（2026-04-27）が Environment から ReflectionHost を外しました。README の「AST-Free Metadata & Preprocessor Integration」の節（[第 1 回](01-typecheck-overview.md)）も同じことを書いています。

- `TypeCheckFile.addTypeCheckBlock()` — compiler-cli/…/type\_check\_file.ts — *shim の場合*
  - `adaptTypeCheckBlockMetadata(ref, meta, env)` — tcb\_adapter.ts:54 — *ts の宣言 → 文字列のメタデータ*
    - `extractReferenceMetadata()` — tcb\_adapter.ts:318 — *refEmitter.emit で import の要否*
    - `convertDir()` / `adaptGenerics()` — tcb\_adapter.ts
  - `generateTypeCheckBlock(env, component, …)` — compiler/…/type\_check\_block.ts — *env は TcbEnvironment として渡る*
    - `tcb.env.referenceTcbValue(ref)` — reference\_emit\_environment.ts:49 — *名前 / i0.名前 / 投げる*
      - `importManager.addImport()` — reference\_emit\_environment.ts:66
    - `tcb.env.typeCtorFor()` / `pipeInst()` — environment.ts — *宣言を溜める（第 9 回・第 15 回）*
- `TypeCheckFile.render()` — type\_check\_file.ts — *import と宣言を先頭に（第 3 回）*

## テストと直し方

この章の仕組みを確かめている spec は次のとおりです（行番号は 8576f161ae4 の版）。

- `type_check_block_spec.ts` の `describe('type check blocks')`（:27）→ `describe('config.strictContextGenerics')`（:1545、8 節の引用）と `describe('import generation')`（:2525、9 節の引用を含む 3 つの it）。`tcb()` は本物の `TypeCheckFile` を使うので、`i0.`・`i1.`・`_ctor1`・`_pipe1` がすべて本物の Environment の出力です。
- `test/ngtsc/template_typecheck_spec.ts` の `it('should not fail with a runtime error when generating TCB')`（:87、5 節。[第 3 回](03-typecheck-context.md)で引用）。

📄 `ターミナル`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/src/ngtsc/typecheck/test:test \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=type check blocks'

pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=runtime error when generating TCB|short-circuit safe navigation chains'
```

📄 `出力（抜粋。2026-11-02 に実行。ログは scratchpad/tc-logs/b-tcb.log・b-misc.log）`

```
Ran 239 of 1747 specs
239 specs, 0 failures
//packages/compiler-cli/src/ngtsc/typecheck/test:test      PASSED in 1.1s

（ngtsc は 4 つの shard。3 つは Ran 0 of 6746 specs、1 つが次の行）
Ran 8 of 6754 specs
8 specs, 0 failures
//packages/compiler-cli/test/ngtsc:ngtsc                   PASSED in 2.2s
```

1. **絞った件数を見る**

   `type check blocks` で絞ると 1747 件のうち 239 件、type\_check\_block\_spec.ts の全部が走ります。ngtsc は 4 つの shard（テストを分けて並べて走らせる単位）に分かれていて、2 つの it を絞った結果は 1 つの shard だけが 8 件、残りは 0 件でした。0 件でも PASSED と出るので、「Ran N of M」を必ず見ます。
2. **直すとしたら**

   参照の書き方は reference\_emit\_environment.ts の `referenceTcbValue`（49 行目）、import できるかの判定は tcb\_adapter.ts の `extractReferenceMetadata`（318 行目）、型引数は `adaptGenerics`（8 節の 285 行目から）です。TCB の形の変化なら type\_check\_block\_spec.ts の `describe('import generation')` に `tcb()` の it を、診断の変化なら template\_typecheck\_spec.ts に `env.driveDiagnostics()` の it を足すのが入口です。
3. **issue を読むときの手がかり**

   「Unable to import symbol」と出る報告は、4 節の 381〜383 行目と 5 節の 52 行目の組です。「This component requires inline template type-checking, which is not supported by the current environment」（閉じた #46747、言語サービスで出た）は、TCB を inline にしたいが今の環境ではできない場合で、2eae497a04a（2026-04-27）が足した CopySourceToTcb（4 節の 341 行目の近道）がその環境向けの別の置き方です。issue の読み方は[第 20 回](20-typecheck-issues.md)。

## 聞かれそうな質問

**Q. なぜ AST を持たないメタデータにしたのですか？**

8217ef9b244 のコミットの説明では、ネイティブのプリプロセッサ（Rust や ts-go）が JSON でメタデータを渡せるようにするためです。そのため TcbReferenceMetadata は名前・モジュール名・真偽値・key だけ（api.ts 39〜48 行目）、ts の型は tcb\_adapter.ts 122 行目で文字列に印字してから渡します。TCB の生成器が TypeScript の API に触れないので、7fa274510fc で compiler パッケージに移すことができました（api.ts 153〜155 行目のコメント）。

**Q. export されていないディレクティブは、TCB の中でどう参照されますか？**

コンポーネントと同じファイルにあり TCB が inline なら、tcb\_adapter.ts 374〜380 行目で識別子のまま書かれます。TCB が shim にあると shim から import できないので、381〜383 行目で `unexportedDiagnostic` が入り、TCB がそのクラスを書こうとした時点で reference\_emit\_environment.ts 51〜58 行目が `Unable to import symbol 名前.` の `FatalDiagnosticError` を投げ、テンプレートの診断の 1 つとして報告されます（template\_typecheck\_spec.ts:113）。コンポーネント自身や pipe が export されていない場合は、TCB の置き場所の方が inline に切り替わります（[第 3 回](03-typecheck-context.md)）。

**Q. TCB の import は元のファイルの import と別ですか？**

置き場所で違います。shim の TCB は shim ファイル自身の ImportManager で新しい `import * as iN` を足します（reference\_emit\_environment.ts 74〜75 行目が `iN.名前` を返す）。inline の TCB は差し込む先のファイルの既存の import を書き換えるので、type\_check\_block\_spec.ts 2574 行目のように既存の import に名前が足されます。どちらも型検査用のプログラムの中だけです。

**Q. 同じディレクティブを 10 個のコンポーネントが使うと、型コンストラクタは 10 個できますか？**

shim ファイル 1 つの中では 1 個です。environment.ts 44 行目の Map を tcb\_adapter.ts 394〜398 行目で作った key（宣言のファイルと位置）で引くので、同じクラスなら 2 回目からは同じ `_ctor1` を返します。shim ファイルは元のファイルごとなので、別のファイルのコンポーネントからは別々に宣言されます（[第 3 回](03-typecheck-context.md)）。

**Q. デモの TCB を TypeScript に読ませれば、そのまま型検査できますか？**

できません。デモの env の `getPreludeStatements` は空で、import も `_ctor_…` の宣言もありません。本物の Environment なら environment.ts 117 行目の宣言と、5 節の import が足されます。デモは TCB の形を見るためのもので、型のエラーは spec か手元の ngtsc で確かめます。

## 読み終えて

- TCB の生成器（compiler）は TypeScript を知らず、クラスや外部の記号を指す式は TcbEnvironment の 5 つのメソッドに頼む（api.ts 157〜164 行目）。
- ngtsc では tcb\_adapter.ts が ts の宣言を、名前・モジュール名・key・文字列の型だけのメタデータに移す。import できるかもここで決める。
- import できない参照は、使われた時点で `Unable to import symbol` の診断になる（reference\_emit\_environment.ts 51〜58 行目）。
- Environment は型コンストラクタと pipe の宣言を key ごとに 1 つ溜め、shim の TypeCheckFile はそれをファイルの先頭に書く。
- デモの env はこの 5 つを最小限に差し替えたもの。本物の形は spec の期待値で確かめる。

---

← 前: [派生した ts.Program と、作り直しの節約](04-typecheck-program-driver.md)  
次: [Scope と TcbOp：遅れて実行される操作の表](06-typecheck-scope.md) →
