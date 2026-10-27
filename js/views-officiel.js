/* République du Bénin — MEMP — Vues : emplois du temps officiels, calendrier scolaire, règlement intérieur, personnel
   Textes officiels repris de SCOLARIS (emplois du temps MEMP 2016, règlement intérieur révisé 2018, arrêté du calendrier 2026-2027).
   Conception : Maître Aimé FACHE */
import { h, uid, nowISO, toast, modal, confirmBox, pickFile, readAsBuffer, readAsText, download, norm, fmtDate, today, clean } from './util.js';
import { calculerFiche, lireDate, fmtIso, fmtJour, fmtDuree, ANCIENNETES, CATEGORIES, DIPLOMES } from './carriere.js';
import { db } from './db.js';
import { dataTable, formDialog, fieldEl } from './ui.js';
import { scoped, inScope, addLog, cleGroupe, libGroupe, ordreGroupe, modeGroupeDefaut } from './data.js';
import { listToXlsx, listToPdf } from './export.js';
import { readXlsx, parseCsv, XlsxBook } from './xlsx.js';
import { newPdf, bannerBytes } from './pdf.js';

export async function render(id, ctx) { return ({ emploi, calendrier, reglement, personnel, carriere: (c) => personnel(c, 'carriere'), planif, espace, synocp })[id](ctx); }

const rc = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x !== null && x !== undefined && x !== false));
const pdfBlob = (b) => new Blob([b], { type: 'application/pdf' });
let _off = null;
const officiel = async () => _off || (_off = await (await fetch('data/officiel.json')).json());
const peutModifierTextes = (u) => u.role !== 'CP';
const ajuster = (ta) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };

/* ================= EMPLOIS DU TEMPS OFFICIELS ================= */
async function emploi(ctx) {
  const u = ctx.user, O = await officiel(), J = O.jours;
  ctx.title('Emplois du temps officiels', 'MEMP — Maternelle, CI-CP, CE1-CE2, CM1-CM2 (modifiables, version officielle rétablissable)');
  let cur = (await db.setting('edt-onglet')) || 'ci_cp';
  const tabs = h('div', { class: 'tabs no-print' }), holder = h('div');
  ctx.el.append(tabs, holder);
  const officielDe = (id) => JSON.parse(JSON.stringify(O.edt.find(e => e.id === id)));
  const lire = async (id) => (await db.setting('edt:' + id)) || officielDe(id);
  let edt = null, modifie = false;
  async function draw() {
    tabs.replaceChildren(...O.edt.map(e => h('button', { class: 'tab' + (e.id === cur ? ' on' : ''), onclick: async () => { if (modifie && !(await confirmBox('Quitter sans enregistrer les modifications ?', 'Quitter'))) return; cur = e.id; db.setting('edt-onglet', cur); draw(); } }, e.libelle)));
    edt = await lire(cur); modifie = false;
    const perso = !!(await db.setting('edt:' + cur));
    const cellule = (ligne, k) => {
      const ta = h('textarea', { class: 'edt-cell', rows: Math.max(2, String(ligne[k] || '').split('\n').length), readOnly: !peutModifierTextes(u), 'aria-label': k === 'horaire' ? 'Horaire' : `${k} ${ligne.horaire}`,
        oninput: (e) => { ligne[k] = e.target.value; modifie = true; ajuster(e.target); } }, ligne[k] || '');
      return h('td', { class: k === 'horaire' ? 'edt-h' : '' }, ta);
    };
    const pause = (l) => J.every(([j]) => /RÉCRÉATION|INTERCLASSE|PAUSE/i.test(l[j] || '')) && J.every(([j]) => l[j] === l[J[0][0]]);
    const suppr = (i) => peutModifierTextes(u) ? h('td', { class: 'no-print' }, h('button', { class: 'btn sm', title: 'Supprimer la ligne', 'aria-label': 'Supprimer la ligne', onclick: () => { edt.lignes.splice(i, 1); modifie = true; draw2(); } }, '✕')) : null;
    function draw2() {
      const corps = edt.lignes.map((l, i) => pause(l)
        ? h('tr', { class: 'edt-pause' }, cellule(l, 'horaire'), h('td', { colspan: J.length }, h('b', l[J[0][0]])), suppr(i))
        : h('tr', cellule(l, 'horaire'), ...J.map(([j]) => cellule(l, j)), suppr(i)));
      rc(holder, 
        h('p', { class: 'notes' }, h('b', edt.source || ''), perso ? h('span', { class: 'badge Transmise', style: { marginLeft: '8px' } }, 'version modifiée sur cet appareil') : h('span', { class: 'badge Validée', style: { marginLeft: '8px' } }, 'version officielle')),
        h('div', { class: 'tbl-wrap' }, h('table', { class: 't edt' },
          h('thead', h('tr', h('th', 'Horaire'), ...J.map(([, l]) => h('th', l)), peutModifierTextes(u) ? h('th', { class: 'no-print' }, '') : null)),
          h('tbody', corps))),
        edt.remarques && edt.remarques.length ? h('div', { class: 'card' }, h('h3', 'Remarques'), h('ul', edt.remarques.map(r => h('li', r)))) : null);
      requestAnimationFrame(() => holder.querySelectorAll('.edt-cell').forEach(ajuster));
    }
    draw2();
    ctx.actions([
      { label: '💾 Enregistrer', kind: 'primary', show: peutModifierTextes(u), onClick: async () => { await db.setting('edt:' + cur, edt); modifie = false; toast('Emploi du temps enregistré.'); draw(); } },
      { label: '➕ Ajouter une ligne', show: peutModifierTextes(u), onClick: () => { edt.lignes.push(Object.fromEntries([['horaire', ''], ...J.map(([j]) => [j, ''])])); modifie = true; draw2(); } },
      { label: '↺ Rétablir la version officielle', show: peutModifierTextes(u), onClick: async () => { if (!(await confirmBox('Remplacer cet emploi du temps par la version officielle du MEMP ?', 'Rétablir', true))) return; await db.setting('edt:' + cur, null); toast('Version officielle rétablie.'); draw(); } },
      { label: '⬇ PDF', onClick: async () => download(pdfBlob(await listToPdf({ title: `EMPLOI DU TEMPS OFFICIEL — ${edt.libelle.toUpperCase()}`, subtitle: edt.source, columns: [{ k: 'horaire', l: 'Horaire', w: 70 }, ...J.map(([j, l]) => ({ k: j, l, w: 140 }))], rows: edt.lignes })), `Emploi_du_temps_${cur}.pdf`) },
      { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: `EMPLOI DU TEMPS OFFICIEL — ${edt.libelle.toUpperCase()}`, subtitle: edt.source, columns: [{ k: 'horaire', l: 'Horaire', w: 90 }, ...J.map(([j, l]) => ({ k: j, l, xw: 34 }))], rows: edt.lignes, sheet: edt.libelle }), `Emploi_du_temps_${cur}.xlsx`) },
      { label: '🖨 Imprimer', onClick: () => window.print() }]);
    ctx.status(`${edt.lignes.length} plage(s) horaire(s)`);
  }
  await draw();
  return async () => { /* rien à nettoyer */ };
}

/* ================= CALENDRIER SCOLAIRE OFFICIEL ================= */
async function calendrier(ctx) {
  const O = await officiel(), annees = Object.keys(O.calendrier).sort().reverse();
  let an = annees[0];
  ctx.title('Calendrier scolaire officiel', 'Arrêté interministériel fixant le calendrier de l\'année scolaire');
  const holder = h('div'); ctx.el.append(holder);
  const COLS = [{ k: 'typeLib', l: 'Période', w: 90 }, { k: 'libelle', l: 'Libellé', w: 200 }, { k: 'du', l: 'Du', w: 80 }, { k: 'au', l: 'Au', w: 80 }, { k: 'precision', l: 'Précision', w: 200 }, { k: 'duree', l: 'Durée', w: 110 }, { k: 'obs', l: 'Référence', w: 90 }];
  const lignes = () => O.calendrier[an].lignes.map(l => ({ ...l, typeLib: O.types_calendrier[l.type] || l.type, du: fmtDate(l.debut), au: fmtDate(l.fin) }));
  function draw() {
    const C = O.calendrier[an];
    rc(holder, h('div', { class: 'card' }, h('h3', `Année scolaire ${an}`), h('p', C.arrete), h('p', { class: 'sub' }, C.signe)),
      h('div', { class: 'cal-liste' }, lignes().map(l => h('div', { class: 'cal-l', style: { borderLeftColor: O.couleurs_calendrier[l.type] || '#ccc' } },
        h('div', h('b', l.libelle), h('span', { class: 'sub' }, ' · ' + l.typeLib)), h('div', l.du === l.au ? `Le ${l.du}` : `Du ${l.du} au ${l.au}`, l.duree ? ` — ${l.duree}` : ''),
        l.precision ? h('div', { class: 'sub' }, l.precision) : null, h('div', { class: 'sub' }, l.obs)))));
    ctx.status(`${C.lignes.length} période(s) — ${an}`);
  }
  draw();
  ctx.actions([
    ...(annees.length > 1 ? annees.map(a => ({ label: a, onClick: () => { an = a; draw(); } })) : []),
    { label: '⬇ PDF', kind: 'primary', onClick: async () => download(pdfBlob(await listToPdf({ title: `CALENDRIER SCOLAIRE OFFICIEL ${an}`, subtitle: O.calendrier[an].arrete, columns: COLS, rows: lignes() })), `Calendrier_scolaire_${an}.pdf`) },
    { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: `CALENDRIER SCOLAIRE OFFICIEL ${an}`, subtitle: O.calendrier[an].arrete, columns: COLS, rows: lignes(), sheet: an }), `Calendrier_scolaire_${an}.xlsx`) },
    { label: '🖨 Imprimer', onClick: () => window.print() }]);
}

/* ================= RÈGLEMENT INTÉRIEUR ================= */
const TYPES_R = { preambule: 'Préambule', titre: 'Titre', article: 'Article' };
async function reglement(ctx) {
  const u = ctx.user, O = await officiel(), edit = peutModifierTextes(u);
  ctx.title('Règlement intérieur', 'Règlement intérieur des écoles primaires (révisé) — texte officiel modifiable');
  const officielListe = () => O.reglement.map((r, i) => ({ id: 'r' + i, ordre: i + 1, ...r }));
  const lire = async () => (await db.setting('reglement')) || officielListe();
  let liste = await lire(), sel = null, q = '';
  const recherche = h('input', { class: 'search', type: 'search', placeholder: 'Rechercher un mot dans le règlement…', 'aria-label': 'Rechercher', oninput: (e) => { q = norm(e.target.value); draw(); } });
  const holder = h('div', { class: 'reglement' });
  ctx.el.append(h('div', { class: 'tbl-tools no-print' }, recherche), holder,
    h('p', { class: 'notes' }, O.reglement_source, ' — ', h('a', { href: 'data/reglement/page-1.jpg', target: '_blank', rel: 'noopener' }, 'voir le document original numérisé (8 pages)')));
  const nomArticle = (r) => r.type === 'article' ? `Article ${r.numero}${r.titre ? ' — ' + r.titre : ''}` : r.type === 'titre' ? `TITRE ${r.numero} : ${r.titre}` : (r.titre || 'Préambule');
  function draw() {
    const vis = q ? liste.filter(r => norm(`${r.numero} ${r.titre} ${r.texte}`).includes(q)) : liste;
    rc(holder, ...vis.map(r => h('div', { class: 'reg-bloc reg-' + r.type + (r.id === sel ? ' sel' : ''), tabindex: 0, onclick: () => { sel = r.id; draw(); }, ondblclick: () => edit && modifier() },
      h(r.type === 'titre' ? 'h3' : 'h4', nomArticle(r)), r.texte ? r.texte.split('\n').map(p => h('p', p)) : null)));
    if (!vis.length) holder.append(h('div', { class: 'empty' }, 'Aucun résultat.'));
    ctx.status(`${liste.filter(r => r.type === 'article').length} article(s) · ${liste.filter(r => r.type === 'titre').length} titre(s)${q ? ` — ${vis.length} résultat(s)` : ''}`);
  }
  const FIELDS = [{ k: 'type', l: 'Type', t: 'select', options: Object.entries(TYPES_R).map(([v, l]) => ({ v, l })), req: true, w: 'half' }, { k: 'numero', l: 'Numéro (ex. 12, ou I pour un titre)', t: 'text', w: 'half' }, { k: 'titre', l: 'Intitulé', t: 'text' }, { k: 'texte', l: 'Texte', t: 'textarea' }];
  const enregistrer = async () => { liste.forEach((r, i) => { r.ordre = i + 1; }); await db.setting('reglement', liste); };
  const choisi = () => { const r = liste.find(x => x.id === sel); if (!r) toast('Touchez d\'abord un article.', 'warn'); return r; };
  async function ajouter() {
    const i = liste.findIndex(x => x.id === sel), suiv = liste.filter(x => x.type === 'article').reduce((m, x) => Math.max(m, parseInt(x.numero) || 0), 0) + 1;
    const v = await formDialog({ title: 'Ajouter au règlement', fields: FIELDS, values: { type: 'article', numero: String(suiv) }, wide: true }); if (!v) return;
    const r = { id: uid(), ...v }; liste.splice(i >= 0 ? i + 1 : liste.length, 0, r); sel = r.id; await enregistrer(); draw(); toast('Ajouté.');
  }
  async function modifier() { const r = choisi(); if (!r) return; const v = await formDialog({ title: 'Modifier — ' + nomArticle(r), fields: FIELDS, values: r, wide: true }); if (!v) return; Object.assign(r, v); await enregistrer(); draw(); toast('Modifié.'); }
  async function supprimer() { const r = choisi(); if (!r || !(await confirmBox(`Supprimer « ${nomArticle(r)} » ?`, 'Supprimer', true))) return; liste = liste.filter(x => x !== r); sel = null; await enregistrer(); draw(); }
  async function deplacer(d) { const i = liste.findIndex(x => x.id === sel); if (i < 0) return toast('Touchez d\'abord un article.', 'warn'); const j = i + d; if (j < 0 || j >= liste.length) return; [liste[i], liste[j]] = [liste[j], liste[i]]; await enregistrer(); draw(); }
  async function pdf() {
    const p = await newPdf({ title: 'Règlement intérieur des écoles primaires', footer: 'Règlement intérieur' });
    p.text('RÉPUBLIQUE DU BÉNIN — MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE', { bold: true, align: 'center', size: 9 }); p.space(2);
    p.titleBox(['RÈGLEMENT INTÉRIEUR DES ÉCOLES PRIMAIRES', '(révisé)'], { size: 13 });
    for (const r of liste) {
      if (r.type === 'titre') { p.space(4); p.heading(nomArticle(r)); continue; }
      p.space(3); p.text(nomArticle(r), { bold: true, size: 9.5 });
      if (r.texte) p.text(r.texte, { size: 9, gap: 2.5 });
    }
    p.space(8); p.text(O.reglement_source, { size: 7.5, color: [0.3, 0.3, 0.3] });
    download(pdfBlob(await p.finish()), 'Reglement_interieur.pdf');
  }
  draw();
  ctx.actions([
    { label: '➕ Ajouter', kind: 'primary', show: edit, onClick: ajouter }, { label: '✏️ Modifier', show: edit, onClick: modifier }, { label: '🗑 Supprimer', show: edit, onClick: supprimer },
    { label: '▲', title: 'Monter', show: edit, onClick: () => deplacer(-1) }, { label: '▼', title: 'Descendre', show: edit, onClick: () => deplacer(1) },
    { label: '↺ Rétablir le texte officiel', show: edit, onClick: async () => { if (!(await confirmBox('Remplacer le règlement par le texte officiel ? Vos modifications seront perdues.', 'Rétablir', true))) return; await db.setting('reglement', null); liste = officielListe(); sel = null; draw(); toast('Texte officiel rétabli.'); } },
    { label: '⬇ PDF', onClick: pdf },
    { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: 'RÈGLEMENT INTÉRIEUR DES ÉCOLES PRIMAIRES (RÉVISÉ)', subtitle: O.reglement_source, columns: [{ k: 'typeLib', l: 'Type', w: 70 }, { k: 'numero', l: 'N°', w: 40 }, { k: 'titre', l: 'Intitulé', xw: 30 }, { k: 'texte', l: 'Texte', xw: 100 }], rows: liste.map(r => ({ ...r, typeLib: TYPES_R[r.type] })), sheet: 'Règlement' }), 'Reglement_interieur.xlsx') },
    { label: '🖨 Imprimer', onClick: () => window.print() }]);
}

