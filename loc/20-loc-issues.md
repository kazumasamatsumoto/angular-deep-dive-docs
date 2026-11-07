[目次](../README.md) › [i18n と $localize の内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：i18n の今

> area: i18n のラベルで開いている issue と、この 1 年に閉じた issue の表。ICU の抽出、プレースホルダーの equiv-text、ロケールのデータの遅延読み込み、制御フローとの組み合わせ、実行時の翻訳の設定など。どの issue がこのシリーズのどの章の行に関係するか。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/loc-issues)

---

最終回は、i18n の「今」を issue と PR から読みます。ラベル `area: i18n` で開いている 50 件と、2025-11-01 以降に閉じた 66 件（うち 51 件は adev の文書の翻訳の同期の自動の issue、1 件は文書の翻訳のリンクの追加なので除く）に、ラベルの無いものを題の言葉で探して足し、合わせて開いている 55 件・閉じた 18 件を表にします。開いているものは議論と付いた PR を、閉じたものは直した commit とその章を、gh と git で読んだ事実だけで並べます。第 17・18 回で本物を走らせて確かめた issue（#60566・#47370）は、その結果も載せます。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）と `git -C ../angular log` です。この章にはソースの引用はありません。行は各章で引用したものを指します。

1. [1. 全体像](01-loc-overview.md)
2. [2. 印とメッセージ](02-loc-markup.md)
3. [3. プレースホルダー](03-loc-placeholders.md)
4. [4. メッセージ ID](04-loc-message-id.md)
5. [5. コンパイラの段](05-loc-pipeline-phases.md)
6. [6. $localize の出力](06-loc-const-collection.md)
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
20. **20. issue と PR を読む**（この章）

## 0. データの取り方

📄 `ターミナル（読むだけ）`

```
# ラベル area: i18n の issue（開いている / 2025-11-01 以降に閉じた）
gh issue list -R angular/angular --label 'area: i18n' --state open \
  --limit 100 --json number,title,createdAt,comments,labels
gh issue list -R angular/angular --label 'area: i18n' --state closed \
  --search 'closed:>=2025-11-01' --limit 200 --json number,title,closedAt,stateReason,labels
# ラベルの無いものを、題の言葉で広げる（localize・i18n・xliff・translation・locale・ICU）
gh search issues --repo angular/angular "i18n in:title" --state open --limit 100 \
  --json number,title,createdAt,labels,commentsCount
gh search issues --repo angular/angular "i18n in:title" --state closed \
  --closed '>=2025-11-01' --limit 100 --json number,title,createdAt,closedAt,labels,commentsCount
# 1 つの issue の議論と、番号を書いた PR
gh issue view 60566 -R angular/angular --comments
gh pr list -R angular/angular --state all --search 60566
# 直した commit がスナップショット（8576f161ae4）に入っているか
git -C ../angular log --format='%h %ad %s' --date=short -E --grep='#67913([^0-9]|$)'
```

