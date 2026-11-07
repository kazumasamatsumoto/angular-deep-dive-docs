// angular-deep-dive の本番ビルド（プリレンダー済みの HTML）を GitHub で読める Markdown に変換する。
// 使い方: サイト側で npm run build を済ませてから、node tools/build.mjs [サイトのディレクトリ]
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument, DomUtils } from 'htmlparser2';
import render from 'dom-serializer';

const SITE_URL = 'https://angular-deep-dive-cyan.vercel.app';
const siteDir = path.resolve(process.argv[2] ?? '../angular-deep-dive');
const distDir = path.join(siteDir, 'dist/angular-deep-dive/browser');
const outDir = process.cwd();
const { series, chapters } = JSON.parse(fs.readFileSync(path.join(siteDir, 'src/app/data/chapters.json'), 'utf8'));

// ---- 出力先の場所 ----
const bySeries = new Map(series.map((s) => [s.key, []]));
for (const c of chapters) bySeries.get(c.series)?.push(c);
const fileOf = new Map(); // slug -> "key/NN-slug.md"
for (const [key, list] of bySeries) {
  list.forEach((c, i) => fileOf.set(c.slug, `${key}/${String(i + 1).padStart(2, '0')}-${c.slug}.md`));
}
const ordered = [...bySeries.values()].flat();

// ---- 文字の扱い ----
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/([*_`[\]])/g, '\\$1').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textOf = (n) => DomUtils.textContent(n);
const cls = (n) => (n.attribs?.class ?? '').split(/\s+/).filter(Boolean);
const hasCls = (n, c) => cls(n).includes(c);
const isTag = (n) => n.type === 'tag' || n.type === 'script' || n.type === 'style';
const kids = (n) => (n.children ?? []).filter((c) => c.type !== 'comment');

function inlineCode(s) {
  s = s.replace(/\s+/g, ' ');
  const run = Math.max(0, ...(s.match(/`+/g) ?? []).map((m) => m.length));
  const fence = '`'.repeat(run + 1);
  const pad = s.startsWith('`') || s.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${s}${pad}${fence}`;
}

// ---- リンク ----
let current = null; // 変換中の章の slug
function linkTarget(href, fragment) {
  const from = path.dirname(fileOf.get(current));
  const rel = (to) => path.relative(from, to).split(path.sep).join('/');
  let m;
  if ((m = href.match(/^\/chapter\/([\w-]+)/)) && fileOf.has(m[1])) return rel(fileOf.get(m[1])) + (fragment ? `#${fragment}` : '');
  if ((m = href.match(/^\/series\/([\w-]+)/)) && bySeries.has(m[1])) return rel(`${m[1]}/README.md`);
  if (href === '/chapters' || href === '/') return rel('README.md');
  if (href.startsWith('/')) return SITE_URL + href + (fragment ? `#${fragment}` : '');
  return href;
}

// ---- インライン ----
const DROP = new Set(['button', 'input', 'select', 'option', 'textarea', 'label', 'output', 'script', 'style', 'noscript']);
function inline(n, ctx = {}) {
  if (n.type === 'text') {
    const t = n.data.replace(/\s+/g, ' ');
    return ctx.table ? esc(t).replace(/\|/g, '\\|') : esc(t);
  }
  if (!isTag(n) || DROP.has(n.name)) return '';
  const inner = () => kids(n).map((c) => inline(c, ctx)).join('');
  switch (n.name) {
    case 'code': {
      const s = inlineCode(textOf(n));
      return ctx.table ? s.replace(/\|/g, '\\|') : s;
    }
    case 'strong': case 'b': { const s = inner().trim(); return s ? `**${s}**` : ''; }
    case 'em': case 'i': { const s = inner().trim(); return s ? `*${s}*` : ''; }
    case 'br': return ctx.table ? '<br>' : '  \n';
    case 'a': {
      const href = n.attribs.href;
      const s = inner().trim();
      if (!href) return s;
      return `[${s}](${linkTarget(href.replace(/#.*/, ''), href.includes('#') ? href.split('#')[1] : '')})`;
    }
    case 'svg': return '';
    default: return inner();
  }
}

