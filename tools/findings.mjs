// 各シリーズの最終回などにある「このシリーズで見つけたもの」の節を集めて、FINDINGS.md を作る。
// build.mjs が書き出した Markdown から作るので、build のあとに走らせる。
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE_URL = 'https://angular-deep-dive-cyan.vercel.app';

// 見出しが「見つけたもの」を表すもの。ほかの意味の「見つける」（解決の手順など）は除く。
const isFinding = (h) => /見つけたもの|見つかったもの|不具合らしき|食い違い（/.test(h);

const top = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const series = [...top.matchAll(/^\d+\. \[(.+?)\]\(([\w-]+)\/README\.md\)/gm)].map((m) => ({ title: m[1], key: m[2] }));

// 章の中の相対リンクを、リポジトリの直下から見たリンクに直す。
const relink = (md, dir) =>
  md.replace(/\]\((?!https?:|#)([^)\s]+)\)/g, (_, href) => `](${path.posix.normalize(path.posix.join(dir, href))})`);

function sections(file, dir) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{2,3}) (.*)$/);
    if (!m || !isFinding(m[2])) continue;
    const level = m[1].length;
    let j = i + 1;
    while (j < lines.length && !(/^#{2,3} /.test(lines[j]) && lines[j].match(/^#+/)[0].length <= level)) j++;
    // 同じ見出しが続けて 2 度ある章（第 1〜5 回の分と最終回の分）は、中身ごと別に扱う。
    out.push({ heading: m[2], body: relink(lines.slice(i + 1, j).join('\n').trim(), dir) });
    i = j - 1;
  }
  return out;
}

const parts = [];
let count = 0;
for (const s of series) {
  if (s.key === 'fix') continue;
  const dir = path.join(root, s.key);
  const files = fs.readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f)).sort();
  const found = [];
  for (const f of files) {
    const title = (fs.readFileSync(path.join(dir, f), 'utf8').match(/^# (.*)$/m) || [])[1] || f;
    for (const sec of sections(path.join(dir, f), s.key)) found.push({ f, title, ...sec });
  }
  if (!found.length) continue;
  count++;
  parts.push(`## ${s.title}`);
  for (const x of found) {
    parts.push(`### [${x.title}](${s.key}/${x.f}) — ${x.heading}`);
    parts.push(x.body);
  }
}

// 「見つけた不具合を手元で直す」シリーズの一覧の表は、最初にまとめて置く。
const fixFile = path.join(root, 'fix', '01-fix-overview.md');
let fixTable = '';
if (fs.existsSync(fixFile)) {
  const t = fs.readFileSync(fixFile, 'utf8');
  const m = t.match(/^## 1\. 直す 8 つの不具合\n([\s\S]*?)\n## /m);
  if (m) fixTable = relink(m[1].trim(), 'fix');
}

const md = [
  '[目次](README.md)',
  '# 見つけた不具合と、手元で作った直し',
  'これまでの連載で、本家（angular/angular・angular/angular-cli・angular/components）のソースを読んでいる途中で見つけた不具合や食い違いを、シリーズごとに 1 か所に集めたものです。どれも本家には issue も PR も出していません。手元で直したものは、本家の木とは別の複製（`../angular-fix` など）の枝にだけあります。',
  `この一覧は、各章の「このシリーズで見つけたもの」などの節を \`npm run build\` のたびに集め直して作っています（${count} シリーズ）。行番号や確かめ方は各章のとおりで、デモは各章の「サイトで読む」（${SITE_URL}）から動かせます。`,
  '## 手元で直したもの（見つけた不具合を手元で直す）',
  fixTable || '（シリーズがまだありません）',
  ...parts,
].join('\n\n');

fs.writeFileSync(path.join(root, 'FINDINGS.md'), md.replace(/\n{3,}/g, '\n\n') + '\n');
console.log(`FINDINGS.md を書き出しました（${count} シリーズ）。`);