- 取った日は 2026-11-03。ソースは ../angular の 8576f161ae4（2026-09-06、22.2.0-next.7）です。それより後に merge された PR（#71426・#71608）は、スナップショットに入っていません。
- ラベルで取れたのは開いている 50 件と閉じた 66 件です。閉じた 66 件のうち 51 件は「🔄 Translation 21.0.3: \`README.md\`」のような、adev の文書の翻訳の同期のための issue（2026-03-11 に立って 4 分ほどで閉じられた）で、i18n の仕組みの話ではないので外しました。#67353（文書の翻訳のリンクの追加）も外しました。
- 題の検索（localize・i18n・xliff・translation・locale・ICU）で足したのは、開いている #71219（area: security）・#62697（language-service）・#47541・#45653・#44868（area: compiler）と、閉じた #71425・#69371・#69225・#69163 です。マイグレーションや forms のロケールの話（数の入力の小数点など）、文書の翻訳のリンクは入れていません。#43165 は題に「localized」とありますが、コンパイルの単位の話なので外しました。
- コメントの数は bot の投稿を含みます。PR は `gh pr list --search 番号` で探し、番号の数字が偶然含まれていただけのもの（Node の版の更新など）は外しました。

## 1. 一覧

> **🧪 issue を絞る**
>
> 2026-11-03 に gh で取ったデータを、このページの中に持っています（通信はしない）。「章」の列は、その issue を読むときに開いておくとよい章です（シリーズの外の章もあります）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/loc-issues)

- 開いている 50 件（ラベルあり）のうち、2024 年より前に立ったものが 30 件、2024 年が 10 件、2025 年以降が 10 件です。いちばん古いのは #13114（2016-11-28、前後の空白）で、コメントは 61 件あります。
- 2025 年以降の 10 件は、ICU の抽出（#65143・#60496・#62694）、ロケールのデータ（#67825・#63591・#63378）、翻訳ファイルの読み方（#60566）、制御フローとの組み合わせ（#60899）が中心です。
- 2025-11 以降に閉じたもののうち、#67906（出力のパス）・#68418（i18n の補間とサニタイズ）は security のラベル付きで、直した commit は、#67906 は立った当日、#68418 は翌日に入っています。ラベルのある 14 件のうち NOT\_PLANNED は 6 件で、#49175 と #39606 は JeanMeche の「Intl（と Temporal）に頼る」、#57193 は「CLDR からロケールのデータを作る道具を保つのが重荷。日の名前の短い形は day.js などを」という返事です。

## 2. 開いている issue を読む

1. **#60566 翻訳文の {title} が XLIFF では消える（2025-03-26、コメント 4）**

   報告者は `$localize` の文に、別のライブラリ（`intl-messageformat`）で使う `{title}` を書き、抽出した XLIFF をそのまま翻訳ファイルにすると、`{title} account` の部分が消える、と書いています。報告者はあとで「JSON の形式では起きない」と足しています。JoostK は「`{title}` が ICU として読まれる（Angular のテンプレートと同じ）が、ICU としては正しくない。エラーが表に出ないこと、ビルドでの翻訳と実行時の翻訳で振る舞いが違うことも問題」と書いています。第 17 回の 9 節の `parseInnerRange` の 50 行目（`tokenizeExpansionForms: true`）で中身を ICU として読み、XmlParser の ERROR になって、そこまでの文だけが残る、が仕組みです。JSON は 8 節の 78 行目で文字列をそのまま `ɵparseTranslation` に渡します。手元で本物のパーサーに読ませた結果が下です。「エラーが出ない」のは、CLI のローダーが `parse()` の返す診断を受け取らないからでした（第 17 回の聞かれそうな質問の 3 つ目。[cli-i18n](../cli/09-cli-i18n.md) に引用した load-translations.ts の 32・35 行目）。`localize-translate` なら、同じファイルはローダーの 78〜80 行目で例外になります。

📄 `出力（抜粋）`

```
# scratchpad/build-loc-e/issue-60566.mjs（2026-11-03。@angular/localize/tools 22.1.6）
target : "Hello {title} account"
xlf    : "Hello " [
  'error: Unexpected character "EOF" (Do you have an unescaped "{" in your template? ...)',
  "error: Invalid ICU message. Missing '}'. (...)"
]
json   : "Hello {title} account"
target : "My {counter, selectordinal, =1 {} =2 {second} =3 {third} other {#th} } {title} account"
xlf    : "My {counter, selectordinal, =1 {} =2 {second} =3 {third} other {#th}} " [ error 2 つ（同じ文） ]
json   : "My {counter, selectordinal, =1 {} =2 {second} =3 {third} other {#th} } {title} account"
```

1. **#47370 $localize の中の $localize（2022-09-07、コメント 0）**

   v14 で `` $localize`…${this.p(4, $localize`second`, $localize`seconds`)}…` `` の形が `".""second""seconds"` のような壊れたコードになった、という報告です。メンバーのコメントも PR もありません。2026-11-03 に、同じ形を Babel のプラグイン（[第 18 回](18-loc-translate-tool.md)の 5 節）と、サイトの node\_modules の `@angular/build` 22.1.7 の I18nInliner のワーカーの `inlineCode` に直接渡すと、どちらも正しいコードになりました（下）。報告の形は、今の 2 つの道では再現しません。issue は開いたままです。

📄 `出力`

```
# scratchpad/build-loc-e/nested-47370.mjs と nested-cli.cjs（2026-11-03）
入力: x = $localize`:@@outer:Account locked. Try again in ${this.p(4, $localize`:@@s:second`, $localize`:@@pl:seconds`)}:t:.`;

# @angular/localize/tools 22.1.6 の makeEs2015TranslatePlugin（翻訳なし、ignore）
x="Account locked. Try again in "+this.p(4,"second","seconds")+".";

