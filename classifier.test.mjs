import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { classify } from './classifier.js';

const H = 'Text 1\tText 2\tText 3\tCategory 1\tStatistics 1\tNotes\tExtra Info';
const st = (rc, cc) => `2,0,${rc},${cc},1,2,10,2026-01-01 00:00,2026-01-02 00:00,2026-01-01 00:00`;
const deck = (...rows) => ['*\tname\t테스트', '*\tcategory-1\t문법|한자', H, ...rows].join('\n');
const outRows = (res) => res.output.split('\n').filter(Boolean);

test('skips metadata and rewrites header without Statistics', () => {
  const res = classify(deck(`把握\tはあく\t파악\t문법\t${st(5, 2)}`));
  const lines = outRows(res);
  assert.equal(lines[0], 'Text 1\tText 2\tText 3\tCategory 1\tCategory 2\tNotes\tExtra Info');
  assert.equal(lines[1], '把握\tはあく\t파악\t3\t문법');
  assert.equal(lines.length, 2);
});

test('resolves columns by header name', () => {
  const text = 'Notes\tStatistics 1\tText 1\tCategory 1\nメモ\t' + st(5, 1) + '\t語\told';
  const res = classify(text);
  assert.equal(outRows(res)[0], 'Notes\tText 1\tCategory 1\tCategory 2');
  assert.equal(outRows(res)[1], 'メモ\t語\t2\told');
});

test('handles CRLF', () => {
  const res = classify(deck(`a\tb\tc\tx\t${st(5, 2)}`).replace(/\n/g, '\r\n'));
  assert.equal(res.output.includes('\r'), false);
  assert.equal(outRows(res)[1], 'a\tb\tc\t3\tx');
});

test('pads short rows', () => {
  const res = classify(deck(`a\tb\tc\tx\t${st(5, 2)}`, `d\te\tf\tx\t${st(5, 2)}`.split('\t').slice(0, 5).join('\t')));
  assert.equal(res.counts[3], 2);
  assert.equal(res.skipped, 0);
});

test('rc=0 becomes category 0', () => {
  const res = classify(deck(`a\tb\tc\tx\t${st(0, 0)}`));
  assert.equal(res.counts[0], 1);
  assert.equal(outRows(res)[1], 'a\tb\tc\t0\tx');
});

test('100% accuracy is excluded', () => {
  const res = classify(deck(`a\tb\tc\tx\t${st(7, 7)}`, `d\te\tf\tx\t${st(4, 4)}`));
  assert.equal(res.excluded, 2);
  assert.equal(outRows(res).length, 1);
  assert.equal(res.total, 2);
});

test('exact boundaries', () => {
  const cat = (rc, cc) => {
    const res = classify(deck(`a\tb\tc\tx\t${st(rc, cc)}`));
    return Number(outRows(res)[1].split('\t')[3]);
  };
  assert.equal(cat(5, 1), 2);
  assert.equal(cat(5, 2), 3);
  assert.equal(cat(5, 3), 4);
  assert.equal(cat(5, 4), 5);
  assert.equal(cat(3, 0), 1);
  assert.equal(cat(10, 1), 1);
});

test('keeps empty original category in the middle', () => {
  const res = classify(deck(`a\tb\tc\t\t${st(5, 2)}\tmemo`));
  assert.equal(outRows(res)[1], 'a\tb\tc\t3\t\tmemo');
});

test('trims trailing empties but keeps inner ones and pipes', () => {
  const res = classify(deck(`a\tb\tc\tx\t${st(5, 2)}\t\tx|y`, `d\te\tf\tx\t${st(5, 2)}\t\t`));
  const lines = outRows(res);
  assert.equal(lines[1], 'a\tb\tc\t3\tx\t\tx|y');
  assert.equal(lines[2], 'd\te\tf\t3\tx');
});

test('strips a leading UTF-8 BOM', () => {
  const res = classify('\uFEFF' + deck(`a\tb\tc\tx\t${st(5, 2)}`));
  assert.equal(outRows(res)[0].startsWith('Text 1'), true);
  assert.equal(res.counts[3], 1);
  const noMeta = classify('\uFEFF' + H + `\na\tb\tc\tx\t${st(5, 2)}`);
  assert.equal(noMeta.counts[3], 1);
});

test('correct count above review count is skipped', () => {
  const res = classify(deck(`a\tb\tc\tx\t${st(3, 5)}`));
  assert.equal(res.skipped, 1);
  assert.equal(res.excluded, 0);
  assert.equal(res.total, 1);
  assert.equal(outRows(res).length, 1);
});

test('malformed stats are skipped', () => {
  const res = classify(deck(`a\tb\tc\tx`, `a\tb\tc\tx\tfoo`, `a\tb\tc\tx\t1,2`, `a\tb\tc\tx\t${st(5, 2)}`));
  assert.equal(res.skipped, 3);
  assert.equal(res.total, 4);
  assert.equal(outRows(res).length, 2);
});

test('appends Category 1 when missing', () => {
  const res = classify('Text 1\tStatistics 1\tNotes\nw\t' + st(4, 1) + '\tn');
  assert.equal(outRows(res)[0], 'Text 1\tNotes\tCategory 1\tCategory 2');
  assert.equal(outRows(res)[1], 'w\tn\t2');
});

test('errors on missing header or Statistics column', () => {
  assert.throws(() => classify('*\tname\tx\n'), /헤더/);
  assert.throws(() => classify(''), /헤더/);
  assert.throws(() => classify('Text 1\tCategory 1\na\tb'), /Statistics/);
  assert.throws(() => classify('Text 1\tCategory 1\tCategory 2\tStatistics 1\na'), /Category 2/);
});

const samplePath = new URL('./.ignore/sample.txt', import.meta.url);
test('sample deck totals', { skip: !existsSync(samplePath) }, () => {
  const res = classify(readFileSync(samplePath, 'utf8'));
  assert.equal(res.total, 434);
  assert.equal(res.excluded, 281);
  assert.equal(res.skipped, 0);
  assert.deepEqual(res.counts, { 0: 33, 1: 0, 2: 4, 3: 18, 4: 50, 5: 48 });
  assert.equal(outRows(res).length, 154);
});
