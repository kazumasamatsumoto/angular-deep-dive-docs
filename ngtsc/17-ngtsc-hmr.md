[目次](../README.md) › [ngtsc の内側](README.md) › 第 17 回 / 全 20 回

# HMR の更新モジュール：コンポーネントだけを差し替える関数を作る

> NgCompiler.emitHmrUpdateModule が TraitCompiler.compileHmrUpdateCallback を呼び、extractHmrMetatadata・extractHmrDependencies がテンプレートの使う名前（ローカルの宣言と import）を集め、getHmrUpdateDeclaration が ɵɵreplaceMetadata を呼ぶ関数の宣言を作る行。CLI の側（cli-hmr）で読んだ範囲はリンク。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-hmr)

---

`ng serve` でテンプレートを保存すると、Angular CLI はコンパイラの `NgCompiler.emitHmrUpdateModule(クラス)` を呼び、そのコンポーネントの定義（`ɵcmp`）だけを作り直す小さな ES モジュールの文字列を受け取ります。この章では、その文字列がコンパイラの中でどう作られるかを、`TraitCompiler` → コンポーネントの handler → `ngtsc/hmr/` の 3 つの関数の順に読みます。中心は `extractHmrDependencies` です。更新モジュールは `import` を書けないので、テンプレートや定義が使う名前を「引数で受け取る値」として集めます。何を集めて、何を集めないかを行で確かめます。

読む対象は `packages/compiler-cli/src/ngtsc/hmr/src/` の `metadata.ts`（79 行）・`extract_dependencies.ts`（421 行）・`update_declaration.ts`（75 行）と、`transform/src/compilation.ts` の `compileHmrUpdateCallback`、`annotations/component/src/handler.ts` の `compileHmrUpdateDeclaration`、spec は `packages/compiler-cli/test/ngtsc/hmr_spec.ts` です。CLI が更新モジュールをブラウザへ送る側と、ブラウザで `ɵɵreplaceMetadata` が作り直す側は [cli-hmr](../cli/11-cli-hmr.md) で読んだので、ここでは繰り返しません。

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
17. **17. HMR**（この章）
18. [18. 診断と性能](18-ngtsc-diagnostics-perf.md)
19. [19. テストを書く](19-ngtsc-test-env.md)
20. [20. issue と PR を読む](20-ngtsc-issues.md)

## 0. 全体の流れ

HMR（Hot Module Replacement）は「動いているページに、変わったものだけを差し込む」仕組みです。コンパイラの側の仕事は 2 つあります。

1. **ふだんの emit で「待ち受け」のコードを足す**

   `_enableHmr` が立っていると、コンポーネントの `compileFull` が `compileHmrInitializer` の文をクラスの後ろに足します（3 節）。この文は、通知が来たら更新モジュールを `import()` して `ɵɵreplaceMetadata` に渡します。
2. **頼まれたら更新モジュールを作る**

   `emitHmrUpdateModule` → `TraitCompiler.compileHmrUpdateCallback` → `ComponentDecoratorHandler.compileHmrUpdateDeclaration` が、ɵcmp を作り直す関数 `Cmp_UpdateMetadata` の TypeScript の宣言を作ります（1〜3 節）。
3. **両方が同じ「依存の一覧」を使う**

   `extractHmrMetatadata` → `extractHmrDependencies` が、定義が読むファイルの上の名前（ローカルな値）と名前空間（`@angular/core` など）を集めます（4〜7 節）。待ち受けのコードはこの一覧の順に値を配列で渡し、更新モジュールは同じ順に引数で受けます。
4. **TypeScript の宣言にして、export default を付ける**

   `getHmrUpdateDeclaration` が `@angular/compiler` の `compileHmrUpdateCallback` に出力の AST を作らせ、TypeScript の AST に訳してから `export default` を足します（8 節）。

## 1. 入口：\_enableHmr と emitHmrUpdateModule

📄 `angular/packages/compiler-cli/src/ngtsc/core/api/src/options.ts` L101–106 （▶ の行: 104, 106）

```ts
101 │   /**
102 │    * Whether to enable the necessary code generation for hot module reloading.
103 │    *
104 ▶    * @internal
105 │    */
106 ▶   _enableHmr?: boolean;
```

106 行目の `_enableHmr` は `angularCompilerOptions` の 1 つで、104 行目のとおり `@internal`（公開の設定ではない）です。CLI の `ng serve` が立てます（[cli-hmr](../cli/11-cli-hmr.md) の 1 節）。`NgCompiler` のコンストラクターが `this.enableHmr = !!options['_enableHmr']` と読み、コンポーネントの handler を作るときに渡します。

📄 `angular/packages/compiler-cli/src/ngtsc/core/src/compiler.ts` L999–1005 （▶ の行: 999, 1001–1002, 1005）

```ts
 999 ▶     const callback = traitCompiler.compileHmrUpdateCallback(node);
1000 │ 
1001 ▶     if (callback === null) {
1002 ▶       return null;
1003 │     }
1004 │ 
1005 ▶     const sourceFile = node.getSourceFile();
```

`emitHmrUpdateModule` の全体は [cli-hmr](../cli/11-cli-hmr.md) の 4 節で読みました。ここで見るのは 999 行目だけです。中身を作るのは `traitCompiler.compileHmrUpdateCallback(node)` で、1001〜1002 行目、それが `null` なら更新モジュールも `null` です。CLI は 1 つでも `null` が返るとページ全体の読み直しに切り替えます。1005 行目より後は、受け取った `ts.FunctionDeclaration` を文字列に印刷して `ts.transpileModule` で ES2022 の JS にするだけです。

