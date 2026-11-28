/* ÉduGestion Pro — module « Pédagogie » (moteur commun js/pedagogie.js, le même que CS Pobè, Mon école, MEMP-CP et DOSP) :
   programmes, guides, progressions annuelles, fiches de préparation, résumés, épreuves avec corrigés et planification
   jour / semaine / mois du CI au CM2. Contenus de SCOLARIS livrés avec l'espace CP (memp-cp/data/pedagogie/), chargés à la
   demande et gardés hors ligne. Lecture pour tous les comptes de l'école et de l'encadrement ; le directeur, le conseiller
   pédagogique, la circonscription, la DDEMP et l'administration ajoutent des notes (méta « pedagogieNotes »).
   L'enseignant arrive directement sur le cours de sa classe.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, E = EG.Ecrans;
  const ANNOTENT = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'CONSEILLER_PEDAGOGIQUE', 'DIRECTEUR'];
  const COURS = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
  /* Maternelle (niveaux EM1, EM2, PETITS, MOYENS, GRANDS) : contenus de la maternelle, section des petits ou des grands */
  const NIV_MAT = { EM1: 'petits', PETITS: 'petits', EM2: 'grands', MOYENS: 'grands', GRANDS: 'grands' };
  const enseigne = (c) => COURS.indexOf(c.niveau) >= 0 || !!NIV_MAT[c.niveau];
  let sectionCompte = '';
  const sansAccent = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  /** Classe de l'enseignant : celle choisie dans son compte (« Classe tenue »), sinon celle dont son agent est titulaire.
      Les anciens comptes reliés par le nom sont rattachés une fois pour toutes (agent et classe enregistrés dans le compte). */
  function classeDuCompte() {
    const u = EG.session.user || {};
    if (u.role !== 'ENSEIGNANT') return Promise.resolve(null);
    const annee = (x) => !EG.session.annee_id || x.annee_scolaire_id === EG.session.annee_id;
    return Promise.all([DB.all('personnels').catch(() => []), DB.all('classes').catch(() => [])]).then(([pers, cls]) => {
      let c = u.classe_id ? cls.find(x => x.id === u.classe_id) : null;
      if (!c && u.personnel_id) c = cls.find(x => x.titulaire_id === u.personnel_id && annee(x) && enseigne(x));
      if (c) return c;
      // ancien rattachement par le nom (comptes créés avant la 6.33.0) : migré dans le compte
      const moi = pers.filter(p => (!EG.session.ecole_id || p.ecole_id === EG.session.ecole_id) && sansAccent(p.nom) === sansAccent(u.nom) && (!u.prenoms || sansAccent(p.prenoms) === sansAccent(u.prenoms)));
      if (moi.length !== 1) return null;
      c = cls.find(x => x.titulaire_id === moi[0].id && annee(x) && enseigne(x)) || null;
      if (u.id) DB.get('users', u.id).then(r => { if (r && !r.personnel_id) { r.personnel_id = moi[0].id; if (c && !r.classe_id) r.classe_id = c.id; return DB.put('users', r); } }).catch(() => {});
      return c;
    });
  }
  /** Hors compte enseignant : une école maternelle (cycle MATERNELLE) ouvre le module sur la maternelle */
  function coursDeLEcole() {
    if (!EG.session.ecole_id) return Promise.resolve(null);
    return DB.get('ecoles', EG.session.ecole_id).then(e => (e && e.cycle === 'MATERNELLE' ? 'MAT' : null)).catch(() => null);
  }
  /** Périmètre de la préparation de classe : un enseignant n'ouvre que le cours de sa classe (et les cours regroupés
      d'une classe jumelée ou multigrade, ex. « CI-CP », ou ceux listés dans « Cours ouverts » de son compte). null = tous les cours. */
  function perimetreCours(c) {
    const u = EG.session.user || {};
    if (u.role !== 'ENSEIGNANT') return null;
    const ls = [];
    const ajoute = (t) => String(t || '').toUpperCase().split(/[^A-Z0-9]+/).forEach(x => { if (COURS.indexOf(x) >= 0 && ls.indexOf(x) < 0) ls.push(x); });
    ajoute(u.cours_ped);
    if (c) { if (NIV_MAT[c.niveau]) ls.push('MAT'); else if (COURS.indexOf(c.niveau) >= 0) ajoute(c.niveau); ajoute(c.regroupement); }
    return ls.length ? ls : null;
  }
  function coursDuCompte() {
    return classeDuCompte().then(c => {
      coursAutorisesCompte = perimetreCours(c);
      if (!c) return (EG.session.user || {}).role === 'ENSEIGNANT' ? null : coursDeLEcole();
      return (c.titulaire_id ? DB.get('personnels', c.titulaire_id).catch(() => null) : Promise.resolve(null)).then(p => {
        if (p) titulaireCompte = ((p.nom || '') + ' ' + (p.prenoms || '')).trim();
        if (NIV_MAT[c.niveau]) { sectionCompte = NIV_MAT[c.niveau]; return 'MAT'; }
        return COURS.indexOf(c.niveau) >= 0 ? c.niveau : null;
      });
    });
  }
  let titulaireCompte = '';
  let coursAutorisesCompte = null;
  function adaptateur(cours) {
    const u = EG.session.user || {};
    const liens = [{ l: 'Évaluations', route: 'evaluations', icone: 'fiche' }, { l: 'CEP et examens blancs', route: 'cep', icone: 'stade' }];
    if (EG.peutVoirModule('visites')) liens.unshift({ l: 'Visites et recommandations', route: 'visites', icone: 'inspection' });
    if (EG.peutVoirModule('pvs-examens')) liens.push({ l: 'Examens et concours', route: 'pvs-examens', icone: 'examen' });
    if (EG.peutVoirModule('documents-officiels')) liens.push({ l: 'Documents officiels', route: 'documents-officiels', icone: 'document' });
    return {
      app: 'ÉduGestion Pro', base: 'memp-cp/data/pedagogie/', coursParDefaut: cours || undefined, coursAutorises: coursAutorisesCompte || undefined, sectionParDefaut: sectionCompte || undefined,
      peutAnnoter: ANNOTENT.indexOf(u.role) >= 0, auteur: ((u.prenoms || '') + ' ' + (u.nom || '')).trim(),
      titulaire: () => u.role === 'ENSEIGNANT' ? (titulaireCompte || ((u.nom || '') + ' ' + (u.prenoms || '')).trim()) : '',
      notes: { charger: () => DB.meta('pedagogieNotes').then(v => v || {}), enregistrer: (o) => DB.setMeta('pedagogieNotes', o).then(() => { if (EG.majSynchro) EG.majSynchro(); }) },
      imprimer: (titre, html, o) => EG.Sortie.imprimer(titre, html, { paysage: false, enTete: o && o.epreuve ? false : undefined }),
      memo: { get: (k) => { try { return localStorage.getItem('eg.ped.' + k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem('eg.ped.' + k, v); } catch (e) { /* indisponible */ } } },
      liens, ouvrir: (route) => { location.hash = '#/' + route; },
      examenBlanc: EG.peutEcrire() && u.role !== 'ENSEIGNANT' ? { lire: () => DB.meta('examenBlancSujets'), retenir: (s) => DB.setMeta('examenBlancSujets', s) } : undefined
    };
  }

  U.Routeur.definir('pedagogie', function (racine) {
    if (!EG.peutVoirModule('pedagogie')) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; }
    racine.appendChild(E.entete('Pédagogie', 'Programmes, guides, progressions annuelles, fiches de préparation, résumés, épreuves avec corrigés et planification, de la maternelle au CM2.'));
    const zone = U.el('div'); racine.appendChild(zone);
    if (!global.Pedagogie) { zone.appendChild(U.vide('Module indisponible : rechargez l’application.')); return; }
    coursDuCompte().catch(() => null).then(c => global.Pedagogie.monter(zone, adaptateur(c), { cours: c || undefined }))
      .catch(e => { console.error(e); zone.appendChild(U.vide('Le module n’a pas pu s’ouvrir.')); });
  });
  EG.Pedagogie = { adaptateur };
})(window);
