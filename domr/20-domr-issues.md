[目次](../README.md) › [DOM レンダラーとイベントの内側](README.md) › 第 20 回 / 全 20 回

# issue と PR を読む：レンダラー・スタイル・イベント・セキュリティの今

> area: security・core: sanitization・core: DOM rendering・core: CSS encapsulation・core: stylesheets・core: styling bindings・core: event listeners・core: event dispatch・core: host and host bindings のラベルで開いている issue と、2025-11 以降に閉じた issue の表。security の issue の流れ（VRP）、どの issue がこのシリーズのどの章の行に関係するか、2026 年に入った修正（insertBefore のエラー、SVG のアニメーション属性、ReDoS、ホストのバインディングのサニタイズ）の読み方。

angular/angular · 読了 約 12 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/domr-issues)

---

最終回は、このシリーズの範囲（レンダラー・スタイル・イベント・セキュリティ）の「今」を issue と PR から読みます。9 つのラベルで開いている issue と、2025-11-01 以降に閉じた issue を番号で重ねると、開いている 58 件・閉じた 34 件になりました（取った日は 2026-11-04）。表のあとで、開いている issue と 2026 年に入った修正の commit を、第 1〜19 回で読んだどの行の話かに結びつけます。

読む対象は GitHub の angular/angular の issue と PR（`gh` で読むだけ）と `git -C ../angular log` です。この章にはソースの引用はありません。行は各章で引用したものを指します。

1. [1. 全体像](01-domr-overview.md)
2. [2. Renderer2 の約束](02-domr-renderer-api.md)
3. [3. DomRendererFactory2](03-domr-renderer-factory.md)
4. [4. 要素とテキスト](04-domr-default-renderer.md)
5. [5. 属性とプロパティ](05-domr-attributes-properties.md)
6. [6. カプセル化](06-domr-encapsulation.md)
7. [7. SharedStylesHost](07-domr-shared-styles.md)
8. [8. CSS 変数の名前空間](08-domr-css-var-namespacing.md)
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
20. **20. issue と PR を読む**（この章）

## 0. 先に読む：security の issue は流れが違う

📄 `出典（2026-11-04 に確かめた）`

```
$ head -1 ../angular/SECURITY.md
Angular is part of Google Open Source Software Vulnerability Reward Program. For vulnerabilities in Angular,
please submit your report here (https://bughunters.google.com/report).

# area: security の 29 件（開いている 12 + 閉じた 17）を立てた人
SkyZeroZx 8 / fg0x0 2 / jelbourn 2 / opensource1000 2 / ほか 1 件ずつ

# 2026 年の sanitization/・dom_security_schema.ts・meta.ts の commit の author
Alan Agius 12 / SkyZeroZx 7 / Kristiyan Kostadinov 5 / Matthieu Riegler 3 / leonsenft 1 / Jaime Burgos 1
```

1. **脆弱性はまず Google の VRP へ**

   リポジトリの `SECURITY.md` は 1 行だけで、Angular の脆弱性は Google の Open Source Software Vulnerability Reward Program に報告するように書いています。公開の issue になっている `area: security` の多くは、VRP で受けたあと「公開してよい」とされたものです（#70743 の本文は「Google VRP からここで知らせるよう言われた」、#67902 は「VRP の担当が公開の issue として受けた」と書いています）。
2. **報告する人と直す人が近い**

   `area: security` の 29 件のうち 8 件は SkyZeroZx が立て、2026 年の sanitization まわりの commit も Alan Agius（12）と SkyZeroZx（7）が多くを占めます。#70490（投影と名前空間）・#70126（Meta）は報告した人が同じ日に PR（#70491・#70127）を出し、#69550（ホストのバインディング）も 2 日後に PR #69558 を出して、どれも直って閉じています。
3. **「AI が作った報告」は閉じられる**

   #67902 には alan-agius4 が「元の報告は AI が作ったもので無効。ブラウザでの振る舞いを確かめていない」と書いて NOT\_PLANNED で閉じました。#69163・#69164（どちらも fg0x0）も、表の不足を数行で並べただけの報告で、#69164 には JeanMeche が閉じた PR #69162 を示し、2 件とも NOT\_PLANNED です。security の issue で求められているのは、**実際のブラウザで値が実行されること**を確かめた再現です。

