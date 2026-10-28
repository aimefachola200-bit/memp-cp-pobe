/* République du Bénin — MEMP — Vues : fiches de recensement annuel (EP, EM inclusives)
   Même fonctionnement que GESCOL / SCOLARIS (éditions publique et autonome) :
     recensement           liste des écoles du périmètre, état de chaque fiche, PDF rempli / vierge
     recfiche/<école>/<type>/<année>
                           onglet « Remplir » par rubrique (même numérotation, mêmes tableaux), valeurs calculées
                           proposées (identité, personnel, effectifs) et modifiables, totaux en direct, contrôles de
                           cohérence, Sauvegarder / Charger / Réinitialiser, PDF rempli, PDF vierge, Excel, import Excel
   Conception : Maître Aimé FACHOLA */
import { h, toast, download, pickFile, readAsBuffer, confirmBox, currentSchoolYear, norm } from './util.js';
import { db } from './db.js';
import { scoped, inScope, addLog, cleGroupe, libGroupe, ordreGroupe } from './data.js';
import * as R from './recensement.js';
import { pdfFiche } from './recensement-pdf.js';
import { XlsxBook, readXlsx } from './xlsx.js';
import { bannerBytes } from './pdf.js';

export async function render(id, ctx) { return id === 'recfiche' ? fiche(ctx) : liste(ctx); }

const peutEcrire = (u, s) => u.role !== 'DDEMP' && (u.role === 'ADMIN' || inScope(u, s));
const pdfBlob = (b) => new Blob([b], { type: 'application/pdf' });
const annees = () => { const y = +currentSchoolYear().slice(0, 4); return [y + 1, y, y - 1, y - 2].map(a => `${a}-${a + 1}`); };
const entete = (s) => ({ ecole: s.nom, code: s.code, cs: s.nomCs, departement: s.departement, commune: s.commune });
async function telechargerPdf(s, typ, annee, vierge) {
  toast('Préparation du PDF…');
  const D = await R.chargerSchemas();
  if (vierge) return download(pdfBlob(await pdfFiche(D, typ, { annee, vierge: true, guide: true })), `recensement_${typ}_${annee}_vierge.pdf`);
  const cx = await R.contexte(s, typ, annee);
  download(pdfBlob(await pdfFiche(D, typ, { eff: cx.eff, dyn: cx.dyn, annee, guide: false, entete: entete(s) })), `recensement_${typ}_${annee}_${(s.nom || '').replace(/\W+/g, '_')}.pdf`);
}