/* ================= PERSONNEL ENSEIGNANT (même module que SCOLARIS / GESCOL) ================= */
const FONCTIONS = ['Directeur / directrice', 'Adjoint(e)', 'Enseignant(e)', 'Conseiller pédagogique', 'Chef de circonscription scolaire', 'Secrétaire', 'Comptable / gestionnaire',
  'Agent de saisie / informaticien', 'Agent de liaison / planton', 'Gardien', 'Chauffeur', 'Agent d\'entretien', 'Cuisinier(ère) de cantine', 'Autre'];
const OUI_NON = [{ v: 'oui', l: 'Oui' }, { v: 'non', l: 'Non' }];
/* Colonnes reconnues à l'import : fichiers du ministère (cahier de contrôle DDEMP, FE / ACDPE / ACDPCTD) et extraction EducMaster
   (fiche d'importation du personnel au format EducMaster : modèle téléchargeable dans la liste du personnel). */
const ALIAS_P = { matricule: ['n matricule', 'matricule', 'numero matricule', 'n° matricule', 'matricule agent', 'matricule fonction publique'], nip: ['nip', 'npi', 'numero personnel d identification', 'n npi'],
  code_ecole: ['code etablissement', 'code ecole', 'code de l etablissement', 'code structure'], qualite: ['qualite'], emploi: ['emploi'], nom: ['nom'], prenoms: ['prenoms', 'prenom'], nom_epoux: ['nom epoux'],
  sexe: ['sexe', 'le genre', 'genre'], ecole: ['nom poste', 'ecole', 'poste', 'etablissement', 'etablissement d affectation', 'nom de l etablissement', 'libelle etablissement', 'structure d affectation'], fonction: ['fonction'], corps: ['corps'], statut: ['nom statut', 'statut', 'categorie', 'statut agent', 'type agent'],
  grade: ['grade'], cs: ['cs', 'circonscription', 'circonscription scolaire'], telephone: ['numero telephone', 'telephone', 'contact', 'tel', 'telephone 1', 'telephone mobile'],
  date_naissance: ['date de naissance', 'date naissance', 'ne le', 'naissance'], lieu_naissance: ['lieu naissance', 'lieu de naissance'],
  date_prise_service: ['date de premiere prise de service', 'date 1ere prise service', 'date premiere prise de service', 'date de premiere prise de service', 'premiere prise de service', 'date prise de service'],
  date_service_dep: ['date d arrivee dans le departement', 'date arrive departement', 'date arrivee departement', 'prise de service dans le departement'], date_service_ecole: ['date d arrivee au poste', 'date d affectation', 'date arrive poste', 'date arrivee poste', 'prise de service dans l ecole'],
  cap: ['date d obtention du cap', 'date optention du cap', 'date obtention du cap', 'cap'], indice_reel: ['indice reel'], indice_paye: ['indice paye'],
  note_evaluation: ['note evaluation 2023', 'note evaluation 2022', 'note evaluation', 'note d evaluation'], diplome_academique: ['diplome academique', 'diplome'] };
const cleEcole = (n) => norm(String(n || '').replace(/\(\s*(pobe|ex[^)]*|la riviere)\s*\)/gi, ' ')).replace(/^(epp|em|epv|ecole) /, '').replace(/ pobe$/, '').trim();
const distance = (a, b) => { const d = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } } return d[b.length]; };
/** Index des écoles par nom simplifié (avec les anciens noms « (Ex …) ») et recherche tolérante aux fautes de frappe */
function indexEcoles(schools) {
  const m = new Map();
  for (const s of schools) {
    const pre = norm(s.nom).split(' ')[0], cyc = s.cycle === 'Maternelle' ? 'em' : 'ep';
    m.set(cyc + ':' + cleEcole(s.nom), s);
    const ex = /\(\s*ex[\s-]*([^)]*)\)/i.exec(s.nom); if (ex) m.set(cyc + ':' + cleEcole(pre + ' ' + ex[1]), s);
  }
  return (nom) => {
    const cyc = /^\s*em\b/i.test(nom) ? 'em' : 'ep', k = cyc + ':' + cleEcole(nom); if (m.has(k)) return m.get(k);
    let best = null, bd = 99; for (const [kk, s] of m) { if (!kk.startsWith(cyc + ':')) continue; const d = distance(k, kk); if (d < bd) { bd = d; best = s; } }
    return best && bd <= Math.max(1, Math.floor(k.length * 0.12)) ? best : null;
  };
}
const ficheFonction = (f) => { const n = norm(f); return n.startsWith('direct') ? 'Directeur / directrice' : n.startsWith('adjoint') ? 'Adjoint(e)' : n.startsWith('conseiller') ? 'Conseiller pédagogique' : n.startsWith('chef de circ') ? 'Chef de circonscription scolaire' : f; };
const ficheStatut = (s) => { const n = norm(s).replace(/ /g, ''); return { fe: 'FE', acdpe: 'ACDPE', ace: 'ACE', ame: 'ACDPCTD', acdpctd: 'ACDPCTD' }[n] || s; };
const nombre = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : ''; };

/** Agents du périmètre de l'utilisateur, avec les calculs de carrière */
export async function personnelDuPerimetre(u) {
  const ecoles = new Map((await db.all('schools')).map(x => [x.id, x]));
  return (await db.all('personnel')).map(p => avecZone(p, ecoles)).filter(p => u.role === 'ADMIN' || inScope(u, p) || (u.role === 'CCS' && p.codeCs === u.codeCs)).map(p => calculerFiche(p));
}
/** Zone de l'agent : celle de son école (zone d'appartenance), sinon celle qui lui a été attribuée ; sans zone → « Personnel de la CS ». */
export function avecZone(p, ecoles) {
  const e = p.schoolId && ecoles.get(p.schoolId);
  if (e && e.codeZone) return { ...p, codeZone: e.codeZone, numZone: e.numZone || '', arrondissement: p.arrondissement || e.arrondissement || '', codeCs: p.codeCs || e.codeCs || '', zoneSource: 'école' };
  return { ...p, zoneSource: p.codeZone ? 'attribuée' : '' };
}

