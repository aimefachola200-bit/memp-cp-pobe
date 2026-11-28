/* ÉduGestion Pro Master — effectifs et personnel par école (statistiques de la circonscription).

   Reproduit le tableau que chaque circonscription remet à sa direction départementale :
   pour chaque école, ses classes autorisées, son personnel (FE, ACDPE, ACDPCTD) et ses élèves par cours
   et par sexe. Les écoles sont regroupées par arrondissement, avec les sous-totaux et le total de la
   circonscription ; primaires et maternelles ont chacune leur tableau.

   Adresse : stats-cs/<circonscription>. Un compte de circonscription ne voit que la sienne ; un
   directeur ne voit et ne corrige que son école. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const S = () => EG.Sortie;
  const sa = U.sansAccent;
  const ech = s => EG.Docs.echapper(s);
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  const num = v => (typeof v === 'number' && !isNaN(v)) ? v : 0;
  const ROLES_SAISIE = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'DIRECTEUR'];
  const peutSaisir = () => ROLES_SAISIE.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();
  const COURS_PRIM = EG.NIVEAUX_PRIM, COURS_MAT = ['PETITS', 'GRANDS'];
  const NOM_COURS = { PETITS: 'Petits', GRANDS: 'Grands' };
  const nomCours = c => NOM_COURS[c] || c;

  /** Total garçons/filles/tous d'une statistique, calculé depuis les cours quand ils sont là. */
  function totaux(st) {
    if (!st) return { g: 0, f: 0, t: 0, pers: 0 };
    let g = num(st.total_garcons), f = num(st.total_filles);
    if (st.effectifs && (!g && !f)) Object.keys(st.effectifs).forEach(c => { g += num(st.effectifs[c][0]); f += num(st.effectifs[c][1]); });
    return { g, f, t: g + f, pers: num(st.personnel_fe) + num(st.personnel_acdpe) + num(st.personnel_ame) };
  }

  const cycleGroupe = e => e.cycle === 'MATERNELLE' ? 'M' : 'P';

  /* =======================================================================
     Calcul du tableau (partagé par l'écran, l'export et l'impression)
     ======================================================================= */

  /**
   * Lignes d'une circonscription pour une année : { ecole, stat, arrondissement }.
   * Les écoles sans statistique pour l'année restent listées (cases vides).
   */
  function lignesDe(ecoles, stats, annee, filtres) {
    const parEcole = {};
    stats.forEach(s => { if (s.annee_code === annee) parEcole[s.ecole_id] = s; });
    return ecoles.filter(e => e.actif !== false
      && (!filtres.statut || (e.statut || 'PUBLIQUE') === filtres.statut))
      .map(e => ({ ecole: e, stat: parEcole[e.id] || null, arrondissement: e.arrondissement || 'Sans arrondissement' }))
      .sort((a, b) => a.arrondissement.localeCompare(b.arrondissement, 'fr') || String(a.ecole.nom).localeCompare(String(b.ecole.nom), 'fr', { numeric: true }));
  }

  /** Regroupe par arrondissement, avec sous-totaux. */
  function grouper(lignes, cours) {
    const groupes = [], par = {};
    lignes.forEach(l => {
      if (!par[l.arrondissement]) { par[l.arrondissement] = { nom: l.arrondissement, lignes: [] }; groupes.push(par[l.arrondissement]); }
      par[l.arrondissement].lignes.push(l);
    });
    groupes.forEach(g => { g.somme = somme(g.lignes, cours); });
    return { groupes, somme: somme(lignes, cours) };
  }

  function somme(lignes, cours) {
    const s = { ecoles: lignes.length, avecStats: 0, classes: 0, fe: 0, acdpe: 0, ame: 0, g: 0, f: 0, cours: {} };
    cours.forEach(c => { s.cours[c] = [0, 0]; });
    lignes.forEach(({ stat }) => {
      if (!stat) return;
      s.avecStats++;
      s.classes += num(stat.classes_autorisees); s.fe += num(stat.personnel_fe); s.acdpe += num(stat.personnel_acdpe); s.ame += num(stat.personnel_ame);
      const t = totaux(stat); s.g += t.g; s.f += t.f;
      cours.forEach(c => { const v = stat.effectifs && stat.effectifs[c]; if (v) { s.cours[c][0] += num(v[0]); s.cours[c][1] += num(v[1]); } });
    });
    return s;
  }

  const persTotal = s => s.fe + s.acdpe + s.ame;

  /* =======================================================================
     Lignes d'export (Excel) et corps imprimable
     ======================================================================= */

  function entetesExcel(cours) {
    const h = ['Arrondissement', 'École', 'Statut', 'Année de création', 'Classes autorisées', 'FE', 'ACDPE', 'ACDPCTD', 'Total personnel'];
    cours.forEach(c => { h.push(nomCours(c) + ' G', nomCours(c) + ' F', nomCours(c) + ' T'); });
    return h.concat(['Total G', 'Total F', 'Total T']);
  }
  const vide = v => (v === null || v === undefined) ? '' : v;
  function ligneExcel(l, cours) {
    const st = l.stat, t = totaux(st);
    const r = [l.arrondissement, l.ecole.nom, U.libelle(l.ecole.statut || 'PUBLIQUE'), vide(l.ecole.annee_creation), st ? vide(st.classes_autorisees) : vide(l.ecole.classes_autorisees),
      st ? vide(st.personnel_fe) : '', st ? vide(st.personnel_acdpe) : '', st ? vide(st.personnel_ame) : '', st && st.personnel_fe !== null && st.personnel_fe !== undefined ? t.pers : ''];
    cours.forEach(c => { const v = st && st.effectifs && st.effectifs[c]; r.push(v ? num(v[0]) : '', v ? num(v[1]) : '', v ? num(v[0]) + num(v[1]) : ''); });
    return r.concat(st && st.effectifs ? [t.g, t.f, t.t] : ['', '', '']);
  }
  function sommeExcel(libelle, s, cours) {
    const r = ['', libelle, '', '', s.classes, s.fe, s.acdpe, s.ame, persTotal(s)];
    cours.forEach(c => r.push(s.cours[c][0], s.cours[c][1], s.cours[c][0] + s.cours[c][1]));
    return r.concat([s.g, s.f, s.g + s.f]);
  }
  function feuilleExcel(nom, lignes, cours, libelleTotal) {
    const { groupes, somme: tot } = grouper(lignes, cours);
    const rows = [entetesExcel(cours)];
    groupes.forEach(g => { g.lignes.forEach(l => rows.push(ligneExcel(l, cours))); rows.push(sommeExcel('Sous-total ' + g.nom, g.somme, cours)); });
    rows.push(sommeExcel(libelleTotal, tot, cours));
    return { nom, lignes: rows };
  }

  function tableHtml(lignes, cours, titre) {
    const { groupes, somme: tot } = grouper(lignes, cours);
    const th = t => '<th>' + ech(t) + '</th>';
    const td = v => '<td style="text-align:right">' + (v === '' || v === null || v === undefined ? '' : U.nombre(v)) + '</td>';
    const ligne = (nom, s, gras, l) => '<tr' + (gras ? ' style="font-weight:700;background:#F1F5F2"' : '') + '><td>' + ech(nom) + '</td>'
      + (l ? '<td>' + (l.ecole.annee_creation || '') + '</td>' : '<td></td>')
      + td(s.classes) + td(s.fe) + td(s.acdpe) + td(s.ame) + td(persTotal(s))
      + cours.map(c => td(s.cours[c][0] + s.cours[c][1])).join('') + td(s.g) + td(s.f) + td(s.g + s.f) + '</tr>';
    let corps = '';
    groupes.forEach(g => {
      corps += '<tr><th colspan="' + (11 + cours.length) + '" style="background:#E6F5EE;text-align:left">' + ech(g.nom) + '</th></tr>';
      g.lignes.forEach(l => { corps += ligne(l.ecole.nom, l.stat ? somme([l], cours) : { classes: 0, fe: 0, acdpe: 0, ame: 0, g: 0, f: 0, cours: Object.fromEntries(cours.map(c => [c, [0, 0]])) }, false, l); });
      corps += ligne('Sous-total ' + g.nom, g.somme, true);
    });
    corps += ligne('TOTAL', tot, true);
    return '<h3>' + ech(titre) + '</h3><table><thead><tr>' + ['École', 'Créée', 'Classes aut.', 'FE', 'ACDPE', 'ACDPCTD', 'Personnel'].map(th).join('')
      + cours.map(c => th(nomCours(c))).join('') + th('G') + th('F') + th('Total') + '</tr></thead><tbody>' + corps + '</tbody></table>';
  }

  /* =======================================================================
     Écran
     ======================================================================= */

  Routeur.definir('stats-cs', function (racine, args, params) {
    if (!EG.peutVoirModule('stats-cs')) { racine.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.')); return; }
    racine.appendChild(E.entete('Effectifs et personnel par école',
      'Classes autorisées, personnel FE / ACDPE / ACDPCTD et élèves par cours et par sexe, école par école, avec les totaux de chaque arrondissement et de la circonscription.'));
    const zoneCs = el('div'), zoneFiltres = el('div'), zoneCorps = el('div');
    racine.appendChild(zoneCs); racine.appendChild(zoneFiltres); racine.appendChild(zoneCorps);
    const etat = { dep: '', cs: (args && args[0]) || (params && params.cs) || '', annee: '', statut: '' };
    let C = null;

    function charger() {
      return Promise.all([E.contexteCS(), E.charger('statistiques_ecoles')]).then(([ctx, stats]) => { C = ctx; C.stats = stats; dessiner(); });
    }

    function dessiner() {
      E.barreCS(zoneCs, etat, C, () => { etat.annee = ''; dessinerFiltres(); }, { libelleVide: '— Choisir une circonscription —' });
      dessinerFiltres();
    }

    function ecolesDeCs() {
      return C.ecolesPerimetre.filter(e => e.territoire_id === etat.cs);
    }

    function dessinerFiltres() {
      zoneFiltres.textContent = ''; zoneCorps.textContent = '';
      if (!C.csList.length) return;
      if (!etat.cs) { zoneCorps.appendChild(U.vide('Choisissez une circonscription pour afficher ses statistiques.')); return; }
      const ecoles = ecolesDeCs();
      const ids = {}; ecoles.forEach(e => { ids[e.id] = true; });
      const annees = Array.from(new Set(C.stats.filter(s => ids[s.ecole_id]).map(s => s.annee_code))).sort().reverse();
      if (!etat.annee || (annees.length && annees.indexOf(etat.annee) < 0)) etat.annee = annees[0] || '';
      if (!ecoles.length) {
        zoneCorps.appendChild(U.vide('Cette circonscription n’a pas encore d’école. Installez son jeu de données ou importez ses écoles.'));
        zoneCorps.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-primaire', text: '\uE011 Jeux de données', onclick: () => Routeur.aller('import-export/jeux') }),
          el('button', { class: 'btn btn-fantome', text: '\uE00B Importer les écoles', onclick: () => Routeur.aller('import-ecoles?cs=' + etat.cs) })
        ]));
        return;
      }
      const barre = el('div', { class: 'barre-filtres' });
      barre.appendChild(U.selecteur('Année scolaire', annees.map(a => ({ value: a, label: a })), etat.annee, v => { etat.annee = v; corps(); }, { libelleVide: annees.length ? undefined : 'Aucune statistique', vide: false }));
      barre.appendChild(U.selecteur('Statut', [{ value: 'PUBLIQUE', label: 'Écoles publiques' }, { value: 'PRIVEE', label: 'Écoles privées' }], etat.statut, v => { etat.statut = v; corps(); }, { libelleVide: 'Publiques et privées' }));
      zoneFiltres.appendChild(barre);
      corps();
    }

    function corps() {
      zoneCorps.textContent = '';
      const cs = C.index[etat.cs];
      const ecoles = ecolesDeCs();
      if (!etat.annee) {
        zoneCorps.appendChild(U.vide('Aucune statistique enregistrée pour cette circonscription.'));
        if (peutSaisir()) zoneCorps.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-primaire', text: '\uE011 Installer le jeu de données', onclick: () => Routeur.aller('import-export/jeux') }),
          el('button', { class: 'btn btn-fantome', text: 'Saisir l’année ' + (EG.session.annee_code || ''), onclick: () => { etat.annee = EG.session.annee_code || ''; corps(); } })
        ]));
        if (!etat.annee) return;
      }
      const filtres = { statut: etat.statut };
      const toutes = lignesDe(ecoles, C.stats, etat.annee, filtres);
      const prim = toutes.filter(l => cycleGroupe(l.ecole) === 'P');
      const mat = toutes.filter(l => cycleGroupe(l.ecole) === 'M');
      const sPrim = somme(prim, COURS_PRIM), sMat = somme(mat, COURS_MAT);
      const g = sPrim.g + sMat.g, f = sPrim.f + sMat.f, pers = persTotal(sPrim) + persTotal(sMat);
      const avec = sPrim.avecStats + sMat.avecStats;

      zoneCorps.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(toutes.length), 'Écoles', ''),
        U.stat(U.nombre(g + f), 'Élèves (' + avec + ' école(s) renseignée(s))', 'ok'),
        U.stat(g + f ? Math.round(f / (g + f) * 100) + ' %' : '—', 'Filles', ''),
        U.stat(U.nombre(pers), 'Personnel FE / ACDPE / ACDPCTD', ''),
        U.stat(U.nombre(sPrim.classes + sMat.classes), 'Classes autorisées', ''),
        U.stat(pers && sPrim.avecStats ? (Math.round((sPrim.g + sPrim.f) / Math.max(1, persTotal(sPrim)) * 10) / 10).toString().replace('.', ',') : '—', 'Élèves par agent (primaire)', '')
      ]));

      zoneCorps.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => exporter(cs, prim, mat) }),
        el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer', onclick: () => sortie(cs, prim, mat, 'imprimer') }),
        el('button', { class: 'btn btn-fantome', text: '\uE00D Word', onclick: () => sortie(cs, prim, mat, 'word') }),
        el('button', { class: 'btn btn-fantome', text: '\uE011 Jeux de données', onclick: () => Routeur.aller('import-export/jeux') })
      ]));

      if (prim.length) zoneCorps.appendChild(U.carte('Écoles primaires', tableau(prim, COURS_PRIM)));
      if (mat.length) zoneCorps.appendChild(U.carte('Écoles maternelles', tableau(mat, COURS_MAT)));
      if (!toutes.length) zoneCorps.appendChild(U.vide('Aucune école ne correspond à ces filtres.'));
      const sans = toutes.filter(l => !l.stat).length;
      if (sans) zoneCorps.appendChild(el('p', { class: 'muet petit', text: sans + ' école(s) sans statistique pour ' + etat.annee + ' : cliquez sur \uE006 pour saisir leurs effectifs.' }));
    }

    /* ---------- tableau à l'écran ---------- */

    function tableau(lignes, cours) {
      const { groupes, somme: tot } = grouper(lignes, cours);
      const table = el('table', { class: 'tableau tableau-stats' });
      const tete = ['École', 'Créée', 'Classes', 'FE', 'ACDPE', 'ACDPCTD', 'Pers.'].concat(cours.map(nomCours), ['G', 'F', 'Total', '']);
      table.appendChild(el('thead', {}, el('tr', {}, tete.map(t => el('th', { text: t })))));
      const tb = el('tbody');
      const cel = (v, cl) => el('td', { class: 'num ' + (cl || ''), text: v === '' || v === null || v === undefined ? '' : U.nombre(v) });
      const ligneSomme = (nom, s, cl) => el('tr', { class: cl }, [el('th', { text: nom, colspan: 2 }), cel(s.classes), cel(s.fe), cel(s.acdpe), cel(s.ame), cel(persTotal(s))]
        .concat(cours.map(c => cel(s.cours[c][0] + s.cours[c][1])), [cel(s.g), cel(s.f), cel(s.g + s.f), el('td')]));
      groupes.forEach(g => {
        tb.appendChild(el('tr', { class: 'rang-groupe' }, el('th', { colspan: tete.length, text: g.nom + ' — ' + pl(g.lignes.length, 'école') })));
        g.lignes.forEach(l => {
          const st = l.stat, t = totaux(st);
          const a = el('tr', { class: st ? '' : 'sans-stat' }, [
            el('td', { text: l.ecole.nom }), cel(l.ecole.annee_creation), cel(st ? st.classes_autorisees : ''),
            cel(st && st.personnel_fe !== null ? st.personnel_fe : ''), cel(st && st.personnel_acdpe !== null ? st.personnel_acdpe : ''), cel(st && st.personnel_ame !== null ? st.personnel_ame : ''),
            cel(st && st.personnel_fe !== null && st.personnel_fe !== undefined ? t.pers : '')]
            .concat(cours.map(c => { const v = st && st.effectifs && st.effectifs[c]; return cel(v ? num(v[0]) + num(v[1]) : ''); }),
              [cel(st && st.effectifs ? t.g : ''), cel(st && st.effectifs ? t.f : ''), cel(st && st.effectifs ? t.t : ''),
                el('td', {}, peutSaisir() ? el('button', { class: 'btn btn-petit btn-fantome', 'aria-label': 'Saisir ou corriger', text: '\uE006', onclick: () => saisir(l) }) : null)]));
          tb.appendChild(a);
        });
        tb.appendChild(ligneSomme('Sous-total ' + g.nom, g.somme, 'rang-somme'));
      });
      tb.appendChild(ligneSomme('TOTAL de la circonscription', tot, 'rang-total'));
      table.appendChild(tb);
      return el('div', { class: 'tableau-enveloppe' }, table);
    }

    /* ---------- saisie d'une école ---------- */

    function saisir(l) {
      const st = l.stat || {};
      const cours = cycleGroupe(l.ecole) === 'M' ? COURS_MAT : COURS_PRIM;
      const champs = {};
      const ch = (id, val, court) => { const c = el('input', { type: 'number', min: '0', class: court ? 'court' : '', value: val === null || val === undefined ? '' : val, 'aria-label': id }); champs[id] = c; return c; };
      const rangs = cours.map(c => {
        const v = st.effectifs && st.effectifs[c];
        return el('tr', {}, [el('th', { text: nomCours(c) }), el('td', {}, ch(c + '_g', v ? v[0] : '', true)), el('td', {}, ch(c + '_f', v ? v[1] : '', true))]);
      });
      const corps = el('div', {}, [
        el('p', { class: 'muet petit', text: l.ecole.nom + ' — année ' + etat.annee }),
        el('div', { class: 'formulaire' }, [
          el('div', { class: 'champ' }, [el('label', { text: 'Classes autorisées' }), ch('classes', st.classes_autorisees === undefined ? l.ecole.classes_autorisees : st.classes_autorisees, true)]),
          el('div', { class: 'champ' }, [el('label', { text: 'Personnel FE (fonctionnaires de l’État)' }), ch('fe', st.personnel_fe, true)]),
          el('div', { class: 'champ' }, [el('label', { text: 'Personnel ACDPE' }), ch('acdpe', st.personnel_acdpe, true)]),
          el('div', { class: 'champ' }, [el('label', { text: 'Personnel ACDPCTD' }), ch('ame', st.personnel_ame, true)])
        ]),
        el('table', { class: 'tableau' }, [el('thead', {}, el('tr', {}, ['Cours', 'Garçons', 'Filles'].map(t => el('th', { text: t })))), el('tbody', {}, rangs)])
      ]);
      U.modal('Effectifs et personnel', corps, fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
            const lire = id => { const v = champs[id].value; return v === '' ? null : Math.max(0, Math.round(Number(v))); };
            const effectifs = {}; let g = 0, f = 0, saisi = false;
            cours.forEach(c => {
              const a = lire(c + '_g'), b = lire(c + '_f');
              if (a !== null || b !== null) { saisi = true; effectifs[c] = [a || 0, b || 0]; g += a || 0; f += b || 0; }
            });
            const rec = Object.assign({}, l.stat || {}, {
              ecole_id: l.ecole.id, annee_code: etat.annee, classes_autorisees: lire('classes'),
              personnel_fe: lire('fe'), personnel_acdpe: lire('acdpe'), personnel_ame: lire('ame'),
              effectifs: saisi ? effectifs : null, total_garcons: saisi ? g : null, total_filles: saisi ? f : null,
              source: 'Saisie dans l’application'
            });
            fermer();
            DB.put('statistiques_ecoles', rec).then(() => DB.audit('STATISTIQUES_ECOLE', 'statistiques_ecoles', rec.id || null, { ecole: l.ecole.nom, annee: etat.annee }))
              .then(() => { U.toast('Statistiques enregistrées'); EG.majSynchro(); return charger(); });
          }
        })
      ]);
    }

    /* ---------- sorties ---------- */

    function exporter(cs, prim, mat) {
      const feuilles = [];
      if (prim.length) feuilles.push(feuilleExcel('Primaires', prim, COURS_PRIM, 'TOTAL ' + cs.nom));
      if (mat.length) feuilles.push(feuilleExcel('Maternelles', mat, COURS_MAT, 'TOTAL ' + cs.nom));
      if (!feuilles.length) { U.toast('Rien à exporter', 'attention'); return; }
      S().excel('statistiques-' + S().slug(cs.nom).slice(0, 30) + '-' + etat.annee, feuilles);
    }

    function corpsDocument(cs, prim, mat) {
      const visa = EG.Docs.visaTerritoire ? EG.Docs.visaTerritoire(cs, 'Le Chef de la circonscription scolaire') : '';
      return '<h2 style="text-align:center">Effectifs et personnel — ' + ech(cs.nom) + ' — année scolaire ' + ech(etat.annee) + '</h2>'
        + (prim.length ? tableHtml(prim, COURS_PRIM, 'Écoles primaires') : '') + (mat.length ? tableHtml(mat, COURS_MAT, 'Écoles maternelles') : '') + visa;
    }

    function sortie(cs, prim, mat, mode) {
      const dep = EG.Perimetre.ancetre(C.index, cs.id, 'DEPARTEMENT');
      const pseudo = { nom: '', territoire_id: cs.id, departement_id: dep ? dep.id : null };
      if (mode === 'imprimer') S().imprimer('Effectifs — ' + cs.nom, () => corpsDocument(cs, prim, mat), { ecole: pseudo, paysage: true });
      else S().word('statistiques-' + S().slug(cs.nom).slice(0, 30), 'Effectifs — ' + cs.nom, () => corpsDocument(cs, prim, mat), { ecole: pseudo });
    }

    charger();
  });

  EG.StatsEcoles = { totaux, lignesDe, somme };
})(window);
