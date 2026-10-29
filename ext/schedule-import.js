// ייבוא מערכת שעות מקובץ (Excel / CSV / PDF / טקסט)
const XLSX = require('xlsx');

const DAY_WORDS = [['ראשון', 'א', 'sun', 'sunday'], ['שני', 'ב', 'mon', 'monday'], ['שלישי', 'ג', 'tue', 'tuesday'], ['רביעי', 'ד', 'wed', 'wednesday'], ['חמישי', 'ה', 'thu', 'thursday']];
const clean = (s) => String(s == null ? '' : s).replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
const normCls = (s) => clean(s).replace(/[׳'`´’"״]/g, '').replace(/\s+/g, '').toLowerCase();

function dayOf(s) {
  let t = clean(s).replace(/[׳'`’"״.:]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!t) return -1;
  if (/^[0-4]$/.test(t)) return Number(t);
  t = t.replace(/^יום\s*/, '');
  for (let i = 0; i < 5; i++) if (DAY_WORDS[i].includes(t)) return i;
  return -1;
}
const pad = (n) => String(n).padStart(2, '0');
function normTime(h, m) { h = Number(h); m = Number(m || 0); return h > 23 || m > 59 ? null : pad(h) + ':' + pad(m); }
function timeRange(s) {
  const m = clean(s).match(/(\d{1,2})[:.](\d{2})\s*[-–—־ ]\s*(\d{1,2})[:.](\d{2})/);
  return m ? { start: normTime(m[1], m[2]), end: normTime(m[3], m[4]) } : null;
}
function oneTime(s) { const m = clean(s).match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/); return m ? normTime(m[1], m[2]) : null; }
function addMin(hm, min) { const [h, m] = hm.split(':').map(Number); const t = h * 60 + m + min; return pad(Math.floor(t / 60) % 24) + ':' + pad(t % 60); }
function defaultTimes(p) { const start = addMin('08:00', (p - 1) * 55); return { start, end: addMin(start, 45) }; }

// ---------- המרת קבצים לטבלה דו-ממדית ----------
function splitDelim(line, d) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && cur === '') q = true;
    else if (ch === d) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out.map(clean);
}
function textToGrid(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sample = lines.slice(0, 10).join('\n');
  const cnt = (c) => (sample.match(new RegExp(c === '\t' ? '\t' : '\\' + c, 'g')) || []).length;
  let d = [['\t', cnt('\t')], [',', cnt(',')], [';', cnt(';')]].sort((a, b) => b[1] - a[1])[0];
  if (d[1] > 0) return lines.map((l) => splitDelim(l, d[0]));
  return lines.map((l) => l.trim().split(/\s{2,}/).map(clean)); // PDF/טקסט חופשי: עמודות מופרדות ברווחים כפולים
}
function xlsxToGrid(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  let best = [];
  for (const n of wb.SheetNames) {
    const g = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false }).map((r) => r.map(clean));
    if (g.length > best.length) best = g;
  }
  return best;
}
// השרת אינו ממתין ל-Promise, לכן חילוץ ה-PDF (אסינכרוני) רץ בתהליך בן סינכרוני
function pdfToGridSync(buf) {
  const { execFileSync } = require('child_process');
  const code = "const pp=require('pdf-parse');let b=[];process.stdin.on('data',d=>b.push(d)).on('end',()=>pp(Buffer.concat(b)).then(r=>process.stdout.write(JSON.stringify({text:r.text||''})),e=>process.stdout.write(JSON.stringify({err:1}))))";
  let out;
  try { out = JSON.parse(execFileSync(process.execPath, ['-e', code], { input: buf, cwd: __dirname, timeout: 30000, maxBuffer: 64 * 1024 * 1024 }).toString()); }
  catch { throw new Error('לא ניתן לקרוא את קובץ ה-PDF'); }
  if (out.err) throw new Error('לא ניתן לקרוא את קובץ ה-PDF');
  const text = String(out.text || '');
  if (text.replace(/\s/g, '').length < 10) throw new Error('קובץ ה-PDF אינו מכיל טקסט שניתן לחילוץ (כנראה סריקה/תמונה). נא להעלות Excel או CSV, או להעתיק ולהדביק את הטקסט.');
  return textToGrid(text);
}

// ---------- ניתוח הטבלה ----------
function parseCell(cell) {
  const raw = clean(cell);
  if (!raw || /^[-–—_.]+$/.test(raw)) return null;
  let place = '', cls = raw;
  const m = raw.match(/^(.*?)[(\[]([^)\]]*)[)\]]\s*(.*)$/);
  if (m) { cls = clean(m[1] + ' ' + m[3]); place = clean(m[2]); }
  else if (/\s[-–—|\/]\s/.test(raw)) { const [a, ...b] = raw.split(/\s[-–—|\/]\s/); cls = clean(a); place = clean(b.join(' ')); }
  return { class_name: cls, place };
}
function transpose(g) { const w = Math.max(...g.map((r) => r.length)); return Array.from({ length: w }, (_, c) => g.map((r) => r[c] || '')); }

