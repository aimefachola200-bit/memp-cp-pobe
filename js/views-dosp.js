/* République du Bénin — MEMP — Application DOSP : Division de l'Organisation Scolaire et de la Prévision (AOF, article 13)
   « La Division de l'Organisation Scolaire et de la Prévision est chargée de :
     - réceptionner et acheminer les points de rentrée et les rapports de fin d'année ;
     - préparer les documents de suivi et évaluation de la circonscription scolaire ;
     - renforcer les capacités des acteurs locaux. »
   Écrans propres à la DOSP (les fiches, effectifs, infrastructures, écoles, CEP, rapports et synthèses sont ceux de
   l'application CP, mêmes calculs) :
     espacedosp  espace personnel de travail (tâches, agenda, bloc-notes, documents, raccourcis)
     envois      réception des points de rentrée et des rapports de fin d'année, relances, acheminement (bordereau)
     prevision   prévisions d'effectifs de l'année suivante, classes et enseignants nécessaires, candidats au CEP
     besoins     besoins et écarts : enseignants, salles, places assises (tables-bancs)
     suivieval   tableau de bord de suivi-évaluation (ratios, taux de promotion, redoublement, abandon, CEP, parité)
     capacites   renforcement des capacités : sessions, participants, liste de présence, attestations, rapport
     plandosp    attributions et plan d'action de la division
     docsdosp    documents officiels de la division (note de service, convocation, PV, relance, soit-transmis, rapport)
   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
import { h, uid, nowISO, toast, confirmBox, download, clean, currentSchoolYear, today, sha256 } from './util.js';
import { db } from './db.js';
import { dataTable, formDialog } from './ui.js';
import { scoped, inScope, addLog } from './data.js';
import { FICHE_TYPES, sectionsFor, gridValue, CLASSES } from './schema.js';
import { listToXlsx } from './export.js';
import { newPdf, GREY } from './pdf.js';
import { svgCourbe, PALETTE } from './effectifs-charts.js';
import { getIdentity, makeCachet, registerSigned, qrPayload, dataUrlToBytes } from './sign.js';
import { canonical } from './sign.js';

export async function render(id, ctx) { return ({ espacedosp, envois, prevision, besoins, suivieval, capacites, plandosp, docsdosp })[id](ctx); }

/* ---------------- outils communs ---------------- */
export const ATTRIBUTIONS_DOSP = "La Division de l'Organisation Scolaire et de la Prévision est chargée de :\n- réceptionner et acheminer les points de rentrée et les rapports de fin d'année ;\n- préparer les documents de suivi et évaluation de la circonscription scolaire ;\n- renforcer les capacités des acteurs locaux.";
const pdfBlob = (b) => new Blob([b], { type: 'application/pdf' });
const n0 = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const V = (f, g, r, k, c) => { if (!f) return 0; const s = sectionsFor(f.kind).find(x => x.id === g); return s ? n0(gridValue(f.data || {}, s, r, k, c)) : 0; };
const persoN = (f, sx) => f ? (f.perso || []).filter(p => (p.nom || '').trim() && (!sx || p.sexe === sx)).length : 0;
const tx = (a, b) => (b ? Math.round(1000 * a / b) / 10 : null);
const fr = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ','));
const pc = (v) => (v === null || v === undefined ? '—' : fr(v) + ' %');
const card = (titre, ...kids) => h('div', { class: 'card' }, titre ? h('h3', {}, titre) : null, ...kids);
const kpis = (l) => h('div', { class: 'kpis', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '10px', margin: '6px 0 12px' } },
  l.map(([lib, v, det]) => h('div', { class: 'card', style: { margin: 0, padding: '10px 12px' } }, h('div', { style: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--green-d)' } }, String(v)), h('div', { style: { fontWeight: 600 } }, lib), det ? h('div', { class: 'sub' }, det) : null)));
const courbe = (titre, labels, series, sousTitre = '') => { const d = h('div', { class: 'card card-courbe', style: { overflowX: 'auto' } }); d.innerHTML = labels.length ? svgCourbe({ titre, sousTitre, labels, series: series.map(s => ({ ...s, values: s.values.map(v => v ?? 0) })) }) : '<p class="sub">Pas encore de données.</p>'; return d; };
const tabs = (liste, actif, choisir) => h('div', { class: 'tabs no-print' }, liste.map(([k, l]) => h('button', { class: 'tab' + (k === actif ? ' on' : ''), onclick: () => choisir(k) }, l)));
const anneesDe = (fiches) => [...new Set([...fiches.map(f => f.annee).filter(Boolean), currentSchoolYear()])].sort().reverse();
const anneeSuivante = (a) => { const m = /(\d{4})\D+(\d{4})/.exec(a || ''); return m ? `${+m[1] + 1}-${+m[2] + 1}` : a; };
const groupeDe = (u, s) => (u.role === 'CP' ? s.nom : (s.codeZone ? 'Zone ' + (s.numZone || s.codeZone) : 'Sans zone'));
const libGroupe = (u) => (u.role === 'CP' ? 'École' : 'Zone pédagogique');
const ficheDe = (fiches, s, kind, annee) => fiches.filter(f => f.schoolId === s.id && f.kind === kind && f.annee === annee).sort((a, b) => String(b.updated).localeCompare(String(a.updated)))[0] || null;
const dospScoped = async (u, kind) => (await db.all('dosp')).filter(r => r.kind === kind && (u.role === 'ADMIN' || inScope(u, r) || (!r.codeCs && r.by === u.username)));
const base = (u) => ({ codeCs: u.codeCs || '', codeZone: u.codeZone || '', departement: u.departement || '', by: u.username, created: nowISO() });

/** Document officiel de la DOSP : bandeau du MEMP, en-tête de la structure, titre, corps, signature + cachet + QR (vérifiable). */
export async function docOfficiel(u, { titre, sousTitre = '', numero = '', blocs = [], orientation = 'portrait', label }) {
  const idn = (await getIdentity()) || {};
  const pdf = await newPdf({ title: titre, footer: titre, orientation });
  const cs = (u.nomCs || idn.nomCs || '').toUpperCase();
  pdf.text(cs ? `CIRCONSCRIPTION SCOLAIRE DE ${cs}` : 'CIRCONSCRIPTION SCOLAIRE', { bold: true, size: 9 });
  pdf.text("DIVISION DE L'ORGANISATION SCOLAIRE ET DE LA PRÉVISION", { bold: true, size: 9 });
  if (numero) pdf.text('N° ' + numero, { size: 8.5 });
  pdf.space(4); pdf.titleBox([titre, ...(sousTitre ? [sousTitre] : [])], { size: 12 });
  for (const b of blocs) {
    if (b.heading) pdf.heading(b.heading);
    if (b.text) pdf.text(b.text, { size: b.size || 9.5, gap: 3 });
    if (b.table) pdf.table({ widths: b.table.widths || b.table.head.map(() => 1), headRows: 1, head: b.table.head.map((t, i) => ({ t, c: i, s: 1, r: 0, rs: 1 })), rows: b.table.rows, size: b.table.size || 7.5, align: b.table.align || [] });
    if (b.space) pdf.space(b.space);
  }
  pdf.space(8);
  pdf.text(`Fait à ${u.nomCs ? u.nomCs.charAt(0) + u.nomCs.slice(1).toLowerCase() : '…………'}, le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'right', size: 9 });
  const hash = await sha256(canonical({ titre, sousTitre, numero, blocs: blocs.map(b => ({ t: b.text || '', r: b.table ? b.table.rows : [] })) }));
  const reg = await registerSigned({ ficheId: numero || titre, store: 'dosp', hash, user: { ...u, codeCp: idn.codeCp || u.username }, label: label || titre });
  await pdf.authBlock({ role: idn.titre || "Le Chef de la Division de l'Organisation Scolaire et de la Prévision", nom: `${idn.prenoms || u.prenoms || ''} ${idn.nom || u.nom || ''}`.trim(),
    signature: idn.signature && dataUrlToBytes(idn.signature), cachet: idn.signature || idn.nom ? dataUrlToBytes(await makeCachet({ ...idn, titre: idn.titre || "Chef de la Division de l'Organisation Scolaire et de la Prévision", nomCs: idn.nomCs || u.nomCs })) : null,
    qrText: qrPayload(reg.id, hash, idn.codeCp || u.username),
    lines: [`Document n° ${reg.id} · Empreinte SHA-256 : ${hash.slice(0, 32)}…`, 'Vérifiable dans l’application (menu « Vérifier un document »).'] });
  return pdfBlob(await pdf.finish());
}
async function numeroDoc(u, prefixe) {
  const an = new Date().getFullYear(), docs = await dospScoped(u, 'doc');
  const n = docs.filter(d => (d.numero || '').startsWith(prefixe) && (d.numero || '').includes('/' + an)).length + 1;
  return `${String(n).padStart(3, '0')}/${an}/CS-${(u.nomCs || 'CS').replace(/\s+/g, '')}/DOSP/${prefixe}`;
}

/* =====================================================================
   1. ESPACE PERSONNEL DE TRAVAIL
   ===================================================================== */
let ONGLET_ESPACE = 'taches';
async function espacedosp(ctx) {
  const u = ctx.user;
  ctx.title('Espace DOSP — mon espace de travail', `${u.prenoms || ''} ${u.nom || u.username} · ${u.nomCs ? 'CS ' + u.nomCs : ''}`);
  const [schools, fiches, envoisL, forms, taches] = await Promise.all([scoped('schools', u), scoped('fiches', u), dospScoped(u, 'envoi'), dospScoped(u, 'formation'), dospScoped(u, 'tache')]);
  const an = currentSchoolYear(), fa = fiches.filter(f => f.annee === an);
  const mes = taches.filter(t => t.by === u.username);
  ctx.el.append(kpis([['Écoles', schools.length, `${schools.filter(s => s.cycle === 'Primaire').length} primaires · ${schools.filter(s => s.cycle === 'Maternelle').length} maternelles`],
    ['Fiches reçues ' + an, fa.filter(f => f.statut !== 'Brouillon').length, `${fa.filter(f => f.statut === 'Transmise').length} à valider · ${fa.filter(f => f.statut === 'Validée').length} validées`],
    ['Envois à la DDEMP', envoisL.length, 'bordereaux émis'], ['Formations', forms.length, `${forms.reduce((a, f) => a + (f.participants || []).length, 0)} participants`],
    ['Mes tâches en cours', mes.filter(t => t.etat !== 'Terminée').length, `${mes.filter(t => t.etat !== 'Terminée' && t.echeance && t.echeance < today()).length} en retard`]]));
  const zone = h('div'), barre = h('div');
  ctx.el.append(barre, zone);
  const dessiner = async () => {
    barre.replaceChildren(tabs([['taches', '\uE004 Mes tâches'], ['agenda', '\uE017 Agenda'], ['notes', '\uE00E Bloc-notes'], ['docs', '\uE00D Mes documents'], ['raccourcis', '\uE05A Raccourcis']], ONGLET_ESPACE, (k) => { ONGLET_ESPACE = k; dessiner(); }));
    zone.replaceChildren();
    if (ONGLET_ESPACE === 'taches') await ongletTaches(u, zone, dessiner);
    else if (ONGLET_ESPACE === 'agenda') await ongletAgenda(u, zone, dessiner);
    else if (ONGLET_ESPACE === 'notes') await ongletNotes(u, zone);
    else if (ONGLET_ESPACE === 'docs') await ongletDocs(u, zone);
    else zone.append(card('Raccourcis', h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
      [['synodosp', '\uE00F Tableau synoptique de la DOSP'], ['envois', '\uE00B Réception des fiches'], ['fiches', '\uE00E Fiches de collecte'], ['prevision', '\uE07A Prévisions'], ['besoins', '\uE03F Besoins et écarts'], ['suivieval', '\uE015 Suivi-évaluation'], ['capacites', '\uE020 Renforcement des capacités'],
        ['docsdosp', '\uE00D Documents officiels'], ['plandosp', '\uE02E Plan d’action'], ['synoptique', '\uE011 Synthèse des fiches'], ['identite', '\uE029 Ma signature et mes cachets']].map(([r, l]) => h('button', { class: 'btn', onclick: () => ctx.go(r) }, l)))));
  };
  ctx.actions([{ label: '＋ Tâche', kind: 'primary', onClick: async () => { await editerTache(u, null); ONGLET_ESPACE = 'taches'; dessiner(); } }, { label: '＋ Rendez-vous', onClick: async () => { await editerAgenda(u, null); ONGLET_ESPACE = 'agenda'; dessiner(); } }]);
  await dessiner();
}
const TACHE_F = [{ k: 'libelle', l: 'Tâche', t: 'text', req: true }, { k: 'echeance', l: 'Échéance', t: 'date', w: 'third' }, { k: 'priorite', l: 'Priorité', t: 'select', options: ['Haute', 'Normale', 'Basse'], w: 'third' },
  { k: 'etat', l: 'État', t: 'select', options: ['À faire', 'En cours', 'Terminée'], w: 'third' }, { k: 'obs', l: 'Observations', t: 'textarea' }];
async function editerTache(u, t) {
  const v = await formDialog({ title: t ? 'Modifier la tâche' : 'Nouvelle tâche', fields: TACHE_F, values: t || { etat: 'À faire', priorite: 'Normale' } }); if (!v) return;
  await db.put('dosp', { ...(t || { id: uid(), kind: 'tache', ...base(u) }), ...v, maj: nowISO() }); toast('Tâche enregistrée.');
}
async function ongletTaches(u, zone, raf) {
  const l = (await dospScoped(u, 'tache')).filter(t => t.by === u.username).sort((a, b) => (a.etat === 'Terminée') - (b.etat === 'Terminée') || String(a.echeance || '9').localeCompare(String(b.echeance || '9')));
  const t = dataTable({ columns: [{ k: 'libelle', l: 'Tâche', w: 260 }, { k: 'echeance', l: 'Échéance' }, { k: 'priorite', l: 'Priorité' }, { k: 'etat', l: 'État' }, { k: 'retard', l: '', text: r => (r.etat !== 'Terminée' && r.echeance && r.echeance < today() ? '\uE041 en retard' : '') }],
    rows: l, onOpen: async (r) => { await editerTache(u, r); raf(); }, empty: 'Aucune tâche. Ajoutez-en avec « ＋ Tâche ».' });
  zone.append(card('Mes tâches', t.el, h('div', { class: 'actionbar' },
    h('button', { class: 'btn', onclick: async () => { const s = t.selected; if (!s) return toast('Touchez une tâche.', 'warn'); await db.put('dosp', { ...s, etat: 'Terminée', maj: nowISO() }); raf(); } }, '\uE003 Terminée'),
    h('button', { class: 'btn', onclick: async () => { const s = t.selected; if (!s) return toast('Touchez une tâche.', 'warn'); if (await confirmBox('Supprimer cette tâche ?', 'Supprimer', true)) { await db.del('dosp', s.id); raf(); } } }, '\uE005 Supprimer'))));
}
const AGENDA_F = [{ k: 'date', l: 'Date', t: 'date', req: true, w: 'third' }, { k: 'heure', l: 'Heure', t: 'text', w: 'third' }, { k: 'lieu', l: 'Lieu', t: 'text', w: 'third' }, { k: 'objet', l: 'Objet', t: 'text', req: true }, { k: 'participants', l: 'Participants', t: 'textarea' }];
async function editerAgenda(u, e) {
  const v = await formDialog({ title: e ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous', fields: AGENDA_F, values: e || { date: today() } }); if (!v) return;
  await db.put('dosp', { ...(e || { id: uid(), kind: 'agenda', ...base(u) }), ...v, maj: nowISO() }); toast('Agenda mis à jour.');
}
async function ongletAgenda(u, zone, raf) {
  const l = (await dospScoped(u, 'agenda')).filter(t => t.by === u.username).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const avenir = l.filter(e => e.date >= today()), passes = l.filter(e => e.date < today()).reverse();
  const cols = [{ k: 'date', l: 'Date' }, { k: 'heure', l: 'Heure' }, { k: 'objet', l: 'Objet', w: 260 }, { k: 'lieu', l: 'Lieu' }];
  zone.append(card('À venir', dataTable({ columns: cols, rows: avenir, onOpen: async (r) => { await editerAgenda(u, r); raf(); }, empty: 'Aucun rendez-vous à venir.' }).el),
    card('Passés', dataTable({ columns: cols, rows: passes.slice(0, 50), onOpen: async (r) => { await editerAgenda(u, r); raf(); }, empty: '—' }).el));
}
async function ongletNotes(u, zone) {
  const id = 'note-' + u.id, rec = (await db.get('dosp', id)) || { id, kind: 'note', ...base(u), texte: '' };
  const ta = h('textarea', { style: { width: '100%', minHeight: '320px' } }, rec.texte || '');
  const info = h('span', { class: 'sub' }, rec.maj ? 'Enregistré le ' + new Date(rec.maj).toLocaleString('fr-FR') : '');
  let minuteur = null;
  ta.addEventListener('input', () => { clearTimeout(minuteur); minuteur = setTimeout(async () => { rec.texte = ta.value; rec.maj = nowISO(); await db.put('dosp', rec); info.textContent = 'Enregistré'; }, 600); });
  zone.append(card('Bloc-notes (enregistré automatiquement sur cet appareil)', ta, info));
}
async function ongletDocs(u, zone) {
  const reg = (await db.all('docs')).filter(d => d.by === u.username).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const docs = (await dospScoped(u, 'doc')).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  zone.append(card('Documents officiels rédigés', dataTable({ columns: [{ k: 'numero', l: 'N°', w: 200 }, { k: 'typeLib', l: 'Type' }, { k: 'objet', l: 'Objet', w: 260 }, { k: 'date', l: 'Date' }],
    rows: docs, onOpen: (d) => telechargerDoc(u, d), empty: 'Aucun document. Rédigez-en dans « Documents officiels de la DOSP ».' }).el),
  card('Registre des documents signés', dataTable({ columns: [{ k: 'id', l: 'N° de document' }, { k: 'label', l: 'Document', w: 300 }, { k: 'date', l: 'Date', text: r => new Date(r.date).toLocaleString('fr-FR') }], rows: reg, empty: 'Aucun document signé.' }).el));
}

/* =====================================================================
   2. RÉCEPTION ET ACHEMINEMENT DES POINTS DE RENTRÉE ET DES RAPPORTS DE FIN D'ANNÉE
   ===================================================================== */
const ETAT_FICHE = (f) => (!f ? 'Non reçue' : f.statut === 'Brouillon' ? 'En saisie' : f.statut === 'Transmise' ? 'Reçue (à valider)' : f.statut === 'À corriger' ? 'À corriger' : 'Validée');
let ST_ENVOIS = null;
async function envois(ctx) {
  const u = ctx.user;
  ctx.title('Réception et acheminement des fiches', "Points de rentrée et rapports de fin d'année des écoles : reçus, à valider, manquants ; relances ; bordereau d'envoi à la DDEMP");
  const [schools, fiches, hist] = await Promise.all([scoped('schools', u), scoped('fiches', u), dospScoped(u, 'envoi')]);
  const years = anneesDe(fiches);
  const st = ST_ENVOIS && years.includes(ST_ENVOIS.annee) ? ST_ENVOIS : (ST_ENVOIS = { annee: years[0], moment: 'RENTREE' });
  const tool = h('div', { class: 'tbl-tools no-print' }), zone = h('div');
  ctx.el.append(tool, zone);
  const kindDe = (s) => (s.cycle === 'Maternelle' ? 'EM_' : 'EP_') + st.moment;
  const lignes = () => schools.slice().sort((a, b) => (a.codeZone || '').localeCompare(b.codeZone || '') || a.nom.localeCompare(b.nom, 'fr')).map(s => {
    const f = ficheDe(fiches, s, kindDe(s), st.annee);
    return { id: s.id, s, f, ecole: s.nom, zone: s.numZone ? 'Zone ' + s.numZone : '—', cycle: s.cycle, secteur: s.secteur, directeur: s.directeur || '', contact: s.contact || '', etat: ETAT_FICHE(f), maj: f ? new Date(f.updated).toLocaleDateString('fr-FR') : '' };
  });
  function dessiner() {
    const L = lignes(), cpt = (e) => L.filter(x => x.etat === e).length;
    tool.replaceChildren(h('select', { class: 'search', style: { maxWidth: '170px' }, onchange: (e) => { st.annee = e.target.value; dessiner(); } }, years.map(y => h('option', { value: y, selected: y === st.annee }, 'Année ' + y))),
      ...[['RENTREE', 'Points de rentrée'], ['FIN', "Rapports de fin d'année"]].map(([k, l]) => h('button', { class: 'btn sm' + (st.moment === k ? ' primary' : ''), onclick: () => { st.moment = k; dessiner(); } }, l)));
    const groupes = [...new Set(L.map(x => x.zone))];
    zone.replaceChildren(
      kpis([['Écoles', L.length, ''], ['Validées', cpt('Validée'), pc(tx(cpt('Validée'), L.length))], ['Reçues à valider', cpt('Reçue (à valider)'), ''], ['En saisie / à corriger', cpt('En saisie') + cpt('À corriger'), ''], ['Non reçues', cpt('Non reçue'), pc(tx(cpt('Non reçue'), L.length))]]),
      courbe(`${st.moment === 'RENTREE' ? 'Points de rentrée' : "Rapports de fin d'année"} — état de réception`, groupes, [
        { nom: 'Validées', color: PALETTE[2], values: groupes.map(g => L.filter(x => x.zone === g && x.etat === 'Validée').length) },
        { nom: 'Reçues à valider', color: PALETTE[0], values: groupes.map(g => L.filter(x => x.zone === g && x.etat === 'Reçue (à valider)').length) },
        { nom: 'Non reçues', color: PALETTE[3], values: groupes.map(g => L.filter(x => x.zone === g && (x.etat === 'Non reçue' || x.etat === 'En saisie' || x.etat === 'À corriger')).length) }], st.annee),
      card('Écoles et état de leur fiche', dataTable({ columns: [{ k: 'ecole', l: 'École', w: 220 }, { k: 'zone', l: 'Zone' }, { k: 'cycle', l: 'Cycle' }, { k: 'secteur', l: 'Secteur' }, { k: 'directeur', l: 'Directeur/trice', w: 160 }, { k: 'contact', l: 'Contact' }, { k: 'etat', l: 'État' }, { k: 'maj', l: 'Mise à jour' }],
        rows: L, onOpen: (r) => (r.f ? ctx.go('fiche/' + r.f.id) : toast('Fiche non reçue : utilisez « Générer les fiches » dans Écoles ou relancez l’école.', 'warn')) }).el),
      card('Bordereaux d’envoi déjà émis', dataTable({ columns: [{ k: 'numero', l: 'N°', w: 200 }, { k: 'date', l: 'Date' }, { k: 'momentLib', l: 'Objet' }, { k: 'nb', l: 'Fiches', num: true }, { k: 'destinataire', l: 'Destinataire', w: 200 }],
        rows: hist.filter(x => x.annee === st.annee).sort((a, b) => String(b.date).localeCompare(String(a.date))), empty: 'Aucun bordereau pour cette année.' }).el));
    ctx.status(`${L.length} école(s) — ${cpt('Validée')} fiche(s) validée(s)`);
    ctx.actions([
      { label: '\uE04F Lettre de relance (PDF)', kind: 'primary', onClick: async () => {
        const manq = L.filter(x => x.etat !== 'Validée' && x.etat !== 'Reçue (à valider)'); if (!manq.length) return toast('Toutes les fiches sont reçues.');
        const quoi = st.moment === 'RENTREE' ? 'le point de rentrée' : "le rapport de fin d'année";
        const numero = await numeroDoc(u, 'REL');
        download(await docOfficiel(u, { titre: 'LETTRE DE RELANCE', sousTitre: `${st.moment === 'RENTREE' ? 'Points de rentrée' : "Rapports de fin d'année"} — ${st.annee}`, numero, label: 'Lettre de relance ' + st.annee,
          blocs: [{ text: `Le Chef de la Division de l'Organisation Scolaire et de la Prévision rappelle aux directrices et directeurs des écoles ci-dessous que ${quoi} de l'année scolaire ${st.annee} n'est pas encore parvenu à la circonscription. Ils sont priés de le faire parvenir sans délai, dûment rempli, signé et cacheté.` },
            { table: { head: ['N°', 'École', 'Zone', 'Directeur/trice', 'Contact', 'État'], widths: [0.5, 3, 1, 2.4, 1.4, 1.4], rows: manq.map((x, i) => [String(i + 1), x.ecole, x.zone, x.directeur, x.contact, x.etat]) } }] }), clean('Relance_' + st.moment + '_' + st.annee) + '.pdf');
        await db.put('dosp', { id: uid(), kind: 'doc', type: 'relance', typeLib: 'Lettre de relance', numero, objet: `Relance ${quoi} ${st.annee}`, date: today(), ...base(u), auto: true });
      } },
      { label: '\uE00C Bordereau d’envoi à la DDEMP (PDF)', onClick: async () => {
        const ok = L.filter(x => x.etat === 'Validée'); if (!ok.length) return toast('Aucune fiche validée à acheminer.', 'warn');
        const v = await formDialog({ title: "Bordereau d'envoi", fields: [{ k: 'destinataire', l: 'Destinataire', t: 'text', req: true }, { k: 'obs', l: 'Observations', t: 'textarea' }], values: { destinataire: `Monsieur le Directeur Départemental des EMP${u.departement ? ' du ' + u.departement : ''}` } }); if (!v) return;
        const numero = await numeroDoc(u, 'BE');
        download(await docOfficiel(u, { titre: "BORDEREAU D'ENVOI", sousTitre: `${st.moment === 'RENTREE' ? 'Points de rentrée' : "Rapports de fin d'année"} — année scolaire ${st.annee}`, numero, label: "Bordereau d'envoi " + st.annee,
          blocs: [{ text: `Destinataire : ${v.destinataire}` }, { table: { head: ['N°', 'Désignation des pièces', 'Zone', 'Nombre', 'Observations'], widths: [0.5, 4, 1, 0.8, 2], rows: ok.map((x, i) => [String(i + 1), `${FICHE_TYPES[x.f.kind].label} — ${x.ecole}`, x.zone, '1', 'Validée']) } },
            { text: `Total : ${ok.length} fiche(s) sur ${L.length} école(s). ${v.obs || ''}` }] }), clean('Bordereau_' + st.moment + '_' + st.annee) + '.pdf');
        await db.put('dosp', { id: uid(), kind: 'envoi', annee: st.annee, moment: st.moment, momentLib: st.moment === 'RENTREE' ? 'Points de rentrée' : "Rapports de fin d'année", numero, date: today(), destinataire: v.destinataire, nb: ok.length, fiches: ok.map(x => x.f.id), ...base(u) });
        await addLog(u, { action: 'Acheminement à la DDEMP', target: `${ok.length} fiche(s) ${st.annee}` }); toast('Bordereau émis et enregistré.'); envois(ctx);
      } },
      { label: '\uE009 Excel', onClick: async () => download(await listToXlsx({ title: 'RÉCEPTION DES FICHES — ' + (st.moment === 'RENTREE' ? 'POINTS DE RENTRÉE' : "RAPPORTS DE FIN D'ANNÉE"), subtitle: st.annee, columns: [{ k: 'ecole', l: 'École' }, { k: 'zone', l: 'Zone' }, { k: 'cycle', l: 'Cycle' }, { k: 'secteur', l: 'Secteur' }, { k: 'directeur', l: 'Directeur' }, { k: 'contact', l: 'Contact' }, { k: 'etat', l: 'État' }, { k: 'maj', l: 'Mise à jour' }], rows: lignes() }), clean('Reception_fiches_' + st.annee) + '.xlsx') }]);
  }
  dessiner();
}

