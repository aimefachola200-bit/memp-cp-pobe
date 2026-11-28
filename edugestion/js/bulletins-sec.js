/* Notes et bulletins du secondaire (6e à Terminale) — élèves par classe, programme et coefficients, saisie des notes par matière,
   moyennes, rangs, mentions et bulletins imprimables. Règles reprises de GESCOL / Scolaris :
     moyenne d'une matière = moyenne des notes de la période (interrogations, devoirs, composition) ;
     moyenne générale = Σ(moyenne × coefficient) / Σ(coefficients), SANS coefficient en 6e et 5e ; mentions : Passable ≥ 10, Assez bien ≥ 12, Bien ≥ 14, Très bien ≥ 16.
   PÉRIMÈTRE : l'enseignant ne saisit que les notes de ses matières et niveaux (champs du compte « Niveaux / Matières du secondaire ») ;
   le programme, les résultats et les bulletins sont réservés à la direction, au CP, à la circonscription, à la DDEMP et à l'administration.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, E = EG.Ecrans;
  const el = U.el;
  const NIV = ['6e', '5e', '4e', '3e', '2nde', '1ère', 'Tle'];
  const SANS_COEF = ['6e', '5e'];
  const PERIODES = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3', 'Semestre 1', 'Semestre 2'];
  const TYPES = ['Interrogation 1', 'Interrogation 2', 'Devoir 1', 'Devoir 2', 'Composition'];
  const COEF_DEFAUT = { 'Français': 3, 'Mathématiques': 3, 'Anglais': 2, 'Allemand': 2, 'Espagnol': 2, 'Physique-Chimie-Technologie': 2, 'SVT': 2, 'Histoire-Géographie': 2, 'Philosophie': 2, 'EPS': 1, 'Éducation civique et morale': 1, 'Informatique': 1, 'Arts plastiques': 1 };
  const GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'CONSEILLER_PEDAGOGIQUE', 'DIRECTEUR'];
  const arr1 = (n) => Math.round(n * 100) / 100;
  const fmt = (n) => n == null ? '—' : String(arr1(n)).replace('.', ',');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const champ = (l, c) => el('div', { class: 'champ' }, [el('label', { text: l }), c]);
  const sel = (vals, v) => { const s = el('select', {}, vals.map(x => el('option', { value: x, text: x }))); if (v != null) s.value = v; return s; };
  const mention = (m) => m == null ? '' : m >= 16 ? 'Très bien' : m >= 14 ? 'Bien' : m >= 12 ? 'Assez bien' : m >= 10 ? 'Passable' : '';
  const apprec = (m) => m == null ? '' : m >= 16 ? 'Excellent' : m >= 14 ? 'Très bon travail' : m >= 12 ? 'Bon travail' : m >= 10 ? 'Passable' : m >= 8 ? 'Insuffisant' : 'Médiocre';
  const sa = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const nomComplet = (e) => ((e.nom || '') + ' ' + (e.prenoms || '')).trim();

  /** moyennes d'une classe pour une période : [{e, parMat:{mat:{moy,coef}}, moyenne, rang}] */
  function calculer(eleves, notes, prog, periode, niveau) {
    const coefDe = (m) => SANS_COEF.indexOf(niveau) >= 0 ? 1 : (prog[m] != null ? prog[m] : (COEF_DEFAUT[m] || 1));
    const lignes = eleves.map(e => {
      const par = {};
      notes.filter(n => n.eleve_sec_id === e.id && n.periode === periode && !n.dispense && typeof n.valeur === 'number').forEach(n => { (par[n.matiere] = par[n.matiere] || []).push(n.valeur); });
      const parMat = {}; let pts = 0, tot = 0;
      Object.keys(par).forEach(m => { const moy = par[m].reduce((a, b) => a + b, 0) / par[m].length, c = coefDe(m); parMat[m] = { moy, coef: c }; pts += moy * c; tot += c; });
      return { e, parMat, moyenne: tot ? pts / tot : null, tot };
    });
    const tries = lignes.filter(l => l.moyenne != null).sort((a, b) => b.moyenne - a.moyenne);
    tries.forEach((l, i) => { l.rang = i > 0 && tries[i - 1].moyenne === l.moyenne ? tries[i - 1].rang : i + 1; });
    return { lignes, effectif: tries.length };
  }
  function statsMat(lignes, m) {
    const v = lignes.map(l => l.parMat[m] && l.parMat[m].moy).filter(x => typeof x === 'number');
    return v.length ? { moy: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min.apply(null, v), max: Math.max.apply(null, v) } : null;
  }

  function monter(racine) {
    const u = EG.session.user, P = EG.PerimetreSec ? EG.PerimetreSec.portee() : { tout: false, niveaux: [], matieres: [] };
    const gestion = GESTION.indexOf(u.role) >= 0;
    const ecole = EG.session.ecole_id, annee = EG.session.annee_id;
    racine.appendChild(E.entete('Notes et bulletins du secondaire', 'Élèves par classe, programme et coefficients, saisie des notes, moyennes, rangs et bulletins (6e à Terminale).'));
    if (!ecole) { racine.appendChild(U.vide('Ouvrez la session d’un établissement (compte de directeur ou d’enseignant) pour gérer les notes du secondaire.')); return; }
    if (!gestion && !(P.niveaux.length && P.matieres.length)) { racine.appendChild(U.vide('Votre compte n’a pas de périmètre dans le secondaire : demandez au directeur de renseigner « Niveaux du secondaire » et « Matières du secondaire » dans votre compte.')); return; }
    const ONG = gestion ? [['eleves', 'Élèves'], ['programme', 'Programme et coefficients'], ['notes', 'Saisie des notes'], ['resultats', 'Résultats et bulletins']] : [['notes', 'Saisie des notes']];
    const F = { onglet: ONG[0][0], classe: '', periode: PERIODES[0], matiere: '' };
    const barre = el('div', { class: 'sec-ong', role: 'tablist' }), zone = el('div');
    racine.appendChild(el('div', { class: 'sec-per', text: gestion ? 'Votre fonction ouvre tous les niveaux et toutes les matières.' : 'Votre périmètre : ' + P.niveaux.join(', ') + ' — ' + P.matieres.join(', ') + '.' }));
    racine.appendChild(barre); racine.appendChild(zone);

    const charger = () => Promise.all([DB.all('eleves_sec'), DB.all('programme_sec'), DB.all('notes_sec')]).then(([el0, pr, nt]) => ({
      eleves: el0.filter(x => x.ecole_id === ecole && x.annee_scolaire_id === annee), prog: pr.filter(x => x.ecole_id === ecole && x.annee_scolaire_id === annee),
      notes: nt.filter(x => x.ecole_id === ecole && x.annee_scolaire_id === annee) }));
    const classesDe = (D) => Array.from(new Set(D.eleves.map(e => e.classe))).filter(c => gestion || P.niveaux.indexOf((D.eleves.find(e => e.classe === c) || {}).niveau) >= 0).sort();
    const progDe = (D, niveau, serie) => { const o = {}; D.prog.filter(p => p.niveau === niveau && (p.serie || '') === (serie || '')).forEach(p => { o[p.matiere] = p.coefficient; }); return o; };
    const matieresDe = (D, niveau, serie) => { const p = progDe(D, niveau, serie); const ordre = Object.keys(COEF_DEFAUT); const l = (Object.keys(p).length ? Object.keys(p) : ordre.slice(0, 9)).sort((x, y) => (ordre.indexOf(x) < 0 ? 99 : ordre.indexOf(x)) - (ordre.indexOf(y) < 0 ? 99 : ordre.indexOf(y)) || x.localeCompare(y, 'fr')); return gestion ? l : l.filter(m => P.matieres.indexOf(m) >= 0); };

    function dessiner() {
      barre.textContent = '';
      ONG.forEach(([id, l]) => { const b = el('button', { type: 'button', role: 'tab', 'aria-selected': id === F.onglet ? 'true' : 'false', text: l }); b.addEventListener('click', () => { F.onglet = id; dessiner(); }); barre.appendChild(b); });
      zone.textContent = '';
      charger().then(D => ({ eleves, programme, notes, resultats })[F.onglet](D)).catch(e => { console.error(e); zone.appendChild(U.vide('Écran indisponible.')); });
    }
    const lister = (D) => classesDe(D);
    function filtreClasse(D, avecMatiere) {
      const cl = lister(D); if (!F.classe || cl.indexOf(F.classe) < 0) F.classe = cl[0] || '';
      const f = el('div', { class: 'sec-fil' });
      const sc = el('select', {}, cl.map(c => el('option', { value: c, text: c }))); sc.value = F.classe; sc.addEventListener('change', () => { F.classe = sc.value; F.matiere = ''; dessiner(); });
      const sp = sel(PERIODES, F.periode); sp.addEventListener('change', () => { F.periode = sp.value; dessiner(); });
      f.appendChild(el('label', {}, ['Classe', sc])); f.appendChild(el('label', {}, ['Période', sp]));
      const ex = D.eleves.find(e => e.classe === F.classe);
      if (avecMatiere && ex) { const ms = matieresDe(D, ex.niveau, ex.serie); if (ms.indexOf(F.matiere) < 0) F.matiere = ms[0] || ''; const sm = sel(ms.length ? ms : [''], F.matiere); sm.addEventListener('change', () => { F.matiere = sm.value; dessiner(); }); f.appendChild(el('label', {}, ['Matière', sm])); }
      return { f, ex };
    }

    /* ---- Élèves ---- */
    function eleves(D) {
      const act = el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-primaire', text: '＋ Ajouter une liste d’élèves', onclick: () => ajouter() })]);
      zone.appendChild(act);
      const classes = Array.from(new Set(D.eleves.map(e => e.classe))).sort();
      if (!classes.length) { zone.appendChild(U.vide('Aucun élève du secondaire : « Ajouter une liste d’élèves » (collez les noms, un par ligne).')); return; }
      classes.forEach(c => { const l = D.eleves.filter(e => e.classe === c).sort((a, b) => nomComplet(a).localeCompare(nomComplet(b), 'fr'));
        zone.appendChild(U.carte(c + ' — ' + l[0].niveau + (l[0].serie ? ' série ' + l[0].serie : '') + ' (' + l.length + ')', U.tableau([
          { titre: 'N°', valeur: (x) => l.indexOf(x) + 1 }, { titre: 'Nom et prénoms', valeur: nomComplet }, { titre: 'Sexe', valeur: x => x.sexe || '' }, { titre: 'Matricule', valeur: x => x.matricule || '' },
          { titre: '', valeur: x => el('button', { class: 'btn btn-petit btn-fantome btn-alerte', text: '', 'aria-label': 'Retirer', onclick: () => U.confirmer('Retirer l’élève', nomComplet(x) + ' et ses notes seront supprimés.', () => Promise.all(D.notes.filter(n => n.eleve_sec_id === x.id).map(n => DB.remove('notes_sec', n.id))).then(() => DB.remove('eleves_sec', x.id)).then(() => dessiner())) }) }
        ], l, {}))); });
    }
    function ajouter() {
      const cl = el('input', { type: 'text', placeholder: 'Ex. 3e A, 2nde C, Tle D' }), niv = sel(NIV, '3e'), serie = el('input', { type: 'text', placeholder: 'Séries : A, B, C, D, G… (vide au 1er cycle)' });
      const txt = el('textarea', { rows: '10', placeholder: 'Un élève par ligne :\nNOM Prénoms ; F ; matricule (facultatif)' });
      U.modal('Ajouter des élèves', el('div', { class: 'formulaire' }, [champ('Classe', cl), champ('Niveau', niv), champ('Série (2nde à Tle)', serie), champ('Élèves', txt)]), fermer => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
          const lignes = txt.value.split('\n').map(x => x.trim()).filter(Boolean); if (!cl.value.trim() || !lignes.length) { U.toast('Classe et élèves obligatoires', 'attention'); return; }
          const rows = lignes.map(l => { const p = l.split(/[;\t]/).map(x => x.trim()); const m = /^(\S+)\s*(.*)$/.exec(p[0]); return { ecole_id: ecole, annee_scolaire_id: annee, classe: cl.value.trim(), niveau: niv.value, serie: serie.value.trim().toUpperCase(), nom: m[1], prenoms: m[2], sexe: (p[1] || '').toUpperCase().slice(0, 1), matricule: p[2] || '' }; });
          DB.putBatch('eleves_sec', rows).then(() => { fermer(); EG.majSynchro(); U.toast(rows.length + ' élève(s) ajouté(s)'); dessiner(); });
        } })]);
    }

    /* ---- Programme ---- */
    function programme(D) {
      zone.appendChild(el('p', { class: 'muet petit', text: 'Coefficients par niveau et série (à ajuster selon le programme officiel). En 6e et 5e, aucun coefficient n’est appliqué (règle du noyau).' }));
      const f = el('div', { class: 'sec-fil' }), sn = sel(NIV, F.niv || '3e'), ss = el('input', { type: 'text', value: F.ser || '', placeholder: 'Série (2nde à Tle)' });
      sn.addEventListener('change', () => { F.niv = sn.value; dessiner(); }); ss.addEventListener('change', () => { F.ser = ss.value.trim().toUpperCase(); dessiner(); });
      f.appendChild(el('label', {}, ['Niveau', sn])); f.appendChild(el('label', {}, ['Série', ss])); zone.appendChild(f);
      const niveau = sn.value, serie = (ss.value || '').trim().toUpperCase(), cur = progDe(D, niveau, serie);
      const noms = Object.keys(COEF_DEFAUT).concat(Object.keys(cur).filter(m => !(m in COEF_DEFAUT)));
      const champs = {}; const lignes = noms.map(m => { const i = el('input', { type: 'number', min: '0', step: '0.5', value: cur[m] != null ? cur[m] : '', placeholder: String(COEF_DEFAUT[m] || 1), style: 'width:80px' }); champs[m] = i; return { m, i }; });
      zone.appendChild(U.carte('Coefficients ' + niveau + (serie ? ' ' + serie : '') + (SANS_COEF.indexOf(niveau) >= 0 ? ' (sans coefficient)' : ''), U.tableau([{ titre: 'Matière', valeur: x => x.m }, { titre: 'Coefficient (vide = non enseignée)', valeur: x => x.i }], lignes, {})));
      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', { class: 'btn btn-fantome', text: 'Remplir avec les coefficients usuels', onclick: () => { lignes.forEach(x => { if (x.i.value === '') x.i.value = COEF_DEFAUT[x.m] || 1; }); } }),
        el('button', { class: 'btn btn-primaire', text: 'Enregistrer le programme', onclick: () => {
          const anciens = D.prog.filter(p => p.niveau === niveau && (p.serie || '') === serie);
          const rows = lignes.filter(x => x.i.value !== '').map(x => ({ ecole_id: ecole, annee_scolaire_id: annee, niveau, serie, matiere: x.m, coefficient: Number(x.i.value) }));
          Promise.all(anciens.map(p => DB.remove('programme_sec', p.id))).then(() => DB.putBatch('programme_sec', rows)).then(() => { EG.majSynchro(); U.toast('Programme enregistré'); dessiner(); });
        } })]));
    }

    /* ---- Saisie des notes ---- */
    function notes(D) {
      const { f, ex } = filtreClasse(D, true); zone.appendChild(f);
      if (!ex) { zone.appendChild(U.vide(gestion ? 'Ajoutez d’abord les élèves de la classe (onglet « Élèves »).' : 'Aucune classe de votre périmètre.')); return; }
      if (!F.matiere) { zone.appendChild(U.vide('Aucune matière à saisir pour ce niveau.')); return; }
      if (!gestion && !(P.niveaux.indexOf(ex.niveau) >= 0 && P.matieres.indexOf(F.matiere) >= 0)) { zone.appendChild(U.vide('Hors de votre périmètre.')); return; }
      const st = sel(TYPES, F.type || 'Devoir 1'); st.addEventListener('change', () => { F.type = st.value; dessiner(); }); f.appendChild(el('label', {}, ['Évaluation', st]));
      const type = st.value, liste = D.eleves.filter(e => e.classe === F.classe).sort((a, b) => nomComplet(a).localeCompare(nomComplet(b), 'fr'));
      const trouve = (e) => D.notes.find(n => n.eleve_sec_id === e.id && n.matiere === F.matiere && n.periode === F.periode && n.evaluation === type);
      const champs = liste.map(e => { const n = trouve(e); const i = el('input', { type: 'text', inputmode: 'decimal', value: n && typeof n.valeur === 'number' ? String(n.valeur).replace('.', ',') : '', style: 'width:80px', placeholder: '/20' }); const d = el('input', { type: 'checkbox' }); d.checked = !!(n && n.dispense); return { e, i, d, n }; });
      zone.appendChild(U.carte(F.matiere + ' — ' + F.classe + ' — ' + F.periode + ' — ' + type, U.tableau([
        { titre: 'N°', valeur: x => champs.indexOf(x) + 1 }, { titre: 'Élève', valeur: x => nomComplet(x.e) }, { titre: 'Note /20', valeur: x => x.i }, { titre: 'Dispensé / absent', valeur: x => x.d }], champs, {})));
      zone.appendChild(el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-primaire', text: 'Enregistrer les notes', onclick: () => {
        const ecr = []; let mauvais = 0;
        champs.forEach(x => {
          const brut = x.i.value.trim().replace(',', '.'), v = brut === '' ? null : Number(brut);
          if (v !== null && !(v >= 0 && v <= 20)) { mauvais++; return; }
          if (v === null && !x.d.checked) { if (x.n) ecr.push(DB.remove('notes_sec', x.n.id)); return; }
          ecr.push(DB.put('notes_sec', Object.assign({}, x.n || {}, { ecole_id: ecole, annee_scolaire_id: annee, eleve_sec_id: x.e.id, matiere: F.matiere, periode: F.periode, evaluation: type, valeur: v, dispense: x.d.checked, saisi_par: u.id })));
        });
        if (mauvais) { U.toast(mauvais + ' note(s) hors de 0 à 20 : corrigez', 'attention'); return; }
        Promise.all(ecr).then(() => { EG.majSynchro(); U.toast('Notes enregistrées'); dessiner(); });
      } })]));
    }

    /* ---- Résultats et bulletins ---- */
    function resultats(D) {
      const { f, ex } = filtreClasse(D, false); zone.appendChild(f);
      if (!ex) { zone.appendChild(U.vide('Aucune classe : ajoutez les élèves.')); return; }
      const liste = D.eleves.filter(e => e.classe === F.classe), prog = progDe(D, ex.niveau, ex.serie);
      const R = calculer(liste, D.notes, prog, F.periode, ex.niveau);
      const mats = Array.from(new Set(D.notes.filter(n => n.periode === F.periode && liste.some(e => e.id === n.eleve_sec_id)).map(n => n.matiere)));
      const moys = R.lignes.map(l => l.moyenne).filter(x => x != null);
      zone.appendChild(el('div', { class: 'grille grille-stats' }, [U.stat(String(R.effectif), 'Élèves classés'), U.stat(moys.length ? fmt(moys.reduce((a, b) => a + b, 0) / moys.length) : '—', 'Moyenne de la classe'),
        U.stat(moys.length ? fmt(Math.max.apply(null, moys)) : '—', 'Plus forte moyenne'), U.stat(moys.length ? fmt(Math.min.apply(null, moys)) : '—', 'Plus faible moyenne'), U.stat(moys.length ? Math.round(moys.filter(m => m >= 10).length / moys.length * 100) + ' %' : '—', 'Taux de moyennes ≥ 10')]));
      const tri = R.lignes.slice().sort((a, b) => (a.rang || 999) - (b.rang || 999) || nomComplet(a.e).localeCompare(nomComplet(b.e), 'fr'));
      zone.appendChild(el('div', { class: 'barre-actions' }, [el('button', { class: 'btn btn-primaire', text: 'Imprimer tous les bulletins', onclick: () => { const h = tri.filter(l => l.moyenne != null).map(l => bulletin(l, R, ex, mats, prog)).join('<div style="page-break-after:always"></div>'); if (!h) { U.toast('Aucune note pour cette période', 'attention'); return; } EG.Sortie.imprimer('Bulletins ' + F.classe + ' — ' + F.periode, h, { paysage: false, enTete: false }); } })]));
      zone.appendChild(U.carte('Résultats ' + F.classe + ' — ' + F.periode, U.tableau([{ titre: 'Rang', valeur: l => l.rang || '—' }, { titre: 'Élève', valeur: l => nomComplet(l.e) }]
        .concat(mats.map(m => ({ titre: m.slice(0, 10), valeur: l => l.parMat[m] ? fmt(l.parMat[m].moy) : '—' })))
        .concat([{ titre: 'Moyenne', valeur: l => l.moyenne == null ? '—' : el('strong', { text: fmt(l.moyenne) }) }, { titre: 'Mention', valeur: l => mention(l.moyenne) },
          { titre: '', valeur: l => l.moyenne == null ? '' : el('button', { class: 'btn btn-petit btn-fantome', text: 'Bulletin', onclick: () => EG.Sortie.imprimer('Bulletin — ' + nomComplet(l.e), bulletin(l, R, ex, mats, prog), { paysage: false, enTete: false }) }) }]), tri, { messageVide: 'Aucune note saisie pour cette période.' })));
    }
    function bulletin(l, R, ex, mats, prog) {
      const sc = SANS_COEF.indexOf(ex.niveau) >= 0, e = EG.session;
      const lignes = mats.filter(m => l.parMat[m]).map(m => { const x = l.parMat[m], s = statsMat(R.lignes, m); return '<tr><td>' + esc(m) + '</td>' + (sc ? '' : '<td style="text-align:center">' + x.coef + '</td>') + '<td style="text-align:center"><b>' + fmt(x.moy) + '</b></td>' + (sc ? '' : '<td style="text-align:center">' + fmt(x.moy * x.coef) + '</td>') + '<td style="text-align:center">' + (s ? fmt(s.moy) : '') + '</td><td style="text-align:center">' + (s ? fmt(s.min) + ' – ' + fmt(s.max) : '') + '</td><td>' + esc(apprec(x.moy)) + '</td></tr>'; }).join('');
      const st = 'border:1px solid #444;padding:4px 6px;font-size:12px';
      return '<div style="font-family:Arial,sans-serif;color:#111"><div style="text-align:center"><b>RÉPUBLIQUE DU BÉNIN</b><br>MINISTÈRE DES ENSEIGNEMENTS ENSEIGNEMENT SECONDAIRE<br><b>' + esc((e.ecole_nom || '')) + '</b></div>'
        + '<h2 style="text-align:center;margin:12px 0">BULLETIN DE NOTES — ' + esc(F.periode.toUpperCase()) + '</h2>'
        + '<p><b>Élève :</b> ' + esc(nomComplet(l.e)) + (l.e.matricule ? ' &nbsp; <b>Matricule :</b> ' + esc(l.e.matricule) : '') + ' &nbsp; <b>Classe :</b> ' + esc(l.e.classe) + ' &nbsp; <b>Effectif :</b> ' + R.lignes.length + '</p>'
        + '<style>.bsec td,.bsec th{' + st + '}</style><table class="bsec" style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Matière</th>' + (sc ? '' : '<th>Coef.</th>') + '<th>Moyenne /20</th>' + (sc ? '' : '<th>Points</th>') + '<th>Moy. classe</th><th>Min – Max</th><th>Appréciation</th></tr></thead><tbody>' + lignes + '</tbody></table>'
        + '<p style="margin-top:10px"><b>Moyenne générale : ' + fmt(l.moyenne) + ' / 20</b> &nbsp; — &nbsp; <b>Rang : ' + (l.rang || '—') + ' / ' + R.effectif + '</b> &nbsp; — &nbsp; <b>Mention : ' + esc(mention(l.moyenne) || 'néant') + '</b></p>'
        + (sc ? '<p style="font-size:11px">Pas de coefficient en ' + esc(ex.niveau) + '.</p>' : '')
        + '<table style="width:100%;margin-top:24px"><tr><td style="text-align:center">Le professeur principal</td><td style="text-align:center">Le Proviseur / Le Directeur</td><td style="text-align:center">Le parent</td></tr></table></div>';
    }
    dessiner();
  }

  U.Routeur.definir('bulletins-sec', function (racine) {
    if (!EG.peutVoirModule('bulletins-sec')) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; }
    monter(racine);
  });
  EG.BulletinsSec = { calculer, mention };
})(window);
