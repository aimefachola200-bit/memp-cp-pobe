/* Pédagogie — moteur commun du module « Pédagogie » (programmes, guides, progressions annuelles, fiches de préparation,
   résumés, épreuves avec corrigés, planification journalière / hebdomadaire / mensuelle).
   Même fichier dans CS Pobè, Mon école, MEMP-CP, DOSP, MEMP-CP Pobè, ÉduGestion Pro / Master.
   Contenu : celui de SCOLARIS (outils/pedagogie/exporter.py), en petits fichiers JSON par cours chargés à la demande
   (data/pedagogie/index.json, guides.json, CI.json … CM2.json) et gardés pour le mode hors ligne (Cache API).
   L'application fournit un adaptateur :
     { app, base: 'data/pedagogie/', coursParDefaut, peutAnnoter, auteur, notes: { charger(), enregistrer(o) },
       imprimer(titre, html)?, entete()?, memo: { get, set }?, liens: [{ l, route, icone }]?, ouvrir(route)?,
       examenBlanc: { lire(), retenir(sel) }? }
   Pedagogie.monter(racine, A, { onglet, cours }) ; Pedagogie.imprimerJeu(A, cours, periode, corrige).
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.Pedagogie) return;

  /* ---------------- utilitaires ---------------- */
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  /** Texte de fiche (« **gras** », sauts de ligne) → HTML échappé */
  const txt = (t) => esc(t).replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>').replace(/\n/g, '<br>');
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(9).forEach(c => { if (c === null || c === undefined || c === false) return; e.append(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  /** Icône du jeu commun (dessin au trait), sans émoji */
  const ic = (nom) => {
    const s = h('span', { class: 'ped-ic', 'aria-hidden': 'true' });
    if (global.Icones && global.Icones.icone) s.innerHTML = global.Icones.icone(nom, { taille: 16 });
    return s;
  };
  /** Lien d'action (texte souligné, qui revient à la ligne normalement dans les listes) */
  function lien(attrs, ...kids) {
    const f = attrs.onclick; const a = Object.assign({}, attrs, { href: '#', class: 'ped-a', onclick: (e) => { e.preventDefault(); f && f(e); } });
    return h('a', a, ...kids);
  }
  const btn = (nom, libelle, onclick, cls, extra) => h('button', Object.assign({ type: 'button', class: 'ped-btn' + (cls ? ' ' + cls : ''), onclick }, extra || {}), nom ? ic(nom) : null, libelle);

  const COURS = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
  const ORDRE_MAT = ['francais', 'maths', 'es', 'est', 'eps', 'ea'];
  const MOIS = ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin'];
  const JOURS = [['lundi', 'Lundi'], ['mardi', 'Mardi'], ['mercredi', 'Mercredi'], ['jeudi', 'Jeudi'], ['vendredi', 'Vendredi']];
  const COLS_PROG = [['francais', 'Français'], ['maths', 'Mathématiques'], ['es_morale', 'ES — morale'], ['es_civisme', 'ES — civisme'], ['es_histoire', 'ES — histoire'],
    ['es_geographie', 'ES — géographie'], ['est', 'EST'], ['eps', 'EPS'], ['ea_chant', 'EA — chant'], ['ea_poesie', 'EA — poésie'], ['ea_conte', 'EA — conte'],
    ['ea_dessin', 'EA — dessin'], ['ea_couture', 'EA — couture'], ['observations', 'Observations']];
  const CHAMPS_FICHE = [['intitule', 'Intitulé / thème'], ['sous_matiere', 'Sous-matière / activité'], ['unite', 'Unité / dossier / SA'], ['duree', 'Durée'],
    ['cd', 'Compétence disciplinaire'], ['ct', 'Compétences transversales / transdisciplinaires'], ['contenus', 'Contenus de formation (connaissances et techniques)'],
    ['objectifs', 'Objectifs'], ['strategies', "Stratégies objet d'apprentissage / d'enseignement"], ['materiel', 'Matériel']];
  const CHAMPS_FIN = [['evaluation', 'Évaluation'], ['projection', 'Projection / réinvestissement'], ['je_retiens', 'Je retiens'], ['observations', "Observations de l'enseignant"]];
  const ONGLETS = [['planification', 'Planification', 'calendrier'], ['fiches', 'Fiches de préparation', 'fiche'], ['resumes', 'Résumés', 'bloc-notes'],
    ['epreuves', 'Épreuves', 'examen'], ['progressions', 'Progressions annuelles', 'courbe'], ['programmes', 'Programmes', 'livre'], ['guides', 'Guides', 'livres']];
  const TYPES_EP = [['mensuelle', 'Évaluations mensuelles'], ['trimestrielle', 'Évaluations trimestrielles'], ['passage', 'Évaluation de passage'], ['cep_blanc', 'Examens blancs du CEP']];
  /* Couleur et dessin de chaque matière (bandeau des fiches imprimées et à l'écran) */
  const COUL_MAT = { francais: '#1F4E79', maths: '#B54708', es: '#067647', est: '#6941C6', eps: '#C11574', ea: '#0E7090' };
  const IC_MAT = { francais: 'livre', maths: 'calcul', es: 'monde', est: 'science', eps: 'ballon', ea: 'image' };
  const IC_CHAMP = { intitule: 'etiquette', sous_matiere: 'dossier', unite: 'classeur', duree: 'horloge', cd: 'cible', ct: 'puzzle', contenus: 'livre', objectifs: 'cible',
    strategies: 'groupe', materiel: 'outils', evaluation: 'valider-cercle', projection: 'fleche-droite', je_retiens: 'cerveau', observations: 'voir' };
  const CREDIT_PED = 'Conception : Maître Aimé FACHOLA — +229 01 96 51 03 33';
  const svgIc = (nom, t) => (global.Icones && global.Icones.icone) ? global.Icones.icone(nom, { taille: t || 14 }) : '';
  const PAR_PAGE = 40;
  const MAX_LIVRET = 120;

  /* ---------------- styles ---------------- */
  function styles() {
    if (document.getElementById('ped-styles')) return;
    document.head.append(h('style', { id: 'ped-styles', html: `
      .ped{--ped-bleu:#1F4E79;--ped-bord:#D0D5DD;--ped-gris:#667085;color:#1D2939;font-size:.92rem}
      .ped *{box-sizing:border-box}
      .ped-ic{display:inline-flex;vertical-align:-3px;margin-right:4px}.ped-ic svg{width:16px;height:16px}
      .ped-onglets{display:flex;gap:4px;overflow-x:auto;border-bottom:2px solid var(--ped-bord);margin:0 0 10px;padding-bottom:0;scrollbar-width:thin}
      .ped-onglets button{flex:0 0 auto;border:0;background:none;padding:9px 12px;font:inherit;font-weight:600;color:#475467;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap}
      .ped-onglets button.on{color:var(--ped-bleu);border-bottom-color:var(--ped-bleu)}
      .ped-filtres{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;margin:0 0 10px;align-items:end;position:sticky;top:var(--ped-haut,0px);z-index:5;background:var(--ped-fond,#F8FAFC);padding:6px 0}
      .ped-filtres label{display:flex;flex-direction:column;gap:3px;font-size:.74rem;font-weight:600;color:#344054}
      .ped-filtres select,.ped-filtres input,.ped textarea{font:inherit;font-size:.88rem;padding:7px 8px;border:1px solid var(--ped-bord);border-radius:7px;background:#fff;color:#1D2939;min-height:38px;width:100%}
      .ped-btn{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--ped-bord);background:#fff;color:#1D2939;border-radius:8px;padding:7px 11px;font:inherit;font-size:.84rem;cursor:pointer;min-height:36px}
      .ped-btn.p{background:var(--ped-bleu);border-color:var(--ped-bleu);color:#fff}.ped-btn.s{padding:4px 8px;min-height:30px;font-size:.78rem}.ped-btn.d{color:#B42318;border-color:#FDA29B}
      .ped-btn:disabled{opacity:.45;cursor:not-allowed}
      .ped-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .ped-carte{background:#fff;border:1px solid var(--ped-bord);border-radius:10px;padding:12px 14px;margin:0 0 12px;overflow-wrap:anywhere}
      .ped-carte h3{margin:0 0 8px;font-size:1rem;color:var(--ped-bleu)}.ped-carte h4{margin:10px 0 4px;font-size:.92rem}
      .ped-aide{font-size:.78rem;color:var(--ped-gris)}.ped-vide{color:var(--ped-gris);font-style:italic;padding:10px 0}
      .ped-tw{overflow:auto;max-height:70vh;border:1px solid var(--ped-bord);border-radius:10px;background:#fff}
      .ped-t{border-collapse:collapse;width:100%;font-size:.85rem}
      .ped-t thead th{position:sticky;top:0;z-index:2;background:#F2F4F7;color:#344054;text-align:left;padding:7px 8px;border-bottom:1px solid var(--ped-bord);font-size:.74rem;text-transform:uppercase;letter-spacing:.02em}
      .ped-t td{padding:6px 8px;border-bottom:1px solid #EAECF0;vertical-align:top}.ped-t tr.lien{cursor:pointer}.ped-t tr.lien:hover td{background:#F5F8FC}
      .ped-t td.n{white-space:nowrap}
      .ped-badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:.72rem;font-weight:600;background:#F2F4F7;color:#475467;white-space:nowrap}
      .ped-badge.ok{background:#ECFDF3;color:#067647}.ped-badge.src{background:#EEF4FB;color:#1F4E79}
      .ped-dl{display:grid;grid-template-columns:minmax(120px,30%) 1fr;gap:4px 12px;margin:6px 0}.ped-dl dt{font-weight:600;color:#344054;font-size:.84rem}.ped-dl dd{margin:0}
      @media (max-width:600px){.ped-dl{grid-template-columns:1fr}.ped-dl dd{margin-bottom:6px}}
      .ped-retiens{background:#EEF4FB;border:1px solid var(--ped-bleu);border-radius:6px;padding:8px 10px;margin:8px 0}
      .ped-engage{border:1px dashed #067647;border-radius:6px;padding:8px 10px;margin:8px 0}
      .ped-rep{color:#067647;font-style:italic}
      .ped-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:10px}
      .ped-chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}.ped-chip{border:1px solid var(--ped-bord);border-radius:999px;padding:5px 11px;background:#fff;cursor:pointer;font:inherit;font-size:.82rem;min-height:32px}
      .ped-chip.on{background:#E8EEF5;border-color:var(--ped-bleu);font-weight:600}
      .ped-liste{margin:4px 0 0;padding-left:18px}.ped-liste li{margin:2px 0}
      .ped-a{color:var(--ped-bleu);text-decoration:underline;cursor:pointer}
      .ped-note{background:#FFFAEB;border:1px solid #FEC84B;border-radius:8px;padding:8px 10px;margin:6px 0;font-size:.86rem}
      .ped-pages{display:flex;gap:6px;align-items:center;justify-content:center;margin:8px 0;flex-wrap:wrap}
      .ped-guide img{max-width:100%}.ped-guide table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}.ped-guide td,.ped-guide th{border:1px solid #D0D5DD;padding:4px 6px}
      .ped-voile{position:fixed;inset:0;background:rgba(16,24,40,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:3vh 8px;overflow:auto}
      .ped-dialogue{background:#fff;border-radius:12px;width:min(900px,100%);box-shadow:0 12px 40px rgba(0,0,0,.3);color:#1D2939}
      .ped-dialogue>header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;background:var(--ped-bleu,#1F4E79);color:#fff;border-radius:12px 12px 0 0;position:sticky;top:0;z-index:3}
      .ped-dialogue>header h3{margin:0;font-size:1rem}.ped-dialogue>header button{background:none;border:0;color:#fff;font-size:1.4rem;cursor:pointer;min-width:36px;min-height:36px}
      .ped-dialogue .ped-corps{padding:12px 14px;overflow-x:auto}.ped-dialogue footer{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:10px 14px;border-top:1px solid #D0D5DD}
      .ped-doc{font:10.5pt/1.45 Arial,sans-serif;color:#111}.ped-doc h1{font-size:14pt;text-align:center;margin:6px 0}.ped-doc h2{font-size:12.5pt;margin:12px 0 4px;color:#1F4E79}
      .ped-doc h3{font-size:11pt;margin:8px 0 3px}.ped-doc table{border-collapse:collapse;width:100%;margin:4px 0}.ped-doc td,.ped-doc th{border:1px solid #777;padding:3px 5px;vertical-align:top;text-align:left}
      .ped-doc th{background:#EEF1F5}.ped-doc .saut{break-before:page;page-break-before:always}.ped-doc .mention{font-size:8.5pt;color:#555;font-style:italic}
      .ped-doc .ligne{border-bottom:1px dotted #999;height:1.6em}
      #ped-impression{display:none}
      ${CSS_FICHE}
      .ped-dialogue .ped-fiche{font-size:12pt}
      @media print{.ped-voile{display:none!important}body.ped-imprime>*:not(#ped-impression){display:none!important}body.ped-imprime #ped-impression{display:block!important}}
    ` }));
  }

  /* ---------------- boîtes de dialogue et impression ---------------- */
  function dialogue(titre, corps, boutons) {
    const fermer = () => { voile.remove(); window.removeEventListener('keydown', echap); };
    const echap = (e) => { if (e.key === 'Escape') fermer(); };
    const pied = h('footer', {}, (boutons || []).map(b => h('button', { type: 'button', class: 'ped-btn' + (b.p ? ' p' : ''), onclick: () => { if (b.action && b.action() === false) return; fermer(); } }, b.icone ? ic(b.icone) : null, b.l)));
    const voile = h('div', { class: 'ped-voile', onclick: (e) => { if (e.target === voile) fermer(); } },
      h('div', { class: 'ped-dialogue ped', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre },
        h('header', {}, h('h3', {}, titre), h('button', { type: 'button', 'aria-label': 'Fermer', onclick: fermer }, '×')),
        h('div', { class: 'ped-corps' }, corps), pied));
    document.body.append(voile); window.addEventListener('keydown', echap);
    return fermer;
  }
  function imprimerDirect(html) {
    let zone = document.getElementById('ped-impression');
    if (!zone) { zone = h('div', { id: 'ped-impression' }); document.body.append(zone); }
    zone.innerHTML = html; document.body.classList.add('ped-imprime');
    const fin = () => { document.body.classList.remove('ped-imprime'); zone.innerHTML = ''; window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin); setTimeout(() => { window.print(); }, 60);
  }
  function imprimerDefaut(titre, html) {
    dialogue(titre, h('div', { class: 'ped-doc', html }), [{ l: 'Fermer' }, { l: 'Imprimer / PDF', icone: 'imprimer', p: true, action: () => { imprimerDirect(html); return false; } }]);
  }
  /** o.epreuve : épreuve (sujet ou corrigé) — elle porte son propre en-tête, l'en-tête administratif de l'application est omis */
  /** o.titulaire : nom du titulaire de la classe, porté en filigrane oblique sur chaque page (fiches de préparation) */
  function imprimer(A, titre, corps, o) {
    o = o || {};
    const fili = o.titulaire ? '<div class="ped-filigrane" aria-hidden="true">' + esc(o.titulaire) + '</div>' : '';
    const fiche = corps.indexOf('class="ped-fiche"') >= 0;
    const html = '<div class="ped-doc' + (fiche ? ' ped-avec-fiche' : '') + '">' + fili + (A.entete && !o.epreuve ? A.entete() : '') + corps
      + (o.epreuve ? '' : '<p class="mention">' + esc(A.app || '') + ' — module Pédagogie. Contenus de SCOLARIS conçus selon l\'APC, à valider par le conseiller pédagogique.</p>')
      + (fiche ? '' : '<p class="ped-credit">' + esc(CREDIT_PED) + '</p>') + '</div>';
    if (A.imprimer) return A.imprimer(titre, CSS_DOC + html, o);
    return imprimerDefaut(titre, CSS_DOC + html);
  }
  /* Fiches : Times New Roman 14 pt, couleurs de la matière, recto verso (marges alternées, numéro de page), filigrane du titulaire */
  const CSS_FICHE = '.ped-fiche{width:100%;border-collapse:collapse;margin:0 0 4mm;font-family:"Times New Roman",Times,"Liberation Serif",serif;font-size:14pt;line-height:1.35;color:#111}'
    + '.ped-fiche>thead>tr>td,.ped-fiche>tfoot>tr>td,.ped-fiche>tbody>tr>td{border:0!important;padding:0!important;background:none!important}'
    + '.ped-fiche h2{font-size:16pt;margin:6px 0 6px;text-align:left}.ped-fiche h3{font-size:14.5pt;margin:10px 0 4px;padding-bottom:2px}'
    + '.ped-fiche table.ped-fc{border-collapse:collapse;width:100%;margin:4px 0}.ped-fiche table.ped-fc td,.ped-fiche table.ped-fc th{border:1px solid #98A2B3;padding:4px 6px;vertical-align:top;text-align:left;font-size:13pt}'
    + '.ped-fiche table.ped-fc th{background:#F8F9FB}.ped-fiche table.ped-fc tr{break-inside:avoid;page-break-inside:avoid}.ped-fiche>tbody>tr{break-inside:auto;page-break-inside:auto}.ped-fiche thead{display:table-header-group}.ped-fiche tfoot{display:table-footer-group}'
    + '.ped-fb{display:flex;align-items:center;gap:8px;color:#fff;border-radius:6px;padding:6px 10px;margin:0 0 4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + '.ped-fb small{font-size:10.5pt;opacity:.95}.ped-fb-ic svg{width:26px;height:26px;display:block}.ped-fi{display:inline-block;vertical-align:-2px;margin-right:4px}.ped-fi svg{width:14px;height:14px}'
    + '.ped-credit{font:7.5pt Arial,sans-serif;color:#98A2B3;text-align:right;margin:3mm 0 0}'
    + '.ped-filigrane{display:none}';
  const CSS_FICHE_IMPR = '@media print{.ped-filigrane{display:block;position:fixed;top:42%;left:0;right:0;text-align:center;transform:rotate(-35deg);font:bold 54pt "Times New Roman",Times,serif;color:#1F4E79;opacity:.11;z-index:0;pointer-events:none;white-space:nowrap}'
    + '@page{size:A4;margin:12mm 12mm 15mm}@page :left{margin-left:15mm;margin-right:10mm}@page :right{margin-left:10mm;margin-right:15mm}'
    + '@page{@bottom-center{content:"Page " counter(page) " / " counter(pages);font:9pt Arial,sans-serif;color:#667085}}'
    + '.ped-fb,.ped-fiche table.ped-fc thead tr{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  const CSS_DOC = '<style>.ped-doc{font:10.5pt/1.45 Arial,sans-serif;color:#111}.ped-doc h1{font-size:14pt;text-align:center;margin:6px 0}.ped-doc h2{font-size:12.5pt;margin:12px 0 4px;color:#1F4E79}'
    + '.ped-doc h3{font-size:11pt;margin:8px 0 3px}.ped-doc table{border-collapse:collapse;width:100%;margin:4px 0}.ped-doc td,.ped-doc th{border:1px solid #777;padding:3px 5px;vertical-align:top;text-align:left}'
    + '.ped-doc th{background:#EEF1F5}.ped-doc .saut{break-before:page;page-break-before:always}.ped-doc .mention{font-size:8.5pt;color:#555;font-style:italic}.ped-doc .ligne{border-bottom:1px dotted #999;height:1.6em}'
    + '.ped-doc .ped-retiens{background:#EEF4FB;border:1px solid #1F4E79;border-radius:6px;padding:6px 8px;margin:6px 0}.ped-doc .ped-engage{border:1px dashed #067647;border-radius:6px;padding:6px 8px;margin:6px 0}'
    + '.ped-doc .ped-rep{color:#067647;font-style:italic}'
    + '.ped-ep{font-family:"Times New Roman",Times,"Liberation Serif",serif;font-size:14pt;line-height:1.35;color:#000}.ped-ep h2{font-size:15pt;font-weight:bold;color:#000;text-align:center;margin:4px 0 6px}'
    + '.ped-ep h3,.ped-ep b,.ped-ep th,.ped-ep .ped-titre-item{font-weight:bold}.ped-ep h3{font-size:14pt;color:#000}.ped-ep p{margin:4px 0}.ped-ep ol{margin:2px 0 4px;padding-left:28px}'
    + '.ped-ep table td,.ped-ep table th{font-size:13pt}.ped-ep .ped-item,.ped-ep table,.ped-ep tr,.ped-ep li{break-inside:avoid;page-break-inside:avoid}'
    + '.ped-doc .ped-ep-tete{width:100%;border-collapse:collapse;margin:0 0 6px}.ped-doc .ped-ep-tete td{border:0;padding:1px 0;font-size:13pt}'
    + '.ped-demi{break-inside:avoid;page-break-inside:avoid}.ped-coupe{border-top:1.5px dashed #444;margin:9mm 0 7mm;text-align:center;font:9pt Arial,sans-serif;color:#444;padding-top:2px}'
    + CSS_FICHE + CSS_FICHE_IMPR + '</style>';

  /** Guides : HTML du corpus nettoyé (aucun script, aucun attribut d'évènement, aucun lien javascript:) */
  function nettoyer(html) {
    const d = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html');
    d.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach(n => n.remove());
    d.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    }));
    return d.body.firstChild ? d.body.firstChild.innerHTML : '';
  }

  /* ---------------- données : chargement à la demande, cache hors ligne ---------------- */
  const CHARGES = {};
  function baseAbs(A) { return new URL(A.base || 'data/pedagogie/', location.href).href; }
  function hachage(s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }
  const avecCache = () => typeof caches !== 'undefined' && global.isSecureContext !== false;
  async function lireJSON(url, nomCache, reseauDabord) {
    let c = null;
    if (avecCache()) { try { c = await caches.open(nomCache); } catch (e) { c = null; } }
    if (c && !reseauDabord) { const r = await c.match(url); if (r) return r.json(); }
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (c) { try { await c.put(url, r.clone()); } catch (e) { /* quota */ } }
      return await r.json();
    } catch (e) {
      if (c) { const r = await c.match(url); if (r) return r.json(); }
      throw e;
    }
  }
  async function index(A) {
    const b = baseAbs(A), cle = 'ped-index-' + hachage(b);
    if (CHARGES[cle]) return CHARGES[cle];
    CHARGES[cle] = (async () => {
      const ix = await lireJSON(b + 'index.json', 'pedagogie-' + hachage(b) + '-index', true);
      if (avecCache()) {   // anciennes versions du contenu : supprimées
        try { for (const k of await caches.keys()) if (k.startsWith('pedagogie-' + hachage(b) + '-v') && k !== nomCache(A, ix)) await caches.delete(k); } catch (e) { /* indisponible */ }
      }
      return ix;
    })().catch(e => { delete CHARGES[cle]; throw e; });
    return CHARGES[cle];
  }
  const nomCache = (A, ix) => 'pedagogie-' + hachage(baseAbs(A)) + '-v' + ix.version;
  async function fichier(A, nom) {
    const ix = await index(A), b = baseAbs(A), cle = b + nom + '@' + ix.version;
    if (!CHARGES[cle]) CHARGES[cle] = lireJSON(b + nom + '?v=' + ix.version, nomCache(A, ix), false).catch(e => { delete CHARGES[cle]; throw e; });
    return CHARGES[cle];
  }
  const CHARGES_COURS = {};
  async function cours(A, c) {
    const d = await fichier(A, c + '.json');
    CHARGES_COURS[c] = d;
    if (!d._idx) {
      d._fiche = Object.fromEntries(d.fiches.map(f => [f.id, f]));
      d._resume = Object.fromEntries(d.resumes.map(r => [r.id, r]));
      d._idx = true;
    }
    return d;
  }
  async function toutHorsLigne(A, progres) {
    const ix = await index(A);
    const noms = ix.cours.map(c => c.fichier).concat([ix.guides.fichier]);
    let n = 0;
    for (const f of noms) { await fichier(A, f); n++; progres && progres(n, noms.length); }
    return noms.length;
  }

  /* ---------------- rendus HTML (écran et impression) ---------------- */
  const nomMat = (ix, m) => (ix.matieres || {})[m] || m;
  /** Fiche de préparation : bandeau de couleur de la matière (répété en tête de chaque page à l'impression), dessins au trait,
      corps en Times New Roman 14 pt, tableaux jamais coupés au milieu d'une ligne. */
  function ficheHtml(f, ix) {
    const c = COUL_MAT[f.matiere] || '#1F4E79';
    const rep = esc(f.cours) + ' · ' + esc(nomMat(ix, f.matiere)) + (f.sous_matiere ? ' · ' + esc(f.sous_matiere) : '')
      + (f.sa ? ' · SA ' + esc(f.sa) : '') + (f.seance ? ' · séance ' + esc(f.seance) : '') + (f.duree ? ' · ' + esc(f.duree) : '');
    const bandeau = '<div class="ped-fb" style="background:' + c + '"><span class="ped-fb-ic">' + svgIc(IC_MAT[f.matiere] || 'fiche', 26) + '</span>'
      + '<span class="ped-fb-t"><b>Fiche de préparation — ' + esc(nomMat(ix, f.matiere)) + '</b><br><small>' + rep + '</small></span></div>';
    const ligne = ([k, l]) => f[k] ? '<tr><th style="width:31%;color:' + c + '"><span class="ped-fi">' + svgIc(IC_CHAMP[k] || 'point', 14) + '</span>' + esc(l) + '</th><td>' + txt(f[k]) + '</td></tr>' : '';
    let s = '<h2 style="color:' + c + '">' + esc(f.titre) + '</h2><table class="ped-fc">' + CHAMPS_FICHE.map(ligne).join('') + '</table>';
    if (f.deroulement && f.deroulement.length) {
      s += '<h3 style="color:' + c + ';border-bottom:2px solid ' + c + '"><span class="ped-fi">' + svgIc('horloge', 16) + '</span>Déroulement</h3>'
        + '<table class="ped-fc"><thead><tr style="background:' + c + '1A"><th>Phases / étapes</th><th>Activités de l\'enseignant(e) et des apprenant(e)s</th><th>Résultats attendus</th></tr></thead><tbody>'
        + f.deroulement.map(l => '<tr><td><b>' + txt(l[0]) + '</b></td><td>' + txt(l[1] || '') + '</td><td>' + txt(l[2] || '') + '</td></tr>').join('') + '</tbody></table>';
    }
    if (f.sequences && f.sequences.length) s += '<h3 style="color:' + c + '">Séquences</h3><ol>' + f.sequences.map(q => '<li>' + txt(typeof q === 'string' ? q : (q.titre || JSON.stringify(q))) + '</li>').join('') + '</ol>';
    s += '<table class="ped-fc">' + CHAMPS_FIN.map(ligne).join('') + '</table>'
      + '<p class="mention">' + esc(f.source || '') + (f.auteur ? ' — auteur : ' + esc(f.auteur) : '') + (f.mention ? ' — ' + esc(f.mention) : '') + '</p>';
    // cadre : l'en-tête (bandeau) et le pied (mention de conception) se répètent sur chaque page imprimée
    return '<table class="ped-fiche" style="--mat:' + c + '"><thead><tr><td>' + bandeau + '</td></tr></thead>'
      + '<tfoot><tr><td><p class="ped-credit">' + esc(CREDIT_PED) + '</p></td></tr></tfoot><tbody><tr><td>' + s + '</td></tr></tbody></table>';
  }
  function resumeHtml(r, ix, eleve) {
    let s = '<h2>' + esc(r.titre) + '</h2><p><b>' + esc(r.cours) + '</b> · ' + esc(nomMat(ix, r.matiere)) + ' · ' + esc(r.domaine || '')
      + (r.etape ? ' · ' + esc(r.etape) : '') + (r.trimestre ? ' · trimestre ' + esc(r.trimestre) : '') + (r.mois ? ' · ' + esc(r.mois) : '') + '</p>';
    if (r.a_verifier) s += '<p class="mention"><b>À vérifier :</b> titre de la séance ou de la SA conçu faute de programme détaillé — à confirmer par le conseiller pédagogique.</p>';
    if (r.ancres && r.ancres.length) s += '<p class="mention">Progression : ' + r.ancres.map(a => esc(a.libelle || '')).filter(Boolean).join(' ; ') + '</p>';
    if (r.je_retiens) {
      if (r.situation) s += '<h3>Situation de la vie courante</h3><p>' + txt(r.situation) + '</p>';
      s += '<h3>' + (r.emc ? 'Valeur ou règle de vie' : 'Notions essentielles') + '</h3><p>' + txt(r.regle) + '</p>';
      if (r.vocabulaire && r.vocabulaire.length) s += '<h3>Vocabulaire</h3><ul>' + r.vocabulaire.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul>';
      s += '<div class="ped-retiens"><b>Je retiens</b><br>' + txt(r.je_retiens) + '</div>';
      if (r.engagement) s += '<div class="ped-engage"><b>Je m\'engage</b><br>' + txt(r.engagement) + '</div>';
    } else s += '<div class="ped-retiens"><b>Je retiens</b><br>' + txt(r.regle) + '</div>';
    if (r.methode) s += '<h3>Méthode</h3><p>' + txt(r.methode) + '</p>';
    if (r.exemple) s += '<h3>Exemple</h3><p>' + txt(r.exemple) + '</p>';
    if (r.exercices && r.exercices.length) {
      s += '<h3>Exercices' + (r.je_retiens ? ' — petite évaluation' : '') + '</h3><ol>' + r.exercices.map(e => '<li>' + esc(e.q)
        + (eleve ? '<div class="ligne"></div>' : '<br><span class="ped-rep">Réponse : ' + esc(e.r) + '</span>') + '</li>').join('') + '</ol>';
    }
    if (!eleve && r.sources && r.sources.length) s += '<p class="mention"><b>Sources :</b> ' + r.sources.map(esc).join(' ; ') + '</p>';
    if (!eleve) s += '<p class="mention">' + esc(r.mention || '') + '</p>';
    return s;
  }
  const pts = (x) => x ? ' (' + String(x).replace('.0', '').replace('.', ',') + ' pt' + (x > 1 ? 's' : '') + ')' : '';
  const pointille = '……………………………';
  function enteteEpreuve(d) {
    const e = d.entete || {};
    return '<table class="ped-ep-tete"><tr><td><b>École :</b> ' + (e.ecole ? esc(e.ecole) : pointille) + '</td><td style="text-align:right"><b>Année scolaire :</b> ' + (e.annee ? esc(e.annee) : '…………') + '</td></tr>'
      + '<tr><td><b>Nom et prénoms :</b> ' + pointille + '</td><td style="text-align:right"><b>Date :</b> ' + (e.date ? esc(e.date) : '…………') + '</td></tr></table>';
  }
  function epreuveSujetHtml(d) {
    const e = d.entete || {};
    let s = '<div class="ped-ep">' + enteteEpreuve(d) + '<h2>' + esc(e.titre || ('Épreuve de ' + d.discipline)) + '</h2><p><b>COURS :</b> ' + esc(e.classe || d.cours) + ' · <b>PÉRIODE :</b> ' + esc(d.periode_lib)
      + ' · <b>DURÉE :</b> ' + esc(e.duree || d.duree) + ' · <b>Barème :</b> ' + esc(d.bareme || 20) + ' points</p>';
    if (d.contexte) s += '<p><i>' + txt(d.contexte) + '</i></p>';
    if (d.support && d.code !== 'dictee' && !(Array.isArray(d.parties_ea) && d.parties_ea.length)) s += '<p><b>' + (['ea', 'eps'].includes(d.code) ? 'Support' : 'Texte') + ' : ' + esc(d.support_titre) + '</b></p><p>' + txt(d.support) + '</p>';
    if (d.tache) s += '<p><b>Tâche :</b> ' + txt(d.tache) + '</p>';
    if (Array.isArray(d.parties_ea) && d.parties_ea.length) s += d.parties_ea.map(x => x.materiel ? '<p><b>Matériel — partie ' + esc(x.partie) + ' :</b> ' + esc(x.materiel) + '</p>' : '').join('');
    s += '<p><b>Consigne :</b></p>';
    (d.consignes || []).forEach(it => {
      if (it.titre === 'Présentation') return;
      s += '<div class="ped-item">' + (it.titre !== 'Consigne' ? '<p class="ped-titre-item">' + esc(it.titre) + '</p>' : '')
        + '<ol type="a">' + (it.questions || []).map(x => '<li>' + esc(String(x.q || '').replace(/^\s*\d+\s*[-.)]\s*/, '')) + esc(pts(x.pts)) + '</li>').join('') + '</ol></div>';
    });
    return s + '</div>';
  }
  function epreuveCorrigeHtml(d) {
    let s = '<div class="ped-ep"><h2>Corrigé type — ' + esc(d.discipline) + '</h2><p>' + esc(d.cours) + ' · ' + esc(d.periode_lib) + '</p>';
    if (d.code === 'dictee') s += '<p><b>' + esc(d.support_titre) + '</b> — ' + txt(d.support) + '</p>';
    const lignes = [];
    (d.consignes || []).forEach(it => (it.questions || []).forEach(x => { if (x.r) lignes.push('<tr><td>' + esc(it.titre) + '</td><td>' + esc(x.q) + '</td><td>' + esc(x.r) + '</td><td>' + esc(x.pts || '') + '</td></tr>'); }));
    if (lignes.length) s += '<table><thead><tr><th>Item</th><th>Question</th><th>Réponse attendue</th><th>Pts</th></tr></thead><tbody>' + lignes.join('') + '</tbody></table>';
    if (d.corrige_note) s += '<p>' + txt(d.corrige_note) + '</p>';
    if (Array.isArray(d.baremes) && d.baremes.length) {   // EPS : barèmes de performance par sexe et par âge
      const a = d.age_normal || '';
      d.baremes.forEach(bm => {
        s += '<div class="ped-item"><h3>Barème — ' + esc(bm.titre) + '</h3><table><thead><tr><th>Note</th><th>Garçons ' + esc(a) + ' ans</th><th>Garçons ' + esc(a ? a + 2 : '') + ' ans</th><th>Filles ' + esc(a) + ' ans</th><th>Filles ' + esc(a ? a + 2 : '') + ' ans</th></tr></thead><tbody>'
          + (bm.lignes || []).map(l => '<tr>' + l.map((c, i) => '<td>' + (i ? esc(c) : '<b>' + esc(c) + '</b>') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
      });
    }
    if (d.fiche_notation && Array.isArray(d.fiche_notation.colonnes)) {
      const fn = d.fiche_notation;
      s += '<div class="saut"></div><h3>Fiche de notation</h3><table><thead><tr>' + fn.colonnes.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>'
        + Array.from({ length: Math.min(60, +fn.lignes || 20) }, (_, i) => '<tr><td>' + (i + 1) + '</td>' + fn.colonnes.slice(1).map(() => '<td>&nbsp;</td>').join('') + '</tr>').join('') + '</tbody></table>';
    }
    if (d.grille && d.grille.length) s += '<h3>Grille de correction</h3><table><thead><tr><th>Critère</th><th>Indicateurs</th><th>Points</th></tr></thead><tbody>'
      + d.grille.map(g => '<tr><td>' + esc(g.critere) + '</td><td>' + (g.indicateurs || []).map(esc).join(' ; ') + '</td><td>' + esc(g.points) + '</td></tr>').join('') + '</tbody></table>';
    const prog = (d.progression || []).filter(Boolean);
    if (prog.length) s += '<p class="mention"><b>Progression prise en compte :</b> ' + prog.map(p => esc(typeof p === 'string' ? p : (Array.isArray(p) ? p.join(' ') : JSON.stringify(p)))).join(' · ') + '</p>';
    s += '<p class="mention">' + esc(d.mention || '') + ' — ' + esc(d.source || '') + (d._version ? ' — version modifiée le ' + esc(String(d._version.date || '').slice(0, 10).split('-').reverse().join('/')) : '') + '</p>';
    return s + '</div>';
  }
  /* ---------- mise en page compacte : deux épreuves (ou deux exemplaires) par feuille A4 quand elles tiennent ---------- */
  const DEMI_MM = 122;   // moitié de la zone imprimable A4 (≈ 270 mm), moins le trait de coupe
  function hauteurMm(html) {
    const d = document.createElement('div'); d.className = 'ped-doc';
    d.style.cssText = 'position:absolute;left:-10000px;top:0;width:182mm;visibility:hidden';
    d.innerHTML = CSS_DOC + html; document.body.append(d);
    const px = d.getBoundingClientRect().height; d.remove();
    return px * 25.4 / 96;
  }
  /** blocs : [{ html, nature }] ; mode « auto » (2 par page quand c'est possible) ou « 1 » (une par page) */
  function miseEnPage(blocs, mode) {
    const pages = [];
    const court = (b) => mode !== '1' && hauteurMm(b.html) <= DEMI_MM;
    const coupe = '<div class="ped-coupe">découper ici</div>';
    for (let i = 0; i < blocs.length; i++) {
      const b = blocs[i];
      if (court(b)) {
        const n = blocs[i + 1];
        if (n && n.nature === b.nature && b.nature !== 'copie' && court(n)) { pages.push('<div class="ped-demi">' + b.html + '</div>' + coupe + '<div class="ped-demi">' + n.html + '</div>'); i++; }
        else pages.push('<div class="ped-demi">' + b.html + '</div>' + coupe + '<div class="ped-demi">' + b.html + '</div>');
      } else pages.push(b.html);
    }
    return pages.map((x, i) => (i ? '<div class="saut"></div>' : '') + x).join('');
  }
  /* ---------- versions modifiées (gardées dans l'application) et copies ---------- */
  const idDe = (type, x) => (type === 'epreuve' ? x.cle : x.id);
  const cleV = (type, id) => 'version:' + type + ':' + id;
  function eff(notes, type, x) {
    if (!x) return x;
    const v = notes[cleV(type, idDe(type, x))] || [];
    if (!v.length) return x;
    const der = v[v.length - 1];
    return Object.assign({}, x, der.data, { _version: { n: v.length, date: der.date, auteur: der.auteur } });
  }
  const copiesDe = (notes, type, c) => (notes.copies || []).filter(k => k.type === type && k.cours === c).map(k => Object.assign({}, k.data, { _copie: true }));
  function programmeHtml(p, ix) {
    let s = '<h2>' + esc(p.titre) + '</h2><p>' + esc(p.cours) + ' · ' + esc(nomMat(ix, p.matiere)) + ' · ' + (p.type === 'unite' ? 'Unité' : "Situation d'apprentissage") + ' ' + esc(p.num || '')
      + (p.duree ? ' · ' + esc(p.duree) : '') + (p.periode ? ' · ' + esc(p.periode) : '') + '</p><table>';
    [['theme', 'Thème'], ['domaine', 'Domaine'], ['cd', 'Compétence disciplinaire'], ['ct', 'Compétences transversales'], ['ctd', 'Compétences transdisciplinaires'],
      ['connaissances', 'Connaissances et techniques'], ['materiel', 'Matériel'], ['page', 'Pages du guide']].forEach(([k, l]) => { if (p[k]) s += '<tr><th style="width:30%">' + esc(l) + '</th><td>' + txt(p[k]) + '</td></tr>'; });
    if (p.detail && typeof p.detail === 'object') Object.entries(p.detail).forEach(([k, v]) => { if (v) s += '<tr><th>' + esc(k.replace(/_/g, ' ')) + '</th><td>' + txt(typeof v === 'string' ? v : JSON.stringify(v)) + '</td></tr>'; });
    s += '</table>';
    if (p.sequences && p.sequences.length) s += '<h3>Séquences</h3><table><thead><tr><th>N°</th><th>Titre</th><th>Contenu</th><th>Matériel</th></tr></thead><tbody>'
      + p.sequences.map((q, i) => '<tr><td>' + esc(q.num || i + 1) + '</td><td>' + esc(q.titre || '') + '</td><td>' + txt(q.contenu || '') + '</td><td>' + txt(q.materiel || '') + '</td></tr>').join('') + '</tbody></table>';
    if (p.semaines && p.semaines.length) {
      s += '<h3>Progression par semaine</h3><table><thead><tr><th>Semaine</th><th>SA</th><th>Sous-matière</th><th>Contenu</th></tr></thead><tbody>';
      p.semaines.forEach(w => (w.seances || []).forEach((x, i) => { s += '<tr><td>' + (i === 0 ? esc(w.num) : '') + '</td><td>' + esc(x.sa || '') + '</td><td>' + esc(x.sous_matiere || '') + '</td><td><b>' + esc(x.titre || '') + '</b>' + (x.detail ? '<br>' + esc(x.detail) : '') + '</td></tr>'; }));
      s += '</tbody></table>';
    }
    if (p.source) s += '<p class="mention">Source : ' + esc(p.source) + '</p>';
    return s;
  }
  const numUnite = (f) => { const m = /(\d+)/.exec(f.unite || ''); return m ? +m[1] : null; };
  function fichesDuProgramme(d, p) {
    return d.fiches.filter(f => f.matiere === p.matiere && (p.type === 'unite' ? numUnite(f) === p.num && !/dossier/i.test(f.unite || '') : f.sa === p.num && !(p.matiere === 'maths' && p.dossier && numUnite(f) !== p.dossier)));
  }
  const reperesFiche = (f) => [f.unite, f.sa ? 'SA ' + f.sa : '', f.seance ? 'séance ' + f.seance : ''].filter(Boolean).join(' · ');
  const domaineResume = (r) => r.outil || r.domaine || '';

  /* ---------------- planification : répartition des fiches sur les créneaux (comme SCOLARIS) ---------------- */
  function journee(d, mois, k, jourIdx) {
    const w = ((d.plan[mois] || {}).semaines || [])[k] || { fiches: {}, resumes: {} };
    const sug = {}; Object.entries(w.fiches || {}).forEach(([m, ids]) => { sug[m] = ids.map(i => d._fiche[i]).filter(Boolean); });
    const decal = {};
    let out = [];
    for (let j = 0; j <= jourIdx; j++) {
      const cr = (d.edt.jours || {})[JOURS[j][0]] || [];
      const rang = {};
      const jour = cr.map(c => {
        const liste = sug[c.matiere] || [];
        const x = Object.assign({}, c);
        if (liste.length) { const i = (decal[c.matiere] || 0) + (rang[c.matiere] || 0); x.fiche = liste[i % liste.length]; rang[c.matiere] = (rang[c.matiere] || 0) + 1; }
        return x;
      });
      Object.entries(rang).forEach(([m, n]) => { decal[m] = (decal[m] || 0) + n; });
      if (j === jourIdx) out = jour;
    }
    return out;
  }

  /* ---------------- le module ---------------- */
  async function monter(racine, A, opts) {
    styles();
    opts = opts || {};
    const memo = A.memo || { get: (k) => { try { return localStorage.getItem('ped.' + k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem('ped.' + k, v); } catch (e) { /* indisponible */ } } };
    let F = {};
    try { F = JSON.parse(memo.get('filtres') || '{}') || {}; } catch (e) { F = {}; }
    F.cours = opts.cours || F.cours || A.coursParDefaut || 'CM2';
    if (!COURS.includes(F.cours)) F.cours = 'CM2';
    let onglet = opts.onglet || memo.get('onglet') || 'planification';
    if (!ONGLETS.some(o => o[0] === onglet)) onglet = 'planification';
    let page = 0;
    let notes = {};
    if (!A.notes) A.notes = { charger: () => { try { return JSON.parse(memo.get('notes') || '{}'); } catch (e) { return {}; } }, enregistrer: (o) => memo.set('notes', JSON.stringify(o)) };
    try { notes = (await A.notes.charger()) || {}; } catch (e) { notes = {}; }
    const E_ = (type, x) => eff(notes, type, x);
    const peutModifier = A.peutModifier !== false;
    const sauverF = () => memo.set('filtres', JSON.stringify(F));
    /* Titulaire de la classe : en filigrane oblique sur les fiches imprimées (saisi une fois, gardé sur l'appareil) */
    const titulaire = () => String(memo.get('titulaire') || (A.titulaire && A.titulaire(F.cours)) || '').trim();
    const champTitulaire = () => {
      const i = h('input', { type: 'text', value: titulaire(), placeholder: 'Nom et prénoms du titulaire', 'aria-label': 'Titulaire de la classe (filigrane)', 'data-ped': 'titulaire', 'data-geo': 'aucun', style: 'max-width:280px' });
      i.addEventListener('input', () => memo.set('titulaire', i.value.trim()));
      return h('label', { class: 'ped-aide', style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, 'Titulaire (filigrane des fiches)', i);
    };

    racine.innerHTML = '';
    const boite = h('div', { class: 'ped', 'data-ped': 'module' });
    if (A.hautFixe) boite.style.setProperty('--ped-haut', A.hautFixe);
    racine.append(boite);
    const barreOnglets = h('div', { class: 'ped-onglets', role: 'tablist' });
    const zoneFiltres = h('div', { class: 'ped-filtres' });
    const zone = h('div', { 'aria-live': 'polite' });
    const liens = h('div', { class: 'ped-actions' });
    boite.append(h('p', { class: 'ped-aide' }, 'Programmes, guides, progressions, fiches, résumés et épreuves du CI au CM2 (contenus de SCOLARIS, consultables sans connexion une fois ouverts). ',
      'Choisissez le cours puis la rubrique.'), liens, barreOnglets, zoneFiltres, zone);

    let ix;
    try { ix = await index(A); } catch (e) {
      zone.append(h('p', { class: 'ped-vide' }, 'Le contenu pédagogique n’a pas pu être chargé (pas de connexion et rien d’enregistré sur cet appareil). Réessayez une fois connecté.'));
      return;
    }
    (A.liens || []).forEach(l => liens.append(btn(l.icone || 'lien', l.l, () => A.ouvrir && A.ouvrir(l.route), 's')));
    const hl = btn('telecharger', 'Rendre tout disponible hors ligne', async () => {
      hl.disabled = true;
      try { await toutHorsLigne(A, (n, t) => { hl.lastChild.textContent = `Hors ligne : ${n} / ${t}…`; }); hl.lastChild.textContent = 'Disponible hors ligne'; } catch (e) { hl.lastChild.textContent = 'Échec : réessayez connecté'; hl.disabled = false; }
    }, 's', { 'data-ped': 'hors-ligne' });
    liens.append(hl);

    ONGLETS.forEach(([id, l, ico]) => barreOnglets.append(h('button', { type: 'button', role: 'tab', 'data-ped-onglet': id, class: id === onglet ? 'on' : '', 'aria-selected': id === onglet ? 'true' : 'false',
      onclick: () => { onglet = id; memo.set('onglet', id); page = 0; [...barreOnglets.children].forEach(b => { const on = b.getAttribute('data-ped-onglet') === id; b.className = on ? 'on' : ''; b.setAttribute('aria-selected', on ? 'true' : 'false'); }); rendre(); } }, ic(ico), l)));

    /* --- notes locales (conseiller pédagogique, administrateur) --- */
    function blocNotes(cle) {
      const box = h('div', {});
      const liste = notes[cle] || [];
      liste.forEach((n, i) => box.append(h('div', { class: 'ped-note' }, h('b', {}, 'Note' + (n.auteur ? ' de ' + n.auteur : '') + (n.date ? ' — ' + n.date.slice(0, 10).split('-').reverse().join('/') : '') + ' : '), n.texte,
        A.peutAnnoter ? h('span', {}, ' ', btn('supprimer', 'Retirer', async () => { liste.splice(i, 1); if (!liste.length) delete notes[cle]; await A.notes.enregistrer(notes); box.replaceWith(blocNotes(cle)); }, 's d')) : null)));
      if (A.peutAnnoter && A.notes) {
        const ta = h('textarea', { rows: '2', placeholder: 'Ajouter une note pour les enseignants (consigne, adaptation, remarque)…', 'aria-label': 'Nouvelle note', 'data-ped': 'note' });
        box.append(h('div', { class: 'ped-actions' }, ta, btn('ajouter', 'Ajouter la note', async () => {
          const t = ta.value.trim(); if (!t) return;
          (notes[cle] = notes[cle] || []).push({ texte: t.slice(0, 2000), auteur: A.auteur || '', date: new Date().toISOString() });
          await A.notes.enregistrer(notes); box.replaceWith(blocNotes(cle));
        }, 's', { 'data-ped': 'ajouter-note' })));
      }
      return box;
    }
    const notesHtml = (cle) => (notes[cle] || []).map(n => '<p class="ped-note"><b>Note' + (n.auteur ? ' de ' + esc(n.auteur) : '') + ' :</b> ' + esc(n.texte) + '</p>').join('');

    /* --- modifier : version gardée dans l'application, rétablir l'original, dupliquer --- */
    const CH_FICHE = [['titre', 'Titre de la séance'], ...CHAMPS_FICHE, ...CHAMPS_FIN];
    const CH_RESUME = [['titre', 'Titre'], ['situation', 'Situation de la vie courante'], ['regle', 'Je retiens / notions essentielles'], ['je_retiens', 'Je retiens (ES / EST)'], ['engagement', 'Je m’engage'], ['methode', 'Méthode'], ['exemple', 'Exemple']];
    const CH_EP = [['contexte', 'Contexte'], ['support_titre', 'Titre du texte / support'], ['support', 'Texte / support'], ['tache', 'Tâche'], ['corrige_note', 'Note du corrigé']];
    const champ = (lib, val, attrs) => { const t = h('textarea', Object.assign({ rows: String(Math.min(8, Math.max(1, Math.ceil(String(val || '').length / 70)))), 'data-geo': 'aucun' }, attrs || {})); t.value = val == null ? '' : String(val); return [h('label', { class: 'ped-aide', style: 'display:block;margin-top:6px;font-weight:600' }, lib), t]; };
    async function sauverNotes() { await A.notes.enregistrer(notes); }
    function modifier(type, x, apres) {
      const lecture = [];
      const form = h('div', { 'data-ped': 'form-modifier' });
      const simples = type === 'fiche' ? CH_FICHE : type === 'resume' ? CH_RESUME : CH_EP;
      if (type === 'epreuve') {
        const e = x.entete || {};
        form.append(h('h4', {}, 'En-tête'));
        [['ecole', 'École', e.ecole], ['classe', 'Classe / cours', e.classe || x.cours], ['annee', 'Année scolaire', e.annee], ['date', 'Date', e.date], ['duree', 'Durée', e.duree || x.duree], ['titre', 'Titre de l’épreuve', e.titre || ('Épreuve de ' + x.discipline)]]
          .forEach(([k, l, v]) => { const [lab, t] = champ(l, v, { 'data-ent': k, rows: '1' }); form.append(lab, t); lecture.push(() => ['entete.' + k, t.value]); });
        const b = h('input', { type: 'number', min: '1', max: '200', value: String(x.bareme || 20), 'data-ped': 'bareme', style: 'max-width:120px' });
        form.append(h('label', { class: 'ped-aide', style: 'display:block;margin-top:6px;font-weight:600' }, 'Barème (points)'), b); lecture.push(() => ['bareme', +b.value || 20]);
        form.append(h('h4', {}, 'Énoncé'));
      }
      simples.forEach(([k, l]) => { if (type !== 'epreuve' && !(k in x) && !['titre', 'regle', 'methode', 'exemple'].includes(k)) return; const [lab, t] = champ(l, x[k], { 'data-k': k }); form.append(lab, t); lecture.push(() => [k, t.value]); });
      if (type === 'fiche') {
        const lignes = (x.deroulement || []).map(r => r.slice());
        form.append(h('h4', {}, 'Déroulement'));
        lignes.forEach((r, i) => { const z = [0, 1, 2].map(j => champ(['Phase', 'Activités enseignant / apprenants', 'Résultats attendus'][j] + ' — ligne ' + (i + 1), r[j] || '')); z.forEach(([lab, t]) => form.append(lab, t)); lecture.push(() => ['deroulement.' + i, z.map(q => q[1].value)]); });
      }
      if (type === 'resume' && x.exercices) {
        form.append(h('h4', {}, 'Exercices et réponses'));
        x.exercices.forEach((q, i) => { const [l1, t1] = champ('Exercice ' + (i + 1), q.q), [l2, t2] = champ('Réponse ' + (i + 1), q.r); form.append(l1, t1, l2, t2); lecture.push(() => ['exercices.' + i, { q: t1.value, r: t2.value }]); });
      }
      if (type === 'epreuve') {
        form.append(h('h4', {}, 'Consignes, corrigé type et barème'));
        (x.consignes || []).forEach((it, i) => {
          const [lt, tt] = champ('Item ' + (i + 1) + ' — titre', it.titre, { rows: '1' }); form.append(lt, tt);
          const qs = (it.questions || []).map((qq, j) => {
            const [a, ta] = champ('Question ' + (j + 1), qq.q, { 'data-q': i + '.' + j }), [b, tb] = champ('Corrigé', qq.r, { 'data-r': i + '.' + j });
            const pp = h('input', { type: 'number', step: '0.25', min: '0', value: qq.pts == null ? '' : String(qq.pts), 'aria-label': 'Points', 'data-pts': i + '.' + j, style: 'max-width:120px' });
            form.append(a, ta, b, tb, h('label', { class: 'ped-aide', style: 'display:block;margin-top:4px' }, 'Points'), pp);
            return () => ({ q: ta.value, r: tb.value, pts: pp.value === '' ? null : +pp.value });
          });
          lecture.push(() => ['consignes.' + i, { titre: tt.value, questions: qs.map(f => f()) }]);
        });
      }
      const lire = () => {
        const out = {};
        lecture.forEach(f => { const [k, v] = f();
          if (k.startsWith('entete.')) { (out.entete = out.entete || {})[k.slice(7)] = v; return; }
          const m = /^(deroulement|exercices|consignes)\.(\d+)$/.exec(k);
          if (m) { (out[m[1]] = out[m[1]] || [])[+m[2]] = v; return; }
          out[k] = v; });
        return out;
      };
      dialogue('Modifier — ' + (x.titre || x.discipline || ''), form, [{ l: 'Annuler' }, { l: 'Enregistrer la version', icone: 'enregistrer', p: true, action: async () => {
        const data = lire();
        if (x._copie) { const c = (notes.copies || []).find(k => idDe(type, k.data) === idDe(type, x)); if (c) c.data = Object.assign({}, c.data, data, { _version: undefined }); }
        else (notes[cleV(type, idDe(type, x))] = notes[cleV(type, idDe(type, x))] || []).push({ date: new Date().toISOString(), auteur: A.auteur || '', data });
        await sauverNotes(); apres && apres(); } }]);
    }
    async function retablir(type, x, apres) {
      if (!confirm('Rétablir le texte d’origine ? Les versions modifiées de cet élément seront effacées.')) return;
      delete notes[cleV(type, idDe(type, x))]; await sauverNotes(); apres && apres();
    }
    async function dupliquer(type, x, apres) {
      const id = 'copie-' + Date.now().toString(36);
      const data = Object.assign({}, x, { _version: undefined, _copie: undefined });
      if (type === 'epreuve') { data.cle = id; data.discipline = x.discipline + ' (copie)'; } else { data.id = id; data.titre = (x.titre || '') + ' (copie)'; }
      (notes.copies = notes.copies || []).push({ type, cours: x.cours, data, date: new Date().toISOString(), auteur: A.auteur || '' });
      await sauverNotes(); apres && apres(Object.assign({}, data, { _copie: true }));
    }
    async function supprimerCopie(type, x, apres) {
      if (!confirm('Supprimer cette copie ?')) return;
      notes.copies = (notes.copies || []).filter(k => !(k.type === type && idDe(type, k.data) === idDe(type, x))); await sauverNotes(); apres && apres();
    }
    /** Barre « Modifier » d'un élément ouvert */
    function barreEdition(type, x, rouvrir, fermer) {
      if (!peutModifier) return null;
      const fin = (nouveau) => { fermer(); rendre(); if (nouveau) rouvrir(nouveau); };
      const relire = () => { fermer(); rendre(); const n = x._copie ? copiesDe(notes, type, x.cours).find(k => idDe(type, k) === idDe(type, x)) : E_(type, base(type, x)); if (n) rouvrir(n); };
      return h('div', { class: 'ped-actions', 'data-ped': 'barre-edition' },
        x._version ? h('span', { class: 'ped-badge ok', style: 'align-self:center' }, `version modifiée (${x._version.n}) — ${String(x._version.date || '').slice(0, 10).split('-').reverse().join('/')}`) : null,
        x._copie ? h('span', { class: 'ped-badge src', style: 'align-self:center' }, 'copie') : null,
        btn('modifier', 'Modifier', () => modifier(type, x, relire), 's', { 'data-ped': 'modifier' }),
        btn('presse-papiers', 'Dupliquer', () => dupliquer(type, x, fin), 's', { 'data-ped': 'dupliquer' }),
        x._version ? btn('actualiser', 'Rétablir l’original', () => retablir(type, x, () => { fermer(); rendre(); rouvrir(base(type, x)); }), 's d', { 'data-ped': 'retablir' }) : null,
        x._copie ? btn('supprimer', 'Supprimer la copie', () => supprimerCopie(type, x, () => { fermer(); rendre(); }), 's d', { 'data-ped': 'supprimer-copie' }) : null);
    }
    /** Élément d'origine (sans version) */
    function base(type, x) {
      const d = CHARGES_COURS[x.cours]; if (!d) return x;
      const o = type === 'fiche' ? d._fiche[x.id] : type === 'resume' ? d._resume[x.id] : d.epreuves.find(e => e.cle === x.cle);
      return o || x;
    }

    /* --- ouverture d'un élément (fenêtre) --- */
    function ouvrirFiche(f) {
      const d = CHARGES_COURS[f.cours];
      const lies = d ? d.resumes.filter(r => (r.fiches || []).indexOf(f.id) >= 0) : [];
      let fermer = () => {};
      const corps = h('div', {}, h('div', { 'data-ped': 'zone-edition' }), h('div', { class: 'ped-actions' }, champTitulaire()), h('div', { class: 'ped-doc', html: ficheHtml(f, ix) }),
        lies.length ? h('div', { class: 'ped-carte', 'data-ped': 'resumes-seance' }, h('h3', {}, 'Résumé' + (lies.length > 1 ? 's' : '') + ' de la séance'), h('ul', { class: 'ped-liste' }, lies.map(r => h('li', {}, lien({ onclick: () => ouvrirResume(r) }, r.titre))))) : null,
        blocNotes('fiche:' + f.id));
      fermer = dialogue(f.titre, corps, [{ l: 'Fermer' }, { l: 'Imprimer / PDF', icone: 'imprimer', p: true, action: () => { imprimer(A, f.titre, ficheHtml(f, ix) + notesHtml('fiche:' + f.id), { titulaire: titulaire() }); } }]);
      const b = barreEdition('fiche', f, ouvrirFiche, () => fermer()); if (b) corps.firstChild.append(b);
    }
    function ouvrirResume(r) {
      let eleve = false;
      const doc = h('div', { class: 'ped-doc', html: resumeHtml(r, ix, false) });
      const bascule = btn('eleve', 'Version élève (sans les réponses)', () => { eleve = !eleve; doc.innerHTML = resumeHtml(r, ix, eleve); bascule.lastChild.textContent = eleve ? 'Version enseignant (avec les réponses)' : 'Version élève (sans les réponses)'; }, 's');
      const barre = h('div', { class: 'ped-actions' }, bascule);
      const fermer = dialogue(r.titre, h('div', {}, barre, doc, blocNotes('resume:' + r.id)),
        [{ l: 'Fermer' }, { l: 'Imprimer / PDF', icone: 'imprimer', p: true, action: () => { imprimer(A, r.titre, resumeHtml(r, ix, eleve) + (eleve ? '' : notesHtml('resume:' + r.id))); } }]);
      const b = barreEdition('resume', r, ouvrirResume, () => fermer()); if (b) barre.after(b);
    }
    const mep = () => (F.mep === '1' ? '1' : 'auto');
    function choixMiseEnPage() {
      const s = h('select', { 'aria-label': 'Mise en page', 'data-ped': 'mise-en-page', onchange: () => { F.mep = s.value; sauverF(); } },
        h('option', { value: 'auto' }, '2 par page quand l’épreuve est courte'), h('option', { value: '1' }, '1 par page'));
      s.value = mep(); return h('label', { class: 'ped-aide', style: 'display:flex;gap:6px;align-items:center' }, 'Mise en page', s);
    }
    function ouvrirEpreuve(e) {
      const doc = h('div', { class: 'ped-doc', html: epreuveSujetHtml(e) + '<div class="saut"></div>' + epreuveCorrigeHtml(e) });
      const barre = h('div', { class: 'ped-actions' }, choixMiseEnPage());
      const fermer = dialogue(e.discipline + ' — ' + e.cours, h('div', {}, barre, doc, blocNotes('epreuve:' + e.cle)), [{ l: 'Fermer' },
        { l: 'Corrigé et grille', icone: 'valider', action: () => { imprimer(A, 'Corrigé — ' + e.discipline, miseEnPage([{ html: epreuveCorrigeHtml(e), nature: 'corrige' }], mep()), { epreuve: true }); } },
        { l: 'Sujet', icone: 'imprimer', p: true, action: () => { imprimer(A, 'Sujet — ' + e.discipline, miseEnPage([{ html: epreuveSujetHtml(e), nature: e.code }], mep()), { epreuve: true }); } }]);
      const b = barreEdition('epreuve', e, ouvrirEpreuve, () => fermer()); if (b) barre.after(b);
    }
    async function ouvrirProgramme(p) {
      const d = await cours(A, p.cours);
      const fs = fichesDuProgramme(d, p);
      const corps = h('div', {}, h('div', { class: 'ped-doc', html: programmeHtml(p, ix) }),
        h('h4', {}, `Fiches de préparation (${fs.length})`),
        fs.length ? h('ul', { class: 'ped-liste' }, fs.map(f => h('li', {}, lien({ onclick: () => ouvrirFiche(f) }, f.titre), ' ', h('span', { class: 'ped-aide' }, reperesFiche(f))))) : h('p', { class: 'ped-vide' }, 'Aucune fiche rattachée.'),
        blocNotes('programme:' + p.id));
      dialogue(p.titre, corps, [{ l: 'Fermer' }, { l: 'Imprimer / PDF', icone: 'imprimer', p: true, action: () => { imprimer(A, p.titre, programmeHtml(p, ix)); } }]);
    }

    /* --- filtres --- */
    const sel = (lib, cle, options, surChange) => {
      const s = h('select', { 'aria-label': lib, 'data-ped-filtre': cle, onchange: () => { F[cle] = s.value; sauverF(); page = 0; if (surChange) surChange(); rendre(); } },
        options.map(([v, l]) => h('option', { value: v }, l)));
      const voulu = F[cle] == null ? '' : String(F[cle]);
      if (options.some(o => String(o[0]) === voulu)) s.value = voulu;
      else { s.value = options.length ? String(options[0][0]) : ''; F[cle] = s.value; }
      return h('label', {}, lib, s);
    };
    const champRecherche = () => {
      const i = h('input', { type: 'search', placeholder: 'Mot du titre, du thème…', value: F.q || '', 'aria-label': 'Rechercher', 'data-ped-filtre': 'q', 'data-geo': 'aucun' });
      let t = null; i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { F.q = i.value; sauverF(); page = 0; rendreListe(); }, 250); });
      return h('label', {}, 'Rechercher', i);
    };
    const optMatieres = (avecTout, liste) => (avecTout ? [['', 'Toutes les matières']] : []).concat(ORDRE_MAT.filter(m => !liste || liste.includes(m)).map(m => [m, nomMat(ix, m)]));
    const uniq = (a) => [...new Set(a.filter(x => x !== null && x !== undefined && x !== ''))];
    const contient = (o, champs) => { const q = norm(F.q || '').trim(); if (!q) return true; const t = norm(champs.map(k => o[k] || '').join(' ')); return q.split(/\s+/).every(m => t.includes(m)); };

    let rendreListe = () => {};
    async function rendre() {
      zoneFiltres.innerHTML = ''; zone.innerHTML = '';
      zone.append(h('p', { class: 'ped-aide' }, 'Chargement…'));
      let d;
      try { d = await cours(A, F.cours); } catch (e) { zone.innerHTML = ''; zone.append(h('p', { class: 'ped-vide' }, 'Ce cours n’est pas encore disponible sur cet appareil (connexion nécessaire pour l’ouvrir la première fois).')); return; }
      zone.innerHTML = '';
      zoneFiltres.append(sel('Cours', 'cours', COURS.map(c => [c, c])));
      const vues = { fiches: vueFiches, resumes: vueResumes, epreuves: vueEpreuves, progressions: vueProgressions, programmes: vueProgrammes, guides: vueGuides, planification: vuePlanification };
      await vues[onglet](d);
    }

    /* --- fiches --- */
    function vueFiches(d) {
      const toutes = d.fiches.concat(copiesDe(notes, 'fiche', F.cours)).map(f => E_('fiche', f));
      const mats = uniq(toutes.map(f => f.matiere));
      zoneFiltres.append(sel('Matière', 'matiere', optMatieres(true, mats)));
      const base = toutes.filter(f => !F.matiere || f.matiere === F.matiere);
      zoneFiltres.append(sel('Sous-matière / domaine', 'smat', [['', 'Toutes']].concat(uniq(base.map(f => f.sous_matiere)).sort().map(x => [x, x]))));
      const b2 = base.filter(f => !F.smat || f.sous_matiere === F.smat);
      zoneFiltres.append(sel('SA / leçon', 'sa', [['', 'Toutes']].concat(uniq(b2.map(f => f.sa)).sort((a, b) => a - b).map(x => [String(x), 'SA ' + x]))));
      const b3 = b2.filter(f => !F.sa || String(f.sa) === String(F.sa));
      zoneFiltres.append(sel('Séance', 'seance', [['', 'Toutes']].concat(uniq(b3.map(f => f.seance)).sort((a, b) => a - b).map(x => [String(x), 'Séance ' + x]))));
      zoneFiltres.append(champRecherche());
      const liste = h('div', {});
      zone.append(liste);
      rendreListe = () => {
        liste.innerHTML = '';
        const l = b3.filter(f => (!F.seance || String(f.seance) === String(F.seance)) && contient(f, ['titre', 'intitule', 'sous_matiere', 'contenus', 'unite']));
        const nbp = Math.max(1, Math.ceil(l.length / PAR_PAGE)); if (page >= nbp) page = nbp - 1;
        liste.append(h('div', { class: 'ped-actions' }, h('span', { class: 'ped-aide', style: 'align-self:center' }, `${l.length} fiche(s)`),
          btn('classeur', `Classeur de la sélection (PDF${l.length > MAX_LIVRET ? ', ' + MAX_LIVRET + ' premières' : ''})`, () => {
            if (!l.length) return;
            imprimer(A, 'Classeur de fiches — ' + F.cours, '<h1>Classeur de fiches de préparation — ' + esc(F.cours) + (F.matiere ? ' — ' + esc(nomMat(ix, F.matiere)) : '') + '</h1>'
              + l.slice(0, MAX_LIVRET).map((f, i) => (i ? '<div class="saut"></div>' : '') + ficheHtml(f, ix)).join(''), { titulaire: titulaire() });
          }, 's', { 'data-ped': 'classeur-selection' }), champTitulaire()));
        if (!l.length) { liste.append(h('p', { class: 'ped-vide' }, 'Aucune fiche pour ces critères.')); return; }
        liste.append(h('div', { class: 'ped-tw' }, h('table', { class: 'ped-t', 'data-ped': 'table-fiches' },
          h('thead', {}, h('tr', {}, ['Matière', 'Unité / SA / séance', 'Sous-matière', 'Titre', 'Durée', 'Origine'].map(x => h('th', {}, x)))),
          h('tbody', {}, l.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE).map(f => h('tr', { class: 'lien', tabindex: '0', onclick: () => ouvrirFiche(f), onkeydown: (e) => { if (e.key === 'Enter') ouvrirFiche(f); } },
            h('td', {}, nomMat(ix, f.matiere)), h('td', { class: 'n' }, reperesFiche(f)), h('td', {}, f.sous_matiere || ''), h('td', {}, h('b', {}, f.titre), notes['fiche:' + f.id] ? h('span', { class: 'ped-badge' }, ' note') : null),
            h('td', { class: 'n' }, f.duree || ''), h('td', {}, h('span', { class: 'ped-badge ' + (f.statut === 'concue' ? 'ok' : 'src') }, f.statut === 'concue' ? 'conçue (APC)' : 'source'))))))));
        if (nbp > 1) liste.append(h('div', { class: 'ped-pages' }, btn('precedent', 'Précédente', () => { page--; rendreListe(); }, 's', { disabled: page === 0 }),
          h('span', { class: 'ped-aide' }, `Page ${page + 1} / ${nbp}`), btn('suivant', 'Suivante', () => { page++; rendreListe(); }, 's', { disabled: page >= nbp - 1 })));
      };
      rendreListe();
    }

    /* --- résumés --- */
    function vueResumes(d) {
      const tous = d.resumes.concat(copiesDe(notes, 'resume', F.cours)).map(r => E_('resume', r));
      const mats = uniq(tous.map(r => r.matiere));
      zoneFiltres.append(sel('Matière', 'matiere', optMatieres(true, mats)));
      const base = tous.filter(r => !F.matiere || r.matiere === F.matiere);
      zoneFiltres.append(sel('Outil de la langue / domaine', 'dom', [['', 'Tous']].concat(uniq(base.map(domaineResume)).sort().map(x => [x, x]))));
      const b2 = base.filter(r => !F.dom || domaineResume(r) === F.dom);
      zoneFiltres.append(sel('SA', 'rsa', [['', 'Toutes']].concat(uniq(b2.flatMap(r => r.sa || [])).sort((a, b) => a - b).map(x => [String(x), 'SA ' + x]))));
      zoneFiltres.append(sel('Type', 'rtype', [['', 'Tous les résumés'], ['seance', 'Résumés de séance'], ['sa', 'Résumés de SA / de leçon']]));
      zoneFiltres.append(sel('Mois', 'rmois', [['', 'Toute l’année']].concat(MOIS.filter(m => b2.some(r => r.mois === m)).map(m => [m, m]))));
      zoneFiltres.append(champRecherche());
      const liste = h('div', {});
      zone.append(liste);
      rendreListe = () => {
        liste.innerHTML = '';
        const l = b2.filter(r => (!F.rsa || (r.sa || []).map(String).includes(String(F.rsa))) && (!F.rmois || r.mois === F.rmois) && (!F.rtype || (F.rtype === 'seance') === !!r.seance_resume) && contient(r, ['titre', 'domaine', 'outil', 'regle', 'etape']));
        const cahier = (eleve) => imprimer(A, 'Cahier de résumés — ' + F.cours, '<h1>Cahier de résumés — ' + esc(F.cours) + (F.matiere ? ' — ' + esc(nomMat(ix, F.matiere)) : '') + (eleve ? ' (version élève)' : '') + '</h1>'
          + '<p class="mention">' + l.length + ' résumé(s), dans l’ordre de la progression annuelle.</p>' + l.slice(0, MAX_LIVRET * 2).map((r, i) => (i ? '<div class="saut"></div>' : '') + resumeHtml(r, ix, eleve)).join(''));
        liste.append(h('div', { class: 'ped-actions' }, h('span', { class: 'ped-aide', style: 'align-self:center' }, `${l.length} résumé(s)`),
          btn('livre', 'Cahier de résumés (PDF enseignant)', () => l.length && cahier(false), 's', { 'data-ped': 'cahier' }),
          btn('eleve', 'Cahier élève (sans réponses)', () => l.length && cahier(true), 's', { 'data-ped': 'cahier-eleve' })));
        if (!l.length) { liste.append(h('p', { class: 'ped-vide' }, 'Aucun résumé pour ces critères.')); return; }
        const nbp = Math.max(1, Math.ceil(l.length / PAR_PAGE)); if (page >= nbp) page = nbp - 1;
        liste.append(h('div', { class: 'ped-tw' }, h('table', { class: 'ped-t', 'data-ped': 'table-resumes' },
          h('thead', {}, h('tr', {}, ['Matière', 'Domaine / outil', 'Progression', 'Titre'].map(x => h('th', {}, x)))),
          h('tbody', {}, l.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE).map(r => h('tr', { class: 'lien', tabindex: '0', onclick: () => ouvrirResume(r), onkeydown: (e) => { if (e.key === 'Enter') ouvrirResume(r); } },
            h('td', {}, nomMat(ix, r.matiere)), h('td', {}, domaineResume(r)),
            h('td', { class: 'n' }, [r.trimestre ? 'T' + r.trimestre : '', r.mois || '', (r.ancres && r.ancres[0] && r.ancres[0].libelle) || r.etape || ''].filter(Boolean).join(' · ')),
            h('td', {}, h('b', {}, r.titre), r.seance_resume ? h('span', { class: 'ped-badge src' }, ' séance') : null, r.a_verifier ? h('span', { class: 'ped-badge' }, ' à vérifier') : null)))))));
        if (nbp > 1) liste.append(h('div', { class: 'ped-pages' }, btn('precedent', 'Précédente', () => { page--; rendreListe(); }, 's', { disabled: page === 0 }),
          h('span', { class: 'ped-aide' }, `Page ${page + 1} / ${nbp}`), btn('suivant', 'Suivante', () => { page++; rendreListe(); }, 's', { disabled: page >= nbp - 1 })));
      };
      rendreListe();
    }

    /* --- épreuves --- */
    async function vueEpreuves(d) {
      const types = TYPES_EP.filter(([t]) => d.epreuves.some(e => e.type === t));
      zoneFiltres.append(sel('Type d’évaluation', 'etype', types));
      const pers = uniq(d.epreuves.filter(e => e.type === F.etype).map(e => e.periode));
      const libPer = (p) => (d.epreuves.find(e => e.periode === p) || {}).periode_lib || p;
      zoneFiltres.append(sel('Période', 'eper', pers.map(p => [p, libPer(p)])));
      const l = d.epreuves.concat(copiesDe(notes, 'epreuve', F.cours)).map(e => E_('epreuve', e)).filter(e => e.periode === F.eper).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
      const jeu = (corrige) => imprimer(A, (corrige ? 'Corrigés — ' : 'Sujets — ') + libPer(F.eper), miseEnPage(l.map(e => ({ html: corrige ? epreuveCorrigeHtml(e) : epreuveSujetHtml(e), nature: corrige ? 'corrige' : e.code })), mep()), { epreuve: true });
      const act = h('div', { class: 'ped-actions' }, h('span', { class: 'ped-aide', style: 'align-self:center' }, `${l.length} épreuve(s)`), choixMiseEnPage(),
        btn('imprimer', 'Toutes les épreuves (sujets)', () => l.length && jeu(false), 's', { 'data-ped': 'jeu-sujets' }),
        btn('valider', 'Tous les corrigés et grilles', () => l.length && jeu(true), 's', { 'data-ped': 'jeu-corriges' }));
      if (A.examenBlanc && l.length) {
        let ret = null; try { ret = await A.examenBlanc.lire(); } catch (e) { ret = null; }
        const deja = ret && ret.cours === F.cours && ret.periode === F.eper;
        act.append(btn('stade', deja ? 'Sujets retenus pour l’examen blanc' : 'Retenir comme sujets de l’examen blanc', async () => {
          await A.examenBlanc.retenir({ cours: F.cours, periode: F.eper, periode_lib: libPer(F.eper), cles: l.map(e => e.cle), disciplines: l.map(e => e.discipline), date: new Date().toISOString() });
          rendre();
        }, deja ? 's p' : 's', { 'data-ped': 'examen-blanc' }));
      }
      zone.append(act);
      if (!l.length) { zone.append(h('p', { class: 'ped-vide' }, 'Aucune épreuve pour cette période.')); return; }
      zone.append(h('div', { class: 'ped-tw' }, h('table', { class: 'ped-t', 'data-ped': 'table-epreuves' },
        h('thead', {}, h('tr', {}, ['Ordre', 'Épreuve', 'Durée', 'Barème', 'Origine'].map(x => h('th', {}, x)))),
        h('tbody', {}, l.map(e => h('tr', { class: 'lien', tabindex: '0', onclick: () => ouvrirEpreuve(e), onkeydown: (ev) => { if (ev.key === 'Enter') ouvrirEpreuve(e); } },
          h('td', { class: 'n' }, e.ordre || ''), h('td', {}, h('b', {}, e.discipline), e._version ? h('span', { class: 'ped-badge ok' }, ' modifiée') : null), h('td', { class: 'n' }, e.duree || ''), h('td', { class: 'n' }, (e.total || e.total_bareme || e.bareme || 20) + ' pts'),
          h('td', {}, h('span', { class: 'ped-badge ' + (e.infre ? 'src' : 'ok') }, e.infre ? 'd’après INFRE' : 'conçue (APC)'))))))));
    }

    /* --- progressions annuelles --- */
    function vueProgressions(d) {
      const cols = COLS_PROG.filter(([k]) => d.progression.some(l => l[k]));
      const corps = () => '<h1>Progression annuelle — ' + esc(F.cours) + '</h1><table><thead><tr><th>Trimestre</th><th>Mois</th>' + cols.map(c => '<th>' + esc(c[1]) + '</th>').join('') + '</tr></thead><tbody>'
        + d.progression.map(l => '<tr><td>' + esc(l.trimestre || '') + '</td><td>' + esc(l.mois || '') + '</td>' + cols.map(([k]) => '<td>' + esc(l[k] || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
      zone.append(h('div', { class: 'ped-actions' }, btn('imprimer', 'Imprimer / PDF', () => imprimer(A, 'Progression annuelle — ' + F.cours, corps()), 's', { 'data-ped': 'imprimer-progression' })));
      zone.append(h('p', { class: 'ped-aide' }, 'Planification annuelle officielle du cours (unités, dossiers, SA et séquences par mois). Les fiches et résumés de chaque mois sont dans « Planification ».'));
      zone.append(h('div', { class: 'ped-tw' }, h('table', { class: 'ped-t', 'data-ped': 'table-progression' },
        h('thead', {}, h('tr', {}, ['Trim.', 'Mois'].concat(cols.map(c => c[1])).map(x => h('th', {}, x)))),
        h('tbody', {}, d.progression.map(l => h('tr', {}, h('td', {}, l.trimestre || ''), h('td', {}, lien({ onclick: () => { F.pmois = l.mois; F.pvue = 'mois'; sauverF(); onglet = 'planification'; memo.set('onglet', onglet); [...barreOnglets.children].forEach(b => { b.className = b.getAttribute('data-ped-onglet') === onglet ? 'on' : ''; }); rendre(); } }, l.mois || '')),
          cols.map(([k]) => h('td', {}, l[k] || ''))))))));
      zone.append(blocNotes('progression:' + F.cours));
    }

    /* --- programmes --- */
    function vueProgrammes(d) {
      const mats = uniq(d.programmes.map(p => p.matiere));
      zoneFiltres.append(sel('Matière', 'matiere', optMatieres(true, mats)));
      zoneFiltres.append(champRecherche());
      const liste = h('div', {}); zone.append(liste);
      rendreListe = () => {
        liste.innerHTML = '';
        const l = d.programmes.filter(p => (!F.matiere || p.matiere === F.matiere) && contient(p, ['titre', 'theme', 'domaine']));
        if (!l.length) { liste.append(h('p', { class: 'ped-vide' }, 'Aucun programme détaillé pour ces critères dans le corpus (voir les guides et la progression annuelle).')); return; }
        liste.append(h('div', { class: 'ped-tw' }, h('table', { class: 'ped-t', 'data-ped': 'table-programmes' },
          h('thead', {}, h('tr', {}, ['Matière', 'Type', 'N°', 'Titre', 'Durée / période'].map(x => h('th', {}, x)))),
          h('tbody', {}, l.map(p => h('tr', { class: 'lien', tabindex: '0', onclick: () => ouvrirProgramme(p), onkeydown: (e) => { if (e.key === 'Enter') ouvrirProgramme(p); } },
            h('td', {}, nomMat(ix, p.matiere)), h('td', {}, p.type === 'unite' ? 'Unité' : 'SA'), h('td', { class: 'n' }, (p.dossier ? 'D' + p.dossier + ' ' : '') + (p.num || '')),
            h('td', {}, h('b', {}, p.titre)), h('td', {}, [p.duree, p.periode].filter(Boolean).join(' · '))))))));
      };
      rendreListe();
    }

    /* --- guides --- */
    async function vueGuides(d) {
      let G;
      try { G = await fichier(A, ix.guides.fichier); } catch (e) { zone.append(h('p', { class: 'ped-vide' }, 'Guides indisponibles hors connexion sur cet appareil.')); return; }
      const duCours = G.filter(g => (g.cours || []).includes(F.cours));
      zoneFiltres.append(sel('Matière', 'matiere', optMatieres(true, uniq(duCours.map(g => g.matiere)))));
      zoneFiltres.append(champRecherche());
      const liste = h('div', {}); zone.append(liste);
      const ouvrir = (g) => dialogue(g.titre, h('div', {}, h('div', { class: 'ped-guide', html: nettoyer(g.html) }), h('p', { class: 'ped-aide' }, g.source || ''), blocNotes('guide:' + g.id)),
        [{ l: 'Fermer' }, { l: 'Imprimer / PDF', icone: 'imprimer', p: true, action: () => { imprimer(A, g.titre, '<h1>' + esc(g.titre) + '</h1>' + nettoyer(g.html) + '<p class="mention">' + esc(g.source || '') + '</p>'); } }]);
      rendreListe = () => {
        liste.innerHTML = '';
        const l = duCours.filter(g => (!F.matiere || g.matiere === F.matiere) && contient(g, ['titre', 'groupe']));
        if (!l.length) { liste.append(h('p', { class: 'ped-vide' }, 'Aucun guide pour ces critères.')); return; }
        const groupes = {}; l.forEach(g => { (groupes[g.groupe || 'Autres'] = groupes[g.groupe || 'Autres'] || []).push(g); });
        liste.append(h('div', { class: 'ped-grille' }, Object.entries(groupes).map(([gr, gs]) => h('div', { class: 'ped-carte' }, h('h3', {}, gr),
          h('ul', { class: 'ped-liste' }, gs.map(g => h('li', {}, lien({ 'data-ped': 'guide', onclick: () => ouvrir(g) }, g.titre))))))));
      };
      rendreListe();
    }

    /* --- planification jour / semaine / mois --- */
    function vuePlanification(d) {
      const moisDispo = MOIS.filter(m => d.plan[m]);
      const auj = new Date(), mCour = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][auj.getMonth()];
      if (!F.pmois || !moisDispo.includes(F.pmois)) F.pmois = moisDispo.includes(mCour) ? mCour : moisDispo[0];
      if (!F.psem) F.psem = String(Math.min(3, Math.floor((auj.getDate() - 1) / 7)) + 1);
      if (!F.pjour) F.pjour = String(Math.min(4, Math.max(0, auj.getDay() - 1)));
      if (!['jour', 'semaine', 'mois'].includes(F.pvue)) F.pvue = 'semaine';
      zoneFiltres.append(sel('Vue', 'pvue', [['jour', 'Journalière'], ['semaine', 'Hebdomadaire'], ['mois', 'Mensuelle']]));
      zoneFiltres.append(sel('Mois', 'pmois', moisDispo.map(m => [m, m])));
      if (F.pvue !== 'mois') zoneFiltres.append(sel('Semaine du mois', 'psem', [['1', 'Semaine 1'], ['2', 'Semaine 2'], ['3', 'Semaine 3'], ['4', 'Semaine 4']]));
      if (F.pvue === 'jour') zoneFiltres.append(sel('Jour', 'pjour', JOURS.map(([, l], i) => [String(i), l])));
      const M = d.plan[F.pmois]; if (!M) { zone.append(h('p', { class: 'ped-vide' }, 'Pas de planification pour ce mois.')); return; }
      const k = (+F.psem || 1) - 1;
      const W = (M.semaines || [])[k] || { fiches: {}, resumes: {} };
      const fichesDe = (ids) => (ids || []).map(i => E_('fiche', d._fiche[i])).filter(Boolean);
      const resumesDe = (ids) => (ids || []).map(i => E_('resume', d._resume[i])).filter(Boolean);
      const lienF = (f) => lien({ onclick: () => ouvrirFiche(f) }, f.titre);
      const lienR = (r) => lien({ onclick: () => ouvrirResume(r) }, r.titre);
      const cleNote = 'plan:' + F.cours + ':' + F.pmois + (F.pvue === 'mois' ? '' : ':S' + (k + 1));
      const classeur = (titre, fs, rs) => imprimer(A, titre, '<h1>' + esc(titre) + '</h1>' + notesHtml(cleNote)
        + (fs.length ? '<h2>Fiches de préparation (' + fs.length + ')</h2>' + fs.slice(0, MAX_LIVRET).map((f, i) => (i ? '<div class="saut"></div>' : '') + ficheHtml(f, ix)).join('') : '')
        + (rs.length ? '<div class="saut"></div><h2>Résumés (' + rs.length + ')</h2>' + rs.map((r, i) => (i ? '<div class="saut"></div>' : '') + resumeHtml(r, ix, false)).join('') : ''), { titulaire: titulaire() });

      if (F.pvue === 'jour') {
        const ji = +F.pjour || 0;
        const cr = journee(d, F.pmois, k, ji).map(c => (c.fiche ? Object.assign(c, { fiche: E_('fiche', c.fiche) }) : c));
        const fj = uniq(cr.map(c => c.fiche).filter(Boolean));
        const fjm = {}; fj.forEach(f => { (fjm[f.matiere] = fjm[f.matiere] || []).push(f); });
        const rj = uniq(Object.entries(W.resumes || {}).flatMap(([m, ids]) => fjm[m] ? resumesDe(ids) : []));
        const titre = `Planification journalière — ${F.cours} — ${JOURS[ji][1]}, semaine ${k + 1} de ${F.pmois}`;
        zone.append(h('div', { class: 'ped-actions' },
          btn('imprimer', 'Plan du jour (PDF)', () => imprimer(A, titre, '<h1>' + esc(titre) + '</h1><table><thead><tr><th>Horaire</th><th>Matière / activité</th><th>Durée</th><th>Fiche</th></tr></thead><tbody>'
            + cr.map(c => '<tr><td>' + esc(c.horaire) + '</td><td>' + esc(c.libelle) + '</td><td>' + esc(c.duree) + '</td><td>' + esc(c.fiche ? c.fiche.titre + ' (' + reperesFiche(c.fiche) + ')' : '') + '</td></tr>').join('') + '</tbody></table>' + notesHtml(cleNote)), 's', { 'data-ped': 'plan-jour' }),
          btn('classeur', 'Classeur du jour (fiches + résumés)', () => classeur('Classeur du jour — ' + F.cours + ' — ' + JOURS[ji][1] + ', semaine ' + (k + 1) + ' de ' + F.pmois, fj, rj), 's', { 'data-ped': 'classeur-jour' })));
        zone.append(h('p', { class: 'ped-aide' }, 'Emploi du temps officiel du cours ; les fiches de la semaine sont réparties dans l’ordre sur les créneaux de chaque matière.'));
        zone.append(h('div', { class: 'ped-tw' }, h('table', { class: 'ped-t', 'data-ped': 'table-jour' }, h('thead', {}, h('tr', {}, ['Horaire', 'Matière / activité', 'Durée', 'Fiche de préparation'].map(x => h('th', {}, x)))),
          h('tbody', {}, cr.map(c => h('tr', {}, h('td', { class: 'n' }, c.horaire), h('td', {}, c.libelle), h('td', { class: 'n' }, c.duree), h('td', {}, c.fiche ? [lienF(c.fiche), ' ', h('span', { class: 'ped-aide' }, reperesFiche(c.fiche))] : h('span', { class: 'ped-aide' }, '—'))))))));
        if (rj.length) zone.append(h('div', { class: 'ped-carte' }, h('h3', {}, 'Résumés des séances du jour'), h('ul', { class: 'ped-liste' }, rj.map(r => h('li', {}, lienR(r))))));
      } else if (F.pvue === 'semaine') {
        const toutes = ORDRE_MAT.flatMap(m => fichesDe((W.fiches || {})[m]));
        const tr = uniq(ORDRE_MAT.flatMap(m => resumesDe((W.resumes || {})[m])));
        zone.append(h('div', { class: 'ped-actions' },
          btn('classeur', `Classeur de la semaine (${toutes.length} fiches, ${tr.length} résumés)`, () => classeur(`Classeur de la semaine ${k + 1} — ${F.pmois} — ${F.cours}`, toutes, tr), 's p', { 'data-ped': 'classeur-semaine' }),
          btn('bloc-notes', 'Résumés de la semaine (PDF)', () => tr.length && imprimer(A, 'Résumés de la semaine', '<h1>Résumés — semaine ' + (k + 1) + ' de ' + esc(F.pmois) + ' — ' + esc(F.cours) + '</h1>' + tr.map((r, i) => (i ? '<div class="saut"></div>' : '') + resumeHtml(r, ix, false)).join('')), 's', { 'data-ped': 'resumes-semaine' })));
        const cartes = ORDRE_MAT.filter(m => (M.annuel || {})[m] || ((W.fiches || {})[m] || []).length).map(m => {
          const fs = fichesDe((W.fiches || {})[m]), rs = resumesDe((W.resumes || {})[m]);
          return h('div', { class: 'ped-carte', 'data-ped-mat': m }, h('h3', {}, nomMat(ix, m)), h('p', { class: 'ped-aide' }, 'Planification annuelle : ', (M.annuel || {})[m] || '—'),
            fs.length ? h('div', {}, h('h4', {}, `Fiches (${fs.length})`), h('ul', { class: 'ped-liste' }, fs.slice(0, 12).map(f => h('li', {}, lienF(f), ' ', h('span', { class: 'ped-aide' }, reperesFiche(f))))),
              fs.length > 12 ? h('p', { class: 'ped-aide' }, `… et ${fs.length - 12} autre(s) dans le classeur.`) : null) : h('p', { class: 'ped-vide' }, 'Pas de fiche rattachée cette semaine.'),
            rs.length ? h('div', {}, h('h4', {}, `Résumés (${rs.length})`), h('ul', { class: 'ped-liste' }, rs.map(r => h('li', {}, lienR(r))))) : null);
        });
        zone.append(h('div', { class: 'ped-grille' }, cartes));
      } else {
        const fsMois = uniq((M.semaines || []).flatMap(w => ORDRE_MAT.flatMap(m => (w.fiches || {})[m] || []))).map(i => E_('fiche', d._fiche[i])).filter(Boolean);
        const rsMois = uniq(ORDRE_MAT.flatMap(m => resumesDe((M.resumes || {})[m])).concat((M.semaines || []).flatMap(w => ORDRE_MAT.flatMap(m => resumesDe((w.resumes || {})[m])))));
        const ligne = d.progression.find(l => l.mois === F.pmois) || {};
        const cols = COLS_PROG.filter(([c]) => ligne[c]);
        zone.append(h('div', { class: 'ped-actions' },
          btn('imprimer', 'Planification du mois (PDF)', () => imprimer(A, 'Planification mensuelle — ' + F.pmois, '<h1>Planification mensuelle — ' + esc(F.cours) + ' — ' + esc(F.pmois) + (M.trimestre ? ' (trimestre ' + esc(M.trimestre) + ')' : '') + '</h1>'
            + '<table><tbody>' + cols.map(([c, l]) => '<tr><th style="width:28%">' + esc(l) + '</th><td>' + esc(ligne[c]) + '</td></tr>').join('') + '</tbody></table>'
            + (M.semaines || []).map((w, i) => '<h2>Semaine ' + (i + 1) + '</h2><table><tbody>' + ORDRE_MAT.filter(m => ((w.fiches || {})[m] || []).length).map(m => '<tr><th style="width:28%">' + esc(nomMat(ix, m)) + '</th><td>'
              + fichesDe(w.fiches[m]).slice(0, 8).map(f => esc(f.titre)).join(' ; ') + (w.fiches[m].length > 8 ? ' …' : '') + '</td></tr>').join('') + '</tbody></table>').join('') + notesHtml(cleNote)), 's', { 'data-ped': 'plan-mois' }),
          btn('classeur', `Classeur du mois (${fsMois.length} fiches${fsMois.length > MAX_LIVRET ? ', ' + MAX_LIVRET + ' premières' : ''})`, () => classeur(`Classeur du mois — ${F.pmois} — ${F.cours}`, fsMois, rsMois), 's', { 'data-ped': 'classeur-mois' })));
        zone.append(h('div', { class: 'ped-carte' }, h('h3', {}, `Planification annuelle — ${F.pmois}${M.trimestre ? ' (trimestre ' + M.trimestre + ')' : ''}`),
          h('dl', { class: 'ped-dl' }, cols.map(([c, l]) => [h('dt', {}, l), h('dd', {}, ligne[c])]))));
        zone.append(h('div', { class: 'ped-tw' }, h('table', { class: 'ped-t', 'data-ped': 'table-mois' }, h('thead', {}, h('tr', {}, ['Semaine'].concat(ORDRE_MAT.map(m => nomMat(ix, m))).map(x => h('th', {}, x)))),
          h('tbody', {}, (M.semaines || []).map((w, i) => h('tr', {}, h('td', { class: 'n' }, lien({ onclick: () => { F.pvue = 'semaine'; F.psem = String(i + 1); sauverF(); rendre(); } }, 'Semaine ' + (i + 1))),
            ORDRE_MAT.map(m => { const n = ((w.fiches || {})[m] || []).length; return h('td', {}, n ? n + ' fiche(s)' : '—'); })))))));
        if (rsMois.length) zone.append(h('div', { class: 'ped-carte' }, h('h3', {}, `Résumés du mois (${rsMois.length})`), h('ul', { class: 'ped-liste' }, rsMois.map(r => h('li', {}, lienR(r), ' ', h('span', { class: 'ped-aide' }, nomMat(ix, r.matiere)))))));
      }
      zone.append(h('div', { class: 'ped-carte' }, h('h3', {}, 'Notes de planification'), blocNotes(cleNote)));
    }

    await rendre();
  }

  /** Impression directe d'un jeu d'épreuves (examen blanc, évaluations) depuis un autre module */
  async function imprimerJeu(A, c, periode, corrige) {
    styles();
    const d = await cours(A, c);
    let notes = {}; try { notes = (A.notes && (await A.notes.charger())) || {}; } catch (e) { notes = {}; }
    const l = d.epreuves.concat(copiesDe(notes, 'epreuve', c)).map(e => eff(notes, 'epreuve', e)).filter(e => e.periode === periode).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    if (!l.length) return false;
    let mode = 'auto'; try { mode = (JSON.parse((A.memo ? A.memo.get('filtres') : localStorage.getItem('ped.filtres')) || '{}').mep) === '1' ? '1' : 'auto'; } catch (e) { mode = 'auto'; }
    imprimer(A, (corrige ? 'Corrigés — ' : 'Sujets — ') + l[0].periode_lib, miseEnPage(l.map(e => ({ html: corrige ? epreuveCorrigeHtml(e) : epreuveSujetHtml(e), nature: corrige ? 'corrige' : e.code })), mode), { epreuve: true });
    return true;
  }

  global.Pedagogie = { monter, imprimerJeu, index, cours, toutHorsLigne, journee, imprimerSimple: imprimerDefaut, _int: { ficheHtml, resumeHtml, epreuveSujetHtml, epreuveCorrigeHtml, nettoyer, miseEnPage, hauteurMm, eff } };
})(window);
