// כיתות משולבות: כיתת אם לכל תלמיד, סינון לפי כיתת אם, ועריכה מרוכזת
(function () {
  const P = window.PEJ;
  const prev = P.hooks.afterShell;
  P.hooks.afterShell = (r) => { if (prev) prev(r); if (r.startsWith('#/class/')) enhance(r.split('/')[2].split('?')[0]).catch(() => {}); };

  async function enhance(cid) {
    const [classes, students] = await Promise.all([P.get('/api/classes'), P.get(`/api/classes/${cid}/students`)]);
    const k = classes.find((c) => String(c.id) === String(cid));
    if (!k || !k.combined || !P.$('#sq')) return;
    const homes = [...new Set(students.map((s) => s.home_class).filter(Boolean))].sort();
    const byId = Object.fromEntries(students.map((s) => [s.id, s]));
    const apply = (f) => P.$$('.student[data-st]').forEach((row) => {
      const s = byId[row.dataset.st]; if (!s) return;
      row.style.display = !f || s.home_class === f ? '' : 'none';
      if (!P.$('.home', row)) P.$('.nm', row).insertAdjacentHTML('beforeend', ` <span class="badge home">${P.esc(s.home_class || 'ללא כיתת אם')}</span>`);
    });
    const bar = document.createElement('div');
    bar.id = 'homeBar'; bar.className = 'chips';
    bar.innerHTML = `<button class="chip on" data-h="">כל כיתות האם</button>${homes.map((h) => `<button class="chip" data-h="${P.esc(h)}">${P.esc(h)}</button>`).join('')}<button class="chip" id="editHomes">עריכת כיתות אם</button>`;
    P.$('#sq').closest('.row').before(bar);
    bar.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      if (b.id === 'editHomes') return editor(cid, students, homes);
      P.$$('#homeBar .chip[data-h]').forEach((x) => x.classList.toggle('on', x === b)); apply(b.dataset.h);
    };
    apply('');
  }

  function editor(cid, students, homes) {
    const m = P.modal(`<h3>כיתת אם לכל תלמיד</h3><datalist id="hl">${homes.map((h) => `<option value="${P.esc(h)}">`).join('')}</datalist>
      ${students.map((s) => `<div class="row" style="margin-bottom:8px" data-s="${s.id}"><b style="flex:1;min-width:0">${P.esc(s.name)}</b><input class="hc" list="hl" style="width:120px" value="${P.esc(s.home_class)}" aria-label="כיתת אם ${P.esc(s.name)}"></div>`).join('')}
      <button class="pri big" id="hsv" style="margin-top:12px">שמירה</button>`);
    P.$('#hsv', m).onclick = P.guard(async () => {
      for (const row of P.$$('[data-s]', m)) {
        const v = P.$('.hc', row).value.trim(); const s = students.find((x) => String(x.id) === row.dataset.s);
        if (v !== (s.home_class || '')) await P.put('/api/students/' + s.id, { home_class: v });
      }
      m.remove(); P.toast('נשמר'); P.router();
    });
  }
})();
