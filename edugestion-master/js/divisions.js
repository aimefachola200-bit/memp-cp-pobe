/* ÉduGestion Pro Master — divisions et services de la circonscription scolaire et de la direction départementale.

   Comme dans SCOLARIS et GESCOL : chaque division (CS : CCS, CP, Secrétariat, Ressources humaines, Animation
   pédagogique, Administration et finances, Organisation scolaire et prévision ; DDEMP : Direction, Examens et
   concours, Écoles maternelles et primaires, Ressources humaines, Planification-administration-finances,
   Cantines, Statistiques, Infrastructures) a sa rubrique — attributions de l'AOF, chef et signature —, ses
   statistiques et ses courbes (au choix : courbe, histogramme, barres empilées, aires, points), et son plan
   d'action (lignes tirées des attributions, état, taux de réalisation).
   Les chiffres viennent des données de l'application, dans le périmètre de la structure : statistiques et
   inscriptions des écoles, personnel, visites, courriers, CEP, infrastructures, mobilier, budgets, cantines.

   Adresses : divisions[/<territoire>], division/<territoire>/<code>. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const S = () => EG.Sortie, G = () => global.Graphiques;
  const ech = s => EG.Docs.echapper(s);
  const tri = (a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { numeric: true });
  const num = v => (typeof v === 'number' && !isNaN(v)) ? v : (v === '' || v === null || v === undefined ? 0 : (isNaN(+v) ? 0 : +v));
  const pc = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
  const fpc = v => v === null || v === undefined ? '—' : String(v).replace('.', ',') + ' %';
  const fr = v => v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toString().replace('.', ',');
  const C = { G: '#2166AC', F: '#C2185B', T: '#008751', o: '#B86400', v: '#7B4FA8', g: '#55616B', j: '#D4A300', r: '#C62828' };
  const MOIS = [['09', 'Sept.'], ['10', 'Oct.'], ['11', 'Nov.'], ['12', 'Déc.'], ['01', 'Janv.'], ['02', 'Févr.'], ['03', 'Mars'], ['04', 'Avr.'], ['05', 'Mai'], ['06', 'Juin'], ['07', 'Juil.'], ['08', 'Août']];
  const ROLES = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'CONSEILLER_PEDAGOGIQUE'];

  const niveauDe = t => t && t.type === 'DEPARTEMENT' ? 'ddemp' : 'cs';
  const divisionsDe = t => ((EG.DIVISIONS_AOF || {})[niveauDe(t)] || []).slice().sort((a, b) => a.ordre - b.ordre);

  /* Module de statistiques de chaque division */
  const MODULE = {
    ccs: ['synthese'], cp: ['encadrement'], secretariat: ['courrier'], personnel: ['rh'], animation: ['cep', 'encadrement'],
    administration: ['finances', 'mobilier'], organisation: ['effectifs', 'ecoles'],
    direction: ['synthese'], sec: ['cep'], semp: ['ecoles', 'encadrement'], srh: ['rh'], spaf: ['courrier', 'finances'],
    cantines: ['cantines'], statistiques: ['effectifs'], infrastructures: ['infra', 'mobilier']
  };

  /** Structures que le compte peut ouvrir : ses circonscriptions, et son (ses) département(s). */
  function sujets(ctx) {
    const u = EG.session.user;
    let l = ctx.csList.slice();
    if (u.role !== 'CS' && u.role !== 'CONSEILLER_PEDAGOGIQUE') l = ctx.terr.filter(t => t.type === 'DEPARTEMENT' && (ctx.complet || t.id === ctx.p.dep)).sort(tri).concat(l);
    return l;
  }

  /* =======================================================================
     Données d'une structure
     ======================================================================= */

  function charger(t, ctx) {
    const P = EG.Perimetre, nv = niveauDe(t);
    const ecoles = ctx.ecoles.filter(e => e.actif !== false && (nv === 'cs' ? e.territoire_id === t.id : P.departementDe(e, ctx.index) === t.id)).sort(tri);
    const ids = {}; ecoles.forEach(e => { ids[e.id] = e; });
    const csIds = {}; if (nv === 'cs') csIds[t.id] = true; else ctx.terr.forEach(x => { if (x.type === 'CIRCONSCRIPTION' && (P.ancetre(ctx.index, x.id, 'DEPARTEMENT') || {}).id === t.id) csIds[x.id] = true; });
    const tables = ['statistiques_ecoles', 'inscriptions_eleves', 'eleves', 'personnels', 'visites', 'courriers', 'resultats_cep', 'fiches_cep', 'infrastructures',
      'inventaires_mobilier', 'cantines', 'participations_cantine', 'budgets_ecoles', 'mouvements_budget', 'classes', 'formations_personnel', 'regles_retraite'];
    return Promise.all(tables.map(n => DB.all(n).catch(() => []))).then(r => {
      const T = {}; tables.forEach((n, i) => { T[n] = r[i]; });
      const anneeId = EG.session.annee_id, anneeCode = EG.session.annee_code;
      const dans = x => ids[x.ecole_id];
      const groupeDe = e => nv === 'cs' ? e.nom : ((ctx.index[e.territoire_id] || {}).nom || 'Sans circonscription');
      const groupes = []; const vus = {};
      ecoles.forEach(e => { const g = groupeDe(e); if (!vus[g]) { vus[g] = true; groupes.push(g); } });
      if (nv === 'ddemp') groupes.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
      const ie = {}; T.eleves.forEach(x => { ie[x.id] = x; });
      const ins = T.inscriptions_eleves.filter(i => dans(i) && i.annee_scolaire_id === anneeId && i.statut !== 'TRANSFERE' && i.statut !== 'ABANDON');
      const insId = {}; T.inscriptions_eleves.forEach(i => { insId[i.id] = i; });
      /* Effectifs par école : la statistique de l'année si elle existe, sinon les inscriptions. */
      const statDe = {}; T.statistiques_ecoles.forEach(s => { if (s.annee_code === anneeCode && ids[s.ecole_id]) statDe[s.ecole_id] = s; });
      const eff = {};
      ecoles.forEach(e => {
        const s = statDe[e.id], o = { cours: {}, g: 0, f: 0, classes: 0, perso: 0 };
        if (s) {
          Object.keys(s.effectifs || {}).forEach(c => { const v = s.effectifs[c] || [0, 0]; o.cours[c] = [num(v[0]), num(v[1])]; o.g += num(v[0]); o.f += num(v[1]); });
          if (!o.g && !o.f) { o.g = num(s.total_garcons); o.f = num(s.total_filles); }
          o.autorisees = num(s.classes_autorisees); o.perso = num(s.personnel_fe) + num(s.personnel_acdpe) + num(s.personnel_ame);
        } else {
          ins.filter(i => i.ecole_id === e.id).forEach(i => { const x = ie[i.eleve_id] || {}; const k = x.sexe === 'F' ? 1 : 0; o.cours[i.niveau] = o.cours[i.niveau] || [0, 0]; o.cours[i.niveau][k]++; if (k) o.f++; else o.g++; });
        }
        // classes OUVERTES (une classe jumelée ou multigrade compte pour une) ; à défaut, les autorisées déclarées
        const cx = EG.Classes.ecole(e, T.classes.filter(c => c.ecole_id === e.id && c.annee_scolaire_id === anneeId), s);
        Object.assign(o, { classes: EG.Classes.pourRatios(cx).n, ouvertes: cx.ouvertes, simples: cx.simples, jumelees: cx.jumelees, multigrades: cx.multigrades, autorisees: cx.autorisees || o.autorisees || 0 });
        eff[e.id] = o;
      });
      const perso = T.personnels.filter(p => dans(p) && p.actif !== false);
      ecoles.forEach(e => { const n = perso.filter(p => p.ecole_id === e.id && ['DIRECTEUR', 'ENSEIGNANT'].indexOf(p.fonction || 'ENSEIGNANT') >= 0).length; eff[e.id].perso = Math.max(eff[e.id].perso, n); });
      return {
        t, nv, ctx, ecoles, ids, groupes, groupeDe, eff, perso, ins, ie, insId, anneeId, anneeCode,
        visites: T.visites.filter(v => dans(v) && (!v.annee_scolaire_id || v.annee_scolaire_id === anneeId)),
        courriers: T.courriers.filter(c => csIds[c.territoire_id] || (c.ecole_id && ids[c.ecole_id]) || c.territoire_id === t.id),
        cep: T.resultats_cep.filter(r => insId[r.inscription_id] && ids[insId[r.inscription_id].ecole_id] && insId[r.inscription_id].annee_scolaire_id === anneeId),
        fichesCep: T.fiches_cep.filter(f => insId[f.inscription_id] && ids[insId[f.inscription_id].ecole_id] && insId[f.inscription_id].annee_scolaire_id === anneeId),
        infra: T.infrastructures.filter(dans), mobilier: T.inventaires_mobilier.filter(m => dans(m) && (!m.annee_scolaire_id || m.annee_scolaire_id === anneeId)),
        cantines: T.cantines.filter(c => dans(c) && (!c.annee_scolaire_id || c.annee_scolaire_id === anneeId)),
        repas: T.participations_cantine.filter(p => insId[p.inscription_id] && ids[insId[p.inscription_id].ecole_id] && insId[p.inscription_id].annee_scolaire_id === anneeId),
        budgets: T.budgets_ecoles.filter(b => dans(b) && (!b.annee_scolaire_id || b.annee_scolaire_id === anneeId)),
        mouvements: T.mouvements_budget, formations: T.formations_personnel, regles: T.regles_retraite
      };
    });
  }

  /* Sommes par groupe (école pour une CS, circonscription pour une DDEMP). */
  function parGroupe(D, f) {
    const o = {}; D.groupes.forEach(g => { o[g] = 0; });
    D.ecoles.forEach(e => { o[D.groupeDe(e)] += f(e); });
    return D.groupes.map(g => o[g]);
  }
  const libGroupe = D => D.nv === 'cs' ? 'École' : 'Circonscription';
  const moisDe = d => d ? String(d).slice(5, 7) : '';

  /* =======================================================================
     Statistiques de chaque division : { kpis, graphes, tableaux }
     ======================================================================= */

  const STATS = {
    synthese(D) {
      const g = D.ecoles.reduce((a, e) => a + D.eff[e.id].g, 0), f = D.ecoles.reduce((a, e) => a + D.eff[e.id].f, 0);
      const ens = D.ecoles.reduce((a, e) => a + D.eff[e.id].perso, 0), cl = D.ecoles.reduce((a, e) => a + D.eff[e.id].classes, 0);
      const pub = D.ecoles.filter(e => e.statut !== 'PRIVEE').length;
      const cours = coursPresents(D);
      return {
        kpis: [['Écoles', D.ecoles.length, pub + ' publiques · ' + (D.ecoles.length - pub) + ' privées'], ['Élèves', g + f, g + ' G · ' + f + ' F (' + fpc(pc(f, g + f)) + ' de filles)'],
          ['Enseignants', ens, 'ratio ' + fr(ens ? (g + f) / ens : null) + ' élèves par maître'], ['Classes ouvertes', cl, fr(cl ? (g + f) / cl : null) + ' élèves par classe ouverte · ' + D.ecoles.reduce((a, e) => a + (D.eff[e.id].jumelees || 0), 0) + ' jumelée(s), ' + D.ecoles.reduce((a, e) => a + (D.eff[e.id].multigrades || 0), 0) + ' multigrade(s)']],
        graphes: [{ titre: 'Effectifs par cours et par sexe', labels: cours, series: [{ nom: 'Garçons', color: C.G, values: cours.map(c => somCours(D, c, 0)) }, { nom: 'Filles', color: C.F, values: cours.map(c => somCours(D, c, 1)) }] },
          { titre: 'Élèves par ' + libGroupe(D).toLowerCase(), labels: D.groupes, series: [{ nom: 'Garçons', color: C.G, values: parGroupe(D, e => D.eff[e.id].g) }, { nom: 'Filles', color: C.F, values: parGroupe(D, e => D.eff[e.id].f) }] }],
        tableaux: [{ titre: 'Synthèse par ' + libGroupe(D).toLowerCase(), entetes: [libGroupe(D), 'Écoles', 'Classes', 'Garçons', 'Filles', 'Total', 'Enseignants', 'Élèves / maître'],
          lignes: lignesGroupes(D, ec => { const gg = sum(ec, e => D.eff[e.id].g), ff = sum(ec, e => D.eff[e.id].f), en = sum(ec, e => D.eff[e.id].perso); return [ec.length, sum(ec, e => D.eff[e.id].classes), gg, ff, gg + ff, en, fr(en ? (gg + ff) / en : null)]; }) }]
      };
    },
    effectifs(D) {
      const cours = coursPresents(D);
      const g = D.ecoles.reduce((a, e) => a + D.eff[e.id].g, 0), f = D.ecoles.reduce((a, e) => a + D.eff[e.id].f, 0), cl = D.ecoles.reduce((a, e) => a + D.eff[e.id].classes, 0);
      const mat = D.ecoles.filter(e => e.cycle === 'MATERNELLE');
      return {
        kpis: [['Élèves', g + f, g + ' G · ' + f + ' F'], ['Part des filles', fpc(pc(f, g + f)), 'indice de parité ' + fr(g ? f / g : null)], ['Élèves par classe', fr(cl ? (g + f) / cl : null), cl + ' classes'],
          ['Maternelles', sum(mat, e => D.eff[e.id].g + D.eff[e.id].f), mat.length + ' écoles maternelles']],
        graphes: [{ titre: 'Effectifs par cours', sousTitre: 'garçons, filles et total', labels: cours, series: [{ nom: 'Garçons', color: C.G, values: cours.map(c => somCours(D, c, 0)) }, { nom: 'Filles', color: C.F, values: cours.map(c => somCours(D, c, 1)) }, { nom: 'Total', color: C.T, values: cours.map(c => somCours(D, c, 0) + somCours(D, c, 1)) }] },
          { titre: 'Élèves par classe — ' + libGroupe(D).toLowerCase(), labels: D.groupes, series: [{ nom: 'Élèves / classe', color: C.o, values: lignesGroupesBrut(D, ec => { const c = sum(ec, e => D.eff[e.id].classes); return c ? Math.round(sum(ec, e => D.eff[e.id].g + D.eff[e.id].f) / c * 10) / 10 : 0; }) }] }],
        tableaux: [{ titre: 'Effectifs par cours et par sexe', entetes: ['Cours', 'Garçons', 'Filles', 'Total', '% de filles'],
          lignes: cours.map(c => { const a = somCours(D, c, 0), b = somCours(D, c, 1); return [c, a, b, a + b, fpc(pc(b, a + b))]; }).concat([['TOTAL', g, f, g + f, fpc(pc(f, g + f))]]) }]
      };
    },
    ecoles(D) {
      const pub = e => e.statut !== 'PRIVEE';
      return {
        kpis: [['Écoles publiques', D.ecoles.filter(pub).length, ''], ['Écoles privées', D.ecoles.filter(e => !pub(e)).length, ''], ['Primaires', D.ecoles.filter(e => e.cycle !== 'MATERNELLE').length, ''], ['Maternelles', D.ecoles.filter(e => e.cycle === 'MATERNELLE').length, '']],
        graphes: [{ titre: 'Écoles publiques et privées', labels: D.groupes, series: [{ nom: 'Publiques', color: C.T, values: parGroupe(D, e => pub(e) ? 1 : 0) }, { nom: 'Privées', color: C.v, values: parGroupe(D, e => pub(e) ? 0 : 1) }] }],
        tableaux: [{ titre: 'Écoles par statut et par cycle', entetes: [libGroupe(D), 'Publiques', 'Privées', 'Primaires', 'Maternelles', 'Visites reçues'],
          lignes: lignesGroupes(D, ec => [ec.filter(pub).length, ec.filter(e => !pub(e)).length, ec.filter(e => e.cycle !== 'MATERNELLE').length, ec.filter(e => e.cycle === 'MATERNELLE').length, D.visites.filter(v => ec.some(e => e.id === v.ecole_id)).length]) }]
      };
    },
    encadrement(D) {
      const ens = D.perso.filter(p => ['DIRECTEUR', 'ENSEIGNANT'].indexOf(p.fonction || 'ENSEIGNANT') >= 0);
      const visites = new Set(D.visites.map(v => v.personnel_visite_id).filter(Boolean));
      const types = ['VISITE_CLASSE', 'VISITE_ECOLE', 'INSPECTION', 'SUIVI'], couls = [C.T, C.G, C.o, C.v];
      const up = D.formations.filter(x => x.type === 'UNITE_PEDAGOGIQUE' && ens.some(p => p.id === x.personnel_id)).length;
      return {
        kpis: [['Visites', D.visites.length, D.visites.filter(v => v.statut === 'VALIDEE' || v.statut === 'CLOTUREE').length + ' validées'], ['Enseignants visités', visites.size, fpc(pc(visites.size, ens.length)) + ' des ' + ens.length + ' enseignants'],
          ['Formations en UP', up, 'participations enregistrées'], ['Écoles visitées', new Set(D.visites.map(v => v.ecole_id)).size, 'sur ' + D.ecoles.length]],
        graphes: [{ titre: 'Visites par mois et par type', labels: MOIS.slice(0, 10).map(m => m[1]), series: types.map((ty, k) => ({ nom: U.libelle(ty), color: couls[k], values: MOIS.slice(0, 10).map(m => D.visites.filter(v => v.type_code === ty && moisDe(v.date_visite) === m[0]).length) })) }],
        tableaux: [{ titre: 'Encadrement par ' + libGroupe(D).toLowerCase(), entetes: [libGroupe(D), 'Enseignants', 'Visités', '% visités', 'Visites'],
          lignes: lignesGroupes(D, ec => { const ids = ec.map(e => e.id), en = ens.filter(p => ids.indexOf(p.ecole_id) >= 0), vi = en.filter(p => visites.has(p.id)).length; return [en.length, vi, fpc(pc(vi, en.length)), D.visites.filter(v => ids.indexOf(v.ecole_id) >= 0).length]; }) }]
      };
    },
    courrier(D) {
      const a = D.courriers.filter(c => c.sens === 'ARRIVEE'), d = D.courriers.filter(c => c.sens === 'DEPART');
      const cats = ['ADMINISTRATIF', 'PEDAGOGIQUE', 'PERSONNEL', 'FINANCIER', 'STATISTIQUES', 'AUTRE'];
      return {
        kpis: [['Courriers arrivés', a.length, a.filter(c => c.statut === 'A_TRAITER').length + ' à traiter'], ['Courriers envoyés', d.length, ''], ['Traités', D.courriers.filter(c => c.statut !== 'A_TRAITER').length, fpc(pc(D.courriers.filter(c => c.statut !== 'A_TRAITER').length, D.courriers.length))], ['Avec pièce jointe', D.courriers.filter(c => c.fichier_nom).length, '']],
        graphes: [{ titre: 'Courriers par mois', labels: MOIS.map(m => m[1]), series: [{ nom: 'Arrivés', color: C.G, values: MOIS.map(m => a.filter(c => moisDe(c.date_courrier) === m[0]).length) }, { nom: 'Envoyés', color: C.o, values: MOIS.map(m => d.filter(c => moisDe(c.date_courrier) === m[0]).length) }] }],
        tableaux: [{ titre: 'Courriers par catégorie', entetes: ['Catégorie', 'Arrivés', 'Envoyés', 'À traiter'], lignes: cats.map(k => [U.libelle(k), a.filter(c => c.categorie === k).length, d.filter(c => c.categorie === k).length, D.courriers.filter(c => c.categorie === k && c.statut === 'A_TRAITER').length]) }]
      };
    },
    rh(D) {
      const st = p => EG.Categories ? EG.Categories.statutDe(p, D.ids[p.ecole_id]) : 'A_PRECISER';
      const cats = [['FE', 'FE'], ['ACDPE', 'ACDPE'], ['ACDPCTD', 'ACDPCTD'], ['PRIVE', 'Privé'], ['A_PRECISER', 'À préciser']];
      const an = new Date().getFullYear(), annees = [0, 1, 2, 3, 4, 5].map(k => an + k);
      const retraite = p => { const r = EG.Rules.previsionRetraite(p, D.regles); return r ? +r.date_retraite.slice(0, 4) : null; };
      const f = D.perso.filter(p => p.sexe === 'F').length;
      return {
        kpis: [['Agents', D.perso.length, f + ' femmes (' + fpc(pc(f, D.perso.length)) + ')'], ...cats.slice(0, 3).map(([k, l]) => [l, D.perso.filter(p => st(p) === k).length, '']),
          ['Départs à la retraite (5 ans)', D.perso.filter(p => { const r = retraite(p); return r && r >= an && r <= an + 5; }).length, an + '–' + (an + 5)]],
        graphes: [{ titre: 'Personnel par statut et par sexe', labels: cats.map(c => c[1]), series: [{ nom: 'Hommes', color: C.G, values: cats.map(([k]) => D.perso.filter(p => st(p) === k && p.sexe !== 'F').length) }, { nom: 'Femmes', color: C.F, values: cats.map(([k]) => D.perso.filter(p => st(p) === k && p.sexe === 'F').length) }] },
          { titre: 'Départs à la retraite prévus', labels: annees.map(String), series: [{ nom: 'Départs', color: C.r, values: annees.map(a => D.perso.filter(p => retraite(p) === a).length) }] }],
        tableaux: [{ titre: 'Personnel par ' + libGroupe(D).toLowerCase(), entetes: [libGroupe(D)].concat(cats.map(c => c[1]), ['Total', 'Femmes']),
          lignes: lignesGroupes(D, ec => { const ids = ec.map(e => e.id), l = D.perso.filter(p => ids.indexOf(p.ecole_id) >= 0); return cats.map(([k]) => l.filter(p => st(p) === k).length).concat([l.length, l.filter(p => p.sexe === 'F').length]); }) }]
      };
    },
    cep(D) {
      const sexe = r => (D.ie[(D.insId[r.inscription_id] || {}).eleve_id] || {}).sexe === 'F' ? 1 : 0;
      const ecoleDe = r => (D.insId[r.inscription_id] || {}).ecole_id;
      const insc = D.cep.filter(r => r.inscrit !== false), comp = insc.filter(r => r.a_compose !== false), adm = insc.filter(r => r.admis);
      const cand = insc.length || D.fichesCep.length;
      const t = (l, s) => l.filter(r => sexe(r) === s).length;
      const taux = (ec, s) => { const ids = ec.map(e => e.id); const c = comp.filter(r => ids.indexOf(ecoleDe(r)) >= 0 && (s === undefined || sexe(r) === s)), a = c.filter(r => r.admis).length; return c.length ? Math.round(a / c.length * 1000) / 10 : 0; };
      return {
        kpis: [['Candidats inscrits', cand, insc.length ? t(insc, 0) + ' G · ' + t(insc, 1) + ' F (' + fpc(pc(t(insc, 1), insc.length)) + ' de filles)' : D.fichesCep.length + ' fiches d’inscription'],
          ['Ont composé', comp.length, 'présence ' + fpc(pc(comp.length, insc.length))], ['Admis', adm.length, t(adm, 0) + ' G · ' + t(adm, 1) + ' F'],
          ['Taux de réussite', fpc(pc(adm.length, comp.length)), 'G ' + fpc(pc(t(adm, 0), t(comp, 0))) + ' · F ' + fpc(pc(t(adm, 1), t(comp, 1)))]],
        graphes: [{ titre: 'Taux de réussite au CEP par ' + libGroupe(D).toLowerCase() + ' (%)', labels: D.groupes, series: [{ nom: 'Garçons', color: C.G, values: lignesGroupesBrut(D, ec => taux(ec, 0)) }, { nom: 'Filles', color: C.F, values: lignesGroupesBrut(D, ec => taux(ec, 1)) }, { nom: 'Ensemble', color: C.T, values: lignesGroupesBrut(D, ec => taux(ec)) }] }],
        tableaux: [{ titre: 'Résultats au CEP', entetes: [libGroupe(D), 'Inscrits', 'Ont composé', 'Admis', 'Taux G', 'Taux F', 'Taux'],
          lignes: lignesGroupes(D, ec => { const ids = ec.map(e => e.id), i = insc.filter(r => ids.indexOf(ecoleDe(r)) >= 0), c = i.filter(r => r.a_compose !== false); return [i.length, c.length, c.filter(r => r.admis).length, fpc(taux(ec, 0)), fpc(taux(ec, 1)), fpc(taux(ec))]; }) }]
      };
    },
    finances(D) {
      const ids = {}; D.budgets.forEach(b => { ids[b.id] = b; });
      const mv = D.mouvements.filter(m => ids[m.budget_id]);
      const ress = b => num(b.cotisation_parents) + num(b.autres_ressources) + num(b.solde_exercice_anterieur) + mv.filter(m => m.budget_id === b.id && m.type === 'SUBVENTION_ETAT').reduce((a, m) => a + num(m.montant), 0);
      const dep = b => mv.filter(m => m.budget_id === b.id && m.type === 'DEPENSE').reduce((a, m) => a + num(m.montant), 0);
      const R = D.budgets.reduce((a, b) => a + ress(b), 0), Dp = D.budgets.reduce((a, b) => a + dep(b), 0);
      const parE = (ec, f) => D.budgets.filter(b => ec.some(e => e.id === b.ecole_id)).reduce((a, b) => a + f(b), 0);
      return {
        kpis: [['Budgets d’écoles', D.budgets.length, D.budgets.filter(b => b.statut === 'VALIDE' || b.statut === 'VERROUILLE').length + ' validés'], ['Ressources', U.fcfa(R), ''], ['Dépenses', U.fcfa(Dp), 'exécution ' + fpc(pc(Dp, R))], ['Solde', U.fcfa(R - Dp), '']],
        graphes: [{ titre: 'Ressources et dépenses (FCFA)', labels: D.groupes, series: [{ nom: 'Ressources', color: C.T, values: lignesGroupesBrut(D, ec => parE(ec, ress)) }, { nom: 'Dépenses', color: C.r, values: lignesGroupesBrut(D, ec => parE(ec, dep)) }] }],
        tableaux: [{ titre: 'Budgets par ' + libGroupe(D).toLowerCase(), entetes: [libGroupe(D), 'Ressources (FCFA)', 'Dépenses (FCFA)', 'Taux d’exécution'], lignes: lignesGroupes(D, ec => { const r = parE(ec, ress), d = parE(ec, dep); return [U.nombre(r), U.nombre(d), fpc(pc(d, r))]; }) }]
      };
    },
    mobilier(D) {
      const tb = D.mobilier.filter(m => m.type_mobilier === 'TABLE_BANC');
      const q = (l, k) => l.reduce((a, m) => a + num(m[k]), 0);
      const eleves = D.ecoles.reduce((a, e) => a + D.eff[e.id].g + D.eff[e.id].f, 0), places = q(tb, 'bon_etat') * 2;
      return {
        kpis: [['Tables-bancs', q(tb, 'quantite'), q(tb, 'bon_etat') + ' en bon état'], ['À réparer', q(tb, 'a_reparer'), q(tb, 'hors_service') + ' hors service'], ['Places assises', places, 'en bon état, 2 élèves par table-banc'], ['Élèves sans place', Math.max(0, eleves - places), eleves + ' élèves']],
        graphes: [{ titre: 'État des tables-bancs', labels: D.groupes, series: [{ nom: 'Bon état', color: C.T, values: lignesGroupesBrut(D, ec => q(tb.filter(m => ec.some(e => e.id === m.ecole_id)), 'bon_etat')) }, { nom: 'À réparer', color: C.j, values: lignesGroupesBrut(D, ec => q(tb.filter(m => ec.some(e => e.id === m.ecole_id)), 'a_reparer')) }, { nom: 'Hors service', color: C.r, values: lignesGroupesBrut(D, ec => q(tb.filter(m => ec.some(e => e.id === m.ecole_id)), 'hors_service')) }] }],
        tableaux: [{ titre: 'Mobilier par type', entetes: ['Type', 'Quantité', 'Bon état', 'À réparer', 'Hors service'], lignes: ['TABLE_BANC', 'CHAISE', 'TABLE_MAITRE', 'ARMOIRE', 'TABLEAU', 'NATTE', 'AUTRE'].map(k => { const l = D.mobilier.filter(m => m.type_mobilier === k); return [U.libelle(k), q(l, 'quantite'), q(l, 'bon_etat'), q(l, 'a_reparer'), q(l, 'hors_service')]; }) }]
      };
    },
    infra(D) {
      const salles = D.infra.filter(i => i.type_local === 'SALLE_CLASSE' && i.utilise !== false), lat = D.infra.filter(i => i.type_local === 'LATRINES');
      const dur = salles.filter(i => i.nature_murs === 'DUR').length, cl = D.ecoles.reduce((a, e) => a + D.eff[e.id].classes, 0);
      const eleves = D.ecoles.reduce((a, e) => a + D.eff[e.id].g + D.eff[e.id].f, 0);
      return {
        kpis: [['Salles de classe', salles.length, dur + ' en dur (' + fpc(pc(dur, salles.length)) + ')'], ['Classes', cl, 'manque ' + Math.max(0, cl - salles.length) + ' salle(s)'], ['Élèves par salle', fr(salles.length ? eleves / salles.length : null), ''], ['Latrines', lat.length, '']],
        graphes: [{ titre: 'Salles de classe et classes', labels: D.groupes, series: [{ nom: 'Salles', color: C.T, values: lignesGroupesBrut(D, ec => salles.filter(i => ec.some(e => e.id === i.ecole_id)).length) }, { nom: 'Classes', color: C.o, values: lignesGroupesBrut(D, ec => sum(ec, e => D.eff[e.id].classes)) }] }],
        tableaux: [{ titre: 'Locaux par ' + libGroupe(D).toLowerCase(), entetes: [libGroupe(D), 'Salles', 'En dur', 'Classes', 'Latrines', 'Autres locaux'],
          lignes: lignesGroupes(D, ec => { const l = D.infra.filter(i => ec.some(e => e.id === i.ecole_id)), s = l.filter(i => i.type_local === 'SALLE_CLASSE' && i.utilise !== false); return [s.length, s.filter(i => i.nature_murs === 'DUR').length, sum(ec, e => D.eff[e.id].classes), l.filter(i => i.type_local === 'LATRINES').length, l.filter(i => ['SALLE_CLASSE', 'LATRINES'].indexOf(i.type_local) < 0).length]; }) }]
      };
    },
    cantines(D) {
      const fonct = D.cantines.filter(c => c.fonctionnelle);
      const nourris = new Set(D.repas.filter(p => p.a_mange).map(p => p.inscription_id));
      const ecoleDe = p => (D.insId[p.inscription_id] || {}).ecole_id;
      return {
        kpis: [['Cantines fonctionnelles', fonct.length, 'sur ' + D.ecoles.length + ' écoles'], ['Élèves nourris', nourris.size, ''], ['Repas servis', D.repas.filter(p => p.a_mange).length, ''], ['Contributions réglées', fpc(pc(D.repas.filter(p => p.paye).length, D.repas.filter(p => num(p.montant) > 0).length)), '']],
        graphes: [{ titre: 'Repas servis par mois', labels: MOIS.slice(0, 10).map(m => m[1]), series: [{ nom: 'Repas', color: C.o, values: MOIS.slice(0, 10).map(m => D.repas.filter(p => p.a_mange && moisDe(p.date_repas) === m[0]).length) }] }],
        tableaux: [{ titre: 'Cantines par ' + libGroupe(D).toLowerCase(), entetes: [libGroupe(D), 'Cantines fonctionnelles', 'Élèves nourris', 'Repas'],
          lignes: lignesGroupes(D, ec => { const ids = ec.map(e => e.id); const r = D.repas.filter(p => p.a_mange && ids.indexOf(ecoleDe(p)) >= 0); return [fonct.filter(c => ids.indexOf(c.ecole_id) >= 0).length, new Set(r.map(p => p.inscription_id)).size, r.length]; }) }]
      };
    }
  };

  function sum(l, f) { return l.reduce((a, x) => a + f(x), 0); }
  function coursPresents(D) {
    const c = {}; D.ecoles.forEach(e => Object.keys(D.eff[e.id].cours).forEach(k => { c[k] = true; }));
    const ordre = (EG.NIVEAUX_MAT || []).concat(['PETITS', 'GRANDS'], EG.NIVEAUX_PRIM);
    const l = Object.keys(c).sort((a, b) => (ordre.indexOf(a) < 0 ? 99 : ordre.indexOf(a)) - (ordre.indexOf(b) < 0 ? 99 : ordre.indexOf(b)));
    return l.length ? l : EG.NIVEAUX_PRIM.slice();
  }
  function somCours(D, c, k) { return D.ecoles.reduce((a, e) => a + ((D.eff[e.id].cours[c] || [0, 0])[k] || 0), 0); }
  function ecolesDuGroupe(D, g) { return D.ecoles.filter(e => D.groupeDe(e) === g); }
  function lignesGroupesBrut(D, f) { return D.groupes.map(g => f(ecolesDuGroupe(D, g))); }
  function lignesGroupes(D, f) {
    const l = D.groupes.map(g => [g].concat(f(ecolesDuGroupe(D, g))));
    if (l.length > 1) {
      const tot = ['TOTAL'].concat(f(D.ecoles));
      l.push(tot);
    }
    return l;
  }

  function statsDivision(code, D) {
    const mods = MODULE[code] || ['synthese'];
    const out = { kpis: [], graphes: [], tableaux: [] };
    mods.forEach(m => { const r = STATS[m](D); out.kpis = out.kpis.concat(r.kpis); out.graphes = out.graphes.concat(r.graphes); out.tableaux = out.tableaux.concat(r.tableaux); });
    return out;
  }

  /* =======================================================================
     Chef de division et plan d'action
     ======================================================================= */

  function puces(texte) {
    return String(texte || '').split('\n').map(l => l.trim()).filter(l => /^[-•–]\s*/.test(l))
      .map(l => l.replace(/^[-•–]\s*/, '').replace(/\s*[;.]\s*$/, '')).filter(Boolean)
      .map(l => l.charAt(0).toUpperCase() + l.slice(1));
  }
  const tauxEffectif = l => l.etat === 'REALISEE' ? 100 : num(l.taux);
  function tauxDe(lignes) { return lignes.length ? Math.round(lignes.reduce((a, l) => a + tauxEffectif(l), 0) / lignes.length) : null; }

  function chefEtLignes(t, div) {
    return Promise.all([DB.where('divisions_structure', { territoire_id: t.id, division_code: div.code }), DB.where('lignes_action', { territoire_id: t.id, division_code: div.code, annee_code: EG.session.annee_code }),
      DB.meta('lignes-gen|' + t.id + '|' + div.code + '|' + EG.session.annee_code)]).then(([chefs, lignes, gen]) => {
      const chef = chefs[0] || null;
      if (lignes.length || gen || !EG.peutEcrire()) return { chef, lignes };
      /* Premier affichage pour l'année : les lignes d'action sont tirées des attributions. */
      const libs = puces((chef && chef.attributions) || div.attributions);
      return Promise.all(libs.map(l => DB.put('lignes_action', { territoire_id: t.id, division_code: div.code, annee_code: EG.session.annee_code, libelle: l, etat: 'PREVUE', taux: 0, responsable: (chef && chef.chef_nom) || '' }, { silencieux: true })))
        .then(cree => DB.setMeta('lignes-gen|' + t.id + '|' + div.code + '|' + EG.session.annee_code, true).then(() => ({ chef, lignes: cree })));
    });
  }
  function tousLesTaux(t) {
    return DB.where('lignes_action', { territoire_id: t.id, annee_code: EG.session.annee_code }).then(l => {
      const o = {}; divisionsDe(t).forEach(d => { o[d.code] = tauxDe(l.filter(x => x.division_code === d.code)); });
      o._total = tauxDe(l); return o;
    });
  }

  /* =======================================================================
     Rendu commun
     ======================================================================= */

  function kpisEl(kpis) {
    return el('div', { class: 'grille-stats', style: 'display:grid;gap:10px;margin:8px 0' }, kpis.map(([l, v, d]) => el('div', { class: 'stat' }, [
      el('div', { class: 'stat-valeur', text: typeof v === 'number' ? U.nombre(v) : String(v) }), el('div', { class: 'stat-etiquette', text: l }), d ? el('div', { class: 'muet petit', text: d }) : null])));
  }
  function grapheEl(g) { const d = el('div', { class: 'carte', style: 'overflow-x:auto' }); d.innerHTML = G() ? G().graphique(g) : ''; return d; }
  function tableauHtml(tb) {
    return '<h3>' + ech(tb.titre) + '</h3><table><thead><tr>' + tb.entetes.map(h => '<th>' + ech(h) + '</th>').join('') + '</tr></thead><tbody>'
      + tb.lignes.map(l => '<tr' + (l[0] === 'TOTAL' ? ' style="font-weight:700;background:#F1F5F2"' : '') + '>' + l.map((v, i) => '<td' + (i ? ' style="text-align:right"' : '') + '>' + ech(typeof v === 'number' ? U.nombre(v) : v) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table>';
  }
  function tableauEl(tb) { const d = el('div', { class: 'tableau-enveloppe' }); d.innerHTML = tableauHtml(tb).replace('<table>', '<table class="tableau">'); return U.carte(null, d); }

  function enteteStructure(racine, ctx, choisi, aller) {
    const l = sujets(ctx);
    if (l.length > 1) racine.appendChild(el('div', { class: 'barre-filtres' }, U.selecteur('Structure', l.map(t => ({ value: t.id, label: (t.type === 'DEPARTEMENT' ? 'DDEMP — ' : 'CS — ') + t.nom })), choisi, aller, { vide: false })));
    return l;
  }

  /* =======================================================================
     Écran : toutes les divisions d'une structure
     ======================================================================= */

  Routeur.definir('divisions', function (racine, args) {
    if (ROLES.indexOf(EG.session.user.role) < 0 || EG.session.ecole_id) { racine.appendChild(U.vide('Les divisions et services concernent les circonscriptions scolaires et les directions départementales.')); return; }
    E.contexteCS().then(ctx => {
      const l = sujets(ctx);
      if (!l.length) { racine.appendChild(U.vide('Aucune circonscription ni direction départementale dans votre périmètre.')); return; }
      const t = l.filter(x => x.id === (args && args[0]))[0] || l[0];
      racine.appendChild(E.entete('Divisions et services — ' + (t.type === 'DEPARTEMENT' ? 'DDEMP ' : 'CS ') + t.nom,
        'Chaque division avec ses attributions (AOF), son chef, ses statistiques et courbes, et son plan d’action — année ' + EG.session.annee_code + '.'));
      enteteStructure(racine, ctx, t.id, v => Routeur.aller('divisions/' + v));
      const zone = el('div'); racine.appendChild(zone);
      zone.appendChild(el('p', { class: 'muet', text: 'Calcul des statistiques…' }));
      Promise.all([charger(t, ctx), tousLesTaux(t), DB.where('divisions_structure', { territoire_id: t.id })]).then(([D, taux, chefs]) => {
        zone.textContent = '';
        const divs = divisionsDe(t);
        zone.appendChild(kpisEl(STATS.synthese(D).kpis.concat([['Réalisation du plan d’action', fpc(taux._total), 'moyenne de toutes les divisions']])));
        zone.appendChild(grapheEl({ titre: 'Taux de réalisation des plans d’action (%)', sousTitre: 'par division — année ' + EG.session.annee_code, labels: divs.map(d => d.sigle), series: [{ nom: 'Taux de réalisation', color: C.T, values: divs.map(d => taux[d.code] || 0) }] }));
        zone.appendChild(el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px' }, divs.map(d => {
          const ch = chefs.filter(c => c.division_code === d.code)[0], st = statsDivision(d.code, D);
          return el('button', { class: 'carte', type: 'button', style: 'text-align:left;cursor:pointer', onclick: () => Routeur.aller('division/' + t.id + '/' + d.code) }, [
            el('div', { class: 'ligne-entre' }, [el('strong', { text: d.sigle + ' — ' + d.nom }), el('span', { class: 'badge info', text: fpc(taux[d.code]) })]),
            el('p', { class: 'muet petit', text: 'Chef : ' + ((ch && ch.chef_nom) || '— à renseigner') + (d.article ? ' · ' + d.article : '') }),
            el('ul', { class: 'petit', style: 'margin:4px 0 0 16px;padding:0' }, st.kpis.slice(0, 3).map(([lib, v, det]) => el('li', { text: lib + ' : ' + (typeof v === 'number' ? U.nombre(v) : v) + (det ? ' — ' + det : '') })))
          ]);
        })));
        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-fantome', text: '\uE029 Signatures des acteurs', onclick: () => Routeur.aller('signatures') }),
          el('button', { class: 'btn btn-fantome', text: '⇩ Excel (toutes les divisions)', onclick: () => {
            const feuilles = divs.map(d => { const st = statsDivision(d.code, D); const lignes = [[d.sigle + ' — ' + d.nom], []]; st.kpis.forEach(k => lignes.push([k[0], k[1], k[2] || ''])); st.tableaux.forEach(tb => { lignes.push([], [tb.titre], tb.entetes); tb.lignes.forEach(x => lignes.push(x)); }); return { nom: d.sigle, lignes }; });
            S().excel('divisions-' + S().slug(t.nom) + '-' + EG.session.annee_code, feuilles);
          } })
        ]));
      });
    });
  });

  /* =======================================================================
     Écran : une division
     ======================================================================= */

  Routeur.definir('division', function (racine, args) {
    if (ROLES.indexOf(EG.session.user.role) < 0 || EG.session.ecole_id) { racine.appendChild(U.vide('Les divisions et services concernent les circonscriptions scolaires et les directions départementales.')); return; }
    const raf = () => Routeur.aller('division/' + args[0] + '/' + args[1]);
    E.contexteCS().then(ctx => {
      const t = sujets(ctx).filter(x => x.id === args[0])[0];
      if (!t) { racine.appendChild(U.vide('Cette structure n’est pas dans votre périmètre.')); return; }
      const div = divisionsDe(t).filter(d => d.code === args[1])[0];
      if (!div) { racine.appendChild(U.vide('Division inconnue.')); return; }
      Promise.all([charger(t, ctx), chefEtLignes(t, div)]).then(([D, cl]) => {
        const chef = cl.chef, lignes = cl.lignes.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
        const st = statsDivision(div.code, D), attributions = (chef && chef.attributions) || div.attributions;
        const taux = tauxDe(lignes);
        racine.appendChild(E.entete(div.sigle + ' — ' + div.nom, (t.type === 'DEPARTEMENT' ? 'Direction départementale ' : 'Circonscription scolaire de ') + t.nom + ' · année ' + EG.session.annee_code, [
          el('button', { class: 'btn btn-fantome', text: '← Divisions', onclick: () => Routeur.aller('divisions/' + t.id) }),
          el('button', { class: 'btn btn-primaire', text: '\uE008 Imprimer / PDF', onclick: () => imprimer(t, div, chef, st, lignes, attributions, ctx.index) }),
          el('button', { class: 'btn btn-fantome', text: '⇩ Excel', onclick: () => excel(t, div, st, lignes) })
        ]));
        /* Rubrique */
        const chefP = chef || { territoire_id: t.id, division_code: div.code, sigle: div.sigle, chef_titre: div.signataire };
        racine.appendChild(U.carte('Rubrique de la division', el('div', {}, [
          el('p', {}, [el('strong', { text: 'Chef : ' }), document.createTextNode(((chef && chef.chef_nom) || '— à renseigner') + ' · ' + ((chef && chef.chef_titre) || div.signataire))]),
          div.parent ? el('p', { class: 'muet petit', text: 'Rattachée à : ' + ((divisionsDe(t).filter(x => x.code === div.parent)[0] || {}).nom || div.parent) + (div.article ? ' · ' + div.article : '') }) : null,
          el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0' }, [
            chef && chef.signature_image ? el('img', { src: chef.signature_image, alt: 'Signature du chef', style: 'height:40px;background:#fff;border:1px solid #DDE3DF;border-radius:4px' }) : el('span', { class: 'badge attention', text: 'signature à recueillir' }),
            EG.peutEcrire() ? el('button', { class: 'btn btn-fantome', text: '\uE006 Chef et attributions', onclick: () => E.editer('divisions_structure', Object.assign({ attributions: div.attributions, article_aof: div.article }, chefP), raf) }) : null,
            EG.peutEcrire() ? el('button', { class: 'btn btn-fantome', text: '\uE029 Signature du chef', onclick: () => {
              const enreg = chef ? Promise.resolve(chef) : DB.put('divisions_structure', Object.assign({ chef_titre: div.signataire }, chefP));
              enreg.then(rec => EG.Docs.capturerSignature(rec, raf, { table: 'divisions_structure', titre: 'Signature — ' + div.sigle, mention: 'Le chef de la division signe ici. Sa signature figure sur le plan d’action et le rapport de la division.' }));
            } }) : null
          ]),
          el('details', {}, [el('summary', { text: 'Attributions (AOF)' }), el('div', { style: 'white-space:pre-line;font-size:.92em', text: attributions })]),
          div.note ? el('p', { class: 'muet petit', style: 'white-space:pre-line', text: div.note }) : null
        ])));
        /* Statistiques et courbes */
        racine.appendChild(kpisEl(st.kpis.concat([['Plan d’action', fpc(taux), lignes.length + ' ligne(s) d’action']])));
        st.graphes.forEach(g => racine.appendChild(grapheEl(Object.assign({ sousTitre: (t.type === 'DEPARTEMENT' ? 'DDEMP ' : 'CS ') + t.nom + ' — ' + EG.session.annee_code }, g))));
        st.tableaux.forEach(tb => racine.appendChild(tableauEl(tb)));
        /* Plan d'action */
        const zonePlan = el('div');
        racine.appendChild(U.carte('Plan d’action — lignes d’action de la division', zonePlan));
        const ETATS = ['PREVUE', 'EN_COURS', 'REALISEE', 'REPORTEE'];
        zonePlan.appendChild(U.tableau([
          { titre: 'Ligne d’action', valeur: l => l.libelle },
          { titre: 'Échéance', valeur: l => l.echeance ? U.dateCourte(l.echeance) : '—' },
          { titre: 'État', valeur: l => EG.peutEcrire() ? el('select', { 'aria-label': 'État', onchange: e => DB.put('lignes_action', Object.assign({}, l, { etat: e.target.value, taux: e.target.value === 'REALISEE' ? 100 : l.taux })).then(raf) },
            ETATS.map(k => el('option', { value: k, text: U.libelle(k), selected: (l.etat || 'PREVUE') === k }))) : U.libelle(l.etat) },
          { titre: 'Taux (%)', valeur: l => EG.peutEcrire() ? el('input', { type: 'number', min: '0', max: '100', value: String(tauxEffectif(l)), style: 'width:70px', 'aria-label': 'Taux de réalisation',
            onchange: e => DB.put('lignes_action', Object.assign({}, l, { taux: Math.max(0, Math.min(100, +e.target.value || 0)) })).then(raf) }) : String(tauxEffectif(l)) },
          { titre: '', valeur: l => EG.peutEcrire() ? el('button', { class: 'btn btn-fantome', text: '\uE006', 'aria-label': 'Modifier', onclick: () => E.editer('lignes_action', l, raf) }) : '' }
        ], lignes, { messageVide: 'Aucune ligne d’action pour cette année.' }));
        if (EG.peutEcrire()) zonePlan.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-fantome', text: '＋ Ligne d’action', onclick: () => E.editer('lignes_action', { territoire_id: t.id, division_code: div.code, annee_code: EG.session.annee_code, etat: 'PREVUE', taux: 0 }, raf) }),
          el('button', { class: 'btn btn-fantome', text: '↻ Ajouter les attributions manquantes', onclick: () => {
            const ont = lignes.map(l => U.sansAccent(l.libelle));
            const manq = puces(attributions).filter(l => ont.indexOf(U.sansAccent(l)) < 0);
            Promise.all(manq.map(l => DB.put('lignes_action', { territoire_id: t.id, division_code: div.code, annee_code: EG.session.annee_code, libelle: l, etat: 'PREVUE', taux: 0 }))).then(() => { U.toast(manq.length + ' ligne(s) ajoutée(s)'); raf(); });
          } })
        ]));
      });
    });
  });

  /* =======================================================================
     Sorties : impression (PDF) et Excel
     ======================================================================= */

  function imprimer(t, div, chef, st, lignes, attributions, index) {
    const dep = t.type === 'DEPARTEMENT' ? t : EG.Perimetre.ancetre(index || {}, t.id, 'DEPARTEMENT');
    const pseudo = { nom: '', territoire_id: t.type === 'CIRCONSCRIPTION' ? t.id : null, departement_id: t.type === 'DEPARTEMENT' ? t.id : (dep ? dep.id : t.parent_id) };
    const graph = g => G() ? G().svgType('barres', Object.assign({ sousTitre: EG.session.annee_code }, g)) : '';
    const corps = () => '<h2 style="text-align:center">' + ech(div.sigle + ' — ' + div.nom) + '</h2>'
      + '<p style="text-align:center">' + ech((t.type === 'DEPARTEMENT' ? 'Direction départementale ' : 'Circonscription scolaire de ') + t.nom) + ' — année scolaire ' + ech(EG.session.annee_code) + '</p>'
      + '<h3>Attributions</h3><p style="white-space:pre-line;font-size:9.5px">' + ech(attributions) + '</p>'
      + '<h3>Indicateurs</h3><table><tbody>' + st.kpis.map(k => '<tr><td>' + ech(k[0]) + '</td><th style="text-align:right">' + ech(typeof k[1] === 'number' ? U.nombre(k[1]) : k[1]) + '</th><td>' + ech(k[2] || '') + '</td></tr>').join('') + '</tbody></table>'
      + st.graphes.map(g => '<div style="page-break-inside:avoid;margin:6px auto;max-width:165mm">' + graph(g) + '</div>').join('')
      + st.tableaux.map(tableauHtml).join('')
      + '<h3>Plan d’action — taux de réalisation : ' + ech(fpc(tauxDe(lignes))) + '</h3><table><thead><tr><th>Ligne d’action</th><th>Échéance</th><th>État</th><th>Taux</th><th>Observations</th></tr></thead><tbody>'
      + lignes.map(l => '<tr><td>' + ech(l.libelle) + '</td><td>' + ech(l.echeance ? U.dateCourte(l.echeance) : '') + '</td><td>' + ech(U.libelle(l.etat || 'PREVUE')) + '</td><td style="text-align:right">' + tauxEffectif(l) + ' %</td><td>' + ech(l.observations || '') + '</td></tr>').join('') + '</tbody></table>'
      + '<p class="fait-a">Fait à ' + ech(t.ville || '……………………') + ', le ' + ech(U.dateCourte(new Date().toISOString())) + '</p>'
      + '<div class="bloc-signature">' + EG.Docs.caseSignature({ nom: (chef && chef.chef_nom) || '', signature_image: (chef && chef.signature_image) || '' }, (chef && chef.chef_titre) || div.signataire)
      + '<div class="cachet-case">' + EG.Docs.cachetTerritoireComplet(t) + '</div></div>';
    /* Pièce scellée : numéro, empreinte et code QR de vérification sous la signature et le cachet. */
    const scelle = () => { const h = corps(); return EG.DocsSco ? EG.DocsSco.sceller('DIVISION_STATS', div.sigle + ' — ' + t.nom, h).then(b => h + b) : h; };
    S().imprimer(div.sigle + ' — ' + t.nom, scelle, { ecole: pseudo });
  }

  function excel(t, div, st, lignes) {
    const f1 = [[div.sigle + ' — ' + div.nom + ' — ' + t.nom + ' — ' + EG.session.annee_code], []];
    st.kpis.forEach(k => f1.push([k[0], k[1], k[2] || '']));
    const feuilles = [{ nom: 'Indicateurs', lignes: f1 }];
    st.tableaux.forEach((tb, i) => feuilles.push({ nom: ('T' + (i + 1) + ' ' + tb.titre).slice(0, 30), lignes: [tb.entetes].concat(tb.lignes) }));
    feuilles.push({ nom: 'Plan d’action', lignes: [['Ligne d’action', 'Indicateur', 'Cible', 'Échéance', 'Responsable', 'État', 'Taux (%)', 'Observations']]
      .concat(lignes.map(l => [l.libelle, l.indicateur || '', l.cible || '', l.echeance || '', l.responsable || '', U.libelle(l.etat || 'PREVUE'), tauxEffectif(l), l.observations || ''])) });
    S().excel(div.sigle + '-' + S().slug(t.nom) + '-' + EG.session.annee_code, feuilles);
  }

  EG.Divisions = { charger, statsDivision, STATS, divisionsDe, puces };
})(window);