# @angular/build 22.1.7 の i18n-inliner-worker.js の inlineCode（ng build の I18nInliner のワーカー）
[no translation] x = `Account locked. Try again in ${this.p(4, "second", "seconds")}.`; []
[fr] x = `Compte bloqué. Réessayez dans ${this.p(4, "seconde", "secondes")}.`; []
```

1. **#71219 翻訳文の U+FFFD の印と TNode（2026-10-07、area: security、コメント 1）**

   報告は「翻訳文は、コンパイラが作るのと同じ U+FFFD の印（`�#2�` など）を含められ、実行時の解析はそれをコンパイラが作ったものとして読む。印が、もう要素のある宣言の番号を指すと、`createTNodeAtIndex()` が確かめずに TNode を作り直し、新しい TNode にはタグ名が無いので、タグ名から決めるサニタイズの文脈が空になる」です。報告者の SkyZeroZx（コメントの authorAssociation は CONTRIBUTOR）は、自分のコメントで #70491 の backport と、閉じた自分の PR #70363（i18n のプレースホルダーの namespace を戻す）に触れています。メンバーのコメントはまだありません。印の読み方は[第 9 回](09-loc-runtime-start.md)、TNode を作る所は[第 10 回](10-loc-runtime-dom.md)です。
2. **#54672 実行時の翻訳が i18nMissingTranslation を見ない（2024-03-01、コメント 0）**

   `loadTranslations` で読んだ翻訳では、ビルドの `i18nMissingTranslation` の設定に関係なく「No translation found for …」の警告が出て、止める方法が無い、という報告です。ビルドの側の重さは `translate` の `missingTranslation`（[第 18 回](18-loc-translate-tool.md)の 6 節）で決まり、実行時の側は `$localize` の translate（[第 14 回](14-loc-runtime-translations.md)）で別の道です。
3. **ICU を別のメッセージにする件：#65143・#48668・#53089・#46241・#39551**

   #65143（2025-11-13）は「`This asset is used in {$ICU}` と ICU の中身が別々のメッセージになり、言語によっては訳せない」として、#48668・#53089・#46241 を関係する issue に挙げています。ICU がサブメッセージになり `ICU` のプレースホルダーでつながる仕組みは[第 7 回](07-loc-icu-compile.md)、その ID は[第 4 回](04-loc-message-id.md)です。#39551（2020-11-03）は、複数形の ICU の中の単語の文脈が別のメッセージになって消え、ID が同じになる、という同じ根の報告です。
4. **equiv-text：#56845・#52461**

   どちらも XLIFF の `<x equiv-text="…"/>` の値に、補間の前後の文字が入る（#56845 は補間がメッセージの先頭にあるとき、#52461 は async パイプのとき）という報告です。equiv-text を書く行は[第 16 回](16-loc-serializers.md)、元のコードの範囲の取り方は[第 15 回](15-loc-extract-tool.md)です。
5. **ロケールのデータ：#63591・#47637・#20487・#54470**

   #20487（2017、コメント 40）と #63591（2025）はロケールのデータの遅延読み込み、#47637 は `LOCALE_ID` を動的に変えること、#54470（コメント 18）は Intl を使うことです。JeanMeche の Intl の実装の PR #55283（2024-04）は閉じられています。閉じた側の #49175・#39606 の返事も「Intl に頼る」でした（1 節）。仕組みは[第 12 回](12-loc-locale-data.md)です。
6. **翻訳ファイルの形：#49045・#36757・#56953・#55073**

   #49045 は JSON の入れ子のキー（#52241 はその重複として 2026-03 に閉じた）。今の `SimpleJsonTranslationParser` は `translations` の値を 1 段だけ読みます（[第 17 回](17-loc-translation-parsers.md)の 8 節の 76〜78 行目）。#36757 はライブラリの作者が翻訳を配る方法で、ローダーは 1 つのロケールに複数のファイルを合わせられます（第 17 回の 3 節）。#56953・#55073 は、抽出の結果と今の翻訳ファイルを合わせる道具の要望です。

> [!NOTE]
> **ポイント**
>
> #60566 と #47370 は、どちらも「本物を同じ形で走らせる」と読み方が変わる issue でした。#60566 はパーサーではエラーが出ていて、CLI がそれを捨てている。#47370 は、今の 2 つの置き換えの道ではもう起きない。issue の本文は報告の時点の版の話なので、今のスナップショットの行と、手元の実行の結果を並べて読みます。

## 3. 閉じたもの

### #67906 出力のパスの外に書ける → 78710938225（#67913）