async function personnel(ctx, vueInitiale) {
  const u = ctx.user;
  ctx.title(vueInitiale === 'carriere' ? 'Gestion de carrière des enseignants' : 'Personnel enseignant', 'Carrière, anciennetés et départ à la retraite (règles de SCOLARIS et GESCOL) — par zone pédagogique ou par arrondissement');
  const zonesRef = (await db.all('ref')).filter(r => r.type === 'zone');
  const schools = await scoped('schools', u);
  const libZone = (c) => libGroupe(c ? 'z:' + c : 'cs', zonesRef, 'zone');
  let mode = u.role === 'CP' ? 'zone' : ((await db.setting('groupe-mode')) || modeGroupeDefaut(u));
  let onglet = (await db.setting('personnel-onglet')) || 'tout', vue = vueInitiale || 'liste', horizon = 2;
  const vues = h('div', { class: 'tabs no-print modes' }), modes = h('div', { class: 'tabs no-print modes' }), tabs = h('div', { class: 'tabs no-print' }), holder = h('div');
  ctx.el.append(vues, modes, tabs, holder);
  const COLS = [{ k: 'nom', l: 'Nom', w: 130 }, { k: 'prenoms', l: 'Prénoms', w: 150 }, { k: 'sexe', l: 'Sexe' }, { k: 'fonction', l: 'Fonction', w: 140 }, { k: 'ecole', l: 'École / poste', w: 190 },
    { k: 'zoneLib', l: 'Zone' }, { k: 'arrondissement', l: 'Arrondissement' }, { k: 'statut', l: 'Catégorie' }, { k: 'grade', l: 'Grade' },
    { k: 'naissTxt', l: 'Naissance' }, { k: 'retraiteTxt', l: 'Départ à la retraite', w: 110, render: r => r.retraiteTxt ? h('span', { class: r.retraiteAtteinte ? 'badge corriger' : r.alerteRetraite ? 'badge Transmise' : '' }, r.retraiteTxt) : h('span', { class: 'sub', title: r.retraiteRaison }, '—') },
    { k: 'restantTxt', l: 'Reste', w: 100 }, { k: 'ancGen', l: 'Anc. générale' }, { k: 'ancEcole', l: 'Anc. école' }, { k: 'dossier', l: 'Dossier', render: r => r.incomplet ? h('span', { class: 'badge Brouillon', title: 'Manque : ' + r.manquants.join(', ') }, 'incomplet') : h('span', { class: 'badge Validée' }, 'complet') },
    { k: 'matricule', l: 'Matricule' }, { k: 'telephone', l: 'Téléphone' }, { k: 'corps', l: 'Corps', w: 200 }];
  const enrichir = (p) => ({ ...p, zoneLib: p.codeZone ? libZone(p.codeZone) : '', naissTxt: fmtIso(p.date_naissance), ancGen: p.ancTxt.generale, ancEcole: p.ancTxt.ecole, dossier: p.incomplet ? 'incomplet' : 'complet' });
  let t, all = [];
  // par zone : chaque agent dans la zone de son école ; sans zone → « Personnel de la CS (zone à attribuer) »
  const cle = (p) => mode === 'zone' ? (p.codeZone ? 'z:' + p.codeZone : 'cs') : cleGroupe(p, mode);
  const LIB_CS = 'Personnel de la CS (zone à attribuer)';
  const libG = (g) => g === 'cs' && mode === 'zone' ? LIB_CS : libGroupe(g, zonesRef, mode);
  const dansOnglet = (p) => onglet === 'tout' || cle(p) === onglet;
  async function draw() {
    all = (await personnelDuPerimetre(u)).map(enrichir);
    const gs = [...new Set(all.map(cle))].sort(ordreGroupe);
    if (onglet !== 'tout' && !gs.includes(onglet)) onglet = 'tout';
    vues.replaceChildren(...[['liste', '👥 Liste du personnel'], ['cours', '🧮 Par section / cours'], ['carriere', '📈 Gestion de carrière'], ['retraite', '🎓 Départs à la retraite'], ['stats', '📊 Effectifs']].map(([k, l]) => h('button', { class: 'tab' + (k === vue ? ' on' : ''), onclick: () => { vue = k; t = null; draw(); } }, l)));
    if (u.role !== 'CP') modes.replaceChildren(...[['arr', 'Par arrondissement'], ['zone', 'Par zone pédagogique']].map(([k, l]) => h('button', { class: 'tab' + (k === mode ? ' on' : ''), onclick: () => { mode = k; onglet = 'tout'; db.setting('groupe-mode', k); draw(); } }, l)));
    const ong = [['tout', mode === 'arr' ? 'Tous les arrondissements' : 'Toutes les zones'], ...gs.map(g => [g, libG(g)])];
    tabs.replaceChildren(...ong.map(([k, l]) => h('button', { class: 'tab' + (k === onglet ? ' on' : ''), onclick: () => { onglet = k; db.setting('personnel-onglet', k); draw(); } }, `${l} (${k === 'tout' ? all.length : all.filter(p => cle(p) === k).length})`)));
    const rows = all.filter(dansOnglet).sort((a, b) => (a.ecole || '').localeCompare(b.ecole || '', 'fr') || (a.fonction || '').localeCompare(b.fonction || '', 'fr') || a.nom.localeCompare(b.nom, 'fr'));
    if (vue === 'retraite') return drawRetraite(rows);
    if (vue === 'carriere') return drawCarriere(rows);
    if (vue === 'stats') return drawStats(rows);
    if (vue === 'cours') return drawCours(rows, gs);
    if (!t) { t = dataTable({ columns: COLS, rows, onOpen: () => modifier(), pageSize: 50, empty: 'Aucun agent ici. Touchez « Ajouter » ou « Importer Excel ».' }); rc(holder, t.el); } else t.setRows(rows);
    const f = rows.filter(p => p.sexe === 'F').length;
    ctx.status(`${rows.length} agent(s) dont ${f} femme(s) — ${rows.filter(p => /^Directeur/.test(p.fonction)).length} directeur(s)/directrice(s) — ${rows.filter(p => p.alerteRetraite).length} départ(s) à la retraite dans les 2 ans — ${rows.filter(p => p.incomplet).length} dossier(s) incomplet(s)`);
    actionsListe();
  }
  /* ---------- gestion de carrière : même tableau que GESCOL (catégorie, grade, indices, anciennetés, retraite, aptitude, dossier) ---------- */
  const COLS_C = [{ k: 'nomComplet', l: 'Nom et prénoms', w: 170 }, { k: 'nip', l: 'NIP' }, { k: 'ecole', l: 'École / poste', w: 160 }, { k: 'statut', l: 'Catégorie' }, { k: 'grade', l: 'Grade' },
    { k: 'indice_paye', l: 'Indice payé', num: true }, { k: 'indice_reel', l: 'Indice réel', num: true }, { k: 'ancG', l: 'Anc. générale' }, { k: 'ancD', l: 'Anc. département' }, { k: 'ancC', l: 'Anc. commune' }, { k: 'ancE', l: 'Anc. école' },
    { k: 'naissTxt', l: 'Naissance' }, { k: 'retTxt', l: 'Retraite probable', w: 110 }, { k: 'aptitude', l: 'Aptitude' }, { k: 'dossier', l: 'Dossier' }];
  const ligneCarriere = (p) => ({ ...p, nomComplet: `${(p.nom || '').toUpperCase()} ${p.prenoms || ''}`.trim(), ancG: p.ancTxt.generale || '—', ancD: p.ancTxt.departement || '—', ancC: p.ancTxt.commune || '—', ancE: p.ancTxt.ecole || '—',
    retTxt: p.retraiteTxt ? p.retraiteTxt + (p.retraiteAtteinte ? ' (atteint)' : p.alerteRetraite ? ' ⚠' : '') : '—', aptitude: p.visite_aptitude ? `${p.visite_aptitude}${p.visite_aptitude_note ? ' (' + p.visite_aptitude_note + '/20)' : ''}` : '—',
    dossier: p.incomplet ? 'incomplet' : 'complet' });
  function drawCarriere(rows) {
    t = null;
    const L = rows.map(ligneCarriere);
    const parCat = {}; L.forEach(p => { const c = p.statut || 'Non renseignée'; parCat[c] = (parCat[c] || 0) + 1; });
    const tc = dataTable({ columns: COLS_C, rows: L, onOpen: () => ficheCarriere(), pageSize: 50, empty: 'Aucun agent.' });
    rc(holder, h('div', { class: 'cards' }, h('div', { class: 'stat' }, h('b', String(L.length)), h('span', 'agents')), ...Object.entries(parCat).map(([c, n]) => h('div', { class: 'stat' }, h('b', String(n)), h('span', c))),
      h('div', { class: 'stat y' }, h('b', String(L.filter(p => p.alerteRetraite || p.retraiteAtteinte).length)), h('span', 'départs dans les 2 ans ou atteints')), h('div', { class: 'stat' }, h('b', String(L.filter(p => p.incomplet).length)), h('span', 'dossiers incomplets'))),
      h('p', { class: 'notes' }, "Anciennetés arrêtées au 31 décembre de la première année de l'année scolaire en cours ; retraite : A = 60 ans, B = 58 ans, C = 55 ans, au 1er jour du trimestre qui suit le trimestre de naissance (règles de SCOLARIS et GESCOL). Touchez un agent pour sa fiche de carrière."),
      tc.el);
    t = tc;
    ctx.status(`${L.length} agent(s) — ${L.filter(p => p.incomplet).length} dossier(s) incomplet(s)`);
    ctx.actions([{ label: '📇 Fiche de carrière', kind: 'primary', onClick: ficheCarriere }, { label: '🖨 Fiche de carrière (PDF signé)', onClick: fichePdf }, { label: '✏️ Modifier', onClick: modifier },
      { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: 'GESTION DE CARRIÈRE — ' + titre(), subtitle: sousTitre(), columns: COLS_C, rows: L, sheet: 'Carrière' }), 'Gestion_carriere.xlsx') },
      { label: '⬇ Liste PDF', onClick: async () => download(pdfBlob(await listToPdf({ title: 'GESTION DE CARRIÈRE DES ENSEIGNANTS', subtitle: sousTitre(), columns: COLS_C.map(c => ({ ...c, w: c.w || 70 })), rows: L })), 'Gestion_carriere.pdf') }]);
  }
  async function fichePdf() {
    const s = t && t.selected; if (!s) return toast("Touchez d'abord un agent.", 'warn');
    const p = ligneCarriere(s), { getIdentity, makeCachet } = await import('./sign.js'), { dataUrlToBytes } = await import('./util.js');
    const idn = await getIdentity(), pdf = await newPdf({ title: 'Fiche de carrière — ' + p.nomComplet, footer: 'Fiche de carrière' });
    pdf.titleBox(['FICHE DE CARRIÈRE', p.nomComplet], { size: 12 });
    const kv = (rows) => pdf.table({ widths: [2.2, 3], size: 8.5, rows: rows.filter(r => r[1] !== undefined).map(([a, b]) => [{ t: a, b: true }, String(b ?? '')]) });
    pdf.heading('1. Identification'); kv([['Nom et prénoms', p.nomComplet], ['Sexe', p.sexe], ['Date et lieu de naissance', [fmtIso(p.date_naissance), p.lieu_naissance].filter(Boolean).join(' à ')], ['Matricule / NIP', [p.matricule, p.nip].filter(Boolean).join(' / ')], ['Téléphone', p.telephone]]);
    pdf.heading('2. Situation administrative'); kv([['École / poste', p.ecole], ['Fonction', p.fonction], ['Catégorie', p.statut], ['Grade', p.grade], ['Corps', p.corps], ['Indice payé / réel', [p.indice_paye, p.indice_reel].filter(x => x !== '' && x != null).join(' / ')]]);
    pdf.heading('3. Prises de service et anciennetés'); kv([...ANCIENNETES.map(([cle, champ, lib]) => [lib, s[champ] ? `${fmtDuree(s.anc[cle]) || '—'} (depuis le ${fmtIso(s[champ])})` : 'non renseignée']), ['Date de référence', fmtJour(s.reference)]]);
    pdf.heading('4. Diplômes, examens professionnels et évaluation'); kv([['Diplôme académique', [p.diplome_academique, p.diplome_academique_annee].filter(Boolean).join(' — ')], ['CEAP', [p.ceap, p.ceap_annee].filter(Boolean).join(' — ')], ['CAP', [p.cap, p.cap_annee].filter(Boolean).join(' — ')],
      ["Visite d'aptitude", p.aptitude], ['Visites du CP / du CCS', `${p.visites_cp || 0} / ${p.visites_ccs || 0}`], ["Participation à l'UP", p.participation_up ? p.participation_up + ' %' : ''], ["Note d'évaluation", p.note_evaluation ? p.note_evaluation + '/20' : ''], ['Dernière formation', fmtIso(p.date_derniere_formation)]]);
    pdf.heading('5. Départ à la retraite'); kv([['Âge légal', s.ageRetraite ? s.ageRetraite + ' ans (grade ' + s.lettreGrade + ')' : ''], ['Date probable', s.retraiteTxt || 'non calculable : ' + s.retraiteRaison], ['Reste', s.retraiteAtteinte ? 'âge de départ atteint' : s.restantTxt || ''], ['Dossier', s.incomplet ? 'incomplet — manque : ' + s.manquants.join(', ') : 'complet']]);
    if (idn) await pdf.authBlock({ role: idn.titre || 'Le responsable', nom: `${idn.prenoms || ''} ${idn.nom || ''}`.trim(), signature: idn.signature && dataUrlToBytes(idn.signature), cachet: dataUrlToBytes(await makeCachet(idn)), qrText: `MEMP-BJ|CARRIERE|${p.matricule || p.nip || p.id}|${p.nomComplet}`, lines: [`Édité le ${new Date().toLocaleDateString('fr-FR')}`] });
    download(pdfBlob(await pdf.finish()), clean('Fiche_carriere_' + p.nomComplet) + '.pdf');
  }
  /* ---------- départs à la retraite ---------- */
  const COLS_R = [{ k: 'nom', l: 'Nom', w: 120 }, { k: 'prenoms', l: 'Prénoms', w: 140 }, { k: 'fonction', l: 'Fonction', w: 110 }, { k: 'ecole', l: 'École / poste', w: 170 }, { k: 'zoneLib', l: 'Zone / arrondissement', w: 110 },
    { k: 'grade', l: 'Grade', w: 60 }, { k: 'naissTxt', l: 'Naissance', w: 75 }, { k: 'ageTxt', l: 'Âge légal', w: 55 }, { k: 'retraiteTxt', l: 'Départ', w: 75 }, { k: 'restantTxt', l: 'Reste', w: 90 }];
  function drawRetraite(rows) {
    t = null;
    const auj = new Date(), lim = new Date(auj.getFullYear() + horizon, auj.getMonth(), auj.getDate());
    const lg = (p) => ({ ...p, zoneLib: p.codeZone ? libZone(p.codeZone) : (p.arrondissement || ''), ageTxt: p.ageRetraite ? p.ageRetraite + ' ans' : '' });
    const depasses = rows.filter(p => p.retraiteAtteinte).map(lg).sort((a, b) => a.retraite - b.retraite);
    const prochains = rows.filter(p => p.retraite && !p.retraiteAtteinte && p.retraite <= lim).map(lg).sort((a, b) => a.retraite - b.retraite);
    const sans = rows.filter(p => !p.retraite);
    const parAn = {}; rows.filter(p => p.retraite && !p.retraiteAtteinte).forEach(p => { const a = p.retraite.getFullYear(); parAn[a] = (parAn[a] || 0) + 1; });
    const ans = Object.keys(parAn).sort().slice(0, 10);
    const tableau = (l, vide) => l.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', h('tr', COLS_R.map(c => h('th', c.l)))), h('tbody', l.map(p => h('tr', COLS_R.map(c => h('td', p[c.k] ?? ''))))))) : h('p', { class: 'sub' }, vide);
    rc(holder, 
      h('div', { class: 'card' }, h('h3', 'Règle de calcul (identique à SCOLARIS et GESCOL)'),
        h('p', 'Âge de départ selon la lettre du grade : ', h('b', 'A = 60 ans, B = 58 ans, C = 55 ans'), '. Date de départ : 1er jour du trimestre qui suit le trimestre de naissance (janv.–mars → 1er avril ; avril–juin → 1er juillet ; juil.–sept. → 1er octobre ; oct.–déc. → 1er janvier suivant). Année de naissance seule : 1er janvier de (année + âge + 1).'),
        h('div', { class: 'tabs no-print' }, [1, 2, 3, 5].map(n => h('button', { class: 'tab' + (n === horizon ? ' on' : ''), onclick: () => { horizon = n; draw(); } }, `Horizon ${n} an${n > 1 ? 's' : ''}`)))),
      h('div', { class: 'cards' }, h('div', { class: 'stat' }, h('b', String(prochains.length)), h('span', `départ(s) d'ici ${horizon} an${horizon > 1 ? 's' : ''}`)),
        h('div', { class: 'stat y' }, h('b', String(depasses.length)), h('span', 'âge de départ déjà atteint')),
        h('div', { class: 'stat' }, h('b', String(sans.length)), h('span', 'sans date calculable (naissance ou grade manquant)'))),
      ans.length ? h('div', { class: 'card' }, h('h3', 'Départs par année'), h('p', ans.map(a => `${a} : ${parAn[a]}`).join(' · '))) : null,
      h('h2', { class: 'sec-h' }, `Départs d'ici ${horizon} an${horizon > 1 ? 's' : ''}`), tableau(prochains, 'Aucun départ prévu sur cette période.'),
      h('h2', { class: 'sec-h' }, 'Âge de départ déjà atteint (à vérifier)'), tableau(depasses, 'Aucun.'),
      sans.length ? h('p', { class: 'notes' }, `${sans.length} agent(s) sans date de naissance ou sans grade A/B/C : complétez leur fiche ou importez le cahier de contrôle (Importer Excel).`) : null);
    ctx.status(`${prochains.length} départ(s) d'ici ${horizon} an(s) · ${depasses.length} déjà atteint(s)`);
    const titreR = `DÉPARTS À LA RETRAITE — HORIZON ${horizon} AN${horizon > 1 ? 'S' : ''}`;
    ctx.actions([
      { label: '⬇ PDF', kind: 'primary', onClick: async () => download(pdfBlob(await listToPdf({ title: titreR, subtitle: sousTitre(), columns: COLS_R, rows: [...prochains, ...depasses.map(p => ({ ...p, restantTxt: 'atteint' }))] })), 'Departs_retraite.pdf') },
      { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: titreR, subtitle: sousTitre(), columns: COLS_R, rows: [...prochains, ...depasses.map(p => ({ ...p, restantTxt: 'atteint' }))], sheet: 'Retraite' }), 'Departs_retraite.xlsx') }]);
  }
  /* ---------- effectifs ---------- */
  function drawStats(rows) {
    t = null;
    const grp = new Map(); rows.forEach(p => { const k = p.ecole || '—'; const o = grp.get(k) || { ecole: k, zone: p.codeZone ? libZone(p.codeZone) : (p.arrondissement || ''), t: 0, f: 0, dir: 0, fe: 0, acdpe: 0, ame: 0, ret: 0 }; o.t++; if (p.sexe === 'F') o.f++; if (/^Directeur/.test(p.fonction)) o.dir++; if (p.statut === 'FE') o.fe++; if (p.statut === 'ACDPE') o.acdpe++; if (p.statut === 'ACDPCTD') o.ame++; if (p.alerteRetraite) o.ret++; grp.set(k, o); });
    const lignes = [...grp.values()].sort((a, b) => a.ecole.localeCompare(b.ecole, 'fr')), tot = { ecole: 'TOTAL', zone: '' };
    ['t', 'f', 'dir', 'fe', 'acdpe', 'ame', 'ret'].forEach(k => { tot[k] = lignes.reduce((s, x) => s + x[k], 0); });
    const COLS_S = [{ k: 'ecole', l: 'École / poste', w: 200 }, { k: 'zone', l: 'Zone / arrondissement', w: 110 }, { k: 't', l: 'Total', num: true }, { k: 'f', l: 'dont F', num: true }, { k: 'dir', l: 'Directeurs', num: true }, { k: 'fe', l: 'FE', num: true }, { k: 'acdpe', l: 'ACDPE', num: true }, { k: 'ame', l: 'ACDPCTD (AME)', num: true }, { k: 'ret', l: 'Retraite ≤ 2 ans', num: true }];
    const tb = dataTable({ columns: COLS_S, rows: lignes, getId: r => r.ecole, totals: tot, pageSize: 300 }); rc(holder, tb.el);
    ctx.status(`${lignes.length} école(s) / poste(s) — ${tot.t} agent(s)`);
    ctx.actions([{ label: '⬇ PDF', kind: 'primary', onClick: async () => download(pdfBlob(await listToPdf({ title: 'EFFECTIFS DU PERSONNEL PAR ÉCOLE', subtitle: sousTitre(), columns: COLS_S, rows: lignes, totals: tot })), 'Effectifs_personnel.pdf') },
      { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: 'EFFECTIFS DU PERSONNEL PAR ÉCOLE', subtitle: sousTitre(), columns: COLS_S, rows: [...lignes, tot], sheet: 'Effectifs' }), 'Effectifs_personnel.xlsx') }]);
  }
  /* ---------- zone à attribuer ---------- */
  async function attribuerZone() {
    const sansZone = all.filter(p => !p.codeZone).sort((a, b) => (a.ecole || '').localeCompare(b.ecole || '', 'fr') || a.nom.localeCompare(b.nom, 'fr'));
    if (!sansZone.length) return toast('Tous les agents ont une zone.', 'ok');
    if (!zonesRef.length) return toast('Aucune zone pédagogique dans le référentiel.', 'warn');
    const choix = new Set(t && t.selected && !t.selected.codeZone ? [t.selected.id] : []);
    let zc = zonesRef[0].code, ecoleAussi = true;
    const liste = h('div', { class: 'liste-cases' }, sansZone.map(p => h('label', { class: 'chk', style: { display: 'flex', margin: '3px 0' } },
      h('input', { type: 'checkbox', checked: choix.has(p.id), onchange: (e) => { e.target.checked ? choix.add(p.id) : choix.delete(p.id); } }),
      ` ${(p.nom || '').toUpperCase()} ${p.prenoms || ''} — ${p.fonction || ''} — ${p.ecole || 'sans poste'}`)));
    const body = h('div', h('p', { class: 'notes' }, "Un agent prend la zone de son école. Pour un agent de la circonscription (CP, secrétariat…) ou dont l'école n'a pas encore de zone, choisissez-la ici."),
      fieldEl({ k: 'zone', l: 'Zone pédagogique', t: 'select', options: zonesRef.map(z => ({ v: z.code, l: z.nom || 'Zone ' + z.numero })) }, zc, (k, v) => { zc = v; }),
      h('label', { class: 'chk', style: { margin: '6px 0' } }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { ecoleAussi = e.target.checked; } }), " Donner aussi cette zone à l'école de l'agent quand elle n'en a pas"),
      h('div', { class: 'tbl-tools' }, h('button', { class: 'btn sm', onclick: () => { sansZone.forEach(p => choix.add(p.id)); liste.querySelectorAll('input').forEach(i => { i.checked = true; }); } }, 'Tout cocher')), liste);
    modal({ title: `📍 Attribuer une zone (${sansZone.length} agent(s) sans zone)`, body, wide: true, actions: [{ label: 'Annuler' }, { label: 'Attribuer', kind: 'primary', onClick: async () => {
      if (!choix.size) { toast('Cochez au moins un agent.', 'warn'); return false; }
      const z = zonesRef.find(x => x.code === zc), num = String(z.numero || zc.split('-ZP').pop().replace(/^0/, ''));
      const ecs = new Map(schools.map(x => [x.id, x])), ecolesMaj = new Map();
      for (const id of choix) {
        const p = brut(all.find(x => x.id === id)); Object.assign(p, { codeZone: zc, numZone: num, updated: nowISO() }); await db.put('personnel', p);
        const e = p.schoolId && ecs.get(p.schoolId); if (ecoleAussi && e && !e.codeZone) ecolesMaj.set(e.id, { ...e, codeZone: zc, numZone: num });
      }
      if (ecolesMaj.size) await db.putMany('schools', [...ecolesMaj.values()]);
      await addLog(u, { action: 'Zone attribuée', target: `${choix.size} agent(s)`, to: z.nom || zc });
      toast(`${choix.size} agent(s) rangé(s) dans ${z.nom || zc}${ecolesMaj.size ? ` — ${ecolesMaj.size} école(s) aussi` : ''}.`); draw();
    } }] });
  }
  /* ---------- rubriques par section (maternelle) et par cours (primaire) ---------- */
  const RUBS = [['PS', 'Maternelle — petite section'], ['GS', 'Maternelle — grande section'], ['CI', 'CI'], ['CP', 'CP'], ['CE1', 'CE1'], ['CE2', 'CE2'], ['CM1', 'CM1'], ['CM2', 'CM2'], ['AUTRE', 'Sans classe / autres fonctions']];
  const libRub = Object.fromEntries(RUBS);
  const rubriquesAgent = (p) => {
    const t2 = norm(p.cours_tenus || ''), out = [];
    if (/\b(ps|sp|petite?s?|section des petits)\b/.test(t2)) out.push('PS');
    if (/\b(gs|sg|grande?s?|section des grands)\b/.test(t2)) out.push('GS');
    for (const c of ['ci', 'cp', 'ce1', 'ce2', 'cm1', 'cm2']) if (new RegExp('\\b' + c + '\\b').test(t2)) out.push(c.toUpperCase());
    return out.length ? out : ['AUTRE'];
  };
  async function changerCours(p, val) {
    const rec = brut(all.find(x => x.id === p.id)); rec.cours_tenus = val === 'AUTRE' ? '' : (val === 'PS' ? 'Petite section' : val === 'GS' ? 'Grande section' : val); rec.updated = nowISO();
    await db.put('personnel', rec); toast(`${p.nom} : ${libRub[val]}.`); draw();
  }
  function drawCours(rows, gs) {
    t = null;
    const groupes = onglet === 'tout' ? gs : [onglet];
    const L = rows.map(p => ({ ...p, rubriques: rubriquesAgent(p) }));
    const cpt = (rub, g, sx) => L.filter(p => p.rubriques.includes(rub) && (!g || cle(p) === g) && (!sx || p.sexe === sx)).length;
    const head = h('thead', h('tr', h('th', { rowspan: 2 }, 'Rubrique'), ...groupes.map(g => h('th', { colspan: 3 }, libG(g))), groupes.length > 1 ? h('th', { colspan: 3 }, 'Total CS') : null),
      h('tr', ...[...groupes, ...(groupes.length > 1 ? ['tot'] : [])].flatMap(() => ['H', 'F', 'T'].map(x => h('th', x)))));
    const ligne = (rub) => h('tr', { class: rub === 'AUTRE' ? 'tot' : '' }, h('td', { class: 'lab' }, libRub[rub]), ...[...groupes, ...(groupes.length > 1 ? [null] : [])].flatMap(g => [cpt(rub, g, 'M'), cpt(rub, g, 'F'), cpt(rub, g)].map(v => h('td', { class: 'calc' }, String(v)))));
    const totalLigne = h('tr', { class: 'tot' }, h('td', { class: 'lab' }, 'Ensemble des agents'), ...[...groupes, ...(groupes.length > 1 ? [null] : [])].flatMap(g => { const a = L.filter(p => !g || cle(p) === g); return [a.filter(p => p.sexe === 'M').length, a.filter(p => p.sexe === 'F').length, a.length].map(v => h('td', { class: 'calc' }, String(v))); }));
    const opts = RUBS.map(([k, l]) => h('option', { value: k }, l));
    const listeRub = (rub) => {
      const a = L.filter(p => p.rubriques.includes(rub)).sort((x, y) => (x.ecole || '').localeCompare(y.ecole || '', 'fr') || x.nom.localeCompare(y.nom, 'fr'));
      if (!a.length) return null;
      const seule = L.every(p => p.rubriques.includes('AUTRE'));
      return h('details', { class: 'card', open: (rub !== 'AUTRE' && a.length <= 40) || (rub === 'AUTRE' && seule) },
        h('summary', h('b', `${libRub[rub]} — ${a.length} agent(s)`), ` (${a.filter(p => p.sexe === 'M').length} H · ${a.filter(p => p.sexe === 'F').length} F)`),
        h('div', { class: 'tbl-wrap' }, h('table', { class: 't fixe1' }, h('thead', h('tr', ['N°', 'Nom et prénoms', 'Sexe', 'Fonction', 'École / poste', 'Zone', 'Section / cours tenu'].map(x => h('th', x)))),
          h('tbody', a.map((p, i) => h('tr', h('td', String(i + 1)), h('td', `${(p.nom || '').toUpperCase()} ${p.prenoms || ''}`), h('td', p.sexe || ''), h('td', p.fonction || ''), h('td', p.ecole || ''), h('td', p.codeZone ? libZone(p.codeZone) : LIB_CS),
            h('td', p.rubriques.length > 1 ? (p.cours_tenus || '') : h('select', { class: 'input', 'aria-label': 'Section ou cours tenu', style: { minWidth: '150px', padding: '4px' }, onchange: (e) => changerCours(p, e.target.value) }, ...opts.map(o => { const c = o.cloneNode(true); if (c.value === rub) c.selected = true; return c; })))))))));
    };
    rc(holder, h('div', { class: 'card' }, h('h3', { class: 'fixe' }, 'Personnel par section (maternelle) et par cours (primaire)'),
      h('p', { class: 'notes' }, "Rubrique d'après « Cours tenu(s) » de la fiche de l'agent (un agent de classe multigrade compte dans chacun de ses cours). Choisissez la section ou le cours directement dans les listes ci-dessous ; les directeurs déchargés, CP et autres fonctions restent dans « Sans classe / autres fonctions »."),
      h('div', { class: 'gridwrap' }, h('table', { class: 'g' }, head, h('tbody', ...RUBS.map(([k]) => ligne(k)), totalLigne)))),
      ...RUBS.map(([k]) => listeRub(k)).filter(Boolean));
    ctx.status(`${L.length} agent(s) — ${L.filter(p => !p.rubriques.includes('AUTRE')).length} avec une section ou un cours, ${L.filter(p => p.rubriques.includes('AUTRE')).length} sans classe ou autre fonction`);
    const titreC = `PERSONNEL PAR SECTION ET PAR COURS — ${onglet === 'tout' ? 'TOUTES LES ZONES' : libG(onglet).toUpperCase()}`;
    ctx.actions([
      { label: '⬇ Excel', kind: 'primary', onClick: async () => {
        const wb = new XlsxBook(), ws = wb.sheet('Synthèse'); let r = ws.banner(await bannerBytes(), 820);
        ws.set(r, 0, titreC, 'title'); r++; ws.set(r, 0, sousTitre(), 'note'); r += 2;
        const cols = [...groupes, ...(groupes.length > 1 ? [null] : [])];
        ws.set(r, 0, 'Rubrique', 'th'); ws.merge(r, 0, r + 1, 0); ws.width(0, 34);
        cols.forEach((g, i) => { const c = 1 + i * 3; ws.set(r, c, g ? libG(g) : 'Total CS', 'th'); ws.set(r, c + 1, '', 'th'); ws.set(r, c + 2, '', 'th'); ws.merge(r, c, r, c + 2); ['H', 'F', 'T'].forEach((x, j) => { ws.set(r + 1, c + j, x, 'th'); ws.width(c + j, 8); }); });
        ws.set(r + 1, 0, '', 'th'); const h0 = r; r += 2;
        for (const [k, l] of [...RUBS, ['__tot', 'Ensemble des agents']]) {
          ws.set(r, 0, l, k === '__tot' ? 'total' : 'label');
          cols.forEach((g, i) => { const a = L.filter(p => (k === '__tot' || p.rubriques.includes(k)) && (!g || cle(p) === g)); [a.filter(p => p.sexe === 'M').length, a.filter(p => p.sexe === 'F').length, a.length].forEach((v, j) => ws.set(r, 1 + i * 3 + j, v, k === '__tot' ? 'total' : 'tdn')); });
          r++;
        }
        ws.freeze(h0 + 2, 1);
        const w2 = wb.sheet('Liste par rubrique'); let q = w2.banner(await bannerBytes(), 820); w2.set(q, 0, titreC, 'title'); q += 2;
        const C = ['Rubrique', 'N°', 'Nom et prénoms', 'Sexe', 'Fonction', 'École / poste', 'Zone', 'Cours tenu(s)']; C.forEach((x, i) => { w2.set(q, i, x, 'th'); w2.width(i, [30, 6, 32, 7, 22, 34, 26, 18][i]); }); const h2 = q; q++;
        for (const [k, l] of RUBS) L.filter(p => p.rubriques.includes(k)).sort((x, y) => (x.ecole || '').localeCompare(y.ecole || '', 'fr') || x.nom.localeCompare(y.nom, 'fr')).forEach((p, i) => {
          [l, i + 1, `${(p.nom || '').toUpperCase()} ${p.prenoms || ''}`, p.sexe || '', p.fonction || '', p.ecole || '', p.codeZone ? libZone(p.codeZone) : LIB_CS, p.cours_tenus || ''].forEach((v, j) => w2.set(q, j, v, j === 1 || j === 3 ? 'tdc' : 'td')); q++; });
        w2.freeze(h2 + 1, 0);
        download(await wb.toBlob(), 'Personnel_par_section_et_cours.xlsx');
      } },
      { label: '⬇ PDF', onClick: async () => {
        const pdf = await newPdf({ title: titreC, footer: 'Personnel par section et par cours', orientation: 'landscape' });
        pdf.titleBox([titreC, sousTitre()].filter(Boolean), { size: 11 });
        const cols = [...groupes, ...(groupes.length > 1 ? [null] : [])];
        const headP = [{ t: 'Rubrique', c: 0, r: 0, rs: 2 }, ...cols.flatMap((g, i) => [{ t: g ? libG(g) : 'Total CS', c: 1 + i * 3, s: 3, r: 0 }, ...['H', 'F', 'T'].map((x, j) => ({ t: x, c: 1 + i * 3 + j, r: 1 }))])];
        const body = [...RUBS, ['__tot', 'Ensemble des agents']].map(([k, l]) => [{ t: l, b: k === '__tot' }, ...cols.flatMap(g => { const a = L.filter(p => (k === '__tot' || p.rubriques.includes(k)) && (!g || cle(p) === g)); return [a.filter(p => p.sexe === 'M').length, a.filter(p => p.sexe === 'F').length, a.length].map(String); })]);
        pdf.table({ widths: [150, ...cols.flatMap(() => [28, 28, 32])], headRows: 2, head: headP, rows: body, size: 8, align: ['left', ...cols.flatMap(() => ['center', 'center', 'center'])] });
        for (const [k, l] of RUBS) {
          const a = L.filter(p => p.rubriques.includes(k)).sort((x, y) => (x.ecole || '').localeCompare(y.ecole || '', 'fr') || x.nom.localeCompare(y.nom, 'fr')); if (!a.length) continue;
          pdf.space(8); pdf.heading(`${l} — ${a.length} agent(s)`);
          pdf.table({ widths: [22, 160, 30, 90, 180, 110], head: ['N°', 'Nom et prénoms', 'Sexe', 'Fonction', 'École / poste', 'Zone'].map((x, i) => ({ t: x, c: i, r: 0 })), rows: a.map((p, i) => [String(i + 1), `${(p.nom || '').toUpperCase()} ${p.prenoms || ''}`, p.sexe || '', p.fonction || '', p.ecole || '', p.codeZone ? libZone(p.codeZone) : LIB_CS]), size: 7.5 });
        }
        download(pdfBlob(await pdf.finish()), 'Personnel_par_section_et_cours.pdf');
      } },
      { label: '📍 Attribuer une zone', onClick: attribuerZone, show: u.role !== 'CP' },
      { label: '🖨 Imprimer', onClick: () => window.print() }]);
  }
  const sousTitre = () => [u.nomCs ? 'Circonscription scolaire de ' + u.nomCs : '', onglet === 'tout' ? '' : libG(onglet)].filter(Boolean).join(' — ');
  const schoolOptions = () => schools.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(s => ({ v: s.id, l: `${s.nom} (${s.codeZone ? libZone(s.codeZone) : s.arrondissement || 'sans zone'})` }));
  const FIELDS = () => [
    { k: 'nom', l: 'Nom', t: 'text', req: true, w: 'half' }, { k: 'prenoms', l: 'Prénoms', t: 'text', w: 'half' },
    { k: 'sexe', l: 'Sexe', t: 'select', options: [{ v: 'M', l: 'Masculin' }, { v: 'F', l: 'Féminin' }], w: 'third' }, { k: 'date_naissance', l: 'Date de naissance', t: 'date', w: 'third' }, { k: 'lieu_naissance', l: 'Lieu de naissance', t: 'text', w: 'third' },
    { k: 'matricule', l: 'N° matricule', t: 'text', w: 'third' }, { k: 'nip', l: 'NIP', t: 'text', w: 'third' }, { k: 'telephone', l: 'Téléphone', t: 'text', w: 'third' },
    { k: 'fonction', l: 'Fonction', t: 'select', options: FONCTIONS, req: true, w: 'half' }, { k: 'schoolId', l: 'École (vide = circonscription)', t: 'select', options: schoolOptions(), w: 'half' },
    { k: 'statut', l: 'Catégorie', t: 'select', options: CATEGORIES, w: 'third' }, { k: 'grade', l: 'Grade (ex. B1-04 ; A, B ou C)', t: 'text', w: 'third' }, { k: 'corps', l: 'Corps', t: 'text', w: 'third' },
    { k: 'indice_paye', l: 'Indice payé', t: 'number', w: 'half' }, { k: 'indice_reel', l: 'Indice réel', t: 'number', w: 'half' },
    { k: 'date_prise_service', l: 'Première prise de service', t: 'date', w: 'half' }, { k: 'date_service_dep', l: 'Prise de service dans le département', t: 'date', w: 'half' },
    { k: 'date_service_commune', l: 'Prise de service dans la commune', t: 'date', w: 'half' }, { k: 'date_service_ecole', l: "Prise de service dans l'école", t: 'date', w: 'half' },
    { k: 'diplome_academique', l: 'Diplôme académique le plus élevé', t: 'select', options: DIPLOMES, w: 'half' }, { k: 'diplome_academique_annee', l: 'Année du diplôme', t: 'number', w: 'half' },
    { k: 'ceap', l: 'CEAP', t: 'select', options: OUI_NON, w: 'q' }, { k: 'ceap_annee', l: 'Année du CEAP', t: 'number', w: 'q' }, { k: 'cap', l: 'CAP', t: 'select', options: OUI_NON, w: 'q' }, { k: 'cap_annee', l: 'Année du CAP', t: 'number', w: 'q' },
    { k: 'visite_aptitude', l: "Visite d'aptitude", t: 'select', options: OUI_NON, w: 'q' }, { k: 'visite_aptitude_note', l: 'Note (/20)', t: 'number', w: 'q' }, { k: 'visites_cp', l: 'Visites du CP', t: 'number', w: 'q' }, { k: 'visites_ccs', l: 'Visites du CCS', t: 'number', w: 'q' },
    { k: 'participation_up', l: "Participation à l'UP (%)", t: 'number', w: 'third' }, { k: 'note_evaluation', l: "Note d'évaluation (/20)", t: 'number', w: 'third' }, { k: 'cours_tenus', l: 'Cours tenu(s)', t: 'text', w: 'third' },
    { k: 'date_derniere_formation', l: 'Date de la dernière formation', t: 'date', w: 'half' }, { k: 'gestion_collegiale', l: 'Gestion collégiale (responsabilités)', t: 'text', w: 'half' },
    { k: 'obs', l: 'Observations', t: 'textarea' }];
  const valider = (v) => {
    for (const k of ['indice_paye', 'indice_reel', 'diplome_academique_annee', 'ceap_annee', 'cap_annee', 'visites_cp', 'visites_ccs']) if (v[k] !== undefined && v[k] !== '' && !(Number.isInteger(+v[k]) && +v[k] >= 0)) return `Valeur invalide : ${k.replace(/_/g, ' ')}`;
    for (const k of ['visite_aptitude_note', 'note_evaluation']) if (v[k] !== undefined && v[k] !== '' && !(+v[k] >= 0 && +v[k] <= 20)) return 'Les notes sont sur 20.';
    if (v.participation_up !== undefined && v.participation_up !== '' && !(+v.participation_up >= 0 && +v.participation_up <= 100)) return 'La participation à l\'UP est un pourcentage (0 à 100).';
    if (v.date_naissance && v.date_prise_service && v.date_prise_service < v.date_naissance) return 'La prise de service ne peut pas précéder la naissance.';
    return null;
  };
  const lier = (p) => {
    const s = schools.find(x => x.id === p.schoolId);
    if (s) Object.assign(p, { ecole: s.nom, codeZone: s.codeZone || p.codeZone || '', numZone: s.numZone || (s.codeZone ? '' : p.numZone) || '', codeCs: s.codeCs || '', arrondissement: s.arrondissement || '' });
    else Object.assign(p, { schoolId: '', ecole: p.ecole && !p.schoolId ? p.ecole : (u.nomCs ? 'Circonscription scolaire de ' + u.nomCs : 'Circonscription scolaire'), codeZone: p.codeZone || '', numZone: p.numZone || '', arrondissement: '', codeCs: p.codeCs || u.codeCs || '' });
    return p;
  };
  const brut = (p) => { const o = { ...p }; for (const k of ['anc', 'ancTxt', 'lettreGrade', 'ageRetraite', 'retraite', 'retraiteTxt', 'reference', 'retraiteAtteinte', 'alerteRetraite', 'restant', 'restantTxt', 'retraiteRaison', 'manquants', 'incomplet', 'zoneLib', 'naissTxt', 'ancGen', 'ancEcole', 'dossier', 'zoneSource', 'rubriques', 'rubLib']) delete o[k]; return o; };
  const sel = () => { const s = t && t.selected; if (!s) toast('Touchez d\'abord une ligne du tableau.', 'warn'); return s; };
  async function ajouter() {
    const v = await formDialog({ title: 'Ajouter un agent', fields: FIELDS(), values: { fonction: 'Adjoint(e)', statut: 'ACDPE' }, wide: true, validate: valider }); if (!v) return;
    const p = lier({ id: uid(), created: nowISO(), ...v }); await db.put('personnel', p); await addLog(u, { action: 'Ajout agent', target: `${p.nom} ${p.prenoms || ''}` }); toast('Agent ajouté.'); draw();
  }
  async function modifier() {
    const s = sel(); if (!s) return; const rec = brut(s);
    const v = await formDialog({ title: `Modifier — ${s.nom} ${s.prenoms || ''}`, fields: FIELDS(), values: rec, wide: true, validate: valider }); if (!v) return;
    const p = { ...rec, ...v, updated: nowISO() }; if (v.schoolId !== rec.schoolId && !v.schoolId) p.ecole = ''; await db.put('personnel', lier(p)); toast('Agent modifié.'); draw();
  }
  async function supprimer() {
    const s = sel(); if (!s || !(await confirmBox(`Supprimer « ${s.nom} ${s.prenoms || ''} » (${s.ecole || ''}) ?`, 'Supprimer', true))) return;
    await db.del('personnel', s.id); await addLog(u, { action: 'Suppression agent', target: `${s.nom} ${s.prenoms || ''}` }); t.clearSel(); toast('Agent supprimé.'); draw();
  }
  function ficheCarriere() {
    const s = sel(); if (!s) return;
    const L = (l, v) => v ? h('tr', h('th', l), h('td', v)) : null;
    modal({ title: `Fiche de carrière — ${s.nom} ${s.prenoms || ''}`, wide: true, body: h('div',
      s.incomplet ? h('p', { class: 'notes' }, h('b', 'Dossier incomplet — manque : '), s.manquants.join(', ')) : null,
      h('table', { class: 't fiche-carriere' }, h('tbody',
        L('Fonction', s.fonction), L('École / poste', s.ecole), L('Zone', s.zoneLib || s.arrondissement), L('Catégorie / grade', [s.statut, s.grade].filter(Boolean).join(' — ')), L('Corps', s.corps),
        L('Naissance', [fmtIso(s.date_naissance), s.lieu_naissance].filter(Boolean).join(' à ')), L('Matricule / NIP', [s.matricule, s.nip].filter(Boolean).join(' / ')),
        L('Départ à la retraite', s.retraiteTxt ? `${s.retraiteTxt} (${s.ageRetraite} ans, grade ${s.lettreGrade}) — ${s.retraiteAtteinte ? 'âge de départ atteint' : 'reste ' + s.restantTxt}` : 'non calculable : ' + s.retraiteRaison),
        ...ANCIENNETES.map(([cle, champ, lib]) => L(lib, s[champ] ? `${fmtDuree(s.anc[cle]) || '—'} (depuis le ${fmtIso(s[champ])})` : '')),
        h('tr', h('td', { colspan: 2, class: 'sub' }, `Anciennetés arrêtées au ${fmtJour(s.reference)}.`)),
        L('Diplôme académique', [s.diplome_academique, s.diplome_academique_annee].filter(Boolean).join(' — ')), L('CEAP', s.ceap ? `${s.ceap}${s.ceap_annee ? ' (' + s.ceap_annee + ')' : ''}` : ''), L('CAP', s.cap ? `${s.cap}${s.cap_annee ? ' (' + s.cap_annee + ')' : ''}` : ''),
        L("Visite d'aptitude", s.visite_aptitude ? `${s.visite_aptitude}${s.visite_aptitude_note ? ' — note ' + s.visite_aptitude_note + '/20' : ''}` : ''), L('Visites CP / CCS', s.visites_cp || s.visites_ccs ? `${s.visites_cp || 0} / ${s.visites_ccs || 0}` : ''),
        L("Participation à l'UP", s.participation_up ? s.participation_up + ' %' : ''), L("Note d'évaluation", s.note_evaluation ? s.note_evaluation + '/20' : ''), L('Téléphone', s.telephone), L('Observations', s.obs)))),
      actions: [{ label: '✏️ Modifier', onClick: () => setTimeout(modifier, 50) }, { label: 'Fermer', kind: 'primary' }] });
  }
  async function modeleEducMaster() {
    const C = [['matricule', 'Matricule'], ['npi', 'NPI'], ['nom', 'Nom'], ['prenoms', 'Prénoms'], ['sexe', 'Sexe'], ['dn', 'Date de naissance'], ['ln', 'Lieu de naissance'], ['statut', 'Statut'], ['qualite', 'Qualité'],
      ['corps', 'Corps'], ['emploi', 'Emploi'], ['grade', 'Grade'], ['ir', 'Indice réel'], ['ip', 'Indice payé'], ['fonction', 'Fonction'], ['code', 'Code établissement'], ['etab', 'Établissement'], ['cs', 'Circonscription scolaire'],
      ['ps', 'Date de première prise de service'], ['dep', "Date d'arrivée dans le département"], ['poste', "Date d'arrivée au poste"], ['dipl', 'Diplôme académique'], ['cap', "Date d'obtention du CAP"], ['tel', 'Téléphone']];
    const ex = { matricule: '123456', npi: '1234567890', nom: 'NOM (exemple à remplacer)', prenoms: 'Prénoms', sexe: 'M', dn: '12/04/1985', ln: 'Abomey', statut: 'FE', qualite: 'Instituteur', corps: 'Instituteurs', emploi: 'Enseignant',
      grade: 'B1-4', ir: '1234', ip: '1234', fonction: 'Adjoint', code: (schools[0] && schools[0].code) || 'EP001', etab: (schools[0] && schools[0].nom) || 'EPP …', cs: u.nomCs || '', ps: '01/10/2008', dep: '01/10/2012', poste: '01/10/2020', dipl: 'BAC', cap: '2011', tel: '01 97 00 00 00' };
    download(await listToXlsx({ title: "FICHE D'IMPORTATION DU PERSONNEL — FORMAT EDUCMASTER", subtitle: 'Une ligne par agent. Remplacez la ligne d’exemple ; les dates au format JJ/MM/AAAA. Statut : FE, ACDPE, ACDPCTD, ACE, Privé. Sexe : M ou F. Fonction : Directeur / directrice, Adjoint(e)…',
      columns: C.map(([k, l]) => ({ k, l, w: 120 })), rows: [ex], sheet: 'Personnel' }), 'Fiche_importation_personnel_EducMaster.xlsx');
  }
  async function importer() {
    const f = await pickFile('.xlsx,.csv,.txt'); if (!f) return;
    try {
      const sheets = /\.(csv|txt)$/i.test(f.name) ? [{ rows: parseCsv(await readAsText(f)) }] : await readXlsx(await readAsBuffer(f));
      const exist = await db.all('personnel'), trouver = indexEcoles(schools);
      let ajout = 0, maj = 0, sans = 0, horsCs = 0; const out = [];
      const nCs = (v) => norm(v).replace(/^(la )?cs /, '').trim();
      const csConnues = new Set([...schools.map(s => nCs(s.nomCs)), nCs(u.nomCs)].filter(Boolean));
      // la feuille propre à la circonscription (ex. « POBE ») passe en premier ; les autres ne font que compléter
      sheets.sort((a, b) => (csConnues.has(nCs(b.name)) ? 1 : 0) - (csConnues.has(nCs(a.name)) ? 1 : 0));
      for (const sh of sheets) {
        const rows = sh.rows, hi = rows.findIndex(r => r.some(c => norm(c) === 'nom')); if (hi < 0) continue;
        const head = rows[hi].map(norm), idx = Object.fromEntries(Object.entries(ALIAS_P).map(([k, al]) => [k, head.findIndex(x => al.includes(x))]));
        for (const r of rows.slice(hi + 1)) {
          const g = (k) => idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '';
          if (!g('nom')) continue;
          if (idx.cs >= 0 && csConnues.size && g('cs') && !csConnues.has(nCs(g('cs')))) { horsCs++; continue; }   // autre circonscription
          const sx = norm(g('sexe')), capAn = (lireDate(g('cap'), true) || '').slice(0, 4) || (/^\d{4}$/.test(g('cap')) ? g('cap') : '');
          const o = { nom: g('nom'), prenoms: g('prenoms'), sexe: sx.startsWith('f') ? 'F' : sx.startsWith('m') ? 'M' : '', fonction: ficheFonction(g('fonction')), corps: g('corps'), statut: ficheStatut(g('statut')),
            grade: /^[A-D]\d?-?\d*$/i.test(g('grade')) ? g('grade').toUpperCase() : '', matricule: g('matricule'), nip: g('nip'), telephone: g('telephone'),
            date_naissance: lireDate(g('date_naissance'), true), lieu_naissance: g('lieu_naissance'), date_prise_service: lireDate(g('date_prise_service')), date_service_dep: lireDate(g('date_service_dep')),
            date_service_ecole: lireDate(g('date_service_ecole')), cap: capAn ? 'oui' : '', cap_annee: capAn, indice_reel: nombre(g('indice_reel')), indice_paye: nombre(g('indice_paye')),
            note_evaluation: nombre(g('note_evaluation')), diplome_academique: g('diplome_academique') };
          const ec = g('ecole'), parCode = g('code_ecole') ? schools.find(x => norm(x.code) === norm(g('code_ecole'))) : null, s = parCode || (ec ? trouver(ec) : null);
          if (ec && !s && !/^(la )?cs |circonscription/i.test(ec)) sans++;
          const old = exist.find(p => norm(p.nom) === norm(o.nom) && norm(p.prenoms) === norm(o.prenoms));
          const p = lier({ ...(old || { id: uid(), created: nowISO() }), ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '')), schoolId: s ? s.id : (old ? old.schoolId : ''), ecole: s ? s.nom : (/^(la )?cs /i.test(ec) ? (old?.ecole || 'Circonscription scolaire de ' + (u.nomCs || ec.replace(/^(la )?cs /i, ''))) : (ec || old?.ecole || '')) });
          if (!inScope(u, p) && u.role !== 'ADMIN' && !(u.role === 'CCS' && p.codeCs === u.codeCs)) continue;
          const deja = out.find(x => x.id === (old && old.id));
          if (deja) { for (const [k, v] of Object.entries(o)) if (v !== '' && (deja[k] === undefined || deja[k] === '')) deja[k] = v; continue; }   // doublon d'une autre feuille : complète seulement
          old ? maj++ : ajout++; out.push(p); exist.push(p);
        }
      }
      await db.putMany('personnel', out); await addLog(u, { action: 'Import personnel', target: f.name, comment: `${ajout} ajout(s), ${maj} mise(s) à jour` });
      toast(`${ajout} agent(s) ajouté(s), ${maj} mis à jour${sans ? ` — ${sans} poste(s) sans école reconnue` : ''}${horsCs ? ` — ${horsCs} ligne(s) d'autres circonscriptions ignorée(s)` : ''}.`, 'ok', 7000); draw();
    } catch (e) { toast('Import impossible : ' + e.message, 'err'); }
  }
  const titre = () => `PERSONNEL ENSEIGNANT — ${onglet === 'tout' ? (mode === 'arr' ? 'TOUS LES ARRONDISSEMENTS' : 'TOUTES LES ZONES') : libG(onglet).toUpperCase()}`;
  const COLS_X = [...COLS.filter(c => c.k !== 'dossier'), { k: 'nip', l: 'NIP' }, { k: 'lieu_naissance', l: 'Lieu de naissance' }, { k: 'indice_paye', l: 'Indice payé' }, { k: 'indice_reel', l: 'Indice réel' },
    { k: 'psTxt', l: '1re prise de service' }, { k: 'depTxt', l: 'PS département' }, { k: 'ecoleTxt', l: 'PS école' }, { k: 'ancDep', l: 'Anc. département' }, { k: 'diplome_academique', l: 'Diplôme académique' },
    { k: 'cap_annee', l: 'CAP (année)' }, { k: 'ceap_annee', l: 'CEAP (année)' }, { k: 'note_evaluation', l: 'Note' }, { k: 'manque', l: 'Pièces manquantes' }];
  const pourExport = (rows) => rows.map(p => ({ ...p, psTxt: fmtIso(p.date_prise_service), depTxt: fmtIso(p.date_service_dep), ecoleTxt: fmtIso(p.date_service_ecole), ancDep: p.ancTxt.departement, manque: p.manquants.join(', ') }));
  function actionsListe() {
    ctx.actions([
      { label: '➕ Ajouter', kind: 'primary', onClick: ajouter }, { label: '✍️ Saisie par école (tableau)', onClick: async () => { await db.setting('saisie-onglet', 'personnel'); ctx.go('saisie'); } }, { label: '✏️ Modifier', onClick: modifier }, { label: '🗑 Supprimer', onClick: supprimer }, { label: '📇 Fiche de carrière', onClick: ficheCarriere },
      { label: '📍 Attribuer une zone', title: 'Agents sans zone (Personnel de la CS) : choisir leur zone', onClick: attribuerZone, show: u.role !== 'CP' },
      { label: '⬆ Importer Excel', title: 'Fichier du personnel (cahier de contrôle DDEMP, fichiers FE / ACDPE, ou fiche au format EducMaster) : complète matricules, dates, téléphones…', onClick: importer },
      { label: '📄 Fiche d’importation (EducMaster)', title: 'Modèle Excel à remplir ou à coller depuis EducMaster, puis à importer', onClick: modeleEducMaster },
      { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: titre(), subtitle: sousTitre(), columns: COLS_X, rows: pourExport(t.visible), sheet: 'Personnel' }), 'Personnel.xlsx') },
      { label: '⬇ PDF', onClick: async () => download(pdfBlob(await listToPdf({ title: titre(), subtitle: sousTitre(), columns: COLS.filter(c => !['corps', 'dossier', 'telephone', 'arrondissement'].includes(c.k)).map(c => ({ ...c, render: undefined })), rows: t.visible })), 'Personnel.pdf') }]);
  }
  await draw();
}

