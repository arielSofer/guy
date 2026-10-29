// מרכז התראות + הדרכת התחלה
(function () {
  const P = window.PEJ;
  const { esc, $, $$ } = P;
  const BELL = 'M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8zM10 20a2 2 0 0 0 4 0';
  const bell = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${BELL}"/></svg>`;
  let unread = 0;
  const TYPES = { health: 'הצהרת בריאות חסרה', exempt: 'פטורים', missing: 'מבדקים חסרים', sub: 'מילויי מקום שלא דווחו' };
  const TYPE_ORDER = ['health', 'exempt', 'missing', 'sub'];

  const st = document.createElement('style');
  st.textContent = `
#bellBtn{position:relative;min-width:38px;min-height:38px;padding:0;display:inline-flex;align-items:center;justify-content:center}
#bellBtn .nb{position:absolute;top:-4px;inset-inline-start:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#ff6a2b;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;display:none}
#bellBtn .nb.on{display:block}
.nt{display:flex;gap:10px;align-items:flex-start;cursor:pointer;word-break:break-word}
.nt .dot{flex:none;width:10px;height:10px;border-radius:50%;margin-top:6px;background:#ff6a2b}
.nt.read{opacity:.6}.nt.read .dot{background:transparent;border:1.5px solid var(--off)}
.nt .bd{flex:1;min-width:0}
.nt.sev-high{border-inline-start:4px solid var(--err)}.nt.sev-med{border-inline-start:4px solid #ff6a2b}
#tourOv{position:fixed;inset:0;z-index:9000}
#tourSpot{position:fixed;border-radius:12px;box-shadow:0 0 0 9999px rgba(18,48,107,.72);outline:2px solid #ff6a2b;transition:all .2s;pointer-events:none}
#tourBox{position:fixed;inset-inline:12px;max-width:420px;margin-inline:auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 8px 28px rgba(0,0,0,.25)}
#tourBox h3{margin:0 0 6px;color:#12306b}#tourBox p{margin:0 0 12px;line-height:1.5}
`;
  document.head.appendChild(st);

  // ---------- פעמון ----------
  const paintBadge = () => { const b = $('#bellBtn .nb'); if (!b) return; b.textContent = unread > 99 ? '99+' : unread; b.classList.toggle('on', unread > 0); const btn = $('#bellBtn'); btn.setAttribute('aria-label', unread ? `התראות, ${unread} שלא נקראו` : 'התראות'); };
  const refresh = async () => { if (!P.S.user) return; try { unread = (await P.get('/api/notifications/count')).unread; paintBadge(); } catch {} };
  const prevHeader = P.hooks.header;
  P.hooks.header = () => (prevHeader ? prevHeader() : '') + (P.S.user ? `<button class="icon sm" id="bellBtn" aria-label="התראות">${bell}<span class="nb${unread > 0 ? ' on' : ''}">${unread}</span></button>` : '');

  // ---------- הגדרות ----------
  const prevSet = P.hooks.settingsLinks;
  P.hooks.settingsLinks = () => (prevSet ? prevSet() : '') + '<button class="big" id="tourRestart" style="width:100%;margin-bottom:12px">הדרכת התחלה</button>';

  // ---------- מסך התראות ----------
  P.routes.notifications = async () => {
    const d = await P.get('/api/notifications');
    unread = d.unread;
    const groups = TYPE_ORDER.map((t) => [t, d.items.filter((n) => n.type === t)]).filter((g) => g[1].length);
    P.shell('התראות', `<div class="row sp"><span class="sub" id="nCount">${d.unread ? d.unread + ' שלא נקראו' : 'הכול נקרא'}</span><button class="sm" id="readAll" ${d.unread ? '' : 'disabled'}>סמן הכל כנקרא</button></div>
    ${groups.length ? groups.map(([t, a]) => `<h2>${TYPES[t]} <span class="badge">${a.length}</span></h2>${a.map((n) => `<div class="card nt sev-${n.severity} ${n.read ? 'read' : ''}" data-id="${esc(n.id)}" data-link="${esc(n.link)}" role="link" tabindex="0"><span class="dot"></span><div class="bd"><b>${esc(n.title)}</b><div class="sub">${esc(n.body)}</div></div></div>`).join('')}`).join('') : '<div class="card empty" id="nEmpty">אין התראות. הכול מעודכן</div>'}`, { back: '#/home' });
    const left = () => $$('.nt:not(.read)').length;
    const upd = () => { const n = left(); unread = n; $('#nCount').textContent = n ? n + ' שלא נקראו' : 'הכול נקרא'; $('#readAll').disabled = !n; paintBadge(); };
    $$('.nt').forEach((el) => {
      const go = P.guard(async () => { if (!el.classList.contains('read')) { await P.post('/api/notifications/read', { ids: [el.dataset.id] }); el.classList.add('read'); upd(); } location.hash = el.dataset.link; });
      el.onclick = go; el.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
    $('#readAll').onclick = P.guard(async () => { await P.post('/api/notifications/read-all'); $$('.nt').forEach((e) => e.classList.add('read')); upd(); P.toast('הכל סומן כנקרא'); });
    paintBadge();
  };

  // ---------- הדרכה ----------
  const STEPS = [
    { sel: '#classList, #emptyClasses', t: 'הכיתות שלך', x: 'כאן מופיעות הכיתות. לחצו על כיתה כדי לראות תלמידים, פטורים והצהרות בריאות.' },
    { sel: 'nav.bar', t: 'ניווט תחתון', x: 'בסרגל התחתון עוברים בין המסך הראשי, המערכת, המבדקים והדוחות.' },
    { sel: '#classList .card, #emptyClasses', t: 'יומן ציונים וריצה חיה', x: 'בתוך כיתה תמצאו יומן ציונים להזנת תוצאות, וריצה חיה למדידת זמנים בשיעור.' },
    { sel: 'nav [data-nav="reports"]', t: 'דוחות', x: 'בדוחות רואים ממוצעים והתקדמות לכל כיתה, ואפשר לייצא לקובץ.' },
    { sel: '#bellBtn', t: 'התראות', x: 'הפעמון מתריע על מבדקים חסרים, פטורים שעומדים לפוג והצהרות בריאות חסרות.' },
  ];
  let ov = null;
  const stopTour = (done) => { if (ov) { ov.remove(); ov = null; } if (done) P.post('/api/tour').catch(() => {}); };
  function startTour() {
    stopTour();
    const steps = STEPS.map((s) => ({ ...s, el: $(s.sel) })).filter((s) => s.el);
    if (!steps.length) return;
    ov = document.createElement('div'); ov.id = 'tourOv'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'הדרכת התחלה');
    ov.innerHTML = '<div id="tourSpot"></div><div id="tourBox"></div>';
    document.body.appendChild(ov);
    let i = 0;
    const show = () => {
      const s = steps[i]; const last = i === steps.length - 1;
      s.el.scrollIntoView({ block: 'center' });
      const r = s.el.getBoundingClientRect(); const pad = 6;
      const sp = $('#tourSpot', ov);
      sp.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px`;
      const box = $('#tourBox', ov);
      box.innerHTML = `<div class="sub">שלב ${i + 1} מתוך ${steps.length}</div><h3>${esc(s.t)}</h3><p>${esc(s.x)}</p><div class="row"><button class="pri" id="tourNext" style="flex:1">${last ? 'סיום' : 'הבא'}</button>${last ? '' : '<button id="tourSkip" style="flex:1">דלג</button>'}</div>`;
      const mid = r.top + r.height / 2;
      box.style.top = mid > innerHeight / 2 ? '12px' : 'auto'; box.style.bottom = mid > innerHeight / 2 ? 'auto' : '12px';
      $('#tourNext', ov).onclick = () => { if (last) stopTour(true); else { i++; show(); } };
      const sk = $('#tourSkip', ov); if (sk) sk.onclick = () => stopTour(true);
    };
    show();
  }
  window.addEventListener('hashchange', () => stopTour(false));

  P.hooks.afterShell = ((prev) => (r) => {
    if (prev) prev(r);
    const b = $('#bellBtn'); if (b) b.onclick = () => (location.hash = '#/notifications');
    refresh();
    const tr = $('#tourRestart'); if (tr) tr.onclick = () => { location.hash = '#/home?tour=1'; };
    if (r === '#/home' && P.S.user) {
      if (/[?&]tour=1/.test(location.hash)) { history.replaceState(null, '', '#/home'); startTour(); return; }
      if (navigator.webdriver) return;
      P.get('/api/tour').then((d) => { if (!d.done && location.hash.split('?')[0] === '#/home') startTour(); }).catch(() => {});
    }
  })(P.hooks.afterShell);
})();
