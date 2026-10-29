// מרכז התראות + הדרכת התחלה
module.exports = (api) => {
  const { R, all, one, run, db, HttpErr } = api;
  db.exec(`
CREATE TABLE IF NOT EXISTS notif_read(user_id INT, key TEXT, at TEXT, PRIMARY KEY(user_id,key));
CREATE TABLE IF NOT EXISTS tour_state(user_id INTEGER PRIMARY KEY, tour_done INT DEFAULT 0, at TEXT);
`);
  const SEV = { high: 0, med: 1, low: 2 };

  function compute(u) {
    const out = [];
    const classes = u.role === 'teacher'
      ? all('SELECT * FROM classes WHERE school_id=? AND teacher_id=?', u.school_id, u.id)
      : u.role === 'examiner' ? [] : all('SELECT * FROM classes WHERE school_id=?', u.school_id);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const iso = (d) => d.toISOString().slice(0, 10);
    for (const k of classes) {
      const tests = all("SELECT id FROM tests WHERE school_id=? AND bagrut=0 AND (track=? OR track='') AND (grade_level=? OR grade_level='')", k.school_id, k.track, k.grade_level);
      const studs = all('SELECT * FROM students WHERE class_id=? ORDER BY name', k.id);
      for (const s of studs) {
        const link = '#/student/' + s.id;
        if (tests.length) {
          const done = one(`SELECT COUNT(DISTINCT test_id) n FROM results WHERE student_id=? AND test_id IN (${tests.map(() => '?').join(',')})`, s.id, ...tests.map((t) => t.id)).n;
          const miss = tests.length - done;
          if (miss > 0 && !s.exempt) out.push({ id: 'missing:' + s.id, type: 'missing', severity: 'med', title: s.name, body: `${k.name} · חסרים ${miss} מבדקים מתוך ${tests.length}`, link });
        }
        if (s.exempt && s.exempt_until) {
          const d = new Date(s.exempt_until + 'T00:00:00');
          if (!isNaN(d)) {
            const days = Math.round((d - today) / 864e5);
            if (days < 0) out.push({ id: 'exempt:' + s.id, type: 'exempt', severity: 'high', title: s.name, body: `${k.name} · הפטור פג לפני ${-days} ימים`, link });
            else if (days <= 14) out.push({ id: 'exempt:' + s.id, type: 'exempt', severity: 'med', title: s.name, body: `${k.name} · הפטור מסתיים בעוד ${days} ימים`, link });
          }
        }
        if (!s.health) out.push({ id: 'health:' + s.id, type: 'health', severity: 'high', title: s.name, body: `${k.name} · חסרה הצהרת בריאות`, link });
      }
    }
    if (u.role !== 'examiner') {
      const lim = iso(new Date(Date.now() - 7 * 864e5));
      const subs = u.role === 'teacher'
        ? all('SELECT * FROM subs WHERE school_id=? AND teacher_id=? AND reported=0 AND date<? ORDER BY date', u.school_id, u.id, lim)
        : all('SELECT * FROM subs WHERE school_id=? AND reported=0 AND date<? ORDER BY date', u.school_id, lim);
      for (const b of subs) out.push({ id: 'sub:' + b.id, type: 'sub', severity: 'med', title: 'מילוי מקום לא דווח', body: `${b.date}${b.class_name ? ' · ' + b.class_name : ''} · ${b.hours} שעות`, link: '#/subs' });
    }
    return out.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  }

  const withRead = (u) => {
    const read = new Set(all('SELECT key FROM notif_read WHERE user_id=?', u.id).map((r) => r.key));
    const items = compute(u).map((n) => ({ ...n, read: read.has(n.id) }));
    return { items, unread: items.filter((n) => !n.read).length };
  };

  R('GET', '/api/notifications', (c) => withRead(c.u));
  R('GET', '/api/notifications/count', (c) => ({ unread: withRead(c.u).unread }));
  R('POST', '/api/notifications/read', (c) => {
    const keys = Array.isArray(c.body.ids) ? c.body.ids : [];
    if (!keys.length) throw new HttpErr(400, 'חסרות התראות');
    for (const k of keys) run('INSERT OR REPLACE INTO notif_read(user_id,key,at) VALUES(?,?,?)', c.u.id, String(k), api.now());
    return { ok: true };
  });
  R('POST', '/api/notifications/read-all', (c) => {
    for (const n of compute(c.u)) run('INSERT OR REPLACE INTO notif_read(user_id,key,at) VALUES(?,?,?)', c.u.id, n.id, api.now());
    return { ok: true };
  });
  R('POST', '/api/notifications/unread', (c) => {
    for (const k of c.body.ids || []) run('DELETE FROM notif_read WHERE user_id=? AND key=?', c.u.id, String(k));
    return { ok: true };
  });
  R('GET', '/api/tour', (c) => ({ done: !!one('SELECT 1 x FROM tour_state WHERE user_id=? AND tour_done=1', c.u.id) }));
  R('POST', '/api/tour', (c) => {
    if (c.body.reset) run('DELETE FROM tour_state WHERE user_id=?', c.u.id);
    else run('INSERT OR REPLACE INTO tour_state(user_id,tour_done,at) VALUES(?,1,?)', c.u.id, api.now());
    return { ok: true };
  });
};