> [!WARNING]
> **ハマりどころ**
>
> このシリーズの読者の目標はコミッターになることですが、security の場所は最初の PR に向いていません。報告の道が VRP で、直す人も限られ、表を 1 行変えるだけでも `dom_security_schema.ts` の 34 行目の「security review なしに変えるな」の対象です（[第 17 回](17-domr-sanitization.md)）。このシリーズでは、仕組みを読んで issue に「どの行の話か」を正確に答えられること、手元で spec を書いて確かめられることを目標にします。

## 1. データの取り方

📄 `ターミナル（読むだけ）`

```
# ラベルごとの open-*.json・closed-*.json（開いている / 2025-11-01 以降に閉じた）は、
# シリーズの準備で 2026-11-04 に gh で取ったもの（scratchpad/domr-logs/）。ここから下は、この章のために走らせたもの

# 番号で重ねたあと、コメントの数・PR・閉じた PR か commit を GraphQL でまとめて（読むだけ）
gh api graphql -f query='query { repository(owner:"angular", name:"angular") {
  i71618: issue(number: 71618) { comments { totalCount }
    timelineItems(first: 50, itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT, CLOSED_EVENT]) { ... } }
  ...（92 件ぶん） } }'

# 2026 年に入った修正
git -C ../angular log --since=2026-01-01 --format='%h %ad %s' --date=short -- \
  packages/platform-browser/src/dom packages/platform-browser/src/browser packages/core/src/sanitization \
  packages/core/src/util/security packages/core/src/render3/styling packages/core/src/render3/instructions/styling.ts \
  packages/core/src/render3/view/listeners.ts packages/core/src/render3/dom_node_manipulation.ts | grep -E ' (fix|feat|perf)'
```

- ソースは ../angular の 8576f161ae4（22.2.0-next.7）です。issue に書かれた main の行番号（例えば #71618 の「v22.2.3 の 106 行目」）は、スナップショットの行と少しずれます。
- ラベルは 9 つ（`area: security`・`core: sanitization`・`core: DOM rendering`・`core: CSS encapsulation`・`core: stylesheets`・`core: styling bindings`・`core: event listeners`・`core: event dispatch`・`core: host and host bindings`）。2 つ以上のラベルが付いた issue は 1 行にしました。
- コメントの数は GraphQL の `comments.totalCount` です（ラベルの JSON は 100 件で切れていたので取り直しました。#18877 は 123 件）。
- PR は issue の timeline の `CrossReferencedEvent`・`ConnectedEvent` のうち angular/angular のものだけです。#61839 に出てくる #68636 は forms の性能の PR で関係が無いので外しました。angular/angular の PR は commit を直接 push して閉じることが多く、「閉じた」でも commit が入っていることがあります（#69558 → d06e3748b7b）。

| ラベル | 開いている | 閉じた（2025-11 以降） |
| --- | --- | --- |
| security | 12 | 17 |
| sanitization | 6 | 2 |
| DOM rendering | 3 | 1 |
| CSS encapsulation | 10 | 6 |
| stylesheets | 11 | 1 |
| styling bindings | 3 | 1 |
| event listeners | 13 | 2 |
| event dispatch | 2 | 1 |
| host bindings | 5 | 4 |

## 2. 一覧

> **🧪 issue を絞る**
>
> 2026-11-04 に gh で取ったデータを、このページの中に持っています（通信はしない）。「章」の列は、その issue を読むときに開いておくとよい章です。題そのものではなく、内容を日本語で短くしました。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/domr-issues)

- 開いている issue の半分ほどは 2015〜2021 年に立った機能の要望で（#18877 ホストを持たないコンポーネント、#17766 ディレクティブの styles、#8866 passive のリスナーなど）、コメントは多いのに PR が付いていないか、付いた PR が閉じています。
- 2026 年に立ったものは security が中心です。開いている #71618・#71219・#70743 は、どれも第 17・18 回の表と名前空間の行の話です（3 節）。
- 閉じたもののうち COMPLETED の多くは、CSS のカプセル化の書き換え（mattrbeck の #64937・#65010・#65012）と security の直しです。

## 3. 開いている issue を読む

