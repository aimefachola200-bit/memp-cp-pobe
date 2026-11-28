/* ÉduGestion Pro Master — « Listes de classe » (accès rapide, lecture seule) : adaptateur du moteur commun js/listes-classe.js.
   Élèves inscrits (statut actif) de l'année en cours, dans le périmètre du compte ; l'enseignant voit sa classe.
   Classes : celles de l'école (une classe jumelée ou multigrade réunit ses cours, champ « regroupement »). */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, el = U.el, Routeur = U.Routeur;
  const session = () => EG.session;
  const LIB_MAT = { EM1: 'Maternelle 1', EM2: 'Maternelle 2', PETITS: 'Petits', MOYENS: 'Moyens', GRANDS: 'Grands' };
  let cache = null;
  const MODELES = 'assets/educmaster/';
  /** Personnel en activité de l'école -> modèle officiel « Mes agents » d'EducMaster (aussi depuis la liste du personnel) */
  async function exporterAgents(ecoleId) {
    ecoleId = ecoleId || session().ecole_id;
    if (!ecoleId) { U.toast('Choisissez d’abord l’école.', 'attention'); return; }
    const [ecoles, pers] = await Promise.all([EG.Ecrans.charger('ecoles'), EG.Ecrans.charger('personnels')]);
    const e = ecoles.find(x => x.id === ecoleId); if (!e) { U.toast('École hors de votre périmètre.', 'attention'); return; }
    const l = pers.filter(p => p.ecole_id === ecoleId && p.actif !== false);
    if (!l.length) { U.toast('Aucun agent en activité pour cette école.', 'attention'); return; }
    const b = await global.ModeleXlsx.EducMaster.agents(MODELES, l.map(p => ({ matricule: p.matricule, idAnpe: '', nom: p.nom, prenoms: p.prenoms, sexe: p.sexe, dateNaiss: p.date_naissance,
      lieuNaiss: p.lieu_naissance, tel: p.telephone, email: p.email, ifu: '', datePriseService: p.date_premiere_prise_service })));
    EG.Sortie.enregistrer('EducMaster_agents_' + EG.Sortie.slug(e.nom || 'ecole').slice(0, 30) + '_' + session().annee_code + '.xlsx', b);
    DB.audit('EDUCMASTER_EXPORT_AGENTS', 'personnels', null, { ecole: e.nom, agents: l.length });
  }
  async function contexte() {
    const an = session().annee_id;
    const [ecoles, classes, ins, eleves] = await Promise.all([EG.Ecrans.charger('ecoles'), DB.where('classes', { annee_scolaire_id: an }),
      EG.Ecrans.charger('inscriptions_eleves', { annee_scolaire_id: an }), DB.all('eleves')]);
    const u = session().user || {};
    let maClasse = null;
    if (u.role === 'ENSEIGNANT') maClasse = classes.find(c => c.id === u.classe_id) || classes.find(c => u.personnel_id && c.titulaire_id === u.personnel_id) || null;
    const ids = new Set(ecoles.map(e => e.id));
    const ie = {}; eleves.forEach(e => { ie[e.id] = e; });
    cache = { ecoles, classes: classes.filter(c => ids.has(c.ecole_id) && c.actif !== false), ins: ins.filter(i => (i.statut || 'ACTIF') === 'ACTIF' && ids.has(i.ecole_id) && ie[i.eleve_id]), ie, maClasse };
    return cache;
  }
  const coursDe = (c) => { const O = global.ClassesOrg, r = O ? O.coursDe(c.regroupement || '') : []; return r.length > 1 ? r : [c.niveau]; };
  function adaptateur() {
    return {
      app: 'ÉduGestion Pro Master',
      annee: () => session().annee_code || '',
      ecoles: async () => { const C = await contexte(); return (C.maClasse ? C.ecoles.filter(e => e.id === C.maClasse.ecole_id) : C.ecoles).map(e => ({ id: e.id, nom: e.nom })).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')); },
      cours: async (ecoleId) => {
        const C = cache || await contexte(), pres = new Set(C.ins.filter(i => i.ecole_id === ecoleId).map(i => i.niveau).concat(C.classes.filter(c => c.ecole_id === ecoleId).map(c => c.niveau)));
        const mat = EG.NIVEAUX_MAT.filter(n => pres.has(n)), prim = (EG.NIVEAUX || []).filter(n => EG.NIVEAUX_MAT.indexOf(n) < 0);
        return (prim.some(n => pres.has(n)) || !mat.length ? prim : []).concat(mat);
      },
      charger: async (ecoleId) => {
        const C = cache || await contexte();
        let classes = C.classes.filter(c => c.ecole_id === ecoleId);
        if (C.maClasse) classes = classes.filter(c => c.id === C.maClasse.id);
        const cls = classes.map(c => ({ id: c.id, cours: coursDe(c), lib: c.libelle || c.code || (coursDe(c).join('-')) }));
        const permises = new Set(classes.map(c => c.id));
        const eleves = C.ins.filter(i => i.ecole_id === ecoleId && (!C.maClasse || permises.has(i.classe_id))).map(i => {
          const e = C.ie[i.eleve_id];
          return { id: i.id, nom: String(e.nom || '').toUpperCase(), prenoms: e.prenoms || '', sexe: e.sexe === 'F' ? 'F' : 'G', dateNaiss: e.date_naissance || '', lieuNaiss: e.lieu_naissance || e.commune_naissance || '',
            matricule: e.educmaster_matricule || e.matricule_ecole || '', educmaster: e.educmaster_matricule || '', statut: i.redoublant ? 'Redoublant' : 'Nouveau',
            contact: [e.tuteur_telephone, e.tuteur_nom].filter(Boolean).join(' — '), cours: i.niveau, classeId: i.classe_id || null };
        });
        return { classes: cls, eleves };
      },
      ouvrir: (id) => Routeur.aller('eleve/' + id),
      entete: async (e) => {
        const ecole = e ? (cache.ecoles.find(x => x.id === e.id) || null) : null;
        const ctx = EG.Sortie.contexteTerritoire ? await EG.Sortie.contexteTerritoire(ecole) : {};
        return EG.Docs.enteteAdministratif(ecole, ctx);
      },
      excel: async (nom, feuilles) => EG.Sortie.excel(nom, feuilles),
      // modèle d'importation d'EducMaster (celui de « Modèles EducMaster » › exporter les élèves) : importable tel quel
      // modèles officiels d'EducMaster (assets/educmaster, copies inchangées ; outils/lots/spec-educmaster.md)
      excelNotes: async (o) => {
        const id = o.classeId || (o.classes.length === 1 ? o.classes[0].id : '');
        if (!id) { U.toast('Choisissez d’abord la classe : le modèle des notes d’EducMaster se remplit par classe.', 'attention'); return; }
        if (EG.NIVEAUX_MAT.indexOf(o.cours) >= 0) { U.toast('Le modèle des notes d’EducMaster concerne le primaire (CI à CM2).', 'attention'); return; }
        const M = EG.EducMasterModeles, C = await M.contexte(), classe = C.classes.find(c => c.id === id);
        const r = M.donneesNotes(C, classe), b = await global.ModeleXlsx.EducMaster.notes(MODELES, r.parFeuille);
        EG.Sortie.enregistrer('EducMaster_notes_' + EG.Sortie.slug(classe.libelle || classe.code || 'classe') + '_' + session().annee_code + '.xlsx', b);
        if (r.sansMatricule) U.toast(r.sansMatricule + ' élève(s) sans matricule EducMaster', 'attention');
      },
      excelAgents: async (o) => exporterAgents(o.ecole ? o.ecole.id : null),
      excelEducmaster: async (ids, o) => {
        const set = new Set(ids);
        const l = cache.ins.filter(i => set.has(i.id) && i.niveau === o.cours).map(i => { const e = cache.ie[i.eleve_id];
          return { nom: e.nom, prenoms: e.prenoms, sexe: e.sexe, dateNaiss: e.date_naissance, lieuNaiss: e.lieu_naissance || e.commune_naissance, tel: e.tuteur_telephone, nationalite: e.nationalite, npi: e.npi }; });
        EG.Sortie.enregistrer(o.nom + '.xlsx', await global.ModeleXlsx.EducMaster.eleves(MODELES, o.cours, l));
        DB.audit('EDUCMASTER_EXPORT_ELEVES', 'eleves', null, { ecole: o.ecole && o.ecole.nom, classe: o.classe, eleves: l.length });
      },
      libCours: (c) => LIB_MAT[c] || c
    };
  }
  Routeur.definir('listes-classe', function (racine) {
    racine.appendChild(EG.Ecrans.entete('Listes de classe', 'Élèves par cours et par classe — lecture seule ; les inscriptions restent dans « Élèves »'));
    const zone = el('div'); racine.appendChild(zone);
    if (!global.ListesClasse) { zone.appendChild(U.vide('Module indisponible : rechargez l’application.')); return; }
    global.ListesClasse.monter(zone, adaptateur()).catch(e => { console.error(e); zone.appendChild(U.vide('Les listes de classe n’ont pas pu s’ouvrir.')); });
  });
  EG.ListesClasse = { adaptateur, exporterAgents };
})(window);
