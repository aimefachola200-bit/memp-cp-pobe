/* ÉduGestion Pro Master — « Pilotage et vie scolaire » (module commun js/pvs.js, catalogue js/pvs-modules.js, les mêmes que
   CS Pobè, Mon école, MEMP-CP et DOSP) : sport scolaire, tableau de bord du pilotage (lot A).
   Entités, droits, cachets, visas : ceux des bureaux UASCEP (js/uascep-eg.js). Données : méta « pvs ».
   Pièces signées : registre « documents » (type PVS), vérifiables par verification.html.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, E = EG.Ecrans;
  const ECRANS = { 'pvs-sport': ['sport', 'Sport scolaire', 'Licences, compétitions par niveau, tirage au sort, calendrier, feuilles de match, classements, palmarès, qualifiés et diplômes signés.'],
    'pvs-pilotage': ['pilotage', 'Tableau de bord du pilotage', 'Indicateurs par école, UP, zone, circonscription et département, graphiques et comparaisons.'],
    'pvs-communication': ['communication', 'Communication et alertes', 'Notes de service, circulaires, convocations avec accusé de réception, échéances, messages aux parents, agenda partagé.'],
    'pvs-sante': ['sante', 'Santé et inclusion', 'Visites médicales et aptitude sportive, infirmerie, élèves à besoins spécifiques, scolarisation des filles.'],
    'pvs-inspection': ['inspection', 'Formation et animations pédagogiques', 'Plans de formation, animations pédagogiques d’UP et de zone, attestations de participation.'],
    'pvs-patrimoine': ['patrimoine', 'Manuels, besoins et dotations', 'Manuels scolaires par cours et matière, besoins exprimés, dotations reçues et PV de réception.'],
    'pvs-territoire': ['territoire', 'Territoire et suivi administratif', 'Fiche statistique de rentrée validée par la circonscription et le département, fiche signalétique (GPS, eau, latrines, électricité, agrément), référentiel des structures, décisions transmises.'],
    'pvs-examens': ['examens', 'Examens et concours', 'CEP : épreuves, centres, jurys, candidats, numéros de table, notes, délibération, résultats ; concours scolaires.'] };
  const I = (n) => (global.Icones ? global.Icones.code(n) + ' ' : '');

  function signer(doc) {
    const u = EG.session.user, r = doc.resume || {};
    const numero = 'PVS-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6) + Math.floor(Math.random() * 10);
    const hash = EG.empreinte(doc.empreinte + numero);
    return DB.put('documents', { numero, type_code: 'PVS', titre: doc.typeLib + ' — ' + (r.objet || r.entite || ''), ecole_id: EG.session.ecole_id || null, annee_scolaire_id: EG.session.annee_id,
      orientation: 'PORTRAIT', sensibilite: 'INTERNE', statut: 'GENERE', hash_sha256: hash, pvs: Object.assign({ code: doc.type, module: doc.module }, r),
      source: { kind: 'pvs', type: doc.type, ref: doc.ref || {} } })
      .then(d => DB.put('signatures_documents', { document_id: d.id, signataire_label: r.signataire || ((u.prenoms || '') + ' ' + u.nom).trim(), role_signature: r.type || doc.typeLib,
        type_signature: 'NUMERIQUE', hash_document: hash, signed_at: new Date().toISOString() }))
      .then(() => { DB.audit('GENERATION_DOCUMENT', 'documents', numero, { type: 'PVS', piece: doc.type }); if (EG.majSynchro) EG.majSynchro(); })
      .then(() => ({ numero, code: hash, qr: EG.Docs.qrDocument(numero, hash, 96),
        mention: 'Scannez le code QR : la page de vérification d’ÉduGestion Pro Master retrouve la pièce dans le registre de l’établissement et contrôle son empreinte.' }));
  }

  /* ---------- indicateurs calculés : inscriptions, classes, personnel ---------- */
  function anneeId(code) {
    return DB.all('annees_scolaires').then(l => { const a = l.find(x => x.code === code || x.libelle === code || String(x.code || '').replace(/\D+/g, '-') === code); return a ? a.id : null; });
  }
  function indicateurs(annee) {
    const tous = (n) => DB.all(n).catch(() => []);
    return Promise.all([anneeId(annee), tous('inscriptions_eleves'), tous('eleves'), tous('classes'), tous('personnels'), tous('resultats_cep')]).then(([aid, ins, els, cls, pers, cep]) => {
      const out = {}, el = new Map(els.map(e => [e.id, e]));
      const add = (ec, k, n) => { const o = out[ec] = out[ec] || {}; o[k] = (o[k] || 0) + n; };
      if (aid) {
        ins.filter(i => i.annee_scolaire_id === aid && i.ecole_id).forEach(i => { const e = el.get(i.eleve_id) || {}; add(i.ecole_id, e.sexe === 'F' ? 'effF' : 'effG', 1); if (i.redoublant) add(i.ecole_id, e.sexe === 'F' ? 'redoublantsF' : 'redoublantsG', 1); });
        // classes ouvertes : une classe jumelée ou multigrade compte pour une classe (outils/lots/spec-classes.md)
        const parEc = new Map(); cls.filter(c => c.annee_scolaire_id === aid && c.ecole_id && c.actif !== false).forEach(c => { if (!parEc.has(c.ecole_id)) parEc.set(c.ecole_id, []); parEc.get(c.ecole_id).push(c); });
        parEc.forEach((L, ec) => { const cl = EG.Classes && global.ClassesOrg ? global.ClassesOrg.compter(EG.Classes.organisation(L)) : { ouvertes: L.length, simples: L.length, jumelees: 0, multigrades: 0 };
          add(ec, 'groupes', cl.ouvertes); add(ec, 'classesSimples', cl.simples); add(ec, 'classesJumelees', cl.jumelees); add(ec, 'classesMultigrades', cl.multigrades); });
        const insId = new Map(ins.map(i => [i.id, i]));
        cep.forEach(r => { const i = insId.get(r.inscription_id); if (!i || i.annee_scolaire_id !== aid || !i.ecole_id) return; const e = el.get(i.eleve_id) || {}, sx = e.sexe === 'F' ? 'F' : 'G';
          if (r.inscrit !== false) add(i.ecole_id, 'cepInscrits' + sx, 1); if (r.a_compose) add(i.ecole_id, 'cepPresents' + sx, 1); if (r.admis) add(i.ecole_id, 'cepAdmis' + sx, 1); });
      }
      pers.filter(p => p.ecole_id && p.actif !== false && /ENSEIGNANT|DIRECTEUR/.test(p.fonction || '')).forEach(p => {
        add(p.ecole_id, 'enseignants', 1); if (p.sexe === 'F') add(p.ecole_id, 'enseignantsF', 1);
        const st = String(p.statut || p.qualite || p.emploi || '');
        add(p.ecole_id, /^(FE|APE)/i.test(st) ? 'ensFE' : /^(ACE|ACDPE)/i.test(st) ? 'ensContractuels' : /ACDPCTD|AME|communaut|volont/i.test(st) ? 'ensCommunautaires' : 'ensAutres', 1);
      });
      return out;
    });
  }
  /** Élèves inscrits d'une école (année en cours) pour les licences */
  function eleves(ecoleCle) {
    return Promise.all([DB.all('inscriptions_eleves'), DB.all('eleves')]).then(([ins, els]) => {
      const el = new Map(els.map(e => [e.id, e]));
      return ins.filter(i => i.ecole_id === ecoleCle && (!EG.session.annee_id || i.annee_scolaire_id === EG.session.annee_id)).map(i => el.get(i.eleve_id)).filter(Boolean)
        .map(e => ({ nom: e.nom, prenoms: e.prenoms, sexe: e.sexe, dateNaissance: e.date_naissance, lieuNaissance: e.lieu_naissance, cours: '' }));
    });
  }

  /** Absences des 30 derniers jours (présences ABSENT, demi-journées ; JOURNEE = 2) par élève d'une école */
  function absences(ecoleCle) {
    const lim = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return Promise.all([DB.all('presences').catch(() => []), DB.all('inscriptions_eleves').catch(() => []), DB.all('eleves').catch(() => [])]).then(([pr, ins, els]) => {
      const insE = new Map(ins.filter(i => i.ecole_id === ecoleCle).map(i => [i.id, i])), el = new Map(els.map(e => [e.id, e])), n = {};
      pr.filter(x => x.statut === 'ABSENT' && insE.has(x.inscription_id) && String(x.date_presence || '') >= lim).forEach(x => { n[x.inscription_id] = (n[x.inscription_id] || 0) + (x.periode === 'JOURNEE' ? 2 : 1); });
      return Object.entries(n).map(([id, k]) => { const i = insE.get(id), e = el.get(i.eleve_id) || {}; return { nom: e.nom || '', prenoms: e.prenoms || '', sexe: e.sexe || '', cours: i.niveau || '', absences: k }; });
    });
  }
  /** Candidats du CEP déjà inscrits dans l'application (fiches CEP) */
  function cepCandidats() {
    return Promise.all([DB.all('fiches_cep').catch(() => []), DB.all('inscriptions_eleves').catch(() => []), DB.all('eleves').catch(() => [])]).then(([fc, ins, els]) => {
      const i = new Map(ins.map(x => [x.id, x])), e = new Map(els.map(x => [x.id, x]));
      return fc.map(f => { const n = i.get(f.inscription_id) || {}, el = e.get(n.eleve_id) || {}; return { ecole: n.ecole_id, nom: el.nom, prenoms: el.prenoms, sexe: el.sexe, dateNaissance: el.date_naissance, lieuNaissance: el.lieu_naissance }; }).filter(x => x.ecole && x.nom);
    });
  }
  function adaptateur() {
    const base = EG.Uascep.adaptateur();
    return Object.assign({}, base, {
      app: 'ÉduGestion Pro Master', sansTitre: true,
      charger: () => DB.meta('pvs'),
      enregistrer: (etat) => DB.setMeta('pvs', etat).then(() => { if (EG.majSynchro) EG.majSynchro(); }),
      signer, indicateurs, eleves, absences,
      utilisateur: () => { const u = EG.session.user || {}; return ((u.prenoms || '') + ' ' + (u.nom || '')).trim(); },
      exclure: ['territoire.presences', 'sante.cantine', 'sante.stocks', 'sante.decrochage', 'inspection.visites', 'inspection.recommandations', 'patrimoine.batiments', 'patrimoine.tables', 'patrimoine.materiel'],
      cepCandidats,
      uascep: () => ({ charger: base.charger, enregistrer: base.enregistrer }),
      memo: { get: (k) => { try { return localStorage.getItem('eg.pvs.' + k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem('eg.pvs.' + k, v); } catch (e) { /* indisponible */ } } },
      ouvrir: (route) => { location.hash = '#/' + route; },
      liens: { inspection: [{ l: I('inspection') + 'Visites & recommandations', route: 'visites' }], patrimoine: [{ l: I('patrimoine') + 'Infrastructures, mobilier et matériel', route: 'patrimoine' }], examens: [{ l: I('diplome') + 'CEP & examens blancs', route: 'cep' }],
        communication: [{ l: I('courrier') + 'Archive des courriers', route: 'courriers' }, { l: I('cloche') + 'Centre d’alertes', route: 'alertes' }],
        sante: [{ l: I('repas') + 'Cantine (module de l’application)', route: 'cantine' }, { l: I('alerte') + 'Risques & décrochage', route: 'risques' }],
        sport: [{ l: I('insigne') + 'Bureaux UASCEP', route: 'uascep' }], pilotage: [{ l: I('courbe') + 'Statistiques', route: 'analytics' }, { l: I('alerte') + 'Risques & décrochage', route: 'risques' }] }
    });
  }

  Object.entries(ECRANS).forEach(([ecran, [mod, titre, sous]]) => {
    EG.UI.Routeur.definir(ecran, function (racine) {
      if (!EG.peutVoirModule(ecran)) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; }
      racine.appendChild(E.entete(titre, sous));
      const zone = U.el('div'); racine.appendChild(zone);
      if (!global.PVS || !EG.Uascep || !EG.Uascep.adaptateur) { zone.appendChild(U.vide('Module indisponible : rechargez l’application.')); return; }
      global.PVS.monter(zone, adaptateur(), mod).catch(e => { console.error(e); zone.appendChild(U.vide('Le module n’a pas pu s’ouvrir.')); });
    });
  });
  EG.Pvs = { adaptateur, ECRANS };
})(window);