1. **#71618 SVG の &lt;use&gt; の href（PR #71619 が開いている）**

   [第 17 回](17-domr-sanitization.md)の 1 節の表で、SVG の名前空間に登録されているのは 110 行目の `a` の `href`・`xlink:href` だけです。`<use>` は表に無いので `checkSecurityContext` が `NONE` を返し、コンパイラは `ɵɵattribute` にサニタイザを付けません（第 17 回の 2 節）。PR #71619 は `use` の 2 つを RESOURCE\_URL にし、`null` を含む動的な値は印が無ければ NG0904 になる、という破壊的変更なので `target: major` が付いています。PR には SkyZeroZx が「v23 だけに入ると LTS の v20〜22 に届かない」と書いています。
2. **#70743 MathML の下で宣言した &lt;set&gt;（PR #70756 は閉じた）**

   [第 18 回](18-domr-trusted-types.md)のデモ 2 の `:math:set` の行です。`checkSecurityContext` の 215 行目は「名前空間が無いとき」だけ SVG の表を見て、`ɵɵvalidateAttribute` の 361 行目も「SVG か、名前空間なし」だけを見るので、`math` の名前空間の `<set>` の `to` は素通りします。本文は 7168bed663b（#70490 の直し）のあとも残る、としています。PR #70756 は出した本人が「とても端のケースで、この直し方に自信が無い。issue で話そう」と閉じました。
3. **#71219 翻訳の中の U+FFFD が TNode を作り直す（PR #70363 は閉じた）**

   i18n の実行時が、翻訳の文の中の印を、コンパイラが作った印と同じように読んでしまい、既にある要素の TNode を名前の無いものに置き換える、という報告です。サニタイザは TNode の名前（`tNode.value`）でタグを知るので（第 17 回の 3 節の 307 行目の第 2 引数）、名前が空だと `getUrlSanitizer` が `null` を返し、`ɵɵsanitizeUrlOrResourceUrl` が値をそのまま返します（第 17 回の 4 節の 244・264 行目）。
4. **#45270 DomSanitizer が style 属性を消す（PR #70425 が開いている）**

   コメント 26 件の古い issue です。2026-08-27 に JeanMeche が「#70425 で破壊的変更になりうると分かったので、2027 年の v23 で入れる」と書いています。HTML のサニタイザの属性の表は[サニタイズの章](../template/07-sanitize.md)です。
5. **#42527 印の付いたリソースの URL に undefined をバインドできない（PR #71756 が開いている）**

   `ɵɵsanitizeResourceUrl` は sanitizer も印も無ければ必ず例外で（第 17 回の 4 節の 144〜147 行目）、`undefined` もそこに落ちます。2026-10-31 の PR #71756「null と undefined を resource URL のプロパティにバインドできるように」に `action: review` が付いています。#71619 は逆に `null` でも NG0904 にする向きなので、2 つの PR の関係を見ておくと読みやすくなります。
6. **#61013 MathML が DomSanitizer で消える・#68273 HTML Sanitizer API に合わせる**

   どちらも HTML のサニタイザの許可リストの話です。#61013 の PR #69213・#69214 は 2026-06 に閉じました。#68273 では、手伝いを申し出たコメントに JeanMeche が「手伝ってほしいときは `open for contributions` のラベルを付ける。今はまだ意見を集めている」と答えています。**このラベルの無い issue に PR を出しても受け付けられにくい**、という読み方の手がかりです。
7. **CSP と nonce（#26152・#54689・#54031・#56854・#68271）**

   コンポーネントのスタイルの `<style>` を足す SharedStylesHost の話です（[第 7 回](07-domr-shared-styles.md)）。#26152 はコメント 26 件、2018 年からです。
8. **イベントのリスナー（#61839・#9587・#8866・#11200 ほか）**

   zoneless で変更検知を起こさずに聞く方法（#61839）、`stopImmediatePropagation()`（#9587）、passive（#8866）、capture（#11200）。どれも `listen` がどのオプションで `addEventListener` を呼び、リスナーをどう包むかの話で、[第 14 回](14-domr-listen.md)と[第 16 回](16-domr-custom-plugin.md)を開いて読みます。#61839 には arturovt の PR #70668（包んだリスナーの元を出す refactor）が開いています。

## 4. 2026 年に入った修正を commit で読む

DOMR-COMMON に挙げた 8 つの commit を `git show --stat` と本文で読み、どの章の行に当たるかを並べます。