## 2. TraitCompiler.compileHmrUpdateCallback：最初の「直せる」trait に任せる

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/api.ts` L218–225 （▶ の行: 221, 225）

```ts
218 │   /**
219 │    * Generates the function that will update a class' metadata at runtime during HMR.
220 │    */
221 ▶   compileHmrUpdateDeclaration?(
222 │     node: ClassDeclaration,
223 │     analysis: Readonly<A>,
224 │     resolution: Readonly<R>,
225 ▶   ): ts.FunctionDeclaration | null;
```

`DecoratorHandler` のインタフェースで、`compileHmrUpdateDeclaration` は 221 行目の `?` のとおり*無くてもよい*メソッドです。`packages/compiler-cli/src` の中で実装しているのは `ComponentDecoratorHandler` だけでした（`grep -rn compileHmrUpdateDeclaration` で確かめた）。@Directive・@Pipe・@NgModule のクラスは HMR で差し替えられません。

📄 `angular/packages/compiler-cli/src/ngtsc/transform/src/compilation.ts` L737–763 （▶ の行: 738, 741–743, 745, 748, 750, 753–756, 758, 762）

```ts
737 │   compileHmrUpdateCallback(clazz: DeclarationNode): ts.FunctionDeclaration | null {
738 ▶     const original = ts.getOriginalNode(clazz) as typeof clazz;
739 │ 
740 │     if (
741 ▶       !this.reflector.isClass(clazz) ||
742 ▶       !this.reflector.isClass(original) ||
743 ▶       !this.classes.has(original)
744 │     ) {
745 ▶       return null;
746 │     }
747 │ 
748 ▶     const record = this.classes.get(original)!;
749 │ 
750 ▶     for (const trait of record.traits) {
751 │       // Cannot compile a trait that is not resolved, or had any errors in its declaration.
752 │       if (
753 ▶         trait.state === TraitState.Resolved &&
754 ▶         trait.handler.compileHmrUpdateDeclaration !== undefined &&
755 ▶         !containsErrors(trait.analysisDiagnostics) &&
756 ▶         !containsErrors(trait.resolveDiagnostics)
757 │       ) {
758 ▶         return trait.handler.compileHmrUpdateDeclaration(clazz, trait.analysis, trait.resolution!);
759 │       }
760 │     }
761 │ 
762 ▶     return null;
763 │   }
```

1. **738 行目：元のノードに戻す**

   変換の途中で作り直されたノードでも、`ts.getOriginalNode` で構文木の元のクラスを引きます。`classes` の Map は元のノードで引くからです。
2. **741〜745 行目：解析したクラスでなければ null**

   `this.classes` は解析（[第 7 回](07-ngtsc-trait-analyze.md)）でデコレーターを見つけたクラスの記録です。デコレーターの無いクラスはここで `null` になります。
3. **750〜757 行目：条件をそろえた trait だけ**

   trait（1 つのデコレーターと handler の組。[第 7 回](07-ngtsc-trait-analyze.md)）のうち、753 行目で解決まで済み（`TraitState.Resolved`）、754 行目で handler がメソッドを持ち、755〜756 行目で解析と解決のどちらの診断にもエラーが無いものだけを選びます。
4. **758 行目：最初に見つかった 1 つに任せる**

   `analysis` と `resolution` は、ふだんの `compile` と同じものを渡します。条件を満たす trait が無ければ 762 行目で `null` です。

> [!TIP]
> **新卒エンジニアへ**
>
> 「エラーがあるコンポーネントは HMR しない」は 755〜756 行目です。テンプレートの構文エラーは、次の節の 1790 行目でも止まります（6 節の DEMO の「null になる場面」で 2 つの道を見比べられます）。

## 3. ComponentDecoratorHandler：compileFull とほぼ同じ材料で ɵcmp を作り直す

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1785–1813 （▶ の行: 1790–1791, 1795–1797, 1804–1805, 1808）

```ts
1785 │   compileHmrUpdateDeclaration(
1786 │     node: ClassDeclaration,
1787 │     analysis: Readonly<ComponentAnalysisData>,
1788 │     resolution: Readonly<ComponentResolutionData>,
1789 │   ): ts.FunctionDeclaration | null {
1790 ▶     if (analysis.template.errors !== null && analysis.template.errors.length > 0) {
1791 ▶       return null;
1792 │     }
1793 │ 
1794 │     // Create a brand-new constant pool since there shouldn't be any constant sharing.
1795 ▶     const pool = new ConstantPool();
1796 ▶     const defer = this.compileDeferBlocks(resolution);
1797 ▶     const foreignImports = this.resolveForeignComponentImports(analysis);
1798 │     const meta: R3ComponentMetadata<R3TemplateDependency> = {
1799 │       ...analysis.meta,
1800 │       ...resolution,
1801 │       defer,
1802 │       foreignImports,
1803 │     };
1804 ▶     const fac = compileNgFactoryDefField(toFactoryMetadata(meta, FactoryTarget.Component));
1805 ▶     const def = compileComponentFromMetadata(meta, pool, this.getNewBindingParser());
1806 │     const classMetadata =
1807 │       analysis.classMetadata !== null
1808 ▶         ? compileComponentClassMetadata(analysis.classMetadata, null).toStmt()
1809 │         : null;
1810 │     const debugInfo =
1811 │       analysis.classDebugInfo !== null
1812 │         ? compileClassDebugInfo(analysis.classDebugInfo).toStmt()
1813 │         : null;
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1814–1832 （▶ の行: 1814–1815, 1828–1831）

```ts
1814 ▶     const hmrMeta = this.enableHmr
1815 ▶       ? extractHmrMetatadata(
1816 │           node,
1817 │           this.reflector,
1818 │           this.evaluator,
1819 │           this.compilerHost,
1820 │           this.rootDirs,
1821 │           def,
1822 │           fac,
1823 │           defer,
1824 │           classMetadata,
1825 │           debugInfo,
1826 │         )
1827 │       : null;
1828 ▶     const res = compileResults(fac, def, classMetadata, 'ɵcmp', null, null, debugInfo, null);
1829 ▶     return hmrMeta === null || res.length === 0
1830 ▶       ? null
1831 ▶       : getHmrUpdateDeclaration(res, pool.statements, hmrMeta, node);
1832 │   }
```

1. **1790〜1792 行目：テンプレートにエラーがあれば null**

   2 節の診断の検査とは別に、構文解析のエラーをここでも見ます。
2. **1795 行目：新しい ConstantPool**

   ConstantPool は、テンプレートの関数や `_forTrack0` のような「定義の外に出す定数」を集める入れ物です。コメントのとおり、更新モジュールはほかのコンポーネントと定数を分け合わないので、毎回新しく作ります。
3. **1796〜1805 行目：compileFull と同じ組み立て**

   `compileDeferBlocks`・`resolveForeignComponentImports`・`compileNgFactoryDefField`・`compileComponentFromMetadata` を同じ順に呼びます。compileFull の側は [compiler-entry](../compiler/02-compiler-entry.md) の 6 節です。
4. **1808 行目：setClassMetadata に遅延の依存を渡さない**

   compileFull は `perComponentDeferredDeps` を渡しますが、ここは `null` です。HMR のときは `canDeferDeps = !enableHmr` で @defer の依存を遅延にしないからです（その行は [standalone-defer-deps](../standalone/11-standalone-defer-deps.md) で引用）。
5. **1814〜1827 行目：依存を集める**

   4 節の `extractHmrMetatadata` に、作ったばかりの `def`・`fac`・`defer`・`classMetadata`・`debugInfo` を渡します。
6. **1828 行目：compileResults で ɵfac と ɵcmp の組にする**

   5 つめの `additionalFields` と 6 つめの `deferrableImports`、8 つめの `hmrInitializer` は `null` です。更新モジュールの中に、さらに待ち受けのコードを入れる必要はありません。
7. **1829〜1831 行目：8 節の getHmrUpdateDeclaration へ**

   依存が集められなかった（`hmrMeta === null`）か、結果が空なら `null` です。

ふだんの emit の側（compileFull）も、同じ `extractHmrMetatadata` を呼んでいます。

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/component/src/handler.ts` L1623–1637 （▶ の行: 1623–1624, 1637）

```ts
1623 ▶     const hmrMeta = this.enableHmr
1624 ▶       ? extractHmrMetatadata(
1625 │           node,
1626 │           this.reflector,
1627 │           this.evaluator,
1628 │           this.compilerHost,
1629 │           this.rootDirs,
1630 │           def,
1631 │           fac,
1632 │           defer,
1633 │           classMetadata,
1634 │           debugInfo,
1635 │         )
1636 │       : null;
1637 ▶     const hmrInitializer = hmrMeta ? compileHmrInitializer(hmrMeta).toStmt() : null;
```

📄 `angular/packages/compiler-cli/src/ngtsc/annotations/common/src/util.ts` L441–455 （▶ の行: 441, 443, 453–454）

```ts
441 ▶   hmrInitializer: Statement | null = null,
442 │ ): CompileResult[] {
443 ▶   const statements = def.statements;
444 │ 
445 │   if (metadataStmt !== null) {
446 │     statements.push(metadataStmt);
447 │   }
448 │ 
449 │   if (debugInfo !== null) {
450 │     statements.push(debugInfo);
451 │   }
452 │ 
453 ▶   if (hmrInitializer !== null) {
454 ▶     statements.push(hmrInitializer);
455 │   }
```

1623 行目、`enableHmr` のときだけ依存を集め、1637 行目で `compileHmrInitializer(hmrMeta)`（[cli-hmr](../cli/11-cli-hmr.md) の 2 節）を文にします。`compileResults` は 441 行目でそれを受け、453〜454 行目で ɵcmp の `statements` の後ろに足します。`statements` はクラスの後ろに出る文なので、待ち受けのコードは `setClassDebugInfo` の次に並びます（6 節の DEMO の「足された行」）。

> [!NOTE]
> **ポイント**
>
> 待ち受けのコードと更新モジュールは、*別々のコンパイル*で同じ `extractHmrMetatadata` を呼びます。待ち受けのコードは最初の emit のときの依存の順で値の配列を固定し、更新モジュールは保存したあとの依存の順で引数を並べます。順が食い違わないように、コンポーネントの `dependencies` はテンプレートで使っていなくても全部残します（handler の依存を集める所にある `if (this.enableHmr)` の分かれ道。[standalone-used-only](../standalone/04-standalone-used-only.md) で引用）。

## 4. extractHmrMetatadata：ID の材料と依存の一覧

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/metadata.ts` L46–78 （▶ の行: 46, 50–53, 55, 66–67, 71–75）

```ts
46 ▶   if (!reflection.isClass(clazz)) {
47 │     return null;
48 │   }
49 │ 
50 ▶   const sourceFile = ts.getOriginalNode(clazz).getSourceFile();
51 ▶   const filePath =
52 ▶     getProjectRelativePath(sourceFile.fileName, rootDirs, compilerHost) ||
53 ▶     compilerHost.getCanonicalFileName(sourceFile.fileName);
54 │ 
55 ▶   const dependencies = extractHmrDependencies(
56 │     clazz,
57 │     definition,
58 │     factory,
59 │     deferBlockMetadata,
60 │     classMetadata,
61 │     debugInfo,
62 │     reflection,
63 │     evaluator,
64 │   );
65 │ 
66 ▶   if (dependencies === null) {
67 ▶     return null;
68 │   }
69 │ 
70 │   const meta: R3HmrMetadata = {
71 ▶     type: new o.WrappedNodeExpr(clazz.name),
72 ▶     className: clazz.name.text,
73 ▶     filePath,
74 ▶     localDependencies: dependencies.local,
75 ▶     namespaceDependencies: dependencies.external,
76 │   };
77 │ 
78 │   return meta;
```

- 46 行目：クラスでなければ `null`。
- 50〜53 行目：ファイルのパス。`rootDirs` からの相対パスが取れればそれを、取れなければ絶対パスを使います。CLI がブラウザ側の ID（`"app%2Fcmp.ts%40Cmp"` のような「パス@クラス名」）を作る材料です。
- 55〜64 行目：依存を集めます（5〜7 節）。66〜67 行目、集められなければ HMR のメタデータごと `null` です。このとき 3 節の 1637 行目も `null` なので、待ち受けのコードも出ません。
- 70〜76 行目：`@angular/compiler` の `R3HmrMetadata` の形にします。71 行目はクラスの名前の識別子そのもの、74 行目がローカルな値、75 行目が名前空間です。

## 5. extractHmrDependencies：出力の AST から「読んでいる名前」を拾う

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/extract_dependencies.ts` L43–60 （▶ の行: 43–44, 49–54, 56–57, 59）

```ts
43 ▶   const name = ts.isClassDeclaration(node) && node.name ? node.name.text : null;
44 ▶   const visitor = new PotentialTopLevelReadsVisitor();
45 │   const sourceFile = ts.getOriginalNode(node).getSourceFile();
46 │ 
47 │   // Visit all of the compiled expressions to look for potential
48 │   // local references that would have to be retained.
49 ▶   definition.expression.visitExpression(visitor, null);
50 ▶   definition.statements.forEach((statement) => statement.visitStatement(visitor, null));
51 ▶   factory.initializer?.visitExpression(visitor, null);
52 ▶   factory.statements.forEach((statement) => statement.visitStatement(visitor, null));
53 ▶   classMetadata?.visitStatement(visitor, null);
54 ▶   debugInfo?.visitStatement(visitor, null);
55 │ 
56 ▶   if (deferBlockMetadata.mode === DeferBlockDepsEmitMode.PerBlock) {
57 ▶     deferBlockMetadata.blocks.forEach((loader) => loader?.visitExpression(visitor, null));
58 │   } else {
59 ▶     deferBlockMetadata.dependenciesFn?.visitExpression(visitor, null);
60 │   }
```

この関数が見るのは TypeScript のソースではなく、*コンパイルした結果の出力の AST*（`@angular/compiler` の `outputAst`）です。49〜54 行目で、ɵcmp の式とその前後の文・ɵfac・`setClassMetadata`・`setClassDebugInfo` を、56〜60 行目で @defer の読み込み関数を、同じ visitor で歩きます。43 行目のクラスの名前は、あとで除くために取っておきます。

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/extract_dependencies.ts` L229–263 （▶ の行: 233–235, 240–241, 245–247, 257–259, 261）

```ts
229 │ class PotentialTopLevelReadsVisitor extends o.RecursiveAstVisitor {
230 │   readonly allReads = new Set<o.ReadVarExpr | ts.Identifier>();
231 │   readonly namespaceReads = new Set<string>();
232 │ 
233 ▶   override visitExternalExpr(ast: o.ExternalExpr, context: any) {
234 ▶     if (ast.value.moduleName !== null) {
235 ▶       this.namespaceReads.add(ast.value.moduleName);
236 │     }
237 │     super.visitExternalExpr(ast, context);
238 │   }
239 │ 
240 ▶   override visitReadVarExpr(ast: o.ReadVarExpr, context: any) {
241 ▶     this.allReads.add(ast);
242 │     super.visitReadVarExpr(ast, context);
243 │   }
244 │ 
245 ▶   override visitWrappedNodeExpr(ast: o.WrappedNodeExpr<unknown>, context: any) {
246 ▶     if (this.isTypeScriptNode(ast.node)) {
247 ▶       this.addAllTopLevelIdentifiers(ast.node);
248 │     }
249 │ 
250 │     super.visitWrappedNodeExpr(ast, context);
251 │   }
252 │ 
253 │   /**
254 │    * Traverses a TypeScript AST and tracks all the top-level reads.
255 │    * @param node Node from which to start the traversal.
256 │    */
257 ▶   private addAllTopLevelIdentifiers = (node: ts.Node) => {
258 ▶     if (ts.isIdentifier(node) && this.isTopLevelIdentifierReference(node)) {
259 ▶       this.allReads.add(node);
260 │     } else {
261 ▶       ts.forEachChild(node, this.addAllTopLevelIdentifiers);
262 │     }
263 │   };
```

出力の AST の中で、名前が出てくる形は 3 つです。

| 出力の AST の節 | 行 | 例 | どこへ |
| --- | --- | --- | --- |
| `ExternalExpr`（モジュール名つきの参照） | 233〜236 | `@angular/core` の `ɵɵdefineComponent` | `namespaceReads` にモジュール名だけ |
| `ReadVarExpr`（変数を読む） | 240〜241 | コンパイラが作った変数の読み | `allReads` |
| `WrappedNodeExpr`（TypeScript の式をそのまま包んだもの） | 245〜251 | `imports: [UpperPipe]` の `UpperPipe`、`providers` の式、`transform: toNumber` | 中の TypeScript の木を歩いて、外から読む識別子を `allReads` へ（257〜263） |

3 つめが要です。デコレーターに書いた式のうち、コンパイラが値として評価しきらずに「その式のまま出力に入れる」もの（`providers`・`imports` の参照・input の `transform` など）は、TypeScript の構文木のまま出力の AST に包まれています。その中の識別子が「ファイルの上の名前を読んでいる」のか「オブジェクトのキーなど、ただの名前」なのかを、`isTopLevelIdentifierReference` が親の節の種類で決めます。

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/extract_dependencies.ts` L297–328 （▶ の行: 299–300, 304, 306, 319, 322, 326–327）

```ts
297 │     // Identifier used inside a call is only top-level if it's an argument.
298 │     // This also covers decorators since their expression is usually a call.
299 ▶     if (ts.isCallExpression(parent)) {
300 ▶       return parent.expression === node || parent.arguments.includes(node);
301 │     }
302 │ 
303 │     // Identifier used in a nested expression is only top-level if it's the actual expression.
304 ▶     if (
305 │       ts.isExpressionStatement(parent) ||
306 ▶       ts.isPropertyAccessExpression(parent) ||
307 │       ts.isComputedPropertyName(parent) ||
308 │       ts.isTemplateSpan(parent) ||
309 │       ts.isSpreadAssignment(parent) ||
310 │       ts.isSpreadElement(parent) ||
311 │       ts.isAwaitExpression(parent) ||
312 │       ts.isNonNullExpression(parent) ||
313 │       ts.isIfStatement(parent) ||
314 │       ts.isDoStatement(parent) ||
315 │       ts.isWhileStatement(parent) ||
316 │       ts.isSwitchStatement(parent) ||
317 │       ts.isCaseClause(parent) ||
318 │       ts.isThrowStatement(parent) ||
319 ▶       ts.isNewExpression(parent) ||
320 │       ts.isExpressionWithTypeArguments(parent)
321 │     ) {
322 ▶       return parent.expression === node;
323 │     }
324 │ 
325 │     // Identifier used in an array is only top-level if it's one of the elements.
326 ▶     if (ts.isArrayLiteralExpression(parent)) {
327 ▶       return parent.elements.includes(node);
328 │     }
```

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/extract_dependencies.ts` L330–345 （▶ の行: 333, 339, 343–344）

```ts
330 │     // If the parent is an initialized node, the identifier is
331 │     // at the top level if it's the initializer itself.
332 │     if (
333 ▶       ts.isPropertyAssignment(parent) ||
334 │       ts.isParameter(parent) ||
335 │       ts.isBindingElement(parent) ||
336 │       ts.isPropertyDeclaration(parent) ||
337 │       ts.isEnumMember(parent)
338 │     ) {
339 ▶       return parent.initializer === node;
340 │     }
341 │ 
342 │     // Identifier in a function is top level if it's either the name or the initializer.
343 ▶     if (ts.isVariableDeclaration(parent)) {
344 ▶       return parent.name === node || parent.initializer === node;
345 │     }
```

- 299〜300 行目：呼び出しなら、呼ぶ関数か引数のとき。`new InjectionToken('x')` は 319 行目の `NewExpression` で同じ扱いです。
- 306・322 行目：`Size.Large` の `Size` は「プロパティを読む式の左」なので読み、`Large` は名前なので読みません。
- 326〜327 行目：配列の要素なら読み。`imports: [UpperPipe]` がこれです。
- 333〜339 行目：`{provide: SIZE}` の `SIZE` は代入の右（`initializer`）なので読み、キーの `provide` は読みません。
- 343〜344 行目：変数の宣言なら名前か初期値のとき。

この「親で決める」並びは、hmr\_spec.ts の it の名前（`should capture shorthand property assignment dependencies`・`… arrow function …`・`… conditional expression …`・`… parenthesized …`・`… new expression …`・`… expressions with type arguments`）と 1 対 1 に対応しています。どれも、取りこぼしの不具合を直したときに足された it です（`git log -S` で確かめた：ce3b6641fbb #59323・3638f93acc0 #59445・8de0f3f79b0 と 5a13dff22c2 #59637・67be7d2e06c #59644・7bf4906f273 #63261。2024-12〜2025-08）。

## 6. 何を集めて、何を集めないか

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/extract_dependencies.ts` L62–91 （▶ の行: 65, 69–70, 72–73, 75–76, 79, 84, 86–88）

```ts
62 │   // Filter out only the references to defined top-level symbols. This allows us to ignore local
63 │   // variables inside of functions. Note that we filter out the class name since it is always
64 │   // defined and it saves us having to repeat this logic wherever the locals are consumed.
65 ▶   const availableTopLevel = getTopLevelDeclarationNames(sourceFile);
66 │   const local: {name: string; runtimeRepresentation: o.Expression}[] = [];
67 │   const seenLocals = new Set<string>();
68 │ 
69 ▶   for (const readNode of visitor.allReads) {
70 ▶     const readName = readNode instanceof o.ReadVarExpr ? readNode.name : readNode.text;
71 │ 
72 ▶     if (readName !== name && !seenLocals.has(readName) && availableTopLevel.has(readName)) {
73 ▶       const runtimeRepresentation = getRuntimeRepresentation(readNode, reflection, evaluator);
74 │ 
75 ▶       if (runtimeRepresentation === null) {
76 ▶         return null;
77 │       }
78 │ 
79 ▶       local.push({name: readName, runtimeRepresentation});
80 │       seenLocals.add(readName);
81 │     }
82 │   }
83 │ 
84 ▶   return {
85 │     local,
86 ▶     external: Array.from(visitor.namespaceReads, (name, index) => ({
87 ▶       moduleName: name,
88 ▶       assignedName: `ɵhmr${index}`,
89 │     })),
90 │   };
91 │ }
```

拾った名前のうち残すのは、72 行目の 3 つの条件をすべて満たすものだけです。クラス自身の名前ではない、まだ見ていない、そして 65 行目の `getTopLevelDeclarationNames` が返す「ファイルの上の名前」に入っている。関数の中の引数（`rf`・`ctx`）や、テンプレート関数の中の `const item_r1` のような局所変数は、ファイルの上にはないので落ちます。84〜90 行目、名前空間はモジュール名の出てきた順に `ɵhmr0`・`ɵhmr1`… の名前を付けます。

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/extract_dependencies.ts` L145–170 （▶ の行: 149, 151–155, 164, 166）

