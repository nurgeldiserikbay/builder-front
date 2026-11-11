// Lists texts wrapped in t()/tl() that have no English translation yet. Exit code 1 if any are missing,
// so CI keeps the English interface complete.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/en.json'), 'utf8'));
const missing = new Set();
const pattern = /\b(?:t\(|tl\(locale,\s*)("(?:[^"\\]|\\.)*")/g;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|mts)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const match of text.matchAll(pattern)) {
        const key = JSON.parse(match[1]);
        if (/[А-Яа-яЁё]/.test(key) && !(key in en)) missing.add(`${path.relative(root, full)}: ${key}`);
      }
    }
  }
}
walk(path.join(root, 'src'));
if (missing.size) { console.error(`Missing English for ${missing.size} texts:\n${[...missing].join('\n')}`); process.exit(1); }
console.log(`English dictionary covers all texts (${Object.keys(en).length} entries).`);