// HTML の改行から来た空白のうち、日本語の句読点のあとに残るものを取る。
const tidy = (s) => s.replace(/([。、！？）」』])[ \t]+(?=\S)/g, '$1').trim();

// ---- ブロック ----
const BLOCK = new Set(['p', 'div', 'ol', 'ul', 'li', 'dl', 'dt', 'dd', 'table', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'figure', 'details', 'summary', 'section', 'blockquote', 'hr', 'app-code', 'app-callout', 'app-figure', 'svg']);
const isBlock = (n) => isTag(n) && (BLOCK.has(n.name) || n.name.startsWith('app-'));

let figNo = 0;
let demoUrl = '';

function blocks(nodes) {
  const out = [];
  let buf = [];
  const flush = () => {
    const s = tidy(buf.map((c) => inline(c)).join(''));
    if (s) out.push(s);
    buf = [];
  };
  for (const c of nodes) {
    if (c.type === 'comment') continue;
    if (isBlock(c)) { flush(); const b = block(c); if (b) out.push(b); }
    else buf.push(c);
  }
  flush();
  return out.join('\n\n');
}

const indent = (s, pad) => s.split('\n').map((l, i) => (i === 0 || !l ? l : pad + l)).join('\n');
const quote = (s) => s.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');

function langOf(file) {
  const ext = (file ?? '').split('.').pop();
  return { ts: 'ts', mts: 'ts', js: 'js', mjs: 'js', cjs: 'js', html: 'html', json: 'json', scss: 'scss', css: 'css',
    md: 'md', bzl: 'python', bazel: 'python', py: 'python', sh: 'sh', yaml: 'yaml', yml: 'yaml' }[ext] ?? '';
}

function codeBlock(n) {
  const file = DomUtils.findOne((e) => hasCls(e, 'path'), kids(n));
  const range = DomUtils.findOne((e) => hasCls(e, 'lines'), kids(n));
  const lines = DomUtils.findAll((e) => e.name === 'span' && hasCls(e, 'line'), kids(n));
  const caption = DomUtils.findOne((e) => hasCls(e, 'caption'), kids(n));
  const numbered = lines.some((l) => DomUtils.findOne((e) => hasCls(e, 'ln'), kids(l)));
  const rows = lines.map((l) => {
    const ln = DomUtils.findOne((e) => hasCls(e, 'ln'), kids(l));
    const src = DomUtils.findOne((e) => hasCls(e, 'src'), kids(l));
    return { no: ln ? textOf(ln) : '', mark: hasCls(l, 'is-mark'), text: src ? textOf(src) : '' };
  });
  const width = Math.max(0, ...rows.map((r) => r.no.length));
  const body = rows.map((r) => (numbered ? `${r.no.padStart(width)} ${r.mark ? '▶' : '│'} ${r.text}` : r.text)).join('\n');
  const marks = rows.filter((r) => r.mark && r.no).map((r) => +r.no);
  const fence = body.includes('```') ? '````' : '```';
  const head = [];
  if (file) head.push(`📄 ${inlineCode(textOf(file))}${range ? ` ${textOf(range)}` : ''}`);
  if (marks.length) head.push(`（▶ の行: ${ranges(marks)}）`);
  const parts = [];
  if (head.length) parts.push(head.join(' ') + '\n');
  parts.push(`${fence}${langOf(file && textOf(file))}\n${body}\n${fence}`);
  if (caption) parts.push(`*${inline(caption).trim()}*`);
  return parts.join('\n');
}

function ranges(nums) {
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(i === j ? `${nums[i]}` : `${nums[i]}–${nums[j]}`);
    i = j;
  }
  return out.join(', ');
}