```ts
145 │ function getTopLevelDeclarationNames(sourceFile: ts.SourceFile): Set<string> {
146 │   const results = new Set<string>();
147 │ 
148 │   // Only look through the top-level statements.
149 ▶   for (const node of sourceFile.statements) {
150 │     // Class, function and const enum declarations need to be captured since they correspond
151 ▶     // to runtime code. Intentionally excludes interfaces and type declarations.
152 ▶     if (
153 ▶       ts.isClassDeclaration(node) ||
154 ▶       ts.isFunctionDeclaration(node) ||
155 ▶       ts.isEnumDeclaration(node)
156 │     ) {
157 │       if (node.name) {
158 │         results.add(node.name.text);
159 │       }
160 │       continue;
161 │     }
162 │ 
163 │     // Variable declarations.
164 ▶     if (ts.isVariableStatement(node)) {
165 │       for (const decl of node.declarationList.declarations) {
166 ▶         trackBindingName(decl.name, results);
167 │       }
168 │       continue;
169 │     }
170 │ 
```

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/extract_dependencies.ts` L171–202 （▶ の行: 172, 176–177, 181, 188, 190, 193–195）

```ts
171 │     // Import declarations.
172 ▶     if (ts.isImportDeclaration(node) && node.importClause) {
173 │       const importClause = node.importClause;
174 │ 
175 │       // Skip over type-only imports since they won't be emitted to JS.
176 ▶       if (importClause.phaseModifier === ts.SyntaxKind.TypeKeyword) {
177 ▶         continue;
178 │       }
179 │ 
180 │       // import foo from 'foo'
181 ▶       if (importClause.name) {
182 │         results.add(importClause.name.text);
183 │       }
184 │ 
185 │       if (importClause.namedBindings) {
186 │         const namedBindings = importClause.namedBindings;
187 │ 
188 ▶         if (ts.isNamespaceImport(namedBindings)) {
189 │           // import * as foo from 'foo';
190 ▶           results.add(namedBindings.name.text);
191 │         } else {
192 │           // import {foo} from 'foo';
193 ▶           namedBindings.elements.forEach((el) => {
194 ▶             if (!el.isTypeOnly) {
195 ▶               results.add(el.name.text);
196 │             }
197 │           });
198 │         }
199 │       }
200 │       continue;
201 │     }
202 │   }
```

| ファイルの上にあるもの | 「上の名前」に入るか | 行 |
| --- | --- | --- |
| class・function・enum の宣言 | 入る（enum は const でなくても入る） | 152〜160 |
| `const`・`let`（分割代入の中の名前も） | 入る | 164〜169（`trackBindingName`） |
| `import x`・`import * as x`・`import {x}` | 入る | 181・188〜190・193〜197 |
| `import type {…}`・`import {type x}` | 入らない（JS に出ないから） | 176・194 |
| interface・type | 入らない（151 行目のコメント） | 152〜155 の条件に無い |

もう 1 つの条件は「出力の AST が読んでいるか」です。この 2 つの重なりだけが引数になります。たとえば同じファイルの `const DEFAULT_ITEMS` を `items = DEFAULT_ITEMS` とクラスのフィールドで使っても、フィールドの初期値はクラスの本体に残り、ɵcmp の中には入らないので集めません。逆に、`setClassMetadata` はデコレーターの式をそのまま持つので、`Component` や `Input` のようなデコレーター自身の import も集まります（hmr\_spec.ts の 119 行目の配列の後ろの `Component, Inject, ViewChild, Input`）。

> [!NOTE]
> **ポイント**
>
> 手元の木（8576f161ae4）より 807 commit 先の main（2026-11-03）では、d348fd884a2（2026-10-14、「HMR をプリプロセッサーでも作る」）で、5〜6 節の「出力の AST を歩いて、ファイルの上の名前と重ねる」部分が TypeScript に頼らない `extract_dependencies_output.ts` に移りました。`extract_dependencies.ts` は、拾った識別子が何を指すかを TypeScript で決めて渡す側になっています（`git diff HEAD origin/main` で +32 −83 行）。何を集めて何を集めないかの規則は同じです。

## 7. const enum だけは値を作って渡す

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/extract_dependencies.ts` L101–138 （▶ の行: 101–102, 107–108, 110, 113–114, 121, 130, 134, 138）

