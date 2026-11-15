// usage: node extract.mjs <out.tsv>
// Lists English UI strings in src/ that have no line in src/lib/i18n-fr.ts.
import fs from 'node:fs';
import path from 'node:path';

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && !/i18n/.test(e.name)) files.push(p);
  }
})('src');

const fr =
  fs.readFileSync('src/lib/i18n-fr.ts', 'utf8') + fs.readFileSync('src/lib/i18n-fr-more.ts', 'utf8');
const have = new Set(
  [...fr.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|([A-Za-z]\w*)):/gm)].map((m) =>
    (m[1] ?? m[2]).replace(/\\'/g, "'"),
  ),
);

const found = new Map();
const unq = (s) => s.replace(/\\'/g, "'");
function add(s, f, kind) {
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length < 2 || !/[A-Za-z]{2}/.test(s)) return;
  if (/^[a-z_\-/.:#0-9[\]]+$/.test(s)) return; // identifiers, routes, keys
  if (!found.has(s)) found.set(s, { f, kind });
}

const PROPS = 'label|title|message|hint|placeholder|detail|actionLabel|summary|heading|text';
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const staff = /[\\/]staff[\\/]|[\\/]review[\\/]|components[\\/]staff/.test(f);
  const k = (kind) => (staff ? 'staff' : kind);
  if (f.endsWith('.tsx')) {
    for (const m of src.matchAll(/>([^<>{}]+)</g)) {
      if (/[=;()]|=>|&&|\|\|/.test(m[1])) continue; // code, not text
      add(m[1], f, k('jsx'));
    }
  }
  for (const m of src.matchAll(new RegExp(`\\b(?:${PROPS})(?:=|: )"([^"]+)"`, 'g'))) add(m[1], f, k('prop'));
  for (const m of src.matchAll(new RegExp(`\\b(?:${PROPS})(?:=\\{|: |=)'((?:[^'\\\\]|\\\\.)+)'`, 'g')))
    add(unq(m[1]), f, k('prop'));
  for (const m of src.matchAll(/Alert\.alert\(\s*'((?:[^'\\]|\\.)+)'(?:,\s*'((?:[^'\\]|\\.)+)')?/g)) {
    add(unq(m[1]), f, k('alert'));
    if (m[2]) add(unq(m[2]), f, k('alert'));
  }
}

const missing = [...found].filter(([s]) => !have.has(s));
const by = {};
for (const [, v] of missing) by[v.kind] = (by[v.kind] || 0) + 1;
console.log('found', found.size, 'missing', missing.length, JSON.stringify(by));
fs.writeFileSync(
  process.argv[2],
  missing.map(([s, v]) => `${v.kind}\t${v.f.replace(/\\/g, '/').replace('src/', '')}\t${s}`).join('\n'),
);

// Second pass: label tables and the help text, where strings are values in
// plain objects and arrays rather than props.
if (process.argv[3]) {
  const labelFiles = files.filter((f) =>
    /features[\\/].*[\\/](types|content|mode|queries)\.ts$|lib[\\/](amenities|push)\.ts$|features[\\/]listings[\\/](ask-listing|terms-fields)\.tsx?$/.test(f),
  );
  const extra = new Map();
  for (const f of labelFiles) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.){3,})'/g)) {
      const s = m[1].replace(/\\'/g, "'").replace(/\s+/g, ' ').trim();
      if (!/^[A-Z]/.test(s)) continue;            // UI text starts with a capital
      if (/^[A-Z_]+$/.test(s)) continue;          // constants
      if (/[@/{}$]|\.(ts|tsx|sql)\b/.test(s)) continue; // paths, templates
      if (have.has(s) || found.has(s) || extra.has(s)) continue;
      extra.set(s, f);
    }
  }
  console.log('label/help strings missing', extra.size);
  fs.writeFileSync(process.argv[3], [...extra].map(([s, f]) => `${f.replace(/\\/g, '/').replace('src/', '')}\t${s}`).join('\n'));
}
