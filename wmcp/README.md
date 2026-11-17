[目次](../README.md)

# WebMCP の内側：Angular のアプリが AI のエージェントにツールを渡す

> declareExperimentalWebMcpTool・provideExperimentalWebMcpTools とアプリの寿命・Signal Forms のフォームをツールにする・spec と issue

WebMCP は、ページが document.modelContext を通して、ブラウザの中の AI のエージェントに「呼べる道具（ツール）」を渡すための、提案中の Web の仕組みです。Angular は 2026 年 4 月から core に declareExperimentalWebMcpTool と provideExperimentalWebMcpTools を、22.2 で Signal Forms にフォームをそのままツールにする provideExperimentalWebMcpForms を入れました。このシリーズでは、ツールの登録が注入器の寿命とどう結び付き、いつ取り消されるか、SSR や DOM clobbering にどう備えたか、フォームのスキーマから入力の JSON Schema をどう作るかを、約 450 行の本体と 2026 年の修正の順に読みます。

全 4 章 · [サイトで読む](https://angular-deep-dive-cyan.vercel.app/series/wmcp)

1. [declareExperimentalWebMcpTool：1 つのツールを登録して取り消すまで](01-wmcp-declare.md)  
   types.ts の ToolDescriptor と vendor した @mcp-b/webmcp-types（5387e13b10d、API Extractor のため）の JSON Schema からの型推論、declare\_tool.ts が document.modelContext（683172b39a6 で navigator から移った）を探し、registerTool が関数かを確かめ（8cf7731468f）、execute を注入コンテキストで包み（77ec83782f2）、注入器の destroy とブラウザの取り消しを AbortSignal.any で合わせる（e041f9483e5）までを 1 行ずつ。非同期になった登録（f908140d718）と、登録の途中で壊れたときの AbortError を飲む枝（98960556a6d、spec なし）、素通しの annotations（91a2bf84250）、angular-main の公式 webmcp-types（38afab7a244）。ページの上で本物の 22.2.6 の関数を、作り物の modelContext につないで動かす。
2. [provideExperimentalWebMcpTools とアプリの寿命：いつ登録され、いつ消えるか](02-wmcp-provide.md)  
   provide\_tools.ts が環境の初期化でツールを順に declare する行（3b0ae5fef03）と、注入器を作る関数が戻る前に registerTool まで進む順番、SSR で無効にする修正（e50d47a4931）、説明を必須にした変更（c121407c0da）、注入器の destroy での取り消しとルートの自動の後片付け、ブラウザの側で解決した重複したツール名の issue（#68899）と、いまは Promise を捨てるので重複が処理されない reject になること、ツールごとの型推論を提案して閉じた PR（#70159・#71658、#70125 は開いたまま）。
3. [Signal Forms のフォームをツールにする：スキーマから JSON Schema へ](03-wmcp-forms.md)  
   forms/signals の webmcp/registration.ts と tokens.ts、provideExperimentalWebMcpForms（1963a0eb181）がトークンを置き、form() がそれを引いて呼ぶ行、追跡の無い effect でモデルを読むのを 1 tick 遅らせる修正（9604ecfd8b5、#69262）、フィールドの木から入力の JSON Schema を作る再帰と additionalProperties: false（df77e42327c）、readOnlyHint と untrustedContentHint（6e299da8cfc）、execute がモデルを丸ごと置き換えて送信し、検証のエラーをエージェントに返す形。開いている #71271 と閉じた #70819・#70820 の指摘を今のコードで確かめ、22.2.6 を Node で動かした記録を再生する。
4. [spec と issue を読む：WebMCP を固めているテスト](04-wmcp-tests-issues.md)  
   core の test/webmcp の 2 つと forms の webmcp.spec.ts の 22 本が、このシリーズの各章の約束をどこで固めているか、作り物の modelContext の作り方（polyfill から #71959 のローカルの mock へ）、手元での走らせ方と結果、WebMCP の issue と PR の表（公式の webmcp-types・document への移動・重複したツール名など）と閉じた PR の傾向、angular-main の続き（38afab7a244 など）。
