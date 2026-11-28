/* Maître de semaine — planning annuel des maîtres de semaine (avec rotation automatique), journal quotidien de la vie de l'école,
   visa du directeur, rapport hebdomadaire imprimable et historique. Repris de GESCOL / Scolaris (édition publique).
   Droits : l'enseignant (maître de semaine) tient le journal ; la direction établit le planning et vise ; un jour visé n'est plus modifiable que par la direction.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, E = EG.Ecrans;
  const el = U.el;
  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const ETATS = ['Bon', 'Passable', 'Mauvais'], SALUT = ['Effectué', 'Non effectué', 'Sans objet'];
  const ACTIV = ['Sport / EPS', 'Coopérative scolaire', 'Assainissement', 'Cantine', 'Jardin / champ scolaire', 'Santé / hygiène', 'Activités culturelles', 'Réunion / conseil des maîtres', 'Autre'];
  const DIR = ['DIRECTEUR', 'ADMIN_MEMP', 'ADMIN_TECHNIQUE'];
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dateDe = (s) => { const [a, m, j] = s.split('-').map(Number); return new Date(a, m - 1, j); };
  const lundiDe = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const ajoute = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
  const long = (s) => { const d = dateDe(s); return JOURS[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear(); };
  const court = (s) => { const d = dateDe(s); return d.getDate() + ' ' + MOIS[d.getMonth()]; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const champ = (l, c) => el('div', { class: 'champ' }, [el('label', { text: l }), c]);
  const sel = (vals, v, vide) => { const s = el('select', {}, (vide ? [el('option', { value: '', text: '—' })] : []).concat(vals.map(x => el('option', { value: x, text: x })))); s.value = v || ''; return s; };
  const nomAgent = (p) => ((p.nom || '').toUpperCase() + ' ' + (p.prenoms || '')).trim();

  function monter(racine) {
    const u = EG.session.user, ecole = EG.session.ecole_id, annee = EG.session.annee_id;
    const direction = DIR.indexOf(u.role) >= 0, ecr = EG.peutEcrire();
    racine.appendChild(E.entete('Maître de semaine', 'Planning des maîtres de semaine, journal quotidien de l’école, visa du directeur et rapport hebdomadaire.'));
    if (!ecole) { racine.appendChild(U.vide('Ouvrez la session d’une école pour tenir le journal du maître de semaine.')); return; }
    const F = { onglet: 'semaine', lundi: iso(lundiDe(new Date())) };
    const ONG = [['semaine', 'Semaine'], ['planning', 'Planning annuel'], ['historique', 'Historique']];
    const barre = el('div', { class: 'sec-ong', role: 'tablist' }), zone = el('div');
    racine.appendChild(barre); racine.appendChild(zone);
    const charger = () => Promise.all([DB.all('ms_planning'), DB.all('ms_journal'), DB.all('personnels')]).then(([pl, jo, pe]) => ({
      plan: pl.filter(x => x.ecole_id === ecole), jour: jo.filter(x => x.ecole_id === ecole), pers: pe.filter(x => !x.ecole_id || x.ecole_id === ecole) }));
    function dessiner() {
      barre.textContent = '';
      ONG.forEach(([id, l]) => { const b = el('button', { type: 'button', role: 'tab', 'aria-selected': id === F.onglet ? 'true' : 'false', text: l }); b.addEventListener('click', () => { F.onglet = id; dessiner(); }); barre.appendChild(b); });
      zone.textContent = ''; charger().then(D => ({ semaine, planning, historique })[F.onglet](D)).catch(e => { console.error(e); zone.appendChild(U.vide('Écran indisponible.')); });
    }
    const maitreDe = (D, lundi) => { const p = D.plan.find(x => x.lundi === lundi); return p ? p.maitre_nom || '' : ''; };

    /* ---- Semaine ---- */
    function semaine(D) {
      const l0 = dateDe(F.lundi), nav = el('div', { class: 'barre-actions' }, [
        el('button', { class: 'btn btn-fantome', text: '‹ Semaine précédente', onclick: () => { F.lundi = iso(ajoute(l0, -7)); dessiner(); } }),
        el('strong', { text: 'Semaine du ' + court(F.lundi) + ' au ' + court(iso(ajoute(l0, 5))) + ' ' + ajoute(l0, 5).getFullYear() }),
        el('button', { class: 'btn btn-fantome', text: 'Semaine suivante ›', onclick: () => { F.lundi = iso(ajoute(l0, 7)); dessiner(); } }),
        el('button', { class: 'btn btn-fantome', text: 'Cette semaine', onclick: () => { F.lundi = iso(lundiDe(new Date())); dessiner(); } })]);
      zone.appendChild(nav);
      const maitre = maitreDe(D, F.lundi);
      zone.appendChild(el('div', { class: 'sec-per', text: maitre ? 'Maître de semaine : ' + maitre : 'Aucun maître de semaine désigné pour cette semaine (onglet « Planning annuel »).' }));
      const lignes = JOURS.map((j, i) => { const d = iso(ajoute(l0, i)); return { d, j, e: D.jour.find(x => x.date === d) }; });
      zone.appendChild(U.carte('Journal de la semaine', U.tableau([
        { titre: 'Jour', valeur: x => x.j + ' ' + court(x.d) }, { titre: 'Arrivée', valeur: x => x.e ? x.e.heure_arrivee || '—' : '' },
        { titre: 'Absents (G/F)', valeur: x => x.e ? (x.e.abs_g || 0) + ' / ' + (x.e.abs_f || 0) : '' }, { titre: 'Retards (G/F)', valeur: x => x.e ? (x.e.ret_g || 0) + ' / ' + (x.e.ret_f || 0) : '' },
        { titre: 'Discipline', valeur: x => x.e ? x.e.discipline_etat || '—' : '' }, { titre: 'Visa', valeur: x => x.e ? (x.e.visa_le ? el('span', {}, [U.badge('Visé', 'ok')]) : U.badge('À viser', 'attention')) : U.badge('Non rempli', 'neutre') },
        { titre: '', valeur: x => { const verrou = x.e && x.e.visa_le && !direction; const b = [];
            if (ecr && !verrou) b.push(el('button', { class: 'btn btn-petit btn-primaire', text: x.e ? 'Modifier' : 'Remplir', onclick: () => fiche(D, x.d, x.e, maitre) }));
            else if (x.e) b.push(el('button', { class: 'btn btn-petit btn-fantome', text: 'Voir', onclick: () => fiche(D, x.d, x.e, maitre, true) }));
            if (direction && x.e) b.push(el('button', { class: 'btn btn-petit btn-fantome', text: x.e.visa_le ? 'Retirer le visa' : 'Viser', onclick: () => DB.put('ms_journal', Object.assign({}, x.e, x.e.visa_le ? { visa_le: null, visa_nom: null } : { visa_le: new Date().toISOString(), visa_nom: u.nom || u.identifiant })).then(() => { EG.majSynchro(); dessiner(); }) }));
            return el('span', { class: 'actions-mini' }, b); } }
      ], lignes, {})));
      zone.appendChild(el('div', { class: 'barre-actions' }, [
        direction ? el('button', { class: 'btn btn-fantome', text: 'Viser toute la semaine', onclick: () => Promise.all(lignes.filter(x => x.e && !x.e.visa_le).map(x => DB.put('ms_journal', Object.assign({}, x.e, { visa_le: new Date().toISOString(), visa_nom: u.nom || u.identifiant })))).then(() => { EG.majSynchro(); U.toast('Semaine visée'); dessiner(); }) }) : '',
        el('button', { class: 'btn btn-primaire', text: 'Rapport hebdomadaire (imprimer / PDF)', onclick: () => EG.Sortie.imprimer('Rapport du maître de semaine — ' + court(F.lundi), rapport(D, lignes, maitre), { paysage: false }) })]));
    }
    function fiche(D, date, e, maitre, lecture) {
      const v = e || {}, num = (x) => el('input', { type: 'number', min: '0', value: v[x] != null ? v[x] : '', style: 'width:90px' }), txt = (x, r) => el('textarea', { rows: r || 2, value: v[x] || '' });
      const h = el('input', { type: 'time', value: v.heure_arrivee || '' }), sal = sel(SALUT, v.salut_couleurs), pc = sel(ETATS, v.proprete_cour, 1), pcl = sel(ETATS, v.proprete_classes, 1), dis = sel(ETATS, v.discipline_etat, 1);
      const ag = num('abs_g'), af = num('abs_f'), rg = num('ret_g'), rf = num('ret_f'), ai = txt('absences_ens'), ri = txt('retards_ens'), vi = txt('visites'), inc = txt('incidents'), ob = txt('observations', 3), dd = txt('discipline');
      const acts = (v.activites || []).slice(), cases = ACTIV.map(a => { const c = el('input', { type: 'checkbox' }); c.checked = acts.indexOf(a) >= 0; return { a, c }; });
      const corps = el('div', { class: 'formulaire' }, [el('p', { class: 'muet petit', text: long(date) + (maitre ? ' — maître de semaine : ' + maitre : '') }), champ('Heure d’arrivée du maître', h), champ('Salut des couleurs', sal),
        champ('Propreté de la cour', pc), champ('Propreté des classes', pcl), champ('Discipline générale', dis), champ('Élèves absents — garçons', ag), champ('Élèves absents — filles', af), champ('Élèves en retard — garçons', rg), champ('Élèves en retard — filles', rf),
        champ('Absences d’enseignants', ai), champ('Retards d’enseignants', ri), champ('Cas de discipline', dd), champ('Visites reçues', vi), champ('Incidents', inc),
        champ('Activités du jour', el('div', {}, cases.map(x => el('label', { style: 'display:block' }, [x.c, ' ' + x.a])))), champ('Observations', ob)]);
      if (lecture) corps.querySelectorAll('input,select,textarea').forEach(x => { x.disabled = true; });
      U.modal('Journal du ' + court(date), corps, fermer => [el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer })].concat(lecture ? [] : [el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
        const n = (x) => x.value === '' ? 0 : Number(x.value);
        DB.put('ms_journal', Object.assign({}, v, { ecole_id: ecole, annee_scolaire_id: annee, date, lundi: F.lundi, maitre_nom: maitre || v.maitre_nom || u.nom || '', heure_arrivee: h.value, salut_couleurs: sal.value, proprete_cour: pc.value, proprete_classes: pcl.value, discipline_etat: dis.value,
          abs_g: n(ag), abs_f: n(af), ret_g: n(rg), ret_f: n(rf), absences_ens: ai.value, retards_ens: ri.value, discipline: dd.value, visites: vi.value, incidents: inc.value, observations: ob.value, activites: cases.filter(x => x.c.checked).map(x => x.a), saisi_par: u.id }))
          .then(() => { fermer(); EG.majSynchro(); U.toast('Journal enregistré'); dessiner(); });
      } })]));
    }
    function rapport(D, lignes, maitre) {
      const st = 'border:1px solid #444;padding:4px 6px;font-size:12px;vertical-align:top';
      const ligs = lignes.map(x => x.e ? '<tr><td style="' + st + '"><b>' + x.j + ' ' + court(x.d) + '</b></td><td style="' + st + '">' + esc(x.e.heure_arrivee) + '<br>Couleurs : ' + esc(x.e.salut_couleurs) + '</td><td style="' + st + '">Cour : ' + esc(x.e.proprete_cour) + '<br>Classes : ' + esc(x.e.proprete_classes) + '</td><td style="' + st + '">Abs. ' + (x.e.abs_g || 0) + 'G/' + (x.e.abs_f || 0) + 'F<br>Ret. ' + (x.e.ret_g || 0) + 'G/' + (x.e.ret_f || 0) + 'F</td><td style="' + st + '">' + esc([x.e.discipline_etat, x.e.discipline, x.e.incidents, x.e.absences_ens && 'Abs. ens. : ' + x.e.absences_ens, x.e.retards_ens && 'Ret. ens. : ' + x.e.retards_ens, x.e.visites && 'Visites : ' + x.e.visites, (x.e.activites || []).join(', '), x.e.observations].filter(Boolean).join(' — ')) + '</td><td style="' + st + '">' + (x.e.visa_le ? 'Visé' : '') + '</td></tr>'
        : '<tr><td style="' + st + '"><b>' + x.j + ' ' + court(x.d) + '</b></td><td style="' + st + '" colspan="5"><i>Non renseigné</i></td></tr>').join('');
      return '<div style="font-family:Arial,sans-serif"><div style="text-align:center"><b>RÉPUBLIQUE DU BÉNIN</b><br><b>' + esc(EG.session.ecole_nom || '') + '</b></div><h2 style="text-align:center">RAPPORT HEBDOMADAIRE DU MAÎTRE DE SEMAINE</h2><p>Semaine du ' + long(F.lundi) + ' — Maître de semaine : <b>' + esc(maitre) + '</b></p>'
        + '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="' + st + '">Jour</th><th style="' + st + '">Arrivée / couleurs</th><th style="' + st + '">Propreté</th><th style="' + st + '">Élèves</th><th style="' + st + '">Vie de l’école</th><th style="' + st + '">Visa</th></tr></thead><tbody>' + ligs + '</tbody></table>'
        + '<table style="width:100%;margin-top:30px"><tr><td style="text-align:center">Le maître de semaine</td><td style="text-align:center">Le Directeur</td></tr></table></div>';
    }

    /* ---- Planning annuel ---- */
    function planning(D) {
      const ens = D.pers.filter(p => !p.statut_agent || /ENSEIGN|INSTIT|MAITRE|DIRECT/i.test(p.fonction || p.statut_agent || p.poste || 'ENSEIGNANT')).map(nomAgent).sort((a, b) => a.localeCompare(b, 'fr'));
      const debut = el('input', { type: 'date', value: F.debut || iso(lundiDe(new Date())) }), nb = el('input', { type: 'number', min: '1', max: '45', value: F.nb || 36, style: 'width:80px' });
      const maitres = el('textarea', { rows: 4, placeholder: 'Un nom par ligne (vide : tout le personnel enseignant enregistré)', value: F.maitres || '' });
      if (direction || ecr) zone.appendChild(U.carte('Rotation automatique', el('div', { class: 'formulaire' }, [champ('Premier lundi', debut), champ('Nombre de semaines', nb), champ('Maîtres (ordre de passage)', maitres),
        el('button', { class: 'btn btn-primaire', text: 'Générer le planning', onclick: () => {
          const liste = maitres.value.split('\n').map(x => x.trim()).filter(Boolean), roule = liste.length ? liste : ens; if (!roule.length) { U.toast('Aucun maître : saisissez des noms ou enregistrez le personnel', 'attention'); return; }
          F.debut = debut.value; F.nb = nb.value; F.maitres = maitres.value; const l0 = lundiDe(dateDe(debut.value)), rows = [];
          for (let i = 0; i < Number(nb.value || 0); i++) { const lu = iso(ajoute(l0, 7 * i)); if (!D.plan.some(x => x.lundi === lu)) rows.push({ ecole_id: ecole, annee_scolaire_id: annee, lundi: lu, maitre_nom: roule[i % roule.length] }); }
          DB.putBatch('ms_planning', rows).then(() => { EG.majSynchro(); U.toast(rows.length + ' semaine(s) planifiée(s)'); dessiner(); });
        } })])));
      const tri = D.plan.slice().sort((a, b) => a.lundi.localeCompare(b.lundi));
      zone.appendChild(U.carte('Planning (' + tri.length + ' semaines)', U.tableau([{ titre: 'Semaine du', valeur: p => long(p.lundi) }, { titre: 'Maître de semaine', valeur: p => p.maitre_nom || '—' },
        { titre: '', valeur: p => (direction || ecr) ? el('span', { class: 'actions-mini' }, [el('button', { class: 'btn btn-petit btn-fantome', text: 'Changer', onclick: () => { const i = el('input', { type: 'text', value: p.maitre_nom || '', list: 'ms-ens' }); U.modal('Maître de la semaine du ' + court(p.lundi), el('div', { class: 'formulaire' }, [champ('Nom', i), el('datalist', { id: 'ms-ens' }, ens.map(x => el('option', { value: x })))]), f => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: f }), el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => DB.put('ms_planning', Object.assign({}, p, { maitre_nom: i.value.trim() })).then(() => { f(); EG.majSynchro(); dessiner(); }) })]); } })]) : '' }], tri, { messageVide: 'Aucun planning : générez la rotation.' })));
      if (tri.length) zone.appendChild(el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-fantome', text: 'Imprimer le planning', onclick: () => EG.Sortie.imprimer('Planning des maîtres de semaine', '<h2 style="text-align:center">PLANNING DES MAÎTRES DE SEMAINE</h2><table style="width:100%;border-collapse:collapse">' + tri.map(p => '<tr><td style="border:1px solid #444;padding:4px 8px">' + esc(long(p.lundi)) + '</td><td style="border:1px solid #444;padding:4px 8px"><b>' + esc(p.maitre_nom) + '</b></td></tr>').join('') + '</table>', { paysage: false }) })]));
    }

    /* ---- Historique ---- */
    function historique(D) {
      const q = el('input', { type: 'search', placeholder: 'Rechercher (incident, visite, observation, maître…)', style: 'min-width:280px' }), res = el('div');
      const montre = () => { const t = q.value.trim().toLowerCase(); const l = D.jour.slice().sort((a, b) => b.date.localeCompare(a.date)).filter(x => !t || JSON.stringify(x).toLowerCase().includes(t));
        res.textContent = ''; res.appendChild(U.tableau([{ titre: 'Date', valeur: x => long(x.date) }, { titre: 'Maître', valeur: x => x.maitre_nom || '' }, { titre: 'Incidents / observations', valeur: x => [x.incidents, x.observations].filter(Boolean).join(' — ') || '—' }, { titre: 'Visa', valeur: x => x.visa_le ? 'Visé' : '—' },
          { titre: '', valeur: x => el('button', { class: 'btn btn-petit btn-fantome', text: 'Ouvrir', onclick: () => { F.lundi = x.lundi; F.onglet = 'semaine'; dessiner(); } }) }], l.slice(0, 200), { messageVide: 'Aucune fiche.' })); };
      q.addEventListener('input', montre); zone.appendChild(q); zone.appendChild(res); montre();
    }
    dessiner();
  }
  U.Routeur.definir('maitre-semaine', function (racine) {
    if (!EG.peutVoirModule('maitre-semaine')) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; }
    monter(racine);
  });
})(window);
