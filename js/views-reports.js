/* République du Bénin — MEMP — Rapports de fin d'année par classe (EP)
   Conception : Maître Aimé FACHOLA */
import { h, uid, nowISO, toast, confirmBox, currentSchoolYear, today, modal, norm } from './util.js';
import { db } from './db.js';
import { dataTable, formDialog, badge, fieldEl } from './ui.js';
import { scoped, inScope, addLog, schoolLabel } from './data.js';
import { CLASSES, STATUTS_FICHE } from './schema.js';
import { reportStats, DECISIONS } from './export.js';
import { canEdit, canTransmit, canValidate, transmit, validate, requestCorrection, unlock, exportReport } from './workflow.js';

export async function render(id, ctx) { return id === 'rapport' ? editor(ctx) : list(ctx); }

async function list(ctx) {
  const u = ctx.user; ctx.title("Rapports de fin d'année", 'Bilan des évaluations par classe — résultats, décisions, statistiques');
  const COLS = [{ k: 'schoolNom', l: 'École', w: 200 }, { k: 'cours', l: 'Cours' }, { k: 'annee', l: 'Année' }, { k: 'ins', l: 'Inscrits', num: true, text: r => reportStats(r.rows || []).inscrits.T }, { k: 'pr', l: '% réussite', num: true, text: r => reportStats(r.rows || []).pctReussite.T ?? '' }, { k: 'statut', l: 'Statut', render: r => badge(r.statut) }, { k: 'comment', l: 'Commentaire CCS' }];
  const t = dataTable({ columns: COLS, rows: [], onOpen: (r) => ctx.go('rapport/' + r.id), empty: 'Aucun rapport. Cliquez sur « Nouveau rapport ».' });
  ctx.el.append(t.el);
  const refresh = async () => { t.setRows((await scoped('classReports', u)).sort((a, b) => b.updated.localeCompare(a.updated))); ctx.status(`${t.rows.length} rapport(s)`); };
  const sel = () => { const s = t.selected; if (!s) toast('Sélectionnez un rapport.', 'warn'); return s; };
  const act = (fn) => async () => { const s = sel(); if (!s) return; try { if (await fn(s)) await refresh(); } catch (e) { toast(e.message, 'err'); } };
  async function create() {
    const schools = (await scoped('schools', u)).filter(s => s.cycle === 'Primaire'); if (!schools.length) return toast("Ajoutez d'abord une école primaire.", 'warn');
    const v = await formDialog({ title: 'Nouveau rapport de fin d\'année', okLabel: 'Créer', fields: [
      { k: 'schoolId', l: 'École', t: 'select', options: schools.map(s => ({ v: s.id, l: schoolLabel(s) })), req: true }, { k: 'cours', l: 'Cours', t: 'select', options: CLASSES, req: true, w: 'half' }, { k: 'annee', l: 'Année scolaire', t: 'text', req: true, w: 'half' }], values: { annee: currentSchoolYear() } });
    if (!v) return; const s = schools.find(x => x.id === v.schoolId);
    if ((await db.all('classReports')).some(r => r.schoolId === s.id && r.cours === v.cours && r.annee === v.annee)) return toast('Un rapport existe déjà pour cette école, ce cours et cette année.', 'warn');
    const r = { id: uid(), annee: v.annee, schoolId: s.id, schoolCode: s.code || '', schoolNom: s.nom, nomCs: s.nomCs, departement: s.departement, codeZone: s.codeZone || '', codeCs: s.codeCs || '', cours: v.cours, lieu: s.commune || '', dateRapport: today(), rows: Array.from({ length: 30 }, () => ({ nom: '', sexe: '', ev: [0, 0, 0, 0, 0], decision: '', obs: '' })), statut: 'Brouillon', comment: '', history: [{ date: nowISO(), action: 'Création', by: u.username }], created: nowISO(), updated: nowISO() };
    await db.put('classReports', r); ctx.go('rapport/' + r.id);
  }
  ctx.actions([
    { label: '\uE001 Nouveau rapport', kind: 'primary', show: u.role !== 'CCS' && u.role !== 'DDEMP', onClick: create }, { label: '\uE014 Ouvrir', onClick: () => { const s = sel(); s && ctx.go('rapport/' + s.id); } },
    { label: '\uE00C Transmettre', show: u.role !== 'CCS' && u.role !== 'DDEMP', onClick: act(s => transmit(u, s, 'classReports')) },
    { label: '\uE004 Valider', show: u.role !== 'CP' && u.role !== 'DDEMP', kind: 'accent', onClick: act(s => validate(u, s, 'classReports')) }, { label: '\uE037 Correction', show: u.role !== 'CP' && u.role !== 'DDEMP', onClick: act(s => requestCorrection(u, s, 'classReports')) },
    { label: '\uE034 Déverrouiller', show: u.role === 'ADMIN', onClick: act(s => unlock(u, s, 'classReports')) },
    { label: '\uE009 PDF', onClick: act(s => exportReport(s, 'pdf').then(() => false)) }, { label: '\uE006 PDF signé', onClick: act(s => exportReport(s, 'pdf', { signed: true }).then(() => false)) }, { label: '\uE009 Excel', onClick: act(s => exportReport(s, 'xlsx').then(() => false)) },
    { label: '\uE005 Supprimer', show: u.role !== 'CCS' && u.role !== 'DDEMP', onClick: act(async s => { if (!canEdit(u, s)) { toast('Suppression non autorisée.', 'err'); return false; } if (!(await confirmBox('Supprimer ce rapport ?', 'Supprimer', true))) return false; await db.del('classReports', s.id); return true; }) },
  ]);
  await refresh();
}

