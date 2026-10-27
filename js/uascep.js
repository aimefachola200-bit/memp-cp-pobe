/* République du Bénin — MEMP — Module « Bureaux UASCEP » (commun à CS Pobè, Mon école, MEMP-CP, DOSP, ÉduGestion)
   Membres et responsables des bureaux de l'UASCEP par école, unité pédagogique, zone pédagogique, circonscription
   scolaire et département (DDEMP) : \uE001 ajouter, \uE006 modifier, \uE005 supprimer, \uE058 réinitialiser (nouveau mandat, ancien bureau
   archivé), \uE058 renouvellement, synthèse, anciens bureaux, impression / PDF, Excel (export et import, mêmes colonnes dans
   toutes les applications — voir outils/uascep/spec.md).
   L'application hôte fournit un adaptateur : charger / enregistrer l'état, contexte (entités et droits), Excel, impression.
   Conception : Maître Aimé FACHE */
(function (global) {
  'use strict';
  if (global.UASCEP) return;

  const NIVEAUX = [['ECOLE', 'École'], ['UP', 'Unité pédagogique'], ['ZONE', 'Zone pédagogique'],
    ['CS', 'Circonscription scolaire'], ['DDEMP', 'Département (DDEMP)']];
  const LIB_NIVEAU = Object.fromEntries(NIVEAUX);
  const FONCTIONS = ['Président', 'Vice-président', 'Secrétaire général', 'Secrétaire général adjoint', 'Trésorier général',
    'Trésorier général adjoint', 'Rapporteur', 'Commissaire aux comptes', 'Responsable sport', 'Responsable culture', 'Responsable matériel',
    'Responsable santé / hygiène', 'Responsable genre', 'Conseiller', 'Membre'];
  const QUALITES = ['Directeur', 'Directrice', 'Enseignant', 'Enseignante', 'CP', 'CCS', "Parent d'élève", 'Élève', 'Autre'];
  const COLONNES_MEMBRES = ['Niveau', 'Entité', "N° d'ordre", 'Nom', 'Prénoms', 'Sexe', 'École', 'UP', 'Zone pédagogique',
    'Nom du RUP', 'Fonction', 'Qualité', 'Contact', 'E-mail', "Date d'élection", 'Durée du mandat (ans)',
    'Date de fin de mandat', 'Statut du mandat', "Date d'installation", 'Observations'];
  const COLONNES_BUREAUX = ['Niveau', 'Entité', "Date d'élection", 'Durée du mandat (ans)', 'Date de fin de mandat',
    "Date d'installation", "Date de l'assemblée générale", "Lieu de l'assemblée générale", 'PV', 'Observations', 'Statut'];
  const DUREE_DEFAUT = 2, PREAVIS_JOURS = 90;
  /* Cachets et signatures des responsables, documents signés avec code QR de vérification */
  const COULEURS_CACHET = { bleu: '#1E3A8A', rouge: '#B91C1C', vert: '#006633', noir: '#111827' };
  const LIB_COULEURS = [['bleu', 'Bleu'], ['rouge', 'Rouge'], ['vert', 'Vert'], ['noir', 'Noir']];
  const FORMES_CACHET = [['rond', 'Rond (généré)'], ['rect', 'Rectangulaire (généré)'], ['image', 'Image importée'], ['aucun', 'Aucun cachet']];
  const TYPES_DOC = { COMPOSITION: 'Composition du bureau', PV: "Procès-verbal d'élection et d'installation du bureau",
    ATTESTATION: 'Attestation de fonction', LISTE: 'Liste des bureaux UASCEP', RAPPORT: 'Rapport de fin de saison sportive',
    CR: 'Compte rendu de réunion', JOURNAL: 'Calendrier, résultats et journal des activités', ENGAGEMENTS: 'Fiches d’engagement des équipes',
    FINANCES: 'État financier et journal de caisse', INVENTAIRE: 'Inventaire du matériel sportif' };
  /* Vie du bureau, par saison (année scolaire) : activités, engagements, réunions, caisse, budget, matériel, rapport */
  const DISCIPLINES = ['Football', 'Handball', 'Volleyball', 'Basketball', 'Athlétisme', 'Pétanque', 'Tennis de table', 'Judo', 'Lutte traditionnelle',
    'Jeux traditionnels', 'Jeux de société (awalé, dames…)', 'Course en sac', 'Chant / chorale', 'Danse', 'Théâtre / sketch', 'Poésie / récitation', 'Dessin', 'Quiz / culture générale'];
  const CATEGORIES = ['Minimes', 'Cadets', 'Benjamins', 'Poussins', 'Toutes catégories'];
  const CAT_FIN = { Recette: ['Cotisations des écoles', 'Subventions', 'Dons et parrainages', 'Droits d’engagement', 'Recettes des manifestations', 'Report de la saison précédente', 'Divers'],
    Dépense: ['Transport', 'Restauration', 'Équipements et matériel', 'Arbitrage', 'Récompenses (coupes, médailles, prix)', 'Soins et secours', 'Communication', 'Fournitures', 'Organisation (sites, sonorisation)', 'Divers'] };
  const COLLECTIONS = ['activites', 'engagements', 'reunions', 'caisse', 'budget', 'materiel', 'rapports'];
  const DOC_COLL = { JOURNAL: ['activites'], ENGAGEMENTS: ['engagements'], FINANCES: ['caisse', 'budget'], INVENTAIRE: ['materiel'],
    CR: ['reunions'], RAPPORT: ['rapports', 'activites', 'engagements', 'caisse', 'budget', 'materiel', 'reunions'] };
  /** Saison en cours : année scolaire (septembre → août) */
  function saisonCourante() { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 8 ? y + '-' + (y + 1) : (y - 1) + '-' + y; }
  /** Autorité hiérarchique qui vise les pièces d'un bureau, selon son niveau */
  const VISA_DEFAUT = { ECOLE: "Le Directeur / La Directrice de l'école", UP: "Le Responsable de l'unité pédagogique",
    ZONE: 'Le Conseiller pédagogique', CS: 'Le Chef de la circonscription scolaire', DDEMP: 'Le Directeur départemental des EMP' };

  /* ---------------- utilitaires ---------------- */
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const uid = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(9).forEach(c => { if (c === null || c === undefined || c === false) return; e.append(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  /** « 2026-10-27 », « 27/10/2026 », nombre de série Excel → ISO, sinon '' */
  function iso(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' || /^\d{4,5}(\.\d+)?$/.test(String(v).trim())) {
      const n = Number(v); if (n > 20000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return d.toISOString().slice(0, 10); }
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return '';
  }
  const fr = (d) => { const s = iso(d); return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; };
  const auj = () => new Date().toISOString().slice(0, 10);
  function plusAns(d, n) {
    const s = iso(d); if (!s || !(+n > 0)) return '';
    const x = new Date(s + 'T12:00:00Z'); x.setUTCFullYear(x.getUTCFullYear() + Math.floor(+n)); x.setUTCDate(x.getUTCDate() - 1);
    const reste = (+n) - Math.floor(+n); if (reste) x.setUTCMonth(x.getUTCMonth() + Math.round(reste * 12));
    return x.toISOString().slice(0, 10);
  }
  /** Statut d'un mandat : [code, libellé] */
  function statutMandat(fin) {
    const f = iso(fin); if (!f) return ['nr', 'Date de fin non renseignée'];
    const j = (new Date(f) - new Date(auj())) / 86400000;
    if (j < 0) return ['expire', 'Expiré'];
    if (j <= PREAVIS_JOURS) return ['bientot', 'À renouveler'];
    return ['encours', 'En cours'];
  }
  const nomComplet = (m) => [String(m.nom || '').toUpperCase(), m.prenoms || ''].filter(Boolean).join(' ').trim();
  function niveauDe(v) {
    const n = norm(v); if (!n) return '';
    const direct = NIVEAUX.find(([c, l]) => norm(c) === n || norm(l) === n); if (direct) return direct[0];
    if (/^ecole|^epp|^em\b/.test(n)) return 'ECOLE';
    if (/unite|^up\b/.test(n)) return 'UP';
    if (/zone/.test(n)) return 'ZONE';
    if (/circonscription|^cs\b|commune/.test(n)) return 'CS';
    if (/ddemp|departement|direction/.test(n)) return 'DDEMP';
    return '';
  }

  /** Représentation canonique (clés triées) : base stable des empreintes des documents */
  function canon(o) {
    if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
    if (o && typeof o === 'object') return '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
    return JSON.stringify(o === undefined ? null : o);
  }
  /** Fonction reconnue dans le bureau : 'P' président, 'SG' secrétaire général, 'T' trésorier (adjoints exclus) */
  function roleDe(fonction) {
    const f = norm(fonction);
    if (/adjoint|vice/.test(f)) return '';
    if (/^president/.test(f)) return 'P';
    if (/^secretaire/.test(f)) return 'SG';
    if (/^tresorier/.test(f)) return 'T';
    if (/^rapporteur/.test(f)) return 'R';
    if (/^commissaire aux comptes/.test(f)) return 'CC';
    return '';
  }
  /** Contenu vérifiable d'un document (sans les images) : même calcul à l'édition et à la vérification */
  function contenuDocument(etat, type, bureauIds, membreId, opts) {
    const base = contenuBureaux(etat, type, bureauIds, membreId);
    opts = opts || {};
    if (!DOC_COLL[type]) return base;
    const ids = new Set(bureauIds || []), sans = (r) => { const o = Object.assign({}, r); delete o.maj; return o; };
    base.s = opts.saison || '';
    DOC_COLL[type].forEach(c => {
      let l = (etat[c] || []).filter(r => ids.has(r.bureauId) && (!opts.saison || r.saison === opts.saison));
      if (opts.ref && c === 'reunions') l = l.filter(r => r.id === opts.ref);
      base[c] = l.map(sans).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    });
    return base;
  }
  function contenuBureaux(etat, type, bureauIds, membreId) {
    const ordre = (x, y) => (+x.ordre || 0) - (+y.ordre || 0);
    const membre = (m, b) => ({ o: +m.ordre || 0, n: nomComplet(m), f: m.fonction || '', q: m.qualite || '', s: m.sexe || '', ec: m.ecole || '',
      de: iso(m.dateElection || b.dateElection), df: iso(m.dateFin || b.dateFin) });
    const bs = (bureauIds || []).map(id => (etat.bureaux || []).find(b => b.id === id)).filter(Boolean);
    const mb = membreId ? (etat.membres || []).find(m => m.id === membreId) : null;
    return { t: type, b: bs.map(b => ({ niv: b.niveau, e: b.entiteLib || '', de: iso(b.dateElection), du: b.duree || '', df: iso(b.dateFin), di: iso(b.dateInstallation),
      ag: iso(b.agDate), al: b.agLieu || '', pv: b.pv || '', m: (etat.membres || []).filter(m => m.bureauId === b.id).sort(ordre).map(m => membre(m, b)) })),
      m: mb ? membre(mb, bs[0] || {}) : null };
  }
  const decouperLignes = (t, max) => {
    const mots = String(t || '').split(/\s+/).filter(Boolean), l = []; let c = '';
    mots.forEach(w => { if (c && (c + ' ' + w).length > max) { l.push(c); c = w; } else c = c ? c + ' ' + w : w; }); if (c) l.push(c); return l;
  };
  /** Cachet généré en SVG : rond (UASCEP + niveau en haut, entité en bas, fonction au centre) ou rectangulaire */
  function cachetSvg(o) {
    o = o || {};
    const col = COULEURS_CACHET[o.couleur] || COULEURS_CACHET.bleu, taille = o.taille || 110, id = 'uc' + Math.random().toString(36).slice(2, 9);
    const haut = String(o.haut || 'UASCEP').toUpperCase(), bas = String(o.bas || '').toUpperCase(), centre = String(o.centre || '').toUpperCase(), nom = String(o.nom || '');
    const ff = 'font-family="Arial, Helvetica, sans-serif" fill="' + col + '"';
    if (o.forme === 'rect') {
      const W = 320, H = 150, fit = (t, fs, max) => (t.length * fs * 0.6 > max ? ' textLength="' + max + '" lengthAdjust="spacingAndGlyphs"' : '');
      const ligne = (t, y, fs, poids, ital) => t ? '<text x="160" y="' + y + '" font-size="' + fs + '" font-weight="' + poids + '"' + (ital ? ' font-style="italic"' : '') + ' text-anchor="middle" ' + ff + fit(t, fs, 286) + '>' + esc(t) + '</text>' : '';
      return '<svg class="uas-cachet rect" width="' + Math.round(taille * 2.1) + '" height="' + taille + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cachet — ' + esc(centre) + '">'
        + '<g fill="none" stroke="' + col + '" opacity="0.92"><rect x="4" y="4" width="312" height="142" rx="8" stroke-width="4"/><rect x="11" y="11" width="298" height="128" rx="4" stroke-width="1.3"/></g>'
        + '<g opacity="0.92">' + ligne('UASCEP', 38, 20, 800) + ligne(haut.replace(/^UASCEP\s*[—-]?\s*/, ''), 58, 11, 700) + ligne(bas, 80, 13, 800)
        + '<line x1="40" y1="90" x2="280" y2="90" stroke="' + col + '" stroke-width="1"/>' + ligne(centre, 110, 14, 700, true) + ligne(nom.toUpperCase(), 130, 12, 800) + '</g></svg>';
    }
    const T = 200, r = 100, fs = 14.5;
    const arcLong = (t, rayon) => { const dispo = Math.PI * rayon * 0.86; return t.length * fs * 0.66 > dispo ? ' textLength="' + Math.round(dispo) + '" lengthAdjust="spacingAndGlyphs"' : ''; };
    const rh = 68.5, rb = 79.5;
    const lignes = centre.indexOf('|') >= 0 ? centre.split('|').map(x => x.trim()).filter(Boolean) : decouperLignes(centre, 12).slice(0, 3);
    const fc = Math.min(15, 100 / Math.max(1, ...lignes.map(l => l.length * 0.62)), 50 / (lignes.length * 1.15));
    const y0 = r - (lignes.length - 1) * fc * 0.58 + fc * 0.36;
    const etoile = (x) => '<path transform="translate(' + x + ' ' + r + ') scale(0.62)" d="M0 -10 L2.9 -3.1 10.4 -3.1 4.3 1.5 6.7 8.8 0 4.4 -6.7 8.8 -4.3 1.5 -10.4 -3.1 -2.9 -3.1 Z" fill="' + col + '"/>';
    return '<svg class="uas-cachet rond" width="' + taille + '" height="' + taille + '" viewBox="0 0 ' + T + ' ' + T + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cachet — ' + esc(centre.replace(/\|/g, ' ')) + '">'
      + '<defs><path id="' + id + 'h" d="M ' + (r - rh) + ' ' + r + ' A ' + rh + ' ' + rh + ' 0 0 1 ' + (r + rh) + ' ' + r + '"/>'
      + '<path id="' + id + 'b" d="M ' + (r - rb) + ' ' + r + ' A ' + rb + ' ' + rb + ' 0 0 0 ' + (r + rb) + ' ' + r + '"/></defs>'
      + '<g fill="none" stroke="' + col + '" opacity="0.92"><circle cx="100" cy="100" r="97" stroke-width="3.2"/><circle cx="100" cy="100" r="92" stroke-width="1"/><circle cx="100" cy="100" r="56" stroke-width="1.4"/></g>'
      + '<g opacity="0.92" font-weight="700" ' + ff + '>'
      + '<text font-size="' + fs + '"><textPath href="#' + id + 'h" startOffset="50%" text-anchor="middle"' + arcLong(haut, rh) + '>' + esc(haut) + '</textPath></text>'
      + (bas ? '<text font-size="' + fs + '"><textPath href="#' + id + 'b" startOffset="50%" text-anchor="middle"' + arcLong(bas, rb) + '>' + esc(bas) + '</textPath></text>' : '')
      + etoile(r - 74) + etoile(r + 74)
      + lignes.map((l, k) => '<text x="100" y="' + (y0 + k * fc * 1.16).toFixed(1) + '" font-size="' + fc.toFixed(1) + '" text-anchor="middle">' + esc(l) + '</text>').join('')
      + '</g></svg>';
  }
  /** Logo UASCEP (dessin original) : anneau, « UASCEP » dans l'arc du haut, texte modifiable dans l'arc du bas
      (commune, zone, école…), coureur d'endurance sur une piste dans le cercle intérieur.
      logoSvg({ haut, bas, couleurs: { c1 (fond), c2 (filets, texte du bas), c3 (piste) }, taille }) → SVG */
  const LOGO_COULEURS = { c1: '#1F4E79', c2: '#E8B10E', c3: '#1B8A3C' };
  const DEFINITION = 'Union des associations sportives et culturelles des écoles primaires';
  /** Logo UASCEP (dessin original) : anneau, « UASCEP » dans l'arc du haut, sa définition dans un petit arc juste dessous
      (initiales en couleur c2), texte modifiable dans l'arc du bas (commune, zone, école…), coureur d'endurance sur une
      piste dans le cercle intérieur. logoSvg({ haut, definition, bas, couleurs: { c1, c2, c3 }, taille }) → SVG */
  function logoSvg(o) {
    o = o || {};
    const c = Object.assign({}, LOGO_COULEURS, o.couleurs || {}, ['c1', 'c2', 'c3'].reduce((x, k) => { if (o[k]) x[k] = o[k]; return x; }, {}));
    ['c1', 'c2', 'c3'].forEach(k => { if (!/^#[0-9a-f]{3,8}$/i.test(c[k] || '')) c[k] = LOGO_COULEURS[k]; });
    const haut = String(o.haut || 'UASCEP').toUpperCase(), bas = String(o.bas == null ? '' : o.bas).toUpperCase(), t = o.taille || 400;
    const def = String(o.definition == null ? DEFINITION : o.definition).trim();
    const ajuste = (txt, fs, ls, dispo) => (txt.length * (fs * 0.64 + ls) > dispo ? ' textLength="' + dispo + '" lengthAdjust="spacingAndGlyphs"' : '');
    const PETITS = /^(des|de|du|et|la|le|les|d['’]?|l['’]?|aux?|en)$/i;
    const defSvg = def.split(/\s+/).filter(Boolean).map(m => PETITS.test(m) ? esc(m.toUpperCase()) : '<tspan fill="' + c.c2 + '" font-weight="900">' + esc(m.charAt(0).toUpperCase()) + '</tspan>' + esc(m.slice(1).toUpperCase())).join(' ');
    const fb = Math.max(20, Math.min(30, Math.floor((420 / Math.max(1, bas.length) - 3) / 0.64)));
    return '<svg xmlns="http://www.w3.org/2000/svg" class="uas-logo" viewBox="0 0 400 400" width="' + t + '" height="' + t + '" role="img" aria-label="Logo UASCEP — ' + esc(bas) + '">'
      + '<defs><path id="uasLH" d="M 50 200 A 150 150 0 0 1 350 200"/><path id="uasLD" d="M 85.4 241.7 A 122 122 0 1 1 314.6 241.7"/><path id="uasLB" d="M 40 200 A 160 160 0 0 0 360 200"/></defs>'
      + '<circle cx="200" cy="200" r="196" fill="' + c.c1 + '"/><circle cx="200" cy="200" r="186" fill="none" stroke="' + c.c2 + '" stroke-width="4"/>'
      + '<circle cx="200" cy="200" r="100" fill="#fff" stroke="' + c.c2 + '" stroke-width="6"/>'
      + '<text font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="52" letter-spacing="8" fill="#fff" text-anchor="middle"><textPath href="#uasLH" startOffset="50%"' + ajuste(haut, 52, 8, 400) + '>' + esc(haut) + '</textPath></text>'
      + (def ? '<text font-family="Arial, sans-serif" font-weight="700" font-size="10.6" letter-spacing="0.3" fill="#fff" text-anchor="middle"><textPath href="#uasLD" startOffset="50%"' + (def.length > 70 ? ' textLength="560" lengthAdjust="spacingAndGlyphs"' : '') + '>' + defSvg + '</textPath></text>' : '')
      + (bas ? '<text font-family="Arial, sans-serif" font-weight="700" font-size="' + fb + '" letter-spacing="3" fill="' + c.c2 + '" text-anchor="middle"><textPath href="#uasLB" startOffset="50%"' + ajuste(bas, fb, 3, 430) + '>' + esc(bas) + '</textPath></text>' : '')
      + '<circle cx="38" cy="200" r="7" fill="' + c.c2 + '"/><circle cx="362" cy="200" r="7" fill="' + c.c2 + '"/>'
      + '<g transform="translate(200 200) scale(0.86) translate(-200 -196)">'
      + '<path d="M 118 262 Q 200 238 284 262" fill="none" stroke="' + c.c3 + '" stroke-width="7" stroke-linecap="round"/>'
      + '<path d="M 128 276 Q 200 256 274 276" fill="none" stroke="' + c.c3 + '" stroke-width="4" stroke-linecap="round" opacity=".6"/>'
      + '<g fill="none" stroke="' + c.c1 + '" stroke-linecap="round" stroke-linejoin="round"><circle cx="214" cy="118" r="15" fill="' + c.c1 + '" stroke="none"/>'
      + '<path d="M 206 140 L 190 196" stroke-width="20"/><path d="M 204 148 L 228 168 L 248 156" stroke-width="11"/><path d="M 200 150 L 178 166 L 162 154" stroke-width="11"/>'
      + '<path d="M 190 196 L 218 214 L 214 248" stroke-width="13"/><path d="M 190 196 L 170 226 L 140 230" stroke-width="13"/><path d="M 214 248 L 230 250" stroke-width="8"/></g>'
      + '<path d="M 150 140 L 130 140 M 146 160 L 120 160 M 150 180 L 132 180" stroke="' + c.c2 + '" stroke-width="5" stroke-linecap="round"/></g></svg>';
  }
  /** Texte du bas proposé pour une entité : « EPP … », « UP … », « ZONE PÉDAGOGIQUE 1 », « COMMUNE DE POBÈ », « DDEMP … » */
  function texteLogo(niveau, lib) {
    const l = String(lib || '').trim();
    if (niveau === 'CS') return 'COMMUNE DE ' + l.replace(/^circonscription( scolaire)?( de| d’| d')?\s*/i, '').replace(/^cs\s+(de\s+)?/i, '').toUpperCase();
    if (niveau === 'ZONE') { const m = /^zone\s*(p[ée]dagogique)?\s*n?°?\s*(\d+)\s*$/i.exec(l); return m ? 'ZONE PÉDAGOGIQUE ' + m[2] : l.toUpperCase(); }
    if (niveau === 'UP') return (/^up\b|unit/i.test(l) ? l : 'UP ' + l).toUpperCase();
    return l.toUpperCase();
  }
  /** Logo d'un bureau : image importée, sinon logo généré avec ses réglages */
  function logoBureau(b, taille) {
    const g = (b && b.logo) || {};
    if (g.image) return '<img class="uas-logo" src="' + g.image + '" alt="Logo UASCEP" width="' + (taille || 120) + '" height="' + (taille || 120) + '" style="object-fit:contain">';
    return logoSvg({ haut: g.haut || 'UASCEP', definition: g.definition, bas: g.bas != null && g.bas !== '' ? g.bas : texteLogo(b && b.niveau, b && b.entiteLib), couleurs: { c1: g.c1, c2: g.c2, c3: g.c3 }, taille: taille || 120 });
  }
  /** Image choisie par l'utilisateur, réduite (PNG) : cachet scanné, signature numérisée */
  function lireImage(fichier, maxL, maxH) {
    return new Promise((resolve, reject) => {
      if (!fichier || !/^image\//.test(fichier.type || '')) { reject(new Error('Choisissez une image (PNG, JPEG…).')); return; }
      const lec = new FileReader();
      lec.onerror = () => reject(new Error('Image illisible.'));
      lec.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image illisible.'));
        img.onload = () => {
          const k = Math.min(1, maxL / img.width, maxH / img.height), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/png'));
        };
        img.src = lec.result;
      };
      lec.readAsDataURL(fichier);
    });
  }
  function choisirFichier(accept) {
    return new Promise(resolve => {
      const inp = h('input', { type: 'file', accept, style: 'display:none' }); document.body.append(inp);
      inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); resolve(f || null); });
      inp.click();
    });
  }
  /** Zone de signature (doigt, stylet, souris) ; l'image rendue est recadrée sur le tracé et réduite */
  function padSignature(actuelle) {
    const L = 600, H = 220, cv = h('canvas', { width: L, height: H, class: 'uas-pad', 'aria-label': 'Zone de signature' });
    const g = cv.getContext('2d'); g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0a2a6b'; g.fillStyle = '#0a2a6b';
    let trace = false, vide = !actuelle, dernier = null;
    if (actuelle) { const i = new Image(); i.onload = () => { const k = Math.min(L / i.width, H / i.height); g.drawImage(i, (L - i.width * k) / 2, (H - i.height * k) / 2, i.width * k, i.height * k); }; i.src = actuelle; }
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * L / r.width, y: (e.clientY - r.top) * H / r.height }; };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); trace = true; vide = false; dernier = pos(e); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* facultatif */ }
      g.beginPath(); g.arc(dernier.x, dernier.y, 1.4, 0, 7); g.fill(); });
    cv.addEventListener('pointermove', (e) => { if (!trace) return; e.preventDefault(); const p = pos(e); g.beginPath(); g.moveTo(dernier.x, dernier.y); g.lineTo(p.x, p.y); g.stroke(); dernier = p; });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => cv.addEventListener(t, () => { trace = false; }));
    return {
      el: cv, get vide() { return vide; },
      effacer() { g.clearRect(0, 0, L, H); vide = true; },
      image() {
        if (vide) return '';
        const d = g.getImageData(0, 0, L, H).data; let x0 = L, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) if (d[(y * L + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) return '';
        x0 = Math.max(0, x0 - 6); y0 = Math.max(0, y0 - 6); x1 = Math.min(L - 1, x1 + 6); y1 = Math.min(H - 1, y1 + 6);
        const w = x1 - x0 + 1, hh = y1 - y0 + 1, k = Math.min(1, 400 / w, 150 / hh), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hh * k));
        c.getContext('2d').drawImage(cv, x0, y0, w, hh, 0, 0, c.width, c.height); return c.toDataURL('image/png');
      }
    };
  }

  /* ---------------- styles (préfixe uas-) ---------------- */
  function styles() {
    if (document.getElementById('uas-styles')) return;
    document.head.append(h('style', { id: 'uas-styles', text: `
      .uas,.uas-voile{--uas-bleu:#1F4E79;--uas-bord:#D0D5DD;--uas-gris:#667085}.uas{color:inherit}
      .uas h2.uas-titre{margin:0 0 4px;font-size:1.25rem}.uas .uas-sous{color:var(--uas-gris);margin:0 0 12px;font-size:.92rem}
      .uas-onglets{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}
      .uas-onglet{border:1px solid var(--uas-bord);background:#fff;border-radius:999px;padding:7px 13px;cursor:pointer;font:inherit;font-size:.9rem}
      .uas-onglet.on{background:var(--uas-bleu);border-color:var(--uas-bleu);color:#fff;font-weight:600}
      .uas-barre{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin:6px 0 10px}
      .uas-barre label{display:flex;flex-direction:column;gap:3px;font-size:.78rem;color:var(--uas-gris);font-weight:600;min-width:150px;flex:1 1 170px;max-width:320px}
      .uas-barre select,.uas-form input,.uas-form select,.uas-form textarea{font:inherit;padding:7px 9px;border:1px solid var(--uas-bord);border-radius:7px;background:#fff;width:100%;box-sizing:border-box}
      .uas-btn{border:1px solid var(--uas-bord);background:#fff;border-radius:7px;padding:7px 12px;cursor:pointer;font:inherit;font-size:.88rem;white-space:nowrap;color:inherit}
      .uas-btn:hover{border-color:var(--uas-bleu)}.uas-btn.p{background:var(--uas-bleu);border-color:var(--uas-bleu);color:#fff}
      .uas-btn.d{color:#B42318;border-color:#FDA29B}.uas-btn.s{padding:4px 8px;font-size:.8rem}
      .uas-btn:disabled{opacity:.45;cursor:not-allowed}
      .uas-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
      .uas-carte{background:#fff;border:1px solid var(--uas-bord);border-radius:10px;padding:12px 14px;margin:0 0 12px}
      .uas-carte h3{margin:0 0 6px;font-size:1rem}.uas-info{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:.88rem}
      .uas-info b{font-weight:600}.uas-vide{color:var(--uas-gris);font-style:italic;padding:10px 0}
      .uas-tw{overflow:auto;max-height:70vh;border:1px solid var(--uas-bord);border-radius:10px;background:#fff}.uas-t thead th{position:sticky;top:0;z-index:1}
      .uas-t{border-collapse:collapse;width:100%;font-size:.86rem}
      .uas-t th{background:#F9FAFB;color:#475467;text-align:left;padding:7px 8px;border-bottom:1px solid var(--uas-bord);white-space:nowrap;font-size:.76rem;text-transform:uppercase;letter-spacing:.02em}
      .uas-t td{padding:6px 8px;border-bottom:1px solid #EAECF0;vertical-align:top}
      .uas-t td.c{text-align:center}.uas-t tr.tot td{font-weight:700;background:#F2F4F7}
      .uas-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.74rem;font-weight:600;white-space:nowrap}
      .uas-badge.encours{background:#ECFDF3;color:#067647}.uas-badge.bientot{background:#FFFAEB;color:#B54708}
      .uas-badge.expire{background:#FEF3F2;color:#B42318}.uas-badge.nr{background:#F2F4F7;color:#475467}
      .uas-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}
      .uas-voile{position:fixed;inset:0;background:rgba(16,24,40,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:4vh 10px;overflow:auto}
      .uas-dialogue{background:#fff;border-radius:12px;width:min(760px,100%);box-shadow:0 12px 40px rgba(0,0,0,.3);color:#1D2939}
      .uas-dialogue>header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--uas-bord);background:var(--uas-bleu);color:#fff;border-radius:12px 12px 0 0}
      .uas-dialogue>header h3{margin:0;font-size:1.02rem}.uas-dialogue>header button{background:none;border:0;color:#fff;font-size:1.3rem;cursor:pointer}
      .uas-dialogue .uas-corps{padding:14px 16px}.uas-dialogue footer{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:10px 16px;border-top:1px solid var(--uas-bord)}.uas-dialogue footer .uas-btn{white-space:normal}
      .uas-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:10px 14px}
      .uas-form label{display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:600;color:#344054}
      .uas-form label.large{grid-column:1/-1}.uas-aide{font-size:.78rem;color:var(--uas-gris);font-weight:400}
      .uas-rapport{max-height:240px;overflow:auto;font-size:.85rem;background:#F9FAFB;border:1px solid var(--uas-bord);border-radius:8px;padding:8px}
      .uas-apercu{border:1px solid var(--uas-bord);padding:14px;background:#fff;overflow-x:auto}
      .uas-sc{grid-column:1/-1;border:1px dashed var(--uas-bord);border-radius:10px;padding:10px 12px;background:#FCFCFD}
      .uas-sc h4{margin:0 0 8px;font-size:.9rem;color:var(--uas-bleu)}
      .uas-sc-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
      .uas-ap{display:flex;align-items:center;justify-content:center;min-height:120px;border:1px solid #EAECF0;border-radius:8px;background:#fff;padding:6px;overflow:hidden}
      .uas-ap img{max-width:100%;max-height:120px}.uas-ap svg{max-width:100%;height:auto;max-height:120px}
      .uas-ap .uas-aide{font-style:italic}
      .uas-pad{display:block;width:100%;max-width:600px;aspect-ratio:600/220;height:auto;border:1px dashed #98A2B3;border-radius:8px;background:#fff;touch-action:none;cursor:crosshair}
      .uas-docs{display:grid;gap:8px}.uas-docs .uas-btn{text-align:left;white-space:normal}
      #uas-impression{display:none}
      @media print{.uas-voile{display:none!important}body.uas-imprime>*:not(#uas-impression){display:none!important}body.uas-imprime #uas-impression{display:block!important}}
    ` }));
  }

  /* ---------------- boîte de dialogue ---------------- */
  function dialogue(titre, corps, boutons) {
    return new Promise(resolve => {
      let fini = false;
      const fermer = (v) => { if (fini) return; fini = true; voile.remove(); window.removeEventListener('keydown', echap); resolve(v); };
      const echap = (e) => { if (e.key === 'Escape') { const v = document.querySelectorAll('.uas-voile'); if (v[v.length - 1] === voile) fermer(null); } };
      const pied = h('footer', {}, (boutons || [{ l: 'Fermer' }]).map(b => h('button', {
        class: 'uas-btn' + (b.p ? ' p' : '') + (b.d ? ' d' : ''), type: 'button',
        onclick: async () => { if (b.action) { const r = await b.action(); if (r === false) return; fermer(r === undefined ? true : r); } else fermer(b.v === undefined ? null : b.v); }
      }, b.l)));
      const voile = h('div', { class: 'uas-voile', onclick: (e) => { if (e.target === voile) fermer(null); } },
        h('div', { class: 'uas-dialogue', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre },
          h('header', {}, h('h3', {}, titre), h('button', { type: 'button', 'aria-label': 'Fermer', onclick: () => fermer(null) }, '✕')),
          h('div', { class: 'uas-corps' }, corps), pied));
      document.body.append(voile); window.addEventListener('keydown', echap);
      const premier = voile.querySelector('input,select,textarea'); if (premier && !('ontouchstart' in window)) setTimeout(() => premier.focus(), 30);
    });
  }
  /** Impression par défaut (application sans aide à l'impression) : aperçu, puis impression du seul document. */
  async function imprimerDefaut(titre, html) {
    if (typeof html === 'function') html = await html();
    const doc = h('div', { class: 'uas-apercu', html });
    dialogue(titre, doc, [{ l: 'Fermer' }, { l: '\uE008 Imprimer / PDF', p: true, action: () => {
      let zone = document.getElementById('uas-impression');
      if (!zone) { zone = h('div', { id: 'uas-impression' }); document.body.append(zone); }
      zone.innerHTML = html; document.body.classList.add('uas-imprime');
      const fin = () => { document.body.classList.remove('uas-imprime'); zone.innerHTML = ''; window.removeEventListener('afterprint', fin); };
      window.addEventListener('afterprint', fin); setTimeout(() => { window.print(); setTimeout(fin, 1500); }, 50);
      return false;
    } }]);
  }
  const confirmer = (titre, texte, libelle = 'Confirmer', danger = true) => dialogue(titre, h('p', {}, texte), [{ l: 'Annuler', v: false }, { l: libelle, d: danger, p: !danger, v: true }]);

  /* ---------------- conversion Excel (mêmes colonnes partout) ---------------- */
  function versLignes(etat, bureaux) {
    const parId = Object.fromEntries(etat.bureaux.map(b => [b.id, b]));
    const ids = new Set((bureaux || etat.bureaux.filter(b => b.statut !== 'archive')).map(b => b.id));
    const membres = etat.membres.filter(m => ids.has(m.bureauId)).sort((a, b) =>
      (NIVEAUX.findIndex(n => n[0] === parId[a.bureauId].niveau) - NIVEAUX.findIndex(n => n[0] === parId[b.bureauId].niveau))
      || String(parId[a.bureauId].entiteLib).localeCompare(String(parId[b.bureauId].entiteLib), 'fr') || (+a.ordre || 0) - (+b.ordre || 0));
    const lm = [COLONNES_MEMBRES].concat(membres.map(m => {
      const b = parId[m.bureauId], fin = m.dateFin || b.dateFin;
      return [LIB_NIVEAU[b.niveau], b.entiteLib, +m.ordre || '', String(m.nom || '').toUpperCase(), m.prenoms || '', m.sexe || '',
        m.ecole || '', m.up || '', m.zone || '', m.rup || '', m.fonction || '', m.qualite || '', m.contact || '', m.email || '',
        fr(m.dateElection || b.dateElection), m.duree || b.duree || '', fr(fin), statutMandat(fin)[1], fr(m.dateInstallation || b.dateInstallation), m.observations || ''];
    }));
    const lb = [COLONNES_BUREAUX].concat([...ids].map(id => parId[id]).map(b => [LIB_NIVEAU[b.niveau], b.entiteLib, fr(b.dateElection),
      b.duree || '', fr(b.dateFin), fr(b.dateInstallation), fr(b.agDate), b.agLieu || '', b.pv || '', b.observations || '', b.statut === 'archive' ? 'Archivé' : 'Actif']));
    return [{ nom: 'Membres UASCEP', lignes: lm, entete: 0 }, { nom: 'Bureaux', lignes: lb, entete: 0 }];
  }
  /** Lignes d'une feuille → objets selon l'en-tête (colonnes reconnues sans accents ni casse) */
  function objets(lignes) {
    const i0 = lignes.findIndex(l => (l || []).some(c => norm(c) === 'niveau') && (l || []).some(c => ['nom', 'entite'].includes(norm(c))));
    if (i0 < 0) return null;
    const tete = lignes[i0].map(norm);
    return lignes.slice(i0 + 1).map((l, k) => ({ _ligne: i0 + k + 2, ...Object.fromEntries(tete.map((t, j) => [t, l ? (l[j] == null ? '' : String(l[j]).trim()) : ''])) }))
      .filter(o => Object.keys(o).some(k => k !== '_ligne' && o[k] !== ''));
  }

  /* ---------------- montage ---------------- */
  async function monter(racine, A) {
    styles();
    const vide = { version: 1, bureaux: [], membres: [], fonctions: [] };
    let etat = Object.assign({}, vide, (await A.charger()) || {});
    ['bureaux', 'membres', 'fonctions'].concat(COLLECTIONS).forEach(k => { if (!Array.isArray(etat[k])) etat[k] = []; });
    if (A.migrer) { const e2 = await A.migrer(etat); if (e2) etat = e2; }
    let ctx = await A.contexte();
    const niveaux = NIVEAUX.filter(n => (ctx.niveaux || NIVEAUX.map(x => x[0])).includes(n[0]));
    const memo = A.memo || { get: () => null, set: () => {} };
    let onglet = memo.get('onglet') || (niveaux[0] || ['SYNTHESE'])[0];
    if (!niveaux.some(n => n[0] === onglet) && onglet !== 'SYNTHESE' && onglet !== 'ARCHIVES') onglet = (niveaux[0] || ['SYNTHESE'])[0];
    const filtres = { zone: memo.get('zone') || '', up: memo.get('up') || '', entite: {} };
    const sauver = async () => { etat.maj = new Date().toISOString(); await A.enregistrer(etat); };
    const toast = (m) => (A.toast ? A.toast(m) : null);
    const entites = (niv) => (ctx.entites[niv] || []);
    const entite = (niv, cle) => entites(niv).find(e => String(e.cle) === String(cle));
    const peut = (niv, cle) => !!(ctx.droits && ctx.droits.ecrire && ctx.droits.ecrire(niv, cle));
    const bureauActif = (niv, cle) => etat.bureaux.find(b => b.niveau === niv && String(b.entite) === String(cle) && b.statut !== 'archive');
    const membresDe = (b) => b ? etat.membres.filter(m => m.bureauId === b.id).sort((x, y) => (+x.ordre || 0) - (+y.ordre || 0)) : [];
    function assurerBureau(niv, cle) {
      let b = bureauActif(niv, cle);
      if (!b) {
        const e = entite(niv, cle) || { lib: cle };
        b = { id: uid(), niveau: niv, entite: String(cle), entiteLib: e.lib, dateElection: '', duree: DUREE_DEFAUT, dateFin: '', dateInstallation: '', agDate: '', agLieu: '', pv: '', observations: '', statut: 'actif', creeLe: auj() };
        etat.bureaux.push(b);
      }
      return b;
    }
    const fonctions = () => [...new Set(FONCTIONS.concat(etat.fonctions || [], etat.membres.map(m => m.fonction).filter(Boolean)))];

    /* ---------- cachets, signatures, visas ---------- */
    /** Mentions du cachet d'un responsable : « UASCEP — niveau » en haut, l'entité en bas, la fonction au centre */
    function mentionsCachet(b, fonction, nom) {
      return { haut: 'UASCEP — ' + String(LIB_NIVEAU[b.niveau] || '').replace(/ \(DDEMP\)/, ''), bas: b.entiteLib || '', centre: fonction || 'MEMBRE', nom: nom || '' };
    }
    /** Cachet généré avec l'outil de l'application quand elle en a un (même dessin que ses autres pièces), sinon celui du module */
    function dessinCachet(o) {
      let r = null;
      if (A.cachet) { try { r = A.cachet(o); } catch (e) { r = null; } }
      return r || cachetSvg(o);
    }
    function cachetDe(porteur, b, fonction, nom, taille) {
      const type = porteur.cachetType || 'rond';
      if (type === 'aucun') return '';
      if (type === 'image') return porteur.cachetImage ? '<img class="uas-cachet img" src="' + porteur.cachetImage + '" alt="Cachet" style="max-width:' + (taille * 1.6) + 'px;max-height:' + taille + 'px">' : '';
      return dessinCachet(Object.assign({ forme: type === 'rect' ? 'rect' : 'rond', couleur: porteur.cachetCouleur || 'bleu', taille }, mentionsCachet(b, fonction, nom)));
    }
    const cachetMembre = (m, b, taille) => cachetDe(m, b, m.fonction, nomComplet(m), taille || 104);
    /** Visa de l'autorité hiérarchique : celui saisi sur le bureau, sinon la signature et le cachet que l'application connaît */
    async function visaDe(niv, cle, b) {
      const v = (b && b.visa) || {};
      let app = null;
      if (A.visa) { try { app = await A.visa(niv, cle); } catch (e) { app = null; } }
      app = app || {};
      const manuel = !!(v.nom || v.signature || (v.cachetType && v.cachetType !== 'app'));
      const titre = v.titre || app.titre || VISA_DEFAUT[niv] || 'Le Responsable';
      const nom = manuel ? (v.nom || '') : (app.nom || '');
      const signature = manuel ? (v.signature || '') : (app.signature || '');
      let cachet = '';
      if (v.cachetType && v.cachetType !== 'app') cachet = cachetDe(v, b || { niveau: niv, entiteLib: (entite(niv, cle) || {}).lib || '' }, titre.replace(/^(le|la)\s+/i, ''), nom, 104);
      else cachet = app.cachet || '';
      return { titre, nom, signature, cachet };
    }

    function imageCadre(src, vide) { return src ? h('img', { src, alt: '' }) : h('span', { class: 'uas-aide' }, vide); }
    /** Bloc « Cachet et signature » d'un formulaire (membre ou visa du bureau) ; rend l'état modifiable */
    function blocCachetSignature(titre, d, mentions, avecApp) {
      const st = { cachetType: d.cachetType || (avecApp ? 'app' : 'rond'), cachetCouleur: d.cachetCouleur || 'bleu', cachetImage: d.cachetImage || '', signature: d.signature || '' };
      const apC = h('div', { class: 'uas-ap', 'data-uas': 'apercu-cachet' }), apS = h('div', { class: 'uas-ap', 'data-uas': 'apercu-signature' });
      const formes = (avecApp ? [['app', "Cachet de l'application (s'il existe)"]] : []).concat(FORMES_CACHET);
      const sForme = selectListe(formes, st.cachetType), sCoul = selectListe(LIB_COULEURS, st.cachetCouleur);
      sForme.setAttribute('aria-label', 'Forme du cachet'); sCoul.setAttribute('aria-label', 'Couleur du cachet');
      const maj = () => {
        const m = mentions();
        apC.replaceChildren();
        if (st.cachetType === 'app') apC.append(h('span', { class: 'uas-aide' }, "Le cachet enregistré dans l'application est apposé (s'il existe)."));
        else if (st.cachetType === 'aucun') apC.append(h('span', { class: 'uas-aide' }, 'Pas de cachet.'));
        else if (st.cachetType === 'image') apC.append(imageCadre(st.cachetImage, 'Aucune image : importez le cachet scanné.'));
        else apC.append(h('div', { html: dessinCachet(Object.assign({ forme: st.cachetType === 'rect' ? 'rect' : 'rond', couleur: st.cachetCouleur, taille: 120 }, m)) }));
        sCoul.disabled = !(st.cachetType === 'rond' || st.cachetType === 'rect');
        apS.replaceChildren(imageCadre(st.signature, 'Pas encore de signature.'));
      };
      sForme.addEventListener('change', () => { st.cachetType = sForme.value; maj(); });
      sCoul.addEventListener('change', () => { st.cachetCouleur = sCoul.value; maj(); });
      const bImgC = h('button', { class: 'uas-btn s', type: 'button', onclick: async () => {
        const f = await choisirFichier('image/*'); if (!f) return;
        try { st.cachetImage = await lireImage(f, 480, 480); st.cachetType = 'image'; sForme.value = 'image'; maj(); } catch (e) { toast && toast(e.message); }
      } }, '\uE013 Importer un cachet');
      const bRazC = h('button', { class: 'uas-btn s', type: 'button', onclick: () => { st.cachetType = avecApp ? 'app' : 'rond'; st.cachetCouleur = 'bleu'; st.cachetImage = ''; sForme.value = st.cachetType; sCoul.value = 'bleu'; maj(); } }, '↺ Réinitialiser');
      const bSig = h('button', { class: 'uas-btn s p', type: 'button', 'data-uas': 'signer', onclick: async () => { const r = await dialogueSignature(titre, st.signature); if (r !== null) { st.signature = r; maj(); } } }, '\uE029 Signer');
      const bImgS = h('button', { class: 'uas-btn s', type: 'button', onclick: async () => {
        const f = await choisirFichier('image/*'); if (!f) return;
        try { st.signature = await lireImage(f, 400, 150); maj(); } catch (e) { toast && toast(e.message); }
      } }, '\uE013 Importer une signature');
      const bRazS = h('button', { class: 'uas-btn s d', type: 'button', onclick: () => { st.signature = ''; maj(); } }, '\uE005 Effacer la signature');
      const el = h('div', { class: 'uas-sc' }, h('h4', {}, '\uE033 Cachet et signature'),
        h('div', { class: 'uas-sc-g' },
          h('div', {}, h('div', { class: 'uas-form', style: 'margin-bottom:6px' }, champ('Cachet', sForme), champ('Couleur', sCoul)), apC,
            h('div', { class: 'uas-actions' }, bImgC, bRazC)),
          h('div', {}, h('p', { class: 'uas-aide', style: 'margin:0 0 6px' }, 'Signature digitale : au doigt, au stylet ou à la souris, ou image importée.'), apS,
            h('div', { class: 'uas-actions' }, bSig, bImgS, bRazS))));
      maj();
      return { el, st, maj };
    }
    function dialogueSignature(titre, actuelle) {
      const pad = padSignature(actuelle);
      return dialogue('Signature — ' + titre, h('div', {}, h('p', { class: 'uas-aide', style: 'margin:0 0 8px' }, 'Signez dans le cadre avec le doigt, un stylet ou la souris.'), pad.el), [
        { l: 'Annuler', v: null },
        { l: 'Effacer', action: () => { pad.effacer(); return false; } },
        { l: '\uE007 Valider la signature', p: true, action: () => pad.image() }]);
    }
    /** Entités de l'onglet après filtres zone / UP */
    function entitesFiltrees(niv) {
      return entites(niv).filter(e => (!filtres.zone || niv === 'CS' || niv === 'DDEMP' || (niv === 'ZONE' ? String(e.cle) === filtres.zone : String(e.zone || '') === filtres.zone))
        && (!filtres.up || niv !== 'ECOLE' || norm(e.up) === norm(filtres.up)));
    }

    function dessiner() {
      racine.replaceChildren();
      const z = h('div', { class: 'uas' });
      // l'application hôte peut afficher elle-même le titre de la page (sansTitre)
      if (!A.sansTitre) z.append(h('h2', { class: 'uas-titre' }, 'Bureaux UASCEP'),
        h('p', { class: 'uas-sous' }, "Membres et responsables des bureaux de l'UASCEP par école, unité pédagogique, zone pédagogique, circonscription et département."));
      const tabs = niveaux.map(([c, l]) => [c, l]).concat([['SYNTHESE', 'Synthèse'], ['ARCHIVES', 'Anciens bureaux']]);
      z.append(h('div', { class: 'uas-onglets', role: 'tablist' }, tabs.map(([c, l]) => h('button', {
        class: 'uas-onglet' + (onglet === c ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': onglet === c ? 'true' : 'false',
        onclick: () => { onglet = c; memo.set('onglet', c); dessiner(); }
      }, l))));
      // outils communs : export / import / impression de l'ensemble
      z.append(h('div', { class: 'uas-actions' },
        h('button', { class: 'uas-btn', type: 'button', onclick: exporterTout }, '\uE015 Exporter (Excel)'),
        ctx.peutImporter === false ? null : h('button', { class: 'uas-btn', type: 'button', onclick: importer }, '\uE00B Importer (Excel)'),
        h('button', { class: 'uas-btn', type: 'button', onclick: () => imprimerListe(onglet) }, '\uE008 Imprimer / PDF'),
        h('button', { class: 'uas-btn', type: 'button', 'data-uas': 'liste-signee', onclick: () => editerListe(onglet) }, '\uE00F Liste des bureaux signée (QR)')));
      if (onglet === 'SYNTHESE') z.append(synthese());
      else if (onglet === 'ARCHIVES') z.append(archives());
      else z.append(vueNiveau(onglet));
      racine.append(z);
    }

    function barreFiltres(niv) {
      const b = h('div', { class: 'uas-barre' });
      const zones = entites('ZONE');
      if (zones.length > 1 && niv !== 'CS' && niv !== 'DDEMP' && !ctx.fixe?.zone) {
        const s = h('select', { 'aria-label': 'Zone pédagogique', onchange: (e) => { filtres.zone = e.target.value; memo.set('zone', filtres.zone); filtres.up = ''; dessiner(); } },
          h('option', { value: '' }, 'Toutes les zones'), zones.map(x => h('option', { value: x.cle, selected: String(x.cle) === filtres.zone }, x.lib)));
        b.append(h('label', {}, 'Zone pédagogique', s));
      }
      if (niv === 'ECOLE') {
        const ups = entites('UP').filter(u => !filtres.zone || String(u.zone || '') === filtres.zone);
        if (ups.length > 1) {
          const s = h('select', { 'aria-label': 'Unité pédagogique', onchange: (e) => { filtres.up = e.target.value; memo.set('up', filtres.up); dessiner(); } },
            h('option', { value: '' }, 'Toutes les UP'), ups.map(u => h('option', { value: u.nomUp || u.lib, selected: norm(u.nomUp || u.lib) === norm(filtres.up) }, u.lib)));
          b.append(h('label', {}, 'Unité pédagogique', s));
        }
      }
      const liste = entitesFiltrees(niv);
      if (liste.length > 1) {
        const cur = filtres.entite[niv] || '';
        const s = h('select', { 'aria-label': LIB_NIVEAU[niv], onchange: (e) => { filtres.entite[niv] = e.target.value; dessiner(); } },
          h('option', { value: '' }, 'Tous (' + liste.length + ')'),
          liste.map(x => { const n = membresDe(bureauActif(niv, x.cle)).length; return h('option', { value: x.cle, selected: String(x.cle) === cur }, x.lib + (n ? ' — ' + n + ' membre(s)' : '')); }));
        b.append(h('label', {}, niv === 'ECOLE' ? 'École' : LIB_NIVEAU[niv], s));
      } else if (liste.length === 1) filtres.entite[niv] = String(liste[0].cle);
      return b;
    }

    function tableMembres(membres, avecEntite, ecrire) {
      if (!membres.length) return h('p', { class: 'uas-vide' }, 'Aucun membre enregistré.');
      const parId = Object.fromEntries(etat.bureaux.map(b => [b.id, b]));
      const cols = ["N° d'ordre"].concat(avecEntite ? ['Bureau'] : [], ['Nom et prénoms', 'Sexe', 'École', 'UP', 'Zone pédagogique', 'Nom du RUP', 'Fonction', 'Qualité', 'Contact', "Date d'élection", 'Date de fin de mandat', 'Statut', 'Cachet / signature']).concat(ecrire ? [''] : []);
      return h('div', { class: 'uas-tw' }, h('table', { class: 'uas-t' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))),
        h('tbody', {}, membres.map(m => {
          const b = parId[m.bureauId] || {}, fin = m.dateFin || b.dateFin, st = statutMandat(fin), w = ecrire && ecrire(b);
          return h('tr', {}, h('td', { class: 'c' }, m.ordre || ''), avecEntite ? h('td', {}, b.entiteLib || '') : null,
            h('td', {}, h('b', {}, String(m.nom || '').toUpperCase()), ' ', m.prenoms || ''), h('td', { class: 'c' }, m.sexe || ''),
            h('td', {}, m.ecole || ''), h('td', {}, m.up || ''), h('td', {}, m.zone || ''), h('td', {}, m.rup || ''),
            h('td', {}, m.fonction || ''), h('td', {}, m.qualite || ''), h('td', {}, m.contact || ''),
            h('td', {}, fr(m.dateElection || b.dateElection)), h('td', {}, fr(fin)), h('td', {}, h('span', { class: 'uas-badge ' + st[0] }, st[1])),
            h('td', { class: 'c', title: (m.cachetType === 'aucun' ? 'Sans cachet' : 'Cachet') + ' — ' + (m.signature ? 'signé le ' + fr(m.signatureLe) : 'signature à recueillir') },
              (m.cachetType === 'aucun' ? '—' : '\uE077') + ' ' + (m.signature ? '\uE029' : '…')),
            ecrire ? h('td', { style: 'white-space:nowrap' }, w ? [
              h('button', { class: 'uas-btn s', type: 'button', title: 'Attestation de fonction (signée, QR)', 'aria-label': 'Attestation de ' + nomComplet(m), onclick: () => editerDocument('ATTESTATION', b, m) }, '\uE02F'), ' ',
              h('button', { class: 'uas-btn s', type: 'button', title: 'Modifier', 'aria-label': 'Modifier ' + nomComplet(m), onclick: () => formMembre(b.niveau, b.entite, m) }, '\uE006'), ' ',
              h('button', { class: 'uas-btn s d', type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer ' + nomComplet(m), onclick: () => supprimerMembre(m) }, '\uE005')] : '') : null);
        }))));
    }

    function vueNiveau(niv) {
      const box = h('div', {});
      box.append(barreFiltres(niv));
      const liste = entitesFiltrees(niv);
      if (!liste.length) { box.append(h('p', { class: 'uas-vide' }, 'Aucune entité de ce niveau dans votre périmètre.')); return box; }
      const cle = filtres.entite[niv];
      const ecrireB = (b) => peut(b.niveau, b.entite);
      if (!cle) {
        // vue d'ensemble : tous les membres des bureaux de l'onglet
        const bs = liste.map(e => bureauActif(niv, e.cle)).filter(Boolean);
        const membres = bs.flatMap(membresDe);
        const ecrivables = liste.filter(e => peut(niv, e.cle));
        box.append(h('div', { class: 'uas-actions' },
          ecrivables.length ? h('button', { class: 'uas-btn p', type: 'button', onclick: () => choisirPuis(niv, liste, (c) => formMembre(niv, c)) }, '\uE001 Ajouter un membre') : null,
          ecrivables.length && bs.length ? h('button', { class: 'uas-btn d', type: 'button', onclick: () => reinitialiserTous(niv, bs.filter(ecrireB)) }, '\uE058 Réinitialiser tous les bureaux') : null));
        box.append(h('p', { class: 'uas-sous' }, `${bs.length} bureau(x) constitué(s) sur ${liste.length} — ${membres.length} membre(s). Choisissez ${niv === 'ECOLE' ? 'une école' : 'une entité'} ci-dessus pour gérer son bureau.`));
        box.append(tableMembres(membres, true, ecrireB));
        return box;
      }
      const e = entite(niv, cle) || { lib: cle };
      const b = bureauActif(niv, cle), w = peut(niv, cle), membres = membresDe(b);
      const st = b ? statutMandat(b.dateFin) : ['nr', 'Bureau non constitué'];
      box.append(h('div', { class: 'uas-carte' },
        h('h3', {}, `Bureau UASCEP — ${LIB_NIVEAU[niv]} : ${e.lib}`),
        h('div', { class: 'uas-info' },
          h('span', {}, h('b', {}, 'Élu le : '), fr(b && b.dateElection) || '—'),
          h('span', {}, h('b', {}, 'Mandat : '), b && b.duree ? b.duree + ' an(s)' : '—'),
          h('span', {}, h('b', {}, 'Fin : '), fr(b && b.dateFin) || '—'),
          h('span', {}, h('span', { class: 'uas-badge ' + st[0] }, st[1])),
          h('span', {}, h('b', {}, 'Installation : '), fr(b && b.dateInstallation) || '—'),
          h('span', {}, h('b', {}, 'Assemblée générale : '), [fr(b && b.agDate), b && b.agLieu].filter(Boolean).join(' — ') || '—'),
          b && b.pv ? h('span', {}, h('b', {}, 'PV : '), b.pv) : null,
          e.rup ? h('span', {}, h('b', {}, 'RUP : '), e.rup) : null),
        b && b.observations ? h('p', { class: 'uas-sous', style: 'margin:6px 0 0' }, b.observations) : null,
        h('div', { class: 'uas-actions' },
          w ? h('button', { class: 'uas-btn p', type: 'button', onclick: () => formMembre(niv, cle) }, '\uE001 Ajouter un membre') : null,
          w ? h('button', { class: 'uas-btn', type: 'button', onclick: () => formBureau(niv, cle) }, '\uE006 Modifier le bureau') : null,
          w && b ? h('button', { class: 'uas-btn', type: 'button', onclick: () => renouveler(b) }, '\uE058 Renouvellement') : null,
          w && b ? h('button', { class: 'uas-btn d', type: 'button', onclick: () => reinitialiser([b]) }, '\uE058 Réinitialiser') : null,
          h('button', { class: 'uas-btn', type: 'button', onclick: () => imprimerBureau(b, e, niv) }, '\uE008 Imprimer / PDF'),
          w && b ? h('button', { class: 'uas-btn p', type: 'button', 'data-uas': 'documents', onclick: () => choisirDocument(b) }, '\uE00D Documents signés (QR)') : null,
          b ? h('button', { class: 'uas-btn', type: 'button', 'data-uas': 'logo', onclick: () => reglerLogo(b, w) }, '\uE047 Logo UASCEP') : null,
          !w ? h('span', { class: 'uas-sous', style: 'margin:0;align-self:center' }, 'Consultation seulement.') : null)));
      box.append(tableMembres(membres, false, w ? () => true : null));
      if (b) box.append(vieBureau(b, w));
      return box;
    }

    /** Logo UASCEP du bureau : texte du bas (pré-rempli depuis l'entité), texte du haut, couleurs, image importée ;
        aperçu en direct, téléchargement SVG / PNG ; il figure en tête de tous les documents du bureau. */
    async function reglerLogo(b, w) {
      const g = Object.assign({ haut: 'UASCEP', definition: DEFINITION, bas: texteLogo(b.niveau, b.entiteLib) }, LOGO_COULEURS, b.logo || {});
      const iDef = h('input', { type: 'text', value: g.definition, 'aria-label': 'Définition du sigle', 'data-uas': 'logo-definition', 'data-geo': 'aucun' }), iHaut = h('input', { type: 'text', value: g.haut, 'aria-label': 'Texte du haut', 'data-geo': 'aucun' }), iBas = h('input', { type: 'text', value: g.bas, 'aria-label': 'Texte du bas', 'data-uas': 'logo-bas', 'data-geo': 'aucun' });
      const coul = ['c1', 'c2', 'c3'].map(k => h('input', { type: 'color', value: g[k], 'aria-label': { c1: 'Couleur du fond', c2: 'Couleur des filets et du texte du bas', c3: 'Couleur de la piste' }[k] }));
      const ap = h('div', { class: 'uas-ap', 'data-uas': 'apercu-logo', style: 'min-height:200px' });
      const lire = () => ({ haut: iHaut.value.trim() || 'UASCEP', definition: iDef.value.trim(), bas: iBas.value.trim(), c1: coul[0].value, c2: coul[1].value, c3: coul[2].value, image: g.image || '' });
      const svgDe = (x) => logoSvg({ haut: x.haut, definition: x.definition, bas: x.bas, couleurs: x, taille: 400 });
      const maj = () => { const x = lire(); ap.innerHTML = x.image ? '<img src="' + x.image + '" alt="Logo importé" style="max-height:200px">' : svgDe(x).replace('width="400" height="400"', 'width="200" height="200"'); };
      [iHaut, iDef, iBas].concat(coul).forEach(i => i.addEventListener('input', maj));
      const telecharger = async (png) => {
        const x = lire(), nom = 'logo-uascep-' + norm(x.bas || b.entiteLib).replace(/\s+/g, '-').slice(0, 40);
        if (!png && !x.image) { A.telecharger(nom + '.svg', new Blob([svgDe(x)], { type: 'image/svg+xml' })); return; }
        const src = x.image || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgDe(x));
        const img = new Image(); await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = src; });
        const c = document.createElement('canvas'); c.width = 800; c.height = 800; c.getContext('2d').drawImage(img, 0, 0, 800, 800);
        const blob = await new Promise(r => c.toBlob(r, 'image/png')); A.telecharger(nom + '.png', blob);
      };
      maj();
      const corps = h('div', {}, h('div', { class: 'uas-form' }, champ('Texte du bas (commune, zone, école…)', iBas, true), champ('Définition du sigle (sous « UASCEP », initiales en couleur)', iDef, true), champ('Texte du haut', iHaut),
          champ('Fond', coul[0]), champ('Filets et texte du bas', coul[1]), champ('Piste', coul[2])),
        h('p', { class: 'uas-aide' }, 'Aperçu (le logo figure en tête de tous les documents de ce bureau) :'), ap,
        h('div', { class: 'uas-actions' },
          h('button', { class: 'uas-btn s', type: 'button', 'data-uas': 'logo-svg', onclick: () => telecharger(false) }, '\uE009 SVG'),
          h('button', { class: 'uas-btn s', type: 'button', 'data-uas': 'logo-png', onclick: () => telecharger(true) }, '\uE009 PNG'),
          w ? h('button', { class: 'uas-btn s', type: 'button', onclick: async () => { const f = await choisirFichier('image/*'); if (!f) return; try { g.image = await lireImage(f, 800, 800); maj(); } catch (e) { toast && toast(e.message); } } }, '\uE013 Importer un logo personnalisé') : null,
          w ? h('button', { class: 'uas-btn s d', type: 'button', 'data-uas': 'logo-reinit', onclick: () => { g.image = ''; iHaut.value = 'UASCEP'; iDef.value = DEFINITION; iBas.value = texteLogo(b.niveau, b.entiteLib); coul[0].value = LOGO_COULEURS.c1; coul[1].value = LOGO_COULEURS.c2; coul[2].value = LOGO_COULEURS.c3; maj(); } }, '↺ Réinitialiser') : null));
      const r = await dialogue('Logo UASCEP — ' + b.entiteLib, corps, w ? [{ l: 'Fermer', v: null }, { l: '\uE007 Enregistrer le logo', p: true, action: () => lire() }] : [{ l: 'Fermer', v: null }]);
      if (!r) return;
      const def = r.haut === 'UASCEP' && r.definition === DEFINITION && r.bas === texteLogo(b.niveau, b.entiteLib) && r.c1 === LOGO_COULEURS.c1 && r.c2 === LOGO_COULEURS.c2 && r.c3 === LOGO_COULEURS.c3 && !r.image;
      if (def) delete b.logo; else b.logo = r;
      await sauver(); toast && toast('Logo enregistré.'); dessiner();
    }
    function choisirPuis(niv, liste, suite) {
      const ok = liste.filter(e => peut(niv, e.cle));
      if (ok.length === 1) return suite(ok[0].cle);
      const s = h('select', {}, ok.map(e => h('option', { value: e.cle }, e.lib)));
      dialogue('Choisir ' + (niv === 'ECOLE' ? "l'école" : "l'entité"), h('div', { class: 'uas-form' }, h('label', { class: 'large' }, LIB_NIVEAU[niv], s)),
        [{ l: 'Annuler' }, { l: 'Continuer', p: true, action: () => { filtres.entite[niv] = s.value; dessiner(); setTimeout(() => suite(s.value), 0); } }]);
    }

    /* ---------- formulaires ---------- */
    function champ(lib, el, large, aide) { return h('label', { class: large ? 'large' : '' }, lib, el, aide ? h('span', { class: 'uas-aide' }, aide) : null); }
    function selectListe(valeurs, v, vide) {
      return h('select', {}, vide ? h('option', { value: '' }, vide) : null, valeurs.map(x => Array.isArray(x)
        ? h('option', { value: x[0], selected: x[0] === v }, x[1]) : h('option', { value: x, selected: x === v }, x)));
    }
    function formMembre(niv, cle, m) {
      if (!peut(niv, cle)) return;
      const e = entite(niv, cle) || { lib: cle }, b = bureauActif(niv, cle);
      const d = m || {}, nouveau = !m;
      const listeId = 'uas-fonctions-' + Math.random().toString(36).slice(2, 7);
      const f = {
        ordre: h('input', { type: 'number', min: '1', value: d.ordre || (membresDe(b).reduce((x, y) => Math.max(x, +y.ordre || 0), 0) + 1) }),
        nom: h('input', { value: d.nom || '', required: true, autocapitalize: 'characters' }),
        prenoms: h('input', { value: d.prenoms || '' }),
        sexe: selectListe([['M', 'Masculin'], ['F', 'Féminin']], d.sexe, '—'),
        fonction: h('input', { value: d.fonction || '', list: listeId }),
        qualite: selectListe(QUALITES, d.qualite, '—'),
        ecole: h('input', { value: d.ecole != null ? d.ecole : (e.ecole || '') }),
        up: h('input', { value: d.up != null ? d.up : (e.up || '') }),
        zone: h('input', { value: d.zone != null ? d.zone : (e.zone ? (entite('ZONE', e.zone) || { lib: e.zone }).lib : '') }),
        rup: h('input', { value: d.rup != null ? d.rup : (e.rup || '') }),
        contact: h('input', { value: d.contact || '', inputmode: 'tel' }),
        email: h('input', { value: d.email || '', type: 'email' }),
        dateElection: h('input', { type: 'date', value: iso(d.dateElection || (b && b.dateElection)) }),
        duree: h('input', { type: 'number', min: '0.5', step: '0.5', value: d.duree || (b && b.duree) || DUREE_DEFAUT }),
        dateFin: h('input', { type: 'date', value: iso(d.dateFin || (b && b.dateFin)) }),
        dateInstallation: h('input', { type: 'date', value: iso(d.dateInstallation || (b && b.dateInstallation)) }),
        observations: h('textarea', { rows: '2' }, d.observations || '')
      };
      let finManuelle = !!(d.dateFin && d.dateFin !== plusAns(d.dateElection, d.duree));
      const recalcul = () => { if (!finManuelle) f.dateFin.value = plusAns(f.dateElection.value, f.duree.value); };
      f.dateElection.addEventListener('change', recalcul); f.duree.addEventListener('input', recalcul);
      f.dateFin.addEventListener('change', () => { finManuelle = !!f.dateFin.value; });
      if (!f.dateFin.value) recalcul();
      const cs = blocCachetSignature(nomComplet({ nom: f.nom.value, prenoms: f.prenoms.value }) || 'membre du bureau', d,
        () => mentionsCachet({ niveau: niv, entiteLib: e.lib }, f.fonction.value.trim(), nomComplet({ nom: f.nom.value, prenoms: f.prenoms.value })), false);
      [f.fonction, f.nom, f.prenoms].forEach(x => x.addEventListener('input', cs.maj));
      const corps = h('div', {}, h('p', { class: 'uas-sous' }, `${LIB_NIVEAU[niv]} : ${e.lib}`),
        h('datalist', { id: listeId }, fonctions().map(x => h('option', { value: x }))),
        h('div', { class: 'uas-form' },
          champ("N° d'ordre", f.ordre), champ('Nom *', f.nom), champ('Prénoms', f.prenoms), champ('Sexe', f.sexe),
          champ('Fonction dans le bureau', f.fonction, false, 'Liste proposée ou saisie libre'), champ('Qualité', f.qualite),
          champ('École', f.ecole), champ('Unité pédagogique', f.up), champ('Zone pédagogique', f.zone), champ('Nom du RUP', f.rup),
          champ('Contact', f.contact), champ('E-mail', f.email), champ("Date d'élection", f.dateElection), champ('Durée du mandat (ans)', f.duree),
          champ('Date de fin de mandat', f.dateFin, false, 'Calculée, modifiable'), champ("Date d'installation", f.dateInstallation),
          champ('Observations', f.observations, true), cs.el));
      dialogue(nouveau ? 'Ajouter un membre' : 'Modifier un membre', corps, [{ l: 'Annuler' }, {
        l: '\uE007 Enregistrer', p: true, action: async () => {
          if (!f.nom.value.trim()) { f.nom.focus(); toast && toast('Le nom est obligatoire.'); return false; }
          const bu = assurerBureau(niv, cle);
          const v = { ordre: +f.ordre.value || '', nom: f.nom.value.trim().toUpperCase(), prenoms: f.prenoms.value.trim(), sexe: f.sexe.value,
            fonction: f.fonction.value.trim(), qualite: f.qualite.value, ecole: f.ecole.value.trim(), up: f.up.value.trim(), zone: f.zone.value.trim(),
            rup: f.rup.value.trim(), contact: f.contact.value.trim(), email: f.email.value.trim(), dateElection: f.dateElection.value,
            duree: +f.duree.value || '', dateFin: f.dateFin.value, dateInstallation: f.dateInstallation.value, observations: f.observations.value.trim(),
            cachetType: cs.st.cachetType, cachetCouleur: cs.st.cachetCouleur, cachetImage: cs.st.cachetType === 'image' ? cs.st.cachetImage : '',
            signature: cs.st.signature, signatureLe: cs.st.signature ? (cs.st.signature === d.signature ? (d.signatureLe || auj()) : auj()) : '' };
          if (v.fonction && !FONCTIONS.includes(v.fonction) && !(etat.fonctions || []).includes(v.fonction)) etat.fonctions.push(v.fonction);
          if (m) Object.assign(m, v, { maj: auj() }); else etat.membres.push(Object.assign({ id: uid(), bureauId: bu.id, cree: auj() }, v));
          // le bureau reprend les dates de mandat quand elles manquent
          if (!bu.dateElection && v.dateElection) { bu.dateElection = v.dateElection; bu.duree = v.duree || bu.duree; bu.dateFin = v.dateFin; }
          if (!bu.dateInstallation && v.dateInstallation) bu.dateInstallation = v.dateInstallation;
          await sauver(); toast && toast('Membre enregistré.'); dessiner();
        }
      }]);
    }
    function formBureau(niv, cle) {
      const e = entite(niv, cle) || { lib: cle }, b = bureauActif(niv, cle) || {};
      const f = { dateElection: h('input', { type: 'date', value: iso(b.dateElection) }), duree: h('input', { type: 'number', min: '0.5', step: '0.5', value: b.duree || DUREE_DEFAUT }),
        dateFin: h('input', { type: 'date', value: iso(b.dateFin) }), dateInstallation: h('input', { type: 'date', value: iso(b.dateInstallation) }),
        agDate: h('input', { type: 'date', value: iso(b.agDate) }), agLieu: h('input', { value: b.agLieu || '' }), pv: h('input', { value: b.pv || '', placeholder: 'Référence ou nom du fichier du PV' }),
        observations: h('textarea', { rows: '2' }, b.observations || ''), appliquer: h('input', { type: 'checkbox', checked: true }) };
      const vi = b.visa || {};
      const vTitre = h('input', { value: vi.titre || '', placeholder: VISA_DEFAUT[niv] }), vNom = h('input', { value: vi.nom || '', placeholder: 'Nom et prénoms du signataire' });
      const vcs = blocCachetSignature('visa — ' + (VISA_DEFAUT[niv] || ''), vi, () => mentionsCachet({ niveau: niv, entiteLib: e.lib }, (vTitre.value || VISA_DEFAUT[niv] || '').replace(/^(le|la)\s+/i, ''), vNom.value), true);
      [vTitre, vNom].forEach(x => x.addEventListener('input', vcs.maj));
      const visa = h('div', { class: 'uas-sc' }, h('h4', {}, "\uE023 Visa de l'autorité hiérarchique"),
        h('p', { class: 'uas-aide', style: 'margin:0 0 8px' }, "Apposé sur les pièces du bureau. Laissé vide, l'application appose la signature et le cachet qu'elle connaît (directeur, CP, chef de circonscription…), sinon un emplacement à signer."),
        h('div', { class: 'uas-form', style: 'margin-bottom:8px' }, champ('Qualité du signataire', vTitre), champ('Nom du signataire', vNom)), vcs.el);
      let finManuelle = !!(b.dateFin && b.dateFin !== plusAns(b.dateElection, b.duree));
      const recalcul = () => { if (!finManuelle) f.dateFin.value = plusAns(f.dateElection.value, f.duree.value); };
      f.dateElection.addEventListener('change', recalcul); f.duree.addEventListener('input', recalcul); f.dateFin.addEventListener('change', () => { finManuelle = !!f.dateFin.value; });
      dialogue('Bureau — ' + LIB_NIVEAU[niv] + ' : ' + e.lib, h('div', { class: 'uas-form' },
        champ("Date d'élection", f.dateElection), champ('Durée du mandat (ans)', f.duree), champ('Date de fin de mandat', f.dateFin, false, 'Calculée, modifiable'),
        champ("Date d'installation", f.dateInstallation), champ("Date de l'assemblée générale", f.agDate), champ("Lieu de l'assemblée générale", f.agLieu),
        champ('PV (référence)', f.pv), champ('Observations', f.observations, true),
        h('label', { class: 'large', style: 'flex-direction:row;align-items:center;gap:8px;font-weight:400' }, f.appliquer, 'Appliquer ces dates de mandat aux membres qui n’ont pas de date propre'), visa),
      [{ l: 'Annuler' }, { l: '\uE007 Enregistrer', p: true, action: async () => {
        const bu = assurerBureau(niv, cle);
        Object.assign(bu, { dateElection: f.dateElection.value, duree: +f.duree.value || DUREE_DEFAUT, dateFin: f.dateFin.value, dateInstallation: f.dateInstallation.value,
          agDate: f.agDate.value, agLieu: f.agLieu.value.trim(), pv: f.pv.value.trim(), observations: f.observations.value.trim(), maj: auj(),
          visa: { titre: vTitre.value.trim(), nom: vNom.value.trim(), signature: vcs.st.signature, cachetType: vcs.st.cachetType, cachetCouleur: vcs.st.cachetCouleur,
            cachetImage: vcs.st.cachetType === 'image' ? vcs.st.cachetImage : '' } });
        if (f.appliquer.checked) membresDe(bu).forEach(m => { if (!m.dateElection) { m.dateElection = bu.dateElection; m.duree = bu.duree; m.dateFin = bu.dateFin; } if (!m.dateInstallation) m.dateInstallation = bu.dateInstallation; });
        await sauver(); toast && toast('Bureau enregistré.'); dessiner();
      } }]);
    }

    /* ---------- actions ---------- */
    async function supprimerMembre(m) {
      if (!(await confirmer('Supprimer un membre', `Supprimer ${nomComplet(m)} du bureau ?`, '\uE005 Supprimer'))) return;
      etat.membres = etat.membres.filter(x => x.id !== m.id); await sauver(); toast && toast('Membre supprimé.'); dessiner();
    }
    async function reinitialiser(bs) {
      if (!bs.length) return;
      const archiver = h('input', { type: 'checkbox', checked: true });
      const ok = await dialogue('Réinitialiser ' + (bs.length > 1 ? bs.length + ' bureaux' : 'le bureau'), h('div', {},
        h('p', {}, bs.length > 1 ? `Les ${bs.length} bureaux seront vidés pour un nouveau mandat.` : `Le bureau « ${bs[0].entiteLib} » sera vidé pour un nouveau mandat.`),
        h('label', { style: 'display:flex;gap:8px;align-items:center' }, archiver, 'Garder l’ancien bureau dans « Anciens bureaux » (recommandé)')),
      [{ l: 'Annuler', v: false }, { l: '\uE058 Réinitialiser', d: true, v: true }]);
      if (!ok) return;
      const ids = new Set(bs.map(b => b.id));
      if (archiver.checked) etat.bureaux.forEach(b => { if (ids.has(b.id)) { b.statut = 'archive'; b.archiveLe = auj(); } });
      else { etat.bureaux = etat.bureaux.filter(b => !ids.has(b.id)); etat.membres = etat.membres.filter(m => !ids.has(m.bureauId)); COLLECTIONS.forEach(c => { etat[c] = etat[c].filter(r => !ids.has(r.bureauId)); }); }
      await sauver(); toast && toast('Bureau(x) réinitialisé(s).'); dessiner();
    }
    const reinitialiserTous = (niv, bs) => reinitialiser(bs);
    async function renouveler(b) {
      const d = h('input', { type: 'date', value: auj() }), du = h('input', { type: 'number', min: '0.5', step: '0.5', value: b.duree || DUREE_DEFAUT });
      const ok = await dialogue('Renouvellement du bureau', h('div', { class: 'uas-form' },
        h('p', { class: 'uas-sous large', style: 'grid-column:1/-1' }, "L'ancien bureau passe dans « Anciens bureaux » ; ses membres sont recopiés dans le nouveau, que vous pouvez ensuite modifier."),
        champ("Date d'élection du nouveau bureau", d), champ('Durée du mandat (ans)', du)), [{ l: 'Annuler', v: false }, { l: '\uE058 Renouveler', p: true, v: true }]);
      if (!ok) return;
      const nb = Object.assign({}, b, { id: uid(), dateElection: d.value, duree: +du.value || DUREE_DEFAUT, dateFin: plusAns(d.value, du.value), dateInstallation: '', agDate: '', agLieu: '', pv: '', statut: 'actif', creeLe: auj(), archiveLe: undefined });
      const anciens = membresDe(b);
      b.statut = 'archive'; b.archiveLe = auj();
      etat.bureaux.push(nb);
      anciens.forEach(m => etat.membres.push(Object.assign({}, m, { id: uid(), bureauId: nb.id, dateElection: nb.dateElection, duree: nb.duree, dateFin: nb.dateFin, dateInstallation: '', cree: auj() })));
      await sauver(); toast && toast('Nouveau mandat créé.'); dessiner();
    }

    /* ---------- synthèse ---------- */
    function synthese() {
      const box = h('div', {}), actifs = etat.bureaux.filter(b => b.statut !== 'archive' && entite(b.niveau, b.entite));
      const parNiv = niveaux.map(([c, l]) => {
        const bs = actifs.filter(b => b.niveau === c), ms = bs.flatMap(membresDe);
        return [l, entites(c).length, bs.length, ms.length, ms.filter(m => m.sexe === 'M').length, ms.filter(m => m.sexe === 'F').length,
          bs.filter(b => statutMandat(b.dateFin)[0] === 'expire').length, bs.filter(b => statutMandat(b.dateFin)[0] === 'bientot').length];
      });
      const tot = parNiv.reduce((s, r) => s.map((v, i) => i ? v + r[i] : 'Total'), ['Total', 0, 0, 0, 0, 0, 0, 0]);
      const tab = (cols, rows, total) => h('div', { class: 'uas-tw' }, h('table', { class: 'uas-t' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))),
        h('tbody', {}, rows.map(r => h('tr', {}, r.map((v, i) => h('td', { class: i ? 'c' : '' }, v)))), total ? h('tr', { class: 'tot' }, total.map((v, i) => h('td', { class: i ? 'c' : '' }, v))) : null)));
      box.append(h('div', { class: 'uas-carte' }, h('h3', {}, 'Bureaux et membres par niveau'),
        tab(['Niveau', 'Entités', 'Bureaux constitués', 'Membres', 'H', 'F', 'Mandats expirés', 'À renouveler'], parNiv, tot)));
      const fct = {}; actifs.flatMap(membresDe).forEach(m => { const k = m.fonction || '(non précisée)'; fct[k] = fct[k] || [0, 0, 0]; fct[k][2]++; if (m.sexe === 'M') fct[k][0]++; if (m.sexe === 'F') fct[k][1]++; });
      const ordreF = fonctions();
      box.append(h('div', { class: 'uas-carte' }, h('h3', {}, 'Membres par fonction et par sexe'),
        Object.keys(fct).length ? tab(['Fonction', 'H', 'F', 'Total'], Object.entries(fct).sort((a, b) => (ordreF.indexOf(a[0]) + 1 || 99) - (ordreF.indexOf(b[0]) + 1 || 99)).map(([k, v]) => [k, ...v])) : h('p', { class: 'uas-vide' }, 'Aucun membre.')));
      const alerte = actifs.filter(b => ['expire', 'bientot', 'nr'].includes(statutMandat(b.dateFin)[0]) && membresDe(b).length);
      box.append(h('div', { class: 'uas-carte' }, h('h3', {}, 'Mandats expirés, à renouveler ou sans date de fin'),
        alerte.length ? tab(['Bureau', 'Niveau', 'Élu le', 'Fin', 'Statut'], alerte.map(b => [b.entiteLib, LIB_NIVEAU[b.niveau], fr(b.dateElection) || '—', fr(b.dateFin) || '—', statutMandat(b.dateFin)[1]])) : h('p', { class: 'uas-vide' }, 'Aucun mandat à signaler.')));
      return box;
    }

    /* ---------- anciens bureaux ---------- */
    function archives() {
      const box = h('div', {});
      const bs = etat.bureaux.filter(b => b.statut === 'archive' && entite(b.niveau, b.entite)).sort((a, b) => String(b.archiveLe || '').localeCompare(String(a.archiveLe || '')));
      if (!bs.length) { box.append(h('p', { class: 'uas-vide' }, 'Aucun ancien bureau. Un bureau réinitialisé ou renouvelé y est conservé.')); return box; }
      box.append(h('div', { class: 'uas-tw' }, h('table', { class: 'uas-t' }, h('thead', {}, h('tr', {}, ['Niveau', 'Entité', 'Élu le', 'Fin du mandat', 'Archivé le', 'Membres', ''].map(c => h('th', {}, c)))),
        h('tbody', {}, bs.map(b => h('tr', {}, h('td', {}, LIB_NIVEAU[b.niveau]), h('td', {}, b.entiteLib), h('td', {}, fr(b.dateElection) || '—'), h('td', {}, fr(b.dateFin) || '—'),
          h('td', {}, fr(b.archiveLe) || '—'), h('td', { class: 'c' }, membresDe(b).length),
          h('td', { style: 'white-space:nowrap' },
            h('button', { class: 'uas-btn s', type: 'button', onclick: () => dialogue('Ancien bureau — ' + b.entiteLib, tableMembres(membresDe(b), false, null)) }, '\uE043 Voir'), ' ',
            peut(b.niveau, b.entite) && !bureauActif(b.niveau, b.entite) ? h('button', { class: 'uas-btn s', type: 'button', onclick: async () => { b.statut = 'actif'; delete b.archiveLe; await sauver(); dessiner(); } }, '\uE037 Restaurer') : null, ' ',
            peut(b.niveau, b.entite) ? h('button', { class: 'uas-btn s d', type: 'button', onclick: async () => {
              if (!(await confirmer('Supprimer un ancien bureau', `Supprimer définitivement l'ancien bureau « ${b.entiteLib} » et ses ${membresDe(b).length} membre(s) ?`, '\uE005 Supprimer'))) return;
              etat.membres = etat.membres.filter(m => m.bureauId !== b.id); etat.bureaux = etat.bureaux.filter(x => x.id !== b.id); COLLECTIONS.forEach(c => { etat[c] = etat[c].filter(r => r.bureauId !== b.id); }); await sauver(); dessiner();
            } }, '\uE005') : null)))))));
      return box;
    }

    /* ---------- impression ---------- */
    function tableHtml(membres, avecEntite) {
      const parId = Object.fromEntries(etat.bureaux.map(b => [b.id, b]));
      const cols = ['N°'].concat(avecEntite ? ['Bureau'] : [], ['Nom et prénoms', 'Sexe', 'École', 'UP', 'Zone', 'RUP', 'Fonction', 'Qualité', 'Contact', 'Élu(e) le', 'Fin du mandat']);
      return '<table class="uas-imp"><thead><tr>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>'
        + membres.map(m => { const b = parId[m.bureauId] || {}; return '<tr><td>' + esc(m.ordre || '') + '</td>' + (avecEntite ? '<td>' + esc(b.entiteLib) + '</td>' : '')
          + '<td><b>' + esc(String(m.nom || '').toUpperCase()) + '</b> ' + esc(m.prenoms || '') + '</td><td>' + esc(m.sexe || '') + '</td><td>' + esc(m.ecole || '') + '</td><td>' + esc(m.up || '')
          + '</td><td>' + esc(m.zone || '') + '</td><td>' + esc(m.rup || '') + '</td><td>' + esc(m.fonction || '') + '</td><td>' + esc(m.qualite || '') + '</td><td>' + esc(m.contact || '')
          + '</td><td>' + esc(fr(m.dateElection || b.dateElection)) + '</td><td>' + esc(fr(m.dateFin || b.dateFin)) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    const CSS_IMP = '<style>.uas-imp{border-collapse:collapse;width:100%;table-layout:fixed;font:8.5pt Arial,sans-serif}.uas-imp th,.uas-imp td{border:1px solid #555;padding:3px 4px;text-align:left;vertical-align:top;overflow-wrap:break-word;hyphens:auto}'
      + '.uas-imp th{background:#E8EEF5!important;color:#1D2939!important;font-weight:700;text-transform:none;letter-spacing:0;position:static}.uas-imp th:first-child{width:26px}.uas-sig{display:flex;justify-content:space-between;gap:20px;margin-top:26px;font:10pt Arial,sans-serif}.uas-sig div{flex:1;text-align:center;min-height:70px}'
      + 'h2.uas-it{font:bold 13pt Arial,sans-serif;text-align:center;margin:10px 0 4px;text-transform:uppercase}p.uas-ip{font:10pt Arial,sans-serif;margin:2px 0;text-align:center}</style>';
    function signatures(niv) {
      const sig = { ECOLE: ['Le Président du bureau', 'Le Directeur / La Directrice'], UP: ['Le Président du bureau', 'Le Responsable de l’UP'], ZONE: ['Le Président du bureau', 'Le Conseiller pédagogique'],
        CS: ['Le Président du bureau', 'Le Chef de la circonscription scolaire'], DDEMP: ['Le Président du bureau', 'Le Directeur départemental'] }[niv] || ['Le Président du bureau', 'Le Responsable'];
      return '<div class="uas-sig"><div>' + esc(sig[0]) + '</div><div>' + (ctx.lieu ? esc(ctx.lieu) + ', le ' + fr(auj()) + '<br>' : '') + esc(sig[1]) + '</div></div>';
    }
    function imprimerBureau(b, e, niv) {
      const corps = CSS_IMP + CSS_DOC + (A.entete ? A.entete() : '') + bandeLogo(b || { niveau: niv, entiteLib: e.lib }) + `<h2 class="uas-it">Bureau UASCEP — ${esc(LIB_NIVEAU[niv])} : ${esc(e.lib)}</h2>`
        + `<p class="uas-ip">Élu le ${esc(fr(b && b.dateElection) || '…………')} — mandat de ${esc(b && b.duree || DUREE_DEFAUT)} an(s), jusqu'au ${esc(fr(b && b.dateFin) || '…………')}`
        + (b && b.agLieu ? ' — assemblée générale : ' + esc([fr(b.agDate), b.agLieu].filter(Boolean).join(', ')) : '') + '</p>'
        + tableHtml(membresDe(b), false) + signatures(niv);
      (A.imprimer || imprimerDefaut)('Bureau UASCEP — ' + e.lib, corps);
    }
    function imprimerListe(onglet2) {
      const niv = NIVEAUX.some(n => n[0] === onglet2) ? onglet2 : null;
      const bs = etat.bureaux.filter(b => b.statut !== 'archive' && entite(b.niveau, b.entite) && (!niv || (b.niveau === niv && entitesFiltrees(niv).some(e => String(e.cle) === String(b.entite)))));
      const membres = bs.flatMap(membresDe);
      if (!membres.length) { toast && toast('Aucun membre à imprimer.'); return; }
      const titre = 'Membres des bureaux UASCEP' + (niv ? ' — ' + LIB_NIVEAU[niv] : '');
      (A.imprimer || imprimerDefaut)(titre, CSS_IMP + (A.entete ? A.entete() : '') + `<h2 class="uas-it">${esc(titre)}</h2>` + tableHtml(membres, true) + signatures(niv || 'CS'));
    }

    /* ---------- documents signés : cachets, signatures, visa et code QR de vérification ---------- */
    const CSS_DOC = '<style>.uas-doc .uas-imp{table-layout:auto}.uas-doc .uas-imp th:first-child{width:auto}.uas-doc .uas-imp th.n{width:22px}.uas-doc{font:10.5pt/1.5 Arial,sans-serif;color:#111}.uas-doc h2.uas-it{margin-top:14px}.uas-doc p.uas-tx{text-align:justify;margin:8px 0}'
      + '.uas-doc .uas-ref{font:9pt Arial,sans-serif;text-align:right;margin:0}.uas-sigs{display:flex;flex-wrap:wrap;justify-content:space-between;gap:14px 18px;margin-top:18px;page-break-inside:avoid;break-inside:avoid}'
      + '.uas-sb{flex:1 1 170px;text-align:center;font:10pt Arial,sans-serif}.uas-sb-l{font-weight:700}.uas-sb-z{position:relative;height:112px;display:flex;align-items:center;justify-content:center}'
      + '.uas-sb-c{position:absolute;left:50%;top:50%;transform:translate(-72%,-50%);opacity:.88}.uas-sb-c svg{height:100px;width:auto;max-width:210px}.uas-sb-c .cachets-duo{display:flex;gap:4px;align-items:center}.uas-sb-c .cachets-duo svg{height:84px}.uas-sb-c svg.rond{width:104px;height:104px}.uas-sb-c svg.rect{width:190px;height:auto}.uas-sb-c img{max-width:150px;max-height:104px}'
      + '.uas-sb-s{position:relative;max-height:74px;max-width:170px;mix-blend-mode:multiply}.uas-sb-n{font-weight:700;text-transform:none}.uas-sb-v{border-top:1px dashed #999;margin:0 18px}'
      + '.uas-qrb{display:flex;gap:12px;align-items:center;margin-top:18px;padding-top:8px;border-top:1px solid #999;font:8.5pt Arial,sans-serif;page-break-inside:avoid;break-inside:avoid}'
      + '.uas-qrb .uas-qri svg,.uas-qrb .uas-qri img{width:96px;height:96px;display:block}.uas-qrb b{font-family:monospace;font-size:9.5pt}'
      + '.uas-bl{display:flex;gap:12px;align-items:center;margin:6px 0 4px;padding:4px 0;border-bottom:1px solid #1F4E79;font:10pt Arial,sans-serif}.uas-bl-i svg,.uas-bl-i img{width:78px;height:78px;display:block}.uas-bl-1{font-size:9pt;color:#333}.uas-bl-2{font-weight:700;color:#1F4E79;text-transform:uppercase}.uas-garde .uas-gl svg,.uas-garde .uas-gl img{width:170px;height:170px}</style>';
    const parRole = (b, r) => membresDe(b).find(m => roleDe(m.fonction) === r);
    const genre = (m, mas, fem) => (m && m.sexe === 'F' ? fem : mas);
    function blocSig(lib, nom, sig, cachet) {
      return '<div class="uas-sb"><div class="uas-sb-l">' + esc(lib) + '</div><div class="uas-sb-z">' + (cachet ? '<div class="uas-sb-c">' + cachet + '</div>' : '')
        + (sig ? '<img class="uas-sb-s" src="' + sig + '" alt="Signature">' : (cachet ? '' : '<div class="uas-sb-v" style="width:150px"></div>')) + '</div><div class="uas-sb-n">' + esc(nom || '') + '</div></div>';
    }
    const sigMembre = (m, b, lib) => m ? blocSig(lib, nomComplet(m), m.signature, cachetMembre(m, b)) : blocSig(lib, '', '', '');
    async function sigVisa(niv, cle, b) { const v = await visaDe(niv, cle, b); return { html: blocSig('Vu — ' + v.titre, v.nom, v.signature, v.cachet), v }; }
    const faitA = () => '<p style="text-align:right;margin:14px 0 0">Fait à ' + esc(ctx.lieu || '……………………') + ', le ' + esc(fr(auj())) + '</p>';
    /** En-tête officiel de l'application, puis bandeau du logo UASCEP du bureau */
    const bandeLogo = (b) => b ? '<div class="uas-bl"><div class="uas-bl-i">' + logoBureau(b, 78) + '</div><div><div class="uas-bl-1">' + esc((b.logo && b.logo.definition) || DEFINITION) + '</div><div class="uas-bl-2">UASCEP — ' + esc(LIB_NIVEAU[b.niveau] || '') + ' : ' + esc(b.entiteLib || '') + '</div></div></div>' : '';
    const enTete = (b) => (A.entete ? A.entete() : '') + bandeLogo(b);
    function tableMembresDoc(b, avecContact) {
      const ms = membresDe(b);
      return '<table class="uas-imp"><thead><tr><th class="n">N°</th><th>Nom et prénoms</th><th style="width:22%">Fonction</th><th>Qualité</th><th>École / structure</th>' + (avecContact ? '<th>Contact</th>' : '') + '<th style="width:12%">Signature</th></tr></thead><tbody>'
        + (ms.length ? ms.map(m => '<tr><td>' + esc(m.ordre || '') + '</td><td><b>' + esc(String(m.nom || '').toUpperCase()) + '</b> ' + esc(m.prenoms || '') + '</td><td>' + esc(m.fonction || '')
          + '</td><td>' + esc(m.qualite || '') + '</td><td>' + esc(m.ecole || '') + '</td>' + (avecContact ? '<td>' + esc(m.contact || '') + '</td>' : '')
          + '<td style="text-align:center">' + (m.signature ? '<img src="' + m.signature + '" alt="Signature" style="max-height:26px;max-width:80px">' : '') + '</td></tr>').join('')
          : '<tr><td colspan="7">Aucun membre.</td></tr>') + '</tbody></table>';
    }
    /** Numéro, code QR et mention de vérification fournis par l'application (registre, page de vérification) */
    async function sceau(type, titre, bs, m, signataire, opts) {
      const contenu = contenuDocument(etat, type, bs.map(b => b.id), m ? m.id : null, opts);
      const b0 = bs[0] || {};
      const resume = { type: TYPES_DOC[type], bureau: bs.length === 1 ? LIB_NIVEAU[b0.niveau] + ' : ' + b0.entiteLib : bs.length + ' bureau(x)',
        membre: m ? nomComplet(m) : '', fonction: m ? (m.fonction || '') : '', date: fr(auj()), signataire: signataire || '' };
      let r = null;
      if (opts && opts.saison) resume.saison = opts.saison;
      if (A.signer) { try { r = await A.signer({ type, typeLib: TYPES_DOC[type], titre, contenu, empreinte: canon(contenu), bureauIds: bs.map(b => b.id), membreId: m ? m.id : null, options: opts || null, resume }); } catch (e) { console.error(e); r = null; } }
      if (!r) return '';
      etat.documents = (Array.isArray(etat.documents) ? etat.documents : []).concat([{ numero: r.numero, code: r.code || '', type, titre, bureauIds: bs.map(b => b.id), membreId: m ? m.id : null, date: auj(), signataire: resume.signataire }]).slice(-300);
      await sauver();
      return '<div class="uas-qrb" data-uas-numero="' + esc(r.numero) + '"><div class="uas-qri">' + (r.qr || '') + '</div><div>Document UASCEP n° <b>' + esc(r.numero) + '</b>'
        + (r.code ? '<br>Code de vérification : <b>' + esc(r.code) + '</b>' : '') + '<br>' + esc(resume.type) + ' — ' + esc(resume.bureau) + (resume.membre ? ' — ' + esc(resume.membre) + (resume.fonction ? ' (' + esc(resume.fonction) + ')' : '') : '')
        + '<br>Édité le ' + esc(resume.date) + (resume.signataire ? ' — signataire : ' + esc(resume.signataire) : '') + '<br>' + esc(r.mention || 'Scannez le code QR pour vérifier l’authenticité du document.') + '</div></div>';
    }
    function lancer(titre, fabriquer) {
      (A.imprimer || imprimerDefaut)(titre, fabriquer, { portrait: true });
    }
    async function corpsDocument(type, b, m) {
      const e = entite(b.niveau, b.entite) || { lib: b.entiteLib }, niv = b.niveau, lib = LIB_NIVEAU[niv] + ' : ' + (e.lib || b.entiteLib);
      const P = parRole(b, 'P'), SG = parRole(b, 'SG'), T = parRole(b, 'T');
      const visa = await sigVisa(niv, b.entite, b);
      const mandat = 'élu le ' + (fr(b.dateElection) || '…………') + ' pour un mandat de ' + (b.duree || DUREE_DEFAUT) + ' an(s), jusqu’au ' + (fr(b.dateFin) || '…………');
      let h2 = '', corps = '', sigs = [], signataire = '';
      if (type === 'COMPOSITION') {
        h2 = 'Composition du bureau UASCEP — ' + lib;
        corps = '<p class="uas-ip">Bureau ' + esc(mandat) + (b.dateInstallation ? ', installé le ' + esc(fr(b.dateInstallation)) : '') + '</p>' + tableMembresDoc(b, true);
        sigs = [sigMembre(SG, b, genre(SG, 'Le Secrétaire général', 'La Secrétaire générale')), sigMembre(T, b, genre(T, 'Le Trésorier général', 'La Trésorière générale')), sigMembre(P, b, genre(P, 'Le Président', 'La Présidente')), visa.html];
        signataire = P ? nomComplet(P) + ' (' + (P.fonction || 'Président') + ')' : '';
      } else if (type === 'PV') {
        h2 = 'Procès-verbal d’élection et d’installation du bureau UASCEP';
        const ms = membresDe(b);
        corps = '<p class="uas-ip">' + esc(lib) + '</p>'
          + '<p class="uas-tx">L’an ' + esc((iso(b.agDate || b.dateElection) || auj()).slice(0, 4)) + ', le ' + esc(fr(b.agDate || b.dateElection) || '…………') + ', s’est tenue' + (b.agLieu ? ' à ' + esc(b.agLieu) : '')
          + ' l’assemblée générale élective de l’Union des associations sportives et culturelles des écoles primaires (UASCEP) — ' + esc(lib) + '.</p>'
          + '<p class="uas-tx">Après le compte rendu de gestion du bureau sortant et l’appel des candidatures, il a été procédé à l’élection des membres du nouveau bureau, '
          + esc(mandat) + '. Le bureau élu, composé de ' + ms.length + ' membre(s), se présente comme suit :</p>' + tableMembresDoc(b, false)
          + '<p class="uas-tx">' + (b.dateInstallation ? 'Le bureau a été officiellement installé dans ses fonctions le ' + esc(fr(b.dateInstallation)) + '.' : 'Le bureau sera installé dans ses fonctions à une date fixée par l’autorité hiérarchique.')
          + (b.pv ? ' Référence du procès-verbal : ' + esc(b.pv) + '.' : '') + (b.observations ? ' Observations : ' + esc(b.observations) + '.' : '')
          + '</p><p class="uas-tx">En foi de quoi le présent procès-verbal est dressé pour servir et valoir ce que de droit.</p>';
        sigs = [sigMembre(SG, b, genre(SG, 'Le Secrétaire général (rapporteur)', 'La Secrétaire générale (rapporteure)')), sigMembre(P, b, genre(P, 'Le Président', 'La Présidente')), visa.html];
        signataire = P ? nomComplet(P) + ' (' + (P.fonction || 'Président') + ')' : '';
      } else if (type === 'ATTESTATION') {
        const sign = (P && m && P.id !== m.id) ? P : (SG && m && SG.id !== m.id ? SG : P);
        const fs = sign ? (sign.fonction || 'Président') : 'Président';
        h2 = 'Attestation de fonction';
        corps = '<p class="uas-tx" style="margin-top:16px">Je soussigné' + (sign && sign.sexe === 'F' ? 'e' : '') + ' <b>' + esc(sign ? nomComplet(sign) : '……………………………') + '</b>, ' + esc(fs) + ' du bureau de l’UASCEP — ' + esc(lib) + ', atteste que '
          + (m.sexe === 'F' ? 'Madame' : m.sexe === 'M' ? 'Monsieur' : 'M./Mme') + ' <b>' + esc(nomComplet(m)) + '</b>' + (m.qualite ? ', ' + esc(m.qualite) : '') + (m.ecole ? ' à ' + esc(m.ecole) : '')
          + ', est membre dudit bureau en qualité de <b>' + esc(m.fonction || 'membre') + '</b>, élu' + (m.sexe === 'F' ? 'e' : '') + ' le ' + esc(fr(m.dateElection || b.dateElection) || '…………')
          + ' pour un mandat de ' + esc(m.duree || b.duree || DUREE_DEFAUT) + ' an(s) prenant fin le ' + esc(fr(m.dateFin || b.dateFin) || '…………') + '.</p>'
          + '<p class="uas-tx">En foi de quoi la présente attestation lui est délivrée pour servir et valoir ce que de droit.</p>';
        sigs = [blocSig('L’intéressé' + (m.sexe === 'F' ? 'e' : '') + ' — ' + (m.fonction || 'membre'), nomComplet(m), m.signature, cachetMembre(m, b)),
          sign ? blocSig(roleDe(sign.fonction) ? labRole(sign, roleDe(sign.fonction)) : genre(sign, 'Le ', 'La ') + fs, nomComplet(sign), sign.signature, cachetMembre(sign, b)) : blocSig('Le Président', '', '', ''), visa.html];
        signataire = sign ? nomComplet(sign) + ' (' + fs + ')' : visa.v.nom;
      }
      const qr = await sceau(type, h2, [b], m, signataire || (visa.v.nom ? visa.v.nom + ' (' + visa.v.titre + ')' : ''));
      return CSS_IMP + CSS_DOC + '<div class="uas-doc">' + enTete(b) + '<h2 class="uas-it">' + esc(h2) + '</h2>' + corps + faitA() + '<div class="uas-sigs">' + sigs.join('') + '</div>' + qr + '</div>';
    }
    function editerDocument(type, b, m) {
      if (!b) { toast && toast('Constituez d’abord le bureau.'); return; }
      if (type === 'ATTESTATION' && !m) { toast && toast('Choisissez le membre.'); return; }
      lancer(TYPES_DOC[type] + ' — ' + (m ? nomComplet(m) : b.entiteLib), () => corpsDocument(type, b, m));
    }
    async function choisirDocument(b) {
      const ms = membresDe(b);
      const sel = h('select', { 'aria-label': 'Membre' }, ms.map(m => h('option', { value: m.id }, nomComplet(m) + (m.fonction ? ' — ' + m.fonction : ''))));
      const COURT = { COMPOSITION: 'Composition du bureau', PV: 'PV d’élection / d’installation', ATTESTATION: 'Attestation de fonction' };
      const bouton = (type, ic) => ({ l: ic + ' ' + COURT[type], v: type, p: true });
      const choix = await dialogue('Documents signés — ' + b.entiteLib, h('div', { class: 'uas-docs' },
        h('p', { class: 'uas-aide', style: 'margin:0' }, 'Chaque document porte les signatures et cachets du président et du secrétaire général (et du trésorier), le visa de l’autorité hiérarchique et un code QR de vérification.'),
        ms.length ? h('div', { class: 'uas-form' }, champ('Membre (pour l’attestation de fonction)', sel, true)) : h('p', { class: 'uas-vide' }, 'Aucun membre : ajoutez d’abord les membres du bureau.')),
      [{ l: 'Fermer', v: null }, bouton('COMPOSITION', '\uE00D'), bouton('PV', '\uE00E')].concat(ms.length ? [bouton('ATTESTATION', '\uE02F')] : []));
      if (!choix) return;
      editerDocument(choix, b, choix === 'ATTESTATION' ? ms.find(m => m.id === sel.value) : null);
    }
    function editerListe(onglet2) {
      const niv = NIVEAUX.some(n => n[0] === onglet2) ? onglet2 : null;
      const bs = etat.bureaux.filter(b => b.statut !== 'archive' && entite(b.niveau, b.entite) && (!niv || (b.niveau === niv && entitesFiltrees(niv).some(e => String(e.cle) === String(b.entite)))))
        .sort((a, b) => (NIVEAUX.findIndex(n => n[0] === a.niveau) - NIVEAUX.findIndex(n => n[0] === b.niveau)) || String(a.entiteLib).localeCompare(String(b.entiteLib), 'fr'));
      if (!bs.length) { toast && toast('Aucun bureau à lister.'); return; }
      const titre = TYPES_DOC.LISTE + (niv ? ' — ' + LIB_NIVEAU[niv] : '');
      lancer(titre, async () => {
        const nomF = (b, r) => { const x = parRole(b, r); return x ? nomComplet(x) : '—'; };
        const tab = '<table class="uas-imp"><thead><tr><th class="n">N°</th><th>Niveau</th><th>Entité</th><th>Président(e)</th><th>Secrétaire général(e)</th><th>Trésorier(ère)</th><th>Membres</th><th>Élu le</th><th>Fin du mandat</th><th>Statut</th></tr></thead><tbody>'
          + bs.map((b, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(LIB_NIVEAU[b.niveau]) + '</td><td>' + esc(b.entiteLib) + '</td><td>' + esc(nomF(b, 'P')) + '</td><td>' + esc(nomF(b, 'SG')) + '</td><td>' + esc(nomF(b, 'T'))
            + '</td><td style="text-align:center">' + membresDe(b).length + '</td><td>' + esc(fr(b.dateElection) || '—') + '</td><td>' + esc(fr(b.dateFin) || '—') + '</td><td>' + esc(statutMandat(b.dateFin)[1]) + '</td></tr>').join('') + '</tbody></table>';
        const nbM = bs.reduce((t, b) => t + membresDe(b).length, 0);
        const au = ctx.autorite || (() => { const n = ['CS', 'ZONE', 'DDEMP', 'UP', 'ECOLE'].find(x => niveaux.some(y => y[0] === x) && entites(x).length === 1); return n ? { niveau: n, cle: entites(n)[0].cle } : null; })();
        const visa = au ? await sigVisa(au.niveau, au.cle, bureauActif(au.niveau, au.cle)) : { html: blocSig('Le Responsable', '', '', ''), v: { nom: '', titre: 'Le Responsable' } };
        const qr = await sceau('LISTE', titre, bs, null, visa.v.nom ? visa.v.nom + ' (' + visa.v.titre + ')' : visa.v.titre);
        return CSS_IMP + CSS_DOC + '<div class="uas-doc">' + enTete(au ? { niveau: au.niveau, entiteLib: (entite(au.niveau, au.cle) || {}).lib || '', logo: (bureauActif(au.niveau, au.cle) || {}).logo } : null) + '<h2 class="uas-it">' + esc(titre) + '</h2><p class="uas-ip">' + bs.length + ' bureau(x) — ' + nbM + ' membre(s) — situation au ' + esc(fr(auj())) + '</p>'
          + tab + faitA() + '<div class="uas-sigs"><div class="uas-sb"></div>' + visa.html + '</div>' + qr + '</div>';
      });
    }

    /* ================= Vie du bureau : activités, engagements, réunions (rapporteur), trésorerie, budget, matériel, rapport de saison ================= */
    const nb = (v) => { const x = +String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'); return isFinite(x) ? x : 0; };
    const fcfa = (v) => Math.round(nb(v)).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' F';
    let saison = memo.get('saison') || saisonCourante();
    function ecolesDe(b) {
      const e = entite(b.niveau, b.entite) || {}, toutes = entites('ECOLE');
      if (b.niveau === 'ECOLE') return [e.lib || b.entiteLib];
      if (b.niveau === 'UP') return toutes.filter(x => norm(x.up) === norm(e.nomUp || e.lib)).map(x => x.lib);
      if (b.niveau === 'ZONE') return toutes.filter(x => String(x.zone) === String(b.entite)).map(x => x.lib);
      return toutes.map(x => x.lib);
    }
    const membreLib = (b, id) => { const m = membresDe(b).find(x => x.id === id); return m ? nomComplet(m) + (m.fonction ? ' (' + m.fonction + ')' : '') : ''; };
    /* Rubriques de chaque registre : k clé, l libellé, t type (text, date, number, select, liste, textarea, membres, ecole, montant), o options,
       total : totalisé, calc : colonne calculée, court : masqué dans le tableau de l'écran */
    const SPEC = {
      activites: { titre: 'Calendrier, compétitions et résultats', onglet: '\uE04C Activités', doc: 'JOURNAL', tri: 'date', champs: [
        { k: 'date', l: 'Date', t: 'date', req: 1 }, { k: 'discipline', l: 'Discipline', t: 'liste', o: DISCIPLINES, req: 1 }, { k: 'categorie', l: 'Catégorie', t: 'liste', o: CATEGORIES },
        { k: 'genre', l: 'Genre', t: 'select', o: ['Garçons', 'Filles', 'Mixte'] }, { k: 'phase', l: 'Phase', t: 'liste', o: ['Éliminatoires', 'Poules', 'Quarts de finale', 'Demi-finales', 'Finale', 'Rencontre amicale', 'Festival / démonstration', 'Compétition culturelle'] },
        { k: 'lieu', l: 'Lieu / site' }, { k: 'ecoles', l: 'Écoles', t: 'number', total: 1 }, { k: 'equipes', l: 'Équipes', t: 'number', total: 1 },
        { k: 'pg', l: 'Participants G', t: 'number', total: 1 }, { k: 'pf', l: 'Participants F', t: 'number', total: 1 }, { k: 'pt', l: 'Total', calc: r => nb(r.pg) + nb(r.pf), total: 1 },
        { k: 'encadreurs', l: 'Encadreurs', t: 'number', total: 1 }, { k: 'resultats', l: 'Résultats / classement', t: 'textarea' }, { k: 'qualifies', l: 'Qualifiés au niveau supérieur', t: 'textarea' },
        { k: 'observations', l: 'Observations', t: 'textarea', court: 1 }] },
      engagements: { titre: 'Fiches d’engagement des équipes', onglet: '\uE00E Engagements', doc: 'ENGAGEMENTS', tri: 'ecole', champs: [
        { k: 'ecole', l: 'École', t: 'ecole', req: 1 }, { k: 'discipline', l: 'Discipline', t: 'liste', o: DISCIPLINES, req: 1 }, { k: 'categorie', l: 'Catégorie', t: 'liste', o: CATEGORIES },
        { k: 'genre', l: 'Genre', t: 'select', o: ['Garçons', 'Filles', 'Mixte'] }, { k: 'equipe', l: 'Nom de l’équipe' }, { k: 'jg', l: 'Joueurs G', t: 'number', total: 1 }, { k: 'jf', l: 'Joueuses F', t: 'number', total: 1 },
        { k: 'jt', l: 'Total', calc: r => nb(r.jg) + nb(r.jf), total: 1 }, { k: 'encadreur', l: 'Encadreur' }, { k: 'contact', l: 'Contact' },
        { k: 'droit', l: 'Droit d’engagement (F)', t: 'montant', total: 1 }, { k: 'paye', l: 'Payé', t: 'select', o: ['Oui', 'Non'] }, { k: 'date', l: 'Date d’engagement', t: 'date', court: 1 }] },
      reunions: { titre: 'Réunions et comptes rendus (rapporteur)', onglet: '\uE010 Réunions', doc: 'CR', tri: 'date', champs: [
        { k: 'date', l: 'Date', t: 'date', req: 1 }, { k: 'heure', l: 'Heure', court: 1 }, { k: 'type', l: 'Nature', t: 'liste', o: ['Réunion ordinaire du bureau', 'Réunion extraordinaire', 'Assemblée générale', 'Réunion technique (commission)', 'Réunion avec les directeurs', 'Réunion de bilan'] },
        { k: 'lieu', l: 'Lieu' }, { k: 'ordre', l: 'Ordre du jour', t: 'textarea' }, { k: 'presents', l: 'Membres présents', t: 'membres' }, { k: 'invites', l: 'Invités / autres participants', t: 'textarea', court: 1 },
        { k: 'deroulement', l: 'Déroulement / échanges', t: 'textarea', court: 1 }, { k: 'decisions', l: 'Décisions', t: 'textarea' }, { k: 'recommandations', l: 'Recommandations', t: 'textarea', court: 1 },
        { k: 'prochaine', l: 'Prochaine réunion', t: 'date', court: 1 }, { k: 'redacteur', l: 'Rapporteur (rédacteur)', t: 'membre', court: 1 }] },
      caisse: { titre: 'Journal de caisse (trésorier)', onglet: '\uE04E Caisse', doc: 'FINANCES', tri: 'date', champs: [
        { k: 'date', l: 'Date', t: 'date', req: 1 }, { k: 'nature', l: 'Nature', t: 'select', o: ['Recette', 'Dépense'], req: 1 }, { k: 'categorie', l: 'Catégorie', t: 'categorie' },
        { k: 'libelle', l: 'Libellé', req: 1 }, { k: 'ecole', l: 'École (cotisation)', t: 'ecole', court: 1 }, { k: 'piece', l: 'Pièce justificative n°' },
        { k: 'recette', l: 'Recette (F)', calc: r => r.nature === 'Recette' ? nb(r.montant) : '', total: 1, f: 1 }, { k: 'depense', l: 'Dépense (F)', calc: r => r.nature === 'Dépense' ? nb(r.montant) : '', total: 1, f: 1 },
        { k: 'solde', l: 'Solde (F)', calc: r => r._solde, f: 1 }, { k: 'montant', l: 'Montant (F)', t: 'montant', req: 1, cache: 1 }] },
      budget: { titre: 'Budget prévisionnel et réalisé', onglet: '\uE016 Budget', doc: 'FINANCES', tri: 'nature', champs: [
        { k: 'nature', l: 'Nature', t: 'select', o: ['Recette', 'Dépense'], req: 1 }, { k: 'categorie', l: 'Catégorie', t: 'categorie', req: 1 }, { k: 'libelle', l: 'Précision' },
        { k: 'prevu', l: 'Prévu (F)', t: 'montant', total: 1 }, { k: 'realise', l: 'Réalisé (F)', calc: r => r._realise, total: 1, f: 1 }, { k: 'ecart', l: 'Écart (F)', calc: r => r._realise - nb(r.prevu), total: 1, f: 1 },
        { k: 'taux', l: 'Taux', calc: r => nb(r.prevu) ? Math.round(r._realise * 100 / nb(r.prevu)) + ' %' : '—' }] },
      materiel: { titre: 'Inventaire du matériel sportif', onglet: '\uE078 Matériel', doc: 'INVENTAIRE', tri: 'designation', champs: [
        { k: 'designation', l: 'Désignation', req: 1 }, { k: 'discipline', l: 'Discipline', t: 'liste', o: DISCIPLINES }, { k: 'quantite', l: 'Quantité', t: 'number', total: 1 },
        { k: 'etat', l: 'État', t: 'select', o: ['Bon', 'Usagé', 'À réparer', 'Hors d’usage'] }, { k: 'origine', l: 'Origine', t: 'liste', o: ['Achat', 'Don', 'Dotation', 'Prêt'] },
        { k: 'date', l: 'Date d’acquisition', t: 'date' }, { k: 'valeur', l: 'Valeur (F)', t: 'montant', total: 1 }, { k: 'detenteur', l: 'Détenteur / lieu de garde' }, { k: 'observations', l: 'Observations', t: 'textarea', court: 1 }] }
    };
    /** Lignes de la saison, triées, avec les colonnes calculées (solde courant, réalisé du budget) */
    function lignesDe(c, b) {
      const sp = SPEC[c], l = etat[c].filter(r => r.bureauId === b.id && r.saison === saison).map(r => Object.assign({}, r, { _src: r }));
      l.sort((x, y) => String(x[sp.tri] || '').localeCompare(String(y[sp.tri] || ''), 'fr') || String(x.cree || '').localeCompare(String(y.cree || '')));
      if (c === 'caisse') { let so = 0; l.forEach(r => { so += (r.nature === 'Dépense' ? -1 : 1) * nb(r.montant); r._solde = so; }); }
      if (c === 'budget') { const ca = etat.caisse.filter(r => r.bureauId === b.id && r.saison === saison); l.forEach(r => { r._realise = ca.filter(x => x.nature === r.nature && x.categorie === r.categorie).reduce((t, x) => t + nb(x.montant), 0); }); }
      return l;
    }
    const valeur = (ch, r, b) => {
      const v = ch.calc ? ch.calc(r) : r[ch.k];
      if (ch.t === 'date') return fr(v);
      if (ch.t === 'membres') return (v || []).map(id => membreLib(b, id)).filter(Boolean).join(', ');
      if (ch.t === 'membre') return membreLib(b, v);
      if ((ch.t === 'montant' || ch.f) && v !== '' && v != null) return fcfa(v);
      return v == null ? '' : v;
    };
    const totaux = (c, l) => SPEC[c].champs.map(ch => ch.total ? l.reduce((t, r) => t + nb(ch.calc ? ch.calc(r) : r[ch.k]), 0) : null);
    function colonnesEcran(c) { return SPEC[c].champs.filter(ch => !ch.cache && !ch.court); }

    function formEnregistrement(c, b, rec) {
      const sp = SPEC[c], d = rec || {}, champs = sp.champs.filter(ch => !ch.calc), f = {};
      const lid = 'uas-l-' + Math.random().toString(36).slice(2, 7);
      const listes = [];
      const corps = h('div', { class: 'uas-form' });
      champs.forEach((ch, i) => {
        let el;
        if (ch.t === 'textarea') el = h('textarea', { rows: '3' }, d[ch.k] || '');
        else if (ch.t === 'select') el = selectListe(ch.o, d[ch.k] || (ch.req ? ch.o[0] : ''), ch.req ? null : '—');
        else if (ch.t === 'membre') el = selectListe(membresDe(b).map(m => [m.id, nomComplet(m) + (m.fonction ? ' — ' + m.fonction : '')]), d[ch.k] || (parRole(b, 'R') || parRole(b, 'SG') || {}).id, '—');
        else if (ch.t === 'membres') {
          const pres = new Set(d[ch.k] || membresDe(b).map(m => m.id));
          el = h('div', { class: 'uas-cases', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:4px 12px;font-weight:400' },
            membresDe(b).map(m => h('label', { style: 'flex-direction:row;gap:6px;align-items:center;font-weight:400' }, h('input', { type: 'checkbox', value: m.id, checked: pres.has(m.id) }), nomComplet(m) + (m.fonction ? ' — ' + m.fonction : ''))));
          if (!membresDe(b).length) el.append(h('span', { class: 'uas-aide' }, 'Aucun membre dans le bureau.'));
        } else {
          const o = ch.t === 'liste' ? ch.o : ch.t === 'ecole' ? ecolesDe(b) : ch.t === 'categorie' ? [] : null;
          el = h('input', { type: ch.t === 'date' ? 'date' : (ch.t === 'number' || ch.t === 'montant') ? 'number' : 'text', value: ch.t === 'date' ? iso(d[ch.k] || (rec ? '' : auj())) : (d[ch.k] == null ? '' : d[ch.k]),
            min: (ch.t === 'number' || ch.t === 'montant') ? '0' : null, step: ch.t === 'montant' ? '5' : null, inputmode: (ch.t === 'number' || ch.t === 'montant') ? 'numeric' : null });
          if (o || ch.t === 'categorie') { const id = lid + i; el.setAttribute('list', id); listes.push(h('datalist', { id, 'data-k': ch.k }, (o || []).map(x => h('option', { value: x })))); }
        }
        f[ch.k] = el;
        corps.append(champ(ch.l + (ch.req ? ' *' : ''), el, ch.t === 'textarea' || ch.t === 'membres'));
      });
      // catégories financières selon la nature (recette / dépense)
      const majCat = () => { const dl = listes.find(x => x.getAttribute('data-k') === 'categorie'); if (dl && f.nature) dl.replaceChildren(...(CAT_FIN[f.nature.value] || []).map(x => h('option', { value: x }))); };
      if (f.nature) { f.nature.addEventListener('change', majCat); majCat(); }
      dialogue((rec ? 'Modifier — ' : 'Ajouter — ') + sp.titre, h('div', {}, h('p', { class: 'uas-sous' }, b.entiteLib + ' — saison ' + saison), listes, corps), [{ l: 'Annuler' }, {
        l: '\uE007 Enregistrer', p: true, action: async () => {
          const v = {};
          for (const ch of champs) {
            const el = f[ch.k];
            if (ch.t === 'membres') v[ch.k] = [...el.querySelectorAll('input:checked')].map(x => x.value);
            else if (ch.t === 'number' || ch.t === 'montant') v[ch.k] = el.value === '' ? '' : nb(el.value);
            else v[ch.k] = String(el.value || '').trim();
            if (ch.req && (v[ch.k] === '' || v[ch.k] == null)) { el.focus && el.focus(); toast && toast('« ' + ch.l + ' » est obligatoire.'); return false; }
          }
          if (rec) Object.assign(rec, v, { maj: auj() }); else etat[c].push(Object.assign({ id: uid(), bureauId: b.id, saison, cree: new Date().toISOString() }, v));
          await sauver(); toast && toast('Enregistré.'); dessiner();
        } }]);
    }
    async function supprimerEnr(c, r) {
      if (!(await confirmer('Supprimer', 'Supprimer cette ligne ?', '\uE005 Supprimer'))) return;
      etat[c] = etat[c].filter(x => x.id !== r.id); await sauver(); dessiner();
    }
    async function reinitialiserColl(c, b) {
      if (!(await confirmer('Réinitialiser', `Vider « ${SPEC[c].titre} » du bureau ${b.entiteLib} pour la saison ${saison} ?`, '\uE058 Réinitialiser'))) return;
      etat[c] = etat[c].filter(x => !(x.bureauId === b.id && x.saison === saison)); await sauver(); toast && toast('Registre réinitialisé.'); dessiner();
    }
    function feuilleDe(c, b) {
      const cols = SPEC[c].champs.filter(ch => !ch.cache), l = lignesDe(c, b), t = totaux(c, l).filter((x, i) => !SPEC[c].champs[i].cache);
      const brut = (ch, r) => { const v = ch.calc ? ch.calc(r) : r[ch.k]; return ch.t === 'date' ? fr(v) : ch.t === 'membres' || ch.t === 'membre' ? valeur(ch, r, b) : (v == null ? '' : v); };
      const lignes = [cols.map(ch => ch.l)].concat(l.map(r => cols.map(ch => brut(ch, r))));
      if (cols.some(ch => ch.total)) lignes.push(cols.map((ch, i) => i === 0 ? 'Total' : (ch.total ? t[i] : '')));
      return { nom: SPEC[c].onglet.replace(/^\S+\s/, '').slice(0, 31), lignes, entete: 0 };
    }
    async function excelColl(cs, b, nom) {
      const blob = await A.xlsxEcrire(cs.map(c => feuilleDe(c, b)));
      A.telecharger(nom + '-' + norm(b.entiteLib).replace(/\s+/g, '-').slice(0, 30) + '-' + saison + '.xlsx', blob);
    }
    function tableColl(c, b, w) {
      const cols = colonnesEcran(c), l = lignesDe(c, b), t = totaux(c, l), tv = SPEC[c].champs.map((ch, i) => [ch, t[i]]).filter(([ch]) => !ch.cache && !ch.court).map(x => x[1]);
      if (!l.length) return h('p', { class: 'uas-vide' }, 'Rien d’enregistré pour la saison ' + saison + '.');
      return h('div', { class: 'uas-tw' }, h('table', { class: 'uas-t', 'data-uas-coll': c }, h('thead', {}, h('tr', {}, cols.map(ch => h('th', {}, ch.l)), h('th', {}, ''))),
        h('tbody', {}, l.map(r => h('tr', {}, cols.map(ch => h('td', { class: ch.t === 'number' || ch.total || ch.f ? 'c' : '' }, String(valeur(ch, r, b)))),
          h('td', { style: 'white-space:nowrap' }, c === 'reunions' ? h('button', { class: 'uas-btn s', type: 'button', title: 'Compte rendu signé (QR)', 'aria-label': 'Compte rendu', onclick: () => editerCR(b, r._src || r) }, '\uE00E') : null, ' ',
            w ? [h('button', { class: 'uas-btn s', type: 'button', title: 'Modifier', 'aria-label': 'Modifier', onclick: () => formEnregistrement(c, b, r._src || r) }, '\uE006'), ' ',
              h('button', { class: 'uas-btn s d', type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer', onclick: () => supprimerEnr(c, r) }, '\uE005')] : null))),
          tv.some(x => x != null) ? h('tr', { class: 'tot' }, cols.map((ch, i) => h('td', { class: 'c' }, i === 0 ? 'Total' : tv[i] == null ? '' : ((ch.t === 'montant' || ch.f) ? fcfa(tv[i]) : String(tv[i])))), h('td', {})) : null)));
    }
    function resumeFinances(b) {
      const ca = etat.caisse.filter(r => r.bureauId === b.id && r.saison === saison);
      const R = ca.filter(r => r.nature === 'Recette').reduce((t, r) => t + nb(r.montant), 0), D = ca.filter(r => r.nature === 'Dépense').reduce((t, r) => t + nb(r.montant), 0);
      return { R, D, S: R - D, ca };
    }
    function vieBureau(b, w) {
      const onglets = Object.keys(SPEC).map(c => [c, SPEC[c].onglet]).concat([['rapport', '\uE030 Rapport de saison']]);
      let so = memo.get('vie') || 'activites'; if (!onglets.some(o => o[0] === so)) so = 'activites';
      const saisons = [...new Set([saisonCourante(), saison].concat(COLLECTIONS.flatMap(c => etat[c].filter(r => r.bureauId === b.id).map(r => r.saison))).filter(Boolean))].sort().reverse();
      const sel = h('select', { 'aria-label': 'Saison', onchange: (e) => { saison = e.target.value; memo.set('saison', saison); dessiner(); } }, saisons.map(x => h('option', { value: x, selected: x === saison }, x)));
      const autre = h('button', { class: 'uas-btn s', type: 'button', onclick: async () => {
        const i = h('input', { value: saison, placeholder: 'AAAA-AAAA' });
        const ok = await dialogue('Autre saison', h('div', { class: 'uas-form' }, champ('Saison (année scolaire)', i, true, 'Exemple : 2025-2026')), [{ l: 'Annuler', v: false }, { l: 'Choisir', p: true, v: true }]);
        if (ok && /^\d{4}-\d{4}$/.test(i.value.trim())) { saison = i.value.trim(); memo.set('saison', saison); dessiner(); }
      } }, 'Autre…');
      const carte = h('div', { class: 'uas-carte', 'data-uas': 'vie-bureau' }, h('h3', {}, 'Vie du bureau — activités sportives et culturelles'),
        h('div', { class: 'uas-barre' }, h('label', {}, 'Saison', sel), autre),
        h('div', { class: 'uas-onglets', role: 'tablist' }, onglets.map(([c, l]) => h('button', { class: 'uas-onglet' + (so === c ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': so === c ? 'true' : 'false', 'data-uas-vie': c,
          onclick: () => { memo.set('vie', c); dessiner(); } }, l))));
      if (so === 'rapport') { carte.append(vueRapport(b, w)); return carte; }
      const sp = SPEC[so];
      const resume = so === 'caisse' || so === 'budget' ? (() => { const x = resumeFinances(b); return h('div', { class: 'uas-info', style: 'margin:4px 0 8px' }, h('span', {}, h('b', {}, 'Recettes : '), fcfa(x.R)), h('span', {}, h('b', {}, 'Dépenses : '), fcfa(x.D)), h('span', {}, h('b', {}, 'Solde : '), fcfa(x.S))); })() : null;
      carte.append(...[h('p', { class: 'uas-sous', style: 'margin:4px 0' }, sp.titre), resume,
        h('div', { class: 'uas-actions' },
          w ? h('button', { class: 'uas-btn p', type: 'button', 'data-uas': 'ajouter-' + so, onclick: () => formEnregistrement(so, b) }, '\uE001 Ajouter') : null,
          w ? h('button', { class: 'uas-btn d', type: 'button', onclick: () => reinitialiserColl(so, b) }, '\uE058 Réinitialiser') : null,
          h('button', { class: 'uas-btn', type: 'button', onclick: () => excelColl(so === 'budget' || so === 'caisse' ? ['caisse', 'budget'] : [so], b, so) }, '\uE015 Excel'),
          w && sp.doc !== 'CR' ? h('button', { class: 'uas-btn', type: 'button', 'data-uas': 'pdf-' + so, onclick: () => editerRegistre(sp.doc, b) }, '\uE008 PDF signé (QR)') : null,
          so === 'reunions' ? h('span', { class: 'uas-aide', style: 'align-self:center' }, '\uE00E sur une ligne : compte rendu signé (rapporteur, président) avec QR.') : null),
        tableColl(so, b, w)].filter(Boolean));
      if (so === 'caisse') carte.append(cotisationsEcoles(b));
      return carte;
    }
    function cotisationsEcoles(b) {
      const ca = etat.caisse.filter(r => r.bureauId === b.id && r.saison === saison && r.nature === 'Recette' && /cotisation/i.test(r.categorie || ''));
      const parE = {}; ca.forEach(r => { const k = r.ecole || '(école non précisée)'; parE[k] = (parE[k] || 0) + nb(r.montant); });
      const ecs = ecolesDe(b), lignes = [...new Set(ecs.concat(Object.keys(parE)))];
      if (b.niveau === 'ECOLE' || !lignes.length) return h('div');
      return h('details', { style: 'margin-top:10px' }, h('summary', {}, 'Cotisations par école (' + Object.keys(parE).length + ' / ' + ecs.length + ' écoles ont cotisé)'),
        h('div', { class: 'uas-tw' }, h('table', { class: 'uas-t' }, h('thead', {}, h('tr', {}, h('th', {}, 'École'), h('th', {}, 'Cotisation versée'))),
          h('tbody', {}, lignes.map(e => h('tr', {}, h('td', {}, e), h('td', { class: 'c' }, parE[e] ? fcfa(parE[e]) : '—'))),
            h('tr', { class: 'tot' }, h('td', {}, 'Total'), h('td', { class: 'c' }, fcfa(ca.reduce((t, r) => t + nb(r.montant), 0))))))));
    }

    /* ---------- rapport de fin de saison ---------- */
    const SECTIONS_RAPPORT = [['introduction', 'Introduction et contexte'], ['organisation', 'Organisation de la saison (commissions, calendrier, sites)'], ['deroulement', 'Déroulement des activités'],
      ['distinctions', 'Résultats et distinctions'], ['difficultes', 'Difficultés rencontrées'], ['recommandations', 'Recommandations'], ['perspectives', 'Perspectives pour la saison prochaine'],
      ['conclusion', 'Conclusion'], ['annexes', 'Annexes (pièces jointes, observations)']];
    const rapportDe = (b) => etat.rapports.find(r => r.bureauId === b.id && r.saison === saison);
    function statsSaison(b) {
      const ac = lignesDe('activites', b), en = lignesDe('engagements', b);
      const disc = {};
      const src = en.length ? en.map(r => ({ d: r.discipline, e: 1, g: nb(r.jg), f: nb(r.jf), ec: r.ecole })) : ac.map(r => ({ d: r.discipline, e: nb(r.equipes), g: nb(r.pg), f: nb(r.pf) }));
      src.forEach(x => { const k = x.d || '(non précisée)'; disc[k] = disc[k] || { e: 0, g: 0, f: 0, ec: new Set() }; disc[k].e += x.e; disc[k].g += x.g; disc[k].f += x.f; if (x.ec) disc[k].ec.add(x.ec); });
      const G = src.reduce((t, x) => t + x.g, 0), F = src.reduce((t, x) => t + x.f, 0);
      const ecolesPart = en.length ? new Set(en.map(r => r.ecole).filter(Boolean)).size : ac.reduce((m, r) => Math.max(m, nb(r.ecoles)), 0);
      const enc = en.length ? new Set(en.map(r => r.encadreur).filter(Boolean)).size || ac.reduce((t, r) => t + nb(r.encadreurs), 0) : ac.reduce((t, r) => t + nb(r.encadreurs), 0);
      const dates = ac.map(r => iso(r.date)).filter(Boolean).sort(), sites = [...new Set(ac.map(r => r.lieu).filter(Boolean))];
      return { ac, en, disc, G, F, T: G + F, ecolesPart, ecolesTot: ecolesDe(b).length, equipes: src.reduce((t, x) => t + x.e, 0), enc, debut: dates[0], fin: dates[dates.length - 1], sites,
        disciplines: Object.keys(disc).filter(k => k !== '(non précisée)'), reunions: lignesDe('reunions', b) };
    }
    /** Brouillon de chaque rubrique, rédigé à partir des données de la saison (modifiable) */
    function brouillon(k, b) {
      const st = statsSaison(b), lib = LIB_NIVEAU[b.niveau] + ' : ' + b.entiteLib, f = resumeFinances(b);
      const resp = membresDe(b).filter(m => /^responsable/i.test(m.fonction || ''));
      switch (k) {
        case 'introduction': return `Le présent rapport rend compte des activités sportives et culturelles conduites par le bureau de l'UASCEP — ${lib} au cours de la saison ${saison}. `
          + `Il s'inscrit dans le cadre de la promotion du sport scolaire et des activités culturelles à l'école primaire, de l'éducation à la citoyenneté et de la détection des jeunes talents, conformément aux orientations du Ministère des Enseignements Maternel et Primaire.`;
        case 'organisation': return `Le bureau, ${b.dateElection ? 'élu le ' + fr(b.dateElection) + ', ' : ''}compte ${membresDe(b).length} membre(s)`
          + (resp.length ? ` ; les commissions techniques ont été animées par ${resp.map(m => nomComplet(m) + ' (' + m.fonction.toLowerCase() + ')').join(', ')}` : '') + '. '
          + (st.debut ? `Les activités se sont déroulées du ${fr(st.debut)} au ${fr(st.fin)}` + (st.sites.length ? ` sur ${st.sites.length > 1 ? 'les sites de ' : 'le site de '}${st.sites.join(', ')}` : '') + '. ' : '')
          + (st.reunions.length ? `Le bureau a tenu ${st.reunions.length} réunion(s) de préparation et de suivi.` : '');
        case 'deroulement': return st.ac.length ? `${st.ac.length} rencontre(s) ou manifestation(s) ont été organisées${st.disciplines.length ? ' dans les disciplines suivantes : ' + st.disciplines.join(', ') : ''}. `
          + `Elles ont mobilisé ${st.T} élève(s) (${st.G} garçon(s) et ${st.F} fille(s))${st.ecolesPart ? ', issus de ' + st.ecolesPart + ' école(s)' + (st.ecolesTot > 1 ? ' sur ' + st.ecolesTot : '') : ''}, et ${st.enc} encadreur(s). Les rencontres se sont déroulées dans un bon esprit sportif.` : '';
        case 'distinctions': { const r = st.ac.filter(x => x.resultats || x.qualifies); return r.map(x => `${x.discipline || ''}${x.categorie ? ' ' + x.categorie : ''}${x.genre ? ' (' + x.genre + ')' : ''} : ${[x.resultats, x.qualifies ? 'qualifiés : ' + x.qualifies : ''].filter(Boolean).join(' — ')}`).join('\n'); }
        case 'difficultes': return 'Insuffisance du matériel sportif et des aires de jeu aménagées ; difficultés de transport des équipes ; faible mobilisation des ressources financières ; ' + (st.F < st.G ? 'participation des filles encore en deçà de celle des garçons.' : 'disponibilité limitée des encadreurs.');
        case 'recommandations': return 'Renforcer la dotation en matériel sportif des écoles ; inscrire les cotisations des écoles au budget dès la rentrée ; former les encadreurs à l’arbitrage et à l’animation sportive ; encourager la participation des filles ; associer davantage les parents d’élèves et les autorités locales.';
        case 'perspectives': return `Pour la saison prochaine, le bureau envisage d'élargir les compétitions à de nouvelles disciplines, d'établir le calendrier dès le premier trimestre et de rechercher des partenaires.` + (f.S > 0 ? ` Le solde de ${fcfa(f.S)} sera reporté sur la saison prochaine.` : '');
        case 'conclusion': return `La saison ${saison} a permis aux élèves de pratiquer le sport et les activités culturelles dans un cadre organisé. Le bureau remercie les directeurs, les enseignants, les parents d'élèves, les partenaires et les autorités pour leur accompagnement.`;
        default: return '';
      }
    }
    function vueRapport(b, w) {
      const r = rapportDe(b), st = statsSaison(b), f = resumeFinances(b);
      const box = h('div', {});
      box.append(h('p', { class: 'uas-sous', style: 'margin:4px 0' }, 'Rapport de fin de saison sportive : page de garde, contexte, organisation, activités, participation, résultats, bilan financier, difficultés, recommandations, conclusion et annexes, signé par le rapporteur, le secrétaire général, le trésorier, le président et visé par l’autorité hiérarchique.'),
        h('div', { class: 'uas-info', style: 'margin:4px 0 8px' }, h('span', {}, h('b', {}, 'Activités : '), st.ac.length), h('span', {}, h('b', {}, 'Équipes : '), st.equipes),
          h('span', {}, h('b', {}, 'Élèves : '), st.T + ' (G ' + st.G + ' / F ' + st.F + ')'), h('span', {}, h('b', {}, 'Écoles : '), st.ecolesPart + (st.ecolesTot ? ' / ' + st.ecolesTot : '')),
          h('span', {}, h('b', {}, 'Solde : '), fcfa(f.S)), h('span', {}, h('b', {}, 'Rapport : '), r ? 'rédigé' + (r.maj ? ' (mis à jour le ' + fr(r.maj) + ')' : '') : 'à rédiger')),
        h('div', { class: 'uas-actions' },
          w ? h('button', { class: 'uas-btn p', type: 'button', 'data-uas': 'rediger-rapport', onclick: () => formRapport(b) }, r ? '\uE006 Modifier le rapport' : '\uE001 Rédiger le rapport') : null,
          w && r ? h('button', { class: 'uas-btn d', type: 'button', onclick: async () => { if (!(await confirmer('Réinitialiser le rapport', 'Effacer le rapport de la saison ' + saison + ' ?', '\uE058 Réinitialiser'))) return; etat.rapports = etat.rapports.filter(x => x !== r); await sauver(); dessiner(); } }, '\uE058 Réinitialiser') : null,
          h('button', { class: 'uas-btn', type: 'button', onclick: () => excelColl(['activites', 'engagements', 'reunions', 'caisse', 'budget', 'materiel'], b, 'rapport-saison') }, '\uE015 Excel (tableaux)'),
          w ? h('button', { class: 'uas-btn p', type: 'button', 'data-uas': 'pdf-rapport', onclick: () => editerRapport(b) }, '\uE008 Rapport PDF signé (QR)') : null));
      if (r) box.append(h('div', { class: 'uas-rapport', style: 'max-height:320px' }, SECTIONS_RAPPORT.map(([k, l]) => r[k] ? h('div', { style: 'margin-bottom:6px' }, h('b', {}, l + ' : '), String(r[k]).slice(0, 260) + (String(r[k]).length > 260 ? '…' : '')) : null)));
      return box;
    }
    function formRapport(b) {
      const r = rapportDe(b) || {}, f = {};
      const red = selectListe(membresDe(b).map(m => [m.id, nomComplet(m) + (m.fonction ? ' — ' + m.fonction : '')]), r.rapporteur || (parRole(b, 'R') || parRole(b, 'SG') || {}).id, '—');
      const date = h('input', { type: 'date', value: iso(r.date) || auj() }), lieu = h('input', { value: r.lieu || ctx.lieu || '' });
      const corps = h('div', { class: 'uas-form' }, champ('Rapporteur (rédacteur)', red), champ('Date du rapport', date), champ('Lieu', lieu));
      SECTIONS_RAPPORT.forEach(([k, l]) => {
        f[k] = h('textarea', { rows: k === 'annexes' ? '2' : '4', 'data-k': k }, r[k] != null ? r[k] : brouillon(k, b));
        const prop = h('button', { class: 'uas-btn s', type: 'button', onclick: () => { f[k].value = brouillon(k, b); } }, '\uE03D Proposer un texte');
        corps.append(h('label', { class: 'large' }, h('span', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap' }, l, prop), f[k]));
      });
      corps.append(h('p', { class: 'uas-aide large', style: 'grid-column:1/-1' }, 'Les tableaux (bureau, activités, participation, résultats, bilan financier, engagements, matériel, réunions) sont repris d’eux-mêmes des registres de la saison.'));
      dialogue('Rapport de fin de saison — ' + b.entiteLib + ' — ' + saison, corps, [{ l: 'Annuler' }, { l: '\uE007 Enregistrer', p: true, action: async () => {
        const v = { rapporteur: red.value, date: date.value, lieu: lieu.value.trim() }; SECTIONS_RAPPORT.forEach(([k]) => { v[k] = f[k].value.trim(); });
        const ex = rapportDe(b);
        if (ex) Object.assign(ex, v, { maj: auj() }); else etat.rapports.push(Object.assign({ id: uid(), bureauId: b.id, saison, cree: new Date().toISOString(), maj: auj() }, v));
        await sauver(); toast && toast('Rapport enregistré.'); dessiner();
      } }]);
    }

    /* ---------- pièces signées de la vie du bureau ---------- */
    const CSS_RAP = '<style>.uas-garde{min-height:205mm;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always;break-after:page;text-align:center;font:11pt Arial,sans-serif}'
      + '.uas-garde h1{font:bold 20pt Arial,sans-serif;margin:40px 0 10px;text-transform:uppercase;color:#1F4E79}.uas-garde .uas-g2{font:bold 14pt Arial,sans-serif;margin:6px 0}.uas-garde .uas-g3{font:12pt Arial,sans-serif;margin:4px 0}'
      + '.uas-doc h3.uas-s{font:bold 11.5pt Arial,sans-serif;margin:16px 0 6px;color:#1F4E79;border-bottom:1px solid #1F4E79;padding-bottom:2px;break-after:avoid;page-break-after:avoid}'
      + '.uas-doc h4.uas-s{font:bold 10.5pt Arial,sans-serif;margin:10px 0 4px}.uas-doc .uas-pre{white-space:pre-wrap}.uas-doc table.uas-imp{margin:4px 0 8px}</style>';
    const texte = (t) => t ? '<p class="uas-tx uas-pre">' + esc(t) + '</p>' : '<p class="uas-tx"><i>Néant.</i></p>';
    function tableRegistre(c, b, opts) {
      opts = opts || {};
      const cols = SPEC[c].champs.filter(ch => !ch.cache && (opts.tout || !ch.court)), l = opts.lignes || lignesDe(c, b);
      const t = totaux(c, l), tv = SPEC[c].champs.map((ch, i) => [ch, t[i]]).filter(([ch]) => !ch.cache && (opts.tout || !ch.court)).map(x => x[1]);
      if (!l.length) return '<p class="uas-tx"><i>Néant.</i></p>';
      return '<table class="uas-imp"><thead><tr><th class="n">N°</th>' + cols.map(ch => '<th>' + esc(ch.l) + '</th>').join('') + '</tr></thead><tbody>'
        + l.map((r, i) => '<tr><td>' + (i + 1) + '</td>' + cols.map(ch => '<td>' + esc(valeur(ch, r, b)) + '</td>').join('') + '</tr>').join('')
        + (tv.some(x => x != null) ? '<tr><td></td>' + cols.map((ch, i) => '<td><b>' + (i === 0 ? 'Total' : tv[i] == null ? '' : esc((ch.t === 'montant' || ch.f) ? fcfa(tv[i]) : tv[i])) + '</b></td>').join('') + '</tr>' : '') + '</tbody></table>';
    }
    function tableauFinancier(b) {
      const f = resumeFinances(b), parCat = (n) => { const o = {}; f.ca.filter(r => r.nature === n).forEach(r => { const k = r.categorie || 'Divers'; o[k] = (o[k] || 0) + nb(r.montant); }); return o; };
      const R = parCat('Recette'), D = parCat('Dépense'), lr = Object.keys(R), ld = Object.keys(D), n = Math.max(lr.length, ld.length, 1);
      let t = '<table class="uas-imp"><thead><tr><th>Recettes</th><th style="width:18%">Montant</th><th>Dépenses</th><th style="width:18%">Montant</th></tr></thead><tbody>';
      for (let i = 0; i < n; i++) t += '<tr><td>' + esc(lr[i] || '') + '</td><td>' + (lr[i] ? fcfa(R[lr[i]]) : '') + '</td><td>' + esc(ld[i] || '') + '</td><td>' + (ld[i] ? fcfa(D[ld[i]]) : '') + '</td></tr>';
      t += '<tr><td><b>Total des recettes</b></td><td><b>' + fcfa(f.R) + '</b></td><td><b>Total des dépenses</b></td><td><b>' + fcfa(f.D) + '</b></td></tr>'
        + '<tr><td colspan="3"><b>Solde de fin de saison (recettes − dépenses)</b></td><td><b>' + fcfa(f.S) + '</b></td></tr></tbody></table>';
      return t;
    }
    function tableParticipation(b) {
      const st = statsSaison(b);
      return '<table class="uas-imp"><thead><tr><th>Indicateur</th><th style="width:20%">Valeur</th></tr></thead><tbody>'
        + [['Écoles de l’entité', st.ecolesTot || '—'], ['Écoles participantes', st.ecolesPart], ['Taux de participation des écoles', st.ecolesTot ? Math.round(st.ecolesPart * 100 / st.ecolesTot) + ' %' : '—'],
          ['Équipes engagées', st.equipes], ['Élèves participants — garçons', st.G], ['Élèves participants — filles', st.F], ['Élèves participants — total', st.T],
          ['Part des filles', st.T ? Math.round(st.F * 100 / st.T) + ' %' : '—'], ['Encadreurs', st.enc], ['Rencontres et manifestations', st.ac.length], ['Réunions du bureau', st.reunions.length]]
          .map(([a, v]) => '<tr><td>' + esc(a) + '</td><td>' + esc(v) + '</td></tr>').join('') + '</tbody></table>'
        + '<table class="uas-imp"><thead><tr><th>Discipline</th><th>Équipes</th><th>Écoles</th><th>G</th><th>F</th><th>Total</th></tr></thead><tbody>'
        + (Object.keys(st.disc).length ? Object.entries(st.disc).map(([k, x]) => '<tr><td>' + esc(k) + '</td><td>' + x.e + '</td><td>' + (x.ec.size || '—') + '</td><td>' + x.g + '</td><td>' + x.f + '</td><td>' + (x.g + x.f) + '</td></tr>').join('') : '<tr><td colspan="6">Néant.</td></tr>')
        + '<tr><td><b>Total</b></td><td><b>' + st.equipes + '</b></td><td></td><td><b>' + st.G + '</b></td><td><b>' + st.F + '</b></td><td><b>' + st.T + '</b></td></tr></tbody></table>';
    }
    const labRole = (m, r) => ({ P: genre(m, 'Le Président', 'La Présidente'), SG: genre(m, 'Le Secrétaire général', 'La Secrétaire générale'), T: genre(m, 'Le Trésorier général', 'La Trésorière générale'),
      R: genre(m, 'Le Rapporteur', 'La Rapporteure'), CC: 'Vu — le Commissaire aux comptes' }[r]);
    const sigRole = (b, r) => { const m = parRole(b, r); return sigMembre(m, b, labRole(m, r)); };
    const sigRapporteur = (b, id) => { const m = membresDe(b).find(x => x.id === id) || parRole(b, 'R') || parRole(b, 'SG'); return sigMembre(m, b, m && roleDe(m.fonction) === 'R' ? labRole(m, 'R') : 'Le Rapporteur (rédacteur)'); };
    const nomSig = (m, r) => m ? nomComplet(m) + ' (' + (m.fonction || labRole(m, r)) + ')' : '';
    function pied(corps, sigs, qr) { return CSS_IMP + CSS_DOC + CSS_RAP + '<div class="uas-doc">' + corps + '<div class="uas-sigs">' + sigs.join('') + '</div>' + qr + '</div>'; }
    function editerRegistre(type, b) {
      const titre = TYPES_DOC[type] + ' — ' + b.entiteLib + ' — saison ' + saison, lib = LIB_NIVEAU[b.niveau] + ' : ' + b.entiteLib;
      lancer(titre, async () => {
        const entete = enTete(b) + '<h2 class="uas-it">' + esc(TYPES_DOC[type]) + '</h2><p class="uas-ip">Bureau UASCEP — ' + esc(lib) + ' — saison ' + esc(saison) + '</p>';
        let corps = '', sigs = [], signataire = '';
        const P = parRole(b, 'P');
        if (type === 'JOURNAL') {
          corps = tableRegistre('activites', b, { tout: false }) + '<h3 class="uas-s">Résultats détaillés</h3>' + texte(lignesDe('activites', b).filter(x => x.resultats || x.qualifies).map(x => (fr(x.date) + ' — ' + (x.discipline || '') + ' ' + (x.categorie || '') + ' : ' + [x.resultats, x.qualifies ? 'qualifiés : ' + x.qualifies : ''].filter(Boolean).join(' — '))).join('\n'));
          sigs = [sigRapporteur(b), sigRole(b, 'P')]; signataire = nomSig(parRole(b, 'R') || parRole(b, 'SG'), 'R');
        } else if (type === 'ENGAGEMENTS') {
          corps = tableRegistre('engagements', b, { tout: true }) + '<p class="uas-tx">Les équipes ci-dessus sont régulièrement engagées dans les compétitions de la saison ' + esc(saison) + '. Les directeurs certifient que les joueurs sont des élèves régulièrement inscrits dans leur école.</p>';
          sigs = [sigRole(b, 'SG'), sigRole(b, 'P')]; signataire = nomSig(parRole(b, 'SG'), 'SG');
        } else if (type === 'FINANCES') {
          corps = '<h3 class="uas-s">1. Situation financière</h3>' + tableauFinancier(b) + '<h3 class="uas-s">2. Budget prévisionnel et réalisé</h3>' + tableRegistre('budget', b, { tout: true })
            + '<h3 class="uas-s">3. Journal de caisse</h3>' + tableRegistre('caisse', b, { tout: true })
            + '<p class="uas-tx">Arrêté le présent état à la somme de ' + esc(fcfa(resumeFinances(b).S)) + ' en solde, au ' + esc(fr(auj())) + '.</p>';
          sigs = [sigRole(b, 'T'), sigRole(b, 'P')]; if (parRole(b, 'CC')) sigs.push(sigRole(b, 'CC'));
          signataire = nomSig(parRole(b, 'T'), 'T');
        } else if (type === 'INVENTAIRE') {
          corps = tableRegistre('materiel', b, { tout: true });
          sigs = [sigRole(b, 'T'), sigRole(b, 'P')]; signataire = nomSig(parRole(b, 'T'), 'T');
        }
        if (!signataire) signataire = nomSig(P, 'P');
        const qr = await sceau(type, TYPES_DOC[type], [b], null, signataire, { saison });
        return pied(entete + corps + faitA(), sigs, qr);
      });
    }
    function editerCR(b, r) {
      lancer('Compte rendu — ' + b.entiteLib + ' — ' + fr(r.date), async () => {
        const lib = LIB_NIVEAU[b.niveau] + ' : ' + b.entiteLib, pres = new Set(r.presents || []);
        const ms = membresDe(b), presents = ms.filter(m => pres.has(m.id)), absents = ms.filter(m => !pres.has(m.id));
        const liste = (l) => l.length ? l.map(m => esc(nomComplet(m)) + (m.fonction ? ' (' + esc(m.fonction) + ')' : '')).join(' ; ') : 'néant';
        const corps = enTete(b) + '<h2 class="uas-it">' + esc(TYPES_DOC.CR) + '</h2><p class="uas-ip">' + esc(r.type || 'Réunion du bureau') + ' — Bureau UASCEP — ' + esc(lib) + '</p>'
          + '<p class="uas-tx">L’an ' + esc((iso(r.date) || auj()).slice(0, 4)) + ', le ' + esc(fr(r.date)) + (r.heure ? ' à ' + esc(r.heure) : '') + (r.lieu ? ', à ' + esc(r.lieu) : '') + ', s’est tenue ' + esc((r.type || 'une réunion du bureau').toLowerCase().replace(/^réunion/, 'la réunion'))
          + ' du bureau de l’UASCEP — ' + esc(lib) + ', sous la présidence de ' + esc(parRole(b, 'P') ? nomComplet(parRole(b, 'P')) : '……………') + '.</p>'
          + '<p class="uas-tx"><b>Présents (' + presents.length + ') :</b> ' + liste(presents) + '<br><b>Absents (' + absents.length + ') :</b> ' + liste(absents) + (r.invites ? '<br><b>Invités :</b> ' + esc(r.invites) : '') + '</p>'
          + '<h3 class="uas-s">Ordre du jour</h3>' + texte(r.ordre) + '<h3 class="uas-s">Déroulement</h3>' + texte(r.deroulement) + '<h3 class="uas-s">Décisions</h3>' + texte(r.decisions)
          + '<h3 class="uas-s">Recommandations</h3>' + texte(r.recommandations)
          + '<p class="uas-tx">' + (r.prochaine ? 'La prochaine réunion est fixée au ' + esc(fr(r.prochaine)) + '. ' : '') + 'L’ordre du jour étant épuisé, la séance a été levée.</p>' + faitA();
        const red = ms.find(m => m.id === r.redacteur) || parRole(b, 'R') || parRole(b, 'SG');
        const qr = await sceau('CR', TYPES_DOC.CR, [b], null, nomSig(red, 'R') || nomSig(parRole(b, 'P'), 'P'), { saison, ref: r.id });
        return pied(corps, [sigRapporteur(b, r.redacteur), sigRole(b, 'P')], qr);
      });
    }
    function editerRapport(b) {
      const r = rapportDe(b) || {};
      lancer(TYPES_DOC.RAPPORT + ' — ' + b.entiteLib + ' — ' + saison, async () => {
        const lib = LIB_NIVEAU[b.niveau] + ' : ' + b.entiteLib, st = statsSaison(b), sec = (k) => texte(r[k] != null ? r[k] : brouillon(k, b));
        const visa = await sigVisa(b.niveau, b.entite, b);
        const garde = '<div class="uas-garde"><div>' + enTete() + '</div><div><div class="uas-gl">' + logoBureau(b, 170) + '</div><p class="uas-g3">Union des associations sportives et culturelles des écoles primaires (UASCEP)</p>'
          + '<p class="uas-g2">Bureau — ' + esc(lib) + '</p><h1>Rapport des activités sportives et culturelles</h1><p class="uas-g2">Saison ' + esc(saison) + '</p>'
          + '<p class="uas-g3">' + st.ac.length + ' activité(s) — ' + st.T + ' élève(s) participant(s) — ' + st.ecolesPart + ' école(s)</p></div>'
          + '<div><p class="uas-g3">Rédigé par : ' + esc((membresDe(b).find(x => x.id === r.rapporteur) && nomComplet(membresDe(b).find(x => x.id === r.rapporteur))) || (parRole(b, 'R') ? nomComplet(parRole(b, 'R')) : '……………')) + ', rapporteur</p>'
          + '<p class="uas-g3">' + esc(r.lieu || ctx.lieu || '') + (r.lieu || ctx.lieu ? ', ' : '') + esc(fr(r.date) || fr(auj())) + '</p></div></div>';
        const corps = garde + '<h2 class="uas-it">Rapport de fin de saison sportive ' + esc(saison) + '</h2><p class="uas-ip">Bureau UASCEP — ' + esc(lib) + '</p>'
          + '<h3 class="uas-s">I. Introduction et contexte</h3>' + sec('introduction')
          + '<h3 class="uas-s">II. Organisation de la saison</h3>' + sec('organisation') + '<h4 class="uas-s">Composition du bureau</h4>' + tableMembresDoc(b, false)
          + '<h3 class="uas-s">III. Activités réalisées</h3>' + tableRegistre('activites', b) + sec('deroulement')
          + '<h3 class="uas-s">IV. Participation</h3>' + tableParticipation(b)
          + '<h3 class="uas-s">V. Résultats et distinctions</h3>' + sec('distinctions')
          + '<h3 class="uas-s">VI. Bilan financier</h3>' + tableauFinancier(b) + (lignesDe('budget', b).length ? '<h4 class="uas-s">Budget prévisionnel et réalisé</h4>' + tableRegistre('budget', b, { tout: true }) : '')
          + '<div class="uas-sigs" style="justify-content:flex-end"><div class="uas-sb" style="flex:0 1 240px"></div>' + sigRole(b, 'T').replace('class="uas-sb"', 'class="uas-sb" style="flex:0 1 260px"') + '</div>'
          + '<h3 class="uas-s">VII. Difficultés rencontrées</h3>' + sec('difficultes')
          + '<h3 class="uas-s">VIII. Recommandations et perspectives</h3>' + sec('recommandations') + sec('perspectives')
          + '<h3 class="uas-s">IX. Conclusion</h3>' + sec('conclusion')
          + '<h3 class="uas-s">Annexes</h3><h4 class="uas-s">A. Engagements des équipes</h4>' + tableRegistre('engagements', b) + '<h4 class="uas-s">B. Réunions tenues</h4>' + tableRegistre('reunions', b)
          + '<h4 class="uas-s">C. Inventaire du matériel</h4>' + tableRegistre('materiel', b) + (r.annexes ? '<h4 class="uas-s">D. Autres pièces</h4>' + texte(r.annexes) : '')
          + '<p style="text-align:right;margin:14px 0 0">Fait à ' + esc(r.lieu || ctx.lieu || '……………………') + ', le ' + esc(fr(r.date) || fr(auj())) + '</p>';
        const red = membresDe(b).find(x => x.id === r.rapporteur) || parRole(b, 'R') || parRole(b, 'SG');
        const qr = await sceau('RAPPORT', TYPES_DOC.RAPPORT + ' ' + saison, [b], null, nomSig(red, 'R') || nomSig(parRole(b, 'P'), 'P'), { saison });
        return pied(corps, [sigRapporteur(b, r.rapporteur), sigRole(b, 'SG'), sigRole(b, 'T'), sigRole(b, 'P'), visa.html], qr);
      });
    }

    /* ---------- Excel ---------- */
    async function exporterTout() {
      const bs = etat.bureaux.filter(b => b.statut !== 'archive' && entite(b.niveau, b.entite));
      const blob = await A.xlsxEcrire(versLignes(etat, bs));
      A.telecharger('bureaux-uascep-' + auj() + '.xlsx', blob);
    }
    async function importer() {
      const inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', style: 'display:none' });
      document.body.append(inp);
      inp.addEventListener('change', async () => {
        const fichier = inp.files && inp.files[0]; inp.remove(); if (!fichier) return;
        let feuilles;
        try { feuilles = await A.xlsxLire(fichier); } catch (e) { toast && toast('Fichier illisible : ' + (e.message || e)); return; }
        let lignesM = null, lignesB = null;
        feuilles.forEach(f => { const o = objets(f.lignes || []); if (!o) return; const k = Object.keys(o[0] || {}); if (k.includes('nom') || k.includes('prenoms')) lignesM = lignesM || o; else lignesB = lignesB || o; });
        if (!lignesM && !lignesB) { toast && toast('Colonnes « Niveau », « Entité », « Nom » introuvables.'); return; }
        const rejets = [], stats = { ajoutes: 0, maj: 0, bureaux: 0 };
        const trouverEntite = (niv, lib) => entites(niv).find(e => norm(e.lib) === norm(lib) || norm(e.cle) === norm(lib) || (e.alias || []).some(a => norm(a) === norm(lib)));
        const tmp = JSON.parse(JSON.stringify(etat));
        const actifTmp = (niv, cle) => tmp.bureaux.find(b => b.niveau === niv && String(b.entite) === String(cle) && b.statut !== 'archive');
        const assurerTmp = (niv, e) => { let b = actifTmp(niv, e.cle); if (!b) { b = { id: uid(), niveau: niv, entite: String(e.cle), entiteLib: e.lib, duree: DUREE_DEFAUT, statut: 'actif', creeLe: auj() }; tmp.bureaux.push(b); stats.bureaux++; } return b; };
        (lignesB || []).forEach(o => {
          const niv = niveauDe(o.niveau), e = niv && trouverEntite(niv, o.entite);
          if (!niv || !e) { rejets.push(`Bureaux, ligne ${o._ligne} : niveau ou entité inconnu (« ${o.niveau} » / « ${o.entite} »)`); return; }
          if (!peut(niv, e.cle)) { rejets.push(`Bureaux, ligne ${o._ligne} : « ${e.lib} » hors de votre périmètre`); return; }
          const b = assurerTmp(niv, e);
          Object.assign(b, { dateElection: iso(o['date d election']) || b.dateElection || '', duree: +String(o['duree du mandat ans'] || '').replace(',', '.') || b.duree || DUREE_DEFAUT,
            dateFin: iso(o['date de fin de mandat']) || b.dateFin || '', dateInstallation: iso(o['date d installation']) || b.dateInstallation || '',
            agDate: iso(o['date de l assemblee generale']) || b.agDate || '', agLieu: o['lieu de l assemblee generale'] || b.agLieu || '', pv: o.pv || b.pv || '', observations: o.observations || b.observations || '' });
          if (!b.dateFin && b.dateElection) b.dateFin = plusAns(b.dateElection, b.duree);
        });
        (lignesM || []).forEach(o => {
          const niv = niveauDe(o.niveau), e = niv && trouverEntite(niv, o.entite);
          if (!niv || !e) { rejets.push(`Membres, ligne ${o._ligne} : niveau ou entité inconnu (« ${o.niveau} » / « ${o.entite} »)`); return; }
          if (!o.nom) { rejets.push(`Membres, ligne ${o._ligne} : nom manquant`); return; }
          if (!peut(niv, e.cle)) { rejets.push(`Membres, ligne ${o._ligne} : « ${e.lib} » hors de votre périmètre`); return; }
          const b = assurerTmp(niv, e);
          const sx = /^f/i.test(o.sexe || '') ? 'F' : /^(m|h|g)/i.test(o.sexe || '') ? 'M' : '';
          const duree = +String(o['duree du mandat ans'] || '').replace(',', '.') || b.duree || DUREE_DEFAUT, el = iso(o['date d election']) || b.dateElection || '';
          const v = { ordre: +o['n d ordre'] || '', nom: String(o.nom).toUpperCase(), prenoms: o.prenoms || '', sexe: sx, ecole: o.ecole || e.ecole || '', up: o.up || e.up || '',
            zone: o['zone pedagogique'] || '', rup: o['nom du rup'] || e.rup || '', fonction: o.fonction || '', qualite: o.qualite || '', contact: o.contact || '', email: o['e mail'] || o.email || '',
            dateElection: el, duree, dateFin: iso(o['date de fin de mandat']) || plusAns(el, duree), dateInstallation: iso(o['date d installation']) || '', observations: o.observations || '' };
          const ex = tmp.membres.find(m => m.bureauId === b.id && norm(m.nom) === norm(v.nom) && norm(m.prenoms) === norm(v.prenoms));
          if (ex) { Object.assign(ex, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined))); stats.maj++; }
          else { if (!v.ordre) v.ordre = tmp.membres.filter(m => m.bureauId === b.id).reduce((x, y) => Math.max(x, +y.ordre || 0), 0) + 1; tmp.membres.push(Object.assign({ id: uid(), bureauId: b.id, cree: auj() }, v)); stats.ajoutes++; }
          if (!b.dateElection && v.dateElection) { b.dateElection = v.dateElection; b.duree = v.duree; b.dateFin = v.dateFin; }
        });
        const ok = await dialogue('Importer des bureaux UASCEP', h('div', {},
          h('p', {}, `${stats.ajoutes} membre(s) à ajouter, ${stats.maj} à mettre à jour, ${stats.bureaux} bureau(x) à créer.`),
          rejets.length ? [h('p', {}, h('b', {}, rejets.length + ' ligne(s) refusée(s) :')), h('div', { class: 'uas-rapport' }, rejets.map(r => h('div', {}, r)))] : null),
        [{ l: 'Annuler', v: false }, { l: '\uE00B Importer', p: true, v: true }]);
        if (!ok) return;
        etat = tmp; await sauver(); toast && toast('Import terminé.'); dessiner();
      });
      inp.click();
    }

    dessiner();
    return { rafraichir: async () => { ctx = await A.contexte(); dessiner(); }, etat: () => etat };
  }

  global.UASCEP = { monter, NIVEAUX, FONCTIONS, QUALITES, COLONNES_MEMBRES, COLONNES_BUREAUX, versLignes, objets, statutMandat, iso, fr, plusAns, niveauDe,
    TYPES_DOC, VISA_DEFAUT, COULEURS_CACHET, logoSvg, logoBureau, texteLogo, LOGO_COULEURS, DEFINITION, DISCIPLINES, CATEGORIES, CAT_FIN, COLLECTIONS, saisonCourante, canon, contenuDocument, cachetSvg, roleDe, padSignature, lireImage };
})(typeof window !== 'undefined' ? window : globalThis);
