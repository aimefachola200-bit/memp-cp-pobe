/* ÉduGestion Pro Master — relevé mensuel de fréquentation.
   Les dix rubriques du registre officiel, de septembre à juin, avec les lignes
   Total et Moyenne calculées. Tout se déduit des appels déjà saisis. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const indexer = E.indexer, inscriptionsEnrichies = E.inscriptionsEnrichies, entete = E.entete;

  const session = () => EG.session;
  const ecoleCourante = () => EG.session.ecole_id || null;
  const anneeCourante = () => EG.session.annee_id || null;
  const grille = (enfants, classe) => el('div', { class: 'grille ' + (classe || '') }, enfants);

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  /* Une journée de classe compte deux demi-journées : c'est l'unité du registre. */
  const DEMI_JOURNEES = 2;

  /* Les colonnes du registre, dans l'ordre officiel. */
  const RUBRIQUES = [
    { cle: 'demiJournees', titre: 'Demi-journées de classe', abrege: 'Demi-j.' },
    { cle: 'effectif', titre: 'Élèves ayant fréquenté dans le mois', abrege: 'Élèves' },
    { cle: 'possibles', titre: 'Présences possibles par demi-journée', abrege: 'Possibles' },
    { cle: 'absences', titre: 'Absences du mois', abrege: 'Absences' },
    { cle: 'effectives', titre: 'Présences effectives', abrege: 'Effectives' },
    { cle: 'taux', titre: 'Pourcentage de présences effectives', abrege: '%', pourcent: true },
    { cle: 'assidus', titre: 'Élèves n’ayant pas manqué plus de 4 fois', abrege: '≤ 4 abs.' },
    { cle: 'irreguliers', titre: 'Élèves ayant manqué plus de 4 fois', abrege: '> 4 abs.' },
    { cle: 'absencesIrreguliers', titre: 'Absences imputables à ces élèves', abrege: 'Dont abs.' }
  ];

  Routeur.definir('releve-mensuel', function (racine) {
    racine.appendChild(entete('Relevé mensuel de fréquentation',
      'De septembre à juin, tiré des appels saisis. Une journée de classe compte deux demi-journées.',
      [el('button', { class: 'btn btn-fantome', text: 'Faire l’appel', onclick: () => Routeur.aller('presences') })]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let classeId = '';

    DB.where('classes', { annee_scolaire_id: anneeCourante() }).then(cls => {
      const dispo = cls.filter(c => !ecoleCourante() || c.ecole_id === ecoleCourante())
        .sort((a, b) => EG.NIVEAUX.indexOf(a.niveau) - EG.NIVEAUX.indexOf(b.niveau));
      filtres.appendChild(U.selecteur('Périmètre',
        [{ value: '', label: 'Toute l’école' }].concat(dispo.map(c => ({ value: c.id, label: c.libelle || c.code }))),
        '', v => { classeId = v; dessiner(); }, { vide: false }));
      dessiner();
    });

    function dessiner() {
      zone.textContent = '';
      Promise.all([
        classeId ? inscriptionsEnrichies({ classe_id: classeId }) : inscriptionsEnrichies(),
        DB.all('presences'),
        DB.get('annees_scolaires', anneeCourante()),
        DB.where('calendriers_scolaires', { annee_scolaire_id: anneeCourante() })
      ]).then(([ins, presences, annee, calendrier]) => {
        if (!ins.length) { zone.appendChild(U.vide('Aucun élève dans ce périmètre.')); return; }
        const idsIns = indexer(ins);
        const retenues = presences.filter(p => idsIns[p.inscription_id]);
        if (!retenues.length) {
          zone.appendChild(U.vide('Aucun appel enregistré : le relevé se remplira au fil des appels.'));
          return;
        }

        const mois = moisDeLAnnee(annee, retenues);
        const jours = joursOuvrables(mois, annee, calendrier);

        const lignes = mois.map(m => {
          const duMois = retenues.filter(p => p.date_presence.slice(0, 7) === m);
          const demiJournees = (jours[m] || 0) * DEMI_JOURNEES;

          /* Un élève « a fréquenté » dès lors qu'il figure au moins une fois
             dans les appels du mois : c'est ce que compte le registre. */
          const frequentants = {};
          duMois.forEach(p => { frequentants[p.inscription_id] = true; });
          const effectif = Object.keys(frequentants).length;

          const absencesParEleve = {};
          duMois.forEach(p => {
            if (p.statut !== 'ABSENT') return;
            absencesParEleve[p.inscription_id] = (absencesParEleve[p.inscription_id] || 0) + 1;
          });

          const absencesJours = Object.keys(absencesParEleve)
            .reduce((s, k) => s + absencesParEleve[k], 0);
          const absences = absencesJours * DEMI_JOURNEES;
          const possibles = effectif * demiJournees;
          const effectives = Math.max(0, possibles - absences);
          const irreguliersIds = Object.keys(absencesParEleve).filter(k => absencesParEleve[k] > 4);
          const absencesIrreguliers = irreguliersIds
            .reduce((s, k) => s + absencesParEleve[k], 0) * DEMI_JOURNEES;

          return {
            mois: m,
            libelle: MOIS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(2, 4),
            demiJournees, effectif, possibles, absences, effectives,
            taux: possibles ? Math.round(effectives / possibles * 1000) / 10 : null,
            assidus: effectif - irreguliersIds.length,
            irreguliers: irreguliersIds.length,
            absencesIrreguliers
          };
        }).filter(l => l.effectif > 0 || l.demiJournees > 0);

        if (!lignes.length) { zone.appendChild(U.vide('Aucun mois renseigné pour l’instant.')); return; }

        /* Les deux dernières lignes du registre : le total et la moyenne. */
        const total = {};
        RUBRIQUES.forEach(r => {
          if (r.pourcent) return;
          total[r.cle] = lignes.reduce((s, l) => s + (l[r.cle] || 0), 0);
        });
        total.taux = total.possibles ? Math.round(total.effectives / total.possibles * 1000) / 10 : null;

        /* La moyenne ne porte que sur les mois effectivement tenus : inclure les
           mois à venir, encore vides, la tirerait artificiellement vers le bas. */
        const tenus = lignes.filter(l => l.effectif > 0);
        const moyenne = {};
        RUBRIQUES.forEach(r => {
          const valeurs = tenus.map(l => l[r.cle]).filter(v => v !== null && v !== undefined);
          moyenne[r.cle] = valeurs.length
            ? Math.round(valeurs.reduce((s, v) => s + v, 0) / valeurs.length * 10) / 10 : null;
        });

        zone.appendChild(grille([
          U.stat(U.nombre(lignes.length), 'Mois renseignés'),
          U.stat(U.nombre(total.demiJournees), 'Demi-journées de classe'),
          U.stat(total.taux === null ? '—' : total.taux + ' %', 'Présences effectives',
            total.taux !== null && total.taux < 90 ? 'attention' : ''),
          U.stat(U.nombre(total.irreguliers), 'Situations d’absentéisme',
            total.irreguliers ? 'attention' : '')
        ], 'grille-stats'));

        /* Les mois en lignes, les rubriques en colonnes. */
        const table = el('table', { class: 'tableau grille-notes' });
        table.appendChild(el('thead', {}, el('tr', {},
          [el('th', { class: 'colle', text: 'Mois' })]
            .concat(RUBRIQUES.map(r => el('th', { text: r.abrege, title: r.titre }))))));
        const tb = el('tbody');
        lignes.forEach(l => {
          tb.appendChild(el('tr', {}, [el('th', { class: 'colle', text: l.libelle })]
            .concat(RUBRIQUES.map(r => el('td', {
              class: r.pourcent && l.taux !== null && l.taux < 90 ? 'cel-calc sous-seuil' : '',
              text: l[r.cle] === null || l[r.cle] === undefined ? '—'
                : U.nombre(l[r.cle]) + (r.pourcent ? ' %' : '')
            })))));
        });
        [['Total', total], ['Moyenne', moyenne]].forEach(([nom, valeurs]) => {
          tb.appendChild(el('tr', { class: 'ligne-totaux' },
            [el('th', { class: 'colle', text: nom })]
              .concat(RUBRIQUES.map(r => el('td', {
                class: 'cel-calc',
                text: valeurs[r.cle] === null || valeurs[r.cle] === undefined ? '—'
                  : U.nombre(valeurs[r.cle]) + (r.pourcent ? ' %' : '')
              })))));
        });
        table.appendChild(tb);
        zone.appendChild(U.carte('Registre', el('div', {}, [
          el('div', { class: 'tableau-enveloppe defilant' }, table),
          el('ul', { class: 'liste-points petit muet' }, RUBRIQUES.map(r =>
            el('li', { text: r.abrege + ' — ' + r.titre })).concat([
            el('li', { text: 'La moyenne porte sur les ' + tenus.length
              + ' mois effectivement tenus, pas sur les mois encore à venir.' })
          ]))
        ])));

        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-primaire', text: 'Éditer le relevé',
            onclick: () => editer(lignes, total, moyenne) }),
          el('button', { class: 'btn btn-fantome', text: 'Télécharger en Excel',
            onclick: () => exporter(lignes, total, moyenne) })
        ]));
      });
    }

    /** Les mois de septembre à juin, complétés par ceux réellement saisis. */
    function moisDeLAnnee(annee, presences) {
      const liste = [];
      if (annee) {
        const d = new Date(annee.date_debut + 'T12:00:00');
        const fin = new Date(annee.date_fin + 'T12:00:00');
        while (d <= fin) { liste.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() + 1); }
      }
      const saisis = [...new Set(presences.map(p => p.date_presence.slice(0, 7)))];
      return [...new Set(liste.concat(saisis))].sort();
    }

    /** Jours de classe par mois : le calendrier s'il existe, sinon les jours ouvrés. */
    function joursOuvrables(mois, annee, calendrier) {
      const parMois = {};
      if (calendrier.length) {
        calendrier.filter(j => j.ouvrable).forEach(j => {
          const m = j.date_jour.slice(0, 7);
          parMois[m] = (parMois[m] || 0) + 1;
        });
        return parMois;
      }
      mois.forEach(m => {
        const [a, mo] = m.split('-').map(Number);
        const dernier = new Date(a, mo, 0).getDate();
        let n = 0;
        for (let j = 1; j <= dernier; j++) {
          const jour = new Date(a, mo - 1, j).getDay();
          if (jour !== 0 && jour !== 6) n++;
        }
        parMois[m] = n;
      });
      return parMois;
    }

    function perimetre() {
      return classeId ? 'classe' : 'école';
    }

    function editer(lignes, total, moyenne) {
      const ech = EG.Docs.echapper;
      const enTete = '<tr><th>Mois</th>' + RUBRIQUES.map(r => '<th>' + ech(r.titre) + '</th>').join('') + '</tr>';
      const corps = lignes.map(l => '<tr><td>' + ech(l.libelle) + '</td>'
        + RUBRIQUES.map(r => '<td>' + (l[r.cle] === null ? '—' : l[r.cle] + (r.pourcent ? ' %' : '')) + '</td>').join('')
        + '</tr>').join('');
      const pied = [['Total', total], ['Moyenne', moyenne]].map(([nom, v]) =>
        '<tr><th>' + nom + '</th>' + RUBRIQUES.map(r =>
          '<th>' + (v[r.cle] === null || v[r.cle] === undefined ? '—' : v[r.cle] + (r.pourcent ? ' %' : '')) + '</th>').join('')
        + '</tr>').join('');
      EG.genererDocument('RELEVE_MENSUEL',
        'Relevé mensuel de fréquentation — ' + session().annee_code,
        '<h2>Relevé mensuel de fréquentation</h2>'
        + '<p>' + ech(session().ecole_nom) + ' — année scolaire ' + session().annee_code
        + ' — ' + perimetre() + '</p>'
        + '<table><thead>' + enTete + '</thead><tbody>' + corps + pied + '</tbody></table>'
        + '<p class="muet">Une journée de classe compte deux demi-journées. Les présences '
        + 'possibles sont le produit des élèves ayant fréquenté par les demi-journées du mois.</p>',
        { classe_id: classeId || null });
    }

    function exporter(lignes, total, moyenne) {
      const enTete = ['Mois'].concat(RUBRIQUES.map(r => r.titre));
      const corps = lignes.map(l => [l.libelle].concat(RUBRIQUES.map(r => l[r.cle])));
      corps.push(['Total'].concat(RUBRIQUES.map(r => total[r.cle])));
      corps.push(['Moyenne'].concat(RUBRIQUES.map(r => moyenne[r.cle])));
      const blob = EG.Tableur.construire([{ nom: 'Relevé mensuel', lignes: [enTete].concat(corps) }]);
      const nom = 'releve-mensuel-' + session().annee_code + '.xlsx';
      const a = el('a', { href: URL.createObjectURL(blob), download: nom });
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      U.toast('Classeur « ' + nom + ' » téléchargé');
    }
  });
})(window);
