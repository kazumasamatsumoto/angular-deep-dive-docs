[目次](../README.md) › [DOM レンダラーとイベントの内側](README.md) › 第 8 回 / 全 20 回

# CSS 変数の名前空間：provideCssVarNamespacing と %NS%

> 2026 年 5 月に入った新しい仕組み（#68846、v22.1.0 から）。コンパイラが全部のコンポーネントの CSS の --x（宣言・var()・@property）と \[style.--x\] の名前に %NS% を入れ（--global-- は外す）、renderer が CSS\_VAR\_NAMESPACE の値（provideCssVarNamespacing で「名前空間 + \_」、無ければ空文字）に置き換える行、CssVarNamespacer.namespace。ルートに置かないと効かない理由、書き換わらないもの（静的な style 属性・\[style\] のオブジェクト・値の中の var()・グローバルな CSS）と、マイクロフロントエンドで変数がぶつからない理由。

angular/angular · 読了 約 12 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/domr-css-var-namespacing)

---

2026 年 5 月、PR #68846 で「CSS 変数（カスタムプロパティ）の名前空間」が入りました（v22.1.0 から）。`provideCssVarNamespacing()` を足すと、コンポーネントの CSS の `--brand` が `--ng_brand` のように変わります。この章では、**コンパイラが名前に `%NS%` という印を入れる行**と、**実行時に renderer がその印を置き換える行**を順に読み、`[style.--x]` のバインディングと `CssVarNamespacer` がどう揃えているか、何が書き換わらないかを確かめます。

読む対象は compiler の `shadow_css.ts`・`util.ts`・`render3/view/compiler.ts`・`template_parser/binding_parser.ts`、platform-browser の `dom/dom_renderer.ts`・`dom/css_var_namespacer.ts` です。入ったコミットは `f98547675cd`（2026-05-19、CSS の中の変数）と `8c8b2f77831`（2026-05-20、バインディングの名前）の 2 つで、どちらも `git -C ../angular show --stat` で中身を見られます。

1. [1. 全体像](01-domr-overview.md)
2. [2. Renderer2 の約束](02-domr-renderer-api.md)
3. [3. DomRendererFactory2](03-domr-renderer-factory.md)
4. [4. 要素とテキスト](04-domr-default-renderer.md)
5. [5. 属性とプロパティ](05-domr-attributes-properties.md)
6. [6. カプセル化](06-domr-encapsulation.md)
7. [7. SharedStylesHost](07-domr-shared-styles.md)
8. **8. CSS 変数の名前空間**（この章）
9. [9. クラスとスタイル](09-domr-styling-overview.md)
10. [10. 優先順位のリスト](10-domr-style-binding-list.md)
11. [11. 値を決めて書く](11-domr-styling-apply.md)
12. [12. \[class\] と \[style\]](12-domr-styling-maps.md)
13. [13. EventManager](13-domr-event-manager.md)
14. [14. listen](14-domr-listen.md)
15. [15. キーのイベント](15-domr-key-events.md)
16. [16. 自分のプラグイン](16-domr-custom-plugin.md)
17. [17. サニタイズ](17-domr-sanitization.md)
18. [18. 信頼の印](18-domr-trusted-types.md)
19. [19. Title と Meta](19-domr-title-meta.md)
20. [20. issue と PR を読む](20-domr-issues.md)

## 1. 何が困るのか

Emulated のカプセル化は**セレクタ**を閉じ込めますが、CSS 変数の値は DOM の親から子へ継承されます。あるアプリが自分のルートの `:host` に `--primary: red` を置き、その DOM の中に別のアプリ（マイクロフロントエンド）が埋め込まれて `var(--primary)` を読むと、外のアプリの値を拾ってしまいます。名前空間は、アプリごとに変数の名前そのものを変えて、この継承のつながりを切る仕組みです。

作りは 2 段です。**コンパイラは、どのアプリでも名前に `%NS%` を入れておき**、**実行時に `%NS%` を「名前空間 + `_`」か空文字に置き換えます**。何も設定しないアプリでは空文字に置き換わるので、見た目は今までと同じ名前になります。

## 2. コンパイラ：CSS の中の変数に %NS% を入れる

📄 `angular/packages/compiler/src/shadow_css.ts` L1052–1082 （▶ の行: 1054, 1066–1067, 1077–1078, 1080）

