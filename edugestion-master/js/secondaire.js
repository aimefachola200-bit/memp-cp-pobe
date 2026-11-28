/* Pédagogie du secondaire (6e à Terminale) — fiches de préparation, épreuves APC avec corrigé, banque d'épreuves,
   bréviaires de langues vivantes, repères pédagogiques, textes officiels et acteurs de l'établissement.
   Contenus de GESCOL / Scolaris (outils/exporter_secondaire.py → data/secondaire/), chargés à la demande et gardés hors ligne.

   PÉRIMÈTRE D'ACCÈS (une seule application, chaque compte ne voit que son périmètre) :
     • administration, DDEMP, circonscription, conseiller pédagogique, directeur / chef d'établissement : tous les niveaux et toutes les matières ;
     • enseignant : uniquement les niveaux (6e … Tle) et les matières renseignés dans son compte (champs « Niveaux du secondaire »
       et « Matières du secondaire ») ; sans périmètre renseigné, aucun contenu n'est ouvert et l'écran explique quoi faire ;
     • parent, élève : module fermé.
   Le périmètre s'applique aux fiches, aux épreuves, à la banque et aux bréviaires ; les repères et les textes officiels sont ouverts à tous les comptes autorisés.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, U = EG.UI, E = EG.Ecrans;
  const el = U.el;
  const BASE = 'data/secondaire/';
  const NIVEAUX = ['6e', '5e', '4e', '3e', '2nde', '1ère', 'Tle'];
  const MATIERES = ['Français', 'Mathématiques', 'Anglais', 'Allemand', 'Espagnol', 'Physique-Chimie-Technologie', 'SVT', 'Histoire-Géographie', 'Philosophie',
    'Productions végétales', 'Productions animales', 'Pédologie et agronomie', 'Protection des cultures et santé animale', 'Machinisme et génie rural', 'Transformation et conservation des produits agricoles', 'Économie rurale et gestion d’exploitation', 'Travaux pratiques agricoles'];
  const TOUT_VOIR = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'CONSEILLER_PEDAGOGIQUE', 'DIRECTEUR'];

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sa = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const txt = (t) => esc(t).replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>').replace(/\n/g, '<br>');

  /* ---------------- périmètre ---------------- */
  /** « 6ème », « sixième », « seconde », « première », « terminale » … → code de niveau */
  function codeNiveau(t) {
    const s = sa(t).replace(/\./g, '');
    if (!s) return '';
    if (/term|^tle$/.test(s)) return 'Tle';
    if (/premiere|^1(ere|re|ere)?$/.test(s)) return '1ère';
    if (/seconde|^2(nde|de)?$/.test(s)) return '2nde';
    if (/sixieme/.test(s)) return '6e';
    if (/cinquieme/.test(s)) return '5e';
    if (/quatrieme/.test(s)) return '4e';
    if (/troisieme/.test(s)) return '3e';
    const m = s.match(/^([3-6])/);
    return m ? m[1] + 'e' : '';
  }
  const ALIAS_MATIERES = [
    [/production.*veget|culture|maraich|horticul/, 'Productions végétales'], [/production.*animal|elevage|aviculture|pisciculture|zootech/, 'Productions animales'],
    [/pedolog|agronom|^sol/, 'Pédologie et agronomie'], [/protection|phytosanit|sante animale|veterin/, 'Protection des cultures et santé animale'],
    [/machinisme|genie rural|topograph|irrigation/, 'Machinisme et génie rural'], [/transformation|conservation/, 'Transformation et conservation des produits agricoles'],
    [/economie rurale|gestion d.?exploitation|cooperative/, 'Économie rurale et gestion d’exploitation'], [/travaux pratiques agricoles|tp agricole|ferme/, 'Travaux pratiques agricoles'],
    [/fran[cç]ais|lettres|^fr$/, 'Français'], [/math/, 'Mathématiques'], [/angl|english/, 'Anglais'], [/allem/, 'Allemand'], [/espag/, 'Espagnol'],
    [/physique|chimie|pct|techno/, 'Physique-Chimie-Technologie'], [/svt|vie et de la terre|biolog|science/, 'SVT'],
    [/hist|geo|^hg$/, 'Histoire-Géographie'], [/philo/, 'Philosophie']
  ];
  function codeMatiere(t) {
    const s = sa(t);
    for (const [re, m] of ALIAS_MATIERES) if (re.test(s)) return m;
    return '';
  }
  const liste = (t) => String(t || '').split(/[;,\n/]+/).map(x => x.trim()).filter(Boolean);

  /** { tout, niveaux[], matieres[], motif } du compte connecté */
  function portee() {
    const u = (EG.session && EG.session.user) || {};
    if (TOUT_VOIR.indexOf(u.role) >= 0) return { tout: true, niveaux: NIVEAUX.slice(), matieres: MATIERES.slice(), motif: 'Votre fonction ouvre tous les niveaux et toutes les matières du secondaire.' };
    if (u.role !== 'ENSEIGNANT') return { tout: false, niveaux: [], matieres: [], motif: 'Ce module n’est pas ouvert à votre compte.' };
    const brut = (t) => liste(t);
    const toutes = (l) => l.some(x => /^(tous|toutes|\*)$/.test(sa(x)));
    const ln = brut(u.niveaux_sec), lm = brut(u.matieres_sec);
    const niveaux = toutes(ln) ? NIVEAUX.slice() : Array.from(new Set(ln.map(codeNiveau).filter(Boolean)));
    const matieres = toutes(lm) ? MATIERES.slice() : Array.from(new Set(lm.map(codeMatiere).filter(Boolean)));
    if (!niveaux.length || !matieres.length) {
      return { tout: false, niveaux, matieres, motif: 'Votre compte d’enseignant n’a pas encore de périmètre dans le secondaire : demandez au directeur ou à l’administrateur de renseigner « Niveaux du secondaire » et « Matières du secondaire » dans votre compte (Utilisateurs).' };
    }
    return { tout: false, niveaux, matieres, motif: 'Votre périmètre : ' + niveaux.join(', ') + ' — ' + matieres.join(', ') + '.' };
  }
  const dans = (p, niveau, matiere) => (!niveau || p.niveaux.indexOf(niveau) >= 0) && (!matiere || p.matieres.indexOf(matiere) >= 0);
  EG.PerimetreSec = { portee, codeNiveau, codeMatiere, NIVEAUX, MATIERES };

  /* ---------------- données ---------------- */
  const CACHE_MEM = {};
  let INDEX = null;
  function charger(nom) {
    if (!CACHE_MEM[nom]) {
      CACHE_MEM[nom] = fetch(BASE + nom + (INDEX ? '?v=' + INDEX.version : ''), { cache: 'default' })
        .then(r => { if (!r.ok) throw new Error(nom + ' ' + r.status); return r.json(); })
        .catch(e => { delete CACHE_MEM[nom]; throw e; });
    }
    return CACHE_MEM[nom];
  }
  const index = () => (INDEX ? Promise.resolve(INDEX) : fetch(BASE + 'index.json').then(r => r.json()).then(i => { INDEX = i; return i; }));

  /* ---------------- styles et gabarits ---------------- */
  let stylesPoses = false;
  function styles() {
    if (stylesPoses) return; stylesPoses = true;
    document.head.appendChild(el('style', { text: `
.sec-ong{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.sec-ong button{border:1px solid var(--bord,#D0D5DD);background:var(--carte,#fff);border-radius:18px;padding:6px 14px;cursor:pointer;font:inherit}
.sec-ong button[aria-selected=true]{background:#1F4E79;color:#fff;border-color:#1F4E79}
.sec-fil{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:8px 0}.sec-fil label{display:flex;flex-direction:column;font-size:12.5px;color:#667085;gap:2px}.sec-fil select,.sec-fil input{min-width:140px}
.sec-per{background:#EFF8FF;border:1px solid #B2DDFF;border-radius:8px;padding:8px 12px;font-size:13px;margin:8px 0}.sec-per.ko{background:#FFFAEB;border-color:#FEDF89}
.sec-liste{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:10px;margin:10px 0}
.sec-carte{border:1px solid var(--bord,#D0D5DD);border-radius:10px;padding:10px 12px;background:var(--carte,#fff);cursor:pointer}.sec-carte:hover{border-color:#1F4E79}
.sec-carte b{display:block}.sec-carte span{font-size:12.5px;color:#667085}
.sec-doc{border:1px solid var(--bord,#D0D5DD);border-radius:10px;padding:14px;background:var(--carte,#fff);margin-top:10px}
.sec-doc h2{margin:0 0 4px;font-size:18px}.sec-doc table{width:100%;border-collapse:collapse;margin:8px 0}.sec-doc th,.sec-doc td{border:1px solid #98A2B3;padding:6px 8px;vertical-align:top;text-align:left;font-size:13.5px}
.sec-doc th{background:#EAECF0}.sec-rep{color:#067647}.sec-act{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.sec-pre{white-space:pre-wrap;font-size:13.5px;line-height:1.5}.sec-vide{color:#667085;padding:14px 0}
` }));
  }
  const btn = (texte, fn, primaire) => el('button', { class: 'bouton' + (primaire ? '' : ' secondaire'), type: 'button', text: texte, onclick: fn });
  function select(libelle, options, valeur, fn) {
    const s = el('select', { 'aria-label': libelle }, options.map(([v, l]) => el('option', { value: v, text: l, selected: v === valeur })));
    s.addEventListener('change', () => fn(s.value));
    return el('label', { text: libelle }, [s]);
  }
  const imprimer = (titre, html) => EG.Sortie.imprimer(titre, '<div class="sec-doc-imp">' + html + '</div>', { paysage: false, enTete: false });

  /* ---------------- fiche de préparation ---------------- */
  /** Les lignes de réponses des apprenants vont dans « Résultats attendus », celles de l'enseignant dans « Activités ». */
  function repartir(texte) {
    const act = [], res = [];
    String(texte || '').split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(l => (/^(les )?(élèves?|apprenant(e)?s?|réponses?)\b/i.test(l) ? res : act).push(l));
    return [act.join('\n'), res.join('\n')];
  }
  function ficheHtml(f) {
    const phases = [['Mise en situation', f.mise_en_situation], ['Recherche et découverte', f.recherche], ['Trace écrite (je retiens)', f.trace], ['Application', f.application], ['Prolongement', f.prolongement]];
    const lignes = phases.map(([p, t]) => {
      const [a, r] = repartir(t);
      const act = p.indexOf('Trace') === 0 || p === 'Prolongement' ? (a || t) : a || t;
      return '<tr><th style="width:18%">' + esc(p) + '</th><td>' + txt(act) + '</td><td class="sec-rep">' + txt(r) + '</td></tr>';
    }).join('');
    return '<h2>Fiche de préparation — ' + esc(f.matiere) + ' · ' + esc(f.niveau) + '</h2><p><b>' + esc(f.titre) + '</b> · durée : ' + esc(f.duree) + '</p>'
      + '<p><b>Compétence :</b> ' + esc(f.competence) + '</p><p><b>Situation d’apprentissage :</b> ' + esc(f.situation) + '</p><p><b>Objectifs :</b> ' + esc(f.objectifs) + '</p>'
      + '<table><thead><tr><th>Phase</th><th>Activités d’enseignement-apprentissage</th><th>Résultats attendus (réponses des apprenants)</th></tr></thead><tbody>' + lignes + '</tbody></table>'
      + '<p style="font-size:12px;color:#667085">Fiche conçue selon l’APC — à valider par le chef de département ou le conseiller pédagogique.</p>';
  }

  /* ---------------- épreuve APC ---------------- */
  function epreuveHtml(e, corrige) {
    const lignes = e.items.map((it, i) => '<tr><td>' + (i + 1) + '</td><td>' + txt(it.consigne) + (corrige ? '<br><span class="sec-rep"><b>Corrigé :</b> ' + txt(it.correction) + '</span>' : '') + '</td><td style="text-align:center">' + it.points + '</td></tr>').join('');
    return '<h2>Épreuve de ' + esc(e.matiere) + ' — ' + esc(e.niveau) + (corrige ? ' (corrigé)' : '') + '</h2><p><b>Durée :</b> ' + esc(e.duree) + ' · <b>Barème :</b> 20 points (' + e.total + ' + 2 points de perfectionnement)</p>'
      + '<p><b>Compétence :</b> ' + esc(e.competence) + '</p><p><b>Situation :</b> ' + txt(e.situation) + '</p>' + (e.support ? '<p>' + txt(e.support) + '</p>' : '')
      + '<p><b>Tâche :</b> ' + esc(e.tache) + '</p><table><thead><tr><th style="width:6%">N°</th><th>Consigne</th><th style="width:10%">Points</th></tr></thead><tbody>' + lignes
      + '<tr><td></td><td>Perfectionnement : clarté, correction de la langue, propreté de la copie</td><td style="text-align:center">2</td></tr></tbody></table>';
  }

  /* ---------------- bréviaire de langue ---------------- */
  function langueHtml(langue, niveau, d, enseignant) {
    let n = 0;
    const sit = d.situations.map((s, i) => '<h3>Situation d’apprentissage ' + (i + 1) + ' : ' + esc(s.titre) + '</h3><p><i>' + esc(s.consigne) + '</i></p>'
      + s.exercices.map(x => { n++; return '<p>' + n + '. ' + esc(x.q) + (enseignant ? '<br><span class="sec-rep"><b>Corrigé :</b> ' + esc(x.r) + '</span>' : ' ______________________') + '</p>'; }).join('')).join('');
    const ev = '<h3>Évaluation (20 points)</h3>' + d.evaluation.map((x, j) => '<p>' + (j + 1) + '. ' + esc(x.q) + ' <b>(5 pts)</b>' + (enseignant ? '<br><span class="sec-rep"><b>Corrigé :</b> ' + esc(x.r) + '</span>' : '<br>______________________________________') + '</p>').join('');
    return '<h2>Bréviaire de ' + esc(langue.toLowerCase()) + ' — ' + esc(niveau) + '</h2><p><b>' + (enseignant ? 'Cahier de l’enseignant (avec corrigés)' : 'Cahier de l’élève') + '</b></p>'
      + (enseignant ? '' : '<p>Nom et prénoms : ____________________ Classe : ______ Date : __________</p>') + sit + ev;
  }

  /* ---------------- écran ---------------- */
  const ONGLETS = [['fiches', 'Fiches de préparation'], ['epreuves', 'Épreuves APC'], ['banque', 'Banque d’épreuves'], ['langues', 'Bréviaires de langues'], ['reperes', 'Repères pédagogiques'], ['officiels', 'Textes officiels et acteurs']];

  function monter(racine) {
    styles();
    const P = portee();
    racine.appendChild(E.entete('Pédagogie du secondaire', 'Fiches de préparation, épreuves avec corrigé, banque d’épreuves, bréviaires de langues et repères, de la 6e à la Terminale.'));
    racine.appendChild(el('div', { class: 'sec-per' + (P.niveaux.length && P.matieres.length ? '' : ' ko'), text: P.motif }));
    const zone = el('div'); racine.appendChild(zone);
    const aPerimetre = P.niveaux.length && P.matieres.length;
    const ongletsOuverts = ONGLETS.filter(([id]) => aPerimetre || id === 'reperes' || id === 'officiels');
    if (!ongletsOuverts.length || (!aPerimetre && !P.tout && EG.session.user.role !== 'ENSEIGNANT')) return;
    const F = { onglet: (ongletsOuverts[0] || [])[0], niveau: '', matiere: '', q: '', langue: 'Anglais', ln: '4e', corrige: false };
    const barre = el('div', { class: 'sec-ong', role: 'tablist' });
    racine.insertBefore(barre, zone);
    function dessinerBarre() {
      barre.innerHTML = '';
      ongletsOuverts.forEach(([id, l]) => {
        const b = el('button', { type: 'button', role: 'tab', 'aria-selected': id === F.onglet ? 'true' : 'false', text: l });
        b.addEventListener('click', () => { F.onglet = id; F.niveau = F.matiere = F.q = ''; dessiner(); });
        barre.appendChild(b);
      });
    }
    const filtres = (avecNiveau, avecMatiere, avecRecherche) => {
      const d = el('div', { class: 'sec-fil' });
      if (avecNiveau) d.appendChild(select('Niveau', [['', 'Tous mes niveaux']].concat(P.niveaux.map(n => [n, n])), F.niveau, v => { F.niveau = v; dessiner(); }));
      if (avecMatiere) d.appendChild(select('Matière', [['', 'Toutes mes matières']].concat(P.matieres.map(m => [m, m])), F.matiere, v => { F.matiere = v; dessiner(); }));
      if (avecRecherche) {
        const i = el('input', { type: 'search', placeholder: 'Rechercher…', value: F.q, 'aria-label': 'Recherche' });
        i.addEventListener('input', () => { F.q = i.value; clearTimeout(F._t); F._t = setTimeout(() => dessiner(i), 250); });
        d.appendChild(el('label', { text: 'Recherche' }, [i]));
      }
      return d;
    };
    const filtre = (l) => l.filter(x => dans(P, x.niveau, x.matiere) && (!F.niveau || x.niveau === F.niveau) && (!F.matiere || x.matiere === F.matiere)
      && (!F.q || sa([x.titre, x.matiere, x.niveau, x.discipline, x.texte, x.competence].join(' ')).indexOf(sa(F.q)) >= 0));
    function carte(titre, sous, fn) { const c = el('div', { class: 'sec-carte', tabindex: '0', role: 'button' }, [el('b', { text: titre }), el('span', { text: sous })]); c.addEventListener('click', fn); c.addEventListener('keydown', e => { if (e.key === 'Enter') fn(); }); return c; }
    function document_(titre, html, retour, extra) {
      zone.innerHTML = '';
      const doc = el('div', { class: 'sec-doc', html });
      zone.appendChild(el('div', { class: 'sec-act' }, [btn('← Retour', retour), btn('Imprimer / PDF', () => imprimer(titre, html), true)].concat(extra || [])));
      zone.appendChild(doc);
    }
    const attente = () => { zone.innerHTML = ''; zone.appendChild(el('p', { class: 'sec-vide', text: 'Chargement…' })); };
    const erreur = () => { zone.innerHTML = ''; zone.appendChild(U.vide('Contenu indisponible : connectez-vous une première fois pour le télécharger, il sera ensuite disponible hors ligne.')); };

    function dessiner(garderFocus) {
      dessinerBarre(); attente();
      index().then(() => ({ fiches, epreuves, banque, langues, reperes, officiels })[F.onglet]()).catch(erreur);
      void garderFocus;
    }
    function fiches() {
      return charger('fiches.json').then(l => {
        zone.innerHTML = ''; zone.appendChild(filtres(true, true, true));
        const v = filtre(l);
        zone.appendChild(v.length ? el('div', { class: 'sec-liste' }, v.map(f => carte(f.titre, f.matiere + ' · ' + f.niveau + ' · ' + f.duree, () => document_(f.titre, ficheHtml(f), () => dessiner())))) : el('p', { class: 'sec-vide', text: 'Aucune fiche dans votre périmètre pour ce filtre.' }));
      });
    }
    function epreuves() {
      return charger('epreuves.json').then(l => {
        zone.innerHTML = ''; zone.appendChild(filtres(true, true, true));
        const v = filtre(l);
        zone.appendChild(v.length ? el('div', { class: 'sec-liste' }, v.map(e => carte(e.matiere + ' — ' + e.niveau, e.duree + ' · ' + e.total + '/18 + 2 · ' + e.competence.slice(0, 70), () => voirEpreuve(e, false)))) : el('p', { class: 'sec-vide', text: 'Aucune épreuve dans votre périmètre pour ce filtre.' }));
      });
    }
    function voirEpreuve(e, corrige) {
      const bascule = btn(corrige ? 'Voir sans corrigé' : 'Voir le corrigé', () => voirEpreuve(e, !corrige));
      document_('Épreuve ' + e.matiere + ' ' + e.niveau, epreuveHtml(e, corrige), () => dessiner(), [bascule]);
    }
    function banque() {
      return charger('banque.json').then(l => {
        zone.innerHTML = ''; zone.appendChild(filtres(true, true, true));
        const v = filtre(l.map(b => Object.assign({}, b, { niveau: b.niveau === 'BEPC' ? '3e' : (b.niveau === 'BAC' ? 'Tle' : b.niveau) })).filter(b => NIVEAUX.indexOf(b.niveau) >= 0 || b.niveau === 'Classe à préciser'));
        const vv = v.length ? v : [];
        const tronque = vv.slice(0, 80);
        zone.appendChild(vv.length ? el('div', {}, [el('p', { class: 'sec-vide', text: vv.length + ' épreuve(s)' + (vv.length > tronque.length ? ' — les 80 premières sont affichées, affinez avec la recherche.' : '') }),
          el('div', { class: 'sec-liste' }, tronque.map(b => carte((b.matiere || '') + ' — ' + (b.type || ''), (b.niveau || '') + (b.serie ? ' · série ' + b.serie : '') + ' · ' + (b.origine || ''), () => {
            const h = '<h2>' + esc(b.matiere) + ' — ' + esc(b.type || '') + '</h2><p>' + esc([b.niveau, b.serie ? 'série ' + b.serie : '', b.periode, b.duree].filter(Boolean).join(' · ')) + '</p><div class="sec-pre">' + esc(b.texte) + '</div>';
            document_((b.matiere || '') + ' ' + (b.niveau || ''), h, () => dessiner());
          })))]) : el('p', { class: 'sec-vide', text: 'Aucune épreuve de la banque dans votre périmètre pour ce filtre.' }));
      });
    }
    function langues() {
      return charger('langues.json').then(d => {
        const dispo = Object.keys(d).filter(l => P.matieres.indexOf(l) >= 0);
        zone.innerHTML = '';
        if (!dispo.length) { zone.appendChild(el('p', { class: 'sec-vide', text: 'Aucune langue vivante dans votre périmètre de matières.' })); return; }
        if (dispo.indexOf(F.langue) < 0) F.langue = dispo[0];
        const nivs = Object.keys(d[F.langue]).filter(n => P.niveaux.indexOf(n) >= 0);
        if (!nivs.length) { zone.appendChild(el('div', { class: 'sec-fil' }, [select('Langue', dispo.map(x => [x, x]), F.langue, v => { F.langue = v; dessiner(); })])); zone.appendChild(el('p', { class: 'sec-vide', text: 'Aucun niveau de cette langue dans votre périmètre (bréviaires de la 4e à la Terminale).' })); return; }
        if (nivs.indexOf(F.ln) < 0) F.ln = nivs[0];
        const f = el('div', { class: 'sec-fil' }, [select('Langue', dispo.map(x => [x, x]), F.langue, v => { F.langue = v; dessiner(); }), select('Niveau', nivs.map(x => [x, x]), F.ln, v => { F.ln = v; dessiner(); }),
          select('Cahier', [['e', 'Cahier de l’élève'], ['p', 'Cahier de l’enseignant (corrigés)']], F.corrige ? 'p' : 'e', v => { F.corrige = v === 'p'; dessiner(); })]);
        zone.appendChild(f);
        const html = langueHtml(F.langue, F.ln, d[F.langue][F.ln], F.corrige);
        zone.appendChild(el('div', { class: 'sec-act' }, [btn('Imprimer / PDF', () => imprimer('Bréviaire ' + F.langue + ' ' + F.ln, html), true)]));
        zone.appendChild(el('div', { class: 'sec-doc', html }));
      });
    }
    function reperes() {
      return charger('reperes.json').then(r => {
        zone.innerHTML = '';
        const bloc = (titre, corps) => zone.appendChild(el('details', { class: 'sec-doc' }, [el('summary', { html: '<b>' + esc(titre) + '</b>' }), el('div', { html: corps })]));
        bloc('Les grands auteurs de l’éducation', '<table><tbody>' + r.auteurs.map(a => '<tr><th style="width:26%">' + esc(a.nom) + '</th><td>' + esc(a.idee) + '<br><i>En classe : ' + esc(a.pratique) + '</i></td></tr>').join('') + '</tbody></table>');
        bloc('L’art d’enseigner', '<table><tbody>' + r.art.map(a => '<tr><th style="width:22%">' + esc(a.titre) + '</th><td>' + esc(a.texte) + '</td></tr>').join('') + '</tbody></table>');
        bloc('Apprendre à lire au CP', '<table><tbody>' + r.lecture_cp.map(a => '<tr><th style="width:22%">' + esc(a.titre) + '</th><td>' + esc(a.texte) + '</td></tr>').join('') + '</tbody></table>');
        const lect = r.lectures.filter(l => !l.classes || String(l.classes).split(/[ ,;]+/).some(c => P.niveaux.indexOf(codeNiveau(c)) >= 0) || P.tout);
        bloc('Fiches de lecture du collège (' + lect.length + ')', lect.map(l => '<h3>' + esc(l.titre) + ' — ' + esc(l.auteur) + '</h3><p><i>' + esc(l.info) + ' · classes : ' + esc(l.classes) + '</i></p><p>' + esc(l.resume) + '</p><p><b>Thèmes :</b> ' + esc((l.themes || []).join(' ; ')) + '</p>').join(''));
        bloc('Poèmes à réciter et grille d’évaluation', r.poemes.map(p => '<h3>' + esc(p.titre) + ' <small>(' + esc(p.niveau) + ')</small></h3><p>' + p.vers.map(esc).join('<br>') + '</p><p><i>' + esc(p.theme) + '</i></p>').join('') + '<h3>Conseils</h3><ul>' + (r.poemes_conseils || []).map(c => '<li>' + esc(Array.isArray(c) ? c.join(' : ') : c) + '</li>').join('') + '</ul>');
      });
    }
    function officiels() {
      return charger('reperes.json').then(r => {
        zone.innerHTML = '';
        const bloc = (titre, corps) => zone.appendChild(el('details', { class: 'sec-doc', open: true }, [el('summary', { html: '<b>' + esc(titre) + '</b>' }), el('div', { html: corps })]));
        bloc('Acteurs de l’établissement et périmètres', '<table><tbody>' + r.acteurs.map(a => '<tr><th style="width:28%">' + esc(a.titre) + '</th><td>' + esc(a.role) + '</td></tr>').join('') + '</tbody></table>');
        bloc('Textes officiels (résumés)', r.textes_officiels.map(t => '<h3>' + esc(t.titre) + '</h3><p><i>' + esc(t.tutelle || '') + '</i></p><ul>' + (t.points || []).map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>').join(''));
        bloc('Cahier d’activités de Français CP : progression des 70 leçons', '<table><thead><tr><th>Leçon</th><th>Contenu</th><th>Page</th></tr></thead><tbody>' + r.cahier_cp.map(c => '<tr><td>' + c.n + '</td><td>' + esc(c.contenu) + '</td><td>' + c.page + '</td></tr>').join('') + '</tbody></table>');
      });
    }
    dessiner();
  }

  U.Routeur.definir('pedagogie-sec', function (racine) {
    if (!EG.peutVoirModule('pedagogie-sec')) { racine.appendChild(U.vide('Ce module n’est pas ouvert à votre compte.')); return; }
    monter(racine);
  });
})(window);