/* =====================================================================
   3. PRÉVISIONS D'EFFECTIFS ET DE MOYENS (année suivante)
   ===================================================================== */
let ST_PREV = null;
function prevoirEcole(fFin, fRent, norme) {
  const fin = (c) => V(fFin, 'eff', 'fin', c, 'T'), promus = (c) => V(fFin, 'eff', 'promus', c, 'T'), red = (c) => V(fFin, 'eff', 'redoub', c, 'T');
  const nouveauxCI = Math.max(0, (V(fRent, 'eff', 'debut', 'CI', 'T') - V(fRent, 'eff', 'redoub', 'CI', 'T')) || (V(fFin, 'eff', 'debut', 'CI', 'T') - red('CI')) || 0);
  const prev = {};
  CLASSES.forEach((c, i) => { prev[c] = i === 0 ? nouveauxCI + red('CI') : promus(CLASSES[i - 1]) + red(c); });
  const actuel = {}; CLASSES.forEach(c => { actuel[c] = fin(c) || V(fRent, 'eff', 'debut', c, 'T'); });
  const classes = CLASSES.reduce((a, c) => a + (prev[c] ? Math.ceil(prev[c] / norme) : 0), 0);
  return { prev, actuel, totPrev: CLASSES.reduce((a, c) => a + prev[c], 0), totAct: CLASSES.reduce((a, c) => a + actuel[c], 0), classes, classesAct: n0((fFin || fRent || {}).data?.classes_ouv), ens: persoN(fFin) || persoN(fRent), cep: promus('CM1') + red('CM2') };
}
async function prevision(ctx) {
  const u = ctx.user;
  ctx.title("Prévisions de l'année suivante", "Effectifs par cours, classes et enseignants nécessaires, candidats au CEP — à partir des fiches de fin d'année (promus, redoublants) et des points de rentrée");
  const [schools, fiches] = await Promise.all([scoped('schools', u), scoped('fiches', u)]);
  const ep = schools.filter(s => s.cycle === 'Primaire'), years = anneesDe(fiches.filter(f => f.kind === 'EP_FIN'));
  const st = ST_PREV && years.includes(ST_PREV.annee) ? ST_PREV : (ST_PREV = { annee: years[0], norme: 50 });
  const tool = h('div', { class: 'tbl-tools no-print' }), zone = h('div'); ctx.el.append(tool, zone);
  const calc = () => ep.map(s => ({ s, p: prevoirEcole(ficheDe(fiches, s, 'EP_FIN', st.annee), ficheDe(fiches, s, 'EP_RENTREE', st.annee), st.norme) })).filter(x => x.p.totAct || x.p.totPrev);
  function dessiner() {
    const L = calc(), suiv = anneeSuivante(st.annee);
    tool.replaceChildren(h('select', { class: 'search', style: { maxWidth: '170px' }, onchange: (e) => { st.annee = e.target.value; dessiner(); } }, years.map(y => h('option', { value: y, selected: y === st.annee }, 'Base ' + y))),
      h('label', { class: 'sub' }, 'Norme élèves / classe : ', h('input', { type: 'number', value: st.norme, min: 20, max: 120, style: { width: '70px' }, onchange: (e) => { st.norme = Math.max(20, +e.target.value || 50); dessiner(); } })));
    const tot = (f) => L.reduce((a, x) => a + f(x), 0);
    const prevC = CLASSES.map(c => tot(x => x.p.prev[c])), actC = CLASSES.map(c => tot(x => x.p.actuel[c]));
    const TP = tot(x => x.p.totPrev), TA = tot(x => x.p.totAct), CL = tot(x => x.p.classes), CLA = tot(x => x.p.classesAct), EN = tot(x => x.p.ens);
    zone.replaceChildren(
      kpis([['Élèves prévus ' + suiv, TP, `${TA} en ${st.annee} (${TA ? (TP >= TA ? '+' : '') + fr(tx(TP - TA, TA)) + ' %' : '—'})`], ['Classes nécessaires', CL, `${CLA} ouvertes · écart ${CL - CLA >= 0 ? '+' : ''}${CL - CLA}`],
        ['Enseignants nécessaires', CL, `${EN} en poste · manque ${Math.max(0, CL - EN)}`], ['Candidats au CEP ' + suiv, tot(x => x.p.cep), 'promus du CM1 + redoublants du CM2']]),
      courbe(`Effectifs par cours : ${st.annee} et prévision ${suiv}`, CLASSES, [{ nom: st.annee, color: PALETTE[0], values: actC }, { nom: 'Prévision ' + suiv, color: PALETTE[2], values: prevC }]),
      card('Prévisions par école', dataTable({ columns: [{ k: 'ecole', l: 'École', w: 200 }, ...CLASSES.map(c => ({ k: c, l: c, num: true })), { k: 'tot', l: 'Total prévu', num: true }, { k: 'act', l: 'Effectif ' + st.annee, num: true },
        { k: 'cl', l: 'Classes nécessaires', num: true }, { k: 'clo', l: 'Classes ouvertes', num: true }, { k: 'ens', l: 'Enseignants', num: true }, { k: 'manque', l: 'Manque d’enseignants', num: true }, { k: 'cep', l: 'Candidats CEP', num: true }],
        rows: lignesPrev(L), totals: totauxPrev(L) }).el),
      h('p', { class: 'sub' }, `Méthode : CI ${suiv} = nouveaux inscrits du CI en ${st.annee} (effectif de rentrée moins les redoublants) + redoublants du CI ; cours suivants = promus du cours précédent + redoublants du cours. Classes nécessaires = effectif prévu de chaque cours ÷ ${st.norme}, arrondi au-dessus. Candidats au CEP = promus du CM1 + redoublants du CM2.`));
    ctx.status(`${L.length} école(s) prises en compte`);
    ctx.actions([{ label: '\uE009 Rapport de prévision (PDF signé)', kind: 'primary', onClick: async () => download(await docOfficiel(u, { titre: 'PRÉVISIONS DES EFFECTIFS ET DES MOYENS', sousTitre: `Année scolaire ${suiv} (base ${st.annee})`, orientation: 'landscape', numero: await numeroDoc(u, 'PREV'), label: 'Prévisions ' + suiv,
      blocs: [{ text: `Élèves prévus : ${TP} (${TA} en ${st.annee}). Classes nécessaires : ${CL} (${CLA} ouvertes). Enseignants nécessaires : ${CL} (${EN} en poste). Candidats au CEP : ${tot(x => x.p.cep)}. Norme : ${st.norme} élèves par classe.` },
        { table: { head: ['École', ...CLASSES, 'Total', 'Effectif ' + st.annee, 'Classes néc.', 'Classes ouv.', 'Ens.', 'Manque', 'CEP'], widths: [3, ...CLASSES.map(() => 0.8), 1, 1.1, 1, 1, 0.8, 0.9, 0.8], size: 7,
          rows: [...lignesPrev(L), totauxPrev(L)].map(r => [r.ecole, ...CLASSES.map(c => String(r[c])), String(r.tot), String(r.act), String(r.cl), String(r.clo), String(r.ens), String(r.manque), String(r.cep)]) } }] }), clean('Previsions_' + suiv) + '.pdf') },
    { label: '\uE009 Excel', onClick: async () => download(await listToXlsx({ title: 'PRÉVISIONS ' + suiv, subtitle: 'Base ' + st.annee, columns: [{ k: 'ecole', l: 'École' }, ...CLASSES.map(c => ({ k: c, l: c, num: true })), { k: 'tot', l: 'Total', num: true }, { k: 'cl', l: 'Classes nécessaires', num: true }, { k: 'ens', l: 'Enseignants', num: true }, { k: 'manque', l: 'Manque', num: true }, { k: 'cep', l: 'CEP', num: true }], rows: [...lignesPrev(L), totauxPrev(L)] }), clean('Previsions_' + suiv) + '.xlsx') }]);
  }
  const lignesPrev = (L) => L.map(x => ({ id: x.s.id, ecole: x.s.nom, ...x.p.prev, tot: x.p.totPrev, act: x.p.totAct, cl: x.p.classes, clo: x.p.classesAct, ens: x.p.ens, manque: Math.max(0, x.p.classes - x.p.ens), cep: x.p.cep }));
  const totauxPrev = (L) => { const r = { ecole: 'TOTAL' }; for (const k of [...CLASSES, 'tot', 'act', 'cl', 'clo', 'ens', 'manque', 'cep']) r[k] = lignesPrev(L).reduce((a, x) => a + (x[k] || 0), 0); return r; };
  dessiner();
}

