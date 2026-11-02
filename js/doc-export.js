/* République du Bénin — MEMP — Téléchargement des documents en PDF et en Word, et impression (toutes les applications web).
   Tout document que l'application imprime (window.print, fenêtre d'impression) passe par ici : on propose
   « Télécharger en PDF », « Télécharger en Word (modifiable) » et « Imprimer ». Sur Android, la vue web n'imprime pas
   et n'enregistre pas toute seule : le PDF et le Word sont des fichiers ordinaires (enregistrés dans Téléchargements
   par le pont de l'application), et l'impression passe par le service d'impression d'Android.
   Le PDF reprend exactement la mise en page de l'impression (styles « @media print », sauts de page, filigrane,
   numéros de page) : chaque page est dessinée puis assemblée dans un fichier PDF. Le Word reprend titres, paragraphes,
   gras / italique, tableaux, listes, images et sauts de page, pour être modifié dans Word, WPS ou Google Docs.
   Aucune bibliothèque externe. API : DocExport.prochain(mode, nom), DocExport.telecharger(mode, titre, html),
   DocExport.choisir(titre, html), DocExport.pdf / docx (instantané) → Blob.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.DocExport) return;
  const W0 = global;
  const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  const PX_MM = 96 / 25.4;
  const ech = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const xml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  const attendre = (ms) => new Promise(r => setTimeout(r, ms));
  function nomFichier(t, ext) {
    const s = String(t || 'document').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._ -]+/g, ' ')
      .replace(/\s+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'document';
    return s + '.' + ext;
  }
  function telechargerBlob(blob, nom, doc) {
    doc = doc || document;
    const u = URL.createObjectURL(blob);
    const a = doc.createElement('a'); a.href = u; a.download = nom; a.style.display = 'none'; a.rel = 'noopener';
    (doc.body || doc.documentElement).append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 60000);
  }

  /* ------------------------------------------------------------------ styles : « @media print » rendu ordinaire */
  function longueurPx(v, defaut) {
    const m = /^(-?[\d.]+)\s*(mm|cm|in|pt|px|pc)?$/.exec(String(v || '').trim());
    if (!m) return defaut;
    const n = parseFloat(m[1]), u = m[2] || 'px';
    return n * ({ mm: PX_MM, cm: PX_MM * 10, in: 96, pt: 96 / 72, pc: 16, px: 1 }[u]);
  }
  function margesDe(style, base) {
    const out = Object.assign({}, base);
    const m = (style.getPropertyValue('margin') || '').trim();
    if (m) {
      const p = m.split(/\s+/).map(x => longueurPx(x, null));
      if (p.every(x => x !== null)) {
        const [t, r = t, b = t, l = r] = p; Object.assign(out, { t, r, b, l });
      }
    }
    for (const [k, c] of [['t', 'margin-top'], ['r', 'margin-right'], ['b', 'margin-bottom'], ['l', 'margin-left']]) {
      const v = longueurPx(style.getPropertyValue(c), null); if (v !== null && style.getPropertyValue(c)) out[k] = v;
    }
    return out;
  }
  function estImpression(media) {
    const t = String(media || '').toLowerCase();
    if (!t || t === 'all') return 'tous';
    if (/\bnot\s+print\b/.test(t) || (/\bscreen\b/.test(t) && !/\bprint\b/.test(t))) return 'non';
    if (/\bprint\b/.test(t)) return 'oui';
    return 'autre';
  }
  /** Feuilles de style → texte CSS où les règles d'impression deviennent ordinaires ; mise en page (@page). */
  function cssImpression(feuilles, ecranSeul) {
    const page = { w: 210 * PX_MM, h: 297 * PX_MM, marges: { t: 12 * PX_MM, r: 12 * PX_MM, b: 12 * PX_MM, l: 12 * PX_MM }, gauche: null, droite: null, numeros: false };
    const out = [];
    const regles = (liste, dansImpression) => {
      for (const r of liste) {
        try {
          if (r.type === 4) {               // @media
            const k = estImpression(r.media && r.media.mediaText);
            if (k === 'non') continue;
            if (k === 'oui') { if (!ecranSeul || ecranSeul(r)) regles(r.cssRules, true); continue; }
            out.push('@media ' + r.media.mediaText + '{'); regles(r.cssRules, dansImpression); out.push('}');
          } else if (r.type === 3) {        // @import
            const k = estImpression(r.media && r.media.mediaText);
            if (k !== 'non' && r.styleSheet) regles(r.styleSheet.cssRules, dansImpression || k === 'oui');
          } else if (r.type === 6) {        // @page
            const sel = (r.selectorText || '').trim();
            const taille = (r.style.getPropertyValue('size') || '').toLowerCase();
            if (/landscape/.test(taille)) { page.w = 297 * PX_MM; page.h = 210 * PX_MM; }
            else if (/portrait|a4/.test(taille)) { page.w = 210 * PX_MM; page.h = 297 * PX_MM; }
            if (/counter\(page/.test(r.cssText)) page.numeros = true;
            if (sel === ':left') page.gauche = margesDe(r.style, page.marges);
            else if (sel === ':right') page.droite = margesDe(r.style, page.marges);
            else if (!sel || sel === ':first') { if (!sel) page.marges = margesDe(r.style, page.marges); }
          } else if (r.type === 12) {       // @supports
            out.push('@supports ' + r.conditionText + '{'); regles(r.cssRules, dansImpression); out.push('}');
          } else {
            out.push(r.cssText);
          }
        } catch (e) { /* règle illisible : ignorée */ }
      }
    };
    for (const f of feuilles) {
      try {
        const k = estImpression(f.media && f.media.mediaText);
        if (k === 'non' || f.disabled) continue;
        if (ecranSeul && f.__docDuDocument && k === 'oui') continue;
        if (f.cssRules) { if (ecranSeul) ecranSeul.f = f; regles(f.cssRules, k === 'oui'); }
      } catch (e) { /* feuille d'un autre site (polices) : ignorée */ }
    }
    return { css: out.join('\n'), page };
  }

  /* ------------------------------------------------------------------ instantané du document à imprimer */
  const IGNORER = 'script,noscript,template,iframe,style,link[rel~="stylesheet"],[data-doc-export-ignore],.de-voile';
  function instantaneDocument(doc, titre) {
    const racine = doc.documentElement;
    const clone = racine.cloneNode(true);
    // dessins (graphiques, QR) : image fixe ; champs : valeur affichée
    const vrais = [...racine.querySelectorAll('canvas')], copies = [...clone.querySelectorAll('canvas')];
    copies.forEach((c, i) => {
      try { const img = doc.createElement('img'); img.src = vrais[i].toDataURL('image/png'); img.setAttribute('style', c.getAttribute('style') || '');
        img.width = vrais[i].clientWidth || vrais[i].width; img.className = c.className; c.replaceWith(img); } catch (e) { c.remove(); }
    });
    const vchamps = [...racine.querySelectorAll('input,textarea,select')], cchamps = [...clone.querySelectorAll('input,textarea,select')];
    cchamps.forEach((c, i) => {
      const v = vchamps[i]; if (!v) return;
      if (c.tagName === 'TEXTAREA') c.textContent = v.value;
      else if (c.tagName === 'SELECT') [...c.options].forEach((o, j) => { if (v.options[j] && v.options[j].selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
      else if (/checkbox|radio/i.test(c.type)) { if (v.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
      else c.setAttribute('value', v.value);
    });
    clone.querySelectorAll(IGNORER).forEach(n => n.remove());
    const body = clone.querySelector('body');
    const { css, page } = cssImpression([...doc.styleSheets]);
    const attrs = [...racine.attributes].map(a => a.name + '="' + ech(a.value) + '"').join(' ');
    return { titre: titre || titreDe(body) || doc.title || 'Document', attrs, corps: body ? body.outerHTML : '<body></body>', css, page, base: doc.baseURI };
  }
  /** Fragment HTML (module Pédagogie, listes) : styles du document + ceux du fragment. */
  function instantaneHtml(html, titre, doc, seul) {
    doc = doc || document;
    const d = new DOMParser().parseFromString('<!doctype html><html><head></head><body>' + html + '</body></html>', 'text/html');
    const feuilles = seul ? [] : [...doc.styleSheets];
    feuilles.forEach(f => { try { f.__docDuDocument = true; } catch (e) { /* rien */ } });
    d.querySelectorAll('style').forEach(s => {
      try { const f = new CSSStyleSheet(); f.replaceSync(s.textContent.replace(/@import[^;]+;/g, '')); feuilles.push(f); } catch (e) { /* ignoré */ }
      s.remove();
    });
    d.querySelectorAll('script,iframe,object,embed').forEach(n => n.remove());
    // styles du document : version écran seulement (ses règles d'impression masquent tout sauf sa propre zone d'impression) ;
    // styles du fragment : règles d'impression appliquées
    const filtre = function (r) { return !(filtre.f && filtre.f.__docDuDocument); };
    const r0 = cssImpression(feuilles, filtre);
    const css = (seul ? 'html{-webkit-text-size-adjust:100%}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111}img{max-width:100%}table{border-collapse:collapse}svg{overflow:visible}\n' : '') + r0.css, page = r0.page;
    const cls = (doc.body && doc.body.className || '').replace(/\b[\w-]*imprime\b/g, '');
    return { titre: titre || titreDe(d.body) || 'Document', attrs: 'lang="fr"', corps: '<body class="' + ech(cls) + ' de-fragment">' + d.body.innerHTML + '</body>', css, page, base: doc.baseURI };
  }
  function titreDe(el) {
    if (!el) return '';
    const h = el.querySelector && el.querySelector('h1,h2');
    return h ? h.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : '';
  }
  function htmlComplet(s, extra) {
    return '<!doctype html><html ' + s.attrs + '><head><meta charset="utf-8"><base href="' + ech(s.base || '') + '"><title>' + ech(s.titre) + '</title><style>' + s.css + '</style>'
      + '<style>html,body{background:#fff!important}' + (extra || '') + '</style></head>' + s.corps + '</html>';
  }

  /* ------------------------------------------------------------------ rendu dans un cadre caché */
  const cacheDonnees = new Map();
  async function enDonnees(url, base) {
    if (!url || /^data:/i.test(url)) return url;
    let abs; try { abs = new URL(url, base).href; } catch (e) { return url; }
    if (cacheDonnees.has(abs)) return cacheDonnees.get(abs);
    const p = (async () => {
      try {
        const r = await fetch(abs); if (!r.ok) return '';
        const b = await r.blob();
        return await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ok(''); f.readAsDataURL(b); });
      } catch (e) { return ''; }
    })();
    cacheDonnees.set(abs, p); return p;
  }
  async function cssEnDonnees(css, base) {
    const urls = [...new Set([...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map(m => m[2]).filter(u => !/^(data:|#)/i.test(u)))];
    for (const u of urls) {
      const d = await enDonnees(u, base);
      css = css.split(u).join(d || 'about:blank');
    }
    return css;
  }
  async function cadre(s, largeur, extraCss) {
    const ifr = document.createElement('iframe');
    ifr.setAttribute('data-doc-export-ignore', '');
    ifr.setAttribute('aria-hidden', 'true');
    ifr.style.cssText = 'position:fixed;left:-30000px;top:0;width:' + Math.round(largeur) + 'px;height:400px;border:0;visibility:hidden;pointer-events:none';
    const s2 = Object.assign({}, s, { css: await cssEnDonnees(s.css, s.base) });
    document.body.append(ifr);
    await new Promise(ok => { ifr.onload = ok; ifr.srcdoc = htmlComplet(s2, 'body{margin:0!important;padding:0!important;width:' + Math.round(largeur) + 'px!important;min-width:0!important;max-width:none!important}'
      + '*{animation:none!important;transition:none!important}' + (extraCss || '')); });
    const d = ifr.contentDocument;
    for (const img of d.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (src && !/^data:/i.test(src)) { const v = await enDonnees(src, s.base); if (v) img.setAttribute('src', v); else img.remove(); }
      img.removeAttribute('srcset'); img.removeAttribute('loading');
    }
    for (const el of d.querySelectorAll('image')) {   // images dans les SVG
      const src = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (src && !/^data:/i.test(src)) { const v = await enDonnees(src, s.base); if (v) { el.setAttribute('href', v); el.removeAttribute('xlink:href'); } }
    }
    try { await d.fonts.ready; } catch (e) { /* sans importance */ }
    await Promise.all([...d.images].map(i => i.decode ? i.decode().catch(() => null) : null));
    await attendre(30);
    return ifr;
  }

  /* ------------------------------------------------------------------ pagination */
  function rect(el, d) {
    const r = el.getBoundingClientRect(), y = d.defaultView.scrollY || 0;
    return { haut: r.top + y, bas: r.bottom + y, h: r.height };
  }
  function coupes(d, hauteurPage) {
    // bas du contenu réel (pas de dernière page vide pour quelques pixels de marge)
    let fond = 0;
    for (const el of d.body.querySelectorAll('*')) {
      const cs = d.defaultView.getComputedStyle(el);
      if (cs.display === 'none' || cs.position === 'fixed' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect(); if (r.height <= 0 || r.width <= 0) continue;
      const plein = /^(IMG|SVG|CANVAS|HR|TD|TH|INPUT|TEXTAREA|SELECT)$/i.test(el.tagName) || [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())
        || parseFloat(cs.borderBottomWidth) > 0 || (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor));
      if (plein) fond = Math.max(fond, r.bottom + (d.defaultView.scrollY || 0));
    }
    const total = Math.min(Math.max(d.documentElement.scrollHeight, d.body.scrollHeight), Math.ceil(fond) + 4) || 1;
    const forcees = [], molles = new Set([total]), eviter = [];
    const els = d.body.querySelectorAll('*');
    for (const el of els) {
      const cs = d.defaultView.getComputedStyle(el);
      if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'absolute') continue;
      const r = rect(el, d);
      const bb = cs.breakBefore || cs.pageBreakBefore, ba = cs.breakAfter || cs.pageBreakAfter;
      if (/page|always|left|right|recto|verso/.test(bb) && r.haut > 1) forcees.push(r.haut);   // même un saut vide (hauteur nulle)
      if (/page|always|left|right|recto|verso/.test(ba)) forcees.push(r.bas);
      if (r.h <= 0) continue;
      if (/avoid/.test(cs.breakInside || '') || /avoid/.test(cs.pageBreakInside || '') || el.tagName === 'TR' || el.tagName === 'IMG' || el.tagName === 'svg'
        || /^H[1-6]$/.test(el.tagName)) {
        // une ligne de tableau très haute peut se couper (entre ses paragraphes ou ses lignes) plutôt que de laisser une page à moitié vide
        if (r.h < hauteurPage * (el.tagName === 'TR' ? 0.4 : 0.95)) eviter.push([r.haut, r.bas]);
      }
      if (/^(block|list-item|table|table-row|flex|grid|table-row-group|flow-root)$/.test(cs.display) || el.tagName === 'BR') {
        molles.add(Math.round(r.haut)); molles.add(Math.round(r.bas));
      }
      // lignes de texte d'un paragraphe long : on peut couper entre deux lignes
      if (/^(P|LI|TD|DD|DIV)$/.test(el.tagName) && r.h > hauteurPage * 0.25 && !el.querySelector('p,div,table,li,tr')) {
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 || 18;
        for (let y = r.haut + lh; y < r.bas; y += lh) molles.add(Math.round(y));
      }
    }
    // un titre ne reste pas seul en bas de page : il descend avec ce qui suit
    const titres = [...d.body.querySelectorAll('h1,h2,h3,h4')].map(h => rect(h, d));
    // en-têtes de tableau (thead) : répétés en haut de la page suivante quand le tableau continue
    const tetes = [...d.body.querySelectorAll('table')].map(t => {
      const th = t.tHead; if (!th || d.defaultView.getComputedStyle(th).display !== 'table-header-group') return null;
      const rt = rect(t, d), rh = rect(th, d); if (rh.h <= 0 || rh.h > hauteurPage * 0.3) return null;
      return { haut: rt.haut, bas: rt.bas, ta: rh.haut, tb: rh.bas };
    }).filter(Boolean);
    const teteA = (y) => { let m = null; for (const t of tetes) if (y > t.tb + 1 && y < t.bas - 1 && (!m || t.haut >= m.haut)) m = t; return m; };
    forcees.sort((a, b) => a - b);
    const cands = [...molles].sort((a, b) => a - b);
    const dedans = (y) => eviter.some(([a, b]) => y > a + 1 && y < b - 1);
    const apresTitre = (y) => titres.some(t => y >= t.bas - 1 && y <= t.bas + 24);
    const res = []; let s = 0, tete = null;
    while (s < total - 2) {
      const ht = tete ? tete.tb - tete.ta : 0;
      const lim = s + hauteurPage - ht;
      const pousser = (b) => { const x = [s, b]; x.tete = tete ? [tete.ta, tete.tb] : null; res.push(x); };
      const f = forcees.find(y => y > s + 2 && y <= lim);
      if (f !== undefined) { pousser(f); s = f; tete = teteA(s); continue; }
      if (lim >= total) { pousser(total); break; }
      let c = null;
      for (let i = cands.length - 1; i >= 0; i--) {
        const y = cands[i]; if (y > lim) continue; if (y <= s + hauteurPage * 0.35) break;
        if (!dedans(y) && !apresTitre(y)) { c = y; break; }
      }
      if (c === null) for (let i = cands.length - 1; i >= 0; i--) { const y = cands[i]; if (y > lim) continue; if (y <= s + hauteurPage * 0.2) break; if (!dedans(y)) { c = y; break; } }
      if (c === null) c = lim;
      pousser(c); s = c; tete = teteA(s);
    }
    return res.filter(([a, b]) => b - a > 1);
  }

  /* ------------------------------------------------------------------ dessin des pages */
  function svgDe(d, largeur, hauteur, decalage) {
    const x = new XMLSerializer().serializeToString(d.documentElement);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + largeur + '" height="' + hauteur + '"><foreignObject x="0" y="' + (-decalage) + '" width="' + largeur + '" height="' + (hauteur + decalage) + '">' + x + '</foreignObject></svg>';
  }
  function image(svg) {
    return new Promise((ok, ko) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('dessin impossible'));
      i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  async function pagesPdf(s, rapport) {
    const P = s.page, M = P.marges;
    const largeur = Math.max(200, Math.min(P.w - M.l - M.r, P.gauche ? P.w - P.gauche.l - P.gauche.r : 1e9, P.droite ? P.w - P.droite.l - P.droite.r : 1e9)), hauteur = Math.max(200, P.h - M.t - M.b);
    const ifr = await cadre(s, largeur);
    try {
      const d = ifr.contentDocument, win = ifr.contentWindow;
      // éléments « fixes » (filigrane, pied) : répétés sur chaque page
      const fixes = [...d.body.querySelectorAll('*')].filter(el => win.getComputedStyle(el).position === 'fixed');
      fixes.forEach(el => el.classList.add('de-fixe'));
      const st = d.createElement('style'); st.textContent = '.de-fixe{display:none!important}'; d.head.append(st);
      ifr.style.height = Math.ceil(hauteur) + 'px';
      await attendre(20);
      const parts = coupes(d, hauteur);
      const total = Math.max(d.documentElement.scrollHeight, d.body.scrollHeight);
      const k = Math.min(2, Math.max(1.4, (global.devicePixelRatio || 1) * 1.2));
      // calque des éléments fixes
      let calque = null;
      if (fixes.length) {
        st.textContent = 'html,body{height:' + Math.ceil(hauteur) + 'px!important;overflow:hidden!important;position:relative!important;background:transparent!important}'
          + 'body *{visibility:hidden!important}.de-fixe,.de-fixe *{visibility:visible!important}.de-fixe{position:absolute!important}'
          + '.de-anc{position:static!important;transform:none!important;filter:none!important;contain:none!important}';
        fixes.forEach(el => { for (let a = el.parentElement; a && a !== d.body; a = a.parentElement) a.classList.add('de-anc'); });
        try { calque = await image(svgDe(d, largeur, hauteur, 0)); } catch (e) { calque = null; }
        st.textContent = '.de-fixe{display:none!important}';
        d.querySelectorAll('.de-anc').forEach(a => a.classList.remove('de-anc'));
      }
      const pages = [];
      for (let i = 0; i < parts.length; i++) {
        const [a, b] = parts[i];
        if (rapport) rapport(i + 1, parts.length);
        const img = await image(svgDe(d, largeur, Math.ceil(b - a), a));
        const tete = parts[i].tete, ht = tete ? Math.ceil(tete[1] - tete[0]) : 0;
        const imgT = tete ? await image(svgDe(d, largeur, ht, tete[0])) : null;
        const cv = document.createElement('canvas');
        cv.width = Math.round(P.w * k); cv.height = Math.round(P.h * k);
        const g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
        const mg = (P.gauche && P.droite) ? ((i % 2) ? P.gauche : P.droite) : M;   // page 1 = recto (droite)
        g.save(); g.scale(k, k);
        if (imgT) g.drawImage(imgT, mg.l, M.t);
        g.beginPath(); g.rect(mg.l, M.t + ht, largeur, Math.ceil(b - a)); g.clip();
        g.drawImage(img, mg.l, M.t + ht);
        g.restore();
        if (calque) { g.save(); g.scale(k, k); g.drawImage(calque, mg.l, M.t); g.restore(); }
        if (P.numeros && parts.length > 1) {
          g.save(); g.scale(k, k); g.fillStyle = '#667085'; g.font = '9pt Arial, sans-serif'; g.textAlign = 'center';
          g.fillText('Page ' + (i + 1) + ' / ' + parts.length, P.w / 2, P.h - Math.min(M.b, 15 * PX_MM) / 2 + 4); g.restore();
        }
        pages.push({ jpeg: cv.toDataURL('image/jpeg', 0.86), lpx: cv.width, hpx: cv.height });
        cv.width = cv.height = 1;
        await attendre(0);
      }
      if (!pages.length) pages.push(await pageBlanche(P, k));
      return { pages, wpt: P.w * 72 / 96, hpt: P.h * 72 / 96, total };
    } finally { ifr.remove(); }
  }
  async function pageBlanche(P, k) {
    const cv = document.createElement('canvas'); cv.width = Math.round(P.w * k); cv.height = Math.round(P.h * k);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    return { jpeg: cv.toDataURL('image/jpeg', 0.86), lpx: cv.width, hpx: cv.height };
  }

  /* ------------------------------------------------------------------ fichier PDF (pages JPEG) */
  function octetsB64(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function chainePdf(t) {   // texte PDF en UTF-16BE (titre avec accents)
    let h = 'FEFF'; for (const ch of String(t)) { const c = ch.codePointAt(0); if (c > 0xFFFF) { const v = c - 0x10000; h += ((0xD800 + (v >> 10)).toString(16).padStart(4, '0') + (0xDC00 + (v & 0x3FF)).toString(16).padStart(4, '0')); } else h += c.toString(16).padStart(4, '0'); }
    return '<' + h.toUpperCase() + '>';
  }
  function fichierPdf(r, titre) {
    const enc = new TextEncoder(), morceaux = [], decal = []; let n = 0;
    const ecrire = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; morceaux.push(b); n += b.length; };
    const obj = (id, corps) => { decal[id] = n; ecrire(id + ' 0 obj\n'); if (Array.isArray(corps)) corps.forEach(ecrire); else ecrire(corps); ecrire('\nendobj\n'); };
    ecrire('%PDF-1.4\n'); ecrire(new Uint8Array([37, 226, 227, 207, 211, 10]));
    const np = r.pages.length, kids = [];
    for (let i = 0; i < np; i++) kids.push((4 + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Count ' + np + ' /Kids [' + kids.join(' ') + '] >>');
    const d = new Date(), p2 = (x) => String(x).padStart(2, '0');
    obj(3, '<< /Title ' + chainePdf(titre) + ' /Producer ' + chainePdf('Applications MEMP — Conception : Maître Aimé FACHOLA') + ' /CreationDate (D:' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + ') >>');
    r.pages.forEach((p, i) => {
      const id = 4 + i * 3, w = r.wpt.toFixed(2), h = r.hpt.toFixed(2);
      const jpg = octetsB64(p.jpeg.slice(p.jpeg.indexOf(',') + 1));
      const flux = 'q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q';
      obj(id, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /Im0 ' + (id + 2) + ' 0 R >> >> /Contents ' + (id + 1) + ' 0 R >>');
      obj(id + 1, ['<< /Length ' + flux.length + ' >>\nstream\n', flux, '\nendstream']);
      obj(id + 2, ['<< /Type /XObject /Subtype /Image /Width ' + p.lpx + ' /Height ' + p.hpx + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n', jpg, '\nendstream']);
    });
    const total = 4 + np * 3, xr = n;
    let t = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (let i = 1; i < total; i++) t += String(decal[i]).padStart(10, '0') + ' 00000 n \n';
    t += 'trailer\n<< /Size ' + total + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xr + '\n%%EOF\n';
    ecrire(t);
    return new Blob(morceaux, { type: MIME.pdf });
  }
  async function pdf(s, rapport) { return fichierPdf(await pagesPdf(s, rapport), s.titre); }

  /* ------------------------------------------------------------------ fichier Word (.docx) */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(fichiers) {   // méthode « stockée » : lisible par Word, WPS, LibreOffice, Google Docs
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    for (const [nom, contenu] of fichiers) {
      const n = enc.encode(nom), data = typeof contenu === 'string' ? enc.encode(contenu) : contenu, c = crc32(data);
      const loc = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0)]);
      parts.push(loc, n, data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), n);
      off += loc.length + n.length + data.length;
    }
    const tc = central.reduce((s, x) => s + x.length, 0);
    const fin = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(fichiers.length), ...u16(fichiers.length), ...u32(tc), ...u32(off), ...u16(0)]);
    return new Blob([...parts, ...central, fin], { type: MIME.docx });
  }
  function couleur(c) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c || '');
    if (!m || (m[4] !== undefined && parseFloat(m[4]) < 0.15)) return null;
    return [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function police(f) {
    const p = String(f || '').split(',').map(x => x.trim().replace(/^["']|["']$/g, ''));
    const g = p.find(x => !/^(serif|sans-serif|monospace|system-ui|-apple-system|ui-[\w-]+|cursive)$/i.test(x));
    if (g) return /liberation serif|^times$/i.test(g) ? 'Times New Roman' : g;
    return /serif/i.test(p[0] || '') && !/sans/i.test(p[0]) ? 'Times New Roman' : 'Arial';
  }
  function Word(d, base) {
    const win = d.defaultView, medias = []; let idImg = 1;
    const cs = (el) => win.getComputedStyle(el);
    const visible = (el) => { const c = cs(el); return c.display !== 'none' && c.visibility !== 'hidden' && c.position !== 'fixed'; };
    const BLOC = /^(block|list-item|table|flex|grid|flow-root|table-row-group|table-header-group|table-footer-group|table-caption)$/;
    function rPr(c) {
      const o = [];
      const f = police(c.fontFamily); o.push('<w:rFonts w:ascii="' + xml(f) + '" w:hAnsi="' + xml(f) + '" w:cs="' + xml(f) + '"/>');
      if (parseInt(c.fontWeight, 10) >= 600 || c.fontWeight === 'bold') o.push('<w:b/>');
      if (c.fontStyle === 'italic') o.push('<w:i/>');
      const col = couleur(c.color); if (col && col !== '000000') o.push('<w:color w:val="' + col + '"/>');
      const sz = Math.round(parseFloat(c.fontSize) * 0.75 * 2); if (sz) o.push('<w:sz w:val="' + Math.min(144, Math.max(8, sz)) + '"/>');
      if (/underline/.test(c.textDecorationLine || c.textDecoration)) o.push('<w:u w:val="single"/>');
      const fond = couleur(c.backgroundColor); if (fond && fond !== 'FFFFFF') o.push('<w:shd w:val="clear" w:color="auto" w:fill="' + fond + '"/>');
      return '<w:rPr>' + o.join('') + '</w:rPr>';
    }
    function texte(t, c) {
      if (!t) return '';
      const s = c.textTransform === 'uppercase' ? t.toUpperCase() : t;
      return '<w:r>' + rPr(c) + '<w:t xml:space="preserve">' + xml(s) + '</w:t></w:r>';
    }
    async function imageRun(el, wpx, hpx) {
      let src = '';
      try {
        if (el.tagName.toLowerCase() === 'svg') {
          const sx = new XMLSerializer().serializeToString(el);
          const i = await image(sx.includes('xmlns=') ? sx : sx.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
          const cv = document.createElement('canvas'); const k = 2; cv.width = Math.max(1, Math.round(wpx * k)); cv.height = Math.max(1, Math.round(hpx * k));
          cv.getContext('2d').drawImage(i, 0, 0, cv.width, cv.height); src = cv.toDataURL('image/png');
        } else src = el.getAttribute('src') || '';
        if (/^data:image\/svg/i.test(src)) {
          const i = await image(decodeURIComponent(src.slice(src.indexOf(',') + 1)).replace(/^base64,/, ''));
          const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(wpx * 2)); cv.height = Math.max(1, Math.round(hpx * 2));
          cv.getContext('2d').drawImage(i, 0, 0, cv.width, cv.height); src = cv.toDataURL('image/png');
        }
      } catch (e) { return ''; }
      const m = /^data:image\/(png|jpe?g|gif);base64,(.*)$/i.exec(src); if (!m) return '';
      const ext = m[1].toLowerCase().replace('jpeg', 'jpg'), id = idImg++, nom = 'image' + id + '.' + ext;
      medias.push([nom, octetsB64(m[2]), ext]);
      const cx = Math.round(Math.min(wpx, 680) * 9525), cy = Math.round(hpx * (Math.min(wpx, 680) / (wpx || 1)) * 9525);
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="Image ' + id + '"/>'
        + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + nom + '"/><pic:cNvPicPr/></pic:nvPicPr>'
        + '<pic:blipFill><a:blip r:embed="rIdImg' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }
    function pPr(c, extra) {
      extra = extra || {};
      const o = [];
      if (extra.style) o.push('<w:pStyle w:val="' + extra.style + '"/>');
      if (extra.garder) o.push('<w:keepNext/>');
      if (extra.saut) o.push('<w:pageBreakBefore/>');
      const fond = couleur(c.backgroundColor); if (fond && fond !== 'FFFFFF' && !extra.cellule) o.push('<w:shd w:val="clear" w:color="auto" w:fill="' + fond + '"/>');
      const av = Math.min(400, Math.round((parseFloat(c.marginTop) || 0) * 15)), ap = Math.min(400, Math.round((parseFloat(c.marginBottom) || 0) * 15));
      o.push('<w:spacing w:before="' + (extra.cellule ? 0 : av) + '" w:after="' + (extra.cellule ? 0 : ap) + '"/>');
      const gch = Math.round(((extra.cellule ? 0 : parseFloat(c.paddingLeft) || 0) + (extra.retrait || 0)) * 15); if (gch > 0) o.push('<w:ind w:left="' + Math.min(gch, 4000) + '"/>');
      const al = { center: 'center', right: 'right', end: 'right', justify: 'both' }[c.textAlign]; if (al) o.push('<w:jc w:val="' + al + '"/>');
      return '<w:pPr>' + o.join('') + '</w:pPr>';
    }
    // contenu en ligne d'un élément → runs
    async function runs(el, out) {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          const c = cs(n.parentElement);
          let t = n.nodeValue; if (!/pre/.test(c.whiteSpace)) t = t.replace(/\s+/g, ' ');
          if (t) out.push(texte(t, c));
        } else if (n.nodeType === 1) {
          if (!visible(n)) continue;
          const tag = n.tagName.toLowerCase();
          if (tag === 'br') { out.push('<w:r><w:br/></w:r>'); continue; }
          if (tag === 'img' || tag === 'svg') { const r = n.getBoundingClientRect(); if (r.width > 4 && r.height > 4) out.push(await imageRun(n, r.width, r.height)); continue; }
          if (/^(input|textarea|select)$/.test(tag)) { const v = tag === 'select' ? (n.selectedOptions[0] || {}).text || '' : (/checkbox|radio/.test(n.type) ? (n.checked ? '[x]' : '[ ]') : n.value); out.push(texte(' ' + v + ' ', cs(n))); continue; }
          if (tag === 'button') continue;
          await runs(n, out);
        }
      }
    }
    const estBloc = (n) => n.nodeType === 1 && visible(n) && (BLOC.test(cs(n).display) || /^(table|ul|ol|li|p|h[1-6]|div|section|article|header|footer|hr)$/i.test(n.tagName) && cs(n).display !== 'inline');
    let sautEnAttente = false;
    async function paragraphe(el, out, extra) {
      const r = []; await runs(el, r);
      const contenu = r.join('');
      const c = cs(el);
      const ex = Object.assign({}, extra || {}); if (sautEnAttente) { ex.saut = true; sautEnAttente = false; }
      if (!contenu && !ex.saut) return;
      out.push('<w:p>' + pPr(c, ex) + contenu + '</w:p>');
    }
    /** Texte en ligne mêlé à des blocs : regroupé sur place dans un bloc anonyme (le style hérité est gardé) */
    function regrouper(el) {
      let grp = null;
      for (const n of [...el.childNodes]) {
        const enLigne = n.nodeType === 3 ? (!!n.nodeValue.trim() || !!grp) : (n.nodeType === 1 && visible(n) && !estBloc(n));
        if (enLigne) {
          if (!grp) { grp = d.createElement('div'); grp.className = 'de-ligne'; grp.style.cssText = 'display:block;margin:0;padding:0;border:0;background:none'; el.insertBefore(grp, n); }
          grp.append(n);
        } else if (n.nodeType === 1) grp = null;
      }
    }
    async function blocs(el, out, ctx) {
      ctx = ctx || {};
      regrouper(el);
      for (const n of [...el.childNodes]) {
        if (n.nodeType !== 1 || !visible(n)) continue;
        if (!estBloc(n)) { await paragraphe(n, out, ctx.p); continue; }
        const c = cs(n), tag = n.tagName.toLowerCase();
        if (/page|always|left|right/.test(c.breakBefore || c.pageBreakBefore) && out.length) sautEnAttente = true;
        if (tag === 'hr') { out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>'); continue; }
        if (n.classList.contains('de-ligne')) { await paragraphe(n, out, ctx.p); continue; }
        if (tag === 'img' || tag === 'svg' || tag === 'canvas') {   // image en bloc (logo, emblème, graphique, QR)
          const rr = n.getBoundingClientRect(); const run = rr.width > 4 && rr.height > 4 ? await imageRun(n, rr.width, rr.height) : '';
          const al = n.parentElement ? cs(n.parentElement).textAlign : '';
          if (run) out.push('<w:p>' + pPr({ textAlign: (c.marginLeft === 'auto' || (parseFloat(c.marginLeft) > 2 && c.marginLeft === c.marginRight)) ? 'center' : al, marginTop: c.marginTop, marginBottom: c.marginBottom, paddingLeft: '0', backgroundColor: 'transparent' }, ctx.p) + run + '</w:p>');
          continue;
        }
        if (/^(input|select|textarea)$/.test(tag)) { const r = []; await runs({ childNodes: [n] }, r); if (r.length) out.push('<w:p>' + pPr(c, ctx.p) + r.join('') + '</w:p>'); continue; }
        if (tag === 'table' || c.display === 'table') { await tableau(n, out); }
        else if (/^h[1-6]$/.test(tag)) { await paragraphe(n, out, { style: 'Titre' + tag[1], garder: true }); }
        else if (tag === 'ul' || tag === 'ol') {
          let i = 1;
          const typeL = (n.getAttribute('type') || '').trim();
          for (const li of [...n.children]) {
            if (!visible(li)) continue;
            const num = i++;
            const puce = tag === 'ol' ? (typeL === 'a' ? String.fromCharCode(96 + ((num - 1) % 26) + 1) + ') ' : typeL === 'A' ? String.fromCharCode(64 + ((num - 1) % 26) + 1) + ') ' : num + '. ') : '\u2022 ';
            li.insertBefore(d.createTextNode(puce), li.firstChild);
            if ([...li.children].some(x => estBloc(x))) await blocs(li, out, { p: { retrait: 18 } });
            else await paragraphe(li, out, { retrait: 18 });
          }
        } else if (/^(flex|inline-flex)$/.test(c.display) && !/column/.test(c.flexDirection) && [...n.children].filter(x => visible(x)).length > 1) {
          await rangee(n, out);
        } else if ([...n.childNodes].some(x => x.nodeType === 1 && estBloc(x))) { await blocs(n, out, ctx); }
        else { await paragraphe(n, out, ctx.p); }
        if (/page|always/.test(c.breakAfter || c.pageBreakAfter)) sautEnAttente = true;
      }
    }
    // éléments côte à côte (signatures, cachets) : tableau sans bordure
    async function rangee(n, out) {
      const kids = [...n.children].filter(x => visible(x)), tot = kids.reduce((s, k) => s + (k.getBoundingClientRect().width || 1), 0);
      const fondR = couleur(cs(n).backgroundColor);
      const cells = [];
      for (const k of kids) {
        const o = []; if ([...k.childNodes].some(x => x.nodeType === 1 && estBloc(x))) await blocs(k, o, { p: { cellule: true } }); else await paragraphe(k, o, { cellule: true });
        const w = Math.round(5000 * (k.getBoundingClientRect().width || 1) / (tot || 1));
        const fond = couleur(cs(k).backgroundColor) || fondR;
        cells.push('<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="pct"/>' + (fond && fond !== 'FFFFFF' ? '<w:shd w:val="clear" w:color="auto" w:fill="' + fond + '"/>' : '') + '<w:vAlign w:val="center"/></w:tcPr>' + (o.join('') || '<w:p/>') + '</w:tc>');
      }
      const grille = kids.map(k => '<w:gridCol w:w="' + Math.max(200, Math.round((k.getBoundingClientRect().width || 40) * 15)) + '"/>').join('');
      out.push('<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid>' + grille + '</w:tblGrid><w:tr>' + cells.join('') + '</w:tr></w:tbl><w:p/>');
    }
    async function tableau(t, out) {
      const rang = (tr) => { const p = tr.parentElement && tr.parentElement.tagName; return p === 'THEAD' ? 0 : p === 'TFOOT' ? 2 : 1; };
      const lignes = [...t.querySelectorAll('tr')].filter(tr => tr.closest('table') === t && visible(tr)).sort((a, b) => rang(a) - rang(b));
      if (!lignes.length) return;
      // tableau de mise en page (une seule colonne, sans bordure) : son contenu est repris tel quel
      const sansBord = (td) => { const c = cs(td); return !(parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none') && !(parseFloat(c.borderLeftWidth) > 0 && c.borderLeftStyle !== 'none'); };
      if (lignes.every(tr => tr.cells.length === 1 && sansBord(tr.cells[0]))) {
        for (const tr of lignes) { const td = tr.cells[0]; if ([...td.childNodes].some(x => x.nodeType === 1 && estBloc(x))) await blocs(td, out); else await paragraphe(td, out); }
        return;
      }
      const largT = t.getBoundingClientRect().width || 1;
      const bord = (() => { const c = lignes[0].cells[0] && cs(lignes[0].cells[0]); return c && parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none'; })();
      const b = bord ? 'single' : 'nil';
      const rows = [];
      for (const tr of lignes) {
        const cells = [];
        for (const td of tr.cells) {
          if (!visible(td)) continue;
          const c = cs(td), o = [];
          if ([...td.childNodes].some(x => x.nodeType === 1 && estBloc(x))) await blocs(td, o, { p: { cellule: true } }); else await paragraphe(td, o, { cellule: true });
          const w = Math.round(5000 * (td.getBoundingClientRect().width || 1) / largT);
          const fond = couleur(c.backgroundColor) || couleur(cs(tr).backgroundColor);
          cells.push('<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="pct"/>' + (td.colSpan > 1 ? '<w:gridSpan w:val="' + td.colSpan + '"/>' : '')
            + (fond && fond !== 'FFFFFF' ? '<w:shd w:val="clear" w:color="auto" w:fill="' + fond + '"/>' : '') + '</w:tcPr>' + (o.join('') || '<w:p/>') + '</w:tc>');
        }
        const entete = tr.parentElement && tr.parentElement.tagName === 'THEAD';
        if (cells.length) rows.push('<w:tr><w:trPr><w:cantSplit/>' + (entete ? '<w:tblHeader/>' : '') + '</w:trPr>' + cells.join('') + '</w:tr>');
      }
      let ref = lignes[0], max = 0;
      for (const tr of lignes) { const nb = [...tr.cells].reduce((s, c) => s + (c.colSpan || 1), 0); if (nb > max) { max = nb; ref = tr; } }
      const grille = []; for (const c of ref.cells) { const w = Math.max(200, Math.round((c.getBoundingClientRect().width || 40) * 15 / (c.colSpan || 1))); for (let j = 0; j < (c.colSpan || 1); j++) grille.push(w); }
      const ex = sautEnAttente ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ''; sautEnAttente = false;
      out.push(ex + '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>'
        + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => '<w:' + k + ' w:val="' + b + '" w:sz="4" w:space="0" w:color="777777"/>').join('')
        + '</w:tblBorders><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + grille.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' + rows.join('') + '</w:tbl><w:p/>');
    }
    return { blocs, medias };
  }
  async function docx(s) {
    const P = s.page, M = P.marges, largeur = Math.max(200, P.w - M.l - M.r);
    const ifr = await cadre(s, largeur);
    try {
      const d = ifr.contentDocument, Wd = Word(d, s.base), out = [];
      await Wd.blocs(d.body, out);
      // filigrane (nom du titulaire…) et pied fixes : repris en fin de document
      const fixes = [...d.body.querySelectorAll('*')].filter(el => d.defaultView.getComputedStyle(el).position === 'fixed' && d.defaultView.getComputedStyle(el).display !== 'none');
      const tw = (px) => Math.round(px * 15), paysage = P.w > P.h;
      const sect = '<w:sectPr><w:pgSz w:w="' + tw(P.w) + '" w:h="' + tw(P.h) + '"' + (paysage ? ' w:orient="landscape"' : '') + '/>'
        + '<w:pgMar w:top="' + tw(M.t) + '" w:right="' + tw(M.r) + '" w:bottom="' + tw(M.b) + '" w:left="' + tw(M.l) + '" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr>';
      const filigrane = fixes.map(f => f.textContent.trim()).filter(Boolean).join(' — ');
      const corps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>'
        + (out.join('') || '<w:p/>')
        + (filigrane ? '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="98A2B3"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">' + xml(filigrane) + '</w:t></w:r></w:p>' : '')
        + sect + '</w:body></w:document>';
      const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + Wd.medias.map(([nom], i) => '<Relationship Id="rIdImg' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + nom + '"/>').join('') + '</Relationships>';
      const titres = [1, 2, 3, 4, 5, 6].map(i => '<w:style w:type="paragraph" w:styleId="Titre' + i + '"><w:name w:val="heading ' + i + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="' + (i - 1) + '"/></w:pPr></w:style>').join('');
      const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60"/></w:pPr></w:pPrDefault></w:docDefaults>'
        + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' + titres
        + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
      const exts = [...new Set(Wd.medias.map(m => m[2]))];
      const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + exts.map(e => '<Default Extension="' + e + '" ContentType="image/' + (e === 'jpg' ? 'jpeg' : e) + '"/>').join('')
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
      const racine = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xml(s.titre) + '</dc:title><dc:creator>Applications MEMP — Conception : Maître Aimé FACHOLA</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created></cp:coreProperties>';
      return zip([['[Content_Types].xml', types], ['_rels/.rels', racine], ['docProps/core.xml', core], ['word/document.xml', corps], ['word/styles.xml', styles], ['word/_rels/document.xml.rels', rels],
        ...Wd.medias.map(([nom, data]) => ['word/media/' + nom, data])]);
    } finally { ifr.remove(); }
  }

  /* ------------------------------------------------------------------ impression */
  function imprimerInstantane(s, natif) {
    const html = htmlComplet(s);
    if (W0.MempCP && typeof W0.MempCP.imprimerHtml === 'function') {   // application Android : service d'impression
      return (async () => { const s2 = Object.assign({}, s, { css: await cssEnDonnees(s.css, s.base) });
        const d = new DOMParser().parseFromString(htmlComplet(s2), 'text/html');
        for (const img of d.querySelectorAll('img')) { const v = await enDonnees(img.getAttribute('src'), s.base); if (v) img.setAttribute('src', v); }
        W0.MempCP.imprimerHtml(s.titre, '<!doctype html>' + d.documentElement.outerHTML); })();
    }
    const ifr = document.createElement('iframe');
    ifr.setAttribute('data-doc-export-ignore', '');
    ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    document.body.append(ifr);
    ifr.onload = () => { setTimeout(() => { try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } catch (e) { /* rien */ } setTimeout(() => ifr.remove(), 60000); }, 150); };
    ifr.srcdoc = html;
  }

  /* ------------------------------------------------------------------ choix proposé à l'utilisateur */
  const ICONES = {
    pdf: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h1.5a1.5 1.5 0 0 1 0 3H8v-3zm0 3v2M13 13v5h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2h-1z"/></svg>',
    docx: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M7.5 12l1.2 6 1.8-4.5 1.8 4.5 1.2-6"/><path d="M16 15l1.5 1.5L20 14"/></svg>',
    imprimer: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>'
  };
  function patienter(doc, texte) {
    const v = doc.createElement('div');
    v.className = 'de-voile'; v.setAttribute('data-doc-export-ignore', '');
    v.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(16,24,40,.45);display:flex;align-items:center;justify-content:center;font:15px system-ui,Arial,sans-serif';
    v.innerHTML = '<div style="background:#fff;color:#1D2939;border-radius:12px;padding:18px 22px;max-width:90vw;box-shadow:0 12px 40px rgba(0,0,0,.3)"><b class="de-txt">' + ech(texte) + '</b></div>';
    (doc.body || doc.documentElement).append(v);
    return { maj: (t) => { const b = v.querySelector('.de-txt'); if (b) b.textContent = t; }, fin: () => v.remove() };
  }
  async function executer(mode, s, o) {
    o = o || {};
    const doc = o.doc || document;
    if (mode === 'imprimer') { imprimerInstantane(s, o.natif); return true; }
    const p = patienter(doc, mode === 'pdf' ? 'Préparation du PDF…' : 'Préparation du document Word…');
    try {
      const blob = mode === 'pdf' ? await pdf(s, (i, n) => p.maj('Préparation du PDF… page ' + i + ' / ' + n)) : await docx(s);
      telechargerBlob(blob, o.nom || nomFichier(s.titre, mode), doc);
      p.maj(W0.MempCP ? 'Fichier enregistré dans Téléchargements.' : 'Fichier téléchargé.');
      await attendre(900);
      return true;
    } catch (e) {
      console.error(e);
      p.maj('Le fichier n’a pas pu être préparé : ' + (e && e.message || e) + '. Utilisez « Imprimer ».');
      await attendre(2600);
      return false;
    } finally { p.fin(); }
  }
  function dialogue(s, o) {
    o = o || {};
    const doc = o.doc || document;
    // fenêtre d'impression sans réglage d'écran mobile : la boîte de choix serait minuscule sur téléphone
    try { if (doc.head && !doc.querySelector('meta[name="viewport"]')) { const m = doc.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1'; m.setAttribute('data-doc-export-ignore', ''); doc.head.append(m); } } catch (e) { /* rien */ }
    return new Promise((fini) => {
      const v = doc.createElement('div');
      v.className = 'de-voile'; v.setAttribute('data-doc-export-ignore', ''); v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', 'Télécharger ou imprimer');
      v.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:rgba(16,24,40,.5);display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto;font:15px system-ui,Arial,sans-serif';
      const bouton = (k, l, aide) => '<button type="button" data-de="' + k + '" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 14px;margin:0 0 8px;border:1px solid #D0D5DD;border-radius:10px;background:' + (k === 'pdf' ? '#1F4E79;color:#fff;border-color:#1F4E79' : '#fff;color:#1D2939') + ';font:inherit;cursor:pointer;min-height:52px">'
        + ICONES[k] + '<span><b style="display:block">' + l + '</b><small style="opacity:.8">' + aide + '</small></span></button>';
      v.innerHTML = '<div style="background:#fff;color:#1D2939;border-radius:14px;width:min(440px,100%);box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden">'
        + '<div style="background:#1F4E79;color:#fff;padding:12px 16px;font-weight:600">' + ech(s.titre) + '</div><div style="padding:14px 16px 8px">'
        + bouton('pdf', 'Télécharger en PDF', 'Fichier prêt à imprimer ou à envoyer (WhatsApp, e-mail)')
        + bouton('docx', 'Télécharger en Word', 'Document modifiable (Word, WPS, Google Docs)')
        + bouton('imprimer', 'Imprimer', 'Imprimante ou « Enregistrer au format PDF » du téléphone')
        + '<button type="button" data-de="annuler" style="width:100%;padding:10px;border:0;background:none;color:#475467;font:inherit;cursor:pointer;min-height:44px">Annuler</button></div></div>';
      const fermer = (r) => { v.remove(); doc.removeEventListener('keydown', echap, true); fini(r); };
      const echap = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fermer(false); } };
      v.addEventListener('click', async (e) => {
        if (e.target === v) return fermer(false);
        const b = e.target.closest && e.target.closest('[data-de]'); if (!b) return;
        const k = b.getAttribute('data-de');
        if (k === 'annuler') return fermer(false);
        v.remove(); doc.removeEventListener('keydown', echap, true);
        fini(await executer(k, s, o));
      });
      doc.addEventListener('keydown', echap, true);
      (doc.body || doc.documentElement).append(v);
      const p = v.querySelector('[data-de="pdf"]'); if (p) p.focus();
    });
  }

  /* ------------------------------------------------------------------ interception de l'impression */
  let prochainMode = null;
  /** Le prochain appel d'impression fera directement ce choix ('pdf' | 'docx' | 'imprimer'), sans boîte de choix. */
  function prochain(mode, nom) { prochainMode = { mode, nom, t: Date.now() }; }
  function prendreMode() { const m = prochainMode; prochainMode = null; return m && Date.now() - m.t < 15000 ? m : null; }
  function finImpression(win) { try { win.dispatchEvent(new win.Event('afterprint')); } catch (e) { /* rien */ } }
  function intercepter(win, natifInitial, docChoix) {
    let natif = natifInitial;
    const remplace = function () {
      const d = win.document;
      let s; try { s = instantaneDocument(d); } catch (e) { console.error(e); return natif && natif.call(win); }
      const m = prendreMode();
      const o = { doc: docChoix || d, natif: natif ? () => natif.call(win) : null, nom: m && m.nom };
      const p = m ? executer(m.mode, s, o) : dialogue(s, o);
      Promise.resolve(p).then(() => finImpression(win));
    };
    try {
      Object.defineProperty(win, 'print', { configurable: true, get: () => remplace, set: (f) => { if (f && f !== remplace) natif = f; } });
    } catch (e) { win.print = remplace; }
    return remplace;
  }
  function installer() {
    intercepter(W0, W0.print ? W0.print.bind(W0) : null);
    // fenêtres d'impression (window.open('') puis document.write) : même choix
    const ouvrir = W0.open;
    W0.open = function (u) {
      const w = ouvrir.apply(W0, arguments);
      const url = String(u || '');
      if (w && (!url || url === 'about:blank')) {
        try { const n = w.print; intercepter(w, n ? n.bind(w) : null); } catch (e) { /* fenêtre d'un autre site */ }
      }
      return w;
    };
  }

  /* ------------------------------------------------------------------ API */
  /** Fragment autonome (il porte ses propres styles, comme les documents du module Pédagogie) : les styles d'écran
      de l'application ne s'y appliquent pas (couleurs de tableaux, tailles de police de l'interface) */
  function telecharger(mode, titre, html, nom) { return executer(mode, instantaneHtml(html, titre, document, /<style[\s>]/i.test(html)), { nom }); }
  function choisir(titre, html) { return dialogue(instantaneHtml(html, titre)); }
  /** Page HTML complète écrite pour l'impression (fenêtre d'impression sur Android) : même choix, ses propres styles seulement */
  function choisirDocument(html, titre) {
    const d = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const styles = [...d.querySelectorAll('style')].map(x => '<style>' + x.textContent + '</style>').join('');
    d.querySelectorAll('style,script').forEach(x => x.remove());
    return dialogue(instantaneHtml(styles + d.body.innerHTML, titre || d.title, document, true));
  }
  global.DocExport = {
    prochain, telecharger, choisir, choisirDocument, installer,
    instantane: (doc, titre) => instantaneDocument(doc || document, titre), instantaneHtml,
    pdf, docx, nomFichier, telechargerBlob, _int: { cssImpression, coupes, fichierPdf, zip, cadre, pagesPdf, svgDe, image }
  };
  installer();
})(typeof window !== 'undefined' ? window : this);
