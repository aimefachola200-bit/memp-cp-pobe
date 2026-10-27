/* République du Bénin — MEMP — Bilan trimestriel / annuel des activités pédagogiques (zone et circonscription scolaire)
   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
import { h, uid, nowISO, toast, confirmBox, pickFile, readAsText, readAsBuffer, download, currentSchoolYear, today, clean } from './util.js';
import { db } from './db.js';
import { dataTable, formDialog, badge, fieldEl } from './ui.js';
import { scoped, inScope, addLog } from './data.js';
import { isEditableStatut, changeStatut } from './workflow.js';
import { getIdentity, makeCachet, registerSigned, bilanHash } from './sign.js';
import { openCamera, pickPhoto } from './camera.js';
import { TABLES, TOTAL, PERIODES, PERIODES_COURT, rowsOf, totalLabel, showTotal, cellValue, fmtCell, layoutHead, newBilan, consolidateAnnual, consolidateCS, draftAnalysis, checks, bilanLabel, inputKeys } from './bilan-schema.js';
import { bilanToPdf, bilanToXlsx, bilanToJson, bilanFromJson, bilanFromXlsx, bilanFile, tablesToShow } from './bilan-export.js';

export async function render(id, ctx) { return id === 'bilan' ? editor(ctx) : list(ctx); }

/* ---------- droits ---------- */
const mine = (u, b) => u.role === 'ADMIN' || (b.niveau === 'ZONE' && u.role === 'CP') || (b.niveau === 'CS' && u.role === 'CCS');
export const canEditB = (u, b) => mine(u, b) && inScope(u, b) && isEditableStatut(b.statut);
const canSend = (u, b) => canEditB(u, b);
const canValidateB = (u, b) => b.niveau === 'ZONE' && (u.role === 'CCS' || u.role === 'ADMIN') && b.statut === 'Transmise' && inScope(u, b);
const keyOf = (b) => [b.niveau, b.periode, b.annee, b.codeCs, b.codeZone].join('|');

const photosOf = async (id) => (await db.all('photos')).filter(p => p.bilanId === id).sort((a, b) => a.date.localeCompare(b.date));
async function saveBilan(b) { b.updated = nowISO(); await db.put('bilans', b); }
async function removeBilan(b) { await db.del('bilans', b.id); await db.delMany('photos', (await photosOf(b.id)).map(p => p.id)); }

