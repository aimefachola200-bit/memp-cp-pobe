/* République du Bénin — MEMP — Zones pédagogiques et unités pédagogiques de la circonscription
   Zone → unités pédagogiques (RUP, co-RUP, écoles) → écoles (personnel par statut, effectifs G/F/T).
   \uE006 Modifier · \uE005 Supprimer · \uE001 Ajouter · \uE058 Réinitialiser (valeurs du fichier de la CS : une UP, les effectifs d'une école,
   une zone ou tout) · rubriques « Écoles en attente d'UP » et « Écoles ne fonctionnant plus » · Excel, PDF, impression.
   Zone d'appartenance (codeZone) et zone de l'UP (codeZoneUp, zone des activités pédagogiques) sont distinctes : une école d'une
   zone peut suivre les activités d'une UP d'une autre zone. Les UP sont celles du tableau synoptique du CP.
   Conception : Maître Aimé FACHOLA */
import { h, toast, download, confirmBox, modal, norm, currentSchoolYear } from './util.js';
import { db } from './db.js';
import { formDialog } from './ui.js';
import { scoped, addLog } from './data.js';
import { listToXlsx, listToPdf } from './export.js';
import * as E from './effectifs-schema.js';
import { officiel, upsDeZone, enregistrerUps, appliquer, ecoleDansUp, memeUp, zoneUp, RUBRIQUES } from './officiel-cs.js';

export async function render(id, ctx) { return zonesUp(ctx); }

const ROLES_EDIT = ['ADMIN', 'CCS', 'DOSP'];
const STATUTS = ['FE', 'ACDPE', 'AME', 'Autres'];
const ENSEIGNANT = /^(direct|adjoint|enseign|instit|educat)/;
const prive = (s) => /priv/i.test(s.secteur || '');
const cyc = (s) => (s.cycle === 'Maternelle' ? 'EM' : 'EP');

