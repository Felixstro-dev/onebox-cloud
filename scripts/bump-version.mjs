#!/usr/bin/env node
/**
 * Setzt die Onebox-Version an allen Stellen, die sie duplizieren.
 *
 *   npm run version:bump -- 0.2.0
 *
 * Das Skript ändert nur Dateien im Arbeitsverzeichnis. Committen, taggen und
 * das GitHub-Release müssen danach bewusst erfolgen (siehe AGENTS.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const next = String(process.argv[2] || '').trim().replace(/^v/, '');

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(next)) {
  console.error('Aufruf: npm run version:bump -- <major.minor.patch>');
  console.error('Beispiel: npm run version:bump -- 0.2.0');
  process.exit(1);
}

const previous = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (previous === next) {
  console.log(`Version ist bereits ${next}. Nichts zu tun.`);
  process.exit(0);
}

const files = [
  {
    file: 'package.json',
    replace: (text) => text.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`),
  },
  {
    file: 'package-lock.json',
    replace: (text) => text
      .replace(/^(\{\n\s*"name": "onebox",\n\s*"version": ")[^"]+(")/m, `$1${next}$2`)
      .replace(/^(\s*"": \{\n\s*"name": "onebox",\n\s*"version": ")[^"]+(")/m, `$1${next}$2`),
  },
  {
    file: 'server/config.js',
    replace: (text) => text.replace(/(version:\s*process\.env\.ONEB_VERSION\s*\|\|\s*')[^']+(')/, `$1${next}$2`),
  },
  {
    file: 'Dockerfile',
    replace: (text) => text.replace(/^(ARG ONEB_VERSION=).+$/m, `$1${next}`),
  },
  {
    file: '.env.example',
    replace: (text) => text.replace(/^(ONEB_VERSION=).+$/m, `$1${next}`),
  },
  {
    file: 'README.md',
    replace: (text) => text
      .replace(/(bei Branch-Builds `)\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`/, `$1${next}\``)
      .replace(/(\| `ONEB_VERSION` \| `)\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`/, `$1${next}\``),
  },
];

let failed = false;
for (const entry of files) {
  const full = path.join(root, entry.file);
  const before = fs.readFileSync(full, 'utf8');
  const after = entry.replace(before);
  if (before === after) {
    console.error(`! ${entry.file}: Version ${next} konnte nicht gesetzt werden.`);
    failed = true;
    continue;
  }
  fs.writeFileSync(full, after);
  console.log(`✓ ${entry.file}`);
}

if (failed) {
  console.error('Bitte die markierten Dateien prüfen; es wurde nichts zurückgerollt.');
  process.exit(1);
}

console.log(`\nVersion ${previous} → ${next}\n`);
console.log('Nächste Schritte:');
console.log(`  1. git add package.json package-lock.json server/config.js Dockerfile .env.example README.md`);
console.log(`  2. git commit -m "chore(release): v${next}"`);
console.log(`  3. git tag -a v${next} -m "Onebox v${next}"`);
console.log(`  4. git push origin master && git push origin v${next}`);
console.log(`  5. gh release create v${next} --generate-notes`);
