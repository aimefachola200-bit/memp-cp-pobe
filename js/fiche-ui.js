/* République du Bénin — MEMP — Fiches de rapport de rentrée et de fin d'année (EP, EM) au modèle de GESCOL / SCOLARIS
   Même formulaire que GESCOL (rapports_formulaire) : rubriques du modèle officiel, valeurs proposées automatiquement
   (fiche de l'école, personnel enseignant, effectifs des apprenants, fiche sœur), cases corrigées à la main en jaune,
   totaux recalculés (T = G + F, ENSEMBLE), contrôles de cohérence, état nominatif ; PDF rempli / vierge identique au
   modèle, Excel (feuilles « Rapport » et « Données ») et import Excel ; circuit Brouillon → Transmise → Validée.
   Conception : Maître Aimé FACHOLA */
import { h, nowISO, toast, fmtDateTime, confirmBox, pickFile, readAsBuffer } from './util.js';
import { db } from './db.js';
import { badge } from './ui.js';
import { FICHE_TYPES } from './schema.js';
import { canEdit, canTransmit, canValidate, transmit, validate, requestCorrection, unlock, exportFiche } from './workflow.js';
import { inScope, addLog } from './data.js';
import { chargerRapports, KIND_DOC, contexteFiche, appliquer, valeursCalculees, controles, nbLignesPersonnel, validerValeur, tousCalculs, NIV_EP, tauxRemplissage } from './rapports.js';
import { importerExcel } from './rapports-xlsx.js';

const vide = (x) => x === undefined || x === null || x === '';

