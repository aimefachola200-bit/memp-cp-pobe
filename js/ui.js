/* République du Bénin — MEMP — Composants d'interface : grand tableau, formulaires, barre d'actions
   Conception : Maître Aimé FACHE */
import { h, modal, norm, toast } from './util.js';

/** Grand tableau : recherche, tri, pagination, sélection d'une ligne */
export function dataTable({ columns, rows = [], getId = (r) => r.id, onOpen, onSelect, pageSize = 50, empty = 'Aucune donnée.', totals = null, tools = [] }) {
  let data = rows, sortK = null, sortDir = 1, page = 0, q = '', sel = null;
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher', oninput: (e) => { q = norm(e.target.value); page = 0; draw(); } });
  const count = h('span', { class: 'count' });
  const wrap = h('div', { class: 'tbl-wrap' });
  const pager = h('div', { class: 'pager no-print' });
  const el = h('div', {}, h('div', { class: 'tbl-tools no-print' }, search, count, ...tools), wrap, pager);
  const cellText = (c, r) => { const v = c.text ? c.text(r) : r[c.k]; return v === null || v === undefined ? '' : String(v); };
  function filtered() {
    let a = data;
    if (q) a = a.filter(r => columns.some(c => norm(cellText(c, r)).includes(q)));
    if (sortK) {
      const c = columns.find(x => x.k === sortK);
      a = [...a].sort((x, y) => {
        const vx = cellText(c, x), vy = cellText(c, y);
        const nx = parseFloat(vx), ny = parseFloat(vy);
        if (c.num && !isNaN(nx) && !isNaN(ny)) return (nx - ny) * sortDir;
        return vx.localeCompare(vy, 'fr', { numeric: true }) * sortDir;
      });
    }
    return a;
  }
  function draw() {
    const a = filtered(), pages = Math.max(1, Math.ceil(a.length / pageSize));
    if (page >= pages) page = pages - 1;
    const slice = a.slice(page * pageSize, (page + 1) * pageSize);
    count.textContent = `${a.length} ligne(s)` + (a.length !== data.length ? ` sur ${data.length}` : '');
    wrap.replaceChildren();
    if (!a.length) { wrap.appendChild(h('div', { class: 'empty' }, empty)); }
    else {
      const thead = h('thead', h('tr', columns.map(c => h('th', { class: c.num ? 'num' : '', style: c.w ? { minWidth: c.w + 'px' } : null, title: 'Trier', onclick: () => { if (sortK === c.k) sortDir = -sortDir; else { sortK = c.k; sortDir = 1; } draw(); } }, c.l + (sortK === c.k ? (sortDir > 0 ? ' ▲' : ' ▼') : '')))));
      const tbody = h('tbody', slice.map(r => {
        const id = getId(r);
        const tr = h('tr', { class: id === sel ? 'sel' : '', 'data-id': id, tabindex: 0,
          onclick: () => { sel = id; wrap.querySelectorAll('tr.sel').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); onSelect && onSelect(r); },
          ondblclick: () => onOpen && onOpen(r),
          onkeydown: (e) => { if (e.key === 'Enter') onOpen && onOpen(r); } },
          columns.map(c => h('td', { class: c.num ? 'num' : '' }, c.render ? c.render(r) : cellText(c, r))));
        return tr;
      }));
      const parts = [thead, tbody];
      if (totals) parts.push(h('tfoot', h('tr', columns.map((c, i) => h('td', { class: c.num ? 'num' : '' }, totals[c.k] ?? (i === 0 ? 'TOTAL' : ''))))));
      wrap.appendChild(h('table', { class: 't fixe1' }, parts));
    }
    pager.replaceChildren(
      h('button', { class: 'btn sm', disabled: page === 0, onclick: () => { page--; draw(); } }, '\uE038 Précédent'),
      h('span', `Page ${page + 1} / ${pages}`),
      h('button', { class: 'btn sm', disabled: page >= pages - 1, onclick: () => { page++; draw(); } }, 'Suivant \uE039'));
    pager.classList.toggle('hidden', pages <= 1);
  }
  draw();
  return { el, setRows(r) { data = r; if (sel && !r.find(x => getId(x) === sel)) sel = null; draw(); }, get selected() { return sel ? data.find(r => getId(r) === sel) : null; }, get rows() { return data; }, get visible() { return filtered(); }, clearSel() { sel = null; draw(); } };
}

/** Construit les contrôles d'un champ de formulaire */
export function fieldEl(f, value, onInput) {
  const cls = 'field' + (f.t === 'check' ? ' check' : '') + (f.ro ? ' ro' : '');
  let input;
  const set = (v) => onInput && onInput(f.k, v);
  const attrs = { id: 'f-' + f.k, name: f.k, disabled: f.ro && f.t !== 'text' && f.t !== 'number' };
  if (f.t === 'select') {
    input = h('select', { ...attrs, onchange: (e) => set(e.target.value) }, h('option', { value: '' }, '—'), (f.options || []).map(o => h('option', { value: o.v ?? o, selected: (o.v ?? o) === value }, o.l ?? o)));
    if (value && ![...input.options].some(o => o.value === value)) input.appendChild(h('option', { value, selected: true }, value));
    input.value = value ?? '';
  } else if (f.t === 'textarea') input = h('textarea', { ...attrs, oninput: (e) => set(e.target.value) }, value ?? '');
  else if (f.t === 'check') input = h('input', { ...attrs, type: 'checkbox', checked: !!value, onchange: (e) => set(e.target.checked) });
  else {
    input = h('input', { ...attrs, type: f.t === 'number' ? 'number' : f.t === 'date' ? 'date' : f.t === 'password' ? 'password' : 'text', value: value ?? '', list: f.list, min: f.t === 'number' ? 0 : null, inputmode: f.t === 'number' ? 'numeric' : null, readOnly: f.ro, autocomplete: f.t === 'password' ? 'new-password' : 'off', oninput: (e) => set(e.target.value) });
  }
  return h('label', { class: cls + ' ' + (f.w ? 'c' + ({ half: 6, third: 4, q: 3 }[f.w] || 12) : 'c12') }, f.t === 'check' ? [input, h('span', f.l)] : [h('span', f.l + (f.req ? ' *' : '')), input]);
}

/** Boîte de dialogue de formulaire ; résout avec les valeurs ou null */
export function formDialog({ title, fields, values = {}, okLabel = 'Enregistrer', wide = false, validate }) {
  return new Promise((res) => {
    const v = { ...values };
    const grid = h('div', { class: 'grid12' }, fields.map(f => fieldEl(f, v[f.k], (k, val) => { v[k] = val; })));
    modal({ title, wide, body: grid, onClose: () => res(null),
      actions: [{ label: 'Annuler', onClick: () => res(null) },
        { label: okLabel, kind: 'primary', keepOpen: true, onClick: async (e, close) => {
          for (const f of fields) if (f.req && (v[f.k] === undefined || v[f.k] === '' || v[f.k] === null)) { toast(`« ${f.l} » est obligatoire`, 'err'); return false; }
          if (validate) { const m = await validate(v); if (m) { toast(m, 'err'); return false; } }
          res(v); close(); return true;
        } }] });
  });
}

/** Barre d'actions : [{label, kind, onClick, show}] */
export function actionBar(bar, actions) {
  bar.replaceChildren(...actions.filter(a => a.show !== false).map(a => h('button', { class: 'btn ' + (a.kind || ''), title: a.title || '', onclick: a.onClick }, a.label)));
}

export function badge(statut) { return h('span', { class: 'badge ' + (statut === 'À corriger' ? 'corriger' : statut) }, statut || ''); }
