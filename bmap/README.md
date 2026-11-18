[目次](../README.md)

# ビルドの前と後：書いた HTML・CSS・class が何に変わるか

> コンポーネントの JS と DOM・スタイルの束と minify・index.html の仕上げ

小さなコンポーネント 1 つを本物の ng build（22.2.7）にかけ、書いたテンプレート・CSS・class と、ビルドが出した JS・CSS・index.html、ブラウザで動いたあとの DOM を並べて見るシリーズです。テンプレートのコンパイル、スタイルのカプセル化、class のバインディング、index.html への差し込みは、それぞれ既存の章が詳しく読んでいるので、ここでは「どこがどう変わったか」の見取り図を作り、各段の詳しい話はその章へ渡します。これまで薄かった CSS の minify と、index.html にクリティカルな CSS とフォントを埋め込む行は、ここでソースを引いて読みます。

全 3 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/bmap)

1. [コンポーネントの前と後：テンプレートと class は JS に、CSS は styles の文字列に](01-bmap-component.md)  
   \[class.x\]・@if・ng-content を使う小さなコンポーネントを ng build（development と production）にかけ、出力の JS の ɵcmp（template 関数の命令・consts・decls と vars・inputs のフラグ・styles の \[\_ngcontent-%COMP%\]）と、ブラウザで動いたあとの DOM（\_nghost-ng-c… と \_ngcontent-ng-c… の属性、付いた class、@if の目印のコメント）を並べる。production で消えるものと残るもの、styles が \_cN の変数になる条件（定数プール）、%COMP% が APP\_ID と定義の形のハッシュ（c663675611）に置き換わることを本物の値で確かめる。
2. [スタイルの前と後：コンポーネントの CSS とグローバルの CSS、minify・target・ファイル名](02-bmap-styles-bundle.md)  
   styleUrl の CSS が JS の中の文字列になり、angular.json の styles に書いた CSS が @import を並べた仮想の CSS を入口にする別の esbuild の実行で styles-&lt;hash&gt;.css になるまでの分かれ道。normalizeOptimization が配る styles.minify と removeSpecialComments、browserslist から作る esbuild の target で、空白・コメント・色・-webkit-・入れ子がどう変わり、使われない規則が残るか。outputHashing の 4 通りと inject: false の例外、url() の画像（css-resource-plugin）と Google Fonts の @import（css-inline-fonts-plugin）、22.2.7 で効いていないフォントのディスクのキャッシュ（4673cecf00 で修正）。
3. [index.html の前と後：script と link、重要な CSS とフォントの埋め込み、プリレンダーとの違い](03-bmap-index-html.md)  
   書いた index.html と、development・production（CSR）・開いたあとの DOM・プリレンダーの index.html を並べ、足されたものを 1 つずつたどる。プラグインの列と htmlRewritingStream、inline-critical-css.ts の beasties の設定が &lt;style&gt;・media="print"・noscript・media を戻す script になる行、CSR では .page-title が埋め込まれずプリレンダーでは埋め込まれる理由、inline-fonts.ts が Google Fonts の link を style にする行、nonce の写し方と fonts.inline による違い、valid-self-closing-tags が &lt;style/&gt; を通してしまうこと、auto-csp の仕組み。このシリーズで見つけたもの。