async function signature(u, b) {
  const idn = await getIdentity();
  if (!idn || !idn.signature) { toast("Enregistrez d'abord votre signature dans « Identité numérique ».", 'err'); location.hash = '#/identite'; return null; }
  const hash = await bilanHash(b), reg = await registerSigned({ ficheId: b.id, store: 'bilans', hash, user: { ...u, codeCp: idn.codeCp || u.codeCp }, label: bilanLabel(b) });
  return { docId: reg.id, hash, codeCp: idn.codeCp, nom: `${idn.prenoms || ''} ${idn.nom || ''}`.trim(), date: reg.date, signature: idn.signature, cachet: await makeCachet(idn) };
}
async function exportB(u, b, fmt) {
  try {
    const base = clean(bilanFile(b));
    if (fmt === 'xlsx') return download(await bilanToXlsx(b), base + '.xlsx');
    if (fmt === 'json') return download(await bilanToJson(b, await photosOf(b.id)), base + '.bilan.json');
    const signed = fmt === 'pdf-signe' ? await signature(u, b) : null; if (fmt === 'pdf-signe' && !signed) return;
    download(new Blob([await bilanToPdf(b, { photos: await photosOf(b.id), signed })], { type: 'application/pdf' }), base + (signed ? '_SIGNE' : '') + '.pdf');
  } catch (e) { console.error(e); toast('Export impossible : ' + e.message, 'err', 6000); }
}
async function loadFile(u, { target } = {}) {
  const f = await pickFile('.json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); if (!f) return null;
  try {
    let b, photos = [];
    if (/\.xlsx$/i.test(f.name)) b = await bilanFromXlsx(await readAsBuffer(f), u); else ({ bilan: b, photos } = bilanFromJson(await readAsText(f)));
    if (!inScope(u, b)) throw new Error("Ce bilan n'appartient pas à votre périmètre (circonscription / zone).");
    if (u.role !== 'ADMIN' && !mine(u, b)) throw new Error(`Votre rôle ne permet pas de charger un bilan de niveau ${b.niveau === 'CS' ? 'circonscription' : 'zone'}.`);
    if (target) { if (keyOf(target) !== keyOf(b) && !(await confirmBox(`Ce fichier concerne « ${bilanLabel(b)} » alors que le bilan ouvert est « ${bilanLabel(target)} ». Le remplacer quand même ?`, 'Remplacer', true))) return null; b.id = target.id; }
    else { const dup = (await db.all('bilans')).find(x => keyOf(x) === keyOf(b)); if (dup) { if (!(await confirmBox(`Un bilan « ${bilanLabel(b)} » existe déjà. Le remplacer par le fichier chargé ?`, 'Remplacer', true))) return null; b.id = dup.id; } else b.id = b.id && !(await db.get('bilans', b.id)) ? b.id : uid(); }
    b.statut = 'Brouillon'; b.created = b.created || nowISO(); await saveBilan(b);
    await db.delMany('photos', (await photosOf(b.id)).map(p => p.id)); await db.putMany('photos', photos.map(p => ({ ...p, id: uid(), bilanId: b.id })));
    await addLog(u, { action: 'Chargement de bilan', target: bilanLabel(b), refId: b.id }); toast(`Bilan chargé : ${bilanLabel(b)}${photos.length ? ` (+ ${photos.length} photo(s))` : ''}.`); return b;
  } catch (e) { toast(e.message, 'err', 6000); return null; }
}
const resetB = async (u, b) => {
  if (!(await confirmBox('Réinitialiser ce bilan ? Toutes les valeurs saisies, listes et analyses seront effacées. L\'en-tête et les photos sont conservés.', 'Réinitialiser', true))) return false;
  const f = newBilan({ niveau: b.niveau, periode: b.periode, annee: b.annee, user: u }); b.data = {}; b.lists = f.lists; b.textes = f.textes; b.statut = 'Brouillon'; await saveBilan(b);
  await addLog(u, { action: 'Réinitialisation de bilan', target: bilanLabel(b), refId: b.id }); toast('Bilan réinitialisé.'); return true;
};
const deleteB = async (u, b) => {
  if (!canEditB(u, b)) { toast("Suppression non autorisée (bilan transmis ou hors de votre rôle).", 'err'); return false; }
  if (!(await confirmBox(`Supprimer définitivement « ${bilanLabel(b)} » et ses photos ?`, 'Supprimer', true))) return false;
  await removeBilan(b); await addLog(u, { action: 'Suppression de bilan', target: bilanLabel(b), refId: b.id }); toast('Bilan supprimé.'); return true;
};
async function sendB(u, b) {
  if (!canSend(u, b)) { toast('Transmission non autorisée.', 'err'); return false; }
  const w = checks(b); if (w.length && !(await confirmBox(`${w.length} incohérence(s) détectée(s) :\n• ${w.slice(0, 6).join('\n• ')}\nTransmettre quand même ?`, 'Transmettre'))) return false;
  await changeStatut(u, b, 'bilans', 'Transmise', b.niveau === 'ZONE' ? 'Transmission au CCS' : 'Transmission à la Direction départementale');
  toast(b.niveau === 'ZONE' ? 'Bilan transmis. Exportez le paquet depuis « Transmission & sauvegarde » pour l\'envoyer au CCS.' : 'Bilan CS finalisé et verrouillé.'); return true;
}

/* ---------- création ---------- */
async function consolidateInto(u, b) {
  const all = await scoped('bilans', u);
  if (b.periode === 'ANNUEL') { const t = all.filter(x => x.niveau === b.niveau && x.annee === b.annee && x.codeCs === b.codeCs && x.codeZone === b.codeZone && x.periode !== 'ANNUEL'); consolidateAnnual(b, t); return t.length; }
  if (b.niveau === 'CS') { const z = all.filter(x => x.niveau === 'ZONE' && x.annee === b.annee && x.periode === b.periode && x.codeCs === b.codeCs); consolidateCS(b, z); return z.length; }
  return 0;
}
async function create(u, ctx) {
  const schools = await scoped('schools', u), zones = new Set(schools.filter(s => s.numZone).map(s => String(s.numZone)));
  const v = await formDialog({ title: 'Nouveau bilan des activités pédagogiques', okLabel: 'Créer', fields: [
    { k: 'niveau', l: 'Niveau', t: 'select', options: [{ v: 'ZONE', l: 'Zone pédagogique (CP)' }, { v: 'CS', l: 'Circonscription scolaire (CCS)' }], req: true, ro: u.role !== 'ADMIN', w: 'half' },
    { k: 'periode', l: 'Période', t: 'select', options: Object.entries(PERIODES).map(([k, l]) => ({ v: k, l })), req: true, w: 'half' },
    { k: 'annee', l: 'Année scolaire', t: 'text', req: true, w: 'half' }, { k: 'zones', l: 'Nombre de zones du CS (niveau CS)', t: 'number', w: 'half' }],
    values: { niveau: u.role === 'CCS' ? 'CS' : 'ZONE', periode: 'T1', annee: currentSchoolYear(), zones: Math.max(zones.size, 3) } });
  if (!v) return;
  const niveau = u.role === 'ADMIN' ? v.niveau : u.role === 'CCS' ? 'CS' : 'ZONE';
  const b = newBilan({ niveau, periode: v.periode, annee: v.annee, user: u, zones: Math.max(1, +v.zones || 3) });
  if ((await db.all('bilans')).some(x => keyOf(x) === keyOf(b))) return toast('Un bilan existe déjà pour ce niveau, cette période et cette année.', 'warn');
  b.id = uid(); b.created = nowISO(); b.history = [{ date: nowISO(), action: 'Création', by: u.username }];
  const n = await consolidateInto(u, b); await saveBilan(b);
  await addLog(u, { action: 'Création de bilan', target: bilanLabel(b), refId: b.id }); if (n) toast(`${n} bilan(s) consolidé(s) automatiquement.`);
  ctx.go('bilan/' + b.id);
}

/* ---------- liste ---------- */
async function list(ctx) {
  const u = ctx.user; ctx.title('Bilans des activités pédagogiques', 'Bilans trimestriels et annuel — niveau zone (CP) et circonscription scolaire (CCS)');
  const COLS = [{ k: 'niveau', l: 'Niveau', text: r => r.niveau === 'CS' ? 'Circonscription' : 'Zone' }, { k: 'periode', l: 'Période', text: r => PERIODES_COURT[r.periode] }, { k: 'annee', l: 'Année' }, { k: 'zone', l: 'Zone / CS', text: r => r.niveau === 'CS' ? (r.entete.nomCs || r.codeCs) : `Zone ${r.entete.numZone || ''} — ${r.entete.nomCs || ''}` },
    { k: 'tx', l: '% visites classes', num: true, text: r => fmtCell(cellValue(r, 't21', TOTAL, 'pct'), { pct: true }) }, { k: 'pr', l: '% réussite évaluation', num: true, text: r => { const e = r.periode === 'T2' ? 'ev2' : r.periode === 'T3' ? 'ev3' : 'ev1'; return fmtCell(cellValue(r, e, TOTAL, 'pr_t'), { pct: true }); } },
    { k: 'statut', l: 'Statut', render: r => badge(r.statut) }, { k: 'updated', l: 'Modifié', text: r => (r.updated || '').slice(0, 10) }];
  const t = dataTable({ columns: COLS, rows: [], onOpen: r => ctx.go('bilan/' + r.id), empty: 'Aucun bilan. Cliquez sur « Nouveau bilan » ou « Charger ».' }); ctx.el.append(t.el);
  const refresh = async () => { t.setRows((await scoped('bilans', u)).sort((a, b) => (b.annee + b.periode).localeCompare(a.annee + a.periode))); ctx.status(`${t.rows.length} bilan(s)`); };
  const sel = () => { const s = t.selected; if (!s) toast('Sélectionnez un bilan.', 'warn'); return s; };
  const act = (fn) => async () => { const s = sel(); if (!s) return; try { if (await fn(s)) await refresh(); } catch (e) { toast(e.message, 'err'); } };
  ctx.actions([
    { label: '\uE001 Nouveau bilan', kind: 'primary', show: u.role !== 'DDEMP', onClick: () => create(u, ctx) },
    { label: '\uE014 Ouvrir', onClick: () => { const s = sel(); s && ctx.go('bilan/' + s.id); } },
    { label: '\uE00A Charger', onClick: async () => { const b = await loadFile(u); if (b) await refresh(); } },
    { label: '\uE009 PDF', onClick: act(s => exportB(u, s, 'pdf').then(() => false)) }, { label: '\uE006 PDF signé', onClick: act(s => exportB(u, s, 'pdf-signe').then(() => false)) },
    { label: '\uE009 Excel', onClick: act(s => exportB(u, s, 'xlsx').then(() => false)) }, { label: '\uE009 JSON', onClick: act(s => exportB(u, s, 'json').then(() => false)) },
    { label: '\uE058 Réinitialiser', onClick: act(s => canEditB(u, s) ? resetB(u, s) : (toast('Réinitialisation non autorisée.', 'err'), false)) },
    { label: '\uE005 Supprimer', onClick: act(s => deleteB(u, s)) },
  ]);
  await refresh();
}

/* ---------- éditeur ---------- */
const TABS = [['entete', 'En-tête'], ['t1', '1. Réseau'], ['act', '2. Activités'], ['conc', '3. Concertations'], ['t4', '4. Couverture'], ['ev', '5. Évaluations'], ['ana', '6. Analyses'], ['prob', '7. Difficultés'], ['photos', '\uE03C Photos']];

async function editor(ctx) {
  const u = ctx.user, b = await db.get('bilans', ctx.args[0]);
  if (!b || !inScope(u, b)) { ctx.el.append(h('div', { class: 'card' }, 'Bilan introuvable.')); return; }
  let editable = canEditB(u, b), timer = null, dirty = false, tab = sessionStorage.getItem('bilan-tab') || 'entete';
  ctx.title(bilanLabel(b), b.niveau === 'CS' ? `Circonscription scolaire de ${b.entete.nomCs || ''}` : `Zone pédagogique n° ${b.entete.numZone || ''} — CS ${b.entete.nomCs || ''}`);
  const state = h('span', { class: 'sub' }, 'Enregistré'), calcs = [], body = h('div'), tabsEl = h('div', { class: 'tabs' }), warn = h('div');
  async function save() { clearTimeout(timer); if (!dirty) return; dirty = false; await saveBilan(b); state.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR'); }
  const touch = () => { dirty = true; state.textContent = 'Modification…'; refreshCalcs(); clearTimeout(timer); timer = setTimeout(save, 700); };
  function refreshCalcs() { for (const c of calcs) if (c.el.isConnected) c.el.textContent = fmtCell(cellValue(b, c.tid, c.row, c.col), c.spec); const w = checks(b); warn.replaceChildren(...(w.length ? [h('div', { class: 'hint' }, h('b', '\uE041 Contrôles de cohérence : '), h('ul', w.slice(0, 8).map(x => h('li', x))))] : [])); }

  function gridTable(tid) {
    const spec = TABLES[tid], L = layoutHead(spec.head), trs = Array.from({ length: L.headRows }, () => h('tr'));
    L.cells.forEach(c => trs[c.r].append(h('th', { colSpan: c.s, rowSpan: c.rs }, c.t)));
    const body = h('tbody'), rows = rowsOf(b, spec);
    const mk = (r, label, total) => {
      const tr = h('tr', total ? { class: 'tot' } : null, h('td', { class: 'lab' }, label));
      for (const col of spec.cols) {
        if (col.f || total) { const el = h('td', { class: 'calc' }, fmtCell(cellValue(b, tid, r, col.k), col)); calcs.push({ el, tid, row: r, col: col.k, spec: col }); tr.append(el); }
        else { const key = `${tid}.${r}.${col.k}`; tr.append(h('td', h('input', { type: 'number', min: 0, inputmode: 'numeric', value: b.data[key] ?? '', disabled: !editable, 'aria-label': label, oninput: (e) => { b.data[key] = e.target.value; touch(); } }))); }
      }
      return tr;
    };
    rows.forEach(r => body.append(mk(r.k, r.l, false))); if (showTotal(b, spec)) body.append(mk(TOTAL, totalLabel(b), true));
    return h('div', { class: 'card' }, h('h3', spec.title), h('div', { class: 'gridwrap' }, h('table', { class: 'g p' }, h('thead', trs), body)), ...(spec.notes || []).map(n => h('p', { class: 'notes' }, n)));
  }
  function listEditor(name, cols, newRow, titleTxt, hint) {
    const tb = h('tbody'), draw = () => tb.replaceChildren(...b.lists[name].map((r, i) => h('tr', h('td', { class: 'n' }, String(i + 1)), ...cols.map(c => h('td', h(c.area ? 'textarea' : 'input', { type: c.num ? 'number' : 'text', rows: 2, value: r[c.k] ?? '', style: { textAlign: 'left', minWidth: c.w || '110px' }, disabled: !editable, 'aria-label': c.l, oninput: (e) => { r[c.k] = e.target.value; touch(); } }, c.area ? (r[c.k] ?? '') : undefined))),
      h('td', editable ? h('button', { class: 'btn sm', title: 'Retirer', onclick: () => { b.lists[name].splice(i, 1); touch(); draw(); } }, '✕') : null))));
    draw();
    return h('div', { class: 'card' }, h('h3', titleTxt), hint ? h('p', { class: 'notes' }, hint) : null, h('div', { class: 'gridwrap' }, h('table', { class: 'g p' }, h('thead', h('tr', h('th', 'N°'), ...cols.map(c => h('th', c.l)), h('th', ''))), tb)),
      editable ? h('p', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: () => { b.lists[name].push(newRow()); touch(); draw(); } }, '\uE001 Ajouter une ligne'),
        name === 'problemes' ? h('button', { class: 'btn sm', onclick: () => { b.lists.problemes.sort((x, y) => (+y.ampleur || 0) - (+x.ampleur || 0)); touch(); draw(); } }, '\uE040 Trier par ampleur') : null) : null);
  }
  const area = (k, l, rows = 4) => h('label', { class: 'field c12' }, h('span', l), h('textarea', { rows, disabled: !editable, oninput: (e) => { b.textes[k] = e.target.value; touch(); } }, b.textes[k] || ''));

  function photosView() {
    const wrap = h('div', { class: 'photo-grid' });
    const draw = async () => {
      const ps = await photosOf(b.id);
      wrap.replaceChildren(...(ps.length ? ps.map(p => h('figure', { class: 'photo' }, h('img', { src: p.data, alt: p.legende || 'Photo' }), h('input', { type: 'text', placeholder: 'Légende (activité, lieu, date…)', value: p.legende || '', disabled: !editable, oninput: async (e) => { p.legende = e.target.value; await db.put('photos', p); } }),
        h('figcaption', `${new Date(p.date).toLocaleString('fr-FR')} · ${p.facing === 'user' ? 'caméra avant' : p.facing === 'environment' ? 'caméra arrière' : 'galerie'}`),
        editable ? h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox('Supprimer cette photo ?', 'Supprimer', true)) { await db.del('photos', p.id); draw(); } } }, '\uE005 Supprimer') : null)) : [h('div', { class: 'empty' }, 'Aucune photo. Utilisez l\'appareil photo (caméra avant ou arrière) pour joindre des preuves : elles seront ajoutées en annexe du PDF.')]));
    };
    const add = async (data, facing) => { await db.put('photos', { id: uid(), bilanId: b.id, data, facing, legende: '', date: nowISO() }); draw(); };
    draw();
    return h('div', { class: 'card' }, h('h3', 'Preuves photographiques'), editable ? h('p', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn primary', onclick: () => openCamera({ onCapture: add, title: 'Appareil photo — avant / arrière' }) }, '\uE03C Ouvrir l\'appareil photo'),
      h('button', { class: 'btn', onclick: async () => { for (const p of await pickPhoto()) await add(p.data, p.facing); } }, '\uE046 Ajouter depuis la galerie')) : null, wrap);
  }

  function show() {
    sessionStorage.setItem('bilan-tab', tab); calcs.length = 0;
    tabsEl.replaceChildren(...TABS.map(([k, l]) => h('button', { class: 'tab' + (k === tab ? ' on' : ''), onclick: () => { tab = k; show(); } }, l)));
    const e = b.entete, ef = (k, l, t = 'text', w = 'half', extra = {}) => fieldEl({ k, l, t, w, ...extra }, e[k], (kk, v) => { e[kk] = v; touch(); });
    const dis = (el) => { if (!editable) el.querySelectorAll('input,select,textarea').forEach(i => { i.disabled = true; }); return el; };
    const eva = b.periode === 'ANNUEL' ? ['ev1', 'ev2', 'ev3'] : ['ev' + b.periode.slice(1)];
    const views = {
      entete: () => [dis(h('div', { class: 'card' }, h('h3', 'En-tête du bilan'), h('div', { class: 'grid12' }, ef('departement', 'Direction départementale (département)'), ef('nomCs', 'Circonscription scolaire'), b.niveau === 'ZONE' ? ef('numZone', 'Zone pédagogique n°') : null, ef('dateVisite', 'Période / dates des activités'), ef('lieu', 'Fait à'), ef('dateBilan', 'Date du bilan', 'date'), ef('auteur', 'Nom et prénoms de l\'auteur'), ef('titreAuteur', 'Qualité de l\'auteur')))),
        h('div', { class: 'card' }, h('h3', 'Aide'), h('p', 'Les cellules grisées se calculent seules. Les tableaux comportent une ligne par acteur (' + b.actors.map(a => a.l).join(', ') + ') et un total.'), h('p', b.periode === 'ANNUEL' ? 'Bilan annuel : utilisez « Σ Consolider » pour cumuler les trois trimestres.' : b.niveau === 'CS' ? 'Bilan CS : importez les bilans de zone reçus des CP (paquets), puis « Σ Consolider ».' : 'Utilisez « \uE03D Pré-remplir » pour reprendre le nombre d\'écoles de votre zone.'))],
      t1: () => [gridTable('t1')], act: () => ['t21', 't22', 't23', 't24', 't25'].map(gridTable),
      conc: () => [gridTable('t31'), listEditor('autres', [{ k: 'lieu', l: 'Lieu' }, { k: 'periode', l: 'Période' }, { k: 'designation', l: 'Désignation de l\'activité', area: true, w: '240px' }, { k: 'participants', l: 'Participants' }], () => ({ lieu: '', periode: '', designation: '', participants: '' }), '3.2 Autres activités menées', 'Réunions, ateliers, journées pédagogiques, accompagnements spécifiques, etc.')],
      t4: () => [gridTable('t4')], ev: () => eva.map(gridTable),
      ana: () => [dis(h('div', { class: 'card' }, h('h3', '6. Analyses'), editable ? h('p', h('button', { class: 'btn', onclick: async () => { const d = draftAnalysis(b), keys = Object.keys(d).filter(k => d[k]); if (!keys.length) return toast("Renseignez d'abord les résultats de l'évaluation et les activités.", 'warn'); const filled = keys.filter(k => (b.textes[k] || '').trim()); if (filled.length && !(await confirmBox('Certaines analyses sont déjà rédigées. Les écraser par le brouillon automatique ?', 'Écraser'))) keys.forEach(k => { if (filled.includes(k)) delete d[k]; }); Object.assign(b.textes, d); touch(); show(); } }, '\uE03D Générer un brouillon d\'analyse (à relire)')) : null,
        h('div', { class: 'grid12' }, area('quant', '6.1 Analyse quantitative'), area('qual', '6.2 Analyse qualitative'), area('genre', '6.3 Performances selon le genre', 3), area('champs', '6.4 Performances selon les disciplines (Français, Mathématiques…)', 3), area('up', '6.5 Apport des unités pédagogiques (UP)', 3), area('conclusion', '6.6 Conclusion', 3))))],
      prob: () => [listEditor('problemes', [{ k: 'designation', l: 'Désignation du problème', area: true, w: '230px' }, { k: 'ampleur', l: 'Ampleur (%)', num: true, w: '70px' }, { k: 'obs', l: 'Observations / solutions envisagées', area: true, w: '260px' }], () => ({ designation: '', ampleur: '', obs: '' }), '7. Difficultés majeures rencontrées', 'Classez-les par ordre d\'importance (ampleur en % des écoles/classes concernées).'),
        dis(h('div', { class: 'card' }, h('h3', 'Commentaires et perspectives'), h('div', { class: 'grid12' }, area('commentaires', 'Commentaires'), area('perspectives', 'Perspectives et recommandations'))))],
      photos: () => [photosView()],
    };
    body.replaceChildren(...views[tab]()); refreshCalcs();
  }

  const reload = () => ctx.reload();
  const actions = () => [
    { label: '\uE00A Charger', show: editable, onClick: async () => { await save(); const nb = await loadFile(u, { target: b }); if (nb) reload(); } },
    { label: '\uE009 PDF', onClick: async () => { await save(); exportB(u, b, 'pdf'); } }, { label: '\uE006 PDF signé', show: mine(u, b), onClick: async () => { await save(); exportB(u, b, 'pdf-signe'); } },
    { label: '\uE009 Excel', onClick: async () => { await save(); exportB(u, b, 'xlsx'); } }, { label: '\uE009 JSON', onClick: async () => { await save(); exportB(u, b, 'json'); } },
    { label: '\uE03C Appareil photo', show: editable, onClick: () => { tab = 'photos'; show(); openCamera({ onCapture: async (data, facing) => { await db.put('photos', { id: uid(), bilanId: b.id, data, facing, legende: '', date: nowISO() }); if (tab === 'photos') show(); } }); } },
    { label: '\uE03D Pré-remplir', show: editable && b.periode !== 'ANNUEL' && b.niveau === 'ZONE', onClick: async () => { const sc = (await scoped('schools', u)).filter(s => !b.codeZone || s.codeZone === b.codeZone); const a = b.actors[0].k; b.data[`t1.${a}.em_e`] = String(sc.filter(s => s.cycle === 'Maternelle').length); b.data[`t1.${a}.ep_e`] = String(sc.filter(s => s.cycle === 'Primaire').length); touch(); show(); toast(`${sc.length} école(s) reprise(s) depuis la base. Complétez les classes et effectifs.`); } },
    { label: 'Σ Consolider', show: editable && (b.periode === 'ANNUEL' || b.niveau === 'CS'), onClick: async () => { if (!(await confirmBox('Recalculer ce bilan à partir des ' + (b.periode === 'ANNUEL' ? 'trois trimestres' : 'bilans de zone') + ' disponibles ? Les valeurs saisies concernées seront remplacées.', 'Consolider'))) return; const n = await consolidateInto(u, b); if (!n) return toast('Aucun bilan source trouvé sur cet appareil.', 'warn'); dirty = true; await save(); toast(`${n} bilan(s) consolidé(s).`); reload(); } },
    { label: '\uE00C Transmettre', kind: 'accent', show: canSend(u, b), onClick: async () => { await save(); if (await sendB(u, b)) reload(); } },
    { label: '\uE004 Valider', kind: 'accent', show: canValidateB(u, b), onClick: async () => { const { promptBox } = await import('./util.js'); const c = await promptBox('Validation', 'Commentaire (facultatif)'); if (c === null) return; await changeStatut(u, b, 'bilans', 'Validée', 'Validation CCS', c); reload(); } },
    { label: '\uE037 Correction', show: canValidateB(u, b), onClick: async () => { const { promptBox } = await import('./util.js'); const c = await promptBox('Demande de correction', 'Corrections attendues'); if (!c) return; await changeStatut(u, b, 'bilans', 'À corriger', 'Demande de correction', c); reload(); } },
    { label: '\uE034 Rouvrir', show: !editable && (u.role === 'ADMIN' || (b.niveau === 'CS' && u.role === 'CCS' && inScope(u, b))) && b.statut !== 'Brouillon', onClick: async () => { await changeStatut(u, b, 'bilans', 'Brouillon', 'Réouverture'); reload(); } },
    { label: '\uE058 Réinitialiser', show: editable, onClick: async () => { if (await resetB(u, b)) reload(); } },
    { label: '\uE005 Supprimer', show: editable, onClick: async () => { if (await deleteB(u, b)) ctx.go('bilans'); } },
    { label: '← Liste', onClick: async () => { await save(); ctx.go('bilans'); } },
  ];
  ctx.actions(actions());
  ctx.el.append(h('div', { class: 'card' }, h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, h('h3', bilanLabel(b)), badge(b.statut), state)), b.comment ? h('div', { class: 'hint' }, h('b', 'Commentaire du CCS : '), b.comment) : null, warn, tabsEl, body);
  show();
  return async () => { await save(); };
}
