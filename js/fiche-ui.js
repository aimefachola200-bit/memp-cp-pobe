/* République du Bénin — MEMP — Éditeur de fiche (champs, grilles à calcul automatique, état nominatif)
   Conception : Maître Aimé FACHE */
import { h, nowISO, toast, fmtDateTime } from './util.js';
import { db } from './db.js';
import { badge, fieldEl } from './ui.js';
import { FICHE_TYPES, sectionsFor, gridHead, gridKey, gridValue, isCalc, fmtVal } from './schema.js';
import { canEdit, canTransmit, canValidate, completion, transmit, validate, requestCorrection, unlock, exportFiche } from './workflow.js';
import { inScope } from './data.js';

export async function render(id, ctx) {
  const u = ctx.user, fid = ctx.args[0], fiche = await db.get('fiches', fid);
  if (!fiche || !inScope(u, fiche)) { ctx.el.append(h('div', { class: 'card' }, 'Fiche introuvable ou hors de votre périmètre.')); return; }
  const T = FICHE_TYPES[fiche.kind], sections = sectionsFor(fiche.kind);
  let editable = canEdit(u, fiche), cur = 0, timer = null, dirty = false;
  ctx.title(T.label, `${fiche.schoolNom} — ${fiche.annee}`);

  const saveState = h('span', { class: 'sub' }, 'Enregistré');
  const progress = h('i'), pct = h('b');
  const head = h('div', { class: 'card', style: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' } },
    h('div', h('h3', fiche.schoolNom), h('span', { class: 'sub' }, `${T.court} · ${fiche.annee} · `), badge(fiche.statut)),
    h('div', { style: { flex: 1, minWidth: '160px' } }, h('div', { class: 'progress' }, progress), h('small', pct, ' remplie')), saveState,
    fiche.comment ? h('div', { class: 'hint', style: { flex: '1 1 100%', margin: 0 } }, h('b', 'Commentaire du CCS : '), fiche.comment) : null,
    !editable ? h('div', { class: 'hint', style: { flex: '1 1 100%', margin: 0 } }, `Fiche en lecture seule (statut « ${fiche.statut} »).`) : null);
  const content = h('div'), navEl = h('div', { class: 'ed-nav no-print' });
  ctx.el.append(head, h('div', { class: 'ed' }, navEl, content));

  const upd = () => { const c = completion(fiche); progress.style.width = c + '%'; pct.textContent = c + ' %'; };
  async function save() { clearTimeout(timer); if (!dirty) return; dirty = false; fiche.updated = nowISO(); await db.put('fiches', fiche); saveState.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  const touch = () => { dirty = true; saveState.textContent = 'Modification…'; upd(); clearTimeout(timer); timer = setTimeout(save, 700); };

  /* ---- sections ---- */
  function fieldsSection(s) {
    const g = h('div', { class: 'grid12' }, s.fields.map(f => { const el = fieldEl({ ...f, ro: !editable && false }, fiche.data[f.k], (k, v) => { fiche.data[k] = v; touch(); }); if (!editable) el.querySelectorAll('input,select,textarea').forEach(i => { i.disabled = true; }); return el; }));
    return h('div', g, (s.notes || []).map(n => h('p', { class: 'notes' }, n)));
  }
  function gridSection(s) {
    const hd = gridHead(s), calcs = [];
    const thead = h('thead', Array.from({ length: hd.headRows }, (_, r) => h('tr', hd.cells.filter(c => (c.r || 0) === r).map(c => h('th', { colspan: c.s || 1, rowspan: c.rs || 1 }, c.t)))));
    const tbody = h('tbody', s.rows.map(row => h('tr', h('td', { class: 'lab' }, row.l), hd.flat.map(({ g, c }) => {
      if (isCalc(s, g, c)) { const td = h('td', { class: 'calc' }, fmtVal(gridValue(fiche.data, s, row.k, g, c))); calcs.push({ td, r: row.k, g, c }); return td; }
      const key = gridKey(s, row.k, g, c);
      return h('td', h('input', { type: 'number', min: 0, inputmode: 'numeric', value: fiche.data[key] ?? '', disabled: !editable, 'aria-label': `${row.l} ${g} ${c}`,
        oninput: (e) => { fiche.data[key] = e.target.value; calcs.forEach(x => { x.td.textContent = fmtVal(gridValue(fiche.data, s, x.r, x.g, x.c)); }); touch(); } }));
    }))));
    return h('div', h('div', { class: 'gridwrap' }, h('table', { class: 'g' }, thead, tbody)),
      s.extra ? h('div', { class: 'grid12', style: { marginTop: '10px' } }, s.extra.map(f => { const el = fieldEl(f, fiche.data[f.k], (k, v) => { fiche.data[k] = v; touch(); }); if (!editable) el.querySelectorAll('input').forEach(i => { i.disabled = true; }); return el; })) : null);
  }
  function persoSection(s) {
    const box = h('div');
    const draw = () => {
      const head = h('thead', h('tr', h('th', 'N°'), s.cols.map(c => h('th', { style: { minWidth: (c.w || 110) + 'px' } }, c.l)), editable ? h('th', '') : null));
      const body = h('tbody', fiche.perso.map((p, i) => h('tr', h('td', { class: 'n' }, String(i + 1).padStart(2, '0')), s.cols.map(c => h('td', cell(p, c))), editable ? h('td', h('button', { class: 'icon-btn', title: 'Supprimer la ligne', onclick: () => { fiche.perso.splice(i, 1); touch(); draw(); } }, '🗑')) : null)));
      box.replaceChildren(h('div', { class: 'gridwrap' }, h('table', { class: 'g p' }, head, body)),
        editable ? h('p', h('button', { class: 'btn sm', onclick: () => { fiche.perso.push({ fonction: s.otherFonction }); touch(); draw(); } }, '➕ Ajouter une ligne')) : null,
        ...s.notes.map(n => h('p', { class: 'notes' }, n)));
    };
    function cell(p, c) {
      const set = (v) => { p[c.k] = v; touch(); };
      if (c.t === 'select') return h('select', { disabled: !editable, onchange: (e) => set(e.target.value) }, h('option', { value: '' }, '—'), c.options.map(o => h('option', { value: o, selected: p[c.k] === o }, o)));
      if (c.t === 'multi') { const cur = Array.isArray(p[c.k]) ? p[c.k] : []; return h('div', { class: 'multi' }, c.options.map(o => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: cur.includes(o), disabled: !editable, onchange: (e) => { const a = new Set(Array.isArray(p[c.k]) ? p[c.k] : []); e.target.checked ? a.add(o) : a.delete(o); set(c.options.filter(x => a.has(x))); } }), o))); }
      return h('input', { type: c.t === 'number' ? 'number' : c.t === 'date' ? 'date' : 'text', value: p[c.k] ?? '', disabled: !editable, inputmode: c.t === 'number' ? 'numeric' : null, 'aria-label': c.l, oninput: (e) => set(e.target.value) });
    }
    draw(); return box;
  }
  function historySection() {
    return h('div', (fiche.history || []).slice().reverse().map(x => h('div', { class: 'result', style: { cursor: 'default' } }, h('b', x.action), ' ', h('small', `${fmtDateTime(x.date)} · ${x.by || ''}${x.role ? ' (' + x.role + ')' : ''}`), x.comment ? h('div', x.comment) : null, x.from ? h('small', `${x.from} → ${x.to}`) : null)));
  }
  function show(i) {
    cur = i; const s = sections[i];
    [...navEl.children].forEach((b, k) => b.classList.toggle('on', k === i));
    content.replaceChildren(h('h3', { class: 'sec-title' }, s ? s.title : 'Historique de la fiche'), h('div', { class: 'sec-body' }, !s ? historySection() : s.type === 'fields' ? fieldsSection(s) : s.type === 'grid' ? gridSection(s) : persoSection(s)),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'space-between', margin: '10px 0' }, class: 'no-print' },
        h('button', { class: 'btn', disabled: i === 0, onclick: () => show(i - 1) }, '◀ Précédent'), h('button', { class: 'btn primary', disabled: i >= sections.length, onclick: () => show(i + 1) }, i >= sections.length - 1 ? 'Historique ▶' : 'Suivant ▶')));
    window.scrollTo({ top: 0 });
  }
  [...sections, { title: 'Historique' }].forEach((s, i) => navEl.appendChild(h('button', { onclick: () => show(i) }, s.title.replace(/^([IVX]+\.|\d+(\.\d+)?\.?)\s*/, (m) => m))));
  upd(); show(0);

  const back = async () => { await save(); ctx.go('fiches'); };
  const doAct = (fn) => async () => { await save(); const fresh = await db.get('fiches', fid); Object.assign(fiche, fresh); if (await fn(fresh)) ctx.reload(); };
  ctx.actions([
    { label: '◀ Liste', onClick: back }, { label: '💾 Enregistrer', kind: 'primary', onClick: async () => { dirty = true; await save(); toast('Fiche enregistrée.'); } },
    { label: '⬇ PDF', onClick: async () => { await save(); await exportFiche(fiche, 'pdf'); } }, { label: '🖋 PDF signé', onClick: async () => { await save(); await exportFiche(fiche, 'pdf', { signed: true }); } },
    { label: '⬇ Excel', onClick: async () => { await save(); await exportFiche(fiche, 'xlsx'); } },
    { label: '📤 Transmettre au CCS', show: canTransmit(u, fiche), kind: 'accent', onClick: doAct(f => transmit(u, f)) },
    { label: '✅ Valider', show: canValidate(u, fiche), kind: 'accent', onClick: doAct(f => validate(u, f)) },
    { label: '↩ Demander correction', show: canValidate(u, fiche), onClick: doAct(f => requestCorrection(u, f)) },
    { label: '🔓 Déverrouiller', show: u.role === 'ADMIN' && ['Transmise', 'Validée'].includes(fiche.statut), onClick: doAct(f => unlock(u, f)) },
  ]);
  ctx.status('Enregistrement automatique activé.');
  const onHide = () => { if (document.visibilityState === 'hidden') save(); };
  document.addEventListener('visibilitychange', onHide);
  return async () => { document.removeEventListener('visibilitychange', onHide); await save(); };
}
