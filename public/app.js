// יומן חנ״ג חכם — לקוח (SPA, hash routing)
window.PEJ = { hooks: {}, sound: null };
const $app = document.getElementById('app');
const S = { token: localStorage.getItem('pej_token'), user: null, school: null, bagrut: false, dirty: null };
const IC = { home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', cal: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01', cap: 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.500 6-3v-4.500', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.200l2-1.500-2-3.400-2.300.9a7 7 0 0 0-2-1.200L14 3h-4l-.6 2.600a7 7 0 0 0-2 1.200l-2.300-.9-2 3.400 2 1.500A7 7 0 0 0 5 12c0 .4 0 .8.1 1.200l-2 1.500 2 3.400 2.300-.9a7 7 0 0 0 2 1.200L10 21h4l.6-2.600a7 7 0 0 0 2-1.200l2.300.9 2-3.400-2-1.500c.1-.4.1-.8.1-1.200z', back: 'M9 5l7 7-7 7', swap: 'M4 8h13l-3-3M20 16H7l3 3', pin: 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', book: 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h12' };
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[n]}"/></svg>`;
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
const STATUS = { pending: 'ממתין', done: 'הושלם', incomplete: 'להשלמה', unexcused: 'לא בוצע ללא הצדקה', exempt: 'פטור', na: 'לא רלוונטי', excluded: 'לא נכלל' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 2600); }
async function api(method, url, body) {
  let res;
  try { res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch { const e = new Error('אין חיבור לשרת'); e.net = true; throw e; }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && S.token) { logoutLocal(); throw new Error('נדרשת התחברות'); }
  if (!res.ok) { const e = new Error(data.error || 'שגיאה'); e.status = res.status; throw e; }
  return data;
}
const get = (u) => api('GET', u), post = (u, b) => api('POST', u, b || {}), put = (u, b) => api('PUT', u, b), del = (u) => api('DELETE', u);
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
function logoutLocal() { S.token = null; S.user = null; localStorage.removeItem('pej_token'); location.hash = '#/login'; }
const fmtTime = (s) => { if (s == null) return '—'; const m = Math.floor(s / 60), x = (s - m * 60).toFixed(1); return m ? `${m}:${x.padStart(4, '0')}` : x; };

