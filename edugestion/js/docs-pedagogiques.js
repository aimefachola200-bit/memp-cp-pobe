/* ÉduGestion — Documents pédagogiques (PDF) : cahiers de l'apprenant, fichiers de résumés, d'exercices et d'évaluations,
   cahier d'écriture et cahiers de révision (4e-3e et Terminale). Classés par niveau et par matière ; ouverts ou
   téléchargés tels quels depuis le dossier docs-pedagogiques/ (disponibles hors connexion une fois ouverts). */
(function (global) {
  'use strict';
  const EG = global.EG, U = EG.UI, el = U.el;
  const BASE = 'docs-pedagogiques/';
  const FAM = { A: 'Cahier de l’apprenant', F: 'Fichier de résumés, d’exercices et d’évaluations', E: 'Cahier d’écriture', R: 'Fichier de révision (4e-3e, BEPC)', C: 'Fiches de révision (CEP)', P: 'Fiches de préparation (EPS)', T: 'Cahier de révision (Terminale)' };
  const NIV = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '4e', '3e', 'Tle A', 'Tle B'];
  const D = (f, titre, niveaux, matiere, fam, pages) => ({ fichier: f, titre, niveaux, matiere, famille: FAM[fam], pages });
  const DOCS = [
    D('ecriture_ci_cp.pdf', 'Mon cahier d’écriture — CI et CP', ['CI', 'CP'], 'Écriture', 'E', 60),
    D('apprenant_lecture_ci.pdf', 'Mon cahier d’activités de lecture — CI (IPAM 1)', ['CI'], 'Français (lecture)', 'A', 76),
    D('apprenant_francais_cm1.pdf', 'Mon cahier de réussite — Français CM1', ['CM1'], 'Français', 'A', 87),
    D('apprenant_maths_cm1.pdf', 'Mon cahier de réussite — Mathématiques CM1', ['CM1'], 'Mathématiques', 'A', 88),
    D('apprenant_civisme_cm1.pdf', 'Mon cahier de réussite — Éducation civique CM1', ['CM1'], 'ES (éducation sociale)', 'A', 45),
    D('apprenant_es_est_ce1.pdf', 'Mon cahier d’activités — ES et EST CE1', ['CE1'], 'ES / EST', 'A', 90),
    D('fichier_francais_ce1_cm2.pdf', 'Fichier de Français — CE1 au CM2', ['CE1', 'CE2', 'CM1', 'CM2'], 'Français', 'F', 27),
    D('fichier_maths_ce1_cm2.pdf', 'Fichier de Mathématiques — CE1 au CM2', ['CE1', 'CE2', 'CM1', 'CM2'], 'Mathématiques', 'F', 33),
    D('fichier_es_est_cp_cm2.pdf', 'Fichier ES et EST — CP au CM2', ['CP', 'CE1', 'CE2', 'CM1', 'CM2'], 'ES / EST', 'F', 47),
    D('fiches_revision_cep.pdf', 'Fiches de révision et d’évaluations — préparation au CEP', ['CM2'], 'Préparation au CEP', 'C', 117),
    D('revision_eps_4e_3e.pdf', 'Fichier de révision d’EPS — 4e et 3e', ['4e', '3e'], 'EPS', 'R', 110),
    D('revision_francais_4e_3e.pdf', 'Fichier de révision de Français — 4e et 3e', ['4e', '3e'], 'Français', 'R', 185),
    D('revision_histgeo_4e_3e.pdf', 'Fichier de révision d’Histoire-Géographie — 4e et 3e', ['4e', '3e'], 'Histoire-Géographie', 'R', 124),
    D('revision_pct_4e_3e.pdf', 'Fichier de révision de Physique-Chimie-Technologie — 4e et 3e', ['4e', '3e'], 'PCT', 'R', 105),
    D('fiches_eps_cp_sa10_sa13.pdf', 'Fiches de préparation d’EPS — CP, SA 10 à SA 13', ['CP'], 'EPS', 'P', 38),
    D('revision_allemand_4e_3e.pdf', 'Fichier de révision d’Allemand — 4e et 3e', ['4e', '3e'], 'Allemand', 'R', 106),
    D('revision_anglais_4e_3e.pdf', 'Fichier de révision d’Anglais — 4e et 3e', ['4e', '3e'], 'Anglais', 'R', 86),
    D('revision_svt_4e_3e.pdf', 'Fichier de révision de SVT — 4e et 3e', ['4e', '3e'], 'SVT', 'R', 95),
    D('revision_francais_tle_ab.pdf', 'Français — Terminales A et B', ['Tle A', 'Tle B'], 'Français', 'T', 76),
    D('revision_philosophie_tle_ab.pdf', 'Philosophie — Terminales A et B', ['Tle A', 'Tle B'], 'Philosophie', 'T', 71),
    D('revision_histgeo_tle_ab.pdf', 'Histoire-Géographie — Terminales A et B', ['Tle A', 'Tle B'], 'Histoire-Géographie', 'T', 66),
    D('revision_anglais_tle_ab.pdf', 'Anglais — Terminales A et B', ['Tle A', 'Tle B'], 'Anglais', 'T', 76),
    D('revision_allemand_tle_ab.pdf', 'Allemand — Terminales A et B', ['Tle A', 'Tle B'], 'Allemand', 'T', 87),
    D('revision_espagnol_tle_ab.pdf', 'Espagnol — Terminales A et B', ['Tle A', 'Tle B'], 'Espagnol', 'T', 63),
    D('revision_maths_tle_ab.pdf', 'Mathématiques — Terminales A et B', ['Tle A', 'Tle B'], 'Mathématiques', 'T', 94),
    D('revision_svt_tle_ab.pdf', 'Sciences de la Vie et de la Terre — Terminales A et B', ['Tle A', 'Tle B'], 'SVT', 'T', 72),
    D('revision_economie_tle_b.pdf', 'Économie — Terminale B', ['Tle B'], 'Économie', 'T', 66)
  ];
  const rang = d => Math.min.apply(null, d.niveaux.map(n => NIV.indexOf(n)));

  function telecharger(d) {
    fetch(BASE + d.fichier).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b => EG.Sortie.enregistrer(d.fichier, b))
      .catch(() => U.toast('Fichier introuvable sur cet appareil : ' + d.fichier, 'danger'));
  }

  U.Routeur.definir('docs-pedagogiques', function (racine) {
    racine.appendChild(el('header', { class: 'page-tete' }, el('div', {}, [
      el('h1', { text: 'Documents pédagogiques' }),
      el('p', { class: 'sous-titre', text: 'Cahiers de l’apprenant, fichiers, cahiers d’écriture et cahiers de révision (PDF), classés par niveau et par matière.' })
    ])));
    const F = { niveau: '', matiere: '', terme: '' };
    const zone = el('div');
    const selectNiveau = el('select', { onchange: e => { F.niveau = e.target.value; dessiner(); } },
      [el('option', { value: '', text: 'Tous les niveaux' })].concat(NIV.map(n => el('option', { value: n, text: n }))));
    const mats = Array.from(new Set(DOCS.map(d => d.matiere))).sort((a, b) => a.localeCompare(b, 'fr'));
    const selectMat = el('select', { onchange: e => { F.matiere = e.target.value; dessiner(); } },
      [el('option', { value: '', text: 'Toutes les matières' })].concat(mats.map(m => el('option', { value: m, text: m }))));
    racine.append(el('div', { class: 'barre-filtres', style: 'display:flex;gap:8px;flex-wrap:wrap;margin:10px 0' }, [selectNiveau, selectMat]),
      U.champRecherche('Rechercher un document…', v => { F.terme = v; dessiner(); }), zone);

    function dessiner() {
      const q = U.sansAccent(F.terme);
      const liste = DOCS.filter(d => (!F.niveau || d.niveaux.indexOf(F.niveau) >= 0) && (!F.matiere || d.matiere === F.matiere)
        && (!q || U.sansAccent(d.titre + ' ' + d.matiere + ' ' + d.famille).indexOf(q) >= 0))
        .sort((a, b) => rang(a) - rang(b) || a.matiere.localeCompare(b.matiere, 'fr'));
      zone.textContent = '';
      if (!liste.length) { zone.appendChild(U.vide('Aucun document ne correspond à ce filtre.')); return; }
      let cle = null;
      liste.forEach(d => {
        const g = d.niveaux.length === 1 ? d.niveaux[0] : d.niveaux[0] + ' → ' + d.niveaux[d.niveaux.length - 1];
        if (g !== cle) { cle = g; zone.appendChild(el('h2', { class: 'titre-section', text: g, style: 'font-size:1.05rem;margin:18px 0 8px' })); }
        zone.appendChild(el('div', { class: 'carte', style: 'margin:6px 0;padding:10px 12px' }, [
          el('b', { text: d.titre }),
          el('p', { class: 'muet', style: 'margin:3px 0', text: d.famille + ' · ' + d.matiere + ' · ' + d.pages + ' pages' }),
          el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
            el('a', { class: 'btn', href: BASE + d.fichier, target: '_blank', rel: 'noopener', text: 'Ouvrir le PDF' }),
            el('button', { class: 'btn btn-fantome', text: 'Télécharger', onclick: () => telecharger(d) })])]));
      });
    }
    dessiner();
  });
})(window);
