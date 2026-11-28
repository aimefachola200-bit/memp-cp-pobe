/* ÉduGestion Pro Master — jeux de données des circonscriptions.

   Un « jeu de données » est un fichier livré avec l'application (dossier donnees/) qui décrit
   les écoles d'UNE circonscription, avec leurs statistiques : classes autorisées, personnel
   FE/ACDPE/ACDPCTD, élèves par cours et par sexe. Il ne contient aucune donnée personnelle.

   Règle d'or : un jeu n'entre que dans SA circonscription. Il n'est chargé (et copié dans la base
   de l'appareil) que si le compte a cette circonscription dans son périmètre et clique sur
   « Installer » ; un compte d'une autre circonscription ne peut ni le voir installé, ni le charger. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const sa = U.sansAccent;
  const nrm = t => sa(t).replace(/[^a-z0-9]+/g, ' ').trim();
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  const tri = (a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { numeric: true });
  const ROLES_GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS'];
  const peutGerer = () => ROLES_GESTION.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();

  /* =======================================================================
     Registre des jeux
     ======================================================================= */

  /** Les jeux livrés. Le contenu de chacun n'est lu qu'au moment de l'installer. */
  const CATALOGUE = [
    { id: 'pobe', departement: 'Plateau', circonscription: 'POBE', titre: 'Circonscription scolaire de Pobè' },
    { id: 'adja-ouere', departement: 'Plateau', circonscription: 'ADJA-OUERE', titre: 'Circonscription scolaire d’Adja-Ouèrè' },
    { id: 'ifangni', departement: 'Plateau', circonscription: 'IFANGNI', titre: 'Circonscription scolaire d’Ifangni' },
    { id: 'ketou-1', departement: 'Plateau', circonscription: 'KETOU 1', titre: 'Circonscription scolaire de Kétou 1' },
    { id: 'ketou-2', departement: 'Plateau', circonscription: 'KETOU 2', titre: 'Circonscription scolaire de Kétou 2' },
    { id: 'sakete', departement: 'Plateau', circonscription: 'SAKETE', titre: 'Circonscription scolaire de Sakété' }
  ];
  const registre = {}, promesses = {};

  function enregistrer(p) { registre[p.id] = p; }

  /** Charge le fichier du jeu (une seule fois) ; sans connexion, il vient du cache de l'application. */
  function charger(id) {
    if (registre[id]) return Promise.resolve(registre[id]);
    if (promesses[id]) return promesses[id];
    promesses[id] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'donnees/paquet-' + id + '.js';
      s.onload = () => registre[id] ? resolve(registre[id]) : reject(new Error('Jeu de données vide'));
      s.onerror = () => { delete promesses[id]; reject(new Error('Fichier du jeu de données introuvable')); };
      document.head.appendChild(s);
    });
    return promesses[id];
  }

  /** La circonscription du compte à laquelle le jeu est destiné (nom et département identiques), ou null. */
  function cibleDe(entree, ctx) {
    return ctx.terr.filter(t => {
      if (t.type !== 'CIRCONSCRIPTION' || nrm(t.nom) !== nrm(entree.circonscription)) return false;
      const d = EG.Perimetre.ancetre(ctx.index, t.id, 'DEPARTEMENT');
      return d && nrm(d.nom) === nrm(entree.departement);
    })[0] || null;
  }

  const CYCLES = { P: 'PRIMAIRE', M: 'MATERNELLE', X: 'MIXTE' };
  const COURS = { P: EG.NIVEAUX_PRIM, M: ['PETITS', 'GRANDS'], X: EG.NIVEAUX_PRIM };

  function codeSuivant(cs, pris) {
    const prefixe = cs.code || 'CS';
    const re = new RegExp('^' + prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(\\d+)$', 'i');
    let max = 0;
    pris.forEach(c => { const m = re.exec(c); if (m) max = Math.max(max, Number(m[1])); });
    let n = max + 1, code;
    do { code = prefixe + '-' + String(n++).padStart(3, '0'); } while (pris.has(code.toLowerCase()));
    return code;
  }

  /** Effectifs d'une ligne du jeu : { CI: [garçons, filles], … } et totaux. */
  function effectifsDe(e) {
    if (!e.e) return null;
    const noms = COURS[e.c] || COURS.P, out = {}; let g = 0, f = 0;
    noms.forEach((n, i) => { const a = e.e[2 * i] || 0, b = e.e[2 * i + 1] || 0; out[n] = [a, b]; g += a; f += b; });
    return { par_cours: out, garcons: g, filles: f };
  }

  /**
   * Installe un ou plusieurs lots d'un jeu dans sa circonscription.
   * choix = { lots: [id…], annees: { lotId: 'AAAA-AAAA' } }
   * Rend { crees, majs, stats, ecolesTotal }.
   */
  function installer(pack, entree, choix, progression) {
    const note = t => { if (progression) progression(t); };
    return E.contexteCS().then(ctx => {
      const cs = cibleDe(entree, ctx);
      if (!cs) throw new Error('La circonscription « ' + entree.circonscription + ' » n’existe pas dans cette application.');
      if (!ctx.idsCS[cs.id] || !peutGerer()) throw new Error('Ce jeu de données concerne une circonscription qui n’est pas dans votre périmètre.');
      const dep = EG.Perimetre.ancetre(ctx.index, cs.id, 'DEPARTEMENT');
      return Promise.all([DB.all('territoires'), DB.all('ecoles'), DB.all('statistiques_ecoles')]).then(([terr, ecoles, stats]) => {
        const idx = {}; terr.forEach(t => { idx[t.id] = t; });
        const crees = [], majs = [];
        const cacheT = {};
        /* Retrouve ou crée un territoire de géographie (commune, arrondissement) sous son parent. */
        const territoire = (type, nom, parent) => {
          if (!nom || !parent) return Promise.resolve(null);
          const cle = type + '|' + parent.id + '|' + nrm(nom);
          if (cacheT[cle]) return Promise.resolve(cacheT[cle]);
          const ex = terr.filter(t => t.type === type && t.parent_id === parent.id && nrm(t.nom) === nrm(nom))[0];
          if (ex) { cacheT[cle] = ex; return Promise.resolve(ex); }
          return DB.put('territoires', { type, nom, parent_id: parent.id, actif: true }).then(t => { terr.push(t); idx[t.id] = t; cacheT[cle] = t; return t; });
        };
        const doCS = ecoles.filter(e => e.territoire_id === cs.id);
        const pris = new Set(ecoles.map(e => String(e.code_ecole || '').trim().toLowerCase()).filter(Boolean));
        const enBase = {}; doCS.forEach(e => { enBase[nrm(e.nom) + '|' + (e.cycle || '')] = e; });
        const statsParEcole = {}; stats.forEach(s => { statsParEcole[s.ecole_id + '|' + s.annee_code] = s; });
        const aEnregistrer = { ecoles: [], stats: [] };
        const lots = pack.lots.filter(l => choix.lots.indexOf(l.id) >= 0);

        return territoire('COMMUNE', pack.commune, dep).then(commune => {
          /* La commune du jeu existe déjà dans le référentiel ; on la retrouve par son nom, sans en créer. */
          const communeTrouvee = commune || null;
          const suite = lots.reduce((p, lot) => p.then(() => lot.ecoles.reduce((q, ligne) => q.then(() => {
            return territoire('ARRONDISSEMENT', ligne.a, communeTrouvee).then(arr => {
              const cycle = CYCLES[ligne.c] || 'PRIMAIRE';
              const cle = nrm(ligne.n) + '|' + cycle;
              let ecole = enBase[cle];
              if (!ecole) {
                ecole = {
                  code_ecole: codeSuivant(cs, pris), nom: ligne.n, cycle, statut: lot.statut || 'PUBLIQUE',
                  departement_id: dep ? dep.id : null, commune_id: communeTrouvee ? communeTrouvee.id : null, commune: communeTrouvee ? communeTrouvee.nom : null,
                  arrondissement_id: arr ? arr.id : null, arrondissement: arr ? arr.nom : null,
                  territoire_id: cs.id, annee_creation: ligne.y || null, classes_autorisees: ligne.k === undefined ? null : ligne.k, actif: true
                };
                pris.add(ecole.code_ecole.toLowerCase());
                enBase[cle] = ecole; crees.push(ecole);
              } else {
                /* École déjà là : on complète seulement ce qui manque, sans rien écraser. */
                const maj = Object.assign({}, ecole); let change = false;
                const poser = (k, v) => { if ((maj[k] === null || maj[k] === undefined || maj[k] === '') && v) { maj[k] = v; change = true; } };
                if (arr) { poser('arrondissement_id', arr.id); poser('arrondissement', arr.nom); }
                if (communeTrouvee) { poser('commune_id', communeTrouvee.id); poser('commune', communeTrouvee.nom); }
                poser('annee_creation', ligne.y); poser('classes_autorisees', ligne.k); poser('statut', lot.statut);
                if (change) { enBase[cle] = maj; majs.push(maj); ecole = maj; }
              }
              const ef = effectifsDe(ligne);
              if (ef || ligne.p || ligne.k !== undefined) {
                aEnregistrer.stats.push({ lot, ligne, ecole, ef });
              }
            });
          }), Promise.resolve())), Promise.resolve());
          return suite.then(() => {
            note('Enregistrement des écoles…');
            return DB.putBatch('ecoles', crees.concat(majs.filter(m => crees.indexOf(m) < 0)));
          }).then(retour => {
            /* putBatch rend les écoles enregistrées (avec leurs identifiants) : on y rattache les statistiques. */
            const par = {}; retour.forEach(r => { par[nrm(r.nom) + '|' + (r.cycle || '')] = r; });
            const lignes = aEnregistrer.stats.map(({ lot, ligne, ecole, ef }) => {
              const vraie = par[nrm(ecole.nom) + '|' + (ecole.cycle || '')] || ecole;
              const annee = (choix.annees && choix.annees[lot.id]) || lot.annee;
              const ex = statsParEcole[vraie.id + '|' + annee];
              return Object.assign({}, ex || {}, {
                ecole_id: vraie.id, annee_code: annee, classes_autorisees: ligne.k === undefined ? null : ligne.k,
                personnel_fe: ligne.p ? ligne.p[0] : null, personnel_acdpe: ligne.p ? ligne.p[1] : null, personnel_ame: ligne.p ? ligne.p[2] : null,
                effectifs: ef ? ef.par_cours : null, total_garcons: ef ? ef.garcons : null, total_filles: ef ? ef.filles : null,
                source: 'Jeu de données « ' + pack.titre + ' » — ' + lot.libelle
              });
            });
            note('Enregistrement des statistiques…');
            return DB.putBatch('statistiques_ecoles', lignes).then(() => lignes.length);
          }).then(nbStats => DB.audit('INSTALLER_JEU_DONNEES', 'ecoles', null, { jeu: pack.id, circonscription: cs.nom, ecoles_creees: crees.length, ecoles_completees: majs.length, statistiques: nbStats })
            .then(() => EG.assurerFichesRecensement()).then(() => { EG.majSynchro(); return { crees: crees.length, majs: majs.length, stats: nbStats, cs }; }));
        });
      });
    });
  }

  EG.Paquets = { CATALOGUE, enregistrer, charger, cibleDe, installer, effectifsDe };

  /* =======================================================================
     Onglet « Jeux de données » de l'écran Import et export
     ======================================================================= */

  EG.OngletsImport = EG.OngletsImport || {};
  EG.OngletsImport.jeux = function (zone, etat, ctx, vivant) {
    zone.appendChild(el('p', { class: 'muet', text: 'Les jeux de données remplissent une circonscription avec ses écoles et leurs statistiques (classes autorisées, personnel, élèves par cours). Chacun n’entre que dans sa propre circonscription : aucune donnée d’une circonscription n’est jamais copiée dans une autre.' }));
    const dispo = CATALOGUE.map(en => ({ en, cs: cibleDe(en, ctx) })).filter(x => x.cs && ctx.idsCS[x.cs.id]);
    if (!dispo.length) {
      zone.appendChild(U.vide('Aucun jeu de données n’est prévu pour les circonscriptions de votre périmètre.'));
      return;
    }
    dispo.sort((a, b) => tri(a.cs, b.cs)).forEach(({ en, cs }) => {
      const nbEcoles = ctx.ecoles.filter(e => e.territoire_id === cs.id).length;
      const carte = el('div', { class: 'carte' }, [
        el('h3', { class: 'carte-titre', text: '\uE011 ' + en.titre }),
        el('p', { class: 'muet petit', text: nbEcoles ? nbEcoles + ' école(s) déjà enregistrée(s) dans cette circonscription.' : 'Aucune école enregistrée dans cette circonscription pour le moment.' })
      ]);
      const actions = el('div', { class: 'barre-actions' });
      if (peutGerer()) actions.appendChild(el('button', { class: 'btn btn-primaire', text: 'Voir et installer', onclick: () => ouvrir(en, cs) }));
      carte.appendChild(actions);
      zone.appendChild(carte);
    });

    function ouvrir(en, cs) {
      charger(en.id).then(pack => {
        const annees = {};
        const choixLots = {};
        DB.all('annees_scolaires').then(liste => {
          const codes = liste.map(a => a.code);
          const corps = el('div', {}, [
            el('p', { text: pack.titre + ' — ' + cs.nom + '.' }),
            el('p', { class: 'muet petit', text: pack.source })
          ]);
          pack.lots.forEach(lot => {
            choixLots[lot.id] = true; annees[lot.id] = lot.annee;
            const avecStats = lot.ecoles.filter(e => e.e).length;
            const sel = el('select', { 'aria-label': 'Année scolaire' }, Array.from(new Set(codes.concat([lot.annee]))).sort().map(c => {
              const o = el('option', { value: c, text: c }); if (c === lot.annee) o.selected = true; return o;
            }));
            sel.addEventListener('change', () => { annees[lot.id] = sel.value; });
            const coche = el('input', { type: 'checkbox', checked: true, onchange: e => { choixLots[lot.id] = e.target.checked; } });
            corps.appendChild(el('div', { class: 'carte' }, [
              el('label', { class: 'ligne-coche' }, [coche, el('strong', { text: ' ' + lot.libelle })]),
              el('p', { class: 'petit', text: pl(lot.ecoles.length, 'école') + ' dont ' + avecStats + ' avec les effectifs par cours.' }),
              lot.anneeModifiable
                ? el('div', { class: 'champ' }, [el('label', { text: 'Année scolaire de ces statistiques' }), sel, el('span', { class: 'muet petit', text: 'À corriger si ces chiffres portent sur une autre année.' })])
                : el('p', { class: 'muet petit', text: 'Année scolaire : ' + lot.annee + ' (indiquée dans le fichier d’origine).' })
            ]));
          });
          corps.appendChild(el('p', { class: 'muet petit', text: 'Les écoles déjà présentes (même nom) ne sont pas dupliquées : on n’y ajoute que ce qui manque, plus les statistiques de l’année choisie.' }));
          const etatMsg = el('p', { class: 'muet petit' });
          corps.appendChild(etatMsg);
          U.modal('Installer le jeu de données', corps, fermer => [
            el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
            el('button', {
              class: 'btn btn-primaire', text: 'Installer', onclick: ev => {
                const lots = Object.keys(choixLots).filter(k => choixLots[k]);
                if (!lots.length) { etatMsg.textContent = 'Cochez au moins un lot.'; return; }
                ev.target.disabled = true; etatMsg.textContent = 'Installation en cours…';
                installer(pack, en, { lots, annees }, t => { etatMsg.textContent = t; }).then(r => {
                  fermer();
                  U.modal('Jeu de données installé', el('div', {}, [
                    el('p', { class: 'ok-texte', text: pl(r.crees, 'école') + ' créée(s), ' + pl(r.majs, 'école') + ' complétée(s), ' + pl(r.stats, 'ligne') + ' de statistiques enregistrée(s) dans ' + r.cs.nom + '.' }),
                    el('p', { class: 'muet', text: 'Les écoles restent modifiables dans l’onglet « Écoles » (zone pédagogique, unité pédagogique, directeur…).' })
                  ]), f2 => [
                    el('button', { class: 'btn btn-fantome', text: 'Rester ici', onclick: () => { f2(); Routeur.aller('import-export/jeux'); } }),
                    el('button', { class: 'btn btn-fantome', text: 'Voir les statistiques', onclick: () => { f2(); Routeur.aller('stats-cs/' + r.cs.id); } }),
                    el('button', { class: 'btn btn-primaire', text: 'Voir les écoles', onclick: () => { f2(); Routeur.aller('gestion-ecoles?cs=' + r.cs.id); } })
                  ]);
                }).catch(err => { console.error(err); ev.target.disabled = false; etatMsg.textContent = 'Installation interrompue : ' + err.message; });
              }
            })
          ]);
        });
      }).catch(err => U.toast('Jeu de données indisponible : ' + err.message, 'danger'));
    }
  };
})(window);