```ts
101 ▶   if (node instanceof o.ReadVarExpr) {
102 ▶     return o.variable(node.name);
103 │   }
104 │ 
105 │   // Const enums can't be passed by reference, because their values are inlined.
106 │   // Pass in an object literal with all of the values instead.
107 ▶   if (isConstEnumReference(node, reflection)) {
108 ▶     const evaluated = evaluator.evaluate(node);
109 │ 
110 ▶     if (evaluated instanceof Map) {
111 │       const members: {key: string; quoted: boolean; value: o.Expression}[] = [];
112 │ 
113 ▶       for (const [name, value] of evaluated.entries()) {
114 ▶         if (
115 │           value instanceof EnumValue &&
116 │           (value.resolved == null ||
117 │             typeof value.resolved === 'string' ||
118 │             typeof value.resolved === 'boolean' ||
119 │             typeof value.resolved === 'number')
120 │         ) {
121 ▶           members.push({
122 │             key: name,
123 │             quoted: false,
124 │             value: o.literal(value.resolved),
125 │           });
126 │         } else {
127 │           // TS is pretty restrictive about what values can be in a const enum so our evaluator
128 │           // should be able to handle them, however if we happen to hit such a case, we return null
129 │           // so the HMR update can be invalidated.
130 ▶           return null;
131 │         }
132 │       }
133 │ 
134 ▶       return o.literalMap(members);
135 │     }
136 │   }
137 │ 
138 ▶   return o.variable(node.text);
```

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/extract_dependencies.ts` L401–421 （▶ の行: 406–410, 415, 418–419）

```ts
401 │ /** Checks whether a node is a reference to a const enum. */
402 │ function isConstEnumReference(node: ts.Identifier, reflection: ReflectionHost): boolean {
403 │   const parent = node.parent;
404 │ 
405 │   // Only check identifiers that are in the form of `Foo.bar` where `Foo` is the node being checked.
406 ▶   if (
407 ▶     !parent ||
408 ▶     !ts.isPropertyAccessExpression(parent) ||
409 ▶     parent.expression !== node ||
410 ▶     !ts.isIdentifier(parent.name)
411 │   ) {
412 │     return false;
413 │   }
414 │ 
415 ▶   const declaration = reflection.getDeclarationOfIdentifier(node);
416 │   return (
417 │     declaration !== null &&
418 ▶     ts.isEnumDeclaration(declaration.node) &&
419 ▶     !!declaration.node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ConstKeyword)
420 │   );
421 │ }
```

const enum は TypeScript が使う場所に値を埋め込み（`"l" /* Size.Large */`）、JS には enum のオブジェクトが残りません。そのため名前をそのまま引数に渡すことはできません。406〜413 行目で `Foo.bar` の形の左の識別子に限って、415〜420 行目で宣言が `const` の付いた enum かを確かめ、107〜108 行目で第 5 回の静的な評価（[PartialEvaluator](05-ngtsc-partial-evaluator.md)）に enum 全体を評価させます。結果の Map を 113〜125 行目でメンバーごとのリテラルにし、134 行目でオブジェクトのリテラルにします。値が文字列・数・真偽・`null` 以外なら 130 行目で `null` を返し、5 節の 75〜77 行目で依存の一覧ごと `null`、つまりこのコンポーネントは HMR しません。それ以外の名前は 138 行目、ただの変数の読みです。

## 8. getHmrUpdateDeclaration：出力の AST を TypeScript に訳し、export default を付ける

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/update_declaration.ts` L25–59 （▶ の行: 31–32, 35–38, 40, 42, 46, 49–50）

