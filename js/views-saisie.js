/* République du Bénin — MEMP — Vue : saisie manuelle (sans Excel)
   Tout remplir à la main, sans importer de fichier Excel : les fiches de collecte de chaque école (rentrée et fin
   d'année, EM et EP), l'état nominatif du personnel de chaque école (directeur, adjoints, enseignants, personnel
   administratif et de soutien), le personnel de la circonscription et les directeurs de toutes les écoles.
   Conception : Maître Aimé FACHE */
import { h, uid, nowISO, toast, norm, currentSchoolYear } from './util.js';
import { db } from './db.js';
import { badge } from './ui.js';
import { scoped, inScope, addLog, ficheOf, cleGroupe, libGroupe, ordreGroupe, modeGroupeDefaut } from './data.js';
import { FICHE_TYPES, prefill, sectionsFor } from './schema.js';
import { completion } from './workflow.js';
import { CATEGORIES } from './carriere.js';

export async function render(id, ctx) { return saisie(ctx); }

/** Fonctions proposées : enseignants, encadrement et personnel administratif / de soutien. */
export const FONCTIONS_SAISIE = ['Directeur / directrice', 'Adjoint(e)', 'Enseignant(e)', 'Conseiller pédagogique', 'Chef de circonscription scolaire',
  'Secrétaire', 'Comptable / gestionnaire', 'Agent de saisie / informaticien', 'Agent de liaison / planton', 'Gardien', 'Chauffeur', 'Agent d\'entretien', 'Cuisinier(ère) de cantine', 'Autre'];
const COLONNES = [
  { k: 'nom', l: 'Nom', w: 120 }, { k: 'prenoms', l: 'Prénoms', w: 140 }, { k: 'sexe', l: 'Sexe', t: 'select', options: [['M', 'M'], ['F', 'F']], w: 60 },
  { k: 'fonction', l: 'Fonction', t: 'select', options: FONCTIONS_SAISIE.map(x => [x, x]), w: 170 },
  { k: 'statut', l: 'Catégorie', t: 'select', options: CATEGORIES.map(c => [c.v, c.l]), w: 110 }, { k: 'grade', l: 'Grade', w: 80 },
  { k: 'matricule', l: 'Matricule', w: 100 }, { k: 'telephone', l: 'Téléphone', w: 110 },
  { k: 'date_naissance', l: 'Date de naissance', t: 'date', w: 130 }, { k: 'date_prise_service', l: '1re prise de service', t: 'date', w: 130 },
  { k: 'date_service_ecole', l: "Prise de service à l'école", t: 'date', w: 130 }, { k: 'cours_tenus', l: 'Cours tenu(s)', w: 90 },
];
const KINDS = (s) => s.cycle === 'Maternelle' ? ['EM_RENTREE', 'EM_FIN'] : ['EP_RENTREE', 'EP_FIN'];
const rc = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x !== null && x !== undefined && x !== false));
const estDirecteur = (f) => norm(f || '').startsWith('direct');

