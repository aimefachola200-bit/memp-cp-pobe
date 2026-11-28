/* ÉduGestion Pro — calendrier scolaire d'une circonscription.

   Rentrée, vacances, jours fériés, examens, réunions, animations pédagogiques,
   visites, formations, cérémonies : chaque circonscription tient son propre
   calendrier, en vue « mois » ou « agenda », exportable (Excel, iCalendar pour
   le téléphone, impression avec le cachet de la circonscription).

   Les jours fériés légaux se génèrent d'un clic pour l'année scolaire ; les dates
   de rentrée et de vacances, fixées chaque année par arrêté, se saisissent à la main.
   Chaque événement porte l'identifiant de sa circonscription : rien n'est partagé
   avec une autre. Le calendrier des jours ouvrables (assiduité) reste dans « Présences ». */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const sa = U.sansAccent;
  const S = () => EG.Sortie;
  const ech = s => EG.Docs.echapper(s);
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  const ROLES_GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'CONSEILLER_PEDAGOGIQUE'];
  const peutGerer = () => ROLES_GESTION.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

  /* ---------------- Dates (toujours en AAAA-MM-JJ, sans fuseau) ---------------- */

  const p2 = n => String(n).padStart(2, '0');
  const iso = (a, m0, j) => a + '-' + p2(m0 + 1) + '-' + p2(j);
  const versDate = t => { const [a, m, j] = String(t).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)); };
  const enIso = d => d.toISOString().slice(0, 10);
  const plusJours = (t, n) => { const d = versDate(t); d.setUTCDate(d.getUTCDate() + n); return enIso(d); };
  const fin = e => e.date_fin && e.date_fin >= e.date_debut ? e.date_fin : e.date_debut;
  const surJour = (e, t) => e.date_debut <= t && fin(e) >= t;
  const aujourdhui = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
  const periode = e => e.date_fin && e.date_fin > e.date_debut
    ? 'du ' + U.dateCourte(e.date_debut) + ' au ' + U.dateCourte(e.date_fin) : 'le ' + U.dateCourte(e.date_debut);

  /** Dimanche de Pâques (calcul grégorien) — sert aux jours fériés mobiles. */
  function paques(a) {
    const A = a % 19, B = Math.floor(a / 100), C = a % 100, D = Math.floor(B / 4), Ee = B % 4, F = Math.floor((B + 8) / 25),
      G = Math.floor((B - F + 1) / 3), H = (19 * A + B - D - G + 15) % 30, I = Math.floor(C / 4), K = C % 4,
      L = (32 + 2 * Ee + 2 * I - H - K) % 7, M = Math.floor((A + 11 * H + 22 * L) / 451),
      m = Math.floor((H + L - 7 * M + 114) / 31), j = ((H + L - 7 * M + 114) % 31) + 1;
    return iso(a, m - 1, j);
  }

  /** Jours fériés légaux fixes et liés à Pâques pour une année civile. Les fêtes musulmanes dépendent de la lune : à saisir. */
  function feries(a) {
    const p = paques(a);
    return [
      [iso(a, 0, 1), 'Jour de l’An'], [iso(a, 0, 10), 'Fête nationale du Vodoun'], [plusJours(p, 1), 'Lundi de Pâques'],
      [iso(a, 4, 1), 'Fête du Travail'], [plusJours(p, 39), 'Ascension'], [plusJours(p, 50), 'Lundi de Pentecôte'],
      [iso(a, 7, 1), 'Fête de l’Indépendance'], [iso(a, 7, 15), 'Assomption'], [iso(a, 10, 1), 'Toussaint'], [iso(a, 11, 25), 'Noël']
    ];
  }

  /** Bornes de l'année scolaire courante : de septembre à août. */
  function borneAnnee() {
    const m = /(\d{4})\D+(\d{4})/.exec(EG.session.annee_code || '');
    if (m) return { debut: m[1] + '-09-01', fin: m[2] + '-08-31', a1: Number(m[1]), a2: Number(m[2]) };
    const d = new Date(), a = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
    return { debut: a + '-09-01', fin: (a + 1) + '-08-31', a1: a, a2: a + 1 };
  }

  Routeur.definir('calendrier-scolaire', function (racine, args, params) {
    if (!EG.peutVoirModule('calendrier-scolaire')) { racine.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.')); return; }
    const gerer = peutGerer();
    racine.appendChild(E.entete('Calendrier scolaire',
      'Rentrée, vacances, jours fériés, examens, réunions et animations pédagogiques de la circonscription.',
      [el('button', { class: 'btn btn-fantome', text: '\uE017 Jours ouvrables (assiduité)', onclick: () => Routeur.aller('calendrier') })]));
    const zoneCs = el('div'), zoneActions = el('div', { class: 'barre-actions' }), zoneFiltres = el('div', { class: 'barre-filtres' }), zoneCorps = el('div');
    racine.appendChild(zoneCs); racine.appendChild(zoneActions); racine.appendChild(zoneFiltres); racine.appendChild(zoneCorps);

    const B = borneAnnee();
    const t0 = aujourdhui();
    const debutMois = t0 >= B.debut && t0 <= B.fin ? t0.slice(0, 7) : B.debut.slice(0, 7);
    const etat = { dep: '', cs: (args && args[0]) || (params && params.cs) || '', vue: params && params.vue === 'agenda' ? 'agenda' : 'mois', mois: debutMois, type: (params && params.type) || '' };
    let C = null, evenements = [];

    function charger() {
      return Promise.all([E.contexteCS(), E.charger('evenements_calendrier')]).then(([ctx, evs]) => {
        C = ctx; evenements = evs;
        if (etat.cs && !ctx.idsCS[etat.cs]) etat.cs = '';
        E.barreCS(zoneCs, etat, ctx, () => dessiner());
        dessiner();
      });
    }

    const evsDe = cs => evenements.filter(e => e.territoire_id === cs.id && (!etat.type || e.type === etat.type))
      .sort((a, b) => a.date_debut.localeCompare(b.date_debut) || String(a.titre).localeCompare(String(b.titre), 'fr'));

    function dessiner() {
      zoneActions.textContent = ''; zoneFiltres.textContent = ''; zoneCorps.textContent = '';
      if (!C || !C.csList.length) return;
      if (!etat.cs) { zoneCorps.appendChild(U.vide('Choisissez une circonscription pour afficher son calendrier.')); return; }
      const cs = C.index[etat.cs];

      if (gerer) {
        zoneActions.appendChild(el('button', { class: 'btn btn-primaire', text: '＋ Événement', onclick: () => formulaire(cs, null, {}) }));
        zoneActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE06C Ajouter les jours fériés', onclick: () => ajouterFeries(cs) }));
      }
      zoneActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => exporterExcel(cs) }));
      zoneActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE045 Agenda (.ics)', onclick: () => exporterIcs(cs) }));
      zoneActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer', onclick: () => sortie(cs, 'imprimer') }));
      zoneActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00D Word', onclick: () => sortie(cs, 'word') }));

      zoneFiltres.appendChild(E.barreOnglets([['mois', '\uE017 Mois'], ['agenda', '\uE00F Agenda de l’année']], etat.vue, v => { etat.vue = v; dessiner(); }));
      const types = EG.SCHEMA.evenements_calendrier.champs.filter(c => c.n === 'type')[0].o;
      zoneFiltres.appendChild(U.selecteur('Type', types.map(t => ({ value: t, label: U.libelle(t) })), etat.type,
        v => { etat.type = v; dessiner(); }, { libelleVide: 'Tous les types' }));

      const evs = evsDe(cs);
      const avenir = evs.filter(e => fin(e) >= t0).length;
      zoneCorps.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(evs.length), evs.length > 1 ? 'Événements' : 'Événement'),
        U.stat(U.nombre(avenir), 'À venir'),
        U.stat(U.nombre(evs.filter(e => e.type === 'FERIE').length), 'Jours fériés'),
        U.stat(U.nombre(evs.filter(e => e.type === 'EXAMEN').length), 'Examens')
      ]));
      if (etat.vue === 'mois') vueMois(cs, evs); else vueAgenda(cs, evs);
      zoneCorps.appendChild(el('p', { class: 'muet petit', text: 'Ce calendrier appartient à ' + cs.nom + ' : il n’apparaît dans aucune autre circonscription.' }));
    }

    /* ---------- vue mois ---------- */

    function decaler(n) {
      const [a, m] = etat.mois.split('-').map(Number);
      const d = new Date(Date.UTC(a, m - 1 + n, 1));
      etat.mois = d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1);
      dessiner();
    }

    function vueMois(cs, evs) {
      const [a, m] = etat.mois.split('-').map(Number), m0 = m - 1;
      zoneCorps.appendChild(el('div', { class: 'cal-nav' }, [
        el('button', { class: 'btn btn-fantome btn-petit', text: '\uE038', 'aria-label': 'Mois précédent', onclick: () => decaler(-1) }),
        el('strong', { class: 'cal-mois', text: MOIS[m0].replace(/^./, c => c.toUpperCase()) + ' ' + a }),
        el('button', { class: 'btn btn-fantome btn-petit', text: '\uE039', 'aria-label': 'Mois suivant', onclick: () => decaler(1) }),
        el('button', { class: 'btn btn-fantome btn-petit', text: 'Aujourd’hui', onclick: () => { etat.mois = t0.slice(0, 7); dessiner(); } })
      ]));
      const grille = el('div', { class: 'cal-grille' });
      JOURS.forEach(j => grille.appendChild(el('div', { class: 'cal-jour-nom', text: j })));
      const premier = new Date(Date.UTC(a, m0, 1)), decalage = (premier.getUTCDay() + 6) % 7;
      const nb = new Date(Date.UTC(a, m0 + 1, 0)).getUTCDate();
      for (let i = 0; i < decalage; i++) grille.appendChild(el('div', { class: 'cal-case vide' }));
      for (let j = 1; j <= nb; j++) {
        const t = iso(a, m0, j), duJour = evs.filter(e => surJour(e, t));
        const we = ((decalage + j - 1) % 7) >= 5;
        const case_ = el('div', { class: 'cal-case' + (t === t0 ? ' aujourdhui' : '') + (we ? ' we' : '') + (duJour.length ? ' avec' : '') }, [
          el('span', { class: 'cal-num', text: j })
        ]);
        duJour.slice(0, 3).forEach(e => case_.appendChild(el('button', {
          class: 'cal-ev ev-' + e.type, text: e.titre, title: e.titre + ' — ' + U.libelle(e.type),
          onclick: ev => { ev.stopPropagation(); detail(cs, e); }
        })));
        if (duJour.length > 3) case_.appendChild(el('span', { class: 'cal-plus', text: '+ ' + (duJour.length - 3) }));
        case_.addEventListener('click', () => { if (gerer) formulaire(cs, null, { date_debut: t }); else if (duJour[0]) detail(cs, duJour[0]); });
        grille.appendChild(case_);
      }
      zoneCorps.appendChild(grille);
      const ceMois = evs.filter(e => e.date_debut <= iso(a, m0, nb) && fin(e) >= iso(a, m0, 1));
      const legende = el('div', { class: 'cal-legende' });
      Array.from(new Set(ceMois.map(e => e.type))).forEach(t => legende.appendChild(el('span', { class: 'cal-ev ev-' + t, text: U.libelle(t) })));
      zoneCorps.appendChild(legende);
      if (!ceMois.length) zoneCorps.appendChild(el('p', { class: 'muet', text: 'Aucun événement ce mois-ci.' + (gerer ? ' Cliquez sur un jour pour en ajouter un.' : '') }));
      else {
        const liste = el('div', { class: 'carte' }, el('h3', { class: 'carte-titre', text: pl(ceMois.length, 'événement') + ' en ' + MOIS[m0] }));
        ceMois.forEach(e => liste.appendChild(ligne(cs, e)));
        zoneCorps.appendChild(liste);
      }
    }

    /* ---------- vue agenda ---------- */

    function vueAgenda(cs, evs) {
      const annee = evs.filter(e => fin(e) >= B.debut && e.date_debut <= B.fin);
      const hors = evs.filter(e => !(fin(e) >= B.debut && e.date_debut <= B.fin));
      if (!annee.length && !hors.length) {
        zoneCorps.appendChild(U.vide('Aucun événement pour ' + cs.nom + ' pour l’instant. ' + (gerer ? 'Ajoutez les jours fériés d’un clic, puis les dates de rentrée et de vacances.' : '')));
        return;
      }
      const parMois = {};
      annee.forEach(e => { const k = e.date_debut < B.debut ? B.debut.slice(0, 7) : e.date_debut.slice(0, 7); (parMois[k] = parMois[k] || []).push(e); });
      Object.keys(parMois).sort().forEach(k => {
        const [a, m] = k.split('-').map(Number);
        const bloc = el('div', { class: 'carte' }, el('h3', { class: 'carte-titre', text: MOIS[m - 1].replace(/^./, c => c.toUpperCase()) + ' ' + a }));
        parMois[k].forEach(e => bloc.appendChild(ligne(cs, e)));
        zoneCorps.appendChild(bloc);
      });
      if (hors.length) {
        const bloc = el('div', { class: 'carte' }, el('h3', { class: 'carte-titre', text: 'Autres années' }));
        hors.forEach(e => bloc.appendChild(ligne(cs, e)));
        zoneCorps.appendChild(bloc);
      }
    }

    function ligne(cs, e) {
      return el('div', { class: 'ecole-ligne' }, [
        el('div', { class: 'ecole-info' }, [
          el('strong', { text: e.titre }), ' ', el('span', { class: 'cal-ev ev-' + e.type, text: U.libelle(e.type) }),
          e.cycle && e.cycle !== 'ENSEMBLE' ? ' ' : null, e.cycle && e.cycle !== 'ENSEMBLE' ? U.badge(U.libelle(e.cycle), 'neutre') : null,
          el('div', { class: 'muet petit', text: [periode(e), e.lieu].filter(Boolean).join(' · ') }),
          e.description ? el('div', { class: 'muet petit', text: e.description }) : null
        ]),
        gerer ? el('div', { class: 'actions-mini' }, [
          el('button', { class: 'btn btn-fantome btn-petit', text: 'Modifier', onclick: () => formulaire(cs, e, {}) }),
          el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: 'Supprimer', onclick: () => supprimer(e) })
        ]) : null
      ]);
    }

    function detail(cs, e) {
      U.modal(e.titre, el('div', {}, [
        el('p', {}, [el('span', { class: 'cal-ev ev-' + e.type, text: U.libelle(e.type) }), ' ' + periode(e)]),
        e.lieu ? el('p', { text: 'Lieu : ' + e.lieu }) : null,
        e.description ? el('p', { text: e.description }) : null,
        e.cycle && e.cycle !== 'ENSEMBLE' ? el('p', { class: 'muet', text: 'Concerne : ' + U.libelle(e.cycle) }) : null
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer }),
        gerer ? el('button', { class: 'btn btn-primaire', text: 'Modifier', onclick: () => { fermer(); formulaire(cs, e, {}); } }) : null
      ].filter(Boolean));
    }

    /* ---------- saisie ---------- */

    function formulaire(cs, rec, prefill) {
      E.refsPour('evenements_calendrier').then(refs => {
        const valeurs = Object.assign({ type: 'AUTRE', cycle: 'ENSEMBLE', annee_scolaire_id: EG.session.annee_id || null },
          rec || Object.assign({ territoire_id: cs.id }, prefill));
        const form = U.formulaire('evenements_calendrier', valeurs, refs, { masquer: ['territoire_id', 'annee_scolaire_id'] });
        const erreurs = el('div', { class: 'erreurs' });
        U.modal(rec ? 'Modifier l’événement' : 'Ajouter un événement — ' + cs.nom, [erreurs, form], fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
          el('button', {
            class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
              const lu = form.lire(); erreurs.textContent = '';
              const v = lu.valeurs, errs = lu.erreurs.slice();
              if (v.date_debut && v.date_fin && v.date_fin < v.date_debut) errs.push('La date de fin ne peut pas précéder la date de début.');
              if (errs.length) { errs.forEach(m => erreurs.appendChild(el('p', { text: m }))); return; }
              v.territoire_id = cs.id;
              if (!v.date_fin) v.date_fin = null;
              fermer();
              DB.put('evenements_calendrier', v).then(r => DB.audit(rec ? 'MODIFICATION' : 'CREATION', 'evenements_calendrier', r.id))
                .then(() => { U.toast('Événement enregistré'); if (v.date_debut) etat.mois = v.date_debut.slice(0, 7); EG.majSynchro(); charger(); });
            }
          })
        ]);
      });
    }

    function supprimer(e) {
      U.confirmer('Supprimer cet événement', 'Supprimer « ' + e.titre + ' » du calendrier ?', () => {
        DB.remove('evenements_calendrier', e.id).then(() => DB.audit('SUPPRESSION', 'evenements_calendrier', e.id))
          .then(() => { U.toast('Événement supprimé'); EG.majSynchro(); charger(); });
      }, 'Supprimer');
    }

    function ajouterFeries(cs) {
      const existants = {}; evenements.filter(e => e.territoire_id === cs.id).forEach(e => { existants[e.date_debut + sa(e.titre)] = true; });
      const nouveaux = [];
      [B.a1, B.a2].forEach(a => feries(a).forEach(([t, titre]) => {
        if (t < B.debut || t > B.fin || existants[t + sa(titre)]) return;
        nouveaux.push({ titre, type: 'FERIE', date_debut: t, date_fin: null, cycle: 'ENSEMBLE', territoire_id: cs.id, annee_scolaire_id: EG.session.annee_id || null });
      }));
      if (!nouveaux.length) { U.toast('Les jours fériés de l’année sont déjà dans le calendrier', 'attention'); return; }
      U.confirmer('Ajouter les jours fériés', nouveaux.length + ' jour(s) férié(s) légaux de ' + B.a1 + '-' + B.a2 + ' seront ajoutés au calendrier de ' + cs.nom
        + '. Les fêtes musulmanes (Aïd el-Fitr, Tabaski, Maouloud) dépendent de la lune : ajoutez-les à la main quand la date est connue.', () => {
        DB.putBatch('evenements_calendrier', nouveaux).then(() => DB.audit('CREATION', 'evenements_calendrier', null, { feries: nouveaux.length, cs: cs.nom }))
          .then(() => { U.toast(pl(nouveaux.length, 'jour') + ' férié(s) ajouté(s)'); EG.majSynchro(); charger(); });
      }, 'Ajouter');
    }

    /* ---------- exports ---------- */

    function exporterExcel(cs) {
      S().excel('calendrier-scolaire-' + S().slug(cs.nom).slice(0, 30), [{
        nom: 'Calendrier', lignes: [['Événement', 'Type', 'Du', 'Au', 'Cycle', 'Lieu', 'Détails']]
          .concat(evsDe(cs).map(e => [e.titre, U.libelle(e.type), U.dateCourte(e.date_debut), U.dateCourte(fin(e)), U.libelle(e.cycle || 'ENSEMBLE'), e.lieu || '', e.description || '']))
      }]);
    }

    function exporterIcs(cs) {
      const esc = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ÉduGestion Pro//Calendrier scolaire//FR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc('Calendrier scolaire — ' + cs.nom)];
      evsDe(cs).forEach(e => l.push('BEGIN:VEVENT', 'UID:' + e.id + '@edugestion', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + e.date_debut.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + plusJours(fin(e), 1).replace(/-/g, ''),
        'SUMMARY:' + esc(e.titre), 'CATEGORIES:' + esc(U.libelle(e.type)), e.lieu ? 'LOCATION:' + esc(e.lieu) : null,
        e.description ? 'DESCRIPTION:' + esc(e.description) : null, 'END:VEVENT'));
      l.push('END:VCALENDAR');
      S().enregistrer('calendrier-scolaire-' + S().slug(cs.nom).slice(0, 30) + '.ics',
        new Blob([l.filter(Boolean).join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
    }

    function corpsDocument(cs) {
      const evs = evsDe(cs);
      const visa = EG.Docs.visaTerritoire ? EG.Docs.visaTerritoire(cs, 'Le Chef de la circonscription scolaire') : '';
      return '<h2 style="text-align:center">Calendrier scolaire ' + ech(EG.session.annee_code || '') + ' — ' + ech(cs.nom) + '</h2>'
        + (evs.length ? '<table><thead><tr><th>Date</th><th>Événement</th><th>Type</th><th>Lieu</th><th>Observations</th></tr></thead><tbody>'
          + evs.map(e => '<tr><td>' + ech(e.date_fin && e.date_fin > e.date_debut ? 'Du ' + U.dateCourte(e.date_debut) + ' au ' + U.dateCourte(e.date_fin) : U.dateCourte(e.date_debut))
            + '</td><td>' + ech(e.titre) + '</td><td>' + ech(U.libelle(e.type)) + '</td><td>' + ech(e.lieu || '') + '</td><td>' + ech(e.description || '') + '</td></tr>').join('')
          + '</tbody></table>' : '<p>Aucun événement enregistré.</p>')
        + visa;
    }

    function sortie(cs, mode) {
      const dep = EG.Perimetre.ancetre(C.index, cs.id, 'DEPARTEMENT');
      const pseudo = { nom: '', territoire_id: cs.id, departement_id: dep ? dep.id : null };
      if (mode === 'imprimer') S().imprimer('Calendrier scolaire — ' + cs.nom, () => corpsDocument(cs), { ecole: pseudo });
      else S().word('calendrier-scolaire-' + S().slug(cs.nom).slice(0, 30), 'Calendrier scolaire — ' + cs.nom, () => corpsDocument(cs), { ecole: pseudo });
    }

    charger();
  });
})(window);
