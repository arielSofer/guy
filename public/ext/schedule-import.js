// ייבוא מערכת מקובץ + צלילי התחלה
(function () {
  const PEJ = window.PEJ;
  const { $, esc, post, guard, toast, modal } = PEJ;
  const ls = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
  const lset = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const soundOn = () => ls('pej_sound', 'on') !== 'off';
  const vibOn = () => ls('pej_vibrate', 'on') !== 'off';
  const cdOn = () => ls('pej_countdown', 'off') === 'on';

  // ---------- צלילים ----------
  let ctx = null;
  function audio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  }
  ['pointerdown', 'touchstart', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, () => audio(), { passive: true }));
  function beep(freq, dur, at = 0, vol = 0.25, type = 'sine') {
    const a = audio(); if (!a) return;
    const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  // כיבוי רטט לפי ההעדפה
  const nativeVib = navigator.vibrate ? navigator.vibrate.bind(navigator) : null;
  if (nativeVib) { try { navigator.vibrate = (p) => (vibOn() ? nativeVib(p) : false); } catch {} }

  PEJ.sound = (kind, done) => {
    const fin = () => { if (typeof done === 'function') done(); };
    if (!soundOn()) return fin();
    if (kind === 'countdown') {
      if (!cdOn()) { beep(1200, 0.25); return fin(); }
      audio();
      const ov = document.createElement('div'); ov.id = 'cdOverlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);color:#fff;font-size:30vmin;font-weight:800';
      ov.setAttribute('aria-live', 'assertive');
      document.body.appendChild(ov);
      let n = 3;
      const tick = () => {
        if (n > 0) { ov.textContent = n; beep(660, 0.15); n--; setTimeout(tick, 1000); }
        else { ov.textContent = 'צא!'; beep(1320, 0.45, 0, 0.35); setTimeout(() => ov.remove(), 250); fin(); }
      };
      return tick();
    }
    if (kind === 'go') beep(1200, 0.25);
    else if (kind === 'lap') beep(900, 0.06, 0, 0.18);
    else if (kind === 'finish') { beep(880, 0.15); beep(1175, 0.3, 0.17); }
  };

  // ---------- הגדרות ----------
  const prevLinks = PEJ.hooks.settingsLinks;
  PEJ.hooks.settingsLinks = () => (prevLinks ? prevLinks() : '') +
    `<div class="card" id="sndCard"><b>צלילים והתראות</b>
    <label class="row" style="margin:8px 0 0"><input type="checkbox" id="sndOn" ${soundOn() ? 'checked' : ''}> צלילי התחלה/סיום</label>
    <label class="row" style="margin:8px 0 0"><input type="checkbox" id="vibOn" ${vibOn() ? 'checked' : ''}> רטט</label>
    <label class="row" style="margin:8px 0 0"><input type="checkbox" id="cdOnChk" ${cdOn() ? 'checked' : ''}> ספירה לאחור 3-2-1</label></div>`;

  // ---------- ייבוא קובץ ----------
  const DAYN = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
  function toB64(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = () => rej(new Error('שגיאה בקריאת הקובץ'));
      fr.readAsDataURL(file);
    });
  }
  function openImport(reload) {
    const m = modal(`<h3>העלאת מערכת מקובץ</h3><p class="sub">Excel, CSV, PDF (עם טקסט) או הדבקת טקסט</p>
      <label for="imfile">קובץ</label><input type="file" id="imfile" accept=".xlsx,.xls,.csv,.pdf,.txt">
      <label for="imtext">או הדבקת טקסט</label><textarea id="imtext" placeholder="יום,שיעור,התחלה,סיום,כיתה,מקום"></textarea>
      <div id="impv" style="margin-top:8px"></div>
      <button class="pri big" id="imcommit" style="margin-top:8px" disabled>אישור ושמירה</button>
      <button class="big" id="imclose" style="margin-top:8px">סגירה</button>`);
    let rows = [];
    $('#imclose', m).onclick = () => m.remove();
    const render = (r) => {
      rows = r.preview;
      const opts = (row) => `<option value="">ללא כיתה</option>` + (row.suggestions.length ? row.suggestions : r.classes).map((k) => `<option value="${k.id}">${esc(k.name)}</option>`).join('');
      $('#impv', m).innerHTML = `<p id="imsum">${rows.length} שיעורים בקובץ${r.conflicts ? ` · ${r.conflicts} ידולגו` : ''}${r.warnings ? ` · ${r.warnings} עם אזהרות` : ''}</p>` +
        rows.map((p, i) => `<div class="card imrow" data-i="${i}" style="${p.conflict ? 'opacity:.55' : ''}"><b>יום ${DAYN[p.day]} · שיעור ${p.period ?? '?'}</b> · ${esc(p.start)}–${esc(p.end)}<div class="sub">${esc(p.class_name || '—')}${p.place ? ' · ' + esc(p.place) : ''}</div>` +
          (p.class_name && !p.class_id ? `<select class="imcls" aria-label="התאמת כיתה">${opts(p)}</select>` : '') +
          p.warnings.map((w) => `<div class="sub imwarn" style="color:#b45309">⚠ ${esc(w)}</div>`).join('') + '</div>').join('');
      m.querySelectorAll('.imcls').forEach((s) => (s.onchange = () => { rows[+s.closest('.imrow').dataset.i].class_id = s.value ? +s.value : null; }));
      $('#imcommit', m).disabled = !rows.some((p) => !p.conflict);
    };
    const payload = async () => {
      const f = $('#imfile', m).files[0], t = $('#imtext', m).value.trim();
      if (f) return { name: f.name, data_base64: await toB64(f) };
      if (t) return { text: t };
      throw new Error('בחרו קובץ או הדביקו טקסט');
    };
    // תצוגה מקדימה אוטומטית: מיד עם בחירת קובץ או הדבקת טקסט
    const preview = guard(async () => { render(await post('/api/schedule/import-file', await payload())); });
    $('#imfile', m).onchange = preview;
    let tm; $('#imtext', m).oninput = () => { clearTimeout(tm); tm = setTimeout(() => { if ($('#imtext', m).value.trim() && !$('#imfile', m).files[0]) preview(); }, 500); };
    $('#imcommit', m).onclick = guard(async () => {
      const r = await post('/api/schedule/import-file', { rows: rows.map(({ day, period, start, end, class_name, place, class_id }) => ({ day, period, start, end, class_name, place, class_id })), commit: true });
      m.remove(); toast(`יובאו ${r.imported}` + (r.skipped ? `, דולגו ${r.skipped}` : '')); reload();
    });
  }

  // ---------- חיבור למסכים ----------
  const prev = PEJ.hooks.afterShell;
  PEJ.hooks.afterShell = (r) => {
    prev && prev(r);
    if (r.startsWith('#/schedule') && $('#ims') && !$('#imf')) {
      const b = document.createElement('button'); b.id = 'imf'; b.textContent = 'העלאת קובץ (Excel / CSV / PDF)';
      $('#ims').insertAdjacentElement('afterend', b); b.style.flex = '1 1 100%'; $('#ims').parentElement.style.flexWrap = 'wrap';
      b.onclick = () => openImport(() => PEJ.routes.schedule([], {}));
    }
    if (r === '#/settings') {
      const bind = (id, key, onVal, offVal) => { const e = $(id); if (e) e.onchange = () => { lset(key, e.checked ? onVal : offVal); toast('נשמר ✓'); if (e.checked && key === 'pej_sound') PEJ.sound('go'); }; };
      bind('#sndOn', 'pej_sound', 'on', 'off'); bind('#vibOn', 'pej_vibrate', 'on', 'off'); bind('#cdOnChk', 'pej_countdown', 'on', 'off');
    }
  };
})();