```ts
25 │ export function getHmrUpdateDeclaration(
26 │   compilationResults: CompileResult[],
27 │   constantStatements: o.Statement[],
28 │   meta: R3HmrMetadata,
29 │   declaration: ClassDeclaration,
30 │ ): ts.FunctionDeclaration {
31 ▶   const namespaceSpecifiers = meta.namespaceDependencies.reduce((result, current) => {
32 ▶     result.set(current.moduleName, current.assignedName);
33 │     return result;
34 │   }, new Map<string, string>());
35 ▶   const importRewriter = new HmrModuleImportRewriter(namespaceSpecifiers);
36 ▶   const importManager = new ImportManager({
37 ▶     ...presetImportManagerForceNamespaceImports,
38 ▶     rewriter: importRewriter,
39 │   });
40 ▶   const callback = compileHmrUpdateCallback(compilationResults, constantStatements, meta);
41 │   const sourceFile = ts.getOriginalNode(declaration).getSourceFile();
42 ▶   const node = translateStatement(sourceFile, callback, importManager) as ts.FunctionDeclaration;
43 │ 
44 │   // The output AST doesn't support modifiers so we have to emit to
45 │   // TS and then update the declaration to add `export default`.
46 ▶   return ts.factory.updateFunctionDeclaration(
47 │     node,
48 │     [
49 ▶       ts.factory.createToken(ts.SyntaxKind.ExportKeyword),
50 ▶       ts.factory.createToken(ts.SyntaxKind.DefaultKeyword),
51 │     ],
52 │     node.asteriskToken,
53 │     node.name,
54 │     node.typeParameters,
55 │     node.parameters,
56 │     node.type,
57 │     node.body,
58 │   );
59 │ }
```

