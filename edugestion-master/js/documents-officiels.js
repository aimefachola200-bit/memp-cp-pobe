/* ÉduGestion Pro Master — Documents officiels (textes de SCOLARIS et GESCOL, sans modification).

   Les fichiers officiels livrés avec l'espace CP (dossier memp-cp/docs) : fiches de recensement et de rapport,
   canevas statistiques, modèles des certificats et documents de l'enseignant, arrêté du calendrier scolaire,
   emplois du temps officiels (maternelle, CI → CM2), planifications annuelles et mensuelles, projet de planification
   CI → CM2, règlement intérieur signé, thèmes des UP, AOF des services de la DDEMP. Ouverts ou téléchargés tels
   quels, pour tous les comptes (directeurs, enseignants, CP, CS, DDEMP, administration). */
(function (global) {
  'use strict';
  const EG = global.EG, U = EG.UI, el = U.el;
  const BASE = 'memp-cp/';
  const ICONES = { PDF: '\uE00D', Excel: '\uE015' };

  function telecharger(d) {
    const nom = d.fichier.split('/').pop();
    fetch(BASE + d.fichier).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b => EG.Sortie.enregistrer(nom, b))
      .catch(() => U.toast('Fichier introuvable sur cet appareil : ' + nom, 'danger'));
  }

  U.Routeur.definir('documents-officiels', function (racine) {
    racine.appendChild(el('header', { class: 'page-tete' }, el('div', {}, [
      el('h1', { text: 'Documents officiels' }),
      el('p', { class: 'sous-titre', text: 'Textes et modèles officiels de SCOLARIS et GESCOL, tels qu’ils ont été publiés : calendrier scolaire, emplois du temps, planifications, règlement intérieur, fiches et canevas, certificats.' })
    ])));
    const zone = el('div', {}, el('p', { class: 'muet', text: 'Chargement…' }));
    let terme = '', dessiner = () => {};
    racine.append(U.champRecherche('Rechercher un document…', v => { terme = v; dessiner(); }), zone);
    fetch(BASE + 'data/documents.json').then(r => r.json()).then(data => {
      const docs = data.documents || [];
      dessiner = () => {
        const q = U.sansAccent(terme);
        const groupes = {};
        docs.filter(d => !q || U.sansAccent(d.titre + ' ' + (d.description || '') + ' ' + (d.cycle || '')).indexOf(q) >= 0)
          .forEach(d => { const g = d.groupe || 'Fiches officielles et canevas statistiques'; (groupes[g] = groupes[g] || []).push(d); });
        zone.textContent = '';
        const noms = Object.keys(groupes);
        if (!noms.length) { zone.appendChild(U.vide('Aucun document ne correspond à la recherche.')); return; }
        noms.forEach(g => {
          zone.appendChild(el('h2', { class: 'titre-section', text: g, style: 'font-size:1.05rem;margin:18px 0 8px' }));
          zone.appendChild(el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:10px' },
            groupes[g].map(d => el('div', { class: 'carte', style: 'padding:12px;display:flex;flex-direction:column;gap:6px' }, [
              el('strong', { text: (ICONES[d.format] || '\uE00D') + ' ' + d.titre }),
              el('span', { class: 'muet petit', text: [d.cycle, d.format, d.pages ? d.pages + ' page(s)' : ''].filter(Boolean).join(' · ') }),
              d.description ? el('span', { class: 'petit', text: d.description }) : null,
              el('div', { class: 'barre-actions', style: 'margin-top:auto' }, [
                d.format === 'Excel' ? null : el('a', { class: 'btn btn-fantome', href: BASE + d.fichier, target: '_blank', rel: 'noopener', text: '\uE043 Ouvrir' }),
                el('button', { class: 'btn btn-primaire', type: 'button', text: '\uE009 Télécharger', onclick: () => telecharger(d) })
              ])
            ].filter(Boolean)))));
        });
      };
      dessiner();
    }).catch(() => { zone.textContent = ''; zone.appendChild(U.vide('La liste des documents officiels est introuvable sur cet appareil.')); });
  });
})(window);