function svgFile(svg, caption) {
  figNo++;
  const name = `${current}-${figNo}.svg`;
  const strip = (s) => s.replace(/ _ng(content|host)-[\w-]+(="[^"]*")?/g, '').replace(/ ngh="\d+"/g, '');
  let xml = strip(render(svg, { xmlMode: true, encodeEntities: 'utf8' }));
  if (!/xmlns=/.test(xml.slice(0, 200))) xml = xml.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  // サイトは currentColor でテーマに合わせて描いている。画像の中の prefers-color-scheme は GitHub のテーマではなく
  // OS の設定に従うので、白い下地と濃い文字に固定する。
  const style = '<style>svg{color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif}</style>';
  const vb = (svg.attribs.viewBox ?? '').split(/[\s,]+/).map(Number);
  const bg = vb.length === 4 ? `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>` : '';
  xml = xml.replace(/^(<svg[^>]*>)/, `$1${style}${bg}`);
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'assets', name), xml + '\n');
  const rel = path.relative(path.dirname(fileOf.get(current)), `assets/${name}`);
  return `![${(caption || '図').replace(/[[\]]/g, '')}](${rel})`;
}

function table(n) {
  const rows = DomUtils.findAll((e) => e.name === 'tr', kids(n));
  if (!rows.length) return '';
  const cell = (c) => {
    const parts = kids(c).some(isBlock)
      ? kids(c).map((k) => (isBlock(k) ? kids(k).map((x) => inline(x, { table: true })).join('') : inline(k, { table: true })))
      : [kids(c).map((k) => inline(k, { table: true })).join('')];
    return parts.map(tidy).filter(Boolean).join('<br>') || ' ';
  };
  const grid = rows.map((r) => kids(r).filter((c) => c.name === 'td' || c.name === 'th').map(cell));
  const cols = Math.max(...grid.map((r) => r.length));
  const line = (r) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? ' ').join(' | ')} |`;
  const hasHead = kids(rows[0]).some((c) => c.name === 'th');
  const head = hasHead ? grid[0] : Array(cols).fill(' ');
  const body = hasHead ? grid.slice(1) : grid;
  return [line(head), `|${' --- |'.repeat(cols)}`, ...body.map(line)].join('\n');
}

function demo(n) {
  const title = DomUtils.findOne((e) => hasCls(e, 'demo-title'), [n]);
  const notes = DomUtils.findAll((e) => hasCls(e, 'demo-note'), [n]);
  const head = `**🧪 ${title ? inline(title).trim() : 'デモ'}**`;
  const body = notes.map((p) => tidy(inline(p))).filter(Boolean);
  return quote([head, ...body, `▶ [このデモはサイトで動かせます](${demoUrl})`].join('\n\n'));
}

function block(n) {
  if (!isTag(n) || DROP.has(n.name)) return '';
  const c = kids(n);
  switch (n.name) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const lv = Math.min(6, +n.name[1] + 0);
      return `${'#'.repeat(lv)} ${c.map((x) => inline(x)).join('').trim()}`;
    }
    case 'p': return tidy(c.map((x) => inline(x)).join(''));
    case 'hr': return '---';
    case 'pre': {
      const t = textOf(n).replace(/\n$/, '');
      const fence = t.includes('```') ? '````' : '```';
      return `${fence}\n${t}\n${fence}`;
    }
    case 'ol': case 'ul': {
      if (hasCls(n, 'trace')) return trace(n);
      const items = c.filter((x) => x.name === 'li');
      return items.map((li, i) => {
        const mark = n.name === 'ol' ? `${i + 1}. ` : '- ';
        let s = blocks(kids(li)) || ' ';
        if (hasCls(li, 'is-here')) s = `**${s.replace(/^\*\*|\*\*$/g, '')}**（この章）`;
        return mark + indent(s, ' '.repeat(mark.length));
      }).join('\n');
    }
    case 'dl': {
      const out = [];
      for (const x of c) {
        if (x.name === 'dt') out.push(`**Q. ${blocks(kids(x)).replace(/\n+/g, ' ')}**`);
        else if (x.name === 'dd') out.push(blocks(kids(x)));
      }
      return out.join('\n\n');
    }
    case 'table': return table(n);
    case 'details': {
      const sum = c.find((x) => x.name === 'summary');
      const rest = blocks(c.filter((x) => x !== sum));
      return `<details>\n<summary>${sum ? esc(textOf(sum).replace(/\s+/g, ' ').trim()) : '詳しく'}</summary>\n\n${rest}\n\n</details>`;
    }
    case 'blockquote': return quote(blocks(c));
    case 'app-code': return codeBlock(n);
    case 'app-callout': {
      const label = DomUtils.findOne((e) => hasCls(e, 'label'), c);
      const body = DomUtils.findOne((e) => hasCls(e, 'body'), c);
      const kind = { tip: 'TIP', warn: 'WARNING', deep: 'NOTE', note: 'NOTE' }[n.attribs.tone ?? n.attribs['data-tone']] ?? 'NOTE';
      const text = [label ? `**${inline(label).trim()}**` : '', body ? blocks(kids(body)) : blocks(c)].filter(Boolean).join('\n\n');
      return `> [!${kind}]\n${quote(text)}`;
    }
    case 'app-figure': {
      const cap = n.attribs.caption ?? '';
      const svgs = DomUtils.findAll((e) => e.name === 'svg', c).filter((s) => !DomUtils.findOne((p) => p.name === 'svg', [s.parent]) || s.parent?.name !== 'svg');
      const top = svgs.filter((s) => !DomUtils.getParent(s) || !hasSvgAncestor(s));
      const imgs = top.map((s) => svgFile(s, cap));
      const other = DomUtils.findAll((e) => e.name === 'figcaption', c).map((f) => inline(f).trim());
      return [...imgs, cap ? `*${esc(cap)}*` : '', ...other.filter((o) => o && o !== esc(cap)).map((o) => `*${o}*`)].filter(Boolean).join('\n\n');
    }
    case 'svg': return svgFile(n, '');
    case 'div': case 'section': case 'figure':
      if (hasCls(n, 'demo')) return demo(n);
      return blocks(c);
    default:
      if (n.name.startsWith('app-')) return `> ▶ [この場所の動く部品は、サイトで見られます](${demoUrl})`;
      return blocks(c);
  }
}
// 呼び出しの連なり（ol.trace）。li の --d が深さで、code・span（場所）・em（説明）が並ぶ。
function trace(n) {
  let prev = -1;
  return kids(n).filter((x) => x.name === 'li').map((li) => {
    const d = Math.min(+(li.attribs.style?.match(/--d:\s*(\d+)/)?.[1] ?? 0), prev + 1);
    prev = d;
    const parts = [];
    let head = '';
    for (const x of kids(li)) {
      if (x.name === 'span') parts.push(tidy(inline(x)));
      else if (x.name === 'em') { const t = tidy(kids(x).map((y) => inline(y)).join('')); if (t) parts.push(`*${t}*`); }
      else head += inline(x);
    }
    const you = hasCls(li, 'is-you') ? '👤 ' : '';
    return `${'  '.repeat(d)}- ${you}${[tidy(head), ...parts].filter(Boolean).join(' — ')}`;
  }).join('\n');
}
const hasSvgAncestor = (s) => { for (let p = s.parent; p; p = p.parent) if (p.name === 'svg') return true; return false; };

// ---- 章 ----
function readDist(route) {
  const f = path.join(distDir, route, 'index.html');
  if (!fs.existsSync(f)) throw new Error(`プリレンダーの出力がありません: ${f}`);
  // SVG の viewBox などは大文字小文字を区別するので、そのまま残す。
  return parseDocument(fs.readFileSync(f, 'utf8'), { lowerCaseAttributeNames: false, lowerCaseTags: false });
}

const levelLabel = {};
fs.rmSync(path.join(outDir, 'assets'), { recursive: true, force: true });
for (const s of series) fs.rmSync(path.join(outDir, s.key), { recursive: true, force: true });

ordered.forEach((ch, idx) => {
  current = ch.slug;
  figNo = 0;
  demoUrl = `${SITE_URL}/chapter/${ch.slug}`;
  const doc = readDist(`chapter/${ch.slug}`);
  const article = DomUtils.findOne((e) => e.name === 'article' && hasCls(e, 'chapter'), doc.children);
  const body = DomUtils.findOne((e) => e.name === 'div' && hasCls(e, 'body'), kids(article));
  const meta = DomUtils.findOne((e) => hasCls(e, 'meta'), kids(article));
  const metaText = meta ? DomUtils.findAll((e) => e.name === 'span', kids(meta)).map((e) => textOf(e).trim()).filter(Boolean).join(' · ') : '';
  const list = bySeries.get(ch.series);
  const s = series.find((x) => x.key === ch.series);
  const i = list.indexOf(ch);
  const prev = ordered[idx - 1];
  const next = ordered[idx + 1];
  const rel = (slug) => path.relative(path.dirname(fileOf.get(ch.slug)), fileOf.get(slug));
  const md = [
    `[目次](../README.md) › [${esc(s.title)}](README.md) › 第 ${i + 1} 回 / 全 ${list.length} 回`,
    `# ${esc(ch.title)}`,
    `> ${esc(ch.summary)}`,
    `${metaText} · [サイトで読む（デモが動きます）](${demoUrl})`,
    '---',
    blocks(kids(body)),
    '---',
    [prev ? `← 前: [${esc(prev.title)}](${rel(prev.slug)})` : '', next ? `次: [${esc(next.title)}](${rel(next.slug)}) →` : ''].filter(Boolean).join('  \n'),
  ].join('\n\n');
  fs.mkdirSync(path.join(outDir, ch.series), { recursive: true });
  fs.writeFileSync(path.join(outDir, fileOf.get(ch.slug)), md.replace(/\n{3,}/g, '\n\n') + '\n');
});