| commit | 日付・書いた人 | 何を変えたか | 章と行 |
| --- | --- | --- | --- |
| 1cb3d606bf5 | 2026-08-13 arturovt | `insertBefore` の参照ノードの親が違うとき、ブラウザの読めない `NotFoundError` の代わりに NG05106 を投げる。dom\_renderer.ts に 20 行、spec に 36 行 | [第 4 回](04-domr-default-renderer.md)。dom\_renderer.ts の `insertBefore`（354〜369 行目付近） |
| fb6b354fbd3 | 2026-07-14 CYANO-01 | `SOURCEMAP_URL_REGEXP` の `(.+?)` を `([^\s*]+)` にして、閉じていない `/*# sourceMappingURL=` で 2 乗の時間がかかる ReDoS を消す。1 行だけ | [第 6 回](06-domr-encapsulation.md)。dom\_renderer.ts 50 行目と `addBaseHrefToCssSourceMap`（ShadowDom と Emulated の renderer が呼ぶ） |
| f98547675cd・8c8b2f77831 | 2026-05-19・20 Matthew Beck（#68846） | CSS 変数をアプリごとの名前空間に入れる `%NS%` と、`[style.--x]` のプロパティにも広げる（feat） | [第 8 回](08-domr-css-var-namespacing.md)。dom\_renderer.ts の `CSS_VAR_NAMESPACE` |
| d06e3748b7b・f57d5d5c8c3 | 2026-06-30 SkyZeroZx（#69558、issue #69550） | ホストのバインディングの SecurityContext を「どの要素でも」で計算し直し、実行時に本当の要素（`#host` なら tagName）と名前空間で選ぶ | [第 17 回](17-domr-sanitization.md)。ingest.ts 151〜185 行目、sanitization.ts の `resolveElement` 299〜309 行目 |
| 3499a1321bf | 2026-07-20 Alan Agius | SVG のアニメーションの静的な `attributeName` を、属性の名前を全部見て大文字小文字を無視して探す | [第 18 回](18-domr-trusted-types.md)。sanitization.ts 402〜403 行目 |
| 7168bed663b | 2026-08-31 SkyZeroZx（issue #70490） | 名前空間の無い `<set>` などにも SVG の表を使う | 第 18 回。dom\_security\_schema.ts 213〜220 行目、sanitization.ts 361 行目の `\|\| !namespace` |

このほかに、同じ範囲の 2026 年の fix・feat・perf は次のとおりです（`git log --since=2026-01-01`、1 節のコマンド）。

| 章 | commit |
| --- | --- |
| [第 17 回](17-domr-sanitization.md)（表とサニタイズ） | 933608c07f4 core の表を compiler に合わせる（5-19）・00c284015c9 resource URL の選び方を大文字小文字を無視（5-05）・028e1d3ce0e `object[data]` を RESOURCE\_URL に（3-23）・75033d2001f SVG の a の href（5-21）・3927a5b2710 MathML のどの要素の href も（6-05）・90494cd909d 名前空間付きの SVG の script をコンパイルで取り除く（5-19）・de0eb4c6566 翻訳した form の属性・9d7a609458f i18n のバインディングの検査・7ba082e08e5 html\_sanitizer の prototype の名前の衝突（8-19） |
| [第 18 回](18-domr-trusted-types.md)（止める属性） | e84e35cdd60 SVG のアニメーションの危ない属性（3-27）・e6406924527 小文字の attributename（6-05）・0152e3cbdf5 iframe の credentialless（6-12）・91dc91bae4a SVG の script の属性（1-06）・5b421c61cdb ホストのバインディングの on\* を常に禁止（5-08） |
| [第 19 回](19-domr-title-meta.md) | d5a489aed3c セレクタのエスケープ（5-27）・6f9a6bea509 on\* を拒む（8-17） |
| [第 7 回](07-domr-shared-styles.md) | d45b7a91f96 ホストが外れたときに使わなくなったスタイルを消す（3-30）・cdda51a3b2f シャドウルートの下での bootstrap（feat、3-30） |
| 第 9〜12 回（スタイル） | 4831a9f676c クラスのバインディングで Set を扱う（1-15）・a786862c541 null の prototype のオブジェクト（6-02）・e43eb96341b スタイルのプロパティに不正な値で警告 NG0318（7-26） |
| 第 14 回（listen） | 3583c01bf9a オブジェクトでないイベントとリスナーの包みの同一性（4-25）・d5fd51e9569 イベントの再生の 2 回呼び（4-25） |
| [第 4 回](04-domr-default-renderer.md) | 83f7695b2e4 ハイドレーション・描画で DOM のノードが見つからないときに番号付きの RuntimeError（8-19） |