📄 `angular/packages/compiler-cli/src/ngtsc/hmr/src/update_declaration.ts` L61–75 （▶ の行: 64–65）

```ts
61 │ class HmrModuleImportRewriter {
62 │   constructor(private readonly lookup: Map<string, string>) {}
63 │ 
64 ▶   rewriteNamespaceImportIdentifier(specifier: string, moduleName: string): string {
65 ▶     return this.lookup.has(moduleName) ? this.lookup.get(moduleName)! : specifier;
66 │   }
67 │ 
68 │   rewriteSymbol(symbol: string): string {
69 │     return symbol;
70 │   }
71 │ 
72 │   rewriteSpecifier(specifier: string): string {
73 │     return specifier;
74 │   }
75 │ }
```

1. **31〜34 行目：モジュール名 → 割り当てた名前**

   `'@angular/core' → 'ɵhmr0'` の Map を作ります。
2. **35〜39 行目：import を作らない ImportManager**

   ImportManager は、出力の AST の `ExternalExpr` を TypeScript に訳すときに import 文を足す係です（[compiler-reify-emit](../compiler/16-compiler-reify-emit.md)）。ここでは名前空間の import に寄せる設定に、64〜65 行目の書き換え役を付け、`i0.ɵɵdefineComponent` になるはずの所を `ɵhmr0.ɵɵdefineComponent` にします。`ɵhmr0` は引数 `ɵɵnamespaces` から取り出す変数なので、import 文は要りません。
3. **40 行目：関数の形は @angular/compiler が作る**

   `compileHmrUpdateCallback`（[cli-hmr](../cli/11-cli-hmr.md) の 4 節で引用した `r3_hmr_compiler.ts`）が、引数（クラス・`ɵɵnamespaces`・ローカルな値）と本体（`const ɵhmr0 = ɵɵnamespaces[0]`・定数・`Cmp.ɵfac = …`・`Cmp.ɵcmp = …`・後ろの文）を並べた `DeclareFunctionStmt` を返します。
4. **42 行目：TypeScript の AST に訳す**

   `translateStatement` は、ふだんの emit でも使う訳し手です。
5. **46〜58 行目：export default を足す**

   44〜45 行目のコメントのとおり、出力の AST には修飾子（`export` など）を書けないので、TypeScript の関数の宣言を作り直して 49〜50 行目の 2 つの token を付けます。

| だれが | 何をするか |
| --- | --- |
| compiler-cli（ngtsc/hmr） | TypeScript のファイルを見て、どの名前がファイルの上の値か・const enum か・型だけの import かを決める。ファイルのパスを決める。TypeScript の宣言にして `export default` を付ける |
| @angular/compiler（r3\_hmr\_compiler.ts） | 受け取った `R3HmrMetadata` と定義から、出力の AST で関数の形（引数の並び・本体）と、待ち受けのコードを組む。TypeScript を知らない |

## 9. DEMO：本物の NgCompiler で 2 回コンパイルする

