(function () {
  const P = window.PEJ; const { S, routes, shell, get, post, put, del, guard, toast, esc, $, $$, modal, confirmBox } = P;
  const st = document.createElement('style');
  st.textContent = `.sch-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.sch-meta .badge{white-space:nowrap}
.au-chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.au-chips button{min-height:36px;padding:4px 12px;border-radius:18px;font-size:14px}
.au-chips button.on{background:#12306b;color:#fff;border-color:#12306b}
.au-it{overflow-wrap:anywhere}.au-it .au-h{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.au-it .au-d{margin-top:4px;font-size:14px}.au-it .sub{margin-top:2px}`;
  document.head.appendChild(st);

  const prev = P.hooks.settingsLinks;
  P.hooks.settingsLinks = () => {
    const r = S.user && S.user.role;
    const lk = (h, t) => `<a class="card" href="#/${h}" style="display:block;text-decoration:none;color:inherit">${t}</a>`;
    return (typeof prev === 'function' ? prev() : (prev || '')) + (r === 'super' ? lk('schools', 'ניהול בתי ספר') : '') + (r === 'super' || r === 'school_admin' ? lk('audit', 'יומן פעולות') : '');
  };

  const ROLE = { super: 'מנהל ראשי', school_admin: 'מנהל בית ספר', teacher: 'מורה', examiner: 'בוחן' };

  routes.schools = async () => {
    if (!S.user || S.user.role !== 'super') { shell('בתי ספר', '<div class="card empty">אין הרשאה</div>', { back: '#/settings' }); return; }
    const list = await get('/api/schools');
    shell('בתי ספר', `${list.map((s) => `<div class="card" data-s="${s.id}"><div class="row sp"><b>${esc(s.name)}</b><span class="sub">מס׳ ${s.id}</span></div>
      <div class="sch-meta"><span class="badge">${s.users} משתמשים</span><span class="badge">${s.classes} כיתות</span></div>
      <div class="row" style="margin-top:10px"><button class="sm us">משתמשים</button><button class="sm ad">הוספת מנהל</button><button class="sm rn">שינוי שם</button><button class="sm dng dl">מחיקה</button></div><div class="usl"></div></div>`).join('')}
    <div class="card"><label for="sn">בית ספר חדש</label><input id="sn" placeholder="שם בית הספר"><button class="pri big" id="sa" style="margin-top:12px">הוספה</button></div>`, { back: '#/settings' });
    $('#sa').onclick = guard(async () => { await post('/api/schools', { name: $('#sn').value }); toast('נוצר'); routes.schools(); });
    $$('[data-s]').forEach((card) => {
      const id = +card.dataset.s; const s = list.find((x) => x.id === id);
      $('.us', card).onclick = guard(async () => {
        const box = $('.usl', card); if (box.innerHTML) { box.innerHTML = ''; return; }
        const us = await get(`/api/schools/${id}/users`);
        box.innerHTML = us.length ? us.map((u) => `<div class="row sp" style="margin-top:8px"><span>${esc(u.name)} <span class="sub">${esc(u.username)}</span></span><span class="badge">${ROLE[u.role] || esc(u.role)}</span></div>`).join('') : '<div class="sub" style="margin-top:8px">אין משתמשים</div>';
      });
      $('.ad', card).onclick = () => {
        const m = modal(`<h3>מנהל בית ספר חדש</h3><div class="sub">${esc(s.name)}</div><label for="an">שם</label><input id="an"><label for="au">שם משתמש</label><input id="au" autocapitalize="off"><label for="ap">סיסמה</label><input id="ap" type="password"><button class="pri big" id="as" style="margin-top:14px">יצירה</button>`);
        $('#as', m).onclick = guard(async () => { await post(`/api/schools/${id}/admin`, { name: $('#an', m).value, username: $('#au', m).value, password: $('#ap', m).value }); m.remove(); toast('המנהל נוצר'); routes.schools(); });
      };
      $('.rn', card).onclick = () => {
        const m = modal(`<h3>שינוי שם</h3><label for="rn">שם</label><input id="rn" value="${esc(s.name)}"><button class="pri big" id="rs" style="margin-top:14px">שמירה</button>`);
        $('#rs', m).onclick = guard(async () => { await put('/api/schools/' + id, { name: $('#rn', m).value }); m.remove(); toast('נשמר'); routes.schools(); });
      };
      $('.dl', card).onclick = guard(async () => { if (await confirmBox(`למחוק את ${s.name}?`, 'מחק', true)) { await del('/api/schools/' + id); toast('נמחק'); routes.schools(); } });
    });
  };

  const NAMES = { 'class.delete': 'מחיקת כיתה', 'student.delete': 'מחיקת תלמיד', 'test.delete': 'מחיקת מבדק', 'test.recalibrate': 'כיול מחדש של מבדק', 'bagrut.toggle': 'שינוי מוד בגרות', 'school.create': 'יצירת בית ספר', 'school.rename': 'שינוי שם בית ספר', 'school.delete': 'מחיקת בית ספר', 'user.create': 'יצירת משתמש' };
  const KEYS = { id: 'מזהה', name: 'שם', from: 'מ', to: 'ל', role: 'תפקיד', school: 'בית ספר', school_id: 'מס׳ בית ספר', on: 'מצב' };
  const prefName = { class: 'כיתות', student: 'תלמידים', test: 'מבדקים', bagrut: 'בגרות', school: 'בתי ספר', user: 'משתמשים' };
  const detail = (a, d) => {
    if (a === 'bagrut.toggle') return 'מוד בגרות ' + (d.on ? 'הופעל' : 'כובה');
    if (a === 'test.recalibrate') return `מבדק ${d.id}: גרסה ${d.from || '—'} ← ${d.to || '—'}`;
    if (a === 'school.rename') return `${d.from} ← ${d.to}`;
    if (a === 'school.create' || a === 'school.delete') return d.name || '';
    if (a === 'user.create') return `${d.name || ''} (${ROLE[d.role] || d.role || ''})${d.school ? ' · ' + d.school : ''}`;
    if (a.endsWith('.delete')) return 'מזהה ' + d.id;
    return Object.entries(d).map(([k, v]) => `${KEYS[k] || k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  };
  const when = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  routes.audit = async (parts, q) => {
    if (!S.user || !['super', 'school_admin'].includes(S.user.role)) { shell('יומן פעולות', '<div class="card empty">אין הרשאה</div>', { back: '#/settings' }); return; }
    const [rows, users] = await Promise.all([get('/api/audit'), get('/api/audit/users')]);
    rows.forEach((r) => { try { r.d = JSON.parse(r.detail || '{}'); } catch { r.d = {}; } });
    const pref = [...new Set(rows.map((r) => r.action.split('.')[0]))];
    let f = '';
    const draw = () => {
      const shown = rows.filter((r) => !f || r.action.split('.')[0] === f);
      $('#auc').innerHTML = `<button data-f="" class="${f ? '' : 'on'}">הכול</button>` + pref.map((p) => `<button data-f="${esc(p)}" class="${f === p ? 'on' : ''}">${prefName[p] || esc(p)}</button>`).join('');
      $('#aul').innerHTML = shown.length ? shown.map((r) => `<div class="card au-it"><div class="au-h"><b>${esc(NAMES[r.action] || r.action)}</b><span class="sub">${esc(when(r.at))}</span></div><div class="au-d">${esc(detail(r.action, r.d))}</div><div class="sub">${esc(users[r.user_id] || 'משתמש לא ידוע')}</div></div>`).join('') : '<div class="card empty">אין פעולות להצגה</div>';
      $$('#auc button').forEach((b) => (b.onclick = () => { f = b.dataset.f; draw(); }));
    };
    shell('יומן פעולות', '<div class="au-chips" id="auc"></div><div id="aul"></div>', { back: '#/settings' });
    draw();
  };
})();
