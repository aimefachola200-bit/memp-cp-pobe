/* ÉduGestion Pro Master — les présences en demi-journées.

   Une journée de classe compte deux demi-journées : l'appel se fait le matin et l'après-midi.
   Ce fichier porte :

   - EG.Presences : le calcul commun (demi-journées de classe, présences possibles, absences,
     présences effectives, pourcentage, élèves ayant manqué plus de 4 classes) ;
   - presences      : l'appel du matin et de l'après-midi, avec le calcul du mois de la classe ;
   - registre-appel : le registre du mois, deux cases par jour ;
   - releve-mensuel : le relevé mensuel de l'année scolaire (renseignements généraux et spéciaux,
                      total et moyenne générale, synthèse par cours).

   Les anciens appels « journée entière » restent lisibles : ils comptent pour les deux demi-journées.
   Les écrans suivent le périmètre du compte : un compte de circonscription choisit l'école. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const entete = E.entete, indexer = E.indexer, inscriptionsEnrichies = E.inscriptionsEnrichies;
  const session = () => EG.session;
  const grille = (enfants, classe) => el('div', { class: 'grille ' + (classe || '') }, enfants);

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const PERIODES = ['MATIN', 'APRES_MIDI'];
  const LIB_PERIODE = { MATIN: 'Matin', APRES_MIDI: 'Après-midi' };
  /* « N'ayant pas manqué plus de 4 classes » : une classe est une demi-journée. */
  const SEUIL_ABSENCES = 4;
  const aujourdhui = () => new Date().toISOString().slice(0, 10);

  /* =======================================================================
     Calcul commun
     ======================================================================= */

  /** Les demi-journées que couvre un pointage : une seule, ou les deux pour un ancien appel « journée ». */
  function periodesDe(p) { return (p.periode === 'MATIN' || p.periode === 'APRES_MIDI') ? [p.periode] : PERIODES; }

  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
  const moy1 = liste => liste.length ? Math.round(liste.reduce((s, v) => s + v, 0) / liste.length * 10) / 10 : null;
  const cleClasse = i => i.classe_id || ((i.ecole_id || '') + '|' + (i.niveau || ''));

  /** Mois (AAAA-MM) couverts par l'année scolaire, complétés par ceux où des appels existent. */
  function moisDeLAnnee(annee, dates) {
    const liste = [];
    if (annee && annee.date_debut && annee.date_fin) {
      const d = new Date(annee.date_debut + 'T12:00:00'), fin = new Date(annee.date_fin + 'T12:00:00');
      d.setDate(1);
      while (d <= fin) { liste.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() + 1); }
    }
    return Array.from(new Set(liste.concat(dates.map(x => x.slice(0, 7))))).sort();
  }

  /**
   * Les jours de classe de chaque mois : { mois: [dates] }, et l'ensemble des jours chômés.
   * Le calendrier de l'année s'il existe (filtré par cycle), sinon les jours ouvrés du lundi au vendredi.
   */
  function joursDeClasse(calendrier, cycle, mois) {
    const parMois = {}, chomes = {}, ouverts = {};
    const cal = (calendrier || []).filter(j => !cycle || !j.cycle || j.cycle === 'ENSEMBLE' || j.cycle === cycle);
    if (cal.length) {
      cal.forEach(j => { if (j.ouvrable === false) chomes[j.date_jour] = true; else ouverts[j.date_jour] = true; });
      Object.keys(ouverts).forEach(d => { delete chomes[d]; (parMois[d.slice(0, 7)] = parMois[d.slice(0, 7)] || []).push(d); });
    } else {
      mois.forEach(m => {
        const [a, mo] = m.split('-').map(Number), dernier = new Date(a, mo, 0).getDate();
        for (let j = 1; j <= dernier; j++) {
          const w = new Date(a, mo - 1, j).getDay();
          if (w !== 0 && w !== 6) (parMois[m] = parMois[m] || []).push(m + '-' + String(j).padStart(2, '0'));
        }
      });
    }
    return { parMois, chomes };
  }

  /**
   * Relevé mensuel de fréquentation d'un ensemble d'élèves.
   * o = { inscriptions, presences, calendrier, annee, cycle, jusqua }
   * Rend { lignes, total, moyenne, tauxAnnee, demiJourneesAnnee } ; chaque ligne porte les rubriques
   * du relevé : demiJournees, demiJourneesAnnee, effectif, possibles, absences, effectives, taux,
   * assidus, irreguliers, absencesIrreguliers.
   */
  function releve(o) {
    const jusqua = o.jusqua || aujourdhui();
    const ins = o.inscriptions || [], ids = {};
    ins.forEach(i => { ids[i.id] = i; });
    const pres = (o.presences || []).filter(p => ids[p.inscription_id] && p.date_presence);
    const mois = moisDeLAnnee(o.annee, pres.map(p => p.date_presence));
    const J = joursDeClasse(o.calendrier, o.cycle, mois);
    let cumul = 0;
    const lignes = [];
    mois.forEach(m => {
      const duMois = pres.filter(p => p.date_presence.slice(0, 7) === m && !J.chomes[p.date_presence]);
      const jours = {};
      (J.parMois[m] || []).forEach(d => { if (d <= jusqua) jours[d] = true; });
      duMois.forEach(p => { jours[p.date_presence] = true; });
      const nbJours = Object.keys(jours).length;
      if (!duMois.length) return; /* mois sans appel : pas de ligne */

      /* Une classe qui a fait l'appel dans le mois est comptée en entier : sans marque, l'élève est présent. */
      const actives = {};
      duMois.forEach(p => { actives[cleClasse(ids[p.inscription_id])] = true; });
      const frequentants = ins.filter(i => actives[cleClasse(i)]);
      const absParEleve = {};
      duMois.forEach(p => {
        if (p.statut !== 'ABSENT') return;
        absParEleve[p.inscription_id] = (absParEleve[p.inscription_id] || 0) + periodesDe(p).length;
      });
      const absences = Object.keys(absParEleve).reduce((s, k) => s + absParEleve[k], 0);
      const demiJournees = nbJours * 2, effectif = frequentants.length;
      const possibles = effectif * demiJournees, effectives = Math.max(0, possibles - absences);
      const irreguliers = Object.keys(absParEleve).filter(k => absParEleve[k] > SEUIL_ABSENCES);
      cumul += demiJournees;
      lignes.push({
        mois: m, libelle: MOIS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(2, 4),
        demiJournees, demiJourneesAnnee: cumul, effectif, possibles, absences, effectives, taux: pct(effectives, possibles),
        assidus: effectif - irreguliers.length, irreguliers: irreguliers.length,
        absencesIrreguliers: irreguliers.reduce((s, k) => s + absParEleve[k], 0)
      });
    });
    const CLES = ['demiJournees', 'effectif', 'possibles', 'absences', 'effectives', 'assidus', 'irreguliers', 'absencesIrreguliers'];
    const total = {}, moyenne = {};
    CLES.forEach(k => { total[k] = lignes.reduce((s, l) => s + l[k], 0); moyenne[k] = moy1(lignes.map(l => l[k])); });
    total.demiJourneesAnnee = cumul; moyenne.demiJourneesAnnee = null;
    total.taux = pct(total.effectives, total.possibles);
    moyenne.taux = moy1(lignes.filter(l => l.taux !== null).map(l => l.taux));
    return { lignes, total, moyenne, tauxAnnee: total.taux, demiJourneesAnnee: cumul };
  }

  const cycleDe = niveau => (niveau && String(niveau).indexOf('EM') === 0) ? 'MATERNELLE' : 'PRIMAIRE';

  EG.Presences = { PERIODES, LIB_PERIODE, SEUIL_ABSENCES, periodesDe, joursDeClasse, releve, cycleDe };

  /* =======================================================================
     Choix de l'école et de la classe (comptes de circonscription compris)
     ======================================================================= */

  /**
   * Pose les sélecteurs École / Classe dans `filtres` et rend l'état { ecole, classe, classes, ecoles }.
   * opts.tout : proposer « toutes les classes » (relevé). Rappelle `changer` à chaque choix.
   */
  function choisirPerimetre(filtres, opts, changer) {
    opts = opts || {};
    const etat = { ecole: session().ecole_id || '', classe: '', classes: [], ecoles: [] };
    const dessiner = () => {
      filtres.textContent = '';
      if (!session().ecole_id) {
        filtres.appendChild(U.selecteur('École', etat.ecoles.map(e => ({ value: e.id, label: e.nom })), etat.ecole,
          v => { etat.ecole = v; etat.classe = opts.tout ? '' : ((liste()[0] || {}).id || ''); dessiner(); changer(); },
          { libelleVide: opts.tout ? 'Toutes les écoles de mon périmètre' : '— Choisir une école —' }));
      }
      const cl = liste();
      filtres.appendChild(U.selecteur('Classe', cl.map(c => ({ value: c.id, label: (c.libelle || c.code) + (!session().ecole_id && !etat.ecole && (etat.ecoles.filter(e => e.id === c.ecole_id)[0]) ? ' — ' + etat.ecoles.filter(e => e.id === c.ecole_id)[0].nom : '') })),
        etat.classe, v => { etat.classe = v; changer(); }, { vide: !!opts.tout, libelleVide: 'Toutes les classes' }));
      if (opts.apres) opts.apres(filtres);
    };
    const liste = () => etat.classes.filter(c => !etat.ecole || c.ecole_id === etat.ecole);
    return Promise.all([DB.where('classes', { annee_scolaire_id: session().annee_id }), DB.all('ecoles')])
      .then(([cls, ecoles]) => EG.filtrerPerimetre('classes', cls).then(cls2 => {
        const idsEc = {};
        cls2 = cls2.filter(c => !session().ecole_id || c.ecole_id === session().ecole_id)
          .sort((a, b) => EG.NIVEAUX.indexOf(a.niveau) - EG.NIVEAUX.indexOf(b.niveau) || String(a.libelle || a.code).localeCompare(String(b.libelle || b.code), 'fr'));
        cls2.forEach(c => { idsEc[c.ecole_id] = true; });
        etat.classes = cls2;
        etat.ecoles = ecoles.filter(e => idsEc[e.id]).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true }));
        if (!session().ecole_id && !opts.tout && etat.ecoles.length) etat.ecole = etat.ecoles[0].id;
        if (!opts.tout) etat.classe = (liste()[0] || {}).id || '';
        dessiner();
        return etat;
      }));
  }

  const nomClasse = c => c ? (c.libelle || c.code) : '';

  /** Inscriptions du périmètre choisi (une classe, une école ou tout le périmètre du compte). */
  function inscriptionsDuPerimetre(etat) {
    const ecolesPermises = {};
    etat.classes.forEach(c => { ecolesPermises[c.ecole_id] = true; });
    return (etat.classe ? inscriptionsEnrichies({ classe_id: etat.classe }) : inscriptionsEnrichies())
      .then(ins => ins.filter(i => (etat.classe || ecolesPermises[i.ecole_id]) && (!etat.ecole || i.ecole_id === etat.ecole)));
  }

  /* =======================================================================
     APPEL — matin et après-midi
     ======================================================================= */

  Routeur.definir('presences', function (racine) {
    racine.appendChild(entete('Présences', 'Deux appels par jour, le matin et l’après-midi : une journée de classe compte deux demi-journées. L’appel fonctionne sans réseau.',
      [el('button', { class: 'btn btn-fantome', text: 'Registre du mois', onclick: () => Routeur.aller('registre-appel') }),
        el('button', { class: 'btn btn-fantome', text: 'Relevé mensuel', onclick: () => Routeur.aller('releve-mensuel') }),
        el('button', { class: 'btn btn-fantome', text: 'Personnel', onclick: () => Routeur.aller('presences-personnel') }),
        el('button', { class: 'btn btn-fantome', text: 'Bilan de présence', onclick: () => Routeur.aller('bilan-presences') }),
        el('button', { class: 'btn btn-fantome', text: 'Calendrier scolaire', onclick: () => Routeur.aller('calendrier') })]));
    const filtres = el('div', { class: 'barre-filtres' }), zoneChoix = el('div', { class: 'barre-filtres' }), zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zoneChoix); racine.appendChild(zone);
    let date = aujourdhui(), periode = new Date().getHours() < 12 ? 'MATIN' : 'APRES_MIDI', P = null;

    function barreJour() {
      zoneChoix.textContent = '';
      zoneChoix.appendChild(el('label', { class: 'filtre' }, [el('span', { text: 'Date' }),
        el('input', { type: 'date', value: date, onchange: e => { date = e.target.value || date; dessiner(); } })]));
      zoneChoix.appendChild(el('div', { class: 'filtre' }, [el('span', { text: 'Demi-journée' }),
        el('div', { class: 'segment', role: 'group', 'aria-label': 'Demi-journée' }, PERIODES.map(p => el('button', {
          class: 'segment-btn' + (periode === p ? ' actif' : ''), type: 'button', text: LIB_PERIODE[p], dataset: { periode: p },
          onclick: () => { periode = p; barreJour(); dessiner(); } })))]));
    }

    choisirPerimetre(filtres, {}, () => dessiner()).then(etat => { P = etat; barreJour(); dessiner(); });

    function dessiner() {
      zone.textContent = '';
      if (!P) return;
      if (!P.classe) { zone.appendChild(U.vide(P.ecoles.length || session().ecole_id ? 'Aucune classe n’est ouverte pour cette année. Créez-en une dans le module Socle.' : 'Aucune école dans votre périmètre.')); return; }
      const classeId = P.classe;
      Promise.all([
        inscriptionsEnrichies({ classe_id: classeId }), DB.where('presences', { date_presence: date }),
        DB.get('annees_scolaires', session().annee_id), DB.where('calendriers_scolaires', { annee_scolaire_id: session().annee_id })
      ]).then(([ins, duJour, annee, calendrier]) => {
        if (!ins.length) { zone.appendChild(U.vide('Aucun élève inscrit dans cette classe.')); return; }
        const idsIns = indexer(ins);
        const dujour = duJour.filter(p => idsIns[p.inscription_id]);
        const pointage = (insId, per) => {
          const mine = dujour.filter(p => p.inscription_id === insId);
          return mine.filter(p => p.periode === per)[0] || mine.filter(p => periodesDe(p).length === 2)[0] || null;
        };
        const fait = per => dujour.some(p => periodesDe(p).indexOf(per) >= 0);
        const etat = {};
        ins.forEach(i => { const p = pointage(i.id, periode); etat[i.id] = p ? p.statut : 'PRESENT'; });

        const compteur = el('p', { class: 'muet' });
        const majCompteur = () => {
          const v = Object.keys(etat).map(k => etat[k]);
          compteur.textContent = v.filter(s => s === 'PRESENT').length + ' présents · ' + v.filter(s => s === 'ABSENT').length + ' absents · ' + v.filter(s => s === 'RETARD').length + ' en retard';
        };

        zone.appendChild(el('div', { class: 'ligne-entre' }, [
          el('h3', { text: 'Appel du ' + U.dateFR(date) + ' — ' + LIB_PERIODE[periode].toLowerCase() }), compteur]));
        zone.appendChild(el('p', { class: 'petit' }, PERIODES.map(per => el('span', { class: 'badge ' + (fait(per) ? 'ok' : 'attention'), style: 'margin-right:8px',
          text: LIB_PERIODE[per] + ' : ' + (fait(per) ? 'appel fait' : 'appel à faire') }))));

        const liste = el('div', { class: 'appel' });
        ins.forEach(i => {
          const ligne = el('div', { class: 'appel-ligne' });
          ligne.appendChild(el('div', { class: 'appel-nom' }, [el('strong', { text: i._nom }),
            el('span', { class: 'muet petit', text: (i._eleve ? i._eleve.sexe : '') + ' • ' + i.niveau + (i.redoublant ? ' • redoublant' : '') })]));
          const boutons = el('div', { class: 'segment' });
          const VAL = ['PRESENT', 'ABSENT', 'RETARD'];
          const maj = () => Array.prototype.forEach.call(boutons.children, (x, k) => { x.className = 'segment-btn' + (etat[i.id] === VAL[k] ? ' actif ' + VAL[k].toLowerCase() : ''); });
          [['PRESENT', 'P'], ['ABSENT', 'A'], ['RETARD', 'R']].forEach(([v, lbl]) => {
            const b = el('button', { class: 'segment-btn' + (etat[i.id] === v ? ' actif ' + v.toLowerCase() : ''), text: lbl, 'aria-label': U.libelle(v) });
            b.addEventListener('click', () => { etat[i.id] = v; maj(); majCompteur(); });
            boutons.appendChild(b);
          });
          ligne.appendChild(boutons);
          liste.appendChild(ligne);
        });
        majCompteur();
        zone.appendChild(liste);

        const barre = el('div', { class: 'barre-actions' });
        barre.appendChild(el('button', { class: 'btn btn-fantome', text: 'Tout marquer présent', onclick: () => { ins.forEach(i => { etat[i.id] = 'PRESENT'; }); dessiner2(); } }));
        if (periode === 'APRES_MIDI' && fait('MATIN')) {
          barre.appendChild(el('button', { class: 'btn btn-fantome', text: 'Reporter l’appel du matin', onclick: () => {
            ins.forEach(i => { const p = pointage(i.id, 'MATIN'); etat[i.id] = p ? p.statut : 'PRESENT'; });
            dessiner2();
          } }));
        }
        barre.appendChild(el('button', { class: 'btn btn-primaire', text: 'Enregistrer l’appel ' + (periode === 'MATIN' ? 'du matin' : 'de l’après-midi'), onclick: () => {
          const autre = periode === 'MATIN' ? 'APRES_MIDI' : 'MATIN', rows = [];
          ins.forEach(i => {
            const mine = dujour.filter(p => p.inscription_id === i.id);
            const exact = mine.filter(p => p.periode === periode)[0];
            const ancien = mine.filter(p => periodesDe(p).length === 2)[0];
            const base = { inscription_id: i.id, ecole_id: i.ecole_id, classe_id: classeId, date_presence: date };
            if (exact) rows.push(Object.assign({}, exact, { statut: etat[i.id] }));
            else if (ancien) {
              /* L'ancien appel « journée » devient la demi-journée que l'on ne touche pas. */
              rows.push(Object.assign({}, ancien, { periode: autre }));
              rows.push(Object.assign({}, base, { periode, statut: etat[i.id] }));
            } else rows.push(Object.assign({}, base, { periode, statut: etat[i.id] }));
          });
          DB.putBatch('presences', rows)
            .then(() => DB.audit('APPEL', 'presences', classeId, { date, periode, effectif: ins.length }))
            .then(() => { U.toast('Appel ' + (periode === 'MATIN' ? 'du matin' : 'de l’après-midi') + ' enregistré pour ' + ins.length + ' élèves'); EG.majSynchro(); dessiner(); });
        } }));
        zone.appendChild(barre);
        const dessiner2 = () => { liste.querySelectorAll('.segment').forEach((seg, idx) => {
          const VAL = ['PRESENT', 'ABSENT', 'RETARD'];
          Array.prototype.forEach.call(seg.children, (x, k) => { x.className = 'segment-btn' + (etat[ins[idx].id] === VAL[k] ? ' actif ' + VAL[k].toLowerCase() : ''); });
        }); majCompteur(); };

        /* Calcul mensuel de la classe */
        const mois = date.slice(0, 7), debutMois = mois + '-01', finMois = mois + '-31';
        DB.all('presences').then(all => {
          const duMois = all.filter(p => idsIns[p.inscription_id] && p.date_presence >= debutMois && p.date_presence <= finMois);
          if (!duMois.length) return;
          const classe = P.classes.filter(c => c.id === classeId)[0];
          const R = releve({ inscriptions: ins, presences: duMois, calendrier, annee, cycle: cycleDe(classe ? classe.niveau : null) });
          const l = R.lignes.filter(x => x.mois === mois)[0];
          if (!l) return;
          const parEleve = {};
          duMois.forEach(p => { if (p.statut === 'ABSENT') parEleve[p.inscription_id] = (parEleve[p.inscription_id] || 0) + periodesDe(p).length; });
          zone.appendChild(U.carte('Calcul du mois — ' + MOIS[Number(mois.slice(5, 7)) - 1] + ' ' + mois.slice(0, 4), el('div', {}, [
            grille([
              U.stat(U.nombre(l.demiJournees), 'Demi-journées de classe du mois'),
              U.stat(U.nombre(l.possibles), 'Total des présences possibles'),
              U.stat(U.nombre(l.absences), 'Total des absences', l.absences ? 'attention' : ''),
              U.stat(U.nombre(l.effectives), 'Total des présences effectives'),
              U.stat(l.taux === null ? '—' : l.taux + ' %', 'Pourcentage des présences effectives', l.taux !== null && l.taux < 90 ? 'attention' : ''),
              U.stat(U.nombre(l.irreguliers), 'Élèves ayant manqué plus de ' + SEUIL_ABSENCES + ' classes', l.irreguliers ? 'attention' : '')
            ], 'grille-stats'),
            el('p', { class: 'muet petit', text: 'Présences possibles = élèves × demi-journées de classe du mois. Présences effectives = présences possibles − absences.' })
          ])));
          const risques = ins.filter(i => parEleve[i.id] > SEUIL_ABSENCES).sort((a, b) => parEleve[b.id] - parEleve[a.id]);
          if (risques.length) {
            zone.appendChild(U.carte('Absences répétées ce mois-ci (plus de ' + SEUIL_ABSENCES + ' demi-journées)', U.tableau([
              { titre: 'Élève', valeur: i => i._nom },
              { titre: 'Absences', valeur: i => parEleve[i.id] + ' demi-journées sur ' + l.demiJournees },
              { titre: 'Taux', valeur: i => Math.round(parEleve[i.id] / l.demiJournees * 100) + ' %' }
            ], risques.slice(0, 10))));
          }
        });
      });
    }
  });

  /* =======================================================================
     REGISTRE D'APPEL — deux cases par jour
     ======================================================================= */

  Routeur.definir('registre-appel', function (racine) {
    racine.appendChild(entete('Registre d’appel',
      'La liste de la classe croisée avec les jours de classe du mois, deux cases par jour : le matin et l’après-midi. Sans marque, l’élève est présent.',
      [el('button', { class: 'btn btn-fantome', text: 'Calendrier scolaire', onclick: () => Routeur.aller('calendrier') })]));
    const filtres = el('div', { class: 'barre-filtres' }), zoneMois = el('div', { class: 'barre-filtres' }), zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zoneMois); racine.appendChild(zone);
    let mois = new Date().toISOString().slice(0, 7), P = null;
    zoneMois.appendChild(el('label', { class: 'filtre' }, [el('span', { text: 'Mois' }),
      el('input', { type: 'month', value: mois, onchange: e => { mois = e.target.value || mois; dessiner(); } })]));
    choisirPerimetre(filtres, {}, () => dessiner()).then(etat => { P = etat; dessiner(); });

    function dessiner() {
      zone.textContent = '';
      if (!P) return;
      if (!P.classe) { zone.appendChild(U.vide('Aucune classe ouverte cette année.')); return; }
      const classeId = P.classe;
      Promise.all([
        inscriptionsEnrichies({ classe_id: classeId }), DB.all('presences'), DB.get('annees_scolaires', session().annee_id),
        DB.where('calendriers_scolaires', { annee_scolaire_id: session().annee_id }), DB.get('classes', classeId)
      ]).then(([ins, presences, annee, calendrier, classe]) => {
        if (!ins.length) { zone.appendChild(U.vide('Aucun élève inscrit dans cette classe.')); return; }
        const cycle = cycleDe(classe ? classe.niveau : null);
        const duCycle = calendrier.filter(j => !j.cycle || j.cycle === 'ENSEMBLE' || j.cycle === cycle);
        if (!duCycle.length) {
          zone.appendChild(U.vide('Le calendrier de l’année n’est pas encore engendré.',
            EG.peutEcrire() ? el('button', { class: 'btn btn-primaire', text: 'Engendrer le calendrier', onclick: () => {
              if (!annee) { U.toast('Aucune année scolaire active', 'attention'); return; }
              const nouveaux = EG.engendrerCalendrier(annee, cycle, calendrier);
              DB.putBatch('calendriers_scolaires', nouveaux, { silencieux: true })
                .then(() => DB.audit('CALENDRIER_ENGENDRE', 'calendriers_scolaires', null, { annee: annee.code, jours: nouveaux.length }))
                .then(() => { U.toast(nouveaux.length + ' jours de classe engendrés'); EG.majSynchro(); dessiner(); });
            } }) : null));
          return;
        }
        const jours = duCycle.filter(j => j.date_jour.slice(0, 7) === mois).sort((a, b) => a.date_jour.localeCompare(b.date_jour));
        if (!jours.length) { zone.appendChild(U.vide('Aucun jour de classe sur ce mois dans le calendrier.')); return; }

        const eleves = ins.slice().sort((a, b) => a._nom.localeCompare(b._nom, 'fr'));
        const idsIns = indexer(eleves);
        const cle = (id, date, per) => id + '|' + date + '|' + per;
        const marques = {};
        presences.filter(p => idsIns[p.inscription_id] && p.date_presence.slice(0, 7) === mois)
          .forEach(p => periodesDe(p).forEach(per => { marques[cle(p.inscription_id, p.date_presence, per)] = p; }));
        const etat = {}, initial = {};
        const ouvrables = jours.filter(j => j.ouvrable);
        eleves.forEach(e => ouvrables.forEach(j => PERIODES.forEach(per => {
          const m = marques[cle(e.id, j.date_jour, per)];
          etat[cle(e.id, j.date_jour, per)] = initial[cle(e.id, j.date_jour, per)] = !!(m && m.statut === 'ABSENT');
        })));

        const resume = el('p', { class: 'muet' });
        const majResume = () => {
          const absences = Object.keys(etat).filter(k => etat[k]).length;
          const possibles = eleves.length * ouvrables.length * 2;
          resume.textContent = ouvrables.length + ' jours de classe (' + ouvrables.length * 2 + ' demi-journées) · ' + (jours.length - ouvrables.length) + ' jours chômés · '
            + absences + ' absence(s) sur ' + possibles + ' présences possibles' + (possibles ? ' — ' + Math.round((possibles - absences) / possibles * 1000) / 10 + ' % de présences effectives' : '');
        };
        zone.appendChild(el('div', { class: 'ligne-entre' }, [el('h3', { text: MOIS[Number(mois.slice(5, 7)) - 1] + ' ' + mois.slice(0, 4) }), resume]));
        zone.appendChild(el('p', { class: 'muet petit', text: 'Chaque jour a deux cases : « M » le matin et « Ap » l’après-midi. Touchez une case pour déclarer une absence : elle passe au rouge et affiche A. Sans marque, l’élève est compté présent (P en vert). Les colonnes grisées sont des jours chômés, exclus du calcul.' }));

        const table = el('table', { class: 'tableau registre' });
        table.appendChild(el('thead', {}, [
          el('tr', {}, [el('th', { class: 'colle', rowspan: 2, text: 'Élèves' })].concat(jours.map(j => el('th', { colspan: 2, class: j.ouvrable ? '' : 'jour-chome',
            text: String(Number(j.date_jour.slice(8, 10))), title: U.dateFR(j.date_jour) + (j.motif ? ' — ' + j.motif : '') })))),
          el('tr', {}, jours.map(j => [el('th', { class: 'petit ' + (j.ouvrable ? '' : 'jour-chome'), text: 'M', title: 'Matin' }), el('th', { class: 'petit ' + (j.ouvrable ? '' : 'jour-chome'), text: 'Ap', title: 'Après-midi' })]).reduce((a, b) => a.concat(b), []))
        ]));
        const tb = el('tbody');
        eleves.forEach(e => {
          const tr = el('tr', {}, [el('th', { class: 'colle', text: e._nom })]);
          jours.forEach(j => PERIODES.forEach(per => {
            const k = cle(e.id, j.date_jour, per);
            if (!j.ouvrable) { tr.appendChild(el('td', { class: 'jour-chome', text: '·', title: j.motif || 'Jour chômé' })); return; }
            const td = el('td', { class: 'case-appel', dataset: { cle: k } });
            const marque = () => { td.className = 'case-appel ' + (etat[k] ? 'absent' : 'present'); td.textContent = etat[k] ? 'A' : 'P'; };
            td.addEventListener('click', () => { if (!EG.peutEcrire()) return; etat[k] = !etat[k]; marque(); majResume(); });
            marque();
            tr.appendChild(td);
          }));
          tb.appendChild(tr);
        });
        table.appendChild(tb);
        majResume();
        zone.appendChild(el('div', { class: 'tableau-enveloppe defilant' }, table));

        if (EG.peutEcrire()) {
          zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', { class: 'btn btn-primaire', text: 'Enregistrer le mois', onclick: () => {
              const rows = [];
              eleves.forEach(e => ouvrables.forEach(j => {
                const base = { inscription_id: e.id, ecole_id: e.ecole_id, classe_id: classeId, date_presence: j.date_jour };
                const m = marques[cle(e.id, j.date_jour, 'MATIN')], a = marques[cle(e.id, j.date_jour, 'APRES_MIDI')];
                const ancien = m && a && m === a ? m : null;
                const veut = per => etat[cle(e.id, j.date_jour, per)] ? 'ABSENT' : 'PRESENT';
                const change = per => etat[cle(e.id, j.date_jour, per)] !== initial[cle(e.id, j.date_jour, per)];
                if (ancien) {
                  if (!change('MATIN') && !change('APRES_MIDI')) return;
                  rows.push(Object.assign({}, ancien, { periode: 'MATIN', statut: veut('MATIN') }));
                  rows.push(Object.assign({}, base, { periode: 'APRES_MIDI', statut: veut('APRES_MIDI') }));
                  return;
                }
                PERIODES.forEach(per => {
                  const cur = per === 'MATIN' ? m : a;
                  if (cur) { if (change(per)) rows.push(Object.assign({}, cur, { statut: veut(per) })); }
                  else rows.push(Object.assign({}, base, { periode: per, statut: veut(per) }));
                });
              }));
              if (!rows.length) { U.toast('Aucun changement'); return; }
              DB.putBatch('presences', rows, { silencieux: true })
                .then(() => DB.audit('REGISTRE_APPEL', 'presences', null, { mois, classe: classeId, lignes: rows.length }))
                .then(() => { U.toast(rows.length + ' pointage(s) enregistré(s)'); EG.majSynchro(); dessiner(); });
            } }),
            el('button', { class: 'btn btn-fantome', text: 'Déclarer un jour chômé', onclick: () => declarerChome(jours, cycle) }),
            el('button', { class: 'btn btn-fantome', text: 'Éditer le registre', onclick: () => editerRegistre(classe, jours, eleves, etat, cle) })
          ]));
        }
      });
    }

    function declarerChome(jours, cycle) {
      const sel = el('select', {}, jours.filter(j => j.ouvrable).map(j => el('option', { value: j.id, text: U.dateFR(j.date_jour) })));
      const motif = el('input', { type: 'text', placeholder: 'Ramadan, Tabaski, Maouloud, deuil national…' });
      U.modal('Déclarer un jour chômé', el('div', { class: 'formulaire' }, [
        el('p', { class: 'muet petit', text: 'Les fêtes musulmanes suivent le calendrier lunaire et sont fixées chaque année par décret : elles se déclarent ici. Les fêtes civiles et chrétiennes sont déjà posées à l’engendrement du calendrier.' }),
        el('div', { class: 'champ' }, [el('label', { text: 'Jour' }), sel]), el('div', { class: 'champ' }, [el('label', { text: 'Motif' }), motif])
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', { class: 'btn btn-primaire', text: 'Déclarer chômé', onclick: () => {
          const jour = jours.filter(j => j.id === sel.value)[0];
          if (!jour) { fermer(); return; }
          DB.put('calendriers_scolaires', Object.assign({}, jour, { ouvrable: false, motif: motif.value || 'Jour chômé' }))
            .then(() => DB.audit('JOUR_CHOME', 'calendriers_scolaires', jour.id, { motif: motif.value }))
            .then(() => { fermer(); U.toast('Jour déclaré chômé'); EG.majSynchro(); dessiner(); });
        } })
      ]);
    }

    /* Registre de présence au format SCOLARIS / GESCOL : cadre (cours, titulaire, effectif, demi-journées, absences),
       N°, nom et prénoms, deux cases par jour (M matin, S soir), absences par élève et ligne « Absents » par demi-journée ;
       paysage, signatures du titulaire et du directeur, cachet, code QR de vérification. */
    function editerRegistre(classe, jours, eleves, etat, cle) {
      const D = EG.DocsSco, ech = D.ech;
      const titreMois = MOIS[Number(mois.slice(5, 7)) - 1] + ' ' + mois.slice(0, 4);
      const ouvrables = jours.filter(j => j.ouvrable);
      const titulaire = classe && classe.titulaire_id ? DB.get('personnels', classe.titulaire_id) : Promise.resolve(null);
      titulaire.then(tit => {
        const parCol = {}; let totalAbs = 0;
        const lignes = eleves.map((e, n) => {
          let absences = 0;
          const cases = [];
          jours.forEach(j => PERIODES.forEach(per => {
            if (!j.ouvrable) { cases.push({ t: '', cls: 'chome' }); return; }
            const absent = etat[cle(e.id, j.date_jour, per)];
            if (absent) { absences++; parCol[j.date_jour + per] = (parCol[j.date_jour + per] || 0) + 1; }
            cases.push({ t: absent ? 'A' : '', cls: absent ? 'abs' : '' });
          }));
          totalAbs += absences;
          return [n + 1, { t: (e._nom || '').trim(), g: true }].concat(cases, [{ t: absences || '', cls: absences ? 'abs' : '' }]);
        });
        const absents = { tot: true, cells: [{ t: '', cs: 1 }, { t: 'Absents', g: true }].concat([].concat(...jours.map(j => PERIODES.map(per => j.ouvrable ? { t: parCol[j.date_jour + per] || '' } : { t: '', cls: 'chome' }))), [{ t: totalAbs }]) };
        const enTetes = [
          [{ t: 'N°', rs: 2 }, { t: 'Nom et prénoms', rs: 2 }].concat(jours.map(j => ({ t: D.jourCourt(j.date_jour), cs: 2, cls: j.ouvrable ? '' : 'chome' })), [{ t: 'Abs.', rs: 2 }]),
          [].concat(...jours.map(() => ['M', 'S']))
        ];
        const nomTit = tit ? ((tit.nom || '').toUpperCase() + ' ' + (tit.prenoms || '')).trim() : '';
        const html = D.titre('Registre de présence', titreMois + ' — Année scolaire ' + session().annee_code + ' — A = absent(e), case vide = présent(e) ; M = matin, S = soir (après-midi)')
          + D.infos([['Cours', classe ? classe.niveau : ''], ['Titulaire', nomTit], ['Effectif', eleves.length],
            ['Demi-journées', ouvrables.length * 2], ['Absences du mois', totalAbs], ['Année scolaire', session().annee_code]], 3)
          + D.tableau(enTetes, lignes.concat([absents]))
          + '<p class="note-sco">Jours grisés : jours chômés (exclus du décompte). Présences possibles du mois : ' + (eleves.length * ouvrables.length * 2)
          + ' — présences effectives : ' + (eleves.length * ouvrables.length * 2 - totalAbs) + '.</p>';
        EG.genererDocument('REGISTRE_APPEL', 'Registre de présence — ' + nomClasse(classe) + ' — ' + titreMois, html,
          { classe_id: classe ? classe.id : null, ecole_id: classe ? classe.ecole_id : null, paysage: true });
      });
    }
  });

  /* =======================================================================
     RELEVÉ MENSUEL DE FRÉQUENTATION
     ======================================================================= */

  /* Les dix rubriques du relevé, dans l'ordre officiel : renseignements généraux puis spéciaux. */
  const RUBRIQUES = [
    { cle: 'demiJournees', groupe: 'G', titre: 'Nombre de demi-journées de classe du mois', abrege: 'Demi-j. du mois' },
    { cle: 'demiJourneesAnnee', groupe: 'G', titre: 'Nombre de demi-journées de classe de l’année scolaire (cumul)', abrege: 'Demi-j. de l’année' },
    { cle: 'effectif', groupe: 'G', titre: 'Total des élèves ayant fréquenté la classe pendant le mois', abrege: 'Élèves' },
    { cle: 'possibles', groupe: 'G', titre: 'Total des présences possibles par demi-journée de classe', abrege: 'Présences possibles' },
    { cle: 'absences', groupe: 'G', titre: 'Total des absences du mois', abrege: 'Absences' },
    { cle: 'effectives', groupe: 'G', titre: 'Total des présences du mois', abrege: 'Présences effectives' },
    { cle: 'taux', groupe: 'G', titre: 'Pourcentage des présences effectives dans le mois', abrege: '% effectives', pourcent: true },
    { cle: 'assidus', groupe: 'S', titre: 'Nombre d’élèves n’ayant jamais manqué la classe ou n’ayant pas manqué plus de ' + SEUIL_ABSENCES + ' classes', abrege: '≤ ' + SEUIL_ABSENCES + ' classes manquées' },
    { cle: 'irreguliers', groupe: 'S', titre: 'Nombre d’élèves ayant manqué plus de ' + SEUIL_ABSENCES + ' classes', abrege: '> ' + SEUIL_ABSENCES + ' classes manquées' },
    { cle: 'absencesIrreguliers', groupe: 'S', titre: 'Total des absences imputables aux élèves de la rubrique précédente (plus de ' + SEUIL_ABSENCES + ' classes manquées)', abrege: 'Absences de ces élèves' }
  ];
  const fmt = (r, v) => v === null || v === undefined ? '—' : U.nombre(v) + (r.pourcent ? ' %' : '');
  EG.Presences.RUBRIQUES = RUBRIQUES;

  Routeur.definir('releve-mensuel', function (racine) {
    racine.appendChild(entete('Relevé mensuel de fréquentation',
      'Les renseignements généraux et spéciaux de chaque mois de l’année scolaire, tirés des appels du matin et de l’après-midi.',
      [el('button', { class: 'btn btn-fantome', text: 'Faire l’appel', onclick: () => Routeur.aller('presences') })]));
    const filtres = el('div', { class: 'barre-filtres' }), zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let P = null;
    choisirPerimetre(filtres, { tout: true }, () => dessiner()).then(etat => { P = etat; dessiner(); });

    function dessiner() {
      zone.textContent = '';
      if (!P) return;
      Promise.all([inscriptionsDuPerimetre(P), DB.all('presences'), DB.get('annees_scolaires', session().annee_id),
        DB.where('calendriers_scolaires', { annee_scolaire_id: session().annee_id })]).then(([ins, presences, annee, calendrier]) => {
        if (!ins.length) { zone.appendChild(U.vide('Aucun élève dans ce périmètre.')); return; }
        const classe = P.classe ? P.classes.filter(c => c.id === P.classe)[0] : null;
        const cycle = classe ? cycleDe(classe.niveau) : null;
        const R = releve({ inscriptions: ins, presences, calendrier, annee, cycle });
        if (!R.lignes.length) { zone.appendChild(U.vide('Aucun appel enregistré : le relevé se remplira au fil des appels.')); return; }
        const { lignes, total, moyenne } = R;

        zone.appendChild(grille([
          U.stat(U.nombre(lignes.length), 'Mois renseignés'),
          U.stat(U.nombre(R.demiJourneesAnnee), 'Demi-journées de classe de l’année'),
          U.stat(R.tauxAnnee === null ? '—' : R.tauxAnnee + ' %', 'Moyenne générale des présences effectives', R.tauxAnnee !== null && R.tauxAnnee < 90 ? 'attention' : ''),
          U.stat(U.nombre(lignes[lignes.length - 1].irreguliers), 'Élèves ayant manqué plus de ' + SEUIL_ABSENCES + ' classes (dernier mois)', lignes[lignes.length - 1].irreguliers ? 'attention' : '')
        ], 'grille-stats'));

        const table = el('table', { class: 'tableau grille-notes releve' });
        const nbG = RUBRIQUES.filter(r => r.groupe === 'G').length, nbS = RUBRIQUES.length - nbG;
        table.appendChild(el('thead', {}, [
          el('tr', {}, [el('th', { class: 'colle', rowspan: 2, text: 'Mois' }), el('th', { colspan: nbG, text: 'Renseignements généraux' }), el('th', { colspan: nbS, text: 'Renseignements spéciaux' })]),
          el('tr', {}, RUBRIQUES.map((r, k) => el('th', { text: (k + 1) + '. ' + r.abrege, title: r.titre })))
        ]));
        const tb = el('tbody');
        lignes.forEach(l => tb.appendChild(el('tr', {}, [el('th', { class: 'colle', text: l.libelle })].concat(RUBRIQUES.map(r => el('td', {
          class: r.pourcent && l.taux !== null && l.taux < 90 ? 'cel-calc sous-seuil' : '', text: fmt(r, l[r.cle]) }))))));
        [['Total de l’année scolaire', total], ['Moyenne générale de l’année scolaire (par rubrique)', moyenne]].forEach(([nom, v]) => tb.appendChild(el('tr', { class: 'ligne-totaux' },
          [el('th', { class: 'colle', text: nom })].concat(RUBRIQUES.map(r => el('td', { class: 'cel-calc', text: fmt(r, v[r.cle]) }))))));
        table.appendChild(tb);
        zone.appendChild(U.carte('Relevé mensuel', el('div', {}, [
          el('div', { class: 'tableau-enveloppe defilant' }, table),
          el('ul', { class: 'liste-points petit muet' }, RUBRIQUES.map((r, k) => el('li', { text: (k + 1) + '. ' + r.titre })).concat([
            el('li', { text: 'Une journée de classe compte deux demi-journées. Présences possibles = élèves × demi-journées du mois ; présences effectives = présences possibles − absences.' }),
            el('li', { text: 'Le total et la moyenne portent sur les ' + lignes.length + ' mois où des appels ont été faits, pas sur les mois à venir.' })
          ]))
        ])));

        /* Synthèse par cours */
        const niveaux = EG.NIVEAUX.filter(n => ins.some(i => i.niveau === n));
        let synthese = null;
        if (niveaux.length > 1) {
          synthese = niveaux.map(n => {
            const r = releve({ inscriptions: ins.filter(i => i.niveau === n), presences, calendrier, annee, cycle: cycleDe(n) });
            return { niveau: n, eleves: ins.filter(i => i.niveau === n).length, R: r };
          }).filter(x => x.R.lignes.length);
          if (synthese.length) {
            zone.appendChild(U.carte('Moyenne générale de l’année scolaire par cours', U.tableau([
              { titre: 'Cours', valeur: x => x.niveau + ' (' + x.eleves + ' élèves)' },
              { titre: 'Demi-journées', valeur: x => U.nombre(x.R.total.demiJournees) },
              { titre: 'Présences possibles', valeur: x => U.nombre(x.R.total.possibles) },
              { titre: 'Absences', valeur: x => U.nombre(x.R.total.absences) },
              { titre: 'Présences effectives', valeur: x => U.nombre(x.R.total.effectives) },
              { titre: '% effectives', valeur: x => x.R.total.taux === null ? '—' : x.R.total.taux + ' %' },
              { titre: 'Élèves ≤ ' + SEUIL_ABSENCES + ' classes manquées (moy. mensuelle)', valeur: x => fmt({}, x.R.moyenne.assidus) },
              { titre: 'Élèves > ' + SEUIL_ABSENCES + ' classes manquées (moy. mensuelle)', valeur: x => fmt({}, x.R.moyenne.irreguliers) }
            ], synthese)));
          }
        }

        const perimetre = classe ? nomClasse(classe) : (P.ecole ? (P.ecoles.filter(e => e.id === P.ecole)[0] || {}).nom : (session().ecole_id ? session().ecole_nom : 'Périmètre du compte'));
        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-primaire', text: 'Éditer le relevé', onclick: () => editer(R, synthese, perimetre) }),
          el('button', { class: 'btn btn-fantome', text: 'Télécharger en Excel', onclick: () => exporter(R, synthese, perimetre) })
        ]));
      });
    }

    function editer(R, synthese, perimetre) {
      const ech = EG.Docs.echapper;
      const val = (r, v) => v === null || v === undefined ? '—' : v + (r.pourcent ? ' %' : '');
      const enTete = '<tr><th rowspan="2">Mois</th><th colspan="7">Renseignements généraux</th><th colspan="3">Renseignements spéciaux</th></tr><tr>'
        + RUBRIQUES.map((r, k) => '<th>' + (k + 1) + '</th>').join('') + '</tr>';
      const corps = R.lignes.map(l => '<tr><td>' + ech(l.libelle) + '</td>' + RUBRIQUES.map(r => '<td>' + val(r, l[r.cle]) + '</td>').join('') + '</tr>').join('');
      const pied = [['Total de l’année scolaire', R.total], ['Moyenne générale de l’année scolaire', R.moyenne]].map(([n, v]) =>
        '<tr><th>' + n + '</th>' + RUBRIQUES.map(r => '<th>' + val(r, v[r.cle]) + '</th>').join('') + '</tr>').join('');
      const legende = '<ol class="petit">' + RUBRIQUES.map(r => '<li>' + ech(r.titre) + '</li>').join('') + '</ol>';
      const parCours = synthese && synthese.length ? '<h3 class="sco">Moyenne générale de l’année scolaire par cours</h3><table class="sco"><thead><tr><th>Cours</th><th>Demi-journées</th><th>Présences possibles</th><th>Absences</th><th>Présences effectives</th><th>% effectives</th></tr></thead><tbody>'
        + synthese.map(x => '<tr><td>' + ech(x.niveau) + '</td><td>' + x.R.total.demiJournees + '</td><td>' + x.R.total.possibles + '</td><td>' + x.R.total.absences + '</td><td>' + x.R.total.effectives + '</td><td>' + (x.R.total.taux === null ? '—' : x.R.total.taux + ' %') + '</td></tr>').join('') + '</tbody></table>' : '';
      EG.genererDocument('RELEVE_MENSUEL', 'Relevé mensuel de fréquentation — ' + session().annee_code,
        EG.DocsSco.titre('Relevé mensuel de fréquentation', (perimetre || '') + ' — Année scolaire ' + session().annee_code)
        + '<table class="sco"><thead>' + enTete + '</thead><tbody>' + corps + pied + '</tbody></table>' + legende
        + '<p class="muet">Une journée de classe compte deux demi-journées. Moyenne générale des présences effectives de l’année : ' + (R.tauxAnnee === null ? '—' : R.tauxAnnee + ' %') + '.</p>' + parCours,
        { classe_id: P && P.classe ? P.classe : null, ecole_id: P && P.ecole ? P.ecole : null, paysage: true });
    }

    function exporter(R, synthese, perimetre) {
      const enTete = ['Mois'].concat(RUBRIQUES.map((r, k) => (k + 1) + '. ' + r.titre));
      const lignes = [['Relevé mensuel de fréquentation — ' + (perimetre || '') + ' — ' + session().annee_code], ['', 'Renseignements généraux', '', '', '', '', '', '', 'Renseignements spéciaux'], enTete]
        .concat(R.lignes.map(l => [l.libelle].concat(RUBRIQUES.map(r => l[r.cle]))));
      lignes.push(['Total de l’année scolaire'].concat(RUBRIQUES.map(r => R.total[r.cle])));
      lignes.push(['Moyenne générale de l’année scolaire'].concat(RUBRIQUES.map(r => R.moyenne[r.cle])));
      const feuilles = [{ nom: 'Relevé mensuel', lignes }];
      if (synthese && synthese.length) {
        feuilles.push({ nom: 'Par cours', lignes: [['Cours', 'Élèves', 'Demi-journées', 'Présences possibles', 'Absences', 'Présences effectives', '% effectives']]
          .concat(synthese.map(x => [x.niveau, x.eleves, x.R.total.demiJournees, x.R.total.possibles, x.R.total.absences, x.R.total.effectives, x.R.total.taux])) });
      }
      EG.Sortie.excel('releve-mensuel-' + session().annee_code, feuilles);
    }
  });
})(window);