async function saisie(ctx) {
  const u = ctx.user;
  ctx.title('Saisie manuelle (sans Excel)', 'Remplir à la main les fiches des écoles, le personnel (enseignants, administratifs) et les directeurs — sans importer de fichier Excel');
  const zonesRef = (await db.all('ref')).filter(r => r.type === 'zone');
  const mode = u.role === 'CP' ? 'zone' : ((await db.setting('groupe-mode')) || modeGroupeDefaut(u));
  let onglet = (await db.setting('saisie-onglet')) || 'fiches', annee = currentSchoolYear(), ecoleId = (await db.setting('saisie-ecole')) || '';
  const tabs = h('div', { class: 'tabs no-print' }), holder = h('div');
  ctx.el.append(tabs, holder);
  const ONGLETS = [['fiches', '📝 Fiches des écoles'], ['personnel', "👩‍🏫 Personnel d'une école"], ['structure', '🗂️ Personnel de la circonscription'], ['directeurs', '🏫 Directeurs des écoles']];
  const nomGroupe = (s) => libGroupe(cleGroupe(s, mode), zonesRef, mode, 'Sans zone');
  let schools = [];

  async function draw() {
    schools = (await scoped('schools', u)).sort((a, b) => ordreGroupe(cleGroupe(a, mode), cleGroupe(b, mode)) || a.nom.localeCompare(b.nom, 'fr'));
    rc(tabs, ONGLETS.map(([k, l]) => h('button', { class: 'tab' + (k === onglet ? ' on' : ''), onclick: () => { onglet = k; db.setting('saisie-onglet', k); draw(); } }, l)));
    ctx.actions([]);
    if (onglet === 'fiches') return vueFiches();
    if (onglet === 'personnel') return vuePersonnel(false);
    if (onglet === 'structure') return vuePersonnel(true);
    return vueDirecteurs();
  }

  /* ---------- 1. fiches de collecte : créer si besoin, puis remplir à l'écran ---------- */
  async function vueFiches() {
    const fiches = await scoped('fiches', u);
    const years = [...new Set([currentSchoolYear(), ...fiches.map(f => f.annee)])].sort().reverse();
    const selA = h('select', { class: 'search', style: { maxWidth: '160px' }, 'aria-label': 'Année scolaire', onchange: (e) => { annee = e.target.value; vueFiches(); } }, years.map(y => h('option', { value: y, selected: y === annee }, y)));
    const cell = (s, k) => {
      const f = fiches.find(x => x.schoolId === s.id && x.kind === k && x.annee === annee);
      return h('td', { style: { whiteSpace: 'nowrap' } }, f ? [badge(f.statut), ' ', h('span', { class: 'muted' }, completion(f) + ' %'), ' '] : h('span', { class: 'muted' }, 'à créer '),
        h('button', { class: 'btn sm' + (f ? '' : ' primary'), onclick: () => remplir(s, k, f) }, f ? '✏️ Remplir' : '➕ Créer et remplir'));
    };
    const lignes = schools.map(s => h('tr', h('td', h('strong', s.nom), h('div', { class: 'muted' }, nomGroupe(s) + (s.directeur ? ' · ' + s.directeur : ''))), h('td', s.cycle === 'Maternelle' ? 'EM' : 'EP'), h('td', s.secteur || ''),
      h('td', h('button', { class: 'btn sm', onclick: () => ctx.go(`recfiche/${s.id}/${s.cycle === 'Maternelle' ? 'maternelle' : 'primaire'}/${annee}`) }, '🗂️ Remplir')), KINDS(s).map(k => cell(s, k))));
    rc(holder, h('div', { class: 'card', style: { marginBottom: '10px' } },
      h('p', { style: { margin: 0 } }, 'Chaque fiche se remplit directement à l\'écran (mêmes rubriques, mêmes calculs, même PDF que la fiche officielle). Les fiches inexistantes sont créées pré-remplies avec l\'identification de l\'école.'),
      h('div', { style: { marginTop: '8px' } }, h('label', h('span', { class: 'muted' }, 'Année scolaire : '), selA))),
      schools.length ? h('div', { class: 'gridwrap' }, h('table', { class: 'g' }, h('thead', h('tr', h('th', 'École'), h('th', 'Cycle'), h('th', 'Secteur'), h('th', 'Fiche de recensement'), h('th', 'Fiche de rentrée'), h('th', "Fiche de fin d'année"))), h('tbody', lignes)))
        : h('p', { class: 'muted' }, 'Aucune école dans votre périmètre : ajoutez d\'abord les écoles (menu « Écoles », bouton « Ajouter »).'));
    ctx.status(`${schools.length} école(s) — année ${annee}`);
  }
  async function remplir(s, k, f) {
    if (!f) {
      const ps = sectionsFor(k).find(x => x.type === 'personnel'), stat = (s) => s === 'Privé' ? 'PRIVE' : s === 'ACDPCTD' ? 'Autre' : s || '';
      const enseignants = (await db.all('personnel')).filter(p => p.schoolId === s.id && /^(direct|adjoint|enseign)/.test(norm(p.fonction || '')))
        .sort((a, b) => estDirecteur(b.fonction) - estDirecteur(a.fonction));
      const perso = enseignants.map(p => ({ matricule: p.matricule || '', nom: `${p.nom || ''} ${p.prenoms || ''}`.trim(), sexe: p.sexe || '', naiss: (p.date_naissance || '').slice(0, 4),
        grade: p.grade || '', statut: stat(p.statut), fonction: estDirecteur(p.fonction) ? ps.firstFonction : ps.otherFonction }));
      while (perso.length < ps.minRows) perso.push({ fonction: perso.length === 0 ? ps.firstFonction : ps.otherFonction });
      f = ficheOf(k, s, annee, prefill(k, s), perso);
      await db.put('fiches', f); await addLog(u, { action: 'Création de fiche (saisie manuelle)', target: `${s.nom} — ${FICHE_TYPES[k].court} ${annee}` });
    }
    ctx.go('fiche/' + f.id);
  }

  /* ---------- 2 et 3. état nominatif du personnel : une école, ou la circonscription elle-même ---------- */
  async function vuePersonnel(structure) {
    if (!structure && !schools.length) { rc(holder, h('p', { class: 'muted' }, 'Aucune école dans votre périmètre : ajoutez d\'abord les écoles.')); return; }
    if (!structure && !schools.some(s => s.id === ecoleId)) ecoleId = schools[0].id;
    const ecole = structure ? null : schools.find(s => s.id === ecoleId);
    const tous = await db.all('personnel');
    const miens = tous.filter(p => structure ? (!p.schoolId && (u.role === 'ADMIN' || inScope(u, p) || p.codeCs === u.codeCs)) : p.schoolId === ecoleId)
      .sort((a, b) => (estDirecteur(b.fonction) - estDirecteur(a.fonction)) || (a.nom || '').localeCompare(b.nom || '', 'fr'));
    let lignes = miens.map(p => ({ ...p }));
    if (!lignes.length) lignes = structure ? [{ fonction: 'Secrétaire' }, { fonction: 'Secrétaire' }] : [{ fonction: 'Directeur / directrice', statut: ecole.secteur === 'Privé' ? 'Privé' : '' }, { fonction: 'Adjoint(e)' }, { fonction: 'Adjoint(e)' }];
    const sel = structure ? null : h('select', { class: 'search', style: { maxWidth: '360px' }, 'aria-label': 'École', onchange: (e) => { ecoleId = e.target.value; db.setting('saisie-ecole', ecoleId); vuePersonnel(false); } },
      schools.map(s => h('option', { value: s.id, selected: s.id === ecoleId }, `${s.nom} (${nomGroupe(s)})`)));
    const body = h('tbody');
    const champ = (p, c) => {
      const set = (e) => { p[c.k] = e.target.value; };
      if (c.t === 'select') return h('select', { onchange: set, 'aria-label': c.l }, h('option', { value: '' }, '—'), c.options.map(([v, l]) => h('option', { value: v, selected: p[c.k] === v }, l)),
        p[c.k] && !c.options.some(([v]) => v === p[c.k]) ? h('option', { value: p[c.k], selected: true }, p[c.k]) : null);
      return h('input', { type: c.t || 'text', value: p[c.k] || '', oninput: set, 'aria-label': c.l, style: { width: '100%' } });
    };
    const dessiner = () => rc(body, lignes.map((p, i) => h('tr', h('td', { class: 'n' }, String(i + 1).padStart(2, '0')), COLONNES.map(c => h('td', champ(p, c))),
      h('td', h('button', { class: 'icon-btn', title: 'Retirer la ligne', onclick: () => { lignes.splice(i, 1); dessiner(); } }, '🗑')))));
    dessiner();
    async function enregistrer() {
      const garder = lignes.filter(p => (p.nom || '').trim());
      for (const p of garder) if (!p.fonction) return toast(`Indiquez la fonction de ${p.nom}.`, 'warn');
      if (!structure && garder.filter(p => estDirecteur(p.fonction)).length > 1) return toast('Une école n\'a qu\'un directeur ou une directrice.', 'warn');
      const ids = new Set(garder.filter(p => p.id).map(p => p.id));
      const out = garder.map(p => {
        const o = { ...p, nom: p.nom.trim().toUpperCase(), prenoms: (p.prenoms || '').trim(), id: p.id || uid(), created: p.created || nowISO(), updated: nowISO() };
        if (ecole) Object.assign(o, { schoolId: ecole.id, ecole: ecole.nom, codeZone: ecole.codeZone || '', numZone: ecole.numZone || '', codeCs: ecole.codeCs || '', arrondissement: ecole.arrondissement || '', departement: ecole.departement || '' });
        else Object.assign(o, { schoolId: '', ecole: u.nomCs ? 'Circonscription scolaire de ' + u.nomCs : 'Circonscription scolaire', codeZone: '', numZone: '', arrondissement: '', codeCs: o.codeCs || u.codeCs || '', departement: o.departement || u.departement || '' });
        return o;
      });
      await db.putMany('personnel', out);
      const retires = miens.filter(p => !ids.has(p.id));
      for (const p of retires) await db.del('personnel', p.id);
      if (ecole) {
        const d = out.find(p => estDirecteur(p.fonction));
        if (d) { const nomD = `${d.nom} ${d.prenoms}`.trim(); if (ecole.directeur !== nomD || (d.telephone && ecole.contact !== d.telephone)) await db.put('schools', { ...ecole, directeur: nomD, contact: d.telephone || ecole.contact || '', updated: nowISO() }); }
      }
      await addLog(u, { action: 'Saisie du personnel', target: `${ecole ? ecole.nom : 'Circonscription'} : ${out.length} agent(s)${retires.length ? `, ${retires.length} retiré(s)` : ''}` });
      toast(`État nominatif enregistré : ${out.length} agent(s).`); vuePersonnel(structure);
    }
    rc(holder, h('div', { class: 'card', style: { marginBottom: '10px' } },
      h('p', { style: { margin: 0 } }, structure ? 'Personnel de la circonscription (CCS, CP, secrétaires, comptables, agents de saisie, plantons, gardiens, chauffeurs…) : agents sans école d\'affectation.'
        : 'Une ligne par agent : directeur ou directrice, adjoints, enseignants, personnel administratif et de soutien de l\'école. La fonction « Directeur / directrice » met aussi à jour le directeur de l\'école.'),
      sel ? h('div', { style: { marginTop: '8px' } }, h('label', h('span', { class: 'muted' }, 'École : '), sel)) : null),
      h('div', { class: 'gridwrap' }, h('table', { class: 'g p' }, h('thead', h('tr', h('th', 'N°'), COLONNES.map(c => h('th', { style: { minWidth: c.w + 'px' } }, c.l)), h('th', ''))), body)),
      h('p', { class: 'no-print', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn', onclick: () => { lignes.push({ fonction: structure ? 'Secrétaire' : 'Adjoint(e)' }); dessiner(); } }, '➕ Ajouter une ligne'),
        h('button', { class: 'btn primary', onclick: enregistrer }, "💾 Enregistrer l'état nominatif")),
      h('p', { class: 'notes' }, 'Seules les lignes avec un nom sont enregistrées. Les dates servent au calcul des anciennetés et du départ à la retraite (menu « Gestion de carrière »). Les autres renseignements (diplômes, indices, visites…) se complètent dans « Personnel enseignant » → « Modifier ».'));
    ctx.actions([{ label: "💾 Enregistrer l'état nominatif", kind: 'primary', onClick: enregistrer }]);
    ctx.status(`${structure ? 'Circonscription' : ecole.nom} — ${miens.length} agent(s) enregistré(s)`);
  }

  /* ---------- 4. directeurs et contacts de toutes les écoles ---------- */
  async function vueDirecteurs() {
    const val = new Map(schools.map(s => [s.id, { directeur: s.directeur || '', contact: s.contact || '' }]));
    const creerAgent = h('input', { type: 'checkbox', checked: true });
    const lignes = schools.map(s => h('tr', h('td', h('strong', s.nom), h('div', { class: 'muted' }, nomGroupe(s))), h('td', s.cycle === 'Maternelle' ? 'EM' : 'EP'),
      h('td', h('input', { value: s.directeur || '', placeholder: 'NOM Prénoms', style: { width: '100%' }, 'aria-label': 'Directeur de ' + s.nom, oninput: (e) => { val.get(s.id).directeur = e.target.value; } })),
      h('td', h('input', { type: 'tel', value: s.contact || '', style: { width: '100%' }, 'aria-label': 'Contact de ' + s.nom, oninput: (e) => { val.get(s.id).contact = e.target.value; } }))));
    async function enregistrer() {
      const tous = await db.all('personnel'); const maj = [], agents = [], anciens = [];
      for (const s of schools) {
        const v = val.get(s.id), d = v.directeur.trim().replace(/\s+/g, ' '), c = v.contact.trim();
        if (d === (s.directeur || '') && c === (s.contact || '')) continue;
        maj.push({ ...s, directeur: d, contact: c, updated: nowISO() });
        if (d && creerAgent.checked) {
          const ex = tous.find(p => p.schoolId === s.id && estDirecteur(p.fonction));
          const [nom, ...pr] = d.split(' ');
          const meme = ex && norm(`${ex.nom || ''} ${ex.prenoms || ''}`) === norm(d);
          if (meme) { agents.push({ ...ex, telephone: c || ex.telephone || '', updated: nowISO() }); continue; }
          if (ex) { agents.push({ ...ex, fonction: 'Adjoint(e)', updated: nowISO() }); anciens.push(`${ex.nom} ${ex.prenoms || ''}`.trim() + ' (' + s.nom + ')'); }
          agents.push({ id: uid(), created: nowISO(), nom: nom.toUpperCase(), prenoms: pr.join(' '), fonction: 'Directeur / directrice', telephone: c, statut: s.secteur === 'Privé' ? 'Privé' : '',
            schoolId: s.id, ecole: s.nom, codeZone: s.codeZone || '', numZone: s.numZone || '', codeCs: s.codeCs || '', arrondissement: s.arrondissement || '', departement: s.departement || '' });
        }
      }
      if (!maj.length) return toast('Aucun changement.');
      await db.putMany('schools', maj); if (agents.length) await db.putMany('personnel', agents);
      await addLog(u, { action: 'Saisie des directeurs', target: `${maj.length} école(s)` });
      toast(`${maj.length} école(s) mise(s) à jour${agents.length ? `, ${agents.length} fiche(s) agent` : ''}.`
        + (anciens.length ? ` Ancien(s) directeur(s) passé(s) adjoint(s) : ${anciens.join(', ')} — à retirer dans « Personnel d'une école » s'il(s) a/ont quitté l'école.` : ''), anciens.length ? 'warn' : 'ok', anciens.length ? 9000 : 3500); draw();
    }
    rc(holder, h('div', { class: 'card', style: { marginBottom: '10px' } },
      h('p', { style: { margin: 0 } }, 'Le nom et le contact du directeur ou de la directrice de chaque école, en un seul tableau. Ils sont repris dans les fiches, les listes, les messages WhatsApp et les documents.'),
      h('label', { class: 'chk', style: { marginTop: '8px', display: 'inline-flex', gap: '6px' } }, creerAgent, 'Créer / mettre à jour aussi la fiche agent du directeur (personnel, gestion de carrière)')),
      schools.length ? h('div', { class: 'gridwrap' }, h('table', { class: 'g' }, h('thead', h('tr', h('th', 'École'), h('th', 'Cycle'), h('th', { style: { minWidth: '240px' } }, 'Directeur / directrice'), h('th', { style: { minWidth: '140px' } }, 'Contact'))), h('tbody', lignes)))
        : h('p', { class: 'muted' }, 'Aucune école dans votre périmètre.'),
      h('p', { class: 'no-print' }, h('button', { class: 'btn primary', onclick: enregistrer }, '💾 Enregistrer les directeurs')));
    ctx.actions([{ label: '💾 Enregistrer les directeurs', kind: 'primary', onClick: enregistrer }]);
    ctx.status(`${schools.length} école(s) — ${schools.filter(s => s.directeur).length} directeur(s) renseigné(s)`);
  }

  await draw();
}
