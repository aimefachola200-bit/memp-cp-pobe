/* ÉduGestion Pro Master — Bureaux UASCEP (module commun js/uascep.js, le même que CS Pobè, Mon école, MEMP-CP et DOSP).

   uascep   membres et responsables des bureaux de l'UASCEP par école, unité pédagogique, zone pédagogique,
            circonscription et direction départementale : ajouter, modifier, supprimer, réinitialiser (l'ancien
            bureau gardé dans « Anciens bureaux »), renouvellement, synthèse, impression / PDF, Excel (export et
            import, mêmes colonnes dans toutes les applications).

   Périmètre : directeur = le bureau de son école (son UP et sa zone en consultation) ; conseiller pédagogique =
   sa zone ; circonscription = ses écoles, UP, zones et la circonscription ; DDEMP = son département ;
   administration = tout. Données : méta « uascep » (sauvegardée et restaurée avec le reste de la base). */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const sa = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function contexte() {
    return Promise.all([DB.all('territoires'), DB.all('ecoles')]).then(([terr, ecoles]) => {
      const index = E.indexer(terr), user = EG.session.user, P = EG.Perimetre, role = user.role;
      const directeur = !!EG.session.ecole_id;
      let p, ecolesP;
      if (directeur) {
        const ec = ecoles.find(e => e.id === EG.session.ecole_id);
        ecolesP = ec ? [ec] : [];
        p = { zone: ec && ec.zone_id, cs: ec && ec.territoire_id, dep: ec ? P.departementDe(ec, index) : null, bloque: !ec };
      } else { p = P.portee(user, index); ecolesP = p.bloque ? [] : ecoles.filter(e => P.dansPortee(e, p, index)); }
      const anc = (t, type) => P.ancetre(index, t.id, type);
      const dansP = (t) => {
        if (p.bloque) return false;
        if (directeur) return t.type === 'ZONE_PEDAGOGIQUE' ? t.id === p.zone : t.type === 'UNITE_PEDAGOGIQUE' ? ecolesP.some(e => e.up_id === t.id) : false;
        if (p.zone) return t.id === p.zone || (anc(t, 'ZONE_PEDAGOGIQUE') || {}).id === p.zone;
        if (p.cs) return t.id === p.cs || (anc(t, 'CIRCONSCRIPTION') || {}).id === p.cs;
        if (p.dep) return t.id === p.dep || (anc(t, 'DEPARTEMENT') || {}).id === p.dep;
        return true;
      };
      const tri = (a, b) => String(a.lib).localeCompare(String(b.lib), 'fr', { numeric: true });
      const zones = terr.filter(t => t.type === 'ZONE_PEDAGOGIQUE' && dansP(t)).map(t => ({ cle: t.id, lib: t.nom, zone: t.id, cs: (anc(t, 'CIRCONSCRIPTION') || {}).id || '', alias: [t.code].filter(Boolean) })).sort(tri);
      const multiZ = zones.length > 1;
      const ups = terr.filter(t => t.type === 'UNITE_PEDAGOGIQUE' && dansP(t)).map(t => {
        const z = anc(t, 'ZONE_PEDAGOGIQUE');
        return { cle: t.id, lib: t.nom + (multiZ && z ? ' — ' + z.nom : ''), nomUp: t.nom, up: t.nom, zone: z ? z.id : '', rup: t.responsable || '', alias: [t.nom, t.code].filter(Boolean) };
      }).sort(tri);
      const ecolesE = ecolesP.map(e => {
        const up = e.up_id ? index[e.up_id] : null;
        const csE = e.territoire_id && index[e.territoire_id] && index[e.territoire_id].type === 'CIRCONSCRIPTION' ? e.territoire_id : ((anc(index[e.zone_id] || {}, 'CIRCONSCRIPTION') || {}).id || ''), depE = e.departement_id || (P.departementDe(e, index) || {}).id || P.departementDe(e, index) || '';
        return { cle: e.id, lib: e.nom, ecole: e.nom, zone: e.zone_id || '', cs: csE, dep: typeof depE === 'object' ? '' : depE, up: up ? up.nom : '', rup: up ? up.responsable || '' : '', alias: [e.code, e.code_educmaster].filter(Boolean) };
      }).sort(tri);
      const css = directeur ? [] : terr.filter(t => t.type === 'CIRCONSCRIPTION' && dansP(t)).map(t => ({ cle: t.id, lib: /circonscription/i.test(t.nom) ? t.nom : 'Circonscription scolaire de ' + t.nom, alias: [t.nom, t.code].filter(Boolean) })).sort(tri);
      const deps = directeur ? [] : terr.filter(t => t.type === 'DEPARTEMENT' && (!p.dep ? !p.cs && !p.zone : t.id === p.dep)).map(t => ({ cle: t.id, lib: 'DDEMP ' + t.nom, alias: [t.nom, 'DDEMP du ' + t.nom, t.code].filter(Boolean) })).sort(tri);
      const NIV = { DIRECTEUR: ['ECOLE', 'UP', 'ZONE'], CONSEILLER_PEDAGOGIQUE: ['ECOLE', 'UP', 'ZONE'], CS: ['ECOLE', 'UP', 'ZONE', 'CS'], DDEMP: ['ECOLE', 'UP', 'ZONE', 'CS', 'DDEMP'] };
      const niveaux = directeur ? ['ECOLE', 'UP', 'ZONE'] : (NIV[role] || ['ECOLE', 'UP', 'ZONE', 'CS', 'DDEMP']);
      const peutEcrire = EG.peutEcrire();
      const ecrire = (niv) => peutEcrire && (directeur ? niv === 'ECOLE' : niveaux.indexOf(niv) >= 0);
      const lieuT = directeur ? (p.cs && index[p.cs]) : (p.cs ? index[p.cs] : p.dep ? index[p.dep] : null);
      const autorite = directeur ? (ecolesE[0] ? { niveau: 'ECOLE', cle: ecolesE[0].cle } : null) : p.zone ? { niveau: 'ZONE', cle: p.zone } : p.cs ? { niveau: 'CS', cle: p.cs } : p.dep ? { niveau: 'DDEMP', cle: p.dep } : null;
      return { niveaux, autorite, lieu: lieuT ? String(lieuT.nom).replace(/^(circonscription( scolaire)?|cs)\s+(de\s+)?/i, '') : '', fixe: { zone: directeur || !!p.zone },
        entites: { ECOLE: ecolesE, UP: ups, ZONE: zones, CS: css, DDEMP: deps }, droits: { ecrire } };
    });
  }

  /* ---------- cachets, visas et code QR (outils de l'application : Cachets, Signatures des acteurs, registre des documents) ---------- */
  const D = () => EG.Docs;
  function cachet(o) {
    const c = String(o.couleur || 'bleu').toUpperCase();
    if (o.forme !== 'rond' || !D() || !D().COULEURS_CACHET[c]) return null;
    return D().cachet({ cachet_haut: o.haut, cachet_centre: o.centre, cachet_bas: o.bas, cachet_couleur: c }, { taille: o.taille || 104 });
  }
  /** Visa : le directeur (signature et cachet de l'école), le RUP / CP (nom), le chef de circonscription et le DDEMP (signature et cachet du territoire) */
  function visa(niv, cle) {
    if (niv === 'ECOLE') return DB.get('ecoles', cle).then(e => e ? { titre: 'Le Directeur / La Directrice', nom: e.directeur_nom || '', signature: e.signature_directeur || '', cachet: D().cachetComplet(e) } : null);
    return DB.get('territoires', cle).then(t => {
      if (!t) return null;
      if (niv === 'CS' || niv === 'DDEMP') return { titre: niv === 'CS' ? 'Le Chef de la circonscription scolaire' : 'Le Directeur départemental', nom: t.responsable || '', signature: t.signature_image || '', cachet: D().cachetTerritoireComplet(t) };
      return t.responsable ? { nom: t.responsable } : null;
    });
  }
  /** Pièce signée : numéro, empreinte, registre « documents » (page verification.html) et code QR */
  function signer(doc) {
    const u = EG.session.user, r = doc.resume || {};
    const numero = 'UASCEP-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
    const hash = EG.empreinte(doc.empreinte + numero);
    return DB.put('documents', { numero, type_code: 'UASCEP', titre: doc.typeLib + ' — ' + (r.bureau || ''), ecole_id: EG.session.ecole_id || null, annee_scolaire_id: EG.session.annee_id,
      orientation: 'PORTRAIT', sensibilite: 'INTERNE', statut: 'GENERE', hash_sha256: hash, uascep: Object.assign({ code: doc.type }, r),
      source: { kind: 'uascep', type: doc.type, bureauIds: doc.bureauIds || [], membreId: doc.membreId || null, options: doc.options || null } })
      .then(d => DB.put('signatures_documents', { document_id: d.id, signataire_label: r.signataire || ((u.prenoms || '') + ' ' + u.nom).trim(), role_signature: 'UASCEP — ' + (r.fonction || doc.typeLib),
        type_signature: 'NUMERIQUE', hash_document: hash, signed_at: new Date().toISOString() }))
      .then(() => { DB.audit('GENERATION_DOCUMENT', 'documents', numero, { type: 'UASCEP', piece: doc.type }); if (EG.majSynchro) EG.majSynchro(); })
      .then(() => ({ numero, code: hash, qr: D().qrDocument(numero, hash, 96),
        mention: 'Scannez le code QR : la page de vérification d’ÉduGestion Pro Master retrouve la pièce dans le registre de l’établissement et contrôle son empreinte.' }));
  }

  /** Adaptateur des bureaux UASCEP (réutilisé par « Pilotage et vie scolaire ») */
  function adaptateur() {
    return {
      app: 'ÉduGestion Pro Master', sansTitre: true,
      charger: () => DB.meta('uascep'),
      enregistrer: (etat) => DB.setMeta('uascep', etat).then(() => { if (EG.majSynchro) EG.majSynchro(); }),
      contexte,
      toast: (m) => U.toast(m),
      memo: { get: (k) => { try { return localStorage.getItem('eg.uascep.' + k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem('eg.uascep.' + k, v); } catch (e) { /* indisponible */ } } },
      cachet, visa, signer,
      imprimer: (titre, corps, o) => EG.Sortie.imprimer(titre, corps, { paysage: !(o && o.portrait) }),
      xlsxEcrire: (feuilles) => Promise.resolve(global.XlsxEcrire.classeur(feuilles)),
      xlsxLire: (f) => EG.Tableur.lireClasseur(f).then(fs => fs.map(x => ({ nom: x.nom || x.name, lignes: x.lignes || x.rows || [] }))),
      telecharger: (nom, blob) => EG.Sortie.enregistrer(nom, blob)
    };
  }

  Routeur.definir('uascep', function (racine) {
    if (!EG.peutVoirModule('uascep')) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; }
    racine.appendChild(E.entete('Bureaux UASCEP', 'Membres et responsables des bureaux de l’UASCEP par école, unité pédagogique, zone pédagogique, circonscription et département.'));
    const zone = el('div'); racine.appendChild(zone);
    if (!global.UASCEP) { zone.appendChild(U.vide('Module indisponible : rechargez l’application.')); return; }
    global.UASCEP.monter(zone, adaptateur()).catch(e => { console.error(e); zone.appendChild(U.vide('Le module n’a pas pu s’ouvrir.')); });
  });

  EG.Uascep = { contexte, adaptateur };
})(window);