/* =============================================================== liste des écoles */
async function liste(ctx) {
  const u = ctx.user;
  ctx.title('Fiches de recensement annuel', 'Écoles primaires et maternelles inclusives — même modèle que GESCOL / SCOLARIS : onglet « Remplir », PDF rempli, PDF vierge, Excel');
  let annee = (await db.setting('rec-annee')) || currentSchoolYear();
  const sel = h('select', { class: 'search', style: { maxWidth: '160px' }, 'aria-label': 'Année scolaire', onchange: async (e) => { annee = e.target.value; await db.setting('rec-annee', annee); dessiner(); } },
    annees().map(a => h('option', { value: a, selected: a === annee }, a)));
  const holder = h('div');
  ctx.el.append(h('div', { class: 'card', style: { marginBottom: '10px' } },
    h('p', { style: { margin: 0 } }, 'La fiche officielle du Ministère, rubrique par rubrique. Les valeurs connues de l\'application (identité de l\'école, personnel, effectifs des apprenants) sont proposées ; tout reste modifiable. Le PDF redessine la fiche dans sa forme d\'origine.'),
    h('div', { style: { marginTop: '8px' } }, h('label', h('span', { class: 'muted' }, 'Année scolaire : '), sel))), holder);
  let gmode = (await db.setting('rec-groupe')) || (u.role === 'CP' ? 'zone' : 'arr');
  const zonesRef = (await db.all('ref')).filter(r => r.type === 'zone');
  const selG = h('select', { class: 'search', style: { maxWidth: '220px', marginLeft: '8px' }, 'aria-label': 'Regroupement', onchange: async (e) => { gmode = e.target.value; await db.setting('rec-groupe', gmode); dessiner(); } },
    [['zone', 'Par zone pédagogique'], ['arr', 'Par arrondissement']].map(([v, l]) => h('option', { value: v, selected: v === gmode }, l)));
  sel.after(selG);
  async function dessiner() {
    const schools = (await scoped('schools', u)).sort((a, b) => ordreGroupe(cleGroupe(a, gmode), cleGroupe(b, gmode)) || (/priv/i.test(a.secteur || '') - /priv/i.test(b.secteur || '')) || a.nom.localeCompare(b.nom, 'fr'));
    const recs = new Map((await db.all('recensements')).map(r => [r.id, r]));
    const compte = (l) => { const c = (em, p) => l.filter(s => (s.cycle === 'Maternelle') === em && /priv/i.test(s.secteur || '') === p).length; return `${l.length} école(s) : EP publiques ${c(false, false)}, EM publiques ${c(true, false)}, EP privées ${c(false, true)}, EM privées ${c(true, true)}`; };
    const lignes = [];
    let gPrec = null;
    for (const s of schools) {
      const g = cleGroupe(s, gmode);
      if (g !== gPrec) { gPrec = g; const l = schools.filter(x => cleGroupe(x, gmode) === g); lignes.push(h('tr', h('td', { colspan: 5, style: { background: 'rgba(11,93,59,.08)', fontWeight: 700 } }, `${libGroupe(g, zonesRef, gmode, 'Sans zone')} — ${compte(l)}`))); }
      lignes.push(ligneEcole(s));
    }
    if (schools.length) lignes.push(h('tr', h('td', { colspan: 5, style: { background: '#fff2cc', fontWeight: 800 } }, `Total — ${compte(schools)}`)));
    function ligneEcole(s) {
      const typ = R.typeEcole(s), rec = recs.get(R.recId(s.id, typ, annee)), n = rec ? Object.keys(rec.valeurs || {}).length : 0;
      return h('tr', h('td', h('strong', s.nom), h('div', { class: 'muted' }, [s.numZone ? 'Zone ' + s.numZone : '', s.directeur].filter(Boolean).join(' · '))), h('td', typ === 'primaire' ? 'EP' : 'EM'), h('td', s.secteur || ''),
        h('td', rec ? h('span', { class: 'badge Validée' }, `${n} valeur(s) saisie(s)`) : h('span', { class: 'muted' }, 'calculée seulement'), rec && rec.maj ? h('div', { class: 'muted' }, new Date(rec.maj).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })) : null),
        h('td', { style: { whiteSpace: 'nowrap' } }, h('button', { class: 'btn sm primary', onclick: () => ctx.go(`recfiche/${s.id}/${typ}/${annee}`) }, '\uE006 Remplir'), ' ',
          h('button', { class: 'btn sm', onclick: () => telechargerPdf(s, typ, annee, false).catch(e => toast(e.message, 'err')) }, '\uE00D PDF rempli')));
    }
    holder.replaceChildren(schools.length ? h('div', { class: 'gridwrap' }, h('table', { class: 'g' }, h('thead', h('tr', h('th', 'École'), h('th', 'Type'), h('th', 'Secteur'), h('th', 'Fiche ' + annee), h('th', ''))), h('tbody', lignes)))
      : h('p', { class: 'muted' }, 'Aucune école dans votre périmètre : ajoutez d\'abord les écoles (menu « Écoles »).'));
    ctx.status(`${schools.length} école(s) — année ${annee}`);
  }
  ctx.actions([{ label: '\uE00D PDF vierge EP', onClick: () => telechargerPdf(null, 'primaire', annee, true).catch(e => toast(e.message, 'err')) },
    { label: '\uE00D PDF vierge EM', onClick: () => telechargerPdf(null, 'maternelle', annee, true).catch(e => toast(e.message, 'err')) }]);
  await dessiner();
}

