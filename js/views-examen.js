/* République du Bénin — MEMP — Examen blanc du CEP dans MEMP-CP / DOSP / MEMP-CP Pobè (et l'espace CP d'ÉduGestion).
   Même calcul que CS Pobè (js/examen-blanc.js = outils/examen-blanc/examen.js, objet ExamenBlanc) : neuf épreuves, une
   épreuve est maîtrisée à partir de 10/20, le seuil demande 6 maîtrises (6 sur 8 pour un dispensé d'EPS : épreuve laissée
   vide), classement au total avec ex æquo, bilan par centre et par sexe, épreuves fortes et faibles, écart type,
   recommandations tirées des chiffres.
   Centres : ceux de l'entité du compte (CP → sa zone, CCS / DOSP → la circonscription, DDEMP → le département),
   modifiables ; la jumelle de Pobè propose les centres de la CS. Candidats : saisie, recherche, import Excel « Candidats à
   l'examen blanc » (mêmes colonnes que CS Pobè), reprise de la liste des candidats au CEP (module « Examens et concours »).
   Documents signés avec code QR (registre « Vérifier un document ») : PV du centre, relevé de notes du centre, résultats
   (synthèse des centres). Données : réglage « examenBlanc ».
   Conception : Maître Aimé FACHE */
import { h, toast, download, confirmBox, modal, pickFile, readAsBuffer, uid, nowISO, norm, sha256, currentSchoolYear } from './util.js';
import { db } from './db.js';
import { readXlsx } from './xlsx.js';
import { VARIANT } from './config.js';
import { getIdentity, qrPayload } from './sign.js';
import { qrDataURL } from './qr.js';
import { adaptateurUascep } from './views-uascep.js';