/* =====================================================================
   4. BESOINS ET ÉCARTS (enseignants, salles, places assises)
   ===================================================================== */
let ST_BES = null;
function moyensEcole(s, fR, fF) {
  const f = fR || fF, mat = s.cycle === 'Maternelle';
  const eleves = mat ? (V(f, 'eff', 'debut', 'tot', 'T') || V(f, 'eff', 'fin', 'tot', 'T')) : (V(f, 'eff', 'debut', 'ens', 'T') || V(f, 'eff', 'fin', 'ens', 'T'));
  const classes = n0(f?.data?.classes_ouv) || n0(f?.data?.sections_ouv), ens = persoN(f);
  const salles = V(f, 'infra', 'salles', 'g', 't') || n0(f?.data?.salles_util);
  const places = V(f, 'mob', 'tc', 'ens', 'n') + 2 * V(f, 'mob', 'tb2', 'ens', 'n') + 3 * V(f, 'mob', 'tb3', 'ens', 'n');
  return { f, eleves, classes, ens, salles, places, mEns: Math.max(0, classes - ens), mSal: Math.max(0, classes - salles), mPl: mat ? 0 : Math.max(0, eleves - places) };
}
async function besoins(ctx) {
  const u = ctx.user;
  ctx.title('Besoins et écarts', 'Enseignants, salles de classe et places assises : ce qui existe, ce qui manque — selon les points de rentrée (à défaut, les fiches de fin d’année)');
  const [schools, fiches] = await Promise.all([scoped('schools', u), scoped('fiches', u)]);
  const years = anneesDe(fiches);
  const st = ST_BES && years.includes(ST_BES.annee) ? ST_BES : (ST_BES = { annee: years[0] });
  const tool = h('div', { class: 'tbl-tools no-print' }), zone = h('div'); ctx.el.append(tool, zone);
  const calc = () => schools.map(s => ({ s, m: moyensEcole(s, ficheDe(fiches, s, (s.cycle === 'Maternelle' ? 'EM' : 'EP') + '_RENTREE', st.annee), ficheDe(fiches, s, (s.cycle === 'Maternelle' ? 'EM' : 'EP') + '_FIN', st.annee)) })).filter(x => x.m.f);
  function dessiner() {
    tool.replaceChildren(h('select', { class: 'search', style: { maxWidth: '170px' }, onchange: (e) => { st.annee = e.target.value; dessiner(); } }, years.map(y => h('option', { value: y, selected: y === st.annee }, 'Année ' + y))));
    const L = calc(), t = (k) => L.reduce((a, x) => a + x.m[k], 0), groupes = [...new Set(L.map(x => groupeDe(u, x.s)))];
    const parG = (g, k) => L.filter(x => groupeDe(u, x.s) === g).reduce((a, x) => a + x.m[k], 0);
    zone.replaceChildren(
      kpis([['Élèves', t('eleves'), `${L.length} école(s) renseignée(s) sur ${schools.length}`], ['Élèves par maître', fr(t('ens') ? t('eleves') / t('ens') : null), `${t('ens')} enseignants · manque ${t('mEns')}`],
        ['Élèves par salle', fr(t('salles') ? t('eleves') / t('salles') : null), `${t('salles')} salles · manque ${t('mSal')}`], ['Places assises', t('places'), `manque ${t('mPl')} places (≈ ${Math.ceil(t('mPl') / 2)} tables-bancs à 2 places)`]]),
      courbe('Manques par ' + libGroupe(u).toLowerCase(), groupes, [{ nom: 'Enseignants', color: PALETTE[0], values: groupes.map(g => parG(g, 'mEns')) }, { nom: 'Salles de classe', color: PALETTE[3], values: groupes.map(g => parG(g, 'mSal')) }], st.annee),
      courbe('Ratios par ' + libGroupe(u).toLowerCase(), groupes, [{ nom: 'Élèves / maître', color: PALETTE[2], values: groupes.map(g => { const e = parG(g, 'ens'); return e ? Math.round(parG(g, 'eleves') / e * 10) / 10 : 0; }) }, { nom: 'Élèves / salle', color: PALETTE[4], values: groupes.map(g => { const e = parG(g, 'salles'); return e ? Math.round(parG(g, 'eleves') / e * 10) / 10 : 0; }) }], st.annee),
      card('Moyens et besoins par école', dataTable({ columns: [{ k: 'ecole', l: 'École', w: 200 }, { k: 'zone', l: 'Zone' }, { k: 'eleves', l: 'Élèves', num: true }, { k: 'classes', l: 'Classes', num: true }, { k: 'ens', l: 'Enseignants', num: true }, { k: 'mEns', l: 'Manque ens.', num: true }, { k: 'salles', l: 'Salles', num: true }, { k: 'mSal', l: 'Manque salles', num: true }, { k: 'places', l: 'Places assises', num: true }, { k: 'mPl', l: 'Places manquantes', num: true }, { k: 'epm', l: 'Élèves / maître', num: true }],
        rows: lignesB(L), totals: totB(L) }).el));
    ctx.actions([{ label: '\uE009 État des besoins (PDF signé)', kind: 'primary', onClick: async () => download(await docOfficiel(u, { titre: 'ÉTAT DES BESOINS EN ENSEIGNANTS, SALLES ET MOBILIER', sousTitre: 'Année scolaire ' + st.annee, orientation: 'landscape', numero: await numeroDoc(u, 'BES'), label: 'État des besoins ' + st.annee,
      blocs: [{ table: { head: ['École', 'Zone', 'Élèves', 'Classes', 'Ens.', 'Manque ens.', 'Salles', 'Manque salles', 'Places', 'Places manq.', 'Élèves/maître'], widths: [3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], rows: [...lignesB(L), totB(L)].map(r => [r.ecole, r.zone || '', ...['eleves', 'classes', 'ens', 'mEns', 'salles', 'mSal', 'places', 'mPl', 'epm'].map(k => String(r[k]))]) } }] }), clean('Besoins_' + st.annee) + '.pdf') },
    { label: '\uE009 Excel', onClick: async () => download(await listToXlsx({ title: 'BESOINS ET ÉCARTS', subtitle: st.annee, columns: [{ k: 'ecole', l: 'École' }, { k: 'zone', l: 'Zone' }, ...['eleves', 'classes', 'ens', 'mEns', 'salles', 'mSal', 'places', 'mPl'].map(k => ({ k, l: k, num: true }))], rows: [...lignesB(L), totB(L)] }), clean('Besoins_' + st.annee) + '.xlsx') }]);
  }
  const lignesB = (L) => L.map(x => ({ id: x.s.id, ecole: x.s.nom, zone: x.s.numZone ? 'Zone ' + x.s.numZone : '', ...x.m, f: undefined, epm: x.m.ens ? fr(x.m.eleves / x.m.ens) : '—' }));
  const totB = (L) => { const r = { ecole: 'TOTAL', zone: '' }; for (const k of ['eleves', 'classes', 'ens', 'mEns', 'salles', 'mSal', 'places', 'mPl']) r[k] = L.reduce((a, x) => a + x.m[k], 0); r.epm = r.ens ? fr(r.eleves / r.ens) : '—'; return r; };
  dessiner();
}