/* =============================================================== formulaire d'une fiche */
const CSS = `
.rc-legende{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin:6px 0 10px}.rc-legende span{display:inline-flex;align-items:center;gap:5px}
.o-calculée{background:#EAF2FB;color:#1F4E79}.o-saisie{background:#FFF6D6;color:#7A5200}
.rc-badge{font-size:11px;border-radius:8px;padding:1px 7px;white-space:nowrap}
.rc-sec{display:none}.rc-sec.actif{display:block}
.rc-onglets{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}.rc-onglets button{border:1px solid var(--line,#ccc);background:#fff;border-radius:16px;padding:4px 10px;font-size:13px;cursor:pointer}
.rc-onglets button.on{background:var(--green,#0b5d3b);color:#fff;border-color:transparent}
.rc-l{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:5px 0;border-bottom:1px dashed #E4E7EC}
.rc-l .num{min-width:3.2em;font-weight:600;color:#1F4E79}.rc-l .txt{font-weight:500}.rc-l.ind{padding-left:2.2em}
.rc-l input[type=text]{width:auto;min-width:5em;padding:4px 6px}.rc-l input.nb{width:7em}.rc-l input.tx{min-width:12em;flex:1 1 14em;max-width:34em}
.rc-l select{width:auto;padding:4px}.rc-l label.choix{margin:0 6px 0 0}
.rc-p{font-size:13px;color:#475467;padding:4px 0 4px 3.2em}
.rc-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 14px;padding:4px 0 4px 3.2em}
.rc-g label{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:14px}.rc-g input{width:5.5em}
.rc-sous{font-weight:600;margin:10px 0 4px}.rc-tw{overflow-x:auto}
table.rc-t{border-collapse:collapse;font-size:12px;margin:6px 0 10px}
table.rc-t th,table.rc-t td{border:1px solid #98A2B3;padding:1px 2px;text-align:center}
table.rc-t th{background:#F2F4F7;font-weight:500}
table.rc-t th.v{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;vertical-align:bottom;padding:4px 1px;font-size:11px}
table.rc-t td.lib{text-align:left;white-space:nowrap;padding:1px 6px;background:#FCFCFD}
table.rc-t td.grp{writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;background:#FCFCFD}
table.rc-t td.gris{background:#948A85}table.rc-t td.fus{background:#F2F4F7;font-weight:600}table.rc-t tr.tot td{font-weight:700}
table.rc-t input[type=text]{width:3.4em;padding:2px 3px;border:1px solid transparent;text-align:center;font-size:12px;background:transparent}
table.rc-t input.t{width:8em;text-align:left}table.rc-t td.cle-nom input{width:13em}
table.rc-t input:focus{border-color:#2E6DA4;background:#fff}
input.rc-calc::placeholder{color:#1F4E79;opacity:1;font-style:italic}input.rc-saisi{background:#FFF6D6!important;font-weight:700}
.rc-ctrl{max-height:220px;overflow:auto;margin:0;padding-left:20px}
@media (max-width:700px){.rc-l .num{min-width:2.4em}.rc-l.ind{padding-left:1em}.rc-p,.rc-g{padding-left:0}}`;

