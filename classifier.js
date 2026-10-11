// Pure classifier for tab-separated flashcard deck exports. No DOM access.

const STATS_RE = /^Statistics \d+$/;
const NON_NEGATIVE_INT = /^\d+$/;

export function classify(text, { graduateStreak = 4 } = {}) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);

  let i = 0;
  while (i < lines.length && (lines[i].startsWith('*') || lines[i].trim() === '')) i++;
  if (i >= lines.length) {
    throw new Error('헤더 줄을 찾을 수 없습니다. 내보낸 파일 전체를 붙여넣었는지 확인해 주세요.');
  }

  const header = lines[i].split('\t').map((h) => h.trim());
  const statsIdx = header.findIndex((h) => STATS_RE.test(h));
  if (statsIdx === -1) {
    throw new Error('"Statistics 1" 열을 찾을 수 없습니다. 헤더 줄을 확인해 주세요.');
  }
  const statsCols = new Set(header.map((h, idx) => (STATS_RE.test(h) ? idx : -1)).filter((idx) => idx >= 0));

  if (header.includes('Category 2')) {
    throw new Error('이미 "Category 2" 열이 있어 덮어쓸 수 없습니다. 해당 열의 이름을 바꾸거나 제거해 주세요.');
  }

  let catIdx = header.indexOf('Category 1');
  const baseHeader = header.slice();
  if (catIdx === -1) {
    catIdx = baseHeader.length;
    baseHeader.push('Category 1');
  }
  const width = baseHeader.length;
  const keep = [];
  for (let c = 0; c < width; c++) if (!statsCols.has(c)) keep.push(c);
  // Position of Category 1 within the kept columns; Category 2 goes right after it.
  const catOut = keep.indexOf(catIdx);
  const outHeader = keep.map((c) => baseHeader[c]);
  outHeader.splice(catOut + 1, 0, 'Category 2');

  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let excluded = 0;
  let graduated = 0;
  let skipped = 0;
  let total = 0;
  const kept = [];

  for (let r = i + 1; r < lines.length; r++) {
    const line = lines[r];
    if (line.trim() === '') continue;
    total++;

    const fields = line.split('\t');
    while (fields.length < width) fields.push('');

    const stats = fields[statsIdx].split(',').map((s) => s.trim());
    if (stats.length < 5 || !NON_NEGATIVE_INT.test(stats[2]) || !NON_NEGATIVE_INT.test(stats[3]) || !NON_NEGATIVE_INT.test(stats[4])) {
      skipped++;
      continue;
    }
    const rc = Number(stats[2]);
    const cc = Number(stats[3]);
    const streak = Number(stats[4]);

    let category;
    if (rc === 0) {
      category = 0;
    } else if (cc > rc) {
      skipped++;
      continue;
    } else if (cc === rc) {
      excluded++;
      continue;
    } else if (graduateStreak > 0 && streak >= graduateStreak) {
      graduated++;
      continue;
    } else {
      category = Math.floor((5 * cc) / rc) + 1;
    }

    const original = fields[catIdx];
    fields[catIdx] = String(category);
    counts[category]++;

    const out = keep.map((c) => fields[c]);
    out.splice(catOut + 1, 0, original);
    // Extra fields beyond the header pass through unchanged.
    for (let c = width; c < fields.length; c++) out.push(fields[c]);
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    kept.push({ rc, cc, line: out.join('\t') });
  }

  // Accuracy ascending (exact integer compare), unreviewed (rc == 0) last.
  // Array.prototype.sort is stable, so ties keep input order.
  kept.sort((a, b) => {
    if (a.rc === 0 || b.rc === 0) return (a.rc === 0) - (b.rc === 0);
    return a.cc * b.rc - b.cc * a.rc;
  });
  const outLines = [outHeader.join('\t'), ...kept.map((k) => k.line)];

  return { output: outLines.join('\n') + '\n', counts, excluded, graduated, skipped, total };
}
