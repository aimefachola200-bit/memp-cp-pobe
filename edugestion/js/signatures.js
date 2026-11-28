/* ÉduGestion Pro — signatures digitales de tous les acteurs.

   Un seul écran pour recueillir, sur la tablette ou le téléphone de l'école, la signature de chacun :
   élèves et parents (classe par classe), enseignants et directeur de l'école, autorités (chef de la
   circonscription, directeur départemental, chefs de division). Chaque signature est ensuite apposée
   d'elle-même sur les pièces qui concernent la personne :
     - élève : carte d'identité scolaire, fiche d'inscription, fiche du CEP, bulletins ;
     - parent : fiche d'inscription, fiche du CEP, bulletins ;
     - enseignant / agent : pièces de sa classe (titulaire), procès-verbaux de visite, fiche de carrière,
       fiche d'évaluation ;
     - directeur : toutes les pièces de l'école, même éditées par la circonscription ;
     - chef de CS, DDEMP, chefs de division : visas, états, rapports et plans d'action de la structure.
   Adresse : signatures. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const tri = (a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { numeric: true });

  /** Case « signature » : aperçu de la signature (ou « à recueillir ») et bouton pour signer. */
  function caseSig(rec, champ, table, titre, mention, apres) {
    const img = rec && rec[champ];
    return el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, [
      img ? el('img', { src: img, alt: 'Signature', style: 'height:34px;max-width:120px;background:#fff;border:1px solid #DDE3DF;border-radius:4px' })
        : el('span', { class: 'badge attention', text: 'à recueillir' }),
      EG.peutEcrire() ? el('button', {
        class: 'btn btn-fantome', type: 'button', text: img ? '\uE029 Modifier' : '\uE029 Signer',
        onclick: () => EG.Docs.capturerSignature(rec, apres, { table, champ, titre, mention })
      }) : null
    ]);
  }

  Routeur.definir('signatures', function (racine, args, params) {
    racine.appendChild(E.entete('Signatures des acteurs',
      'Élèves, parents, enseignants, directeur et autorités : chacun signe une fois, au doigt ou à la souris ; sa signature figure ensuite sur les documents qui le concernent.'));
    const zoneAut = el('div'), zoneChoix = el('div'), zone = el('div');
    racine.appendChild(zoneAut); racine.appendChild(zoneChoix); racine.appendChild(zone);
    const user = EG.session.user;
    const etat = { ecole_id: (params && params.ecole) || '', cs: '', classe_id: (params && params.classe) || '' };
    const raf = () => Routeur.aller('signatures?ecole=' + (etat.ecole_id || '') + (etat.classe_id ? '&classe=' + etat.classe_id : ''));

    /* ---------- autorités (comptes de circonscription, de département, d'administration) ---------- */
    if (!EG.session.ecole_id && ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS'].indexOf(user.role) >= 0) {
      E.contexteCS().then(ctx => {
        let sujets = ctx.csList.slice(0, 40);
        if (user.role !== 'CS') sujets = ctx.terr.filter(t => t.type === 'DEPARTEMENT' && (ctx.complet || t.id === ctx.p.dep)).sort(tri).concat(sujets);
        if (!sujets.length) return;
        zoneAut.appendChild(U.carte('Autorités', el('div', {}, [
          U.tableau([
            { titre: 'Structure', valeur: t => (t.type === 'DEPARTEMENT' ? 'DDEMP — ' : 'CS — ') + t.nom },
            { titre: 'Responsable', valeur: t => t.responsable || '—' },
            { titre: 'Signature', valeur: t => caseSig(t, 'signature_image', 'territoires', 'Signature — ' + (t.responsable || t.nom),
              'Le ' + (t.type === 'DEPARTEMENT' ? 'Directeur départemental' : 'Chef de la circonscription scolaire') + ' signe ici. Sa signature figure sur les visas, états et rapports de la structure.', raf) }
          ], sujets),
          el('p', { class: 'muet petit', text: 'Les chefs de division et de service signent depuis la fiche de leur division (Divisions et services).' }),
          el('button', { class: 'btn btn-fantome', text: '\uE023 Divisions et services', onclick: () => Routeur.aller('divisions') })
        ])));
      });
    }

    /* ---------- école : directeur, enseignants, élèves et parents ---------- */
    E.selecteurEcole.preparerEcoles(etat).then(() => {
      const redessiner = rebarre => {
        if (rebarre) E.selecteurEcole.barreEcole(zoneChoix, etat, redessiner, false);
        etat.ecole = etat.liste.filter(e => e.id === etat.ecole_id)[0] || null;
        zone.textContent = '';
        if (!etat.liste.length) { zone.appendChild(U.vide('Aucune école dans votre périmètre.')); return; }
        if (!etat.ecole) { zone.appendChild(U.vide('Choisissez une école pour recueillir les signatures de son directeur, de ses enseignants, de ses élèves et de leurs parents.')); return; }
        const ecole = etat.ecole, annee = EG.session.annee_id;
        Promise.all([DB.where('classes', { ecole_id: ecole.id, annee_scolaire_id: annee }), DB.where('inscriptions_eleves', { ecole_id: ecole.id, annee_scolaire_id: annee }),
          DB.all('eleves'), DB.where('personnels', { ecole_id: ecole.id })]).then(([classes, ins, eleves, agents]) => {
          const ie = {}; eleves.forEach(x => { ie[x.id] = x; });
          zone.appendChild(U.carte('Direction de l’école — ' + ecole.nom, el('div', {}, [
            el('p', { class: 'muet', text: 'Directeur : ' + (ecole.directeur_nom || '— (à renseigner dans la fiche de l’école)') }),
            caseSig(ecole, 'signature_directeur', 'ecoles', 'Signature du directeur — ' + ecole.nom,
              'Le directeur signe ici. Sa signature figure sur toutes les pièces de l’école, même éditées par la circonscription ou la direction départementale.', raf)
          ])));
          agents = agents.filter(a => a.actif !== false).sort(tri);
          zone.appendChild(U.carte('Enseignants et personnel (' + agents.length + ')', U.tableau([
            { titre: 'Agent', valeur: a => (a.nom || '').toUpperCase() + ' ' + (a.prenoms || '') },
            { titre: 'Fonction', valeur: a => U.libelle(a.fonction) },
            { titre: 'Signature', valeur: a => caseSig(a, 'signature_image', 'personnels', 'Signature de ' + (a.nom || '') + ' ' + (a.prenoms || ''),
              'L’agent signe ici. Sa signature figure sur les pièces de sa classe, les procès-verbaux de visite et sa fiche de carrière.', raf) }
          ], agents, { messageVide: 'Aucun agent enregistré dans cette école.' })));

          classes.sort((a, b) => String(a.niveau).localeCompare(String(b.niveau), 'fr', { numeric: true }));
          if (!classes.length) { zone.appendChild(U.vide('Aucune classe pour l’année en cours.')); return; }
          if (!etat.classe_id || !classes.some(c => c.id === etat.classe_id)) etat.classe_id = classes[0].id;
          const lignes = ins.filter(i => i.classe_id === etat.classe_id && i.statut !== 'TRANSFERE' && ie[i.eleve_id]).map(i => ie[i.eleve_id])
            .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr') || String(a.prenoms).localeCompare(String(b.prenoms), 'fr'));
          const faits = lignes.filter(x => x.signature_image).length, faitsP = lignes.filter(x => x.signature_parent).length;
          zone.appendChild(U.carte('Élèves et parents', el('div', {}, [
            el('div', { class: 'barre-filtres' }, [U.selecteur('Classe', classes.map(c => ({ value: c.id, label: (c.libelle || c.code || c.niveau) + ' — ' + c.niveau })), etat.classe_id,
              v => { etat.classe_id = v; raf(); }, { vide: false }),
              el('span', { class: 'badge info', text: faits + '/' + lignes.length + ' élèves · ' + faitsP + '/' + lignes.length + ' parents' })]),
            U.tableau([
              { titre: 'Élève', valeur: x => (x.nom || '').toUpperCase() + ' ' + (x.prenoms || '') },
              { titre: 'Signature de l’élève', valeur: x => caseSig(x, 'signature_image', 'eleves', 'Signature de ' + (x.nom || '') + ' ' + (x.prenoms || ''),
                'L’élève signe ici. Sa signature figure sur sa carte d’identité scolaire, sa fiche d’inscription, sa fiche du CEP et ses bulletins.', raf) },
              { titre: 'Parent / tuteur', valeur: x => EG.Docs.parentDe(x).nom || '—' },
              { titre: 'Signature du parent', valeur: x => caseSig(x, 'signature_parent', 'eleves', 'Signature du parent de ' + (x.nom || '') + ' ' + (x.prenoms || ''),
                'Le parent ou le tuteur signe ici. Sa signature figure sur la fiche d’inscription, la fiche du CEP et les bulletins.', raf) }
            ], lignes, { messageVide: 'Aucun élève inscrit dans cette classe.' })
          ])));
        });
      };
      E.selecteurEcole.barreEcole(zoneChoix, etat, redessiner, false);
      redessiner(false);
    });
  });
})(window);
