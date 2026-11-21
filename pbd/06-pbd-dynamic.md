[目次](../README.md) › [platform の説明文の読み残し](README.md) › 第 6 回 / 全 7 回

# platform-browser-dynamic の説明文：JIT の platform と ResourceLoader

> platform-browser-dynamic の public\_api.ts と src の compiler\_factory.ts・platform\_providers.ts・resource\_loader/resource\_loader\_impl.ts・version.ts：platformBrowserDynamic が置くもの、JitCompilerFactory が今は何もしないこと、COMPILER\_OPTIONS が効く場所、ResourceLoaderImpl と templateUrl。

angular/angular · 読了 約 10 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-dynamic)

---

この章で分かること：`@angular/platform-browser-dynamic` の 4 つのファイル（全部で 200 行ほど）が、今、何を置き、誰に読まれ、何が効かないか。`platformBrowserDynamic`・`JitCompilerFactory`・`COMPILER_OPTIONS`・`ResourceLoaderImpl` の説明文の約束を、npm から取った本物の 22.2.6 を Node で動かして確かめます。結果として、`JitCompilerFactory.createCompiler` の options は何も効かず（説明文の「Ivy の JIT では要らない」のとおり）、今もこのパッケージにしかできないのは「`bootstrapModule` の JIT で `templateUrl` を XHR で読む」ことだけでした。非推奨の文の「代わりに `platformBrowser` を使う」は、その場合だけ同じには動きません。

読む対象は `packages/platform-browser-dynamic/` の `public_api.ts` と `src/` の `platform_providers.ts`・`compiler_factory.ts`・`resource_loader/resource_loader_impl.ts`・`version.ts`・`platform-browser-dynamic.ts` です（../angular、8576f161ae4）。このパッケージの行を引くのは、このサイトでこの章が初めてです。`COMPILER_OPTIONS` を読む core の側（`compileNgModuleFactory`）は[bootstrapModule の章](../ngmodule/11-ngmodule-bootstrap-module.md)と[core の platform の章](../cra/02-cra-platform.md)の 7 節、`Compiler` と `CompilerFactory` の型は[core の linker の章](../cra/04-cra-linker-misc.md)、AOT のビルドで `platformBrowserDynamic` を `platformBrowser` に置き換える変換は[TypeScript の transformer の章](../oxc/04-oxc-ts-transformers.md)が読んでいます。

