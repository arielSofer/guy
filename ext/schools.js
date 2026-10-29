// ניהול בתי ספר (super בלבד) + משתמשי יומן ביקורת
module.exports = (api) => {
  const { R, run, all, one, need, HttpErr, audit, hash, roleRank } = api;
  const sup = (c) => need(c.u.role === 'super', 'ממשק זה מיועד למנהל מערכת ראשי בלבד');
  const nameOf = (b) => { const n = String(b.name || '').trim(); if (!n) throw new HttpErr(400, 'חסר שם בית ספר'); if (n.length > 80) throw new HttpErr(400, 'שם ארוך מדי'); return n; };
  const schoolOf = (id) => { const s = one('SELECT * FROM schools WHERE id=?', id); if (!s) throw new HttpErr(404, 'בית ספר לא נמצא'); return s; };
  const withCounts = (s) => ({ ...s, users: one('SELECT COUNT(*) n FROM users WHERE school_id=?', s.id).n, classes: one('SELECT COUNT(*) n FROM classes WHERE school_id=?', s.id).n });

  R('GET', '/api/schools', (c) => { sup(c); return all('SELECT * FROM schools ORDER BY id').map(withCounts); });
  R('POST', '/api/schools', (c) => {
    sup(c); const name = nameOf(c.body);
    const id = Number(run('INSERT INTO schools(name) VALUES(?)', name).lastInsertRowid);
    audit(c.u, 'school.create', { id, name });
    return { id };
  });
  R('PUT', '/api/schools/:id', (c) => {
    sup(c); const s = schoolOf(c.p.id); const name = nameOf(c.body);
    run('UPDATE schools SET name=? WHERE id=?', name, s.id);
    audit(c.u, 'school.rename', { id: s.id, from: s.name, to: name });
    return { ok: true };
  });
  R('DELETE', '/api/schools/:id', (c) => {
    sup(c); const s = withCounts(schoolOf(c.p.id));
    if (s.users || s.classes) throw new HttpErr(409, 'לא ניתן למחוק בית ספר שיש בו משתמשים או כיתות');
    run('DELETE FROM settings WHERE school_id=?', s.id);
    run('DELETE FROM schools WHERE id=?', s.id);
    audit(c.u, 'school.delete', { id: s.id, name: s.name });
    return { ok: true };
  });
  R('GET', '/api/schools/:id/users', (c) => {
    sup(c); schoolOf(c.p.id);
    return all('SELECT id,name,username,role FROM users WHERE school_id=? ORDER BY id', c.p.id);
  });
  R('POST', '/api/schools/:id/admin', (c) => {
    sup(c); const s = schoolOf(c.p.id); const b = c.body;
    const name = String(b.name || '').trim(), username = String(b.username || '').trim();
    if (!name || !username || !b.password) throw new HttpErr(400, 'חסרים פרטים');
    if (String(b.password).length < 6) throw new HttpErr(400, 'סיסמה קצרה מדי (לפחות 6 תווים)');
    if (one('SELECT 1 x FROM users WHERE username=?', username)) throw new HttpErr(409, 'שם משתמש קיים');
    const id = Number(run('INSERT INTO users(school_id,username,pass,name,role) VALUES(?,?,?,?,?)', s.id, username, hash(String(b.password)), name, 'school_admin').lastInsertRowid);
    audit(c.u, 'user.create', { id, name, role: 'school_admin', school: s.name, school_id: s.id });
    return { id };
  });
  R('GET', '/api/audit/users', (c) => {
    need(roleRank[c.u.role] >= 3);
    const m = {}; for (const u of all('SELECT id,name FROM users WHERE school_id=?', c.u.school_id)) m[u.id] = u.name;
    return m;
  });
};