// ---- シリーズの目次 ----
for (const s of series) {
  const list = bySeries.get(s.key);
  const md = [
    `[目次](../README.md)`,
    `# ${esc(s.title)}`,
    `> ${esc(s.subtitle)}`,
    esc(s.intro),
    `全 ${list.length} 章 · [サイトで読む](${SITE_URL}/series/${s.key})`,
    list.map((c, i) => `${i + 1}. [${esc(c.title)}](${path.basename(fileOf.get(c.slug))})  \n   ${esc(c.summary)}`).join('\n'),
  ].join('\n\n');
  fs.writeFileSync(path.join(outDir, s.key, 'README.md'), md + '\n');
}

// ---- 全体の目次 ----
const total = chapters.length;
const top = [
  '# Angular Deep Dive',
  `Angular の内側（angular/angular と angular/angular-cli のソース）を、1 ステップずつ読む日本語の連載です。全 ${series.length} シリーズ・${total} 章。`,
  `各章の Markdown は、[サイト](${SITE_URL}) の本番ビルドから \`npm run build\` で作っています。コードの引用は行番号つきで、▶ の付いた行が本文で読む行です。デモはボタンで動くので、各章の「サイトで読む」から開いてください。`,
  '## シリーズ',
  series.map((s, i) => `${i + 1}. [${esc(s.title)}](${s.key}/README.md)（${bySeries.get(s.key).length} 章）— ${esc(s.subtitle)}`).join('\n'),
  '## 作り直し方',
  [
    '1. サイト（angular-deep-dive）で `npm run build` を走らせ、プリレンダーの出力を作る。',
    '2. このリポジトリで `npm install`（初回だけ）と `npm run build` を走らせる。サイトの場所が `../angular-deep-dive` でなければ `node tools/build.mjs <サイトの場所>`。',
    '3. `npm run check` で、リンク切れ・SVG の形・手元のパスが残っていないかを確かめる。',
  ].join('\n'),
].join('\n\n');
fs.writeFileSync(path.join(outDir, 'README.md'), top + '\n');
console.log(`${ordered.length} 章、${series.length} シリーズを書き出しました。`);