> **🧪 記録の再生：\_enableHmr なし・ありの emit と、emitHmrUpdateModule の出力**
>
> これは記録です。@angular/compiler-cli 22.1.6（TypeScript 6.0.3）を Node で動かした結果を、このページに持っています（ブラウザではコンパイラを動かさない）。入力は 3 つのファイルで、`app/cmp.ts` のコンポーネントが、同じファイルの const enum と InjectionToken、別のファイルの pipe と関数を使います。記録に使ったスクリプトの全文はこの DEMO の最後にあります。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngtsc-hmr)

- 「足された行だけ」の `const id = "app%2Fcmp.ts%40Cmp"` の `app/cmp.ts` は、4 節の 51〜52 行目で `rootDir` からの相対パスにしたものです。
- `spec-directive` と `real-directive` はどちらも `null` ですが、道が違います。前者は `Component` が import されていないので（TypeScript の 2304）、Angular のデコレーターとして見つからず、2 節の 743 行目で止まります。後者は @Directive の trait があり、754 行目のメソッドが無いので止まります。

## ここまでの呼び出し

- 👤 `compiler.emitHmrUpdateModule(node)` — CLI の AotCompilation（cli-hmr）
  - `traitCompiler.compileHmrUpdateCallback(node)` — transform/src/compilation.ts 737 — *Resolved・メソッドあり・エラーなしの trait*
    - `ComponentDecoratorHandler.compileHmrUpdateDeclaration` — annotations/component/src/handler.ts 1785 — *新しい ConstantPool で ɵfac・ɵcmp を作り直す*
      - `extractHmrMetatadata` — hmr/src/metadata.ts 46 — *パスと依存*
        - `extractHmrDependencies` — hmr/src/extract\_dependencies.ts 43 — *出力の AST を歩く → ファイルの上の名前と重ねる*
          - `getRuntimeRepresentation` — extract\_dependencies.ts 101 — *const enum はオブジェクトのリテラル*
      - `getHmrUpdateDeclaration` — hmr/src/update\_declaration.ts 25
        - `compileHmrUpdateCallback` — @angular/compiler r3\_hmr\_compiler.ts（cli-hmr） — *関数の形*
        - `translateStatement` → `export default` — update\_declaration.ts 42・46
  - `printNode` → `ts.transpileModule` — core/src/compiler.ts 1005 から（cli-hmr） — *ES2022 の文字列*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| compiler-cli/test/ngtsc/hmr\_spec.ts（1023 行） | describe `HMR code generation`（18 行目）に it が 26 個。`runInEachFileSystem`（[第 19 回](19-ngtsc-test-env.md)）で包まれているので、4 つの偽のファイルシステムで 104 回走ります。依存の集め方は 407〜930 行目の `should capture …` の 9 個と `should pass const enum …` の 2 個です。 | `//packages/compiler-cli/test/ngtsc:ngtsc`（shard 4） |
| ngtsc/hmr/ に単体テストは無い | `hmr/BUILD.bazel` は `ts_project` だけで、`test/` のディレクトリがありません。 | — |

📄 `angular/packages/compiler-cli/test/ngtsc/hmr_spec.ts` L106–135 （▶ の行: 106, 109, 112, 118–119, 128, 130, 132–134）

```ts
106 ▶       env.driveMain();
107 │ 
108 │       const jsContents = env.getContents('test.js');
109 ▶       const hmrContents = env.driveHmr('test.ts', 'Cmp');
110 │ 
111 │       expect(jsContents).toContain(`import * as i0 from "@angular/core";`);
112 ▶       expect(jsContents).toContain('const id = "test.ts%40Cmp";');
113 │       expect(jsContents).toContain('function Cmp_HmrLoad(t) {');
114 │       expect(jsContents).toContain(
115 │         'import(/* @vite-ignore */\ni0.ɵɵgetReplaceMetadataURL(id, t, import.meta.url)',
116 │       );
117 │       expect(jsContents).toContain(
118 ▶         ').then(m => m.default && i0.ɵɵreplaceMetadata(Cmp, m.default, [i0], ' +
119 ▶           '[Dep, transformValue, TOKEN, Component, Inject, ViewChild, Input], import.meta, id));',
120 │       );
121 │       expect(jsContents).toContain('Cmp_HmrLoad(Date.now());');
122 │       expect(jsContents).toContain(
123 │         'import.meta.hot && import.meta.hot.on("angular:component-update", ' +
124 │           'd => d.id === id && Cmp_HmrLoad(d.timestamp)',
125 │       );
126 │ 
127 │       expect(hmrContents).toContain(
128 ▶         'export default function Cmp_UpdateMetadata(Cmp, ɵɵnamespaces, Dep, transformValue, TOKEN, Component, Inject, ViewChild, Input) {',
129 │       );
130 ▶       expect(hmrContents).toContain(`const ɵhmr0 = ɵɵnamespaces[0];`);
131 │       expect(hmrContents).toContain('Cmp.ɵfac = function Cmp_Factory');
132 ▶       expect(hmrContents).toContain('Cmp.ɵcmp = /*@__PURE__*/ ɵhmr0.ɵɵdefineComponent');
133 ▶       expect(hmrContents).toContain('ɵhmr0.ɵsetClassMetadata(Cmp,');
134 ▶       expect(hmrContents).toContain('ɵhmr0.ɵsetClassDebugInfo(Cmp,');
135 │     });
```

106 行目の `env.driveMain()` が待ち受けのコードの入った `test.js` を書き、109 行目の `env.driveHmr` が `emitHmrUpdateModule` を呼びます（driveHmr の中身は [第 19 回](19-ngtsc-test-env.md)）。119 行目の配列と 128 行目の引数の並びが同じ順なのは、3 節の注意のとおりです。130 行目の `ɵhmr0` は 6 節の 88 行目、132 行目は 8 節の書き換えです。

📄 `angular/packages/compiler-cli/test/ngtsc/hmr_spec.ts` L841–851 （▶ の行: 846, 849）

```ts
841 │       env.driveMain();
842 │ 
843 │       const jsContents = env.getContents('test.js');
844 │       const hmrContents = env.driveHmr('test.ts', 'Cmp');
845 │       expect(jsContents).toContain(
846 ▶         'ɵɵreplaceMetadata(Cmp, m.default, [i0], [token, { one: 0, two: "2", three: 3 }, Component], import.meta, id));',
847 │       );
848 │       expect(hmrContents).toContain(
849 ▶         'export default function Cmp_UpdateMetadata(Cmp, ɵɵnamespaces, token, Foo, Component) {',
850 │       );
851 │     });
```

846 行目、7 節の `{ one: 0, two: "2", three: 3 }`。`three = numberThree` のような別の定数を使ったメンバーも、静的な評価で 3 になります。849 行目の引数の名前は `Foo` のままです。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/compiler-cli/test/ngtsc:ngtsc \
  --nocache_test_results --test_output=all \
  '--test_arg=--filter=HMR code generation'