```ts
1052 │ // Matches any CSS variable name, defined by a double-hyphen followed by any valid ident.
1053 │ // https://www.w3.org/TR/css-syntax-3/#ident-token-diagram
1054 ▶ const _cssVariableRe = /(var\(\s*|@property\s+)?(--(?:[a-zA-Z0-9_-]|[^\x00-\x7F])+)(\s*:)?/g;
1055 │ 
1056 │ /**
1057 │  * Transforms CSS variables within a stylesheet to include a namespace placeholder.
1058 │  *
1059 │  * E.g. `--foo: bar;` becomes `--%NS%foo: bar;`
1060 │  * E.g. `color: var(--foo);` becomes `color: var(--%NS%foo);`
1061 │  * E.g. `@property --foo` becomes `@property --%NS%foo`
1062 │  *
1063 │  * If a variable is prefixed with `--global--`, it is NOT namespaced and the prefix is removed.
1064 │  * E.g. `--global--mycolor: red;` becomes `--mycolor: red;`
1065 │  */
1066 ▶ export function namespaceCssVariables(cssText: string): string {
1067 ▶   return cssText.replace(_cssVariableRe, (match, prefix, varName, trailingColon) => {
1068 │     // Check for a leading `var(`, `@property`, or trailing `:` to approximate whether we're
1069 │     // operating on a real CSS variable, not another piece of syntax that resembles it.
1070 │     // For example, this guards against:
1071 │     // - `.foo--bar {}`
1072 │     // - `/* --foo */`
1073 │     // - `p { content: "--foo" }`
1074 │     // - `[data---bar] {}`
1075 │     // - `[data-status=foo--bar] {}`
1076 │     // etc.
1077 ▶     if (!prefix && !trailingColon) {
1078 ▶       return match;
1079 │     }
1080 ▶     return (prefix ?? '') + namespaceCssVariable(varName) + (trailingColon ?? '');
1081 │   });
1082 │ }
```

1054 行目の正規表現は「`--` で始まる名前」を探し、その前の `var(` か `@property`、後ろの `:` も一緒に捕まえます。1077〜1079 行目で、前にも後ろにも何も無ければ書き換えません。`.foo--bar` のクラス名や、コメント・文字列の中の `--foo` を変数と取り違えないための近似で、1068〜1076 行目のコメントに例が並んでいます。`@property` は 2026-09 のコミット `9b80d4ce9e0`（#70613）で足されました。

📄 `angular/packages/compiler/src/util.ts` L153–177 （▶ の行: 161, 163–164, 172–173, 175）

```ts
153 │ /**
154 │  * Namespaces a CSS variable name and validates its syntax.
155 │  *
156 │  * @param varName The CSS variable name starting with `--`.
157 │  * @throws An Error if the CSS variable is invalid (e.g. has a single hyphen after "--global").
158 │  * @returns The namespaced CSS variable name.
159 │  */
160 │ export function namespaceCssVariable(varName: string): string {
161 ▶   // TODO: Enforce this in v23. This is a breaking change.
162 │   //       Enable tests under platform-browser and compiler matching "has a single hyphen".
163 ▶   // g3-only-start
164 ▶   // if (varName.startsWith('--global-') && !varName.startsWith('--global--')) {
165 │   //   throw new Error(
166 │   //     `CSS variable "${varName}" has a single hyphen after "--global". ` +
167 │   //       `Use two hyphens ("--global--${varName.substring('--global-'.length)}") to opt-out of namespacing.`,
168 │   //   );
169 │   // }
170 │   // g3-only-end
171 │ 
172 ▶   if (varName.startsWith('--global--')) {
173 ▶     return '--' + varName.substring('--global--'.length);
174 │   } else {
175 ▶     return '--%NS%' + varName.substring('--'.length);
176 │   }
177 │ }
```

1 つの名前の書き換えはこの関数です。172〜173 行目、`--global--` で始まる名前は名前空間の対象外で、`--global` を取って `--mycolor` にします。それ以外は 175 行目で `--` の直後に `%NS%` を入れます。`--brand` → `--%NS%brand` です。

161〜170 行目はコメントになった確認で、`--global-brand`（ハイフンが 1 つ）をエラーにする予定のものです。2026-06 のコミット `d579ecaf733` で、Google の社内（g3）でだけ有効にし、161 行目の TODO のとおり v23 で全員に入れる予定になっています。今は `--global-brand` も 175 行目で普通に名前空間に入ります。

📄 `angular/packages/compiler/src/render3/view/compiler.ts` L271–277 （▶ の行: 272, 274–276）

```ts
271 │   if (meta.styles && meta.styles.length) {
272 ▶     const namespacedStyles = meta.styles.map((s) => namespaceCssVariables(s));
273 │     const styleValues =
274 ▶       meta.encapsulation == core.ViewEncapsulation.Emulated
275 ▶         ? compileStyles(namespacedStyles, CONTENT_ATTR, HOST_ATTR)
276 ▶         : namespacedStyles;
277 │     const styleNodes = styleValues.reduce((result, style) => {
```

呼ぶのはコンポーネントのコンパイルの入口で、272 行目は**カプセル化の値にも、アプリの設定にも関係なく**全部の `styles` に `namespaceCssVariables` をかけます。そのあと 274〜275 行目で Emulated だけ `[_ngcontent-%COMP%]` の書き換え（[compiler-shadow-css](../compiler/18-compiler-shadow-css.md)）をします。コンパイラはアプリが `provideCssVarNamespacing` を使うかどうかを知らないので、印だけ入れて決定を実行時に回す形です。

📄 `angular/packages/compiler-cli/linker/src/file_linker/partial_linkers/partial_component_linker_1.ts` L85–88 （▶ の行: 86–87）

```ts
85 │   ): LinkedDefinition {
86 ▶     const meta = this.toR3ComponentMeta(metaObj, version);
87 ▶     return compileComponentFromMetadata(meta, constantPool, makeBindingParser());
88 │   }
```

npm のライブラリ（部分コンパイルされた `ɵɵngDeclareComponent`）も、アプリのビルドの中のリンカーが 87 行目で同じ `compileComponentFromMetadata` を呼ぶので、**ライブラリのコンポーネントの CSS も、アプリのビルドのときに `%NS%` が入ります**（リンカーは [compiler](../compiler/01-compiler.md)）。「テストと直し方」の #70064 はこの行の結果です。

## 3. バインディングの名前にも %NS%

📄 `angular/packages/compiler/src/template_parser/binding_parser.ts` L597–603 （▶ の行: 597–598, 602）

```ts
597 ▶         const boundName = parts[1];
598 ▶         if (!boundName.startsWith('--')) {
599 │           boundPropertyName = boundName;
600 │         } else {
601 │           try {
602 ▶             boundPropertyName = namespaceCssVariable(boundName);
603 │           } catch (e) {
```

📄 `angular/packages/compiler/src/template/pipeline/src/phases/host_style_property_parsing.ts` L38–50 （▶ の行: 42–43, 45）

```ts
38 │     if (op.name.startsWith(STYLE_DOT)) {
39 │       op.bindingKind = ir.BindingKind.StyleProperty;
40 │       op.name = op.name.substring(STYLE_DOT.length);
41 │ 
42 ▶       if (!isCssCustomProperty(op.name)) {
43 ▶         op.name = hyphenate(op.name);
44 │       } else {
45 ▶         op.name = namespaceCssVariable(op.name);
46 │       }
47 │ 
48 │       const {property, suffix} = parseProperty(op.name);
49 │       op.name = property;
50 │       op.unit = suffix;
```

テンプレートの `[style.--x]` は binding\_parser の 598 行目で `--` を見て、602 行目で 2 節と同じ関数にかけます。`host: {'[style.--x]': …}` のホストのバインディングは別の道（host\_style\_property\_parsing）を通り、45 行目で同じことをします。どちらもコミット `8c8b2f77831` で入った行です。結果として命令は `ɵɵstyleProp("--%NS%x", …)` になります（命令から renderer の `setStyle` までは [第 11 回](11-domr-styling-apply.md)）。

## 4. 実行時：CSS\_VAR\_NAMESPACE で %NS% を置き換える

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L76–101 （▶ の行: 82, 93, 96–98）

```ts
 76 │ /**
 77 │  * An injection token that allows an application to configure a prefix to be used for all
 78 │  * CSS variables generated compiled with CSS namespacing enabled.
 79 │  *
 80 │  * Typically set via {@link provideCssVarNamespacing}.
 81 │  */
 82 ▶ export const CSS_VAR_NAMESPACE = new InjectionToken<string>(
 83 │   typeof ngDevMode !== 'undefined' && ngDevMode ? 'CSS_VAR_NAMESPACE' : '',
 84 │ );
 85 │ 
 86 │ /**
 87 │  * Configures the application to use the given namespace for all CSS variables.
 88 │  *
 89 │  * @param namespace The prefix string to use as a namespace. If not provided, it defaults
 90 │  *     to the `APP_ID`. An underscore is appended unconditionally.
 91 │  * @publicApi
 92 │  */
 93 ▶ export function provideCssVarNamespacing(namespace?: string): EnvironmentProviders {
 94 │   return makeEnvironmentProviders([
 95 │     {
 96 ▶       provide: CSS_VAR_NAMESPACE,
 97 ▶       useFactory: (appId: string) => `${namespace ?? appId}_`,
 98 ▶       deps: [APP_ID],
 99 │     },
100 │   ]);
101 │ }
```

82 行目のトークン `CSS_VAR_NAMESPACE` に、93 行目の `provideCssVarNamespacing` が値を入れます。97 行目で、引数があればそれ、無ければ 98 行目で受け取った `APP_ID`（既定 `ng`）に、**必ず `_` を 1 つ足します**。`provideCssVarNamespacing('my-app_')` と書くと `my-app__` になります。

このトークンを読むのは `DomRendererFactory2` のコンストラクタで、`@Optional()` で受け取り、無ければ空文字にして、作る全部のレンダラーに渡します（コンストラクタは [第 3 回](03-domr-renderer-factory.md)で引用）。**読むのはファクトリが作られるときの 1 回だけ**なので、ファクトリと同じアプリのルートの providers に置かないと効きません。ルートの一部の providers に置いても、もう作られたファクトリは読み直しません。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L669–671 （▶ の行: 670–671）

```ts
669 │ 
670 ▶     const shimmed = compId ? shimStylesContent(compId, styles) : styles;
671 ▶     this.styles = shimmed.map((s) => s.replace(/%NS%/g, cssVarNamespace));
```

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L587–589 （▶ の行: 587–588）

```ts
587 ▶     styles = shimStylesContent(component.id, styles).map((s) =>
588 ▶       s.replace(/%NS%/g, cssVarNamespace),
589 │     );
```

コンポーネントの CSS の置き換えは、Emulated・None のレンダラーの 671 行目と、ShadowDom の 587〜588 行目です。どちらも `%COMP%` の置き換えのすぐあとに、`/%NS%/g` で全部を置き換えます。名前空間が無ければ空文字になり、`--%NS%brand` は `--brand` に戻ります。

📄 `angular/packages/platform-browser/src/dom/dom_renderer.ts` L438–443 （▶ の行: 438, 440, 442–443）

```ts
438 ▶     const isVariable = style.startsWith('--');
439 │     if (isVariable) {
440 ▶       style = style.replace('%NS%', this.cssVarNamespace);
441 │     }
442 ▶     if (isVariable || flags & (RendererStyleFlags2.DashCase | RendererStyleFlags2.Important)) {
443 ▶       el.style.setProperty(style, value, flags & RendererStyleFlags2.Important ? 'important' : '');
```

バインディングの名前は `setStyle` で置き換えます。438 行目で名前が `--` で始まれば、440 行目で `%NS%` を置き換え、442〜443 行目で `el.style.setProperty` に渡します （`removeStyle` も同じ形。`setStyle` の残りは [第 11 回](11-domr-styling-apply.md)）。`%NS%` の入っていない名前はそのままなので、`Renderer2.setStyle(el, '--x', v)` と自分で書いた名前は名前空間に入りません。

## 5. TypeScript から：CssVarNamespacer

📄 `angular/packages/platform-browser/src/dom/css_var_namespacer.ts` L19–46 （▶ の行: 19, 21, 33–34, 43, 45）

```ts
19 ▶ @Service()
20 │ export class CssVarNamespacer {
21 ▶   private readonly namespacePrefix = inject(CSS_VAR_NAMESPACE, {optional: true}) ?? '';
22 │ 
23 │   /**
24 │    * Prepends the namespace prefix to a CSS variable name.
25 │    *
26 │    * @param name The CSS variable name to namespace, including the leading `--`.
27 │    * @returns The namespaced CSS variable name, including the leading `--`. Returns the input
28 │    *     unchanged if no namespace is configured.
29 │    */
30 │   namespace(name: string): string {
31 │     // Validate that the whole `--foo` variable is passed in.
32 │     if (typeof ngDevMode === 'undefined' || ngDevMode) {
33 ▶       if (!name.startsWith('--')) {
34 ▶         throw new Error(
35 │           `CSS variable names passed to \`CssVarNamespacer\` must start with '--', got: '${name}'`,
36 │         );
37 │       }
38 │     }
39 │ 
40 │     // We want to support libraries which might be used by applications which do and don't
41 │     // namespace variables. Therefore the library always needs to use `CssVarNamespacer`, even
42 │     // though the application may not actually be namespacing anything.
43 ▶     if (!this.namespacePrefix) return name;
44 │ 
45 ▶     return `--${this.namespacePrefix}${name.substring('--'.length)}`;
46 │   }
```

`element.style.setProperty('--brand', …)` のように DOM の API で変数を書くときは、名前を自分で揃える必要があります。`CssVarNamespacer.namespace('--brand')` は、21 行目で同じ `CSS_VAR_NAMESPACE` を読み、45 行目で `--ng_brand` を返します。名前空間が無ければ 43 行目でそのまま返すので、ライブラリは設定の有無を気にせず呼べます（40〜42 行目のコメント）。33〜34 行目、開発モードでは `--` から渡さないとエラーです。

📄 `angular/packages/core/src/di/interface/service.ts` L29–35 （▶ の行: 32）

```ts
29 │ }): ɵɵInjectableDeclaration<T> {
30 │   return {
31 │     token: opts.token,
32 ▶     providedIn: opts.autoProvided === false ? null : 'root',
33 │     factory: opts.factory,
34 │     value: undefined,
35 │   };
```

19 行目の `@Service()` は、32 行目のとおり `providedIn: 'root'` の定義になります（`@Service` の全体は [boot-injectors](../boot/08-boot-injectors.md)）。つまり `CssVarNamespacer` はルートのインジェクタで 1 つ作られ、ルートの `CSS_VAR_NAMESPACE` を読みます。これもルートに置かないと揃わない理由の 1 つです（7 節のデモで確かめます）。

## 6. 書き換わらないもの

コンパイラが名前を知っている場所だけが書き換わります。次のものは書いた名前のままで、何もエラーになりません。

| 書き方 | 書き換わる？ | 理由（行） |
| --- | --- | --- |
| コンポーネントの `styles` の `--x: …`・`var(--x)`・`@property --x` | はい | 2 節の 272 行目 → 1080 行目 |
| `[style.--x]`・ホストの `'[style.--x]'` | はい | 3 節の 602 行目・45 行目 → 4 節の 440 行目 |
| 静的な `style="--x: 1"`（ホストの `'style'` も） | いいえ | 静的なスタイルは `consts` の `[2, "--x", "1"]` になり、`%NS%` が入らない（7 節のデモ） |
| `[style]="{'--x': v}"`・`[style]="'--x: 1'"`・`ngStyle` | いいえ | キーはコンパイラが知らない実行時の値。setStyle の 438〜440 行目に届くが `%NS%` が無い |
| `[style.color]="'var(--x)'"` の値の中 | いいえ | 値は書き換えない（#70063） |
| `Renderer2.setStyle(el, '--x', v)` | いいえ | 440 行目は `%NS%` があるときだけ置き換える。`CssVarNamespacer` を使う |
| `angular.json` の `styles` などのグローバルな CSS | いいえ | コンポーネントのコンパイルを通らない |

静的な `style` 属性と `[style]` の文字列・オブジェクトについては、main の styling のガイド（`adev/src/content/guide/components/styling.md` の「Namespacing CSS custom properties」。2026-11-04 に `gh api` で確認）も 「書き換えない」と明記していて、仕様どおりの動きです。

## 7. 小さな木で provideCssVarNamespacing を入れて描く

このサイト自身は `provideCssVarNamespacing` を使っていません。4 節のとおりファクトリは作られるときに 1 回しかトークンを読まないので、デモは `createEnvironmentInjector` の小さな木の中に**2 つ目の本物の `DomRendererFactory2`** を作り、そこに `provideCssVarNamespacing` を入れます。

> **🧪 DEMO — provideCssVarNamespacing を入れた小さな木で本物のコンポーネントを描く**
>
> `createEnvironmentInjector` で小さな木を作り、その中に 2 つ目の本物の `DomRendererFactory2` と `provideCssVarNamespacing` を入れて、CSS 変数を使うコンポーネントを描きます。Renderer2 への呼び出しは共通部品 `domr-probe.ts` の記録係が残します。チェックを外すと、木に何も入れず、このサイトの DomRendererFactory2 で描きます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-css-var-namespacing)

ヘッドレスの Chrome（開発ビルド、2026-11-04）で、`demo`・チェックなし・空文字（`APP_ID`）の 3 通りを描いた結果です。

|   | `'demo'` | 入れない | 空（`APP_ID` = `ng`） |
| --- | --- | --- | --- |
| head の `<style>` の宣言 | `--demo_domr-cssv-accent` | `--domr-cssv-accent` | `--ng_domr-cssv-accent` |
| 1 つ目の p の色（自分の変数） | `rgb(195, 0, 47)`（3 通りとも。宣言と参照が同じ名前に置き換わる） |   |   |
| 1 つ目の p の左の線（`var(--border-strong)`） | `none`・`0px` | `solid`・`6px` | `none`・`0px` |
| 2 つ目の p の左の線（`var(--global--border-strong)`） | `solid`・`6px`（3 通りとも） |   |   |
| 2 つ目の p の `style` 属性 | `--domr-cssv-static: 1; --demo_domr-cssv-size: 12px;` | `--domr-cssv-static: 1; --domr-cssv-size: 12px;` | `--domr-cssv-static: 1; --ng_domr-cssv-size: 12px;` |
| 記録された `setStyle` | `r2.setStyle(<p>, "--%NS%domr-cssv-size", "12px", 2)`（3 通りとも同じ） |   |   |
| root の `CssVarNamespacer` | `--domr-cssv-accent`（3 通りとも） |   |   |
| 木の `CssVarNamespacer` | `--demo_domr-cssv-accent` | `--domr-cssv-accent` | `--ng_domr-cssv-accent` |

- コンパイル済みの `styles`（このサイトの bundle の中の文字列）には、`--%NS%domr-cssv-accent`・`var(--%NS%border-strong)` と、`--global--` を外した `var(--border-strong)` が入っています。この印は、名前空間を使っていないこのサイトのどのコンポーネントの CSS にも入っています。
- `var(--border-strong)` は、このサイトの `styles.scss`（グローバルな CSS）が `:root` に置いた変数です。名前空間を入れると参照だけが `var(--demo_border-strong)` に変わり、宣言は `--border-strong` のままなので値が無くなり、`border-left` の宣言全体が無効になって線が消えます。エラーも警告も出ません。「テストと直し方」の #70064 が Angular Material で起きると報告しているのと同じ形です。
- 記録係が見た `setStyle` の名前は `%NS%` のままで、置き換えは 4 節の 440 行目、つまりレンダラーの中で起きています。静的な `style="--domr-cssv-static: 1"` は 3 通りとも書いた名前のままです（6 節）。
- 木の中に provide した `CssVarNamespacer` だけが名前空間を返し、root の `CssVarNamespacer` は木の設定を知りません（5 節の 32 行目）。デモでは木にも `CssVarNamespacer` を provide しています。

## ここまでの呼び出し

- `compileComponentFromMetadata → namespaceCssVariables(style)` — compiler.ts:272 — *ビルドのとき・全部のアプリ*
  - `namespaceCssVariable('--x') → '--%NS%x'` — util.ts:175 — *--global-- は外すだけ*
- `BindingParser: [style.--x] → '--%NS%x'` — binding\_parser.ts:602
- `provideCssVarNamespacing(ns) → CSS_VAR_NAMESPACE = ns ?? APP_ID + '_'` — dom\_renderer.ts:97 — *ルートの providers に*
- `new DomRendererFactory2(…, cssVarNamespace)` — dom\_renderer.ts（第 3 回） — *1 回だけ読む*
  - `レンダラーの CSS: s.replace(/%NS%/g, cssVarNamespace)` — dom\_renderer.ts:671・588
  - `setStyle(el, '--%NS%x', v) → style.replace('%NS%', …)` — dom\_renderer.ts:440
- 👤 `inject(CssVarNamespacer).namespace('--x')` — css\_var\_namespacer.ts:45 — *DOM の API で書くとき*

## テストと直し方

### spec と describe

| spec | describe / it | bazel のターゲット |
| --- | --- | --- |
| platform-browser/test/dom/css\_var\_namespacer\_spec.ts | describe `CssVarNamespacer`（15、it 4 つ） | `//packages/platform-browser/test:test`（Node） |
| compiler/test/shadow\_css/shadow\_css\_spec.ts | describe `CSS variable namespacing`（395、it 15 個 + `xit` 1 つ。`should namespace @property declarations` は 601、`xit` は 589） | `//packages/compiler/test:test`（Node） |
| platform-browser/test/dom/dom\_renderer\_spec.ts | describe `CSS namespacing`（369）の `with provided namespace`（374）・`with default (empty) namespace`（451）・`style property bindings namespacing`（528） | `//packages/platform-browser/test:test_web_chromium`（ブラウザだけ） |

📄 `angular/packages/platform-browser/test/dom/css_var_namespacer_spec.ts` L15–48 （▶ の行: 18, 23, 30–31, 37, 42, 47）

```ts
15 │ describe('CssVarNamespacer', () => {
16 │   it('should namespace variables when `CSS_VAR_NAMESPACE` is provided', () => {
17 │     TestBed.configureTestingModule({
18 ▶       providers: [CssVarNamespacer, provideCssVarNamespacing('test-app')],
19 │     });
20 │ 
21 │     const namespacer = TestBed.inject(CssVarNamespacer);
22 │ 
23 ▶     expect(namespacer.namespace('--my-var')).toBe('--test-app_my-var');
24 │   });
25 │ 
26 │   it('should fallback to `APP_ID` with an underscore when no namespace is provided to `provideCssVarNamespacing`', () => {
27 │     TestBed.configureTestingModule({
28 │       providers: [
29 │         CssVarNamespacer,
30 ▶         {provide: APP_ID, useValue: 'custom-app'},
31 ▶         provideCssVarNamespacing(),
32 │       ],
33 │     });
34 │ 
35 │     const namespacer = TestBed.inject(CssVarNamespacer);
36 │ 
37 ▶     expect(namespacer.namespace('--my-var')).toBe('--custom-app_my-var');
38 │   });
39 │ 
40 │   it('should not namespace variables when `CSS_VAR_NAMESPACE` is not provided', () => {
41 │     TestBed.configureTestingModule({
42 ▶       providers: [CssVarNamespacer],
43 │     });
44 │ 
45 │     const namespacer = TestBed.inject(CssVarNamespacer);
46 │ 
47 ▶     expect(namespacer.namespace('--my-var')).toBe('--my-var');
48 │   });
```

18・23 行目で `'test-app'` に `_` が足されること（4 節の 97 行目）、30〜31・37 行目で引数が無ければ `APP_ID` になること（98 行目）、42・47 行目で何も入れなければ 43 行目でそのまま返ることを確かめています。

📄 `angular/packages/platform-browser/test/dom/dom_renderer_spec.ts` L528–564 （▶ の行: 532, 539, 545–546, 549–550, 553）

```ts
528 │     describe('style property bindings namespacing', () => {
529 │       it('should namespace style property bindings starting with `--`', async () => {
530 │         @Component({
531 │           selector: 'cmp-style-prop-namespace',
532 ▶           template: `<div [style.--foo]="'blue'"></div>`,
533 │           standalone: true,
534 │         })
535 │         class CmpStylePropNamespace {}
536 │ 
537 │         TestBed.configureTestingModule({
538 │           imports: [CmpStylePropNamespace],
539 ▶           providers: [provideCssVarNamespacing('my-namespace')],
540 │         });
541 │         const fixture = TestBed.createComponent(CmpStylePropNamespace);
542 │         await fixture.whenStable();
543 │ 
544 │         const div = fixture.nativeElement.querySelector('div');
545 ▶         expect(div.style.getPropertyValue('--my-namespace_foo')).toBe('blue');
546 ▶         expect(div.style.getPropertyValue('--foo')).toBe('');
547 │       });
548 │ 
549 ▶       // TODO: Enforce this in v23.
550 ▶       xit('should throw an error if style property binding starts with `--global-` with a single hyphen', () => {
551 │         @Component({
552 │           selector: 'cmp-style-prop-error',
553 ▶           template: `<div [style.--global-foo]="'blue'"></div>`,
554 │           standalone: true,
555 │         })
556 │         class CmpStylePropError {}
557 │ 
558 │         expect(() => {
559 │           TestBed.configureTestingModule({
560 │             imports: [CmpStylePropError],
561 │             providers: [provideCssVarNamespacing('my-namespace')],
562 │           });
563 │         }).toThrowError(/CSS variable "--global-foo" has a single hyphen after "--global"/);
564 │       });
```

532 行目の `[style.--foo]` が 545 行目で `--my-namespace_foo` になり、546 行目で元の名前には書かれていないことを見ています（3 節の 602 行目と 4 節の 440 行目）。549〜550 行目は 2 節の 161 行目と対の `xit` で、v23 で `it` に戻す予定です。

### 手元で走らせた結果

📄 `ターミナル（../angular で）`

```
cd ~/angular-research/angular
pnpm bazel test //packages/platform-browser/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=CssVarNamespacer'
pnpm bazel test //packages/compiler/test:test --nocache_test_results --test_output=all \
  '--test_arg=--filter=CSS variable namespacing'
# dom_renderer_spec.ts の describe('CSS namespacing') はブラウザでだけ走る
pnpm bazel test //packages/platform-browser/test:test_web_chromium --nocache_test_results --test_output=all
```

📄 `出力（2026-11-04 に実行。抜粋。ログは scratchpad/domr-logs/b-cssvar-node.log・b-compiler-ns.log・b-web-chromium.log）`

```
//packages/platform-browser/test:test
Ran 4 of 159 specs
4 specs, 0 failures
//packages/platform-browser/test:test             PASSED in 1.0s

//packages/compiler/test:test
Pending:
1) ShadowCss CSS variable namespacing should throw an error when a CSS variable has a single hyphen after --global
  Temporarily disabled with xit
Ran 16 of 403 specs
16 specs, 0 failures, 1 pending spec
//packages/compiler/test:test                     PASSED in 0.7s

//packages/platform-browser/test:test_web_chromium
Chromium: 1/1 test files | 253 passed, 0 failed, 5 skipped
//packages/platform-browser/test:test_web_chromium PASSED in 2.1s
```

- compiler の 16 件のうち 1 件が pending で、出力に `ShadowCss CSS variable namespacing should throw an error when a CSS variable has a single hyphen after --global`「Temporarily disabled with xit」と出ます。

### 直すとしたら

- CSS の中のどこを変数とみなすかは `namespaceCssVariables`（1066 行目）で、it は `shadow_css_spec.ts` の describe `CSS variable namespacing` に足します（Node、1 秒足らず）。
- 名前 1 つの規則（`--global--` など）は `namespaceCssVariable`（`util.ts` 160 行目）で、テンプレート・ホスト・CSS の 3 か所が同じ関数を通るので 1 か所で揃います。
- 実行時の置き換えは `DefaultDomRenderer2.setStyle` / `removeStyle` とレンダラーのコンストラクタで、it は `dom_renderer_spec.ts` の describe `CSS namespacing`（ブラウザ）です。
- 開いている issue が 2 つあります。**#70063**（`[style.color]="'var(--text-color)'"` の値の中の変数が名前空間に入らない。feature のラベル）には、「値がプロパティから来るときはコンパイラが書き換えられないので、文字列の直書きだけ書き換えると新しい不揃いになる」というコメントが付いています。**#70064**（`provideCssVarNamespacing()` を入れると、グローバルな CSS の変数でテーマを決めるライブラリが崩れる）は 2 節の 87 行目の結果で、ライブラリの CSS だけ名前空間を外す PR #70477 は「無条件に外すのは正しくない」というメンテナーの返信のあとで閉じられ、除外する名前を指定できる API の提案がコメントに出ています。一覧は [第 20 回](20-domr-issues.md)。
- 本家に PR を出すことは勧めません。方針がまだ議論の途中の機能なので、手元で 6 節の表のどの行の話かを確かめ、issue を読む手がかりにします。

## 聞かれそうな質問

**Q. provideCssVarNamespacing を入れていないアプリにも %NS% は入っている？**

入っています。コンパイラは 272 行目で全部のコンポーネントの CSS に `%NS%` を入れ、実行時に `DomRendererFactory2` が空文字で置き換えます（671・588・440 行目）。デモのコンパイル済みの `styles` がその文字列です。

**Q. 名前空間の文字列は何になる？**

`provideCssVarNamespacing('demo')` なら `demo_`、引数なしなら `APP_ID` + `_`（既定は `ng_`）です。97 行目が `_` を必ず足すので、`'demo_'` と渡すと `demo__` になります。同じページに 2 つのアプリがあるなら、`APP_ID` をアプリごとに変えないと名前空間も同じになります。

**Q. グローバルな CSS で定義した変数を、コンポーネントから読むには？**

`var(--global--brand)` と書きます。175 行目ではなく 172〜173 行目に入り、`var(--brand)` として出力されます。ハイフンが 1 つの `--global-brand` は今は普通に名前空間に入り、v23 でエラーにする予定です（161 行目の TODO）。

**Q. `element.style.setProperty('--brand', …)` が効かなくなった。**

名前空間を入れたアプリでは、CSS の側の名前が `--ng_brand` などに変わっています。`inject(CssVarNamespacer).namespace('--brand')` で名前を作って渡します（45 行目）。`CssVarNamespacer` はルートで作られるので（`service.ts` の 32 行目）、`provideCssVarNamespacing` もルートに置きます。

**Q. ルートでない providers（ルートの子のインジェクタ）に置くとどうなる？**

効きません。`CSS_VAR_NAMESPACE` を読むのはルートの `DomRendererFactory2` のコンストラクタの 1 回だけで、子のインジェクタに置いた値はそのファクトリから見えません。デモが小さな木の中に 2 つ目の `DomRendererFactory2` を作っているのはこのためです。

## 読み終えて

- コンパイラは、全部のアプリの全部のコンポーネントの CSS とバインディングの名前の `--x` を `--%NS%x` にする（`--global--x` は `--x`）。
- 実行時に `DomRendererFactory2` が `%NS%` を「名前空間 + `_`」か空文字に置き換える。CSS はレンダラーのコンストラクタで、バインディングは `setStyle` で。
- トークンを読むのはファクトリと `CssVarNamespacer` の作成の 1 回だけで、どちらもルート。`provideCssVarNamespacing` はルートの providers に置く。
- 静的な `style` 属性、`[style]` のオブジェクト・文字列、値の中の `var()`、`Renderer2.setStyle`、グローバルな CSS は書き換わらない。
- ライブラリの CSS もアプリのビルドで名前空間に入るので、グローバルな CSS の変数を読むライブラリは崩れる（#70064、議論中）。

---

← 前: [SharedStylesHost：&lt;style&gt; を数えて足し引きする](07-domr-shared-styles.md)  
次: [クラスとスタイルのバインディング：命令と静的なスタイル](09-domr-styling-overview.md) →
