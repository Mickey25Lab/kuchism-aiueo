import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { HIRAGANA_DATA } from '../js/hiragana-data.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
test('all runtime references resolve under a GitHub Pages repository prefix', () => {
  const prefix = '/kuchism-aiueo-mvp/';
  const page = new URL(`https://example.github.io${prefix}`);
  const references = [];
  for (const match of read('index.html').matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!match[1].startsWith('data:')) references.push([page, match[1]]);
  }
  for (const match of read('css/style.css').matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) references.push([new URL('css/style.css', page), match[1]]);
  for (const file of ['js/app.js', 'js/hiragana-data.js']) {
    for (const match of read(file).matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) references.push([new URL(file, page), match[1]]);
  }
  for (const match of read('js/app.js').matchAll(/['"](assets\/[^'"]+)['"]/g)) references.push([page, match[1]]);
  for (const item of HIRAGANA_DATA) references.push([page, item.image]);
  const files = new Set();
  for (const [base, reference] of references) {
    assert.ok(!reference.startsWith('/') && !/^[a-z]+:/i.test(reference), reference);
    const resolved = new URL(reference, base);
    assert.equal(resolved.origin, page.origin);
    assert.ok(resolved.pathname.startsWith(prefix), reference);
    const relative = decodeURIComponent(resolved.pathname.slice(prefix.length));
    // GitHub Pages is case-sensitive, unlike the local Windows filesystem.
    let current = root;
    for (const part of relative.split('/')) {
      assert.ok(fs.readdirSync(current).includes(part), `exact-case path: ${relative}`);
      current = path.join(current, part);
    }
    assert.ok(fs.statSync(current).isFile() && fs.statSync(current).size > 0, relative);
    files.add(relative);
  }
  assert.equal(files.size, 55); // HTML itself makes 56 total runtime files.
  assert.ok(fs.existsSync(path.join(root, '.nojekyll')));
});

test('publication ignore rules exclude local browser profiles and temporary files', () => {
  const ignore = read('.gitignore').split(/\r?\n/);
  for (const rule of ['/.browser-check/', '/browser-check/', '/test-results/', '/tmp/', '*.log', '*.tmp', '/node_modules/', '/.env']) assert.ok(ignore.includes(rule), rule);
  assert.ok(!ignore.some(rule => /^(?:\/?assets|\/?css|\/?js)\//.test(rule)), 'runtime directories remain tracked');
});