async function zonesUp(ctx) {
  const u = ctx.user, O = await officiel(), annee = currentSchoolYear();
  const zonesAll = (await db.all('ref')).filter(r => r.type === 'zone' && (!u.codeCs || r.cs === u.codeCs)).sort((a, b) => (+a.numero || 0) - (+b.numero || 0));
  const zones = u.role === 'CP' ? zonesAll.filter(z => z.code === u.codeZone) : zonesAll;
  let zone = (await db.setting('zonesup-zone')) || (u.role === 'CP' ? u.codeZone : 'tout');
  const SPECIAUX = ['tout', 'attente', 'fermees'];
  if (!SPECIAUX.includes(zone) && !zones.some(z => z.code === zone)) zone = zones[0]?.code || 'tout';
  if (u.role === 'CP' && SPECIAUX.includes(zone)) zone = u.codeZone;
  const peut = (code) => ROLES_EDIT.includes(u.role) || (u.role === 'CP' && u.codeZone === code);
  const zbar = h('div', { class: 'tabs no-print' }), holder = h('div', { class: 'zu' }); ctx.el.append(zbar, holder);
  let schools = [], fermees = [], effs = new Map(), perso = [], UPS = {};

  async function charger() {
    const tous = (await scoped('schools', u, { inactives: true })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    schools = tous.filter(s => s.rubrique !== 'ne_fonctionne_plus'); fermees = tous.filter(s => s.rubrique === 'ne_fonctionne_plus');
    const recs = (await scoped('effectifs', u)).filter(r => r.annee === annee);
    effs = new Map(recs.map(r => [r.schoolId, r]));
    perso = await scoped('personnel', u);
    UPS = {}; for (const z of zones) UPS[z.code] = await upsDeZone(z.code);
  }
  const zoneNom = (code) => { const z = zonesAll.find(x => x.code === code); return z ? (z.nom || 'Zone ' + z.numero) : code ? 'Zone ' + code.split('-ZP').pop() : '—'; };
  const eleves = (s) => { const r = effs.get(s.id); if (!r || !E.hasData(r.data)) return null; const S = E.schemaOf(s.cycle), m = E.metrics(S, E.computeValues(S, r.data)); return { G: m.G || 0, F: m.F || 0, T: m.T || 0, rec: r }; };
  /** Personnel par statut : agents enregistrés de l'école, sinon les nombres du fichier de la CS */
  const personnel = (s) => {
    const ag = perso.filter(p => p.schoolId === s.id && ENSEIGNANT.test(norm(p.fonction || '')));
    if (ag.length) { const o = { FE: 0, ACDPE: 0, AME: 0, Autres: 0 }; for (const p of ag) { const k = p.statut === 'FE' ? 'FE' : p.statut === 'ACDPE' ? 'ACDPE' : /AME|ACDPCTD/.test(p.statut || '') ? 'AME' : 'Autres'; o[k]++; } return { ...o, total: ag.length, src: 'agents' }; }
    if (s.personnelFichier) return { ...s.personnelFichier, src: 'fichier' };
    return null;
  };
  const ecolesZone = (code) => schools.filter(s => s.codeZone === code);          // zone d'appartenance
  const ecolesUpZone = (code) => schools.filter(s => zoneUp(s) === code);         // écoles suivant les activités des UP de la zone
  const enAttente = () => schools.filter(s => !s.up);
  const autreZone = (s) => s.up && s.codeZone && zoneUp(s) !== s.codeZone;
  /** Recalcule « Écoles membres » de chaque UP à partir du rattachement des écoles (UP + zone de l'UP) */
  async function resync(code) {
    const liste = UPS[code] || [];
    for (const x of liste) x.ecoles = ecolesUpZone(code).filter(s => ecoleDansUp(s, x)).map(s => s.nom).join(', ');
    await enregistrerUps(code, liste);
  }
  const avecUp = (s, code, up) => ({ ...s, up, codeZoneUp: up ? code : '', numZoneUp: up ? String((zonesAll.find(z => z.code === code) || {}).numero || '') : '', rubrique: up ? (s.rubrique === 'en_attente_up' ? '' : s.rubrique || '') : (s.rubrique || 'en_attente_up') });

  function totaux(list) {
    const t = { ec: list.length, ep: 0, em: 0, pub: 0, prv: 0, G: 0, F: 0, T: 0, ens: 0, FE: 0, ACDPE: 0, AME: 0, Autres: 0 };
    for (const s of list) { s.cycle === 'Maternelle' ? t.em++ : t.ep++; prive(s) ? t.prv++ : t.pub++; const e = eleves(s); if (e) { t.G += e.G; t.F += e.F; t.T += e.T; } const p = personnel(s); if (p) { t.ens += p.total || 0; for (const k of STATUTS) t[k] += p[k] || 0; } }
    return t;
  }
  const stat = (n, l, c = '') => h('div', { class: 'stat ' + c }, h('b', String(n)), h('span', l));
  const btn = (txt, title, onclick, cls = 'sm') => h('button', { class: 'btn ' + cls + ' no-print', title, 'aria-label': title, onclick }, txt);

  /* ---------- UP : modifier / ajouter ---------- */
  async function editerUp(code, i) {
    const liste = UPS[code], x = i === null ? { up: '', cycle: 'Primaire' } : { ...liste[i] };
    const dedansUp = (s) => i !== null && zoneUp(s) === code && ecoleDansUp(s, x);
    const ec = [...ecolesZone(code), ...schools.filter(s => s.codeZone !== code && dedansUp(s))];
    const membres = new Set(ec.filter(dedansUp).map(s => s.id));
    const F = [{ k: 'up', l: "Nom de l'unité pédagogique", t: 'text', req: true, w: 'half' }, { k: 'cycle', l: 'Cycle', t: 'select', options: ['Primaire', 'Maternelle'], w: 'q' }, { k: 'numero', l: 'N°', t: 'number', w: 'q' },
      { k: 'rup', l: 'RUP (responsable)', t: 'text', w: 'half' }, { k: 'rup_tel', l: 'Contact du RUP', t: 'text', w: 'half' },
      { k: 'corup', l: 'Co-RUP (co-responsable)', t: 'text', w: 'half' }, { k: 'corup_tel', l: 'Contact du co-RUP', t: 'text', w: 'half' },
      { k: 'siege', l: 'École siège', t: 'text', w: 'half' }, { k: 'jour', l: 'Jour / périodicité des séances', t: 'text', w: 'half' },
      ...ec.map(s => ({ k: 'e:' + s.id, l: `${s.nom} (${cyc(s)}${prive(s) ? ' privée' : ''})${s.codeZone !== code ? ' — de la ' + zoneNom(s.codeZone) : ''}${s.up && !dedansUp(s) ? ' — UP actuelle : ' + s.up + (zoneUp(s) !== code ? ' (' + zoneNom(zoneUp(s)) + ')' : '') : ''}`, t: 'check', w: 'half' }))];
    const vals = { ...x, ...Object.fromEntries(ec.map(s => ['e:' + s.id, membres.has(s.id)])) };
    const v = await formDialog({ title: i === null ? `Nouvelle unité pédagogique — ${zoneNom(code)}` : `Modifier l'UP « ${x.up} »`, fields: F, values: vals, wide: true,
      validate: (w) => (liste.some((y, k) => k !== i && norm(y.up || '') === norm(w.up || '') && (y.cycle || 'Primaire') === (w.cycle || 'Primaire')) ? 'Une UP de ce cycle porte déjà ce nom dans cette zone.' : '') });
    if (!v) return;
    const fiche = { ...x, up: v.up.trim(), cycle: v.cycle || 'Primaire', numero: v.numero ? +v.numero : '', rup: v.rup || '', rup_tel: v.rup_tel || '', corup: v.corup || '', corup_tel: v.corup_tel || '', siege: v.siege || '', jour: v.jour || '' };
    if (i === null) liste.push(fiche); else liste[i] = fiche;
    await enregistrerUps(code, liste);
    const maj = [];
    const touchees = new Set([code]);
    for (const s of ec) {
      const coche = !!v['e:' + s.id], dedans = dedansUp(s);
      if (coche && (s.up !== fiche.up || zoneUp(s) !== code)) { if (s.up) touchees.add(zoneUp(s)); maj.push(avecUp(s, code, fiche.up)); }
      else if (!coche && dedans) maj.push(avecUp(s, code, ''));
    }
    if (maj.length) await db.putMany('schools', maj);
    await addLog(u, { action: i === null ? 'Ajout UP' : 'Modification UP', target: `${fiche.up} (${zoneNom(code)})` });
    await charger(); for (const c of touchees) if (UPS[c]) await resync(c); toast('Unité pédagogique enregistrée.'); draw();
  }
  async function supprimerUp(code, i) {
    const x = UPS[code][i];
    if (!(await confirmBox(`Supprimer l'unité pédagogique « ${x.up} » ? Ses écoles passent dans « Écoles en attente d'UP » (leur fiche n'est pas supprimée).`, 'Supprimer', true))) return;
    const maj = ecolesUpZone(code).filter(s => ecoleDansUp(s, x)).map(s => avecUp(s, code, ''));
    if (maj.length) await db.putMany('schools', maj);
    UPS[code].splice(i, 1); await enregistrerUps(code, UPS[code]);
    await addLog(u, { action: 'Suppression UP', target: `${x.up} (${zoneNom(code)})` });
    await charger(); toast('UP supprimée.'); draw();
  }
  async function reinitUp(code, i) {
    const x = UPS[code][i], o = O && O.ups.find(y => memeUp(x, y));
    if (!o) return toast("Cette UP n'est pas dans le document de la CS : rien à réinitialiser.", 'warn');
    const libre = o.ajoutee || !o.ecoleIds.length;   // UP ajoutée par la CS sans écoles (Agbarou) : les écoles rattachées à la main restent
    if (!(await confirmBox(`Remettre l'UP « ${x.up} » comme dans le document de la CS (nom, RUP, co-RUP${libre ? ' ; les écoles que vous y avez rattachées restent' : ', écoles : ' + o.ecoleIds.length}) ?`, '\uE058 Réinitialiser'))) return;
    await appliquer({ force: true, quoi: ['ups'], upIds: [o.id], user: u });
    if (libre) { await addLog(u, { action: 'Réinitialisation UP', target: o.up }); await charger(); await resync(code); toast('UP réinitialisée.'); return draw(); }
    const maj = schools.filter(s => o.ecoleIds.includes(s.id)).map(s => avecUp(s, o.codeZone, o.up));
    const sortent = ecolesUpZone(code).filter(s => ecoleDansUp(s, o) && !o.ecoleIds.includes(s.id)).map(s => avecUp(s, code, ''));
    await db.putMany('schools', [...maj, ...sortent]);
    await addLog(u, { action: 'Réinitialisation UP', target: o.up });
    await charger(); await resync(code); toast('UP réinitialisée.'); draw();
  }

  /* ---------- École : modifier / réinitialiser ---------- */
  async function editerEcole(s) {
    const upsOpt = zones.flatMap(z => (UPS[z.code] || []).map(x => ({ v: z.code + '|' + x.up, l: `${zoneNom(z.code)} — ${x.up}${x.cycle ? ' (' + (x.cycle === 'Maternelle' ? 'EM' : 'EP') + ')' : ''}` })));
    const p = s.personnelFichier || {};
    const F = [{ k: 'codeZone', l: "Zone d'appartenance", t: 'select', options: zones.map(z => ({ v: z.code, l: zoneNom(z.code) })), w: 'half' },
      { k: 'upz', l: 'Unité pédagogique (zone des activités)', t: 'select', options: upsOpt, w: 'half' },
      { k: 'anneeCreation', l: 'Année de création', t: 'text', w: 'q' }, { k: 'classesAutorisees', l: s.cycle === 'Maternelle' ? 'Sections autorisées' : 'Classes autorisées', t: 'number', w: 'q' },
      ...STATUTS.map(k => ({ k: 'p_' + k, l: `Personnel ${k}`, t: 'number', w: 'q' }))];
    const v = await formDialog({ title: `Modifier — ${s.nom}`, fields: F, wide: true,
      values: { codeZone: s.codeZone, upz: zoneUp(s) && s.up ? zoneUp(s) + '|' + s.up : '', anneeCreation: s.anneeCreation, classesAutorisees: s.classesAutorisees, ...Object.fromEntries(STATUTS.map(k => ['p_' + k, p[k] ?? ''])) } });
    if (!v) return;
    let codeZ = v.codeZone || '', up = '', codeU = '';
    if (v.upz) { const [zc, ...n] = v.upz.split('|'); up = n.join('|'); codeU = zc; if (!codeZ) codeZ = zc; }
    const z = zonesAll.find(x => x.code === codeZ);
    const pf = Object.fromEntries(STATUTS.map(k => [k, v['p_' + k] === '' || v['p_' + k] === undefined ? 0 : +v['p_' + k]]));
    const auMoinsUn = STATUTS.some(k => v['p_' + k] !== '' && v['p_' + k] !== undefined);
    const ns = { ...avecUp(s, codeU, up), codeZone: codeZ, numZone: z ? String(z.numero) : '', anneeCreation: v.anneeCreation || '', classesAutorisees: v.classesAutorisees === '' ? '' : +v.classesAutorisees,
      ...(auMoinsUn ? { personnelFichier: { ...pf, total: STATUTS.reduce((a, k) => a + pf[k], 0) } } : {}) };
    await db.put('schools', ns);
    await addLog(u, { action: 'Modification école (zone, UP, personnel)', target: s.nom });
    const touchees = [...new Set([zoneUp(s), codeU].filter(Boolean))];
    await charger(); for (const c of touchees) if (UPS[c]) await resync(c); toast('École enregistrée.'); draw();
  }
  async function reinitEcole(s) {
    const o = O && O.ecoles[s.id]; if (!o) return toast("Cette école n'est pas dans le fichier de la CS.", 'warn');
    const e = o.effectifs ? Object.entries(o.effectifs).reduce((a, [k, v]) => a + v, 0) : 0;
    if (!(await confirmBox(`Remettre « ${s.nom} » comme dans le fichier de la CS : ${zoneNom(o.codeZone)}, UP ${o.up || '—'}, personnel ${o.personnelFichier ? o.personnelFichier.total : '—'}, effectifs ${annee} : ${e || '—'} élèves ? Les autres renseignements de l'école ne changent pas.`, '\uE058 Réinitialiser'))) return;
    await appliquer({ force: true, quoi: ['ecoles', 'effectifs'], schoolIds: [s.id], user: u });
    await addLog(u, { action: 'Réinitialisation école (données de la CS)', target: s.nom });
    await charger(); for (const c of [...new Set([zoneUp(s), o.codeZoneUp, o.codeZone].filter(Boolean))]) if (UPS[c]) await resync(c); toast('École réinitialisée.'); draw();
  }
  async function fermer(s) {
    if (!(await confirmBox(`« ${s.nom} » ne fonctionne plus ? L'école reste enregistrée mais sort des listes, de la génération des fiches, des effectifs, des tableaux synoptiques et des totaux par zone et par UP. Elle pourra être remise en activité.`, '\uE036 Ne fonctionne plus', true))) return;
    await db.put('schools', { ...s, rubrique: 'ne_fonctionne_plus' }); await addLog(u, { action: 'École ne fonctionnant plus', target: s.nom });
    await charger(); if (s.up && UPS[zoneUp(s)]) await resync(zoneUp(s)); toast('École classée « ne fonctionnant plus ».'); draw();
  }
  async function rouvrir(s) {
    if (!(await confirmBox(`Remettre « ${s.nom} » en activité ? Elle revient dans les listes, les fiches et les totaux${s.up ? '' : ' (dans « Écoles en attente d\'UP » tant qu\'elle n\'a pas d\'UP)'}.`, '\uE004 Remettre en activité'))) return;
    await db.put('schools', { ...s, rubrique: s.up ? '' : 'en_attente_up' }); await addLog(u, { action: 'École remise en activité', target: s.nom });
    await charger(); if (s.up && UPS[zoneUp(s)]) await resync(zoneUp(s)); toast('École remise en activité.'); draw();
  }
  async function viderEffectifs(s) {
    const r = effs.get(s.id); if (!r) return;
    if (r.statut === 'Transmise' || r.statut === 'Validée') return toast(`La fiche d'effectifs est ${r.statut.toLowerCase()} : elle ne peut plus être supprimée ici.`, 'warn');
    if (!(await confirmBox(`Supprimer la fiche « Effectifs des apprenants » ${annee} de ${s.nom} ?`, 'Supprimer', true))) return;
    await db.del('effectifs', r.id); await addLog(u, { action: 'Suppression fiche effectifs', target: `${s.nom} (${annee})` });
    await charger(); toast('Fiche supprimée.'); draw();
  }
  async function toutReinitialiser(code = null) {
    if (!O) return;
    const corps = h('div', h('p', code ? `Remettre ${zoneNom(code)} comme dans les fichiers de la CS :` : 'Remettre toute la circonscription comme dans les fichiers de la CS :'));
    const choix = { ups: true, ecoles: true, effectifs: true };
    for (const [k, l] of [['ups', 'Unités pédagogiques (noms, RUP, co-RUP)'], ['ecoles', 'Zone, UP, année de création, classes autorisées et personnel des écoles'], ['effectifs', `Effectifs des apprenants ${O.annee} (fiches non transmises)`]])
      corps.append(h('label', { class: 'field check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { choix[k] = e.target.checked; } }), h('span', l)));
    corps.append(h('p', { class: 'notes' }, 'Les UP et écoles ajoutées à la main sont gardées, ainsi que les écoles rattachées à une UP que le fichier de la CS ne fixe pas (ex. Agbarou). Les rubriques (en attente d’UP, ne fonctionnant plus) reprennent celles du fichier. Les fiches d’effectifs transmises ou validées ne sont pas modifiées.'));
    modal({ title: '\uE058 Réinitialiser', body: corps, actions: [{ label: 'Annuler' }, { label: '\uE058 Réinitialiser', kind: 'danger', onClick: async () => {
      const quoi = ['zones', ...Object.keys(choix).filter(k => choix[k])];
      const r = await appliquer({ force: true, quoi, codeZone: code, user: u });
      await addLog(u, { action: 'Réinitialisation (données de la CS)', target: code ? zoneNom(code) : 'circonscription', comment: JSON.stringify(r) });
      await charger(); for (const z of zones) if (!code || z.code === code) await resync(z.code);
      toast(`Réinitialisé : ${r.ups} UP, ${r.ecoles + r.nouvelles} écoles, ${r.effectifs} fiches d'effectifs` + (r.ignores.length ? ` ; non modifiées : ${r.ignores.length}` : '') + '.', 'ok', 6000); draw();
    } }] });
  }

  /* ---------- affichage ---------- */
  function tableUps(code) {
    const liste = UPS[code] || [], ed = peut(code);
    const ec = ecolesUpZone(code);
    return h('div', { class: 'tbl-wrap', style: { maxHeight: 'none' } }, h('table', { class: 't' },
      h('thead', h('tr', ['N°', 'Cycle', 'Unité pédagogique', 'Arrondissement', 'RUP', 'Co-RUP', 'Écoles', 'Élèves G', 'Élèves F', 'Élèves T', ...(ed ? [''] : [])].map(t => h('th', t)))),
      h('tbody', liste.length ? liste.map((x, i) => {
        const membres = ec.filter(s => ecoleDansUp(s, x)), t = totaux(membres);
        return h('tr', h('td', { class: 'num' }, String(x.numero || '')), h('td', x.cycle === 'Maternelle' ? 'EM' : x.cycle ? 'EP' : ''), h('td', { class: 'zu-nom' }, h('b', x.up || '—')), h('td', { class: 'zu-nom' }, x.arrondissement || ''),
          h('td', { class: 'zu-pers' }, x.rup || h('span', { class: 'badge' }, 'à renseigner'), x.rup_tel ? h('small', ' · ' + x.rup_tel) : null), h('td', { class: 'zu-pers' }, x.corup || '—', x.corup_tel ? h('small', ' · ' + x.corup_tel) : null),
          h('td', { class: 'zu-liste' }, h('b', String(membres.length) + (membres.length ? ' : ' : '')), ...membres.flatMap((s, k) => [k ? ', ' : '', s.codeZone && s.codeZone !== code ? h('span', { class: 'zu-autre', title: `École de la ${zoneNom(s.codeZone)} : activités avec cette UP` }, s.nom + ' \uE03B') : s.nom])),
          h('td', { class: 'num' }, String(t.G)), h('td', { class: 'num' }, String(t.F)), h('td', { class: 'num' }, h('b', String(t.T))),
          ed ? h('td', { class: 'no-print', style: { whiteSpace: 'nowrap' } }, btn('\uE006', 'Modifier', () => editerUp(code, i)), btn('\uE005', 'Supprimer', () => supprimerUp(code, i)), O && x.officielle ? btn('\uE058', 'Réinitialiser (document de la CS)', () => reinitUp(code, i)) : null) : null);
      }) : h('tr', h('td', { colspan: 11, class: 'empty' }, 'Aucune unité pédagogique dans cette zone.')))));
  }
  function tableEcoles(list, avecZone = false, ferme = false) {
    const ed = list.some(s => peut(s.codeZone)) || ROLES_EDIT.includes(u.role);
    return h('div', { class: 'tbl-wrap', style: { maxHeight: 'none' } }, h('table', { class: 't' },
      h('thead', h('tr', ['École', 'Cycle', 'Statut', ...(avecZone ? ['Zone'] : []), 'UP', 'Création', 'Classes aut.', 'FE', 'ACDPE', 'AME', 'Autres', 'Personnel', 'Élèves G', 'Élèves F', 'Élèves T', ...(ed ? [''] : [])].map(t => h('th', t)))),
      h('tbody', list.length ? list.map(s => {
        const p = personnel(s), e = eleves(s);
        return h('tr', h('td', { class: 'zu-nom' }, h('b', s.nom)), h('td', cyc(s)), h('td', prive(s) ? 'Privé' : 'Public'), avecZone ? h('td', s.codeZone ? zoneNom(s.codeZone) : h('span', { class: 'badge corriger' }, 'sans zone')) : null,
          h('td', { class: 'zu-nom' }, s.up || (ferme ? '—' : h('span', { class: 'badge corriger' }, "en attente d'UP")), autreZone(s) ? h('div', { class: 'zu-autre' }, `activités avec l'UP ${s.up} (${zoneNom(zoneUp(s))})`) : null), h('td', { class: 'num' }, String(s.anneeCreation || '')), h('td', { class: 'num' }, String(s.classesAutorisees ?? '')),
          ...STATUTS.map(k => h('td', { class: 'num' }, p ? String(p[k] ?? 0) : '')), h('td', { class: 'num', title: p ? (p.src === 'agents' ? 'agents enregistrés' : 'fichier de la CS') : '' }, p ? h('b', String(p.total ?? '')) : ''),
          h('td', { class: 'num' }, e ? String(e.G) : ''), h('td', { class: 'num' }, e ? String(e.F) : ''), h('td', { class: 'num' }, e ? h('b', String(e.T)) : h('span', { class: 'badge' }, '—')),
          ed && ferme ? h('td', { class: 'no-print', style: { whiteSpace: 'nowrap' } }, btn('\uE004 Remettre en activité', 'Remettre en activité', () => rouvrir(s), 'sm')) :
          ed ? h('td', { class: 'no-print', style: { whiteSpace: 'nowrap' } }, btn('\uE006', 'Modifier (zone, UP, personnel)', () => editerEcole(s)),
            btn('\uE01F', 'Fiche des effectifs', () => ctx.go(e ? 'effectif/' + encodeURIComponent(e.rec.id) : 'effectifs')),
            O && O.ecoles[s.id] ? btn('\uE058', 'Réinitialiser (fichier de la CS)', () => reinitEcole(s)) : null,
            e ? btn('\uE005', 'Supprimer la fiche d’effectifs', () => viderEffectifs(s)) : null,
            btn('\uE036', 'Ne fonctionne plus', () => fermer(s))) : null);
      }) : h('tr', h('td', { colspan: 17, class: 'empty' }, 'Aucune école.')))));
  }
  function cartes(t, nbUp) {
    return h('div', { class: 'cards' }, stat(t.ec, `écoles (${t.ep} EP · ${t.em} EM)`), stat(t.pub + ' / ' + t.prv, 'publiques / privées'), stat(nbUp, 'unités pédagogiques'),
      stat(t.T, `élèves ${annee} (${t.G} G · ${t.F} F)`), stat(t.ens, `enseignants (FE ${t.FE} · ACDPE ${t.ACDPE} · AME ${t.AME} · autres ${t.Autres})`));
  }
  function draw() {
    ctx.title('Zones pédagogiques et unités pédagogiques', `${u.nomCs ? 'Circonscription scolaire de ' + u.nomCs : 'Circonscription'} — RUP, co-RUP, écoles, personnel et effectifs ${annee}`);
    const onglets = [...(u.role === 'CP' ? [] : [['tout', '\uE048 Toute la CS']]), ...zones.map(z => [z.code, zoneNom(z.code)]), ...(u.role === 'CP' ? [] : [['attente', `\uE02D ${RUBRIQUES.en_attente_up} (${enAttente().length})`], ['fermees', `\uE036 ${RUBRIQUES.ne_fonctionne_plus} (${fermees.length})`]])];
    zbar.replaceChildren(...onglets.map(([k, l]) => h('button', { class: 'tab' + (k === zone ? ' on' : ''), onclick: () => { zone = k; db.setting('zonesup-zone', k); draw(); } }, l)));
    const src = O ? h('p', { class: 'notes' }, `Données de départ : ${O.source}. Effectifs : ${O.noteEffectifs}. « \uE058 » remet ces valeurs ; vos modifications sont gardées tant que vous ne réinitialisez pas.`) : null;
    if (zone === 'tout') {
      const lignes = zones.map(z => { const l = ecolesZone(z.code), t = totaux(l); return { z, t, nbUp: (UPS[z.code] || []).length }; });
      const T = totaux(schools);
      holder.replaceChildren(cartes(T, lignes.reduce((a, x) => a + x.nbUp, 0)),
        h('div', { class: 'card' }, h('h3', 'Récapitulatif par zone pédagogique'), h('div', { class: 'tbl-wrap', style: { maxHeight: 'none' } }, h('table', { class: 't' },
          h('thead', h('tr', ['Zone pédagogique', 'UP', 'Écoles', 'EP', 'EM', 'Publiques', 'Privées', 'FE', 'ACDPE', 'AME', 'Autres', 'Enseignants', 'Élèves G', 'Élèves F', 'Élèves T'].map(x => h('th', x)))),
          h('tbody', lignes.map(({ z, t, nbUp }) => h('tr', { style: { cursor: 'pointer' }, onclick: () => { zone = z.code; db.setting('zonesup-zone', zone); draw(); } }, h('td', h('b', zoneNom(z.code))), ...[nbUp, t.ec, t.ep, t.em, t.pub, t.prv, t.FE, t.ACDPE, t.AME, t.Autres, t.ens, t.G, t.F, t.T].map(n => h('td', { class: 'num' }, String(n))))),
            (() => { const r = totaux(schools.filter(s => !s.codeZone)); return r.ec ? h('tr', h('td', 'Écoles sans zone'), ...['', r.ec, r.ep, r.em, r.pub, r.prv, r.FE, r.ACDPE, r.AME, r.Autres, r.ens, r.G, r.F, r.T].map(n => h('td', { class: 'num' }, String(n)))) : null; })()),
          h('tfoot', h('tr', h('td', 'TOTAL CS'), ...[lignes.reduce((a, x) => a + x.nbUp, 0), T.ec, T.ep, T.em, T.pub, T.prv, T.FE, T.ACDPE, T.AME, T.Autres, T.ens, T.G, T.F, T.T].map(n => h('td', { class: 'num' }, String(n)))))))),
        ...zones.map(z => h('div', { class: 'card' }, h('h3', `${zoneNom(z.code)} — unités pédagogiques`), tableUps(z.code))), src);
    } else if (zone === 'attente') {
      const l = enAttente();
      holder.replaceChildren(h('div', { class: 'card' }, h('h3', `${RUBRIQUES.en_attente_up} (${l.length})`),
        h('p', { class: 'notes' }, (O?.rubriques?.en_attente_up?.aide || '') + ' Elles restent ici jusqu’à ce qu’une UP leur soit donnée : \uE006 pour choisir leur zone et leur UP.'), tableEcoles(l, true)), src);
    } else if (zone === 'fermees') {
      holder.replaceChildren(h('div', { class: 'card' }, h('h3', `${RUBRIQUES.ne_fonctionne_plus} (${fermees.length})`),
        h('p', { class: 'notes' }, (O?.rubriques?.ne_fonctionne_plus?.aide || 'Écoles qui existent mais ne fonctionnent plus.') + ' Elles ne figurent ni dans les listes, ni dans la génération des fiches, ni dans les effectifs et les totaux. « \uE004 Remettre en activité » les y fait revenir ; « \uE036 » sur la ligne d’une école la classe ici.'),
        tableEcoles(fermees, true, true)), src);
    } else {
      const l = ecolesZone(zone), t = totaux(l);
      holder.replaceChildren(cartes(t, (UPS[zone] || []).length),
        h('div', { class: 'card' }, h('div', { class: 'tbl-tools' }, h('h3', { style: { margin: 0, flex: 1 } }, `Unités pédagogiques — ${zoneNom(zone)}`),
          peut(zone) ? btn('\uE001 Ajouter une UP', 'Ajouter une unité pédagogique', () => editerUp(zone, null), '') : null,
          peut(zone) && O ? btn('\uE058 Réinitialiser la zone', 'Réinitialiser la zone (fichiers de la CS)', () => toutReinitialiser(zone), '') : null), tableUps(zone)),
        h('div', { class: 'card' }, h('h3', `Écoles de la zone — zone d’appartenance (${l.length})`), h('p', { class: 'notes' }, '\uE03B dans la liste des UP : école d’une autre zone qui suit les activités de cette UP.'), tableEcoles(l)), src);
    }
    ctx.status(`${schools.length} écoles en activité · ${zones.reduce((a, z) => a + (UPS[z.code] || []).length, 0)} UP · ${enAttente().length} en attente d'UP · ${fermees.length} ne fonctionnant plus`);
  }

  const lignesExport = () => (zone === 'fermees' ? fermees : schools.filter(s => zone === 'tout' ? true : zone === 'attente' ? !s.up : s.codeZone === zone)).map(s => {
    const p = personnel(s) || {}, e = eleves(s) || {};
    return { zone: zoneNom(s.codeZone), up: s.up || '', zoneUp: autreZone(s) ? zoneNom(zoneUp(s)) : '', rubrique: RUBRIQUES[s.rubrique] || (s.up ? '' : RUBRIQUES.en_attente_up), nom: s.nom, cycle: cyc(s), statut: prive(s) ? 'Privé' : 'Public', creation: s.anneeCreation || '', classes: s.classesAutorisees ?? '', FE: p.FE ?? '', ACDPE: p.ACDPE ?? '', AME: p.AME ?? '', Autres: p.Autres ?? '', ens: p.total ?? '', G: e.G ?? '', F: e.F ?? '', T: e.T ?? '' };
  });
  const COLS_EC = [{ k: 'zone', l: "Zone d'appartenance", w: 85 }, { k: 'up', l: 'Unité pédagogique', w: 80 }, { k: 'zoneUp', l: "Zone de l'UP (si autre)", w: 70 }, { k: 'rubrique', l: 'Rubrique', w: 70 }, { k: 'nom', l: 'École', w: 150 }, { k: 'cycle', l: 'Cycle', w: 30 }, { k: 'statut', l: 'Statut', w: 40 }, { k: 'creation', l: 'Création', w: 42 }, { k: 'classes', l: 'Classes autorisées', num: true, w: 48 },
    { k: 'FE', l: 'FE', num: true, w: 32 }, { k: 'ACDPE', l: 'ACDPE', num: true, w: 38 }, { k: 'AME', l: 'AME', num: true, w: 32 }, { k: 'Autres', l: 'Autres', num: true, w: 36 }, { k: 'ens', l: 'Personnel', num: true, w: 45 }, { k: 'G', l: 'Élèves G', num: true, w: 42 }, { k: 'F', l: 'Élèves F', num: true, w: 42 }, { k: 'T', l: 'Élèves T', num: true, w: 42 }];
  const COLS_UP = [{ k: 'zone', l: 'Zone pédagogique' }, { k: 'numero', l: 'N°', num: true }, { k: 'cycle', l: 'Cycle' }, { k: 'up', l: 'Unité pédagogique' }, { k: 'rup', l: 'RUP' }, { k: 'rup_tel', l: 'Contact RUP' }, { k: 'corup', l: 'Co-RUP' }, { k: 'corup_tel', l: 'Contact co-RUP' }, { k: 'ecoles', l: 'Écoles', w: 260 }];
  const lignesUp = () => zones.filter(z => SPECIAUX.includes(zone) || z.code === zone).flatMap(z => (UPS[z.code] || []).map(x => ({ ...x, zone: zoneNom(z.code), cycle: x.cycle === 'Maternelle' ? 'EM' : 'EP' })));
  const titreExp = () => `ZONES ET UNITÉS PÉDAGOGIQUES — ${zone === 'tout' ? 'CS ' + (u.nomCs || '') : zone === 'attente' ? RUBRIQUES.en_attente_up.toUpperCase() : zone === 'fermees' ? RUBRIQUES.ne_fonctionne_plus.toUpperCase() : zoneNom(zone).toUpperCase()} — ${annee}`;

  await charger(); draw();
  ctx.actions([
    { label: '\uE009 Excel (UP)', onClick: async () => download(await listToXlsx({ title: titreExp(), columns: COLS_UP.map(c => ({ ...c, xw: c.k === 'ecoles' ? 70 : 22 })), rows: lignesUp(), sheet: 'UP' }), 'Unites_pedagogiques.xlsx') },
    { label: '\uE009 Excel (écoles)', onClick: async () => download(await listToXlsx({ title: titreExp(), columns: COLS_EC.map(c => ({ ...c, xw: c.k === 'nom' ? 36 : c.num ? 9 : 18 })), rows: lignesExport(), sheet: 'Écoles' }), 'Ecoles_zones_UP.xlsx') },
    { label: '\uE009 PDF', onClick: async () => download(await listToPdf({ title: titreExp(), columns: COLS_EC, rows: lignesExport(), orientation: 'landscape' }), 'Ecoles_zones_UP.pdf') },
    { label: '\uE008 Imprimer', onClick: () => window.print() },
    { label: '\uE058 Tout réinitialiser', kind: 'danger', show: !!O && ROLES_EDIT.includes(u.role), onClick: () => toutReinitialiser(null) }]);
}