/* ================= PLANIFICATION ANNUELLE (EM et EP) ================= */
const NIVEAUX_PLAN = [['em_petits', 'Maternelle — section des petits'], ['em_grands', 'Maternelle — section des grands'], ['CI', 'CI'], ['CP', 'CP'], ['CE1', 'CE1'], ['CE2', 'CE2'], ['CM1', 'CM1'], ['CM2', 'CM2']];
const COLS_EM = [['trimestre', 'Trimestre', ''], ['mois', 'Mois', ''], ['d1', 'D1 — Éducation pour la santé, vie pratique', 'Domaines d\'activités'], ['d2', 'D2 — Éducation du mouvement (expression corporelle)', 'Domaines d\'activités'],
  ['d3', 'D3 — Éveil : observation, pré-lecture, pré-écriture, pré-mathématique', 'Domaines d\'activités'], ['d4', 'D4 — Expression plastique, activités manuelles, expression émotionnelle', 'Domaines d\'activités'],
  ['d5', 'D5 — Communication : langage, conte, poésie, chant, comptine', 'Domaines d\'activités'], ['observations', 'Observations', '']];
async function planif(ctx) {
  const O = await officiel(), P = O.planif;
  ctx.title('Planification annuelle', 'Maternelle (petits, grands) et primaire (CI → CM2) — modifiable, PDF et Excel');
  let niv = (await db.setting('planif-onglet')) || 'em_petits', lignes = [], modifie = false;
  const tabs = h('div', { class: 'tabs no-print' }), holder = h('div'); ctx.el.append(tabs, holder);
  const em = () => niv.startsWith('em_');
  const cols = () => em() ? COLS_EM : P.colonnes;
  const defaut = () => em() ? P.mois.map(([t, m]) => ({ trimestre: t, mois: m, d1: '', d2: '', d3: '', d4: '', d5: '', observations: '' })) : JSON.parse(JSON.stringify(P.officielle[niv] || []));
  async function draw() {
    tabs.replaceChildren(...NIVEAUX_PLAN.map(([k, l]) => h('button', { class: 'tab' + (k === niv ? ' on' : ''), onclick: async () => { if (modifie && !(await confirmBox('Quitter sans enregistrer les modifications ?', 'Quitter'))) return; niv = k; db.setting('planif-onglet', k); draw(); } }, k.startsWith('em_') ? l.replace('Maternelle — section des ', 'EM ') : l)));
    const perso = await db.setting('planif:' + niv); lignes = perso || defaut(); modifie = false;
    const C = cols(), groupes = [...new Set(C.map(c => c[2]).filter(Boolean))];
    const head = groupes.length ? [h('tr', C.filter(c => !c[2]).length ? null : null, ...(() => { const out = []; let i = 0; while (i < C.length) { const g = C[i][2]; if (!g) { out.push(h('th', { rowspan: 2 }, C[i][1])); i++; } else { let n = 0; while (i + n < C.length && C[i + n][2] === g) n++; out.push(h('th', { colspan: n }, g)); i += n; } } return out; })()), h('tr', C.filter(c => c[2]).map(c => h('th', c[1])))]
      : [h('tr', C.map(c => h('th', c[1])))];
    const cell = (l, k) => h('td', h('textarea', { class: 'edt-cell', 'aria-label': `${l.mois} — ${k}`, oninput: (e) => { l[k] = e.target.value; modifie = true; ajuster(e.target); } }, l[k] || ''));
    rc(holder, 
      h('p', { class: 'notes' }, em() ? 'Maternelle : grille par domaines d\'activités (D1 à D5, comme l\'emploi du temps officiel de la maternelle) à compléter mois par mois.' : P.source,
        perso ? h('span', { class: 'badge Transmise', style: { marginLeft: '8px' } }, 'version modifiée sur cet appareil') : h('span', { class: 'badge Validée', style: { marginLeft: '8px' } }, em() ? 'grille vierge' : 'version de référence')),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 't edt planif' }, h('thead', head), h('tbody', lignes.map(l => h('tr', C.map(([k]) => k === 'trimestre' || k === 'mois' ? h('td', { class: 'edt-h' }, h('b', k === 'trimestre' ? 'T' + l[k] : l[k])) : cell(l, k))))))));
    requestAnimationFrame(() => holder.querySelectorAll('.edt-cell').forEach(ajuster));
    ctx.status(`${NIVEAUX_PLAN.find(x => x[0] === niv)[1]} — ${lignes.length} mois`);
  }
  await draw();
  const titreP = () => `PLANIFICATION ANNUELLE — ${NIVEAUX_PLAN.find(x => x[0] === niv)[1].toUpperCase()}`;
  const colsExport = () => cols().map(([k, l, g]) => ({ k, l: g && !em() ? `${g} — ${l}` : l, w: k === 'trimestre' ? 40 : k === 'mois' ? 60 : 90 }));
  ctx.actions([
    { label: '💾 Enregistrer', kind: 'primary', onClick: async () => { await db.setting('planif:' + niv, lignes); modifie = false; toast('Planification enregistrée.'); draw(); } },
    { label: '↺ Rétablir', title: 'Version de référence (primaire) ou grille vierge (maternelle)', onClick: async () => { if (!(await confirmBox('Revenir à la version de départ ? Vos modifications de ce niveau seront perdues.', 'Rétablir', true))) return; await db.setting('planif:' + niv, null); draw(); } },
    { label: '⬇ PDF', onClick: async () => download(pdfBlob(await listToPdf({ title: titreP(), subtitle: em() ? 'Domaines d\'activités de la maternelle' : P.source, columns: colsExport(), rows: lignes.map(l => ({ ...l, trimestre: 'T' + l.trimestre })) })), `Planification_${niv}.pdf`) },
    { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: titreP(), subtitle: em() ? 'Domaines d\'activités de la maternelle' : P.source, columns: colsExport().map(c => ({ ...c, xw: c.k === 'mois' || c.k === 'trimestre' ? 12 : 26 })), rows: lignes, sheet: niv }), `Planification_${niv}.xlsx`) },
    { label: '🖨 Imprimer', onClick: () => window.print() }]);
}