async function fiche(ctx) {
  const u = ctx.user, [sid, typ0, an0] = ctx.args;
  const s = await db.get('schools', sid);
  if (!s) { ctx.el.append(h('p', 'École introuvable.')); return; }
  const typ = R.TYPES[typ0] ? typ0 : R.typeEcole(s), annee = /^\d{4}-\d{4}$/.test(an0 || '') ? an0 : currentSchoolYear();
  const ecrit = peutEcrire(u, s);
  let cx = await R.contexte(s, typ, annee);
  const { schema } = cx;
  ctx.title(`${schema.titre_court} — ${s.nom}`, `Année scolaire ${annee} — même forme que la fiche officielle du Ministère (rubriques, numérotation, tableaux). Les valeurs calculées sont proposées ; tout reste modifiable.`);
  if (!document.getElementById('rc-css')) document.head.append(h('style', { id: 'rc-css' }, CSS));
  let onglet = sessionStorage.getItem('rc-onglet') || 'r1';
  const racine = h('div'); ctx.el.append(racine);

  function champ(ch) {
    const k = ch.k, sv = cx.saisies[k], c = cx.calc[k], o = cx.orig[k], e = cx.eff[k], out = [];
    if (ch.lib && ch.t !== 'case') out.push(h('span', ch.lib));
    if (ch.t === 'on' || (ch.t === 'ch' && !ch.multi)) {
      out.push(h('select', { name: k, 'aria-label': ch.lib || k, class: o === 'saisie' ? 'rc-saisi' : '', disabled: !ecrit },
        h('option', { value: '' }, `— ${c ? 'calculé : ' + c : 'non renseigné'} —`), (ch.t === 'on' ? R.OUINON : ch.opts).map(op => h('option', { value: op, selected: sv === op }, op))));
    } else if (ch.t === 'ch') {
      out.push(h('span', { 'data-multi': k, 'data-auto': JSON.stringify(c || []) }, ch.opts.map(op => h('label', { class: 'choix' }, h('input', { type: 'checkbox', name: k, value: op, checked: Array.isArray(e) && e.includes(op), disabled: !ecrit }), ' ', op))));
    } else if (ch.t === 'case') {
      out.push(h('label', { class: 'choix' }, h('input', { type: 'checkbox', name: k, value: '1', 'data-case': '', 'data-auto': c === '1' ? '1' : '', checked: e === '1', disabled: !ecrit }), ' ', ch.lib));
    } else {
      out.push(h('input', { type: 'text', name: k, value: sv && !Array.isArray(sv) ? sv : '', placeholder: c || '', 'aria-label': ch.lib || k, readOnly: !ecrit,
        class: `${ch.t === 'tx' || k === 'nom' ? 'tx' : 'nb'} ${o === 'saisie' ? 'rc-saisi' : (c ? 'rc-calc' : '')}`, inputmode: ['nb', 'mt'].includes(ch.t) && k !== 'nom' ? 'decimal' : null, 'data-somme': ch.somme ? ch.somme.join('|') : null }));
      if (ch.unite) out.push(h('span', ch.unite)); if (ch.t === 'mt') out.push(h('span', 'FCFA'));
    }
    if (o) out.push(h('span', { class: 'rc-badge o-' + o, title: o === 'calculée' ? 'Valeur calculée : laissez vide pour la garder, tapez une autre valeur pour la corriger' : 'Valeur saisie (correction) — videz le champ pour revenir à la valeur calculée' + (c && !['ch', 'case'].includes(ch.t) ? ` (calculée : ${c})` : '') }, o));
    return out;
  }
  function tableau(t) {
    const leaves = R.feuilles(t.cols), depth = R.profondeur(t.cols), rows = R.lignesTableau(t, cx.dyn[t.k]), nlab = rows.some(r => r.groupe) ? 2 : 1, noms = R.chemins(t.cols);
    const ent = Array.from({ length: depth }, () => []);
    ent[0].push(h('th', { colspan: nlab, rowspan: depth, class: t.label_v ? 'v' : '' }, t.coin || ''));
    for (const [r, , rs, cs, lib, vert] of R.enteteCellules(t.cols, depth)) ent[r].push(h('th', { colspan: cs, rowspan: rs, class: vert ? 'v' : '', scope: 'col' }, lib));
    const vus = new Set();
    const tbody = h('tbody', rows.map(r => {
      const tds = [];
      if (r.groupe && !vus.has(r.groupe)) { vus.add(r.groupe); tds.push(h('td', { class: 'grp', rowspan: rows.filter(x => x.groupe === r.groupe).length }, r.groupe)); }
      tds.push(h('td', { class: 'lib', colspan: nlab === 2 && !r.groupe ? 2 : null }, r.lib));
      let saut = 0, fusFait = false; const fus = r.fusion, span = r.span || {}, grise = r.grise || [];
      leaves.forEach((c) => {
        if (saut) { saut--; return; }
        const k = `${t.k}.${r.k}.${c.k}`;
        if (fus && fus[0].includes(c.k)) { if (!fusFait) { tds.push(h('td', { class: 'fus', colspan: fus[0].length }, fus[1])); fusFait = true; } return; }
        const sp = span[c.k] || 1;
        if (sp > 1) saut = sp - 1; else if (grise.includes(c.k)) { tds.push(h('td', { class: 'gris', 'aria-label': 'non applicable' })); return; }
        let somme = [];
        if (r.total && ['n', 'd', 'an'].includes(c.t)) somme = r.total.map(x => `${t.k}.${x}.${c.k}`); else if (c.somme) somme = c.somme.map(p => `${t.k}.${r.k}.${p}`);
        const sv = cx.saisies[k] ?? '', cc = cx.calc[k] ?? '', o = cx.orig[k] || '', lib = `${r.lib} – ${noms[c.k]}`;
        if (c.t === 'c') tds.push(h('td', { colspan: sp }, h('input', { type: 'checkbox', name: k, value: '1', 'data-case': '', 'data-auto': cc === '1' ? '1' : '', checked: sv === '1' || (sv === '' && cc === '1'), 'aria-label': lib, disabled: !ecrit })));
        else tds.push(h('td', { colspan: sp, class: k.endsWith('.nom') ? 'cle-nom' : '' }, h('input', { type: 'text', name: k, value: Array.isArray(sv) ? '' : sv, placeholder: cc, 'aria-label': lib, readOnly: !ecrit,
          class: `${c.t === 't' ? 't' : ''} ${o === 'saisie' ? 'rc-saisi' : (cc ? 'rc-calc' : '')}`, inputmode: c.t !== 't' ? 'decimal' : null, 'data-somme': somme.length ? somme.join('|') : null, title: somme.length ? 'Total calculé automatiquement' : null })));
      });
      return h('tr', { class: r.total ? 'tot' : '', 'data-ligne': r.k }, tds);
    }));
    return [t.titre ? h('p', { class: 'rc-sous' }, t.titre) : null,
      h('div', { class: 'rc-tw' }, h('table', { class: 'rc-t', 'data-table': t.k }, h('thead', ent.map(l => h('tr', l))), tbody)),
      t.dyn && ecrit ? h('button', { type: 'button', class: 'btn sm', onclick: () => ajouterLigne(t.k) }, '\uE001 Ajouter une ligne') : null];
  }
  function items(liste) {
    return liste.map(it => {
      if (it.i === 'L') return h('div', { class: 'rc-l' + (it.ind || !it.num ? ' ind' : '') }, it.num ? h('span', { class: 'num' }, it.num) : null, it.texte ? h('span', { class: 'txt' }, it.texte) : null,
        it.champs.map(ch => (typeof ch === 'string' ? h('span', { class: 'muted' }, ch) : champ(ch))));
      if (it.i === 'P') return h('p', { class: 'rc-p' }, it.texte);
      if (it.i === 'G') return h('div', { class: 'rc-g' }, it.champs.map(ch => h('label', ch.lib, ' ', h('input', { type: 'text', name: ch.k, value: cx.saisies[ch.k] || '', placeholder: cx.calc[ch.k] || '', inputmode: 'numeric', readOnly: !ecrit,
        class: cx.orig[ch.k] === 'saisie' ? 'rc-saisi' : (cx.calc[ch.k] ? 'rc-calc' : '') }))));
      if (it.i === 'T') return tableau(it);
      if (it.i === 'C2') return [...items(it.g), ...items(it.d)];
      if (it.i === 'SIG') return h('p', { class: 'notes' }, 'Signatures et visas : ' + (it.kind === 'primaire' ? 'Directeur, RUP, Conseiller Pédagogique, Chef de la Circonscription Scolaire' : "Responsable d'Unité Pédagogique, Conseiller Pédagogique, chef de la Circonscription scolaire") + ' (sur le document imprimé).');
      return null;
    });
  }
  let form;
  function dessiner() {
    const secs = R.sections(schema);
    const kpi = (l, v, d) => h('div', { class: 'stat' }, h('b', String(v)), h('span', l + (d ? ' — ' + d : '')));
    const onglets = h('div', { class: 'rc-onglets no-print', role: 'tablist' }, [['ident', "Réservé à l'administration"], ...secs.map(x => ['r' + x.num, x.onglet])].map(([id, lib]) =>
      h('button', { type: 'button', class: id === onglet ? 'on' : '', onclick: (ev) => { onglet = id; sessionStorage.setItem('rc-onglet', id); form.querySelectorAll('.rc-sec').forEach(x => x.classList.toggle('actif', x.dataset.id === id)); onglets.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === ev.currentTarget)); } }, lib)));
    form = h('form', { class: 'card', onsubmit: (e) => e.preventDefault(), oninput: (e) => { const t = e.target; if (t.type === 'text') { t.classList.toggle('rc-saisi', t.value !== ''); t.classList.toggle('rc-calc', t.value === '' && !!t.placeholder); } recalculer(); } },
      h('div', { class: 'rc-legende' }, h('span', h('span', { class: 'rc-badge o-calculée' }, 'calculée'), ' valeur proposée par l\'application (laisser vide pour la garder)'), h('span', h('span', { class: 'rc-badge o-saisie' }, 'saisie'), ' valeur tapée ou corrigée'), h('span', 'Totaux (T, ENSEMBLE, TOTAL) recalculés automatiquement')),
      onglets,
      h('section', { class: 'rc-sec' + (onglet === 'ident' ? ' actif' : ''), 'data-id': 'ident' }, h('h3', "Réservé à l'administration"), h('div', { class: 'rc-l' }, schema.admin.map(champ)),
        h('p', { class: 'notes' }, "Le code et le géo-référencement sont réservés à l'administration ; vous pouvez les reporter ici s'ils vous ont été communiqués.")),
      secs.map(x => h('section', { class: 'rc-sec' + (onglet === 'r' + x.num ? ' actif' : ''), 'data-id': 'r' + x.num }, h('h3', `${x.num}. ${x.titre}`), items(x.items))),
      h('p', { class: 'notes' }, `Âges calculés au 31 décembre ${+annee.slice(0, 4) + 1} (seconde année de l'année scolaire). « Sauvegarder » enregistre seulement les valeurs saisies ; les cases vides reprennent la valeur calculée. « Charger » recharge la dernière version enregistrée ; « Réinitialiser » vide le formulaire (retour aux valeurs calculées) — pensez à sauvegarder ensuite.`));
    if (!form.querySelector('.rc-sec.actif')) { onglet = 'r1'; form.querySelector('[data-id="r1"]')?.classList.add('actif'); }
    racine.replaceChildren(...[
      h('div', { class: 'cards' }, kpi('Champs calculés', cx.nCalcules, "remplis par l'application"), kpi('Champs saisis', cx.nSaisis, cx.rec && cx.rec.maj ? 'enregistré le ' + new Date(cx.rec.maj).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + (cx.rec.par ? ' par ' + cx.rec.par : '') : "rien d'enregistré"),
        kpi('Remplissage', Math.round(100 * cx.nRempli / (cx.nTotal || 1)) + ' %', `${cx.nRempli} / ${cx.nTotal} cases`), kpi('Contrôles', cx.ctrl.length, cx.ctrl.length ? 'incohérence(s)' : 'tout est cohérent')),
      cx.infos.map(m => h('div', { class: 'card', style: { padding: '8px 12px', margin: '6px 0', borderLeft: '4px solid #2E6DA4' } }, m)),
      cx.ctrl.length ? h('details', { class: 'card', open: true }, h('summary', h('b', `Contrôles de cohérence (${cx.ctrl.length})`), ' — G + F = T, totaux de lignes et de colonnes, concordance entre rubriques'), h('ul', { class: 'rc-ctrl' }, cx.ctrl.map(m => h('li', m)))) : null,
      !ecrit ? h('p', { class: 'notes' }, 'Lecture seule : cette école n\'est pas dans votre périmètre d\'écriture.') : null,
      form].flat().filter(Boolean));
    recalculer();
    ctx.status(`${s.nom} — ${R.TYPES[typ]} — ${annee}`);
  }
  const num = (v) => { v = String(v || '').replace(/\s/g, '').replace(',', '.'); return v === '' || isNaN(+v) ? null : +v; };
  const fmt = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100).replace('.', ','));
  function recalculer() {
    const derives = form.querySelectorAll('[data-somme]'), el = (k) => form.querySelector(`[name="${CSS_ESC(k)}"]`);
    const valeur = (k) => { const e = el(k); if (!e) return null; return num(e.value !== '' ? e.value : e.placeholder); };
    for (let p = 0; p < 3; p++) derives.forEach(d => { let t = 0, vu = false; d.dataset.somme.split('|').forEach(k => { const v = valeur(k); if (v !== null) { t += v; vu = true; } }); d.placeholder = vu ? fmt(t) : ''; d.classList.toggle('rc-calc', d.value === '' && vu); });
  }
  const CSS_ESC = (k) => (window.CSS && CSS.escape ? CSS.escape(k) : k);
  function collecter() {
    const o = {}, multis = {};
    form.querySelectorAll('input,select').forEach(e => {
      if (!e.name) return;
      if (e.type === 'checkbox') {
        const m = e.closest('[data-multi]');
        if (m) { (multis[e.name] = multis[e.name] || { el: m, l: [] }); if (e.checked) multis[e.name].l.push(e.value); return; }
        if (e.checked !== (e.dataset.auto === '1')) o[e.name] = e.checked ? '1' : '0';
        return;
      }
      if (e.value.trim() !== '') o[e.name] = e.value.trim();
    });
    for (const [k, x] of Object.entries(multis)) { const auto = JSON.parse(x.el.dataset.auto || '[]'); if (JSON.stringify([...auto].sort()) !== JSON.stringify([...x.l].sort())) o[k] = x.l; }
    return o;
  }
  function ajouterLigne(tk) {
    const tb = form.querySelector(`[data-table="${tk}"] tbody`), der = tb.lastElementChild, n = tb.children.length + 1, tr = der.cloneNode(true);
    tr.dataset.ligne = n; tr.querySelector('.lib').textContent = n;
    tr.querySelectorAll('input').forEach(e => { e.name = e.name.replace(/^([a-z0-9]+)\.\d+\./, `$1.${n}.`); if (e.type === 'checkbox') { e.checked = false; e.dataset.auto = ''; } else { e.value = ''; e.placeholder = /\.fonction$/.test(e.name) ? 'Adjoint' : ''; e.classList.remove('rc-saisi'); } });
    tb.appendChild(tr);
  }
  async function sauver(silencieux) {
    if (!ecrit) return toast('Lecture seule.', 'warn');
    const { propres, erreurs } = R.validerSaisies(schema, collecter());
    if (erreurs.length) { toast(erreurs.slice(0, 3).join(' — '), 'err', 8000); return false; }
    await R.ecrire(s, typ, annee, propres, u); await addLog(u, { action: 'Fiche de recensement', target: `${s.nom} — ${typ} ${annee} (${Object.keys(propres).length} valeurs)` });
    if (!silencieux) toast(`Fiche enregistrée (${Object.keys(propres).length} valeur(s) saisie(s)).`);
    cx = await R.contexte(s, typ, annee); dessiner(); return true;
  }
  async function exporterExcel() {
    const wb = new XlsxBook(), ban = await bannerBytes(), haut = [`${schema.titre_court} – année scolaire ${annee}`, `École : ${s.nom}`];
    const feuille = (nom, tete, lignes, titres = haut) => {
      const ws = wb.sheet(nom.slice(0, 31)); let r = ws.banner(ban, 820);
      titres.forEach((t, i) => ws.set(r++, 0, t, i ? 'note' : 'title')); r++;
      tete.forEach((x, i) => { ws.set(r, i, x, 'th'); ws.width(i, i === 0 ? 34 : (tete.length > 8 ? 9 : 26)); }); ws.height(r, 30); ws.freeze(r + 1, 0); r++;
      for (const l of lignes) { l.forEach((v, i) => ws.set(r, i, v, typeof v === 'number' ? 'tdn' : 'td')); r++; }
    };
    const lignes = R.champsSimples(schema).map(([sec, it, ch]) => {
      let v = cx.eff[ch.k] ?? '';
      if (Array.isArray(v)) v = v.join('; '); else if (ch.t === 'case') v = v === '1' ? 'X' : ''; else if (['nb', 'mt'].includes(ch.t) && R.nombre(v) !== null) v = R.nombre(v);
      return [sec ? sec.num : '—', R.libelleChamp(sec, it, ch), v, cx.orig[ch.k] || ''];
    });
    feuille('Rubriques', ['Rubrique', 'Libellé', 'Valeur', 'Origine'], lignes);
    for (const [sec, t] of R.tableaux(schema)) {
      const leaves = R.feuilles(t.cols), noms = R.chemins(t.cols);
      const data = R.lignesTableau(t, cx.dyn[t.k]).map(r => [(r.groupe ? r.groupe + ' › ' : '') + r.lib, ...leaves.map(c => { let v = cx.eff[`${t.k}.${r.k}.${c.k}`] ?? ''; if (c.t === 'c') v = v === '1' ? 'X' : ''; else if (['n', 'd', 'an'].includes(c.t) && R.nombre(v) !== null) v = R.nombre(v); return v; })]);
      feuille(`R${sec.num} ${t.titre || t.k}`, [t.coin || 'Ligne', ...leaves.map(c => noms[c.k])], data, [...haut, `Rubrique ${sec.num}. ${sec.titre}`]);
    }
    feuille('Contrôles', ['Contrôle de cohérence'], cx.ctrl.length ? cx.ctrl.map(m => [m]) : [['Aucune incohérence détectée.']]);
    feuille('Données (import)', ['Clé', 'Valeur saisie', 'Libellé'], Object.entries(cx.saisies).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : v, R.libelleCle(schema, k)]),
      ['Valeurs saisies (à modifier puis réimporter : bouton « Importer Excel »)', `type=${typ} ; année=${annee}`]);
    download(await wb.toBlob(), `recensement_${typ}_${annee}_${(s.nom || '').replace(/\W+/g, '_')}.xlsx`);
  }
  async function importerExcel() {
    if (!ecrit) return toast('Lecture seule.', 'warn');
    const f = await pickFile('.xlsx'); if (!f) return;
    try {
      const sheets = await readXlsx(await readAsBuffer(f)), ws = sheets.find(x => norm(x.name).startsWith('donnees'));
      if (!ws) return toast('Feuille « Données (import) » introuvable : utilisez un fichier exporté par l\'application (\uE015 Excel).', 'err', 7000);
      const brut = {}; let entete = false;
      for (const row of ws.rows) { if (!row || !String(row[0] ?? '').trim()) continue; if (!entete) { entete = norm(row[0]) === 'cle'; continue; } brut[String(row[0]).trim()] = row[1] ?? ''; }
      const { propres, erreurs, inconnues } = R.validerSaisies(schema, brut);
      const anciens = { ...cx.saisies, ...propres };
      await R.ecrire(s, typ, annee, anciens, u); await addLog(u, { action: 'Import Excel fiche de recensement', target: `${s.nom} — ${Object.keys(propres).length} valeurs` });
      toast(`${Object.keys(propres).length} valeur(s) importée(s)` + (inconnues ? `, ${inconnues} clé(s) ignorée(s)` : '') + (erreurs.length ? `, ${erreurs.length} valeur(s) rejetée(s) : ${erreurs.slice(0, 2).join(' — ')}` : '') + '.', erreurs.length ? 'warn' : 'ok', 7000);
      cx = await R.contexte(s, typ, annee); dessiner();
    } catch (e) { console.error(e); toast('Fichier Excel illisible : ' + e.message, 'err'); }
  }
  ctx.actions([
    { label: '\uE038 Liste', onClick: () => ctx.go('recensement') },
    { label: '\uE007 Sauvegarder', kind: 'primary', show: ecrit, onClick: () => sauver(false) },
    { label: '\uE014 Charger', onClick: async () => { cx = await R.contexte(s, typ, annee); dessiner(); toast('Dernière version enregistrée rechargée.'); } },
    { label: '\uE058 Réinitialiser', show: ecrit, onClick: async () => {
      if (!(await confirmBox('Vider le formulaire et revenir aux valeurs calculées ? (rien n\'est supprimé tant que vous ne sauvegardez pas)', 'Réinitialiser'))) return;
      form.querySelectorAll('input,select').forEach(e => { if (e.type === 'checkbox') { const m = e.closest('[data-multi]'); e.checked = m ? JSON.parse(m.dataset.auto || '[]').includes(e.value) : e.dataset.auto === '1'; } else { e.value = ''; e.classList.remove('rc-saisi'); } }); recalculer();
    } },
    { label: '\uE00D PDF rempli', onClick: async () => { if (ecrit && Object.keys(collecter()).length && !(await sauver(true))) return; telechargerPdf(s, typ, annee, false).catch(e => toast(e.message, 'err')); } },
    { label: '\uE00D PDF vierge', onClick: () => telechargerPdf(s, typ, annee, true).catch(e => toast(e.message, 'err')) },
    { label: '\uE015 Excel', onClick: () => exporterExcel().catch(e => toast(e.message, 'err')) },
    { label: '\uE00A Importer Excel', show: ecrit, onClick: importerExcel },
  ]);
  dessiner();
}