## 5. このシリーズで見つけた「不具合らしきもの」と小さな気づき

第 17〜19 回で、ソースの行と本物の配布物（サイトの node\_modules の 22.1.6）で確かめたものです。../angular のファイルは変えていません。どれも **本家に issue や PR を出すことは勧めません**。issue を読むときの手がかりにします。

| 場所 | 形 | 確かめ方 | 章 |
| --- | --- | --- | --- |
| sanitization.ts の `ɵɵvalidateAttribute`・dom\_security\_schema.ts の `checkSecurityContext` | `math` の名前空間の `set` の `to` が素通り | 第 18 回のデモ 2 で本物の `ɵɵvalidateAttribute('x', ':math:set', 'to')` が値を返す。既に #70743 として開いている | [第 18 回](18-domr-trusted-types.md) |
| meta.ts の `parseSelector` | `name` も `property` も無いタグ（`charset` など）は `property="undefined"` で探すので、`addTag` のたびに増える | 第 19 回のデモで 2 回 addTag。meta\_spec.ts に charset の it は無い。振る舞いとして文書に書かれていないので、不具合かどうかは決めていない | [第 19 回](19-domr-title-meta.md) |
| meta.ts 65 行目の `_cachedHead` | どこからも使われていないフィールド | `grep`。main では消えていた（`gh api …?ref=main`） | 第 19 回 |
| dom\_security\_schema.ts 112 行目のコメント・security\_spec.ts の `SECURITY_SENSITIVE_ATTRS` の上のコメント | 今は無い名前（`SECURITY_SENSITIVE_ELEMENTS`・compiler の `SECURITY_SENSITIVE_ATTRS`）を指している | `grep -rn` で、そのコメントの行しか出ない。main も同じ | 第 18 回 |
| testability.ts の `whenAllStable` | Testability が 0 個だと callback が呼ばれない | ソースの行（40〜49 行目）だけで確かめた。これを確かめる spec は見つからなかった | 第 19 回 |

## 6. issue を読む手順

1. **ラベルで場所を当てる**

   `area: security` なら第 17・18 回の表と名前空間、`core: stylesheets` なら SharedStylesHost（第 7 回）、`core: CSS encapsulation` ならコンパイラの CSS の書き換え（第 6 回と [compiler-shadow-css](../compiler/18-compiler-shadow-css.md)）、`core: event listeners` なら listen（第 14 回）です。
2. **メンバーのコメントだけを拾う**

   `gh issue view N -R angular/angular --json comments -q '.comments[] | select(.authorAssociation=="MEMBER")'`。#45270 の「v23 で入れる」、#68273 の「まだ意見を集めている」のように、方針は 1 つのコメントに書かれていることが多いです。
3. **再現が「ブラウザで実行される」まで書かれているか**

   security の issue では、#70743 のように再現の手順と結果（`POC_RESULT=VULNERABLE`）まで付いているものが受け付けられ、#67902 のように表の不足を並べただけのものは閉じられています（0 節）。
4. **spec の形で手元で再現する**

   サニタイズは core の `sanitization_spec.ts`（関数を直接）か acceptance の `security_spec.ts`（`expectHostBinding` で本物の要素）、止める属性は render3 の `integration_spec.ts` の `sanitization`、Meta は `meta_spec.ts`。それぞれのターゲットと走らせ方は各章の「テストと直し方」にあります。
5. **直った issue は commit からたどる**

   `git log -E --grep='#番号([^0-9]|$)'` と `git show --stat`。#69550 は issue の closer が commit d06e3748b7b で、PR #69558 は「閉じた」でした（commit を直接入れたため）。

## テストと直し方（シリーズのまとめ）

📄 `bazel のターゲット（../angular で。2026-11-04）`

