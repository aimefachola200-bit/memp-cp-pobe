/* Pilotage et vie scolaire (PVS) — moteur commun des modules (sport scolaire, tableau de bord du pilotage, …).
   Même fichier dans CS Pobè, Mon école, MEMP-CP, DOSP, MEMP-CP Pobè, ÉduGestion Pro / Master (catalogue : pvs-modules.js,
   spécification : outils/lots/spec.md). L'application fournit un adaptateur (comme pour les bureaux UASCEP) :
   charger / enregistrer l'état, contexte (entités et droits), Excel, impression, cachets, visas, signature et code QR.
   PVS.monter(racine, A, moduleId).
   Conception : Maître Aimé FACHE */
(function (global) {
  'use strict';
  const CAT = () => global.PVS_CATALOGUE;
  const NIVEAUX = [['ECOLE', 'École'], ['UP', 'Unité pédagogique'], ['ZONE', 'Zone pédagogique'], ['CS', 'Circonscription scolaire'], ['DDEMP', 'Direction départementale (DDEMP)']];
  const LIB_NIVEAU = Object.fromEntries(NIVEAUX);
  const SUP = { ECOLE: 'UP', UP: 'ZONE', ZONE: 'CS', CS: 'DDEMP' };
  const VISA_DEFAUT = { ECOLE: "Le Directeur / La Directrice de l'école", UP: "Le Responsable de l'unité pédagogique",
    ZONE: 'Le Conseiller pédagogique', CS: 'Le Chef de la circonscription scolaire', DDEMP: 'Le Directeur départemental des EMP' };

  /* ---------------- utilitaires ---------------- */
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const num = (v) => { const x = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isNaN(x) ? 0 : x; };
  const vide = (v) => v === null || v === undefined || v === '';
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(9).forEach(c => { if (c === null || c === undefined || c === false) return; e.append(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  function iso(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' || /^\d{4,5}(\.\d+)?$/.test(String(v).trim())) {
      const n = Number(v); if (n > 20000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return d.toISOString().slice(0, 10); }
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return '';
  }
  const fr = (d) => { const s = iso(d); return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; };
  const auj = () => new Date().toISOString().slice(0, 10);
  function saisonCourante() { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 8 ? y + '-' + (y + 1) : (y - 1) + '-' + y; }
  function canon(o) {
    if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
    if (o && typeof o === 'object') return '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
    return JSON.stringify(o === undefined ? null : o);
  }
  function niveauDe(v) {
    const n = norm(v); if (!n) return '';
    const direct = NIVEAUX.find(([c, l]) => norm(c) === n || norm(l) === n); if (direct) return direct[0];
    if (/^ecole|^epp|^em\b/.test(n)) return 'ECOLE';
    if (/unite|^up\b/.test(n)) return 'UP';
    if (/zone/.test(n)) return 'ZONE';
    if (/circonscription|^cs\b|commune/.test(n)) return 'CS';
    if (/ddemp|departement|direction/.test(n)) return 'DDEMP';
    return '';
  }
  const nomComplet = (m) => [String(m.nom || '').toUpperCase(), m.prenoms || ''].filter(Boolean).join(' ').trim();
  function melanger(t) { const a = t.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  /** Copie sans les champs de suivi (dates de mise à jour, statut d'avancement, renvois ajoutés après coup) : ils ne changent pas le document signé */
  const I = (n) => (global.Icones ? global.Icones.code(n) + ' ' : '');
  const sansMaj = (r) => { const o = Object.assign({}, r); ['maj', 'statut', 'versCompetition'].forEach(k => delete o[k]); return o; };

  /* ---------------- catalogue ---------------- */
  const modules = () => CAT().MODULES;
  const ongletDeColl = (coll) => modules().flatMap(m => m.onglets).find(o => o.coll === coll);
  const champsDe = (coll) => (ongletDeColl(coll) || { champs: [] }).champs;
  const collections = () => modules().flatMap(m => m.onglets).filter(o => o.coll).map(o => o.coll);
  const individuelle = (c) => /classement individuel/i.test((c && c.formule) || '') || /athl|course en sac/i.test((c && c.discipline) || '');

  /* ---------------- calculs sportifs (purs) ---------------- */
  /** Score retenu d'une rencontre : [a, b, jouée] (forfaits : 3-0, « Les deux » : 0-0 et défaite des deux) */
  function scoreMatch(m) {
    if (m.forfait === 'Équipe A') return [0, 3, true, 'A'];
    if (m.forfait === 'Équipe B') return [3, 0, true, 'B'];
    if (m.forfait === 'Les deux') return [0, 0, true, 'AB'];
    if (m.statut !== 'Joué' || vide(m.scoreA) || vide(m.scoreB)) return [0, 0, false, ''];
    return [num(m.scoreA), num(m.scoreB), true, ''];
  }
  /** Vainqueur d'une rencontre à élimination directe : id de l'équipe, ou '' */
  function vainqueur(m) {
    const [a, b, j, f] = scoreMatch(m); if (!j || f === 'AB') return '';
    if (a !== b) return a > b ? m.equipeA : m.equipeB;
    const t = /^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/.exec(m.tab || ''); if (t && +t[1] !== +t[2]) return +t[1] > +t[2] ? m.equipeA : m.equipeB;
    return '';
  }
  const perdant = (m) => { const w = vainqueur(m); return w ? (w === m.equipeA ? m.equipeB : m.equipeA) : ''; };
  /** Classement d'un groupe d'équipes : 3 / 1 / 0, confrontation directe, différence, buts marqués, forfaits, nom */
  function classement(ids, matchs, nomDe) {
    const S = {}; ids.forEach(id => { S[id] = { id, J: 0, G: 0, N: 0, P: 0, BP: 0, BC: 0, F: 0, Pts: 0 }; });
    const joues = matchs.filter(m => S[m.equipeA] && S[m.equipeB] && scoreMatch(m)[2]);
    const compter = (T, ms) => ms.forEach(m => {
      const [a, b, , f] = scoreMatch(m), A = T[m.equipeA], B = T[m.equipeB]; if (!A || !B) return;
      A.J++; B.J++; A.BP += a; A.BC += b; B.BP += b; B.BC += a;
      if (f === 'AB') { A.P++; B.P++; A.F++; B.F++; return; }
      if (f === 'A') A.F++; if (f === 'B') B.F++;
      if (a > b) { A.G++; B.P++; A.Pts += 3; } else if (a < b) { B.G++; A.P++; B.Pts += 3; } else { A.N++; B.N++; A.Pts++; B.Pts++; }
    });
    compter(S, joues);
    const nom = (x) => String((nomDe && nomDe(x.id)) || x.id);
    const base = (x, y) => (y.BP - y.BC) - (x.BP - x.BC) || y.BP - x.BP || x.F - y.F || nom(x).localeCompare(nom(y), 'fr');
    const lignes = Object.values(S).sort((x, y) => y.Pts - x.Pts);
    const out = []; let i = 0;
    while (i < lignes.length) {
      let j = i; while (j < lignes.length && lignes[j].Pts === lignes[i].Pts) j++;
      const groupe = lignes.slice(i, j);
      if (groupe.length > 1) {
        const ens = new Set(groupe.map(x => x.id)), T = {}; groupe.forEach(x => { T[x.id] = { id: x.id, J: 0, G: 0, N: 0, P: 0, BP: 0, BC: 0, F: 0, Pts: 0 }; });
        compter(T, joues.filter(m => ens.has(m.equipeA) && ens.has(m.equipeB)));
        groupe.sort((x, y) => T[y.id].Pts - T[x.id].Pts || base(x, y));
      }
      out.push(...groupe); i = j;
    }
    out.forEach((x, k) => { x.rang = k + 1; x.Diff = x.BP - x.BC; });
    return out;
  }
  /** Tourniquet : journées d'un championnat simple (méthode du cercle) → [[idA, idB, journée], …] */
  function tourniquet(ids) {
    const t = ids.slice(); if (t.length < 2) return [];
    if (t.length % 2) t.push(null);
    const n = t.length, out = [];
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a && b) out.push(r % 2 ? [b, a, r + 1] : [a, b, r + 1]); }
      t.splice(1, 0, t.pop());
    }
    return out;
  }
  const PHASE_KO = (nb) => nb <= 2 ? 'Finale' : nb <= 4 ? 'Demi-finales' : nb <= 8 ? 'Quarts de finale' : nb <= 16 ? 'Huitièmes de finale' : 'Seizièmes de finale';
  const KO = ['Seizièmes de finale', 'Huitièmes de finale', 'Quarts de finale', 'Demi-finales', 'Finale'];
  /** Rang des performances d'athlétisme : courses → plus petit temps, sauts / lancers → plus grande distance */
  function rangsPerformances(perfs) {
    const g = {};
    perfs.filter(p => !vide(p.performance)).forEach(p => { const k = [p.competition, p.epreuve, p.categorie, p.sexe, p.tour].join('|'); (g[k] = g[k] || []).push(p); });
    const rang = {};
    Object.values(g).forEach(l => {
      const asc = CAT().UNITE_EPREUVE(l[0].epreuve) === 's';
      l.sort((a, b) => asc ? num(a.performance) - num(b.performance) : num(b.performance) - num(a.performance));
      l.forEach((p, i) => { rang[p.id] = i && num(p.performance) === num(l[i - 1].performance) ? rang[l[i - 1].id] : i + 1; });
    });
    return rang;
  }
  function rangsPoints(rows) {
    const l = rows.filter(r => !vide(r.points) || !vide(r.rang)).slice().sort((a, b) => (vide(a.rang) ? 1e9 : num(a.rang)) - (vide(b.rang) ? 1e9 : num(b.rang)) || num(b.points) - num(a.points));
    const rang = {}; l.forEach((r, i) => { rang[r.id] = !vide(r.rang) ? num(r.rang) : (i && !vide(l[i - 1].points) && num(r.points) === num(l[i - 1].points) && vide(l[i - 1].rang) ? rang[l[i - 1].id] : i + 1); });
    return rang;
  }

  /** Résultats du CEP d'une session (et d'un centre) : moyennes, rangs, décisions (calcul pur) */
  function resultatsCep(etat, session, centre, seuil, repechage) {
    const ep = (etat.epreuves || []).filter(e => e.session === session).sort((a, b) => (num(a.ordre) || 99) - (num(b.ordre) || 99) || String(a.epreuve).localeCompare(String(b.epreuve), 'fr'));
    const cands = (etat.candidats || []).filter(c => c.session === session && (!centre || c.centre === centre));
    const S = vide(seuil) ? 10 : num(seuil), R = vide(repechage) ? null : num(repechage);
    const l = cands.map(c => {
      const n = c.notes || {}; let tot = 0, max = 0, nb = 0;
      ep.forEach(e => { const v = n[e.id]; if (v === '' || v == null || String(v).toUpperCase() === 'ABS') return; const coef = num(e.coefficient) || 1; tot += num(v) * coef; max += (num(e.bareme) || 20) * coef; nb++; });
      const absent = c.statut === 'Absent' || c.statut === 'Abandon' || c.statut === 'Exclu' || !nb;
      const moy = !absent && max ? Math.round(100 * tot * 20 / max) / 100 : null;
      const decision = absent ? (c.statut && c.statut !== 'Inscrit' ? c.statut : 'Absent') : moy >= S ? 'Admis' : (R !== null && moy >= R ? 'Admis (repêché)' : 'Ajourné');
      return { id: c.id, total: Math.round(100 * tot) / 100, moyenne: moy, decision };
    });
    const tri = l.filter(x => x.moyenne !== null).sort((a, b) => b.moyenne - a.moyenne);
    tri.forEach((x, i) => { x.rang = i && x.moyenne === tri[i - 1].moyenne ? tri[i - 1].rang : i + 1; });
    return { epreuves: ep, candidats: cands, res: Object.fromEntries(l.map(x => [x.id, x])), seuil: S, repechage: R };
  }
  /* ---------------- documents : contenu vérifiable (pur, même calcul à l'édition et à la vérification) ---------------- */
  const parIds = (etat, coll, ids) => { const s = new Set(ids || []); return (etat[coll] || []).filter(r => s.has(r.id)).map(sansMaj).sort((a, b) => String(a.id).localeCompare(String(b.id))); };
  const un = (etat, coll, id) => sansMaj((etat[coll] || []).find(r => r.id === id) || {});
  const DOC_CONTENU = {
    LISTE: (e, ref) => ({ o: ref.onglet, r: parIds(e, ref.coll, ref.ids) }),
    LICENCE: (e, ref) => ({ l: un(e, 'licences', ref.id) }),
    PARTICIPATION: (e, ref) => ({ r: un(e, ref.coll, ref.id), c: ref.coll === 'equipes' ? un(e, 'competitions', (e.equipes.find(x => x.id === ref.id) || {}).competition) : null }),
    CALENDRIER: (e, ref) => ({ c: un(e, 'competitions', ref.id), m: (e.matchs || []).filter(m => m.competition === ref.id).map(sansMaj).sort((a, b) => String(a.id).localeCompare(String(b.id))),
      q: (e.equipes || []).filter(q => q.competition === ref.id).map(q => [q.id, q.equipe]).sort() }),
    FEUILLE: (e, ref) => { const m = un(e, 'matchs', ref.id); return { m, a: un(e, 'equipes', m.equipeA), b: un(e, 'equipes', m.equipeB) }; },
    CLASSEMENT: (e, ref) => DOC_CONTENU.CALENDRIER(e, ref),
    PALMARES: (e, ref) => ({ c: un(e, 'competitions', ref.id), p: (e.palmares || []).filter(p => p.competition === ref.id).map(sansMaj).sort((a, b) => String(a.id).localeCompare(String(b.id))) }),
    QUALIFIES: (e, ref) => DOC_CONTENU.PALMARES(e, ref),
    DIPLOME: (e, ref) => { const p = un(e, 'palmares', ref.id); return { p, c: un(e, 'competitions', p.competition) }; },
    RECORDS: (e, ref) => ({ r: parIds(e, 'performances', ref.ids) }),
    TABLEAU: (e, ref) => ({ s: ref.instantane || null }),
    NOTE: (e, ref) => ({ n: un(e, 'notes', ref.id) }),
    ACCUSES: (e, ref) => ({ n: un(e, 'notes', ref.id), l: (e.lectures || []).filter(x => x.note === ref.id).map(sansMaj).sort((a, b) => String(a.id).localeCompare(String(b.id))) }),
    AGENDA: (e, ref) => ({ r: parIds(e, 'agenda', ref.ids) }),
    APTITUDE: (e, ref) => ({ v: un(e, 'visitesMed', ref.id) }),
    FICHE_SANTE: (e, ref) => ({ v: un(e, 'visitesMed', ref.id) }),
    STOCK: (e, ref) => ({ r: parIds(e, 'stocks', ref.ids) }),
    CANTINE: (e, ref) => ({ r: parIds(e, 'cantine', ref.ids) }),
    INCLUSION: (e, ref) => ({ b: un(e, 'besoinsSpec', ref.id) }),
    DECROCHAGE: (e, ref) => ({ d: un(e, 'decrochage', ref.id) }),
    CR_VISITE: (e, ref) => ({ v: un(e, 'visitesClasse', ref.id) }),
    CR_ANIMATION: (e, ref) => ({ a: un(e, 'animations', ref.id) }),
    ATTEST_FORMATION: (e, ref) => ({ a: un(e, 'animations', ref.id), p: ref.participant || '' }),
    PV_RECEPTION: (e, ref) => ({ d: un(e, 'dotations', ref.id) }),
    CONVOCATION_CAND: (e, ref) => { const c = un(e, 'candidats', ref.id); delete c.notes; delete c.moyenne; delete c.rang; delete c.decision; return { c, ce: un(e, 'centres', c.centre) }; },
    RELEVE: (e, ref) => { const c = un(e, 'candidats', ref.id); return { c, ep: (e.epreuves || []).filter(x => x.session === c.session).map(sansMaj).sort((a, b) => String(a.id).localeCompare(String(b.id))) }; },
    PV_DELIBERATION: (e, ref) => { const r = resultatsCep(e, ref.session, ref.centre, ref.seuil, ref.repechage); return { s: ref.session, ce: ref.centre || '', r: r.res, j: un(e, 'jurys', ref.jury) }; },
    LISTE_ADMIS: (e, ref) => { const r = resultatsCep(e, ref.session, ref.centre, ref.seuil, ref.repechage); return { s: ref.session, ce: ref.centre || '', r: Object.values(r.res).filter(x => /^Admis/.test(x.decision)) }; },
    PALMARES_CONCOURS: (e, ref) => ({ c: un(e, 'concours', ref.id), p: (e.participants || []).filter(x => x.concours === ref.id).map(sansMaj).sort((a, b) => String(a.id).localeCompare(String(b.id))) }),
    PRIX: (e, ref) => { const p = un(e, 'participants', ref.id); return { p, c: un(e, 'concours', p.concours) }; }
  };
  function contenuDocument(etat, type, ref) {
    const f = DOC_CONTENU[type] || ((e, r) => ({ ref: r }));
    return Object.assign({ t: type }, f(etat || {}, ref || {}));
  }

  /* ---------------- styles (préfixe pvs-) ---------------- */
  function styles() {
    if (document.getElementById('pvs-styles')) return;
    document.head.append(h('style', { id: 'pvs-styles', text: `
      .pvs,.pvs-voile{--pvs-bleu:#1F4E79;--pvs-bord:#D0D5DD;--pvs-gris:#667085;--pvs-fond:#fff}
      .pvs h2.pvs-titre{margin:0 0 4px;font-size:1.25rem}.pvs .pvs-sous{color:var(--pvs-gris);margin:0 0 12px;font-size:.92rem}
      .pvs-onglets{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}
      .pvs-onglet{border:1px solid var(--pvs-bord);background:#fff;color:#1D2939;border-radius:999px;padding:7px 13px;cursor:pointer;font:inherit;font-size:.88rem}
      .pvs-onglet.on{background:var(--pvs-bleu);border-color:var(--pvs-bleu);color:#fff;font-weight:600}
      .pvs-barre{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin:6px 0 10px}
      .pvs-barre label{display:flex;flex-direction:column;gap:3px;font-size:.78rem;color:var(--pvs-gris);font-weight:600;min-width:140px;flex:1 1 160px;max-width:320px}
      .pvs-barre select,.pvs-barre input,.pvs-form input,.pvs-form select,.pvs-form textarea,.pvs-in{font:inherit;padding:7px 9px;border:1px solid var(--pvs-bord);border-radius:7px;background:#fff;color:#1D2939;width:100%;box-sizing:border-box}
      .pvs-btn{border:1px solid var(--pvs-bord);background:#fff;color:#1D2939;border-radius:7px;padding:7px 12px;cursor:pointer;font:inherit;font-size:.86rem;white-space:nowrap}
      .pvs-btn:hover{border-color:var(--pvs-bleu)}.pvs-btn.p{background:var(--pvs-bleu);border-color:var(--pvs-bleu);color:#fff}
      .pvs-btn.d{color:#B42318;border-color:#FDA29B}.pvs-btn.s{padding:4px 8px;font-size:.78rem}.pvs-btn:disabled{opacity:.45;cursor:not-allowed}
      .pvs-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .pvs-carte{background:#fff;color:#1D2939;border:1px solid var(--pvs-bord);border-radius:10px;padding:12px 14px;margin:0 0 12px}
      .pvs-carte h3{margin:0 0 8px;font-size:1rem}.pvs-vide{color:var(--pvs-gris);font-style:italic;padding:10px 0}
      .pvs-aide{font-size:.78rem;color:var(--pvs-gris);font-weight:400}
      .pvs-tw{overflow:auto;max-height:70vh;border:1px solid var(--pvs-bord);border-radius:10px;background:#fff;color:#1D2939}
      .pvs-t{border-collapse:collapse;width:100%;font-size:.85rem}
      .pvs-t thead th{position:sticky;top:0;z-index:2;background:#F2F4F7;color:#344054;text-align:left;padding:7px 8px;border-bottom:1px solid var(--pvs-bord);white-space:nowrap;font-size:.74rem;text-transform:uppercase;letter-spacing:.02em}
      .pvs-t td{padding:6px 8px;border-bottom:1px solid #EAECF0;vertical-align:top}.pvs-t td.c,.pvs-t th.c{text-align:center}.pvs-t td.n{text-align:right;font-variant-numeric:tabular-nums}
      .pvs-t tr.tot td{font-weight:700;background:#F2F4F7}.pvs-t td.act{white-space:nowrap}.pvs-t tr.q td{background:#ECFDF3}
      .pvs-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.74rem;font-weight:600;white-space:nowrap;background:#F2F4F7;color:#475467}
      .pvs-badge.ok{background:#ECFDF3;color:#067647}.pvs-badge.at{background:#FFFAEB;color:#B54708}.pvs-badge.ko{background:#FEF3F2;color:#B42318}
      .pvs-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:12px}
      .pvs-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px;margin:0 0 12px}
      .pvs-kpi{background:#fff;color:#1D2939;border:1px solid var(--pvs-bord);border-radius:10px;padding:10px 12px}.pvs-kpi b{display:block;font-size:1.35rem;color:var(--pvs-bleu);font-variant-numeric:tabular-nums}.pvs-kpi span{font-size:.78rem;color:var(--pvs-gris)}
      .pvs-voile{position:fixed;inset:0;background:rgba(16,24,40,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:4vh 10px;overflow:auto}
      .pvs-dialogue{background:#fff;border-radius:12px;width:min(820px,100%);box-shadow:0 12px 40px rgba(0,0,0,.3);color:#1D2939}
      .pvs-dialogue>header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--pvs-bleu);color:#fff;border-radius:12px 12px 0 0}
      .pvs-dialogue>header h3{margin:0;font-size:1.02rem}.pvs-dialogue>header button{background:none;border:0;color:#fff;font-size:1.3rem;cursor:pointer}
      .pvs-dialogue .pvs-corps{padding:14px 16px}.pvs-dialogue footer{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:10px 16px;border-top:1px solid var(--pvs-bord)}.pvs-dialogue footer .pvs-btn{white-space:normal}
      .pvs-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:10px 14px}
      .pvs-form label{display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:600;color:#344054}.pvs-form label.large{grid-column:1/-1}
      .pvs-form .req::after{content:' *';color:#B42318}
      .pvs-multi{display:flex;flex-wrap:wrap;gap:4px 12px;font-weight:400;border:1px solid var(--pvs-bord);border-radius:7px;padding:6px 8px;max-height:150px;overflow:auto}
      .pvs-multi label{flex-direction:row;align-items:center;gap:5px;font-weight:400;font-size:.82rem}
      .pvs-rapport{max-height:240px;overflow:auto;font-size:.85rem;background:#F9FAFB;border:1px solid var(--pvs-bord);border-radius:8px;padding:8px}
      .pvs-apercu{border:1px solid var(--pvs-bord);padding:14px;background:#fff;overflow-x:auto}
      .pvs-graph{width:100%;height:auto;display:block}.pvs-graph text{font:11px Arial,sans-serif;fill:#344054}
      .pvs-chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}.pvs-chip{border:1px solid var(--pvs-bord);border-radius:999px;padding:4px 10px;background:#fff;color:#1D2939;cursor:pointer;font:inherit;font-size:.8rem}.pvs-chip.on{background:#E8EEF5;border-color:var(--pvs-bleu);font-weight:600}
      .pvs-poules{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:10px}
      .pvs-liens{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px;font-size:.85rem;color:var(--pvs-gris);align-items:center}
      #pvs-impression{display:none}
      @media print{.pvs-voile{display:none!important}body.pvs-imprime>*:not(#pvs-impression){display:none!important}body.pvs-imprime #pvs-impression{display:block!important}}
    ` }));
  }

  /* ---------------- boîtes de dialogue ---------------- */
  function dialogue(titre, corps, boutons) {
    return new Promise(resolve => {
      let fini = false;
      const fermer = (v) => { if (fini) return; fini = true; voile.remove(); window.removeEventListener('keydown', echap); resolve(v); };
      const echap = (e) => { if (e.key === 'Escape') { const v = document.querySelectorAll('.pvs-voile'); if (v[v.length - 1] === voile) fermer(null); } };
      const pied = h('footer', {}, (boutons || [{ l: 'Fermer' }]).map(b => h('button', {
        class: 'pvs-btn' + (b.p ? ' p' : '') + (b.d ? ' d' : ''), type: 'button', 'data-pvs': b.id || null,
        onclick: async () => { if (b.action) { const r = await b.action(); if (r === false) return; fermer(r === undefined ? true : r); } else fermer(b.v === undefined ? null : b.v); }
      }, b.l)));
      const voile = h('div', { class: 'pvs-voile', onclick: (e) => { if (e.target === voile) fermer(null); } },
        h('div', { class: 'pvs-dialogue', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre },
          h('header', {}, h('h3', {}, titre), h('button', { type: 'button', 'aria-label': 'Fermer', onclick: () => fermer(null) }, '✕')),
          h('div', { class: 'pvs-corps' }, corps), pied));
      document.body.append(voile); window.addEventListener('keydown', echap);
    });
  }
  const confirmer = (titre, texte, libelle = 'Confirmer', danger = true) => dialogue(titre, h('p', {}, texte), [{ l: 'Annuler', v: false }, { l: libelle, d: danger, p: !danger, v: true, id: 'confirmer' }]);
  async function imprimerDefaut(titre, html) {
    if (typeof html === 'function') html = await html();
    const doc = h('div', { class: 'pvs-apercu', html });
    dialogue(titre, doc, [{ l: 'Fermer' }, { l: '\uE008 Imprimer / PDF', p: true, action: () => {
      let zone = document.getElementById('pvs-impression');
      if (!zone) { zone = h('div', { id: 'pvs-impression' }); document.body.append(zone); }
      zone.innerHTML = html; document.body.classList.add('pvs-imprime');
      const fin = () => { document.body.classList.remove('pvs-imprime'); zone.innerHTML = ''; window.removeEventListener('afterprint', fin); };
      window.addEventListener('afterprint', fin); setTimeout(() => { window.print(); setTimeout(fin, 1500); }, 50);
      return false;
    } }]);
  }
  function choisirFichier(accept) {
    return new Promise(resolve => {
      const inp = h('input', { type: 'file', accept, style: 'display:none' }); document.body.append(inp);
      inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); resolve(f || null); });
      inp.click();
    });
  }
  /** Graphique en barres (SVG), valeurs positives */
  function barres(items, o) {
    o = o || {};
    const W = 640, lh = 22, H = Math.max(40, items.length * lh + 30), max = Math.max(1, ...items.map(i => num(i.v))), gauche = 190;
    const coul = o.couleur || '#1F4E79';
    return '<svg class="pvs-graph" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.titre || 'Graphique') + '">'
      + items.map((it, k) => { const y = 10 + k * lh, w = Math.max(0, (W - gauche - 60) * num(it.v) / max);
        return '<text x="' + (gauche - 6) + '" y="' + (y + 14) + '" text-anchor="end">' + esc(String(it.l).slice(0, 30)) + '</text>'
          + '<rect x="' + gauche + '" y="' + (y + 3) + '" width="' + w.toFixed(1) + '" height="' + (lh - 7) + '" rx="3" fill="' + (it.c || coul) + '"/>'
          + '<text x="' + (gauche + w + 4) + '" y="' + (y + 14) + '">' + esc(it.t != null ? it.t : it.v) + '</text>'; }).join('') + '</svg>';
  }

  /* ======================================================== montage ======================================================== */
  async function monter(racine, A, moduleId) {
    styles();
    const MOD = modules().find(m => m.id === moduleId);
    if (!MOD) { racine.replaceChildren(h('p', {}, 'Module inconnu : ' + moduleId)); return null; }
    let etat = Object.assign({ version: 1 }, (await A.charger()) || {});
    collections().concat(['documents']).forEach(k => { if (!Array.isArray(etat[k])) etat[k] = []; });
    if (!etat.params || typeof etat.params !== 'object') etat.params = {};
    let ctx = await A.contexte();
    const memo = A.memo || { get: () => null, set: () => {} };
    const toast = (m) => (A.toast ? A.toast(m) : null);
    const exclus = new Set(A.exclure || []);
    const onglets = MOD.onglets.filter(o => !exclus.has(MOD.id + '.' + o.id));
    let onglet = memo.get(MOD.id + '.onglet') || onglets[0].id;
    if (!onglets.some(o => o.id === onglet)) onglet = onglets[0].id;
    const F = {};   // filtres par rubrique
    const sauver = async () => { etat.maj = new Date().toISOString(); await A.enregistrer(etat); };
    const entites = (niv) => (ctx.entites[niv] || []);
    const entite = (niv, cle) => entites(niv).find(e => String(e.cle) === String(cle));
    const visible = (r) => !!entite(r.niveau, r.entite);
    const peut = (niv, cle) => !!(ctx.droits && ctx.droits.ecrire && ctx.droits.ecrire(niv, cle));
    const niveauxCtx = () => NIVEAUX.map(n => n[0]).filter(n => (ctx.niveaux || NIVEAUX.map(x => x[0])).includes(n));
    const ecoles = () => entites('ECOLE');
    const ecoleLib = (cle) => (entite('ECOLE', cle) || {}).lib || '';
    /** Écoles rattachées à une entité (l'école elle-même, celles de l'UP, de la zone, de la circonscription, du département) */
    function ecolesDe(niv, cle) {
      const e = entite(niv, cle); if (!e) return [];
      if (niv === 'ECOLE') return [e];
      if (niv === 'UP') { const n = norm(e.up || e.nomUp || e.lib); return ecoles().filter(x => norm(x.up) === n && (!e.zone || !x.zone || String(x.zone) === String(e.zone))); }
      if (niv === 'ZONE') return ecoles().filter(x => String(x.zone) === String(cle));
      if (niv === 'CS') return entites('CS').length > 1 ? ecoles().filter(x => String(x.cs || (entite('ZONE', x.zone) || {}).cs || '') === String(cle)) : ecoles();
      return entites('DDEMP').length > 1 ? ecoles().filter(x => String(x.dep || '') === String(cle)) : ecoles();
    }
    /** L'entité (niv2, cle2) est-elle l'entité (niv, cle) ou une de ses entités inférieures ? */
    function dans(niv2, cle2, niv, cle) {
      if (niv2 === niv) return String(cle2) === String(cle);
      const ordre = NIVEAUX.map(n => n[0]);
      if (ordre.indexOf(niv2) < ordre.indexOf(niv)) {
        if (niv2 === 'ECOLE') return ecolesDe(niv, cle).some(x => String(x.cle) === String(cle2));
        if (niv2 === 'UP') { const u = entite('UP', cle2); if (!u) return false; if (niv === 'ZONE') return String(u.zone) === String(cle); return niv === 'CS' ? (entites('CS').length <= 1 || String((entite('ZONE', u.zone) || {}).cs || '') === String(cle)) : true; }
        if (niv2 === 'ZONE') return niv === 'CS' ? (entites('CS').length <= 1 || String((entite('ZONE', cle2) || {}).cs || '') === String(cle)) : true;
        if (niv2 === 'CS') return true;
      }
      return false;
    }
    /** Entité supérieure d'une entité (école → UP → zone → CS → DDEMP) */
    function superieure(niv, cle) {
      const e = entite(niv, cle) || {};
      if (niv === 'ECOLE') { const u = entites('UP').find(x => norm(x.up || x.nomUp || x.lib) === norm(e.up) && (!x.zone || !e.zone || String(x.zone) === String(e.zone))); if (u) return ['UP', u.cle]; return e.zone ? ['ZONE', e.zone] : null; }
      if (niv === 'UP') return e.zone ? ['ZONE', e.zone] : null;
      if (niv === 'ZONE') { const c = e.cs || (entites('CS')[0] || {}).cle; return c ? ['CS', c] : null; }
      if (niv === 'CS') { const d = (entites('DDEMP')[0] || {}).cle; return d ? ['DDEMP', d] : null; }
      return null;
    }
    /** Entités destinataires d'une note (vide = toutes celles de ce niveau rattachées à l'émetteur) */
    function destinatairesDe(r) {
      const n = r.destNiveau || 'ECOLE';
      if (Array.isArray(r.destinataires) && r.destinataires.length) return r.destinataires.map(k => [n, String(k)]);
      return entites(n).filter(e => entite(r.niveau, r.entite) ? dans(n, e.cle, r.niveau, r.entite) : true).map(e => [n, String(e.cle)]);
    }
    const recue = (r) => destinatairesDe(r).some(([n, k]) => entite(n, k));
    const VISIBLE = { notes: (r) => visible(r) || recue(r), lectures: (r) => visible(r) || etat.notes.some(n => n.id === r.note && visible(n)) };
    const lignes = (coll) => (etat[coll] || []).filter(VISIBLE[coll] || visible);
    const ongletColl = (coll) => ongletDeColl(coll);
    function libRef(coll, id) {
      if (!id) return '';
      const r = (etat[coll] || []).find(x => x.id === id); if (!r) return '';
      const o = ongletColl(coll); return (o && o.lib ? o.lib(r, api) : r.id) || '';
    }
    function saisons() {
      const s = new Set([saisonCourante()]); const y = +saisonCourante().slice(0, 4); s.add((y - 1) + '-' + y); s.add((y + 1) + '-' + (y + 2));
      collections().forEach(c => (etat[c] || []).forEach(r => { if (r.saison) s.add(r.saison); if (r.annee) s.add(r.annee); }));
      return [...s].sort().reverse();
    }
    const saisonDe = (r) => r.saison || r.annee || '';

    /* ---------- valeurs affichées ---------- */
    function valeur(ch, r, texte) {
      const v = ch.t === 'calc' ? ch.calc(r, api) : r[ch.k];
      if (ch.t === 'date') return fr(v);
      if (ch.t === 'ref') return libRef(ch.o, v);
      if (ch.t === 'ecole') return r[ch.k + 'Lib'] || ecoleLib(v) || '';
      if (ch.t === 'multi') return Array.isArray(v) ? v.join(', ') : (v || '');
      if (ch.t === 'choix' && ch.lib) return ch.lib[v] || v || '';
      if (ch.t === 'entites') { const n = r[ch.dep] || 'ECOLE'; return Array.isArray(v) && v.length ? v.map(k => (entite(n, k) || {}).lib || k).join(' ; ') : 'Toutes (' + (ch.lib || '') + destinatairesDe(r).length + ')'; }
      if (ch.t === 'sexe') return texte ? (v || '') : (v === 'F' ? 'F' : v === 'M' ? 'M' : '');
      return v == null ? '' : v;
    }

    /* ---------- cachets, signatures, visas (bureaux UASCEP et autorité) ---------- */
    let uasCache = null;
    async function uasEtat() {
      if (!A.uascep) return null;
      if (!uasCache) { try { uasCache = (await A.uascep().charger()) || null; } catch (e) { uasCache = null; } }
      return uasCache;
    }
    const roleDe = (f) => (global.UASCEP && global.UASCEP.roleDe ? global.UASCEP.roleDe(f) : (/^president/.test(norm(f)) ? 'P' : /^secretaire/.test(norm(f)) ? 'SG' : /^tresorier/.test(norm(f)) ? 'T' : ''));
    async function responsable(niv, cle, role) {
      const u = await uasEtat(); if (!u) return null;
      const b = (u.bureaux || []).find(x => x.niveau === niv && String(x.entite) === String(cle) && x.statut !== 'archive'); if (!b) return null;
      const m = (u.membres || []).filter(x => x.bureauId === b.id).find(x => roleDe(x.fonction) === role);
      return m ? { m, b } : null;
    }
    function cachetMembre(m, b) {
      const type = m.cachetType || 'rond';
      if (type === 'aucun') return '';
      if (type === 'image') return m.cachetImage ? '<img src="' + m.cachetImage + '" alt="Cachet" style="max-width:150px;max-height:104px">' : '';
      const o = { forme: type === 'rect' ? 'rect' : 'rond', couleur: m.cachetCouleur || 'bleu', taille: 104, haut: 'UASCEP — ' + String(LIB_NIVEAU[b.niveau] || '').replace(/ \(DDEMP\)/, ''), bas: b.entiteLib || '', centre: m.fonction || 'MEMBRE', nom: nomComplet(m) };
      let r = null; if (A.cachet) { try { r = A.cachet(o); } catch (e) { r = null; } }
      return r || (global.UASCEP && global.UASCEP.cachetSvg ? global.UASCEP.cachetSvg(o) : '');
    }
    function blocSig(lib, nom, sig, cachet) {
      return '<div class="pvs-sb"><div class="pvs-sb-l">' + esc(lib) + '</div><div class="pvs-sb-z">' + (cachet ? '<div class="pvs-sb-c">' + cachet + '</div>' : '')
        + (sig ? '<img class="pvs-sb-s" src="' + sig + '" alt="Signature">' : (cachet ? '' : '<div class="pvs-sb-v"></div>')) + '</div><div class="pvs-sb-n">' + esc(nom || '') + '</div></div>';
    }
    const LIB_ROLE = { P: ['Le Président', 'La Présidente'], SG: ['Le Secrétaire général', 'La Secrétaire générale'], T: ['Le Trésorier général', 'La Trésorière générale'], R: ['Le Rapporteur', 'La Rapporteure'] };
    async function sigUascep(niv, cle, role, suffixe) {
      const x = await responsable(niv, cle, role);
      const lib = (x && x.m.sexe === 'F' ? LIB_ROLE[role][1] : LIB_ROLE[role][0]) + (suffixe || ' du bureau UASCEP');
      return { html: x ? blocSig(lib, nomComplet(x.m), x.m.signature || '', cachetMembre(x.m, x.b)) : blocSig(lib, '', '', ''), nom: x ? nomComplet(x.m) : '' };
    }
    async function sigVisa(niv, cle, prefixe) {
      let v = null; if (A.visa) { try { v = await A.visa(niv, cle); } catch (e) { v = null; } }
      v = v || {};
      const titre = v.titre || VISA_DEFAUT[niv] || 'Le Responsable';
      return { html: blocSig((prefixe === undefined ? 'Vu — ' : prefixe) + titre, v.nom || '', v.signature || '', v.cachet || ''), nom: v.nom || '', titre, signature: v.signature || '', cachet: v.cachet || '' };
    }
    /** Logo UASCEP du bureau de l'entité (réglé dans « Bureaux UASCEP »), sinon logo par défaut de l'entité */
    async function logoUas(niv, cle, taille) {
      if (!global.UASCEP || !global.UASCEP.logoBureau) return '';
      const u = await uasEtat(), lib = (entite(niv, cle) || {}).lib || '';
      const b = ((u && u.bureaux) || []).find(x => x.niveau === niv && String(x.entite) === String(cle) && x.statut !== 'archive') || { niveau: niv, entiteLib: lib };
      return global.UASCEP.logoBureau(b, taille || 78);
    }
    async function bandeLogo(niv, cle) {
      const l = await logoUas(niv, cle, 78); if (!l) return '';
      return '<div class="pvs-bl"><div class="pvs-bl-i">' + l + '</div><div><div class="pvs-bl-1">' + esc((global.UASCEP && global.UASCEP.DEFINITION) || 'Union des associations sportives et culturelles des écoles primaires') + '</div><div class="pvs-bl-2">UASCEP — ' + esc(LIB_NIVEAU[niv] || '') + ' : ' + esc((entite(niv, cle) || {}).lib || '') + '</div></div></div>';
    }
    const sigsHtml = (l) => '<div class="pvs-sigs">' + l.map(x => typeof x === 'string' ? x : x.html).join('') + '</div>';
    const CSS_DOC = '<style>.pvs-doc{font:10.5pt/1.45 Arial,sans-serif;color:#111}.pvs-doc h2{font:bold 13pt Arial,sans-serif;text-align:center;margin:10px 0 4px;text-transform:uppercase}'
      + '.pvs-doc h3{font:bold 11pt Arial,sans-serif;margin:12px 0 4px}.pvs-doc p.c{text-align:center;margin:2px 0}.pvs-doc p.j{text-align:justify;margin:8px 0}'
      + '.pvs-imp{border-collapse:collapse;width:100%;font:8.8pt Arial,sans-serif;margin:6px 0}.pvs-imp th,.pvs-imp td{border:1px solid #555;padding:3px 4px;text-align:left;vertical-align:top;overflow-wrap:break-word}'
      + '.pvs-imp th{background:#E8EEF5!important;color:#1D2939!important;font-weight:700;position:static;text-transform:none;letter-spacing:0}.pvs-imp td.n{text-align:right}.pvs-imp td.c,.pvs-imp th.c{text-align:center}'
      + '.pvs-sigs{display:flex;flex-wrap:wrap;justify-content:space-between;gap:14px 18px;margin-top:18px;page-break-inside:avoid;break-inside:avoid}'
      + '.pvs-sb{flex:1 1 160px;text-align:center;font:10pt Arial,sans-serif}.pvs-sb-l{font-weight:700}.pvs-sb-z{position:relative;height:112px;display:flex;align-items:center;justify-content:center}'
      + '.pvs-sb-c{position:absolute;left:50%;top:50%;transform:translate(-72%,-50%);opacity:.88}.pvs-sb-c svg{height:100px;width:auto;max-width:210px}.pvs-sb-c svg.rond{width:104px;height:104px}.pvs-sb-c img{max-width:150px;max-height:104px}'
      + '.pvs-sb-s{position:relative;max-height:74px;max-width:170px;mix-blend-mode:multiply}.pvs-sb-n{font-weight:700}.pvs-sb-v{border-top:1px dashed #999;width:150px;margin-top:70px}'
      + '.pvs-qrb{display:flex;gap:12px;align-items:center;margin-top:18px;padding-top:8px;border-top:1px solid #999;font:8.5pt Arial,sans-serif;page-break-inside:avoid;break-inside:avoid}'
      + '.pvs-qrb svg,.pvs-qrb img{width:96px;height:96px;display:block}.pvs-qrb b{font-family:monospace;font-size:9.5pt}'
      + '.pvs-cadre{border:3px double #1F4E79;padding:18px 22px;border-radius:6px}.pvs-dip{text-align:center}.pvs-dip .gt{font:bold 24pt Georgia,serif;color:#1F4E79;letter-spacing:.06em;margin:8px 0}'
      + '.pvs-dip .nm{font:bold 18pt Georgia,serif;margin:10px 0}.pvs-lic{display:grid;grid-template-columns:110px 1fr;gap:12px;align-items:start}.pvs-photo{width:100px;height:120px;border:1px dashed #777;display:flex;align-items:center;justify-content:center;font-size:8pt;color:#777}'
      + '.pvs-kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:10pt}.pvs-kv b{font-weight:700}'
      + '.pvs-bl{display:flex;gap:12px;align-items:center;margin:6px 0 4px;padding:4px 0;border-bottom:1px solid #1F4E79}.pvs-bl-i svg,.pvs-bl-i img{width:78px;height:78px;display:block}.pvs-bl-1{font-size:9pt;color:#333}.pvs-bl-2{font-weight:700;color:#1F4E79;text-transform:uppercase}.pvs-dip .pvs-gl svg,.pvs-dip .pvs-gl img{width:130px;height:130px}</style>';
    const enTete = () => (A.entete ? A.entete() : '');
    const faitA = () => '<p style="text-align:right;margin:12px 0 0">Fait à ' + esc(ctx.lieu || '……………………') + ', le ' + esc(fr(auj())) + '</p>';
    /** Numéro, code QR et mention de vérification (registre et page de vérification de l'application) */
    async function sceau(type, ref, resume) {
      const D = CAT().DOCUMENTS[type] || { lib: type };
      const contenu = contenuDocument(etat, type, ref);
      resume = Object.assign({ type: D.lib, date: fr(auj()) }, resume || {});
      let r = null;
      if (A.signer) { try { r = await A.signer({ type, code: D.code || 'LS', typeLib: D.lib, module: MOD.id, contenu, empreinte: canon(contenu), ref, resume }); } catch (e) { console.error(e); r = null; } }
      if (!r) return '';
      etat.documents = etat.documents.concat([{ numero: r.numero, code: r.code || '', type, module: MOD.id, ref, date: auj(), entite: resume.entite || '', objet: resume.objet || '', signataire: resume.signataire || '' }]).slice(-500);
      await sauver();
      return '<div class="pvs-qrb" data-pvs-numero="' + esc(r.numero) + '"><div>' + (r.qr || '') + '</div><div>Document n° <b>' + esc(r.numero) + '</b>'
        + (r.code ? '<br>Code de vérification : <b>' + esc(r.code) + '</b>' : '') + '<br>' + esc(resume.type) + (resume.entite ? ' — ' + esc(resume.entite) : '')
        + (resume.objet ? ' — ' + esc(resume.objet) : '') + (resume.mention ? ' (' + esc(resume.mention) + ')' : '')
        + '<br>Édité le ' + esc(resume.date) + (resume.signataire ? ' — signataire : ' + esc(resume.signataire) : '') + '<br>' + esc(r.mention || 'Scannez le code QR pour vérifier l’authenticité du document.') + '</div></div>';
    }
    /** Lance l'aperçu / impression d'un document : f(api) → { titre, corps, sigs, resume, paysage } */
    function document_(type, ref, fabriquer) {
      const D = CAT().DOCUMENTS[type] || { lib: type };
      (A.imprimer || imprimerDefaut)(D.lib, async () => {
        const x = await fabriquer();
        const pied = await sceau(type, ref, x.resume);
        const bande = x.uas ? await bandeLogo(x.uas[0], x.uas[1]) : '';
        return CSS_DOC + '<div class="pvs-doc">' + enTete() + bande + (x.sansTitre ? '' : '<h2>' + esc(x.titre || D.lib) + '</h2>') + x.corps + (x.sansFait ? '' : faitA()) + sigsHtml(x.sigs || []) + pied + '</div>';
      }, { portrait: !(DOC_PAYSAGE[type]) });
    }
    const DOC_PAYSAGE = { LISTE: true, CALENDRIER: true, TABLEAU: true };
    const tableDoc = (tete, rows, classes) => '<table class="pvs-imp"><thead><tr>' + tete.map((t, i) => '<th' + (classes && classes[i] ? ' class="' + classes[i] + '"' : '') + '>' + esc(t) + '</th>').join('') + '</tr></thead><tbody>'
      + (rows.length ? rows.map(r => '<tr>' + r.map((v, i) => '<td' + (classes && classes[i] ? ' class="' + classes[i] + '"' : '') + '>' + (v && v.html ? v.html : esc(v)) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + tete.length + '">Aucune donnée.</td></tr>') + '</tbody></table>';

    /* ---------- formulaire ---------- */
    function selectListe(valeurs, v, videLib) {
      const s = h('select', {});
      if (videLib !== null) s.append(h('option', { value: '' }, videLib || '—'));
      valeurs.forEach(x => { const [val, lib] = Array.isArray(x) ? x : [x, x]; if (val === '' && videLib !== null) return; s.append(h('option', { value: val, selected: String(val) === String(v == null ? '' : v) ? true : null }, lib)); });
      if (v && !valeurs.some(x => String(Array.isArray(x) ? x[0] : x) === String(v))) s.append(h('option', { value: v, selected: true }, v));
      return s;
    }
    function optionsRef(ch, row) {
      let l = lignes(ch.o);
      const s = saisonDe(row); if (s) l = l.filter(r => !saisonDe(r) || saisonDe(r) === s);
      if (ch.dep) l = l.filter(r => r[ch.dep] === row[ch.dep]);
      return l.map(r => [r.id, libRef(ch.o, r.id) + (ch.o === 'competitions' && r.niveau ? ' — ' + (entite(r.niveau, r.entite) || {}).lib : '')]).sort((a, b) => a[1].localeCompare(b[1], 'fr'));
    }
    function entitesEcrivables(o) {
      return (o.niveaux || NIVEAUX.map(n => n[0])).filter(n => niveauxCtx().includes(n)).map(n => [n, entites(n).filter(e => peut(n, e.cle))]).filter(x => x[1].length);
    }
    async function formulaire(o, ligne) {
      const nouveau = !ligne;
      const filtre = F[o.id] || {};
      const r = Object.assign({}, ligne || {});
      if (nouveau) {
        o.champs.forEach(c => { if (c.def !== undefined && vide(r[c.k])) r[c.k] = c.def; });
        const ew = entitesEcrivables(o);
        if (filtre.niveau && filtre.entite && peut(filtre.niveau, filtre.entite)) { r.niveau = filtre.niveau; r.entite = filtre.entite; }
        else if (ew.length) { const pref = ew.find(x => x[0] === (filtre.niveau || (ctx.autorite || {}).niveau)) || ew[0]; r.niveau = pref[0]; r.entite = (pref[1].find(e => String(e.cle) === String((ctx.autorite || {}).cle)) || pref[1][0]).cle; }
        if (o.annee) r.annee = filtre.saison || saisonCourante(); else r.saison = filtre.saison || saisonCourante();
        const refF = o.champs.find(c => c.t === 'ref'); if (refF && filtre.ref) r[refF.k] = filtre.ref;
      }
      const ew = entitesEcrivables(o);
      if (!ew.length) { toast('Votre compte ne peut pas écrire dans cette rubrique.'); return null; }
      const sNiv = selectListe(ew.map(x => [x[0], LIB_NIVEAU[x[0]]]), r.niveau, null);
      const sEnt = h('select', {});
      const majEnt = () => { const l = (ew.find(x => x[0] === sNiv.value) || [null, []])[1]; sEnt.replaceChildren(...l.map(e => h('option', { value: e.cle, selected: String(e.cle) === String(r.entite) ? true : null }, e.lib))); if (!l.some(e => String(e.cle) === String(sEnt.value))) sEnt.value = l[0] ? l[0].cle : ''; };
      majEnt();
      const sSaison = selectListe(saisons(), saisonDe(r), null);
      const champsEl = {};
      const form = h('div', { class: 'pvs-form' });
      const lab = (txt, el, ch) => h('label', { class: (ch && (ch.t === 'long' || ch.t === 'multi' || ch.t === 'entites') ? 'large' : '') }, h('span', { class: ch && ch.req ? 'req' : '' }, txt), el, ch && ch.aide ? h('span', { class: 'pvs-aide' }, ch.aide) : null);
      if (ew.length > 1 || ew[0][1].length > 1 || (o.niveaux || []).length > 1) form.append(lab('Niveau', sNiv), lab('Entité', sEnt));
      form.append(lab(o.annee ? 'Année scolaire' : 'Saison', sSaison));
      const lire = () => {
        const x = Object.assign({}, r, { niveau: sNiv.value, entite: sEnt.value });
        if (o.annee) x.annee = sSaison.value; else x.saison = sSaison.value;
        o.champs.forEach(c => { const el = champsEl[c.k]; if (!el || c.t === 'calc') return;
          if (c.t === 'multi' || c.t === 'entites') x[c.k] = [...el.querySelectorAll('input:checked')].map(i => i.value);
          else if (c.t === 'num') x[c.k] = el.value === '' ? '' : num(el.value);
          else x[c.k] = el.value;
          if (c.t === 'ecole') x[c.k + 'Lib'] = ecoleLib(el.value); });
        return x;
      };
      const calcEls = [];
      o.champs.forEach(c => {
        let el;
        const v = r[c.k];
        if (c.t === 'long') el = h('textarea', { rows: 3 }, v || '');
        else if (c.t === 'num') el = h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: vide(v) ? '' : v });
        else if (c.t === 'date') el = h('input', { type: 'date', value: iso(v) });
        else if (c.t === 'heure') el = h('input', { type: 'time', value: v || '' });
        else if (c.t === 'choix') el = selectListe(c.o.filter(x => x !== '').map(x => c.lib ? [x, c.lib[x] || x] : x), v);
        else if (c.t === 'entites') {
          const coches = new Set((Array.isArray(v) ? v : []).map(String));
          const remplir = (row) => { const n = row[c.dep] || 'ECOLE', l = entites(n).filter(e => !row.entite || !entite(row.niveau, row.entite) || dans(n, e.cle, row.niveau, row.entite));
            el.replaceChildren(...(l.length ? l.map(e => h('label', {}, h('input', { type: 'checkbox', value: e.cle, checked: coches.has(String(e.cle)) ? true : null }), e.lib)) : [h('span', { class: 'pvs-aide' }, 'Aucune entité de ce niveau dans votre périmètre.')])); };
          el = h('div', { class: 'pvs-multi' }); remplir(r);
          el._maj = () => { el.querySelectorAll('input:checked').forEach(i => coches.add(i.value)); el.querySelectorAll('input:not(:checked)').forEach(i => coches.delete(i.value)); remplir(lire()); };
        }
        else if (c.t === 'oui') el = selectListe(['Oui', 'Non'], v);
        else if (c.t === 'sexe') el = selectListe([['M', 'Masculin (M)'], ['F', 'Féminin (F)']], v);
        else if (c.t === 'ecole') {
          const choixE = () => { const ens = (sNiv.value && sEnt.value) ? ecolesDe(sNiv.value, sEnt.value) : ecoles(); return (ens.length ? ens : ecoles()).map(e => [e.cle, e.lib]); };
          el = selectListe(choixE(), v); el._maj = () => { const cur = el.value; const n2 = selectListe(choixE(), cur); el.replaceChildren(...n2.childNodes); el.value = cur; };
        }
        else if (c.t === 'ref') { el = selectListe(optionsRef(c, r), v); el._maj = () => { const cur = el.value; const n2 = selectListe(optionsRef(c, lire()), cur); el.replaceChildren(...n2.childNodes); el.value = cur; }; }
        else if (c.t === 'multi') {
          const sel = new Set(Array.isArray(v) ? v : String(v || '').split(/\s*[,;]\s*/).filter(Boolean));
          el = h('div', { class: 'pvs-multi' }, c.o.map(x => h('label', {}, h('input', { type: 'checkbox', value: x, checked: sel.has(x) ? true : null }), x)));
        } else if (c.t === 'calc') { el = h('input', { readonly: true, value: c.calc(r, api), tabindex: '-1' }); calcEls.push([c, el]); }
        else el = h('input', { type: 'text', value: v == null ? '' : v });
        el.setAttribute('data-k', c.k);
        champsEl[c.k] = el;
        form.append(lab(c.l, el, c));
      });
      const maj = (e) => { const x = lire(); calcEls.forEach(([c, el]) => { el.value = c.calc(x, api); }); o.champs.forEach(c => { if (champsEl[c.k] && champsEl[c.k]._maj && (c.dep || c.t === 'ecole') && !(e && champsEl[c.k].contains(e.target))) champsEl[c.k]._maj(); }); };
      form.addEventListener('change', (e) => { if (e.target === sNiv) majEnt(); maj(e); });
      form.addEventListener('input', () => calcEls.forEach(([c, el]) => { el.value = c.calc(lire(), api); }));
      const res = await dialogue((nouveau ? 'Ajouter — ' : 'Modifier — ') + o.titre, h('div', {}, o.aide ? h('p', { class: 'pvs-aide', style: 'margin:0 0 8px' }, o.aide) : null, form), [
        { l: 'Annuler', v: null },
        { l: '\uE007 Enregistrer', p: true, id: 'enregistrer', action: () => {
          const x = lire();
          const manque = o.champs.filter(c => c.req && (Array.isArray(x[c.k]) ? !x[c.k].length : vide(x[c.k])));
          if (!x.entite) { toast('Choisissez l’entité.'); return false; }
          if (manque.length) { toast('À renseigner : ' + manque.map(c => c.l).join(', ')); return false; }
          return x;
        } }]);
      if (!res) return null;
      res.entiteLib = (entite(res.niveau, res.entite) || {}).lib || res.entiteLib || '';
      if (AVANT[o.coll]) AVANT[o.coll](res, api);
      res.maj = new Date().toISOString();
      if (nouveau) { res.id = uid(); res.cree = auj(); etat[o.coll].push(res); }
      else { const i = etat[o.coll].findIndex(z => z.id === res.id); if (i >= 0) etat[o.coll][i] = res; }
      await sauver();
      return res;
    }
    /** Règles appliquées avant l'enregistrement d'une ligne */
    const AVANT = {
      licences(r) {
        if (!r.categorie) r.categorie = CAT().categorieAge(r.dateNaissance, r.saison);
        if (!r.numero) {
          const meme = etat.licences.filter(x => x.saison === r.saison && String(x.entite) === String(r.entite) && x.numero);
          const ordre = meme.reduce((m, x) => Math.max(m, +(String(x.numero).split('-').pop()) || 0), 0) + 1;
          r.numero = 'LIC-' + String(r.saison || saisonCourante()).slice(2, 4) + '-' + String(r.entite).replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase() + '-' + String(ordre).padStart(4, '0');
        }
        r.nom = String(r.nom || '').toUpperCase();
      },
      performances(r) { r.nom = String(r.nom || '').toUpperCase(); if (!r.categorie && r.licence) { const l = etat.licences.find(x => x.numero === r.licence); if (l) r.categorie = l.categorie; } },
      visitesMed(r) {
        r.nom = String(r.nom || '').toUpperCase();
        const l = etat.licences.find(x => String(x.entite) === String(r.entite) && x.saison === r.saison && norm(x.nom) === norm(r.nom) && norm(x.prenoms) === norm(r.prenoms));
        if (l) { l.aptitude = r.aptitude; l.dateVisite = r.dateVisite; l.maj = new Date().toISOString(); }
      },
      decrochage(r) { r.nom = String(r.nom || '').toUpperCase(); },
      besoinsSpec(r) { r.nom = String(r.nom || '').toUpperCase(); },
      matchs(r) { if (r.statut === 'Programmé' && ((!vide(r.scoreA) && !vide(r.scoreB)) || r.forfait)) r.statut = 'Joué'; }
    };

    /* ---------- Excel ---------- */
    function feuille(o, rows) {
      const tete = ['Niveau', 'Entité', o.annee ? 'Année scolaire' : 'Saison'].concat(o.champs.map(c => c.l));
      const l = rows.map(r => [LIB_NIVEAU[r.niveau] || r.niveau, r.entiteLib || (entite(r.niveau, r.entite) || {}).lib || '', saisonDe(r)].concat(o.champs.map(c => { const v = valeur(c, r, true); return c.t === 'num' && !vide(v) ? num(v) : v; })));
      return { nom: o.titre.slice(0, 31), lignes: [tete].concat(l), entete: 0 };
    }
    async function exporter(feuilles, nom) {
      const blob = await A.xlsxEcrire(feuilles);
      A.telecharger(nom + '-' + auj() + '.xlsx', blob);
    }
    function objets(l) {
      const i0 = l.findIndex(x => (x || []).map(norm).includes('niveau') && (x || []).map(norm).includes('entite'));
      if (i0 < 0) return null;
      const tete = l[i0].map(norm);
      return l.slice(i0 + 1).map((x, k) => ({ _ligne: i0 + k + 2, ...Object.fromEntries(tete.map((t, j) => [t, x ? (x[j] == null ? '' : x[j]) : ''])) }))
        .filter(z => Object.keys(z).some(k => k !== '_ligne' && String(z[k]).trim() !== ''));
    }
    const trouverEntite = (niv, lib) => entites(niv).find(e => norm(e.lib) === norm(lib) || norm(e.cle) === norm(lib) || (e.alias || []).some(a => norm(a) === norm(lib)));
    async function importer(o) {
      const f = await choisirFichier('.xlsx,.xls,.csv'); if (!f) return;
      let fs; try { fs = await A.xlsxLire(f); } catch (e) { toast('Fichier illisible : ' + (e.message || e)); return; }
      const fe = fs.find(x => norm(x.nom) === norm(o.titre.slice(0, 31))) || fs.find(x => objets(x.lignes || [])) || fs[0];
      const obs = fe ? objets(fe.lignes || []) : null;
      if (!obs) { toast('Feuille sans les colonnes « Niveau » et « Entité ».'); return; }
      const rejets = [], stats = { a: 0, m: 0 }, nouv = JSON.parse(JSON.stringify(etat[o.coll]));
      const ew = entitesEcrivables(o);
      obs.forEach(x => {
        let niv = niveauDe(x.niveau) || (o.niveaux.length === 1 ? o.niveaux[0] : '');
        let e = niv && trouverEntite(niv, x.entite);
        if (!e && !x.entite && ew.length === 1 && ew[0][1].length === 1) { niv = ew[0][0]; e = ew[0][1][0]; }
        if ((!niv || !e) && o.coll === 'notes' && niv && x.entite) e = { cle: 'ext:' + norm(x.entite), lib: String(x.entite), externe: true };
        if (!niv || !e) { rejets.push(`Ligne ${x._ligne} : niveau ou entité inconnu (« ${x.niveau || ''} » / « ${x.entite || ''} »)`); return; }
        if (!(o.niveaux || []).includes(niv)) { rejets.push(`Ligne ${x._ligne} : niveau « ${LIB_NIVEAU[niv]} » non prévu pour cette rubrique`); return; }
        const recueExt = o.coll === 'notes' && (e.externe || !peut(niv, e.cle));
        if (!peut(niv, e.cle) && !recueExt) { rejets.push(`Ligne ${x._ligne} : « ${e.lib} » hors de votre périmètre`); return; }
        const r = { niveau: niv, entite: String(e.cle), entiteLib: e.lib };
        const s = String(x[o.annee ? 'annee scolaire' : 'saison'] || '').trim() || (F[o.id] || {}).saison || saisonCourante();
        if (o.annee) r.annee = s; else r.saison = s;
        o.champs.forEach(c => {
          if (c.t === 'calc') return;
          const raw = x[norm(c.l)]; if (raw === undefined) return;
          const t = String(raw == null ? '' : raw).trim();
          if (c.t === 'date') r[c.k] = iso(raw);
          else if (c.t === 'num') r[c.k] = t === '' ? '' : num(t);
          else if (c.t === 'sexe') r[c.k] = /^f/i.test(t) ? 'F' : /^(m|g|h)/i.test(t) ? 'M' : '';
          else if (c.t === 'oui') r[c.k] = /^o|^y|^1|^v/i.test(t) ? 'Oui' : t ? 'Non' : '';
          else if (c.t === 'choix') r[c.k] = (c.o.find(v => norm(v) === norm(t) || (c.lib && norm(c.lib[v]) === norm(t))) || (c.k === 'destNiveau' ? niveauDe(t) : '') || t);
          else if (c.t === 'multi') r[c.k] = t.split(/\s*[,;]\s*/).filter(Boolean).map(v => c.o.find(z => norm(z) === norm(v)) || v);
          else if (c.t === 'entites') r[c.k] = /^toutes/i.test(t) ? [] : t.split(/\s*;\s*/).filter(Boolean).map(v => { const e2 = trouverEntite(r[c.dep] || 'ECOLE', v); return e2 ? String(e2.cle) : null; }).filter(Boolean);
          else if (c.t === 'ecole') { const ec = trouverEntite('ECOLE', t); r[c.k] = ec ? String(ec.cle) : ''; r[c.k + 'Lib'] = ec ? ec.lib : t; }
          else if (c.t === 'ref') { const cand = (nouv && c.o === o.coll ? nouv : etat[c.o]).filter(z => visible(z) && norm(libRef(c.o, z.id)) === norm(t)); const pref = cand.find(z => saisonDe(z) === s) || cand[0]; r[c.k] = pref ? pref.id : ''; if (t && !pref) rejets.push(`Ligne ${x._ligne} : « ${t} » introuvable dans « ${(ongletColl(c.o) || {}).titre} » (champ laissé vide)`); }
          else r[c.k] = t;
        });
        const manque = o.champs.filter(c => c.req && (Array.isArray(r[c.k]) ? !r[c.k].length : vide(r[c.k])));
        if (recueExt) { if (!recue(r)) { rejets.push(`Ligne ${x._ligne} : note de « ${e.lib} » sans destinataire dans votre périmètre`); return; } r.recue = true; }
        if (manque.length) { rejets.push(`Ligne ${x._ligne} : ${manque.map(c => c.l).join(', ')} manquant(s)`); return; }
        if (AVANT[o.coll]) AVANT[o.coll](r, api);
        const cle = (z) => (o.unique || []).map(k => norm(Array.isArray(z[k]) ? z[k].join(',') : z[k])).join('|');
        const ex = (o.unique || []).length ? nouv.find(z => z.niveau === r.niveau && String(z.entite) === r.entite && saisonDe(z) === s && cle(z) === cle(r)) : null;
        if (ex) { Object.assign(ex, Object.fromEntries(Object.entries(r).filter(([, v]) => !vide(v))), { maj: new Date().toISOString() }); stats.m++; }
        else { nouv.push(Object.assign({ id: uid(), cree: auj(), maj: new Date().toISOString() }, r)); stats.a++; }
      });
      const ok = await dialogue('Importer — ' + o.titre, h('div', {}, h('p', {}, `${stats.a} ligne(s) à ajouter, ${stats.m} à mettre à jour.`),
        rejets.length ? [h('p', {}, h('b', {}, rejets.length + ' remarque(s) :')), h('div', { class: 'pvs-rapport' }, rejets.map(z => h('div', {}, z)))] : null),
      [{ l: 'Annuler', v: false }, { l: '\uE00B Importer', p: true, v: true, id: 'importer' }]);
      if (!ok) return;
      etat[o.coll] = nouv; await sauver(); toast('Import terminé.'); dessiner();
    }

    /* ---------- rubrique générique ---------- */
    function filtrer(o) {
      const f = F[o.id] = F[o.id] || { niveau: memo.get(MOD.id + '.niv') || '', entite: '', saison: memo.get(MOD.id + '.saison') || saisonCourante(), q: '', ref: '' };
      const refF = o.champs.find(c => c.t === 'ref');
      return lignes(o.coll).filter(r => (!f.niveau || r.niveau === f.niveau) && (!f.entite || (f.niveau ? String(r.entite) === String(f.entite) : true))
        && (!f.saison || saisonDe(r) === f.saison) && (!f.ref || !refF || r[refF.k] === f.ref)
        && (!f.q || norm(o.champs.map(c => valeur(c, r, true)).join(' ') + ' ' + (r.entiteLib || '')).includes(norm(f.q))));
    }
    function barreFiltres(o, apres) {
      const f = F[o.id];
      const nivs = (o.niveaux || NIVEAUX.map(n => n[0])).filter(n => niveauxCtx().includes(n));
      const sNiv = selectListe(nivs.map(n => [n, LIB_NIVEAU[n]]), f.niveau, 'Tous les niveaux');
      const sEnt = selectListe(f.niveau ? entites(f.niveau).map(e => [e.cle, e.lib]) : [], f.entite, 'Toutes');
      sEnt.disabled = !f.niveau;
      const sSai = selectListe(saisons(), f.saison, 'Toutes les saisons');
      const q = h('input', { type: 'search', value: f.q, placeholder: 'Nom, école…' });
      const refF = o.champs && o.champs.find(c => c.t === 'ref');
      const sRef = refF ? selectListe(optionsRef(refF, { saison: f.saison }), f.ref, 'Toutes') : null;
      sNiv.onchange = () => { f.niveau = sNiv.value; f.entite = ''; memo.set(MOD.id + '.niv', f.niveau); apres(); };
      sEnt.onchange = () => { f.entite = sEnt.value; apres(); };
      sSai.onchange = () => { f.saison = sSai.value; memo.set(MOD.id + '.saison', f.saison); apres(); };
      if (sRef) sRef.onchange = () => { f.ref = sRef.value; apres(); };
      let tq; q.oninput = () => { clearTimeout(tq); tq = setTimeout(() => { f.q = q.value; apres(true); }, 250); };
      return h('div', { class: 'pvs-barre' },
        nivs.length > 1 ? h('label', {}, 'Niveau', sNiv) : null, nivs.length > 1 || entites(nivs[0]).length > 1 ? h('label', {}, 'Entité', nivs.length > 1 ? sEnt : (() => { const s2 = selectListe(entites(nivs[0]).map(e => [e.cle, e.lib]), f.entite, 'Toutes'); s2.onchange = () => { f.niveau = nivs[0]; f.entite = s2.value; apres(); }; return s2; })()) : null,
        h('label', {}, o.annee ? 'Année scolaire' : 'Saison', sSai), sRef ? h('label', {}, refF.l, sRef) : null, h('label', {}, 'Recherche', q));
    }
    function rubrique(o, zone) {
      const box = h('div', {});
      const apres = () => (o.vue || MOD.id === 'communication' || MOD.id === 'sante' ? dessiner() : dessinerTable());
      const dessinerTable = (garderFocus) => {
        const rows = filtrer(o);
        if (!garderFocus) box.replaceChildren(barreFiltres(o, (g) => dessinerTable(g)));
        else while (box.childNodes.length > 1) box.lastChild.remove();
        const colsN = (o.niveaux || []).length > 1;
        const cols = o.champs.filter(c => !c.cache);
        const ecrireUneLigne = rows.some(r => peut(r.niveau, r.entite));
        const ew = entitesEcrivables(o).length > 0;
        const outils = (OUTILS[o.coll] ? OUTILS[o.coll](o, rows) : []).filter(Boolean);
        box.append(h('div', { class: 'pvs-actions' },
          ew ? h('button', { class: 'pvs-btn p', type: 'button', 'data-pvs': 'ajouter', onclick: async () => { if (await formulaire(o)) apres(); } }, '\uE001 Ajouter') : null,
          h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'excel', onclick: () => exporter([feuille(o, rows)], o.coll) }, '\uE015 Excel'),
          ew ? h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'importer', onclick: () => importer(o) }, '\uE00B Importer') : null,
          h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'liste', onclick: () => imprimerListe(o, rows) }, '\uE008 Liste certifiée'),
          ecrireUneLigne ? h('button', { class: 'pvs-btn d', type: 'button', 'data-pvs': 'reinitialiser', onclick: async () => {
            const cibles = rows.filter(r => peut(r.niveau, r.entite));
            if (!(await confirmer('Réinitialiser — ' + o.titre, `Supprimer les ${cibles.length} ligne(s) affichée(s) (filtres en cours) ? Pensez à exporter l’Excel avant.`, '\uE058 Réinitialiser'))) return;
            const ids = new Set(cibles.map(r => r.id)); etat[o.coll] = etat[o.coll].filter(r => !ids.has(r.id)); await sauver(); apres();
          } }, '\uE058 Réinitialiser') : null, ...outils));
        if (!rows.length) { box.append(h('p', { class: 'pvs-vide' }, 'Aucune ligne pour ces filtres.' + (ew ? ' Utilisez « \uE001 Ajouter » ou « \uE00B Importer ».' : ''))); return; }
        const parGroupe = (l, k) => { const g = {}; l.forEach(x => (g[x[k]] = g[x[k]] || []).push(x)); return Object.assign({}, ...Object.values(g).map(rangsPoints)); };
        const rang = o.coll === 'performances' ? rangsPerformances(lignes('performances')) : o.coll === 'resultats' ? parGroupe(lignes('resultats'), 'competition') : o.coll === 'participants' ? parGroupe(lignes('participants'), 'concours') : null;
        const tete = ['N°'].concat(colsN ? ['Niveau'] : [], ['Entité'], cols.map(c => c.l), rang ? ['Rang'] : [], ['']);
        const tb = h('tbody', {});
        rows.slice(0, 1500).forEach((r, i) => {
          const w = peut(r.niveau, r.entite);
          tb.append(h('tr', { 'data-id': r.id }, h('td', { class: 'c' }, i + 1), colsN ? h('td', {}, LIB_NIVEAU[r.niveau] || r.niveau) : null, h('td', {}, r.entiteLib || ''),
            cols.map(c => h('td', { class: c.t === 'num' || c.t === 'calc' ? 'n' : '' }, String(valeur(c, r)))), rang ? h('td', { class: 'c' }, rang[r.id] || '') : null,
            h('td', { class: 'act' },
              (o.docsLigne || []).map(d => h('button', { class: 'pvs-btn s', type: 'button', title: d.l, 'data-pvs': 'doc-' + d.type, onclick: () => DOCS[d.type](r, o) }, d.l.split(' ')[0])),
              (o.actionsLigne || []).map(a => h('button', { class: 'pvs-btn s', type: 'button', title: a.l, 'data-pvs': 'action-' + a.id, onclick: () => ACTIONS[a.id](r, o) }, a.l.split(' ')[0])),
              w ? h('button', { class: 'pvs-btn s', type: 'button', title: 'Modifier', 'data-pvs': 'modifier', onclick: async () => { if (await formulaire(o, r)) apres(); } }, '\uE006') : null,
              w ? h('button', { class: 'pvs-btn s d', type: 'button', title: 'Supprimer', 'data-pvs': 'supprimer', onclick: async () => {
                if (!(await confirmer('Supprimer', `Supprimer « ${(o.lib && o.lib(r, api)) || 'cette ligne'} » ?`, '\uE005 Supprimer'))) return;
                etat[o.coll] = etat[o.coll].filter(x => x.id !== r.id); await sauver(); apres();
              } }, '\uE005') : null)));
        });
        box.append(h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t' }, h('thead', {}, h('tr', {}, tete.map(t => h('th', {}, t)))), tb)));
        if (rows.length > 1500) box.append(h('p', { class: 'pvs-aide' }, 'Les 1 500 premières lignes sont affichées ; l’Excel contient tout.'));
      };
      dessinerTable();
      zone.append(box);
    }
    function imprimerListe(o, rows) {
      if (!rows.length) { toast('Aucune ligne à imprimer.'); return; }
      const f = F[o.id] || {};
      const niv = f.niveau && f.entite ? f.niveau : (ctx.autorite || {}).niveau, cle = f.niveau && f.entite ? f.entite : (ctx.autorite || {}).cle;
      const cols = o.champs.filter(c => !c.cache);
      const ent = f.niveau && f.entite ? (entite(f.niveau, f.entite) || {}).lib : '';
      document_('LISTE', { onglet: o.id, coll: o.coll, ids: rows.map(r => r.id) }, async () => {
        const visa = niv && cle ? await sigVisa(niv, cle, '') : { html: blocSig('Le Responsable', '', '', ''), nom: '' };
        return { titre: o.titre + (ent ? ' — ' + ent : ''), corps: '<p class="c">' + esc(MOD.titre) + (f.saison ? ' — ' + (o.annee ? 'année scolaire ' : 'saison ') + esc(f.saison) : '') + ' — ' + rows.length + ' ligne(s)</p>'
          + tableDoc(['N°', 'Entité'].concat(cols.map(c => c.l)), rows.map((r, i) => [i + 1, r.entiteLib || ''].concat(cols.map(c => valeur(c, r))))),
          sigs: [visa], resume: { entite: ent || (niv ? (entite(niv, cle) || {}).lib : ''), objet: o.titre, mention: rows.length + ' ligne(s)', signataire: visa.nom } };
      });
    }

    /* ---------- outils propres à certaines rubriques ---------- */
    const OUTILS = {
      licences: (o) => [A.eleves ? h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'depuis-eleves', onclick: () => licencesDepuisEleves(o) }, '\uE01F Depuis la liste des élèves') : null],
      competitions: (o, rows) => [h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'reporter-uascep', onclick: () => reporterUascep(rows) }, '\uE00C Reporter dans le registre UASCEP')]
    };
    async function licencesDepuisEleves(o) {
      const ew = entitesEcrivables(o); const f = F[o.id] || {};
      const ec = (ew[0] || [null, []])[1].find(e => String(e.cle) === String(f.entite)) || ((ew[0] || [null, []])[1].length === 1 ? ew[0][1][0] : null);
      if (!ec) { toast('Choisissez d’abord l’école dans le filtre « Entité ».'); return; }
      let el = []; try { el = (await A.eleves(ec.cle)) || []; } catch (e) { el = []; }
      if (!el.length) { toast('Aucun élève trouvé pour ' + ec.lib + '.'); return; }
      const saison = f.saison || saisonCourante();
      const deja = new Set(etat.licences.filter(l => String(l.entite) === String(ec.cle) && l.saison === saison).map(l => norm(l.nom + ' ' + l.prenoms)));
      const nouveaux = el.filter(x => x.nom && !deja.has(norm(String(x.nom).toUpperCase() + ' ' + (x.prenoms || ''))));
      if (!(await confirmer('Licences depuis la liste des élèves', `${nouveaux.length} élève(s) de ${ec.lib} sans licence pour ${saison}. Créer leurs licences (aptitude « Non examiné ») ?`, '\uE001 Créer', false))) return;
      nouveaux.forEach(x => { const r = { id: uid(), cree: auj(), maj: new Date().toISOString(), niveau: 'ECOLE', entite: String(ec.cle), entiteLib: ec.lib, saison, nom: x.nom, prenoms: x.prenoms || '', sexe: x.sexe === 'F' ? 'F' : x.sexe ? 'M' : '', dateNaissance: iso(x.dateNaissance), lieuNaissance: x.lieuNaissance || '', cours: x.cours || '', aptitude: x.aptitude || 'Non examiné', disciplines: [] }; AVANT.licences(r); etat.licences.push(r); });
      await sauver(); toast(nouveaux.length + ' licence(s) créée(s).'); dessiner();
    }
    /** Écrit les compétitions dans les « Activités » du bureau UASCEP de l'entité (rapport de fin de saison) */
    async function reporterUascep(rows) {
      if (!A.uascep) { toast('Bureaux UASCEP indisponibles dans cette application.'); return; }
      const U = await A.uascep().charger(); if (!U) { toast('Aucun bureau UASCEP enregistré.'); return; }
      U.activites = Array.isArray(U.activites) ? U.activites : [];
      let n = 0; const sans = [];
      rows.filter(c => peut(c.niveau, c.entite)).forEach(c => {
        const b = (U.bureaux || []).find(x => x.niveau === c.niveau && String(x.entite) === String(c.entite) && x.statut !== 'archive');
        if (!b) { sans.push(c.entiteLib); return; }
        const eq = etat.equipes.filter(q => q.competition === c.id), pal = etat.palmares.filter(p => p.competition === c.id).sort((x, y) => num(x.rang) - num(y.rang));
        const indiv = etat.performances.filter(p => p.competition === c.id).concat(etat.resultats.filter(p => p.competition === c.id));
        const ecolesSet = new Set(eq.map(q => q.ecoleLib || q.equipe).concat(indiv.map(p => p.ecoleLib || '')).filter(Boolean));
        const pg = eq.reduce((s, q) => s + num(q.joueursG), 0) + indiv.filter(p => p.sexe === 'M').length, pf = eq.reduce((s, q) => s + num(q.joueursF), 0) + indiv.filter(p => p.sexe === 'F').length;
        const v = { bureauId: b.id, saison: c.saison, date: c.dateDebut || '', discipline: c.discipline || '', categorie: c.categorie || '', genre: c.genre || '', phase: c.formule || '', lieu: c.lieu || '',
          ecoles: [...ecolesSet].join(', '), equipes: eq.length || '', pg: pg || '', pf: pf || '', encadreurs: eq.filter(q => q.encadreur).length || '',
          resultats: pal.filter(p => num(p.rang) <= 3).map(p => p.rang + '. ' + p.laureat).join(' ; '), qualifies: pal.filter(p => p.qualifie === 'Oui').map(p => p.laureat).join(', '),
          observations: (c.intitule || '') + ' — reporté depuis « Sport scolaire »', pvsRef: c.id, maj: new Date().toISOString() };
        const ex = U.activites.find(a => a.pvsRef === c.id);
        if (ex) Object.assign(ex, v); else U.activites.push(Object.assign({ id: uid(), cree: auj() }, v));
        n++;
      });
      await A.uascep().enregistrer(U); uasCache = null;
      toast(n + ' compétition(s) reportée(s) dans le registre des activités UASCEP' + (sans.length ? ' ; sans bureau UASCEP actif : ' + [...new Set(sans)].join(', ') : '') + '.');
    }

    /* ---------- documents (lot A) ---------- */
    const compDe = (id) => etat.competitions.find(c => c.id === id) || {};
    const eqLib = (id) => libRef('equipes', id) || '—';
    const DOCS = {
      LICENCE: (r) => document_('LICENCE', { id: r.id }, async () => {
        const p = await sigUascep('ECOLE', r.entite, 'P'), v = await sigVisa('ECOLE', r.entite);
        return { titre: 'Licence sportive scolaire — saison ' + (r.saison || ''), corps: '<div class="pvs-cadre"><div class="pvs-lic"><div class="pvs-photo">Photo</div><div class="pvs-kv">'
          + [['N° de licence', r.numero], ['Nom et prénoms', nomComplet(r)], ['Sexe', r.sexe], ['Né(e) le', fr(r.dateNaissance) + (r.lieuNaissance ? ' à ' + r.lieuNaissance : '')], ['École', r.entiteLib],
            ['Cours', r.cours], ['Catégorie', r.categorie], ['Disciplines', (r.disciplines || []).join(', ')], ['Aptitude médicale', r.aptitude + (r.dateVisite ? ' (visite du ' + fr(r.dateVisite) + ')' : '')]]
            .map(([k, x]) => '<b>' + esc(k) + '</b><span>' + esc(x || '—') + '</span>').join('') + '</div></div></div>',
          uas: ['ECOLE', r.entite], sigs: [p, v], resume: { entite: r.entiteLib, objet: nomComplet(r), mention: r.numero, signataire: p.nom || v.nom } };
      }),
      PARTICIPATION: (r, o) => document_('PARTICIPATION', { coll: o.coll, id: r.id }, async () => {
        const c = o.coll === 'equipes' ? compDe(r.competition) : null;
        const niv = c ? c.niveau : r.niveau, cle = c ? c.entite : r.entite;
        const p = await sigUascep(niv, cle, 'P'), v = await sigVisa(niv, cle);
        const ent = (entite(niv, cle) || {}).lib || '';
        const pres = p.nom ? ('Je soussigné(e) <b>' + esc(p.nom) + '</b>, président(e) du bureau de l’UASCEP — ' + esc(ent) + ', atteste que ') : ('L’UASCEP — ' + esc(ent) + ' atteste que ');
        const qui = o.coll === 'equipes' ? 'l’équipe <b>' + esc(r.equipe) + '</b>' + (r.ecoleLib ? ' (' + esc(r.ecoleLib) + ')' : '') + (r.effectif || num(r.joueursG) + num(r.joueursF) ? ', composée de ' + (num(r.joueursG) + num(r.joueursF)) + ' élève(s),' : '')
          : (r.sexe === 'F' ? 'l’élève' : 'l’élève') + ' <b>' + esc(nomComplet(r)) + '</b>, licence n° ' + esc(r.numero || '—') + ', de l’école ' + esc(r.entiteLib) + ',';
        const quoi = c ? ' a participé à la compétition « <b>' + esc(c.intitule) + '</b> » (' + esc([c.discipline, c.categorie, c.genre].filter(Boolean).join(', ')) + ')'
          + (c.dateDebut ? ' du ' + esc(fr(c.dateDebut)) + (c.dateFin ? ' au ' + esc(fr(c.dateFin)) : '') : '') + (c.lieu ? ' à ' + esc(c.lieu) : '') + ', saison ' + esc(c.saison || '') + '.'
          : ' a pris part aux activités sportives scolaires de la saison ' + esc(r.saison || '') + ((r.disciplines || []).length ? ' (' + esc(r.disciplines.join(', ')) + ')' : '') + '.';
        return { titre: 'Attestation de participation', corps: '<p class="j" style="margin-top:18px">' + pres + qui + quoi + '</p><p class="j">En foi de quoi la présente attestation lui est délivrée pour servir et valoir ce que de droit.</p>',
          uas: [niv, cle], sigs: [p, v], resume: { entite: ent, objet: o.coll === 'equipes' ? r.equipe : nomComplet(r), mention: c ? c.intitule : 'saison ' + (r.saison || ''), signataire: p.nom || v.nom } };
      }),
      CALENDRIER: (c) => document_('CALENDRIER', { id: c.id }, async () => {
        const ms = etat.matchs.filter(m => m.competition === c.id).sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9')) || String(a.heure || '').localeCompare(String(b.heure || '')) || num(a.journee) - num(b.journee));
        const sg = await sigUascep(c.niveau, c.entite, 'SG'), p = await sigUascep(c.niveau, c.entite, 'P'), v = await sigVisa(c.niveau, c.entite);
        return { titre: 'Calendrier des rencontres — ' + c.intitule, corps: infoComp(c) + tableDoc(['Phase', 'Poule', 'J.', 'Date', 'Heure', 'Terrain', 'Équipe A', 'Score', 'Équipe B', 'Arbitre'],
          ms.map(m => { const s = scoreMatch(m); return [m.phase, m.poule, m.journee, fr(m.date), m.heure, m.terrain, eqLib(m.equipeA), s[2] ? s[0] + ' – ' + s[1] + (m.forfait ? ' (forfait)' : '') : '', eqLib(m.equipeB), m.arbitre]; }), [0, 'c', 'c', 0, 'c', 0, 0, 'c', 0, 0]),
          uas: [c.niveau, c.entite], sigs: [sg, p, v], resume: { entite: c.entiteLib, objet: c.intitule, mention: ms.length + ' rencontre(s)', signataire: p.nom || v.nom } };
      }),
      FEUILLE: (m) => document_('FEUILLE', { id: m.id }, async () => {
        const c = compDe(m.competition), A_ = etat.equipes.find(q => q.id === m.equipeA) || {}, B_ = etat.equipes.find(q => q.id === m.equipeB) || {}, s = scoreMatch(m);
        const p = await sigUascep(c.niveau || m.niveau, c.entite || m.entite, 'P');
        const liste = (q) => '<ol style="margin:4px 0 0 18px;padding:0">' + String(q.liste || '').split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>';
        return { titre: 'Feuille de match', corps: infoComp(c) + tableDoc(['Phase', 'Poule', 'Journée', 'Date', 'Heure', 'Terrain'], [[m.phase, m.poule, m.journee, fr(m.date), m.heure, m.terrain]])
          + '<table class="pvs-imp"><thead><tr><th style="width:50%">Équipe A : ' + esc(A_.equipe || '') + '</th><th>Équipe B : ' + esc(B_.equipe || '') + '</th></tr></thead><tbody><tr><td>'
          + esc(A_.ecoleLib || '') + (A_.encadreur ? '<br>Encadreur : ' + esc(A_.encadreur) : '') + liste(A_) + '</td><td>' + esc(B_.ecoleLib || '') + (B_.encadreur ? '<br>Encadreur : ' + esc(B_.encadreur) : '') + liste(B_) + '</td></tr>'
          + '<tr><td style="text-align:center;font-size:16pt"><b>' + (s[2] ? s[0] : '…') + '</b></td><td style="text-align:center;font-size:16pt"><b>' + (s[2] ? s[1] : '…') + '</b></td></tr>'
          + '<tr><td>Buteurs / marqueurs : ' + esc(m.marqueursA || '') + '</td><td>Buteurs / marqueurs : ' + esc(m.marqueursB || '') + '</td></tr></tbody></table>'
          + (m.tab ? '<p>Tirs au but : ' + esc(m.tab) + '</p>' : '') + (m.forfait ? '<p><b>Forfait : ' + esc(m.forfait) + '</b></p>' : '')
          + '<p><b>Avertissements et exclusions :</b> ' + esc(m.cartons || 'néant') + '</p><p><b>Observations :</b> ' + esc(m.observations || 'néant') + '</p>',
          uas: [c.niveau || m.niveau, c.entite || m.entite], sigs: [blocSig('L’arbitre central', m.arbitre || '', '', ''), blocSig('Le délégué / commissaire', m.delegue || '', '', ''), blocSig('Capitaine A', A_.capitaine || '', '', ''), blocSig('Capitaine B', B_.capitaine || '', '', ''), p],
          resume: { entite: c.entiteLib || m.entiteLib, objet: eqLib(m.equipeA) + ' – ' + eqLib(m.equipeB), mention: s[2] ? s[0] + '-' + s[1] : 'à jouer', signataire: p.nom || m.arbitre || '' } };
      }),
      CLASSEMENT: (c) => document_('CLASSEMENT', { id: c.id }, async () => {
        const sg = await sigUascep(c.niveau, c.entite, 'SG'), p = await sigUascep(c.niveau, c.entite, 'P'), v = await sigVisa(c.niveau, c.entite);
        return { titre: 'Classement officiel — ' + c.intitule, corps: infoComp(c) + classementsHtml(c, true), uas: [c.niveau, c.entite], sigs: [sg, p, v], resume: { entite: c.entiteLib, objet: c.intitule, mention: 'classement', signataire: p.nom || v.nom } };
      }),
      PALMARES: (c) => docPalmares(c, false),
      QUALIFIES: (c) => docPalmares(c, true),
      DIPLOME: (r) => document_('DIPLOME', { id: r.id }, async () => {
        const c = compDe(r.competition), niv = c.niveau || r.niveau, cle = c.entite || r.entite;
        const p = await sigUascep(niv, cle, 'P'), v = await sigVisa(niv, cle);
        const ordinal = (k) => k === 1 ? '1<sup>re</sup>' : k + '<sup>e</sup>';
        const lg = await logoUas(niv, cle, 130);
        return { sansTitre: true, titre: 'Diplôme d’honneur', corps: '<div class="pvs-cadre pvs-dip">' + (lg ? '<div class="pvs-gl">' + lg + '</div>' : '') + '<div>UASCEP — ' + esc((entite(niv, cle) || {}).lib || c.entiteLib || '') + '</div><div class="gt">DIPLÔME D’HONNEUR</div>'
          + '<p>décerné à</p><div class="nm">' + esc(r.laureat) + '</div>' + (r.ecoleLib ? '<p>' + esc(r.ecoleLib) + '</p>' : '')
          + '<p>pour sa ' + ordinal(num(r.rang)) + ' place' + (r.distinction ? ' — <b>' + esc(r.distinction) + '</b>' : '') + '</p><p>à la compétition « <b>' + esc(c.intitule || '') + '</b> »'
          + (c.discipline ? ' (' + esc([c.discipline, c.categorie, c.genre].filter(Boolean).join(', ')) + ')' : '') + '</p><p>saison sportive ' + esc(c.saison || r.saison || '') + (c.lieu ? ' — ' + esc(c.lieu) : '') + '</p>'
          + (r.performance ? '<p>Performance : ' + esc(r.performance) + '</p>' : '') + '</div>',
          sigs: [p, v], resume: { entite: c.entiteLib || r.entiteLib, objet: r.laureat, mention: r.rang + (num(r.rang) === 1 ? 'er' : 'e') + ' — ' + (c.intitule || ''), signataire: p.nom || v.nom } };
      }),
      RECORDS: (rec, niv, cle) => document_('RECORDS', { ids: rec.map(x => x.id) }, async () => {
        const p = niv ? await sigUascep(niv, cle, 'P') : { html: '', nom: '' }, v = niv ? await sigVisa(niv, cle) : { html: '', nom: '' };
        return { titre: 'Tableau des records d’athlétisme scolaire', corps: tableDoc(['Épreuve', 'Catégorie', 'Sexe', 'Performance', 'Élève', 'École', 'Date', 'Saison'],
          rec.map(r => [r.epreuve, r.categorie, r.sexe, r.performance + ' ' + CAT().UNITE_EPREUVE(r.epreuve), nomComplet(r), r.ecoleLib || r.entiteLib, fr(r.date), r.saison])),
          uas: niv ? [niv, cle] : null, sigs: [p, v].filter(x => x.html), resume: { entite: niv ? (entite(niv, cle) || {}).lib : '', objet: 'Records', mention: rec.length + ' record(s)', signataire: p.nom || v.nom } };
      })
    };
    function infoComp(c) {
      return '<p class="c"><b>' + esc(c.intitule || '') + '</b> — ' + esc([c.discipline, c.categorie, c.genre].filter(Boolean).join(', ')) + '</p><p class="c">' + esc(LIB_NIVEAU[c.niveau] || '') + ' : ' + esc(c.entiteLib || '')
        + ' — saison ' + esc(c.saison || '') + (c.dateDebut ? ' — du ' + esc(fr(c.dateDebut)) + (c.dateFin ? ' au ' + esc(fr(c.dateFin)) : '') : '') + (c.lieu ? ' — ' + esc(c.lieu) : '') + '</p>';
    }
    function docPalmares(c, qualifies) {
      const type = qualifies ? 'QUALIFIES' : 'PALMARES';
      document_(type, { id: c.id }, async () => {
        let pal = etat.palmares.filter(p => p.competition === c.id).sort((a, b) => num(a.rang) - num(b.rang));
        if (qualifies) pal = pal.filter(p => p.qualifie === 'Oui');
        const sg = await sigUascep(c.niveau, c.entite, 'SG'), p = await sigUascep(c.niveau, c.entite, 'P'), v = await sigVisa(c.niveau, c.entite);
        const sup = superieure(c.niveau, c.entite);
        return { titre: (qualifies ? 'Qualifiés pour le niveau supérieur — ' : 'Palmarès officiel — ') + c.intitule,
          corps: infoComp(c) + (qualifies && sup ? '<p class="c">Transmis à : ' + esc(LIB_NIVEAU[sup[0]]) + ' — ' + esc((entite(sup[0], sup[1]) || {}).lib || '') + '</p>' : '')
            + tableDoc(['Rang', 'Lauréat', 'École', 'Sexe', 'Distinction', 'Performance / score'].concat(qualifies ? [] : ['Qualifié(e)']),
              pal.map(x => [x.rang, x.laureat, x.ecoleLib || '', x.sexe || '', x.distinction || '', x.performance || ''].concat(qualifies ? [] : [x.qualifie || ''])), ['c', 0, 0, 'c', 0, 0, 'c']),
          uas: [c.niveau, c.entite], sigs: [sg, p, v], resume: { entite: c.entiteLib, objet: c.intitule, mention: pal.length + (qualifies ? ' qualifié(s)' : ' lauréat(s)'), signataire: p.nom || v.nom } };
      });
    }

    /* ---------- classements ---------- */
    function poulesDe(c) {
      const eq = etat.equipes.filter(q => q.competition === c.id);
      const ms = etat.matchs.filter(m => m.competition === c.id && (m.phase === 'Poule' || m.phase === 'Journée de championnat' || !m.phase));
      const noms = [...new Set(eq.map(q => q.poule || '').concat(ms.map(m => m.poule || '')))].sort();
      return (noms.length ? noms : ['']).map(pn => ({ poule: pn, ids: eq.filter(q => (q.poule || '') === pn).map(q => q.id), matchs: ms.filter(m => (m.poule || '') === pn) }))
        .filter(x => x.ids.length || x.matchs.length);
    }
    function classementsHtml(c, doc) {
      if (individuelle(c)) {
        const perf = etat.performances.filter(p => p.competition === c.id), res = etat.resultats.filter(p => p.competition === c.id);
        let html = '';
        if (perf.length) {
          const rg = rangsPerformances(perf), g = {};
          perf.forEach(p => { const k = [p.epreuve, p.categorie, p.sexe, p.tour].join(' — '); (g[k] = g[k] || []).push(p); });
          Object.keys(g).sort().forEach(k => { const l = g[k].sort((a, b) => (rg[a.id] || 999) - (rg[b.id] || 999));
            html += '<h3>' + esc(k) + '</h3>' + tableDoc(['Rang', 'Élève', 'École', 'Performance'], l.map(p => [rg[p.id] || '—', nomComplet(p), p.ecoleLib || '', vide(p.performance) ? '—' : p.performance + ' ' + CAT().UNITE_EPREUVE(p.epreuve)]), ['c', 0, 0, 'n']); });
        }
        if (res.length) { const rg = rangsPoints(res); html += tableDoc(['Rang', 'Participant', 'École', 'Points / note'], res.slice().sort((a, b) => (rg[a.id] || 999) - (rg[b.id] || 999)).map(r => [rg[r.id] || '—', r.participant, r.ecoleLib || '', r.points]), ['c', 0, 0, 'n']); }
        return html || '<p>Aucune performance ni résultat enregistré.</p>';
      }
      let html = '';
      poulesDe(c).forEach(p => {
        const cl = classement(p.ids, p.matchs, eqLib);
        html += (p.poule ? '<h3>Poule ' + esc(p.poule) + '</h3>' : '') + tableDoc(['Rang', 'Équipe', 'École', 'J', 'G', 'N', 'P', 'BP', 'BC', 'Diff', 'Pts'],
          cl.map(x => [x.rang, eqLib(x.id), (etat.equipes.find(q => q.id === x.id) || {}).ecoleLib || '', x.J, x.G, x.N, x.P, x.BP, x.BC, x.Diff, { html: '<b>' + x.Pts + '</b>' }]), ['c', 0, 0, 'c', 'c', 'c', 'c', 'c', 'c', 'c', 'c']);
      });
      const ko = etat.matchs.filter(m => m.competition === c.id && KO.concat(['Match pour la 3e place']).includes(m.phase));
      if (ko.length) html += '<h3>Phase finale</h3>' + tableDoc(['Phase', 'Équipe A', 'Score', 'Équipe B', 'Qualifié / vainqueur'], ko.sort((a, b) => KO.indexOf(a.phase) - KO.indexOf(b.phase)).map(m => { const s = scoreMatch(m); return [m.phase, eqLib(m.equipeA), s[2] ? s[0] + ' – ' + s[1] + (m.tab ? ' (t.a.b. ' + m.tab + ')' : '') : 'à jouer', eqLib(m.equipeB), vainqueur(m) ? eqLib(vainqueur(m)) : '']; }));
      return html || (doc ? '<p>Aucune rencontre.</p>' : '');
    }
    /** Proposition de palmarès : finale, 3e place, sinon classement, performances ou points */
    function proposerPalmares(c) {
      const out = [], nq = num(c.nbQualifies);
      const dist = (k) => k === 1 ? 'Médaille d’or' : k === 2 ? 'Médaille d’argent' : k === 3 ? 'Médaille de bronze' : '';
      const ecDe = (id) => { const q = etat.equipes.find(x => x.id === id) || {}; return [q.ecole || '', q.ecoleLib || '']; };
      if (individuelle(c)) {
        const perf = etat.performances.filter(p => p.competition === c.id && (p.tour || 'Finale') === 'Finale'), rg = rangsPerformances(perf), g = {};
        perf.forEach(p => { const k = [p.epreuve, p.categorie, p.sexe].join('|'); (g[k] = g[k] || []).push(p); });
        Object.values(g).forEach(l => l.filter(p => rg[p.id] && rg[p.id] <= Math.max(3, nq)).forEach(p => out.push({ rang: rg[p.id], laureat: nomComplet(p) + ' — ' + p.epreuve + (p.categorie ? ' ' + p.categorie : ''), sexe: p.sexe, ecole: p.ecole || '', ecoleLib: p.ecoleLib || '', distinction: dist(rg[p.id]), performance: p.performance + ' ' + CAT().UNITE_EPREUVE(p.epreuve), qualifie: rg[p.id] <= nq ? 'Oui' : 'Non' })));
        const res = etat.resultats.filter(p => p.competition === c.id), rr = rangsPoints(res);
        res.filter(r => rr[r.id] && rr[r.id] <= Math.max(3, nq)).forEach(r => out.push({ rang: rr[r.id], laureat: r.participant, sexe: r.sexe || '', ecole: r.ecole || '', ecoleLib: r.ecoleLib || '', distinction: dist(rr[r.id]), performance: vide(r.points) ? '' : r.points + ' pts', qualifie: rr[r.id] <= nq ? 'Oui' : 'Non' }));
        return out;
      }
      const fin = etat.matchs.find(m => m.competition === c.id && m.phase === 'Finale' && vainqueur(m));
      const ajouter = (k, id, perf) => { if (!id) return; const [e, el] = ecDe(id); out.push({ rang: k, laureat: eqLib(id), ecole: e, ecoleLib: el, distinction: dist(k), performance: perf || '', qualifie: k <= nq ? 'Oui' : 'Non' }); };
      if (fin) {
        const s = scoreMatch(fin);
        ajouter(1, vainqueur(fin), 'Finale ' + s[0] + '-' + s[1]); ajouter(2, perdant(fin), 'Finaliste');
        const p3 = etat.matchs.find(m => m.competition === c.id && m.phase === 'Match pour la 3e place' && vainqueur(m));
        if (p3) { ajouter(3, vainqueur(p3), '3e place'); ajouter(4, perdant(p3), ''); }
        else etat.matchs.filter(m => m.competition === c.id && m.phase === 'Demi-finales' && vainqueur(m)).forEach(m => ajouter(3, perdant(m), 'Demi-finaliste'));
        return out;
      }
      const ps = poulesDe(c);
      if (ps.length === 1) classement(ps[0].ids, ps[0].matchs, eqLib).slice(0, Math.max(3, nq)).forEach(x => ajouter(x.rang, x.id, x.Pts + ' pts'));
      else ps.forEach(p => classement(p.ids, p.matchs, eqLib).slice(0, Math.max(1, num(c.qualifiesPoule))).forEach(x => { const [e, el] = ecDe(x.id); out.push({ rang: x.rang, laureat: eqLib(x.id) + ' (poule ' + p.poule + ')', ecole: e, ecoleLib: el, distinction: '', performance: x.Pts + ' pts', qualifie: 'Non' }); }));
      return out;
    }

    /* ---------- vues calculées (lot A) ---------- */
    function choisirCompetition(filtreC, cle) {
      const s = memo.get(MOD.id + '.saison') || saisonCourante();
      const l = lignes('competitions').filter(c => (!s || c.saison === s) && (!filtreC || filtreC(c))).sort((a, b) => String(a.intitule).localeCompare(String(b.intitule), 'fr'));
      const cur = memo.get(MOD.id + '.' + cle) || (l[0] || {}).id || '';
      const sel = selectListe(l.map(c => [c.id, c.intitule + ' — ' + (c.entiteLib || '')]), cur, null);
      const sSai = selectListe(saisons(), s, null);
      sSai.onchange = () => { memo.set(MOD.id + '.saison', sSai.value); dessiner(); };
      sel.onchange = () => { memo.set(MOD.id + '.' + cle, sel.value); dessiner(); };
      return { barre: h('div', { class: 'pvs-barre' }, h('label', {}, 'Saison', sSai), h('label', { style: 'max-width:520px;flex:3 1 300px' }, 'Compétition', sel)), c: l.find(c => c.id === sel.value) || l[0] || null };
    }
    const VUES = {
      tirage(zone) {
        const { barre, c } = choisirCompetition((x) => !individuelle(x), 'cTirage');
        zone.append(barre);
        if (!c) { zone.append(h('p', { class: 'pvs-vide' }, 'Aucune compétition par équipes pour cette saison : créez-la dans « Compétitions » et engagez les équipes.')); return; }
        const eq = etat.equipes.filter(q => q.competition === c.id), ms = etat.matchs.filter(m => m.competition === c.id), w = peut(c.niveau, c.entite);
        const ko = /^Élimination/.test(c.formule || ''), champ = /^Championnat/.test(c.formule || '');
        const nbP = h('input', { type: 'number', min: 1, max: 16, value: ko ? 1 : champ ? 1 : Math.max(1, num(c.nbPoules) || 2), class: 'pvs-in', style: 'max-width:90px' });
        zone.append(h('div', { class: 'pvs-carte' }, h('h3', {}, '\uE079 ' + c.intitule),
          h('p', { class: 'pvs-aide' }, `${eq.length} équipe(s) engagée(s) — formule : ${c.formule || '—'} — ${ms.length} rencontre(s) déjà au calendrier.`),
          eq.length < 2 ? h('p', { class: 'pvs-vide' }, 'Engagez au moins deux équipes dans « Équipes engagées ».') : null,
          !ko && !champ ? h('label', { class: 'pvs-aide' }, 'Nombre de poules ', nbP) : null,
          h('div', { class: 'pvs-actions' },
            w && eq.length >= 2 ? h('button', { class: 'pvs-btn p', type: 'button', 'data-pvs': 'tirer', onclick: async () => {
              const aRemplacer = ms.filter(m => !scoreMatch(m)[2]);
              if (ms.some(m => scoreMatch(m)[2]) && !(await confirmer('Tirage au sort', 'Des rencontres sont déjà jouées : seules les rencontres non jouées seront remplacées. Continuer ?', 'Continuer', false))) return;
              if (aRemplacer.length && !ms.some(m => scoreMatch(m)[2]) && !(await confirmer('Tirage au sort', `Remplacer les ${aRemplacer.length} rencontre(s) programmée(s) par un nouveau tirage ?`, '\uE079 Tirer au sort'))) return;
              const ids = new Set(aRemplacer.map(m => m.id)); etat.matchs = etat.matchs.filter(m => !ids.has(m.id));
              const mel = melanger(eq), base = { niveau: c.niveau, entite: c.entite, entiteLib: c.entiteLib, saison: c.saison, competition: c.id, statut: 'Programmé', terrain: c.lieu || '' };
              const nouv = (o) => etat.matchs.push(Object.assign({ id: uid(), cree: auj(), maj: new Date().toISOString() }, base, o));
              if (ko) {
                mel.forEach(q => { q.poule = ''; });
                const phase = PHASE_KO(mel.length);
                for (let i = 0; i + 1 < mel.length; i += 2) nouv({ phase, journee: 1, equipeA: mel[i].id, equipeB: mel[i + 1].id });
                if (mel.length % 2) toast('Exempt au premier tour : ' + mel[mel.length - 1].equipe);
              } else {
                const np = champ ? 1 : Math.min(Math.max(1, num(nbP.value)), Math.floor(mel.length / 2) || 1);
                const lettres = 'ABCDEFGHIJKLMNOP';
                mel.forEach((q, i) => { q.poule = np > 1 ? lettres[i % np] : ''; q.maj = new Date().toISOString(); });
                for (let k = 0; k < np; k++) {
                  const membres = mel.filter((q, i) => i % np === k).map(q => q.id), pn = np > 1 ? lettres[k] : '';
                  tourniquet(membres).forEach(([a, b, j]) => nouv({ phase: champ ? 'Journée de championnat' : 'Poule', poule: pn, journee: j, equipeA: a, equipeB: b }));
                  if (/aller-retour/.test(c.formule || '')) { const nj = membres.length % 2 ? membres.length : membres.length - 1; tourniquet(membres).forEach(([a, b, j]) => nouv({ phase: 'Journée de championnat', poule: pn, journee: j + nj, equipeA: b, equipeB: a })); }
                }
              }
              c.statut = c.statut === 'Programmée' ? 'En cours' : c.statut;
              await sauver(); toast('Tirage effectué : calendrier généré.'); dessiner();
            } }, '\uE079 Tirer au sort et générer le calendrier') : null,
            w ? h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'phase-suivante', onclick: () => phaseSuivante(c) }, '\uE03A Générer la phase suivante') : null,
            h('button', { class: 'pvs-btn', type: 'button', onclick: () => DOCS.CALENDRIER(c) }, '\uE017 Calendrier (PDF)'))));
        const pl = poulesDe(c);
        if (pl.some(p => p.poule)) zone.append(h('div', { class: 'pvs-poules' }, pl.map(p => h('div', { class: 'pvs-carte' }, h('h3', {}, 'Poule ' + (p.poule || 'unique')), h('ol', { style: 'margin:0;padding-left:18px' }, p.ids.map(id => h('li', {}, eqLib(id))))))));
        const tab = etat.matchs.filter(m => m.competition === c.id).sort((a, b) => (KO.indexOf(a.phase) + 1) - (KO.indexOf(b.phase) + 1) || String(a.poule || '').localeCompare(String(b.poule || '')) || num(a.journee) - num(b.journee));
        if (tab.length) zone.append(h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t' }, h('thead', {}, h('tr', {}, ['Phase', 'Poule', 'J.', 'Équipe A', 'Score', 'Équipe B', 'Date', 'Statut'].map(t => h('th', {}, t)))),
          h('tbody', {}, tab.map(m => { const s = scoreMatch(m); return h('tr', {}, h('td', {}, m.phase), h('td', { class: 'c' }, m.poule || ''), h('td', { class: 'c' }, m.journee || ''), h('td', {}, eqLib(m.equipeA)), h('td', { class: 'c' }, s[2] ? s[0] + ' – ' + s[1] : '—'), h('td', {}, eqLib(m.equipeB)), h('td', {}, fr(m.date)), h('td', {}, m.statut || '')); })))));
      },
      classements(zone) {
        const { barre, c } = choisirCompetition(null, 'cClass');
        zone.append(barre);
        if (!c) { zone.append(h('p', { class: 'pvs-vide' }, 'Aucune compétition pour cette saison.')); return; }
        zone.append(h('div', { class: 'pvs-actions' }, h('button', { class: 'pvs-btn p', type: 'button', 'data-pvs': 'doc-CLASSEMENT', onclick: () => DOCS.CLASSEMENT(c) }, '\uE008 Classement officiel (PDF signé)'),
          h('button', { class: 'pvs-btn', type: 'button', onclick: () => exporter([{ nom: 'Classement', lignes: tableVersLignes(classementsHtml(c, true)), entete: 0 }], 'classement') }, '\uE015 Excel')));
        zone.append(h('div', { class: 'pvs-carte', html: CSS_DOC + '<div class="pvs-doc">' + classementsHtml(c, false) + '</div>' }));
      },
      records(zone) {
        const perf = lignes('performances').filter(p => !vide(p.performance)), best = {};
        perf.forEach(p => { const k = [p.epreuve, p.categorie, p.sexe].join('|'), asc = CAT().UNITE_EPREUVE(p.epreuve) === 's';
          if (!best[k] || (asc ? num(p.performance) < num(best[k].performance) : num(p.performance) > num(best[k].performance))) best[k] = p; });
        const rec = Object.values(best).sort((a, b) => String(a.epreuve).localeCompare(String(b.epreuve), 'fr') || String(a.categorie).localeCompare(String(b.categorie)) || String(a.sexe).localeCompare(String(b.sexe)));
        const a = ctx.autorite || {};
        zone.append(h('p', { class: 'pvs-aide' }, 'Meilleure performance par épreuve, catégorie et sexe, toutes saisons confondues, dans votre périmètre.'),
          h('div', { class: 'pvs-actions' }, h('button', { class: 'pvs-btn p', type: 'button', 'data-pvs': 'doc-RECORDS', onclick: () => rec.length ? DOCS.RECORDS(rec, a.niveau, a.cle) : toast('Aucun record.') }, '\uE008 Tableau des records (PDF signé)'),
            h('button', { class: 'pvs-btn', type: 'button', onclick: () => exporter([{ nom: 'Records', lignes: [['Épreuve', 'Catégorie', 'Sexe', 'Performance', 'Unité', 'Nom', 'Prénoms', 'École', 'Date', 'Saison']].concat(rec.map(r => [r.epreuve, r.categorie, r.sexe, num(r.performance), CAT().UNITE_EPREUVE(r.epreuve), r.nom, r.prenoms, r.ecoleLib || r.entiteLib, fr(r.date), r.saison])), entete: 0 }], 'records') }, '\uE015 Excel')));
        zone.append(rec.length ? h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t' }, h('thead', {}, h('tr', {}, ['Épreuve', 'Catégorie', 'Sexe', 'Record', 'Élève', 'École', 'Date', 'Saison'].map(t => h('th', {}, t)))),
          h('tbody', {}, rec.map(r => h('tr', {}, h('td', {}, r.epreuve), h('td', {}, r.categorie || ''), h('td', { class: 'c' }, r.sexe || ''), h('td', { class: 'n' }, r.performance + ' ' + CAT().UNITE_EPREUVE(r.epreuve)), h('td', {}, nomComplet(r)), h('td', {}, r.ecoleLib || r.entiteLib), h('td', {}, fr(r.date)), h('td', {}, r.saison || ''))))))
          : h('p', { class: 'pvs-vide' }, 'Aucune performance enregistrée (rubrique « Athlétisme »).'));
      },
      palmares(zone) {
        const { barre, c } = choisirCompetition(null, 'cPal');
        const box = h('div', { class: 'pvs-carte' }, h('h3', {}, '\uE04C Palmarès d’une compétition'), barre);
        if (c) {
          const w = peut(c.niveau, c.entite), pal = etat.palmares.filter(p => p.competition === c.id);
          box.append(h('p', { class: 'pvs-aide' }, `${pal.length} lauréat(s) enregistré(s) ; qualifiés pour le niveau supérieur : ${num(c.nbQualifies)}.`),
            h('div', { class: 'pvs-actions' },
              w ? h('button', { class: 'pvs-btn p', type: 'button', 'data-pvs': 'proposer-palmares', onclick: async () => {
                const prop = proposerPalmares(c);
                if (!prop.length) { toast('Pas encore de résultat permettant de proposer un palmarès.'); return; }
                if (pal.length && !(await confirmer('Proposer le palmarès', `Remplacer les ${pal.length} lauréat(s) déjà enregistré(s) par la proposition calculée (${prop.length}) ?`, 'Remplacer'))) return;
                const ids = new Set(pal.map(p => p.id)); etat.palmares = etat.palmares.filter(p => !ids.has(p.id));
                prop.forEach(p => etat.palmares.push(Object.assign({ id: uid(), cree: auj(), maj: new Date().toISOString(), niveau: c.niveau, entite: c.entite, entiteLib: c.entiteLib, saison: c.saison, competition: c.id }, p)));
                if (c.statut !== 'Terminée') c.statut = 'Terminée';
                await sauver(); toast('Palmarès enregistré (modifiable ligne par ligne).'); dessiner();
              } }, '\uE03D Proposer le palmarès (calculé)') : null,
              w ? h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'qualifier', onclick: () => qualifier(c) }, '\uE00A Qualifier au niveau supérieur') : null,
              h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'doc-PALMARES', onclick: () => DOCS.PALMARES(c) }, '\uE008 Palmarès (PDF)'),
              h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'doc-QUALIFIES', onclick: () => DOCS.QUALIFIES(c) }, '\uE008 Liste des qualifiés (PDF)'),
              h('button', { class: 'pvs-btn', type: 'button', onclick: () => reporterUascep([c]) }, '\uE00C Reporter dans le registre UASCEP')));
        }
        zone.append(box);
      }
    };
    function tableVersLignes(html) {
      const d = h('div', { html }), out = [];
      d.querySelectorAll('h3, table').forEach(x => { if (x.tagName === 'H3') out.push([x.textContent]); else x.querySelectorAll('tr').forEach(tr => out.push([...tr.children].map(td => { const t = td.textContent.trim(); return /^-?\d+([.,]\d+)?$/.test(t) ? num(t) : t; }))); });
      return out;
    }
    async function phaseSuivante(c) {
      const ms = etat.matchs.filter(m => m.competition === c.id);
      const base = { niveau: c.niveau, entite: c.entite, entiteLib: c.entiteLib, saison: c.saison, competition: c.id, statut: 'Programmé', terrain: c.lieu || '' };
      const nouv = (o) => etat.matchs.push(Object.assign({ id: uid(), cree: auj(), maj: new Date().toISOString() }, base, o));
      const koJoues = ms.filter(m => KO.includes(m.phase));
      if (!koJoues.length) {
        const pl = poulesDe(c); if (!pl.length) { toast('Aucune poule.'); return; }
        if (pl.some(p => p.matchs.some(m => !scoreMatch(m)[2]))) { toast('Toutes les rencontres de poule doivent être jouées (ou déclarées forfait).'); return; }
        const q = Math.max(1, num(c.qualifiesPoule) || 2), cls = pl.map(p => classement(p.ids, p.matchs, eqLib));
        const tetes = []; for (let r = 0; r < q; r++) cls.forEach((cl, k) => { if (cl[r]) tetes.push({ id: cl[r].id, poule: k, r }); });
        if (tetes.length < 2) { toast('Pas assez d’équipes qualifiées.'); return; }
        const phase = PHASE_KO(tetes.length);
        const premiers = tetes.filter(t => t.r === 0), autres = tetes.filter(t => t.r > 0).reverse();
        const paires = [];
        if (pl.length === 1) { for (let i = 0; i < Math.floor(tetes.length / 2); i++) paires.push([tetes[i], tetes[tetes.length - 1 - i]]); }
        else premiers.forEach(p1 => { const k = autres.findIndex(a => a.poule !== p1.poule); const a = k >= 0 ? autres.splice(k, 1)[0] : autres.shift(); if (a) paires.push([p1, a]); });
        while (autres.length > 1) paires.push([autres.shift(), autres.shift()]);
        if (!(await confirmer('Phase suivante', `${paires.length} rencontre(s) de ${phase} : ` + paires.map(([a, b]) => eqLib(a.id) + ' – ' + eqLib(b.id)).join(' ; '), 'Générer', false))) return;
        paires.forEach(([a, b]) => nouv({ phase, journee: 1, equipeA: a.id, equipeB: b.id }));
      } else {
        const derniere = KO.filter(p => koJoues.some(m => m.phase === p)).pop();
        if (derniere === 'Finale') { toast('La finale est déjà programmée.'); return; }
        const tour = koJoues.filter(m => m.phase === derniere);
        if (tour.some(m => !vainqueur(m))) { toast('Toutes les rencontres de « ' + derniere + ' » doivent avoir un vainqueur (score ou tirs au but).'); return; }
        const gagnants = tour.map(vainqueur);
        if (derniere === 'Demi-finales') {
          if (!(await confirmer('Phase suivante', 'Finale : ' + eqLib(gagnants[0]) + ' – ' + eqLib(gagnants[1]) + ' ; match pour la 3e place : ' + eqLib(perdant(tour[0])) + ' – ' + eqLib(perdant(tour[1] || {})), 'Générer', false))) return;
          nouv({ phase: 'Finale', journee: 1, equipeA: gagnants[0], equipeB: gagnants[1] });
          if (tour[1]) nouv({ phase: 'Match pour la 3e place', journee: 1, equipeA: perdant(tour[0]), equipeB: perdant(tour[1]) });
        } else {
          const phase = KO[KO.indexOf(derniere) + 1];
          if (!(await confirmer('Phase suivante', phase + ' : ' + gagnants.length + ' équipe(s) qualifiée(s).', 'Générer', false))) return;
          for (let i = 0; i + 1 < gagnants.length; i += 2) nouv({ phase, journee: 1, equipeA: gagnants[i], equipeB: gagnants[i + 1] });
        }
      }
      await sauver(); toast('Phase suivante générée.'); dessiner();
    }
    async function qualifier(c) {
      const q = etat.palmares.filter(p => p.competition === c.id && p.qualifie === 'Oui');
      if (!q.length) { toast('Aucun lauréat marqué « Qualifié(e) = Oui » : proposez ou complétez le palmarès.'); return; }
      const sup = superieure(c.niveau, c.entite);
      const cibles = lignes('competitions').filter(x => x.id !== c.id && x.saison === c.saison && (!sup || x.niveau === sup[0]) && peut(x.niveau, x.entite))
        .sort((a, b) => (norm(b.discipline) === norm(c.discipline)) - (norm(a.discipline) === norm(c.discipline)));
      if (!cibles.length) {
        toast('Aucune compétition du niveau supérieur dans votre périmètre : imprimez la liste des qualifiés et transmettez-la' + (sup ? ' à ' + ((entite(sup[0], sup[1]) || {}).lib || LIB_NIVEAU[sup[0]]) : '') + '.');
        DOCS.QUALIFIES(c); return;
      }
      const sel = selectListe(cibles.map(x => [x.id, x.intitule + ' — ' + x.entiteLib]), cibles[0].id, null);
      const ok = await dialogue('Qualifier au niveau supérieur', h('div', { class: 'pvs-form' }, h('label', { class: 'large' }, 'Compétition du niveau supérieur', sel), h('p', { class: 'pvs-aide large' }, q.length + ' qualifié(s) : ' + q.map(p => p.laureat).join(', '))),
        [{ l: 'Annuler', v: null }, { l: '\uE00A Engager', p: true, id: 'engager', action: () => sel.value }]);
      if (!ok) return;
      const t = etat.competitions.find(x => x.id === ok);
      let n = 0;
      q.forEach(p => {
        const base = { id: uid(), cree: auj(), maj: new Date().toISOString(), niveau: t.niveau, entite: t.entite, entiteLib: t.entiteLib, saison: t.saison, competition: t.id, ecole: p.ecole || '', ecoleLib: p.ecoleLib || '' };
        if (individuelle(t)) { if (!etat.resultats.some(r => r.competition === t.id && norm(r.participant) === norm(p.laureat))) { etat.resultats.push(Object.assign(base, { participant: p.laureat, sexe: p.sexe || '', observations: 'Qualifié(e) de ' + c.entiteLib })); n++; } }
        else if (!etat.equipes.some(e => e.competition === t.id && norm(e.equipe) === norm(p.laureat))) { const src = etat.equipes.find(e => e.competition === c.id && norm(e.equipe) === norm(String(p.laureat).replace(/ \(poule .*\)$/, ''))) || {};
          etat.equipes.push(Object.assign(base, { equipe: String(p.laureat).replace(/ \(poule .*\)$/, ''), provenance: 'Qualifiée de ' + c.entiteLib, encadreur: src.encadreur || '', joueursG: src.joueursG || '', joueursF: src.joueursF || '', liste: src.liste || '', capitaine: src.capitaine || '' })); n++; }
        p.versCompetition = t.id;
      });
      await sauver(); toast(n + ' qualifié(s) engagé(s) dans « ' + t.intitule + ' ».'); dessiner();
    }

    /* ---------- tableau de bord du pilotage ---------- */
    async function pilotage(zone) {
      const nivs = niveauxCtx();
      const st = F._pil = F._pil || { niv: memo.get('pil.niv') || nivs[nivs.length > 1 ? 1 : 0] || 'ECOLE', annee: memo.get('pil.annee') || saisonCourante(), comp: '', ind: memo.get('pil.ind') || 'effT', groupe: memo.get('pil.groupe') || 'Effectifs', zone: '' };
      if (!nivs.includes(st.niv)) st.niv = nivs[0];
      const sNiv = selectListe(nivs.map(n => [n, LIB_NIVEAU[n]]), st.niv, null), sAn = selectListe(saisons(), st.annee, null), sCmp = selectListe(saisons().filter(s => s !== st.annee), st.comp, 'Aucune');
      const IND = CAT().INDICATEURS;
      const sInd = selectListe(IND.map(i => [i.k, i.g + ' — ' + i.l]), st.ind, null);
      const sZone = selectListe(entites('ZONE').map(z => [z.cle, z.lib]), st.zone, 'Toutes les zones');
      sNiv.onchange = () => { st.niv = sNiv.value; memo.set('pil.niv', st.niv); dessiner(); };
      sAn.onchange = () => { st.annee = sAn.value; memo.set('pil.annee', st.annee); dessiner(); };
      sCmp.onchange = () => { st.comp = sCmp.value; dessiner(); };
      sInd.onchange = () => { st.ind = sInd.value; memo.set('pil.ind', st.ind); dessiner(); };
      sZone.onchange = () => { st.zone = sZone.value; dessiner(); };
      zone.append(h('div', { class: 'pvs-barre' }, h('label', {}, 'Niveau d’analyse', sNiv), h('label', {}, 'Année scolaire', sAn), h('label', {}, 'Comparer avec', sCmp),
        entites('ZONE').length > 1 ? h('label', {}, 'Zone', sZone) : null, h('label', { style: 'max-width:420px;flex:2 1 260px' }, 'Indicateur du graphique', sInd)));
      const calc = await donneesPilotage(st.annee), calc2 = st.comp ? await donneesPilotage(st.comp) : null;
      let ents = entites(st.niv);
      if (st.zone) ents = ents.filter(e => st.niv === 'ZONE' ? String(e.cle) === st.zone : st.niv === 'CS' || st.niv === 'DDEMP' ? true : String(e.zone || '') === st.zone);
      const lignesP = ents.map(e => ({ e, v: agreger(calc, st.niv, e.cle, st.annee), v2: calc2 ? agreger(calc2, st.niv, e.cle, st.comp) : null }));
      const totE = st.zone ? ecoles().filter(x => String(x.zone) === st.zone) : ecoles();
      const tot = agregerEcoles(calc, totE, null, null, st.annee), tot2 = calc2 ? agregerEcoles(calc2, totE, null, null, st.comp) : null;
      const fmt = (v) => vide(v) ? '—' : (typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('fr-FR') : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })) : v);
      const kpis = ['effT', 'partF', 'rem', 'reg', 'cepTaux', 'tauxAbandon', 'licencies', 'tauxLicence'];
      zone.append(h('div', { class: 'pvs-kpis' }, kpis.map(k => { const i = IND.find(x => x.k === k); const d = tot2 && !vide(tot[k]) && !vide(tot2[k]) ? Math.round(10 * (tot[k] - tot2[k])) / 10 : null;
        return h('div', { class: 'pvs-kpi' }, h('b', {}, fmt(tot[k])), h('span', {}, i.l + (d !== null ? ' (' + (d >= 0 ? '+' : '') + fmt(d) + ' vs ' + st.comp + ')' : ''))); })));
      const groupes = [...new Set(IND.map(i => i.g))];
      zone.append(h('div', { class: 'pvs-chips' }, groupes.map(g => h('button', { class: 'pvs-chip' + (g === st.groupe ? ' on' : ''), type: 'button', onclick: () => { st.groupe = g; memo.set('pil.groupe', g); dessiner(); } }, g))));
      const cols = IND.filter(i => i.g === st.groupe);
      const cell = (x, k, x2) => { const v = x[k]; if (!x2) return fmt(v); const d = !vide(v) && !vide(x2[k]) ? Math.round(10 * (v - x2[k])) / 10 : null; return fmt(v) + (d !== null ? ' (' + (d >= 0 ? '+' : '') + fmt(d) + ')' : ''); };
      zone.append(h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t' }, h('thead', {}, h('tr', {}, [LIB_NIVEAU[st.niv]].concat(cols.map(c => c.l)).map(t => h('th', {}, t)))),
        h('tbody', {}, lignesP.map(l => h('tr', {}, h('td', {}, l.e.lib), cols.map(c => h('td', { class: 'n' }, cell(l.v, c.k, l.v2))))),
          h('tr', { class: 'tot' }, h('td', {}, 'Ensemble'), cols.map(c => h('td', { class: 'n' }, cell(tot, c.k, tot2))))))));
      const iG = IND.find(i => i.k === st.ind) || IND[0];
      const items = lignesP.filter(l => !vide(l.v[iG.k])).sort((a, b) => num(b.v[iG.k]) - num(a.v[iG.k])).slice(0, 40).map(l => ({ l: l.e.lib, v: num(l.v[iG.k]), t: fmt(l.v[iG.k]) }));
      zone.append(h('div', { class: 'pvs-carte' }, h('h3', {}, '\uE016 ' + iG.l + ' — ' + LIB_NIVEAU[st.niv] + ' — ' + st.annee), items.length ? h('div', { html: barres(items, { titre: iG.l }) }) : h('p', { class: 'pvs-vide' }, 'Pas de valeur pour cet indicateur.')));
      if (calc2) { const it2 = lignesP.filter(l => !vide(l.v[iG.k]) || (l.v2 && !vide(l.v2[iG.k]))).slice(0, 20).flatMap(l => [{ l: l.e.lib + ' ' + st.annee.slice(2), v: num(l.v[iG.k]), t: fmt(l.v[iG.k]) }, { l: l.e.lib + ' ' + st.comp.slice(2), v: num(l.v2 && l.v2[iG.k]), t: fmt(l.v2 && l.v2[iG.k]), c: '#98A2B3' }]);
        zone.append(h('div', { class: 'pvs-carte' }, h('h3', {}, '\uE057 Comparaison ' + st.annee + ' / ' + st.comp), h('div', { html: barres(it2, { titre: 'Comparaison' }) }))); }
      const exportLignes = () => [[LIB_NIVEAU[st.niv], 'Année scolaire'].concat(IND.map(i => i.l))].concat(lignesP.map(l => [l.e.lib, st.annee].concat(IND.map(i => vide(l.v[i.k]) ? '' : l.v[i.k]))))
        .concat([['Ensemble', st.annee].concat(IND.map(i => vide(tot[i.k]) ? '' : tot[i.k]))]);
      zone.append(h('div', { class: 'pvs-actions' },
        h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'excel-pilotage', onclick: () => exporter([{ nom: 'Tableau de bord ' + st.annee, lignes: exportLignes(), entete: 0 }].concat(calc2 ? [{ nom: 'Tableau de bord ' + st.comp, lignes: [[LIB_NIVEAU[st.niv], 'Année scolaire'].concat(IND.map(i => i.l))].concat(lignesP.map(l => [l.e.lib, st.comp].concat(IND.map(i => vide(l.v2[i.k]) ? '' : l.v2[i.k])))), entete: 0 }] : []), 'tableau-de-bord') }, '\uE015 Excel'),
        h('button', { class: 'pvs-btn p', type: 'button', 'data-pvs': 'doc-TABLEAU', onclick: () => {
          const a = ctx.autorite || {}, inst = { niv: st.niv, annee: st.annee, comp: st.comp || '', lignes: exportLignes() };
          document_('TABLEAU', { instantane: inst }, async () => {
            const v = a.niveau ? await sigVisa(a.niveau, a.cle, '') : { html: blocSig('Le Responsable', '', '', ''), nom: '' };
            const gr = [...new Set(IND.map(i => i.g))];
            let corps = '<p class="c">' + esc(LIB_NIVEAU[st.niv]) + ' — année scolaire ' + esc(st.annee) + (st.comp ? ' (comparée à ' + esc(st.comp) + ')' : '') + '</p>';
            gr.forEach(g => { const cs = IND.filter(i => i.g === g); corps += '<h3>' + esc(g) + '</h3>' + tableDoc([LIB_NIVEAU[st.niv]].concat(cs.map(c => c.l)), lignesP.map(l => [l.e.lib].concat(cs.map(c => cell(l.v, c.k, l.v2)))).concat([['Ensemble'].concat(cs.map(c => cell(tot, c.k, tot2)))]), [0].concat(cs.map(() => 'n'))); });
            corps += '<h3>' + esc(iG.l) + '</h3>' + barres(items, { titre: iG.l });
            return { titre: 'Tableau de bord du pilotage', corps, sigs: [v], resume: { entite: a.niveau ? (entite(a.niveau, a.cle) || {}).lib : '', objet: 'Tableau de bord — ' + LIB_NIVEAU[st.niv], mention: st.annee, signataire: v.nom } };
          });
        } }, '\uE008 Tableau de bord (PDF signé)')),
        h('p', { class: 'pvs-aide' }, 'Sources : données de l’application (fiches, effectifs, personnel, CEP) complétées ou remplacées par la rubrique « Saisie des indicateurs » (une ligne par école et par année) ; sport : licences, compétitions, rencontres et palmarès de ce module. Les ratios sont recalculés sur les totaux.'));
    }
    /** Données par école pour une année : application (A.indicateurs) + saisie, + sport */
    async function donneesPilotage(annee) {
      let app = {}; if (A.indicateurs) { try { app = (await A.indicateurs(annee)) || {}; } catch (e) { console.error(e); app = {}; } }
      const saisie = {}; lignes('indicateurs').filter(r => r.annee === annee && r.niveau === 'ECOLE').forEach(r => { saisie[String(r.entite)] = r; });
      const out = {};
      const IND_SAISIE = champsDe('indicateurs').filter(c => c.t !== 'calc' && c.k !== 'observations').map(c => c.k);
      ecoles().forEach(e => {
        const cle = String(e.cle), a = app[cle] || {}, s = saisie[cle] || {}, v = {};
        Object.keys(a).forEach(k => { if (!vide(a[k])) v[k] = a[k]; });
        IND_SAISIE.forEach(k => { v[k] = !vide(s[k]) ? s[k] : (!vide(a[k]) ? a[k] : ''); });
        const lic = etat.licences.filter(l => String(l.entite) === cle && l.saison === annee);
        v.licenciesG = lic.filter(l => l.sexe === 'M').length; v.licenciesF = lic.filter(l => l.sexe === 'F').length;
        out[cle] = v;
      });
      return out;
    }
    const SOMMES = ['effG', 'effF', 'groupes', 'salles', 'enseignants', 'enseignantsF', 'ensFE', 'ensContractuels', 'ensCommunautaires', 'ensAutres', 'tablesBancs', 'latrines', 'cepInscritsG', 'cepInscritsF', 'cepPresentsG', 'cepPresentsF', 'cepAdmisG', 'cepAdmisF', 'abandonsG', 'abandonsF', 'redoublantsG', 'redoublantsF', 'licenciesG', 'licenciesF', 'ebComposes', 'ebAdmis'];
    function agregerEcoles(calc, ecs, niv, cle, annee) {
      const v = { ecoles: ecs.length };
      SOMMES.forEach(k => { const vals = ecs.map(e => (calc[String(e.cle)] || {})[k]).filter(x => !vide(x)); v[k] = vals.length ? vals.reduce((s, x) => s + num(x), 0) : ''; });
      ['pointEau', 'cantine'].forEach(k => { const vals = ecs.map(e => (calc[String(e.cle)] || {})[k]).filter(x => !vide(x)); v[k] = vals.length ? vals.filter(x => x === 'Oui').length : ''; });
      ['reussiteT1', 'reussiteT2', 'reussiteT3'].forEach(k => { const vals = ecs.map(e => (calc[String(e.cle)] || {})[k]).filter(x => !vide(x)).map(num); v[k] = vals.length ? Math.round(10 * vals.reduce((s, x) => s + x, 0) / vals.length) / 10 : ''; });
      const s2 = (a, b) => vide(v[a]) && vide(v[b]) ? '' : num(v[a]) + num(v[b]);
      v.effT = s2('effG', 'effF'); v.cepInscrits = s2('cepInscritsG', 'cepInscritsF'); v.cepPresents = s2('cepPresentsG', 'cepPresentsF'); v.cepAdmis = s2('cepAdmisG', 'cepAdmisF');
      v.abandons = s2('abandonsG', 'abandonsF'); v.redoublants = s2('redoublantsG', 'redoublantsF'); v.licencies = s2('licenciesG', 'licenciesF');
      const ids = new Set(ecs.map(e => String(e.cle)));
      const comps = etat.competitions.filter(c => c.saison === annee && (niv ? dans(c.niveau, c.entite, niv, cle) : visible(c)));
      v.competitions = comps.length;
      const cids = new Set(comps.map(c => c.id));
      v.matchsJoues = etat.matchs.filter(m => cids.has(m.competition) && scoreMatch(m)[2]).length;
      v.titres = etat.palmares.filter(p => p.saison === annee && num(p.rang) >= 1 && num(p.rang) <= 3 && ids.has(String(p.ecole))).length;
      /* ratios : sur les seules écoles qui renseignent le numérateur et le dénominateur (pas de ratio faussé par des écoles incomplètes) */
      const der = (x) => { const o = Object.assign({}, x || {}), s2b = (a, b) => vide(o[a]) && vide(o[b]) ? '' : num(o[a]) + num(o[b]);
        o.effT = s2b('effG', 'effF'); o.cepInscrits = s2b('cepInscritsG', 'cepInscritsF'); o.cepPresents = s2b('cepPresentsG', 'cepPresentsF'); o.cepAdmis = s2b('cepAdmisG', 'cepAdmisF');
        o.abandons = s2b('abandonsG', 'abandonsF'); o.redoublants = s2b('redoublantsG', 'redoublantsF'); o.licencies = s2b('licenciesG', 'licenciesF'); return o; };
      const par = ecs.map(e => der(calc[String(e.cle)]));
      CAT().INDICATEURS.filter(i => i.ratio).forEach(i => { const [a, b, k] = i.ratio; let sa = 0, sb = 0;
        par.forEach(o => { if (!vide(o[a]) && num(o[b])) { sa += num(o[a]); sb += num(o[b]); } });
        v[i.k] = sb ? (k === 2 ? Math.round(100 * 2 * sa / sb) / 100 : Math.round(10 * k * sa / sb) / 10) : ''; });
      return v;
    }
    const agreger = (calc, niv, cle, annee) => agregerEcoles(calc, ecolesDe(niv, cle), niv, cle, annee);


    /* ======================================================== lot B ======================================================== */
    /** Accusés de réception d'une note : « reçus / destinataires » */
    function accuses(r) { const d = destinatairesDe(r), l = etat.lectures.filter(x => x.note === r.id); const n = d.filter(([nv, k]) => l.some(x => x.niveau === nv && String(x.entite) === k)).length; return n + ' / ' + d.length; }
    const jours = (d) => { const t = new Date(String(iso(d)) + 'T12:00:00'); return isNaN(t) ? null : Math.round((t - new Date(auj() + 'T12:00:00')) / 864e5); };
    /** Notes reçues par les entités que le compte dirige (boîte de réception) */
    function recues() {
      return lignes('notes').map(n => ({ n, d: destinatairesDe(n).filter(([nv, k]) => entite(nv, k) && peut(nv, k)) })).filter(x => x.d.length && !(x.d.length === 1 && x.d[0][0] === x.n.niveau && x.d[0][1] === String(x.n.entite)));
    }
    const lu = (n, nv, k) => etat.lectures.some(x => x.note === n.id && x.niveau === nv && String(x.entite) === String(k));
    async function accuser(n, nv, k) {
      if (lu(n, nv, k)) return;
      const e = entite(nv, k) || {};
      etat.lectures.push({ id: uid(), cree: auj(), maj: new Date().toISOString(), niveau: nv, entite: String(k), entiteLib: e.lib || '', saison: n.saison || saisonCourante(), note: n.id, date: auj(), lecteur: (A.utilisateur ? A.utilisateur() : '') || A.app || '' });
      await sauver();
    }
    /** Alertes calculées : échéances, notes non lues, convocations, décrochage, licences, stocks */
    async function alertes() {
      const out = [];
      lignes('echeances').filter(r => r.statut !== 'Fait' && peut(r.niveau, r.entite) || (r.statut !== 'Fait' && visible(r))).forEach(r => { const j = jours(r.dateLimite); if (j === null) return;
        if (j < 0) out.push({ g: 'ko', t: 'Échéance dépassée', d: r.objet + ' — ' + r.entiteLib + ' — date limite ' + fr(r.dateLimite) + ' (' + (-j) + ' j de retard)', o: 'echeances' });
        else if (j <= (num(r.rappelJours) || 7)) out.push({ g: 'at', t: 'Échéance proche', d: r.objet + ' — ' + r.entiteLib + ' — ' + fr(r.dateLimite) + ' (dans ' + j + ' j)', o: 'echeances' }); });
      recues().forEach(({ n, d }) => { const nl = d.filter(([nv, k]) => !lu(n, nv, k)); if (nl.length) out.push({ g: 'at', t: 'Note non lue', d: (n.type || 'Note') + ' — ' + n.objet + ' (de ' + n.entiteLib + ', ' + fr(n.date) + ')' + (nl.length > 1 ? ' — ' + nl.length + ' entités' : ''), o: 'boite' });
        if (n.type === 'Convocation') { const j = jours(n.dateReunion); if (j !== null && j >= 0 && j <= 7) out.push({ g: 'at', t: 'Convocation', d: n.objet + ' — ' + fr(n.dateReunion) + (n.heureReunion ? ' à ' + n.heureReunion : '') + (n.lieuReunion ? ', ' + n.lieuReunion : ''), o: 'boite' }); } });
      lignes('agenda').forEach(r => { const j = jours(r.date); if (j !== null && j >= 0 && j <= 3) out.push({ g: 'ok', t: 'Agenda', d: r.objet + ' — ' + fr(r.date) + (r.heureDebut ? ' à ' + r.heureDebut : '') + (r.lieu ? ', ' + r.lieu : ''), o: 'agenda' }); });
      lignes('decrochage').filter(r => r.statut === 'Signalé' || r.statut === 'En suivi').forEach(r => out.push({ g: r.statut === 'Signalé' ? 'ko' : 'at', t: 'Décrochage — ' + r.statut, d: nomComplet(r) + ' (' + (r.cours || '') + ', ' + r.entiteLib + ') — ' + (r.absences || 0) + ' demi-journée(s) d’absence', o: 'sante.decrochage' }));
      (await alertesAbsences()).forEach(a => out.push({ g: 'ko', t: 'Absences répétées', d: a.nom + ' ' + (a.prenoms || '') + ' (' + (a.cours || '') + ', ' + a.ecoleLib + ') — ' + a.absences + ' demi-journées sur 30 jours, sans fiche de suivi', o: 'sante.decrochage' }));
      const s = saisonCourante();
      const nonEx = lignes('licences').filter(l => l.saison === s && (l.aptitude === 'Non examiné' || !l.aptitude)).length, inap = lignes('licences').filter(l => l.saison === s && l.aptitude === 'Inapte').length;
      if (nonEx) out.push({ g: 'at', t: 'Licences', d: nonEx + ' licencié(s) sans visite médicale (saison ' + s + ')', o: 'sante.visites' });
      if (inap) out.push({ g: 'ko', t: 'Licences', d: inap + ' licencié(s) inapte(s) : à retirer des listes de joueurs', o: 'sport.licences' });
      soldes().filter(x => x.solde <= 0).forEach(x => out.push({ g: 'ko', t: 'Stock épuisé', d: x.denree + ' — ' + x.ecoleLib + ' : solde ' + x.solde + ' ' + x.unite, o: 'sante.stocks' }));
      return out;
    }
    let seuilAbs = +(memo.get('pvs.seuilAbs') || 6);
    async function alertesAbsences() {
      if (!A.absences) return [];
      const out = [];
      for (const e of ecoles().filter(x => peut('ECOLE', x.cle))) {
        let l = []; try { l = (await A.absences(e.cle)) || []; } catch (x) { l = []; }
        l.filter(a => num(a.absences) >= seuilAbs && !etat.decrochage.some(d => String(d.entite) === String(e.cle) && norm(d.nom) === norm(a.nom) && norm(d.prenoms) === norm(a.prenoms) && d.statut !== 'Réintégré'))
          .forEach(a => out.push(Object.assign({ ecole: e.cle, ecoleLib: e.lib }, a)));
      }
      return out;
    }
    /** Soldes des stocks de cantine par école et denrée */
    function soldes() {
      const m = new Map();
      lignes('stocks').forEach(r => { const k = r.entite + '|' + r.denree + '|' + (r.unite || ''); const x = m.get(k) || { ecole: r.entite, ecoleLib: r.entiteLib, denree: r.denree, unite: r.unite || '', entrees: 0, sorties: 0, ids: [] };
        if (r.mouvement === 'Sortie') x.sorties += num(r.quantite); else x.entrees += num(r.quantite); x.ids.push(r.id); m.set(k, x); });
      return [...m.values()].map(x => Object.assign(x, { solde: Math.round(100 * (x.entrees - x.sorties)) / 100 })).sort((a, b) => String(a.ecoleLib).localeCompare(String(b.ecoleLib), 'fr') || String(a.denree).localeCompare(String(b.denree), 'fr'));
    }
    async function bandeauAlertes(zone) {
      const l = await alertes(); if (!l.length) return;
      const ko = l.filter(x => x.g === 'ko').length;
      zone.prepend(h('div', { class: 'pvs-carte', 'data-pvs': 'bandeau-alertes', style: 'border-color:' + (ko ? '#FDA29B' : '#FEDF89') + ';background:' + (ko ? '#FEF3F2' : '#FFFAEB') },
        h('b', {}, I('alerte') + l.length + ' alerte(s)'), ' — ', l.slice(0, 3).map(x => x.t + ' : ' + x.d).join(' · '), l.length > 3 ? ' …' : '',
        MOD.id === 'communication' ? h('button', { class: 'pvs-btn s', type: 'button', style: 'margin-left:8px', onclick: () => { onglet = 'alertes'; dessiner(); } }, 'Voir') : null));
    }
    const texteMessage = (r) => (r.objet ? r.objet + ' — ' : '') + (r.texte || '');
    const ACTIONS = {
      whatsapp: (r) => { window.open('https://wa.me/?text=' + encodeURIComponent(texteMessage(r)), '_blank'); },
      sms: (r) => { location.href = 'sms:?body=' + encodeURIComponent(texteMessage(r)); },
      copier: async (r) => { try { await navigator.clipboard.writeText(texteMessage(r)); toast('Message copié.'); } catch (e) { toast('Copie impossible : sélectionnez le texte.'); } }
    };
    Object.assign(OUTILS, {
      cantine: (o, rows) => [h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'doc-CANTINE', onclick: () => rows.length ? DOCS.CANTINE(rows) : toast('Aucun repas pour ces filtres.') }, I('imprimer') + 'Journal de la cantine (PDF)')],
      agenda: (o, rows) => [h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'doc-AGENDA', onclick: () => rows.length ? DOCS.AGENDA(rows) : toast('Aucune activité.') }, I('imprimer') + 'Agenda (PDF)')]
    });
    const ecoleVisa = async (cle) => sigVisa('ECOLE', cle);
    const ficheEleve = (r, champs) => '<div class="pvs-kv">' + champs.map(([k, v]) => '<b>' + esc(k) + '</b><span>' + esc(v == null || v === '' ? '—' : v) + '</span>').join('') + '</div>';
    Object.assign(DOCS, {
      NOTE: (r) => document_('NOTE', { id: r.id }, async () => {
        const v = await sigVisa(r.niveau, r.entite, ''), d = destinatairesDe(r);
        const dest = Array.isArray(r.destinataires) && r.destinataires.length ? d.map(([n, k]) => (entite(n, k) || {}).lib || k).join(' ; ') : 'Toutes les entités (' + ((ongletColl('notes').champs.find(c => c.k === 'destNiveau').lib || {})[r.destNiveau] || r.destNiveau) + ') — ' + d.length;
        const conv = r.type === 'Convocation' ? '<p class="j"><b>Date :</b> ' + esc(fr(r.dateReunion) || '…') + (r.heureReunion ? ' à ' + esc(r.heureReunion) : '') + ' — <b>Lieu :</b> ' + esc(r.lieuReunion || '…') + '</p>' : '';
        return { titre: (r.type || 'Note de service') + (r.reference ? ' n° ' + r.reference : ''), corps: '<p class="c">' + esc(r.entiteLib) + ' — ' + esc(fr(r.date)) + '</p>'
          + '<p><b>Objet :</b> ' + esc(r.objet) + '</p><p><b>Destinataires :</b> ' + esc(dest) + '</p>' + conv
          + String(r.texte || '').split(/\n{2,}/).map(x => '<p class="j">' + esc(x).replace(/\n/g, '<br>') + '</p>').join('')
          + (r.echeance ? '<p><b>Réponse attendue le :</b> ' + esc(fr(r.echeance)) + '</p>' : '') + (r.pieces ? '<p><b>Pièces jointes / ampliations :</b><br>' + esc(r.pieces).replace(/\n/g, '<br>') + '</p>' : ''),
          sigs: [r.signataire ? blocSig(r.signataire, '', v.signature || '', v.cachet || '') : v], resume: { entite: r.entiteLib, objet: r.objet, mention: (r.type || '') + (r.reference ? ' n° ' + r.reference : ''), signataire: r.signataire || v.nom } };
      }),
      ACCUSES: (r) => document_('ACCUSES', { id: r.id }, async () => {
        const v = await sigVisa(r.niveau, r.entite, ''), d = destinatairesDe(r);
        return { titre: 'État des accusés de réception', corps: '<p class="c">' + esc((r.type || 'Note') + (r.reference ? ' n° ' + r.reference : '') + ' du ' + fr(r.date) + ' — ' + r.objet) + '</p>'
          + tableDoc(['N°', 'Destinataire', 'Accusé de réception', 'Date', 'Lecteur'], d.map(([n, k], i) => { const l = etat.lectures.find(x => x.note === r.id && x.niveau === n && String(x.entite) === k); return [i + 1, (entite(n, k) || {}).lib || k, l ? 'Reçu' : 'Non reçu', l ? fr(l.date) : '', l ? l.lecteur : '']; }), ['c', 0, 'c', 'c', 0])
          + '<p>' + esc(accuses(r)) + ' accusé(s) de réception.</p>', sigs: [v], resume: { entite: r.entiteLib, objet: r.objet, mention: accuses(r), signataire: v.nom } };
      }),
      AGENDA: (rows) => document_('AGENDA', { ids: rows.map(r => r.id) }, async () => {
        const a = ctx.autorite || {}, v = a.niveau ? await sigVisa(a.niveau, a.cle, '') : { html: '', nom: '' };
        const l = rows.slice().sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.heureDebut || '').localeCompare(String(y.heureDebut || '')));
        return { titre: 'Agenda des activités', corps: tableDoc(['Date', 'Heure', 'Objet', 'Type', 'Lieu', 'Entité', 'Organisateur'], l.map(r => [fr(r.date), [r.heureDebut, r.heureFin].filter(Boolean).join(' – '), r.objet, r.type, r.lieu, r.entiteLib, r.organisateur])),
          sigs: [v].filter(x => x.html), resume: { entite: a.niveau ? (entite(a.niveau, a.cle) || {}).lib : '', objet: 'Agenda', mention: l.length + ' activité(s)', signataire: v.nom } };
      }),
      APTITUDE: (r) => document_('APTITUDE', { id: r.id }, async () => {
        const v = await ecoleVisa(r.entite);
        return { titre: 'Certificat d’aptitude à la pratique sportive scolaire', uas: ['ECOLE', r.entite], corps: '<p class="j" style="margin-top:14px">Je soussigné(e) <b>' + esc(r.examinateur || '……………………………') + '</b>, certifie avoir examiné le '
          + esc(fr(r.dateVisite)) + ' l’élève <b>' + esc(nomComplet(r)) + '</b>' + (r.cours ? ', ' + esc(r.cours) : '') + ', de l’école ' + esc(r.entiteLib) + ', et déclare qu’il / elle est <b>' + esc(String(r.aptitude || '').toLowerCase()) + '</b> à la pratique des activités physiques et sportives scolaires'
          + (r.reserve ? ' (réserves : ' + esc(r.reserve) + ')' : '') + ' pour la saison ' + esc(r.saison || '') + '.</p><p class="j">Certificat délivré pour servir et valoir ce que de droit.</p>',
          sigs: [blocSig('L’examinateur', r.examinateur || '', '', ''), v], resume: { entite: r.entiteLib, objet: nomComplet(r), mention: r.aptitude, signataire: r.examinateur || v.nom } };
      }),
      FICHE_SANTE: (r) => document_('FICHE_SANTE', { id: r.id }, async () => {
        const v = await ecoleVisa(r.entite), imc = champsDe('visitesMed').find(c => c.k === 'imc').calc(r);
        return { titre: 'Fiche de visite médicale scolaire', corps: ficheEleve(r, [['Élève', nomComplet(r)], ['Sexe', r.sexe], ['Né(e) le', fr(r.dateNaissance)], ['Cours', r.cours], ['École', r.entiteLib], ['Date de la visite', fr(r.dateVisite)], ['Examinateur', r.examinateur],
          ['Poids / taille', (r.poids ? r.poids + ' kg' : '—') + ' / ' + (r.taille ? r.taille + ' cm' : '—')], ['IMC', imc], ['Vue', r.vue], ['Audition', r.audition], ['Dentition', r.dentition], ['Vaccination', r.vaccination], ['Aptitude sportive', r.aptitude + (r.reserve ? ' — ' + r.reserve : '')], ['Orientation / soins', r.orientation]]),
          sigs: [blocSig('L’examinateur', r.examinateur || '', '', ''), v], resume: { entite: r.entiteLib, objet: nomComplet(r), mention: 'visite du ' + fr(r.dateVisite), signataire: r.examinateur || v.nom } };
      }),
      STOCK: (l, niv, cle) => document_('STOCK', { ids: l.flatMap(x => x.ids) }, async () => {
        const v = niv ? await sigVisa(niv, cle) : { html: '', nom: '' };
        return { titre: 'État du stock de la cantine scolaire', corps: '<p class="c">Situation au ' + esc(fr(auj())) + '</p>' + tableDoc(['École', 'Denrée', 'Unité', 'Entrées', 'Sorties', 'Solde'], l.map(x => [x.ecoleLib, x.denree, x.unite, x.entrees, x.sorties, { html: '<b>' + x.solde + '</b>' }]), [0, 0, 'c', 'n', 'n', 'n']),
          sigs: [blocSig('Le gestionnaire de la cantine', '', '', ''), v].filter(x => typeof x === 'string' || x.html), resume: { entite: niv ? (entite(niv, cle) || {}).lib : '', objet: 'Stock de la cantine', mention: l.length + ' denrée(s)', signataire: v.nom } };
      }),
      CANTINE: (rows) => document_('CANTINE', { ids: rows.map(r => r.id) }, async () => {
        const ec = [...new Set(rows.map(r => r.entite))], v = ec.length === 1 ? await ecoleVisa(ec[0]) : { html: '', nom: '' };
        const t = rows.reduce((a, r) => [a[0] + num(r.prevusG) + num(r.prevusF), a[1] + num(r.servisG), a[2] + num(r.servisF)], [0, 0, 0]);
        return { titre: 'Journal de la cantine scolaire', corps: tableDoc(['Date', 'Repas', 'École', 'Prévus', 'Servis G', 'Servis F', 'Total', 'Menu'], rows.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(r => [fr(r.date), r.repas, r.entiteLib, num(r.prevusG) + num(r.prevusF), r.servisG, r.servisF, num(r.servisG) + num(r.servisF), r.menu]).concat([['Total', '', '', t[0], t[1], t[2], t[1] + t[2], '']]), [0, 0, 0, 'n', 'n', 'n', 'n', 0]),
          sigs: [blocSig('Le gestionnaire de la cantine', '', '', ''), v].filter(x => typeof x === 'string' || x.html), resume: { entite: ec.length === 1 ? rows[0].entiteLib : ec.length + ' école(s)', objet: 'Journal de la cantine', mention: rows.length + ' repas', signataire: v.nom } };
      }),
      INCLUSION: (r) => document_('INCLUSION', { id: r.id }, async () => {
        const v = await ecoleVisa(r.entite);
        return { titre: 'Fiche de suivi d’un élève à besoins spécifiques', corps: ficheEleve(r, [['Élève', nomComplet(r)], ['Sexe', r.sexe], ['Cours', r.cours], ['École', r.entiteLib], ['Type de besoin', r.type], ['Description', r.description], ['Aménagements pédagogiques', r.amenagements], ['Partenaire / prise en charge', r.partenaire], ['Suivi', r.statut]]),
          sigs: [blocSig('L’enseignant(e) titulaire', '', '', ''), v], resume: { entite: r.entiteLib, objet: nomComplet(r), mention: r.type, signataire: v.nom } };
      }),
      DECROCHAGE: (r) => document_('DECROCHAGE', { id: r.id }, async () => {
        const v = await ecoleVisa(r.entite);
        return { titre: 'Fiche de signalement d’absentéisme / décrochage scolaire', corps: ficheEleve(r, [['Élève', nomComplet(r)], ['Sexe', r.sexe], ['Cours', r.cours], ['École', r.entiteLib], ['Absences', (r.absences || 0) + ' demi-journée(s)' + (r.periode ? ' — ' + r.periode : '')], ['Signalé le', fr(r.dateSignalement)], ['Motif', r.motif], ['Actions', r.actions], ['Statut', r.statut], ['Observations', r.observations]]),
          sigs: [blocSig('L’enseignant(e) titulaire', '', '', ''), v], resume: { entite: r.entiteLib, objet: nomComplet(r), mention: r.statut, signataire: v.nom } };
      })
    });
    Object.assign(VUES, {
      boite(zone) {
        const l = recues().sort((a, b) => String(b.n.date).localeCompare(String(a.n.date)));
        zone.append(h('p', { class: 'pvs-aide' }, 'Notes de service, circulaires et convocations adressées aux entités que vous dirigez. « Accuser réception » prévient l’émetteur (état des accusés).'));
        if (!l.length) { zone.append(h('p', { class: 'pvs-vide' }, 'Aucune note reçue. Les notes d’une autre application arrivent par l’import Excel de la rubrique « Notes, circulaires et convocations ».')); return; }
        zone.append(h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t' }, h('thead', {}, h('tr', {}, ['Date', 'Type', 'Objet', 'De', 'Pour', 'Échéance', 'État', ''].map(t => h('th', {}, t)))),
          h('tbody', {}, l.flatMap(({ n, d }) => d.map(([nv, k]) => h('tr', { 'data-id': n.id }, h('td', {}, fr(n.date)), h('td', {}, n.type || ''), h('td', {}, n.objet), h('td', {}, n.entiteLib || ''), h('td', {}, (entite(nv, k) || {}).lib || k),
            h('td', {}, fr(n.echeance)), h('td', {}, h('span', { class: 'pvs-badge ' + (lu(n, nv, k) ? 'ok' : 'at') }, lu(n, nv, k) ? 'Lu' : 'Non lu')),
            h('td', { class: 'act' }, h('button', { class: 'pvs-btn s', type: 'button', title: 'Lire', 'data-pvs': 'lire', onclick: () => dialogue((n.type || 'Note') + ' — ' + n.objet, h('div', {}, h('p', {}, h('b', {}, 'De : '), n.entiteLib + ' — ' + fr(n.date)), String(n.texte || '').split(/\n{2,}/).map(x => h('p', {}, x)))) }, I('voir') + 'Lire'),
              !lu(n, nv, k) ? h('button', { class: 'pvs-btn s p', type: 'button', 'data-pvs': 'accuser', onclick: async () => { await accuser(n, nv, k); toast('Accusé de réception enregistré.'); dessiner(); } }, I('valider') + 'Accuser réception') : null,
              h('button', { class: 'pvs-btn s', type: 'button', title: 'Imprimer', onclick: () => DOCS.NOTE(n) }, I('imprimer'))))))))));
      },
      alertes(zone) {
        const box = h('div', {}); zone.append(box);
        alertes().then(l => {
          box.append(h('p', { class: 'pvs-aide' }, 'Échéances, notes non lues, convocations et activités proches, décrochage, licences sans visite médicale, stocks de cantine épuisés.'));
          if (!l.length) { box.append(h('p', { class: 'pvs-vide' }, 'Aucune alerte.')); return; }
          box.append(h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t', 'data-pvs': 'table-alertes' }, h('thead', {}, h('tr', {}, ['Niveau', 'Alerte', 'Détail'].map(t => h('th', {}, t)))),
            h('tbody', {}, l.map(a => h('tr', {}, h('td', {}, h('span', { class: 'pvs-badge ' + a.g }, a.g === 'ko' ? 'Urgent' : a.g === 'at' ? 'À traiter' : 'Info')), h('td', {}, a.t), h('td', {}, a.d)))))));
        });
      },
      agenda(zone) {
        const l = lignes('agenda').filter(r => jours(r.date) !== null && jours(r.date) >= -1).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.heureDebut || '').localeCompare(String(b.heureDebut || ''))).slice(0, 60);
        const mois = {}; l.forEach(r => { const m = String(r.date).slice(0, 7); (mois[m] = mois[m] || []).push(r); });
        zone.append(h('div', { class: 'pvs-carte' }, h('h3', {}, I('calendrier') + 'Prochaines activités'), l.length ? Object.entries(mois).map(([m, rs]) => h('div', {},
          h('b', {}, new Date(m + '-15T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })),
          h('ul', { style: 'margin:4px 0 10px;padding-left:18px' }, rs.map(r => h('li', {}, fr(r.date) + (r.heureDebut ? ' ' + r.heureDebut : '') + ' — ' + r.objet + (r.lieu ? ' (' + r.lieu + ')' : '') + ' — ' + (r.entiteLib || '')))))) : h('p', { class: 'pvs-vide' }, 'Rien de prévu.')));
      },
      stocks(zone) {
        const l = soldes(), a = ctx.autorite || {};
        zone.append(h('div', { class: 'pvs-carte' }, h('h3', {}, I('colis') + 'Soldes des stocks'), l.length ? h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t', 'data-pvs': 'table-soldes' }, h('thead', {}, h('tr', {}, ['École', 'Denrée', 'Unité', 'Entrées', 'Sorties', 'Solde'].map(t => h('th', {}, t)))),
          h('tbody', {}, l.map(x => h('tr', { class: x.solde <= 0 ? 'q' : '' }, h('td', {}, x.ecoleLib), h('td', {}, x.denree), h('td', {}, x.unite), h('td', { class: 'n' }, x.entrees), h('td', { class: 'n' }, x.sorties), h('td', { class: 'n' }, h('b', {}, x.solde)))))))
          : h('p', { class: 'pvs-vide' }, 'Aucun mouvement de stock.'),
          l.length ? h('div', { class: 'pvs-actions' }, h('button', { class: 'pvs-btn p', type: 'button', 'data-pvs': 'doc-STOCK', onclick: () => { const ec = [...new Set(l.map(x => x.ecole))]; DOCS.STOCK(l, ec.length === 1 ? 'ECOLE' : a.niveau, ec.length === 1 ? ec[0] : a.cle); } }, I('imprimer') + 'État du stock (PDF signé)'),
            h('button', { class: 'pvs-btn', type: 'button', onclick: () => exporter([{ nom: 'Soldes des stocks', lignes: [['École', 'Denrée', 'Unité', 'Entrées', 'Sorties', 'Solde']].concat(l.map(x => [x.ecoleLib, x.denree, x.unite, x.entrees, x.sorties, x.solde])), entete: 0 }], 'soldes-stocks') }, I('graphique') + 'Excel')) : null));
      },
      decrochage(zone) {
        const box = h('div', { class: 'pvs-carte' }); zone.append(box);
        const seuil = h('input', { type: 'number', min: 1, value: seuilAbs, class: 'pvs-in', style: 'max-width:90px' });
        seuil.onchange = () => { seuilAbs = Math.max(1, num(seuil.value)); memo.set('pvs.seuilAbs', seuilAbs); dessiner(); };
        box.append(h('h3', {}, I('alerte') + 'Alertes d’absentéisme'), h('label', { class: 'pvs-aide' }, 'Seuil (demi-journées d’absence sur 30 jours) ', seuil));
        if (!A.absences) { box.append(h('p', { class: 'pvs-aide' }, 'Cette application ne tient pas le registre d’appel des élèves : saisissez les signalements ci-dessous.')); return; }
        alertesAbsences().then(l => {
          if (!l.length) { box.append(h('p', { class: 'pvs-vide' }, 'Aucun élève au-dessus du seuil sans fiche de suivi.')); return; }
          box.append(h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t', 'data-pvs': 'table-absences' }, h('thead', {}, h('tr', {}, ['École', 'Élève', 'Cours', 'Absences', ''].map(t => h('th', {}, t)))),
            h('tbody', {}, l.map(a => h('tr', {}, h('td', {}, a.ecoleLib), h('td', {}, String(a.nom || '').toUpperCase() + ' ' + (a.prenoms || '')), h('td', {}, a.cours || ''), h('td', { class: 'n' }, a.absences),
              h('td', {}, h('button', { class: 'pvs-btn s p', type: 'button', 'data-pvs': 'creer-fiche', onclick: async () => {
                const r = { id: uid(), cree: auj(), maj: new Date().toISOString(), niveau: 'ECOLE', entite: String(a.ecole), entiteLib: a.ecoleLib, saison: saisonCourante(), nom: String(a.nom || '').toUpperCase(), prenoms: a.prenoms || '', sexe: a.sexe || '', cours: a.cours || '', absences: a.absences, periode: '30 derniers jours', dateSignalement: auj(), statut: 'Signalé' };
                etat.decrochage.push(r); await sauver(); toast('Fiche de suivi créée.'); dessiner(); } }, I('ajouter') + 'Créer la fiche'))))))));
        });
      }
    });

    /* ======================================================== lot C ======================================================== */
    const sessions = () => { const l = new Set([CAT().SESSION()]); ['epreuves', 'centres', 'candidats', 'jurys'].forEach(c => (etat[c] || []).forEach(r => r.session && l.add(r.session))); return [...l].sort().reverse(); };
    const etatC = F._cep = F._cep || { session: memo.get('cep.session') || CAT().SESSION(), centre: memo.get('cep.centre') || '', seuil: memo.get('cep.seuil') || '10', rep: memo.get('cep.rep') || '' };
    function barreCep(zone, avecSeuils) {
      const sS = selectListe(sessions(), etatC.session, null), cs = lignes('centres').filter(c => c.session === etatC.session);
      const sC = selectListe(cs.map(c => [c.id, c.centre]), etatC.centre, 'Tous les centres');
      sS.onchange = () => { etatC.session = sS.value; memo.set('cep.session', sS.value); etatC.centre = ''; dessiner(); };
      sC.onchange = () => { etatC.centre = sC.value; memo.set('cep.centre', sC.value); dessiner(); };
      const iS = h('input', { type: 'number', step: '0.01', value: etatC.seuil, class: 'pvs-in', 'data-pvs': 'seuil' }), iR = h('input', { type: 'number', step: '0.01', value: etatC.rep, class: 'pvs-in', placeholder: 'aucun' });
      iS.onchange = () => { etatC.seuil = iS.value; memo.set('cep.seuil', iS.value); dessiner(); }; iR.onchange = () => { etatC.rep = iR.value; memo.set('cep.rep', iR.value); dessiner(); };
      zone.append(h('div', { class: 'pvs-barre' }, h('label', {}, 'Session', sS), h('label', {}, 'Centre', sC), avecSeuils ? h('label', {}, 'Moyenne d’admission', iS) : null, avecSeuils ? h('label', {}, 'Repêchage à partir de', iR) : null));
    }
    const candidatsCep = () => lignes('candidats').filter(c => c.session === etatC.session && (!etatC.centre || c.centre === etatC.centre))
      .sort((a, b) => String(a.numeroTable || '~').localeCompare(String(b.numeroTable || '~'), 'fr', { numeric: true }) || String(a.entiteLib).localeCompare(String(b.entiteLib), 'fr') || String(a.nom).localeCompare(String(b.nom), 'fr'));
    const epreuvesCep = () => (etat.epreuves || []).filter(e => e.session === etatC.session && visible(e)).sort((a, b) => (num(a.ordre) || 99) - (num(b.ordre) || 99) || String(a.epreuve).localeCompare(String(b.epreuve), 'fr'));
    const autoriteCep = () => { const c = etat.centres.find(x => x.id === etatC.centre); return c ? [c.niveau, c.entite] : [(ctx.autorite || {}).niveau, (ctx.autorite || {}).cle]; };
    Object.assign(OUTILS, {
      candidats: (o) => {
        const w = entitesEcrivables(o).length > 0;
        return [w && A.cepCandidats ? h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'depuis-cep', onclick: async () => {
          let l = []; try { l = (await A.cepCandidats()) || []; } catch (e) { l = []; }
          const s2 = (F[o.id] || {}).session || CAT().SESSION(), deja = new Set(etat.candidats.map(c => c.entite + '|' + norm(c.nom + ' ' + c.prenoms)));
          const nv = l.filter(c => c.ecole && entite('ECOLE', c.ecole) && peut('ECOLE', c.ecole) && !deja.has(c.ecole + '|' + norm(c.nom + ' ' + c.prenoms)));
          if (!(await confirmer('Candidats du module CEP', nv.length + ' candidat(s) de l’application à reprendre pour la session ' + s2 + '.', 'Reprendre', false))) return;
          nv.forEach(c => etat.candidats.push({ id: uid(), cree: auj(), maj: new Date().toISOString(), niveau: 'ECOLE', entite: String(c.ecole), entiteLib: (entite('ECOLE', c.ecole) || {}).lib, saison: saisonCourante(), session: s2, nom: String(c.nom || '').toUpperCase(), prenoms: c.prenoms || '', sexe: c.sexe || '', dateNaissance: iso(c.dateNaissance), lieuNaissance: c.lieuNaissance || '', statut: 'Inscrit' }));
          await sauver(); toast(nv.length + ' candidat(s) repris.'); dessiner(); } }, I('importer') + 'Depuis le module CEP de l’application') : null,
        w ? h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'numeros', onclick: async () => {
          const s2 = (F[o.id] || {}).session || etatC.session; let n = 0, sans = 0;
          lignes('centres').filter(c => c.session === s2).forEach(ce => {
            const l = etat.candidats.filter(c => c.session === s2 && c.centre === ce.id && peut(c.niveau, c.entite)).sort((a, b) => String(a.entiteLib).localeCompare(String(b.entiteLib), 'fr') || String(a.nom).localeCompare(String(b.nom), 'fr') || String(a.prenoms).localeCompare(String(b.prenoms), 'fr'));
            const cap = Math.max(1, num(ce.capacite) || 30);
            l.forEach((c, i) => { c.numeroTable = (ce.code || String(ce.centre).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()) + '-' + String(i + 1).padStart(4, '0'); c.salle = 'Salle ' + (Math.floor(i / cap) + 1); c.maj = new Date().toISOString(); n++; });
          });
          sans = etat.candidats.filter(c => c.session === s2 && !c.centre).length;
          await sauver(); toast(n + ' numéro(s) de table attribué(s)' + (sans ? ' ; ' + sans + ' candidat(s) sans centre' : '') + '.'); dessiner(); } }, I('calcul') + 'Numéros de table et salles') : null];
      },
      visitesClasse: (o, rows) => [rows.some(r => r.recommandations && peut(r.niveau, r.entite)) ? h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'creer-reco', onclick: async () => {
        let n = 0;
        rows.filter(r => r.recommandations && peut(r.niveau, r.entite)).forEach(v => String(v.recommandations).split(/\n+/).map(x => x.replace(/^[-–•\d.)\s]+/, '').trim()).filter(Boolean).forEach(t => {
          if (etat.recommandations.some(x => x.visite === v.id && norm(x.recommandation) === norm(t))) return;
          etat.recommandations.push({ id: uid(), cree: auj(), maj: new Date().toISOString(), niveau: v.niveau, entite: v.entite, entiteLib: v.entiteLib, saison: v.saison, visite: v.id, destinataire: v.enseignant, recommandation: t, responsable: v.visiteur, statut: 'Non commencée' }); n++; }));
        await sauver(); toast(n + ' recommandation(s) ajoutée(s) au suivi.'); } }, I('ajouter') + 'Créer les recommandations à suivre') : null]
    });
    Object.assign(DOCS, {
      CR_VISITE: (r) => document_('CR_VISITE', { id: r.id }, async () => {
        const v = await sigVisa('ECOLE', r.entite), G = CAT().GRILLE_APC, n = CAT().noteGrille(r);
        return { titre: 'Compte rendu de ' + String(r.typeVisite || 'visite de classe').toLowerCase(), corps: ficheEleve(r, [['Enseignant(e)', r.enseignant], ['École', r.entiteLib], ['Cours', r.cours], ['Date', fr(r.date)], ['Discipline', r.discipline], ['Séance', r.seance], ['Visiteur', r.visiteur + (r.qualiteVisiteur ? ' (' + r.qualiteVisiteur + ')' : '')]])
          + '<h3>Grille d’observation (APC)</h3>' + tableDoc(['Critère', 'Note /4'], G.map(([k, l]) => [l, vide(r[k]) ? '—' : r[k]]).concat([[{ html: '<b>Note globale /20 — ' + esc(CAT().appreciation(n)) + '</b>' }, { html: '<b>' + esc(n) + '</b>' }]]), [0, 'c'])
          + '<h3>Points forts</h3><p class="j">' + esc(r.pointsForts || '—').replace(/\n/g, '<br>') + '</p><h3>Insuffisances</h3><p class="j">' + esc(r.insuffisances || '—').replace(/\n/g, '<br>') + '</p>'
          + '<h3>Recommandations</h3><p class="j">' + esc(r.recommandations || '—').replace(/\n/g, '<br>') + '</p>',
          sigs: [blocSig('L’enseignant(e) visité(e)', r.enseignant, '', ''), blocSig('Le visiteur', r.visiteur, '', ''), v], resume: { entite: r.entiteLib, objet: r.enseignant, mention: 'note ' + n + '/20 — ' + fr(r.date), signataire: r.visiteur } };
      }),
      CR_ANIMATION: (r) => document_('CR_ANIMATION', { id: r.id }, async () => {
        const v = await sigVisa(r.niveau, r.entite), pl = String(r.participants || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
        return { titre: 'Compte rendu — ' + (r.type || 'animation pédagogique'), corps: ficheEleve(r, [['Thème', r.theme], ['Date', fr(r.date)], ['Lieu', r.lieu], ['Animateur / animatrice', r.animateur], ['Entité', r.entiteLib], ['Présents', (num(r.presentsH) + num(r.presentsF)) + ' (H ' + num(r.presentsH) + ', F ' + num(r.presentsF) + ')']])
          + '<h3>Compte rendu</h3><p class="j">' + esc(r.compteRendu || '—').replace(/\n/g, '<br>') + '</p><h3>Liste de présence</h3>' + tableDoc(['N°', 'Nom et prénoms — école / fonction', 'Émargement'], pl.map((x, i) => [i + 1, x, '']), ['c', 0, 0]),
          sigs: [blocSig('L’animateur / l’animatrice', r.animateur || '', '', ''), v], resume: { entite: r.entiteLib, objet: r.theme, mention: fr(r.date) + ' — ' + pl.length + ' participant(s)', signataire: v.nom || r.animateur } };
      }),
      ATTEST_FORMATION: async (r) => {
        const pl = String(r.participants || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
        if (!pl.length) { toast('Renseignez la liste des participants (une personne par ligne).'); return; }
        const sel = selectListe(pl, pl[0], null);
        const choix = await dialogue('Attestation de participation', h('div', { class: 'pvs-form' }, h('label', { class: 'large' }, 'Participant(e)', sel)), [{ l: 'Annuler', v: null }, { l: I('imprimer') + 'Éditer', p: true, id: 'editer', action: () => sel.value }]);
        if (!choix) return;
        const [nom, compl] = choix.split(/\s+[—-]\s+/);
        document_('ATTEST_FORMATION', { id: r.id, participant: choix }, async () => {
          const v = await sigVisa(r.niveau, r.entite, '');
          return { titre: 'Attestation de participation', uas: null, corps: '<p class="j" style="margin-top:18px">' + esc(v.titre) + ' atteste que <b>' + esc(nom) + '</b>' + (compl ? ' (' + esc(compl) + ')' : '') + ' a participé à l’activité « <b>' + esc(r.theme) + '</b> » ('
            + esc(String(r.type || '').toLowerCase()) + ') organisée le ' + esc(fr(r.date)) + (r.lieu ? ' à ' + esc(r.lieu) : '') + (r.animateur ? ', animée par ' + esc(r.animateur) : '') + ' — ' + esc(r.entiteLib) + '.</p><p class="j">En foi de quoi la présente attestation lui est délivrée pour servir et valoir ce que de droit.</p>',
            sigs: [v], resume: { entite: r.entiteLib, objet: nom, mention: r.theme, signataire: v.nom } };
        });
      },
      PV_RECEPTION: (r) => document_('PV_RECEPTION', { id: r.id }, async () => {
        const v = await sigVisa(r.niveau, r.entite);
        return { titre: 'Procès-verbal de réception' + (r.pvNumero ? ' n° ' + r.pvNumero : ''), corps: '<p class="j" style="margin-top:12px">L’an ' + esc(String(iso(r.date)).slice(0, 4)) + ', le ' + esc(fr(r.date)) + ', il a été procédé à la réception de la dotation ci-après au profit de '
          + esc(r.beneficiaireLib || r.entiteLib) + ' :</p>' + tableDoc(['Désignation', 'Quantité', 'Unité', 'Source', 'État à la réception'], [[r.designation, r.quantite, r.unite, r.source, r.etatReception]], [0, 'n', 'c', 0, 0])
          + (r.observations ? '<p><b>Observations :</b> ' + esc(r.observations) + '</p>' : '') + '<p class="j">En foi de quoi le présent procès-verbal est établi pour servir et valoir ce que de droit.</p>',
          sigs: [blocSig('Le livreur', '', '', ''), blocSig('Le réceptionnaire', r.receptionnaire || '', '', ''), v], resume: { entite: r.entiteLib, objet: r.designation, mention: r.quantite + ' ' + (r.unite || ''), signataire: r.receptionnaire || v.nom } };
      }),
      CONVOCATION_CAND: (c) => document_('CONVOCATION_CAND', { id: c.id }, async () => {
        const ce = etat.centres.find(x => x.id === c.centre) || {}, v = ce.niveau ? await sigVisa(ce.niveau, ce.entite) : await sigVisa('ECOLE', c.entite);
        return { titre: 'Convocation — ' + (c.session || 'CEP'), corps: '<div class="pvs-cadre">' + ficheEleve(c, [['N° de table', c.numeroTable], ['Nom et prénoms', nomComplet(c)], ['Sexe', c.sexe], ['Né(e) le', fr(c.dateNaissance) + (c.lieuNaissance ? ' à ' + c.lieuNaissance : '')], ['École', c.entiteLib], ['Centre', ce.centre], ['Salle', c.salle]]) + '</div>'
          + '<p class="j">Le candidat se présentera au centre muni de cette convocation et d’une pièce d’identité, trente minutes avant le début des épreuves.</p>',
          sigs: [blocSig('Le chef de centre', ce.chefCentre || '', '', ''), v], resume: { entite: ce.centre || c.entiteLib, objet: nomComplet(c), mention: c.numeroTable || c.session, signataire: ce.chefCentre || v.nom } };
      }),
      RELEVE: (c) => document_('RELEVE', { id: c.id }, async () => {
        const R = resultatsCep(etat, c.session, c.centre, etatC.seuil, etatC.rep), x = R.res[c.id] || {}, ce = etat.centres.find(y => y.id === c.centre) || {}, j = etat.jurys.find(y => y.centre === c.centre && y.session === c.session) || {};
        const v = ce.niveau ? await sigVisa(ce.niveau, ce.entite) : await sigVisa('ECOLE', c.entite);
        return { titre: 'Relevé de notes — ' + c.session, corps: ficheEleve(c, [['N° de table', c.numeroTable], ['Nom et prénoms', nomComplet(c)], ['École', c.entiteLib], ['Centre', ce.centre]])
          + tableDoc(['Épreuve', 'Coefficient', 'Note', 'Sur'], R.epreuves.map(e => [e.epreuve, e.coefficient || 1, ((c.notes || {})[e.id] === undefined || (c.notes || {})[e.id] === '') ? '—' : c.notes[e.id], e.bareme || 20]).concat([[{ html: '<b>Total pondéré</b>' }, '', { html: '<b>' + (x.total == null ? '—' : x.total) + '</b>' }, ''], [{ html: '<b>Moyenne /20</b>' }, '', { html: '<b>' + (x.moyenne == null ? '—' : x.moyenne) + '</b>' }, ''], [{ html: '<b>Décision</b>' }, '', { html: '<b>' + esc(x.decision || '') + '</b>' }, x.rang ? 'rang ' + x.rang : '']]), [0, 'c', 'c', 'c']),
          sigs: [blocSig('Le président du jury', j.president || '', '', ''), v], resume: { entite: ce.centre || c.entiteLib, objet: nomComplet(c), mention: (x.decision || '') + (x.moyenne != null ? ' ' + x.moyenne + '/20' : ''), signataire: j.president || v.nom } };
      }),
      PV_DELIBERATION: (ref) => document_('PV_DELIBERATION', ref, async () => {
        const R = resultatsCep(etat, ref.session, ref.centre, ref.seuil, ref.repechage), j = etat.jurys.find(y => y.id === ref.jury) || {}, ce = etat.centres.find(y => y.id === ref.centre) || {};
        const [n, k] = autoriteCep(), v = n ? await sigVisa(n, k) : { html: '', nom: '' };
        const l = R.candidats.slice().sort((a, b) => (R.res[a.id].rang || 9999) - (R.res[b.id].rang || 9999) || String(a.numeroTable).localeCompare(String(b.numeroTable)));
        const st = { i: l.length, p: l.filter(c => R.res[c.id].moyenne !== null).length, a: l.filter(c => /^Admis/.test(R.res[c.id].decision)).length };
        return { titre: 'Procès-verbal de délibération — ' + ref.session, corps: '<p class="c">' + esc(ce.centre ? 'Centre : ' + ce.centre : 'Tous les centres') + ' — moyenne d’admission ' + R.seuil + (R.repechage !== null ? ', repêchage à partir de ' + R.repechage : '') + '</p>'
          + '<p class="j">Le jury, présidé par ' + esc(j.president || '……………') + (j.vicePresident ? ', assisté de ' + esc(j.vicePresident) : '') + (j.secretaire ? ' (secrétaire : ' + esc(j.secretaire) + ')' : '') + ', s’est réuni le ' + esc(fr(j.date) || fr(auj())) + ' et a arrêté les résultats suivants : '
          + st.i + ' inscrit(s), ' + st.p + ' présent(s), ' + st.a + ' admis, soit un taux de réussite de ' + (st.p ? Math.round(1000 * st.a / st.p) / 10 : 0) + ' %.</p>'
          + tableDoc(['Rang', 'N° de table', 'Nom et prénoms', 'Sexe', 'École', 'Total', 'Moyenne', 'Décision'], l.map(c => { const x = R.res[c.id]; return [x.rang || '—', c.numeroTable || '', nomComplet(c), c.sexe, c.entiteLib, x.total, x.moyenne == null ? '—' : x.moyenne, x.decision]; }), ['c', 0, 0, 'c', 0, 'n', 'n', 0]),
          sigs: [blocSig('Le secrétaire du jury', j.secretaire || '', '', ''), blocSig('Le vice-président', j.vicePresident || '', '', ''), blocSig('Le président du jury', j.president || '', '', ''), v],
          resume: { entite: ce.centre || 'CEP', objet: ref.session, mention: st.a + ' admis / ' + st.p + ' présents', signataire: j.president || v.nom } };
      }),
      LISTE_ADMIS: (ref) => document_('LISTE_ADMIS', ref, async () => {
        const R = resultatsCep(etat, ref.session, ref.centre, ref.seuil, ref.repechage), j = etat.jurys.find(y => y.id === ref.jury) || {}, ce = etat.centres.find(y => y.id === ref.centre) || {};
        const [n, k] = autoriteCep(), v = n ? await sigVisa(n, k) : { html: '', nom: '' };
        const l = R.candidats.filter(c => /^Admis/.test(R.res[c.id].decision)).sort((a, b) => String(a.entiteLib).localeCompare(String(b.entiteLib), 'fr') || String(a.nom).localeCompare(String(b.nom), 'fr'));
        return { titre: 'Liste des candidats admis — ' + ref.session, corps: '<p class="c">' + esc(ce.centre ? 'Centre : ' + ce.centre : 'Tous les centres') + ' — ' + l.length + ' admis</p>'
          + tableDoc(['N°', 'N° de table', 'Nom et prénoms', 'Sexe', 'École', 'Moyenne'], l.map((c, i) => [i + 1, c.numeroTable || '', nomComplet(c), c.sexe, c.entiteLib, R.res[c.id].moyenne]), ['c', 0, 0, 'c', 0, 'n']),
          sigs: [blocSig('Le président du jury', j.president || '', '', ''), v], resume: { entite: ce.centre || 'CEP', objet: ref.session, mention: l.length + ' admis', signataire: j.president || v.nom } };
      }),
      PALMARES_CONCOURS: (c) => document_('PALMARES_CONCOURS', { id: c.id }, async () => {
        const v = await sigVisa(c.niveau, c.entite), l = etat.participants.filter(p => p.concours === c.id), rg = rangsPoints(l);
        return { titre: 'Palmarès — ' + c.intitule, uas: [c.niveau, c.entite], corps: '<p class="c">' + esc([c.type, c.cours, fr(c.date), c.lieu].filter(Boolean).join(' — ')) + '</p>'
          + tableDoc(['Rang', 'Nom et prénoms', 'Sexe', 'École', 'Cours', 'Note'], l.slice().sort((a, b) => (rg[a.id] || 999) - (rg[b.id] || 999)).map(p => [rg[p.id] || '—', nomComplet(p), p.sexe, p.ecoleLib || '', p.cours, vide(p.points) ? '—' : p.points + ' / ' + (c.bareme || 20)]), ['c', 0, 'c', 0, 'c', 'n']),
          sigs: [blocSig('L’organisateur', c.organisateur || '', '', ''), v], resume: { entite: c.entiteLib, objet: c.intitule, mention: l.length + ' participant(s)', signataire: v.nom } };
      }),
      PRIX: (p) => document_('PRIX', { id: p.id }, async () => {
        const c = etat.concours.find(x => x.id === p.concours) || {}, rg = rangsPoints(etat.participants.filter(x => x.concours === p.concours))[p.id];
        const v = await sigVisa(c.niveau || p.niveau, c.entite || p.entite), lg = await logoUas(c.niveau || p.niveau, c.entite || p.entite, 120);
        return { sansTitre: true, titre: 'Diplôme de lauréat', corps: '<div class="pvs-cadre pvs-dip">' + (lg ? '<div class="pvs-gl">' + lg + '</div>' : '') + '<div class="gt">DIPLÔME DE LAURÉAT</div><p>décerné à</p><div class="nm">' + esc(nomComplet(p)) + '</div>'
          + (p.ecoleLib ? '<p>' + esc(p.ecoleLib) + (p.cours ? ' — ' + esc(p.cours) : '') + '</p>' : '') + '<p>' + (rg ? (rg === 1 ? '1<sup>er</sup> prix' : rg + '<sup>e</sup> prix') : 'participation') + ' au concours « <b>' + esc(c.intitule || '') + '</b> »</p><p>' + esc([fr(c.date), c.lieu].filter(Boolean).join(' — ')) + '</p></div>',
          sigs: [v], resume: { entite: c.entiteLib || p.entiteLib, objet: nomComplet(p), mention: (rg ? rg + (rg === 1 ? 'er' : 'e') + ' prix — ' : '') + (c.intitule || ''), signataire: v.nom } };
      })
    });
    Object.assign(VUES, {
      suiviReco(zone) {
        const l = lignes('recommandations'), par = {}; l.forEach(r => { par[r.statut || '—'] = (par[r.statut || '—'] || 0) + 1; });
        const echues = l.filter(r => r.statut !== 'Réalisée' && r.statut !== 'Abandonnée' && jours(r.echeance) !== null && jours(r.echeance) < 0);
        zone.append(h('div', { class: 'pvs-kpis' }, Object.entries(par).map(([k, v]) => h('div', { class: 'pvs-kpi' }, h('b', {}, v), h('span', {}, k))), h('div', { class: 'pvs-kpi' }, h('b', {}, echues.length), h('span', {}, 'Échues non réalisées'))));
      },
      epreuvesDefaut(zone) {
        const o = ongletColl('epreuves'), ew = entitesEcrivables(o), s2 = (F.epreuves || {}).saisonEpreuve || CAT().SESSION();
        if (!ew.length) return;
        zone.append(h('div', { class: 'pvs-actions' }, h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'epreuves-defaut', onclick: async () => {
          const sess = CAT().SESSION(); if (etat.epreuves.some(e => e.session === sess && visible(e))) { toast('La session ' + sess + ' a déjà ses épreuves.'); return; }
          const [n, list] = ew.find(x => x[0] === (ctx.autorite || {}).niveau) || ew[0], e = list.find(x => String(x.cle) === String((ctx.autorite || {}).cle)) || list[0];
          CAT().EPREUVES_CEP.forEach(([ep, coef, bar], i) => etat.epreuves.push({ id: uid(), cree: auj(), maj: new Date().toISOString(), niveau: n, entite: String(e.cle), entiteLib: e.lib, saison: saisonCourante(), session: sess, epreuve: ep, coefficient: coef, bareme: bar, ordre: i + 1 }));
          await sauver(); toast('Épreuves de la session ' + sess + ' créées (à adapter).'); dessiner(); } }, I('ajouter') + 'Épreuves par défaut de la session ' + CAT().SESSION())));
      },
      notesCep(zone) {
        barreCep(zone, false);
        const ep = epreuvesCep(), l = candidatsCep();
        if (!ep.length) { zone.append(h('p', { class: 'pvs-vide' }, 'Aucune épreuve pour cette session : rubrique « Épreuves ».')); return; }
        if (!l.length) { zone.append(h('p', { class: 'pvs-vide' }, 'Aucun candidat pour cette session / ce centre.')); return; }
        const tb = h('tbody', {});
        l.forEach(c => { const w = peut(c.niveau, c.entite);
          tb.append(h('tr', { 'data-id': c.id }, h('td', {}, c.numeroTable || ''), h('td', {}, nomComplet(c)), h('td', {}, c.entiteLib),
            ep.map(e => h('td', {}, h('input', { class: 'pvs-in', style: 'width:64px', inputmode: 'decimal', 'data-ep': e.id, value: (c.notes || {})[e.id] == null ? '' : c.notes[e.id], disabled: w ? null : true, 'aria-label': e.epreuve + ' — ' + nomComplet(c) }))))); });
        zone.append(h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t', 'data-pvs': 'grille-notes' }, h('thead', {}, h('tr', {}, ['N° de table', 'Candidat', 'École'].concat(ep.map(e => e.epreuve + ' (/' + (e.bareme || 20) + ', coef ' + (e.coefficient || 1) + ')')).map(t => h('th', {}, t)))), tb)));
        const lire = () => { let n = 0, err = 0; tb.querySelectorAll('tr').forEach(tr => { const c = etat.candidats.find(x => x.id === tr.dataset.id); if (!c || !peut(c.niveau, c.entite)) return; c.notes = c.notes || {};
          tr.querySelectorAll('input[data-ep]').forEach(i => { const t = i.value.trim().replace(',', '.'), e = ep.find(x => x.id === i.dataset.ep);
            if (t === '') delete c.notes[i.dataset.ep]; else if (/^abs/i.test(t)) c.notes[i.dataset.ep] = 'ABS'; else if (!isNaN(+t) && +t >= 0 && +t <= (num(e.bareme) || 20)) c.notes[i.dataset.ep] = +t; else { err++; i.style.borderColor = '#B42318'; return; }
            n++; }); c.maj = new Date().toISOString(); }); return [n, err]; };
        zone.append(h('div', { class: 'pvs-actions' },
          h('button', { class: 'pvs-btn p', type: 'button', 'data-pvs': 'enregistrer-notes', onclick: async () => { const [n, err] = lire(); await sauver(); toast(n + ' note(s) enregistrée(s)' + (err ? ' ; ' + err + ' note(s) hors barème ignorée(s)' : '') + '.'); } }, I('enregistrer') + 'Enregistrer les notes'),
          h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'excel-notes', onclick: () => exporter([{ nom: 'Notes', lignes: [['N° de table', 'Nom', 'Prénoms', 'Sexe', 'École'].concat(ep.map(e => e.epreuve))].concat(l.map(c => [c.numeroTable || '', c.nom, c.prenoms, c.sexe, c.entiteLib].concat(ep.map(e => { const v = (c.notes || {})[e.id]; return v == null ? '' : v; })))), entete: 0 }], 'notes-' + norm(etatC.session).replace(/\s+/g, '-')) }, I('graphique') + 'Excel (grille de saisie)'),
          h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'importer-notes', onclick: async () => {
            const f = await choisirFichier('.xlsx,.xls'); if (!f) return; let fs; try { fs = await A.xlsxLire(f); } catch (e) { toast('Fichier illisible.'); return; }
            const L2 = (fs.find(x => norm(x.nom) === 'notes') || fs[0]).lignes || [], i0 = L2.findIndex(x => (x || []).map(norm).includes('n de table'));
            if (i0 < 0) { toast('Colonne « N° de table » introuvable.'); return; }
            const tete = L2[i0].map(norm), iT = tete.indexOf('n de table'), iN = tete.indexOf('nom'), iP = tete.indexOf('prenoms'); let n = 0, rej = 0;
            L2.slice(i0 + 1).forEach(x => { if (!x) return; const c = l.find(y => (y.numeroTable && String(y.numeroTable) === String(x[iT] || '').trim()) || (!y.numeroTable && norm(y.nom) === norm(x[iN]) && norm(y.prenoms) === norm(x[iP])));
              if (!c || !peut(c.niveau, c.entite)) { if (x.some(v => v !== '' && v != null)) rej++; return; } c.notes = c.notes || {};
              ep.forEach(e => { const j = tete.indexOf(norm(e.epreuve)); if (j < 0) return; const t = String(x[j] == null ? '' : x[j]).trim().replace(',', '.'); if (t === '') return; c.notes[e.id] = /^abs/i.test(t) ? 'ABS' : Math.min(num(e.bareme) || 20, Math.max(0, num(t))); n++; }); });
            await sauver(); toast(n + ' note(s) importée(s)' + (rej ? ', ' + rej + ' ligne(s) sans candidat correspondant' : '') + '.'); dessiner(); } }, I('importer') + 'Importer la grille')));
      },
      deliberation(zone) {
        barreCep(zone, true);
        const R = resultatsCep(Object.assign({}, etat, { candidats: lignes('candidats'), epreuves: epreuvesCep() }), etatC.session, etatC.centre, etatC.seuil, etatC.rep);
        if (!R.candidats.length) { zone.append(h('p', { class: 'pvs-vide' }, 'Aucun candidat pour cette session / ce centre.')); return; }
        const l = R.candidats.slice().sort((a, b) => (R.res[a.id].rang || 9999) - (R.res[b.id].rang || 9999));
        const st = {}; l.forEach(c => { const k = c.entiteLib || '—', x = R.res[c.id], sx = c.sexe === 'F' ? 'F' : 'G'; const o = st[k] = st[k] || { iG: 0, iF: 0, pG: 0, pF: 0, aG: 0, aF: 0 }; o['i' + sx]++; if (x.moyenne !== null) o['p' + sx]++; if (/^Admis/.test(x.decision)) o['a' + sx]++; });
        const tx = (a, p) => (p ? Math.round(1000 * a / p) / 10 + ' %' : '—');
        const tot = Object.values(st).reduce((a, o) => { Object.keys(o).forEach(k => { a[k] = (a[k] || 0) + o[k]; }); return a; }, {});
        zone.append(h('div', { class: 'pvs-kpis' }, [['Inscrits', tot.iG + tot.iF], ['Présents', tot.pG + tot.pF], ['Admis', tot.aG + tot.aF], ['Taux de réussite', tx(tot.aG + tot.aF, tot.pG + tot.pF)], ['Réussite des filles', tx(tot.aF, tot.pF)], ['Réussite des garçons', tx(tot.aG, tot.pG)]].map(([k, v]) => h('div', { class: 'pvs-kpi' }, h('b', {}, v), h('span', {}, k)))));
        const jury = etat.jurys.find(j => j.session === etatC.session && (!etatC.centre || j.centre === etatC.centre));
        const ref = { session: etatC.session, centre: etatC.centre || '', seuil: etatC.seuil, repechage: etatC.rep, jury: jury ? jury.id : '' };
        const w = R.candidats.some(c => peut(c.niveau, c.entite));
        zone.append(h('div', { class: 'pvs-actions' },
          w ? h('button', { class: 'pvs-btn p', type: 'button', 'data-pvs': 'valider-deliberation', onclick: async () => {
            if (!(await confirmer('Valider la délibération', 'Écrire la moyenne, le rang et la décision sur les ' + R.candidats.length + ' candidat(s) ?', 'Valider', false))) return;
            R.candidats.forEach(c => { const x = R.res[c.id], cc = etat.candidats.find(y => y.id === c.id); if (cc && peut(cc.niveau, cc.entite)) Object.assign(cc, { moyenne: x.moyenne, rang: x.rang || '', decision: x.decision, maj: new Date().toISOString() }); });
            await sauver(); toast('Délibération validée.'); dessiner(); } }, I('valider') + 'Valider la délibération') : null,
          h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'doc-PV_DELIBERATION', onclick: () => DOCS.PV_DELIBERATION(ref) }, I('imprimer') + 'PV de délibération'),
          h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'doc-LISTE_ADMIS', onclick: () => DOCS.LISTE_ADMIS(ref) }, I('imprimer') + 'Liste des admis'),
          h('button', { class: 'pvs-btn', type: 'button', 'data-pvs': 'excel-resultats', onclick: () => exporter([
            { nom: 'Résultats', lignes: [['Rang', 'N° de table', 'Nom', 'Prénoms', 'Sexe', 'École'].concat(R.epreuves.map(e => e.epreuve), ['Total', 'Moyenne', 'Décision'])].concat(l.map(c => { const x = R.res[c.id]; return [x.rang || '', c.numeroTable || '', c.nom, c.prenoms, c.sexe, c.entiteLib].concat(R.epreuves.map(e => { const v = (c.notes || {})[e.id]; return v == null ? '' : v; }), [x.total, x.moyenne == null ? '' : x.moyenne, x.decision]); })), entete: 0 },
            { nom: 'Statistiques', lignes: [['École', 'Inscrits G', 'Inscrits F', 'Présents G', 'Présents F', 'Admis G', 'Admis F', 'Taux de réussite (%)']].concat(Object.entries(st).map(([k, o]) => [k, o.iG, o.iF, o.pG, o.pF, o.aG, o.aF, o.pG + o.pF ? Math.round(1000 * (o.aG + o.aF) / (o.pG + o.pF)) / 10 : ''])), entete: 0 }], 'resultats-' + norm(etatC.session).replace(/\s+/g, '-')) }, I('graphique') + 'Excel (résultats et statistiques)')));
        zone.append(h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t', 'data-pvs': 'table-resultats' }, h('thead', {}, h('tr', {}, ['Rang', 'N° de table', 'Candidat', 'Sexe', 'École', 'Total', 'Moyenne', 'Décision'].map(t => h('th', {}, t)))),
          h('tbody', {}, l.map(c => { const x = R.res[c.id]; return h('tr', { class: /^Admis/.test(x.decision) ? 'q' : '' }, h('td', { class: 'c' }, x.rang || '—'), h('td', {}, c.numeroTable || ''), h('td', {}, nomComplet(c)), h('td', { class: 'c' }, c.sexe || ''), h('td', {}, c.entiteLib), h('td', { class: 'n' }, x.total), h('td', { class: 'n' }, x.moyenne == null ? '—' : x.moyenne), h('td', {}, x.decision)); })))),
          h('h3', {}, 'Statistiques par école'), h('div', { class: 'pvs-tw' }, h('table', { class: 'pvs-t' }, h('thead', {}, h('tr', {}, ['École', 'Inscrits (G/F)', 'Présents (G/F)', 'Admis (G/F)', 'Taux de réussite'].map(t => h('th', {}, t)))),
            h('tbody', {}, Object.entries(st).map(([k, o]) => h('tr', {}, h('td', {}, k), h('td', { class: 'c' }, o.iG + ' / ' + o.iF), h('td', { class: 'c' }, o.pG + ' / ' + o.pF), h('td', { class: 'c' }, o.aG + ' / ' + o.aF), h('td', { class: 'n' }, tx(o.aG + o.aF, o.pG + o.pF))))))));
      }
    });
    /* ---------- dessin du module ---------- */
    const api = { accuses, etat: () => etat, ctx: () => ctx, libRef, entite, peut, lignes, sauver, toast, dialogue, confirmer, h, esc, fr, iso, num, uid, auj, nomComplet, saisonCourante,
      ecolesDe, superieure, dans, sigUascep, sigVisa, blocSig, document_, tableDoc, exporter, feuille, formulaire, valeur, classement, scoreMatch, vainqueur, proposerPalmares, DOCS };
    function dessiner() {
      racine.replaceChildren();
      const z = h('div', { class: 'pvs', 'data-pvs-module': MOD.id });
      if (!A.sansTitre) z.append(h('h2', { class: 'pvs-titre' }, MOD.icone + ' ' + MOD.titre), h('p', { class: 'pvs-sous' }, MOD.desc));
      const liens = (A.liens || {})[MOD.id];
      if (liens && liens.length && A.ouvrir) z.append(h('div', { class: 'pvs-liens' }, 'Voir aussi :', liens.map(l => h('button', { class: 'pvs-btn s', type: 'button', onclick: () => A.ouvrir(l.route) }, l.l))));
      z.append(h('div', { class: 'pvs-onglets', role: 'tablist' }, onglets.map(o => h('button', { class: 'pvs-onglet' + (o.id === onglet ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': o.id === onglet ? 'true' : 'false', 'data-onglet': o.id,
        onclick: () => { onglet = o.id; memo.set(MOD.id + '.onglet', o.id); dessiner(); } }, o.titre))));
      const o = onglets.find(x => x.id === onglet), zone = h('div', { class: 'pvs-zone' });
      z.append(zone); racine.append(z);
      try {
        if (o.vue === 'pilotage') { pilotage(zone).catch(e => { console.error(e); zone.append(h('p', { class: 'pvs-vide' }, 'Erreur : ' + e.message)); }); return; }
        if ((MOD.id === 'communication' && o.id !== 'alertes') || MOD.id === 'sante') bandeauAlertes(zone).catch(e => console.error(e));
        if (o.vue && VUES[o.vue]) VUES[o.vue](zone, o);
        if (o.coll) rubrique(o, zone);
      } catch (e) { console.error(e); zone.append(h('p', { class: 'pvs-vide' }, 'Erreur : ' + e.message)); }
    }
    dessiner();
    return { rafraichir: async () => { ctx = await A.contexte(); uasCache = null; dessiner(); }, etat: () => etat, api };
  }

  global.PVS = { monter, contenuDocument, resultatsCep, canon, classement, scoreMatch, vainqueur, tourniquet, rangsPerformances, rangsPoints, iso, fr, norm, niveauDe, saisonCourante, LIB_NIVEAU, VISA_DEFAUT, barres };
})(typeof window !== 'undefined' ? window : globalThis);
