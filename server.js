// יומן חנ״ג חכם — שרת מקומי (Node + SQLite מובנה)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || (process.env.VERCEL ? '/tmp/data.db' : path.join(__dirname, 'data.db'));
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode=WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS schools(id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, school_id INT, username TEXT UNIQUE, pass TEXT, name TEXT, role TEXT, stations TEXT DEFAULT '[]');
CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY, school_id INT, teacher_id INT, name TEXT, grade_level TEXT, track TEXT, combined INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY, school_id INT, class_id INT, name TEXT, home_class TEXT DEFAULT '', health INT DEFAULT 0, exempt INT DEFAULT 0, exempt_until TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS tests(id INTEGER PRIMARY KEY, school_id INT, name TEXT, grade_level TEXT, track TEXT, unit TEXT, dir TEXT, kind TEXT DEFAULT 'regular', conv TEXT, weight REAL DEFAULT 1, floor INT DEFAULT 50, bagrut INT DEFAULT 0, version TEXT DEFAULT 'v1');
CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY, school_id INT, student_id INT, test_id INT, half INT, raw REAL, grade REAL, status TEXT DEFAULT 'done', attempts INT DEFAULT 1, at TEXT, manual INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY, result_id INT, raw REAL, at TEXT);
CREATE TABLE IF NOT EXISTS lessons_sched(id INTEGER PRIMARY KEY, school_id INT, teacher_id INT, day INT, period INT, start TEXT, end TEXT, class_id INT, place TEXT);
CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY, school_id INT, teacher_id INT, class_id INT, date TEXT, topic TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS subs(id INTEGER PRIMARY KEY, school_id INT, teacher_id INT, date TEXT, class_name TEXT, hours REAL, reported INT DEFAULT 0, paid INT DEFAULT 0, details TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS facilities(id INTEGER PRIMARY KEY, school_id INT, day INT, period INT, facility TEXT, teacher_name TEXT, kind TEXT DEFAULT 'fixed', date TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS settings(school_id INT, key TEXT, value TEXT, PRIMARY KEY(school_id,key));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, school_id INT, user_id INT, action TEXT, detail TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS bagrut_assign(school_id INT, test_id INT, station TEXT, examiner_id INT);
CREATE TABLE IF NOT EXISTS bagrut_class(school_id INT, class_id INT, PRIMARY KEY(school_id,class_id));
`);

const hash = (p) => crypto.createHash('sha256').update('pej' + p).digest('hex');
const now = () => new Date().toISOString();
const run = (sql, ...a) => db.prepare(sql).run(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);

// ---------- ציונים ----------
// טבלת המרה: [{raw, grade}] ; dir=low → נמוך עדיף (זמן), high → גבוה עדיף (חזרות/מרחק)
function calcGrade(test, raw) {
  const rows = JSON.parse(test.conv || '[]');
  if (raw == null || isNaN(raw) || !rows.length) return null;
  let best = null;
  for (const r of rows) {
    const ok = test.dir === 'low' ? raw <= r.raw : raw >= r.raw;
    if (ok && (best == null || r.grade > best)) best = r.grade;
  }
  return best == null ? test.floor : Math.max(best, test.floor);
}
// ממוצע: לא בוצע ללא הצדקה=45 ; ממתין/פטור/לא רלוונטי/לא נכלל/להשלמה — מחוץ לחישוב
function gradeOf(r) {
  if (r.status === 'unexcused') return 45;
  if (r.status === 'done' && r.grade != null) return r.grade;
  return null;
}
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
function studentSummary(sid) {
  const rs = all('SELECT * FROM results WHERE student_id=?', sid);
  const h = (n) => avg(rs.filter((r) => r.half === n).map(gradeOf).filter((g) => g != null));
  const h1 = h(1), h2 = h(2);
  return { h1, h2, year: avg([h1, h2].filter((x) => x != null)) };
}

// ---------- אימות והרשאות ----------
// אסימון חתום וחסר-מצב (עובד גם בסביבת serverless עם כמה מופעים); כיבוי = מחיקה בצד הלקוח
const SECRET = process.env.SESSION_SECRET || (fs.existsSync(path.join(__dirname, 'seed-users.json')) ? crypto.createHash('sha256').update('pej-session' + fs.readFileSync(path.join(__dirname, 'seed-users.json'))).digest('hex') : crypto.randomBytes(32).toString('hex'));
const sign = (uid) => { const b = Buffer.from(String(uid) + '.' + Date.now()).toString('base64url'); return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url'); };
const sessions = {
  set(_t, uid) { return uid; },
  delete() {},
  get(token) {
    const [b, sig] = String(token || '').split('.'); if (!b || !sig) return null;
    const ok = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
    if (sig.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok))) return null;
    const [uid, ts] = Buffer.from(b, 'base64url').toString().split('.');
    return Date.now() - Number(ts) < 30 * 864e5 ? Number(uid) : null;
  },
};
const roleRank = { super: 4, school_admin: 3, teacher: 2, examiner: 1 };
function bagrutOn(sid) { return (one('SELECT value v FROM settings WHERE school_id=? AND key=?', sid, 'bagrut_on') || {}).v === '1'; }
function audit(u, action, detail) { run('INSERT INTO audit(school_id,user_id,action,detail,at) VALUES(?,?,?,?,?)', u.school_id, u.id, action, JSON.stringify(detail || {}), now()); }

class HttpErr extends Error { constructor(c, m) { super(m); this.code = c; } }
const need = (c, m) => { if (!c) throw new HttpErr(403, m || 'אין הרשאה'); };
const classOf = (u, id) => {
  const c = one('SELECT * FROM classes WHERE id=? AND school_id=?', id, u.school_id);
  if (!c) throw new HttpErr(404, 'כיתה לא נמצאה');
  if (u.role === 'teacher' && c.teacher_id !== u.id) throw new HttpErr(403, 'כיתה אינה בהרשאתך');
  return c;
};
const studentOf = (u, id) => {
  const s = one('SELECT * FROM students WHERE id=? AND school_id=?', id, u.school_id);
  if (!s) throw new HttpErr(404, 'תלמיד לא נמצא');
  if (u.role === 'teacher') classOf(u, s.class_id);
  return s;
};

// ---------- נתיבים ----------
const routes = [];
const R = (method, pat, fn, opts = {}) => routes.push({ method, re: new RegExp('^' + pat.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, opts });

R('POST', '/api/login', (c) => {
  const u = one('SELECT * FROM users WHERE username=? AND pass=?', c.body.username, hash(c.body.password || ''));
  if (!u) throw new HttpErr(401, 'שם משתמש או סיסמה שגויים');
  const token = sign(u.id);
  return { token, user: pub(u) };
}, { anon: true });
const pub = (u) => ({ id: u.id, name: u.name, role: u.role, school_id: u.school_id, stations: JSON.parse(u.stations || '[]') });
R('GET', '/api/me', (c) => ({ user: pub(c.u), school: one('SELECT * FROM schools WHERE id=?', c.u.school_id), bagrut_on: bagrutOn(c.u.school_id) }));
R('POST', '/api/logout', (c) => { sessions.delete(c.token); return { ok: true }; });

// כיתות
R('GET', '/api/classes', (c) => {
  const rows = c.u.role === 'teacher' ? all('SELECT * FROM classes WHERE school_id=? AND teacher_id=? ORDER BY name', c.u.school_id, c.u.id) : all('SELECT * FROM classes WHERE school_id=? ORDER BY name', c.u.school_id);
  return rows.map((k) => ({ ...k, count: one('SELECT COUNT(*) n FROM students WHERE class_id=?', k.id).n }));
});
R('POST', '/api/classes', (c) => {
  need(c.u.role !== 'examiner');
  const b = c.body;
  if (!b.name || !b.name.trim()) throw new HttpErr(400, 'חסר שם כיתה');
  const r = run('INSERT INTO classes(school_id,teacher_id,name,grade_level,track,combined) VALUES(?,?,?,?,?,?)', c.u.school_id, c.u.id, b.name.trim(), b.grade_level || '', b.track || 'בנים', b.combined ? 1 : 0);
  return { id: Number(r.lastInsertRowid) };
});
R('PUT', '/api/classes/:id', (c) => { classOf(c.u, c.p.id); const b = c.body; run('UPDATE classes SET name=?,grade_level=?,track=?,combined=? WHERE id=?', b.name, b.grade_level, b.track, b.combined ? 1 : 0, c.p.id); return { ok: true }; });
R('DELETE', '/api/classes/:id', (c) => {
  classOf(c.u, c.p.id);
  need(c.u.role !== 'examiner');
  const ids = all('SELECT id FROM students WHERE class_id=?', c.p.id).map((s) => s.id);
  for (const id of ids) { run('DELETE FROM results WHERE student_id=?', id); }
  run('DELETE FROM students WHERE class_id=?', c.p.id);
  run('DELETE FROM classes WHERE id=?', c.p.id);
  audit(c.u, 'class.delete', { id: c.p.id });
  return { ok: true };
});

// תלמידים
R('GET', '/api/classes/:id/students', (c) => {
  classOf(c.u, c.p.id);
  const q = (c.q.q || '').trim();
  let rows = all('SELECT * FROM students WHERE class_id=? ORDER BY name COLLATE NOCASE', c.p.id);
  if (q) rows = rows.filter((s) => s.name.includes(q));
  return rows.map((s) => ({ ...s, ...studentSummary(s.id), missing: missingCount(s) }));
});
function missingCount(s) {
  const k = one('SELECT * FROM classes WHERE id=?', s.class_id);
  const tests = all("SELECT id FROM tests WHERE school_id=? AND bagrut=0 AND (track=? OR track='') AND (grade_level=? OR grade_level='')", s.school_id, k.track, k.grade_level);
  if (s.exempt) return 0;
  return tests.filter((t) => !one('SELECT 1 x FROM results WHERE student_id=? AND test_id=? AND status<>?', s.id, t.id, 'pending')).length;
}
R('POST', '/api/students', (c) => {
  const b = c.body;
  classOf(c.u, b.class_id);
  const name = (b.name || '').trim();
  if (!name) throw new HttpErr(400, 'חסר שם תלמיד');
  const r = run('INSERT INTO students(school_id,class_id,name,home_class) VALUES(?,?,?,?)', c.u.school_id, b.class_id, name, b.home_class || '');
  return { id: Number(r.lastInsertRowid) };
});
R('POST', '/api/classes/:id/import', (c) => {
  classOf(c.u, c.p.id);
  const names = String(c.body.text || '').split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim())).filter((r) => r[0]);
  const seen = new Set(all('SELECT name FROM students WHERE class_id=?', c.p.id).map((s) => s.name));
  let added = 0;
  for (const [n, home] of names) if (!seen.has(n)) { run('INSERT INTO students(school_id,class_id,name,home_class) VALUES(?,?,?,?)', c.u.school_id, c.p.id, n, home || ''); seen.add(n); added++; }
  return { added, skipped: names.length - added };
});
R('GET', '/api/students/:id', (c) => {
  const s = studentOf(c.u, c.p.id);
  const results = all('SELECT r.*, t.name tname, t.unit FROM results r JOIN tests t ON t.id=r.test_id WHERE r.student_id=? ORDER BY r.half, t.name', s.id);
  return { ...s, ...studentSummary(s.id), results };
});
R('PUT', '/api/students/:id', (c) => {
  const s = studentOf(c.u, c.p.id); const b = c.body;
  run('UPDATE students SET name=?,home_class=?,health=?,exempt=?,exempt_until=?,class_id=? WHERE id=?', (b.name ?? s.name).trim(), b.home_class ?? s.home_class, b.health ?? s.health, b.exempt ?? s.exempt, b.exempt_until ?? s.exempt_until, b.class_id ? classOf(c.u, b.class_id).id : s.class_id, s.id);
  return { ok: true };
});
R('DELETE', '/api/students/:id', (c) => { const s = studentOf(c.u, c.p.id); run('DELETE FROM results WHERE student_id=?', s.id); run('DELETE FROM students WHERE id=?', s.id); audit(c.u, 'student.delete', { id: s.id }); return { ok: true }; });

// מבדקים
R('GET', '/api/tests', (c) => {
  let rows = all('SELECT * FROM tests WHERE school_id=? ORDER BY grade_level, track, name', c.u.school_id);
  if (c.q.grade_level) rows = rows.filter((t) => t.grade_level === c.q.grade_level);
  if (c.q.track) rows = rows.filter((t) => t.track === c.q.track);
  if (c.q.kind) rows = rows.filter((t) => t.kind === c.q.kind);
  if (c.q.regular) rows = rows.filter((t) => !t.bagrut);
  return rows.map((t) => ({ ...t, conv: JSON.parse(t.conv || '[]'), used: !!one('SELECT 1 x FROM results WHERE test_id=?', t.id) }));
});
function testBody(b) {
  if (!b.name || !b.name.trim()) throw new HttpErr(400, 'חסר שם מבדק');
  if (!['low', 'high'].includes(b.dir)) throw new HttpErr(400, 'כיוון מדידה לא תקין');
  const conv = (b.conv || []).map((r) => ({ raw: Number(r.raw), grade: Number(r.grade) }));
  if (conv.some((r) => isNaN(r.raw) || isNaN(r.grade))) throw new HttpErr(400, 'טבלת המרה לא תקינה');
  return conv;
}
R('POST', '/api/tests', (c) => {
  need(c.u.role !== 'examiner'); const b = c.body; const conv = testBody(b);
  const r = run('INSERT INTO tests(school_id,name,grade_level,track,unit,dir,kind,conv,weight,floor) VALUES(?,?,?,?,?,?,?,?,?,?)', c.u.school_id, b.name.trim(), b.grade_level || '', b.track || '', b.unit || '', b.dir, b.kind || 'regular', JSON.stringify(conv), b.weight || 1, b.floor ?? 50);
  return { id: Number(r.lastInsertRowid) };
});
R('PUT', '/api/tests/:id', (c) => {
  need(c.u.role !== 'examiner'); const t = one('SELECT * FROM tests WHERE id=? AND school_id=?', c.p.id, c.u.school_id); if (!t) throw new HttpErr(404, 'מבדק לא נמצא');
  const b = c.body; const conv = testBody({ ...t, ...b, conv: b.conv ?? JSON.parse(t.conv) });
  const used = !!one('SELECT 1 x FROM results WHERE test_id=?', t.id);
  const convChanged = JSON.stringify(conv) !== t.conv;
  if (used && (convChanged || (b.dir && b.dir !== t.dir)) && !b.confirm_recalc) throw new HttpErr(409, 'במבדק קיימות תוצאות — שינוי הטבלה יחשב מחדש ציונים. נדרש אישור.');
  const ver = convChanged ? 'v' + (parseInt(t.version.slice(1)) + 1) : t.version;
  run('UPDATE tests SET name=?,grade_level=?,track=?,unit=?,dir=?,conv=?,floor=?,version=? WHERE id=?', (b.name ?? t.name).trim(), b.grade_level ?? t.grade_level, b.track ?? t.track, b.unit ?? t.unit, b.dir ?? t.dir, JSON.stringify(conv), b.floor ?? t.floor, ver, t.id);
  if (used && convChanged) { // חישוב מחדש — התוצאות הגולמיות נשמרות
    const nt = one('SELECT * FROM tests WHERE id=?', t.id);
    for (const r of all("SELECT * FROM results WHERE test_id=? AND status='done' AND manual=0", t.id)) run('UPDATE results SET grade=? WHERE id=?', calcGrade(nt, r.raw), r.id);
    audit(c.u, 'test.recalibrate', { id: t.id, from: t.version, to: ver });
  }
  return { ok: true, version: ver };
});
R('POST', '/api/tests/:id/preview', (c) => {
  const t = one('SELECT * FROM tests WHERE id=? AND school_id=?', c.p.id, c.u.school_id); if (!t) throw new HttpErr(404, 'מבדק לא נמצא');
  const nt = { ...t, ...c.body, conv: JSON.stringify(c.body.conv || JSON.parse(t.conv)) };
  const rs = all("SELECT * FROM results WHERE test_id=? AND status='done' AND manual=0", t.id);
  return { affected: rs.filter((r) => calcGrade(nt, r.raw) !== r.grade).length, total: rs.length };
});
R('DELETE', '/api/tests/:id', (c) => {
  need(c.u.role !== 'examiner');
  if (one('SELECT 1 x FROM results WHERE test_id=?', c.p.id) && !c.q.force) throw new HttpErr(409, 'במבדק קיימות תוצאות. מחיקה תמחק גם אותן.');
  run('DELETE FROM results WHERE test_id=?', c.p.id); run('DELETE FROM tests WHERE id=? AND school_id=?', c.p.id, c.u.school_id); audit(c.u, 'test.delete', { id: c.p.id }); return { ok: true };
});
R('GET', '/api/tests/export', (c) => all('SELECT name,grade_level,track,unit,dir,conv,floor FROM tests WHERE school_id=? AND bagrut=0', c.u.school_id).map((t) => ({ ...t, conv: JSON.parse(t.conv) })));
R('POST', '/api/tests/import', (c) => {
  need(c.u.role !== 'examiner'); let n = 0;
  for (const t of c.body.tests || []) { const conv = testBody(t); run('INSERT INTO tests(school_id,name,grade_level,track,unit,dir,conv,floor) VALUES(?,?,?,?,?,?,?,?)', c.u.school_id, t.name, t.grade_level || '', t.track || '', t.unit || '', t.dir, JSON.stringify(conv), t.floor ?? 50); n++; }
  return { imported: n };
});

// יומן ציונים: רשימת תלמידים + תוצאה לכל תלמיד במבדק/מחצית
R('GET', '/api/gradebook', (c) => {
  const k = classOf(c.u, c.q.class_id); const half = Number(c.q.half || 1);
  const t = one('SELECT * FROM tests WHERE id=? AND school_id=?', c.q.test_id, c.u.school_id); if (!t) throw new HttpErr(404, 'מבדק לא נמצא');
  const students = all('SELECT * FROM students WHERE class_id=? ORDER BY name COLLATE NOCASE', k.id);
  return { test: { ...t, conv: JSON.parse(t.conv) }, rows: students.map((s) => {
    const r = one('SELECT * FROM results WHERE student_id=? AND test_id=? AND half=?', s.id, t.id, half);
    const status = r ? r.status : (s.exempt ? 'exempt' : 'pending');
    return { student_id: s.id, name: s.name, exempt: s.exempt, status, raw: r ? r.raw : null, grade: r ? r.grade : null, attempts: r ? r.attempts : 0, manual: r ? r.manual : 0 };
  }) };
});
function saveResult(u, { student_id, test_id, half, raw, status, grade }) {
  const s = studentOf(u, student_id);
  const t = one('SELECT * FROM tests WHERE id=? AND school_id=?', test_id, u.school_id); if (!t) throw new HttpErr(404, 'מבדק לא נמצא');
  if (t.bagrut) { need(bagrutOn(u.school_id), 'מוד הבגרות כבוי'); }
  status = status || 'done';
  const valid = ['pending', 'done', 'incomplete', 'unexcused', 'exempt', 'na', 'excluded'];
  if (!valid.includes(status)) throw new HttpErr(400, 'סטטוס לא תקין');
  let g = null;
  if (status === 'done') {
    if (raw == null || raw === '' || isNaN(Number(raw)) || Number(raw) < 0) throw new HttpErr(400, 'תוצאה לא תקינה');
    raw = Number(raw); g = calcGrade(t, raw);
  } else raw = null;
  let manual = 0;
  if (status === 'done' && grade != null && grade !== '') { g = Number(grade); manual = 1; }
  const ex = one('SELECT * FROM results WHERE student_id=? AND test_id=? AND half=?', s.id, test_id, half);
  if (ex) {
    // ניסיון חוזר: מתועד, התוצאה הטובה נשמרת
    if (status === 'done' && ex.raw != null) {
      run('INSERT INTO attempts(result_id,raw,at) VALUES(?,?,?)', ex.id, ex.raw, ex.at);
      const better = t.dir === 'low' ? raw < ex.raw : raw > ex.raw;
      const keepRaw = better || manual ? raw : ex.raw;
      run('UPDATE results SET raw=?,grade=?,status=?,attempts=attempts+1,at=?,manual=? WHERE id=?', keepRaw, manual ? g : calcGrade(t, keepRaw), status, now(), manual, ex.id);
    } else run('UPDATE results SET raw=?,grade=?,status=?,at=?,manual=? WHERE id=?', raw, g, status, now(), manual, ex.id);
    return one('SELECT * FROM results WHERE id=?', ex.id);
  }
  const r = run('INSERT INTO results(school_id,student_id,test_id,half,raw,grade,status,at,manual) VALUES(?,?,?,?,?,?,?,?,?)', u.school_id, s.id, test_id, half, raw, g, status, now(), manual);
  return one('SELECT * FROM results WHERE id=?', r.lastInsertRowid);
}
R('POST', '/api/results', (c) => saveResult(c.u, c.body));
R('POST', '/api/results/batch', (c) => { // שמירה אטומית של ריצה
  db.exec('BEGIN');
  try { const out = (c.body.items || []).map((i) => saveResult(c.u, i)); db.exec('COMMIT'); return { saved: out.length, results: out }; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
});

// מערכת שעות ויומן שיעורים
R('GET', '/api/schedule', (c) => all('SELECT l.*, k.name class_name FROM lessons_sched l LEFT JOIN classes k ON k.id=l.class_id WHERE l.school_id=? AND l.teacher_id=? ORDER BY day, period', c.u.school_id, c.u.id));
R('POST', '/api/schedule', (c) => {
  const b = c.body;
  if (b.day == null || !b.period || !b.start || !b.end) throw new HttpErr(400, 'פרטי שיעור חסרים');
  if (b.class_id) classOf(c.u, b.class_id);
  if (one('SELECT 1 x FROM lessons_sched WHERE teacher_id=? AND day=? AND period=?', c.u.id, b.day, b.period)) throw new HttpErr(409, 'כבר קיים שיעור בשעה זו');
  const r = run('INSERT INTO lessons_sched(school_id,teacher_id,day,period,start,end,class_id,place) VALUES(?,?,?,?,?,?,?,?)', c.u.school_id, c.u.id, b.day, b.period, b.start, b.end, b.class_id || null, b.place || '');
  return { id: Number(r.lastInsertRowid) };
});
R('DELETE', '/api/schedule/:id', (c) => { run('DELETE FROM lessons_sched WHERE id=? AND teacher_id=?', c.p.id, c.u.id); return { ok: true }; });
R('POST', '/api/schedule/import', (c) => { // CSV: יום,שיעור,התחלה,סיום,כיתה,מקום
  const rows = String(c.body.text || '').split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim())).filter((r) => r.length >= 4 && r[0]);
  const preview = rows.map((r) => ({ day: Number(r[0]), period: Number(r[1]), start: r[2], end: r[3], class_name: r[4] || '', place: r[5] || '' }));
  if (c.body.commit) {
    let n = 0;
    for (const p of preview) {
      const k = one('SELECT id FROM classes WHERE school_id=? AND teacher_id=? AND name=?', c.u.school_id, c.u.id, p.class_name);
      if (!one('SELECT 1 x FROM lessons_sched WHERE teacher_id=? AND day=? AND period=?', c.u.id, p.day, p.period)) { run('INSERT INTO lessons_sched(school_id,teacher_id,day,period,start,end,class_id,place) VALUES(?,?,?,?,?,?,?,?)', c.u.school_id, c.u.id, p.day, p.period, p.start, p.end, k ? k.id : null, p.place); n++; }
    }
    return { imported: n };
  }
  return { preview };
});
R('GET', '/api/current-lesson', (c) => {
  const d = c.q.at ? new Date(c.q.at) : new Date();
  const day = d.getDay(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const ls = all('SELECT l.*, k.name class_name FROM lessons_sched l LEFT JOIN classes k ON k.id=l.class_id WHERE l.teacher_id=? AND l.day=? ORDER BY start', c.u.id, day);
  return { current: ls.find((l) => l.start <= hm && hm < l.end) || null, next: ls.find((l) => l.start > hm) || null };
});
R('GET', '/api/journal', (c) => all('SELECT j.*, k.name class_name FROM journal j LEFT JOIN classes k ON k.id=j.class_id WHERE j.school_id=? AND j.teacher_id=? ORDER BY date DESC, j.id DESC', c.u.school_id, c.u.id));
R('POST', '/api/journal', (c) => {
  const b = c.body; if (!b.topic || !b.date) throw new HttpErr(400, 'חסר נושא או תאריך'); if (b.class_id) classOf(c.u, b.class_id);
  const r = run('INSERT INTO journal(school_id,teacher_id,class_id,date,topic,notes) VALUES(?,?,?,?,?,?)', c.u.school_id, c.u.id, b.class_id || null, b.date, b.topic, b.notes || ''); return { id: Number(r.lastInsertRowid) };
});
R('DELETE', '/api/journal/:id', (c) => { run('DELETE FROM journal WHERE id=? AND teacher_id=?', c.p.id, c.u.id); return { ok: true }; });

// מילויי מקום
R('GET', '/api/subs', (c) => {
  const rows = all('SELECT * FROM subs WHERE school_id=? AND teacher_id=? ORDER BY date DESC', c.u.school_id, c.u.id);
  const v = c.q.view, today = new Date().toISOString().slice(0, 10);
  const f = rows.filter((r) => v === 'today' ? r.date === today : v === 'week' ? (Date.now() - new Date(r.date)) / 864e5 < 7 && new Date(r.date) <= new Date(today + 'T23:59:59') : v === 'month' ? r.date.slice(0, 7) === today.slice(0, 7) : true);
  return { rows: f, summary: { count: f.length, hours: f.reduce((a, r) => a + r.hours, 0), reported: f.filter((r) => r.reported).length, unreported: f.filter((r) => !r.reported).length, paid: f.filter((r) => r.paid).length } };
});
R('POST', '/api/subs', (c) => { const b = c.body; if (!b.date || !(Number(b.hours) > 0)) throw new HttpErr(400, 'תאריך ושעות חובה'); const r = run('INSERT INTO subs(school_id,teacher_id,date,class_name,hours,details) VALUES(?,?,?,?,?,?)', c.u.school_id, c.u.id, b.date, b.class_name || '', Number(b.hours), b.details || ''); return { id: Number(r.lastInsertRowid) }; });
R('PUT', '/api/subs/:id', (c) => { run('UPDATE subs SET reported=?,paid=? WHERE id=? AND teacher_id=?', c.body.reported ? 1 : 0, c.body.paid ? 1 : 0, c.p.id, c.u.id); return { ok: true }; });
R('DELETE', '/api/subs/:id', (c) => { run('DELETE FROM subs WHERE id=? AND teacher_id=?', c.p.id, c.u.id); return { ok: true }; });

// מתקנים
R('GET', '/api/facilities', (c) => {
  const rows = all('SELECT * FROM facilities WHERE school_id=? ORDER BY day, period', c.u.school_id);
  const names = [...new Set(rows.map((r) => r.facility))];
  return { rows, names };
});
R('POST', '/api/facilities', (c) => {
  need(c.u.role !== 'examiner'); const b = c.body;
  if (one('SELECT 1 x FROM facilities WHERE school_id=? AND day=? AND period=? AND facility=? AND (kind=\'fixed\' OR date=?)', c.u.school_id, b.day, b.period, b.facility, b.date || '')) throw new HttpErr(409, 'המתקן תפוס בשעה זו');
  const r = run('INSERT INTO facilities(school_id,day,period,facility,teacher_name,kind,date) VALUES(?,?,?,?,?,?,?)', c.u.school_id, b.day, b.period, b.facility, b.teacher_name || c.u.name, b.kind || 'fixed', b.date || ''); return { id: Number(r.lastInsertRowid) };
});
R('DELETE', '/api/facilities/:id', (c) => { need(c.u.role !== 'examiner'); run('DELETE FROM facilities WHERE id=? AND school_id=?', c.p.id, c.u.school_id); return { ok: true }; });

// דוחות
R('GET', '/api/reports/overview', (c) => {
  const cls = c.u.role === 'teacher' ? all('SELECT * FROM classes WHERE school_id=? AND teacher_id=?', c.u.school_id, c.u.id) : all('SELECT * FROM classes WHERE school_id=?', c.u.school_id);
  let students = [];
  for (const k of cls) students = students.concat(all('SELECT * FROM students WHERE class_id=?', k.id).map((s) => ({ ...s, ...studentSummary(s.id), missing: missingCount(s), cname: k.name })));
  const th = Number(c.q.threshold || 56);
  return {
    classes: cls.length, students: students.length,
    h1: avg(students.map((s) => s.h1).filter((x) => x != null)), h2: avg(students.map((s) => s.h2).filter((x) => x != null)), year: avg(students.map((s) => s.year).filter((x) => x != null)),
    missing: students.filter((s) => s.missing > 0).length, low: students.filter((s) => s.year != null && s.year < th).length,
    byClass: cls.map((k) => { const ss = students.filter((s) => s.class_id === k.id); return { id: k.id, name: k.name, count: ss.length, year: avg(ss.map((s) => s.year).filter((x) => x != null)), missing: ss.filter((s) => s.missing > 0).length }; }),
  };
});
R('GET', '/api/reports/class/:id', (c) => {
  const k = classOf(c.u, c.p.id);
  const students = all('SELECT * FROM students WHERE class_id=? ORDER BY name COLLATE NOCASE', k.id).map((s) => ({ id: s.id, name: s.name, exempt: s.exempt, ...studentSummary(s.id), missing: missingCount(s) }));
  return { class: k, students };
});
R('GET', '/api/reports/class/:id/csv', (c) => {
  const rep = routes.find((r) => r.re.test('/api/reports/class/1')).fn(c);
  return { csv: 'שם,מחצית א,מחצית ב,שנתי,חסרים\n' + rep.students.map((s) => [s.name, s.h1 ?? '', s.h2 ?? '', s.year ?? '', s.missing].join(',')).join('\n') };
});

// בגרות — ממשק ניהול: רק Super Admin
const sup = (c) => need(c.u.role === 'super', 'ממשק זה מיועד למנהל מערכת ראשי בלבד');
R('GET', '/api/bagrut/admin', (c) => {
  sup(c);
  return {
    on: bagrutOn(c.u.school_id),
    tests: all('SELECT id,name,track,unit,bagrut,weight FROM tests WHERE school_id=? ORDER BY name', c.u.school_id),
    examiners: all("SELECT id,name FROM users WHERE school_id=? AND role IN ('teacher','examiner')", c.u.school_id),
    assign: all('SELECT * FROM bagrut_assign WHERE school_id=?', c.u.school_id),
    classes: all('SELECT id,name FROM classes WHERE school_id=? AND grade_level=?', c.u.school_id, 'י״ב'),
  };
});
R('POST', '/api/bagrut/toggle', (c) => { sup(c); run('INSERT OR REPLACE INTO settings VALUES(?,?,?)', c.u.school_id, 'bagrut_on', c.body.on ? '1' : '0'); audit(c.u, 'bagrut.toggle', c.body); return { on: !!c.body.on }; });
R('POST', '/api/bagrut/select', (c) => { // בחירת מבדק בגרות + משקל
  sup(c); const t = one('SELECT * FROM tests WHERE id=? AND school_id=?', c.body.test_id, c.u.school_id); if (!t) throw new HttpErr(404, 'מבדק לא נמצא');
  const w = Number(c.body.weight ?? t.weight); if (!(w >= 0 && w <= 100)) throw new HttpErr(400, 'משקל לא תקין');
  run('UPDATE tests SET bagrut=?, weight=? WHERE id=?', c.body.bagrut ? 1 : 0, w, t.id); return { ok: true };
});
R('POST', '/api/bagrut/assign', (c) => { sup(c); run('DELETE FROM bagrut_assign WHERE school_id=? AND test_id=?', c.u.school_id, c.body.test_id); if (c.body.examiner_id) run('INSERT INTO bagrut_assign VALUES(?,?,?,?)', c.u.school_id, c.body.test_id, c.body.station || '', c.body.examiner_id); return { ok: true }; });
// מתחם הבגרות לבוחן/מורה
R('GET', '/api/bagrut/stations', (c) => {
  need(bagrutOn(c.u.school_id), 'מוד הבגרות כבוי');
  const rows = all('SELECT a.*, t.name tname, t.unit FROM bagrut_assign a JOIN tests t ON t.id=a.test_id WHERE a.school_id=?', c.u.school_id);
  return rows.filter((r) => c.u.role === 'super' || r.examiner_id === c.u.id);
});
R('GET', '/api/bagrut/report', (c) => {
  need(bagrutOn(c.u.school_id), 'מוד הבגרות כבוי');
  const tests = all('SELECT * FROM tests WHERE school_id=? AND bagrut=1', c.u.school_id);
  const cls = all('SELECT * FROM classes WHERE school_id=? AND grade_level=?', c.u.school_id, 'י״ב').filter((k) => c.u.role !== 'teacher' || k.teacher_id === c.u.id);
  const students = cls.flatMap((k) => all('SELECT * FROM students WHERE class_id=? ORDER BY name COLLATE NOCASE', k.id)).map((s) => {
    const rs = tests.map((t) => one('SELECT * FROM results WHERE student_id=? AND test_id=?', s.id, t.id));
    const wsum = tests.reduce((a, t, i) => a + (rs[i] && rs[i].grade != null ? t.weight : 0), 0);
    const total = wsum ? Math.round(tests.reduce((a, t, i) => a + (rs[i] && rs[i].grade != null ? rs[i].grade * t.weight : 0), 0) / wsum) : null;
    return { id: s.id, name: s.name, done: rs.filter((r) => r && r.grade != null).length, of: tests.length, total, final: tests.length > 0 && rs.every((r) => r && r.grade != null) };
  });
  return { tests: tests.map((t) => ({ id: t.id, name: t.name, weight: t.weight })), students };
});
R('GET', '/api/bagrut/entry', (c) => { // תלמידי י״ב + תוצאה לתחנה
  need(bagrutOn(c.u.school_id), 'מוד הבגרות כבוי');
  const a = one('SELECT * FROM bagrut_assign WHERE school_id=? AND test_id=?', c.u.school_id, c.q.test_id);
  need(c.u.role === 'super' || (a && a.examiner_id === c.u.id), 'אינך משובץ לתחנה זו');
  const k = one('SELECT * FROM classes WHERE id=? AND school_id=? AND grade_level=?', c.q.class_id, c.u.school_id, 'י״ב'); if (!k) throw new HttpErr(404, 'כיתת אם לא נמצאה');
  const t = one('SELECT * FROM tests WHERE id=?', c.q.test_id);
  return { test: { ...t, conv: JSON.parse(t.conv) }, rows: all('SELECT * FROM students WHERE class_id=? ORDER BY name COLLATE NOCASE', k.id).map((s) => { const r = one('SELECT * FROM results WHERE student_id=? AND test_id=?', s.id, t.id); return { student_id: s.id, name: s.name, raw: r ? r.raw : null, grade: r ? r.grade : null, attempts: r ? r.attempts : 0, status: r ? r.status : 'pending' }; }) };
});
R('POST', '/api/bagrut/result', (c) => {
  need(bagrutOn(c.u.school_id), 'מוד הבגרות כבוי');
  const a = one('SELECT * FROM bagrut_assign WHERE school_id=? AND test_id=?', c.u.school_id, c.body.test_id);
  need(c.u.role === 'super' || (a && a.examiner_id === c.u.id), 'אינך משובץ לתחנה זו');
  const s = one('SELECT * FROM students WHERE id=? AND school_id=?', c.body.student_id, c.u.school_id); if (!s) throw new HttpErr(404, 'תלמיד לא נמצא');
  // בוחן אינו מוגבל לכיתות המורה — עוקפים classOf
  const t = one('SELECT * FROM tests WHERE id=?', c.body.test_id); const raw = Number(c.body.raw);
  if (isNaN(raw) || raw < 0) throw new HttpErr(400, 'תוצאה לא תקינה');
  const ex = one('SELECT * FROM results WHERE student_id=? AND test_id=?', s.id, t.id);
  if (ex) { const better = t.dir === 'low' ? raw < ex.raw : raw > ex.raw; run('INSERT INTO attempts(result_id,raw,at) VALUES(?,?,?)', ex.id, ex.raw, ex.at); const k = better ? raw : ex.raw; run('UPDATE results SET raw=?,grade=?,attempts=attempts+1,at=? WHERE id=?', k, calcGrade(t, k), now(), ex.id); }
  else run('INSERT INTO results(school_id,student_id,test_id,half,raw,grade,status,at) VALUES(?,?,?,?,?,?,?,?)', c.u.school_id, s.id, t.id, 2, raw, calcGrade(t, raw), 'done', now());
  return { ok: true, grade: calcGrade(t, raw) };
});

// משתמשים / בתי ספר (ניהול)
R('GET', '/api/users', (c) => { need(roleRank[c.u.role] >= 3); return all('SELECT id,name,username,role FROM users WHERE school_id=?', c.u.school_id); });
R('POST', '/api/users', (c) => {
  need(roleRank[c.u.role] >= 3); const b = c.body;
  if (!b.username || !b.password || !b.name) throw new HttpErr(400, 'חסרים פרטים');
  if (b.role === 'super') need(c.u.role === 'super');
  if (one('SELECT 1 x FROM users WHERE username=?', b.username)) throw new HttpErr(409, 'שם משתמש קיים');
  run('INSERT INTO users(school_id,username,pass,name,role) VALUES(?,?,?,?,?)', c.u.school_id, b.username, hash(b.password), b.name, b.role || 'teacher'); return { ok: true };
});
R('GET', '/api/audit', (c) => { need(roleRank[c.u.role] >= 3); return all('SELECT * FROM audit WHERE school_id=? ORDER BY id DESC LIMIT 100', c.u.school_id); });

// ---------- הרחבות (ext/*.js) ----------
const extDir = path.join(__dirname, 'ext');
if (fs.existsSync(extDir)) for (const f of fs.readdirSync(extDir).filter((x) => x.endsWith('.js')).sort()) require(path.join(extDir, f))({ R, run, all, one, db, need, HttpErr, audit, hash, now, bagrutOn, classOf, studentOf, roleRank, sessions, calcGrade });

// ---------- שרת ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  if (url.pathname.startsWith('/api/')) {
    const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!route) return send(404, { error: 'נתיב לא נמצא' });
    try {
      let body = {};
      if (req.method !== 'GET' && req.method !== 'DELETE') { const chunks = []; for await (const ch of req) chunks.push(ch); const txt = Buffer.concat(chunks).toString(); body = txt ? JSON.parse(txt) : {}; }
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const uid = sessions.get(token);
      const u = uid ? one('SELECT * FROM users WHERE id=?', uid) : null;
      if (!u && !route.opts.anon) return send(401, { error: 'נדרשת התחברות' });
      const m = route.re.exec(url.pathname);
      send(200, route.fn({ u, body, q: Object.fromEntries(url.searchParams), p: m.groups || {}, token }));
    } catch (e) {
      if (e instanceof HttpErr) send(e.code, { error: e.message });
      else if (e instanceof SyntaxError) send(400, { error: 'בקשה לא תקינה' });
      else { console.error(e); send(500, { error: 'שגיאת שרת' }); }
    }
    return;
  }
  if (url.pathname === '/ext.js') { // כל קבצי public/ext/*.js כקובץ אחד
    const d = path.join(__dirname, 'public', 'ext');
    const js = fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.endsWith('.js')).sort().map((x) => fs.readFileSync(path.join(d, x), 'utf8')).join('\n;\n') : '';
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' }); return res.end(js);
  }
  let f = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(__dirname, 'public', 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

// ---------- נתוני דמו ----------
function seed() {
  if (one('SELECT COUNT(*) n FROM schools').n) return;
  const sid = Number(run('INSERT INTO schools(name) VALUES(?)', 'אורט הנרי רונסון').lastInsertRowid);
  const mk = (u, p, n, r) => Number(run('INSERT INTO users(school_id,username,pass,name,role) VALUES(?,?,?,?,?)', sid, u, hash(p), n, r).lastInsertRowid);
  mk('admin', 'admin123', 'מנהל מערכת', 'super'); mk('principal', 'principal123', 'מנהל בית ספר', 'school_admin');
  const t1 = mk('teacher', 'teacher123', 'דנה כהן', 'teacher'); mk('teacher2', 'teacher123', 'יוסי לוי', 'teacher');
  run('INSERT INTO settings VALUES(?,?,?)', sid, 'bagrut_on', '0');
  const conv = (rows) => JSON.stringify(rows.map(([raw, grade]) => ({ raw, grade })));
  const T = (n, gl, tr, unit, dir, c, kind = 'regular') => Number(run('INSERT INTO tests(school_id,name,grade_level,track,unit,dir,conv,kind) VALUES(?,?,?,?,?,?,?,?)', sid, n, gl, tr, unit, dir, conv(c), kind).lastInsertRowid);
  T('ריצת 60 מטר', 'ט׳', 'בנים', 'שניות', 'low', [[8.5, 100], [9, 90], [9.5, 80], [10, 70], [11, 60], [12, 50]], 'sprint');
  T('ריצת 2000 מטר', 'ט׳', 'בנים', 'שניות', 'low', [[480, 100], [540, 90], [600, 80], [660, 70], [720, 60], [800, 50]], 'long');
  T('כפיפות מרפקים', 'ט׳', 'בנים', 'חזרות', 'high', [[40, 100], [32, 90], [25, 80], [18, 70], [12, 60], [6, 50]]);
  T('כפיפות בטן', 'ט׳', 'בנים', 'חזרות', 'high', [[50, 100], [42, 90], [35, 80], [28, 70], [20, 60], [10, 50]]);
  const bt1 = T('ריצת 3000 מטר (בגרות)', 'י״ב', 'בנים', 'שניות', 'low', [[720, 100], [800, 90], [880, 80], [960, 70], [1050, 60], [1200, 50]], 'long');
  const bt2 = T('קפיצה למרחק (בגרות)', 'י״ב', 'בנים', 'ס״מ', 'high', [[280, 100], [260, 90], [240, 80], [220, 70], [200, 60], [170, 50]]);
  const K = (n, gl, tr, tid = t1) => Number(run('INSERT INTO classes(school_id,teacher_id,name,grade_level,track) VALUES(?,?,?,?,?)', sid, tid, n, gl, tr).lastInsertRowid);
  const k1 = K('ט׳1', 'ט׳', 'בנים'), k2 = K('י״ב2', 'י״ב', 'בנים');
  const names = ['אבי לוי', 'בן כהן', 'גיל מזרחי', 'דוד פרץ', 'הדר שלום', 'וולוד קרמר', 'זיו אדרי', 'חן ביטון'];
  for (const n of names) run('INSERT INTO students(school_id,class_id,name,health) VALUES(?,?,?,1)', sid, k1, n);
  for (const n of ['יובל גולן', 'כפיר דהן', 'לירון אזולאי']) run('INSERT INTO students(school_id,class_id,name,health) VALUES(?,?,?,1)', sid, k2, n);
  run('INSERT INTO lessons_sched(school_id,teacher_id,day,period,start,end,class_id,place) VALUES(?,?,?,?,?,?,?,?)', sid, t1, 0, 1, '08:00', '08:45', k1, 'אולם');
  run('INSERT INTO facilities(school_id,day,period,facility,teacher_name,kind) VALUES(?,?,?,?,?,?)', sid, 0, 1, 'אולם ספורט', 'דנה כהן', 'fixed');
  void bt1; void bt2;
  const sf = path.join(__dirname, 'seed-users.json'); // התקנות מותאמות (לדוגמה פריסה): סיסמאות ומשתמשים נוספים
  const extra = process.env.SEED_USERS ? JSON.parse(process.env.SEED_USERS) : fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : [];
  for (const u of extra) {
    if (one('SELECT 1 x FROM users WHERE username=?', u.username)) run('UPDATE users SET pass=? WHERE username=?', hash(u.password), u.username);
    else mk(u.username, u.password, u.name, u.role);
  }
}
seed();
if (require.main === module) server.listen(PORT, () => console.log('יומן חנ״ג חכם: http://localhost:' + PORT));
module.exports = server; // ברירת המחדל היא השרת עצמו (נדרש ל־Vercel)
module.exports.server = server;
module.exports.calcGrade = calcGrade;