function parseGrid(grid0) {
  let grid = grid0.filter((r) => r.some((c) => c));
  if (!grid.length) return { rows: [], layout: 'empty' };
  // כותרת עם שמות ימים (>=2)
  const dayHeaderIdx = (g) => g.findIndex((r) => r.filter((c) => dayOf(c) >= 0 && !/^[0-4]$/.test(clean(c))).length >= 2);
  let hi = dayHeaderIdx(grid);
  const flatLike = /^(יום|day)$/i.test(clean(grid[0][0])) && grid[0].some((c) => /כיתה|שיעור|class|period/i.test(c)) || grid.some((r) => r.length >= 4 && dayOf(r[0]) >= 0 && oneTime(r[2]) && oneTime(r[3]));
  if (flatLike) hi = -1;
  else if (hi < 0) { // טבלה הפוכה: ימים בעמודה הראשונה
    const t = transpose(grid);
    const ti = dayHeaderIdx(t);
    if (ti >= 0) { grid = t.filter((r) => r.some((c) => c)); hi = dayHeaderIdx(grid); }
  }
  if (hi >= 0) {
    const head = grid[hi];
    const dayCols = head.map((c, i) => ({ i, d: /^[0-4]$/.test(clean(c)) ? -1 : dayOf(c) })).filter((x) => x.d >= 0);
    const rows = [];
    const firstDayCol = Math.min(...dayCols.map((x) => x.i));
    for (const r of grid.slice(hi + 1)) {
      const lead = r.slice(0, firstDayCol).concat(r.length > Math.max(...dayCols.map((x) => x.i)) + 1 ? r.slice(Math.max(...dayCols.map((x) => x.i)) + 1) : []);
      let period = null, tr = null;
      for (const c of lead) {
        const t = timeRange(c); if (t) tr = t;
        if (t) { const m2 = clean(c).replace(/(\d{1,2})[:.](\d{2})\s*[-–—־ ]\s*(\d{1,2})[:.](\d{2})/, '').match(/(\d{1,2})/); if (m2 && period == null) period = Number(m2[1]); }
        else { const m = clean(c).match(/^(?:שיעור\s*|שעה\s*)?(\d{1,2})\.?$/); if (m && period == null) period = Number(m[1]); }
      }
      if (!tr) { const st = lead.map(oneTime).filter(Boolean); if (st.length >= 2) tr = { start: st[0], end: st[1] }; }
      if (period == null && !tr) continue;
      if (period == null) period = rows.length ? Math.max(...rows.map((x) => x.period)) + 1 : 1;
      for (const { i, d } of dayCols) {
        for (const part of String(r[i] || '').split(/\n|;/)) {
          const pc = parseCell(part); if (!pc) continue;
          rows.push({ day: d, period, start: tr ? tr.start : '', end: tr ? tr.end : '', ...pc });
        }
      }
    }
    return { rows, layout: 'grid' };
  }
  // רשימה שטוחה
  const names = { day: /^(יום|day)$/i, period: /^(שיעור|שעה|מס.*|period)$/i, start: /^(התחלה|שעת התחלה|מ|מ-?שעה|start|from)$/i, end: /^(סיום|שעת סיום|עד|עד שעה|end|to)$/i, class_name: /^(כיתה|שכבה|קבוצה|class)$/i, place: /^(מקום|מיקום|אולם|place|location)$/i };
  const first = grid[0].map((c) => clean(c).replace(/["׳']/g, ''));
  const col = {}; first.forEach((c, i) => { for (const k in names) if (col[k] == null && names[k].test(c)) col[k] = i; });
  let body = grid, hasHeader = false;
  if (col.day != null && (col.class_name != null || col.period != null)) { body = grid.slice(1); hasHeader = true; }
  else Object.assign(col, { day: 0, period: 1, start: 2, end: 3, class_name: 4, place: 5 });
  const rows = [];
  for (const r of body) {
    const g = (k) => (col[k] != null ? clean(r[col[k]]) : '');
    const d = dayOf(g('day')); if (d < 0) continue;
    let start = g('start'), end = g('end');
    const tr = timeRange(start) || timeRange(g('period'));
    if (tr) { start = tr.start; end = tr.end; } else { start = oneTime(start) || start; end = oneTime(end) || end; }
    const p = Number(g('period').replace(/\D/g, '')) || 0;
    rows.push({ day: d, period: p, start, end, class_name: g('class_name'), place: g('place') });
  }
  return { rows, layout: hasHeader ? 'flat' : 'flat-noheader' };
}

// ---------- העשרה: אזהרות והתאמת כיתות ----------
function enrich(rows, classes, existing) {
  const byNorm = new Map(classes.map((k) => [normCls(k.name), k]));
  const seen = new Set();
  return rows.map((r) => {
    const w = []; const o = { ...r, warnings: w };
    if (!o.period) { w.push('חסר מספר שיעור'); }
    if (!o.start || !o.end) {
      if (o.period) { const t = defaultTimes(o.period); o.start = o.start || t.start; o.end = o.end || t.end; w.push('שעות לא צוינו, הוגדרו אוטומטית'); }
      else w.push('חסרות שעות');
    }
    if (o.start && o.end && o.start >= o.end) w.push('שעת סיום לפני שעת התחלה');
    o.class_id = null; o.suggestions = [];
    if (o.class_name) {
      const k = classes.find((x) => x.name === o.class_name) || byNorm.get(normCls(o.class_name));
      if (k) { o.class_id = k.id; if (k.name !== o.class_name) w.push(`הותאמה לכיתה "${k.name}"`); }
      else {
        const n = normCls(o.class_name);
        o.suggestions = classes.filter((x) => { const m = normCls(x.name); return m[0] === n[0] || m.includes(n) || n.includes(m); }).map((x) => ({ id: x.id, name: x.name }));
        w.push('כיתה לא מוכרת – ניתן לבחור כיתה קיימת');
      }
    }
    const key = o.day + '|' + o.period;
    if (o.period && existing.has(key)) { o.conflict = true; w.push('קיים כבר שיעור בשעה זו – ידולג'); }
    else if (seen.has(key)) { o.conflict = true; w.push('כפילות בקובץ – ידולג'); }
    seen.add(key);
    return o;
  });
}

module.exports = (api) => {
  const { R, run, all, one, HttpErr, classOf } = api;

  R('POST', '/api/schedule/import-file', (c) => {
    const b = c.body || {};
    let grid, note = '';
    try {
      if (Array.isArray(b.rows)) grid = null;
      else if (b.data_base64) {
        const buf = Buffer.from(String(b.data_base64).replace(/^data:[^,]*,/, ''), 'base64');
        const ext = (String(b.name || '').toLowerCase().match(/\.(\w+)$/) || [])[1] || '';
        if (!buf.length) throw new Error('הקובץ ריק');
        if (ext === 'pdf' || buf.slice(0, 4).toString() === '%PDF') grid = pdfToGridSync(buf);
        else if (ext === 'xlsx' || ext === 'xls' || buf.slice(0, 2).toString() === 'PK' || buf.slice(0, 4).toString('hex') === 'd0cf11e0') grid = xlsxToGrid(buf);
        else grid = textToGrid(buf.toString('utf8'));
      } else if (b.text) grid = textToGrid(b.text);
      else throw new Error('לא נשלח קובץ או טקסט');
    } catch (e) { throw new HttpErr(400, e.message || 'שגיאה בקריאת הקובץ'); }

    const classes = all('SELECT id,name FROM classes WHERE school_id=? AND teacher_id=? ORDER BY name', c.u.school_id, c.u.id);
    const existing = new Set(all('SELECT day,period FROM lessons_sched WHERE teacher_id=?', c.u.id).map((l) => l.day + '|' + l.period));
    let rows, layout = 'client';
    if (grid) { ({ rows, layout } = parseGrid(grid)); if (!rows.length) throw new HttpErr(400, 'לא זוהו שיעורים בקובץ. ודאו שיש עמודות/שורות של ימים (ראשון–חמישי) ושיעורים.'); }
    else rows = b.rows.map((r) => ({ day: Number(r.day), period: Number(r.period), start: String(r.start || ''), end: String(r.end || ''), class_name: String(r.class_name || ''), place: String(r.place || ''), class_id: r.class_id || null }));
    const bad = rows.find((r) => !(r.day >= 0 && r.day <= 4));
    if (bad) throw new HttpErr(400, 'יום לא תקין בשורה');

    if (!b.commit) {
      const preview = enrich(rows, classes, existing);
      return { layout, classes, preview, warnings: preview.filter((p) => p.warnings.length).length, conflicts: preview.filter((p) => p.conflict).length };
    }
    // שמירה: כמו /api/schedule/import, דילוג על כפילויות
    const prepared = enrich(rows, classes, existing);
    let imported = 0, skipped = 0;
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i];
      const cid = rows[i].class_id || p.class_id || null;
      if (cid) classOf(c.u, cid);
      if (p.conflict || !p.period || !p.start || !p.end || p.start >= p.end) { skipped++; continue; }
      if (one('SELECT 1 x FROM lessons_sched WHERE teacher_id=? AND day=? AND period=?', c.u.id, p.day, p.period)) { skipped++; continue; }
      run('INSERT INTO lessons_sched(school_id,teacher_id,day,period,start,end,class_id,place) VALUES(?,?,?,?,?,?,?,?)', c.u.school_id, c.u.id, p.day, p.period, p.start, p.end, cid, p.place || '');
      imported++;
    }
    return { imported, skipped };
  });
};
module.exports.parseGrid = parseGrid;
module.exports.textToGrid = textToGrid;
module.exports.xlsxToGrid = xlsxToGrid;
module.exports.pdfToGridSync = pdfToGridSync;
module.exports.enrich = enrich;