`localize-translate` の `-o 'dist/{{LOCALE}}'` の印を、翻訳ファイルの `target-language` の値で置き換えていて、その値に `../` を書けば出力のフォルダの外に書けた、という security の報告です。alan-agius4 が 2026-03-27 に `getOutputPathFn` でロケールの `/ \ ..` を拒む変更と spec を足しました（[第 18 回](18-loc-translate-tool.md)の 9 節）。第 18 回で同じ値を本物に渡すと、外には書かれませんでしたが、`$localize` を含む JS のときだけ、ハンドラーの 2 回目の書き込みが `try` の外にあるので、例外で CLI が止まりました（4 節）。

### i18n とサニタイズ：#68418 → 9d7a609458f、#69163 → NOT\_PLANNED

#68418（2026-04-28）は i18n の補間とサニタイズの報告で、alan-agius4 の 9d7a609458f「validate security-sensitive attributes in i18n bindings」（2026-04-29）で閉じました。#69163（2026-06-04）は「i18n の属性のバインディングが RESOURCE\_URL のサニタイズをすり抜ける（CVE-2026-32635 の直しが足りない）」という報告で、JeanMeche が「問題ではない」と答えて同じ日に閉じています。スナップショットまでの 1 年には、ほかにも i18n の属性とサニタイズの commit（de0eb4c6566 翻訳された form の属性、8630319f74c 補間のある属性、306f367899d ICU の中の URI の属性、ce1c0f7ab9b タグ名の正規化（#68868））が並んでいます。翻訳された属性を入れる所は[第 10 回](10-loc-runtime-dom.md)です。

### #68258 SSR で loadTranslations が効かない → COMPLETED（2026-09-08）

brandonroberts の報告で、Express の middleware でリクエストごとに `clearTranslations()` と `loadTranslations()` をしても英語のまま、というものです。alan-agius4 は「`@angular/localize` が `server.mjs` と `server.main.mjs` に別々に入っている。`@angular/ssr` 以外の Angular の API は `server.ts` で使う作りではない」「実行時の i18n はグローバルの状態に頼るので、同時のリクエストで違うロケールになりうる」と書いています。番号を書いた PR は見つけていません。翻訳がグローバルに載る仕組みは[第 14 回](14-loc-runtime-translations.md)、ロケールごとの入口は[ssr-app-engine](../platform/04-ssr-app-engine.md)です。

### #69371 i18n-on の属性 → #69306（417a4071a77）

v22.0.1 から `i18n-on…` の形の属性がイベントのハンドラーとして拒まれた回帰で、JoostK が「#69306 で直った」と答えています。#69306 は alan-agius4 の「restrict possible event handler check to property names longer than 2 characters」（2026-06-15 に merge、commit は 417a4071a77）です。その前の 6c41f5ca01c「disallow i18n event attributes」（2026-05-20）が、i18n の属性の名前の検査を足していました。i18n の印の読み方は[第 2 回](02-loc-markup.md)です。

### #37298 ICU の中のディレクティブ、#71425 ハイドレーションの ICU → スナップショットの後の PR

#37298（2020）は aparzi の #71608（2026-10-25 に merge）で、#71425（2026-10-19）は lazerg の #71426（2026-10-20 に merge）で閉じました。どちらも 8576f161ae4 より後なので、../angular のソースには入っていません。読むときは `gh pr view 71608 -R angular/angular` と、main のファイルを `gh api 'repos/angular/angular/contents/<path>?ref=main'` で読みます。

### #48697 CLDR の版 → a1868c9d139（#64032）

JeanMeche が「v21 は #63923 で CLDR 47 を使う」と答えて閉じました。git では 8ca3e3a0bc5（#63923、2025-09-18）が a9145f38562 で一度戻され（2025-09-24）、a1868c9d139（#64032）が CLDR 47 への更新として残っています。ロケールのファイルを作る道具は[第 12 回](12-loc-locale-data.md)です。

## 4. このシリーズで見つけた「不具合らしきもの」

第 17〜18 回では、サイトの node\_modules の本物（`@angular/localize/tools` 22.1.6）を scratchpad の小さなスクリプトと CLI で走らせて確かめました。../angular のファイルは変えていません。どれも `gh search issues` / `gh search prs` で同じ報告は見つかりませんでした（2026-11-03）。**本家に issue や PR を出すことは勧めません。**手元で同じ形を spec にして確かめ、issue を読むときの手がかりにします。