```
# DOMR-COMMON の基準（2026-11-04、--nocache_test_results、4 つ同時で 25 秒。ログは scratchpad/domr-logs/base.log）
//packages/platform-browser/test:test        PASSED in 2.8s
//packages/core/test/render3:render3         PASSED in 3.4s
//packages/core/test:test                    PASSED in 3.4s（4 シャード）
//packages/core/test/acceptance:acceptance   PASSED in 8.1s

# 第 17〜19 回で絞って走らせたもの（e-*.log）
//packages/core/test:test   ^(sanitization|HTML sanitizer|URL sanitizer)        21 × 4 シャード = 84 件
//packages/core/test/acceptance:acceptance   security_spec の 8 つの describe  325 件
//packages/core/test/acceptance:acceptance   ^(iframe processing|SVG animation processing)  294 件
//packages/core/test/render3:render3   ^sanitization                             20 件
//packages/platform-browser/test:test   ^(DOM Sanitization Service|Meta service|title service)  28 件
//packages/platform-browser/test:test   testability registry                      0 件（:test_web でしか走らない）
//packages/platform-browser/test:test_web   絞らずに全部   test_web_chromium PASSED in 2.8s / test_web_firefox PASSED in 7.0s
```

| issue | 見る所 | 確かめるならこの spec |
| --- | --- | --- |
| #71618 | dom\_security\_schema.ts の SVG の URL の行（第 17 回） | security\_spec.ts の `SVG <a> link sanitization` の形（`:acceptance`） |
| #70743 | checkSecurityContext の 215 行目・ɵɵvalidateAttribute の 361 行目（第 18 回） | integration\_spec.ts の `sanitization` の `projected into an svg element`（`:render3`） |
| #71219 | sanitization.ts の resolveElement と TNode の名前（第 17 回） | security\_spec.ts の `iframe processing` の `i18n`（`:acceptance`） |
| #42527・#45270 | ɵɵsanitizeResourceUrl・DomSanitizerImpl（第 17 回）、HTML のサニタイザ（sanitize の章） | sanitization\_spec.ts・html\_sanitizer\_spec.ts（`:test`） |
| Meta の on\*（#70126、閉じた） | meta.ts の validateMetaDefinition（第 19 回） | meta\_spec.ts（`//packages/platform-browser/test:test`） |

この範囲では、新しい機能は v23 のような major に回され（#45270・#71619）、security の直しは報告した人と少数のメンテナーで進んでいます。issue を読むときは、関係する章の行と spec で「今の振る舞い」を自分の目で確かめる、までにします。

## 聞かれそうな質問

**Q. Angular の XSS を見つけたら、issue を立てればいいですか？**

リポジトリの SECURITY.md は Google の VRP に報告するように書いています（0 節）。公開の issue になっている area: security の多くは、VRP で受けたあと公開してよいとされたものです。

**Q. open for contributions のラベルが無い issue に PR を出してもいい？**

#68273 で JeanMeche は「手伝ってほしいときはこのラベルを付ける。今はまだ意見を集めている」と答えています。ラベルの無いものは、方針が決まっていないか、メンテナーが自分で進めるものと読むのが安全です。

**Q. PR が「閉じた」になっているのに、直っているのはなぜ？**

angular/angular では PR の commit をメンテナーが直接入れて PR を閉じることがあり、GitHub の上では Merged にならないことがあります。#69558 は「閉じた」ですが、issue #69550 を閉じたのは commit d06e3748b7b でした（1 節・6 節）。

**Q. このシリーズの範囲で、いちばん新しい「まだ開いている穴」は？**

2026-10-26 の #71618（SVG の &lt;use&gt;）で、PR #71619 が破壊的変更として開いています。表の行（第 17 回の 110 行目）に `use` が無いことが原因です。

## 読み終えて

- 9 つのラベルで、開いている issue は 58 件、2025-11 以降に閉じたものは 34 件。古い機能の要望と、2026 年の security の報告に分かれる。
- security の issue は VRP から回ってくることが多く、直すのは報告した人と少数のメンテナー。ブラウザでの再現が無い報告は閉じられる。
- 2026 年の修正の多くは、第 17・18 回の表と名前空間・大文字小文字の行を 1 つずつ塞いだもの。#70743・#71618 はその続き。
- このシリーズで見つけたもの（Meta の charset、古いコメント、MathML）は、PR にせず、issue を読む手がかりにする。

---

← 前: [Title・Meta・DomAdapter：&lt;head&gt; を触る小さなサービス](19-domr-title-meta.md)  
次: [common の全体像：ディレクティブ・pipe・i18n・画像・Location](../cmn/01-cmn-overview.md) →
