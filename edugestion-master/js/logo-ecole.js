/* Logo et devise de l'école — générateur commun (CS Pobè, Mon école, MEMP-CP, DOSP, MEMP-CP Pobè, ÉduGestion Pro Master / Master ;
   même dessin repris par SCOLARIS et GESCOL, voir outils/lots/spec.md, « Fiches, logos, lis-moi »).
     LogoEcole.svg({ nom, initiales, symbole, couleurs: { c1, c2, c3 }, forme: 'rond' | 'ecusson', devise, taille }) → SVG (texte)
     LogoEcole.svgDe(ecole)    → le logo de l'école (image importée, réglage enregistré, ou logo automatique tiré du nom)
     LogoEcole.entete(ecole)   → bloc HTML « logo + nom + devise » pour l'en-tête des documents de l'école
     LogoEcole.editer({ nom, valeur, devise, surEnregistrer(v) }) → fenêtre de réglage (aperçu, réinitialiser, SVG / PNG)
       v = { cfg, image, devise, png } : à garder dans la fiche de l'école (champs logo_cfg, logo, devise).
     LogoEcole.versPng(svg, taille) → Promise<data URL PNG>
   Dessins au trait originaux, sans émoji. Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.LogoEcole) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Symboles (tracés au trait dans une grille 24 × 24) */
  const SYMBOLES = {
    livre: { l: 'Livre ouvert', d: 'M3 6c3-1.5 6-1.5 9 .5c3-2 6-2 9-.5v12c-3-1.5-6-1.5-9 .5c-3-2-6-2-9-.5z|M12 6.5v12' },
    plume: { l: 'Plume', d: 'M19 4c-7 1-11 6-12 13|M19 4c-1 5-4 9-9 11|M7 17l-2 3|M11 9l3 1|M9 12l3 1' },
    soleil: { l: 'Soleil levant', d: 'M4 17h16|M7 17a5 5 0 0 1 10 0|M12 8V5|M6.5 10.5L4.5 8.5|M17.5 10.5l2-2|M3 13.5h2|M19 13.5h2' },
    epi: { l: 'Épi de maïs', d: 'M12 21V8|M12 8c-2-2-2-4 0-6c2 2 2 4 0 6|M12 12c-3-1-4-3-4-5|M12 12c3-1 4-3 4-5|M12 16c-3-1-5-3-5-5|M12 16c3-1 5-3 5-5' },
    palmier: { l: 'Palmier', d: 'M12 21c0-5 .5-9 1-12|M13 9c-2-3-5-4-8-3|M13 9c2-3 5-4 8-3|M13 9c-3-1-6 0-8 3|M13 9c3-1 6 0 8 3|M13 9c0-3-1-5-3-6|M8 21h9' },
    colombe: { l: 'Colombe', d: 'M4 13c3 0 5-1 7-4c1 3 4 5 9 5c-2 3-5 5-9 5c-3 0-5-2-7-6z|M11 9c-1-3 0-5 2-6c0 2 1 4 3 5|M20 14l2-1|M8 16l-2 3' },
    globe: { l: 'Globe', d: 'c:12,12,8.5|M3.5 12h17|M12 3.5c-3 3-3 14 0 17|M12 3.5c3 3 3 14 0 17|M5.5 7.5h13|M5.5 16.5h13' },
    flambeau: { l: 'Flambeau du savoir', d: 'M10 21h4l1-9H9z|M8 12h8|M12 10c-3-2-2-5 0-8c1 2 3 3 3 5s-1 3-3 3z' },
    etoile: { l: 'Étoile', d: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z' },
    mains: { l: 'Mains unies', d: 'M3 14l4-4 3 2 3-3 3 2 5-3|M3 14l5 5h6l7-7|M10 12l3 3|M13 9l4 4' }
  };
  const DEVISES = ['Travail – Discipline – Réussite', 'Savoir – Discipline – Excellence', 'Apprendre pour servir', 'Union – Travail – Progrès',
    'L’excellence par l’effort', 'Éduquer pour bâtir l’avenir', 'Lire, écrire, compter, réussir', 'Ensemble pour la réussite de chaque enfant',
    'Discipline – Travail – Succès', 'Le savoir, notre richesse'];
  const COULEURS = { c1: '#1F4E79', c2: '#E8B10E', c3: '#1B8A3C' };
  const MOTS_VIDES = /^(EPP|EPM|EPV|EP|EM|EMP|EPRIV|ECOLE|ÉCOLE|COMPLEXE|SCOLAIRE|GROUPE|CS|DE|DU|DES|LA|LE|LES|L|D|ET|PRIMAIRE|MATERNELLE|PUBLIQUE|PRIVEE|PRIVÉE|SAINT|SAINTE)$/i;

  function initialesDe(nom) {
    const mots = String(nom || '').replace(/[’'/().,-]/g, ' ').split(/\s+/).filter(m => m && !MOTS_VIDES.test(m));
    const s = (mots.length ? mots : String(nom || 'École').split(/\s+/)).slice(0, 3).map(m => m[0]).join('');
    return s.toUpperCase() || 'É';
  }
  /** Tracés « d » séparés par « | » ; « c:cx,cy,r » cercle */
  function traces(def, couleur, largeur) {
    return def.split('|').map(t => {
      if (t.startsWith('c:')) { const [cx, cy, r] = t.slice(2).split(',').map(Number); return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>'; }
      return '<path d="' + t + '"/>';
    }).join('').replace(/^/, '<g fill="none" stroke="' + couleur + '" stroke-width="' + largeur + '" stroke-linecap="round" stroke-linejoin="round">') + '</g>';
  }
  let compteur = 0;
  /** Logo de l'école en SVG (rond : nom en haut, devise en bas ; écusson : nom en bandeau, devise sur le ruban) */
  function svg(o) {
    o = o || {};
    const c = Object.assign({}, COULEURS, o.couleurs || {});
    const nom = String(o.nom || 'École').toUpperCase();
    const devise = String(o.devise || '');
    const ini = String(o.initiales || initialesDe(o.nom)).toUpperCase().slice(0, 4);
    const sym = SYMBOLES[o.symbole] ? o.symbole : (o.symbole === 'initiales' ? '' : 'livre');
    const t = o.taille || 400, id = 'le' + (++compteur) + Math.random().toString(36).slice(2, 6);
    const centre = (cx, cy, r) => sym
      ? '<g transform="translate(' + (cx - r * 0.62) + ' ' + (cy - r * 0.78) + ') scale(' + (r * 1.24 / 24) + ')">' + traces(SYMBOLES[sym].d, c.c1, 1.6) + '</g>'
        + '<text x="' + cx + '" y="' + (cy + r * 0.78) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="' + (r * 0.36) + '" fill="' + c.c3 + '">' + esc(ini) + '</text>'
      : '<text x="' + cx + '" y="' + (cy + r * 0.3) + '" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="' + (r * (ini.length > 2 ? 0.66 : 0.86)) + '" fill="' + c.c1 + '">' + esc(ini) + '</text>';
    if (o.forme === 'ecusson') {
      const fs = Math.max(16, Math.min(34, 520 / Math.max(8, nom.length)));
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="' + t + '" height="' + t + '" role="img" aria-label="Logo ' + esc(o.nom || '') + '">'
        + '<path d="M60 40h280v150c0 95-70 150-140 180C130 340 60 285 60 190z" fill="' + c.c1 + '"/>'
        + '<path d="M75 55h250v135c0 82-60 130-125 157C135 320 75 272 75 190z" fill="none" stroke="' + c.c2 + '" stroke-width="5"/>'
        + '<rect x="75" y="62" width="250" height="52" fill="' + c.c2 + '"/>'
        + '<text x="200" y="' + (88 + fs * 0.36) + '" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="' + fs + '" fill="' + c.c1 + '">' + esc(nom) + '</text>'
        + '<circle cx="200" cy="205" r="72" fill="#fff" stroke="' + c.c2 + '" stroke-width="5"/>' + centre(200, 205, 66)
        + (devise ? '<path d="M40 300q160 40 320 0v34q-160 40-320 0z" fill="#fff" stroke="' + c.c2 + '" stroke-width="3"/>'
          + '<path id="' + id + 'r" d="M48 322q152 36 304 0" fill="none"/><text font-family="Arial,sans-serif" font-weight="700" font-size="' + Math.max(11, Math.min(17, 420 / Math.max(10, devise.length))) + '" fill="' + c.c1 + '" text-anchor="middle"><textPath href="#' + id + 'r" startOffset="50%">' + esc(devise) + '</textPath></text>' : '')
        + '</svg>';
    }
    const fsN = Math.max(18, Math.min(40, 760 / Math.max(10, nom.length)));
    const fsD = Math.max(12, Math.min(24, 640 / Math.max(12, devise.length)));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="' + t + '" height="' + t + '" role="img" aria-label="Logo ' + esc(o.nom || '') + '">'
      + '<defs><path id="' + id + 'h" d="M52 200A148 148 0 0 1 348 200"/><path id="' + id + 'b" d="M44 200A156 156 0 0 0 356 200"/></defs>'
      + '<circle cx="200" cy="200" r="196" fill="' + c.c1 + '"/><circle cx="200" cy="200" r="186" fill="none" stroke="' + c.c2 + '" stroke-width="4"/>'
      + '<circle cx="200" cy="200" r="104" fill="#fff" stroke="' + c.c2 + '" stroke-width="6"/>'
      + '<text font-family="Arial,sans-serif" font-weight="700" font-size="' + fsN + '" letter-spacing="2" fill="#fff" text-anchor="middle"><textPath href="#' + id + 'h" startOffset="50%">' + esc(nom) + '</textPath></text>'
      + (devise ? '<text font-family="Arial,sans-serif" font-weight="700" font-size="' + fsD + '" fill="' + c.c2 + '" text-anchor="middle"><textPath href="#' + id + 'b" startOffset="50%">' + esc(devise.toUpperCase()) + '</textPath></text>' : '')
      + '<circle cx="34" cy="200" r="6" fill="' + c.c2 + '"/><circle cx="366" cy="200" r="6" fill="' + c.c2 + '"/>'
      + centre(200, 200, 96) + '</svg>';
  }
  const lireCfg = (e) => { let x = e && e.logo_cfg; if (typeof x === 'string') { try { x = JSON.parse(x); } catch (err) { x = null; } } return x && typeof x === 'object' ? x : {}; };
  /** Logo de l'école : image importée, sinon réglage enregistré, sinon logo automatique tiré du nom */
  function svgDe(e, taille) {
    e = e || {}; const cfg = lireCfg(e);
    if (cfg.image) return '<img src="' + esc(cfg.image) + '" alt="Logo ' + esc(e.nom || '') + '" style="width:' + (taille || 64) + 'px;height:' + (taille || 64) + 'px;object-fit:contain">';
    return svg(Object.assign({ nom: e.nom, devise: cfg.devise_sur_logo === false ? '' : (e.devise || '') }, cfg, { taille: taille || 64 }));
  }
  /** En-tête « logo + nom + devise » des documents de l'école */
  function entete(e, o) {
    if (!e || !e.nom) return '';
    o = o || {};
    return '<div class="le-ent" style="display:flex;align-items:center;justify-content:center;gap:10px;margin:4px 0">'
      + '<span style="flex:0 0 auto;line-height:0">' + svgDe(e, o.taille || 58) + '</span>'
      + '<span style="text-align:left"><b style="font-size:12pt">' + esc(e.nom) + '</b>'
      + (e.devise ? '<br><i style="font-size:9.5pt;color:#444">« ' + esc(e.devise) + ' »</i>' : '') + '</span></div>';
  }
  function versPng(s, taille) {
    return new Promise((ok, ko) => {
      const img = new Image(), n = taille || 600;
      img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); g.drawImage(img, 0, 0, n, n); try { ok(c.toDataURL('image/png')); } catch (e) { ko(e); } };
      img.onerror = ko;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.replace(/width="\d+" height="\d+"/, 'width="' + n + '" height="' + n + '"'));
    });
  }
  function telecharger(nom, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const dataVersBlob = (u) => { const [t, b] = u.split(','); const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: t.split(':')[1].split(';')[0] }); };

  function styles() {
    if (document.getElementById('le-styles')) return;
    const st = document.createElement('style'); st.id = 'le-styles';
    st.textContent = '.le-voile{position:fixed;inset:0;background:rgba(16,24,40,.5);z-index:10050;display:flex;align-items:flex-start;justify-content:center;padding:3vh 8px;overflow:auto}'
      + '.le-boite{background:#fff;color:#1D2939;border-radius:12px;width:min(760px,100%);box-shadow:0 12px 40px rgba(0,0,0,.3);font:14px/1.4 Arial,sans-serif}'
      + '.le-boite header{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#1F4E79;color:#fff;border-radius:12px 12px 0 0}'
      + '.le-boite header h3{margin:0;font-size:16px}.le-boite header button{background:none;border:0;color:#fff;font-size:22px;min-width:36px;min-height:36px;cursor:pointer}'
      + '.le-corps{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:14px;padding:12px 14px}@media(max-width:620px){.le-corps{grid-template-columns:1fr}}'
      + '.le-corps label{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:600;color:#344054;margin:0 0 8px}'
      + '.le-corps input,.le-corps select{font:inherit;padding:7px 8px;border:1px solid #D0D5DD;border-radius:7px;min-height:38px;width:100%;background:#fff;color:#1D2939}'
      + '.le-corps input[type=color]{padding:2px;width:56px}.le-coul{display:flex;gap:10px;flex-wrap:wrap}.le-coul label{flex-direction:row;align-items:center;gap:6px}'
      + '.le-ap{display:flex;align-items:center;justify-content:center;min-height:210px;border:1px dashed #D0D5DD;border-radius:10px;background:#F8FAFC}'
      + '.le-syms{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}.le-syms button{border:1px solid #D0D5DD;background:#fff;border-radius:8px;padding:4px;min-width:44px;min-height:44px;cursor:pointer}'
      + '.le-syms button.on{border-color:#1F4E79;background:#E8EEF5}.le-syms svg{width:28px;height:28px}'
      + '.le-boite footer{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:10px 14px;border-top:1px solid #D0D5DD}'
      + '.le-btn{border:1px solid #D0D5DD;background:#fff;color:#1D2939;border-radius:8px;padding:8px 12px;font:inherit;cursor:pointer;min-height:38px}.le-btn.p{background:#1F4E79;color:#fff;border-color:#1F4E79}.le-btn.d{color:#B42318;border-color:#FDA29B}';
    document.head.append(st);
  }
  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v == null || v === false) return; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v); });
    (kids || []).forEach(c => c != null && e.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return e;
  }
  /** Fenêtre de réglage du logo et de la devise */
  function editer(o) {
    styles();
    const depart = Object.assign({ forme: 'rond', symbole: 'livre', initiales: '', couleurs: Object.assign({}, COULEURS), image: '' }, lireCfg({ logo_cfg: o.valeur }));
    let cfg = JSON.parse(JSON.stringify(depart));
    let devise = o.devise || '';
    const nom = o.nom || 'École';
    const ap = el('div', { class: 'le-ap', 'data-le': 'apercu' });
    const courant = () => cfg.image ? '<img src="' + esc(cfg.image) + '" alt="Logo importé" style="max-width:200px;max-height:200px">' : svg(Object.assign({}, cfg, { nom, devise: cfg.devise_sur_logo === false ? '' : devise, taille: 200 }));
    const maj = () => { ap.innerHTML = courant(); [...syms.children].forEach(b => b.classList.toggle('on', b.dataset.s === cfg.symbole)); };
    const forme = el('select', { 'aria-label': 'Forme', 'data-le': 'forme', onchange: () => { cfg.forme = forme.value; maj(); } }, [el('option', { value: 'rond' }, ['Rond (nom en couronne)']), el('option', { value: 'ecusson' }, ['Écusson (bandeau et ruban)'])]);
    forme.value = cfg.forme;
    const syms = el('div', { class: 'le-syms', role: 'group', 'aria-label': 'Symbole' });
    Object.entries(SYMBOLES).concat([['initiales', { l: 'Initiales seules', d: '' }]]).forEach(([k, s]) => syms.append(el('button', { type: 'button', title: s.l, 'aria-label': s.l, 'data-s': k, onclick: () => { cfg.symbole = k; maj(); },
      html: s.d ? '<svg viewBox="0 0 24 24">' + traces(s.d, '#1F4E79', 1.7) + '</svg>' : '<b style="font:900 13px Arial">ABC</b>' })));
    const ini = el('input', { type: 'text', value: cfg.initiales || initialesDe(nom), maxlength: '4', 'aria-label': 'Initiales', 'data-le': 'initiales', 'data-geo': 'aucun', oninput: () => { cfg.initiales = ini.value.trim(); maj(); } });
    const dev = el('input', { type: 'text', value: devise, maxlength: '70', placeholder: 'Ex. : Travail – Discipline – Réussite', 'aria-label': 'Devise', 'data-le': 'devise', 'data-geo': 'aucun', oninput: () => { devise = dev.value.trim(); maj(); } });
    // suggestions : liste à part (le champ reste libre pour écrire sa propre devise)
    const liste = el('select', { 'aria-label': 'Suggestions de devise', 'data-le': 'suggestions', onchange: () => { if (liste.value) { dev.value = liste.value; devise = liste.value; maj(); } liste.value = ''; } },
      [el('option', { value: '' }, ['Suggestions de devise…'])].concat(DEVISES.map(d => el('option', { value: d }, [d]))));
    const surLogo = el('input', { type: 'checkbox', checked: cfg.devise_sur_logo !== false, style: 'width:auto;min-height:0', onchange: () => { cfg.devise_sur_logo = surLogo.checked; maj(); } });
    const coul = ['c1', 'c2', 'c3'].map(k => { const i = el('input', { type: 'color', value: cfg.couleurs[k] || COULEURS[k], 'aria-label': { c1: 'Couleur du fond', c2: 'Couleur des filets et de la devise', c3: 'Couleur des initiales' }[k], oninput: () => { cfg.couleurs[k] = i.value; maj(); } });
      return el('label', {}, [i, { c1: 'Fond', c2: 'Filets', c3: 'Initiales' }[k]]); });
    const fichier = el('input', { type: 'file', accept: 'image/*', 'aria-label': 'Importer un logo', onchange: () => {
      const f = fichier.files && fichier.files[0]; if (!f) return; const r = new FileReader();
      r.onload = () => { const img = new Image(); img.onload = () => { const m = 360, k = Math.min(1, m / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cfg.image = c.toDataURL('image/png'); maj(); }; img.src = r.result; };
      r.readAsDataURL(f); } });
    const fermer = () => voile.remove();
    const pied = el('footer', {}, [
      el('button', { type: 'button', class: 'le-btn d', 'data-le': 'reinitialiser', onclick: () => { cfg = { forme: 'rond', symbole: 'livre', initiales: initialesDe(nom), couleurs: Object.assign({}, COULEURS), image: '' }; forme.value = 'rond'; ini.value = cfg.initiales; coul.forEach((l, i) => { l.firstChild.value = Object.values(COULEURS)[i]; }); maj(); } }, ['Réinitialiser']),
      el('button', { type: 'button', class: 'le-btn', 'data-le': 'svg', onclick: () => { if (cfg.image) telecharger('logo-ecole.png', dataVersBlob(cfg.image)); else telecharger('logo-' + nom.replace(/[^\w]+/g, '-') + '.svg', new Blob([svg(Object.assign({}, cfg, { nom, devise: cfg.devise_sur_logo === false ? '' : devise, taille: 600 }))], { type: 'image/svg+xml' })); } }, ['Télécharger SVG']),
      el('button', { type: 'button', class: 'le-btn', 'data-le': 'png', onclick: async () => { const u = cfg.image || await versPng(svg(Object.assign({}, cfg, { nom, devise: cfg.devise_sur_logo === false ? '' : devise })), 800); telecharger('logo-' + nom.replace(/[^\w]+/g, '-') + '.png', dataVersBlob(u)); } }, ['Télécharger PNG']),
      el('button', { type: 'button', class: 'le-btn', onclick: fermer }, ['Annuler']),
      el('button', { type: 'button', class: 'le-btn p', 'data-le': 'enregistrer', onclick: async () => {
        let png = cfg.image || '';
        if (!png) { try { png = await versPng(svg(Object.assign({}, cfg, { nom, devise: cfg.devise_sur_logo === false ? '' : devise })), 300); } catch (e) { png = ''; } }
        fermer(); o.surEnregistrer && o.surEnregistrer({ cfg: JSON.parse(JSON.stringify(cfg)), image: cfg.image || '', devise, png });
      } }, ['Enregistrer'])]);
    const voile = el('div', { class: 'le-voile', onclick: (e) => { if (e.target === voile) fermer(); } }, [
      el('div', { class: 'le-boite', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Logo et devise de l’école', 'data-le': 'editeur' }, [
        el('header', {}, [el('h3', {}, ['Logo et devise — ' + nom]), el('button', { type: 'button', 'aria-label': 'Fermer', onclick: fermer }, ['×'])]),
        el('div', { class: 'le-corps' }, [
          el('div', {}, [
            el('label', {}, ['Devise de l’école', dev]), el('label', {}, [liste]),
            el('label', { style: 'flex-direction:row;align-items:center;gap:6px' }, [surLogo, 'Écrire la devise sur le logo']),
            el('label', {}, ['Forme', forme]),
            el('div', { style: 'font-size:12px;font-weight:600;color:#344054;margin:0 0 4px' }, ['Symbole au centre']), syms,
            el('label', {}, ['Initiales', ini]),
            el('div', { class: 'le-coul' }, coul),
            el('label', {}, ['Ou importer votre propre logo (image)', fichier]),
            cfg.image ? el('button', { type: 'button', class: 'le-btn d', onclick: () => { cfg.image = ''; maj(); } }, ['Retirer l’image importée']) : null]),
          el('div', {}, [ap, el('p', { style: 'font-size:12px;color:#667085' }, ['Le logo et la devise figurent en tête des documents de l’école.'])])]),
        pied])]);
    document.body.append(voile); maj();
    return fermer;
  }
  global.LogoEcole = { svg, svgDe, entete, editer, versPng, initialesDe, SYMBOLES, DEVISES, COULEURS };
})(typeof window !== 'undefined' ? window : globalThis);
