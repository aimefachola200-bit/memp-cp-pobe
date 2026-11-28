/* ÉduGestion Pro Master — sorties de documents : impression (PDF), Word, Excel.

   Les écrans d'édition passent ici pour livrer un document sans le consigner
   dans le registre des documents scellés : fiches vierges, fiches d'accès,
   modèles à remplir à la main. Les pièces officielles, elles, continuent de
   passer par EG.genererDocument (numéro, empreinte, signature). */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const ech = s => EG.Docs.echapper(s);

  /** Département et circonscription d'une école, pour l'en-tête administratif. */
  function contexteTerritoire(ecole) {
    return DB.all('territoires').then(terr => {
      const it = {}; terr.forEach(t => { it[t.id] = t; });
      const circo = ecole && ecole.territoire_id ? it[ecole.territoire_id] : null;
      let dep = ecole && ecole.departement_id ? it[ecole.departement_id] : (circo ? it[circo.parent_id] : null);
      while (dep && dep.type !== 'DEPARTEMENT' && dep.parent_id) dep = it[dep.parent_id];
      return { circonscription: circo ? circo.nom : '', departement: dep ? dep.nom : '' };
    });
  }

  const STYLES_SUPPLEMENT = `
    .fiche-vierge h2 { margin: 12px 0 4px; }
    .fiche-vierge .consigne { font-size: 12px; color: #444; margin: 0 0 10px; font-style: italic; }
    .fiche-vierge td.libelle { width: 44%; }
    .fiche-vierge td.saisie { height: 26px; }
    .fiche-vierge th.rubrique { background: #E6F5EE; color: #006B3F; }
    .grille-lignes td { height: 24px; }
    .fiches-acces { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .fiche-acces { border: 1px dashed #647067; border-radius: 6px; padding: 8px 10px; page-break-inside: avoid;
      font-family: system-ui, Arial, sans-serif; font-size: 12px; }
    .fiche-acces h4 { margin: 0 0 4px; font-size: 13px; color: #006B3F; }
    .fiche-acces .code { font-family: ui-monospace, Menlo, monospace; font-size: 14px; font-weight: 700; }
    .fiche-acces p { margin: 2px 0; }
    .fiche-acces .avis { color: #647067; font-size: 10.5px; margin-top: 4px; }
    @media print { .barre-impression { display: none; } }
    .barre-impression { position: sticky; top: 0; background: #fff; padding: 6px 0; text-align: right; }
    .barre-impression button { padding: 6px 14px; font-size: 14px; cursor: pointer; }
  `;

  /**
   * Ouvre le document dans une nouvelle fenêtre et lance l'impression : le
   * navigateur propose « Enregistrer au format PDF ». À appeler directement
   * depuis un clic, sans attente préalable, pour que la fenêtre ne soit pas bloquée.
   */
  function imprimer(titre, corps, options) {
    options = options || {};
    const w = window.open('', '_blank');
    if (!w) { U.toast('Autorisez les fenêtres pour imprimer', 'attention'); return Promise.resolve(false); }
    w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + ech(titre)
      + '</title></head><body><p style="font-family:sans-serif">Préparation du document…</p></body></html>');
    const ecole = options.ecole || null;
    /* Le corps peut être une fonction (éventuellement asynchrone) : la fenêtre est déjà ouverte. */
    return Promise.all([
      options.enTete === false ? Promise.resolve({}) : contexteTerritoire(ecole),
      Promise.resolve(typeof corps === 'function' ? corps() : corps)
    ]).then(([ctx, corpsHtml]) => {
      corps = corpsHtml;
      const enTete = options.enTete === false ? '' : EG.Docs.enteteAdministratif(ecole, ctx);
      const paysage = options.paysage ? '@page { size: A4 landscape; margin: 10mm; }' : '';
      w.document.open();
      w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + ech(titre)
        + '</title><style>' + EG.Docs.stylesImpression + STYLES_SUPPLEMENT + paysage + '</style></head><body>'
        + '<div class="barre-impression"><button onclick="window.print()">Imprimer / enregistrer en PDF</button></div>'
        + enTete + corps
        + '<div class="pied">Édité le ' + U.dateFR(new Date().toISOString()) + ' — ÉduGestion Pro Master</div>'
        + '</body></html>');
      w.document.close();
      setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* l'utilisateur imprimera lui-même */ } }, 500);
      return true;
    }).catch(e => { console.error(e); try { w.close(); } catch (x) { /* rien */ } U.toast('Le document n’a pas pu être préparé', 'danger'); return false; });
  }

  function enregistrer(nom, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    U.toast('Fichier « ' + nom + ' » téléchargé');
  }

  /** Fichier Word (.doc) : Word et LibreOffice ouvrent ce HTML tel quel, sans images distantes. */
  function word(nom, titre, corps, options) {
    options = options || {};
    const ecole = options.ecole || null;
    return Promise.all([contexteTerritoire(ecole), Promise.resolve(typeof corps === 'function' ? corps() : corps)]).then(([ctx, corpsHtml]) => {
      /* Word n'affiche pas les cachets dessinés en SVG : l'emplacement reste, à tamponner après impression. */
      corps = String(corpsHtml).replace(/<svg[\s\S]*?<\/svg>/g, '<span style="display:inline-block;width:90pt;height:60pt;border:1px dashed #888"></span>');
      const enTete = '<p style="text-align:center"><strong>RÉPUBLIQUE DU BÉNIN</strong><br>'
        + 'Ministère des Enseignements Maternel et Primaire'
        + (ctx.departement ? '<br>Direction Départementale de ' + ech(ctx.departement) : '')
        + (ctx.circonscription ? '<br>Circonscription scolaire de ' + ech(String(ctx.circonscription).replace(/^CS\s+/i, '')) : '')
        + (ecole ? '<br>' + ech(ecole.nom) : '') + '</p>';
      const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" '
        + 'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
        + '<head><meta charset="utf-8"><title>' + ech(titre) + '</title>'
        + '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}'
        + 'table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:4px 6px;text-align:left}'
        + 'th.rubrique{background:#E6F5EE}td.saisie{height:22pt}</style></head><body>'
        + enTete + corps + '</body></html>';
      enregistrer(nom.replace(/\.(doc|docx)$/i, '') + '.doc',
        new Blob(['﻿', html], { type: 'application/msword' }));
    });
  }

  /** Classeur Excel : feuilles = [{ nom, lignes: [[...], ...] }]. */
  function excel(nom, feuilles) {
    enregistrer(nom.replace(/\.xlsx$/i, '') + '.xlsx', EG.Tableur.construire(feuilles));
  }

  /* ---------------- Mots de passe et identifiants ---------------- */

  /** Mot de passe provisoire lisible : sans 0/O ni 1/l/I, huit caractères. */
  function motDePasseProvisoire(longueur) {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const n = longueur || 8;
    let out = '';
    const octets = new Uint32Array(n);
    if (global.crypto && crypto.getRandomValues) crypto.getRandomValues(octets);
    else for (let i = 0; i < n; i++) octets[i] = Math.floor(Math.random() * 4294967295);
    for (let i = 0; i < n; i++) out += alphabet[octets[i] % alphabet.length];
    return out;
  }

  /** Identifiant en minuscules, sans accent ni espace. */
  function slug(texte) {
    return U.sansAccent(texte).replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  }

  EG.Sortie = { imprimer, word, excel, enregistrer, contexteTerritoire, motDePasseProvisoire, slug, STYLES_SUPPLEMENT };
})(window);
