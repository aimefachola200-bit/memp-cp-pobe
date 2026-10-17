/* République du Bénin — MEMP — Vues : emplois du temps officiels, calendrier scolaire, règlement intérieur, personnel
   Textes officiels repris de SCOLARIS (emplois du temps MEMP 2016, règlement intérieur révisé 2018, arrêté du calendrier 2026-2027).
   Conception : Maître Aimé FACHE */
import { h, uid, nowISO, toast, confirmBox, pickFile, readAsBuffer, readAsText, download, norm, fmtDate } from './util.js';
import { db } from './db.js';
import { dataTable, formDialog } from './ui.js';
import { scoped, inScope, addLog, cleGroupe, libGroupe, ordreGroupe, modeGroupeDefaut } from './data.js';
import { listToXlsx, listToPdf } from './export.js';
import { readXlsx, parseCsv } from './xlsx.js';
import { newPdf } from './pdf.js';

export async function render(id, ctx) { return ({ emploi, calendrier, reglement, personnel })[id](ctx); }

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
      holder.replaceChildren(
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
    holder.replaceChildren(h('div', { class: 'card' }, h('h3', `Année scolaire ${an}`), h('p', C.arrete), h('p', { class: 'sub' }, C.signe)),
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
    holder.replaceChildren(...vis.map(r => h('div', { class: 'reg-bloc reg-' + r.type + (r.id === sel ? ' sel' : ''), tabindex: 0, onclick: () => { sel = r.id; draw(); }, ondblclick: () => edit && modifier() },
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

/* ================= PERSONNEL ENSEIGNANT (par zone) ================= */
const FONCTIONS = ['Directeur / directrice', 'Adjoint(e)', 'Conseiller pédagogique', 'Chef de circonscription scolaire', 'Secrétaire', 'Autre'];
const STATUTS = ['FE', 'ACDPE', 'ACE', 'AME', 'Contractuel', 'Stagiaire', 'Suppléant', 'Privé', 'Autre'];
const ALIAS_P = { matricule: ['n matricule', 'matricule', 'numero matricule'], nom: ['nom'], prenoms: ['prenoms', 'prenom'], sexe: ['sexe', 'le genre', 'genre'],
  ecole: ['nom poste', 'ecole', 'poste', 'etablissement'], fonction: ['fonction'], corps: ['corps'], statut: ['nom statut', 'statut'], grade: ['grade'], cs: ['cs', 'circonscription', 'circonscription scolaire'], telephone: ['numero telephone', 'telephone', 'contact', 'tel'] };
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
const ficheStatut = (s) => { const n = norm(s).replace(/ /g, ''); return { fe: 'FE', acdpe: 'ACDPE', ace: 'ACE', ame: 'AME' }[n] || s; };

async function personnel(ctx) {
  const u = ctx.user;
  ctx.title('Personnel enseignant', 'Par zone pédagogique et par école — ajouter, modifier, supprimer');
  const zonesRef = (await db.all('ref')).filter(r => r.type === 'zone');
  const schools = await scoped('schools', u);
  const libZone = (c) => libGroupe(c ? 'z:' + c : 'cs', zonesRef, 'zone');
  let mode = u.role === 'CP' ? 'zone' : ((await db.setting('groupe-mode')) || modeGroupeDefaut(u));
  let onglet = (await db.setting('personnel-onglet')) || 'tout';
  const modes = h('div', { class: 'tabs no-print modes' }), tabs = h('div', { class: 'tabs no-print' }), holder = h('div'); ctx.el.append(modes, tabs, holder);
  const COLS = [{ k: 'nom', l: 'Nom', w: 130 }, { k: 'prenoms', l: 'Prénoms', w: 150 }, { k: 'sexe', l: 'Sexe' }, { k: 'fonction', l: 'Fonction', w: 140 }, { k: 'ecole', l: 'École / poste', w: 190 },
    { k: 'zoneLib', l: 'Zone' }, { k: 'arrondissement', l: 'Arrondissement' }, { k: 'statut', l: 'Statut' }, { k: 'grade', l: 'Grade' }, { k: 'corps', l: 'Corps', w: 200 }, { k: 'matricule', l: 'Matricule' }, { k: 'telephone', l: 'Téléphone' }];
  const tous = async () => (await db.all('personnel')).filter(p => u.role === 'ADMIN' || inScope(u, p) || (u.role === 'CCS' && p.codeCs === u.codeCs));
  let t;
  async function draw() {
    const all = await tous(), cle = (p) => cleGroupe(p, mode);
    const gs = [...new Set(all.map(cle))].sort(ordreGroupe);
    if (onglet !== 'tout' && !gs.includes(onglet)) onglet = 'tout';
    if (u.role !== 'CP') modes.replaceChildren(...[['arr', 'Par arrondissement'], ['zone', 'Par zone pédagogique']].map(([k, l]) => h('button', { class: 'tab' + (k === mode ? ' on' : ''), onclick: () => { mode = k; onglet = 'tout'; db.setting('groupe-mode', k); draw(); } }, l)));
    const ong = [['tout', mode === 'arr' ? 'Tous les arrondissements' : 'Toutes les zones'], ...gs.map(g => [g, libGroupe(g, zonesRef, mode)])];
    tabs.replaceChildren(...ong.map(([k, l]) => h('button', { class: 'tab' + (k === onglet ? ' on' : ''), onclick: () => { onglet = k; db.setting('personnel-onglet', k); draw(); } }, `${l} (${k === 'tout' ? all.length : all.filter(p => cle(p) === k).length})`)));
    const rows = all.filter(p => onglet === 'tout' || cle(p) === onglet)
      .map(p => ({ ...p, zoneLib: p.codeZone ? libZone(p.codeZone) : '' })).sort((a, b) => (a.ecole || '').localeCompare(b.ecole || '', 'fr') || (a.fonction || '').localeCompare(b.fonction || '', 'fr') || a.nom.localeCompare(b.nom, 'fr'));
    if (!t) { t = dataTable({ columns: COLS, rows, onOpen: () => modifier(), pageSize: 50, empty: 'Aucun agent ici. Touchez « Ajouter » ou « Importer Excel ».' }); holder.replaceChildren(t.el); } else t.setRows(rows);
    const f = rows.filter(p => p.sexe === 'F').length;
    ctx.status(`${rows.length} agent(s) dont ${f} femme(s) — ${rows.filter(p => /^Directeur/.test(p.fonction)).length} directeur(s)/directrice(s)`);
  }
  const schoolOptions = () => schools.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(s => ({ v: s.id, l: `${s.nom} (${s.codeZone ? libZone(s.codeZone) : s.arrondissement || 'sans zone'})` }));
  const FIELDS = () => [{ k: 'nom', l: 'Nom', t: 'text', req: true, w: 'half' }, { k: 'prenoms', l: 'Prénoms', t: 'text', w: 'half' },
    { k: 'sexe', l: 'Sexe', t: 'select', options: [{ v: 'M', l: 'Masculin' }, { v: 'F', l: 'Féminin' }], w: 'half' }, { k: 'fonction', l: 'Fonction', t: 'select', options: FONCTIONS, req: true, w: 'half' },
    { k: 'schoolId', l: 'École (vide = circonscription)', t: 'select', options: schoolOptions() }, { k: 'statut', l: 'Statut', t: 'select', options: STATUTS, w: 'half' }, { k: 'grade', l: 'Grade (ex. B1-04)', t: 'text', w: 'half' },
    { k: 'corps', l: 'Corps', t: 'text', w: 'half' }, { k: 'matricule', l: 'N° matricule', t: 'text', w: 'half' }, { k: 'telephone', l: 'Téléphone', t: 'text', w: 'half' }, { k: 'obs', l: 'Observations', t: 'textarea' }];
  const lier = (p) => {
    const s = schools.find(x => x.id === p.schoolId);
    if (s) Object.assign(p, { ecole: s.nom, codeZone: s.codeZone || '', numZone: s.numZone || '', codeCs: s.codeCs || '', arrondissement: s.arrondissement || '' });
    else Object.assign(p, { schoolId: '', ecole: p.ecole && !p.schoolId ? p.ecole : (u.nomCs ? 'Circonscription scolaire de ' + u.nomCs : 'Circonscription scolaire'), codeZone: '', numZone: '', arrondissement: '', codeCs: p.codeCs || u.codeCs || '' });
    return p;
  };
  const sel = () => { const s = t.selected; if (!s) toast('Touchez d\'abord une ligne du tableau.', 'warn'); return s; };
  async function ajouter() {
    const v = await formDialog({ title: 'Ajouter un agent', fields: FIELDS(), values: { fonction: 'Adjoint(e)', statut: 'ACDPE' }, wide: true }); if (!v) return;
    const p = lier({ id: uid(), created: nowISO(), ...v }); await db.put('personnel', p); await addLog(u, { action: 'Ajout agent', target: `${p.nom} ${p.prenoms || ''}` }); toast('Agent ajouté.'); draw();
  }
  async function modifier() {
    const s = sel(); if (!s) return; const { zoneLib, ...rec } = s;
    const v = await formDialog({ title: `Modifier — ${s.nom} ${s.prenoms || ''}`, fields: FIELDS(), values: rec, wide: true }); if (!v) return;
    const p = lier({ ...rec, ...v, updated: nowISO() }); if (v.schoolId !== rec.schoolId && !v.schoolId) p.ecole = ''; await db.put('personnel', lier(p)); toast('Agent modifié.'); draw();
  }
  async function supprimer() {
    const s = sel(); if (!s || !(await confirmBox(`Supprimer « ${s.nom} ${s.prenoms || ''} » (${s.ecole || ''}) ?`, 'Supprimer', true))) return;
    await db.del('personnel', s.id); await addLog(u, { action: 'Suppression agent', target: `${s.nom} ${s.prenoms || ''}` }); t.clearSel(); toast('Agent supprimé.'); draw();
  }
  async function importer() {
    const f = await pickFile('.xlsx,.csv,.txt'); if (!f) return;
    try {
      const sheets = /\.(csv|txt)$/i.test(f.name) ? [{ rows: parseCsv(await readAsText(f)) }] : await readXlsx(await readAsBuffer(f));
      const exist = await db.all('personnel'), trouver = indexEcoles(schools);
      let ajout = 0, maj = 0, sans = 0, horsCs = 0; const out = [];
      const nCs = (v) => norm(v).replace(/^cs /, '').trim();
      const csConnues = new Set([...schools.map(s => nCs(s.nomCs)), nCs(u.nomCs)].filter(Boolean));
      for (const sh of sheets) {
        const rows = sh.rows, hi = rows.findIndex(r => r.some(c => norm(c) === 'nom')); if (hi < 0) continue;
        const head = rows[hi].map(norm), idx = Object.fromEntries(Object.entries(ALIAS_P).map(([k, al]) => [k, head.findIndex(x => al.includes(x))]));
        for (const r of rows.slice(hi + 1)) {
          const g = (k) => idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '';
          if (!g('nom')) continue;
          if (idx.cs >= 0 && csConnues.size && g('cs') && !csConnues.has(nCs(g('cs')))) { horsCs++; continue; }   // autre circonscription
          const sx = norm(g('sexe')), o = { nom: g('nom'), prenoms: g('prenoms'), sexe: sx.startsWith('f') ? 'F' : sx.startsWith('m') ? 'M' : '', fonction: ficheFonction(g('fonction')), corps: g('corps'), statut: ficheStatut(g('statut')), grade: g('grade'), matricule: g('matricule'), telephone: g('telephone') };
          const ec = g('ecole'), s = ec ? trouver(ec) : null;
          if (ec && !s && !/^(la )?cs |circonscription/i.test(ec)) sans++;
          const old = exist.find(p => norm(p.nom) === norm(o.nom) && norm(p.prenoms) === norm(o.prenoms));
          const p = lier({ ...(old || { id: uid(), created: nowISO() }), ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '')), schoolId: s ? s.id : (old ? old.schoolId : ''), ecole: s ? s.nom : (ec || old?.ecole || '') });
          if (!inScope(u, p) && u.role !== 'ADMIN' && !(u.role === 'CCS' && p.codeCs === u.codeCs)) continue;
          if (out.some(x => x.id === p.id)) continue;
          old ? maj++ : ajout++; out.push(p); exist.push(p);
        }
      }
      await db.putMany('personnel', out); await addLog(u, { action: 'Import personnel', target: f.name, comment: `${ajout} ajout(s), ${maj} mise(s) à jour` });
      toast(`${ajout} agent(s) ajouté(s), ${maj} mis à jour${sans ? ` — ${sans} poste(s) sans école reconnue` : ''}${horsCs ? ` — ${horsCs} ligne(s) d'autres circonscriptions ignorée(s)` : ''}.`, 'ok', 7000); draw();
    } catch (e) { toast('Import impossible : ' + e.message, 'err'); }
  }
  const titre = () => `PERSONNEL ENSEIGNANT — ${onglet === 'tout' ? (mode === 'arr' ? 'TOUS LES ARRONDISSEMENTS' : 'TOUTES LES ZONES') : libGroupe(onglet, zonesRef, mode).toUpperCase()}`;
  await draw();
  ctx.actions([
    { label: '➕ Ajouter', kind: 'primary', onClick: ajouter }, { label: '✏️ Modifier', onClick: modifier }, { label: '🗑 Supprimer', onClick: supprimer },
    { label: '⬆ Importer Excel', title: 'Fichier du personnel (ex. cahier de contrôle DDEMP) : complète matricules, téléphones…', onClick: importer },
    { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: titre(), subtitle: u.nomCs ? 'Circonscription scolaire de ' + u.nomCs : '', columns: COLS, rows: t.visible, sheet: 'Personnel' }), 'Personnel.xlsx') },
    { label: '⬇ PDF', onClick: async () => download(pdfBlob(await listToPdf({ title: titre(), subtitle: u.nomCs ? 'Circonscription scolaire de ' + u.nomCs : '', columns: COLS.filter(c => c.k !== 'corps'), rows: t.visible })), 'Personnel.pdf') }]);
}

