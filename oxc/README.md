[目次](../README.md)

# oxc の変換と TypeScript の transformer の内側：ビルドが JavaScript を書き換える行

> transform の 1 回の走査・後順の走査・linker の AST host と文字列の factory・JIT と Worker の transformer・spec と issue

@angular/build は、TypeScript をコンパイルしたあとの JavaScript を、もう一度 oxc-parser で読んで書き換えています。部分コンパイルのライブラリを仕上げる linker、tree shaking のための pure の印、Angular のメタデータの削除、静的メンバーと enum の包み直しが、1 回の走査にまとめられています。既存の cli-javascript-transformer と cli-linker の章が大筋を書いたので、このシリーズはその内側に入ります。transform 関数の判定（tslib と babel のヘルパー、isPure、静的プロパティの解析）、スタックで書いた後順の走査、linker が部分宣言を読む OxcAstHost と出力を文字列で組む StringAstFactory を読みます。TypeScript の側で働く 3 つの transformer（JIT の resource の置き換え、bootstrap の置き換え、Web Worker）と、2026 年の修正と spec も読みます。

全 5 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/oxc)

1. [transform の 1 回の走査：何を見て、どこに印を付けるか](01-oxc-transform-pass.md)  
   tools/oxc/oxc-transform.ts の transform が、oxc-parser で読んだ AST を 1 回たどる間に、linker の呼び出し・pure の印・メタデータの削除・静的メンバーと enum の包み直しを、どの判定（tslib と babel のヘルパー名、isPure、canWrapProperty、analyzeClassStaticProperties）で決め、magic-string に書くか。enum と隣り合うクラスで構文が壊れた件の直し（bad31421cb・199a864df9・abd8ec9f3e）、source map の作り方（87551ad5c5・18e4b93a9f）、Bun が // コメントの中の pure の注釈を読んだ件（675f1f5274）。
2. [後順の走査：再帰を使わずスタックで AST をたどる](02-oxc-traversal.md)  
   tools/oxc/traversal.ts の traversePostOrder と pushChildNodes が、子を逆順に積み、関数とクラスの境目と TypeScript の型だけのノードを見分けながら、親より先に子を訪ねる仕組み。再帰からの書き換え（2b85529e82）と、linker と最適化の走査を 1 つにした変更（f4dad31cce）。
3. [linker の読み書き：OxcAstHost と StringAstFactory](03-oxc-linker-host.md)  
   tools/angular/linker の OxcAstHost が ɵɵngDeclare\* の引数（oxc の AST）を linker に読ませ、StringAstFactory が linker の出力を JavaScript の文字列で組み立てる行。リテラルの見分け方、getRange が行と桁を 0 で返すこと、括弧の付け方、オブジェクトのリテラルの印（a6d5aabfc3）、構文が壊れる件の直し（bad31421cb）、内側の source map を切る理由（7e5510e464）、origin/main の括弧の対応（43aab6a1cf）。
4. [TypeScript の transformer：JIT の resource・bootstrap の置き換え・Web Worker](04-oxc-ts-transformers.md)  
   tools/angular/transformers の createJitResourceTransformer・replaceBootstrap・createWorkerTransformer が、TypeScript の emit の途中で templateUrl と styles・styleUrl(s) を import に、platformBrowserDynamic を platformBrowser に（elideImports で使われない import を消す）、new Worker(new URL(...)) を束ねた出力の場所に書き換える行。どのコンパイル（AOT / JIT）で、どの順に差し込まれるか。origin/main の 174eb34540。
5. [spec と issue を読む：oxc の変換と transformer を固めているテスト](05-oxc-tests-issues.md)  
   tools/oxc と tools/angular/linker・transformers の spec が、このシリーズの各章の約束をどこで固めているか、手元での走らせ方と結果、作業木で行を変えて確かめた spec の無い行、関係する issue と PR の表、origin/main の続き。
