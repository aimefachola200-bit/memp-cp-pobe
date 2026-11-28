/* ÉduGestion Pro Master — Modèles officiels EDUCMaster (les mêmes que SCOLARIS et GESCOL) : élèves par classe et notes du primaire.

   • Élèves (« modèle des classes ») : une feuille par cours — CM2, CM1, CE2, CE1, CP, CI, Marternelle 2, Marternelle 1 —
     colonnes Nom · Prénom ( s ) · Sexe · Date de naissance · Lieu de naissance · Téléphone de parents · Nationalité · Npi.
   • Notes (« modèle des notes du primaire ») : quatre feuilles — Évaluation formative 1, Évaluation sommative 1 à 3 —
     Matricule · Nom · Prénoms puis, pour chaque matière (intitulé fusionné sur deux colonnes), « Note obtenue » et
     « Note perf. » (barème : 20) ; deux lignes d'en-tête, données à partir de la ligne 3.
   Export : le modèle reproduit à l'identique (feuilles, rubriques, fusions), rempli. Import : élèves rapprochés par NPI,
   puis par nom + prénoms (+ date de naissance) ; les élèves inconnus sont créés et inscrits dans la classe du cours ;
   notes rapprochées par matricule EDUCMaster puis par nom + prénoms. Toute ligne écartée est signalée. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, el = U.el;
  const session = () => EG.session;
  const sa = s => U.sansAccent(String(s == null ? '' : s)).replace(/[^a-z0-9]+/g, ' ').trim();

  const FEUILLES_CLASSE = [['CM2', ['CM2']], ['CM1', ['CM1']], ['CE2', ['CE2']], ['CE1', ['CE1']], ['CP', ['CP']], ['CI', ['CI']],
    ['Marternelle 2', ['EM2', 'GRANDS']], ['Marternelle 1', ['EM1', 'MOYENS', 'PETITS']]];
  const COLONNES_CLASSE = ['Nom', 'Prénom ( s )', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Téléphone de parents', 'Nationalité', 'Npi'];
  const FEUILLES_NOTES = [['Évaluation formative 1', 'FORMATIVE', 1], ['Évaluation sommative 1', 'SOMMATIVE', 1],
    ['Évaluation sommative 2', 'SOMMATIVE', 2], ['Évaluation sommative 3', 'SOMMATIVE', 3]];
  /* Intitulés du modèle (orthographe d'origine conservée) et code de la matière dans ÉduGestion. */
  const MATIERES_MODELE = [['Dictée', 'DICT'], ['Math', 'MATH'], ['Expresion écrite', 'COMM_ECR'], ['Compréhension de l\'écrit', 'COMP_ECR'],
    ['EST', 'EST'], ['ES', 'ESC'], ['EA (Oral)', 'EA_VIV'], ['EA (Déssin/Couture)', 'EA_PLAST'], ['EPS', 'EPS']];
  const NOTE_PERF = 20, LIGNE_DONNEES = 3;
  const NATIONALITE = 'Béninoise';

  const colLettre = n => { let s = ''; n += 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const dateFr = d => d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : (d || '');
  /** Date lue dans un classeur : JJ/MM/AAAA, AAAA-MM-JJ ou numéro de série Excel -> AAAA-MM-JJ. */
  function dateIso(v) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return '';
    let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(t);
    if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (m) return m[0];
    if (/^\d{4,6}(\.\d+)?$/.test(t)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(t)) * 86400000); return d.toISOString().slice(0, 10); }
    return '';
  }
  const sexeDe = v => { const t = sa(v); if (/^(f|fille|feminin|femme)$/.test(t)) return 'F'; if (/^(m|g|garcon|masculin|homme)$/.test(t)) return 'M'; return ''; };
  const nombre = v => { const t = String(v == null ? '' : v).trim().replace(',', '.'); return t !== '' && isFinite(Number(t)) ? Number(t) : null; };
  const cleNom = (nom, prenoms) => sa(nom) + '|' + sa(prenoms);

  /* ---------------- données du périmètre ---------------- */
  function contexte() {
    return Promise.all([EG.Ecrans.charger('ecoles'), DB.where('classes', { annee_scolaire_id: session().annee_id }), DB.all('eleves'),
      DB.where('inscriptions_eleves', { annee_scolaire_id: session().annee_id }), DB.all('matieres'), DB.where('evaluations', { annee_scolaire_id: session().annee_id }), DB.all('notes')])
      .then(([ecoles, classes, eleves, inscriptions, matieres, evaluations, notes]) => {
        const ids = {}; ecoles.forEach(e => { ids[e.id] = true; });
        return { ecoles, classes: classes.filter(c => ids[c.ecole_id]), eleves, inscriptions: inscriptions.filter(i => i.statut === 'ACTIF' || !i.statut), matieres, evaluations, notes };
      });
  }

  /* ---------------- 1. élèves : export ---------------- */
  function exporterEleves(ecoleId) {
    return contexte().then(C => {
      const ecole = C.ecoles.filter(e => e.id === ecoleId)[0] || {};
      const ie = {}; C.eleves.forEach(e => { ie[e.id] = e; });
      const ic = {}; C.classes.forEach(c => { ic[c.id] = c; });
      const rows = C.inscriptions.filter(i => i.ecole_id === ecoleId && ie[i.eleve_id]).map(i => ({ e: ie[i.eleve_id], c: ic[i.classe_id], niveau: i.niveau }));
      const total = rows.filter(r => FEUILLES_CLASSE.some(([, n]) => n.indexOf(r.niveau) >= 0)).length;
      const feuilles = feuillesEleves(rows);
      EG.Sortie.excel('EducMaster_eleves_' + EG.Sortie.slug(ecole.nom || 'ecole').slice(0, 30) + '_' + session().annee_code, feuilles);
      DB.audit('EDUCMASTER_EXPORT_ELEVES', 'eleves', null, { ecole: ecole.nom, eleves: total });
      return total;
    });
  }

  /** Classeur « modèle des classes » d'EducMaster (importation) : rows = [{ e: élève, c: classe, niveau }] ; toutes les
      feuilles du modèle, chaque élève sur la feuille de son niveau (aussi utilisé par « Listes de classe »). */
  function feuillesEleves(rows) {
    return FEUILLES_CLASSE.map(([nom, niveaux]) => {
      const lignes = rows.filter(r => niveaux.indexOf(r.niveau) >= 0 && r.e)
        .sort((a, b) => String(a.c ? a.c.libelle || a.c.code : '').localeCompare(String(b.c ? b.c.libelle || b.c.code : ''), 'fr')
          || String(a.e.nom).localeCompare(String(b.e.nom), 'fr') || String(a.e.prenoms).localeCompare(String(b.e.prenoms), 'fr'))
        .map(({ e }) => [(e.nom || '').toUpperCase(), e.prenoms || '', e.sexe === 'F' ? 'F' : (e.sexe ? 'M' : ''), dateFr(e.date_naissance),
          e.lieu_naissance || e.commune_naissance || '', e.tuteur_telephone || '', e.nationalite || NATIONALITE, e.npi || '']);
      return { nom, lignes: [COLONNES_CLASSE].concat(lignes), entete: 0 };
    });
  }

  /* ---------------- 1. élèves : import ---------------- */
  /** Analyse le classeur sans rien enregistrer : { aCreer, aCompleter, rejets, parNiveau }. */
  function analyserEleves(feuilles, ecoleId, choixClasses, C) {
    const r = { aCreer: [], aCompleter: [], inchanges: 0, rejets: [] };
    const elevesEcole = {}, parNpi = {}, parNom = {};
    C.inscriptions.filter(i => i.ecole_id === ecoleId).forEach(i => { elevesEcole[i.eleve_id] = i; });
    C.eleves.forEach(e => {
      if (e.npi) parNpi[String(e.npi).trim()] = e;
      if (elevesEcole[e.id]) (parNom[cleNom(e.nom, e.prenoms)] = parNom[cleNom(e.nom, e.prenoms)] || []).push(e);
    });
    feuilles.forEach(f => {
      const def = FEUILLES_CLASSE.filter(([n]) => sa(n) === sa(f.nom) || sa(n.replace('Marternelle', 'Maternelle')) === sa(f.nom))[0];
      const lignes = f.lignes;
      const h = (lignes[0] || []).map(sa);
      const col = (...c) => { for (const x of c) { const i = h.findIndex(t => t === x || t.indexOf(x) === 0); if (i >= 0) return i; } return -1; };
      const iN = col('nom'), iP = col('prenom'), iS = col('sexe'), iD = col('date de naissance', 'date'), iL = col('lieu de naissance', 'lieu'),
        iT = col('telephone de parents', 'telephone', 'tel'), iNat = col('nationalite'), iNpi = col('npi', 'nip');
      const donnees = lignes.slice(1).map((l, k) => ({ l, ligne: k + 2 })).filter(x => x.l.some(v => String(v == null ? '' : v).trim() !== ''));
      if (!donnees.length) return;
      if (!def || iN < 0 || iP < 0) { donnees.forEach(x => r.rejets.push(f.nom + ', ligne ' + x.ligne + ' : feuille inconnue du modèle ou colonnes Nom / Prénom ( s ) absentes')); return; }
      const niveaux = def[1];
      const classe = C.classes.filter(c => c.id === choixClasses[def[0]])[0]
        || (C.classes.filter(c => c.ecole_id === ecoleId && niveaux.indexOf(c.niveau) >= 0).length === 1 ? C.classes.filter(c => c.ecole_id === ecoleId && niveaux.indexOf(c.niveau) >= 0)[0] : null);
      donnees.forEach(({ l, ligne }) => {
        const v = i => i >= 0 ? String(l[i] == null ? '' : l[i]).trim() : '';
        const nom = v(iN).toUpperCase(), prenoms = v(iP), sexe = sexeDe(v(iS)), dn = dateIso(v(iD)), npi = v(iNpi).replace(/\.0$/, '');
        const ou = f.nom + ', ligne ' + ligne + ' (' + (nom + ' ' + prenoms).trim() + ')';
        if (!nom || !prenoms) { r.rejets.push(ou + ' : nom ou prénoms manquant'); return; }
        if (v(iS) && !sexe) { r.rejets.push(ou + ' : sexe « ' + v(iS) + ' » non reconnu (M ou F)'); return; }
        if (v(iD) && !dn) { r.rejets.push(ou + ' : date de naissance « ' + v(iD) + ' » illisible (JJ/MM/AAAA)'); return; }
        const champs = { nom, prenoms, sexe, date_naissance: dn, lieu_naissance: v(iL), tuteur_telephone: v(iT), nationalite: v(iNat) || NATIONALITE, npi };
        let e = npi && parNpi[npi];
        if (!e) {
          const memes = (parNom[cleNom(nom, prenoms)] || []).filter(x => !dn || !x.date_naissance || x.date_naissance === dn);
          if (memes.length > 1) { r.rejets.push(ou + ' : plusieurs élèves de l’école portent ce nom — précisez le NPI'); return; }
          e = memes[0];
        }
        if (e) {
          const maj = {};
          Object.keys(champs).forEach(k => { if (champs[k] && !e[k]) maj[k] = champs[k]; });
          if (Object.keys(maj).length) r.aCompleter.push(Object.assign({}, e, maj)); else r.inchanges++;
          return;
        }
        if (!classe) { r.rejets.push(ou + ' : aucune classe choisie pour le cours ' + def[0] + ' — élève non créé'); return; }
        if (!sexe) { r.rejets.push(ou + ' : sexe manquant — élève non créé'); return; }
        r.aCreer.push({ eleve: Object.assign({ statut_identite: 'ACTIF' }, champs), classe });
      });
    });
    return r;
  }

  function enregistrerEleves(r) {
    const auj = new Date().toISOString().slice(0, 10);
    return DB.putBatch('eleves', r.aCreer.map(x => x.eleve)).then(saved => DB.putBatch('inscriptions_eleves', saved.map((e, k) => {
      const cl = r.aCreer[k].classe;
      return { eleve_id: e.id, ecole_id: cl.ecole_id, annee_scolaire_id: session().annee_id, cycle: EG.NIVEAUX_MAT.indexOf(cl.niveau) >= 0 ? 'MATERNELLE' : 'PRIMAIRE',
        niveau: cl.niveau, classe_id: cl.id, type_inscription: 'NOUVELLE', date_inscription: auj, statut: 'ACTIF', principale: true };
    }))).then(() => r.aCompleter.length ? DB.putBatch('eleves', r.aCompleter) : null)
      .then(() => DB.audit('EDUCMASTER_IMPORT_ELEVES', 'eleves', null, { crees: r.aCreer.length, completes: r.aCompleter.length, rejets: r.rejets.length }))
      .then(() => EG.majSynchro && EG.majSynchro());
  }

  /* ---------------- 2. notes : export ---------------- */
  function evaluationPour(C, classe, type, rang) {
    const duType = C.evaluations.filter(e => e.type_evaluation === type && (e.classe_id === classe.id || (!e.classe_id && e.niveau === classe.niveau && (!e.ecole_id || e.ecole_id === classe.ecole_id))))
      .sort((a, b) => (a.numero || 0) - (b.numero || 0));
    return duType.filter(e => Number(e.numero) === rang)[0] || duType[rang - 1] || null;
  }

  function enteteNotes() {
    const l1 = ['Matricule', 'Nom', 'Prénoms'], l2 = ['', '', ''], fusions = ['A1:A2', 'B1:B2', 'C1:C2'];
    MATIERES_MODELE.forEach(([nom], k) => {
      const c = 3 + k * 2;
      l1.push(nom, ''); l2.push('Note obtenue', 'Note perf.');
      fusions.push(colLettre(c) + '1:' + colLettre(c + 1) + '1');
    });
    return { l1: l1.map(v => ({ v, s: 'h' })), l2: l2.map(v => ({ v, s: 'h' })), fusions };
  }

  function exporterNotes(classeId) {
    return contexte().then(C => {
      const classe = C.classes.filter(c => c.id === classeId)[0];
      if (!classe) throw new Error('Classe introuvable');
      const ie = {}; C.eleves.forEach(e => { ie[e.id] = e; });
      const ins = C.inscriptions.filter(i => i.classe_id === classeId && ie[i.eleve_id])
        .sort((a, b) => String(ie[a.eleve_id].nom).localeCompare(String(ie[b.eleve_id].nom), 'fr') || String(ie[a.eleve_id].prenoms).localeCompare(String(ie[b.eleve_id].prenoms), 'fr'));
      const parCode = {}; C.matieres.forEach(m => { parCode[m.code] = m.id; });
      const E = enteteNotes();
      let nNotes = 0;
      const feuilles = FEUILLES_NOTES.map(([nom, type, rang]) => {
        const ev = evaluationPour(C, classe, type, rang);
        const idx = {};
        if (ev) C.notes.filter(n => n.evaluation_id === ev.id).forEach(n => { idx[n.inscription_id + '|' + n.matiere_id] = n; });
        const lignes = ins.map(i => {
          const e = ie[i.eleve_id], l = [{ v: e.educmaster_matricule || '', s: 'c', texte: true }, { v: (e.nom || '').toUpperCase(), s: 'c' }, { v: e.prenoms || '', s: 'c' }];
          MATIERES_MODELE.forEach(([, code]) => {
            const n = idx[i.id + '|' + parCode[code]];
            const ok = n && typeof n.note === 'number';
            if (ok) nNotes++;
            l.push({ v: ok ? n.note : '', s: 'c' }, { v: ok ? NOTE_PERF : '', s: 'c' });
          });
          return l;
        });
        return { nom, lignes: [E.l1, E.l2].concat(lignes), fusions: E.fusions, entete: 1 };
      });
      EG.Sortie.excel('EducMaster_notes_' + EG.Sortie.slug(classe.libelle || classe.code || 'classe') + '_' + session().annee_code, feuilles);
      DB.audit('EDUCMASTER_EXPORT_NOTES', 'notes', null, { classe: classe.libelle || classe.code, notes: nNotes });
      return { eleves: ins.length, notes: nNotes, sansMatricule: ins.filter(i => !ie[i.eleve_id].educmaster_matricule).length };
    });
  }

  /** Notes d'une classe pour le modèle officiel (Listes de classe) : { parFeuille: { feuille: [{ matricule, nom, prenoms, notes[9] }] } } */
  function donneesNotes(C, classe) {
    const ie = {}; C.eleves.forEach(e => { ie[e.id] = e; });
    const ins = C.inscriptions.filter(i => i.classe_id === classe.id && ie[i.eleve_id]);
    const parCode = {}; C.matieres.forEach(m => { parCode[m.code] = m.id; });
    const parFeuille = {};
    FEUILLES_NOTES.forEach(([nom, type, rang]) => {
      const ev = evaluationPour(C, classe, type, rang), idx = {};
      if (ev) C.notes.filter(n => n.evaluation_id === ev.id).forEach(n => { idx[n.inscription_id + '|' + n.matiere_id] = n; });
      parFeuille[nom] = ins.map(i => { const e = ie[i.eleve_id];
        return { matricule: e.educmaster_matricule || '', nom: (e.nom || '').toUpperCase(), prenoms: e.prenoms || '',
          notes: MATIERES_MODELE.map(([, code]) => { const n = idx[i.id + '|' + parCode[code]]; return n && typeof n.note === 'number' ? n.note : null; }) }; });
    });
    return { parFeuille, sansMatricule: ins.filter(i => !ie[i.eleve_id].educmaster_matricule).length };
  }

  /* ---------------- 2. notes : import ---------------- */
  function analyserNotes(feuilles, classeId, C) {
    const classe = C.classes.filter(c => c.id === classeId)[0];
    const r = { notes: [], evaluationsACreer: [], rejets: [], lues: 0, feuilles: [] };
    if (!classe) { r.rejets.push('Classe introuvable'); return r; }
    const ie = {}; C.eleves.forEach(e => { ie[e.id] = e; });
    const ins = C.inscriptions.filter(i => i.classe_id === classeId && ie[i.eleve_id]);
    const parMat = {}, parNom = {};
    ins.forEach(i => { const e = ie[i.eleve_id]; if (e.educmaster_matricule) parMat[String(e.educmaster_matricule).trim().toUpperCase()] = i; (parNom[cleNom(e.nom, e.prenoms)] = parNom[cleNom(e.nom, e.prenoms)] || []).push(i); });
    const parCode = {}; C.matieres.forEach(m => { parCode[m.code] = m; });
    const existantes = {}; C.notes.forEach(n => { existantes[n.evaluation_id + '|' + n.inscription_id + '|' + n.matiere_id] = n; });
    feuilles.forEach(f => {
      const def = FEUILLES_NOTES.filter(([n]) => sa(n) === sa(f.nom))[0];
      const l1 = (f.lignes[0] || []).map(sa);
      const donnees = f.lignes.slice(LIGNE_DONNEES - 1).map((l, k) => ({ l, ligne: k + LIGNE_DONNEES })).filter(x => x.l.some(v => String(v == null ? '' : v).trim() !== ''));
      if (!donnees.length) return;
      if (!def) { r.rejets.push('Feuille « ' + f.nom + ' » : inconnue du modèle (attendu : ' + FEUILLES_NOTES.map(x => x[0]).join(', ') + ')'); return; }
      const cols = {};
      l1.forEach((t, j) => { if (!t) return; const m = MATIERES_MODELE.filter(([nom]) => sa(nom) === t || (sa(nom) === 'expresion ecrite' && t === 'expression ecrite') || (sa(nom) === 'ea dessin couture' && t.indexOf('ea dessin') === 0))[0]; if (m && cols[m[1]] === undefined) cols[m[1]] = j; });
      let ev = evaluationPour(C, classe, def[1], def[2]);
      if (!ev) {
        ev = { annee_scolaire_id: session().annee_id, ecole_id: classe.ecole_id, niveau: classe.niveau, classe_id: classe.id,
          numero: def[2], type_evaluation: def[1], libelle: def[0], statut: 'OUVERTE' };
        r.evaluationsACreer.push(ev);
      }
      let nFeuille = 0;
      donnees.forEach(({ l, ligne }) => {
        const mat = String(l[0] == null ? '' : l[0]).trim().toUpperCase(), nom = String(l[1] || '').trim(), prenoms = String(l[2] || '').trim();
        const ou = f.nom + ', ligne ' + ligne + ' (' + (nom + ' ' + prenoms).trim() + ')';
        let i = mat && parMat[mat];
        if (!i) { const m = parNom[cleNom(nom, prenoms)] || []; if (m.length > 1) { r.rejets.push(ou + ' : homonymes dans la classe — renseignez le matricule'); return; } i = m[0]; }
        if (!i) { r.rejets.push(ou + ' : élève introuvable dans la classe ' + (classe.libelle || classe.code)); return; }
        Object.keys(cols).forEach(code => {
          const j = cols[code], brut = String(l[j] == null ? '' : l[j]).trim();
          if (brut === '') return;
          const note = nombre(brut), perf = nombre(l[j + 1]);
          if (note === null) { r.rejets.push(ou + ' : note « ' + brut + ' » illisible en ' + MATIERES_MODELE.filter(x => x[1] === code)[0][0]); return; }
          const sur = perf && perf > 0 ? perf : NOTE_PERF;
          const n20 = Math.round(note / sur * 20 * 100) / 100;
          if (n20 < 0 || n20 > 20) { r.rejets.push(ou + ' : note ' + brut + ' hors barème (' + sur + ')'); return; }
          const m = parCode[code];
          if (!m) { r.rejets.push(ou + ' : matière ' + code + ' absente du référentiel'); return; }
          const ancienne = ev.id ? existantes[ev.id + '|' + i.id + '|' + m.id] : null;
          r.notes.push(Object.assign({}, ancienne || {}, { _ev: ev, inscription_id: i.id, matiere_id: m.id, note: n20 }));
          nFeuille++; r.lues++;
        });
      });
      r.feuilles.push(f.nom + ' : ' + nFeuille + ' note(s)' + (r.evaluationsACreer.indexOf(ev) >= 0 ? ' (évaluation créée)' : ''));
    });
    return r;
  }

  function enregistrerNotes(r) {
    return (r.evaluationsACreer.length ? DB.putBatch('evaluations', r.evaluationsACreer.map(e => { const o = Object.assign({}, e); if (!o.id) delete o.id; return o; })) : Promise.resolve([]))
      .then(saved => {
        saved.forEach((s, k) => { r.evaluationsACreer[k].id = s.id; });
        return DB.putBatch('notes', r.notes.map(n => { const o = Object.assign({}, n, { evaluation_id: n._ev.id }); delete o._ev; return o; }));
      })
      .then(() => DB.audit('EDUCMASTER_IMPORT_NOTES', 'notes', null, { notes: r.notes.length, rejets: r.rejets.length }))
      .then(() => EG.majSynchro && EG.majSynchro());
  }

  /* ---------------- écran ---------------- */
  function rapport(titre, r, lignesResume) {
    return el('div', {}, [
      el('p', { text: titre }),
      el('ul', { class: 'liste-points' }, lignesResume.map(t => el('li', { text: t }))),
      r.rejets.length ? el('details', { open: true }, [el('summary', { text: r.rejets.length + ' ligne(s) écartée(s)' }),
        el('ul', { class: 'petit' }, r.rejets.slice(0, 60).map(t => el('li', { text: t })).concat(r.rejets.length > 60 ? [el('li', { text: '… et ' + (r.rejets.length - 60) + ' autre(s).' })] : []))]) : null
    ]);
  }

  /** Bloc complet (choix de l'école ou de la classe, export, import) : posé dans l'écran EDUCMaster, Élèves et Évaluations. */
  function bloc(options) {
    options = options || {};
    const zone = el('div', { class: 'carte', style: 'padding:14px' });
    zone.appendChild(el('h3', { class: 'carte-titre', text: '\uE030 Modèles officiels EDUCMaster (comme SCOLARIS et GESCOL)' }));
    zone.appendChild(el('p', { class: 'muet petit', text: 'Élèves : une feuille par cours (CM2 … CI, Maternelle 2 et 1). Notes du primaire : Évaluation formative 1, sommative 1 à 3, deux colonnes par matière (note obtenue, note perf. sur 20). Le fichier exporté se dépose tel quel sur EDUCMaster et se réimporte ici.' }));
    const corps = el('div');
    zone.appendChild(corps);
    contexte().then(C => {
      const ecoles = C.ecoles.slice().sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
      if (!ecoles.length) { corps.appendChild(U.vide('Aucune école dans votre périmètre.')); return; }
      let ecoleId = session().ecole_id && ecoles.some(e => e.id === session().ecole_id) ? session().ecole_id : ecoles[0].id;
      const classesPrim = () => C.classes.filter(c => c.ecole_id === ecoleId && EG.NIVEAUX_PRIM.indexOf(c.niveau) >= 0)
        .sort((a, b) => EG.NIVEAUX_PRIM.indexOf(a.niveau) - EG.NIVEAUX_PRIM.indexOf(b.niveau) || String(a.libelle || a.code).localeCompare(String(b.libelle || b.code), 'fr'));
      let classeId = options.classe_id || (classesPrim()[0] || {}).id || '';
      const zoneE = el('div'), zoneN = el('div'), resultat = el('div');
      const dessiner = () => {
        zoneE.textContent = ''; zoneN.textContent = '';
        if (ecoles.length > 1 && !session().ecole_id) zoneE.appendChild(U.selecteur('École', ecoles.map(e => ({ value: e.id, label: e.nom })), ecoleId, v => { ecoleId = v; classeId = (classesPrim()[0] || {}).id || ''; dessiner(); }, { vide: false }));
        const fE = el('input', { type: 'file', accept: '.xlsx', 'aria-label': 'Modèle des élèves rempli', style: 'display:none' });
        fE.addEventListener('change', () => { const f = fE.files[0]; fE.value = ''; if (f) importerElevesUI(f, ecoleId, C, resultat); });
        zoneE.appendChild(el('div', { class: 'barre-actions' }, [
          el('strong', { text: '\uE01F Élèves par classe' }),
          el('button', { class: 'btn btn-primaire', type: 'button', text: '\uE009 Exporter (modèle EDUCMaster rempli)', onclick: () => exporterEleves(ecoleId).then(n => U.toast(n + ' élève(s) exporté(s)')).catch(e => U.toast(e.message, 'danger')) }),
          EG.peutEcrire() ? el('button', { class: 'btn btn-fantome', type: 'button', text: '\uE00A Importer le modèle des élèves', onclick: () => fE.click() }) : null, fE
        ]));
        const cls = classesPrim();
        const fN = el('input', { type: 'file', accept: '.xlsx', 'aria-label': 'Modèle des notes rempli', style: 'display:none' });
        fN.addEventListener('change', () => { const f = fN.files[0]; fN.value = ''; if (f) importerNotesUI(f, classeId, C, resultat); });
        zoneN.appendChild(el('div', { class: 'barre-actions' }, cls.length ? [
          el('strong', { text: '\uE00E Notes du primaire' }),
          U.selecteur('Classe', cls.map(c => ({ value: c.id, label: c.libelle || c.code })), classeId, v => { classeId = v; }, { vide: false }),
          el('button', { class: 'btn btn-primaire', type: 'button', text: '\uE009 Exporter les notes (modèle EDUCMaster)', onclick: () => exporterNotes(classeId).then(x => U.toast(x.notes + ' note(s), ' + x.eleves + ' élève(s)' + (x.sansMatricule ? ' — ' + x.sansMatricule + ' sans matricule EDUCMaster' : ''), x.sansMatricule ? 'attention' : '')).catch(e => U.toast(e.message, 'danger')) }),
          EG.peutEcrire() ? el('button', { class: 'btn btn-fantome', type: 'button', text: '\uE00A Importer les notes', onclick: () => fN.click() }) : null, fN
        ] : [el('strong', { text: '\uE00E Notes du primaire' }), el('span', { class: 'muet', text: 'Aucune classe du primaire dans cette école.' })]));
      };
      corps.append(zoneE, zoneN, resultat);
      dessiner();
    });
    return zone;
  }

  function importerElevesUI(fichier, ecoleId, C0, resultat) {
    Promise.all([EG.Tableur.lireClasseur(fichier), contexte()]).then(([feuilles, C]) => {   // données relues : un import précédent est pris en compte
      const choix = {};
      const besoins = FEUILLES_CLASSE.filter(([nom, niveaux]) => feuilles.some(f => sa(f.nom) === sa(nom) && f.lignes.length > 1)
        && C.classes.filter(c => c.ecole_id === ecoleId && niveaux.indexOf(c.niveau) >= 0).length > 1);
      const lancer = () => {
        const r = analyserEleves(feuilles, ecoleId, choix, C);
        const resume = [r.aCreer.length + ' élève(s) à créer et inscrire', r.aCompleter.length + ' fiche(s) complétée(s) (champs vides seulement)', r.inchanges + ' déjà à jour'];
        if (!r.aCreer.length && !r.aCompleter.length) { resultat.textContent = ''; resultat.appendChild(rapport('Rien à enregistrer.', r, resume)); return; }
        U.modal('Importer les élèves (modèle EDUCMaster)', rapport('Vérifiez avant d’enregistrer :', r, resume), fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
          el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
            fermer();
            enregistrerEleves(r).then(() => { resultat.textContent = ''; resultat.appendChild(rapport('Import terminé.', r, resume)); U.toast(r.aCreer.length + ' élève(s) créé(s), ' + r.aCompleter.length + ' complété(s)'); })
              .catch(e => U.toast('Import interrompu : ' + e.message, 'danger'));
          } })
        ]);
      };
      if (!besoins.length) return lancer();
      U.modal('Classe de chaque cours', el('div', { class: 'formulaire' }, besoins.map(([nom, niveaux]) => {
        const cls = C.classes.filter(c => c.ecole_id === ecoleId && niveaux.indexOf(c.niveau) >= 0);
        choix[nom] = cls[0].id;
        return U.selecteur('Feuille « ' + nom + ' » : nouveaux élèves dans', cls.map(c => ({ value: c.id, label: c.libelle || c.code })), choix[nom], v => { choix[nom] = v; }, { vide: false });
      })), fermer => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }), el('button', { class: 'btn btn-primaire', text: 'Continuer', onclick: () => { fermer(); lancer(); } })]);
    }).catch(e => U.toast('Fichier illisible : ' + e.message, 'danger'));
  }

  function importerNotesUI(fichier, classeId, C0, resultat) {
    Promise.all([EG.Tableur.lireClasseur(fichier), contexte()]).then(([feuilles, C]) => {
      const r = analyserNotes(feuilles, classeId, C);
      const resume = [r.notes.length + ' note(s) à enregistrer (ramenées sur 20)'].concat(r.feuilles);
      if (!r.notes.length) { resultat.textContent = ''; resultat.appendChild(rapport('Aucune note lisible.', r, resume)); return; }
      U.modal('Importer les notes (modèle EDUCMaster)', rapport('Vérifiez avant d’enregistrer :', r, resume), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', { class: 'btn btn-primaire', text: 'Enregistrer les notes', onclick: () => {
          fermer();
          enregistrerNotes(r).then(() => { resultat.textContent = ''; resultat.appendChild(rapport('Import des notes terminé.', r, resume)); U.toast(r.notes.length + ' note(s) enregistrée(s)'); })
            .catch(e => U.toast('Import interrompu : ' + e.message, 'danger'));
        } })
      ]);
    }).catch(e => U.toast('Fichier illisible : ' + e.message, 'danger'));
  }

  EG.EducMasterModeles = { bloc, feuillesEleves, donneesNotes, COLONNES_CLASSE, exporterEleves, exporterNotes, analyserEleves, analyserNotes, enregistrerEleves, enregistrerNotes, contexte, FEUILLES_CLASSE, FEUILLES_NOTES, MATIERES_MODELE };
})(window);
