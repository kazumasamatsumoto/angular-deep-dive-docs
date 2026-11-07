// 書き出した Markdown を確かめる: リンク切れ、SVG の形、手元のパスが残っていないか。
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'htmlparser2';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.name === 'node_modules' || e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk('.');
let problems = 0;
const report = (msg) => { problems++; if (problems <= 20) console.log(msg); };

for (const f of files.filter((f) => f.endsWith('.md'))) {
  const text = fs.readFileSync(f, 'utf8').replace(/^(```+)[^\n]*\n[\s\S]*?^\1\s*$/gm, '').replace(/(`+)[^`\n]*?\1/g, '');
  for (const m of text.matchAll(/(?<!\\)\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    if (/^https?:/.test(href)) continue;
    if (!fs.existsSync(path.join(path.dirname(f), decodeURI(href.split('#')[0])))) report(`リンク切れ: ${f} → ${href}`);
  }
}
for (const f of files.filter((f) => f.endsWith('.svg'))) {
  const s = fs.readFileSync(f, 'utf8');
  let err = null;
  parseDocument(s, { xmlMode: true, onerror: (e) => (err = e) });
  if (err || /<(?!\/?[a-zA-Z!?])/.test(s.replace(/<style>[\s\S]*?<\/style>/g, ''))) report(`SVG の形: ${f}`);
}
const PRIVATE = /\/Users\/kazu|Users-kazu|_bazel_kazu|claude-501|kazumasa/;
for (const f of files.filter((f) => /\.(md|svg|mjs|json)$/.test(f) && !f.endsWith('check.mjs'))) {
  if (PRIVATE.test(fs.readFileSync(f, 'utf8'))) report(`手元のパス: ${f}`);
}
console.log(problems ? `問題 ${problems} 件` : '問題なし');
process.exitCode = problems ? 1 : 0;