function confirmBox(msg, okLabel = 'אישור', danger) {
  return new Promise((res) => {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div><h3>${esc(msg)}</h3><div class="row" style="margin-top:16px"><button class="${danger ? 'dng' : 'pri'}" id="cOk" style="flex:1">${okLabel}</button><button id="cNo" style="flex:1">ביטול</button></div></div>`;
    document.body.appendChild(m); $('#cOk', m).onclick = () => { m.remove(); res(true); }; $('#cNo', m).onclick = () => { m.remove(); res(false); };
  });
}
function modal(html) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div>${html}</div>`; m.addEventListener('click', (e) => { if (e.target === m) m.remove(); }); document.body.appendChild(m); return m; }

// ---------- מסגרת ----------
function shell(title, body, { back, nav = true, actions = '' } = {}) {
  const r = location.hash.split('?')[0];
  const link = (h, ic, t, m) => `<a href="#/${h}" class="${m ? 'on' : ''}" data-nav="${h}"><span>${ic}</span>${t}</a>`;
  const hk = window.PEJ.hooks;
  $app.innerHTML = `<header class="top">${back ? `<button class="icon sm" id="back" aria-label="חזרה">${ic('back')}</button>` : ''}<h1>${esc(title)}</h1>${actions}${hk.header ? hk.header() : ''}${S.user ? `<button class="icon sm" id="goSettings" aria-label="הגדרות">${ic('gear')}</button>` : ''}</header>${body}` +
    (nav && S.user ? `<nav class="bar">${link('home', ic('home'), 'ראשי', r === '#/home')}${link('schedule', ic('cal'), 'מערכת', r.startsWith('#/schedule'))}${link('tests', ic('list'), 'מבדקים', r.startsWith('#/tests'))}${S.bagrut ? link('bagrut', ic('cap'), 'בגרות', r.startsWith('#/bagrut')) : ''}${link('reports', ic('chart'), 'דוחות', r.startsWith('#/reports'))}</nav>` : '');
  if (hk.afterShell) hk.afterShell(r);
  if (back) $('#back').onclick = () => (typeof back === 'string' ? (location.hash = back) : history.back());
  const gs = $('#goSettings'); if (gs) gs.onclick = () => (location.hash = '#/settings');
}

// ---------- ניתוב ----------
const routes = {};
async function router() {
  if (S.dirty && !S.dirtyOk) { /* מנוהל בנפרד */ }
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/'); const q = Object.fromEntries(new URLSearchParams(qs || ''));
  if (!S.token && parts[0] !== 'login') return (location.hash = '#/login');
  if (S.token && !S.user) { try { const me = await get('/api/me'); S.user = me.user; S.school = me.school; S.bagrut = me.bagrut_on; } catch { return; } }
  if (parts[0] === 'login' && S.token) return (location.hash = '#/home');
  const fn = routes[parts[0] || 'home'] || routes.home;
  try { await fn(parts.slice(1), q); } catch (e) { shell('שגיאה', `<div class="card empty" id="err">${esc(e.message)}</div>`, { back: '#/home' }); }
}
window.addEventListener('hashchange', async (e) => {
  if (S.dirty && !(await confirmBox('יש נתונים שלא נשמרו. לצאת בכל זאת?', 'צא', true))) { history.replaceState(null, '', e.oldURL.split('#')[1] ? '#' + e.oldURL.split('#')[1] : '#/home'); return; }
  S.dirty = null; clearInterval(S.tick); router();
});
window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- התחברות ----------
routes.login = async () => {
  $app.innerHTML = `<div class="login card"><h1 style="text-align:center">יומן חנ״ג חכם</h1><p class="sub" style="text-align:center">התחברות למערכת</p>
  <label for="u">שם משתמש</label><input id="u" dir="ltr" style="text-align:left" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false"><label for="p">סיסמה</label><div class="row"><input id="p" type="password" dir="ltr" style="text-align:left" autocomplete="current-password"><button type="button" class="sm" id="showp" aria-label="הצג תווים">הצג</button></div>
  <button class="pri big" id="go" style="margin-top:16px">התחבר</button></div>`;
  $('#go').onclick = guard(async () => {
    const r = await post('/api/login', { username: $('#u').value.trim(), password: $('#p').value });
    S.token = r.token; localStorage.setItem('pej_token', r.token); S.user = null; location.hash = '#/home'; if (!location.hash.includes('home')) router();
  });
  $('#showp').onclick = () => { const p = $('#p'); const h = p.type === 'password'; p.type = h ? 'text' : 'password'; $('#showp').textContent = h ? 'הסתר' : 'הצג'; };
  $('#p').onkeydown = (e) => { if (e.key === 'Enter') $('#go').click(); };
};

// ---------- מסך הבית ----------
routes.home = async () => {
  const [classes, cur, rep] = await Promise.all([get('/api/classes'), get('/api/current-lesson'), get('/api/reports/overview')]);
  const levels = [...new Set(classes.map((c) => c.grade_level).filter(Boolean))];
  const f = S.homeFilter || '';
  const shown = classes.filter((c) => !f || c.grade_level === f);
  const hour = cur.current ? `<div class="card click" id="curCard" data-id="${cur.current.class_id}"><div class="row sp"><b>שיעור נוכחי: ${esc(cur.current.class_name || '—')}</b><span class="badge ok">${cur.current.start}–${cur.current.end}</span></div>${cur.next ? `<div class="sub">הבא: ${esc(cur.next.class_name || '—')} ${cur.next.start}</div>` : ''}</div>` :
    `<div class="card"><b>אין שיעור כרגע</b>${cur.next ? `<div class="sub">השיעור הבא: ${esc(cur.next.class_name || '—')} ב־${cur.next.start}</div>` : '<div class="sub">סיום יום הלימודים</div>'}</div>`;
  shell('שלום, ' + S.user.name, `${hour}
  <div class="stats"><div class="card stat"><b id="sClasses">${rep.classes}</b>כיתות</div><div class="card stat"><b id="sStudents">${rep.students}</b>תלמידים</div><div class="card stat"><b>${rep.year ?? '—'}</b>ממוצע שנתי</div><div class="card stat"><b>${rep.missing}</b>עם חוסרים</div></div>
  <div class="row sp"><h2>הכיתות שלי</h2><div class="row"><button class="sm" id="addClass">+ כיתה</button></div></div>
  <div class="chips" id="lvl"><button class="chip ${f ? '' : 'on'}" data-l="">הכל</button>${levels.map((l) => `<button class="chip ${f === l ? 'on' : ''}" data-l="${esc(l)}">${esc(l)}</button>`).join('')}</div>
  ${shown.length ? `<div class="grid" id="classList">${shown.map((c) => `<div class="card click" data-class="${c.id}"><div class="row sp"><b>${esc(c.name)}</b><span class="badge">${c.count} תלמידים</span></div><div class="sub">${esc(c.grade_level)} · ${esc(c.track)}${c.combined ? ' · משולבת' : ''}</div></div>`).join('')}</div>` : `<div class="card empty" id="emptyClasses">עדיין אין כיתות.<br><br><button class="pri" id="addClass2">הוספת כיתה ראשונה</button></div>`}
  <h2>כלים</h2><div class="grid"><a class="card click tool" href="#/subs">${ic('swap')}<span>מילויי מקום</span></a><a class="card click tool" href="#/facilities">${ic('pin')}<span>חלוקת מתקנים</span></a><a class="card click tool" href="#/journal">${ic('book')}<span>יומן שיעורים</span></a></div>`);
  $$('#lvl .chip').forEach((b) => (b.onclick = () => { S.homeFilter = b.dataset.l; routes.home(); }));
  $$('[data-class]').forEach((e) => (e.onclick = () => (location.hash = '#/class/' + e.dataset.class)));
  const cc = $('#curCard'); if (cc && cc.dataset.id) cc.onclick = () => (location.hash = '#/class/' + cc.dataset.id);
  [$('#addClass'), $('#addClass2')].forEach((b) => b && (b.onclick = () => classForm()));
};
function classForm(c = {}) {
  const m = modal(`<h3>${c.id ? 'עריכת כיתה' : 'כיתה חדשה'}</h3><label for="cn">שם כיתה</label><input id="cn" value="${esc(c.name)}">
  <label for="cg">שכבה</label><select id="cg">${['ז׳', 'ח׳', 'ט׳', 'י׳', 'י״א', 'י״ב'].map((g) => `<option ${c.grade_level === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
  <label for="ct">מסלול</label><select id="ct"><option ${c.track === 'בנים' ? 'selected' : ''}>בנים</option><option ${c.track === 'בנות' ? 'selected' : ''}>בנות</option></select>
  <label class="row"><input type="checkbox" id="cm" ${c.combined ? 'checked' : ''}> כיתה משולבת</label>
  <div class="row" style="margin-top:14px"><button class="pri" id="cs" style="flex:1">שמירה</button>${c.id ? '<button class="dng" id="cd">מחיקה</button>' : ''}</div>`);
  $('#cs', m).onclick = guard(async () => {
    const b = { name: $('#cn', m).value, grade_level: $('#cg', m).value, track: $('#ct', m).value, combined: $('#cm', m).checked };
    c.id ? await put('/api/classes/' + c.id, b) : await post('/api/classes', b); m.remove(); toast('נשמר'); router();
  });
  if (c.id) $('#cd', m).onclick = guard(async () => { if (await confirmBox(`למחוק את הכיתה ${c.name} וכל התלמידים בה?`, 'מחק', true)) { await del('/api/classes/' + c.id); m.remove(); toast('נמחק'); location.hash = '#/home'; } });
}

// ---------- כיתה ותלמידים ----------
routes.class = async ([id]) => {
  const q = S.studentQ || '';
  const [students, classes] = await Promise.all([get(`/api/classes/${id}/students?q=${encodeURIComponent(q)}`), get('/api/classes')]);
  const k = classes.find((c) => c.id == id); if (!k) throw new Error('כיתה לא נמצאה');
  shell(k.name, `<div class="row" style="flex-wrap:wrap;margin-bottom:10px"><button class="sm pri" id="gb">יומן ציונים</button><button class="sm" id="lr">ריצה ארוכה</button><button class="sm" id="sr">ריצה קצרה</button><button class="sm" id="ed">עריכה</button></div>
  <div class="row"><input id="sq" placeholder="חיפוש תלמיד" value="${esc(q)}"><button class="icon" id="addSt" aria-label="הוספת תלמיד">+</button></div>
  <div style="height:10px"></div>${students.length ? students.map((s) => `<div class="card student click" data-st="${s.id}"><div class="nm">${esc(s.name)}${s.exempt ? ' <span class="badge warn">פטור</span>' : ''}${!s.health ? ' <span class="badge err">חסרה הצהרת בריאות</span>' : ''}</div>${s.missing ? `<span class="badge warn">${s.missing} חסרים</span>` : ''}<span class="grade">${s.year ?? '—'}</span></div>`).join('') : '<div class="card empty" id="noStudents">אין תלמידים בכיתה</div>'}
  <button class="big" id="imp">ייבוא תלמידים</button>`, { back: '#/home' });
  $('#gb').onclick = () => (location.hash = '#/gradebook/' + id); $('#lr').onclick = () => (location.hash = '#/liverun/' + id); $('#sr').onclick = () => (location.hash = '#/sprint/' + id);
  $('#ed').onclick = () => classForm(k);
  $('#sq').oninput = (e) => { S.studentQ = e.target.value; clearTimeout(S.sqT); S.sqT = setTimeout(() => routes.class([id]).then(() => { const i = $('#sq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 250); };
  $$('[data-st]').forEach((e) => (e.onclick = () => (location.hash = '#/student/' + e.dataset.st)));
  $('#addSt').onclick = () => { const m = modal(`<h3>תלמיד חדש</h3><label for="sn">שם</label><input id="sn"><label for="sh">כיתת אם</label><input id="sh"><button class="pri big" id="ss" style="margin-top:14px">שמירה</button>`); $('#ss', m).onclick = guard(async () => { await post('/api/students', { class_id: +id, name: $('#sn', m).value, home_class: $('#sh', m).value }); m.remove(); toast('נוסף'); routes.class([id]); }); };
  $('#imp').onclick = () => { const m = modal(`<h3>ייבוא תלמידים</h3><p class="sub">העלה קובץ CSV / Excel, או הדבק שם בכל שורה (אפשר עמודה שנייה: כיתת אם)</p>
    <label class="btn" for="ifile" style="width:100%;margin-bottom:8px">בחירת קובץ (CSV / Excel / TXT)</label><input id="ifile" type="file" accept=".csv,.txt,.xlsx,.xls,text/csv" style="display:none">
    <div class="sub" id="ifn"></div><textarea id="it" placeholder="אבי לוי&#10;בן כהן"></textarea><div class="sub" id="icnt"></div><button class="pri big" id="is" style="margin-top:14px">ייבוא</button>`);
    const cnt = () => { const n = $('#it', m).value.split(/\r?\n/).filter((l) => l.trim()).length; $('#icnt', m).textContent = n ? `${n} שורות לייבוא` : ''; };
    $('#it', m).oninput = cnt;
    $('#ifile', m).onchange = guard(async (e) => {
      const f = e.target.files[0]; if (!f) return; $('#ifn', m).textContent = f.name;
      if (/\.xlsx?$/i.test(f.name)) {
        const b64 = btoa(new Uint8Array(await f.arrayBuffer()).reduce((s, x) => s + String.fromCharCode(x), ''));
        $('#it', m).value = (await post('/api/parse-sheet', { name: f.name, data_base64: b64 })).text;
      } else {
        const buf = await f.arrayBuffer(); let t = new TextDecoder('utf-8').decode(buf);
        if (t.includes('\ufffd')) t = new TextDecoder('windows-1255').decode(buf); // קבצי CSV ישנים מ‑Excel בעברית
        $('#it', m).value = t.replace(/^\ufeff/, '');
      }
      cnt();
    });
    $('#is', m).onclick = guard(async () => { const r = await post(`/api/classes/${id}/import`, { text: $('#it', m).value }); m.remove(); toast(`נוספו ${r.added}, דולגו ${r.skipped}`); routes.class([id]); }); };
};
routes.student = async ([id]) => {
  const s = await get('/api/students/' + id);
  shell(s.name, `<div class="card"><div class="stats"><div class="stat"><b>${s.h1 ?? '—'}</b>מחצית א׳</div><div class="stat"><b>${s.h2 ?? '—'}</b>מחצית ב׳</div><div class="stat"><b>${s.year ?? '—'}</b>שנתי</div></div></div>
  <div class="card"><label for="en">שם</label><input id="en" value="${esc(s.name)}"><label for="eh">כיתת אם</label><input id="eh" value="${esc(s.home_class)}">
  <label class="row"><input type="checkbox" id="ehl" ${s.health ? 'checked' : ''}> הצהרת בריאות קיימת</label><label class="row"><input type="checkbox" id="eex" ${s.exempt ? 'checked' : ''}> פטור מחינוך גופני</label>
  <label for="eu">תוקף פטור זמני</label><input type="date" id="eu" value="${esc(s.exempt_until)}"><div class="row" style="margin-top:12px"><button class="pri" id="sv" style="flex:1">שמירה</button><button class="dng" id="dl">מחיקה</button></div></div>
  <h2>תוצאות</h2>${s.results.length ? s.results.map((r) => `<div class="card row sp"><div><b>${esc(r.tname)}</b><div class="sub">מחצית ${r.half} · ${STATUS[r.status]} · ${r.attempts} ניסיונות</div></div><div><span class="grade">${r.grade ?? '—'}</span><div class="sub">${r.raw ?? ''} ${esc(r.unit)}</div></div></div>`).join('') : '<div class="card empty">אין תוצאות</div>'}`, { back: true });
  $('#sv').onclick = guard(async () => { await put('/api/students/' + id, { name: $('#en').value, home_class: $('#eh').value, health: $('#ehl').checked ? 1 : 0, exempt: $('#eex').checked ? 1 : 0, exempt_until: $('#eu').value }); toast('נשמר'); routes.student([id]); });
  $('#dl').onclick = guard(async () => { if (await confirmBox(`למחוק את ${s.name} וכל תוצאותיו?`, 'מחק', true)) { await del('/api/students/' + id); toast('נמחק'); history.back(); } });
};

// ---------- קטלוג מבדקים ----------
routes.tests = async () => {
  const f = S.tf || {};
  const qs = new URLSearchParams({ regular: 1, ...(f.g ? { grade_level: f.g } : {}), ...(f.t ? { track: f.t } : {}) });
  const tests = await get('/api/tests?' + qs);
  shell('מבדקים', `<div class="chips" id="fg">${['', 'ז׳', 'ח׳', 'ט׳', 'י׳', 'י״א', 'י״ב'].map((g) => `<button class="chip ${(f.g || '') === g ? 'on' : ''}" data-g="${g}">${g || 'כל השכבות'}</button>`).join('')}</div>
  <div class="chips" id="ft">${['', 'בנים', 'בנות'].map((t) => `<button class="chip ${(f.t || '') === t ? 'on' : ''}" data-t="${t}">${t || 'שני המסלולים'}</button>`).join('')}</div>
  <div class="row" style="margin-bottom:10px"><button class="pri" id="nt" style="flex:1">+ מבדק חדש</button><button id="ex">ייצוא</button><button id="im">ייבוא</button></div>
  ${tests.length ? `<div class="grid">${tests.map((t) => `<div class="card click" data-t="${t.id}"><div class="row sp"><b>${esc(t.name)}</b><span class="badge">${esc(t.version)}</span></div><div class="sub">${esc(t.grade_level)} · ${esc(t.track)} · ${esc(t.unit)}</div></div>`).join('')}</div>` : '<div class="card empty">אין מבדקים תואמים</div>'}`);
  $$('#fg .chip').forEach((b) => (b.onclick = () => { S.tf = { ...f, g: b.dataset.g }; routes.tests(); }));
  $$('#ft .chip').forEach((b) => (b.onclick = () => { S.tf = { ...f, t: b.dataset.t }; routes.tests(); }));
  $$('[data-t].card').forEach((e) => (e.onclick = () => testForm(tests.find((t) => t.id == e.dataset.t))));
  $('#nt').onclick = () => testForm();
  $('#ex').onclick = guard(async () => { const d = await get('/api/tests/export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' })); a.download = 'tests.json'; a.click(); toast('יוצאו ' + d.length + ' מבדקים'); });
  $('#im').onclick = () => { const m = modal(`<h3>ייבוא מבדקים (JSON)</h3><textarea id="ij"></textarea><button class="pri big" id="ii" style="margin-top:14px">ייבוא</button>`); $('#ii', m).onclick = guard(async () => { let t; try { t = JSON.parse($('#ij', m).value); } catch { throw new Error('JSON לא תקין'); } const r = await post('/api/tests/import', { tests: t }); m.remove(); toast('יובאו ' + r.imported); routes.tests(); }); };
};
function testForm(t = {}) {
  const conv = (t.conv && t.conv.length ? t.conv : [{ raw: '', grade: '' }]);
  const m = modal(`<h3>${t.id ? 'עריכת מבדק' : 'מבדק חדש'}</h3><label for="tn">שם</label><input id="tn" value="${esc(t.name)}">
  <div class="row"><div style="flex:1"><label for="tg">שכבה</label><select id="tg">${['ז׳', 'ח׳', 'ט׳', 'י׳', 'י״א', 'י״ב'].map((g) => `<option ${t.grade_level === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div><div style="flex:1"><label for="tt">מסלול</label><select id="tt"><option ${t.track === 'בנים' ? 'selected' : ''}>בנים</option><option ${t.track === 'בנות' ? 'selected' : ''}>בנות</option></select></div></div>
  <div class="row"><div style="flex:1"><label for="tu">יחידה</label><input id="tu" value="${esc(t.unit)}"></div><div style="flex:1"><label for="td">כיוון</label><select id="td"><option value="low" ${t.dir === 'low' ? 'selected' : ''}>נמוך עדיף (זמן)</option><option value="high" ${t.dir === 'high' ? 'selected' : ''}>גבוה עדיף</option></select></div></div>
  <label for="tk">סוג</label><select id="tk">${[['regular', 'רגיל'], ['long', 'ריצה ארוכה'], ['sprint', 'ריצה קצרה']].map(([v, l]) => `<option value="${v}" ${t.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <label>טבלת המרה (תוצאה ← ציון)</label><div id="cv">${conv.map((r) => convRow(r)).join('')}</div><button class="sm" id="ar" style="margin-top:6px">+ שורה</button>
  <div class="row" style="margin-top:14px"><button class="pri" id="tsv" style="flex:1">שמירה</button>${t.id ? '<button class="dng" id="tdl">מחיקה</button>' : ''}</div>`);
  $('#ar', m).onclick = () => $('#cv', m).insertAdjacentHTML('beforeend', convRow({}));
  const read = () => $$('#cv .row', m).map((r) => ({ raw: $('.cr', r).value, grade: $('.cg', r).value })).filter((r) => r.raw !== '' || r.grade !== '');
  $('#tsv', m).onclick = guard(async () => {
    const b = { name: $('#tn', m).value, grade_level: $('#tg', m).value, track: $('#tt', m).value, unit: $('#tu', m).value, dir: $('#td', m).value, kind: $('#tk', m).value, conv: read() };
    if (t.id) {
      try { await put('/api/tests/' + t.id, b); } catch (e) {
        if (e.status !== 409) throw e;
        const p = await post(`/api/tests/${t.id}/preview`, b);
        if (!(await confirmBox(`${e.message} ישפיע על ${p.affected} מתוך ${p.total} תוצאות. להמשיך?`, 'אשר וחשב מחדש'))) return;
        await put('/api/tests/' + t.id, { ...b, confirm_recalc: true });
      }
    } else await post('/api/tests', b);
    m.remove(); toast('נשמר'); routes.tests();
  });
  if (t.id) $('#tdl', m).onclick = guard(async () => { if (await confirmBox(`למחוק את ${t.name}?${t.used ? ' כל התוצאות יימחקו.' : ''}`, 'מחק', true)) { await del(`/api/tests/${t.id}?force=1`); m.remove(); toast('נמחק'); routes.tests(); } });
}
const convRow = (r) => `<div class="row" style="margin-bottom:6px"><input class="cr" inputmode="decimal" placeholder="תוצאה" value="${esc(r.raw)}"><input class="cg" inputmode="numeric" placeholder="ציון" value="${esc(r.grade)}"></div>`;

// ---------- יומן ציונים ----------
routes.gradebook = async ([cid], q) => {
  const classes = await get('/api/classes'); const k = classes.find((c) => c.id == cid); if (!k) throw new Error('כיתה לא נמצאה');
  const tests = (await get('/api/tests?regular=1')).filter((t) => t.track === k.track && t.grade_level === k.grade_level);
  const half = +(q.half || 1), tid = q.test || (tests[0] && tests[0].id);
  let body = `<div class="chips" id="hf">${[1, 2].map((h) => `<button class="chip ${h === half ? 'on' : ''}" data-h="${h}">מחצית ${h === 1 ? 'א׳' : 'ב׳'}</button>`).join('')}</div>`;
  if (!tests.length) body += '<div class="card empty" id="noTests">אין מבדקים לכיתה זו</div>';
  else {
    body += `<select id="tsel">${tests.map((t) => `<option value="${t.id}" ${t.id == tid ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select><div style="height:10px"></div>`;
    const g = await get(`/api/gradebook?class_id=${cid}&test_id=${tid}&half=${half}`);
    body += `<div id="rows">${g.rows.map((r) => `<div class="card student gb" data-s="${r.student_id}"><div class="nm">${esc(r.name)}<div class="sub"><span class="badge ${r.status === 'done' ? 'ok' : r.status === 'pending' ? '' : 'warn'}" data-badge>${STATUS[r.status]}</span>${r.attempts > 1 ? ` · ${r.attempts} ניסיונות` : ''}</div></div>
      <input class="raw" inputmode="decimal" aria-label="תוצאה ${esc(r.name)}" value="${r.raw ?? ''}" ${r.exempt ? 'disabled' : ''}><span class="grade" data-grade>${r.grade ?? '—'}</span>
      <select class="st" aria-label="סטטוס" style="width:62px;padding:0 4px"><option value="">⋯</option>${['incomplete', 'unexcused', 'exempt', 'na', 'excluded'].map((s) => `<option value="${s}">${STATUS[s]}</option>`).join('')}</select></div>`).join('')}</div>`;
  }
  shell('יומן ציונים · ' + k.name, body, { back: '#/class/' + cid });
  $$('#hf .chip').forEach((b) => (b.onclick = () => (location.hash = `#/gradebook/${cid}?half=${b.dataset.h}&test=${tid || ''}`)));
  const ts = $('#tsel'); if (ts) ts.onchange = () => (location.hash = `#/gradebook/${cid}?half=${half}&test=${ts.value}`);
  $$('#rows .student').forEach((row) => {
    const sid = +row.dataset.s; const inp = $('.raw', row);
    const save = guard(async (status) => {
      const body = { student_id: sid, test_id: +tid, half, status: status || 'done', raw: inp.value };
      if (!status && inp.value === '') return;
      try { const r = await post('/api/results', body); $('[data-grade]', row).textContent = r.grade ?? '—'; $('.nm .sub', row).innerHTML = `<span class="badge ${r.status === 'done' ? 'ok' : 'warn'}" data-badge>${STATUS[r.status]}</span>${r.attempts > 1 ? ` · ${r.attempts} ניסיונות` : ''}`; if (r.raw != null) inp.value = r.raw; toast('נשמר ✓'); }
      catch (e) { toast(e.net ? 'לא נשמר — אין חיבור לשרת' : e.message, true); inp.style.borderColor = 'var(--err)'; return; }
      inp.style.borderColor = '';
    });
    inp.onchange = () => save(); $('.st', row).onchange = (e) => { if (e.target.value) save(e.target.value); };
  });
};

// ---------- ריצה ארוכה ----------
routes.liverun = async ([cid]) => {
  const classes = await get('/api/classes'); const k = classes.find((c) => c.id == cid);
  const tests = (await get('/api/tests?kind=long')).filter((t) => t.track === k.track && t.grade_level === k.grade_level);
  const students = await get(`/api/classes/${cid}/students`);
  const draftKey = 'pej_live_' + cid; let draft = null; try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch {}
  const st = { running: false, t0: 0, elapsed: 0, fin: draft ? draft.fin : {}, laps: draft ? draft.laps : {}, undo: [], lapLen: 400 };
  const total = () => (st.running ? (performance.now() - st.t0) / 1000 : st.elapsed);
  const persist = () => localStorage.setItem(draftKey, JSON.stringify({ fin: st.fin, laps: st.laps }));
  const draw = () => {
    const done = Object.keys(st.fin).length;
    shell('ריצה ארוכה · ' + k.name, !tests.length ? '<div class="card empty">אין מבדק ריצה ארוכה לכיתה</div>' : `
    <div class="card"><div id="clock" class="timer">${fmtTime(total())}</div>
    <div class="row"><select id="rt">${tests.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div><div style="height:8px"></div>
    <div class="row"><button class="pri big" id="startStop">${st.running ? 'עצור' : st.elapsed ? 'המשך' : 'התחל'}</button><button class="big" id="undo" ${st.undo.length ? '' : 'disabled'}>בטל אחרון</button></div></div>
    <div class="sub" style="margin-bottom:8px">סיימו ${done} מתוך ${students.length}</div>
    ${students.map((s) => `<div class="card student" data-s="${s.id}"><div class="nm">${esc(s.name)}<div class="sub">הקפות: ${st.laps[s.id] || 0}</div></div>${st.fin[s.id] != null ? `<span class="badge ok">${fmtTime(st.fin[s.id])}</span>` : `<button class="sm lap" ${st.running ? '' : 'disabled'}>הקפה</button><button class="sm pri fin" ${st.running ? '' : 'disabled'}>סיים</button>`}</div>`).join('')}
    <button class="big pri" id="sum" ${done ? '' : 'disabled'}>סיכום ושמירה</button>`, { back: '#/class/' + cid });
    if (!tests.length) return;
    S.dirty = done > 0 || st.running ? 'live' : null;
    $('#startStop').onclick = () => { if (st.running) { st.elapsed = total(); st.running = false; } else { st.t0 = performance.now() - st.elapsed * 1000; st.running = true; PEJ.sound && PEJ.sound('go'); } draw(); };
    $('#undo').onclick = () => { const u = st.undo.pop(); if (u.type === 'fin') delete st.fin[u.id]; else st.laps[u.id]--; persist(); draw(); };
    $$('.student').forEach((row) => { const id = row.dataset.s;
      const lap = $('.lap', row), fin = $('.fin', row);
      if (lap) lap.onclick = () => { st.laps[id] = (st.laps[id] || 0) + 1; st.undo.push({ type: 'lap', id }); persist(); navigator.vibrate && navigator.vibrate(30); PEJ.sound && PEJ.sound('lap'); draw(); };
      if (fin) fin.onclick = () => { st.fin[id] = Math.round(total() * 10) / 10; st.undo.push({ type: 'fin', id }); persist(); navigator.vibrate && navigator.vibrate(60); PEJ.sound && PEJ.sound('finish'); draw(); };
    });
    $('#sum').onclick = () => summary();
  };
  const summary = () => {
    const t = tests.find((x) => x.id == $('#rt').value); const rows = students.filter((s) => st.fin[s.id] != null).map((s) => ({ s, raw: st.fin[s.id] })).sort((a, b) => a.raw - b.raw);
    const odd = rows.filter((r) => r.raw < 60 || r.raw > 3600);
    const m = modal(`<h3>סיכום ריצה</h3>${odd.length ? `<div class="badge err">זמנים חריגים: ${odd.map((o) => esc(o.s.name)).join(', ')}</div>` : ''}
    <table>${rows.map((r, i) => `<tr data-s="${r.s.id}"><td>${i + 1}</td><td>${esc(r.s.name)}</td><td><input class="rv" inputmode="decimal" value="${r.raw}" style="width:90px"></td></tr>`).join('')}</table>
    <p class="sub">לא סיימו: ${students.filter((s) => st.fin[s.id] == null).map((s) => esc(s.name)).join(', ') || '—'}</p>
    <div class="row"><button class="pri" id="svRun" style="flex:1">שמור תוצאות</button><button id="csv">CSV</button></div>`);
    $('#csv', m).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['שם,זמן\n' + rows.map((r) => `${r.s.name},${r.raw}`).join('\n')], { type: 'text/csv' })); a.download = 'run.csv'; a.click(); };
    $('#svRun', m).onclick = guard(async () => {
      const items = $$('tr', m).map((tr) => ({ student_id: +tr.dataset.s, test_id: t.id, half: 1, raw: $('.rv', tr).value, status: 'done' }));
      try { const r = await post('/api/results/batch', { items }); localStorage.removeItem(draftKey); S.dirty = null; m.remove(); toast(`נשמרו ${r.saved} תוצאות ✓`); location.hash = '#/class/' + cid; }
      catch (e) { toast('השמירה נכשלה — הטיוטה נשמרה. ' + e.message, true); }
    });
  };
  draw(); S.tick = setInterval(() => { const c = $('#clock'); if (c && st.running) c.textContent = fmtTime(total()); }, 100);
};

// ---------- ריצה קצרה ----------
routes.sprint = async ([cid]) => {
  const classes = await get('/api/classes'); const k = classes.find((c) => c.id == cid);
  const tests = (await get('/api/tests?kind=sprint')).filter((t) => t.track === k.track && t.grade_level === k.grade_level);
  const students = await get(`/api/classes/${cid}/students`);
  if (!tests.length) return shell('ריצה קצרה', '<div class="card empty">אין מבדק ריצה קצרה לכיתה</div>', { back: '#/class/' + cid });
  const st = { lanes: 4, heats: [], h: 0, running: false, t0: 0, times: {} };
  const draw = () => {
    if (!st.heats.length) {
      shell('ריצה קצרה · ' + k.name, `<div class="card"><label for="rt">מבדק</label><select id="rt">${tests.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><label for="ln">נתיבים במקצה</label><input id="ln" type="number" min="1" max="8" value="${st.lanes}"><button class="pri big" id="mk" style="margin-top:14px">חלק למקצים</button></div>`, { back: '#/class/' + cid });
      $('#mk').onclick = () => { st.lanes = Math.max(1, Math.min(8, +$('#ln').value || 4)); st.test = tests.find((t) => t.id == $('#rt').value); for (let i = 0; i < students.length; i += st.lanes) st.heats.push({ list: students.slice(i, i + st.lanes), saved: false }); draw(); };
      return;
    }
    const heat = st.heats[st.h];
    S.dirty = st.heats.some((h) => !h.saved) && Object.keys(st.times).length ? 'sprint' : null;
    shell(`מקצה ${st.h + 1} מתוך ${st.heats.length}`, `<div class="card"><div id="clock" class="timer">${fmtTime(st.running ? (performance.now() - st.t0) / 1000 : st.final || 0)}</div>
    <button class="pri big" id="go" ${heat.saved ? 'disabled' : ''}>${st.running ? 'מתחרים…' : 'זינוק'}</button></div>
    ${heat.list.map((s, i) => `<div class="card student" data-s="${s.id}"><span class="badge">נתיב ${i + 1}</span><div class="nm">${esc(s.name)}</div>${st.times[s.id] != null ? `<span class="badge ok">${st.times[s.id].toFixed(2)}</span><button class="sm undo">בטל</button>` : `<button class="pri sm fin" ${st.running ? '' : 'disabled'}>סיום</button>`}</div>`).join('')}
    <div class="row"><button class="big pri" id="sv" ${heat.list.every((s) => st.times[s.id] != null) && !heat.saved ? '' : 'disabled'}>אשר ושמור מקצה</button></div>
    <div class="row" style="margin-top:8px"><button id="prev" ${st.h ? '' : 'disabled'}>הקודם</button><button id="next" ${st.h < st.heats.length - 1 ? '' : 'disabled'}>הבא</button></div>
    <div class="sub" style="margin-top:8px">מצב המקצים: ${st.heats.map((h, i) => `<span class="badge ${h.saved ? 'ok' : ''}">${i + 1}${h.saved ? '✓' : ''}</span>`).join(' ')}</div>`, { back: '#/class/' + cid });
    $('#go').onclick = () => { if (PEJ.sound) PEJ.sound('countdown', () => { st.running = true; st.t0 = performance.now(); navigator.vibrate && navigator.vibrate(100); draw(); }); else { st.running = true; st.t0 = performance.now(); navigator.vibrate && navigator.vibrate(100); draw(); } };
    $$('.fin').forEach((b) => (b.onclick = () => { st.times[b.closest('.student').dataset.s] = (performance.now() - st.t0) / 1000; PEJ.sound && PEJ.sound('finish'); if (heat.list.every((s) => st.times[s.id] != null)) { st.running = false; st.final = Math.max(...heat.list.map((s) => st.times[s.id])); } draw(); }));
    $$('.undo').forEach((b) => (b.onclick = () => { delete st.times[b.closest('.student').dataset.s]; draw(); }));
    $('#prev').onclick = () => { st.h--; st.final = 0; draw(); }; $('#next').onclick = () => { st.h++; st.final = 0; draw(); };
    $('#sv').onclick = guard(async () => {
      try { await post('/api/results/batch', { items: heat.list.map((s) => ({ student_id: s.id, test_id: st.test.id, half: 1, raw: Math.round(st.times[s.id] * 100) / 100, status: 'done' })) }); heat.saved = true; toast('המקצה נשמר ✓'); if (st.h < st.heats.length - 1) { st.h++; st.final = 0; } else if (st.heats.every((h) => h.saved)) { S.dirty = null; toast('כל המקצים נשמרו ✓'); } draw(); }
      catch (e) { toast('המקצה לא נשמר: ' + e.message, true); }
    });
  };
  draw();
  S.tick = setInterval(() => { const c = $('#clock'); if (c && st.running) c.textContent = fmtTime((performance.now() - st.t0) / 1000); }, 50);
};

// ---------- מערכת שעות ----------
routes.schedule = async ([], q) => {
  const [ls, classes, cur] = await Promise.all([get('/api/schedule'), get('/api/classes'), get('/api/current-lesson')]);
  const today = new Date().getDay();
  shell('מערכת שעות', `<div class="row" style="margin-bottom:10px"><button class="pri" id="al" style="flex:1">+ שיעור</button><button id="ims">ייבוא</button><a class="btn" href="#/journal" style="text-decoration:none">יומן</a></div>
  ${ls.length ? DAYS.map((d, i) => { const dl = ls.filter((l) => l.day === i); return `<div class="card ${i === today ? 'now' : ''}" ${i === today ? 'style="border-color:var(--navy)"' : ''}><b>יום ${d}${i === today ? ' · היום' : ''}</b>${dl.length ? dl.map((l) => `<div class="row sp" style="padding:6px 0" data-l="${l.id}"><span class="${cur.current && cur.current.id === l.id ? 'badge ok' : ''}">שיעור ${l.period} · ${l.start}–${l.end}</span><span>${esc(l.class_name || '—')} ${l.place ? '· ' + esc(l.place) : ''}</span><button class="sm dng dl" aria-label="מחק">✕</button></div>`).join('') : '<div class="sub">יום חופשי</div>'}</div>`; }).join('') : '<div class="card empty" id="noSched">אין שיעורים במערכת</div>'}`);
  $$('.dl').forEach((b) => (b.onclick = guard(async () => { if (await confirmBox('למחוק שיעור?', 'מחק', true)) { await del('/api/schedule/' + b.closest('[data-l]').dataset.l); routes.schedule([], q); } })));
  $('#al').onclick = () => { const m = modal(`<h3>שיעור חדש</h3><label for="ld">יום</label><select id="ld">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select><label for="lp">שיעור</label><input id="lp" type="number" min="1" value="1"><div class="row"><div style="flex:1"><label for="ls">התחלה</label><input id="ls" type="time" value="08:00"></div><div style="flex:1"><label for="le">סיום</label><input id="le" type="time" value="08:45"></div></div><label for="lc">כיתה</label><select id="lc"><option value="">—</option>${classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><label for="lpl">מקום</label><input id="lpl"><button class="pri big" id="lsv" style="margin-top:14px">שמירה</button>`);
    $('#lsv', m).onclick = guard(async () => { await post('/api/schedule', { day: +$('#ld', m).value, period: +$('#lp', m).value, start: $('#ls', m).value, end: $('#le', m).value, class_id: +$('#lc', m).value || null, place: $('#lpl', m).value }); m.remove(); toast('נוסף'); routes.schedule([], q); }); };
  $('#ims').onclick = () => { const m = modal(`<h3>ייבוא מערכת (CSV)</h3><p class="sub">יום(0-4),שיעור,התחלה,סיום,כיתה,מקום</p><textarea id="ic"></textarea><div id="pv"></div><button class="big" id="pvb">תצוגה מקדימה</button><button class="pri big" id="cm" style="margin-top:8px" disabled>אישור ושמירה</button>`);
    $('#pvb', m).onclick = guard(async () => { const r = await post('/api/schedule/import', { text: $('#ic', m).value }); $('#pv', m).innerHTML = `<p>${r.preview.length} שיעורים יובאו:</p>` + r.preview.map((p) => `<div class="sub">יום ${DAYS[p.day] || p.day} · ${p.start}–${p.end} · ${esc(p.class_name)}</div>`).join(''); $('#cm', m).disabled = !r.preview.length; });
    $('#cm', m).onclick = guard(async () => { const r = await post('/api/schedule/import', { text: $('#ic', m).value, commit: true }); m.remove(); toast('יובאו ' + r.imported); routes.schedule([], q); }); };
};
routes.journal = async () => {
  const [js, classes] = await Promise.all([get('/api/journal'), get('/api/classes')]);
  shell('יומן שיעורים', `<div class="card"><label for="jd">תאריך</label><input id="jd" type="date" value="${new Date().toISOString().slice(0, 10)}"><label for="jc">כיתה</label><select id="jc"><option value="">—</option>${classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><label for="jt">נושא השיעור</label><input id="jt"><label for="jn">הערות</label><textarea id="jn"></textarea><button class="pri big" id="jsv" style="margin-top:12px">שמירה</button></div>
  ${js.length ? js.map((j) => `<div class="card row sp" data-j="${j.id}"><div><b>${esc(j.topic)}</b><div class="sub">${esc(j.date)} · ${esc(j.class_name || '')}</div>${j.notes ? `<div>${esc(j.notes)}</div>` : ''}</div><button class="sm dng jd">✕</button></div>`).join('') : '<div class="card empty">אין רישומים</div>'}`, { back: '#/schedule' });
  $('#jsv').onclick = guard(async () => { await post('/api/journal', { date: $('#jd').value, class_id: +$('#jc').value || null, topic: $('#jt').value, notes: $('#jn').value }); toast('נשמר'); routes.journal(); });
  $$('.jd').forEach((b) => (b.onclick = guard(async () => { await del('/api/journal/' + b.closest('[data-j]').dataset.j); routes.journal(); })));
};

// ---------- מילויי מקום ----------
routes.subs = async () => {
  const v = S.subView || 'all'; const d = await get('/api/subs?view=' + v);
  shell('מילויי מקום', `<div class="chips" id="sv">${[['today', 'היום'], ['week', 'השבוע'], ['month', 'החודש'], ['all', 'הכל']].map(([k, l]) => `<button class="chip ${v === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="stats"><div class="card stat"><b id="subCount">${d.summary.count}</b>מילויים</div><div class="card stat"><b>${d.summary.hours}</b>שעות</div><div class="card stat"><b>${d.summary.unreported}</b>טרם דווחו</div><div class="card stat"><b>${d.summary.paid}</b>שולמו</div></div>
  <button class="pri big" id="as" style="margin-bottom:10px">+ מילוי מקום</button>
  ${d.rows.length ? d.rows.map((r) => `<div class="card" data-r="${r.id}"><div class="row sp"><b>${esc(r.date)} · ${esc(r.class_name)}</b><span>${r.hours} ש׳</span></div><div class="row" style="margin-top:6px"><label class="row" style="margin:0"><input type="checkbox" class="rep" ${r.reported ? 'checked' : ''}> דווח</label><label class="row" style="margin:0"><input type="checkbox" class="pd" ${r.paid ? 'checked' : ''}> שולם</label><span style="flex:1"></span><button class="sm dng rm">מחק</button></div></div>`).join('') : '<div class="card empty">אין רשומות</div>'}`);
  $$('#sv .chip').forEach((b) => (b.onclick = () => { S.subView = b.dataset.v; routes.subs(); }));
  $$('[data-r]').forEach((c) => { const id = c.dataset.r; const upd = guard(async () => { await put('/api/subs/' + id, { reported: $('.rep', c).checked, paid: $('.pd', c).checked }); routes.subs(); }); $('.rep', c).onchange = upd; $('.pd', c).onchange = upd; $('.rm', c).onclick = guard(async () => { if (await confirmBox('למחוק רשומה?', 'מחק', true)) { await del('/api/subs/' + id); routes.subs(); } }); });
  $('#as').onclick = () => { const m = modal(`<h3>מילוי מקום</h3><label for="sd">תאריך</label><input id="sd" type="date" value="${new Date().toISOString().slice(0, 10)}"><label for="sc">כיתה</label><input id="sc"><label for="sh">שעות</label><input id="sh" type="number" step="0.5" value="1"><button class="pri big" id="ssv" style="margin-top:14px">שמירה</button>`); $('#ssv', m).onclick = guard(async () => { await post('/api/subs', { date: $('#sd', m).value, class_name: $('#sc', m).value, hours: $('#sh', m).value }); m.remove(); toast('נוסף'); routes.subs(); }); };
};

// ---------- מתקנים ----------
routes.facilities = async () => {
  const d = await get('/api/facilities'); const day = S.fday ?? Math.min(new Date().getDay(), 4);
  const rows = d.rows.filter((r) => r.day === day);
  shell('חלוקת מתקנים', `<div class="chips" id="fd">${DAYS.map((x, i) => `<button class="chip ${i === day ? 'on' : ''}" data-d="${i}">${x}</button>`).join('')}</div>
  <button class="pri big" id="af" style="margin-bottom:10px">+ שיבוץ מתקן</button>
  ${rows.length ? rows.map((r) => `<div class="card row sp" data-f="${r.id}"><div><b>${esc(r.facility)}</b><div class="sub">שיעור ${r.period} · ${esc(r.teacher_name)}</div></div><span class="badge ${r.kind === 'fixed' ? '' : 'warn'}">${r.kind === 'fixed' ? 'קבוע' : 'שינוי נקודתי'}</span>${S.user.role !== 'examiner' ? '<button class="sm dng fx">✕</button>' : ''}</div>`).join('') : '<div class="card empty">אין שיבוצים ביום זה — כל המתקנים פנויים</div>'}`, { back: '#/home' });
  $$('#fd .chip').forEach((b) => (b.onclick = () => { S.fday = +b.dataset.d; routes.facilities(); }));
  $$('.fx').forEach((b) => (b.onclick = guard(async () => { await del('/api/facilities/' + b.closest('[data-f]').dataset.f); routes.facilities(); })));
  $('#af').onclick = () => { const m = modal(`<h3>שיבוץ מתקן</h3><label for="fn">מתקן</label><input id="fn" list="fl" value="אולם ספורט"><datalist id="fl">${d.names.map((n) => `<option>${esc(n)}</option>`).join('')}</datalist><label for="fp">שיעור</label><input id="fp" type="number" min="1" value="1"><label for="fk">סוג</label><select id="fk"><option value="fixed">קבוע</option><option value="once">שינוי נקודתי</option></select><button class="pri big" id="fsv" style="margin-top:14px">שמירה</button>`);
    $('#fsv', m).onclick = guard(async () => { await post('/api/facilities', { day, period: +$('#fp', m).value, facility: $('#fn', m).value, kind: $('#fk', m).value }); m.remove(); toast('שובץ'); routes.facilities(); }); };
};

// ---------- דוחות ----------
routes.reports = async () => {
  const o = await get('/api/reports/overview');
  shell('דוחות', `<div class="stats"><div class="card stat"><b>${o.classes}</b>כיתות</div><div class="card stat"><b>${o.students}</b>תלמידים</div><div class="card stat"><b>${o.h1 ?? '—'}</b>מחצית א׳</div><div class="card stat"><b>${o.h2 ?? '—'}</b>מחצית ב׳</div><div class="card stat"><b id="rYear">${o.year ?? '—'}</b>שנתי</div><div class="card stat"><b>${o.missing}</b>חוסרים</div><div class="card stat"><b>${o.low}</b>ציון נמוך</div></div>
  <h2>לפי כיתה</h2>${o.byClass.map((k) => `<a class="card row sp" href="#/reports/class/${k.id}" style="text-decoration:none;color:inherit"><b>${esc(k.name)}</b><span class="sub">${k.count} תלמידים · חוסרים ${k.missing}</span><span class="grade">${k.year ?? '—'}</span></a>`).join('') || '<div class="card empty">אין נתונים</div>'}
  ${S.bagrut ? '<a class="card" href="#/bagrut/report" style="display:block;text-decoration:none;color:inherit">דוח בגרות</a>' : ''}`);
};
routes.reports_class = null;
const _rep = routes.reports;
routes.reports = async (p, q) => {
  if (p[0] === 'class') {
    const r = await get('/api/reports/class/' + p[1]);
    shell('דוח כיתה · ' + r.class.name, `<button class="big" id="csv" style="margin-bottom:10px">ייצוא CSV</button><div class="card" style="overflow-x:auto"><table><tr><th>תלמיד</th><th>א׳</th><th>ב׳</th><th>שנתי</th><th>חסרים</th></tr>${r.students.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.h1 ?? '—'}</td><td>${s.h2 ?? '—'}</td><td><b>${s.year ?? '—'}</b></td><td>${s.missing || ''}</td></tr>`).join('')}</table></div>`, { back: '#/reports' });
    $('#csv').onclick = guard(async () => { const c = await get(`/api/reports/class/${p[1]}/csv`); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + c.csv], { type: 'text/csv' })); a.download = 'class.csv'; a.click(); });
    return;
  }
  return _rep(p, q);
};

// ---------- בגרות ----------
routes.bagrut = async ([sub]) => {
  if (!S.bagrut) throw new Error('מוד הבגרות כבוי');
  if (sub === 'report') {
    const r = await get('/api/bagrut/report');
    return shell('דוח בגרות', `<div class="card" style="overflow-x:auto"><table><tr><th>תלמיד</th><th>הושלמו</th><th>ציון</th><th>סטטוס</th></tr>${r.students.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.done}/${s.of}</td><td><b>${s.total ?? '—'}</b></td><td>${s.final ? 'סופי' : 'זמני'}</td></tr>`).join('')}</table></div>`, { back: '#/bagrut' });
  }
  const stations = await get('/api/bagrut/stations'); const classes = (await get('/api/classes')).filter((c) => c.grade_level === 'י״ב');
  if (sub === 'entry') return;
  shell('בגרות', `<a class="card" href="#/bagrut/report" style="display:block;text-decoration:none;color:inherit">דוח בגרות</a><h2>התחנות שלי</h2>
  ${stations.length ? stations.map((s) => `<div class="card" data-t="${s.test_id}"><b>${esc(s.tname)}</b><div class="sub">${esc(s.station)}</div><select class="kc">${classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><button class="pri big go" style="margin-top:8px">כניסה לתחנה</button></div>`).join('') : '<div class="card empty" id="noStations">לא שובצת לתחנות</div>'}`);
  $$('.go').forEach((b) => (b.onclick = guard(async () => { const c = b.closest('[data-t]'); const e = await get(`/api/bagrut/entry?test_id=${c.dataset.t}&class_id=${$('.kc', c).value}`); stationEntry(e, c.dataset.t); })));
};
function stationEntry(e, tid) {
  const m = modal(`<h3>${esc(e.test.name)}</h3>${e.rows.map((r) => `<div class="row" style="margin-bottom:8px" data-s="${r.student_id}"><b style="flex:1">${esc(r.name)}</b><input class="br" inputmode="decimal" style="width:90px" value="${r.raw ?? ''}"><span class="grade">${r.grade ?? '—'}</span></div>`).join('')}`);
  $$('.br', m).forEach((i) => (i.onchange = guard(async () => { const row = i.closest('[data-s]'); const r = await post('/api/bagrut/result', { student_id: +row.dataset.s, test_id: +tid, raw: i.value }); $('.grade', row).textContent = r.grade ?? '—'; toast('נשמר ✓'); })));
}

// ---------- הגדרות ----------
routes.settings = async () => {
  const admin = ['super', 'school_admin'].includes(S.user.role);
  shell('הגדרות', `<div class="card"><b>${esc(S.user.name)}</b><div class="sub">${esc(S.school.name)} · ${{ super: 'מנהל מערכת ראשי', school_admin: 'מנהל בית ספר', teacher: 'מורה', examiner: 'בוחן' }[S.user.role]}</div></div>
  ${S.user.role === 'super' ? `<div class="card"><div class="row sp"><b>מוד בגרות</b><label class="row" style="margin:0"><input type="checkbox" id="bg" ${S.bagrut ? 'checked' : ''}> פעיל</label></div><a href="#/bagrutadmin" class="btn" style="margin-top:10px;text-decoration:none">ניהול בגרות י״ב</a></div>` : ''}
  ${admin ? '<a class="card" href="#/users" style="display:block;text-decoration:none;color:inherit">ניהול משתמשים</a>' : ''}
  ${PEJ.hooks.settingsLinks ? PEJ.hooks.settingsLinks() : ''}
  <button class="dng big" id="lo">התנתקות</button>`, { back: '#/home' });
  const bg = $('#bg'); if (bg) bg.onchange = guard(async () => { await post('/api/bagrut/toggle', { on: bg.checked }); S.bagrut = bg.checked; toast(bg.checked ? 'מוד הבגרות הופעל' : 'מוד הבגרות כובה'); routes.settings(); });
  $('#lo').onclick = guard(async () => { await post('/api/logout'); logoutLocal(); });
};
routes.bagrutadmin = async () => {
  const d = await get('/api/bagrut/admin');
  shell('ניהול בגרות י״ב', `<div class="card">מצב המוד: <b>${d.on ? 'פעיל' : 'כבוי'}</b></div><h2>מבדקים ושיבוץ בוחנים</h2>
  ${d.tests.map((t) => { const a = d.assign.find((x) => x.test_id === t.id); return `<div class="card" data-t="${t.id}"><div class="row sp"><b>${esc(t.name)}</b><label class="row" style="margin:0"><input type="checkbox" class="bs" ${t.bagrut ? 'checked' : ''}> בגרות</label></div><div class="row"><div style="flex:1"><label>משקל</label><input class="bw" type="number" value="${t.weight}"></div><div style="flex:2"><label>בוחן</label><select class="be"><option value="">—</option>${d.examiners.map((e) => `<option value="${e.id}" ${a && a.examiner_id === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div></div></div>`; }).join('')}`, { back: '#/settings' });
  $$('[data-t]').forEach((c) => { const tid = +c.dataset.t; const sv = guard(async () => { await post('/api/bagrut/select', { test_id: tid, bagrut: $('.bs', c).checked, weight: $('.bw', c).value }); await post('/api/bagrut/assign', { test_id: tid, station: $('b', c).textContent, examiner_id: +$('.be', c).value || null }); toast('נשמר ✓'); }); $('.bs', c).onchange = sv; $('.bw', c).onchange = sv; $('.be', c).onchange = sv; });
};
routes.users = async () => {
  const us = await get('/api/users');
  shell('משתמשים', `${us.map((u) => `<div class="card row sp"><b>${esc(u.name)}</b><span class="badge">${esc(u.role)}</span></div>`).join('')}
  <div class="card"><label for="un">שם</label><input id="un"><label for="uu">שם משתמש</label><input id="uu" autocapitalize="off"><label for="up">סיסמה</label><input id="up" type="password"><label for="ur">תפקיד</label><select id="ur"><option value="teacher">מורה</option><option value="examiner">בוחן</option><option value="school_admin">מנהל בית ספר</option></select><button class="pri big" id="ua" style="margin-top:12px">הוספה</button></div>`, { back: '#/settings' });
  $('#ua').onclick = guard(async () => { await post('/api/users', { name: $('#un').value, username: $('#uu').value, password: $('#up').value, role: $('#ur').value }); toast('נוסף'); routes.users(); });
};

Object.assign(window.PEJ, { S, routes, shell, get, post, put, del, guard, toast, esc, $, $$, modal, confirmBox, ic, IC, DAYS, STATUS, api, router, fmtTime });
router();