/* =====================================================================
   5. SUIVI-ÉVALUATION (tableau de bord de la circonscription)
   ===================================================================== */
let ST_SE = null;
async function suivieval(ctx) {
  const u = ctx.user;
  ctx.title('Suivi-évaluation', 'Tableau de bord de la circonscription : effectifs, parité, ratios, rendement interne (promotion, redoublement, abandon), CEP, remontée des fiches');
  const [schools, fiches] = await Promise.all([scoped('schools', u), scoped('fiches', u)]);
  const years = anneesDe(fiches);
  const st = ST_SE && years.includes(ST_SE.annee) ? ST_SE : (ST_SE = { annee: years[0] });
  const tool = h('div', { class: 'tbl-tools no-print' }), zone = h('div'); ctx.el.append(tool, zone);
  const ep = schools.filter(s => s.cycle === 'Primaire');
  function indic(liste) {
    const R = liste.map(s => ficheDe(fiches, s, 'EP_RENTREE', st.annee)), F = liste.map(s => ficheDe(fiches, s, 'EP_FIN', st.annee));
    const sR = (r, c) => R.reduce((a, f) => a + V(f, 'eff', r, 'ens', c), 0), sF = (r, c) => F.reduce((a, f) => a + V(f, 'eff', r, 'ens', c), 0);
    const G = sR('debut', 'G') || sF('debut', 'G'), Fi = sR('debut', 'F') || sF('debut', 'F'), T = G + Fi;
    const ens = R.reduce((a, f) => a + persoN(f), 0) || F.reduce((a, f) => a + persoN(f), 0), ensF = R.reduce((a, f) => a + persoN(f, 'F'), 0) || F.reduce((a, f) => a + persoN(f, 'F'), 0);
    const cl = R.reduce((a, f) => a + n0(f?.data?.classes_ouv), 0) || F.reduce((a, f) => a + n0(f?.data?.classes_ouv), 0);
    const sal = R.reduce((a, f) => a + V(f, 'infra', 'salles', 'g', 't'), 0) || F.reduce((a, f) => a + V(f, 'infra', 'salles', 'g', 't'), 0);
    const deb = sF('debut', 'T'), cepI = F.reduce((a, f) => a + V(f, 'cep', 'comp', 'cep', 'T'), 0), cepA = F.reduce((a, f) => a + V(f, 'cep', 'adm', 'cep', 'T'), 0);
    return { ecoles: liste.length, recuesR: R.filter(f => f && f.statut !== 'Brouillon').length, recuesF: F.filter(f => f && f.statut !== 'Brouillon').length, G, F: Fi, T, parite: G ? Math.round(Fi / G * 100) / 100 : null,
      ens, ensF, epm: ens ? T / ens : null, epc: cl ? T / cl : null, eps: sal ? T / sal : null,
      promo: tx(sF('promus', 'T'), deb), redoub: tx(sF('redoub', 'T'), deb), aband: tx(sF('aband', 'T'), deb), cep: tx(cepA, cepI) };
  }
  function dessiner() {
    tool.replaceChildren(h('select', { class: 'search', style: { maxWidth: '170px' }, onchange: (e) => { st.annee = e.target.value; dessiner(); } }, years.map(y => h('option', { value: y, selected: y === st.annee }, 'Année ' + y))));
    const tot = indic(ep), groupes = [...new Set(ep.map(s => groupeDe(u, s)))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
    const I = groupes.map(g => ({ g, ...indic(ep.filter(s => groupeDe(u, s) === g)) }));
    zone.replaceChildren(
      kpis([['Élèves (primaire)', tot.T, `${tot.G} G · ${tot.F} F · parité ${fr(tot.parite, 2)}`], ['Élèves par maître', fr(tot.epm), `${tot.ens} enseignants dont ${tot.ensF} femmes`], ['Élèves par classe', fr(tot.epc), 'élèves par salle ' + fr(tot.eps)],
        ['Promotion · redoublement · abandon', `${pc(tot.promo)}`, `redoublement ${pc(tot.redoub)} · abandon ${pc(tot.aband)}`], ['Réussite au CEP', pc(tot.cep), ''], ['Remontée des fiches', `${tot.recuesR}/${tot.ecoles}`, `rentrée · fin d'année ${tot.recuesF}/${tot.ecoles}`]]),
      courbe("Rendement interne (%)", groupes, [{ nom: 'Promotion', color: PALETTE[2], values: I.map(x => x.promo) }, { nom: 'Redoublement', color: PALETTE[3], values: I.map(x => x.redoub) }, { nom: 'Abandon', color: PALETTE[1], values: I.map(x => x.aband) }], st.annee),
      courbe('Ratios', groupes, [{ nom: 'Élèves / maître', color: PALETTE[0], values: I.map(x => x.epm && Math.round(x.epm * 10) / 10) }, { nom: 'Élèves / classe', color: PALETTE[4], values: I.map(x => x.epc && Math.round(x.epc * 10) / 10) }], st.annee),
      courbe('Effectifs par sexe et réussite au CEP', groupes, [{ nom: 'Garçons', color: PALETTE[0], values: I.map(x => x.G) }, { nom: 'Filles', color: PALETTE[1], values: I.map(x => x.F) }], st.annee),
      card('Indicateurs par ' + libGroupe(u).toLowerCase(), dataTable({ columns: [{ k: 'g', l: libGroupe(u), w: 180 }, { k: 'ecoles', l: 'Écoles', num: true }, { k: 'T', l: 'Élèves', num: true }, { k: 'pariteT', l: 'Parité F/G' }, { k: 'epmT', l: 'Élèves/maître' }, { k: 'epcT', l: 'Élèves/classe' }, { k: 'promoT', l: 'Promotion' }, { k: 'redoubT', l: 'Redoublement' }, { k: 'abandT', l: 'Abandon' }, { k: 'cepT', l: 'Réussite CEP' }, { k: 'remontee', l: 'Fiches reçues (R / F)' }],
        rows: [...I, { g: 'TOTAL', ...tot }].map(x => ({ id: x.g, ...x, pariteT: fr(x.parite, 2), epmT: fr(x.epm), epcT: fr(x.epc), promoT: pc(x.promo), redoubT: pc(x.redoub), abandT: pc(x.aband), cepT: pc(x.cep), remontee: `${x.recuesR} / ${x.recuesF} sur ${x.ecoles}` })) }).el));
    ctx.actions([{ label: '\uE009 Rapport de suivi-évaluation (PDF signé)', kind: 'primary', onClick: async () => download(await docOfficiel(u, { titre: 'RAPPORT DE SUIVI-ÉVALUATION', sousTitre: 'Année scolaire ' + st.annee, orientation: 'landscape', numero: await numeroDoc(u, 'SE'), label: 'Suivi-évaluation ' + st.annee,
      blocs: [{ heading: '1. Synthèse', text: `Élèves du primaire : ${tot.T} (${tot.G} garçons, ${tot.F} filles ; indice de parité ${fr(tot.parite, 2)}). Enseignants : ${tot.ens} dont ${tot.ensF} femmes ; ${fr(tot.epm)} élèves par maître, ${fr(tot.epc)} élèves par classe, ${fr(tot.eps)} élèves par salle. Rendement : promotion ${pc(tot.promo)}, redoublement ${pc(tot.redoub)}, abandon ${pc(tot.aband)}. Réussite au CEP : ${pc(tot.cep)}. Fiches reçues : ${tot.recuesR}/${tot.ecoles} points de rentrée et ${tot.recuesF}/${tot.ecoles} rapports de fin d'année.` },
        { heading: '2. Indicateurs par ' + libGroupe(u).toLowerCase(), table: { head: [libGroupe(u), 'Écoles', 'Élèves', 'Parité', 'Él./maître', 'Él./classe', 'Promotion', 'Redoublement', 'Abandon', 'CEP'], widths: [2.2, 0.8, 1, 0.9, 1, 1, 1, 1.1, 1, 0.9],
          rows: [...I, { g: 'TOTAL', ...tot }].map(x => [x.g, String(x.ecoles), String(x.T), fr(x.parite, 2), fr(x.epm), fr(x.epc), pc(x.promo), pc(x.redoub), pc(x.aband), pc(x.cep)]) } }] }), clean('Suivi_evaluation_' + st.annee) + '.pdf') }]);
  }
  dessiner();
}

/* =====================================================================
   6. RENFORCEMENT DES CAPACITÉS DES ACTEURS LOCAUX
   ===================================================================== */
const FORM_F = [{ k: 'theme', l: 'Thème de la session', t: 'text', req: true }, { k: 'date', l: 'Date de début', t: 'date', req: true, w: 'third' }, { k: 'dateFin', l: 'Date de fin', t: 'date', w: 'third' }, { k: 'lieu', l: 'Lieu', t: 'text', w: 'third' },
  { k: 'public', l: 'Public cible', t: 'select', options: ['Directeurs', 'Enseignants', 'Conseillers pédagogiques', 'Membres des APE / COGES', 'Agents de la CS', 'Élus locaux', 'Autre'], w: 'half' }, { k: 'formateurs', l: 'Formateurs / animateurs', t: 'text', w: 'half' },
  { k: 'objectifs', l: 'Objectifs', t: 'textarea' }, { k: 'participantsTxt', l: 'Participants — une ligne par personne : NOM Prénoms ; fonction ; école ou structure ; M ou F', t: 'textarea' },
  { k: 'resultats', l: 'Résultats obtenus et recommandations (pour le rapport)', t: 'textarea' }];
const lireParticipants = (txt) => String(txt || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [nom, fonction = '', structure = '', sexe = ''] = l.split(/\s*;\s*/); return { nom, fonction, structure, sexe: /^f/i.test(sexe) ? 'F' : /^m/i.test(sexe) ? 'M' : '' }; });
async function capacites(ctx) {
  const u = ctx.user;
  ctx.title('Renforcement des capacités des acteurs locaux', 'Sessions de formation, participants, liste de présence, attestations de participation et rapport');
  const l = (await dospScoped(u, 'formation')).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const P = l.flatMap(f => f.participants || []);
  ctx.el.append(kpis([['Sessions', l.length, ''], ['Participants', P.length, `${P.filter(p => p.sexe === 'F').length} femmes (${pc(tx(P.filter(p => p.sexe === 'F').length, P.length))})`], ['Directeurs et enseignants', P.filter(p => /direct|enseign|adjoint|instit/i.test(p.fonction)).length, '']]));
  const mois = [...new Set(l.map(f => (f.date || '').slice(0, 7)))].sort();
  ctx.el.append(courbe('Participants par mois', mois, [{ nom: 'Hommes', color: PALETTE[0], values: mois.map(m => l.filter(f => (f.date || '').startsWith(m)).flatMap(f => f.participants || []).filter(p => p.sexe !== 'F').length) }, { nom: 'Femmes', color: PALETTE[1], values: mois.map(m => l.filter(f => (f.date || '').startsWith(m)).flatMap(f => f.participants || []).filter(p => p.sexe === 'F').length) }]));
  const t = dataTable({ columns: [{ k: 'date', l: 'Date' }, { k: 'theme', l: 'Thème', w: 280 }, { k: 'public', l: 'Public' }, { k: 'lieu', l: 'Lieu' }, { k: 'nb', l: 'Participants', num: true, text: r => (r.participants || []).length }], rows: l, onOpen: () => modifier(), empty: 'Aucune session. Ajoutez-en avec « ＋ Session ».' });
  ctx.el.append(card('Sessions de formation', t.el));
  const sel = () => { const s = t.selected; if (!s) toast('Touchez une session dans le tableau.', 'warn'); return s; };
  async function enregistrer(rec) {
    const v = await formDialog({ title: rec ? 'Modifier la session' : 'Nouvelle session de formation', wide: true, fields: FORM_F, values: rec ? { ...rec, participantsTxt: (rec.participants || []).map(p => [p.nom, p.fonction, p.structure, p.sexe].join(' ; ')).join('\n') } : { date: today() } }); if (!v) return;
    const { participantsTxt, ...reste } = v;
    await db.put('dosp', { ...(rec || { id: uid(), kind: 'formation', ...base(u) }), ...reste, participants: lireParticipants(participantsTxt), maj: nowISO() }); toast('Session enregistrée.'); ctx.reload();
  }
  async function modifier() { const s = sel(); if (s) enregistrer(s); }
  ctx.actions([{ label: '＋ Session', kind: 'primary', onClick: () => enregistrer(null) }, { label: '\uE006 Modifier', onClick: modifier },
    { label: '\uE008 Liste de présence', onClick: async () => { const s = sel(); if (!s) return; const P = s.participants || [];
      const rows = P.map((p, i) => [String(i + 1), p.nom, p.fonction, p.structure, p.sexe, '']); while (rows.length < Math.max(20, P.length)) rows.push([String(rows.length + 1), '', '', '', '', '']);
      download(await docOfficiel(u, { titre: 'LISTE DE PRÉSENCE', sousTitre: `${s.theme} — ${new Date(s.date).toLocaleDateString('fr-FR')}${s.lieu ? ' — ' + s.lieu : ''}`, numero: await numeroDoc(u, 'LP'), label: 'Liste de présence ' + s.theme,
        blocs: [{ table: { head: ['N°', 'Nom et prénoms', 'Fonction', 'École / structure', 'Sexe', 'Émargement'], widths: [0.5, 3, 1.6, 2.2, 0.6, 1.8], rows, size: 8 } }] }), clean('Liste_presence_' + s.theme) + '.pdf'); } },
    { label: '\uE020 Attestations', onClick: async () => { const s = sel(); if (!s) return; if (!(s.participants || []).length) return toast('Aucun participant dans cette session.', 'warn');
      const idn = (await getIdentity()) || {}; const pdf = await newPdf({ title: 'Attestations — ' + s.theme, footer: 'Attestation de participation' });
      for (const [i, p] of s.participants.entries()) {
        if (i) pdf.addPage();
        pdf.text(`CIRCONSCRIPTION SCOLAIRE DE ${(u.nomCs || '').toUpperCase()}`, { bold: true, size: 9 }); pdf.text("DIVISION DE L'ORGANISATION SCOLAIRE ET DE LA PRÉVISION", { bold: true, size: 9 }); pdf.space(30);
        pdf.titleBox(['ATTESTATION DE PARTICIPATION'], { size: 15 }); pdf.space(20);
        pdf.text(`Le Chef de la Division de l'Organisation Scolaire et de la Prévision de la Circonscription Scolaire de ${u.nomCs || '…'} atteste que :`, { size: 11, gap: 5 }); pdf.space(10);
        pdf.text(`${p.sexe === 'F' ? 'Madame' : 'Monsieur'} ${p.nom}`, { bold: true, size: 14, align: 'center' }); pdf.text(`${p.fonction || ''}${p.structure ? ' — ' + p.structure : ''}`, { size: 11, align: 'center' }); pdf.space(10);
        pdf.text(`a pris part à la session de renforcement des capacités sur le thème « ${s.theme} », organisée ${s.dateFin && s.dateFin !== s.date ? 'du ' + new Date(s.date).toLocaleDateString('fr-FR') + ' au ' + new Date(s.dateFin).toLocaleDateString('fr-FR') : 'le ' + new Date(s.date).toLocaleDateString('fr-FR')}${s.lieu ? ' à ' + s.lieu : ''}.`, { size: 11, gap: 5 });
        pdf.space(8); pdf.text('En foi de quoi, la présente attestation lui est délivrée pour servir et valoir ce que de droit.', { size: 11 }); pdf.space(14);
        pdf.text(`Fait à ${u.nomCs || '…'}, le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'right', size: 10 }); pdf.space(6);
        await pdf.authBlock({ role: idn.titre || "Le Chef de la Division de l'Organisation Scolaire et de la Prévision", nom: `${idn.prenoms || ''} ${idn.nom || u.nom || ''}`.trim(), signature: idn.signature && dataUrlToBytes(idn.signature), cachet: idn.nom ? dataUrlToBytes(await makeCachet(idn)) : null, qrText: `MEMP-BJ|ATT|${s.id.slice(0, 8)}|${i + 1}|${p.nom}`, lines: [`Attestation n° ${String(i + 1).padStart(3, '0')} — session « ${s.theme} »`] });
      }
      download(pdfBlob(await pdf.finish()), clean('Attestations_' + s.theme) + '.pdf'); } },
    { label: '\uE00D Rapport de la session', onClick: async () => { const s = sel(); if (!s) return; const P = s.participants || [];
      download(await docOfficiel(u, { titre: 'RAPPORT DE SESSION DE RENFORCEMENT DES CAPACITÉS', sousTitre: s.theme, numero: await numeroDoc(u, 'RF'), label: 'Rapport de formation ' + s.theme,
        blocs: [{ heading: '1. Organisation', text: `Date : ${new Date(s.date).toLocaleDateString('fr-FR')}${s.dateFin ? ' au ' + new Date(s.dateFin).toLocaleDateString('fr-FR') : ''} · Lieu : ${s.lieu || '—'} · Public : ${s.public || '—'} · Formateurs : ${s.formateurs || '—'}` },
          { heading: '2. Objectifs', text: s.objectifs || '—' }, { heading: '3. Participation', text: `${P.length} participant(s) dont ${P.filter(p => p.sexe === 'F').length} femme(s).` },
          { table: { head: ['N°', 'Nom et prénoms', 'Fonction', 'École / structure', 'Sexe'], widths: [0.5, 3, 1.8, 2.4, 0.6], rows: P.map((p, i) => [String(i + 1), p.nom, p.fonction, p.structure, p.sexe]) } },
          { heading: '4. Résultats et recommandations', text: s.resultats || '—' }] }), clean('Rapport_formation_' + s.theme) + '.pdf'); } },
    { label: '\uE005 Supprimer', onClick: async () => { const s = sel(); if (s && await confirmBox('Supprimer cette session ?', 'Supprimer', true)) { await db.del('dosp', s.id); ctx.reload(); } } }]);
}

/* =====================================================================
   7. ATTRIBUTIONS ET PLAN D'ACTION DE LA DIVISION
   ===================================================================== */
async function plandosp(ctx) {
  const u = ctx.user, an = currentSchoolYear();
  ctx.title("Attributions et plan d'action de la DOSP", "Article 13 de l'AOF — lignes d'action de l'année " + an + ', état et taux de réalisation');
  let l = (await dospScoped(u, 'ligne')).filter(x => x.annee === an);
  if (!l.length && !(await db.setting('dosp-plan-' + an + '-' + (u.codeCs || u.username)))) {
    const puces = ATTRIBUTIONS_DOSP.split('\n').filter(x => x.startsWith('- ')).map(x => x.slice(2).replace(/\s*;\s*$|\.\s*$/, '')).map(x => x.charAt(0).toUpperCase() + x.slice(1));
    l = puces.map(p => ({ id: uid(), kind: 'ligne', annee: an, libelle: p, etat: 'Prévue', taux: 0, ...base(u) }));
    await db.putMany('dosp', l); await db.setting('dosp-plan-' + an + '-' + (u.codeCs || u.username), true);
  }
  const eff = (x) => (x.etat === 'Réalisée' ? 100 : n0(x.taux));
  const moy = l.length ? Math.round(l.reduce((a, x) => a + eff(x), 0) / l.length) : null;
  ctx.el.append(card('Attributions (AOF, article 13)', h('div', { style: { whiteSpace: 'pre-line' } }, ATTRIBUTIONS_DOSP)), kpis([['Lignes d’action', l.length, an], ['Taux de réalisation', pc(moy), 'moyenne des lignes'], ['Réalisées', l.filter(x => x.etat === 'Réalisée').length, '']]),
    courbe('Taux de réalisation des lignes d’action (%)', l.map((x, i) => 'L' + (i + 1)), [{ nom: 'Taux', color: PALETTE[2], values: l.map(eff) }], an));
  const F = [{ k: 'libelle', l: "Ligne d'action", t: 'textarea', req: true }, { k: 'indicateur', l: 'Indicateur', t: 'text', w: 'half' }, { k: 'cible', l: 'Cible', t: 'text', w: 'half' }, { k: 'echeance', l: 'Échéance', t: 'date', w: 'third' },
    { k: 'responsable', l: 'Responsable', t: 'text', w: 'third' }, { k: 'etat', l: 'État', t: 'select', options: ['Prévue', 'En cours', 'Réalisée', 'Reportée'], w: 'third' }, { k: 'taux', l: 'Taux de réalisation (%)', t: 'number', w: 'half' }, { k: 'obs', l: 'Observations', t: 'textarea' }];
  const t = dataTable({ columns: [{ k: 'n', l: 'N°', text: r => 'L' + (l.indexOf(r) + 1) }, { k: 'libelle', l: "Ligne d'action", w: 320 }, { k: 'indicateur', l: 'Indicateur' }, { k: 'echeance', l: 'Échéance' }, { k: 'etat', l: 'État' }, { k: 'tx', l: 'Taux', text: r => eff(r) + ' %' }], rows: l, onOpen: () => edit() });
  ctx.el.append(card("Plan d'action " + an, t.el));
  async function edit(rec = t.selected) { if (rec === undefined) return; const v = await formDialog({ title: rec ? "Modifier la ligne d'action" : "Nouvelle ligne d'action", fields: F, values: rec || { etat: 'Prévue', taux: 0 } }); if (!v) return; await db.put('dosp', { ...(rec || { id: uid(), kind: 'ligne', annee: an, ...base(u) }), ...v, taux: Math.max(0, Math.min(100, n0(v.taux))) }); ctx.reload(); }
  ctx.actions([{ label: '＋ Ligne d’action', kind: 'primary', onClick: () => edit(null) }, { label: '\uE006 Modifier', onClick: () => (t.selected ? edit(t.selected) : toast('Touchez une ligne.', 'warn')) },
    { label: '\uE009 Plan d’action (PDF signé)', onClick: async () => download(await docOfficiel(u, { titre: "PLAN D'ACTION DE LA DIVISION DE L'ORGANISATION SCOLAIRE ET DE LA PRÉVISION", sousTitre: 'Année scolaire ' + an, orientation: 'landscape', numero: await numeroDoc(u, 'PA'), label: "Plan d'action DOSP " + an,
      blocs: [{ heading: 'Attributions (AOF, article 13)', text: ATTRIBUTIONS_DOSP }, { heading: "Lignes d'action — taux de réalisation : " + pc(moy), table: { head: ['N°', "Ligne d'action", 'Indicateur', 'Cible', 'Échéance', 'Responsable', 'État', 'Taux', 'Observations'], widths: [0.5, 4, 1.6, 1, 1, 1.4, 0.9, 0.7, 2], rows: l.map((x, i) => ['L' + (i + 1), x.libelle, x.indicateur || '', x.cible || '', x.echeance || '', x.responsable || '', x.etat || '', eff(x) + ' %', x.obs || '']) } }] }), clean('Plan_action_DOSP_' + an) + '.pdf') }]);
}

/* =====================================================================
   8. DOCUMENTS OFFICIELS DE LA DOSP
   ===================================================================== */
const TYPES_DOC = {
  note: { lib: 'Note de service', prefixe: 'NS', titre: 'NOTE DE SERVICE', champs: ['destinataires', 'objet', 'corps'] },
  convocation: { lib: 'Convocation', prefixe: 'CONV', titre: 'CONVOCATION', champs: ['destinataires', 'objet', 'dateRdv', 'lieu', 'corps'] },
  pv: { lib: 'Procès-verbal de réunion', prefixe: 'PV', titre: 'PROCÈS-VERBAL DE RÉUNION', champs: ['objet', 'dateRdv', 'lieu', 'presents', 'corps', 'decisions'] },
  transmis: { lib: 'Soit-transmis', prefixe: 'ST', titre: 'SOIT-TRANSMIS', champs: ['destinataires', 'objet', 'pieces', 'corps'] },
  relance: { lib: 'Lettre de relance', prefixe: 'REL', titre: 'LETTRE DE RELANCE', champs: ['destinataires', 'objet', 'corps'] },
  rapport: { lib: "Rapport d'activités", prefixe: 'RA', titre: "RAPPORT D'ACTIVITÉS DE LA DOSP", champs: ['periode', 'objet', 'corps', 'difficultes', 'perspectives'] },
  compte: { lib: 'Compte rendu de mission', prefixe: 'CR', titre: 'COMPTE RENDU DE MISSION', champs: ['objet', 'dateRdv', 'lieu', 'corps', 'decisions'] },
};
const CHAMPS_DOC = { destinataires: ['Destinataire(s)', 'textarea'], objet: ['Objet', 'text'], dateRdv: ['Date', 'date'], lieu: ['Lieu', 'text'], presents: ['Présents', 'textarea'], pieces: ['Pièces jointes (une par ligne)', 'textarea'],
  corps: ['Texte', 'textarea'], decisions: ['Décisions / recommandations', 'textarea'], periode: ['Période', 'text'], difficultes: ['Difficultés rencontrées', 'textarea'], perspectives: ['Perspectives', 'textarea'] };
async function telechargerDoc(u, d) {
  const T = TYPES_DOC[d.type] || TYPES_DOC.note, blocs = [];
  if (d.destinataires) blocs.push({ text: 'Destinataire(s) : ' + d.destinataires });
  if (d.objet) blocs.push({ text: 'Objet : ' + d.objet });
  if (d.periode) blocs.push({ text: 'Période : ' + d.periode });
  if (d.dateRdv || d.lieu) blocs.push({ text: [d.dateRdv ? 'Date : ' + new Date(d.dateRdv).toLocaleDateString('fr-FR') : '', d.lieu ? 'Lieu : ' + d.lieu : ''].filter(Boolean).join(' · ') });
  if (d.presents) blocs.push({ heading: 'Présents', text: d.presents });
  if (d.corps) blocs.push({ heading: d.type === 'pv' ? 'Déroulement' : d.type === 'rapport' ? 'Activités menées' : '', text: d.corps });
  if (d.pieces) blocs.push({ table: { head: ['N°', 'Désignation des pièces', 'Nombre'], widths: [0.5, 6, 1], rows: d.pieces.split('\n').filter(Boolean).map((p, i) => [String(i + 1), p, '1']) } });
  if (d.decisions) blocs.push({ heading: d.type === 'pv' ? 'Décisions' : 'Recommandations', text: d.decisions });
  if (d.difficultes) blocs.push({ heading: 'Difficultés', text: d.difficultes });
  if (d.perspectives) blocs.push({ heading: 'Perspectives', text: d.perspectives });
  download(await docOfficiel(u, { titre: T.titre, numero: d.numero, blocs, label: `${T.lib} ${d.numero}` }), clean(T.lib + '_' + d.numero) + '.pdf');
}
async function docsdosp(ctx) {
  const u = ctx.user;
  ctx.title('Documents officiels de la DOSP', "Notes de service, convocations, procès-verbaux, soit-transmis, relances, rapports d'activités, comptes rendus — numérotés, signés, cachetés, avec QR de vérification");
  const l = (await dospScoped(u, 'doc')).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  ctx.el.append(kpis(Object.entries(TYPES_DOC).slice(0, 6).map(([k, T]) => [T.lib, l.filter(d => d.type === k).length, ''])));
  const t = dataTable({ columns: [{ k: 'numero', l: 'N°', w: 220 }, { k: 'typeLib', l: 'Type' }, { k: 'objet', l: 'Objet', w: 280 }, { k: 'date', l: 'Date' }], rows: l, onOpen: (d) => telechargerDoc(u, d), empty: 'Aucun document. Choisissez un modèle ci-dessus.' });
  ctx.el.append(card('Documents rédigés (touchez une ligne pour le PDF signé)', t.el), card('Documents officiels de référence', h('p', {}, 'Les textes et modèles officiels du MEMP (fiches de recensement, guides, canevas statistiques, calendrier, règlement intérieur, emplois du temps) sont dans ', h('a', { href: '#/documents' }, 'Documents officiels'), '.')));
  async function rediger(type, rec) {
    const T = TYPES_DOC[type];
    const v = await formDialog({ title: T.lib, wide: true, fields: T.champs.map(k => ({ k, l: CHAMPS_DOC[k][0], t: CHAMPS_DOC[k][1], req: k === 'objet' })), values: rec || {} }); if (!v) return;
    const d = { ...(rec || { id: uid(), kind: 'doc', type, typeLib: T.lib, numero: await numeroDoc(u, T.prefixe), date: today(), ...base(u) }), ...v, maj: nowISO() };
    await db.put('dosp', d); await telechargerDoc(u, d); ctx.reload();
  }
  ctx.actions([...Object.entries(TYPES_DOC).map(([k, T]) => ({ label: '＋ ' + T.lib, onClick: () => rediger(k) })),
    { label: '\uE006 Modifier', onClick: () => (t.selected ? rediger(t.selected.type, t.selected) : toast('Touchez un document.', 'warn')) },
    { label: '\uE005 Supprimer', onClick: async () => { const s = t.selected; if (s && await confirmBox('Supprimer ce document ?', 'Supprimer', true)) { await db.del('dosp', s.id); ctx.reload(); } } }]);
}