| 場所 | 入力の形 | 結果 | 行（章） |
| --- | --- | --- | --- |
| localize-translate（SourceFileTranslationHandler） | ロケールが `../evil` の翻訳ファイルと、`$localize` を含む JS | 1 回目の書き込みは診断に積まれるが、同じパスへの 2 回目の書き込みが `try` の外で投げ、残りのファイルも診断の表示もされずに止まる（JS 以外と `$localize` の無い JS では `error:` の行になる） | source\_file\_translation\_handler.ts 129〜138（[第 18 回](18-loc-translate-tool.md)） |
| ng build の翻訳の読み込み（angular-cli） | パーサーが ERROR を返す翻訳ファイル（#60566 の形） | CLI のローダーが `parse()` の診断を受け取らず、空の診断を返すので、エラーも警告も出ずに途中までの翻訳が使われる | angular-cli の load-translations.ts 32・35（[cli-i18n](../cli/09-cli-i18n.md)、[第 17 回](17-loc-translation-parsers.md)） |
| SimpleJsonTranslationParser | 拡張子は .json だが `"locale"` か `"translations"` の文字が無い | 理由が「File does not have .json extension.」になる | simple\_json\_translation\_parser.ts 41〜45（第 17 回） |
| canParseXml | 根の要素が 2 つある XLIFF 2.0 や XTB | 警告の文が「XLIFF 1.2 files should only have…」 | translation\_utils.ts 130〜138（第 17 回） |

動きを変えないものとして、`MessageSerializer` の使われていない `isPlaceholderContainer`（message\_serializer.ts 105〜107 行目）と、tools/test/helpers/index.ts の使われていない `counter`（[第 19 回](19-loc-testing.md)の 7 節）、ES2015 のプラグインが投げるのが `Error` でなく文字列であること（第 18 回の 5 節）もありました。

## 5. 誰が直しているか（スナップショットまでの 1 年）

`git log --since=2025-09-06` を packages/localize・core の render3/i18n と instructions/i18n.ts と i18n/・compiler の i18n/ と render3/view/i18n/・common の i18n/ と locales/ に絞ると 66 件で、題の種類は fix 26・refactor 18・build 13・feat 3・docs 2 ほかでした。書いた人は Alan Agius 13、Matthieu Riegler 9、Kristiyan Kostadinov 8、Angular Robot 7、SkyZeroZx 5、splincode・arturovt・arshiya tabasum・Joey Perrott が 3 ずつの順です。

- **Alan Agius**は、security の報告の直し（78710938225 出力のパス、9d7a609458f i18n のバインディング）と、Node や Babel の版の更新が中心です。
- **小さな fix**は、arshiya tabasum の localize の 2 件（5de0ea5f23f 実行時の翻訳の表を null の prototype で作る、2a4f5827311 プレースホルダーを `Object.hasOwn` で引く）のように、1 つの関数の 1 つの穴に 1 つの commit です。
- 2026-05〜08 には「prototype を通らない」直し（0deac976f36 LOCALE\_DATA、359fb503b8f 日付の書式のキャッシュ、1ec125276d8 formatDateTime、732e5050180 hasOwnProperty を全部 Object.hasOwn に）がまとまって入っています。

## 6. issue を読む手順

1. **メンバーのコメントだけを先に拾う**

   `gh issue view N -R angular/angular --json comments -q '.comments[] | select(.authorAssociation=="MEMBER" or .authorAssociation=="CONTRIBUTOR")'`。#68258 のように、原因（パッケージが 2 つ入っている）がメンバーの 1 つのコメントに書かれていることが多いです。
2. **道を決める**

   i18n の issue は、コンパイラ（テンプレート → $localize）・実行時（$localize → DOM）・ツール（抽出・翻訳ファイル・差し込み）・CLI のどの道の話かで、開く章が変わります。1 節の表の「章」の列から開きます。
3. **本物を同じ形で走らせる**

   ツールの話なら、サイトの node\_modules の `@angular/localize/tools` を Node で呼ぶのが早いです（第 17・18 回のスクリプト）。コンパイラの話ならコンプライアンステストのテストケース、実行時の話なら acceptance の i18n\_spec.ts の形（[第 19 回](19-loc-testing.md)）。
4. **--filter で走らせ、本数を見る**

   0 本でも PASSED になります。`localize/tools/test:test` は 4 shard なので、「Ran N」を足します。
5. **直った issue は commit からたどる**

   `git log -E --grep='#番号([^0-9]|$)'` で commit を探し、`git show --stat` で変えたファイルと spec を見ます。78710938225 は output\_path.ts と output\_path\_spec.ts の 2 つでした。

