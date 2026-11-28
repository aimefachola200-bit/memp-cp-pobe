/* ÉduGestion Pro : module « Zone déshéritée » (agents des postes orange et rouge, prime de zone, liste par école). Noyau : zone-core.js.
   Données : entité zone_desheritee (un enregistrement par école, ou un enregistrement commun pour la circonscription). Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, E = EG.Ecrans;
  if (!EG || !U || !U.Routeur) return;
  U.Routeur.definir('zone-desheritee', function (racine) {
    if (!EG.peutVoirModule('zone-desheritee')) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; }
    racine.appendChild(E.entete('Zone déshéritée', 'Agents des postes orange et rouge : prime de zone, rendement / gratification, banque — liste par école avec le nombre d’ayants droit.'));
    const zone = document.createElement('div'); racine.appendChild(zone);
    const ecole = EG.session.ecole_id, id = 'zone-' + (ecole || 'global');
    DB.all('ecoles').then(function (liste) {
      const noms = liste.map(function (e) { return e.nom; }).filter(Boolean);
      global.ZoneDesheritee.monter(zone, {
        charger: function () { return DB.all('zone_desheritee').then(function (l) { const r = l.find(function (x) { return x.id === id; }); return r && r.donnees || null; }); },
        enregistrer: function (e) { return DB.all('zone_desheritee').then(function (l) { const r = l.find(function (x) { return x.id === id; }) || { id: id }; return DB.put('zone_desheritee', Object.assign({}, r, { id: id, ecole_id: ecole || null, donnees: e })); }); },
        ecoles: function () { return noms; },
        ecoleFixe: function () { return ecole ? (EG.session.ecole_nom || '') : ''; },
        annee: function () { return EG.session.annee_code || ''; },
        peutEcrire: function () { return EG.peutEcrire(); },
        uid: function () { return (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
        entete: function () { return '<div style="text-align:center;font:bold 12px Arial">RÉPUBLIQUE DU BÉNIN<br>MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE</div>'; },
        xlsxEcrire: function (f) { return Promise.resolve(EG.Tableur.construire(f)); },
        xlsxLire: function (fichier) { return EG.Tableur.lire(fichier); },
        telecharger: function (nom, blob) { EG.Sortie.enregistrer(nom, blob); return Promise.resolve(); },
        imprimer: function (titre, corps) { EG.Sortie.imprimer(titre, corps, { paysage: true }); }
      });
    });
  });
})(window);