```

📄 `出力（2026-11-05 に実行。抜粋。ログは scratchpad/ngtsc-logs/e-hmr.log）`

```
Ran 26 of 6676 specs
26 specs, 0 failures
Ran 26 of 6676 specs
26 specs, 0 failures
Ran 26 of 6676 specs
26 specs, 0 failures
Ran 26 of 6676 specs
26 specs, 0 failures
INFO: Elapsed time: 4.544s, Critical Path: 3.92s
//packages/compiler-cli/test/ngtsc:ngtsc                                 PASSED in 3.7s
```

- 4 つの shard がそれぞれ「Ran 26」です。rules\_jasmine の runner（bazel の external の `aspect_rules_jasmine+/jasmine/private/runner.cjs`）は、92〜93 行目で spec の通し番号を shard の数（4）で割った余りで受け持ちを決めます。26 個の it × 4 つのファイルシステム = 104 個が 4 つに分かれたので、足すと 104 です。「of 6676」はその shard が受け持つ spec の数で、フィルターに合った数ではありません。

### 直すとしたら

- 「HMR で変数が見つからない（ReferenceError）」系の不具合は、ほとんどが 5 節の `isTopLevelIdentifierReference` の取りこぼしです。親の節の種類を 1 つ足して、hmr\_spec.ts に `should capture … dependencies` の it を 1 つ足す形になります（同じ形の it が 9 個あります）。
- 「HMR のあと値が変わる」系は、7 節の `getRuntimeRepresentation` と、3 節の注意（依存の順）を疑います。
- hmr\_spec.ts の 378〜392 行目の it は名前と中身が食い違っています（下の引用）。名前は「HMR に対応していない Angular のクラス」ですが、383 行目で `Directive` を import して、385 行目で `@Component` と書いています。9 節の DEMO の `spec-directive` で確かめたとおり、この入力は TypeScript の 2304（`Cannot find name 'Component'`）になり、Angular のデコレーターとして見つからないので 2 節の 743 行目で `null` になります。つまりこの it は、394 行目の「デコレーターの無いクラス」と同じ道しか通っていません。@Directive に直しても結果は同じ `null`（DEMO の `real-directive`、754 行目の道）なので、テストが落ちることはありません。main（2026-11-05 に `gh api` で取得）でも同じ形でした。

📄 `angular/packages/compiler-cli/test/ngtsc/hmr_spec.ts` L378–405 （▶ の行: 378, 383, 385, 391, 394, 399）

```ts
378 ▶     it('should not generate an HMR update function for an Angular class that does not support HMR', () => {
379 │       enableHmr();
380 │       env.write(
381 │         'test.ts',
382 │         `
383 ▶           import {Directive} from '@angular/core';
384 │ 
385 ▶           @Component({selector: '[dir]'})
386 │           export class Dir {}
387 │         `,
388 │       );
389 │ 
390 │       const hmrContents = env.driveHmr('test.ts', 'Dir');
391 ▶       expect(hmrContents).toBe(null);
392 │     });
393 │ 
394 ▶     it('should not generate an HMR update function for an undecorated class', () => {
395 │       enableHmr();
396 │       env.write(
397 │         'test.ts',
398 │         `
399 ▶           export class Foo {}
400 │         `,
401 │       );
402 │ 
403 │       const hmrContents = env.driveHmr('test.ts', 'Foo');
404 │       expect(hmrContents).toBe(null);
405 │     });
```

- 上の食い違いは、本家に PR を出す前に「名前どおりの道を通る it はどう書くか（@Directive に直す）」を手元の spec で確かめる練習の題材になります。この章では PR は勧めません。
- HMR の issue は `area: compiler` より、CLI の側（angular-cli の `hmr`）に立つことが多いです。コンパイラの側の行に当たるかは、まず `env.driveHmr` の形で再現できるかで見分けます（[第 20 回](20-ngtsc-issues.md)）。

## 聞かれそうな質問

**Q. HMR の更新モジュールは、なぜ import を書かずに引数で依存を受け取るのですか？**

更新モジュールはブラウザで `import()` して関数を 1 つ呼ぶだけのもので、元のファイルのモジュールの中身（同じファイルの const など）には外から触れません。そこで、元のファイルに足した待ち受けのコードが、その場で見える値を配列にして `ɵɵreplaceMetadata` に渡し、更新モジュールはそれを引数で受けます（[cli-hmr](../cli/11-cli-hmr.md) の 4 節と、この章の 6 節）。名前空間だけは `ɵɵnamespaces` の配列で受け、8 節の 64〜65 行目で `ɵhmr0` に書き換えます。

**Q. @Directive や @Pipe を書き換えても HMR になりませんか？**

なりません。`compileHmrUpdateDeclaration` は `DecoratorHandler` の任意のメソッドで（api.ts の 221 行目）、実装しているのはコンポーネントの handler だけです。2 節の 754 行目で条件を外れて `null` になり、CLI はページ全体を読み直します。

**Q. 同じファイルの const を HMR が拾わないことがあるのはなぜですか？**

拾うのは「ファイルの上の名前」かつ「コンパイルした ɵcmp・ɵfac・setClassMetadata などが読む名前」だけだからです（6 節の 72 行目）。クラスのフィールドの初期値やメソッドの中で使う const は、クラスの本体に残って ɵcmp が読まないので要りません。

**Q. const enum を providers で使うと HMR が切れることがありますか？**

メンバーの値が文字列・数・真偽・`null` のどれかなら、7 節の 113〜125 行目でオブジェクトのリテラルにして渡すので切れません。それ以外の値（静的に評価できないもの）だと 130 行目で `null` になり、そのコンポーネントは待ち受けのコードも更新モジュールも作りません。

**Q. テンプレートにエラーがある状態で保存したら？**

2 節の 755〜756 行目（解析・解決の診断にエラー）か、3 節の 1790〜1792 行目（テンプレートの構文エラー）で `null` です。CLI は更新を送らずに通常の再ビルドに戻るので、画面にはエラーが出ます。

## 読み終えて

- 更新モジュールは emitHmrUpdateModule → TraitCompiler.compileHmrUpdateCallback → ComponentDecoratorHandler.compileHmrUpdateDeclaration の順で作られ、実装を持つのはコンポーネントの handler だけ。
- 依存は「出力の AST が読む名前」と「ファイルの上の値の名前」の重なり。型の import・interface・クラスの本体でしか使わない const は入らない。
- const enum は値が残らないので、静的に評価してオブジェクトのリテラルで渡す。評価できなければ HMR しない。
- 関数の形は @angular/compiler、TypeScript の判断と export default は compiler-cli、と分かれている。

---

← 前: [import の循環：CycleAnalyzer と、スコープを外から設定する逃げ道](16-ngtsc-cycles.md)  
次: [診断と性能の記録：FatalDiagnosticError・ErrorCode・PerfRecorder](18-ngtsc-diagnostics-perf.md) →