1. [1. bootstrapApplication](01-pbd-browser.md)
2. [2. provideClientHydration](02-pbd-hydration.md)
3. [3. レンダラーとイベント](03-pbd-dom.md)
4. [4. Meta・Title・tools](04-pbd-meta-tools.md)
5. [5. platform-server](05-pbd-server.md)
6. **6. platform-browser-dynamic**（この章）
7. [7. spec と issue](07-pbd-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> JIT（Just-In-Time）は、テンプレートをブラウザーの中で実行のときに命令へ変えるやり方です。今の CLI のアプリは AOT（ビルドのときに変える）で、JIT はテストや、ビルドしない小さな例で使います。`platform-browser-dynamic` は、もともと「JIT のコンパイラを連れてくる platform」でした。このパッケージはサイトの依存に無く、platform を作り直すとこのページのアプリが壊れるので、DEMO は Node（domino の window をブラウザーの代わりに置いた JIT）で動かした記録の再生です。

## 1. 入口：import すると compiler が付いてくる

📄 `angular/packages/platform-browser-dynamic/public_api.ts` L9–21 （▶ の行: 15–17, 19）

```ts
 9 │ /**
10 │  * @module
11 │  * @description
12 │  * Entry point for all public APIs of this package.
13 │  */
14 │ 
15 ▶ // Note: Historically people relied on `platform-browser-dynamic` magically
16 ▶ // exposing the compiler for JIT. This is now made more explicit via this import.
17 ▶ import '@angular/compiler';
18 │ 
19 ▶ export * from './src/platform-browser-dynamic';
20 │ 
21 │ // This file only reexports content of the `src` folder. Keep it that way.
```

15〜17 行目のとおり、このパッケージを import すると `@angular/compiler` も読み込まれます。昔は platform-browser-dynamic が JIT のコンパイラを「黙って」連れてきていた、その振る舞いを、ここで明示の import にしています。19 行目の先の `src/platform-browser-dynamic.ts` は L9〜11 の 3 行で `VERSION`・`JitCompilerFactory`・`platformBrowserDynamic` の 3 つだけを export します。DEMO の「1. platform」で、npm の 22.2.6 の公開の名前は `["JitCompilerFactory","VERSION","platformBrowserDynamic"]` の 3 つでした。`ResourceLoaderImpl` は 1284d00dc77（2021-11-24、``refactor(platform-browser-dynamic): remove private export of `ResourceLoaderImpl` (#44267)``）から外に出ていません。

📄 `angular/packages/platform-browser-dynamic/src/version.ts` L9–20 （▶ の行: 12, 20）

```ts
 9 │ /**
10 │  * @module
11 │  * @description
12 ▶  * Entry point for all public APIs of the platform-browser-dynamic package.
13 │  */
14 │ 
15 │ import {Version} from '@angular/core';
16 │ 
17 │ /**
18 │  * @publicApi
19 │  */
20 ▶ export const VERSION = /* @__PURE__ */ new Version('0.0.0-PLACEHOLDER');
```

12 行目の「このパッケージのすべての公開 API の入口」という `@module` の説明は、version.ts に書かれています。npm の `types/platform-browser-dynamic.d.ts` でも、この文がファイルの頭（`VERSION` の前）に出ていました。中身は 20 行目の `Version` だけで、`0.0.0-PLACEHOLDER` はリリースのときに版の文字に置き換わります（npm の 22.2.6 では `new Version('22.2.6')`）。

## 2. platformBrowserDynamic が置く 2 つの provider

📄 `angular/packages/platform-browser-dynamic/src/platform_providers.ts` L9–28 （▶ の行: 21–28）

```ts
 9 │ import {
10 │   COMPILER_OPTIONS,
11 │   CompilerFactory,
12 │   createPlatformFactory,
13 │   PlatformRef,
14 │   StaticProvider,
15 │ } from '@angular/core';
16 │ import {platformBrowser} from '@angular/platform-browser';
17 │ import {ResourceLoader} from '@angular/compiler';
18 │ import {ResourceLoaderImpl} from './resource_loader/resource_loader_impl';
19 │ import {JitCompilerFactory} from './compiler_factory';
20 │ 
21 ▶ const INTERNAL_BROWSER_DYNAMIC_PLATFORM_PROVIDERS: StaticProvider[] = [
22 ▶   {
23 ▶     provide: COMPILER_OPTIONS,
24 ▶     useValue: {providers: [{provide: ResourceLoader, useClass: ResourceLoaderImpl, deps: []}]},
25 ▶     multi: true,
26 ▶   },
27 ▶   {provide: CompilerFactory, useClass: JitCompilerFactory, deps: [COMPILER_OPTIONS]},
28 ▶ ];
```

📄 `angular/packages/platform-browser-dynamic/src/platform_providers.ts` L30–39 （▶ の行: 31–32, 34–39）

```ts
30 │ /**
31 ▶  * @deprecated Use the `platformBrowser` function instead from `@angular/platform-browser`.
32 ▶  * In case you are not in a CLI app and rely on JIT compilation, you will also need to import `@angular/compiler`
33 │  */
34 ▶ export const platformBrowserDynamic: (extraProviders?: StaticProvider[]) => PlatformRef =
35 ▶   createPlatformFactory(
36 ▶     platformBrowser,
37 ▶     'browserDynamic',
38 ▶     INTERNAL_BROWSER_DYNAMIC_PLATFORM_PROVIDERS,
39 ▶   );
```

35〜39 行目で、`platformBrowser` を親にして `'browserDynamic'` の印を持つ platform の factory を作り、21〜28 行目の 2 つを platform の注入器に足します。factory のしくみは[core の platform の章](../cra/02-cra-platform.md)の 3 節です。

1. **COMPILER\_OPTIONS（22〜26 行目）**

   `multi: true` の 1 つで、`{providers: [{provide: ResourceLoader, useClass: ResourceLoaderImpl}]}`。DEMO では `COMPILER_OPTIONS` は 1 個、その `provide` は `@angular/compiler` の `ResourceLoader` と同じもの、`useClass` は `ResourceLoaderImpl` でした。自分で `multi: true` の値を足すと 2 個になりました。
2. **CompilerFactory（27 行目）**

   `JitCompilerFactory` に `COMPILER_OPTIONS` を渡して作ります。`p.injector.get(CompilerFactory)` は `JitCompilerFactory` でした。ただし core の `src` にも platform-browser にも `CompilerFactory` を `inject` する行はありません（grep で 0 件）。自分で取り出さない限り、誰も作りません。

31〜32 行目の非推奨は a4e2139620e（2025-04-29、``refactor(platform-browser): Deprecate the `platform-browser-dynamic` package (#61043)``、v20）です。「`platformBrowser` を使う。CLI のアプリでなく JIT に頼るなら `@angular/compiler` も import する」。DEMO では、`platformBrowserDynamic()` のあとの `platformBrowser()` は同じ platform を返しました（`platformBrowser` の印も持つため）。逆に `platformBrowser()` のあとの `platformBrowserDynamic()` は、開発モードで NG0400「A platform with a different configuration has been created.」、本番は確かめずに今の platform を返し、その `COMPILER_OPTIONS` は 0 個でした（`assertPlatform` の確かめが開発モードだけ、cra-platform の 3 節と同じ）。本番では `ResourceLoaderImpl` が黙って置かれないことになります。

## 3. JitCompilerFactory：何も効かない Compiler の工場

📄 `angular/packages/platform-browser-dynamic/src/compiler_factory.ts` L9–38 （▶ の行: 19–20, 25–26, 28, 31–32, 34, 37）

```ts
 9 │ import {CompilerConfig} from '@angular/compiler';
10 │ import {
11 │   Compiler,
12 │   CompilerFactory,
13 │   CompilerOptions,
14 │   Injector,
15 │   StaticProvider,
16 │   ViewEncapsulation,
17 │ } from '@angular/core';
18 │ 
19 ▶ export const COMPILER_PROVIDERS = <StaticProvider[]>[
20 ▶   {provide: Compiler, useFactory: () => new Compiler()},
21 │ ];
22 │ /**
23 │  * @publicApi
24 │  *
25 ▶  * @deprecated
26 ▶  * Ivy JIT mode doesn't require accessing this symbol.
27 │  */
28 ▶ export class JitCompilerFactory implements CompilerFactory {
29 │   private _defaultOptions: CompilerOptions[];
30 │ 
31 ▶   /** @internal */
32 ▶   constructor(defaultOptions: CompilerOptions[]) {
33 │     const compilerOptions: CompilerOptions = {
34 ▶       defaultEncapsulation: ViewEncapsulation.Emulated,
35 │     };
36 │ 
37 ▶     this._defaultOptions = [compilerOptions, ...defaultOptions];
38 │   }
```

📄 `angular/packages/platform-browser-dynamic/src/compiler_factory.ts` L40–60 （▶ の行: 41–42, 44, 46, 48–50, 55, 57–58）

```ts
40 │   createCompiler(options: CompilerOptions[] = []): Compiler {
41 ▶     const opts = _mergeOptions(this._defaultOptions.concat(options));
42 ▶     const injector = Injector.create({
43 │       providers: [
44 ▶         COMPILER_PROVIDERS,
45 │         {
46 ▶           provide: CompilerConfig,
47 │           useFactory: () => {
48 ▶             return new CompilerConfig({
49 ▶               defaultEncapsulation: opts.defaultEncapsulation,
50 ▶               preserveWhitespaces: opts.preserveWhitespaces,
51 │             });
52 │           },
53 │           deps: [],
54 │         },
55 ▶         opts.providers!,
56 │       ],
57 ▶     });
58 ▶     return injector.get(Compiler);
59 │   }
60 │ }
```

25〜26 行目は「非推奨。Ivy の JIT ではこの記号に触る必要はない」です（e3d6e97050e、2021-10-04、`docs: deprecate ViewEngine-based JIT Compiler symbols (#43710)`）。今の実装は、そのとおり何もしないものでした。

1. **41 行目**

   コンストラクターの既定（34 行目の Emulated）・`COMPILER_OPTIONS`・引数の options を 1 つにまとめます（次の `_mergeOptions`）。
2. **42〜57 行目**

   毎回新しい注入器を作り、19〜21 行目の `Compiler`、`CompilerConfig`、まとめた `providers`（`ResourceLoader` など）を置きます。
3. **58 行目**

   その注入器の `Compiler` を返します。20 行目は `new Compiler()` で、core の `Compiler`（compiler.ts L33〜65）は `compileModuleSync` が `new NgModuleFactoryR3(moduleType)` を返すだけです。`CompilerConfig` も `providers` も誰も読みません。読む側は View Engine の削除（8c71b9fc42e、2021-11-09）で消えました。

DEMO の「2. JitCompilerFactory」で、`createCompiler([{defaultEncapsulation: ViewEncapsulation.None, preserveWhitespaces: true}])` の `Compiler` でモジュールを作り、そのコンポーネントを描くと、`_ngcontent` の付いた Emulated で、`<p> a b </p>` の空白は `" a b "` に詰まりました。options は効いていません。2 回呼ぶと別の `Compiler` が返りました（42 行目で毎回注入器を作る）。

📄 `angular/packages/platform-browser-dynamic/src/compiler_factory.ts` L62–83 （▶ の行: 64–66, 70, 72, 77, 79, 81）

```ts
62 │ function _mergeOptions(optionsArr: CompilerOptions[]): CompilerOptions {
63 │   return {
64 ▶     defaultEncapsulation: _lastDefined(optionsArr.map((options) => options.defaultEncapsulation)),
65 ▶     providers: _mergeArrays(optionsArr.map((options) => options.providers!)),
66 ▶     preserveWhitespaces: _lastDefined(optionsArr.map((options) => options.preserveWhitespaces)),
67 │   };
68 │ }
69 │ 
70 ▶ function _lastDefined<T>(args: T[]): T | undefined {
71 │   for (let i = args.length - 1; i >= 0; i--) {
72 ▶     if (args[i] !== undefined) {
73 │       return args[i];
74 │     }
75 │   }
76 │   return undefined;
77 ▶ }
78 │ 
79 ▶ function _mergeArrays(parts: any[][]): any[] {
80 │   const result: any[] = [];
81 ▶   parts.forEach((part) => part && result.push(...part));
82 │   return result;
83 │ }
```

70〜77 行目の `_lastDefined` は「後ろから見て最初に `undefined` でない値」で、core の `compileNgModuleFactory` の同じ名前の関数（application\_ngmodule\_factory\_compiler.ts L74〜81）と同じ形です。実際に効く options のまとめ方はそちらです（4 節）。

31 行目の `@internal` で、公開の .d.ts にはコンストラクターが書かれません。TypeScript はコンストラクターの無いクラスを「引数なしで new できる」とみなすので、`new JitCompilerFactory()` は strict の tsc（`skipLibCheck: false`）に 0 件で通り、実行すると 37 行目の `...defaultOptions` で TypeError「defaultOptions is not iterable」でした。`new JitCompilerFactory([])` なら `Compiler` が返ります。

📄 `型と実行の食い違い（手元の記録、2026-11-22）`

```
// .d.ts（22.2.6）の JitCompilerFactory には constructor が書かれていない
import {JitCompilerFactory} from '@angular/platform-browser-dynamic';
const compiler = new JitCompilerFactory().createCompiler();
// strict の tsc（skipLibCheck: false）: 0 件。実行すると TypeError: defaultOptions is not iterable
```

## 4. COMPILER\_OPTIONS が効く場所と効かない場所

`COMPILER_OPTIONS` は core の公開のトークンで（compiler.ts L78〜85）、説明文は「platform の注入器に `CompilerOptions` を置くトークン」とだけ書きます。読むのは core の `compileNgModuleFactory` だけで、`bootstrapModule` が JIT のときに L36 で集め、L41〜44 で `setJitOptions` に `defaultEncapsulation` と `preserveWhitespaces` を渡し、L50〜66 で `providers` から `ResourceLoader` を取ります。DEMO の「3. COMPILER\_OPTIONS」は 1 行ずつ新しいプロセスです（JIT の options は最初の 1 回だけ決まるため）。

| 起動のしかた | 結果（開発モードも本番も同じ） |
| --- | --- |
| `platformBrowserDynamic().bootstrapModule(M)` | Emulated、`" a b "`（既定） |
| `platformBrowserDynamic([{provide: COMPILER_OPTIONS, multi: true, useValue: {None, preserveWhitespaces: true}}])` → `bootstrapModule(M)` | `_ngcontent` なし、`" a b "`（効いた） |
| 同じ provider を `platformBrowser([…])` に → `bootstrapModule(M)` | 同じく効いた。platform-browser-dynamic は要らない |
| `platformBrowserDynamic().bootstrapModule(M, {None, preserveWhitespaces: true})` | 効いた（L36 の `concat(options)`） |
| `COMPILER_OPTIONS` を置いた platform の上で `bootstrapApplication(Standalone)` | 同じ platform を使うが、Emulated、`" a b "`（読まれない） |

最後の行は説明文に無い振る舞いです。`bootstrapApplication`（`createApplication`）は `compileNgModuleFactory` を通らないので、`COMPILER_OPTIONS` も `setJitOptions` も使いません。

## 5. ResourceLoaderImpl：XHR で 1 つのファイルを読む

📄 `angular/packages/platform-browser-dynamic/src/resource_loader/resource_loader_impl.ts` L8–23 （▶ の行: 11–13, 20–22）

```ts
 8 │ import {ResourceLoader} from '@angular/compiler';
 9 │ import {Injectable} from '@angular/core';
10 │ 
11 ▶ @Injectable()
12 ▶ export class ResourceLoaderImpl extends ResourceLoader {
13 ▶   override get(url: string): Promise<string> {
14 │     let resolve: (result: any) => void;
15 │     let reject: (error: any) => void;
16 │     const promise = new Promise<string>((res, rej) => {
17 │       resolve = res;
18 │       reject = rej;
19 │     });
20 ▶     const xhr = new XMLHttpRequest();
21 ▶     xhr.open('GET', url, true);
22 ▶     xhr.responseType = 'text';
23 │ 
```

📄 `angular/packages/platform-browser-dynamic/src/resource_loader/resource_loader_impl.ts` L24–50 （▶ の行: 24, 27, 29–34, 36–37, 39, 43–45, 47–48）

```ts
24 ▶     xhr.onload = function () {
25 │       const response = xhr.response;
26 │ 
27 ▶       let status = xhr.status;
28 │ 
29 ▶       // fix status code when it is 0 (0 status is undocumented).
30 ▶       // Occurs when accessing file resources or on Android 4.1 stock browser
31 ▶       // while retrieving files from application cache.
32 ▶       if (status === 0) {
33 ▶         status = response ? 200 : 0;
34 ▶       }
35 │ 
36 ▶       if (200 <= status && status <= 300) {
37 ▶         resolve(response);
38 │       } else {
39 ▶         reject(`Failed to load ${url}`);
40 │       }
41 │     };
42 │ 
43 ▶     xhr.onerror = function () {
44 ▶       reject(`Failed to load ${url}`);
45 ▶     };
46 │ 
47 ▶     xhr.send();
48 ▶     return promise;
49 │   }
50 │ }
```

このファイルには説明文がありません。`@angular/compiler` の `ResourceLoader`（`get(url)` だけの抽象クラス）を、XHR（`XMLHttpRequest`）で実装します。DEMO の「4. ResourceLoaderImpl」は、記録の関数が置いた偽の `XMLHttpRequest` に、URL ごとに決めた status と本文を返させた記録です。

1. **21〜22 行目**

   どの URL も `GET`、非同期（`true`）、`responseType = 'text'` で開きました。
2. **32〜34 行目**

   status が 0 で本文があれば 200 とみなし、成功でした。本文が空なら 0 のままで失敗です。29〜31 行目のコメントの「Android 4.1 の標準ブラウザー」は、2015 年（cd735c48374）のままの文です。
3. **36 行目**

   `200 <= status && status <= 300` で、200 は成功、404 は 39 行目の `Failed to load /missing.html` でした。境目の 300（Multiple Choices）も成功として本文を返しました。`<= 300` は 2015-01-30 の 746f85a621a からです。
4. **43〜45 行目**

   通信の失敗（`onerror`）も同じ文の reject です。失敗の理由（status）は文に入りません。

## 6. templateUrl を誰が読むか：「代わりに platformBrowser」が同じにならない所

CLI のアプリは、JIT のビルドでも `templateUrl` を import に替えて中身を埋め込みます（[TypeScript の transformer の章](../oxc/04-oxc-ts-transformers.md)の `createJitResourceTransformer`）。埋め込まずに `templateUrl` のまま JIT で動かすと、起動の前に誰かがファイルを読む必要があります。DEMO の「5. templateUrl」は、`templateUrl: 'pbd-dyn.html'`・`styleUrl: 'pbd-dyn.css'` のコンポーネントを 3 通りで起動した記録です。

| 起動のしかた | 読んだもの | 結果 |
| --- | --- | --- |
| `platformBrowserDynamic().bootstrapModule(M)` | XHR で `pbd-dyn.html`・`pbd-dyn.css` | 描けた。style も `[_ngcontent-…]` 付きで head に入った |
| `platformBrowser().bootstrapModule(M)` | なし | 「Component 'PbdDynUrl' is not resolved: - templateUrl: pbd-dyn.html - styleUrl: pbd-dyn.css」 |
| `bootstrapApplication(Standalone)`（platformBrowserDynamic の platform の上でも） | `fetch` で `pbd-dyn.html`（XHR は 0 回） | 描けた |

表の 2 つ目は、`compileNgModuleFactory` が L56〜58 で「compiler の providers が無ければ、読まずにそのまま返す」ためです。`platformBrowser` の platform には `ResourceLoader` を置く `COMPILER_OPTIONS` が無いので、読まずにモジュールを作り、コンポーネントを作るところで例外になりました。表の 3 つ目は、`createApplication` が JIT のとき `fetch` で読むからです（platform-browser の browser.ts L159〜161、[第 1 回](01-pbd-browser.md)のファイル）。こちらは `ResourceLoaderImpl` を使いません。

したがって、31〜32 行目の「`platformBrowser` を使う。JIT なら `@angular/compiler` も import する」で同じに動かないのは、「CLI を使わない JIT」で「`templateUrl`・`styleUrl` のある NgModule のアプリ」を「`bootstrapModule` で起動する」ときです。その場合は `bootstrapApplication` にするか、`platformBrowser([{provide: COMPILER_OPTIONS, multi: true, useValue: {providers: [{provide: ResourceLoader, useClass: 自分の読み込み}]}}])` を置きます（`ResourceLoaderImpl` は import できない）。説明文はこの場合に触れていません。

> **🧪 DEMO — npm の platform-browser-dynamic 22.2.6 を Node で動かした記録**
>
> ボタンは、pbd-dynamic.demo-dyn.ts の関数を、Node（domino の window を置いた JIT、@angular/core・platform-browser・compiler 22.2.6）で関数ごとに起動し直し、開発モードと本番（`ngDevMode = false`）で動かした記録を再生します。platform-browser-dynamic は `npm pack` で取った 22.2.6 を手元の作業用の場所で使い、サイトの依存には入れていません。「説明と違う」の行は左に印を付けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/pbd-dynamic)

## ここまでの呼び出し（platformBrowserDynamic で templateUrl のモジュールを起動する）

- 👤 `platformBrowserDynamic()` — platform\_providers.ts L34 — *platformBrowser の上に COMPILER\_OPTIONS と CompilerFactory*
- 👤 `platform.bootstrapModule(AppModule)` — core platform\_ref.ts
  - `compileNgModuleFactory(injector, options, moduleType)` — core application\_ngmodule\_factory\_compiler.ts L22
    - `injector.get(COMPILER_OPTIONS, []).concat(options)` — L36 — *platform の値と bootstrapModule の options*
    - `setJitOptions({defaultEncapsulation, preserveWhitespaces})` — L41〜44
    - `compilerInjector.get(compiler.ResourceLoader)` — L65〜66 — *ここで ResourceLoaderImpl が作られる*
    - `resolveComponentResources((url) => Promise.resolve(resourceLoader.get(url)))` — L69
      - `ResourceLoaderImpl.get(url)` — resource\_loader\_impl.ts L13 — *XHR の GET、200〜300 なら本文*
  - `JitCompilerFactory` — compiler\_factory.ts L28 — *この道では誰も作らない*

## テストと直し方

| ファイル（packages/platform-browser-dynamic/test/） | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `resource_loader/resource_loader_impl_spec.ts` | `ResourceLoaderImpl`（13）› `should resolve the Promise with the file content on success`（23）・`should reject the Promise on failure`（30） | 5 節の 200 と 404。ブラウザーだけ（spec の L12 の `if (isBrowser)`）。status 0 と 300 の it は無い |
| `testing_public_browser_spec.ts` | `test APIs for the browser`（46）› `should run async tests with ResourceLoaders`（58）・`provides a real ResourceLoader instance`（83）、`errors`（129）› `should fail when an ResourceLoader fails`（130）、`TestBed createComponent`（162）› `should allow an external templateUrl`（175） | TestBed の上での ResourceLoader と templateUrl。ブラウザーだけ |
| `metadata_overrider_spec.ts` | `metadata overrider`（52）ほか | このパッケージの src ではなく、core/testing の metadata の上書き |

📄 `走らせたコマンド（2026-11-22）`

```
$ cd ~/angular-research/angular      # 8576f161ae4、読むだけ
$ pnpm bazel test //packages/platform-browser-dynamic/test:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/platform-browser-dynamic/test:test_web_chromium --nocache_test_results --test_output=all
（結果は表の下）
```

結果は手元の bazel で、Node の `//packages/platform-browser-dynamic/test:test` は 9 specs・0 failures（`isBrowser` が偽なので、ResourceLoaderImpl とブラウザーの it は入らず、metadata overrider の 9 つだけ）、`:test_web_chromium`（headless の Chromium）は 1 ファイルで 17 passed・0 failed でした。404 の it の `bad/path/404.html` と、`non-existent.html` への 404 が記録に出ていました。`platformBrowserDynamic`・`JitCompilerFactory`・`COMPILER_OPTIONS` を名前で確かめる spec は、このパッケージの test にはありません。

直すとしたら、platform\_providers.ts の 31〜32 行目に「NgModule の JIT で `templateUrl` を読むには `ResourceLoader` を置く `COMPILER_OPTIONS` が要る（`bootstrapApplication` は fetch で読む）」を足します。compiler\_factory.ts は、`createCompiler` の options が効かないことを説明文に書き、31 行目の `@internal` のコンストラクターに既定値（`defaultOptions: CompilerOptions[] = []`）を付ければ、.d.ts のとおり引数なしで作れます（npm の 22.2.6 の写しの fesm2022 でこの 1 か所を変えて同じ記録を取ると、引数なしの `new` は `Compiler` を返しました。写しは元に戻した）。resource\_loader\_impl.ts の 36 行目を `status < 300` にするかは、2015 年からの振る舞いを変えるので、spec を先に足します（resource\_loader\_impl\_spec.ts に 0 と 300 の it。ブラウザーで本物の 300 を返すには static\_assets だけでは足りないので、XHR を差し替える形になります）。

## 聞かれそうな質問

**Q. 今のアプリで platform-browser-dynamic は要りますか？**

CLI のアプリでは要りません。AOT では `platformBrowserDynamic(…)` の呼び出しが `platformBrowser(…)` に置き換わり（oxc-ts-transformers の章）、JIT でも `templateUrl` は埋め込まれます。要るのは CLI を使わない JIT で、`templateUrl` のある NgModule を `bootstrapModule` で起動するときだけです（6 節）。それも `platformBrowser` に `ResourceLoader` を置く `COMPILER_OPTIONS` を渡せば代わりになります。

**Q. `JitCompilerFactory` で `defaultEncapsulation` を変えた `Compiler` を作れますか？**

作れますが効きません。`createCompiler` の options は `CompilerConfig` に入るだけで、返る `Compiler`（core の compiler.ts）は読みません（記録で Emulated のまま）。JIT の既定を変えるなら `COMPILER_OPTIONS` を platform に置くか、`bootstrapModule` の第 2 引数に渡します。

**Q. `COMPILER_OPTIONS` の `preserveWhitespaces` は `bootstrapApplication` でも効きますか？**

効きません。`COMPILER_OPTIONS` を読むのは `bootstrapModule` の `compileNgModuleFactory` だけです（記録で `" a b "`）。standalone なら各コンポーネントの `preserveWhitespaces` に書きます。

**Q. `ResourceLoaderImpl` はどんなときに失敗にしますか？**

status が 200〜300 の外（0 で本文が無いときを含む）か、`onerror` のときに、`Failed to load <url>` の文字列で reject します（36〜45 行目）。300 は成功として本文を返しました。

**Q. `platformBrowser()` のあとで `platformBrowserDynamic()` を呼ぶと？**

開発モードは NG0400 で止まり、本番は今の platform をそのまま返します。本番では `COMPILER_OPTIONS` が置かれないまま進むので、`templateUrl` の解決は 6 節の表の 2 つ目と同じになります。

## 読み終えて

- platform-browser-dynamic が platform に足すのは、`ResourceLoaderImpl` を置く `COMPILER_OPTIONS` と、誰も inject しない `CompilerFactory` の 2 つ。
- `JitCompilerFactory.createCompiler` の options は効かない。.d.ts は引数なしの new を許すが、実行すると TypeError。
- `COMPILER_OPTIONS` は `bootstrapModule` の JIT だけが読み、`platformBrowser` に置いても同じに効く。`bootstrapApplication` は読まない。
- 「代わりに `platformBrowser`」で同じに動かないのは、CLI を使わない JIT で `templateUrl` のモジュールを `bootstrapModule` するときだけ。
- `ResourceLoaderImpl` は status 0 の本文ありと 300 を成功にする。

---

← 前: [platform-server の説明文：renderApplication・provideServerRendering・INITIAL\_CONFIG](05-pbd-server.md)  
次: [spec と issue を読む：platform の説明文を固めているもの](07-pbd-tests-issues.md) →