export async function render(id, ctx) {
  const u = ctx.user, fid = ctx.args[0], fiche = await db.get('fiches', fid);
  if (!fiche || !inScope(u, fiche)) { ctx.el.append(h('div', { class: 'card' }, 'Fiche introuvable ou hors de votre périmètre.')); return; }
  const doc = KIND_DOC[fiche.kind];
  if (!doc) { ctx.el.append(h('div', { class: 'card' }, 'Type de fiche inconnu.')); return; }
  const D = await chargerRapports(), info = D.docs[doc], T = FICHE_TYPES[fiche.kind] || { label: info.titre, court: info.court };
  const school = await db.get('schools', fiche.schoolId);
  const editable = canEdit(u, fiche);
  const C = await contexteFiche(D, fiche, school, u, { figer: !editable });
  let over = { ...C.over }; const auto = C.auto, origine = C.origine, calc = tousCalculs(D, doc);
  let timer = null, dirty = false, cur = 0;
  ctx.title(T.label || info.titre, `${fiche.schoolNom} — ${fiche.annee}`);

  const fusion = () => ({ ...auto, ...over });
  let fin = valeursCalculees(D, doc, fusion());
  const saveState = h('span', { class: 'sub' }, 'Enregistré'), progress = h('i'), pct = h('b'), nCtl = h('span');
  const head = h('div', { class: 'card', style: { display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' } },
    h('div', h('h3', fiche.schoolNom), h('span', { class: 'sub' }, `${info.court} · ${fiche.annee} · `), badge(fiche.statut)),
    h('div', { style: { flex: 1, minWidth: '160px' } }, h('div', { class: 'progress' }, progress), h('small', pct, ' remplie · ', nCtl)), saveState,
    h('div', { class: 'hint', style: { flex: '1 1 100%', margin: 0 } }, 'Les cases sont pré-remplies par l’application (fiche de l’école, personnel enseignant, effectifs des apprenants, fiche précédente) ; ',
      h('span', { class: 'rp-man', style: { padding: '0 4px' } }, 'en jaune'), ' : corrigées à la main ; ', h('span', { class: 'rp-calc', style: { padding: '0 4px' } }, 'en vert'), ' : totaux calculés. Videz une case pour revenir à la valeur proposée.'),
    fiche.comment ? h('div', { class: 'hint', style: { flex: '1 1 100%', margin: 0 } }, h('b', 'Commentaire du CCS : '), fiche.comment) : null,
    !editable ? h('div', { class: 'hint', style: { flex: '1 1 100%', margin: 0 } }, `Fiche en lecture seule (statut « ${fiche.statut} »).`) : null);
  const content = h('div'), navEl = h('div', { class: 'ed-nav no-print' });
  ctx.el.append(head, h('div', { class: 'ed' }, navEl, content));

  const calcCells = new Map(), inputs = new Map();
  const upd = () => {
    fin = valeursCalculees(D, doc, fusion());
    for (const [k, el] of calcCells) el.textContent = fin[k] ?? '';
    const c = tauxRemplissage(D, doc, fin); progress.style.width = c + '%'; pct.textContent = c + ' %';
    const n = controles(D, doc, fin).length; nCtl.textContent = n ? `${n} point(s) à vérifier` : 'aucune incohérence';
  };
  async function save(force = false) {
    clearTimeout(timer); if (!dirty && !force) return; dirty = false;
    if (!editable) return;
    const finales = appliquer(D, fiche, over, auto);
    fiche.instantane = finales; fiche.completion = tauxRemplissage(D, doc, finales); fiche.updated = nowISO();
    await db.put('fiches', fiche);
    saveState.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  const touch = () => { dirty = true; saveState.textContent = 'Modification…'; upd(); clearTimeout(timer); timer = setTimeout(save, 700); };

  /** Pose une valeur saisie : vide → valeur proposée ; identique à la proposition → pas de correction */
  function poser(spec, brut, el) {
    const k = spec.k; brut = String(brut ?? '').trim();
    if (brut === '') { delete over[k]; marquer(el, k); touch(); return true; }
    const [ok, val, msg] = validerValeur(spec, brut);
    if (!ok) { el.classList.add('rp-err'); el.title = msg; toast(`${spec.lib} : ${msg}`, 'err'); return false; }
    el.classList.remove('rp-err');
    if (val === String(auto[k] ?? '')) delete over[k]; else over[k] = val;
    if (el.value !== undefined && el.tagName !== 'SELECT' && el.value !== val) el.value = val;
    marquer(el, k); touch(); return true;
  }
  function marquer(el, k) {
    el.classList.toggle('rp-man', k in over);
    el.title = k in over ? `Corrigé à la main${!vide(auto[k]) ? ` (proposé : ${auto[k]})` : ''}` : (origine[k] ? `Proposé : ${origine[k]}` : '');
    if (!(k in over) && el.tagName !== 'SELECT') el.value = auto[k] ?? '';
  }
  function saisie(spec, { court = false } = {}) {
    const k = spec.k, t = spec.type || 'texte', v = over[k] ?? auto[k] ?? '';
    let el;
    if (t === 'choix') {
      el = h('select', { disabled: !editable, 'aria-label': spec.lib, onchange: (e) => poser(spec, e.target.value, el) }, h('option', { value: '' }, vide(auto[k]) ? '—' : `— (proposé : ${auto[k]})`),
        (spec.options || []).map(o => h('option', { value: o, selected: String(v) === o }, o)), !vide(v) && !(spec.options || []).includes(String(v)) ? h('option', { value: v, selected: true }, v) : null);
      if (!(k in over) && !vide(auto[k])) el.value = auto[k];
    } else {
      el = h('input', { type: 'text', value: v, disabled: !editable, 'aria-label': spec.lib, inputmode: ['nombre', 'annee', 'tel'].includes(t) ? 'numeric' : null,
        placeholder: t === 'date' ? 'jj/mm/aaaa' : t === 'cours' ? 'CI, CP…' : '', list: spec.liste ? 'rp-liste-' + spec.c : null, style: court ? { width: '100%', minWidth: '44px' } : { width: '100%' },
        onchange: (e) => poser(spec, e.target.value, el) });
    }
    marquer(el, k); inputs.set(k, el);
    return el;
  }
  const cellCalc = (k) => { const td = h('td', { class: 'calc rp-calc' }, fin[k] ?? ''); calcCells.set(k, td); return td; };
  const cellSaisie = (k, lib) => (k in calc ? cellCalc(k) : h('td', saisie({ k, lib, type: 'nombre' }, { court: true })));

  /* ---- blocs ---- */
  function champBloc(b) {
    if (b.type === 'titre') return h('h4', { class: 'rp-sous', style: { flex: '1 1 100%', margin: '8px 0 2px' } }, b.lib_titre || b.lib);
    return h('label', { class: 'field', style: { flex: b.larg === 'long' ? '1 1 100%' : '1 1 260px' } }, h('span', (b.num ? b.num + ' ' : '') + b.lib), saisie(b));
  }
  function tableauBloc(b) {
    const sous = b.sous;
    const thead = h('thead', h('tr', h('th', { rowspan: sous ? 2 : 1 }, ''), b.groupes.map(g => h('th', { colspan: sous ? sous.length : 1 }, g.l))),
      sous ? h('tr', b.groupes.map(() => sous.map(([, sl]) => h('th', sl)))) : null);
    const tbody = h('tbody', b.lignes.map(([lc, llib]) => h('tr', h('td', { class: 'lab' }, llib),
      b.groupes.map(g => (sous ? sous.map(([s]) => cellSaisie(`${b.k}.${lc}.${g.c}_${s}`, `${llib} – ${g.l} ${s}`)) : cellSaisie(`${b.k}.${lc}.${g.c}`, `${llib} – ${g.l}`))))));
    return h('div', { class: 'gridwrap', style: { flex: '1 1 100%' } }, h('table', { class: 'g' }, thead, tbody));
  }
  function structureBloc(b) {
    const ligne = (l, lib) => h('tr', h('td', { class: 'lab' }, lib), NIV_EP.map(n => cellSaisie(`sp.${l}.${n}`, `Structure ${lib} ${n}`)), cellSaisie(`sp.${l}.salles`, `Structure ${lib} – salles`));
    return h('div', { style: { flex: '1 1 100%' } }, h('h4', { class: 'rp-sous' }, b.titre),
      h('div', { class: 'gridwrap' }, h('table', { class: 'g' }, h('thead', h('tr', h('th', ''), NIV_EP.map(n => h('th', n)), h('th', 'Salles utilisées'))),
        h('tbody', ligne('simple', 'Simple'), ligne('multi', 'Multigrade')))),
      h('p', { class: 'notes' }, 'Classes jumelées :'),
      h('div', { class: 'gridwrap' }, h('table', { class: 'g' }, h('thead', h('tr', b.jumelees.map(([, lib]) => h('th', lib)), h('th', 'Salles utilisées'))),
        h('tbody', h('tr', b.jumelees.map(([c, lib]) => cellSaisie(`sp.jumelee.${c}`, `Jumelée ${lib}`)), cellSaisie('sp.jumelee.salles', 'Jumelée – salles'))))));
  }
  function personnelBloc(b) {
    const box = h('div', { style: { flex: '1 1 100%' } });
    const listes = b.cols.filter(c => c.liste).map(c => h('datalist', { id: 'rp-liste-' + c.c }, c.liste.map(o => h('option', { value: o }))));
    const draw = () => {
      const n = nbLignesPersonnel(D, doc, fusion());
      const head = h('thead', h('tr', h('th', 'N°'), b.cols.map(c => h('th', { style: { minWidth: (c.larg ? c.larg * 7 : (c.c === 'nom' ? 180 : 70)) + 'px' } }, c.l)), editable ? h('th', '') : null));
      const body = h('tbody', Array.from({ length: n }, (_, k) => k + 1).map(i => h('tr', h('td', { class: 'n' }, String(i).padStart(2, '0')),
        b.cols.map(c => h('td', saisie({ ...c, k: `pers.${i}.${c.c}`, lib: `Ligne ${i} – ${c.l}` }, { court: true }))),
        editable ? h('td', h('button', { class: 'icon-btn', title: 'Retirer la ligne', onclick: () => retirer(i, n) }, '\uE005')) : null)));
      box.replaceChildren(...[...listes, h('div', { class: 'gridwrap' }, h('table', { class: 'g p' }, head, body)),
        editable ? h('p', h('button', { class: 'btn sm', onclick: () => { if (n >= D.pers_max) return toast(`${D.pers_max} lignes au plus.`, 'warn'); over.pers_n = String(n + 1); touch(); draw(); } }, '\uE001 Ajouter une ligne'),
          ' ', h('span', { class: 'muted' }, `${n} ligne(s) — ${b.min} au minimum sur le modèle (${b.min} lignes par page du PDF).`)) : null,
        h('p', { class: 'notes' }, 'Pré-rempli à partir du menu « Personnel enseignant » (directeur en première ligne). Cours tenus : CI, CP, CE1, CE2, CM1, CM2 séparés par des virgules.')].filter(Boolean));
    };
    function retirer(i, n) {
      const f = fusion(), cols = b.cols.map(c => c.c);
      for (let j = i; j <= n; j++) for (const c of cols) { const src = j < n ? f[`pers.${j + 1}.${c}`] : ''; const k = `pers.${j}.${c}`; if (String(src ?? '') === String(auto[k] ?? '')) delete over[k]; else over[k] = String(src ?? ''); }
      over.pers_n = String(Math.max(b.min, n - 1)); touch(); draw();
    }
    draw(); return box;
  }
  function sectionEl(s) {
    const items = [];
    for (const b of s.blocs) {
      if (b.t === 'champ') items.push(champBloc(b));
      else if (b.t === 'tableau') items.push(tableauBloc(b));
      else if (b.t === 'structure_ep') items.push(structureBloc(b));
      else if (b.t === 'personnel') items.push(personnelBloc(b));
    }
    return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'flex-end' } }, items);
  }
  function controlesEl() {
    const l = controles(D, doc, fin);
    return h('div', l.length ? l.map(([niv, m]) => h('div', { class: 'hint', style: { margin: '6px 0', borderLeftColor: niv === 'danger' ? 'var(--err)' : 'var(--warn)' } }, niv === 'danger' ? '\uE036 ' : '\uE041 ', m))
      : h('p', '\uE004 Aucune incohérence détectée.'));
  }
  const historyEl = () => h('div', (fiche.history || []).slice().reverse().map(x => h('div', { class: 'result', style: { cursor: 'default' } }, h('b', x.action), ' ', h('small', `${fmtDateTime(x.date)} · ${x.by || ''}${x.role ? ' (' + x.role + ')' : ''}`), x.comment ? h('div', x.comment) : null, x.from ? h('small', `${x.from} → ${x.to}`) : null)));
  const SECTIONS = [...D.schemas[doc].map(s => ({ titre: s.titre, el: () => sectionEl(s) })), { titre: 'Contrôles de cohérence', el: controlesEl }, { titre: 'Historique', el: historyEl }];
  function show(i) {
    cur = i; calcCells.clear(); inputs.clear();
    const s = SECTIONS[i];
    [...navEl.children].forEach((b, k) => b.classList.toggle('on', k === i));
    content.replaceChildren(h('h3', { class: 'sec-title' }, s.titre), h('div', { class: 'sec-body' }, s.el()),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'space-between', margin: '10px 0' }, class: 'no-print' },
        h('button', { class: 'btn', disabled: i === 0, onclick: () => show(i - 1) }, '\uE038 Précédent'), h('button', { class: 'btn primary', disabled: i >= SECTIONS.length - 1, onclick: () => show(i + 1) }, 'Suivant \uE039')));
    window.scrollTo({ top: 0 });
  }
  SECTIONS.forEach((s, i) => navEl.appendChild(h('button', { onclick: () => show(i) }, s.titre)));
  upd(); show(0);
  if (editable && fiche.format !== 'gescol') { dirty = true; await save(); }   // ancienne fiche : convertie au modèle GESCOL

  const back = async () => { await save(); ctx.go('fiches'); };
  const doAct = (fn) => async () => { await save(true); const fresh = await db.get('fiches', fid); Object.assign(fiche, fresh); if (await fn(fresh)) ctx.reload(); };
  async function importer() {
    const f = await pickFile('.xlsx'); if (!f) return;
    let r; try { r = await importerExcel(D, doc, await readAsBuffer(f)); } catch (e) { toast(e.message, 'err', 6000); return; }
    if (!r.n) { toast('Aucune valeur reconnue dans la feuille « Données ».', 'warn'); return; }
    if (!(await confirmBox(`${r.n} valeur(s) lue(s)${r.erreurs.length ? `, ${r.erreurs.length} refusée(s)` : ''}. Remplacer les valeurs correspondantes de la fiche ?`, 'Importer'))) return;
    for (const [k, v] of Object.entries(r.valeurs)) { if (v === String(auto[k] ?? '')) delete over[k]; else over[k] = v; }
    await addLog(u, { action: 'Import Excel de fiche', target: `${info.court} — ${fiche.schoolNom} (${fiche.annee})` });
    touch(); await save(); show(cur);
    if (r.erreurs.length) toast(r.erreurs.slice(0, 4).join(' · '), 'warn', 8000); else toast('Valeurs importées.');
  }
  async function reinit() {
    if (!(await confirmBox('Effacer toutes les corrections faites à la main ? Les cases reprendront les valeurs proposées par l’application.', 'Réinitialiser', true))) return;
    over = {}; touch(); await save(); show(cur); toast('Fiche réinitialisée.');
  }
  ctx.actions([
    { label: '\uE038 Liste', onClick: back }, { label: '\uE007 Enregistrer', kind: 'primary', show: editable, onClick: async () => { await save(true); toast('Fiche enregistrée.'); } },
    { label: '\uE009 PDF', onClick: async () => { await save(); await exportFiche(fiche, 'pdf'); } }, { label: '\uE00D PDF vierge', onClick: async () => { await exportFiche(fiche, 'pdf', { vierge: true }); } },
    { label: '\uE006 PDF signé', onClick: async () => { await save(); await exportFiche(fiche, 'pdf', { signed: true }); } },
    { label: '\uE009 Excel', onClick: async () => { await save(); await exportFiche(fiche, 'xlsx'); } }, { label: '\uE00A Importer Excel', show: editable, onClick: importer },
    { label: '↺ Réinitialiser', show: editable, onClick: reinit },
    { label: '\uE00C Transmettre au CCS', show: canTransmit(u, fiche), kind: 'accent', onClick: doAct(f => transmit(u, f)) },
    { label: '\uE004 Valider', show: canValidate(u, fiche), kind: 'accent', onClick: doAct(f => validate(u, f)) },
    { label: '\uE037 Demander correction', show: canValidate(u, fiche), onClick: doAct(f => requestCorrection(u, f)) },
    { label: '\uE034 Déverrouiller', show: u.role === 'ADMIN' && ['Transmise', 'Validée'].includes(fiche.statut), onClick: doAct(f => unlock(u, f)) },
  ]);
  ctx.status(editable ? 'Enregistrement automatique activé.' : 'Lecture seule.');
  const onHide = () => { if (document.visibilityState === 'hidden') save(); };
  document.addEventListener('visibilitychange', onHide);
  return async () => { document.removeEventListener('visibilitychange', onHide); await save(); };
}