## テストと直し方（シリーズのまとめ）

i18n の spec のターゲットと、手元で走らせた本数と秒数は[第 19 回](19-loc-testing.md)の 3 節の表にまとめました。LOC-COMMON の基準の実行（2026-11-03、初回のビルド込み）では、`//packages/localize/...` と compiler・render3・compliance/full の 28 ターゲットがすべて PASSED でした。issue と章の行と spec を並べるときの入口は次のとおりです。

| issue | 見る行 | 足すならこの spec |
| --- | --- | --- |
| #60566 | translation\_utils.ts の `parseInnerRange` 50 行目（第 17 回） | xliff1\_translation\_parser\_spec.ts の `[message errors]`（806 行目） |
| #47370 | es2015\_translate\_plugin.ts 37〜52 行目（第 18 回） | es2015\_translate\_plugin\_spec.ts の `(with translations)`（110 行目） |
| #67906 の続き | source\_file\_translation\_handler.ts 129〜138 行目（第 18 回） | source\_file\_translation\_handler\_spec.ts の `translate()`（50 行目） |
| #54672 | 実行時の translate（第 14 回） | localize/src/utils/test/translations\_spec.ts（第 19 回の表） |
| #65143 など ICU | ICU のサブメッセージ（第 7 回） | compliance の `r3_view_compiler_i18n/icu_logic/`（第 19 回の 4 節） |

このシリーズでは本家に PR を出すことは勧めません。issue を読むときは、関係する章の行と spec で「今の振る舞い」を自分の目で確かめる、までにします。

## 聞かれそうな質問

**Q. 翻訳文に ICU でない波括弧を書いたら文が切れました。バグですか？**

#60566 と同じ形です。XLIFF のパーサーは `<target>` の中身を ICU として読む（第 17 回の 9 節）ので、ICU の形でない `{title}` は ERROR になり、そこまでの文だけが残ります。`localize-translate` では例外で止まりますが、ng build では CLI のローダーがその診断を捨てるので表に出ません（4 節）。JSON の形式なら波括弧はそのまま残ります。

**Q. SSR でリクエストごとにロケールを変えたいのですが、loadTranslations で足りますか？**

#68258 で alan-agius4 が答えたとおり、実行時の翻訳はグローバルの状態に頼るので、同時のリクエストで違うロケールになりうる、と書かれています。`server.ts` と `server.main.mjs` に `@angular/localize` が別々に入る問題もありました。ロケールごとにビルドして、ロケールごとの入口で分ける道は[ssr-app-engine](../platform/04-ssr-app-engine.md)です。

**Q. ロケールのデータを遅延読み込みしたい・LOCALE\_ID を動的に変えたい、は対応予定ですか？**

#20487・#63591・#47637 は開いたままで、付いている PR は閉じた Intl の実装（#55283）だけです。閉じた側の #49175・#39606 の返事は「Intl に頼る」でした（1 節）。

**Q. issue が開いたままなのに、直した commit があるのはなぜ？**

#43260 には 2021 の bba0a870554（#43815）があり、#62697 には 80e00ff4e58（#64392）がありますが、どちらも開いています。commit が issue の一部だけを直したか、閉じる手続きがされていないかは、issue のコメントを読まないと分かりません。`gh pr view` で PR の本文の「Fixes」の書き方も確かめます。

## 読み終えて

- area: i18n で開いているのは 50 件（ほかに関係するもの 5 件）。ICU の抽出、ロケールのデータ、翻訳ファイルの形、実行時の翻訳の設定が多い。
- 2025-11 以降に閉じたものは、security の 2 件が当日と翌日に commit で直り、ロケールのデータの機能の要望の一部は「Intl に頼る」で NOT\_PLANNED になっている。
- #60566 はパーサーではエラーが出ていて CLI が捨てている、#47370 は今の 2 つの道では起きない。本物を同じ形で走らせると、issue の読み方が変わる。
- 直している人は Alan Agius（security と版の更新）が最も多く、ほかは 1 つの関数の 1 つの穴に 1 つの commit の小さな fix が並ぶ。78710938225 のように、spec を同じ commit で足している。

---

← 前: [i18n のテスト：spec の場所と走らせ方](19-loc-testing.md)  
次: [Service Worker の全体像：ngsw.json・ngsw-worker.js・SwUpdate](../sw/01-sw-overview.md) →