/* ================= ESPACE DU CP DE ZONE ================= */
async function espace(ctx) {
  const u = ctx.user, zonesRef = (await db.all('ref')).filter(r => r.type === 'zone' && (!u.codeCs || r.cs === u.codeCs)).sort((a, b) => (+a.numero || 0) - (+b.numero || 0));
  let zone = u.role === 'CP' ? u.codeZone : ((await db.setting('espace-zone')) || zonesRef[0]?.code || '');
  const z = () => zonesRef.find(x => x.code === zone), nomZone = () => z() ? (z().nom || 'Zone ' + z().numero) : (zone ? 'Zone ' + zone.split('-ZP').pop() : '—');
  const holder = h('div'); ctx.el.append(holder);
  async function draw() {
    ctx.title(`Espace CP — ${nomZone()}`, u.role === 'CP' ? `Compte ${u.username}${u.nomCs ? ' · CS ' + u.nomCs : ''}` : 'Espaces de travail des conseillers pédagogiques');
    const dansZone = (r) => r.codeZone === zone;
    const [schools, perso, fiches, acts, bilans] = await Promise.all([db.all('schools').then(l => l.filter(s => s.rubrique !== 'ne_fonctionne_plus')), personnelDuPerimetre(u), db.all('fiches'), db.all('activities'), db.all('bilans')]);
    const ec = schools.filter(dansZone), pe = perso.filter(dansZone), fi = fiches.filter(dansZone), ac = acts.filter(dansZone), bi = bilans.filter(b => b.codeZone === zone);
    const cps = (await db.all('users')).filter(x => x.role === 'CP' && x.codeZone === zone);
    const n = (a, f) => a.filter(f).length, auj = today();
    const st = (v, l, cls = '', go) => h('div', { class: 'stat ' + cls, style: { cursor: go ? 'pointer' : null }, onclick: go ? () => ctx.go(go) : null }, h('b', String(v)), h('span', l));
    const proch = ac.filter(a => a.date >= auj && a.statut !== 'Réalisée').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    const ret = pe.filter(p => p.alerteRetraite).sort((a, b) => a.retraite - b.retraite);
    const lien = (r, l) => h('button', { class: 'btn', onclick: () => ctx.go(r) }, l);
    rc(holder, 
      u.role !== 'CP' ? h('div', { class: 'tabs no-print' }, zonesRef.map(x => h('button', { class: 'tab' + (x.code === zone ? ' on' : ''), onclick: () => { zone = x.code; db.setting('espace-zone', zone); draw(); } }, `${x.nom || 'Zone ' + x.numero} (${schools.filter(s => s.codeZone === x.code).length})`))) : null,
      !zonesRef.length ? h('div', { class: 'card' }, h('p', 'Aucune zone pédagogique : créez-les dans Référentiel national → Zones pédagogiques.')) : null,
      h('div', { class: 'card espace-tete' }, h('h3', `🧑‍🏫 ${nomZone()}`), h('p', cps.length ? 'Conseiller(s) pédagogique(s) : ' + cps.map(c => `${c.prenoms || ''} ${c.nom || ''} (${c.username})`.trim()).join(', ') : 'Aucun compte CP rattaché à cette zone.'),
        !ec.length ? h('p', { class: 'notes' }, "Aucune école n'est encore rattachée à cette zone. Le CCS l'indique dans Écoles → « Affecter une zone » (ou Modifier → N° zone pédagogique) : l'école et son personnel arrivent alors ici.") : null),
      h('h2', { class: 'sec-h' }, 'Mes écoles et mon personnel'),
      h('div', { class: 'cards' }, st(ec.length, `écoles (${n(ec, s => s.cycle === 'Maternelle')} EM · ${n(ec, s => s.cycle !== 'Maternelle')} EP)`, '', 'ecoles'), st(n(ec, s => (s.secteur || '').startsWith('Priv')), 'écoles privées', '', 'ecoles'),
        st(pe.length, `agents dont ${n(pe, p => p.sexe === 'F')} femmes`, '', 'personnel'), st(n(pe, p => /^Directeur/.test(p.fonction)), 'directeurs / directrices', '', 'personnel'),
        st(ret.length, 'départs à la retraite dans les 2 ans', ret.length ? 'y' : '', 'personnel'), st(n(pe, p => p.incomplet), 'dossiers du personnel incomplets', n(pe, p => p.incomplet) ? 'y' : '', 'personnel')),
      h('h2', { class: 'sec-h' }, 'Mes fiches, activités et bilans'),
      h('div', { class: 'cards' }, st(fi.length, 'fiches de collecte', '', 'fiches'), st(n(fi, f => f.statut === 'Brouillon' || f.statut === 'À corriger'), 'à compléter / corriger', 'y', 'fiches'), st(n(fi, f => f.statut === 'Transmise'), 'transmises au CCS', '', 'fiches'), st(n(fi, f => f.statut === 'Validée'), 'validées', '', 'fiches'),
        st(n(ac, a => a.statut === 'Réalisée'), 'activités réalisées', '', 'activites'), st(proch.length, 'activités à venir', '', 'activites'), st(bi.length, 'bilans trimestriels / annuels', '', 'bilans')),
      h('div', { class: 'card' }, h('h3', '📅 Mes prochaines activités'), proch.length ? h('ul', proch.map(a => h('li', `${fmtDate(a.date)} — ${a.type}${a.theme ? ' : ' + a.theme : ''}${a.lieu ? ' (' + a.lieu + ')' : ''}`))) : h('p', { class: 'sub' }, 'Aucune activité programmée.')),
      ret.length ? h('div', { class: 'card' }, h('h3', '🎓 Départs à la retraite proches'), h('ul', ret.slice(0, 8).map(p => h('li', `${p.nom} ${p.prenoms || ''} — ${p.ecole} — ${p.retraiteAtteinte ? 'âge atteint (' + p.retraiteTxt + ')' : p.retraiteTxt}`)))) : null,
      ec.length ? ecolesDeLaZone(ec, pe) : null,
      h('h2', { class: 'sec-h' }, 'Mes outils'),
      h('div', { class: 'espace-liens' }, lien('ecoles', '🏫 Écoles'), lien('personnel', '👩‍🏫 Personnel'), lien('fiches', '📝 Fiches de collecte'), lien('activites', '📅 Activités'), lien('planningcp', '🗓️ Planification des activités'), lien('bilans', '📈 Bilans'),
        lien('themes', '🎯 Thèmes UP'), lien('planif', '🗓️ Planification EM et EP'), lien('planification', '📚 Planification CI → CM2'), lien('emploi', '🕘 Emplois du temps'), lien('calendrier', '📆 Calendrier'), lien('reglement', '⚖️ Règlement'), lien('documents', '📄 Documents officiels')));
    ctx.status(`${nomZone()} — ${ec.length} école(s), ${pe.length} agent(s), ${fi.length} fiche(s)`);
    ctx.actions([{ label: '⬇ Écoles de la zone (PDF)', kind: 'primary', onClick: () => exporterEcoles('pdf', ec, pe) }, { label: '⬇ Écoles de la zone (Excel)', onClick: () => exporterEcoles('xlsx', ec, pe) },
      { label: '🖨 Imprimer', onClick: () => window.print() }]);
  }
  /* ---------- écoles de la zone : publiques à part, privées (laïques et confessionnelles) à part ---------- */
  const directeurDe = (s, pe) => pe.find(p => p.schoolId === s.id && /^Directeur/.test(p.fonction || ''));
  const ligneEcole = (s, pe, i) => {
    const d = directeurDe(s, pe), nomDir = s.directeur || (d ? `${(d.nom || '').toUpperCase()} ${d.prenoms || ''}`.trim() : '');
    return { n: i + 1, id: s.id, nom: s.nom, cycle: s.cycle === 'Maternelle' ? 'EM' : 'EP', arrondissement: s.arrondissement || '', village: s.localite || '', directeur: nomDir, contact: s.contact || (d && d.telephone) || '', secteur: s.secteur || '' };
  };
  const groupesEcoles = (ec, pe) => {
    const tri = (a, b) => (a.cycle === 'Maternelle') - (b.cycle === 'Maternelle') || (a.arrondissement || '').localeCompare(b.arrondissement || '', 'fr') || a.nom.localeCompare(b.nom, 'fr');
    const pub = ec.filter(x => !(x.secteur || '').startsWith('Priv')).sort(tri), pri = ec.filter(x => (x.secteur || '').startsWith('Priv')).sort(tri);
    return [['Écoles publiques', pub.map((x, i) => ligneEcole(x, pe, i))], ['Écoles privées (tout secteur : laïc et confessionnel)', pri.map((x, i) => ligneEcole(x, pe, i))]];
  };
  const COLS_EZ = [['n', 'N° d’ordre', 34], ['nom', 'Nom de l’école', 170], ['arrondissement', 'Arrondissement', 85], ['village', 'Ville / village', 95], ['directeur', 'Nom et prénoms du directeur', 160], ['contact', 'Contact', 80]];
  async function modifierEcole(id) {
    const rec = await db.get('schools', id); if (!rec) return;
    const v = await formDialog({ title: `Renseignements — ${rec.nom}`, fields: [{ k: 'directeur', l: 'Nom et prénoms du directeur / de la directrice', t: 'text', w: 'c12' }, { k: 'contact', l: 'Contact (téléphone)', t: 'text', w: 'half' },
      { k: 'localite', l: 'Ville / village (quartier)', t: 'text', list: 'dl-localite', w: 'half' }, { k: 'arrondissement', l: 'Arrondissement', t: 'text', list: 'dl-arrondissement', w: 'half' }], values: rec });
    if (!v) return; await db.put('schools', { ...rec, ...v, updated: nowISO() }); await addLog(u, { action: 'Renseignements école', target: rec.nom }); toast('École mise à jour.'); draw();
  }
  function ecolesDeLaZone(ec, pe) {
    const G = groupesEcoles(ec, pe), peutModifier = u.role !== 'DDEMP';
    const table = ([titre, L]) => h('div', { class: 'card' }, h('h3', { class: 'fixe' }, `${titre} — ${L.length} école(s) (${L.filter(x => x.cycle === 'EP').length} EP · ${L.filter(x => x.cycle === 'EM').length} EM)`),
      L.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 't fixe1 ez' }, h('thead', h('tr', ...COLS_EZ.map(([, l]) => h('th', l)), peutModifier ? h('th', { class: 'no-print' }, '') : null)),
        h('tbody', L.map(r => h('tr', ...COLS_EZ.map(([k]) => h('td', { class: k === 'n' ? 'num' : '' }, k === 'nom' ? [r.nom, ' ', h('small', { class: 'sub' }, r.cycle)] : (r[k] || (['village', 'directeur', 'contact'].includes(k) ? h('span', { class: 'badge Brouillon' }, 'à renseigner') : '')))),
          peutModifier ? h('td', { class: 'no-print' }, h('button', { class: 'btn sm', title: 'Renseigner directeur, contact, village', onclick: () => modifierEcole(r.id) }, '✏️')) : null))))) : h('p', { class: 'sub' }, 'Aucune école.'));
    return h('div', h('h2', { class: 'sec-h' }, `🏫 Écoles de la zone (${ec.length})`), ...G.map(table),
      h('p', { class: 'notes' }, `Total de la zone : ${ec.length} école(s) — ${G[0][1].length} publique(s), ${G[1][1].length} privée(s). Les écoles « ne fonctionnant plus » ne sont pas comptées. Le directeur et le contact viennent de la fiche de l'école, à défaut de la liste du personnel.`));
  }
  async function exporterEcoles(fmt, ec, pe) {
    const G = groupesEcoles(ec, pe), titre = `ÉCOLES DE LA ${nomZone().toUpperCase()}`, sous = [u.nomCs ? 'Circonscription scolaire de ' + u.nomCs : '', `${ec.length} école(s) : ${G[0][1].length} publique(s), ${G[1][1].length} privée(s)`].filter(Boolean).join(' — ');
    if (fmt === 'xlsx') {
      const wb = new XlsxBook(), ws = wb.sheet('Écoles de la zone'); let r = ws.banner(await bannerBytes(), 820);
      ws.set(r, 0, titre, 'title'); r++; ws.set(r, 0, sous, 'note'); r += 2;
      COLS_EZ.forEach(([, l, w], i) => ws.width(i, Math.max(8, Math.round(w / 5))));
      for (const [tt, L] of G) {
        ws.set(r, 0, `${tt} (${L.length})`, 'section'); ws.merge(r, 0, r, COLS_EZ.length - 1); r++;
        COLS_EZ.forEach(([, l], i) => ws.set(r, i, l, 'th')); ws.height(r, 30); r++;
        L.forEach(x => { COLS_EZ.forEach(([k], i) => ws.set(r, i, k === 'n' ? x.n : (k === 'nom' ? `${x.nom} (${x.cycle})` : x[k] || ''), k === 'n' ? 'tdc' : 'td')); r++; });
        ws.set(r, 0, `Sous-total : ${L.length} école(s)`, 'total'); ws.merge(r, 0, r, COLS_EZ.length - 1); r += 2;
      }
      ws.set(r, 0, `TOTAL DE LA ZONE : ${ec.length} école(s)`, 'total'); ws.merge(r, 0, r, COLS_EZ.length - 1);
      download(await wb.toBlob(), clean('Ecoles_' + nomZone()).normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '.xlsx');
    } else {
      const pdf = await newPdf({ title: titre, footer: titre, orientation: 'landscape' });
      pdf.titleBox([titre, sous], { size: 11 });
      for (const [tt, L] of G) {
        pdf.space(6); pdf.heading(`${tt} — ${L.length} école(s)`);
        if (L.length) pdf.table({ widths: COLS_EZ.map(c => c[2]), head: COLS_EZ.map(([, l], i) => ({ t: l, c: i, r: 0 })), rows: L.map(x => COLS_EZ.map(([k]) => k === 'n' ? String(x.n) : k === 'nom' ? `${x.nom} (${x.cycle})` : x[k] || '')), size: 8, align: COLS_EZ.map(([k]) => k === 'n' ? 'center' : 'left') });
      }
      pdf.space(8); pdf.text(`Total de la zone : ${ec.length} école(s) — ${G[0][1].length} publique(s), ${G[1][1].length} privée(s).`, { bold: true });
      download(pdfBlob(await pdf.finish()), clean('Ecoles_' + nomZone()).normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '.pdf');
    }
  }
  await draw();
}

