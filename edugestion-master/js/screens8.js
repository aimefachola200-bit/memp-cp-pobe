/* ÉduGestion Pro Master — registre d'appel.
   Le calendrier des jours de classe croisé avec la liste alphabétique de la
   classe : un élève non marqué est présent, une croix le déclare absent. Les
   jours chômés sont signalés en rouge et sortent du calcul. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const indexer = E.indexer, inscriptionsEnrichies = E.inscriptionsEnrichies, entete = E.entete;

  const session = () => EG.session;
  const ecoleCourante = () => EG.session.ecole_id || null;
  const anneeCourante = () => EG.session.annee_id || null;
  const grille = (enfants, classe) => el('div', { class: 'grille ' + (classe || '') }, enfants);
  const iso = d => d.toISOString().slice(0, 10);

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  /* Fêtes civiles et chrétiennes à date fixe ou calculable. Les fêtes
     musulmanes suivent le calendrier lunaire et sont annoncées chaque année par
     décret : elles se déclarent à la main depuis l'écran du calendrier. */
  const FERIES_FIXES = [
    ['01-01', 'Jour de l’an'],
    ['01-10', 'Fête du Vodoun'],
    ['05-01', 'Fête du Travail'],
    ['08-01', 'Fête nationale'],
    ['08-15', 'Assomption'],
    ['11-01', 'Toussaint'],
    ['12-25', 'Noël']
  ];

  /** Dimanche de Pâques (algorithme grégorien anonyme). */
  function paques(annee) {
    const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31);
    const jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(annee, mois - 1, jour));
  }

  function decale(date, jours) {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + jours);
    return d;
  }

  /** Jours chômés d'une année civile, ceux qui se calculent. */
  function feriesDeLAnnee(annee) {
    const liste = FERIES_FIXES.map(([md, motif]) => [annee + '-' + md, motif]);
    const p = paques(annee);
    liste.push([iso(decale(p, 1)), 'Lundi de Pâques']);
    liste.push([iso(decale(p, 39)), 'Ascension']);
    liste.push([iso(decale(p, 50)), 'Lundi de Pentecôte']);
    return liste;
  }

  /**
   * Engendre le calendrier d'une année scolaire : tous les jours du lundi au
   * vendredi, moins les jours chômés. Les jours déjà déclarés à la main sont
   * conservés tels quels.
   */
  function engendrer(annee, cycle, existants) {
    const dejaLa = {};
    existants.forEach(j => { dejaLa[j.date_jour + '|' + (j.cycle || '')] = j; });

    const debut = new Date(annee.date_debut + 'T12:00:00');
    const fin = new Date(annee.date_fin + 'T12:00:00');
    const feries = {};
    for (let a = debut.getFullYear(); a <= fin.getFullYear(); a++) {
      feriesDeLAnnee(a).forEach(([date, motif]) => { feries[date] = motif; });
    }

    const nouveaux = [];
    const d = new Date(debut.getTime());
    while (d <= fin) {
      const date = iso(d);
      const jour = d.getDay();
      const weekend = jour === 0 || jour === 6;
      if (!weekend && !dejaLa[date + '|' + cycle]) {
        nouveaux.push({
          annee_scolaire_id: annee.id, cycle: cycle, date_jour: date,
          ouvrable: !feries[date], coefficient: 1,
          motif: feries[date] || null
        });
      }
      d.setDate(d.getDate() + 1);
    }
    return nouveaux;
  }
  EG.engendrerCalendrier = engendrer;

  /* =======================================================================
     ÉCRAN — Registre d'appel
     ======================================================================= */

  Routeur.definir('registre-appel', function (racine) {
    racine.appendChild(entete('Registre d’appel',
      'La liste de la classe croisée avec les jours de classe du mois. Sans marque, l’élève est présent.',
      [el('button', { class: 'btn btn-fantome', text: 'Calendrier scolaire', onclick: () => Routeur.aller('calendrier') })]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let classeId = '', mois = new Date().toISOString().slice(0, 7);

    DB.where('classes', { annee_scolaire_id: anneeCourante() }).then(cls => {
      const dispo = cls.filter(c => !ecoleCourante() || c.ecole_id === ecoleCourante())
        .sort((a, b) => EG.NIVEAUX.indexOf(a.niveau) - EG.NIVEAUX.indexOf(b.niveau));
      if (!dispo.length) { zone.appendChild(U.vide('Aucune classe ouverte cette année.')); return; }
      classeId = dispo[0].id;
      filtres.appendChild(U.selecteur('Classe', dispo.map(c => ({ value: c.id, label: c.libelle || c.code })),
        classeId, v => { classeId = v; dessiner(); }, { vide: false }));
      filtres.appendChild(el('label', { class: 'filtre' }, [
        el('span', { text: 'Mois' }),
        el('input', { type: 'month', value: mois, onchange: e => { mois = e.target.value; dessiner(); } })
      ]));
      dessiner();
    });

    function dessiner() {
      zone.textContent = '';
      Promise.all([
        inscriptionsEnrichies({ classe_id: classeId }),
        DB.all('presences'),
        DB.get('annees_scolaires', anneeCourante()),
        DB.where('calendriers_scolaires', { annee_scolaire_id: anneeCourante() }),
        DB.get('classes', classeId)
      ]).then(([ins, presences, annee, calendrier, classe]) => {
        if (!ins.length) { zone.appendChild(U.vide('Aucun élève inscrit dans cette classe.')); return; }
        const cycle = classe && classe.niveau && classe.niveau.indexOf('EM') === 0 ? 'MATERNELLE' : 'PRIMAIRE';
        const duCycle = calendrier.filter(j => !j.cycle || j.cycle === cycle);

        if (!duCycle.length) {
          zone.appendChild(U.vide(
            'Le calendrier de l’année n’est pas encore engendré.',
            EG.peutEcrire() ? el('button', {
              class: 'btn btn-primaire', text: 'Engendrer le calendrier',
              onclick: () => {
                if (!annee) { U.toast('Aucune année scolaire active', 'attention'); return; }
                const nouveaux = engendrer(annee, cycle, calendrier);
                DB.putBatch('calendriers_scolaires', nouveaux, { silencieux: true })
                  .then(() => DB.audit('CALENDRIER_ENGENDRE', 'calendriers_scolaires', null,
                    { annee: annee.code, jours: nouveaux.length }))
                  .then(() => {
                    U.toast(nouveaux.length + ' jours de classe engendrés');
                    EG.majSynchro(); dessiner();
                  });
              }
            }) : null));
          return;
        }

        /* Les jours du mois, chômés compris : ces derniers restent visibles en
           rouge mais ne comptent pas. */
        const jours = duCycle.filter(j => j.date_jour.slice(0, 7) === mois)
          .sort((a, b) => a.date_jour.localeCompare(b.date_jour));
        if (!jours.length) {
          zone.appendChild(U.vide('Aucun jour de classe sur ce mois dans le calendrier.'));
          return;
        }

        const eleves = ins.slice().sort((a, b) => a._nom.localeCompare(b._nom, 'fr'));
        const marques = {};
        presences.filter(p => p.date_presence.slice(0, 7) === mois)
          .forEach(p => { marques[p.inscription_id + '|' + p.date_presence] = p; });

        /* État local : seules les absences sont mémorisées, la présence étant
           la situation par défaut. */
        const etat = {};
        eleves.forEach(e => jours.forEach(j => {
          const p = marques[e.id + '|' + j.date_jour];
          etat[e.id + '|' + j.date_jour] = p && p.statut === 'ABSENT';
        }));

        const ouvrables = jours.filter(j => j.ouvrable);
        const resume = el('p', { class: 'muet' });
        function majResume() {
          const absences = Object.keys(etat).filter(k => etat[k]).length;
          const possibles = eleves.length * ouvrables.length;
          resume.textContent = ouvrables.length + ' jours de classe · '
            + (jours.length - ouvrables.length) + ' jours chômés · '
            + absences + ' absence(s) sur ' + possibles + ' présences attendues'
            + (possibles ? ' — ' + Math.round((possibles - absences) / possibles * 1000) / 10 + ' % de présence' : '');
        }

        zone.appendChild(el('div', { class: 'ligne-entre' }, [
          el('h3', { text: MOIS[Number(mois.slice(5, 7)) - 1] + ' ' + mois.slice(0, 4) }), resume
        ]));
        zone.appendChild(el('p', { class: 'muet petit', text: 'Touchez une case pour déclarer une absence : elle passe au rouge et affiche A. Sans marque, l’élève est compté présent et la case affiche P en vert. Les colonnes rouges sont des jours chômés, exclus du calcul.' }));

        const table = el('table', { class: 'tableau registre' });
        const enTete = el('tr', {}, [el('th', { class: 'colle', text: 'Élèves' })]
          .concat(jours.map(j => el('th', {
            class: j.ouvrable ? '' : 'jour-chome',
            text: String(Number(j.date_jour.slice(8, 10))),
            title: U.dateFR(j.date_jour) + (j.motif ? ' — ' + j.motif : '')
          }))));
        table.appendChild(el('thead', {}, enTete));

        const tb = el('tbody');
        const cellules = {};
        eleves.forEach(e => {
          const tr = el('tr', {}, [el('th', { class: 'colle', text: e._nom })]);
          jours.forEach(j => {
            const cle = e.id + '|' + j.date_jour;
            if (!j.ouvrable) {
              tr.appendChild(el('td', { class: 'jour-chome', text: '·', title: j.motif || 'Jour chômé' }));
              return;
            }
            const td = el('td', { class: 'case-appel' });
            const marque = () => {
              td.className = 'case-appel ' + (etat[cle] ? 'absent' : 'present');
              td.textContent = etat[cle] ? 'A' : 'P';
            };
            td.addEventListener('click', () => {
              if (!EG.peutEcrire()) return;
              etat[cle] = !etat[cle]; marque(); majResume();
            });
            cellules[cle] = td;
            marque();
            tr.appendChild(td);
          });
          tb.appendChild(tr);
        });
        table.appendChild(tb);
        majResume();
        zone.appendChild(el('div', { class: 'tableau-enveloppe defilant' }, table));

        if (EG.peutEcrire()) {
          zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', {
              class: 'btn btn-primaire', text: 'Enregistrer le mois', onclick: () => {
                const rows = [];
                eleves.forEach(e => ouvrables.forEach(j => {
                  const cle = e.id + '|' + j.date_jour;
                  const existante = marques[cle];
                  const statut = etat[cle] ? 'ABSENT' : 'PRESENT';
                  if (existante && existante.statut === statut) return;
                  rows.push(Object.assign({}, existante || {}, {
                    inscription_id: e.id, ecole_id: e.ecole_id, classe_id: classeId,
                    date_presence: j.date_jour, periode: 'JOURNEE', statut: statut
                  }));
                }));
                if (!rows.length) { U.toast('Aucun changement'); return; }
                DB.putBatch('presences', rows, { silencieux: true })
                  .then(() => DB.audit('REGISTRE_APPEL', 'presences', null,
                    { mois, classe: classeId, lignes: rows.length }))
                  .then(() => {
                    U.toast(rows.length + ' pointage(s) enregistré(s)');
                    EG.majSynchro(); dessiner();
                  });
              }
            }),
            el('button', {
              class: 'btn btn-fantome', text: 'Déclarer un jour chômé', onclick: () => declarerChome(jours, cycle)
            }),
            el('button', {
              class: 'btn btn-fantome', text: 'Éditer le registre',
              onclick: () => editerRegistre(classe, jours, eleves, etat)
            })
          ]));
        }
      });
    }

    /** Les fêtes mobiles se déclarent à la main, décret par décret. */
    function declarerChome(jours, cycle) {
      const sel = el('select', {}, jours.filter(j => j.ouvrable).map(j =>
        el('option', { value: j.id, text: U.dateFR(j.date_jour) })));
      const motif = el('input', { type: 'text', placeholder: 'Ramadan, Tabaski, Maouloud, deuil national…' });
      U.modal('Déclarer un jour chômé', el('div', { class: 'formulaire' }, [
        el('p', { class: 'muet petit', text: 'Les fêtes musulmanes suivent le calendrier lunaire et sont fixées chaque année par décret : elles se déclarent ici. Les fêtes civiles et chrétiennes sont déjà posées à l’engendrement du calendrier.' }),
        el('div', { class: 'champ' }, [el('label', { text: 'Jour' }), sel]),
        el('div', { class: 'champ' }, [el('label', { text: 'Motif' }), motif])
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Déclarer chômé', onclick: () => {
            const jour = jours.filter(j => j.id === sel.value)[0];
            if (!jour) { fermer(); return; }
            DB.put('calendriers_scolaires', Object.assign({}, jour, {
              ouvrable: false, motif: motif.value || 'Jour chômé'
            }))
              .then(() => DB.audit('JOUR_CHOME', 'calendriers_scolaires', jour.id, { motif: motif.value }))
              .then(() => { fermer(); U.toast('Jour déclaré chômé'); EG.majSynchro(); dessiner(); });
          }
        })
      ]);
    }

    function editerRegistre(classe, jours, eleves, etat) {
      const ech = EG.Docs.echapper;
      const enTete = '<tr><th>Élèves</th>' + jours.map(j => '<th' + (j.ouvrable ? '' : ' class="jour-chome"')
        + '>' + Number(j.date_jour.slice(8, 10)) + '</th>').join('') + '<th>Abs.</th></tr>';
      const corps = eleves.map(e => {
        let absences = 0;
        const cases = jours.map(j => {
          if (!j.ouvrable) return '<td class="jour-chome">·</td>';
          const absent = etat[e.id + '|' + j.date_jour];
          if (absent) absences++;
          return '<td class="' + (absent ? 'case-absent' : 'case-present') + '">'
            + (absent ? 'A' : 'P') + '</td>';
        }).join('');
        return '<tr><td class="nom-eleve">' + ech(e._nom) + '</td>' + cases
          + '<td><strong>' + absences + '</strong></td></tr>';
      }).join('');
      EG.genererDocument('REGISTRE_APPEL',
        'Registre d’appel — ' + (classe ? (classe.libelle || classe.code) : '') + ' — '
        + MOIS[Number(mois.slice(5, 7)) - 1] + ' ' + mois.slice(0, 4),
        '<h2>Registre d’appel</h2>'
        + '<p>' + ech(session().ecole_nom) + ' — ' + ech(classe ? (classe.libelle || classe.code) : '')
        + ' — ' + MOIS[Number(mois.slice(5, 7)) - 1] + ' ' + mois.slice(0, 4) + '</p>'
        + '<table class="registre-imprime"><thead>' + enTete + '</thead><tbody>' + corps + '</tbody></table>'
        + '<p class="muet">P : présent · A : absent · les colonnes grisées sont des jours chômés, '
        + 'exclus du décompte.</p>',
        { classe_id: classeId });
    }
  });
})(window);
