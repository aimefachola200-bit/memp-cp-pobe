/* Deux modules du primaire repris de GESCOL / Scolaris :
   1. « Annonces au personnel » : la direction écrit aux enseignants (ou à tout le personnel) ; chacun les lit et la direction voit qui a lu.
   2. « Relevé mensuel des présences » : tableau de relevés mensuels par classe (jours de classe, absences justifiées et non justifiées, présences, taux),
      calculé à partir de la présence des apprenants. Règles : 2 demi-journées du lundi au vendredi sauf le mercredi (1) ; 0 le week-end ;
      0 pour les jours non ouvrables du calendrier scolaire (congés, fériés) ; un samedi ouvrable du calendrier compte pour son coefficient (1 par défaut).
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, E = EG.Ecrans;
  const el = U.el;
  const DIR = ['DIRECTEUR', 'ADMIN_MEMP', 'ADMIN_TECHNIQUE'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const SCOL = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const champ = (l, c) => el('div', { class: 'champ' }, [el('label', { text: l }), c]);
  const dfr = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR'); };

  /* ---------------- annonces au personnel ---------------- */
  function annonces(racine) {
    const u = EG.session.user, ecole = EG.session.ecole_id, direction = DIR.indexOf(u.role) >= 0, ecr = EG.peutEcrire();
    racine.appendChild(E.entete('Annonces au personnel', 'La direction écrit aux enseignants ; chacun lit ses annonces et la direction voit qui les a lues.'));
    if (!ecole) { racine.appendChild(U.vide('Ouvrez la session d’une école pour lire ou publier des annonces.')); return; }
    const zone = el('div'); racine.appendChild(zone);
    const visible = (a) => direction || a.cible === 'TOUS' || a.cible === 'ENSEIGNANTS';
    function dessiner() {
      zone.textContent = '';
      Promise.all([DB.all('annonces_personnel'), DB.all('users')]).then(([l, us]) => {
        const liste = l.filter(a => a.ecole_id === ecole && visible(a)).sort((a, b) => String(b.date_publication || '').localeCompare(String(a.date_publication || '')));
        const dest = us.filter(x => x.ecole_id === ecole && x.role === 'ENSEIGNANT' && x.actif !== false).length;
        if (direction && ecr) zone.appendChild(el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-primaire', text: '＋ Nouvelle annonce', onclick: () => nouvelle() })]));
        if (!liste.length) { zone.appendChild(U.vide('Aucune annonce.')); return; }
        liste.forEach(a => {
          const lus = Array.isArray(a.lus) ? a.lus : [], lue = lus.indexOf(u.id) >= 0;
          const carte = U.carte((lue || direction ? '' : '● Nouveau — ') + a.sujet, el('div', {}, [
            el('p', { class: 'muet petit', text: dfr(a.date_publication) + ' · ' + (a.cible === 'TOUS' ? 'Tout le personnel' : 'Enseignants') + (a.auteur_nom ? ' · ' + a.auteur_nom : '') }),
            el('p', { text: a.texte, style: 'white-space:pre-wrap' }),
            direction ? el('p', { class: 'muet petit', text: 'Lue par ' + lus.filter(i => i !== u.id).length + ' / ' + dest + ' enseignant(s)' }) : '',
            el('div', { class: 'actions-mini' }, [
              !direction && !lue && ecr ? el('button', { class: 'btn btn-petit btn-primaire', text: 'Marquer comme lue', onclick: () => DB.put('annonces_personnel', Object.assign({}, a, { lus: lus.concat([u.id]) }), { silencieux: true }).then(() => { EG.majSynchro(); dessiner(); }) }) : '',
              direction && ecr ? el('button', { class: 'btn btn-petit btn-fantome btn-alerte', text: 'Supprimer', onclick: () => U.confirmer('Supprimer l’annonce', 'Supprimer « ' + a.sujet + ' » ?', () => DB.remove('annonces_personnel', a.id).then(() => { EG.majSynchro(); dessiner(); })) }) : ''])]));
          zone.appendChild(carte);
        });
      });
    }
    function nouvelle() {
      const s = el('input', { type: 'text', maxlength: '120' }), t = el('textarea', { rows: 6 }), c = el('select', {}, [el('option', { value: 'ENSEIGNANTS', text: 'Enseignants' }), el('option', { value: 'TOUS', text: 'Tout le personnel' })]);
      U.modal('Nouvelle annonce', el('div', { class: 'formulaire' }, [champ('Sujet', s), champ('Destinataires', c), champ('Texte', t)]), fermer => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', { class: 'btn btn-primaire', text: 'Publier', onclick: () => {
          if (!s.value.trim() || !t.value.trim()) { U.toast('Sujet et texte obligatoires', 'attention'); return; }
          DB.put('annonces_personnel', { ecole_id: ecole, sujet: s.value.trim(), texte: t.value.trim(), cible: c.value, auteur_nom: ((u.nom || '') + ' ' + (u.prenoms || '')).trim() || u.identifiant, date_publication: new Date().toISOString(), lus: [] }).then(() => { fermer(); EG.majSynchro(); U.toast('Annonce publiée'); dessiner(); });
        } })]);
    }
    dessiner();
  }

  /* ---------------- relevé mensuel des présences ---------------- */
  function demiJournees(date, exceptions) {
    const j = date.getDay(), iso = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    const ex = exceptions[iso];
    if (ex) { if (ex.ouvrable === false) return 0; if (j === 0 || j === 6) return Math.min(2, Number(ex.coefficient) || 1); }
    if (j === 0 || j === 6) return 0; return j === 3 ? 1 : 2;
  }
  function releves(racine) {
    const u = EG.session.user, ecole = EG.session.ecole_id, annee = EG.session.annee_id;
    racine.appendChild(E.entete('Relevé mensuel des présences', 'Tableau de relevés mensuels par classe : jours de classe, absences, présences et taux.'));
    if (!ecole) { racine.appendChild(U.vide('Ouvrez la session d’une école.')); return; }
    const zone = el('div'), F = { classe: '', mois: SCOL.indexOf(new Date().getMonth() + 1) >= 0 ? new Date().getMonth() + 1 : 9 };
    racine.appendChild(zone);
    function dessiner() {
      zone.textContent = '';
      Promise.all([DB.all('classes'), DB.all('inscriptions_eleves'), DB.all('eleves'), DB.all('presences'), DB.all('calendriers_scolaires'), DB.all('annees_scolaires')]).then(([cl, ins, el0, pr, cal, ans]) => {
        let classes = cl.filter(c => c.ecole_id === ecole && c.annee_scolaire_id === annee).sort((a, b) => String(a.libelle || a.niveau).localeCompare(String(b.libelle || b.niveau), 'fr'));
        if (u.role === 'ENSEIGNANT' && u.classe_id) classes = classes.filter(c => c.id === u.classe_id);
        if (!classes.length) { zone.appendChild(U.vide('Aucune classe pour l’année en cours.')); return; }
        if (!classes.some(c => c.id === F.classe)) F.classe = classes[0].id;
        const c = classes.find(x => x.id === F.classe), nomC = (x) => x.libelle || x.code || x.niveau;
        const sc = el('select', {}, classes.map(x => el('option', { value: x.id, text: nomC(x) }))); sc.value = F.classe; sc.addEventListener('change', () => { F.classe = sc.value; dessiner(); });
        const sm = el('select', {}, SCOL.map(m => el('option', { value: m, text: MOIS[m - 1] }))); sm.value = String(F.mois); sm.addEventListener('change', () => { F.mois = Number(sm.value); dessiner(); });
        zone.appendChild(el('div', { class: 'sec-fil' }, [el('label', {}, ['Classe', sc]), el('label', {}, ['Mois', sm])]));
        const an = ans.find(a => a.id === annee) || {}, a0 = parseInt(String(an.code || an.libelle || '').slice(0, 4), 10) || new Date().getFullYear(), an1 = F.mois >= 9 ? a0 : a0 + 1;
        const exc = {}; cal.filter(x => !x.annee_scolaire_id || x.annee_scolaire_id === annee).forEach(x => { exc[x.date_jour] = x; });
        let dj = 0; const n = new Date(an1, F.mois, 0).getDate(), pref = an1 + '-' + String(F.mois).padStart(2, '0') + '-', joursMap = {};
        for (let d = 1; d <= n; d++) { const v = demiJournees(new Date(an1, F.mois - 1, d), exc); joursMap[pref + String(d).padStart(2, '0')] = v; dj += v; }
        const eleves = ins.filter(i => i.classe_id === c.id && i.statut === 'ACTIF').map(i => ({ i, e: el0.find(x => x.id === i.eleve_id) || {} })).sort((a, b) => ((a.e.nom || '') + (a.e.prenoms || '')).localeCompare((b.e.nom || '') + (b.e.prenoms || ''), 'fr'));
        const lignes = eleves.map(x => { let aj = 0, anj = 0, ret = 0; pr.filter(p => p.inscription_id === x.i.id && String(p.date_presence || '').indexOf(pref) === 0).forEach(p => { const max = joursMap[p.date_presence] || 0; if (!max) return;
            if (p.statut === 'ABSENT') { const v = p.periode === 'JOURNEE' ? max : 1; if (p.justifie) aj += v; else anj += v; } else if (p.statut === 'RETARD') ret++; });
          const abs = Math.min(dj, aj + anj); return { x, aj, anj, abs, ret, pres: Math.max(0, dj - abs), taux: dj ? Math.round(1000 * Math.max(0, dj - abs) / dj) / 10 : null }; });
        zone.appendChild(el('div', { class: 'sec-per', text: nomC(c) + ' — ' + MOIS[F.mois - 1] + ' ' + an1 + ' : ' + dj + ' demi-journées de classe (' + (dj / 2) + ' jours).' }));
        const g = (s) => lignes.filter(l => (l.x.e.sexe || '') === s).length;
        const cols = [{ titre: 'N°', valeur: l => lignes.indexOf(l) + 1 }, { titre: 'Nom et prénoms', valeur: l => ((l.x.e.nom || '') + ' ' + (l.x.e.prenoms || '')).trim() }, { titre: 'Sexe', valeur: l => l.x.e.sexe || '' },
          { titre: 'Abs. justifiées', valeur: l => l.aj }, { titre: 'Abs. non justifiées', valeur: l => l.anj }, { titre: 'Total absences (½ j)', valeur: l => l.abs }, { titre: 'Retards', valeur: l => l.ret }, { titre: 'Présences (½ j)', valeur: l => l.pres }, { titre: 'Taux de présence', valeur: l => l.taux == null ? '—' : String(l.taux).replace('.', ',') + ' %' }];
        zone.appendChild(U.carte('Relevé — ' + nomC(c) + ' (' + lignes.length + ' élèves : ' + g('M') + ' G / ' + g('F') + ' F)', U.tableau(cols, lignes, { messageVide: 'Aucun élève actif dans cette classe.' })));
        if (lignes.length) {
          const sum = (k) => lignes.reduce((s, l) => s + l[k], 0), moy = dj && lignes.length ? Math.round(1000 * sum('pres') / (dj * lignes.length)) / 10 : null;
          zone.appendChild(el('p', { class: 'muet', text: 'Totaux : ' + sum('aj') + ' absences justifiées, ' + sum('anj') + ' non justifiées, ' + sum('ret') + ' retards. Taux moyen de présence : ' + (moy == null ? '—' : String(moy).replace('.', ',') + ' %') + '.' }));
          const st = 'border:1px solid #444;padding:3px 6px;font-size:12px';
          const html = '<div style="font-family:Arial,sans-serif"><div style="text-align:center"><b>RÉPUBLIQUE DU BÉNIN</b><br><b>' + esc(EG.session.ecole_nom || '') + '</b></div><h2 style="text-align:center">TABLEAU DE RELEVÉS MENSUELS</h2><p>Classe : <b>' + esc(nomC(c)) + '</b> — Mois : <b>' + MOIS[F.mois - 1] + ' ' + an1 + '</b> — Demi-journées de classe : <b>' + dj + '</b></p><table style="width:100%;border-collapse:collapse"><tr>'
            + cols.map(x => '<th style="' + st + '">' + esc(x.titre) + '</th>').join('') + '</tr>' + lignes.map(l => '<tr>' + cols.map(x => '<td style="' + st + '">' + esc(x.valeur(l)) + '</td>').join('') + '</tr>').join('')
            + '</table><table style="width:100%;margin-top:30px"><tr><td style="text-align:center">Le maître</td><td style="text-align:center">Le Directeur</td></tr></table></div>';
          zone.appendChild(el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-primaire', text: 'Imprimer le relevé (PDF)', onclick: () => EG.Sortie.imprimer('Relevé mensuel — ' + nomC(c) + ' — ' + MOIS[F.mois - 1], html, { paysage: false }) })]));
        }
      });
    }
    dessiner();
  }

  const route = (code, fn) => U.Routeur.definir(code, function (racine) {
    if (!EG.peutVoirModule(code)) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; } fn(racine);
  });
  route('annonces-personnel', annonces);
  route('releves-mensuels', releves);
  EG.RelevesMensuels = { demiJournees };
})(window);