/* ================= TABLEAU SYNOPTIQUE DU CP (présenté comme celui des directeurs dans SCOLARIS) ================= */
const RUB_ID = [['memp', 'Nom du MEMP (ministère)'], ['ddemp', 'Direction départementale (DDEMP)'], ['cs', 'Circonscription scolaire'], ['ccs', 'Nom du Chef de circonscription (CCS)'],
  ['zone', 'Zone pédagogique n°'], ['cp_nom', 'Nom et prénoms du CP'], ['cp_grade', 'Grade du CP'], ['cp_matricule', 'Matricule / NIP du CP'], ['cp_diplome', 'Diplôme professionnel (CAPCP, CAPIEMP…)'],
  ['cp_ps', 'Date de première prise de service'], ['cp_ps_zone', 'Date de prise de service dans la zone'], ['cp_contact', 'Contact (téléphone)'], ['cp_email', 'E-mail'],
  ['arrondissements', 'Arrondissements couverts'], ['communes', 'Commune(s)'], ['siege', 'Siège / bureau du CP'], ['obs', 'Observations']];
const COLS_UP = [['up', 'Unité pédagogique'], ['siege', 'École siège'], ['rup', 'Nom du RUP'], ['rup_tel', 'Contact RUP'], ['corup', 'Nom du Co-RUP'], ['corup_tel', 'Contact Co-RUP'], ['ecoles', 'Écoles membres'], ['jour', 'Jour / périodicité des séances']];
async function synocp(ctx) {
  const u = ctx.user, zonesRef = (await db.all('ref')).filter(r => r.type === 'zone' && (!u.codeCs || r.cs === u.codeCs)).sort((a, b) => (+a.numero || 0) - (+b.numero || 0));
  let zone = u.role === 'CP' ? u.codeZone : ((await db.setting('espace-zone')) || zonesRef[0]?.code || '');
  let onglet = (await db.setting('synocp-onglet')) || 'identite';
  const z = () => zonesRef.find(x => x.code === zone), nomZone = () => z() ? (z().nom || 'Zone ' + z().numero) : (zone ? 'Zone ' + zone.split('-ZP').pop() : '—');
  const peut = u.role !== 'CP' || u.codeZone === zone;
  const zbar = h('div', { class: 'tabs no-print' }), tabs = h('div', { class: 'tabs no-print' }), holder = h('div'); ctx.el.append(zbar, tabs, holder);
  const ONG = [['identite', '🪪 Identité'], ['ecoles', '🏫 Écoles et directeurs'], ['up', '👥 Unités pédagogiques'], ['personnel', '👩‍🏫 Personnel'], ['textes', '📘 EDT, planification, règlement']];
  let data = {}, ups = [], ecoles = [], perso = [];
  async function charger() {
    const idn = (await db.setting('cpIdentity')) || {};
    const ccs = (await db.all('users')).find(x => x.role === 'CCS' && x.codeCs === (u.codeCs || z()?.cs));
    const cpU = (await db.all('users')).find(x => x.role === 'CP' && x.codeZone === zone);
    ecoles = (await db.all('schools')).filter(s => s.codeZone === zone && s.rubrique !== 'ne_fonctionne_plus').sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    perso = (await personnelDuPerimetre(u)).filter(p => p.codeZone === zone);
    const moi = u.role === 'CP' ? idn : {};
    const defaut = { memp: 'Ministère des Enseignements Maternel et Primaire', ddemp: (u.departement || cpU?.departement) ? 'DDEMP ' + (u.departement || cpU.departement) : '', cs: u.nomCs || cpU?.nomCs || '', ccs: ccs ? `${ccs.nom || ''} ${ccs.prenoms || ''}`.trim() : '',
      zone: z() ? String(z().numero) : '', cp_nom: moi.nom ? `${moi.nom} ${moi.prenoms || ''}`.trim() : '', cp_contact: moi.telephone || '', cp_email: moi.email || '', cp_matricule: moi.codeCp || '',
      arrondissements: [...new Set(ecoles.map(s => s.arrondissement).filter(Boolean))].join(', '), communes: [...new Set(ecoles.map(s => s.commune).filter(Boolean))].join(', ') };
    const enr = (await db.setting('synocp:' + zone)) || {};
    data = { ...defaut, ...Object.fromEntries(Object.entries(enr).filter(([, v]) => v !== '' && v != null)) };
    ups = (await db.setting('synocp-up:' + zone)) || [...new Set(ecoles.map(s => s.up).filter(Boolean))].map(n => ({ up: n }));
  }
  const sauver = async () => { await db.setting('synocp:' + zone, data); await db.setting('synocp-up:' + zone, ups); };
  async function draw() {
    ctx.title(`Tableau synoptique du CP — ${nomZone()}`, data.cs ? `Circonscription scolaire de ${data.cs}` : 'Renseignements de la zone pédagogique');
    zbar.replaceChildren(...(u.role === 'CP' ? [] : zonesRef.map(x => h('button', { class: 'tab' + (x.code === zone ? ' on' : ''), onclick: async () => { zone = x.code; db.setting('espace-zone', zone); await charger(); draw(); } }, x.nom || 'Zone ' + x.numero))));
    tabs.replaceChildren(...ONG.map(([k, l]) => h('button', { class: 'tab' + (k === onglet ? ' on' : ''), onclick: () => { onglet = k; db.setting('synocp-onglet', k); draw(); } }, l)));
    const fNb = (a, f) => a.filter(f).length;
    if (onglet === 'identite') {
      rc(holder, h('div', { class: 'card' }, h('h3', 'Identité de la zone pédagogique et du CP'),
        h('div', { class: 'grid12' }, RUB_ID.map(([k, l]) => fieldEl({ k, l, t: k === 'obs' ? 'textarea' : (k === 'cp_ps' || k === 'cp_ps_zone') ? 'date' : 'text', w: k === 'obs' ? null : 'half', ro: !peut }, data[k], (kk, v) => { data[kk] = v; })))),
        h('div', { class: 'cards' }, h('div', { class: 'stat' }, h('b', String(ecoles.length)), h('span', `écoles (${fNb(ecoles, s => s.cycle === 'Maternelle')} EM · ${fNb(ecoles, s => s.cycle !== 'Maternelle')} EP)`)),
          h('div', { class: 'stat' }, h('b', String(fNb(ecoles, s => (s.secteur || '').startsWith('Priv')))), h('span', 'écoles privées')), h('div', { class: 'stat' }, h('b', String(ups.length)), h('span', 'unités pédagogiques')),
          h('div', { class: 'stat' }, h('b', String(perso.length)), h('span', `agents dont ${fNb(perso, p => p.sexe === 'F')} femmes`)), h('div', { class: 'stat' }, h('b', String(fNb(perso, p => /^Directeur/.test(p.fonction)))), h('span', 'directeurs / directrices')),
          h('div', { class: 'stat y' }, h('b', String(fNb(perso, p => p.alerteRetraite))), h('span', 'départs à la retraite ≤ 2 ans'))));
    } else if (onglet === 'ecoles') {
      const rows = ecoles.map(s => { const pe = perso.filter(p => p.schoolId === s.id); return { ...s, nbPerso: pe.length, nbF: fNb(pe, p => p.sexe === 'F'), dir: s.directeur || (pe.find(p => /^Directeur/.test(p.fonction)) ? `${pe.find(p => /^Directeur/.test(p.fonction)).nom} ${pe.find(p => /^Directeur/.test(p.fonction)).prenoms || ''}` : '') }; });
      const t = dataTable({ columns: COLS_EC, rows, pageSize: 200, empty: "Aucune école rattachée à cette zone (Écoles → « Affecter une zone »)." }); rc(holder, t.el);
    } else if (onglet === 'up') {
      const ligne = (x, i) => h('tr', COLS_UP.map(([k]) => h('td', h('textarea', { class: 'edt-cell', readOnly: !peut, oninput: (e) => { x[k] = e.target.value; ajuster(e.target); } }, x[k] || ''))),
        peut ? h('td', { class: 'no-print' }, h('button', { class: 'btn sm', 'aria-label': 'Supprimer la ligne', onclick: () => { ups.splice(i, 1); draw(); } }, '✕')) : null);
      rc(holder, h('div', { class: 'tbl-wrap' }, h('table', { class: 't edt' }, h('thead', h('tr', COLS_UP.map(([, l]) => h('th', l)), peut ? h('th', { class: 'no-print' }, '') : null)), h('tbody', ups.map(ligne)))),
        peut ? h('button', { class: 'btn no-print', style: { marginTop: '8px' }, onclick: () => { ups.push({}); draw(); } }, '➕ Ajouter une UP') : null,
        h('p', { class: 'notes' }, 'RUP : responsable d\'unité pédagogique ; Co-RUP : son adjoint. Indiquez dans « Écoles membres » les écoles rattachées à chaque UP.'));
      requestAnimationFrame(() => holder.querySelectorAll('.edt-cell').forEach(ajuster));
    } else if (onglet === 'personnel') {
      const t = dataTable({ columns: COLS_PS, rows: perso.map(lignePs).sort((a, b) => (a.ecole || '').localeCompare(b.ecole || '', 'fr') || (a.fonction || '').localeCompare(b.fonction || '', 'fr')), pageSize: 300, empty: 'Aucun agent dans cette zone.' }); rc(holder, t.el);
    } else {
      rc(holder, h('div', { class: 'doc-grille' }, [['emploi', '🕘 Emplois du temps officiels', 'Maternelle, CI-CP, CE1-CE2, CM1-CM2'], ['planif', '🗓️ Planification annuelle', 'Maternelle (petits, grands) et CI → CM2'], ['reglement', '⚖️ Règlement intérieur', 'Texte officiel révisé'], ['calendrier', '🗓️ Calendrier scolaire', '2026-2027'], ['documents', '📄 Documents officiels', 'Fiches, canevas et guides']]
        .map(([r, t, d]) => h('button', { class: 'card doc-lien', onclick: () => ctx.go(r) }, h('h3', t), h('p', d)))));
    }
    ctx.status(`${nomZone()} — ${ecoles.length} école(s), ${ups.length} UP, ${perso.length} agent(s)`);
  }
  const COLS_EC = [{ k: 'nom', l: 'École', w: 180 }, { k: 'cycle', l: 'Cycle' }, { k: 'secteur', l: 'Statut' }, { k: 'arrondissement', l: 'Arrondissement' }, { k: 'up', l: 'UP' }, { k: 'dir', l: 'Directeur / directrice', w: 170 }, { k: 'contact', l: 'Contact' }, { k: 'classesAutorisees', l: 'Classes autorisées', num: true }, { k: 'nbPerso', l: 'Personnel', num: true }, { k: 'nbF', l: 'dont F', num: true }];
  const COLS_PS = [{ k: 'matricule', l: 'Matricule' }, { k: 'nom_complet', l: 'Nom et prénoms', w: 170 }, { k: 'statut', l: 'Catégorie' }, { k: 'fonction', l: 'Fonction', w: 110 }, { k: 'grade', l: 'Grade' }, { k: 'ecole', l: 'École', w: 160 },
    { k: 'ancGen', l: 'Anc. gén.' }, { k: 'ancEcole', l: 'Anc. école' }, { k: 'ps', l: '1re prise de service' }, { k: 'retraiteTxt', l: 'Retraite' }, { k: 'dipl', l: 'Diplômes' }, { k: 'visites', l: 'Visites CP/CCS' }, { k: 'participation_up', l: 'UP %' }, { k: 'telephone', l: 'Contact' }];
  const lignePs = (p) => ({ ...p, nom_complet: `${p.nom} ${p.prenoms || ''}`.trim(), ancGen: p.ancTxt.generale, ancEcole: p.ancTxt.ecole, ps: fmtIso(p.date_prise_service),
    dipl: [p.diplome_academique, p.ceap === 'oui' ? 'CEAP' + (p.ceap_annee ? ' ' + p.ceap_annee : '') : '', p.cap === 'oui' ? 'CAP' + (p.cap_annee ? ' ' + p.cap_annee : '') : ''].filter(Boolean).join(' · '),
    visites: p.visites_cp || p.visites_ccs ? `${p.visites_cp || 0} / ${p.visites_ccs || 0}` : '' });
  async function pdfComplet() {
    const p = await newPdf({ title: 'Tableau synoptique du CP — ' + nomZone(), footer: 'Tableau synoptique du CP', orientation: 'landscape' });
    p.text('RÉPUBLIQUE DU BÉNIN — MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE', { bold: true, align: 'center', size: 9 }); p.space(2);
    p.titleBox([`TABLEAU SYNOPTIQUE DU CONSEILLER PÉDAGOGIQUE — ${nomZone().toUpperCase()}`, data.cs ? `Circonscription scolaire de ${data.cs}` : ''].filter(Boolean), { size: 12 });
    p.heading('1. Identité');
    const idRows = RUB_ID.filter(([k]) => data[k]).map(([k, l]) => [l, k === 'cp_ps' || k === 'cp_ps_zone' ? fmtIso(data[k]) : data[k]]);
    p.table({ widths: [230, p.cw - 230], head: [{ t: 'Rubrique', c: 0, s: 1, r: 0, rs: 1 }, { t: 'Renseignement', c: 1, s: 1, r: 0, rs: 1 }], headRows: 1, rows: idRows, size: 8 });
    p.heading(`2. Écoles et directeurs (${ecoles.length})`);
    const er = ecoles.map(s => { const pe = perso.filter(x => x.schoolId === s.id), d = pe.find(x => /^Directeur/.test(x.fonction)); return [s.nom, s.cycle, s.secteur || '', s.arrondissement || '', s.up || '', s.directeur || (d ? `${d.nom} ${d.prenoms || ''}` : ''), String(pe.length)]; });
    if (er.length) p.table({ widths: [170, 60, 80, 80, 80, 200, 50], head: ['École', 'Cycle', 'Statut', 'Arrondissement', 'UP', 'Directeur / directrice', 'Personnel'].map((t, c) => ({ t, c, s: 1, r: 0, rs: 1 })), headRows: 1, rows: er, size: 7.5 }); else p.text('Aucune école rattachée.', { size: 8 });
    p.heading(`3. Unités pédagogiques (${ups.length})`);
    if (ups.length) p.table({ widths: [80, 90, 95, 60, 95, 60, 150, 90], head: COLS_UP.map(([, t], c) => ({ t, c, s: 1, r: 0, rs: 1 })), headRows: 1, rows: ups.map(x => COLS_UP.map(([k]) => x[k] || '')), size: 7 }); else p.text('Aucune UP renseignée.', { size: 8 });
    p.heading(`4. Personnel enseignant (${perso.length})`);
    if (perso.length) p.table({ widths: [50, 120, 45, 70, 40, 110, 45, 45, 60, 55, 65, 40], head: ['Matricule', 'Nom et prénoms', 'Catég.', 'Fonction', 'Grade', 'École', 'Anc. gén.', 'Anc. école', '1re PS', 'Retraite', 'Diplômes', 'Contact'].map((t, c) => ({ t, c, s: 1, r: 0, rs: 1 })), headRows: 1,
      rows: perso.map(lignePs).map(x => [x.matricule || '', x.nom_complet, x.statut || '', x.fonction || '', x.grade || '', x.ecole || '', x.ancGen || '', x.ancEcole || '', x.ps || '', x.retraiteTxt || '', x.dipl || '', x.telephone || '']), size: 6.5 });
    const idn = await db.setting('cpIdentity');
    if (idn && u.role === 'CP') { const { makeCachet } = await import('./sign.js'); const { dataUrlToBytes } = await import('./util.js'); await p.authBlock({ role: idn.titre || 'Le Conseiller Pédagogique', nom: `${idn.prenoms || ''} ${idn.nom || ''}`.trim(), signature: idn.signature && dataUrlToBytes(idn.signature), cachet: dataUrlToBytes(await makeCachet(idn)), lines: [`Fait le ${fmtJour(new Date())}`] }); }
    download(pdfBlob(await p.finish()), `Tableau_synoptique_CP_${nomZone().replace(/\W+/g, '_')}.pdf`);
  }
  await charger(); await draw();
  ctx.actions([
    { label: '💾 Enregistrer', kind: 'primary', show: peut, onClick: async () => { await sauver(); toast('Tableau synoptique enregistré.'); } },
    { label: '⬇ PDF complet', onClick: pdfComplet },
    { label: '⬇ Excel (onglet)', onClick: async () => {
      if (onglet === 'ecoles') return download(await listToXlsx({ title: `ÉCOLES ET DIRECTEURS — ${nomZone().toUpperCase()}`, columns: COLS_EC, rows: ecoles.map(s => ({ ...s, dir: s.directeur })), sheet: 'Écoles' }), 'Synoptique_ecoles.xlsx');
      if (onglet === 'up') return download(await listToXlsx({ title: `UNITÉS PÉDAGOGIQUES — ${nomZone().toUpperCase()}`, columns: COLS_UP.map(([k, l]) => ({ k, l, xw: 24 })), rows: ups, sheet: 'UP' }), 'Synoptique_UP.xlsx');
      if (onglet === 'personnel') return download(await listToXlsx({ title: `PERSONNEL — ${nomZone().toUpperCase()}`, columns: COLS_PS, rows: perso.map(lignePs), sheet: 'Personnel' }), 'Synoptique_personnel.xlsx');
      return download(await listToXlsx({ title: `IDENTITÉ — ${nomZone().toUpperCase()}`, columns: [{ k: 'l', l: 'Rubrique', xw: 40 }, { k: 'v', l: 'Renseignement', xw: 60 }], rows: RUB_ID.map(([k, l]) => ({ l, v: data[k] || '' })), sheet: 'Identité' }), 'Synoptique_identite.xlsx');
    } },
    { label: '🖨 Imprimer', onClick: () => window.print() }]);
}