const E = () => window.ExamenBlanc;
const I = (n) => (window.Icones ? window.Icones.code(n) + ' ' : '');
const LIB = { ECOLE: 'École', UP: 'Unité pédagogique', ZONE: 'Zone pédagogique', CS: 'Circonscription scolaire', DDEMP: 'Direction départementale' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const frD = (d) => (d && /^\d{4}-\d\d-\d\d/.test(d) ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : d || '');
const canon = (o) => (window.PVS ? window.PVS.canon(o) : JSON.stringify(o));
/** Colonnes du fichier « Candidats à l'examen blanc » (import et export, communes à CS Pobè et à SCOLARIS / GESCOL) */
export const COLONNES = () => ['N° d’ordre', 'Nom et prénoms', 'Sexe', 'École de provenance'].concat(E().MATIERES.map(m => m.libelle));
const ALIAS = { 'n d ordre': 'ordre', 'no ordre': 'ordre', ordre: 'ordre', 'nom et prenoms': 'nom', 'noms et prenoms': 'nom', nom: 'nom', candidat: 'nom', sexe: 'sexe', genre: 'sexe',
  'ecole de provenance': 'ecoleNom', ecole: 'ecoleNom', provenance: 'ecoleNom', dictee: 'dictee', 'communication ecrite': 'communication', 'expression ecrite': 'communication', communication: 'communication',
  'comprehension de l ecrit': 'comprehension', comprehension: 'comprehension', mathematique: 'maths', mathematiques: 'maths', maths: 'maths', est: 'est', es: 'es', 'ea vivant': 'ea_vivant', 'ea v': 'ea_vivant',
  'ea artistique': 'ea_artistique', 'ea a': 'ea_artistique', 'ea plastique': 'ea_artistique', eps: 'eps' };
const sexeDe = (v) => { const s = norm(v); return /^(f|fille|feminin)/.test(s) ? 'F' : /^(g|m|garcon|masculin|h)/.test(s) ? 'G' : ''; };

/* ---------- état ---------- */
async function charger() { const e = (await db.setting('examenBlanc')) || {}; return { centres: Array.isArray(e.centres) ? e.centres : [], candidats: Array.isArray(e.candidats) ? e.candidats : [] }; }
const enregistrer = (e) => db.setting('examenBlanc', e);
/** Contenu vérifiable d'un document (même calcul à l'édition et à la vérification) */
export function contenuExamen(etat, type, ref) {
  const sans = (c) => { const o = Object.assign({}, c); delete o.maj; return o; };
  const cands = (id) => etat.candidats.filter(c => c.centreId === id).map(sans).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (type === 'RESULTATS') return { t: type, c: (ref.centres || []).map(id => ({ ce: sans(etat.centres.find(x => x.id === id) || {}), k: cands(id) })) };
  return { t: type, ce: sans(etat.centres.find(x => x.id === ref.centre) || {}), k: cands(ref.centre) };
}
async function signer(u, type, typeLib, ref, contenu, resume) {
  const idn = (await getIdentity()) || {};
  const hash = await sha256(canon(contenu));
  const id = 'D' + uid().replace(/-/g, '').slice(0, 10).toUpperCase(), codeCp = idn.codeCp || u.codeCp || u.username;
  await db.put('docs', { id, ficheId: 'EXAMEN-BLANC', store: 'examenBlanc', hash, date: nowISO(), cp: codeCp, by: u.username, label: typeLib + ' — ' + (resume.objet || ''), examen: { type, ref, resume: Object.assign({ type: typeLib }, resume) } });
  const texte = qrPayload(id, hash, codeCp);
  return { numero: id, code: hash.slice(0, 16).toUpperCase(), qr: '<img src="' + qrDataURL(texte, 4, 2) + '" alt="Code QR de vérification" width="96" height="96">' };
}
/** Vérification (menu « Vérifier un document ») : empreinte recalculée sur les centres et candidats enregistrés */
export async function verifierExamen(d) {
  const etat = await charger(), x = d.examen || {};
  return { same: (await sha256(canon(contenuExamen(etat, x.type, x.ref || {})))) === d.hash, resume: x.resume || {} };
}
/** Résultats par école (tableau de bord du pilotage) : composés et seuil atteint, toutes sessions de l'année */
export async function indicateursEcoles(annee) {
  const etat = await charger(), out = {};
  const ids = new Set(etat.centres.filter(c => !annee || !c.session || String(c.session) === annee || String(c.session).includes(String(annee).slice(-4))).map(c => c.id));
  etat.candidats.filter(c => ids.has(c.centreId) && c.ecoleId).forEach(c => { const r = E().resultat(c), o = out[c.ecoleId] = out[c.ecoleId] || { ebComposes: 0, ebAdmis: 0 }; if (r.aCompose) o.ebComposes++; if (r.admis) o.ebAdmis++; });
  return out;
}

/* ---------- impression ---------- */
const CSS = '<style>.eb-doc{font:10pt/1.4 Arial,sans-serif;color:#111}.eb-doc h2{font:bold 13pt Arial,sans-serif;text-align:center;margin:10px 0 4px;text-transform:uppercase;color:#14532d}.eb-doc h3{font:bold 11pt Arial,sans-serif;margin:12px 0 4px}'
  + '.eb-doc p.c{text-align:center;margin:2px 0}.eb-imp{border-collapse:collapse;width:100%;font:8.5pt Arial,sans-serif;margin:6px 0}.eb-imp th,.eb-imp td{border:1px solid #555;padding:2px 4px;text-align:left;vertical-align:top}'
  + '.eb-imp th{background:#E8EEF5!important;color:#1D2939!important;position:static}.eb-imp td.n{text-align:right}.eb-sigs{display:flex;justify-content:space-between;gap:18px;margin-top:16px;break-inside:avoid}.eb-sb{flex:1;text-align:center}'
  + '.eb-sb-z{position:relative;height:104px;display:flex;align-items:center;justify-content:center}.eb-sb-z img,.eb-sb-z svg{max-height:96px;max-width:170px}.eb-sb-c{position:absolute;opacity:.85}'
  + '.eb-qrb{display:flex;gap:12px;align-items:center;margin-top:16px;padding-top:8px;border-top:1px solid #999;font:8.5pt Arial,sans-serif;break-inside:avoid}.eb-qrb img{width:96px;height:96px}.eb-qrb b{font-family:monospace}</style>';
function imprimer(titre, html) {
  const zoneDoc = h('div', { class: 'eb-apercu', html, style: { background: '#fff', color: '#111', padding: '12px', overflowX: 'auto', border: '1px solid #ddd', maxWidth: '100%', boxSizing: 'border-box' } });
  const ov = h('div', { class: 'overlay eb-voile' }, h('div', { class: 'dialog wide', role: 'dialog', 'aria-label': titre, style: { maxWidth: 'calc(100vw - 16px)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', minWidth: 0 } },
    h('div', { class: 'dialog-head' }, h('h3', titre), h('button', { class: 'icon-btn', title: 'Fermer', 'data-eb': 'fermer', onclick: () => ov.remove() }, I('fermer'))),
    h('div', { class: 'dialog-body', style: { overflow: 'auto', minWidth: 0, flex: '1 1 auto' } }, zoneDoc),
    h('div', { class: 'dialog-foot' }, h('button', { class: 'btn', onclick: () => ov.remove() }, 'Fermer'), h('button', { class: 'btn primary', onclick: () => {
      let z = document.getElementById('eb-impression'); if (!z) { z = h('div', { id: 'eb-impression' }); document.body.append(z); }
      z.innerHTML = html; document.body.classList.add('eb-imprime'); const fin = () => { document.body.classList.remove('eb-imprime'); z.innerHTML = ''; };
      window.addEventListener('afterprint', fin, { once: true }); setTimeout(() => { window.print(); setTimeout(fin, 1500); }, 50); } }, I('imprimer') + 'Imprimer / PDF'))));
  document.body.append(ov);
}

export async function render(id, ctx) {
  const u = ctx.user;
  if (!E()) { ctx.el.append(h('p', 'Module indisponible : rechargez l’application.')); return; }
  ctx.title && ctx.title('Examen blanc du CEP', 'Centres, candidats, notes, classement, bilan par centre et par sexe, PV et résultats signés');
  if (!document.getElementById('eb-styles')) document.head.append(h('style', { id: 'eb-styles' }, `
    .eb-tw{overflow:auto;max-height:68vh;border:1px solid var(--line,#D0D5DD);border-radius:10px;background:var(--card,#fff)}
    .eb-t{border-collapse:collapse;width:100%;font-size:.84rem}.eb-t thead th{position:sticky;top:0;z-index:2;background:#F2F4F7;color:#344054;padding:6px 7px;text-align:left;white-space:nowrap;font-size:.74rem;border-bottom:1px solid #D0D5DD}
    .eb-t td{padding:5px 7px;border-bottom:1px solid #EAECF0}.eb-t td.n{text-align:right;font-variant-numeric:tabular-nums}.eb-t tr.tot td{font-weight:700;background:#F2F4F7}.eb-t td.bas{color:#b91c1c}
    .eb-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px;margin:10px 0}.eb-kpi{border:1px solid #D0D5DD;border-radius:10px;padding:10px;background:var(--card,#fff)}.eb-kpi b{display:block;font-size:1.35rem;color:#1F4E79}.eb-kpi span{font-size:.78rem;color:#667085}
    .eb-barre{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin:6px 0}.eb-barre label{display:flex;flex-direction:column;font-size:.78rem;font-weight:600;color:#667085;gap:3px;flex:1 1 180px;max-width:340px}
    .eb-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px;margin:12px 0}.eb-badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.74rem;font-weight:600}.eb-badge.ok{background:#ECFDF3;color:#067647}.eb-badge.ko{background:#FEF3F2;color:#B42318}.eb-badge.abs{background:#F2F4F7;color:#475467}
    #eb-impression{display:none}@media print{body.eb-imprime>*:not(#eb-impression){display:none!important}body.eb-imprime #eb-impression{display:block!important}}`));
  const A = await adaptateurUascep(u);
  const cx = await A.contexte();
  const entite = (n, k) => (cx.entites[n] || []).find(e => String(e.cle) === String(k));
  const peut = (n, k) => !!(cx.droits && cx.droits.ecrire(n, k));
  const ecoles = cx.entites.ECOLE || [];
  const ecoleLib = (k) => (ecoles.find(e => String(e.cle) === String(k)) || {}).lib || '';
  const au = cx.autorite || (cx.entites.ZONE[0] ? { niveau: 'ZONE', cle: cx.entites.ZONE[0].cle } : null);
  let etat = await charger();
  const sauver = () => enregistrer(etat);
  const visibles = () => etat.centres.filter(c => entite(c.niveau, c.entite));
  // jumelle de Pobè : les centres de la CS ; ailleurs : un centre à créer (aucune liste imposée)
  if (!visibles().length && au && peut(au.niveau, au.cle)) {
    const noms = VARIANT.id === 'pobe' && au.niveau !== 'ZONE' ? E().CENTRES : ['Centre de ' + ((entite(au.niveau, au.cle) || {}).lib || 'composition').replace(/^(Circonscription scolaire de|Zone pédagogique|DDEMP)\s*/i, (m) => /zone/i.test(m) ? 'la zone ' : '')];
    noms.forEach(n => etat.centres.push({ id: uid(), nom: n, chef: '', dateComposition: '', session: currentSchoolYear(), niveau: au.niveau, entite: String(au.cle), entiteLib: (entite(au.niveau, au.cle) || {}).lib || '' }));
    await sauver();
  }
  let centreId = (() => { try { return localStorage.getItem('eb.centre') || ''; } catch (e) { return ''; } })();
  let recherche = '';
  const racine = h('div'); ctx.el.append(racine);
  const centreCourant = () => visibles().find(c => c.id === centreId) || visibles()[0] || null;
  const candidatsDe = (id) => etat.candidats.filter(c => c.centreId === id);
  const carte = (v, l) => h('div', { class: 'eb-kpi' }, h('b', String(v)), h('span', l));
  const pc = (t) => (t === null || t === undefined ? '—' : t + ' %');

  async function visaHtml(ce) {
    let v = null; try { v = await A.visa(ce.niveau, ce.entite); } catch (e) { v = null; }
    v = v || {};
    const titre = v.titre || { ZONE: 'Le Conseiller pédagogique', CS: 'Le Chef de la circonscription scolaire', DDEMP: 'Le Directeur départemental' }[ce.niveau] || 'Le Responsable';
    return { html: '<div class="eb-sb"><b>Vu — ' + esc(titre) + '</b><div class="eb-sb-z">' + (v.cachet ? '<div class="eb-sb-c">' + v.cachet + '</div>' : '') + (v.signature ? '<img src="' + v.signature + '" alt="Signature" style="position:relative;mix-blend-mode:multiply">' : '') + '</div><b>' + esc(v.nom || '') + '</b></div>', nom: v.nom || '' };
  }
  const blocVide = (t, n) => '<div class="eb-sb"><b>' + esc(t) + '</b><div class="eb-sb-z"></div><b>' + esc(n || '') + '</b></div>';
  async function piece(type, typeLib, ref, resume, corps, sigs) {
    const r = await signer(u, type, typeLib, ref, contenuExamen(etat, type, ref), resume);
    return CSS + '<div class="eb-doc">' + (A.entete ? A.entete() : '') + corps + '<p style="text-align:right">Fait à ' + esc(cx.lieu || '…………') + ', le ' + frD(new Date().toISOString().slice(0, 10)) + '</p>'
      + '<div class="eb-sigs">' + sigs.join('') + '</div><div class="eb-qrb" data-eb-numero="' + esc(r.numero) + '">' + r.qr + '<div>Document n° <b>' + esc(r.numero) + '</b><br>Code de vérification : <b>' + esc(r.code) + '</b><br>'
      + esc(typeLib) + ' — ' + esc(resume.objet || '') + (resume.mention ? ' (' + esc(resume.mention) + ')' : '') + '<br>Vérifiable dans l’application (menu « Vérifier un document ») : numéro ou code QR ; toute modification des notes après la signature est signalée.</div></div></div>';
  }
  const tableNotes = (b, avecMaitrises) => '<table class="eb-imp"><thead><tr><th>Rang</th><th>N°</th><th>Nom et prénoms</th><th>Sexe</th><th>École de provenance</th>' + E().MATIERES.map(m => '<th>' + m.abrege + '</th>').join('') + '<th>Total</th><th>Moyenne</th>' + (avecMaitrises ? '<th>Maîtrises</th><th>Seuil</th>' : '') + '</tr></thead><tbody>'
    + b.classes.slice().sort((a, d) => (a.rang || 9999) - (d.rang || 9999)).map((x, i) => '<tr><td>' + (x.rang || '—') + '</td><td>' + (i + 1) + '</td><td>' + esc(x.candidat.nom) + '</td><td>' + esc(x.candidat.sexe || '') + '</td><td>' + esc(x.candidat.ecoleNom || ecoleLib(x.candidat.ecoleId)) + '</td>'
      + x.notes.map(n => '<td class="n">' + (n === null ? '' : n) + '</td>').join('') + '<td class="n">' + (x.aCompose ? x.total : '') + '</td><td class="n">' + (x.moyenne === null ? '' : x.moyenne) + '</td>'
      + (avecMaitrises ? '<td class="n">' + (x.aCompose ? x.maitrises + '/' + x.composees : '') + '</td><td>' + (!x.aCompose ? 'absent' : x.admis ? 'atteint' : 'non atteint') + '</td>' : '') + '</tr>').join('') + '</tbody></table>';
  const enteteCentre = (c, titre) => '<h2>' + esc(titre) + '</h2><p class="c"><b>' + esc(c.nom) + '</b> — session ' + esc(c.session || '') + (c.dateComposition ? ' — composition du ' + frD(c.dateComposition) : '') + (c.chef ? '<br>Chef de centre : ' + esc(c.chef) : '') + '</p>';
  const DOCS = {
    async PV(c) { const b = E().bilan(candidatsDe(c.id)), v = await visaHtml(c);
      imprimer('Procès-verbal — ' + c.nom, await piece('PV', 'Procès-verbal d’examen blanc du CEP', { centre: c.id }, { objet: c.nom, mention: b.admis + ' / ' + b.composes + ' au seuil' },
        enteteCentre(c, 'Procès-verbal d’examen blanc du CEP') + tableNotes(b, false)
        + '<h3>Participation et réussite</h3><table class="eb-imp"><thead><tr><th>Indicateur</th><th>Garçons</th><th>Filles</th><th>Total</th></tr></thead><tbody>'
        + [['Inscrits', b.g.inscrits, b.f.inscrits, b.inscrits], ['Ont composé', b.g.composes, b.f.composes, b.composes], ['Ont atteint le seuil', b.g.admis, b.f.admis, b.admis], ['Taux de réussite', pc(b.g.taux), pc(b.f.taux), pc(b.taux)]].map(l => '<tr><td>' + l[0] + '</td><td class="n">' + l[1] + '</td><td class="n">' + l[2] + '</td><td class="n"><b>' + l[3] + '</b></td></tr>').join('') + '</tbody></table>'
        + '<p style="font-size:8.5pt">Le seuil de réussite demande ' + E().MAITRISES_REQUISES + ' maîtrises sur les ' + E().MATIERES.length + ' épreuves — ' + E().MAITRISES_REQUISES + ' sur ' + (E().MATIERES.length - 1) + ' pour un candidat dispensé d’EPS. Une épreuve est maîtrisée à partir de ' + E().SEUIL_MATIERE + '/20.</p>'
        + '<h3>Recommandations</h3><ul>' + E().recommandations(b).map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>',
        [blocVide('Le chef de centre', c.chef), v.html])); },
    async RELEVE(c) { const b = E().bilan(candidatsDe(c.id)), v = await visaHtml(c);
      imprimer('Relevé de notes — ' + c.nom, await piece('RELEVE', 'Relevé de notes du centre', { centre: c.id }, { objet: c.nom, mention: b.inscrits + ' candidat(s)' },
        enteteCentre(c, 'Relevé de notes du centre') + tableNotes(b, true)
        + '<h3>Résultats par épreuve</h3><table class="eb-imp"><thead><tr><th>Épreuve</th><th>Composé</th><th>Moyenne</th><th>Maîtrises</th><th>Taux</th><th>Écart type</th></tr></thead><tbody>'
        + b.matieres.map(m => '<tr><td>' + esc(m.matiere.libelle) + '</td><td class="n">' + m.notes + '</td><td class="n">' + (m.moyenne === null ? '—' : m.moyenne) + '</td><td class="n">' + m.maitrises + '</td><td class="n">' + pc(m.taux) + '</td><td class="n">' + m.ecartType + '</td></tr>').join('') + '</tbody></table>'
        + '<p>Épreuves les mieux réussies : ' + b.fortes.map(m => esc(m.matiere.libelle) + ' (' + m.moyenne + ')').join(', ') + ' — les moins réussies : ' + b.faibles.map(m => esc(m.matiere.libelle) + ' (' + m.moyenne + ')').join(', ') + '.</p>',
        [blocVide('Le chef de centre', c.chef), v.html])); },
    async RESULTATS() { const cs = visibles(), au2 = au || { niveau: cs[0].niveau, cle: cs[0].entite }, v = await visaHtml({ niveau: au2.niveau, entite: au2.cle });
      let t = [0, 0, 0, 0, 0, 0];
      const lignes = cs.map(c => { const b = E().bilan(candidatsDe(c.id)); t = [t[0] + b.g.inscrits, t[1] + b.f.inscrits, t[2] + b.composes, t[3] + b.admis, t[4] + b.g.admis, t[5] + b.f.admis];
        return '<tr><td>' + esc(c.nom) + '</td><td class="n">' + b.g.inscrits + '</td><td class="n">' + b.f.inscrits + '</td><td class="n">' + b.inscrits + '</td><td class="n">' + b.composes + '</td><td class="n">' + b.admis + '</td><td class="n">' + pc(b.g.taux) + '</td><td class="n">' + pc(b.f.taux) + '</td><td class="n">' + pc(b.taux) + '</td><td class="n">' + (b.moyenneCentre === null ? '—' : b.moyenneCentre) + '</td><td class="n">' + b.ecartTypeMoyennes + '</td></tr>'; }).join('');
      const tot = '<tr><td><b>Ensemble</b></td><td class="n">' + t[0] + '</td><td class="n">' + t[1] + '</td><td class="n">' + (t[0] + t[1]) + '</td><td class="n">' + t[2] + '</td><td class="n">' + t[3] + '</td><td></td><td></td><td class="n"><b>' + (t[2] ? Math.round(t[3] / t[2] * 1000) / 10 + ' %' : '—') + '</b></td><td></td><td></td></tr>';
      const lib = (entite(au2.niveau, au2.cle) || {}).lib || '';
      imprimer('Résultats de l’examen blanc', await piece('RESULTATS', 'Résultats de l’examen blanc du CEP', { centres: cs.map(c => c.id) }, { objet: lib, mention: t[3] + ' / ' + t[2] + ' au seuil' },
        '<h2>Résultats de l’examen blanc du CEP</h2><p class="c">' + esc(LIB[au2.niveau] || '') + ' : ' + esc(lib) + ' — ' + cs.length + ' centre(s)</p><table class="eb-imp"><thead><tr><th>Centre</th><th>Inscrits G</th><th>Inscrits F</th><th>Inscrits</th><th>Ont composé</th><th>Seuil atteint</th><th>Taux G</th><th>Taux F</th><th>Taux</th><th>Moyenne</th><th>Écart type</th></tr></thead><tbody>' + lignes + tot + '</tbody></table>',
        [v.html])); }
  };

  async function formCentre(c) {
    const nouveau = !c; c = c || { nom: '', chef: '', dateComposition: '', session: currentSchoolYear(), niveau: au && au.niveau, entite: au && String(au.cle) };
    const ent = ['ZONE', 'CS', 'DDEMP', 'UP', 'ECOLE'].flatMap(n => (cx.entites[n] || []).filter(e => peut(n, e.cle)).map(e => [n + '|' + e.cle, LIB[n] + ' — ' + e.lib]));
    const f = { nom: h('input', { class: 'input', value: c.nom, 'data-geo': 'aucun' }), chef: h('input', { class: 'input', value: c.chef || '' }), date: h('input', { class: 'input', type: 'date', value: c.dateComposition || '' }), session: h('input', { class: 'input', value: c.session || '' }),
      ent: h('select', { class: 'input' }, ent.map(([v, l]) => h('option', { value: v, selected: v === c.niveau + '|' + c.entite }, l))) };
    modal({ title: nouveau ? 'Ajouter un centre' : 'Régler le centre', body: h('div', { class: 'grid2' }, ...[['Nom du centre', f.nom], ['Chef de centre', f.chef], ['Date de composition', f.date], ['Session', f.session], ['Entité organisatrice', f.ent]].map(([l, el]) => h('label', { class: 'field' }, h('span', l), el))),
      actions: [{ label: 'Annuler' }, !nouveau ? { label: I('supprimer') + 'Supprimer le centre', kind: 'danger', onClick: async () => { if (!(await confirmBox('Supprimer le centre « ' + c.nom + ' » et ses ' + candidatsDe(c.id).length + ' candidat(s) ?', 'Supprimer', true))) return false; etat.candidats = etat.candidats.filter(x => x.centreId !== c.id); etat.centres = etat.centres.filter(x => x.id !== c.id); await sauver(); dessiner(); } } : null,
        { label: I('enregistrer') + 'Enregistrer', kind: 'primary', onClick: async () => { if (!f.nom.value.trim()) { toast('Nom du centre obligatoire.', 'err'); return false; }
          const [n, k] = (f.ent.value || '|').split('|'); Object.assign(c, { nom: f.nom.value.trim(), chef: f.chef.value.trim(), dateComposition: f.date.value, session: f.session.value.trim(), niveau: n, entite: k, entiteLib: (entite(n, k) || {}).lib || '', maj: nowISO() });
          if (nouveau) { c.id = uid(); etat.centres.push(c); centreId = c.id; } await sauver(); dessiner(); } }].filter(Boolean) });
  }
  async function formCandidat(c) {
    const ce = centreCourant(); const nouveau = !c; c = c || {};
    const f = { nom: h('input', { class: 'input', value: c.nom || '', 'data-geo': 'aucun' }), sexe: h('select', { class: 'input' }, [['', '—'], ['G', 'Garçon'], ['F', 'Fille']].map(([v, l]) => h('option', { value: v, selected: v === (c.sexe || '') }, l))),
      ecole: h('select', { class: 'input' }, h('option', { value: '' }, '—'), ecoles.map(e => h('option', { value: e.cle, selected: String(e.cle) === String(c.ecoleId || '') }, e.lib))) };
    const notes = E().MATIERES.map(m => [m, h('input', { class: 'input', type: 'number', step: '0.25', min: 0, max: 20, inputmode: 'decimal', value: c[m.cle] == null ? '' : c[m.cle], 'data-mat': m.cle })]);
    modal({ title: (nouveau ? 'Inscrire un candidat — ' : 'Modifier un candidat — ') + ce.nom, wide: true,
      body: h('div', {}, h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', 'Nom et prénoms *'), f.nom), h('label', { class: 'field' }, h('span', 'Sexe *'), f.sexe), h('label', { class: 'field' }, h('span', 'École de provenance'), f.ecole)),
        h('p', { class: 'hint' }, 'Notes sur 20. Laissez vide une épreuve non composée (dispense d’EPS : seuil de 6 maîtrises sur 8) : elle sort du calcul au lieu de compter zéro.'),
        h('div', { class: 'grid2' }, notes.map(([m, el]) => h('label', { class: 'field' }, h('span', m.libelle), el)))),
      actions: [{ label: 'Annuler' }, { label: I('enregistrer') + 'Enregistrer', kind: 'primary', onClick: async () => {
        if (!f.nom.value.trim() || !f.sexe.value) { toast('Nom et sexe obligatoires.', 'err'); return false; }
        const bad = notes.find(([, el]) => el.value !== '' && (+el.value < 0 || +el.value > 20)); if (bad) { toast('Note hors de 0–20 : ' + bad[0].libelle, 'err'); return false; }
        Object.assign(c, { nom: f.nom.value.trim(), sexe: f.sexe.value, ecoleId: f.ecole.value, ecoleNom: f.ecole.value ? ecoleLib(f.ecole.value) : (c.ecoleNom || ''), centreId: c.centreId || ce.id, maj: nowISO() });
        notes.forEach(([m, el]) => { if (el.value === '') delete c[m.cle]; else c[m.cle] = +el.value; });
        if (nouveau) { c.id = uid(); etat.candidats.push(c); } await sauver(); dessiner(); } }] });
  }
  async function importer() {
    const ce = centreCourant(); const f = await pickFile('.xlsx,.xls'); if (!f) return;
    let fs; try { fs = await readXlsx(await readAsBuffer(f)); } catch (e) { toast('Fichier illisible : ' + e.message, 'err'); return; }
    const feuille = fs.find(x => /examen/i.test(x.name)) || fs[0], L = feuille.rows || [];
    const i0 = L.findIndex(r => (r || []).some(v => ALIAS[norm(v).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()] === 'nom'));
    if (i0 < 0) { toast('Colonne « Nom et prénoms » introuvable.', 'err'); return; }
    const tete = L[i0].map(v => ALIAS[norm(v).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()] || null);
    let crees = 0, majs = 0;
    L.slice(i0 + 1).forEach(r => {
      const o = {}; tete.forEach((k, j) => { if (k && r[j] !== undefined && r[j] !== null && String(r[j]).trim() !== '') o[k] = String(r[j]).trim(); });
      if (!o.nom || /^total/i.test(o.nom)) return;
      o.sexe = sexeDe(o.sexe); E().MATIERES.forEach(m => { if (o[m.cle] !== undefined) { const v = parseFloat(String(o[m.cle]).replace(',', '.')); if (isNaN(v)) delete o[m.cle]; else o[m.cle] = Math.min(20, Math.max(0, v)); } });
      if (o.ecoleNom) { const e = ecoles.find(x => norm(x.lib) === norm(o.ecoleNom) || (x.alias || []).some(a => norm(a) === norm(o.ecoleNom))); if (e) { o.ecoleId = String(e.cle); o.ecoleNom = e.lib; } }
      delete o.ordre;
      const ex = etat.candidats.find(x => x.centreId === ce.id && norm(x.nom) === norm(o.nom));
      if (ex) { Object.assign(ex, o, { maj: nowISO() }); majs++; } else { etat.candidats.push(Object.assign({ id: uid(), centreId: ce.id, maj: nowISO() }, o)); crees++; }
    });
    await sauver(); toast(crees + ' candidat(s) ajouté(s), ' + majs + ' mis à jour dans ' + ce.nom + '.'); dessiner();
  }
  function exporter() {
    const ce = centreCourant(), b = E().bilan(candidatsDe(ce.id));
    const f1 = [COLONNES().concat(['Total', 'Moyenne', 'Nombre de maîtrises', 'Seuil atteint', 'Rang'])].concat(b.classes.slice().sort((a, d) => (a.rang || 9999) - (d.rang || 9999)).map((x, i) => [i + 1, x.candidat.nom, x.candidat.sexe || '', x.candidat.ecoleNom || ecoleLib(x.candidat.ecoleId)]
      .concat(x.notes.map(n => (n === null ? '' : n)), [x.aCompose ? x.total : '', x.moyenne === null ? '' : x.moyenne, x.aCompose ? x.maitrises : '', !x.aCompose ? 'absent' : x.admis ? 'oui' : 'non', x.rang || ''])));
    const f2 = [['Épreuve', 'Composé', 'Moyenne', 'Maîtrises', 'Taux (%)', 'Écart type']].concat(b.matieres.map(m => [m.matiere.libelle, m.notes, m.moyenne === null ? '' : m.moyenne, m.maitrises, m.taux === null ? '' : m.taux, m.ecartType]));
    const f3 = [['Centre', 'Inscrits G', 'Inscrits F', 'Inscrits', 'Ont composé', 'Ont atteint le seuil', 'Taux G (%)', 'Taux F (%)', 'Taux (%)', 'Moyenne', 'Écart type']].concat(visibles().map(c => { const x = E().bilan(candidatsDe(c.id)); return [c.nom, x.g.inscrits, x.f.inscrits, x.inscrits, x.composes, x.admis, x.g.taux === null ? '' : x.g.taux, x.f.taux === null ? '' : x.f.taux, x.taux === null ? '' : x.taux, x.moyenneCentre === null ? '' : x.moyenneCentre, x.ecartTypeMoyennes]; }));
    download(window.XlsxEcrire.classeur([{ nom: 'Candidats à l’examen blanc', lignes: f1, entete: 0 }, { nom: 'Résultats par épreuve', lignes: f2, entete: 0 }, { nom: 'Synthèse des centres', lignes: f3, entete: 0 }]), 'examen-blanc-' + norm(ce.nom).replace(/\s+/g, '-') + '.xlsx');
  }
  /** Candidats au CEP (module « Examens et concours ») → centre affiché */
  async function depuisCep() {
    const ce = centreCourant(), pvs = (await db.setting('pvs')) || {}, l = (pvs.candidats || []).filter(c => entite('ECOLE', c.entite));
    if (!l.length) { toast('La liste des candidats au CEP (module « Examens et concours ») est vide.', 'err'); return; }
    const centresCep = [...new Set(l.map(c => c.centre).filter(Boolean))], centreNom = (id) => ((pvs.centres || []).find(x => x.id === id) || {}).centre || '';
    const sel = h('select', { class: 'input' }, h('option', { value: '' }, 'Tous les candidats du CEP (' + l.length + ')'), centresCep.map(id => h('option', { value: id, selected: norm(centreNom(id)) === norm(ce.nom) }, 'Centre CEP : ' + centreNom(id) + ' (' + l.filter(c => c.centre === id).length + ')')));
    modal({ title: 'Candidats au CEP → ' + ce.nom, body: h('label', { class: 'field' }, h('span', 'Candidats à reprendre'), sel), actions: [{ label: 'Annuler' }, { label: I('importer') + 'Reprendre', kind: 'primary', onClick: async () => {
      let n = 0; l.filter(c => !sel.value || c.centre === sel.value).forEach(c => { const nom = [String(c.nom || '').toUpperCase(), c.prenoms].filter(Boolean).join(' ');
        if (etat.candidats.some(x => x.centreId === ce.id && norm(x.nom) === norm(nom))) return;
        etat.candidats.push({ id: uid(), centreId: ce.id, nom, sexe: c.sexe === 'F' ? 'F' : 'G', ecoleId: String(c.entite), ecoleNom: c.entiteLib || ecoleLib(c.entite), cepRef: c.id, maj: nowISO() }); n++; });
      await sauver(); toast(n + ' candidat(s) repris de la liste du CEP.'); dessiner(); } }] });
  }

  function dessiner() {
    racine.replaceChildren();
    const ce = centreCourant();
    const w = ce && peut(ce.niveau, ce.entite);
    const selC = h('select', { class: 'input', 'data-eb': 'centre', onchange: (e) => { centreId = e.target.value; try { localStorage.setItem('eb.centre', centreId); } catch (x) { /* facultatif */ } dessiner(); } }, visibles().map(c => h('option', { value: c.id, selected: ce && c.id === ce.id }, c.nom + (c.entiteLib ? ' — ' + c.entiteLib : ''))));
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Nom du candidat…', value: recherche, 'data-geo': 'aucun', oninput: (e) => { recherche = e.target.value; dessinerTable(); } });
    const btn = (l, f, kind, attr) => h('button', { class: 'btn ' + (kind || ''), type: 'button', 'data-eb': attr, onclick: f }, l);
    const peutCreer = au && peut(au.niveau, au.cle) || ['ZONE', 'CS', 'DDEMP'].some(n => (cx.entites[n] || []).some(e => peut(n, e.cle)));
    racine.append(h('div', { class: 'eb-barre' }, h('label', {}, 'Centre', selC), h('label', {}, 'Recherche', q)),
      h('div', { class: 'eb-barre' },
        w ? btn(I('ajouter') + 'Candidat', () => formCandidat(), 'primary', 'ajouter') : null,
        w ? btn(I('importer') + 'Importer des candidats (Excel)', importer, '', 'importer') : null,
        w ? btn(I('presse-papiers') + 'Depuis la liste du CEP', depuisCep, '', 'depuis-cep') : null,
        ce ? btn(I('graphique') + 'Excel', exporter, '', 'excel') : null,
        w ? btn(I('reglages') + 'Régler le centre', () => formCentre(ce), '', 'regler') : null,
        peutCreer ? btn(I('ajouter') + 'Ajouter un centre', () => formCentre(null), '', 'ajouter-centre') : null,
        ce ? btn(I('document') + 'PV du centre', () => DOCS.PV(ce), '', 'pv') : null,
        ce ? btn(I('fiche') + 'Relevé de notes du centre', () => DOCS.RELEVE(ce), '', 'releve') : null,
        visibles().length ? btn(I('imprimer') + 'Résultats (tous les centres)', () => DOCS.RESULTATS(), '', 'resultats') : null));
    if (!ce) { racine.append(h('p', { class: 'hint' }, 'Aucun centre : utilisez « Ajouter un centre ».')); return; }
    const b = E().bilan(candidatsDe(ce.id));
    racine.append(h('div', { class: 'eb-kpis', 'data-eb': 'resume' }, carte(b.inscrits, 'Inscrits (' + b.g.inscrits + ' G / ' + b.f.inscrits + ' F)'), carte(b.composes, 'Ont composé'), carte(b.admis, 'Ont atteint le seuil'), carte(pc(b.taux), 'Taux de réussite'), carte(b.moyenneCentre === null ? '—' : b.moyenneCentre, 'Moyenne du centre')));
    const zt = h('div'); racine.append(zt);
    function dessinerTable() {
      const bb = E().bilan(candidatsDe(ce.id)), l = bb.classes.filter(x => !recherche || norm(x.candidat.nom).includes(norm(recherche))).sort((a, c) => (a.rang || 9999) - (c.rang || 9999));
      zt.replaceChildren(h('div', { class: 'eb-tw' }, h('table', { class: 'eb-t', 'data-eb': 'table' }, h('thead', {}, h('tr', {}, ['Rang', 'Nom et prénoms', 'Sexe', 'École de provenance'].concat(E().MATIERES.map(m => m.abrege), ['Total', 'Moyenne', 'Maîtrises', 'Seuil', '']).map(t => h('th', {}, t)))),
        h('tbody', {}, l.length ? l.map(x => h('tr', { 'data-id': x.candidat.id }, h('td', {}, h('b', String(x.rang || '—'))), h('td', {}, x.candidat.nom), h('td', {}, x.candidat.sexe || '—'), h('td', {}, x.candidat.ecoleNom || ecoleLib(x.candidat.ecoleId)),
          x.notes.map(n => h('td', { class: 'n' + (n !== null && n < E().SEUIL_MATIERE ? ' bas' : '') }, n === null ? '—' : String(n))), h('td', { class: 'n' }, h('b', x.aCompose ? String(x.total) : '—')), h('td', { class: 'n' }, x.moyenne === null ? '—' : String(x.moyenne)),
          h('td', { class: 'n' }, x.aCompose ? x.maitrises + ' / ' + x.composees : '—'), h('td', {}, h('span', { class: 'eb-badge ' + (!x.aCompose ? 'abs' : x.admis ? 'ok' : 'ko') }, !x.aCompose ? 'absent' : x.admis ? 'atteint' : 'non atteint')),
          h('td', { style: { whiteSpace: 'nowrap' } }, w ? h('button', { class: 'btn small', title: 'Modifier', 'data-eb': 'modifier', onclick: () => formCandidat(x.candidat) }, I('modifier')) : null,
            w ? h('button', { class: 'btn small danger', title: 'Retirer', 'data-eb': 'supprimer', onclick: async () => { if (!(await confirmBox('Retirer ' + x.candidat.nom + ' ?', 'Retirer', true))) return; etat.candidats = etat.candidats.filter(y => y.id !== x.candidat.id); await sauver(); dessiner(); } }, I('supprimer')) : null)))
          : h('tr', {}, h('td', { colspan: E().MATIERES.length + 9 }, 'Aucun candidat dans ce centre.'))))));
    }
    dessinerTable();
    racine.append(h('div', { class: 'eb-grille' },
      h('div', { class: 'card' }, h('h3', 'Résultats par épreuve'), h('div', { class: 'eb-tw' }, h('table', { class: 'eb-t', 'data-eb': 'matieres' }, h('thead', {}, h('tr', {}, ['Épreuve', 'Composé', 'Moyenne', 'Maîtrises', 'Taux', 'Écart type'].map(t => h('th', {}, t)))),
        h('tbody', {}, b.matieres.length ? b.matieres.map(m => h('tr', {}, h('td', {}, m.matiere.libelle), h('td', { class: 'n' }, String(m.notes)), h('td', { class: 'n' }, m.moyenne === null ? '—' : m.moyenne + '/20'), h('td', { class: 'n' }, String(m.maitrises)), h('td', { class: 'n' }, pc(m.taux)), h('td', { class: 'n' }, String(m.ecartType))))
          : h('tr', {}, h('td', { colspan: 6 }, 'Aucune note saisie.'))))),
        b.fortes.length ? h('p', { class: 'hint' }, 'Épreuves fortes : ' + b.fortes.map(m => m.matiere.libelle).join(', ') + ' — faibles : ' + b.faibles.map(m => m.matiere.libelle).join(', ') + '.') : null),
      h('div', { class: 'card' }, h('h3', 'Recommandations'), h('ul', { 'data-eb': 'recommandations' }, E().recommandations(b).map(r => h('li', {}, r))))));
    let t = [0, 0, 0, 0];
    const rows = visibles().map(c => { const x = E().bilan(candidatsDe(c.id)), nb = new Set(candidatsDe(c.id).map(y => y.ecoleNom || ecoleLib(y.ecoleId)).filter(Boolean)).size; t = [t[0] + x.g.inscrits, t[1] + x.f.inscrits, t[2] + x.composes, t[3] + x.admis];
      return h('tr', {}, h('td', {}, c.nom), h('td', { class: 'n' }, String(nb)), h('td', { class: 'n' }, String(x.g.inscrits)), h('td', { class: 'n' }, String(x.f.inscrits)), h('td', { class: 'n' }, String(x.inscrits)), h('td', { class: 'n' }, String(x.composes)), h('td', { class: 'n' }, String(x.admis)),
        h('td', { class: 'n' }, pc(x.g.taux)), h('td', { class: 'n' }, pc(x.f.taux)), h('td', { class: 'n' }, pc(x.taux)), h('td', { class: 'n' }, x.moyenneCentre === null ? '—' : String(x.moyenneCentre)), h('td', { class: 'n' }, String(x.ecartTypeMoyennes))); });
    racine.append(h('h3', 'Synthèse des centres'), h('div', { class: 'eb-tw' }, h('table', { class: 'eb-t', 'data-eb': 'centres' }, h('thead', {}, h('tr', {}, ['Centre', 'Écoles', 'Inscrits G', 'Inscrits F', 'Inscrits', 'Ont composé', 'Ont atteint le seuil', 'Taux G', 'Taux F', 'Taux', 'Moyenne', 'Écart type'].map(x => h('th', {}, x)))),
      h('tbody', {}, rows, h('tr', { class: 'tot' }, h('td', {}, 'Ensemble'), h('td', {}, '—'), h('td', { class: 'n' }, String(t[0])), h('td', { class: 'n' }, String(t[1])), h('td', { class: 'n' }, String(t[0] + t[1])), h('td', { class: 'n' }, String(t[2])), h('td', { class: 'n' }, String(t[3])), h('td', {}, '—'), h('td', {}, '—'), h('td', { class: 'n' }, t[2] ? Math.round(t[3] / t[2] * 1000) / 10 + ' %' : '—'), h('td', {}, '—'), h('td', {}, '—'))))));
  }
  dessiner();
  ctx.actions && ctx.actions([]);
}