async function editor(ctx) {
  const u = ctx.user, rid = ctx.args[0], rep = await db.get('classReports', rid);
  if (!rep || !inScope(u, rep)) { ctx.el.append(h('div', { class: 'card' }, 'Rapport introuvable.')); return; }
  const editable = canEdit(u, rep); let timer = null, dirty = false;
  ctx.title(`Rapport de fin d'année — ${rep.cours}`, `${rep.schoolNom} · ${rep.annee}`);
  const state = h('span', { class: 'sub' }, 'Enregistré');
  async function save() { clearTimeout(timer); if (!dirty) return; dirty = false; rep.updated = nowISO(); await db.put('classReports', rep); state.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR'); }
  const touch = () => { dirty = true; state.textContent = 'Modification…'; stats(); clearTimeout(timer); timer = setTimeout(save, 700); };
  const statBox = h('div', { class: 'card' });
  function stats() {
    const S = reportStats(rep.rows), r = (l, o) => h('tr', h('td', { class: 'lab' }, l), ['G', 'F', 'T'].map(k => h('td', { class: 'calc' }, o[k] ?? '')));
    statBox.replaceChildren(h('h3', 'Statistiques (automatiques)'), h('div', { class: 'gridwrap' }, h('table', { class: 'g' }, h('thead', h('tr', h('th', 'Effectif'), h('th', 'Garçons'), h('th', 'Filles'), h('th', 'Total'))),
      h('tbody', r('Inscrits', S.inscrits), r('Ont composé', S.compose), r('Ont atteint le seuil de réussite (Admis)', S.seuil), r("N'ont pas atteint le seuil (Redouble)", S.pasSeuil), r('Abandons', S.abandon), r('% de réussite', S.pctReussite), r("% d'échec", S.pctEchec)))),
      h('p', { class: 'notes' }, 'Renseignez le sexe (G/F) et la décision (Admis, Redouble, Abandon) de chaque apprenant : les statistiques se calculent seules.'));
  }
  const dis = (el) => { if (!editable) el.querySelectorAll('input,select,textarea').forEach(i => { i.disabled = true; }); return el; };
  const meta = h('div', { class: 'card' }, h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, h('h3', rep.schoolNom), badge(rep.statut), state),
    rep.comment ? h('div', { class: 'hint' }, h('b', 'Commentaire du CCS : '), rep.comment) : null,
    dis(h('div', { class: 'grid12' }, fieldEl({ k: 'cours', l: 'Cours', t: 'select', options: CLASSES, w: 'third' }, rep.cours, (k, v) => { rep[k] = v; touch(); }), fieldEl({ k: 'lieu', l: 'Fait à', t: 'text', w: 'third' }, rep.lieu, (k, v) => { rep[k] = v; touch(); }), fieldEl({ k: 'dateRapport', l: 'Date', t: 'date', w: 'third' }, rep.dateRapport, (k, v) => { rep[k] = v; touch(); }))));
  const tbody = h('tbody');
  function drawRows() {
    tbody.replaceChildren(...rep.rows.map((r, i) => h('tr', h('td', { class: 'n' }, String(i + 1)),
      h('td', h('input', { type: 'text', style: { textAlign: 'left', minWidth: '210px' }, value: r.nom, disabled: !editable, 'aria-label': 'Nom et prénoms', oninput: (e) => { r.nom = e.target.value; touch(); } })),
      h('td', h('select', { disabled: !editable, onchange: (e) => { r.sexe = e.target.value; touch(); } }, h('option', { value: '' }, '—'), ['G', 'F'].map(x => h('option', { value: x, selected: r.sexe === x }, x)))),
      [0, 1, 2, 3, 4].map(k => h('td', { style: { textAlign: 'center' } }, h('input', { type: 'checkbox', style: { width: 'auto', minWidth: 0 }, checked: !!(r.ev && r.ev[k]), disabled: !editable, 'aria-label': `Évaluation ${k + 1}`, onchange: (e) => { r.ev = r.ev || [0, 0, 0, 0, 0]; r.ev[k] = e.target.checked ? 1 : 0; touch(); tot(); } }))),
      h('td', { class: 'calc', 'data-t': i }, String((r.ev || []).filter(Boolean).length)),
      h('td', h('select', { disabled: !editable, onchange: (e) => { r.decision = e.target.value; touch(); } }, h('option', { value: '' }, '—'), DECISIONS.map(x => h('option', { value: x, selected: r.decision === x }, x)))),
      h('td', h('input', { type: 'text', style: { textAlign: 'left', minWidth: '140px' }, value: r.obs || '', disabled: !editable, oninput: (e) => { r.obs = e.target.value; touch(); } })))));
  }
  const tot = () => tbody.querySelectorAll('td[data-t]').forEach(td => { td.textContent = String((rep.rows[+td.dataset.t].ev || []).filter(Boolean).length); });
  const table = h('div', { class: 'gridwrap' }, h('table', { class: 'g p' }, h('thead', h('tr', ['N°', 'Nom & prénoms des apprenants', 'Sexe', '1ère', '2ème', '3ème', '4ème', '5ème', 'Nb seuil atteint', 'Décision', 'Observations'].map(x => h('th', x)))), tbody));
  drawRows(); stats();
  ctx.el.append(meta, h('div', { class: 'card' }, h('h3', 'Bilan des évaluations (cocher chaque évaluation où le seuil est atteint)'), table,
    editable ? h('p', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', onclick: () => { for (let i = 0; i < 10; i++) rep.rows.push({ nom: '', sexe: '', ev: [0, 0, 0, 0, 0], decision: '', obs: '' }); touch(); drawRows(); } }, '\uE001 Ajouter 10 lignes'),
      h('button', { class: 'btn sm', onclick: () => paste() }, '\uE00F Coller une liste de noms'),
      h('button', { class: 'btn sm', onclick: () => { rep.rows.sort((a, b) => (a.nom ? 0 : 1) - (b.nom ? 0 : 1) || a.nom.localeCompare(b.nom, 'fr')); touch(); drawRows(); } }, '\uE075 Trier par nom')) : null), statBox);
  function paste() {
    const ta = h('textarea', { class: 'input', rows: 10, placeholder: 'Un apprenant par ligne. Format : NOM Prénoms ; G ou F\nExemple : AGBO Koffi ; G' });
    modal({ title: 'Coller une liste', body: ta, actions: [{ label: 'Annuler' }, { label: 'Importer', kind: 'primary', onClick: () => {
      const lines = ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean); let i = rep.rows.findIndex(r => !r.nom);
      for (const l of lines) { const [nom, sx] = l.split(/[;\t]/).map(x => x.trim()); const row = { nom, sexe: /^f/i.test(sx || '') ? 'F' : /^[gm]/i.test(sx || '') ? 'G' : '', ev: [0, 0, 0, 0, 0], decision: '', obs: '' }; if (i >= 0 && i < rep.rows.length) { rep.rows[i] = row; i = rep.rows.findIndex((r, k) => k > i && !r.nom); } else rep.rows.push(row); }
      touch(); drawRows(); toast(`${lines.length} apprenant(s) importé(s).`); } }] });
  }
  const doAct = (fn) => async () => { await save(); Object.assign(rep, await db.get('classReports', rid)); if (await fn(rep)) ctx.reload(); };
  ctx.actions([
    { label: '\uE038 Liste', onClick: async () => { await save(); ctx.go('rapports'); } }, { label: '\uE007 Enregistrer', kind: 'primary', onClick: async () => { dirty = true; await save(); toast('Rapport enregistré.'); } },
    { label: '\uE009 PDF', onClick: async () => { await save(); await exportReport(rep, 'pdf'); } }, { label: '\uE006 PDF signé', onClick: async () => { await save(); await exportReport(rep, 'pdf', { signed: true }); } }, { label: '\uE009 Excel', onClick: async () => { await save(); await exportReport(rep, 'xlsx'); } },
    { label: '\uE00C Transmettre', show: canTransmit(u, rep), kind: 'accent', onClick: doAct(r => transmit(u, r, 'classReports')) },
    { label: '\uE004 Valider', show: canValidate(u, rep), kind: 'accent', onClick: doAct(r => validate(u, r, 'classReports')) }, { label: '\uE037 Demander correction', show: canValidate(u, rep), onClick: doAct(r => requestCorrection(u, r, 'classReports')) },
  ]);
  return save;
}
